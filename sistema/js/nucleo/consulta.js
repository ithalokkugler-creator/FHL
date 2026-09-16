// Monta a query string da Data API (PostgREST).
//
//   montarConsulta({
//     select: 'id,nome',
//     filtros: [['situacao', 'in', ['a_vencer', 'vencida']], ['vencimento', 'lte', '2026-09-30']],
//     ordem: 'vencimento.asc',
//     limite: 100,
//   })
//
// Filtros se somam (E), inclusive sobre a mesma coluna. Para OU:
// ['or', '(nome.ilike.*ana*,documento.ilike.*123*)'].
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

export function montarConsulta({ select, filtros = [], ordem, limite, deslocamento } = {}) {
  const params = [];
  if (select) params.push(['select', select]);

  for (const filtro of filtros) {
    if (filtro[0] === 'or' || filtro[0] === 'and') {
      params.push([filtro[0], filtro[1]]);
      continue;
    }
    const [coluna, operador, valor] = filtro;
    params.push([coluna, `${operador}.${valorDoFiltro(operador, valor)}`]);
  }

  if (ordem) params.push(['order', ordem]);
  if (limite != null) params.push(['limit', String(limite)]);
  if (deslocamento != null) params.push(['offset', String(deslocamento)]);
  return params;
}

export function valorDoFiltro(operador, valor) {
  if (operador === 'in' || operador === 'not.in') {
    return `(${valor.map(entreAspas).join(',')})`;
  }
  if (valor === null) return 'null';
  return String(valor);
}

// Aspas protegem vírgula, parêntese e ponto dentro de um item da lista.
const entreAspas = (v) => `"${String(v).replace(/["\\]/g, (c) => `\\${c}`)}"`;

/** Texto digitado → padrão de ilike. Tira os caracteres que a sintaxe do
 *  PostgREST usa (vírgula, parêntese, ponto, curinga), para a busca não
 *  virar outro filtro. Espaços viram curinga: "maria silva" acha
 *  "Maria da Silva". */
export function termoDeBusca(texto) {
  const limpo = String(texto ?? '')
    .trim()
    .replace(/[*%,()."\\:]/g, ' ')
    .trim()
    .replace(/\s+/g, '*');
  return limpo ? `*${limpo}*` : null;
}
