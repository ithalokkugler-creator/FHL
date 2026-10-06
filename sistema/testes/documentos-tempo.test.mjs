// Documentos (F3) e tempo das atualizações (F4).

import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELOS, TITULOS_MODELO } from '../js/documentos/modelos.js';
import { qualificacao } from '../js/documentos/partes.js';
import { montarRelatorio } from '../js/documentos/relatorio.js';
import { filtrarAtualizacoes, minutosDe, prepararAtualizacao, totais } from '../js/dominio/tempo.js';

const cliente = { nome: 'Ana <img src=x onerror=alert(1)>', documento: '12345678909', telefone: '41900000000', email: 'ana@example.test' };
const detalhes = {
  tipo_pessoa: 'fisica', flexao: 'f', profissao: 'autônoma', estado_civil: 'casado',
  logradouro: 'Rua Fictícia', numero: '1', bairro: 'Centro', cidade: 'Paranaguá', uf: 'PR', cep: '83203000',
};
const advogados = [
  { id: 'a', nome: 'Advogada Fictícia', ativo: true, oab: 'OAB/PR 1' },
  { id: 'b', nome: 'Inativa Fictícia', ativo: false, oab: 'OAB/PR 2' },
  { id: 'c', nome: 'Sem OAB', ativo: true },
];
const montar = (id, dados = {}) => String(MODELOS[id].montar({
  cliente, detalhes, advogados, hoje: '2026-10-05', dados: { data_emissao: '2026-10-05', ...dados },
}));

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

for (const id of Object.keys(MODELOS)) {
  test(`Documento ${id}: A4, dados escapados e pendências explícitas`, () => {
    const s = montar(id);
    assert.match(s, /doc-cabecalho/);
    assert.match(s, /doc-rodape/);
    assert.match(s, /Ana &lt;img/);
    assert.doesNotMatch(s, /<img src=x|Inativa Fictícia|Sem OAB/);
  });
}

test('Qualificação usa flexão declarada, PJ e representante; nome não infere gênero', () => {
  assert.match(String(qualificacao(cliente, detalhes)), /casada.*inscrita/);
  assert.match(String(qualificacao(cliente, { ...detalhes, flexao: null })), /casado\(a\)/);
  const pj = qualificacao({ ...cliente, documento: '11222333000181' },
    { ...detalhes, tipo_pessoa: 'juridica', representante_nome: 'Representante', representante_qualificacao: 'qualificação' });
  assert.match(String(pj), /pessoa jurídica.*CNPJ.*Representante/);
  assert.match(String(qualificacao({}, {})), /doc-falta/);
});

test('Contrato mantém cláusulas da preparação e honorários em reais', () => {
  const s = montar('contrato_honorarios', {
    valor_total: '2.000,00', parcelas: 3, valor_parcela: '500', dia_vencimento: 10, exito: 30, garantia: 'nenhuma',
  });
  assert.match(s, /2\.000,00/);
  for (const n of ['1.1.', '2.1.', '3.1.', '3.5.', '4.1.', '5.1.', '6.1.']) assert.ok(s.includes(n), n);
  assert.match(s, /multa compensatória de 10%/);
});

test('Contrato com êxito apagado mostra a pendência em vez de "% sobre"', () => {
  assert.match(montar('contrato_honorarios', { exito: '' }), /\[ÊXITO\]<\/span>% sobre o proveito/);
  assert.match(montar('contrato_honorarios', { exito: 0 }), / 0% sobre o proveito/);
  assert.match(montar('contrato_honorarios'), / 30% sobre o proveito/);
});

test('Prestação usa pagamentos válidos e exclui estorno e parcela cancelada', () => {
  const s = montar('prestacao_contas', {
    financeiro: {
      parcelas: [
        { id: 'p', vencimento: '2026-10-10', valor: 100, situacao: 'paga' },
        { id: 'x', vencimento: '2026-11-10', valor: 9876, situacao: 'cancelada' },
      ],
      recebimentos: [
        { parcela_id: 'p', data: '2026-10-05', valor: 100 },
        { parcela_id: 'p', data: '2026-10-05', valor: 999, estornado_em: '2026-10-05' },
      ],
    },
  });
  assert.match(s, /100,00/);
  assert.doesNotMatch(s, /999,00|9\.876,00/);
});

test('Ficha de atendimento tem tabela de formulário e área do relato', () => {
  const s = montar('ficha_atendimento', { fatos: 'Relato do atendimento' });
  assert.match(s, /<table class="doc-ficha">/);
  assert.match(s, /class="doc-ficha-relato">Relato do atendimento</);
});

test('As duas declarações têm nome próprio na lista e o mesmo título no papel', () => {
  assert.equal(TITULOS_MODELO.declaracao_endereco, 'Declaração de Endereço');
  assert.equal(TITULOS_MODELO.declaracao_comparecimento, 'Declaração de Comparecimento');
  assert.equal(MODELOS.declaracao_endereco.titulo, 'Declaração');
  assert.equal(TITULOS_MODELO.relatorio_atividades, 'Relatório de Atividades');
});

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

const atividades = [
  {
    cliente_id: 'c', processo_id: 'p', membro_id: 'a', participantes: ['b', 'b'], tipo: 'pesquisa',
    inicio: '2026-10-05T23:30:00-03:00', fim: '2026-10-06T00:30:00-03:00', cronometrado: true, relato: 'SEGREDO INTERNO',
  },
  { cliente_id: 'c', membro_id: 'a', tipo: 'telefone', inicio: '2026-10-05T09:00:00-03:00', fim: '2026-10-05T09:30:00-03:00', cronometrado: false },
  { cliente_id: 'c', membro_id: 'a', inicio: '2026-10-05T09:00:00-03:00', fim: '2026-10-05T10:00:00-03:00', cancelado_em: '2026-10-05' },
];

test('Tempos cruzam meia-noite, excluem cancelamentos e contam participantes uma vez', () => {
  const t = totais(atividades);
  assert.equal(t.total, 90);
  assert.equal(t.cronometrado, 60);
  assert.equal(t.manual, 30);
  assert.deepEqual(t.porMembro, { a: 90, b: 60 });
  assert.equal(minutosDe({ inicio: '2026-10-05T09:00:00Z' }, '2026-10-05T09:30:30Z'), 30.5);
});

test('Cronômetro aberto fica fora do total, como no relatório, e é contado à parte', () => {
  const t = totais([...atividades, { cliente_id: 'c', membro_id: 'b', inicio: '2026-10-05T08:00:00-03:00', fim: null, cronometrado: true }]);
  assert.equal(t.total, 90);
  assert.equal(t.rodando, 1);
  assert.equal(t.porMembro.b, 60);
});

test('Lançamento à mão valida datas reais, não aceita fim anterior e aceita anotação zero', () => {
  const p = { cliente_id: 'c', tipo: 'telefone', dia: '2026-10-05', hora_inicio: '23:30', dia_fim: '2026-10-06', hora_fim: '00:30', participantes: ['b'] };
  assert.equal(minutosDe(prepararAtualizacao(p, 'a')), 60);
  assert.equal(minutosDe(prepararAtualizacao({ ...p, sem_tempo: true }, 'a')), 0);
  for (const q of [{ dia: '2026-02-30' }, { hora_inicio: '24:30' }, { dia_fim: '2026-10-05', hora_fim: '23:00' }, { participantes: ['a'] }]) {
    assert.throws(() => prepararAtualizacao({ ...p, ...q }, 'a'), undefined, JSON.stringify(q));
  }
});

test('Filtro quem inclui participantes e cancelados ficam separados', () => {
  assert.equal(filtrarAtualizacoes(atividades, { quem: 'b' }).length, 1);
  assert.equal(filtrarAtualizacoes(atividades, { situacao: 'cancelados' }).length, 1);
  assert.equal(filtrarAtualizacoes(atividades, { situacao: 'todos' }).length, 3);
});

test('Relatório guarda relatos somente quando solicitado e omite timer em andamento', () => {
  const ctx = {
    cliente: { nome: 'José' },
    atividades: [...atividades, { ...atividades[0], fim: null }],
    processos: [{ id: 'p', numero: '00012342220258160001', titulo: 'Ação' }],
    membros: advogados,
    de: '2026-10-01',
    ate: '2026-10-06',
    dia: '2026-10-06',
  };
  const s = String(montarRelatorio(ctx));
  assert.doesNotMatch(s, /SEGREDO INTERNO/);
  assert.match(s, /Atividades concluídas:<\/strong> 2/);
  // O número do processo não quebra no hífen (doc-num) e a nota sai menor.
  assert.match(s, /<span class="doc-num">0001234-22\.2025\.8\.16\.0001<\/span>/);
  assert.match(s, /<p class="doc-nota">/);
  assert.match(String(montarRelatorio({ ...ctx, incluirRelato: true })), /SEGREDO INTERNO/);
});
