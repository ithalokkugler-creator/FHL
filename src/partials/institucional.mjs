// Seções institucionais compartilhadas pela home e por escritorio.html.
//
// Eram duas cópias. A da home foi atualizada para a FHL; a de
// escritorio.html ficou com o texto do projeto anterior (18 anos de atuação,
// 40+ artigos, "áreas do direito civil") — e apareceu na tela durante a
// reunião com o cliente. Com um lugar só, as páginas não divergem mais.

import { AREAS } from '../data/areas.mjs';
import { EQUIPE } from '../data/equipe.mjs';
import { ANOS_DE_ATUACAO } from '../data/site.mjs';

export function metodo() {
  return `  <!-- MÉTODO -->
  <section class="section metodo is-light">
    <div class="wrap">
      <div class="metodo__head">
        <p class="label" data-reveal="rise">Método</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Como trabalhamos</h2>
      </div>

      <div class="metodo__steps">
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">01</div>
          <h3 class="h3 metodo__title">Escuta</h3>
          <p class="metodo__text">Entender a situação antes de opinar sobre ela. O que
          aconteceu, quando, e o que já foi tentado.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">02</div>
          <h3 class="h3 metodo__title">Documentos</h3>
          <p class="metodo__text">Análise criteriosa do que já existe. Contrato, holerite,
          extrato, protocolo do INSS — a prova costuma estar aí.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">03</div>
          <h3 class="h3 metodo__title">Riscos</h3>
          <p class="metodo__text">O que dá para buscar, em quanto tempo e a que custo.
          Dito com clareza no começo, não descoberto no meio.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">04</div>
          <h3 class="h3 metodo__title">Condução</h3>
          <p class="metodo__text">Acompanhamento do caso do protocolo ao desfecho, com
          quem assinou a peça respondendo por ela.</p>
        </div>
      </div>
    </div>
  </section>`;
}

export function numeros() {
  return `  <!-- NÚMEROS INSTITUCIONAIS
       Conformidade OAB — Provimento 205/2021, Art. 4, §2: nenhum destes valores
       se refere a resultado obtido em processo. NÃO adicionar "% de êxito",
       "causas ganhas" ou "valores recuperados". -->
  <section class="section section--fn numeros is-light section--flush-top">
    <div class="wrap">
      <!-- O número já sai escrito no HTML: sem JS, ou antes da contagem, a
           página não mostra "0 anos de atuação". home.js conta a partir dele. -->
      <div class="numeros__grid">
        <div><div class="numeros__value numeral" data-count="${ANOS_DE_ATUACAO}">${ANOS_DE_ATUACAO}</div>
          <div class="numeros__label">Anos de<br>atuação</div></div>
        <div><div class="numeros__value numeral" data-count="${AREAS.length}">${AREAS.length}</div>
          <div class="numeros__label">Áreas de<br>atuação</div></div>
        <div><div class="numeros__value numeral" data-count="${EQUIPE.length}">${EQUIPE.length}</div>
          <div class="numeros__label">Advogados<br>na equipe</div></div>
        <div><div class="numeros__value numeral" data-count="1">1</div>
          <div class="numeros__label">Escritório em<br>Paranaguá</div></div>
      </div>
      <p class="numeros__note">
        Atendimento a pessoas físicas e jurídicas em Paranaguá e região.
        <!-- [CONFIRMAR] anos de atuação: ANOS_DE_ATUACAO em src/data/site.mjs -->
      </p>
    </div>
  </section>`;
}
