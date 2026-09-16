#!/usr/bin/env node
// Imagens de compartilhamento (og:image)
// ======================================
//
//   npm run og               gera as imagens que faltam ou ficaram desatualizadas
//   npm run og -- --todas    regera todas
//
// Cada artigo e cada campanha ganha um cartão 1200×630 com o próprio título:
// é a imagem da prévia quando o link é colado no WhatsApp, no Facebook, no
// LinkedIn ou numa conversa do Instagram. Sem isso, todo link do site
// mostraria a mesma imagem genérica.
//
// COMO — o cartão é montado em HTML, com fontes e marca embutidas, e
// fotografado pelo Chrome ou pelo Edge já instalado na máquina, em modo
// headless. Nenhuma dependência nova. Para usar outro navegador, informe o
// executável em CHROME_PATH.
//
// POR QUE NÃO NO BUILD — o servidor da Vercel não tem navegador. As imagens
// são geradas aqui e versionadas em assets/img/og/, como qualquer outro asset.
// O build só as referencia e, enquanto não existem, usa a imagem padrão (ver
// src/lib/seo.mjs).
//
// DESATUALIZAÇÃO — assets/img/og/manifest.json guarda um hash do HTML de cada
// cartão. Mudou o título, o rótulo ou o modelo abaixo, o hash muda: este script
// regera só o que mudou, e `npm run check` avisa quando falta rodá-lo.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { carregarConteudo } from '../src/data/conteudo.mjs';
import { CIDADE, RAZAO } from '../src/data/site.mjs';
import { ROOT } from '../src/lib/assets.mjs';
import { OG_MANIFEST, lerOgManifest, ogImagePath } from '../src/lib/seo.mjs';
import { allPages } from './build.mjs';

const base64 = (rel) => readFileSync(join(ROOT, rel)).toString('base64');

// "Fonseca Hespanha Lisboa": a razão social depois do travessão.
const SOCIOS = RAZAO.split('—').pop().trim();

/**
 * O cartão em HTML. Fontes e imagens vão embutidas em base64 porque o
 * navegador abre o arquivo por file://, e dali não carrega fonte de outro
 * arquivo. Cores e tipografia são as de assets/css/tokens.css.
 */
export function cartaoHtml({ label, title }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Galano Grotesque';
  src: url(data:font/woff2;base64,${base64('assets/fonts/galano-medium.woff2')}) format('woff2');
  font-weight: 500;
  font-display: block;
}
@font-face {
  font-family: 'Galano Grotesque';
  src: url(data:font/woff2;base64,${base64('assets/fonts/galano-bold.woff2')}) format('woff2');
  font-weight: 700;
  font-display: block;
}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body {
  position: relative;
  background: #0C1917;
  color: #EFF2EF;
  font-family: 'Galano Grotesque', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.marca-dagua {
  position: absolute;
  top: 50%;
  right: -170px;
  height: 900px;
  transform: translateY(-50%);
  opacity: 0.06;
}
.marca {
  position: absolute;
  top: 60px;
  left: 80px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.marca img { height: 48px; }
.marca b { font-size: 25px; font-weight: 700; letter-spacing: 0.02em; }
.marca span { font-size: 14px; font-weight: 500; letter-spacing: 0.18em; color: #9FB2AC; }
.texto {
  position: absolute;
  top: 150px;
  right: 220px;
  bottom: 120px;
  left: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.rotulo {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 26px;
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #A2CBB8;
}
.rotulo::before { content: ''; width: 44px; height: 2px; background: #A2CBB8; }
.titulo {
  font-size: 70px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.rodape {
  position: absolute;
  right: 80px;
  bottom: 52px;
  left: 80px;
  display: flex;
  justify-content: space-between;
  padding-top: 20px;
  border-top: 1px solid #22443D;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #9FB2AC;
}
</style>
</head>
<body>
<img class="marca-dagua" src="data:image/png;base64,${base64('assets/img/logo-watermark.png')}" alt="">
<div class="marca">
  <img src="data:image/png;base64,${base64('assets/img/logo.png')}" alt="">
  <b>FHL</b><span>ADVOCACIA</span>
</div>
<div class="texto">
  <div class="rotulo">${label}</div>
  <div class="titulo">${title}</div>
</div>
<div class="rodape"><span>${SOCIOS}</span><span>${CIDADE}</span></div>
<script>
  // Título longo: diminui a fonte até caber, sem passar de 44px.
  document.fonts.ready.then(function () {
    var caixa = document.querySelector('.texto');
    var titulo = document.querySelector('.titulo');
    var tamanho = 70;
    while (caixa.scrollHeight > caixa.clientHeight && tamanho > 44) {
      tamanho -= 2;
      titulo.style.fontSize = tamanho + 'px';
    }
  });
</script>
</body>
</html>
`;
}

const hashDe = (html) => createHash('sha1').update(html).digest('hex').slice(0, 12);

/** Situação da imagem de cada página com `og`: 'ok', 'faltando' ou 'desatualizada'. */
export function estadoDasImagens(pages = allPages()) {
  const manifest = lerOgManifest();
  return pages.filter((pg) => pg.og).map((pg) => {
    const rel = ogImagePath(pg.path);
    const html = cartaoHtml(pg.og);
    const hash = hashDe(html);
    let estado = 'ok';
    if (!existsSync(join(ROOT, rel))) estado = 'faltando';
    else if (manifest[pg.path] !== hash) estado = 'desatualizada';
    return { path: pg.path, rel, html, hash, estado };
  });
}

function acharNavegador() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const pf = process.env.PROGRAMFILES;
  const pf86 = process.env['PROGRAMFILES(X86)'];
  const local = process.env.LOCALAPPDATA;

  return [
    pf && join(pf, 'Google/Chrome/Application/chrome.exe'),
    pf86 && join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && join(local, 'Google/Chrome/Application/chrome.exe'),
    pf86 && join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    pf && join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].find((c) => c && existsSync(c)) ?? null;
}

function fotografar(navegador, html, destino, tmp) {
  const arquivo = join(tmp, 'cartao.html');
  writeFileSync(arquivo, html, 'utf8');
  mkdirSync(dirname(destino), { recursive: true });
  rmSync(destino, { force: true });

  execFileSync(navegador, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    // Perfil próprio: com o navegador do usuário aberto, o comando seria
    // repassado à janela existente e voltaria sem gerar nada.
    `--user-data-dir=${join(tmp, 'perfil')}`,
    '--window-size=1200,630',
    '--virtual-time-budget=5000',
    `--screenshot=${destino}`,
    pathToFileURL(arquivo).href,
  ], { stdio: 'ignore', timeout: 60_000 });

  if (!existsSync(destino)) throw new Error(`O navegador não gerou ${destino}`);
}

function salvarManifest(manifest) {
  const file = join(ROOT, OG_MANIFEST);
  const ordenado = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))
  );
  const json = JSON.stringify(ordenado, null, 2) + '\n';
  // Reescrever sem mudança dispararia um rebuild à toa no `npm run dev`.
  if (existsSync(file) && readFileSync(file, 'utf8') === json) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, json, 'utf8');
}

async function main() {
  const todas = process.argv.includes('--todas');
  // Artigo e campanha vêm do Supabase (src/data/conteudo.mjs): sem isto, o
  // cartão sairia com o título antigo, ou nem sairia.
  await carregarConteudo();
  const itens = estadoDasImagens();
  const manifest = lerOgManifest();
  let geradas = 0;

  // Página que deixou de existir (slug renomeado, campanha apagada) não deixa
  // imagem órfã em assets/.
  const vivas = new Set(itens.map((i) => i.path));
  for (const path of Object.keys(manifest)) {
    if (vivas.has(path)) continue;
    rmSync(join(ROOT, ogImagePath(path)), { force: true });
    delete manifest[path];
    console.log(`  removida    ${ogImagePath(path)}`);
  }

  const fila = itens.filter((i) => todas || i.estado !== 'ok');
  const tmp = fila.length ? mkdtempSync(join(tmpdir(), 'fhl-og-')) : null;

  try {
    if (fila.length) {
      const navegador = acharNavegador();
      if (!navegador) {
        throw new Error(
          'Chrome ou Edge não encontrado. Informe o executável em CHROME_PATH:\n' +
          '    PowerShell:  $env:CHROME_PATH="C:\\caminho\\chrome.exe"; npm run og\n' +
          '    bash:        CHROME_PATH=/caminho/chrome npm run og'
        );
      }
      for (const item of fila) {
        fotografar(navegador, item.html, join(ROOT, item.rel), tmp);
        manifest[item.path] = item.hash;
        geradas++;
        console.log(`  ${item.estado === 'faltando' ? 'gerada    ' : 'atualizada'}  ${item.rel}`);
      }
    }
  } finally {
    // Salvo mesmo se uma imagem falhar no meio: as que saíram não precisam
    // ser refeitas na próxima vez.
    salvarManifest(manifest);
    if (tmp) {
      // No Windows o navegador às vezes ainda segura o perfil por um instante;
      // nesse caso a pasta fica no temporário do sistema.
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignora */ }
    }
  }

  console.log(geradas
    ? `\n  ${geradas} imagem(ns) em assets/img/og/\n`
    : '\n  Imagens de compartilhamento em dia.\n');
}

// Só roda quando é o ponto de entrada; `npm run check` importa estadoDasImagens.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  });
}
