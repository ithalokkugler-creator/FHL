import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName } from '../../supabase/functions/_shared/vendor/pdf-lib-1.17.1/pdf-lib.js';
import { riscoEstruturalNoPdf } from '../../supabase/functions/_shared/verificar-pdf.js';
import { criarFinalizador, riscoNoPdf } from '../../supabase/functions/finalizar-anexo/handler.js';

const simples = async () => { const d = await PDFDocument.create(); d.addPage(); return d; };
test('PDF moderno com objetos comprimidos e PDF comum são aceitos sem modificar bytes', async () => {
  for (const useObjectStreams of [true, false]) {
    const doc = await simples();
    doc.setTitle('Contrato fictício para regressão');
    const bytes = await doc.save({ useObjectStreams });
    const before = createHash('sha256').update(bytes).digest('hex');
    assert.equal(await riscoEstruturalNoPdf(bytes), null);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), before);
  }
});

test('JavaScript dentro de ObjStm e referências indiretas é recusado pelo parser', async () => {
  const doc = await simples();
  doc.addJavaScript('prova-ficticia', 'app.alert("FICTICIO — não executado")');
  const bytes = await doc.save();
  assert.equal(riscoNoPdf(bytes), null, 'o teste exercita o conteúdo que não é visível no texto bruto');
  assert.match(await riscoEstruturalNoPdf(bytes), /JavaScript/);
});

test('Ação de abrir programa e arquivo embutido comprimidos são recusados', async () => {
  const launch = await simples();
  launch.catalog.set(PDFName.of('OpenAction'), launch.context.register(launch.context.obj({ S: 'Launch', F: 'ficticio.exe' })));
  assert.match(await riscoEstruturalNoPdf(await launch.save()), /programa|ação/);
  const attachment = await simples();
  await attachment.attach(new Uint8Array([1, 2, 3]), 'ficticio.txt');
  assert.match(await riscoEstruturalNoPdf(await attachment.save()), /embutido/);
});

test('Ações automáticas e ações externas em objetos comprimidos são recusadas', async () => {
  for (const tipo of ['SubmitForm', 'ImportData', 'GoToR', 'GoToE']) {
    const doc = await simples();
    const acao = doc.context.register(doc.context.obj({ S: tipo, F: 'https://ficticio.invalid/sem-rede' }));
    doc.catalog.set(PDFName.of('OpenAction'), acao);
    const bytes = await doc.save();
    assert.equal(riscoNoPdf(bytes), null);
    assert.match(await riscoEstruturalNoPdf(bytes), /ação/);
    assert.equal((await finalizar(bytes)).aprovado, false);
  }
  const adicional = await simples();
  adicional.catalog.set(PDFName.of('AA'), adicional.context.obj({ WC: adicional.context.obj({ S: 'URI', URI: 'https://ficticio.invalid' }) }));
  assert.match(await riscoEstruturalNoPdf(await adicional.save()), /automáticas/);
  const clicavel = await simples();
  clicavel.context.register(clicavel.context.obj({ Type: 'Action', S: 'URI', URI: 'https://ficticio.invalid' }));
  assert.equal(await riscoEstruturalNoPdf(await clicavel.save()), null);
});

test('Arquivo só com assinatura, documento truncado e objetos excessivos não recebem aprovação', async () => {
  assert.match(await riscoEstruturalNoPdf(new TextEncoder().encode('%PDF-1.7 falso')), /estrutura/);
  const doc = await simples();
  const bytes = await doc.save();
  assert.match(await riscoEstruturalNoPdf(bytes.slice(0, 50)), /estrutura/);
  // A lista inflada é interrompida durante a leitura, sem varrer milhões de offsets.
  const bomb = await simples();
  const stream = bomb.context.flateStream(new TextEncoder().encode('0 0'), { Type: 'ObjStm', N: 100000000, First: 0 });
  bomb.context.register(stream);
  assert.match(await riscoEstruturalNoPdf(await bomb.save({ useObjectStreams: false })), /estrutura|complexidade/);
});

test('Limite de descompressão recusa fluxo pequeno que expande além de 4 MiB', async () => {
  const doc = await simples();
  doc.context.register(doc.context.flateStream(new Uint8Array(4 * 1024 * 1024 + 1).fill(32), { Type: 'ObjStm', N: 0, First: 0 }));
  const bytes = await doc.save({ useObjectStreams: false });
  assert(bytes.length < 10000);
  assert.match(await riscoEstruturalNoPdf(bytes), /estrutura|complexidade/);
});

async function finalizar(bytes) {
  let aprovado;
  let hash;
  const handler = criarFinalizador({ url: 'https://ficticio.test', chave: 'sb_secret_ficticia', buscar: async (url, options = {}) => {
    if (url.includes('/anexos_versoes?')) return Response.json([{ id: '00000000-0000-4000-8000-000000000001', objeto: 'ficticio.pdf', estado: 'reservado', criado_por: 'autor' }]);
    if (url.endsWith('/iniciar_sessao')) return Response.json({ id: 'autor' });
    if (url.includes('/storage/')) return new Response(bytes);
    if (url.endsWith('/finalizar_anexo_servico')) { const p = JSON.parse(options.body); aprovado = p.p_aprovado; hash = p.p_sha256; return Response.json(null); }
    throw new Error('Rede não autorizada no teste: ' + url);
  } });
  const response = await handler(new Request('https://ficticio.test', { method: 'POST', headers: { authorization: 'Bearer ficticio' }, body: JSON.stringify({ versao_id: '00000000-0000-4000-8000-000000000001' }) }));
  return { status: response.status, body: await response.json(), aprovado, hash };
}

test('Finalizador integra a inspeção e registra recusa do PDF comprimido, preservando hash', async () => {
  const active = await simples(); active.addJavaScript('ficticio', 'app.alert("não executado")');
  const bytes = await active.save();
  const denied = await finalizar(bytes);
  assert.equal(denied.status, 422);
  assert.equal(denied.body.estado, 'recusado');
  assert.equal(denied.aprovado, false);
  assert.equal(denied.hash, createHash('sha256').update(bytes).digest('hex'));
  const safe = await finalizar(await (await simples()).save());
  assert.equal(safe.status, 200);
  assert.equal(safe.aprovado, true);
});
