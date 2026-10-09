import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertaTarefa, filtrarTarefas, podeAlterarTarefa, periodoPrazos, prazoRestante, urgenciaTarefa } from '../js/dominio/tarefas.js';
const eu={id:'eu',papel:'associado'};
const lista=[
 {id:'1',titulo:'Petição José',tipo:'tarefa',situacao:'pendente',criado_por:'outro',responsavel_id:'eu',prioridade:'normal',entrega:'2026-10-05',cliente_id:'c',cliente_nome:'José'},
 {id:'2',titulo:'Prazo',tipo:'prazo',situacao:'pendente',criado_por:'eu',responsavel_id:'outro',prioridade:'urgente',fatal_em:'2026-10-06T01:00:00Z',entrega:'2026-10-01'},
 {id:'3',titulo:'Concluída',tipo:'tarefa',situacao:'concluida',criado_por:'eu',responsavel_id:'eu'},
 {id:'4',titulo:'Cancelada',tipo:'tarefa',situacao:'pendente',criado_por:'eu',responsavel_id:'eu',cancelado_em:'2026-10-04T12:00:00Z'},
];
test('Tarefas: visão minhas e deleguei excluem concluídas e canceladas por padrão',()=>{
 assert.deepEqual(filtrarTarefas(lista,{visao:'minhas'},'eu').map(t=>t.id),['1']);
 assert.deepEqual(filtrarTarefas(lista,{visao:'deleguei'},'eu').map(t=>t.id),['2']);
});
test('Tarefas: filtros de busca sem acento, prioridade, origem e período de Brasília',()=>{
 assert.equal(filtrarTarefas(lista,{busca:'jose'},'eu').length,1);
 assert.equal(filtrarTarefas(lista,{prioridade:'urgente'},'eu')[0].id,'2');
 assert.equal(filtrarTarefas(lista,{soPrazos:true,de:'2026-10-05',ate:'2026-10-05'},'eu')[0].id,'2');
 assert.equal(filtrarTarefas(lista,{situacao:'cancelada'},'eu')[0].id,'4');
});
test('Tarefas: botões só para autor, responsável ou administrador e nunca canceladas',()=>{
 assert.equal(podeAlterarTarefa(lista[0],eu),true);
 assert.equal(podeAlterarTarefa(lista[0],{id:'terceiro',papel:'socio'}),false);
 assert.equal(podeAlterarTarefa(lista[0],{id:'admin',papel:'admin'}),true);
 assert.equal(podeAlterarTarefa(lista[3],{id:'admin',papel:'admin'}),false);
});
test('Tarefas: alerta prioriza cancelamento, conclusão e fatal antes da entrega',()=>{
 const agora=new Date('2026-10-05T15:00:00Z');
 assert.equal(alertaTarefa(lista[3],agora),'cancelada');assert.equal(alertaTarefa(lista[2],agora),'concluida');
 assert.equal(alertaTarefa(lista[0],agora),'entrega_hoje');assert.equal(alertaTarefa(lista[1],agora),'fatal_hoje');
 assert.equal(alertaTarefa({...lista[1],fatal_em:'2026-10-05T14:00:00Z'},agora),'vencida');
 assert.equal(alertaTarefa({...lista[0],entrega:'2026-10-04'},agora),'atrasada');
});
test('Prazos: períodos diário, semanal, mensal e anual preservam calendário',()=>{
 assert.deepEqual(periodoPrazos('hoje','2026-10-05'),{de:'2026-10-05',ate:'2026-10-05'});
 assert.deepEqual(periodoPrazos('semana','2026-10-04'),{de:'2026-09-28',ate:'2026-10-04'});
 assert.deepEqual(periodoPrazos('mes','2028-02-15'),{de:'2028-02-01',ate:'2028-02-29'});
 assert.deepEqual(periodoPrazos('ano','2026-10-05'),{de:'2026-01-01',ate:'2026-12-31'});
 assert.deepEqual(periodoPrazos('todos'),{de:'',ate:''});
});

// Cor da tarefa (08/10/2026): uma semana = amarelo, dois dias = vermelho.
const agoraCor = new Date('2026-10-08T15:00:00Z'); // 12h em Brasília
const nivel = (t) => urgenciaTarefa({ situacao: 'pendente', ...t }, agoraCor)?.nivel ?? null;
const etiqueta = (t) => prazoRestante({ situacao: 'pendente', ...t }, agoraCor);

test('Tarefas: cor pela entrega — vermelho até 2 dias, amarelo até 7, sem cor depois', () => {
  assert.equal(nivel({ entrega: '2026-10-05' }), 'vermelho');
  assert.equal(nivel({ entrega: '2026-10-08' }), 'vermelho');
  assert.equal(nivel({ entrega: '2026-10-10' }), 'vermelho');
  assert.equal(nivel({ entrega: '2026-10-11' }), 'amarelo');
  assert.equal(nivel({ entrega: '2026-10-15' }), 'amarelo');
  assert.equal(nivel({ entrega: '2026-10-16' }), null);
  assert.equal(nivel({}), null);
  assert.equal(nivel({ entrega: '2026-10-08', situacao: 'concluida' }), null);
  assert.equal(nivel({ entrega: '2026-10-08', cancelado_em: '2026-10-07T12:00:00Z' }), null);
});

test('Tarefas: a data que vem primeiro decide — entrega antes do fatal, ou o fatal', () => {
  const fatal12 = '2026-10-13T02:59:00Z'; // 12/10, 23h59 em Brasília
  assert.equal(nivel({ tipo: 'prazo', fatal_em: fatal12 }), 'amarelo');
  assert.equal(nivel({ tipo: 'prazo', fatal_em: fatal12, entrega: '2026-10-10' }), 'vermelho');
  assert.equal(nivel({ tipo: 'prazo', fatal_em: '2026-10-21T02:59:00Z', entrega: '2026-10-14' }), 'amarelo');
  // Prazo em horas que já passou, no próprio dia: vencido e vermelho.
  assert.equal(urgenciaTarefa({ situacao: 'pendente', contagem: 'horas', fatal_em: '2026-10-08T14:00:00Z' }, agoraCor).vencida, true);
  assert.equal(nivel({ contagem: 'horas', fatal_em: '2026-10-08T14:00:00Z' }), 'vermelho');
});

test('Tarefas: etiqueta diz quanto falta para a mesma data que dá a cor', () => {
  assert.equal(etiqueta({ entrega: '2026-10-08' }), 'Entrega hoje');
  assert.equal(etiqueta({ entrega: '2026-10-09' }), 'Entrega amanhã');
  assert.equal(etiqueta({ entrega: '2026-10-10' }), 'Entrega em 2 dias');
  assert.equal(etiqueta({ entrega: '2026-10-07' }), 'Entrega atrasada há 1 dia');
  assert.equal(etiqueta({ entrega: '2026-10-05' }), 'Entrega atrasada há 3 dias');
  assert.equal(etiqueta({ fatal_em: '2026-10-13T02:59:00Z' }), 'Fatal em 4 dias');
  assert.equal(etiqueta({ fatal_em: '2026-10-13T02:59:00Z', entrega: '2026-10-12' }), 'Fatal em 4 dias'); // empate: o fatal
  assert.equal(etiqueta({ fatal_em: '2026-10-13T02:59:00Z', entrega: '2026-10-10' }), 'Entrega em 2 dias');
  assert.equal(etiqueta({ fatal_em: '2026-10-09T02:59:00Z' }), 'Fatal hoje');
  assert.equal(etiqueta({ fatal_em: '2026-10-07T02:59:00Z', entrega: '2026-10-06' }), 'Fatal vencido');
  assert.equal(etiqueta({ contagem: 'horas', fatal_em: '2026-10-10T15:00:00Z' }), 'Vence em 48 h');
  assert.equal(etiqueta({ contagem: 'horas', fatal_em: '2026-10-10T15:00:00Z', entrega: '2026-10-08' }), 'Entrega hoje');
  assert.equal(etiqueta({ contagem: 'horas', fatal_em: '2026-10-08T14:00:00Z' }), 'Fatal vencido');
  assert.equal(etiqueta({ entrega: '2026-10-08', situacao: 'concluida' }), '');
  assert.equal(etiqueta({}), '');
});
