// Cálculos da agenda: posição dos compromissos na grade e conflito de horário.
// ============================================================================
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

/** Compromissos que se sobrepõem ficam lado a lado. Recebe [{ inicio, fim }]
 *  em minutos do dia e acrescenta a cada um `coluna` (a sua) e `colunas`
 *  (quantas o grupo dele ocupa). Devolve a lista ordenada. */
export function distribuirColunas(itens) {
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  let grupo = [];
  let colunas = [];
  let fimDoGrupo = -Infinity;

  const fecharGrupo = () => {
    for (const item of grupo) item.colunas = colunas.length;
    grupo = [];
    colunas = [];
    fimDoGrupo = -Infinity;
  };

  for (const item of ordenados) {
    if (grupo.length && item.inicio >= fimDoGrupo) fecharGrupo();
    let coluna = colunas.findIndex((fim) => fim <= item.inicio);
    if (coluna === -1) {
      coluna = colunas.length;
      colunas.push(item.fim);
    } else {
      colunas[coluna] = item.fim;
    }
    item.coluna = coluna;
    grupo.push(item);
    fimDoGrupo = Math.max(fimDoGrupo, item.fim);
  }
  if (grupo.length) fecharGrupo();
  return ordenados;
}

/** Compromissos do mesmo responsável que batem com o candidato, e os que
 *  ficam mais perto do que o intervalo mínimo entre atendimentos (7.7).
 *  Instantes em milissegundos. */
export function conflitos(candidato, existentes, intervaloMinutos = 0) {
  const margem = intervaloMinutos * 60_000;
  const mesmos = existentes.filter((e) => e.membro_id === candidato.membro_id && e.id !== candidato.id);
  const sobrepostos = mesmos.filter((e) => e.inicio < candidato.fim && e.fim > candidato.inicio);
  const colados = margem
    ? mesmos.filter((e) => !sobrepostos.includes(e)
      && e.inicio < candidato.fim + margem
      && e.fim > candidato.inicio - margem)
    : [];
  return { sobrepostos, colados };
}
