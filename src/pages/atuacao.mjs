import { AREAS } from '../data/areas.mjs';
import { ARROW, nextBlock, page, pageHead } from '../lib/html.mjs';
import { campanhasAtivas } from './campanhas.mjs';

/** Cartão do índice de áreas. `href` varia: da raiz ou de dentro de atuacao/. */
function indexItem(a, href) {
  return `      <a class="index-item" href="${href}">
        <span class="index-item__num numeral">${a.num}</span>
        <span class="index-item__title">${a.nome}</span>
        <span class="index-item__text">${a.resumo}</span>
        <span class="link-arrow">Ver ${ARROW}</span>
      </a>`;
}

export function buildAtuacaoIndex() {
  const items = AREAS.map((a) => indexItem(a, `atuacao/${a.slug}.html`)).join('\n');

  const body = pageHead(
    'Atuação',
    'Quatro frentes de atuação',
    'Trabalhista, previdenciário, consumidor e cível: as questões que mais chegam ' +
    'ao escritório, do fim de um contrato de trabalho à negativa de um benefício do INSS.'
  ) + `

  <section class="section">
    <div class="wrap">
      <div class="index-list" data-reveal="rise-group">
${items}
      </div>
    </div>
  </section>

` + nextBlock('Não sabe por onde começar?', 'contato.html', 'Descreva sua situação');

  return page({
    path: 'atuacao.html',
    title: 'Atuação — FHL Advocacia',
    desc: 'Direito Trabalhista, Previdenciário, do Consumidor e Cível em Paranaguá — PR.',
    body,
  });
}

export function buildArea(area) {
  const itens = area.itens.map((i) => `          <li>${i}</li>`).join('\n');

  // "Outras áreas" — os vizinhos são irmãos na mesma pasta, daí o href simples.
  const outras = AREAS.filter((a) => a.slug !== area.slug);
  const outrasHtml = outras.map((o) => indexItem(o, `${o.slug}.html`)).join('\n');

  // Campanha em andamento na mesma área: quem chega à página da área pela
  // busca encontra a campanha, e a campanha ganha um link interno.
  const campanha = campanhasAtivas().find((c) => c.area === area.slug);
  const campanhaHtml = campanha ? `
  <section class="section section--fn">
    <div class="wrap">
      <a class="campanha-callout" href="../campanhas/${campanha.slug}.html" data-reveal="rise">
        <span class="label">Campanha</span>
        <span class="h3 campanha-callout__title">${campanha.titulo}</span>
        <span class="campanha-callout__text">${campanha.subtitulo}</span>
        <span class="link-arrow">Ver a campanha ${ARROW}</span>
      </a>
    </div>
  </section>
` : '';

  const body = pageHead('Atuação · ' + area.num, area.nome, area.intro, 1) + `

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">O que fazemos</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <div class="prose r-rise">
          <ul>
${itens}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--fn is-light">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">Quando procurar</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <p class="lead r-rise">${area.quando}</p>
      </div>
    </div>
  </section>
${campanhaHtml}
  <section class="section">
    <div class="wrap">
      <p class="label" data-reveal="rise" style="margin-bottom:var(--s-4)">Outras áreas</p>
      <div class="index-list" data-reveal="rise-group">
${outrasHtml}
      </div>
    </div>
  </section>

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato', 1);

  return page({
    path: `atuacao/${area.slug}.html`,
    // A cidade no título: é assim que se busca advogado ("advogado trabalhista
    // Paranaguá"), e o título é o que o Google mais pesa na página.
    title: `${area.nome} em Paranaguá — FHL Advocacia`,
    desc: area.resumo,
    body,
    depth: 1,
    name: area.nome,
  });
}
