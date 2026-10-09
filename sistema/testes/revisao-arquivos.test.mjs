import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { gerarZip, lerZip } from '../js/nucleo/zip.js';
import { gerarXlsx, lerXlsx, serialDaData, dataDoSerial } from '../js/nucleo/xlsx.js';
import { criarFinalizador, riscoNoPdf } from '../../supabase/functions/finalizar-anexo/handler.js';
import { criarAdministrador } from '../../supabase/functions/administrar-usuarios/handler.js';
import { saldoDepoisDe } from '../js/documentos/recibo.js';

const texto = new TextDecoder();
const enc = new TextEncoder();
const zip = () => gerarZip([{ nome: 'teste.xml', conteudo: 'dados completos' }]);
const central = (b) => new DataView(b.buffer).getUint32(b.length - 6, true);

test('ZIP recusa conteúdo alterado, tamanho falso, cabeçalho truncado e nomes repetidos', async () => {
  const alterado = zip(); alterado[40] ^= 1;
  await assert.rejects(lerZip(alterado), /integridade/);
  const falso = zip(); new DataView(falso.buffer).setUint32(central(falso) + 24, 1, true);
  await assert.rejects(lerZip(falso), /tamanho/);
  await assert.rejects(lerZip(zip().slice(0, 15)), /válida/);
  await assert.rejects(lerZip(gerarZip([{ nome: 'a', conteudo: 'x' }, { nome: 'a', conteudo: 'y' }])), /repetidos/);
});

function comprimido(tamanhoFalso = null) {
  const b = zip(); const v = new DataView(b.buffer);
  const c = central(b); const inicio = 30 + v.getUint16(26, true);
  const dados = deflateRawSync(b.subarray(inicio, c));
  const cab = b.slice(0, inicio);
  const diret = b.slice(c, -22);
  const fim = b.slice(-22);
  new DataView(cab.buffer).setUint16(8, 8, true);
  const vc = new DataView(diret.buffer);
  vc.setUint16(10, 8, true); vc.setUint32(20, dados.length, true);
  if (tamanhoFalso != null) vc.setUint32(24, tamanhoFalso, true);
  new DataView(fim.buffer).setUint32(16, cab.length + dados.length, true);
  return new Uint8Array(Buffer.concat([cab, dados, diret, fim]));
}

test('ZIP lê deflate real e interrompe a expansão além do tamanho declarado', async () => {
  assert.equal(texto.decode((await lerZip(comprimido())).get('teste.xml')), 'dados completos');
  await assert.rejects(lerZip(comprimido(1)), /grande demais|inconsistente/);
});

async function editarXlsx(alterar) {
  const mapa = await lerZip(gerarXlsx({ abas: [{ nome: 'Parcelas', colunas: [{ titulo: 'Data', valor: (l) => l, tipo: 'data' }], linhas: ['2026-10-08'] }] }));
  alterar(mapa);
  return gerarZip([...mapa].map(([nome, conteudo]) => ({ nome, conteudo })));
}

test('XLSX aceita calendário 1904 e horário fracionário sem mudar o dia', async () => {
  const b = await editarXlsx((m) => {
    m.set('xl/workbook.xml', enc.encode(texto.decode(m.get('xl/workbook.xml')).replace('<sheets>', '<workbookPr date1904="1"/><sheets>')));
    m.set('xl/worksheets/sheet1.xml', enc.encode(texto.decode(m.get('xl/worksheets/sheet1.xml')).replace(`<v>${serialDaData('2026-10-08')}</v>`, `<v>${serialDaData('2026-10-08') - 1462 + 0.75}</v>`)));
  });
  assert.equal((await lerXlsx(b)).abas[0].linhas[1][0], '2026-10-08');
  assert.equal(dataDoSerial(46303.75), '2026-10-08');
});

test('XLSX recusa índices gigantes antes de criar matrizes esparsas', async () => {
  const b = await editarXlsx((m) => m.set('xl/worksheets/sheet1.xml', enc.encode(texto.decode(m.get('xl/worksheets/sheet1.xml')).replace('<row r="2">', '<row r="2147483647">'))));
  await assert.rejects(lerXlsx(b), /limite/);
  const c = await editarXlsx((m) => m.set('xl/worksheets/sheet1.xml', enc.encode(texto.decode(m.get('xl/worksheets/sheet1.xml')).replace('r="A2"', 'r="XFD2"'))));
  await assert.rejects(lerXlsx(c), /colunas/);
});

test('PDF recusa nomes escapados e JavaScript referenciado indiretamente', () => {
  assert.match(riscoNoPdf(enc.encode('%PDF-1.7 /Java#53cript /JS 7 0 R')), /JavaScript/);
  assert.match(riscoNoPdf(enc.encode('%PDF-1.7 /JS 7 0 R')), /JavaScript/);
  assert.match(riscoNoPdf(enc.encode('%PDF-1.7 /La#75nch')), /programa/);
  assert.match(riscoNoPdf(enc.encode('%PDF-1.7 /Embedded#46ile')), /embutido/);
  assert.equal(riscoNoPdf(enc.encode('%PDF-1.7 /Type /Catalog')), null);
});

test('finalizador devolve erro controlado quando a rede falha, sem divulgar detalhes', async () => {
  const handler = criarFinalizador({ url: 'https://teste.local', chave: 'sb_secret_teste', buscar: async () => { throw new Error('segredo interno'); } });
  const r = await handler(new Request('https://teste.local', { method: 'POST', headers: { authorization: 'Bearer teste' }, body: JSON.stringify({ versao_id: '00000000-0000-0000-0000-000000000001' }) }));
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /segredo interno/);
});

const reqConvite = () => new Request('https://teste.local', { method: 'POST', headers: { authorization: 'Bearer teste' }, body: JSON.stringify({ acao: 'convidar', membro_id: '00000000-0000-0000-0000-000000000001' }) });
test('convite negado pelo banco nunca chega ao Auth; falha de rede retorna erro controlado', async () => {
  let chamadas = 0;
  const negado = criarAdministrador({ url: 'https://teste.local', chave: 'sb_secret_teste', buscar: async () => { chamadas++; return Response.json({ message: 'Sem permissão' }, { status: 403 }); } });
  assert.equal((await negado(reqConvite())).status, 403);
  assert.equal(chamadas, 1);
  const falhou = criarAdministrador({ url: 'https://teste.local', chave: 'sb_secret_teste', buscar: async () => { throw new Error('segredo'); } });
  const r = await falhou(reqConvite());
  assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /segredo/);
});
test('convite enviado mas sem histórico não anuncia sucesso nem incentiva reenvio duplicado', async () => {
  let n = 0;
  const h = criarAdministrador({ url: 'https://teste.local', chave: 'sb_secret_teste', buscar: async () => {
    n++; if (n === 1) return Response.json({ email: 'ficticio@teste.local', nome: 'Fictício', convite_id: '1' });
    if (n === 2) return Response.json({ id: 'ficticio' });
    return Response.json({}, { status: 500 });
  } });
  const r = await h(reqConvite());
  assert.equal(r.status, 503); assert.match((await r.json()).erro, /enviou.*antes de reenviar/);
});
test('saldo do recibo preserva pagamentos e ajustes que valiam na data do lançamento', () => {
  const r = { id: '1', data: '2026-10-01', criado_em: '2026-10-01T12:00:00Z', valor_principal: 400, estornado_em: null };
  const posterior = { id: '2', data: '2026-09-01', criado_em: '2026-10-02T12:00:00Z', valor_principal: 300 };
  const ajustePosterior = { tipo: 'desconto', valor: 500, criado_em: '2026-10-03T12:00:00Z' };
  assert.equal(saldoDepoisDe(r, [r, posterior], 100000, [ajustePosterior]), 60000);
  const anterior = { ...r, id: '0', criado_em: '2026-09-29T12:00:00Z', valor_principal: 100, estornado_em: '2026-10-02T12:00:00Z' };
  const desconto = { tipo: 'desconto', valor: 100, criado_em: '2026-09-30T12:00:00Z', estornado_em: '2026-10-03T12:00:00Z' };
  assert.equal(saldoDepoisDe(r, [anterior, r, posterior], 100000, [desconto]), 40000);
});
