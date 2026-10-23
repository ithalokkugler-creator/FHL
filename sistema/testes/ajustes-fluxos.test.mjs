import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { criarBanco, comoUsuario } from '../../scripts/local/banco.mjs';
import { camposDasAnotacoes, criarGravadorAnotacoes } from '../js/dominio/anotacoes-cronometro.js';
import { acharCliente } from '../js/dominio/clientes.js';
import { criarSincronizador } from '../../supabase/functions/google-agenda/handler.js';

test('Homônimos sem documento não são resolvidos silenciosamente por texto', () => {
  const clientes=[{id:'a',nome:'Homônimo Fictício',documento:null},{id:'b',nome:'Homônimo Fictício',documento:null}];
  assert.equal(acharCliente(clientes,'Homônimo Fictício',c=>c.nome),null);
  assert.equal(acharCliente(clientes,'homônimo fictício',c=>c.nome),null);
});

test('Anotações: autosave e Salvar são serializados com a versão retornada, sem reenviar campo inalterado', async () => {
  let liberar;
  const chamadas=[];
  const gravar=criarGravadorAnotacoes({relato:'Antes',proxima_providencia:'Providência original',alterado_em:null},async p=>{
    chamadas.push(p);
    if(chamadas.length===1)await new Promise(r=>{liberar=r;});
    return {alterado_em:`versao-${chamadas.length}`};
  });
  const a=gravar({relato:'Primeira edição',proxima_providencia:'Providência original'});
  await Promise.resolve();await Promise.resolve();
  const b=gravar({relato:'Segunda edição',proxima_providencia:'Providência original'});
  assert.equal(chamadas.length,1);
  liberar();await Promise.all([a,b]);
  assert.deepEqual(chamadas,[{versao:null,campos:{relato:'Primeira edição'}},{versao:'versao-1',campos:{relato:'Segunda edição'}}]);
  assert.deepEqual(camposDasAnotacoes({relato:'Texto',proxima_providencia:'Manter'},{relato:' ',proxima_providencia:'Manter'}),{relato:null});
});

test('Anotações: conflito não troca a fotografia salva nem perde o rascunho da fila',async()=>{
  const chamadas=[];
  const gravar=criarGravadorAnotacoes({relato:'Antes',alterado_em:'v-antiga'},async p=>{chamadas.push(p);throw new Error('Conflito');});
  await assert.rejects(gravar({relato:'Rascunho a conservar',proxima_providencia:''}),/Conflito/);
  await assert.rejects(gravar({relato:'Rascunho a conservar',proxima_providencia:'Providência nova'}),/Conflito/);
  assert.deepEqual(chamadas[1],{versao:'v-antiga',campos:{relato:'Rascunho a conservar',proxima_providencia:'Providência nova'}});
});

test('Migração de sistema preserva todos os registros existentes e transfere só a identidade comprovada do Google',async(t)=>{
  const db=await criarBanco({ate:'20261022120000'});
  try {
    const u='a1000000-0000-4000-8000-000000000001';
    await db.query("insert into auth.users(id,email) values($1,'sistema-migracao@example.test')",[u]);
    const {rows:[m]}=await db.query("insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes,acesso_agenda,google_agenda) values($1,'Auditor Fictício','Auditor Migração','sistema-migracao@example.test','admin','editar','todas','c_sistema_a@group.calendar.google.com') returning id",[u]);
    const {rows:[m2]}=await db.query("insert into public.membros(nome,nome_curto,papel,google_agenda) values('Sócio Fictício B','Sócio B','socio','c_sistema_b@group.calendar.google.com') returning id");
    const {rows:[c]}=await db.query("insert into public.clientes(nome) values('Cliente da migração fictício') returning id");
    const asUser=fn=>comoUsuario(db,{papel:'authenticated',claims:{sub:u}},fn);
    await asUser(tx=>tx.query("select public.iniciar_cronometro($1::jsonb)",[JSON.stringify({cliente_id:c.id,relato:'Texto antigo deve permanecer'})]));
    const antigo={id:'evento-legado',etag:'legado-v1',status:'confirmed',titulo:'Compromisso legado',inicio:'2026-11-02T12:00:00Z',fim:'2026-11-02T13:00:00Z',tipo:'interno',organizador:'c_sistema_a@group.calendar.google.com',ical_uid:'legado@google.com'};
    await db.query('select public.google_agenda_aplicar($1,$2::jsonb)',['c_sistema_a@group.calendar.google.com',JSON.stringify([antigo])]);
    const tables=['public.clientes','public.membros','public.atualizacoes','public.compromissos','public.processos','public.documentos','privado.google_eventos'];
    const snap=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`select to_jsonb(x) - 'ical_uid' - 'ocorrencia' as linha from ${table} x order by to_jsonb(x)::text`)).rows])));
    const before=await snap();
    await db.exec(await readFile(new URL('../../supabase/migrations/20261023130757_ajustes_cronometro_google.sql',import.meta.url),'utf8'));
    assert.deepEqual(await snap(),before,'DDL não pode regravar os dados anteriores');
    await db.query('select public.google_agenda_aplicar($1,$2::jsonb)',['c_sistema_a@group.calendar.google.com',JSON.stringify([antigo])]);
    assert.equal((await db.query("select ical_uid from privado.google_eventos where evento_id='evento-legado'")).rows[0].ical_uid,'legado@google.com','leitura normal aprende UID até com etag igual');
    const calA='c_sistema_a@group.calendar.google.com',calB='c_sistema_b@group.calendar.google.com';
    const base={etag:'v1',atualizado_em:new Date().toISOString(),status:'confirmed',titulo:'Evento fictício',inicio:'2026-11-01T12:00:00Z',fim:'2026-11-01T13:00:00Z',dia_inteiro:false,tipo:'atendimento',modalidade:'presencial',reserva:true,particular:true,ical_uid:'identidade-ficticia@google.com',ocorrencia:null,organizador:calA};
    const apply=async(cal,events)=>(await db.query('select public.google_agenda_aplicar($1,$2::jsonb) as r',[cal,JSON.stringify(events)])).rows[0].r;
    const ev={...base,id:'evento-nativo-auditoria'};
    assert.equal((await apply(calA,[ev])).criados,1);
    const {rows:[origin]}=await db.query('select compromisso_id as id from privado.google_eventos where evento_id=$1',[ev.id]);
    await asUser(tx=>tx.query('update public.compromissos set cliente_id=$2,processo=$3 where id=$1',[origin.id,c.id,'Referência interna a preservar']));
    const moved={...ev,organizador:calB,etag:'v2',transferido_de:calA,ical_uid_origem:ev.ical_uid};
    const r=await apply(calB,[moved]);
    assert.deepEqual(r.erros,[]);assert.equal(r.criados,0);assert.equal(r.alterados,1);
    await apply(calA,[{id:ev.id,status:'cancelled',atualizado_em:new Date().toISOString()}]);
    const {rows:[after]}=await db.query('select c.id,c.cliente_id,c.processo,c.cancelado_em,c.particular,c.membro_id,g.origem,g.calendario from public.compromissos c join privado.google_eventos g on g.compromisso_id=c.id where c.id=$1',[origin.id]);
    assert.equal(after.id,origin.id);assert.equal(after.cliente_id,c.id);assert.equal(after.processo,'Referência interna a preservar');assert.equal(after.cancelado_em,null);assert.equal(after.membro_id,m2.id);assert.equal(after.origem,'google');assert.equal(after.particular,true);
    const {rows:masked}=await asUser(tx=>tx.query("select * from public.agenda_periodo('2026-11-01T00:00:00Z','2026-11-02T00:00:00Z') where id=$1",[origin.id]));
    assert.equal(masked[0].mascarado,true);assert.equal(masked[0].cliente_id,null);assert.equal(masked[0].processo,null);
    const copy={...base,id:'evento-copia-auditoria',ical_uid:'mesmo-uid-copia@google.com'};
    await apply(calA,[copy]);
    const copied=await apply(calB,[{...copy,organizador:calB}]);
    assert.equal(copied.criados,1,'sem confirmação de origem excluída não funde a cópia');
    assert.equal((await db.query('select count(*)::int n from privado.google_eventos where evento_id=$1',[copy.id])).rows[0].n,2);
    const recurrence={...base,id:'ocorrencia-auditoria',ical_uid:'serie@google.com',ocorrencia:'2026-11-01T12:00:00Z'};
    await apply(calA,[recurrence]);
    const candidates=await db.query('select public.google_agenda_possiveis_transferencias($1,$2::jsonb) r',[calB,JSON.stringify([{...recurrence,organizador:calB,ocorrencia:'2026-11-02T12:00:00Z'}])]);
    assert.deepEqual(candidates.rows[0].r,[],'mesma série com ocorrência diferente não é transferência');
    await t.test('SQL de permissões e compatibilidade',async()=>{
      const results=await db.exec(await readFile(new URL('../../supabase/testes/ajustes-sistema.sql',import.meta.url),'utf8'));
      const cases=results.flatMap(x=>x.rows).filter(x=>'ok'in x);
      assert.equal(cases.length,15);assert.deepEqual(cases.filter(x=>!x.ok),[]);
    });
  } finally {await db.close();}
});

async function executarGoogle({origemViva=false,uidLegado=false,uidTombstone=false}={}) {
  const calA='c_origem@group.calendar.google.com',calB='c_destino@group.calendar.google.com';
  const e={id:'evento-ficticio',status:'confirmed',etag:'v2',iCalUID:'uid-ficticio@google.com',summary:'Evento fictício',organizer:{email:calB},start:{dateTime:'2026-11-01T12:00:00Z'},end:{dateTime:'2026-11-01T13:00:00Z'}};
  const applied=[];const methods=[];
  const handler=criarSincronizador({url:'https://banco.example.test',chave:'sb_secret_ficticia',clienteId:'fake',segredo:'fake',retorno:'https://retorno.example.test',sistema:'https://sistema.example.test',buscar:async(url,options={})=>{
    if(url.includes('/rest/v1/rpc/')){
      const name=url.split('/').at(-1);const p=JSON.parse(options.body??'{}');
      const responses={google_agenda_situacao:{conectado:true},google_agenda_conexao:{refresh_token:'ficticio'},google_agenda_travar:true,google_agenda_calendarios:[{calendario:calA},{calendario:calB}],google_agenda_conferir:[],google_agenda_pendencias:[],google_agenda_destravar:null};
      if(name==='google_agenda_possiveis_transferencias')return Response.json(p.p_calendario===calB?[{id:e.id,calendario:calA,ical_uid:uidLegado?null:e.iCalUID,ocorrencia:null}]:[]);
      if(name==='google_agenda_aplicar'){applied.push(p);return Response.json({criados:0,alterados:0,cancelados:0,erros:[]});}
      if(name in responses)return Response.json(responses[name]);
      throw new Error(`RPC inesperada ${name}`);
    }
    if(url.includes('oauth2.googleapis.com/token'))return Response.json({access_token:'ficticio'});
    methods.push(options.method??'GET');
    if(url.includes('/events?'))return Response.json({items:url.includes(encodeURIComponent(calB))?[e]:[{id:e.id,status:'cancelled'}]});
    if(url.includes(`/events/${e.id}`))return Response.json(origemViva?{...e,organizer:{email:calA}}:{id:e.id,status:'cancelled',...(uidTombstone?{iCalUID:e.iCalUID}:{})});
    throw new Error(`Rede inesperada ${url}`);
  }});
  const r=await handler(new Request('https://funcao.example.test',{method:'POST',headers:{Authorization:'Bearer FICTICIO','Content-Type':'application/json'},body:'{"acao":"sincronizar"}'}));
  return {result:await r.json(),applied,methods,calA,calB};
}

test('Google: handler confirma origem excluída, copia viva permanece separada e legado ambíguo não apaga vínculos',async()=>{
  const move=await executarGoogle();
  assert.equal(move.result.erro,null);assert.equal(move.applied.find(x=>x.p_calendario===move.calB).p_eventos[0].transferido_de,move.calA);
  assert.ok(move.methods.every(x=>x==='GET'),'eventos nativos nunca são escritos no Google');
  const copy=await executarGoogle({origemViva:true});
  assert.equal(copy.applied.find(x=>x.p_calendario===copy.calB).p_eventos[0].transferido_de,undefined);
  const ambiguous=await executarGoogle({uidLegado:true});
  assert.match(ambiguous.result.erro,/faltam dados/);assert.equal(ambiguous.applied.length,0,'não cancela original sem identidade suficiente');
  const legacy=await executarGoogle({uidLegado:true,uidTombstone:true});
  assert.equal(legacy.result.erro,null);assert.equal(legacy.applied.find(x=>x.p_calendario===legacy.calB).p_eventos[0].transferido_de,legacy.calA);
});
