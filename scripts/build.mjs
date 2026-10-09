#!/usr/bin/env node
// FONSECA LISBOA ADVOCACIA — gerador de páginas estáticas
// ============================================
//
// Aplica o shell único de src/layouts/shell.mjs a cada página de src/pages/ e
// escreve o site completo em dist/, junto com uma cópia de assets/, a área dos
// advogados em dist/sistema/, o sitemap.xml e o robots.txt.
//
//   npm run build
//
// O conteúdo das publicações e das campanhas vem do Supabase, escrito pelo
// próprio escritório na área dos advogados (ver src/data/conteudo.mjs). Por
// isso o build é assíncrono e precisa de rede: sem ela, cai na cópia de
// src/data/ e avisa.
//
// dist/ é descartável: é apagado e regerado a cada build. Isso resolve de
// graça o problema das páginas órfãs — quando um slug muda, o arquivo antigo
// simplesmente não reaparece, em vez de ficar no disco carregando conteúdo
// desatualizado sem nada apontando para ele.
//
// O site gerado NÃO depende deste script para funcionar: são arquivos .html
// estáticos, servíveis por qualquer host.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AREAS } from '../src/data/areas.mjs';
import { CAMPANHAS } from '../src/data/campanhas.mjs';
import { carregarConteudo } from '../src/data/conteudo.mjs';
import { POSTS } from '../src/data/posts.mjs';
import { DOMINIO } from '../src/data/site.mjs';
import { shell } from '../src/layouts/shell.mjs';
import { absUrl } from '../src/lib/seo.mjs';
import { buildAtuacaoIndex, buildArea } from '../src/pages/atuacao.mjs';
import { buildCampanha } from '../src/pages/campanhas.mjs';
import { buildContato } from '../src/pages/contato.mjs';
import { buildEquipe } from '../src/pages/equipe.mjs';
import { buildEscritorio } from '../src/pages/escritorio.mjs';
import { buildHome } from '../src/pages/home.mjs';
import { build404, buildPrivacidade, buildTermos } from '../src/pages/juridico.mjs';
import { buildPublicacoesIndex, buildPost } from '../src/pages/publicacoes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// A área dos advogados sai no mesmo deploy, em /sistema. Um endereço só para
// as duas partes: o site tem link para ela no rodapé, ela tem link de volta
// para o site, e não existe um segundo projeto na Vercel para manter.
// Ela não tem build — é servida como está, igual ao que `npm run sistema`
// fazia antes. Testes e documentação não vão ao ar.
const SISTEMA = 'sistema';
const FORA_DO_SISTEMA = ['testes', 'README.md'];

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
    ...CAMPANHAS.map(buildCampanha),
  ];
}

function sitemap(pages) {
  // Fica fora o que é noindex: a 404 e as campanhas fora do período.
  // Artigos levam a data de publicação, que ajuda o Google a achar o que é novo.
  const entries = pages
    .filter((p) => !p.noindex)
    .map((p) => {
      const lastmod = p.article ? `<lastmod>${p.article.datetime}</lastmod>` : '';
      return `  <url><loc>${absUrl(p.path)}</loc>${lastmod}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

// A área dos advogados já sai com noindex no HTML e no cabeçalho da resposta;
// aqui é só para nenhum robô gastar tempo com ela.
const ROBOTS = `User-agent: *
Allow: /
Disallow: /${SISTEMA}/

Sitemap: ${DOMINIO}/sitemap.xml
`;

export async function build({ quiet = false, local = false, destino = DIST } = {}) {
  const saida = resolve(destino);
  // As duas saídas são descartáveis. Nunca apaga outro caminho recebido.
  if (![DIST, join(ROOT, '.local', 'previa')].includes(saida)) {
    throw new Error('Destino do build deve ser dist/ ou .local/previa/.');
  }
  const log = quiet ? () => {} : (...a) => console.log(...a);

  // Antes de montar qualquer página: é isto que enche POSTS e CAMPANHAS.
  const { imagens } = await carregarConteudo({ quiet, local });
  const pages = allPages();

  await rm(saida, { recursive: true, force: true });
  await mkdir(saida, { recursive: true });

  for (const pg of pages) {
    const out = join(saida, pg.path);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, shell(pg), 'utf8');
    log(`  ${pg.path}`);
  }

  // Os assets são copiados sem transformação: o CSS e o JS deste site são
  // escritos à mão e servidos como estão. O manifesto das imagens de
  // compartilhamento é controle interno de `npm run og` e não vai ao ar.
  await cp(join(ROOT, 'assets'), join(saida, 'assets'), {
    recursive: true,
    filter: (src) => !src.endsWith('manifest.json'),
  });
  log('  assets/');

  // Imagens enviadas pela área dos advogados: vêm do Storage do Supabase e
  // entram junto com os assets do repositório, como se sempre tivessem estado
  // lá. Depois da cópia, para não serem apagadas por ela.
  for (const imagem of imagens) {
    const out = join(saida, imagem.rel);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, imagem.bytes);
    log(`  ${imagem.rel}`);
  }

  await cp(join(ROOT, SISTEMA), join(saida, SISTEMA), {
    recursive: true,
    filter: (src) => !FORA_DO_SISTEMA.some((f) => src.endsWith(`${sep}${f}`)),
  });
  log('  sistema/');

  await writeFile(join(saida, 'sitemap.xml'), sitemap(pages), 'utf8');
  await writeFile(join(saida, 'robots.txt'), ROBOTS, 'utf8');
  log('  sitemap.xml\n  robots.txt');

  log(`\n${pages.length} páginas + assets + sistema + sitemap.xml + robots.txt → ${saida}`);
  return pages;
}

// Só roda o build quando este arquivo é o ponto de entrada; check.mjs e og.mjs
// importam `build` e `allPages` como funções. O dev server passa `--quiet`.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  build({ quiet: process.argv.includes('--quiet') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
