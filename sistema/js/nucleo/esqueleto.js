// Esqueleto de carregamento das telas principais (21/10/2026).
// ============================================================
//
// Enquanto a tela busca os dados, blocos cinza no formato dela — lista,
// painel com números ou agenda — no lugar do "Carregando…". Só decoração:
// nada de número, nome ou texto que possa ser lido como dado (num sistema
// que é prova, um bloco vazio não pode parecer "nenhuma intimação"). O
// leitor de tela continua ouvindo "Carregando…".
//
// Aparece só se o carregamento passar de ESPERA ms: tela rápida não pisca.
// Quem tira o esqueleto é a própria tela, ao desenhar no lugar; o erro do
// roteador também desenha por cima.

import { html } from './html.js';

export const ESPERA = 300;

const barra = (classe = '') => html`<span class="esq esq-barra ${classe}"></span>`;
const cabecalho = () => html`<div class="esq-topo">${barra('esq-titulo')}${barra('esq-sub')}</div>`;
const linhas = (n) => html`<div class="painel esq-painel">${Array.from({ length: n }, () => html`
  <div class="esq-linha">${barra('esq-linha__a')}${barra('esq-linha__b')}</div>`)}</div>`;

const FORMATOS = {
  lista: () => html`
    ${cabecalho()}
    <div class="esq-filtros">${barra('esq-campo')}${barra('esq-campo')}${barra('esq-campo esq-campo--largo')}</div>
    ${linhas(6)}`,
  painel: () => html`
    ${cabecalho()}
    <div class="esq-indicadores">${Array.from({ length: 4 }, () => html`
      <div class="esq-indicador">${barra('esq-rotulo')}${barra('esq-valor')}</div>`)}</div>
    <div class="esq-colunas">${linhas(4)}${linhas(4)}</div>`,
  agenda: () => html`
    ${cabecalho()}
    <div class="esq-filtros">${barra('esq-campo')}${barra('esq-campo')}${barra('esq-campo')}</div>
    <div class="painel esq-grade">${Array.from({ length: 5 }, () => html`
      <div class="esq-dia">${barra('esq-rotulo')}${Array.from({ length: 3 }, () => barra('esq-evento'))}</div>`)}</div>`,
};

/**
 * Só as linhas, para dentro de um painel de tela que já desenhou o próprio
 * cabeçalho e filtros (Contratos, Recebíveis). Aparece depois de ESPERA ms
 * pelo CSS (esqueleto--atrasado), sem relógio na tela.
 */
export const linhasEsqueleto = (n = 6) => html`
  <div class="esqueleto esqueleto--atrasado" data-esqueleto>
    <p class="sr-only" role="status">Carregando…</p>
    <div aria-hidden="true">${Array.from({ length: n }, () => html`
      <div class="esq-linha">${barra('esq-linha__a')}${barra('esq-linha__b')}</div>`)}</div>
  </div>`;

/** O esqueleto de um formato; formato desconhecido cai no "Carregando…" de sempre. */
export function esqueleto(formato) {
  const desenho = FORMATOS[formato];
  if (!desenho) return html`<p class="carregando" role="status">Carregando…</p>`;
  return html`
    <div class="esqueleto esqueleto--${formato}" data-esqueleto>
      <p class="sr-only" role="status">Carregando…</p>
      <div aria-hidden="true">${desenho()}</div>
    </div>`;
}
