-- Ensaio da migração de 08/10/2026 — PARTE 1: dados no formato antigo.
-- =====================================================================
--
-- Roda num banco que tem só as migrações até 20261006211332 (o que está em
-- produção). Grava os casos que a migração dos pagamentos precisa preservar:
-- conta paga pelo caixa, paga pela sócia e reembolsada, cancelada que tinha
-- data de pagamento, de valor variável sem valor, mês fechado, contrato
-- cancelado. Guarda a foto "antes" em tabelas __antes_* para a parte 2.
-- Só para `npm run banco:test` — nunca no Supabase.

insert into auth.users (id, email, email_confirmed_at, aud, role)
values ('00000000-0000-4000-8000-0000000000a1', 'legado-admin@teste.local', now(), 'authenticated', 'authenticated');
update public.membros set email = 'legado-admin@teste.local' where nome_curto = 'Vinícius';
update public.membros set ativo = false where nome_curto = 'Marlon';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);
set role authenticated;
select public.iniciar_sessao();

insert into public.clientes (nome, telefone, email) values
  ('Cliente Legado', '41999990000', 'legado@exemplo.com.br'),
  ('Cliente Cancelado', null, null);

select public.criar_contrato(jsonb_build_object(
  'cliente_id', (select id from public.clientes where nome = 'Cliente Legado'),
  'descricao', 'Contrato legado', 'valor_total', 900,
  'parcelas', jsonb_build_array(
    jsonb_build_object('numero', 1, 'vencimento', '2026-08-10', 'valor', 300),
    jsonb_build_object('numero', 2, 'vencimento', '2026-09-10', 'valor', 300),
    jsonb_build_object('numero', 3, 'vencimento', '2026-12-10', 'valor', 300))));
insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
select id, '2026-08-12', 300, 300, 0 from public.parcelas where numero = 1;

select public.criar_contrato(jsonb_build_object(
  'cliente_id', (select id from public.clientes where nome = 'Cliente Cancelado'),
  'descricao', 'Contrato cancelado', 'valor_total', 100,
  'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-09-01', 'valor', 100))));
update public.contratos set cancelado_em = now(), motivo_cancelamento = 'Desistiu' where descricao = 'Contrato cancelado';

insert into public.contas (descricao, categoria_id, valor, vencimento, data_pagamento, forma_id)
values ('Aluguel de agosto', (select id from public.categorias where nome = 'Aluguel'), 1500, '2026-08-05', '2026-08-05',
        (select id from public.formas_pagamento where nome = 'Pix'));
insert into public.contas (descricao, categoria_id, valor, vencimento, data_pagamento, pago_por_id, reembolsado_em)
values ('Café pago pela sócia', (select id from public.categorias where nome = 'Copa e café'), 45.90, '2026-08-20', '2026-08-20',
        (select id from public.membros where nome_curto = 'Juliana'), '2026-09-02');
insert into public.contas (descricao, categoria_id, valor, vencimento, data_pagamento, pago_por_id)
values ('Material pago pelo sócio', (select id from public.categorias where nome = 'Material'), 120, '2026-09-15', '2026-09-16',
        (select id from public.membros where nome_curto = 'Guilherme'));
insert into public.contas (descricao, categoria_id, valor, vencimento, data_pagamento)
values ('Internet de setembro', (select id from public.categorias where nome = 'Internet e telefone'), 99.90, '2026-09-10', '2026-10-01');
insert into public.contas (descricao, categoria_id, valor, vencimento, data_pagamento)
values ('Conta cancelada que tinha pagamento', (select id from public.categorias where nome = 'Outros'), 70, '2026-09-05', '2026-09-05');
update public.contas set cancelado_em = now(), motivo_cancelamento = 'Lançada em dobro'
 where descricao = 'Conta cancelada que tinha pagamento';
insert into public.contas (descricao, categoria_id, valor, vencimento)
values ('Água de outubro', (select id from public.categorias where nome = 'Água'), 80, '2026-10-15');
insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio)
values ('Energia', (select id from public.categorias where nome = 'Energia'), 12, null, '2026-08-01');
select public.gerar_contas_do_mes('2026-08-01');

select public.fechar_mes('2026-08-01');

reset role;

-- A foto de antes.
create table public.__antes_serie as select * from public.serie_mensal('2026-10-01', 3);
create table public.__antes_contas as select id, situacao, valor from public.v_contas;
create table public.__antes_fechamento as select competencia, totais, divisao from public.fechamentos;
create table public.__antes_reembolsos as
  select pago_por_id, sum(valor) as total from public.contas
   where pago_por_id is not null and reembolsado_em is null and cancelado_em is null group by pago_por_id;
