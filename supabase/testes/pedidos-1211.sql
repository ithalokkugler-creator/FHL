-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Pedidos de 12/11/2026: sessão, cronômetro das tarefas, vários lembretes e
-- vários clientes no mesmo processo
-- =============================================================================
--
-- Migração 20261112120000. Tudo acontece num bloco desfeito no fim: nada fica
-- gravado. Rode com `npm run banco:test` (PostgreSQL isolado), nunca em
-- produção.

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

create or replace function pg_temp.testar_pedidos_1211()
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
  v_her1   uuid;
  v_her2   uuid;
  v_est    uuid;
  v_proc   uuid;
  v_proc2  uuid;
  v_parte  uuid;
  v_tar    uuid;
  v_tar2   uuid;
  v_tar3   uuid;
  v_comp   uuid;
  v_comp2  uuid;
  v_ativ   uuid;
  v_int    uuid;
  v_txt    text;
  v_num    numeric;
  j        jsonb;
begin
  begin
    -- ========================= preparação =========================
    etapa := 'preparação';
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_socio, 'p12-socio@teste.local', now(), 'authenticated', 'authenticated'),
      (u_outro, 'p12-outro@teste.local', now(), 'authenticated', 'authenticated'),
      (u_sem, 'p12-sem@teste.local', now(), 'authenticated', 'authenticated');
    insert into public.membros (id, user_id, nome, nome_curto, email, papel, acesso_agenda, acesso_clientes, acesso_prazos) values
      (m_socio, u_socio, 'Sócio do teste', 'SócioT', 'p12-socio@teste.local', 'socio', 'propria', 'editar', 'editar'),
      (m_outro, u_outro, 'Outro do teste', 'OutroT', 'p12-outro@teste.local', 'socio', 'propria', 'editar', 'editar'),
      (m_sem, u_sem, 'Sem clientes', 'SemT', 'p12-sem@teste.local', 'associado', 'propria', 'nenhum', 'nenhum');
    insert into public.clientes (nome) values ('Espólio de Fulano') returning id into v_cli;
    insert into public.clientes (nome) values ('Herdeira Um') returning id into v_her1;
    insert into public.clientes (nome) values ('Herdeiro Dois') returning id into v_her2;
    insert into public.clientes (nome) values ('Cliente Estranho') returning id into v_est;
    insert into public.processos (cliente_id, numero, titulo, area, situacao)
      values (v_cli, '00010355820258160208', 'Inventário', 'sucessoes', 'em_andamento') returning id into v_proc;

    -- ========================= 1 · sessão =========================
    etapa := 'sessão';
    select inatividade_minutos into v_num from public.config_seguranca;
    res := res || pg_temp.t(v_num = 60, 'S01 a saída por inatividade passa a 60 minutos', v_num);
    select column_default into v_txt from information_schema.columns
     where table_schema = 'public' and table_name = 'config_seguranca' and column_name = 'inatividade_minutos';
    res := res || pg_temp.t(v_txt like '60%', 'S02 e o padrão da coluna também', v_txt);

    -- ===================== 2 · cronômetro das tarefas =====================
    etapa := 'cronômetro das tarefas';
    perform pg_temp.como(u_socio);
    perform public.iniciar_sessao();
    perform pg_temp.como(u_outro);
    perform public.iniciar_sessao();
    perform pg_temp.como(u_sem);
    perform public.iniciar_sessao();
    perform pg_temp.como(u_socio);
    v_tar := public.criar_tarefa(jsonb_build_object('titulo', 'Petição de inventário', 'responsavel_id', m_socio));
    v_tar2 := public.criar_tarefa(jsonb_build_object('titulo', 'Pesquisar jurisprudência', 'responsavel_id', m_socio));
    v_tar3 := public.criar_tarefa(jsonb_build_object('titulo', 'Do outro sócio', 'responsavel_id', m_outro));

    j := public.iniciar_tarefa(v_tar);
    select situacao || ' | ' || (select count(*) from public.tarefas_tempos where tarefa_id = v_tar and fim is null)
      into v_txt from public.tarefas where id = v_tar;
    res := res || pg_temp.t(v_txt = 'em_andamento | 1', 'C01 iniciar abre um período e põe a tarefa em andamento', v_txt);
    j := public.iniciar_tarefa(v_tar);
    res := res || pg_temp.t((j ->> 'ja_rodando')::boolean, 'C02 iniciar de novo (outra aba) não abre outro período', j);

    v_txt := pg_temp.erro(format('select public.iniciar_tarefa(%L)', v_tar2));
    res := res || pg_temp.t(v_txt like '%Petição de inventário%rodando%', 'C03 com outra tarefa rodando, recusa dizendo qual', v_txt);
    j := public.iniciar_tarefa(v_tar2, true);
    select (select count(*) from public.tarefas_tempos where tarefa_id = v_tar and fim is null) || ' | '
        || (select count(*) from public.tarefas_tempos where tarefa_id = v_tar2 and fim is null) into v_txt;
    res := res || pg_temp.t(v_txt = '0 | 1', 'C04 pedindo, pausa a outra e inicia esta numa transação', v_txt);

    -- Períodos com hora conhecida: 30 min + 20 min = 50 min (o exemplo do pedido).
    perform set_config('role', 'none', true);
    update public.tarefas_tempos set fim = null where false; -- nada: só para trocar de papel
    perform pg_temp.como(u_socio);
    perform public.pausar_tarefa(v_tar2);
    perform set_config('role', 'none', true);
    alter table public.tarefas_tempos disable trigger user;
    update public.tarefas_tempos set inicio = now() - interval '2 hours', fim = now() - interval '90 minutes'
     where tarefa_id = v_tar2;
    insert into public.tarefas_tempos (tarefa_id, membro_id, inicio, fim)
      values (v_tar2, m_socio, now() - interval '60 minutes', now() - interval '40 minutes');
    alter table public.tarefas_tempos enable trigger user;
    perform pg_temp.como(u_socio);
    select tempo_segundos into v_num from public.v_tarefas where id = v_tar2;
    res := res || pg_temp.t(v_num = 3000, 'C05 trabalhou 30 min, pausou, mais 20: o total é 50 min', v_num);
    select jsonb_array_length(periodos)::numeric into v_num from public.v_tarefas where id = v_tar2;
    res := res || pg_temp.t(v_num = 2, 'C06 os períodos ficam na tarefa (histórico do tempo)', v_num);
    select situacao into v_txt from public.tarefas where id = v_tar2;
    res := res || pg_temp.t(v_txt = 'em_andamento', 'C07 pausada continua "em andamento" no banco (a tela mostra Pausada)', v_txt);

    v_txt := pg_temp.erro(format('select public.pausar_tarefa(%L)', v_tar2));
    res := res || pg_temp.t(v_txt like '%não está rodando%', 'C08 pausar o que não está rodando é recusado', v_txt);

    j := public.iniciar_tarefa(v_tar2);
    v_txt := pg_temp.erro(format('select public.pausar_tarefa(%L, %L::timestamptz)', v_tar2, now() + interval '1 hour'));
    res := res || pg_temp.t(v_txt like '%antes de agora%', 'C09 hora real do fim no futuro é recusada', v_txt);
    select jsonb_array_length(cronometros)::numeric into v_num from public.v_tarefas where id = v_tar2;
    res := res || pg_temp.t(v_num = 1, 'C10 a vista mostra o relógio aberto', v_num);
    j := public.meu_cronometro_tarefa();
    res := res || pg_temp.t(j -> 'tarefa' ->> 'id' = v_tar2::text and (j -> 'tarefa' ->> 'anterior')::numeric = 3000,
      'C11 meu_cronometro_tarefa: a tarefa rodando e o tempo já contado', j);

    perform public.finalizar_tarefa(v_tar2);
    select situacao || ' | ' || (select count(*) from public.tarefas_tempos where tarefa_id = v_tar2 and fim is null)
      || ' | ' || (concluida_por = m_socio)::text into v_txt from public.tarefas where id = v_tar2;
    res := res || pg_temp.t(v_txt = 'concluida | 0 | true', 'C12 finalizar fecha o relógio e conclui, com quem concluiu', v_txt);
    v_txt := pg_temp.erro(format('select public.iniciar_tarefa(%L)', v_tar2));
    res := res || pg_temp.t(v_txt like '%reabra antes%', 'C13 tarefa concluída não volta a contar sem reabrir', v_txt);

    -- Concluir pelo botão antigo (ou aba antiga) também fecha o relógio.
    j := public.iniciar_tarefa(v_tar);
    update public.tarefas set situacao = 'concluida' where id = v_tar;
    select count(*) into v_num from public.tarefas_tempos where tarefa_id = v_tar and fim is null;
    res := res || pg_temp.t(v_num = 0, 'C14 concluir de outro jeito fecha o relógio aberto', v_num);

    perform public.reabrir_tarefa(v_tar, 'Faltou anexar');
    j := public.iniciar_tarefa(v_tar);
    update public.tarefas set cancelado_em = now(), motivo_cancelamento = 'Desistiu' where id = v_tar;
    select count(*) into v_num from public.tarefas_tempos where tarefa_id = v_tar and fim is null;
    res := res || pg_temp.t(v_num = 0, 'C15 cancelar a tarefa também fecha o relógio', v_num);

    v_txt := pg_temp.erro(format('select public.iniciar_tarefa(%L)', v_tar3));
    res := res || pg_temp.t(v_txt = 'aceitou', 'C16 quem delegou pode contar o tempo da tarefa do outro', v_txt);
    perform public.pausar_tarefa(v_tar3);
    perform pg_temp.como(u_sem);
    v_txt := pg_temp.erro(format('select public.iniciar_tarefa(%L)', v_tar3));
    res := res || pg_temp.t(v_txt like '42501%', 'C17 quem não é autor, responsável nem administrador não conta tempo', v_txt);
    v_txt := pg_temp.erro(format('insert into public.tarefas_tempos (tarefa_id, membro_id, inicio) values (%L, %L, now())', v_tar3, m_sem));
    res := res || pg_temp.t(v_txt like '42501%', 'C18 ninguém grava período direto na tabela', v_txt);
    select count(*) into v_num from public.tarefas_tempos where tarefa_id = v_tar3;
    res := res || pg_temp.t(v_num = 1, 'C19 todo membro vê o tempo das tarefas (como as tarefas)', v_num);

    perform set_config('role', 'none', true);
    v_txt := pg_temp.erro(format('update public.tarefas_tempos set fim = now() + interval ''1 day'' where tarefa_id = %L', v_tar3));
    res := res || pg_temp.t(v_txt like '%já encerrado%', 'C20 período fechado não muda nem pelo dono do banco', v_txt);
    select count(*) into v_num from public.auditoria where tabela = 'tarefas_tempos';
    res := res || pg_temp.t(v_num >= 4, 'C21 cada período fica no histórico', v_num);

    -- ===================== 3 · vários lembretes =====================
    etapa := 'lembretes';
    perform pg_temp.como(u_socio);
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, lembretes)
      values (m_socio, 'audiencia', 'presencial', 'Audiência', now() + interval '10 days', now() + interval '10 days 1 hour',
              array[10, 60, 1440, 10080])
      returning id into v_comp;
    select lembretes::text || ' | ' || coalesce(lembrete_minutos::text, '∅') into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = '{10080,1440,60,10} | 60', 'L01 quatro lembretes, em ordem; o campo antigo fica com o menor que aceita', v_txt);

    v_txt := pg_temp.erro(format('update public.compromissos set lembretes = array[1,2,3,4,5,6] where id = %L', v_comp));
    res := res || pg_temp.t(v_txt like '23514%', 'L02 mais de 5 lembretes é recusado', v_txt);
    v_txt := pg_temp.erro(format('update public.compromissos set lembretes = array[40321] where id = %L', v_comp));
    res := res || pg_temp.t(v_txt like '23514%', 'L03 mais de 4 semanas antes é recusado', v_txt);
    update public.compromissos set lembretes = array[60, 60, 1440] where id = v_comp;
    select lembretes::text into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = '{1440,60}', 'L04 repetido entra uma vez só', v_txt);

    -- Tela antiga, aberta num navegador: só conhece lembrete_minutos.
    update public.compromissos set titulo = 'Audiência de instrução' where id = v_comp;
    select lembretes::text into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = '{1440,60}', 'L05 a tela antiga mudando outro campo não apaga os lembretes', v_txt);
    update public.compromissos set lembrete_minutos = 30 where id = v_comp;
    select lembretes::text into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = '{1440,30}', 'L06 a tela antiga troca só o lembrete que ela vê (o de 1 hora); o outro fica', v_txt);
    -- Aba antiga desatualizada: carregou 60, a tela nova mudou a lista, ela salva o título com 60.
    update public.compromissos set lembretes = array[10080, 1440, 30, 10] where id = v_comp;
    update public.compromissos set lembrete_minutos = 60, titulo = 'Pela aba antiga' where id = v_comp;
    select lembretes::text into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = '{10080,1440,60,10}', 'L06b aba antiga desatualizada não apaga os lembretes que não vê', v_txt);
    update public.compromissos set lembrete_minutos = null where id = v_comp;
    select lembretes::text into v_txt from public.compromissos where id = v_comp;
    res := res || pg_temp.t(v_txt = '{10080,1440,10}', 'L06c "Sem lembrete" na aba antiga tira só o dela', v_txt);
    update public.compromissos set lembretes = array[1440, 60] where id = v_comp;
    update public.compromissos set lembrete_minutos = 30 where id = v_comp;
    v_txt := pg_temp.erro(format('update public.compromissos set lembrete_minutos = -1 where id = %L', v_comp));
    res := res || pg_temp.t(v_txt like '23514%', 'L07 lembrete antigo inválido continua recusado', v_txt);
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, lembrete_minutos)
      values (m_socio, 'atendimento', 'presencial', 'Pela tela antiga', now() + interval '3 days', now() + interval '3 days 1 hour', 120)
      returning id into v_comp2;
    select lembretes::text into v_txt from public.compromissos where id = v_comp2;
    res := res || pg_temp.t(v_txt = '{120}', 'L08 compromisso novo pela tela antiga ganha a lista', v_txt);

    update public.compromissos set lembretes = array[10080, 10] where id = v_comp;
    select lembretes::text into v_txt from public.agenda_periodo(now(), now() + interval '20 days') where id = v_comp;
    res := res || pg_temp.t(v_txt = '{10080,10}', 'L09 a agenda devolve os lembretes', v_txt);
    v_num := (select count(*) from public.agenda_periodo(now(), now() + interval '20 days'));
    res := res || pg_temp.t(v_num >= 2, 'L10 e continua devolvendo o período', v_num);

    -- Particular de outro: horário à mostra, lembretes não.
    perform pg_temp.como(u_outro);
    insert into public.compromissos (membro_id, tipo, inicio, fim, particular, lembretes)
      values (m_outro, 'interno', now() + interval '1 day', now() + interval '1 day 1 hour', true, array[15]);
    perform pg_temp.como(u_socio);
    select coalesce(lembretes::text, '∅') into v_txt from public.agenda_periodo(now(), now() + interval '2 days')
     where membro_id = m_outro and mascarado;
    res := res || pg_temp.t(v_txt = '{}', 'L11 particular de outro membro sai sem os lembretes', v_txt);

    v_comp2 := public.remarcar_compromisso(v_comp, now() + interval '11 days', now() + interval '11 days 1 hour');
    select lembretes::text into v_txt from public.compromissos where id = v_comp2;
    res := res || pg_temp.t(v_txt = '{10080,10}', 'L12 remarcar leva os lembretes para o novo horário', v_txt);

    insert into public.intimacoes (fonte, disponibilizada_em, publicada_em, texto, cliente_id, processo_id, numero_processo, membro_id)
      values ('manual', privado.hoje(), privado.hoje(), 'Designada audiência.', v_cli, v_proc, '00010355820258160208', m_socio)
      returning id into v_int;
    v_comp2 := public.lancar_audiencia_intimacao(v_int, jsonb_build_object('tipo', 'audiencia', 'membro_id', m_socio,
      'cliente_id', v_cli, 'modalidade', 'online', 'inicio', now() + interval '5 days', 'fim', now() + interval '5 days 1 hour',
      'lembretes', jsonb_build_array(10080, 1440, 60, 10)));
    select lembretes::text into v_txt from public.compromissos where id = v_comp2;
    res := res || pg_temp.t(v_txt = '{10080,1440,60,10}', 'L13 audiência lançada da intimação guarda os lembretes', v_txt);

    -- Fila do Google: mudar só os lembretes reenvia o evento.
    perform set_config('role', 'none', true);
    update public.membros set google_agenda = 'c_teste1211@group.calendar.google.com' where id = m_socio;
    update privado.google_eventos set situacao = 'ok' where compromisso_id = v_comp2;
    insert into privado.google_eventos (compromisso_id, origem, situacao)
      select v_comp2, 'sistema', 'ok' where not exists (select 1 from privado.google_eventos where compromisso_id = v_comp2);
    perform pg_temp.como(u_socio);
    update public.compromissos set lembretes = array[30] where id = v_comp2;
    perform set_config('role', 'none', true);
    select situacao into v_txt from privado.google_eventos where compromisso_id = v_comp2;
    res := res || pg_temp.t(v_txt = 'pendente', 'L14 mudar os lembretes manda o evento de novo ao Google', v_txt);
    select (x ->> 'lembretes') into v_txt from jsonb_array_elements(public.google_agenda_pendencias(200)) x
     where (x ->> 'id')::uuid = v_comp2;
    res := res || pg_temp.t(v_txt = '[30]', 'L15 a função do Google recebe os lembretes', v_txt);

    -- ================ 4 · vários clientes no mesmo processo ================
    etapa := 'partes do processo';
    perform pg_temp.como(u_socio);
    insert into public.processos_partes (processo_id, cliente_id, posicao) values (v_proc, v_her1, ' Herdeira ')
      returning id into v_parte;
    select posicao into v_txt from public.processos_partes where id = v_parte;
    res := res || pg_temp.t(v_txt = 'Herdeira', 'P01 quem edita Clientes acrescenta uma parte, com a condição dela', v_txt);
    v_txt := pg_temp.erro(format('insert into public.processos_partes (processo_id, cliente_id) values (%L, %L)', v_proc, v_her1));
    res := res || pg_temp.t(v_txt like '%já é parte%', 'P02 a mesma pessoa não entra duas vezes', v_txt);
    v_txt := pg_temp.erro(format('insert into public.processos_partes (processo_id, cliente_id) values (%L, %L)', v_proc, v_cli));
    res := res || pg_temp.t(v_txt like '%cliente principal%', 'P03 o cliente principal não entra como parte', v_txt);
    v_txt := pg_temp.erro(format('update public.processos_partes set cliente_id = %L where id = %L', v_her2, v_parte));
    res := res || pg_temp.t(v_txt like '42501%' or v_txt like '%retire a parte%', 'P04 a pessoa da parte não é trocada', v_txt);

    v_tar := public.criar_tarefa(jsonb_build_object('titulo', 'Primeiras declarações', 'responsavel_id', m_socio,
      'cliente_id', v_her1, 'processo_id', v_proc));
    res := res || pg_temp.t(v_tar is not null, 'P05 tarefa da herdeira no processo do inventário é aceita', v_tar);
    v_txt := pg_temp.erro(format($q$select public.criar_tarefa(%L::jsonb)$q$, jsonb_build_object('titulo', 'X',
      'responsavel_id', m_socio, 'cliente_id', v_est, 'processo_id', v_proc)));
    res := res || pg_temp.t(v_txt like '%pertencer ao cliente%', 'P06 cliente que não é parte continua recusado', v_txt);
    insert into public.atualizacoes (cliente_id, processo_id, membro_id, tipo, inicio, fim, relato)
      values (v_her1, v_proc, m_socio, 'telefone', now() - interval '10 minutes', now(), 'Ligou para saber do inventário')
      returning id into v_ativ;
    res := res || pg_temp.t(v_ativ is not null, 'P07 atualização da herdeira no processo é aceita', v_ativ);
    v_txt := pg_temp.erro(format($q$insert into public.documentos (modelo, titulo, cliente_id, processo_id, conteudo)
      values ('procuracao', 'PROCURAÇÃO', %L, %L, '<p>Texto</p>')$q$, v_her1, v_proc));
    res := res || pg_temp.t(v_txt = 'aceitou', 'P08 documento da herdeira no processo é aceito', v_txt);
    v_txt := pg_temp.erro(format('update public.intimacoes set cliente_id = %L where id = %L', v_her1, v_int));
    res := res || pg_temp.t(v_txt = 'aceitou', 'P09 intimação do processo pode ficar com a herdeira', v_txt);

    v_txt := pg_temp.erro(format($q$update public.processos_partes set cancelado_em = now(), motivo_cancelamento = 'Erro' where id = %L$q$, v_parte));
    res := res || pg_temp.t(v_txt like '%tarefa aberta%', 'P10 parte com tarefa aberta no processo não é retirada', v_txt);
    update public.tarefas set situacao = 'concluida' where id = v_tar;
    update public.processos_partes set cancelado_em = now(), motivo_cancelamento = 'Renunciou à herança' where id = v_parte;
    select (cancelado_por = m_socio)::text into v_txt from public.processos_partes where id = v_parte;
    res := res || pg_temp.t(v_txt = 'true', 'P11 retirar a parte é cancelar, com motivo e quem', v_txt);
    update public.atualizacoes set relato = 'Ligou de novo' where id = v_ativ;
    select relato into v_txt from public.atualizacoes where id = v_ativ;
    res := res || pg_temp.t(v_txt = 'Ligou de novo', 'P12 o que já estava ligado à parte retirada continua editável', v_txt);
    v_txt := pg_temp.erro(format($q$select public.criar_tarefa(%L::jsonb)$q$, jsonb_build_object('titulo', 'Nova',
      'responsavel_id', m_socio, 'cliente_id', v_her1, 'processo_id', v_proc)));
    res := res || pg_temp.t(v_txt like '%pertencer ao cliente%', 'P13 depois de retirada, não aceita coisa nova da parte', v_txt);

    perform pg_temp.como(u_sem);
    v_txt := pg_temp.erro(format('insert into public.processos_partes (processo_id, cliente_id) values (%L, %L)', v_proc, v_her2));
    res := res || pg_temp.t(v_txt like '42501%', 'P14 sem acesso a Clientes não acrescenta parte', v_txt);
    select count(*) into v_num from public.processos_partes where processo_id = v_proc;
    res := res || pg_temp.t(v_num = 1, 'P15 mas lê as partes (todo membro lê processos)', v_num);

    -- salvar_processo: processo e partes numa transação.
    perform pg_temp.como(u_socio);
    v_proc2 := public.salvar_processo(jsonb_build_object('cliente_id', v_cli, 'titulo', 'Arrolamento', 'area', 'sucessoes',
      'situacao', 'em_andamento', 'posicao_cliente', 'Inventariante',
      'partes', jsonb_build_array(jsonb_build_object('cliente_id', v_her1, 'posicao', 'Herdeiro(a)'),
                                  jsonb_build_object('cliente_id', v_her2, 'posicao', 'Herdeiro(a)'))));
    select count(*) into v_num from public.processos_partes where processo_id = v_proc2 and cancelado_em is null;
    res := res || pg_temp.t(v_num = 2, 'P16 salvar_processo grava o processo e as duas partes', v_num);
    select posicao_cliente into v_txt from public.processos where id = v_proc2;
    res := res || pg_temp.t(v_txt = 'Inventariante', 'P17 com a condição do cliente principal', v_txt);

    select count(*) into v_num from public.processos;
    v_txt := pg_temp.erro(format($q$select public.salvar_processo(%L::jsonb)$q$, jsonb_build_object('cliente_id', v_cli,
      'titulo', 'Outro', 'area', 'sucessoes', 'partes', jsonb_build_array(jsonb_build_object('cliente_id', v_her1),
      jsonb_build_object('cliente_id', v_her1)))));
    res := res || pg_temp.t(v_txt like '%duas vezes%' and v_num = (select count(*) from public.processos),
      'P18 parte repetida recusa tudo: nem o processo fica', v_txt);

    select id into v_parte from public.processos_partes where processo_id = v_proc2 and cliente_id = v_her2;
    perform public.salvar_processo(jsonb_build_object('id', v_proc2, 'cliente_id', v_cli, 'titulo', 'Arrolamento sumário',
      'area', 'sucessoes', 'situacao', 'suspenso',
      'partes', jsonb_build_array(jsonb_build_object('id', (select id from public.processos_partes where processo_id = v_proc2 and cliente_id = v_her1),
                                                     'cliente_id', v_her1, 'posicao', 'Meeira')),
      'remover', jsonb_build_array(jsonb_build_object('id', v_parte, 'motivo', 'Cadastrado por engano'))));
    select string_agg(c.nome || '=' || coalesce(pp.posicao, '∅') || '=' || (pp.cancelado_em is null)::text, ', ' order by c.nome)
      into v_txt from public.processos_partes pp join public.clientes c on c.id = pp.cliente_id where pp.processo_id = v_proc2;
    res := res || pg_temp.t(v_txt = 'Herdeira Um=Meeira=true, Herdeiro Dois=Herdeiro(a)=false',
      'P19 editar: muda a condição de uma e retira a outra com motivo', v_txt);
    select titulo || ' | ' || situacao into v_txt from public.processos where id = v_proc2;
    res := res || pg_temp.t(v_txt = 'Arrolamento sumário | suspenso', 'P20 e salva os dados do processo', v_txt);

    perform pg_temp.como(u_sem);
    v_txt := pg_temp.erro(format($q$select public.salvar_processo(%L::jsonb)$q$, jsonb_build_object('cliente_id', v_cli,
      'titulo', 'Intruso', 'area', 'civel')));
    res := res || pg_temp.t(v_txt like '42501%', 'P21 sem acesso a Clientes não salva processo', v_txt);

    perform pg_temp.como(u_outro);
    select count(*) into v_num from public.auditoria where tabela = 'processos_partes';
    res := res || pg_temp.t(v_num >= 4, 'P22 as partes ficam no histórico, visível a todo membro', v_num);

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

select * from pg_temp.testar_pedidos_1211();
