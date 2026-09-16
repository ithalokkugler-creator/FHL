// Rotas por fragmento: #/financeiro/contratos/<id>?situacao=vencida
// ==================================================================
//
// Com o endereço no fragmento, a hospedagem serve sempre o mesmo index.html,
// sem regra de reescrita — e o botão Voltar do navegador funciona.

const tabela = [];

/** rota('/financeiro/contratos/:id', () => import('...'), { titulo, permitido }) */
export function rota(padrao, carregar, opcoes = {}) {
  tabela.push({ padrao, partes: padrao.split('/').filter(Boolean), carregar, ...opcoes });
}

export function resolver(fragmento = location.hash) {
  const [caminho, busca = ''] = fragmento.replace(/^#/, '').split('?');
  const partes = caminho.split('/').filter(Boolean);

  for (const r of tabela) {
    if (r.partes.length !== partes.length) continue;
    const params = {};
    const casa = r.partes.every((parte, i) => {
      if (!parte.startsWith(':')) return parte === partes[i];
      params[parte.slice(1)] = decodeURIComponent(partes[i]);
      return true;
    });
    if (casa) {
      return { ...r, params, consulta: Object.fromEntries(new URLSearchParams(busca)), caminho: `/${partes.join('/')}` };
    }
  }
  return null;
}

const comConsulta = (caminho, consulta = {}) => {
  const busca = new URLSearchParams(
    Object.entries(consulta).filter(([, v]) => v != null && v !== '' && v !== false),
  ).toString();
  return `#${caminho}${busca ? `?${busca}` : ''}`;
};

export function navegar(caminho, consulta) {
  location.hash = comConsulta(caminho, consulta);
}

/** Guarda filtros no endereço sem recarregar a tela: recarregar a página ou
 *  mandar o link para alguém mantém o que estava filtrado. */
export function guardarConsulta(consulta) {
  const [caminho] = location.hash.replace(/^#/, '').split('?');
  history.replaceState(null, '', comConsulta(caminho || '/inicio', consulta));
}
