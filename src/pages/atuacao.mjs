import { AREAS, areasComNomesOriginais } from '../data/areas.mjs';
import { EQUIPE } from '../data/equipe.mjs';
import { ARROW, nextBlock, page, pageHead, textoHtml } from '../lib/html.mjs';
import { assinatura } from '../partials/equipe.mjs';
import { campanhasAtivas, campanhasCallout } from './campanhas.mjs';

/** Cartão do índice de áreas. `href` varia: da raiz ou de dentro de atuacao/. */
function indexItem(a, href) {
  return `      <a class="index-item" href="${href}">
        <span class="index-item__num numeral">${a.num}</span>
        <span class="index-item__title">${textoHtml(a.nome)}</span>
        <span class="index-item__text">${textoHtml(a.resumo)}</span>
        <span class="link-arrow">Ver ${ARROW}</span>
      </a>`;
}

export function buildAtuacaoIndex() {
  const items = AREAS.map((a) => indexItem(a, `atuacao/${a.slug}.html`)).join('\n');
  const originais = areasComNomesOriginais();

  const body = pageHead(
    'Atuação',
    originais ? 'Seis frentes de atuação' : 'Áreas de atuação',
    originais
      ? 'Trabalhista, previdenciário, consumidor, cível, criminal e imobiliário: as questões ' +
        'que mais chegam ao escritório, do fim de um contrato de trabalho à compra de um imóvel.'
      : 'Conheça as áreas em que o escritório atua em Paranaguá e região.'
  ) + (items ? `

  <section class="section">
    <div class="wrap">
      <div class="index-list" data-reveal="rise-group">
${items}
      </div>
    </div>
  </section>

` : '') + nextBlock('Não sabe por onde começar?', 'contato.html', 'Descreva sua situação');

  return page({
    path: 'atuacao.html',
    title: 'Atuação — Fonseca Lisboa Advocacia',
    desc: originais
      ? 'Direito Trabalhista, Previdenciário, do Consumidor, Cível, Criminal e Imobiliário em Paranaguá — PR.'
      : 'Áreas de atuação da Fonseca Lisboa Advocacia em Paranaguá — PR.',
    body,
  });
}

export function buildArea(area) {
  const itens = area.itens.map((i) => `          <li class="r-rise">${textoHtml(i)}</li>`).join('\n');

  const advogados = EQUIPE.filter((m) => area.advogados.includes(m.slug));
  const quemAtende = advogados.length ? `

  <section class="section section--fn area-equipe">
    <div class="wrap grid">
      <div class="area__side">
        <p class="label" data-reveal="rise">Quem atende</p>
        <h2 class="h2 area__h2" data-reveal="rise">Advogados nesta área</h2>
      </div>
      <div class="area__main assinaturas" data-reveal="rise-group">
${advogados.map((m) => `          <div class="r-rise">${assinatura(m, 1)}</div>`).join('\n')}
      </div>
    </div>
  </section>` : '';

  // "Outras áreas" — os vizinhos são irmãos na mesma pasta, daí o href simples.
  const outras = AREAS.filter((a) => a.slug !== area.slug);
  const outrasHtml = outras.map((o) => indexItem(o, `${o.slug}.html`)).join('\n');

  // Campanha em andamento na mesma área: quem chega à página da área pela
  // busca encontra a campanha, e a campanha ganha um link interno.
  const campanhaHtml = campanhasCallout(
    campanhasAtivas().filter((c) => c.area === area.slug), { depth: 1 }
  );

  const body = pageHead('Atuação · ' + area.num, textoHtml(area.nome), textoHtml(area.intro), 1) + `

  <section class="section section--fn">
    <div class="wrap grid">
      <div class="area__side">
        <p class="label" data-reveal="rise">O que fazemos</p>
        <h2 class="h2 area__h2" data-reveal="rise">Principais demandas</h2>
      </div>
      <ul class="checklist area__main" data-reveal="rise-group">
${itens}
      </ul>
    </div>
  </section>

  <section class="section section--fn is-light">
    <div class="wrap grid">
      <div class="area__side">
        <p class="label" data-reveal="rise">Quando procurar</p>
        <h2 class="h2 area__h2" data-reveal="rise">O momento certo</h2>
      </div>
      <div class="area__main" data-reveal="rise-group">
        <p class="lead area__quando r-rise">${textoHtml(area.quando)}</p>
      </div>
    </div>
  </section>${quemAtende}
${campanhaHtml}${outrasHtml ? `
  <section class="section">
    <div class="wrap">
      <p class="label" data-reveal="rise" style="margin-bottom:var(--s-4)">Outras áreas</p>
      <div class="index-list" data-reveal="rise-group">
${outrasHtml}
      </div>
    </div>
  </section>

` : ''}` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato', 1);

  return page({
    path: `atuacao/${area.slug}.html`,
    // A cidade no título: é assim que se busca advogado ("advogado trabalhista
    // Paranaguá"), e o título é o que o Google mais pesa na página.
    title: `${area.nome} em Paranaguá — Fonseca Lisboa Advocacia`,
    desc: area.resumo,
    body,
    depth: 1,
    name: area.nome,
  });
}
