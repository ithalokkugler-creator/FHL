// Tradução entre compromisso do sistema e evento do Google Agenda.
// =================================================================
//
// Sem rede nem banco: o handler chama, os testes conferem.

export const FUSO = 'America/Sao_Paulo';
export const ENDERECO = 'Rua Dr. Leocádio, 282 — Centro, Paranaguá — PR';

const ROTULOS = {
  atendimento: { presencial: 'Atendimento presencial', online: 'Atendimento online', retorno: 'Retorno', '': 'Atendimento' },
  audiencia: { presencial: 'Audiência presencial', online: 'Audiência online', hibrida: 'Audiência híbrida', '': 'Audiência' },
  bloqueio: { ausencia: 'Ausência', ferias: 'Férias', diligencia: 'Diligência', '': 'Bloqueio' },
  interno: { presencial: 'Reunião interna', online: 'Reunião interna online', '': 'Reunião interna' },
};
export const rotulo = (tipo, modalidade) => ROTULOS[tipo]?.[modalidade ?? ''] ?? ROTULOS[tipo]?.[''] ?? 'Compromisso';

/** Evento criado pelo sistema: o id é "fl" + o id do compromisso (o Google
 *  aceita id escolhido por quem cria: letras a–v e dígitos). Repetir o envio
 *  não duplica. */
export const idDoEvento = (compromissoId) => `fl${String(compromissoId).replace(/-/g, '').toLowerCase()}`;

/** Dia (AAAA-MM-DD) de um instante, no horário de Brasília. */
export function diaEmBrasilia(instante) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(instante));
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

const quando = (instante, diaInteiro) => (diaInteiro
  ? { date: diaEmBrasilia(instante), dateTime: null, timeZone: null }
  : { date: null, dateTime: new Date(instante).toISOString(), timeZone: FUSO });

/**
 * Corpo do evento (insert ou patch) de um compromisso lançado aqui — o único
 * tipo de evento que o sistema escreve no Google. Particular vai como
 * "Ocupado", sem detalhes: a conta do Google é de todo o escritório.
 */
export function corpoDoEvento(p) {
  const local = p.local_ou_link || (p.tipo === 'atendimento' && p.modalidade !== 'online' ? ENDERECO : '');
  return {
    start: quando(p.inicio, p.dia_inteiro),
    end: quando(p.fim, p.dia_inteiro),
    visibility: p.particular ? 'private' : 'default',
    status: 'confirmed',
    summary: p.particular ? 'Ocupado' : (p.titulo || p.cliente_nome || rotulo(p.tipo, p.modalidade)),
    description: p.particular ? '' : `${[
      p.responsavel && `Responsável: ${p.responsavel}`,
      rotulo(p.tipo, p.modalidade),
      p.cliente_nome && `Cliente: ${p.cliente_nome}`,
      p.processo && `Processo: ${p.processo}`,
    ].filter(Boolean).join('\n')}\n\nLançado no sistema do escritório. Mudar horário ou excluir aqui também muda lá.`,
    location: p.particular ? '' : local,
    transparency: 'opaque',
    reminders: Number.isInteger(p.lembrete_minutos) && p.lembrete_minutos > 0
      ? { useDefault: false, overrides: [{ method: 'popup', minutes: p.lembrete_minutos }] }
      : { useDefault: true },
    extendedProperties: { private: { fl_compromisso: p.id } },
  };
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Descrição do Google vem em HTML simples; aqui vira texto. */
export function textoSimples(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (todo, nome) => ENTIDADES[nome] ?? todo)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const sem = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Reserva feita pelo cliente na página de agendamento: tem convidado de fora. */
const ehReserva = (ev) => (ev.attendees ?? []).some((a) => !a.self && !a.organizer && !a.resource);

/** Tipo e modalidade do compromisso que nasce de um evento do Google. */
export function tipoDoEvento(ev) {
  const titulo = sem(ev.summary);
  const texto = `${titulo}\n${sem(textoSimples(ev.description))}`;
  const online = Boolean(ev.hangoutLink || ev.conferenceData) || /\b(virtual|online|videochamada|meet)\b/.test(texto);
  if (ev.eventType === 'outOfOffice') return { tipo: 'bloqueio', modalidade: 'ausencia' };
  if (/audiencia/.test(titulo)) return { tipo: 'audiencia', modalidade: online ? 'online' : null };
  if (ev.start?.date) return { tipo: 'bloqueio', modalidade: null };
  if (ehReserva(ev) || /atendimento|consulta|retorno/.test(titulo)) {
    // Formulário da reserva: "Atendimento Presencial ou Virtual?" e a resposta.
    const resposta = /presencial ou virtual\?\s*\n?\s*(presencial|virtual|online)/.exec(texto)?.[1];
    const modalidade = resposta ? (resposta === 'presencial' ? 'presencial' : 'online') : online ? 'online' : null;
    return { tipo: 'atendimento', modalidade: /retorno/.test(titulo) && !resposta ? 'retorno' : modalidade };
  }
  return { tipo: 'interno', modalidade: online ? 'online' : null };
}

const IGNORADOS = new Set(['workingLocation', 'focusTime', 'birthday', 'fromGmail']);

/**
 * Evento do Google → o que o banco aplica (google_agenda_aplicar).
 * Nulo para o que não é compromisso (local de trabalho, aniversário…).
 */
export function lerEvento(ev) {
  if (!ev?.id || IGNORADOS.has(ev.eventType)) return null;
  const base = { id: ev.id, etag: ev.etag ?? null, atualizado_em: ev.updated ?? null };
  if (ev.status === 'cancelled') return { ...base, status: 'cancelled' };
  const diaInteiro = Boolean(ev.start?.date);
  const inicio = diaInteiro ? ev.start.date : ev.start?.dateTime;
  const fim = diaInteiro ? ev.end?.date : ev.end?.dateTime;
  if (!inicio || !fim) return null;
  const video = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || '';
  return {
    ...base,
    status: 'confirmed',
    titulo: (String(ev.summary ?? '').trim() || '(sem título)').slice(0, 200),
    inicio,
    fim,
    dia_inteiro: diaInteiro,
    local: String(ev.location || video || '').slice(0, 500),
    descricao: textoSimples(ev.description).slice(0, 4000),
    particular: ['private', 'confidential'].includes(ev.visibility),
    reserva: ehReserva(ev),
    ...tipoDoEvento(ev),
  };
}
