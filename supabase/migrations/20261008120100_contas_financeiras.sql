-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 18 · Contas financeiras, transferências, ajustes e encargos discriminados
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T03 (R40, R41, R52, R57, R59).
--
--   · `contas` continua sendo a tabela das DESPESAS do escritório. Onde o
--     dinheiro está — o caixa, a conta corrente, a conta digital — é
--     `contas_financeiras`. Cadastro manual, sem integração bancária e sem
--     senha de banco nenhuma.
--   · Todo recebimento novo indica a conta de destino. Quando a tela não
--     manda, vale a conta padrão (o Caixa) — assim a tela antiga, ainda
--     publicada enquanto esta migração entra, continua funcionando. Os
--     recebimentos antigos ficam sem conta: "origem legada não informada".
--   · Transferência entre contas não é receita nem despesa: tira de uma e põe
--     na outra, no mesmo valor, na mesma transação.
--   · Desconto e abatimento reduzem o que a parcela exige, por evento motivado
--     e autorizado — não são dinheiro recebido. Acréscimo aumenta.
--   · Recebimento novo discrimina multa, juros, correção e acréscimo. Os
--     antigos guardam só o total de encargos e assim continuam.

-- -----------------------------------------------------------------------------
-- Contas financeiras
-- -----------------------------------------------------------------------------
create table public.contas_financeiras (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null unique check (btrim(nome) <> ''),
  tipo            text not null default 'corrente'
                  check (tipo in ('caixa', 'corrente', 'poupanca', 'digital', 'aplicacao', 'outra')),
  -- Só para identificar a conta na tela. Nunca senha, token ou acesso.
  banco           text,
  agencia         text,
  numero          text,
  saldo_inicial   numeric(12,2) not null default 0,
  saldo_inicial_em date,
  -- A conta já escolhida nos formulários de baixa.
  padrao          boolean not null default false,
  observacoes     text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz,
  alterado_por    uuid,
  constraint conta_padrao_ativa check (not padrao or ativo)
);

create unique index contas_financeiras_padrao on public.contas_financeiras (padrao) where padrao;
select privado.aplicar_padrao('public.contas_financeiras');

insert into public.contas_financeiras (nome, tipo, padrao, observacoes)
values ('Caixa do escritório', 'caixa', true,
        'Conta inicial. Cadastre as contas bancárias em Financeiro › Contas financeiras e escolha a padrão.');

-- -----------------------------------------------------------------------------
-- Recebimentos: conta de destino e encargos discriminados
-- -----------------------------------------------------------------------------
alter table public.recebimentos
  add column conta_financeira_id uuid references public.contas_financeiras (id),
  add column valor_multa     numeric(12,2) check (valor_multa >= 0),
  add column valor_juros     numeric(12,2) check (valor_juros >= 0),
  add column valor_correcao  numeric(12,2) check (valor_correcao >= 0),
  add column valor_acrescimo numeric(12,2) check (valor_acrescimo >= 0),
  -- Ou nenhum componente (legado: "encargos não discriminados"), ou todos,
  -- somando exatamente os encargos.
  add constraint recebimento_componentes check (
    (valor_multa is null and valor_juros is null and valor_correcao is null and valor_acrescimo is null)
    or (valor_multa is not null and valor_juros is not null and valor_correcao is not null and valor_acrescimo is not null
        and valor_multa + valor_juros + valor_correcao + valor_acrescimo = valor_encargos));

create index recebimentos_conta on public.recebimentos (conta_financeira_id);

comment on column public.recebimentos.conta_financeira_id is
  'Onde o dinheiro entrou. Nulo só nos recebimentos anteriores a 08/10/2026: origem legada não informada.';

-- -----------------------------------------------------------------------------
-- Ajustes: desconto, abatimento e acréscimo de uma parcela
-- -----------------------------------------------------------------------------
create table public.ajustes_financeiros (
  id              uuid primary key default gen_random_uuid(),
  parcela_id      uuid not null references public.parcelas (id),
  tipo            text not null check (tipo in ('desconto', 'abatimento', 'acrescimo')),
  valor           numeric(12,2) not null check (valor > 0),
  data            date not null,
  motivo          text not null check (btrim(motivo) <> ''),
  -- Quem autorizou: o login que concedeu (só o Financeiro completo concede).
  autorizado_por  uuid,
  estornado_em    timestamptz,
  estornado_por   uuid,
  motivo_estorno  text,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz,
  alterado_por    uuid
);

create index ajustes_parcela on public.ajustes_financeiros (parcela_id);
select privado.aplicar_padrao('public.ajustes_financeiros');
create trigger b_estorno before update on public.ajustes_financeiros
  for each row execute function privado.registrar_estorno();

-- Mudança que mexe em dinheiro respeita o período fechado — a de agora e,
-- numa alteração, a do lançamento original. Observação é livre.
create function privado.movimento_mes_aberto()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_livres constant text[] := array['observacao', 'observacoes', 'alterado_em', 'alterado_por'];
begin
  if tg_op = 'INSERT' then
    perform privado.exigir_mes_aberto(new.data);
  elsif to_jsonb(new) - v_livres is distinct from to_jsonb(old) - v_livres then
    perform privado.exigir_mes_aberto(old.data);
    perform privado.exigir_mes_aberto(new.data);
  end if;
  return new;
end
$$;

create trigger c_mes_aberto before insert or update on public.ajustes_financeiros
  for each row execute function privado.movimento_mes_aberto();

-- -----------------------------------------------------------------------------
-- Transferências entre contas
-- -----------------------------------------------------------------------------
create table public.transferencias_financeiras (
  id              uuid primary key default gen_random_uuid(),
  origem_id       uuid not null references public.contas_financeiras (id),
  destino_id      uuid not null references public.contas_financeiras (id),
  valor           numeric(12,2) not null check (valor > 0),
  data            date not null,
  justificativa   text not null check (btrim(justificativa) <> ''),
  estornado_em    timestamptz,
  estornado_por   uuid,
  motivo_estorno  text,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz,
  alterado_por    uuid,
  constraint transferencia_contas_distintas check (origem_id <> destino_id)
);

create index transferencias_origem on public.transferencias_financeiras (origem_id);
create index transferencias_destino on public.transferencias_financeiras (destino_id);
create index transferencias_data on public.transferencias_financeiras (data);
select privado.aplicar_padrao('public.transferencias_financeiras');
create trigger b_estorno before update on public.transferencias_financeiras
  for each row execute function privado.registrar_estorno();
create trigger c_mes_aberto before insert or update on public.transferencias_financeiras
  for each row execute function privado.movimento_mes_aberto();

create function privado.validar_transferencia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.data > privado.hoje() then
    raise exception 'A data da transferência não pode estar no futuro.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.contas_financeiras c
     where c.id in (new.origem_id, new.destino_id) and not c.ativo
  ) then
    raise exception 'Conta financeira inativa não recebe movimentos novos.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger d_validar before insert on public.transferencias_financeiras
  for each row execute function privado.validar_transferencia();

-- -----------------------------------------------------------------------------
-- Recebimento: conta padrão, conta ativa e saldo já com os ajustes
-- -----------------------------------------------------------------------------
create or replace function privado.validar_recebimento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcela  public.parcelas;
  v_contrato public.contratos;
  v_pago     numeric;
  v_ajuste   numeric;
begin
  if new.data > privado.hoje() then
    raise exception 'A data do recebimento não pode estar no futuro.' using errcode = 'P0001';
  end if;

  -- Onde o dinheiro entrou: a conta escolhida, ou a padrão.
  if new.conta_financeira_id is null then
    select c.id into new.conta_financeira_id from public.contas_financeiras c where c.padrao and c.ativo;
  elsif not exists (select 1 from public.contas_financeiras c where c.id = new.conta_financeira_id and c.ativo) then
    raise exception 'Conta financeira inativa não recebe movimentos novos.' using errcode = 'P0001';
  end if;

  -- Entrada avulsa: tudo é principal, não há encargo.
  if new.parcela_id is null then
    if new.tipo_avulsa is null then
      raise exception 'Informe o tipo da entrada avulsa.' using errcode = 'P0001';
    end if;
    new.valor_principal := new.valor;
    new.valor_encargos  := 0;
    new.valor_multa := null;
    new.valor_juros := null;
    new.valor_correcao := null;
    new.valor_acrescimo := null;
    return new;
  end if;

  -- Trava a parcela: dois recebimentos simultâneos não passam do saldo.
  select * into v_parcela from public.parcelas where id = new.parcela_id for update;
  select * into v_contrato from public.contratos where id = v_parcela.contrato_id;

  if v_parcela.renegociacao_id is not null or v_parcela.cancelado_em is not null
     or v_contrato.cancelado_em is not null then
    raise exception 'Esta parcela foi renegociada ou cancelada e não recebe pagamento.'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(r.valor_principal), 0) into v_pago
    from public.recebimentos r
   where r.parcela_id = new.parcela_id and r.estornado_em is null;

  select coalesce(sum(case when a.tipo = 'acrescimo' then a.valor else -a.valor end), 0) into v_ajuste
    from public.ajustes_financeiros a
   where a.parcela_id = new.parcela_id and a.estornado_em is null;

  if new.valor_principal > v_parcela.valor + v_ajuste - v_pago then
    raise exception 'O valor abatido (%) passa do saldo da parcela (%). O que passar entra como encargos.',
      privado.reais(new.valor_principal), privado.reais(v_parcela.valor + v_ajuste - v_pago)
      using errcode = 'P0001';
  end if;

  new.cliente_id  := v_contrato.cliente_id;
  new.tipo_avulsa := null;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Conceder e estornar ajuste — só o Financeiro completo, com motivo
-- -----------------------------------------------------------------------------
create function public.conceder_ajuste(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcela public.v_parcelas;
  v_valor   numeric := (p ->> 'valor')::numeric;
  v_tipo    text := p ->> 'tipo';
  v_id      uuid;
begin
  if not privado.financeiro_ajusta() then
    raise exception 'Só o Financeiro completo concede desconto, abatimento ou acréscimo.' using errcode = '42501';
  end if;
  if v_tipo is null or v_tipo not in ('desconto', 'abatimento', 'acrescimo') then
    raise exception 'Escolha desconto, abatimento ou acréscimo.' using errcode = 'P0001';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe o valor do ajuste.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p ->> 'motivo'), '') = '' then
    raise exception 'Informe o motivo do ajuste.' using errcode = 'P0001';
  end if;

  -- A mesma trava do recebimento: ajuste e baixa simultâneos não se cruzam.
  perform 1 from public.parcelas where id = (p ->> 'parcela_id')::uuid for update;
  select * into v_parcela from public.v_parcelas where id = (p ->> 'parcela_id')::uuid;
  if not found or v_parcela.situacao not in ('a_vencer', 'vencida') then
    raise exception 'Só parcela em aberto recebe ajuste.' using errcode = 'P0001';
  end if;
  if v_tipo <> 'acrescimo' and v_valor > v_parcela.saldo then
    raise exception 'O % (%) passa do saldo da parcela (%).', v_tipo, privado.reais(v_valor), privado.reais(v_parcela.saldo)
      using errcode = 'P0001';
  end if;

  insert into public.ajustes_financeiros (parcela_id, tipo, valor, data, motivo, autorizado_por)
  values (v_parcela.id, v_tipo, v_valor, coalesce((p ->> 'data')::date, privado.hoje()),
          btrim(p ->> 'motivo'), privado.meu_membro_id())
  returning id into v_id;
  return v_id;
end
$$;

create function public.estornar_ajuste(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.financeiro_ajusta() then
    raise exception 'Só o Financeiro completo estorna ajuste.' using errcode = '42501';
  end if;
  update public.ajustes_financeiros
     set estornado_em = now(), motivo_estorno = p_motivo
   where id = p_id and estornado_em is null;
  if not found then
    raise exception 'Ajuste não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
end
$$;

-- A padrão é uma só: trocar desmarca a anterior na mesma transação.
create function public.definir_conta_padrao(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador escolhe a conta padrão.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.contas_financeiras where id = p_id and ativo) then
    raise exception 'Escolha uma conta financeira ativa.' using errcode = 'P0001';
  end if;
  update public.contas_financeiras set padrao = false where padrao and id <> p_id;
  update public.contas_financeiras set padrao = true where id = p_id and not padrao;
end
$$;

-- -----------------------------------------------------------------------------
-- Consultas — colunas novas sempre no fim (create or replace view não reordena)
-- -----------------------------------------------------------------------------
create or replace view public.v_parcelas with (security_invoker = true) as
select
  p.id, p.contrato_id, p.numero, p.vencimento, p.valor,
  p.renegociacao_id, p.origem_renegociacao_id,
  p.cancelado_em, p.motivo_cancelamento,
  c.cliente_id, cl.nome as cliente_nome, cl.telefone as cliente_telefone,
  c.descricao as contrato_descricao, c.processo, c.responsavel_id,
  r.pago_principal, r.pago_encargos, r.ultimo_recebimento,
  p.valor + a.acrescimos - a.descontos - r.pago_principal as saldo,
  r.pago_principal > 0 and r.pago_principal < p.valor + a.acrescimos - a.descontos as parcial,
  case
    when r.pago_principal >= p.valor + a.acrescimos - a.descontos then 'paga'
    when p.renegociacao_id is not null then 'renegociada'
    when p.cancelado_em is not null or c.cancelado_em is not null then 'cancelada'
    when p.vencimento < privado.hoje() then 'vencida'
    else 'a_vencer'
  end as situacao,
  greatest(privado.hoje() - p.vencimento, 0) as dias_atraso,
  coalesce(c.multa_pct, cfg.multa_pct) as multa_pct,
  coalesce(c.juros_mes_pct, cfg.juros_mes_pct) as juros_mes_pct,
  coalesce(c.correcao, cfg.correcao) as correcao,
  coalesce(c.carencia_dias, cfg.carencia_dias) as carencia_dias,
  a.descontos as ajustes_desconto,
  a.acrescimos as ajustes_acrescimo,
  p.valor + a.acrescimos - a.descontos as exigivel,
  p.vencimento = privado.hoje() as vence_hoje
from public.parcelas p
join public.contratos c on c.id = p.contrato_id
join public.clientes cl on cl.id = c.cliente_id
cross join public.config_financeiro cfg
cross join lateral (
  select coalesce(sum(rc.valor_principal), 0) as pago_principal,
         coalesce(sum(rc.valor_encargos), 0) as pago_encargos,
         max(rc.data) as ultimo_recebimento
    from public.recebimentos rc
   where rc.parcela_id = p.id and rc.estornado_em is null
) r
cross join lateral (
  select coalesce(sum(aj.valor) filter (where aj.tipo in ('desconto', 'abatimento')), 0) as descontos,
         coalesce(sum(aj.valor) filter (where aj.tipo = 'acrescimo'), 0) as acrescimos
    from public.ajustes_financeiros aj
   where aj.parcela_id = p.id and aj.estornado_em is null
) a;

create or replace view public.v_recebimentos with (security_invoker = true) as
select
  r.id, r.parcela_id, r.cliente_id, cl.nome as cliente_nome,
  r.tipo_avulsa, r.descricao, r.data, r.valor, r.valor_principal, r.valor_encargos,
  r.forma_id, f.nome as forma_nome, r.memoria_calculo, r.observacao,
  r.estornado_em, r.estornado_por, r.motivo_estorno,
  r.criado_em, r.criado_por,
  p.numero as parcela_numero, p.contrato_id, c.descricao as contrato_descricao,
  r.conta_financeira_id, cf.nome as conta_financeira_nome,
  r.valor_multa, r.valor_juros, r.valor_correcao, r.valor_acrescimo,
  r.valor_multa is not null as encargos_discriminados,
  c.responsavel_id as contrato_responsavel_id
from public.recebimentos r
left join public.clientes cl on cl.id = r.cliente_id
left join public.formas_pagamento f on f.id = r.forma_id
left join public.parcelas p on p.id = r.parcela_id
left join public.contratos c on c.id = p.contrato_id
left join public.contas_financeiras cf on cf.id = r.conta_financeira_id;

create view public.v_ajustes with (security_invoker = true) as
select a.*, p.contrato_id, p.numero as parcela_numero, c.cliente_id
from public.ajustes_financeiros a
join public.parcelas p on p.id = a.parcela_id
join public.contratos c on c.id = p.contrato_id;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.contas_financeiras enable row level security;
alter table public.ajustes_financeiros enable row level security;
alter table public.transferencias_financeiras enable row level security;

create policy "contas_financeiras: ver" on public.contas_financeiras
  for select to authenticated using ((select privado.financeiro_le()));
create policy "contas_financeiras: incluir" on public.contas_financeiras
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "contas_financeiras: alterar" on public.contas_financeiras
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "ajustes_financeiros: ver" on public.ajustes_financeiros
  for select to authenticated using ((select privado.financeiro_le()));

create policy "transferencias_financeiras: ver" on public.transferencias_financeiras
  for select to authenticated using ((select privado.financeiro_le()));
create policy "transferencias_financeiras: incluir" on public.transferencias_financeiras
  for insert to authenticated with check ((select privado.financeiro_lanca()));
create policy "transferencias_financeiras: alterar" on public.transferencias_financeiras
  for update to authenticated
  using ((select privado.financeiro_lanca())) with check ((select privado.financeiro_lanca()));

revoke all on public.contas_financeiras, public.ajustes_financeiros, public.transferencias_financeiras,
  public.v_ajustes from anon, authenticated;
grant select on public.contas_financeiras, public.ajustes_financeiros, public.transferencias_financeiras,
  public.v_ajustes to authenticated;
grant insert (nome, tipo, banco, agencia, numero, saldo_inicial, saldo_inicial_em, padrao, observacoes),
  update (nome, tipo, banco, agencia, numero, saldo_inicial, saldo_inicial_em, padrao, observacoes, ativo)
  on public.contas_financeiras to authenticated;
grant insert (origem_id, destino_id, valor, data, justificativa),
  update (estornado_em, motivo_estorno)
  on public.transferencias_financeiras to authenticated;
grant insert (conta_financeira_id, valor_multa, valor_juros, valor_correcao, valor_acrescimo)
  on public.recebimentos to authenticated;
grant all on public.contas_financeiras, public.ajustes_financeiros, public.transferencias_financeiras,
  public.v_ajustes to service_role;

revoke execute on function public.conceder_ajuste(jsonb), public.estornar_ajuste(uuid, text),
  public.definir_conta_padrao(uuid) from public, anon;
grant execute on function public.conceder_ajuste(jsonb), public.estornar_ajuste(uuid, text),
  public.definir_conta_padrao(uuid) to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
