// Avisos curtos no canto da tela: "Recebimento registrado", "Sem conexão".

let area = null;

export function avisar(texto, tipo = 'ok', duracao = 4200) {
  if (!area) {
    area = document.createElement('div');
    area.className = 'avisos';
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    document.body.append(area);
  }
  // Repetir uma ação rapidamente não deve cobrir a tela de avisos iguais.
  for (const antigo of area.children) {
    if (antigo.dataset.texto === texto && antigo.dataset.tipo === tipo) antigo.remove();
  }
  while (area.children.length >= 3) area.firstElementChild.remove();
  const aviso = document.createElement('div');
  aviso.className = `aviso aviso--${tipo}`;
  aviso.dataset.texto = texto;
  aviso.dataset.tipo = tipo;
  const mensagem = document.createElement('span');
  mensagem.textContent = texto;
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'aviso__fechar';
  fechar.setAttribute('aria-label', 'Dispensar aviso');
  fechar.textContent = '×';
  fechar.addEventListener('click', () => aviso.remove());
  aviso.append(mensagem, fechar);
  area.append(aviso);
  setTimeout(() => aviso.remove(), duracao);
}

export function avisarErro(erro) {
  console.error(erro);
  avisar(erro?.message || 'Algo deu errado. Tente de novo.', 'erro', 7000);
}
