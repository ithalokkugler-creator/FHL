-- Corrige JSON null recebido de formulários antigos sem mudar regras, RLS ou permissões.
-- Campo ausente e JSON null representam a mesma memória não informada.
create or replace function public.criar_tarefa(p jsonb)
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
          nullif(p -> 'memoria_prazo', 'null'::jsonb),
          v_comp)
  returning id into v_id;

  return v_id;
end
$$;

