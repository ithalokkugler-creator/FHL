-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 07 · Base dos módulos novos: acesso a Clientes e a Prazos
-- =============================================================================
--
-- preparacao-novas-funcoes.md, seção 4. Dois níveis por membro, no molde de
-- acesso_site: para o administrador vale sempre o máximo.

alter table public.membros
  add column acesso_clientes text not null default 'nenhum'
    check (acesso_clientes in ('nenhum', 'editar')),
  add column acesso_prazos text not null default 'nenhum'
    check (acesso_prazos in ('nenhum', 'editar'));

comment on column public.membros.acesso_clientes is
  'nenhum · editar: cadastro completo, processos, contatos do site, atualizações e documentos';
comment on column public.membros.acesso_prazos is
  'nenhum · editar: intimações do DJEN, feriados e prazo processual';

-- Os sócios de hoje usam tudo. A restrição da reunião [19:00] é para advogado
-- associado e secretária, que ainda não existem.
update public.membros
   set acesso_clientes = 'editar', acesso_prazos = 'editar'
 where papel in ('admin', 'socio');

create function privado.acesso_clientes()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'editar' else m.acesso_clientes end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

create function privado.acesso_prazos()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'editar' else m.acesso_prazos end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

create function privado.edita_clientes()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.acesso_clientes() = 'editar'
$$;

create function privado.gerencia_prazos()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.acesso_prazos() = 'editar'
$$;

create or replace function public.iniciar_sessao()
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
    'acesso_financeiro', case when v_membro.papel = 'admin' then 'completo' else v_membro.acesso_financeiro end,
    'acesso_site',       case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_site end,
    'acesso_clientes', case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_clientes end,
    'acesso_prazos', case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_prazos end
  );
end
$$;

-- Histórico: a versão inteira, já com os ramos de TODAS as tabelas deste
-- documento. plpgsql só resolve nomes ao executar — tabela que ainda não
-- existe não atrapalha, e as próximas migrações não precisam mexer aqui.
create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
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
    when p_tabela in ('clientes', 'processos', 'tarefas', 'feriados') then
      return true;
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'documentos') then
      return privado.edita_clientes();
    when p_tabela in ('intimacoes', 'intimacoes_consultas') then
      return privado.gerencia_prazos();
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro') then
      return privado.acesso_financeiro() in ('lancamentos', 'completo');
    when p_tabela in ('fechamentos', 'divisao_cotas') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela in ('publicacoes', 'campanhas', 'site_deploys') then
      return privado.edita_site();
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

grant insert (acesso_clientes, acesso_prazos), update (acesso_clientes, acesso_prazos)
  on public.membros to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function
  privado.acesso_clientes(), privado.acesso_prazos(),
  privado.edita_clientes(), privado.gerencia_prazos()
  to authenticated;
