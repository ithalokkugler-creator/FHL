-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 02 · Financeiro
-- =============================================================================
--
-- Preparação da área dos advogados, seção 6. Controle de caixa manual, sem
-- banco conectado (decisão do Vinícius, por custo), que responde a quatro
-- perguntas:
--
--   1. Quanto entrou e quanto saiu no mês?       recebimentos × contas pagas
--   2. Quem está devendo, e quanto dá hoje?       v_parcelas + cálculo na tela
--   3. Quais contas vencem nos próximos dias?     v_contas
--   4. No fechamento, quanto cabe a cada sócio?   previa_fechamento, fechar_mes
--
-- Regime de caixa: uma entrada pertence ao mês em que foi recebida; uma saída,
-- ao mês em que foi paga. Parcela vencida e conta a pagar não mexem no
-- resultado — aparecem como pendência.
--
-- Níveis: 'lancamentos' (secretária) lança e consulta tudo, menos fechamento e
-- divisão entre sócios; 'completo' vê também esses dois. Fechar, reabrir e
-- mudar a configuração é só do administrador.

-- -----------------------------------------------------------------------------
-- Auxiliares do módulo
-- -----------------------------------------------------------------------------
create function privado.financeiro_lanca()
returns boolean
language sql stable set search_path = ''
as $$
  select privado.acesso_financeiro() in ('lancamentos', 'completo')
$$;

create function privado.financeiro_completo()
returns boolean
language sql stable set search_path = ''
as $$
  select privado.acesso_financeiro() = 'completo'
$$;

create function privado.inicio_mes(p_data date)
returns date
language sql immutable set search_path = ''
as $$
  select p_data - (extract(day from p_data)::integer - 1)
$$;

-- Valor em reais para mensagens de erro: "R$ 1234,56".
create function privado.reais(p_valor numeric)
returns text
language sql immutable set search_path = ''
as $$
  select 'R$ ' || replace(to_char(p_valor, 'FM999999999990.00'), '.', ',')
$$;

-- -----------------------------------------------------------------------------
-- Configuração (6.5, 6.6)
-- -----------------------------------------------------------------------------
create table public.config_financeiro (
  id                     uuid primary key default gen_random_uuid(),
  unica                  boolean not null default true unique check (unica),
  -- Critério padrão de atraso. Os valores iniciais são os do próprio contrato
  -- de honorários do escritório — multa de 10% e juros de 1% ao mês —, que o
  -- protótipo também usava. A fórmula ainda precisa ser validada (6.5).
  multa_pct              numeric(6,3) not null default 10 check (multa_pct between 0 and 100),
  juros_mes_pct          numeric(6,3) not null default 1 check (juros_mes_pct between 0 and 100),
  correcao               text not null default 'nenhuma'
                         check (correcao in ('nenhuma', 'ipca', 'inpc', 'igpm')),
  carencia_dias          smallint not null default 0 check (carencia_dias between 0 and 90),
  pix_chave              text,
  pix_titular            text,
  mensagem_cobranca      text not null,
  -- Regra de divisão (6.6). Só o Vinícius pode definir; até lá vale a mais
  -- simples: partes iguais, depois das despesas.
  divisao_modelo         text not null default 'igual' check (divisao_modelo in ('igual', 'cotas')),
  divisao_despesas_antes boolean not null default true,
  criado_em              timestamptz not null default now(),
  criado_por             uuid,
  alterado_em            timestamptz,
  alterado_por           uuid
);

create table public.categorias (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique check (btrim(nome) <> ''),
  ordem        smallint not null default 0,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create table public.formas_pagamento (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique check (btrim(nome) <> ''),
  ordem        smallint not null default 0,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

-- Quem entra na divisão e com que percentual (usado no modelo 'cotas').
create table public.divisao_cotas (
  id           uuid primary key default gen_random_uuid(),
  membro_id    uuid not null unique references public.membros (id),
  participa    boolean not null default true,
  percentual   numeric(7,4) not null default 0 check (percentual between 0 and 100),
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

-- -----------------------------------------------------------------------------
-- Contratos, parcelas e recebimentos (6.2, 6.3, 6.4 A–C)
-- -----------------------------------------------------------------------------
create table public.contratos (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes (id),
  processo            text,
  descricao           text not null check (btrim(descricao) <> ''),
  -- Êxito nasce "a apurar", sem valor nem parcelas, até o resultado (6.3).
  tipo_honorario      text not null default 'fixo' check (tipo_honorario in ('fixo', 'exito')),
  valor_total         numeric(12,2) check (valor_total > 0),
  exito_pct           numeric(5,2) check (exito_pct > 0 and exito_pct <= 100),
  forma_prevista_id   uuid references public.formas_pagamento (id),
  responsavel_id      uuid references public.membros (id),
  -- Critério de atraso próprio do contrato. Nulo = padrão do escritório.
  multa_pct           numeric(6,3) check (multa_pct between 0 and 100),
  juros_mes_pct       numeric(6,3) check (juros_mes_pct between 0 and 100),
  correcao            text check (correcao in ('nenhuma', 'ipca', 'inpc', 'igpm')),
  carencia_dias       smallint check (carencia_dias between 0 and 90),
  observacoes         text,
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid,
  constraint contrato_fixo_tem_valor check (tipo_honorario <> 'fixo' or valor_total is not null),
  constraint contrato_exito_tem_percentual check (tipo_honorario <> 'exito' or exito_pct is not null)
);

create index contratos_cliente on public.contratos (cliente_id);

-- Renegociar gera parcelas novas e encerra as antigas como "renegociadas",
-- sem apagar nada (6.4 C).
create table public.renegociacoes (
  id                uuid primary key default gen_random_uuid(),
  contrato_id       uuid not null references public.contratos (id),
  motivo            text not null check (btrim(motivo) <> ''),
  saldo_anterior    numeric(12,2) not null,
  valor_renegociado numeric(12,2) not null check (valor_renegociado > 0),
  memoria           jsonb,
  criado_em         timestamptz not null default now(),
  criado_por        uuid,
  alterado_em       timestamptz,
  alterado_por      uuid
);

create index renegociacoes_contrato on public.renegociacoes (contrato_id);

create table public.parcelas (
  id                     uuid primary key default gen_random_uuid(),
  contrato_id            uuid not null references public.contratos (id),
  -- 0 é a entrada.
  numero                 smallint not null check (numero >= 0),
  vencimento             date not null,
  valor                  numeric(12,2) not null check (valor > 0),
  -- A renegociação que encerrou esta parcela, e a que a criou.
  renegociacao_id        uuid references public.renegociacoes (id),
  origem_renegociacao_id uuid references public.renegociacoes (id),
  cancelado_em           timestamptz,
  cancelado_por          uuid,
  motivo_cancelamento    text,
  criado_em              timestamptz not null default now(),
  criado_por             uuid,
  alterado_em            timestamptz,
  alterado_por           uuid,
  constraint parcela_numero_unico unique (contrato_id, numero)
);

create index parcelas_vencimento on public.parcelas (vencimento);

-- O dinheiro que de fato entrou. Uma parcela pode ter vários (pagamento
-- parcial); a entrada avulsa não tem parcela (6.2).
create table public.recebimentos (
  id              uuid primary key default gen_random_uuid(),
  parcela_id      uuid references public.parcelas (id),
  cliente_id      uuid references public.clientes (id),
  tipo_avulsa     text check (tipo_avulsa in ('consulta', 'sucumbencia', 'exito',
                                              'reembolso_custas', 'outros')),
  descricao       text,
  data            date not null,
  valor           numeric(12,2) not null check (valor > 0),
  -- O que abate o saldo da parcela, e o que entrou além disso como multa,
  -- juros e correção (6.4 B).
  valor_principal numeric(12,2) not null check (valor_principal >= 0),
  valor_encargos  numeric(12,2) not null default 0 check (valor_encargos >= 0),
  forma_id        uuid references public.formas_pagamento (id),
  -- O cálculo do dia do pagamento, congelado junto com o recebimento (6.5).
  memoria_calculo jsonb,
  observacao      text,
  estornado_em    timestamptz,
  estornado_por   uuid,
  motivo_estorno  text,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz,
  alterado_por    uuid,
  constraint recebimento_soma check (valor = valor_principal + valor_encargos),
  constraint recebimento_origem check ((parcela_id is null) = (tipo_avulsa is not null))
);

create index recebimentos_parcela on public.recebimentos (parcela_id);
create index recebimentos_data on public.recebimentos (data);
create index recebimentos_cliente on public.recebimentos (cliente_id);

-- -----------------------------------------------------------------------------
-- Contas do escritório (6.4 D)
-- -----------------------------------------------------------------------------
create table public.contas_recorrentes (
  id             uuid primary key default gen_random_uuid(),
  descricao      text not null check (btrim(descricao) <> ''),
  categoria_id   uuid not null references public.categorias (id),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  -- Nulo: valor variável (luz, água), preenchido a cada mês.
  valor          numeric(12,2) check (valor > 0),
  forma_id       uuid references public.formas_pagamento (id),
  inicio         date not null check (extract(day from inicio) = 1),
  fim            date check (extract(day from fim) = 1),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  alterado_em    timestamptz,
  alterado_por   uuid,
  constraint recorrente_periodo check (fim is null or fim >= inicio)
);

create table public.contas (
  id                  uuid primary key default gen_random_uuid(),
  descricao           text not null check (btrim(descricao) <> ''),
  categoria_id        uuid not null references public.categorias (id),
  -- Nulo só em conta recorrente de valor variável ainda não preenchida.
  valor               numeric(12,2) check (valor > 0),
  vencimento          date not null,
  -- O mês a que a conta pertence. Na avulsa, o do vencimento.
  competencia         date not null check (extract(day from competencia) = 1),
  recorrente_id       uuid references public.contas_recorrentes (id),
  data_pagamento      date,
  forma_id            uuid references public.formas_pagamento (id),
  -- Sócio que pagou do próprio bolso e tem reembolso a receber. Nulo = caixa.
  pago_por_id         uuid references public.membros (id),
  reembolsado_em      date,
  observacao          text,
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid,
  constraint conta_recorrente_mes unique (recorrente_id, competencia),
  constraint conta_paga_tem_valor check (data_pagamento is null or valor is not null),
  constraint conta_reembolso check (reembolsado_em is null or pago_por_id is not null)
);

create index contas_competencia on public.contas (competencia);
create index contas_pagamento on public.contas (data_pagamento);

-- -----------------------------------------------------------------------------
-- Cobranças registradas (6.4 C)
-- "Cobrado em 15/09 por Juliana" — a prova de que cobrou. Quem e quando vêm
-- do carimbo.
-- -----------------------------------------------------------------------------
create table public.cobrancas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes (id),
  parcelas      uuid[] not null default '{}',
  canal         text not null check (canal in ('whatsapp', 'telefone', 'email', 'presencial', 'outro')),
  texto         text,
  total_na_data numeric(12,2),
  observacao    text,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  alterado_em   timestamptz,
  alterado_por  uuid
);

create index cobrancas_cliente on public.cobrancas (cliente_id, criado_em desc);

-- -----------------------------------------------------------------------------
-- Fechamento do mês (6.4 E)
-- A foto do mês. Reaberto, o registro continua; o histórico guarda cada versão.
-- -----------------------------------------------------------------------------
create table public.fechamentos (
  id                uuid primary key default gen_random_uuid(),
  competencia       date not null unique check (extract(day from competencia) = 1),
  fechado           boolean not null,
  totais            jsonb not null,
  divisao           jsonb not null,
  pendencias        jsonb not null,
  fechado_em        timestamptz not null,
  fechado_por       uuid,
  reaberto_em       timestamptz,
  reaberto_por      uuid,
  motivo_reabertura text,
  criado_em         timestamptz not null default now(),
  criado_por        uuid,
  alterado_em       timestamptz,
  alterado_por      uuid
);

-- -----------------------------------------------------------------------------
-- Gatilhos
-- -----------------------------------------------------------------------------
select privado.aplicar_padrao(t::regclass)
  from unnest(array[
    'public.config_financeiro', 'public.categorias', 'public.formas_pagamento',
    'public.divisao_cotas', 'public.contratos', 'public.renegociacoes',
    'public.parcelas', 'public.recebimentos', 'public.contas_recorrentes',
    'public.contas', 'public.cobrancas', 'public.fechamentos'
  ]) as t;

create trigger b_cancelamento before update on public.contratos
  for each row execute function privado.registrar_cancelamento();
create trigger b_cancelamento before update on public.parcelas
  for each row execute function privado.registrar_cancelamento();
create trigger b_cancelamento before update on public.contas
  for each row execute function privado.registrar_cancelamento();

-- Mês fechado não aceita alteração (6.4 E). SECURITY DEFINER porque quem só
-- lança não enxerga `fechamentos` — e mesmo assim precisa ser barrado.
create function privado.exigir_mes_aberto(p_data date)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_data is not null and exists (
    select 1 from public.fechamentos f
     where f.competencia = privado.inicio_mes(p_data) and f.fechado
  ) then
    raise exception 'O mês % está fechado. Para mudar um lançamento dele, o administrador precisa reabrir o fechamento.',
      to_char(p_data, 'MM/YYYY') using errcode = 'P0001';
  end if;
end
$$;

create function privado.validar_contrato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.valor_total is distinct from old.valor_total and exists (
    select 1 from public.parcelas p
     where p.contrato_id = new.id and p.renegociacao_id is null and p.cancelado_em is null
  ) then
    raise exception 'O valor total não muda depois que as parcelas existem. Ajuste as parcelas ou renegocie.'
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger c_validar before update on public.contratos
  for each row execute function privado.validar_contrato();

create function privado.validar_parcela()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago numeric;
begin
  if old.renegociacao_id is not null then
    raise exception 'Parcela renegociada não pode ser alterada.' using errcode = 'P0001';
  end if;

  if new.valor is distinct from old.valor then
    select coalesce(sum(r.valor_principal), 0) into v_pago
      from public.recebimentos r
     where r.parcela_id = new.id and r.estornado_em is null;

    if new.valor < v_pago then
      raise exception 'A parcela não pode valer menos do que já foi recebido dela (%).',
        privado.reais(v_pago) using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$$;

create trigger c_validar before update on public.parcelas
  for each row execute function privado.validar_parcela();

create function privado.validar_recebimento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcela  public.parcelas;
  v_contrato public.contratos;
  v_pago     numeric;
begin
  if new.data > privado.hoje() then
    raise exception 'A data do recebimento não pode estar no futuro.' using errcode = 'P0001';
  end if;

  -- Entrada avulsa: tudo é principal, não há encargo.
  if new.parcela_id is null then
    if new.tipo_avulsa is null then
      raise exception 'Informe o tipo da entrada avulsa.' using errcode = 'P0001';
    end if;
    new.valor_principal := new.valor;
    new.valor_encargos  := 0;
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

  if new.valor_principal > v_parcela.valor - v_pago then
    raise exception 'O valor abatido (%) passa do saldo da parcela (%). O que passar entra como encargos.',
      privado.reais(new.valor_principal), privado.reais(v_parcela.valor - v_pago)
      using errcode = 'P0001';
  end if;

  new.cliente_id  := v_contrato.cliente_id;
  new.tipo_avulsa := null;
  return new;
end
$$;

create trigger b_validar before insert on public.recebimentos
  for each row execute function privado.validar_recebimento();

-- Desfazer um recebimento é estornar: exige motivo e não se desfaz (6.4 B).
create function privado.registrar_estorno()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.estornado_em is not null then
    raise exception 'Recebimento estornado não pode ser alterado.' using errcode = 'P0001';
  end if;

  if new.estornado_em is not null then
    if coalesce(btrim(new.motivo_estorno), '') = '' then
      raise exception 'Informe o motivo do estorno.' using errcode = 'P0001';
    end if;
    new.estornado_em  := now();
    new.estornado_por := privado.meu_membro_id();
  else
    new.motivo_estorno := null;
  end if;

  return new;
end
$$;

create trigger b_estorno before update on public.recebimentos
  for each row execute function privado.registrar_estorno();

-- Observação sempre pode ser corrigida; o resto, só com o mês aberto.
create function privado.recebimento_mes_aberto()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_livres constant text[] := array['observacao', 'alterado_em', 'alterado_por'];
begin
  if tg_op = 'INSERT' then
    perform privado.exigir_mes_aberto(new.data);
  elsif to_jsonb(new) - v_livres is distinct from to_jsonb(old) - v_livres then
    perform privado.exigir_mes_aberto(old.data);
  end if;
  return new;
end
$$;

create trigger c_mes_aberto before insert or update on public.recebimentos
  for each row execute function privado.recebimento_mes_aberto();

create function privado.preparar_conta()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.competencia is null then
    new.competencia := privado.inicio_mes(new.vencimento);
  end if;
  if new.data_pagamento is not null and new.data_pagamento > privado.hoje() then
    raise exception 'A data de pagamento não pode estar no futuro.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger c_preparar before insert or update on public.contas
  for each row execute function privado.preparar_conta();

-- Reembolso ao sócio acontece depois do fechamento, então não trava.
create function privado.conta_mes_aberto()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_livres constant text[] := array['observacao', 'reembolsado_em', 'alterado_em', 'alterado_por'];
begin
  if tg_op = 'INSERT' then
    perform privado.exigir_mes_aberto(new.data_pagamento);
  elsif to_jsonb(new) - v_livres is distinct from to_jsonb(old) - v_livres then
    perform privado.exigir_mes_aberto(old.data_pagamento);
    perform privado.exigir_mes_aberto(new.data_pagamento);
  end if;
  return new;
end
$$;

create trigger d_mes_aberto before insert or update on public.contas
  for each row execute function privado.conta_mes_aberto();

-- -----------------------------------------------------------------------------
-- Consultas
-- security_invoker: cada view respeita as políticas de quem consulta.
-- -----------------------------------------------------------------------------
create view public.v_parcelas with (security_invoker = true) as
select
  p.id, p.contrato_id, p.numero, p.vencimento, p.valor,
  p.renegociacao_id, p.origem_renegociacao_id,
  p.cancelado_em, p.motivo_cancelamento,
  c.cliente_id, cl.nome as cliente_nome, cl.telefone as cliente_telefone,
  c.descricao as contrato_descricao, c.processo, c.responsavel_id,
  r.pago_principal, r.pago_encargos, r.ultimo_recebimento,
  p.valor - r.pago_principal as saldo,
  r.pago_principal > 0 and r.pago_principal < p.valor as parcial,
  case
    when r.pago_principal >= p.valor then 'paga'
    when p.renegociacao_id is not null then 'renegociada'
    when p.cancelado_em is not null or c.cancelado_em is not null then 'cancelada'
    when p.vencimento < privado.hoje() then 'vencida'
    else 'a_vencer'
  end as situacao,
  greatest(privado.hoje() - p.vencimento, 0) as dias_atraso,
  -- Critério de atraso efetivo: o do contrato, ou o padrão do escritório.
  coalesce(c.multa_pct, cfg.multa_pct) as multa_pct,
  coalesce(c.juros_mes_pct, cfg.juros_mes_pct) as juros_mes_pct,
  coalesce(c.correcao, cfg.correcao) as correcao,
  coalesce(c.carencia_dias, cfg.carencia_dias) as carencia_dias
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
) r;

create view public.v_contratos with (security_invoker = true) as
select
  c.id, c.cliente_id, cl.nome as cliente_nome, cl.telefone as cliente_telefone,
  c.processo, c.descricao, c.tipo_honorario, c.valor_total, c.exito_pct,
  c.forma_prevista_id, c.responsavel_id,
  c.multa_pct, c.juros_mes_pct, c.correcao, c.carencia_dias,
  c.observacoes, c.cancelado_em, c.cancelado_por, c.motivo_cancelamento,
  c.criado_em, c.criado_por, c.alterado_em, c.alterado_por,
  coalesce(t.parcelas_ativas, 0) as parcelas_ativas,
  coalesce(t.recebido, 0) as recebido,
  coalesce(t.saldo, 0) as saldo,
  coalesce(t.vencidas, 0) as vencidas,
  coalesce(t.saldo_vencido, 0) as saldo_vencido,
  t.proximo_vencimento,
  case
    when c.cancelado_em is not null then 'cancelado'
    when c.tipo_honorario = 'exito' and coalesce(t.parcelas_ativas, 0) = 0 then 'a_apurar'
    when coalesce(t.parcelas_ativas, 0) > 0 and coalesce(t.saldo, 0) = 0 then 'quitado'
    else 'ativo'
  end as situacao
from public.contratos c
join public.clientes cl on cl.id = c.cliente_id
left join lateral (
  select
    count(*) filter (where vp.situacao not in ('renegociada', 'cancelada')) as parcelas_ativas,
    sum(vp.pago_principal + vp.pago_encargos) as recebido,
    sum(vp.saldo) filter (where vp.situacao in ('a_vencer', 'vencida')) as saldo,
    count(*) filter (where vp.situacao = 'vencida') as vencidas,
    sum(vp.saldo) filter (where vp.situacao = 'vencida') as saldo_vencido,
    min(vp.vencimento) filter (where vp.situacao in ('a_vencer', 'vencida')) as proximo_vencimento
  from public.v_parcelas vp
  where vp.contrato_id = c.id
) t on true;

create view public.v_recebimentos with (security_invoker = true) as
select
  r.id, r.parcela_id, r.cliente_id, cl.nome as cliente_nome,
  r.tipo_avulsa, r.descricao, r.data, r.valor, r.valor_principal, r.valor_encargos,
  r.forma_id, f.nome as forma_nome, r.memoria_calculo, r.observacao,
  r.estornado_em, r.estornado_por, r.motivo_estorno,
  r.criado_em, r.criado_por,
  p.numero as parcela_numero, p.contrato_id, c.descricao as contrato_descricao
from public.recebimentos r
left join public.clientes cl on cl.id = r.cliente_id
left join public.formas_pagamento f on f.id = r.forma_id
left join public.parcelas p on p.id = r.parcela_id
left join public.contratos c on c.id = p.contrato_id;

create view public.v_contas with (security_invoker = true) as
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
    when c.data_pagamento is not null then 'paga'
    when c.valor is null then 'sem_valor'
    when c.vencimento < privado.hoje() then 'vencida'
    else 'a_pagar'
  end as situacao
from public.contas c
join public.categorias cat on cat.id = c.categoria_id
left join public.formas_pagamento f on f.id = c.forma_id;

-- Entradas e saídas mês a mês, para o gráfico do painel (6.7).
create function public.serie_mensal(p_ate date, p_meses integer default 12)
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
         coalesce((select sum(c.valor) from public.contas c
                    where c.cancelado_em is null
                      and c.data_pagamento >= m.competencia
                      and c.data_pagamento < (m.competencia + interval '1 month')), 0)
    from meses m
   order by m.competencia
$$;

-- -----------------------------------------------------------------------------
-- Operações de mais de uma tabela
-- Em transação única: ou tudo entra, ou nada. SECURITY DEFINER com a
-- permissão conferida logo na primeira linha.
-- -----------------------------------------------------------------------------

-- Contrato com as parcelas já conferidas na tela (6.4 A, passo 7).
create function public.criar_contrato(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id      uuid;
  v_tipo    text := coalesce(p ->> 'tipo_honorario', 'fixo');
  v_total   numeric := (p ->> 'valor_total')::numeric;
  v_soma    numeric := 0;
  v_parcela jsonb;
  v_entrada public.parcelas;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clientes c where c.id = (p ->> 'cliente_id')::uuid and c.ativo) then
    raise exception 'Escolha um cliente cadastrado.' using errcode = 'P0001';
  end if;

  if v_tipo = 'fixo' and jsonb_array_length(coalesce(p -> 'parcelas', '[]'::jsonb)) = 0 then
    raise exception 'Contrato de valor fixo precisa de pelo menos uma parcela.' using errcode = 'P0001';
  end if;

  insert into public.contratos (
    cliente_id, processo, descricao, tipo_honorario, valor_total, exito_pct,
    forma_prevista_id, responsavel_id, multa_pct, juros_mes_pct, correcao,
    carencia_dias, observacoes)
  values (
    (p ->> 'cliente_id')::uuid,
    nullif(btrim(p ->> 'processo'), ''),
    btrim(p ->> 'descricao'),
    v_tipo,
    v_total,
    (p ->> 'exito_pct')::numeric,
    (p ->> 'forma_prevista_id')::uuid,
    (p ->> 'responsavel_id')::uuid,
    (p ->> 'multa_pct')::numeric,
    (p ->> 'juros_mes_pct')::numeric,
    p ->> 'correcao',
    (p ->> 'carencia_dias')::smallint,
    nullif(btrim(p ->> 'observacoes'), ''))
  returning id into v_id;

  for v_parcela in select value from jsonb_array_elements(coalesce(p -> 'parcelas', '[]'::jsonb)) loop
    insert into public.parcelas (contrato_id, numero, vencimento, valor)
    values (v_id, (v_parcela ->> 'numero')::smallint, (v_parcela ->> 'vencimento')::date,
            (v_parcela ->> 'valor')::numeric);
    v_soma := v_soma + (v_parcela ->> 'valor')::numeric;
  end loop;

  if v_tipo = 'fixo' and v_soma <> v_total then
    raise exception 'A soma das parcelas (%) não fecha com o valor total (%).',
      privado.reais(v_soma), privado.reais(v_total) using errcode = 'P0001';
  end if;

  -- Entrada paga no ato: já nasce com o recebimento. Antes, o protótipo dava
  -- a entrada como recebida sem registro nenhum (3.1).
  if jsonb_typeof(p -> 'entrada_recebida') = 'object' then
    select * into v_entrada from public.parcelas where contrato_id = v_id and numero = 0;
    if not found then
      raise exception 'Não há entrada neste contrato para dar como recebida.' using errcode = 'P0001';
    end if;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id)
    values (v_entrada.id, (p -> 'entrada_recebida' ->> 'data')::date, v_entrada.valor, v_entrada.valor, 0,
            (p -> 'entrada_recebida' ->> 'forma_id')::uuid);
  end if;

  return v_id;
end
$$;

-- Êxito apurado: o valor sai e vira recebível (6.3).
create function public.apurar_exito(p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_total    numeric := (p ->> 'valor_total')::numeric;
  v_soma     numeric := 0;
  v_numero   integer;
  v_parcela  jsonb;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;

  select * into v_contrato from public.contratos where id = (p ->> 'contrato_id')::uuid for update;
  if not found or v_contrato.tipo_honorario <> 'exito' or v_contrato.cancelado_em is not null then
    raise exception 'Só um contrato de êxito ativo pode ser apurado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.parcelas pa
              where pa.contrato_id = v_contrato.id
                and pa.renegociacao_id is null and pa.cancelado_em is null) then
    raise exception 'Este contrato já foi apurado.' using errcode = 'P0001';
  end if;
  if v_total is null or v_total <= 0 then
    raise exception 'Informe o valor dos honorários apurados.' using errcode = 'P0001';
  end if;

  update public.contratos set valor_total = v_total where id = v_contrato.id;

  select coalesce(max(pa.numero), 0) into v_numero
    from public.parcelas pa where pa.contrato_id = v_contrato.id;

  for v_parcela in select value from jsonb_array_elements(coalesce(p -> 'parcelas', '[]'::jsonb)) loop
    v_numero := v_numero + 1;
    insert into public.parcelas (contrato_id, numero, vencimento, valor)
    values (v_contrato.id, v_numero, (v_parcela ->> 'vencimento')::date, (v_parcela ->> 'valor')::numeric);
    v_soma := v_soma + (v_parcela ->> 'valor')::numeric;
  end loop;

  if v_soma <> v_total then
    raise exception 'A soma das parcelas (%) não fecha com o valor apurado (%).',
      privado.reais(v_soma), privado.reais(v_total) using errcode = 'P0001';
  end if;
end
$$;

create function public.renegociar(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato uuid := (p ->> 'contrato_id')::uuid;
  v_ids      uuid[];
  v_qtd      integer;
  v_saldo    numeric;
  v_total    numeric;
  v_ren      uuid;
  v_numero   integer;
  v_nova     jsonb;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  if coalesce(btrim(p ->> 'motivo'), '') = '' then
    raise exception 'Informe o motivo da renegociação.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p -> 'novas', '[]'::jsonb)) = 0 then
    raise exception 'Informe as parcelas novas.' using errcode = 'P0001';
  end if;

  select array_agg(x::uuid) into v_ids
    from jsonb_array_elements_text(coalesce(p -> 'parcelas', '[]'::jsonb)) as x;
  if v_ids is null then
    raise exception 'Escolha as parcelas que entram na renegociação.' using errcode = 'P0001';
  end if;

  perform 1 from public.parcelas where id = any (v_ids) for update;

  select count(*), coalesce(sum(vp.saldo), 0) into v_qtd, v_saldo
    from public.v_parcelas vp
   where vp.id = any (v_ids)
     and vp.contrato_id = v_contrato
     and vp.situacao in ('a_vencer', 'vencida');

  if v_qtd <> cardinality(v_ids) then
    raise exception 'Só parcelas em aberto deste contrato entram na renegociação.' using errcode = 'P0001';
  end if;

  select sum((n ->> 'valor')::numeric) into v_total
    from jsonb_array_elements(p -> 'novas') as n;

  insert into public.renegociacoes (contrato_id, motivo, saldo_anterior, valor_renegociado, memoria)
  values (v_contrato, btrim(p ->> 'motivo'), v_saldo, v_total, p -> 'memoria')
  returning id into v_ren;

  update public.parcelas set renegociacao_id = v_ren where id = any (v_ids);

  select coalesce(max(pa.numero), 0) into v_numero
    from public.parcelas pa where pa.contrato_id = v_contrato;

  for v_nova in select value from jsonb_array_elements(p -> 'novas') loop
    v_numero := v_numero + 1;
    insert into public.parcelas (contrato_id, numero, vencimento, valor, origem_renegociacao_id)
    values (v_contrato, v_numero, (v_nova ->> 'vencimento')::date, (v_nova ->> 'valor')::numeric, v_ren);
  end loop;

  return v_ren;
end
$$;

-- Contas fixas aparecem sozinhas todo mês (6.10). Idempotente: chamar de novo
-- não duplica, e conta cancelada não renasce.
create function public.gerar_contas_do_mes(p_competencia date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes    date := privado.inicio_mes(p_competencia);
  v_ultimo integer;
  v_qtd    integer;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;

  -- Só até o mês que vem: navegar pela tela não deve criar contas de 2030.
  if v_mes > (privado.inicio_mes(privado.hoje()) + interval '1 month')::date then
    return 0;
  end if;

  v_ultimo := extract(day from ((v_mes + interval '1 month')::date - 1))::integer;

  insert into public.contas (descricao, categoria_id, valor, vencimento, competencia, recorrente_id, forma_id)
  select r.descricao, r.categoria_id, r.valor,
         make_date(extract(year from v_mes)::integer, extract(month from v_mes)::integer,
                   least(r.dia_vencimento, v_ultimo)),
         v_mes, r.id, r.forma_id
    from public.contas_recorrentes r
   where r.ativo and r.inicio <= v_mes and (r.fim is null or r.fim >= v_mes)
  on conflict (recorrente_id, competencia) do nothing;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end
$$;

-- -----------------------------------------------------------------------------
-- Fechamento (6.4 E, 6.6)
-- -----------------------------------------------------------------------------
create function public.previa_fechamento(p_competencia date)
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
  if not privado.financeiro_completo() then
    raise exception 'Sem permissão para ver o fechamento.' using errcode = '42501';
  end if;

  select * into v_cfg from public.config_financeiro;

  select coalesce(sum(r.valor), 0) into v_entradas
    from public.recebimentos r
   where r.estornado_em is null and r.data between v_mes and v_fim;

  select coalesce(sum(c.valor), 0) into v_saidas
    from public.contas c
   where c.cancelado_em is null and c.data_pagamento between v_mes and v_fim;

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
    'saidas_por_categoria', (
      select coalesce(jsonb_agg(jsonb_build_object('categoria', t.nome, 'valor', t.total)
                                order by t.total desc), '[]'::jsonb)
        from (select cat.nome, sum(c.valor) as total
                from public.contas c
                join public.categorias cat on cat.id = c.categoria_id
               where c.cancelado_em is null and c.data_pagamento between v_mes and v_fim
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
    select c.pago_por_id as membro_id, sum(c.valor) as valor
      from public.contas c
     where c.cancelado_em is null and c.pago_por_id is not null
       and c.reembolsado_em is null and c.data_pagamento <= v_fim
     group by c.pago_por_id
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
             'contas_sem_baixa_valor', coalesce(sum(vc.valor), 0))
      from public.v_contas vc
     where vc.competencia = v_mes and vc.situacao in ('a_pagar', 'vencida', 'sem_valor'));

  return jsonb_build_object(
    'competencia', v_mes,
    'totais', v_totais,
    'divisao', v_divisao,
    'pendencias', v_pendencias);
end
$$;

create function public.fechar_mes(p_competencia date)
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

create function public.reabrir_mes(p_competencia date, p_motivo text)
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
-- Políticas
-- -----------------------------------------------------------------------------
alter table public.config_financeiro enable row level security;
alter table public.categorias        enable row level security;
alter table public.formas_pagamento  enable row level security;
alter table public.divisao_cotas     enable row level security;
alter table public.fechamentos       enable row level security;

create policy "config_financeiro: ver" on public.config_financeiro
  for select to authenticated using ((select privado.financeiro_lanca()));
create policy "config_financeiro: alterar" on public.config_financeiro
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "categorias: ver" on public.categorias
  for select to authenticated using ((select privado.financeiro_lanca()));
create policy "categorias: incluir" on public.categorias
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "categorias: alterar" on public.categorias
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "formas_pagamento: ver" on public.formas_pagamento
  for select to authenticated using ((select privado.financeiro_lanca()));
create policy "formas_pagamento: incluir" on public.formas_pagamento
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "formas_pagamento: alterar" on public.formas_pagamento
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- A divisão entre sócios não aparece para quem só lança (6.10).
create policy "divisao_cotas: ver" on public.divisao_cotas
  for select to authenticated using ((select privado.financeiro_completo()));
create policy "divisao_cotas: incluir" on public.divisao_cotas
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "divisao_cotas: alterar" on public.divisao_cotas
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- Fechamento só se escreve pelas funções fechar_mes e reabrir_mes.
create policy "fechamentos: ver" on public.fechamentos
  for select to authenticated using ((select privado.financeiro_completo()));

-- Lançamentos do dia a dia: quem lança vê, inclui e altera.
do $$
declare
  t text;
begin
  foreach t in array array['contratos', 'renegociacoes', 'parcelas', 'recebimentos',
                           'contas_recorrentes', 'contas', 'cobrancas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%s: ver" on public.%I for select to authenticated
         using ((select privado.financeiro_lanca()))', t, t);
    execute format(
      'create policy "%s: incluir" on public.%I for insert to authenticated
         with check ((select privado.financeiro_lanca()))', t, t);
    execute format(
      'create policy "%s: alterar" on public.%I for update to authenticated
         using ((select privado.financeiro_lanca()))
         with check ((select privado.financeiro_lanca()))', t, t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- Contrato, parcela e renegociação nascem só pelas funções acima, que
-- conferem a soma. O resto entra direto, coluna a coluna.
-- -----------------------------------------------------------------------------
revoke all on
  public.config_financeiro, public.categorias, public.formas_pagamento,
  public.divisao_cotas, public.contratos, public.renegociacoes, public.parcelas,
  public.recebimentos, public.contas_recorrentes, public.contas, public.cobrancas,
  public.fechamentos, public.v_parcelas, public.v_contratos, public.v_recebimentos,
  public.v_contas
  from anon, authenticated;

grant select on
  public.config_financeiro, public.categorias, public.formas_pagamento,
  public.divisao_cotas, public.contratos, public.renegociacoes, public.parcelas,
  public.recebimentos, public.contas_recorrentes, public.contas, public.cobrancas,
  public.fechamentos, public.v_parcelas, public.v_contratos, public.v_recebimentos,
  public.v_contas
  to authenticated;

grant update (multa_pct, juros_mes_pct, correcao, carencia_dias, pix_chave, pix_titular,
              mensagem_cobranca, divisao_modelo, divisao_despesas_antes)
  on public.config_financeiro to authenticated;

grant insert (nome, ordem) on public.categorias, public.formas_pagamento to authenticated;
grant update (nome, ordem, ativo) on public.categorias, public.formas_pagamento to authenticated;

grant insert (membro_id, participa, percentual) on public.divisao_cotas to authenticated;
grant update (participa, percentual) on public.divisao_cotas to authenticated;

grant update (processo, descricao, forma_prevista_id, responsavel_id, multa_pct, juros_mes_pct,
              correcao, carencia_dias, observacoes, cancelado_em, motivo_cancelamento)
  on public.contratos to authenticated;

grant update (vencimento, valor, cancelado_em, motivo_cancelamento)
  on public.parcelas to authenticated;

grant insert (parcela_id, cliente_id, tipo_avulsa, descricao, data, valor, valor_principal,
              valor_encargos, forma_id, memoria_calculo, observacao)
  on public.recebimentos to authenticated;
grant update (observacao, estornado_em, motivo_estorno)
  on public.recebimentos to authenticated;

grant insert (descricao, categoria_id, dia_vencimento, valor, forma_id, inicio, fim)
  on public.contas_recorrentes to authenticated;
grant update (descricao, categoria_id, dia_vencimento, valor, forma_id, fim, ativo)
  on public.contas_recorrentes to authenticated;

grant insert (descricao, categoria_id, valor, vencimento, data_pagamento, forma_id,
              pago_por_id, reembolsado_em, observacao)
  on public.contas to authenticated;
grant update (descricao, categoria_id, valor, vencimento, data_pagamento, forma_id,
              pago_por_id, reembolsado_em, observacao, cancelado_em, motivo_cancelamento)
  on public.contas to authenticated;

grant insert (cliente_id, parcelas, canal, texto, total_na_data, observacao)
  on public.cobrancas to authenticated;
grant update (observacao) on public.cobrancas to authenticated;

grant all on
  public.config_financeiro, public.categorias, public.formas_pagamento,
  public.divisao_cotas, public.contratos, public.renegociacoes, public.parcelas,
  public.recebimentos, public.contas_recorrentes, public.contas, public.cobrancas,
  public.fechamentos, public.v_parcelas, public.v_contratos, public.v_recebimentos,
  public.v_contas
  to service_role;

revoke execute on function
  public.serie_mensal(date, integer), public.criar_contrato(jsonb), public.apurar_exito(jsonb),
  public.renegociar(jsonb), public.gerar_contas_do_mes(date), public.previa_fechamento(date),
  public.fechar_mes(date), public.reabrir_mes(date, text)
  from public, anon;
grant execute on function
  public.serie_mensal(date, integer), public.criar_contrato(jsonb), public.apurar_exito(jsonb),
  public.renegociar(jsonb), public.gerar_contas_do_mes(date), public.previa_fechamento(date),
  public.fechar_mes(date), public.reabrir_mes(date, text)
  to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function
  privado.financeiro_lanca(), privado.financeiro_completo(), privado.inicio_mes(date),
  privado.reais(numeric), privado.exigir_mes_aberto(date)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Dados iniciais
-- -----------------------------------------------------------------------------
insert into public.config_financeiro (mensagem_cobranca) values (
'Olá, {cliente}! Aqui é {remetente}, da FHL Advocacia.

Consta em aberto: {parcelas}.
Valor atualizado até hoje: {total}.
{pix}
Se o pagamento já foi feito, por favor desconsidere esta mensagem e nos envie o comprovante.');

insert into public.categorias (nome, ordem) values
  ('Aluguel', 1), ('Energia', 2), ('Água', 3), ('Internet e telefone', 4),
  ('Material', 5), ('Copa e café', 6), ('Impostos', 7), ('Custas adiantadas', 8),
  ('Marketing', 9), ('Outros', 99);

insert into public.formas_pagamento (nome, ordem) values
  ('Pix', 1), ('Dinheiro', 2), ('Transferência', 3), ('Cartão', 4), ('Boleto', 5);

-- Os quatro sócios em partes iguais até a regra ser definida (pergunta 1).
insert into public.divisao_cotas (membro_id, participa, percentual)
select m.id, true, 25 from public.membros m where m.papel in ('admin', 'socio');
