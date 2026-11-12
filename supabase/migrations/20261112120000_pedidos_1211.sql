-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 46 · Pedidos dos advogados de 12/11/2026
-- =============================================================================
--
-- Preparação em docs/historico/preparacao-pedidos-1211.md. Quatro partes:
--
--   1. Sessão: o padrão da saída por inatividade passa de 30 para 60 minutos
--      (a sessão caía com o sistema aberto ao lado do Projudi e do Word).
--   2. Tarefas: cronômetro com pausar, retomar e finalizar. Cada trecho
--      contado é um período em `tarefas_tempos`, com a hora do servidor;
--      o total é a soma. "Pausada" não é situação nova da tarefa (o CHECK
--      e as abas antigas continuam iguais): é "em andamento" com tempo e sem
--      relógio rodando. `v_tarefas` ganha, no fim, a vara do processo, o
--      tempo, os cronômetros abertos e os períodos.
--   3. Agenda: até 5 lembretes por compromisso (`compromissos.lembretes`,
--      0 a 40320 minutos — os limites do Google Agenda). A coluna antiga
--      `lembrete_minutos` continua: a tela antiga, aberta num navegador, e a
--      função do Google da versão anterior a usam. Um gatilho mantém as duas
--      de acordo.
--   4. Processos: vários clientes no mesmo processo (`processos_partes`),
--      cada um com a sua condição (herdeiro, inventariante…). O cliente do
--      processo continua sendo o principal; as outras partes são acrescidas.
--      As conferências "o processo é deste cliente" (documentos,
--      atualizações, tarefas, intimações) aceitam também as partes, e só
--      conferem quando o vínculo muda — retirar uma parte não trava o que já
--      estava ligado a ela.
--
-- Nada do que existe muda de valor, exceto o padrão de 30 → 60 minutos e o
-- preenchimento de `lembretes` a partir de `lembrete_minutos` (35 linhas em
-- 12/11), feito sem disparar gatilhos: não muda carimbo, histórico nem a fila
-- do Google.

-- -----------------------------------------------------------------------------
-- 1 · Sessão: 60 minutos
-- -----------------------------------------------------------------------------
alter table public.config_seguranca alter column inatividade_minutos set default 60;
update public.config_seguranca set inatividade_minutos = 60 where unica and inatividade_minutos = 30;

-- -----------------------------------------------------------------------------
-- 2 · Cronômetro das tarefas
-- -----------------------------------------------------------------------------
create table public.tarefas_tempos (
  id            uuid primary key default gen_random_uuid(),
  tarefa_id     uuid not null references public.tarefas (id),
  membro_id     uuid not null references public.membros (id),
  inicio        timestamptz not null,
  fim           timestamptz,
  -- Fim informado à mão ("esqueci de pausar"), em vez do relógio do servidor.
  fim_informado boolean not null default false,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint tarefas_tempos_periodo check (fim is null or fim >= inicio)
);

comment on table public.tarefas_tempos is
  'Cada trecho de tempo dedicado a uma tarefa (iniciar/retomar abre, pausar/finalizar fecha). O total da tarefa é a soma.';

-- Uma tarefa rodando por pessoa.
create unique index tarefas_tempos_um_aberto on public.tarefas_tempos (membro_id) where fim is null;
create index tarefas_tempos_tarefa on public.tarefas_tempos (tarefa_id);

select privado.aplicar_padrao('public.tarefas_tempos');

-- Período fechado não reabre nem muda; o aberto só ganha o fim.
create function privado.validar_tempo_tarefa()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.fim is not null then
      raise exception 'Período já encerrado não muda.' using errcode = 'P0001';
    end if;
    if (new.tarefa_id, new.membro_id, new.inicio) is distinct from (old.tarefa_id, old.membro_id, old.inicio) then
      raise exception 'O início do período não muda.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger c_validar before insert or update on public.tarefas_tempos
  for each row execute function privado.validar_tempo_tarefa();

-- Todo membro vê (como as tarefas). Ninguém grava direto: só pelas funções.
alter table public.tarefas_tempos enable row level security;
create policy "tarefas_tempos: ver" on public.tarefas_tempos
  for select to authenticated using ((select privado.eh_membro()));

revoke all on public.tarefas_tempos from anon, authenticated;
grant select on public.tarefas_tempos to authenticated;
grant all on public.tarefas_tempos to service_role;

-- Tarefa concluída ou cancelada (por qualquer caminho, até por aba antiga):
-- o relógio que estiver aberto nela fecha junto.
create function privado.fechar_tempos_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.situacao = 'concluida' and old.situacao is distinct from 'concluida')
     or (new.cancelado_em is not null and old.cancelado_em is null) then
    update public.tarefas_tempos set fim = greatest(clock_timestamp(), inicio)
     where tarefa_id = new.id and fim is null;
  end if;
  return null;
end
$$;

create trigger y_fechar_tempos after update on public.tarefas
  for each row execute function privado.fechar_tempos_tarefa();

-- Quem mexe na tarefa: autor, responsável ou administrador (como a política
-- "tarefas: alterar").
create function privado.mexe_na_tarefa(p_criado_por uuid, p_responsavel uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.eh_membro()
     and (p_criado_por = privado.meu_membro_id() or p_responsavel = privado.meu_membro_id() or privado.eh_admin())
$$;

-- Iniciar (ou retomar). Com outra tarefa minha rodando: recusa, ou pausa a
-- outra, se pedido — numa transação só.
create function public.iniciar_tarefa(p_id uuid, p_pausar_outra boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v       public.tarefas;
  v_eu    uuid := privado.meu_membro_id();
  v_aberto public.tarefas_tempos;
  v_titulo text;
  v_agora timestamptz := clock_timestamp();
  v_novo  uuid;
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  select * into v from public.tarefas where id = p_id for update;
  if not found or v.cancelado_em is not null then
    raise exception 'Tarefa não encontrada ou cancelada.' using errcode = 'P0001';
  end if;
  if not privado.mexe_na_tarefa(v.criado_por, v.responsavel_id) then
    raise exception 'Só quem delegou, o responsável ou o administrador conta o tempo desta tarefa.' using errcode = '42501';
  end if;
  if v.situacao = 'concluida' then
    raise exception 'Tarefa concluída: reabra antes de voltar a contar o tempo.' using errcode = 'P0001';
  end if;

  select * into v_aberto from public.tarefas_tempos where membro_id = v_eu and fim is null for update;
  if found then
    if v_aberto.tarefa_id = p_id then
      return jsonb_build_object('id', v_aberto.id, 'inicio', v_aberto.inicio, 'ja_rodando', true);
    end if;
    if not coalesce(p_pausar_outra, false) then
      select titulo into v_titulo from public.tarefas where id = v_aberto.tarefa_id;
      raise exception 'Você já está com a tarefa "%" rodando. Pause-a antes de iniciar outra.', v_titulo
        using errcode = 'P0001', hint = 'outra_tarefa_rodando';
    end if;
    update public.tarefas_tempos set fim = greatest(v_agora, inicio) where id = v_aberto.id;
  end if;

  insert into public.tarefas_tempos (tarefa_id, membro_id, inicio)
  values (p_id, v_eu, v_agora)
  returning id into v_novo;

  if v.situacao = 'pendente' then
    update public.tarefas set situacao = 'em_andamento' where id = p_id;
  end if;
  return jsonb_build_object('id', v_novo, 'inicio', v_agora, 'ja_rodando', false);
exception
  when unique_violation then
    raise exception 'Você já está com outra tarefa rodando (talvez em outra aba). Atualize a tela.' using errcode = 'P0001';
end
$$;

-- Pausar: fecha o meu período aberto nesta tarefa (o administrador fecha
-- qualquer um). p_fim = "esqueci de pausar": a hora real, entre o início e agora.
create function public.pausar_tarefa(p_id uuid, p_fim timestamptz default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu    uuid := privado.meu_membro_id();
  v_agora timestamptz := clock_timestamp();
  v_inicio timestamptz;
  v_n     integer;
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tarefas where id = p_id) then
    raise exception 'Tarefa não encontrada.' using errcode = 'P0001';
  end if;
  select max(inicio) into v_inicio from public.tarefas_tempos
   where tarefa_id = p_id and fim is null and (membro_id = v_eu or privado.eh_admin());
  if v_inicio is null then
    raise exception 'O cronômetro desta tarefa não está rodando com você.' using errcode = 'P0001';
  end if;
  if p_fim is not null and (p_fim > v_agora or p_fim < v_inicio) then
    raise exception 'A hora em que parou precisa ser depois do início (%) e antes de agora.',
      to_char(v_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') using errcode = 'P0001';
  end if;

  update public.tarefas_tempos
     set fim = coalesce(p_fim, greatest(v_agora, inicio)), fim_informado = p_fim is not null
   where tarefa_id = p_id and fim is null and (membro_id = v_eu or privado.eh_admin());
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Finalizar: fecha o relógio (com a hora real, se informada) e conclui.
create function public.finalizar_tarefa(p_id uuid, p_fim timestamptz default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas;
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  select * into v from public.tarefas where id = p_id for update;
  if not found or v.cancelado_em is not null then
    raise exception 'Tarefa não encontrada ou cancelada.' using errcode = 'P0001';
  end if;
  if not privado.mexe_na_tarefa(v.criado_por, v.responsavel_id) then
    raise exception 'Só quem delegou, o responsável ou o administrador conclui esta tarefa.' using errcode = '42501';
  end if;
  if v.situacao = 'concluida' then
    raise exception 'Esta tarefa já está concluída.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tarefas_tempos t
              where t.tarefa_id = p_id and t.fim is null and (t.membro_id = privado.meu_membro_id() or privado.eh_admin())) then
    perform public.pausar_tarefa(p_id, p_fim);
  end if;
  -- O gatilho y_fechar_tempos fecha o que ainda estiver aberto (de outra pessoa).
  update public.tarefas set situacao = 'concluida' where id = p_id;
end
$$;

-- O meu cronômetro de tarefa: a hora do servidor e a tarefa rodando, com o
-- tempo já contado antes (de todos) — a tela interpola a partir daí.
create function public.meu_cronometro_tarefa()
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'agora', clock_timestamp(),
    'tarefa', (
      select jsonb_build_object(
        'id', t.id, 'titulo', t.titulo, 'desde', tt.inicio,
        'anterior', coalesce((select sum(extract(epoch from (x.fim - x.inicio)))::bigint
                                from public.tarefas_tempos x where x.tarefa_id = t.id and x.fim is not null), 0))
        from public.tarefas_tempos tt
        join public.tarefas t on t.id = tt.tarefa_id
       where tt.membro_id = privado.meu_membro_id() and tt.fim is null
       limit 1));
end
$$;

revoke execute on function public.iniciar_tarefa(uuid, boolean), public.pausar_tarefa(uuid, timestamptz),
  public.finalizar_tarefa(uuid, timestamptz), public.meu_cronometro_tarefa() from public, anon;
grant execute on function public.iniciar_tarefa(uuid, boolean), public.pausar_tarefa(uuid, timestamptz),
  public.finalizar_tarefa(uuid, timestamptz), public.meu_cronometro_tarefa() to authenticated, service_role;

-- v_tarefas: as mesmas colunas (20261011120000) e, no fim, a vara do processo
-- e o tempo — o fechado (soma), os relógios abertos e os períodos.
create or replace view public.v_tarefas with (security_invoker = true) as
select
  t.id, t.tipo, t.titulo, t.ato, t.descricao, t.cliente_id, privado.nome_cliente(t.cliente_id) as cliente_nome,
  t.processo_id, pr.numero as processo_numero, pr.titulo as processo_titulo, pr.tribunal, pr.area,
  t.responsavel_id, t.prioridade, t.situacao, t.entrega,
  t.fatal_em, t.contagem, t.base_em, t.quantidade, t.recesso, t.memoria_prazo,
  t.concluida_em, t.concluida_por, t.compromisso_id,
  t.cancelado_em, t.motivo_cancelamento, t.criado_em, t.criado_por, t.alterado_em, t.alterado_por,
  case
    when t.cancelado_em is not null then 'cancelada'
    when t.situacao = 'concluida' then 'concluida'
    when t.fatal_em < now() then 'vencida'
    when (t.fatal_em at time zone 'America/Sao_Paulo')::date = privado.hoje() then 'fatal_hoje'
    when t.entrega < privado.hoje() then 'atrasada'
    when t.entrega = privado.hoje() then 'entrega_hoje'
    else 'em_dia'
  end as alerta,
  t.motivo_reabertura,
  t.intimacao_id,
  pr.orgao as processo_orgao,
  coalesce(tm.segundos, 0) as tempo_segundos,
  coalesce(tm.abertos, '[]'::jsonb) as cronometros,
  coalesce(tm.periodos, '[]'::jsonb) as periodos
from public.tarefas t
left join public.processos pr on pr.id = t.processo_id
left join lateral (
  select
    (sum(extract(epoch from (x.fim - x.inicio))) filter (where x.fim is not null))::bigint as segundos,
    jsonb_agg(jsonb_build_object('membro_id', x.membro_id, 'desde', x.inicio) order by x.inicio)
      filter (where x.fim is null) as abertos,
    jsonb_agg(jsonb_build_object('membro_id', x.membro_id, 'inicio', x.inicio, 'fim', x.fim, 'informado', x.fim_informado)
      order by x.inicio) as periodos
    from public.tarefas_tempos x
   where x.tarefa_id = t.id
) tm on true;

-- -----------------------------------------------------------------------------
-- 3 · Vários lembretes por compromisso
-- -----------------------------------------------------------------------------

-- Até 5, sem repetir, de 0 a 40320 minutos (4 semanas): os limites do Google
-- Agenda para lembretes de um evento.
create function privado.lembretes_validos(p integer[])
returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null
     and cardinality(p) <= 5
     and array_position(p, null) is null
     and not exists (select 1 from unnest(p) x where x < 0 or x > 40320)
     and (select count(distinct x) from unnest(p) x) = cardinality(p)
$$;

alter table public.compromissos add column lembretes integer[] not null default '{}';

-- Preenche a partir do lembrete único, sem disparar gatilhos: compromisso
-- cancelado ou de membro desativado recusaria a alteração, e nada aqui deve
-- mudar carimbo, histórico ou mandar de novo ao Google.
alter table public.compromissos disable trigger user;
update public.compromissos set lembretes = array[lembrete_minutos] where lembrete_minutos > 0;
alter table public.compromissos enable trigger user;

alter table public.compromissos add constraint compromissos_lembretes check (privado.lembretes_validos(lembretes));

-- A tela antiga só conhece lembrete_minutos; a nova, lembretes. Quem mudou,
-- manda. Os lembretes ficam em ordem (do mais longe ao mais perto do início)
-- e o campo antigo acompanha com o menor que ele aceita — é o que a função
-- do Google da versão anterior e o .ics antigo leem.
create function privado.sincronizar_lembretes()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  -- Quem gravou mandou a lista nova (tela nova)? Então o campo antigo a segue.
  -- Senão, a lista segue o campo antigo — que continua conferido pelo CHECK
  -- dele (um -1 de uma tela antiga é recusado, não trocado em silêncio).
  v_da_lista boolean := false;
begin
  if tg_op = 'INSERT' then
    if cardinality(new.lembretes) > 0 then
      v_da_lista := true;
    elsif coalesce(new.lembrete_minutos, 0) > 0 then
      new.lembretes := array[new.lembrete_minutos];
    end if;
  elsif new.lembretes is distinct from old.lembretes then
    v_da_lista := true;
  elsif new.lembrete_minutos is distinct from old.lembrete_minutos then
    -- A tela antiga só vê um lembrete (o do campo antigo): troca só esse e
    -- deixa os outros, que ela não mostra — inclusive quando ela está
    -- desatualizada (aberta antes de alguém mudar a lista na tela nova).
    new.lembretes := array(select x from unnest(old.lembretes) x where x is distinct from old.lembrete_minutos
                            order by x desc limit 4)
                     || case when coalesce(new.lembrete_minutos, 0) > 0 then array[new.lembrete_minutos] else '{}'::integer[] end;
  end if;

  new.lembretes := coalesce(array(select distinct x from unnest(new.lembretes) x where x is not null order by x desc),
                            '{}'::integer[]);
  if v_da_lista then
    new.lembrete_minutos := (select min(x) from unnest(new.lembretes) x where x in (15, 30, 60, 120, 1440));
  end if;
  return new;
end
$$;

create trigger b_lembretes before insert or update on public.compromissos
  for each row execute function privado.sincronizar_lembretes();

grant insert (lembretes), update (lembretes) on public.compromissos to authenticated;

-- Lembretes mudaram: o evento do Google é atualizado (antes, só lembrete_minutos).
create or replace function privado.google_marcar()
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
          old.lembrete_minutos, old.lembretes, old.cancelado_em)
         is not distinct from
         (new.membro_id, new.tipo, new.modalidade, new.titulo, new.inicio, new.fim, new.dia_inteiro,
          new.cliente_id, new.processo, new.local_ou_link, new.particular, new.situacao = 'remarcado',
          new.lembrete_minutos, new.lembretes, new.cancelado_em) then
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

-- A função do Google recebe também os lembretes (a anterior ignora a chave).
create or replace function public.google_agenda_pendencias(p_limite integer default 50)
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
             cl.nome as cliente_nome, m.nome_curto as responsavel,
             c.lembretes
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

-- agenda_periodo devolve também os lembretes (no fim; mascarado = vazio).
-- Mudar o tipo de retorno exige recriar: os privilégios vão junto, de novo.
drop function public.agenda_periodo(timestamptz, timestamptz);
create function public.agenda_periodo(p_de timestamptz, p_ate timestamptz)
returns table (
  id uuid, membro_id uuid, tipo text, modalidade text, titulo text,
  inicio timestamptz, fim timestamptz, dia_inteiro boolean,
  cliente_id uuid, cliente_nome text, cliente_telefone text,
  processo text, local_ou_link text, observacoes text,
  particular boolean, situacao text, chegada_em timestamptz, lembrete_minutos integer,
  mascarado boolean, pode_editar boolean, lembretes integer[]
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_eu     uuid := privado.meu_membro_id();
  v_acesso text := privado.acesso_agenda();
begin
  if v_acesso = 'nenhum' then
    raise exception 'Sem acesso à agenda.' using errcode = '42501';
  end if;
  if p_ate <= p_de or p_ate - p_de > interval '62 days' then
    raise exception 'Período inválido: até 62 dias.' using errcode = '22023';
  end if;

  return query
  select c.id, c.membro_id,
         case when x.oculto then 'bloqueio' else c.tipo end,
         case when x.oculto then null else c.modalidade end,
         case when x.oculto then 'Ocupado' else c.titulo end,
         c.inicio, c.fim, c.dia_inteiro,
         case when x.oculto then null else c.cliente_id end,
         case when x.oculto then null else cl.nome end,
         case when x.oculto then null else cl.telefone end,
         case when x.oculto then null else c.processo end,
         case when x.oculto then null else c.local_ou_link end,
         case when x.oculto then null else c.observacoes end,
         c.particular,
         case when x.oculto then 'agendado' else c.situacao end,
         case when x.oculto then null else c.chegada_em end,
         case when x.oculto then null else c.lembrete_minutos end,
         x.oculto,
         c.membro_id = v_eu or (v_acesso = 'todas' and not c.particular),
         case when x.oculto then '{}'::integer[] else c.lembretes end
    from public.compromissos c
    left join public.clientes cl on cl.id = c.cliente_id
    cross join lateral (select c.particular and c.membro_id is distinct from v_eu as oculto) as x
   where c.cancelado_em is null
     and c.inicio < p_ate
     and c.fim > p_de
   order by c.inicio, c.fim;
end
$$;

revoke execute on function public.agenda_periodo(timestamptz, timestamptz) from public, anon;
grant execute on function public.agenda_periodo(timestamptz, timestamptz) to authenticated;

-- Remarcar leva os lembretes para o novo horário.
create or replace function public.remarcar_compromisso(p_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  c      public.compromissos;
  v_novo uuid;
begin
  select * into c from public.compromissos where id = p_id and cancelado_em is null;
  if not found then
    raise exception 'Compromisso não encontrado.' using errcode = 'P0002';
  end if;
  if c.situacao <> 'agendado' then
    raise exception 'Só um compromisso agendado pode ser remarcado. Volte-o para agendado antes.' using errcode = 'P0001';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'O fim precisa ser depois do início.' using errcode = 'P0001';
  end if;
  if p_inicio = c.inicio and p_fim = c.fim then
    raise exception 'Escolha um dia ou horário diferente do atual.' using errcode = 'P0001';
  end if;

  insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, dia_inteiro, cliente_id,
                                   processo, local_ou_link, observacoes, particular, lembrete_minutos, lembretes)
  values (c.membro_id, c.tipo, c.modalidade, c.titulo, p_inicio, p_fim, c.dia_inteiro, c.cliente_id,
          c.processo, c.local_ou_link, c.observacoes, c.particular, c.lembrete_minutos, c.lembretes)
  returning id into v_novo;

  update public.compromissos set situacao = 'remarcado', remarcado_para = v_novo where id = p_id;
  if not found then
    raise exception 'Sem permissão para alterar este compromisso.' using errcode = '42501';
  end if;
  return v_novo;
end
$$;

-- Audiência lançada da intimação: aceita os lembretes (e o antigo, de aba velha).
create or replace function public.lancar_audiencia_intimacao(p_id uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v      public.intimacoes;
  v_resp uuid;
  v_id   uuid;
  v_num  text;
begin
  if not privado.gerencia_prazos() or privado.acesso_agenda() = 'nenhum' then
    raise exception 'Seu acesso não inclui Intimações e Agenda.' using errcode = '42501';
  end if;

  select * into v from public.intimacoes where id = p_id for update;
  if not found or v.situacao = 'arquivada' or v.compromisso_id is not null then
    raise exception 'Intimação arquivada ou já vinculada a audiência.' using errcode = 'P0001';
  end if;

  v_resp := coalesce(nullif(p ->> 'membro_id', '')::uuid, privado.meu_membro_id());
  if privado.acesso_agenda() <> 'todas' and v_resp <> privado.meu_membro_id() then
    raise exception 'Você só pode marcar na sua própria agenda.' using errcode = '42501';
  end if;
  if p ->> 'tipo' is distinct from 'audiencia'
     or coalesce((p ->> 'particular')::boolean, false)
     or coalesce((p ->> 'dia_inteiro')::boolean, false)
  then
    raise exception 'Escolha uma audiência com horário e sem marca particular.' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'cliente_id', '')::uuid is distinct from v.cliente_id then
    raise exception 'Confira o cliente vinculado à intimação.' using errcode = 'P0001';
  end if;
  if p ? 'lembretes' and jsonb_typeof(p -> 'lembretes') not in ('array', 'null') then
    raise exception 'Lembretes inválidos.' using errcode = '22023';
  end if;

  -- O número vem do processo vinculado (ou da própria comunicação), não da tela.
  select numero into v_num from public.processos where id = v.processo_id;
  insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, cliente_id, processo, local_ou_link,
                                   observacoes, lembrete_minutos, lembretes)
  values (v_resp, 'audiencia', p ->> 'modalidade',
          coalesce(nullif(btrim(p ->> 'titulo'), ''), 'Audiência'),
          (p ->> 'inicio')::timestamptz, (p ->> 'fim')::timestamptz,
          v.cliente_id, coalesce(v_num, v.numero_processo),
          nullif(p ->> 'local_ou_link', ''), nullif(p ->> 'observacoes', ''),
          nullif(p ->> 'lembrete_minutos', '')::integer,
          coalesce(array(select jsonb_array_elements_text(
            case when jsonb_typeof(p -> 'lembretes') = 'array' then p -> 'lembretes' else '[]'::jsonb end)::integer),
            '{}'::integer[]))
  returning id into v_id;

  update public.intimacoes set compromisso_id = v_id, situacao = 'conferida' where id = p_id;
  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- 4 · Vários clientes no mesmo processo
-- -----------------------------------------------------------------------------
create table public.processos_partes (
  id                  uuid primary key default gen_random_uuid(),
  processo_id         uuid not null references public.processos (id),
  cliente_id          uuid not null references public.clientes (id),
  -- Como esta pessoa figura no processo: herdeiro(a), inventariante, requerente…
  posicao             text check (posicao is null or (btrim(posicao) <> '' and char_length(posicao) <= 60)),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

comment on table public.processos_partes is
  'Outros clientes representados no mesmo processo, além do cliente principal (processos.cliente_id), com a condição de cada um.';

create unique index processos_partes_unica on public.processos_partes (processo_id, cliente_id) where cancelado_em is null;
create index processos_partes_cliente on public.processos_partes (cliente_id);

select privado.aplicar_padrao('public.processos_partes');

create trigger b_cancelamento before update on public.processos_partes
  for each row execute function privado.registrar_cancelamento();

create function privado.validar_parte_processo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text;
begin
  if tg_op = 'UPDATE' and (new.processo_id, new.cliente_id) is distinct from (old.processo_id, old.cliente_id) then
    raise exception 'Para trocar a pessoa, retire a parte e acrescente outra.' using errcode = 'P0001';
  end if;
  new.posicao := nullif(btrim(new.posicao), '');

  if tg_op = 'INSERT' then
    if exists (select 1 from public.processos where id = new.processo_id and cliente_id = new.cliente_id) then
      raise exception 'Este cliente já é o cliente principal do processo.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.processos_partes
                where processo_id = new.processo_id and cliente_id = new.cliente_id and cancelado_em is null) then
      select nome into v_nome from public.clientes where id = new.cliente_id;
      raise exception '% já é parte deste processo.', coalesce(v_nome, 'Este cliente') using errcode = 'P0001';
    end if;
  end if;

  -- Retirar a parte com tarefa aberta dela no processo deixaria a tarefa
  -- presa a um vínculo que não existe mais.
  if tg_op = 'UPDATE' and new.cancelado_em is not null and old.cancelado_em is null
     and exists (select 1 from public.tarefas t
                  where t.processo_id = old.processo_id and t.cliente_id = old.cliente_id
                    and t.cancelado_em is null and t.situacao <> 'concluida') then
    select nome into v_nome from public.clientes where id = old.cliente_id;
    raise exception 'Há tarefa aberta de % neste processo. Conclua a tarefa (ou mude o cliente dela) antes de retirar a parte.',
      coalesce(v_nome, 'este cliente') using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger c_validar before insert or update on public.processos_partes
  for each row execute function privado.validar_parte_processo();

alter table public.processos_partes enable row level security;
create policy "processos_partes: ver" on public.processos_partes
  for select to authenticated using ((select privado.eh_membro()));
create policy "processos_partes: incluir" on public.processos_partes
  for insert to authenticated with check ((select privado.edita_clientes()));
create policy "processos_partes: alterar" on public.processos_partes
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.processos_partes from anon, authenticated;
grant select on public.processos_partes to authenticated;
grant insert (processo_id, cliente_id, posicao),
      update (posicao, cancelado_em, motivo_cancelamento)
  on public.processos_partes to authenticated;
grant all on public.processos_partes to service_role;

-- O processo é deste cliente? O principal, ou uma parte ainda vinculada.
create function privado.processo_do_cliente(p_processo uuid, p_cliente uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.processos where id = p_processo and cliente_id = p_cliente)
      or exists (select 1 from public.processos_partes
                  where processo_id = p_processo and cliente_id = p_cliente and cancelado_em is null)
$$;

-- As quatro conferências passam a aceitar as partes. Cada função é a última
-- versão, com só esse trecho trocado.

-- documentos (20261008120600): só na inclusão, como antes.
create or replace function privado.validar_documento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.processo_id is not null and not privado.processo_do_cliente(new.processo_id, new.cliente_id) then
    raise exception 'O processo não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.contrato_id is not null and not exists (
    select 1 from public.contratos where id = new.contrato_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O contrato não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.compromisso_id is not null and not exists (
    select 1 from public.compromissos where id = new.compromisso_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O compromisso não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.recebimento_id is not null and not exists (
    select 1 from public.recebimentos where id = new.recebimento_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O recebimento não pertence a este cliente.' using errcode = 'P0001';
  end if;

  return new;
end
$$;

-- atualizacoes (20261005212642).
create or replace function privado.validar_atualizacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.membros where id = new.membro_id and ativo
  ) then
    raise exception 'Quem atendeu precisa ser um membro ativo.' using errcode = 'P0001';
  end if;

  -- Participantes: outros membros ativos, sem repetir ninguém.
  if (tg_op = 'INSERT' or new.participantes is distinct from old.participantes)
     and (new.membro_id = any (new.participantes)
          or (select count(*) from public.membros where id = any (new.participantes) and ativo)
             <> cardinality(new.participantes))
  then
    raise exception 'Participantes precisam ser outros membros ativos, sem repetição.' using errcode = 'P0001';
  end if;

  -- O processo é do cliente (principal ou parte). Só confere quando o vínculo
  -- muda: retirar a parte depois não trava a atividade já registrada.
  if new.processo_id is not null
     and (tg_op = 'INSERT' or (new.processo_id, new.cliente_id) is distinct from (old.processo_id, old.cliente_id))
     and not privado.processo_do_cliente(new.processo_id, new.cliente_id) then
    raise exception 'O processo não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.compromisso_id is not null and not exists (
    select 1 from public.compromissos where id = new.compromisso_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O compromisso não pertence a este cliente.' using errcode = 'P0001';
  end if;

  -- Atividade aberta só nasce pelo cronômetro.
  if tg_op = 'INSERT' and new.fim is null and not new.cronometrado then
    raise exception 'Informe a hora de fim, ou use Iniciar cronômetro.' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    -- Uma atividade encerrada não reabre, e a aberta não muda de início.
    if new.fim is null and new.cancelado_em is null
       and (old.fim is not null or new.inicio is distinct from old.inicio)
    then
      raise exception 'Use Iniciar cronômetro para começar outra atividade. Pare o relógio antes de corrigir o início.'
        using errcode = 'P0001';
    end if;
    -- Horário corrigido à mão deixa de ser cronometrado. O sinal
    -- fhl.cronometro = 'parar' vem de parar_cronometro, na mesma transação.
    if old.cronometrado
       and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
       and coalesce(current_setting('fhl.cronometro', true), '') <> 'parar'
    then
      new.cronometrado := false;
    end if;
  end if;

  return new;
end
$$;

-- tarefas (20261005225741).
create or replace function privado.validar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id then
    if not exists (select 1 from public.membros where id = new.responsavel_id and ativo) then
      raise exception 'O responsável precisa ser um membro ativo.' using errcode = 'P0001';
    end if;
  end if;

  -- O processo é do cliente (principal ou parte). Só confere quando o vínculo
  -- muda: concluir a tarefa não trava se a parte foi retirada depois.
  if new.processo_id is not null
     and (tg_op = 'INSERT' or (new.processo_id, new.cliente_id) is distinct from (old.processo_id, old.cliente_id))
     and not privado.processo_do_cliente(new.processo_id, new.cliente_id) then
    raise exception 'O processo precisa pertencer ao cliente escolhido.' using errcode = 'P0001';
  end if;

  -- Criar prazo, ou mexer em qualquer campo dele, exige acesso a Prazos.
  if (tg_op = 'INSERT' and new.tipo = 'prazo')
     or (tg_op = 'UPDATE'
         and (new.tipo, new.fatal_em, new.contagem, new.base_em, new.quantidade, new.recesso, new.memoria_prazo)
             is distinct from
             (old.tipo, old.fatal_em, old.contagem, old.base_em, old.quantidade, old.recesso, old.memoria_prazo))
  then
    if not privado.gerencia_prazos() then
      raise exception 'Seu acesso não permite criar ou mudar prazo processual.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.cancelado_em is not null then
      raise exception 'Tarefa cancelada não pode ser alterada.' using errcode = 'P0001';
    end if;
    -- Concluída só volta a aberta por reabrir_tarefa, que liga o sinal e dá o motivo.
    if old.situacao = 'concluida' and new.situacao <> 'concluida'
       and (coalesce(current_setting('fhl.reabrir_tarefa', true), '') <> 'reabrir'
            or nullif(btrim(new.motivo_reabertura), '') is null)
    then
      raise exception 'Informe um novo motivo para reabrir a tarefa.' using errcode = 'P0001';
    end if;
  end if;

  -- Quem concluiu e quando: o banco carimba, a tela não escolhe.
  if new.situacao = 'concluida' then
    if tg_op = 'INSERT' or old.situacao <> 'concluida' then
      new.concluida_em := clock_timestamp();
      new.concluida_por := privado.meu_membro_id();
    else
      new.concluida_em := old.concluida_em;
      new.concluida_por := old.concluida_por;
    end if;
  else
    new.concluida_em := null;
    new.concluida_por := null;
  end if;

  return new;
end
$$;

-- intimacoes (20261005225750): o número continua conferido.
create or replace function privado.validar_intimacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- O processo vinculado é do cliente vinculado (principal ou parte) e tem o
  -- mesmo número. Só confere quando o vínculo muda.
  if new.processo_id is not null
     and (tg_op = 'INSERT'
          or (new.processo_id, new.cliente_id, new.numero_processo)
             is distinct from (old.processo_id, old.cliente_id, old.numero_processo))
     and (not privado.processo_do_cliente(new.processo_id, new.cliente_id)
          or not exists (select 1 from public.processos
                          where id = new.processo_id
                            and (new.numero_processo is null or numero = new.numero_processo)))
  then
    raise exception 'Confira o cliente e o número do processo vinculado.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' or new.membro_id is distinct from old.membro_id then
    if new.membro_id is not null and not exists (select 1 from public.membros where id = new.membro_id and ativo) then
      raise exception 'Escolha um advogado ativo.' using errcode = 'P0001';
    end if;
  end if;

  -- Quem conferiu e quando: carimbo do banco, preservado depois.
  if new.situacao = 'conferida' then
    if tg_op = 'INSERT' or old.situacao <> 'conferida' then
      new.conferida_em := clock_timestamp();
      new.conferida_por := privado.meu_membro_id();
    else
      new.conferida_em := old.conferida_em;
      new.conferida_por := old.conferida_por;
    end if;
  elsif new.situacao = 'pendente' then
    new.conferida_em := null;
    new.conferida_por := null;
  elsif tg_op = 'UPDATE' then
    new.conferida_em := old.conferida_em;
    new.conferida_por := old.conferida_por;
  end if;

  return new;
end
$$;

-- Processo e partes numa transação só, com os direitos de quem chama (as
-- políticas de processos e de partes valem como sempre).
--   p = { id?, cliente_id, numero, referencia, titulo, area, tribunal, orgao,
--         responsavel_id, situacao, observacoes, posicao_cliente,
--         partes: [{ id?, cliente_id, posicao }],   (as que ficam)
--         remover: [{ id, motivo }] }               (as que saem)
create function public.salvar_processo(p jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_parte  jsonb;
  v_cli    uuid;
  v_vistos uuid[] := '{}';
  v_nome   text;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não permite cadastrar processos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object'
     or (p ? 'partes' and jsonb_typeof(p -> 'partes') not in ('array', 'null'))
     or (p ? 'remover' and jsonb_typeof(p -> 'remover') not in ('array', 'null')) then
    raise exception 'Dados do processo inválidos.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.processos (cliente_id, numero, referencia, titulo, area, tribunal, orgao, responsavel_id,
                                  situacao, observacoes, posicao_cliente)
    values ((p ->> 'cliente_id')::uuid, nullif(p ->> 'numero', ''), nullif(btrim(p ->> 'referencia'), ''),
            btrim(p ->> 'titulo'), p ->> 'area', nullif(btrim(p ->> 'tribunal'), ''), nullif(btrim(p ->> 'orgao'), ''),
            nullif(p ->> 'responsavel_id', '')::uuid, coalesce(nullif(p ->> 'situacao', ''), 'em_andamento'),
            nullif(btrim(p ->> 'observacoes'), ''), nullif(btrim(p ->> 'posicao_cliente'), ''))
    returning id into v_id;
  else
    update public.processos
       set numero = nullif(p ->> 'numero', ''),
           referencia = nullif(btrim(p ->> 'referencia'), ''),
           titulo = btrim(p ->> 'titulo'),
           area = p ->> 'area',
           tribunal = nullif(btrim(p ->> 'tribunal'), ''),
           orgao = nullif(btrim(p ->> 'orgao'), ''),
           responsavel_id = nullif(p ->> 'responsavel_id', '')::uuid,
           situacao = coalesce(nullif(p ->> 'situacao', ''), situacao),
           observacoes = nullif(btrim(p ->> 'observacoes'), ''),
           posicao_cliente = nullif(btrim(p ->> 'posicao_cliente'), '')
     where id = v_id;
    if not found then
      raise exception 'Processo não encontrado ou sem permissão para alterar.' using errcode = 'P0002';
    end if;
  end if;

  -- Primeiro as que saem (com motivo), depois as que ficam ou entram.
  for v_parte in select * from jsonb_array_elements(coalesce(p -> 'remover', '[]'::jsonb)) loop
    update public.processos_partes
       set cancelado_em = now(), motivo_cancelamento = v_parte ->> 'motivo'
     where id = (v_parte ->> 'id')::uuid and processo_id = v_id and cancelado_em is null;
  end loop;

  for v_parte in select * from jsonb_array_elements(coalesce(p -> 'partes', '[]'::jsonb)) loop
    v_cli := nullif(v_parte ->> 'cliente_id', '')::uuid;
    if v_cli is null then
      raise exception 'Escolha o cliente de cada parte acrescentada.' using errcode = 'P0001';
    end if;
    if v_cli = any (v_vistos) then
      select nome into v_nome from public.clientes where id = v_cli;
      raise exception '% aparece duas vezes nas partes.', coalesce(v_nome, 'Um cliente') using errcode = 'P0001';
    end if;
    v_vistos := v_vistos || v_cli;
    if nullif(v_parte ->> 'id', '') is not null then
      update public.processos_partes
         set posicao = nullif(btrim(v_parte ->> 'posicao'), '')
       where id = (v_parte ->> 'id')::uuid and processo_id = v_id and cancelado_em is null
         and posicao is distinct from nullif(btrim(v_parte ->> 'posicao'), '');
    else
      insert into public.processos_partes (processo_id, cliente_id, posicao)
      values (v_id, v_cli, nullif(btrim(v_parte ->> 'posicao'), ''));
    end if;
  end loop;

  return v_id;
end
$$;

revoke execute on function public.salvar_processo(jsonb) from public, anon;
grant execute on function public.salvar_processo(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Histórico: as tabelas novas seguem as tabelas que acompanham
-- (20261022120000, com tarefas_tempos e processos_partes ao lado de tarefas e
-- processos — visíveis a todo membro, como as próprias tabelas).
-- -----------------------------------------------------------------------------
create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Compromisso particular: o histórico é só do dono — nem quem audita lê
  -- (antes, o atalho de quem audita vinha primeiro e passava por cima).
  if p_tabela = 'compromissos' and exists (
    select 1 from public.compromissos c
     where c.id = p_registro and c.particular
       and c.membro_id is distinct from privado.meu_membro_id()) then
    return false;
  end if;
  if privado.audita() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    -- Cadastro de cliente (CPF, e-mail, telefone) só para quem lê Clientes,
    -- como a própria tabela (red team de 11/10). Processos, tarefas e
    -- feriados seguem visíveis a todo membro, como as tabelas.
    when p_tabela = 'clientes' then
      return privado.le_clientes();
    when p_tabela in ('processos', 'tarefas', 'feriados', 'tarefas_tempos', 'processos_partes') then
      return true;
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'clientes_contatos', 'processos_documentos') then
      return privado.edita_clientes();
    when p_tabela = 'documentos' then
      return privado.edita_clientes() or (privado.financeiro_le() and exists (
        select 1 from public.documentos d where d.id = p_registro and d.modelo = 'recibo'));
    when p_tabela in ('intimacoes', 'intimacoes_consultas', 'config_prazos', 'processos_nao_acompanhados') then
      return privado.gerencia_prazos();
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro', 'pagamentos_despesa',
                      'contas_financeiras', 'transferencias_financeiras', 'ajustes_financeiros',
                      'fornecedores', 'centros_custo', 'anexos', 'anexos_versoes',
                      'importacoes', 'exportacoes', 'repasses_cliente') then
      return privado.financeiro_le();
    when p_tabela in ('fechamentos', 'divisao_cotas', 'fechamentos_anuais', 'fechamentos_anuais_versoes') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela in ('publicacoes', 'campanhas', 'site_deploys') then
      return privado.edita_site();
    when p_tabela = 'compromissos' then
      return privado.acesso_agenda() <> 'nenhum' and exists (
        select 1 from public.compromissos c
        where c.id = p_registro
          and (c.membro_id = privado.meu_membro_id() or not c.particular));
    else
      return false;
  end case;
end
$$;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
-- Usada no CHECK de compromissos: quem grava precisa poder executá-la.
grant execute on function privado.lembretes_validos(integer[]) to authenticated;
