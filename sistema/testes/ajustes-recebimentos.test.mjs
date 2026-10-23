import test from 'node:test';
import assert from 'node:assert/strict';
import { paginarRecebimentos } from '../js/dominio/recebimentos.js';

test('Contrato oferece todos os 1.001 pagamentos em páginas sem perder nem repetir ids', () => {
  const recebimentos = Array.from({ length: 1001 }, (_, i) => ({ id: `recebimento-${i}`, valor: 0.01 }));
  const vistos = [];
  for (let p = 1; p <= 11; p++) {
    const r = paginarRecebimentos(recebimentos, [], p);
    assert.equal(r.total, 1001);
    assert.equal(r.paginas, 11);
    assert(r.linhas.length <= 100);
    vistos.push(...r.linhas.map((x) => x.id));
  }
  assert.equal(new Set(vistos).size, 1001);
  assert.deepEqual(vistos, recebimentos.map((x) => x.id));
});

test('Antecipação permanece inteira na fronteira da página e na ordem dos vencimentos', () => {
  const outros = Array.from({ length: 99 }, (_, i) => ({ id: `outro-${i}` }));
  const pai = { id: 'pai' };
  const filho1 = { id: 'filho1', antecipacao_de: 'pai', parcela_id: 'p1', parcela_numero: 5 };
  const filho2 = { id: 'filho2', antecipacao_de: 'pai', parcela_id: 'p2', parcela_numero: 6 };
  const recebimentos = [filho1, ...outros, filho2, pai, { id: 'seguinte' }];
  const parcelas = [{ id: 'p1', vencimento: '2027-01-01' }, { id: 'p2', vencimento: '2027-02-01' }];
  const primeira = paginarRecebimentos(recebimentos, parcelas, 1);
  assert.equal(primeira.total, 101);
  assert.deepEqual(primeira.linhas.slice(-3).map((r) => r.id), ['pai', 'filho2', 'filho1']);
  assert.deepEqual(paginarRecebimentos(recebimentos, parcelas, 2).linhas.map((r) => r.id), ['seguinte']);
  assert.deepEqual(recebimentos[0], filho1);
});

test('Página inválida é limitada ao conjunto atual e vínculo ausente não faz linha desaparecer', () => {
  const lista = [{ id: 'orfao', antecipacao_de: 'pai-ausente' }];
  assert.equal(paginarRecebimentos(lista, [], 99).pagina, 1);
  assert.equal(paginarRecebimentos(lista, [], 99).linhas[0].id, 'orfao');
  assert.equal(paginarRecebimentos([], [], -1).total, 0);
});
