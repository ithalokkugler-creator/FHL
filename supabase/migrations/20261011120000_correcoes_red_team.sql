-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Correções do red team de 11/10/2026 (RELATORIO-RED-TEAM-1110.md)
-- =============================================================================
--
-- B-01 · O cadastro básico de clientes (CPF/CNPJ, telefone, e-mail,
--        observações) era legível pela API por qualquer membro ativo. Agora a
--        tabela fica com quem trabalha com clientes: Clientes, Financeiro (que
--        emite recibos e contratos), Prazos (intimações) e o administrador.
--        Quem só usa Agenda e Tarefas recebe nome — e telefone, se tem Agenda,
--        para o lembrete — por clientes_agenda(). v_tarefas busca o nome do
--        cliente por função, para a tarefa recebida continuar mostrando de quem é.
-- B-03 · Nascimento ou constituição antes de 1900 é recusado (só quando muda).
-- B-04 · Nome do cliente com no máximo 200 caracteres também no banco.
-- B-08 · Link de post de rede social sem espaços, aspas nem < >.
-- Campanha de acidente de trabalho: "podem garantir" → "podem dar direito a"
-- (Provimento 205/2021: não prometer resultado).

-- -----------------------------------------------------------------------------
-- B-01 · Quem lê o cadastro de clientes
-- -----------------------------------------------------------------------------
create function privado.le_clientes()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.eh_admin()
      or privado.acesso_clientes() <> 'nenhum'
      or privado.acesso_prazos() <> 'nenhum'
      or privado.financeiro_le()
$$;

drop policy "clientes: ver" on public.clientes;
create policy "clientes: ver" on public.clientes
  for select to authenticated using ((select privado.le_clientes()));

-- Nome do cliente para views que mostram o registro a quem não lê Clientes
-- (a tarefa delegada a um associado, por exemplo). A linha da view já passou
-- pela política da tabela dela; aqui sai só o nome.
create function privado.nome_cliente(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select nome from public.clientes where id = p_id
$$;

-- Lista mínima para escolher o cliente na Agenda e nas Tarefas.
create function public.clientes_agenda()
returns table (id uuid, nome text, telefone text, ativo boolean)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.nome,
         case when privado.acesso_agenda() <> 'nenhum' then c.telefone end,
         c.ativo
    from public.clientes c
   where privado.eh_membro()
   order by c.nome, c.id
$$;

-- Cadastro rápido de quem não lê Clientes (marcar um atendimento na Agenda
-- com cliente novo). INSERT … RETURNING pela API exigiria ler a linha.
create function public.cadastrar_cliente_rapido(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.clientes;
begin
  if not privado.eh_membro() then
    raise exception 'Seu acesso não permite cadastrar clientes.' using errcode = '42501';
  end if;
  insert into public.clientes (nome, documento, telefone, email, observacoes)
  values (btrim(p ->> 'nome'), nullif(btrim(p ->> 'documento'), ''), nullif(btrim(p ->> 'telefone'), ''),
          nullif(lower(btrim(p ->> 'email')), ''), nullif(btrim(p ->> 'observacoes'), ''))
  returning * into v;
  return jsonb_build_object('id', v.id, 'nome', v.nome,
    'telefone', case when privado.acesso_agenda() <> 'nenhum' then v.telefone end, 'ativo', v.ativo);
end
$$;

create or replace view public.v_tarefas with (security_invoker = true) as
select
  t.id, t.tipo, t.titulo, t.ato, t.descricao, t.cliente_id, privado.nome_cliente(t.cliente_id) as cliente_nome,
  t.processo_id, pr.numero as processo_numero, pr.titulo as processo_titulo, pr.tribunal, pr.area,
  t.responsavel_id, t.prioridade, t.situacao, t.entrega,
  t.fatal_em, t.contagem, t.base_em, t.quantidade, t.recesso, t.memoria_prazo,
  t.concluida_em, t.concluida_por, t.compromisso_id,
  t.cancelado_em, t.motivo_cancelamento, t.criado_em, t.criado_por, t.alterado_em, t.alterado_por,
  case
    when t.cancelado_em is not null then 'cancelada'
    when t.situacao = 'concluida' then 'concluida'
    when t.fatal_em < now() then 'vencida'
    when (t.fatal_em at time zone 'America/Sao_Paulo')::date = privado.hoje() then 'fatal_hoje'
    when t.entrega < privado.hoje() then 'atrasada'
    when t.entrega = privado.hoje() then 'entrega_hoje'
    else 'em_dia'
  end as alerta,
  t.motivo_reabertura,
  t.intimacao_id
from public.tarefas t
left join public.processos pr on pr.id = t.processo_id;

-- -----------------------------------------------------------------------------
-- B-04 · Nome com até 200 caracteres (a tela já limitava; a API, não)
-- -----------------------------------------------------------------------------
alter table public.clientes drop constraint clientes_nome_check;
alter table public.clientes add constraint clientes_nome_check
  check (btrim(nome) <> '' and char_length(nome) <= 200);

-- -----------------------------------------------------------------------------
-- B-03 · Data de nascimento ou constituição plausível
-- -----------------------------------------------------------------------------
create or replace function privado.preparar_detalhes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.etiquetas := privado.normalizar_etiquetas(new.etiquetas);
  new.nome_fantasia := nullif(btrim(new.nome_fantasia), '');
  -- Data futura alimentaria qualificação e aniversários; antes de 1900 é
  -- erro de digitação. Só confere quando muda, para um cadastro antigo não
  -- travar a edição de outro campo.
  if tg_op = 'INSERT' or new.nascimento is distinct from old.nascimento then
    if new.nascimento > privado.hoje() then
      raise exception 'A data de nascimento ou constituição não pode ser posterior a hoje.' using errcode = '22023';
    end if;
    if new.nascimento < date '1900-01-01' then
      raise exception 'Confira a data de nascimento ou constituição: anterior a 1900.' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- B-08 · Link do post de rede social
-- -----------------------------------------------------------------------------
-- O site escapa o link ao gerar a página; isto recusa a sujeira na entrada,
-- com a mesma regra do editor (telas/site/publicacao.js).
create function privado.validar_links_corpo()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_bloco jsonb;
begin
  for v_bloco in select jsonb_array_elements(coalesce(new.corpo, '[]'::jsonb)) loop
    if v_bloco ->> 0 in ('instagram', 'facebook', 'linkedin')
       and (v_bloco -> 1 ->> 'url') !~* '^https://[^[:space:]"''<>]+$' then
      raise exception 'O link do post não pode ter espaços, aspas nem os sinais < e >.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end
$$;

create trigger c_validar_links before insert or update of corpo on public.publicacoes
  for each row execute function privado.validar_links_corpo();

-- -----------------------------------------------------------------------------
-- Campanha: sem promessa de resultado
-- -----------------------------------------------------------------------------
update public.campanhas
   set subtitulo = replace(subtitulo, 'podem garantir estabilidade', 'podem dar direito a estabilidade')
 where subtitulo like '%podem garantir estabilidade%';

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
revoke execute on function public.clientes_agenda(), public.cadastrar_cliente_rapido(jsonb) from public, anon;
grant execute on function public.clientes_agenda(), public.cadastrar_cliente_rapido(jsonb) to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.le_clientes(), privado.nome_cliente(uuid) to authenticated;
