import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contarPorMes, contarSituacoes, formatarMedia, lerPeriodo, mesDe, mesesDoPeriodo,
} from '../js/dominio/indicadores.js';

// Pedidos de 12/11/2026. Dados fictícios.

// ---------------------------------------------------------------------------
// Números de Contratos, Clientes e Processos
// ---------------------------------------------------------------------------

test('Período: só os da lista; o resto vira o padrão de 6 meses', () => {
  assert.equal(lerPeriodo('3'), 3);
  assert.equal(lerPeriodo('12'), 12);
  assert.equal(lerPeriodo('1'), 1);
  assert.equal(lerPeriodo('7'), 6);
  assert.equal(lerPeriodo(undefined), 6);
  assert.equal(lerPeriodo('abc'), 6);
});

test('Meses do período terminam no mês atual e atravessam o ano', () => {
  assert.deepEqual(mesesDoPeriodo(3, '2026-11-12'), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(mesesDoPeriodo(4, '2027-02-28'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(mesesDoPeriodo(12, '2026-11-30').length, 12);
  assert.equal(mesesDoPeriodo(12, '2026-11-30')[0], '2025-12');
  assert.deepEqual(mesesDoPeriodo(1, '2026-03-31'), ['2026-03']);
});

test('Mês de uma data de calendário não passa por fuso; o de um instante é o de Brasília', () => {
  assert.equal(mesDe('2026-10-31'), '2026-10');
  // 23h30 de 31/10 em Brasília = 02h30 de 01/11 em UTC: ainda é outubro aqui.
  assert.equal(mesDe('2026-11-01T02:30:00Z'), '2026-10');
  assert.equal(mesDe('2026-11-01T03:00:00Z'), '2026-11');
  assert.equal(mesDe(null), null);
  assert.equal(mesDe('lixo'), null);
});

test('Contagem por mês: total, este mês e média com o mês vazio contando', () => {
  const contratos = [
    { data_contrato: '2026-11-03' }, { data_contrato: '2026-11-10' },
    { data_contrato: '2026-09-15' }, { data_contrato: '2026-06-01' }, // fora de 3 meses
    { data_contrato: null },
  ];
  const c = contarPorMes(contratos, (x) => x.data_contrato, { meses: 3, dia: '2026-11-12' });
  assert.deepEqual(c.porMes, [{ mes: '2026-09', total: 1 }, { mes: '2026-10', total: 0 }, { mes: '2026-11', total: 2 }]);
  assert.equal(c.total, 3);
  assert.equal(c.esteMes, 2);
  assert.equal(c.media, 1);
  const seis = contarPorMes(contratos, (x) => x.data_contrato, { meses: 6, dia: '2026-11-12' });
  assert.equal(seis.total, 4);
  assert.equal(seis.media, 0.7);
  assert.equal(formatarMedia(seis.media), '0,7');
  assert.equal(formatarMedia(2), '2');
});

test('Clientes novos pelo cadastro, no fuso de Brasília', () => {
  const clientes = [
    { criado_em: '2026-11-01T02:59:00Z' }, // 31/10, 23h59 em Brasília
    { criado_em: '2026-11-01T03:00:00Z' },
    { criado_em: '2026-11-12T15:00:00Z' },
  ];
  const c = contarPorMes(clientes, (x) => x.criado_em, { meses: 2, dia: '2026-11-12' });
  assert.deepEqual(c.porMes.map((x) => x.total), [1, 2]);
});

test('Situações dos processos: ativos são todos menos suspensos e encerrados', () => {
  const s = contarSituacoes([
    { situacao: 'em_andamento' }, { situacao: 'em_andamento' }, { situacao: 'em_analise' },
    { situacao: 'aguardando_documentos' }, { situacao: 'suspenso' }, { situacao: 'encerrado' }, { situacao: 'encerrado' },
  ]);
  assert.equal(s.total, 7);
  assert.equal(s.ativos, 4);
  assert.equal(s.suspensos, 1);
  assert.equal(s.encerrados, 2);
  assert.equal(s.porSituacao.em_andamento, 2);
  assert.deepEqual(contarSituacoes([]), { total: 0, ativos: 0, suspensos: 0, encerrados: 0, porSituacao: {} });
});
