import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filtrarContatos, origemContato, resumirOrigens } from '../js/dominio/contatos.js';
import { mensagemRespostaContato } from '../js/dominio/mensagens.js';
import { dataPorExtenso, duracao, numeroCnj, numeroCnjValido, semAcento, tribunalDoNumero } from '../js/nucleo/formato.js';
import { criarRecebedor } from '../../supabase/functions/receber-contato/handler.js';

test('formatação compartilhada e número CNJ com precisão de 20 dígitos', () => {
  assert.equal(dataPorExtenso('2026-10-05'), '05 de outubro de 2026');
  assert.equal(semAcento('João · INDICAÇÃO'), 'Joao · INDICACAO');
  assert.equal(duracao(90), '1 h 30 min');
  assert.equal(duracao(60), '1 h');
  assert.equal(duracao(0), '0 min');
  // Vetor gerado pela fórmula de DV da Resolução CNJ 65, sem Number.
  const base = '0001234' + '2026' + '8' + '16' + '0001';
  const dv = String(98n - BigInt(base + '00') % 97n).padStart(2, '0');
  const numero = base.slice(0, 7) + dv + base.slice(7);
  assert.equal(numeroCnjValido(numeroCnj(numero)), true);
  assert.equal(numeroCnjValido(numero.slice(0, 7) + '00' + numero.slice(9)), false);
  assert.equal(numeroCnjValido('abc' + numero), false);
  assert.equal(numeroCnjValido(''), false);
  assert.equal(numeroCnjValido('00012348920268160129'), true);
  assert.equal(numeroCnjValido('0001234-89.2026.8.16.0129'), true);
  assert.equal(numeroCnj('00012348920268160129'), '0001234-89.2026.8.16.0129');
  assert.equal(tribunalDoNumero('10023450220255090411'), 'TRT9');
  assert.equal(tribunalDoNumero('50012349120264047009'), 'TRF4');
  assert.equal(duracao(65), '1 h 05 min'); assert.equal(duracao(920), '15 h 20 min');
  assert.equal(tribunalDoNumero(numero), 'TJPR');
  assert.equal(tribunalDoNumero('00000000020265120001'), 'TRT12');
  assert.equal(tribunalDoNumero('00000000020264060001'), 'TRF6');
});

const lista = [
  { id: 'a', nome: 'João Teste', email: 'joao@example.test', telefone: '41999990000', canal: 'site', pagina: '/contato.html', recebido_em: '2026-10-05T10:00:00Z', situacao: 'novo' },
  { id: 'b', nome: 'Ana Teste', canal: 'indicacao', recebido_em: '2026-10-01T10:00:00Z', situacao: 'arquivado' },
  { id: 'c', nome: 'Maria Teste', canal: 'site', campanha: 'campanha-teste', recebido_em: '2026-08-01T10:00:00Z', situacao: 'contatado' },
];
test('filtros combinados, busca sem acento e telefone com máscara', () => {
  assert.deepEqual(filtrarContatos(lista, { situacao: 'abertos' }).map((c) => c.id), ['a', 'c']);
  assert.deepEqual(filtrarContatos(lista, { busca: 'JOAO', de: '2026-10-05', ate: '2026-10-05' }).map((c) => c.id), ['a']);
  assert.deepEqual(filtrarContatos(lista, { busca: '(41) 99999-0000' }).map((c) => c.id), ['a']);
  assert.deepEqual(filtrarContatos(lista, { campanha: 'campanha-teste', canal: 'site' }).map((c) => c.id), ['c']);
  assert.equal(filtrarContatos(lista, { busca: 'Ana', situacao: 'novo' }).length, 0);
});
test('origens contam só o período solicitado e resposta é apenas texto', () => {
  assert.equal(origemContato(lista[0]), 'Site · Contato');
  assert.deepEqual(resumirOrigens(lista, '2026-10-01'), [['Indicação', 1], ['Site · Contato', 1]]);
  // 02h UTC ainda é setembro em Brasília: comparar strings incluiria errado.
  assert.deepEqual(resumirOrigens([{ ...lista[0], recebido_em: '2026-10-01T02:00:00Z' }], '2026-10-01T00:00:00-03:00'), []);
  const texto = mensagemRespostaContato({ contato: lista[0], remetente: 'Equipe Teste' });
  assert.match(texto, /Olá, João!/);
  assert.match(texto, /Recebemos seu contato pelo site/);
  assert.match(mensagemRespostaContato({ contato: { ...lista[0], canal: 'presencial' }, remetente: 'Equipe' }), /contato aqui no escritório/);
  assert.match(mensagemRespostaContato({ contato: { ...lista[0], canal: 'outro' }, remetente: 'Equipe' }), /Recebemos seu contato e estamos/);
  assert.match(texto, /Equipe Teste/);
  assert.match(texto, /FHL/);
});

const dados = { nome: 'Pessoa Fictícia', email: 'TESTE@EXAMPLE.TEST', mensagem: 'Mensagem fictícia', consent: '1', pagina: '/contato.html', website: '' };
const req = (d = dados, headers = {}) => new Request('http://localhost/receber-contato', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.1', ...headers }, body: typeof d === 'string' ? d : JSON.stringify(d),
});
const sal = 's'.repeat(64);
test('recebimento aceita dados, normaliza e envia somente o hash salgado do IP', async () => {
  let chamada;
  const receber = criarRecebedor({ url: 'https://example.test', chave: 'sb_secret_teste', sal, buscar: async (url, init) => {
    chamada = { url, ...init, payload: JSON.parse(init.body) }; return Response.json('id-ficticio');
  } });
  const r = await receber(req());
  assert.equal(r.status, 201); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(chamada.headers.apikey, 'sb_secret_teste'); assert.equal(chamada.headers.Authorization, undefined);
  assert.equal(chamada.payload.p.email, 'teste@example.test');
  assert.match(chamada.payload.p_ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(chamada.body.includes('192.0.2.1'), false);
  const outra = criarRecebedor({ url: 'https://example.test', chave: 'jwt-legado', sal: 'x'.repeat(64), buscar: async (_, init) => {
    assert.equal(init.headers.Authorization, 'Bearer jwt-legado');
    assert.notEqual(JSON.parse(init.body).p_ip_hash, chamada.payload.p_ip_hash); return Response.json('id');
  } });
  assert.equal((await outra(req())).status, 201);
});
test('validação barra payloads incorretos antes de consultar o banco', async (t) => {
  const receber = criarRecebedor({ url: 'https://example.test', chave: 'sb_secret_teste', sal, buscar: () => { throw new Error('Não deveria consultar o banco'); } });
  for (const [nome, payload, status] of [
    ['JSON quebrado', '{', 400], ['array', [], 400], ['null', null, 400],
    ['sem consentimento', { ...dados, consent: false }, 422], ['sem nome', { ...dados, nome: '  ' }, 422],
    ['sem resposta possível', { ...dados, email: '' }, 422], ['e-mail errado', { ...dados, email: 'abc' }, 422],
    ['telefone sem DDD', { ...dados, telefone: '123' }, 422], ['campo não textual', { ...dados, nome: {} }, 422],
    ['texto muito longo', { ...dados, mensagem: 'x'.repeat(5001) }, 422], ['campanha inválida', { ...dados, campanha: '../abc' }, 422],
    ['página com query pessoal', { ...dados, pagina: '/?email=abc' }, 422],
    ['limite medido em bytes UTF-8', { ...dados, mensagem: '😀'.repeat(5000) }, 413],
  ]) await t.test(nome, async () => assert.equal((await receber(req(payload))).status, status));
  assert.equal((await receber(req({ website: 'robô' }))).status, 200);
  assert.equal((await receber(new Request('http://localhost', { method: 'OPTIONS' }))).headers.get('access-control-allow-origin'), '*');
  assert.equal((await receber(new Request('http://localhost'))).status, 405);
  assert.equal((await receber(req(dados, { 'content-type': 'text/plain' }))).status, 415);
});
test('configuração ausente, limite de envio e indisponibilidade têm erros próprios', async () => {
  assert.equal((await criarRecebedor({ url: '', chave: '', sal: '' })(req())).status, 503);
  const limite = criarRecebedor({ url: 'https://example.test', chave: 'x', sal, buscar: async () => Response.json({ code: 'P0001', message: 'Muitas mensagens em pouco tempo.' }, { status: 400 }) });
  const r = await limite(req()); assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '600');
  const falha = criarRecebedor({ url: 'https://example.test', chave: 'x', sal, buscar: async () => { throw new Error('rede'); } });
  assert.equal((await falha(req())).status, 503);
});
