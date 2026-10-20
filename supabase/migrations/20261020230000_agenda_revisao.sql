-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 37 · Revisão da agenda (caça a bugs de 20/10, segunda rodada)
-- =============================================================================
--
-- Achados dos testadores, conferidos e corrigidos:
--
--   · O histórico de um compromisso PARTICULAR aparecia inteiro (título,
--     observações, local) para quem audita e para o administrador. Agora é só
--     do dono, como a própria agenda — o comentário de 08/10 já dizia isso,
--     mas o atalho de quem audita vinha antes.
--   · remarcado_para aceitava qualquer compromisso (até o particular de outra
--     pessoa), num PATCH direto. Agora só um compromisso do mesmo responsável.
--   · "remarcado" podia ser gravado sem o novo horário (PATCH direto na
--     situação). Agora só por remarcar_compromisso(), que cria o novo.
--   · google_agenda_estados() devolvia a situação de sincronização de
--     particular alheio. Agora não devolve nada sobre ele.

-- -----------------------------------------------------------------------------
-- Histórico: particular só do dono
-- -----------------------------------------------------------------------------

create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Compromisso particular: o histórico é só do dono — nem quem audita lê
  -- (antes, o atalho de quem audita vinha primeiro e passava por cima).
  if p_tabela = 'compromissos' and exists (
    select 1 from public.compromissos c
     where c.id = p_registro and c.particular
       and c.membro_id is distinct from privado.meu_membro_id()) then
    return false;
  end if;
  if privado.audita() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    -- Cadastro de cliente (CPF, e-mail, telefone) só para quem lê Clientes,
    -- como a própria tabela (red team de 11/10). Processos, tarefas e
    -- feriados seguem visíveis a todo membro, como as tabelas.
    when p_tabela = 'clientes' then
      return privado.le_clientes();
    when p_tabela in ('processos', 'tarefas', 'feriados') then
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
                      'importacoes', 'exportacoes', 'repasses_cliente') then
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

-- -----------------------------------------------------------------------------
-- Remarcado: só com o novo horário, e do mesmo responsável
-- -----------------------------------------------------------------------------

create or replace function privado.limpar_remarcado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.situacao <> 'remarcado' then
    new.remarcado_para := null;
    return new;
  end if;
  -- Virar "remarcado" exige o novo horário (remarcar_compromisso faz os dois).
  if (tg_op = 'INSERT' or old.situacao <> 'remarcado') and new.remarcado_para is null then
    raise exception 'Para remarcar, use "Remarcar": ele pede o novo dia e horário.' using errcode = 'P0001';
  end if;
  if new.remarcado_para is not null
     and (tg_op = 'INSERT' or new.remarcado_para is distinct from old.remarcado_para)
     and not exists (
       select 1 from public.compromissos x
        where x.id = new.remarcado_para and x.id <> new.id and x.membro_id = new.membro_id) then
    raise exception 'O novo horário precisa ser um compromisso do mesmo responsável.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Situação no Google: nada sobre particular de outra pessoa
-- -----------------------------------------------------------------------------

create or replace function public.google_agenda_estados(p_ids uuid[])
returns table (compromisso_id uuid, origem text, situacao text, erro text,
               sincronizado_em timestamptz, no_google boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if privado.acesso_agenda() = 'nenhum' then
    raise exception 'Sem acesso à agenda.' using errcode = '42501';
  end if;
  return query
  select g.compromisso_id, g.origem, g.situacao, g.erro, g.sincronizado_em, g.evento_id is not null
    from privado.google_eventos g
    join public.compromissos c on c.id = g.compromisso_id
   where g.compromisso_id = any (coalesce(p_ids, '{}'))
     and (not c.particular or c.membro_id = privado.meu_membro_id());
end
$$;

revoke execute on function public.google_agenda_estados(uuid[]) from public, anon;
grant execute on function public.google_agenda_estados(uuid[]) to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
