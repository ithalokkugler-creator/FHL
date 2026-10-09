// DJEN fictício para a prévia: responde no formato da API pública do CNJ
// (comunicaapi.pje.jus.br/api/v1/comunicacao), com comunicações inventadas.
// A prévia nunca consulta o CNJ de verdade — nem dados de processo reais.
//
// Imita também o limite por IP (x-ratelimit-limit/remaining e 429), para a
// tela poder ser testada no caso "o CNJ limitou as consultas".

const LIMITE = 20;
const JANELA = 60_000;
let pedidos = [];

const dias = (de, ate) => {
  const lista = [];
  for (let d = new Date(`${de}T12:00:00Z`); d <= new Date(`${ate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) lista.push(d.toISOString().slice(0, 10));
  }
  return lista;
};

const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function comunicacoes(numeroOab, ufOab, de, ate) {
  const itens = [];
  for (const [i, dia] of dias(de, ate).entries()) {
    // Uma comunicação a cada dois dias úteis, por OAB.
    if (i % 2) continue;
    // A mesma comunicação para os advogados do escritório tem o mesmo id —
    // como no DJEN de verdade —, para a tela exercitar a deduplicação. Uma
    // a cada três é só desta OAB.
    const id = Number(`9${i % 3 === 2 ? numeroOab.slice(-3) : '000'}${dia.replaceAll('-', '').slice(2)}`);
    const audiencia = i % 4 === 0;
    const daqui = new Date(`${dia}T12:00:00Z`);
    daqui.setUTCDate(daqui.getUTCDate() + 35);
    const diaAudiencia = daqui.toISOString().slice(0, 10);
    itens.push({
      id,
      data_disponibilizacao: dia,
      siglaTribunal: i % 3 === 0 ? 'TRT9' : 'TJPR',
      tipoComunicacao: 'Intimação',
      nomeOrgao: i % 3 === 0 ? '1ª Vara do Trabalho Fictícia de Paranaguá' : 'Vara Cível Fictícia de Paranaguá',
      texto: audiencia
        ? `<p>PROCESSO FICTÍCIO. Fica a parte intimada da audiência de conciliação designada para o dia ${br(diaAudiencia)}, às 14h30, na sala de audiências.</p>`
        : '<p>PROCESSO FICTÍCIO. Intime-se a parte autora para manifestação sobre a contestação no prazo de 15 (quinze) dias.</p><br>Advogado: OAB fictícia.',
      // A primeira de cada busca é do processo fictício cadastrado na prévia.
      numero_processo: i === 0 ? '00012342220258160001' : `00${String(i).padStart(5, '0')}9920268160129`,
      numeroprocessocommascara: i === 0 ? '0001234-22.2025.8.16.0001' : '',
      meio: 'D',
      link: `https://comunicaapi.pje.jus.br/api/v1/comunicacao/ficticio-${id}/certidao`,
      tipoDocumento: audiencia ? 'Despacho' : 'Intimação',
      nomeClasse: 'Procedimento Comum Cível',
      codigoClasse: '7',
      numeroComunicacao: i + 1,
      ativo: true,
      hash: `ficticio${id}`,
      datadisponibilizacao: br(dia),
      destinatarios: [{ nome: 'PARTE FICTÍCIA', polo: 'A', comunicacao_id: id }],
      destinatarioadvogados: [{ advogado: { nome: 'ADVOGADO FICTÍCIO', numero_oab: numeroOab, uf_oab: ufOab } }],
    });
  }
  return itens;
}

export function respostaDjenFicticia(url) {
  const agora = Date.now();
  pedidos = pedidos.filter((t) => t > agora - JANELA);
  pedidos.push(agora);
  const restantes = Math.max(0, LIMITE - pedidos.length);
  const cabecalhos = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'x-ratelimit-limit': String(LIMITE),
    'x-ratelimit-remaining': String(restantes),
  };
  if (pedidos.length > LIMITE) return new Response('', { status: 429, headers: cabecalhos });

  const p = url.searchParams;
  const numeroOab = (p.get('numeroOab') ?? '').replace(/\D/g, '');
  const ufOab = (p.get('ufOab') ?? '').toUpperCase();
  const de = p.get('dataDisponibilizacaoInicio');
  const ate = p.get('dataDisponibilizacaoFim');
  const pagina = Math.max(1, Number(p.get('pagina') || 1));
  const porPagina = Number(p.get('itensPorPagina') || 100);
  if (!numeroOab || !/^[A-Z]{2}$/.test(ufOab) || !/^\d{4}-\d{2}-\d{2}$/.test(de ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(ate ?? '')) {
    return new Response(JSON.stringify({ status: 'fail', message: 'Parâmetros inválidos.' }), { status: 422, headers: cabecalhos });
  }
  if (![5, 100].includes(porPagina)) {
    return new Response(JSON.stringify({ status: 'fail', message: 'itensPorPagina deve ser 5 ou 100.' }), { status: 422, headers: cabecalhos });
  }
  const todos = comunicacoes(numeroOab, ufOab, de, ate);
  const items = todos.slice((pagina - 1) * porPagina, pagina * porPagina);
  return new Response(JSON.stringify({ status: 'success', message: 'Sucesso', count: todos.length, items }), { headers: cabecalhos });
}

/** ViaCEP fictício: um endereço inventado para o CEP de Paranaguá do exemplo. */
export function respostaCepFicticia(cep) {
  const enderecos = {
    83203000: { cep: '83203-000', logradouro: 'Rua Fictícia', bairro: 'Centro', localidade: 'Paranaguá', uf: 'PR' },
    80010000: { cep: '80010-000', logradouro: 'Praça Fictícia', bairro: 'Centro', localidade: 'Curitiba', uf: 'PR' },
  };
  return Response.json(enderecos[cep] ?? { erro: true });
}
