-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 05 · Conteúdo do site: publicações e campanhas
-- =============================================================================
--
-- O site institucional passa a ler daqui o que antes estava fixo em
-- src/data/posts.mjs e src/data/campanhas.mjs. Com isso o escritório publica
-- um artigo ou abre uma campanha pela própria área dos advogados, sem
-- depender de quem mexe no código.
--
-- COMO O SITE LÊ — o site é estático e continua estático: quem lê estas
-- tabelas é o build (scripts/build.mjs), uma vez, e o resultado vai para o ar
-- como HTML. É o que mantém o artigo indexável pelo Google, que é a razão de
-- ele existir (CLAUDE.md §4, "tráfego orgânico"). Por isso `anon` ganha aqui o
-- único privilégio que tem no banco inteiro: SELECT das colunas públicas, e só
-- das linhas já publicadas.
--
-- O QUE NÃO MUDA — as regras de sempre: RLS, permissão por módulo, carimbo de
-- quem escreveu, auditoria com antes e depois, e nada se apaga.
--
-- Provimento 205/2021 da OAB: o que sai daqui é publicidade de escritório de
-- advocacia. A tela lembra as regras a quem escreve; o banco não tem como
-- conferir conteúdo.

-- -----------------------------------------------------------------------------
-- Permissão do módulo (preparação 5.2)
-- -----------------------------------------------------------------------------
alter table public.membros
  add column acesso_site text not null default 'nenhum'
    check (acesso_site in ('nenhum', 'editar'));

comment on column public.membros.acesso_site is
  'nenhum · editar: escreve publicações e campanhas do site e manda publicar';

create function privado.acesso_site()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'editar' else m.acesso_site end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

create function privado.edita_site()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.acesso_site() = 'editar'
$$;

-- O membro precisa saber o próprio nível assim que entra.
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
    'acesso_site',       case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_site end
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Publicações
--
-- `corpo` guarda os mesmos blocos [tipo, valor] que o site já renderiza (ver
-- src/data/posts.mjs). Guardar HTML pronto seria mais simples e muito pior: o
-- renderizador do site controla a marcação, e texto colado de um editor traria
-- estilo e script junto.
-- -----------------------------------------------------------------------------
create table public.publicacoes (
  id           uuid primary key default gen_random_uuid(),
  -- O slug vira o endereço publicacoes/<slug>.html e não deve mudar depois de
  -- publicado: link compartilhado e posição no Google se perdem junto.
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo       text not null check (btrim(titulo) <> ''),
  resumo       text not null check (btrim(resumo) <> ''),
  -- Rótulo curto da área ("Trabalhista"), como aparece no artigo. É texto: as
  -- áreas do site estão em src/data/areas.mjs, não no banco.
  area         text not null check (btrim(area) <> ''),
  autor        text not null check (btrim(autor) <> ''),
  data         date not null default privado.hoje(),
  thumb        text not null default '§' check (char_length(thumb) between 1 and 2),
  corpo        jsonb not null default '[]'::jsonb,
  publicado    boolean not null default false,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create index publicacoes_data on public.publicacoes (data desc);
create index publicacoes_publicado on public.publicacoes (publicado) where publicado;

comment on table public.publicacoes is
  'Artigos de publicacoes.html. O build do site lê as publicadas e gera uma página para cada.';

-- Bloco inválido quebraria o build do site inteiro — e o erro só apareceria na
-- hora de publicar. Recusar aqui devolve a mensagem a quem está escrevendo.
create function privado.validar_corpo()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_bloco jsonb;
  v_tipo  text;
  v_valor jsonb;
  v_item  jsonb;
begin
  if jsonb_typeof(new.corpo) <> 'array' then
    raise exception 'O corpo do artigo está num formato inesperado.' using errcode = 'P0001';
  end if;

  for v_bloco in select * from jsonb_array_elements(new.corpo) loop
    if jsonb_typeof(v_bloco) <> 'array' or jsonb_array_length(v_bloco) <> 2 then
      raise exception 'Cada bloco do artigo precisa ter tipo e conteúdo.' using errcode = 'P0001';
    end if;

    v_tipo  := v_bloco ->> 0;
    v_valor := v_bloco -> 1;

    if v_tipo is null or v_tipo not in ('p', 'h2', 'pq', 'ul', 'instagram', 'facebook', 'linkedin') then
      raise exception 'Bloco "%" não existe no site.', coalesce(v_tipo, '?') using errcode = 'P0001';
    end if;

    if v_tipo = 'ul' then
      if jsonb_typeof(v_valor) <> 'array' or jsonb_array_length(v_valor) = 0 then
        raise exception 'Lista sem itens.' using errcode = 'P0001';
      end if;
      for v_item in select * from jsonb_array_elements(v_valor) loop
        if jsonb_typeof(v_item) <> 'string' or btrim(v_item #>> '{}') = '' then
          raise exception 'Item de lista em branco.' using errcode = 'P0001';
        end if;
      end loop;

    elsif v_tipo in ('instagram', 'facebook', 'linkedin') then
      if jsonb_typeof(v_valor) <> 'object'
         or coalesce(btrim(v_valor ->> 'url'), '') = ''
         or coalesce(btrim(v_valor ->> 'imagem'), '') = ''
         or coalesce(btrim(v_valor ->> 'legenda'), '') = '' then
        raise exception 'O cartão de rede social precisa de link, imagem e legenda.'
          using errcode = 'P0001';
      end if;
      if (v_valor ->> 'url') !~* '^https://' then
        raise exception 'O link do post precisa começar com https://.' using errcode = 'P0001';
      end if;

    elsif jsonb_typeof(v_valor) <> 'string' or btrim(v_valor #>> '{}') = '' then
      raise exception 'Bloco de texto em branco.' using errcode = 'P0001';
    end if;
  end loop;

  return new;
end
$$;

create trigger b_validar_corpo before insert or update on public.publicacoes
  for each row execute function privado.validar_corpo();

select privado.aplicar_padrao('public.publicacoes');

-- -----------------------------------------------------------------------------
-- Campanhas
--
-- A landing page que o cliente perguntou se precisaria ser um site à parte
-- (CLAUDE.md §5.3). Não precisa: cada linha daqui vira campanhas/<slug>.html,
-- com a marca, o domínio e o SEO do próprio site.
--
-- O período não esconde a página: antes do início ela existe para revisar o
-- link, depois do fim continua no ar com aviso de encerrada — quem chega por
-- um post antigo não cai num erro. Quem decide isso é o site.
-- -----------------------------------------------------------------------------
create table public.campanhas (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  rotulo       text not null check (btrim(rotulo) <> ''),
  titulo       text not null check (btrim(titulo) <> ''),
  subtitulo    text not null check (btrim(subtitulo) <> ''),
  -- Texto do Google e da prévia do link. Até uns 155 caracteres.
  descricao    text not null check (btrim(descricao) <> ''),
  -- Mensagem que já chega escrita no WhatsApp do escritório: é como se sabe
  -- que o contato veio da campanha.
  whatsapp     text,
  -- Slug de uma área de src/data/areas.mjs, ou nada.
  area         text,
  inicio       date,
  fim          date,
  situacoes    jsonb not null default '[]'::jsonb,
  direitos     jsonb not null default '[]'::jsonb,
  passos       jsonb,
  documentos   jsonb not null default '[]'::jsonb,
  prazo        text,
  faq          jsonb not null default '[]'::jsonb,
  publicado    boolean not null default false,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint campanhas_periodo check (fim is null or inicio is null or fim >= inicio)
);

create index campanhas_publicado on public.campanhas (publicado) where publicado;

comment on table public.campanhas is
  'Páginas de campanha. O build do site lê as publicadas e gera campanhas/<slug>.html.';

-- Mesmo motivo do corpo do artigo: formato errado quebraria o build.
create function privado.validar_campanha()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_lista jsonb;
  v_item  jsonb;
begin
  foreach v_lista in array array[new.situacoes, new.documentos, new.direitos, new.faq,
                                 coalesce(new.passos, '[]'::jsonb)] loop
    if jsonb_typeof(v_lista) <> 'array' then
      raise exception 'Lista em formato inesperado.' using errcode = 'P0001';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(new.situacoes || new.documentos) loop
    if jsonb_typeof(v_item) <> 'string' or btrim(v_item #>> '{}') = '' then
      raise exception 'Item de lista em branco.' using errcode = 'P0001';
    end if;
  end loop;

  for v_item in
    select * from jsonb_array_elements(new.direitos || new.faq || coalesce(new.passos, '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'array' or jsonb_array_length(v_item) <> 2
       or jsonb_typeof(v_item -> 0) <> 'string' or jsonb_typeof(v_item -> 1) <> 'string'
       or btrim(v_item ->> 0) = '' or btrim(v_item ->> 1) = '' then
      raise exception 'Cada item precisa de título e texto.' using errcode = 'P0001';
    end if;
  end loop;

  return new;
end
$$;

create trigger b_validar_campanha before insert or update on public.campanhas
  for each row execute function privado.validar_campanha();

select privado.aplicar_padrao('public.campanhas');

-- -----------------------------------------------------------------------------
-- Publicação do site
--
-- Salvar aqui não muda o site: ele é estático. O que muda o site é um build
-- novo, disparado pelo Deploy Hook da Vercel — chamado pela função de borda
-- `publicar-site`, nunca pelo navegador, porque a URL do hook é um segredo:
-- quem a tem dispara build no site de vocês.
--
-- Cada pedido fica registrado. Enquanto o hook não existir, a função responde
-- que não está configurada e o pedido entra como falhou, com o motivo.
-- -----------------------------------------------------------------------------
create table public.site_deploys (
  id           uuid primary key default gen_random_uuid(),
  situacao     text not null check (situacao in ('enviado', 'falhou')),
  detalhe      text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create index site_deploys_em on public.site_deploys (criado_em desc);

select privado.aplicar_padrao('public.site_deploys');

create function public.pode_publicar_site()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.edita_site()
$$;

create function public.registrar_publicacao(p_situacao text, p_detalhe text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.edita_site() then
    raise exception 'Seu acesso não permite publicar o site.' using errcode = 'P0001';
  end if;
  if p_situacao not in ('enviado', 'falhou') then
    raise exception 'Situação inválida.' using errcode = 'P0001';
  end if;
  insert into public.site_deploys (situacao, detalhe)
  values (p_situacao, nullif(btrim(p_detalhe), ''))
  returning id into v_id;
  return v_id;
end
$$;

-- O que a tela precisa saber de uma vez: quando o site foi publicado pela
-- última vez e quanta coisa mudou depois disso.
create function public.site_situacao()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ultimo timestamptz;
  v_pub    integer;
  v_camp   integer;
begin
  if not privado.edita_site() then
    raise exception 'Seu acesso não permite ver a publicação do site.' using errcode = 'P0001';
  end if;

  select max(criado_em) into v_ultimo
    from public.site_deploys where situacao = 'enviado';

  select count(*) into v_pub from public.publicacoes
   where v_ultimo is null or greatest(criado_em, coalesce(alterado_em, criado_em)) > v_ultimo;

  select count(*) into v_camp from public.campanhas
   where v_ultimo is null or greatest(criado_em, coalesce(alterado_em, criado_em)) > v_ultimo;

  return jsonb_build_object(
    'publicado_em', v_ultimo,
    'publicacoes',  v_pub,
    'campanhas',    v_camp
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Histórico das tabelas novas
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Políticas
--
-- `anon` aqui é o build do site: lê o que está publicado, e nada mais. É o
-- único lugar do banco onde ele enxerga alguma coisa.
-- -----------------------------------------------------------------------------
alter table public.publicacoes  enable row level security;
alter table public.campanhas    enable row level security;
alter table public.site_deploys enable row level security;

create policy "publicacoes: site" on public.publicacoes
  for select to anon using (publicado);
create policy "publicacoes: ver" on public.publicacoes
  for select to authenticated using ((select privado.edita_site()));
create policy "publicacoes: incluir" on public.publicacoes
  for insert to authenticated with check ((select privado.edita_site()));
create policy "publicacoes: alterar" on public.publicacoes
  for update to authenticated
  using ((select privado.edita_site())) with check ((select privado.edita_site()));

create policy "campanhas: site" on public.campanhas
  for select to anon using (publicado);
create policy "campanhas: ver" on public.campanhas
  for select to authenticated using ((select privado.edita_site()));
create policy "campanhas: incluir" on public.campanhas
  for insert to authenticated with check ((select privado.edita_site()));
create policy "campanhas: alterar" on public.campanhas
  for update to authenticated
  using ((select privado.edita_site())) with check ((select privado.edita_site()));

-- Quem escreve só lê os pedidos de publicação; quem os cria é a função de
-- borda, por registrar_publicacao().
create policy "site_deploys: ver" on public.site_deploys
  for select to authenticated using ((select privado.edita_site()));

-- -----------------------------------------------------------------------------
-- Privilégios
--
-- Para `anon`, só as colunas que já vão para o HTML do site. `publicado` fica
-- de fora de propósito: é a política que filtra, e sem SELECT na coluna nem dá
-- para filtrar por ela de fora.
-- -----------------------------------------------------------------------------
revoke all on public.publicacoes, public.campanhas, public.site_deploys
  from anon, authenticated;

grant select (slug, titulo, resumo, area, autor, data, thumb, corpo)
  on public.publicacoes to anon;
grant select (slug, rotulo, titulo, subtitulo, descricao, whatsapp, area, inicio, fim,
              situacoes, direitos, passos, documentos, prazo, faq)
  on public.campanhas to anon;

grant select on public.publicacoes to authenticated;
grant insert (slug, titulo, resumo, area, autor, data, thumb, corpo, publicado)
  on public.publicacoes to authenticated;
grant update (slug, titulo, resumo, area, autor, data, thumb, corpo, publicado)
  on public.publicacoes to authenticated;

grant select on public.campanhas to authenticated;
grant insert (slug, rotulo, titulo, subtitulo, descricao, whatsapp, area, inicio, fim,
              situacoes, direitos, passos, documentos, prazo, faq, publicado)
  on public.campanhas to authenticated;
grant update (slug, rotulo, titulo, subtitulo, descricao, whatsapp, area, inicio, fim,
              situacoes, direitos, passos, documentos, prazo, faq, publicado)
  on public.campanhas to authenticated;

grant select on public.site_deploys to authenticated;

grant all on public.publicacoes, public.campanhas, public.site_deploys to service_role;

-- acesso_site entra no que o administrador pode gravar em Membros.
grant insert (acesso_site), update (acesso_site) on public.membros to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.acesso_site(), privado.edita_site() to authenticated;

revoke execute on function
  public.pode_publicar_site(), public.site_situacao(),
  public.registrar_publicacao(text, text) from public, anon;
grant execute on function
  public.pode_publicar_site(), public.site_situacao(),
  public.registrar_publicacao(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Imagens das publicações
--
-- Só o cartão de post de rede social precisa de imagem (CLAUDE.md §5.2). O
-- balde é público porque é o build do site que baixa o arquivo e o copia para
-- dist/assets/img/publicacoes/ — no ar, a imagem é servida pelo site, não pelo
-- Supabase, e nada de terceiro carrega na página do artigo.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "site: ver arquivos" on storage.objects
  for select to authenticated using (bucket_id = 'site');
create policy "site: enviar arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site' and (select privado.edita_site()));
create policy "site: substituir arquivos" on storage.objects
  for update to authenticated
  using (bucket_id = 'site' and (select privado.edita_site()))
  with check (bucket_id = 'site' and (select privado.edita_site()));

-- -----------------------------------------------------------------------------
-- Conteúdo que já estava no site
--
-- Cópia do que havia em src/data/posts.mjs e src/data/campanhas.mjs no dia
-- desta migração. Os arquivos continuam lá e viram a cópia de segurança do
-- build: se o Supabase estiver fora do ar — no plano gratuito ele pausa depois
-- de uma semana sem uso —, o site é gerado a partir deles, em vez de ir ao ar
-- sem publicação nenhuma.
-- -----------------------------------------------------------------------------
insert into public.publicacoes
  (slug, titulo, resumo, area, autor, data, thumb, corpo, publicado) values
  ('clausula-nao-concorrencia', 'O que é, afinal, uma cláusula de não concorrência', 'Ela aparece em quase todo contrato relevante e quase nunca é lida com atenção. Três perguntas para saber se a sua é válida.', 'Trabalhista', 'Marlon A. Hespanha', '2026-08-12', '§', '[["p","A cláusula de não concorrência aparece em contratos de trabalho, de compra e venda de empresa, de sociedade e de prestação de serviços. Em todos eles ela cumpre a mesma função: impedir que alguém use o que aprendeu ali para competir logo em seguida."],["h2","O problema não é existir, é o alcance"],["p","Uma cláusula que proíbe atuação em qualquer atividade, em qualquer lugar, por tempo indeterminado, tende a ser tratada como abusiva. Não porque a proteção seja ilegítima, mas porque ela deixou de proteger um interesse concreto e passou a simplesmente restringir o trabalho de alguém."],["pq","Cláusula boa é cláusula específica."],["h2","As três perguntas"],["ul",["<strong>Prazo:</strong> por quanto tempo? Prazos longos sem contrapartida chamam atenção negativa.","<strong>Território:</strong> onde? A restrição precisa acompanhar a área em que a empresa efetivamente atua.","<strong>Atividade:</strong> o quê? Descrever a atividade concorrente vale mais do que proibir genericamente."]],["instagram",{"url":"https://www.instagram.com/","imagem":"assets/img/publicacoes/clausula-nao-concorrencia-instagram.png","legenda":"Prazo, território e atividade: as três perguntas que dizem se uma cláusula de não concorrência se sustenta. Salve para consultar antes de assinar.","alt":"Arte do post com as três perguntas sobre a cláusula de não concorrência"}],["p","Há ainda uma quarta questão que costuma decidir a discussão: existe compensação? Uma restrição remunerada é defendida com muito mais facilidade do que uma restrição gratuita."],["h2","O que fazer com isso"],["p","Se a cláusula já foi assinada, o caminho é avaliar a extensão real da restrição antes de assumir que ela é integralmente válida — ou integralmente inválida. Se ainda não foi, é o momento de escrevê-la com limites que se sustentem."]]'::jsonb, true),
  ('locacao-comercial', 'Sete pontos para verificar antes de assinar uma locação comercial', 'A locação comercial tem regras próprias e um direito que muita gente desconhece: o da renovação.', 'Cível', 'Guilherme O. Fonseca', '2026-07-28', '¶', '[["p","Locação comercial não é locação residencial com outro nome. Ela tem regime próprio, e algumas das suas regras mais relevantes só aparecem quando o contrato já está em execução."],["h2","1. O direito de renovação"],["p","Preenchidos certos requisitos de prazo e continuidade, o locatário pode ter direito à renovação compulsória do contrato. Esse direito se exerce dentro de uma janela específica de tempo — perdida a janela, perde-se o direito."],["h2","2. O índice de reajuste"],["p","Índices diferentes produzem resultados muito diferentes ao longo de cinco anos. Vale simular antes, não depois."],["h2","3. Quem paga o quê"],["p","Despesas ordinárias e extraordinárias de condomínio seguem lógicas distintas. O contrato precisa dizer, com clareza, o que cabe a cada lado — inclusive obras estruturais."],["h2","4. Garantia"],["p","Fiança, caução e seguro-fiança têm custos e consequências diferentes em caso de inadimplemento. A escolha não é apenas financeira."],["h2","5. Benfeitorias"],["p","Quem faz a obra, quem paga, e o que acontece com ela ao fim do contrato. A ausência dessa previsão é uma das causas mais comuns de disputa na saída."],["h2","6. Multa por rescisão antecipada"],["p","A multa costuma ser proporcional ao tempo restante. Contratos que cobram o valor integral independentemente do momento da saída tendem a ser questionados."],["h2","7. A destinação do imóvel"],["p","Se a atividade pretendida depende de licença ou de zoneamento específico, isso precisa estar no contrato — junto com o que acontece se a licença não sair."],["pq","O contrato de locação é lido com atenção duas vezes: antes de assinar, ou no dia da briga."]]'::jsonb, true),
  ('multa-contratual', 'Multa contratual: quando ela protege e quando ela vira problema', 'Multa alta demais não intimida mais — só aumenta a chance de a cláusula ser reduzida em juízo.', 'Cível', 'Vinicius L. Lisboa', '2026-07-03', '†', '[["p","A multa contratual existe para dar consequência ao descumprimento. Sem ela, a obrigação vira recomendação. O erro comum não é usar multa: é calibrá-la mal."],["h2","Moratória e compensatória"],["p","A multa moratória pune o atraso; a compensatória, o descumprimento definitivo. São coisas diferentes e produzem efeitos diferentes — contratos que as tratam como sinônimos costumam gerar discussão sobre o que exatamente está sendo cobrado."],["h2","O limite prático"],["p","Multa manifestamente excessiva em relação à obrigação principal pode ser reduzida. O efeito prático é que uma multa desproporcional não protege mais do que uma multa proporcional: apenas transfere a discussão para o juiz."],["pq","Multa que ninguém acredita que será cobrada não é garantia; é decoração."],["h2","O que costuma funcionar melhor"],["ul",["Multa proporcional ao valor e à duração da obrigação","Previsão expressa de cumulação — ou não — com perdas e danos","Mecanismo de notificação antes da incidência","Prazo de cura, quando a obrigação admite correção"]],["p","Um prazo de cura bem escrito resolve mais descumprimentos do que qualquer multa — e preserva a relação comercial, que costuma valer mais do que o valor em disputa."]]'::jsonb, true);

insert into public.campanhas
  (slug, rotulo, titulo, subtitulo, descricao, whatsapp, area, inicio, fim,
   situacoes, direitos, passos, documentos, prazo, faq, publicado) values
  ('acidente-de-trabalho', 'Acidente de trabalho', 'Sofreu um acidente de trabalho?', 'Acidente no serviço, no trajeto ou doença causada pelo trabalho podem garantir estabilidade no emprego, benefício do INSS e indenização. Entenda o que se aplica ao seu caso.', 'Acidente de trabalho ou doença ocupacional? Veja os direitos que podem existir — estabilidade, benefício do INSS e indenização — e fale com a FHL Advocacia.', 'Olá! Vim pela página sobre acidente de trabalho e gostaria de uma orientação.', 'trabalhista', '2026-09-01', '2026-11-30', '["Se machucou durante o trabalho ou a serviço da empresa","Sofreu um acidente no trajeto entre a casa e o trabalho","Desenvolveu doença ligada à função — LER/DORT, perda auditiva, problemas de coluna","Ficou afastado por mais de 15 dias","Foi demitido pouco tempo depois de voltar do afastamento","A empresa não emitiu a CAT (Comunicação de Acidente de Trabalho)"]'::jsonb, '[["Estabilidade no emprego","Quem recebeu auxílio do INSS por acidente de trabalho tem garantia de 12 meses no emprego depois de voltar ao trabalho."],["Benefício do INSS","Afastamento de mais de 15 dias dá direito ao auxílio por incapacidade. Se ficar sequela que reduza a capacidade de trabalho, pode caber também o auxílio-acidente."],["FGTS durante o afastamento","No afastamento por acidente de trabalho, a empresa continua obrigada a depositar o FGTS."],["Indenização","Quando a empresa tem responsabilidade pelo acidente, é possível buscar indenização por danos morais, materiais e estéticos — e pensão, se a capacidade de trabalho foi reduzida."]]'::jsonb, null, '["CAT — Comunicação de Acidente de Trabalho, se foi emitida","Atestados, laudos e exames médicos","Carta de concessão ou de negativa do INSS","Carteira de trabalho e holerites","Fotos, boletim de ocorrência e contato de testemunhas"]'::jsonb, 'Direitos trabalhistas têm prazo: em regra, a ação precisa ser proposta em até 2 anos depois do fim do contrato. Reunir os documentos cedo faz diferença.', '[["A empresa não emitiu a CAT. E agora?","A CAT pode ser emitida pelo próprio trabalhador, por um familiar, pelo sindicato, pelo médico que atendeu ou por uma autoridade pública. A falta dela não elimina os direitos, mas vale registrar o quanto antes."],["Posso ser demitido depois de voltar do afastamento?","Quem recebeu o auxílio do INSS por acidente de trabalho tem estabilidade de 12 meses após o retorno. A demissão sem justa causa nesse período pode gerar reintegração ou indenização."],["Acidente no caminho para o trabalho conta?","Para o INSS, o acidente no trajeto entre a casa e o trabalho é equiparado ao acidente de trabalho. Cada situação precisa ser analisada com os documentos."],["Preciso ir até o escritório?","Não para começar. O primeiro contato pode ser pelo WhatsApp ou por telefone; se for preciso, marcamos um atendimento no escritório, em Paranaguá."]]'::jsonb, true);
