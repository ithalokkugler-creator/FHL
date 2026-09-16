-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 01 · Base: membros, permissões por módulo, auditoria e clientes
-- =============================================================================
--
-- Preparação da área dos advogados, seção 5. O que este arquivo garante no
-- banco, e não só na tela:
--
--   · Um login por pessoa. O login só enxerga dados depois de vinculado a um
--     membro ativo, pelo e-mail que o administrador cadastrou (5.1).
--   · Permissão por módulo, com um nível por membro (5.2).
--   · Todo registro guarda quem criou e quem alterou por último, e toda
--     alteração vai para a auditoria com o valor anterior e o novo (5.3).
--   · Nada se apaga: não existe GRANT de DELETE, e um gatilho recusa a
--     exclusão mesmo para quem tiver o privilégio (5.3).
--
-- Nada criado em `public` fica exposto na Data API sem um GRANT explícito.

-- -----------------------------------------------------------------------------
-- Exposição opt-in
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Funções auxiliares ficam num schema que a Data API não publica.
create schema privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;
alter default privileges for role postgres in schema privado
  revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Membros
-- -----------------------------------------------------------------------------
create table public.membros (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid unique references auth.users (id) on delete set null,
  nome              text not null check (btrim(nome) <> ''),
  nome_curto        text not null check (btrim(nome_curto) <> ''),
  email             text unique check (email = lower(btrim(email))),
  papel             text not null default 'associado'
                    check (papel in ('admin', 'socio', 'secretaria', 'associado')),
  oab               text,
  cor               text not null default '#2E615D' check (cor ~* '^#[0-9a-f]{6}$'),
  -- Nível por módulo (5.2). Para o administrador valem sempre os níveis
  -- máximos, qualquer que seja o valor gravado aqui.
  acesso_agenda     text not null default 'propria'
                    check (acesso_agenda in ('nenhum', 'propria', 'todas')),
  acesso_financeiro text not null default 'nenhum'
                    check (acesso_financeiro in ('nenhum', 'lancamentos', 'completo')),
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  criado_por        uuid,
  alterado_em       timestamptz,
  alterado_por      uuid
);

comment on column public.membros.acesso_agenda is
  'nenhum · propria: vê a agenda de todos e edita a sua · todas: vê e edita todas';
comment on column public.membros.acesso_financeiro is
  'nenhum · lancamentos: lança, sem ver fechamento nem divisão · completo';

-- -----------------------------------------------------------------------------
-- Quem está logado
-- SECURITY DEFINER porque as políticas de `membros` usam estas mesmas funções:
-- como invocador, a leitura de `membros` cairia de novo na política.
-- -----------------------------------------------------------------------------
create function privado.meu_membro_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.membros m
  where m.user_id = (select auth.uid()) and m.ativo
$$;

create function privado.eh_membro()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.meu_membro_id() is not null
$$;

create function privado.eh_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo and m.papel = 'admin'
  )
$$;

create function privado.acesso_agenda()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'todas' else m.acesso_agenda end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

create function privado.acesso_financeiro()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'completo' else m.acesso_financeiro end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

-- "Hoje" é sempre o dia em Paranaguá, não o do servidor (7.7).
create function privado.hoje()
returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- -----------------------------------------------------------------------------
-- Auditoria (5.3)
-- Só o gatilho escreve aqui. Ninguém tem INSERT, UPDATE ou DELETE.
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  tabela      text not null,
  registro_id uuid not null,
  acao        text not null,
  campos      text[],
  antes       jsonb,
  depois      jsonb,
  membro_id   uuid,
  usuario_id  uuid
);

create index auditoria_registro on public.auditoria (tabela, registro_id, em desc);
create index auditoria_em on public.auditoria (em desc);

comment on table public.auditoria is
  'Histórico de tudo que foi criado ou alterado. Em alterações, antes/depois trazem só os campos que mudaram.';

-- Carimbo de quem criou e de quem alterou por último. Vem do login, nunca do
-- que a tela mandar.
create function privado.carimbar()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_em    := now();
    new.criado_por   := privado.meu_membro_id();
    new.alterado_em  := null;
    new.alterado_por := null;
  else
    new.criado_em    := old.criado_em;
    new.criado_por   := old.criado_por;
    new.alterado_em  := now();
    new.alterado_por := privado.meu_membro_id();
  end if;
  return new;
end
$$;

create function privado.auditar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_novo   jsonb := to_jsonb(new);
  v_velho  jsonb;
  v_campos text[];
  v_antes  jsonb;
  v_depois jsonb;
  v_acao   text := 'criou';
begin
  if tg_op = 'UPDATE' then
    v_velho := to_jsonb(old);

    select array_agg(k order by k)
      into v_campos
      from jsonb_object_keys(v_novo) as k
     where k not in ('criado_em', 'criado_por', 'alterado_em', 'alterado_por')
       and v_velho -> k is distinct from v_novo -> k;

    -- Salvar sem mudar nada não é um evento.
    if v_campos is null then
      return null;
    end if;

    select jsonb_object_agg(k, v_velho -> k), jsonb_object_agg(k, v_novo -> k)
      into v_antes, v_depois
      from unnest(v_campos) as k;

    v_acao := case
      when v_velho ->> 'cancelado_em' is null and v_novo ->> 'cancelado_em' is not null then 'cancelou'
      when v_velho ->> 'estornado_em' is null and v_novo ->> 'estornado_em' is not null then 'estornou'
      when (v_velho ->> 'ativo')::boolean and not (v_novo ->> 'ativo')::boolean then 'desativou'
      when not (v_velho ->> 'ativo')::boolean and (v_novo ->> 'ativo')::boolean then 'reativou'
      when (v_velho ->> 'fechado')::boolean and not (v_novo ->> 'fechado')::boolean then 'reabriu'
      when not (v_velho ->> 'fechado')::boolean and (v_novo ->> 'fechado')::boolean then 'fechou'
      else 'alterou'
    end;
  else
    v_depois := v_novo;
  end if;

  insert into public.auditoria
    (tabela, registro_id, acao, campos, antes, depois, membro_id, usuario_id)
  values
    (tg_table_name, (v_novo ->> 'id')::uuid, v_acao, v_campos, v_antes, v_depois,
     privado.meu_membro_id(), (select auth.uid()));

  return null;
end
$$;

create function privado.bloquear_exclusao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Registros não são apagados. Use cancelar, estornar ou desativar.'
    using errcode = 'P0001';
end
$$;

-- Os três gatilhos que toda tabela de negócio recebe. Os nomes fixam a ordem:
-- o Postgres dispara gatilhos do mesmo momento em ordem alfabética, e o
-- carimbo precisa vir antes de qualquer outra verificação.
create function privado.aplicar_padrao(p_tabela regclass)
returns void
language plpgsql set search_path = ''
as $$
begin
  execute format(
    'create trigger a_carimbar before insert or update on %s
       for each row execute function privado.carimbar()', p_tabela);
  execute format(
    'create trigger z_auditar after insert or update on %s
       for each row execute function privado.auditar()', p_tabela);
  execute format(
    'create trigger sem_exclusao before delete on %s
       for each row execute function privado.bloquear_exclusao()', p_tabela);
end
$$;

-- Cancelar é a exclusão deste sistema: exige motivo, grava quem e quando, e
-- não se desfaz. Registro cancelado sai das listas e fica no histórico.
-- Serve a toda tabela com cancelado_em, cancelado_por e motivo_cancelamento.
create function privado.registrar_cancelamento()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.cancelado_em is not null then
    raise exception 'Registro cancelado não pode ser alterado.' using errcode = 'P0001';
  end if;

  if new.cancelado_em is not null then
    if coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_em  := now();
    new.cancelado_por := privado.meu_membro_id();
  else
    new.motivo_cancelamento := null;
  end if;

  return new;
end
$$;

select privado.aplicar_padrao('public.membros');

-- O escritório nunca fica sem administrador: quem tira o último perde o
-- único acesso capaz de desfazer.
create function privado.manter_um_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.papel = 'admin' and old.ativo
     and (new.papel <> 'admin' or not new.ativo)
     and not exists (
       select 1 from public.membros m
       where m.papel = 'admin' and m.ativo and m.id <> old.id)
  then
    raise exception 'O escritório precisa de pelo menos um administrador ativo.'
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger b_manter_um_admin before update on public.membros
  for each row execute function privado.manter_um_admin();

-- -----------------------------------------------------------------------------
-- Clientes — cadastro mínimo (5.5)
-- Enquanto o módulo Clientes não existe, contrato e compromisso se ligam a
-- este cadastro. Quando o módulo chegar, ele cresce a partir desta tabela.
-- -----------------------------------------------------------------------------
create table public.clientes (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (btrim(nome) <> ''),
  -- Só dígitos: CPF (11) ou CNPJ (14). O CNPJ alfanumérico da Receita, emitido
  -- desde julho de 2026, tem letras nas 12 primeiras posições.
  documento    text check (documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  telefone     text check (telefone ~ '^[0-9]{10,13}$'),
  email        text,
  observacoes  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create unique index clientes_documento_unico on public.clientes (documento)
  where documento is not null;
create index clientes_nome on public.clientes (lower(nome));

select privado.aplicar_padrao('public.clientes');

-- -----------------------------------------------------------------------------
-- Quem pode ver o histórico de um registro
-- Segue a permissão do módulo dono da tabela. As tabelas dos módulos são
-- criadas nas migrações seguintes; plpgsql só resolve os nomes ao executar.
-- -----------------------------------------------------------------------------
create function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if privado.eh_admin() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    when p_tabela = 'clientes' then
      return true;
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro') then
      return privado.acesso_financeiro() in ('lancamentos', 'completo');
    when p_tabela in ('fechamentos', 'divisao_cotas') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela = 'compromissos' then
      -- Compromisso particular: o histórico também é só do dono.
      return privado.acesso_agenda() <> 'nenhum' and exists (
        select 1 from public.compromissos c
        where c.id = p_registro
          and (c.membro_id = privado.meu_membro_id() or not c.particular));
    else
      return false;
  end case;
end
$$;

-- -----------------------------------------------------------------------------
-- Vínculo do login com o membro
-- Chamado pela tela logo depois do login. Na primeira vez, liga o usuário ao
-- membro que tem o mesmo e-mail — só se o e-mail estiver confirmado, senão
-- qualquer um criaria uma conta com o e-mail de um sócio.
-- -----------------------------------------------------------------------------
create function public.iniciar_sessao()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_membro public.membros;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_membro from public.membros where user_id = v_uid;

  if not found then
    select lower(u.email) into v_email
      from auth.users u
     where u.id = v_uid and u.email_confirmed_at is not null;

    update public.membros
       set user_id = v_uid
     where email = v_email and user_id is null and ativo
    returning * into v_membro;

    if not found then
      return null;
    end if;
  end if;

  if not v_membro.ativo then
    return null;
  end if;

  return jsonb_build_object(
    'id',                v_membro.id,
    'nome',              v_membro.nome,
    'nome_curto',        v_membro.nome_curto,
    'papel',             v_membro.papel,
    'cor',               v_membro.cor,
    'acesso_agenda',     case when v_membro.papel = 'admin' then 'todas' else v_membro.acesso_agenda end,
    'acesso_financeiro', case when v_membro.papel = 'admin' then 'completo' else v_membro.acesso_financeiro end
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas
-- `(select f())` em vez de `f()`: o Postgres avalia uma vez por consulta, não
-- uma vez por linha.
-- -----------------------------------------------------------------------------
alter table public.membros   enable row level security;
alter table public.auditoria enable row level security;
alter table public.clientes  enable row level security;

create policy "membros: ver" on public.membros
  for select to authenticated using ((select privado.eh_membro()));
create policy "membros: incluir" on public.membros
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "membros: alterar" on public.membros
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "auditoria: ver" on public.auditoria
  for select to authenticated using (privado.pode_ver_auditoria(tabela, registro_id));

create policy "clientes: ver" on public.clientes
  for select to authenticated using ((select privado.eh_membro()));
create policy "clientes: incluir" on public.clientes
  for insert to authenticated with check ((select privado.eh_membro()));
create policy "clientes: alterar" on public.clientes
  for update to authenticated
  using ((select privado.eh_membro())) with check ((select privado.eh_membro()));

-- -----------------------------------------------------------------------------
-- Privilégios
-- Colunas de carimbo, `id` e `user_id` ficam fora do INSERT e do UPDATE.
-- -----------------------------------------------------------------------------
revoke all on public.membros, public.auditoria, public.clientes from anon, authenticated;

grant select on public.membros to authenticated;
grant insert (nome, nome_curto, email, papel, oab, cor, acesso_agenda, acesso_financeiro, ativo)
  on public.membros to authenticated;
grant update (nome, nome_curto, email, papel, oab, cor, acesso_agenda, acesso_financeiro, ativo)
  on public.membros to authenticated;

grant select on public.auditoria to authenticated;

grant select on public.clientes to authenticated;
grant insert (nome, documento, telefone, email, observacoes) on public.clientes to authenticated;
grant update (nome, documento, telefone, email, observacoes, ativo) on public.clientes to authenticated;

grant all on public.membros, public.auditoria, public.clientes to service_role;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function
  privado.meu_membro_id(), privado.eh_membro(), privado.eh_admin(),
  privado.acesso_agenda(), privado.acesso_financeiro(), privado.hoje(),
  privado.pode_ver_auditoria(text, uuid)
  to authenticated;

revoke execute on function public.iniciar_sessao() from public, anon;
grant execute on function public.iniciar_sessao() to authenticated;

-- -----------------------------------------------------------------------------
-- Equipe inicial (src/data/equipe.mjs)
-- Sem e-mail: o administrador preenche na tela Membros, e é o e-mail que
-- libera o login. Níveis dos sócios conforme a proposta 5.2 — a confirmar.
-- -----------------------------------------------------------------------------
insert into public.membros (nome, nome_curto, papel, oab, cor, acesso_agenda, acesso_financeiro) values
  ('Vinícius Rangel de Lima de Paula Lisboa', 'Vinícius',  'admin', 'OAB/PR 105.790', '#2E615D', 'todas',   'completo'),
  ('Juliana Cristina da Silva Lisboa',        'Juliana',   'socio', 'OAB/PR 117.141', '#6E5551', 'propria', 'completo'),
  ('Guilherme de Oliveira da Fonseca',        'Guilherme', 'socio', 'OAB/PR 116.072', '#3F5F8A', 'propria', 'completo'),
  ('Marlon Albini Hespanha',                  'Marlon',    'socio', 'OAB/PR 131.898', '#8A5F22', 'propria', 'completo');
