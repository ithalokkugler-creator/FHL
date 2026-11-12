// Faixa de números no alto de Contratos, Clientes e Processos (12/11/2026).
// ==========================================================================
//
// Um painel recolhível com os indicadores, o período (este mês, 3, 4, 5, 6 ou
// 12 meses) e as barras mês a mês. Quem não quer ver recolhe — e o navegador
// lembra, por tela. A conta mora em dominio/indicadores.js.

import { mesAbreviado } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';
import { PERIODOS_NUMEROS } from '../dominio/indicadores.js';
import { opcoes } from './comum.js';

const chave = (id) => `fhl.numeros.${id}`;

function lembrarAberto(id) {
  // Sem escolha guardada: aberto no computador, recolhido no celular (a lista vem primeiro).
  const padrao = !matchMedia('(max-width: 760px)').matches;
  try {
    const guardado = localStorage.getItem(chave(id));
    return guardado ? guardado !== 'fechado' : padrao;
  } catch {
    return padrao;
  }
}

/** Barras mês a mês: a maior ocupa a altura toda; o mês atual em destaque. */
export function barrasPorMes(contagem, { rotulo = 'Mês a mês' } = {}) {
  if (!contagem || contagem.meses < 2) return '';
  const maior = Math.max(1, ...contagem.porMes.map((x) => x.total));
  return html`
    <ol class="meses-barras" aria-label="${rotulo}">
      ${contagem.porMes.map((x, i) => html`
        <li class="${i === contagem.porMes.length - 1 ? 'meses-barras__atual' : ''}">
          <strong class="num">${x.total}</strong>
          <span class="meses-barras__barra" data-vars="--v:${(x.total / maior).toFixed(3)}" aria-hidden="true"></span>
          <span>${mesAbreviado(`${x.mes}-01`)}</span>
        </li>`)}
    </ol>`;
}

/**
 * @param {object} p
 * @param {string} p.id         'contratos' | 'clientes' | 'processos' (lembra se está recolhido)
 * @param {string} p.titulo
 * @param {string} p.chamada    o resumo que aparece recolhido ("Novembro: 3 · média 1,5 por mês")
 * @param {number} [p.periodo]  meses; sem período, não mostra o seletor
 * @param {*} p.indicadores     html dos indicador()
 * @param {*} [p.barras]
 * @param {string} [p.nota]
 */
export function painelNumeros({ id, titulo, chamada = '', periodo = null, indicadores, barras = '', nota = '' }) {
  return html`
    <details class="painel numeros" data-numeros="${id}" ${lembrarAberto(id) ? 'open' : ''}>
      <summary class="numeros__resumo">
        <span class="numeros__titulo">${titulo}</span>
        ${chamada ? html`<span class="numeros__chamada">${chamada}</span>` : ''}
        <span class="botao botao--pequeno botao--discreto numeros__alternar" aria-hidden="true"></span>
      </summary>
      <div class="numeros__corpo">
        ${periodo ? html`
          <div class="numeros__barra">
            <label class="numeros__periodo"><span>Período</span>
              <select data-numeros-periodo aria-label="Período dos números">${opcoes(PERIODOS_NUMEROS, String(periodo))}</select></label>
            ${nota ? html`<span class="sub">${nota}</span>` : ''}
          </div>` : nota ? html`<p class="numeros__barra sub">${nota}</p>` : ''}
        <div class="indicadores indicadores--embutido">${indicadores}</div>
        ${barras}
      </div>
    </details>`;
}

/** Liga o seletor de período e lembra recolhido/aberto. Devolve o desligar. */
export function ligarNumeros(raiz, aoMudarPeriodo) {
  const aoMudar = (e) => {
    if (!e.target.matches?.('[data-numeros-periodo]')) return;
    aoMudarPeriodo(Number(e.target.value));
  };
  // Só lembra o que a pessoa escolheu: o navegador também dispara "toggle" ao
  // desenhar o painel já aberto, e isso não é escolha de ninguém.
  const aoClicarResumo = (e) => {
    const painel = e.target.closest?.('.numeros__resumo')?.parentElement;
    if (painel?.matches('details[data-numeros]')) painel.dataset.escolhido = '1';
  };
  const aoAlternar = (e) => {
    const painel = e.target;
    if (!painel.matches?.('details[data-numeros]') || !painel.dataset.escolhido) return;
    delete painel.dataset.escolhido;
    try {
      localStorage.setItem(chave(painel.dataset.numeros), painel.open ? 'aberto' : 'fechado');
    } catch { /* armazenamento bloqueado: só não lembra */ }
  };
  raiz.addEventListener('change', aoMudar);
  raiz.addEventListener('click', aoClicarResumo, true);
  // `toggle` não sobe pela árvore: escuta na captura.
  raiz.addEventListener('toggle', aoAlternar, true);
  return () => {
    raiz.removeEventListener('change', aoMudar);
    raiz.removeEventListener('click', aoClicarResumo, true);
    raiz.removeEventListener('toggle', aoAlternar, true);
  };
}
