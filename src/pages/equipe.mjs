import { EQUIPE } from '../data/equipe.mjs';
import { nextBlock, page, pageHead } from '../lib/html.mjs';

export function buildEquipe() {
  const cards = EQUIPE.map((m) => `        <article class="equipe__card r-wipe">
          <div class="equipe__media">
            <img class="equipe__avatar" src="assets/img/avatar.svg" alt="" width="400" height="500">
          </div>
          <h2 class="h3 equipe__name">${m.nome}</h2>
          <p class="equipe__full">${m.completo}</p>
          <p class="equipe__oab">${m.oab}</p>
          <hr class="equipe__rule">
          <div class="equipe__block">
            <p class="equipe__block-label">Atuação</p>
            <p class="equipe__block-text">${m.atuacao}</p>
          </div>
          <div class="equipe__block">
            <p class="equipe__block-label">Perfil</p>
            <p class="equipe__block-text">${m.perfil}</p>
          </div>
        </article>`).join('\n');

  const body = pageHead(
    'Quem somos', 'Os advogados por trás de cada caso',
    'Toda peça que sai daqui tem um responsável com nome e inscrição na OAB. ' +
    'A relação é com a pessoa, não com o protocolo.'
  ) + `

  <section class="section equipe">
    <div class="wrap">
      <!-- Art. 5 do Provimento 205/2021 autoriza expressamente fotos dos advogados.
           Placeholders de iniciais até o ensaio fotográfico existir (pendência 5). -->
      <div class="equipe__grid" data-reveal="wipe-group">
${cards}
      </div>
    </div>
  </section>

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato');

  return page({
    path: 'equipe.html',
    title: 'Quem somos — FHL Advocacia',
    desc: 'Advogados responsáveis por cada frente de atuação da FHL Advocacia.',
    body,
  });
}
