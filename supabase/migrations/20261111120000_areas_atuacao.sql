-- Conteúdo das páginas de atuação. Retirar do site preserva a área e seu endereço.
create table public.areas_atuacao (
  id uuid primary key default gen_random_uuid(),
  slug text not null constraint areas_atuacao_slug_key unique
    check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and slug !~ '^(con|prn|aux|nul|com[1-9]|lpt[1-9])$'),
  nome text not null check (nome ~ '[^[:space:]]' and char_length(nome) <= 120),
  resumo text not null check (resumo ~ '[^[:space:]]' and char_length(resumo) <= 400),
  intro text not null check (intro ~ '[^[:space:]]' and char_length(intro) <= 4000),
  itens jsonb not null,
  quando text not null check (quando ~ '[^[:space:]]' and char_length(quando) <= 4000),
  advogados jsonb not null default '[]'::jsonb,
  posicao integer not null default 100 check (posicao between 1 and 9999),
  publicado boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);

create function privado.validar_area_atuacao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.itens) <> 'array' then
    raise exception 'As principais demandas precisam ser uma lista.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(new.itens) not between 1 and 50 or exists (
    select 1 from jsonb_array_elements(new.itens) as item(valor)
    where jsonb_typeof(valor) <> 'string' or (valor #>> '{}') !~ '[^[:space:]]'
      or char_length(valor #>> '{}') > 400 or (valor #>> '{}') ~ E'[\\r\\n]'
  ) then
    raise exception 'Informe de 1 a 50 demandas, com até 400 caracteres cada.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(new.advogados) <> 'array' then
    raise exception 'Os advogados precisam ser uma lista.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.advogados) as advogado(valor)
    where jsonb_typeof(valor) <> 'string' or (valor #>> '{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ) then
    raise exception 'A lista de advogados contém um perfil inválido.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function privado.validar_area_atuacao() from public, anon, authenticated;
create trigger b_validar_area_atuacao before insert or update on public.areas_atuacao
  for each row execute function privado.validar_area_atuacao();
select privado.aplicar_padrao('public.areas_atuacao');

alter table public.areas_atuacao enable row level security;
revoke all on public.areas_atuacao from public, anon, authenticated;
grant select (slug, nome, resumo, intro, itens, quando, advogados, posicao)
  on public.areas_atuacao to anon;
grant select on public.areas_atuacao to authenticated;
grant insert (slug, nome, resumo, intro, itens, quando, advogados, posicao, publicado)
  on public.areas_atuacao to authenticated;
grant update (nome, resumo, intro, itens, quando, advogados, posicao, publicado)
  on public.areas_atuacao to authenticated;
grant all on public.areas_atuacao to service_role;

create policy "areas: site" on public.areas_atuacao
  for select to anon using (publicado);
create policy "areas: ver" on public.areas_atuacao
  for select to authenticated using ((select privado.edita_site()));
create policy "areas: incluir" on public.areas_atuacao
  for insert to authenticated with check ((select privado.edita_site()));
create policy "areas: alterar" on public.areas_atuacao
  for update to authenticated
  using ((select privado.edita_site())) with check ((select privado.edita_site()));

create policy "auditoria: áreas de atuação" on public.auditoria
  for select to authenticated using (tabela = 'areas_atuacao' and (select privado.edita_site()));

create or replace function public.site_situacao()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ultimo timestamptz;
  v_pub integer;
  v_camp integer;
  v_areas integer;
begin
  if not privado.edita_site() then
    raise exception 'Seu acesso não permite ver a publicação do site.' using errcode = 'P0001';
  end if;

  select max(criado_em) into v_ultimo from public.site_deploys where situacao = 'enviado';
  select count(*) into v_pub from public.publicacoes
   where v_ultimo is null or greatest(criado_em, coalesce(alterado_em, criado_em)) > v_ultimo;
  select count(*) into v_camp from public.campanhas
   where v_ultimo is null or greatest(criado_em, coalesce(alterado_em, criado_em)) > v_ultimo;
  select count(*) into v_areas from public.areas_atuacao
   where v_ultimo is null or coalesce(alterado_em, criado_em) > v_ultimo;

  return jsonb_build_object(
    'publicado_em', v_ultimo, 'publicacoes', v_pub, 'campanhas', v_camp, 'areas', v_areas
  );
end
$$;

-- Conteúdo e vínculos já exibidos no site.
insert into public.areas_atuacao
  (slug, nome, resumo, intro, itens, quando, advogados, posicao, publicado) values
  ('trabalhista', 'Direito Trabalhista', 'Reclamações trabalhistas, verbas rescisórias, vínculo de emprego, horas extras e defesa empresarial.', 'Atuamos dos dois lados da relação de trabalho: para quem foi demitido sem receber o que era devido, e para a empresa que precisa responder a uma reclamação — ou evitar a próxima. Em ambos os casos o trabalho começa no mesmo lugar: nos documentos que já existem.', '["Verbas rescisórias não pagas ou pagas a menor","Reconhecimento de vínculo de emprego","Horas extras, adicionais e jornada","Rescisão indireta e justa causa","Defesa empresarial em reclamatórias","Acordos, homologações e cálculos"]', 'Assim que o contrato de trabalho termina, ou assim que a empresa é notificada. O prazo para reclamar direitos trabalhistas é curto, e documento reunido depois vale menos do que documento reunido antes.', '["vinicius-lisboa"]', 10, true),
  ('previdenciario', 'Direito Previdenciário', 'Aposentadorias, benefícios, revisões e processos administrativos perante o INSS.', 'Boa parte dos benefícios negados pelo INSS é negada por falha de documentação, não por falta de direito. Antes de discutir na Justiça, vale entender o que o processo administrativo registrou — e o que deixou de registrar.', '["Aposentadoria por idade, tempo de contribuição e especial","Auxílio por incapacidade temporária e permanente","BPC/LOAS — benefício assistencial","Pensão por morte e auxílio-reclusão","Revisão de benefício concedido","Recurso administrativo e ação judicial"]', 'Antes de protocolar o pedido, para reunir a prova certa; e logo após uma negativa, porque o prazo de recurso administrativo corre rápido.', '["juliana-lisboa","vinicius-lisboa"]', 20, true),
  ('consumidor', 'Direito do Consumidor', 'Fraudes bancárias, cobranças indevidas, negativação irregular e vícios de produtos ou serviços.', 'Fraude bancária, empréstimo que ninguém contratou, nome negativado por dívida inexistente. São situações em que a prova costuma estar com a empresa, não com o consumidor — e é justamente isso que a lei reconhece.', '["Fraude bancária, golpes e empréstimos não contratados","Cobrança indevida e negativação irregular","Vício e defeito de produto ou serviço","Serviço contratado e não prestado","Planos de saúde e negativa de cobertura","Revisão de contratos de adesão"]', 'Assim que a cobrança aparece. Guarde prints, protocolos e extratos antes de qualquer contato — é o que sustenta o caso depois.', '["guilherme-fonseca","juliana-lisboa"]', 30, true),
  ('civel', 'Direito Cível', 'Contratos, cobranças, indenizações, responsabilidade civil e assessoria preventiva.', 'O direito cível é onde a maior parte dos conflitos do dia a dia se resolve: um contrato descumprido, uma dívida não paga, um dano que alguém precisa reparar, um imóvel em disputa. Cada um deles é, antes de tudo, um problema de prova e de prazo.', '["Contratos: redação, revisão e rescisão","Cobrança e execução de dívidas","Responsabilidade civil e indenizações","Danos morais e materiais","Assessoria preventiva e notificações extrajudiciais","Obrigações de fazer e tutelas de urgência"]', 'Antes de assinar, quando ainda dá para mudar o texto. E assim que o descumprimento acontece, enquanto a prova ainda é recuperável.', '["guilherme-fonseca"]', 40, true),
  ('criminal', 'Direito Criminal', 'Defesa em inquérito policial e ação penal, prisão em flagrante, audiência de custódia, habeas corpus e recursos.', 'No processo penal, boa parte do caso se define nos primeiros atos: o depoimento na delegacia, a audiência de custódia, a forma como a prova foi colhida. Por isso a defesa técnica começa cedo — pelo que já está nos autos, com orientação clara a quem é investigado e à família.', '["Acompanhamento em delegacia e inquérito policial","Prisão em flagrante e audiência de custódia","Liberdade provisória, revogação de prisão e habeas corpus","Defesa em ação penal e no Tribunal do Júri","Acordo de não persecução penal e transação penal","Recursos criminais e assistência de acusação"]', 'Ao receber intimação para depor, antes de comparecer; logo depois de uma prisão ou de um mandado de busca; e assim que chegar a citação. Os prazos da defesa são curtos, e o que se diz no primeiro depoimento acompanha o caso até o fim.', '["vinicius-lisboa"]', 50, true),
  ('imobiliario', 'Direito Imobiliário', 'Compra e venda, análise de documentos do imóvel, locação, distrato, usucapião e regularização registral.', 'O imóvel costuma ser o maior patrimônio de uma família ou de uma empresa, e o problema quase sempre nasce antes da assinatura: matrícula com pendência, vendedor com dívida, contrato que não diz o que as partes combinaram. Atuamos na prevenção — conferindo documentos e redigindo contratos — e no conflito, quando ele já existe.', '["Análise de matrícula, certidões e documentos antes da compra","Contratos de compra e venda, permuta e promessa","Locação residencial e comercial, despejo e renovatória","Atraso na entrega de obra e distrato com construtora","Usucapião judicial e extrajudicial","Regularização de imóvel, escritura e registro"]', 'Antes de assinar o contrato ou dar o sinal, quando ainda dá para conferir a matrícula e mudar o texto. E assim que surgir o atraso, a inadimplência ou a disputa sobre a posse — documento reunido cedo vale mais.', '["guilherme-fonseca"]', 60, true);
