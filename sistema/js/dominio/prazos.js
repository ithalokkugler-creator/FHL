// Contagem de prazos processuais (preparação F5 §9.3) — SUGESTÃO.
// ===============================================================
//
// A data fatal que sai daqui é uma sugestão, com a memória dia a dia (o que
// contou, o que foi pulado e por quê). O campo continua editável e a
// conferência do advogado é obrigatória. Regras, a validar pelo Vinícius:
//
//   · dias ÚTEIS (CPC art. 219; CLT art. 775): não conta o dia da base;
//     conta só dias úteis a partir do primeiro útil seguinte;
//   · dias CORRIDOS (CPP art. 798): começa no primeiro dia útil depois da
//     base (Súmula 310 do STF) e conta seguidos; se o último cair em dia não
//     útil, passa para o próximo útil;
//   · HORAS: minuto a minuto a partir do instante da intimação (CC art. 132
//     §4º): fatal = base + N horas;
//   · RECESSO de 20/12 a 20/01, inclusive: o prazo não corre (CPC art. 220;
//     CLT art. 775-A; CPP art. 798-A, com exceções). Ligado por padrão;
//   · prazo em dias vence às 23:59 do último dia, em Brasília;
//   · DJEN: disponibilizada num dia, considera-se publicada no primeiro dia
//     útil seguinte (Lei 11.419/2006, art. 4º, §3º); a base do prazo é a
//     publicação.
//
// Arquivo puro: é testado em sistema/testes/ com os vetores do Apêndice C.

import { diaDaSemana, horaDoMinuto, instante, noFuso, somarDias } from '../nucleo/formato.js';

export const CONTAGEM_POR_AREA = { criminal: 'corridos' };
export const contagemDaArea = (area) => CONTAGEM_POR_AREA[area] ?? 'uteis';

/** 20/12 a 20/01, inclusive. */
export const ehRecesso = (iso) => {
  const md = iso.slice(5, 10);
  return md >= '12-20' || md <= '01-20';
};

const ehFimDeSemana = (iso) => [0, 6].includes(diaDaSemana(iso));
const nomeDe = (naoUteis, iso) => (naoUteis instanceof Map ? naoUteis.get(iso) : naoUteis?.has?.(iso) ? 'feriado' : null);

/** Por que o dia não conta — ou null, se é útil. */
function motivoNaoUtil(iso, naoUteis, recesso) {
  if (ehFimDeSemana(iso)) return diaDaSemana(iso) === 6 ? 'sábado' : 'domingo';
  const feriado = nomeDe(naoUteis, iso);
  if (feriado) return `feriado: ${feriado}`;
  if (recesso && ehRecesso(iso)) return 'recesso forense';
  return null;
}

export const ehDiaUtil = (iso, naoUteis, recesso = false) => !motivoNaoUtil(iso, naoUteis, recesso);

/** O primeiro dia útil DEPOIS de `iso`. */
export function proximoDiaUtil(iso, naoUteis, recesso = false) {
  let d = somarDias(iso, 1);
  for (let i = 0; i < 400 && !ehDiaUtil(d, naoUteis, recesso); i++) d = somarDias(d, 1);
  return d;
}

/** Disponibilizada no DJEN em `iso` → publicada no primeiro dia útil seguinte. */
export const dataDaPublicacao = (disponibilizacao, naoUteis) => proximoDiaUtil(disponibilizacao, naoUteis);

/**
 * @param {object} p
 * @param {string} p.base        dias: 'AAAA-MM-DD' (publicação/intimação); horas: instante ISO
 * @param {number} p.quantidade
 * @param {'uteis'|'corridos'|'horas'} p.contagem
 * @param {Map<string,string>|Set<string>} p.naoUteis  diasNaoUteis(...)
 * @param {boolean} [p.recesso]
 * @returns {{ fatal: string, fatalEm: string, inicio?: string, memoria: {dia, conta, motivo}[] }}
 *   fatal: 'AAAA-MM-DD' (dias) ou instante (horas); fatalEm: o instante (23:59 em Brasília, nos dias).
 */
export function calcularPrazo({ base, quantidade, contagem, naoUteis = new Map(), recesso = true }) {
  const n = Number(quantidade);
  if (!Number.isInteger(n) || n < 1 || n > 3650) throw new Error('Informe a quantidade, de 1 a 3650.');
  if (!base) throw new Error('Informe a data da publicação ou intimação.');

  if (contagem === 'horas') {
    const ms = Date.parse(base);
    if (!Number.isFinite(ms)) throw new Error('Informe a data e a hora da intimação.');
    const fim = noFuso(new Date(ms + n * 3_600_000).toISOString());
    const fatal = instante(fim.dia, horaDoMinuto(fim.minuto));
    return { fatal, fatalEm: fatal, memoria: [{ dia: fim.dia, conta: n, motivo: `${n} horas a partir da intimação` }] };
  }

  const dia = String(base).slice(0, 10);
  const memoria = [];

  if (contagem === 'uteis') {
    let d = dia;
    let conta = 0;
    while (conta < n) {
      d = somarDias(d, 1);
      const motivo = motivoNaoUtil(d, naoUteis, recesso);
      if (motivo) memoria.push({ dia: d, conta: null, motivo });
      else memoria.push({ dia: d, conta: ++conta, motivo: null });
    }
    const inicio = memoria.find((m) => m.conta === 1)?.dia;
    return { fatal: d, fatalEm: instante(d, '23:59'), inicio, memoria };
  }

  if (contagem === 'corridos') {
    // Começa no primeiro dia útil depois da base (Súmula 310 do STF).
    let d = dia;
    do {
      d = somarDias(d, 1);
      const motivo = motivoNaoUtil(d, naoUteis, recesso);
      if (!motivo) break;
      memoria.push({ dia: d, conta: null, motivo: `${motivo} — o prazo começa no primeiro dia útil` });
    } while (memoria.length < 400);
    const inicio = d;
    let conta = 0;
    for (;;) {
      if (recesso && ehRecesso(d)) memoria.push({ dia: d, conta: null, motivo: 'recesso forense' });
      else {
        memoria.push({ dia: d, conta: ++conta, motivo: null });
        if (conta === n) break;
      }
      d = somarDias(d, 1);
    }
    // Último dia em dia não útil: passa para o próximo útil.
    while (motivoNaoUtil(d, naoUteis, recesso)) {
      const motivo = motivoNaoUtil(d, naoUteis, recesso);
      memoria[memoria.length - 1].motivo = memoria[memoria.length - 1].motivo ?? `${motivo} — vence no próximo dia útil`;
      d = somarDias(d, 1);
      if (!motivoNaoUtil(d, naoUteis, recesso)) memoria.push({ dia: d, conta: null, motivo: 'prorrogado: primeiro dia útil' });
    }
    return { fatal: d, fatalEm: instante(d, '23:59'), inicio, memoria };
  }

  throw new Error('Escolha a contagem: dias úteis, dias corridos ou horas.');
}

/** A entrega interna: N dias úteis antes da data fatal. */
export function dataDeEntrega(fatal, diasUteisAntes, naoUteis, recesso = false) {
  let d = String(fatal).slice(0, 10);
  let faltam = Number(diasUteisAntes) || 0;
  while (faltam > 0) {
    d = somarDias(d, -1);
    if (ehDiaUtil(d, naoUteis, recesso)) faltam--;
  }
  return d;
}

/** Anos que uma contagem pode atravessar — para montar os dias não úteis. */
export const anosDaContagem = (base, quantidade, contagem) => {
  const ano = Number(String(base).slice(0, 4));
  const dias = contagem === 'horas' ? Math.ceil(quantidade / 24) : quantidade * 2 + 40;
  return Array.from({ length: Math.ceil(dias / 365) + 1 }, (_, i) => ano + i);
};
