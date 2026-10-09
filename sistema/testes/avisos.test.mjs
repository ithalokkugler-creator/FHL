import test from 'node:test';
import assert from 'node:assert/strict';
import { proximoAniversario, aniversariantes } from '../js/dominio/aniversarios.js';
import { mensagemAniversario, mensagemLembrete } from '../js/dominio/mensagens.js';
import { tarefasParaHoje } from '../js/dominio/avisos-do-dia.js';

for (const [nascimento, hoje, esperado] of [
  ['1985-10-05','2026-10-05',{data:'2026-10-05',dias:0,idade:41}],
  ['1985-10-12','2026-10-05',{data:'2026-10-12',dias:7,idade:41}],
  ['1985-10-04','2026-10-05',{data:'2027-10-04',dias:364,idade:42}],
  ['1992-02-29','2027-02-27',{data:'2027-02-28',dias:1,idade:35}],
  ['1992-02-29','2028-02-01',{data:'2028-02-29',dias:28,idade:36}],
  ['2000-01-01','2026-12-31',{data:'2027-01-01',dias:1,idade:27}],
]) test(`Aniversário ${nascimento}, hoje ${hoje}`, () => assert.deepEqual(proximoAniversario(nascimento, hoje), esperado));

test('Aniversários ignoram datas ausentes, impossíveis, futuras e hoje inválido', () => {
  for (const nascimento of [null,'','1990-02-29','1985-04-31','2030-10-05']) assert.equal(proximoAniversario(nascimento,'2026-10-05'),null);
  assert.equal(proximoAniversario('1985-10-05','2026-02-30'),null);
});
test('Lista de aniversários exclui PJ e inativos, inclui dia 7 e ordena por proximidade', () => {
  const c = { ativo:true,tipo_pessoa:'fisica',nome:'José',nascimento:'1985-10-05' };
  const lista = [{...c,id:'1',nascimento:'1985-10-12'}, {...c,id:'2'}, {...c,id:'3',ativo:false},
    {...c,id:'4',tipo_pessoa:'juridica'}, {...c,id:'5',nascimento:'1985-10-13'}, {...c,id:'6',nascimento:null}];
  assert.deepEqual(aniversariantes(lista,'2026-10-05').map((c)=>c.id), ['2','1']);
});
test('Mensagem de aniversário usa primeiro nome e o remetente escolhido', () => {
  assert.equal(mensagemAniversario({cliente:{nome:'  José Fictício  '},remetente:'Ithalo'}),
    'Olá, José! Aqui é Ithalo, da Fonseca Lisboa Advocacia. Passando para desejar um feliz aniversário — muita saúde, muita sorte, e que Deus te abençoe! Precisando de alguma coisa, estamos à disposição.');
});
test('Lembrete usa data e hora de Brasília, endereço único e local/link informado', () => {
  const compromisso={cliente_nome:'José Silva',inicio:'2026-10-06T01:30:00Z',modalidade:'presencial'};
  const texto=mensagemLembrete({compromisso,remetente:'Sócia'});
  assert.match(texto,/José!/);assert.match(texto,/segunda, 5 de outubro/);assert.match(texto,/22:30/);assert.match(texto,/Rua Dr. Leocádio, 282/);
  assert.match(mensagemLembrete({compromisso:{...compromisso,modalidade:'online',local_ou_link:'https://example.test/sala'},remetente:'Sócia'}),/online: https:\/\/example.test\/sala/);
  assert.match(mensagemLembrete({compromisso:{...compromisso,modalidade:'online'},remetente:'Sócia'}),/link será confirmado/);
});
test('Avisos agrupam uma vez, incluem dia 7, excluem concluídas, canceladas e sem data', () => {
  const t={id:'1',situacao:'pendente',entrega:'2026-10-05',fatal_em:'2026-10-05T22:00:00Z'};
  const lista=[t,{...t,id:'2',entrega:'2026-10-04'}, {...t,id:'3',entrega:'2026-10-12',fatal_em:null},
    {...t,id:'4',entrega:'2026-10-13',fatal_em:null}, {...t,id:'5',situacao:'concluida'}, {...t,id:'6',cancelado_em:'2026-10-05'},
    {...t,id:'7',fatal_em:null,entrega:null}];
  assert.deepEqual(tarefasParaHoje(lista,new Date('2026-10-05T15:00:00Z')).map((t)=>[t.id,t.grupo]), [['2','atrasadas'],['1','hoje'],['3','proximas']]);
});
test('Avisos respeitam fatal em Brasília e instante vencido mesmo sem entrega', () => {
  const agora=new Date('2026-10-05T15:00:00Z');
  assert.equal(tarefasParaHoje([{id:'1',situacao:'pendente',fatal_em:'2026-10-06T01:00:00Z'}],agora)[0].grupo,'hoje');
  assert.equal(tarefasParaHoje([{id:'2',situacao:'pendente',fatal_em:'2026-10-05T14:59:00Z'}],agora)[0].grupo,'atrasadas');
});
