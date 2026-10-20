// Fixo + êxito, contrato encadeado e acordo com repasse (out/2026): as contas
// que a tela faz antes de o banco conferir.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { divisaoDoRecebimento, divisaoDoRepasse, inicioDepoisDe, posicoes } from '../js/dominio/parcelas.js';
import { montarRecibo } from '../js/documentos/recibo.js';

test('Repasse: a divisão é a mesma do banco, em centavos', () => {
  // 30% de R$ 1.000,00 → 300,00 do escritório e 700,00 do cliente.
  assert.deepEqual(divisaoDoRepasse(100000, 30), { escritorio: 30000, cliente: 70000 });
  // round(333,33 × 30 / 100, 2) = 100,00 (99,999 arredonda para cima).
  assert.deepEqual(divisaoDoRepasse(33333, 30), { escritorio: 10000, cliente: 23333 });
  // Meio centavo arredonda para cima, como o round() do Postgres.
  assert.deepEqual(divisaoDoRepasse(105, 50), { escritorio: 53, cliente: 52 });
  // Cota com casas decimais: 33,33% de R$ 1.000,00.
  assert.deepEqual(divisaoDoRepasse(100000, 33.33), { escritorio: 33330, cliente: 66670 });
  // 100%: nada é do cliente.
  assert.deepEqual(divisaoDoRepasse(12345, 100), { escritorio: 12345, cliente: 0 });
});

test('Repasse: multa e juros entram na mesma proporção (1.050 → 315 + 735)', () => {
  assert.deepEqual(divisaoDoRepasse(105000, 30), { escritorio: 31500, cliente: 73500 });
});

test('Repasse: pagamento em partes fecha com a parcela inteira, no centavo', () => {
  // Três de R$ 111,11 a 30%: 33,33 + 33,34 + 33,33 = 100,00 (e não 99,99).
  const primeiro = divisaoDoRepasse(11111, 30);
  const segundo = divisaoDoRepasse(11111, 30, { valor: 11111, escritorio: primeiro.escritorio });
  const terceiro = divisaoDoRepasse(11111, 30, { valor: 22222, escritorio: primeiro.escritorio + segundo.escritorio });
  assert.deepEqual([primeiro.escritorio, segundo.escritorio, terceiro.escritorio], [3333, 3334, 3333]);
  assert.equal(primeiro.escritorio + segundo.escritorio + terceiro.escritorio, divisaoDoRepasse(33333, 30).escritorio);
  // Nunca negativo nem acima do valor recebido.
  assert.deepEqual(divisaoDoRepasse(1, 30, { valor: 100, escritorio: 40 }), { escritorio: 0, cliente: 1 });
  assert.deepEqual(divisaoDoRepasse(1, 30, { valor: 100, escritorio: 0 }), { escritorio: 1, cliente: 0 });
});

test('Acordo com cota própria em multa e juros: cada parte com a sua, no centavo', () => {
  // 1.000 de principal a 30% + 100 de encargos a 50% → 350 do escritório.
  assert.deepEqual(divisaoDoRecebimento({ principal: 100000, encargos: 10000 }, { cota: 30, cotaEncargos: 50 }),
    { escritorio: 35000, cliente: 75000 });
  // Sem cota própria (ou igual), é a conta de sempre sobre o total.
  assert.deepEqual(divisaoDoRecebimento({ principal: 100000, encargos: 10000 }, { cota: 30, cotaEncargos: null }),
    divisaoDoRepasse(110000, 30));
  assert.deepEqual(divisaoDoRecebimento({ principal: 100000, encargos: 10000 }, { cota: 30, cotaEncargos: 30 }),
    divisaoDoRepasse(110000, 30));
  // Em partes, como no banco: 33,33 + 5,00 e depois 66,68 → 105,01 no total.
  const primeiro = divisaoDoRecebimento({ principal: 11111, encargos: 1000 }, { cota: 30, cotaEncargos: 50 });
  const segundo = divisaoDoRecebimento({ principal: 22222, encargos: 1 }, { cota: 30, cotaEncargos: 50 },
    { principal: 11111, encargos: 1000, escritorio: primeiro.escritorio });
  assert.deepEqual([primeiro.escritorio, segundo.escritorio], [3833, 6668]);
  // Multa e juros todos do cliente (0%).
  assert.deepEqual(divisaoDoRecebimento({ principal: 10000, encargos: 1000 }, { cota: 30, cotaEncargos: 0 }),
    { escritorio: 3000, cliente: 8000 });
});

test('Encadeado: o novo começa um mês depois do que termina por último', () => {
  assert.equal(inicioDepoisDe({ ultimo_vencimento: '2026-12-15' }), '2027-01-15');
  // A vigência informada, se for depois do último vencimento, manda.
  assert.equal(inicioDepoisDe({ ultimo_vencimento: '2026-12-15', data_fim: '2027-02-28' }), '2027-03-28');
  assert.equal(inicioDepoisDe({ ultimo_vencimento: '2027-05-10', data_fim: '2027-02-28' }), '2027-06-10');
  // Fim de mês: 31/01 → 28/02, sem pular para março.
  assert.equal(inicioDepoisDe({ ultimo_vencimento: '2027-01-31' }), '2027-02-28');
  assert.equal(inicioDepoisDe({}), null);
});

test('Fixo + êxito: as parcelas do êxito contam à parte das do fixo', () => {
  const lista = [
    { id: 'e', numero: 0 },
    { id: 'f1', numero: 1, parte: 'fixo' },
    { id: 'f2', numero: 2, parte: 'fixo' },
    { id: 'x1', numero: 3, parte: 'exito' },
    { id: 'x2', numero: 4, parte: 'exito' },
    { id: 'x3', numero: 5, parte: 'exito' },
  ];
  const pos = posicoes(lista);
  assert.deepEqual(pos.get('f2'), { posicao: 2, total: 2 });
  assert.deepEqual(pos.get('x1'), { posicao: 1, total: 3 });
  assert.equal(pos.has('e'), false);
});

test('Recibo de acordo: recebe como procurador e separa honorários da parte do cliente', () => {
  const base = {
    id: 'abcdef12-0000-4000-8000-000000000001', parcela_id: 'p', parcela_numero: 1, contrato_descricao: 'Acordo — reclamatória',
    data: '2026-10-10', valor: 1000, valor_principal: 1000, valor_encargos: 0, criado_em: '2026-10-10T12:00:00Z',
  };
  const cliente = { nome: 'Cliente Fictício', documento: null };
  const acordo = String(montarRecibo({
    recebimento: { ...base, valor_repasse: 700, cota_escritorio_pct: 30, repasse_data: null },
    cliente, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-10',
  }));
  assert.match(acordo, /na qualidade de procuradores de/);
  assert.match(acordo, /R\$\s*300,00<\/strong> correspondem aos honorários/);
  assert.match(acordo, /a serem repassados/);

  const repassado = String(montarRecibo({
    recebimento: { ...base, valor_repasse: 700, cota_escritorio_pct: 30, repasse_data: '2026-10-11' },
    cliente, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-12',
  }));
  assert.match(repassado, /repassados em 11\/10\/2026/);

  // Sem repasse, o recibo continua o de sempre.
  const normal = String(montarRecibo({ recebimento: base, cliente, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-10' }));
  assert.match(normal, /Recebemos de/);
  assert.doesNotMatch(normal, /procuradores/);
});

test('Recibo de acordo pago direto ao cliente: só os honorários entraram', () => {
  const r = {
    id: 'abcdef12-0000-4000-8000-000000000002', parcela_id: 'p', parcela_numero: 2, contrato_descricao: 'Acordo — reclamatória',
    data: '2026-10-20', valor: 350, valor_principal: 1000, valor_encargos: 100, valor_direto_cliente: 750, valor_repasse: 0,
    cota_escritorio_pct: 30, cota_encargos_pct: 50, direto_ao_cliente: true, criado_em: '2026-10-20T12:00:00Z',
  };
  const texto = String(montarRecibo({
    recebimento: r, cliente: { nome: 'Cliente Fictício', documento: null }, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-20',
  }));
  assert.match(texto, /na qualidade de procuradores de/);
  assert.match(texto, /R\$\s*350,00<\/strong> \(trezentos e cinquenta reais\), correspondente aos honorários advocatícios \(30%; multa e juros, 50%\)/);
  assert.match(texto, /pagamento de R\$\s*1\.100,00 feito pela parte contrária/);
  assert.match(texto, /R\$\s*750,00<\/strong>.*foi paga diretamente a ele\(a\)/s);
  assert.doesNotMatch(texto, /a serem repassados/);
});
