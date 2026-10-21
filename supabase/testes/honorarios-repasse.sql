-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Honorários fixo + êxito, contrato encadeado e acordo com repasse
-- =============================================================================
--
-- Migração 20261019120000 (docs/historico/preparacao-pedidos-advogados.md, Lotes 2 e 3).
-- Tudo acontece num bloco desfeito no fim: nada fica gravado. Não rode em
-- produção — rode com `npm run banco:test` (PostgreSQL isolado).
--
-- Identidades simuladas pelo JWT: administrador (Vinícius), secretária
-- (lançamentos), Consulta e associado sem Financeiro.

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

create or replace function pg_temp.testar_honorarios()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  u_sec    uuid := gen_random_uuid();
  u_cons   uuid := gen_random_uuid();
  u_assoc  uuid := gen_random_uuid();
  v_pix    uuid;
  v_caixa  uuid;
  v_cli    uuid;
  v_cli2   uuid;
  c_misto  uuid;
  c_misto2 uuid;
  c_enc    uuid;
  c_canc   uuid;
  c_acordo uuid;
  c_cent   uuid;
  c_exito  uuid;
  r_entrada uuid;
  r_p1     uuid;
  r_cent   uuid;
  r_fixo   uuid;
  v_rep    uuid;
  v_rep2   uuid;
  v_id     uuid;
  v_txt    text;
  v_num    numeric;
  v_num2   numeric;
  v_bool   boolean;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'hr-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_sec,   'hr-sec@teste.local',   now(), 'authenticated', 'authenticated'),
      (u_cons,  'hr-cons@teste.local',  now(), 'authenticated', 'authenticated'),
      (u_assoc, 'hr-assoc@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'hr-admin@teste.local' where nome_curto = 'Vinícius';
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Secretária Teste', 'Secretária', 'hr-sec@teste.local', 'secretaria', 'todas', 'lancamentos');
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Consulta Teste', 'Consulta', 'hr-cons@teste.local', 'associado', 'nenhum', 'consulta');
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Associado Teste', 'Associado', 'hr-assoc@teste.local', 'associado', 'propria', 'nenhum');
    select id into v_pix from public.formas_pagamento where nome = 'Pix';
    select id into v_caixa from public.contas_financeiras where padrao;

    foreach v_txt in array array[u_admin::text, u_sec::text, u_cons::text, u_assoc::text] loop
      perform pg_temp.como(v_txt::uuid);
      perform public.iniciar_sessao();
    end loop;

    perform pg_temp.como(u_admin);
    insert into public.clientes (nome) values ('Cliente Misto') returning id into v_cli;
    insert into public.clientes (nome) values ('Cliente do Acordo') returning id into v_cli2;

    -- ===================== fixo + êxito (misto) =====================
    etapa := 'misto';
    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Sem percentual', 'tipo_honorario', 'misto', 'valor_total', 3000,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-08-10', 'valor', 3000))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%percentual de êxito%', 'H01 misto sem percentual de êxito é recusado', v_txt);

    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Sem parcelas', 'tipo_honorario', 'misto', 'valor_total', 3000, 'exito_pct', 30,
      'data_contrato', '2026-08-01'))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%pelo menos uma parcela%', 'H02 misto sem parcelas da parte fixa é recusado', v_txt);

    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Soma errada', 'tipo_honorario', 'misto', 'valor_total', 3000, 'exito_pct', 30,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-08-10', 'valor', 2000))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%não fecha%', 'H03 misto com parcelas que não fecham o fixo é recusado', v_txt);

    c_misto := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Trabalhista — fixo + êxito', 'tipo_honorario', 'misto',
      'valor_total', 3000, 'exito_pct', 30, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2026-08-10', 'valor', 1500),
        jsonb_build_object('numero', 2, 'vencimento', '2026-09-10', 'valor', 1500))));
    select tipo_honorario || ':' || valor_total || ':' || exito_pct || ':' || situacao || ':' || exito_pendente
      into v_txt from public.v_contratos where id = c_misto;
    res := res || pg_temp.t(v_txt = 'misto:3000.00:30.00:ativo:true',
      'H04 misto nasce com o fixo parcelado, o percentual e o êxito pendente', v_txt);

    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Êxito com parcelas', 'tipo_honorario', 'exito', 'exito_pct', 30,
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-12-10', 'valor', 100))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%nasce sem parcelas%', 'H05 contrato só de êxito não nasce com parcelas', v_txt);

    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Misto com cota', 'tipo_honorario', 'misto', 'valor_total', 1000, 'exito_pct', 30,
      'cota_escritorio_pct', 30, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-08-10', 'valor', 1000))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%se informa na apuração%', 'H06 no misto, a cota do acordo vai na apuração, não na criação', v_txt);

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-09-10', valor, valor, 0 from public.parcelas where contrato_id = c_misto;
    select situacao || ':' || rotulo || ':' || exito_pendente into v_txt from public.v_contratos where id = c_misto;
    res := res || pg_temp.t(v_txt = 'a_apurar:a_apurar:true',
      'H07 misto com o fixo quitado fica "a apurar", não quitado', v_txt);
    v_txt := pg_temp.erro(format($q$select public.arquivar_contrato(%L, 'teste')$q$, c_misto));
    res := res || pg_temp.t(v_txt like '%êxito a apurar%', 'H08 misto com êxito pendente não se arquiva', v_txt);

    perform public.apurar_exito(jsonb_build_object(
      'contrato_id', c_misto, 'valor_total', 3000, 'base', 10000,
      'parcelas', jsonb_build_array(
        jsonb_build_object('vencimento', '2026-11-10', 'valor', 1500),
        jsonb_build_object('vencimento', '2026-12-10', 'valor', 1500))));
    select v.valor_total || ':' || v.valor_exito || ':' || v.exito_base || ':' || v.situacao || ':' || v.exito_pendente,
           v.diferenca_plano
      into v_txt, v_num from public.v_contratos v where v.id = c_misto;
    res := res || pg_temp.t(v_txt = '3000.00:3000.00:10000.00:ativo:false' and v_num = 0,
      'H09 apurar o misto grava o êxito à parte: o fixo não muda e o plano fecha', v_txt || ' dif ' || v_num);
    select string_agg(numero || ':' || parte, ',' order by numero) into v_txt
      from public.parcelas where contrato_id = c_misto;
    res := res || pg_temp.t(v_txt = '1:fixo,2:fixo,3:exito,4:exito',
      'H10 parcelas do êxito continuam a numeração e ficam marcadas como do êxito', v_txt);

    v_txt := pg_temp.erro(format($q$select public.apurar_exito(jsonb_build_object('contrato_id', %L, 'valor_total', 100,
      'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2027-01-10', 'valor', 100))))$q$, c_misto));
    res := res || pg_temp.t(v_txt like '%já foi apurado%', 'H11 êxito do misto não se apura duas vezes', v_txt);

    perform set_config('role', 'none', true);
    v_txt := pg_temp.erro(format($q$update public.contratos set valor_exito = 1 where id = %L$q$, c_misto));
    res := res || pg_temp.t(v_txt like '%já apurado não muda%', 'H12 nem o dono do banco muda o êxito apurado', v_txt);
    v_txt := pg_temp.erro(format($q$update public.contratos set tipo_honorario = 'fixo' where id = %L$q$, c_misto));
    res := res || pg_temp.t(v_txt like '%tipo de honorário não muda%', 'H13 o tipo de honorário não muda depois de criado', v_txt);

    select x.situacao into v_txt from public.posicao_financeira_em('2026-09-30') x where x.contrato_id = c_misto;
    res := res || pg_temp.t(v_txt = 'a_apurar', 'H14 no corte antes da apuração, o misto quitado no fixo está "a apurar"', v_txt);
    perform pg_temp.como(u_sec);

    v_id := public.renegociar(jsonb_build_object(
      'contrato_id', c_misto, 'motivo', 'Cliente pediu mais prazo',
      'parcelas', jsonb_build_array((select id from public.parcelas where contrato_id = c_misto and numero = 4)),
      'novas', jsonb_build_array(jsonb_build_object('vencimento', '2027-01-10', 'valor', 1500))));
    select parte || ':' || cota_escritorio_pct into v_txt from public.parcelas where origem_renegociacao_id = v_id;
    select diferenca_plano into v_num from public.v_contratos where id = c_misto;
    res := res || pg_temp.t(v_txt = 'exito:100.00' and v_num = 0,
      'H15 renegociada, a parcela do êxito continua do êxito e o plano fecha', v_txt || ' dif ' || v_num);

    -- ===================== contrato encadeado =====================
    etapa := 'encadeado';
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'De outro cliente', 'valor_total', 1200, 'data_contrato', '2026-10-01',
      'inicia_apos_contrato_id', %L,
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2027-02-10', 'valor', 1200))))$q$, v_cli2, c_misto));
    res := res || pg_temp.t(v_txt like '%mesmo cliente%', 'E01 só encadeia contrato do mesmo cliente', v_txt);

    c_canc := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Será cancelado', 'valor_total', 100, 'data_contrato', '2026-10-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-12-01', 'valor', 100))));
    update public.contratos set cancelado_em = now(), motivo_cancelamento = 'Desistiu' where id = c_canc;
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Depois do cancelado', 'valor_total', 1200, 'data_contrato', '2026-10-01',
      'inicia_apos_contrato_id', %L,
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2027-02-10', 'valor', 1200))))$q$, v_cli, c_canc));
    res := res || pg_temp.t(v_txt like '%não estar cancelado%', 'E02 não encadeia em contrato cancelado', v_txt);

    c_enc := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Previdenciário — começa depois', 'valor_total', 2400, 'data_contrato', '2026-10-01',
      'inicia_apos_contrato_id', c_misto,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2027-02-10', 'valor', 1200),
        jsonb_build_object('numero', 2, 'vencimento', '2027-03-10', 'valor', 1200))));
    select (select inicia_apos_contrato_id = c_misto from public.v_contratos where id = c_enc)
           and (select ultimo_vencimento = '2027-01-10' from public.v_contratos where id = c_misto)
      into v_bool;
    res := res || pg_temp.t(v_bool, 'E03 o encadeado guarda o anterior, e o anterior mostra o último vencimento vigente', v_bool);

    perform set_config('role', 'none', true);
    v_txt := pg_temp.erro(format($q$update public.contratos set inicia_apos_contrato_id = null where id = %L$q$, c_enc));
    res := res || pg_temp.t(v_txt like '%não muda%', 'E04 o contrato anterior não muda depois de gravado', v_txt);
    perform pg_temp.como(u_sec);

    -- ===================== acordo com repasse =====================
    etapa := 'acordo';
    select jsonb_build_array(jsonb_build_object('numero', 0, 'vencimento', '2026-09-05', 'valor', 5000))
           || jsonb_agg(jsonb_build_object('numero', g, 'vencimento', ('2026-09-05'::date + make_interval(months => g))::date,
                                           'valor', 1000) order by g)
      into j from generate_series(1, 10) g;
    c_acordo := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli2, 'descricao', 'Acordo — reclamatória', 'valor_total', 15000,
      'cota_escritorio_pct', 30, 'data_contrato', '2026-09-01', 'parcelas', j));
    select tem_repasse || ':' || exigivel_escritorio_total || ':' || exigivel_total into v_txt
      from public.v_contratos where id = c_acordo;
    select valor_escritorio into v_num from public.v_parcelas where contrato_id = c_acordo and numero = 0;
    res := res || pg_temp.t(v_txt = 'true:4500.00:15000.00' and v_num = 1500,
      'R01 acordo de 15.000 com 30% do escritório: 4.500 de honorários, a entrada vale 1.500', v_txt || ' entrada ' || v_num);

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-09-06', 5000, 5000, 0 from public.parcelas where contrato_id = c_acordo and numero = 0
      returning id into r_entrada;
    select valor_repasse || ':' || valor_escritorio || ':' || repasse_situacao into v_txt
      from public.v_recebimentos where id = r_entrada;
    res := res || pg_temp.t(v_txt = '3500.00:1500.00:pendente',
      'R02 receber a entrada bruta separa 1.500 do escritório e 3.500 do cliente, pendente', v_txt);

    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-10-10', 1050, 1000, 50 from public.parcelas where contrato_id = c_acordo and numero = 1
      returning id into r_p1;
    select valor_repasse into v_num from public.recebimentos where id = r_p1;
    res := res || pg_temp.t(v_num = 735, 'R03 multa e juros do acordo dividem na mesma proporção (1.050 → 735 do cliente)', v_num);

    c_cent := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli2, 'descricao', 'Acordo pequeno', 'valor_total', 333.33,
      'cota_escritorio_pct', 30, 'data_contrato', '2026-10-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-10-15', 'valor', 333.33))));
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-10-15', 333.33, 333.33, 0 from public.parcelas where contrato_id = c_cent
      returning id into r_cent;
    select valor_repasse, valor_escritorio into v_num, v_num2 from public.v_recebimentos where id = r_cent;
    res := res || pg_temp.t(v_num = 233.33 and v_num2 = 100.00,
      'R04 centavos: 30% de 333,33 são 100,00; o cliente fica com 233,33', v_num || ' + ' || v_num2);

    select count(*) = 1 and bool_and(gravidade = 'perigo') into v_bool
      from public.pendencias_financeiras(7) where tipo = 'repasse_pendente' and registro_id = r_entrada;
    res := res || pg_temp.t(v_bool, 'R05 repasse parado há mais de uma semana vira alerta de perigo', v_bool);

    v_txt := pg_temp.erro(format($q$select public.registrar_repasse(jsonb_build_object('recebimento_id', %L, 'data', '2026-09-01'))$q$, r_entrada));
    res := res || pg_temp.t(v_txt like '%anterior ao recebimento%', 'R06 repasse não pode ser anterior ao recebimento', v_txt);
    v_txt := pg_temp.erro(format($q$select public.registrar_repasse(jsonb_build_object('recebimento_id', %L, 'data', %L))$q$,
      r_entrada, privado.hoje() + 1));
    res := res || pg_temp.t(v_txt like '%futuro%', 'R07 repasse não pode ter data no futuro', v_txt);

    perform pg_temp.como(u_cons);
    v_txt := pg_temp.erro(format($q$select public.registrar_repasse(jsonb_build_object('recebimento_id', %L, 'data', '2026-09-08'))$q$, r_entrada));
    res := res || pg_temp.t(v_txt like '42501%', 'R08 a Consulta lê, mas não registra repasse', v_txt);
    perform pg_temp.como(u_assoc);
    select count(*) into v_num from public.repasses_cliente;
    select count(*) into v_num2 from public.v_recebimentos where valor_repasse > 0;
    res := res || pg_temp.t(v_num = 0 and v_num2 = 0, 'R09 quem não tem Financeiro não vê repasse nem recebimento', v_num || '/' || v_num2);
    perform pg_temp.como(u_sec);

    v_rep := public.registrar_repasse(jsonb_build_object('recebimento_id', r_entrada, 'data', '2026-09-08', 'forma_id', v_pix));
    select valor || ':' || (conta_financeira_id = v_caixa) into v_txt from public.repasses_cliente where id = v_rep;
    select repasse_pendente into v_num from public.v_contratos where id = c_acordo;
    res := res || pg_temp.t(v_txt = '3500.00:true' and v_num = 735
                            and (select repasse_situacao from public.v_recebimentos where id = r_entrada) = 'feito',
      'R10 repasse feito leva a parte inteira do cliente, sai da conta padrão e deixa só o pendente de outubro',
      v_txt || ' pendente ' || v_num);

    v_txt := pg_temp.erro(format($q$select public.registrar_repasse(jsonb_build_object('recebimento_id', %L, 'data', '2026-09-09'))$q$, r_entrada));
    res := res || pg_temp.t(v_txt like '%já tem o repasse%', 'R11 o mesmo recebimento não tem dois repasses', v_txt);

    select id into r_fixo from public.recebimentos
     where parcela_id = (select id from public.parcelas where contrato_id = c_misto and numero = 1);
    v_txt := pg_temp.erro(format($q$select public.registrar_repasse(jsonb_build_object('recebimento_id', %L, 'data', '2026-09-11'))$q$, r_fixo));
    res := res || pg_temp.t(v_txt like '%não tem parte do cliente%', 'R12 recebimento 100% do escritório não tem repasse', v_txt);

    select (select count(*) from public.v_movimentacoes_financeiras
             where origem = 'repasse_cliente' and origem_id = v_rep and direcao = 'saida' and estornado_em is null) = 1
           and (select saidas from public.v_saldos_contas where id = v_caixa) = 3500
      into v_bool;
    res := res || pg_temp.t(v_bool, 'R13 o repasse é uma saída da conta financeira (não é despesa)', v_bool);

    v_txt := pg_temp.erro(format($q$update public.recebimentos set estornado_em = now(), motivo_estorno = 'teste' where id = %L$q$, r_entrada));
    res := res || pg_temp.t(v_txt like '%Estorne o repasse antes%', 'R14 recebimento com repasse feito não se estorna', v_txt);

    v_txt := pg_temp.erro(format($q$select public.estornar_repasse(%L, '')$q$, v_rep));
    res := res || pg_temp.t(v_txt like '%motivo%', 'R15 estornar repasse exige motivo', v_txt);
    perform public.estornar_repasse(v_rep, 'Transferência devolvida pelo banco');
    select repasse_situacao into v_txt from public.v_recebimentos where id = r_entrada;
    res := res || pg_temp.t(v_txt = 'pendente', 'R16 estornado o repasse, a parte do cliente volta a ficar pendente', v_txt);
    v_rep2 := public.registrar_repasse(jsonb_build_object('recebimento_id', r_entrada, 'data', '2026-09-09'));
    select repasse_situacao into v_txt from public.v_recebimentos where id = r_entrada;
    res := res || pg_temp.t(v_txt = 'feito', 'R17 depois do estorno, o repasse se registra de novo', v_txt);

    -- ===================== fechamento e painel =====================
    etapa := 'fechamento';
    perform pg_temp.como(u_admin);
    j := public.previa_fechamento('2026-09-01');
    v_txt := (j #>> '{totais,entradas}') || ':' || (j #>> '{totais,repasses}') || ':' || (j #>> '{totais,honorarios}')
             || ':' || (j #>> '{totais,resultado}') || ':' || (j #>> '{totais,repasses_feitos}');
    res := res || pg_temp.t(v_txt = '8000.00:3500.00:4500.00:4500.00:3500.00',
      'R18 setembro: entraram 8.000, 3.500 eram do cliente; honorários e resultado de 4.500', v_txt);
    res := res || pg_temp.t((j #>> '{divisao,base}')::numeric = 4500 and (j #>> '{pendencias,repasses_pendentes}')::int = 0,
      'R19 a divisão entre os sócios parte dos honorários, não do bruto', j -> 'divisao' -> 'base');

    j := public.previa_fechamento('2026-10-01');
    res := res || pg_temp.t((j #>> '{totais,repasses}')::numeric = 968.33
                            and (j #>> '{totais,honorarios}')::numeric = 415
                            and (j #>> '{pendencias,repasses_pendentes}')::int = 2
                            and (j #>> '{pendencias,repasses_pendentes_valor}')::numeric = 968.33,
      'R20 outubro: 968,33 dos clientes ainda a repassar aparecem nas pendências', j -> 'pendencias');

    j := public.resumo_financeiro(jsonb_build_object('de', '2026-09-01', 'ate', '2026-10-31'));
    select coalesce(sum((s ->> 'repasses')::numeric), 0) into v_num from jsonb_array_elements(j -> 'serie') s;
    res := res || pg_temp.t((j #>> '{indicadores,receita_recebida,valor}')::numeric = 9383.33
                            and (j #>> '{indicadores,repasses_clientes,valor}')::numeric = 4468.33
                            and (j #>> '{indicadores,honorarios_recebidos,valor}')::numeric = 4915
                            and (j #>> '{indicadores,saldo_realizado,valor}')::numeric = 4915
                            and (j #>> '{indicadores,repasses_clientes,pendente}')::numeric = 968.33
                            and v_num = 4468.33,
      'R21 painel: recebido bruto, repasses e honorários batem com a série e o saldo realizado', j -> 'indicadores');

    -- ===================== êxito apurado como acordo =====================
    etapa := 'êxito com acordo';
    perform pg_temp.como(u_sec);
    c_exito := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli2, 'descricao', 'Êxito — indenizatória', 'tipo_honorario', 'exito', 'exito_pct', 30));
    perform public.apurar_exito(jsonb_build_object(
      'contrato_id', c_exito, 'valor_total', 10000, 'base', 10000, 'cota_escritorio_pct', 30,
      'parcelas', jsonb_build_array(
        jsonb_build_object('vencimento', '2026-11-20', 'valor', 5000),
        jsonb_build_object('vencimento', '2026-12-20', 'valor', 5000))));
    select valor_total || ':' || valor_exito || ':' || exigivel_escritorio_total || ':' || tem_repasse
      into v_txt from public.v_contratos where id = c_exito;
    res := res || pg_temp.t(v_txt = '10000.00:10000.00:3000.00:true',
      'R22 êxito apurado como acordo bruto: 10.000 a receber, 3.000 de honorários', v_txt);

    c_misto2 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli2, 'descricao', 'Fixo + êxito com acordo', 'tipo_honorario', 'misto',
      'valor_total', 2000, 'exito_pct', 25, 'data_contrato', '2026-10-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-10', 'valor', 2000))));
    perform public.apurar_exito(jsonb_build_object(
      'contrato_id', c_misto2, 'valor_total', 8000, 'cota_escritorio_pct', 25,
      'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 8000))));
    select string_agg(parte || ':' || cota_escritorio_pct, ',' order by numero) into v_txt
      from public.parcelas where contrato_id = c_misto2;
    select exigivel_escritorio_total, diferenca_plano into v_num, v_num2 from public.v_contratos where id = c_misto2;
    res := res || pg_temp.t(v_txt = 'fixo:100.00,exito:25.00' and v_num = 4000 and v_num2 = 0,
      'R23 no mesmo contrato, o fixo é 100% do escritório e o acordo do êxito, 25%', v_txt || ' esc ' || v_num);

    v_txt := pg_temp.erro(format($q$select public.renegociar(jsonb_build_object('contrato_id', %L, 'motivo', 'juntar',
      'parcelas', (select jsonb_agg(id) from public.parcelas where contrato_id = %L),
      'novas', jsonb_build_array(jsonb_build_object('vencimento', '2027-01-10', 'valor', 10000))))$q$, c_misto2, c_misto2));
    res := res || pg_temp.t(v_txt like '%cotas do escritório diferentes%', 'R24 parcelas com cotas diferentes não se renegociam juntas', v_txt);
    v_id := public.renegociar(jsonb_build_object(
      'contrato_id', c_misto2, 'motivo', 'Acordo repactuado',
      'parcelas', jsonb_build_array((select id from public.parcelas where contrato_id = c_misto2 and parte = 'exito')),
      'novas', jsonb_build_array(
        jsonb_build_object('vencimento', '2027-01-10', 'valor', 4000),
        jsonb_build_object('vencimento', '2027-02-10', 'valor', 4000))));
    select bool_and(parte = 'exito' and cota_escritorio_pct = 25) into v_bool
      from public.parcelas where origem_renegociacao_id = v_id;
    res := res || pg_temp.t(v_bool, 'R25 as parcelas renegociadas do acordo herdam a cota de 25%', v_bool);

    -- ===================== arquivar e mês fechado =====================
    etapa := 'arquivar';
    v_txt := pg_temp.erro(format($q$select public.arquivar_contrato(%L, 'Encerrado')$q$, c_cent));
    res := res || pg_temp.t(v_txt like '%repasse ao cliente pendente%', 'R26 contrato quitado com repasse pendente não se arquiva', v_txt);
    perform public.registrar_repasse(jsonb_build_object('recebimento_id', r_cent, 'data', '2026-10-16'));
    perform public.arquivar_contrato(c_cent, 'Encerrado');
    select ciclo into v_txt from public.v_contratos where id = c_cent;
    res := res || pg_temp.t(v_txt = 'arquivado', 'R27 com o repasse feito, o contrato quitado se arquiva', v_txt);

    perform pg_temp.como(u_admin);
    perform public.fechar_mes('2026-09-01');
    select (totais ->> 'repasses')::numeric into v_num from public.fechamentos where competencia = '2026-09-01';
    res := res || pg_temp.t(v_num = 3500, 'R28 a foto do mês fechado guarda os repasses', v_num);
    perform pg_temp.como(u_sec);
    v_txt := pg_temp.erro(format($q$select public.estornar_repasse(%L, 'tarde demais')$q$, v_rep2));
    res := res || pg_temp.t(v_txt like '%está fechado%', 'R29 repasse de mês fechado não se estorna', v_txt);

    select count(*) into v_num from public.auditoria where tabela = 'repasses_cliente';
    res := res || pg_temp.t(v_num >= 4, 'R30 cada repasse e cada estorno ficam no histórico, visíveis a quem lança', v_num);
    select bool_and(valor_escritorio + valor_repasse = valor) into v_bool from public.v_recebimentos;
    res := res || pg_temp.t(v_bool, 'R31 em todo recebimento, escritório + cliente = valor recebido', v_bool);

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

select * from pg_temp.testar_honorarios();
