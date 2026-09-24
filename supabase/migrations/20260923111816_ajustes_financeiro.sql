-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 06 · Ajustes do Financeiro
-- =============================================================================
--
-- Dois defeitos achados na revisão de 23/09/2026 (supabase/testes/financeiro.sql):
--
-- 1. CONTA QUE NÃO MUDAVA DE MÊS. A competência de uma conta avulsa é o mês do
--    vencimento, mas só era calculada ao criar. Mudar o vencimento de 16/10
--    para 16/09 deixava a conta presa em outubro — ela sumia da lista de
--    setembro, onde a pessoa a procurava. Aconteceu no piloto. Agora a
--    competência acompanha o vencimento. Conta gerada por recorrente continua
--    no mês a que pertence: o aluguel de setembro pago em 2 de outubro ainda é
--    o aluguel de setembro.
--
-- 2. FECHAMENTO SEM AS CONTAS FIXAS. As contas recorrentes do mês só nasciam
--    quando alguém abria o Painel ou as Contas daquele mês. Um mês que ninguém
--    abriu fechava sem o aluguel na lista de pendências. Agora o fechamento
--    gera as do mês antes de tirar a foto.

create or replace function privado.preparar_conta()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.competencia is null then
    new.competencia := privado.inicio_mes(new.vencimento);
  end if;

  if tg_op = 'UPDATE' and new.recorrente_id is null
     and new.vencimento is distinct from old.vencimento then
    new.competencia := privado.inicio_mes(new.vencimento);
  end if;

  if new.data_pagamento is not null and new.data_pagamento > privado.hoje() then
    raise exception 'A data de pagamento não pode estar no futuro.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create or replace function public.fechar_mes(p_competencia date)
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

  perform public.gerar_contas_do_mes(v_mes);
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
