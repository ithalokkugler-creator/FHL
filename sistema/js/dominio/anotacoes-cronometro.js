// Uma fila por diálogo: autosave, Salvar e Fechar respeitam a mesma versão.
export const textosDaAtividade = (a) => ({ relato: a.relato ?? '', proxima_providencia: a.proxima_providencia ?? '' });
const limpar = (v) => String(v ?? '').trim() || null;

export function camposDasAnotacoes(antes, depois) {
  return Object.fromEntries(['relato', 'proxima_providencia']
    .filter((c) => limpar(antes[c]) !== limpar(depois[c]))
    .map((c) => [c, limpar(depois[c])]));
}

export function criarGravadorAnotacoes(atividade, salvar) {
  let salvo = textosDaAtividade(atividade);
  let versao = atividade.alterado_em ?? null;
  let fila = Promise.resolve();
  return (textos) => {
    const fotografia = { ...textos };
    const operacao = fila.catch(() => {}).then(async () => {
      const campos = camposDasAnotacoes(salvo, fotografia);
      if (!Object.keys(campos).length) return false;
      const registro = await salvar({ versao, campos });
      versao = registro.alterado_em;
      salvo = fotografia;
      return true;
    });
    fila = operacao;
    return operacao;
  };
}
