-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Testes de permissão e de regra de negócio, direto no banco
-- =============================================================================
--
-- Cola no SQL Editor do Supabase e roda. Tudo acontece dentro de um bloco que
-- é desfeito no fim: nenhum usuário, membro, contrato ou compromisso de teste
-- fica gravado. O resultado é uma linha por teste, com ok = true/false.
--
-- Simula seis identidades pelo JWT (request.jwt.claims): anônimo, login sem
-- membro, e-mail não confirmado, administrador, sócia (Financeiro completo),
-- secretária (lançamentos) e advogado associado (sem Financeiro). É o mesmo
-- caminho que a Data API usa — as políticas avaliadas são as de verdade.
--
-- Rodado em 15/09/2026, migrações 01–04, testes 01–71: 71 de 71.
-- Rodado em 16/09/2026, migração 05 (conteúdo do site), testes 72–87: 16 de 16.
-- Out/2026: Marlon desativado — a divisão passa a ter 3 sócios (teste 38); testes
-- 33, 40, 43 e 79 deixaram de supor banco vazio (o piloto tem dados reais): 87 de 87.

create or replace function pg_temp.testar_permissoes()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res        jsonb := '[]';
  etapa      text := 'início';
  u_admin    uuid := gen_random_uuid();
  u_socia    uuid := gen_random_uuid();
  u_sec      uuid := gen_random_uuid();
  u_assoc    uuid := gen_random_uuid();
  u_intruso  uuid := gen_random_uuid();
  u_naoconf  uuid := gen_random_uuid();
  m_admin    uuid;
  m_socia    uuid;
  m_sec      uuid;
  m_assoc    uuid;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes      date;
  v_data     date;
  v_cliente  uuid;
  v_contrato uuid;
  v_p1       uuid;
  v_p2       uuid;
  v_rec      uuid;
  v_cat      uuid;
  v_forma    uuid;
  v_conta    uuid;
  v_comp     uuid;
  v_bloq     uuid;
  v_pub      uuid;
  v_camp     uuid;
  v_qtd      integer;
  v_pend0    integer;
  v_pubtot   integer;
  v_num      numeric;
  v_txt      text;
  v_bool     boolean;
  v_ts       timestamptz;
  j          jsonb;
begin
  v_mes := v_hoje - (extract(day from v_hoje)::integer - 1);

  begin
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin,   'admin@teste.local',   now(), 'authenticated', 'authenticated'),
      (u_socia,   'socia@teste.local',   now(), 'authenticated', 'authenticated'),
      (u_sec,     'sec@teste.local',     now(), 'authenticated', 'authenticated'),
      (u_assoc,   'assoc@teste.local',   now(), 'authenticated', 'authenticated'),
      (u_intruso, 'intruso@teste.local', now(), 'authenticated', 'authenticated'),
      (u_naoconf, 'naoconf@teste.local', null,  'authenticated', 'authenticated');

    update public.membros set email = 'admin@teste.local' where nome_curto = 'Vinícius' returning id into m_admin;
    -- O banco do piloto tem outros administradores (suporte): para o teste 43
    -- valer, o Vinícius precisa ser o único. Desfeito no fim, como o resto.
    update public.membros set papel = 'socio' where papel = 'admin' and id <> m_admin;
    update public.membros set email = 'socia@teste.local' where nome_curto = 'Juliana' returning id into m_socia;
    update public.membros set email = 'naoconf@teste.local' where nome_curto = 'Guilherme';
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Secretária Teste', 'Secretária', 'sec@teste.local', 'secretaria', 'todas', 'lancamentos')
      returning id into m_sec;
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Associado Teste', 'Associado', 'assoc@teste.local', 'associado', 'propria', 'nenhum')
      returning id into m_assoc;
    select id into v_cat from public.categorias where nome = 'Aluguel';
    select id into v_forma from public.formas_pagamento where nome = 'Pix';

    -- ================= anônimo =================
    etapa := 'anônimo';
    perform set_config('role', 'anon', true);
    begin
      perform count(*) from public.membros;
      res := res || jsonb_build_object('ok', false, 't', '01 anônimo não lê membros', 'd', 'leu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '01 anônimo não lê membros', 'd', sqlerrm);
    end;
    begin
      perform public.iniciar_sessao();
      res := res || jsonb_build_object('ok', false, 't', '02 anônimo não chama funções', 'd', 'chamou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '02 anônimo não chama funções', 'd', sqlerrm);
    end;

    -- ================= login sem membro =================
    etapa := 'intruso';
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_intruso, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    j := public.iniciar_sessao();
    res := res || jsonb_build_object('ok', j is null, 't', '03 login sem membro não vincula', 'd', j);
    select count(*) into v_qtd from public.membros;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '04 login sem membro não vê membros', 'd', v_qtd);
    select count(*) into v_qtd from public.config_financeiro;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '05 login sem membro não vê o financeiro', 'd', v_qtd);

    etapa := 'não confirmado';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_naoconf, 'role', 'authenticated')::text, true);
    j := public.iniciar_sessao();
    res := res || jsonb_build_object('ok', j is null, 't', '06 e-mail não confirmado não vincula', 'd', j);

    -- ================= vínculos =================
    etapa := 'vínculos';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    j := public.iniciar_sessao();
    res := res || jsonb_build_object('ok', j ->> 'papel' = 'admin' and j ->> 'acesso_financeiro' = 'completo', 't', '07 admin vincula pelo e-mail', 'd', j);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_socia, 'role', 'authenticated')::text, true);
    j := public.iniciar_sessao();
    res := res || jsonb_build_object('ok', (j ->> 'id')::uuid = m_socia, 't', '08 sócia vincula', 'd', j);
    -- O piloto já tem contas reais no mês: o teste 40 mede só a que ele cria.
    v_pend0 := (public.previa_fechamento(v_mes) -> 'pendencias' ->> 'contas_sem_baixa')::integer;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    j := public.iniciar_sessao();
    res := res || jsonb_build_object('ok', j ->> 'acesso_financeiro' = 'lancamentos', 't', '09 secretária vincula com nível lançamentos', 'd', j);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_assoc, 'role', 'authenticated')::text, true);
    j := public.iniciar_sessao();

    -- ================= associado =================
    etapa := 'associado';
    select count(*) into v_qtd from public.categorias;
    res := res || jsonb_build_object('ok', v_qtd = 0 and j ->> 'acesso_financeiro' = 'nenhum', 't', '10 associado não vê o financeiro', 'd', v_qtd);
    begin
      perform public.criar_contrato('{}'::jsonb);
      res := res || jsonb_build_object('ok', false, 't', '11 associado não cria contrato', 'd', 'criou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '11 associado não cria contrato', 'd', sqlerrm);
    end;

    -- ================= secretária lança =================
    etapa := 'secretária lança';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    insert into public.clientes (nome, documento, telefone)
      values ('Cliente Teste', '12345678909', '41999998888') returning id into v_cliente;
    res := res || jsonb_build_object('ok', v_cliente is not null, 't', '12 secretária cadastra cliente', 'd', v_cliente);

    begin
      perform public.criar_contrato(jsonb_build_object(
        'cliente_id', v_cliente, 'descricao', 'Soma errada', 'valor_total', 1000,
        'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', v_hoje, 'valor', 900))));
      res := res || jsonb_build_object('ok', false, 't', '13 soma das parcelas é conferida', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não fecha%', 't', '13 soma das parcelas é conferida', 'd', sqlerrm);
    end;

    v_contrato := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cliente, 'descricao', 'Honorários — teste', 'valor_total', 1000,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 0, 'vencimento', v_hoje, 'valor', 300),
        jsonb_build_object('numero', 1, 'vencimento', v_hoje - 40, 'valor', 350),
        jsonb_build_object('numero', 2, 'vencimento', v_hoje + 30, 'valor', 350)),
      'entrada_recebida', jsonb_build_object('data', v_hoje, 'forma_id', v_forma)));
    select id into v_p1 from public.parcelas where contrato_id = v_contrato and numero = 1;
    select id into v_p2 from public.parcelas where contrato_id = v_contrato and numero = 2;
    select string_agg(numero || ':' || situacao, ',' order by numero) into v_txt
      from public.v_parcelas where contrato_id = v_contrato;
    res := res || jsonb_build_object('ok', v_txt = '0:paga,1:vencida,2:a_vencer', 't', '14 contrato nasce com a entrada recebida', 'd', v_txt);
    select criado_por = m_sec into v_bool from public.contratos where id = v_contrato;
    res := res || jsonb_build_object('ok', v_bool, 't', '15 carimbo criado_por vem do login', 'd', v_bool);
    select dias_atraso into v_qtd from public.v_parcelas where id = v_p1;
    res := res || jsonb_build_object('ok', v_qtd = 40, 't', '16 dias de atraso', 'd', v_qtd);

    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id)
        values (v_p1, v_hoje, 400, 400, 0, v_forma);
      res := res || jsonb_build_object('ok', false, 't', '17 principal não passa do saldo', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%passa do saldo%', 't', '17 principal não passa do saldo', 'd', sqlerrm);
    end;

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id)
      values (v_p1, v_hoje, 100, 100, 0, v_forma) returning id into v_rec;
    select situacao || ':' || parcial || ':' || saldo into v_txt from public.v_parcelas where id = v_p1;
    res := res || jsonb_build_object('ok', v_txt = 'vencida:true:250.00', 't', '18 pagamento parcial', 'd', v_txt);

    begin
      update public.recebimentos set estornado_em = now() where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', '19 estorno exige motivo', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%motivo do estorno%', 't', '19 estorno exige motivo', 'd', sqlerrm);
    end;
    update public.recebimentos set estornado_em = now(), motivo_estorno = 'Lançado em duplicidade' where id = v_rec;
    select saldo into v_num from public.v_parcelas where id = v_p1;
    res := res || jsonb_build_object('ok', v_num = 350, 't', '20 estorno devolve o saldo', 'd', v_num);
    begin
      update public.recebimentos set observacao = 'x' where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', '21 estornado não muda mais', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%estornado não pode%', 't', '21 estornado não muda mais', 'd', sqlerrm);
    end;
    select acao || ':' || (membro_id = m_sec) into v_txt
      from public.auditoria where tabela = 'recebimentos' and registro_id = v_rec and acao = 'estornou';
    res := res || jsonb_build_object('ok', v_txt = 'estornou:true', 't', '22 histórico registra quem estornou', 'd', v_txt);

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id, memoria_calculo)
      values (v_p1, v_hoje, 399.67, 350, 49.67, v_forma, '{"teste": true}') returning id into v_rec;
    select situacao into v_txt from public.v_parcelas where id = v_p1;
    res := res || jsonb_build_object('ok', v_txt = 'paga', 't', '23 quitação com encargos', 'd', v_txt);

    begin
      delete from public.recebimentos where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', '24 ninguém apaga pela API', 'd', 'apagou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '24 ninguém apaga pela API', 'd', sqlerrm);
    end;
    begin
      update public.clientes set criado_por = null where id = v_cliente;
      res := res || jsonb_build_object('ok', false, 't', '25 carimbo não é editável', 'd', 'alterou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '25 carimbo não é editável', 'd', sqlerrm);
    end;
    begin
      insert into public.auditoria (tabela, registro_id, acao) values ('x', gen_random_uuid(), 'forjou');
      res := res || jsonb_build_object('ok', false, 't', '26 histórico não aceita escrita direta', 'd', 'escreveu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '26 histórico não aceita escrita direta', 'd', sqlerrm);
    end;

    select count(*) into v_qtd from public.divisao_cotas;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '27 secretária não vê a divisão', 'd', v_qtd);
    begin
      perform public.previa_fechamento(v_mes);
      res := res || jsonb_build_object('ok', false, 't', '28 secretária não vê a prévia do fechamento', 'd', 'viu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '28 secretária não vê a prévia do fechamento', 'd', sqlerrm);
    end;

    -- contas
    etapa := 'contas';
    insert into public.contas (descricao, categoria_id, valor, vencimento, forma_id)
      values ('Aluguel teste', v_cat, 200, v_hoje, v_forma) returning id into v_conta;
    -- Desde 08/10/2026 o pagamento é um registro à parte (pagamentos_despesa).
    perform public.registrar_pagamento_despesa(jsonb_build_object(
      'conta_id', v_conta, 'valor', 200, 'data', v_hoje, 'forma_id', v_forma));
    select competencia into v_data from public.contas where id = v_conta;
    res := res || jsonb_build_object('ok', v_data = v_mes, 't', '29 competência vem do vencimento', 'd', v_data);

    insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio)
      values ('Internet teste', v_cat, 31, 150, v_mes);
    v_qtd := public.gerar_contas_do_mes(v_mes);
    res := res || jsonb_build_object('ok', v_qtd = 1, 't', '30 recorrente gera a conta do mês', 'd', v_qtd);
    v_qtd := public.gerar_contas_do_mes(v_mes);
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '31 gerar de novo não duplica', 'd', v_qtd);
    v_qtd := public.gerar_contas_do_mes((v_mes + interval '6 months')::date);
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '32 não gera conta de mês distante', 'd', v_qtd);
    select c.vencimento into v_data from public.contas c join public.contas_recorrentes r on r.id = c.recorrente_id
     where r.descricao = 'Internet teste' and c.competencia = v_mes;
    res := res || jsonb_build_object('ok', v_data = (v_mes + interval '1 month')::date - 1, 't', '33 dia 31 cai no último dia do mês', 'd', v_data);

    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Café pago pela sócia', v_cat, 50, v_hoje) returning id into v_conta;
    perform public.registrar_pagamento_despesa(jsonb_build_object(
      'conta_id', v_conta, 'valor', 50, 'data', v_hoje, 'pago_por_id', m_socia));

    -- renegociação
    etapa := 'renegociação';
    perform public.renegociar(jsonb_build_object(
      'contrato_id', v_contrato, 'parcelas', jsonb_build_array(v_p2), 'motivo', 'Cliente pediu mais prazo',
      'novas', jsonb_build_array(
        jsonb_build_object('vencimento', v_hoje + 30, 'valor', 200),
        jsonb_build_object('vencimento', v_hoje + 60, 'valor', 150))));
    select string_agg(numero || ':' || situacao, ',' order by numero) into v_txt
      from public.v_parcelas where contrato_id = v_contrato;
    res := res || jsonb_build_object('ok', v_txt = '0:paga,1:paga,2:renegociada,3:a_vencer,4:a_vencer', 't', '34 renegociação encerra e cria parcelas', 'd', v_txt);
    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (v_p2, v_hoje, 10, 10, 0);
      res := res || jsonb_build_object('ok', false, 't', '35 parcela renegociada não recebe', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%renegociada ou cancelada%', 't', '35 parcela renegociada não recebe', 'd', sqlerrm);
    end;
    select saldo || ':' || situacao into v_txt from public.v_contratos where id = v_contrato;
    res := res || jsonb_build_object('ok', v_txt = '350.00:ativo', 't', '36 saldo do contrato', 'd', v_txt);

    -- ================= sócia (completo) =================
    etapa := 'sócia';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_socia, 'role', 'authenticated')::text, true);
    j := public.previa_fechamento(v_mes);
    res := res || jsonb_build_object('ok', (j -> 'totais' ->> 'entradas')::numeric = 699.67 and (j -> 'totais' ->> 'saidas')::numeric = 250,
      't', '37 prévia: entradas e saídas do mês', 'd', j -> 'totais');
    select sum((x ->> 'valor')::numeric) into v_num from jsonb_array_elements(j -> 'divisao' -> 'socios') as x;
    -- Três sócios ativos desde que o Marlon saiu (out/2026).
    res := res || jsonb_build_object('ok', v_num = 449.67 and jsonb_array_length(j -> 'divisao' -> 'socios') = 3,
      't', '38 divisão fecha centavo a centavo', 'd', j -> 'divisao');
    select (x ->> 'reembolso_pendente')::numeric into v_num
      from jsonb_array_elements(j -> 'divisao' -> 'socios') as x where x ->> 'nome' = 'Juliana';
    res := res || jsonb_build_object('ok', v_num = 50, 't', '39 reembolso pendente aparece na divisão', 'd', v_num);
    res := res || jsonb_build_object('ok', (j -> 'pendencias' ->> 'contas_sem_baixa')::integer = v_pend0 + 1, 't', '40 pendência: conta sem baixa', 'd', j -> 'pendencias');

    begin
      perform public.fechar_mes(v_mes);
      res := res || jsonb_build_object('ok', false, 't', '41 sócia não fecha o mês', 'd', 'fechou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '41 sócia não fecha o mês', 'd', sqlerrm);
    end;

    update public.membros set cor = '#000000' where id = m_assoc;
    get diagnostics v_qtd = row_count;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '42 sócia não altera membros', 'd', v_qtd);

    -- ================= admin fecha =================
    etapa := 'admin fecha';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    begin
      update public.membros set papel = 'socio' where id = m_admin;
      res := res || jsonb_build_object('ok', false, 't', '43 último admin não se rebaixa', 'd', 'rebaixou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%pelo menos um administrador%', 't', '43 último admin não se rebaixa', 'd', sqlerrm);
    end;

    j := public.fechar_mes(v_mes);
    select fechado into v_bool from public.fechamentos where competencia = v_mes;
    res := res || jsonb_build_object('ok', v_bool, 't', '44 admin fecha o mês', 'd', v_bool);
    begin
      perform public.fechar_mes(v_mes);
      res := res || jsonb_build_object('ok', false, 't', '45 mês não fecha duas vezes', 'd', 'fechou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%já está fechado%', 't', '45 mês não fecha duas vezes', 'd', sqlerrm);
    end;

    etapa := 'mês fechado';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    begin
      insert into public.recebimentos (tipo_avulsa, cliente_id, data, valor, valor_principal)
        values ('consulta', v_cliente, v_hoje, 100, 100);
      res := res || jsonb_build_object('ok', false, 't', '46 mês fechado barra lançamento', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%está fechado%', 't', '46 mês fechado barra lançamento', 'd', sqlerrm);
    end;
    begin
      update public.recebimentos set observacao = 'Pago no balcão' where id = v_rec;
      res := res || jsonb_build_object('ok', true, 't', '47 observação muda com o mês fechado', 'd', 'ok');
    exception when others then
      res := res || jsonb_build_object('ok', false, 't', '47 observação muda com o mês fechado', 'd', sqlerrm);
    end;
    begin
      update public.recebimentos set estornado_em = now(), motivo_estorno = 'teste' where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', '48 mês fechado barra estorno', 'd', 'estornou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%está fechado%', 't', '48 mês fechado barra estorno', 'd', sqlerrm);
    end;
    begin
      update public.contas set valor = 999 where id = v_conta;
      res := res || jsonb_build_object('ok', false, 't', '49 mês fechado barra conta paga', 'd', 'alterou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%está fechado%', 't', '49 mês fechado barra conta paga', 'd', sqlerrm);
    end;
    select count(*) into v_qtd from public.fechamentos;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '50 secretária não vê fechamentos', 'd', v_qtd);
    select count(*) into v_qtd from public.auditoria where tabela = 'fechamentos';
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '51 secretária não vê o histórico do fechamento', 'd', v_qtd);

    etapa := 'reabertura';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    begin
      perform public.reabrir_mes(v_mes, '  ');
      res := res || jsonb_build_object('ok', false, 't', '52 reabrir exige motivo', 'd', 'reabriu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%motivo da reabertura%', 't', '52 reabrir exige motivo', 'd', sqlerrm);
    end;
    perform public.reabrir_mes(v_mes, 'Faltou lançar uma conta');
    select acao into v_txt from public.auditoria where tabela = 'fechamentos' order by id desc limit 1;
    res := res || jsonb_build_object('ok', v_txt = 'reabriu', 't', '53 reabertura fica no histórico', 'd', v_txt);

    etapa := 'cancelamento';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    begin
      update public.contratos set cancelado_em = now() where id = v_contrato;
      res := res || jsonb_build_object('ok', false, 't', '54 cancelar exige motivo', 'd', 'cancelou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%motivo do cancelamento%', 't', '54 cancelar exige motivo', 'd', sqlerrm);
    end;
    update public.contratos set cancelado_em = now(), motivo_cancelamento = 'Cliente desistiu' where id = v_contrato;
    select situacao into v_txt from public.v_contratos where id = v_contrato;
    res := res || jsonb_build_object('ok', v_txt = 'cancelado', 't', '55 contrato cancelado', 'd', v_txt);
    begin
      update public.contratos set descricao = 'outra' where id = v_contrato;
      res := res || jsonb_build_object('ok', false, 't', '56 cancelado não muda mais', 'd', 'alterou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%cancelado não pode%', 't', '56 cancelado não muda mais', 'd', sqlerrm);
    end;

    -- ================= agenda =================
    etapa := 'agenda';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_assoc, 'role', 'authenticated')::text, true);
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim)
      values (m_assoc, 'atendimento', 'presencial', 'Atendimento teste',
              (v_hoje + time '14:00') at time zone 'America/Sao_Paulo',
              (v_hoje + time '15:00') at time zone 'America/Sao_Paulo')
      returning id into v_comp;
    res := res || jsonb_build_object('ok', v_comp is not null, 't', '57 associado marca na própria agenda', 'd', v_comp);
    begin
      insert into public.compromissos (membro_id, tipo, titulo, inicio, fim)
        values (m_socia, 'interno', 'x', now(), now() + interval '1 hour');
      res := res || jsonb_build_object('ok', false, 't', '58 associado não marca na agenda dos outros', 'd', 'marcou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '58 associado não marca na agenda dos outros', 'd', sqlerrm);
    end;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim)
      values (m_socia, 'audiencia', 'online', 'Audiência teste',
              (v_hoje + time '16:00') at time zone 'America/Sao_Paulo',
              (v_hoje + time '17:00') at time zone 'America/Sao_Paulo')
      returning id into v_comp;
    res := res || jsonb_build_object('ok', v_comp is not null, 't', '59 secretária marca para a sócia', 'd', v_comp);
    begin
      insert into public.compromissos (membro_id, tipo, titulo, inicio, fim, particular)
        values (m_socia, 'interno', 'x', now(), now() + interval '1 hour', true);
      res := res || jsonb_build_object('ok', false, 't', '60 particular só o dono marca', 'd', 'marcou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '60 particular só o dono marca', 'd', sqlerrm);
    end;
    begin
      insert into public.compromissos (membro_id, tipo, modalidade, inicio, fim)
        values (m_socia, 'audiencia', 'ferias', now(), now() + interval '1 hour');
      res := res || jsonb_build_object('ok', false, 't', '61 modalidade combina com o tipo', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não combina%', 't', '61 modalidade combina com o tipo', 'd', sqlerrm);
    end;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_socia, 'role', 'authenticated')::text, true);
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, dia_inteiro, particular, observacoes)
      values (m_socia, 'bloqueio', 'ausencia', 'Consulta médica',
              (v_hoje + 1 + time '15:30') at time zone 'America/Sao_Paulo',
              (v_hoje + 3 + time '10:00') at time zone 'America/Sao_Paulo', true, true, 'Particular')
      returning id into v_bloq;
    select (inicio at time zone 'America/Sao_Paulo')::text || '|' || (fim at time zone 'America/Sao_Paulo')::text into v_txt
      from public.compromissos where id = v_bloq;
    res := res || jsonb_build_object('ok', v_txt = (v_hoje + 1)::timestamp::text || '|' || (v_hoje + 4)::timestamp::text,
      't', '62 dia inteiro vai de meia-noite a meia-noite', 'd', v_txt);

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_assoc, 'role', 'authenticated')::text, true);
    select count(*) into v_qtd from public.compromissos where id = v_bloq;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '63 particular dos outros não sai pela tabela', 'd', v_qtd);
    select titulo || ':' || mascarado || ':' || coalesce(observacoes, '-') into v_txt
      from public.agenda_periodo(now() - interval '1 day', now() + interval '10 days') where id = v_bloq;
    res := res || jsonb_build_object('ok', v_txt = 'Ocupado:true:-', 't', '64 particular dos outros aparece como Ocupado', 'd', v_txt);
    select count(*) into v_qtd from public.agenda_periodo(now() - interval '1 day', now() + interval '10 days');
    res := res || jsonb_build_object('ok', v_qtd = 3, 't', '65 associado vê a agenda de todos', 'd', v_qtd);
    select count(*) into v_qtd from public.auditoria where tabela = 'contratos';
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '66 associado não vê histórico financeiro', 'd', v_qtd);

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_socia, 'role', 'authenticated')::text, true);
    select titulo || ':' || mascarado into v_txt
      from public.agenda_periodo(now() - interval '1 day', now() + interval '10 days') where id = v_bloq;
    res := res || jsonb_build_object('ok', v_txt = 'Consulta médica:false', 't', '67 dono vê o próprio particular', 'd', v_txt);

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    update public.compromissos set chegada_em = '2000-01-01' where id = v_comp returning chegada_em into v_ts;
    res := res || jsonb_build_object('ok', v_ts >= now() - interval '1 minute', 't', '68 chegada usa a hora do servidor', 'd', v_ts);
    update public.compromissos set chegada_em = '2030-01-01' where id = v_comp returning chegada_em into v_ts;
    res := res || jsonb_build_object('ok', v_ts < '2030-01-01'::timestamptz, 't', '69 chegada não se reescreve', 'd', v_ts);

    -- ================= site: publicações e campanhas =================
    etapa := 'site';
    perform set_config('role', 'none', true);
    insert into public.publicacoes (slug, titulo, resumo, area, autor, corpo, publicado)
      values ('teste-rascunho', 'Rascunho de teste', 'Resumo.', 'Cível', 'Teste',
              '[["p","Texto."]]'::jsonb, false)
      returning id into v_pub;
    -- O piloto pode ter rascunhos reais: o teste 79 compara com o total.
    select count(*) into v_pubtot from public.publicacoes;

    perform set_config('request.jwt.claims', null, true);
    perform set_config('role', 'anon', true);
    select count(*) into v_qtd from public.publicacoes;
    res := res || jsonb_build_object('ok', v_qtd = 3, 't', '72 anônimo lê só o que está publicado', 'd', v_qtd);

    select count(*) into v_qtd from public.campanhas;
    res := res || jsonb_build_object('ok', v_qtd = 1, 't', '73 anônimo lê a campanha publicada', 'd', v_qtd);

    begin
      perform publicado from public.publicacoes limit 1;
      res := res || jsonb_build_object('ok', false, 't', '74 anônimo não lê colunas de controle', 'd', 'leu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '74 anônimo não lê colunas de controle', 'd', sqlerrm);
    end;

    begin
      insert into public.publicacoes (slug, titulo, resumo, area, autor)
        values ('invasao', 'T', 'R', 'A', 'X');
      res := res || jsonb_build_object('ok', false, 't', '75 anônimo não escreve no site', 'd', 'gravou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', '75 anônimo não escreve no site', 'd', sqlerrm);
    end;

    -- Sócia: Financeiro completo, mas acesso_site 'nenhum' — que é o padrão.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_socia, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_qtd from public.publicacoes;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '76 sem acesso ao Site não lê publicações', 'd', v_qtd);

    update public.publicacoes set titulo = 'Invadido' where id = v_pub;
    get diagnostics v_qtd = row_count;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', '77 sem acesso ao Site não altera publicação', 'd', v_qtd);

    begin
      perform public.registrar_publicacao('enviado', 'teste');
      res := res || jsonb_build_object('ok', false, 't', '78 sem acesso ao Site não publica', 'd', 'publicou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não permite publicar%', 't', '78 sem acesso ao Site não publica', 'd', sqlerrm);
    end;

    -- Administrador: 'editar' pelo papel, qualquer que seja o acesso_site gravado.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    select count(*) into v_qtd from public.publicacoes;
    res := res || jsonb_build_object('ok', v_qtd = v_pubtot, 't', '79 quem edita o site vê rascunho também', 'd', v_qtd);

    update public.publicacoes set titulo = 'Rascunho revisado' where id = v_pub;
    select alterado_por = m_admin into v_bool from public.publicacoes where id = v_pub;
    res := res || jsonb_build_object('ok', v_bool, 't', '80 alteração carimba quem alterou', 'd', v_bool);

    begin
      update public.publicacoes set corpo = '[["marquise","oi"]]'::jsonb where id = v_pub;
      res := res || jsonb_build_object('ok', false, 't', '81 bloco inexistente é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não existe no site%', 't', '81 bloco inexistente é recusado', 'd', sqlerrm);
    end;

    begin
      update public.publicacoes
         set corpo = '[["instagram",{"url":"https://x/","legenda":"a"}]]'::jsonb where id = v_pub;
      res := res || jsonb_build_object('ok', false, 't', '82 cartão sem imagem é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%link, imagem e legenda%', 't', '82 cartão sem imagem é recusado', 'd', sqlerrm);
    end;

    begin
      update public.publicacoes set slug = 'Com Espaço' where id = v_pub;
      res := res || jsonb_build_object('ok', false, 't', '83 endereço de página inválido é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '23514', 't', '83 endereço de página inválido é recusado', 'd', sqlerrm);
    end;

    insert into public.campanhas (slug, rotulo, titulo, subtitulo, descricao)
      values ('teste-campanha', 'Teste', 'Título', 'Subtítulo', 'Descrição')
      returning id into v_camp;

    begin
      update public.campanhas set inicio = v_hoje, fim = v_hoje - 1 where id = v_camp;
      res := res || jsonb_build_object('ok', false, 't', '84 campanha que acaba antes de começar é recusada', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '23514', 't', '84 campanha que acaba antes de começar é recusada', 'd', sqlerrm);
    end;

    begin
      update public.campanhas set direitos = '[["Só o título"]]'::jsonb where id = v_camp;
      res := res || jsonb_build_object('ok', false, 't', '85 par sem texto é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%título e texto%', 't', '85 par sem texto é recusado', 'd', sqlerrm);
    end;

    perform public.registrar_publicacao('enviado', 'teste');
    j := public.site_situacao();
    res := res || jsonb_build_object(
      'ok', (j ->> 'publicado_em') is not null and (j ->> 'publicacoes')::int = 0,
      't', '86 publicar zera o que estava pendente', 'd', j);

    -- Sem papel nenhum: é o gatilho que recusa, não a falta de GRANT.
    perform set_config('role', 'none', true);
    begin
      delete from public.publicacoes where id = v_pub;
      res := res || jsonb_build_object('ok', false, 't', '87 publicação não se apaga', 'd', 'apagou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não são apagados%', 't', '87 publicação não se apaga', 'd', sqlerrm);
    end;

    etapa := 'desativação';
    perform set_config('role', 'none', true);
    update public.membros set ativo = false where id = m_assoc;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_assoc, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    j := public.iniciar_sessao();
    select count(*) into v_qtd from public.compromissos;
    res := res || jsonb_build_object('ok', j is null and v_qtd = 0, 't', '70 membro desativado perde o acesso', 'd', v_qtd);

    etapa := 'exclusão';
    perform set_config('role', 'none', true);
    begin
      delete from public.clientes where id = v_cliente;
      res := res || jsonb_build_object('ok', false, 't', '71 gatilho barra exclusão até sem RLS', 'd', 'apagou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não são apagados%', 't', '71 gatilho barra exclusão até sem RLS', 'd', sqlerrm);
    end;

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

select * from pg_temp.testar_permissoes();
