// A mesma função HTTP roda na borda e nos testes do Node, sem dependências.
// O navegador não recebe a chave de serviço: somente este servidor chama a RPC.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const LIMITE_BYTES = 20_000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const responder = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: {
    ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    ...(status === 429 ? { 'Retry-After': '600' } : {}),
  } });

/** Interrompe a leitura em bytes, inclusive sem Content-Length ou com UTF-8. */
async function lerCorpo(req) {
  if (Number(req.headers.get('content-length')) > LIMITE_BYTES) return null;
  const leitor = req.body?.getReader();
  if (!leitor) return '';
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITE_BYTES) { await leitor.cancel(); return null; }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of partes) { bytes.set(p, offset); offset += p.byteLength; }
  return new TextDecoder().decode(bytes);
}

const texto = (d, campo, max) => {
  const v = d[campo];
  if (v != null && typeof v !== 'string') throw new Error('Confira os campos do formulário.');
  const t = typeof v === 'string' ? v.trim() : '';
  if ([...t].length > max) throw new Error('Um campo ultrapassou o tamanho permitido.');
  return t;
};

export function criarRecebedor({ url, chave, sal, buscar = fetch }) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') ?? '')) {
      return responder({ erro: 'Envie o formulário em JSON.' }, 415);
    }
    let d;
    try {
      const bruto = await lerCorpo(req);
      if (bruto === null) return responder({ erro: 'Mensagem grande demais.' }, 413);
      d = JSON.parse(bruto);
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error();
    } catch { return responder({ erro: 'Formato inválido.' }, 400); }

    if (typeof d.website === 'string' && d.website.trim()) return responder({ ok: true });
    if (!['1', 'true', 'on', true].includes(d.consent)) {
      return responder({ erro: 'É preciso autorizar o tratamento dos dados para enviar.' }, 422);
    }
    let contato;
    try {
      contato = {
        nome: texto(d, 'nome', 200), email: texto(d, 'email', 200).toLowerCase(),
        telefone: texto(d, 'telefone', 40), empresa: texto(d, 'empresa', 200),
        mensagem: texto(d, 'mensagem', 5000), pagina: texto(d, 'pagina', 300),
        campanha: texto(d, 'campanha', 120), consent: d.consent,
      };
      if (!contato.nome || !contato.mensagem || (!contato.email && !contato.telefone)) throw new Error('Preencha nome, mensagem e um meio de contato.');
      if (contato.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contato.email)) throw new Error('Confira o e-mail digitado.');
      if (contato.telefone && !/^\d{10,13}$/.test(contato.telefone.replace(/\D/g, ''))) throw new Error('Informe o telefone com DDD.');
      if (contato.campanha && !SLUG.test(contato.campanha)) throw new Error('Campanha inválida. Reabra a página e tente de novo.');
      if (contato.pagina && (!contato.pagina.startsWith('/') || contato.pagina.includes('?'))) throw new Error('Página de origem inválida.');
    } catch (e) { return responder({ erro: e.message }, 422); }

    // Falha fechada: um segredo ausente não desliga a proteção silenciosamente.
    if (!url || !chave || !sal || sal.length < 32) return responder({ erro: 'O formulário está temporariamente indisponível. Use o WhatsApp.' }, 503);
    const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${ip || 'sem-ip'}`));
    const ipHash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const headers = { apikey: chave, 'Content-Type': 'application/json' };
    // Chave sb_secret não é JWT. Só a service_role legada usa Bearer.
    if (!chave.startsWith('sb_secret_')) headers.Authorization = `Bearer ${chave}`;
    try {
      const r = await buscar(`${url}/rest/v1/rpc/registrar_contato`, {
        method: 'POST', headers, body: JSON.stringify({ p: contato, p_ip_hash: ipHash }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) {
        const erro = await r.json().catch(() => ({}));
        if (erro?.code === 'P0001') return responder({ erro: erro.message }, /muitas/i.test(erro.message) ? 429 : 422);
        // Nunca imprimir payload, chave, IP ou texto pessoal na borda.
        console.error('registrar_contato', r.status, erro?.code ?? '');
        return responder({ erro: 'Não foi possível registrar agora. Tente de novo ou use o WhatsApp.' }, 503);
      }
      return responder({ ok: true }, 201);
    } catch { return responder({ erro: 'Não foi possível registrar agora. Tente de novo ou use o WhatsApp.' }, 503); }
  };
}
