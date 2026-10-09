import { advogadoPorNome } from '../data/equipe.mjs';
import { POSTS } from '../data/posts.mjs';
import { imageSize } from '../lib/assets.mjs';
import { ARROW, attr, nextBlock, page, pageHead, prefix } from '../lib/html.mjs';
import { ICONE } from '../lib/icones.mjs';
import { absUrl } from '../lib/seo.mjs';
import { assinatura } from '../partials/equipe.mjs';

/**
 * Item da lista de publicações. `indent` acompanha o recuo do bloco que o
 * contém. `resumo` acrescenta a linha fina e o autor — no índice, onde a lista
 * é o conteúdo da página; na home e no "continue lendo" ela fica enxuta.
 */
export function postItem(po, href, indent = '      ', { resumo = false } = {}) {
  const inner = indent + '  ';
  const extra = resumo
    ? `\n${inner}  <span class="post__resumo">${po.resumo}</span>` +
      `\n${inner}  <span class="post__autor">${po.autor}</span>`
    : '';
  return `${indent}<a class="post${resumo ? ' post--resumo' : ''}" href="${href}" data-thumb="${po.thumb}">
${inner}<span class="post__date">${po.data}</span>
${inner}<span class="post__main">
${inner}  <span class="post__title">${po.titulo}</span>${extra}
${inner}</span>
${inner}<span class="post__area">${po.area}</span>
${indent}</a>`;
}

/** Minutos de leitura, a 200 palavras por minuto — a média para texto corrido. */
function minutosDeLeitura(corpo) {
  const texto = corpo.map(([tipo, valor]) => {
    if (Array.isArray(valor)) return valor.join(' ');
    if (typeof valor === 'string') return valor;
    return valor?.legenda ?? '';
  }).join(' ').replace(/<[^>]+>/g, ' ');
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}

/**
 * Compartilhar: só links. Nenhum botão oficial de rede social — eles carregam
 * script e cookies de terceiros assim que a página abre. O de copiar o link é
 * ligado em site.js e, sem JS, simplesmente não aparece.
 */
function compartilhar(post, path) {
  const url = absUrl(path);
  const u = encodeURIComponent(url);
  const alvo = 'target="_blank" rel="noopener noreferrer"';
  return `        <div class="compartilhar">
          <p class="label label--mute">Compartilhe</p>
          <div class="compartilhar__links">
            <a class="compartilhar__link" href="https://wa.me/?text=${encodeURIComponent(`${post.titulo} ${url}`)}" ${alvo} aria-label="Compartilhar no WhatsApp">${ICONE.whatsapp}</a>
            <a class="compartilhar__link" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" ${alvo} aria-label="Compartilhar no LinkedIn">${ICONE.linkedin}</a>
            <a class="compartilhar__link" href="https://www.facebook.com/sharer/sharer.php?u=${u}" ${alvo} aria-label="Compartilhar no Facebook">${ICONE.facebook}</a>
            <button class="compartilhar__link compartilhar__copiar" type="button" data-copiar="${attr(url)}" hidden>${ICONE.link}<span>Copiar link</span></button>
          </div>
        </div>`;
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
  const items = POSTS.map((po) => postItem(po, `publicacoes/${po.slug}.html`, '      ', { resumo: true })).join('\n');

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
    title: 'Publicações — Fonseca Lisboa Advocacia',
    desc: 'Artigos da Fonseca Lisboa Advocacia sobre direito trabalhista, previdenciário, do consumidor e cível.',
    body,
  });
}

export function buildPost(post) {
  const corpo = renderCorpo(post.corpo, post.slug);
  const path = `publicacoes/${post.slug}.html`;

  // Os outros artigos são irmãos na mesma pasta, daí o href simples.
  const outros = POSTS.filter((x) => x.slug !== post.slug);
  const outrosHtml = outros.map((o) => postItem(o, `${o.slug}.html`)).join('\n');
  const continueLendo = outros.length ? `

  <section class="section section--fn publicacoes">
    <div class="wrap">
      <p class="label" data-reveal="rise" style="margin-bottom:var(--s-4)">Continue lendo</p>
${outrosHtml}
    </div>
  </section>` : '';

  // Quem escreveu: com par na equipe, retrato, inscrição e link para o perfil.
  const adv = advogadoPorNome(post.autor);
  const autor = `        <aside class="autor" aria-label="Quem escreveu">
          <p class="label label--mute">Quem escreveu</p>
          ${adv ? assinatura(adv, 1) : `<p class="assinatura__nome">${post.autor}</p>`}
        </aside>`;

  // O cabeçalho do artigo fica na mesma coluna do texto: título à esquerda da
  // página e corpo recuado liam como duas páginas diferentes.
  const body = `  <section class="page-head page-head--article">
    <div class="wrap grid">
      <div class="article-col page-head__inner">
        <p class="label" data-reveal="rise"><a class="link" href="../publicacoes.html">Publicações</a> · ${post.area}</p>
        <h1 class="h1 page-head__title page-head__title--article r-mask" data-reveal="mask">${post.titulo}</h1>
        <p class="lead" data-reveal="rise">${post.resumo}</p>
        <div class="article-meta" data-reveal="rise">
          <span>${post.autor}</span>
          <time datetime="${post.datetime}">${post.data}</time>
          <span>${minutosDeLeitura(post.corpo)} min de leitura</span>
        </div>
      </div>
    </div>
  </section>

  <article class="section article">
    <div class="wrap grid">
      <div class="article-col">
        <div class="article-body" data-reveal="rise-group">
${corpo}
        </div>

        <p class="article-aviso">
          Este texto tem finalidade informativa e não constitui consulta jurídica.
          Cada situação depende de análise específica.
        </p>

        <div class="article-fim">
${autor}
${compartilhar(post, path)}
        </div>
      </div>
    </div>
  </article>${continueLendo}

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato', 1);

  return page({
    path,
    title: `${post.titulo} — Fonseca Lisboa Advocacia`,
    desc: post.resumo,
    body,
    depth: 1,
    article: post,
    name: post.titulo,
    og: { label: post.area, title: post.titulo },
  });
}
