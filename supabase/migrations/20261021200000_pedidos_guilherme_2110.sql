-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 39 · Pedidos do Guilherme (21/10): tarefa a partir da intimação, posição do
--      cliente no processo e atendimento sem cliente vinculado
-- =============================================================================
--
--   · "Pela área de intimações, não consigo lançar tarefa, o sistema exige que
--     seja prazo." criar_prazo_intimacao recusava tudo que não fosse prazo.
--     Agora aceita tarefa comum também — ligada à intimação, com a
--     conferência gravada junto, como o prazo.
--
--   · "Inserir uma opção que nos permita identificar se o nosso cliente,
--     naquele processo específico, é autor, réu, exequente, executado,
--     recorrente, recorrido ou terceiro." processos.posicao_cliente. Texto
--     (até 60 letras), não lista fechada: a tela oferece as posições usuais
--     (como o Projudi/PJe mostram as partes) e "Outra", e um processo que
--     sobe de instância muda a posição sem migração nova.
--
--   · "No atendimento aparece a opção de marcar quando o cliente chegou, mas
--     o cronômetro não aparece." O atendimento das 17h do Vinícius não tinha
--     cliente vinculado — e "Iniciar atendimento" exigia o mesmo cliente do
--     compromisso, então nem aparecia. iniciar_cronometro agora vincula ao
--     compromisso o cliente escolhido na hora quando ele ainda não tem um. As
--     anotações durante o atendimento usam o UPDATE de relato que a dona da
--     atividade aberta já tinha (nenhuma regra nova).

-- -----------------------------------------------------------------------------
-- Tarefa a partir da intimação
-- -----------------------------------------------------------------------------
create or replace function public.criar_prazo_intimacao(p_id uuid, p jsonb)
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
  -- Prazo processual ou tarefa comum (pedido do Guilherme, 21/10): os dois
  -- nascem ligados à intimação, com a conferência gravada junto.
  if coalesce(p ->> 'tipo', '') not in ('prazo', 'tarefa') then
    raise exception 'Escolha tarefa ou prazo processual.' using errcode = 'P0001';
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

-- -----------------------------------------------------------------------------
-- Posição do nosso cliente no processo
-- -----------------------------------------------------------------------------
alter table public.processos
  add column posicao_cliente text
    check (posicao_cliente is null or char_length(btrim(posicao_cliente)) between 1 and 60);

comment on column public.processos.posicao_cliente is
  'Como o nosso cliente figura neste processo: Autor(a), Réu/Ré, Exequente, Executado(a), Recorrente, Recorrido(a), Terceiro(a)…';

grant insert (posicao_cliente), update (posicao_cliente) on public.processos to authenticated;

-- -----------------------------------------------------------------------------
-- Iniciar atendimento sem cliente vinculado
-- -----------------------------------------------------------------------------
create or replace function public.iniciar_cronometro(p jsonb)
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
    then
      raise exception 'Este atendimento não está disponível para iniciar.' using errcode = 'P0001';
    end if;
    if v_comp.cliente_id is not null and v_comp.cliente_id is distinct from nullif(p ->> 'cliente_id', '')::uuid then
      raise exception 'Este atendimento é de outro cliente. Mantenha o cliente do compromisso.' using errcode = 'P0001';
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
    -- Atendimento ainda sem cliente (reserva que veio do Google, ou marcado só
    -- com o nome): quem atende escolhe ou cadastra o cliente agora, e ele fica
    -- no compromisso. Antes, o botão nem aparecia e o cronômetro não começava.
    if v_comp.cliente_id is null then
      if nullif(p ->> 'cliente_id', '') is null then
        raise exception 'Escolha o cliente do atendimento.' using errcode = 'P0001';
      end if;
      update public.compromissos set cliente_id = (p ->> 'cliente_id')::uuid where id = v_comp.id;
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

revoke execute on function public.criar_prazo_intimacao(uuid, jsonb), public.iniciar_cronometro(jsonb) from public, anon;
grant execute on function public.criar_prazo_intimacao(uuid, jsonb) to authenticated, service_role;
grant execute on function public.iniciar_cronometro(jsonb) to authenticated;
