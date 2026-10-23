// A página contém pagamentos inteiros: as antecipações acompanham sua origem.
// O conjunto completo continua disponível para recibos, estorno e conferência.
export function paginarRecebimentos(recebimentos, parcelas, pagina = 1, porPagina = 100) {
  const ids = new Set(recebimentos.map((r) => r.id));
  const vencimentos = new Map(parcelas.map((p) => [p.id, p.vencimento]));
  const filhos = new Map();
  for (const r of recebimentos) {
    if (!r.antecipacao_de) continue;
    if (!filhos.has(r.antecipacao_de)) filhos.set(r.antecipacao_de, []);
    filhos.get(r.antecipacao_de).push(r);
  }
  const pagamentos = recebimentos.filter((r) => !r.antecipacao_de || !ids.has(r.antecipacao_de));
  const paginas = Math.max(1, Math.ceil(pagamentos.length / porPagina));
  const atual = Math.min(paginas, Math.max(1, Math.trunc(Number(pagina)) || 1));
  const linhas = pagamentos.slice((atual - 1) * porPagina, atual * porPagina).flatMap((r) => [r,
    ...(filhos.get(r.id) ?? []).sort((a, b) => (vencimentos.get(b.parcela_id) ?? '').localeCompare(vencimentos.get(a.parcela_id) ?? '')
      || b.parcela_numero - a.parcela_numero || a.id.localeCompare(b.id)),
  ]);
  return { pagina: atual, paginas, total: pagamentos.length, linhas };
}
