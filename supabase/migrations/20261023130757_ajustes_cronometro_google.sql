-- Prevenção de perda de anotações e de vínculos em transferências do Google.
-- Não regrava lançamentos nem corrige dados históricos.

create function public.salvar_anotacoes_cronometro(p_id uuid, p_versao timestamptz, p_campos jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v public.atualizacoes;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não inclui as atualizações dos clientes.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_campos) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_campos) k where k not in ('relato', 'proxima_providencia')) then
    raise exception 'Campos de anotação inválidos.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_campos) x where jsonb_typeof(x.value) not in ('string', 'null'))
     or char_length(p_campos ->> 'relato') > 30000 or char_length(p_campos ->> 'proxima_providencia') > 5000 then
    raise exception 'Confira o tamanho e o texto das anotações.' using errcode = '22023';
  end if;
  select * into v from public.atualizacoes where id = p_id for update;
  if not found or v.fim is not null or v.cancelado_em is not null then
    raise exception 'O cronômetro já foi parado ou não está disponível. Suas anotações continuam nesta tela; copie o texto antes de sair.' using errcode = 'P0001';
  end if;
  if v.membro_id <> privado.meu_membro_id() and not privado.eh_admin() then
    raise exception 'Só quem iniciou, ou o administrador, altera estas anotações.' using errcode = '42501';
  end if;
  if v.alterado_em is distinct from p_versao then
    raise exception 'Este atendimento mudou em outra tela. Suas anotações não foram substituídas: copie o texto e confira a versão atual antes de salvar.' using errcode = '40001';
  end if;
  if p_campos <> '{}'::jsonb then
    update public.atualizacoes
       set relato = case when p_campos ? 'relato' then nullif(btrim(p_campos ->> 'relato'), '') else relato end,
           proxima_providencia = case when p_campos ? 'proxima_providencia' then nullif(btrim(p_campos ->> 'proxima_providencia'), '') else proxima_providencia end
     where id = p_id returning * into v;
  end if;
  return to_jsonb(v);
end
$$;

create function public.parar_cronometro_seguro(p_id uuid, p_versao timestamptz, p_campos jsonb, p_fim timestamptz default null)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  -- Versão, mudanças de texto e parada são uma transação só.
  perform public.salvar_anotacoes_cronometro(p_id, p_versao, p_campos);
  perform public.parar_cronometro(p_id, null, null, p_fim);
end
$$;

revoke all on function public.salvar_anotacoes_cronometro(uuid, timestamptz, jsonb),
  public.parar_cronometro_seguro(uuid, timestamptz, jsonb, timestamptz) from public, anon;
grant execute on function public.salvar_anotacoes_cronometro(uuid, timestamptz, jsonb),
  public.parar_cronometro_seguro(uuid, timestamptz, jsonb, timestamptz) to authenticated, service_role;

-- Metadados privados aprendidos da API. NULL nos vínculos antigos até a
-- próxima leitura real; nenhuma associação histórica é inferida por nome.
alter table privado.google_eventos add column ical_uid text, add column ocorrencia text;

create function public.google_agenda_possiveis_transferencias(p_calendario text, p_eventos jsonb)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.evento_id, 'calendario', g.calendario,
    'ical_uid', g.ical_uid, 'ocorrencia', g.ocorrencia)), '[]'::jsonb)
  from privado.google_eventos g join public.compromissos c on c.id = g.compromisso_id
  join public.membros m on m.id = c.membro_id
  where g.origem = 'google' and g.calendario <> p_calendario and g.evento_id is not null
    and c.cancelado_em is null and m.ativo
    and exists (select 1 from jsonb_array_elements(p_eventos) e
      where e ->> 'status' = 'confirmed' and e ->> 'id' = g.evento_id
        and e ->> 'organizador' = p_calendario
        and (g.ical_uid is null or (g.ical_uid = e ->> 'ical_uid'
          and g.ocorrencia is not distinct from nullif(e ->> 'ocorrencia', ''))))
$$;
revoke all on function public.google_agenda_possiveis_transferencias(text, jsonb) from public, anon, authenticated;
grant execute on function public.google_agenda_possiveis_transferencias(text, jsonb) to service_role;

-- NULL legado preserva; vazio explicitamente enviado limpa.
create or replace function public.parar_cronometro(p_id uuid, p_relato text default null, p_proxima text default null,
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
         relato = case when p_relato is null then relato else nullif(btrim(p_relato), '') end,
         proxima_providencia = case when p_proxima is null then proxima_providencia else nullif(btrim(p_proxima), '') end
   where id = p_id;
  perform set_config('fhl.cronometro', v_sinal, true);

  if v.compromisso_id is not null then
    update public.compromissos
       set situacao = 'realizado'
     where id = v.compromisso_id and situacao = 'agendado' and cancelado_em is null;
  end if;
end
$$;

create or replace function public.google_agenda_aplicar(p_calendario text, p_eventos jsonb)
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

      -- A função de borda só informa transferido_de depois de consultar
      -- a origem na API e confirmar exclusão. Id + UID + ocorrência devem
      -- coincidir; uma cópia ainda viva na origem nunca recebe esta marca.
      if g.compromisso_id is null and e ->> 'status' = 'confirmed'
         and nullif(e ->> 'ical_uid', '') is not null
         and e ->> 'organizador' = p_calendario
         and nullif(e ->> 'transferido_de', '') is not null then
        select x.* into g from privado.google_eventos x
          join public.compromissos c0 on c0.id = x.compromisso_id
         where x.origem = 'google' and x.calendario = e ->> 'transferido_de'
           and x.calendario <> p_calendario and x.evento_id = e ->> 'id'
           and c0.cancelado_em is null
           and ((x.ical_uid = e ->> 'ical_uid'
                 and x.ocorrencia is not distinct from nullif(e ->> 'ocorrencia', ''))
                or (x.ical_uid is null and e ->> 'ical_uid_origem' = e ->> 'ical_uid'
                    and nullif(e ->> 'ocorrencia_origem', '') is not distinct from nullif(e ->> 'ocorrencia', '')))
         for update of x;
        if found then
          update privado.google_eventos set calendario = p_calendario, etag = null,
                 ical_uid = e ->> 'ical_uid', ocorrencia = nullif(e ->> 'ocorrencia', '')
           where compromisso_id = g.compromisso_id;
          select * into g from privado.google_eventos where compromisso_id = g.compromisso_id;
        end if;
      end if;
      -- Aprende identidade também quando o etag ainda é igual. Só metadados
      -- de sincronização mudam; cliente/processo/conteúdo ficam preservados.
      if g.compromisso_id is not null and e ->> 'status' = 'confirmed'
         and nullif(e ->> 'ical_uid', '') is not null then
        update privado.google_eventos set ical_uid = e ->> 'ical_uid', ocorrencia = nullif(e ->> 'ocorrencia', '')
         where compromisso_id = g.compromisso_id;
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
      update privado.google_eventos set ical_uid = nullif(e ->> 'ical_uid', ''), ocorrencia = nullif(e ->> 'ocorrencia', '')
       where compromisso_id = v_id;
      v_criados := v_criados + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_object('id', e ->> 'id', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('criados', v_criados, 'alterados', v_alterados, 'cancelados', v_cancel,
                            'erros', v_erros);
end
$$;
