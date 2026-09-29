import { EQUIPE } from '../data/equipe.mjs';
import { nextBlock, page, pageHead } from '../lib/html.mjs';
import { cartaoPerfil } from '../partials/equipe.mjs';

export function buildEquipe() {
  const cards = EQUIPE.map(cartaoPerfil).join('\n');

  const body = pageHead(
    'Quem somos', 'Os advogados por trás de cada caso',
    'Toda peça que sai daqui tem um responsável com nome e inscrição na OAB. ' +
    'A relação é com a pessoa, não com o protocolo.'
  ) + `

  <section class="section equipe">
    <div class="wrap">
      <!-- Art. 5 do Provimento 205/2021 autoriza expressamente fotos dos advogados.
           Retrato tipográfico até o ensaio fotográfico existir (pendência 5). -->
      <div class="equipe__grid equipe__grid--perfil" data-reveal="wipe-group">
${cards}
      </div>
    </div>
  </section>

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato');

  return page({
    path: 'equipe.html',
    title: 'Quem somos — FHL Advocacia',
    desc: 'Os quatro advogados da FHL Advocacia, em Paranaguá: áreas de atuação, ' +
      'perfil e inscrição na OAB/PR de cada um.',
    body,
  });
}
