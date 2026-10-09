-- Dados FICTÍCIOS da prévia com banco (`npm run testar:banco`).
-- ===========================================================
--
-- Roda depois de todas as migrações, num PostgreSQL em memória. Nenhum nome,
-- documento ou telefone é real. As datas são relativas a hoje, para a prévia
-- continuar mostrando vencidas, vencendo hoje e a vencer em qualquer dia.
-- Os quatro membros que a migração inicial cria ganham nomes fictícios.

do $$
declare
  hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  mes    date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  u      record;
  m_admin uuid; m_socia uuid; m_socio uuid; m_sec uuid;
  c_jose uuid := '00000000-0000-4000-8000-000000000202';
  c_emp  uuid := '00000000-0000-4000-8000-000000000203';
  c_maria uuid := '00000000-0000-4000-8000-000000000204';
  c_ana  uuid := '00000000-0000-4000-8000-000000000205';
  v_proc uuid := '00000000-0000-4000-8000-000000000501';
  k_a uuid; k_b uuid; k_c uuid; k_d uuid;
  v_alug uuid; v_ener uuid; v_mat uuid; v_cafe uuid; v_oab uuid; v_net uuid;
  v_pix uuid; v_banco uuid; v_conta uuid; v_rec uuid;
  v_pg jsonb;
begin
  -- ----------------------------------------------------------- membros
  update public.membros set nome = 'Admin Fictício', nome_curto = 'Admin', oab = 'OAB/PR 000.001', email = 'admin@example.test'
   where nome_curto = 'Vinícius' returning id into m_admin;
  update public.membros set nome = 'Sócia Fictícia', nome_curto = 'Sócia', oab = 'OAB/PR 000.002', email = 'socia@example.test'
   where nome_curto = 'Juliana' returning id into m_socia;
  update public.membros set nome = 'Sócio Fictício', nome_curto = 'Sócio', oab = 'OAB/PR 000.003', email = 'socio@example.test'
   where nome_curto = 'Guilherme' returning id into m_socio;
  update public.membros set nome = 'Ex-sócio Fictício', nome_curto = 'Ex-sócio', oab = 'OAB/PR 000.004', ativo = false
   where nome_curto = 'Marlon';
  insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro, acesso_clientes, acesso_prazos, cor)
  values ('Secretária Fictícia', 'Secretária', 'secretaria@example.test', 'secretaria', 'todas', 'lancamentos', 'editar', 'nenhum', '#7A5C2E')
  returning id into m_sec;
  insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro, acesso_clientes, acesso_prazos, acesso_auditoria, cor) values
    ('Consulta Fictícia', 'Consulta', 'consulta@example.test', 'associado', 'nenhum', 'consulta', 'nenhum', 'nenhum', 'nenhum', '#56657A'),
    ('Auditoria Fictícia', 'Auditoria', 'auditoria@example.test', 'associado', 'nenhum', 'consulta', 'nenhum', 'nenhum', 'ver', '#5E4B6B'),
    ('Associado Fictício', 'Associado', 'sem-clientes@example.test', 'associado', 'propria', 'nenhum', 'nenhum', 'nenhum', 'nenhum', '#465953'),
    ('Equipe de Clientes Fictícia', 'Equipe', 'clientes-sem-financeiro@example.test', 'associado', 'nenhum', 'nenhum', 'editar', 'nenhum', 'nenhum', '#3F6A5A');

  -- Um login por perfil da prévia, já ligado ao membro.
  for u in
    select m.id, m.email, row_number() over (order by m.email) as n
      from public.membros m where m.email like '%@example.test'
  loop
    insert into auth.users (id, email, email_confirmed_at, aud, role)
    values (('00000000-0000-4000-8000-0000000001' || lpad(u.n::text, 2, '0'))::uuid, u.email, now(), 'authenticated', 'authenticated');
    update public.membros set user_id = ('00000000-0000-4000-8000-0000000001' || lpad(u.n::text, 2, '0'))::uuid where id = u.id;
  end loop;

  -- Dali em diante, tudo é lançado "pelo" administrador fictício.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select user_id from public.membros where id = m_admin), 'role', 'authenticated')::text, false);

  -- ----------------------------------------------------------- clientes
  insert into public.clientes (id, nome, documento, telefone, email) values
    ('00000000-0000-4000-8000-000000000201', 'Cliente Fictício Existente', null, '41900000001', 'cliente@example.test'),
    (c_jose, 'José Fictício da Silva', '12345678909', '41900000002', 'jose@example.test'),
    (c_emp, 'Empresa Fictícia Ltda.', '11222333000181', '41900000003', 'empresa@example.test'),
    (c_maria, 'Maria Fictícia Souza', null, '41900000005', null),
    (c_ana, 'Ana Fictícia Lima', '52998224725', '41900000006', 'ana@example.test');
  insert into public.clientes_detalhes (cliente_id, tipo_pessoa, nascimento, nacionalidade, estado_civil, profissao,
                                        cep, logradouro, numero, bairro, cidade, uf, responsavel_id, etiquetas)
  values (c_jose, 'fisica', make_date(1990, extract(month from hoje + 2)::int, extract(day from hoje + 2)::int),
          'Brasileira', 'solteiro', 'Profissão fictícia', '83203000', 'Rua Fictícia', '100', 'Centro', 'Paranaguá', 'PR',
          m_socia, array['previdenciário', 'indicação']);
  insert into public.clientes_detalhes (cliente_id, tipo_pessoa, nome_fantasia, responsavel_id, etiquetas)
  values (c_emp, 'juridica', 'Loja Fictícia', m_admin, array['empresa']);
  insert into public.clientes_contatos (cliente_id, tipo, nome, telefone, email, principal, recebe_cobranca)
  select id, 'proprio', nome, telefone, email, true, true from public.clientes where telefone is not null;
  insert into public.clientes_contatos (cliente_id, tipo, nome, telefone, email, recebe_cobranca)
  values (c_emp, 'financeiro', 'Financeiro da Loja Fictícia', '41900000009', 'financeiro@example.test', true);

  insert into public.processos (id, cliente_id, numero, titulo, area, tribunal, orgao, responsavel_id, situacao) values
    (v_proc, c_jose, '00012342220258160001', 'Ação Fictícia de Demonstração', 'civel', 'TJPR', 'Vara fictícia', m_socia, 'em_andamento');

  insert into public.contatos (canal, nome, email, telefone, mensagem, pagina, consentimento_em, situacao) values
    ('site', 'João Fictício — Site', 'joao@example.test', '41900000010', 'Mensagem de demonstração.', '/contato.html', now(), 'novo'),
    ('telefone', 'Pedro Fictício — Telefone', null, '41900000011', 'Telefonou pedindo retorno.', null, null, 'contatado');

  -- ----------------------------------------------------------- financeiro
  select id into v_alug from public.categorias where nome = 'Aluguel';
  select id into v_ener from public.categorias where nome = 'Energia';
  select id into v_mat from public.categorias where nome = 'Material';
  select id into v_cafe from public.categorias where nome = 'Copa e café';
  select id into v_net from public.categorias where nome = 'Internet e telefone';
  select id into v_oab from public.categorias where nome = 'Impostos';
  select id into v_pix from public.formas_pagamento where nome = 'Pix';
  insert into public.contas_financeiras (nome, tipo, banco, agencia, numero, saldo_inicial, saldo_inicial_em)
  values ('Banco Fictício', 'corrente', 'Banco de Demonstração', '0000', '00000-0', 5000, mes - interval '3 months')
  returning id into v_banco;
  update public.contas_financeiras set saldo_inicial = 800, saldo_inicial_em = mes - interval '3 months' where padrao;
  insert into public.fornecedores (nome, contato) values ('Imobiliária Fictícia', '41900000020'), ('Papelaria Fictícia', null);
  insert into public.centros_custo (nome) values ('Administrativo'), ('Contencioso');

  -- José: entrada paga, uma parcela paga em parte e vencida, uma vencendo hoje e duas a vencer.
  k_a := public.criar_contrato(jsonb_build_object(
    'cliente_id', c_jose, 'descricao', 'Honorários — ação de demonstração', 'valor_total', 3000,
    'processo', '0001234-22.2025.8.16.0001', 'responsavel_id', m_socia, 'forma_prevista_id', v_pix,
    'data_contrato', hoje - 70,
    'parcelas', jsonb_build_array(
      jsonb_build_object('numero', 0, 'vencimento', hoje - 70, 'valor', 600),
      jsonb_build_object('numero', 1, 'vencimento', hoje - 40, 'valor', 600),
      jsonb_build_object('numero', 2, 'vencimento', hoje - 10, 'valor', 600),
      jsonb_build_object('numero', 3, 'vencimento', hoje, 'valor', 600),
      jsonb_build_object('numero', 4, 'vencimento', hoje + 30, 'valor', 600)),
    'entrada_recebida', jsonb_build_object('data', hoje - 70, 'forma_id', v_pix, 'conta_financeira_id', v_banco)));
  insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id, conta_financeira_id,
                                   valor_multa, valor_juros, valor_correcao, valor_acrescimo)
  select id, hoje - 38, 600, 600, 0, v_pix, v_banco, 0, 0, 0, 0 from public.parcelas where contrato_id = k_a and numero = 1;
  insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id,
                                   valor_multa, valor_juros, valor_correcao, valor_acrescimo)
  select id, hoje - 5, 250, 250, 0, v_pix, 0, 0, 0, 0 from public.parcelas where contrato_id = k_a and numero = 2;

  -- Empresa: duas vencidas há tempo, nunca cobradas — e um desconto concedido.
  k_b := public.criar_contrato(jsonb_build_object(
    'cliente_id', c_emp, 'descricao', 'Assessoria contratual mensal', 'valor_total', 2400,
    'responsavel_id', m_admin, 'data_contrato', hoje - 120, 'data_fim', hoje + 20,
    'parcelas', jsonb_build_array(
      jsonb_build_object('numero', 1, 'vencimento', hoje - 100, 'valor', 600),
      jsonb_build_object('numero', 2, 'vencimento', hoje - 70, 'valor', 600),
      jsonb_build_object('numero', 3, 'vencimento', hoje - 40, 'valor', 600),
      jsonb_build_object('numero', 4, 'vencimento', hoje + 15, 'valor', 600))));
  insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id, conta_financeira_id,
                                   valor_multa, valor_juros, valor_correcao, valor_acrescimo)
  select id, hoje - 95, 645, 600, 45, v_pix, v_banco, 30, 12, 3, 0 from public.parcelas where contrato_id = k_b and numero = 1;
  perform public.conceder_ajuste(jsonb_build_object(
    'parcela_id', (select id from public.parcelas where contrato_id = k_b and numero = 4),
    'tipo', 'desconto', 'valor', 60, 'motivo', 'Desconto combinado para pagamento em dia', 'data', hoje - 2));

  -- Maria: êxito a apurar. Ana: contrato antigo, formalização a confirmar.
  k_c := public.criar_contrato(jsonb_build_object(
    'cliente_id', c_maria, 'descricao', 'Êxito — ação previdenciária fictícia', 'tipo_honorario', 'exito',
    'exito_pct', 30, 'responsavel_id', m_socio, 'data_contrato', hoje - 200, 'parcelas', '[]'::jsonb));
  k_d := public.criar_contrato(jsonb_build_object(
    'cliente_id', c_ana, 'descricao', 'Contrato antigo trazido da planilha', 'valor_total', 1200,
    'parcelas', jsonb_build_array(
      jsonb_build_object('numero', 1, 'vencimento', hoje - 20, 'valor', 400),
      jsonb_build_object('numero', 2, 'vencimento', hoje + 10, 'valor', 400),
      jsonb_build_object('numero', 3, 'vencimento', hoje + 40, 'valor', 400))));

  insert into public.recebimentos (tipo_avulsa, cliente_id, descricao, data, valor, valor_principal, valor_encargos, forma_id)
  values ('consulta', '00000000-0000-4000-8000-000000000201', 'Consulta fictícia', hoje - 3, 250, 250, 0, v_pix);

  insert into public.cobrancas (cliente_id, parcelas, canal, texto, total_na_data, observacao)
  values (c_jose, array[(select id from public.parcelas where contrato_id = k_a and numero = 2)], 'whatsapp',
          'Mensagem fictícia de cobrança.', 360, 'Prometeu pagar o resto na semana que vem');

  -- Despesas: aluguel fixo, energia variável, anuidade anual, material pago em parte, café pago pela sócia.
  insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio, tipo, fornecedor_id, forma_id)
  values ('Aluguel da sala', v_alug, 5, 1500, (mes - interval '3 months')::date, 'fixa',
          (select id from public.fornecedores where nome = 'Imobiliária Fictícia'), v_pix);
  insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio, tipo)
  values ('Energia elétrica', v_ener, 12, null, (mes - interval '3 months')::date, 'variavel');
  insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio, tipo)
  values ('Internet', v_net, 20, 129.90, (mes - interval '3 months')::date, 'fixa');
  insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio, frequencia, mes_referencia, tipo)
  values ('Anuidade fictícia da OAB', v_oab, 28, 980, make_date(extract(year from hoje)::int, 1, 1), 'anual', 3, 'fixa');
  insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, inicio, frequencia, quantidade, valor_total, tipo)
  values ('Cadeiras novas em 3x', v_mat, 10, (mes - interval '1 month')::date, 'parcelada', 3, 1000, 'extraordinaria');
  for u in select generate_series(mes - interval '3 months', mes, interval '1 month')::date as m loop
    perform public.gerar_contas_do_mes(u.m);
  end loop;
  update public.contas set valor = 210.55 where descricao = 'Energia elétrica' and competencia < mes;

  -- Pagos: aluguel e internet dos meses anteriores; energia, só até o mês passado.
  for v_conta in
    select id from public.contas
     where competencia < mes and valor is not null and descricao in ('Aluguel da sala', 'Internet', 'Energia elétrica')
  loop
    perform public.registrar_pagamento_despesa(jsonb_build_object(
      'conta_id', v_conta, 'valor', (select valor from public.contas where id = v_conta),
      'data', least(hoje, (select vencimento from public.contas where id = v_conta) + 1), 'forma_id', v_pix,
      'conta_financeira_id', v_banco));
  end loop;

  insert into public.contas (descricao, categoria_id, valor, vencimento, tipo, fornecedor_id, centro_custo_id)
  values ('Material de escritório', v_mat, 450, hoje - 3, 'variavel',
          (select id from public.fornecedores where nome = 'Papelaria Fictícia'),
          (select id from public.centros_custo where nome = 'Administrativo'))
  returning id into v_conta;
  perform public.registrar_pagamento_despesa(jsonb_build_object(
    'conta_id', v_conta, 'valor', 200, 'data', hoje - 3, 'forma_id', v_pix, 'observacao', 'Primeira metade'));

  insert into public.contas (descricao, categoria_id, valor, vencimento, tipo)
  values ('Café e copa do mês', v_cafe, 87.40, hoje - 6, 'variavel') returning id into v_conta;
  perform public.registrar_pagamento_despesa(jsonb_build_object(
    'conta_id', v_conta, 'valor', 87.40, 'data', hoje - 6, 'pago_por_id', m_socia));

  insert into public.transferencias_financeiras (origem_id, destino_id, valor, data, justificativa)
  values ((select id from public.contas_financeiras where padrao), v_banco, 500, hoje - 4, 'Depósito do caixa no banco');

  -- O mês retrasado fica fechado.
  perform public.fechar_mes((mes - interval '2 months')::date);

  -- ----------------------------------------------------------- tarefas e prazos
  insert into public.tarefas (tipo, titulo, ato, responsavel_id, prioridade, entrega, cliente_id, processo_id, descricao) values
    ('tarefa', 'Conferir documentos fictícios', null, m_admin, 'normal', hoje, c_jose, v_proc, 'Demonstração.'),
    ('tarefa', 'Revisar minuta fictícia do contrato', 'Manifestação', m_socia, 'alta', hoje + 2, c_jose, null, null),
    ('tarefa', 'Organizar pasta fictícia do cliente', null, m_admin, 'baixa', hoje + 15, null, null, null);
  insert into public.tarefas (tipo, titulo, ato, responsavel_id, prioridade, entrega, cliente_id, processo_id,
                              fatal_em, contagem, base_em, quantidade, recesso)
  values ('prazo', 'Recurso fictício — prazo em dias úteis', 'Recurso', m_socia, 'normal', hoje + 4, c_jose, v_proc,
          ((hoje + 6)::text || ' 23:59:00-03')::timestamptz, 'uteis', ((hoje - 15)::text || ' 00:00:00-03')::timestamptz, 15, true);

  insert into public.intimacoes (fonte, disponibilizada_em, publicada_em, tribunal, orgao, tipo_comunicacao, numero_processo,
                                 texto, membro_id, cliente_id, processo_id)
  values ('manual', hoje - 2, hoje - 1, 'TJPR', 'Vara fictícia', 'Intimação', '00012342220258160001',
          'Comunicação fictícia cadastrada à mão. Intime-se a parte autora para manifestação no prazo de 15 (quinze) dias.',
          m_socia, c_jose, v_proc);

  insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, cliente_id) values
    (m_socia, 'atendimento', 'presencial', 'Atendimento fictício', ((hoje)::text || ' 14:00:00-03')::timestamptz,
     ((hoje)::text || ' 15:00:00-03')::timestamptz, c_jose),
    (m_admin, 'atendimento', 'online', 'Retorno fictício', ((hoje + 2)::text || ' 10:00:00-03')::timestamptz,
     ((hoje + 2)::text || ' 10:30:00-03')::timestamptz, c_emp);

  perform set_config('request.jwt.claims', '', false);
end
$$;
