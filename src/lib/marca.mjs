// As duas marcas do escritório.
//
// FL — a logomarca da Fonseca Lisboa Advocacia: o monograma FL cruzado pelo
// traço em três faixas, "FONSECA LISBOA" e "ADVOCACIA" entre filetes.
// FONTE ÚNICA: assets/img/logo.svg, gerado por LogosNovas/FL/_fonte/gerar.py
// a partir de "Fonseca Lisboa Logo final.png". Ids lidos aqui:
//
//   #monograma (data-caixa)   o grupo do FL
//     #fl                       as letras
//     #traco                    o traço inteiro, na cor da tinta (faixa de cima)
//     #traco-terra, #traco-verde   as faixas coloridas, por cima
//   #nome (data-caixa)        FONSECA LISBOA
//   #advocacia (data-caixa)   #filete-esquerdo, #advocacia-letras, #filete-direito
//
// PEIXINHO — a marca antiga (Logo.jpg), que os advogados pediram de volta:
// três pétalas. FONTE: assets/img/peixinho.svg (#petala-teal, -vinho, -menta).
//
// Onde cada uma aparece: o FL no cabeçalho, no rodapé, na área dos advogados,
// nos documentos e nas imagens de compartilhamento; o peixinho na abertura da
// home, nas marcas d'água das seções e no favicon. O peixinho NUNCA vai para os
// documentos gerados (pedido do escritório).
//
// Os arquivos derivados (marca d'água, favicon, logo.png, og.png, cópias da
// área dos advogados) saem de `npm run marca`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './assets.mjs';

export const FONTE_MARCA = 'assets/img/logo.svg';
export const FONTE_PEIXINHO = 'assets/img/peixinho.svg';

/** Paleta da logomarca FL. */
export const COR_FL = {
  carvao: '#202322',
  grafite: '#323A37',
  verde: '#435B54',
  salvia: '#CCDBCC',
  terra: '#4B3D37',
};

const fl = readFileSync(join(ROOT, FONTE_MARCA), 'utf8');
const px = readFileSync(join(ROOT, FONTE_PEIXINHO), 'utf8');

function elemento(fonte, nomeFonte, id) {
  const m = fonte.match(new RegExp(`<(path|g|rect)\\b[^>]*\\bid="${id}"[^>]*>`));
  if (!m) throw new Error(`${nomeFonte}: falta o elemento #${id}`);
  return m[0];
}
const atributo = (tag, nome) => tag.match(new RegExp(`\\s${nome}="([^"]+)"`))?.[1];
const caminho = (id) => atributo(elemento(fl, FONTE_MARCA, id), 'd');
const caixa = (id) => atributo(elemento(fl, FONTE_MARCA, id), 'data-caixa').split(' ').map(Number);
const retangulo = (id) => {
  const tag = elemento(fl, FONTE_MARCA, id);
  return ['x', 'y', 'width', 'height'].map((a) => `${a}="${atributo(tag, a)}"`).join(' ');
};

const FL = caminho('fl');
const TRACO = caminho('traco');
const TRACO_TERRA = caminho('traco-terra');
const TRACO_VERDE = caminho('traco-verde');
const NOME = caminho('nome');
const ADV = caminho('advocacia-letras');
const FILETE_E = retangulo('filete-esquerdo');
const FILETE_D = retangulo('filete-direito');

const CX_MONO = caixa('monograma');
const CX_NOME = caixa('nome');
const CX_ADV = caixa('advocacia');

const PETALAS = ['teal', 'vinho', 'menta'].map((nome) => {
  const tag = elemento(px, FONTE_PEIXINHO, `petala-${nome}`);
  return { nome, d: atributo(tag, 'd'), cor: atributo(tag, 'fill') };
});
const VIEWBOX_PEIXINHO = atributo(px.match(/<svg[^>]*>/)[0], 'viewBox');
const [, , PX_L, PX_A] = VIEWBOX_PEIXINHO.split(' ').map(Number);
const MEDIDAS_PEIXINHO = `width="${Math.round(PX_L)}" height="${Math.round(PX_A)}"`;

const uniao = (...cs) => [
  Math.min(...cs.map((c) => c[0])), Math.min(...cs.map((c) => c[1])),
  Math.max(...cs.map((c) => c[2])), Math.max(...cs.map((c) => c[3])),
];
const n = (v) => +v.toFixed(1);
/**
 * viewBox de uma caixa [x0, y0, x1, y1]. A folga padrão cobre o traço, cujas
 * curvas passam alguns décimos da caixa medida, e não deixa letra encostar
 * na borda do desenho.
 */
const FOLGA = 10;
const vb = (c, m = FOLGA) => `${n(c[0] - m)} ${n(c[1] - m)} ${n(c[2] - c[0] + 2 * m)} ${n(c[3] - c[1] + 2 * m)}`;
/** width/height iguais à caixa: o CSS só fixa a altura e a largura sai da proporção. */
const medidas = (c, m = FOLGA) => `width="${Math.round(c[2] - c[0] + 2 * m)}" height="${Math.round(c[3] - c[1] + 2 * m)}"`;
const abre = (c, { classe = '', cor = 'currentColor' } = {}) =>
  `<svg${classe ? ` class="${classe}"` : ''} viewBox="${vb(c)}" ${medidas(c)} fill="${cor}" fill-rule="evenodd" ` +
  `aria-hidden="true" focusable="false">`;

// --- peças em SVG --------------------------------------------------------------

/**
 * O FL com o traço. Letras e faixa de cima herdam o `fill` do <svg> (a tinta);
 * as faixas terra e verde têm cor própria — ou nenhuma, com `mono`, e aí o
 * traço vira uma peça só, na tinta.
 */
const monograma = (mono = false) => mono
  ? `<path d="${FL}"/><path d="${TRACO}"/>`
  : `<path d="${FL}"/><path d="${TRACO}"/>` +
    `<path fill="${COR_FL.terra}" d="${TRACO_TERRA}"/><path fill="${COR_FL.verde}" d="${TRACO_VERDE}"/>`;

const advocacia = () => `<rect ${FILETE_E}/><path d="${ADV}"/><rect ${FILETE_D}/>`;

/**
 * Só o monograma FL, em SVG embutido. A tinta é currentColor: o header troca
 * de claro para escuro sobre as seções claras só mudando `color`; as faixas
 * terra e verde ficam com as cores da marca. `mono` pinta tudo de uma cor.
 */
export function monogramaSvg({ classe = '', cor = 'currentColor', mono = false } = {}) {
  return abre(CX_MONO, { classe, cor }) + monograma(mono) + '</svg>';
}

/** FONSECA LISBOA, uma linha, na cor do texto. */
export function nomeSvg({ classe = '', cor = 'currentColor' } = {}) {
  return abre(CX_NOME, { classe, cor }) + `<path d="${NOME}"/></svg>`;
}

/**
 * O peixinho embutido. Sem `cor`, nas cores originais; com `cor`, as três
 * pétalas numa cor só (marca d'água).
 */
export function peixinhoSvg({ classe = '', cor = '' } = {}) {
  const petalas = PETALAS.map((p) => `<path fill="${cor || p.cor}" d="${p.d}"/>`).join('');
  return `<svg${classe ? ` class="${classe}"` : ''} viewBox="${VIEWBOX_PEIXINHO}" ${MEDIDAS_PEIXINHO} aria-hidden="true" focusable="false">${petalas}</svg>`;
}

/**
 * A abertura da home. Em cima, lado a lado: o peixinho à esquerda e o FL à
 * direita, separados por um filete vertical. Os contornos (.loader__traco) são
 * desenhados a traço menta e depois preenchidos pelo site.js — as pétalas nas
 * próprias cores, o FL na tinta; as faixas terra e verde do traço do FL
 * (.loader__faixa) entram por último. Embaixo, FONSECA LISBOA com ADVOCACIA
 * entre filetes: o nome é revelado por um recorte que corre da esquerda
 * (#loader-revela).
 */
export function aberturaLoader() {
  const petalas = PETALAS.map((p) =>
    `<path class="loader__traco" fill="${p.cor}" d="${p.d}"/>`).join('');
  const cx = uniao(CX_NOME, CX_ADV);
  return `<div class="loader__marcas">` +
    `<svg class="loader__peixe" viewBox="${VIEWBOX_PEIXINHO}" ${MEDIDAS_PEIXINHO} aria-hidden="true" focusable="false">${petalas}</svg>` +
    `<span class="loader__divisor"></span>` +
    abre(CX_MONO, { classe: 'loader__fl' }) +
    `<path class="loader__traco" d="${FL}"/><path class="loader__traco" d="${TRACO}"/>` +
    `<path class="loader__faixa" fill="${COR_FL.terra}" d="${TRACO_TERRA}"/>` +
    `<path class="loader__faixa" fill="${COR_FL.verde}" d="${TRACO_VERDE}"/></svg>` +
    `</div>` +
    `<svg class="loader__nome" viewBox="${vb(cx)}" ${medidas(cx)} fill="currentColor" fill-rule="evenodd" aria-hidden="true" focusable="false">` +
    `<defs><clipPath id="loader-revela"><rect class="loader__revela" x="${n(cx[0])}" y="${n(cx[1] - 20)}" width="${n(cx[2] - cx[0])}" height="${n(CX_NOME[3] - cx[1] + 40)}"/></clipPath></defs>` +
    `<path class="loader__letras" clip-path="url(#loader-revela)" d="${NOME}"/>` +
    `<rect class="loader__filete" data-lado="esquerdo" ${FILETE_E}/>` +
    `<path class="loader__advocacia" d="${ADV}"/>` +
    `<rect class="loader__filete" data-lado="direito" ${FILETE_D}/>` +
    `</svg>`;
}

// --- arquivos avulsos (npm run marca) -----------------------------------------

const arquivo = (titulo, c, corpo, { cor, m = FOLGA } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb(c, m)}"${cor ? ` fill="${cor}"` : ''} fill-rule="evenodd">\n` +
  `<title>${titulo}</title>\n` +
  `<!-- Gerado por npm run marca a partir de ${FONTE_MARCA} e ${FONTE_PEIXINHO}. Não editar à mão. -->\n` +
  `${corpo}\n</svg>\n`;

/**
 * FL + nome com ADVOCACIA ao lado, centrados na altura do FL — o mesmo arranjo
 * de LogosNovas/FL/svg/horizontal. Devolve [corpo, caixa].
 */
function horizontal() {
  const bloco = uniao(CX_NOME, CX_ADV);
  const altMono = CX_MONO[3] - CX_MONO[1];
  const k = (0.52 * altMono) / (bloco[3] - bloco[1]);
  const dx = CX_MONO[2] + 0.16 * altMono - bloco[0] * k;
  const dy = (CX_MONO[1] + CX_MONO[3]) / 2 - ((bloco[1] + bloco[3]) / 2) * k;
  const corpo = monograma() +
    `<g transform="translate(${n(dx)} ${n(dy)}) scale(${k.toFixed(5)})"><path d="${NOME}"/>${advocacia()}</g>`;
  return [corpo, uniao(CX_MONO, [bloco[0] * k + dx, bloco[1] * k + dy, bloco[2] * k + dx, bloco[3] * k + dy])];
}

/** Só o monograma FL, num arquivo — cabeçalho da área dos advogados. */
export function arquivoMonograma(cor = '#EFF2EF') {
  return arquivo('FL — Fonseca Lisboa Advocacia', CX_MONO, monograma(), { cor });
}

/** A logomarca completa (FL, nome, ADVOCACIA) — tela de entrada da área dos advogados. */
export function arquivoLogo(cor = '#EFF2EF') {
  const c = uniao(CX_MONO, CX_NOME, CX_ADV);
  return arquivo('Fonseca Lisboa Advocacia', c, monograma() + `<path d="${NOME}"/>` + advocacia(), { cor });
}

/**
 * A assinatura horizontal: rodapé do site (tinta clara) e cabeçalho dos
 * documentos gerados (tinta carvão sobre o papel branco).
 */
export function arquivoAssinatura(cor = COR_FL.carvao) {
  const [corpo, c] = horizontal();
  return arquivo('Fonseca Lisboa Advocacia', c, corpo, { cor });
}

/** O peixinho numa cor só, para as marcas d'água das seções. */
export function arquivoMarcaDagua(cor = '#EFF2EF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX_PEIXINHO}" fill="${cor}">\n` +
    `<title>Fonseca Lisboa Advocacia</title>\n` +
    `<!-- Gerado por npm run marca a partir de ${FONTE_PEIXINHO}. Não editar à mão. -->\n` +
    PETALAS.map((p) => `<path d="${p.d}"/>`).join('\n') + '\n</svg>\n';
}
