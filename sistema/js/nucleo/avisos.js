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
  const aviso = document.createElement('div');
  aviso.className = `aviso aviso--${tipo}`;
  aviso.textContent = texto;
  area.append(aviso);
  setTimeout(() => aviso.remove(), duracao);
}

export function avisarErro(erro) {
  console.error(erro);
  avisar(erro?.message || 'Algo deu errado. Tente de novo.', 'erro', 7000);
}
