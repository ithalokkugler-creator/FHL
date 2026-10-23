// Pedidos do Vinícius (22/10/2026): antecipação de parcelas e documentos
// solicitados/entregues no processo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { descreverAntecipacao, planoAntecipacao } from '../js/dominio/parcelas.js';
import { montarRecibo } from '../js/documentos/recibo.js';
import {
  ordenarDocumentos, prepararDocumentoProcesso, resumoDocumentos, situacaoDocumento,
} from '../js/dominio/documentos-processo.js';

// 6 × 500, a 1ª vencida — como no exemplo dele.
const contrato = [
  { id: 'p1', numero: 1, vencimento: '2026-10-19', saldo: '500.00', situacao: 'vencida', parte: 'fixo', cota_escritorio_pct: '100.00' },
  { id: 'p2', numero: 2, vencimento: '2026-11-19', saldo: '500.00', situacao: 'a_vencer', parte: 'fixo', cota_escritorio_pct: '100.00' },
  { id: 'p3', numero: 3, vencimento: '2026-12-19', saldo: '500.00', situacao: 'a_vencer', parte: 'fixo', cota_escritorio_pct: '100.00' },
  { id: 'p4', numero: 4, vencimento: '2027-01-19', saldo: '500.00', situacao: 'a_vencer', parte: 'fixo', cota_escritorio_pct: '100.00' },
  { id: 'p5', numero: 5, vencimento: '2027-02-19', saldo: '500.00', situacao: 'a_vencer', parte: 'fixo', cota_escritorio_pct: '100.00' },
  { id: 'p6', numero: 6, vencimento: '2027-03-19', saldo: '500.00', situacao: 'a_vencer', parte: 'fixo', cota_escritorio_pct: '100.00' },
];
const resumo = (plano) => plano.itens.map((a) => `${a.numero}:${a.valor}:${a.saldoDepois}`).join(' ');

test('Antecipação: 750 numa parcela de 500 quita o mês e abate 250 da ÚLTIMA', () => {
  const plano = planoAntecipacao(contrato, contrato[0], '2026-10-22', 25000);
  assert.equal(resumo(plano), '6:25000:25000');
  assert.equal(plano.sobra, 0);
  assert.equal(plano.disponivel, 250000, 'as cinco seguintes, inteiras');
  assert.deepEqual(plano.foraDaData, []);
});

test('Antecipação: de trás para frente, quitando a última e abatendo a penúltima', () => {
  const plano = planoAntecipacao(contrato, contrato[0], '2026-10-22', 120000);
  assert.equal(resumo(plano), '6:50000:0 5:50000:0 4:20000:30000');
  assert.equal(plano.sobra, 0);
});

test('Antecipação: o que passa de todas as próximas sobra (e a tela recusa)', () => {
  const plano = planoAntecipacao(contrato, contrato[0], '2026-10-22', 260000);
  assert.equal(plano.itens.length, 5);
  assert.equal(plano.sobra, 10000);
});

test('Antecipação: parcela paga, renegociada, cancelada ou do êxito fica de fora', () => {
  const lista = contrato.map((p) => ({ ...p }));
  lista[5] = { ...lista[5], saldo: '0.00', situacao: 'paga' };
  lista[4] = { ...lista[4], situacao: 'renegociada' };
  lista[3] = { ...lista[3], situacao: 'cancelada' };
  lista.push({ id: 'e1', numero: 7, vencimento: '2027-06-19', saldo: '2000.00', situacao: 'a_vencer', parte: 'exito', cota_escritorio_pct: '100.00' });
  const plano = planoAntecipacao(lista, lista[0], '2026-10-22', 60000);
  assert.equal(resumo(plano), '3:50000:0 2:10000:40000');
});

test('Antecipação: só as que vencem depois da data do pagamento; as vencidas antes são avisadas', () => {
  const lista = contrato.map((p) => ({ ...p }));
  lista[1] = { ...lista[1], vencimento: '2026-10-21', situacao: 'vencida' };
  // Recebendo a 1ª com pagamento de 22/10: a 2ª já venceu e não entra.
  let plano = planoAntecipacao(lista, lista[0], '2026-10-22', 25000);
  assert.equal(resumo(plano), '6:25000:25000');
  assert.deepEqual(plano.foraDaData, [{ numero: 2, vencimento: '2026-10-21' }], 'a vencida antes da data, com número e vencimento');
  // Pagamento lançado com data de 20/10: a 2ª ainda ia vencer, então entra.
  plano = planoAntecipacao(lista, lista[0], '2026-10-20', 300000);
  assert.equal(plano.itens.map((a) => a.numero).join(','), '6,5,4,3,2');
  assert.deepEqual(plano.foraDaData, []);
});

test('Antecipação: acordo (com parte de cliente) não antecipa', () => {
  const acordo = contrato.map((p) => ({ ...p, cota_escritorio_pct: '30.00' }));
  const plano = planoAntecipacao(acordo, acordo[0], '2026-10-22', 25000);
  assert.equal(plano.itens.length, 0);
  assert.equal(plano.sobra, 25000);
  assert.equal(plano.disponivel, 0);
});

test('Antecipação: a nota resume as quitadas e destaca a que fica em parte', () => {
  const texto = (excedente) => descreverAntecipacao(planoAntecipacao(contrato, contrato[0], '2026-10-22', excedente).itens).replace(/\s/g, ' ');
  assert.equal(texto(25000), 'abatem a parcela 6 (vence 19/03/2027), que fica com R$ 250,00 em aberto');
  assert.equal(texto(50000), 'quitam a parcela 6 (vence 19/03/2027)');
  assert.equal(texto(120000), 'vão para as últimas parcelas, de trás para frente: quitam as parcelas 6 e 5 (R$ 1.000,00) '
    + 'e abatem R$ 200,00 da parcela 4 (vence 19/01/2027), que fica com R$ 300,00 em aberto');
  assert.equal(texto(250000), 'vão para as últimas parcelas, de trás para frente: quitam as parcelas 6, 5, 4, 3 e 2 (R$ 2.500,00)');
});

test('Antecipação: empate de vencimento vai pelo número maior primeiro', () => {
  const lista = [
    contrato[0],
    { ...contrato[1], id: 'a', numero: 7, vencimento: '2027-05-01' },
    { ...contrato[2], id: 'b', numero: 8, vencimento: '2027-05-01' },
  ];
  assert.equal(resumo(planoAntecipacao(lista, lista[0], '2026-10-22', 60000)), '8:50000:0 7:10000:40000');
});

test('Recibo de antecipação: um recibo com o total e cada parte', () => {
  const r = {
    id: 'abcdef12-0000-4000-8000-000000000003', parcela_id: 'p1', parcela_numero: 1, contrato_descricao: 'Honorários mensais',
    data: '2026-10-22', valor: 515, valor_principal: 500, valor_encargos: 15, valor_multa: 10, valor_juros: 5,
    valor_correcao: 0, valor_acrescimo: 0, encargos_discriminados: true, valor_repasse: 0, cota_escritorio_pct: 100,
    forma_nome: 'Pix', criado_em: '2026-10-22T12:00:00Z',
  };
  const texto = String(montarRecibo({
    recebimento: r, parcela: { vencimento: '2026-10-19' }, contrato: { codigo: 'C010/2026' },
    cliente: { nome: 'Cliente Fictício', documento: null }, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-22',
    antecipacoes: [
      { numero: 6, vencimento: '2027-03-19', valor: 50000, saldoDepois: 0 },
      { numero: 5, vencimento: '2027-02-19', valor: 23500, saldoDepois: 26500 },
    ],
  }));
  assert.match(texto, /a importância de\s*<strong>R\$\s*1\.250,00<\/strong> \(mil, duzentos e cinquenta reais\)/);
  assert.match(texto, /referente à parcela 1 do contrato/);
  assert.match(texto, /, e à antecipação de parcelas vincendas do mesmo contrato/);
  assert.match(texto, /Parcela 1 — abatido do valor devido/);
  assert.match(texto, /Antecipação — Parcela 6 \(vence 19\/03\/2027\)<\/td><td class="num">R\$\s*500,00/);
  assert.match(texto, /Antecipação — Parcela 5 \(vence 19\/02\/2027\)<\/td><td class="num">R\$\s*235,00/);
  assert.match(texto, /Total recebido<\/strong><\/td><td class="num"><strong>R\$\s*1\.250,00/);
  assert.match(texto, /a parcela 1 fica quitada e, com a antecipação, a parcela 6 fica quitada e a parcela 5 fica com R\$\s*265,00 em aberto/);
  assert.match(texto, /não dá quitação de outras parcelas ou obrigações, além das indicadas neste recibo/);
  const varias = String(montarRecibo({
    recebimento: r, cliente: { nome: 'Cliente Fictício' }, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-22',
    antecipacoes: [6, 5, 4].map((numero) => ({ numero, vencimento: '2027-01-19', valor: 50000, saldoDepois: 0 }))
      .concat([{ numero: 3, vencimento: '2026-12-19', valor: 5000, saldoDepois: 45000 }]),
  }));
  assert.match(varias, /as parcelas 6, 5 e 4 ficam quitadas e a parcela 3 fica com R\$\s*450,00 em aberto/, 'quitadas numa frase só');

  // Sem antecipação, o recibo continua o de sempre.
  const normal = String(montarRecibo({ recebimento: r, cliente: { nome: 'Cliente Fictício' }, saldoDepois: 0, emitente: 'Admin', dia: '2026-10-22' }));
  assert.match(normal, /<strong>R\$\s*515,00<\/strong>/);
  assert.doesNotMatch(normal, /antecipação/i);
  assert.match(normal, /Com este pagamento, esta parcela fica quitada/);
  assert.match(normal, /referente à parcela 1/);
  assert.doesNotMatch(normal, /além das indicadas/);
});

const DIA = '2026-10-22';
const doc = (extra) => ({ id: 'd', documento: 'Certidão', movimento: 'solicitado', data: '2026-10-10', ...extra });

test('Documentos: a situação do retorno', () => {
  assert.deepEqual(situacaoDocumento(doc({ retorno_previsto: '2026-10-20' }), DIA), { chave: 'atrasado', texto: 'Retorno atrasado · 2 dias', tom: 'perigo' });
  assert.equal(situacaoDocumento(doc({ retorno_previsto: '2026-10-21' }), DIA).texto, 'Retorno atrasado · 1 dia');
  assert.equal(situacaoDocumento(doc({ retorno_previsto: DIA }), DIA).chave, 'hoje');
  assert.deepEqual(situacaoDocumento(doc({ retorno_previsto: '2026-10-25' }), DIA), { chave: 'perto', texto: 'Retorno em 3 dias · 25/10/2026', tom: 'alerta' });
  assert.equal(situacaoDocumento(doc({ retorno_previsto: '2026-10-26' }), DIA).chave, 'aguardando');
  assert.equal(situacaoDocumento(doc({}), DIA).chave, 'sem_prazo');
  assert.equal(situacaoDocumento(doc({ retorno_previsto: '2026-10-01', retornou_em: '2026-10-15' }), DIA).texto, 'Retornou em 15/10/2026');
  assert.equal(situacaoDocumento(doc({ retorno_previsto: '2026-10-01', cancelado_em: '2026-10-11T10:00:00Z' }), DIA).chave, 'cancelado');
});

test('Documentos: resumo da linha do processo e ordem da lista', () => {
  const lista = [
    doc({ id: 'a', data: '2026-10-01', retorno_previsto: '2026-11-30' }),
    doc({ id: 'b', data: '2026-10-05', retorno_previsto: '2026-10-20' }),
    doc({ id: 'c', data: '2026-10-15' }),
    doc({ id: 'd', data: '2026-10-12', retorno_previsto: '2026-10-14', retornou_em: '2026-10-14' }),
    doc({ id: 'e', data: '2026-10-18', retorno_previsto: '2026-10-19', cancelado_em: '2026-10-18T12:00:00Z' }),
  ];
  assert.deepEqual(resumoDocumentos(lista, DIA), { total: 4, aguardando: 2, atrasados: 1 }, 'aguardando conta os atrasados, como o filtro');
  assert.deepEqual(resumoDocumentos(undefined, DIA), { total: 0, aguardando: 0, atrasados: 0 });
  assert.equal(ordenarDocumentos(lista, DIA).map((d) => d.id).join(''), 'bacde',
    'aguardando primeiro (o mais urgente no topo), depois sem prazo, os que voltaram e os cancelados');
});

test('Documentos: o formulário é conferido como no banco, apontando o campo', () => {
  const ok = prepararDocumentoProcesso({ documento: '  RG e CPF  ', movimento: 'entregue', data: DIA, quem_recebeu: ' ', retorno_previsto: '', observacoes: ' x ' }, DIA);
  assert.deepEqual(ok, { documento: 'RG e CPF', movimento: 'entregue', data: DIA, quem_recebeu: null, retorno_previsto: null, retornou_em: null, observacoes: 'x' });
  const falha = (d, campo, re) => assert.throws(() => prepararDocumentoProcesso({ documento: 'X', movimento: 'solicitado', data: DIA, ...d }, DIA),
    (e) => e.campo === campo && re.test(e.message));
  falha({ documento: '  ' }, 'documento', /Informe o documento/);
  falha({ documento: 'x'.repeat(201) }, 'documento', /até 200 letras/);
  falha({ movimento: 'perdido' }, 'movimento', /solicitado ou entregue/);
  falha({ data: '2026-10-23' }, 'data', /não pode estar no futuro/);
  falha({ retorno_previsto: '2026-10-21' }, 'retorno_previsto', /não pode ser antes/);
  falha({ data: '2026-10-10', retornou_em: '2026-10-09' }, 'retornou_em', /não pode ser antes/);
  falha({ data: '2026-10-10', retornou_em: '2026-10-23' }, 'retornou_em', /não pode estar no futuro/);
  // O campo de data do navegador aceita ano de 3 ou 5 dígitos.
  falha({ data: '0202-10-22' }, 'data', /Confira o ano da data/);
  falha({ retorno_previsto: '20261-10-22' }, 'retorno_previsto', /Confira o ano do prazo/);
  falha({ retorno_previsto: '2050-10-22' }, 'retorno_previsto', /Confira o ano do prazo/);
});
