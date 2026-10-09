-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 19 · Despesas: pagamentos separados, parciais e estornáveis; fornecedores,
--      centros de custo, competência livre e recorrências anuais e parceladas
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T01 (R43, R51, R55, R69) e T13 (R50, R53–R56).
--
-- ANTES: pagar uma despesa gravava o valor pago e a data na própria linha de
-- `contas`. Pagar R$ 400 de uma conta de R$ 1.000 a deixava "paga" com valor
-- 400 — e os R$ 600 sumiam.
--
-- AGORA: `contas.valor` é o valor da OBRIGAÇÃO e não muda quando se paga.
-- Cada pagamento é um registro de `pagamentos_despesa`, com data, forma,
-- conta financeira (ou o sócio que pagou do bolso) e estorno motivado. Saldo
-- = obrigação − pagamentos não estornados. Pagamento acima do saldo é
-- recusado: para pagar mais, corrige-se primeiro a obrigação, com motivo.
--
-- `contas.data_pagamento` passa a ser "quitada em", mantida pelo banco a
-- partir dos pagamentos — ninguém grava nela direto. Os pagamentos antigos
-- viram um pagamento cada (origem 'legado'), e a migração confere, mês a mês,
-- que as saídas continuam as mesmas; se não, para.
--
-- Fechamento, painel e relatórios passam a somar os pagamentos — no mês em
-- que o dinheiro saiu —, e a pendência do mês é o saldo das obrigações da
-- competência.

-- -----------------------------------------------------------------------------
-- Fornecedores e centros de custo (T13)
-- -----------------------------------------------------------------------------
create table public.fornecedores (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (btrim(nome) <> ''),
  documento    text check (documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  contato      text,
  observacoes  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);
create unique index fornecedores_nome on public.fornecedores (lower(btrim(nome)));
select privado.aplicar_padrao('public.fornecedores');

-- Básico e opcional: cadastro inativável e "não informado" nos relatórios.
-- Rateio e unidades ficam para quando o escritório pedir (T17).
create table public.centros_custo (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (btrim(nome) <> ''),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);
create unique index centros_custo_nome on public.centros_custo (lower(btrim(nome)));
select privado.aplicar_padrao('public.centros_custo');

alter table public.contratos add column centro_custo_id uuid references public.centros_custo (id);
create index contratos_centro_custo on public.contratos (centro_custo_id);

-- -----------------------------------------------------------------------------
-- Despesas: tipo, fornecedor, centro, competência escolhida e motivo de ajuste
-- -----------------------------------------------------------------------------
alter table public.contas
  add column tipo text not null default 'variavel' check (tipo in ('fixa', 'variavel', 'extraordinaria')),
  add column fornecedor_id uuid references public.fornecedores (id),
  add column centro_custo_id uuid references public.centros_custo (id),
  -- Marcada: a competência foi escolhida e não acompanha mais o vencimento.
  add column competencia_manual boolean not null default false,
  -- Parcela N de M de uma recorrência parcelada.
  add column parcela_numero smallint check (parcela_numero >= 1),
  add column parcela_total  smallint check (parcela_total >= 1),
  -- Por que o valor da obrigação mudou depois de haver pagamento.
  add column motivo_ajuste text;

create index contas_fornecedor on public.contas (fornecedor_id);
create index contas_centro_custo on public.contas (centro_custo_id);

comment on column public.contas.valor is 'Valor da obrigação. Não muda ao pagar: cada pagamento fica em pagamentos_despesa.';
comment on column public.contas.data_pagamento is 'Quitada em: mantida pelo banco a partir dos pagamentos. Não se grava direto.';
comment on column public.contas.pago_por_id is 'Legado (antes de 08/10/2026). O sócio que paga do bolso fica no pagamento.';
comment on column public.contas.reembolsado_em is 'Legado (antes de 08/10/2026). O reembolso fica no pagamento.';

alter table public.contas_recorrentes
  add column frequencia text not null default 'mensal' check (frequencia in ('mensal', 'anual', 'parcelada')),
  -- Anual: o mês do ano em que vence (1 a 12).
  add column mes_referencia smallint check (mes_referencia between 1 and 12),
  -- Parcelada: o total e em quantas vezes, uma por mês a partir de `inicio`.
  add column quantidade smallint check (quantidade between 2 and 120),
  add column valor_total numeric(12,2) check (valor_total > 0),
  add column tipo text not null default 'fixa' check (tipo in ('fixa', 'variavel', 'extraordinaria')),
  add column fornecedor_id uuid references public.fornecedores (id),
  add column centro_custo_id uuid references public.centros_custo (id),
  add constraint recorrente_frequencia check (
    frequencia = 'mensal'
    or (frequencia = 'anual' and mes_referencia is not null)
    or (frequencia = 'parcelada' and quantidade is not null and valor_total is not null));

-- O que já existia era fixo e mensal.
alter table public.contas disable trigger d_mes_aberto;
update public.contas set tipo = 'fixa' where recorrente_id is not null;
alter table public.contas enable trigger d_mes_aberto;

-- -----------------------------------------------------------------------------
-- Pagamentos
-- -----------------------------------------------------------------------------
create table public.pagamentos_despesa (
  id                  uuid primary key default gen_random_uuid(),
  conta_id            uuid not null references public.contas (id),
  valor               numeric(12,2) not null check (valor > 0),
  data                date not null,
  forma_id            uuid references public.formas_pagamento (id),
  -- De onde saiu: uma conta financeira do escritório, ou o bolso de um sócio
  -- (reembolso a receber). Nunca os dois.
  conta_financeira_id uuid references public.contas_financeiras (id),
  pago_por_id         uuid references public.membros (id),
  reembolsado_em      date,
  reembolso_conta_financeira_id uuid references public.contas_financeiras (id),
  observacao          text,
  origem              text not null default 'manual' check (origem in ('manual', 'legado', 'importacao', 'lote')),
  -- Repetir o mesmo pedido (clique duplo, rede que caiu) devolve o mesmo pagamento.
  chave_idempotencia  text,
  -- Quem lançou no sistema antigo, quando o pagamento veio da migração.
  legado_registrado_por uuid,
  legado_registrado_em  timestamptz,
  estornado_em        timestamptz,
  estornado_por       uuid,
  motivo_estorno      text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid,
  constraint pagamento_origem_dinheiro check (pago_por_id is null or conta_financeira_id is null),
  constraint pagamento_reembolso check (reembolsado_em is null or pago_por_id is not null)
);

create index pagamentos_despesa_conta on public.pagamentos_despesa (conta_id);
create index pagamentos_despesa_data on public.pagamentos_despesa (data);
create index pagamentos_despesa_conta_financeira on public.pagamentos_despesa (conta_financeira_id);
create index pagamentos_despesa_reembolso_conta on public.pagamentos_despesa (reembolso_conta_financeira_id);
create index pagamentos_despesa_pago_por on public.pagamentos_despesa (pago_por_id);
create index pagamentos_despesa_forma on public.pagamentos_despesa (forma_id);
create unique index pagamentos_despesa_legado on public.pagamentos_despesa (conta_id) where origem = 'legado';
create unique index pagamentos_despesa_chave on public.pagamentos_despesa (chave_idempotencia) where chave_idempotencia is not null;

select privado.aplicar_padrao('public.pagamentos_despesa');
create trigger b_estorno before update on public.pagamentos_despesa
  for each row execute function privado.registrar_estorno();

-- Período: o pagamento é do mês em que o dinheiro saiu; o reembolso, do mês
-- em que o sócio recebeu de volta. Observação é livre.
create function privado.pagamento_mes_aberto()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_livres constant text[] := array['observacao', 'reembolsado_em', 'reembolso_conta_financeira_id', 'alterado_em', 'alterado_por'];
begin
  if tg_op = 'INSERT' then
    perform privado.exigir_mes_aberto(new.data);
    return new;
  end if;
  if to_jsonb(new) - v_livres is distinct from to_jsonb(old) - v_livres then
    perform privado.exigir_mes_aberto(old.data);
  end if;
  if (new.reembolsado_em, new.reembolso_conta_financeira_id) is distinct from (old.reembolsado_em, old.reembolso_conta_financeira_id) then
    perform privado.exigir_mes_aberto(old.reembolsado_em);
    perform privado.exigir_mes_aberto(new.reembolsado_em);
  end if;
  return new;
end
$$;

create trigger c_mes_aberto before insert or update on public.pagamentos_despesa
  for each row execute function privado.pagamento_mes_aberto();

create function privado.validar_pagamento_despesa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta public.contas;
  v_pago  numeric;
begin
  if new.data > privado.hoje() then
    raise exception 'A data do pagamento não pode estar no futuro.' using errcode = 'P0001';
  end if;

  -- Trava a despesa: dois pagamentos simultâneos não passam do saldo.
  select * into v_conta from public.contas where id = new.conta_id for update;
  if not found then
    raise exception 'Despesa não encontrada.' using errcode = 'P0001';
  end if;
  if v_conta.cancelado_em is not null then
    raise exception 'Despesa cancelada não recebe pagamento.' using errcode = 'P0001';
  end if;
  if v_conta.valor is null then
    raise exception 'Informe o valor da conta antes de pagar.' using errcode = 'P0001';
  end if;

  select coalesce(sum(p.valor), 0) into v_pago
    from public.pagamentos_despesa p
   where p.conta_id = new.conta_id and p.estornado_em is null;
  if new.valor > v_conta.valor - v_pago then
    raise exception 'O pagamento (%) passa do saldo da conta (%). Se a conta ficou maior, corrija o valor dela antes, com o motivo.',
      privado.reais(new.valor), privado.reais(v_conta.valor - v_pago) using errcode = 'P0001';
  end if;

  -- De onde saiu o dinheiro: o sócio que pagou do bolso, ou a conta escolhida
  -- (ou a padrão).
  if new.pago_por_id is null and new.conta_financeira_id is null then
    select c.id into new.conta_financeira_id from public.contas_financeiras c where c.padrao and c.ativo;
  elsif new.conta_financeira_id is not null
        and not exists (select 1 from public.contas_financeiras c where c.id = new.conta_financeira_id and c.ativo) then
    raise exception 'Conta financeira inativa não recebe movimentos novos.' using errcode = 'P0001';
  end if;
  if new.pago_por_id is not null and not exists (select 1 from public.membros m where m.id = new.pago_por_id) then
    raise exception 'Escolha quem pagou.' using errcode = 'P0001';
  end if;
  if new.origem <> 'legado' then
    new.reembolsado_em := null;
    new.reembolso_conta_financeira_id := null;
  end if;
  return new;
end
$$;

create trigger d_validar before insert on public.pagamentos_despesa
  for each row execute function privado.validar_pagamento_despesa();

-- "Quitada em" na despesa: a data do último pagamento quando o pago alcança a
-- obrigação; nula enquanto houver saldo.
create function privado.sincronizar_despesa(p_conta uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_quitada date;
begin
  select case when c.valor is not null and coalesce(sum(p.valor), 0) >= c.valor then max(p.data) end
    into v_quitada
    from public.contas c
    left join public.pagamentos_despesa p on p.conta_id = c.id and p.estornado_em is null
   where c.id = p_conta
   group by c.id, c.valor;

  update public.contas set data_pagamento = v_quitada
   where id = p_conta and data_pagamento is distinct from v_quitada;
end
$$;

create function privado.depois_do_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform privado.sincronizar_despesa(new.conta_id);
  return null;
end
$$;

create trigger y_sincronizar after insert or update on public.pagamentos_despesa
  for each row execute function privado.depois_do_pagamento();

-- -----------------------------------------------------------------------------
-- A despesa (obrigação)
-- -----------------------------------------------------------------------------
create or replace function privado.preparar_conta()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.competencia is null then
      new.competencia := privado.inicio_mes(new.vencimento);
      new.competencia_manual := false;
    else
      new.competencia := privado.inicio_mes(new.competencia);
    end if;
  else
    if new.competencia is distinct from old.competencia then
      new.competencia := privado.inicio_mes(new.competencia);
    end if;
    -- Avulsa sem competência escolhida acompanha o vencimento; a da
    -- recorrência e a escolhida à mão ficam onde estão.
    if new.recorrente_id is null and not new.competencia_manual
       and new.vencimento is distinct from old.vencimento
       and new.competencia is not distinct from old.competencia then
      new.competencia := privado.inicio_mes(new.vencimento);
    end if;
  end if;

  if new.data_pagamento is not null and new.data_pagamento > privado.hoje() then
    raise exception 'A data de pagamento não pode estar no futuro.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- Obrigação: o mês da competência precisa estar aberto para incluir, mudar o
-- valor, a competência, o vencimento ou cancelar. Dados descritivos e a data
-- de quitação (derivada dos pagamentos, que têm a própria trava) são livres.
create or replace function privado.conta_mes_aberto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_livres constant text[] := array['observacao', 'descricao', 'reembolsado_em', 'data_pagamento', 'fornecedor_id',
                                    'centro_custo_id', 'motivo_ajuste', 'forma_id', 'alterado_em', 'alterado_por'];
  v_pago   numeric;
begin
  if tg_op = 'INSERT' then
    perform privado.exigir_mes_aberto(new.competencia);
    return new;
  end if;

  if to_jsonb(new) - v_livres is distinct from to_jsonb(old) - v_livres then
    perform privado.exigir_mes_aberto(old.competencia);
    perform privado.exigir_mes_aberto(new.competencia);
  end if;

  if (new.valor, new.cancelado_em) is distinct from (old.valor, old.cancelado_em) then
    select coalesce(sum(p.valor), 0) into v_pago
      from public.pagamentos_despesa p
     where p.conta_id = new.id and p.estornado_em is null;
    if v_pago > 0 and new.cancelado_em is not null and old.cancelado_em is null then
      raise exception 'Esta conta tem pagamento registrado. Estorne o pagamento antes de cancelar, ou corrija o valor.'
        using errcode = 'P0001';
    end if;
    if v_pago > 0 and new.valor is distinct from old.valor then
      if new.valor is null or new.valor < v_pago then
        raise exception 'O valor da conta não pode ficar abaixo do que já foi pago (%).', privado.reais(v_pago)
          using errcode = 'P0001';
      end if;
      if coalesce(btrim(new.motivo_ajuste), '') = '' or new.motivo_ajuste is not distinct from old.motivo_ajuste then
        raise exception 'Conta com pagamento: informe o motivo da mudança de valor.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end
$$;

-- A quitação acompanha o novo valor (pagar 400 de 1.000 e corrigir para 400
-- quita; corrigir de 400 para 500 reabre).
create function privado.depois_da_conta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.valor is distinct from old.valor then
    perform privado.sincronizar_despesa(new.id);
  end if;
  return null;
end
$$;

create trigger y_sincronizar after update on public.contas
  for each row execute function privado.depois_da_conta();

-- -----------------------------------------------------------------------------
-- Os pagamentos antigos viram registros (origem 'legado'), sem duplicar se a
-- migração rodar de novo. Conta cancelada nunca entrou nas saídas — continua
-- de fora. Gatilhos desligados só aqui: a carga não é um lançamento de
-- ninguém, e mês fechado não pode barrar a cópia do que já está nele.
-- -----------------------------------------------------------------------------
alter table public.pagamentos_despesa disable trigger user;

insert into public.pagamentos_despesa (
  conta_id, valor, data, forma_id, pago_por_id, reembolsado_em, origem,
  legado_registrado_por, legado_registrado_em, criado_em)
select c.id, c.valor, c.data_pagamento, c.forma_id, c.pago_por_id, c.reembolsado_em, 'legado',
       coalesce(c.alterado_por, c.criado_por), coalesce(c.alterado_em, c.criado_em), now()
  from public.contas c
 where c.data_pagamento is not null and c.valor is not null and c.cancelado_em is null
on conflict do nothing;

insert into public.auditoria (tabela, registro_id, acao, depois)
select 'pagamentos_despesa', p.id, 'migrou', to_jsonb(p)
  from public.pagamentos_despesa p
 where p.origem = 'legado';

alter table public.pagamentos_despesa enable trigger user;

-- Reconciliação: as saídas de cada mês, antes e depois, no centavo.
do $$
declare
  v record;
begin
  for v in
    select coalesce(a.mes, b.mes) as mes, a.total as antes, b.total as depois
      from (select privado.inicio_mes(c.data_pagamento) as mes, sum(c.valor) as total
              from public.contas c
             where c.cancelado_em is null and c.data_pagamento is not null and c.valor is not null
             group by 1) a
      full join (select privado.inicio_mes(p.data) as mes, sum(p.valor) as total
                   from public.pagamentos_despesa p
                  where p.estornado_em is null
                  group by 1) b on a.mes = b.mes
     where a.total is distinct from b.total
  loop
    raise exception 'A migração dos pagamentos não fecha em %: antes %, depois %. Nada foi alterado.',
      to_char(v.mes, 'MM/YYYY'), v.antes, v.depois;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Registrar, estornar e reembolsar
-- -----------------------------------------------------------------------------
create function public.registrar_pagamento_despesa(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_chave text := nullif(btrim(p ->> 'chave'), '');
  v_ant   public.pagamentos_despesa;
  v_id    uuid;
  v_pos   record;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  if (p ->> 'valor') is null or (p ->> 'valor')::numeric <= 0 then
    raise exception 'Informe o valor pago.' using errcode = 'P0001';
  end if;
  if (p ->> 'data') is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'P0001';
  end if;

  -- Repetição do mesmo pedido: devolve o pagamento já feito. A mesma chave
  -- com outro conteúdo é erro — nunca um segundo pagamento.
  if v_chave is not null then
    select * into v_ant from public.pagamentos_despesa where chave_idempotencia = v_chave;
    if found then
      if v_ant.conta_id is distinct from (p ->> 'conta_id')::uuid or v_ant.valor <> (p ->> 'valor')::numeric
         or v_ant.data <> (p ->> 'data')::date or v_ant.criado_por is distinct from privado.meu_membro_id() then
        raise exception 'Este pedido de pagamento já foi usado com outros valores.' using errcode = 'P0001';
      end if;
      v_id := v_ant.id;
    end if;
  end if;

  if v_id is null then
    insert into public.pagamentos_despesa (conta_id, valor, data, forma_id, conta_financeira_id, pago_por_id,
                                           observacao, chave_idempotencia)
    values ((p ->> 'conta_id')::uuid, (p ->> 'valor')::numeric, (p ->> 'data')::date,
            nullif(p ->> 'forma_id', '')::uuid, nullif(p ->> 'conta_financeira_id', '')::uuid,
            nullif(p ->> 'pago_por_id', '')::uuid, nullif(btrim(p ->> 'observacao'), ''), v_chave)
    returning id into v_id;
  end if;

  select c.valor, coalesce(sum(pd.valor) filter (where pd.estornado_em is null), 0) as pago
    into v_pos
    from public.contas c
    left join public.pagamentos_despesa pd on pd.conta_id = c.id
   where c.id = (p ->> 'conta_id')::uuid
   group by c.id, c.valor;

  return jsonb_build_object('pagamento_id', v_id, 'valor_conta', v_pos.valor, 'pago_total', v_pos.pago,
                            'saldo', v_pos.valor - v_pos.pago);
end
$$;

create function public.estornar_pagamento_despesa(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  -- A trava da despesa, na mesma ordem do pagamento.
  perform 1 from public.contas c join public.pagamentos_despesa p on p.conta_id = c.id where p.id = p_id for update of c;
  update public.pagamentos_despesa set estornado_em = now(), motivo_estorno = p_motivo where id = p_id;
  if not found then
    raise exception 'Pagamento não encontrado.' using errcode = 'P0001';
  end if;
end
$$;

create function public.registrar_reembolso(p_id uuid, p_data date, p_conta_financeira uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pagamentos_despesa;
  v_conta uuid := p_conta_financeira;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  select * into v from public.pagamentos_despesa where id = p_id for update;
  if not found or v.pago_por_id is null or v.estornado_em is not null then
    raise exception 'Só um pagamento feito por sócio, não estornado, é reembolsado.' using errcode = 'P0001';
  end if;
  if v.reembolsado_em is not null then
    raise exception 'Este pagamento já foi reembolsado.' using errcode = 'P0001';
  end if;
  if p_data is null or p_data > privado.hoje() or p_data < v.data then
    raise exception 'A data do reembolso não pode estar no futuro nem antes do pagamento.' using errcode = 'P0001';
  end if;
  if v_conta is null then
    select c.id into v_conta from public.contas_financeiras c where c.padrao and c.ativo;
  elsif not exists (select 1 from public.contas_financeiras c where c.id = v_conta and c.ativo) then
    raise exception 'Conta financeira inativa não recebe movimentos novos.' using errcode = 'P0001';
  end if;
  update public.pagamentos_despesa
     set reembolsado_em = p_data, reembolso_conta_financeira_id = v_conta
   where id = p_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Recorrências: mensal, anual e parcelada (T13)
-- -----------------------------------------------------------------------------

-- Parcelada: R$ 1.000 em 3 → 333,33 + 333,33 + 333,34. O centavo fica na última.
create function privado.valor_da_parcela(p_total numeric, p_quantidade integer, p_n integer)
returns numeric
language sql immutable set search_path = ''
as $$
  select round(case when p_n < p_quantidade
                    then trunc(p_total * 100 / p_quantidade) / 100
                    else p_total - (trunc(p_total * 100 / p_quantidade) / 100) * (p_quantidade - 1) end, 2)
$$;

create function privado.meses_entre(p_de date, p_ate date)
returns integer
language sql immutable set search_path = ''
as $$
  select ((extract(year from p_ate) - extract(year from p_de)) * 12
          + extract(month from p_ate) - extract(month from p_de))::integer
$$;

-- As obrigações que uma recorrência gera num mês (zero ou uma).
create function privado.ocorrencia_recorrente(r public.contas_recorrentes, p_mes date)
returns table (vencimento date, valor numeric, parcela_numero smallint, parcela_total smallint)
language plpgsql stable set search_path = ''
as $$
declare
  v_ultimo integer := extract(day from ((p_mes + interval '1 month')::date - 1))::integer;
  v_n      integer := privado.meses_entre(r.inicio, p_mes) + 1;
begin
  if p_mes < r.inicio or (r.fim is not null and p_mes > r.fim) then
    return;
  end if;
  if r.frequencia = 'anual' and extract(month from p_mes) <> r.mes_referencia then
    return;
  end if;
  if r.frequencia = 'parcelada' and (v_n < 1 or v_n > r.quantidade) then
    return;
  end if;

  vencimento := make_date(extract(year from p_mes)::integer, extract(month from p_mes)::integer,
                          least(r.dia_vencimento, v_ultimo));
  if r.frequencia = 'parcelada' then
    valor := privado.valor_da_parcela(r.valor_total, r.quantidade, v_n);
    parcela_numero := v_n;
    parcela_total := r.quantidade;
  else
    valor := r.valor;
  end if;
  return next;
end
$$;

-- Idempotente: chamar de novo não duplica (único por recorrência e mês), e
-- conta cancelada não renasce. Mês fechado não ganha conta nova.
create or replace function public.gerar_contas_do_mes(p_competencia date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := privado.inicio_mes(p_competencia);
  v_qtd integer;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;

  -- Só até o mês que vem: navegar pela tela não deve criar contas de 2030.
  -- A previsão dos meses seguintes vem de previsao_recorrentes, sem gravar.
  if v_mes > (privado.inicio_mes(privado.hoje()) + interval '1 month')::date then
    return 0;
  end if;
  if exists (select 1 from public.fechamentos f where f.competencia = v_mes and f.fechado) then
    return 0;
  end if;

  insert into public.contas (descricao, categoria_id, valor, vencimento, competencia, recorrente_id, forma_id,
                             tipo, fornecedor_id, centro_custo_id, parcela_numero, parcela_total)
  select r.descricao, r.categoria_id, o.valor, o.vencimento, v_mes, r.id, r.forma_id,
         r.tipo, r.fornecedor_id, r.centro_custo_id, o.parcela_numero, o.parcela_total
    from public.contas_recorrentes r
    cross join lateral privado.ocorrencia_recorrente(r, v_mes) o
   where r.ativo
  on conflict (recorrente_id, competencia) do nothing;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end
$$;

-- O que as recorrências ainda vão gerar no período, sem gravar nada: é como
-- quem só consulta vê a previsão, e como o painel e os relatórios enxergam
-- os meses que ninguém abriu.
create function public.previsao_recorrentes(p_de date, p_ate date)
returns table (recorrente_id uuid, competencia date, vencimento date, descricao text, categoria_id uuid,
               valor numeric, tipo text, fornecedor_id uuid, centro_custo_id uuid,
               parcela_numero smallint, parcela_total smallint)
language sql stable security invoker set search_path = ''
as $$
  select r.id, m.mes, o.vencimento, r.descricao, r.categoria_id, o.valor, r.tipo, r.fornecedor_id,
         r.centro_custo_id, o.parcela_numero, o.parcela_total
    from public.contas_recorrentes r
    cross join lateral (
      select generate_series(privado.inicio_mes(p_de), privado.inicio_mes(least(p_ate, p_de + 3660)), interval '1 month')::date as mes
    ) m
    cross join lateral privado.ocorrencia_recorrente(r, m.mes) o
   where r.ativo
     and not exists (select 1 from public.contas c where c.recorrente_id = r.id and c.competencia = m.mes)
   order by m.mes, o.vencimento
$$;

-- Parcelada termina sozinha na última parcela.
create function privado.preparar_recorrente()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.frequencia = 'parcelada' then
    new.fim := (new.inicio + make_interval(months => new.quantidade - 1))::date;
    new.valor := null;
  elsif new.frequencia = 'anual' and new.mes_referencia is null then
    new.mes_referencia := extract(month from new.inicio)::smallint;
  end if;
  return new;
end
$$;

create trigger c_preparar before insert or update on public.contas_recorrentes
  for each row execute function privado.preparar_recorrente();

-- Mudou a recorrência: quais obrigações já geradas, ainda sem pagamento e em
-- mês aberto, seriam afetadas — para a tela mostrar antes de aplicar.
create function public.impacto_recorrente(p_id uuid)
returns table (conta_id uuid, competencia date, vencimento date, descricao text, valor numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.financeiro_le() then
    raise exception 'Sem acesso ao Financeiro.' using errcode = '42501';
  end if;
  -- Quem só lança não lê `fechamentos`; por isso a função roda como dona.
  return query
  select c.id, c.competencia, c.vencimento, c.descricao, c.valor
    from public.contas c
   where c.recorrente_id = p_id
     and c.cancelado_em is null
     and c.competencia >= privado.inicio_mes(privado.hoje())
     and not exists (select 1 from public.pagamentos_despesa p where p.conta_id = c.id and p.estornado_em is null)
     and not exists (select 1 from public.fechamentos f where f.competencia = c.competencia and f.fechado)
   order by c.competencia;
end
$$;

-- Aplica a recorrência atual às obrigações listadas por impacto_recorrente.
-- Nunca muda pagamento, mês fechado ou obrigação já paga em parte.
create function public.aplicar_recorrente_em_abertas(p_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r     public.contas_recorrentes;
  v     record;
  o     record;
  v_qtd integer := 0;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  select * into r from public.contas_recorrentes where id = p_id;
  if not found then
    raise exception 'Recorrência não encontrada.' using errcode = 'P0001';
  end if;
  for v in select * from public.impacto_recorrente(p_id) loop
    select * into o from privado.ocorrencia_recorrente(r, v.competencia);
    if not found then
      continue;
    end if;
    update public.contas
       set descricao = r.descricao, categoria_id = r.categoria_id, valor = o.valor, vencimento = o.vencimento,
           tipo = r.tipo, fornecedor_id = r.fornecedor_id, centro_custo_id = r.centro_custo_id, forma_id = r.forma_id
     where id = v.conta_id;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end
$$;

-- -----------------------------------------------------------------------------
-- Consultas
-- -----------------------------------------------------------------------------
create or replace view public.v_contas with (security_invoker = true) as
select
  c.id, c.descricao, c.categoria_id, cat.nome as categoria_nome,
  c.valor, c.vencimento, c.competencia, c.recorrente_id,
  c.data_pagamento, c.forma_id, f.nome as forma_nome,
  c.pago_por_id, c.reembolsado_em, c.observacao,
  c.cancelado_em, c.motivo_cancelamento,
  c.criado_em, c.criado_por, c.alterado_em, c.alterado_por,
  c.vencimento - privado.hoje() as dias_para_vencer,
  case
    when c.cancelado_em is not null then 'cancelada'
    when c.valor is null then 'sem_valor'
    when p.pago >= c.valor then 'paga'
    when c.vencimento < privado.hoje() then 'vencida'
    else 'a_pagar'
  end as situacao,
  p.pago as pago_total,
  case when c.valor is null or c.cancelado_em is not null then null else c.valor - p.pago end as saldo,
  p.pago > 0 and c.valor is not null and p.pago < c.valor as parcial,
  p.ultimo as ultimo_pagamento,
  p.quantos as pagamentos,
  c.tipo, c.fornecedor_id, fo.nome as fornecedor_nome,
  c.centro_custo_id, cc.nome as centro_custo_nome,
  c.competencia_manual, c.vencimento = privado.hoje() as vence_hoje,
  c.parcela_numero, c.parcela_total, c.motivo_ajuste
from public.contas c
join public.categorias cat on cat.id = c.categoria_id
left join public.formas_pagamento f on f.id = c.forma_id
left join public.fornecedores fo on fo.id = c.fornecedor_id
left join public.centros_custo cc on cc.id = c.centro_custo_id
cross join lateral (
  select coalesce(sum(pd.valor), 0) as pago, max(pd.data) as ultimo, count(*) as quantos
    from public.pagamentos_despesa pd
   where pd.conta_id = c.id and pd.estornado_em is null
) p;

create view public.v_pagamentos_despesa with (security_invoker = true) as
select
  p.id, p.conta_id, p.valor, p.data, p.forma_id, fp.nome as forma_nome,
  p.conta_financeira_id, cf.nome as conta_financeira_nome,
  p.pago_por_id, p.reembolsado_em, p.reembolso_conta_financeira_id, p.observacao, p.origem,
  p.estornado_em, p.estornado_por, p.motivo_estorno,
  p.legado_registrado_por, p.legado_registrado_em,
  p.criado_em, p.criado_por,
  c.descricao, c.categoria_id, cat.nome as categoria_nome, c.competencia, c.vencimento,
  c.valor as valor_conta, c.tipo, c.fornecedor_id, fo.nome as fornecedor_nome,
  c.centro_custo_id, cc.nome as centro_custo_nome, c.recorrente_id
from public.pagamentos_despesa p
join public.contas c on c.id = p.conta_id
join public.categorias cat on cat.id = c.categoria_id
left join public.formas_pagamento fp on fp.id = p.forma_id
left join public.contas_financeiras cf on cf.id = p.conta_financeira_id
left join public.fornecedores fo on fo.id = c.fornecedor_id
left join public.centros_custo cc on cc.id = c.centro_custo_id;

-- Todo dinheiro que passou por uma conta financeira. Pagamento feito do bolso
-- de um sócio não passou por conta nenhuma; o reembolso a ele, sim.
-- Transferência gera duas pernas iguais e não é receita nem despesa.
create view public.v_movimentacoes_financeiras with (security_invoker = true) as
select 'recebimento'::text as origem, r.id as origem_id, 'entrada'::text as direcao,
       r.conta_financeira_id, r.data, r.valor, r.estornado_em,
       coalesce(cl.nome, 'Entrada avulsa') as descricao, r.cliente_id, null::uuid as despesa_id
  from public.recebimentos r left join public.clientes cl on cl.id = r.cliente_id
union all
select 'pagamento', p.id, 'saida', p.conta_financeira_id, p.data, p.valor, p.estornado_em, c.descricao, null, c.id
  from public.pagamentos_despesa p join public.contas c on c.id = p.conta_id
 where p.pago_por_id is null
union all
select 'reembolso_socio', p.id, 'saida', p.reembolso_conta_financeira_id, p.reembolsado_em, p.valor, p.estornado_em,
       'Reembolso: ' || c.descricao, null, c.id
  from public.pagamentos_despesa p join public.contas c on c.id = p.conta_id
 where p.reembolsado_em is not null
union all
select 'transferencia', t.id, 'saida', t.origem_id, t.data, t.valor, t.estornado_em, t.justificativa, null, null
  from public.transferencias_financeiras t
union all
select 'transferencia', t.id, 'entrada', t.destino_id, t.data, t.valor, t.estornado_em, t.justificativa, null, null
  from public.transferencias_financeiras t;

create view public.v_saldos_contas with (security_invoker = true) as
select cf.id, cf.nome, cf.tipo, cf.padrao, cf.ativo, cf.saldo_inicial, cf.saldo_inicial_em,
       coalesce(sum(m.valor) filter (where m.direcao = 'entrada'), 0) as entradas,
       coalesce(sum(m.valor) filter (where m.direcao = 'saida'), 0) as saidas,
       cf.saldo_inicial
         + coalesce(sum(m.valor) filter (where m.direcao = 'entrada'), 0)
         - coalesce(sum(m.valor) filter (where m.direcao = 'saida'), 0) as saldo,
       max(m.data) as ultimo_movimento
  from public.contas_financeiras cf
  left join public.v_movimentacoes_financeiras m
    on m.conta_financeira_id = cf.id and m.estornado_em is null
   and (cf.saldo_inicial_em is null or m.data >= cf.saldo_inicial_em)
 group by cf.id;

-- Saídas mês a mês pelos pagamentos (o dinheiro que saiu), não pela obrigação.
create or replace function public.serie_mensal(p_ate date, p_meses integer default 12)
returns table (competencia date, entradas numeric, saidas numeric)
language sql stable set search_path = ''
as $$
  with meses as (
    select (privado.inicio_mes(p_ate) - make_interval(months => g))::date as competencia
      from generate_series(0, least(greatest(p_meses, 1), 36) - 1) as g
  )
  select m.competencia,
         coalesce((select sum(r.valor) from public.recebimentos r
                    where r.estornado_em is null
                      and r.data >= m.competencia
                      and r.data < (m.competencia + interval '1 month')), 0),
         coalesce((select sum(p.valor) from public.pagamentos_despesa p
                    where p.estornado_em is null
                      and p.data >= m.competencia
                      and p.data < (m.competencia + interval '1 month')), 0)
    from meses m
   order by m.competencia
$$;

-- -----------------------------------------------------------------------------
-- Fechamento do mês: saídas e reembolsos pelos pagamentos; pendência pelo
-- saldo das obrigações da competência.
-- -----------------------------------------------------------------------------
create or replace function public.previa_fechamento(p_competencia date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mes        date := privado.inicio_mes(p_competencia);
  v_fim        date := (privado.inicio_mes(p_competencia) + interval '1 month')::date - 1;
  v_cfg        public.config_financeiro;
  v_entradas   numeric;
  v_saidas     numeric;
  v_resultado  numeric;
  v_base       numeric;
  v_totais     jsonb;
  v_divisao    jsonb;
  v_pendencias jsonb;
begin
  if not privado.financeiro_fechamento_le() then
    raise exception 'Sem permissão para ver o fechamento.' using errcode = '42501';
  end if;

  select * into v_cfg from public.config_financeiro;

  select coalesce(sum(r.valor), 0) into v_entradas
    from public.recebimentos r
   where r.estornado_em is null and r.data between v_mes and v_fim;

  select coalesce(sum(p.valor), 0) into v_saidas
    from public.pagamentos_despesa p
   where p.estornado_em is null and p.data between v_mes and v_fim;

  v_resultado := v_entradas - v_saidas;

  select jsonb_build_object(
           'entradas', v_entradas,
           'saidas', v_saidas,
           'resultado', v_resultado,
           'principal_parcelas', coalesce(sum(r.valor_principal) filter (where r.parcela_id is not null), 0),
           'encargos', coalesce(sum(r.valor_encargos), 0),
           'avulsas', coalesce(sum(r.valor) filter (where r.parcela_id is null), 0),
           'recebimentos', count(*))
    into v_totais
    from public.recebimentos r
   where r.estornado_em is null and r.data between v_mes and v_fim;

  v_totais := v_totais || jsonb_build_object(
    'pagamentos', (select count(*) from public.pagamentos_despesa p
                    where p.estornado_em is null and p.data between v_mes and v_fim),
    'despesas_previstas', (select coalesce(sum(c.valor), 0) from public.contas c
                            where c.cancelado_em is null and c.competencia = v_mes),
    'saidas_por_categoria', (
      select coalesce(jsonb_agg(jsonb_build_object('categoria', t.nome, 'valor', t.total)
                                order by t.total desc), '[]'::jsonb)
        from (select cat.nome, sum(p.valor) as total
                from public.pagamentos_despesa p
                join public.contas c on c.id = p.conta_id
                join public.categorias cat on cat.id = c.categoria_id
               where p.estornado_em is null and p.data between v_mes and v_fim
               group by cat.nome) as t),
    'entradas_por_forma', (
      select coalesce(jsonb_agg(jsonb_build_object('forma', t.nome, 'valor', t.total)
                                order by t.total desc), '[]'::jsonb)
        from (select coalesce(f.nome, 'Não informada') as nome, sum(r.valor) as total
                from public.recebimentos r
                left join public.formas_pagamento f on f.id = r.forma_id
               where r.estornado_em is null and r.data between v_mes and v_fim
               group by 1) as t));

  v_base := case when v_cfg.divisao_despesas_antes then v_resultado else v_entradas end;

  with participantes as (
    select d.membro_id, m.nome_curto,
           case when v_cfg.divisao_modelo = 'igual'
                then 100.0 / count(*) over ()
                else d.percentual end as pct,
           row_number() over (order by m.nome_curto) as ordem,
           count(*) over () as total
      from public.divisao_cotas d
      join public.membros m on m.id = d.membro_id
     where d.participa and m.ativo
  ),
  valores as (
    select pa.*,
           round(v_base * pa.pct / 100, 2) as bruto,
           sum(round(v_base * pa.pct / 100, 2)) over () as soma_bruto,
           sum(pa.pct) over () as soma_pct
      from participantes pa
  ),
  reembolsos as (
    select p.pago_por_id as membro_id, sum(p.valor) as valor
      from public.pagamentos_despesa p
     where p.estornado_em is null and p.pago_por_id is not null
       and p.reembolsado_em is null and p.data <= v_fim
     group by p.pago_por_id
  )
  select jsonb_build_object(
           'modelo', v_cfg.divisao_modelo,
           'despesas_antes', v_cfg.divisao_despesas_antes,
           'base', v_base,
           'soma_percentuais', coalesce(round(max(v.soma_pct), 4), 0),
           'socios', coalesce(jsonb_agg(jsonb_build_object(
               'membro_id', v.membro_id,
               'nome', v.nome_curto,
               'percentual', round(v.pct, 4),
               -- A diferença de arredondamento fica com o último da lista.
               'valor', v.bruto + case when v.ordem = v.total and abs(v.soma_pct - 100) < 0.01
                                       then v_base - v.soma_bruto else 0 end,
               'reembolso_pendente', coalesce(rb.valor, 0)
             ) order by v.ordem), '[]'::jsonb))
    into v_divisao
    from valores v
    left join reembolsos rb on rb.membro_id = v.membro_id;

  select jsonb_build_object(
           'parcelas_vencidas', count(*),
           'parcelas_vencidas_saldo', coalesce(sum(vp.saldo), 0))
    into v_pendencias
    from public.v_parcelas vp
   where vp.situacao = 'vencida' and vp.vencimento <= v_fim;

  v_pendencias := v_pendencias || (
    select jsonb_build_object(
             'contas_sem_baixa', count(*),
             'contas_sem_baixa_valor', coalesce(sum(coalesce(vc.saldo, vc.valor)), 0),
             'contas_pagas_em_parte', count(*) filter (where vc.parcial))
      from public.v_contas vc
     where vc.competencia = v_mes and vc.situacao in ('a_pagar', 'vencida', 'sem_valor'));

  return jsonb_build_object(
    'competencia', v_mes,
    'totais', v_totais,
    'divisao', v_divisao,
    'pendencias', v_pendencias);
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.fornecedores enable row level security;
alter table public.centros_custo enable row level security;
alter table public.pagamentos_despesa enable row level security;

create policy "fornecedores: ver" on public.fornecedores
  for select to authenticated using ((select privado.financeiro_le()));
create policy "fornecedores: incluir" on public.fornecedores
  for insert to authenticated with check ((select privado.financeiro_lanca()));
create policy "fornecedores: alterar" on public.fornecedores
  for update to authenticated
  using ((select privado.financeiro_lanca())) with check ((select privado.financeiro_lanca()));

create policy "centros_custo: ver" on public.centros_custo
  for select to authenticated using ((select privado.financeiro_le()));
create policy "centros_custo: incluir" on public.centros_custo
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "centros_custo: alterar" on public.centros_custo
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- Pagamento entra e se estorna só pelas funções acima.
create policy "pagamentos_despesa: ver" on public.pagamentos_despesa
  for select to authenticated using ((select privado.financeiro_le()));

-- Ninguém grava mais a "quitação" à mão: ela vem dos pagamentos.
revoke insert (data_pagamento, pago_por_id, reembolsado_em),
       update (data_pagamento, pago_por_id, reembolsado_em)
  on public.contas from authenticated;
grant insert (tipo, fornecedor_id, centro_custo_id, competencia, competencia_manual),
      update (tipo, fornecedor_id, centro_custo_id, competencia, competencia_manual, motivo_ajuste)
  on public.contas to authenticated;
grant insert (frequencia, mes_referencia, quantidade, valor_total, tipo, fornecedor_id, centro_custo_id),
      update (frequencia, mes_referencia, quantidade, valor_total, tipo, fornecedor_id, centro_custo_id)
  on public.contas_recorrentes to authenticated;
grant update (centro_custo_id) on public.contratos to authenticated;

revoke all on public.fornecedores, public.centros_custo, public.pagamentos_despesa,
  public.v_pagamentos_despesa, public.v_movimentacoes_financeiras, public.v_saldos_contas
  from anon, authenticated;
grant select on public.fornecedores, public.centros_custo, public.pagamentos_despesa,
  public.v_pagamentos_despesa, public.v_movimentacoes_financeiras, public.v_saldos_contas
  to authenticated;
grant insert (nome, documento, contato, observacoes), update (nome, documento, contato, observacoes, ativo)
  on public.fornecedores to authenticated;
grant insert (nome), update (nome, ativo) on public.centros_custo to authenticated;
grant all on public.fornecedores, public.centros_custo, public.pagamentos_despesa,
  public.v_pagamentos_despesa, public.v_movimentacoes_financeiras, public.v_saldos_contas
  to service_role;

revoke execute on function
  public.registrar_pagamento_despesa(jsonb), public.estornar_pagamento_despesa(uuid, text),
  public.registrar_reembolso(uuid, date, uuid), public.previsao_recorrentes(date, date),
  public.impacto_recorrente(uuid), public.aplicar_recorrente_em_abertas(uuid)
  from public, anon;
grant execute on function
  public.registrar_pagamento_despesa(jsonb), public.estornar_pagamento_despesa(uuid, text),
  public.registrar_reembolso(uuid, date, uuid), public.previsao_recorrentes(date, date),
  public.impacto_recorrente(uuid), public.aplicar_recorrente_em_abertas(uuid)
  to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.valor_da_parcela(numeric, integer, integer), privado.meses_entre(date, date),
  privado.ocorrencia_recorrente(public.contas_recorrentes, date)
  to authenticated;
