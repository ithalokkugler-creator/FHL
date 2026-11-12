import test from 'node:test';
import assert from 'node:assert/strict';
import { relogioRegressivo, situacaoDaSessao } from '../js/dominio/sessao.js';
import { filtrarTarefas, lerOrdem, meuCronometro, ordenarTarefas, segundosDaTarefa, situacaoDaTarefa } from '../js/dominio/tarefas.js';
import { descreverLembretes, emUnidade, lembretesDe, lerLembretes, paraMinutos, unidadesPara } from '../js/dominio/lembretes.js';
import { gerarIcs } from '../js/dominio/ics.js';
import { corpoDoEvento, lembretesDoEvento } from '../../supabase/functions/google-agenda/eventos.js';
import { avisosDevidos, limparAvisadas, quandoFalta } from '../js/dominio/notificacoes.js';
import {
  agruparProcessos, anexarPartes, buscarClientes, clientesDoProcesso, filtrarProcessos, posicaoNoProcesso, processoDoCliente,
} from '../js/dominio/clientes.js';

// Pedidos de 12/11/2026 (sessão, cronômetro das tarefas, lembretes,
// notificações e partes do processo). Dados fictícios.

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

test('Sessão: 60 min por padrão, aviso 5 min antes, sai no limite', () => {
  const min = 60_000;
  assert.equal(situacaoDaSessao({ parada: 54 * min, minutos: 60 }).acao, 'ok');
  assert.equal(situacaoDaSessao({ parada: 55 * min, minutos: 60 }).acao, 'avisar');
  assert.equal(situacaoDaSessao({ parada: 60 * min, minutos: 60 }).acao, 'sair');
  assert.equal(situacaoDaSessao({ parada: 30 * min, minutos: null }).acao, 'ok');
  // Limite curto: avisa na metade.
  assert.equal(situacaoDaSessao({ parada: 2.5 * min, minutos: 5 }).acao, 'avisar');
  assert.equal(relogioRegressivo(245_000), '4:05');
});

test('Sessão: cronômetro aberto segura por até 3 horas', () => {
  const min = 60_000;
  assert.equal(situacaoDaSessao({ parada: 90 * min, minutos: 60, cronometroAberto: true }).acao, 'ok');
  assert.equal(situacaoDaSessao({ parada: 176 * min, minutos: 60, cronometroAberto: true }).acao, 'avisar');
  assert.equal(situacaoDaSessao({ parada: 180 * min, minutos: 60, cronometroAberto: true }).acao, 'sair');
  // Limite configurado maior que 3 h continua valendo.
  assert.equal(situacaoDaSessao({ parada: 200 * min, minutos: 240, cronometroAberto: true }).acao, 'ok');
});

// ---------------------------------------------------------------------------
// Tarefas: situação vista, tempo e ordem
// ---------------------------------------------------------------------------

test('Tarefa pausada: em andamento, com tempo e sem relógio aberto', () => {
  assert.equal(situacaoDaTarefa({ situacao: 'em_andamento', tempo_segundos: 1800, cronometros: [] }), 'pausada');
  assert.equal(situacaoDaTarefa({ situacao: 'em_andamento', tempo_segundos: 1800, cronometros: [{ membro_id: 'a', desde: '2026-11-12T12:00:00Z' }] }), 'em_andamento');
  assert.equal(situacaoDaTarefa({ situacao: 'em_andamento', tempo_segundos: 0, cronometros: [] }), 'em_andamento');
  assert.equal(situacaoDaTarefa({ situacao: 'pendente' }), 'pendente');
  assert.equal(situacaoDaTarefa({ situacao: 'concluida', tempo_segundos: 60 }), 'concluida');
  assert.equal(situacaoDaTarefa({ situacao: 'pendente', cancelado_em: '2026-11-01' }), 'cancelada');
});

test('Tempo da tarefa: 30 min fechados + 20 min correndo = 50 min', () => {
  const agora = Date.parse('2026-11-12T13:20:00Z');
  const t = { tempo_segundos: 1800, cronometros: [{ membro_id: 'eu', desde: '2026-11-12T13:00:00Z' }] };
  assert.equal(segundosDaTarefa(t, agora), 3000);
  assert.deepEqual(meuCronometro(t, 'eu'), { membro_id: 'eu', desde: '2026-11-12T13:00:00Z' });
  assert.equal(meuCronometro(t, 'outro'), null);
  assert.equal(segundosDaTarefa({ tempo_segundos: null, cronometros: null }, agora), 0);
});

test('Filtro "Pausadas" e "Em andamento" usam a situação vista', () => {
  const lista = [
    { id: '1', titulo: 'A', situacao: 'em_andamento', tempo_segundos: 600, cronometros: [], responsavel_id: 'eu' },
    { id: '2', titulo: 'B', situacao: 'em_andamento', tempo_segundos: 0, cronometros: [{ membro_id: 'eu', desde: '2026-11-12T12:00:00Z' }], responsavel_id: 'eu' },
    { id: '3', titulo: 'C', situacao: 'pendente', responsavel_id: 'eu' },
  ];
  assert.deepEqual(filtrarTarefas(lista, { situacao: 'pausada', visao: 'todas' }, 'eu').map((t) => t.id), ['1']);
  assert.deepEqual(filtrarTarefas(lista, { situacao: 'em_andamento', visao: 'todas' }, 'eu').map((t) => t.id), ['2']);
  assert.equal(filtrarTarefas(lista, { situacao: 'abertas', visao: 'todas' }, 'eu').length, 3);
});

test('Ordenar por prazo, responsável e situação; sem data no fim', () => {
  const lista = [
    { id: 'a', titulo: 'Sem data', responsavel_id: 'z', situacao: 'pendente' },
    { id: 'b', titulo: 'Fatal 20', fatal_em: '2026-11-20T23:59:00-03:00', responsavel_id: 'y', situacao: 'em_andamento', cronometros: [{ membro_id: 'y', desde: '2026-11-12T10:00:00Z' }] },
    { id: 'c', titulo: 'Entrega 15', entrega: '2026-11-15', responsavel_id: 'x', situacao: 'em_andamento', tempo_segundos: 60, cronometros: [] },
    { id: 'd', titulo: 'Horas 15', fatal_em: '2026-11-15T14:00:00-03:00', contagem: 'horas', responsavel_id: 'x', situacao: 'pendente' },
  ];
  const nomes = { x: 'Ana', y: 'Bruno', z: 'Carla' };
  assert.deepEqual(ordenarTarefas(lista, 'prazo').map((t) => t.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(ordenarTarefas(lista, '-prazo').map((t) => t.id), ['b', 'c', 'd', 'a']);
  assert.deepEqual(ordenarTarefas(lista, 'responsavel', { nomeDe: (id) => nomes[id] }).map((t) => t.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(ordenarTarefas(lista, 'situacao').map((t) => t.id), ['b', 'c', 'd', 'a']);
  assert.equal(lerOrdem('-prazo'), '-prazo');
  assert.equal(lerOrdem('qualquer'), 'prazo');
  assert.equal(lista[0].id, 'a', 'não mexe na lista original');
});

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------

test('Lembretes: unidade exata, leitura e descrição', () => {
  assert.deepEqual(emUnidade(10080), { quantidade: 1, unidade: 'semanas' });
  assert.deepEqual(emUnidade(2880), { quantidade: 2, unidade: 'dias' });
  assert.deepEqual(emUnidade(90), { quantidade: 90, unidade: 'minutos' });
  assert.deepEqual(emUnidade(0), { quantidade: 0, unidade: 'minutos' });
  assert.equal(paraMinutos('2', 'horas'), 120);
  assert.equal(paraMinutos('1,5', 'horas'), null);
  // Quantidade em branco não vira "na hora" (achado da verificação de 12/11).
  assert.equal(paraMinutos('', 'minutos'), null);
  assert.equal(paraMinutos('  ', 'horas'), null);
  assert.throws(() => lerLembretes([{ quantidade: '', unidade: 'minutos' }]), /informe quanto tempo/);
  assert.deepEqual(unidadesPara(1).map(([, r]) => r), ['minuto', 'hora', 'dia', 'semana']);
  assert.deepEqual(unidadesPara(2).map(([, r]) => r), ['minutos', 'horas', 'dias', 'semanas']);
  assert.deepEqual(lerLembretes([
    { quantidade: '10', unidade: 'minutos' }, { quantidade: '1', unidade: 'semanas' },
    { quantidade: '1', unidade: 'horas' }, { quantidade: '1', unidade: 'dias' },
  ]), [10080, 1440, 60, 10]);
  assert.equal(descreverLembretes([10, 60, 1440, 10080]), '1 semana, 1 dia, 1 hora e 10 minutos antes');
  assert.equal(descreverLembretes([0]), 'na hora');
  assert.equal(descreverLembretes([]), 'Sem lembrete');
});

test('Lembretes: repetido, mais de 5 e mais de 4 semanas são recusados', () => {
  assert.throws(() => lerLembretes([{ quantidade: '60', unidade: 'minutos' }, { quantidade: '1', unidade: 'horas' }]), /repete/);
  assert.throws(() => lerLembretes([1, 2, 3, 4, 5, 6].map((n) => ({ quantidade: String(n), unidade: 'minutos' }))), /no máximo 5/);
  assert.throws(() => lerLembretes([{ quantidade: '5', unidade: 'semanas' }]), /4 semanas/);
  assert.throws(() => lerLembretes([{ quantidade: '-1', unidade: 'minutos' }]), /inteiro/);
});

test('Lembretes de um compromisso antigo: o único vira lista', () => {
  assert.deepEqual(lembretesDe({ lembrete_minutos: 30, lembretes: [] }), [30]);
  assert.deepEqual(lembretesDe({ lembrete_minutos: 30, lembretes: [10, 1440] }), [1440, 10]);
  assert.deepEqual(lembretesDe({ lembrete_minutos: null }), []);
});

test('Vários lembretes no .ics e no Google', () => {
  const c = { id: 'abc', inicio: '2026-11-20T17:00:00Z', fim: '2026-11-20T18:00:00Z', titulo: 'Audiência', tipo: 'audiencia', lembretes: [10080, 1440, 60, 10] };
  const ics = gerarIcs([c], { agora: new Date('2026-11-12T12:00:00Z') });
  assert.equal(ics.match(/BEGIN:VALARM/g).length, 4);
  assert.match(ics, /TRIGGER:-PT10080M/);
  assert.ok(!gerarIcs([{ ...c, mascarado: true }], { agora: new Date() }).includes('VALARM'));
  assert.deepEqual(lembretesDoEvento(c).overrides.map((o) => o.minutes), [10080, 1440, 60, 10]);
  assert.deepEqual(lembretesDoEvento({ lembrete_minutos: 30, lembretes: [] }), { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
  assert.deepEqual(lembretesDoEvento({ lembretes: [] }), { useDefault: true });
  assert.equal(corpoDoEvento({ ...c, particular: false }).reminders.overrides.length, 4);
});

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

test('Notificação: cada lembrete na sua hora; atrasados juntos viram um aviso só', () => {
  const c = { id: 'c1', membro_id: 'eu', tipo: 'audiencia', titulo: 'Audiência de instrução', situacao: 'agendado',
    inicio: '2026-11-20T17:00:00Z', fim: '2026-11-20T18:00:00Z', lembretes: [10080, 1440, 60, 10] };
  // Entre 1 semana e 1 dia antes: só o de 1 semana.
  let a = avisosDevidos({ agora: Date.parse('2026-11-13T17:30:00Z'), eu: 'eu', compromissos: [c] });
  assert.equal(a.length, 1);
  assert.match(a[0].texto, /lembrete de 1 semana antes/);
  // Fica na tela até dispensar, ou até 10 min depois do início.
  assert.equal(a[0].ate, Date.parse('2026-11-20T17:10:00Z'));
  const avisadas = Object.fromEntries(a[0].marcar.map((k) => [k, 1]));
  assert.equal(avisosDevidos({ agora: Date.parse('2026-11-13T18:00:00Z'), eu: 'eu', compromissos: [c], avisadas }).length, 0);
  // O sistema ficou fechado: abre 30 min antes — 1 dia e 1 hora venceram; sai um, o de 1 hora.
  a = avisosDevidos({ agora: Date.parse('2026-11-20T16:30:00Z'), eu: 'eu', compromissos: [c], avisadas });
  assert.equal(a.length, 1);
  assert.match(a[0].texto, /1 hora antes/);
  assert.equal(a[0].marcar.length, 3); // marca também os que venceram antes (o de 1 semana já estava)
  // Já começou: nada.
  assert.equal(avisosDevidos({ agora: Date.parse('2026-11-20T17:05:00Z'), eu: 'eu', compromissos: [c] }).length, 0);
});

test('Notificação: só os meus, nunca o mascarado nem o remarcado', () => {
  const base = { tipo: 'atendimento', situacao: 'agendado', inicio: '2026-11-20T17:00:00Z', lembretes: [60] };
  const agora = Date.parse('2026-11-20T16:30:00Z');
  assert.equal(avisosDevidos({ agora, eu: 'eu', compromissos: [{ ...base, id: '1', membro_id: 'outro' }] }).length, 0);
  assert.equal(avisosDevidos({ agora, eu: 'eu', compromissos: [{ ...base, id: '2', membro_id: 'eu', mascarado: true }] }).length, 0);
  assert.equal(avisosDevidos({ agora, eu: 'eu', compromissos: [{ ...base, id: '3', membro_id: 'eu', situacao: 'remarcado' }] }).length, 0);
});

test('Notificação: prazo em horas e o resumo do dia, uma vez, a partir das 7h', () => {
  const tarefas = [
    { id: 't1', titulo: 'Contrarrazões', responsavel_id: 'eu', situacao: 'pendente', contagem: 'horas', fatal_em: '2026-11-12T18:00:00Z' },
    { id: 't2', titulo: 'Entregar hoje', responsavel_id: 'eu', situacao: 'pendente', entrega: '2026-11-12' },
    { id: 't3', titulo: 'Atrasada', responsavel_id: 'eu', situacao: 'pendente', entrega: '2026-11-10' },
  ];
  // 06h30 em Brasília: nada (o resumo é a partir das 7h; o prazo em horas, 2 h antes).
  assert.equal(avisosDevidos({ agora: Date.parse('2026-11-12T09:30:00Z'), eu: 'eu', tarefas }).length, 0);
  // 08h em Brasília: o resumo (o prazo em horas conta como "para hoje").
  const resumo = avisosDevidos({ agora: Date.parse('2026-11-12T11:00:00Z'), eu: 'eu', tarefas });
  assert.equal(resumo.length, 1);
  assert.match(resumo[0].titulo, /2 para hoje e 1 atrasada/);
  // 1h40 antes do fatal: o prazo em horas.
  const avisadas = Object.fromEntries(resumo[0].marcar.map((k) => [k, 1]));
  const horas = avisosDevidos({ agora: Date.parse('2026-11-12T16:20:00Z'), eu: 'eu', tarefas, avisadas });
  assert.equal(horas.length, 1);
  assert.match(horas[0].titulo, /Prazo em horas/);
  assert.equal(quandoFalta('2026-11-13T12:00:00Z', Date.parse('2026-11-12T12:00:00Z')), 'amanhã às 09:00');
  const agora = Date.now();
  assert.deepEqual(limparAvisadas({ velho: 1, novo: agora }, agora), { novo: agora });
});

// ---------------------------------------------------------------------------
// Processo com vários clientes
// ---------------------------------------------------------------------------

test('Partes: o processo é de todos os clientes vinculados (não dos retirados)', () => {
  const processos = anexarPartes(
    [{ id: 'p1', cliente_id: 'espolio', titulo: 'Inventário', numero: '00010355820258160208', posicao_cliente: 'Inventariante', situacao: 'em_andamento' }],
    [
      { id: 'x1', processo_id: 'p1', cliente_id: 'her1', posicao: 'Herdeiro(a)' },
      { id: 'x2', processo_id: 'p1', cliente_id: 'her2', posicao: null, cancelado_em: '2026-11-12T10:00:00Z' },
    ],
  );
  const [p] = processos;
  assert.deepEqual(clientesDoProcesso(p), ['espolio', 'her1']);
  assert.ok(processoDoCliente(p, 'her1'));
  assert.ok(!processoDoCliente(p, 'her2'));
  assert.ok(!processoDoCliente(p, null));
  assert.equal(posicaoNoProcesso(p, 'espolio'), 'Inventariante');
  assert.equal(posicaoNoProcesso(p, 'her1'), 'Herdeiro(a)');
  const grupos = agruparProcessos(processos);
  assert.equal(grupos.get('her1')[0].id, 'p1');
  assert.equal(grupos.get('her2'), undefined);
  const clientes = [{ id: 'espolio', nome: 'Espólio de Fulano' }, { id: 'her1', nome: 'Maria Herdeira' }];
  assert.equal(filtrarProcessos(processos, clientes, { busca: 'maria' }).length, 1);
  assert.equal(buscarClientes(clientes, '0001035', { processos }).find((x) => x.cliente.id === 'her1')?.processo?.id, 'p1');
});
