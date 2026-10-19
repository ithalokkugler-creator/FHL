-- Ensaio da migração de 08/10/2026 — PARTE 2: conferência depois.
-- ===============================================================
--
-- Roda depois das migrações novas sobre os dados de antes.sql.

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);

with depois as (select * from public.serie_mensal('2026-10-01', 3))
select bool_and(a.saidas = d.saidas and a.entradas = d.entradas) as ok,
       'L01 entradas e saídas de cada mês continuam iguais, no centavo' as teste,
       string_agg(to_char(a.competencia, 'MM') || ' ' || a.saidas || '→' || d.saidas, ', ') as detalhe
  from public.__antes_serie a join depois d using (competencia)
union all
select count(*) = 4, 'L02 cada conta paga (não cancelada) virou um pagamento legado', count(*)::text
  from public.pagamentos_despesa where origem = 'legado'
union all
select not exists (select 1 from public.pagamentos_despesa p join public.contas c on c.id = p.conta_id
                    where c.descricao = 'Conta cancelada que tinha pagamento'),
       'L03 conta cancelada não ganhou pagamento (nunca entrou nas saídas)', null
union all
select bool_and(a.situacao = v.situacao and a.valor is not distinct from v.valor),
       'L04 situação e valor de cada despesa continuam os mesmos',
       string_agg(case when a.situacao <> v.situacao then v.descricao || ': ' || a.situacao || '→' || v.situacao end, '; ')
  from public.__antes_contas a join public.v_contas v using (id)
union all
select bool_and(a.totais = f.totais and a.divisao = f.divisao),
       'L05 a foto do mês fechado não mudou', null
  from public.__antes_fechamento a join public.fechamentos f using (competencia)
union all
select (select coalesce(sum(total), 0) from public.__antes_reembolsos)
       = (select coalesce(sum(valor), 0) from public.pagamentos_despesa
           where pago_por_id is not null and reembolsado_em is null and estornado_em is null),
       'L06 reembolso pendente aos sócios é o mesmo', null
union all
select count(*) = 3 and bool_and(codigo ~ '^C[0-9]{3}/[0-9]{4}$') and count(distinct codigo) = 3,
       'L07 contratos antigos (inclusive o cancelado) ganharam código único',
       string_agg(codigo, ', ')
  from public.contratos
union all
select bool_and(data_contrato is null and data_contrato_origem = 'a_confirmar'),
       'L08 data de formalização dos antigos fica a confirmar, sem inventar', null
  from public.contratos
union all
select count(*) = 1, 'L09 telefone e e-mail do cliente viraram contato principal', count(*)::text
  from public.clientes_contatos where principal
union all
select count(*) = (select count(*) from public.recebimentos), 'L10 recebimentos antigos ficam sem conta (origem legada)', null
  from public.recebimentos where conta_financeira_id is null
union all
select (select count(*) from public.auditoria where acao = 'migrou' and tabela = 'pagamentos_despesa') = 4,
       'L11 cada pagamento migrado ficou no histórico como "migrou"', null
union all
select (select data_pagamento from public.contas where descricao = 'Internet de setembro') = '2026-10-01',
       'L12 a quitação continua com a data do pagamento', null
-- Migração de 19/10 (fixo + êxito e acordo com repasse).
union all
select count(*) = 2 and bool_and(p.parte = 'exito'),
       'L13 as parcelas do êxito já apurado ficaram marcadas como do êxito', count(*)::text
  from public.parcelas p join public.contratos c on c.id = p.contrato_id
 where c.descricao = 'Êxito legado'
union all
select c.valor_exito = 600 and c.exito_apurado_em is not null and v.situacao = 'ativo'
       and not v.exito_pendente and v.diferenca_plano = 0,
       'L14 o êxito já apurado ganhou valor e data da apuração, e o plano continua fechando',
       v.situacao || ':' || coalesce(c.valor_exito::text, '-') || ':' || v.diferenca_plano
  from public.contratos c join public.v_contratos v on v.id = c.id
 where c.descricao = 'Êxito legado'
union all
select bool_and(p.parte = 'fixo' and p.cota_escritorio_pct = 100),
       'L15 as parcelas dos contratos fixos continuam do fixo e 100% do escritório', null
  from public.parcelas p join public.contratos c on c.id = p.contrato_id
 where c.tipo_honorario = 'fixo'
union all
select count(*) = 0, 'L16 nenhum recebimento antigo ganhou parte de cliente a repassar', count(*)::text
  from public.recebimentos where valor_repasse <> 0;
