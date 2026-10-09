-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 20 · Contratos: código, formalização, arquivamento e plano que fecha sempre
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T02 (R27, R28, R30, R34–R36, R45, R63).
--
--   · Código visível, automático e imutável: C001/2026. Alocado no servidor,
--     com trava por ano — duas criações ao mesmo tempo nunca colidem. Mudar o
--     prefixo nas configurações vale só para os próximos. O id (UUID)
--     continua sendo a chave interna.
--   · Data de formalização (`data_contrato`), que não é a data técnica do
--     cadastro. Os contratos antigos ficam "a confirmar": a data deles não é
--     inventada a partir de `criado_em`.
--   · Vencimento antes da formalização só com confirmação e motivo — e quem
--     confere é o banco, não a tela.
--   · Valor de parcela não se altera mais direto pela API: só pelas funções
--     que mantêm o plano fechando com o total (redistribuir, renegociar,
--     apurar êxito). Mudar vencimento ou cancelar parcela pede motivo e
--     respeita o período fechado; parcela paga não muda nem se cancela.
--   · Arquivar: contrato encerrado sai das listas do dia a dia, com motivo,
--     sem perder nada.

alter table public.contratos
  add column codigo text,
  add column ano_codigo smallint,
  add column numero_codigo integer,
  add column data_contrato date,
  add column data_contrato_origem text check (data_contrato_origem in ('informada', 'a_confirmar')),
  -- Vigência jurídica, quando houver. Não se deduz da última parcela.
  add column data_fim date,
  add column motivo_vencimento_anterior text,
  add column arquivado_em timestamptz,
  add column arquivado_por uuid,
  add column motivo_arquivamento text,
  add constraint contrato_fim_depois check (data_fim is null or data_contrato is null or data_fim >= data_contrato);

create unique index contratos_codigo on public.contratos (codigo) where codigo is not null;

alter table public.parcelas add column motivo_alteracao text;

alter table public.config_financeiro
  add column codigo_prefixo text not null default 'C' check (codigo_prefixo ~ '^[A-Z]{1,4}$');

-- Contador por ano e prefixo, fora da Data API. A linha travada pelo
-- "on conflict do update" serializa duas criações simultâneas.
create table privado.contratos_sequencias (
  ano     smallint not null,
  prefixo text not null,
  ultimo  integer not null,
  primary key (ano, prefixo)
);
revoke all on privado.contratos_sequencias from public, anon, authenticated;

create function privado.alocar_codigo(p_data date, out codigo text, out ano smallint, out numero integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefixo text;
begin
  select cfg.codigo_prefixo into v_prefixo from public.config_financeiro cfg;
  ano := extract(year from coalesce(p_data, privado.hoje()))::smallint;
  loop
    insert into privado.contratos_sequencias as s (ano, prefixo, ultimo)
    values (ano, v_prefixo, 1)
    on conflict on constraint contratos_sequencias_pkey do update set ultimo = s.ultimo + 1
    returning s.ultimo into numero;
    codigo := v_prefixo || lpad(numero::text, greatest(3, length(numero::text)), '0') || '/' || ano;
    -- Código legado importado com o mesmo texto: pula para o próximo.
    exit when not exists (select 1 from public.contratos c where c.codigo = alocar_codigo.codigo);
  end loop;
end
$$;

-- Os contratos que já existem ganham código pela ordem em que foram
-- cadastrados, ano a ano. Gatilhos desligados: contrato cancelado não aceita
-- alteração, e esta carga não é um lançamento de ninguém. Cada código vai
-- para o histórico como "migrou", com a correspondência id → código.
alter table public.contratos disable trigger user;

with ordem as (
  select c.id,
         extract(year from (c.criado_em at time zone 'America/Sao_Paulo'))::smallint as ano,
         row_number() over (partition by extract(year from (c.criado_em at time zone 'America/Sao_Paulo'))
                            order by c.criado_em, c.id) as n
    from public.contratos c
   where c.codigo is null
)
update public.contratos c
   set codigo = 'C' || lpad(o.n::text, greatest(3, length(o.n::text)), '0') || '/' || o.ano,
       ano_codigo = o.ano,
       numero_codigo = o.n,
       data_contrato_origem = 'a_confirmar'
  from ordem o
 where o.id = c.id;

insert into privado.contratos_sequencias (ano, prefixo, ultimo)
select ano_codigo, 'C', max(numero_codigo) from public.contratos where numero_codigo is not null group by ano_codigo;

insert into public.auditoria (tabela, registro_id, acao, campos, depois)
select 'contratos', c.id, 'migrou', array['codigo'],
       jsonb_build_object('codigo', c.codigo, 'data_contrato_origem', c.data_contrato_origem)
  from public.contratos c where c.data_contrato_origem = 'a_confirmar';

alter table public.contratos enable trigger user;

-- -----------------------------------------------------------------------------
-- Regras do contrato
-- -----------------------------------------------------------------------------
create or replace function privado.validar_contrato()
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
  if old.codigo is not null
     and (new.codigo, new.ano_codigo, new.numero_codigo) is distinct from (old.codigo, old.ano_codigo, old.numero_codigo) then
    raise exception 'O código do contrato não muda depois de emitido.' using errcode = 'P0001';
  end if;
  if old.arquivado_em is not null and new.arquivado_em is not null
     and to_jsonb(new) - array['observacoes', 'alterado_em', 'alterado_por']
         is distinct from to_jsonb(old) - array['observacoes', 'alterado_em', 'alterado_por'] then
    raise exception 'Contrato arquivado: desarquive antes de alterar.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create or replace function privado.validar_parcela()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago   numeric;
  v_ajuste numeric;
  v_paga   boolean;
begin
  if old.renegociacao_id is not null then
    raise exception 'Parcela renegociada não pode ser alterada.' using errcode = 'P0001';
  end if;

  select coalesce(sum(r.valor_principal), 0) into v_pago
    from public.recebimentos r
   where r.parcela_id = new.id and r.estornado_em is null;
  select coalesce(sum(case when a.tipo = 'acrescimo' then a.valor else -a.valor end), 0) into v_ajuste
    from public.ajustes_financeiros a
   where a.parcela_id = new.id and a.estornado_em is null;
  v_paga := v_pago >= old.valor + v_ajuste;

  if new.valor is distinct from old.valor then
    if new.valor < v_pago then
      raise exception 'A parcela não pode valer menos do que já foi recebido dela (%).',
        privado.reais(v_pago) using errcode = 'P0001';
    end if;
    perform privado.exigir_mes_aberto(old.vencimento);
  end if;

  if new.vencimento is distinct from old.vencimento then
    if v_paga then
      raise exception 'Parcela paga não muda de vencimento.' using errcode = 'P0001';
    end if;
    if coalesce(btrim(new.motivo_alteracao), '') = '' then
      raise exception 'Informe o motivo da mudança de vencimento.' using errcode = 'P0001';
    end if;
    perform privado.exigir_mes_aberto(old.vencimento);
    perform privado.exigir_mes_aberto(new.vencimento);
  end if;

  if new.cancelado_em is not null and old.cancelado_em is null then
    if v_paga then
      raise exception 'Parcela paga não se cancela. Para devolver o dinheiro, estorne o recebimento.' using errcode = 'P0001';
    end if;
    perform privado.exigir_mes_aberto(old.vencimento);
  end if;

  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Criar contrato: código, formalização e vencimento anterior confirmado
-- -----------------------------------------------------------------------------
create or replace function public.criar_contrato(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id      uuid;
  v_tipo    text := coalesce(p ->> 'tipo_honorario', 'fixo');
  v_total   numeric := (p ->> 'valor_total')::numeric;
  -- Sem data informada (tela antiga, API): fica "a confirmar", sem inventar.
  v_data    date := nullif(p ->> 'data_contrato', '')::date;
  v_soma    numeric := 0;
  v_parcela jsonb;
  v_entrada public.parcelas;
  v_codigo  record;
  v_antes   boolean;
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

  if v_data > privado.hoje() then
    raise exception 'A data do contrato não pode estar no futuro.' using errcode = 'P0001';
  end if;

  -- Vencimento antes da formalização: só confirmado e com motivo.
  select v_data is not null and exists (select 1 from jsonb_array_elements(coalesce(p -> 'parcelas', '[]'::jsonb)) x
                                         where (x ->> 'vencimento')::date < v_data) into v_antes;
  if v_antes and (coalesce((p ->> 'confirmar_vencimento_anterior')::boolean, false) is false
                  or coalesce(btrim(p ->> 'motivo_vencimento_anterior'), '') = '') then
    raise exception 'Há vencimento antes da data do contrato (%). Confirme e informe o motivo.',
      to_char(v_data, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  select * into v_codigo from privado.alocar_codigo(v_data);

  insert into public.contratos (
    cliente_id, processo, descricao, tipo_honorario, valor_total, exito_pct,
    forma_prevista_id, responsavel_id, multa_pct, juros_mes_pct, correcao,
    carencia_dias, observacoes, codigo, ano_codigo, numero_codigo, data_contrato,
    data_contrato_origem, data_fim, motivo_vencimento_anterior, centro_custo_id)
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
    nullif(btrim(p ->> 'observacoes'), ''),
    v_codigo.codigo, v_codigo.ano, v_codigo.numero, v_data,
    case when v_data is null then 'a_confirmar' else 'informada' end,
    nullif(p ->> 'data_fim', '')::date,
    case when v_antes then btrim(p ->> 'motivo_vencimento_anterior') end,
    nullif(p ->> 'centro_custo_id', '')::uuid)
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

  -- Entrada paga no ato: já nasce com o recebimento, na conta informada.
  if jsonb_typeof(p -> 'entrada_recebida') = 'object' then
    select * into v_entrada from public.parcelas where contrato_id = v_id and numero = 0;
    if not found then
      raise exception 'Não há entrada neste contrato para dar como recebida.' using errcode = 'P0001';
    end if;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id,
                                     conta_financeira_id, valor_multa, valor_juros, valor_correcao, valor_acrescimo)
    values (v_entrada.id, (p -> 'entrada_recebida' ->> 'data')::date, v_entrada.valor, v_entrada.valor, 0,
            (p -> 'entrada_recebida' ->> 'forma_id')::uuid,
            nullif(p -> 'entrada_recebida' ->> 'conta_financeira_id', '')::uuid, 0, 0, 0, 0);
  end if;

  return v_id;
end
$$;

-- Formalização de contrato antigo (ou correção da data informada).
create function public.confirmar_formalizacao(p_id uuid, p_data date, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.contratos;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  select * into v from public.contratos where id = p_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'P0001';
  end if;
  if p_data is null or p_data > privado.hoje() then
    raise exception 'Informe a data em que o contrato foi formalizado (não pode estar no futuro).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.parcelas pa where pa.contrato_id = p_id and pa.vencimento < p_data
              and pa.renegociacao_id is null and pa.cancelado_em is null)
     and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Há vencimento antes desta data. Informe o motivo.' using errcode = 'P0001';
  end if;
  if v.data_contrato_origem = 'informada' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'A data de formalização já foi informada. Para corrigi-la, informe o motivo.' using errcode = 'P0001';
  end if;
  update public.contratos
     set data_contrato = p_data, data_contrato_origem = 'informada',
         motivo_vencimento_anterior = coalesce(nullif(btrim(p_motivo), ''), motivo_vencimento_anterior)
   where id = p_id;
end
$$;

create function public.arquivar_contrato(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.v_contratos;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do arquivamento.' using errcode = 'P0001';
  end if;
  perform 1 from public.contratos where id = p_id for update;
  select * into v from public.v_contratos where id = p_id;
  if not found or v.cancelado_em is not null or v.arquivado_em is not null then
    raise exception 'Só um contrato ativo, não arquivado, se arquiva.' using errcode = 'P0001';
  end if;
  if v.saldo <> 0 or v.situacao = 'a_apurar' then
    raise exception 'O contrato ainda tem saldo em aberto ou êxito a apurar. Receba, renegocie ou cancele antes.'
      using errcode = 'P0001';
  end if;
  update public.contratos
     set arquivado_em = now(), arquivado_por = privado.meu_membro_id(), motivo_arquivamento = btrim(p_motivo)
   where id = p_id;
end
$$;

create function public.desarquivar_contrato(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador desarquiva contrato.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo.' using errcode = 'P0001';
  end if;
  update public.contratos
     set arquivado_em = null, arquivado_por = null,
         motivo_arquivamento = 'Desarquivado: ' || btrim(p_motivo)
   where id = p_id and arquivado_em is not null;
  if not found then
    raise exception 'Contrato não está arquivado.' using errcode = 'P0001';
  end if;
end
$$;

-- Redistribuir valores entre parcelas em aberto, sem mudar o total delas:
-- o plano continua fechando com o contrato. Parcela com recebimento fica de
-- fora — o dinheiro já recebido nunca muda de parcela.
create function public.redistribuir_parcelas(p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato uuid := (p ->> 'contrato_id')::uuid;
  v_ids      uuid[];
  v_antes    numeric;
  v_depois   numeric;
  v_item     jsonb;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  if coalesce(btrim(p ->> 'motivo'), '') = '' then
    raise exception 'Informe o motivo.' using errcode = 'P0001';
  end if;

  select array_agg((x ->> 'id')::uuid order by (x ->> 'id')) into v_ids
    from jsonb_array_elements(coalesce(p -> 'parcelas', '[]'::jsonb)) x;
  if v_ids is null or cardinality(v_ids) < 2 then
    raise exception 'Escolha pelo menos duas parcelas.' using errcode = 'P0001';
  end if;

  -- Ordem estável das travas: contrato, depois parcelas por id.
  perform 1 from public.contratos where id = v_contrato for update;
  perform 1 from public.parcelas where id = any (v_ids) order by id for update;

  if (select count(*) from public.v_parcelas vp
       where vp.id = any (v_ids) and vp.contrato_id = v_contrato
         and vp.situacao in ('a_vencer', 'vencida') and vp.pago_principal = 0
         and vp.ajustes_desconto = 0 and vp.ajustes_acrescimo = 0) <> cardinality(v_ids) then
    raise exception 'Só parcelas em aberto deste contrato, sem recebimento nem ajuste, se redistribuem.' using errcode = 'P0001';
  end if;

  select sum(valor) into v_antes from public.parcelas where id = any (v_ids);
  select sum((x ->> 'valor')::numeric) into v_depois from jsonb_array_elements(p -> 'parcelas') x;
  if v_depois is distinct from v_antes then
    raise exception 'A soma nova (%) precisa ser igual à das parcelas escolhidas (%).',
      privado.reais(coalesce(v_depois, 0)), privado.reais(v_antes) using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(p -> 'parcelas') loop
    if (v_item ->> 'valor')::numeric <= 0 then
      raise exception 'Toda parcela precisa de valor maior que zero.' using errcode = 'P0001';
    end if;
    update public.parcelas
       set valor = (v_item ->> 'valor')::numeric,
           vencimento = coalesce(nullif(v_item ->> 'vencimento', '')::date, vencimento),
           motivo_alteracao = btrim(p ->> 'motivo')
     where id = (v_item ->> 'id')::uuid;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- O plano confere? Plano original soma o valor do contrato; cada renegociação
-- soma o valor renegociado. Diferente de zero = divergência (vira alerta).
-- -----------------------------------------------------------------------------
create view public.v_contratos_plano with (security_invoker = true) as
select c.id as contrato_id,
       coalesce(c.valor_total, 0) as valor_total,
       coalesce((select sum(p.valor) from public.parcelas p
                  where p.contrato_id = c.id and p.origem_renegociacao_id is null), 0) as soma_plano_original,
       coalesce((select sum(p.valor) from public.parcelas p
                  where p.contrato_id = c.id and p.origem_renegociacao_id is null), 0) - coalesce(c.valor_total, 0)
       + coalesce((select sum(s.soma - r.valor_renegociado)
                     from public.renegociacoes r
                     cross join lateral (select coalesce(sum(p.valor), 0) as soma from public.parcelas p
                                          where p.origem_renegociacao_id = r.id) s
                    where r.contrato_id = c.id), 0) as diferenca
  from public.contratos c;

-- -----------------------------------------------------------------------------
-- Consultas — colunas novas no fim
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
  p.vencimento = privado.hoje() as vence_hoje,
  c.codigo as contrato_codigo,
  p.motivo_alteracao,
  c.arquivado_em as contrato_arquivado_em
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

create or replace view public.v_contratos with (security_invoker = true) as
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
  end as situacao,
  c.codigo, c.data_contrato, c.data_contrato_origem, c.data_fim, c.centro_custo_id,
  c.arquivado_em, c.arquivado_por, c.motivo_arquivamento, c.motivo_vencimento_anterior,
  case when c.cancelado_em is not null then 'cancelado'
       when c.arquivado_em is not null then 'arquivado'
       else 'ativo' end as ciclo,
  exists (select 1 from public.renegociacoes rn where rn.contrato_id = c.id) as renegociado,
  coalesce(t.parcelas_parciais, 0) as parcelas_parciais,
  pl.diferenca as diferenca_plano,
  -- O rótulo do DOCX, por precedência: cancelado > arquivado > quitado >
  -- êxito a apurar > com pendência > renegociado > em andamento.
  case
    when c.cancelado_em is not null then 'cancelado'
    when c.arquivado_em is not null then 'arquivado'
    when c.tipo_honorario = 'exito' and coalesce(t.parcelas_ativas, 0) = 0 then 'a_apurar'
    when coalesce(t.parcelas_ativas, 0) > 0 and coalesce(t.saldo, 0) = 0 then 'quitado'
    when coalesce(t.vencidas, 0) > 0 then 'com_pendencia'
    when exists (select 1 from public.renegociacoes rn where rn.contrato_id = c.id) then 'renegociado'
    else 'em_andamento'
  end as rotulo,
  coalesce(t.exigivel, 0) as exigivel_total
from public.contratos c
join public.clientes cl on cl.id = c.cliente_id
left join public.v_contratos_plano pl on pl.contrato_id = c.id
left join lateral (
  select
    count(*) filter (where vp.situacao not in ('renegociada', 'cancelada')) as parcelas_ativas,
    sum(vp.pago_principal + vp.pago_encargos) as recebido,
    sum(vp.saldo) filter (where vp.situacao in ('a_vencer', 'vencida')) as saldo,
    count(*) filter (where vp.situacao = 'vencida') as vencidas,
    sum(vp.saldo) filter (where vp.situacao = 'vencida') as saldo_vencido,
    min(vp.vencimento) filter (where vp.situacao in ('a_vencer', 'vencida')) as proximo_vencimento,
    count(*) filter (where vp.parcial and vp.situacao in ('a_vencer', 'vencida')) as parcelas_parciais,
    sum(vp.exigivel) filter (where vp.situacao not in ('renegociada', 'cancelada')) as exigivel
  from public.v_parcelas vp
  where vp.contrato_id = c.id
) t on true;

-- -----------------------------------------------------------------------------
-- Privilégios: valor de parcela só pelas funções; motivo da mudança de
-- vencimento entra junto com a data.
-- -----------------------------------------------------------------------------
revoke update (valor) on public.parcelas from authenticated;
grant update (motivo_alteracao) on public.parcelas to authenticated;
grant update (data_fim) on public.contratos to authenticated;
grant update (codigo_prefixo) on public.config_financeiro to authenticated;

revoke all on public.v_contratos_plano from anon, authenticated;
grant select on public.v_contratos_plano to authenticated;
grant all on public.v_contratos_plano to service_role;

revoke execute on function
  public.confirmar_formalizacao(uuid, date, text), public.arquivar_contrato(uuid, text),
  public.desarquivar_contrato(uuid, text), public.redistribuir_parcelas(jsonb)
  from public, anon;
grant execute on function
  public.confirmar_formalizacao(uuid, date, text), public.arquivar_contrato(uuid, text),
  public.desarquivar_contrato(uuid, text), public.redistribuir_parcelas(jsonb)
  to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
