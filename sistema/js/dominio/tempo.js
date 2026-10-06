// Atualizações e o tempo gasto com cada cliente (F4).
// ===================================================
//
// O relógio de verdade é o do servidor (iniciar_cronometro/parar_cronometro).
// Aqui só se soma e se valida o que vai para o banco num lançamento à mão.

import { instante } from '../nucleo/formato.js';

export const TIPOS_ATUALIZACAO = {
  atendimento_presencial: 'Atendimento presencial',
  atendimento_online: 'Atendimento online',
  telefone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  reuniao: 'Reunião',
  peca: 'Peça',
  pesquisa: 'Pesquisa',
  audiencia: 'Audiência',
  diligencia: 'Diligência',
  outro: 'Outro',
};

export const COLUNAS_ATUALIZACAO = 'id,cliente_id,processo_id,membro_id,participantes,tipo,inicio,fim,cronometrado,'
  + 'relato,proxima_providencia,compromisso_id,cancelado_em,cancelado_por,motivo_cancelamento,criado_em,criado_por,alterado_em';

/** Minutos de uma atividade. Cronômetro aberto conta até `agora`; cancelada, zero. */
export function minutosDe(a, agora = new Date().toISOString()) {
  if (a.cancelado_em) return 0;
  const ms = Date.parse(a.fim ?? agora) - Date.parse(a.inicio);
  return Number.isFinite(ms) ? Math.max(0, ms / 60000) : 0;
}

/**
 * Totais de uma lista de atividades. Ficam de fora as canceladas e os
 * cronômetros ainda rodando — os mesmos critérios do relatório para o
 * cliente, para o total da tela bater com o do papel. `rodando` conta os
 * abertos, que a tela mostra à parte.
 *
 * Cada participante recebe o tempo inteiro da atividade em `porMembro`; o
 * total do cliente conta a atividade uma vez só.
 */
export function totais(lista) {
  const t = { total: 0, cronometrado: 0, manual: 0, porMembro: {}, rodando: 0 };
  for (const a of lista) {
    if (a.cancelado_em) continue;
    if (!a.fim) {
      t.rodando += 1;
      continue;
    }
    const n = minutosDe(a);
    t.total += n;
    t[a.cronometrado ? 'cronometrado' : 'manual'] += n;
    for (const id of new Set([a.membro_id, ...(a.participantes ?? [])].filter(Boolean))) {
      t.porMembro[id] = (t.porMembro[id] ?? 0) + n;
    }
  }
  return t;
}

const diaValido = (dia) => /^\d{4}-\d{2}-\d{2}$/.test(dia ?? '')
  && Number.isFinite(Date.parse(`${dia}T00:00:00Z`))
  && new Date(`${dia}T00:00:00Z`).toISOString().slice(0, 10) === dia;
const horaValida = (hora) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora ?? '');

/** Formulário "Lançar atualização" → linha de `atualizacoes`. */
export function prepararAtualizacao(d, membroId) {
  if (!d.cliente_id) throw new Error('Escolha um cliente.');
  if (!TIPOS_ATUALIZACAO[d.tipo]) throw new Error('Escolha o tipo de atividade.');

  const diaFim = d.dia_fim || d.dia;
  if (!diaValido(d.dia) || !horaValida(d.hora_inicio)
    || (!d.sem_tempo && (!diaValido(diaFim) || !horaValida(d.hora_fim)))) {
    throw new Error('Informe dia e horários válidos.');
  }

  // "Sem tempo, só anotação": fim igual ao início, duração zero.
  const inicio = instante(d.dia, d.hora_inicio);
  const fim = d.sem_tempo ? inicio : instante(diaFim, d.hora_fim);
  if (!(Date.parse(fim) >= Date.parse(inicio))) throw new Error('O fim precisa ser igual ou posterior ao início.');

  const participantes = [...new Set(d.participantes ?? [])];
  if (participantes.includes(membroId)) throw new Error('Quem lançou não deve ser repetido entre os participantes.');

  return {
    cliente_id: d.cliente_id,
    processo_id: d.processo_id || null,
    membro_id: membroId,
    participantes,
    tipo: d.tipo,
    inicio,
    fim,
    relato: d.relato?.trim() || null,
    proxima_providencia: d.proxima_providencia?.trim() || null,
  };
}

/** Filtros da linha do tempo. "Quem" encontra também quem participou. */
export function filtrarAtualizacoes(lista, f) {
  return lista.filter((a) => {
    if (f.cliente && a.cliente_id !== f.cliente) return false;
    if (f.processo && a.processo_id !== f.processo) return false;
    if (f.quem && a.membro_id !== f.quem && !a.participantes?.includes(f.quem)) return false;
    if (f.tipo && a.tipo !== f.tipo) return false;
    if (f.situacao === 'todos') return true;
    return f.situacao === 'cancelados' ? Boolean(a.cancelado_em) : !a.cancelado_em;
  });
}
