// ÁREAS DE ATUAÇÃO
//
// A ordem deste array define a numeração exibida (`num`), a ordem do índice
// em atuacao.html, do pin da home e da lista no rodapé. Criminal e
// Imobiliário entraram em out/2026, a pedido do Vinícius — textos a revisar
// pelos advogados (Vinícius no criminal, Guilherme no imobiliário).
//
// Área nova também vai para AREAS em sistema/js/telas/site/base.js, a lista
// que publicações e campanhas usam na área dos advogados.

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
      'Contratos, cobranças, indenizações, responsabilidade civil e ' +
      'assessoria preventiva.',
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
      // Posse, usucapião e locação passaram para Direito Imobiliário.
      'Assessoria preventiva e notificações extrajudiciais',
      'Obrigações de fazer e tutelas de urgência',
    ],
    quando:
      'Antes de assinar, quando ainda dá para mudar o texto. E assim que o ' +
      'descumprimento acontece, enquanto a prova ainda é recuperável.',
  },
  {
    slug: 'criminal',
    num: '05',
    nome: 'Direito Criminal',
    resumo:
      'Defesa em inquérito policial e ação penal, prisão em flagrante, ' +
      'audiência de custódia, habeas corpus e recursos.',
    intro:
      'No processo penal, boa parte do caso se define nos primeiros atos: o ' +
      'depoimento na delegacia, a audiência de custódia, a forma como a prova ' +
      'foi colhida. Por isso a defesa técnica começa cedo — pelo que já está ' +
      'nos autos, com orientação clara a quem é investigado e à família.',
    itens: [
      'Acompanhamento em delegacia e inquérito policial',
      'Prisão em flagrante e audiência de custódia',
      'Liberdade provisória, revogação de prisão e habeas corpus',
      'Defesa em ação penal e no Tribunal do Júri',
      'Acordo de não persecução penal e transação penal',
      'Recursos criminais e assistência de acusação',
    ],
    quando:
      'Ao receber intimação para depor, antes de comparecer; logo depois de ' +
      'uma prisão ou de um mandado de busca; e assim que chegar a citação. Os ' +
      'prazos da defesa são curtos, e o que se diz no primeiro depoimento ' +
      'acompanha o caso até o fim.',
  },
  {
    slug: 'imobiliario',
    num: '06',
    nome: 'Direito Imobiliário',
    resumo:
      'Compra e venda, análise de documentos do imóvel, locação, distrato, ' +
      'usucapião e regularização registral.',
    intro:
      'O imóvel costuma ser o maior patrimônio de uma família ou de uma ' +
      'empresa, e o problema quase sempre nasce antes da assinatura: matrícula ' +
      'com pendência, vendedor com dívida, contrato que não diz o que as ' +
      'partes combinaram. Atuamos na prevenção — conferindo documentos e ' +
      'redigindo contratos — e no conflito, quando ele já existe.',
    itens: [
      'Análise de matrícula, certidões e documentos antes da compra',
      'Contratos de compra e venda, permuta e promessa',
      'Locação residencial e comercial, despejo e renovatória',
      'Atraso na entrega de obra e distrato com construtora',
      'Usucapião judicial e extrajudicial',
      'Regularização de imóvel, escritura e registro',
    ],
    quando:
      'Antes de assinar o contrato ou dar o sinal, quando ainda dá para ' +
      'conferir a matrícula e mudar o texto. E assim que surgir o atraso, a ' +
      'inadimplência ou a disputa sobre a posse — documento reunido cedo vale mais.',
  },
];
