// Pedidos dos advogados de 21/10/2026: campo Cliente que acha por parte do
// nome e pelo CPF, sugestão pelo destinatário da intimação, advogados do
// escritório na comunicação e filiação em mãe e pai.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acharCliente, buscarClientes, clientesDosDestinatarios, prepararCliente } from '../js/dominio/clientes.js';
import { chaveOab, membrosNaComunicacao } from '../js/dominio/djen.js';

const rotulo = (c) => (c.documento ? `${c.nome} — ${c.documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}` : c.nome);
const clientes = [
  { id: 'f', nome: 'Franciel Amélio', documento: '07962822937', ativo: true },
  { id: 'i', nome: 'Isael da Silva Santos', documento: '06248795932', ativo: true },
  { id: 'l', nome: 'Leonilda Lourenço Rosa', documento: '16022511852', ativo: true },
  { id: 'r', nome: 'Rosane Gonçalves dos Santos', documento: '11144477735', ativo: true },
  { id: 'v', nome: 'Viação Rocio Ltda', documento: null, ativo: false },
];
const ids = (achados) => achados.map((a) => a.cliente.id);

test('Cliente: "rosane" acha a Rosane, e só ela (o caso do Vinícius)', () => {
  assert.deepEqual(ids(buscarClientes(clientes, 'rosane')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, 'ROSANE')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, '  rosane  ')), ['r']);
});

test('Cliente: parte do nome, em qualquer ordem, com ou sem acento', () => {
  assert.deepEqual(ids(buscarClientes(clientes, 'goncalves')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, 'Gonçalves')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, 'santos rosane')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, 'rosane dos santos')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, 'lourenco')), ['l']);
  assert.deepEqual(ids(buscarClientes(clientes, 'viacao')), ['v'], 'inativo também aparece (marcado na lista)');
  // "Santos" está em dois nomes; quem começa com o termo vem primeiro, depois por nome.
  assert.deepEqual(ids(buscarClientes(clientes, 'santos')), ['i', 'r']);
  // "Rosa" é o começo de Rosane e uma palavra inteira de Leonilda Lourenço Rosa.
  assert.deepEqual(ids(buscarClientes(clientes, 'rosa')), ['r', 'l']);
});

test('Cliente: CPF com ou sem pontuação, inteiro ou em parte', () => {
  assert.deepEqual(ids(buscarClientes(clientes, '111.444.777-35')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, '11144477735')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, '111444')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, '777-35')), ['r']);
  assert.deepEqual(ids(buscarClientes(clientes, '12')), [], 'dois dígitos ainda não buscam');
});

test('Cliente: número do processo acha o cliente e diz qual processo', () => {
  const processos = [{ id: 'p1', cliente_id: 'r', numero: '00009699820255090022' }];
  const [achado, ...resto] = buscarClientes(clientes, '0000969-98.2025.5.09.0022', { processos });
  assert.equal(achado.cliente.id, 'r');
  assert.equal(achado.processo.id, 'p1');
  assert.equal(resto.length, 0);
  assert.deepEqual(ids(buscarClientes(clientes, '0000969-98.2025.5.09.0022')), [], 'sem a lista de processos, não acha');
});

test('Cliente: sem texto, todos em ordem alfabética; o rótulo escolhido acha o próprio', () => {
  assert.deepEqual(ids(buscarClientes(clientes, '')), ['f', 'i', 'l', 'r', 'v']);
  assert.equal(buscarClientes(clientes, rotulo(clientes[3]))[0].cliente.id, 'r');
});

test('Cliente: o texto só identifica sem dúvida pelo rótulo, nome inteiro ou CPF inteiro', () => {
  assert.equal(acharCliente(clientes, rotulo(clientes[3]), rotulo)?.id, 'r');
  assert.equal(acharCliente(clientes, 'rosane goncalves dos santos', rotulo)?.id, 'r');
  assert.equal(acharCliente(clientes, '111.444.777-35', rotulo)?.id, 'r');
  assert.equal(acharCliente(clientes, 'rosane', rotulo), null, 'parte do nome não escolhe sozinha');
  assert.equal(acharCliente(clientes, '', rotulo), null);
  const homonimos = [...clientes, { id: 'r2', nome: 'Rosane Gonçalves dos Santos', documento: '52998224725' }];
  assert.equal(acharCliente(homonimos, 'rosane gonçalves dos santos', rotulo), null, 'dois com o mesmo nome: escolher na lista');
  assert.equal(acharCliente(homonimos, rotulo(homonimos[5]), rotulo)?.id, 'r2', 'escolhido na lista, o CPF desempata');
  // Homônimo sem CPF: o rótulo dele é o próprio nome, e escolher na lista funciona.
  const semCpf = [...clientes, { id: 'r3', nome: 'Rosane Gonçalves dos Santos', documento: null }];
  assert.equal(acharCliente(semCpf, 'Rosane Gonçalves dos Santos', rotulo)?.id, 'r3');
});

test('Intimação: destinatário que já é cliente vira sugestão; parte contrária com um nome só, não', () => {
  const destinatarios = [{ nome: 'CARYL MESQUITA DOS SANTOS' }, { nome: 'ROSANE GONCALVES DOS SANTOS' }, { nome: 'VIACAO ROCIO LTDA' }];
  const sugestoes = clientesDosDestinatarios(destinatarios, clientes.filter((c) => c.ativo));
  assert.deepEqual(sugestoes.map((s) => [s.cliente.id, s.destinatario, s.exato]), [['r', 'ROSANE GONCALVES DOS SANTOS', true]]);
  // Cliente cadastrado com nome mais curto também é sugerido, marcado como só parecido.
  const curto = [{ id: 'c', nome: 'Rosane Santos' }, { id: 'x', nome: 'Santos' }];
  assert.deepEqual(clientesDosDestinatarios(destinatarios, curto).map((s) => [s.cliente.id, s.exato]), [['c', false]]);
  // O igual vem antes do parecido, mesmo que o parecido apareça primeiro.
  const ambos = [{ id: 'e', nome: 'Empresa Fictícia Ltda' }, { id: 'r', nome: 'Rosane Gonçalves dos Santos' }];
  const dest = [{ nome: 'EMPRESA DE ONIBUS FICTICIA LTDA' }, { nome: 'ROSANE GONÇALVES DOS SANTOS' }];
  assert.deepEqual(clientesDosDestinatarios(dest, ambos).map((s) => [s.cliente.id, s.exato]), [['r', true], ['e', false]]);
  assert.deepEqual(clientesDosDestinatarios([], clientes), []);
  assert.deepEqual(clientesDosDestinatarios(undefined, clientes), []);
});

test('Intimação: advogados do escritório pela OAB, inclusive quem saiu', () => {
  const membros = [
    { id: 'v', nome_curto: 'Vinícius', oab: 'OAB/PR 105.790', ativo: true },
    { id: 'g', nome_curto: 'Guilherme', oab: 'OAB/PR 116.072', ativo: true },
    { id: 'm', nome_curto: 'Marlon', oab: 'OAB/PR 131.898', ativo: false },
    { id: 'i', nome_curto: 'Ithalo', oab: null, ativo: true },
  ];
  const advogados = [
    { nome: 'MARLON ALBINI HESPANHA', numero_oab: '131898', uf_oab: 'PR' },
    { nome: 'GUILHERME', numero_oab: '116.072', uf_oab: 'pr' },
    { nome: 'ADVOGADO DA OUTRA PARTE', numero_oab: '99999', uf_oab: 'PR' },
  ];
  assert.deepEqual(membrosNaComunicacao(advogados, membros).map((m) => m.id), ['g', 'm']);
  assert.deepEqual(membrosNaComunicacao([], membros), []);
  assert.deepEqual(membrosNaComunicacao(null, membros), []);
  assert.equal(chaveOab('0105.790', 'PR'), '105790/PR');
  assert.equal(chaveOab('105790', 'XX'), null);
  assert.equal(chaveOab('', 'PR'), null);
});

test('Filiação: mãe e pai em campos próprios; preenchidos, o texto antigo sai', () => {
  const p = prepararCliente({ nome: 'Fictício', filiacao_mae: ' ROSINA DOS SANTOS PEDROSO ', filiacao_pai: 'AGRIPINO PEDROSO', filiacao: 'ROSINA / AGRIPINO' });
  assert.equal(p.detalhes.filiacao_mae, 'ROSINA DOS SANTOS PEDROSO');
  assert.equal(p.detalhes.filiacao_pai, 'AGRIPINO PEDROSO');
  assert.equal(p.detalhes.filiacao, null);
  // Só a mãe: o texto antigo também sai (fica no histórico do banco).
  assert.equal(prepararCliente({ nome: 'Fictício', filiacao_mae: 'Maria', filiacao: 'Maria / José' }).detalhes.filiacao, null);
  // Nada separado ainda: o texto antigo fica como está.
  const antigo = prepararCliente({ nome: 'Fictício', filiacao: 'Maria / José' });
  assert.equal(antigo.detalhes.filiacao, 'Maria / José');
  assert.equal(antigo.detalhes.filiacao_mae, null);
  assert.equal(antigo.detalhes.filiacao_pai, null);
  assert.throws(() => prepararCliente({ nome: 'Fictício', filiacao_pai: 'a'.repeat(301) }), /até 300/);
});
