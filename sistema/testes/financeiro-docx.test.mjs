// Partes puras da entrega do Financeiro (DOCX): extenso do recibo, planilha
// .xlsx, leitura de CSV, parcelas por valor e quinzenais, encargos
// discriminados e filtros das listas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { numeroPorExtenso, valorPorExtenso } from '../js/dominio/extenso.js';
import { gerarXlsx, lerXlsx, serialDaData, dataDoSerial } from '../js/nucleo/xlsx.js';
import { crc32, lerZip } from '../js/nucleo/zip.js';
import { lerCsv } from '../js/nucleo/csv.js';
import { gerarParcelas, gerarParcelasPorValor, somaDasParcelas } from '../js/dominio/parcelas.js';
import { componentesDosEncargos } from '../js/dominio/atraso.js';
import { lerData, linhasDoModelo, normalizarPlanilha } from '../js/dominio/importacao.js';

test('valor por extenso para o recibo', () => {
  assert.equal(valorPorExtenso(40000), 'quatrocentos reais');
  assert.equal(valorPorExtenso(100), 'um real');
  assert.equal(valorPorExtenso(5), 'cinco centavos');
  assert.equal(valorPorExtenso(123456), 'mil, duzentos e trinta e quatro reais e cinquenta e seis centavos');
  assert.equal(valorPorExtenso(10000), 'cem reais');
  assert.equal(valorPorExtenso(10100), 'cento e um reais');
  assert.equal(valorPorExtenso(100000000), 'um milhão de reais');
  assert.equal(numeroPorExtenso(1001), 'mil e um');
  assert.equal(numeroPorExtenso(2500000), 'dois milhões e quinhentos mil');
  assert.equal(numeroPorExtenso(1300), 'mil e trezentos');
  assert.equal(numeroPorExtenso(21), 'vinte e um');
});

test('xlsx: tipos certos, texto que parece fórmula fica texto, ida e volta', async () => {
  const linhas = Array.from({ length: 1205 }, (_, i) => ({
    nome: i === 0 ? '=HYPERLINK("http://x")' : `Cliente ${i}`,
    doc: '00123456789', valor: 123456 + i, data: '2026-10-08', cnj: '00012342220258160001',
  }));
  const bytes = gerarXlsx({
    parametros: [['Relatório', 'Teste'], ['Período', '01/10/2026 a 31/10/2026']],
    abas: [{
      nome: 'Dados: [teste]/1',
      colunas: [
        { titulo: 'Nome', valor: (l) => l.nome },
        { titulo: 'CPF', valor: (l) => l.doc },
        { titulo: 'Valor', valor: (l) => l.valor, tipo: 'moeda' },
        { titulo: 'Vencimento', valor: (l) => l.data, tipo: 'data' },
        { titulo: 'Processo', valor: (l) => l.cnj },
      ],
      linhas,
    }],
  });
  const arquivos = await lerZip(bytes);
  const folha = new TextDecoder().decode(arquivos.get('xl/worksheets/sheet2.xml'));
  assert.doesNotMatch(folha, /<f>/, 'nenhuma fórmula');
  assert.match(folha, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
  assert.match(new TextDecoder().decode(arquivos.get('xl/workbook.xml')), /name="Dados   teste  1"/);

  const lida = await lerXlsx(bytes);
  const dados = lida.abas[1].linhas;
  assert.equal(dados.length, 1206, 'todas as 1.205 linhas e o cabeçalho');
  assert.deepEqual(dados[1], ['=HYPERLINK("http://x")', '00123456789', 1234.56, '2026-10-08', '00012342220258160001']);
  assert.equal(lida.abas[0].linhas[2][1], '01/10/2026 a 31/10/2026');
  assert.equal(serialDaData('2026-10-08'), 46303);
  assert.equal(dataDoSerial(46303), '2026-10-08');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('csv: separador, aspas e BOM', () => {
  assert.deepEqual(lerCsv('﻿nome;valor\r\n"Silva; José";"1.234,56"\r\nOutro;"diz ""oi"""\n'),
    [['nome', 'valor'], ['Silva; José', '1.234,56'], ['Outro', 'diz "oi"']]);
  assert.deepEqual(lerCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('parcelas pelo valor da parcela e quinzenais', () => {
  const p = gerarParcelasPorValor({ total: 100000, valorParcela: 30000, primeiroVencimento: '2026-01-31' });
  assert.deepEqual(p.map((x) => x.valor), [30000, 30000, 30000, 10000]);
  assert.deepEqual(p.map((x) => x.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  const c = gerarParcelasPorValor({ total: 100000, entrada: 10000, dataEntrada: '2026-01-10', valorParcela: 45000, primeiroVencimento: '2026-02-10' });
  assert.deepEqual(c.map((x) => [x.numero, x.valor]), [[0, 10000], [1, 45000], [2, 45000]]);
  assert.equal(somaDasParcelas(c), 100000);
  const q = gerarParcelas({ total: 100000, quantidade: 3, primeiroVencimento: '2026-12-25', frequencia: 'quinzenal' });
  assert.deepEqual(q.map((x) => x.vencimento), ['2026-12-25', '2027-01-09', '2027-01-24']);
  assert.deepEqual(q.map((x) => x.valor), [33333, 33333, 33334]);
  assert.throws(() => gerarParcelasPorValor({ total: 100000, valorParcela: 1, primeiroVencimento: '2026-01-01' }), /120 parcelas/);
});

test('encargos discriminados somam exatamente o que passou do saldo', () => {
  const calculo = { correcao: 1234, multa: 10123, juros: 3375 };
  const r = componentesDosEncargos(calculo, 14732);
  assert.equal(r.correcao + r.multa + r.juros + r.acrescimo, 14732);
  assert.deepEqual(r, { correcao: 1234, multa: 10123, juros: 3375, acrescimo: 0 });
  const parcial = componentesDosEncargos(calculo, 7000);
  assert.equal(parcial.correcao + parcial.multa + parcial.juros, 7000);
  assert.equal(parcial.acrescimo, 0);
  assert.deepEqual(componentesDosEncargos(calculo, 15000), { correcao: 1234, multa: 10123, juros: 3375, acrescimo: 268 });
  assert.deepEqual(componentesDosEncargos({ correcao: 0, multa: 0, juros: 0 }, 500), { correcao: 0, multa: 0, juros: 0, acrescimo: 500 });
  assert.deepEqual(componentesDosEncargos(calculo, 0), { correcao: 0, multa: 0, juros: 0, acrescimo: 0 });
});

test('importação: o modelo lido de volta, totais ignorados, erro de célula apontado', () => {
  const modelo = linhasDoModelo();
  const r = normalizarPlanilha(modelo);
  assert.equal(r.linhas.length, 3);
  const [p1, p2, d1] = r.linhas;
  assert.equal(p1.tipo, 'parcela');
  assert.equal(p1.linha, 2);
  assert.equal(p1.normalizado.documento, '52998224725');
  assert.equal(p1.normalizado.valor, 500);
  assert.equal(p1.normalizado.valor_pago, 500);
  assert.equal(p1.normalizado.vencimento, '2026-02-10');
  // Célula vazia não vira "zero pago".
  assert.equal(p2.normalizado.valor_pago, null);
  assert.equal(p1.chave_origem, p2.chave_origem);
  assert.equal(d1.tipo, 'despesa');
  assert.equal(d1.normalizado.competencia, '2026-01-01');
  assert.equal(d1.normalizado.tipo_despesa, 'fixa');

  // Títulos com acento e sinônimos, aba "Despesas", linha de total, data inválida.
  const outra = normalizarPlanilha([
    ['Descrição', 'Data de vencimento', 'Valor', 'Pago em'],
    ['Internet', '05/13/2026', 'R$ 99,90', ''],
    ['TOTAL', '', '99,90', ''],
    ['Café', 46000, 12.5, ''],
  ], 'Despesas');
  assert.equal(outra.ignoradas, 1);
  assert.equal(outra.linhas.length, 2);
  assert.equal(outra.linhas[0].normalizado.valor, 99.9);
  assert.match(outra.linhas[0].mensagens[0].texto, /Vencimento inválida/);
  assert.equal(outra.linhas[1].normalizado.valor, 12.5);
  assert.equal(normalizarPlanilha([['tipo', 'descricao', 'valor'], ['TOTAL', '', '10,00'], ['despesa', 'Luz', '10,00']]).ignoradas, 1);
  assert.equal(lerData('2026-02-30'), NaN);
  assert.equal(lerData('1/2/26'), '2026-02-01');
});
