#!/usr/bin/env node
// Verificação do site gerado.
// ==========================
//
//   npm run check
//
// Roda o build e confere, em dist/:
//
//   1. todo href/src relativo aponta para um arquivo que existe;
//   2. toda âncora aponta para um id que existe — na própria página (#algo)
//      ou na página de destino (equipe.html#vinicius-lisboa);
//   3. nenhuma página ficou sem <title> ou sem meta description;
//   4. SEO: canonical nas páginas indexáveis e noindex nas demais, og:image
//      absoluta e apontando para um arquivo que existe, JSON-LD válido.
//
// Serve para pegar o erro mais comum de um site de caminhos relativos: um
// slug renomeado em src/data/ e um link esquecido apontando para o antigo.
// Sai com código 1 se achar problema, o que o torna usável em CI.
//
// Imagem de compartilhamento faltando ou desatualizada é só AVISO: a página
// usa a imagem padrão enquanto isso, e gerar a imagem depende de um navegador
// que um servidor de CI não tem (ver scripts/og.mjs).

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOMINIO } from '../src/data/site.mjs';
import { build } from './build.mjs';
import { estadoDasImagens } from './og.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const EXTERNO = /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i;

const problemas = [];

const pages = await build({ quiet: true });

// ids de cada página gerada, para conferir âncoras entre páginas
// (equipe.html#vinicius-lisboa) além das da própria página.
const idsPorPagina = new Map();
async function idsDe(rel) {
  if (!idsPorPagina.has(rel)) {
    const html = await readFile(join(DIST, rel), 'utf8');
    idsPorPagina.set(rel, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsPorPagina.get(rel);
}

for (const pg of pages) {
  const file = join(DIST, pg.path);
  const html = await readFile(file, 'utf8');
  const pastaDaPagina = posix.dirname(pg.path.split('\\').join('/'));

  // ids disponíveis para âncoras nesta página
  const ids = await idsDe(pg.path);

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
      continue;
    }

    const hash = alvo.split('#')[1];
    if (hash && destino.endsWith('.html') && !(await idsDe(destino)).has(decodeURIComponent(hash))) {
      problemas.push(`${pg.path}: "${alvo}" → a âncora #${hash} não existe em ${destino}`);
    }
  }

  if (!/<title>[^<]+<\/title>/.test(html)) {
    problemas.push(`${pg.path}: sem <title>`);
  }
  if (!/<meta name="description" content="[^"]+"/.test(html)) {
    problemas.push(`${pg.path}: sem meta description`);
  }

  if (pg.noindex) {
    if (!html.includes('<meta name="robots" content="noindex')) {
      problemas.push(`${pg.path}: marcada como noindex, mas sem meta robots`);
    }
  } else if (!/<link rel="canonical" href="https?:\/\/[^"]+">/.test(html)) {
    problemas.push(`${pg.path}: sem canonical`);
  }

  // WhatsApp e Facebook só aceitam og:image com URL absoluta.
  const og = html.match(/<meta property="og:image" content="([^"]*)">/);
  if (!og) {
    problemas.push(`${pg.path}: sem og:image`);
  } else if (!og[1].startsWith(`${DOMINIO}/`)) {
    problemas.push(`${pg.path}: og:image não é absoluta — "${og[1]}"`);
  } else {
    const arquivo = og[1].slice(DOMINIO.length + 1).split('?')[0];
    if (!existsSync(join(DIST, arquivo))) {
      problemas.push(`${pg.path}: og:image → dist/${arquivo} não existe`);
    }
  }

  // JSON-LD com erro de sintaxe é descartado inteiro pelo Google, sem aviso.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch (err) {
      problemas.push(`${pg.path}: JSON-LD inválido — ${err.message}`);
    }
  }
}

const avisos = estadoDasImagens(pages)
  .filter((i) => i.estado !== 'ok')
  .map((i) => `${i.rel}: ${i.estado} — rode npm run og`);

if (avisos.length) {
  console.warn(`\n  ${avisos.length} aviso(s):\n`);
  for (const a of avisos) console.warn(`  · ${a}`);
}

if (problemas.length) {
  console.error(`\n  ${problemas.length} problema(s):\n`);
  for (const p of problemas) console.error(`  · ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`\n  ${pages.length} páginas verificadas — links, âncoras, meta tags e SEO OK\n`);
