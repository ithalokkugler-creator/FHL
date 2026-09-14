#!/usr/bin/env node
// Servidor local de desenvolvimento.
// =================================
//
//   npm run dev              porta 8123
//   npm run dev -- 3000      outra porta
//   npm run preview          serve dist/ como está, sem watch nem reload
//
// Faz três coisas que o http.server do Python não fazia:
//
//   1. Rebuild automático. Salvar qualquer arquivo em src/ ou assets/ regera
//      o site antes da próxima requisição.
//   2. Live reload. O navegador recarrega sozinho, via SSE — sem extensão,
//      sem dependência, sem apertar F5.
//   3. no-store em tudo. O cache do navegador fazia uma alteração de CSS
//      parecer que não tinha surtido efeito.
//
// Escuta só em 127.0.0.1: é um servidor de desenvolvimento, não fica exposto
// na rede local.

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUILD = join(ROOT, 'scripts', 'build.mjs');

const args = process.argv.slice(2);
const NO_WATCH = args.includes('--no-watch');
const PORT = Number(args.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
};

// Injetado no fim de cada HTML servido. Reabre a conexão sozinho se o
// servidor reiniciar, então um crash do build não deixa a aba morta.
const RELOAD_SNIPPET = `
<script>
(function () {
  var es = new EventSource('/__dev/events');
  es.addEventListener('reload', function () { location.reload(); });
  es.onerror = function () { es.close(); setTimeout(function () { location.reload(); }, 1000); };
})();
</script>
`;

/** Clientes SSE conectados, para avisar do rebuild. */
const clients = new Set();

function notifyReload() {
  for (const res of clients) {
    res.write('event: reload\ndata: 1\n\n');
  }
}

/** Resolve a URL para um caminho dentro de dist/, barrando path traversal. */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const full = join(DIST, rel);
  if (full !== DIST && !full.startsWith(DIST + sep)) return null;
  return full;
}

/** Acha o arquivo a servir: caminho exato, ou index.html se for diretório. */
async function locate(full) {
  try {
    const s = await stat(full);
    if (s.isDirectory()) {
      const index = join(full, 'index.html');
      await stat(index);
      return index;
    }
    return full;
  } catch {
    return null;
  }
}

async function send(res, file, status = 200) {
  const ext = extname(file).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  let body = await readFile(file);

  if (ext === '.html' && !NO_WATCH) {
    const html = body.toString('utf8');
    body = Buffer.from(
      html.includes('</body>')
        ? html.replace('</body>', RELOAD_SNIPPET + '</body>')
        : html + RELOAD_SNIPPET,
      'utf8'
    );
  }

  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    // Sem isto, uma alteração de CSS parece não ter surtido efeito.
    'Cache-Control': 'no-store, must-revalidate',
    'Pragma': 'no-cache',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.url === '/__dev/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  try {
    const full = safePath(req.url);
    const file = full && (await locate(full));

    if (file) {
      await send(res, file);
      return;
    }

    // Mesma página de erro que o host vai servir em produção.
    const notFound = join(DIST, '404.html');
    if (await locate(notFound)) {
      await send(res, notFound, 404);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500');
  }
});

// ---------------------------------------------------------------------------

/**
 * Roda o build num processo Node novo a cada vez.
 *
 * Importar build.mjs e chamá-lo daqui não funcionava: o Node guarda em cache
 * os módulos ESM já carregados, então salvar um arquivo de src/data/ ou
 * src/pages/ disparava um "rebuild" com o código antigo — só o CSS e o JS,
 * copiados de assets/, pareciam mudar. Um processo novo lê tudo do disco.
 */
function buildIsolado() {
  return new Promise((ok, falha) => {
    execFile(process.execPath, [BUILD, '--quiet'], { cwd: ROOT }, (err, _stdout, stderr) => {
      if (err) falha(new Error(stderr.trim() || err.message));
      else ok();
    });
  });
}

let rebuilding = false;
let pending = false;
let timer = null;

async function rebuild() {
  if (rebuilding) {
    pending = true;
    return;
  }
  rebuilding = true;
  const t0 = Date.now();
  try {
    await buildIsolado();
    console.log(`  rebuild em ${Date.now() - t0}ms`);
    notifyReload();
  } catch (err) {
    // Um erro de sintaxe no template não deve matar o servidor: mostra o
    // problema e segue servindo a última build boa.
    console.error('\n  ERRO no build — mantendo a versão anterior:\n');
    console.error(err.message);
  } finally {
    rebuilding = false;
    if (pending) {
      pending = false;
      rebuild();
    }
  }
}

function scheduleRebuild() {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 80);
}

await buildIsolado();

if (!NO_WATCH) {
  for (const dir of ['src', 'assets', 'scripts']) {
    try {
      watch(join(ROOT, dir), { recursive: true }, scheduleRebuild);
    } catch {
      console.warn(`  aviso: não foi possível observar ${dir}/`);
    }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  FHL Advocacia — http://127.0.0.1:${PORT}`);
  console.log(NO_WATCH ? '  modo preview (sem watch)\n' : '  observando src/ e assets/ — Ctrl+C para parar\n');
});
