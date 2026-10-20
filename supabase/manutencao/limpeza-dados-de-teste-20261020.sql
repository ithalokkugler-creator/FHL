-- =============================================================================
-- LIMPEZA DOS DADOS DE TESTE — produção (20/10/2026)
-- =============================================================================
--
-- JÁ RODADO em 20/10/2026 pelo Ithalo, no SQL Editor (conferido depois: tudo
-- como abaixo). Fica como registro. NÃO é migração; se alguém rodar de novo,
-- para no "create schema" e nada muda.
--
-- O que faz: COPIA cada registro de teste para o schema arquivo_teste_20261020
-- e depois o tira das tabelas do sistema. Um bloco só: se qualquer passo
-- falhar, nada muda. Nada se perde — para devolver uma tabela:
--   alter table public.<tabela> disable trigger user;
--   insert into public.<tabela> select * from arquivo_teste_20261020.<tabela>;
--   alter table public.<tabela> enable trigger user;
-- Quando o escritório confirmar que nada faz falta, a cópia pode ser apagada
-- (drop schema arquivo_teste_20261020 cascade) — decisão de vocês.
--
-- SAI (conferido em 20/10, antes de preparar este arquivo):
--   · Financeiro inteiro: 4 contratos (C001–C004), 9 parcelas, 3 recebimentos,
--     2 ajustes, 1 cobrança, 6 contas (Luz, água, HADERACH e 3 "TESTE"),
--     1 conta recorrente, 2 pagamentos, 2 alertas — e a numeração volta a C001/2026.
--   · Testes de 06/10 a 13/10 (antes do uso real): 8 tarefas, 10 compromissos,
--     6 atualizações, 17 documentos (todos cancelados), 5 intimações lançadas à
--     mão, 2 consultas ao DJEN de 09/10, 9 contatos (leads) e 6 envios de
--     formulário de teste.
--   · 2 feriados "TESTE", 3 publicações de teste (rascunhos) e 2 campanhas "TESTE".
--   · O histórico (auditoria) só desses registros.
--
-- FICA: os 40 clientes (com detalhes, contatos e os 40 processos), os membros,
-- todas as configurações, as 65 intimações do DJEN e as 7 consultas reais, o
-- conteúdo real do site e o uso real a partir de 15/10 (14 tarefas, 2
-- compromissos, 4 atualizações e 2 documentos cancelados).
do $limpeza$
declare
  v_corte constant timestamptz := timestamptz '2026-10-15 00:00:00-03';
  v_corte_consultas constant timestamptz := timestamptz '2026-10-13 00:00:00-03';
  t text;
begin
  create schema arquivo_teste_20261020;
  comment on schema arquivo_teste_20261020 is
    'Cópia dos dados de teste retirados em 20/10/2026, antes do uso real. Para devolver uma tabela: '
    'insert into public.<tabela> select * from arquivo_teste_20261020.<tabela> (com os gatilhos de usuário desligados). '
    'Pode ser apagado quando o escritório confirmar que nada faz falta.';

  -- Financeiro: era todo de teste.
  create table arquivo_teste_20261020.contratos as select * from public.contratos;
  create table arquivo_teste_20261020.parcelas as select * from public.parcelas;
  create table arquivo_teste_20261020.renegociacoes as select * from public.renegociacoes;
  create table arquivo_teste_20261020.recebimentos as select * from public.recebimentos;
  create table arquivo_teste_20261020.repasses_cliente as select * from public.repasses_cliente;
  create table arquivo_teste_20261020.ajustes_financeiros as select * from public.ajustes_financeiros;
  create table arquivo_teste_20261020.cobrancas as select * from public.cobrancas;
  create table arquivo_teste_20261020.contas as select * from public.contas;
  create table arquivo_teste_20261020.contas_recorrentes as select * from public.contas_recorrentes;
  create table arquivo_teste_20261020.pagamentos_despesa as select * from public.pagamentos_despesa;
  create table arquivo_teste_20261020.eventos_alerta as select * from public.eventos_alerta;
  create table arquivo_teste_20261020.contratos_sequencias as select * from privado.contratos_sequencias;

  -- Testes de 06/10 a 13/10: antes do uso real, que começou em 15/10.
  create table arquivo_teste_20261020.compromissos as select * from public.compromissos where criado_em < v_corte;
  create table arquivo_teste_20261020.tarefas as select * from public.tarefas where criado_em < v_corte;
  create table arquivo_teste_20261020.atualizacoes as select * from public.atualizacoes where criado_em < v_corte;
  create table arquivo_teste_20261020.intimacoes as
    select * from public.intimacoes where fonte = 'manual' and criado_em < v_corte;
  create table arquivo_teste_20261020.intimacoes_consultas as
    select * from public.intimacoes_consultas where criado_em < v_corte_consultas;
  create table arquivo_teste_20261020.documentos as
    select d.* from public.documentos d
     where d.criado_em < v_corte or d.contrato_id is not null or d.recebimento_id is not null
        or d.compromisso_id in (select id from arquivo_teste_20261020.compromissos)
        or d.atualizacao_id in (select id from arquivo_teste_20261020.atualizacoes);
  create table arquivo_teste_20261020.contatos as select * from public.contatos where criado_em < v_corte;
  create table arquivo_teste_20261020.contatos_envios as select * from public.contatos_envios;
  create table arquivo_teste_20261020.feriados as select * from public.feriados where nome ilike 'teste%';
  create table arquivo_teste_20261020.publicacoes as select * from public.publicacoes where titulo ilike 'teste%';
  create table arquivo_teste_20261020.campanhas as select * from public.campanhas where titulo ilike 'teste%';

  -- O histórico desses registros.
  create table arquivo_teste_20261020.auditoria as
    select a.* from public.auditoria a
     where a.registro_id in (
       select id from arquivo_teste_20261020.contratos union all select id from arquivo_teste_20261020.parcelas
       union all select id from arquivo_teste_20261020.renegociacoes union all select id from arquivo_teste_20261020.recebimentos
       union all select id from arquivo_teste_20261020.repasses_cliente union all select id from arquivo_teste_20261020.ajustes_financeiros
       union all select id from arquivo_teste_20261020.cobrancas union all select id from arquivo_teste_20261020.contas
       union all select id from arquivo_teste_20261020.contas_recorrentes union all select id from arquivo_teste_20261020.pagamentos_despesa
       union all select id from arquivo_teste_20261020.eventos_alerta union all select id from arquivo_teste_20261020.compromissos
       union all select id from arquivo_teste_20261020.tarefas union all select id from arquivo_teste_20261020.atualizacoes
       union all select id from arquivo_teste_20261020.intimacoes union all select id from arquivo_teste_20261020.intimacoes_consultas
       union all select id from arquivo_teste_20261020.documentos union all select id from arquivo_teste_20261020.contatos
       union all select id from arquivo_teste_20261020.feriados union all select id from arquivo_teste_20261020.publicacoes
       union all select id from arquivo_teste_20261020.campanhas);

  -- Só o administrador do banco lê a cópia: fora da Data API e do sistema.
  revoke all on schema arquivo_teste_20261020 from public;
  revoke all on all tables in schema arquivo_teste_20261020 from public;
  execute 'revoke all on schema arquivo_teste_20261020 from anon, authenticated';
  execute 'revoke all on all tables in schema arquivo_teste_20261020 from anon, authenticated';

  -- Sai das tabelas na ordem das ligações. "Nada se apaga" são gatilhos de
  -- usuário: desligados só aqui; as chaves estrangeiras continuam valendo.
  foreach t in array array['documentos', 'eventos_alerta', 'repasses_cliente', 'ajustes_financeiros', 'cobrancas',
                           'recebimentos', 'parcelas', 'renegociacoes', 'contratos', 'pagamentos_despesa', 'contas',
                           'contas_recorrentes', 'tarefas', 'atualizacoes', 'intimacoes', 'compromissos',
                           'intimacoes_consultas', 'contatos', 'contatos_envios', 'feriados', 'publicacoes', 'campanhas',
                           'auditoria'] loop
    execute format('alter table public.%I disable trigger user', t);
    execute format('delete from public.%1$I x where x.id in (select id from arquivo_teste_20261020.%1$I)', t);
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- Numeração de contratos recomeça: o próximo é C001/2026.
  delete from privado.contratos_sequencias;
end
$limpeza$;

-- Conferência (rode depois): o que ficou em cada tabela.
select 'contratos' as tabela, count(*) from public.contratos
union all select 'tarefas', count(*) from public.tarefas
union all select 'compromissos', count(*) from public.compromissos
union all select 'clientes', count(*) from public.clientes
union all select 'processos', count(*) from public.processos
union all select 'intimacoes', count(*) from public.intimacoes
union all select 'publicacoes', count(*) from public.publicacoes;
