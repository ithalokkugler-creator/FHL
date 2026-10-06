// Pedaços de tela que se repetem: cabeçalho, indicador, seletor de mês, selos
// de situação. Um só desenho para cada um: mudar aqui muda em todas as telas.

import { html } from '../nucleo/html.js';
import { dataHora, nomeDoMes } from '../nucleo/formato.js';

export function cabecalho(titulo, subtitulo, acoes) {
  return html`
    <header class="pagina__topo">
      <div>
        <h1 class="pagina__titulo">${titulo}</h1>
        ${subtitulo ? html`<p class="pagina__sub">${subtitulo}</p>` : ''}
      </div>
      ${acoes ? html`<div class="pagina__acoes">${acoes}</div>` : ''}
    </header>`;
}

export const vazio = (texto) => html`<p class="vazio">${texto}</p>`;

/**
 * Um número em destaque, com rótulo e nota: "Entrou · R$ 1.200,00 · 3
 * recebimentos". Com `href`, vira link para a tela onde o número mora — o
 * painel aponta para o detalhe em vez de repeti-lo.
 */
export function indicador(rotulo, valor, nota = '', { tom = '', href = '' } = {}) {
  const conteudo = html`
    <span class="rotulo">${rotulo}</span>
    <span class="indicador__valor">${valor}</span>
    ${nota ? html`<span class="indicador__nota">${nota}</span>` : ''}`;
  const classe = `indicador${tom ? ` indicador--${tom}` : ''}`;
  return href ? html`<a class="${classe}" href="${href}">${conteudo}</a>` : html`<div class="${classe}">${conteudo}</div>`;
}

/** "1 parcela", "3 parcelas". */
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Cabeçalho que só aparece no papel (fechamento e relatórios). */
export const cabecalhoImpressao = () => html`
  <div class="so-impressao">
    <p class="rotulo">FHL Advocacia — Fonseca Hespanha Lisboa</p>
    <p>Impresso em ${dataHora(new Date().toISOString())}</p>
  </div>`;

/** Mês vindo do endereço (?mes=AAAA-MM-01), ou o padrão se vier torto. */
export const mesDaConsulta = (valor, padrao) => (/^\d{4}-\d{2}-01$/.test(valor ?? '') ? valor : padrao);

/** [[valor, rótulo]] → <option>, com o atual já selecionado. */
export const opcoes = (lista, atual, { vazio: rotuloVazio } = {}) => html`
  ${rotuloVazio ? html`<option value="">${rotuloVazio}</option>` : ''}
  ${lista.map(([valor, rotulo]) => html`<option value="${valor}" ${String(valor) === String(atual ?? '') ? 'selected' : ''}>${rotulo}</option>`)}`;

export const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function seletorMes(mes) {
  return html`
    <div class="seletor-mes" role="group" aria-label="Mês">
      <button type="button" data-acao="mes-anterior" aria-label="Mês anterior">‹</button>
      <strong>${capitalizar(nomeDoMes(mes))}</strong>
      <button type="button" data-acao="mes-seguinte" aria-label="Mês seguinte">›</button>
    </div>`;
}

const selo = ([rotulo, tom]) => html`<span class="selo${tom ? ` selo--${tom}` : ''}">${rotulo}</span>`;

// ---------------------------------------------------------------------------
// Tarefas, prazos e intimações
// ---------------------------------------------------------------------------

const SITUACOES_TAREFA = {
  pendente: ['Pendente', ''],
  em_andamento: ['Em andamento', 'alerta'],
  concluida: ['Concluída', 'ok'],
  cancelada: ['Cancelada', 'escuro'],
};
export const seloTarefa = (s) => selo(SITUACOES_TAREFA[s] ?? [s, '']);

// O alerta de `v_tarefas` (ou de alertaTarefa): só aparece quando pede atenção.
const ALERTAS_TAREFA = {
  vencida: ['Fatal vencido', 'perigo'],
  fatal_hoje: ['Fatal hoje', 'perigo'],
  atrasada: ['Entrega atrasada', 'perigo'],
  entrega_hoje: ['Entrega hoje', 'alerta'],
};
export const seloAlertaTarefa = (s) => (ALERTAS_TAREFA[s] ? selo(ALERTAS_TAREFA[s]) : '');

const SITUACOES_INTIMACAO = {
  pendente: ['Pendente de conferência', 'alerta'],
  conferida: ['Conferida', 'ok'],
  arquivada: ['Arquivada', 'escuro'],
};
export const seloIntimacao = (s) => selo(SITUACOES_INTIMACAO[s] ?? [s, '']);

// ---------------------------------------------------------------------------
// Clientes e contatos
// ---------------------------------------------------------------------------

export const AREAS_JURIDICAS = {
  trabalhista: 'Trabalhista', previdenciario: 'Previdenciário', consumidor: 'Consumidor',
  civel: 'Cível', familia: 'Família', sucessoes: 'Sucessões', criminal: 'Criminal',
  contratual: 'Contratual', imobiliario: 'Imobiliário', empresarial: 'Empresarial',
  administrativo: 'Administrativo', portuario: 'Portuário', ambiental: 'Ambiental',
  regularizacao_fundiaria: 'Regularização fundiária', outro: 'Outro',
};

export const SITUACOES_CONTATO = {
  novo: 'Novo contato', em_atendimento: 'Em atendimento', contatado: 'Contatado',
  convertido: 'Convertido em cliente', arquivado: 'Arquivado',
};
export const CANAIS_CONTATO = {
  site: 'Site', whatsapp: 'WhatsApp', telefone: 'Telefone', presencial: 'Presencial',
  indicacao: 'Indicação', outro: 'Outro',
};
export const seloContato = (s) => selo([SITUACOES_CONTATO[s] ?? s,
  ({ novo: 'perigo', em_atendimento: 'alerta', convertido: 'ok', arquivado: 'escuro' })[s] ?? '']);

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

const SITUACOES_PARCELA = {
  a_vencer: ['A vencer', ''],
  vencida: ['Vencida', 'perigo'],
  paga: ['Paga', 'ok'],
  renegociada: ['Renegociada', 'escuro'],
  cancelada: ['Cancelada', 'escuro'],
};

export function seloParcela(situacao, parcial) {
  return html`${selo(SITUACOES_PARCELA[situacao] ?? [situacao, ''])}${parcial && ['a_vencer', 'vencida'].includes(situacao)
    ? html` ${selo(['Paga em parte', 'alerta'])}`
    : ''}`;
}

const SITUACOES_CONTRATO = {
  ativo: ['Ativo', ''],
  quitado: ['Quitado', 'ok'],
  a_apurar: ['Êxito a apurar', 'alerta'],
  cancelado: ['Cancelado', 'escuro'],
};
export const seloContrato = (s) => selo(SITUACOES_CONTRATO[s] ?? [s, '']);

const SITUACOES_CONTA = {
  a_pagar: ['A pagar', ''],
  vencida: ['Vencida', 'perigo'],
  paga: ['Paga', 'ok'],
  sem_valor: ['Falta o valor', 'alerta'],
  cancelada: ['Cancelada', 'escuro'],
};
export const seloConta = (s) => selo(SITUACOES_CONTA[s] ?? [s, '']);

export const TIPOS_HONORARIO = { fixo: 'Valor fixo', exito: 'Êxito' };

export const TIPOS_AVULSA = {
  consulta: 'Consulta',
  sucumbencia: 'Sucumbência',
  exito: 'Êxito',
  reembolso_custas: 'Reembolso de custas',
  outros: 'Outros',
};

export const CANAIS = { whatsapp: 'WhatsApp', telefone: 'Telefone', email: 'E-mail', presencial: 'Presencial', outro: 'Outro' };

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export const TIPOS_COMPROMISSO = {
  atendimento: 'Atendimento',
  audiencia: 'Audiência',
  bloqueio: 'Bloqueio',
  interno: 'Interno',
};

export const MODALIDADES = {
  atendimento: { presencial: 'Presencial', online: 'Online', retorno: 'Retorno' },
  audiencia: { presencial: 'Presencial', online: 'Online', hibrida: 'Híbrida' },
  bloqueio: { ausencia: 'Ausência', ferias: 'Férias', diligencia: 'Diligência' },
  interno: { presencial: 'Presencial', online: 'Online' },
};

export function rotuloTipo(tipo, modalidade) {
  const nome = TIPOS_COMPROMISSO[tipo] ?? tipo;
  const mod = MODALIDADES[tipo]?.[modalidade];
  return mod ? `${nome} · ${mod.toLowerCase()}` : nome;
}

const SITUACOES_COMPROMISSO = {
  agendado: ['Agendado', ''],
  realizado: ['Realizado', 'ok'],
  faltou: ['Faltou', 'perigo'],
  remarcado: ['Remarcado', 'alerta'],
};
export const seloCompromisso = (s) => selo(SITUACOES_COMPROMISSO[s] ?? [s, '']);

/** Exportação manual: só o usuário salva no Google e confere a disponibilidade. */
export const notaGoogle = () => html`
  <p class="nota">
    Use <strong>Pôr no Google Agenda</strong> no compromisso ou importe o arquivo <strong>.ics</strong>.
    Salve na agenda usada pelo link de agendamento e confira se ela verifica os horários ocupados.
    Alterações e cancelamentos posteriores precisam ser ajustados também no Google.
  </p>`;
