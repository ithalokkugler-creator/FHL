// Planilha para o Excel em português (preparação 6.4 F).
// ======================================================
//
// O CSV do protótipo não abria certo: vírgula como separador e ponto decimal
// embaralham as colunas no Excel brasileiro, e sem BOM os acentos viram lixo.
// Aqui: ponto e vírgula, vírgula decimal, BOM e quebra de linha do Windows.
//
// gerarCsv é puro e testado em sistema/testes/.

import { data } from './formato.js';

/**
 * @param {{ titulo: string, valor: (linha: object) => any, tipo?: 'texto'|'moeda'|'data'|'numero' }[]} colunas
 *        moeda em centavos
 * @param {object[]} linhas
 */
export function gerarCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => celula(c.titulo, 'texto')).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l), c.tipo ?? 'texto')).join(';'));
  return `﻿${[cabecalho, ...corpo].join('\r\n')}\r\n`;
}

function celula(valor, tipo) {
  if (valor == null || valor === '') return '';

  let texto;
  if (tipo === 'moeda') texto = (Math.round(valor) / 100).toFixed(2).replace('.', ',');
  else if (tipo === 'numero') texto = String(valor).replace('.', ',');
  else if (tipo === 'data') texto = data(valor);
  else {
    texto = String(valor);
    // Texto que começa com = + - @ vira fórmula no Excel. A aspa simples na
    // frente mantém como texto — e impede que um nome digitado rode fórmula.
    if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  }

  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Texto de um CSV → linhas de células (texto). Aceita ";" (Excel em
 * português), "," e tabulação — o separador é o que mais aparece fora de
 * aspas na primeira linha —, aspas com "" dentro e BOM no começo.
 */
export function lerCsv(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const fora = primeira.replace(/"[^"]*"/g, '');
  const separador = [';', ',', '\t'].map((s) => [s, fora.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];

  const linhas = [];
  let linha = [];
  let celulaAtual = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        celulaAtual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else celulaAtual += c;
    } else if (c === '"') aspas = true;
    else if (c === separador) {
      linha.push(celulaAtual);
      celulaAtual = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(celulaAtual);
      linhas.push(linha);
      linha = [];
      celulaAtual = '';
    } else celulaAtual += c;
  }
  if (celulaAtual !== '' || linha.length) {
    linha.push(celulaAtual);
    linhas.push(linha);
  }
  return linhas;
}

export function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
