// Pedido do Guilherme (21/10/2026): a posição do nosso cliente no processo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarProcessos, POSICAO_OUTRA, POSICOES_CLIENTE, posicaoConhecida, prepararProcesso } from '../js/dominio/clientes.js';

const AREAS = { civel: 'Cível', familia: 'Família' };
const base = { cliente_id: 'c', titulo: 'Cumprimento de sentença', area: 'familia', situacao: 'em_andamento' };

test('Posição: as que o Guilherme listou estão todas na lista', () => {
  const todas = POSICOES_CLIENTE.flatMap(([, lista]) => lista);
  for (const p of ['Autor(a)', 'Réu/Ré', 'Exequente', 'Executado(a)', 'Recorrente', 'Recorrido(a)', 'Terceiro(a) interessado(a)']) {
    assert.ok(todas.includes(p), p);
  }
  assert.equal(new Set(todas).size, todas.length, 'sem repetição');
  assert.ok(posicaoConhecida('Exequente'));
  assert.ok(!posicaoConhecida('Inventariante'));
});

test('Posição: da lista, de "Outra" (texto livre) ou não informada', () => {
  assert.equal(prepararProcesso({ ...base, posicao_cliente: 'Exequente' }, AREAS).posicao_cliente, 'Exequente');
  assert.equal(prepararProcesso({ ...base, posicao_cliente: POSICAO_OUTRA, posicao_outra: '  Inventariante ' }, AREAS).posicao_cliente, 'Inventariante');
  assert.equal(prepararProcesso({ ...base, posicao_cliente: '' }, AREAS).posicao_cliente, null);
  assert.equal(prepararProcesso({ ...base }, AREAS).posicao_cliente, null, 'formulário antigo, sem o campo');
});

test('Posição: "Outra" vazia ou longa demais é recusada, apontando o campo', () => {
  assert.throws(() => prepararProcesso({ ...base, posicao_cliente: POSICAO_OUTRA, posicao_outra: '  ' }, AREAS),
    (e) => /Escreva como o cliente figura/.test(e.message) && e.campo === 'posicao_outra');
  assert.throws(() => prepararProcesso({ ...base, posicao_cliente: POSICAO_OUTRA, posicao_outra: 'x'.repeat(61) }, AREAS),
    (e) => /até 60 letras/.test(e.message) && e.campo === 'posicao_outra');
});

test('Processos: filtro e busca pela posição do cliente', () => {
  const processos = [
    { id: '1', cliente_id: 'a', titulo: 'Execução', area: 'civel', situacao: 'em_andamento', posicao_cliente: 'Exequente' },
    { id: '2', cliente_id: 'b', titulo: 'Defesa', area: 'civel', situacao: 'em_andamento', posicao_cliente: 'Executado(a)' },
    { id: '3', cliente_id: 'c', titulo: 'Sem posição', area: 'civel', situacao: 'em_andamento', posicao_cliente: null },
  ];
  const clientes = [{ id: 'a', nome: 'Karina' }, { id: 'b', nome: 'Renan' }, { id: 'c', nome: 'Outra' }];
  const ids = (f) => filtrarProcessos(processos, clientes, { situacao: 'todos', ...f }).map((p) => p.id);
  assert.deepEqual(ids({ posicao: 'Exequente' }), ['1']);
  assert.deepEqual(ids({ posicao: 'sem' }), ['3']);
  assert.deepEqual(ids({ posicao: '' }), ['1', '2', '3']);
  assert.deepEqual(ids({ busca: 'executado' }), ['2']);
});
