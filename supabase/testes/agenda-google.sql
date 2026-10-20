-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Google Agenda do escritório: subagenda de cada membro
-- =============================================================================
--
-- Migração 20261020180000. Tudo acontece num bloco desfeito no fim: nada fica
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

create or replace function pg_temp.testar_agenda_google()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_admin  uuid := gen_random_uuid();
  u_socio  uuid := gen_random_uuid();
  m_socio  uuid;
  v_id     uuid;
  v_novo   uuid;
  v_id2    uuid;
  v_txt    text;
  v_num    numeric;
begin
  begin
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'ag-admin@teste.local', now(), 'authenticated', 'authenticated'),
      (u_socio, 'ag-socio@teste.local', now(), 'authenticated', 'authenticated');
    update public.membros set email = 'ag-admin@teste.local' where nome_curto = 'Vinícius';
    insert into public.membros (nome, nome_curto, email, papel, acesso_agenda, acesso_financeiro)
      values ('Sócia Teste', 'Sócia', 'ag-socio@teste.local', 'socio', 'propria', 'completo')
      returning id into m_socio;
    perform pg_temp.como(u_admin);
    perform public.iniciar_sessao();
    perform pg_temp.como(u_socio);
    perform public.iniciar_sessao();

    etapa := 'administrador';
    perform pg_temp.como(u_admin);
    update public.membros set google_agenda = 'c_abc123@group.calendar.google.com' where id = m_socio;
    select count(*) into v_num from public.membros where id = m_socio and google_agenda = 'c_abc123@group.calendar.google.com';
    res := res || pg_temp.t(v_num = 1, 'G01 o administrador grava a subagenda do Google de um membro', v_num);

    v_txt := pg_temp.erro(format('update public.membros set google_agenda = %L where id = %L', 'não é um id', m_socio));
    res := res || pg_temp.t(v_txt like '%membros_google_agenda_check%', 'G02 texto que não é ID de agenda é recusado', v_txt);

    update public.membros set google_agenda = null where id = m_socio;
    select count(*) into v_num from public.membros where id = m_socio and google_agenda is null;
    res := res || pg_temp.t(v_num = 1, 'G03 em branco volta para a agenda principal', v_num);

    select count(*) into v_num from public.auditoria where tabela = 'membros' and registro_id = m_socio;
    res := res || pg_temp.t(v_num >= 2, 'G04 a troca de agenda fica no histórico do membro', v_num);

    etapa := 'sócio';
    perform pg_temp.como(u_socio);
    update public.membros set google_agenda = 'c_outro@group.calendar.google.com' where id = m_socio;
    perform pg_temp.como(u_admin);
    select count(*) into v_num from public.membros where id = m_socio and google_agenda is null;
    res := res || pg_temp.t(v_num = 1, 'G05 quem não administra não troca a agenda de ninguém, nem a própria', v_num);

    perform pg_temp.como(u_socio);
    select count(*) into v_num from public.membros where google_agenda is null;
    res := res || pg_temp.t(v_num > 0, 'G06 todos os membros leem a coluna (o botão do Google precisa dela)', v_num);

    -- ===================== sincronização (migração 34) =====================
    etapa := 'sincronização';
    v_txt := pg_temp.erro('select public.google_agenda_pendencias(10)');
    res := res || pg_temp.t(v_txt like '42501%', 'G07 membro não lê as pendências do Google (só o servidor)', v_txt);
    v_txt := pg_temp.erro('select public.google_agenda_conexao()');
    res := res || pg_temp.t(v_txt like '42501%', 'G08 membro não lê a autorização do Google', v_txt);
    v_txt := pg_temp.erro($q$select public.google_agenda_aplicar('x', '[]')$q$);
    res := res || pg_temp.t(v_txt like '42501%', 'G09 membro não aplica eventos do Google', v_txt);
    v_txt := pg_temp.erro('select public.google_agenda_iniciar()');
    res := res || pg_temp.t(v_txt like '42501%', 'G10 só o administrador começa a ligação com o Google', v_txt);
    select (public.google_agenda_situacao() ->> 'conectado')::boolean::int into v_num;
    res := res || pg_temp.t(v_num = 0, 'G11 membro com agenda vê a situação (desligada)', v_num);

    -- Sem agenda no Google, o compromisso não entra na fila.
    insert into public.compromissos (membro_id, tipo, titulo, inicio, fim)
      values (m_socio, 'interno', 'Sem Google', now() + interval '1 day', now() + interval '1 day 1 hour')
      returning id into v_id;
    -- A fila mora em privado: só o banco (e a função, pelas RPCs) a lê.
    perform set_config('role', 'none', true);
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_id;
    res := res || pg_temp.t(v_num = 0, 'G12 sem agenda no Google, nada fica pendente', v_num);

    -- Com agenda: entra (os já marcados também), e a chegada não mexe.
    update public.membros set google_agenda = 'c_g13@group.calendar.google.com' where id = m_socio;
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_id and situacao = 'pendente';
    res := res || pg_temp.t(v_num = 1, 'G13 ao ganhar agenda no Google, os compromissos dela entram na fila', v_num);
    update privado.google_eventos set situacao = 'ok', mudou_em = now() - interval '1 hour' where compromisso_id = v_id;
    update public.compromissos set chegada_em = now() where id = v_id;
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_id and situacao = 'ok';
    res := res || pg_temp.t(v_num = 1, 'G14 marcar a chegada do cliente não reenvia ao Google', v_num);
    update public.compromissos set situacao = 'realizado' where id = v_id;
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_id and situacao = 'ok';
    res := res || pg_temp.t(v_num = 1, 'G17 marcar realizado não reenvia ao Google', v_num);
    update public.compromissos set titulo = 'Com Google' where id = v_id;
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_id and situacao = 'pendente';
    res := res || pg_temp.t(v_num = 1, 'G15 mudar o título reenvia ao Google', v_num);
    update public.compromissos set cancelado_em = now(), motivo_cancelamento = 'teste' where id = v_id;
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_id and situacao = 'pendente';
    res := res || pg_temp.t(v_num = 1, 'G16 cancelar deixa pendente para sair do Google', v_num);

    -- ===================== remarcar (migração 36) =====================
    etapa := 'remarcar';
    perform pg_temp.como(u_socio);
    insert into public.compromissos (membro_id, tipo, titulo, inicio, fim)
      values (m_socio, 'audiencia', 'Audiência de instrução', timestamptz '2026-11-04 13:00-03', timestamptz '2026-11-04 14:00-03')
      returning id into v_id;
    v_novo := public.remarcar_compromisso(v_id, timestamptz '2026-11-06 14:00-03', timestamptz '2026-11-06 15:00-03');
    select count(*) into v_num from public.compromissos
     where id = v_id and situacao = 'remarcado' and remarcado_para = v_novo;
    res := res || pg_temp.t(v_num = 1, 'R01 remarcar marca o antigo como remarcado, apontando para o novo', v_num);
    select count(*) into v_num from public.compromissos
     where id = v_novo and situacao = 'agendado' and titulo = 'Audiência de instrução' and tipo = 'audiencia'
       and inicio = timestamptz '2026-11-06 14:00-03' and membro_id = m_socio;
    res := res || pg_temp.t(v_num = 1, 'R02 o novo é igual ao antigo, no novo horário', v_num);

    v_txt := pg_temp.erro(format($q$select public.remarcar_compromisso(%L, now(), now() + interval '1 hour')$q$, v_id));
    res := res || pg_temp.t(v_txt like '%Só um compromisso agendado%', 'R03 o que já foi remarcado não se remarca de novo', v_txt);

    update public.compromissos set situacao = 'agendado' where id = v_id;
    select count(*) into v_num from public.compromissos where id = v_id and situacao = 'agendado' and remarcado_para is null;
    res := res || pg_temp.t(v_num = 1, 'R04 voltar para agendado desfaz o remarcado (e solta o vínculo)', v_num);

    v_txt := pg_temp.erro(format($q$select public.remarcar_compromisso(%L, %L, %L)$q$, v_id,
      timestamptz '2026-11-04 13:00-03', timestamptz '2026-11-04 14:00-03'));
    res := res || pg_temp.t(v_txt like '%diferente do atual%', 'R05 remarcar para o mesmo horário é recusado', v_txt);

    perform set_config('role', 'none', true);
    select count(*) into v_num from privado.google_eventos where compromisso_id = v_novo and situacao = 'pendente';
    res := res || pg_temp.t(v_num = 1, 'R06 o novo horário entra na fila do Google', v_num);

    -- Quem só edita a própria agenda não remarca a de outro.
    perform pg_temp.como(u_admin);
    insert into public.compromissos (membro_id, tipo, titulo, inicio, fim)
      select id, 'atendimento', 'Do administrador', now() + interval '2 days', now() + interval '2 days 1 hour'
        from public.membros where nome_curto = 'Vinícius'
      returning id into v_id;
    perform pg_temp.como(u_socio);
    v_txt := pg_temp.erro(format($q$select public.remarcar_compromisso(%L, now() + interval '3 days', now() + interval '3 days 1 hour')$q$, v_id));
    res := res || pg_temp.t(v_txt like '42501%', 'R07 sócio com agenda própria não remarca o compromisso de outro', v_txt);

    -- ===================== revisão (migração 37) =====================
    etapa := 'revisão';
    perform pg_temp.como(u_socio);
    insert into public.compromissos (membro_id, tipo, titulo, inicio, fim, particular, observacoes)
      values (m_socio, 'interno', 'Consulta médica', now() + interval '4 days', now() + interval '4 days 1 hour', true, 'SIGILO')
      returning id into v_novo;
    perform pg_temp.como(u_admin);
    select count(*) into v_num from public.auditoria where tabela = 'compromissos' and registro_id = v_novo;
    res := res || pg_temp.t(v_num = 0, 'V01 nem o administrador lê o histórico do particular de outra pessoa', v_num);
    perform pg_temp.como(u_socio);
    select count(*) into v_num from public.auditoria where tabela = 'compromissos' and registro_id = v_novo;
    res := res || pg_temp.t(v_num > 0, 'V02 a dona lê o histórico do próprio particular', v_num);

    -- remarcado_para só para compromisso do mesmo responsável (v_id é do Vinícius).
    insert into public.compromissos (membro_id, tipo, titulo, inicio, fim)
      values (m_socio, 'atendimento', 'Meu', now() + interval '5 days', now() + interval '5 days 1 hour')
      returning id into v_id2;
    v_txt := pg_temp.erro(format($q$update public.compromissos set situacao = 'remarcado', remarcado_para = %L where id = %L$q$, v_id, v_id2));
    res := res || pg_temp.t(v_txt like '%mesmo responsável%', 'V03 remarcado_para não aponta para compromisso de outra pessoa', v_txt);
    v_txt := pg_temp.erro(format($q$update public.compromissos set situacao = 'remarcado' where id = %L$q$, v_id2));
    res := res || pg_temp.t(v_txt like '%use "Remarcar"%', 'V04 "remarcado" sem novo horário é recusado', v_txt);

    -- Situação no Google: nada sobre particular de outra pessoa.
    perform set_config('role', 'none', true);
    insert into privado.google_eventos (compromisso_id, origem) values (v_novo, 'sistema') on conflict do nothing;
    perform pg_temp.como(u_admin);
    select count(*) into v_num from public.google_agenda_estados(array[v_novo]);
    res := res || pg_temp.t(v_num = 0, 'V05 estados do Google não falam do particular de outra pessoa', v_num);
    perform pg_temp.como(u_socio);
    select count(*) into v_num from public.google_agenda_estados(array[v_novo]);
    res := res || pg_temp.t(v_num = 1, 'V06 a dona vê a situação do próprio particular no Google', v_num);

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

select * from pg_temp.testar_agenda_google();
