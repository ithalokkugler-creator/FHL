// npm run sistema:test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { montarConsulta, termoDeBusca } from '../js/nucleo/consulta.js';
import { gerarCsv } from '../js/nucleo/csv.js';
import {
  dataExtensa, diasEntre, documento, documentoValido, hoje, inicioDaSemana, instante, lerMoeda, linkWhatsApp,
  moeda, noFuso, somarMeses, telefone,
} from '../js/nucleo/formato.js';

const semEspacoDuro = (t) => t.replace(/ /g, ' ');

test('lerMoeda entende o que se digita no Brasil', () => {
  assert.equal(lerMoeda('1.234,56'), 123456);
  assert.equal(lerMoeda('R$ 1.234,56'), 123456);
  assert.equal(lerMoeda('1234,5'), 123450);
  assert.equal(lerMoeda('1234.56'), 123456);
  assert.equal(lerMoeda('1.234'), 123400);
  assert.equal(lerMoeda('0,1'), 10);
  assert.equal(lerMoeda(''), null);
  assert.ok(Number.isNaN(lerMoeda('12a')));
});

test('moeda formata em reais', () => {
  assert.equal(semEspacoDuro(moeda(123456)), 'R$ 1.234,56');
  assert.equal(semEspacoDuro(moeda(5)), 'R$ 0,05');
});

test('somarMeses segura o fim do mês sem escorregar', () => {
  assert.equal(somarMeses('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(somarMeses('2026-01-31', 2, 31), '2026-03-31');
  assert.equal(somarMeses('2028-01-31', 1, 31), '2028-02-29');
  assert.equal(somarMeses('2026-11-15', 3), '2027-02-15');
  assert.equal(somarMeses('2026-03-10', -3), '2025-12-10');
});

test('dias e semanas de calendário', () => {
  assert.equal(diasEntre('2026-08-01', '2026-09-15'), 45);
  assert.equal(diasEntre('2026-09-15', '2026-09-15'), 0);
  assert.equal(inicioDaSemana('2026-09-15'), '2026-09-14');
  assert.equal(inicioDaSemana('2026-09-20'), '2026-09-14');
  assert.equal(dataExtensa('2026-09-15'), 'terça, 15 de setembro');
});

test('fuso de Paranaguá', () => {
  assert.equal(hoje(new Date('2026-09-16T02:30:00Z')), '2026-09-15');
  assert.equal(instante('2026-09-15', '14:30'), '2026-09-15T14:30:00-03:00');
  assert.deepEqual(noFuso('2026-09-15T17:30:00Z'), { dia: '2026-09-15', minuto: 870 });
  assert.deepEqual(noFuso('2026-09-16T02:00:00Z'), { dia: '2026-09-15', minuto: 1380 });
});

test('dígitos verificadores de CPF e CNPJ, inclusive o alfanumérico', () => {
  assert.equal(documentoValido('123.456.789-09'), true);
  assert.equal(documentoValido('123.456.789-00'), false);
  assert.equal(documentoValido('111.111.111-11'), false);
  assert.equal(documentoValido('11.222.333/0001-81'), true);
  assert.equal(documentoValido('11.222.333/0001-80'), false);
  assert.equal(documentoValido('12.ABC.345/01DE-35'), true);
  assert.equal(documentoValido('12.ABC.345/01DE-36'), false);
  assert.equal(documentoValido('123'), false);
});

test('documento, telefone e WhatsApp', () => {
  assert.equal(documento('12345678909'), '123.456.789-09');
  assert.equal(documento('12.ABC.345/01DE-35'), '12.ABC.345/01DE-35');
  assert.equal(telefone('41999998888'), '(41) 99999-8888');
  assert.equal(telefone('554121522607'), '(41) 2152-2607');
  assert.equal(linkWhatsApp('(41) 99999-8888', 'Olá'), 'https://wa.me/5541999998888?text=Ol%C3%A1');
  assert.equal(linkWhatsApp(''), null);
});

test('consulta da Data API', () => {
  assert.deepEqual(
    montarConsulta({
      select: 'id,nome',
      filtros: [
        ['situacao', 'in', ['a_vencer', 'vencida']],
        ['vencimento', 'gte', '2026-09-01'],
        ['vencimento', 'lte', '2026-09-30'],
        ['cancelado_em', 'is', null],
        ['or', '(nome.ilike.*ana*,documento.ilike.*ana*)'],
      ],
      ordem: 'vencimento.asc',
      limite: 50,
    }),
    [
      ['select', 'id,nome'],
      ['situacao', 'in.("a_vencer","vencida")'],
      ['vencimento', 'gte.2026-09-01'],
      ['vencimento', 'lte.2026-09-30'],
      ['cancelado_em', 'is.null'],
      ['or', '(nome.ilike.*ana*,documento.ilike.*ana*)'],
      ['order', 'vencimento.asc'],
      ['limit', '50'],
    ],
  );
});

test('busca digitada não vira filtro', () => {
  assert.equal(termoDeBusca('maria silva'), '*maria*silva*');
  assert.equal(termoDeBusca('a,b).or(x'), '*a*b*or*x*');
  assert.equal(termoDeBusca('   '), null);
});

test('CSV abre certo no Excel em português', () => {
  const csv = gerarCsv(
    [
      { titulo: 'Cliente', valor: (l) => l.cliente },
      { titulo: 'Vencimento', valor: (l) => l.vencimento, tipo: 'data' },
      { titulo: 'Valor', valor: (l) => l.valor, tipo: 'moeda' },
    ],
    [
      { cliente: 'Ana; "Aninha"', vencimento: '2026-09-15', valor: 123456 },
      { cliente: '=HYPERLINK("x")', vencimento: null, valor: -500 },
    ],
  );
  assert.ok(csv.startsWith('﻿'));
  assert.equal(
    csv.slice(1),
    'Cliente;Vencimento;Valor\r\n"Ana; ""Aninha""";15/09/2026;1234,56\r\n"\'=HYPERLINK(""x"")";;-5,00\r\n',
  );
});
