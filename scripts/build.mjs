#!/usr/bin/env node
// FHL ADVOCACIA — gerador de páginas estáticas
// ============================================
//
// Aplica o shell único de src/layouts/shell.mjs a cada página de src/pages/ e
// escreve o site completo em dist/, junto com uma cópia de assets/, o
// sitemap.xml e o robots.txt.
//
//   npm run build
//
// dist/ é descartável: é apagado e regerado a cada build. Isso resolve de
// graça o problema das páginas órfãs — quando um slug muda, o arquivo antigo
// simplesmente não reaparece, em vez de ficar no disco carregando conteúdo
// desatualizado sem nada apontando para ele.
//
// O site gerado NÃO depende deste script para funcionar: são arquivos .html
// estáticos, servíveis por qualquer host.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AREAS } from '../src/data/areas.mjs';
import { POSTS } from '../src/data/posts.mjs';
import { DOMINIO } from '../src/data/site.mjs';
import { shell } from '../src/layouts/shell.mjs';
import { buildAtuacaoIndex, buildArea } from '../src/pages/atuacao.mjs';
import { buildContato } from '../src/pages/contato.mjs';
import { buildEquipe } from '../src/pages/equipe.mjs';
import { buildEscritorio } from '../src/pages/escritorio.mjs';
import { buildHome } from '../src/pages/home.mjs';
import { build404, buildPrivacidade, buildTermos } from '../src/pages/juridico.mjs';
import { buildPublicacoesIndex, buildPost } from '../src/pages/publicacoes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Monta a lista completa de páginas do site. */
export function allPages() {
  return [
    buildHome(),
    buildEscritorio(),
    buildAtuacaoIndex(),
    buildEquipe(),
    buildPublicacoesIndex(),
    buildContato(),
    buildPrivacidade(),
    buildTermos(),
    build404(),
    ...AREAS.map(buildArea),
    ...POSTS.map(buildPost),
  ];
}

function sitemap(pages) {
  // 404.html fica fora: é uma página de erro, não um destino indexável.
  const entries = pages
    .filter((p) => p.path !== '404.html')
    .map((p) => `  <url><loc>${DOMINIO}/${p.path}</loc></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

const ROBOTS = `User-agent: *
Allow: /

Sitemap: ${DOMINIO}/sitemap.xml
`;

export async function build({ quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);
  const pages = allPages();

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const pg of pages) {
    const out = join(DIST, pg.path);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, shell(pg), 'utf8');
    log(`  ${pg.path}`);
  }

  // Os assets são copiados sem transformação: o CSS e o JS deste site são
  // escritos à mão e servidos como estão.
  await cp(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });
  log('  assets/');

  await writeFile(join(DIST, 'sitemap.xml'), sitemap(pages), 'utf8');
  await writeFile(join(DIST, 'robots.txt'), ROBOTS, 'utf8');
  log('  sitemap.xml\n  robots.txt');

  log(`\n${pages.length} páginas + assets + sitemap.xml + robots.txt → dist/`);
  return pages;
}

// Só roda o build quando este arquivo é o ponto de entrada; o dev server
// importa `build` como função.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
