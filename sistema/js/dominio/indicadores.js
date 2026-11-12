// Números das telas de Contratos, Clientes e Processos (pedidos de 12/11/2026).
// ==========================================================================
//
// "Quantos contratos foram fechados no mês", "quantos clientes novos",
// "quantos processos ativos, suspensos e encerrados" — na própria tela, sem
// painel novo. Aqui só a conta, sem tela: os testes usam as mesmas funções.
//
// O mês é sempre o de Brasília. Data de calendário ('AAAA-MM-DD', como a
// formalização do contrato) não passa por fuso; instante (criado_em) passa.

import { hoje, inicioDoMes, noFuso, somarMeses } from '../nucleo/formato.js';

export const PERIODOS_NUMEROS = [
  ['1', 'Este mês'],
  ['3', 'Últimos 3 meses'],
  ['4', 'Últimos 4 meses'],
  ['5', 'Últimos 5 meses'],
  ['6', 'Últimos 6 meses'],
  ['12', 'Últimos 12 meses'],
];
export const PERIODO_PADRAO = 6;

/** O período guardado no endereço (?periodo=6), ou o padrão. */
export const lerPeriodo = (valor) => (PERIODOS_NUMEROS.some(([p]) => p === String(valor ?? '')) ? Number(valor) : PERIODO_PADRAO);

/** 'AAAA-MM' de uma data de calendário ou de um instante, em Brasília. */
export function mesDe(valor) {
  if (!valor) return null;
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto.slice(0, 7);
  return Number.isFinite(Date.parse(texto)) ? noFuso(texto).dia.slice(0, 7) : null;
}

/** Os `meses` meses que terminam no mês de `dia`, do mais antigo ao atual. */
export function mesesDoPeriodo(meses, dia = hoje()) {
  const atual = inicioDoMes(dia);
  return Array.from({ length: meses }, (_, i) => somarMeses(atual, i - (meses - 1), 1).slice(0, 7));
}

/**
 * Quantos itens caem em cada mês do período, o total e a média mensal (uma
 * casa). `pegarData` diz qual data conta (formalização, cadastro…); item sem
 * data fica de fora.
 * @returns {{ porMes: {mes: string, total: number}[], total: number, media: number, esteMes: number, meses: number }}
 */
export function contarPorMes(lista, pegarData, { meses = PERIODO_PADRAO, dia = hoje() } = {}) {
  const periodo = mesesDoPeriodo(meses, dia);
  const contagem = new Map(periodo.map((m) => [m, 0]));
  for (const item of lista ?? []) {
    const mes = mesDe(pegarData(item));
    if (contagem.has(mes)) contagem.set(mes, contagem.get(mes) + 1);
  }
  const porMes = periodo.map((mes) => ({ mes, total: contagem.get(mes) }));
  const total = porMes.reduce((soma, x) => soma + x.total, 0);
  return { porMes, total, media: Math.round((total / meses) * 10) / 10, esteMes: porMes.at(-1).total, meses };
}

/** "1,5" — média com vírgula, sem casa decimal quando é inteira. */
export const formatarMedia = (n) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Situações que contam como "ativos": tudo que não está suspenso nem encerrado. */
export const SITUACOES_INATIVAS = ['suspenso', 'encerrado'];

/** Processos por situação: total, ativos (com a quebra), suspensos e encerrados. */
export function contarSituacoes(processos) {
  const porSituacao = {};
  for (const p of processos ?? []) porSituacao[p.situacao] = (porSituacao[p.situacao] ?? 0) + 1;
  const suspensos = porSituacao.suspenso ?? 0;
  const encerrados = porSituacao.encerrado ?? 0;
  const total = (processos ?? []).length;
  return { total, ativos: total - suspensos - encerrados, suspensos, encerrados, porSituacao };
}
