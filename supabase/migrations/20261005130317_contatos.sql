-- 08 · Contatos: o formulário do site chega na área dos advogados

create table public.contatos (
  id               uuid primary key default gen_random_uuid(),
  -- De onde veio. Só 'site' entra pela função de borda; o resto é lançado à mão.
  canal            text not null default 'site'
                   check (canal in ('site', 'whatsapp', 'telefone', 'presencial', 'indicacao', 'outro')),
  nome             text not null check (btrim(nome) <> '' and char_length(nome) <= 200),
  email            text check (char_length(email) <= 200),
  telefone         text check (char_length(telefone) <= 40),
  empresa          text check (char_length(empresa) <= 200),
  mensagem         text check (char_length(mensagem) <= 5000),
  -- Página do site em que o formulário foi enviado e a campanha, se veio de
  -- uma. É o que mostra se conteúdo e campanha trazem gente [18:30].
  pagina           text check (char_length(pagina) <= 300),
  campanha         text check (campanha ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- LGPD: quando a pessoa marcou o consentimento, na hora do servidor.
  consentimento_em timestamptz,
  recebido_em      timestamptz not null default now(),
  situacao         text not null default 'novo'
                   check (situacao in ('novo', 'em_atendimento', 'contatado', 'convertido', 'arquivado')),
  responsavel_id   uuid references public.membros (id),
  cliente_id       uuid references public.clientes (id),
  convertido_em    timestamptz,
  observacoes      text,
  criado_em        timestamptz not null default now(),
  criado_por       uuid,
  alterado_em      timestamptz,
  alterado_por     uuid,
  constraint contato_como_responder check (coalesce(btrim(email), '') <> '' or coalesce(btrim(telefone), '') <> ''),
  constraint contato_site_completo check (
    canal <> 'site' or (consentimento_em is not null and coalesce(btrim(mensagem), '') <> '')),
  constraint contato_convertido check (situacao <> 'convertido' or cliente_id is not null)
);

create index contatos_situacao on public.contatos (situacao, recebido_em desc);
create index contatos_cliente on public.contatos (cliente_id);
create index contatos_responsavel on public.contatos (responsavel_id);

select privado.aplicar_padrao('public.contatos');

-- Carimbo do servidor: o indicador mede a conversão, não o recebimento.
create function privado.carimbar_conversao_contato()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.situacao = 'convertido' and old.situacao <> 'convertido' then
    new.convertido_em := now();
  end if;
  return new;
end
$$;
create trigger contato_conversao before update on public.contatos
  for each row execute function privado.carimbar_conversao_contato();

-- Limite de envio por IP. Fora de `contatos` de propósito: ninguém da equipe
-- precisa ver isto, e cada linha some depois de um dia. É dado técnico, não
-- registro do escritório — a regra "nada se apaga" não se aplica aqui.
create table public.contatos_envios (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  em      timestamptz not null default now()
);
create index contatos_envios_ip on public.contatos_envios (ip_hash, em desc);
alter table public.contatos_envios enable row level security;  -- sem política: só a chave de serviço
revoke all on public.contatos_envios from anon, authenticated;
grant all on public.contatos_envios to service_role;

-- Chamada só pela função de borda receber-contato, com a chave de serviço.
create function public.registrar_contato(p jsonb, p_ip_hash text default null)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- O teto global precisa ser atômico: envios simultâneos não podem passar
  -- na mesma contagem. A trava termina junto com esta transação.
  perform pg_advisory_xact_lock(741502026);
  delete from public.contatos_envios where em < now() - interval '1 day';

  if p_ip_hash is not null then
    if (select count(*) from public.contatos_envios e
         where e.ip_hash = p_ip_hash and e.em > now() - interval '10 minutes') >= 3 then
      raise exception 'Muitas mensagens em pouco tempo. Tente de novo daqui a alguns minutos.'
        using errcode = 'P0001';
    end if;
    insert into public.contatos_envios (ip_hash) values (p_ip_hash);
  end if;

  -- Teto do escritório inteiro: um robô não enche o banco nem a tela.
  if (select count(*) from public.contatos c
       where c.canal = 'site' and c.recebido_em > now() - interval '1 hour') >= 30 then
    raise exception 'Recebemos muitas mensagens agora. Tente de novo mais tarde ou use o WhatsApp.'
      using errcode = 'P0001';
  end if;

  if coalesce(p ->> 'consent', '') not in ('1', 'true', 'on') then
    raise exception 'É preciso autorizar o tratamento dos dados para enviar.' using errcode = 'P0001';
  end if;

  insert into public.contatos (canal, nome, email, telefone, empresa, mensagem, pagina, campanha, consentimento_em)
  values ('site',
          btrim(p ->> 'nome'),
          nullif(lower(btrim(p ->> 'email')), ''),
          nullif(btrim(p ->> 'telefone'), ''),
          nullif(btrim(p ->> 'empresa'), ''),
          btrim(p ->> 'mensagem'),
          nullif(btrim(p ->> 'pagina'), ''),
          nullif(btrim(p ->> 'campanha'), ''),
          now())
  returning id into v_id;

  return v_id;
end
$$;

alter table public.contatos enable row level security;

create policy "contatos: ver" on public.contatos
  for select to authenticated using ((select privado.edita_clientes()));
create policy "contatos: incluir" on public.contatos
  for insert to authenticated
  with check ((select privado.edita_clientes()) and canal <> 'site');
create policy "contatos: alterar" on public.contatos
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.contatos from anon, authenticated;
grant select on public.contatos to authenticated;
grant insert (canal, nome, email, telefone, empresa, mensagem, responsavel_id, observacoes)
  on public.contatos to authenticated;
grant update (situacao, responsavel_id, cliente_id, observacoes)
  on public.contatos to authenticated;
grant all on public.contatos to service_role;

revoke execute on function public.registrar_contato(jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_contato(jsonb, text) to service_role;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.edita_clientes() to authenticated;
