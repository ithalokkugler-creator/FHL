-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 36 · Remarcar com a nova data
-- =============================================================================
--
-- Teste do Guilherme no primeiro dia (20/10/2026): "Remarcado" só trocava a
-- etiqueta — não perguntava a nova data — e não havia como voltar atrás.
--
-- Agora remarcar_compromisso() faz as duas coisas numa transação: marca o
-- compromisso como remarcado e cria um igual no novo horário, ligados por
-- remarcado_para. Na tela, "Voltar para agendado" desfaz realizado, faltou ou
-- remarcado (o novo, se houver, continua; cancela-se à parte).
--
-- No Google: o novo vai como evento do sistema; o antigo, se foi o sistema
-- que criou, sai. Se veio do Google, fica lá (regra da migração 34).

alter table public.compromissos
  add column remarcado_para uuid references public.compromissos (id);

create index compromissos_remarcado_para on public.compromissos (remarcado_para)
  where remarcado_para is not null;

comment on column public.compromissos.remarcado_para is
  'O compromisso criado no novo horário quando este foi remarcado.';

-- Só um remarcado aponta para o novo horário.
create function privado.limpar_remarcado()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.situacao <> 'remarcado' then
    new.remarcado_para := null;
  end if;
  return new;
end
$$;

create trigger c_remarcado before insert or update on public.compromissos
  for each row execute function privado.limpar_remarcado();

grant update (remarcado_para) on public.compromissos to authenticated;

-- Com os direitos de quem chama: só remarca quem pode editar o compromisso e
-- marcar outro para o mesmo responsável (políticas de compromissos).
create function public.remarcar_compromisso(p_id uuid, p_inicio timestamptz, p_fim timestamptz)
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
                                   processo, local_ou_link, observacoes, particular, lembrete_minutos)
  values (c.membro_id, c.tipo, c.modalidade, c.titulo, p_inicio, p_fim, c.dia_inteiro, c.cliente_id,
          c.processo, c.local_ou_link, c.observacoes, c.particular, c.lembrete_minutos)
  returning id into v_novo;

  update public.compromissos set situacao = 'remarcado', remarcado_para = v_novo where id = p_id;
  if not found then
    raise exception 'Sem permissão para alterar este compromisso.' using errcode = '42501';
  end if;
  return v_novo;
end
$$;

revoke execute on function public.remarcar_compromisso(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.remarcar_compromisso(uuid, timestamptz, timestamptz) to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
