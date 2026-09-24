// CONTEÚDO EDITÁVEL — de onde saem as publicações e as campanhas
// ==============================================================
//
// Publicação e campanha deixaram de morar só no código: quem escreve é o
// escritório, na área dos advogados (`/sistema`), e o texto fica no Supabase.
// Este arquivo é a ponte. O build chama `carregarConteudo()` uma vez, antes de
// montar qualquer página, e o resto do site continua lendo POSTS e CAMPANHAS
// como sempre leu.
//
// O SITE CONTINUA ESTÁTICO. Ninguém consulta banco no navegador do visitante:
// o que vai ao ar é HTML pronto. É o que mantém o artigo indexável pelo Google
// — a razão de ele existir — e o que impede uma queda do Supabase de derrubar
// o site junto. Em troca, texto salvo na área dos advogados só aparece no site
// depois de um build novo (ver "Publicar" na área, e README.md).
//
// CÓPIA DE SEGURANÇA. src/data/posts.mjs e src/data/campanhas.mjs continuam
// existindo com o conteúdo que o banco recebeu de semente. Se o Supabase não
// responder — no plano gratuito ele PAUSA depois de cerca de uma semana sem
// uso —, o build avisa e gera o site a partir deles, em vez de publicar um
// site sem publicação nenhuma. Não é o mesmo que estar em dia: é melhor do que
// ficar vazio.
//
// SUBSTITUIÇÃO NO LUGAR. As páginas importam POSTS e CAMPANHAS direto
// (src/pages/home.mjs, publicacoes.mjs, campanhas.mjs). Em vez de passar o
// conteúdo por parâmetro por toda essa cadeia, trocamos o conteúdo dos dois
// arrays — é o mesmo objeto em memória para todo mundo, e quem importou
// enxerga o conteúdo carregado. Por isso `carregarConteudo()` precisa rodar
// antes da primeira página ser montada.

import { SUPABASE_CHAVE, SUPABASE_URL } from '../../sistema/js/config.js';
import { imageSizeFrom } from '../lib/assets.mjs';
import { CAMPANHAS } from './campanhas.mjs';
import { POSTS } from './posts.mjs';

/** Onde as imagens enviadas pela área dos advogados entram no site. */
const PASTA_IMAGENS = 'assets/img/publicacoes';

/** Balde do Supabase Storage com as imagens dos cartões de rede social. */
const BALDE = 'site';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** '2026-08-12' → '12 Ago 2026', o formato que aparece no artigo. */
export function dataPorExtenso(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia} ${MESES[Number(mes) - 1]} ${ano}`;
}

/** Tira as chaves nulas: o site trata "sem prazo" como campo ausente. */
const semNulos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

async function buscar(tabela, colunas, ordem) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${tabela}`);
  url.searchParams.set('select', colunas);
  url.searchParams.set('order', ordem);

  // Sem sessão: a chave publicável enxerga só o que está publicado, por RLS
  // (supabase/migrations/20260916120520_conteudo.sql).
  const resposta = await fetch(url, {
    headers: { apikey: SUPABASE_CHAVE, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resposta.ok) {
    throw new Error(`${tabela}: o Supabase respondeu ${resposta.status}`);
  }
  return resposta.json();
}

/**
 * Baixa uma imagem enviada pela área dos advogados.
 *
 * O arquivo vive no Storage do Supabase, mas quem o serve no ar é o site: ele
 * é copiado para dist/assets/img/publicacoes/ como qualquer outro asset. Nada
 * de terceiro carrega na página do artigo, que é a regra do cartão de rede
 * social (ver src/pages/publicacoes.mjs).
 */
async function baixarImagem(objeto) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BALDE}/${objeto}`;
  const resposta = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resposta.ok) {
    throw new Error(`imagem "${objeto}": o Supabase respondeu ${resposta.status}`);
  }
  return Buffer.from(await resposta.arrayBuffer());
}

/**
 * Publicação do banco → objeto de src/data/posts.mjs.
 *
 * `imagens` recebe os arquivos a escrever em dist/. Um bloco de rede social
 * cuja imagem já está no repositório (`assets/…`) passa direto: é o caso dos
 * artigos que nasceram no código.
 */
async function paraPost(linha, imagens) {
  const corpo = [];

  for (const [tipo, valor] of linha.corpo) {
    if (!['instagram', 'facebook', 'linkedin'].includes(tipo) || valor.imagem.startsWith('assets/')) {
      corpo.push([tipo, valor]);
      continue;
    }

    const arquivo = valor.imagem.split('/').pop();
    const rel = `${PASTA_IMAGENS}/${arquivo}`;
    const bytes = await baixarImagem(valor.imagem);
    imagens.push({ rel, bytes });
    // O tamanho sai do próprio arquivo baixado: o <img> reserva o espaço antes
    // de a imagem chegar, e imageSize() não teria onde achá-lo no disco.
    corpo.push([tipo, { ...valor, imagem: rel, ...imageSizeFrom(bytes, rel) }]);
  }

  return {
    slug: linha.slug,
    data: dataPorExtenso(linha.data),
    datetime: linha.data,
    titulo: linha.titulo,
    area: linha.area,
    thumb: linha.thumb,
    autor: linha.autor,
    resumo: linha.resumo,
    corpo,
  };
}

/** Campanha do banco → objeto de src/data/campanhas.mjs. */
const paraCampanha = (linha) => semNulos({
  slug: linha.slug,
  inicio: linha.inicio,
  fim: linha.fim,
  area: linha.area,
  rotulo: linha.rotulo,
  titulo: linha.titulo,
  subtitulo: linha.subtitulo,
  descricao: linha.descricao,
  whatsapp: linha.whatsapp,
  situacoes: linha.situacoes,
  direitos: linha.direitos,
  passos: linha.passos,
  documentos: linha.documentos,
  prazo: linha.prazo,
  faq: linha.faq,
});

function substituir(alvo, novos) {
  alvo.length = 0;
  alvo.push(...novos);
}

/**
 * Enche POSTS e CAMPANHAS com o que está publicado no Supabase.
 *
 * Devolve `{ origem, imagens }`: 'supabase' quando o banco respondeu,
 * 'arquivo' quando o build caiu na cópia de segurança. `imagens` são os
 * arquivos que o build precisa escrever em dist/ ([] no modo arquivo).
 */
export async function carregarConteudo({ quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);
  const imagens = [];

  try {
    const [publicacoes, campanhas] = await Promise.all([
      buscar('publicacoes', 'slug,titulo,resumo,area,autor,data,thumb,corpo', 'data.desc,titulo.asc'),
      buscar('campanhas',
        'slug,rotulo,titulo,subtitulo,descricao,whatsapp,area,inicio,fim,situacoes,direitos,passos,documentos,prazo,faq',
        'inicio.desc.nullslast,titulo.asc'),
    ]);

    // Só troca o conteúdo depois que tudo chegou: um erro no meio deixaria o
    // site com metade do banco e metade do arquivo.
    const posts = [];
    for (const linha of publicacoes) posts.push(await paraPost(linha, imagens));

    substituir(POSTS, posts);
    substituir(CAMPANHAS, campanhas.map(paraCampanha));

    log(`  conteúdo: ${POSTS.length} publicação(ões) e ${CAMPANHAS.length} campanha(s) do Supabase`);
    return { origem: 'supabase', imagens };
  } catch (erro) {
    console.warn(
      `\n  AVISO: não foi possível ler o conteúdo do Supabase — ${erro.message}.\n` +
      '  O site está sendo gerado com a cópia de src/data/posts.mjs e campanhas.mjs,\n' +
      '  que pode estar desatualizada. No plano gratuito o projeto pausa depois de\n' +
      '  uma semana sem uso: reative no painel do Supabase e rode o build de novo.\n'
    );
    return { origem: 'arquivo', imagens: [] };
  }
}
