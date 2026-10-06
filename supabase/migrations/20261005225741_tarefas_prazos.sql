-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 12 · Tarefas, prazos informados à mão e feriados cadastrados
-- =============================================================================
--
-- preparacao-novas-funcoes.md, F5 (parte manual). A contagem automática do
-- prazo ainda não existe: data base, contagem, quantidade e data fatal são
-- informadas por quem tem acesso a Prazos, já conferidas.
--
--   · Tarefa é lida por todo membro ativo — quem recebe precisa ver.
--   · Autor, responsável ou administrador alteram a tarefa; os campos do
--     prazo (fatal, base, contagem…) só quem tem acesso a Prazos.
--   · Concluir grava quem e quando; reabrir só por reabrir_tarefa, com motivo.
--   · criar_tarefa pode bloquear a agenda do responsável na mesma transação.

-- -----------------------------------------------------------------------------
-- Feriados e suspensões cadastrados (tribunal nulo: vale para todos)
-- -----------------------------------------------------------------------------
create table public.feriados (
  id        uuid primary key default gen_random_uuid(),
  data      date not null,
  nome      text not null check (char_length(btrim(nome)) between 1 and 200),
  tribunal  text check (tribunal ~ '^[A-Z0-9]{2,10}$'),
  tipo      text not null default 'feriado' check (tipo in ('feriado', 'suspensao')),
  ativo     boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint feriados_unico unique nulls not distinct (data, tribunal)
);

select privado.aplicar_padrao('public.feriados');

alter table public.feriados enable row level security;
create policy "feriados: ver" on public.feriados
  for select to authenticated using ((select privado.eh_membro()));
create policy "feriados: incluir" on public.feriados
  for insert to authenticated with check ((select privado.gerencia_prazos()));
create policy "feriados: alterar" on public.feriados
  for update to authenticated
  using ((select privado.gerencia_prazos())) with check ((select privado.gerencia_prazos()));

revoke all on public.feriados from anon, authenticated;
grant select on public.feriados to authenticated;
grant insert (data, nome, tribunal, tipo, ativo), update (data, nome, tribunal, tipo, ativo)
  on public.feriados to authenticated;
grant all on public.feriados to service_role;

-- -----------------------------------------------------------------------------
-- Tarefas e prazos
-- -----------------------------------------------------------------------------
create table public.tarefas (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null default 'tarefa' check (tipo in ('tarefa', 'prazo')),
  titulo      text not null check (char_length(btrim(titulo)) between 1 and 200),
  ato         text,
  descricao   text check (char_length(descricao) <= 20000),
  cliente_id  uuid references public.clientes (id),
  processo_id uuid references public.processos (id),
  responsavel_id uuid not null references public.membros (id),
  prioridade  text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  situacao    text not null default 'pendente' check (situacao in ('pendente', 'em_andamento', 'concluida')),
  -- Entrega interna: o escritório entrega antes da data fatal, de propósito.
  entrega     date,
  -- Prazo processual, informado e conferido à mão (prazo em horas usa a hora).
  fatal_em    timestamptz,
  contagem    text check (contagem in ('uteis', 'corridos', 'horas')),
  base_em     timestamptz,
  quantidade  integer check (quantidade between 1 and 3650),
  recesso     boolean not null default true,
  memoria_prazo jsonb,
  concluida_em  timestamptz,
  concluida_por uuid,
  motivo_reabertura text,
  -- Bloqueio na agenda criado junto com a tarefa.
  compromisso_id uuid references public.compromissos (id),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  -- Prazo tem os campos do prazo, com a entrega até a data fatal; tarefa não tem nenhum.
  constraint tarefa_prazo_completo check (
    (tipo = 'prazo'
      and fatal_em is not null and contagem is not null and base_em is not null and quantidade is not null
      and fatal_em >= base_em
      and (entrega is null or entrega <= (fatal_em at time zone 'America/Sao_Paulo')::date))
    or (tipo = 'tarefa'
      and fatal_em is null and contagem is null and base_em is null and quantidade is null and memoria_prazo is null)
  )
);

create index tarefas_responsavel on public.tarefas (responsavel_id, situacao);
create index tarefas_fatal on public.tarefas (fatal_em) where fatal_em is not null;
create index tarefas_entrega on public.tarefas (entrega) where entrega is not null;
create index tarefas_processo on public.tarefas (processo_id);
create index tarefas_cliente on public.tarefas (cliente_id);
create index tarefas_criador on public.tarefas (criado_por);
create index tarefas_compromisso on public.tarefas (compromisso_id);

select privado.aplicar_padrao('public.tarefas');

create trigger b_cancelamento before update on public.tarefas
  for each row execute function privado.registrar_cancelamento();

create function privado.validar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id then
    if not exists (select 1 from public.membros where id = new.responsavel_id and ativo) then
      raise exception 'O responsável precisa ser um membro ativo.' using errcode = 'P0001';
    end if;
  end if;

  if new.processo_id is not null and not exists (
    select 1 from public.processos where id = new.processo_id and cliente_id = new.cliente_id
  ) then
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

create trigger c_validar before insert or update on public.tarefas
  for each row execute function privado.validar_tarefa();

alter table public.tarefas enable row level security;
create policy "tarefas: ver" on public.tarefas
  for select to authenticated using ((select privado.eh_membro()));
create policy "tarefas: incluir" on public.tarefas
  for insert to authenticated with check ((select privado.eh_membro()));
create policy "tarefas: alterar" on public.tarefas
  for update to authenticated
  using ((select privado.eh_membro())
         and (criado_por = (select privado.meu_membro_id())
              or responsavel_id = (select privado.meu_membro_id())
              or (select privado.eh_admin())))
  with check ((select privado.eh_membro()));

revoke all on public.tarefas from anon, authenticated;
grant select on public.tarefas to authenticated;
grant insert (tipo, titulo, ato, descricao, cliente_id, processo_id, responsavel_id, prioridade, situacao, entrega,
              fatal_em, contagem, base_em, quantidade, recesso, memoria_prazo),
  update (tipo, titulo, ato, descricao, cliente_id, processo_id, responsavel_id, prioridade, situacao, entrega,
          fatal_em, contagem, base_em, quantidade, recesso, memoria_prazo, cancelado_em, motivo_cancelamento)
  on public.tarefas to authenticated;
grant all on public.tarefas to service_role;

-- -----------------------------------------------------------------------------
-- criar_tarefa — a tarefa e, se pedido, o bloqueio na agenda do responsável,
-- numa transação só. É a exceção prevista para delegar: o bloqueio entra na
-- agenda de outra pessoa, desde que quem delega tenha acesso à Agenda.
-- -----------------------------------------------------------------------------
create function public.criar_tarefa(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_resp  uuid;
  v_comp  uuid;
  v_id    uuid;
  v_bloq  jsonb;
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) <> 'object' then
    raise exception 'Dados da tarefa inválidos.' using errcode = 'P0001';
  end if;

  v_resp := coalesce(nullif(p ->> 'responsavel_id', '')::uuid, privado.meu_membro_id());
  v_bloq := p -> 'bloquear';

  if jsonb_typeof(v_bloq) = 'object' then
    if privado.acesso_agenda() = 'nenhum' then
      raise exception 'Seu acesso não inclui a agenda: salve a tarefa sem bloquear.' using errcode = 'P0001';
    end if;
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, cliente_id, observacoes)
    values (v_resp, 'bloqueio', 'diligencia', 'Tarefa: ' || btrim(p ->> 'titulo'),
            (v_bloq ->> 'inicio')::timestamptz, (v_bloq ->> 'fim')::timestamptz,
            nullif(p ->> 'cliente_id', '')::uuid, 'Bloqueio criado junto com a tarefa.')
    returning id into v_comp;
  end if;

  insert into public.tarefas (tipo, titulo, ato, descricao, cliente_id, processo_id, responsavel_id, prioridade, entrega,
                              fatal_em, contagem, base_em, quantidade, recesso, memoria_prazo, compromisso_id)
  values (coalesce(nullif(p ->> 'tipo', ''), 'tarefa'),
          btrim(p ->> 'titulo'),
          nullif(btrim(p ->> 'ato'), ''),
          nullif(btrim(p ->> 'descricao'), ''),
          nullif(p ->> 'cliente_id', '')::uuid,
          nullif(p ->> 'processo_id', '')::uuid,
          v_resp,
          coalesce(nullif(p ->> 'prioridade', ''), 'normal'),
          nullif(p ->> 'entrega', '')::date,
          nullif(p ->> 'fatal_em', '')::timestamptz,
          nullif(p ->> 'contagem', ''),
          nullif(p ->> 'base_em', '')::timestamptz,
          nullif(p ->> 'quantidade', '')::integer,
          coalesce((p ->> 'recesso')::boolean, true),
          p -> 'memoria_prazo',
          v_comp)
  returning id into v_id;

  return v_id;
end
$$;

-- Reabrir: autor, responsável ou administrador, sempre com motivo. O sinal
-- fhl.reabrir_tarefa autoriza a volta no gatilho só dentro desta função.
create function public.reabrir_tarefa(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v       public.tarefas;
  v_sinal text;
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;

  select * into v from public.tarefas where id = p_id for update;
  if not found or v.situacao <> 'concluida' or v.cancelado_em is not null then
    raise exception 'Esta tarefa não está concluída.' using errcode = 'P0001';
  end if;
  if v.criado_por is distinct from privado.meu_membro_id()
     and v.responsavel_id is distinct from privado.meu_membro_id()
     and not privado.eh_admin()
  then
    raise exception 'Só quem delegou, o responsável ou administrador pode reabrir.' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;

  v_sinal := current_setting('fhl.reabrir_tarefa', true);
  perform set_config('fhl.reabrir_tarefa', 'reabrir', true);
  update public.tarefas set situacao = 'pendente', motivo_reabertura = btrim(p_motivo) where id = p_id;
  perform set_config('fhl.reabrir_tarefa', coalesce(v_sinal, ''), true);
end
$$;

revoke execute on function public.criar_tarefa(jsonb), public.reabrir_tarefa(uuid, text) from public, anon;
grant execute on function public.criar_tarefa(jsonb), public.reabrir_tarefa(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- v_tarefas — a tarefa com cliente, processo e o alerta do dia (em Brasília)
-- -----------------------------------------------------------------------------
create view public.v_tarefas with (security_invoker = true) as
select
  t.id, t.tipo, t.titulo, t.ato, t.descricao, t.cliente_id, cl.nome as cliente_nome,
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
  t.motivo_reabertura
from public.tarefas t
left join public.clientes cl on cl.id = t.cliente_id
left join public.processos pr on pr.id = t.processo_id;

revoke all on public.v_tarefas from anon, authenticated;
grant select on public.v_tarefas to authenticated, service_role;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
