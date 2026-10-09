// ZIP mínimo: o suficiente para gerar e ler planilhas .xlsx.
// =========================================================
//
// Um .xlsx é um ZIP de arquivos XML. Para não trazer biblioteca de fora
// (o sistema não tem dependências nem CDN), aqui está só o necessário:
//
//   · gerar: arquivos guardados sem compressão ("store") — válido para o
//     Excel, determinístico e síncrono;
//   · ler: "store" e "deflate", usando o DecompressionStream do próprio
//     navegador (ou do Node 21+, nos testes).
//
// Arquivo puro, sem DOM: é testado em sistema/testes/.

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = new TextEncoder();

/** [{ nome: 'xl/workbook.xml', conteudo: string | Uint8Array }] → Uint8Array (.zip) */
export function gerarZip(arquivos) {
  const partes = [];
  const central = [];
  let deslocamento = 0;
  // Data fixa (1/1/2026 00:00): o arquivo não muda a cada geração.
  const hora = 0;
  const dia = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const a of arquivos) {
    const nome = utf8.encode(a.nome);
    const dados = typeof a.conteudo === 'string' ? utf8.encode(a.conteudo) : a.conteudo;
    const crc = crc32(dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // store
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, dados);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), nome);
    deslocamento += 30 + nome.length + dados.length;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todas) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

async function inflar(bytes, limite) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const leitor = fluxo.getReader();
  const partes = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      total += value.length;
      if (total > limite) throw new Error('Planilha grande demais ou com tamanho inconsistente.');
      partes.push(value);
    }
  } catch (erro) {
    await leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    leitor.releaseLock();
  }
  const saida = new Uint8Array(total);
  let p = 0;
  for (const parte of partes) { saida.set(parte, p); p += parte.length; }
  return saida;
}

// Limites contra "bomba de ZIP": arquivo que se expande para gigabytes.
const LIMITE_ARQUIVOS = 2000;
const LIMITE_EXPANDIDO = 100 * 1024 * 1024;

/** Lê um .zip → Map(nome → Uint8Array). */
export async function lerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('O arquivo não é uma planilha .xlsx válida.');
  const quantos = v.getUint16(fim + 10, true);
  if (quantos > LIMITE_ARQUIVOS) throw new Error('Planilha com estrutura grande demais.');
  if (v.getUint16(fim + 4, true) || v.getUint16(fim + 6, true) || v.getUint16(fim + 8, true) !== quantos) throw new Error('Planilha ZIP dividida não suportada.');
  let p = v.getUint32(fim + 16, true);
  const fimCentral = p + v.getUint32(fim + 12, true);
  if (fimCentral > fim) throw new Error('Planilha corrompida.');
  const arquivos = new Map();
  let expandido = 0;
  const texto = new TextDecoder();

  for (let n = 0; n < quantos; n++) {
    if (p + 46 > fimCentral || v.getUint32(p, true) !== 0x02014b50) throw new Error('Planilha corrompida.');
    if (v.getUint16(p + 8, true) & 1) throw new Error('Remova a senha da planilha antes de importar.');
    const metodo = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const comprimido = v.getUint32(p + 20, true);
    const tamanho = v.getUint32(p + 24, true);
    const nomeLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const comentarioLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    if (p + 46 + nomeLen + extraLen + comentarioLen > fimCentral || local + 30 > fim || v.getUint32(local, true) !== 0x04034b50) throw new Error('Planilha corrompida.');
    const nome = texto.decode(bytes.subarray(p + 46, p + 46 + nomeLen));
    p += 46 + nomeLen + extraLen + comentarioLen;
    if (arquivos.has(nome)) throw new Error('Planilha com arquivos internos repetidos.');

    expandido += tamanho;
    if (expandido > LIMITE_EXPANDIDO) throw new Error('Planilha grande demais depois de aberta.');
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (inicio + comprimido > v.getUint32(fim + 16, true)) throw new Error('Planilha corrompida.');
    const dados = bytes.subarray(inicio, inicio + comprimido);
    let abertos;
    if (metodo === 0) abertos = dados;
    else if (metodo === 8) abertos = await inflar(dados, tamanho);
    else throw new Error('Compressão de planilha não suportada.');
    if (abertos.length !== tamanho || crc32(abertos) !== crc) throw new Error('Planilha corrompida: tamanho ou integridade inválidos.');
    arquivos.set(nome, abertos);
  }
  return arquivos;
}
