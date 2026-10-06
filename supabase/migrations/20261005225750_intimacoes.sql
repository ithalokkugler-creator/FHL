-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 13 · Intimações: registro e conferência manual
-- =============================================================================
--
-- preparacao-novas-funcoes.md, F6 (parte manual). A busca e a importação do
-- DJEN ainda não existem: a comunicação é cadastrada à mão e conferida por uma
-- pessoa. Daí sai o prazo ou a audiência — e a conferência é gravada na mesma
-- transação (criar_prazo_intimacao, lancar_audiencia_intimacao).
--
-- Só quem tem acesso a Prazos lê e grava intimações. Teor e datas gravados
-- não mudam (o GRANT de UPDATE cobre vínculo, situação e observações).

create table public.intimacoes (
  id                 uuid primary key default gen_random_uuid(),
  -- Reservados para a importação do DJEN (etapa seguinte).
  djen_id            bigint unique,
  djen_hash          text,
  fonte              text not null default 'manual' check (fonte in ('djen', 'manual')),
  disponibilizada_em date not null,
  publicada_em       date,
  tribunal           text,
  orgao              text,
  tipo_comunicacao   text,
  tipo_documento     text,
  classe             text,
  numero_processo    text check (numero_processo ~ '^[0-9]{20}$'),
  texto              text not null check (char_length(btrim(texto)) between 1 and 400000),
  link               text check (link ~ '^https?://[^[:space:]]+$'),
  destinatarios      jsonb not null default '[]'::jsonb check (jsonb_typeof(destinatarios) = 'array'),
  advogados          jsonb not null default '[]'::jsonb check (jsonb_typeof(advogados) = 'array'),
  membro_id          uuid references public.membros (id),
  cliente_id         uuid references public.clientes (id),
  processo_id        uuid references public.processos (id),
  situacao           text not null default 'pendente' check (situacao in ('pendente', 'conferida', 'arquivada')),
  conferida_em       timestamptz,
  conferida_por      uuid,
  -- A audiência lançada a partir desta comunicação (uma só).
  compromisso_id     uuid references public.compromissos (id),
  observacoes        text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint intimacao_datas check (publicada_em is null or publicada_em >= disponibilizada_em)
);

create index intimacoes_situacao on public.intimacoes (situacao, disponibilizada_em desc);
create index intimacoes_processo on public.intimacoes (processo_id);
create index intimacoes_cliente on public.intimacoes (cliente_id);
create index intimacoes_numero on public.intimacoes (numero_processo);
create index intimacoes_membro on public.intimacoes (membro_id);
create index intimacoes_compromisso on public.intimacoes (compromisso_id);

select privado.aplicar_padrao('public.intimacoes');

create function privado.validar_intimacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- O processo vinculado é do cliente vinculado e tem o mesmo número.
  if new.processo_id is not null and not exists (
    select 1 from public.processos
    where id = new.processo_id
      and cliente_id = new.cliente_id
      and (new.numero_processo is null or numero = new.numero_processo)
  ) then
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

create trigger c_validar before insert or update on public.intimacoes
  for each row execute function privado.validar_intimacao();

alter table public.intimacoes enable row level security;
create policy "intimacoes: ver" on public.intimacoes
  for select to authenticated using ((select privado.gerencia_prazos()));
create policy "intimacoes: incluir" on public.intimacoes
  for insert to authenticated with check ((select privado.gerencia_prazos()) and fonte = 'manual');
create policy "intimacoes: alterar" on public.intimacoes
  for update to authenticated
  using ((select privado.gerencia_prazos())) with check ((select privado.gerencia_prazos()));

revoke all on public.intimacoes from anon, authenticated;
grant select on public.intimacoes to authenticated;
grant insert (fonte, disponibilizada_em, publicada_em, tribunal, orgao, tipo_comunicacao, numero_processo, texto, link,
              membro_id, cliente_id, processo_id, observacoes),
  update (cliente_id, processo_id, situacao, observacoes)
  on public.intimacoes to authenticated;
grant all on public.intimacoes to service_role;

-- Registro de cada busca no diário (para a etapa de importação).
create table public.intimacoes_consultas (
  id          uuid primary key default gen_random_uuid(),
  de          date not null,
  ate         date not null,
  oabs        text[] not null,
  encontradas integer not null default 0 check (encontradas >= 0),
  novas       integer not null default 0 check (novas between 0 and encontradas),
  situacao    text not null check (situacao in ('ok', 'parcial', 'falhou')),
  detalhe     text,
  automatica  boolean not null default false,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint consulta_periodo check (ate >= de)
);

select privado.aplicar_padrao('public.intimacoes_consultas');

alter table public.intimacoes_consultas enable row level security;
create policy "intimacoes_consultas: ver" on public.intimacoes_consultas
  for select to authenticated using ((select privado.gerencia_prazos()));
revoke all on public.intimacoes_consultas from anon, authenticated;
grant select on public.intimacoes_consultas to authenticated;
grant all on public.intimacoes_consultas to service_role;

-- -----------------------------------------------------------------------------
-- O prazo nascido de uma intimação guarda a origem. A coluna é só do
-- servidor (sem GRANT): quem liga é criar_prazo_intimacao.
-- -----------------------------------------------------------------------------
alter table public.tarefas add column intimacao_id uuid references public.intimacoes (id);
create index tarefas_intimacao on public.tarefas (intimacao_id);

create function privado.validar_origem_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v public.intimacoes;
begin
  if new.intimacao_id is null then
    return new;
  end if;
  if tg_op = 'INSERT'
     or (new.intimacao_id, new.cliente_id, new.processo_id) is distinct from (old.intimacao_id, old.cliente_id, old.processo_id)
  then
    if not privado.gerencia_prazos() then
      raise exception 'Seu acesso não inclui as intimações.' using errcode = '42501';
    end if;
    select * into v from public.intimacoes where id = new.intimacao_id;
    if not found or v.situacao = 'arquivada' then
      raise exception 'Intimação indisponível.' using errcode = 'P0001';
    end if;
    if v.cliente_id is distinct from new.cliente_id or v.processo_id is distinct from new.processo_id then
      raise exception 'O prazo precisa manter o cliente e processo da intimação.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger d_origem before insert or update on public.tarefas
  for each row execute function privado.validar_origem_tarefa();

-- -----------------------------------------------------------------------------
-- Prazo e audiência a partir da intimação, com a conferência junto
-- -----------------------------------------------------------------------------
create function public.criar_prazo_intimacao(p_id uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v    public.intimacoes;
  v_id uuid;
begin
  if not privado.gerencia_prazos() then
    raise exception 'Seu acesso não inclui as intimações.' using errcode = '42501';
  end if;

  select * into v from public.intimacoes where id = p_id for update;
  if not found or v.situacao = 'arquivada' then
    raise exception 'Intimação indisponível.' using errcode = 'P0001';
  end if;
  if p ->> 'tipo' is distinct from 'prazo' then
    raise exception 'Escolha prazo processual.' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'cliente_id', '')::uuid is distinct from v.cliente_id
     or nullif(p ->> 'processo_id', '')::uuid is distinct from v.processo_id
  then
    raise exception 'Confira primeiro o vínculo do cliente e processo.' using errcode = 'P0001';
  end if;

  v_id := public.criar_tarefa(p);
  update public.tarefas set intimacao_id = p_id where id = v_id;
  update public.intimacoes set situacao = 'conferida' where id = p_id;
  return v_id;
end
$$;

create function public.lancar_audiencia_intimacao(p_id uuid, p jsonb)
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

  -- O número vem do processo vinculado (ou da própria comunicação), não da tela.
  select numero into v_num from public.processos where id = v.processo_id;
  insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, cliente_id, processo, local_ou_link, observacoes)
  values (v_resp, 'audiencia', p ->> 'modalidade',
          coalesce(nullif(btrim(p ->> 'titulo'), ''), 'Audiência'),
          (p ->> 'inicio')::timestamptz, (p ->> 'fim')::timestamptz,
          v.cliente_id, coalesce(v_num, v.numero_processo),
          nullif(p ->> 'local_ou_link', ''), nullif(p ->> 'observacoes', ''))
  returning id into v_id;

  update public.intimacoes set compromisso_id = v_id, situacao = 'conferida' where id = p_id;
  return v_id;
end
$$;

revoke execute on function public.criar_prazo_intimacao(uuid, jsonb), public.lancar_audiencia_intimacao(uuid, jsonb)
  from public, anon;
grant execute on function public.criar_prazo_intimacao(uuid, jsonb), public.lancar_audiencia_intimacao(uuid, jsonb)
  to authenticated, service_role;

-- A nova coluna da view entra no fim: `create or replace view` não reordena.
create or replace view public.v_tarefas with (security_invoker = true) as
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
  t.motivo_reabertura,
  t.intimacao_id
from public.tarefas t
left join public.clientes cl on cl.id = t.cliente_id
left join public.processos pr on pr.id = t.processo_id;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
