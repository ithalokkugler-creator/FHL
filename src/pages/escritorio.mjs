import { nextBlock, page, pageHead } from '../lib/html.mjs';

export function buildEscritorio() {
  const body = pageHead(
    'O Escritório',
    'Entender o negócio primeiro, escrever depois',
    'A I&amp;D Legal atua em direito cível e contratual para empresas e pessoas ' +
    'que precisam de segurança antes, durante e depois da assinatura.'
  ) + `

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">Como chegamos aqui</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <div class="prose">
          <p class="lead r-rise">
            O escritório nasceu de uma observação simples: a maior parte das disputas
            que chegam ao contencioso cível estava escrita, com todas as letras, em um
            contrato que ninguém leu com atenção.
          </p>
          <p class="r-rise">
            Por isso trabalhamos nas duas pontas. Na redação e na negociação, para que o
            documento resista ao que vier. E no contencioso, quando o documento já não
            resistiu — nossa própria experiência em juízo é o que informa a forma como
            escrevemos.
          </p>
          <p class="r-rise">
            Atendemos empresas de médio porte em contratos e disputas cíveis, e pessoas
            físicas em questões imobiliárias, contratuais e sucessórias. Em ambos os
            casos o cliente costuma chegar com um problema já em curso — e o que ele
            precisa primeiro é de um diagnóstico honesto do tamanho dele.
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="section metodo is-light">
    <div class="wrap">
      <div class="metodo__head">
        <p class="label" data-reveal="rise">Método</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Como trabalhamos</h2>
      </div>
      <div class="metodo__steps" data-reveal="rise-group">
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">01</div>
          <h3 class="h3 metodo__title">Escuta</h3>
          <p class="metodo__text">Antes de olhar o contrato, entendemos o negócio. O que a
          empresa vende, para quem, e onde já se queimou antes.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">02</div>
          <h3 class="h3 metodo__title">Diagnóstico</h3>
          <p class="metodo__text">Mapeamos os riscos reais do documento e separamos o que
          é negociável do que é inegociável.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">03</div>
          <h3 class="h3 metodo__title">Redação e negociação</h3>
          <p class="metodo__text">Escrevemos em português. Negociamos com posição definida,
          não com improviso.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">04</div>
          <h3 class="h3 metodo__title">Acompanhamento</h3>
          <p class="metodo__text">Contrato assinado não é assunto encerrado. Revisão
          periódica e suporte na execução.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--fn numeros is-light section--flush-top">
    <div class="wrap">
      <div class="numeros__grid">
        <div><div class="numeros__value numeral" data-count="18">0</div>
          <div class="numeros__label">Anos de<br>atuação</div></div>
        <div><div class="numeros__value numeral" data-count="4">0</div>
          <div class="numeros__label">Áreas do<br>direito civil</div></div>
        <div><div class="numeros__value numeral" data-count="4">0</div>
          <div class="numeros__label">Advogados<br>na equipe</div></div>
        <div><div class="numeros__value numeral" data-count="40" data-suffix="+">0</div>
          <div class="numeros__label">Artigos<br>publicados</div></div>
      </div>
      <p class="numeros__note">
        Setores atendidos: construção civil, varejo, saúde, tecnologia e agronegócio.
      </p>
    </div>
  </section>

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato');

  return page({
    path: 'escritorio.html',
    title: 'O Escritório — FHL Advocacia',
    desc: 'Advocacia cível e contratual. Entender o negócio primeiro, escrever depois.',
    body,
  });
}
