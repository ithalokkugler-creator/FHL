import test from 'node:test';
import assert from 'node:assert/strict';
import { buscaRapida, MINIMO_BUSCA } from '../js/dominio/busca.js';

// Busca rápida (09/11/2026): cliente, processo ou tela a partir de um pedaço
// do que se lembra. Dados fictícios.
const clientes = [
  { id: 'j', nome: 'José Fictício da Silva', documento: '12345678909', telefone: '41900000002', email: 'jose@example.test', ativo: true },
  { id: 'r', nome: 'Rosana Fictícia Gonçalves dos Santos', documento: '11144477735', telefone: '41900000007', email: null, ativo: true },
  { id: 'e', nome: 'Empresa Fictícia Ltda.', documento: '11222333000181', telefone: '41900000003', email: 'empresa@example.test', ativo: true },
  { id: 'i', nome: 'José Antigo', documento: null, telefone: null, email: null, ativo: false },
];
const processos = [
  { id: 'p1', cliente_id: 'j', numero: '00012342220258160001', titulo: 'Ação Fictícia de Demonstração', referencia: null, situacao: 'em_andamento' },
  { id: 'p2', cliente_id: 'r', numero: null, titulo: 'Usucapião fictícia', referencia: 'Protocolo 77/2026', situacao: 'aguardando_documentos' },
  { id: 'p3', cliente_id: 'j', numero: null, titulo: 'Ação antiga', referencia: null, situacao: 'encerrado' },
];
const paginas = [
  { caminho: '/membros', rotulo: 'Membros', grupo: 'Escritório' },
  { caminho: '/financeiro/recebiveis', rotulo: 'Recebíveis', grupo: 'Financeiro' },
  { caminho: '/prazos', rotulo: 'Prazos', grupo: 'Tarefas e prazos' },
];
const dados = { clientes, processos, paginas };
const ids = (r) => r.clientes.map((x) => x.cliente.id);

test('texto curto demais não busca nada', () => {
  assert.equal(MINIMO_BUSCA, 2);
  for (const texto of ['', ' ', 'j', null, undefined]) assert.equal(buscaRapida(dados, texto).total, 0);
});

test('cliente por parte do nome, sem acento e em qualquer ordem; inativo por último', () => {
  assert.deepEqual(ids(buscaRapida(dados, 'jose')), ['j', 'i']);
  assert.deepEqual(ids(buscaRapida(dados, 'SILVA josé')), ['j']);
  assert.deepEqual(ids(buscaRapida(dados, 'goncalves')), ['r']);
  assert.equal(buscaRapida(dados, 'jose').clientes[0].por, 'nome');
});

test('cliente por CPF/CNPJ com ou sem pontuação, telefone e e-mail', () => {
  assert.deepEqual(ids(buscaRapida(dados, '123.456.789-09')), ['j']);
  assert.deepEqual(ids(buscaRapida(dados, '11222333')), ['e']);
  const fone = buscaRapida(dados, '(41) 90000-0007');
  assert.deepEqual(ids(fone), ['r']);
  assert.equal(fone.clientes[0].por, 'telefone');
  const email = buscaRapida(dados, 'empresa@example');
  assert.deepEqual(ids(email), ['e']);
  // Três dígitos soltos não bastam para telefone (acharia meio mundo).
  assert.deepEqual(ids(buscaRapida(dados, '900')), []);
});

test('processo pelo número com máscara, pelo título e pela referência, com o cliente dele', () => {
  const numero = buscaRapida(dados, '0001234-22.2025');
  assert.deepEqual(numero.processos.map((x) => x.processo.id), ['p1']);
  assert.equal(numero.processos[0].cliente.id, 'j');
  assert.deepEqual(buscaRapida(dados, 'usucap').processos.map((x) => x.processo.id), ['p2']);
  assert.deepEqual(buscaRapida(dados, 'protocolo 77').processos.map((x) => x.processo.id), ['p2']);
  // Encerrado depois dos abertos.
  assert.deepEqual(buscaRapida(dados, 'acao').processos.map((x) => x.processo.id), ['p1', 'p3']);
  // Só palavra de ligação não acha processo nenhum.
  assert.deepEqual(buscaRapida(dados, 'de').processos, []);
});

test('telas pelo começo da palavra, não por qualquer pedaço', () => {
  assert.deepEqual(buscaRapida(dados, 'receb').paginas.map((p) => p.caminho), ['/financeiro/recebiveis']);
  assert.deepEqual(buscaRapida(dados, 'financeiro').paginas.map((p) => p.caminho), ['/financeiro/recebiveis']);
  assert.deepEqual(buscaRapida(dados, 'praz').paginas.map((p) => p.caminho), ['/prazos']);
  // "ros" está dentro de "Membros", mas não começa palavra nenhuma.
  assert.deepEqual(buscaRapida(dados, 'ros').paginas, []);
  assert.deepEqual(ids(buscaRapida(dados, 'ros')), ['r']);
  // Número não procura tela.
  assert.deepEqual(buscaRapida(dados, '2026').paginas, []);
});

test('limite por grupo e total antes do corte; listas vazias não quebram', () => {
  const muitos = Array.from({ length: 20 }, (_, n) => ({ id: `c${n}`, nome: `Maria Teste ${n}`, ativo: true }));
  const r = buscaRapida({ clientes: muitos }, 'maria', { limite: 5 });
  assert.equal(r.clientes.length, 5);
  assert.equal(r.total, 20);
  assert.deepEqual(buscaRapida({}, 'maria'), { clientes: [], processos: [], paginas: [], total: 0 });
  assert.deepEqual(buscaRapida(undefined, 'maria').total, 0);
});

test('processo de cliente que não veio na lista aparece sem cliente', () => {
  const r = buscaRapida({ clientes: [], processos }, 'usucapiao');
  assert.equal(r.processos[0].cliente, null);
});

// Achados da revisão de 09/11 (revisor de código).
test('palavra de ligação não derruba nem dispara a busca', () => {
  // "ação de" continua achando a "Ação antiga", que não tem "de" no título.
  assert.deepEqual(buscaRapida(dados, 'acao de').processos.map((x) => x.processo.id), ['p1', 'p3']);
  // Só ligação, só pontuação ou travessão solto: nada (antes listava todos os clientes).
  for (const texto of ['de', 'da', 'd.', "d'", '--', '..', ' — ', '()']) assert.equal(buscaRapida(dados, texto).total, 0, JSON.stringify(texto));
  // O travessão do campo Cliente ("Nome — documento") vale como espaço.
  assert.deepEqual(ids(buscaRapida(dados, 'José Fictício da Silva — 123.456.789-09')), ['j']);
  assert.deepEqual(ids(buscaRapida(dados, 'jose — silva')), ['j']);
});

test('telefone com o 55 do país e tela por mais de uma palavra', () => {
  assert.deepEqual(ids(buscaRapida(dados, '+55 (41) 90000-0007')), ['r']);
  const telas = [...paginas, { caminho: '/financeiro/contas-financeiras', rotulo: 'Contas financeiras', grupo: 'Financeiro' }];
  assert.deepEqual(buscaRapida({ paginas: telas }, 'contas fin').paginas.map((p) => p.caminho), ['/financeiro/contas-financeiras']);
  assert.deepEqual(buscaRapida({ paginas: telas }, 'fin rec').paginas.map((p) => p.caminho), ['/financeiro/recebiveis']);
});
