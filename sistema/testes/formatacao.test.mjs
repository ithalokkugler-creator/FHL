// Barra de formatação dos documentos: as classes que ela grava precisam ter
// regra na tela (sistema.css) e passar pela lista branca (nucleo/higienizar.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  categoriaDaClasse, CATEGORIAS, classeDe, cssFormatacao, FONTES, REALCES, CORES, TAMANHOS,
} from '../js/documentos/formatacao.js';

const css = readFileSync(new URL('../css/sistema.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('Formatação: o bloco de sistema.css é o gerado por cssFormatacao', () => {
  const bloco = css.split('/* formatacao:inicio */')[1]?.split('/* formatacao:fim */')[0]?.trim();
  assert.ok(bloco, 'faltam os marcadores formatacao:inicio/fim em sistema.css');
  assert.equal(bloco, cssFormatacao('.documento-folha '),
    'sistema.css divergiu de documentos/formatacao.js: copie cssFormatacao(\'.documento-folha \') para o bloco');
});

test('Formatação: toda classe passa pela lista branca dos documentos', () => {
  const classes = [...cssFormatacao('').matchAll(/^\.([^ ]+) \{/gm)].map((m) => m[1]);
  assert.ok(classes.length > 40);
  for (const c of classes) assert.match(c, /^doc-[a-z0-9-]+$/, c);
  assert.equal(new Set(classes).size, classes.length, 'classe repetida');
});

test('Formatação: categoria de cada classe de trecho, e nada fora da lista', () => {
  for (const [categoria, { valores }] of Object.entries(CATEGORIAS)) {
    for (const v of valores) assert.equal(categoriaDaClasse(classeDe(categoria, v)), categoria);
  }
  assert.equal(categoriaDaClasse('doc-cor-azul-claro'), 'cor');
  assert.equal(categoriaDaClasse('doc-tam-12'), 'tamanho');
  assert.equal(categoriaDaClasse('doc-falta'), null);
  assert.equal(categoriaDaClasse('doc-cor-inventada'), null);
  assert.equal(categoriaDaClasse('doc-alinhar-centro'), null);
  assert.equal(FONTES[0][1], 'Times New Roman', 'a primeira fonte é a do papel');
  assert.ok(TAMANHOS.includes(12));
  for (const [, , cor] of [...CORES, ...REALCES]) assert.match(cor, /^#[0-9A-F]{6}$/);
});
