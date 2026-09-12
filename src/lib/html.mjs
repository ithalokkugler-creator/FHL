// Blocos de HTML reutilizados por várias páginas.
//
// `depth` é a profundidade da página em pastas: 0 para a raiz, 1 para
// atuacao/*.html e publicacoes/*.html. Todo caminho gerado passa por
// `prefix(depth)` para que o site funcione servido de qualquer subdiretório,
// sem depender de URLs absolutas.

/** Prefixo relativo para subir `depth` pastas. */
export const prefix = (depth = 0) => '../'.repeat(depth);

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
    <img class="watermark watermark--right" src="${prefix(depth)}assets/img/logo-watermark.png" alt="" aria-hidden="true">
    <div class="wrap page-head__inner">
      <p class="label" data-reveal="rise">${label}</p>
      <h1 class="h1 page-head__title r-mask" data-reveal="mask">${title}</h1>
      ${leadHtml}
    </div>
  </section>`;
}

/** Faixa de chamada que fecha as páginas internas. */
export function nextBlock(title, href, cta, depth = 0) {
  return `  <section class="next-block">
    <div class="wrap">
      <h2 class="display" style="font-size:var(--t-h1)">${title}</h2>
      ${arrowLink(prefix(depth) + href, cta)}
    </div>
  </section>`;
}

/**
 * Descritor de página consumido pelo shell e pelo build.
 *
 * path    caminho de saída relativo a dist/ (define também a URL)
 * title   <title> e og:title
 * desc    meta description e og:description
 * body    HTML que entra dentro de <main>
 * depth   profundidade em pastas (ver acima)
 * home    true apenas em index.html — liga o loader, a cena WebGL e o JSON-LD
 *         de LegalService
 * article objeto de POSTS quando a página é um artigo — liga o JSON-LD Article
 */
export function page({ path, title, desc, body, depth = 0, home = false, article = null }) {
  return { path, title, desc, body, depth, home, article };
}
