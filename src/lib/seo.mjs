// SEO — o que vai no <head> para buscadores e redes sociais.
//
// Vale para todas as páginas:
//
//   · URL absoluta no canonical, no og:url e no og:image. WhatsApp, Facebook
//     e LinkedIn ignoram og:image relativa — a prévia do link saía sem imagem.
//   · Imagem de compartilhamento própria nas páginas com `og` (artigos e
//     campanhas), quando assets/img/og/<caminho da página>.png existe — gerada
//     por `npm run og`. Até lá, a imagem padrão do site. O `?v=` na URL muda
//     junto com o cartão: WhatsApp e Facebook guardam a prévia por URL e, sem
//     ele, continuariam mostrando o título antigo.
//   · JSON-LD montado com JSON.stringify. Interpolado à mão, uma aspa num
//     título invalidava o bloco inteiro sem nenhum aviso.
//   · noindex, e nada de canonical, nas páginas que não devem ir ao Google.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AREAS } from '../data/areas.mjs';
import {
  DOMINIO, EMAIL, ENDERECO, MARCA_LONGA, NAV, RAZAO, REDES, SLOGAN, TEL_HREF,
} from '../data/site.mjs';
import { ROOT, assetExists } from './assets.mjs';
import { attr } from './html.mjs';

const OG_PADRAO = 'assets/img/og.png';
export const OG_MANIFEST = 'assets/img/og/manifest.json';

/** URL absoluta de uma página ou arquivo do site. A home é a raiz. */
export const absUrl = (path) => `${DOMINIO}/${path === 'index.html' ? '' : path}`;

/** Onde fica a imagem de compartilhamento gerada para uma página. */
export const ogImagePath = (pagePath) => `assets/img/og/${pagePath.replace(/\.html$/, '.png')}`;

/** { caminho da página: hash do cartão } — escrito por scripts/og.mjs. */
export function lerOgManifest() {
  try {
    return JSON.parse(readFileSync(join(ROOT, OG_MANIFEST), 'utf8'));
  } catch {
    return {};
  }
}

function ogImage(page) {
  const rel = ogImagePath(page.path);
  if (page.og && assetExists(rel)) {
    const hash = lerOgManifest()[page.path];
    return {
      url: absUrl(rel) + (hash ? `?v=${hash.slice(0, 8)}` : ''),
      alt: `${page.og.label}: ${page.og.title}`,
    };
  }
  return { url: absUrl(OG_PADRAO), alt: RAZAO };
}

export function seoHead(page) {
  const url = absUrl(page.path);
  const imagem = ogImage(page);

  const linhas = [
    page.noindex
      ? '<meta name="robots" content="noindex, follow">'
      : `<link rel="canonical" href="${url}">`,
    '',
    `<meta property="og:type" content="${page.article ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="${MARCA_LONGA}">`,
    '<meta property="og:locale" content="pt_BR">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${attr(page.og?.title ?? page.title)}">`,
    `<meta property="og:description" content="${attr(page.desc)}">`,
    `<meta property="og:image" content="${imagem.url}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${attr(imagem.alt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
  ];

  if (page.article) {
    linhas.push(
      `<meta property="article:published_time" content="${page.article.datetime}">`,
      `<meta property="article:section" content="${attr(page.article.area)}">`,
    );
  }

  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// JSON-LD

function escritorio() {
  const sameAs = Object.values(REDES).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    '@id': `${absUrl('index.html')}#escritorio`,
    name: RAZAO,
    alternateName: MARCA_LONGA,
    description: `${SLOGAN} em Paranaguá — PR.`,
    url: absUrl('index.html'),
    logo: absUrl('assets/img/logo.png'),
    image: absUrl(OG_PADRAO),
    telephone: TEL_HREF,
    email: EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: ENDERECO,
      addressLocality: 'Paranaguá',
      addressRegion: 'PR',
      addressCountry: 'BR',
    },
    areaServed: [
      { '@type': 'City', name: 'Paranaguá' },
      { '@type': 'State', name: 'Paraná' },
    ],
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    }],
    knowsAbout: AREAS.map((a) => a.nome),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function artigo(page) {
  const a = page.article;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.titulo,
    description: a.resumo,
    image: [ogImage(page).url],
    datePublished: a.datetime,
    inLanguage: 'pt-BR',
    articleSection: a.area,
    mainEntityOfPage: absUrl(page.path),
    author: { '@type': 'Person', name: a.autor, url: absUrl('equipe.html') },
    publisher: {
      '@type': 'Organization',
      name: RAZAO,
      logo: { '@type': 'ImageObject', url: absUrl('assets/img/logo.png') },
    },
  };
}

function perguntas(campanha) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: campanha.faq.map(([pergunta, resposta]) => ({
      '@type': 'Question',
      name: pergunta,
      acceptedAnswer: { '@type': 'Answer', text: resposta },
    })),
  };
}

/** Início › seção › página, o caminho que o Google mostra no lugar da URL.
 *  A seção é o item de NAV com o nome da pasta (atuacao/ → Atuação);
 *  campanhas/ não tem índice próprio e fica Início › campanha. */
function trilha(page) {
  const pasta = page.path.split('/')[0];
  const secao = NAV.find(([href]) => href === `${pasta}.html`);
  const itens = [['Início', absUrl('index.html')]];
  if (secao) itens.push([secao[1], absUrl(secao[0])]);
  itens.push([page.name ?? page.title.replace(/ — Fonseca Lisboa Advocacia$/, ''), absUrl(page.path)]);

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: itens.map(([name, item], i) => ({
      '@type': 'ListItem', position: i + 1, name, item,
    })),
  };
}

// `<` escapado: um "</script>" dentro de um texto não fecha o bloco antes da hora.
const script = (obj) =>
  `\n<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n</script>`;

export function jsonLd(page) {
  if (page.noindex) return '';

  const blocos = [];
  if (page.home) blocos.push(escritorio());
  if (page.article) blocos.push(artigo(page));
  if (page.campanha?.faq?.length) blocos.push(perguntas(page.campanha));
  if (page.path.includes('/')) blocos.push(trilha(page));

  return blocos.map(script).join('');
}
