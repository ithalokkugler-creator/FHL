-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Pedidos do Vinícius (22/10): antecipação de parcelas e documentos
-- solicitados/entregues no processo
-- =============================================================================
--
-- Migração 20261022120000. Tudo acontece num bloco desfeito no fim: nada fica
-- gravado. Não rode em produção — rode com `npm run banco:test` (PostgreSQL
-- isolado).

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

-- O lançamento que quita a parcela, como a tela manda.
create or replace function pg_temp.pagamento(p_parcela uuid, p_data date, p_principal numeric, p_excedente numeric,
                                             p_encargos numeric default 0)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'recebimento', jsonb_build_object('parcela_id', p_parcela, 'data', p_data, 'valor', p_principal + p_encargos,
                                      'valor_principal', p_principal, 'valor_encargos', p_encargos,
                                      'valor_multa', p_encargos, 'valor_juros', 0, 'valor_correcao', 0, 'valor_acrescimo', 0,
                                      'observacao', 'Pix do cliente'),
    'excedente', p_excedente)
$$;

create or replace function pg_temp.testar_antecipacao_documentos()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  hoje     date := privado.hoje();
  retrasado date := (date_trunc('month', privado.hoje()) - interval '2 months')::date;
  u_admin  uuid := gen_random_uuid();
  u_cons   uuid := gen_random_uuid();
  u_cli    uuid := gen_random_uuid();
  m_cons   uuid := gen_random_uuid();
  m_cli    uuid := gen_random_uuid();
  v_cli    uuid;
  c1       uuid;
  c2       uuid;
  c_acordo uuid;
  c_misto  uuid;
  c_pass   uuid;
  c_fech   uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  v_r1     uuid;
  v_r2     uuid;
  v_filho  uuid;
  v_parc   uuid;
  v_proc   uuid;
  v_doc    uuid;
  v_doc2   uuid;
  v_antes  integer;
  v_txt    text;
  v_num    numeric;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'an-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_cons, 'an-consulta@teste.local', now(), 'authenticated', 'authenticated'),
      (u_cli, 'an-clientes@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'an-admin@teste.local' where nome_curto = 'Vinícius';
    insert into public.membros (id, user_id, nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro, acesso_clientes, acesso_prazos) values
      (m_cons, u_cons, 'Consulta do teste', 'ConsT', 'an-consulta@teste.local', 'associado', 'nenhum', 'consulta', 'nenhum', 'nenhum'),
      (m_cli, u_cli, 'Clientes do teste', 'CliT', 'an-clientes@teste.local', 'associado', 'nenhum', 'nenhum', 'editar', 'nenhum');
    perform pg_temp.como(u_admin);
    perform public.iniciar_sessao();
    insert into public.clientes (nome) values ('Cliente da Antecipação') returning id into v_cli;

    -- 4 × 500: a 1ª vencida há 5 dias, as outras a vencer.
    c1 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Mensal 4 × 500', 'valor_total', 2000, 'data_contrato', hoje - 30,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', hoje - 5, 'valor', 500),
        jsonb_build_object('numero', 2, 'vencimento', hoje + 25, 'valor', 500),
        jsonb_build_object('numero', 3, 'vencimento', hoje + 55, 'valor', 500),
        jsonb_build_object('numero', 4, 'vencimento', hoje + 85, 'valor', 500))));
    select id into p1 from public.parcelas where contrato_id = c1 and numero = 1;
    select id into p2 from public.parcelas where contrato_id = c1 and numero = 2;
    select id into p3 from public.parcelas where contrato_id = c1 and numero = 3;
    select id into p4 from public.parcelas where contrato_id = c1 and numero = 4;

    -- ============ 1 · o exemplo do Vinícius: 750 numa parcela de 500 ============
    etapa := 'exemplo';
    j := public.receber_com_antecipacao(pg_temp.pagamento(p1, hoje, 500, 250));
    v_r1 := (j ->> 'id')::uuid;
    res := res || pg_temp.t((j ->> 'total')::numeric = 750 and jsonb_array_length(j -> 'antecipacoes') = 1
                              and (j -> 'antecipacoes' -> 0 ->> 'numero')::int = 4
                              and (j -> 'antecipacoes' -> 0 ->> 'valor')::numeric = 250,
      'A01 750 numa parcela de 500: quita a parcela e antecipa 250 na ÚLTIMA (a 4ª)', j);
    select string_agg(numero || ':' || situacao || ':' || saldo, ' ' order by numero) into v_txt
      from public.v_parcelas where contrato_id = c1;
    res := res || pg_temp.t(v_txt = '1:paga:0.00 2:a_vencer:500.00 3:a_vencer:500.00 4:a_vencer:250.00',
      'A02 a 1ª fica paga, a 4ª com 250 em aberto, a 2ª e a 3ª intactas', v_txt);
    select count(*) || ' | ' || min(valor) || ' | ' || (min(data) = hoje)::text || ' | ' || (min(parcela_id::text) = p4::text)::text
      into v_txt from public.recebimentos where antecipacao_de = v_r1;
    res := res || pg_temp.t(v_txt = '1 | 250.00 | true | true', 'A03 a parte antecipada é um recebimento na 4ª, na mesma data, ligado ao pagamento', v_txt);
    select observacao || ' | ' || descricao into v_txt from public.recebimentos where id = v_r1;
    res := res || pg_temp.t(v_txt = 'Pix do cliente | Pagamento de R$ 750,00 com R$ 250,00 antecipados (parcela 4)',
      'A04 a observação fica com o que a pessoa digitou; a descrição diz o total e para onde foi a antecipação', v_txt);
    select coalesce(observacao, '∅') || ' | ' || descricao into v_txt from public.recebimentos where antecipacao_de = v_r1;
    res := res || pg_temp.t(v_txt = '∅ | Antecipação: parte do pagamento de R$ 750,00 da parcela 1 em ' || to_char(hoje, 'DD/MM/YYYY'),
      'A05 a parte antecipada diz de qual pagamento veio', v_txt);
    select descricao into v_txt from public.v_movimentacoes_financeiras where origem = 'recebimento'
       and origem_id = (select id from public.recebimentos where antecipacao_de = v_r1);
    res := res || pg_temp.t(v_txt = 'Cliente da Antecipação · antecipação', 'A05b no extrato da conta, a parte antecipada vem marcada', v_txt);
    select descricao into v_txt from public.v_movimentacoes_financeiras where origem = 'recebimento' and origem_id = v_r1;
    res := res || pg_temp.t(v_txt = 'Cliente da Antecipação', 'A05c o pagamento continua com o nome do cliente', v_txt);
    select (antecipacao_de = v_r1)::text || ' | ' || valor_repasse || ' | ' || coalesce(conta_financeira_id::text, '∅')
      into v_txt from public.v_recebimentos where parcela_id = p4;
    res := res || pg_temp.t(v_txt like 'true | 0.00 | %' and v_txt not like '%∅%',
      'A06 na consulta de recebimentos: a origem, sem repasse, na mesma conta do pagamento', v_txt);
    select recebido into v_num from public.v_contratos where id = c1;
    res := res || pg_temp.t(v_num = 750, 'A07 o contrato conta os 750 como recebidos', v_num);

    -- ============ 2 · de trás para frente, quitando e abatendo ============
    etapa := 'de trás para frente';
    j := public.receber_com_antecipacao(pg_temp.pagamento(p2, hoje, 500, 600));
    v_r2 := (j ->> 'id')::uuid;
    select string_agg((a ->> 'numero') || ':' || (a ->> 'valor'), ' ' order by o) into v_txt
      from jsonb_array_elements(j -> 'antecipacoes') with ordinality as x(a, o);
    res := res || pg_temp.t(v_txt = '4:250.00 3:350.00', 'A08 600 a mais: quita os 250 da 4ª e abate 350 da 3ª', v_txt);
    select descricao into v_txt from public.recebimentos where id = v_r2;
    res := res || pg_temp.t(v_txt = 'Pagamento de R$ 1.100,00 com R$ 600,00 antecipados (parcelas 4 e 3)',
      'A08b valores com ponto de milhar e as parcelas na ordem em que foram abatidas', v_txt);
    select string_agg(numero || ':' || situacao || ':' || saldo, ' ' order by numero) into v_txt
      from public.v_parcelas where contrato_id = c1;
    res := res || pg_temp.t(v_txt = '1:paga:0.00 2:paga:0.00 3:a_vencer:150.00 4:paga:0.00',
      'A09 2ª e 4ª pagas, a 3ª com 150 em aberto', v_txt);

    -- O que sobra além das próximas parcelas não vira nada: recusa tudo.
    select count(*) into v_antes from public.recebimentos;
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(p3, hoje, 150, 100)));
    res := res || pg_temp.t(v_txt like '%passa em R$ 100,00 o que falta pagar nas próximas parcelas%',
      'A10 sem parcela a vencer para receber o excedente, recusa e diz quanto passou', v_txt);
    res := res || pg_temp.t((select count(*) from public.recebimentos) = v_antes, 'A11 e não grava nada', v_antes);

    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(p3, hoje, 100, 50)));
    res := res || pg_temp.t(v_txt like '%precisa quitar esta parcela primeiro (saldo de R$ 150,00)%',
      'A12 pagamento que não quita a parcela não antecipa', v_txt);
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(p3, hoje, 150, 0)));
    res := res || pg_temp.t(v_txt like '22023%', 'A13 sem excedente não é antecipação', v_txt);
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(p2, hoje, 500, 50)));
    res := res || pg_temp.t(v_txt like '%Esta parcela já está paga (talvez em outra tela)%', 'A13b parcela já paga (outra tela): mensagem clara', v_txt);

    -- ============ 3 · estorno: a parte antecipada vai junto ============
    etapa := 'estorno';
    v_txt := pg_temp.erro(format($q$update public.recebimentos set estornado_em = now(), motivo_estorno = 'só um pedaço'
      where antecipacao_de = %L and parcela_id = %L$q$, v_r2, p3));
    res := res || pg_temp.t(v_txt like '%Esta parte é antecipação de outro pagamento%', 'A14 a parte antecipada não se estorna sozinha', v_txt);
    update public.recebimentos set estornado_em = now(), motivo_estorno = 'valor lançado errado' where id = v_r2;
    select count(*) filter (where estornado_em is not null) || '/' || count(*) || ' | '
           || min(motivo_estorno) into v_txt from public.recebimentos where antecipacao_de = v_r2;
    res := res || pg_temp.t(v_txt = '2/2 | Estorno do pagamento de origem: valor lançado errado',
      'A15 estornar o pagamento estorna junto as duas partes antecipadas, com o motivo', v_txt);
    select string_agg(numero || ':' || saldo, ' ' order by numero) into v_txt from public.v_parcelas where contrato_id = c1;
    res := res || pg_temp.t(v_txt = '1:0.00 2:500.00 3:500.00 4:250.00',
      'A16 os saldos voltam ao que eram antes daquele pagamento (a 1ª antecipação continua)', v_txt);
    select count(*) || ' | ' || min(titulo) into v_txt from public.eventos_alerta where tipo = 'estorno' and registro_id in (
      select id from public.recebimentos where id = v_r2 or antecipacao_de = v_r2);
    res := res || pg_temp.t(v_txt = '1 | Estorno de R$ 1100,00', 'A17 um alerta só, o do pagamento, com o total (as partes não repetem)', v_txt);

    -- ============ 4 · a regra vale também para quem grava direto ============
    etapa := 'gatilho';
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, antecipacao_de)
      values (p3, hoje, 10, 10, 0, v_r1) returning id into v_filho;
    res := res || pg_temp.t(v_filho is not null, 'A18 parte antecipada válida gravada direto é aceita', v_filho);
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, antecipacao_de)
      values (%L, %L, 10, 10, 0, %L)$q$, p3, hoje - 1, v_r1));
    res := res || pg_temp.t(v_txt like '%na data do pagamento%', 'A19 em outra data que não a do pagamento: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, antecipacao_de)
      values (%L, %L, 10, 10, 0, %L)$q$, p3, hoje, v_filho));
    res := res || pg_temp.t(v_txt like '%pagamento de parcela válido%', 'A20 antecipação de antecipação: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, antecipacao_de)
      values (%L, %L, 10, 10, 0, %L)$q$, p3, hoje, v_r2));
    res := res || pg_temp.t(v_txt like '%pagamento de parcela válido%', 'A21 de pagamento estornado: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, valor_multa, antecipacao_de)
      values (%L, %L, 15, 10, 5, 5, %L)$q$, p3, hoje, v_r1));
    res := res || pg_temp.t(v_txt like '%sem encargos%', 'A22 antecipação com encargos: recusa', v_txt);

    c2 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Outro contrato', 'valor_total', 1000, 'data_contrato', hoje - 30,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', hoje - 2, 'valor', 500),
        jsonb_build_object('numero', 2, 'vencimento', hoje + 28, 'valor', 500))));
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, antecipacao_de)
      select id, %L, 10, 10, 0, %L from public.parcelas where contrato_id = %L and numero = 2$q$, hoje, v_r1, c2));
    res := res || pg_temp.t(v_txt like '%mesmo contrato e do mesmo grupo%', 'A23 para parcela de outro contrato: recusa', v_txt);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, hoje, 200, 200, 0 from public.parcelas where contrato_id = c2 and numero = 1 returning id into v_r2;
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, antecipacao_de)
      select id, %L, 10, 10, 0, %L from public.parcelas where contrato_id = %L and numero = 2$q$, hoje, v_r2, c2));
    res := res || pg_temp.t(v_txt like '%quitou a parcela dele%', 'A24 de pagamento parcial (que não quitou a parcela): recusa', v_txt);

    -- O caminho de sempre continua igual.
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (%L, %L, 600, 600, 0)$q$, p2, hoje));
    res := res || pg_temp.t(v_txt like '%passa do saldo da parcela%', 'A25 sem antecipação, o que passa do saldo continua recusado', v_txt);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (p2, hoje, 100, 100, 0) returning id into v_r2;
    select coalesce(antecipacao_de::text, '∅') || ' | ' || saldo into v_txt
      from public.recebimentos r join public.v_parcelas vp on vp.id = r.parcela_id where r.id = v_r2;
    res := res || pg_temp.t(v_txt = '∅ | 400.00', 'A26 pagamento parcial comum segue como antes', v_txt);
    update public.recebimentos set estornado_em = now(), motivo_estorno = 'teste de estorno comum' where id = v_r2;
    select saldo into v_num from public.v_parcelas where id = p2;
    res := res || pg_temp.t(v_num = 500, 'A27 estorno comum (sem antecipação) segue como antes', v_num);

    -- Estornar o primeiro pagamento leva as duas partes dele (a da tela e a gravada direto).
    update public.recebimentos set estornado_em = now(), motivo_estorno = 'cliente desistiu' where id = v_r1;
    select count(*) filter (where estornado_em is not null) || '/' || count(*) into v_txt from public.recebimentos where antecipacao_de = v_r1;
    res := res || pg_temp.t(v_txt = '2/2', 'A28 estorno leva todas as partes do pagamento', v_txt);
    select string_agg(numero || ':' || saldo, ' ' order by numero) into v_txt from public.v_parcelas where contrato_id = c1;
    res := res || pg_temp.t(v_txt = '1:500.00 2:500.00 3:500.00 4:500.00', 'A29 o contrato volta inteiro em aberto', v_txt);

    -- ============ 5 · acordo, fixo + êxito, data passada, mês fechado, acesso ============
    etapa := 'acordo';
    c_acordo := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo 30%', 'valor_total', 2000, 'cota_escritorio_pct', 30, 'data_contrato', hoje - 30,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', hoje - 1, 'valor', 1000),
        jsonb_build_object('numero', 2, 'vencimento', hoje + 29, 'valor', 1000))));
    select id into v_parc from public.parcelas where contrato_id = c_acordo and numero = 1;
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(v_parc, hoje, 1000, 200)));
    res := res || pg_temp.t(v_txt like '%Parcela de acordo%', 'A30 acordo (com parte do cliente) não tem antecipação', v_txt);

    etapa := 'misto';
    c_misto := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Fixo + êxito', 'tipo_honorario', 'misto', 'valor_total', 1000, 'exito_pct', 20,
      'data_contrato', hoje - 30,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', hoje - 3, 'valor', 500),
        jsonb_build_object('numero', 2, 'vencimento', hoje + 27, 'valor', 500))));
    perform public.apurar_exito(jsonb_build_object('contrato_id', c_misto, 'valor_total', 2000,
      'parcelas', jsonb_build_array(jsonb_build_object('vencimento', hoje + 40, 'valor', 1000),
                                    jsonb_build_object('vencimento', hoje + 70, 'valor', 1000))));
    select id into v_parc from public.parcelas where contrato_id = c_misto and numero = 1;
    perform public.receber_com_antecipacao(pg_temp.pagamento(v_parc, hoje, 500, 300));
    select string_agg(numero || ':' || parte || ':' || saldo, ' ' order by numero) into v_txt
      from public.v_parcelas where contrato_id = c_misto;
    res := res || pg_temp.t(v_txt = '1:fixo:0.00 2:fixo:200.00 3:exito:1000.00 4:exito:1000.00',
      'A31 fixo + êxito: o excedente do fixo abate a última do FIXO, nunca o êxito', v_txt);

    etapa := 'data passada';
    c_pass := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Pagamento lançado depois', 'valor_total', 1500, 'data_contrato', hoje - 60,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', hoje - 12, 'valor', 500),
        jsonb_build_object('numero', 2, 'vencimento', hoje - 1, 'valor', 500),
        jsonb_build_object('numero', 3, 'vencimento', hoje + 20, 'valor', 500))));
    select id into v_parc from public.parcelas where contrato_id = c_pass and numero = 1;
    perform public.receber_com_antecipacao(pg_temp.pagamento(v_parc, hoje - 10, 500, 600, 15));
    select string_agg(numero || ':' || saldo, ' ' order by numero) into v_txt from public.v_parcelas where contrato_id = c_pass;
    res := res || pg_temp.t(v_txt = '1:0.00 2:400.00 3:0.00',
      'A32 pagamento de 10 dias atrás (com multa): antecipa a 3ª e a 2ª, que vencia depois daquela data', v_txt);
    select valor_encargos || ' | ' || valor into v_txt from public.recebimentos
     where parcela_id = v_parc and antecipacao_de is null and estornado_em is null;
    res := res || pg_temp.t(v_txt = '15.00 | 515.00', 'A33 a multa do dia fica no pagamento da parcela, não na antecipação', v_txt);

    etapa := 'mês fechado';
    c_fech := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Mês fechado', 'valor_total', 1000, 'data_contrato', retrasado,
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', retrasado + 5, 'valor', 500),
        jsonb_build_object('numero', 2, 'vencimento', hoje + 30, 'valor', 500))));
    perform public.fechar_mes(retrasado);
    select id into v_parc from public.parcelas where contrato_id = c_fech and numero = 1;
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(v_parc, retrasado + 10, 500, 100)));
    res := res || pg_temp.t(v_txt like '%está fechado%', 'A34 em mês fechado, nem o pagamento nem a antecipação entram', v_txt);

    etapa := 'acesso';
    select id into v_parc from public.parcelas where contrato_id = c2 and numero = 1;
    perform pg_temp.como(u_cons);
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(v_parc, hoje, 500, 100)));
    res := res || pg_temp.t(v_txt like '42501%', 'A35 Financeiro só de consulta não lança antecipação', v_txt);
    perform pg_temp.como(u_cli);
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(v_parc, hoje, 500, 100)));
    res := res || pg_temp.t(v_txt like '42501%', 'A36 sem Financeiro não lança antecipação', v_txt);
    perform pg_temp.como('00000000-0000-0000-0000-000000000000', 'anon');
    v_txt := pg_temp.erro(format($q$select public.receber_com_antecipacao(%L::jsonb)$q$, pg_temp.pagamento(v_parc, hoje, 500, 100)));
    res := res || pg_temp.t(v_txt like '42501%', 'A37 anônimo nem chega à função', v_txt);
    perform pg_temp.como(u_admin);

    -- ============ 6 · documentos solicitados e entregues no processo ============
    etapa := 'documentos';
    insert into public.processos (cliente_id, titulo, area, orgao, situacao)
      values (v_cli, 'Usucapião', 'imobiliario', 'Cartório de Registro de Imóveis de Paranaguá', 'aguardando_documentos')
      returning id into v_proc;
    insert into public.processos_documentos (processo_id, documento, movimento, data, quem_recebeu, retorno_previsto)
      values (v_proc, '  Certidão de matrícula do imóvel  ', 'solicitado', hoje - 3, ' Ana, do balcão ', hoje + 7)
      returning id into v_doc;
    select documento || ' | ' || quem_recebeu || ' | ' || (cliente_id = v_cli)::text || ' | ' || (criado_por is not null)::text
      into v_txt from public.processos_documentos where id = v_doc;
    res := res || pg_temp.t(v_txt = 'Certidão de matrícula do imóvel | Ana, do balcão | true | true',
      'D01 registra o documento: cliente do processo, textos sem sobra, quem registrou', v_txt);
    insert into public.processos_documentos (processo_id, documento, movimento, data, quem_recebeu)
      values (v_proc, 'Planta e memorial descritivo', 'entregue', hoje, 'Cartório') returning id into v_doc2;
    select string_agg(movimento, ',' order by data) into v_txt from public.v_processos_documentos where processo_id = v_proc;
    res := res || pg_temp.t(v_txt = 'solicitado,entregue', 'D02 solicitado e entregue, na consulta com o processo', v_txt);
    select processo_titulo || ' | ' || cliente_nome into v_txt from public.v_processos_documentos where id = v_doc;
    res := res || pg_temp.t(v_txt = 'Usucapião | Cliente da Antecipação', 'D03 a consulta traz o processo e o cliente', v_txt);

    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data) values (%L, '   ', %L)$q$, v_proc, hoje));
    res := res || pg_temp.t(v_txt like '%Informe o documento%', 'D04 sem o documento: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data) values (%L, 'X', %L)$q$, v_proc, hoje + 1));
    res := res || pg_temp.t(v_txt like '%não pode estar no futuro%', 'D05 data no futuro: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data, retorno_previsto) values (%L, 'X', %L, %L)$q$,
      v_proc, hoje, hoje - 1));
    res := res || pg_temp.t(v_txt like '%retorno previsto não pode ser antes%', 'D06 retorno previsto antes do registro: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data) values (%L, 'X', '0202-10-22')$q$, v_proc));
    res := res || pg_temp.t(v_txt like '%Confira o ano da data%', 'D06b ano digitado errado na data (0202): recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data, retorno_previsto) values (%L, 'X', %L, '20261-10-22')$q$, v_proc, hoje));
    res := res || pg_temp.t(v_txt like '%Confira o ano do prazo%', 'D06c ano digitado errado no prazo (20261): recusa', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data, movimento) values (%L, 'X', %L, 'perdido')$q$, v_proc, hoje));
    res := res || pg_temp.t(v_txt like '23514%', 'D07 só "solicitado" ou "entregue"', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data, cliente_id) values (%L, 'X', %L, %L)$q$, v_proc, hoje, v_cli));
    res := res || pg_temp.t(v_txt like '42501%', 'D08 o cliente não se informa: vem do processo', v_txt);

    update public.processos_documentos set retornou_em = hoje where id = v_doc;
    select retornou_em::text into v_txt from public.processos_documentos where id = v_doc;
    res := res || pg_temp.t(v_txt = hoje::text, 'D09 registra o retorno', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos_documentos set retornou_em = %L where id = %L$q$, hoje + 1, v_doc2));
    res := res || pg_temp.t(v_txt like '%retorno não pode estar no futuro%', 'D10 retorno no futuro: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos_documentos set retornou_em = %L where id = %L$q$, hoje - 1, v_doc2));
    res := res || pg_temp.t(v_txt like '%retorno não pode ser antes%', 'D11 retorno antes do registro: recusa', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos_documentos set processo_id = %L where id = %L$q$, v_proc, v_doc2));
    res := res || pg_temp.t(v_txt like '42501%', 'D12 o documento não muda de processo', v_txt);

    v_txt := pg_temp.erro(format($q$update public.processos_documentos set cancelado_em = now() where id = %L$q$, v_doc2));
    res := res || pg_temp.t(v_txt like '%Informe o motivo do cancelamento%', 'D13 cancelar pede motivo', v_txt);
    update public.processos_documentos set cancelado_em = now(), motivo_cancelamento = 'registrado no processo errado' where id = v_doc2;
    v_txt := pg_temp.erro(format($q$update public.processos_documentos set documento = 'Outro' where id = %L$q$, v_doc2));
    res := res || pg_temp.t(v_txt like '%cancelado não pode ser alterado%', 'D14 cancelado não se altera', v_txt);
    v_txt := pg_temp.erro(format($q$delete from public.processos_documentos where id = %L$q$, v_doc));
    res := res || pg_temp.t(v_txt like '42501%' or v_txt like '%não são apagados%', 'D15 nada se apaga', v_txt);
    select count(*)::text into v_txt from public.auditoria where tabela = 'processos_documentos' and registro_id in (v_doc, v_doc2);
    res := res || pg_temp.t(v_txt::int >= 4, 'D16 criar, retornar e cancelar ficam no histórico', v_txt);
    res := res || pg_temp.t(privado.pode_ver_auditoria('processos_documentos', v_doc), 'D17 quem edita Clientes vê o histórico', true);

    perform pg_temp.como(u_cli);
    select count(*)::text into v_txt from public.processos_documentos where processo_id = v_proc;
    res := res || pg_temp.t(v_txt = '2', 'D18 equipe de Clientes (sem Financeiro) vê os documentos', v_txt);
    insert into public.processos_documentos (processo_id, documento, data) values (v_proc, 'RG do cliente', hoje)
      returning id into v_doc2;
    res := res || pg_temp.t(v_doc2 is not null, 'D19 e registra', v_doc2);
    perform pg_temp.como(u_cons);
    select count(*)::text into v_txt from public.processos_documentos;
    res := res || pg_temp.t(v_txt = '0', 'D20 sem acesso a Clientes não vê nenhum', v_txt);
    select count(*)::text into v_txt from public.v_processos_documentos;
    res := res || pg_temp.t(v_txt = '0', 'D21 nem pela consulta', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_documentos (processo_id, documento, data) values (%L, 'Intruso', %L)$q$, v_proc, hoje));
    res := res || pg_temp.t(v_txt like '42501%', 'D22 nem registra', v_txt);
    res := res || pg_temp.t(not privado.pode_ver_auditoria('processos_documentos', v_doc), 'D23 nem vê o histórico', false);
    perform pg_temp.como('00000000-0000-0000-0000-000000000000', 'anon');
    v_txt := pg_temp.erro('select count(*) from public.processos_documentos');
    res := res || pg_temp.t(v_txt like '42501%', 'D24 anônimo não lê a tabela', v_txt);
    perform pg_temp.como(u_admin);

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

select * from pg_temp.testar_antecipacao_documentos();
