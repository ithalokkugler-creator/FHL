import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarOab } from '../js/dominio/consulta-djen.js';

const oab = { numero: '123', uf: 'PR', chave: '123/PR' };
const periodo = { de: '2026-10-01', ate: '2026-10-08' };
const resposta = (items, headers = {}, count = 1000) => new Response(JSON.stringify({ items, count }), { headers });
const lote = Array.from({ length: 100 }, (_, id) => ({ id }));
const rodar = (buscar, extras = {}) => consultarOab('https://cnj.example/api/v1', oab, periodo, { buscar, pausar: async () => {}, ...extras });

test('DJEN: cabeçalho de limite ausente não interrompe a segunda página', async () => {
  let pedidos = 0;
  const r = await rodar(async () => (++pedidos === 1 ? resposta(lote) : resposta([{ id: 101 }])));
  assert.equal(pedidos, 2);
  assert.equal(r.itens.length, 101);
  assert.equal(r.completa, true);
});

for (const [nome, falha] of [
  ['HTTP 429', async () => new Response('', { status: 429 })],
  ['rede', async () => { throw new Error('Rede indisponível'); }],
  ['resposta inválida', async () => new Response('{}')],
]) test(`DJEN: preserva a primeira página antes de falha ${nome}`, async () => {
  let pedidos = 0;
  const r = await rodar(async () => (++pedidos === 1 ? resposta(lote) : falha()));
  assert.equal(r.itens.length, 100);
  assert.equal(r.completa, false);
  assert.ok(r.erro);
});

test('DJEN: limite de páginas nunca se apresenta como consulta completa', async () => {
  const r = await rodar(async () => resposta(lote), { maxPaginas: 2 });
  assert.equal(r.itens.length, 200);
  assert.equal(r.completa, false);
  assert.match(r.erro, /Divida o período/);
});

test('DJEN: esgotamento na última página informa parar também as outras OABs', async () => {
  const r = await rodar(async () => resposta([{ id: 1 }], { 'x-ratelimit-remaining': '0' }));
  assert.equal(r.completa, true);
  assert.equal(r.limitada, true);
});

test('DJEN: aborto antes da consulta não faz pedido nem marca completa', async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await rodar(async () => { assert.fail('Não deveria buscar.'); }, { sinal: controller.signal });
  assert.equal(r.completa, false);
  assert.match(r.erro, /interrompida/);
});
