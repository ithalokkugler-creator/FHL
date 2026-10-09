-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 24 · Central de alertas do Financeiro
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T12 (R13, R67). Duas coisas diferentes:
--
--   · PENDÊNCIA CALCULADA — vencimentos, atrasos, conta sem valor, plano que
--     não fecha, contrato perto do fim. Sai da lista quando se resolve (pagou,
--     recebeu, corrigiu). É calculada na hora: não nasce um aviso novo a cada
--     vez que alguém abre a tela.
--   · EVENTO — fechou/reabriu mês ou ano, estornou, mudou acesso de alguém,
--     mudou a configuração. Fica registrado, com estado por pessoa (lido,
--     resolvido, silenciado até uma data). Deduplicado por chave.
--
-- Quem vê o quê é a política: evento do Financeiro para quem lê o
-- Financeiro; de fechamento, para o completo; de segurança, para o
-- administrador e a auditoria. Perder o acesso corta a leitura na hora.
-- Nada é enviado para fora do sistema.

create function public.pendencias_financeiras(p_dias integer default 7)
returns table (tipo text, gravidade text, titulo text, detalhe text, tabela text, registro_id uuid,
               valor numeric, data date, link text)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_hoje date := privado.hoje();
  v_dias integer := least(greatest(coalesce(p_dias, 7), 0), 60);
begin
  if not privado.financeiro_le() then
    return;
  end if;

  return query
  select 'parcela_vencida', 'perigo', vp.cliente_nome,
         coalesce(vp.contrato_codigo || ' · ', '') || vp.contrato_descricao || ' · '
           || case when vp.numero = 0 then 'entrada' else 'parcela ' || vp.numero end
           || ' · ' || vp.dias_atraso || ' dias',
         'parcelas', vp.id, vp.saldo, vp.vencimento, '#/financeiro/contratos/' || vp.contrato_id
    from public.v_parcelas vp where vp.situacao = 'vencida';

  return query
  select 'parcela_a_vencer', case when vp.vence_hoje then 'alerta' else 'info' end, vp.cliente_nome,
         coalesce(vp.contrato_codigo || ' · ', '') || vp.contrato_descricao
           || case when vp.vence_hoje then ' · vence hoje' else '' end,
         'parcelas', vp.id, vp.saldo, vp.vencimento, '#/financeiro/contratos/' || vp.contrato_id
    from public.v_parcelas vp
   where vp.situacao = 'a_vencer' and vp.vencimento <= v_hoje + v_dias;

  return query
  select case when vc.situacao = 'vencida' then 'despesa_vencida' else 'despesa_a_vencer' end,
         case when vc.situacao = 'vencida' then 'perigo' when vc.vence_hoje then 'alerta' else 'info' end,
         vc.descricao,
         vc.categoria_nome || case when vc.parcial then ' · paga em parte' else '' end,
         'contas', vc.id, vc.saldo, vc.vencimento, '#/financeiro/contas?mes=' || vc.competencia
    from public.v_contas vc
   where vc.situacao in ('a_pagar', 'vencida') and vc.vencimento <= v_hoje + v_dias;

  return query
  select 'despesa_sem_valor', 'alerta', vc.descricao, 'Falta informar o valor · ' || vc.categoria_nome,
         'contas', vc.id, null::numeric, vc.vencimento, '#/financeiro/contas?mes=' || vc.competencia
    from public.v_contas vc
   where vc.situacao = 'sem_valor' and vc.competencia <= privado.inicio_mes(v_hoje);

  return query
  select 'plano_divergente', 'perigo', vc.cliente_nome,
         coalesce(vc.codigo || ' · ', '') || vc.descricao || ' · as parcelas não fecham com o valor do contrato',
         'contratos', vc.id, vc.diferenca_plano, null::date, '#/financeiro/contratos/' || vc.id
    from public.v_contratos vc where vc.diferenca_plano <> 0 and vc.ciclo = 'ativo';

  return query
  select 'contrato_terminando', 'alerta', vc.cliente_nome,
         coalesce(vc.codigo || ' · ', '') || vc.descricao || ' · vigência termina em breve',
         'contratos', vc.id, vc.saldo, vc.data_fim, '#/financeiro/contratos/' || vc.id
    from public.v_contratos vc
   where vc.ciclo = 'ativo' and vc.data_fim between v_hoje and v_hoje + 30;

  return query
  select 'formalizacao_a_confirmar', 'info', vc.cliente_nome,
         coalesce(vc.codigo || ' · ', '') || vc.descricao || ' · confirme a data de formalização',
         'contratos', vc.id, null::numeric, null::date, '#/financeiro/contratos/' || vc.id
    from public.v_contratos vc
   where vc.ciclo = 'ativo' and vc.data_contrato_origem = 'a_confirmar';

  return query
  select 'anexo_pendente', 'info', a.descricao, 'Envio não concluído — reenvie o arquivo',
         'anexos', a.id, null::numeric, (v.criado_em at time zone 'America/Sao_Paulo')::date, null::text
    from public.anexos_versoes v join public.anexos a on a.id = v.anexo_id
   where v.estado = 'reservado' and v.criado_em < now() - interval '1 day' and a.cancelado_em is null;

  -- Meses passados com movimento e ainda abertos (só quem vê o fechamento).
  if privado.financeiro_completo() then
    return query
    select 'mes_aberto', 'alerta', 'Fechamento de ' || to_char(m.mes, 'MM/YYYY'),
           'Mês encerrado com lançamentos e ainda não fechado', 'fechamentos', null::uuid, null::numeric, m.mes,
           '#/financeiro/fechamento?mes=' || m.mes
      from (select distinct privado.inicio_mes(r.data) as mes from public.recebimentos r where r.estornado_em is null
            union
            select distinct privado.inicio_mes(p.data) from public.pagamentos_despesa p where p.estornado_em is null) m
     where m.mes < privado.inicio_mes(v_hoje)
       and m.mes >= (privado.inicio_mes(v_hoje) - interval '12 months')::date
       and not exists (select 1 from public.fechamentos f where f.competencia = m.mes and f.fechado);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Eventos
-- -----------------------------------------------------------------------------
create table public.eventos_alerta (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,
  publico      text not null check (publico in ('financeiro', 'completo', 'seguranca')),
  gravidade    text not null default 'info' check (gravidade in ('info', 'alerta', 'perigo')),
  titulo       text not null,
  detalhe      text,
  tabela       text,
  registro_id  uuid,
  -- Mesmo evento produzido de novo (retry) não duplica.
  chave        text not null unique,
  link         text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);
create index eventos_alerta_criado on public.eventos_alerta (criado_em desc);
select privado.aplicar_padrao('public.eventos_alerta');

create table public.alertas_estado (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references public.eventos_alerta (id),
  membro_id      uuid not null references public.membros (id),
  lido_em        timestamptz,
  resolvido_em   timestamptz,
  silenciado_ate date,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  alterado_em    timestamptz,
  alterado_por   uuid,
  unique (evento_id, membro_id)
);
create index alertas_estado_membro on public.alertas_estado (membro_id);
select privado.aplicar_padrao('public.alertas_estado');

create function privado.publicar_evento(p_tipo text, p_publico text, p_gravidade text, p_titulo text,
                                        p_detalhe text, p_tabela text, p_registro uuid, p_chave text, p_link text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.eventos_alerta (tipo, publico, gravidade, titulo, detalhe, tabela, registro_id, chave, link)
  values (p_tipo, p_publico, p_gravidade, p_titulo, p_detalhe, p_tabela, p_registro, p_chave, p_link)
  on conflict (chave) do nothing;
end
$$;

create function privado.evento_fechamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_quem text := coalesce((select m.nome_curto from public.membros m where m.id = privado.meu_membro_id()), 'sistema');
begin
  if tg_table_name = 'fechamentos' and new.fechado is distinct from coalesce(old.fechado, false) then
    perform privado.publicar_evento(
      case when new.fechado then 'mes_fechado' else 'mes_reaberto' end, 'completo',
      case when new.fechado then 'info' else 'alerta' end,
      (case when new.fechado then 'Mês fechado: ' else 'Mês reaberto: ' end) || to_char(new.competencia, 'MM/YYYY'),
      case when new.fechado then 'Por ' || v_quem else 'Por ' || v_quem || '. Motivo: ' || coalesce(new.motivo_reabertura, '—') end,
      'fechamentos', new.id, 'fechamentos:' || new.id || ':' || coalesce(new.fechado_em, now()) || ':' || coalesce(new.reaberto_em::text, ''),
      '#/financeiro/fechamento?mes=' || new.competencia);
  elsif tg_table_name = 'fechamentos_anuais' and new.fechado is distinct from coalesce(old.fechado, false) then
    perform privado.publicar_evento(
      case when new.fechado then 'ano_fechado' else 'ano_reaberto' end, 'completo',
      case when new.fechado then 'info' else 'alerta' end,
      (case when new.fechado then 'Exercício fechado: ' else 'Exercício reaberto: ' end) || new.ano,
      case when new.fechado then 'Versão ' || new.versao || ', por ' || v_quem
           else 'Por ' || v_quem || '. Motivo: ' || coalesce(new.motivo_reabertura, '—') end,
      'fechamentos_anuais', new.id, 'fechamentos_anuais:' || new.id || ':' || new.versao || ':' || new.fechado,
      '#/financeiro/fechamento?aba=anual&ano=' || new.ano);
  end if;
  return null;
end
$$;

create trigger y_evento after insert or update on public.fechamentos
  for each row execute function privado.evento_fechamento();
create trigger y_evento after insert or update on public.fechamentos_anuais
  for each row execute function privado.evento_fechamento();

create function privado.evento_estorno()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estornado_em is not null and old.estornado_em is null then
    perform privado.publicar_evento('estorno', 'financeiro', 'alerta',
      'Estorno de ' || privado.reais(new.valor),
      'Motivo: ' || coalesce(new.motivo_estorno, '—'),
      tg_table_name, new.id, tg_table_name || ':' || new.id || ':estorno', null);
  end if;
  return null;
end
$$;

create trigger y_evento after update on public.recebimentos
  for each row execute function privado.evento_estorno();
create trigger y_evento after update on public.pagamentos_despesa
  for each row execute function privado.evento_estorno();
create trigger y_evento after update on public.transferencias_financeiras
  for each row execute function privado.evento_estorno();

-- Mudança de acesso ou de perfil: só administrador e auditoria veem.
create function privado.evento_acesso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_campos text[];
begin
  select array_agg(k order by k) into v_campos
    from unnest(array['papel', 'ativo', 'email', 'acesso_agenda', 'acesso_financeiro', 'acesso_site',
                      'acesso_clientes', 'acesso_prazos', 'acesso_auditoria']) k
   where tg_op = 'INSERT' or to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
  if v_campos is not null then
    perform privado.publicar_evento('acesso_alterado', 'seguranca', 'alerta',
      case when tg_op = 'INSERT' then 'Membro cadastrado: ' else 'Acesso alterado: ' end || new.nome_curto,
      'Campos: ' || array_to_string(v_campos, ', '),
      'membros', new.id, 'membros:' || new.id || ':' || coalesce(new.alterado_em, new.criado_em), '#/membros');
  end if;
  return null;
end
$$;

create trigger y_evento after insert or update on public.membros
  for each row execute function privado.evento_acesso();

create function privado.evento_configuracao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform privado.publicar_evento('configuracao_alterada', 'seguranca', 'info',
    'Configuração do Financeiro alterada', null, tg_table_name, new.id,
    tg_table_name || ':' || new.id || ':' || coalesce(new.alterado_em, new.criado_em), '#/financeiro/configuracoes');
  return null;
end
$$;

create trigger y_evento after update on public.config_financeiro
  for each row execute function privado.evento_configuracao();

-- Lido, resolvido ou silenciado — de cada pessoa, para si.
create function public.marcar_alerta(p_evento uuid, p_acao text, p_ate date default null)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_eu uuid := privado.meu_membro_id();
begin
  if v_eu is null then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.eventos_alerta e where e.id = p_evento) then
    raise exception 'Alerta não encontrado.' using errcode = 'P0001';
  end if;
  if p_acao not in ('lido', 'resolvido', 'silenciar', 'reabrir') then
    raise exception 'Ação inválida.' using errcode = 'P0001';
  end if;
  insert into public.alertas_estado (evento_id, membro_id, lido_em, resolvido_em, silenciado_ate)
  values (p_evento, v_eu,
          now(),
          case when p_acao = 'resolvido' then now() end,
          case when p_acao = 'silenciar' then coalesce(p_ate, privado.hoje() + 7) end)
  on conflict (evento_id, membro_id) do update
     set lido_em = coalesce(public.alertas_estado.lido_em, now()),
         resolvido_em = case when p_acao = 'resolvido' then now()
                             when p_acao = 'reabrir' then null
                             else public.alertas_estado.resolvido_em end,
         silenciado_ate = case when p_acao = 'silenciar' then coalesce(p_ate, privado.hoje() + 7)
                               when p_acao = 'reabrir' then null
                               else public.alertas_estado.silenciado_ate end;
end
$$;

create view public.v_alertas with (security_invoker = true) as
select e.*, s.lido_em, s.resolvido_em, s.silenciado_ate,
       case when s.resolvido_em is not null then 'resolvido'
            when s.silenciado_ate >= privado.hoje() then 'silenciado'
            when s.lido_em is not null then 'lido'
            else 'novo' end as estado
  from public.eventos_alerta e
  left join public.alertas_estado s on s.evento_id = e.id and s.membro_id = privado.meu_membro_id();

alter table public.eventos_alerta enable row level security;
alter table public.alertas_estado enable row level security;

create policy "eventos_alerta: ver" on public.eventos_alerta
  for select to authenticated
  using (case publico
           when 'financeiro' then (select privado.financeiro_le())
           when 'completo' then (select privado.financeiro_completo())
           else (select privado.audita()) end);
create policy "alertas_estado: ver" on public.alertas_estado
  for select to authenticated using (membro_id = (select privado.meu_membro_id()));
create policy "alertas_estado: incluir" on public.alertas_estado
  for insert to authenticated with check (membro_id = (select privado.meu_membro_id()));
create policy "alertas_estado: alterar" on public.alertas_estado
  for update to authenticated
  using (membro_id = (select privado.meu_membro_id())) with check (membro_id = (select privado.meu_membro_id()));

revoke all on public.eventos_alerta, public.alertas_estado, public.v_alertas from anon, authenticated;
grant select on public.eventos_alerta, public.alertas_estado, public.v_alertas to authenticated;
grant insert (evento_id, membro_id, lido_em, resolvido_em, silenciado_ate),
      update (lido_em, resolvido_em, silenciado_ate) on public.alertas_estado to authenticated;
grant all on public.eventos_alerta, public.alertas_estado, public.v_alertas to service_role;

revoke execute on function public.pendencias_financeiras(integer), public.marcar_alerta(uuid, text, date)
  from public, anon;
grant execute on function public.pendencias_financeiras(integer), public.marcar_alerta(uuid, text, date)
  to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
