-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 32 · Revisão do acordo: painel e redistribuição de parcelas
-- =============================================================================
--
-- Revisão das funções de 19 e 20/10 (acordo com repasse e com a parte do
-- cliente paga direto a ele):
--
--   · O painel mostrava a parte de clientes repassada e a pendente, mas não a
--     que foi direto a eles: `resumo_financeiro` passa a devolver
--     repasses_clientes.direto (soma de valor_direto_cliente no período).
--   · "Redistribuir valores" deixava passar valor entre parcelas do fixo (100%
--     do escritório) e do êxito apurado como acordo (30%, por exemplo): a
--     parte do escritório mudava sem ninguém decidir. Agora cada grupo (parte
--     e cotas) mantém a própria soma.
--
-- Nada muda em dado gravado.

-- -----------------------------------------------------------------------------
-- Painel: o que foi pago direto a clientes
-- -----------------------------------------------------------------------------

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
                                                          where repasse_situacao = 'pendente'),
                                            -- Parte de clientes que a parte contrária pagou direto a eles:
                                            -- abateu parcelas, mas não entrou no caixa (20/10/2026).
                                            'direto', (select coalesce(sum(valor_direto_cliente), 0) from recebidos)),
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

-- -----------------------------------------------------------------------------
-- Redistribuir: cada grupo de parcelas mantém a própria soma
-- -----------------------------------------------------------------------------

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
