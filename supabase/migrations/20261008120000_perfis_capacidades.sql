-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 17 · Perfis Consulta e Auditoria
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T04. O DOCX pede quatro
-- perfis: Administrador, Financeiro, Consulta e Auditoria.
--
--   · `papel` continua sendo o papel profissional (sócio, secretária…). O
--     perfil de acesso vem dos níveis por módulo, como já era.
--   · Financeiro ganha o nível 'consulta': lê tudo do módulo e não grava nada.
--     Quem já tinha acesso continua com o mesmo nível — nada é ampliado.
--   · Auditoria é um acesso à parte (`acesso_auditoria = 'ver'`): lê o
--     histórico de todos os módulos, sem poder alterar registro nenhum.
--   · Segundo fator (2FA): fora do escopo por decisão do Ithalo (08/10/2026).

-- -----------------------------------------------------------------------------
-- Níveis
-- -----------------------------------------------------------------------------
alter table public.membros drop constraint membros_acesso_financeiro_check;
alter table public.membros add constraint membros_acesso_financeiro_check
  check (acesso_financeiro in ('nenhum', 'consulta', 'lancamentos', 'completo'));

alter table public.membros
  add column acesso_auditoria text not null default 'nenhum'
    check (acesso_auditoria in ('nenhum', 'ver'));

comment on column public.membros.acesso_financeiro is
  'nenhum · consulta: só lê · lancamentos: lança, sem ver fechamento nem divisão · completo';
comment on column public.membros.acesso_auditoria is
  'nenhum · ver: lê o histórico de todos os módulos, sem alterar nada';

-- Lê o Financeiro: consulta, lançamentos ou completo.
create function privado.financeiro_le()
returns boolean
language sql stable set search_path = ''
as $$
  select privado.acesso_financeiro() in ('consulta', 'lancamentos', 'completo')
$$;

-- Concede desconto, abatimento ou acréscimo numa parcela: só o completo.
create function privado.financeiro_ajusta()
returns boolean
language sql stable set search_path = ''
as $$
  select privado.acesso_financeiro() = 'completo'
$$;

-- Consulta lê também o fechamento e a divisão, sem ganhar escrita.
create function privado.financeiro_fechamento_le()
returns boolean
language sql stable set search_path = ''
as $$
  select privado.acesso_financeiro() in ('consulta', 'completo')
$$;

alter policy "fechamentos: ver" on public.fechamentos
  using ((select privado.financeiro_fechamento_le()));
alter policy "divisao_cotas: ver" on public.divisao_cotas
  using ((select privado.financeiro_fechamento_le()));

create function privado.audita()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
      and (m.papel = 'admin' or m.acesso_auditoria = 'ver'))
$$;

-- -----------------------------------------------------------------------------
-- Leitura do Financeiro passa a aceitar 'consulta'. Gravar continua exigindo
-- lançamentos (financeiro_lanca), e fechamento/divisão, o completo.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['contratos', 'renegociacoes', 'parcelas', 'recebimentos',
                           'contas_recorrentes', 'contas', 'cobrancas',
                           'config_financeiro', 'categorias', 'formas_pagamento'] loop
    execute format('drop policy "%s: ver" on public.%I', t, t);
    execute format(
      'create policy "%s: ver" on public.%I for select to authenticated
         using ((select privado.financeiro_le()))', t, t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Sessão: o que a tela recebe ao entrar
-- -----------------------------------------------------------------------------
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
    'acesso_clientes',   case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_clientes end,
    'acesso_prazos',     case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_prazos end,
    'acesso_auditoria',  case when v_membro.papel = 'admin' then 'ver' else v_membro.acesso_auditoria end
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Histórico: a versão inteira, com as tabelas desta entrega (plpgsql resolve
-- nomes ao executar). Auditoria lê tudo; os demais, o do próprio módulo.
-- -----------------------------------------------------------------------------
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
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'documentos', 'clientes_contatos') then
      return privado.edita_clientes();
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
      return privado.financeiro_fechamento_le();
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

grant insert (acesso_auditoria), update (acesso_auditoria) on public.membros to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function
  privado.financeiro_le(), privado.financeiro_ajusta(), privado.financeiro_fechamento_le(), privado.audita()
  to authenticated;
