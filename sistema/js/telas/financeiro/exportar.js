// Exportar uma lista: planilha do Excel (.xlsx) ou CSV (preparação T11).
// =====================================================================
//
// Toda saída diz de onde veio: escritório, relatório, período, filtros,
// quando foi emitida e por quem. No .xlsx isso vai numa aba "Parâmetros";
// no CSV, que é só dado, vai no nome do arquivo e no registro. Cada
// exportação fica registrada em `exportacoes` (quem, qual relatório, filtros,
// quantas linhas, totais) — sem copiar o conteúdo.
//
// Quem chama passa o universo INTEIRO do filtro (db.todos), nunca só a
// página da tela.

import { avisar } from '../../nucleo/avisos.js';
import { baixarArquivo, gerarCsv } from '../../nucleo/csv.js';
import { estado } from '../../nucleo/estado.js';
import { dataHora, hoje } from '../../nucleo/formato.js';
import { html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { gerarXlsx } from '../../nucleo/xlsx.js';
import { RAZAO } from '../../escritorio.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @param {object} p
 * @param {string} p.relatorio       nome legível ("Contas a receber")
 * @param {string} p.arquivo         base do nome do arquivo, sem extensão
 * @param {'xlsx'|'csv'} p.formato
 * @param {object[]} p.colunas       { titulo, valor(linha), tipo }
 * @param {object[]} p.linhas
 * @param {[string, string][]} [p.filtros]   [rótulo, valor] legíveis
 * @param {Record<string, number>} [p.totais] em centavos
 * @param {{ nome, colunas, linhas }[]} [p.outrasAbas]
 */
export async function exportar({ relatorio, arquivo, formato, colunas, linhas, filtros = [], totais = {}, outrasAbas = [] }) {
  const emitido = new Date().toISOString();
  const parametros = [
    ['Escritório', RAZAO],
    ['Relatório', relatorio],
    ...filtros,
    ['Linhas', String(linhas.length)],
    ...Object.entries(totais).map(([k, v]) => [k, (Math.round(v) / 100).toFixed(2).replace('.', ',')]),
    ['Emitido em', dataHora(emitido)],
    ['Emitido por', estado.membro?.nome ?? ''],
  ];
  const nome = `${arquivo}-${hoje()}`;
  if (formato === 'xlsx') {
    baixarArquivo(`${nome}.xlsx`, gerarXlsx({ parametros, abas: [{ nome: relatorio, colunas, linhas }, ...outrasAbas] }), XLSX);
  } else {
    baixarArquivo(`${nome}.csv`, gerarCsv(colunas, linhas));
  }
  // O registro não pode impedir a exportação que já aconteceu.
  db.inserir('exportacoes', {
    relatorio, formato, filtros: Object.fromEntries(filtros), quantidade: linhas.length,
    totais: Object.fromEntries(Object.entries(totais).map(([k, v]) => [k, Math.round(v) / 100])),
  }, 'id').catch(() => {});
  avisar(`${relatorio}: ${linhas.length} ${linhas.length === 1 ? 'linha exportada' : 'linhas exportadas'}.`);
}

/** Os dois botões, para pôr ao lado de uma lista. */
export const botoesExportar = (acao = 'exportar') => html`
  <button type="button" class="botao botao--pequeno nao-imprimir" data-acao="${acao}" data-formato="xlsx">Excel (.xlsx)</button>
  <button type="button" class="botao botao--pequeno nao-imprimir" data-acao="${acao}" data-formato="csv">CSV</button>`;
