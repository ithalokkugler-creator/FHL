// A prévia com banco de verdade: o "Supabase" da prévia local.
// ===========================================================
//
// Data API sobre o PostgreSQL das migrações (banco.mjs), mais o mínimo do
// resto que o sistema usa: Storage (balde privado de anexos e o do site),
// Auth (sair, convite), as funções de borda (com os mesmos handlers que vão
// para o Supabase), um DJEN fictício e um CEP fictício. Nada sai desta
// máquina; nenhuma credencial real é usada.
//
// Perfil = token: "teste-admin", "teste-socia"… (o painel /__teste injeta).

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comoUsuario, criarBanco, dataApi, respostaDeErro } from './banco.mjs';
import { respostaCepFicticia, respostaDjenFicticia } from './djen-ficticio.mjs';
import { criarRecebedor } from '../../supabase/functions/receber-contato/handler.js';
import { criarFinalizador } from '../../supabase/functions/finalizar-anexo/handler.js';
import { criarAdministrador } from '../../supabase/functions/administrar-usuarios/handler.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CHAVE_SERVICO = 'sb_secret_PREVIA_FICTICIA';

const json = (corpo, status = 200, extra = {}) => Response.json(corpo, { status, headers: extra });

export async function criarPreviaBanco({ origem }) {
  const base = `${origem}/__teste`;
  const semente = await readFile(resolve(RAIZ, 'scripts/local/semente.sql'), 'utf8');
  let db = null;
  let usuarios = new Map();
  // Arquivos do Storage (bytes) e links assinados, em memória.
  let arquivos = new Map();
  let assinados = new Map();

  async function restaurar() {
    const novo = await criarBanco();
    await novo.exec(semente);
    const { rows } = await novo.query("select m.user_id, m.email from public.membros m where m.email like '%@example.test' and m.user_id is not null");
    usuarios = new Map(rows.map((r) => [r.email.replace('@example.test', ''), { id: r.user_id, email: r.email }]));
    arquivos = new Map();
    assinados = new Map();
    const velho = db;
    db = novo;
    await velho?.close();
  }
  await restaurar();

  function quem(req) {
    const apikey = req.headers.get('apikey') ?? '';
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (apikey === CHAVE_SERVICO && (!token || token === CHAVE_SERVICO)) return { papel: 'service_role', claims: {} };
    const perfil = /^teste-([a-z-]+)$/.exec(token)?.[1];
    const u = perfil && usuarios.get(perfil);
    if (u) return { papel: 'authenticated', claims: { sub: u.id, email: u.email, aal: 'aal1' } };
    return { papel: 'anon', claims: {} };
  }

  // As funções de borda falam com este mesmo servidor, sem rede.
  const interno = (url, init) => tratar(new Request(url, init));
  const funcoes = {
    'receber-contato': criarRecebedor({ url: base, chave: CHAVE_SERVICO, sal: 'SAL-FICTICIO-APENAS-NA-PREVIA-LOCAL-SEM-CREDENCIAIS', buscar: interno }),
    'finalizar-anexo': criarFinalizador({ url: base, chave: CHAVE_SERVICO, buscar: interno }),
    'administrar-usuarios': criarAdministrador({ url: base, chave: CHAVE_SERVICO, buscar: interno }),
  };

  // -------------------------------------------------------------- Storage
  async function storage(req, resto, q) {
    const url = new URL(req.url);
    let m;
    if (req.method === 'POST' && (m = /^object\/sign\/([^/]+)\/(.+)$/.exec(resto))) {
      const [, balde, nome] = m;
      const caminho = decodeURIComponent(nome);
      const visivel = await comoUsuario(db, q, async (tx) => (await tx.query(
        'select 1 from storage.objects where bucket_id = $1 and name = $2', [balde, caminho])).rows.length > 0);
      if (!visivel) return json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400);
      const corpo = await req.json().catch(() => ({}));
      const token = randomBytes(16).toString('hex');
      assinados.set(token, { chave: `${balde}/${caminho}`, ate: Date.now() + Math.min(Number(corpo.expiresIn) || 60, 3600) * 1000 });
      return json({ signedURL: `/object/sign/${balde}/${nome}?token=${token}` });
    }
    if (req.method === 'GET' && (m = /^object\/sign\/([^/]+)\/(.+)$/.exec(resto))) {
      const link = assinados.get(url.searchParams.get('token'));
      const chave = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (!link || link.chave !== chave || link.ate < Date.now() || !arquivos.has(chave)) {
        return json({ statusCode: '400', error: 'InvalidJWT', message: 'Link expirado ou inválido.' }, 400);
      }
      const a = arquivos.get(chave);
      return new Response(a.bytes, { headers: { 'Content-Type': a.tipo, 'Content-Disposition': 'inline' } });
    }
    if (req.method === 'GET' && (m = /^object\/public\/([^/]+)\/(.+)$/.exec(resto))) {
      const chave = `${m[1]}/${decodeURIComponent(m[2])}`;
      const { rows } = await db.query('select public from storage.buckets where id = $1', [m[1]]);
      if (!rows[0]?.public || !arquivos.has(chave)) return json({ message: 'Object not found' }, 400);
      return new Response(arquivos.get(chave).bytes, { headers: { 'Content-Type': arquivos.get(chave).tipo } });
    }
    if ((m = /^object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(resto))) {
      const [, balde, nome] = m;
      const caminho = decodeURIComponent(nome);
      const chave = `${balde}/${caminho}`;
      if (req.method === 'GET') {
        const pode = await comoUsuario(db, q, async (tx) => (await tx.query(
          'select 1 from storage.objects where bucket_id = $1 and name = $2', [balde, caminho])).rows.length > 0);
        if (!pode || !arquivos.has(chave)) return json({ statusCode: '404', message: 'Object not found' }, 400);
        return new Response(arquivos.get(chave).bytes, { headers: { 'Content-Type': arquivos.get(chave).tipo } });
      }
      if (req.method === 'POST') {
        const bytes = new Uint8Array(await req.arrayBuffer());
        const tipo = req.headers.get('content-type') || 'application/octet-stream';
        const { rows: [b] } = await db.query('select * from storage.buckets where id = $1', [balde]);
        if (!b) return json({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }, 400);
        if (b.file_size_limit && bytes.length > Number(b.file_size_limit)) {
          return json({ statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }, 413);
        }
        if (b.allowed_mime_types?.length && !b.allowed_mime_types.includes(tipo.split(';')[0])) {
          return json({ statusCode: '415', error: 'invalid_mime_type', message: `mime type ${tipo} is not supported` }, 415);
        }
        const upsert = req.headers.get('x-upsert') === 'true';
        try {
          await comoUsuario(db, q, (tx) => tx.query(
            `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)
             ${upsert ? 'on conflict (bucket_id, name) do update set metadata = excluded.metadata' : ''}`,
            [balde, caminho, q.claims.sub ?? null, JSON.stringify({ mimetype: tipo, size: bytes.length })]));
        } catch (erro) {
          const negado = erro.code === '42501';
          return json({ statusCode: negado ? '403' : '409', error: negado ? 'Unauthorized' : 'Duplicate',
            message: negado ? 'new row violates row-level security policy' : 'The resource already exists' }, negado ? 403 : 409);
        }
        arquivos.set(chave, { bytes, tipo });
        return json({ Key: chave });
      }
    }
    return json({ message: 'Operação de Storage fora da prévia.' }, 404);
  }

  // -------------------------------------------------------------- Auth
  async function auth(req, resto, q) {
    if (resto.startsWith('logout')) return new Response(null, { status: 204 });
    if (resto === 'user') {
      if (q.papel !== 'authenticated') return json({ error_code: 'session_not_found', msg: 'Sem sessão.' }, 401);
      return json({ id: q.claims.sub, email: q.claims.email });
    }
    if (resto.startsWith('recover')) return json({});
    if (resto.startsWith('invite')) {
      if (q.papel !== 'service_role') return json({ error_code: 'not_admin', msg: 'Só o servidor convida.' }, 403);
      const { email } = await req.json();
      const { rows } = await db.query('select id from auth.users where lower(email) = lower($1)', [email]);
      if (rows.length) return json({ error_code: 'email_exists', msg: 'A user with this email address has already been registered' }, 422);
      await db.query("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated')", [email]);
      await db.query("insert into auth.audit_log_entries (payload, ip_address) values ($1, '127.0.0.1')",
        [JSON.stringify({ action: 'user_invited', actor_username: 'servidor', traits: { user_email: email } })]);
      return json({ email });
    }
    if (resto.startsWith('token')) {
      return json({ error_code: 'invalid_credentials', msg: 'A prévia não usa senha: escolha o perfil no painel /__teste.' }, 400);
    }
    return json({ msg: 'Operação de Auth fora da prévia.' }, 404);
  }

  // -------------------------------------------------------------- Rotas
  async function tratar(req) {
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/^\/__teste\//, '');
    const q = quem(req);
    if (caminho.startsWith('rest/v1/')) return dataApi(db, req, q, caminho.slice('rest/v1/'.length));
    if (caminho.startsWith('storage/v1/')) {
      try {
        return await storage(req, caminho.slice('storage/v1/'.length), q);
      } catch (erro) {
        return respostaDeErro(erro);
      }
    }
    if (caminho.startsWith('auth/v1/')) return auth(req, caminho.slice('auth/v1/'.length), q);
    if (caminho.startsWith('functions/v1/')) {
      const nome = caminho.slice('functions/v1/'.length);
      if (funcoes[nome]) return funcoes[nome](req);
      return json({ erro: 'Esta função não roda na prévia (precisa de configuração real).' }, 503);
    }
    if (caminho.startsWith('djen/api/v1/comunicacao')) return respostaDjenFicticia(url);
    const cep = /^cep\/(\d{8})\/json\/?$/.exec(caminho);
    if (cep) return respostaCepFicticia(cep[1]);
    return null;
  }

  return { tratar, restaurar, perfis: () => [...usuarios.keys()] };
}
