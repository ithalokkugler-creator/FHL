-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 27 · Operação e segurança: sessão, convites, acessos, erros, LGPD e cópias
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T05, T06 e T16. O que dá para garantir no
-- banco; o resto (SMTP, cópia automática, monitoramento) é configuração do
-- provedor, documentada em docs/operacao/.
--
--   · config_seguranca: minutos de inatividade até a tela encerrar a sessão.
--     Segundo fator (2FA) ficou fora por decisão do Ithalo (08/10/2026).
--   · Convite de acesso pelo próprio sistema: o administrador pede, a função
--     de borda `administrar-usuarios` envia pelo Auth com a chave do servidor
--     e o resultado fica registrado (pendente → enviado / falhou). Nenhuma
--     senha passa pela tela.
--   · Acessos: os registros de auditoria do próprio Auth (login, saída,
--     recuperação), lidos por função restrita ao administrador e à auditoria.
--     O IP vem do provedor, nunca do navegador.
--   · Erros técnicos da tela: rota, código e mensagem curta, sem conteúdo do
--     formulário, sem token e com números longos e e-mails apagados.
--   · Solicitações de titular (LGPD): registro, prazo, responsável e decisão.
--   · Cópias de segurança: cada execução da rotina registra quando, quanto e
--     o hash — para saber a idade da última cópia boa.

create table public.config_seguranca (
  id                  uuid primary key default gen_random_uuid(),
  unica               boolean not null default true unique check (unica),
  inatividade_minutos smallint not null default 30 check (inatividade_minutos between 5 and 480),
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid
);
select privado.aplicar_padrao('public.config_seguranca');
insert into public.config_seguranca default values;

-- -----------------------------------------------------------------------------
-- Convites de acesso
-- -----------------------------------------------------------------------------
create table public.convites_acesso (
  id           uuid primary key default gen_random_uuid(),
  membro_id    uuid not null references public.membros (id),
  email        text not null,
  estado       text not null default 'pendente' check (estado in ('pendente', 'enviado', 'falhou', 'aceito')),
  tentativas   integer not null default 0,
  ultimo_erro  text,
  enviado_em   timestamptz,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);
create index convites_membro on public.convites_acesso (membro_id, criado_em desc);
select privado.aplicar_padrao('public.convites_acesso');

-- Chamada pela função de borda COM o token de quem pediu: é aqui que se
-- confere que é o administrador.
create function public.solicitar_convite(p_membro uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m   public.membros;
  v_id uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador convida.' using errcode = '42501';
  end if;
  select * into m from public.membros where id = p_membro;
  if not found or not m.ativo then
    raise exception 'Membro não encontrado ou desativado.' using errcode = 'P0001';
  end if;
  if m.email is null then
    raise exception 'Cadastre o e-mail de acesso antes de convidar.' using errcode = 'P0001';
  end if;
  if m.user_id is not null then
    raise exception 'Esta pessoa já entrou no sistema; não precisa de convite.' using errcode = 'P0001';
  end if;

  -- Um convite em aberto por pessoa: pedir de novo reaproveita o registro.
  select id into v_id from public.convites_acesso
   where membro_id = p_membro and estado in ('pendente', 'falhou', 'enviado') order by criado_em desc limit 1;
  if v_id is null then
    insert into public.convites_acesso (membro_id, email) values (p_membro, m.email) returning id into v_id;
  else
    update public.convites_acesso set email = m.email, estado = 'pendente' where id = v_id;
  end if;
  return jsonb_build_object('convite_id', v_id, 'email', m.email, 'nome', m.nome);
end
$$;

create function public.registrar_resultado_convite(p_convite uuid, p_ok boolean, p_erro text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()) ->> 'role', '') <> 'service_role' then
    raise exception 'Só o servidor registra o envio.' using errcode = '42501';
  end if;
  update public.convites_acesso
     set estado = case when p_ok then 'enviado' else 'falhou' end,
         tentativas = tentativas + 1,
         ultimo_erro = case when p_ok then null else left(p_erro, 300) end,
         enviado_em = case when p_ok then now() else enviado_em end
   where id = p_convite;
end
$$;

-- Quem aceitou o convite e entrou deixa de ter convite pendente.
create function privado.convite_aceito()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is not null and old.user_id is null then
    update public.convites_acesso set estado = 'aceito'
     where membro_id = new.id and estado in ('pendente', 'enviado', 'falhou');
  end if;
  return null;
end
$$;
create trigger y_convite after update on public.membros
  for each row execute function privado.convite_aceito();

-- -----------------------------------------------------------------------------
-- Acessos (registros do Auth)
-- -----------------------------------------------------------------------------
create function public.acessos_recentes(p_dias integer default 30)
returns table (em timestamptz, acao text, email text, ip text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.audita() then
    raise exception 'Só o administrador e a auditoria veem os acessos.' using errcode = '42501';
  end if;
  return query
  select a.created_at, a.payload ->> 'action', a.payload ->> 'actor_username', a.ip_address::text
    from auth.audit_log_entries a
   where a.created_at >= now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365))
     and coalesce(a.payload ->> 'action', '') not in ('token_refreshed', 'token_revoked')
   order by a.created_at desc
   limit 2000;
end
$$;

-- -----------------------------------------------------------------------------
-- Erros técnicos da tela
-- -----------------------------------------------------------------------------
create table public.erros_cliente (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  membro_id   uuid,
  rota        text,
  codigo      text,
  mensagem    text,
  versao      text,
  correlacao  text,
  navegador   text
);
create index erros_cliente_em on public.erros_cliente (em desc);

create function public.registrar_erro_cliente(p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu  uuid := privado.meu_membro_id();
  v_msg text;
begin
  if v_eu is null then
    return;
  end if;
  -- Limite por pessoa: um laço de erro não enche a tabela.
  if (select count(*) from public.erros_cliente where membro_id = v_eu and em > now() - interval '1 hour') >= 30 then
    return;
  end if;
  -- Nada de conteúdo pessoal: números longos (CPF, telefone, processo) e
  -- e-mails saem antes de gravar.
  v_msg := left(coalesce(p ->> 'mensagem', ''), 300);
  v_msg := regexp_replace(v_msg, '[^[:space:]@]+@[^[:space:]@]+', '[e-mail]', 'g');
  v_msg := regexp_replace(v_msg, '[0-9][0-9.\-/]{5,}[0-9]', '[número]', 'g');
  insert into public.erros_cliente (membro_id, rota, codigo, mensagem, versao, correlacao, navegador)
  values (v_eu, left(regexp_replace(coalesce(p ->> 'rota', ''), '[?].*$', ''), 120), left(p ->> 'codigo', 40), v_msg,
          left(p ->> 'versao', 40), left(p ->> 'correlacao', 40), left(p ->> 'navegador', 120));
end
$$;

-- -----------------------------------------------------------------------------
-- Solicitações do titular (LGPD, art. 18)
-- -----------------------------------------------------------------------------
create table public.solicitacoes_titular (
  id              uuid primary key default gen_random_uuid(),
  titular_nome    text not null check (btrim(titular_nome) <> ''),
  cliente_id      uuid references public.clientes (id),
  contato_id      uuid references public.contatos (id),
  canal           text not null default 'email' check (canal in ('email', 'whatsapp', 'telefone', 'presencial', 'carta', 'outro')),
  tipo            text not null check (tipo in ('confirmacao', 'acesso', 'correcao', 'anonimizacao', 'portabilidade',
                                                'eliminacao', 'informacao', 'revogacao', 'oposicao')),
  descricao       text,
  recebida_em     date not null default (now() at time zone 'America/Sao_Paulo')::date,
  -- Prazo de resposta: 15 dias para o acesso completo (art. 19, II).
  prazo           date not null default ((now() at time zone 'America/Sao_Paulo')::date + 15),
  responsavel_id  uuid references public.membros (id),
  situacao        text not null default 'aberta' check (situacao in ('aberta', 'em_analise', 'respondida', 'indeferida')),
  decisao         text,
  concluida_em    date,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz,
  alterado_por    uuid,
  constraint solicitacao_concluida check (situacao not in ('respondida', 'indeferida') or (decisao is not null and concluida_em is not null))
);
create index solicitacoes_titular_situacao on public.solicitacoes_titular (situacao, prazo);
select privado.aplicar_padrao('public.solicitacoes_titular');

-- -----------------------------------------------------------------------------
-- Cópias de segurança (a rotina registra cada execução com a chave do servidor)
-- -----------------------------------------------------------------------------
create table public.backups_execucoes (
  id             uuid primary key default gen_random_uuid(),
  iniciado_em    timestamptz not null,
  concluido_em   timestamptz,
  situacao       text not null check (situacao in ('ok', 'falhou')),
  tamanho_bytes  bigint,
  sha256         text,
  arquivos       integer,
  destino        text,
  detalhe        text,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  alterado_em    timestamptz,
  alterado_por   uuid
);
select privado.aplicar_padrao('public.backups_execucoes');

create function public.estado_operacional()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_backup public.backups_execucoes;
begin
  if not privado.audita() then
    raise exception 'Só o administrador e a auditoria veem a operação.' using errcode = '42501';
  end if;
  select * into v_backup from public.backups_execucoes where situacao = 'ok' order by concluido_em desc nulls last limit 1;
  return jsonb_build_object(
    'ultimo_backup_ok', v_backup.concluido_em,
    'horas_desde_backup', case when v_backup.concluido_em is not null
                               then round(extract(epoch from now() - v_backup.concluido_em) / 3600) end,
    'backups_falhos_7d', (select count(*) from public.backups_execucoes where situacao = 'falhou' and criado_em > now() - interval '7 days'),
    'erros_7d', (select count(*) from public.erros_cliente where em > now() - interval '7 days'),
    'convites_pendentes', (select count(*) from public.convites_acesso where estado in ('pendente', 'falhou')),
    'solicitacoes_abertas', (select count(*) from public.solicitacoes_titular where situacao in ('aberta', 'em_analise')),
    'solicitacoes_vencidas', (select count(*) from public.solicitacoes_titular
                               where situacao in ('aberta', 'em_analise') and prazo < privado.hoje()),
    'membros_ativos', (select count(*) from public.membros where ativo));
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.config_seguranca enable row level security;
alter table public.convites_acesso enable row level security;
alter table public.erros_cliente enable row level security;
alter table public.solicitacoes_titular enable row level security;
alter table public.backups_execucoes enable row level security;

create policy "config_seguranca: ver" on public.config_seguranca
  for select to authenticated using ((select privado.eh_membro()));
create policy "config_seguranca: alterar" on public.config_seguranca
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "convites_acesso: ver" on public.convites_acesso
  for select to authenticated using ((select privado.audita()));
create policy "erros_cliente: ver" on public.erros_cliente
  for select to authenticated using ((select privado.audita()));
create policy "backups_execucoes: ver" on public.backups_execucoes
  for select to authenticated using ((select privado.audita()));

create policy "solicitacoes_titular: ver" on public.solicitacoes_titular
  for select to authenticated using ((select privado.audita()));
create policy "solicitacoes_titular: incluir" on public.solicitacoes_titular
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "solicitacoes_titular: alterar" on public.solicitacoes_titular
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

revoke all on public.config_seguranca, public.convites_acesso, public.erros_cliente,
  public.solicitacoes_titular, public.backups_execucoes from anon, authenticated;
grant select on public.config_seguranca, public.convites_acesso, public.erros_cliente,
  public.solicitacoes_titular, public.backups_execucoes to authenticated;
grant update (inatividade_minutos) on public.config_seguranca to authenticated;
grant insert (titular_nome, cliente_id, contato_id, canal, tipo, descricao, recebida_em, prazo, responsavel_id),
      update (titular_nome, cliente_id, contato_id, canal, tipo, descricao, prazo, responsavel_id, situacao,
              decisao, concluida_em)
  on public.solicitacoes_titular to authenticated;
grant all on public.config_seguranca, public.convites_acesso, public.erros_cliente,
  public.solicitacoes_titular, public.backups_execucoes to service_role;

revoke execute on function public.solicitar_convite(uuid), public.registrar_resultado_convite(uuid, boolean, text),
  public.acessos_recentes(integer), public.registrar_erro_cliente(jsonb), public.estado_operacional()
  from public, anon, authenticated;
grant execute on function public.solicitar_convite(uuid), public.acessos_recentes(integer),
  public.registrar_erro_cliente(jsonb), public.estado_operacional() to authenticated;
grant execute on function public.registrar_resultado_convite(uuid, boolean, text) to service_role;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;

-- O histórico das tabelas novas segue a auditoria e o administrador.
create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if privado.audita() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    when p_tabela in ('clientes', 'processos', 'tarefas', 'feriados') then
      return true;
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'clientes_contatos') then
      return privado.edita_clientes();
    when p_tabela = 'documentos' then
      return privado.edita_clientes() or (privado.financeiro_le() and exists (
        select 1 from public.documentos d where d.id = p_registro and d.modelo = 'recibo'));
    when p_tabela in ('intimacoes', 'intimacoes_consultas', 'config_prazos') then
      return privado.gerencia_prazos();
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro', 'pagamentos_despesa',
                      'contas_financeiras', 'transferencias_financeiras', 'ajustes_financeiros',
                      'fornecedores', 'centros_custo', 'anexos', 'anexos_versoes',
                      'importacoes', 'exportacoes') then
      return privado.financeiro_le();
    when p_tabela in ('fechamentos', 'divisao_cotas', 'fechamentos_anuais', 'fechamentos_anuais_versoes') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela in ('publicacoes', 'campanhas', 'site_deploys') then
      return privado.edita_site();
    when p_tabela = 'compromissos' then
      return privado.acesso_agenda() <> 'nenhum' and exists (
        select 1 from public.compromissos c
        where c.id = p_registro
          and (c.membro_id = privado.meu_membro_id() or not c.particular));
    else
      return false;
  end case;
end
$$;
