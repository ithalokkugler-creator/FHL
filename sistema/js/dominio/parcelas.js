// Parcelas de um contrato (preparação 6.4 A, passo 7).
// ====================================================
//
// A tela mostra as parcelas antes de salvar e deixa ajustar data e valor.
// O arredondamento vai para a última: R$ 1.000,00 em 3 vezes dá
// 333,33 + 333,33 + 333,34.
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

import { somarMeses } from '../nucleo/formato.js';

/**
 * @param {object} p
 * @param {number} p.total               centavos
 * @param {number} [p.entrada]           centavos; vira a parcela 0
 * @param {string} [p.dataEntrada]       'AAAA-MM-DD'
 * @param {number} p.quantidade          parcelas depois da entrada
 * @param {string} p.primeiroVencimento  'AAAA-MM-DD'
 */
export function gerarParcelas({ total, entrada = 0, dataEntrada, quantidade, primeiroVencimento }) {
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
    const dia = Number(primeiroVencimento.slice(8, 10));
    for (let i = 0; i < quantidade; i++) {
      lista.push({
        numero: i + 1,
        vencimento: somarMeses(primeiroVencimento, i, dia),
        valor: i === quantidade - 1 ? restante - valor * (quantidade - 1) : valor,
      });
    }
  }
  return lista;
}

export const somaDasParcelas = (lista) => lista.reduce((soma, p) => soma + p.valor, 0);

/** "Entrada" ou "3/10". */
export const rotuloParcela = (numero, quantidade) =>
  numero === 0 ? 'Entrada' : quantidade ? `${numero}/${quantidade}` : `${numero}`;
