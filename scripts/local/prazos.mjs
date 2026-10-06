// Simulação exclusiva da prévia. Os testes SQL verificam as políticas reais.
import { randomUUID } from 'node:crypto';
import { hoje, instante, somarDias } from '../../sistema/js/nucleo/formato.js';
import { alertaTarefa } from '../../sistema/js/dominio/tarefas.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const agora=()=>new Date().toISOString();
const prazos=m=>m.papel==='admin'||m.acesso_prazos==='editar';
const agenda=m=>m.papel==='admin'||m.acesso_agenda!=='nenhum';
const edita=(m,t)=>m.papel==='admin'||t.criado_por===m.id||t.responsavel_id===m.id;
const erro=(message,status=400,code='P0001')=>Response.json({message,code},{status});
export function complementarPrazos(d) {
 d.feriados=[];d.intimacoes=[];d.intimacoes_consultas=[];
 d.tarefas=[
  {id:id(901),titulo:'Conferir documentos fictícios',tipo:'tarefa',responsavel_id:id(4),entrega:hoje(),cliente_id:id(202),processo_id:id(501)},
  {id:id(902),titulo:'Manifestação fictícia — prazo em horas',tipo:'prazo',responsavel_id:id(1),contagem:'horas',quantidade:48,base_em:instante(hoje(),'09:00'),fatal_em:new Date(Date.now()+48*3600000).toISOString(),entrega:hoje(),cliente_id:id(202),processo_id:id(501)},
 ].map(t=>({ato:null,descricao:'Demonstração: datas informadas manualmente.',cliente_id:null,processo_id:null,prioridade:'normal',situacao:'pendente',entrega:null,fatal_em:null,contagem:null,base_em:null,quantidade:null,recesso:true,memoria_prazo:null,concluida_em:null,concluida_por:null,motivo_reabertura:null,compromisso_id:null,intimacao_id:null,cancelado_em:null,motivo_cancelamento:null,criado_em:agora(),criado_por:id(1),alterado_em:null,...t}));
 d.intimacoes=[{id:id(951),fonte:'manual',disponibilizada_em:somarDias(hoje(),-2),publicada_em:hoje(),tribunal:'TJPR',orgao:'Vara fictícia',tipo_comunicacao:'Intimação fictícia',numero_processo:d.processos[0].numero,texto:'Comunicação fictícia para testar a conferência humana. Informe manualmente as datas antes de salvar um prazo.',destinatarios:[],advogados:[],membro_id:id(2),cliente_id:id(202),processo_id:id(501),situacao:'pendente',conferida_em:null,conferida_por:null,compromisso_id:null,observacoes:null,criado_em:agora(),criado_por:id(1)}];
 return d;
}
export async function tratarPrazos({dados:d,req,caminho:c,corpo:b,membro:m,auditar,filtrar,selecionar,params}) {
 const tabelas=['tarefas','v_tarefas','feriados','intimacoes','intimacoes_consultas'];
 const rpcs=['rpc/criar_tarefa','rpc/reabrir_tarefa','rpc/criar_prazo_intimacao','rpc/lancar_audiencia_intimacao'];
 if(!tabelas.includes(c)&&!rpcs.includes(c)&&!(c==='compromissos'&&req.method!=='GET'))return null;
 if((['intimacoes','intimacoes_consultas'].includes(c)||c==='feriados'&&req.method!=='GET')&&!prazos(m))return req.method==='GET'?Response.json([]):erro('Sem acesso a Prazos.',403,'42501');
 const salvar=(t,a,n)=>{if(a)d[t].splice(d[t].indexOf(a),1,n);else d[t].push(n);auditar(d,t,a?structuredClone(a):null,n,m);};
 const carimbar=(p,a=null)=>({...a,...p,id:a?.id??randomUUID(),criado_em:a?.criado_em??agora(),criado_por:a?.criado_por??m.id,alterado_em:a?agora():null,alterado_por:a?m.id:null});
 const validarVinculo=n=>{if(n.cliente_id&&!d.clientes.some(c=>c.id===n.cliente_id))throw new Error('Cliente não encontrado.');if(n.processo_id&&!d.processos.some(p=>p.id===n.processo_id&&p.cliente_id===n.cliente_id&&(!n.numero_processo||p.numero===n.numero_processo)))throw new Error('Confira o cliente e o processo vinculado.');};
 const validarTarefa=(n,a)=>{
  validarVinculo(n);
  if((!a||n.responsavel_id!==a.responsavel_id)&&!d.membros.some(m=>m.id===n.responsavel_id&&m.ativo))throw new Error('O responsável precisa ser um membro ativo.');
  if(!n.titulo?.trim()||!['tarefa','prazo'].includes(n.tipo)||!['baixa','normal','alta','urgente'].includes(n.prioridade)||!['pendente','em_andamento','concluida'].includes(n.situacao))throw new Error('Confira a tarefa.');
  const campos=['tipo','fatal_em','contagem','base_em','quantidade','recesso','memoria_prazo'];
  if((!a&&n.tipo==='prazo'||a&&campos.some(k=>JSON.stringify(a[k])!==JSON.stringify(n[k])))&&!prazos(m))throw new Error('Seu acesso não permite criar ou mudar prazo processual.');
  if(n.tipo==='prazo'&&(!n.fatal_em||!n.base_em||!['uteis','corridos','horas'].includes(n.contagem)||!Number.isInteger(n.quantidade)||n.quantidade<1||n.quantidade>3650||Date.parse(n.fatal_em)<Date.parse(n.base_em)))throw new Error('Confira as datas e a contagem informada.');
  if(n.tipo==='tarefa'&&['fatal_em','base_em','quantidade','contagem','memoria_prazo'].some(k=>n[k]!=null))throw new Error('Tarefa comum não recebe data fatal.');
  if(a?.cancelado_em)throw new Error('Tarefa cancelada não pode ser alterada.');
  if(a?.situacao==='concluida'&&n.situacao!=='concluida'&&!n.motivo_reabertura)throw new Error('Informe motivo para reabrir.');
  if(n.cancelado_em){if(!n.motivo_cancelamento?.trim())throw new Error('Informe o motivo do cancelamento.');n.cancelado_em=agora();n.cancelado_por=m.id;}
  if(n.situacao==='concluida'){n.concluida_em=a?.concluida_em||agora();n.concluida_por=a?.concluida_por||m.id;}else{n.concluida_em=null;n.concluida_por=null;}
 };
 const validarComp=n=>{if(!agenda(m))throw new Error('Sem acesso à Agenda.');if(!d.membros.some(m=>m.id===n.membro_id&&m.ativo)||Date.parse(n.fim)<=Date.parse(n.inicio))throw new Error('Responsável ou período inválido.');};
 const conferir=(i,p)=>{const n=carimbar({...p,situacao:'conferida',conferida_em:i.conferida_em||agora(),conferida_por:i.conferida_por||m.id},i);salvar('intimacoes',i,n);};
 const montarTarefa=(p)=>{
  const n=carimbar({tipo:'tarefa',responsavel_id:m.id,prioridade:'normal',situacao:'pendente',cliente_id:null,processo_id:null,fatal_em:null,base_em:null,contagem:null,quantidade:null,memoria_prazo:null,recesso:true,entrega:null,cancelado_em:null,compromisso_id:null,intimacao_id:null,...p});
  delete n.bloquear;validarTarefa(n,null);
  let comp=null;if(p.bloquear){comp=carimbar({membro_id:n.responsavel_id,tipo:'bloqueio',modalidade:'diligencia',titulo:'Tarefa: '+n.titulo,...p.bloquear,cliente_id:n.cliente_id,situacao:'agendado',particular:false,dia_inteiro:false,cancelado_em:null});validarComp(comp);n.compromisso_id=comp.id;}
  return {n,comp};
 };
 try{
  if(c==='rpc/criar_tarefa'||c==='rpc/criar_prazo_intimacao'){
   const {n,comp}=montarTarefa(b.p);
   let i;if(c==='rpc/criar_prazo_intimacao'){if(!prazos(m))throw new Error('Sem acesso a Intimações.');i=d.intimacoes.find(i=>i.id===b.p_id);if(!i||i.situacao==='arquivada'||n.tipo!=='prazo'||i.cliente_id!==n.cliente_id||i.processo_id!==n.processo_id)throw new Error('Confira a origem do prazo.');n.intimacao_id=i.id;}
   if(comp)salvar('compromissos',null,comp);salvar('tarefas',null,n);if(i)conferir(i,{});return Response.json(n.id);
  }
  if(c==='rpc/reabrir_tarefa'){const a=d.tarefas.find(t=>t.id===b.p_id);if(!a||!edita(m,a)||a.situacao!=='concluida'||a.cancelado_em||!b.p_motivo?.trim())throw new Error('Confira a tarefa e o motivo.');const n=carimbar({situacao:'pendente',motivo_reabertura:b.p_motivo},a);validarTarefa(n,a);salvar('tarefas',a,n);return new Response(null,{status:204});}
  if(c==='rpc/lancar_audiencia_intimacao'){
   if(!prazos(m)||!agenda(m))throw new Error('Sem acesso a Intimações e Agenda.');const i=d.intimacoes.find(i=>i.id===b.p_id);
   if(!i||i.situacao==='arquivada'||i.compromisso_id||b.p.tipo!=='audiencia'||b.p.particular||b.p.dia_inteiro||i.cliente_id!==b.p.cliente_id)throw new Error('Confira a audiência e a intimação.');
   const n=carimbar({...b.p,particular:false,dia_inteiro:false,situacao:'agendado',cancelado_em:null});validarComp(n);if(m.papel!=='admin'&&m.acesso_agenda!=='todas'&&n.membro_id!==m.id)throw new Error('Você só pode marcar na sua própria agenda.');salvar('compromissos',null,n);conferir(i,{compromisso_id:n.id});return Response.json(n.id);
  }
  let tabela=c==='v_tarefas'?d.tarefas.map(t=>({...t,cliente_nome:d.clientes.find(c=>c.id===t.cliente_id)?.nome,processo_numero:d.processos.find(p=>p.id===t.processo_id)?.numero,processo_titulo:d.processos.find(p=>p.id===t.processo_id)?.titulo,alerta:alertaTarefa(t)})):d[c];
  if(req.method==='GET')return Response.json(selecionar(filtrar(tabela,params),params));
  if(['v_tarefas','intimacoes_consultas'].includes(c)||!['POST','PATCH'].includes(req.method))return erro('Operação não permitida.',403,'42501');
  const a=req.method==='PATCH'?filtrar(tabela,params)[0]:null;if(req.method==='PATCH'&&!a)return Response.json([]);
  const p={...b};const carimbos=['id','criado_em','criado_por','alterado_em','alterado_por','concluida_em','concluida_por','conferida_em','conferida_por','compromisso_id','intimacao_id'];
  if(Object.keys(p).some(k=>carimbos.includes(k)))return erro('Autoria e vínculos gerados só pelo servidor.',403,'42501');
  const n=carimbar(p,a);
  if(c==='tarefas'){if(a&&!edita(m,a))return erro('Você não pode alterar esta tarefa.',403,'42501');validarTarefa(n,a);}
  if(c==='feriados'){if(!n.nome?.trim()||!n.data||n.tribunal&&!/^[A-Z0-9]{2,10}$/.test(n.tribunal))throw new Error('Confira o feriado.');if(tabela.some(f=>f.id!==n.id&&f.data===n.data&&f.tribunal===n.tribunal))throw new Error('Já existe data cadastrada para este tribunal.');}
  if(c==='intimacoes'){
   validarVinculo(n);if(!a){if(n.fonte!=='manual'||!n.texto?.trim()||!n.disponibilizada_em)throw new Error('Confira a comunicação manual.');Object.assign(n,{situacao:'pendente',conferida_em:null,conferida_por:null,compromisso_id:null});}
   else {if(Object.keys(p).some(k=>!['cliente_id','processo_id','situacao','observacoes'].includes(k)))return erro('O teor salvo não pode ser alterado.',403,'42501');
    if(n.situacao==='conferida'&&a.situacao!=='conferida'){n.conferida_em=agora();n.conferida_por=m.id;}if(n.situacao==='pendente'){n.conferida_em=null;n.conferida_por=null;}}
  }
  if(c==='compromissos'){validarComp(n);if(m.papel!=='admin'&&m.acesso_agenda!=='todas'&&n.membro_id!==m.id)return erro('Você só edita sua agenda.',403,'42501');}
  salvar(c,a,n);return Response.json(selecionar([n],params),{status:a?200:201});
 }catch(e){return erro(e.message);}
}
