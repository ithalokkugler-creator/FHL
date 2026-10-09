// CAMPANHAS
//
// A "landing page" que o cliente perguntou se precisaria ser um site à parte.
// Não precisa: cada objeto abaixo vira campanhas/<slug>.html, com a marca, o
// domínio e o SEO do próprio site. Para criar uma campanha, copie um objeto,
// troque o slug e os textos e rode `npm run build` e `npm run og` (imagem da
// prévia do link).
//
// Campos — seção sem dados simplesmente não aparece:
//   slug        endereço da página: campanhas/<slug>.html
//   inicio/fim  período, AAAA-MM-DD (opcionais — ver PERÍODO)
//   area        slug de src/data/areas.mjs — liga a campanha à página da área
//   rotulo      texto pequeno acima do título
//   titulo      título da página
//   subtitulo   frase logo abaixo do título
//   descricao   texto do Google e da prévia do link (até uns 155 caracteres)
//   whatsapp    mensagem que já chega escrita no WhatsApp do escritório — é
//               como se sabe que o contato veio da campanha
//   situacoes   lista "Você pode ter direitos se"
//   direitos    pares [título, texto] — "O que pode ser buscado"
//   passos      pares [título, texto] — opcional; o padrão está em
//               src/pages/campanhas.mjs
//   documentos  lista "Documentos que ajudam"
//   prazo       aviso de prazo, em destaque ao lado dos documentos
//   faq         pares [pergunta, resposta] — vão também para o Google (FAQPage)
//
// PERÍODO
//   · dentro do período: página normal, no Google e anunciada na home e na
//     página da área;
//   · antes do início: a página já existe, para revisar e testar o link, mas
//     fica fora do Google;
//   · depois do fim: continua no ar — quem chega por um post antigo não cai
//     num erro —, com aviso de campanha encerrada e fora do Google.
// O período é avaliado no build. O aviso de encerrada também é conferido no
// navegador, então aparece no dia certo mesmo sem novo deploy.

export const CAMPANHAS = [
  {
    slug: 'acidente-de-trabalho',
    // [EXEMPLO] período que inclui a data de hoje, para a página aparecer
    // ativa nos testes. Ajustar à campanha real (ex.: abril e maio, Dia do
    // Trabalhador).
    inicio: '2026-09-01',
    fim: '2026-11-30',
    area: 'trabalhista',
    rotulo: 'Acidente de trabalho',
    titulo: 'Sofreu um acidente de trabalho?',
    subtitulo:
      'Acidente no serviço, no trajeto ou doença causada pelo trabalho podem ' +
      'garantir estabilidade no emprego, benefício do INSS e indenização. ' +
      'Entenda o que se aplica ao seu caso.',
    descricao:
      'Acidente de trabalho ou doença ocupacional? Veja os direitos que podem ' +
      'existir — estabilidade, benefício do INSS e indenização — e fale com a ' +
      'Fonseca Lisboa Advocacia.',
    whatsapp:
      'Olá! Vim pela página sobre acidente de trabalho e gostaria de uma orientação.',
    situacoes: [
      'Se machucou durante o trabalho ou a serviço da empresa',
      'Sofreu um acidente no trajeto entre a casa e o trabalho',
      'Desenvolveu doença ligada à função — LER/DORT, perda auditiva, problemas de coluna',
      'Ficou afastado por mais de 15 dias',
      'Foi demitido pouco tempo depois de voltar do afastamento',
      'A empresa não emitiu a CAT (Comunicação de Acidente de Trabalho)',
    ],
    direitos: [
      ['Estabilidade no emprego',
        'Quem recebeu auxílio do INSS por acidente de trabalho tem garantia de ' +
        '12 meses no emprego depois de voltar ao trabalho.'],
      ['Benefício do INSS',
        'Afastamento de mais de 15 dias dá direito ao auxílio por incapacidade. ' +
        'Se ficar sequela que reduza a capacidade de trabalho, pode caber também ' +
        'o auxílio-acidente.'],
      ['FGTS durante o afastamento',
        'No afastamento por acidente de trabalho, a empresa continua obrigada a ' +
        'depositar o FGTS.'],
      ['Indenização',
        'Quando a empresa tem responsabilidade pelo acidente, é possível buscar ' +
        'indenização por danos morais, materiais e estéticos — e pensão, se a ' +
        'capacidade de trabalho foi reduzida.'],
    ],
    documentos: [
      'CAT — Comunicação de Acidente de Trabalho, se foi emitida',
      'Atestados, laudos e exames médicos',
      'Carta de concessão ou de negativa do INSS',
      'Carteira de trabalho e holerites',
      'Fotos, boletim de ocorrência e contato de testemunhas',
    ],
    prazo:
      'Direitos trabalhistas têm prazo: em regra, a ação precisa ser proposta ' +
      'em até 2 anos depois do fim do contrato. Reunir os documentos cedo faz ' +
      'diferença.',
    faq: [
      ['A empresa não emitiu a CAT. E agora?',
        'A CAT pode ser emitida pelo próprio trabalhador, por um familiar, pelo ' +
        'sindicato, pelo médico que atendeu ou por uma autoridade pública. A ' +
        'falta dela não elimina os direitos, mas vale registrar o quanto antes.'],
      ['Posso ser demitido depois de voltar do afastamento?',
        'Quem recebeu o auxílio do INSS por acidente de trabalho tem estabilidade ' +
        'de 12 meses após o retorno. A demissão sem justa causa nesse período ' +
        'pode gerar reintegração ou indenização.'],
      ['Acidente no caminho para o trabalho conta?',
        'Para o INSS, o acidente no trajeto entre a casa e o trabalho é equiparado ' +
        'ao acidente de trabalho. Cada situação precisa ser analisada com os ' +
        'documentos.'],
      ['Preciso ir até o escritório?',
        'Não para começar. O primeiro contato pode ser pelo WhatsApp ou por ' +
        'telefone; se for preciso, marcamos um atendimento no escritório, em ' +
        'Paranaguá.'],
    ],
  },
];
