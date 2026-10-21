-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Pedidos de 21/10: filiação em mãe e pai, processos que o escritório não acompanha
-- =============================================================================
--
-- Migração 20261021120000. Tudo acontece num bloco desfeito no fim: nada fica
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

create or replace function pg_temp.testar_pedidos_2110()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  u_assoc  uuid := gen_random_uuid();
  m_assoc  uuid := gen_random_uuid();
  v_cli    uuid;
  v_cli2   uuid;
  v_marca  uuid;
  i_pend   uuid;
  i_outro  uuid;
  i_conf   uuid;
  num      text := '00009699820255090022';
  num2     text := '00012345620248160129';
  v_txt    text;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'p2110-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_assoc, 'p2110-assoc@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'p2110-admin@teste.local' where nome_curto = 'Vinícius';
    insert into public.membros (id, user_id, nome, nome_curto, email, papel, acesso_agenda, acesso_clientes, acesso_prazos)
      values (m_assoc, u_assoc, 'Associado sem prazos', 'Associado', 'p2110-assoc@teste.local', 'associado', 'propria', 'nenhum', 'nenhum');
    perform pg_temp.como(u_admin);
    perform public.iniciar_sessao();

    -- ===================== 1 · filiação em mãe e pai =====================
    etapa := 'filiação';
    v_cli := public.salvar_cliente(jsonb_build_object('nome', 'Cliente da Filiação', 'detalhes', jsonb_build_object(
      'tipo_pessoa', 'fisica', 'filiacao', null, 'filiacao_mae', '  Rosina dos Santos Pedroso ', 'filiacao_pai', 'Agripino Pedroso')));
    select filiacao_mae || ' / ' || filiacao_pai || ' / ' || coalesce(filiacao, '∅') into v_txt
      from public.clientes_detalhes where cliente_id = v_cli;
    res := res || pg_temp.t(v_txt = 'Rosina dos Santos Pedroso / Agripino Pedroso / ∅',
      'F01 salvar_cliente grava mãe e pai separados (sem espaço sobrando)', v_txt);

    -- Tela aberta antes da publicação: manda só "filiacao", sem mãe e pai.
    perform public.salvar_cliente(jsonb_build_object('id', v_cli, 'nome', 'Cliente da Filiação', 'detalhes', jsonb_build_object(
      'tipo_pessoa', 'fisica', 'filiacao', null, 'profissao', 'Pescador')));
    select filiacao_mae || ' / ' || filiacao_pai || ' / ' || profissao into v_txt
      from public.clientes_detalhes where cliente_id = v_cli;
    res := res || pg_temp.t(v_txt = 'Rosina dos Santos Pedroso / Agripino Pedroso / Pescador',
      'F02 tela antiga (sem os campos novos) não apaga mãe e pai', v_txt);

    perform public.salvar_cliente(jsonb_build_object('id', v_cli, 'nome', 'Cliente da Filiação', 'detalhes', jsonb_build_object(
      'tipo_pessoa', 'fisica', 'filiacao_mae', 'Rosina dos Santos Pedroso', 'filiacao_pai', '')));
    select coalesce(filiacao_pai, '∅') into v_txt from public.clientes_detalhes where cliente_id = v_cli;
    res := res || pg_temp.t(v_txt = '∅', 'F03 pai em branco apaga o pai (quem manda o campo decide)', v_txt);

    v_txt := pg_temp.erro(format($q$select public.salvar_cliente(jsonb_build_object('id', %L, 'nome', 'Cliente da Filiação',
      'detalhes', jsonb_build_object('tipo_pessoa', 'fisica', 'filiacao_mae', repeat('a', 301))))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '23514%', 'F04 mãe com mais de 300 letras é recusada', v_txt);

    v_txt := pg_temp.erro(format($q$select public.salvar_cliente(jsonb_build_object('id', %L, 'nome', 'Cliente da Filiação',
      'detalhes', jsonb_build_object('tipo_pessoa', 'fisica', 'filiacao_pai', 123)))$q$, v_cli));
    res := res || pg_temp.t(v_txt like '22023%filiacao_pai%', 'F05 pai que não é texto é recusado', v_txt);

    v_cli2 := public.salvar_cliente(jsonb_build_object('nome', 'Cliente Antigo', 'detalhes', jsonb_build_object(
      'tipo_pessoa', 'fisica', 'filiacao', 'Maria Antiga / José Antigo')));
    select filiacao || ' | ' || coalesce(filiacao_mae, '∅') into v_txt from public.clientes_detalhes where cliente_id = v_cli2;
    res := res || pg_temp.t(v_txt = 'Maria Antiga / José Antigo | ∅', 'F06 o texto antigo continua aceito e não é dividido sozinho', v_txt);

    -- Como a tela faz depois de "Separar": manda mãe e o texto antigo vazio.
    perform public.salvar_cliente(jsonb_build_object('id', v_cli2, 'nome', 'Cliente Antigo', 'detalhes', jsonb_build_object(
      'tipo_pessoa', 'fisica', 'filiacao', null, 'filiacao_mae', 'Maria Antiga', 'filiacao_pai', 'José Antigo')));
    select filiacao_mae || ' / ' || filiacao_pai || ' | ' || coalesce(filiacao, '∅') into v_txt from public.clientes_detalhes where cliente_id = v_cli2;
    res := res || pg_temp.t(v_txt = 'Maria Antiga / José Antigo | ∅', 'F07 separar: mãe e pai gravados, texto antigo apagado', v_txt);
    select count(*)::text into v_txt from public.auditoria
     where tabela = 'clientes_detalhes' and 'filiacao_mae' = any(campos) and antes ->> 'filiacao' = 'Maria Antiga / José Antigo';
    res := res || pg_temp.t(v_txt = '1', 'F08 o texto antigo que saiu fica no histórico', v_txt);

    -- ============ 2 · processos que o escritório não acompanha ============
    etapa := 'não acompanhar';
    -- Comunicações do DJEN: duas pendentes do número, uma conferida dele e uma de outro número.
    j := public.importar_intimacoes(jsonb_build_object(
      'itens', jsonb_build_array(
        jsonb_build_object('djen_id', 921001, 'disponibilizada_em', '2026-10-16', 'texto', 'Acórdão disponibilizado',
          'numero_processo', num, 'advogados', '[{"nome":"MARLON","numero_oab":"131898","uf_oab":"PR"}]'::jsonb),
        jsonb_build_object('djen_id', 921002, 'disponibilizada_em', '2026-10-17', 'texto', 'Intimação 2', 'numero_processo', num),
        jsonb_build_object('djen_id', 921003, 'disponibilizada_em', '2026-10-17', 'texto', 'Já conferida', 'numero_processo', num),
        jsonb_build_object('djen_id', 921004, 'disponibilizada_em', '2026-10-17', 'texto', 'Outro processo', 'numero_processo', num2)),
      'consulta', jsonb_build_object('de', '2026-10-16', 'ate', '2026-10-17', 'oabs', jsonb_build_array('105790/PR'), 'situacao', 'ok')));
    res := res || pg_temp.t((j ->> 'novas')::int = 4 and (j ->> 'arquivadas')::int = 0,
      'N01 sem marcação, tudo entra pendente (arquivadas = 0)', j);
    select id into i_pend from public.intimacoes where djen_id = 921001;
    select id into i_conf from public.intimacoes where djen_id = 921003;
    select id into i_outro from public.intimacoes where djen_id = 921004;
    update public.intimacoes set situacao = 'conferida', observacoes = 'Prazo cumprido' where id = i_conf;

    -- Sem Prazos não marca nem lê.
    perform pg_temp.como(u_assoc);
    perform public.iniciar_sessao();
    v_txt := pg_temp.erro(format('select public.nao_acompanhar_processo(%L, %L)', num, 'Marlon cuida'));
    res := res || pg_temp.t(v_txt like '42501%', 'N02 quem não tem acesso a Prazos não marca', v_txt);
    perform pg_temp.como(u_admin);

    v_txt := pg_temp.erro(format('select public.nao_acompanhar_processo(%L, %L)', '123', 'Marlon cuida'));
    res := res || pg_temp.t(v_txt like '%número CNJ%', 'N03 número que não é CNJ é recusado', v_txt);
    v_txt := pg_temp.erro(format('select public.nao_acompanhar_processo(%L, %L)', num, '  '));
    res := res || pg_temp.t(v_txt like '%Informe o motivo%', 'N04 sem motivo é recusado', v_txt);
    v_txt := pg_temp.erro(format($q$insert into public.processos_nao_acompanhados (numero, motivo) values (%L, 'direto')$q$, num));
    res := res || pg_temp.t(v_txt like '42501%', 'N05 não se marca por INSERT direto (só pela função, que arquiva junto)', v_txt);

    j := public.nao_acompanhar_processo('0000969-98.2025.5.09.0022', 'O Marlon está cuidando deste processo');
    v_marca := (j ->> 'id')::uuid;
    res := res || pg_temp.t((j ->> 'arquivadas')::int = 2, 'N06 marca (número com máscara) e arquiva as 2 pendentes do número', j);
    select string_agg(situacao, ',' order by djen_id) into v_txt from public.intimacoes where djen_id in (921001, 921002, 921003, 921004);
    res := res || pg_temp.t(v_txt = 'arquivada,arquivada,conferida,pendente',
      'N07 a conferida do número e a de outro número não mudam', v_txt);
    select observacoes into v_txt from public.intimacoes where id = i_pend;
    res := res || pg_temp.t(v_txt = 'Arquivada: processo que o escritório não acompanha — O Marlon está cuidando deste processo',
      'N08 a arquivada diz por quê', v_txt);
    select criado_por::text into v_txt from public.processos_nao_acompanhados where id = v_marca;
    res := res || pg_temp.t(v_txt = (select id::text from public.membros where nome_curto = 'Vinícius'), 'N09 a marcação guarda quem marcou', v_txt);
    select count(*)::text into v_txt from public.auditoria where tabela = 'processos_nao_acompanhados' and registro_id = v_marca and acao = 'criou';
    res := res || pg_temp.t(v_txt = '1', 'N10 a marcação fica no histórico', v_txt);

    v_txt := pg_temp.erro(format('select public.nao_acompanhar_processo(%L, %L)', num, 'De novo'));
    res := res || pg_temp.t(v_txt like '%já está na lista%', 'N11 marcar o mesmo processo duas vezes é recusado', v_txt);

    -- O que chega depois entra arquivado (e conta como novo, para a consulta).
    j := public.importar_intimacoes(jsonb_build_object(
      'itens', jsonb_build_array(
        jsonb_build_object('djen_id', 921005, 'disponibilizada_em', '2026-10-20', 'texto', 'Nova do processo marcado', 'numero_processo', num),
        jsonb_build_object('djen_id', 921006, 'disponibilizada_em', '2026-10-20', 'texto', 'Nova de outro', 'numero_processo', num2),
        jsonb_build_object('djen_id', 921001, 'disponibilizada_em', '2026-10-16', 'texto', 'Repetida', 'numero_processo', num)),
      'consulta', jsonb_build_object('de', '2026-10-20', 'ate', '2026-10-20', 'oabs', jsonb_build_array('105790/PR'), 'situacao', 'ok')));
    res := res || pg_temp.t((j ->> 'encontradas')::int = 3 and (j ->> 'novas')::int = 2 and (j ->> 'arquivadas')::int = 1,
      'N12 importação: 3 encontradas, 2 novas, 1 arquivada na chegada (a repetida não conta)', j);
    select situacao || ' | ' || observacoes into v_txt from public.intimacoes where djen_id = 921005;
    res := res || pg_temp.t(v_txt = 'arquivada | Arquivada na chegada: processo que o escritório não acompanha — O Marlon está cuidando deste processo',
      'N13 a nova do processo marcado entra arquivada, com o motivo', v_txt);
    select situacao into v_txt from public.intimacoes where djen_id = 921006;
    res := res || pg_temp.t(v_txt = 'pendente', 'N14 a de outro processo entra pendente', v_txt);
    select coalesce((public.avisos_do_dia() ->> 'intimacoes_pendentes'), '?') into v_txt;
    res := res || pg_temp.t(v_txt = '2', 'N15 o contador de pendentes não conta as arquivadas', v_txt);

    -- Voltar a acompanhar = cancelar a marcação, com motivo.
    v_txt := pg_temp.erro(format('update public.processos_nao_acompanhados set cancelado_em = now() where id = %L', v_marca));
    res := res || pg_temp.t(v_txt like '%motivo%', 'N16 voltar a acompanhar exige motivo', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos_nao_acompanhados set motivo = 'trocado' where id = %L$q$, v_marca));
    res := res || pg_temp.t(v_txt like '42501%', 'N17 o motivo da marcação não se reescreve', v_txt);
    update public.processos_nao_acompanhados
       set cancelado_em = now(), motivo_cancelamento = 'O cliente voltou ao escritório' where id = v_marca;
    select (cancelado_por = (select id from public.membros where nome_curto = 'Vinícius'))::text into v_txt
      from public.processos_nao_acompanhados where id = v_marca;
    res := res || pg_temp.t(v_txt = 'true', 'N18 voltar a acompanhar grava quem e quando', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos_nao_acompanhados set motivo_cancelamento = 'outro' where id = %L$q$, v_marca));
    res := res || pg_temp.t(v_txt like '%cancelado não pode ser alterado%', 'N19 marcação desfeita não se altera mais', v_txt);

    j := public.importar_intimacoes(jsonb_build_object(
      'itens', jsonb_build_array(
        jsonb_build_object('djen_id', 921007, 'disponibilizada_em', '2026-10-21', 'texto', 'Depois de voltar', 'numero_processo', num)),
      'consulta', jsonb_build_object('de', '2026-10-21', 'ate', '2026-10-21', 'oabs', jsonb_build_array('105790/PR'), 'situacao', 'ok')));
    select situacao into v_txt from public.intimacoes where djen_id = 921007;
    res := res || pg_temp.t(v_txt = 'pendente' and (j ->> 'arquivadas')::int = 0, 'N20 depois de voltar a acompanhar, a nova entra pendente', v_txt);
    select string_agg(situacao, ',' order by djen_id) into v_txt from public.intimacoes where djen_id in (921001, 921002, 921005);
    res := res || pg_temp.t(v_txt = 'arquivada,arquivada,arquivada', 'N21 as arquivadas antes continuam arquivadas', v_txt);

    j := public.nao_acompanhar_processo(num, 'Saiu de novo');
    res := res || pg_temp.t((j ->> 'arquivadas')::int = 1, 'N22 dá para marcar de novo depois de voltar (arquiva a pendente nova)', j);

    -- Sem Prazos: não lê a lista nem o histórico dela.
    perform pg_temp.como(u_assoc);
    select count(*)::text into v_txt from public.processos_nao_acompanhados;
    res := res || pg_temp.t(v_txt = '0', 'N23 sem Prazos não lê os processos não acompanhados', v_txt);
    select count(*)::text into v_txt from public.auditoria where tabela = 'processos_nao_acompanhados';
    res := res || pg_temp.t(v_txt = '0', 'N24 nem o histórico deles', v_txt);
    perform pg_temp.como(u_admin);

    perform set_config('role', 'anon', true);
    v_txt := pg_temp.erro('select count(*) from public.processos_nao_acompanhados');
    res := res || pg_temp.t(v_txt like '42501%', 'N25 anônimo não lê', v_txt);
    v_txt := pg_temp.erro(format('select public.nao_acompanhar_processo(%L, %L)', num2, 'anônimo'));
    res := res || pg_temp.t(v_txt like '42501%', 'N26 anônimo não marca', v_txt);
    perform pg_temp.como(u_admin);

    v_txt := pg_temp.erro(format('delete from public.processos_nao_acompanhados where id = %L', v_marca));
    res := res || pg_temp.t(v_txt like '42501%' or v_txt like '%não são apagados%', 'N27 nada se apaga', v_txt);

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

select * from pg_temp.testar_pedidos_2110();
