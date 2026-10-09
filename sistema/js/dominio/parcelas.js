// Parcelas de um contrato (preparação 6.4 A, passo 7).
// ====================================================
//
// A tela mostra as parcelas antes de salvar e deixa ajustar data e valor.
// O arredondamento vai para a última: R$ 1.000,00 em 3 vezes dá
// 333,33 + 333,33 + 333,34.
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

import { somarDias, somarMeses } from '../nucleo/formato.js';

/** O vencimento da parcela `i` (0, 1, 2…) a partir da primeira. Mensal
 *  mantém o dia (31/01, 28/02, 31/03); quinzenal soma 15 dias corridos. */
const vencimentoDa = (primeiro, i, frequencia) => (frequencia === 'quinzenal'
  ? somarDias(primeiro, 15 * i)
  : somarMeses(primeiro, i, Number(primeiro.slice(8, 10))));

/**
 * @param {object} p
 * @param {number} p.total               centavos
 * @param {number} [p.entrada]           centavos; vira a parcela 0
 * @param {string} [p.dataEntrada]       'AAAA-MM-DD'
 * @param {number} p.quantidade          parcelas depois da entrada
 * @param {string} p.primeiroVencimento  'AAAA-MM-DD'
 * @param {'mensal'|'quinzenal'} [p.frequencia]
 */
export function gerarParcelas({ total, entrada = 0, dataEntrada, quantidade, primeiroVencimento, frequencia = 'mensal' }) {
  if (!(total > 0)) throw new Error('Informe o valor total.');
  if (entrada < 0 || entrada > total) throw new Error('A entrada não pode passar do valor total.');
  if (entrada > 0 && !dataEntrada) throw new Error('Informe a data da entrada.');

  const restante = total - entrada;
  if (restante > 0) {
    if (!(quantidade >= 1) || !Number.isInteger(quantidade)) throw new Error('Informe o número de parcelas.');
    if (!primeiroVencimento) throw new Error('Informe o vencimento da primeira parcela.');
  }

  const lista = [];
  if (entrada > 0) lista.push({ numero: 0, vencimento: dataEntrada, valor: entrada });

  if (restante > 0) {
    const valor = Math.floor(restante / quantidade);
    // Sempre a partir do dia da primeira: 31/01, 28/02, 31/03 — e não 28/03.
    for (let i = 0; i < quantidade; i++) {
      lista.push({
        numero: i + 1,
        vencimento: vencimentoDa(primeiroVencimento, i, frequencia),
        valor: i === quantidade - 1 ? restante - valor * (quantidade - 1) : valor,
      });
    }
  }
  return lista;
}

/**
 * Pelo valor da parcela em vez da quantidade (DOCX §6): o que sobra depois
 * da entrada em parcelas de `valorParcela`, e a última com o resto. Saldo de
 * R$ 1.000 em parcelas de R$ 300 → 300 + 300 + 300 + 100.
 */
export function gerarParcelasPorValor({ total, entrada = 0, dataEntrada, valorParcela, primeiroVencimento, frequencia = 'mensal' }) {
  if (!(total > 0)) throw new Error('Informe o valor total.');
  if (entrada < 0 || entrada > total) throw new Error('A entrada não pode passar do valor total.');
  if (entrada > 0 && !dataEntrada) throw new Error('Informe a data da entrada.');
  const restante = total - entrada;
  const lista = entrada > 0 ? [{ numero: 0, vencimento: dataEntrada, valor: entrada }] : [];
  if (restante <= 0) return lista;
  if (!(valorParcela > 0)) throw new Error('Informe o valor de cada parcela.');
  if (!primeiroVencimento) throw new Error('Informe o vencimento da primeira parcela.');
  const quantidade = Math.ceil(restante / valorParcela);
  if (quantidade > 120) throw new Error('Isso daria mais de 120 parcelas. Aumente o valor da parcela.');
  for (let i = 0; i < quantidade; i++) {
    lista.push({
      numero: i + 1,
      vencimento: vencimentoDa(primeiroVencimento, i, frequencia),
      valor: i === quantidade - 1 ? restante - valorParcela * (quantidade - 1) : valorParcela,
    });
  }
  return lista;
}

export const somaDasParcelas = (lista) => lista.reduce((soma, p) => soma + p.valor, 0);

/** "Entrada" ou "Parcela 3" — o número do banco, o mesmo em toda tela, no
 *  recibo e na mensagem de cobrança. */
export const nomeDaParcela = (numero) => (numero === 0 ? 'Entrada' : `Parcela ${numero}`);

/**
 * Onde cada parcela está no seu plano: "2 de 10" no plano original, "1 de 3"
 * na renegociação que a criou.
 *
 * Renegociar não renumera nada — as parcelas novas continuam a contagem do
 * contrato (a 11, a 12…), e é esse número que aparece nos recebimentos e na
 * cobrança. Mostrar "11/2" ao lado dele, como a tela fazia, confundia; a
 * posição dentro do grupo é que diz a quem lê quantas faltam.
 *
 * @param {{ id: string, numero: number, origem_renegociacao_id?: string|null }[]} parcelas
 * @returns {Map<string, { posicao: number, total: number }>}  a entrada fica de fora
 */
export function posicoes(parcelas) {
  const grupos = new Map();
  for (const p of parcelas) {
    if (p.numero === 0) continue;
    const chave = p.origem_renegociacao_id ?? 'original';
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }

  const mapa = new Map();
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.numero - b.numero);
    grupo.forEach((p, i) => mapa.set(p.id, { posicao: i + 1, total: grupo.length }));
  }
  return mapa;
}
