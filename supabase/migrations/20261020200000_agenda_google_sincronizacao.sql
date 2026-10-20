-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 34 · Google Agenda nos dois sentidos
-- =============================================================================
--
-- A agenda do escritório no Google é uma só, na conta contato@ (Workspace),
-- com uma subagenda por advogado (membros.google_agenda, migração 33). A
-- página de agendamento de cada um consulta só a subagenda dele.
--
-- Até aqui, "Pôr no Google Agenda" abria o formulário do Google para alguém
-- salvar à mão. Agora a função de borda google-agenda sincroniza sozinha:
--
--   · sistema → Google: o que é marcado, alterado ou cancelado aqui vai para
--     a subagenda do responsável (particular vai como "Ocupado");
--   · Google → sistema: o que é marcado no Google (inclusive pelo cliente, na
--     página de agendamento) aparece aqui; mudança de horário e exclusão no
--     Google também. De um compromisso lançado aqui, o Google só muda horário
--     ou exclui — título e detalhes continuam sendo os do sistema.
--
-- O sistema só escreve nos eventos que ele mesmo criou. O que nasceu no
-- Google (reservas de clientes, eventos dos advogados) nunca é alterado nem
-- excluído por aqui: muda-se no Google, e o sistema acompanha. Pedido do
-- Ithalo ao publicar: não mexer nas agendas que já existem.
--
-- Quando roda: o banco avisa a função logo depois de cada mudança (pg_net) e o
-- pg_cron chama a cada 2 minutos, para trazer o que mudou no Google. Os dois
-- só existem no Supabase: na prévia local e nos testes, a sincronização roda
-- pelo botão "Atualizar".
--
-- A autorização do Google (refresh token) fica só aqui, em privado, lida
-- apenas pela função com a chave do servidor. Ninguém a vê pela tela.
--
-- O estado da sincronização mora fora de compromissos: compromisso cancelado
-- não aceita mais alteração (registrar_cancelamento), e o Google ainda
-- precisa saber que ele saiu.

-- -----------------------------------------------------------------------------
-- Conexão, pedidos de autorização e endereço da função
-- -----------------------------------------------------------------------------

create table privado.google_conexao (
  unica                boolean primary key default true check (unica),
  conta                text not null,
  refresh_token        text not null,
  escopos              text,
  -- Senha das chamadas do próprio banco (pg_cron e pg_net) à função.
  token_cron           text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  conectado_em         timestamptz not null default now(),
  conectado_por        uuid references public.membros (id),
  travado_ate          timestamptz,
  ultima_sincronizacao timestamptz,
  ultimo_erro          text,
  ultimo_erro_em       timestamptz,
  ultimo_aviso_em      timestamptz
);

-- "state" do OAuth: liga a volta do Google ao administrador que pediu.
create table privado.google_oauth_estados (
  estado     text primary key,
  membro_id  uuid not null references public.membros (id),
  criado_em  timestamptz not null default now(),
  usado_em   timestamptz
);

create table privado.google_config (
  unica      boolean primary key default true check (unica),
  -- Nulo fora do Supabase: sem aviso pelo banco.
  url_funcao text
);
insert into privado.google_config default values;

-- -----------------------------------------------------------------------------
-- Um compromisso ↔ um evento do Google
-- -----------------------------------------------------------------------------

create table privado.google_eventos (
  compromisso_id       uuid primary key references public.compromissos (id),
  -- Onde nasceu: no sistema, ou no Google (trazido para cá).
  origem               text not null check (origem in ('sistema', 'google')),
  calendario           text,
  evento_id            text,   -- nulo: não está no Google
  etag                 text,
  google_atualizado_em timestamptz,
  situacao             text not null default 'pendente' check (situacao in ('pendente', 'ok', 'erro')),
  erro                 text,
  tentativas           smallint not null default 0,
  mudou_em             timestamptz not null default clock_timestamp(),
  sincronizado_em      timestamptz
);

create unique index google_eventos_evento on privado.google_eventos (calendario, evento_id)
  where evento_id is not null;
create index google_eventos_pendentes on privado.google_eventos (mudou_em)
  where situacao <> 'ok';

-- Duas pessoas na mesma subagenda deixariam o evento sem dono.
create unique index membros_google_agenda on public.membros (google_agenda)
  where google_agenda is not null;

revoke all on privado.google_conexao, privado.google_oauth_estados, privado.google_config, privado.google_eventos
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Avisar a função (só no Supabase, onde há pg_net)
-- -----------------------------------------------------------------------------

create function privado.google_chamar(p_minimo interval)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url   text;
  v_token text;
begin
  select url_funcao into v_url from privado.google_config;
  if v_url is null then
    return;
  end if;
  -- Sem conexão, nada a fazer; com aviso recente, a rodada em curso pega.
  update privado.google_conexao
     set ultimo_aviso_em = clock_timestamp()
   where ultimo_aviso_em is null or ultimo_aviso_em < clock_timestamp() - p_minimo
  returning token_cron into v_token;
  if v_token is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{"acao": "sincronizar"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fl-cron', v_token),
    timeout_milliseconds := 60000);
end
$$;

create function privado.google_avisar()
returns void
language sql security definer set search_path = ''
as $$ select privado.google_chamar(interval '5 seconds') $$;

create function privado.google_cron()
returns void
language sql security definer set search_path = ''
as $$ select privado.google_chamar(interval '0 seconds') $$;

-- -----------------------------------------------------------------------------
-- O que muda aqui fica pendente para o Google
-- -----------------------------------------------------------------------------

create function privado.google_marcar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- A própria sincronização aplicando o que veio do Google.
  if coalesce(current_setting('fl.google', true), '') = 'aplicando' then
    return null;
  end if;
  -- Chegada do cliente, realizado e faltou não mudam nada no Google.
  if tg_op = 'UPDATE'
     and (old.membro_id, old.tipo, old.modalidade, old.titulo, old.inicio, old.fim, old.dia_inteiro,
          old.cliente_id, old.processo, old.local_ou_link, old.particular, old.situacao = 'remarcado',
          old.lembrete_minutos, old.cancelado_em)
         is not distinct from
         (new.membro_id, new.tipo, new.modalidade, new.titulo, new.inicio, new.fim, new.dia_inteiro,
          new.cliente_id, new.processo, new.local_ou_link, new.particular, new.situacao = 'remarcado',
          new.lembrete_minutos, new.cancelado_em) then
    return null;
  end if;

  -- O que veio do Google não volta para lá: muda-se no Google.
  if exists (select 1 from privado.google_eventos where compromisso_id = new.id and origem = 'google') then
    return null;
  end if;
  update privado.google_eventos
     set situacao = 'pendente', erro = null, tentativas = 0, mudou_em = clock_timestamp()
   where compromisso_id = new.id;
  if not found then
    if new.cancelado_em is not null or new.situacao = 'remarcado'
       or not exists (select 1 from public.membros m where m.id = new.membro_id and m.google_agenda is not null) then
      return null;
    end if;
    insert into privado.google_eventos (compromisso_id, origem) values (new.id, 'sistema');
  end if;

  perform privado.google_avisar();
  return null;
end
$$;

create trigger y_google after insert or update on public.compromissos
  for each row execute function privado.google_marcar();

-- Agenda do Google definida, trocada ou membro desativado: os compromissos
-- daqui em diante lançados no sistema vão (ou saem) de acordo.
create function privado.google_membro()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.google_agenda is not distinct from old.google_agenda and new.ativo = old.ativo then
    return null;
  end if;

  update privado.google_eventos g
     set situacao = 'pendente', erro = null, tentativas = 0, mudou_em = clock_timestamp()
    from public.compromissos c
   where c.id = g.compromisso_id and g.origem = 'sistema' and c.membro_id = new.id and c.fim > now();

  if new.google_agenda is not null and new.ativo then
    insert into privado.google_eventos (compromisso_id, origem)
    select c.id, 'sistema'
      from public.compromissos c
     where c.membro_id = new.id and c.cancelado_em is null and c.situacao <> 'remarcado'
       and c.fim > now()
    on conflict (compromisso_id) do nothing;
  end if;

  perform privado.google_avisar();
  return null;
end
$$;

create trigger y_google after update of google_agenda, ativo on public.membros
  for each row execute function privado.google_membro();

-- O que já estava marcado no sistema, daqui em diante, também vai (se já foi
-- copiado à mão para o Google, é ligado à cópia, sem reescrevê-la).
insert into privado.google_eventos (compromisso_id, origem)
select c.id, 'sistema'
  from public.compromissos c
  join public.membros m on m.id = c.membro_id
 where m.google_agenda is not null and m.ativo and c.cancelado_em is null
   and c.situacao <> 'remarcado' and c.fim > now();

-- -----------------------------------------------------------------------------
-- Para a tela (membros com acesso à agenda; conectar, só o administrador)
-- -----------------------------------------------------------------------------

create function public.google_agenda_situacao()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if privado.acesso_agenda() = 'nenhum' then
    raise exception 'Sem acesso à agenda.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'conectado', c.unica is not null,
      'conta', c.conta,
      'conectado_em', c.conectado_em,
      'ultima_sincronizacao', c.ultima_sincronizacao,
      'ultimo_erro', c.ultimo_erro,
      'ultimo_erro_em', c.ultimo_erro_em,
      'pendentes', (select count(*) from privado.google_eventos where situacao = 'pendente'),
      'com_erro', (select count(*) from privado.google_eventos where situacao = 'erro'))
      from (select 1) x
      left join privado.google_conexao c on true);
end
$$;

create function public.google_agenda_estados(p_ids uuid[])
returns table (compromisso_id uuid, origem text, situacao text, erro text,
               sincronizado_em timestamptz, no_google boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if privado.acesso_agenda() = 'nenhum' then
    raise exception 'Sem acesso à agenda.' using errcode = '42501';
  end if;
  return query
  select g.compromisso_id, g.origem, g.situacao,
         -- O erro de um particular alheio poderia citar o conteúdo.
         case when c.particular and c.membro_id is distinct from privado.meu_membro_id() then null else g.erro end,
         g.sincronizado_em, g.evento_id is not null
    from privado.google_eventos g
    join public.compromissos c on c.id = g.compromisso_id
   where g.compromisso_id = any (coalesce(p_ids, '{}'));
end
$$;

create function public.google_agenda_pode_administrar()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(privado.eh_admin(), false) $$;

create function public.google_agenda_iniciar()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_estado text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not coalesce(privado.eh_admin(), false) then
    raise exception 'Só o administrador conecta o Google Agenda.' using errcode = '42501';
  end if;
  delete from privado.google_oauth_estados where criado_em < now() - interval '1 day';
  insert into privado.google_oauth_estados (estado, membro_id) values (v_estado, privado.meu_membro_id());
  return v_estado;
end
$$;

-- -----------------------------------------------------------------------------
-- Para a função de borda (só com a chave do servidor)
-- -----------------------------------------------------------------------------

create function public.google_agenda_conexao()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('conta', c.conta, 'refresh_token', c.refresh_token, 'token_cron', c.token_cron)
    from privado.google_conexao c
$$;

create function public.google_agenda_conectar(p_estado text, p_conta text, p_refresh text, p_escopos text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro uuid;
begin
  update privado.google_oauth_estados
     set usado_em = now()
   where estado = p_estado and usado_em is null and criado_em > now() - interval '15 minutes'
  returning membro_id into v_membro;
  if v_membro is null then
    raise exception 'O pedido de conexão expirou. Comece de novo pelo sistema.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_refresh), '') = '' then
    raise exception 'O Google não devolveu a autorização permanente.' using errcode = 'P0001';
  end if;

  insert into privado.google_conexao (conta, refresh_token, escopos, conectado_por)
  values (lower(p_conta), p_refresh, p_escopos, v_membro)
  on conflict (unica) do update
     set conta = excluded.conta, refresh_token = excluded.refresh_token, escopos = excluded.escopos,
         conectado_em = now(), conectado_por = excluded.conectado_por,
         travado_ate = null, ultimo_erro = null, ultimo_erro_em = null;
  return v_membro;
end
$$;

create function public.google_agenda_remover()
returns void
language sql security definer set search_path = ''
as $$ delete from privado.google_conexao $$;

-- Uma rodada por vez. A trava vence sozinha se a função cair no meio.
create function public.google_agenda_travar()
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update privado.google_conexao
     set travado_ate = clock_timestamp() + interval '140 seconds'
   where travado_ate is null or travado_ate < clock_timestamp();
  return found;
end
$$;

create function public.google_agenda_destravar(p_erro text default null)
returns void
language sql security definer set search_path = ''
as $$
  update privado.google_conexao
     set travado_ate = null,
         ultima_sincronizacao = case when p_erro is null then now() else ultima_sincronizacao end,
         ultimo_erro = left(p_erro, 500),
         ultimo_erro_em = case when p_erro is null then null else now() end
$$;

create function public.google_agenda_calendarios()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('calendario', m.google_agenda, 'membro_id', m.id)
                            order by m.nome_curto), '[]')
    from public.membros m
   where m.ativo and m.google_agenda is not null
$$;

-- O que precisa ir para o Google, com o necessário para montar o evento.
-- destino nulo = o evento não deve existir (cancelado, remarcado ou o
-- responsável sem agenda no Google / desativado).
create function public.google_agenda_pendencias(p_limite integer default 50)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.mudou_em), '[]')
    from (
      select g.compromisso_id as id, g.origem, g.calendario, g.evento_id, g.mudou_em,
             case when c.cancelado_em is null and c.situacao <> 'remarcado' and m.ativo
                  then m.google_agenda end as destino,
             c.cancelado_em is not null as cancelado,
             c.situacao, c.tipo, c.modalidade, c.titulo, c.inicio, c.fim, c.dia_inteiro,
             c.processo, c.local_ou_link, c.particular, c.lembrete_minutos,
             cl.nome as cliente_nome, m.nome_curto as responsavel
        from privado.google_eventos g
        join public.compromissos c on c.id = g.compromisso_id
        join public.membros m on m.id = c.membro_id
        left join public.clientes cl on cl.id = c.cliente_id
       where g.origem = 'sistema'
         and (g.situacao = 'pendente' or (g.situacao = 'erro' and g.tentativas < 8))
       order by g.mudou_em
       limit greatest(1, least(coalesce(p_limite, 50), 200))
    ) x
$$;

-- Resultado do envio. Se o compromisso mudou de novo enquanto ia, continua
-- pendente (com o evento já anotado).
create function public.google_agenda_registrar(p_resultados jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r      jsonb;
  v_ok   boolean;
  v_novo integer;
  n      integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_resultados, '[]')) loop
    v_ok := coalesce((r ->> 'ok')::boolean, false);
    update privado.google_eventos g
       set calendario = case when r ? 'calendario' then r ->> 'calendario' else g.calendario end,
           evento_id = case when r ? 'evento_id' then r ->> 'evento_id' else g.evento_id end,
           etag = case when r ? 'etag' then r ->> 'etag' else g.etag end,
           google_atualizado_em = case when r ? 'atualizado_em' then (r ->> 'atualizado_em')::timestamptz
                                       else g.google_atualizado_em end,
           situacao = case when g.mudou_em is distinct from (r ->> 'mudou_em')::timestamptz then 'pendente'
                           when v_ok then 'ok' else 'erro' end,
           erro = case when v_ok then null else left(r ->> 'erro', 500) end,
           tentativas = case when v_ok then 0 else g.tentativas + 1 end,
           sincronizado_em = case when v_ok then now() else g.sincronizado_em end
     where g.compromisso_id = (r ->> 'id')::uuid;
    get diagnostics v_novo = row_count;
    n := n + v_novo;
  end loop;
  return n;
end
$$;

-- O que veio do Google para uma subagenda. Cada evento já chega normalizado
-- pela função: id, etag, status, atualizado_em e, se não cancelado, titulo,
-- inicio/fim (data quando dia_inteiro), local, descricao, particular, tipo,
-- modalidade. Um evento com problema não impede os outros.
create function public.google_agenda_aplicar(p_calendario text, p_eventos jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro    uuid;
  e           jsonb;
  g           privado.google_eventos;
  c           public.compromissos;
  v_cid       uuid;
  v_id        uuid;
  v_dia       boolean;
  v_ini       timestamptz;
  v_fim       timestamptz;
  v_atual     timestamptz;
  v_criados   integer := 0;
  v_alterados integer := 0;
  v_cancel    integer := 0;
  v_erros     jsonb := '[]';
begin
  select m.id into v_membro from public.membros m where m.google_agenda = p_calendario and m.ativo;
  if v_membro is null then
    return jsonb_build_object('erro', 'Subagenda sem membro ativo.');
  end if;
  perform set_config('fl.google', 'aplicando', true);

  for e in select * from jsonb_array_elements(coalesce(p_eventos, '[]')) loop
    begin
      v_atual := (e ->> 'atualizado_em')::timestamptz;
      -- Evento criado pelo sistema: id "fl" + id do compromisso.
      v_cid := case when e ->> 'id' ~ '^fl[0-9a-f]{32}$' then substr(e ->> 'id', 3)::uuid end;

      select * into g from privado.google_eventos x where x.calendario = p_calendario and x.evento_id = e ->> 'id';
      if not found and v_cid is not null then
        select * into g from privado.google_eventos x where x.compromisso_id = v_cid;
      end if;

      if e ->> 'status' = 'cancelled' then
        -- Só vale na subagenda onde o evento está: mover de uma subagenda para
        -- outra no Google aparece como excluído na de origem.
        if g.compromisso_id is null or g.calendario is distinct from p_calendario
           or g.evento_id is distinct from e ->> 'id' then
          continue;
        end if;
        select * into c from public.compromissos x where x.id = g.compromisso_id;
        if g.situacao <> 'ok' and g.mudou_em > coalesce(v_atual, '-infinity') then
          -- Mudou aqui depois de sair do Google: volta a ir.
          update privado.google_eventos set evento_id = null, etag = null where compromisso_id = g.compromisso_id;
          continue;
        end if;
        if c.cancelado_em is null then
          update public.compromissos set cancelado_em = now(), motivo_cancelamento = 'Excluído no Google Agenda'
           where id = c.id;
          v_cancel := v_cancel + 1;
        end if;
        update privado.google_eventos
           set evento_id = null, calendario = null, etag = null, google_atualizado_em = v_atual,
               situacao = 'ok', erro = null, tentativas = 0, sincronizado_em = now()
         where compromisso_id = g.compromisso_id;
        continue;
      end if;

      v_dia := coalesce((e ->> 'dia_inteiro')::boolean, false);
      if v_dia then
        v_ini := ((e ->> 'inicio')::date)::timestamp at time zone 'America/Sao_Paulo';
        v_fim := ((e ->> 'fim')::date)::timestamp at time zone 'America/Sao_Paulo';
      else
        v_ini := (e ->> 'inicio')::timestamptz;
        v_fim := (e ->> 'fim')::timestamptz;
      end if;

      if g.compromisso_id is not null then
        if g.etag is not distinct from e ->> 'etag' and g.calendario is not distinct from p_calendario then
          continue;  -- nada mudou (ou a mudança foi nossa)
        end if;
        if g.situacao <> 'ok' and g.mudou_em > coalesce(v_atual, '-infinity') then
          continue;  -- o sistema é mais novo: o envio sobrescreve
        end if;
        select * into c from public.compromissos x where x.id = g.compromisso_id;
        if c.cancelado_em is not null or c.situacao = 'remarcado' then
          -- Saiu daqui, mas continua no Google. O que o sistema criou, tira
          -- de novo; o que veio do Google fica lá (só se acompanha).
          update privado.google_eventos
             set calendario = p_calendario, evento_id = e ->> 'id', etag = e ->> 'etag',
                 google_atualizado_em = v_atual,
                 situacao = case when g.origem = 'sistema' then 'pendente' else 'ok' end,
                 mudou_em = case when g.origem = 'sistema' then clock_timestamp() else mudou_em end
           where compromisso_id = c.id;
          continue;
        end if;

        if g.origem = 'sistema' then
          -- Do Google, só horário e dono (subagenda) mudam o que é do sistema.
          if (c.inicio, c.fim, c.dia_inteiro, c.membro_id) is distinct from (v_ini, v_fim, v_dia, v_membro) then
            update public.compromissos set inicio = v_ini, fim = v_fim, dia_inteiro = v_dia, membro_id = v_membro
             where id = c.id;
            v_alterados := v_alterados + 1;
          end if;
        elsif (c.titulo, c.inicio, c.fim, c.dia_inteiro, c.local_ou_link, c.observacoes, c.particular, c.membro_id)
              is distinct from
              (e ->> 'titulo', v_ini, v_fim, v_dia, nullif(e ->> 'local', ''), nullif(e ->> 'descricao', ''),
               coalesce((e ->> 'particular')::boolean, false), v_membro) then
          update public.compromissos
             set titulo = e ->> 'titulo', inicio = v_ini, fim = v_fim, dia_inteiro = v_dia,
                 local_ou_link = nullif(e ->> 'local', ''), observacoes = nullif(e ->> 'descricao', ''),
                 particular = coalesce((e ->> 'particular')::boolean, false), membro_id = v_membro
           where id = c.id;
          v_alterados := v_alterados + 1;
        end if;

        update privado.google_eventos
           set calendario = p_calendario, evento_id = e ->> 'id', etag = e ->> 'etag',
               google_atualizado_em = v_atual, situacao = 'ok', erro = null, tentativas = 0,
               sincronizado_em = now()
         where compromisso_id = c.id;
        continue;
      end if;

      -- Novo no Google. Se é a cópia de um compromisso daqui (botão "Pôr no
      -- Google Agenda" ou .ics: mesmo responsável, horário e título), liga os
      -- dois em vez de duplicar, sem reescrever a cópia. Reserva de cliente
      -- nunca é cópia.
      select x.* into c
        from public.compromissos x
        left join public.clientes cl on cl.id = x.cliente_id
        left join privado.google_eventos y on y.compromisso_id = x.id
       where not coalesce((e ->> 'reserva')::boolean, false)
         and x.membro_id = v_membro and x.cancelado_em is null and x.situacao <> 'remarcado'
         and x.inicio = v_ini and x.fim = v_fim and y.evento_id is null
         and lower(btrim(e ->> 'titulo')) in (lower(btrim(coalesce(x.titulo, ''))), lower(btrim(coalesce(cl.nome, ''))))
       order by x.criado_em
       limit 1;
      if found then
        insert into privado.google_eventos (compromisso_id, origem, calendario, evento_id, etag,
                                            google_atualizado_em, situacao, sincronizado_em)
        values (c.id, 'sistema', p_calendario, e ->> 'id', e ->> 'etag', v_atual, 'ok', now())
        on conflict (compromisso_id) do update
           set calendario = excluded.calendario, evento_id = excluded.evento_id, etag = excluded.etag,
               google_atualizado_em = excluded.google_atualizado_em, situacao = 'ok', erro = null,
               tentativas = 0, sincronizado_em = now();
        continue;
      end if;

      insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, dia_inteiro,
                                       local_ou_link, observacoes, particular)
      values (v_membro, coalesce(e ->> 'tipo', 'interno'), nullif(e ->> 'modalidade', ''),
              e ->> 'titulo', v_ini, v_fim, v_dia, nullif(e ->> 'local', ''), nullif(e ->> 'descricao', ''),
              coalesce((e ->> 'particular')::boolean, false))
      returning id into v_id;
      insert into privado.google_eventos (compromisso_id, origem, calendario, evento_id, etag,
                                          google_atualizado_em, situacao, sincronizado_em)
      values (v_id, 'google', p_calendario, e ->> 'id', e ->> 'etag', v_atual, 'ok', now());
      v_criados := v_criados + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_object('id', e ->> 'id', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('criados', v_criados, 'alterados', v_alterados, 'cancelados', v_cancel,
                            'erros', v_erros);
end
$$;

-- Eventos que o sistema liga a esta subagenda, no período, mas que não vieram
-- na lista do Google (apagados de vez, ou movidos para fora do período).
create function public.google_agenda_conferir(p_calendario text, p_vistos text[], p_de timestamptz, p_ate timestamptz)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(g.evento_id), '[]')
    from privado.google_eventos g
    join public.compromissos c on c.id = g.compromisso_id
   where g.calendario = p_calendario and g.evento_id is not null and c.cancelado_em is null
     and c.inicio < p_ate and c.fim > p_de
     and not (g.evento_id = any (coalesce(p_vistos, '{}')))
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------

revoke execute on function
  public.google_agenda_situacao(), public.google_agenda_estados(uuid[]),
  public.google_agenda_pode_administrar(), public.google_agenda_iniciar(),
  public.google_agenda_conexao(), public.google_agenda_conectar(text, text, text, text),
  public.google_agenda_remover(), public.google_agenda_travar(), public.google_agenda_destravar(text),
  public.google_agenda_calendarios(), public.google_agenda_pendencias(integer),
  public.google_agenda_registrar(jsonb), public.google_agenda_aplicar(text, jsonb),
  public.google_agenda_conferir(text, text[], timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.google_agenda_situacao(), public.google_agenda_estados(uuid[]),
  public.google_agenda_pode_administrar(), public.google_agenda_iniciar()
  to authenticated;

grant execute on function
  public.google_agenda_conexao(), public.google_agenda_conectar(text, text, text, text),
  public.google_agenda_remover(), public.google_agenda_travar(), public.google_agenda_destravar(text),
  public.google_agenda_calendarios(), public.google_agenda_pendencias(integer),
  public.google_agenda_registrar(jsonb), public.google_agenda_aplicar(text, jsonb),
  public.google_agenda_conferir(text, text[], timestamptz, timestamptz)
  to service_role;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;

-- -----------------------------------------------------------------------------
-- Agendador (só no Supabase): a cada 2 minutos, e o endereço do aviso
-- -----------------------------------------------------------------------------

do $agendador$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    update privado.google_config
       set url_funcao = 'https://ulnpnbzibwbrzrpomgia.supabase.co/functions/v1/google-agenda';
    perform cron.schedule('google-agenda', '*/2 * * * *', 'select privado.google_cron()');
  end if;
end
$agendador$;
