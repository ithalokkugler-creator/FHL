// O que avisar agora (pedido de 12/11/2026): a conta, sem tela.
// ==============================================================
//
// "Notificações de tarefas e compromissos no cantinho da tela ou na barra de
// notificações do computador." Com o sistema aberto em alguma aba, a cada
// meio minuto:
//   · cada lembrete dos MEUS compromissos (o do particular alheio nunca),
//     quando chega a hora dele. Se vários venceram juntos (o sistema estava
//     fechado), sai um aviso só — o mais perto do início — e os outros ficam
//     marcados como dados;
//   · prazo em horas: 2 horas e 30 minutos antes;
//   · uma vez por dia, a partir das 7h, o resumo das minhas tarefas para hoje
//     e atrasadas.
// "Avisa, não envia" (CLAUDE.md §4): nada sai para fora do computador.

import { dataCurta, diasEntre, hora, instante, noFuso } from '../nucleo/formato.js';
import { descreverLembrete, lembretesDe } from './lembretes.js';
import { alertaTarefa } from './tarefas.js';

const MINUTO = 60_000;
const DEPOIS_DO_INICIO = 10 * MINUTO; // lembrete "na hora" ainda vale até 10 min depois
const HORA_DO_RESUMO = 7 * 60;
const AVISOS_DO_PRAZO_EM_HORAS = [120, 30];
const ROTULOS = { atendimento: 'Atendimento', audiencia: 'Audiência', bloqueio: 'Bloqueio', interno: 'Reunião interna' };

/** "hoje às 14:30", "amanhã às 09:00", "em 5 dias (17/11) às 14:30". */
export function quandoFalta(inicio, agora) {
  const dia = noFuso(inicio).dia;
  const hojeDia = noFuso(agora).dia;
  const dias = diasEntre(hojeDia, dia);
  const as = `às ${hora(inicio)}`;
  if (dias <= 0) return Date.parse(inicio) <= +agora ? `começou ${as}` : `hoje ${as}`;
  if (dias === 1) return `amanhã ${as}`;
  return `em ${dias} dias (${dataCurta(dia)}) ${as}`;
}

/**
 * @param {object} p
 * @param {Date|number} p.agora
 * @param {string} p.eu                      membro de quem está usando
 * @param {object[]} [p.compromissos]        de agenda_periodo
 * @param {object[]} [p.tarefas]             minhas tarefas abertas (v_tarefas)
 * @param {Record<string, number>} [p.avisadas]  chave → quando foi avisada
 * @returns {{ chave: string, marcar: string[], titulo: string, texto: string, href: string, tipo: string, ate: number }[]}
 */
export function avisosDevidos({ agora = Date.now(), eu, compromissos = [], tarefas = [], avisadas = {} }) {
  const ms = +agora;
  const avisos = [];
  const ja = (chave) => Boolean(avisadas[chave]);

  for (const c of compromissos) {
    if (c.membro_id !== eu || c.mascarado || c.cancelado_em || (c.situacao && c.situacao !== 'agendado')) continue;
    const inicio = Date.parse(c.inicio);
    if (!Number.isFinite(inicio)) continue;
    const devidos = lembretesDe(c).filter((m) => inicio - m * MINUTO <= ms && ms < inicio + (m === 0 ? DEPOIS_DO_INICIO : 0));
    if (!devidos.length) continue;
    const chaves = devidos.map((m) => `c:${c.id}:${m}:${c.inicio}`);
    if (chaves.every(ja)) continue;
    const maisPerto = Math.min(...devidos);
    const nome = c.titulo || c.cliente_nome || ROTULOS[c.tipo] || 'Compromisso';
    avisos.push({
      tipo: 'compromisso',
      chave: `c:${c.id}:${maisPerto}:${c.inicio}`,
      marcar: chaves,
      titulo: `${ROTULOS[c.tipo] ?? 'Compromisso'}: ${nome}`,
      texto: `${quandoFalta(c.inicio, ms)}${c.local_ou_link ? ` · ${c.local_ou_link}` : ''} · lembrete de ${descreverLembrete(maisPerto)}${maisPerto ? ' antes' : ''}`,
      href: `#/agenda?dia=${noFuso(c.inicio).dia}`,
      // Na tela até ser dispensado, ou até 10 minutos depois do início.
      ate: inicio + DEPOIS_DO_INICIO,
    });
  }

  const minhas = tarefas.filter((t) => t.responsavel_id === eu && !t.cancelado_em && t.situacao !== 'concluida');
  for (const t of minhas) {
    if (t.contagem !== 'horas' || !t.fatal_em) continue;
    const fatal = Date.parse(t.fatal_em);
    const devidos = AVISOS_DO_PRAZO_EM_HORAS.filter((m) => fatal - m * MINUTO <= ms && ms < fatal);
    if (!devidos.length) continue;
    const chaves = devidos.map((m) => `t:${t.id}:${m}:${t.fatal_em}`);
    if (chaves.every(ja)) continue;
    avisos.push({
      tipo: 'prazo',
      chave: chaves.at(-1),
      marcar: chaves,
      titulo: `Prazo em horas: ${t.titulo}`,
      texto: `Vence hoje às ${hora(t.fatal_em)}${t.cliente_nome ? ` · ${t.cliente_nome}` : ''}`,
      href: `#/tarefas?visao=minhas&busca=${encodeURIComponent(t.titulo)}`,
      ate: fatal,
    });
  }

  // O resumo do dia: uma vez, a partir das 7h (de Brasília).
  const agoraNoFuso = noFuso(ms);
  const chaveResumo = `resumo:${eu}:${agoraNoFuso.dia}`;
  if (agoraNoFuso.minuto >= HORA_DO_RESUMO && !ja(chaveResumo)) {
    const alertas = minhas.map((t) => alertaTarefa(t, new Date(ms)));
    const atrasadas = alertas.filter((a) => a === 'vencida' || a === 'atrasada').length;
    const hoje = alertas.filter((a) => a === 'fatal_hoje' || a === 'entrega_hoje').length;
    if (atrasadas || hoje) {
      const partes = [
        hoje ? `${hoje} para hoje` : '',
        atrasadas ? `${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}` : '',
      ].filter(Boolean);
      avisos.push({
        tipo: 'resumo',
        chave: chaveResumo,
        marcar: [chaveResumo],
        titulo: `Suas tarefas: ${partes.join(' e ')}`,
        texto: 'Abra Tarefas para ver o que vence primeiro.',
        href: '#/tarefas?visao=minhas',
        ate: Date.parse(instante(agoraNoFuso.dia, '23:59')),
      });
    }
  }
  return avisos;
}

/** Tira do registro o que já passou (mais de 15 dias). */
export function limparAvisadas(avisadas, agora = Date.now()) {
  const limite = +agora - 15 * 24 * 60 * MINUTO;
  return Object.fromEntries(Object.entries(avisadas ?? {}).filter(([, quando]) => Number(quando) > limite));
}
