-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Especificação financeira (DOCX v1.0) e DJEN, direto no banco
-- =============================================================================
--
-- preparacao-financeiro-docx.md §7 (cenários G01–G24) e F6. Tudo acontece
-- num bloco desfeito no fim: nada fica gravado. Não rode em produção — rode
-- com `npm run banco:test` (PostgreSQL isolado) ou numa branch do Supabase.
--
-- Identidades simuladas pelo JWT: administrador (Vinícius), sócia com
-- Financeiro completo (Juliana), secretária (lançamentos, sem Clientes nem
-- Prazos), Consulta, Auditoria e associado sem Financeiro.

create or replace function pg_temp.como(p_user uuid, p_papel text default 'authenticated')
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', p_papel)::text, true);
  perform set_config('role', p_papel, true);
end
$$;

-- Roda o comando; devolve 'aceitou' ou "SQLSTATE mensagem".
create or replace function pg_temp.erro(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'aceitou';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end
$$;

create or replace function pg_temp.t(p_ok boolean, p_teste text, p_detalhe anyelement)
returns jsonb
language sql
as $$
  select jsonb_build_object('ok', coalesce(p_ok, false), 't', p_teste, 'd', p_detalhe::text)
$$;

create or replace function pg_temp.testar_docx()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  u_socia  uuid := gen_random_uuid();
  u_sec    uuid := gen_random_uuid();
  u_cons   uuid := gen_random_uuid();
  u_audit  uuid := gen_random_uuid();
  u_assoc  uuid := gen_random_uuid();
  m_admin  uuid;
  m_socia  uuid;
  m_sec    uuid;
  v_cli    uuid;
  v_cli2   uuid;
  v_pix    uuid;
  v_alug   uuid;
  v_caixa  uuid;
  v_banco  uuid;
  v_conta  uuid;
  v_pg1    uuid;
  v_pg2    uuid;
  c1       uuid;
  c2       uuid;
  c3       uuid;
  c_ano    uuid;
  p1       uuid;
  p2       uuid;
  p3       uuid;
  v_id     uuid;
  v_id2    uuid;
  v_rec    uuid;
  v_proc   uuid;
  v_imp    uuid;
  v_qtd    integer;
  v_num    numeric;
  v_num2   numeric;
  v_txt    text;
  v_aux    text;
  v_bool   boolean;
  j        jsonb;
  m        integer;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'docx-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_socia, 'docx-socia@teste.local', now(), 'authenticated', 'authenticated'),
      (u_sec,   'docx-sec@teste.local',   now(), 'authenticated', 'authenticated'),
      (u_cons,  'docx-cons@teste.local',  now(), 'authenticated', 'authenticated'),
      (u_audit, 'docx-audit@teste.local', now(), 'authenticated', 'authenticated'),
      (u_assoc, 'docx-assoc@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'docx-admin@teste.local' where nome_curto = 'Vinícius' returning id into m_admin;
    update public.membros set email = 'docx-socia@teste.local' where nome_curto = 'Juliana' returning id into m_socia;
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Secretária Teste', 'Secretária', 'docx-sec@teste.local', 'secretaria', 'todas', 'lancamentos')
      returning id into m_sec;
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Consulta Teste', 'Consulta', 'docx-cons@teste.local', 'associado', 'nenhum', 'consulta');
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro, acesso_auditoria)
      values ('Auditoria Teste', 'Auditoria', 'docx-audit@teste.local', 'associado', 'nenhum', 'consulta', 'ver');
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Associado Teste', 'Associado', 'docx-assoc@teste.local', 'associado', 'propria', 'nenhum');
    select id into v_pix from public.formas_pagamento where nome = 'Pix';
    select id into v_alug from public.categorias where nome = 'Aluguel';
    select id into v_caixa from public.contas_financeiras where padrao;

    foreach v_txt in array array[u_admin::text, u_socia::text, u_sec::text, u_cons::text, u_audit::text, u_assoc::text] loop
      perform pg_temp.como(v_txt::uuid);
      perform public.iniciar_sessao();
    end loop;

    -- ================= T01 · despesa paga em partes =================
    etapa := 'despesas';
    perform pg_temp.como(u_sec);
    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Aluguel de maio', v_alug, 1000, '2026-05-10') returning id into v_conta;
    select saldo || ':' || situacao into v_txt from public.v_contas where id = v_conta;
    res := res || pg_temp.t(v_txt = '1000.00:vencida', 'D01 despesa nasce com saldo igual à obrigação', v_txt);

    j := public.registrar_pagamento_despesa(jsonb_build_object('conta_id', v_conta, 'valor', 400, 'data', '2026-06-05', 'forma_id', v_pix));
    v_pg1 := (j ->> 'pagamento_id')::uuid;
    select saldo || ':' || parcial || ':' || situacao || ':' || valor into v_txt from public.v_contas where id = v_conta;
    res := res || pg_temp.t(v_txt = '600.00:true:vencida:1000.00' and (j ->> 'saldo')::numeric = 600,
      'D02 pagar 400 de 1.000 deixa 600 de saldo e a obrigação continua 1.000', v_txt);

    v_txt := pg_temp.erro(format($q$select public.registrar_pagamento_despesa(jsonb_build_object('conta_id', %L, 'valor', 700, 'data', '2026-07-01'))$q$, v_conta));
    res := res || pg_temp.t(v_txt like '%passa do saldo%', 'D03 pagamento acima do saldo é recusado', v_txt);

    j := public.registrar_pagamento_despesa(jsonb_build_object('conta_id', v_conta, 'valor', 600, 'data', '2026-07-05'));
    v_pg2 := (j ->> 'pagamento_id')::uuid;
    select situacao || ':' || data_pagamento || ':' || pagamentos into v_txt from public.v_contas where id = v_conta;
    res := res || pg_temp.t(v_txt = 'paga:2026-07-05:2', 'D04 segundo pagamento quita e a quitação é a data do último', v_txt);

    select string_agg(to_char(competencia, 'MM') || '=' || saidas, ',' order by competencia) into v_txt
      from public.serie_mensal('2026-07-01', 3);
    res := res || pg_temp.t(v_txt = '05=0,06=400.00,07=600.00', 'D05 saídas de caixa no mês de cada pagamento (G03)', v_txt);

    perform pg_temp.como(u_socia);
    j := public.previa_fechamento('2026-05-01');
    res := res || pg_temp.t((j #>> '{totais,despesas_previstas}')::numeric = 1000 and (j #>> '{totais,saidas}')::numeric = 0,
      'D06 maio prevê 1.000 de despesa e não teve saída de caixa', j -> 'totais');
    perform pg_temp.como(u_sec);

    perform public.estornar_pagamento_despesa(v_pg1, 'Pago na conta errada');
    select saldo || ':' || situacao || ':' || coalesce(data_pagamento::text, '-') into v_txt from public.v_contas where id = v_conta;
    select valor || ':' || (estornado_por = m_sec) into v_aux from public.pagamentos_despesa where id = v_pg1;
    res := res || pg_temp.t(v_txt = '400.00:vencida:-' and v_aux = '400.00:true',
      'D07 estorno devolve o saldo e conserva o pagamento original', v_txt || ' / ' || v_aux);

    v_txt := pg_temp.erro(format($q$select public.estornar_pagamento_despesa(%L, 'de novo')$q$, v_pg1));
    res := res || pg_temp.t(v_txt like '%estornado não pode%', 'D08 o mesmo pagamento não se estorna duas vezes (G04)', v_txt);

    j := public.registrar_pagamento_despesa(jsonb_build_object('conta_id', v_conta, 'valor', 100, 'data', '2026-07-06', 'chave', 'k-docx-1'));
    v_id := (j ->> 'pagamento_id')::uuid;
    j := public.registrar_pagamento_despesa(jsonb_build_object('conta_id', v_conta, 'valor', 100, 'data', '2026-07-06', 'chave', 'k-docx-1'));
    select count(*) into v_qtd from public.pagamentos_despesa where chave_idempotencia = 'k-docx-1';
    res := res || pg_temp.t(v_qtd = 1 and (j ->> 'pagamento_id')::uuid = v_id, 'D09 repetir o pedido devolve o mesmo pagamento (G06)', v_qtd);
    v_txt := pg_temp.erro(format($q$select public.registrar_pagamento_despesa(jsonb_build_object('conta_id', %L, 'valor', 101, 'data', '2026-07-06', 'chave', 'k-docx-1'))$q$, v_conta));
    res := res || pg_temp.t(v_txt like '%outros valores%', 'D10 a mesma chave com outro valor é recusada', v_txt);

    v_txt := pg_temp.erro(format($q$update public.contas set valor = 1200 where id = %L$q$, v_conta));
    res := res || pg_temp.t(v_txt like '%motivo da mudança%', 'D11 obrigação com pagamento só muda de valor com motivo', v_txt);
    v_txt := pg_temp.erro(format($q$update public.contas set valor = 500, motivo_ajuste = 'x' where id = %L$q$, v_conta));
    res := res || pg_temp.t(v_txt like '%abaixo do que já foi pago%', 'D12 obrigação não fica abaixo do já pago', v_txt);
    update public.contas set valor = 1200, motivo_ajuste = 'Reajuste do aluguel' where id = v_conta;
    select saldo::text into v_txt from public.v_contas where id = v_conta;
    res := res || pg_temp.t(v_txt = '500.00', 'D13 obrigação corrigida com motivo recalcula o saldo', v_txt);

    v_txt := pg_temp.erro(format($q$update public.contas set cancelado_em = now(), motivo_cancelamento = 'x' where id = %L$q$, v_conta));
    res := res || pg_temp.t(v_txt like '%Estorne o pagamento%', 'D14 despesa com pagamento não se cancela', v_txt);

    v_txt := pg_temp.erro($q$update public.contas set data_pagamento = '2026-07-01' where descricao = 'Aluguel de maio'$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'D15 ninguém grava a quitação direto na despesa', v_txt);

    -- Sócia paga do bolso e é reembolsada depois: a despesa conta uma vez.
    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Café de junho', v_alug, 80, '2026-06-20') returning id into v_id;
    j := public.registrar_pagamento_despesa(jsonb_build_object('conta_id', v_id, 'valor', 80, 'data', '2026-06-20', 'pago_por_id', m_socia));
    v_id2 := (j ->> 'pagamento_id')::uuid;
    select conta_financeira_id is null into v_bool from public.pagamentos_despesa where id = v_id2;
    perform public.registrar_reembolso(v_id2, '2026-07-02');
    select saidas::text into v_txt from public.serie_mensal('2026-06-01', 1);
    select count(*) into v_qtd from public.v_movimentacoes_financeiras where origem = 'reembolso_socio' and origem_id = v_id2 and conta_financeira_id = v_caixa;
    -- Junho: só o café (o pagamento de 400 foi estornado em D07).
    res := res || pg_temp.t(v_bool and v_txt = '80.00' and v_qtd = 1,
      'D16 pago pela sócia: custo em junho uma vez, reembolso sai do Caixa em julho (G23)', v_txt || ' / ' || v_qtd);

    -- ================= T03 · contas financeiras =================
    etapa := 'contas financeiras';
    insert into public.clientes (nome, documento, telefone) values ('Cliente DOCX', '52998224725', '41988880000') returning id into v_cli;
    insert into public.recebimentos (tipo_avulsa, cliente_id, data, valor, valor_principal, valor_encargos)
      values ('consulta', v_cli, '2026-06-10', 300, 300, 0) returning id into v_rec;
    select conta_financeira_id = v_caixa into v_bool from public.recebimentos where id = v_rec;
    res := res || pg_temp.t(v_bool, 'C01 recebimento sem conta vai para a conta padrão (Caixa)', v_bool);

    v_txt := pg_temp.erro($q$insert into public.contas_financeiras (nome, tipo) values ('Banco da secretária', 'corrente')$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'C02 só o administrador cadastra conta financeira', v_txt);

    perform pg_temp.como(u_admin);
    insert into public.contas_financeiras (nome, tipo, banco) values ('Banco Fictício', 'corrente', 'Banco Teste') returning id into v_banco;
    perform pg_temp.como(u_sec);
    select string_agg(to_char(competencia, 'MM') || '=' || entradas || '/' || saidas, ',' order by competencia) into v_txt
      from public.serie_mensal('2026-07-01', 2);
    insert into public.transferencias_financeiras (origem_id, destino_id, valor, data, justificativa)
      values (v_caixa, v_banco, 500, '2026-07-03', 'Depósito do caixa no banco') returning id into v_id;
    select saldo into v_num from public.v_saldos_contas where id = v_banco;
    select string_agg(to_char(competencia, 'MM') || '=' || entradas || '/' || saidas, ',' order by competencia) into v_aux
      from public.serie_mensal('2026-07-01', 2);
    res := res || pg_temp.t(v_num = 500 and v_aux = v_txt,
      'C03 transferência move 500 entre contas sem virar receita nem despesa (G07)', v_num || ' / ' || v_txt);

    v_txt := pg_temp.erro(format($q$insert into public.transferencias_financeiras (origem_id, destino_id, valor, data, justificativa) values (%L, %L, 10, '2026-07-03', 'x')$q$, v_caixa, v_caixa));
    res := res || pg_temp.t(v_txt like '23514%', 'C04 transferência para a mesma conta é recusada', v_txt);

    v_txt := pg_temp.erro(format($q$update public.transferencias_financeiras set estornado_em = now() where id = %L$q$, v_id));
    res := res || pg_temp.t(v_txt like '%motivo do estorno%', 'C05 estornar transferência exige motivo', v_txt);
    update public.transferencias_financeiras set estornado_em = now(), motivo_estorno = 'Digitado em dobro' where id = v_id;
    select saldo into v_num from public.v_saldos_contas where id = v_banco;
    res := res || pg_temp.t(v_num = 0, 'C06 estorno da transferência devolve os saldos', v_num);

    perform pg_temp.como(u_admin);
    update public.contas_financeiras set ativo = false where id = v_banco;
    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (tipo_avulsa, data, valor, valor_principal, valor_encargos, conta_financeira_id) values ('outros', '2026-07-01', 10, 10, 0, %L)$q$, v_banco));
    res := res || pg_temp.t(v_txt like '%inativa%', 'C07 conta inativa não recebe movimento novo', v_txt);

    -- ================= T02 · contratos =================
    etapa := 'contratos';
    c1 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato DOCX 1', 'valor_total', 1000, 'data_contrato', '2026-06-01',
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2026-06-10', 'valor', 333.33),
        jsonb_build_object('numero', 2, 'vencimento', '2026-07-10', 'valor', 333.33),
        jsonb_build_object('numero', 3, 'vencimento', '2026-08-10', 'valor', 333.34))));
    c2 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato DOCX 2', 'valor_total', 900, 'data_contrato', '2026-06-02',
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2026-06-15', 'valor', 300),
        jsonb_build_object('numero', 2, 'vencimento', '2026-07-15', 'valor', 300),
        jsonb_build_object('numero', 3, 'vencimento', '2026-09-15', 'valor', 300))));
    select string_agg(codigo, ',' order by codigo) into v_txt from public.contratos where id in (c1, c2);
    res := res || pg_temp.t(v_txt ~ '^C[0-9]{3}/2026,C[0-9]{3}/2026$' and split_part(v_txt, ',', 1) <> split_part(v_txt, ',', 2),
      'K01 cada contrato ganha código único C000/ANO (G10)', v_txt);

    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object('cliente_id', %L, 'descricao', 'Antes', 'valor_total', 100, 'data_contrato', '2026-06-20', 'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-06-01', 'valor', 100))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%Confirme e informe o motivo%', 'K02 vencimento antes da formalização pede confirmação', v_txt);
    c3 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato com vencimento anterior', 'valor_total', 100, 'data_contrato', '2026-06-20',
      'confirmar_vencimento_anterior', true, 'motivo_vencimento_anterior', 'Honorários de consulta já prestada',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-06-01', 'valor', 100))));
    select motivo_vencimento_anterior into v_txt from public.contratos where id = c3;
    res := res || pg_temp.t(v_txt is not null, 'K03 confirmado com motivo, o contrato entra e guarda o motivo', v_txt);

    perform set_config('role', 'none', true);
    v_txt := pg_temp.erro(format($q$update public.contratos set codigo = 'X999/2026' where id = %L$q$, c1));
    perform pg_temp.como(u_sec);
    res := res || pg_temp.t(v_txt like '%não muda depois de emitido%', 'K04 código emitido não muda nem pelo dono da tabela', v_txt);

    select id into p1 from public.parcelas where contrato_id = c1 and numero = 2;
    v_txt := pg_temp.erro(format($q$update public.parcelas set vencimento = '2026-07-20' where id = %L$q$, p1));
    res := res || pg_temp.t(v_txt like '%motivo da mudança de vencimento%', 'K05 mudar vencimento pede motivo (G05)', v_txt);

    select id into p2 from public.parcelas where contrato_id = c1 and numero = 1;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (p2, '2026-06-10', 333.33, 333.33, 0);
    v_txt := pg_temp.erro(format($q$update public.parcelas set cancelado_em = now(), motivo_cancelamento = 'x' where id = %L$q$, p2));
    res := res || pg_temp.t(v_txt like '%Parcela paga não se cancela%', 'K06 parcela paga não se cancela', v_txt);

    select id into p3 from public.parcelas where contrato_id = c1 and numero = 3;
    v_txt := pg_temp.erro(format($q$select public.redistribuir_parcelas(jsonb_build_object('contrato_id', %L, 'motivo', 'x', 'parcelas', jsonb_build_array(jsonb_build_object('id', %L, 'valor', 300), jsonb_build_object('id', %L, 'valor', 300))))$q$, c1, p1, p3));
    res := res || pg_temp.t(v_txt like '%precisa ser igual%', 'K07 redistribuir com soma diferente é recusado', v_txt);
    perform public.redistribuir_parcelas(jsonb_build_object('contrato_id', c1, 'motivo', 'Cliente pediu mais na última',
      'parcelas', jsonb_build_array(jsonb_build_object('id', p1, 'valor', 200), jsonb_build_object('id', p3, 'valor', 466.67))));
    select diferenca_plano::text into v_txt from public.v_contratos where id = c1;
    res := res || pg_temp.t(v_txt = '0.00', 'K08 redistribuído, o plano continua fechando com o total', v_txt);

    v_txt := pg_temp.erro(format($q$select public.arquivar_contrato(%L, 'encerrado')$q$, c1));
    res := res || pg_temp.t(v_txt like '%saldo em aberto%', 'K09 contrato com saldo não se arquiva', v_txt);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-07-01', 100, 100, 0 from public.parcelas where contrato_id = c3;
    perform public.arquivar_contrato(c3, 'Consulta paga, sem mais nada a receber');
    select ciclo || ':' || rotulo into v_txt from public.v_contratos where id = c3;
    res := res || pg_temp.t(v_txt = 'arquivado:arquivado', 'K10 contrato quitado se arquiva com motivo', v_txt);
    v_txt := pg_temp.erro(format($q$update public.contratos set descricao = 'outra' where id = %L$q$, c3));
    res := res || pg_temp.t(v_txt like '%desarquive%', 'K11 contrato arquivado não muda sem desarquivar', v_txt);

    v_id := public.criar_contrato(jsonb_build_object('cliente_id', v_cli, 'descricao', 'Sem data', 'valor_total', 50,
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-01-10', 'valor', 50))));
    select data_contrato_origem into v_txt from public.contratos where id = v_id;
    perform public.confirmar_formalizacao(v_id, '2026-01-05');
    select v_txt || ':' || data_contrato_origem || ':' || data_contrato into v_txt from public.contratos where id = v_id;
    res := res || pg_temp.t(v_txt = 'a_confirmar:informada:2026-01-05', 'K12 sem data, fica a confirmar; depois a data é informada', v_txt);

    -- ================= T03 · ajustes =================
    etapa := 'ajustes';
    v_txt := pg_temp.erro(format($q$select public.conceder_ajuste(jsonb_build_object('parcela_id', %L, 'tipo', 'desconto', 'valor', 10, 'motivo', 'x'))$q$, p1));
    res := res || pg_temp.t(v_txt like '42501%', 'A01 quem só lança não concede desconto', v_txt);
    select id into v_id from public.parcelas where contrato_id = c2 and numero = 1;
    perform pg_temp.como(u_socia);
    perform public.conceder_ajuste(jsonb_build_object('parcela_id', v_id, 'tipo', 'desconto', 'valor', 100, 'motivo', 'Pagamento à vista'));
    v_txt := pg_temp.erro(format($q$select public.conceder_ajuste(jsonb_build_object('parcela_id', %L, 'tipo', 'desconto', 'valor', 500, 'motivo', 'x'))$q$, v_id));
    res := res || pg_temp.t(v_txt like '%passa do saldo%', 'A02 desconto maior que o saldo é recusado', v_txt);
    perform pg_temp.como(u_sec);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (v_id, '2026-06-15', 200, 200, 0);
    select situacao || ':' || exigivel || ':' || pago_principal into v_txt from public.v_parcelas where id = v_id;
    res := res || pg_temp.t(v_txt = 'paga:200.00:200.00', 'A03 com desconto aprovado, receber o restante quita a parcela (G08)', v_txt);

    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, valor_multa, valor_juros, valor_correcao, valor_acrescimo) values (%L, '2026-07-16', 50, 40, 10, 5, 4, 0, 0)$q$,
      (select id from public.parcelas where contrato_id = c2 and numero = 2)));
    res := res || pg_temp.t(v_txt like '23514%', 'A04 componentes de encargo precisam somar os encargos', v_txt);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, valor_multa, valor_juros, valor_correcao, valor_acrescimo)
      values ((select id from public.parcelas where contrato_id = c2 and numero = 2), '2026-07-20', 310, 300, 10, 6, 3, 1, 0);
    select encargos_discriminados::text into v_txt from public.v_recebimentos where valor = 310;
    res := res || pg_temp.t(v_txt = 'true', 'A05 recebimento novo guarda multa, juros e correção separados', v_txt);

    -- ================= T04 · perfis =================
    etapa := 'perfis';
    perform pg_temp.como(u_cons);
    select count(*) into v_qtd from public.v_parcelas;
    res := res || pg_temp.t(v_qtd > 0, 'P01 Consulta lê o Financeiro', v_qtd);
    v_txt := pg_temp.erro($q$insert into public.recebimentos (tipo_avulsa, data, valor, valor_principal, valor_encargos) values ('outros', '2026-07-01', 1, 1, 0)$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'P02 Consulta não lança recebimento (G11)', v_txt);
    v_txt := pg_temp.erro(format($q$select public.registrar_pagamento_despesa(jsonb_build_object('conta_id', %L, 'valor', 1, 'data', '2026-07-01'))$q$, v_conta));
    res := res || pg_temp.t(v_txt like '42501%', 'P03 Consulta não paga despesa pela função', v_txt);
    v_txt := pg_temp.erro($q$select public.gerar_contas_do_mes('2026-07-01')$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'P04 Consulta não materializa contas fixas', v_txt);
    select count(*) into v_qtd from public.fechamentos;
    v_txt := pg_temp.erro($q$select public.previa_fechamento('2026-06-01')$q$);
    res := res || pg_temp.t(v_txt = 'aceitou', 'P05 Consulta lê a prévia de fechamento e a divisão', v_txt);
    v_txt := pg_temp.erro($q$select public.previa_fechamento_anual(2026)$q$);
    res := res || pg_temp.t(v_txt = 'aceitou', 'P05b Consulta lê a prévia anual', v_txt);
    v_txt := pg_temp.erro($q$select public.fechar_mes('2026-06-01')$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'P05c Consulta não fecha mês', v_txt);

    perform pg_temp.como(u_sec);
    insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio)
      values ('Internet DOCX', v_alug, 15, 120, '2026-01-01');
    perform pg_temp.como(u_cons);
    select count(*) into v_qtd from public.previsao_recorrentes('2027-01-01', '2027-03-31') where descricao = 'Internet DOCX';
    res := res || pg_temp.t(v_qtd = 3, 'P06 Consulta vê a previsão das recorrentes sem gravar nada (G12)', v_qtd);

    perform pg_temp.como(u_audit);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_qtd from public.auditoria where tabela = 'contratos' and registro_id = c1;
    v_txt := pg_temp.erro(format($q$update public.contratos set descricao = 'auditor mexeu' where id = %L$q$, c1));
    select descricao into v_aux from public.contratos where id = c1;
    res := res || pg_temp.t(v_qtd > 0 and v_aux = 'Contrato DOCX 1',
      'P07 Auditoria lê o histórico e não altera contrato', v_qtd || ' / ' || v_txt);
    perform pg_temp.como(u_assoc);
    select count(*) into v_qtd from public.auditoria where tabela = 'contratos';
    res := res || pg_temp.t(v_qtd = 0, 'P08 associado sem Financeiro não lê o histórico do Financeiro', v_qtd);

    -- ================= T13 · recorrências =================
    etapa := 'recorrências';
    perform pg_temp.como(u_sec);
    insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio, frequencia, mes_referencia)
      values ('Anuidade OAB', v_alug, 31, 900, '2026-01-01', 'anual', 2);
    select public.gerar_contas_do_mes('2026-02-01') into v_qtd;
    select vencimento::text into v_txt from public.contas where descricao = 'Anuidade OAB';
    v_qtd := public.gerar_contas_do_mes('2026-03-01');
    select count(*) into v_qtd from public.contas where descricao = 'Anuidade OAB';
    res := res || pg_temp.t(v_txt = '2026-02-28' and v_qtd = 1, 'R01 anual nasce só no mês dela, dia 31 vira 28/02 (G18)', v_txt || ' / ' || v_qtd);

    insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, inicio, frequencia, quantidade, valor_total)
      values ('Cadeiras em 3x', v_alug, 5, '2026-11-01', 'parcelada', 3, 1000);
    select string_agg(valor::text, '/' order by competencia) into v_txt
      from public.previsao_recorrentes('2026-11-01', '2027-04-30') where descricao = 'Cadeiras em 3x';
    res := res || pg_temp.t(v_txt = '333.33/333.33/333.34', 'R02 parcelada: 1.000 em 3 com o centavo na última', v_txt);
    v_qtd := public.gerar_contas_do_mes('2026-02-01');
    res := res || pg_temp.t(v_qtd = 0, 'R03 gerar de novo não duplica', v_qtd);

    -- ================= T07 · anexos e recibo =================
    etapa := 'anexos';
    select id into v_rec from public.recebimentos where valor = 310;
    j := public.reservar_anexo(jsonb_build_object('recebimento_id', v_rec, 'categoria', 'comprovante',
                                                  'descricao', 'Comprovante Pix', 'nome_original', 'C:\fakepath\pix.pdf'));
    v_id := (j ->> 'versao_id')::uuid;
    select nome_original || ':' || estado into v_txt from public.anexos_versoes where id = v_id;
    res := res || pg_temp.t(v_txt = 'pix.pdf:reservado' and j ->> 'objeto' ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$',
      'X01 reserva cria versão pendente com caminho opaco', v_txt || ' ' || (j ->> 'objeto'));

    insert into storage.objects (bucket_id, name) values ('anexos', j ->> 'objeto');
    v_txt := pg_temp.erro($q$insert into storage.objects (bucket_id, name) values ('anexos', 'outro/caminho.pdf')$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'X02 só se envia arquivo para o caminho reservado', v_txt);

    v_txt := pg_temp.erro(format($q$select public.finalizar_anexo_servico(%L, true, 'application/pdf', 1234, %L)$q$, v_id, repeat('a', 64)));
    res := res || pg_temp.t(v_txt like '42501%', 'X03 o navegador não finaliza o anexo', v_txt);

    perform pg_temp.como(u_cons);
    select count(*) into v_qtd from storage.objects where bucket_id = 'anexos' and name = j ->> 'objeto';
    v_txt := pg_temp.erro(format($q$select public.reservar_anexo(jsonb_build_object('recebimento_id', %L, 'nome_original', 'a.pdf'))$q$, v_rec));
    res := res || pg_temp.t(v_qtd = 0 and v_txt like '42501%', 'X04 Consulta não lê arquivo não verificado nem anexa', v_qtd || ' / ' || v_txt);

    perform pg_temp.como(null, 'service_role');
    perform public.finalizar_anexo_servico(v_id, true, 'application/pdf', 1234, repeat('b', 64));
    perform pg_temp.como(u_cons);
    select count(*) into v_qtd from storage.objects where bucket_id = 'anexos' and name = j ->> 'objeto';
    perform pg_temp.como(u_assoc);
    select count(*) into m from storage.objects where bucket_id = 'anexos' and name = j ->> 'objeto';
    res := res || pg_temp.t(v_qtd = 1 and m = 0, 'X05 verificado, quem lê o Financeiro baixa; quem não lê, não (G17)', v_qtd || ' / ' || m);

    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro(format($q$update public.anexos_versoes set sha256 = %L where id = %L$q$, repeat('c', 64), v_id));
    res := res || pg_temp.t(v_txt like '42501%' or v_txt like '%não muda%', 'X06 versão finalizada não muda', v_txt);

    insert into public.documentos (modelo, titulo, cliente_id, recebimento_id, conteudo)
      values ('recibo', 'Recibo', v_cli, v_rec, '<p>Recibo</p>') returning id into v_id;
    res := res || pg_temp.t(v_id is not null, 'X07 recibo é emitido por quem lança, sem precisar de Clientes', v_id);
    perform pg_temp.como(u_assoc);
    select count(*) into v_qtd from public.documentos where id = v_id;
    v_txt := pg_temp.erro(format($q$insert into public.documentos (modelo, titulo, cliente_id, recebimento_id, conteudo) values ('recibo', 'Sem acesso financeiro', %L, %L, '<p>recibo</p>')$q$, v_cli, v_rec));
    res := res || pg_temp.t(v_qtd = 0 and v_txt like '42501%', 'X08 acesso a Clientes sem Financeiro não lê nem emite recibo', v_qtd || ' / ' || v_txt);
    perform pg_temp.como(u_sec);

    -- ================= T12 · alertas =================
    etapa := 'alertas';
    select count(*) into v_qtd from public.pendencias_financeiras(7) where tipo = 'parcela_vencida';
    perform pg_temp.como(u_assoc);
    select count(*) into m from public.pendencias_financeiras(7);
    res := res || pg_temp.t(v_qtd > 0 and m = 0, 'L01 pendências calculadas só para quem lê o Financeiro', v_qtd || ' / ' || m);

    -- ================= T14 · contatos do cliente =================
    etapa := 'contatos';
    perform pg_temp.como(u_admin);
    insert into public.clientes_contatos (cliente_id, tipo, nome, telefone, recebe_cobranca)
      values (v_cli, 'financeiro', 'Financeiro da empresa', '41977776666', true);
    insert into public.clientes_contatos (cliente_id, tipo, nome, telefone)
      values (v_cli, 'familiar', 'Parente', '41966665555');
    perform public.salvar_cliente(jsonb_build_object('id', v_cli, 'nome', 'Cliente DOCX', 'documento', '52998224725',
      'telefone', '41988880000', 'detalhes', jsonb_build_object('tipo_pessoa', 'fisica', 'nome_fantasia', ' Loja DOCX ',
      'etiquetas', jsonb_build_array('VIP ', 'vip', 'Previdenciário'))));
    select array_to_string(etiquetas, ',') || ':' || nome_fantasia into v_txt from public.clientes_detalhes where cliente_id = v_cli;
    res := res || pg_temp.t(v_txt = 'previdenciário,vip:Loja DOCX', 'CC1 etiquetas normalizadas e nome fantasia aparado', v_txt);
    v_txt := pg_temp.erro(format($q$select public.salvar_cliente(jsonb_build_object('id', %L, 'nome', 'Cliente DOCX',
      'documento', '52998224725', 'detalhes', jsonb_build_object('tipo_pessoa', 'fisica', 'nascimento', '2099-01-01')))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '22023%', 'CC3 nascimento futuro é recusado', v_txt);
    perform pg_temp.como(u_sec);
    select string_agg(nome, ',') into v_txt from public.clientes_contatos where cliente_id = v_cli;
    res := res || pg_temp.t(v_txt = 'Financeiro da empresa',
      'CC2 o Financeiro vê só os contatos de cobrança', v_txt);

    -- ================= T15 · importação =================
    etapa := 'importação';
    v_imp := public.registrar_importacao(jsonb_build_object(
      'nome_arquivo', 'planilha-teste.csv', 'sha256', repeat('d', 64), 'versao_parser', 'teste',
      'linhas', jsonb_build_array(
        jsonb_build_object('linha', 2, 'tipo', 'parcela', 'chave_origem', 'K1', 'dados', '{}'::jsonb,
          'normalizado', jsonb_build_object('cliente_nome', 'Importado Um', 'documento', '11144477735', 'descricao', 'Honorários importados',
                                            'codigo', 'L-001', 'valor_total', 600, 'parcela', 1, 'vencimento', '2026-05-10', 'valor', 300,
                                            'valor_pago', 300, 'data_pagamento', '2026-05-12')),
        jsonb_build_object('linha', 3, 'tipo', 'parcela', 'chave_origem', 'K1', 'dados', '{}'::jsonb,
          'normalizado', jsonb_build_object('cliente_nome', 'Importado Um', 'documento', '11144477735', 'descricao', 'Honorários importados',
                                            'codigo', 'L-001', 'valor_total', 600, 'parcela', 2, 'vencimento', '2026-06-10', 'valor', 300)),
        jsonb_build_object('linha', 4, 'tipo', 'parcela', 'chave_origem', 'TESTE', 'dados', '{}'::jsonb,
          'normalizado', jsonb_build_object('cliente_nome', '', 'descricao', 'Contrato de teste', 'vencimento', '2026-06-10', 'valor', 0)),
        jsonb_build_object('linha', 5, 'tipo', 'despesa', 'chave_origem', 'D1', 'dados', '{}'::jsonb,
          'normalizado', jsonb_build_object('descricao', 'Luz importada', 'categoria', 'Energia', 'vencimento', '2026-05-20',
                                            'valor', 150, 'valor_pago', 150, 'data_pagamento', '2026-05-20')))));
    select estado || ':' || (totais ->> 'erros') into v_txt from public.importacoes where id = v_imp;
    res := res || pg_temp.t(v_txt = 'rascunho:1', 'I01 linha de teste com erro segura o lote (G19)', v_txt);
    perform public.excluir_linha_importacao((select id from public.importacao_linhas where importacao_id = v_imp and linha = 4),
                                            'Registro de teste indicado pelo escritório');
    select estado into v_txt from public.importacoes where id = v_imp;
    res := res || pg_temp.t(v_txt = 'validada', 'I02 excluída a linha de teste, o lote fica validado', v_txt);
    v_txt := pg_temp.erro(format($q$select public.carregar_importacao(%L)$q$, v_imp));
    res := res || pg_temp.t(v_txt like '42501%', 'I03 quem só lança não carrega a importação', v_txt);
    perform pg_temp.como(u_socia);
    j := public.carregar_importacao(v_imp);
    select count(*) into v_qtd from public.contratos where codigo = 'L-001';
    select count(*) into m from public.pagamentos_despesa where origem = 'importacao';
    res := res || pg_temp.t(j::text = '{"despesas": 1, "contratos": 1, "pagamentos": 1, "recebimentos": 1}' and v_qtd = 1 and m = 1,
      'I04 carga cria contrato com o código legado, recebimento, despesa e pagamento', j);
    v_txt := pg_temp.erro($q$select public.registrar_importacao(jsonb_build_object('nome_arquivo', 'de novo.csv', 'sha256', repeat('d', 64), 'linhas', jsonb_build_array(jsonb_build_object('linha', 1, 'tipo', 'despesa', 'chave_origem', 'x', 'normalizado', '{}'::jsonb))))$q$);
    res := res || pg_temp.t(v_txt like '%já foi carregado%', 'I05 o mesmo arquivo não carrega duas vezes', v_txt);
    v_imp := public.registrar_importacao(jsonb_build_object(
      'nome_arquivo', 'outra.csv', 'sha256', repeat('e', 64),
      'linhas', jsonb_build_array(jsonb_build_object('linha', 2, 'tipo', 'despesa', 'chave_origem', 'D1', 'dados', '{}'::jsonb,
          'normalizado', jsonb_build_object('descricao', 'Luz importada', 'vencimento', '2026-05-20', 'valor', 150)))));
    j := public.carregar_importacao(v_imp);
    res := res || pg_temp.t((j ->> 'despesas')::int = 0, 'I06 a mesma chave de origem em outro arquivo não duplica', j);
    v_imp := public.registrar_importacao(jsonb_build_object(
      'nome_arquivo', 'desistida.csv', 'sha256', repeat('f', 64),
      'linhas', jsonb_build_array(jsonb_build_object('linha', 2, 'tipo', 'despesa', 'chave_origem', 'D9', 'dados', '{}'::jsonb,
          'normalizado', jsonb_build_object('descricao', 'Água', 'vencimento', '2026-05-20', 'valor', 80)))));
    update public.importacoes set cancelado_em = now(), motivo_cancelamento = 'Arquivo errado' where id = v_imp;
    select estado into v_txt from public.importacoes where id = v_imp;
    res := res || pg_temp.t(v_txt = 'cancelada', 'I07 cancelar com motivo encerra a importação', v_txt);

    -- ================= DJEN =================
    etapa := 'djen';
    perform pg_temp.como(u_admin);
    insert into public.processos (cliente_id, numero, titulo, area) values (v_cli, '00012342220258160001', 'Ação DOCX', 'civel')
      returning id into v_proc;
    j := public.importar_intimacoes(jsonb_build_object(
      'itens', jsonb_build_array(
        jsonb_build_object('djen_id', 9001, 'disponibilizada_em', '2026-10-05', 'publicada_em', '2026-10-06',
                           'numero_processo', '0001234-22.2025.8.16.0001', 'texto', 'Intime-se para manifestação no prazo de 15 dias.',
                           'tribunal', 'TJPR', 'membro_id', m_admin),
        jsonb_build_object('djen_id', 9002, 'disponibilizada_em', '2026-10-05', 'texto', 'Outra comunicação', 'ativo', false),
        jsonb_build_object('djen_id', 9001, 'disponibilizada_em', '2026-10-05', 'texto', 'repetida pela segunda OAB')),
      'consulta', jsonb_build_object('de', '2026-10-01', 'ate', '2026-10-07', 'oabs', jsonb_build_array('105790/PR'))));
    select processo_id = v_proc and cliente_id = v_cli into v_bool from public.intimacoes where djen_id = 9001;
    select situacao into v_txt from public.intimacoes where djen_id = 9002;
    res := res || pg_temp.t(j ->> 'encontradas' = '3' and j ->> 'novas' = '2' and v_bool and v_txt = 'arquivada',
      'J01 importa uma vez cada comunicação, liga ao processo e arquiva a cancelada', j);
    j := public.importar_intimacoes(jsonb_build_object(
      'itens', jsonb_build_array(jsonb_build_object('djen_id', 9001, 'disponibilizada_em', '2026-10-05', 'texto', 'x')),
      'consulta', jsonb_build_object('de', '2026-10-01', 'ate', '2026-10-07', 'oabs', jsonb_build_array('105790/PR'), 'automatica', true)));
    select count(*) into v_qtd from public.intimacoes_consultas where automatica;
    res := res || pg_temp.t(j ->> 'novas' = '0' and v_qtd = 1, 'J02 buscar de novo não duplica e registra a consulta', j);
    j := public.avisos_do_dia();
    res := res || pg_temp.t((j ->> 'intimacoes_novas_hoje')::int = 1, 'J03 Hoje conta as intimações novas do diário', j);
    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro($q$select public.importar_intimacoes('{"itens": []}'::jsonb)$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'J04 sem acesso a Prazos não importa intimações', v_txt);

    -- ================= operação =================
    etapa := 'operação';
    perform public.registrar_erro_cliente(jsonb_build_object('rota', '/clientes/123?busca=x', 'codigo', 'TypeError',
      'mensagem', 'Falhou para jose@exemplo.com com CPF 529.982.247-25'));
    perform pg_temp.como(u_audit);
    select rota || ' | ' || mensagem into v_txt from public.erros_cliente order by em desc limit 1;
    res := res || pg_temp.t(v_txt = '/clientes/123 | Falhou para [e-mail] com CPF [número]', 'O01 erro técnico sem dado pessoal', v_txt);
    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro($q$select * from public.acessos_recentes(7)$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'O02 acessos só para administrador e auditoria', v_txt);
    perform pg_temp.como(u_admin);
    insert into public.membros (nome, nome_curto, email) values ('Novo Convidado', 'Novo', 'novo@teste.local') returning id into v_id;
    j := public.solicitar_convite(v_id);
    j := public.solicitar_convite(v_id);
    select count(*) into v_qtd from public.convites_acesso where membro_id = v_id;
    res := res || pg_temp.t(v_qtd = 1 and j ->> 'email' = 'novo@teste.local', 'O03 pedir convite de novo reaproveita o registro', v_qtd);

    -- ================= T10 · fechamento anual =================
    etapa := 'fechamento anual';
    perform pg_temp.como(u_sec);
    insert into public.clientes (nome) values ('Cliente de 2025') returning id into v_cli2;
    c_ano := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli2, 'descricao', 'Contrato de 2025', 'valor_total', 1500, 'data_contrato', '2025-11-01',
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2025-12-10', 'valor', 1000),
        jsonb_build_object('numero', 2, 'vencimento', '2026-01-10', 'valor', 500))));
    -- A de dezembro foi paga em janeiro.
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-01-15', 1000, 1000, 0 from public.parcelas where contrato_id = c_ano and numero = 1;

    perform pg_temp.como(u_admin);
    v_txt := pg_temp.erro($q$select public.fechar_ano(2025)$q$);
    res := res || pg_temp.t(v_txt like '%meses de 2025 ainda abertos%', 'Y01 o ano só fecha com os doze meses fechados', v_txt);
    for m in 1..12 loop
      perform public.fechar_mes(make_date(2025, m, 1));
    end loop;
    j := public.fechar_ano(2025);
    select (x ->> 'saldo_vencido') || ':' || (x ->> 'saldo_futuro') || ':' || (x ->> 'proximo_vencimento') into v_txt
      from jsonb_array_elements(j -> 'posicao') x where (x ->> 'contrato_id')::uuid = c_ano;
    res := res || pg_temp.t(v_txt = '1000.00:500.00:2026-01-10' and j ->> 'versao' = '1',
      'Y02 posição em 31/12: dezembro paga em janeiro aparece vencida (G13)', v_txt);

    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro($q$insert into public.recebimentos (tipo_avulsa, data, valor, valor_principal, valor_encargos) values ('outros', '2025-11-20', 10, 10, 0)$q$);
    res := res || pg_temp.t(v_txt like '%fechad%', 'Y03 lançamento com data no ano fechado é recusado', v_txt);

    -- Renegocia em 2026 a parcela de janeiro: a foto de 2025 não muda.
    perform public.renegociar(jsonb_build_object('contrato_id', c_ano,
      'parcelas', jsonb_build_array((select id from public.parcelas where contrato_id = c_ano and numero = 2)),
      'motivo', 'Cliente pediu', 'novas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 500))));
    select saldo_vencido || ':' || saldo_futuro into v_txt from public.posicao_financeira_em('2025-12-31') where contrato_id = c_ano;
    select saldo_vencido || ':' || situacao into v_aux from public.posicao_financeira_em('2026-01-31') where contrato_id = c_ano;
    -- Em 31/01: dezembro já paga; a de janeiro (renegociada só em outubro) vencida.
    res := res || pg_temp.t(v_txt = '1000.00:500.00' and v_aux = '500.00:com_pendencia',
      'Y04 renegociar depois não muda a posição de 31/12; em 31/01 dezembro está quitada', v_txt || ' / ' || v_aux);

    perform pg_temp.como(u_admin);
    v_txt := pg_temp.erro($q$select public.reabrir_mes('2025-06-01', 'corrigir')$q$);
    res := res || pg_temp.t(v_txt like '%Reabra o ano antes%', 'Y05 mês de ano fechado não reabre sozinho', v_txt);
    v_txt := pg_temp.erro($q$select public.reabrir_ano(2025, '  ')$q$);
    res := res || pg_temp.t(v_txt like '%motivo%', 'Y06 reabrir o ano exige motivo', v_txt);
    perform public.reabrir_ano(2025, 'Faltou uma conta de dezembro');
    select fechado::text into v_txt from public.fechamentos where competencia = '2025-12-01';
    res := res || pg_temp.t(v_txt = 'true', 'Y07 reabrir o ano não reabre os meses', v_txt);
    j := public.fechar_ano(2025);
    select count(*) into v_qtd from public.fechamentos_anuais_versoes v join public.fechamentos_anuais f on f.id = v.fechamento_id where f.ano = 2025;
    perform set_config('role', 'none', true);
    v_txt := pg_temp.erro($q$update public.fechamentos_anuais_versoes set regra = 'outra'$q$);
    perform pg_temp.como(u_admin);
    res := res || pg_temp.t(v_qtd = 2 and j ->> 'versao' = '2' and v_txt like '%não muda%',
      'Y08 fechar de novo cria a versão 2 e a 1 continua, imutável', v_qtd || ' / ' || v_txt);

    select count(*) into v_qtd from public.v_alertas where tipo in ('ano_fechado', 'ano_reaberto');
    perform pg_temp.como(u_sec);
    select count(*) into m from public.v_alertas where tipo in ('ano_fechado', 'ano_reaberto');
    res := res || pg_temp.t(v_qtd = 3 and m = 0, 'Y09 fechar e reabrir viram eventos só para o Financeiro completo', v_qtd || ' / ' || m);

    perform pg_temp.como(u_socia);
    select id into v_id from public.v_alertas where tipo = 'ano_reaberto' limit 1;
    perform public.marcar_alerta(v_id, 'resolvido');
    select estado into v_txt from public.v_alertas where id = v_id;
    perform pg_temp.como(u_admin);
    select estado into v_aux from public.v_alertas where id = v_id;
    res := res || pg_temp.t(v_txt = 'resolvido' and v_aux = 'novo', 'Y10 resolver um alerta vale só para quem resolveu', v_txt);

    -- ================= T09 · painel =================
    etapa := 'painel';
    perform pg_temp.como(u_sec);
    j := public.resumo_financeiro(jsonb_build_object('de', '2026-06-01', 'ate', '2026-06-30'));
    select coalesce(sum(valor), 0) into v_num from public.v_pagamentos_despesa
     where estornado_em is null and data between '2026-06-01' and '2026-06-30';
    select coalesce(sum(exigivel), 0) into v_num2 from public.v_parcelas
     where situacao not in ('renegociada', 'cancelada') and vencimento between '2026-06-01' and '2026-06-30';
    res := res || pg_temp.t((j #>> '{indicadores,despesas_pagas,valor}')::numeric = v_num
                            and (j #>> '{indicadores,receita_prevista,valor}')::numeric = v_num2,
      'T01 cada indicador é a soma exata da sua lista de detalhe (G16)', (j -> 'indicadores')::text);
    res := res || pg_temp.t(j #>> '{indicadores,taxa_recebimento,valor}' is not null
                            and (j #>> '{indicadores,taxa_recebimento,denominador}')::numeric = v_num2,
      'T02 taxa de recebimento usa a mesma coorte no numerador e no denominador (G09)', j -> 'indicadores' -> 'taxa_recebimento');
    j := public.resumo_financeiro(jsonb_build_object('de', '2030-01-01', 'ate', '2030-01-31'));
    res := res || pg_temp.t(j #>> '{indicadores,taxa_recebimento,valor}' is null,
      'T03 sem parcela no período, a taxa "não se aplica" (sem divisão por zero)', j -> 'indicadores' -> 'taxa_recebimento');
    j := public.resumo_financeiro(jsonb_build_object('de', '2026-06-10', 'ate', '2026-06-20', 'responsavel_id', m_socia));
    select coalesce(sum((s ->> 'receita_prevista')::numeric), 0), coalesce(sum((s ->> 'receita_recebida')::numeric), 0)
      into v_num, v_num2 from jsonb_array_elements(j -> 'serie') s;
    res := res || pg_temp.t(v_num = (j #>> '{indicadores,receita_prevista,valor}')::numeric
                            and v_num2 = (j #>> '{indicadores,receita_recebida,valor}')::numeric,
      'T04 série e indicadores usam exatamente o período parcial e o responsável', j -> 'serie');

    perform pg_temp.como(u_admin);
    perform set_config('role', 'none', true);
    insert into privado.contratos_sequencias (ano, prefixo, ultimo) values (2034, 'C', 999) on conflict (ano, prefixo) do update set ultimo = 999;
    select codigo into v_txt from privado.alocar_codigo('2034-01-01');
    res := res || pg_temp.t(v_txt = 'C1000/2034', 'T05 numeração após 999 não trunca nem entra em laço', v_txt);
    perform pg_temp.como(u_admin);

    -- ================= mês fechado =================
    etapa := 'mês fechado';
    perform pg_temp.como(u_admin);
    perform public.fechar_mes('2026-07-01');
    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro(format($q$select public.estornar_pagamento_despesa(%L, 'tarde demais')$q$, v_pg2));
    res := res || pg_temp.t(v_txt like '%está fechado%', 'M01 pagamento de mês fechado não se estorna (G04)', v_txt);
    v_txt := pg_temp.erro(format($q$select public.registrar_pagamento_despesa(jsonb_build_object('conta_id', %L, 'valor', 10, 'data', '2026-07-20'))$q$, v_conta));
    res := res || pg_temp.t(v_txt like '%está fechado%', 'M02 pagamento com data em mês fechado é recusado', v_txt);

    raise exception 'FIM_DOS_TESTES';
  exception when others then
    if sqlerrm <> 'FIM_DOS_TESTES' then
      res := res || jsonb_build_object('ok', false, 't', 'ERRO INESPERADO em: ' || etapa, 'd', sqlerrm || ' [' || sqlstate || ']');
    end if;
  end;

  return query
    select e.i, (e.x ->> 'ok')::boolean, e.x ->> 't', e.x ->> 'd'
      from jsonb_array_elements(res) with ordinality as e(x, i);
end
$fn$;

select * from pg_temp.testar_docx();
