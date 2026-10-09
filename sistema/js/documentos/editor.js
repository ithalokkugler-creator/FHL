// Barra de formatação da folha — um Word simplificado.
// =====================================================
//
// Desfazer/refazer, estilo do parágrafo, fonte, tamanho, negrito, itálico,
// sublinhado, riscado, cor, realce, alinhamento, listas, recuo e limpar.
//
// Como aplica (ver documentos/formatacao.js para o porquê das classes):
//
// - Negrito, itálico, sublinhado, riscado, listas e estilo do parágrafo
//   são comandos do próprio navegador (execCommand): geram <b>, <i>, <u>,
//   <strike>, <ul>, <h2>, que a lista branca aceita.
// - Fonte, tamanho, cor e realce: o navegador embrulha a seleção com uma
//   fonte-marcador (<font face="fhlfmt">), que é trocada logo em seguida por
//   <span class="doc-cor-azul">. Antes, o trecho sai de dentro de um span da
//   mesma categoria — senão "tirar o realce" não teria como funcionar.
// - Alinhamento e recuo: classe no parágrafo.
//
// O desfazer é próprio (fotos do HTML): o do navegador se perde quando o
// texto muda por fora dos comandos dele, e aqui isso acontece a cada cor.

import { cru, html } from '../nucleo/html.js';
import {
  ALINHAMENTOS, categoriaDaClasse, CATEGORIAS, classeDe, CORES, FONTES, REALCES, RECUOS, TAMANHOS,
} from './formatacao.js';

const MARCA = 'fhlfmt';
const BLOCOS = new Set(['P', 'H1', 'H2', 'H3', 'LI', 'TD', 'TH', 'DIV']);
const ESTILOS = [['p', 'Texto normal'], ['h2', 'Título'], ['h3', 'Subtítulo']];
const ESPACO_ZERO = '\u200B';

// ---------------------------------------------------------------------------
// A barra
// ---------------------------------------------------------------------------

// Ícones de traço, 20×20, na cor do texto do botão.
const ICONES = {
  desfazer: '<path d="M8 5 4 9l4 4"/><path d="M4 9h8a4 4 0 0 1 0 8H9"/>',
  refazer: '<path d="m12 5 4 4-4 4"/><path d="M16 9H8a4 4 0 0 0 0 8h3"/>',
  esquerda: '<path d="M3 5h14M3 9h9M3 13h14M3 17h9"/>',
  centro: '<path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9"/>',
  direita: '<path d="M3 5h14M8 9h9M3 13h14M8 17h9"/>',
  justificar: '<path d="M3 5h14M3 9h14M3 13h14M3 17h14"/>',
  marcadores: '<circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="14" r="1.1" fill="currentColor" stroke="none"/><path d="M8 6h9M8 14h9"/>',
  numerada: '<path d="M3.5 4.5h1.2v4M3.3 8.5h2.6M3.2 12.6c.3-.6.9-.9 1.4-.9.7 0 1.2.4 1.2 1 0 .9-1.4 1.4-2.6 2.8h2.7M8.5 6.5h8.5M8.5 14h8.5"/>',
  menosRecuo: '<path d="M3 4h14M9 8h8M9 12h8M3 16h14"/><path d="M6 8 3.5 10 6 12"/>',
  maisRecuo: '<path d="M3 4h14M9 8h8M9 12h8M3 16h14"/><path d="m3.5 8 2.5 2-2.5 2"/>',
  limpar: '<path d="M4 5h9M8.5 5 6 16"/><path d="m12 12 5 5M17 12l-5 5"/>',
  realce: '<path d="m11.5 3.5 4 4-6.5 6.5H5v-4z"/><path d="M4 17h12"/>',
};

const icone = (nome) => html`<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${cru(ICONES[nome])}</svg>`;

const botao = (comando, titulo, conteudo, extra = '') => html`
  <button type="button" class="editor-botao" data-comando="${comando}" ${cru(extra)}
    title="${titulo}" aria-label="${titulo}">${conteudo}</button>`;

function paleta(tipo, titulo, rotuloSem, itens) {
  return html`
    <div class="editor-paleta-caixa">
      <button type="button" class="editor-botao editor-botao--paleta" data-comando="abrir-paleta" data-paleta="${tipo}"
        title="${titulo}" aria-label="${titulo}" aria-haspopup="true" aria-expanded="false">
        ${tipo === 'cor' ? html`<span class="editor-letra-cor" aria-hidden="true">A</span>` : icone('realce')}
        <span class="editor-faixa editor-faixa--${tipo}" aria-hidden="true"></span>
      </button>
      <div class="editor-paleta" data-paleta-de="${tipo}" role="group" aria-label="${titulo}" hidden>
        <button type="button" class="editor-paleta__sem" data-comando="${tipo}" data-valor="">${rotuloSem}</button>
        <div class="editor-paleta__amostras">
          ${itens.map(([id, nome, cor]) => html`
            <button type="button" class="editor-amostra" data-comando="${tipo}" data-valor="${id}" data-cor="${cor}"
              data-vars="--amostra:${cor}" title="${nome}" aria-label="${nome}"></button>`)}
        </div>
      </div>
    </div>`;
}

/** A barra, para pôr logo acima da folha. */
export function barraDeFormatacao() {
  return html`
    <div class="editor-barra" role="toolbar" aria-label="Formatação do texto">
      <div class="editor-grupo">
        ${botao('desfazer', 'Desfazer (Ctrl+Z)', icone('desfazer'))}
        ${botao('refazer', 'Refazer (Ctrl+Y)', icone('refazer'))}
      </div>
      <div class="editor-grupo editor-grupo--listas">
        <select class="editor-lista editor-lista--estilo" data-comando="estilo" title="Estilo do parágrafo" aria-label="Estilo do parágrafo">
          ${ESTILOS.map(([v, nome]) => html`<option value="${v}">${nome}</option>`)}
        </select>
        <select class="editor-lista editor-lista--fonte" data-comando="fonte" title="Fonte" aria-label="Fonte">
          <option value="" hidden>Fonte</option>
          ${FONTES.map(([id, nome]) => html`<option value="${id}">${nome}</option>`)}
        </select>
        <select class="editor-lista editor-lista--tamanho" data-comando="tamanho" title="Tamanho da fonte" aria-label="Tamanho da fonte">
          <option value="" hidden>–</option>
          ${TAMANHOS.map((t) => html`<option value="${t}">${t}</option>`)}
        </select>
      </div>
      <div class="editor-grupo">
        ${botao('negrito', 'Negrito (Ctrl+B)', html`<b>N</b>`, 'aria-pressed="false"')}
        ${botao('italico', 'Itálico (Ctrl+I)', html`<i>I</i>`, 'aria-pressed="false"')}
        ${botao('sublinhado', 'Sublinhado (Ctrl+U)', html`<u>S</u>`, 'aria-pressed="false"')}
        ${botao('riscado', 'Riscado', html`<s>abc</s>`, 'aria-pressed="false"')}
      </div>
      <div class="editor-grupo">
        ${paleta('cor', 'Cor da fonte', 'Automática', CORES)}
        ${paleta('realce', 'Cor de realce', 'Sem realce', REALCES)}
      </div>
      <div class="editor-grupo">
        ${ALINHAMENTOS.map(([id, nome]) => botao(`alinhar-${id}`, nome, icone(id), 'aria-pressed="false"'))}
      </div>
      <div class="editor-grupo">
        ${botao('marcadores', 'Lista com marcadores', icone('marcadores'))}
        ${botao('numerada', 'Lista numerada', icone('numerada'))}
        ${botao('menos-recuo', 'Diminuir recuo', icone('menosRecuo'))}
        ${botao('mais-recuo', 'Aumentar recuo', icone('maisRecuo'))}
      </div>
      <div class="editor-grupo">
        ${botao('limpar', 'Limpar formatação', icone('limpar'))}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Seleção, cursor e histórico
// ---------------------------------------------------------------------------

const dentro = (folha, no) => Boolean(no) && folha.contains(no);

/** Posição da seleção em caracteres desde o início da folha — sobrevive à troca do HTML. */
function lerCursor(folha) {
  const sel = getSelection();
  if (!sel.rangeCount || !dentro(folha, sel.anchorNode)) return null;
  const medir = (no, deslocamento) => {
    const r = document.createRange();
    r.selectNodeContents(folha);
    r.setEnd(no, deslocamento);
    return r.toString().length;
  };
  return { ancora: medir(sel.anchorNode, sel.anchorOffset), foco: medir(sel.focusNode, sel.focusOffset) };
}

function pontoNoTexto(folha, alvo) {
  const andar = document.createTreeWalker(folha, NodeFilter.SHOW_TEXT);
  let total = 0;
  let ultimo = null;
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    if (total + n.length >= alvo) return [n, alvo - total];
    total += n.length;
    ultimo = n;
  }
  return ultimo ? [ultimo, ultimo.length] : [folha, folha.childNodes.length];
}

function porCursor(folha, cursor) {
  if (!cursor) return;
  const [a, ao] = pontoNoTexto(folha, cursor.ancora);
  const [f, fo] = pontoNoTexto(folha, cursor.foco);
  getSelection().setBaseAndExtent(a, ao, f, fo);
}

function criarHistorico(folha) {
  let pilha = [];
  let posicao = -1;
  let espera = 0;

  const gravar = () => {
    clearTimeout(espera);
    espera = 0;
    const foto = { html: folha.innerHTML, cursor: lerCursor(folha) };
    if (pilha[posicao]?.html === foto.html) {
      pilha[posicao].cursor = foto.cursor;
      return;
    }
    pilha = pilha.slice(0, posicao + 1);
    pilha.push(foto);
    if (pilha.length > 200) pilha.shift();
    posicao = pilha.length - 1;
  };

  const ir = (passo) => {
    if (espera) gravar();
    const alvo = posicao + passo;
    if (alvo < 0 || alvo >= pilha.length) return false;
    posicao = alvo;
    folha.innerHTML = pilha[posicao].html;
    folha.focus();
    porCursor(folha, pilha[posicao].cursor);
    return true;
  };

  return {
    gravar,
    // Digitação vira uma foto só depois de uma pausa, como no Word.
    agendar: () => {
      clearTimeout(espera);
      espera = setTimeout(gravar, 600);
    },
    desfazer: () => ir(-1),
    refazer: () => ir(1),
    reiniciar: () => {
      clearTimeout(espera);
      espera = 0;
      pilha = [{ html: folha.innerHTML, cursor: null }];
      posicao = 0;
    },
    parar: () => clearTimeout(espera),
  };
}

// ---------------------------------------------------------------------------
// Limpeza da folha depois de cada mudança
// ---------------------------------------------------------------------------

const desembrulhar = (el) => el.replaceWith(...el.childNodes);

function classesDaCategoria(el, categoria) {
  return [...el.classList].filter((c) => categoriaDaClasse(c) === categoria);
}

/**
 * Atributo style e <font> que não sejam o marcador não ficam na folha: o
 * Chrome cria os dois ao juntar parágrafos ou tirar negrito, a CSP não os
 * aplica e a lista branca os descartaria ao gravar. O que tem equivalente
 * vira classe; o resto sai. Span sem classe é desembrulhado.
 */
function normalizar(folha) {
  for (const el of folha.querySelectorAll('[style]')) {
    if (/^(normal|[1-4]00)$/.test(el.style.fontWeight)) el.classList.add('doc-sem-negrito');
    if (el.style.fontStyle === 'normal') el.classList.add('doc-sem-italico');
    el.removeAttribute('style');
  }
  for (const el of folha.querySelectorAll('font:not([face="fhlfmt"])')) desembrulhar(el);
  for (const el of folha.querySelectorAll('span:not([class]), span[class=""]')) desembrulhar(el);
  // O espaço de largura zero só serve enquanto o cursor está num trecho vazio.
  const andar = document.createTreeWalker(folha, NodeFilter.SHOW_TEXT);
  const sel = getSelection();
  const vazios = [];
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    if (!n.data.includes(ESPACO_ZERO) || sel.anchorNode === n) continue;
    if (n.data === ESPACO_ZERO && n.parentElement?.tagName === 'SPAN' && n.parentElement.childNodes.length === 1) vazios.push(n.parentElement);
    else n.data = n.data.replaceAll(ESPACO_ZERO, '');
  }
  for (const span of vazios) span.remove();
}

// ---------------------------------------------------------------------------
// Trechos: fonte, tamanho, cor, realce
// ---------------------------------------------------------------------------

/**
 * Tira `no` de dentro do ancestral `pai` (um span da categoria): o que vem
 * antes e depois dele fica em cópias de `pai`, e `pai` passa a envolver só
 * o trecho — quem chama tira a classe dele.
 */
function separar(no, pai) {
  const antes = document.createRange();
  antes.setStart(pai, 0);
  antes.setEndBefore(no);
  const depois = document.createRange();
  depois.setStartAfter(no);
  depois.setEnd(pai, pai.childNodes.length);

  const pedacoAntes = antes.extractContents();
  const pedacoDepois = depois.extractContents();
  if (pedacoAntes.textContent) {
    const copia = pai.cloneNode(false);
    copia.append(pedacoAntes);
    pai.before(copia);
  }
  if (pedacoDepois.textContent) {
    const copia = pai.cloneNode(false);
    copia.append(pedacoDepois);
    pai.after(copia);
  }
}

/** Troca cada fonte-marcador por um span com a classe (ou sem ela, para "automática"). */
function trocarMarcas(folha, categoria, valor) {
  const novos = [];
  for (const marca of folha.querySelectorAll(`font[face="${MARCA}"]`)) {
    // 1. Fora de qualquer span da mesma categoria, do mais próximo ao mais distante.
    for (let pai = marca.parentElement; pai && pai !== folha; pai = pai.parentElement) {
      const classes = pai.tagName === 'SPAN' ? classesDaCategoria(pai, categoria) : [];
      if (!classes.length) continue;
      separar(marca, pai);
      pai.classList.remove(...classes);
    }
    // 2. Dentro dele, a categoria antiga sai.
    for (const el of marca.querySelectorAll('span')) el.classList.remove(...classesDaCategoria(el, categoria));
    // 3. O marcador vira o span. Se ele é o conteúdo inteiro de um span (ou
    //    envolve um só), a classe vai para esse span: cor, tamanho e fonte
    //    no mesmo trecho ficam num elemento, não em três aninhados.
    const pai = marca.parentElement;
    const unico = marca.childNodes.length === 1 && marca.firstChild.nodeType === 1 ? marca.firstChild : null;
    const alvo = pai !== folha && pai.tagName === 'SPAN' && pai.childNodes.length === 1 ? pai
      : unico?.tagName === 'SPAN' ? unico : null;
    if (alvo) {
      if (valor) alvo.classList.add(classeDe(categoria, valor));
      desembrulhar(marca);
      novos.push(alvo);
      continue;
    }
    const span = document.createElement('span');
    if (valor) span.className = classeDe(categoria, valor);
    span.append(...marca.childNodes);
    marca.replaceWith(span);
    novos.push(span);
  }
  return novos;
}

// ---------------------------------------------------------------------------
// Parágrafos: alinhamento e recuo
// ---------------------------------------------------------------------------

function blocoDe(folha, no) {
  for (let el = no?.nodeType === 1 ? no : no?.parentElement; el && el !== folha; el = el.parentElement) {
    if (BLOCOS.has(el.tagName)) return el;
  }
  return null;
}

/**
 * Os parágrafos que a seleção toca — o mais interno de cada trecho de texto
 * de fato selecionado. O triplo clique do Chrome termina no começo do
 * parágrafo seguinte; esse não conta.
 */
function blocosDaSelecao(folha) {
  const sel = getSelection();
  if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  const doCursor = blocoDe(folha, r.startContainer);
  if (r.collapsed) return doCursor ? [doCursor] : [];

  const blocos = new Set();
  const andar = document.createTreeWalker(folha, NodeFilter.SHOW_TEXT);
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    if (!n.data.trim() || !r.intersectsNode(n)) continue;
    if (n === r.endContainer && r.endOffset === 0) continue;
    if (n === r.startContainer && r.startOffset >= n.length) continue;
    const b = blocoDe(folha, n);
    if (b) blocos.add(b);
  }
  if (!blocos.size && doCursor) blocos.add(doCursor);
  return [...blocos];
}

const recuoDe = (el) => Number([...el.classList].find((c) => /^doc-recuo-\d$/.test(c))?.slice(10) ?? 0);

function trocarClasse(el, padrao, nova) {
  el.classList.remove(...[...el.classList].filter((c) => padrao.test(c)));
  if (nova) el.classList.add(nova);
}

// ---------------------------------------------------------------------------
// Ligar a barra à folha
// ---------------------------------------------------------------------------

/**
 * Liga a barra à folha editável. `aoEditar` roda depois de cada mudança
 * (a tela marca a folha como editada à mão). Devolve `{ reiniciar, desligar }`:
 * `reiniciar` depois que a tela troca o texto inteiro (o desfazer recomeça dali).
 */
export function ligarEditor(barra, folha, { aoEditar = () => {} } = {}) {
  const historico = criarHistorico(folha);
  let guardada = null; // a última seleção dentro da folha
  let ocupado = false;

  const selecao = () => getSelection();

  /** Volta o foco e a seleção para a folha — uma lista da barra os tira de lá. */
  const voltar = () => {
    if (document.activeElement !== folha) folha.focus({ preventScroll: true });
    const sel = selecao();
    if (guardada && (!sel.rangeCount || !dentro(folha, sel.anchorNode))) {
      sel.removeAllRanges();
      sel.addRange(guardada);
    }
    return sel.rangeCount && dentro(folha, sel.anchorNode);
  };

  const mudou = () => {
    normalizar(folha);
    historico.gravar();
    aoEditar();
    atualizarBarra();
  };

  /** Cursor sem seleção dentro de uma palavra: vale a palavra inteira, como no Word. */
  const palavraNoCursor = () => {
    const sel = selecao();
    if (!sel.isCollapsed || sel.anchorNode?.nodeType !== 3) return null;
    const texto = sel.anchorNode.data;
    const i = sel.anchorOffset;
    const letra = /[\p{L}\p{N}]/u;
    if (!letra.test(texto[i - 1] ?? '') || !letra.test(texto[i] ?? '')) return null;
    let a = i;
    let b = i;
    while (a > 0 && letra.test(texto[a - 1])) a--;
    while (b < texto.length && letra.test(texto[b])) b++;
    const r = document.createRange();
    r.setStart(sel.anchorNode, a);
    r.setEnd(sel.anchorNode, b);
    return r;
  };

  /** Fonte, tamanho, cor ou realce no trecho escolhido. */
  const aplicarTrecho = (categoria, valor) => {
    if (valor && !CATEGORIAS[categoria].valores.includes(String(valor))) return;
    const sel = selecao();
    const palavra = palavraNoCursor();
    const cursor = palavra && lerCursor(folha);
    if (palavra) {
      sel.removeAllRanges();
      sel.addRange(palavra);
    }

    if (sel.isCollapsed) {
      // Cursor solto: um trecho vazio para o que for digitado em seguida.
      const r = sel.getRangeAt(0);
      const atual = sel.anchorNode?.parentElement;
      if (atual?.tagName === 'SPAN' && sel.anchorNode.data === ESPACO_ZERO) {
        atual.classList.remove(...classesDaCategoria(atual, categoria));
        if (valor) atual.classList.add(classeDe(categoria, valor));
        return;
      }
      if (!valor) return;
      const span = document.createElement('span');
      span.className = classeDe(categoria, valor);
      span.textContent = ESPACO_ZERO;
      r.insertNode(span);
      sel.setBaseAndExtent(span.firstChild, 1, span.firstChild, 1);
      return;
    }

    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontName', false, MARCA);
    const novos = trocarMarcas(folha, categoria, valor);
    if (cursor) {
      // O comando divide o nó de texto: o cursor volta pela contagem de caracteres.
      porCursor(folha, cursor);
    } else if (novos.length) {
      // A seleção continua no trecho, para a próxima formatação — por dentro
      // dos spans, para a barra ler a fonte e o tamanho deles.
      const textos = novos.flatMap((span) => {
        const andar = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
        const lista = [];
        for (let n = andar.nextNode(); n; n = andar.nextNode()) lista.push(n);
        return lista;
      });
      const r = document.createRange();
      if (textos.length) {
        r.setStart(textos[0], 0);
        r.setEnd(textos.at(-1), textos.at(-1).length);
      } else {
        r.setStartBefore(novos[0]);
        r.setEndAfter(novos.at(-1));
      }
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const alinhar = (id) => {
    for (const b of blocosDaSelecao(folha)) trocarClasse(b, /^doc-alinhar-/, `doc-alinhar-${id}`);
  };

  const recuar = (passo) => {
    const blocos = blocosDaSelecao(folha);
    // Em lista, o recuo é o nível da lista.
    if (blocos.length && blocos.every((b) => b.tagName === 'LI')) {
      document.execCommand(passo > 0 ? 'indent' : 'outdent');
      return;
    }
    for (const b of blocos) {
      const n = Math.min(RECUOS, Math.max(0, recuoDe(b) + passo));
      trocarClasse(b, /^doc-recuo-\d$/, n ? `doc-recuo-${n}` : '');
    }
  };

  const limpar = () => {
    if (!selecao().isCollapsed) {
      for (const categoria of Object.keys(CATEGORIAS)) aplicarTrecho(categoria, '');
      document.execCommand('removeFormat');
    }
    for (const b of blocosDaSelecao(folha)) trocarClasse(b, /^doc-(alinhar|recuo)-/, '');
  };

  const COMANDOS = {
    negrito: () => document.execCommand('bold'),
    italico: () => document.execCommand('italic'),
    sublinhado: () => document.execCommand('underline'),
    riscado: () => document.execCommand('strikeThrough'),
    marcadores: () => document.execCommand('insertUnorderedList'),
    numerada: () => document.execCommand('insertOrderedList'),
    'menos-recuo': () => recuar(-1),
    'mais-recuo': () => recuar(1),
    limpar,
    estilo: (v) => ESTILOS.some(([e]) => e === v) && document.execCommand('formatBlock', false, v),
    fonte: (v) => aplicarTrecho('fonte', v),
    tamanho: (v) => aplicarTrecho('tamanho', v),
    cor: (v) => aplicarTrecho('cor', v),
    realce: (v) => aplicarTrecho('realce', v),
    ...Object.fromEntries(ALINHAMENTOS.map(([id]) => [`alinhar-${id}`, () => alinhar(id)])),
  };

  const executar = (comando, valor) => {
    if (comando === 'desfazer' || comando === 'refazer') {
      if (historico[comando]()) {
        aoEditar();
        atualizarBarra();
      }
      return;
    }
    const fn = COMANDOS[comando];
    if (!fn || ocupado || !voltar()) return;
    ocupado = true;
    try {
      historico.gravar(); // a digitação pendente vira um passo próprio
      fn(valor);
      mudou();
    } finally {
      ocupado = false;
    }
  };

  // --- Paletas de cor ---------------------------------------------------------

  const fecharPaletas = () => {
    for (const p of barra.querySelectorAll('[data-paleta-de]')) p.hidden = true;
    for (const b of barra.querySelectorAll('[data-paleta]')) b.setAttribute('aria-expanded', 'false');
  };

  const ultimaCor = { cor: '', realce: '' };
  const pintarFaixas = () => {
    for (const tipo of ['cor', 'realce']) {
      const faixa = barra.querySelector(`.editor-faixa--${tipo}`);
      faixa?.style.setProperty('--amostra', ultimaCor[tipo] || (tipo === 'cor' ? '#111' : 'transparent'));
    }
  };

  // --- Estado da barra --------------------------------------------------------

  function atualizarBarra() {
    const sel = selecao();
    if (!sel.rangeCount || !dentro(folha, sel.anchorNode)) return;
    // O início da seleção; se ele cai entre elementos, o primeiro texto depois dele.
    const r = sel.getRangeAt(0);
    let no = r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset] ?? r.startContainer : r.startContainer;
    if (no.nodeType === 1) no = document.createTreeWalker(no, NodeFilter.SHOW_TEXT).nextNode() ?? no;
    const el = no.nodeType === 1 ? no : no.parentElement;
    const estilo = getComputedStyle(el);

    const marcar = (comando, ligado) => barra.querySelector(`[data-comando="${comando}"]`)?.setAttribute('aria-pressed', String(ligado));
    marcar('negrito', document.queryCommandState('bold'));
    marcar('italico', document.queryCommandState('italic'));
    marcar('sublinhado', document.queryCommandState('underline'));
    marcar('riscado', document.queryCommandState('strikeThrough'));

    const bloco = blocoDe(folha, el);
    const alinhado = bloco ? getComputedStyle(bloco).textAlign : 'left';
    const atual = { center: 'centro', right: 'direita', end: 'direita', justify: 'justificar' }[alinhado] ?? 'esquerda';
    for (const [id] of ALINHAMENTOS) marcar(`alinhar-${id}`, id === atual);

    // A folha encolhe com `zoom`; o tamanho calculado continua o real.
    const primeira = estilo.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const fonte = FONTES.find(([, nome]) => nome.toLowerCase() === primeira)?.[0] ?? '';
    const pontos = Math.round(parseFloat(estilo.fontSize) * 0.75 * 2) / 2;
    const campos = {
      fonte,
      tamanho: TAMANHOS.includes(pontos) ? String(pontos) : '',
      estilo: { H2: 'h2', H3: 'h3' }[bloco?.tagName] ?? 'p',
    };
    for (const [nome, valor] of Object.entries(campos)) {
      const lista = barra.querySelector(`select[data-comando="${nome}"]`);
      if (lista && document.activeElement !== lista) lista.value = valor;
    }
  }

  // --- Eventos ----------------------------------------------------------------

  const aoMudarSelecao = () => {
    const sel = selecao();
    if (sel.rangeCount && dentro(folha, sel.anchorNode)) {
      guardada = sel.getRangeAt(0).cloneRange();
      atualizarBarra();
    }
  };

  // Botão da barra não rouba o foco nem a seleção da folha.
  const aoPressionar = (e) => {
    if (e.target.closest('button')) e.preventDefault();
  };

  const aoClicarBarra = (e) => {
    const b = e.target.closest('button[data-comando]');
    if (!b || b.disabled) return;
    if (b.dataset.comando === 'abrir-paleta') {
      const caixa = barra.querySelector(`[data-paleta-de="${b.dataset.paleta}"]`);
      const abrir = caixa.hidden;
      fecharPaletas();
      caixa.hidden = !abrir;
      b.setAttribute('aria-expanded', String(abrir));
      return;
    }
    if (b.dataset.comando in ultimaCor) {
      ultimaCor[b.dataset.comando] = b.dataset.cor ?? '';
      pintarFaixas();
      fecharPaletas();
    }
    executar(b.dataset.comando, b.dataset.valor);
  };

  const aoEscolher = (e) => {
    const lista = e.target.closest('select[data-comando]');
    if (!lista || !lista.value) return;
    executar(lista.dataset.comando, lista.value);
  };

  const foraDaPaleta = (e) => {
    if (!e.target.closest('.editor-paleta-caixa')) fecharPaletas();
  };
  const aoTeclar = (e) => {
    if (e.key === 'Escape') fecharPaletas();
  };

  // Ctrl+Z, Ctrl+Y e o menu de contexto pedem desfazer por aqui.
  const antesDeEditar = (e) => {
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      executar(e.inputType === 'historyUndo' ? 'desfazer' : 'refazer');
    }
  };
  const atalho = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const tecla = e.key.toLowerCase();
    const comando = tecla === 'z' && !e.shiftKey ? 'desfazer' : (tecla === 'y' || (tecla === 'z' && e.shiftKey)) ? 'refazer' : '';
    if (!comando) return;
    e.preventDefault();
    executar(comando);
  };
  const aoDigitar = () => {
    if (ocupado) return;
    normalizar(folha);
    historico.agendar();
    atualizarBarra();
  };

  barra.addEventListener('mousedown', aoPressionar);
  barra.addEventListener('click', aoClicarBarra);
  barra.addEventListener('change', aoEscolher);
  barra.addEventListener('keydown', aoTeclar);
  folha.addEventListener('beforeinput', antesDeEditar);
  folha.addEventListener('keydown', atalho);
  folha.addEventListener('input', aoDigitar);
  document.addEventListener('selectionchange', aoMudarSelecao);
  document.addEventListener('mousedown', foraDaPaleta);
  pintarFaixas();
  // Antes do primeiro clique na folha, a barra mostra o padrão do papel.
  barra.querySelector('select[data-comando="fonte"]').value = FONTES[0][0];
  barra.querySelector('select[data-comando="tamanho"]').value = '12';
  historico.reiniciar();

  return {
    reiniciar: () => historico.reiniciar(),
    desligar: () => {
      historico.parar();
      barra.removeEventListener('mousedown', aoPressionar);
      barra.removeEventListener('click', aoClicarBarra);
      barra.removeEventListener('change', aoEscolher);
      barra.removeEventListener('keydown', aoTeclar);
      folha.removeEventListener('beforeinput', antesDeEditar);
      folha.removeEventListener('keydown', atalho);
      folha.removeEventListener('input', aoDigitar);
      document.removeEventListener('selectionchange', aoMudarSelecao);
      document.removeEventListener('mousedown', foraDaPaleta);
    },
  };
}
