-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 22 · Painel gerencial com detalhamento e registro de exportações
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T08, T09 e T11.
--
-- resumo_financeiro(filtros) devolve os dez indicadores do DOCX, a série mês
-- a mês e, para cada indicador, a regra que a tela usa para abrir a lista de
-- detalhe. A soma da lista é o indicador, no centavo: as duas leituras usam
-- as mesmas views e os mesmos filtros (o Painel antigo somava "Saiu" pela
-- data do pagamento e abria a lista pela competência).
--
-- Bases (DOCX §4):
--   · receita prevista: o que as parcelas vigentes exigem, pelo VENCIMENTO;
--   · receita recebida e despesa paga: o dinheiro, pela data do CAIXA;
--   · despesa prevista: a obrigação, pela COMPETÊNCIA — incluindo as
--     recorrências que ainda não viraram conta (previsao_recorrentes);
--   · a vencer / vencido: o saldo de hoje das parcelas do período.
-- Previsão não é saldo bancário, e juros projetados não são receita.

create function public.resumo_financeiro(p jsonb default '{}'::jsonb)
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
    'saldo_previsto', jsonb_build_object('valor', (v_ind #>> '{receita_prevista,valor}')::numeric
                                                  - (v_ind #>> '{despesas_previstas,valor}')::numeric),
    'saldo_realizado', jsonb_build_object('valor', (v_ind #>> '{receita_recebida,valor}')::numeric
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
    'regra', 'resumo-2026-10-08',
    'indicadores', v_ind,
    'serie', v_serie);
end
$$;

-- -----------------------------------------------------------------------------
-- Registro de exportações: quem tirou que relatório, com que filtros, quantas
-- linhas e que totais. Sem o conteúdo — o dado pessoal fica onde já está.
-- -----------------------------------------------------------------------------
create table public.exportacoes (
  id          uuid primary key default gen_random_uuid(),
  relatorio   text not null check (btrim(relatorio) <> ''),
  formato     text not null check (formato in ('csv', 'xlsx', 'pdf', 'json')),
  filtros     jsonb not null default '{}'::jsonb,
  quantidade  integer not null default 0 check (quantidade >= 0),
  totais      jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);
create index exportacoes_criado on public.exportacoes (criado_em desc);
select privado.aplicar_padrao('public.exportacoes');

alter table public.exportacoes enable row level security;
create policy "exportacoes: ver" on public.exportacoes
  for select to authenticated
  using ((select privado.audita()) or criado_por = (select privado.meu_membro_id()));
create policy "exportacoes: incluir" on public.exportacoes
  for insert to authenticated
  with check ((select privado.financeiro_le()) or (select privado.audita()));

revoke all on public.exportacoes from anon, authenticated;
grant select on public.exportacoes to authenticated;
grant insert (relatorio, formato, filtros, quantidade, totais) on public.exportacoes to authenticated;
grant all on public.exportacoes to service_role;

revoke execute on function public.resumo_financeiro(jsonb) from public, anon;
grant execute on function public.resumo_financeiro(jsonb) to authenticated;
