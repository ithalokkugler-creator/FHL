// Simulação de F3/F4 para a prévia; as políticas reais são testadas em Postgres.
import { randomUUID } from 'node:crypto';
import { hoje,somarDias } from '../../sistema/js/nucleo/formato.js';
import { TIPOS_ATUALIZACAO } from '../../sistema/js/dominio/tempo.js';
const agora=()=>new Date().toISOString();
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientes=(m)=>m.papel==='admin'||m.acesso_clientes==='editar';
const editaAgenda=(m,c)=>(m.papel==='admin'||m.acesso_agenda==='todas'||m.acesso_agenda==='propria'&&c.membro_id===m.id)&&(!c.particular||c.membro_id===m.id);
const erro=(message,status=400,code='P0001')=>Response.json({message,code},{status});
export function complementarDados(d){
 d.membros[0].oab='OAB/PR 000.001 (fictícia)';d.membros[1].oab='OAB/PR 000.002 (fictícia)';
 d.clientes_detalhes[0].flexao='m';
 Object.assign(d.clientes_detalhes[1],{logradouro:'Rua da Empresa Fictícia',numero:'200',bairro:'Centro',cidade:'Paranaguá',uf:'PR',cep:'83203000'});
 d.compromissos.forEach((c)=>Object.assign(c,{tipo:'atendimento',modalidade:'presencial',dia_inteiro:false,chegada_em:null,observacoes:null,processo:null,local_ou_link:null}));
 d.compromissos.push({...d.compromissos[0],id:id(604),titulo:'Atendimento Fictício de Hoje',membro_id:d.membros[0].id,inicio:hoje()+'T10:00:00-03:00',fim:hoje()+'T11:00:00-03:00'});
 Object.assign(d.v_contratos[0],{tipo_honorario:'fixo',valor_total:2000,recebido:500,exito_pct:null,processo:'0001234-22.2025.8.16.0001',proximo_vencimento:somarDias(hoje(),-3),cancelado_em:null,responsavel_id:d.membros[0].id,multa_pct:null,juros_mes_pct:null,correcao:null,carencia_dias:null,cliente_telefone:d.clientes[1].telefone,observacoes:null});
 d.v_parcelas=[{id:id(711),numero:0,valor:500,recebido:500,saldo:0,situacao:'paga',dias:-30},{id:id(712),numero:1,valor:500,recebido:0,saldo:500,situacao:'vencida',dias:-3},{id:id(713),numero:2,valor:500,recebido:0,saldo:500,situacao:'a_vencer',dias:27},{id:id(714),numero:3,valor:500,recebido:0,saldo:500,situacao:'a_vencer',dias:57}].map(({dias,...p})=>({...p,contrato_id:id(701),cliente_id:id(202),cliente_nome:d.clientes[1].nome,contrato_descricao:d.v_contratos[0].descricao,vencimento:somarDias(hoje(),dias),multa_pct:10,juros_mes_pct:1,correcao:'nenhuma',carencia_dias:0,cancelado_em:null,renegociacao_id:null}));
 d.v_recebimentos=[{id:id(721),parcela_id:id(711),contrato_id:id(701),data:somarDias(hoje(),-30),valor:500,principal:500,estornado_em:null,criado_em:agora()},{id:id(722),parcela_id:id(712),contrato_id:id(701),data:somarDias(hoje(),-2),valor:999,principal:999,estornado_em:agora(),criado_em:agora()}];
 d.config_financeiro=[{id:1,multa_pct:10,juros_mes_pct:1,correcao:'nenhuma',carencia_dias:0,pix_chave:'PIX FICTÍCIO',pix_titular:'FHL FICTÍCIO',banco:'Banco Fictício',agencia:'0000',conta:'00000'}];
 d.config_agenda=[{id:1,hora_inicio:8,hora_fim:19,intervalo_minimo:15,duracao_atendimento:60,duracao_retorno:30,duracao_audiencia:60,duracao_interno:60,mostrar_fim_semana:false}];
 d.documentos=[];
 d.atualizacoes=[{id:id(801),membro_id:d.membros[1].id,participantes:[d.membros[0].id],tipo:'pesquisa',cronometrado:false,relato:'Relato interno fictício: pesquisa da documentação e orientação ao cliente.',dias:-2,horas:1},{id:id(802),membro_id:d.membros[0].id,participantes:[],tipo:'atendimento_presencial',cronometrado:true,relato:'Atendimento fictício concluído.',dias:-1,horas:.5}].map(({dias,horas,...a})=>({...a,cliente_id:id(202),processo_id:id(501),inicio:somarDias(hoje(),dias)+'T09:00:00-03:00',fim:somarDias(hoje(),dias)+(horas===1?'T10:00:00-03:00':'T09:30:00-03:00'),proxima_providencia:'Conferir documentos.',compromisso_id:null,cancelado_em:null,cancelado_por:null,motivo_cancelamento:null,criado_em:agora(),criado_por:a.membro_id,alterado_em:null}));
 d.atualizacoes.push({...d.atualizacoes[0],id:id(803),membro_id:d.membros[2].id,participantes:[],inicio:new Date(Date.now()-9*3600000).toISOString(),fim:null,cronometrado:true,relato:'Cronômetro fictício esquecido — testar a hora real de fim.',criado_por:d.membros[2].id});
 return d;
}
export async function tratarAtividades({dados:d,req,caminho:c,corpo:b,membro:m,auditar,filtrar,selecionar,params}){
 const especial=['documentos','atualizacoes'].includes(c)||['rpc/iniciar_cronometro','rpc/parar_cronometro','rpc/meu_cronometro'].includes(c);
 if(c==='rpc/agenda_periodo'){
  if(m.papel!=='admin'&&m.acesso_agenda==='nenhum')return erro('Sem acesso à Agenda.',403,'42501');
  return Response.json(d.compromissos.filter((a)=>!a.cancelado_em&&Date.parse(a.inicio)<Date.parse(b.p_ate)&&Date.parse(a.fim)>Date.parse(b.p_de)).map((a)=>a.particular&&a.membro_id!==m.id?{id:a.id,inicio:a.inicio,fim:a.fim,membro_id:a.membro_id,titulo:'Ocupado',tipo:'bloqueio',particular:true,situacao:'agendado',mascarado:true,pode_editar:false,dia_inteiro:a.dia_inteiro}:{...a,pode_editar:editaAgenda(m,a),mascarado:false,cliente_nome:d.clientes.find((v)=>v.id===a.cliente_id)?.nome,cliente_telefone:d.clientes.find((v)=>v.id===a.cliente_id)?.telefone}));
 }
 if(!especial)return null;
 if(!clientes(m))return req.method==='GET'?Response.json([]):erro('Sem acesso às atualizações e documentos.',403,'42501');
 const validar=(a)=>{
  if(!d.clientes.some((v)=>v.id===a.cliente_id))throw new Error('Cliente não encontrado.');
  for(const [campo,tabela] of [['processo_id','processos'],['compromisso_id','compromissos'],['contrato_id','v_contratos'],['atualizacao_id','atualizacoes']])if(a[campo]&&!d[tabela].some((v)=>v.id===a[campo]&&v.cliente_id===a.cliente_id))throw new Error('A origem não pertence a este cliente.');
  if(a.tipo){if(!TIPOS_ATUALIZACAO[a.tipo]||!Number.isFinite(Date.parse(a.inicio))||a.fim&&(!Number.isFinite(Date.parse(a.fim))||Date.parse(a.fim)<Date.parse(a.inicio)))throw new Error('Tipo ou período inválido.');}
 };
 const cancelar=(a,n)=>{if(a?.cancelado_em)throw new Error('Este registro já está cancelado.');if(n.cancelado_em){if(!n.motivo_cancelamento?.trim())throw new Error('Informe o motivo do cancelamento.');n.cancelado_em=agora();n.cancelado_por=m.id;}};
 const salvar=(t,a,n)=>{if(a)d[t].splice(d[t].indexOf(a),1,n);else d[t].push(n);auditar(d,t,a?structuredClone(a):null,n,m);};
 try{
  if(c==='rpc/meu_cronometro'){const a=d.atualizacoes.find((a)=>a.membro_id===m.id&&!a.fim&&!a.cancelado_em);return Response.json({agora:agora(),atualizacao:a?{...a,cliente_nome:d.clientes.find((c)=>c.id===a.cliente_id)?.nome}:null});}
  if(c==='rpc/iniciar_cronometro'){
   const p=b.p;if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Dados inválidos.');if(d.atualizacoes.some((a)=>a.membro_id===m.id&&!a.fim&&!a.cancelado_em))throw new Error('Você já tem um cronômetro rodando. Pare o atual antes de começar outro.');
   const comp=p.compromisso_id?d.compromissos.find((a)=>a.id===p.compromisso_id):null;
   if(p.compromisso_id&&(!comp||comp.situacao!=='agendado'||comp.cancelado_em||comp.tipo!=='atendimento'||!editaAgenda(m,comp)))throw new Error('Este atendimento não está disponível para iniciar.');
   const n={id:randomUUID(),cliente_id:p.cliente_id,processo_id:p.processo_id||null,membro_id:m.id,participantes:p.participantes||[],tipo:p.tipo||'atendimento_presencial',inicio:agora(),fim:null,cronometrado:true,relato:p.relato?.trim()||null,proxima_providencia:null,compromisso_id:p.compromisso_id||null,cancelado_em:null,cancelado_por:null,motivo_cancelamento:null,criado_em:agora(),criado_por:m.id,alterado_em:null};validar(n);validarParticipantes(d,n);salvar('atualizacoes',null,n);
   if(comp&&!comp.chegada_em){const a=structuredClone(comp);comp.chegada_em=agora();auditar(d,'compromissos',a,comp,m);}return Response.json(n.id);
  }
  if(c==='rpc/parar_cronometro'){
   const a=d.atualizacoes.find((a)=>a.id===b.p_id);if(!a||a.fim||a.cancelado_em)throw new Error('Este cronômetro não está rodando.');if(a.membro_id!==m.id&&m.papel!=='admin')return erro('Só quem iniciou ou o administrador pode parar.',403,'42501');
   if(b.p_fim&&(Date.parse(b.p_fim)<Date.parse(a.inicio)||Date.parse(b.p_fim)>Date.now()))throw new Error('A hora de fim precisa ser depois do início e antes de agora.');
   const n={...a,fim:b.p_fim||agora(),cronometrado:!b.p_fim,relato:b.p_relato?.trim()||a.relato,proxima_providencia:b.p_proxima?.trim()||a.proxima_providencia,alterado_em:agora()};validar(n);salvar('atualizacoes',a,n);
   const comp=d.compromissos.find((v)=>v.id===a.compromisso_id);if(comp&&!comp.cancelado_em&&comp.situacao==='agendado'){const antes=structuredClone(comp);comp.situacao='realizado';auditar(d,'compromissos',antes,comp,m);}return new Response(null,{status:204});
  }
  const tabela=d[c];if(req.method==='GET')return Response.json(selecionar(filtrar(tabela,params),params));
  const permitidos=c==='documentos'?(req.method==='POST'?['modelo','titulo','cliente_id','processo_id','contrato_id','compromisso_id','atualizacao_id','dados','conteudo']:['cancelado_em','motivo_cancelamento']):['cliente_id','processo_id','participantes','tipo','inicio','fim','relato','proxima_providencia',...(req.method==='POST'?['membro_id','compromisso_id']:['cancelado_em','motivo_cancelamento'])];
  if(!['POST','PATCH'].includes(req.method)||Object.keys(b).some((k)=>!permitidos.includes(k)))return erro('Texto salvo, autoria e carimbos não podem ser alterados.',403,'42501');
  const anteriores=req.method==='POST'?[null]:filtrar(tabela,params);
  const salvos=[];for(const a of anteriores){if(c==='atualizacoes'&&a&&a.membro_id!==m.id&&m.papel!=='admin')return erro('Só o autor ou o administrador edita.',403,'42501');
   const n={cancelado_em:null,cancelado_por:null,motivo_cancelamento:null,...a,...b,id:a?.id||randomUUID(),criado_em:a?.criado_em||agora(),criado_por:a?.criado_por||m.id,alterado_em:a?agora():null};cancelar(a,n);validar(n);
   if(c==='documentos'){if(req.method==='POST'&&(!n.conteudo?.trim()||n.conteudo.length>400000||!n.modelo||!n.titulo))throw new Error('Documento inválido.');}
   else{if(!a){n.membro_id=n.membro_id||m.id;if(n.membro_id!==m.id&&m.papel!=='admin')return erro('Somente admin atribui outra autoria.',403,'42501');n.cronometrado=false;if(!n.fim)throw new Error('Informe a hora de fim ou use o cronômetro.');validarParticipantes(d,n);}else{if(!n.fim&&!n.cancelado_em&&(a.fim||n.inicio!==a.inicio))throw new Error('Use Iniciar cronômetro para começar outra atividade.');if(n.inicio!==a.inicio||n.fim!==a.fim)n.cronometrado=false;if(JSON.stringify(a.participantes)!==JSON.stringify(n.participantes))validarParticipantes(d,n);}}
   salvar(c,a,n);salvos.push(n);
  }return Response.json(selecionar(salvos,params),{status:req.method==='POST'?201:200});
 }catch(e){return erro(e.message);}
}
function validarParticipantes(d,a){const ps=a.participantes||[];if(!d.membros.some((m)=>m.id===a.membro_id&&m.ativo)||new Set(ps).size!==ps.length||ps.includes(a.membro_id)||ps.some((id)=>!d.membros.some((m)=>m.id===id&&m.ativo)))throw new Error('Quem atendeu e os participantes precisam ser membros ativos distintos.');}
