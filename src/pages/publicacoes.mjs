import { POSTS } from '../data/posts.mjs';
import { nextBlock, page, pageHead } from '../lib/html.mjs';

/** Item da lista de publicações. `indent` acompanha o recuo do bloco que o contém. */
export function postItem(po, href, indent = '      ') {
  const inner = indent + '  ';
  return `${indent}<a class="post" href="${href}" data-thumb="${po.thumb}">
${inner}<span class="post__date">${po.data}</span>
${inner}<span class="post__title">${po.titulo}</span>
${inner}<span class="post__area">${po.area}</span>
${indent}</a>`;
}

/** Renderiza os blocos [tipo, valor] de `corpo` (ver src/data/posts.mjs). */
function renderCorpo(corpo) {
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
    desc: 'Artigos sobre contratos, contencioso cível, responsabilidade civil e direito imobiliário.',
    body,
  });
}

export function buildPost(post) {
  const corpo = renderCorpo(post.corpo);

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
  });
}
