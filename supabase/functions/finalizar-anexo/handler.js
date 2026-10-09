// Verifica um anexo enviado e só então o torna válido (T07).
// ==========================================================
//
// O navegador reserva a versão (reservar_anexo), envia o arquivo para o
// caminho reservado no balde privado `anexos` e chama esta função com o id da
// versão. Aqui, com a chave do servidor:
//
//   1. confere, COM O TOKEN de quem chamou, que a reserva é visível para ele e
//      foi criada por ele — quem não pode ver o destino não finaliza nada;
//   2. baixa o arquivo e confere tamanho, tipo real pela assinatura dos bytes
//      (PDF, PNG, JPEG, WEBP) e, no PDF, a ausência de JavaScript, ação de
//      abrir programa e arquivo embutido;
//   3. calcula o SHA-256 e grava o resultado (finalizar_anexo_servico).
//
// Não é antivírus. Arquivo recusado fica registrado como recusado, com o
// motivo, e nunca vira anexo válido. Sem dependências: roda na borda e no Node.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const LIMITE_BYTES = 10 * 1024 * 1024;

const responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const comeca = (b, assinatura, desde = 0) => assinatura.every((x, i) => b[desde + i] === x);

/** O tipo pelo conteúdo, não pela extensão nem pelo que o navegador disse. */
export function tipoReal(bytes) {
  if (comeca(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comeca(bytes, [0x52, 0x49, 0x46, 0x46]) && comeca(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

/** PDF com conteúdo ativo é recusado: o escritório só precisa do documento. */
export function riscoNoPdf(bytes) {
  const texto = new TextDecoder('latin1').decode(bytes)
    .replace(/\/[^\s<>\[\](){}%/]+/g, (nome) => nome.replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
  if (/\/JavaScript\b|\/JS\b/.test(texto)) return 'O PDF tem JavaScript embutido.';
  if (/\/Launch\b/.test(texto)) return 'O PDF tenta abrir outro programa.';
  if (/\/EmbeddedFile\b/.test(texto)) return 'O PDF tem arquivo embutido.';
  return null;
}

export async function sha256(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function criarFinalizador({ url, chave, buscar = fetch }) {
  const servico = { apikey: chave, 'Content-Type': 'application/json' };
  // Chave sb_secret não é JWT. Só a service_role legada usa Bearer.
  if (chave && !chave.startsWith('sb_secret_')) servico.Authorization = `Bearer ${chave}`;

  const finalizar = (versao, aprovado, mime, tamanho, hash, motivo) => buscar(`${url}/rest/v1/rpc/finalizar_anexo_servico`, {
    method: 'POST',
    headers: servico,
    body: JSON.stringify({ p_versao: versao, p_aprovado: aprovado, p_mime: mime, p_tamanho: tamanho, p_sha256: hash, p_motivo: motivo }),
  });

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405);
    if (!url || !chave) return responder({ erro: 'A verificação de anexos não está configurada.' }, 503);

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return responder({ erro: 'Entre no sistema para enviar anexos.' }, 401);
    let versaoId;
    try {
      versaoId = String((await req.json())?.versao_id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(versaoId)) throw new Error();
    } catch {
      return responder({ erro: 'Pedido inválido.' }, 400);
    }

    try {
    // 1 · A reserva, vista com o token de quem chamou.
    const doUsuario = { apikey: req.headers.get('apikey') ?? chave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const [rv, rm] = await Promise.all([
      buscar(`${url}/rest/v1/anexos_versoes?select=id,objeto,estado,criado_por&id=eq.${versaoId}`, { headers: doUsuario }),
      buscar(`${url}/rest/v1/rpc/iniciar_sessao`, { method: 'POST', headers: doUsuario, body: '{}' }),
    ]);
    const versao = rv.ok ? (await rv.json())[0] : null;
    const membro = rm.ok ? await rm.json() : null;
    if (!versao || !membro) return responder({ erro: 'Reserva não encontrada ou sem acesso.' }, 404);
    if (versao.criado_por !== membro.id) return responder({ erro: 'Só quem reservou finaliza o envio.' }, 403);
    if (versao.estado !== 'reservado') return responder({ erro: 'Este envio já foi finalizado.', estado: versao.estado }, 409);

    // 2 · O arquivo, com a chave do servidor.
    const caminho = versao.objeto.split('/').map(encodeURIComponent).join('/');
    const ra = await buscar(`${url}/storage/v1/object/anexos/${caminho}`, { headers: servico });
    if (!ra.ok) return responder({ erro: 'O arquivo não chegou. Envie de novo.' }, 409);
    const bytes = new Uint8Array(await ra.arrayBuffer());

    let motivo = null;
    const mime = tipoReal(bytes);
    if (!bytes.length) motivo = 'Arquivo vazio.';
    else if (bytes.length > LIMITE_BYTES) motivo = 'Arquivo maior que 10 MB.';
    else if (!mime) motivo = 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    else if (mime === 'application/pdf') motivo = riscoNoPdf(bytes);

    // 3 · O resultado.
    const hash = await sha256(bytes);
    const rf = await finalizar(versaoId, !motivo, mime, bytes.length || null, hash, motivo);
    if (!rf.ok) {
      console.error('finalizar_anexo_servico', rf.status);
      return responder({ erro: 'Não foi possível registrar a verificação. Tente de novo.' }, 503);
    }
    return motivo
      ? responder({ ok: false, estado: 'recusado', motivo }, 422)
      : responder({ ok: true, estado: 'verificado', mime, tamanho: bytes.length, sha256: hash });
    } catch {
      return responder({ erro: 'A verificação está indisponível. O envio continua reservado; tente verificar novamente.' }, 503);
    }
  };
}
