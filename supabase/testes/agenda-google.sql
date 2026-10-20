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
