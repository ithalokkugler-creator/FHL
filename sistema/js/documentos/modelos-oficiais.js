import { dado, endereco } from './partes.js';
import { html } from '../nucleo/html.js';
import { centavos, data, dataPorExtenso, documento, documentoValido, hora, lerMoeda, moeda, noFuso, numeroCnjValido, percentual } from '../nucleo/formato.js';
import { valorPorExtenso } from '../dominio/extenso.js';
import { pagamentoContrato, ehAcordo } from './modelos.js';
import { qualificar, temValorDeModelo } from './modelos-editaveis.js';

const m = (c, k) => String(c.dados['m_' + k] ?? '').trim();
const PETICOES_DOCX = new Set(['homologacao_divorcio_consensual','contestacao','embargos_declaracao','peticao_inicial',
  'peticao_aceite_dativo','peticao_especificacao_provas','peticao_habilitacao','peticao_quesitos_pericia_medica','peticao_intermediaria']);
const comLinhas = (v) => html`${String(v).split('\n').map((l, i) => html`${i ? html`<br>` : ''}${l}`)}`;
const alternar = (c, chave, textos) => Object.hasOwn(textos, m(c, chave)) ? textos[m(c, chave)] : '';

function exigirTexto(c, chave, rotulo) {
  const v = m(c, chave);
  return dado(v && comLinhas(v), rotulo);
}

function documentoTerceiro(valor, tipo) {
  const doc = String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return doc.length === (tipo === 'CNPJ' ? 14 : 11) && documentoValido(doc) ? documento(doc) : '';
}

function processoOficial(c) {
  const n = [c.processo?.numero, m(c, 'autos'), c.dados.agenda?.processo, c.dados.processo].find(numeroCnjValido);
  if (!numeroCnjValido(n)) return '';
  const d = n.replace(/\D/g, '');
  return d.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6');
}

const cnpj = (c) => c.detalhes.tipo_pessoa === 'juridica' ? documentoTerceiro(c.cliente.documento, 'CNPJ') : '';
const dataDe = (c, chave) => {
  const v = m(c, chave);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? data(v) : '';
};
const incr = (c, ch) => dado(dataDe(c, ch), 'Data informada');
const parte = (c, papel) => {
  const escolhida = c.partes?.[papel];
  if (escolhida) {
    const cadastro = qualificar(escolhida.cliente, escolhida.detalhes);
    if (temValorDeModelo(cadastro) || !temValorDeModelo(m(c,papel))) return cadastro;
  }
  return exigirTexto(c, papel, 'Qualificação de ' + papel.replaceAll('_',' '));
};
const nomeParte = (c, papel, entrada = papel + '_nome') => c.partes?.[papel]?.cliente.nome || m(c, entrada);
const cpfParte = (c, papel, entrada = papel + '_cpf') =>
  documentoTerceiro(c.partes?.[papel]?.cliente.documento, 'CPF') || documentoTerceiro(m(c, entrada), 'CPF');



function pagamentoDocx(c) {
  const d = c.dados;
  const dinheiro = (v, rotulo) => {
    const centavos = lerMoeda(v);
    return dado(centavos != null && centavos > 0 ? moeda(centavos) : '', rotulo);
  };
  const fixo = d.modalidade !== 'exito';
  const exito = d.modalidade !== 'fixo';
  const total = lerMoeda(d.valor_total);
  const entrada = lerMoeda(d.entrada) || 0;
  const vista = total > 0 && entrada === total;
  const parcelas = d.financeiro?.parcelas?.filter((p) => p.numero !== 0 && p.parte !== 'exito') ?? [];
  const datasExatas = parcelas.length > 0 && (parcelas.length === 1 ||
    parcelas.some((p,i) => centavos(p.valor) !== centavos(parcelas[0].valor) ||
      p.vencimento.slice(8) !== parcelas[0].vencimento.slice(8) ||
      (i > 0 && p.vencimento.slice(0,7) === parcelas[i - 1].vencimento.slice(0,7))));
  const cronograma = datasExatas ? html`${parcelas.map((p,i) => html`${i ? ' / ' : ''}${moeda(centavos(p.valor))} em ${data(p.vencimento)}`)}` : '';
  const valorFixo = !fixo ? '' : html`${dinheiro(d.valor_total,'Valor total')}${vista ? ' à vista' : html`
    ${entrada > 0 ? html`com entrada de ${moeda(entrada)} e saldo ` : ''}parcelado em ${dado(d.parcelas,'Número de parcelas')} ${Number(d.parcelas) === 1 ? 'vez' : 'vezes'}${datasExatas
    ? html`, conforme as datas e os valores a seguir: ${cronograma}`
    : html` de ${dinheiro(d.valor_parcela,'Valor da parcela')}, todo dia ${dado(d.dia_vencimento,'Dia do vencimento')} de cada mês subsequente a assinatura deste instrumento`}`}`;
  const valorExito = !exito ? '' : html`${dado(Number(d.exito) > 0 && Number(d.exito) <= 100 ? percentual(d.exito) : '', 'Percentual de êxito')} sobre o proveito econômico do processo`;
  return html`${valorFixo}${fixo && exito ? ' e ' : ''}${valorExito}`;
}

const extras = {
  'oficial.autos': ['Número oficial dos autos', processoOficial],
  'oficial.cliente_cnpj': ['CNPJ da empresa cliente', cnpj],
  'oficial.representante': ['Representante da empresa', (c) => c.partes?.representante ? parte(c, 'representante')
    : m(c, 'representante') || (c.detalhes.representante_nome
      ? html`${c.detalhes.representante_nome}, ${dado(documento(c.detalhes.representante_documento), 'CPF do representante')}, ${dado(c.detalhes.representante_qualificacao, 'Qualificação do representante')}`
      : '')],
  'oficial.representante_assinatura': ['Nome do representante', (c) => nomeParte(c, 'representante') || c.detalhes.representante_nome],
  'oficial.preposto': ['Qualificação do preposto', (c) => parte(c, 'preposto')],
  'oficial.confrontante': ['Qualificação do confrontante', (c) => parte(c, 'confrontante')],
  'oficial.confrontante_nome': ['Nome do confrontante', (c) => nomeParte(c, 'confrontante')],
  'oficial.testemunha': ['Qualificação da testemunha', (c) => parte(c, 'testemunha')],
  'oficial.notificado': ['Qualificação do notificado', (c) => parte(c, 'notificado')],
  'oficial.conjuge': ['Qualificação do cônjuge', (c) => parte(c, 'conjuge')],
  'oficial.outra_parte': ['Qualificação da outra parte', (c) => parte(c, 'outra_parte')],
  'oficial.outra_parte_nome': ['Nome da outra parte', (c) => nomeParte(c, 'outra_parte')],
  'oficial.papel_rescisao_oposto': ['Papel da outra parte', (c) => alternar(c, 'papel_cliente', { Empregador: 'Empregado', Empregado: 'Empregador' })],
  'oficial.endereco_declarante': ['Qualificação do declarante', (c) => m(c, 'papel_cliente') === 'Declarante' ? qualificar(c.cliente,c.detalhes,{contato:true})
    : c.partes?.declarante ? qualificar(c.partes.declarante.cliente,c.partes.declarante.detalhes,{contato:true}) : m(c, 'declarante')],
  'oficial.endereco_declarante_nome': ['Nome do declarante', (c) => m(c, 'papel_cliente') === 'Declarante' ? c.cliente.nome : nomeParte(c,'declarante')],
  'oficial.endereco_declarado': ['Nome e CPF da pessoa declarada', (c) => m(c, 'papel_cliente') === 'Pessoa declarada'
    ? html`${dado(c.cliente.nome, 'Pessoa declarada')} (CPF: ${dado(documentoTerceiro(c.cliente.documento, 'CPF'), 'CPF da pessoa declarada')})`
    : m(c,'papel_cliente') === 'Declarante'
      ? html`${dado(nomeParte(c,'declarado', 'pessoa_declarada'), 'Pessoa declarada')} (CPF: ${dado(cpfParte(c,'declarado', 'documento_declarado'), 'CPF da pessoa declarada')})` : ''],
  'oficial.comparecimento': ['Data de comparecimento', (c) => data(c.dados.data_comparecimento) || dataDe(c, 'comparecimento')],
  'oficial.audiencia_data': ['Data da audiência', (c) => c.dados.agenda?.inicio ? data(noFuso(c.dados.agenda.inicio).dia) : dataDe(c, 'data_audiencia')],
  'oficial.audiencia_hora': ['Horário da audiência', (c) => c.dados.agenda?.inicio ? hora(c.dados.agenda.inicio) : /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(m(c,'hora_audiencia')) ? m(c,'hora_audiencia') : ''],
  'oficial.audiencia_tipo': ['Espécie da audiência', (c) => m(c, 'tipo_audiencia') || c.dados.agenda?.titulo],
  'oficial.audiencia_modalidade': ['Modalidade da audiência', modalidadeAudiencia],
  'oficial.audiencia_local': ['Local ou link da audiência', (c) => m(c,'local_audiencia') || c.dados.agenda?.local_ou_link],
  'oficial.teto': ['Limite da hipótese escolhida', (c) => alternar(c,'juizado', { JEC: 'quarenta', JEF: 'sessenta' })],
  'oficial.relato': ['Relato do atendimento', (c) => m(c,'relato') || c.dados.fatos ? comLinhas(m(c,'relato') || c.dados.fatos) : ''],
  'oficial.bancarios': ['Dados bancários confirmados', (c) => m(c,'bancarios') === 'Incluir'
    ? html`Banco: ${dado(c.detalhes.banco, 'Banco')}, agência: ${dado(c.detalhes.agencia, 'Agência')}, conta: ${dado(c.detalhes.conta, 'Conta')}` : html``],
  'oficial.objeto_docx': ['Objeto da contratação', (c) => c.dados.objeto || (processoOficial(c) ? 'promover a defesa de seus direitos nos autos de n.º ' + processoOficial(c) : '')],
  'oficial.pagamento_docx': ['Condições de pagamento', pagamentoDocx],
  'oficial.pagamento_acordo_docx': ['Condições do acordo com repasse', (c) => ehAcordo(c.dados) ? pagamentoContrato(c.dados) : ''],
  'oficial.juizo_docx': ['Juízo da petição', (c) => temValorDeModelo(c.processo?.orgao) ? c.processo.orgao : m(c,'juizo')],
  'oficial.endereco_docx': ['Endereço declarado', (c) => alternar(c,'residencia', {
    'Junto a mim': 'junto a mim',
    'Em outro endereço': m(c,'endereco_declarado') ? html`na ${m(c,'endereco_declarado').replace(/^na\s+/i, '')}`
      : c.detalhes.logradouro ? html`na ${endereco(c.detalhes)}` : '',
  })],
  'oficial.juizado_docx': ['Lei aplicável', (c) => alternar(c,'juizado',{JEC:'Lei do JEC',JEF:'Lei do JEF'})],
  'oficial.modalidade_docx': ['Modalidade da audiência', (c) => modalidadeAudiencia(c).toLowerCase()],
  'oficial.audiencia_data_extenso': ['Data da audiência por extenso', (c) => dataPorExtenso(c.dados.agenda?.inicio ? noFuso(c.dados.agenda.inicio).dia : m(c,'data_audiencia'))],
  'oficial.juizo_audiencia_docx': ['Juízo da audiência', (c) => temValorDeModelo(c.processo?.orgao) ? c.processo.orgao : m(c,'orgao_audiencia')],
  'oficial.ramo_docx': ['Ramo processual', (c) => m(c,'ramo')],
  'oficial.admissao': ['Data de admissão', (c) => incr(c,'admissao')],
  'oficial.salario': ['Salário e valor por extenso', (c) => {
    const v = lerMoeda(m(c,'salario'));
    return v != null && v > 0 ? html`${moeda(v)} (${valorPorExtenso(v)})` : '';
  }],
  'oficial.rescisao_quadro': ['Verbas, deduções e parcelas conferidas', quadroRescisao],
};

function modalidadeDaAgenda(c) {
  const modalidades = { presencial: 'Presencial', online: 'Virtual', hibrida: 'Semipresencial' };
  const modalidade = c.dados.agenda?.modalidade;
  return Object.hasOwn(modalidades, modalidade) ? modalidades[modalidade] : '';
}

function modalidadeAudiencia(c) {
  return modalidadeDaAgenda(c) || m(c, 'modalidade_audiencia');
}

function quadroRescisao(c) {
  const ler = (k) => lerMoeda(m(c,k));
  const parcelas = lerLinhasValores(m(c,'parcelas_termo'));
  const verbas = lerLinhasValores(m(c,'verbas'));
  const fgts = ler('fgts');
  const deducoes = ler('deducoes');
  const liquido = ler('liquido');
  if (verbas.error || parcelas.error || [fgts,deducoes,liquido].some((v) => v == null || v < 0)) return '';
  const total = verbas.linhas.reduce((acc, a) => acc + a[1], 0) + fgts - deducoes;
  if (total !== liquido || parcelas.linhas.reduce((acc, a) => acc + a[1], 0) !== liquido) {
    return dado(null, 'O total líquido deve coincidir com as verbas, deduções e parcelas');
  }
  const tabela = (titulo, linhas) => html`<table class="doc-tabela"><thead><tr><th>${titulo}</th><th>Valor</th></tr></thead>
    <tbody>${linhas.map(([rotulo, valor]) => html`<tr><td>${rotulo}</td><td class="doc-alinhar-direita">${moeda(valor)}</td></tr>`)}</tbody></table>`;
  return html`${tabela('Verba', [...verbas.linhas,['FGTS acordado',fgts],['Deduções',-deducoes],['Total líquido',liquido]])}
    ${tabela('Parcela e vencimento', parcelas.linhas)}`;
}

function lerLinhasValores(fonte) {
  const linhas = String(fonte).split('\n').filter((l) => l.trim()).map((l) => {
    const [k,v,...sobra] = l.split('|');
    return [k?.trim(), sobra.length ? null : lerMoeda(v)];
  });
  return { linhas, error: !linhas.length || linhas.length > 20 || linhas.some(([k,v]) => !k || v == null || v < 0) };
}

const POR_MODELO = {
  carta_preposicao: ['autos','cliente_cnpj','representante','representante_assinatura','preposto'],
  contrato_honorarios: ['objeto_docx','pagamento_docx','pagamento_acordo_docx'],
  declaracao_anuencia_usucapiao: ['confrontante','confrontante_nome'],
  declaracao_comparecimento: ['comparecimento'],
  declaracao_desistencia: ['autos'],
  declaracao_endereco: ['endereco_declarante','endereco_declarante_nome','endereco_declarado','endereco_docx'],
  declaracao_renuncia_credito_excedente: ['teto','juizado_docx'],
  ficha_atendimento: ['relato','bancarios'],
  intimacao_testemunha: ['autos','testemunha','audiencia_data','audiencia_hora','audiencia_tipo','audiencia_modalidade','audiencia_local','modalidade_docx','juizo_audiencia_docx','ramo_docx'],
  pauta_audiencia: ['autos','audiencia_data','audiencia_hora','audiencia_tipo','audiencia_modalidade','audiencia_data_extenso'],
  notificacao: ['notificado'],
  outorga_conjugal: ['conjuge'],
  renuncia: ['autos'],
  revogacao_mandato: ['autos'],
  substabelecimento: ['autos'],
  termo_rescisao_trabalho: ['outra_parte','outra_parte_nome','papel_rescisao_oposto','admissao','salario','rescisao_quadro'],
  termo_responsabilidade_chave_processo: ['autos'],
};

export function blocosOficiais(chave) {
  if (PETICOES_DOCX.has(chave)) return { 'oficial.juizo_docx': extras['oficial.juizo_docx'] };
  return Object.fromEntries((Object.hasOwn(POR_MODELO, chave) ? POR_MODELO[chave] : []).map((k) => ['oficial.' + k, extras['oficial.' + k]]));
}

const PAPEIS_OFICIAIS = {
  homologacao_divorcio_consensual: [['conjuge','Cônjuge']],
  peticao_inicial: [['reu','Parte ré'],['conjuge_reu','Cônjuge da parte ré']],
  carta_preposicao: [['representante','Representante'],['preposto','Preposto']],
  contrato_honorarios: [['fiador','Fiador']],
  declaracao_anuencia_usucapiao: [['confrontante','Confrontante']],
  declaracao_endereco: [['declarante','Declarante'],['declarado','Pessoa declarada']],
  intimacao_testemunha: [['testemunha','Testemunha']],
  notificacao: [['notificado','Notificado']],
  outorga_conjugal: [['conjuge','Cônjuge']],
  termo_rescisao_trabalho: [['outra_parte','Outra parte']],
};

export const papeisOficiais = (chave) => Object.hasOwn(PAPEIS_OFICIAIS,chave) ? PAPEIS_OFICIAIS[chave] : [];

export function perguntaOficialVisivel(chave, p, c, docx = false) {
  const id = p.chave.slice(7);
  const [papel] = papeisOficiais(chave).find(([k]) => k === id || id.startsWith(k + '_')) ?? [];
  const selecionado = c.partes?.[papel];
  if (!docx && selecionado && temValorDeModelo(qualificar(selecionado.cliente, selecionado.detalhes))) return false;
  if (docx && ['juizo','orgao_audiencia'].includes(id)) return !temValorDeModelo(c.processo?.orgao);
  if (docx && id === 'endereco_declarado') return m(c,'residencia') === 'Em outro endereço';
  if (id === 'autos' && [c.processo?.numero, c.dados.agenda?.processo, c.dados.processo].some(numeroCnjValido)) return false;
  if (chave === 'declaracao_comparecimento' && id === 'comparecimento') return !c.dados.data_comparecimento;
  if (chave === 'ficha_atendimento' && id === 'relato') return !c.dados.fatos;
  if (chave === 'carta_preposicao' && ['representante','representante_nome'].includes(id)) {
    if (id === 'representante_nome') return !temValorDeModelo(c.detalhes?.representante_nome);
    return !['representante_nome','representante_documento','representante_qualificacao'].every((k) => temValorDeModelo(c.detalhes?.[k]));
  }
  if (chave === 'declaracao_endereco') {
    if (['declarante','declarante_nome'].includes(id)) return m(c,'papel_cliente') !== 'Declarante';
    if (['pessoa_declarada','documento_declarado'].includes(id)) return m(c,'papel_cliente') === 'Declarante' && !c.partes?.declarado;
  }
  if (chave === 'contrato_honorarios') {
    if (id === 'criterio_atraso') return !c.dados.financeiro?.criterio && c.dados.modalidade !== 'exito' && !ehAcordo(c.dados);
    if (id === 'fiador') return c.dados.garantia === 'fianca';
    if (id === 'bem_garantia') return ['penhor','hipoteca','anticrese'].includes(c.dados.garantia);
    if (id === 'entrega_bem') return c.dados.garantia === 'penhor';
    if (id === 'matricula') return c.dados.garantia === 'hipoteca';
    if (id === 'termos_garantia') return c.dados.garantia && c.dados.garantia !== 'nenhuma';
  }
  if (chave === 'outorga_conjugal') {
    const campos = { ato_imovel:'I', matricula:'I', imovel_endereco:'I', polo:'II', direito:'II', garantia_conjugal:'III', titulo_garantia:'III', doacao:'IV' };
    if (Object.hasOwn(campos,id)) return campos[id] === m(c,'inciso');
  }
  if (!docx && chave === 'termo_rescisao_trabalho' && /^(?:cpf_)?testemunha_[12]$/.test(id)) return m(c,'assinatura_rescisao') === 'Manuscrita';
  if (['intimacao_testemunha','pauta_audiencia'].includes(chave) && c.dados.agenda && ['data_audiencia','hora_audiencia','tipo_audiencia','modalidade_audiencia','local_audiencia'].includes(id)) {
    return !temValorDeModelo({ data_audiencia: c.dados.agenda.inicio, hora_audiencia: c.dados.agenda.inicio, tipo_audiencia: c.dados.agenda.titulo,
      modalidade_audiencia: modalidadeDaAgenda(c), local_audiencia: c.dados.agenda.local_ou_link }[id]);
  }
  return true;
}

/** Conferência que não impede a emissão: aponta contas que não fecham. */
export function avisoOficial(chave, c) {
  if (chave !== 'termo_rescisao_trabalho') return '';
  const v = (k) => { const x = lerMoeda(m(c,k)); return x != null && x >= 0 ? x : null; };
  const [saldo, decimo, ferias, verbas, fgts, devido, deducoes, liquido] =
    ['saldo_salario','decimo','ferias','verbas','fgts','fgts_devido','deducoes','liquido'].map(v);
  const avisos = [];
  if ([saldo, decimo, ferias, verbas].every((x) => x != null) && saldo + decimo + ferias !== verbas) {
    avisos.push(`o total das verbas (${moeda(verbas)}) difere de saldo de salário + 13º + férias (${moeda(saldo + decimo + ferias)})`);
  }
  if ([verbas, fgts, devido, liquido].every((x) => x != null)) {
    const semDeducoes = verbas + fgts - devido;
    if (liquido !== semDeducoes && liquido !== semDeducoes - (deducoes ?? 0)) {
      avisos.push(`o total líquido (${moeda(liquido)}) difere de verbas + FGTS − 50% do FGTS${deducoes ? ' − deduções' : ''} (${moeda(semDeducoes - (deducoes ?? 0))})`);
    }
  }
  return avisos.length ? 'Confira os valores do termo: ' + avisos.join('; ') + '.' : '';
}

export function validacaoOficial(chave,c) {
  const pessoas = Object.values(c.partes ?? {}).map((p) => p.cliente.id).filter(Boolean);
  if (new Set(pessoas).size !== pessoas.length) return 'Escolha pessoas diferentes para os papéis do documento.';
  if (pessoas.includes(c.cliente.id)) return 'Escolha outra pessoa para o papel adicional.';
  if (chave === 'termo_rescisao_trabalho' && !['Empregador','Empregado'].includes(m(c,'papel_cliente'))) return 'Escolha o papel do cliente.';
  return '';
}

export function extrasDePrevia(chave, ctx) {
  ctx.dados.processo = '0001234-89.2026.8.16.0129';
  ctx.processo.numero = '00012348920268160129';
  const dados = { ...ctx.dados, modalidade: 'misto', exito: 20, garantia: 'nenhuma', valor_total: '1.200,00', entrada: '0,00',
    parcelas: 2, valor_parcela: '600,00', dia_vencimento: 10, area: 'civel', data_comparecimento: ctx.hoje };
  if (chave === 'carta_preposicao') {
    ctx.cliente = { ...ctx.cliente, nome: 'Empresa Fictícia Ltda.', documento: '11222333000181' };
    ctx.detalhes = { ...ctx.detalhes, tipo_pessoa: 'juridica', representante_nome: 'Representante de Exemplo', representante_documento: '12345678909', representante_qualificacao: 'Administrador(a)' };
  }
  if (chave === 'termo_rescisao_trabalho') Object.assign(dados, {
    m_verbas: 'Saldo de salário | 1000,00\nFérias | 500,00', m_fgts: '50,00', m_deducoes: '20,00', m_liquido: '1530,00',
    m_parcelas_termo: '1ª parcela em 15/11/2026 | 1530,00',
    m_cpf_testemunha_1: '529.982.247-25', m_cpf_testemunha_2: '111.444.777-35',
  });
  if (chave === 'declaracao_endereco') dados.m_documento_declarado = '111.444.777-35';
  if (['intimacao_testemunha','pauta_audiencia'].includes(chave)) dados.agenda = { titulo: 'Instrução e julgamento', inicio: '2026-11-13T16:00:00-03:00', modalidade: 'presencial', local_ou_link: 'Fórum de Exemplo' };
  return { ...ctx, dados };
}


// Perguntas lidas pelos blocos próprios de cada família. O editor não deixa
// removê-las enquanto o bloco estiver no texto: sem a pergunta, a emissão
// ficaria com uma pendência sem campo para preencher.
const LEITURAS = {
  'oficial.autos': ['autos'], 'oficial.juizo_docx': ['juizo'], 'oficial.juizo_audiencia_docx': ['orgao_audiencia'],
  'oficial.comparecimento': ['comparecimento'], 'oficial.audiencia_data': ['data_audiencia'],
  'oficial.audiencia_data_extenso': ['data_audiencia'], 'oficial.audiencia_hora': ['hora_audiencia'],
  'oficial.audiencia_tipo': ['tipo_audiencia'], 'oficial.audiencia_modalidade': ['modalidade_audiencia'],
  'oficial.modalidade_docx': ['modalidade_audiencia'], 'oficial.audiencia_local': ['local_audiencia'],
  'oficial.ramo_docx': ['ramo'], 'oficial.juizado_docx': ['juizado'], 'oficial.teto': ['juizado'],
  'oficial.endereco_docx': ['residencia','endereco_declarado'],
  'oficial.endereco_declarante': ['papel_cliente','declarante'], 'oficial.endereco_declarante_nome': ['papel_cliente','declarante_nome'],
  'oficial.endereco_declarado': ['papel_cliente','pessoa_declarada','documento_declarado'],
  'oficial.representante': ['representante'], 'oficial.preposto': ['preposto'], 'oficial.confrontante': ['confrontante'],
  'oficial.confrontante_nome': ['confrontante_nome'], 'oficial.testemunha': ['testemunha'], 'oficial.notificado': ['notificado'],
  'oficial.conjuge': ['conjuge'], 'oficial.outra_parte': ['outra_parte'], 'oficial.outra_parte_nome': ['outra_parte_nome'],
  'oficial.papel_rescisao_oposto': ['papel_cliente'], 'oficial.relato': ['relato'], 'oficial.bancarios': ['bancarios'],
  'oficial.admissao': ['admissao'], 'oficial.salario': ['salario'],
  'oficial.rescisao_quadro': ['verbas','fgts','deducoes','liquido','parcelas_termo'],
};
const PERGUNTAS_DA_FAMILIA = { termo_rescisao_trabalho: ['papel_cliente'] };

export function perguntasProtegidas(chave, usadas) {
  const ids = [...(Object.hasOwn(PERGUNTAS_DA_FAMILIA, chave) ? PERGUNTAS_DA_FAMILIA[chave] : []),
    ...[...usadas].flatMap((k) => Object.hasOwn(LEITURAS, k) ? LEITURAS[k] : [])];
  return new Set(ids.map((id) => 'manual.' + id));
}
