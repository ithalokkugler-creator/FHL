// Mensagem de cobrança (preparação 6.4 C).
// ========================================
//
// O sistema prepara o texto com o valor atualizado; quem manda é o advogado,
// pelo próprio WhatsApp. Nada sai sozinho para o cliente (5.4).
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

import { data, moeda } from '../nucleo/formato.js';

const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/)[0] || '';

/**
 * @param {object} p
 * @param {string} p.modelo      config_financeiro.mensagem_cobranca
 * @param {string} p.cliente     nome do cliente
 * @param {string} p.remetente   quem assina
 * @param {{ numero: number, vencimento: string, total: number }[]} p.parcelas  total em centavos
 * @param {number} p.total       centavos
 * @param {{ chave?: string, titular?: string }} [p.pix]
 */
export function mensagemDeCobranca({ modelo, cliente, remetente, parcelas, total, pix }) {
  const lista = parcelas
    .map((p) => `${p.numero === 0 ? 'entrada' : `parcela ${p.numero}`} de ${data(p.vencimento)} (${moeda(p.total)})`)
    .join('; ');
  const linhaPix = pix?.chave ? `Chave Pix: ${pix.chave}${pix.titular ? ` — ${pix.titular}` : ''}` : '';

  return modelo
    .replaceAll('{cliente}', primeiroNome(cliente))
    .replaceAll('{remetente}', remetente)
    .replaceAll('{parcelas}', lista)
    .replaceAll('{total}', moeda(total))
    .replaceAll('{pix}', linhaPix)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
