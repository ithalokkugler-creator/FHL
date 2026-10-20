-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 31 · Acordo: parte do cliente paga direto a ele e cota própria em multa e juros
-- =============================================================================
--
-- Respostas dos advogados (20/10/2026) às duas perguntas do acordo com repasse:
--
--   1. "Nos acordos, o dinheiro cai na conta do escritório?" — "depende muito
--      do processo, mas na maioria das vezes sim". O sistema já fazia o caso
--      comum (entra tudo, o escritório repassa a parte do cliente). Agora o
--      recebimento também pode registrar que a parte contrária pagou a parte
--      do cliente DIRETO a ele (`direto_ao_cliente`): no caixa entra só a
--      parte do escritório (`valor`), o resto fica em `valor_direto_cliente`
--      e não há repasse a fazer. A parcela é abatida pelo que foi pago
--      (principal + encargos = valor + valor_direto_cliente).
--
--   2. "Multa e juros se dividem na mesma proporção?" — "depende do caso, tem
--      cliente que acertamos 50% quando não há honorário inicial". A cota do
--      acordo já é por contrato (50% funciona desde 19/10). O que faltava:
--      uma cota própria do escritório em multa, juros e correção
--      (`parcelas.cota_encargos_pct`, vazia = a mesma do acordo).
--
-- Nada muda em dado gravado: colunas novas com padrão neutro, regras e consultas.


-- -----------------------------------------------------------------------------
-- Colunas novas
-- -----------------------------------------------------------------------------

alter table public.parcelas
  add column cota_encargos_pct numeric(5,2)
    constraint parcelas_cota_encargos_pct_check check (cota_encargos_pct between 0 and 100);
comment on column public.parcelas.cota_encargos_pct is
  'Acordo: cota do escritório em multa, juros e correção recebidos. Vazia = a mesma de cota_escritorio_pct.';

alter table public.recebimentos
  add column direto_ao_cliente boolean not null default false,
  add column valor_direto_cliente numeric(12,2) not null default 0
    constraint recebimentos_valor_direto_cliente_check check (valor_direto_cliente >= 0);
comment on column public.recebimentos.direto_ao_cliente is
  'Acordo: a parte contrária pagou a parte do cliente direto a ele; no caixa entrou só a do escritório.';
comment on column public.recebimentos.valor_direto_cliente is
  'Acordo: o que a parte contrária pagou direto ao cliente, fora do caixa do escritório.';

-- O pago abate a parcela; no caixa entra o valor, e o resto foi direto ao cliente.
alter table public.recebimentos drop constraint recebimento_soma;
alter table public.recebimentos add constraint recebimento_soma
  check (valor + valor_direto_cliente = valor_principal + valor_encargos);
alter table public.recebimentos add constraint recebimento_direto
  check ((direto_ao_cliente or valor_direto_cliente = 0) and (not direto_ao_cliente or parcela_id is not null));

-- Quem lança informa só se foi direto; os valores saem do gatilho.
grant insert (direto_ao_cliente) on public.recebimentos to authenticated;

-- -----------------------------------------------------------------------------
-- Recebimento: parte do escritório, direto ao cliente e cota dos encargos
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
  v_bruto_antes      numeric;
  v_principal_antes  numeric;
  v_encargos_antes   numeric;
  v_escritorio_antes numeric;
  v_escritorio       numeric;
  v_bruto            numeric;
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
    if new.direto_ao_cliente then
      raise exception 'Entrada avulsa não tem parte de cliente paga direto a ele.' using errcode = 'P0001';
    end if;
    new.valor_direto_cliente := 0;
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
  -- Pagamento em partes: a parte do escritório sai do acumulado da parcela,
  -- menos o que ele já ficou — 3 × 111,11 a 30% dão 33,33 + 33,34 + 33,33 =
  -- 100,00, como a parcela inteira, e não 99,99. O acumulado é sempre o que
  -- a parte contrária pagou (bruto), tenha entrado no caixa ou ido direto ao
  -- cliente. Multa, juros e correção seguem a cota própria deles, quando o
  -- acordo tem uma.
  select coalesce(sum(r.valor + r.valor_direto_cliente), 0), coalesce(sum(r.valor_principal), 0),
         coalesce(sum(r.valor_encargos), 0), coalesce(sum(r.valor - r.valor_repasse), 0)
    into v_bruto_antes, v_principal_antes, v_encargos_antes, v_escritorio_antes
    from public.recebimentos r
   where r.parcela_id = new.parcela_id and r.estornado_em is null;
  v_bruto := new.valor_principal + new.valor_encargos;
  if v_parcela.cota_encargos_pct is null or v_parcela.cota_encargos_pct = v_parcela.cota_escritorio_pct then
    v_escritorio := round((v_bruto_antes + v_bruto) * v_parcela.cota_escritorio_pct / 100, 2) - v_escritorio_antes;
  else
    v_escritorio := round((v_principal_antes + new.valor_principal) * v_parcela.cota_escritorio_pct / 100, 2)
                  + round((v_encargos_antes + new.valor_encargos) * v_parcela.cota_encargos_pct / 100, 2)
                  - v_escritorio_antes;
  end if;
  v_escritorio := least(v_bruto, greatest(0, v_escritorio));

  if new.direto_ao_cliente then
    -- A parte contrária pagou a parte do cliente direto a ele: no caixa do
    -- escritório entra só a parte dele, e não há repasse a fazer. O bruto
    -- continua abatendo a parcela (principal e encargos, como foram pagos).
    if v_parcela.cota_escritorio_pct >= 100 then
      raise exception 'Só parcela de acordo (com parte do cliente) pode ter a parte do cliente paga direto a ele.'
        using errcode = 'P0001';
    end if;
    if v_escritorio <= 0 then
      raise exception 'Com a parte do cliente paga direto a ele, não sobra valor do escritório neste pagamento.'
        using errcode = 'P0001';
    end if;
    new.valor := v_escritorio;
    new.valor_direto_cliente := v_bruto - v_escritorio;
    new.valor_repasse := 0;
  else
    new.valor_direto_cliente := 0;
    new.valor_repasse := new.valor - least(new.valor, v_escritorio);
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Criar contrato, apurar êxito e renegociar: a cota dos encargos
-- -----------------------------------------------------------------------------

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
  v_cota_enc numeric := nullif(p ->> 'cota_encargos_pct', '')::numeric;
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
  -- O banco guarda duas casas: arredondar calado mudaria o combinado
  -- (99,999% virava 100% e o acordo deixava de ter repasse).
  if v_cota <> round(v_cota, 2) then
    raise exception 'A cota do escritório aceita até duas casas decimais.' using errcode = 'P0001';
  end if;
  if v_pct <> round(v_pct, 2) then
    raise exception 'O percentual de êxito aceita até duas casas decimais.' using errcode = 'P0001';
  end if;
  if v_total <> round(v_total, 2) then
    raise exception 'Valores em reais têm no máximo duas casas decimais.' using errcode = 'P0001';
  end if;
  if v_cota < 100 and v_tipo <> 'fixo' then
    raise exception 'Com êxito, a cota do escritório sobre o acordo se informa na apuração.' using errcode = 'P0001';
  end if;
  -- Multa, juros e correção: cota própria do escritório, quando o acordo tem
  -- uma (ex.: 30% do acordo e 50% dos encargos). Igual à do acordo, ou
  -- vazia, vale a mesma.
  if v_cota_enc is not null then
    if v_cota >= 100 then
      raise exception 'A cota sobre multa e juros só vale para acordo (com parte do cliente).' using errcode = 'P0001';
    end if;
    if v_cota_enc < 0 or v_cota_enc > 100 or v_cota_enc <> round(v_cota_enc, 2) then
      raise exception 'A cota do escritório em multa e juros vai de 0%% a 100%%, com até duas casas decimais.' using errcode = 'P0001';
    end if;
    if v_cota_enc = v_cota then
      v_cota_enc := null;
    end if;
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
    if (v_parcela ->> 'valor')::numeric <> round((v_parcela ->> 'valor')::numeric, 2) then
      raise exception 'Valores em reais têm no máximo duas casas decimais.' using errcode = 'P0001';
    end if;
    insert into public.parcelas (contrato_id, numero, vencimento, valor, cota_escritorio_pct, cota_encargos_pct)
    values (v_id, (v_parcela ->> 'numero')::smallint, (v_parcela ->> 'vencimento')::date,
            (v_parcela ->> 'valor')::numeric, v_cota, v_cota_enc);
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

create or replace function public.apurar_exito(p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_total    numeric := (p ->> 'valor_total')::numeric;
  v_base     numeric := nullif(p ->> 'base', '')::numeric;
  v_cota     numeric := coalesce(nullif(p ->> 'cota_escritorio_pct', '')::numeric, 100);
  v_cota_enc numeric := nullif(p ->> 'cota_encargos_pct', '')::numeric;
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
  -- O banco guarda duas casas: arredondar calado mudaria o combinado.
  if v_cota <> round(v_cota, 2) then
    raise exception 'A cota do escritório aceita até duas casas decimais.' using errcode = 'P0001';
  end if;
  if v_total <> round(v_total, 2) or v_base <> round(v_base, 2) then
    raise exception 'Valores em reais têm no máximo duas casas decimais.' using errcode = 'P0001';
  end if;
  if v_base < 0 then
    raise exception 'A base do êxito não pode ser negativa.' using errcode = 'P0001';
  end if;
  -- Multa, juros e correção: cota própria do escritório, quando o acordo tem
  -- uma (ex.: 30% do acordo e 50% dos encargos). Igual à do acordo, ou
  -- vazia, vale a mesma.
  if v_cota_enc is not null then
    if v_cota >= 100 then
      raise exception 'A cota sobre multa e juros só vale para acordo (com parte do cliente) — use o modo de acordo.' using errcode = 'P0001';
    end if;
    if v_cota_enc < 0 or v_cota_enc > 100 or v_cota_enc <> round(v_cota_enc, 2) then
      raise exception 'A cota do escritório em multa e juros vai de 0%% a 100%%, com até duas casas decimais.' using errcode = 'P0001';
    end if;
    if v_cota_enc = v_cota then
      v_cota_enc := null;
    end if;
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
    if (v_parcela ->> 'valor')::numeric <> round((v_parcela ->> 'valor')::numeric, 2) then
      raise exception 'Valores em reais têm no máximo duas casas decimais.' using errcode = 'P0001';
    end if;
    v_numero := v_numero + 1;
    insert into public.parcelas (contrato_id, numero, vencimento, valor, parte, cota_escritorio_pct, cota_encargos_pct)
    values (v_contrato.id, v_numero, (v_parcela ->> 'vencimento')::date, (v_parcela ->> 'valor')::numeric,
            'exito', v_cota, v_cota_enc);
    v_soma := v_soma + (v_parcela ->> 'valor')::numeric;
  end loop;

  if v_soma <> v_total then
    raise exception 'A soma das parcelas (%) não fecha com o valor apurado (%).',
      privado.reais(v_soma), privado.reais(v_total) using errcode = 'P0001';
  end if;
end
$$;

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
  v_partes   integer;
  v_cota     numeric;
  v_cota_enc numeric;
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

  -- A cota sobre multa e juros também tem de ser a mesma (vazia = a do acordo).
  select min(pa.parte), count(distinct pa.parte),
         count(distinct (pa.cota_escritorio_pct, coalesce(pa.cota_encargos_pct, pa.cota_escritorio_pct))),
         min(pa.cota_escritorio_pct), min(pa.cota_encargos_pct)
    into v_parte, v_partes, v_cotas, v_cota, v_cota_enc
    from public.parcelas pa where pa.id = any (v_ids);
  if v_cotas > 1 then
    raise exception 'Parcelas com cotas do escritório diferentes não se renegociam juntas. Renegocie cada grupo separadamente.'
      using errcode = 'P0001';
  end if;
  -- Fixo e êxito juntos virariam "fixo" e o contrato de honorários passaria
  -- a listar o êxito como parcela do fixo.
  if v_partes > 1 then
    raise exception 'Parcelas do fixo e do êxito não se renegociam juntas. Renegocie cada grupo separadamente.'
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
    insert into public.parcelas (contrato_id, numero, vencimento, valor, origem_renegociacao_id, parte, cota_escritorio_pct,
                                 cota_encargos_pct)
    values (v_contrato, v_numero, (v_nova ->> 'vencimento')::date, (v_nova ->> 'valor')::numeric, v_ren,
            v_parte, v_cota, v_cota_enc);
  end loop;

  return v_ren;
end
$$;

-- -----------------------------------------------------------------------------
-- Consultas: colunas novas sempre no fim
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
  c.arquivado_em as contrato_arquivado_em,
  p.parte,
  p.cota_escritorio_pct,
  -- A parte do escritório (honorário) no valor, no que se exige e no saldo.
  round(p.valor * p.cota_escritorio_pct / 100, 2) as valor_escritorio,
  round((p.valor + a.acrescimos - a.descontos) * p.cota_escritorio_pct / 100, 2) as exigivel_escritorio,
  round((p.valor + a.acrescimos - a.descontos - r.pago_principal) * p.cota_escritorio_pct / 100, 2) as saldo_escritorio,
  c.tipo_honorario as contrato_tipo_honorario,
  -- Cota do escritório em multa e juros (vazia = a mesma da parcela).
  p.cota_encargos_pct
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
  case when r.estornado_em is not null then 'nao_se_aplica'
       when r.direto_ao_cliente then 'direto'
       when r.valor_repasse = 0 then 'nao_se_aplica'
       when rp.id is not null then 'feito'
       else 'pendente' end as repasse_situacao,
  c.codigo as contrato_codigo,
  p.parte as parcela_parte,
  -- Acordo pago em parte direto ao cliente: o que foi a ele, fora do caixa.
  r.valor_direto_cliente,
  r.direto_ao_cliente,
  p.cota_encargos_pct
from public.recebimentos r
left join public.clientes cl on cl.id = r.cliente_id
left join public.formas_pagamento f on f.id = r.forma_id
left join public.parcelas p on p.id = r.parcela_id
left join public.contratos c on c.id = p.contrato_id
left join public.contas_financeiras cf on cf.id = r.conta_financeira_id
left join public.repasses_cliente rp on rp.recebimento_id = r.id and rp.estornado_em is null
left join public.contas_financeiras cfr on cfr.id = rp.conta_financeira_id;

-- -----------------------------------------------------------------------------
-- Fechamento do mês: o que foi direto a clientes
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
           -- Parte de clientes paga direto a eles: abateu parcelas, não entrou no caixa.
           'diretos_clientes', coalesce(sum(r.valor_direto_cliente), 0),
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
