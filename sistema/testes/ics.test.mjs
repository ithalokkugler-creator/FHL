import test from 'node:test';
import assert from 'node:assert/strict';
import { escaparIcs, dobrarLinha, gerarIcs, linkGoogleAgenda } from '../js/dominio/ics.js';
import { mensagemLembrete } from '../js/dominio/mensagens.js';
const c = { id:'evento-1', inicio:'2026-10-05T14:00:00-03:00', fim:'2026-10-05T15:00:00-03:00',
  titulo:'Atendimento — José', tipo:'atendimento', modalidade:'presencial', cliente_nome:'José Silva',
  responsavel_nome:'Ithalo', tipo_nome:'Atendimento presencial', processo:'Caso de teste', observacoes:'RELATO INTERNO' };
const opcoes = { nome:'FHL — Agenda', agora:new Date('2026-10-05T12:00:00Z') };
const desdobrar = (texto) => texto.replace(/\r\n /g,'');

test('ICS escapa barra, vírgula, ponto e vírgula e todas as quebras de linha',()=>{
  assert.equal(escaparIcs('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  assert.equal(escaparIcs('a\r\nb\rc\nd'), 'a\\nb\\nc\\nd');
  assert.equal(escaparIcs(null),'');
});
test('ICS dobra acima de 75 octetos e preserva UTF-8 e emoji',()=>{
  for(const linha of ['A'.repeat(75),'A'.repeat(76),'SUMMARY:'+'á🙂'.repeat(55)]){
    const dobrada=dobrarLinha(linha);
    for(const trecho of dobrada.split('\r\n'))assert.ok(Buffer.byteLength(trecho,'utf8')<=75);
    assert.equal(desdobrar(dobrada),linha);
    assert.ok(!dobrada.includes('\uFFFD'));
  }
  assert.equal(dobrarLinha('A'.repeat(75)),'A'.repeat(75));
  assert.throws(()=>dobrarLinha('SUMMARY:x\nBEGIN:VEVENT'));
});
test('ICS usa CRLF, UID estável, carimbo UTC e horário de Brasília em UTC',()=>{
  const ics=gerarIcs([c],opcoes);
  assert.match(ics,/UID:evento-1@fhl-advocacia\r\n/);
  assert.match(ics,/DTSTAMP:20261005T120000Z\r\n/);
  assert.match(ics,/DTSTART:20261005T170000Z\r\nDTEND:20261005T180000Z/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!ics.replaceAll('\r\n','').includes('\n'));
  assert.match(desdobrar(ics),/SUMMARY:Atendimento — José/);
  assert.ok(!ics.includes('RELATO INTERNO'));
});
test('ICS e Google usam dias inteiros com fim exclusivo, inclusive virada de ano',()=>{
  for(const [inicio,fim,de,ate] of [
    ['2026-10-05','2026-10-07','20261005','20261007'],
    ['2026-12-31','2027-01-03','20261231','20270103'],
  ]){
    const inteiro={...c,dia_inteiro:true,inicio:inicio+'T00:00:00-03:00',fim:fim+'T00:00:00-03:00'};
    const ics=gerarIcs([inteiro],opcoes);
    assert.ok(ics.includes('DTSTART;VALUE=DATE:'+de));assert.ok(ics.includes('DTEND;VALUE=DATE:'+ate));
    assert.equal(new URL(linkGoogleAgenda(inteiro)).searchParams.get('dates'),de+'/'+ate);
  }
});
test('Google preenche título, horas UTC, local, responsável e caracteres especiais',()=>{
  const url=new URL(linkGoogleAgenda({...c,titulo:'Reunião & café + José',local_ou_link:'Sala, 2; Centro'}));
  assert.equal(url.origin,'https://calendar.google.com');assert.equal(url.pathname,'/calendar/render');
  assert.equal(url.searchParams.get('action'),'TEMPLATE');assert.equal(url.searchParams.get('text'),'Reunião & café + José');
  assert.equal(url.searchParams.get('dates'),'20261005T170000Z/20261005T180000Z');
  assert.equal(url.searchParams.get('location'),'Sala, 2; Centro');assert.match(url.searchParams.get('details'),/Ithalo/);
  assert.ok(!url.href.includes('RELATO'));
});
test('Mascarado sai apenas como Ocupado mesmo com detalhes indevidos na entrada',()=>{
  const privado={...c,mascarado:true,particular:true,local_ou_link:'LOCAL SIGILOSO',lembrete_minutos:30};
  const ics=gerarIcs([privado],opcoes);
  assert.match(ics,/SUMMARY:Ocupado\r\nLOCATION:\r\nDESCRIPTION:\r\n/);
  for(const secreto of ['José','Ithalo','LOCAL SIGILOSO','Caso de teste','RELATO','VALARM'])assert.ok(!ics.includes(secreto));
  assert.match(ics,/CLASS:PRIVATE/);assert.equal(linkGoogleAgenda(privado),null);
});
test('Cancelar exclui evento, UID duplicado não repete e exportação vazia é válida',()=>{
  const ics=gerarIcs([c,c,{...c,id:'cancelado',cancelado_em:'2026-10-04'}],opcoes);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length,1);
  assert.equal(linkGoogleAgenda({...c,cancelado_em:'2026-10-04'}),null);
  assert.ok(!gerarIcs([],opcoes).includes('BEGIN:VEVENT'));
});
test('ICS preserva fim original quando evento cruza o período exportado',()=>{
  const longo={...c,inicio:'2026-09-30T00:00:00-03:00',fim:'2026-10-10T00:00:00-03:00',dia_inteiro:true};
  assert.match(gerarIcs([longo],opcoes),/DTSTART;VALUE=DATE:20260930\r\nDTEND;VALUE=DATE:20261010/);
});
test('ICS inclui alarme escolhido e não inventa alarme sem configuração',()=>{
  assert.match(gerarIcs([{...c,lembrete_minutos:1440}],opcoes),/BEGIN:VALARM\r\nTRIGGER:-PT1440M\r\nACTION:DISPLAY/);
  assert.ok(!gerarIcs([{...c,lembrete_minutos:null}],opcoes).includes('VALARM'));
});
test('ICS impede injeção em texto e rejeita ID ou período inválido',()=>{
  const ics=gerarIcs([{...c,titulo:'Título\r\nBEGIN:VEVENT,;'}],opcoes);
  assert.equal(ics.match(/\r\nBEGIN:VEVENT/g).length,1);
  assert.match(ics,/SUMMARY:Título\\nBEGIN:VEVENT\\,\\;/);
  assert.throws(()=>gerarIcs([{...c,id:'id\nBEGIN:VEVENT'}],opcoes));
  assert.throws(()=>gerarIcs([{...c,fim:c.inicio}],opcoes));
  assert.throws(()=>linkGoogleAgenda({...c,inicio:'inválido'}));
});
test('Lembrete do atendimento contém responsável, remetente, data, hora e local/link',()=>{
  const presencial=mensagemLembrete({compromisso:c,remetente:'Secretária',advogado:'Ithalo'});
  assert.match(presencial,/Aqui é Secretária/);assert.match(presencial,/5 de outubro/);assert.match(presencial,/14:00, com Ithalo/);
  assert.match(presencial,/Rua Dr. Leocádio, 282/);assert.match(presencial,/Paranaguá/);assert.match(presencial,/responder esta mensagem/);
  const online=mensagemLembrete({compromisso:{...c,modalidade:'online',local_ou_link:'https://example.test/sala'},remetente:'Secretária',advogado:'Ithalo'});
  assert.match(online,/https:\/\/example.test\/sala/);assert.ok(!online.includes('Rua Dr. Leocádio'));
});
