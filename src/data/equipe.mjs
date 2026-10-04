// EQUIPE — dados reais fornecidos pelo escritório.
//
// slug   âncora do perfil em equipe.html (equipe.html#<slug>): os cartões da
//        home, as páginas de área e o fim de cada artigo apontam para ela
// ini    iniciais do retrato tipográfico, usado até o ensaio fotográfico
//        existir (pendência 5 da preparação)
// foto   caminho em assets/img/ quando o ensaio existir — preenchida, entra no
//        lugar do retrato. O Art. 5 do Provimento 205/2021 autoriza
//        expressamente fotos dos advogados.
// tom    cor do filete do retrato: teal, vinho ou menta, os três acentos do site
// areas  slugs de src/data/areas.mjs em que o advogado atende — alimenta o
//        "Quem atende nesta área" de cada página de atuação

export const EQUIPE = [
  {
    slug: 'guilherme-fonseca',
    nome: 'Guilherme O. Fonseca',
    completo: 'Guilherme de Oliveira da Fonseca',
    ini: 'GF',
    foto: '',
    tom: 'teal',
    oab: 'OAB/PR 116.072',
    areas: ['civel', 'consumidor'],
    atuacao:
      'Direito Cível, Consumidor, Imobiliário, Contratual e ' +
      'Assessoria Preventiva.',
    perfil:
      'Atuação estratégica em demandas consultivas e contenciosas, com ' +
      'foco em organização documental, prevenção de riscos e condução ' +
      'técnica de conflitos patrimoniais e contratuais.',
  },
  {
    slug: 'juliana-lisboa',
    nome: 'Juliana S. Lisboa',
    completo: 'Juliana Cristina da Silva Lisboa',
    ini: 'JL',
    foto: '',
    tom: 'menta',
    oab: 'OAB/PR 117.141',
    areas: ['previdenciario', 'consumidor'],
    atuacao: 'Direito de Família, Sucessões, Previdenciário e Consumidor.',
    perfil:
      'Atuação voltada à solução de conflitos familiares, patrimoniais e ' +
      'previdenciários, com atendimento humanizado, análise documental ' +
      'criteriosa e estratégia processual individualizada.',
  },
  {
    slug: 'vinicius-lisboa',
    nome: 'Vinicius L. Lisboa',
    completo: 'Vinicius Rangel de Lima de Paula Lisboa',
    ini: 'VL',
    foto: '',
    tom: 'vinho',
    oab: 'OAB/PR 105.790',
    areas: ['trabalhista', 'previdenciario'],
    atuacao:
      'Direito Trabalhista, Criminal, Previdenciário, Regularização ' +
      'Fundiária, Ambiental e Portuário.',
    perfil:
      'Atuação contenciosa e estratégica em demandas complexas, com ' +
      'ênfase em análise probatória, construção de teses, defesa técnica ' +
      'e medidas judiciais de urgência.',
  },
];

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * O advogado que assina um artigo. O autor é texto livre, digitado na área dos
 * advogados ("Juliana S. Lisboa", "Vinícius Lisboa"…), então a comparação é
 * pelo primeiro nome e pelo último sobrenome, sem acento. Sem par, `null` — o
 * artigo mostra só o nome, sem inscrição nem link.
 */
export function advogadoPorNome(nome = '') {
  const alvo = semAcento(nome);
  return EQUIPE.find((m) => {
    const partes = semAcento(m.completo).split(/\s+/);
    return alvo.includes(partes[0]) && alvo.includes(partes[partes.length - 1]);
  }) ?? null;
}
