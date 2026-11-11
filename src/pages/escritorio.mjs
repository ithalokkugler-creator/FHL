import { AREAS, areasComNomesOriginais } from '../data/areas.mjs';
import { EQUIPE } from '../data/equipe.mjs';
import { nextBlock, page, pageHead, textoHtml } from '../lib/html.mjs';
import { assinatura } from '../partials/equipe.mjs';
import { metodo, numeros } from '../partials/institucional.mjs';

export function buildEscritorio() {
  const originais = areasComNomesOriginais();
  const areas = new Intl.ListFormat('pt-BR').format(AREAS.map((a) => a.nome));
  const body = pageHead(
    'O Escritório',
    'Entender o caso primeiro, agir depois',
    'A Fonseca Lisboa Advocacia atende pessoas e empresas em Paranaguá e região' + (originais
      ? ', nas áreas trabalhista, previdenciária, do consumidor, cível, criminal e imobiliária.'
      : areas ? `. Conheça as áreas de atuação: ${textoHtml(areas)}.` : '.')
  ) + `

  <section class="section">
    <div class="wrap grid">
      <div class="area__side">
        <p class="label" data-reveal="rise">Quem é a Fonseca Lisboa</p>
      </div>
      <div class="area__main" data-reveal="rise-group">
        <div class="prose">
          <p class="lead r-rise">
            FL são as iniciais dos sobrenomes dos sócios: Fonseca e Lisboa.
            O escritório reúne três advogados e atende pessoas físicas e jurídicas
            com abordagem técnica, estratégica e personalizada.
          </p>
          <p class="r-rise">
            O trabalho começa pela escuta e pelos documentos que já existem — o
            contrato, o holerite, o extrato, o protocolo do INSS. É neles que boa
            parte dos casos se decide, antes de qualquer peça ser escrita.
          </p>
          <p class="r-rise">
            ${originais ? 'Além das seis áreas principais, a equipe atua' : 'A equipe também atua'} em família e sucessões,
            direito ambiental, regularização fundiária e direito portuário —
            este último, natural para um escritório em Paranaguá.
          </p>
        </div>

        <div class="assinaturas assinaturas--duas">
${EQUIPE.map((m) => `          <div class="r-rise">${assinatura(m)}</div>`).join('\n')}
        </div>
      </div>
    </div>
  </section>

${metodo()}

${numeros()}

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato');

  return page({
    path: 'escritorio.html',
    title: 'O Escritório — Fonseca Lisboa Advocacia',
    desc: 'Quem é a Fonseca Lisboa Advocacia: três advogados em Paranaguá' + (originais
      ? ', com atuação trabalhista, previdenciária, do consumidor, cível, criminal e imobiliária.' : '.'),
    body,
  });
}
