-- O formulário de audiência envia o lembrete, mas a RPC original omitia a
-- coluna no INSERT. Preserva acessos, validações e vínculo atômico anteriores.
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

  -- O número vem do processo vinculado (ou da própria comunicação), não da tela.
  select numero into v_num from public.processos where id = v.processo_id;
  insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, cliente_id, processo, local_ou_link, observacoes, lembrete_minutos)
  values (v_resp, 'audiencia', p ->> 'modalidade',
          coalesce(nullif(btrim(p ->> 'titulo'), ''), 'Audiência'),
          (p ->> 'inicio')::timestamptz, (p ->> 'fim')::timestamptz,
          v.cliente_id, coalesce(v_num, v.numero_processo),
          nullif(p ->> 'local_ou_link', ''), nullif(p ->> 'observacoes', ''),
          nullif(p ->> 'lembrete_minutos', '')::integer)
  returning id into v_id;

  update public.intimacoes set compromisso_id = v_id, situacao = 'conferida' where id = p_id;
  return v_id;
end
$$;
