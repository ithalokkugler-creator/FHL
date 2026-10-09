// Blocos de HTML reutilizados por várias páginas.
//
// `depth` é a profundidade da página em pastas: 0 para a raiz, 1 para
// atuacao/*.html e publicacoes/*.html. Todo caminho gerado passa por
// `prefix(depth)` para que o site funcione servido de qualquer subdiretório,
// sem depender de URLs absolutas.

import { HORARIO_CURTO, TEL, TEL_HREF, whatsappUrl } from '../data/site.mjs';

/** Prefixo relativo para subir `depth` pastas. */
export const prefix = (depth = 0) => '../'.repeat(depth);

/** Escapa texto para dentro de um atributo HTML. Entidades já escritas nos
 *  dados (`&amp;`) passam intactas, em vez de virar `&amp;amp;`. */
export const attr = (s) => String(s)
  .replace(/&(?!(?:[a-z]+|#\d+|#x[\da-f]+);)/gi, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const ARROW =
  '<svg viewBox="0 0 22 8" fill="none" aria-hidden="true">' +
  '<path class="link-arrow__line" d="M0 4h20" stroke="currentColor"/>' +
  '<path d="M17 1l3.5 3-3.5 3" stroke="currentColor" fill="none"/></svg>';

export function arrowLink(href, text, cls = 'link-arrow') {
  return `<a class="${cls}" href="${href}">${text} ${ARROW}</a>`;
}

/** Cabeçalho padrão das páginas internas. */
export function pageHead(label, title, lead = null, depth = 0) {
  const leadHtml = lead ? `<p class="lead" data-reveal="rise">${lead}</p>` : '';
  return `  <section class="page-head">
    <img class="watermark watermark--right" src="${prefix(depth)}assets/img/marca-dagua.svg" alt="" aria-hidden="true">
    <div class="wrap page-head__inner">
      <p class="label" data-reveal="rise">${label}</p>
      <h1 class="h1 page-head__title r-mask" data-reveal="mask">${title}</h1>
      ${leadHtml}
    </div>
  </section>`;
}

/**
 * Faixa de chamada que fecha as páginas internas.
 *
 * Era um título e um link pequeno — a última coisa da página, justamente onde
 * quem leu até ali decide falar com o escritório. Agora tem o botão, o
 * WhatsApp ao lado e o horário, como o contato da home.
 */
export function nextBlock(title, href, cta, depth = 0) {
  return `  <section class="next-block">
    <img class="watermark watermark--left" src="${prefix(depth)}assets/img/marca-dagua.svg" alt="" aria-hidden="true">
    <div class="wrap next-block__inner">
      <h2 class="display next-block__title r-mask" data-reveal="mask">${title}</h2>
      <div class="next-block__actions" data-reveal="rise">
        <a class="btn" href="${prefix(depth)}${href}" data-magnetic><span class="btn__label">${cta}</span></a>
        <a class="link-arrow" href="${whatsappUrl()}" target="_blank" rel="noopener noreferrer">Conversar pelo WhatsApp ${ARROW}</a>
      </div>
      <p class="next-block__note" data-reveal="rise">${HORARIO_CURTO} · <a class="link" href="tel:${TEL_HREF}">${TEL}</a></p>
    </div>
  </section>`;
}

/**
 * Descritor de página consumido pelo shell, pelo build e por `npm run og`.
 *
 * path     caminho de saída relativo a dist/ (define também a URL)
 * title    <title> e og:title
 * desc     meta description e og:description
 * body     HTML que entra dentro de <main>
 * depth    profundidade em pastas (ver acima)
 * home     true apenas em index.html — liga o loader, a cena WebGL e o JSON-LD
 *          de LegalService
 * article  objeto de POSTS quando a página é um artigo — liga o JSON-LD Article
 * campanha objeto de CAMPANHAS quando a página é uma campanha — liga o FAQPage
 * name     nome curto da página na trilha (breadcrumb) que o Google exibe.
 *          Padrão: o title sem o " — Fonseca Lisboa Advocacia"
 * og       { label, title } — a página ganha imagem de compartilhamento
 *          própria, gerada por `npm run og` (ver src/lib/seo.mjs)
 * noindex  fora do Google e do sitemap (404, campanha fora do período)
 * whatsapp mensagem pré-preenchida no botão flutuante de WhatsApp
 * raiz     caminhos a partir da raiz ("/assets/…") em vez de relativos. Só a
 *          404: ela é servida em qualquer endereço inexistente, inclusive
 *          /atuacao/xyz.html, onde "assets/…" viraria /atuacao/assets/… e a
 *          página abriria sem CSS, sem fontes e sem scripts.
 */
export function page({
  path, title, desc, body, depth = 0, home = false, article = null,
  campanha = null, name = null, og = null, noindex = false, whatsapp = '', raiz = false,
}) {
  return { path, title, desc, body, depth, home, article, campanha, name, og, noindex, whatsapp, raiz };
}
