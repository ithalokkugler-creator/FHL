import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const executar=promisify(execFile);
const moduleUrl=new URL('../js/nucleo/supabase.js',import.meta.url).href;

// Processo isolado para testar duas instâncias reais do cliente, com o
// mesmo armazenamento e eventos storage. Nenhuma requisição sai da máquina.
test('Sessão: respostas antigas não restauram logout nem substituem outra identidade entre abas',async()=>{
  const code=`
    import assert from 'node:assert/strict';
    const storage=new Map();const listeners=[];
    globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
    globalThis.addEventListener=(name,fn)=>{if(name==='storage')listeners.push(fn);};
    globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
    Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_n,fn)=>fn()}},configurable:true});
    let resposta;let modo='sucesso';
    globalThis.fetch=async(url)=>{
      if(url.includes('grant_type=refresh_token'))return new Promise(resolve=>{resposta=()=>resolve(modo==='erro'?Response.json({error_code:'invalid_grant'},{status:400}):modo==='limite'?Response.json({error_code:'over_request_rate_limit'},{status:429}):Response.json({access_token:'NOVO_A',refresh_token:'REFRESH_NOVO_A',expires_in:3600}));});
      if(url.includes('grant_type=password'))return Response.json({access_token:'TOKEN_B',refresh_token:'REFRESH_B',expires_in:3600});
      if(url.includes('logout'))return new Response(null,{status:204});
      throw new Error('Rede inesperada');
    };
    const storageEvent=()=>listeners.forEach(fn=>fn({key:'fhl.sessao'}));
    let n=0;
    for(const scenario of ['logout-local','logout-outra-aba','login-outra-aba','erro-apos-login','normal','limite']){
      storage.clear();listeners.length=0;
      storage.set('fhl.sessao',JSON.stringify({access_token:'TOKEN_A',refresh_token:'REFRESH_A',expires_at:Math.floor(Date.now()/1000)+20}));
      const a=await import(${JSON.stringify(moduleUrl)}+'?teste='+n++);
      const b=await import(${JSON.stringify(moduleUrl)}+'?teste='+n++);
      modo=scenario==='erro-apos-login'?'erro':scenario==='limite'?'limite':'sucesso';
      const pending=a.renovar();
      if(scenario==='logout-local')await a.sair();
      if(scenario==='logout-outra-aba'){await b.sair();storageEvent();}
      if(scenario==='login-outra-aba'||scenario==='erro-apos-login'){await b.entrar('ficticio@example.test','FICTICIA');storageEvent();}
      resposta();await pending.catch(e=>{if(scenario!=='limite')throw e;});
      if(scenario.startsWith('logout')){assert.equal(a.sessaoAtual(),null);assert.equal(storage.has('fhl.sessao'),false);}
      else if(scenario.includes('login')){assert.equal(a.sessaoAtual().access_token,'TOKEN_B');assert.equal(JSON.parse(storage.get('fhl.sessao')).access_token,'TOKEN_B');}
      else assert.equal(a.sessaoAtual().access_token,scenario==='normal'?'NOVO_A':'TOKEN_A');
    }
    console.log('6 cenários de sessão aprovados');
  `;
  const {stdout}=await executar(process.execPath,['--input-type=module','-e',code]);
  assert.match(stdout,/6 cenários de sessão aprovados/);
});
