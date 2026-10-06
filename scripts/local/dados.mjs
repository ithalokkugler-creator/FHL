// Banco fictício da prévia. Nunca importa config.js nem usa rede externa.
import { randomUUID } from 'node:crypto';
import { CAMPOS_DETALHES, prepararCliente, prepararProcesso } from '../../sistema/js/dominio/clientes.js';
import { AREAS_JURIDICAS } from '../../sistema/js/telas/comum.js';
import { hoje, somarDias } from '../../sistema/js/nucleo/formato.js';
import { complementarDados,tratarAtividades } from './atividades.mjs';
import { complementarPrazos,tratarPrazos } from './prazos.mjs';
import { complementarAvisos, avisosFicticios } from './avisos.mjs';
import { complementarAgenda } from './agenda.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const agora = () => new Date().toISOString();
export function criarDados() {
  const perfis = [
    ['admin', 'Admin Fictício', 'admin', 'todas', 'completo', 'editar', 'editar', 'editar'],
    ['socia', 'Sócia Fictícia', 'socio', 'propria', 'completo', 'editar', 'editar', 'editar'],
    ['secretaria', 'Secretária Fictícia', 'secretaria', 'todas', 'lancamentos', 'nenhum', 'editar', 'nenhum'],
    ['sem-clientes', 'Associado Fictício', 'associado', 'propria', 'nenhum', 'nenhum', 'nenhum', 'nenhum'],
    ['clientes-sem-financeiro', 'Equipe de Clientes Fictícia', 'associado', 'nenhum', 'nenhum', 'nenhum', 'editar', 'nenhum'],
  ];
  const membros = perfis.map(([perfil, nome, papel, agenda, financeiro, site, clientes, prazos], i) => ({
    id: id(i + 1), user_id: id(i + 101), perfil, nome, nome_curto: nome, email: `${perfil}@example.test`,
    papel, acesso_agenda: agenda, acesso_financeiro: financeiro, acesso_site: site,
    acesso_clientes: clientes, acesso_prazos: prazos, ativo: true, cor: '#465953', oab: null,
  }));
  const clientes = [
    { id:id(201),nome:'Cliente Fictício Existente',documento:null,telefone:'41900000001',email:'cliente@example.test',ativo:true },
    { id:id(202),nome:'José Fictício da Silva',documento:'12345678909',telefone:'41900000002',email:'jose@example.test',ativo:true },
    { id:id(203),nome:'Empresa Fictícia Ltda.',documento:'11222333000181',telefone:'41900000003',email:'empresa@example.test',ativo:true },
    { id:id(204),nome:'Cadastro Inativo Fictício',documento:null,telefone:null,email:null,ativo:false },
  ].map((c)=>({...c,observacoes:null,criado_em:agora(),alterado_em:null}));
  const clientes_detalhes = [
    { id:id(402),cliente_id:id(202),tipo_pessoa:'fisica',nascimento:'1990'+somarDias(hoje(),2).slice(4),rg:'RG FICTÍCIO',nacionalidade:'Brasileira',estado_civil:'solteiro',profissao:'Profissão fictícia',filiacao:'Filiação de demonstração',cep:'83203000',logradouro:'Rua Fictícia',numero:'100',bairro:'Centro',cidade:'Paranaguá',uf:'PR',recado_nome:'Parente Fictício',recado_relacao:'Mãe',recado_telefone:'41900000004',recado_observacao:'Pode receber recados.',representante_nome:'Representante Fictícia',representante_documento:'98765432100',representante_relacao:'Responsável legal',representante_qualificacao:'Qualificação fictícia',banco:'Banco de Demonstração',agencia:'0000',conta:'00000-0',pix:'jose@example.test',responsavel_id:membros[1].id },
    { id:id(403),cliente_id:id(203),tipo_pessoa:'juridica',responsavel_id:membros[0].id },
  ].map((d)=>({...Object.fromEntries(CAMPOS_DETALHES.map((c)=>[c,null])),...d,criado_em:agora(),alterado_em:null}));
  const processos = [
    { id:id(501),cliente_id:id(202),numero:'00012342220258160001',titulo:'Ação Fictícia de Demonstração',area:'civel',tribunal:'TJPR',orgao:'Vara fictícia',responsavel_id:membros[1].id,situacao:'em_andamento' },
    { id:id(502),cliente_id:id(201),numero:'00012342220258160001',titulo:'Mesmo processo — outro cliente fictício',area:'civel',tribunal:'TJPR',responsavel_id:membros[0].id,situacao:'em_analise' },
    { id:id(503),cliente_id:id(203),referencia:'CONSULTA-FICTICIA',titulo:'Consultoria Fictícia Encerrada',area:'empresarial',responsavel_id:membros[0].id,situacao:'encerrado' },
  ].map((p)=>({numero:null,referencia:null,tribunal:null,orgao:null,observacoes:null,...p,criado_em:agora(),alterado_em:null}));
  const compromissos = [
    { id:id(601),titulo:'Atendimento Fictício Futuro',membro_id:membros[1].id,dias:2,particular:false,situacao:'agendado' },
    { id:id(602),titulo:'Atendimento Fictício Realizado',membro_id:membros[1].id,dias:-2,particular:false,situacao:'realizado' },
    { id:id(603),titulo:'COMPROMISSO PARTICULAR OCULTO',membro_id:membros[1].id,dias:3,particular:true,situacao:'agendado' },
  ].map(({dias,...c})=>({...c,cliente_id:id(202),inicio:somarDias(hoje(),dias)+'T14:00:00-03:00',fim:somarDias(hoje(),dias)+'T15:00:00-03:00',cancelado_em:null}));
  const v_contratos = [{id:id(701),cliente_id:id(202),cliente_nome:clientes[1].nome,descricao:'Contrato Fictício de Demonstração',saldo:1500,saldo_vencido:500,vencidas:1,situacao:'ativo',criado_em:agora()}];
  const base = { telefone: '41900000000', empresa: null, pagina: null, campanha: null, consentimento_em: null,
    recebido_em: agora(), responsavel_id: null, cliente_id: null, convertido_em: null, observacoes: null, email: 'pessoa@example.test' };
  const contatos = [
    { ...base, id: id(301), nome: 'João Fictício — Site', canal: 'site', pagina: '/contato.html', consentimento_em: agora(), mensagem: 'Mensagem de demonstração. Gostaria de conversar com o escritório.', situacao: 'novo' },
    { ...base, id: id(302), nome: 'Maria Fictícia — Campanha', canal: 'site', pagina: '/campanhas/demonstracao.html', campanha: 'demonstracao', consentimento_em: agora(), mensagem: 'Vim pela campanha de demonstração.', situacao: 'em_atendimento', responsavel_id: membros[1].id },
    { ...base, id: id(303), nome: 'Pedro Fictício — Telefone', canal: 'telefone', mensagem: 'Telefonou pedindo retorno.', situacao: 'contatado', responsavel_id: membros[2].id },
    { ...base, id: id(304), nome: 'Contato Fictício Convertido', canal: 'indicacao', mensagem: 'Exemplo já vinculado ao cliente existente.', situacao: 'convertido', cliente_id: clientes[0].id, convertido_em: agora() },
  ];
  return complementarAgenda(complementarAvisos(complementarPrazos(complementarDados({ membros, clientes, clientes_detalhes, processos, compromissos, v_contratos, contatos, auditoria: [], envios: [], escritas: [] }))));
}

export const membroDoToken = (dados, token) => dados.membros.find((m) => token === `teste-${m.perfil}` && m.ativo);
export const sessaoDoMembro = (m) => !m ? null : ({ ...m,
  ...(m.papel === 'admin' ? { acesso_agenda: 'todas', acesso_financeiro: 'completo', acesso_site: 'editar', acesso_clientes: 'editar', acesso_prazos: 'editar' } : {}),
});
const editaClientes = (m) => m?.ativo && (m.papel === 'admin' || m.acesso_clientes === 'editar');
const veAgenda = (m) => m.papel==='admin'||m.acesso_agenda!=='nenhum';
const veFinanceiro = (m) => m.papel==='admin'||m.acesso_financeiro!=='nenhum';
const erro = (message, status = 403, code = '42501') => Response.json({ message, code }, { status });
// Postgres compara timestamptz pelo instante, mesmo quando o offset muda o dia.
const comparavel = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : v;
function filtrar(linhas, params) {
  return linhas.filter((l) => [...params].every(([campo, filtro]) => {
    if (['select', 'order', 'limit', 'offset'].includes(campo)) return true;
    const ponto = filtro.indexOf('.'), op = filtro.slice(0, ponto), v = filtro.slice(ponto + 1), real = l[campo];
    const a = comparavel(real), b = comparavel(v);
    if (op === 'eq') return String(a) === String(b);
    if (op === 'is') return v === 'null' ? real == null : String(real) === v;
    if (op === 'in') return v.slice(1, -1).split(',').map((x) => x.replaceAll('"', '')).includes(String(real));
    if (op === 'gte') return a >= b;
    if (op === 'lte') return a <= b;
    if (op === 'lt') return a < b;
    if (op === 'gt') return a > b;
    return false;
  }));
}
function selecionar(linhas, params) {
  let r = [...linhas];
  const ordem = (params.get('order') || '').split(',').filter(Boolean);
  r.sort((a, b) => {
    for (const o of ordem) {
      const [c, dir] = o.split('.'), x = comparavel(a[c]), y = comparavel(b[c]);
      const n = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR');
      if (n) return dir === 'desc' ? -n : n;
    }
    return 0;
  });
  const offset = Number(params.get('offset') || 0), limite = Number(params.get('limit') || 1000);
  r = r.slice(offset, offset + limite);
  const colunas = params.get('select');
  return !colunas || colunas === '*' ? r : r.map((l) => Object.fromEntries(colunas.split(',').map((c) => [c, l[c] ?? null])));
}
function auditar(dados, tabela, antes, depois, membro) {
  dados.auditoria.push({ id: randomUUID(), tabela, registro_id: depois.id, acao: antes ? 'alterou' : 'criou',
    antes, depois: structuredClone(depois), campos: antes ? Object.keys(depois).filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c])) : [],
    em: agora(), membro_id: membro?.id ?? null, usuario_id: membro?.user_id ?? null });
  dados.escritas.push({ tabela, acao: antes ? 'UPDATE' : 'INSERT', id: depois.id, em: agora() });
}

export async function apiFicticia(dados, req) {
  const url = new URL(req.url), caminho = url.pathname.replace('/__teste/rest/v1/', '');
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  const membro = membroDoToken(dados, token);
  const corpo = req.method === 'GET' ? null : await req.json();
  if (caminho === 'rpc/registrar_contato') {
    if (req.headers.get('apikey') !== 'sb_secret_PREVIA_FICTICIA') return erro('Servidor fictício apenas.');
    const { p, p_ip_hash } = corpo;
    const momento = Date.now();
    dados.envios = dados.envios.filter((e) => e.em >= momento - 86400000);
    if (dados.envios.filter((e) => e.hash === p_ip_hash && e.em > momento - 600000).length >= 3)
      return erro('Muitas mensagens em pouco tempo. Tente de novo daqui a alguns minutos.', 400, 'P0001');
    if (dados.contatos.filter((c) => c.canal === 'site' && Date.parse(c.recebido_em) > momento - 3600000).length >= 30)
      return erro('Recebemos muitas mensagens agora. Tente de novo mais tarde ou use o WhatsApp.', 400, 'P0001');
    const c = { ...p, id: randomUUID(), canal: 'site', recebido_em: agora(), consentimento_em: agora(), situacao: 'novo', responsavel_id: null, cliente_id: null, convertido_em: null, observacoes: null };
    delete c.consent;
    dados.contatos.push(c); dados.envios.push({ hash: p_ip_hash, em: momento }); auditar(dados, 'contatos', null, c, null);
    return Response.json(c.id);
  }
  if (!membro) return erro('Perfil fictício não disponível.', 401);
  if (caminho === 'rpc/iniciar_sessao') return Response.json(sessaoDoMembro(membro));
  if (caminho === 'rpc/avisos_do_dia') return Response.json(avisosFicticios(dados, membro));
  if (caminho === 'rpc/salvar_cliente') {
    const p=corpo.p;
    if(p?.detalhes!==undefined&&!editaClientes(membro))return erro('Sem acesso ao cadastro completo.');
    if(!p||Array.isArray(p)||typeof p!=='object')return erro('Cadastro inválido.',400,'22023');
    if(p.detalhes!==undefined&&(!p.detalhes||Array.isArray(p.detalhes)||typeof p.detalhes!=='object'))return erro('Dados completos inválidos.',400,'22023');
    const anterior=p.id?dados.clientes.find((c)=>c.id===p.id):null;
    if(p.id&&!anterior)return erro('Cliente não encontrado.',400,'P0001');
    let normal;
    try { normal=prepararCliente({...p,...(p.detalhes??{}),tipo_pessoa:p.detalhes?.tipo_pessoa??(p.documento?.length===14?'juridica':'fisica')},p.id); }
    catch(e){return erro(e.message,400,'23514');}
    if(normal.documento&&dados.clientes.some((c)=>c.id!==p.id&&c.documento===normal.documento))return erro('Este CPF / CNPJ já está cadastrado.',409,'23505');
    const {detalhes,...basico}=normal;
    const novo={...anterior,...basico,id:anterior?.id??randomUUID(),ativo:anterior?.ativo??true,criado_em:anterior?.criado_em??agora(),alterado_em:anterior?agora():null};
    // Todas as validações ocorrem antes de alterar qualquer uma das partes.
    const detalheAnterior=dados.clientes_detalhes.find((d)=>d.cliente_id===novo.id);
    const novoDetalhe=p.detalhes?{...detalhes,id:detalheAnterior?.id??randomUUID(),cliente_id:novo.id,criado_em:detalheAnterior?.criado_em??agora(),alterado_em:detalheAnterior?agora():null}:null;
    if(anterior)dados.clientes.splice(dados.clientes.indexOf(anterior),1,novo);else dados.clientes.push(novo);
    auditar(dados,'clientes',anterior?structuredClone(anterior):null,novo,membro);
    if(novoDetalhe){if(detalheAnterior)dados.clientes_detalhes.splice(dados.clientes_detalhes.indexOf(detalheAnterior),1,novoDetalhe);else dados.clientes_detalhes.push(novoDetalhe);auditar(dados,'clientes_detalhes',detalheAnterior?structuredClone(detalheAnterior):null,novoDetalhe,membro);}
    return Response.json(novo.id);
  }
  const atividade=await tratarAtividades({dados,req,caminho,corpo,membro,auditar,filtrar,selecionar,params:url.searchParams});if(atividade)return atividade;
  const prazo=await tratarPrazos({dados,req,caminho,corpo,membro,auditar,filtrar,selecionar,params:url.searchParams});if(prazo)return prazo;
  if (caminho === 'rpc/gerar_contas_do_mes') return Response.json(0);
  if (caminho.startsWith('rpc/')) return erro('Essa operação não faz parte desta prévia.', 422);
  const pode = ['contatos','clientes_detalhes'].includes(caminho)?editaClientes(membro):caminho==='processos'?req.method==='GET'||editaClientes(membro):caminho==='compromissos'?veAgenda(membro):caminho.startsWith('v_')?veFinanceiro(membro):true;
  if (!pode) return req.method === 'GET' ? Response.json([]) : erro('Sem acesso a Clientes.');
  const tabela = dados[caminho] ?? [];
  if (req.method === 'GET') {
    const visiveis=caminho==='compromissos'?tabela.filter((c)=>!c.particular||c.membro_id===membro.id):
      caminho==='auditoria'?tabela.filter((a)=>(!['clientes_detalhes','contatos','documentos','atualizacoes'].includes(a.tabela)||editaClientes(membro))&&(!['intimacoes','intimacoes_consultas'].includes(a.tabela)||membro.papel==='admin'||membro.acesso_prazos==='editar')):tabela;
    return Response.json(selecionar(filtrar(visiveis,url.searchParams),url.searchParams));
  }
  if (!['contatos', 'clientes', 'membros','processos'].includes(caminho)) return erro('Alterações desse módulo estão fora da prévia.', 422);
  if (caminho === 'membros' && membro.papel !== 'admin') return erro('Somente o administrador altera membros.');
  if(caminho==='processos'&&['POST','PATCH'].includes(req.method)){
    if(Object.keys(corpo).some((c)=>!['cliente_id','numero','referencia','titulo','area','tribunal','orgao','responsavel_id','situacao','observacoes'].includes(c))||req.method==='PATCH'&&Object.hasOwn(corpo,'cliente_id'))return erro('O vínculo e os carimbos não podem ser alterados.');
    const anteriores=req.method==='PATCH'?filtrar(tabela,url.searchParams):[null];
    if(req.method==='PATCH'&&!anteriores.length)return Response.json([]);
    let normalizados;
    try{normalizados=anteriores.map((a)=>prepararProcesso({...a,...corpo},AREAS_JURIDICAS));}catch(e){return erro(e.message,400,'23514');}
    if(normalizados.some((p)=>!dados.clientes.some((c)=>c.id===p.cliente_id)))return erro('Cliente não encontrado.',400,'23503');
    if(normalizados.some((p,i)=>p.numero&&tabela.some((a)=>a.id!==anteriores[i]?.id&&a.cliente_id===p.cliente_id&&a.numero===p.numero)))return erro('Este cliente já está vinculado a esse número CNJ.',409,'23505');
    const salvos=normalizados.map((p,i)=>{const a=anteriores[i],n={...a,...p,id:a?.id??randomUUID(),criado_em:a?.criado_em??agora(),alterado_em:a?agora():null};if(a)tabela.splice(tabela.indexOf(a),1,n);else tabela.push(n);auditar(dados,'processos',a?structuredClone(a):null,n,membro);return n;});
    return Response.json(selecionar(salvos,url.searchParams),{status:req.method==='POST'?201:200});
  }
  if (req.method === 'POST') {
    if (caminho === 'contatos' && (!editaClientes(membro) || corpo.canal === 'site')) return erro('Use um canal manual.');
    if (caminho === 'contatos' && (!corpo.nome?.trim() || !corpo.email && !corpo.telefone)) return erro('Informe nome e um meio de contato.', 400, '23514');
    const novo = { id: randomUUID(), ativo: true, situacao: 'novo', recebido_em: agora(), consentimento_em: null,
      cliente_id: null, convertido_em: null, acesso_clientes: 'nenhum', acesso_prazos: 'nenhum', ...corpo };
    tabela.push(novo); auditar(dados, caminho, null, novo, membro);
    return Response.json(selecionar([novo], url.searchParams), { status: 201 });
  }
  if (req.method === 'PATCH') {
    const linhas = filtrar(tabela, url.searchParams);
    if (caminho === 'contatos' && Object.keys(corpo).some((c) => !['situacao', 'responsavel_id', 'cliente_id', 'observacoes'].includes(c))) return erro('A mensagem original é imutável.');
    if (caminho === 'contatos' && corpo.situacao === 'convertido' && !corpo.cliente_id && !linhas[0]?.cliente_id) return erro('Vincule um cliente antes de converter.', 400, '23514');
    for (const l of linhas) {
      const antes = structuredClone(l);
      if (caminho === 'contatos' && corpo.situacao === 'convertido' && l.situacao !== 'convertido') l.convertido_em = agora();
      Object.assign(l, corpo,{alterado_em:agora()}); auditar(dados, caminho, antes, l, membro);
    }
    return Response.json(selecionar(linhas, url.searchParams));
  }
  return erro('Operação indisponível na prévia.', 405);
}
