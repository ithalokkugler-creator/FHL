// Banco de verdade para a prévia e para os testes: PostgreSQL (PGlite) com as
// migrações do repositório, e uma Data API que fala como o PostgREST.
// ===========================================================================
//
// A prévia antiga (dados.mjs) simula as respostas em memória e não confere
// nada do banco — nem nome de coluna. Aqui as telas falam com as mesmas
// tabelas, políticas (RLS), GRANTs, gatilhos e funções que vão para o
// Supabase. O que não é do Postgres — Auth, Storage, funções de borda — é
// imitado só no que o sistema usa.
//
// O PGlite fica fora do package.json (o site não tem dependências): ele mora
// em .local/ferramentas, instalado uma vez com
//   npm install --prefix .local/ferramentas @electric-sql/pglite@0.3.14

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PGLITE = resolve(RAIZ, '.local/ferramentas/node_modules/@electric-sql/pglite/dist/index.js');

export async function carregarPGlite() {
  try {
    return (await import(pathToFileURL(PGLITE).href)).PGlite;
  } catch {
    throw new Error('PGlite não encontrado. Instale uma vez (fica em .local, fora do site):\n'
      + '  npm install --prefix .local/ferramentas @electric-sql/pglite@0.3.14');
  }
}

/** PostgreSQL novo, com o mínimo do Supabase e as migrações — todas, ou só
 *  até a versão `ate` (para ensaiar a migração sobre dados antigos). */
export async function criarBanco({ log = () => {}, ate = null } = {}) {
  const PGlite = await carregarPGlite();
  const db = new PGlite();
  // O Supabase grava e devolve instantes em UTC.
  await db.exec("set timezone to 'UTC'");
  await db.exec(await readFile(resolve(RAIZ, 'scripts/local/supabase-minimo.sql'), 'utf8'));
  await aplicarMigracoes(db, { ate, log });
  return db;
}

/** Aplica as migrações com versão entre `desde` (exclusiva) e `ate` (inclusiva). */
export async function aplicarMigracoes(db, { desde = null, ate = null, log = () => {} } = {}) {
  const pasta = resolve(RAIZ, 'supabase/migrations');
  for (const nome of (await readdir(pasta)).filter((n) => n.endsWith('.sql')).sort()) {
    const versao = nome.slice(0, 14);
    if ((desde && versao <= desde) || (ate && versao > ate)) continue;
    log(nome);
    try {
      await db.exec(await readFile(resolve(pasta, nome), 'utf8'));
    } catch (erro) {
      erro.message = `${nome}: ${erro.message}`;
      throw erro;
    }
  }
}

// ---------------------------------------------------------------------------
// Identidade: quem chama, e com que papel
// ---------------------------------------------------------------------------

/** Executa `fn(tx)` numa transação com o papel e o JWT de quem chamou —
 *  como a Data API faz a cada requisição. */
export async function comoUsuario(db, { papel = 'anon', claims = {} } = {}, fn) {
  if (!['anon', 'authenticated', 'service_role'].includes(papel)) throw new Error('Papel inválido.');
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: papel, ...claims })]);
    await tx.exec(`set local role ${papel}`);
    return fn(tx);
  });
}

// ---------------------------------------------------------------------------
// Tradução do formato do PostgREST para SQL
// ---------------------------------------------------------------------------

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function ident(nome) {
  if (!IDENT.test(nome)) throw erroApi(400, 'PGRST100', `Nome inválido: ${nome}`);
  return `"${nome}"`;
}

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

function erroApi(status, code, message, details = null) {
  return Object.assign(new Error(message), { status, code, details });
}

/** Divide "a,b(c,d),'e,f'" nas vírgulas de fora — parênteses e aspas protegem. */
function dividir(texto) {
  const partes = [];
  let nivel = 0;
  let aspas = false;
  let atual = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '\\' && aspas) {
      atual += c + (texto[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') aspas = !aspas;
    if (!aspas && c === '(') nivel++;
    if (!aspas && c === ')') nivel--;
    if (!aspas && nivel === 0 && c === ',') {
      partes.push(atual);
      atual = '';
    } else atual += c;
  }
  if (atual) partes.push(atual);
  return partes;
}

const tirarAspas = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v);

function condicao(coluna, expressao, prefixo) {
  const col = `${prefixo}${ident(coluna)}`;
  let negar = false;
  let resto = expressao;
  if (resto.startsWith('not.')) {
    negar = true;
    resto = resto.slice(4);
  }
  const ponto = resto.indexOf('.');
  const op = resto.slice(0, ponto);
  const valor = resto.slice(ponto + 1);
  let sql;
  switch (op) {
    case 'eq': sql = `${col} = ${literal(valor)}`; break;
    case 'neq': sql = `${col} <> ${literal(valor)}`; break;
    case 'gt': sql = `${col} > ${literal(valor)}`; break;
    case 'gte': sql = `${col} >= ${literal(valor)}`; break;
    case 'lt': sql = `${col} < ${literal(valor)}`; break;
    case 'lte': sql = `${col} <= ${literal(valor)}`; break;
    case 'like': sql = `${col} like ${literal(valor.replace(/\*/g, '%'))}`; break;
    case 'ilike': sql = `${col} ilike ${literal(valor.replace(/\*/g, '%'))}`; break;
    case 'is': {
      const v = valor.toLowerCase();
      if (!['null', 'true', 'false', 'unknown'].includes(v)) throw erroApi(400, 'PGRST100', `Valor inválido para is: ${valor}`);
      sql = `${col} is ${v}`;
      break;
    }
    case 'in': {
      const itens = dividir(valor.replace(/^\(/, '').replace(/\)$/, '')).map(tirarAspas);
      sql = itens.length ? `${col} in (${itens.map(literal).join(',')})` : 'false';
      break;
    }
    case 'cs': sql = `${col} @> ${literal(valor)}`; break;
    case 'cd': sql = `${col} <@ ${literal(valor)}`; break;
    case 'ov': sql = `${col} && ${literal(valor)}`; break;
    default: throw erroApi(400, 'PGRST100', `Operador não suportado na prévia: ${op}`);
  }
  return negar ? `not (${sql})` : sql;
}

/** "(a.eq.1,and(b.gte.2,b.lte.3))" → SQL. */
function grupo(juncao, texto, prefixo) {
  const interno = texto.replace(/^\(/, '').replace(/\)$/, '');
  const partes = dividir(interno).map((p) => {
    const m = /^(not\.)?(and|or)(\(.*\))$/.exec(p);
    if (m) {
      const sub = grupo(m[2], m[3], prefixo);
      return m[1] ? `not ${sub}` : sub;
    }
    const ponto = p.indexOf('.');
    return condicao(p.slice(0, ponto), p.slice(ponto + 1), prefixo);
  });
  return `(${partes.join(juncao === 'and' ? ' and ' : ' or ')})`;
}

const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);

export function ondeDe(params, prefixo = '') {
  const condicoes = [];
  for (const [chave, valor] of params) {
    if (RESERVADOS.has(chave)) continue;
    if (chave === 'or' || chave === 'and') condicoes.push(grupo(chave, valor, prefixo));
    else condicoes.push(condicao(chave, valor, prefixo));
  }
  return condicoes.length ? `where ${condicoes.join(' and ')}` : '';
}

function colunasDe(select, prefixo = '') {
  if (!select || select === '*') return prefixo ? `${prefixo}*` : '*';
  return select.split(',').map((c) => c.trim()).filter(Boolean).map((c) => `${prefixo}${ident(c)}`).join(', ');
}

function ordemDe(order) {
  if (!order) return '';
  const partes = order.split(',').filter(Boolean).map((o) => {
    const [col, ...mods] = o.split('.');
    let sql = ident(col);
    for (const m of mods) {
      if (m === 'asc' || m === 'desc') sql += ` ${m}`;
      else if (m === 'nullsfirst') sql += ' nulls first';
      else if (m === 'nullslast') sql += ' nulls last';
      else throw erroApi(400, 'PGRST100', `Ordem inválida: ${o}`);
    }
    return sql;
  });
  return `order by ${partes.join(', ')}`;
}

const numero = (v, padrao) => (v == null || v === '' ? padrao : Number.parseInt(v, 10));

const assinaturas = new Map();

async function assinatura(tx, nome) {
  if (assinaturas.has(nome)) return assinaturas.get(nome);
  const { rows } = await tx.query(`
    select p.oid, p.proargnames as nomes, p.proargmodes as modos, p.pronargs as n, p.pronargdefaults as padroes,
           p.proretset as conjunto, p.prorettype = 'void'::regtype as vazio,
           (select t.typtype from pg_type t where t.oid = p.prorettype) as tipo_retorno,
           array(select format_type(x, null) from unnest(p.proargtypes) x) as tipos
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1`, [nome]);
  assinaturas.set(nome, rows);
  return rows;
}

const ehTabelaRetorno = (f) => f.conjunto || f.tipo_retorno === 'c' || (f.modos ?? []).includes('t');

async function chamarRpc(tx, nome, corpo) {
  const candidatas = await assinatura(tx, nome);
  const chaves = Object.keys(corpo ?? {});
  const f = candidatas.find((c) => {
    const nomes = (c.nomes ?? []).slice(0, c.n);
    const obrigatorios = nomes.slice(0, c.n - (c.padroes ?? 0));
    return chaves.every((k) => nomes.includes(k)) && obrigatorios.every((k) => chaves.includes(k));
  });
  if (!f) throw erroApi(404, 'PGRST202', `Função public.${nome} não encontrada com esses argumentos.`);

  const valores = [];
  const argumentos = chaves.map((k) => {
    const tipo = f.tipos[(f.nomes ?? []).indexOf(k)];
    const v = corpo[k];
    if (v === null || v === undefined) return `${ident(k)} => null::${tipo}`;
    if (tipo === 'jsonb' || tipo === 'json') {
      valores.push(JSON.stringify(v));
      return `${ident(k)} => $${valores.length}::${tipo}`;
    }
    if (tipo.endsWith('[]')) {
      valores.push(JSON.stringify(v));
      return `${ident(k)} => array(select json_array_elements_text($${valores.length}::json))::${tipo}`;
    }
    // Booleano vai como booleano: o PGlite não converte o texto "true" num
    // parâmetro boolean (o PostgREST converte).
    valores.push(typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? v : String(v));
    return `${ident(k)} => $${valores.length}::${tipo}`;
  });
  const chamada = `public.${ident(nome)}(${argumentos.join(', ')})`;

  if (ehTabelaRetorno(f)) {
    const { rows } = await tx.query(`select coalesce(json_agg(_r), '[]'::json)::text as corpo from ${chamada} as _r`, valores);
    return rows[0].corpo;
  }
  if (f.vazio) {
    await tx.query(`select ${chamada}`, valores);
    return null;
  }
  const { rows } = await tx.query(`select to_json(${chamada})::text as corpo`, valores);
  return rows[0].corpo;
}

const STATUS_DO_ERRO = {
  42501: 403, P0001: 400, 23505: 409, 23503: 409, 23514: 400, 23502: 400,
  '22P02': 400, 22023: 400, 22007: 400, 22008: 400, 42883: 404, '42P01': 404, 42703: 400, 40001: 409, '40P01': 409,
};

export function respostaDeErro(erro, anonimo = false) {
  const code = erro.code ?? '';
  let status = erro.status ?? STATUS_DO_ERRO[code] ?? (/^P/.test(code) ? 400 : 500);
  if (code === '42501' && anonimo) status = 401;
  if (status === 500) console.error('Prévia com banco:', erro);
  return Response.json(
    { code, message: erro.message, details: erro.detail ?? erro.details ?? null, hint: erro.hint ?? null },
    { status },
  );
}

/**
 * Data API (/rest/v1/…) sobre o banco: GET, POST, PATCH e rpc/. DELETE não
 * existe no sistema — e o banco recusaria.
 *
 * @param {object} db PGlite
 * @param {Request} req
 * @param {{ papel: string, claims: object }} quem
 */
export async function dataApi(db, req, quem, caminho) {
  const url = new URL(req.url);
  const params = [...url.searchParams];
  const consulta = new URLSearchParams(url.searchParams);
  const prefer = req.headers.get('prefer') ?? '';
  const anonimo = quem.papel === 'anon';

  try {
    const corpo = ['GET', 'HEAD'].includes(req.method) ? null : await req.text().then((t) => (t ? JSON.parse(t) : null));
    const resultado = await comoUsuario(db, quem, async (tx) => {
      if (caminho.startsWith('rpc/')) {
        if (req.method !== 'POST') throw erroApi(405, 'PGRST101', 'Use POST para chamar funções.');
        return { corpo: await chamarRpc(tx, caminho.slice(4), corpo), status: 200 };
      }

      const rel = `public.${ident(caminho)}`;
      if (req.method === 'GET') {
        const onde = ondeDe(params);
        const limite = numero(consulta.get('limit'), null);
        const deslocamento = numero(consulta.get('offset'), 0);
        const sql = `select coalesce(json_agg(_r), '[]'::json)::text as corpo from (
            select ${colunasDe(consulta.get('select'))} from ${rel} ${onde} ${ordemDe(consulta.get('order'))}
            ${limite != null ? `limit ${limite}` : ''} offset ${deslocamento}) as _r`;
        const { rows } = await tx.query(sql);
        let intervalo = null;
        if (/count=exact/.test(prefer)) {
          const { rows: [{ total }] } = await tx.query(`select count(*)::int as total from ${rel} ${onde}`);
          const n = JSON.parse(rows[0].corpo).length;
          intervalo = n ? `${deslocamento}-${deslocamento + n - 1}/${total}` : `*/${total}`;
        }
        return { corpo: rows[0].corpo, status: 200, intervalo };
      }

      const representar = /return=representation/.test(prefer);
      const devolver = colunasDe(consulta.get('select'), '_t.');
      if (req.method === 'POST') {
        const linhas = Array.isArray(corpo) ? corpo : [corpo];
        if (!linhas.length) return { corpo: '[]', status: 201 };
        const colunas = Object.keys(linhas[0]).map(ident);
        const sql = `with _w as (
            insert into ${rel} as _t (${colunas.join(', ')})
            select ${colunas.join(', ')} from json_populate_recordset(null::${rel}, $1::json)
            returning ${devolver})
          select coalesce(json_agg(_w), '[]'::json)::text as corpo from _w`;
        const { rows } = await tx.query(sql, [JSON.stringify(linhas)]);
        return { corpo: representar ? rows[0].corpo : '', status: 201 };
      }
      if (req.method === 'PATCH') {
        const colunas = Object.keys(corpo ?? {}).map(ident);
        if (!colunas.length) throw erroApi(400, 'PGRST102', 'Nada para alterar.');
        const onde = ondeDe(params, '_t.');
        if (!onde) throw erroApi(400, 'PGRST106', 'PATCH sem filtro alteraria a tabela inteira.');
        const sql = `with _w as (
            update ${rel} as _t set ${colunas.map((c) => `${c} = _j.${c}`).join(', ')}
              from json_populate_record(null::${rel}, $1::json) as _j
            ${onde}
            returning ${devolver})
          select coalesce(json_agg(_w), '[]'::json)::text as corpo from _w`;
        const { rows } = await tx.query(sql, [JSON.stringify(corpo)]);
        return { corpo: representar ? rows[0].corpo : '', status: 200 };
      }
      throw erroApi(405, 'PGRST101', `Método ${req.method} não existe nesta API.`);
    });

    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (resultado.intervalo) headers['Content-Range'] = resultado.intervalo;
    if (resultado.corpo === null || resultado.corpo === '') return new Response(null, { status: resultado.status === 200 ? 204 : resultado.status, headers });
    return new Response(resultado.corpo, { status: resultado.status, headers });
  } catch (erro) {
    return respostaDeErro(erro, anonimo);
  }
}
