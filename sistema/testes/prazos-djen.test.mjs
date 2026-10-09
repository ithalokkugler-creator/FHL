// Contagem de prazos, feriados e DJEN — vetores do Apêndice C de
// preparacao-novas-funcoes.md, conferidos à mão. Se falhar, o erro está no
// código, não no vetor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { diasNaoUteis, feriadosNacionaisFixos, pascoa, sugestoesDoAno } from '../js/dominio/feriados.js';
import { calcularPrazo, dataDaPublicacao, dataDeEntrega, ehRecesso } from '../js/dominio/prazos.js';
import {
  capturaPendente, lerOab, normalizarComunicacao, periodoDaBusca, sugerirAudiencia, sugerirPrazo, textoLimpo, urlDaConsulta,
} from '../js/dominio/djen.js';

const nacionais = diasNaoUteis([], null, [2026, 2027]);

test('Páscoa e datas móveis sugeridas', () => {
  assert.equal(pascoa(2026), '2026-04-05');
  assert.equal(pascoa(2027), '2027-03-28');
  assert.deepEqual(sugestoesDoAno(2026).map((s) => s.data), ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']);
  assert.deepEqual(sugestoesDoAno(2027).map((s) => s.data), ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27']);
  assert.equal(feriadosNacionaisFixos(2026).size, 9);
});

test('15 dias úteis publicados em 05/10/2026 vencem em 27/10, entrega em 22/10', () => {
  const r = calcularPrazo({ base: '2026-10-05', quantidade: 15, contagem: 'uteis', naoUteis: nacionais });
  assert.equal(r.fatal, '2026-10-27');
  assert.equal(r.fatalEm, '2026-10-27T23:59:00-03:00');
  assert.equal(r.inicio, '2026-10-06');
  assert.ok(r.memoria.some((m) => m.dia === '2026-10-12' && /Aparecida/.test(m.motivo)));
  assert.equal(dataDeEntrega(r.fatal, 3, nacionais), '2026-10-22');
});

test('publicação no DJEN é o primeiro dia útil seguinte', () => {
  assert.equal(dataDaPublicacao('2026-10-09', nacionais), '2026-10-13');
  assert.equal(calcularPrazo({ base: '2026-10-13', quantidade: 5, contagem: 'uteis', naoUteis: nacionais }).fatal, '2026-10-20');
});

test('dias corridos começam no primeiro dia útil e não vencem em feriado', () => {
  assert.equal(calcularPrazo({ base: '2026-10-09', quantidade: 10, contagem: 'corridos', naoUteis: nacionais }).fatal, '2026-10-22');
  assert.equal(calcularPrazo({ base: '2026-11-13', quantidade: 5, contagem: 'corridos', naoUteis: nacionais }).fatal, '2026-11-23');
});

test('recesso de 20/12 a 20/01 suspende — e sem recesso só pula feriados', () => {
  assert.equal(calcularPrazo({ base: '2026-12-14', quantidade: 15, contagem: 'uteis', naoUteis: nacionais, recesso: true }).fatal, '2027-02-04');
  assert.equal(calcularPrazo({ base: '2026-12-14', quantidade: 15, contagem: 'uteis', naoUteis: nacionais, recesso: false }).fatal, '2027-01-06');
  assert.equal(ehRecesso('2026-12-20'), true);
  assert.equal(ehRecesso('2027-01-20'), true);
  assert.equal(ehRecesso('2027-01-21'), false);
});

test('prazo em horas conta minuto a minuto', () => {
  assert.equal(calcularPrazo({ base: '2026-10-05T14:30:00-03:00', quantidade: 48, contagem: 'horas' }).fatal, '2026-10-07T14:30:00-03:00');
});

test('feriado cadastrado conta só para o tribunal dele ou para todos', () => {
  const cad = [{ data: '2026-10-28', nome: 'Dia do Servidor', tribunal: 'TJPR' }, { data: '2026-10-29', nome: 'Inativo', ativo: false }];
  assert.equal(diasNaoUteis(cad, 'TJPR', [2026]).has('2026-10-28'), true);
  assert.equal(diasNaoUteis(cad, 'TRT9', [2026]).has('2026-10-28'), false);
  assert.equal(diasNaoUteis(cad, 'TJPR', [2026]).has('2026-10-29'), false);
});

test('OAB, teor e sugestões do DJEN', () => {
  assert.deepEqual(lerOab('OAB/PR 105.790'), { uf: 'PR', numero: '105790' });
  assert.deepEqual(lerOab('OAB/PR 117.141'), { uf: 'PR', numero: '117141' });
  assert.deepEqual(lerOab('12.345/SC'), { uf: 'SC', numero: '12345' });
  assert.equal(lerOab(''), null);
  assert.equal(lerOab(null), null);
  assert.deepEqual(sugerirPrazo('…para manifestação no prazo de 15 (quinze) dias.'), { quantidade: 15, unidade: 'dias', uteis: false });
  assert.equal(sugerirPrazo('…cumpra em 48 (quarenta e oito) horas…').unidade, 'horas');
  assert.equal(sugerirPrazo('…cumpra em 48 (quarenta e oito) horas…').quantidade, 48);
  assert.equal(sugerirPrazo('…no prazo de cinco dias…').quantidade, 5);
  assert.equal(sugerirPrazo('…no prazo legal.'), null);
  assert.deepEqual(sugerirAudiencia('…audiência de conciliação para o dia 12/11/2026, às 14h30…'), { dia: '2026-11-12', hora: '14:30' });
  assert.equal(textoLimpo('A&amp;B<br>linha 2'), 'A&B\nlinha 2');
});

test('normaliza o item da API e monta a consulta', () => {
  const n = normalizarComunicacao({
    id: 123, hash: 'abc', data_disponibilizacao: '2026-10-05', siglaTribunal: 'TJPR', nomeOrgao: 'Vara',
    tipoComunicacao: 'Intimação', numero_processo: '0001234-22.2025.8.16.0001', texto: '<p>Teor</p>', link: 'javascript:alert(1)',
    destinatarios: [{ nome: 'A', polo: 'A' }], destinatarioadvogados: [{ advogado: { nome: 'X', numero_oab: '1', uf_oab: 'PR' } }],
  }, 'm1');
  assert.equal(n.numero_processo, '00012342220258160001');
  assert.equal(n.texto, 'Teor');
  assert.equal(n.link, null);
  assert.equal(n.advogados[0].uf_oab, 'PR');
  assert.equal(normalizarComunicacao({ id: 1, datadisponibilizacao: '09/10/2026' }).disponibilizada_em, '2026-10-09');
  assert.match(urlDaConsulta('https://x/api/v1', { numero: '105790', uf: 'PR', de: '2026-10-01', ate: '2026-10-07' }),
    /numeroOab=105790&ufOab=PR&dataDisponibilizacaoInicio=2026-10-01&dataDisponibilizacaoFim=2026-10-07&pagina=1&itensPorPagina=100/);
});

test('período da próxima busca e captura diária', () => {
  assert.deepEqual(periodoDaBusca(null, '2026-10-08', 7), { de: '2026-10-02', ate: '2026-10-08' });
  assert.deepEqual(periodoDaBusca({ ate: '2026-10-05' }, '2026-10-08'), { de: '2026-10-05', ate: '2026-10-08' });
  assert.deepEqual(periodoDaBusca({ ate: '2026-01-01' }, '2026-10-08'), { de: '2026-01-01', ate: '2026-01-31' });
  assert.equal(capturaPendente([{ situacao: 'ok', ate: '2026-10-08' }], '2026-10-08', true), false);
  assert.equal(capturaPendente([{ situacao: 'parcial', ate: '2026-10-08' }], '2026-10-08', true), true);
  assert.equal(capturaPendente([], '2026-10-10', false), false);
});
