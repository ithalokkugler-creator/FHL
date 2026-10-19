#!/usr/bin/env node
// Arquivos derivados das marcas
// =============================
//
//   npm run marca
//
// Regera, a partir de assets/img/logo.svg (logomarca FL) — ver src/lib/marca.mjs:
//
//   assets/img/assinatura.svg   FL + FONSECA LISBOA / ADVOCACIA, tinta clara — rodapé
//   assets/img/favicon.png      192×192, o monograma FL sobre o carvão
//   assets/img/logo.png         512×512, o FL sobre o carvão — o `logo` do JSON-LD.
//                               O Google mostra esse arquivo sobre fundo
//                               branco: a tinta clara sem fundo sumiria.
//   assets/img/og.png           a imagem de compartilhamento padrão, no mesmo
//                               modelo dos cartões de `npm run og`
//   sistema/img/…               peças para a área dos advogados, que não passa
//                               pelo build e não enxerga assets/: logo completa
//                               (entrada), monograma (menu), assinatura em
//                               carvão (documentos) e favicon
//
// Os PNG são fotografados pelo Chrome/Edge em modo headless, como os cartões
// de `npm run og`. Rodar de novo só quando uma das fontes mudar.

import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AREAS } from '../src/data/areas.mjs';
import { SLOGAN } from '../src/data/site.mjs';
import { ROOT } from '../src/lib/assets.mjs';
import {
  COR_FL, arquivoAssinatura, arquivoLogo, arquivoMonograma, monogramaSvg,
} from '../src/lib/marca.mjs';
import { acharNavegador, cartaoHtml, fotografar } from './og.mjs';

/** Uma marca centrada num quadrado carvão, com `altura` de lado a lado. */
const quadrado = (lado, altura, svg) => `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${lado}px; height: ${lado}px; overflow: hidden; }
  body { display: grid; place-items: center; background: ${COR_FL.carvao}; color: #FFFFFF; }
  svg { display: block; height: ${altura}px; width: auto; }
</style>
${svg}`;

/**
 * O og.png: as áreas no rótulo e o slogan. Até quatro áreas cabem numa linha;
 * com mais, o rótulo vai em duas linhas equilibradas, com o filete na altura
 * da primeira — quebrada pelo navegador, a última área sobrava sozinha.
 */
function cartaoPadrao() {
  const nomes = AREAS.map((a) => a.nome.replace(/^Direito (do )?/, ''));
  if (nomes.length <= 4) return { label: nomes.join(' · '), title: SLOGAN };
  const meio = Math.ceil(nomes.length / 2);
  return {
    label: `<span>${nomes.slice(0, meio).join(' · ')}<br>${nomes.slice(meio).join(' · ')}</span>`,
    title: SLOGAN,
    css: '.rotulo { align-items: flex-start; line-height: 1.6; }\n' +
      '.rotulo::before { flex: 0 0 auto; margin-top: calc(0.8em - 1px); }\n',
  };
}

const escrever = (rel, conteudo) => {
  writeFileSync(join(ROOT, rel), conteudo, 'utf8');
  console.log(`  ${rel}`);
};
const copiar = (de, para) => {
  copyFileSync(join(ROOT, de), join(ROOT, para));
  console.log(`  ${para}`);
};

function main() {
  escrever('assets/img/assinatura.svg', arquivoAssinatura('#EFF2EF'));

  const navegador = acharNavegador();
  if (!navegador) throw new Error('Chrome ou Edge não encontrado. Informe o executável em CHROME_PATH.');

  const tmp = mkdtempSync(join(tmpdir(), 'fl-marca-'));
  try {
    // Favicon quase de borda a borda: na aba ele tem 16px, e cada pixel de
    // folga é traço que some. O logo.png tem folga de sobra, porque quem o
    // exibe (Google, redes) costuma recortá-lo em círculo.
    fotografar(navegador, quadrado(192, 128, monogramaSvg()), join(ROOT, 'assets/img/favicon.png'), tmp, [192, 192]);
    console.log('  assets/img/favicon.png');
    fotografar(navegador, quadrado(512, 300, monogramaSvg()), join(ROOT, 'assets/img/logo.png'), tmp, [512, 512]);
    console.log('  assets/img/logo.png');
    fotografar(navegador, cartaoHtml(cartaoPadrao()), join(ROOT, 'assets/img/og.png'), tmp);
    console.log('  assets/img/og.png');
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignora */ }
  }

  escrever('sistema/img/logo.svg', arquivoLogo());
  escrever('sistema/img/monograma.svg', arquivoMonograma());
  escrever('sistema/img/logo-documento.svg', arquivoAssinatura());
  copiar('assets/img/favicon.png', 'sistema/img/favicon.png');
  console.log('\n  Marcas em dia. Rode `npm run og -- --todas` para os cartões das páginas.\n');
}

try {
  main();
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}
