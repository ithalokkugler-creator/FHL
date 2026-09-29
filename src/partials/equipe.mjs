// Retratos e cartões da equipe — home, equipe.html, páginas de área e o fim de
// cada artigo.
//
// RETRATO TIPOGRÁFICO
// Até o ensaio fotográfico existir, cada advogado é representado pelas
// iniciais em serifada e um filete — o traço vertical da logomarca, entre o
// monograma e os nomes —, numa das três cores de acento do site. Substitui a
// silhueta genérica de "usuário sem foto", que lia como página inacabada.
// Foto de banco de imagens continua fora de questão. Com `foto` preenchida em
// src/data/equipe.mjs, a foto entra no lugar sem mexer em mais nada.

import { attr, prefix } from '../lib/html.mjs';

/** Miolo da moldura 4:5 (ou quadrada, na versão compacta). */
export function retrato(m, depth = 0) {
  if (m.foto) {
    return `<img class="retrato__foto" src="${prefix(depth)}${m.foto}" alt="${attr(m.completo)}" loading="lazy" decoding="async">`;
  }
  return `<span class="retrato retrato--${m.tom ?? 'teal'}" aria-hidden="true">` +
    `<span class="retrato__filete"></span><span class="retrato__ini">${m.ini}</span></span>`;
}

/** Cartão da home: nome, inscrição e áreas, com link para o perfil completo. */
export function cartaoResumo(m) {
  return `        <a class="equipe__card r-wipe" href="equipe.html#${m.slug}">
          <div class="equipe__media">${retrato(m)}</div>
          <div class="equipe__id">
            <h3 class="h3 equipe__name">${m.nome}</h3>
            <p class="equipe__oab">${m.oab}</p>
          </div>
          <hr class="equipe__rule">
          <p class="equipe__block-text">${m.atuacao}</p>
        </a>`;
}

/** Cartão de equipe.html, com o perfil. O id é a âncora dos outros links. */
export function cartaoPerfil(m) {
  return `        <article class="equipe__card r-wipe" id="${m.slug}">
          <div class="equipe__media">${retrato(m)}</div>
          <div class="equipe__id">
            <h2 class="h3 equipe__name">${m.nome}</h2>
            <p class="equipe__full">${m.completo}</p>
            <p class="equipe__oab">${m.oab}</p>
          </div>
          <hr class="equipe__rule">
          <div class="equipe__block">
            <p class="equipe__block-label">Atuação</p>
            <p class="equipe__block-text">${m.atuacao}</p>
          </div>
          <div class="equipe__block">
            <p class="equipe__block-label">Perfil</p>
            <p class="equipe__block-text">${m.perfil}</p>
          </div>
        </article>`;
}

/**
 * Assinatura compacta: retrato pequeno, nome e inscrição, com link para o
 * perfil. Usada em "Quem atende nesta área" e no fim dos artigos.
 */
export function assinatura(m, depth = 0, { tag = 'a' } = {}) {
  const href = tag === 'a' ? ` href="${prefix(depth)}equipe.html#${m.slug}"` : '';
  return `<${tag} class="assinatura"${href}>
            <span class="assinatura__media">${retrato(m, depth)}</span>
            <span class="assinatura__txt">
              <span class="assinatura__nome">${m.nome}</span>
              <span class="assinatura__oab">${m.oab}</span>
            </span>
          </${tag}>`;
}
