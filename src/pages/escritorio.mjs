import { nextBlock, page, pageHead } from '../lib/html.mjs';
import { metodo, numeros } from '../partials/institucional.mjs';

export function buildEscritorio() {
  const body = pageHead(
    'O Escritório',
    'Entender o caso primeiro, agir depois',
    'A FHL Advocacia atende pessoas e empresas em Paranaguá e região, nas áreas ' +
    'trabalhista, previdenciária, do consumidor e cível.'
  ) + `

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">Quem é a FHL</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <div class="prose">
          <p class="lead r-rise">
            FHL são as iniciais dos sobrenomes dos sócios: Fonseca, Hespanha e Lisboa.
            O escritório reúne quatro advogados e atende pessoas físicas e jurídicas
            com abordagem técnica, estratégica e personalizada.
          </p>
          <p class="r-rise">
            O trabalho começa pela escuta e pelos documentos que já existem — o
            contrato, o holerite, o extrato, o protocolo do INSS. É neles que boa
            parte dos casos se decide, antes de qualquer peça ser escrita.
          </p>
          <p class="r-rise">
            Além das quatro áreas principais, a equipe atua em família e sucessões,
            direito empresarial, administrativo, criminal, ambiental, regularização
            fundiária e direito portuário — este último, natural para um escritório
            em Paranaguá.
          </p>
        </div>
      </div>
    </div>
  </section>

${metodo()}

${numeros()}

` + nextBlock('Vamos conversar', 'contato.html', 'Entrar em contato');

  return page({
    path: 'escritorio.html',
    title: 'O Escritório — FHL Advocacia',
    desc: 'Quem é a FHL Advocacia: quatro advogados em Paranaguá, com atuação ' +
      'trabalhista, previdenciária, do consumidor e cível.',
    body,
  });
}
