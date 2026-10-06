// RFC 5545: texto escapado, CRLF e linhas de até 75 octetos UTF-8.
import { FUSO, noFuso } from '../nucleo/formato.js';
import { ENDERECO, CIDADE } from '../escritorio.js';

export const escaparIcs = (texto) => String(texto ?? '').replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

export function dobrarLinha(linha) {
  if (/[\r\n]/.test(linha)) throw new Error('Uma linha iCalendar não pode conter quebra sem escape.');
  const utf8 = new TextEncoder();
  let saida = '', tamanho = 0;
  for (const caractere of linha) {
    const bytes = utf8.encode(caractere).length;
    if (tamanho + bytes > 75) { saida += '\r\n '; tamanho = 1; }
    saida += caractere;
    tamanho += bytes;
  }
  return saida;
}

const utc = (instante) => {
  if (!Number.isFinite(Date.parse(instante))) throw new Error('Confira as datas do compromisso.');
  return new Date(instante).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

/** DTO recebido de agenda_periodo; mascarados são saneados antes de qualquer exportação. */
function evento(c) {
  if (!/^[a-z0-9_-]+$/i.test(c.id ?? '') || !(Date.parse(c.fim) > Date.parse(c.inicio))) throw new Error('Confira o compromisso a exportar.');
  const datas = c.dia_inteiro
    ? [noFuso(c.inicio).dia.replaceAll('-', ''), noFuso(c.fim).dia.replaceAll('-', '')]
    : [utc(c.inicio), utc(c.fim)];
  if (c.dia_inteiro && datas[1] <= datas[0]) throw new Error('Confira o período de dias inteiros.');
  if (c.mascarado) return { datas, titulo: 'Ocupado', local: '', descricao: '' };
  return {
    datas,
    titulo: c.titulo || c.cliente_nome || c.tipo_nome || 'Compromisso',
    local: c.local_ou_link || (c.tipo === 'atendimento' && c.modalidade !== 'online' ? `${ENDERECO}, ${CIDADE}` : ''),
    descricao: [c.responsavel_nome && `Responsável: ${c.responsavel_nome}`, c.tipo_nome,
      c.cliente_nome && `Cliente: ${c.cliente_nome}`, c.processo && `Processo: ${c.processo}`].filter(Boolean).join('\n'),
  };
}

export function gerarIcs(compromissos, { nome = 'FHL Advocacia', agora = new Date() } = {}) {
  const carimbo = utc(agora.toISOString());
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FHL Advocacia//Agenda//PT-BR',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escaparIcs(nome)}`];
  const ids = new Set();
  for (const c of compromissos) {
    if (c.cancelado_em || ids.has(c.id)) continue;
    const e = evento(c), tipoData = c.dia_inteiro ? ';VALUE=DATE' : '';
    ids.add(c.id);
    linhas.push('BEGIN:VEVENT', `UID:${c.id}@fhl-advocacia`, `DTSTAMP:${carimbo}`,
      `DTSTART${tipoData}:${e.datas[0]}`, `DTEND${tipoData}:${e.datas[1]}`,
      `SUMMARY:${escaparIcs(e.titulo)}`, `LOCATION:${escaparIcs(e.local)}`, `DESCRIPTION:${escaparIcs(e.descricao)}`,
      'TRANSP:OPAQUE', 'STATUS:CONFIRMED', `CLASS:${c.particular || c.mascarado ? 'PRIVATE' : 'PUBLIC'}`);
    if (!c.mascarado && Number.isInteger(c.lembrete_minutos) && c.lembrete_minutos > 0) {
      linhas.push('BEGIN:VALARM', `TRIGGER:-PT${c.lembrete_minutos}M`, 'ACTION:DISPLAY',
        `DESCRIPTION:${escaparIcs(e.titulo)}`, 'END:VALARM');
    }
    linhas.push('END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n';
}

export function linkGoogleAgenda(c) {
  if (c.mascarado || c.cancelado_em) return null;
  const e = evento(c), url = new URL('https://calendar.google.com/calendar/render');
  for (const [chave, valor] of Object.entries({ action: 'TEMPLATE', text: e.titulo,
    dates: e.datas.join('/'), details: e.descricao, location: e.local, ctz: FUSO })) url.searchParams.set(chave, valor);
  return url.href;
}
