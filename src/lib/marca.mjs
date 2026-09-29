// A logomarca da FHL — monograma serifado e assinatura com os três nomes.
//
// FONTE ÚNICA — assets/img/logo.svg, vetorizado de LogosNovas/fhl logonova.png.
// Tudo o que mostra a marca sai de lá: o header e o loader (SVG embutido,
// para herdar a cor e poder animar cada parte), e os arquivos derivados de
// `npm run marca` (monograma.svg, favicon, logo.png do JSON-LD, cópias da área
// dos advogados). Trocar a marca é trocar esse arquivo, mantendo os ids.
//
//   #f, #hl       as duas peças do monograma: o F e o HL, que dividem a haste
//   #filete       o traço vertical entre o monograma e os nomes
//   #fonseca, #hespanha, #lisboa   os nomes, com os miolos das letras vazados

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './assets.mjs';

export const FONTE_MARCA = 'assets/img/logo.svg';

const fonte = readFileSync(join(ROOT, FONTE_MARCA), 'utf8');

function caminho(id) {
  const m = fonte.match(new RegExp(`id="${id}" d="([^"]+)"`));
  if (!m) throw new Error(`${FONTE_MARCA}: falta o caminho #${id}`);
  return m[1];
}

const F = caminho('f');
const HL = caminho('hl');
const NOMES = ['fonseca', 'hespanha', 'lisboa'].map(caminho);
const FILETE = fonte.match(/<rect id="filete"([^>]*?)\s*\/>/)?.[1];
if (!FILETE) throw new Error(`${FONTE_MARCA}: falta o retângulo #filete`);

/** Recorte de cada versão, no sistema de coordenadas do logo.svg. */
export const VIEWBOX_ASSINATURA = fonte.match(/viewBox="([^"]+)"/)[1];
export const VIEWBOX_MONOGRAMA = '35 41 430 259';
/** Onde começam os nomes — tudo à esquerda disto é o monograma e o filete. */
const NOMES_X = 509;

/**
 * Só o monograma, em SVG embutido. Sem `cor`, pinta com currentColor: o header
 * troca de claro para escuro sobre as seções claras só mudando `color`.
 */
export function monogramaSvg({ classe = '', cor = 'currentColor' } = {}) {
  return `<svg${classe ? ` class="${classe}"` : ''} viewBox="${VIEWBOX_MONOGRAMA}" fill="${cor}" aria-hidden="true" focusable="false">` +
    `<path d="${F}"/><path d="${HL}"/></svg>`;
}

/**
 * A assinatura completa do loader, com cada parte marcada para o site.js
 * animar: as duas peças do monograma são desenhadas a traço e preenchidas, o
 * filete cresce do centro e os nomes saem de trás dele — o recorte esconde o
 * que ainda está à esquerda do filete.
 */
export function assinaturaLoader() {
  const nomes = NOMES.map((d) => `<path class="loader__nome" d="${d}"/>`).join('');
  const [, , w, h] = VIEWBOX_ASSINATURA.split(' ').map(Number);
  return `<svg class="loader__marca" viewBox="${VIEWBOX_ASSINATURA}" aria-hidden="true" focusable="false">` +
    `<defs><clipPath id="loader-recorte"><rect x="${NOMES_X}" y="0" width="${w}" height="${h + 80}"/></clipPath></defs>` +
    `<path class="loader__letra" d="${F}"/><path class="loader__letra" d="${HL}"/>` +
    `<rect class="loader__filete"${FILETE}/>` +
    `<g clip-path="url(#loader-recorte)" fill-rule="evenodd">${nomes}</g></svg>`;
}

/** Arquivo avulso só com o monograma — marca d'água, área dos advogados. */
export function arquivoMonograma(cor = '#EFF2EF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX_MONOGRAMA}" fill="${cor}">\n` +
    `<title>FHL</title>\n` +
    `<!-- Gerado por npm run marca a partir de ${FONTE_MARCA}. Não editar à mão. -->\n` +
    `<path d="${F}"/>\n<path d="${HL}"/>\n</svg>\n`;
}
