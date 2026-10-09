// npm run sistema:test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { atualizar, memoriaParaGravar } from '../js/dominio/atraso.js';
import { mensagemDeCobranca } from '../js/dominio/cobranca.js';
import { fatorDoPeriodo } from '../js/dominio/indices.js';
import { gerarParcelas, nomeDaParcela, posicoes, somaDasParcelas } from '../js/dominio/parcelas.js';

test('atraso: exemplo da preparação (6.5)', () => {
  const r = atualizar({
    saldo: 100000, vencimento: '2026-08-01', dataCalculo: '2026-09-15',
    multaPct: 2, jurosMesPct: 1,
    correcao: { nome: 'IPCA', fator: 1.008, meses: ['2026-08'], faltando: [] },
  });
  assert.equal(r.dias, 45);
  assert.equal(r.corrigido, 100800);
  assert.equal(r.multa, 2016);
  assert.equal(r.juros, 1512);
  assert.equal(r.total, 104328);
  assert.equal(r.encargos, 4328);
});

test('atraso: critério do protótipo, 10% + 1% ao mês, sem correção', () => {
  const r = atualizar({ saldo: 100000, vencimento: '2026-08-01', dataCalculo: '2026-09-15', multaPct: 10, jurosMesPct: 1 });
  assert.equal(r.multa, 10000);
  assert.equal(r.juros, 1500);
  assert.equal(r.total, 111500);
});

test('atraso: em dia e dentro da carência não há encargo', () => {
  const emDia = atualizar({ saldo: 50000, vencimento: '2026-09-15', dataCalculo: '2026-09-15', multaPct: 10, jurosMesPct: 1 });
  assert.equal(emDia.total, 50000);
  assert.equal(emDia.emAtraso, false);

  const carencia = atualizar({
    saldo: 50000, vencimento: '2026-09-10', dataCalculo: '2026-09-15', multaPct: 10, jurosMesPct: 1, carenciaDias: 5,
  });
  assert.equal(carencia.total, 50000);

  const passou = atualizar({
    saldo: 50000, vencimento: '2026-09-10', dataCalculo: '2026-09-15', multaPct: 10, jurosMesPct: 1, carenciaDias: 4,
  });
  assert.equal(passou.multa, 5000);
  assert.equal(passou.juros, 83); // 500,00 × 1% × 5/30 = 0,833…
  assert.equal(passou.total, 55083);
});

test('atraso: deflação não reduz a dívida abaixo do valor nominal (STJ, Tema 678)', () => {
  const r = atualizar({
    saldo: 100000, vencimento: '2026-08-06', dataCalculo: '2026-09-15', multaPct: 10, jurosMesPct: 1,
    correcao: { nome: 'IPCA', fator: 0.9968, meses: ['2026-08'], faltando: [] },
  });
  assert.equal(r.corrigido, 100000);
  assert.equal(r.correcao, 0);
  assert.equal(r.multa, 10000);
  assert.match(r.passos[1].detalhe, /valor nominal/);
  assert.equal(r.indice.fator, 0.9968);
  assert.equal(r.indice.aplicado, 1);
});

test('atraso: meio centavo arredonda para cima', () => {
  const r = atualizar({ saldo: 12325, vencimento: '2026-09-01', dataCalculo: '2026-09-02', multaPct: 2, jurosMesPct: 0 });
  assert.equal(r.multa, 247); // 123,25 × 2% = 2,465
});

test('atraso: memória lista as etapas e grava em reais', () => {
  const r = atualizar({
    saldo: 100000, vencimento: '2026-08-01', dataCalculo: '2026-09-15', multaPct: 10, jurosMesPct: 1,
    correcao: { nome: 'IPCA', fator: 1, meses: [], faltando: [] },
  });
  assert.deepEqual(r.passos.map((p) => p.rotulo), [
    'Saldo em aberto',
    'Correção pelo IPCA (sem mês completo no período)',
    'Multa de 10%',
    'Juros de 1% ao mês por 45 dias',
    'Total atualizado',
  ]);
  const m = memoriaParaGravar(r);
  assert.equal(m.total, 1115);
  assert.equal(m.dias_atraso, 45);
});

test('parcelas: arredondamento vai para a última', () => {
  const lista = gerarParcelas({ total: 100000, quantidade: 3, primeiroVencimento: '2026-10-10' });
  assert.deepEqual(lista.map((p) => p.valor), [33333, 33333, 33334]);
  assert.deepEqual(lista.map((p) => p.vencimento), ['2026-10-10', '2026-11-10', '2026-12-10']);
  assert.equal(somaDasParcelas(lista), 100000);
});

test('parcelas: entrada vira a parcela 0', () => {
  const lista = gerarParcelas({
    total: 100000, entrada: 30000, dataEntrada: '2026-09-15', quantidade: 2, primeiroVencimento: '2026-10-15',
  });
  assert.deepEqual(lista, [
    { numero: 0, vencimento: '2026-09-15', valor: 30000 },
    { numero: 1, vencimento: '2026-10-15', valor: 35000 },
    { numero: 2, vencimento: '2026-11-15', valor: 35000 },
  ]);
});

test('parcelas: dia 31 volta a ser 31 quando o mês tem', () => {
  const lista = gerarParcelas({ total: 30000, quantidade: 3, primeiroVencimento: '2026-01-31' });
  assert.deepEqual(lista.map((p) => p.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('parcelas: pagamento à vista, só entrada', () => {
  assert.equal(gerarParcelas({ total: 50000, entrada: 50000, dataEntrada: '2026-09-15' }).length, 1);
});

test('parcelas: valores inválidos são recusados', () => {
  assert.throws(
    () => gerarParcelas({ total: 10000, entrada: 20000, dataEntrada: '2026-09-15', quantidade: 1, primeiroVencimento: '2026-10-01' }),
    /entrada/,
  );
  assert.throws(() => gerarParcelas({ total: 10000, quantidade: 0, primeiroVencimento: '2026-10-01' }), /número de parcelas/);
});

test('parcelas: renegociação não confunde a posição com o número do banco', () => {
  // Plano de 3; a 2 e a 3 foram renegociadas em duas novas, a 4 e a 5.
  const lista = [
    { id: 'e', numero: 0 },
    { id: 'a', numero: 1 },
    { id: 'b', numero: 2 },
    { id: 'c', numero: 3 },
    { id: 'd', numero: 4, origem_renegociacao_id: 'r1' },
    { id: 'f', numero: 5, origem_renegociacao_id: 'r1' },
  ];
  const pos = posicoes(lista);
  assert.equal(pos.has('e'), false, 'a entrada fica fora da contagem');
  assert.deepEqual(pos.get('c'), { posicao: 3, total: 3 });
  assert.deepEqual(pos.get('d'), { posicao: 1, total: 2 });
  assert.deepEqual(pos.get('f'), { posicao: 2, total: 2 });
  assert.equal(nomeDaParcela(0), 'Entrada');
  assert.equal(nomeDaParcela(5), 'Parcela 5');
});

test('índices: acumula do mês do vencimento ao mês anterior ao cálculo', () => {
  const mapa = new Map([['2026-05', 0.58], ['2026-06', 0.16], ['2026-07', 0.07], ['2026-08', -0.32]]);
  const r = fatorDoPeriodo(mapa, '2026-05-10', '2026-09-15');
  assert.deepEqual(r.meses, ['2026-05', '2026-06', '2026-07', '2026-08']);
  assert.ok(Math.abs(r.fator - 1.0058 * 1.0016 * 1.0007 * 0.9968) < 1e-12);
  assert.deepEqual(r.faltando, []);
});

test('índices: mês sem índice publicado fica anotado; mesmo mês não corrige', () => {
  const r = fatorDoPeriodo(new Map([['2026-07', 0.07]]), '2026-07-20', '2026-09-05');
  assert.deepEqual(r.faltando, ['2026-08']);
  assert.equal(fatorDoPeriodo(new Map(), '2026-09-01', '2026-09-30').fator, 1);
});

test('cobrança: mensagem pronta para colar no WhatsApp', () => {
  const modelo = 'Olá, {cliente}! Aqui é {remetente}, da Fonseca Lisboa Advocacia.\n\n'
    + 'Consta em aberto: {parcelas}.\nValor atualizado até hoje: {total}.\n{pix}\n'
    + 'Se o pagamento já foi feito, por favor desconsidere.';
  const texto = mensagemDeCobranca({
    modelo, cliente: 'Maria da Silva', remetente: 'Juliana', total: 111500,
    parcelas: [{ numero: 2, vencimento: '2026-08-01', total: 111500 }],
    pix: { chave: '12.345.678/0001-90', titular: 'Fonseca Lisboa Advocacia' },
  });
  assert.match(texto, /^Olá, Maria! Aqui é Juliana/);
  assert.match(texto, /parcela 2 de 01\/08\/2026 \(R\$\s1\.115,00\)/);
  assert.match(texto, /Chave Pix: 12\.345\.678\/0001-90 — Fonseca Lisboa Advocacia/);

  const semPix = mensagemDeCobranca({ modelo, cliente: 'Maria', remetente: 'Juliana', total: 100, parcelas: [], pix: null });
  assert.doesNotMatch(semPix, /\n\n\n/);
  assert.doesNotMatch(semPix, /Chave Pix/);
});
