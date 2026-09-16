// SHELL — o invólucro único de todas as páginas.
//
// Cumpre o papel de `src/layouts/Base.astro`: head, header, cortina de menu,
// transição, rodapé, cookies, WhatsApp, grain e scripts. Editar o cabeçalho ou
// o rodapé aqui atualiza o site inteiro, em vez de manter dezesseis cópias
// divergentes.

import { AREAS } from '../data/areas.mjs';
import {
  CIDADE, EMAIL, ENDERECO, NAV, OAB, RAZAO, SLOGAN, TEL, TEL_HREF, whatsappUrl,
} from '../data/site.mjs';
import { attr, prefix } from '../lib/html.mjs';
import { jsonLd, seoHead } from '../lib/seo.mjs';

export function shell(page) {
  const p = prefix(page.depth);

  const menuItems = NAV.map(([href, label]) =>
    `        <li class="menu__item"><a class="menu__link" href="${p}${href}">${label}</a>` +
    `<span class="menu__link-underline"></span></li>`
  ).join('\n');

  const areasFooter = AREAS.map((a) =>
    `          <li><a class="link" href="${p}atuacao/${a.slug}.html">${a.nome}</a></li>`
  ).join('\n');

  const navFooter = NAV.slice(1).map(([href, label]) =>
    `          <li><a class="link" href="${p}${href}">${label}</a></li>`
  ).join('\n');

  let scripts = `<script src="${p}assets/vendor/gsap.min.js"></script>
<script src="${p}assets/vendor/ScrollTrigger.min.js"></script>
<script src="${p}assets/vendor/lenis.min.js"></script>
<script>if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);</script>
<script src="${p}assets/js/motion.js"></script>`;

  // hero-gl.js só na home (é a única página com a cena WebGL).
  // home.js vai em TODAS: a contagem de números (escritorio.html) e a
  // miniatura das publicações também vivem lá, e cada função já retorna
  // cedo quando o elemento não existe na página.
  if (page.home) scripts += `\n<script src="${p}assets/js/hero-gl.js"></script>`;
  scripts += `\n<script src="${p}assets/js/home.js"></script>`;
  scripts += `\n<script src="${p}assets/js/site.js"></script>`;

  let loader = '';
  if (page.home) {
    loader = `
<div class="loader" aria-hidden="true">
  <div class="loader__panel loader__panel--top"></div>
  <div class="loader__panel loader__panel--bottom"></div>
  <div class="loader__inner">
    <img class="loader__logo" src="${p}assets/img/logo.png" alt="" width="64" height="111">
    <div class="loader__mark">FHL</div>
    <div class="loader__bar"><i></i></div>
  </div>
</div>`;
  }

  const preload =
    `<link rel="preload" href="${p}assets/fonts/galano-bold.woff2" as="font" type="font/woff2" crossorigin>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>${attr(page.title)}</title>
<meta name="description" content="${attr(page.desc)}">
<meta name="theme-color" content="#0C1917">
${seoHead(page)}

<link rel="icon" href="${p}assets/img/favicon.png" type="image/png">
${preload}
<link rel="stylesheet" href="${p}assets/css/tokens.css">
<link rel="stylesheet" href="${p}assets/css/base.css">
<link rel="stylesheet" href="${p}assets/css/components.css">
<link rel="stylesheet" href="${p}assets/css/sections.css">

<script>
/* Estados iniciais de revelação só existem com JS ativo — sem JS nada fica escondido.
   REDE DE SEGURANÇA: se o GSAP não carregar (CDN bloqueado, rede caindo, bloqueador
   de scripts), a classe \`js\` permaneceria e os títulos ficariam visibility:hidden
   PARA SEMPRE. Passados 3s sem o site ter inicializado, devolvemos a página ao
   estado sem-JS: sem animação, mas com todo o conteúdo legível. */
document.documentElement.classList.add('js');
setTimeout(function () {
  var h = document.documentElement;
  if (!h.classList.contains('ied-ready')) h.classList.remove('js');
}, 3000);
</script>${jsonLd(page)}
</head>

<body>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${loader}
<header class="header">
  <div class="wrap header__inner">
    <a class="brand" href="${p}index.html" aria-label="FHL Advocacia — início">
      <img class="brand__mark" src="${p}assets/img/logo.png" alt="" width="26" height="45">
      <span class="brand__name">FHL<span class="brand__word">Advocacia</span></span>
    </a>
    <div class="header__actions">
      <!-- Contato sempre à mão: era o principal pedido do cliente. -->
      <a class="header__cta" href="${p}contato.html">Fale conosco</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu">
        <span class="menu-toggle__glyph" aria-hidden="true"><i></i><i></i></span>
        <span>Menu</span>
      </button>
    </div>
  </div>
</header>

<div class="menu" id="menu" aria-hidden="true">
  <div class="menu__panel menu__panel--top"></div>
  <div class="menu__panel menu__panel--bottom"></div>
  <div class="menu__seam"></div>

  <div class="wrap menu__inner">
    <nav class="menu__nav" aria-label="Navegação principal">
      <ul>
${menuItems}
      </ul>
    </nav>

    <div class="menu__meta">
      <div>
        <div class="menu__meta-label">Escritório</div>
        <address>${ENDERECO}<br>${CIDADE}</address>
      </div>
      <div>
        <div class="menu__meta-label">Contato</div>
        <a href="tel:${TEL_HREF}">${TEL}</a><br>
        <a href="mailto:${EMAIL}">${EMAIL}</a>
      </div>
      <div>
        <div class="menu__meta-label">Inscrição</div>
        ${OAB}
      </div>
    </div>
  </div>
</div>

<div class="transition" aria-hidden="true">
  <div class="transition__panel transition__panel--top"></div>
  <div class="transition__panel transition__panel--bottom"></div>
</div>

<main id="conteudo">
${page.body}
</main>

<footer class="footer">
  <div class="wrap">
    <div class="footer__top">
      <div class="footer__col">
        <a class="brand" href="${p}index.html">
          <img class="brand__mark" src="${p}assets/img/logo.png" alt="" width="26" height="45">
          <span class="brand__name">FHL<span class="brand__word">Advocacia</span></span>
        </a>
        <p class="footer__slogan">${SLOGAN}</p>
      </div>

      <div class="footer__col">
        <p class="footer__label">Navegação</p>
        <ul class="footer__list">
${navFooter}
        </ul>
      </div>

      <div class="footer__col">
        <p class="footer__label">Atuação</p>
        <ul class="footer__list">
${areasFooter}
        </ul>
      </div>

      <div class="footer__col">
        <p class="footer__label">Contato</p>
        <address>
          ${ENDERECO}<br>
          ${CIDADE}<br>
          <a class="link" href="tel:${TEL_HREF}">${TEL}</a>
        </address>
      </div>
    </div>

    <div class="footer__bottom">
      <p class="footer__oab">${RAZAO} · ${OAB}</p>
      <p>
        <a class="link" href="${p}politica-de-privacidade.html">Política de Privacidade</a>
        &nbsp;·&nbsp;
        <a class="link" href="${p}termos-de-uso.html">Termos de Uso</a>
        &nbsp;·&nbsp;
        <!-- Área dos advogados: mesmo deploy, em /sistema. Discreta e fora do
             Google (noindex no HTML, no cabeçalho e no robots.txt). -->
        <a class="link" href="${p}sistema" rel="nofollow">Área dos advogados</a>
        &nbsp;·&nbsp;
        <span>© <span data-year>2026</span></span>
      </p>
    </div>
  </div>
</footer>

<div class="cookie" role="dialog" aria-label="Preferências de cookies">
  <p class="small">
    Usamos cookies apenas para entender como o site é usado. Nada é ativado
    antes da sua escolha. Detalhes na
    <a class="link" href="${p}politica-de-privacidade.html">Política de Privacidade</a>.
  </p>
  <div class="cookie__actions">
    <button class="btn" type="button" data-cookie="accept">Aceitar</button>
    <button class="btn" type="button" data-cookie="reject">Recusar</button>
  </div>
</div>

<!-- Canal direto sempre visível. Discreto de propósito: nada de pulsar ou
     abrir sozinho — captação agressiva é vedada pelo Provimento 205/2021. -->
<a class="whats" href="${whatsappUrl(page.whatsapp)}" target="_blank" rel="noopener noreferrer"
   aria-label="Conversar com a FHL Advocacia pelo WhatsApp">
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.38c0-4.54 3.7-8.23 8.24-8.23a8.18 8.18 0 0 1 5.82 2.42 8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23z"/>
  </svg>
  <span class="whats__label">WhatsApp</span>
</a>

<div class="grain" aria-hidden="true"></div>

<div class="post-thumb" aria-hidden="true"><div class="post-thumb__art">&amp;</div></div>

${scripts}
</body>
</html>
`;
}
