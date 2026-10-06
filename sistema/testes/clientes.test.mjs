import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararCliente, prepararProcesso, filtrarClientes, filtrarProcessos, diasParaAniversario, ultimaAlteracao } from '../js/dominio/clientes.js';

test('cadastro PF normaliza CPF, contatos e campos vazios, sem inferir concordância',()=>{
  const p=prepararCliente({nome:' José ',documento:'123.456.789-09',telefone:'(41) 90000-0000',email:'JOSE@EXAMPLE.TEST',cep:'83203-000',uf:'pr',recado_relacao:' Mãe ',recado_telefone:'41900000001'},'cliente-id');
  assert.equal(p.id,'cliente-id');assert.equal(p.nome,'José');assert.equal(p.documento,'12345678909');assert.equal(p.telefone,'41900000000');
  assert.equal(p.email,'jose@example.test');assert.equal(p.detalhes.cep,'83203000');assert.equal(p.detalhes.uf,'PR');assert.equal(p.detalhes.flexao,null);assert.equal(p.detalhes.recado_relacao,'Mãe');
});
test('cadastro PJ e representante validam seus próprios documentos',()=>{
  const p=prepararCliente({nome:'Empresa',tipo_pessoa:'juridica',documento:'11.222.333/0001-81',representante_documento:'987.654.321-00',flexao:'f'});
  assert.equal(p.documento,'11222333000181');assert.equal(p.detalhes.representante_documento,'98765432100');assert.equal(p.detalhes.flexao,'f');
  assert.throws(()=>prepararCliente({nome:'Empresa',tipo_pessoa:'fisica',documento:p.documento}),/usa CPF/);
  assert.throws(()=>prepararCliente({nome:'José',tipo_pessoa:'juridica',documento:'12345678909'}),/usa CNPJ/);
});
test('cadastro rejeita CPF, telefone, CEP, UF, representante e datas inválidos',()=>{
  for(const d of [{documento:'12345678900'},{telefone:'texto'},{telefone:'123'},{recado_telefone:'419000000a'},{cep:'texto'},{cep:'1234567'},{uf:'ZZ'},{representante_documento:'11111111111'},{nascimento:'2026-02-30'},{tipo_pessoa:'incerto'},{flexao:'adivinhar'}])assert.throws(()=>prepararCliente({nome:'Fictício',...d}),undefined,JSON.stringify(d));
  assert.equal(prepararCliente({nome:'Fictício',nascimento:'2000-02-29'}).detalhes.nascimento,'2000-02-29');
});
test('CNJ válido normaliza a máscara; caso sem CNJ conserva sua referência',()=>{
  const base={cliente_id:'cliente',titulo:'Caso',area:'civel',situacao:'em_andamento'};
  assert.equal(prepararProcesso({...base,numero:'0001234-22.2025.8.16.0001'},{civel:'Cível'}).numero,'00012342220258160001');
  const caso=prepararProcesso({...base,numero:'',referencia:' PROTOCOLO '},{civel:'Cível'});assert.equal(caso.numero,null);assert.equal(caso.referencia,'PROTOCOLO');
  for(const numero of ['0001234-89.2025.8.16.0001','00012342220258160001a','123'])assert.throws(()=>prepararProcesso({...base,numero},{civel:'Cível'}),/CNJ inválido/);
});
const cs=[{id:'j',nome:'José da Silva',documento:'12345678909',telefone:'41900000000',email:'jose@example.test',ativo:true},{id:'e',nome:'Empresa',ativo:true},{id:'i',nome:'Inativo',ativo:false}];
const ds=[{cliente_id:'j',representante_nome:'Mãe',responsavel_id:'m'}];
const ps=[{cliente_id:'j',numero:'00012342220258160001',area:'civel',situacao:'em_andamento',responsavel_id:'m',tribunal:'TJPR',titulo:'Ação'}, {cliente_id:'j',area:'trabalhista',situacao:'encerrado',titulo:'Outro caso'}, {cliente_id:'e',area:'civel',situacao:'em_analise',titulo:'Consultoria'}];
test('clientes buscam nome sem acento e CPF, telefone ou CNJ com máscara',()=>{
  for(const busca of ['jose','123.456.789-09','(41) 90000-0000','0001234-22.2025.8.16.0001','JOSE@EXAMPLE.TEST'])assert.deepEqual(filtrarClientes(cs,ds,ps,{busca}).map((c)=>c.id),['j']);
  assert.deepEqual(filtrarClientes(cs,ds,ps,{busca:'---'}),[]);
});
test('filtros combinados de área e situação pertencem ao mesmo processo',()=>{
  assert.deepEqual(filtrarClientes(cs,ds,ps,{area:'civel',situacao:'encerrado'}),[]);
  assert.deepEqual(filtrarClientes(cs,ds,ps,{area:'civel',situacao:'em_andamento',representante:'sim',responsavel:'m'}).map((c)=>c.id),['j']);
  assert.deepEqual(filtrarClientes(cs,ds,ps,{ativo:'inativos'}).map((c)=>c.id),['i']);
  assert.equal(filtrarClientes(cs,ds,ps,{ativo:'todos'}).length,3);
});
test('processos excluem encerrados por padrão e combinam busca com filtros',()=>{
  assert.equal(filtrarProcessos(ps,cs,{}).length,2);assert.equal(filtrarProcessos(ps,cs,{situacao:'todos'}).length,3);
  assert.equal(filtrarProcessos(ps,cs,{busca:'jose',area:'civel',tribunal:'TJPR',responsavel:'m'}).length,1);
  assert.equal(filtrarProcessos(ps,cs,{situacao:'encerrado'}).length,1);
});
test('aniversário cruza virada de ano e trata 29/02 sem conversão de fuso',()=>{
  assert.equal(diasParaAniversario('1990-01-02','2026-12-30'),3);
  assert.equal(diasParaAniversario('2000-02-29','2027-02-27'),1);
  assert.equal(diasParaAniversario('2000-02-29','2028-02-28'),1);
  assert.equal(diasParaAniversario('1990-10-05','2026-10-05'),0);assert.equal(diasParaAniversario(null,'2026-10-05'),null);
});
test('última alteração considera detalhes, processos e offsets diferentes',()=>{
  assert.equal(ultimaAlteracao({criado_em:'2026-10-05T12:00:00Z'},{alterado_em:'2026-10-05T10:00:00-03:00'},[{alterado_em:'2026-10-05T12:30:00Z'}]),'2026-10-05T10:00:00-03:00');
});
