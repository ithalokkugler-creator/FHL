-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- Marca FL
-- =============================================================================
--
-- Com a saída do Marlon (out/2026), a sociedade deixa de se apresentar como
-- FHL — Fonseca Hespanha Lisboa — e passa a Fonseca Lisboa Advocacia (FL).
-- O código já usa o nome novo; isto troca o antigo nos textos editáveis que
-- moram no banco: o modelo da mensagem de cobrança, as publicações e as
-- campanhas do site (inclusive as que a equipe tenha escrito no módulo Site).
--
-- Fica de fora o que é registro: documentos e recibos já gerados, histórico,
-- auditoria e mensagens já enviadas continuam com o nome da época.

create function pg_temp.marca_fl(t text) returns text
language sql immutable as $$
  select replace(replace(replace(t,
    'FHL Advocacia — Fonseca Hespanha Lisboa', 'Fonseca Lisboa Advocacia'),
    'FHL Advocacia', 'Fonseca Lisboa Advocacia'),
    'Fonseca Hespanha Lisboa', 'Fonseca Lisboa')
$$;

create function pg_temp.marca_fl(j jsonb) returns jsonb
language sql immutable as $$
  select pg_temp.marca_fl(j::text)::jsonb
$$;

update public.config_financeiro
   set mensagem_cobranca = pg_temp.marca_fl(mensagem_cobranca)
 where mensagem_cobranca ~ 'FHL Advocacia|Fonseca Hespanha Lisboa';

update public.publicacoes
   set titulo = pg_temp.marca_fl(titulo),
       resumo = pg_temp.marca_fl(resumo),
       autor  = pg_temp.marca_fl(autor),
       corpo  = pg_temp.marca_fl(corpo)
 where concat_ws(' ', titulo, resumo, autor, corpo) ~ 'FHL Advocacia|Fonseca Hespanha Lisboa';

update public.campanhas
   set rotulo     = pg_temp.marca_fl(rotulo),
       titulo     = pg_temp.marca_fl(titulo),
       subtitulo  = pg_temp.marca_fl(subtitulo),
       descricao  = pg_temp.marca_fl(descricao),
       whatsapp   = pg_temp.marca_fl(whatsapp),
       prazo      = pg_temp.marca_fl(prazo),
       situacoes  = pg_temp.marca_fl(situacoes),
       direitos   = pg_temp.marca_fl(direitos),
       passos     = pg_temp.marca_fl(passos),
       documentos = pg_temp.marca_fl(documentos),
       faq        = pg_temp.marca_fl(faq)
 where to_jsonb(campanhas)::text ~ 'FHL Advocacia|Fonseca Hespanha Lisboa';
