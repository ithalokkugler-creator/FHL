-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 09 · Clientes: cadastro completo separado do mínimo, e processos
-- =============================================================================
--
-- preparacao-novas-funcoes.md, F2.
--
--   · `clientes` continua o cadastro mínimo que Agenda e Financeiro usam
--     (nome, documento, telefone, e-mail). O resto — qualificação, endereço,
--     recados, representante, banco — fica em `clientes_detalhes`, que só
--     quem tem acesso a Clientes lê e grava.
--   · salvar_cliente grava as duas partes numa transação: ou entram as duas,
--     ou nenhuma.
--   · Processo: número CNJ com dígito verificador conferido também aqui;
--     caso consultivo ou extrajudicial fica sem número, com uma referência.
--     O mesmo número pode estar em clientes diferentes, nunca duas vezes no
--     mesmo cliente.

create table public.clientes_detalhes (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null unique references public.clientes (id),
  tipo_pessoa  text not null default 'fisica' check (tipo_pessoa in ('fisica', 'juridica')),
  -- Concordância dos documentos (o cliente / a cliente). Nula: forma com "(a)".
  -- Escolhida no cadastro; não se deduz do nome.
  flexao       text check (flexao in ('m', 'f')),
  rg           text check (char_length(rg) <= 30),
  nascimento   date,
  nacionalidade text,
  estado_civil text check (estado_civil in ('solteiro', 'casado', 'uniao_estavel', 'separado', 'divorciado', 'viuvo')),
  profissao    text,
  filiacao     text,
  cep          text check (cep ~ '^[0-9]{8}$'),
  logradouro   text,
  numero       text,
  complemento  text,
  bairro       text,
  cidade       text,
  uf           text check (uf ~ '^[A-Z]{2}$'),
  recado_nome       text,
  recado_relacao    text,
  recado_telefone   text check (recado_telefone ~ '^[0-9]{10,13}$'),
  recado_observacao text,
  representante_nome          text,
  representante_documento     text check (representante_documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  representante_relacao       text,
  representante_qualificacao  text,
  banco        text,
  agencia      text,
  conta        text,
  pix          text,
  responsavel_id uuid references public.membros (id),
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create index clientes_detalhes_responsavel on public.clientes_detalhes (responsavel_id);
select privado.aplicar_padrao('public.clientes_detalhes');

-- Resolução CNJ 65/2008: NNNNNNN-DD.AAAA.J.TR.OOOO, dígito por módulo 97.
create function privado.numero_cnj_valido(p text)
returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when p ~ '^[0-9]{20}$' then (substr(p, 1, 7) || substr(p, 10, 11) || substr(p, 8, 2))::numeric % 97 = 1
    else false
  end
$$;

create table public.processos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references public.clientes (id),
  numero       text check (numero is null or privado.numero_cnj_valido(numero)),
  referencia   text,
  titulo       text not null check (btrim(titulo) <> ''),
  area         text not null check (area in (
                 'trabalhista', 'previdenciario', 'consumidor', 'civel', 'familia', 'sucessoes', 'criminal',
                 'contratual', 'imobiliario', 'empresarial', 'administrativo', 'portuario', 'ambiental',
                 'regularizacao_fundiaria', 'outro')),
  tribunal     text,
  orgao        text,
  responsavel_id uuid references public.membros (id),
  situacao     text not null default 'em_andamento' check (situacao in (
                 'em_analise', 'aguardando_documentos', 'contrato_enviado', 'em_andamento', 'suspenso', 'encerrado')),
  observacoes  text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create unique index processos_cliente_numero on public.processos (cliente_id, numero) where numero is not null;
create index processos_numero on public.processos (numero) where numero is not null;
create index processos_responsavel on public.processos (responsavel_id);
select privado.aplicar_padrao('public.processos');

-- -----------------------------------------------------------------------------
-- salvar_cliente — único ponto para gravar o cadastro completo
--
-- Recebe { id?, nome, documento, telefone, email, observacoes, detalhes? }.
-- Sem id, cria; com id, regrava o mínimo inteiro (campo ausente vira nulo —
-- a tela manda sempre todos). Os detalhes só com acesso a Clientes. id,
-- cliente_id e carimbos vindos no payload são ignorados: o vínculo vem da
-- linha gravada aqui. A autorização é explícita porque a função roda com os
-- privilégios do dono — e nunca olha user_metadata.
-- -----------------------------------------------------------------------------
create function public.salvar_cliente(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id    uuid;
  v_det   jsonb;
  v_campo text;
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

  -- O cadastro mínimo.
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

  -- Os dados completos: texto aparado, vazio vira nulo.
  if p ? 'detalhes' then
    v_det := p -> 'detalhes';
    foreach v_campo in array array[
      'tipo_pessoa', 'flexao', 'rg', 'nascimento', 'nacionalidade', 'estado_civil', 'profissao', 'filiacao',
      'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
      'recado_nome', 'recado_relacao', 'recado_telefone', 'recado_observacao',
      'representante_nome', 'representante_documento', 'representante_relacao', 'representante_qualificacao',
      'banco', 'agencia', 'conta', 'pix', 'responsavel_id'
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
      banco, agencia, conta, pix, responsavel_id)
    values (
      v_id, coalesce(v_det ->> 'tipo_pessoa', 'fisica'), v_det ->> 'flexao', v_det ->> 'rg', (v_det ->> 'nascimento')::date,
      v_det ->> 'nacionalidade', v_det ->> 'estado_civil', v_det ->> 'profissao', v_det ->> 'filiacao',
      v_det ->> 'cep', v_det ->> 'logradouro', v_det ->> 'numero', v_det ->> 'complemento', v_det ->> 'bairro',
      v_det ->> 'cidade', v_det ->> 'uf',
      v_det ->> 'recado_nome', v_det ->> 'recado_relacao', v_det ->> 'recado_telefone', v_det ->> 'recado_observacao',
      v_det ->> 'representante_nome', v_det ->> 'representante_documento', v_det ->> 'representante_relacao',
      v_det ->> 'representante_qualificacao',
      v_det ->> 'banco', v_det ->> 'agencia', v_det ->> 'conta', v_det ->> 'pix', (v_det ->> 'responsavel_id')::uuid)
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
      responsavel_id = excluded.responsavel_id;
  end if;

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- Processos são lidos por todo membro ativo (Agenda e Financeiro citam o
-- processo); gravar exige acesso a Clientes.
-- -----------------------------------------------------------------------------
alter table public.clientes_detalhes enable row level security;
alter table public.processos enable row level security;

create policy "clientes_detalhes: ver" on public.clientes_detalhes
  for select to authenticated using ((select privado.edita_clientes()));
create policy "clientes_detalhes: incluir" on public.clientes_detalhes
  for insert to authenticated with check ((select privado.edita_clientes()));
create policy "clientes_detalhes: alterar" on public.clientes_detalhes
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

create policy "processos: ver" on public.processos
  for select to authenticated using ((select privado.eh_membro()));
create policy "processos: incluir" on public.processos
  for insert to authenticated with check ((select privado.edita_clientes()));
create policy "processos: alterar" on public.processos
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.clientes_detalhes, public.processos from anon, authenticated;
grant select on public.clientes_detalhes, public.processos to authenticated;
grant insert (cliente_id, tipo_pessoa, flexao, rg, nascimento, nacionalidade, estado_civil, profissao, filiacao,
              cep, logradouro, numero, complemento, bairro, cidade, uf,
              recado_nome, recado_relacao, recado_telefone, recado_observacao,
              representante_nome, representante_documento, representante_relacao, representante_qualificacao,
              banco, agencia, conta, pix, responsavel_id)
  on public.clientes_detalhes to authenticated;
grant update (tipo_pessoa, flexao, rg, nascimento, nacionalidade, estado_civil, profissao, filiacao,
              cep, logradouro, numero, complemento, bairro, cidade, uf,
              recado_nome, recado_relacao, recado_telefone, recado_observacao,
              representante_nome, representante_documento, representante_relacao, representante_qualificacao,
              banco, agencia, conta, pix, responsavel_id)
  on public.clientes_detalhes to authenticated;
grant insert (cliente_id, numero, referencia, titulo, area, tribunal, orgao, responsavel_id, situacao, observacoes),
  update (numero, referencia, titulo, area, tribunal, orgao, responsavel_id, situacao, observacoes)
  on public.processos to authenticated;
grant all on public.clientes_detalhes, public.processos to service_role;

revoke execute on function public.salvar_cliente(jsonb) from public, anon;
grant execute on function public.salvar_cliente(jsonb) to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.numero_cnj_valido(text) to authenticated;
