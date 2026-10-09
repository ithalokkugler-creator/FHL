// SHELL — o invólucro único de todas as páginas.
//
// Cumpre o papel de `src/layouts/Base.astro`: head, header, cortina de menu,
// transição, rodapé, cookies, WhatsApp, grain e scripts. Editar o cabeçalho ou
// o rodapé aqui atualiza o site inteiro, em vez de manter dezesseis cópias
// divergentes.

import { AREAS } from '../data/areas.mjs';
import { EQUIPE } from '../data/equipe.mjs';
import {
  CIDADE, EMAIL, ENDERECO, HORARIO_CURTO, MAPS, MARCA_LONGA, NAV, OAB, RAZAO, SLOGAN, TEL, TEL_HREF,
  whatsappUrl,
} from '../data/site.mjs';
import { attr, prefix } from '../lib/html.mjs';
import { ICONE } from '../lib/icones.mjs';
import { aberturaLoader, monogramaSvg, nomeSvg } from '../lib/marca.mjs';
import { jsonLd, seoHead } from '../lib/seo.mjs';

export function shell(page) {
  const p = page.raiz ? '/' : prefix(page.depth);

  // Seção atual no menu: a própria página, ou o índice da pasta em que ela
  // está (atuacao/civel.html → Atuação). Leitor de tela ouve "página atual".
  const secao = page.path.includes('/') ? `${page.path.split('/')[0]}.html` : page.path;
  const atual = (href) => {
    if (href === page.path) return ' aria-current="page"';
    return href === secao ? ' aria-current="true"' : '';
  };

  const menuItems = NAV.map(([href, label]) =>
    `        <li class="menu__item"><a class="menu__link" href="${p}${href}"${atual(href)}>${label}</a>` +
    `<span class="menu__link-underline"></span></li>`
  ).join('\n');

  const areasFooter = AREAS.map((a) =>
    `          <li><a class="link" href="${p}atuacao/${a.slug}.html">${a.nome}</a></li>`
  ).join('\n');

  const navFooter = NAV.slice(1).map(([href, label]) =>
    `          <li><a class="link" href="${p}${href}">${label}</a></li>`
  ).join('\n');

  // Provimento 205/2021: identificação de quem responde pelo site. A inscrição
  // da sociedade ainda não existe nos dados (src/data/site.mjs); a de cada
  // advogado, sim — e aparece sempre.
  const inscricoes = EQUIPE.map((m) =>
    `<span class="footer__inscricao">${m.nome} · ${m.oab}</span>`
  ).join('');

  const inscricaoMenu = OAB ? `
      <div>
        <div class="menu__meta-label">Inscrição</div>
        ${OAB}
      </div>` : '';

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
    ${aberturaLoader()}
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
   estado sem-JS: sem animação, mas com todo o conteúdo legível.
   \`ied-boot\` avisa que o site.js já está de pé e tocando o loader da home: dali em
   diante as falhas são dele (o loader tem teto próprio e cai em degradar()). */
document.documentElement.classList.add('js');
setTimeout(function () {
  var h = document.documentElement;
  if (!h.classList.contains('ied-ready') && !h.classList.contains('ied-boot')) h.classList.remove('js');
}, 3000);
</script>${jsonLd(page)}
</head>

<body>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${loader}
<header class="header">
  <div class="wrap header__inner">
    <a class="brand" href="${p}index.html" aria-label="${MARCA_LONGA} — início">
      ${monogramaSvg({ classe: 'brand__mark' })}
      <span class="brand__word">${nomeSvg({ classe: 'brand__nome' })}</span>
    </a>
    <div class="header__actions">
      <!-- Contato sempre à mão: era o principal pedido do cliente. -->
      <a class="header__cta" href="${p}contato.html">Fale conosco</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu">
        <span class="menu-toggle__glyph" aria-hidden="true"><i></i><i></i></span>
        <span class="menu-toggle__label">Menu</span>
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
        <div class="menu__meta-label">Atendimento</div>
        ${HORARIO_CURTO}<br>
        <a href="tel:${TEL_HREF}">${TEL}</a>
      </div>
      <div>
        <div class="menu__meta-label">Contato</div>
        <a href="${whatsappUrl(page.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a><br>
        <a href="mailto:${EMAIL}">${EMAIL}</a>
      </div>${inscricaoMenu}
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
        <a class="brand brand--assinatura" href="${p}index.html">
          <img class="brand__assinatura" src="${p}assets/img/assinatura.svg" alt="${MARCA_LONGA}" width="3285" height="772" loading="lazy">
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
          <ul class="footer__list footer__contato">
            <li><a class="link" href="${MAPS}" target="_blank" rel="noopener noreferrer">${ENDERECO}<br>${CIDADE}</a></li>
            <li><a class="link" href="tel:${TEL_HREF}">${TEL}</a></li>
            <li><a class="link" href="${whatsappUrl(page.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
            <li><a class="link" href="mailto:${EMAIL}">${EMAIL}</a></li>
            <li class="footer__horario">${HORARIO_CURTO}</li>
          </ul>
        </address>
      </div>
    </div>

    <div class="footer__bottom">
      <div class="footer__legal">
        <p class="footer__oab">© <span data-year>2026</span> ${RAZAO}${OAB ? ` · ${OAB}` : ''}</p>
        <p class="footer__inscricoes">${inscricoes}</p>
      </div>
      <p class="footer__links">
        <a class="link" href="${p}politica-de-privacidade.html">Política de Privacidade</a>
        <a class="link" href="${p}termos-de-uso.html">Termos de Uso</a>
        <!-- Área dos advogados: mesmo deploy, em /sistema. Discreta e fora do
             Google (noindex no HTML, no cabeçalho e no robots.txt). -->
        <a class="link" href="${p}sistema" rel="nofollow">Área dos advogados</a>
      </p>
    </div>
  </div>
</footer>

<div class="cookie" role="dialog" aria-label="Preferências de cookies">
  <p class="cookie__text">
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
   aria-label="Conversar com a ${MARCA_LONGA} pelo WhatsApp">
  ${ICONE.whatsapp}
  <span class="whats__label">WhatsApp</span>
</a>

<div class="grain" aria-hidden="true"></div>

<div class="post-thumb" aria-hidden="true"><div class="post-thumb__art">&amp;</div></div>

${scripts}
</body>
</html>
`;
}
