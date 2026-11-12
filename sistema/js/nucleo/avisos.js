// Avisos curtos no canto da tela: "Recebimento registrado", "Sem conexão".

let area = null;

function garantirArea() {
  if (!area || !area.isConnected) {
    area = document.createElement('div');
    area.className = 'avisos';
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    document.body.append(area);
  }
  return area;
}

export function avisar(texto, tipo = 'ok', duracao = 4200) {
  garantirArea();
  // Repetir uma ação rapidamente não deve cobrir a tela de avisos iguais.
  for (const antigo of [...area.children]) {
    if (antigo.dataset.texto === texto && antigo.dataset.tipo === tipo) antigo.remove();
  }
  // No celular, empilhados cobriam a lista: um por vez. Os lembretes fixos
  // (avisarFixo) não contam: ficam até a pessoa dispensar.
  const maximo = matchMedia('(max-width: 640px)').matches ? 1 : 3;
  const passageiros = () => [...area.children].filter((x) => !x.classList.contains('aviso--fixo') && !x.classList.contains('aviso--fixos'));
  while (passageiros().length >= maximo) passageiros()[0].remove();
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

// ---------------------------------------------------------------------------
// Lembretes que ficam no canto até serem dispensados (12/11/2026): compromisso
// chegando, prazo em horas, resumo das tarefas (nucleo/notificacoes.js).
// ---------------------------------------------------------------------------

function cartaoFixo({ chave, titulo, texto = '', href = '' }, aoDispensar) {
  const aviso = document.createElement('div');
  aviso.className = 'aviso aviso--fixo';
  aviso.setAttribute('role', 'alert');
  aviso.dataset.chave = chave;
  const corpo = document.createElement('div');
  corpo.className = 'aviso__corpo';
  const forte = document.createElement('strong');
  forte.className = 'aviso__titulo';
  forte.textContent = titulo;
  corpo.append(forte);
  if (texto) {
    const p = document.createElement('span');
    p.className = 'aviso__texto';
    p.textContent = texto;
    corpo.append(p);
  }
  const acoes = document.createElement('div');
  acoes.className = 'aviso__acoes';
  if (href) {
    const abrir = document.createElement('a');
    abrir.className = 'botao botao--pequeno aviso__abrir';
    abrir.href = href;
    abrir.textContent = 'Abrir';
    abrir.addEventListener('click', () => aoDispensar(chave));
    acoes.append(abrir);
  }
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'botao botao--pequeno aviso__dispensar';
  fechar.textContent = 'Dispensar';
  fechar.addEventListener('click', () => aoDispensar(chave));
  acoes.append(fechar);
  corpo.append(acoes);
  aviso.append(corpo);
  return aviso;
}

/**
 * Desenha os lembretes abertos (o mais novo em cima): no máximo 3 no
 * computador e 2 no celular, para não cobrir a tela; com mais de um, a barra
 * "N avisos · Dispensar todos". Redesenhar não duplica.
 */
export function mostrarFixos(lista, { aoDispensar, aoDispensarTodos }) {
  garantirArea();
  for (const x of [...area.children]) if (x.classList.contains('aviso--fixo') || x.classList.contains('aviso--fixos')) x.remove();
  if (!lista.length) return;
  const maximo = matchMedia('(max-width: 640px)').matches ? 1 : 3;
  const visiveis = lista.slice(0, maximo);
  if (lista.length > 1) {
    const barra = document.createElement('div');
    barra.className = 'aviso aviso--fixos';
    const texto = document.createElement('span');
    const fora = lista.length - visiveis.length;
    texto.textContent = fora ? `Mais ${fora} ${fora === 1 ? 'aviso' : 'avisos'}` : `${lista.length} avisos`;
    const todos = document.createElement('button');
    todos.type = 'button';
    todos.className = 'botao botao--pequeno aviso__dispensar';
    todos.textContent = `Dispensar ${lista.length === 2 ? 'os dois' : `os ${lista.length}`}`;
    todos.addEventListener('click', () => aoDispensarTodos());
    barra.append(texto, todos);
    area.prepend(barra);
  }
  for (const aviso of [...visiveis].reverse()) area.prepend(cartaoFixo(aviso, aoDispensar));
}

/** Ao sair do sistema, os lembretes de quem saiu não ficam na tela. */
export function limparAvisosFixos() {
  for (const x of [...(area?.children ?? [])]) if (x.classList.contains('aviso--fixo') || x.classList.contains('aviso--fixos')) x.remove();
}
