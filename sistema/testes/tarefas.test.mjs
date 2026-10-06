import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertaTarefa, filtrarTarefas, podeAlterarTarefa, periodoPrazos } from '../js/dominio/tarefas.js';
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
