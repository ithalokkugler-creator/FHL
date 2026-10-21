// Clientes e processos (F2): validação do cadastro completo e as buscas.
// =====================================================================
//
// Funções puras — a tela, a prévia local e os testes usam as mesmas. O banco
// confere de novo o que importa (CPF/CNPJ, CNJ, UF, CEP); aqui a mensagem
// sai antes, em português, sem perder o que foi digitado.

import { documentoValido, hoje, limparDocumento, numeroCnjValido, semAcento, soDigitos } from '../nucleo/formato.js';
import { proximoAniversario } from './aniversarios.js';

export const COLUNAS_CLIENTE = 'id,nome,documento,telefone,email,observacoes,ativo,criado_em,alterado_em';
export const CAMPOS_DETALHES = [
  'tipo_pessoa', 'flexao', 'rg', 'nascimento', 'nacionalidade', 'estado_civil', 'profissao', 'filiacao',
  'filiacao_mae', 'filiacao_pai', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'recado_nome', 'recado_relacao', 'recado_telefone', 'recado_observacao',
  'representante_nome', 'representante_documento', 'representante_relacao', 'representante_qualificacao',
  'banco', 'agencia', 'conta', 'pix', 'responsavel_id', 'nome_fantasia',
];
export const COLUNAS_DETALHES = ['id', 'cliente_id', ...CAMPOS_DETALHES, 'etiquetas', 'criado_em', 'alterado_em'].join(',');

/** "inss, urgente; Indicação" → ['inss', 'urgente', 'indicação'] — o banco normaliza de novo. */
export function lerEtiquetas(v) {
  const lista = (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/))
    .map((e) => String(e).trim().toLocaleLowerCase('pt-BR'))
    .filter(Boolean);
  const unicas = [...new Set(lista)];
  if (unicas.some((e) => e.length > 40)) throw new Error('Cada etiqueta pode ter até 40 caracteres.');
  if (unicas.length > 20) throw new Error('Use no máximo 20 etiquetas por cliente.');
  return unicas.sort();
}
export const COLUNAS_PROCESSO = 'id,cliente_id,numero,referencia,titulo,area,tribunal,orgao,responsavel_id,situacao,observacoes,posicao_cliente,criado_em,alterado_em';

/**
 * Como o nosso cliente figura no processo (pedido do Guilherme, 21/10) — os
 * nomes que o Projudi e o PJe dão às partes. Grava-se o próprio texto; "Outra"
 * aceita qualquer um (inventariante, vítima…), até 60 letras.
 */
export const POSICOES_CLIENTE = [
  ['Polo ativo', ['Autor(a)', 'Requerente', 'Reclamante', 'Exequente', 'Recorrente', 'Apelante', 'Agravante', 'Embargante', 'Impetrante']],
  ['Polo passivo', ['Réu/Ré', 'Requerido(a)', 'Reclamado(a)', 'Executado(a)', 'Recorrido(a)', 'Apelado(a)', 'Agravado(a)', 'Embargado(a)']],
  ['Outros', ['Terceiro(a) interessado(a)']],
];
export const POSICAO_OUTRA = '__outra';
const POSICOES_CONHECIDAS = new Set(POSICOES_CLIENTE.flatMap(([, lista]) => lista));
export const posicaoConhecida = (valor) => POSICOES_CONHECIDAS.has(valor);

export const ESTADOS_CIVIS = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  uniao_estavel: 'União estável',
  separado: 'Separado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
};
export const TIPOS_PESSOA = { fisica: 'Pessoa física', juridica: 'Pessoa jurídica' };
export const SITUACOES_PROCESSO = {
  em_analise: 'Em análise',
  aguardando_documentos: 'Aguardando documentos',
  contrato_enviado: 'Contrato enviado',
  em_andamento: 'Em andamento',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
};

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString().slice(0, 10) === v;

/** Telefone com DDD: só dígitos (10 a 13), aceitando a máscara usual. */
const fone = (v, campo) => {
  const d = soDigitos(v);
  if (texto(v) && (!/^[\d\s()+.-]+$/.test(v) || !/^\d{10,13}$/.test(d))) throw new Error(`${campo} precisa de DDD e 10 a 13 dígitos.`);
  return d || null;
};

/** Formulário completo → payload da transação salvar_cliente. */
export function prepararCliente(d, id = null) {
  const nome = texto(d.nome);
  if (!nome || nome.length > 200) throw new Error('Informe o nome completo, com até 200 caracteres.');

  const doc = limparDocumento(d.documento);
  if (doc && !documentoValido(doc)) throw new Error('CPF ou CNPJ inválido — confira os dígitos.');
  const tipo = d.tipo_pessoa || 'fisica';
  if (!TIPOS_PESSOA[tipo]) throw new Error('Escolha pessoa física ou jurídica.');
  if (doc && doc.length !== (tipo === 'fisica' ? 11 : 14)) throw new Error(tipo === 'fisica' ? 'Pessoa física usa CPF.' : 'Pessoa jurídica usa CNPJ.');

  const detalhes = Object.fromEntries(CAMPOS_DETALHES.map((c) => [c, texto(d[c]) || null]));
  detalhes.tipo_pessoa = tipo;
  detalhes.etiquetas = lerEtiquetas(d.etiquetas);
  if (detalhes.flexao && !['m', 'f'].includes(detalhes.flexao)) throw new Error('Confira a concordância nos documentos.');
  if (detalhes.estado_civil && !ESTADOS_CIVIS[detalhes.estado_civil]) throw new Error('Confira o estado civil.');
  if (detalhes.nascimento && !dataValida(detalhes.nascimento)) throw new Error('Confira a data de nascimento ou constituição.');
  if (detalhes.nascimento && detalhes.nascimento > hoje()) throw new Error('A data de nascimento ou constituição não pode ser posterior a hoje.');
  if (detalhes.nascimento && detalhes.nascimento < '1900-01-01') throw new Error('Confira a data de nascimento ou constituição: anterior a 1900.');
  if ((detalhes.filiacao_mae?.length ?? 0) > 300 || (detalhes.filiacao_pai?.length ?? 0) > 300) throw new Error('Nome da mãe ou do pai: até 300 letras.');
  // Mãe e pai em campos próprios (pedido de 21/10). Preenchido um deles, o
  // texto antigo ("MÃE / PAI") sai do cadastro — fica no histórico.
  if (detalhes.filiacao_mae || detalhes.filiacao_pai) detalhes.filiacao = null;

  detalhes.cep = soDigitos(d.cep) || null;
  if (texto(d.cep) && (!/^[\d\s-]+$/.test(d.cep) || detalhes.cep?.length !== 8)) throw new Error('CEP precisa de 8 dígitos.');
  detalhes.uf = texto(d.uf).toUpperCase() || null;
  if (detalhes.uf && !UFS.has(detalhes.uf)) throw new Error('Informe uma UF válida, como PR.');
  detalhes.recado_telefone = fone(d.recado_telefone, 'Telefone para recados');
  detalhes.representante_documento = limparDocumento(d.representante_documento) || null;
  if (detalhes.representante_documento && !documentoValido(detalhes.representante_documento)) {
    throw new Error('CPF ou CNPJ do representante inválido.');
  }

  const email = texto(d.email).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Confira o e-mail.');

  return {
    ...(id ? { id } : {}),
    nome,
    documento: doc || null,
    telefone: fone(d.telefone, 'Telefone'),
    email: email || null,
    observacoes: texto(d.observacoes) || null,
    detalhes,
  };
}

/** Formulário de processo → linha de `processos`. Sem número é caso consultivo. */
export function prepararProcesso(d, areas) {
  const numero = soDigitos(d.numero);
  if (texto(d.numero) && !numeroCnjValido(d.numero)) throw new Error('Número CNJ inválido — confira os 20 dígitos e o dígito verificador.');
  const titulo = texto(d.titulo);
  if (!titulo) throw new Error('Informe o título do processo ou caso.');
  if (!areas[d.area]) throw new Error('Escolha a área jurídica.');
  if (!SITUACOES_PROCESSO[d.situacao]) throw new Error('Escolha a situação do processo.');
  if (!d.cliente_id) throw new Error('Escolha um cliente.');
  const posicao = d.posicao_cliente === POSICAO_OUTRA ? texto(d.posicao_outra) : texto(d.posicao_cliente);
  // `campo` leva a mensagem ao campo certo (nucleo/formularios.js).
  const erroPosicao = (mensagem) => Object.assign(new Error(mensagem), { campo: 'posicao_outra' });
  if (d.posicao_cliente === POSICAO_OUTRA && !posicao) throw erroPosicao('Escreva como o cliente figura no processo, ou escolha da lista.');
  if (posicao.length > 60) throw erroPosicao('A posição do cliente pode ter até 60 letras.');
  return {
    cliente_id: d.cliente_id,
    numero: numero || null,
    referencia: texto(d.referencia) || null,
    titulo,
    area: d.area,
    tribunal: texto(d.tribunal) || null,
    orgao: texto(d.orgao) || null,
    responsavel_id: d.responsavel_id || null,
    situacao: d.situacao,
    observacoes: texto(d.observacoes) || null,
    posicao_cliente: posicao || null,
  };
}

// Busca sem acento; com três caracteres ou mais, também sem pontuação — CPF,
// CNPJ, telefone e número de processo com ou sem máscara.
const compacto = (s) => semAcento(s).replace(/[^a-z0-9]/gi, '').toLowerCase();
function corresponde(busca, valores) {
  const normal = semAcento(valores.filter(Boolean).join(' ')).toLocaleLowerCase('pt-BR');
  if (normal.includes(busca)) return true;
  const alvo = compacto(busca);
  return busca.length >= 3 && Boolean(alvo) && valores.some((v) => v && compacto(v).includes(alvo));
}

// ---------------------------------------------------------------------------
// Campo Cliente dos formulários (21/10/2026)
// ---------------------------------------------------------------------------
//
// Antes era a lista do navegador (<datalist>): só achava do jeito que o nome
// estava escrito, não achava CPF sem os pontos e, aberta pela seta, mostrava
// todo mundo em vez dos que batiam — o Vinícius digitou "rosane" e não viu a
// Rosane. Aqui: parte do nome, em qualquer ordem, com ou sem acento; CPF/CNPJ
// e número de processo pelos dígitos, com ou sem pontuação.

const normal = (s) => semAcento(s).toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);
const palavras = (s) => normal(s).split(/[^a-z0-9]+/).filter((p) => p && !LIGACOES.has(p));

/** O que aparece no campo depois de escolher: "Nome — 123.456.789-00". */
const SEPARADOR = ' — ';

/**
 * Clientes que batem com o que foi digitado, os mais parecidos primeiro.
 * Sem texto, todos em ordem alfabética. Com `processos`, o número do
 * processo (7 dígitos ou mais) também acha o cliente — e diz qual processo.
 * @returns {{ cliente: object, processo: object|null }[]}
 */
export function buscarClientes(clientes, texto, { processos = [] } = {}) {
  const [parteNome, parteDoc = ''] = String(texto ?? '').split(SEPARADOR);
  const busca = normal(parteNome);
  const termos = busca.split(/[^a-z0-9]+/).filter(Boolean);
  const digitos = soDigitos(parteDoc || (/[a-z]/.test(busca) ? '' : busca));
  const porNome = (a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR', { sensitivity: 'base' });
  if (!busca && !digitos) return clientes.map((cliente) => ({ cliente, processo: null, nota: 3 })).sort(porNome);

  const achados = [];
  for (const cliente of clientes) {
    const nome = normal(cliente.nome);
    const doNome = palavras(cliente.nome);
    const doc = soDigitos(cliente.documento);
    let nota = null;
    let processo = null;
    if (digitos.length >= 3 && doc.includes(digitos)) nota = doc.startsWith(digitos) ? 0 : 1;
    if (nota == null && termos.length && /[a-z]/.test(busca)) {
      if (nome.startsWith(busca)) nota = 0;
      else if (termos.every((t) => doNome.some((p) => p.startsWith(t)) || LIGACOES.has(t))) nota = 1;
      else if (termos.every((t) => nome.includes(t))) nota = 2;
    }
    if (nota == null && digitos.length >= 7) {
      processo = processos.find((p) => p.cliente_id === cliente.id && (p.numero ?? '').includes(digitos)) ?? null;
      if (processo) nota = 2;
    }
    if (nota != null) achados.push({ cliente, processo, nota });
  }
  return achados.sort((a, b) => a.nota - b.nota || porNome(a, b));
}

/**
 * O cliente que o texto do campo identifica sem dúvida: o rótulo escolhido na
 * lista, o nome completo (sem acento/maiúsculas) ou o CPF/CNPJ inteiro.
 * Dois clientes com o mesmo nome não se resolvem pelo nome.
 */
export function acharCliente(clientes, texto, rotulo) {
  const valor = String(texto ?? '').trim();
  if (!valor) return null;
  const pelo = clientes.find((c) => rotulo(c) === valor);
  if (pelo) return pelo;
  const nome = normal(valor);
  const mesmos = clientes.filter((c) => normal(c.nome) === nome);
  if (mesmos.length === 1) return mesmos[0];
  const digitos = soDigitos(valor);
  if (!/[a-z]/i.test(semAcento(valor)) && (digitos.length === 11 || digitos.length === 14)) {
    const doc = clientes.filter((c) => soDigitos(c.documento) === digitos);
    if (doc.length === 1) return doc[0];
  }
  return null;
}

/**
 * Destinatários da intimação que já são clientes: o nome do cliente inteiro
 * (sem "de/da/dos") está no nome do destinatário. "ROSANE GONCALVES DOS
 * SANTOS" acha "Rosane Gonçalves dos Santos" e "Rosane Santos"; nunca um
 * cliente de um nome só. É sugestão: quem escolhe é o advogado — por isso
 * diz se o nome é o mesmo (`exato`) ou só parecido, e os iguais vêm primeiro.
 * @returns {{ cliente: object, destinatario: string, exato: boolean }[]}
 */
export function clientesDosDestinatarios(destinatarios, clientes) {
  const vistos = new Set();
  const sugestoes = [];
  for (const d of destinatarios ?? []) {
    const doDestinatario = new Set(palavras(d?.nome));
    if (!doDestinatario.size) continue;
    for (const cliente of clientes) {
      const doCliente = palavras(cliente.nome);
      if (vistos.has(cliente.id) || doCliente.length < 2 || !doCliente.every((p) => doDestinatario.has(p))) continue;
      vistos.add(cliente.id);
      sugestoes.push({ cliente, destinatario: d.nome, exato: doCliente.length === doDestinatario.size });
    }
  }
  return sugestoes.sort((a, b) => b.exato - a.exato);
}

export function agruparProcessos(processos) {
  const grupos = new Map();
  for (const p of processos) {
    if (!grupos.has(p.cliente_id)) grupos.set(p.cliente_id, []);
    grupos.get(p.cliente_id).push(p);
  }
  return grupos;
}

export function filtrarClientes(clientes, detalhes, processos, f) {
  const detalheDe = new Map(detalhes.map((d) => [d.cliente_id, d]));
  const casosDe = agruparProcessos(processos);
  const busca = semAcento(f.busca).toLocaleLowerCase('pt-BR').trim();
  return clientes.filter((c) => {
    const d = detalheDe.get(c.id);
    const casos = casosDe.get(c.id) ?? [];
    if (((f.ativo || 'ativos') === 'ativos' && !c.ativo) || (f.ativo === 'inativos' && c.ativo)) return false;
    if ((f.representante === 'sim' && !d?.representante_nome) || (f.representante === 'nao' && d?.representante_nome)) return false;
    if (f.responsavel && d?.responsavel_id !== f.responsavel && !casos.some((p) => p.responsavel_id === f.responsavel)) return false;
    // Área e situação precisam pertencer ao mesmo caso, não a dois processos distintos.
    if ((f.area || f.situacao) && !casos.some((p) => (!f.area || p.area === f.area) && (!f.situacao || p.situacao === f.situacao))) return false;
    if (f.etiqueta && !(d?.etiquetas ?? []).includes(f.etiqueta)) return false;
    return !busca || corresponde(busca, [c.nome, d?.nome_fantasia, c.documento, c.telefone, c.email, ...(d?.etiquetas ?? []), ...casos.map((p) => p.numero)]);
  });
}

export function filtrarProcessos(processos, clientes, f) {
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const busca = semAcento(f.busca).toLocaleLowerCase('pt-BR').trim();
  return processos.filter((p) => {
    if ((f.situacao || 'abertos') === 'abertos' && p.situacao === 'encerrado') return false;
    if (f.situacao && !['abertos', 'todos'].includes(f.situacao) && p.situacao !== f.situacao) return false;
    if ((f.area && p.area !== f.area) || (f.responsavel && p.responsavel_id !== f.responsavel) || (f.tribunal && p.tribunal !== f.tribunal)) return false;
    // "sem" = posição do cliente ainda não informada.
    if (f.posicao && (f.posicao === 'sem' ? p.posicao_cliente : p.posicao_cliente !== f.posicao)) return false;
    return !busca || corresponde(busca, [p.numero, p.referencia, p.titulo, p.tribunal, p.orgao, nomes.get(p.cliente_id), p.posicao_cliente]);
  });
}

/** A data mais recente entre cliente, dados completos e processos. */
export function ultimaAlteracao(cliente, detalhes, processos = []) {
  const datas = [cliente, detalhes, ...processos].filter(Boolean).flatMap((r) => [r.criado_em, r.alterado_em]).filter(Boolean);
  return datas.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

/** 29/02 é lembrado em 28/02 nos anos sem essa data; não deduz flexão do nome. */
export function diasParaAniversario(nascimento, dia) {
  return proximoAniversario(nascimento, dia)?.dias ?? null;
}
