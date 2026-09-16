// npm run sistema:test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { conflitos, distribuirColunas } from '../js/dominio/agenda.js';

test('agenda: compromissos sobrepostos ficam lado a lado', () => {
  const a = { nome: 'a', inicio: 540, fim: 600 }; // 9h–10h
  const b = { nome: 'b', inicio: 570, fim: 630 }; // 9h30–10h30
  const c = { nome: 'c', inicio: 600, fim: 660 }; // 10h–11h, cabe na coluna de a
  const d = { nome: 'd', inicio: 660, fim: 720 }; // 11h–12h, grupo novo

  distribuirColunas([d, c, b, a]);
  assert.deepEqual([a.coluna, b.coluna, c.coluna, d.coluna], [0, 1, 0, 0]);
  assert.deepEqual([a.colunas, b.colunas, c.colunas, d.colunas], [2, 2, 2, 1]);
});

test('agenda: três ao mesmo tempo usam três colunas', () => {
  const itens = [{ inicio: 840, fim: 900 }, { inicio: 840, fim: 870 }, { inicio: 850, fim: 880 }];
  distribuirColunas(itens);
  assert.deepEqual(itens.map((i) => i.colunas), [3, 3, 3]);
  assert.deepEqual(new Set(itens.map((i) => i.coluna)), new Set([0, 1, 2]));
});

test('agenda: conflito conta só o mesmo responsável e o intervalo mínimo', () => {
  const h = (hh, mm = 0) => Date.UTC(2026, 8, 15, hh, mm);
  const existentes = [
    { id: '1', membro_id: 'ju', inicio: h(14), fim: h(15) },
    { id: '2', membro_id: 'ju', inicio: h(15, 10), fim: h(16) },
    { id: '3', membro_id: 'vi', inicio: h(14), fim: h(15) },
  ];

  const encavalado = conflitos({ membro_id: 'ju', inicio: h(14, 30), fim: h(15, 5) }, existentes, 15);
  assert.deepEqual(encavalado.sobrepostos.map((e) => e.id), ['1']);
  assert.deepEqual(encavalado.colados.map((e) => e.id), ['2']);

  const livre = conflitos({ membro_id: 'ju', inicio: h(16, 30), fim: h(17) }, existentes, 15);
  assert.equal(livre.sobrepostos.length + livre.colados.length, 0);

  const semIntervalo = conflitos({ membro_id: 'ju', inicio: h(15), fim: h(15, 10) }, existentes, 0);
  assert.equal(semIntervalo.sobrepostos.length + semIntervalo.colados.length, 0);

  const editandoOProprio = conflitos({ id: '1', membro_id: 'ju', inicio: h(14), fim: h(15) }, existentes, 0);
  assert.equal(editandoOProprio.sobrepostos.length, 0);
});
