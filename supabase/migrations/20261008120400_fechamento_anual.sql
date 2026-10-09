-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 21 · Fechamento anual e posição financeira numa data de corte
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T10 (R61, R62, R63).
--
--   · A posição em 31/12 não é a soma dos doze meses nem a situação de hoje:
--     uma parcela de dezembro paga em janeiro estava VENCIDA em 31/12.
--     posicao_financeira_em(corte) olha só o que existia e valia naquela data
--     — recebimentos e ajustes até o corte, parcelas ainda não renegociadas
--     nem canceladas, contratos ainda não cancelados.
--   · O ano fecha depois dos doze meses fechados. A foto aprovada é uma
--     VERSÃO imutável; reabrir e fechar de novo cria outra, sem apagar a
--     anterior.
--   · Ano fechado bloqueia qualquer lançamento com data nele, como o mês.
--   · Fechar e gravar usam a mesma trava do período: quem grava pega a trava
--     compartilhada do mês; quem fecha, a exclusiva. Ninguém escapa entre
--     "conferi que está aberto" e "gravei".

create table public.fechamentos_anuais (
  id                uuid primary key default gen_random_uuid(),
  ano               smallint not null unique check (ano between 2000 and 2200),
  fechado           boolean not null default false,
  versao            integer not null default 0,
  fechado_em        timestamptz,
  fechado_por       uuid,
  reaberto_em       timestamptz,
  reaberto_por      uuid,
  motivo_reabertura text,
  criado_em         timestamptz not null default now(),
  criado_por        uuid,
  alterado_em       timestamptz,
  alterado_por      uuid
);
select privado.aplicar_padrao('public.fechamentos_anuais');

create table public.fechamentos_anuais_versoes (
  id             uuid primary key default gen_random_uuid(),
  fechamento_id  uuid not null references public.fechamentos_anuais (id),
  versao         integer not null,
  corte          date not null,
  -- Qual regra de cálculo gerou a foto: muda a fórmula, muda a versão.
  regra          text not null,
  foto           jsonb not null,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  alterado_em    timestamptz,
  alterado_por   uuid,
  unique (fechamento_id, versao)
);
select privado.aplicar_padrao('public.fechamentos_anuais_versoes');

-- A foto aprovada não muda (nem pelo dono da tabela).
create function privado.foto_imutavel()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'A foto de um fechamento aprovado não muda. Reabra e feche de novo: nasce outra versão.'
    using errcode = 'P0001';
end
$$;
create trigger b_imutavel before update on public.fechamentos_anuais_versoes
  for each row execute function privado.foto_imutavel();

-- -----------------------------------------------------------------------------
-- Período aberto: mês e ano, com a trava compartilhada do período
-- -----------------------------------------------------------------------------
create or replace function privado.exigir_mes_aberto(p_data date)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ano integer;
  v_mes integer;
begin
  if p_data is null then
    return;
  end if;
  v_ano := extract(year from p_data)::integer;
  v_mes := extract(month from p_data)::integer;
  perform pg_advisory_xact_lock_shared(hashtext('fhl.periodo'), v_ano * 100 + v_mes);

  if exists (
    select 1 from public.fechamentos f
     where f.competencia = privado.inicio_mes(p_data) and f.fechado
  ) then
    raise exception 'O mês % está fechado. Para mudar um lançamento dele, o administrador precisa reabrir o fechamento.',
      to_char(p_data, 'MM/YYYY') using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fechamentos_anuais fa where fa.ano = v_ano and fa.fechado) then
    raise exception 'O exercício de % está fechado. Para mudar um lançamento dele, o administrador precisa reabrir o ano.',
      v_ano using errcode = 'P0001';
  end if;
end
$$;

-- Trava exclusiva de um mês (fechar) — mesma chave da compartilhada.
create function privado.travar_mes(p_mes date)
returns void
language sql volatile set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('fhl.periodo'),
                               extract(year from p_mes)::integer * 100 + extract(month from p_mes)::integer)
$$;

create or replace function public.fechar_mes(p_competencia date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes    date := privado.inicio_mes(p_competencia);
  v_previa jsonb;
  v_id     uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador fecha o mês.' using errcode = '42501';
  end if;
  if v_mes > privado.inicio_mes(privado.hoje()) then
    raise exception 'Não dá para fechar um mês que ainda não começou.' using errcode = 'P0001';
  end if;

  perform privado.travar_mes(v_mes);
  perform public.gerar_contas_do_mes(v_mes);
  v_previa := public.previa_fechamento(v_mes);

  insert into public.fechamentos (competencia, fechado, totais, divisao, pendencias, fechado_em, fechado_por)
  values (v_mes, true, v_previa -> 'totais', v_previa -> 'divisao', v_previa -> 'pendencias',
          now(), privado.meu_membro_id())
  on conflict (competencia) do update
     set fechado     = true,
         totais      = excluded.totais,
         divisao     = excluded.divisao,
         pendencias  = excluded.pendencias,
         fechado_em  = excluded.fechado_em,
         fechado_por = excluded.fechado_por
   where not public.fechamentos.fechado
  returning id into v_id;

  if v_id is null then
    raise exception 'Este mês já está fechado.' using errcode = 'P0001';
  end if;

  return v_previa;
end
$$;

create or replace function public.reabrir_mes(p_competencia date, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador reabre o mês.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fechamentos_anuais fa
              where fa.ano = extract(year from p_competencia) and fa.fechado) then
    raise exception 'O exercício de % está fechado. Reabra o ano antes de reabrir um mês dele.',
      extract(year from p_competencia) using errcode = 'P0001';
  end if;

  perform privado.travar_mes(privado.inicio_mes(p_competencia));
  update public.fechamentos
     set fechado = false,
         reaberto_em = now(),
         reaberto_por = privado.meu_membro_id(),
         motivo_reabertura = btrim(p_motivo)
   where competencia = privado.inicio_mes(p_competencia) and fechado;

  if not found then
    raise exception 'Este mês não está fechado.' using errcode = 'P0001';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Posição financeira numa data de corte
-- -----------------------------------------------------------------------------

-- O contrato existia no corte? Vale a data de formalização; sem ela, a data
-- do cadastro. (Contrato de 2025 lançado no sistema em 2026 existia em 2025.)
create function privado.contrato_existia(c public.contratos, p_corte date)
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(c.data_contrato, (c.criado_em at time zone 'America/Sao_Paulo')::date) <= p_corte
     and (c.cancelado_em is null or (c.cancelado_em at time zone 'America/Sao_Paulo')::date > p_corte)
$$;

-- A parcela valia no corte? Do plano original, se o contrato existia; de uma
-- renegociação ou de êxito apurado, se já tinha sido criada. E ainda não
-- tinha sido renegociada nem cancelada.
create function privado.parcela_vigente(p public.parcelas, c public.contratos, p_corte date)
returns boolean
language sql stable set search_path = ''
as $$
  select privado.contrato_existia(c, p_corte)
     and case
           when p.origem_renegociacao_id is not null then
             (select (r.criado_em at time zone 'America/Sao_Paulo')::date from public.renegociacoes r
               where r.id = p.origem_renegociacao_id) <= p_corte
           when c.tipo_honorario = 'exito' then (p.criado_em at time zone 'America/Sao_Paulo')::date <= p_corte
           else true
         end
     and (p.cancelado_em is null or (p.cancelado_em at time zone 'America/Sao_Paulo')::date > p_corte)
     and (p.renegociacao_id is null
          or (select (r.criado_em at time zone 'America/Sao_Paulo')::date from public.renegociacoes r
               where r.id = p.renegociacao_id) > p_corte)
$$;

create function public.posicao_financeira_em(p_corte date)
returns table (
  contrato_id uuid, codigo text, cliente_id uuid, cliente_nome text, descricao text,
  tipo_honorario text, valor_total numeric, exigivel numeric, recebido_principal numeric,
  encargos_recebidos numeric, ajustes numeric, saldo_vencido numeric, saldo_futuro numeric,
  saldo numeric, parcelas_vencidas integer, proximo_vencimento date, situacao text)
language sql stable security invoker set search_path = ''
as $$
  with por_parcela as (
    select p.id, p.contrato_id, p.vencimento, p.valor,
           coalesce((select sum(case when a.tipo = 'acrescimo' then a.valor else -a.valor end)
                       from public.ajustes_financeiros a
                      where a.parcela_id = p.id and a.estornado_em is null and a.data <= p_corte), 0) as ajuste,
           coalesce((select sum(r.valor_principal) from public.recebimentos r
                      where r.parcela_id = p.id and r.estornado_em is null and r.data <= p_corte), 0) as principal,
           coalesce((select sum(r.valor_encargos) from public.recebimentos r
                      where r.parcela_id = p.id and r.estornado_em is null and r.data <= p_corte), 0) as encargos
      from public.parcelas p
      join public.contratos c on c.id = p.contrato_id
     where privado.parcela_vigente(p, c, p_corte)
  )
  select c.id, c.codigo, c.cliente_id, cl.nome, c.descricao, c.tipo_honorario, c.valor_total,
         coalesce(sum(pp.valor + pp.ajuste), 0),
         coalesce(sum(pp.principal), 0),
         coalesce(sum(pp.encargos), 0),
         coalesce(sum(pp.ajuste), 0),
         coalesce(sum(greatest(pp.valor + pp.ajuste - pp.principal, 0)) filter (where pp.vencimento <= p_corte), 0),
         coalesce(sum(greatest(pp.valor + pp.ajuste - pp.principal, 0)) filter (where pp.vencimento > p_corte), 0),
         coalesce(sum(greatest(pp.valor + pp.ajuste - pp.principal, 0)), 0),
         (count(*) filter (where pp.vencimento <= p_corte and pp.valor + pp.ajuste - pp.principal > 0))::integer,
         min(pp.vencimento) filter (where pp.vencimento > p_corte and pp.valor + pp.ajuste - pp.principal > 0),
         case
           when count(pp.id) = 0 then case when c.tipo_honorario = 'exito' then 'a_apurar' else 'sem_parcelas' end
           when sum(greatest(pp.valor + pp.ajuste - pp.principal, 0)) = 0 then 'quitado'
           when count(*) filter (where pp.vencimento <= p_corte and pp.valor + pp.ajuste - pp.principal > 0) > 0 then 'com_pendencia'
           else 'em_dia'
         end
    from public.contratos c
    join public.clientes cl on cl.id = c.cliente_id
    left join por_parcela pp on pp.contrato_id = c.id
   where privado.contrato_existia(c, p_corte)
   group by c.id, cl.nome
   order by cl.nome, c.codigo
$$;

-- -----------------------------------------------------------------------------
-- Prévia, fechamento e reabertura do ano
-- -----------------------------------------------------------------------------
create function public.previa_fechamento_anual(p_ano integer)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_de      date := make_date(p_ano, 1, 1);
  v_corte   date := make_date(p_ano, 12, 31);
  v_meses   jsonb;
  v_abertos jsonb;
  v_totais  jsonb;
  v_posicao jsonb;
  v_pend    jsonb;
  v_exig    numeric;
  v_receb   numeric;
begin
  if not privado.financeiro_fechamento_le() then
    raise exception 'Sem permissão para ver o fechamento.' using errcode = '42501';
  end if;

  -- Mês a mês: caixa (recebido e pago) e se o mês está fechado.
  select jsonb_agg(jsonb_build_object(
           'competencia', m.mes,
           'fechado', coalesce(f.fechado, false),
           'entradas', s.entradas,
           'saidas', s.saidas,
           'resultado', s.entradas - s.saidas) order by m.mes),
         coalesce(jsonb_agg(m.mes order by m.mes) filter (where not coalesce(f.fechado, false)), '[]'::jsonb)
    into v_meses, v_abertos
    from (select (v_de + make_interval(months => g))::date as mes from generate_series(0, 11) g) m
    left join public.fechamentos f on f.competencia = m.mes
    join public.serie_mensal(v_corte, 12) s on s.competencia = m.mes;

  -- Coorte da taxa de recebimento: parcelas vigentes que venceram no ano.
  -- Numerador: principal recebido delas até o corte. Denominador: o que elas
  -- exigiam. Sem parcela vencida no ano, a taxa "não se aplica".
  with vigentes as (
    select p.id, p.vencimento, p.valor,
           coalesce((select sum(case when a.tipo = 'acrescimo' then a.valor else -a.valor end)
                       from public.ajustes_financeiros a
                      where a.parcela_id = p.id and a.estornado_em is null and a.data <= v_corte), 0) as ajuste,
           coalesce((select sum(r.valor_principal) from public.recebimentos r
                      where r.parcela_id = p.id and r.estornado_em is null and r.data <= v_corte), 0) as principal
      from public.parcelas p
      join public.contratos c on c.id = p.contrato_id
     where p.vencimento between v_de and v_corte
       and privado.parcela_vigente(p, c, v_corte)
  )
  select coalesce(sum(valor + ajuste), 0), coalesce(sum(least(principal, valor + ajuste)), 0)
    into v_exig, v_receb
    from vigentes;

  select jsonb_agg(to_jsonb(x)) into v_posicao from public.posicao_financeira_em(v_corte) x;

  select jsonb_build_object(
           'receitas_previstas', v_exig,
           'receitas_recebidas', coalesce((select sum(r.valor) from public.recebimentos r
                                            where r.estornado_em is null and r.data between v_de and v_corte), 0),
           'despesas_previstas', coalesce((select sum(c.valor) from public.contas c
                                            where c.cancelado_em is null and c.competencia between v_de and v_corte), 0),
           'despesas_pagas', coalesce((select sum(p.valor) from public.pagamentos_despesa p
                                        where p.estornado_em is null and p.data between v_de and v_corte), 0),
           'vencido_no_corte', coalesce((select sum((x ->> 'saldo_vencido')::numeric) from jsonb_array_elements(coalesce(v_posicao, '[]'::jsonb)) x), 0),
           'a_vencer_no_corte', coalesce((select sum((x ->> 'saldo_futuro')::numeric) from jsonb_array_elements(coalesce(v_posicao, '[]'::jsonb)) x), 0),
           'contratos_com_pendencia', (select count(*) from jsonb_array_elements(coalesce(v_posicao, '[]'::jsonb)) x
                                        where x ->> 'situacao' = 'com_pendencia'),
           'taxa_recebimento', case when v_exig > 0 then round(v_receb * 100 / v_exig, 2) end,
           'taxa_numerador', v_receb,
           'taxa_denominador', v_exig)
    into v_totais;
  v_totais := v_totais || jsonb_build_object(
    'saldo_previsto', (v_totais ->> 'receitas_previstas')::numeric - (v_totais ->> 'despesas_previstas')::numeric,
    'saldo_realizado', (v_totais ->> 'receitas_recebidas')::numeric - (v_totais ->> 'despesas_pagas')::numeric);

  select jsonb_build_object(
           'meses_abertos', v_abertos,
           'contratos_plano_divergente', (select count(*) from public.v_contratos_plano pl where pl.diferenca <> 0),
           'contratos_formalizacao_a_confirmar', (select count(*) from public.contratos c
                                                   where c.data_contrato_origem = 'a_confirmar' and c.cancelado_em is null),
           'recebimentos_sem_conta', (select count(*) from public.recebimentos r
                                       where r.conta_financeira_id is null and r.estornado_em is null
                                         and r.data between v_de and v_corte))
    into v_pend;

  return jsonb_build_object(
    'ano', p_ano,
    'corte', v_corte,
    'regra', 'posicao-corte-2026-10-08',
    'calculado_em', now(),
    'meses', v_meses,
    'totais', v_totais,
    'posicao', coalesce(v_posicao, '[]'::jsonb),
    'pendencias', v_pend);
end
$$;

create function public.fechar_ano(p_ano integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_previa jsonb;
  v_reg    public.fechamentos_anuais;
  m        integer;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador fecha o ano.' using errcode = '42501';
  end if;
  if make_date(p_ano, 12, 31) >= privado.hoje() then
    raise exception 'O ano de % ainda não terminou.', p_ano using errcode = 'P0001';
  end if;

  -- As travas dos doze meses, sempre na mesma ordem.
  for m in 1..12 loop
    perform privado.travar_mes(make_date(p_ano, m, 1));
  end loop;

  v_previa := public.previa_fechamento_anual(p_ano);
  if jsonb_array_length(v_previa #> '{pendencias,meses_abertos}') > 0 then
    raise exception 'Feche antes os meses de % ainda abertos: %.', p_ano,
      (select string_agg(to_char(x::date, 'MM'), ', ') from jsonb_array_elements_text(v_previa #> '{pendencias,meses_abertos}') x)
      using errcode = 'P0001';
  end if;

  insert into public.fechamentos_anuais (ano) values (p_ano) on conflict (ano) do nothing;
  select * into v_reg from public.fechamentos_anuais where ano = p_ano for update;
  if v_reg.fechado then
    raise exception 'O exercício de % já está fechado.', p_ano using errcode = 'P0001';
  end if;

  update public.fechamentos_anuais
     set fechado = true, versao = versao + 1, fechado_em = now(), fechado_por = privado.meu_membro_id()
   where id = v_reg.id;
  insert into public.fechamentos_anuais_versoes (fechamento_id, versao, corte, regra, foto)
  values (v_reg.id, v_reg.versao + 1, make_date(p_ano, 12, 31), v_previa ->> 'regra', v_previa);

  return v_previa || jsonb_build_object('versao', v_reg.versao + 1);
end
$$;

create function public.reabrir_ano(p_ano integer, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador reabre o ano.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;
  -- Reabrir o ano não reabre mês nenhum: cada mês continua fechado até o
  -- administrador reabri-lo, também com motivo.
  update public.fechamentos_anuais
     set fechado = false, reaberto_em = now(), reaberto_por = privado.meu_membro_id(),
         motivo_reabertura = btrim(p_motivo)
   where ano = p_ano and fechado;
  if not found then
    raise exception 'O exercício de % não está fechado.', p_ano using errcode = 'P0001';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.fechamentos_anuais enable row level security;
alter table public.fechamentos_anuais_versoes enable row level security;

create policy "fechamentos_anuais: ver" on public.fechamentos_anuais
  for select to authenticated using ((select privado.financeiro_fechamento_le()) or (select privado.audita()));
create policy "fechamentos_anuais_versoes: ver" on public.fechamentos_anuais_versoes
  for select to authenticated using ((select privado.financeiro_fechamento_le()) or (select privado.audita()));

revoke all on public.fechamentos_anuais, public.fechamentos_anuais_versoes from anon, authenticated;
grant select on public.fechamentos_anuais, public.fechamentos_anuais_versoes to authenticated;
grant all on public.fechamentos_anuais, public.fechamentos_anuais_versoes to service_role;

revoke execute on function
  public.posicao_financeira_em(date), public.previa_fechamento_anual(integer),
  public.fechar_ano(integer), public.reabrir_ano(integer, text)
  from public, anon;
grant execute on function
  public.posicao_financeira_em(date), public.previa_fechamento_anual(integer),
  public.fechar_ano(integer), public.reabrir_ano(integer, text)
  to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.exigir_mes_aberto(date),
  privado.contrato_existia(public.contratos, date), privado.parcela_vigente(public.parcelas, public.contratos, date)
  to authenticated;
