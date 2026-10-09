-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Cenários do Financeiro, do contrato ao fechamento, direto no banco
-- =============================================================================
--
-- Complementa permissoes.sql: lá se confere QUEM pode; aqui, se o que cada
-- função faz está CERTO — somas, saldos, situações, numeração, travas do mês
-- fechado e a divisão entre os sócios, com os centavos no lugar.
--
-- Cola no SQL Editor do Supabase e roda. Tudo acontece dentro de um bloco
-- desfeito no fim: nenhum contrato, recebimento, conta ou fechamento de teste
-- fica gravado, e os dados reais não são tocados. Os meses usados (fevereiro a
-- junho de 2026) ficam no passado de propósito — o banco recusa recebimento e
-- pagamento com data futura.
--
-- Identidades simuladas pelo JWT, como a Data API faz: administrador
-- (Vinícius), sócia com Financeiro completo (Juliana), secretária
-- (lançamentos) e associado sem Financeiro.
--
-- Rodado em 23/09/2026, depois da migração 06 (ajustes do Financeiro): 62 de 62.

create or replace function pg_temp.testar_financeiro()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  u_socia  uuid := gen_random_uuid();
  u_sec    uuid := gen_random_uuid();
  u_assoc  uuid := gen_random_uuid();
  m_admin  uuid;
  m_socia  uuid;
  m_sec    uuid;
  v_cli    uuid;
  v_pix    uuid;
  v_cat    uuid;
  v_cafe   uuid;
  c_a      uuid;
  c_b      uuid;
  c_c      uuid;
  c_d      uuid;
  a0       uuid;
  a1       uuid;
  a2       uuid;
  b1       uuid;
  b2       uuid;
  b3       uuid;
  v_rec    uuid;
  v_ren    uuid;
  v_conta  uuid;
  v_rcr    uuid;
  v_qtd    integer;
  v_num    numeric;
  v_txt    text;
  v_bool   boolean;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'fin-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_socia, 'fin-socia@teste.local', now(), 'authenticated', 'authenticated'),
      (u_sec,   'fin-sec@teste.local',   now(), 'authenticated', 'authenticated'),
      (u_assoc, 'fin-assoc@teste.local', now(), 'authenticated', 'authenticated');

    update public.membros set email = 'fin-admin@teste.local' where nome_curto = 'Vinícius' returning id into m_admin;
    update public.membros set email = 'fin-socia@teste.local' where nome_curto = 'Juliana' returning id into m_socia;
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Secretária Teste', 'Secretária', 'fin-sec@teste.local', 'secretaria', 'todas', 'lancamentos')
      returning id into m_sec;
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Associado Teste', 'Associado', 'fin-assoc@teste.local', 'associado', 'propria', 'nenhum');

    select id into v_pix from public.formas_pagamento where nome = 'Pix';
    select id into v_cat from public.categorias where nome = 'Aluguel';
    select id into v_cafe from public.categorias where nome = 'Copa e café';

    -- Liga cada login ao membro, como no primeiro acesso.
    perform set_config('role', 'authenticated', true);
    foreach v_txt in array array[u_admin::text, u_socia::text, u_sec::text, u_assoc::text] loop
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_txt, 'role', 'authenticated')::text, true);
      perform public.iniciar_sessao();
    end loop;

    -- ============ secretária: contrato fixo com entrada paga ============
    etapa := 'contrato fixo';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);

    insert into public.clientes (nome, telefone) values ('Cliente Financeiro Teste', '41988887777')
      returning id into v_cli;

    c_a := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato A', 'valor_total', 1000, 'forma_prevista_id', v_pix,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 0, 'vencimento', '2026-03-05', 'valor', 300),
        jsonb_build_object('numero', 1, 'vencimento', '2026-03-20', 'valor', 350),
        jsonb_build_object('numero', 2, 'vencimento', '2026-04-20', 'valor', 350)),
      'entrada_recebida', jsonb_build_object('data', '2026-03-05', 'forma_id', v_pix)));
    select id into a0 from public.parcelas where contrato_id = c_a and numero = 0;
    select id into a1 from public.parcelas where contrato_id = c_a and numero = 1;
    select id into a2 from public.parcelas where contrato_id = c_a and numero = 2;

    select string_agg(numero || ':' || situacao, ',' order by numero) into v_txt
      from public.v_parcelas where contrato_id = c_a;
    res := res || jsonb_build_object('ok', v_txt = '0:paga,1:vencida,2:vencida',
      't', 'F01 contrato nasce com a entrada já recebida', 'd', v_txt);

    begin
      perform public.criar_contrato(jsonb_build_object(
        'cliente_id', v_cli, 'descricao', 'Soma errada', 'valor_total', 1000,
        'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-05-01', 'valor', 999.99))));
      res := res || jsonb_build_object('ok', false, 't', 'F02 soma das parcelas diferente do total é recusada', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não fecha%', 't', 'F02 soma das parcelas diferente do total é recusada', 'd', sqlerrm);
    end;

    begin
      perform public.criar_contrato(jsonb_build_object(
        'cliente_id', v_cli, 'descricao', 'Sem parcelas', 'valor_total', 500, 'parcelas', '[]'::jsonb));
      res := res || jsonb_build_object('ok', false, 't', 'F03 contrato fixo sem parcela é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%pelo menos uma parcela%', 't', 'F03 contrato fixo sem parcela é recusado', 'd', sqlerrm);
    end;

    begin
      perform public.criar_contrato(jsonb_build_object(
        'cliente_id', gen_random_uuid(), 'descricao', 'Cliente inexistente', 'valor_total', 100,
        'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-05-01', 'valor', 100))));
      res := res || jsonb_build_object('ok', false, 't', 'F04 cliente que não existe é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%cliente cadastrado%', 't', 'F04 cliente que não existe é recusado', 'd', sqlerrm);
    end;

    begin
      perform public.criar_contrato(jsonb_build_object(
        'cliente_id', v_cli, 'descricao', 'Sem entrada', 'valor_total', 100,
        'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-05-01', 'valor', 100)),
        'entrada_recebida', jsonb_build_object('data', '2026-05-01')));
      res := res || jsonb_build_object('ok', false, 't', 'F05 entrada paga sem entrada no contrato é recusada', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%Não há entrada%', 't', 'F05 entrada paga sem entrada no contrato é recusada', 'd', sqlerrm);
    end;

    -- ============================ recebimentos ============================
    etapa := 'recebimentos';
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id)
      values (a1, '2026-03-25', 100, 100, 0, v_pix);
    select situacao || ':' || parcial || ':' || saldo into v_txt from public.v_parcelas where id = a1;
    res := res || jsonb_build_object('ok', v_txt = 'vencida:true:250.00', 't', 'F06 pagamento parcial abate o saldo', 'd', v_txt);

    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (a1, '2026-03-26', 260, 260, 0);
      res := res || jsonb_build_object('ok', false, 't', 'F07 abatimento maior que o saldo é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%passa do saldo%', 't', 'F07 abatimento maior que o saldo é recusado', 'd', sqlerrm);
    end;

    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (a1, privado.hoje() + 1, 10, 10, 0);
      res := res || jsonb_build_object('ok', false, 't', 'F08 recebimento com data futura é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%futuro%', 't', 'F08 recebimento com data futura é recusado', 'd', sqlerrm);
    end;

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id)
      values (a1, '2026-03-28', 280, 250, 30, v_pix);
    select situacao || ':' || pago_principal || ':' || pago_encargos into v_txt from public.v_parcelas where id = a1;
    res := res || jsonb_build_object('ok', v_txt = 'paga:350.00:30.00', 't', 'F09 quitação com encargos separa saldo e encargos', 'd', v_txt);

    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (a2, '2026-03-30', 50, 40, 0);
      res := res || jsonb_build_object('ok', false, 't', 'F10 valor diferente de saldo + encargos é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '23514', 't', 'F10 valor diferente de saldo + encargos é recusado', 'd', sqlerrm);
    end;

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (a2, '2026-03-30', 50, 50, 0) returning id into v_rec;

    begin
      update public.recebimentos set estornado_em = now() where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', 'F11 estorno sem motivo é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%motivo do estorno%', 't', 'F11 estorno sem motivo é recusado', 'd', sqlerrm);
    end;

    update public.recebimentos set estornado_em = now(), motivo_estorno = 'Lançado no cliente errado' where id = v_rec;
    select saldo into v_num from public.v_parcelas where id = a2;
    select estornado_por = m_sec into v_bool from public.recebimentos where id = v_rec;
    res := res || jsonb_build_object('ok', v_num = 350 and v_bool, 't', 'F12 estorno devolve o saldo e registra quem estornou', 'd', v_num);

    begin
      update public.recebimentos set motivo_estorno = 'outro' where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', 'F13 estornado não muda mais', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%estornado não pode%', 't', 'F13 estornado não muda mais', 'd', sqlerrm);
    end;

    insert into public.recebimentos (tipo_avulsa, descricao, data, valor, valor_principal, valor_encargos, forma_id)
      values ('consulta', 'Consulta trabalhista', '2026-03-10', 150.01, 0, 150.01, v_pix) returning id into v_rec;
    select valor_principal || ':' || valor_encargos into v_txt from public.recebimentos where id = v_rec;
    res := res || jsonb_build_object('ok', v_txt = '150.01:0.00', 't', 'F14 entrada avulsa é toda principal, sem encargo', 'd', v_txt);

    begin
      insert into public.recebimentos (data, valor, valor_principal, valor_encargos)
        values ('2026-03-10', 10, 10, 0);
      res := res || jsonb_build_object('ok', false, 't', 'F15 entrada sem parcela e sem tipo é recusada', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', true, 't', 'F15 entrada sem parcela e sem tipo é recusada', 'd', sqlerrm);
    end;

    select parcela_numero || ':' || contrato_descricao || ':' || cliente_nome into v_txt
      from public.v_recebimentos where parcela_id = a1 and valor = 280;
    res := res || jsonb_build_object('ok', v_txt = '1:Contrato A:Cliente Financeiro Teste', 't', 'F16 v_recebimentos liga recebimento, parcela e contrato', 'd', v_txt);

    -- ============================== parcelas ==============================
    etapa := 'parcelas';
    -- Desde 08/10/2026 a mudança de vencimento leva o motivo junto.
    update public.parcelas set vencimento = '2026-04-25', motivo_alteracao = 'Cliente pediu cinco dias' where id = a2;
    perform set_config('role', 'none', true);
    select count(*) into v_qtd from public.auditoria
     where registro_id = a2 and acao = 'alterou' and campos @> array['vencimento']
       and antes ->> 'vencimento' = '2026-04-20' and depois ->> 'vencimento' = '2026-04-25';
    perform set_config('role', 'authenticated', true);
    res := res || jsonb_build_object('ok', v_qtd = 1, 't', 'F17 vencimento alterado deixa o anterior no histórico', 'd', v_qtd);

    -- Desde 08/10/2026 o valor da parcela não se altera direto pela API (T02).
    begin
      update public.parcelas set valor = 300 where id = a1;
      res := res || jsonb_build_object('ok', false, 't', 'F18 valor de parcela não se altera direto pela API', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', 'F18 valor de parcela não se altera direto pela API', 'd', sqlerrm);
    end;

    begin
      update public.parcelas set cancelado_em = now() where id = a2;
      res := res || jsonb_build_object('ok', false, 't', 'F19 cancelar parcela exige motivo', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%motivo do cancelamento%', 't', 'F19 cancelar parcela exige motivo', 'd', sqlerrm);
    end;

    update public.parcelas set cancelado_em = now(), motivo_cancelamento = 'Acordo verbal de desconto' where id = a2;
    select situacao into v_txt from public.v_parcelas where id = a2;
    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (a2, '2026-04-01', 10, 10, 0);
      v_bool := false;
    exception when others then
      v_bool := sqlerrm like '%renegociada ou cancelada%';
    end;
    res := res || jsonb_build_object('ok', v_txt = 'cancelada' and v_bool, 't', 'F20 parcela cancelada sai do saldo e não recebe mais', 'd', v_txt);

    select situacao || ':' || parcelas_ativas || ':' || saldo || ':' || recebido into v_txt
      from public.v_contratos where id = c_a;
    res := res || jsonb_build_object('ok', v_txt = 'quitado:2:0:680.00', 't', 'F21 contrato com tudo pago ou cancelado fica quitado', 'd', v_txt);

    -- =========================== renegociação ===========================
    etapa := 'renegociação';
    c_b := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato B', 'valor_total', 600,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2026-04-10', 'valor', 200),
        jsonb_build_object('numero', 2, 'vencimento', '2026-05-10', 'valor', 200),
        jsonb_build_object('numero', 3, 'vencimento', '2026-06-10', 'valor', 200))));
    select id into b1 from public.parcelas where contrato_id = c_b and numero = 1;
    select id into b2 from public.parcelas where contrato_id = c_b and numero = 2;
    select id into b3 from public.parcelas where contrato_id = c_b and numero = 3;

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (b2, '2026-05-12', 50, 50, 0);

    v_ren := public.renegociar(jsonb_build_object(
      'contrato_id', c_b, 'parcelas', jsonb_build_array(b2, b3), 'motivo', 'Pediu para dividir',
      'novas', jsonb_build_array(
        jsonb_build_object('vencimento', '2026-07-10', 'valor', 190),
        jsonb_build_object('vencimento', '2026-08-10', 'valor', 190))));

    select saldo_anterior || ':' || valor_renegociado into v_txt from public.renegociacoes where id = v_ren;
    res := res || jsonb_build_object('ok', v_txt = '350.00:380.00', 't', 'F22 renegociação guarda o saldo anterior e o novo valor', 'd', v_txt);

    select string_agg(numero || ':' || situacao || ':' || coalesce((origem_renegociacao_id = v_ren)::text, '-'), ',' order by numero)
      into v_txt from public.v_parcelas where contrato_id = c_b;
    res := res || jsonb_build_object('ok', v_txt = '1:vencida:-,2:renegociada:-,3:renegociada:-,4:vencida:true,5:vencida:true',
      't', 'F23 antigas ficam como renegociadas e as novas continuam a numeração', 'd', v_txt);

    select pago_principal into v_num from public.v_parcelas where id = b2;
    res := res || jsonb_build_object('ok', v_num = 50, 't', 'F24 o que já foi pago na renegociada continua contando', 'd', v_num);

    begin
      perform public.renegociar(jsonb_build_object(
        'contrato_id', c_b, 'parcelas', jsonb_build_array(b2), 'motivo', 'De novo',
        'novas', jsonb_build_array(jsonb_build_object('vencimento', '2026-09-10', 'valor', 150))));
      res := res || jsonb_build_object('ok', false, 't', 'F25 parcela já renegociada não entra em outra renegociação', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%Só parcelas em aberto%', 't', 'F25 parcela já renegociada não entra em outra renegociação', 'd', sqlerrm);
    end;

    begin
      perform public.renegociar(jsonb_build_object(
        'contrato_id', c_b, 'parcelas', jsonb_build_array(a1), 'motivo', 'Outro contrato',
        'novas', jsonb_build_array(jsonb_build_object('vencimento', '2026-09-10', 'valor', 150))));
      res := res || jsonb_build_object('ok', false, 't', 'F26 parcela de outro contrato não entra na renegociação', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%Só parcelas em aberto%', 't', 'F26 parcela de outro contrato não entra na renegociação', 'd', sqlerrm);
    end;

    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (b3, '2026-06-11', 10, 10, 0);
      res := res || jsonb_build_object('ok', false, 't', 'F27 parcela renegociada não recebe pagamento', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%renegociada ou cancelada%', 't', 'F27 parcela renegociada não recebe pagamento', 'd', sqlerrm);
    end;

    begin
      update public.parcelas set vencimento = '2026-12-01' where id = b3;
      res := res || jsonb_build_object('ok', false, 't', 'F28 parcela renegociada não se altera', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%renegociada não pode%', 't', 'F28 parcela renegociada não se altera', 'd', sqlerrm);
    end;

    select parcelas_ativas || ':' || saldo || ':' || recebido into v_txt from public.v_contratos where id = c_b;
    res := res || jsonb_build_object('ok', v_txt = '3:580.00:50.00', 't', 'F29 saldo do contrato renegociado soma a antiga em aberto e as novas', 'd', v_txt);

    -- ================================ êxito ================================
    etapa := 'êxito';
    c_c := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato C — êxito', 'tipo_honorario', 'exito', 'exito_pct', 30));
    select situacao into v_txt from public.v_contratos where id = c_c;
    res := res || jsonb_build_object('ok', v_txt = 'a_apurar', 't', 'F30 êxito nasce a apurar, sem parcelas', 'd', v_txt);

    begin
      perform public.apurar_exito(jsonb_build_object('contrato_id', c_c, 'valor_total', 3000,
        'parcelas', jsonb_build_array(
          jsonb_build_object('vencimento', '2026-07-01', 'valor', 1000),
          jsonb_build_object('vencimento', '2026-08-01', 'valor', 1000))));
      res := res || jsonb_build_object('ok', false, 't', 'F31 apuração com soma errada é recusada', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não fecha%', 't', 'F31 apuração com soma errada é recusada', 'd', sqlerrm);
    end;

    perform public.apurar_exito(jsonb_build_object('contrato_id', c_c, 'valor_total', 3000,
      'parcelas', jsonb_build_array(
        jsonb_build_object('vencimento', '2026-07-01', 'valor', 1000),
        jsonb_build_object('vencimento', '2026-08-01', 'valor', 1000),
        jsonb_build_object('vencimento', '2026-09-01', 'valor', 1000))));
    select situacao || ':' || valor_total || ':' || parcelas_ativas into v_txt from public.v_contratos where id = c_c;
    res := res || jsonb_build_object('ok', v_txt = 'ativo:3000.00:3', 't', 'F32 êxito apurado vira contrato com parcelas', 'd', v_txt);

    begin
      perform public.apurar_exito(jsonb_build_object('contrato_id', c_c, 'valor_total', 100,
        'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-07-01', 'valor', 100))));
      res := res || jsonb_build_object('ok', false, 't', 'F33 êxito não se apura duas vezes', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%já foi apurado%', 't', 'F33 êxito não se apura duas vezes', 'd', sqlerrm);
    end;

    -- ========================= contrato cancelado =========================
    etapa := 'contrato cancelado';
    c_d := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Contrato D', 'valor_total', 500,
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-05-05', 'valor', 500))));
    update public.contratos set cancelado_em = now(), motivo_cancelamento = 'Cliente desistiu' where id = c_d;
    select c.situacao || ':' || p.situacao || ':' || c.saldo into v_txt
      from public.v_contratos c join public.v_parcelas p on p.contrato_id = c.id where c.id = c_d;
    res := res || jsonb_build_object('ok', v_txt = 'cancelado:cancelada:0', 't', 'F34 contrato cancelado leva as parcelas abertas junto', 'd', v_txt);

    begin
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        select id, '2026-05-06', 10, 10, 0 from public.parcelas where contrato_id = c_d;
      res := res || jsonb_build_object('ok', false, 't', 'F35 contrato cancelado não recebe pagamento', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%renegociada ou cancelada%', 't', 'F35 contrato cancelado não recebe pagamento', 'd', sqlerrm);
    end;

    -- ============================== cobrança ==============================
    etapa := 'cobrança';
    insert into public.cobrancas (cliente_id, parcelas, canal, texto, total_na_data)
      values (v_cli, array[b1], 'whatsapp', 'Olá!', 212.34);
    select criado_por = m_sec into v_bool from public.cobrancas where cliente_id = v_cli;
    res := res || jsonb_build_object('ok', v_bool, 't', 'F36 cobrança fica registrada com quem cobrou', 'd', v_bool);

    -- =============================== contas ===============================
    etapa := 'contas';
    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Material de escritório', v_cat, 80, '2026-05-20') returning id into v_conta;
    select competencia::text into v_txt from public.contas where id = v_conta;
    res := res || jsonb_build_object('ok', v_txt = '2026-05-01', 't', 'F37 conta avulsa pertence ao mês do vencimento', 'd', v_txt);

    update public.contas set vencimento = '2026-06-02' where id = v_conta;
    select competencia::text into v_txt from public.contas where id = v_conta;
    res := res || jsonb_build_object('ok', v_txt = '2026-06-01', 't', 'F38 conta avulsa muda de mês junto com o vencimento', 'd', v_txt);

    begin
      perform public.registrar_pagamento_despesa(jsonb_build_object(
        'conta_id', v_conta, 'valor', 80, 'data', privado.hoje() + 1));
      res := res || jsonb_build_object('ok', false, 't', 'F39 pagamento com data futura é recusado', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%futuro%', 't', 'F39 pagamento com data futura é recusado', 'd', sqlerrm);
    end;

    insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio)
      values ('Aluguel teste', v_cat, 31, 400, '2026-01-01') returning id into v_rcr;
    insert into public.contas_recorrentes (descricao, categoria_id, dia_vencimento, valor, inicio)
      values ('Energia teste', v_cat, 10, null, '2026-01-01');
    v_qtd := public.gerar_contas_do_mes('2026-02-01');
    select vencimento::text into v_txt from public.contas where recorrente_id = v_rcr and competencia = '2026-02-01';
    res := res || jsonb_build_object('ok', v_qtd >= 2 and v_txt = '2026-02-28', 't', 'F40 recorrente do dia 31 vence no último dia de fevereiro', 'd', v_qtd || ' · ' || v_txt);

    v_qtd := public.gerar_contas_do_mes('2026-02-01');
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', 'F41 gerar o mês de novo não duplica', 'd', v_qtd);

    select situacao into v_txt from public.v_contas where descricao = 'Energia teste' and competencia = '2026-02-01';
    begin
      perform public.registrar_pagamento_despesa(jsonb_build_object(
        'conta_id', (select id from public.contas where descricao = 'Energia teste' and competencia = '2026-02-01'),
        'valor', 10, 'data', '2026-02-10'));
      v_bool := false;
    exception when others then
      v_bool := sqlerrm like '%valor da conta%';
    end;
    res := res || jsonb_build_object('ok', v_txt = 'sem_valor' and v_bool, 't', 'F42 conta de valor variável nasce sem valor e não se paga assim', 'd', v_txt);

    update public.contas set cancelado_em = now(), motivo_cancelamento = 'Mudou de sala'
     where recorrente_id = v_rcr and competencia = '2026-02-01';
    v_qtd := public.gerar_contas_do_mes('2026-02-01');
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', 'F43 conta cancelada não renasce na geração do mês', 'd', v_qtd);

    v_qtd := public.gerar_contas_do_mes((privado.inicio_mes(privado.hoje()) + interval '3 months')::date);
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', 'F44 não gera contas de meses distantes', 'd', v_qtd);

    -- Saídas de março: aluguel pelo caixa e café pago pela sócia.
    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Aluguel de março', v_cat, 400, '2026-03-10') returning id into v_conta;
    perform public.registrar_pagamento_despesa(jsonb_build_object(
      'conta_id', v_conta, 'valor', 400, 'data', '2026-03-12', 'forma_id', v_pix));
    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Café', v_cafe, 30, '2026-03-15') returning id into v_conta;
    perform public.registrar_pagamento_despesa(jsonb_build_object(
      'conta_id', v_conta, 'valor', 30, 'data', '2026-03-15', 'pago_por_id', m_socia));
    -- Conta de março ainda sem pagamento: vira pendência do fechamento.
    insert into public.contas (descricao, categoria_id, valor, vencimento)
      values ('Internet de março', v_cat, 99.90, '2026-03-20');

    -- ============================ série mensal ============================
    etapa := 'série mensal';
    select string_agg(to_char(competencia, 'YYYY-MM') || '=' || entradas || '/' || saidas, ',' order by competencia)
      into v_txt from public.serie_mensal('2026-04-01', 2);
    res := res || jsonb_build_object('ok', v_txt = '2026-03=830.01/430.00,2026-04=0/0',
      't', 'F45 série mensal soma entradas e saídas pelo mês do caixa', 'd', v_txt);

    -- ============================= fechamento =============================
    etapa := 'fechamento';
    begin
      perform public.previa_fechamento('2026-03-01');
      res := res || jsonb_build_object('ok', false, 't', 'F46 secretária não vê o fechamento', 'd', 'viu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', 'F46 secretária não vê o fechamento', 'd', sqlerrm);
    end;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_socia, 'role', 'authenticated')::text, true);
    j := public.previa_fechamento('2026-03-01');
    res := res || jsonb_build_object(
      'ok', j #>> '{totais,entradas}' = '830.01' and j #>> '{totais,saidas}' = '430.00'
        and j #>> '{totais,resultado}' = '400.01' and j #>> '{totais,principal_parcelas}' = '650.00'
        and j #>> '{totais,encargos}' = '30.00' and j #>> '{totais,avulsas}' = '150.01',
      't', 'F47 prévia de março: entradas, saídas, resultado e composição', 'd', j -> 'totais');

    select string_agg((s ->> 'nome') || '=' || (s ->> 'valor') || '+' || (s ->> 'reembolso_pendente'), ',')
      into v_txt from jsonb_array_elements(j #> '{divisao,socios}') as s;
    select sum((s ->> 'valor')::numeric) into v_num from jsonb_array_elements(j #> '{divisao,socios}') as s;
    res := res || jsonb_build_object('ok',
      -- Três sócios ativos desde que o Marlon saiu (out/2026); o centavo do
      -- arredondamento fica com o último da lista.
      v_txt = 'Guilherme=133.34+0,Juliana=133.34+30.00,Vinícius=133.33+0' and v_num = 400.01,
      't', 'F48 divisão igual fecha no centavo e mostra o reembolso da sócia', 'd', v_txt);

    res := res || jsonb_build_object('ok',
      (j #>> '{pendencias,contas_sem_baixa}')::int = 1 and j #>> '{pendencias,contas_sem_baixa_valor}' = '99.90',
      't', 'F49 conta do mês sem pagamento aparece como pendência', 'd', j -> 'pendencias');

    begin
      perform public.fechar_mes('2026-03-01');
      res := res || jsonb_build_object('ok', false, 't', 'F50 só o administrador fecha o mês', 'd', 'fechou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlstate = '42501', 't', 'F50 só o administrador fecha o mês', 'd', sqlerrm);
    end;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    begin
      perform public.fechar_mes((privado.inicio_mes(privado.hoje()) + interval '1 month')::date);
      res := res || jsonb_build_object('ok', false, 't', 'F51 mês que não começou não fecha', 'd', 'fechou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%não começou%', 't', 'F51 mês que não começou não fecha', 'd', sqlerrm);
    end;

    j := public.fechar_mes('2026-03-01');
    select fechado and fechado_por = m_admin and (totais ->> 'resultado') = '400.01' into v_bool
      from public.fechamentos where competencia = '2026-03-01';
    res := res || jsonb_build_object('ok', v_bool, 't', 'F52 fechamento grava a foto do mês e quem fechou', 'd', v_bool);

    begin
      perform public.fechar_mes('2026-03-01');
      res := res || jsonb_build_object('ok', false, 't', 'F53 mês fechado não fecha de novo', 'd', 'fechou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%já está fechado%', 't', 'F53 mês fechado não fecha de novo', 'd', sqlerrm);
    end;

    -- A secretária tenta mexer em março, já fechado.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    begin
      insert into public.recebimentos (tipo_avulsa, data, valor, valor_principal, valor_encargos)
        values ('outros', '2026-03-31', 10, 10, 0);
      res := res || jsonb_build_object('ok', false, 't', 'F54 mês fechado não aceita recebimento novo', 'd', 'aceitou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%está fechado%', 't', 'F54 mês fechado não aceita recebimento novo', 'd', sqlerrm);
    end;

    select id into v_rec from public.recebimentos where parcela_id = a1 and valor = 280;
    begin
      update public.recebimentos set estornado_em = now(), motivo_estorno = 'x' where id = v_rec;
      res := res || jsonb_build_object('ok', false, 't', 'F55 mês fechado não aceita estorno', 'd', 'estornou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%está fechado%', 't', 'F55 mês fechado não aceita estorno', 'd', sqlerrm);
    end;

    update public.recebimentos set observacao = 'Comprovante no e-mail' where id = v_rec;
    get diagnostics v_qtd = row_count;
    res := res || jsonb_build_object('ok', v_qtd = 1, 't', 'F56 observação continua editável no mês fechado', 'd', v_qtd);

    begin
      update public.contas set valor = 31 where id = v_conta;
      res := res || jsonb_build_object('ok', false, 't', 'F57 conta paga no mês fechado não muda de valor', 'd', 'mudou');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%está fechado%', 't', 'F57 conta paga no mês fechado não muda de valor', 'd', sqlerrm);
    end;

    perform public.registrar_reembolso((select id from public.pagamentos_despesa where conta_id = v_conta), '2026-04-05');
    select count(*) into v_qtd from public.pagamentos_despesa where conta_id = v_conta and reembolsado_em = '2026-04-05';
    res := res || jsonb_build_object('ok', v_qtd = 1, 't', 'F58 reembolso à sócia se marca mesmo com o mês fechado', 'd', v_qtd);

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    begin
      perform public.reabrir_mes('2026-03-01', '  ');
      res := res || jsonb_build_object('ok', false, 't', 'F59 reabrir exige motivo', 'd', 'reabriu');
    exception when others then
      res := res || jsonb_build_object('ok', sqlerrm like '%motivo da reabertura%', 't', 'F59 reabrir exige motivo', 'd', sqlerrm);
    end;

    perform public.reabrir_mes('2026-03-01', 'Faltou lançar uma consulta');
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_sec, 'role', 'authenticated')::text, true);
    insert into public.recebimentos (tipo_avulsa, data, valor, valor_principal, valor_encargos)
      values ('consulta', '2026-03-31', 99.99, 99.99, 0);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    j := public.fechar_mes('2026-03-01');
    select (totais ->> 'entradas') || ':' || fechado || ':' || (motivo_reabertura is not null) into v_txt
      from public.fechamentos where competencia = '2026-03-01';
    res := res || jsonb_build_object('ok', v_txt = '930.00:true:true', 't', 'F60 reaberto, aceita o lançamento e fecha de novo com a foto nova', 'd', v_txt);

    -- Cotas: 60% para Vinícius, 40% para Juliana, os outros de fora. Base de
    -- março depois da reabertura: 930,00 − 430,00 = 500,00.
    update public.config_financeiro set divisao_modelo = 'cotas';
    update public.divisao_cotas set participa = false;
    update public.divisao_cotas set participa = true, percentual = 60 where membro_id = m_admin;
    update public.divisao_cotas set participa = true, percentual = 40 where membro_id = m_socia;
    j := public.previa_fechamento('2026-03-01');
    select string_agg((s ->> 'nome') || '=' || (s ->> 'valor'), ',') into v_txt
      from jsonb_array_elements(j #> '{divisao,socios}') as s;
    res := res || jsonb_build_object('ok', v_txt = 'Juliana=200.00,Vinícius=300.00',
      't', 'F61 divisão por cotas aplica o percentual de cada sócio', 'd', v_txt);

    -- Associado sem Financeiro não enxerga nada.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_assoc, 'role', 'authenticated')::text, true);
    select count(*) into v_qtd from public.v_parcelas;
    res := res || jsonb_build_object('ok', v_qtd = 0, 't', 'F62 quem não tem Financeiro não vê parcela nenhuma', 'd', v_qtd);

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

select * from pg_temp.testar_financeiro();
