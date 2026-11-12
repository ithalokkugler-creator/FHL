// Lembretes dos compromissos (pedido de 12/11/2026).
// ===================================================
//
// "Ao cadastrar uma audiência, selecionar quatro lembretes ao mesmo tempo:
// 1 semana, 1 dia, 1 hora e 10 minutos antes — e editar ou excluir cada um
// sem que um novo substitua os anteriores." Até 5 por compromisso, de 0 a
// 40320 minutos (4 semanas): os limites do Google Agenda, para onde eles
// vão quando a agenda está ligada. O banco confere de novo
// (privado.lembretes_validos).

export const MAXIMO_LEMBRETES = 5;
export const LIMITE_MINUTOS = 40320;

/** [valor, rótulo, minutos por unidade] */
export const UNIDADES_LEMBRETE = [
  ['minutos', 'minutos', 1],
  ['horas', 'horas', 60],
  ['dias', 'dias', 1440],
  ['semanas', 'semanas', 10080],
];
const POR_UNIDADE = Object.fromEntries(UNIDADES_LEMBRETE.map(([v, , m]) => [v, m]));

/** Atalhos de um clique: o exemplo do pedido. */
export const ATALHOS_LEMBRETE = [[10080, '1 semana'], [1440, '1 dia'], [60, '1 hora'], [10, '10 min']];

/** Minutos → a maior unidade exata: 10080 → 1 semana; 90 → 90 minutos. */
export function emUnidade(minutos) {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  for (const [unidade, , fator] of [...UNIDADES_LEMBRETE].reverse()) {
    if (m && m % fator === 0) return { quantidade: m / fator, unidade };
  }
  return { quantidade: m, unidade: 'minutos' };
}

export function paraMinutos(quantidade, unidade) {
  const fator = POR_UNIDADE[unidade];
  const texto = String(quantidade ?? '').trim();
  if (!texto) return null;
  const n = Number(texto.replace(',', '.'));
  if (!fator || !Number.isInteger(n) || n < 0) return null;
  return n * fator;
}

const SINGULAR = { minutos: 'minuto', horas: 'hora', dias: 'dia', semanas: 'semana' };

/** As unidades no singular ou no plural, conforme a quantidade ("1 semana", "2 semanas"). */
export const unidadesPara = (quantidade) => UNIDADES_LEMBRETE.map(([v, plural]) => [v, Number(quantidade) === 1 ? SINGULAR[v] : plural]);

/** 10 → "10 minutos"; 60 → "1 hora"; 0 → "na hora". */
export function descreverLembrete(minutos) {
  if (!minutos) return 'na hora';
  const { quantidade, unidade } = emUnidade(minutos);
  return `${quantidade} ${quantidade === 1 ? SINGULAR[unidade] : unidade}`;
}

/** [10080, 1440, 60, 10] → "1 semana, 1 dia, 1 hora e 10 minutos antes". */
export function descreverLembretes(lista) {
  const ordem = ordenarLembretes(lista);
  if (!ordem.length) return 'Sem lembrete';
  const antes = ordem.filter((m) => m > 0).map(descreverLembrete);
  const partes = antes.length ? [`${antes.length > 1 ? `${antes.slice(0, -1).join(', ')} e ${antes.at(-1)}` : antes[0]} antes`] : [];
  if (ordem.includes(0)) partes.push('na hora');
  return partes.join(' e ');
}

/** Do mais longe ao mais perto do início, sem repetir. */
export const ordenarLembretes = (lista) => [...new Set((lista ?? []).map(Number).filter(Number.isInteger))].sort((a, b) => b - a);

/** Os lembretes de um compromisso: a lista nova ou, de um registro antigo, o único. */
export function lembretesDe(c) {
  if (Array.isArray(c?.lembretes) && c.lembretes.length) return ordenarLembretes(c.lembretes);
  return Number(c?.lembrete_minutos) > 0 ? [Number(c.lembrete_minutos)] : [];
}

/**
 * Confere o que veio do formulário: [{ quantidade, unidade }] → minutos, em
 * ordem. Erro em português, com o índice da linha que está errada.
 */
export function lerLembretes(linhas) {
  const minutos = [];
  linhas.forEach((l, i) => {
    const m = paraMinutos(l.quantidade, l.unidade);
    if (m == null) throw Object.assign(new Error(`Lembrete ${i + 1}: informe quanto tempo antes (um número inteiro, 0 = na hora).`), { linha: i });
    if (m > LIMITE_MINUTOS) throw Object.assign(new Error(`Lembrete ${i + 1}: no máximo 4 semanas antes.`), { linha: i });
    if (minutos.includes(m)) throw Object.assign(new Error(`Lembrete ${i + 1} repete outro (${descreverLembrete(m)}).`), { linha: i });
    minutos.push(m);
  });
  if (minutos.length > MAXIMO_LEMBRETES) throw new Error(`Use no máximo ${MAXIMO_LEMBRETES} lembretes.`);
  return ordenarLembretes(minutos);
}
