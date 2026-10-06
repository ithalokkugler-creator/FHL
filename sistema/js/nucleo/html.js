// HTML seguro por padrão.
// =======================
//
//   html`<td>${cliente.nome}</td>`                     o nome é escapado
//   html`<ul>${itens.map((i) => html`<li>${i}</li>`)}</ul>`   listas se juntam
//   cru(textoSeu)                                      entra sem escapar
//
// Todo dado que vem do banco — nome de cliente, observação, motivo — foi
// digitado por alguém. Escapar sempre é o que impede um "<script>" digitado
// num campo de rodar na tela de outra pessoa. `cru` só para texto escrito no
// próprio código.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Html {
  constructor(texto) {
    this.texto = texto;
  }
  toString() {
    return this.texto;
  }
}

export const escapar = (valor) => String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const cru = (texto) => new Html(String(texto));

function emHtml(valor) {
  if (valor == null || valor === false) return '';
  if (valor instanceof Html) return valor.texto;
  if (Array.isArray(valor)) return valor.map(emHtml).join('');
  return escapar(valor);
}

export function html(partes, ...valores) {
  let texto = partes[0];
  for (let i = 0; i < valores.length; i++) texto += emHtml(valores[i]) + partes[i + 1];
  return new Html(texto);
}

/** Troca o conteúdo de um elemento. */
export function desenhar(elemento, conteudo) {
  elemento.innerHTML = emHtml(conteudo);
  aplicarVariaveis(elemento);
}

/** data-vars="--cor:#2E615D;--topo:30%" → variáveis CSS no elemento.
 *
 *  Existe por causa da CSP (sistema/vercel.json): um style="" dentro de HTML
 *  gerado é bloqueado, mas uma variável definida por JavaScript não. Cor de
 *  advogado e posição de compromisso na grade passam por aqui. */
export function aplicarVariaveis(raiz) {
  for (const el of raiz.querySelectorAll('[data-vars]')) {
    for (const par of el.dataset.vars.split(';')) {
      const i = par.indexOf(':');
      const nome = par.slice(0, i).trim();
      if (i > 0 && nome.startsWith('--')) el.style.setProperty(nome, par.slice(i + 1).trim());
    }
  }
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/** Campos de um formulário → objeto. Texto vem aparado; checkbox vira booleano. */
export function lerFormulario(form) {
  const dados = {};
  for (const campo of form.elements) {
    if (!campo.name || campo.matches(':disabled')) continue;
    if (campo.type === 'checkbox') dados[campo.name] = campo.checked;
    else if (campo.type === 'radio') {
      if (campo.checked) dados[campo.name] = campo.value;
    } else dados[campo.name] = campo.value.trim();
  }
  return dados;
}

/** Um ouvinte na raiz para todos os [data-acao] de dentro dela. */
export function aoClicar(raiz, acoes) {
  const ouvinte = (e) => {
    const alvo = e.target.closest('[data-acao]');
    if (!alvo || !raiz.contains(alvo)) return;
    const fn = acoes[alvo.dataset.acao];
    if (!fn) return;
    e.preventDefault();
    fn(alvo, e);
  };
  raiz.addEventListener('click', ouvinte);
  return () => raiz.removeEventListener('click', ouvinte);
}
