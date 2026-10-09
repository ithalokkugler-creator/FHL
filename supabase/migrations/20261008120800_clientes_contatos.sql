-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 25 · Clientes: nome fantasia, etiquetas e vários contatos
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T14 (R21–R23).
--
--   · `clientes` continua o cadastro mínimo de Agenda e Financeiro (nome,
--     documento, telefone, e-mail). Nome fantasia e etiquetas entram nos
--     dados completos, com o acesso a Clientes.
--   · `clientes_contatos` é a lista de pessoas e canais de um cliente — não
--     confundir com `contatos`, que é quem chegou pelo site. Desativar mantém
--     o histórico; nada se apaga.
--   · Quem recebe a cobrança é escolhido no contato (`recebe_cobranca`), não
--     "o primeiro da lista". O Financeiro lê só esses contatos de cobrança —
--     o resto da lista pessoal fica com quem tem acesso a Clientes.
--   · O telefone e o e-mail de hoje viram o contato principal de cada
--     cliente, sem sair do cadastro mínimo.
--   · CPF/CNPJ continua único. A exceção administrativa do DOCX fica para
--     quando o escritório confirmar que precisa dela: um cliente com vários
--     contratos resolve o caso comum sem duplicar cadastro.

alter table public.clientes_detalhes
  add column nome_fantasia text,
  add column etiquetas text[] not null default '{}'
    check (cardinality(etiquetas) <= 20);

create index clientes_detalhes_etiquetas on public.clientes_detalhes using gin (etiquetas);

-- Etiqueta guardada aparada, em minúsculas, sem repetição.
create function privado.normalizar_etiquetas(p text[])
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct e order by e), '{}')
    from (select lower(btrim(x)) as e from unnest(coalesce(p, '{}')) x) t
   where e <> '' and char_length(e) <= 40
$$;

create function privado.preparar_detalhes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.etiquetas := privado.normalizar_etiquetas(new.etiquetas);
  new.nome_fantasia := nullif(btrim(new.nome_fantasia), '');
  -- Data futura alimentaria qualificação e aniversários. Só confere quando
  -- muda, para um cadastro antigo não travar a edição de outro campo.
  if new.nascimento > privado.hoje()
     and (tg_op = 'INSERT' or new.nascimento is distinct from old.nascimento) then
    raise exception 'A data de nascimento ou constituição não pode ser posterior a hoje.' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger c_preparar before insert or update on public.clientes_detalhes
  for each row execute function privado.preparar_detalhes();

create table public.clientes_contatos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes (id),
  tipo            text not null default 'outro'
                  check (tipo in ('proprio', 'responsavel', 'financeiro', 'familiar', 'recados', 'outro')),
  nome            text not null check (btrim(nome) <> ''),
  telefone        text check (telefone ~ '^[0-9]{10,13}$'),
  whatsapp        boolean not null default true,
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  principal       boolean not null default false,
  recebe_cobranca boolean not null default false,
  -- Como e quando a pessoa autorizou o canal (LGPD), quando for o caso.
  autorizacao     text,
  observacoes     text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz,
  alterado_por    uuid,
  constraint contato_tem_canal check (telefone is not null or email is not null),
  constraint contato_principal_ativo check (not principal or ativo)
);

create index clientes_contatos_cliente on public.clientes_contatos (cliente_id);
create unique index clientes_contatos_principal on public.clientes_contatos (cliente_id) where principal;
select privado.aplicar_padrao('public.clientes_contatos');

-- O telefone e o e-mail de hoje viram o contato principal.
insert into public.clientes_contatos (cliente_id, tipo, nome, telefone, email, principal, recebe_cobranca)
select c.id, 'proprio', c.nome, c.telefone,
       case when c.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then c.email end,
       true, true
  from public.clientes c
 where c.telefone is not null
    or c.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

-- Trocar o principal: desmarca o anterior na mesma transação.
create function public.definir_contato_principal(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não permite editar contatos de clientes.' using errcode = '42501';
  end if;
  select cliente_id into v_cliente from public.clientes_contatos where id = p_id and ativo;
  if not found then
    raise exception 'Contato não encontrado ou inativo.' using errcode = 'P0001';
  end if;
  update public.clientes_contatos set principal = false where cliente_id = v_cliente and principal and id <> p_id;
  update public.clientes_contatos set principal = true where id = p_id and not principal;
end
$$;

-- salvar_cliente aceita nome fantasia e etiquetas (lista) nos detalhes.
create or replace function public.salvar_cliente(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id    uuid;
  v_det   jsonb;
  v_campo text;
  v_etiq  text[];
begin
  if not privado.eh_membro() then
    raise exception 'Seu acesso não permite cadastrar clientes.' using errcode = '42501';
  end if;
  if p ? 'detalhes' and not privado.edita_clientes() then
    raise exception 'Seu acesso não permite editar o cadastro completo.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Cadastro inválido.' using errcode = '22023';
  end if;
  if p ? 'detalhes' and jsonb_typeof(p -> 'detalhes') is distinct from 'object' then
    raise exception 'Dados completos inválidos.' using errcode = '22023';
  end if;
  foreach v_campo in array array['id', 'nome', 'documento', 'telefone', 'email', 'observacoes'] loop
    if p ? v_campo and jsonb_typeof(p -> v_campo) not in ('string', 'null') then
      raise exception 'Campo de cadastro inválido: %.', v_campo using errcode = '22023';
    end if;
  end loop;

  v_id := nullif(btrim(p ->> 'id'), '')::uuid;
  if v_id is null then
    insert into public.clientes (nome, documento, telefone, email, observacoes)
    values (btrim(p ->> 'nome'),
            nullif(btrim(p ->> 'documento'), ''),
            nullif(btrim(p ->> 'telefone'), ''),
            nullif(lower(btrim(p ->> 'email')), ''),
            nullif(btrim(p ->> 'observacoes'), ''))
    returning id into v_id;
  else
    update public.clientes
       set nome = btrim(p ->> 'nome'),
           documento = nullif(btrim(p ->> 'documento'), ''),
           telefone = nullif(btrim(p ->> 'telefone'), ''),
           email = nullif(lower(btrim(p ->> 'email')), ''),
           observacoes = nullif(btrim(p ->> 'observacoes'), '')
     where id = v_id;
    if not found then
      raise exception 'Cliente não encontrado.' using errcode = 'P0001';
    end if;
  end if;

  if p ? 'detalhes' then
    v_det := p -> 'detalhes';
    if v_det ? 'etiquetas' and jsonb_typeof(v_det -> 'etiquetas') not in ('array', 'null') then
      raise exception 'Campo de cadastro inválido: etiquetas.' using errcode = '22023';
    end if;
    v_etiq := array(select jsonb_array_elements_text(coalesce(nullif(v_det -> 'etiquetas', 'null'::jsonb), '[]'::jsonb)));
    foreach v_campo in array array[
      'tipo_pessoa', 'flexao', 'rg', 'nascimento', 'nacionalidade', 'estado_civil', 'profissao', 'filiacao',
      'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
      'recado_nome', 'recado_relacao', 'recado_telefone', 'recado_observacao',
      'representante_nome', 'representante_documento', 'representante_relacao', 'representante_qualificacao',
      'banco', 'agencia', 'conta', 'pix', 'responsavel_id', 'nome_fantasia'
    ] loop
      if v_det ? v_campo and jsonb_typeof(v_det -> v_campo) not in ('string', 'null') then
        raise exception 'Campo de cadastro inválido: %.', v_campo using errcode = '22023';
      end if;
      v_det := jsonb_set(v_det, array[v_campo], coalesce(to_jsonb(nullif(btrim(v_det ->> v_campo), '')), 'null'::jsonb));
    end loop;

    insert into public.clientes_detalhes (
      cliente_id, tipo_pessoa, flexao, rg, nascimento, nacionalidade, estado_civil, profissao, filiacao,
      cep, logradouro, numero, complemento, bairro, cidade, uf,
      recado_nome, recado_relacao, recado_telefone, recado_observacao,
      representante_nome, representante_documento, representante_relacao, representante_qualificacao,
      banco, agencia, conta, pix, responsavel_id, nome_fantasia, etiquetas)
    values (
      v_id, coalesce(v_det ->> 'tipo_pessoa', 'fisica'), v_det ->> 'flexao', v_det ->> 'rg', (v_det ->> 'nascimento')::date,
      v_det ->> 'nacionalidade', v_det ->> 'estado_civil', v_det ->> 'profissao', v_det ->> 'filiacao',
      v_det ->> 'cep', v_det ->> 'logradouro', v_det ->> 'numero', v_det ->> 'complemento', v_det ->> 'bairro',
      v_det ->> 'cidade', v_det ->> 'uf',
      v_det ->> 'recado_nome', v_det ->> 'recado_relacao', v_det ->> 'recado_telefone', v_det ->> 'recado_observacao',
      v_det ->> 'representante_nome', v_det ->> 'representante_documento', v_det ->> 'representante_relacao',
      v_det ->> 'representante_qualificacao',
      v_det ->> 'banco', v_det ->> 'agencia', v_det ->> 'conta', v_det ->> 'pix', (v_det ->> 'responsavel_id')::uuid,
      v_det ->> 'nome_fantasia', v_etiq)
    on conflict (cliente_id) do update set
      tipo_pessoa = excluded.tipo_pessoa, flexao = excluded.flexao, rg = excluded.rg,
      nascimento = excluded.nascimento, nacionalidade = excluded.nacionalidade,
      estado_civil = excluded.estado_civil, profissao = excluded.profissao, filiacao = excluded.filiacao,
      cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero,
      complemento = excluded.complemento, bairro = excluded.bairro, cidade = excluded.cidade, uf = excluded.uf,
      recado_nome = excluded.recado_nome, recado_relacao = excluded.recado_relacao,
      recado_telefone = excluded.recado_telefone, recado_observacao = excluded.recado_observacao,
      representante_nome = excluded.representante_nome, representante_documento = excluded.representante_documento,
      representante_relacao = excluded.representante_relacao,
      representante_qualificacao = excluded.representante_qualificacao,
      banco = excluded.banco, agencia = excluded.agencia, conta = excluded.conta, pix = excluded.pix,
      responsavel_id = excluded.responsavel_id,
      nome_fantasia = case when v_det ? 'nome_fantasia' then excluded.nome_fantasia else public.clientes_detalhes.nome_fantasia end,
      etiquetas = case when v_det ? 'etiquetas' then excluded.etiquetas else public.clientes_detalhes.etiquetas end;
  end if;

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.clientes_contatos enable row level security;

create policy "clientes_contatos: ver" on public.clientes_contatos
  for select to authenticated
  using ((select privado.edita_clientes()) or (recebe_cobranca and ativo and (select privado.financeiro_le())));
create policy "clientes_contatos: incluir" on public.clientes_contatos
  for insert to authenticated with check ((select privado.edita_clientes()));
create policy "clientes_contatos: alterar" on public.clientes_contatos
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.clientes_contatos from anon, authenticated;
grant select on public.clientes_contatos to authenticated;
grant insert (cliente_id, tipo, nome, telefone, whatsapp, email, recebe_cobranca, autorizacao, observacoes),
      update (tipo, nome, telefone, whatsapp, email, recebe_cobranca, autorizacao, observacoes, ativo)
  on public.clientes_contatos to authenticated;
grant insert (nome_fantasia, etiquetas), update (nome_fantasia, etiquetas) on public.clientes_detalhes to authenticated;
grant all on public.clientes_contatos to service_role;

revoke execute on function public.definir_contato_principal(uuid) from public, anon;
grant execute on function public.definir_contato_principal(uuid) to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
