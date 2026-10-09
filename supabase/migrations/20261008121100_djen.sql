-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 28 · Intimações do DJEN: importação, consultas e captura diária
-- =============================================================================
--
-- preparacao-novas-funcoes.md, F6 §10.3–10.7.
--
-- A busca na API pública do CNJ (comunicaapi.pje.jus.br) é feita pelo
-- NAVEGADOR de quem está no escritório: a API só responde a pedidos vindos do
-- Brasil, e o servidor do Supabase pode rodar fora. A tela busca por OAB + UF
-- + período, uma requisição por vez, respeitando o limite do CNJ, e manda o
-- resultado para importar_intimacoes, que:
--
--   · grava cada comunicação uma vez só (o id do DJEN é único);
--   · liga ao processo cadastrado quando o número bate com exatamente um, e
--     ao cliente desse processo;
--   · registra a consulta — quando, quem, período, OABs, quantas vieram,
--     quantas eram novas e se foi completa, parcial ou falhou. É a prova de
--     que o escritório conferiu o diário naquele dia.
--
-- "Captura diária": com config_prazos.busca_automatica ligada, a primeira
-- pessoa com acesso a Prazos que abre o sistema num dia útil dispara a busca
-- desde a última consulta completa. Continua havendo conferência humana
-- antes de virar prazo ou audiência.

create table public.config_prazos (
  id                  uuid primary key default gen_random_uuid(),
  unica               boolean not null default true unique check (unica),
  busca_automatica    boolean not null default true,
  -- Na primeira busca (sem consulta anterior), quantos dias para trás.
  dias_primeira_busca smallint not null default 7 check (dias_primeira_busca between 1 and 31),
  -- Prazo de entrega interno: quantos dias úteis antes do fatal.
  entrega_dias_uteis  smallint not null default 3 check (entrega_dias_uteis between 0 and 30),
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid
);
select privado.aplicar_padrao('public.config_prazos');
insert into public.config_prazos default values;

create function public.importar_intimacoes(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_servico boolean := coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
  v_item    jsonb;
  v_ids     uuid[];
  v_proc    uuid;
  v_cli     uuid;
  v_membro  uuid;
  v_num     text;
  v_link    text;
  v_disp    date;
  v_pub     date;
  v_total   integer := 0;
  v_novas   integer := 0;
  v_qtd     integer;
  v_consulta uuid;
begin
  if not (privado.gerencia_prazos() or v_servico) then
    raise exception 'Seu acesso não inclui as intimações.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p -> 'itens', '[]'::jsonb)) > 5000 then
    raise exception 'Resultado grande demais para uma importação. Busque um período menor.' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) loop
    v_total := v_total + 1;
    v_proc := null;
    v_cli := null;
    v_num := nullif(regexp_replace(coalesce(v_item ->> 'numero_processo', ''), '[^0-9]', '', 'g'), '');
    if v_num !~ '^[0-9]{20}$' then
      v_num := null;
    end if;
    v_link := case when v_item ->> 'link' ~ '^https?://[^[:space:]]+$' then v_item ->> 'link' end;
    v_disp := (v_item ->> 'disponibilizada_em')::date;
    v_pub := nullif(v_item ->> 'publicada_em', '')::date;
    if v_pub < v_disp then
      v_pub := null;
    end if;

    -- Liga ao processo pelo número — só quando há exatamente um.
    if v_num is not null then
      select array_agg(pr.id) into v_ids from public.processos pr where pr.numero = v_num;
      if cardinality(v_ids) = 1 then
        v_proc := v_ids[1];
        select pr.cliente_id into v_cli from public.processos pr where pr.id = v_proc;
      end if;
    end if;

    v_membro := nullif(v_item ->> 'membro_id', '')::uuid;
    if v_membro is not null and not exists (select 1 from public.membros where id = v_membro and ativo) then
      v_membro := null;
    end if;

    insert into public.intimacoes (
      djen_id, djen_hash, fonte, disponibilizada_em, publicada_em, tribunal, orgao,
      tipo_comunicacao, tipo_documento, classe, numero_processo, texto, link,
      destinatarios, advogados, membro_id, processo_id, cliente_id, situacao, observacoes)
    values (
      (v_item ->> 'djen_id')::bigint, left(v_item ->> 'djen_hash', 200), 'djen', v_disp, v_pub,
      left(v_item ->> 'tribunal', 100), left(v_item ->> 'orgao', 300), left(v_item ->> 'tipo_comunicacao', 100),
      left(v_item ->> 'tipo_documento', 100), left(v_item ->> 'classe', 200), v_num,
      coalesce(nullif(left(btrim(v_item ->> 'texto'), 400000), ''), '(comunicação sem teor no DJEN)'), v_link,
      case when jsonb_typeof(v_item -> 'destinatarios') = 'array' then v_item -> 'destinatarios' else '[]'::jsonb end,
      case when jsonb_typeof(v_item -> 'advogados') = 'array' then v_item -> 'advogados' else '[]'::jsonb end,
      v_membro, v_proc, v_cli,
      -- Comunicação cancelada no DJEN entra já arquivada, para constar.
      case when (v_item ->> 'ativo')::boolean is false then 'arquivada' else 'pendente' end,
      case when (v_item ->> 'ativo')::boolean is false then 'Cancelada no DJEN.' end)
    on conflict (djen_id) do nothing;

    get diagnostics v_qtd = row_count;
    v_novas := v_novas + v_qtd;
  end loop;

  insert into public.intimacoes_consultas (de, ate, oabs, encontradas, novas, situacao, detalhe, automatica)
  values ((p -> 'consulta' ->> 'de')::date, (p -> 'consulta' ->> 'ate')::date,
          array(select jsonb_array_elements_text(coalesce(p -> 'consulta' -> 'oabs', '[]'::jsonb))),
          v_total, v_novas, coalesce(p -> 'consulta' ->> 'situacao', 'ok'),
          nullif(left(p -> 'consulta' ->> 'detalhe', 1000), ''),
          v_servico or coalesce((p -> 'consulta' ->> 'automatica')::boolean, false))
  returning id into v_consulta;

  return jsonb_build_object('encontradas', v_total, 'novas', v_novas, 'consulta_id', v_consulta);
end
$$;

-- Contadores do menu e de Hoje: mais as intimações que chegaram hoje do DJEN.
create or replace function public.avisos_do_dia()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
 v_eu uuid := privado.meu_membro_id();
 v jsonb;
begin
 if v_eu is null then return null; end if;
 with classificadas as (
   select coalesce(t.entrega < privado.hoje(), false) or coalesce(t.fatal_em < now(), false) as atrasada,
     coalesce(t.entrega = privado.hoje(), false) or coalesce((t.fatal_em at time zone 'America/Sao_Paulo')::date = privado.hoje(), false) as hoje
   from public.tarefas t where t.responsavel_id = v_eu and t.situacao <> 'concluida' and t.cancelado_em is null
 ) select jsonb_build_object('minhas_atrasadas', count(*) filter (where atrasada),
     'meus_prazos_hoje', count(*) filter (where hoje and not atrasada)) into v from classificadas;
 if privado.edita_clientes() then
   v := v || jsonb_build_object('contatos_novos', (select count(*) from public.contatos where situacao = 'novo'),
     'contatos_site_novos', (select count(*) from public.contatos where situacao = 'novo' and canal = 'site'));
 end if;
 if privado.gerencia_prazos() then
   v := v || jsonb_build_object(
     'intimacoes_pendentes', (select count(*) from public.intimacoes where situacao = 'pendente'),
     'intimacoes_novas_hoje', (select count(*) from public.intimacoes
                                where fonte = 'djen' and situacao = 'pendente'
                                  and (criado_em at time zone 'America/Sao_Paulo')::date = privado.hoje()));
 end if;
 if privado.financeiro_le() then
   v := v || jsonb_build_object('alertas_financeiros', (
     select count(*) from public.v_alertas a where a.estado = 'novo' and a.criado_em > now() - interval '30 days'));
 end if;
 return v;
end;
$$;

alter table public.config_prazos enable row level security;
create policy "config_prazos: ver" on public.config_prazos
  for select to authenticated using ((select privado.gerencia_prazos()));
create policy "config_prazos: alterar" on public.config_prazos
  for update to authenticated
  using ((select privado.gerencia_prazos())) with check ((select privado.gerencia_prazos()));

revoke all on public.config_prazos from anon, authenticated;
grant select on public.config_prazos to authenticated;
grant update (busca_automatica, dias_primeira_busca, entrega_dias_uteis) on public.config_prazos to authenticated;
grant all on public.config_prazos to service_role;

revoke execute on function public.importar_intimacoes(jsonb) from public, anon;
grant execute on function public.importar_intimacoes(jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Publicação informada depois (QA 09/10)
-- -----------------------------------------------------------------------------
-- O cadastro manual aceita a publicação em branco, e gerar prazo exige a
-- data. Sem isto, completar o dado obrigava a cadastrar outra comunicação.
-- Só a intimação manual muda (a do DJEN tem a data calculada na importação),
-- e só enquanto nenhum prazo ativo foi contado a partir dela.
create function privado.validar_publicacao_intimacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.publicada_em is distinct from old.publicada_em then
    if old.fonte <> 'manual' then
      raise exception 'A publicação do DJEN vem da importação e não se altera aqui.' using errcode = 'P0001';
    end if;
    if new.publicada_em is null then
      raise exception 'Informe a data de publicação.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.tarefas where intimacao_id = new.id and cancelado_em is null) then
      raise exception 'Já há prazo contado desta publicação. Cancele o prazo antes de mudar a data.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger d_publicacao before update of publicada_em on public.intimacoes
  for each row execute function privado.validar_publicacao_intimacao();

grant update (publicada_em) on public.intimacoes to authenticated;
