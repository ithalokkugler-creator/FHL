// Texto de documento por lista branca.
// ====================================
//
// A folha do documento é editável (contenteditable) e o texto final fica
// gravado como HTML. Tudo o que entra ou sai dela passa por aqui — ao colar,
// gravar, exibir e exportar: só sobram as marcações da lista, as classes
// `doc-*` e imagens da própria pasta /sistema/img/. Estilo colado do Word,
// script, formulário e imagem externa ficam de fora.

// S e STRIKE: o riscado da barra de formatação (documentos/editor.js).
const TAGS = new Set('P H1 H2 H3 STRONG B EM I U S STRIKE BR UL OL LI TABLE THEAD TBODY TR TH TD DIV SPAN HR IMG'.split(' '));

// Descartadas com todo o conteúdo. Uma tag fora das duas listas some, mas o
// texto de dentro fica.
const DESCARTAR = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE FORM INPUT BUTTON TEXTAREA SELECT LINK META BASE'.split(' '));

// nodeType, sem depender do global Node.
const TEXTO = 3;
const ELEMENTO = 1;

const IMAGEM_PERMITIDA = /^\/sistema\/img\/[a-zA-Z0-9_/-]+\.(?:svg|png|jpe?g|webp)$/;

export function higienizar(texto) {
  // O conteúdo de um <template> é inerte: estilos e imagens colados não
  // carregam nada. Só os elementos recriados abaixo chegam à tela.
  const doc = document.implementation.createHTMLDocument('');
  const fragmento = doc.createElement('template');
  fragmento.innerHTML = String(texto ?? '');

  const limpar = (origem, destino) => {
    for (const n of origem.childNodes) {
      if (n.nodeType === TEXTO) {
        // O espaço de largura zero só segura o cursor no editor; não vai para o papel.
        destino.append(doc.createTextNode(n.textContent.replaceAll('\u200B', '')));
        continue;
      }
      if (n.nodeType !== ELEMENTO || DESCARTAR.has(n.tagName)) continue;
      if (!TAGS.has(n.tagName)) {
        limpar(n, destino);
        continue;
      }

      const e = doc.createElement(n.tagName.toLowerCase());
      if (n.tagName === 'IMG') {
        const src = n.getAttribute('src') ?? '';
        if (!IMAGEM_PERMITIDA.test(src) || src.includes('..') || src.includes('//')) continue;
        e.setAttribute('src', src);
        e.setAttribute('alt', 'Fonseca Lisboa Advocacia');
      }
      const classes = [...n.classList].filter((c) => /^doc-[a-z0-9-]+$/.test(c));
      if (classes.length) e.className = classes.join(' ');
      if (n.tagName === 'TD' || n.tagName === 'TH') {
        for (const atributo of ['colspan', 'rowspan']) {
          const v = n.getAttribute(atributo);
          if (/^[1-9]\d?$/.test(v ?? '')) e.setAttribute(atributo, v);
        }
      }
      limpar(n, e);
      destino.append(e);
    }
  };

  const caixa = doc.createElement('div');
  limpar(fragmento.content, caixa);
  return caixa.innerHTML;
}

const escaparTexto = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** Colar na folha: HTML passa pela lista branca; texto puro vira parágrafos. */
export function ligarColagem(folha, aoEditar) {
  const colar = (e) => {
    e.preventDefault();
    const dados = e.clipboardData;
    const marcado = dados?.getData('text/html');
    const texto = marcado
      ? higienizar(marcado)
      : higienizar((dados?.getData('text/plain') ?? '').split('\n').map((linha) => `<p>${escaparTexto(linha)}</p>`).join(''));
    document.execCommand('insertHTML', false, texto);
    aoEditar?.();
  };
  folha.addEventListener('paste', colar);
  // Arrastar arquivo ou HTML para a folha contornaria a colagem.
  const soltar = (e) => e.preventDefault();
  folha.addEventListener('drop', soltar);
  return () => {
    folha.removeEventListener('paste', colar);
    folha.removeEventListener('drop', soltar);
  };
}
