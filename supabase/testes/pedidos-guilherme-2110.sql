-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Pedidos do Guilherme (21/10): tarefa a partir da intimação, posição do
-- cliente no processo e atendimento sem cliente vinculado
-- =============================================================================
--
-- Migração 20261021200000. Tudo acontece num bloco desfeito no fim: nada fica
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

create or replace function pg_temp.testar_pedidos_guilherme()
returns table (n bigint, ok boolean, teste text, detalhe text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]';
  etapa    text := 'início';
  u_socio  uuid := gen_random_uuid();
  u_outro  uuid := gen_random_uuid();
  u_sem    uuid := gen_random_uuid();
  m_socio  uuid := gen_random_uuid();
  m_outro  uuid := gen_random_uuid();
  m_sem    uuid := gen_random_uuid();
  v_cli    uuid;
  v_cli2   uuid;
  v_proc   uuid;
  v_int    uuid;
  v_int2   uuid;
  v_tar    uuid;
  v_comp   uuid;
  v_comp2  uuid;
  v_comp3  uuid;
  v_ativ   uuid;
  v_txt    text;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_socio, 'pg-socio@teste.local', now(), 'authenticated', 'authenticated'),
      (u_outro, 'pg-outro@teste.local', now(), 'authenticated', 'authenticated'),
      (u_sem, 'pg-sem@teste.local', now(), 'authenticated', 'authenticated');
    insert into public.membros (id, user_id, nome, nome_curto, email, papel, acesso_agenda, acesso_clientes, acesso_prazos) values
      (m_socio, u_socio, 'Sócio do teste', 'SócioT', 'pg-socio@teste.local', 'socio', 'propria', 'editar', 'editar'),
      (m_outro, u_outro, 'Outro do teste', 'OutroT', 'pg-outro@teste.local', 'socio', 'propria', 'editar', 'editar'),
      (m_sem, u_sem, 'Sem prazos', 'SemT', 'pg-sem@teste.local', 'associado', 'propria', 'nenhum', 'nenhum');
    insert into public.clientes (nome) values ('Cliente do Guilherme') returning id into v_cli;
    insert into public.clientes (nome) values ('Outro cliente') returning id into v_cli2;
    insert into public.processos (cliente_id, numero, titulo, area, situacao)
      values (v_cli, '00010355820258160208', 'Cumprimento de sentença', 'familia', 'em_andamento') returning id into v_proc;
    insert into public.intimacoes (fonte, disponibilizada_em, publicada_em, texto, cliente_id, processo_id, numero_processo, membro_id)
      values ('manual', privado.hoje(), privado.hoje(), 'Intime-se para manifestação.', v_cli, v_proc, '00010355820258160208', m_socio)
      returning id into v_int;
    insert into public.intimacoes (fonte, disponibilizada_em, publicada_em, texto, membro_id)
      values ('manual', privado.hoje(), privado.hoje(), 'Outra intimação.', m_socio) returning id into v_int2;

    -- ============ 1 · tarefa (não só prazo) a partir da intimação ============
    etapa := 'tarefa da intimação';
    perform pg_temp.como(u_socio);
    perform public.iniciar_sessao();
    v_tar := public.criar_prazo_intimacao(v_int, jsonb_build_object(
      'tipo', 'tarefa', 'titulo', 'Juntar procuração', 'cliente_id', v_cli, 'processo_id', v_proc, 'responsavel_id', m_socio));
    select tipo || ' | ' || coalesce(intimacao_id::text, '∅') || ' | ' || coalesce(fatal_em::text, 'sem fatal') into v_txt
      from public.tarefas where id = v_tar;
    res := res || pg_temp.t(v_txt = 'tarefa | ' || v_int || ' | sem fatal', 'T01 a intimação gera TAREFA comum, ligada a ela', v_txt);
    select situacao || ' | ' || coalesce((conferida_por = m_socio)::text, '∅') into v_txt from public.intimacoes where id = v_int;
    res := res || pg_temp.t(v_txt = 'conferida | true', 'T02 a conferência é gravada junto, com quem conferiu', v_txt);

    v_txt := pg_temp.erro(format($q$select public.criar_prazo_intimacao(%L, %L::jsonb)$q$, v_int2,
      jsonb_build_object('tipo', 'reuniao', 'titulo', 'X', 'responsavel_id', m_socio)));
    res := res || pg_temp.t(v_txt like '%Escolha tarefa ou prazo processual%', 'T03 tipo que não é tarefa nem prazo é recusado', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_prazo_intimacao(%L, %L::jsonb)$q$, v_int2,
      jsonb_build_object('titulo', 'Sem tipo', 'responsavel_id', m_socio)));
    res := res || pg_temp.t(v_txt like 'P0001%', 'T04 sem tipo continua recusado', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_prazo_intimacao(%L, %L::jsonb)$q$, v_int2,
      jsonb_build_object('tipo', 'tarefa', 'titulo', 'Vínculo errado', 'cliente_id', v_cli, 'responsavel_id', m_socio)));
    res := res || pg_temp.t(v_txt like '%Confira primeiro o vínculo%', 'T05 a tarefa mantém o cliente/processo da intimação', v_txt);

    -- Prazo continua como antes.
    j := jsonb_build_object('tipo', 'prazo', 'titulo', 'Manifestação', 'responsavel_id', m_socio,
      'fatal_em', now() + interval '5 days', 'base_em', now(), 'contagem', 'uteis', 'quantidade', 5);
    v_tar := public.criar_prazo_intimacao(v_int2, j);
    select tipo || ' | ' || (intimacao_id = v_int2)::text into v_txt from public.tarefas where id = v_tar;
    res := res || pg_temp.t(v_txt = 'prazo | true', 'T06 prazo a partir da intimação continua funcionando', v_txt);

    update public.intimacoes set situacao = 'arquivada' where id = v_int2;
    v_txt := pg_temp.erro(format($q$select public.criar_prazo_intimacao(%L, %L::jsonb)$q$, v_int2,
      jsonb_build_object('tipo', 'tarefa', 'titulo', 'De arquivada', 'responsavel_id', m_socio)));
    res := res || pg_temp.t(v_txt like '%Intimação indisponível%', 'T07 intimação arquivada não gera tarefa', v_txt);

    perform pg_temp.como(u_sem);
    v_txt := pg_temp.erro(format($q$select public.criar_prazo_intimacao(%L, %L::jsonb)$q$, v_int,
      jsonb_build_object('tipo', 'tarefa', 'titulo', 'Intruso', 'cliente_id', v_cli, 'processo_id', v_proc, 'responsavel_id', m_sem)));
    res := res || pg_temp.t(v_txt like '42501%', 'T08 sem acesso a Prazos não gera tarefa de intimação', v_txt);

    -- ================ 2 · posição do nosso cliente no processo ================
    etapa := 'posição do cliente';
    perform pg_temp.como(u_socio);
    update public.processos set posicao_cliente = 'Exequente' where id = v_proc;
    select posicao_cliente into v_txt from public.processos where id = v_proc;
    res := res || pg_temp.t(v_txt = 'Exequente', 'P01 quem edita Clientes grava a posição do cliente', v_txt);
    insert into public.processos (cliente_id, titulo, area, situacao, posicao_cliente)
      values (v_cli, 'Caso novo', 'civel', 'em_andamento', 'Réu/Ré') returning posicao_cliente into v_txt;
    res := res || pg_temp.t(v_txt = 'Réu/Ré', 'P02 processo novo já nasce com a posição', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos set posicao_cliente = '   ' where id = %L$q$, v_proc));
    res := res || pg_temp.t(v_txt like '23514%', 'P03 posição em branco é recusada (vazio = null)', v_txt);
    v_txt := pg_temp.erro(format($q$update public.processos set posicao_cliente = repeat('x', 61) where id = %L$q$, v_proc));
    res := res || pg_temp.t(v_txt like '23514%', 'P04 posição com mais de 60 letras é recusada', v_txt);
    update public.processos set posicao_cliente = null where id = v_proc;
    select coalesce(posicao_cliente, '∅') into v_txt from public.processos where id = v_proc;
    res := res || pg_temp.t(v_txt = '∅', 'P05 dá para voltar a "não informado"', v_txt);
    select count(*)::text into v_txt from public.auditoria
     where tabela = 'processos' and registro_id = v_proc and 'posicao_cliente' = any(campos);
    res := res || pg_temp.t(v_txt = '2', 'P06 cada mudança de posição fica no histórico', v_txt);
    perform pg_temp.como(u_sem);
    update public.processos set posicao_cliente = 'Intruso' where id = v_proc;
    perform pg_temp.como(u_socio);
    select coalesce(posicao_cliente, '∅') into v_txt from public.processos where id = v_proc;
    res := res || pg_temp.t(v_txt = '∅', 'P07 quem não edita Clientes não muda a posição', v_txt);

    -- ============ 3 · atendimento sem cliente vinculado + anotações ============
    etapa := 'atendimento';
    perform set_config('role', 'none', true);
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim)
      values (m_socio, 'atendimento', 'presencial', 'Atendimento — rapaz sem cadastro', now(), now() + interval '1 hour')
      returning id into v_comp;
    insert into public.compromissos (membro_id, tipo, modalidade, inicio, fim, cliente_id)
      values (m_socio, 'atendimento', 'presencial', now() + interval '2 hours', now() + interval '3 hours', v_cli2)
      returning id into v_comp2;
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim)
      values (m_outro, 'atendimento', 'presencial', 'Do outro sócio', now(), now() + interval '1 hour')
      returning id into v_comp3;
    perform pg_temp.como(u_socio);

    v_txt := pg_temp.erro(format($q$select public.iniciar_cronometro(%L::jsonb)$q$, jsonb_build_object('compromisso_id', v_comp)));
    res := res || pg_temp.t(v_txt like '%Escolha o cliente do atendimento%', 'A01 sem cliente nenhum, pede o cliente', v_txt);
    v_txt := pg_temp.erro(format($q$select public.iniciar_cronometro(%L::jsonb)$q$,
      jsonb_build_object('compromisso_id', v_comp2, 'cliente_id', v_cli)));
    res := res || pg_temp.t(v_txt like '%de outro cliente%', 'A02 atendimento com cliente não aceita outro', v_txt);
    v_txt := pg_temp.erro(format($q$select public.iniciar_cronometro(%L::jsonb)$q$,
      jsonb_build_object('compromisso_id', v_comp3, 'cliente_id', v_cli)));
    res := res || pg_temp.t(v_txt like '42501%', 'A03 agenda própria: não inicia (nem vincula) atendimento de outro sócio', v_txt);
    select coalesce(cliente_id::text, '∅') into v_txt from public.compromissos where id = v_comp3;
    res := res || pg_temp.t(v_txt = '∅', 'A04 e o compromisso do outro continua sem cliente', v_txt);

    v_ativ := public.iniciar_cronometro(jsonb_build_object('compromisso_id', v_comp, 'cliente_id', v_cli, 'tipo', 'atendimento_presencial'));
    select (cliente_id = v_cli)::text || ' | ' || (chegada_em is not null)::text || ' | ' || situacao into v_txt
      from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = 'true | true | agendado', 'A05 inicia: o cliente escolhido fica no compromisso e a chegada é registrada', v_txt);
    select (compromisso_id = v_comp)::text || ' | ' || cronometrado::text || ' | ' || coalesce(fim::text, 'aberta') into v_txt
      from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'true | true | aberta', 'A06 a atividade nasce aberta, cronometrada e ligada ao atendimento', v_txt);
    select count(*)::text into v_txt from public.auditoria where tabela = 'compromissos' and registro_id = v_comp and 'cliente_id' = any(campos);
    res := res || pg_temp.t(v_txt = '1', 'A07 o vínculo do cliente fica no histórico do compromisso', v_txt);

    -- Anotar durante o atendimento: o relato da atividade aberta muda, o relógio não.
    update public.atualizacoes set relato = 'Cliente relata atraso no pagamento.', proxima_providencia = 'Pedir comprovantes'
     where id = v_ativ and fim is null;
    select coalesce(fim::text, 'aberta') || ' | ' || cronometrado::text || ' | ' || relato into v_txt from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'aberta | true | Cliente relata atraso no pagamento.', 'A08 anotar com o cronômetro correndo: grava o relato e continua cronometrado', v_txt);
    perform pg_temp.como(u_outro);
    update public.atualizacoes set relato = 'Intruso' where id = v_ativ;
    perform pg_temp.como(u_socio);
    select relato into v_txt from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'Cliente relata atraso no pagamento.', 'A09 outro sócio não escreve nas anotações de quem atende', v_txt);
    v_txt := pg_temp.erro(format($q$update public.atualizacoes set inicio = inicio - interval '1 hour' where id = %L$q$, v_ativ));
    res := res || pg_temp.t(v_txt like '%Pare o relógio antes de corrigir o início%', 'A10 o início continua intocável com o relógio correndo', v_txt);

    -- Parar sem relato novo mantém o que foi anotado; o atendimento vira realizado.
    perform public.parar_cronometro(v_ativ, null, null, null);
    select relato || ' | ' || proxima_providencia || ' | ' || (fim is not null)::text into v_txt from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'Cliente relata atraso no pagamento. | Pedir comprovantes | true', 'A11 parar mantém as anotações feitas durante', v_txt);
    select situacao into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = 'realizado', 'A12 e o atendimento fica realizado', v_txt);
    update public.atualizacoes set relato = 'Depois de parar' where id = v_ativ and fim is null;
    select relato into v_txt from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'Cliente relata atraso no pagamento.', 'A13 "Anotar" (só com o relógio aberto) não reescreve uma atividade já parada', v_txt);

    -- O caminho de sempre (atendimento já com cliente) segue igual.
    v_ativ := public.iniciar_cronometro(jsonb_build_object('compromisso_id', v_comp2, 'cliente_id', v_cli2));
    select (cliente_id = v_cli2)::text into v_txt from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'true', 'A14 atendimento que já tinha cliente inicia como antes', v_txt);

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

select * from pg_temp.testar_pedidos_guilherme();
