-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 11 · Atualizações e o relógio do servidor
-- =============================================================================
--
-- preparacao-novas-funcoes.md, F4. Cada atendimento ou trabalho feito para um
-- cliente, com quem fez, quem participou e quanto tempo levou — a prova para
-- o cliente de quanto trabalho houve (CLAUDE.md §4).
--
--   · O cronômetro usa a hora do banco (clock_timestamp), não a do navegador.
--   · Cada pessoa tem no máximo um cronômetro aberto (índice único parcial).
--   · Corrigir o horário de uma atividade cronometrada tira a marca de
--     cronômetro: ela passa a valer como lançada à mão. Só a parada normal
--     (parar_cronometro, sem hora informada) mantém a marca.
--   · Quem lançou edita a sua; o administrador também as dos outros.

create table public.atualizacoes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id),
  processo_id    uuid references public.processos (id),
  membro_id      uuid not null references public.membros (id),
  -- Outros membros que participaram: cada um recebe o tempo inteiro.
  participantes  uuid[] not null default '{}',
  tipo           text not null check (tipo in (
                   'atendimento_presencial', 'atendimento_online', 'telefone', 'whatsapp', 'email',
                   'reuniao', 'peca', 'pesquisa', 'audiencia', 'diligencia', 'outro')),
  inicio         timestamptz not null,
  fim            timestamptz,
  cronometrado   boolean not null default false,
  relato              text,
  proxima_providencia text,
  -- O atendimento da Agenda que virou esta atividade ("Iniciar atendimento").
  compromisso_id uuid references public.compromissos (id),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint atualizacao_periodo check (fim is null or fim >= inicio)
);

create unique index atualizacoes_um_cronometro on public.atualizacoes (membro_id)
  where fim is null and cancelado_em is null;
create index atualizacoes_cliente on public.atualizacoes (cliente_id, inicio desc);
create index atualizacoes_processo on public.atualizacoes (processo_id);
create index atualizacoes_membro on public.atualizacoes (membro_id, inicio desc);
create index atualizacoes_compromisso on public.atualizacoes (compromisso_id);

select privado.aplicar_padrao('public.atualizacoes');

create trigger b_cancelamento before update on public.atualizacoes
  for each row execute function privado.registrar_cancelamento();

create function privado.validar_atualizacao()
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

  if new.processo_id is not null and not exists (
    select 1 from public.processos where id = new.processo_id and cliente_id = new.cliente_id
  ) then
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

create trigger c_validar before insert or update on public.atualizacoes
  for each row execute function privado.validar_atualizacao();

-- -----------------------------------------------------------------------------
-- Documento gerado a partir de uma atualização (a ficha de atendimento)
-- -----------------------------------------------------------------------------
alter table public.documentos add column atualizacao_id uuid references public.atualizacoes (id);
create index documentos_atualizacao on public.documentos (atualizacao_id);
grant insert (atualizacao_id) on public.documentos to authenticated;

create function privado.validar_documento_atualizacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.atualizacao_id is not null and not exists (
    select 1 from public.atualizacoes
    where id = new.atualizacao_id
      and cliente_id = new.cliente_id
      and (new.processo_id is null or processo_id = new.processo_id)
  ) then
    raise exception 'A atualização não pertence ao cliente ou ao processo escolhido.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger d_validar_atualizacao before insert on public.documentos
  for each row execute function privado.validar_documento_atualizacao();

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.atualizacoes enable row level security;

create policy "atualizacoes: ver" on public.atualizacoes
  for select to authenticated using ((select privado.edita_clientes()));
create policy "atualizacoes: incluir" on public.atualizacoes
  for insert to authenticated
  with check ((select privado.edita_clientes())
              and (membro_id = (select privado.meu_membro_id()) or (select privado.eh_admin())));
create policy "atualizacoes: alterar" on public.atualizacoes
  for update to authenticated
  using ((select privado.edita_clientes())
         and (membro_id = (select privado.meu_membro_id()) or (select privado.eh_admin())))
  with check ((select privado.edita_clientes())
              and (membro_id = (select privado.meu_membro_id()) or (select privado.eh_admin())));

revoke all on public.atualizacoes from anon, authenticated;
grant select on public.atualizacoes to authenticated;
grant insert (cliente_id, processo_id, membro_id, participantes, tipo, inicio, fim, relato, proxima_providencia, compromisso_id),
  update (cliente_id, processo_id, participantes, tipo, inicio, fim, relato, proxima_providencia,
          cancelado_em, motivo_cancelamento)
  on public.atualizacoes to authenticated;
grant all on public.atualizacoes to service_role;

-- -----------------------------------------------------------------------------
-- Cronômetro
-- -----------------------------------------------------------------------------

-- Abre a atividade com a hora do banco. Com compromisso_id, é o "Iniciar
-- atendimento" da Agenda: só para um atendimento agendado que a pessoa pode
-- editar, e registra a chegada do cliente junto.
create function public.iniciar_cronometro(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   uuid;
  v_comp public.compromissos;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não inclui as atualizações dos clientes.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Dados da atividade inválidos.' using errcode = '22023';
  end if;

  if nullif(p ->> 'compromisso_id', '') is not null then
    select * into v_comp from public.compromissos where id = (p ->> 'compromisso_id')::uuid for update;
    if not found
       or v_comp.cancelado_em is not null
       or v_comp.tipo <> 'atendimento'
       or v_comp.situacao <> 'agendado'
       or v_comp.cliente_id is distinct from (p ->> 'cliente_id')::uuid
    then
      raise exception 'Este atendimento não está disponível para iniciar.' using errcode = 'P0001';
    end if;
    -- O vínculo só vale para o atendimento que a pessoa pode editar na Agenda.
    if not privado.eh_admin()
       and (privado.acesso_agenda() = 'nenhum'
            or (privado.acesso_agenda() <> 'todas' and v_comp.membro_id <> privado.meu_membro_id())
            or (v_comp.particular and v_comp.membro_id <> privado.meu_membro_id()))
    then
      raise exception 'Seu acesso não permite iniciar este atendimento.' using errcode = '42501';
    end if;
    if v_comp.particular and v_comp.membro_id <> privado.meu_membro_id() then
      raise exception 'Atendimento particular de outro membro.' using errcode = '42501';
    end if;
  end if;

  insert into public.atualizacoes
    (cliente_id, processo_id, membro_id, tipo, inicio, cronometrado, relato, compromisso_id, participantes)
  values
    ((p ->> 'cliente_id')::uuid,
     nullif(p ->> 'processo_id', '')::uuid,
     privado.meu_membro_id(),
     coalesce(nullif(p ->> 'tipo', ''), 'atendimento_presencial'),
     clock_timestamp(),
     true,
     nullif(btrim(p ->> 'relato'), ''),
     v_comp.id,
     coalesce(array(select jsonb_array_elements_text(p -> 'participantes')::uuid), '{}'::uuid[]))
  returning id into v_id;

  if v_comp.id is not null and v_comp.chegada_em is null then
    update public.compromissos set chegada_em = clock_timestamp() where id = v_comp.id;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Você já tem um cronômetro rodando. Pare o atual antes de começar outro.' using errcode = 'P0001';
end
$$;

-- Fecha a atividade. Sem p_fim, com a hora do banco, mantendo a marca de
-- cronômetro; com p_fim ("esqueci de parar"), a atividade vira lançada à mão.
-- Atendimento da Agenda ligado a ela passa a realizado.
create function public.parar_cronometro(p_id uuid, p_relato text default null, p_proxima text default null,
                                        p_fim timestamptz default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v       public.atualizacoes;
  v_agora timestamptz := clock_timestamp();
  v_sinal text;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não inclui as atualizações dos clientes.' using errcode = '42501';
  end if;

  select * into v from public.atualizacoes where id = p_id for update;
  if not found or v.fim is not null or v.cancelado_em is not null then
    raise exception 'Este cronômetro não está rodando.' using errcode = 'P0001';
  end if;
  if v.membro_id <> privado.meu_membro_id() and not privado.eh_admin() then
    raise exception 'Só quem iniciou, ou o administrador, para este cronômetro.' using errcode = '42501';
  end if;
  if p_fim is not null and (p_fim < v.inicio or p_fim > v_agora) then
    raise exception 'A hora de fim precisa ser depois do início e antes de agora.' using errcode = 'P0001';
  end if;

  v_sinal := coalesce(current_setting('fhl.cronometro', true), '');
  perform set_config('fhl.cronometro', case when p_fim is null then 'parar' else '' end, true);
  update public.atualizacoes
     set fim = coalesce(p_fim, v_agora),
         relato = coalesce(nullif(btrim(p_relato), ''), relato),
         proxima_providencia = coalesce(nullif(btrim(p_proxima), ''), proxima_providencia)
   where id = p_id;
  perform set_config('fhl.cronometro', v_sinal, true);

  if v.compromisso_id is not null then
    update public.compromissos
       set situacao = 'realizado'
     where id = v.compromisso_id and situacao = 'agendado' and cancelado_em is null;
  end if;
end
$$;

-- A hora de referência vem do servidor; o navegador interpola com performance.now().
create function public.meu_cronometro()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não inclui as atualizações dos clientes.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'agora', clock_timestamp(),
    'atualizacao', (
      select to_jsonb(a) || jsonb_build_object('cliente_nome', c.nome)
      from public.atualizacoes a
      join public.clientes c on c.id = a.cliente_id
      where a.membro_id = privado.meu_membro_id() and a.fim is null and a.cancelado_em is null
    )
  );
end
$$;

revoke execute on function
  public.iniciar_cronometro(jsonb), public.parar_cronometro(uuid, text, text, timestamptz), public.meu_cronometro()
  from public, anon;
grant execute on function
  public.iniciar_cronometro(jsonb), public.parar_cronometro(uuid, text, text, timestamptz), public.meu_cronometro()
  to authenticated;
revoke execute on function privado.validar_atualizacao(), privado.validar_documento_atualizacao() from public, anon;
