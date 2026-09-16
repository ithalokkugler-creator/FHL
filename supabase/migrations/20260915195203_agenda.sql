-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 03 · Agenda
-- =============================================================================
--
-- Preparação da área dos advogados, seção 7: cada um saber o que cada um está
-- fazendo, e cliente nunca esperar.
--
-- O Google Agenda continua sendo a agenda oficial (7.2) — é nele que o cliente
-- marca horário pelo link. A integração nos dois sentidos (7.3, opção C)
-- depende da conta que o escritório vai usar, Gmail comum ou Workspace
-- (pergunta 12), e por isso ainda não existe: as colunas google_* ficam
-- reservadas para ela.
--
-- Até lá, o que é lançado aqui NÃO bloqueia horário no link do Google.

create table public.config_agenda (
  id                  uuid primary key default gen_random_uuid(),
  unica               boolean not null default true unique check (unica),
  -- Faixa visível da grade. Não limita o que se pode marcar: o protótipo
  -- travava em 9h–12h e 14h–18h, e audiência às 13h não cabia (3.2).
  hora_inicio         smallint not null default 8 check (hora_inicio between 0 and 23),
  hora_fim            smallint not null default 19 check (hora_fim between 1 and 24),
  sabado              boolean not null default false,
  -- Intervalo mínimo entre atendimentos, para não encavalar (7.7).
  intervalo_minimo    smallint not null default 15 check (intervalo_minimo between 0 and 120),
  -- Durações padrão em minutos (7.7) — a confirmar.
  duracao_atendimento smallint not null default 60 check (duracao_atendimento between 5 and 600),
  duracao_retorno     smallint not null default 30 check (duracao_retorno between 5 and 600),
  duracao_audiencia   smallint not null default 60 check (duracao_audiencia between 5 and 600),
  duracao_interno     smallint not null default 60 check (duracao_interno between 5 and 600),
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid,
  constraint config_agenda_horario check (hora_fim > hora_inicio)
);

create table public.compromissos (
  id                     uuid primary key default gen_random_uuid(),
  membro_id              uuid not null references public.membros (id),
  -- Prazo não é compromisso: fica no módulo Prazos (7.5.3).
  tipo                   text not null
                         check (tipo in ('atendimento', 'audiencia', 'bloqueio', 'interno')),
  modalidade             text check (modalidade in ('presencial', 'online', 'retorno', 'hibrida',
                                                    'ausencia', 'ferias', 'diligencia')),
  titulo                 text,
  inicio                 timestamptz not null,
  fim                    timestamptz not null,
  -- Bloqueio de vários dias, como férias e viagem. O protótipo aceitava um só (3.2).
  dia_inteiro            boolean not null default false,
  cliente_id             uuid references public.clientes (id),
  processo               text,
  local_ou_link          text,
  observacoes            text,
  -- Particular: para os outros, só "Ocupado" (7.5.6).
  particular             boolean not null default false,
  situacao               text not null default 'agendado'
                         check (situacao in ('agendado', 'realizado', 'faltou', 'remarcado')),
  -- A recepção marca a chegada; o advogado vê há quanto tempo o cliente espera (7.5.8).
  chegada_em             timestamptz,
  lembrete_minutos       integer check (lembrete_minutos in (0, 15, 30, 60, 120, 1440)),
  google_calendar_id     text,
  google_event_id        text,
  google_sincronizado_em timestamptz,
  cancelado_em           timestamptz,
  cancelado_por          uuid,
  motivo_cancelamento    text,
  criado_em              timestamptz not null default now(),
  criado_por             uuid,
  alterado_em            timestamptz,
  alterado_por           uuid,
  constraint compromisso_periodo check (fim > inicio)
);

create index compromissos_periodo on public.compromissos (inicio, fim);
create index compromissos_membro on public.compromissos (membro_id, inicio);
create index compromissos_cliente on public.compromissos (cliente_id);

select privado.aplicar_padrao('public.config_agenda');
select privado.aplicar_padrao('public.compromissos');

create trigger b_cancelamento before update on public.compromissos
  for each row execute function privado.registrar_cancelamento();

create function privado.validar_compromisso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.membros m where m.id = new.membro_id and m.ativo) then
    raise exception 'O responsável precisa ser um membro ativo.' using errcode = 'P0001';
  end if;

  if new.modalidade is not null and not (
       (new.tipo = 'atendimento' and new.modalidade in ('presencial', 'online', 'retorno'))
    or (new.tipo = 'audiencia'   and new.modalidade in ('presencial', 'online', 'hibrida'))
    or (new.tipo = 'bloqueio'    and new.modalidade in ('ausencia', 'ferias', 'diligencia'))
    or (new.tipo = 'interno'     and new.modalidade in ('presencial', 'online'))
  ) then
    raise exception 'A modalidade "%" não combina com o tipo "%".', new.modalidade, new.tipo
      using errcode = 'P0001';
  end if;

  -- Dia inteiro vai da meia-noite do primeiro dia à meia-noite depois do
  -- último, no horário de Brasília — seja qual for o fuso de quem lançou.
  if new.dia_inteiro then
    new.inicio := date_trunc('day', new.inicio at time zone 'America/Sao_Paulo')
                  at time zone 'America/Sao_Paulo';
    new.fim := (date_trunc('day', (new.fim at time zone 'America/Sao_Paulo') - interval '1 microsecond')
                + interval '1 day') at time zone 'America/Sao_Paulo';
  end if;

  if new.fim <= new.inicio then
    raise exception 'O fim precisa ser depois do início.' using errcode = 'P0001';
  end if;

  -- A hora da chegada é a do servidor, não a do relógio do computador da
  -- recepção. Dá para desmarcar; não dá para reescrever.
  if tg_op = 'INSERT' then
    new.chegada_em := null;
  elsif new.chegada_em is not null then
    new.chegada_em := coalesce(old.chegada_em, now());
  end if;

  return new;
end
$$;

create trigger c_validar before insert or update on public.compromissos
  for each row execute function privado.validar_compromisso();

-- -----------------------------------------------------------------------------
-- Políticas
-- Todo membro com acesso à agenda vê a de todos (7.1). Compromisso particular
-- de outra pessoa não sai pela tabela: sai mascarado por agenda_periodo().
-- -----------------------------------------------------------------------------
alter table public.config_agenda enable row level security;
alter table public.compromissos  enable row level security;

create policy "config_agenda: ver" on public.config_agenda
  for select to authenticated using ((select privado.acesso_agenda()) <> 'nenhum');
create policy "config_agenda: alterar" on public.config_agenda
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "compromissos: ver" on public.compromissos
  for select to authenticated
  using ((select privado.acesso_agenda()) <> 'nenhum'
         and (membro_id = (select privado.meu_membro_id()) or not particular));

-- O próprio compromisso, quem tem acesso à agenda edita; o dos outros, só
-- quem tem acesso a todas — e o particular, só o dono.
create policy "compromissos: incluir" on public.compromissos
  for insert to authenticated
  with check (
    ((select privado.acesso_agenda()) <> 'nenhum' and membro_id = (select privado.meu_membro_id()))
    or ((select privado.acesso_agenda()) = 'todas' and not particular));

create policy "compromissos: alterar" on public.compromissos
  for update to authenticated
  using (
    ((select privado.acesso_agenda()) <> 'nenhum' and membro_id = (select privado.meu_membro_id()))
    or ((select privado.acesso_agenda()) = 'todas' and not particular))
  with check (
    ((select privado.acesso_agenda()) <> 'nenhum' and membro_id = (select privado.meu_membro_id()))
    or ((select privado.acesso_agenda()) = 'todas' and not particular));

-- A agenda de todos num período, com o particular dos outros reduzido a
-- "Ocupado" — horário à mostra, conteúdo não.
create function public.agenda_periodo(p_de timestamptz, p_ate timestamptz)
returns table (
  id uuid, membro_id uuid, tipo text, modalidade text, titulo text,
  inicio timestamptz, fim timestamptz, dia_inteiro boolean,
  cliente_id uuid, cliente_nome text, cliente_telefone text,
  processo text, local_ou_link text, observacoes text,
  particular boolean, situacao text, chegada_em timestamptz, lembrete_minutos integer,
  mascarado boolean, pode_editar boolean
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
         c.membro_id = v_eu or (v_acesso = 'todas' and not c.particular)
    from public.compromissos c
    left join public.clientes cl on cl.id = c.cliente_id
    cross join lateral (select c.particular and c.membro_id is distinct from v_eu as oculto) as x
   where c.cancelado_em is null
     and c.inicio < p_ate
     and c.fim > p_de
   order by c.inicio, c.fim;
end
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- google_* fica fora: só a futura sincronização (service_role) escreve ali.
-- -----------------------------------------------------------------------------
revoke all on public.config_agenda, public.compromissos from anon, authenticated;

grant select on public.config_agenda, public.compromissos to authenticated;

grant update (hora_inicio, hora_fim, sabado, intervalo_minimo, duracao_atendimento,
              duracao_retorno, duracao_audiencia, duracao_interno)
  on public.config_agenda to authenticated;

grant insert (membro_id, tipo, modalidade, titulo, inicio, fim, dia_inteiro, cliente_id,
              processo, local_ou_link, observacoes, particular, situacao, lembrete_minutos)
  on public.compromissos to authenticated;
grant update (membro_id, tipo, modalidade, titulo, inicio, fim, dia_inteiro, cliente_id,
              processo, local_ou_link, observacoes, particular, situacao, chegada_em,
              lembrete_minutos, cancelado_em, motivo_cancelamento)
  on public.compromissos to authenticated;

grant all on public.config_agenda, public.compromissos to service_role;

revoke execute on function public.agenda_periodo(timestamptz, timestamptz) from public, anon;
grant execute on function public.agenda_periodo(timestamptz, timestamptz) to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;

insert into public.config_agenda default values;
