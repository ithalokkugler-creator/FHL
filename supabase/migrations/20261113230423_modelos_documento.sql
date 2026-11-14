-- 47 · Catálogo versionado e emissão de documentos pelo catálogo.
alter table public.membros add column edita_modelos_documento boolean not null default false;
grant update (edita_modelos_documento), insert (edita_modelos_documento) on public.membros to authenticated;

create function privado.edita_modelos_documento()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.edita_clientes(), false) and exists (
    select 1 from public.membros m where m.id = privado.meu_membro_id()
      and (m.papel = 'admin' or m.edita_modelos_documento)
  )
$$;

create table public.modelos_documento (
  id uuid primary key default gen_random_uuid(),
  chave_oficial text unique check (chave_oficial ~ '^[a-z_]{1,60}$'),
  tipo text not null default 'personalizado' check (tipo in (
    'personalizado', 'procuracao', 'contrato_honorarios', 'hipossuficiencia',
    'declaracao_endereco', 'declaracao_comparecimento', 'ficha_atendimento', 'renuncia'
  )),
  versao_atual_id uuid,
  arquivado_em timestamptz,
  arquivado_por uuid,
  motivo_arquivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid default privado.meu_membro_id(),
  alterado_em timestamptz,
  alterado_por uuid
);

create table public.modelos_documento_versoes (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.modelos_documento(id),
  numero integer not null check (numero > 0),
  revisao integer not null default 1 check (revisao > 0),
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 160),
  categoria text not null check (categoria in ('Contrato', 'Declaração', 'Mandato', 'Termo', 'Atendimento', 'Petição', 'Outros')),
  definicao jsonb not null check (jsonb_typeof(definicao) = 'object' and octet_length(definicao::text) <= 204800),
  origem_id uuid references public.modelos_documento_versoes(id),
  fonte text check (char_length(fonte) <= 250),
  publicado_em timestamptz,
  publicado_por uuid,
  criado_em timestamptz not null default now(),
  criado_por uuid default privado.meu_membro_id(),
  alterado_em timestamptz,
  alterado_por uuid,
  unique (modelo_id, numero),
  unique (modelo_id, id)
);

create unique index modelos_documento_um_rascunho
  on public.modelos_documento_versoes(modelo_id) where publicado_em is null;
alter table public.modelos_documento add constraint modelo_versao_do_mesmo
  foreign key (id, versao_atual_id) references public.modelos_documento_versoes (modelo_id, id);

select privado.aplicar_padrao('public.modelos_documento');
create trigger a_carimbar before insert or update on public.modelos_documento_versoes
  for each row execute function privado.carimbar();
create trigger sem_exclusao before delete on public.modelos_documento_versoes
  for each row execute function privado.bloquear_exclusao();

create function privado.versao_documento_imutavel()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.publicado_em is not null then
    raise exception 'Uma versão publicada não pode ser alterada.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger b_versao_imutavel before update on public.modelos_documento_versoes
  for each row execute function privado.versao_documento_imutavel();

alter table public.modelos_documento enable row level security;
alter table public.modelos_documento_versoes enable row level security;
revoke all on public.modelos_documento, public.modelos_documento_versoes from public, anon, authenticated;
grant select on public.modelos_documento, public.modelos_documento_versoes to authenticated;

create policy "modelos: ler" on public.modelos_documento for select to authenticated
  using ((select privado.edita_clientes()) and (
    (select privado.edita_modelos_documento()) or (arquivado_em is null and versao_atual_id is not null)
  ));

create policy "versoes de modelos: ler" on public.modelos_documento_versoes for select to authenticated
  using ((select privado.edita_clientes()) and (
    (select privado.edita_modelos_documento()) or (
      publicado_em is not null and exists (
        select 1 from public.modelos_documento m where m.id = modelo_id
          and m.versao_atual_id = modelos_documento_versoes.id and m.arquivado_em is null
      )
    )
  ));

-- Mantém as chaves reservadas para os tipos que têm fluxos próprios.
alter table public.documentos add column modelo_catalogo_id uuid, add column modelo_versao_id uuid;
alter table public.documentos add constraint documento_modelo_versao_fk
  foreign key (modelo_catalogo_id, modelo_versao_id)
  references public.modelos_documento_versoes (modelo_id, id) match full;
create index documentos_modelo_versao on public.documentos (modelo_catalogo_id, modelo_versao_id);
alter table public.documentos drop constraint documentos_modelo_check;
alter table public.documentos add constraint documentos_modelo_check check (modelo in (
  'procuracao', 'contrato_honorarios', 'hipossuficiencia', 'declaracao_endereco',
  'declaracao_comparecimento', 'ficha_atendimento', 'renuncia', 'prestacao_contas',
  'relatorio_atividades', 'recibo', 'personalizado'));
alter table public.documentos add constraint documento_personalizado_tem_versao
  check (modelo <> 'personalizado' or modelo_versao_id is not null);

-- Validação conservadora do formato armazenado. O aplicativo descobre os
-- campos disponíveis por família e valida seus complementos antes de emitir.
create function privado.validar_no_modelo_documento(p jsonb, profundidade int)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  n jsonb;
  tag text := p->>'tag';
  tipo text := p->>'tipo';
begin
  if profundidade > 12 or jsonb_typeof(p) is distinct from 'object' then return false; end if;
  if tipo = 'texto' then
    return jsonb_typeof(p->'valor') = 'string' and (p - '{tipo,valor}'::text[]) = '{}'::jsonb;
  elsif tipo = 'campo' then
    return coalesce((p->>'chave') ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$', false)
      and (p - '{tipo,chave}'::text[]) = '{}'::jsonb;
  elsif tipo is distinct from 'elemento' or tag is null or tag not in (
    'p','div','span','h2','h3','strong','em','u','s','sup','br','ul','ol','li','table','thead','tbody','tr','th','td','hr','img'
  ) then return false;
  end if;
  if (p - '{tipo,tag,itens,classe,colspan,rowspan,modelo_condicao,modelo_exemplo}'::text[]) <> '{}'::jsonb
     or jsonb_typeof(p->'itens') is distinct from 'array' then return false;
  end if;
  if tag = 'img' and (p->>'classe' is distinct from 'doc-qr-notificacao' or p->'itens' <> '[]'::jsonb) then return false; end if;
  if p ? 'modelo_condicao' and not coalesce((p->>'modelo_condicao') ~ '^(m_[a-z][a-z0-9_]{0,47}|garantia|area|audiencia_remota|contrato_acordo):[^:\r\n]{1,100}$', false) then return false; end if;
  if p ? 'modelo_exemplo' and not coalesce((p->>'modelo_exemplo') ~ '^manual\.[a-z][a-z0-9_]{0,47}$', false) then return false; end if;
  if p ? 'classe' and not coalesce((p->>'classe') ~ '^doc-[a-z0-9-]+( doc-[a-z0-9-]+)*$', false) then return false; end if;
  if p ? 'colspan' and not coalesce(tag in ('td','th') and (p->>'colspan') ~ '^[1-9][0-9]?$', false) then return false; end if;
  if p ? 'rowspan' and not coalesce(tag in ('td','th') and (p->>'rowspan') ~ '^[1-9][0-9]?$', false) then return false; end if;
  for n in select value from jsonb_array_elements(p->'itens') loop
    if not coalesce(privado.validar_no_modelo_documento(n, profundidade + 1), false) then return false; end if;
  end loop;
  return true;
end
$$;

create function privado.validar_definicao_modelo_documento(p jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare
  n jsonb;
  chave text;
  chaves text[] := '{}';
begin
  if jsonb_typeof(p) is distinct from 'object'
     or (p - '{formato,corpo,perguntas,assinaturas,folha_origem}'::text[]) <> '{}'::jsonb
     or (p ? 'folha_origem' and jsonb_typeof(p->'folha_origem') <> 'boolean')
     or p->'formato' is distinct from '1'::jsonb
     or octet_length(p::text) > 204800
     or jsonb_typeof(p->'corpo') is distinct from 'array'
     or jsonb_typeof(p->'perguntas') is distinct from 'array'
     or jsonb_typeof(p->'assinaturas') is distinct from 'array' then
    raise exception 'Formato de modelo inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(p->'corpo') > 300 or jsonb_array_length(p->'perguntas') > 80
     or jsonb_array_length(p->'assinaturas') > 10 then
    raise exception 'O modelo excede o limite de conteúdo.' using errcode = '22023';
  end if;
  for n in select value from jsonb_array_elements(p->'corpo') loop
    if not coalesce(privado.validar_no_modelo_documento(n, 1), false) then
      raise exception 'O modelo contém um bloco inválido.' using errcode = '22023';
    end if;
  end loop;
  for n in select value from jsonb_array_elements(p->'assinaturas') loop
    if jsonb_typeof(n) is distinct from 'object' or (n - '{papel,nome}'::text[]) <> '{}'::jsonb
       or not coalesce(char_length(btrim(n->>'papel')) between 1 and 90, false)
       or (n ? 'nome' and not coalesce((n->>'nome') ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$', false)) then
      raise exception 'Assinatura de modelo inválida.' using errcode = '22023';
    end if;
  end loop;
  for n in select value from jsonb_array_elements(p->'perguntas') loop
    chave := n->>'chave';
    if jsonb_typeof(n) is distinct from 'object' or (n - '{chave,rotulo,tipo,obrigatorio,opcoes}'::text[]) <> '{}'::jsonb
       or not coalesce(chave ~ '^manual\.[a-z][a-z0-9_]{0,47}$', false)
       or chave = any(chaves)
       or not coalesce(char_length(btrim(n->>'rotulo')) between 1 and 120, false)
       or jsonb_typeof(n->'obrigatorio') is distinct from 'boolean'
       or not coalesce((n->>'tipo') in ('texto','texto_longo','data','valor','inteiro','escolha'), false) then
      raise exception 'Pergunta de modelo inválida.' using errcode = '22023';
    end if;
    if n->>'tipo' = 'escolha' then
      if jsonb_typeof(n->'opcoes') is distinct from 'array' then
        raise exception 'Informe as opções da pergunta.' using errcode = '22023';
      end if;
      if jsonb_array_length(n->'opcoes') not between 2 and 20 or exists (
        select 1 from jsonb_array_elements(n->'opcoes') x
         where jsonb_typeof(x) <> 'string' or char_length(btrim(x#>>'{}')) not between 1 and 100
      ) or (select count(distinct x#>>'{}') from jsonb_array_elements(n->'opcoes') x) <> jsonb_array_length(n->'opcoes') then
        raise exception 'As opções devem ser distintas e ter de 1 a 100 caracteres.' using errcode = '22023';
      end if;
    elsif n ? 'opcoes' then
      raise exception 'O tipo da pergunta não aceita opções.' using errcode = '22023';
    end if;
    chaves := array_append(chaves, chave);
  end loop;
end
$$;

-- A lista corresponde às famílias e aos campos de modelos-oficiais.js.
create function privado.validar_campos_modelo_documento(p jsonb, p_familia text)
returns void language plpgsql immutable set search_path = ''
as $$
declare
  oficiais text[] := case p_familia
    when 'carta_preposicao' then array['autos','cliente_cnpj','representante','representante_assinatura','preposto']
    when 'contrato_honorarios' then array['objeto_docx','pagamento_docx','pagamento_acordo_docx']
    when 'declaracao_anuencia_usucapiao' then array['confrontante','confrontante_nome']
    when 'declaracao_comparecimento' then array['comparecimento']
    when 'declaracao_desistencia' then array['autos']
    when 'declaracao_endereco' then array['endereco_declarante','endereco_declarante_nome','endereco_declarado','endereco_docx']
    when 'declaracao_renuncia_credito_excedente' then array['teto','juizado_docx']
    when 'ficha_atendimento' then array['relato','bancarios']
    when 'intimacao_testemunha' then array['autos','testemunha','audiencia_data','audiencia_hora','audiencia_tipo',
      'audiencia_modalidade','audiencia_local','modalidade_docx','juizo_audiencia_docx','ramo_docx']
    when 'pauta_audiencia' then array['autos','audiencia_data','audiencia_hora','audiencia_tipo','audiencia_modalidade','audiencia_data_extenso']
    when 'notificacao' then array['notificado']
    when 'outorga_conjugal' then array['conjuge']
    when 'renuncia' then array['autos']
    when 'revogacao_mandato' then array['autos']
    when 'substabelecimento' then array['autos']
    when 'termo_rescisao_trabalho' then array['outra_parte','outra_parte_nome','papel_rescisao_oposto','admissao',
      'salario','rescisao_quadro']
    when 'termo_responsabilidade_chave_processo' then array['autos']
    else array[]::text[]
  end;
begin
  perform privado.validar_definicao_modelo_documento(p);
  if exists (
    with recursive nos(no) as (
      select value from jsonb_array_elements(p->'corpo')
      union all
      select filho.value from nos, lateral jsonb_array_elements(coalesce(no->'itens','[]'::jsonb)) filho
    ), chaves(chave) as (
      select no->>'chave' from nos where no->>'tipo' = 'campo'
      union select value->>'nome' from jsonb_array_elements(p->'assinaturas') where value ? 'nome'
      union select no->>'modelo_exemplo' from nos where no ? 'modelo_exemplo'
      union select 'manual.' || split_part(substring(no->>'modelo_condicao' from 3), ':', 1) from nos
        where left(no->>'modelo_condicao', 2) = 'm_'
    )
    select 1 from chaves c where c.chave not in (
      'cliente.nome','cliente.cpf','cliente.cnpj','cliente.documento','cliente.rg','cliente.nascimento',
      'cliente.nacionalidade','cliente.estado_civil','cliente.profissao','cliente.filiacao','cliente.filiacao_mae','cliente.filiacao_pai','cliente.endereco',
      'cliente.email','cliente.telefone','cliente.qualificacao','cliente.qualificacao_contato','cliente.qualificacao_curta',
      'cliente.inscrito','cliente.domiciliado','cliente.orientado',
      'representante.nome','representante.documento','representante.qualificacao',
      'processo.numero','processo.autos','processo.referencia','processo.orgao','processo.tribunal','processo.area','processo.posicao',
      'advogado.nome','advogado.oab','advogado.oab_numero','advogado.equipe','emissao.data','emissao.data_curta'
    ) and not (coalesce(p_familia, '') in ('homologacao_divorcio_consensual','contestacao','embargos_declaracao',
      'peticao_inicial','peticao_aceite_dativo','peticao_especificacao_provas','peticao_habilitacao',
      'peticao_quesitos_pericia_medica','peticao_intermediaria') and c.chave = 'oficial.juizo_docx')
      and not exists (select 1 from unnest(oficiais) campo where c.chave = 'oficial.' || campo)
      and not exists (select 1 from jsonb_array_elements(p->'perguntas') q where q->>'chave' = c.chave)
  ) then
    raise exception 'O modelo usa um campo que não está disponível.' using errcode = '22023';
  end if;
end
$$;

create function privado.modelo_documento_acao(p_acao text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  m public.modelos_documento%rowtype;
  v public.modelos_documento_versoes%rowtype;
  v_id uuid := (p->>'id')::uuid;
  v_origem uuid := (p->>'origem_id')::uuid;
  v_numero integer;
  v_motivo text := btrim(p->>'motivo');
begin
  if not privado.edita_modelos_documento() then
    raise exception 'Seu acesso não permite editar modelos.' using errcode = '42501';
  end if;
  if p_acao in ('publicar','arquivar','reativar','restaurar') and not privado.eh_admin() then
    raise exception 'Somente a administração pode publicar e administrar versões.' using errcode = '42501';
  end if;

  if p_acao = 'criar' then
    insert into public.modelos_documento (id) values (v_id) on conflict (id) do nothing;
  end if;
  select * into m from public.modelos_documento where id = v_id for update;
  if not found then raise exception 'Modelo não encontrado.' using errcode = 'P0001'; end if;
  if p_acao = 'criar' and (m.chave_oficial is not null or m.criado_por is distinct from privado.meu_membro_id()) then
    raise exception 'Já existe um modelo com esse identificador.' using errcode = '42501';
  end if;
  if p_acao = 'criar' then
    select * into v from public.modelos_documento_versoes where modelo_id = m.id and numero = 1;
    if found then return jsonb_build_object('id', m.id, 'versao_id', v.id); end if;
  end if;
  if p_acao in ('arquivar','reativar') then
    if p_acao = 'arquivar' and (v_motivo is null or char_length(v_motivo) not between 1 and 300) then
      raise exception 'Informe o motivo do arquivamento.' using errcode = '22023';
    end if;
    update public.modelos_documento set
      arquivado_em = case when p_acao = 'arquivar' then now() end,
      arquivado_por = case when p_acao = 'arquivar' then privado.meu_membro_id() end,
      motivo_arquivo = case when p_acao = 'arquivar' then v_motivo end
      where id = m.id and ((arquivado_em is null) = (p_acao = 'arquivar'));
    return jsonb_build_object('id', m.id);
  end if;
  if m.arquivado_em is not null then
    raise exception 'Reative o modelo antes de alterá-lo.' using errcode = 'P0001';
  end if;

  if p_acao = 'publicar' then
    select * into v from public.modelos_documento_versoes
      where modelo_id = m.id and id = (p->>'versao_id')::uuid;
    if not found or v.revisao is distinct from (p->>'revisao')::int then
      raise exception 'O rascunho mudou. Recarregue antes de publicar.' using errcode = '40001';
    end if;
    if v.publicado_em is not null then
      if v.id = m.versao_atual_id then return jsonb_build_object('id', m.id, 'versao_id', v.id); end if;
      raise exception 'Essa versão já foi substituída.' using errcode = '40001';
    end if;
    perform privado.validar_campos_modelo_documento(v.definicao, m.chave_oficial);
    if not exists (
      with recursive nos(no) as (
        select value from jsonb_array_elements(v.definicao->'corpo')
        union all
        select filho.value from nos, lateral jsonb_array_elements(coalesce(no->'itens','[]'::jsonb)) filho
      )
      select 1 from nos where no->>'tipo' = 'campo' or
        (no->>'tipo' = 'texto' and nullif(btrim(no->>'valor'), '') is not null)
    ) then
      raise exception 'Escreva o texto do modelo antes de publicar.' using errcode = '22023';
    end if;
    update public.modelos_documento_versoes set publicado_em = now(), publicado_por = privado.meu_membro_id() where id = v.id;
    update public.modelos_documento set versao_atual_id = v.id where id = m.id;
    return jsonb_build_object('id', m.id, 'versao_id', v.id);
  end if;

  if p_acao = 'restaurar' then
    select * into v from public.modelos_documento_versoes where id = v_origem and modelo_id = m.id and publicado_em is not null;
    if not found then raise exception 'Edição publicada não encontrada.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.modelos_documento_versoes where modelo_id = m.id and publicado_em is null) then
      raise exception 'Já existe um rascunho. Publique ou edite esse rascunho antes de restaurar.' using errcode = 'P0001';
    end if;
    p := jsonb_build_object('nome', v.nome, 'titulo', v.titulo, 'categoria', v.categoria, 'definicao', v.definicao);
  elsif p_acao not in ('salvar','criar') then
    raise exception 'Ação de modelo inválida.' using errcode = '22023';
  end if;
  perform privado.validar_campos_modelo_documento(p->'definicao', m.chave_oficial);

  if p_acao = 'salvar' then
    update public.modelos_documento_versoes
       set nome = btrim(p->>'nome'), titulo = btrim(p->>'titulo'), categoria = p->>'categoria',
           definicao = p->'definicao', revisao = revisao + 1
     where modelo_id = m.id and id = (p->>'versao_id')::uuid and publicado_em is null and revisao = (p->>'revisao')::int
    returning * into v;
    if not found and (p->>'versao_id' is not null or
       (p->>'base_id')::uuid is distinct from m.versao_atual_id or exists (
        select 1 from public.modelos_documento_versoes where modelo_id = m.id and publicado_em is null)) then
      raise exception 'O modelo mudou. Recarregue antes de salvar.' using errcode = '40001';
    end if;
    v_origem := m.versao_atual_id;
  end if;

  if v.id is null or p_acao = 'restaurar' then
    select coalesce(max(numero), 0) + 1 into v_numero from public.modelos_documento_versoes where modelo_id = m.id;
    insert into public.modelos_documento_versoes (modelo_id, numero, nome, titulo, categoria, definicao, origem_id)
    values (m.id, v_numero, btrim(p->>'nome'), btrim(p->>'titulo'), p->>'categoria', p->'definicao', v_origem)
    returning * into v;
  end if;
  return jsonb_build_object('id', m.id, 'versao_id', v.id, 'revisao', v.revisao);
end
$$;

create function public.modelo_documento_acao(p_acao text, p jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select privado.modelo_documento_acao(p_acao, p) $$;

-- A reimpressão copia a instância existente, inclusive de modelo arquivado.
-- A emissão nova só usa a versão publicada corrente e o tipo do catálogo.
create function privado.emitir_documento_modelo(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  m public.modelos_documento%rowtype;
  v public.modelos_documento_versoes%rowtype;
  d public.documentos%rowtype;
  origem public.documentos%rowtype;
  agenda public.compromissos%rowtype;
  v_id uuid := (p->>'id')::uuid;
  v_cliente uuid := (p->>'cliente_id')::uuid;
  v_contrato uuid := (p->>'contrato_id')::uuid;
  v_compromisso uuid := (p->>'compromisso_id')::uuid;
  v_atualizacao uuid := (p->>'atualizacao_id')::uuid;
  v_processo uuid := (p->>'processo_id')::uuid;
  v_catalogo uuid := (p->>'modelo_catalogo_id')::uuid;
  v_versao uuid := (p->>'modelo_versao_id')::uuid;
  v_origem uuid := (p->>'origem_id')::uuid;
  v_acao text := p->>'acao';
begin
  if not coalesce(privado.edita_clientes(), false) then
    raise exception 'Seu acesso não permite gerar documentos.' using errcode = '42501';
  end if;
  if v_id is null or v_acao is null or v_acao not in ('salvar','imprimir','word')
     or (v_origem is not null and v_acao = 'salvar') then
    raise exception 'Ação de documento inválida.' using errcode = '22023';
  end if;
  -- Serializa reenvios desta operação mesmo após publicação ou arquivamento.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 47));
  select * into d from public.documentos where id = v_id;
  if found then
    if d.criado_por is distinct from privado.meu_membro_id() or d.modelo_versao_id is null
       or (d.dados->>'origem_documento')::uuid is distinct from v_origem
       or d.dados->>'acao' is distinct from v_acao
       or (v_origem is null and (d.modelo_versao_id is distinct from v_versao or d.cliente_id is distinct from v_cliente))
       or not privado.le_documento_versionado(d.contrato_id, d.compromisso_id) then
      raise exception 'Operação de emissão em conflito.' using errcode = '42501';
    end if;
    return jsonb_build_object('id', d.id);
  end if;

  if v_origem is not null then
    select * into origem from public.documentos where id = v_origem and modelo_versao_id is not null and cancelado_em is null for share;
    if not found or not privado.le_documento_versionado(origem.contrato_id, origem.compromisso_id) then
      raise exception 'Documento indisponível para reimpressão.' using errcode = '42501';
    end if;
    insert into public.documentos (id, modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, atualizacao_id,
      modelo_catalogo_id, modelo_versao_id, dados, conteudo)
    values (v_id, origem.modelo, origem.titulo, origem.cliente_id, origem.processo_id, origem.contrato_id, origem.compromisso_id,
      origem.atualizacao_id, origem.modelo_catalogo_id, origem.modelo_versao_id,
      jsonb_build_object('acao', v_acao, 'origem_documento', origem.id), origem.conteudo);
    return jsonb_build_object('id', v_id);
  end if;

  select * into m from public.modelos_documento where id = v_catalogo for share;
  if not found or m.arquivado_em is not null or m.versao_atual_id is null or m.versao_atual_id is distinct from v_versao then
    raise exception 'O modelo mudou ou foi arquivado. Abra o modelo novamente.' using errcode = '40001';
  end if;
  select * into strict v from public.modelos_documento_versoes where id = m.versao_atual_id and publicado_em is not null;

  if not privado.le_documento_versionado(v_contrato, v_compromisso) then
    raise exception 'Você não tem acesso à origem deste documento.' using errcode = '42501';
  end if;
  if (v_contrato is not null and m.tipo <> 'contrato_honorarios') or
     (v_atualizacao is not null and m.tipo <> 'ficha_atendimento') or
     (v_compromisso is not null and coalesce(m.chave_oficial, '') not in ('declaracao_comparecimento','intimacao_testemunha','pauta_audiencia')) then
    raise exception 'A origem não serve para este modelo.' using errcode = '22023';
  end if;
  if v_atualizacao is not null and not exists (
    select 1 from public.atualizacoes a where a.id = v_atualizacao and a.cancelado_em is null
      and (a.processo_id is null or a.processo_id = v_processo)
  ) then
    raise exception 'O atendimento foi cancelado ou pertence a outro processo.' using errcode = '22023';
  end if;
  if v_contrato is not null and not exists (
    select 1 from public.contratos k where k.id = v_contrato and k.cancelado_em is null
  ) then
    raise exception 'O contrato foi cancelado no Financeiro.' using errcode = '22023';
  end if;
  if v_compromisso is not null then
    select * into agenda from public.compromissos where id = v_compromisso;
    if not found or agenda.cancelado_em is not null or agenda.situacao in ('remarcado','faltou')
       or (m.tipo = 'declaracao_comparecimento' and (agenda.tipo <> 'atendimento'
           or (agenda.situacao <> 'realizado' and agenda.chegada_em is null)))
       or (m.tipo <> 'declaracao_comparecimento' and (agenda.tipo <> 'audiencia'
           or (v_processo is not null and regexp_replace(coalesce(agenda.processo,''), '[^0-9]','','g') is distinct from
               (select numero from public.processos where id = v_processo)))) then
      raise exception 'Escolha um compromisso válido para o cliente, o processo e o modelo.' using errcode = '22023';
    end if;
  end if;
  if v_cliente is null or not exists (select 1 from public.clientes where id = v_cliente) then
    raise exception 'Escolha um cliente cadastrado.' using errcode = '22023';
  end if;
  if not coalesce(char_length(btrim(p->>'conteudo')) between 1 and 400000, false) then
    raise exception 'O texto do documento está vazio ou excede o limite.' using errcode = '22023';
  end if;
  insert into public.documentos (id, modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, atualizacao_id,
    modelo_catalogo_id, modelo_versao_id, dados, conteudo)
  values (v_id, m.tipo, v.nome, v_cliente, v_processo, v_contrato, v_compromisso, v_atualizacao,
    m.id, v.id, jsonb_build_object('acao', v_acao), p->>'conteudo');
  return jsonb_build_object('id', v_id);
end
$$;

create function privado.le_documento_versionado(p_contrato uuid, p_compromisso uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (p_contrato is null or coalesce(privado.financeiro_le(), false))
    and (p_compromisso is null or exists (
      select 1 from public.compromissos c where c.id = p_compromisso
        and privado.acesso_agenda() <> 'nenhum'
        and (not c.particular or c.membro_id = privado.meu_membro_id())
    ))
$$;

create function public.emitir_documento_modelo(p jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select privado.emitir_documento_modelo(p) $$;

-- Política restritiva acumula com as permissivas existentes e protege fontes
-- do documento versionado na lista, na ficha, na leitura por ID e no cancelamento.
create policy "documentos versionados: fontes para ler" on public.documentos as restrictive
  for select to authenticated using (modelo_versao_id is null or privado.le_documento_versionado(contrato_id, compromisso_id));
create policy "documentos versionados: fontes para alterar" on public.documentos as restrictive
  for update to authenticated using (modelo_versao_id is null or privado.le_documento_versionado(contrato_id, compromisso_id))
  with check (modelo_versao_id is null or privado.le_documento_versionado(contrato_id, compromisso_id));

-- A auditoria comum inclui o texto. Aplicar a mesma restrição também na API de Histórico.
create function privado.pode_ler_auditoria_modelo(p_tabela text, p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when p_tabela = 'documentos' then not exists (
    select 1 from public.documentos d where d.id = p_id and d.modelo_versao_id is not null
      and not privado.le_documento_versionado(d.contrato_id, d.compromisso_id)
  ) when p_tabela = 'modelos_documento' then privado.edita_modelos_documento()
    else true end
$$;
create policy "auditoria de documentos versionados" on public.auditoria as restrictive
  for select to authenticated using (privado.pode_ler_auditoria_modelo(tabela, registro_id));

revoke execute on function privado.edita_modelos_documento(), privado.versao_documento_imutavel(),
  privado.validar_no_modelo_documento(jsonb, int), privado.validar_definicao_modelo_documento(jsonb),
  privado.validar_campos_modelo_documento(jsonb, text),
  privado.modelo_documento_acao(text, jsonb), public.modelo_documento_acao(text, jsonb),
  privado.le_documento_versionado(uuid, uuid), privado.emitir_documento_modelo(jsonb), public.emitir_documento_modelo(jsonb),
  privado.pode_ler_auditoria_modelo(text, uuid) from public, anon, authenticated;
grant execute on function privado.edita_modelos_documento(), privado.modelo_documento_acao(text, jsonb),
  public.modelo_documento_acao(text, jsonb), privado.le_documento_versionado(uuid, uuid),
  privado.emitir_documento_modelo(jsonb), public.emitir_documento_modelo(jsonb),
  privado.pode_ler_auditoria_modelo(text, uuid) to authenticated;


-- Uma chave oficial arquivada não deve ressurgir pelo gerador legado
-- (inclusive para quem não pode ler a linha arquivada).
create function privado.modelo_legado_arquivado(p_chave text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.edita_clientes(),false) and exists (
    select 1 from public.modelos_documento m where m.chave_oficial = p_chave and m.arquivado_em is not null
  )
$$;

create function public.modelo_legado_arquivado(p_chave text)
returns boolean language sql security invoker set search_path = ''
as $$ select privado.modelo_legado_arquivado(p_chave) $$;

create function privado.bloquear_emissao_legada_arquivada()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.modelo_versao_id is not null or not privado.modelo_legado_arquivado(new.modelo) then return new; end if;
  if not exists (
    select 1 from public.documentos d
      where d.id::text = new.dados->>'origem_documento'
        and d.modelo = new.modelo and d.modelo_versao_id is null and d.cancelado_em is null
        and d.titulo = new.titulo and d.cliente_id = new.cliente_id and d.conteudo = new.conteudo
        and (d.processo_id,d.contrato_id,d.compromisso_id,d.atualizacao_id,d.recebimento_id)
          is not distinct from (new.processo_id,new.contrato_id,new.compromisso_id,new.atualizacao_id,new.recebimento_id)
        and new.dados->>'acao' in ('word','imprimir')
  ) then
    raise exception 'O modelo foi arquivado. Escolha outro.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger f_bloquear_modelo_arquivado before insert on public.documentos
  for each row execute function privado.bloquear_emissao_legada_arquivada();

revoke execute on function privado.modelo_legado_arquivado(text), public.modelo_legado_arquivado(text),
  privado.bloquear_emissao_legada_arquivada() from public, anon, authenticated;
grant execute on function privado.modelo_legado_arquivado(text), public.modelo_legado_arquivado(text) to authenticated;

