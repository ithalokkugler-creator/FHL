-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Acordo: parte do cliente paga direto a ele e cota própria em multa e juros
-- =============================================================================
--
-- Migração 20261020120000 (respostas dos advogados de 20/10/2026). Tudo
-- acontece num bloco desfeito no fim: nada fica gravado. Não rode em produção
-- — rode com `npm run banco:test` (PostgreSQL isolado).

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

create or replace function pg_temp.testar_acordo_direto()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  v_cli    uuid;
  c_dir    uuid;
  c_mix    uuid;
  c_fixo   uuid;
  c_enc    uuid;
  c_enc2   uuid;
  c_exito  uuid;
  v_parc   uuid;
  v_rec    uuid;
  v_rec2   uuid;
  v_ids    jsonb;
  v_txt    text;
  v_num    numeric;
  v_num2   numeric;
  j        jsonb;
  r        record;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'ad-admin@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'ad-admin@teste.local' where nome_curto = 'Vinícius';
    perform pg_temp.como(u_admin);
    perform public.iniciar_sessao();
    insert into public.clientes (nome) values ('Cliente do Acordo Direto') returning id into v_cli;

    -- ============ 1 · parte do cliente paga direto a ele ============
    etapa := 'direto';
    c_dir := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo pago direto', 'valor_total', 1000, 'cota_escritorio_pct', 30,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-10-01', 'valor', 1000))));
    select id into v_parc from public.parcelas where contrato_id = c_dir;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, direto_ao_cliente)
      values (v_parc, '2026-10-05', 1000, 1000, 0, true) returning id into v_rec;
    select valor || ' / ' || valor_direto_cliente || ' / ' || valor_repasse into v_txt from public.recebimentos where id = v_rec;
    res := res || pg_temp.t(v_txt = '300.00 / 700.00 / 0.00',
      'D01 pago direto ao cliente: no caixa entram 300 (30%), 700 foram ao cliente, sem repasse', v_txt);
    select situacao || ':' || saldo into v_txt from public.v_parcelas where id = v_parc;
    res := res || pg_temp.t(v_txt = 'paga:0.00', 'D02 a parcela de 1.000 fica paga (o bruto abateu)', v_txt);
    select repasse_situacao || ':' || valor_escritorio || ':' || valor_direto_cliente into v_txt from public.v_recebimentos where id = v_rec;
    res := res || pg_temp.t(v_txt = 'direto:300.00:700.00', 'D03 na consulta: situação "direto", escritório 300, cliente 700', v_txt);
    v_txt := pg_temp.erro(format($q$select public.registrar_repasse(jsonb_build_object('recebimento_id', %L, 'data', '2026-10-05'))$q$, v_rec));
    res := res || pg_temp.t(v_txt like '%não tem parte do cliente a repassar%', 'D04 não há repasse a registrar', v_txt);
    select sum(valor) into v_num from public.v_movimentacoes_financeiras where origem = 'recebimento' and origem_id = v_rec;
    res := res || pg_temp.t(v_num = 300, 'D05 na conta financeira entram só os 300 do escritório', v_num);

    c_fixo := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Honorários comuns', 'valor_total', 500, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-10-01', 'valor', 500))));
    v_txt := pg_temp.erro(format($q$insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, direto_ao_cliente)
      select id, '2026-10-05', 500, 500, 0, true from public.parcelas where contrato_id = %L$q$, c_fixo));
    res := res || pg_temp.t(v_txt like '%Só parcela de acordo%', 'D06 parcela sem parte de cliente não aceita "pago direto"', v_txt);

    v_txt := pg_temp.erro($q$insert into public.recebimentos (tipo_avulsa, data, valor, valor_principal, valor_encargos, direto_ao_cliente)
      values ('consulta', '2026-10-05', 100, 100, 0, true)$q$);
    res := res || pg_temp.t(v_txt like '%avulsa não tem parte de cliente%', 'D07 entrada avulsa não aceita "pago direto"', v_txt);

    -- Metade pelo escritório, metade direto: o escritório fica com 30% do total.
    c_mix := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo misturado', 'valor_total', 1000, 'cota_escritorio_pct', 30,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-10-01', 'valor', 1000))));
    select id into v_parc from public.parcelas where contrato_id = c_mix;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (v_parc, '2026-10-05', 400, 400, 0) returning id into v_rec2;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, direto_ao_cliente)
      values (v_parc, '2026-10-06', 600, 600, 0, true);
    select string_agg(valor || '+' || valor_direto_cliente || '(rep ' || valor_repasse || ')', ' ' order by data), sum(valor - valor_repasse)
      into v_txt, v_num from public.recebimentos where parcela_id = v_parc;
    res := res || pg_temp.t(v_num = 300, 'D08 400 pelo escritório + 600 direto: o escritório fica com 300 (30% de 1.000)', v_txt || ' = ' || v_num);

    j := public.previa_fechamento('2026-10-01') -> 'totais';
    res := res || pg_temp.t((j ->> 'diretos_clientes')::numeric = 700 + 420
                              and (j ->> 'principal_parcelas')::numeric + (j ->> 'encargos')::numeric + (j ->> 'avulsas')::numeric
                                  - (j ->> 'diretos_clientes')::numeric = (j ->> 'entradas')::numeric,
      'D09 fechamento: o direto a clientes aparece à parte e a conta das entradas fecha', j);

    update public.recebimentos set estornado_em = now(), motivo_estorno = 'lançado errado' where id = v_rec;
    select situacao || ':' || saldo into v_txt from public.v_parcelas where contrato_id = c_dir;
    res := res || pg_temp.t(v_txt = 'vencida:1000.00', 'D10 estornado o pagamento direto, a parcela volta a dever 1.000', v_txt);

    -- ============ 2 · cota própria em multa e juros ============
    etapa := 'encargos';
    c_enc := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo 30/50', 'valor_total', 1000, 'cota_escritorio_pct', 30,
      'cota_encargos_pct', 50, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-09-01', 'valor', 1000))));
    select id, cota_encargos_pct into v_parc, v_num from public.parcelas where contrato_id = c_enc;
    res := res || pg_temp.t(v_num = 50, 'E01 o acordo guarda a cota de 50% em multa e juros', v_num);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (v_parc, '2026-10-05', 1100, 1000, 100) returning id into v_rec;
    select (valor - valor_repasse) || ' / ' || valor_repasse into v_txt from public.recebimentos where id = v_rec;
    res := res || pg_temp.t(v_txt = '350.00 / 750.00',
      'E02 1.000 de principal a 30% + 100 de encargos a 50%: escritório 350, cliente 750', v_txt);

    c_enc2 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo 30/30', 'valor_total', 100, 'cota_escritorio_pct', 30,
      'cota_encargos_pct', 30, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-01', 'valor', 100))));
    select cota_encargos_pct into v_num from public.parcelas where contrato_id = c_enc2;
    res := res || pg_temp.t(v_num is null, 'E03 cota de encargos igual à do acordo não fica guardada à parte', v_num);

    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Sem acordo', 'valor_total', 100, 'cota_encargos_pct', 50, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-01', 'valor', 100))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%só vale para acordo%', 'E04 cota de encargos sem acordo é recusada', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Cota longa', 'valor_total', 100, 'cota_escritorio_pct', 30, 'cota_encargos_pct', 33.333,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-01', 'valor', 100))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '%de 0% a 100%, com até duas casas%', 'E05 cota de encargos com três casas é recusada', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object(
      'cliente_id', %L, 'descricao', 'Encargos do cliente', 'valor_total', 100, 'cota_escritorio_pct', 30, 'cota_encargos_pct', 0,
      'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-11-01', 'valor', 100))))$q$, v_cli));
    res := res || pg_temp.t(v_txt = 'aceitou', 'E06 multa e juros todos do cliente (0%) é aceito', v_txt);

    -- Pago em partes com encargos: fecha no centavo, cada parte com sua cota.
    c_enc2 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Acordo em partes 30/50', 'valor_total', 333.33, 'cota_escritorio_pct', 30,
      'cota_encargos_pct', 50, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-09-01', 'valor', 333.33))));
    select id into v_parc from public.parcelas where contrato_id = c_enc2;
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (v_parc, '2026-10-05', 121.11, 111.11, 10);
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos)
      values (v_parc, '2026-10-06', 222.23, 222.22, 0.01);
    select sum(valor - valor_repasse), string_agg((valor - valor_repasse)::text, ' + ' order by data) into v_num, v_txt
      from public.recebimentos where parcela_id = v_parc;
    res := res || pg_temp.t(v_num = 105.01, 'E07 em partes: 30% de 333,33 + 50% de 10,01 = 105,01, no centavo', v_txt || ' = ' || v_num);

    -- Direto ao cliente com encargos: a cota dos encargos vale também.
    c_enc2 := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Direto 30/50', 'valor_total', 1000, 'cota_escritorio_pct', 30,
      'cota_encargos_pct', 50, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-09-01', 'valor', 1000))));
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, direto_ao_cliente)
      select id, '2026-10-05', 1100, 1000, 100, true from public.parcelas where contrato_id = c_enc2
      returning valor || ' / ' || valor_direto_cliente into v_txt;
    res := res || pg_temp.t(v_txt = '350.00 / 750.00', 'E08 direto ao cliente com encargos: no caixa 350, ao cliente 750', v_txt);

    -- Apuração de êxito em acordo, com a cota dos encargos.
    c_exito := public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Êxito sem honorário inicial', 'tipo_honorario', 'exito', 'exito_pct', 50));
    v_txt := pg_temp.erro(format($q$select public.apurar_exito(jsonb_build_object('contrato_id', %L, 'valor_total', 500,
      'cota_encargos_pct', 50, 'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 500))))$q$, c_exito));
    res := res || pg_temp.t(v_txt like '%só vale para acordo%', 'E09 cota de encargos na apuração só no modo acordo', v_txt);
    perform public.apurar_exito(jsonb_build_object('contrato_id', c_exito, 'valor_total', 2000, 'cota_escritorio_pct', 50,
      'cota_encargos_pct', 100,
      'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2026-12-10', 'valor', 1000),
                                    jsonb_build_object('vencimento', '2027-01-10', 'valor', 1000))));
    select string_agg(distinct cota_escritorio_pct || '/' || cota_encargos_pct, ',') into v_txt
      from public.parcelas where contrato_id = c_exito;
    res := res || pg_temp.t(v_txt = '50.00/100.00', 'E10 êxito apurado em acordo: 50% do acordo e 100% dos encargos', v_txt);

    -- Renegociar herda a cota dos encargos; cotas de encargos diferentes não se misturam.
    select jsonb_agg(id order by numero) into v_ids from public.parcelas where contrato_id = c_exito;
    perform public.renegociar(jsonb_build_object('contrato_id', c_exito, 'motivo', 'adiou',
      'parcelas', jsonb_build_array(v_ids -> 0),
      'novas', jsonb_build_array(jsonb_build_object('vencimento', '2027-02-10', 'valor', 1000))));
    select cota_escritorio_pct || '/' || cota_encargos_pct || '/' || parte into v_txt
      from public.parcelas where contrato_id = c_exito and origem_renegociacao_id is not null;
    res := res || pg_temp.t(v_txt = '50.00/100.00/exito', 'E11 a parcela renegociada herda as duas cotas e a parte', v_txt);

    perform public.criar_contrato(jsonb_build_object(
      'cliente_id', v_cli, 'descricao', 'Para misturar', 'valor_total', 200, 'cota_escritorio_pct', 30, 'data_contrato', '2026-08-01',
      'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', '2026-12-01', 'valor', 100),
                                    jsonb_build_object('numero', 2, 'vencimento', '2027-01-01', 'valor', 100))));
    select id into c_mix from public.contratos where descricao = 'Para misturar';
    -- Sem caminho pela tela para cotas de encargos diferentes no mesmo contrato:
    -- força uma, com os gatilhos desligados só aqui, para conferir a regra.
    perform set_config('role', 'none', true);
    alter table public.parcelas disable trigger user;
    update public.parcelas set cota_encargos_pct = 60 where contrato_id = c_mix and numero = 2;
    alter table public.parcelas enable trigger user;
    perform pg_temp.como(u_admin);
    select jsonb_agg(id) into v_ids from public.parcelas where contrato_id = c_mix;
    v_txt := pg_temp.erro(format($q$select public.renegociar(jsonb_build_object('contrato_id', %L, 'motivo', 'juntar',
      'parcelas', %L::jsonb, 'novas', jsonb_build_array(jsonb_build_object('vencimento', '2027-02-01', 'valor', 200))))$q$,
      c_mix, v_ids));
    res := res || pg_temp.t(v_txt like '%cotas do escritório diferentes%', 'E12 cotas de encargos diferentes não se renegociam juntas', v_txt);

    select bool_and(valor + valor_direto_cliente = valor_principal + valor_encargos) into v_txt from public.recebimentos;
    res := res || pg_temp.t(v_txt = 'true', 'E13 em todo recebimento, caixa + direto ao cliente = principal + encargos', v_txt);

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

select * from pg_temp.testar_acordo_direto();
