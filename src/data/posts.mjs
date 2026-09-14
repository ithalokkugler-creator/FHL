// PUBLICAÇÕES
//
// `corpo` é uma lista de blocos [tipo, valor]. Tipos aceitos pelo renderizador
// em src/pages/publicacoes.mjs:
//   'p'          parágrafo
//   'h2'         subtítulo
//   'pq'         pullquote (blockquote destacado)
//   'ul'         lista — valor é um array de itens (HTML inline permitido)
//   'instagram'  cartão com a prévia de um post e o link para ele. Também
//   'facebook'   existem com o mesmo formato. Valor é um objeto:
//   'linkedin'     url      link do post
//                  imagem   arquivo em assets/img/publicacoes/. Salve a
//                           imagem do post ali: o endereço da imagem dentro
//                           do Instagram muda e expira, e o cartão quebraria
//                  legenda  texto curto (aparece com no máximo 5 linhas)
//                  video    true em Reels e vídeos — mostra o ícone de play
//                  alt      descrição da imagem (opcional)
//
// Para publicar um artigo novo: acrescente um objeto no topo deste array e
// rode `npm run build`. A página, o índice, os "continue lendo" das outras
// publicações e o sitemap se atualizam sozinhos. Rode também `npm run og`,
// que gera a imagem da prévia quando o link do artigo é compartilhado.

export const POSTS = [
  {
    slug: 'clausula-nao-concorrencia',
    data: '12 Ago 2026',
    datetime: '2026-08-12',
    titulo: 'O que é, afinal, uma cláusula de não concorrência',
    area: 'Trabalhista',
    thumb: '§',
    autor: 'Marlon A. Hespanha',
    resumo:
      'Ela aparece em quase todo contrato relevante e quase nunca é lida com ' +
      'atenção. Três perguntas para saber se a sua é válida.',
    corpo: [
      ['p',
        'A cláusula de não concorrência aparece em contratos de trabalho, de ' +
        'compra e venda de empresa, de sociedade e de prestação de serviços. ' +
        'Em todos eles ela cumpre a mesma função: impedir que alguém use o ' +
        'que aprendeu ali para competir logo em seguida.'],
      ['h2', 'O problema não é existir, é o alcance'],
      ['p',
        'Uma cláusula que proíbe atuação em qualquer atividade, em qualquer ' +
        'lugar, por tempo indeterminado, tende a ser tratada como abusiva. Não ' +
        'porque a proteção seja ilegítima, mas porque ela deixou de proteger ' +
        'um interesse concreto e passou a simplesmente restringir o trabalho ' +
        'de alguém.'],
      ['pq', 'Cláusula boa é cláusula específica.'],
      ['h2', 'As três perguntas'],
      ['ul', [
        '<strong>Prazo:</strong> por quanto tempo? Prazos longos sem ' +
        'contrapartida chamam atenção negativa.',
        '<strong>Território:</strong> onde? A restrição precisa acompanhar a ' +
        'área em que a empresa efetivamente atua.',
        '<strong>Atividade:</strong> o quê? Descrever a atividade concorrente ' +
        'vale mais do que proibir genericamente.',
      ]],
      // [EXEMPLO] trocar url, imagem e legenda pelas do post real.
      ['instagram', {
        url: 'https://www.instagram.com/',
        imagem: 'assets/img/publicacoes/clausula-nao-concorrencia-instagram.png',
        legenda:
          'Prazo, território e atividade: as três perguntas que dizem se uma ' +
          'cláusula de não concorrência se sustenta. Salve para consultar ' +
          'antes de assinar.',
        alt: 'Arte do post com as três perguntas sobre a cláusula de não concorrência',
      }],
      ['p',
        'Há ainda uma quarta questão que costuma decidir a discussão: existe ' +
        'compensação? Uma restrição remunerada é defendida com muito mais ' +
        'facilidade do que uma restrição gratuita.'],
      ['h2', 'O que fazer com isso'],
      ['p',
        'Se a cláusula já foi assinada, o caminho é avaliar a extensão real da ' +
        'restrição antes de assumir que ela é integralmente válida — ou ' +
        'integralmente inválida. Se ainda não foi, é o momento de escrevê-la ' +
        'com limites que se sustentem.'],
    ],
  },
  {
    slug: 'locacao-comercial',
    data: '28 Jul 2026',
    datetime: '2026-07-28',
    titulo: 'Sete pontos para verificar antes de assinar uma locação comercial',
    area: 'Cível',
    thumb: '¶',
    autor: 'Guilherme O. Fonseca',
    resumo:
      'A locação comercial tem regras próprias e um direito que muita gente ' +
      'desconhece: o da renovação.',
    corpo: [
      ['p',
        'Locação comercial não é locação residencial com outro nome. Ela tem ' +
        'regime próprio, e algumas das suas regras mais relevantes só ' +
        'aparecem quando o contrato já está em execução.'],
      ['h2', '1. O direito de renovação'],
      ['p',
        'Preenchidos certos requisitos de prazo e continuidade, o locatário ' +
        'pode ter direito à renovação compulsória do contrato. Esse direito se ' +
        'exerce dentro de uma janela específica de tempo — perdida a janela, ' +
        'perde-se o direito.'],
      ['h2', '2. O índice de reajuste'],
      ['p',
        'Índices diferentes produzem resultados muito diferentes ao longo de ' +
        'cinco anos. Vale simular antes, não depois.'],
      ['h2', '3. Quem paga o quê'],
      ['p',
        'Despesas ordinárias e extraordinárias de condomínio seguem lógicas ' +
        'distintas. O contrato precisa dizer, com clareza, o que cabe a cada ' +
        'lado — inclusive obras estruturais.'],
      ['h2', '4. Garantia'],
      ['p',
        'Fiança, caução e seguro-fiança têm custos e consequências diferentes ' +
        'em caso de inadimplemento. A escolha não é apenas financeira.'],
      ['h2', '5. Benfeitorias'],
      ['p',
        'Quem faz a obra, quem paga, e o que acontece com ela ao fim do ' +
        'contrato. A ausência dessa previsão é uma das causas mais comuns de ' +
        'disputa na saída.'],
      ['h2', '6. Multa por rescisão antecipada'],
      ['p',
        'A multa costuma ser proporcional ao tempo restante. Contratos que ' +
        'cobram o valor integral independentemente do momento da saída tendem ' +
        'a ser questionados.'],
      ['h2', '7. A destinação do imóvel'],
      ['p',
        'Se a atividade pretendida depende de licença ou de zoneamento ' +
        'específico, isso precisa estar no contrato — junto com o que acontece ' +
        'se a licença não sair.'],
      ['pq',
        'O contrato de locação é lido com atenção duas vezes: antes de ' +
        'assinar, ou no dia da briga.'],
    ],
  },
  {
    slug: 'multa-contratual',
    data: '03 Jul 2026',
    datetime: '2026-07-03',
    titulo: 'Multa contratual: quando ela protege e quando ela vira problema',
    area: 'Cível',
    thumb: '†',
    autor: 'Vinicius L. Lisboa',
    resumo:
      'Multa alta demais não intimida mais — só aumenta a chance de a ' +
      'cláusula ser reduzida em juízo.',
    corpo: [
      ['p',
        'A multa contratual existe para dar consequência ao descumprimento. ' +
        'Sem ela, a obrigação vira recomendação. O erro comum não é usar ' +
        'multa: é calibrá-la mal.'],
      ['h2', 'Moratória e compensatória'],
      ['p',
        'A multa moratória pune o atraso; a compensatória, o descumprimento ' +
        'definitivo. São coisas diferentes e produzem efeitos diferentes — ' +
        'contratos que as tratam como sinônimos costumam gerar discussão ' +
        'sobre o que exatamente está sendo cobrado.'],
      ['h2', 'O limite prático'],
      ['p',
        'Multa manifestamente excessiva em relação à obrigação principal pode ' +
        'ser reduzida. O efeito prático é que uma multa desproporcional não ' +
        'protege mais do que uma multa proporcional: apenas transfere a ' +
        'discussão para o juiz.'],
      ['pq',
        'Multa que ninguém acredita que será cobrada não é garantia; é ' +
        'decoração.'],
      ['h2', 'O que costuma funcionar melhor'],
      ['ul', [
        'Multa proporcional ao valor e à duração da obrigação',
        'Previsão expressa de cumulação — ou não — com perdas e danos',
        'Mecanismo de notificação antes da incidência',
        'Prazo de cura, quando a obrigação admite correção',
      ]],
      ['p',
        'Um prazo de cura bem escrito resolve mais descumprimentos do que ' +
        'qualquer multa — e preserva a relação comercial, que costuma valer ' +
        'mais do que o valor em disputa.'],
    ],
  },
];
