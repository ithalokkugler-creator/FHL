// Índices de correção monetária do Banco Central (SGS).
// =====================================================
//
// API pública e gratuita, a mesma que o protótipo usava nas calculadoras
// (preparação 3.1). Cada valor é a variação do mês, em %, publicada por volta
// do dia 10 do mês seguinte.
//
// Período corrigido, A VALIDAR PELO VINÍCIUS: do mês do vencimento até o mês
// anterior ao do cálculo. Mês ainda sem índice publicado entra sem correção e
// fica anotado na memória do cálculo — o valor nunca é inventado.

export const INDICES = {
  ipca: { nome: 'IPCA', serie: 433 },
  inpc: { nome: 'INPC', serie: 188 },
  igpm: { nome: 'IGP-M', serie: 189 },
};

const cache = new Map();

/** Variações mensais de um índice desde uma data: Map 'AAAA-MM' → %. */
export function variacoes(indice, desde, ate) {
  const info = INDICES[indice];
  if (!info) return Promise.resolve(new Map());

  const chave = `${indice}:${desde.slice(0, 7)}:${ate.slice(0, 7)}`;
  if (!cache.has(chave)) {
    cache.set(chave, buscarSerie(info.serie, desde, ate).catch((erro) => {
      cache.delete(chave);
      throw erro;
    }));
  }
  return cache.get(chave);
}

const dataSgs = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// O Banco Central às vezes leva segundos para responder. Passado isto, o
// cálculo sai sem correção e com o aviso — a tela não fica presa esperando.
const ESPERA_MAXIMA = 8000;

async function buscarSerie(serie, desde, ate) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados`
    + `?formato=json&dataInicial=${dataSgs(`${desde.slice(0, 7)}-01`)}&dataFinal=${dataSgs(ate)}`;
  const resposta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MAXIMA) });
  // 404 é a resposta do SGS para "nenhum índice publicado nesse intervalo" —
  // o normal para uma parcela vencida neste mês. Não é o serviço fora do ar:
  // tratado como falha, o recibo gravava "Banco Central fora do ar".
  if (resposta.status === 404) return new Map();
  if (!resposta.ok) throw new Error(`O Banco Central não respondeu (${resposta.status}).`);
  const linhas = await resposta.json();
  return new Map(linhas.map((l) => [`${l.data.slice(6, 10)}-${l.data.slice(3, 5)}`, Number(l.valor)]));
}

/** Há algum mês a corrigir entre o vencimento e o cálculo? Se não, nem se
 *  pergunta ao Banco Central. */
export const temMesParaCorrigir = (vencimento, dataCalculo) => vencimento.slice(0, 7) < dataCalculo.slice(0, 7);

const proximoMes = (am) => {
  const [a, m] = am.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};

/** Fator acumulado entre o vencimento e a data do cálculo.
 *  Arquivo-função pura: testada em sistema/testes/. */
export function fatorDoPeriodo(variacoesMensais, vencimento, dataCalculo) {
  const meses = [];
  for (let mes = vencimento.slice(0, 7); mes < dataCalculo.slice(0, 7); mes = proximoMes(mes)) {
    meses.push(mes);
  }

  let fator = 1;
  const faltando = [];
  for (const mes of meses) {
    const variacao = variacoesMensais.get(mes);
    if (variacao == null) faltando.push(mes);
    else fator *= 1 + variacao / 100;
  }
  return { fator, meses, faltando };
}

/** Correção pronta para o cálculo de atraso, ou null se o critério for
 *  "nenhuma". Falha de rede não trava a tela: volta sem fator e com o aviso. */
export async function correcaoPara(indice, vencimento, dataCalculo) {
  if (!INDICES[indice]) return null;
  if (!temMesParaCorrigir(vencimento, dataCalculo)) {
    return { nome: INDICES[indice].nome, ...fatorDoPeriodo(new Map(), vencimento, dataCalculo) };
  }
  try {
    const mapa = await variacoes(indice, vencimento, dataCalculo);
    return { nome: INDICES[indice].nome, ...fatorDoPeriodo(mapa, vencimento, dataCalculo) };
  } catch {
    const { meses } = fatorDoPeriodo(new Map(), vencimento, dataCalculo);
    return { nome: INDICES[indice].nome, fator: 1, meses, faltando: meses, indisponivel: true };
  }
}
