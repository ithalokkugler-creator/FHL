#!/usr/bin/env node
// Verificação do site gerado.
// ==========================
//
//   npm run check
//
// Roda o build e confere, em dist/:
//
//   1. todo href/src relativo aponta para um arquivo que existe;
//   2. todo link de âncora (#algo) aponta para um id que existe na página;
//   3. nenhuma página ficou sem <title> ou sem meta description.
//
// Serve para pegar o erro mais comum de um site de caminhos relativos: um
// slug renomeado em src/data/ e um link esquecido apontando para o antigo.
// Sai com código 1 se achar problema, o que o torna usável em CI.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from './build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const EXTERNO = /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i;

const problemas = [];

const pages = await build({ quiet: true });

for (const pg of pages) {
  const file = join(DIST, pg.path);
  const html = await readFile(file, 'utf8');
  const pastaDaPagina = posix.dirname(pg.path.split('\\').join('/'));

  // ids disponíveis para âncoras nesta página
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  for (const m of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    const alvo = m[1];
    if (!alvo || EXTERNO.test(alvo)) continue;

    if (alvo.startsWith('#')) {
      const id = decodeURIComponent(alvo.slice(1));
      if (id && !ids.has(id)) {
        problemas.push(`${pg.path}: âncora "${alvo}" não existe na página`);
      }
      continue;
    }

    const semHash = alvo.split('#')[0];
    if (!semHash) continue;

    const destino = posix.normalize(posix.join(pastaDaPagina, semHash));
    if (destino.startsWith('..')) {
      problemas.push(`${pg.path}: "${alvo}" escapa da raiz do site`);
      continue;
    }
    if (!existsSync(join(DIST, destino))) {
      problemas.push(`${pg.path}: "${alvo}" → dist/${destino} não existe`);
    }
  }

  if (!/<title>[^<]+<\/title>/.test(html)) {
    problemas.push(`${pg.path}: sem <title>`);
  }
  if (!/<meta name="description" content="[^"]+"/.test(html)) {
    problemas.push(`${pg.path}: sem meta description`);
  }
}

if (problemas.length) {
  console.error(`\n  ${problemas.length} problema(s):\n`);
  for (const p of problemas) console.error(`  · ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`\n  ${pages.length} páginas verificadas — links, âncoras e meta tags OK\n`);
