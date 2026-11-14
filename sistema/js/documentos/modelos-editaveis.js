// Representação dos modelos, independente do DOM da folha emitida.
import { cru, escapar, html } from '../nucleo/html.js';
import { data, dataPorExtenso, documento, documentoValido, lerMoeda, moeda, numeroCnj, numeroCnjValido, telefone } from '../nucleo/formato.js';
import { dado, endereco, estadoCivil, flexao, folha, advogados } from './partes.js';
import { posicaoNoProcesso } from '../dominio/clientes.js';

export const CATEGORIAS_MODELO = ['Contrato', 'Declaração', 'Mandato', 'Termo', 'Atendimento', 'Petição', 'Outros'];
export const LIMITE_PERGUNTAS_MODELO = 80;
export const TIPOS_PERGUNTA = { texto: 'Texto curto', texto_longo: 'Texto longo', data: 'Data', valor: 'Valor em reais', inteiro: 'Número inteiro', escolha: 'Escolha entre opções' };
export const DEFINICAO_VAZIA = { formato: 1, corpo: [], perguntas: [], assinaturas: [] };

const TAGS = new Set('p div span h2 h3 strong em u s sup br ul ol li table thead tbody tr th td hr img'.split(' '));
const ALIASES = { b: 'strong', i: 'em', strike: 's', h1: 'h2' };
const CLASSE = /^doc-(?:fonte-[a-z0-9-]+|tam-\d+|alinhar-[a-z]+|recuo-(?:[1-4]|primeira-linha)|sem-(?:negrito|italico)|tabela|ficha(?:-relato)?|num|nota|titulo|data|clausula|rubrica|linha-assinatura|qr-notificacao)$/;
const QR_NOTIFICACAO = '/sistema/img/qr-notificacao.png';
const CONDICAO = /^(m_[a-z][a-z0-9_]{0,47}|garantia|area|audiencia_remota|contrato_acordo):([^:\r\n]{1,100})$/;
const MARCA_COR = /^doc-(?:cor|realce)-/;
const vazio = (v) => v == null || (typeof v === 'string' && !v.trim());
export const temValorDeModelo = (v) => !vazio(v) && !String(v).includes('class="doc-falta"');
const docValido = (valor, tamanho) => {
  const limpo = String(valor ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return documentoValido(limpo) && (!tamanho || limpo.length === tamanho) ? documento(limpo) : '';
};

export function qualificar(p, d, { contato = false, semEndereco = false, obter = (_, valor, rotulo) => dado(valor, rotulo) } = {}) {
  const pj = d.tipo_pessoa === 'juridica';
  const doc = pj ? 'CNPJ' : 'CPF';
  const partes = [
    obter('nome', p.nome, 'Nome'),
    pj ? 'pessoa jurídica' : obter('nacionalidade', d.nacionalidade, 'Nacionalidade'),
    ...(!pj ? [obter('estado_civil', estadoCivil(d), 'Estado civil'), obter('profissao', d.profissao, 'Profissão')] : []),
    html`${doc} nº ${obter(doc.toLowerCase(), docValido(p.documento, pj ? 14 : 11), doc)}`,
    ...(!semEndereco ? [obter('endereco', endereco(d), 'Endereço')] : []),
    ...(contato && p.telefone ? [telefone(p.telefone)] : []),
    ...(contato && p.email ? [p.email] : []),
    ...(d.representante_nome ? [html`representado(a) por ${d.representante_nome}${d.representante_documento ? html`, documento nº ${documento(d.representante_documento)}` : ''}${d.representante_qualificacao ? html`, ${d.representante_qualificacao}` : ''}`] : []),
  ];
  return html`${partes.map((x, i) => html`${i ? ', ' : ''}${x}`)}`;
}

const advogado = (c) => c.advogados.find((m) => m.id === c.dados.advogado_id && m.ativo && m.oab);
const concordar = (d = {}, m, f) => d.tipo_pessoa === 'juridica' ? f : flexao(d, m, f);
const numeroOab = (oab) => String(oab ?? '').match(/\d[\d.]*(?:-[A-Z0-9]+)?/i)?.[0];
const numeroDeAutos = ({ processo, dados }) => {
  const numero = [processo?.numero, dados.agenda?.processo, dados.processo, dados.m_autos].find(numeroCnjValido);
  return numero ? numeroCnj(numero) : '';
};
export const CAMPOS_MODELO = {
  'cliente.nome': ['Nome do cliente', ({ cliente }) => cliente.nome],
  'cliente.cpf': ['CPF do cliente', ({ cliente, detalhes }) => detalhes.tipo_pessoa !== 'juridica' ? docValido(cliente.documento, 11) : ''],
  'cliente.cnpj': ['CNPJ do cliente', ({ cliente }) => docValido(cliente.documento, 14)],
  'cliente.documento': ['CPF ou CNPJ do cliente', ({ cliente }) => docValido(cliente.documento)],
  'cliente.rg': ['RG do cliente', ({ detalhes }) => detalhes.rg],
  'cliente.nascimento': ['Nascimento do cliente', ({ detalhes }) => data(detalhes.nascimento)],
  'cliente.nacionalidade': ['Nacionalidade do cliente', ({ detalhes }) => detalhes.nacionalidade],
  'cliente.estado_civil': ['Estado civil do cliente', ({ detalhes }) => detalhes.estado_civil ? estadoCivil(detalhes) : ''],
  'cliente.profissao': ['Profissão do cliente', ({ detalhes }) => detalhes.profissao],
  'cliente.filiacao': ['Filiação do cliente', ({ detalhes }) => [detalhes.filiacao_mae, detalhes.filiacao_pai].filter(Boolean).join(' / ') || detalhes.filiacao],
  'cliente.filiacao_mae': ['Nome da mãe do cliente', ({ detalhes }) => detalhes.filiacao_mae],
  'cliente.filiacao_pai': ['Nome do pai do cliente', ({ detalhes }) => detalhes.filiacao_pai],
  'cliente.endereco': ['Endereço do cliente', ({ detalhes }) => detalhes.logradouro ? endereco(detalhes) : ''],
  'cliente.email': ['E-mail do cliente', ({ cliente }) => lerEmail(String(cliente.email ?? '').trim())],
  'cliente.telefone': ['Telefone do cliente', ({ cliente }) => numeroTelefone(cliente.telefone)],
  'cliente.qualificacao': ['Qualificação do cliente', ({ cliente, detalhes }) => qualificar(cliente, detalhes)],
  'cliente.qualificacao_contato': ['Qualificação com contatos', ({ cliente, detalhes }) => qualificar(cliente, detalhes, { contato: true })],
  'cliente.qualificacao_curta': ['Qualificação sem endereço', ({ cliente, detalhes }) => qualificar(cliente, detalhes, { semEndereco: true })],
  // Concordância do cadastro ("O cliente", "A cliente" ou neutra com "(a)").
  'cliente.inscrito': ['inscrito(a)', ({ detalhes }) => concordar(detalhes, 'inscrito', 'inscrita')],
  'cliente.domiciliado': ['domiciliado(a)', ({ detalhes }) => concordar(detalhes, 'domiciliado', 'domiciliada')],
  'cliente.orientado': ['orientado(a)', ({ detalhes }) => concordar(detalhes, 'orientado', 'orientada')],
  'representante.nome': ['Nome do representante', ({ detalhes }) => detalhes.representante_nome],
  'representante.documento': ['CPF ou CNPJ do representante', ({ detalhes }) => docValido(detalhes.representante_documento)],
  'representante.qualificacao': ['Qualificação do representante', ({ detalhes }) => detalhes.representante_qualificacao],
  'processo.numero': ['Número dos autos', ({ processo, dados }) => numeroCnj(processo?.numero) || dados.processo || ''],
  'processo.autos': ['Número CNJ dos autos', numeroDeAutos],
  'processo.referencia': ['Referência do processo', ({ processo }) => processo?.referencia],
  'processo.orgao': ['Órgão ou vara do processo', ({ processo }) => processo?.orgao],
  'processo.tribunal': ['Tribunal do processo', ({ processo }) => processo?.tribunal],
  'processo.area': ['Área do processo', ({ processo }) => processo?.area],
  'processo.posicao': ['Posição do cliente', ({ processo, cliente }) => processo ? posicaoNoProcesso(processo, cliente.id) : ''],
  'advogado.nome': ['Nome do advogado selecionado', (c) => advogado(c)?.nome],
  'advogado.oab': ['OAB do advogado selecionado', (c) => advogado(c)?.oab],
  'advogado.oab_numero': ['Número da OAB do advogado selecionado', (c) => numeroOab(advogado(c)?.oab)],
  'advogado.equipe': ['Advogados selecionados', ({ advogados: equipe, dados }) => advogados(equipe.filter((m) => dados.advogados_ids?.includes(m.id)))],
  'emissao.data': ['Data de emissão', ({ hoje, dados }) => dataPorExtenso(dados.data_emissao || hoje)],
  'emissao.data_curta': ['Data de emissão (dia/mês/ano)', ({ hoje, dados }) => data(dados.data_emissao || hoje)],
};

export const PALAVRAS_MODELO = Object.entries(CAMPOS_MODELO).map(([chave, [rotulo]]) => [chave, rotulo]);

const ESTADOS_CIVIS_EMISSAO = [
  'solteiro','solteira','casado','casada','em união estável','separado','separada',
  'divorciado','divorciada','viúvo','viúva',
];
const lerAutosEmissao = (v) => numeroCnjValido(v) ? numeroCnj(v) : '';
const numeroTelefone = (v) => {
  const digits = String(v ?? '').replace(/\D/g,'');
  return [10,11].includes(digits.length) ? telefone(digits) : '';
};
const lerEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : '';
const textoEmissao = (v) => v;
const CAMPOS_COMPLEMENTARES = {
  'cliente.cpf': { ler: (v,c) => c.detalhes.tipo_pessoa === 'juridica' ? '' : docValido(v, 11), dica:'Informe um CPF válido.' },
  'cliente.cnpj': { ler: (v,c) => c.detalhes.tipo_pessoa === 'fisica' ? '' : docValido(v, 14), dica:'Informe um CNPJ válido.' },
  'cliente.documento': { ler:(v) => docValido(v) },
  'cliente.rg': {},
  'cliente.nascimento': { tipo:'data', ler:(v) => valorPergunta({ tipo:'data' },v) },
  'cliente.nacionalidade': {},
  'cliente.estado_civil': { tipo:'escolha', opcoes:ESTADOS_CIVIS_EMISSAO, ler:(v) => ESTADOS_CIVIS_EMISSAO.includes(v) ? v : '' },
  'cliente.profissao': {},
  'cliente.filiacao': {},
  'cliente.filiacao_mae': {},
  'cliente.filiacao_pai': {},
  'cliente.endereco': { tipo:'texto_longo', dica:'Informe logradouro, número, bairro, cidade/UF e CEP.' },
  'cliente.email': { ler:lerEmail, dica:'Informe um e-mail válido.' },
  'cliente.telefone': { ler:numeroTelefone, dica:'Informe o telefone com DDD.' },
  'representante.nome': {},
  'representante.documento': { ler:(v) => docValido(v) },
  'representante.qualificacao': { tipo:'texto_longo' },
  'processo.numero': {},
  'processo.autos': { ler:lerAutosEmissao, dica:'Informe um número CNJ válido.' },
  'processo.referencia': {},
  'processo.orgao': {},
  'processo.tribunal': {},
  'processo.area': {},
  'processo.posicao': {},
  'advogado.oab_numero': { ler:(v,c) => advogado(c) && /^\d+(?:\.\d+)*(?:-[A-Z0-9]+)?$/i.test(v) ? v : '', dica:'Use o número da OAB de quem foi selecionado acima.' },
};

function complementoDisponivel(chave, c) {
  if (!Object.hasOwn(CAMPOS_COMPLEMENTARES,chave) || !c.cliente.id) return false;
  if (chave === 'cliente.cpf' && c.detalhes.tipo_pessoa === 'juridica') return false;
  if (chave === 'cliente.cnpj' && c.detalhes.tipo_pessoa === 'fisica') return false;
  if (chave === 'advogado.oab_numero') return Boolean(advogado(c));
  return true;
}

export function chavesDaDefinicao(def) {
  const chaves = new Set();
  const visitar = (n) => {
    if (n.tipo === 'campo') chaves.add(n.chave);
    if (n.tipo === 'elemento') {
      if (n.modelo_exemplo) chaves.add(n.modelo_exemplo);
      const condicao = CONDICAO.exec(n.modelo_condicao ?? '');
      if (condicao?.[1].startsWith('m_')) chaves.add('manual.' + condicao[1].slice(2));
      n.itens.forEach(visitar);
    }
  };
  def.corpo.forEach(visitar);
  def.assinaturas.forEach((a) => { if (a.nome) chaves.add(a.nome); });
  return chaves;
}

function validarNos(nos, profundidade = 1) {
  if (!Array.isArray(nos) || profundidade > 12) throw new Error('O texto tem blocos aninhados demais.');
  for (const no of nos) {
    if (!no || typeof no !== 'object') throw new Error('O texto contém um bloco inválido.');
    if (no.tipo === 'texto' && typeof no.valor === 'string') continue;
    if (no.tipo === 'campo' && typeof no.chave === 'string') continue;
    if (no.tipo !== 'elemento' || !TAGS.has(no.tag)) throw new Error('O texto contém um bloco inválido.');
    if ((no.modelo_condicao && !CONDICAO.test(no.modelo_condicao)) ||
        (no.modelo_exemplo && !/^manual\.[a-z][a-z0-9_]{0,47}$/.test(no.modelo_exemplo)) ||
        (no.tag === 'img' && (no.classe !== 'doc-qr-notificacao' || no.itens?.length))) {
      throw new Error('O texto contém um bloco importado inválido.');
    }
    if (no.itens?.length || !Array.isArray(no.itens)) validarNos(no.itens, profundidade + 1);
  }
}

// O banco mede `definicao::text` (jsonb), que põe espaço depois de cada ':' e
// ',' estruturais. A conta aqui é a mesma, para a tela recusar o que ele recusa.
const LIMITE_BYTES_MODELO = 204800;
export function tamanhoNoBanco(valor) {
  let separadores = 0;
  const contar = (v) => {
    if (Array.isArray(v)) { separadores += Math.max(v.length - 1, 0); v.forEach(contar); }
    else if (v && typeof v === 'object') {
      const chaves = Object.keys(v).filter((k) => v[k] !== undefined);
      separadores += chaves.length + Math.max(chaves.length - 1, 0);
      chaves.forEach((k) => contar(v[k]));
    }
  };
  contar(valor);
  return new TextEncoder().encode(JSON.stringify(valor)).length + separadores;
}

export function validarModelo(def, { publicar = false, extras = {} } = {}) {
  if (def?.formato !== 1 || !Array.isArray(def.perguntas) || !Array.isArray(def.assinaturas) ||
      (def.folha_origem != null && typeof def.folha_origem !== 'boolean')) throw new Error('Formato de modelo inválido.');
  validarNos(def.corpo);
  if (def.corpo.length > 300 || def.perguntas.length > LIMITE_PERGUNTAS_MODELO || def.assinaturas.length > 10 ||
      tamanhoNoBanco(def) > LIMITE_BYTES_MODELO) throw new Error('O modelo excede o limite de conteúdo.');
  const perguntas = new Set();
  for (const p of def.perguntas) {
    if (!/^manual\.[a-z][a-z0-9_]{0,47}$/.test(p.chave) || perguntas.has(p.chave) ||
        !p.rotulo?.trim() || p.rotulo.length > 120 || !Object.hasOwn(TIPOS_PERGUNTA, p.tipo)) throw new Error('Revise os campos das perguntas.');
    perguntas.add(p.chave);
    if (p.tipo === 'escolha' && (!Array.isArray(p.opcoes) || p.opcoes.length < 2 || p.opcoes.length > 20 ||
      new Set(p.opcoes).size !== p.opcoes.length || p.opcoes.some((o) => !o.trim() || o.length > 100))) {
      throw new Error('Cada lista precisa de 2 a 20 opções distintas.');
    }
  }
  if (def.assinaturas.some((a) => !a.papel?.trim() || a.papel.length > 90)) throw new Error('Informe o papel de cada assinatura.');
  const usadas = chavesDaDefinicao(def);
  if (usadas.size > 100) throw new Error('Use até 100 campos diferentes.');
  for (const chave of usadas) {
    if (!Object.hasOwn(CAMPOS_MODELO, chave) && !perguntas.has(chave) && !Object.hasOwn(extras, chave)) {
      throw new Error('O campo ' + chave + ' não está disponível neste modelo.');
    }
  }
  const temConteudo = (nos) => nos.some((n) => n.tipo === 'campo' || (n.tipo === 'texto' && n.valor.trim()) ||
    (n.tipo === 'elemento' && temConteudo(n.itens)));
  if (publicar && !temConteudo(def.corpo)) throw new Error('Escreva o texto do modelo antes de publicar.');
  return usadas;
}

export function lerCorpoEditavel(raiz) {
  const ler = (n) => {
    if (n.nodeType === 3) return [{ tipo: 'texto', valor: n.data.replaceAll('\u200B', '') }];
    if (n.nodeType !== 1) return [];
    if (n.tagName === 'SPAN' && n.dataset.campo && n.classList.contains('modelo-campo-chip')) return [{ tipo: 'campo', chave: n.dataset.campo }];
    const bruto = n.tagName.toLowerCase();
    if (bruto === 'img') return n.getAttribute('src') === QR_NOTIFICACAO && n.classList.contains('doc-qr-notificacao')
      ? [{ tipo: 'elemento', tag: 'img', classe: 'doc-qr-notificacao', itens: [] }] : [];
    if (['script','style','iframe','object','svg','form','input','textarea','button'].includes(bruto)) return [];
    const itens = [...n.childNodes].flatMap(ler);
    const tag = Object.hasOwn(ALIASES, bruto) ? ALIASES[bruto] : bruto;
    if (!TAGS.has(tag)) return itens;
    const classe = [...n.classList].filter((c) => CLASSE.test(c)).join(' ');
    const tabela = ['td','th'].includes(tag);
    const spans = tabela ? Object.fromEntries(['colspan','rowspan'].map((a) => [a, n.getAttribute(a)]).filter(([, v]) => /^[1-9]\d?$/.test(v ?? '')).map(([a, v]) => [a, Number(v)])) : {};
    const modelo = {};
    if (CONDICAO.test(n.dataset.modeloCondicao ?? '')) modelo.modelo_condicao = n.dataset.modeloCondicao;
    if (/^manual\.[a-z][a-z0-9_]{0,47}$/.test(n.dataset.modeloExemplo ?? '')) modelo.modelo_exemplo = n.dataset.modeloExemplo;
    return [{ tipo: 'elemento', tag, itens, ...(classe ? { classe } : {}), ...spans, ...modelo }];
  };
  return [...raiz.childNodes].flatMap(ler);
}

export function chipDoCampo(chave, rotulo) {
  return html`<span class="modelo-campo-chip" contenteditable="false" data-campo="${chave}">${rotulo}</span>`;
}

export function limparCoresDoModelo(raiz) {
  for (const el of raiz.querySelectorAll('[class]')) {
    for (const classe of el.classList) if (MARCA_COR.test(classe)) el.classList.remove(classe);
  }
}

function blocoAtivo(n, dados) {
  const condicao = CONDICAO.exec(n.modelo_condicao ?? '');
  if (!condicao) return true;
  const [, chave, valor] = condicao;
  if (valor === '*') return false;
  if (chave === 'contrato_acordo') return Boolean(dados.contrato_acordo) === (valor === 'Sim');
  if (chave === 'audiencia_remota') {
    return dados.agenda?.modalidade ? ['online','hibrida'].includes(dados.agenda.modalidade)
      : ['Virtual','Semipresencial'].includes(dados.m_modalidade_audiencia);
  }
  return (dados[chave] || (chave === 'garantia' ? 'nenhuma' : '')) === valor;
}

export function camposDeEmissao(def, dados) {
  const ativos = new Set();
  function visitar(n) {
    if (n.tipo === 'campo') ativos.add(n.chave);
    if (n.tipo !== 'elemento') return;
    const condicao = CONDICAO.exec(n.modelo_condicao ?? '');
    if (condicao?.[1].startsWith('m_')) ativos.add('manual.' + condicao[1].slice(2));
    if (!blocoAtivo(n,dados)) return;
    if (n.modelo_exemplo) ativos.add(n.modelo_exemplo);
    else n.itens.forEach(visitar);
  }
  def.corpo.forEach(visitar);
  def.assinaturas.forEach((a) => { if (a.nome) ativos.add(a.nome); });
  return ativos;
}

function seletoresAtivos(nos, dados, seletores = new Set()) {
  for (const n of nos) {
    if (n.tipo !== 'elemento') continue;
    const condicao = CONDICAO.exec(n.modelo_condicao ?? '');
    if (condicao?.[1].startsWith('m_')) seletores.add('manual.' + condicao[1].slice(2));
    if (blocoAtivo(n,dados) && !n.modelo_exemplo) seletoresAtivos(n.itens,dados,seletores);
  }
  return seletores;
}

const soExemplo = (n) => ['p','li'].includes(n.tag) && n.itens.some((x) => x.modelo_exemplo) &&
  n.itens.every((x) => x.modelo_exemplo || (x.tipo === 'texto' && /^[\s\d.▪•)–-]*$/.test(x.valor)));
const NUMERO_INICIAL = /^(\d+(?:\.\d+)*)\.(?=\s)/;
const numeroDoBloco = (n) => n.tipo === 'elemento' && ['p','h2','h3','li'].includes(n.tag) && n.itens[0]?.tipo === 'texto'
  ? NUMERO_INICIAL.exec(n.itens[0].valor)?.[1] : undefined;

// A numeração dos DOCX é texto ("3.5."). Quando cláusulas condicionais ficam
// de fora, os itens seguintes do mesmo nível sobem para não deixar lacuna.
// O bloco do acordo com repasse ocupa o lugar da cláusula 3.1 do contrato.
function renumerar(corpo, visivel) {
  const blocos = corpo.map((n) => ({ n, num: numeroDoBloco(n) })).filter((b) => b.num);
  const ativos = new Set(blocos.filter((b) => visivel(b.n)).map((b) => b.num));
  const ocultos = [...new Set(blocos.filter((b) => !visivel(b.n) && !ativos.has(b.num) &&
    !String(b.n.modelo_condicao ?? '').startsWith('contrato_acordo:')).map((b) => b.num))].map((x) => x.split('.').map(Number));
  if (!ocultos.length) return corpo;
  const novo = new Map();
  for (const { n, num } of blocos) {
    if (!visivel(n)) continue;
    const partes = num.split('.').map(Number);
    const ajustado = partes.map((v, nivel) => v - ocultos.filter((h) => h.length === nivel + 1 &&
      h.slice(0, nivel).every((x, i) => x === partes[i]) && h[nivel] < v).length).join('.');
    if (ajustado !== num) novo.set(n, ajustado);
  }
  return corpo.map((n) => novo.has(n)
    ? { ...n, itens: [{ ...n.itens[0], valor: n.itens[0].valor.replace(NUMERO_INICIAL, novo.get(n) + '.') }, ...n.itens.slice(1)] } : n);
}

// Notas de rodapé de ramos alternativos (ex.: renúncia "com outro
// procurador", notas 3 e 4 no DOCX) são renumeradas a partir de 1.
function renumerarNotas(corpo, dados) {
  const chamadas = [];
  const ler = (n, nota) => {
    if (n.tipo !== 'elemento' || !blocoAtivo(n, dados)) return;
    if (n.tag === 'sup' && !nota && n.itens.length === 1 && /^\d+$/.test(n.itens[0].valor ?? '')) {
      if (!chamadas.includes(n.itens[0].valor)) chamadas.push(n.itens[0].valor);
    }
    n.itens.forEach((x) => ler(x, nota));
  };
  corpo.forEach((n) => ler(n, String(n.classe ?? '').split(' ').includes('doc-nota')));
  const mapa = new Map(chamadas.map((v, i) => [v, String(i + 1)]));
  if (chamadas.every((v, i) => v === String(i + 1))) return corpo;
  const trocar = (n) => n.tipo !== 'elemento' ? n
    : n.tag === 'sup' && n.itens.length === 1 && mapa.has(n.itens[0].valor)
      ? { ...n, itens: [{ ...n.itens[0], valor: mapa.get(n.itens[0].valor) }] }
      : { ...n, itens: n.itens.map(trocar) };
  return corpo.map(trocar);
}

function renderNos(nos, resolver, dados) {
  return html`${nos.map((n) => {
    if (n.tipo === 'texto') return n.valor;
    if (n.tipo === 'campo') return resolver(n.chave);
    if (n.tipo !== 'elemento' || !TAGS.has(n.tag)) return '';
    if (dados && !blocoAtivo(n,dados)) return '';
    if (n.tag === 'img') return n.classe === 'doc-qr-notificacao'
      ? html`<img class="doc-qr-notificacao" src="${QR_NOTIFICACAO}" alt="QR Code de contato do escritório">` : '';
    if (dados && n.modelo_exemplo) return resolver(n.modelo_exemplo);
    const classe = String(n.classe ?? '').split(' ').filter((c) => CLASSE.test(c)).join(' ');
    const attr = Object.entries({ class: classe, colspan: n.colspan, rowspan: n.rowspan }).filter(([k, v]) =>
      k === 'class' ? v : ['td','th'].includes(n.tag) && /^[1-9]\d?$/.test(String(v ?? '')))
      .map(([k, v]) => ' ' + k + '="' + escapar(v) + '"').join('');
    const atributosModelo = dados ? '' : Object.entries({
      'data-modelo-condicao': n.modelo_condicao, 'data-modelo-exemplo': n.modelo_exemplo,
      title: n.modelo_exemplo ? 'Exemplo do Word. Edite o trecho para fixar um texto ou preencha o campo na emissão.' : '',
    }).filter(([,v]) => v).map(([k,v]) => ' ' + k + '="' + escapar(v) + '"').join('');
    const voidTag = n.tag === 'br' || n.tag === 'hr';
    const interno = voidTag ? '' : String(renderNos(n.itens, resolver, dados));
    // Parágrafo feito só do exemplo do Word (e talvez do número do item): se o
    // texto opcional ficou em branco, o parágrafo inteiro sai da folha.
    if (dados && soExemplo(n) && !interno.replace(/<[^>]*>/g, '').replace(/[\s\d.▪•)–-]/g, '')) return '';
    return cru('<' + n.tag + attr + atributosModelo + '>' + (voidTag ? '' : interno + '</' + n.tag + '>'));
  })}`;
}

export function corpoParaEditor(def, extras = {}) {
  const rotulos = Object.fromEntries([...PALAVRAS_MODELO, ...Object.entries(extras).map(([k, [r]]) => [k,r]), ...def.perguntas.map((p) => [p.chave,p.rotulo])]);
  return renderNos(def.corpo, (chave) => chipDoCampo(chave, Object.hasOwn(rotulos, chave) ? rotulos[chave] : chave));
}

export const perguntaDeCpf = (p) => p.tipo === 'texto' && /\bCPF\b/.test(p.rotulo) &&
  /(?:^manual\.cpf(?:_|$)|_cpf$)/.test(p.chave);

function valorPergunta(p, valor) {
  if (vazio(valor)) return '';
  if (perguntaDeCpf(p)) return docValido(valor, 11);
  if (p.tipo === 'data') {
    const d = new Date(valor + 'T00:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(valor) && Number.isFinite(+d) && d.toISOString().slice(0,10) === valor ? data(valor) : '';
  }
  if (p.tipo === 'valor') {
    const v = lerMoeda(valor);
    return v != null && v >= 0 ? moeda(v) : '';
  }
  if (p.tipo === 'inteiro') return /^\d+$/.test(String(valor)) && Number(valor) <= 1e9 ? String(Number(valor)) : '';
  if (p.tipo === 'escolha') return p.opcoes.includes(valor) ? valor : '';
  if (p.tipo === 'texto_longo') return html`${String(valor).split('\n').map((linha, i) => html`${i ? html`<br>` : ''}${linha}`)}`;
  return String(valor);
}

export function renderModelo(versao, contexto, extras = {}) {
  const def = versao.definicao;
  const ctx = { cliente: {}, detalhes: {}, advogados: [], dados: {}, ...contexto };
  const eAcordo = extras['oficial.pagamento_acordo_docx']?.[1](ctx);
  if (eAcordo) ctx.dados = { ...ctx.dados, contrato_acordo: true };
  const faltas = new Set();
  const pendencias = new Map();
  const complementos = new Map();
  const registrar = (chave, rotulo) => {
    if (faltas.has(rotulo) && !pendencias.has(chave)) return;
    faltas.add(rotulo);
    pendencias.set(chave, { chave, rotulo });
  };
  const complementar = (chave, original, rotulo) => {
    if (temValorDeModelo(original) || !complementoDisponivel(chave,ctx)) return original;
    if (chave === 'processo.autos' && def.perguntas.some((p) => p.chave === 'manual.autos')) return original;
    const { ler = textoEmissao, ...campo } = CAMPOS_COMPLEMENTARES[chave];
    const v = String(ctx.complementos?.[chave] ?? '').trim();
    complementos.set(chave, { chave, rotulo, tipo:'texto', ...campo, valor:v });
    return (v && ler(v,ctx)) || original;
  };
  const resolver = (chave) => {
    const pergunta = def.perguntas.find((p) => p.chave === chave);
    const campo = Object.hasOwn(CAMPOS_MODELO, chave) ? CAMPOS_MODELO[chave] : Object.hasOwn(extras, chave) ? extras[chave] : null;
    const rotulo = pergunta?.rotulo || campo?.[0] || chave;
    const entrada = pergunta ? valorPergunta(pergunta, ctx.dados['m_' + chave.slice(7)]) : '';
    if (['cliente.qualificacao','cliente.qualificacao_contato','cliente.qualificacao_curta'].includes(chave)) {
      return qualificar(ctx.cliente,ctx.detalhes,{
        contato:chave.endsWith('_contato'), semEndereco:chave.endsWith('_curta'),
        obter: (id) => resolver('cliente.' + id),
      });
    }
    const cadastro = pergunta ? campoDaParte(chave, ctx) : '';
    const original = pergunta ? (temValorDeModelo(cadastro) ? cadastro : entrada)
      : chave === 'oficial.pagamento_acordo_docx' ? eAcordo : campo?.[1](ctx);
    const valor = complementar(chave,original,rotulo);
    if (vazio(valor) && pergunta && !pergunta.obrigatorio && vazio(ctx.dados['m_' + chave.slice(7)])) return '';
    if (!temValorDeModelo(valor)) registrar(chave,rotulo);
    return dado(valor, rotulo);
  };
  const visivel = (n) => blocoAtivo(n, ctx.dados) &&
    !(soExemplo(n) && n.itens.every((x) => !x.modelo_exemplo || vazio(String(resolver(x.modelo_exemplo)))));
  const corpo = renderNos(renumerarNotas(renumerar(def.corpo, visivel), ctx.dados), resolver, ctx.dados);
  const assinaturas = def.assinaturas.flatMap((a) => {
    if (a.nome === 'advogado.equipe') {
      const selecionados = ctx.advogados.filter((m) => ctx.dados.advogados_ids?.includes(m.id));
      if (selecionados.length) return selecionados.map((m) => [a.papel, m.nome]);
    }
    return [[a.papel, a.nome ? resolver(a.nome) : '']];
  });
  const seletores = seletoresAtivos(def.corpo,ctx.dados);
  for (const p of def.perguntas) {
    if (!p.obrigatorio || p.tipo !== 'escolha' || !seletores.has(p.chave)) continue;
    if (!p.opcoes.includes(ctx.dados['m_' + p.chave.slice(7)])) registrar(p.chave,p.rotulo);
  }
  return { folha: folha(versao.titulo, corpo, ctx.dados.data_emissao || ctx.hoje, assinaturas, def.folha_origem),
    faltas: [...faltas], pendencias: [...pendencias.values()], complementos: [...complementos.values()] };
}

export function campoDaParte(chave, c) {
  if (!chave.startsWith('manual.') || !c.detalhes || !c.dados) return '';
  if (chave === 'manual.relato' && c.dados.fatos) {
    return valorPergunta({ tipo:'texto_longo' },c.dados.fatos);
  }
  if (/^manual\.(banco|agencia|conta)$/.test(chave)) return c.detalhes[chave.slice(7)];
  const partes = { ...c.partes };
  if (c.dados.m_papel_cliente === 'Empregador') partes.empregador = c;
  if (c.dados.m_papel_cliente === 'Empregado') partes.empregado = c;
  if (!partes.representante && c.detalhes.representante_nome) {
    partes.representante = { cliente: { nome:c.detalhes.representante_nome, documento:c.detalhes.representante_documento }, detalhes:{} };
  }
  for (const [papel, pessoa] of Object.entries(partes)) {
    const prefixo = 'manual.' + papel + '_';
    if (!chave.startsWith(prefixo)) continue;
    const campo = CAMPOS_MODELO['cliente.' + chave.slice(prefixo.length)];
    const valor = campo?.[1](pessoa);
    if (temValorDeModelo(valor)) return valor;
  }
  return '';
}

export function contextoFicticio(def) {
  const dados = Object.fromEntries(def.perguntas.map((p) => ['m_' + p.chave.slice(7),
    perguntaDeCpf(p) ? '111.444.777-35' :
      { texto: 'Exemplo fictício', texto_longo: 'Texto de demonstração para conferir a quebra de linhas.', data: '2026-11-13', inteiro: '6', valor: '120,50', escolha: p.opcoes?.[0] }[p.tipo],
  ]));
  return {
    cliente: { id: 'exemplo', nome: 'Ana de Exemplo', documento: '12345678909', telefone: '41900000000', email: 'ana@example.invalid' },
    detalhes: { tipo_pessoa: 'fisica', rg: '0000001', nascimento: '1990-04-03', flexao: 'f', nacionalidade: 'brasileira', estado_civil: 'solteiro', profissao: 'comerciante', filiacao_mae: 'Maria de Exemplo', filiacao_pai: 'João de Exemplo', logradouro: 'Rua de Exemplo', numero: '12', bairro: 'Centro', cidade: 'Paranaguá', uf: 'PR', cep: '83203270' },
    processo: { cliente_id: 'exemplo', numero: '00012348920268160129', referencia: 'Caso fictício', orgao: 'Vara de Exemplo', tribunal: 'TJPR', area: 'civel', posicao_cliente: 'Autor(a)' },
    advogados: [{ id: 'adv', nome: 'Advogada de Exemplo', oab: 'OAB/PR 123.456', ativo: true }],
    hoje: '2026-11-13', dados: { ...dados, advogado_id: 'adv', advogados_ids: ['adv'] },
  };
}

