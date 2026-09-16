// CAMPANHAS — uma página por objeto de src/data/campanhas.mjs.
//
// A ordem das seções segue quem chega de um anúncio ou de um post e decide em
// segundos se aquilo é com ele: a pergunta direta e o WhatsApp logo no topo;
// depois as situações em que a pessoa se reconhece, o que pode ser buscado,
// como funciona, documentos e prazo, dúvidas e, por fim, o contato.

import { AREAS } from '../data/areas.mjs';
import { CAMPANHAS } from '../data/campanhas.mjs';
import { CIDADE, TEL, TEL_HREF, whatsappUrl } from '../data/site.mjs';
import { ARROW, page, prefix } from '../lib/html.mjs';
import { canaisDiretos, contatoForm } from '../partials/contato.mjs';

/** Data de hoje em Paranaguá, AAAA-MM-DD. O build da Vercel roda em UTC. */
export const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** 'agendada' antes do início, 'encerrada' depois do fim, 'ativa' no período. */
export function campanhaStatus(c, dia = hoje()) {
  if (c.inicio && dia < c.inicio) return 'agendada';
  if (c.fim && dia > c.fim) return 'encerrada';
  return 'ativa';
}

export const campanhasAtivas = () => CAMPANHAS.filter((c) => campanhaStatus(c) === 'ativa');

/**
 * Chamada para campanhas ativas — na home e na página da área. Sem campanha
 * no período, não sai nada. `depth` é a profundidade da página que recebe a
 * chamada (ver src/lib/html.mjs). `flushTop` tira o respiro de cima quando a
 * chamada continua a seção anterior, como na home, abaixo das publicações.
 */
export function campanhasCallout(campanhas, { depth = 0, flushTop = false } = {}) {
  if (!campanhas.length) return '';

  const links = campanhas.map((c) => `      <a class="campanha-callout" href="${prefix(depth)}campanhas/${c.slug}.html" data-reveal="rise">
        <span class="label">Campanha</span>
        <span class="h3 campanha-callout__title">${c.titulo}</span>
        <span class="campanha-callout__text">${c.subtitulo}</span>
        <span class="link-arrow">Ver a campanha ${ARROW}</span>
      </a>`).join('\n');

  return `
  <section class="section section--fn${flushTop ? ' section--flush-top' : ''}">
    <div class="wrap">
${links}
    </div>
  </section>
`;
}

// Etapas do atendimento, iguais em toda campanha. `passos` na campanha substitui.
const PASSOS = [
  ['Conte o que aconteceu',
    'Pelo WhatsApp, por telefone ou pelo formulário no fim desta página.'],
  ['Análise dos documentos',
    'É neles que a prova costuma estar. Vemos o que você já tem e o que ainda dá para reunir.'],
  ['Os caminhos possíveis',
    'O que dá para buscar, em quanto tempo e a que custo — dito com clareza desde o início.'],
  ['Acompanhamento',
    'Do primeiro protocolo ao desfecho, com um advogado responsável pelo seu caso.'],
];

const lista = (itens, indent) => itens.map((i) => `${indent}<li class="r-rise">${i}</li>`).join('\n');

export function buildCampanha(c) {
  const status = campanhaStatus(c);
  const area = c.area ? AREAS.find((a) => a.slug === c.area) : null;
  if (c.area && !area) {
    throw new Error(`Campanha "${c.slug}": a área "${c.area}" não existe em src/data/areas.mjs`);
  }
  const P = prefix(1);

  // Aviso de encerrada: sai pronto no HTML se a campanha já tinha acabado no
  // dia do build; senão vai escondido, e site.js o mostra quando a data passar.
  const aviso = c.fim ? `
      <p class="campanha-aviso" data-campanha-fim="${c.fim}"${status === 'encerrada' ? '' : ' hidden'}>
        Esta campanha foi encerrada em ${c.fim.split('-').reverse().join('/')}, mas o
        escritório continua atendendo casos como este.
      </p>` : '';

  const hero = `  <section class="page-head campanha-hero">
    <img class="watermark watermark--right" src="${P}assets/img/logo-watermark.png" alt="" aria-hidden="true">
    <div class="wrap page-head__inner">${aviso}
      <p class="label" data-reveal="rise">${c.rotulo}</p>
      <h1 class="h1 page-head__title campanha-hero__title r-mask" data-reveal="mask">${c.titulo}</h1>
      <p class="lead" data-reveal="rise">${c.subtitulo}</p>
      <div class="campanha-hero__cta" data-reveal="rise">
        <a class="btn" href="${whatsappUrl(c.whatsapp)}" target="_blank" rel="noopener noreferrer" data-magnetic>
          <span class="btn__label">Falar pelo WhatsApp</span>
        </a>
        <a class="link-arrow" href="#contato">Prefiro escrever ${ARROW}</a>
      </div>
      <p class="campanha-hero__note" data-reveal="rise">
        ${CIDADE} e região · Segunda a sexta, das 9h às 18h ·
        <a class="link" href="tel:${TEL_HREF}">${TEL}</a>
      </p>
    </div>
  </section>`;

  const situacoes = c.situacoes?.length ? `

  <section class="section section--fn">
    <div class="wrap grid">
      <div class="campanha__side">
        <p class="label" data-reveal="rise">Para quem é</p>
        <h2 class="h2 campanha__h2" data-reveal="rise">Você pode ter direitos se</h2>
      </div>
      <ul class="checklist campanha__main" data-reveal="rise-group">
${lista(c.situacoes, '        ')}
      </ul>
    </div>
  </section>` : '';

  const direitos = c.direitos?.length ? `

  <section class="section section--fn is-light">
    <div class="wrap">
      <p class="label" data-reveal="rise">O que pode ser buscado</p>
      <h2 class="h2 campanha__h2" data-reveal="rise">Direitos que podem existir no seu caso</h2>
      <div class="campanha-cards" data-reveal="rise-group">
${c.direitos.map(([titulo, texto]) => `        <div class="campanha-card r-rise">
          <h3 class="h3 campanha-card__title">${titulo}</h3>
          <p class="campanha-card__text">${texto}</p>
        </div>`).join('\n')}
      </div>
    </div>
  </section>` : '';

  const passos = `

  <section class="section section--fn">
    <div class="wrap">
      <p class="label" data-reveal="rise">Como funciona</p>
      <h2 class="h2 campanha__h2" data-reveal="rise">Do primeiro contato ao acompanhamento</h2>
      <ol class="campanha-steps" data-reveal="rise-group">
${(c.passos ?? PASSOS).map(([titulo, texto], i) => `        <li class="campanha-step r-rise">
          <span class="campanha-step__num numeral">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="h3 campanha-step__title">${titulo}</h3>
          <p class="campanha-step__text">${texto}</p>
        </li>`).join('\n')}
      </ol>
    </div>
  </section>`;

  const documentos = c.documentos?.length ? `

  <section class="section section--fn campanha-docs">
    <div class="wrap grid">
      <div class="campanha__side">
        <p class="label" data-reveal="rise">Para a primeira conversa</p>
        <h2 class="h2 campanha__h2" data-reveal="rise">Documentos que ajudam</h2>${c.prazo ? `
        <p class="campanha-prazo" data-reveal="rise">${c.prazo}</p>` : ''}
      </div>
      <div class="campanha__main" data-reveal="rise-group">
        <ul class="checklist checklist--doc">
${lista(c.documentos, '          ')}
        </ul>
        <p class="campanha__nota r-rise">
          Não tem todos? Fale com o escritório mesmo assim — parte deles pode ser
          reunida depois.
        </p>
      </div>
    </div>
  </section>` : '';

  const faq = c.faq?.length ? `

  <section class="section section--fn">
    <div class="wrap grid">
      <div class="campanha__side">
        <p class="label" data-reveal="rise">Dúvidas</p>
        <h2 class="h2 campanha__h2" data-reveal="rise">Perguntas frequentes</h2>
      </div>
      <div class="faq campanha__main" data-reveal="rise-group">
${c.faq.map(([pergunta, resposta]) => `        <details class="faq__item r-rise">
          <summary class="faq__q">${pergunta}</summary>
          <p class="faq__a">${resposta}</p>
        </details>`).join('\n')}
      </div>
    </div>
  </section>` : '';

  const contato = `

  <section class="section contato is-light" id="contato">
    <div class="wrap">
      <p class="label" data-reveal="rise">Contato</p>
      <h2 class="display contato__title r-mask" data-reveal="mask">Fale com o escritório</h2>
      <p class="lead contato__intro" data-reveal="rise">
        O caminho mais rápido é o WhatsApp. Se preferir escrever, use o formulário.
      </p>

${canaisDiretos({ whatsapp: c.whatsapp })}

      <div class="grid">
${contatoForm({ depth: 1, campanha: c.slug })}

        <aside class="contato__aside" data-reveal="rise-group">${area ? `
          <div class="contato__info r-rise">
            <p class="label label--mute">Área</p>
            <p><a class="link" href="${P}atuacao/${area.slug}.html">${area.nome}</a></p>
          </div>` : ''}
          <div class="contato__info r-rise">
            <p class="label label--mute">Atendimento</p>
            <p>Segunda a sexta, das 9h às 18h</p>
          </div>
        </aside>
      </div>
    </div>
  </section>`;

  return page({
    path: `campanhas/${c.slug}.html`,
    title: `${c.titulo} — FHL Advocacia`,
    desc: c.descricao,
    body: hero + situacoes + direitos + passos + documentos + faq + contato,
    depth: 1,
    campanha: c,
    name: c.titulo,
    og: { label: c.rotulo, title: c.titulo },
    noindex: status !== 'ativa',
    whatsapp: c.whatsapp,
  });
}
