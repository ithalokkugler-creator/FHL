-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 30 · Correções da caça a bugs nas funções de 19/10
-- =============================================================================
--
-- Sete testadores passaram pelas funções de 19/10 (fixo + êxito, encadeado,
-- acordo com repasse) na prévia local. O que era do banco:
--
--   · Histórico: o cadastro de cliente (CPF, e-mail, telefone) aparecia para
--     quem não lê Clientes. Agora segue a regra da tabela (le_clientes).
--   · Repasse estornado em contrato arquivado voltava a ficar "pendente" num
--     contrato arquivado. Agora pede para desarquivar antes.
--   · Renegociar parcelas do fixo e do êxito juntas gravava as novas como
--     "fixo" — o contrato de honorários listava o êxito como parcela do fixo.
--     Agora recusa, como já recusava cotas diferentes.
--   · Acordo pago em partes perdia um centavo do escritório (3 × 111,11 a 30%
--     davam 99,99 e não 100,00). A divisão passa a sair do acumulado.
--   · Cota, percentual de êxito e valores com mais de duas casas eram
--     arredondados calados (99,999% virava 100% e o acordo perdia o repasse).
--     Agora são recusados com mensagem. Base de êxito negativa, também.
--   · Fechamento anual: o saldo previsto somava a parte dos clientes nos
--     acordos. Agora é receita prevista do escritório − despesas previstas,
--     como no painel. Versões já aprovadas ficam como foram aprovadas.
--
-- Nada muda em dado gravado: são só regras e consultas.


-- -----------------------------------------------------------------------------
-- Histórico: cadastro de cliente só para quem lê Clientes
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
    -- Cadastro de cliente (CPF, e-mail, telefone) só para quem lê Clientes,
    -- como a própria tabela (red team de 11/10). Processos, tarefas e
    -- feriados seguem visíveis a todo membro, como as tabelas.
    when p_tabela = 'clientes' then
      return privado.le_clientes();
    when p_tabela in ('processos', 'tarefas', 'feriados') then
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
-- Repasse: não se estorna em contrato arquivado
-- -----------------------------------------------------------------------------

create or replace function public.estornar_repasse(p_id uuid, p_motivo text)
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
  -- Contrato arquivado não volta a ter repasse pendente: desarquiva-se antes,
  -- com motivo, como no estorno do recebimento.
  if exists (select 1 from public.repasses_cliente rp
               join public.recebimentos r on r.id = rp.recebimento_id
               join public.parcelas pa on pa.id = r.parcela_id
               join public.contratos c on c.id = pa.contrato_id
              where rp.id = p_id and c.arquivado_em is not null) then
    raise exception 'Contrato arquivado: desarquive antes de estornar o repasse.' using errcode = 'P0001';
  end if;
  update public.repasses_cliente set estornado_em = now(), motivo_estorno = p_motivo
   where id = p_id and estornado_em is null;
  if not found then
    raise exception 'Repasse não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Renegociação: fixo e êxito não se misturam
-- -----------------------------------------------------------------------------

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

  select min(pa.parte), count(distinct pa.parte),
         count(distinct pa.cota_escritorio_pct), min(pa.cota_escritorio_pct)
    into v_parte, v_partes, v_cotas, v_cota
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
    insert into public.parcelas (contrato_id, numero, vencimento, valor, origem_renegociacao_id, parte, cota_escritorio_pct)
    values (v_contrato, v_numero, (v_nova ->> 'vencimento')::date, (v_nova ->> 'valor')::numeric, v_ren,
            v_parte, v_cota);
  end loop;

  return v_ren;
end
$$;

-- -----------------------------------------------------------------------------
-- Recebimento: a parte do escritório sobre o acumulado da parcela
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
  v_escritorio_antes numeric;
  v_escritorio       numeric;
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
  -- Pagamento em partes: a parte do escritório sai do acumulado da parcela,
  -- menos o que ele já ficou — 3 × 111,11 a 30% dão 33,33 + 33,34 + 33,33 =
  -- 100,00, como a parcela inteira, e não 99,99.
  select coalesce(sum(r.valor), 0), coalesce(sum(r.valor - r.valor_repasse), 0)
    into v_bruto_antes, v_escritorio_antes
    from public.recebimentos r
   where r.parcela_id = new.parcela_id and r.estornado_em is null;
  v_escritorio := round((v_bruto_antes + new.valor) * v_parcela.cota_escritorio_pct / 100, 2) - v_escritorio_antes;
  new.valor_repasse := new.valor - least(new.valor, greatest(0, v_escritorio));
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Criar contrato e apurar êxito: no máximo duas casas
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

-- -----------------------------------------------------------------------------
-- Fechamento anual: saldo previsto do escritório
-- -----------------------------------------------------------------------------

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
  v_exig_esc numeric;
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
    select p.id, p.vencimento, p.valor, p.cota_escritorio_pct as cota,
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
  select coalesce(sum(valor + ajuste), 0), coalesce(sum(least(principal, valor + ajuste)), 0),
         coalesce(sum(round((valor + ajuste) * cota / 100, 2)), 0)
    into v_exig, v_receb, v_exig_esc
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
           'repasses_clientes', v_repasses,
           'receitas_previstas_escritorio', v_exig_esc)
    into v_totais;
  v_totais := v_totais || jsonb_build_object(
    'honorarios_recebidos', (v_totais ->> 'receitas_recebidas')::numeric - v_repasses,
    -- Como no painel: o saldo previsto conta só o que é do escritório.
    'saldo_previsto', v_exig_esc - (v_totais ->> 'despesas_previstas')::numeric,
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
    'regra', 'posicao-corte-2026-10-19-escritorio',
    'calculado_em', now(),
    'meses', v_meses,
    'totais', v_totais,
    'posicao', coalesce(v_posicao, '[]'::jsonb),
    'pendencias', v_pend);
end
$$;
