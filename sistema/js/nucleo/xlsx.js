// Planilha do Excel (.xlsx) de verdade, sem biblioteca (preparação T11/T15).
// =========================================================================
//
// GERAR: uma aba "Parâmetros" (escritório, relatório, período, filtros,
// emissão, quem emitiu) e as abas de dados. Dinheiro sai como NÚMERO com
// formato de moeda; data, como data do Excel; CPF/CNPJ, número CNJ e código,
// como TEXTO — zeros à esquerda e os 20 dígitos do processo ficam intactos.
// Texto é sempre "inlineStr": um nome que começa com "=" nunca vira fórmula.
//
// LER (importação): valores das células, sem executar fórmula — de célula
// com fórmula vale o resultado que o Excel guardou; sem resultado guardado,
// a célula volta vazia e é contada em `formulasSemValor`.
//
// Arquivo puro, sem DOM: é testado em sistema/testes/.

import { gerarZip, lerZip } from './zip.js';

const escapar = (t) => String(t)
  // Caracteres de controle não cabem em XML 1.0.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0 → A, 25 → Z, 26 → AA. */
export function coluna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** 'AAAA-MM-DD' → número de série do Excel (dias desde 30/12/1899). */
export function serialDaData(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export function dataDoSerial(serial, data1904 = false) {
  const base = data1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

const nomeDaAba = (nome, usados) => {
  let n = String(nome).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Planilha';
  for (let i = 2; usados.has(n.toLowerCase()); i++) n = `${n.slice(0, 28)} ${i}`;
  usados.add(n.toLowerCase());
  return n;
};

// Estilos: 0 normal · 1 moeda · 2 data · 3 cabeçalho · 4 inteiro · 5 decimal
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EFEC"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celula(ref, valor, tipo) {
  if (valor == null || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor))) return '';
  if (tipo === 'moeda') return `<c r="${ref}" s="1"><v>${Math.round(Number(valor)) / 100}</v></c>`;
  if (tipo === 'data') {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(valor))) return '';
    return `<c r="${ref}" s="2"><v>${serialDaData(String(valor))}</v></c>`;
  }
  if (tipo === 'inteiro') return `<c r="${ref}" s="4"><v>${Math.round(Number(valor))}</v></c>`;
  if (tipo === 'numero') return `<c r="${ref}" s="5"><v>${Number(valor)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

function aba({ colunas, linhas }) {
  const largura = (c) => c.largura ?? (c.tipo === 'moeda' ? 15 : c.tipo === 'data' ? 12 : Math.min(48, Math.max(12, c.titulo.length + 4)));
  const cabecalho = colunas.map((c, i) => `<c r="${coluna(i)}1" s="3" t="inlineStr"><is><t>${escapar(c.titulo)}</t></is></c>`).join('');
  const corpo = linhas.map((l, n) => `<row r="${n + 2}">${colunas.map((c, i) => celula(`${coluna(i)}${n + 2}`, c.valor(l), c.tipo ?? 'texto')).join('')}</row>`).join('');
  const fim = `${coluna(Math.max(colunas.length - 1, 0))}${linhas.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${largura(c)}" customWidth="1"/>`).join('')}</cols>
<sheetData><row r="1">${cabecalho}</row>${corpo}</sheetData>
${linhas.length ? `<autoFilter ref="A1:${fim}"/>` : ''}
</worksheet>`;
}

/**
 * @param {{ parametros?: [string, string][], abas: { nome: string, colunas: {titulo, valor, tipo?, largura?}[], linhas: any[] }[] }} p
 *   `valor(linha)`; moeda em CENTAVOS, data 'AAAA-MM-DD'.
 * @returns {Uint8Array}
 */
export function gerarXlsx({ parametros = [], abas }) {
  const todas = [
    ...(parametros.length ? [{
      nome: 'Parâmetros',
      colunas: [{ titulo: 'Item', valor: (l) => l[0], largura: 28 }, { titulo: 'Valor', valor: (l) => l[1], largura: 70 }],
      linhas: parametros,
    }] : []),
    ...abas,
  ];
  const usados = new Set();
  const nomes = todas.map((a) => nomeDaAba(a.nome, usados));
  const arquivos = [
    {
      nome: '[Content_Types].xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${todas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
    },
    {
      nome: '_rels/.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((n, i) => `<sheet name="${escapar(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${todas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${todas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nome: 'xl/styles.xml', conteudo: ESTILOS },
    ...todas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: aba(a) })),
  ];
  return gerarZip(arquivos);
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const decodificar = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const textosDe = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodificar(m[1])).join('');

const atributo = (tag, nome) => new RegExp(`\\s${nome}="([^"]*)"`).exec(tag)?.[1];

/** "AB12" → índice da coluna (AB = 27). */
const indiceColuna = (ref) => [...ref.replace(/\d+/g, '')].reduce((s, c) => s * 26 + c.charCodeAt(0) - 64, 0) - 1;

const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Bytes de um .xlsx → { abas: [{ nome, linhas: any[][] }], formulasSemValor }.
 * Número com formato de data vira 'AAAA-MM-DD'.
 */
export async function lerXlsx(bytes) {
  const arquivos = await lerZip(bytes);
  const ler = (nome) => (arquivos.has(nome) ? new TextDecoder().decode(arquivos.get(nome)) : '');

  const compartilhados = [...ler('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textosDe(m[1]));

  // Estilos com formato de data.
  const estilos = ler('xl/styles.xml');
  const customData = new Set([...estilos.matchAll(/<numFmt\s[^>]*\/>/g)]
    .filter((m) => /[dmy]/i.test(decodificar(atributo(m[0], 'formatCode') ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '')))
    .map((m) => Number(atributo(m[0], 'numFmtId'))));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] ?? '';
  const estiloData = [...xfs.matchAll(/<xf\s[^>]*?(?:\/>|>)/g)].map((m) => {
    const id = Number(atributo(m[0], 'numFmtId') ?? 0);
    return FORMATOS_DATA.has(id) || customData.has(id);
  });

  const livro = ler('xl/workbook.xml');
  const data1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(livro);
  const relacoes = new Map([...ler('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*\/>/g)]
    .map((m) => [atributo(m[0], 'Id'), atributo(m[0], 'Target')]));

  let formulasSemValor = 0;
  const abas = [];
  for (const m of livro.matchAll(/<sheet\s[^>]*\/>/g)) {
    const nome = decodificar(atributo(m[0], 'name') ?? '');
    const alvo = relacoes.get(atributo(m[0], 'r:id'));
    if (!alvo) continue;
    const caminho = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
    const xml = ler(caminho);
    const linhas = [];
    for (const r of xml.matchAll(/<row\s[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const numero = Number(atributo(r[0], 'r'));
      if (numero && (!Number.isInteger(numero) || numero < 1 || numero > 20001)) throw new Error('Planilha com linhas além do limite de 20.000: divida o arquivo e remova linhas vazias no final.');
      const linha = [];
      for (const c of (r[1] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c ${c[1]}>`;
        const ref = atributo(tag, 'r');
        const t = atributo(tag, 't') ?? 'n';
        const s = Number(atributo(tag, 's') ?? 0);
        const dentro = c[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1];
        let valor = null;
        if (/<f[\s>]/.test(dentro) && v == null) formulasSemValor++;
        else if (t === 's') valor = compartilhados[Number(v)] ?? '';
        else if (t === 'inlineStr') valor = textosDe(dentro);
        else if (t === 'str') valor = decodificar(v ?? '');
        else if (t === 'b') valor = v === '1';
        else if (t === 'e') valor = null;
        else if (v != null) {
          const n = Number(v);
          valor = estiloData[s] && Number.isFinite(n) ? dataDoSerial(n, data1904) : n;
        }
        const coluna = ref ? indiceColuna(ref) : linha.length;
        if (!Number.isInteger(coluna) || coluna < 0 || coluna >= 256) throw new Error('Planilha com colunas além do limite de 256: use as colunas do modelo.');
        linha[coluna] = valor;
      }
      if (linhas.length >= 20001 && !numero) throw new Error('Mais de 20.000 linhas: divida o arquivo.');
      linhas[(numero || linhas.length + 1) - 1] = Array.from(linha, (x) => x ?? null);
    }
    abas.push({ nome, linhas: Array.from(linhas, (x) => x ?? []) });
  }
  return { abas, formulasSemValor };
}
