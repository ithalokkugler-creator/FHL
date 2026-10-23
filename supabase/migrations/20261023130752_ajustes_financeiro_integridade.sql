-- Integridade financeira: prevenção de novas inconsistências, sem DML retroativo.
-- Nenhum recebimento, ajuste, repasse, saldo ou fechamento existente é regravado.
-- Valores especiais legados continuam legíveis; editar observação não exige repará-los.

create function privado.conferir_reais(p_valor numeric)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_valor is not null and not (p_valor between -9999999999.99 and 9999999999.99) then
    raise exception 'Informe um valor em reais finito e dentro do limite permitido.' using errcode = '22023';
  end if;
  if p_valor is not null and p_valor <> round(p_valor, 2) then
    raise exception 'Valores em reais têm no máximo duas casas decimais.' using errcode = '22023';
  end if;
end
$$;

create function privado.conferir_reais_json(p jsonb, p_campos text[])
returns void language plpgsql immutable set search_path = '' as $$
declare v_campo text;
begin
  foreach v_campo in array p_campos loop
    perform privado.conferir_reais(nullif(p ->> v_campo, '')::numeric);
  end loop;
end
$$;

-- Entradas diretas da Data API também não podem introduzir NaN.
-- numeric(12,2) já entrega centavos ao gatilho; RPCs conferem a precisão do
-- JSON original ANTES da coerção. Não se muda o tipo de coluna/dependências.
-- Confere apenas INSERT ou dinheiro alterado: legado anômalo não impede
-- corrigir uma observação e não é transformado em zero pela migração.
create function privado.conferir_dinheiro_alterado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_campo text; v_novo jsonb := to_jsonb(new); v_antigo jsonb;
begin
  if tg_op = 'UPDATE' then v_antigo := to_jsonb(old); end if;
  foreach v_campo in array tg_argv loop
    if tg_op = 'INSERT' or (v_novo -> v_campo) is distinct from (v_antigo -> v_campo) then
      perform privado.conferir_reais(nullif(v_novo ->> v_campo, '')::numeric);
    end if;
  end loop;
  return new;
end
$$;

do $$
declare v record; v_args text;
begin
  for v in
    select t.tab, array_agg(c.column_name order by c.ordinal_position) as campos
      from unnest(array['contratos','parcelas','renegociacoes','recebimentos',
        'ajustes_financeiros','contas_financeiras','transferencias_financeiras',
        'contas','contas_recorrentes','pagamentos_despesa','repasses_cliente','cobrancas']) t(tab)
      join information_schema.columns c on c.table_schema='public' and c.table_name=t.tab
        and c.data_type='numeric' and c.numeric_precision=12 and c.numeric_scale=2
     group by t.tab
  loop
    select string_agg(quote_literal(x), ',') into v_args from unnest(v.campos) x;
    execute format('create trigger aa_dinheiro before insert or update on public.%I for each row execute function privado.conferir_dinheiro_alterado(%s)',v.tab,v_args);
  end loop;
end
$$;

-- Ordem de trava dos caminhos de recebimento:
--  * filho direto: linha do pai -> advisory do contrato -> parcela-alvo;
--  * estorno: a linha do recebimento já vem travada pelo UPDATE -> try advisory;
--  * RPC de antecipação: advisory antes de ler o plano -> parcelas. Seus pais
--    são novos na própria transação; nunca espera pai existente de outra sessão.
-- Assim o insert direto não segura o advisory enquanto espera o pai de um
-- estorno; duas RPCs do mesmo contrato não montam planos em ordens opostas.
-- RPCs que já travam parcela/contrato obtêm o advisory ANTES dessas travas.
-- Gatilhos NÃO esperam pelo advisory segurando uma linha: em conflito retornam
-- 40001 (repetir a operação). Isso cobre também UPDATEs em lote pela API.
create function privado.travar_contrato_financeiro(p_id uuid, p_aguardar boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para lançar no Financeiro.' using errcode='42501';
  end if;
  if p_id is not null then
    if p_aguardar then
      perform pg_advisory_xact_lock(hashtext('fl.financeiro.contrato'), hashtext(p_id::text));
    elsif not pg_try_advisory_xact_lock(hashtext('fl.financeiro.contrato'), hashtext(p_id::text)) then
      raise exception 'Outro lançamento deste contrato está em andamento. Atualize e tente novamente.' using errcode='40001';
    end if;
  end if;
end
$$;

create function privado.integridade_recebimento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_contrato uuid; v_parcela public.parcelas; v_origem public.recebimentos;
  v_principal numeric; v_encargos numeric; v_bruto numeric; v_escritorio numeric; v_esperado numeric;
begin
  if tg_op = 'UPDATE' then
    -- Observação e recebimento já estornado seguem as regras existentes.
    if new.estornado_em is null or old.estornado_em is not null then return new; end if;
    -- Falha antes de esperar o advisory: um UPDATE direto do filho já trava
    -- sua linha; esperar o pai/advisory aqui inverteria a cascata pai->filho.
    if new.antecipacao_de is not null and exists (
      select 1 from public.recebimentos where id=new.antecipacao_de and estornado_em is null
    ) then
      raise exception 'Esta parte é antecipação de outro pagamento: estorne o pagamento de origem, e ela é estornada junto.' using errcode='P0001';
    end if;
  elsif new.antecipacao_de is not null then
    -- FOR UPDATE antes do advisory; relê a versão final após estorno concorrente.
    select * into v_origem from public.recebimentos where id=new.antecipacao_de for update;
    if not found or v_origem.estornado_em is not null then
      raise exception 'A antecipação precisa vir de um pagamento de parcela válido.' using errcode='P0001';
    end if;
  end if;
  if new.parcela_id is null then return new; end if;
  select * into v_parcela from public.parcelas where id=new.parcela_id;
  v_contrato := v_parcela.contrato_id;
  perform privado.travar_contrato_financeiro(v_contrato,false);
  if exists(select 1 from public.contratos where id=v_contrato and arquivado_em is not null) then
    raise exception 'Contrato arquivado: desarquive antes de lançar ou estornar recebimentos.' using errcode='P0001';
  end if;

  if tg_op='UPDATE' and v_parcela.cota_escritorio_pct < 100 then
    select coalesce(sum(r.valor_principal),0), coalesce(sum(r.valor_encargos),0),
           coalesce(sum(r.valor+r.valor_direto_cliente),0), coalesce(sum(r.valor-r.valor_repasse),0)
      into v_principal,v_encargos,v_bruto,v_escritorio
      from public.recebimentos r where r.parcela_id=new.parcela_id and r.id<>new.id and r.estornado_em is null;
    if v_parcela.cota_encargos_pct is null or v_parcela.cota_encargos_pct=v_parcela.cota_escritorio_pct then
      v_esperado := round(v_bruto*v_parcela.cota_escritorio_pct/100,2);
    else
      v_esperado := round(v_principal*v_parcela.cota_escritorio_pct/100,2)
                  +round(v_encargos*v_parcela.cota_encargos_pct/100,2);
    end if;
    if v_escritorio is distinct from v_esperado then
      raise exception 'Este estorno deixaria diferença de arredondamento na cota do acordo. Estorne primeiro os pagamentos posteriores desta parcela.' using errcode='P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger ab_integridade_recebimento before insert or update on public.recebimentos
  for each row execute function privado.integridade_recebimento();

-- Guardas no banco também valem para chamadas da API e para outra aba aberta.
create or replace function public.estornar_ajuste(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ajuste public.ajustes_financeiros; v_parcela public.v_parcelas; v_contrato uuid;
begin
  if not privado.financeiro_ajusta() then
    raise exception 'Só o Financeiro completo estorna ajuste.' using errcode='42501';
  end if;
  select p.contrato_id into v_contrato from public.ajustes_financeiros a join public.parcelas p on p.id=a.parcela_id where a.id=p_id;
  perform privado.travar_contrato_financeiro(v_contrato);
  select * into v_ajuste from public.ajustes_financeiros where id=p_id;
  if not found or v_ajuste.estornado_em is not null then
    raise exception 'Ajuste não encontrado ou já estornado.' using errcode='P0001';
  end if;
  perform 1 from public.parcelas where id=v_ajuste.parcela_id for update;
  if exists(select 1 from public.contratos where id=v_contrato and arquivado_em is not null) then
    raise exception 'Contrato arquivado: desarquive antes de estornar o ajuste.' using errcode='P0001';
  end if;
  select * into v_parcela from public.v_parcelas where id=v_ajuste.parcela_id;
  if v_ajuste.tipo='acrescimo' and v_parcela.saldo-v_ajuste.valor < 0 then
    raise exception 'Este acréscimo já foi recebido. Estorne primeiro os recebimentos necessários; o ajuste não pode deixar saldo negativo.' using errcode='P0001';
  end if;
  update public.ajustes_financeiros set estornado_em=now(),motivo_estorno=p_motivo where id=p_id and estornado_em is null;
end
$$;

revoke execute on function privado.conferir_reais(numeric),privado.conferir_reais_json(jsonb,text[]),
  privado.conferir_dinheiro_alterado(),privado.travar_contrato_financeiro(uuid,boolean),privado.integridade_recebimento()
  from public,anon;
grant execute on function privado.conferir_reais(numeric),privado.conferir_reais_json(jsonb,text[]),
  privado.travar_contrato_financeiro(uuid,boolean) to authenticated;
grant execute on function privado.conferir_reais(numeric),privado.conferir_reais_json(jsonb,text[]),
  privado.conferir_dinheiro_alterado(),privado.travar_contrato_financeiro(uuid,boolean),privado.integridade_recebimento() to service_role;

-- Definição integral atualizada; demais regras e permissões preservadas.
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
  perform privado.conferir_reais_json(p,array['valor_total']);
  perform privado.conferir_reais_json(x,array['valor']) from jsonb_array_elements(coalesce(p->'parcelas','[]'::jsonb)) x;
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

-- Definição integral atualizada; demais regras e permissões preservadas.
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
  perform privado.conferir_reais_json(p,array['valor_total','base']);
  perform privado.conferir_reais_json(x,array['valor']) from jsonb_array_elements(coalesce(p->'parcelas','[]'::jsonb)) x;
  perform privado.travar_contrato_financeiro((p->>'contrato_id')::uuid);
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

-- Definição integral atualizada; demais regras e permissões preservadas.
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
  perform privado.conferir_reais_json(x,array['valor']) from jsonb_array_elements(coalesce(p->'novas','[]'::jsonb)) x;
  perform privado.travar_contrato_financeiro((p->>'contrato_id')::uuid);
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

-- Definição integral atualizada; demais regras e permissões preservadas.
create or replace function public.redistribuir_parcelas(p jsonb)
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
  perform privado.conferir_reais_json(x,array['valor']) from jsonb_array_elements(coalesce(p->'parcelas','[]'::jsonb)) x;
  perform privado.travar_contrato_financeiro((p->>'contrato_id')::uuid);
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

  -- Cada grupo (fixo ou êxito, e as cotas do escritório) mantém a própria
  -- soma: valor não passa do fixo (100% do escritório) para o acordo do êxito
  -- (30%, por exemplo) — a parte do escritório mudaria sem ninguém decidir.
  if exists (
    select 1
      from public.parcelas pa
      join (select (x ->> 'id')::uuid as id, (x ->> 'valor')::numeric as valor
              from jsonb_array_elements(p -> 'parcelas') x) n on n.id = pa.id
     group by pa.parte, pa.cota_escritorio_pct, coalesce(pa.cota_encargos_pct, pa.cota_escritorio_pct)
    having sum(n.valor) <> sum(pa.valor)
  ) then
    raise exception 'Valor não passa entre parcelas do fixo e do êxito, nem entre cotas do escritório diferentes: cada grupo mantém a própria soma.'
      using errcode = 'P0001';
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

-- Definição integral atualizada; demais regras e permissões preservadas.
create or replace function public.arquivar_contrato(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.v_contratos;
begin
  perform privado.travar_contrato_financeiro(p_id);
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

-- Definição integral atualizada; demais regras e permissões preservadas.
create or replace function public.conceder_ajuste(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcela public.v_parcelas;
  v_valor   numeric := (p ->> 'valor')::numeric;
  v_tipo    text := p ->> 'tipo';
  v_id      uuid;
begin
  perform privado.conferir_reais_json(p,array['valor']);
  perform privado.travar_contrato_financeiro((select contrato_id from public.parcelas where id=(p->>'parcela_id')::uuid));
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

-- Definição integral atualizada; demais regras e permissões preservadas.
create or replace function public.receber_com_antecipacao(p jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_r         jsonb := p -> 'recebimento';
  v_excedente numeric := round(coalesce(nullif(p ->> 'excedente', '')::numeric, 0), 2);
  v_data      date;
  v_parcela   record;
  v_alvo      record;
  v_plano     jsonb := '[]';
  v_resto     numeric;
  v_valor     numeric;
  v_origem    uuid;
  v_conta     uuid;
  v_forma     uuid;
  v_total     numeric;
  v_nome      text;
  v_destinos  text;
  v_numeros   text[];
begin
  perform privado.conferir_reais_json(p,array['excedente']);
  perform privado.conferir_reais_json(p->'recebimento',array['valor','valor_principal','valor_encargos','valor_multa','valor_juros','valor_correcao','valor_acrescimo']);
  perform privado.travar_contrato_financeiro((select contrato_id from public.parcelas where id=(v_r->>'parcela_id')::uuid));
  if not privado.financeiro_lanca() then
    raise exception 'Seu acesso ao Financeiro não permite lançar recebimentos.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_r) is distinct from 'object' or v_excedente <= 0 then
    raise exception 'Pagamento inválido para antecipação.' using errcode = '22023';
  end if;
  v_data := (v_r ->> 'data')::date;

  select vp.* into v_parcela from public.v_parcelas vp where vp.id = (v_r ->> 'parcela_id')::uuid;
  if not found then
    raise exception 'Parcela não encontrada.' using errcode = 'P0001';
  end if;
  if v_parcela.cota_escritorio_pct < 100 then
    raise exception 'Parcela de acordo (com parte do cliente) não recebe antecipação: receba cada parcela.' using errcode = 'P0001';
  end if;
  -- Antecipar só depois de quitar a parcela deste pagamento.
  if v_parcela.saldo <= 0 then
    raise exception 'Esta parcela já está paga (talvez em outra tela). Atualize a página.' using errcode = 'P0001';
  end if;
  if (v_r ->> 'valor_principal')::numeric is distinct from v_parcela.saldo then
    raise exception 'Para antecipar, o pagamento precisa quitar esta parcela primeiro (saldo de %). Se ela mudou em outra tela, atualize a página.',
      privado.reais(v_parcela.saldo) using errcode = 'P0001';
  end if;

  -- O plano: da última para a primeira, só as que ainda vão vencer, do mesmo grupo.
  v_resto := v_excedente;
  for v_alvo in
    select vp.id, vp.numero, vp.vencimento, vp.saldo
      from public.v_parcelas vp
     where vp.contrato_id = v_parcela.contrato_id
       and vp.id <> v_parcela.id
       and vp.parte = v_parcela.parte
       and vp.cota_escritorio_pct = 100
       and vp.situacao in ('a_vencer', 'vencida')
       and vp.saldo > 0
       and vp.vencimento > v_data
     order by vp.vencimento desc, vp.numero desc
  loop
    exit when v_resto <= 0;
    v_valor := least(v_resto, v_alvo.saldo);
    v_plano := v_plano || jsonb_build_object('parcela_id', v_alvo.id, 'numero', v_alvo.numero,
                                            'vencimento', v_alvo.vencimento, 'valor', v_valor);
    v_resto := v_resto - v_valor;
  end loop;
  if v_resto > 0 then
    raise exception 'O pagamento passa em % o que falta pagar nas próximas parcelas deste contrato.', privado.reais(v_resto)
      using errcode = 'P0001';
  end if;

  v_total := (v_r ->> 'valor')::numeric + v_excedente;
  v_nome := case when v_parcela.numero = 0 then 'da entrada' else 'da parcela ' || v_parcela.numero end;
  -- "parcela 6" ou "parcelas 6, 5 e 4", na ordem em que foram abatidas.
  select array_agg(case when (e.i ->> 'numero')::int = 0 then 'entrada' else e.i ->> 'numero' end order by e.ordem)
    into v_numeros
    from jsonb_array_elements(v_plano) with ordinality as e(i, ordem);
  v_destinos := case when cardinality(v_numeros) = 1 then 'parcela ' || v_numeros[1]
                     else 'parcelas ' || array_to_string(v_numeros[1:cardinality(v_numeros) - 1], ', ')
                          || ' e ' || v_numeros[cardinality(v_numeros)] end;

  -- O que o sistema escreve vai em descricao (aparece nos relatórios); a
  -- observação fica só com o que a pessoa digitou.
  insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, valor_correcao,
                                   valor_multa, valor_juros, valor_acrescimo, forma_id, conta_financeira_id,
                                   observacao, descricao, memoria_calculo)
  values (v_parcela.id, v_data, (v_r ->> 'valor')::numeric, (v_r ->> 'valor_principal')::numeric,
          coalesce(nullif(v_r ->> 'valor_encargos', '')::numeric, 0), nullif(v_r ->> 'valor_correcao', '')::numeric,
          nullif(v_r ->> 'valor_multa', '')::numeric, nullif(v_r ->> 'valor_juros', '')::numeric,
          nullif(v_r ->> 'valor_acrescimo', '')::numeric, nullif(v_r ->> 'forma_id', '')::uuid,
          nullif(v_r ->> 'conta_financeira_id', '')::uuid,
          nullif(btrim(v_r ->> 'observacao'), ''),
          'Pagamento de R$ ' || translate(to_char(v_total, 'FM999,999,999,990.00'), ',.', '.,') || ' com R$ '
            || translate(to_char(v_excedente, 'FM999,999,999,990.00'), ',.', '.,') || ' antecipados (' || v_destinos || ')',
          case when jsonb_typeof(v_r -> 'memoria_calculo') = 'object' then v_r -> 'memoria_calculo' end)
  returning id, conta_financeira_id, forma_id into v_origem, v_conta, v_forma;

  for v_alvo in select e.i from jsonb_array_elements(v_plano) as e(i) loop
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id,
                                     conta_financeira_id, descricao, antecipacao_de)
    values ((v_alvo.i ->> 'parcela_id')::uuid, v_data, (v_alvo.i ->> 'valor')::numeric,
            (v_alvo.i ->> 'valor')::numeric, 0, v_forma, v_conta,
            'Antecipação: parte do pagamento de R$ ' || translate(to_char(v_total, 'FM999,999,999,990.00'), ',.', '.,')
              || ' ' || v_nome || ' em ' || to_char(v_data, 'DD/MM/YYYY'),
            v_origem);
  end loop;

  return jsonb_build_object('id', v_origem, 'total', v_total, 'antecipacoes', v_plano);
end
$$;

-- Definição integral atualizada; demais regras e permissões preservadas.
create or replace function public.registrar_pagamento_despesa(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_chave text := nullif(btrim(p ->> 'chave'), '');
  v_ant   public.pagamentos_despesa;
  v_id    uuid;
  v_pos   record;
begin
  perform privado.conferir_reais_json(p,array['valor']);
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

-- Definição integral atualizada; demais regras e permissões preservadas.
create or replace function public.registrar_importacao(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   uuid;
  v_ant  public.importacoes;
begin
  perform privado.conferir_reais_json(x->'normalizado',array['valor','valor_pago','valor_total']) from jsonb_array_elements(coalesce(p->'linhas','[]'::jsonb)) x;
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para importar no Financeiro.' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'linhas') is distinct from 'array' or jsonb_array_length(p -> 'linhas') = 0 then
    raise exception 'O arquivo não tem linhas para importar.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p -> 'linhas') > 20000 then
    raise exception 'Arquivo grande demais para uma importação (máximo 20.000 linhas).' using errcode = 'P0001';
  end if;

  select * into v_ant from public.importacoes
   where sha256 = lower(p ->> 'sha256') and estado = 'carregada' limit 1;
  if found then
    raise exception 'Este mesmo arquivo já foi carregado em %.', to_char(v_ant.carregada_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      using errcode = 'P0001';
  end if;

  insert into public.importacoes (nome_arquivo, sha256, versao_parser)
  values (left(p ->> 'nome_arquivo', 200), lower(p ->> 'sha256'), coalesce(p ->> 'versao_parser', '?'))
  returning id into v_id;

  insert into public.importacao_linhas (importacao_id, aba, linha, tipo, dados, normalizado, mensagens, chave_origem)
  select v_id, coalesce(l ->> 'aba', ''), (l ->> 'linha')::integer, l ->> 'tipo',
         coalesce(l -> 'dados', '{}'::jsonb), coalesce(l -> 'normalizado', '{}'::jsonb),
         coalesce(l -> 'mensagens', '[]'::jsonb), l ->> 'chave_origem'
    from jsonb_array_elements(p -> 'linhas') l;

  perform public.validar_importacao(v_id);
  return v_id;
end
$$;
