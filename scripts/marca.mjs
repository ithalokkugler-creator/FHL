#!/usr/bin/env node
// Arquivos derivados das marcas
// =============================
//
//   npm run marca
//
// Regera, a partir de assets/img/logo.svg (logomarca FL) e
// assets/img/peixinho.svg (a marca antiga) — ver src/lib/marca.mjs:
//
//   assets/img/marca-dagua.svg  o peixinho numa cor só — marca d'água das seções
//   assets/img/assinatura.svg   FL + FONSECA LISBOA / ADVOCACIA, tinta clara — rodapé
//   assets/img/favicon.png      192×192, o peixinho sobre o carvão
//   assets/img/logo.png         512×512, o FL sobre o carvão — o `logo` do JSON-LD.
//                               O Google mostra esse arquivo sobre fundo
//                               branco: a tinta clara sem fundo sumiria.
//   assets/img/og.png           a imagem de compartilhamento padrão, no mesmo
//                               modelo dos cartões de `npm run og`
//   sistema/img/…               peças para a área dos advogados, que não passa
//                               pelo build e não enxerga assets/: logo completa
//                               (entrada), monograma (menu), assinatura em
//                               carvão (documentos — nunca o peixinho), marca
//                               d'água e favicon
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
  COR_FL, arquivoAssinatura, arquivoLogo, arquivoMarcaDagua, arquivoMonograma, monogramaSvg, peixinhoSvg,
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

const escrever = (rel, conteudo) => {
  writeFileSync(join(ROOT, rel), conteudo, 'utf8');
  console.log(`  ${rel}`);
};
const copiar = (de, para) => {
  copyFileSync(join(ROOT, de), join(ROOT, para));
  console.log(`  ${para}`);
};

function main() {
  escrever('assets/img/marca-dagua.svg', arquivoMarcaDagua());
  escrever('assets/img/assinatura.svg', arquivoAssinatura('#EFF2EF'));

  const navegador = acharNavegador();
  if (!navegador) throw new Error('Chrome ou Edge não encontrado. Informe o executável em CHROME_PATH.');

  const tmp = mkdtempSync(join(tmpdir(), 'fl-marca-'));
  try {
    // Favicon quase de borda a borda: na aba ele tem 16px, e cada pixel de
    // folga é pétala que some. O logo.png tem folga de sobra, porque quem o
    // exibe (Google, redes) costuma recortá-lo em círculo.
    fotografar(navegador, quadrado(192, 176, peixinhoSvg()), join(ROOT, 'assets/img/favicon.png'), tmp, [192, 192]);
    console.log('  assets/img/favicon.png');
    fotografar(navegador, quadrado(512, 300, monogramaSvg()), join(ROOT, 'assets/img/logo.png'), tmp, [512, 512]);
    console.log('  assets/img/logo.png');
    const areas = AREAS.map((a) => a.nome.replace(/^Direito (do )?/, '')).join(' · ');
    fotografar(navegador, cartaoHtml({ label: areas, title: SLOGAN }), join(ROOT, 'assets/img/og.png'), tmp);
    console.log('  assets/img/og.png');
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignora */ }
  }

  escrever('sistema/img/logo.svg', arquivoLogo());
  escrever('sistema/img/monograma.svg', arquivoMonograma());
  escrever('sistema/img/logo-documento.svg', arquivoAssinatura());
  copiar('assets/img/marca-dagua.svg', 'sistema/img/marca-dagua.svg');
  copiar('assets/img/favicon.png', 'sistema/img/favicon.png');
  console.log('\n  Marcas em dia. Rode `npm run og -- --todas` para os cartões das páginas.\n');
}

try {
  main();
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}
