#!/usr/bin/env node
// Arquivos derivados da logomarca
// ================================
//
//   npm run marca
//
// Regera, a partir de assets/img/logo.svg (a fonte única, ver src/lib/marca.mjs):
//
//   assets/img/monograma.svg    só o monograma — marca d'água das seções
//   assets/img/favicon.png      192×192, monograma claro sobre o petróleo
//   assets/img/logo.png         512×512, idem — o `logo` do JSON-LD. O Google
//                               mostra esse arquivo sobre fundo branco: o
//                               monograma claro sem fundo sumiria.
//   assets/img/og.png           a imagem de compartilhamento padrão, no mesmo
//                               modelo dos cartões de `npm run og`
//   sistema/img/…               as mesmas peças para a área dos advogados, que
//                               não passa pelo build e não enxerga assets/
//
// Os PNG são fotografados pelo Chrome/Edge em modo headless, como os cartões
// de `npm run og`. Rodar de novo só quando o logo.svg mudar.

import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AREAS } from '../src/data/areas.mjs';
import { SLOGAN } from '../src/data/site.mjs';
import { ROOT } from '../src/lib/assets.mjs';
import { FONTE_MARCA, arquivoAssinatura, arquivoMonograma, monogramaSvg } from '../src/lib/marca.mjs';
import { acharNavegador, cartaoHtml, fotografar } from './og.mjs';

/** Monograma claro centrado num quadrado petróleo, ocupando `largura` do lado. */
const quadrado = (lado, largura) => `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${lado}px; height: ${lado}px; overflow: hidden; }
  body { display: grid; place-items: center; background: #0C1917; }
  svg { width: ${largura}px; height: auto; fill: #EFF2EF; }
</style>
${monogramaSvg()}`;

const escrever = (rel, conteudo) => {
  writeFileSync(join(ROOT, rel), conteudo, 'utf8');
  console.log(`  ${rel}`);
};
const copiar = (de, para) => {
  copyFileSync(join(ROOT, de), join(ROOT, para));
  console.log(`  ${para}`);
};

function main() {
  escrever('assets/img/monograma.svg', arquivoMonograma());

  const navegador = acharNavegador();
  if (!navegador) throw new Error('Chrome ou Edge não encontrado. Informe o executável em CHROME_PATH.');

  const tmp = mkdtempSync(join(tmpdir(), 'fhl-marca-'));
  try {
    // Favicon quase de borda a borda: na aba ele tem 16px, e cada pixel de
    // folga é serifa que some. O logo.png tem folga de sobra, porque quem o
    // exibe (Google, redes) costuma recortá-lo em círculo.
    fotografar(navegador, quadrado(192, 164), join(ROOT, 'assets/img/favicon.png'), tmp, [192, 192]);
    console.log('  assets/img/favicon.png');
    fotografar(navegador, quadrado(512, 360), join(ROOT, 'assets/img/logo.png'), tmp, [512, 512]);
    console.log('  assets/img/logo.png');
    const areas = AREAS.map((a) => a.nome.replace(/^Direito (do )?/, '')).join(' · ');
    fotografar(navegador, cartaoHtml({ label: areas, title: SLOGAN }), join(ROOT, 'assets/img/og.png'), tmp);
    console.log('  assets/img/og.png');
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignora */ }
  }

  copiar(FONTE_MARCA, 'sistema/img/logo.svg');
  escrever('sistema/img/logo-documento.svg', arquivoAssinatura());
  copiar('assets/img/monograma.svg', 'sistema/img/monograma.svg');
  copiar('assets/img/favicon.png', 'sistema/img/favicon.png');
  console.log('\n  Marca em dia. Rode `npm run og -- --todas` se o monograma mudou.\n');
}

try {
  main();
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}
