-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Correções da caça a bugs nas funções de 19/10
-- =============================================================================
--
-- Migração 20261019180000. Tudo acontece num bloco desfeito no fim: nada fica
-- gravado. Não rode em produção — rode com `npm run banco:test` (PostgreSQL
-- isolado).
--
-- Identidades simuladas pelo JWT: administrador (Vinícius) e um associado sem
-- Clientes, Prazos nem Financeiro.

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

create or replace function pg_temp.testar_correcoes()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  u_assoc  uuid := gen_random_uuid();
  v_cli    uuid;
  c_misto  uuid;
  c_cent   uuid;
  c_arq    uuid;
  v_parc   uuid;
  v_rec    uuid;
  v_rep    uuid;
  v_ids    jsonb;
  v_txt    text;
  v_num    numeric;
  v_num2   numeric;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'cc-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_assoc, 'cc-assoc@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'cc-admin@teste.local' where nome_curto = 'Vinícius';
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Associado Teste', 'Associado', 'cc-assoc@teste.local', 'associado', 'propria', 'nenhum');
    perform pg_temp.como(u_admin);
    perform public.iniciar_sessao();
    perform pg_temp.como(u_assoc);
    perform public.iniciar_sessao();

    perform pg_temp.como(u_admin);
    insert into public.clientes (nome, documento, email) values ('Cliente Sigiloso', '12345678909', 'sigilo@teste.local')
      returning id into v_cli;

    -- =================== histórico de cliente ===================
    etapa := 'histórico';
    select count(*) into v_num from public.auditoria where tabela = 'clientes' and registro_id = v_cli;
    res := res || pg_temp.t(v_num > 0, 'C01 o administrador vê no histórico o cadastro do cliente', v_num);
    perform pg_temp.como(u_assoc);
    select count(*) into v_num from public.auditoria where tabela = 'clientes';
    res := res || pg_temp.t(v_num = 0, 'C02 quem não lê Clientes não vê CPF nem e-mail de cliente pelo histórico', v_num);
    perform pg_temp.como(u_admin);

    -- ============= renegociação: fixo e êxito separados =============
    etapa := 'renegociação';
    c_misto := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Misto para renegociar', 'tipo_honorario', 'misto',
      'valor_total', 1000, 'exito_pct', 30, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-10', 'valor', 1000))));
    perform public.apurar_exito(jsonb_build_object(
      'contrato_id', c_misto, 'valor_total', 600,
      'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 600))));
    select jsonb_agg(id) into v_ids from public.parcelas where contrato_id = c_misto;
    v_txt := pg_temp.erro(format($q$select public.renegociar(jsonb_build_object('contrato_id', %L, 'motivo', 'tudo junto',
      'parcelas', %L::jsonb, 'novas', jsonb_build_array(jsonb_build_object('vencimento', '2027-01-10', 'valor', 1600))))$q$,
      c_misto, v_ids));
    res := res || pg_temp.t(v_txt like '%fixo e do êxito não se renegociam juntas%',
      'C03 parcelas do fixo e do êxito não se renegociam juntas', v_txt);

    select jsonb_agg(id) into v_ids from public.parcelas where contrato_id = c_misto and parte = 'exito';
    perform public.renegociar(jsonb_build_object('contrato_id', c_misto, 'motivo', 'só o êxito', 'parcelas', v_ids,
      'novas', jsonb_build_array(jsonb_build_object('vencimento', '2027-01-10', 'valor', 300),
                                 jsonb_build_object('vencimento', '2027-02-10', 'valor', 300))));
    select string_agg(distinct parte, ',') into v_txt
      from public.parcelas where contrato_id = c_misto and origem_renegociacao_id is not null;
    res := res || pg_temp.t(v_txt = 'exito', 'C04 renegociar só o êxito mantém as novas como êxito', v_txt);

    -- ============== acordo pago em partes: centavo certo ==============
    etapa := 'centavos';
    c_cent := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo em partes', 'valor_total', 333.33, 'cota_escritorio_pct', 30,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-10-01', 'valor', 333.33))));
    select id into v_parc from public.parcelas where contrato_id = c_cent;
    for i in 1..3 loop
      insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
        values (v_parc, '2026-10-05', 111.11, 111.11, 0);
    end loop;
    select string_agg((valor - valor_repasse)::text, '+' order by criado_em, id), sum(valor - valor_repasse), sum(valor_repasse)
      into v_txt, v_num, v_num2 from public.recebimentos where parcela_id = v_parc;
    res := res || pg_temp.t(v_num = 100.00 and v_num2 = 233.33,
      'C05 três pagamentos de 111,11 a 30% somam 100,00 do escritório, como a parcela inteira', v_txt || ' = ' || v_num || ' / cliente ' || v_num2);
    select exigivel_escritorio into v_num from public.v_parcelas where id = v_parc;
    res := res || pg_temp.t(v_num = 100.00, 'C06 e batem com o exigível do escritório na parcela', v_num);

    c_arq := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo de mil', 'valor_total', 1000, 'cota_escritorio_pct', 30,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-10-01', 'valor', 1000))));
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      select id, '2026-10-05', 1000, 1000, 0 from public.parcelas where contrato_id = c_arq
      returning id into v_rec;
    select valor_repasse into v_num from public.recebimentos where id = v_rec;
    res := res || pg_temp.t(v_num = 700, 'C07 recebimento inteiro continua 30% / 70%', v_num);

    -- ============== repasse em contrato arquivado ==============
    etapa := 'arquivado';
    v_rep := public.registrar_repasse(jsonb_build_object('recebimento_id', v_rec, 'data', '2026-10-06'));
    perform public.arquivar_contrato(c_arq, 'quitado e repassado');
    v_txt := pg_temp.erro(format($q$select public.estornar_repasse(%L, 'engano')$q$, v_rep));
    res := res || pg_temp.t(v_txt like '%desarquive antes de estornar o repasse%',
      'C08 repasse de contrato arquivado não se estorna sem desarquivar', v_txt);
    select repasse_pendente into v_num from public.v_contratos where id = c_arq;
    res := res || pg_temp.t(v_num = 0, 'C09 o contrato arquivado segue sem repasse pendente', v_num);

    -- ============== duas casas, sem arredondar calado ==============
    etapa := 'duas casas';
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Cota longa', 'valor_total', 1000, 'cota_escritorio_pct', 99.999,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-01', 'valor', 1000))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%cota do escritório aceita até duas casas%',
      'C10 cota 99,999% é recusada (antes virava 100% e o repasse sumia)', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Êxito longo', 'tipo_honorario', 'exito', 'exito_pct', 12.345))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%percentual de êxito aceita até duas casas%',
      'C11 percentual de êxito 12,345% é recusado', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Parcelas longas', 'valor_total', 1000, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'vencimento', '2026-11-01', 'valor', 333.333),
        jsonb_build_object('numero', 2, 'vencimento', '2026-12-01', 'valor', 333.333),
        jsonb_build_object('numero', 3, 'vencimento', '2027-01-01', 'valor', 333.334))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%duas casas decimais%',
      'C12 parcela com três casas é recusada (antes o plano nascia com 0,01 de diferença)', v_txt);

    c_misto := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Êxito para apurar', 'tipo_honorario', 'exito', 'exito_pct', 30));
    v_txt := pg_temp.erro(format($q$select public.apurar_exito(jsonb_build_object('contrato_id', %L, 'valor_total', 300,
      'base', -5, 'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 300))))$q$, c_misto));
    res := res || pg_temp.t(v_txt like '%base do êxito não pode ser negativa%', 'C13 base de êxito negativa é recusada', v_txt);
    v_txt := pg_temp.erro(format($q$select public.apurar_exito(jsonb_build_object('contrato_id', %L, 'valor_total', 1000,
      'cota_escritorio_pct', 33.333, 'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 1000))))$q$, c_misto));
    res := res || pg_temp.t(v_txt like '%cota do escritório aceita até duas casas%', 'C14 cota de 33,333% na apuração é recusada', v_txt);
    perform public.apurar_exito(jsonb_build_object('contrato_id', c_misto, 'valor_total', 1000, 'cota_escritorio_pct', 33.33,
      'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 1000))));
    select exigivel_escritorio_total into v_num from public.v_contratos where id = c_misto;
    res := res || pg_temp.t(v_num = 333.30, 'C15 cota de 33,33% com duas casas segue aceita', v_num);

    -- ============ fechamento anual: saldo previsto do escritório ============
    etapa := 'anual';
    j := public.previa_fechamento_anual(2026) -> 'totais';
    res := res || pg_temp.t((j ->> 'receitas_previstas_escritorio')::numeric < (j ->> 'receitas_previstas')::numeric,
      'C16 a receita prevista do escritório deixa de fora a parte dos clientes nos acordos', j);
    res := res || pg_temp.t((j ->> 'saldo_previsto')::numeric
                              = (j ->> 'receitas_previstas_escritorio')::numeric - (j ->> 'despesas_previstas')::numeric,
      'C17 saldo previsto do ano = receita do escritório − despesas previstas, como no painel', j);

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

select * from pg_temp.testar_correcoes();
