// HOME
// Única página com o herói WebGL. É gerada aqui junto com as demais para não
// divergir do shell (marca, header, rodapé) a cada alteração.

import { AREAS } from '../data/areas.mjs';
import { EQUIPE } from '../data/equipe.mjs';
import { POSTS } from '../data/posts.mjs';
import {
  CIDADE, ENDERECO, MAPS, MAPS_EMBED, OAB, RAZAO, TEL, TEL_HREF, WHATS,
} from '../data/site.mjs';
import { ARROW, arrowLink, page } from '../lib/html.mjs';
import { canaisDiretos, contatoForm } from '../partials/contato.mjs';
import { metodo, numeros } from '../partials/institucional.mjs';
import { campanhasAtivas, campanhasCallout } from './campanhas.mjs';
import { postItem } from './publicacoes.mjs';

export function buildHome() {
  const itens = AREAS.map((a, i) =>
    `              <li><a class="atuacao__item${i === 0 ? ' is-active' : ''}" href="atuacao/${a.slug}.html">
                <span class="atuacao__num">${a.num}</span>
                <span class="atuacao__name">${a.nome}</span>
              </a></li>`).join('\n');

  const paineis = AREAS.map((a, i) =>
    `            <article class="atuacao__panel${i === 0 ? ' is-active' : ''}">
              <h3 class="h2 atuacao__panel-title">${a.nome}</h3>
              <p class="lead atuacao__panel-text">${a.resumo}</p>
              ${arrowLink('atuacao/' + a.slug + '.html', 'Ver área')}
            </article>`).join('\n');

  const equipe = EQUIPE.map((m) => `        <a class="equipe__card r-wipe" href="equipe.html">
          <div class="equipe__media">
            <img class="equipe__avatar" src="assets/img/avatar.svg" alt="" width="400" height="500">
          </div>
          <h3 class="h3 equipe__name">${m.nome}</h3>
          <p class="equipe__oab">${m.oab}</p>
          <hr class="equipe__rule">
          <p class="equipe__block-text">${m.atuacao}</p>
        </a>`).join('\n');

  const posts = POSTS
    .map((po) => postItem(po, `publicacoes/${po.slug}.html`, '        '))
    .join('\n');

  const body = `
  <!-- HERÓI -->
  <section class="hero" data-reveal-hold>
    <canvas class="hero__canvas" aria-hidden="true"></canvas>
    <img class="hero__fallback" src="assets/img/hero-fallback.jpg" alt="" aria-hidden="true" fetchpriority="high">
    <div class="hero__vignette"></div>

    <div class="wrap hero__inner">
      <p class="label hero__label">${RAZAO}</p>
      <h1 class="display hero__title r-mask">Advocacia estratégica, técnica e comprometida com cada detalhe</h1>
      <div class="hero__cta">
        <a class="btn" href="contato.html" data-magnetic><span class="btn__label">Fale com o escritório</span></a>
        <a class="link-arrow" href="atuacao.html">Ver áreas de atuação ${ARROW}</a>
      </div>
    </div>

    <div class="hero__foot wrap">
      <div class="hero__social">
        <a class="link" href="tel:${TEL_HREF}">${TEL}</a>
        <a class="link" href="https://wa.me/${WHATS}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
      <div class="hero__scroll"><span>Role</span><i aria-hidden="true"></i></div>
    </div>
  </section>

  <!-- MANIFESTO -->
  <section class="section manifesto">
    <img class="watermark watermark--left" src="assets/img/logo-watermark.png" alt="" aria-hidden="true">

    <div class="wrap manifesto__inner">
      <p class="label" data-reveal="rise">O Escritório</p>

      <h2 class="display manifesto__title r-mask" data-reveal="mask">
        Escuta qualificada, análise criteriosa, condução responsável
      </h2>

      <div class="grid">
        <div class="manifesto__aside" data-reveal="rise-group">
          <p class="lead r-rise">
            A FHL Advocacia atua na defesa de interesses de pessoas físicas e jurídicas,
            com abordagem técnica, estratégica e personalizada. O escritório preza pela
            escuta qualificada, análise criteriosa de documentos, avaliação de riscos e
            condução responsável de cada caso.
          </p>
          ${arrowLink('escritorio.html', 'Conheça o escritório', 'link-arrow r-rise')}
        </div>
      </div>
    </div>
  </section>

  <!-- ATUAÇÃO — pin de 300vh -->
  <section class="atuacao">
    <div class="atuacao__sticky">
      <div class="wrap" style="width:100%">
        <div class="atuacao__head">
          <p class="label" data-reveal="rise">Atuação</p>
        </div>

        <div class="grid">
          <div class="atuacao__index">
            <ul class="atuacao__list">
${itens}
            </ul>
            <div class="atuacao__progress" aria-hidden="true"><i></i></div>
          </div>

          <div class="atuacao__panels">
${paineis}
          </div>
        </div>
      </div>
    </div>
  </section>

${metodo()}

${numeros()}

  <!-- LINGUAGEM -->
  <section class="linguagem">
    <div class="linguagem__sticky">
      <div class="wrap linguagem__inner">
        <img class="watermark watermark--right" src="assets/img/logo-watermark.png" alt="" aria-hidden="true">

        <div class="grid">
          <div style="grid-column:1 / span 5">
            <p class="label" data-reveal="rise">Linguagem</p>
            <h2 class="display linguagem__title r-mask" data-reveal="mask">
              Documento que o cliente não entende é risco, não é proteção
            </h2>
          </div>

          <div class="linguagem__doc">
            <span class="linguagem__doc-label">Cláusula 4.1 — Entrega</span>

            <p><span class="term" data-term><span
                  class="term__old">O outorgante<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">Quem vende</span><i class="term__underline" aria-hidden="true"></i></span> <span class="term" data-term><span
                  class="term__old">obriga-se a<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">tem que</span><i class="term__underline" aria-hidden="true"></i></span> entregar o bem <span class="term" data-term><span
                  class="term__old">no prazo avençado<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">no prazo combinado</span><i class="term__underline" aria-hidden="true"></i></span>, <span class="term" data-term><span
                  class="term__old">sob pena de<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">ou paga</span><i class="term__underline" aria-hidden="true"></i></span> <span class="term" data-term><span
                  class="term__old">multa cominatória<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">multa por atraso</span><i class="term__underline" aria-hidden="true"></i></span>.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="wrap linguagem__coda">
      <p class="lead" data-reveal="rise">
        Escrever difícil é fácil. O trabalho está em produzir um documento que
        resista a um tribunal e ainda assim possa ser lido por quem vai assiná-lo.
      </p>
    </div>
  </section>

  <!-- QUEM SOMOS -->
  <section class="section equipe" id="quem-somos">
    <div class="wrap">
      <div class="equipe__head">
        <p class="label" data-reveal="rise">Quem somos</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Quem assina cada caso</h2>
        <p class="lead" data-reveal="rise" style="margin-top:var(--s-3)">
          FHL são as iniciais dos sobrenomes dos sócios: Fonseca, Hespanha e Lisboa.
        </p>
      </div>

      <!-- Silhueta 2D até o ensaio fotográfico existir. O Art. 5 do Provimento
           205/2021 autoriza expressamente fotos dos advogados. -->
      <div class="equipe__grid" data-reveal="wipe-group">
${equipe}
      </div>

      <div style="margin-top:var(--s-5)">
        ${arrowLink('equipe.html', 'Ver perfis completos')}
      </div>
    </div>
  </section>

  <!-- PUBLICAÇÕES -->
  <section class="section publicacoes">
    <div class="wrap">
      <div class="publicacoes__head">
        <p class="label" data-reveal="rise">Publicações</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">O que estamos escrevendo</h2>
      </div>

      <div>
${posts}
      </div>

      <div style="margin-top:var(--s-5)">
        ${arrowLink('publicacoes.html', 'Todas as publicações')}
      </div>
    </div>
  </section>

  <!-- CAMPANHA EM ANDAMENTO — logo abaixo das publicações. Só aparece
       enquanto houver campanha no período (src/data/campanhas.mjs). -->${campanhasCallout(campanhasAtivas(), { flushTop: true })}
  <!-- LOCALIZAÇÃO
       O mapa NÃO carrega sozinho: um iframe do Google enviaria o IP e o
       user-agent do visitante para os servidores deles antes de qualquer
       consentimento, o que contradiria o próprio banner de cookies do site.
       Carrega sob clique — e há sempre o link direto como alternativa. -->
  <section class="section local" id="localizacao">
    <div class="wrap">
      <p class="label" data-reveal="rise">Localização</p>
      <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Onde estamos</h2>

      <div class="local__grid">
        <div class="local__info" data-reveal="rise-group">
          <div class="local__row r-rise">
            <p class="label label--mute">Endereço</p>
            <address class="local__value">${ENDERECO}<br>${CIDADE}</address>
          </div>
          <div class="local__row r-rise">
            <p class="label label--mute">Atendimento</p>
            <p class="local__value">Segunda a sexta, das 9h às 18h</p>
          </div>
          <div class="local__row r-rise">
            <p class="label label--mute">Telefone</p>
            <p class="local__value"><a class="link" href="tel:${TEL_HREF}">${TEL}</a></p>
          </div>
          <div class="local__row r-rise">
            <a class="btn" href="${MAPS}" target="_blank" rel="noopener noreferrer">
              <span class="btn__label">Abrir no Google Maps</span>
            </a>
          </div>
        </div>

        <div class="local__map" data-map data-map-src="${MAPS_EMBED}">
          <div class="local__map-ph">
            <svg class="local__pin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>
            </svg>
            <p class="local__map-addr">${ENDERECO}<br>${CIDADE}</p>
            <button class="btn" type="button" data-map-load>
              <span class="btn__label">Carregar mapa</span>
            </button>
            <p class="local__map-note">
              O mapa é servido pelo Google. Ao carregar, seus dados de navegação
              são enviados a eles.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CONTATO -->
  <section class="section contato is-light" id="contato">
    <div class="wrap">
      <p class="label" data-reveal="rise">Contato</p>
      <h2 class="display contato__title r-mask" data-reveal="mask">Fale com o escritório</h2>
      <p class="lead contato__intro" data-reveal="rise">
        Escolha o canal que preferir. Se for mais fácil escrever, use o formulário abaixo.
      </p>

${canaisDiretos()}

      <div class="grid">
${contatoForm()}

        <aside class="contato__aside" data-reveal="rise-group">
          <div class="contato__info r-rise">
            <p class="label label--mute">Escritório</p>
            <address>${ENDERECO}<br>${CIDADE}</address>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Atendimento</p>
            <p>Segunda a sexta, das 9h às 18h</p>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Inscrição</p>
            <p>${OAB}</p>
          </div>
        </aside>
      </div>
    </div>
  </section>
`;

  return page({
    path: 'index.html',
    title: 'FHL Advocacia — Fonseca Hespanha Lisboa | Paranaguá — PR',
    desc: 'Advocacia estratégica e institucional em Paranaguá. Direito Trabalhista, ' +
      'Previdenciário, do Consumidor e Cível.',
    body,
    home: true,
  });
}
