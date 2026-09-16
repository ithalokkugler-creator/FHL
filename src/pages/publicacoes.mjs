import { POSTS } from '../data/posts.mjs';
import { imageSize } from '../lib/assets.mjs';
import { ARROW, attr, nextBlock, page, pageHead, prefix } from '../lib/html.mjs';

/** Item da lista de publicações. `indent` acompanha o recuo do bloco que o contém. */
export function postItem(po, href, indent = '      ') {
  const inner = indent + '  ';
  return `${indent}<a class="post" href="${href}" data-thumb="${po.thumb}">
${inner}<span class="post__date">${po.data}</span>
${inner}<span class="post__title">${po.titulo}</span>
${inner}<span class="post__area">${po.area}</span>
${indent}</a>`;
}

// CARTÃO DE POST DE REDE SOCIAL
//
// Não é o embed oficial, de propósito. O embed do Instagram carrega script e
// cookies da Meta assim que o artigo abre — antes de qualquer consentimento,
// ao contrário do que o banner de cookies promete — e deixa a página lenta.
// O cartão é HTML do próprio site: imagem hospedada aqui, legenda e link.
// Nada de terceiros carrega até o visitante clicar.
const REDES_SOCIAIS = {
  instagram: {
    nome: 'Instagram',
    icone:
      '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>',
  },
  facebook: {
    nome: 'Facebook',
    icone:
      '<path fill="currentColor" d="M13.6 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.6 1.6-1.6h1.7V3.1a23 23 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3v2.3H7.4v3.2h2.8V21z"/>',
  },
  linkedin: {
    nome: 'LinkedIn',
    icone:
      '<path fill="currentColor" d="M3.5 9h3.8v12H3.5zM5.4 3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM9.6 9h3.6v1.7h.1c.5-1 1.8-2 3.6-2 3.9 0 4.6 2.5 4.6 5.8V21h-3.8v-5.8c0-1.4 0-3.2-1.9-3.2s-2.2 1.5-2.2 3.1V21H9.6z"/>',
  },
};

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>';

function cartaoSocial(rede, post) {
  const { nome, icone } = REDES_SOCIAIS[rede];
  // Imagem enviada pela área dos advogados não existe em assets/: ela é
  // baixada do Supabase durante o build e já chega com o tamanho medido
  // (src/data/conteudo.mjs). As que nasceram no repositório são medidas aqui.
  const { width, height } = post.width ? post : imageSize(post.imagem);
  const play = post.video
    ? `\n            <span class="social-card__play" aria-hidden="true">${PLAY}</span>`
    : '';

  // Artigos ficam em publicacoes/, um nível abaixo da raiz.
  return `      <aside class="social-card r-rise" aria-label="Publicação no ${nome}">
        <a class="social-card__link" href="${attr(post.url)}" target="_blank" rel="noopener noreferrer">
          <span class="social-card__media">
            <img src="${prefix(1)}${post.imagem}" alt="${attr(post.alt ?? '')}" width="${width}" height="${height}" loading="lazy" decoding="async">${play}
          </span>
          <span class="social-card__body">
            <span class="social-card__head">
              <svg class="social-card__icon" viewBox="0 0 24 24" aria-hidden="true">${icone}</svg>
              ${nome}
            </span>
            <span class="social-card__caption">${post.legenda}</span>
            <span class="link-arrow">Ver no ${nome} ${ARROW}</span>
          </span>
        </a>
      </aside>`;
}

/** Renderiza os blocos [tipo, valor] de `corpo` (ver src/data/posts.mjs). */
function renderCorpo(corpo, slug) {
  const parts = [];
  for (const [kind, val] of corpo) {
    if (kind === 'p') {
      parts.push(`      <p>${val}</p>`);
    } else if (kind === 'h2') {
      parts.push(`      <h2>${val}</h2>`);
    } else if (kind === 'pq') {
      parts.push(`      <blockquote class="pullquote">${val}</blockquote>`);
    } else if (kind === 'ul') {
      const lis = val.map((i) => `        <li>${i}</li>`).join('\n');
      parts.push(`      <ul>\n${lis}\n      </ul>`);
    } else if (Object.hasOwn(REDES_SOCIAIS, kind)) {
      parts.push(cartaoSocial(kind, val));
    } else {
      // Um tipo digitado errado sumia do artigo sem aviso.
      throw new Error(`Publicação "${slug}": bloco "${kind}" não existe (ver src/data/posts.mjs)`);
    }
  }
  return parts.join('\n');
}

export function buildPublicacoesIndex() {
  const items = POSTS.map((po) => postItem(po, `publicacoes/${po.slug}.html`)).join('\n');

  const body = pageHead(
    'Publicações', 'O que estamos escrevendo',
    'Conteúdo informativo sobre as questões que mais aparecem na prática. ' +
    'Nada aqui substitui a análise do seu caso concreto.'
  ) + `

  <section class="section publicacoes">
    <div class="wrap">
${items}
    </div>
  </section>

` + nextBlock('Tem uma dúvida específica?', 'contato.html', 'Fale com o escritório');

  return page({
    path: 'publicacoes.html',
    title: 'Publicações — FHL Advocacia',
    desc: 'Artigos da FHL Advocacia sobre direito trabalhista, previdenciário, do consumidor e cível.',
    body,
  });
}

export function buildPost(post) {
  const corpo = renderCorpo(post.corpo, post.slug);

  // Os outros artigos são irmãos na mesma pasta, daí o href simples.
  const outros = POSTS.filter((x) => x.slug !== post.slug);
  const outrosHtml = outros.map((o) => postItem(o, `${o.slug}.html`)).join('\n');

  const body = `  <section class="page-head">
    <div class="wrap page-head__inner">
      <p class="label" data-reveal="rise">${post.area}</p>
      <h1 class="h1 page-head__title page-head__title--article r-mask" data-reveal="mask">${post.titulo}</h1>
      <p class="lead" data-reveal="rise">${post.resumo}</p>
    </div>
  </section>

  <article class="section">
    <div class="wrap grid">
      <div style="grid-column:3 / span 8">
        <div class="article-meta">
          <span>${post.autor}</span>
          <time datetime="${post.datetime}">${post.data}</time>
          <span>${post.area}</span>
        </div>

        <div class="article-body" data-reveal="rise-group">
${corpo}
        </div>

        <p class="small text-muted" style="margin-top:var(--s-6);max-width:60ch">
          Este texto tem finalidade informativa e não constitui consulta jurídica.
          Cada situação depende de análise específica.
        </p>
      </div>
    </div>
  </article>

  <section class="section section--fn publicacoes">
    <div class="wrap">
      <p class="label" data-reveal="rise" style="margin-bottom:var(--s-4)">Continue lendo</p>
${outrosHtml}
    </div>
  </section>

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato', 1);

  return page({
    path: `publicacoes/${post.slug}.html`,
    title: `${post.titulo} — FHL Advocacia`,
    desc: post.resumo,
    body,
    depth: 1,
    article: post,
    name: post.titulo,
    og: { label: post.area, title: post.titulo },
  });
}
