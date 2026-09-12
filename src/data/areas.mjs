// ÁREAS DE ATUAÇÃO  [CONFIRMAR lista final com o escritório]
//
// A ordem deste array define a numeração exibida (`num`), a ordem do índice
// em atuacao.html, do pin da home e da lista no rodapé.

export const AREAS = [
  {
    slug: 'trabalhista',
    num: '01',
    nome: 'Direito Trabalhista',
    resumo:
      'Reclamações trabalhistas, verbas rescisórias, vínculo de emprego, ' +
      'horas extras e defesa empresarial.',
    intro:
      'Atuamos dos dois lados da relação de trabalho: para quem foi demitido ' +
      'sem receber o que era devido, e para a empresa que precisa responder a ' +
      'uma reclamação — ou evitar a próxima. Em ambos os casos o trabalho ' +
      'começa no mesmo lugar: nos documentos que já existem.',
    itens: [
      'Verbas rescisórias não pagas ou pagas a menor',
      'Reconhecimento de vínculo de emprego',
      'Horas extras, adicionais e jornada',
      'Rescisão indireta e justa causa',
      'Defesa empresarial em reclamatórias',
      'Acordos, homologações e cálculos',
    ],
    quando:
      'Assim que o contrato de trabalho termina, ou assim que a empresa é ' +
      'notificada. O prazo para reclamar direitos trabalhistas é curto, e ' +
      'documento reunido depois vale menos do que documento reunido antes.',
  },
  {
    slug: 'previdenciario',
    num: '02',
    nome: 'Direito Previdenciário',
    resumo:
      'Aposentadorias, benefícios, revisões e processos administrativos ' +
      'perante o INSS.',
    intro:
      'Boa parte dos benefícios negados pelo INSS é negada por falha de ' +
      'documentação, não por falta de direito. Antes de discutir na Justiça, ' +
      'vale entender o que o processo administrativo registrou — e o que ' +
      'deixou de registrar.',
    itens: [
      'Aposentadoria por idade, tempo de contribuição e especial',
      'Auxílio por incapacidade temporária e permanente',
      'BPC/LOAS — benefício assistencial',
      'Pensão por morte e auxílio-reclusão',
      'Revisão de benefício concedido',
      'Recurso administrativo e ação judicial',
    ],
    quando:
      'Antes de protocolar o pedido, para reunir a prova certa; e logo após ' +
      'uma negativa, porque o prazo de recurso administrativo corre rápido.',
  },
  {
    slug: 'consumidor',
    num: '03',
    nome: 'Direito do Consumidor',
    resumo:
      'Fraudes bancárias, cobranças indevidas, negativação irregular e ' +
      'vícios de produtos ou serviços.',
    intro:
      'Fraude bancária, empréstimo que ninguém contratou, nome negativado por ' +
      'dívida inexistente. São situações em que a prova costuma estar com a ' +
      'empresa, não com o consumidor — e é justamente isso que a lei ' +
      'reconhece.',
    itens: [
      'Fraude bancária, golpes e empréstimos não contratados',
      'Cobrança indevida e negativação irregular',
      'Vício e defeito de produto ou serviço',
      'Serviço contratado e não prestado',
      'Planos de saúde e negativa de cobertura',
      'Revisão de contratos de adesão',
    ],
    quando:
      'Assim que a cobrança aparece. Guarde prints, protocolos e extratos ' +
      'antes de qualquer contato — é o que sustenta o caso depois.',
  },
  {
    slug: 'civel',
    num: '04',
    nome: 'Direito Cível',
    resumo:
      'Contratos, cobranças, indenizações, responsabilidade civil, posse, ' +
      'propriedade e locação.',
    intro:
      'O direito cível é onde a maior parte dos conflitos do dia a dia se ' +
      'resolve: um contrato descumprido, uma dívida não paga, um dano que ' +
      'alguém precisa reparar, um imóvel em disputa. Cada um deles é, antes ' +
      'de tudo, um problema de prova e de prazo.',
    itens: [
      'Contratos: redação, revisão e rescisão',
      'Cobrança e execução de dívidas',
      'Responsabilidade civil e indenizações',
      'Danos morais e materiais',
      'Posse, propriedade e usucapião',
      'Locação residencial e comercial',
    ],
    quando:
      'Antes de assinar, quando ainda dá para mudar o texto. E assim que o ' +
      'descumprimento acontece, enquanto a prova ainda é recuperável.',
  },
];
