-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 04 · Ajustes do piloto
-- =============================================================================
--
-- 1. Índices das chaves estrangeiras apontadas pelo advisor do Supabase.
--
-- 2. Correção monetária pelo IPCA como critério padrão. É o que o próprio
--    contrato de honorários do escritório prevê ("correção monetária, juros
--    moratórios de 1% ao mês, multa de 10%") e o índice que a Lei 14.905/2024
--    adota quando o contrato não diz qual. A validar pelo Vinícius (6.5).

create index contas_categoria on public.contas (categoria_id);
create index contas_forma on public.contas (forma_id);
create index contas_pago_por on public.contas (pago_por_id);
create index contas_recorrentes_categoria on public.contas_recorrentes (categoria_id);
create index contas_recorrentes_forma on public.contas_recorrentes (forma_id);
create index contratos_forma_prevista on public.contratos (forma_prevista_id);
create index contratos_responsavel on public.contratos (responsavel_id);
create index parcelas_renegociacao on public.parcelas (renegociacao_id);
create index parcelas_origem_renegociacao on public.parcelas (origem_renegociacao_id);
create index recebimentos_forma on public.recebimentos (forma_id);

update public.config_financeiro set correcao = 'ipca';
