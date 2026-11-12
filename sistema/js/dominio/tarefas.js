// Tarefas e prazos processuais informados à mão (F5, parte manual).
// ==================================================================
//
// Prazo é uma tarefa com data fatal. A contagem jurídica ainda não é feita
// pelo sistema: quem tem acesso a Prazos informa base, contagem, quantidade e
// fatal já conferidos. Aqui ficam só as regras de tela — quem pode mexer, que
// alerta mostrar e o filtro das listas.

import { diasEntre, fimDoMes, hoje, inicioDaSemana, inicioDoMes, noFuso, semAcento, somarDias } from '../nucleo/formato.js';

export const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
export const SITUACOES_TAREFA = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };

export const COLUNAS_TAREFA = 'id,tipo,titulo,ato,descricao,cliente_id,cliente_nome,processo_id,processo_numero,'
  + 'processo_titulo,tribunal,area,responsavel_id,prioridade,situacao,entrega,fatal_em,contagem,base_em,quantidade,'
  + 'recesso,concluida_em,concluida_por,compromisso_id,cancelado_em,motivo_cancelamento,criado_em,criado_por,'
  + 'alterado_em,alterado_por,alerta,motivo_reabertura,intimacao_id,processo_orgao,tempo_segundos,cronometros,periodos';

// ---------------------------------------------------------------------------
// Cronômetro da tarefa (12/11/2026)
// ---------------------------------------------------------------------------
// O tempo é a soma dos períodos (tarefas_tempos), com a hora do servidor.
// "Pausada" não existe no banco: é em andamento, com tempo e sem relógio.

/** O que a tela mostra: pendente, em andamento, pausada, concluída ou cancelada. */
export const SITUACOES_VISTAS = {
  pendente: 'Pendente', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
};

export const cronometrosDaTarefa = (t) => (Array.isArray(t?.cronometros) ? t.cronometros : []);

export function situacaoDaTarefa(t) {
  if (t.cancelado_em) return 'cancelada';
  if (t.situacao === 'concluida') return 'concluida';
  if (t.situacao === 'em_andamento' && !cronometrosDaTarefa(t).length && Number(t.tempo_segundos) > 0) return 'pausada';
  return t.situacao;
}

/** O relógio aberto desta pessoa nesta tarefa, ou null. */
export const meuCronometro = (t, eu) => cronometrosDaTarefa(t).find((c) => c.membro_id === eu) ?? null;

/** Segundos dedicados: os períodos fechados e os relógios abertos até `agora`. */
export function segundosDaTarefa(t, agora = Date.now()) {
  const abertos = cronometrosDaTarefa(t).reduce((soma, c) => soma + Math.max(0, (+agora - Date.parse(c.desde)) / 1000), 0);
  return Math.floor((Number(t.tempo_segundos) || 0) + abertos);
}

// ---------------------------------------------------------------------------
// Ordem da lista (12/11/2026): por prazo, responsável, situação ou criação.
// ---------------------------------------------------------------------------
export const ORDENS_TAREFA = [
  ['prazo', 'Prazo (mais próximo primeiro)'],
  ['-prazo', 'Prazo (mais distante primeiro)'],
  ['responsavel', 'Responsável'],
  ['situacao', 'Situação'],
  ['-criada', 'Criação (mais recente primeiro)'],
  ['criada', 'Criação (mais antiga primeiro)'],
];
export const lerOrdem = (v) => (ORDENS_TAREFA.some(([o]) => o === v) ? v : 'prazo');

/** A primeira data da tarefa (entrega ou fatal), com a hora quando é prazo em horas. */
function chaveDoPrazo(t) {
  const datas = [t.entrega && `${t.entrega}T23:59`];
  if (t.fatal_em) {
    const f = noFuso(t.fatal_em);
    datas.push(`${f.dia}T${String(Math.floor(f.minuto / 60)).padStart(2, '0')}:${String(f.minuto % 60).padStart(2, '0')}`);
  }
  return datas.filter(Boolean).sort()[0] ?? null;
}

const ORDEM_SITUACAO = { em_andamento: 0, pausada: 1, pendente: 2, concluida: 3, cancelada: 4 };

/**
 * Ordena uma cópia. `ordem`: 'prazo', 'responsavel', 'situacao', 'criada' e o
 * mesmo com '-' na frente para inverter. Sem data vai sempre para o fim; o
 * empate cai no prazo e depois no título.
 */
export function ordenarTarefas(lista, ordem = 'prazo', { nomeDe = (id) => id ?? '' } = {}) {
  const inverso = ordem.startsWith('-');
  const campo = ordem.replace(/^-/, '');
  const porPrazo = (a, b) => {
    const x = chaveDoPrazo(a);
    const y = chaveDoPrazo(b);
    if (x === y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y);
  };
  const porTitulo = (a, b) => String(a.titulo ?? '').localeCompare(String(b.titulo ?? ''), 'pt-BR');
  const comparar = {
    prazo: porPrazo,
    responsavel: (a, b) => String(nomeDe(a.responsavel_id)).localeCompare(String(nomeDe(b.responsavel_id)), 'pt-BR'),
    situacao: (a, b) => ORDEM_SITUACAO[situacaoDaTarefa(a)] - ORDEM_SITUACAO[situacaoDaTarefa(b)],
    criada: (a, b) => String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? '')),
  }[campo] ?? porPrazo;
  return [...lista].sort((a, b) => {
    const principal = comparar(a, b);
    if (principal) {
      // O prazo invertido mantém o "sem data" no fim.
      if (inverso && campo === 'prazo' && (!chaveDoPrazo(a) || !chaveDoPrazo(b))) return principal;
      return inverso ? -principal : principal;
    }
    return porPrazo(a, b) || porTitulo(a, b);
  });
}

/** Botões de concluir, editar e cancelar: autor, responsável ou administrador.
 *  O banco confere de novo (política "tarefas: alterar"). */
export const podeAlterarTarefa = (t, m) =>
  !t.cancelado_em && (m?.papel === 'admin' || t.criado_por === m?.id || t.responsavel_id === m?.id);

/** O mesmo cálculo de `v_tarefas.alerta`, para quando a tela já tem a linha. */
export function alertaTarefa(t, agora = new Date()) {
  const dia = hoje(agora);
  if (t.cancelado_em) return 'cancelada';
  if (t.situacao === 'concluida') return 'concluida';
  if (t.fatal_em && Date.parse(t.fatal_em) < +agora) return 'vencida';
  if (t.fatal_em && noFuso(t.fatal_em).dia === dia) return 'fatal_hoje';
  if (t.entrega && t.entrega < dia) return 'atrasada';
  return t.entrega === dia ? 'entrega_hoje' : 'em_dia';
}

// A cor da tarefa conforme a data se aproxima (pedido do escritório, 08/10/2026):
// faltando uma semana, amarelo; faltando dois dias, vermelho.
export const DIAS_AMARELO = 7;
export const DIAS_VERMELHO = 2;

/**
 * Quanto falta para a primeira data da tarefa — a entrega interna ou o fatal,
 * a que vier antes — e a cor que isso dá. Atrasada ou com fatal vencido é
 * sempre vermelha; concluída, cancelada ou sem data não tem cor.
 * `{ nivel: 'vermelho' | 'amarelo' | null, dias, dia, vencida }`
 */
export function urgenciaTarefa(t, agora = new Date()) {
  if (t.cancelado_em || t.situacao === 'concluida') return null;
  const datas = [t.entrega, t.fatal_em && noFuso(t.fatal_em).dia].filter(Boolean).sort();
  if (!datas.length) return null;

  const dia = datas[0];
  const dias = diasEntre(hoje(agora), dia);
  // Prazo em horas vence no meio do dia: passou da hora, já está vencido.
  const vencida = dias < 0 || Boolean(t.fatal_em && Date.parse(t.fatal_em) < +agora);
  const nivel = vencida || dias <= DIAS_VERMELHO ? 'vermelho' : dias <= DIAS_AMARELO ? 'amarelo' : null;
  return { nivel, dias, dia, vencida };
}

/**
 * O que a etiqueta da data diz: "Entrega hoje", "Fatal em 3 dias",
 * "Entrega atrasada há 2 dias", "Vence em 5 h". Fala da data que vem
 * primeiro — a mesma que decide a cor (urgenciaTarefa); no empate, do fatal.
 */
export function prazoRestante(t, agora = new Date()) {
  const u = urgenciaTarefa(t, agora);
  if (!u) return '';
  if (t.fatal_em && Date.parse(t.fatal_em) < +agora) return 'Fatal vencido';

  const fatal = Boolean(t.fatal_em) && noFuso(t.fatal_em).dia === u.dia;
  if (fatal && t.contagem === 'horas') {
    return `Vence em ${Math.max(1, Math.ceil((Date.parse(t.fatal_em) - +agora) / 3600000))} h`;
  }
  const qual = fatal ? 'Fatal' : 'Entrega';
  if (u.dias < 0) return `${qual} atrasada há ${-u.dias} ${u.dias === -1 ? 'dia' : 'dias'}`;
  if (u.dias === 0) return `${qual} hoje`;
  return u.dias === 1 ? `${qual} amanhã` : `${qual} em ${u.dias} dias`;
}

/** Período do resumo de Prazos: hoje, semana, mês, ano ou tudo em aberto. */
export function periodoPrazos(aba, dia = hoje()) {
  if (aba === 'hoje') return { de: dia, ate: dia };
  if (aba === 'semana') {
    const de = inicioDaSemana(dia);
    return { de, ate: somarDias(de, 6) };
  }
  if (aba === 'mes') return { de: inicioDoMes(dia), ate: fimDoMes(dia) };
  if (aba === 'ano') return { de: `${dia.slice(0, 4)}-01-01`, ate: `${dia.slice(0, 4)}-12-31` };
  return { de: '', ate: '' };
}

/** O dia que conta para o período: a data fatal (em Brasília) ou a entrega. */
export const diaDaTarefa = (t) => (t.fatal_em ? noFuso(t.fatal_em).dia : t.entrega);

/**
 * Lista de Tarefas e de Prazos. Sem situação escolhida, mostra só as abertas.
 * A ordem é a da data que vence primeiro; sem data, vai para o fim.
 */
export function filtrarTarefas(lista, f, eu) {
  const busca = semAcento(f.busca ?? '').toLowerCase();
  const abertas = !f.situacao || f.situacao === 'abertas';

  return lista
    .filter((t) => {
      if (f.visao === 'minhas' && t.responsavel_id !== eu) return false;
      if (f.visao === 'deleguei' && t.criado_por !== eu) return false;
      if (f.cliente && t.cliente_id !== f.cliente) return false;
      if (f.responsavel && t.responsavel_id !== f.responsavel) return false;
      if (f.prioridade && t.prioridade !== f.prioridade) return false;

      const situacao = situacaoDaTarefa(t);
      if (abertas && (t.cancelado_em || t.situacao === 'concluida')) return false;
      if (!abertas && f.situacao !== 'todos' && situacao !== f.situacao) return false;
      if (f.soPrazos && t.tipo !== 'prazo') return false;

      const dia = diaDaTarefa(t);
      if ((f.de || f.ate) && (!dia || (f.de && dia < f.de) || (f.ate && dia > f.ate))) return false;

      return !busca || semAcento([t.titulo, t.ato, t.cliente_nome, t.processo_numero, t.processo_titulo, t.processo_orgao, t.descricao].join(' '))
        .toLowerCase().includes(busca);
    })
    .sort((a, b) => (a.fatal_em || a.entrega || 'z').localeCompare(b.fatal_em || b.entrega || 'z')
      || a.titulo.localeCompare(b.titulo));
}
