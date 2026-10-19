-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 29 · Honorários fixo + êxito, contrato encadeado e acordo com repasse
-- =============================================================================
--
-- preparacao-pedidos-advogados.md, Lotes 2 e 3 — pedidos do Vinícius no grupo
-- do escritório (out/2026).
--
-- FIXO + ÊXITO ('misto'). Um valor fixo desde o início e um percentual de
-- êxito apurado no fim do processo, no mesmo contrato.
--   · `valor_total` continua sendo o valor fixo: é o que o contrato em Word
--     mostra, e ele não muda depois que as parcelas existem.
--   · O êxito se apura uma vez (apurar_exito) e vai para `valor_exito`, com a
--     base e a data; as parcelas dele são `parte = 'exito'` e continuam a
--     numeração do contrato.
--   · O êxito puro segue como antes (a apuração grava `valor_total`) e passa
--     a gravar também `valor_exito` e a data. Os já apurados ganham os dois
--     nesta carga.
--   · O plano confere contra fixo + êxito apurado.
--
-- CONTRATO ENCADEADO. `inicia_apos_contrato_id` registra que o contrato
-- começa quando outro do mesmo cliente termina. É o registro: as datas das
-- parcelas são as que a pessoa conferiu na tela.
--
-- ACORDO COM REPASSE. Quando a parte contrária paga o acordo inteiro ao
-- escritório, a parcela cobra o valor bruto — é ele que vence, atrasa e gera
-- alerta —, mas só a cota do escritório é honorário:
--   · `parcelas.cota_escritorio_pct`: 100 é tudo do escritório, como sempre
--     foi. Vale por parcela: no fixo + êxito, o fixo é 100% e o acordo
--     lançado na apuração do êxito, não.
--   · Cada recebimento congela o `valor_repasse` (a parte do cliente) na hora,
--     na mesma proporção — multa e juros de atraso inclusive.
--   · O repasse feito é `repasses_cliente`: sai da conta financeira, não é
--     despesa e não mexe no resultado. Pendente, vira alerta — reter valor do
--     cliente é infração (art. 34, XXI, da Lei 8.906/1994).
--   · Fechamento e divisão entre sócios usam os honorários (recebido −
--     repasse). "Entradas" continua sendo o dinheiro que entrou, que bate com
--     o banco.

-- -----------------------------------------------------------------------------
-- Contratos: o tipo misto, o êxito apurado e o contrato anterior
-- -----------------------------------------------------------------------------
alter table public.contratos
  drop constraint contratos_tipo_honorario_check,
  drop constraint contrato_fixo_tem_valor,
  drop constraint contrato_exito_tem_percentual;

alter table public.contratos
  add column valor_exito numeric(12,2) check (valor_exito > 0),
  add column exito_base numeric(12,2) check (exito_base > 0),
  add column exito_apurado_em timestamptz,
  add column exito_apurado_por uuid,
  add column inicia_apos_contrato_id uuid references public.contratos (id),
  add constraint contratos_tipo_honorario_check check (tipo_honorario in ('fixo', 'exito', 'misto')),
  add constraint contrato_fixo_tem_valor check (tipo_honorario not in ('fixo', 'misto') or valor_total is not null),
  add constraint contrato_exito_tem_percentual check (tipo_honorario not in ('exito', 'misto') or exito_pct is not null),
  add constraint contrato_valor_exito check (valor_exito is null or tipo_honorario in ('exito', 'misto')),
  add constraint contrato_exito_apurado check ((valor_exito is null) = (exito_apurado_em is null)),
  add constraint contrato_inicia_apos_outro check (inicia_apos_contrato_id <> id);

create index contratos_inicia_apos on public.contratos (inicia_apos_contrato_id)
  where inicia_apos_contrato_id is not null;

comment on column public.contratos.valor_total is
  'Fixo e misto: o valor fixo contratado. Êxito: o valor apurado. Não muda depois que as parcelas existem.';
comment on column public.contratos.valor_exito is
  'O êxito apurado (apurar_exito), uma vez. No misto, soma-se ao valor fixo no plano.';
comment on column public.contratos.inicia_apos_contrato_id is
  'Contrato do mesmo cliente depois do qual este começa (contrato encadeado). Só registro.';

-- -----------------------------------------------------------------------------
-- Parcelas: de que parte do contrato vêm e quanto delas é do escritório
-- -----------------------------------------------------------------------------
alter table public.parcelas
  add column parte text not null default 'fixo' check (parte in ('fixo', 'exito')),
  add column cota_escritorio_pct numeric(5,2) not null default 100
    check (cota_escritorio_pct > 0 and cota_escritorio_pct <= 100);

comment on column public.parcelas.cota_escritorio_pct is
  'Quanto da parcela é honorário do escritório. Menos de 100: acordo cujo resto é do cliente (repasse).';

-- -----------------------------------------------------------------------------
-- Recebimentos: a parte do cliente, congelada na hora
-- -----------------------------------------------------------------------------
alter table public.recebimentos
  add column valor_repasse numeric(12,2) not null default 0,
  add constraint recebimento_repasse check (valor_repasse >= 0 and valor_repasse <= valor);

comment on column public.recebimentos.valor_repasse is
  'Parte do cliente neste recebimento (acordo), pela cota da parcela. Calculada ao gravar; não muda.';

-- -----------------------------------------------------------------------------
-- Carga: êxito já apurado antes desta migração
--
-- As parcelas do êxito puro são do êxito, e a apuração ganha valor e data —
-- a da primeira parcela criada. Gatilhos desligados: parcela renegociada e
-- contrato cancelado não aceitam alteração, e esta carga não é um lançamento
-- de ninguém. Cada contrato vai para o histórico como "migrou".
-- -----------------------------------------------------------------------------
alter table public.parcelas disable trigger user;
alter table public.contratos disable trigger user;

update public.parcelas p
   set parte = 'exito'
  from public.contratos c
 where c.id = p.contrato_id and c.tipo_honorario = 'exito';

with apurados as (
  select c.id, min(p.criado_em) as em
    from public.contratos c
    join public.parcelas p on p.contrato_id = c.id
   where c.tipo_honorario = 'exito' and c.valor_total is not null
   group by c.id
)
update public.contratos c
   set valor_exito = c.valor_total, exito_apurado_em = a.em
  from apurados a
 where a.id = c.id;

insert into public.auditoria (tabela, registro_id, acao, campos, depois)
select 'contratos', c.id, 'migrou', array['valor_exito', 'exito_apurado_em'],
       jsonb_build_object('valor_exito', c.valor_exito, 'exito_apurado_em', c.exito_apurado_em)
  from public.contratos c
 where c.exito_apurado_em is not null;

alter table public.contratos enable trigger user;
alter table public.parcelas enable trigger user;

-- -----------------------------------------------------------------------------
-- Repasse ao cliente
--
-- Um por recebimento: o valor inteiro da parte do cliente, na data em que
-- saiu da conta do escritório. Estorna-se com motivo; estornado, o
-- recebimento volta a ter repasse pendente e aceita um novo.
-- -----------------------------------------------------------------------------
create table public.repasses_cliente (
  id                  uuid primary key default gen_random_uuid(),
  recebimento_id      uuid not null references public.recebimentos (id),
  valor               numeric(12,2) not null check (valor > 0),
  data                date not null,
  conta_financeira_id uuid references public.contas_financeiras (id),
  forma_id            uuid references public.formas_pagamento (id),
  observacao          text,
  estornado_em        timestamptz,
  estornado_por       uuid,
  motivo_estorno      text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid
);

create unique index repasses_cliente_ativo on public.repasses_cliente (recebimento_id) where estornado_em is null;
create index repasses_cliente_recebimento on public.repasses_cliente (recebimento_id);
create index repasses_cliente_data on public.repasses_cliente (data);
create index repasses_cliente_conta on public.repasses_cliente (conta_financeira_id);
create index repasses_cliente_forma on public.repasses_cliente (forma_id);

select privado.aplicar_padrao('public.repasses_cliente');
create trigger b_estorno before update on public.repasses_cliente
  for each row execute function privado.registrar_estorno();
create trigger c_mes_aberto before insert or update on public.repasses_cliente
  for each row execute function privado.movimento_mes_aberto();
create trigger y_evento after update on public.repasses_cliente
  for each row execute function privado.evento_estorno();

create function privado.validar_repasse()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rec public.recebimentos;
begin
  if new.data > privado.hoje() then
    raise exception 'A data do repasse não pode estar no futuro.' using errcode = 'P0001';
  end if;

  -- Trava o recebimento: estorno dele e repasse simultâneos não se cruzam.
  select * into v_rec from public.recebimentos where id = new.recebimento_id for update;
  if not found or v_rec.estornado_em is not null then
    raise exception 'Só um recebimento não estornado tem repasse.' using errcode = 'P0001';
  end if;
  if v_rec.valor_repasse <= 0 then
    raise exception 'Este recebimento não tem parte do cliente a repassar.' using errcode = 'P0001';
  end if;
  if new.data < v_rec.data then
    raise exception 'O repasse não pode ser anterior ao recebimento (%).', to_char(v_rec.data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.repasses_cliente r where r.recebimento_id = new.recebimento_id and r.estornado_em is null) then
    raise exception 'Este recebimento já tem o repasse registrado.' using errcode = 'P0001';
  end if;

  -- Sempre a parte inteira do cliente, gravada no recebimento.
  new.valor := v_rec.valor_repasse;

  -- De onde saiu: a conta escolhida, ou a padrão.
  if new.conta_financeira_id is null then
    select c.id into new.conta_financeira_id from public.contas_financeiras c where c.padrao and c.ativo;
  elsif not exists (select 1 from public.contas_financeiras c where c.id = new.conta_financeira_id and c.ativo) then
    raise exception 'Conta financeira inativa não recebe movimentos novos.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger d_validar before insert on public.repasses_cliente
  for each row execute function privado.validar_repasse();

-- -----------------------------------------------------------------------------
-- Regras do contrato: tipo misto, êxito apurado, cota e contrato anterior
-- -----------------------------------------------------------------------------

-- Tipo, êxito apurado e contrato anterior não mudam depois de gravados: o
-- que muda valor de contrato é renegociação, com motivo.
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
  if new.tipo_honorario is distinct from old.tipo_honorario then
    raise exception 'O tipo de honorário não muda depois que o contrato existe.' using errcode = 'P0001';
  end if;
  if old.exito_apurado_em is not null
     and (new.valor_exito, new.exito_base, new.exito_apurado_em, new.exito_apurado_por)
         is distinct from (old.valor_exito, old.exito_base, old.exito_apurado_em, old.exito_apurado_por) then
    raise exception 'O êxito já apurado não muda. Para corrigir valores, renegocie as parcelas dele.' using errcode = 'P0001';
  end if;
  if new.inicia_apos_contrato_id is distinct from old.inicia_apos_contrato_id then
    raise exception 'O contrato anterior (início encadeado) não muda depois de gravado.' using errcode = 'P0001';
  end if;
  if old.arquivado_em is not null and new.arquivado_em is not null
     and to_jsonb(new) - array['observacoes', 'alterado_em', 'alterado_por']
         is distinct from to_jsonb(old) - array['observacoes', 'alterado_em', 'alterado_por'] then
    raise exception 'Contrato arquivado: desarquive antes de alterar.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- Fixo: valor e parcelas. Êxito: percentual, sem parcelas até a apuração.
-- Misto: os dois. Acordo com repasse: fixo com a cota do escritório menor
-- que 100% (no êxito, a cota vem na apuração).
create or replace function public.criar_contrato(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id       uuid;
  v_tipo     text := coalesce(nullif(p ->> 'tipo_honorario', ''), 'fixo');
  v_total    numeric := (p ->> 'valor_total')::numeric;
  v_pct      numeric := nullif(p ->> 'exito_pct', '')::numeric;
  v_cota     numeric := coalesce(nullif(p ->> 'cota_escritorio_pct', '')::numeric, 100);
  v_anterior uuid := nullif(p ->> 'inicia_apos_contrato_id', '')::uuid;
  v_qtd      integer := jsonb_array_length(coalesce(p -> 'parcelas', '[]'::jsonb));
  -- Sem data informada (tela antiga, API): fica "a confirmar", sem inventar.
  v_data     date := nullif(p ->> 'data_contrato', '')::date;
  v_soma     numeric := 0;
  v_parcela  jsonb;
  v_entrada  public.parcelas;
  v_codigo   record;
  v_antes    boolean;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clientes c where c.id = (p ->> 'cliente_id')::uuid and c.ativo) then
    raise exception 'Escolha um cliente cadastrado.' using errcode = 'P0001';
  end if;

  if v_tipo not in ('fixo', 'exito', 'misto') then
    raise exception 'Escolha os honorários: valor fixo, êxito ou fixo + êxito.' using errcode = 'P0001';
  end if;

  if v_tipo in ('fixo', 'misto') then
    if v_qtd = 0 then
      raise exception 'Contrato de valor fixo precisa de pelo menos uma parcela.' using errcode = 'P0001';
    end if;
    if v_total is null or v_total <= 0 then
      raise exception 'Informe o valor total.' using errcode = 'P0001';
    end if;
  else
    -- Êxito puro nasce "a apurar": sem valor nem parcelas até o resultado.
    if v_qtd > 0 then
      raise exception 'Contrato só de êxito nasce sem parcelas: elas vêm na apuração.' using errcode = 'P0001';
    end if;
    v_total := null;
  end if;

  if v_tipo in ('exito', 'misto') then
    if v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'Informe o percentual de êxito, maior que zero e até 100%%.' using errcode = 'P0001';
    end if;
  else
    v_pct := null;
  end if;

  if v_cota <= 0 or v_cota > 100 then
    raise exception 'A cota do escritório vai de 0,01%% a 100%%.' using errcode = 'P0001';
  end if;
  if v_cota < 100 and v_tipo <> 'fixo' then
    raise exception 'Com êxito, a cota do escritório sobre o acordo se informa na apuração.' using errcode = 'P0001';
  end if;

  if v_anterior is not null and not exists (
    select 1 from public.contratos c
     where c.id = v_anterior and c.cliente_id = (p ->> 'cliente_id')::uuid and c.cancelado_em is null
  ) then
    raise exception 'O contrato anterior precisa ser do mesmo cliente e não estar cancelado.' using errcode = 'P0001';
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
    data_contrato_origem, data_fim, motivo_vencimento_anterior, centro_custo_id,
    inicia_apos_contrato_id)
  values (
    (p ->> 'cliente_id')::uuid,
    nullif(btrim(p ->> 'processo'), ''),
    btrim(p ->> 'descricao'),
    v_tipo,
    v_total,
    v_pct,
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
    nullif(p ->> 'centro_custo_id', '')::uuid,
    v_anterior)
  returning id into v_id;

  for v_parcela in select value from jsonb_array_elements(coalesce(p -> 'parcelas', '[]'::jsonb)) loop
    insert into public.parcelas (contrato_id, numero, vencimento, valor, cota_escritorio_pct)
    values (v_id, (v_parcela ->> 'numero')::smallint, (v_parcela ->> 'vencimento')::date,
            (v_parcela ->> 'valor')::numeric, v_cota);
    v_soma := v_soma + (v_parcela ->> 'valor')::numeric;
  end loop;

  if v_tipo in ('fixo', 'misto') and v_soma <> v_total then
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

-- Êxito apurado: o valor sai e vira recebível (6.3). Uma vez só, no êxito puro
-- e no misto. As parcelas são do êxito e continuam a numeração do contrato.
--
-- Acordo com repasse: `valor_total` é o acordo bruto que a parte contrária
-- paga ao escritório, e `cota_escritorio_pct` (normalmente o próprio
-- percentual de êxito) é o que dele é honorário. Sem cota, 100%: o que se
-- lança já são só os honorários.
create or replace function public.apurar_exito(p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_total    numeric := (p ->> 'valor_total')::numeric;
  v_base     numeric := nullif(p ->> 'base', '')::numeric;
  v_cota     numeric := coalesce(nullif(p ->> 'cota_escritorio_pct', '')::numeric, 100);
  v_soma     numeric := 0;
  v_numero   integer;
  v_parcela  jsonb;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;

  select * into v_contrato from public.contratos where id = (p ->> 'contrato_id')::uuid for update;
  if not found or v_contrato.tipo_honorario not in ('exito', 'misto') or v_contrato.cancelado_em is not null then
    raise exception 'Só um contrato com êxito, ativo, pode ser apurado.' using errcode = 'P0001';
  end if;
  if v_contrato.arquivado_em is not null then
    raise exception 'Contrato arquivado: desarquive antes de apurar.' using errcode = 'P0001';
  end if;
  if v_contrato.exito_apurado_em is not null
     or exists (select 1 from public.parcelas pa
                 where pa.contrato_id = v_contrato.id
                   and (pa.parte = 'exito' or v_contrato.tipo_honorario = 'exito')
                   and pa.renegociacao_id is null and pa.cancelado_em is null) then
    raise exception 'Este contrato já foi apurado.' using errcode = 'P0001';
  end if;
  if v_total is null or v_total <= 0 then
    raise exception 'Informe o valor dos honorários apurados.' using errcode = 'P0001';
  end if;
  if v_cota <= 0 or v_cota > 100 then
    raise exception 'A cota do escritório vai de 0,01%% a 100%%.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p -> 'parcelas', '[]'::jsonb)) = 0 then
    raise exception 'Informe as parcelas do êxito.' using errcode = 'P0001';
  end if;

  -- Êxito puro: o valor apurado é o valor do contrato, como sempre foi.
  -- Misto: o fixo fica onde está; o êxito vai para valor_exito.
  update public.contratos
     set valor_total = case when tipo_honorario = 'exito' then v_total else valor_total end,
         valor_exito = v_total,
         exito_base = case when v_base > 0 then v_base end,
         exito_apurado_em = now(),
         exito_apurado_por = privado.meu_membro_id()
   where id = v_contrato.id;

  select coalesce(max(pa.numero), 0) into v_numero
    from public.parcelas pa where pa.contrato_id = v_contrato.id;

  for v_parcela in select value from jsonb_array_elements(coalesce(p -> 'parcelas', '[]'::jsonb)) loop
    v_numero := v_numero + 1;
    insert into public.parcelas (contrato_id, numero, vencimento, valor, parte, cota_escritorio_pct)
    values (v_contrato.id, v_numero, (v_parcela ->> 'vencimento')::date, (v_parcela ->> 'valor')::numeric,
            'exito', v_cota);
    v_soma := v_soma + (v_parcela ->> 'valor')::numeric;
  end loop;

  if v_soma <> v_total then
    raise exception 'A soma das parcelas (%) não fecha com o valor apurado (%).',
      privado.reais(v_soma), privado.reais(v_total) using errcode = 'P0001';
  end if;
end
$$;

-- As parcelas novas herdam das renegociadas a parte (fixo ou êxito) e a cota
-- do escritório. Cotas diferentes não se misturam numa parcela só.
create or replace function public.renegociar(p jsonb)
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
  v_parte    text;
  v_cotas    integer;
  v_cota     numeric;
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

  select case when bool_and(pa.parte = 'exito') then 'exito' else 'fixo' end,
         count(distinct pa.cota_escritorio_pct), min(pa.cota_escritorio_pct)
    into v_parte, v_cotas, v_cota
    from public.parcelas pa where pa.id = any (v_ids);
  if v_cotas > 1 then
    raise exception 'Parcelas com cotas do escritório diferentes não se renegociam juntas. Renegocie cada grupo separadamente.'
      using errcode = 'P0001';
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
    insert into public.parcelas (contrato_id, numero, vencimento, valor, origem_renegociacao_id, parte, cota_escritorio_pct)
    values (v_contrato, v_numero, (v_nova ->> 'vencimento')::date, (v_nova ->> 'valor')::numeric, v_ren,
            v_parte, v_cota);
  end loop;

  return v_ren;
end
$$;

-- -----------------------------------------------------------------------------
-- Recebimento: a parte do cliente congelada na hora
-- -----------------------------------------------------------------------------

-- O mesmo de 08/10 e mais: `valor_repasse` sai da cota da parcela, sobre o
-- valor inteiro recebido (multa e juros na mesma proporção). Entrada avulsa
-- é toda do escritório.
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
    new.valor_repasse := 0;
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

  new.cliente_id    := v_contrato.cliente_id;
  new.tipo_avulsa   := null;
  new.valor_repasse := new.valor - round(new.valor * v_parcela.cota_escritorio_pct / 100, 2);
  return new;
end
$$;

-- Recebimento com repasse feito não se estorna: o dinheiro do cliente já saiu.
-- Estorna-se o repasse antes, com o motivo.
create function privado.recebimento_com_repasse()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estornado_em is not null and old.estornado_em is null and exists (
    select 1 from public.repasses_cliente r where r.recebimento_id = new.id and r.estornado_em is null
  ) then
    raise exception 'Este recebimento tem repasse ao cliente registrado. Estorne o repasse antes.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger b_repasse before update on public.recebimentos
  for each row execute function privado.recebimento_com_repasse();

-- -----------------------------------------------------------------------------
-- Registrar e estornar o repasse
-- -----------------------------------------------------------------------------
create function public.registrar_repasse(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  if nullif(p ->> 'recebimento_id', '') is null then
    raise exception 'Escolha o recebimento.' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'data', '') is null then
    raise exception 'Informe a data do repasse.' using errcode = 'P0001';
  end if;

  -- O valor é sempre a parte inteira do cliente, gravada no recebimento
  -- (validar_repasse confere e trava).
  insert into public.repasses_cliente (recebimento_id, valor, data, conta_financeira_id, forma_id, observacao)
  values ((p ->> 'recebimento_id')::uuid,
          (select r.valor_repasse from public.recebimentos r where r.id = (p ->> 'recebimento_id')::uuid),
          (p ->> 'data')::date,
          nullif(p ->> 'conta_financeira_id', '')::uuid, nullif(p ->> 'forma_id', '')::uuid,
          nullif(btrim(p ->> 'observacao'), ''))
  returning id into v_id;
  return v_id;
end
$$;

create function public.estornar_repasse(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode = '42501';
  end if;
  -- A trava do recebimento, na mesma ordem do registro.
  perform 1 from public.recebimentos r join public.repasses_cliente rp on rp.recebimento_id = r.id
   where rp.id = p_id for update of r;
  update public.repasses_cliente set estornado_em = now(), motivo_estorno = p_motivo
   where id = p_id and estornado_em is null;
  if not found then
    raise exception 'Repasse não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Consultas — colunas novas sempre no fim (create or replace view não reordena)
-- -----------------------------------------------------------------------------

-- O plano confere contra o contratado: no misto, o fixo mais o êxito apurado.
create or replace view public.v_contratos_plano with (security_invoker = true) as
select c.id as contrato_id,
       coalesce(c.valor_total, 0)
       + case when c.tipo_honorario = 'misto' then coalesce(c.valor_exito, 0) else 0 end as valor_total,
       coalesce((select sum(p.valor) from public.parcelas p
                  where p.contrato_id = c.id and p.origem_renegociacao_id is null), 0) as soma_plano_original,
       coalesce((select sum(p.valor) from public.parcelas p
                  where p.contrato_id = c.id and p.origem_renegociacao_id is null), 0) - coalesce(c.valor_total, 0)
       - case when c.tipo_honorario = 'misto' then coalesce(c.valor_exito, 0) else 0 end
       + coalesce((select sum(s.soma - r.valor_renegociado)
                     from public.renegociacoes r
                     cross join lateral (select coalesce(sum(p.valor), 0) as soma from public.parcelas p
                                          where p.origem_renegociacao_id = r.id) s
                    where r.contrato_id = c.id), 0) as diferenca
  from public.contratos c;

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
  c.arquivado_em as contrato_arquivado_em,
  p.parte,
  p.cota_escritorio_pct,
  -- A parte do escritório (honorário) no valor, no que se exige e no saldo.
  round(p.valor * p.cota_escritorio_pct / 100, 2) as valor_escritorio,
  round((p.valor + a.acrescimos - a.descontos) * p.cota_escritorio_pct / 100, 2) as exigivel_escritorio,
  round((p.valor + a.acrescimos - a.descontos - r.pago_principal) * p.cota_escritorio_pct / 100, 2) as saldo_escritorio,
  c.tipo_honorario as contrato_tipo_honorario
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
  c.responsavel_id as contrato_responsavel_id,
  -- Acordo: a parte do cliente, o honorário e o repasse (no máximo um ativo).
  r.valor_repasse,
  r.valor - r.valor_repasse as valor_escritorio,
  coalesce(p.cota_escritorio_pct, 100) as cota_escritorio_pct,
  rp.id as repasse_id,
  rp.data as repasse_data,
  rp.conta_financeira_id as repasse_conta_financeira_id,
  cfr.nome as repasse_conta_financeira_nome,
  case when r.valor_repasse = 0 or r.estornado_em is not null then 'nao_se_aplica'
       when rp.id is not null then 'feito'
       else 'pendente' end as repasse_situacao,
  c.codigo as contrato_codigo,
  p.parte as parcela_parte
from public.recebimentos r
left join public.clientes cl on cl.id = r.cliente_id
left join public.formas_pagamento f on f.id = r.forma_id
left join public.parcelas p on p.id = r.parcela_id
left join public.contratos c on c.id = p.contrato_id
left join public.contas_financeiras cf on cf.id = r.conta_financeira_id
left join public.repasses_cliente rp on rp.recebimento_id = r.id and rp.estornado_em is null
left join public.contas_financeiras cfr on cfr.id = rp.conta_financeira_id;

create or replace view public.v_movimentacoes_financeiras with (security_invoker = true) as
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
  from public.transferencias_financeiras t
union all
-- A parte do cliente que saiu para ele: sai da conta, não é despesa.
select 'repasse_cliente', rp.id, 'saida', rp.conta_financeira_id, rp.data, rp.valor, rp.estornado_em,
       'Repasse a ' || coalesce(cl.nome, 'cliente'), r.cliente_id, null
  from public.repasses_cliente rp
  join public.recebimentos r on r.id = rp.recebimento_id
  left join public.clientes cl on cl.id = r.cliente_id;

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
  -- Misto com o fixo quitado e o êxito por apurar: "a apurar", não quitado
  -- (assim não se arquiva antes do resultado).
  case
    when c.cancelado_em is not null then 'cancelado'
    when c.tipo_honorario = 'exito' and c.exito_apurado_em is null and coalesce(t.parcelas_ativas, 0) = 0 then 'a_apurar'
    when c.tipo_honorario = 'misto' and c.exito_apurado_em is null and coalesce(t.saldo, 0) = 0 then 'a_apurar'
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
    when c.tipo_honorario = 'exito' and c.exito_apurado_em is null and coalesce(t.parcelas_ativas, 0) = 0 then 'a_apurar'
    when c.tipo_honorario = 'misto' and c.exito_apurado_em is null and coalesce(t.saldo, 0) = 0 then 'a_apurar'
    when coalesce(t.parcelas_ativas, 0) > 0 and coalesce(t.saldo, 0) = 0 then 'quitado'
    when coalesce(t.vencidas, 0) > 0 then 'com_pendencia'
    when exists (select 1 from public.renegociacoes rn where rn.contrato_id = c.id) then 'renegociado'
    else 'em_andamento'
  end as rotulo,
  coalesce(t.exigivel, 0) as exigivel_total,
  c.valor_exito, c.exito_base, c.exito_apurado_em, c.exito_apurado_por, c.inicia_apos_contrato_id,
  -- Há êxito por apurar (puro ou misto)? É o que mostra "Apurar êxito".
  c.cancelado_em is null and c.tipo_honorario in ('exito', 'misto') and c.exito_apurado_em is null
    and not (c.tipo_honorario = 'exito' and coalesce(t.parcelas_ativas, 0) > 0) as exito_pendente,
  -- O último vencimento vigente: de onde parte o contrato encadeado.
  t.ultimo_vencimento,
  -- Acordo: o que do contrato é honorário, e a parte do cliente ainda não repassada.
  coalesce(t.exigivel_escritorio, 0) as exigivel_escritorio_total,
  coalesce(t.cota_minima, 100) < 100 as tem_repasse,
  coalesce(rp.pendente, 0) as repasse_pendente,
  coalesce(rp.pendentes, 0) as repasses_pendentes
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
    sum(vp.exigivel) filter (where vp.situacao not in ('renegociada', 'cancelada')) as exigivel,
    max(vp.vencimento) filter (where vp.situacao not in ('renegociada', 'cancelada')) as ultimo_vencimento,
    sum(vp.exigivel_escritorio) filter (where vp.situacao not in ('renegociada', 'cancelada')) as exigivel_escritorio,
    min(vp.cota_escritorio_pct) filter (where vp.situacao not in ('renegociada', 'cancelada')) as cota_minima
  from public.v_parcelas vp
  where vp.contrato_id = c.id
) t on true
left join lateral (
  select sum(r.valor_repasse) as pendente, count(*) as pendentes
    from public.recebimentos r
    join public.parcelas pr on pr.id = r.parcela_id
   where pr.contrato_id = c.id and r.estornado_em is null and r.valor_repasse > 0
     and not exists (select 1 from public.repasses_cliente rc
                      where rc.recebimento_id = r.id and rc.estornado_em is null)
) rp on true;

-- Arquivar pede também o repasse ao cliente feito: o dinheiro dele não fica
-- esquecido num contrato fora das listas.
create or replace function public.arquivar_contrato(p_id uuid, p_motivo text)
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
  if v.saldo <> 0 or v.situacao = 'a_apurar' or v.exito_pendente then
    raise exception 'O contrato ainda tem saldo em aberto ou êxito a apurar. Receba, renegocie ou cancele antes.'
      using errcode = 'P0001';
  end if;
  if v.repasse_pendente > 0 then
    raise exception 'O contrato tem repasse ao cliente pendente (%). Registre o repasse antes de arquivar.',
      privado.reais(v.repasse_pendente) using errcode = 'P0001';
  end if;
  update public.contratos
     set arquivado_em = now(), arquivado_por = privado.meu_membro_id(), motivo_arquivamento = btrim(p_motivo)
   where id = p_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Posição numa data de corte e fechamento anual
-- -----------------------------------------------------------------------------

-- A parcela valia no corte? Do plano original, se o contrato existia; de uma
-- renegociação ou de êxito apurado, se já tinha sido criada. E ainda não
-- tinha sido renegociada nem cancelada. No misto, só as parcelas do êxito
-- nascem na apuração; as do fixo valem desde o contrato.
create or replace function privado.parcela_vigente(p public.parcelas, c public.contratos, p_corte date)
returns boolean
language sql stable set search_path = ''
as $$
  select privado.contrato_existia(c, p_corte)
     and case
           when p.origem_renegociacao_id is not null then
             (select (r.criado_em at time zone 'America/Sao_Paulo')::date from public.renegociacoes r
               where r.id = p.origem_renegociacao_id) <= p_corte
           when p.parte = 'exito' or c.tipo_honorario = 'exito' then (p.criado_em at time zone 'America/Sao_Paulo')::date <= p_corte
           else true
         end
     and (p.cancelado_em is null or (p.cancelado_em at time zone 'America/Sao_Paulo')::date > p_corte)
     and (p.renegociacao_id is null
          or (select (r.criado_em at time zone 'America/Sao_Paulo')::date from public.renegociacoes r
               where r.id = p.renegociacao_id) > p_corte)
$$;

-- O misto com o fixo quitado e o êxito ainda não apurado no corte fica "a
-- apurar", como o êxito puro sem parcelas.
create or replace function public.posicao_financeira_em(p_corte date)
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
           when c.tipo_honorario = 'misto'
                and (c.exito_apurado_em is null or (c.exito_apurado_em at time zone 'America/Sao_Paulo')::date > p_corte)
                and sum(greatest(pp.valor + pp.ajuste - pp.principal, 0)) = 0 then 'a_apurar'
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

-- Repasses a clientes saem do resultado de cada mês e do ano: entram no caixa,
-- mas não são do escritório.
create or replace function public.previa_fechamento_anual(p_ano integer)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_de       date := make_date(p_ano, 1, 1);
  v_corte    date := make_date(p_ano, 12, 31);
  v_meses    jsonb;
  v_abertos  jsonb;
  v_totais   jsonb;
  v_posicao  jsonb;
  v_pend     jsonb;
  v_exig     numeric;
  v_receb    numeric;
  v_repasses numeric;
begin
  if not privado.financeiro_fechamento_le() then
    raise exception 'Sem permissão para ver o fechamento.' using errcode = '42501';
  end if;

  -- Mês a mês: caixa (recebido e pago), repasses e se o mês está fechado.
  select jsonb_agg(jsonb_build_object(
           'competencia', m.mes,
           'fechado', coalesce(f.fechado, false),
           'entradas', s.entradas,
           'saidas', s.saidas,
           'repasses', rp.valor,
           'resultado', s.entradas - rp.valor - s.saidas) order by m.mes),
         coalesce(jsonb_agg(m.mes order by m.mes) filter (where not coalesce(f.fechado, false)), '[]'::jsonb)
    into v_meses, v_abertos
    from (select (v_de + make_interval(months => g))::date as mes from generate_series(0, 11) g) m
    left join public.fechamentos f on f.competencia = m.mes
    join public.serie_mensal(v_corte, 12) s on s.competencia = m.mes
    cross join lateral (
      select coalesce(sum(r.valor_repasse), 0) as valor
        from public.recebimentos r
       where r.estornado_em is null and r.data >= m.mes and r.data < (m.mes + interval '1 month')
    ) rp;

  select coalesce(sum(r.valor_repasse), 0) into v_repasses
    from public.recebimentos r
   where r.estornado_em is null and r.data between v_de and v_corte;

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
           'taxa_denominador', v_exig,
           'repasses_clientes', v_repasses)
    into v_totais;
  v_totais := v_totais || jsonb_build_object(
    'honorarios_recebidos', (v_totais ->> 'receitas_recebidas')::numeric - v_repasses,
    'saldo_previsto', (v_totais ->> 'receitas_previstas')::numeric - (v_totais ->> 'despesas_previstas')::numeric,
    'saldo_realizado', (v_totais ->> 'receitas_recebidas')::numeric - v_repasses - (v_totais ->> 'despesas_pagas')::numeric);

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
    'regra', 'posicao-corte-2026-10-19',
    'calculado_em', now(),
    'meses', v_meses,
    'totais', v_totais,
    'posicao', coalesce(v_posicao, '[]'::jsonb),
    'pendencias', v_pend);
end
$$;

-- -----------------------------------------------------------------------------
-- Fechamento do mês, painel e alertas: honorários = recebido − repasse
-- -----------------------------------------------------------------------------

-- Entradas: o dinheiro que entrou no mês. Repasses: a parte dos clientes
-- nesse dinheiro (acordos). Honorários: a diferença — é dela que saem o
-- resultado e a divisão entre os sócios. Sem acordo, repasses = 0 e tudo fica
-- como era.
create or replace function public.previa_fechamento(p_competencia date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mes        date := privado.inicio_mes(p_competencia);
  v_fim        date := (privado.inicio_mes(p_competencia) + interval '1 month')::date - 1;
  v_cfg        public.config_financeiro;
  v_entradas   numeric;
  v_repasses   numeric;
  v_honorarios numeric;
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

  select coalesce(sum(r.valor), 0), coalesce(sum(r.valor_repasse), 0) into v_entradas, v_repasses
    from public.recebimentos r
   where r.estornado_em is null and r.data between v_mes and v_fim;
  v_honorarios := v_entradas - v_repasses;

  select coalesce(sum(p.valor), 0) into v_saidas
    from public.pagamentos_despesa p
   where p.estornado_em is null and p.data between v_mes and v_fim;

  v_resultado := v_honorarios - v_saidas;

  select jsonb_build_object(
           'entradas', v_entradas,
           'saidas', v_saidas,
           'resultado', v_resultado,
           'principal_parcelas', coalesce(sum(r.valor_principal) filter (where r.parcela_id is not null), 0),
           'encargos', coalesce(sum(r.valor_encargos), 0),
           'avulsas', coalesce(sum(r.valor) filter (where r.parcela_id is null), 0),
           'recebimentos', count(*),
           'repasses', v_repasses,
           'honorarios', v_honorarios)
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
               group by 1) as t),
    'repasses_feitos', (select coalesce(sum(rc.valor), 0) from public.repasses_cliente rc
                         where rc.estornado_em is null and rc.data between v_mes and v_fim));

  v_base := case when v_cfg.divisao_despesas_antes then v_resultado else v_honorarios end;

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

  -- A parte de clientes recebida até o fim do mês e ainda não repassada nele.
  v_pendencias := v_pendencias || (
    select jsonb_build_object(
             'repasses_pendentes', count(*),
             'repasses_pendentes_valor', coalesce(sum(r.valor_repasse), 0))
      from public.recebimentos r
     where r.estornado_em is null and r.valor_repasse > 0 and r.data <= v_fim
       and not exists (select 1 from public.repasses_cliente rc
                        where rc.recebimento_id = r.id and rc.estornado_em is null and rc.data <= v_fim));

  return jsonb_build_object(
    'competencia', v_mes,
    'totais', v_totais,
    'divisao', v_divisao,
    'pendencias', v_pendencias);
end
$$;

-- O de 08/10 e mais: os repasses a clientes do período, os honorários
-- recebidos (recebido − repasse) e a receita prevista do escritório. Os
-- saldos previsto e realizado passam a contar só o que é do escritório.
create or replace function public.resumo_financeiro(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_de       date := coalesce(nullif(p ->> 'de', '')::date, privado.inicio_mes(privado.hoje()));
  v_ate      date := coalesce(nullif(p ->> 'ate', '')::date,
                              (privado.inicio_mes(privado.hoje()) + interval '1 month')::date - 1);
  v_hoje     date := privado.hoje();
  v_cliente  uuid := nullif(p ->> 'cliente_id', '')::uuid;
  v_resp     uuid := nullif(p ->> 'responsavel_id', '')::uuid;
  v_contrato uuid := nullif(p ->> 'contrato_id', '')::uuid;
  v_categ    uuid := nullif(p ->> 'categoria_id', '')::uuid;
  v_centro   uuid := nullif(p ->> 'centro_custo_id', '')::uuid;
  v_conta    uuid := nullif(p ->> 'conta_financeira_id', '')::uuid;
  v_ind      jsonb;
  v_serie    jsonb;
  v_exig     numeric;
  v_receb    numeric;
begin
  if not privado.financeiro_le() then
    raise exception 'Sem acesso ao Financeiro.' using errcode = '42501';
  end if;
  if v_ate < v_de then
    raise exception 'O fim do período vem antes do início.' using errcode = 'P0001';
  end if;
  if v_ate - v_de > 3 * 366 then
    raise exception 'Escolha um período de até três anos.' using errcode = 'P0001';
  end if;

  -- Coorte da taxa: parcelas vigentes que venceram no período (até hoje).
  select coalesce(sum(vp.exigivel), 0), coalesce(sum(least(vp.pago_principal, vp.exigivel)), 0)
    into v_exig, v_receb
    from public.v_parcelas vp
   where vp.situacao not in ('renegociada', 'cancelada')
     and vp.vencimento between v_de and least(v_ate, v_hoje)
     and (v_cliente is null or vp.cliente_id = v_cliente)
     and (v_resp is null or vp.responsavel_id = v_resp)
     and (v_contrato is null or vp.contrato_id = v_contrato);

  with parcelas as (
    select vp.* from public.v_parcelas vp
     where vp.situacao not in ('renegociada', 'cancelada')
       and vp.vencimento between v_de and v_ate
       and (v_cliente is null or vp.cliente_id = v_cliente)
       and (v_resp is null or vp.responsavel_id = v_resp)
       and (v_contrato is null or vp.contrato_id = v_contrato)
  ),
  recebidos as (
    select r.* from public.v_recebimentos r
     where r.estornado_em is null and r.data between v_de and v_ate
       and (v_cliente is null or r.cliente_id = v_cliente)
       and (v_contrato is null or r.contrato_id = v_contrato)
       and (v_conta is null or r.conta_financeira_id = v_conta)
       and (v_resp is null or exists (select 1 from public.contratos c where c.id = r.contrato_id and c.responsavel_id = v_resp))
  ),
  despesas as (
    select vc.valor from public.v_contas vc
     where vc.situacao <> 'cancelada'
       and vc.competencia between privado.inicio_mes(v_de) and v_ate
       and (v_categ is null or vc.categoria_id = v_categ)
       and (v_centro is null or vc.centro_custo_id = v_centro)
    union all
    select pr.valor from public.previsao_recorrentes(v_de, v_ate) pr
     where (v_categ is null or pr.categoria_id = v_categ)
       and (v_centro is null or pr.centro_custo_id = v_centro)
  ),
  pagos as (
    select pd.* from public.v_pagamentos_despesa pd
     where pd.estornado_em is null and pd.data between v_de and v_ate
       and (v_categ is null or pd.categoria_id = v_categ)
       and (v_centro is null or pd.centro_custo_id = v_centro)
       and (v_conta is null or pd.conta_financeira_id = v_conta)
  ),
  atencao as (
    select vc.id from public.v_contratos vc
     where vc.ciclo = 'ativo'
       and (vc.vencidas > 0 or vc.diferenca_plano <> 0
            or (vc.data_fim between v_hoje and v_hoje + 30))
       and (v_cliente is null or vc.cliente_id = v_cliente)
       and (v_resp is null or vc.responsavel_id = v_resp)
       and (v_contrato is null or vc.id = v_contrato)
  )
  select jsonb_build_object(
    'receita_prevista', jsonb_build_object('valor', (select coalesce(sum(exigivel), 0) from parcelas),
                                           'quantidade', (select count(*) from parcelas)),
    'receita_recebida', jsonb_build_object('valor', (select coalesce(sum(valor), 0) from recebidos),
                                           'quantidade', (select count(*) from recebidos),
                                           'encargos', (select coalesce(sum(valor_encargos), 0) from recebidos)),
    'repasses_clientes', jsonb_build_object('valor', (select coalesce(sum(valor_repasse), 0) from recebidos),
                                            'quantidade', (select count(*) from recebidos where valor_repasse > 0),
                                            'pendente', (select coalesce(sum(valor_repasse), 0) from recebidos
                                                          where repasse_situacao = 'pendente')),
    'honorarios_recebidos', jsonb_build_object('valor', (select coalesce(sum(valor_escritorio), 0) from recebidos),
                                               'quantidade', (select count(*) from recebidos)),
    'receita_prevista_escritorio', jsonb_build_object('valor', (select coalesce(sum(exigivel_escritorio), 0) from parcelas),
                                                      'quantidade', (select count(*) from parcelas)),
    'receita_a_vencer', jsonb_build_object('valor', (select coalesce(sum(saldo), 0) from parcelas where situacao = 'a_vencer'),
                                           'quantidade', (select count(*) from parcelas where situacao = 'a_vencer'),
                                           'vence_hoje', (select coalesce(sum(saldo), 0) from parcelas where situacao = 'a_vencer' and vence_hoje)),
    'receita_vencida', jsonb_build_object('valor', (select coalesce(sum(saldo), 0) from parcelas where situacao = 'vencida'),
                                          'quantidade', (select count(*) from parcelas where situacao = 'vencida')),
    'despesas_previstas', jsonb_build_object('valor', (select coalesce(sum(valor), 0) from despesas),
                                             'quantidade', (select count(*) from despesas),
                                             'sem_valor', (select count(*) from despesas where valor is null)),
    'despesas_pagas', jsonb_build_object('valor', (select coalesce(sum(valor), 0) from pagos),
                                         'quantidade', (select count(*) from pagos)),
    'taxa_recebimento', jsonb_build_object('valor', case when v_exig > 0 then round(v_receb * 100 / v_exig, 2) end,
                                           'numerador', v_receb, 'denominador', v_exig),
    'contratos_atencao', jsonb_build_object('quantidade', (select count(*) from atencao)),
    'estoque_vencido', jsonb_build_object(
      'valor', (select coalesce(sum(vp.saldo), 0) from public.v_parcelas vp
                 where vp.situacao = 'vencida'
                   and (v_cliente is null or vp.cliente_id = v_cliente)
                   and (v_resp is null or vp.responsavel_id = v_resp)
                   and (v_contrato is null or vp.contrato_id = v_contrato)),
      'quantidade', (select count(*) from public.v_parcelas vp
                      where vp.situacao = 'vencida'
                        and (v_cliente is null or vp.cliente_id = v_cliente)
                        and (v_resp is null or vp.responsavel_id = v_resp)
                        and (v_contrato is null or vp.contrato_id = v_contrato))))
    into v_ind;

  v_ind := v_ind || jsonb_build_object(
    'saldo_previsto', jsonb_build_object('valor', (v_ind #>> '{receita_prevista_escritorio,valor}')::numeric
                                                  - (v_ind #>> '{despesas_previstas,valor}')::numeric),
    'saldo_realizado', jsonb_build_object('valor', (v_ind #>> '{honorarios_recebidos,valor}')::numeric
                                                   - (v_ind #>> '{despesas_pagas,valor}')::numeric));

  -- Série mês a mês do período (até 36 meses).
  with meses as (
    select g::date as mes
      from generate_series(privado.inicio_mes(v_de), privado.inicio_mes(v_ate), interval '1 month') g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'competencia', m.mes,
           'receita_prevista', (select coalesce(sum(vp.exigivel), 0) from public.v_parcelas vp
                                 where vp.situacao not in ('renegociada', 'cancelada')
                                   and vp.vencimento >= m.mes and vp.vencimento < (m.mes + interval '1 month')
                                   and vp.vencimento between v_de and v_ate
                                   and (v_cliente is null or vp.cliente_id = v_cliente)
                                   and (v_resp is null or vp.responsavel_id = v_resp)
                                   and (v_contrato is null or vp.contrato_id = v_contrato)),
           'receita_recebida', (select coalesce(sum(r.valor), 0) from public.v_recebimentos r
                                 where r.estornado_em is null
                                   and r.data >= m.mes and r.data < (m.mes + interval '1 month')
                                   and r.data between v_de and v_ate
                                   and (v_cliente is null or r.cliente_id = v_cliente)
                                   and (v_contrato is null or r.contrato_id = v_contrato)
                                   and (v_resp is null or exists (select 1 from public.contratos c where c.id = r.contrato_id and c.responsavel_id = v_resp))
                                   and (v_conta is null or r.conta_financeira_id = v_conta)),
           'repasses', (select coalesce(sum(r.valor_repasse), 0) from public.v_recebimentos r
                         where r.estornado_em is null
                           and r.data >= m.mes and r.data < (m.mes + interval '1 month')
                           and r.data between v_de and v_ate
                           and (v_cliente is null or r.cliente_id = v_cliente)
                           and (v_contrato is null or r.contrato_id = v_contrato)
                           and (v_resp is null or exists (select 1 from public.contratos c where c.id = r.contrato_id and c.responsavel_id = v_resp))
                           and (v_conta is null or r.conta_financeira_id = v_conta)),
           'despesa_prevista', (select coalesce(sum(vc.valor), 0) from public.v_contas vc
                                 where vc.situacao <> 'cancelada' and vc.competencia = m.mes
                                   and (v_categ is null or vc.categoria_id = v_categ)
                                   and (v_centro is null or vc.centro_custo_id = v_centro))
                               + (select coalesce(sum(pr.valor), 0)
                                    from public.previsao_recorrentes(m.mes, (m.mes + interval '1 month')::date - 1) pr
                                   where (v_categ is null or pr.categoria_id = v_categ)
                                     and (v_centro is null or pr.centro_custo_id = v_centro)),
           'despesa_paga', (select coalesce(sum(pd.valor), 0) from public.v_pagamentos_despesa pd
                             where pd.estornado_em is null
                               and pd.data >= m.mes and pd.data < (m.mes + interval '1 month')
                               and pd.data between v_de and v_ate
                               and (v_categ is null or pd.categoria_id = v_categ)
                               and (v_centro is null or pd.centro_custo_id = v_centro)
                               and (v_conta is null or pd.conta_financeira_id = v_conta))
         ) order by m.mes), '[]'::jsonb)
    into v_serie
    from meses m;

  return jsonb_build_object(
    'parametros', jsonb_build_object('de', v_de, 'ate', v_ate, 'hoje', v_hoje, 'cliente_id', v_cliente,
                                     'responsavel_id', v_resp, 'contrato_id', v_contrato, 'categoria_id', v_categ,
                                     'centro_custo_id', v_centro, 'conta_financeira_id', v_conta),
    'emitido_em', now(),
    'regra', 'resumo-2026-10-19',
    'indicadores', v_ind,
    'serie', v_serie);
end
$$;

create or replace function public.pendencias_financeiras(p_dias integer default 7)
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

  -- A parte do cliente recebida num acordo e ainda não repassada a ele. Mais
  -- de uma semana parada vira perigo.
  return query
  select 'repasse_pendente', case when r.data < v_hoje - 7 then 'perigo' else 'alerta' end, r.cliente_nome,
         coalesce(r.contrato_codigo || ' · ', '') || coalesce(r.contrato_descricao, '')
           || ' · repasse ao cliente do recebimento de ' || to_char(r.data, 'DD/MM/YYYY'),
         'recebimentos', r.id, r.valor_repasse, r.data, '#/financeiro/contratos/' || r.contrato_id
    from public.v_recebimentos r
   where r.repasse_situacao = 'pendente';

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
-- Histórico: a tabela nova segue o Financeiro
-- -----------------------------------------------------------------------------

create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if privado.audita() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    when p_tabela in ('clientes', 'processos', 'tarefas', 'feriados') then
      return true;
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'clientes_contatos') then
      return privado.edita_clientes();
    when p_tabela = 'documentos' then
      return privado.edita_clientes() or (privado.financeiro_le() and exists (
        select 1 from public.documentos d where d.id = p_registro and d.modelo = 'recibo'));
    when p_tabela in ('intimacoes', 'intimacoes_consultas', 'config_prazos') then
      return privado.gerencia_prazos();
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro', 'pagamentos_despesa',
                      'contas_financeiras', 'transferencias_financeiras', 'ajustes_financeiros',
                      'fornecedores', 'centros_custo', 'anexos', 'anexos_versoes',
                      'importacoes', 'exportacoes', 'repasses_cliente') then
      return privado.financeiro_le();
    when p_tabela in ('fechamentos', 'divisao_cotas', 'fechamentos_anuais', 'fechamentos_anuais_versoes') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela in ('publicacoes', 'campanhas', 'site_deploys') then
      return privado.edita_site();
    when p_tabela = 'compromissos' then
      return privado.acesso_agenda() <> 'nenhum' and exists (
        select 1 from public.compromissos c
        where c.id = p_registro
          and (c.membro_id = privado.meu_membro_id() or not c.particular));
    else
      return false;
  end case;
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
--
-- Repasse entra e se estorna só pelas funções. As colunas novas de contratos,
-- parcelas e recebimentos ficam de fora dos GRANTs de escrita: só as funções
-- (criar_contrato, apurar_exito, renegociar) e os gatilhos as preenchem.
-- -----------------------------------------------------------------------------
alter table public.repasses_cliente enable row level security;

create policy "repasses_cliente: ver" on public.repasses_cliente
  for select to authenticated using ((select privado.financeiro_le()));

revoke all on public.repasses_cliente from anon, authenticated;
grant select on public.repasses_cliente to authenticated;
grant all on public.repasses_cliente to service_role;

revoke execute on function public.registrar_repasse(jsonb), public.estornar_repasse(uuid, text)
  from public, anon;
grant execute on function public.registrar_repasse(jsonb), public.estornar_repasse(uuid, text)
  to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
