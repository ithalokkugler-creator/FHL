#!/usr/bin/env node
// Prévia isolada das funções novas: `npm run testar:local`.
// ========================================================
//
// O mesmo frontend e o mesmo handler HTTP do formulário (receber-contato),
// com um banco fictício em memória (scripts/local/dados.mjs). Não carrega
// credenciais, não chama o Supabase nem a Vercel e não usa login real: o
// perfil vem do endereço (?perfil=admin, socia, secretaria…).
//
// O build vai para .local/previa/, separado de dist/. Mudou código? Encerre
// (Ctrl+C) e rode de novo — não há recarga automática.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarRecebedor } from '../supabase/functions/receber-contato/handler.js';
import { apiFicticia, criarDados } from './local/dados.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, '.local', 'previa');
const porta = Number(process.env.PORT_TESTE || 8125);
if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) {
  throw new Error('PORT_TESTE deve ser uma porta entre 1024 e 65535.');
}
const origem = `http://127.0.0.1:${porta}`;
// localhost e 127.0.0.1 são a mesma máquina: aceitar os dois evita o 403
// de quem abre a prévia por http://localhost:<porta>.
const origensLocais = new Set([origem, `http://localhost:${porta}`]);

// Antes de importar o build: todos os formulários do site apontam para a prévia.
process.env.FORM_ENDPOINT = '/__teste/functions/v1/receber-contato';
const { build } = await import('./build.mjs');
await build({ local: true, quiet: true, destino: DIST });

let dados = criarDados();
const receber = criarRecebedor({
  url: `${origem}/__teste`,
  chave: 'sb_secret_PREVIA_FICTICIA',
  sal: 'SAL-FICTICIO-APENAS-NA-PREVIA-LOCAL-SEM-CREDENCIAIS',
  buscar: (url, init) => apiFicticia(dados, new Request(url, init)),
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};
const texto = (corpo, tipo = MIME['.html'], status = 200) => new Response(corpo, { status, headers: { 'Content-Type': tipo } });

// Mesmas restrições do sistema publicado (vercel.json), com conexões só para a prévia.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
  + "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

// ---------------------------------------------------------------------------
// Painel da prévia (/__teste): perfis, atalhos e restaurar
// ---------------------------------------------------------------------------

const CLIENTE_EXEMPLO = '00000000-0000-4000-8000-000000000202';
const link = (perfil, rota, rotulo) => `<a href="/sistema/?perfil=${perfil}#${rota}">${rotulo}</a>`;

const paginaControle = `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prévia local — FHL</title>
<link rel="stylesheet" href="/sistema/css/sistema.css">
<link rel="stylesheet" href="/__teste/painel.css">
<body>
<main class="previa">
  <h1 class="pagina__titulo">Prévia local — sistema FHL</h1>
  <p class="pagina__sub">Todos os nomes e dados são fictícios. As alterações ficam na memória deste servidor:
    reiniciar ou restaurar apaga os testes. O sistema nunca envia mensagem sozinho.</p>

  <h2 class="secao__titulo secao">Perfis</h2>
  <ul class="previa__lista">
    <li>${link('admin', '/inicio', 'Administrador')} — todos os acessos, inclusive Membros.</li>
    <li>${link('socia', '/inicio', 'Sócia')} — Clientes, Prazos, Site e Financeiro completo; edita só a própria agenda; sem Membros.</li>
    <li>${link('secretaria', '/inicio', 'Secretária')} — Clientes, agenda de todos e lançamentos, sem fechamento; começa com um cronômetro esquecido há nove horas.</li>
    <li>${link('sem-clientes', '/tarefas', 'Associado sem Clientes e Prazos')} — trabalha nas tarefas recebidas e vê a agenda, editando só a própria.</li>
    <li>${link('clientes-sem-financeiro', '/clientes', 'Equipe só de Clientes')} — ficha sem Agenda e Financeiro.</li>
  </ul>

  <h2 class="secao__titulo secao">Atalhos (como administrador)</h2>
  <ul class="previa__lista">
    <li>${link('admin', '/contatos', 'Contatos')} · <a href="/contato.html">formulário do site</a> · <a href="/campanhas/acidente-de-trabalho.html">formulário de campanha</a>
      — o quarto envio público em dez minutos é bloqueado.</li>
    <li>${link('admin', '/clientes', 'Clientes')} · ${link('admin', `/clientes/${CLIENTE_EXEMPLO}`, 'ficha completa de exemplo')} · ${link('admin', '/processos', 'Processos')}</li>
    <li>${link('admin', `/documentos/novo?cliente=${CLIENTE_EXEMPLO}`, 'Gerar documento')} · ${link('admin', '/documentos', 'Documentos gerados')}</li>
    <li>${link('admin', '/atualizacoes', 'Atualizações e cronômetro')} · ${link('admin', `/atualizacoes/relatorio?cliente=${CLIENTE_EXEMPLO}`, 'Relatório de atividades')}</li>
    <li>${link('admin', '/tarefas', 'Tarefas')} · ${link('admin', '/prazos', 'Prazos')} · ${link('admin', '/feriados', 'Feriados')} · ${link('admin', '/intimacoes', 'Intimações')}
      — prazos e intimações manuais; contagem automática e DJEN ainda pendentes.</li>
    <li>${link('admin', '/agenda', 'Agenda')} — Google, .ics, lembrete e feriados cadastrados. · ${link('admin', '/membros', 'Membros')}</li>
  </ul>

  <p class="secao"><button class="botao" id="restaurar">Restaurar dados fictícios</button></p>
  <p role="status" id="status"></p>
  <p class="sub">A prévia simula a API. As políticas reais do banco são verificadas pelos testes SQL locais.</p>
</main>
<script src="/__teste/controle.js"></script>
</body>
</html>`;

const painelCss = `.previa { max-width: 780px; margin: 0 auto; padding: 40px 20px 64px; }
.previa__lista { display: grid; gap: 6px; padding-left: 1.2em; list-style: disc; }`;

const controleJs = `document.getElementById('restaurar').addEventListener('click', async () => {
  const r = await fetch('/__teste/restaurar', { method: 'POST' });
  document.getElementById('status').textContent = r.ok ? 'Dados restaurados. Reabra ou atualize o módulo.' : 'Falha ao restaurar.';
});`;

// Injetado só na prévia, antes do app: a sessão fictícia do perfil escolhido.
const bootstrap = `// Injetado apenas pela prévia local; não é copiado para o deploy.
const perfil = new URL(location.href).searchParams.get('perfil') || localStorage.getItem('fhl.teste.perfil') || 'admin';
localStorage.setItem('fhl.teste.perfil', perfil);
localStorage.setItem('fhl.teste.sessao', JSON.stringify({
  access_token: 'teste-' + perfil, refresh_token: 'ficticio',
  expires_at: Math.floor(Date.now() / 1000) + 86400, user: { email: perfil + '@example.test' },
}));
addEventListener('DOMContentLoaded', () => {
  const a = document.createElement('a');
  a.href = '/__teste';
  a.textContent = 'Prévia local · dados fictícios · trocar perfil / restaurar';
  a.className = 'teste-local';
  document.body.append(a);
});`;

const cssTeste = '\n.teste-local{position:fixed;right:12px;bottom:8px;z-index:30;background:#fff4cf;color:#342c14;'
  + 'border:1px solid #cfb578;padding:7px 12px;font:12px system-ui;max-width:calc(100vw - 24px)}';

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

async function tratar(req) {
  const caminho = new URL(req.url).pathname;

  if (caminho === '/__teste' || caminho === '/__teste/') return texto(paginaControle);
  if (caminho === '/__teste/painel.css') return texto(painelCss, MIME['.css']);
  if (caminho === '/__teste/controle.js') return texto(controleJs, MIME['.js']);
  if (caminho === '/__teste/entrada.js') return texto(bootstrap, MIME['.js']);
  if (caminho === '/__teste/restaurar' && req.method === 'POST') {
    dados = criarDados();
    return Response.json({ ok: true });
  }
  if (caminho === '/__teste/estado' && req.method === 'GET') return Response.json(dados);
  if (caminho === '/__teste/functions/v1/receber-contato') return receber(req);
  if (caminho.startsWith('/__teste/rest/v1/')) return apiFicticia(dados, req);
  if (caminho.startsWith('/__teste/')) return Response.json({ erro: 'Operação fora da prévia local.' }, { status: 404 });
  if (!['GET', 'HEAD'].includes(req.method)) return texto('Método não aceito.', MIME['.txt'], 405);

  // O Supabase da prévia é este servidor.
  if (caminho === '/sistema/js/config.js') {
    return texto(`export const SUPABASE_URL = ${JSON.stringify(`${origem}/__teste`)}; export const SUPABASE_CHAVE = 'CHAVE-PUBLICA-FICTICIA';`, MIME['.js']);
  }

  const rel = caminho === '/sistema' || caminho === '/sistema/' ? '/sistema/index.html' : caminho === '/' ? '/index.html' : caminho;
  const arquivo = resolve(DIST, `.${decodeURIComponent(rel)}`);
  if (!arquivo.startsWith(DIST + sep)) return texto('Caminho não aceito.', MIME['.txt'], 403);

  try {
    let corpo = await readFile(arquivo);
    const trocar = (de, para) => { corpo = Buffer.from(corpo.toString().replace(de, para)); };
    if (extname(arquivo) === '.html') trocar(/data-endpoint="[^"]*"/g, 'data-endpoint="/__teste/functions/v1/receber-contato"');
    if (rel === '/sistema/index.html') trocar('<script type="module"', '<script src="/__teste/entrada.js"></script>\n  <script type="module"');
    // Outra chave de sessão: a prévia não mistura login com o sistema de verdade.
    if (rel === '/sistema/js/nucleo/supabase.js') trocar("const CHAVE_LOCAL = 'fhl.sessao';", "const CHAVE_LOCAL = 'fhl.teste.sessao';");
    if (rel === '/sistema/css/sistema.css') corpo = Buffer.from(corpo.toString() + cssTeste);
    return new Response(corpo, { headers: { 'Content-Type': MIME[extname(arquivo)] || 'application/octet-stream' } });
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
    return texto('Página não encontrada.', MIME['.txt'], 404);
  }
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const servidor = createServer(async (req, res) => {
  try {
    // Só a própria prévia mexe nas rotas privadas de teste.
    if (req.headers.origin && !origensLocais.has(req.headers.origin) && !req.url.startsWith('/__teste/functions/')) {
      res.writeHead(403);
      res.end('Origem não aceita.');
      return;
    }

    const limite = req.url.startsWith('/__teste/rest/') ? 2_000_000 : 20_000;
    const partes = [];
    let total = 0;
    for await (const parte of req) {
      total += parte.length;
      if (total > limite) {
        res.writeHead(413, { 'Content-Type': MIME['.json'] });
        res.end(JSON.stringify({ erro: 'Mensagem grande demais.' }));
        return;
      }
      partes.push(parte);
    }

    const headers = new Headers(Object.entries(req.headers)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
    // O limite por IP do formulário recebe o IP da conexão.
    headers.set('x-real-ip', req.socket.remoteAddress || '127.0.0.1');

    const resposta = await tratar(new Request(new URL(req.url, origem), {
      method: req.method,
      headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(partes) }),
    }));

    res.writeHead(resposta.status, {
      ...Object.fromEntries(resposta.headers),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...(req.url.startsWith('/sistema') ? { 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await resposta.arrayBuffer()));
  } catch (erro) {
    console.error('Prévia local:', erro.message);
    res.writeHead(500);
    res.end('Erro da prévia local. Veja o terminal.');
  }
});

servidor.on('error', (erro) => {
  console.error(erro.code === 'EADDRINUSE' ? `A porta ${porta} já está em uso. Feche a outra prévia ou defina PORT_TESTE.` : erro.message);
  process.exitCode = 1;
});

servidor.listen(porta, '127.0.0.1', () => {
  console.log(`\nPrévia com dados fictícios: ${origem}/__teste`);
  console.log(`Sistema: ${origem}/sistema/?perfil=admin#/inicio`);
  console.log('Sem Supabase nem Vercel de produção. Ctrl+C encerra e descarta os testes.\n');
});
