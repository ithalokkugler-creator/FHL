// =============================================================================
// FHL ADVOCACIA — função de borda `publicar-site`
// =============================================================================
//
// Manda a Vercel gerar o site de novo, para o que foi escrito na área dos
// advogados aparecer no ar.
//
// POR QUE ELA EXISTE — a URL do Deploy Hook da Vercel é um segredo: quem a tem
// dispara build no site do escritório, sem login nenhum. Se a tela chamasse a
// Vercel direto, essa URL estaria no código da página, à vista de qualquer
// pessoa. Aqui ela fica numa variável de ambiente do Supabase, que o navegador
// não alcança.
//
// PERMISSÃO — `verify_jwt` fica desligado para o navegador conseguir fazer o
// preflight do CORS; quem confere o acesso é o banco, na primeira coisa que
// esta função faz: `pode_publicar_site()` só devolve true para membro ativo
// com acesso ao módulo Site. Sem isso, 403 antes de a Vercel ser tocada.
//
// REGISTRO — todo pedido, dando certo ou não, entra em `site_deploys` com a
// data e o nome de quem pediu (`registrar_publicacao`). É o que a tela
// Publicar mostra.
//
// CONFIGURAR — Supabase → Edge Functions → Secrets:
//   VERCEL_DEPLOY_HOOK = https://api.vercel.com/v1/integrations/deploy/prj_…/…
// A URL sai da Vercel, no projeto do site: Settings → Git → Deploy Hooks.
// Enquanto ela não existir, a função responde que não está configurada e o
// pedido fica registrado como falho — nada quebra, e o site continua sendo
// publicado a cada push.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function responder(corpo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Chama uma função do banco com o token de quem pediu — nunca com o do servidor. */
async function rpc(req: Request, nome: string, args: Record<string, unknown> = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: req.headers.get('apikey') ?? '',
      Authorization: req.headers.get('Authorization') ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`${nome}: ${texto.slice(0, 200)}`);
  }
  return resposta.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405);

  // 1. Quem está pedindo pode publicar?
  // Na dúvida, não: sem sessão a chamada nem chega à função do banco, e
  // qualquer outra falha aqui também significa acesso não confirmado.
  let pode: unknown = false;
  try {
    pode = await rpc(req, 'pode_publicar_site');
  } catch {
    pode = false;
  }
  if (pode !== true) {
    return responder({ erro: 'Seu acesso não permite publicar o site.' }, 403);
  }

  // 2. O Deploy Hook já existe?
  const hook = Deno.env.get('VERCEL_DEPLOY_HOOK');
  if (!hook) {
    await rpc(req, 'registrar_publicacao', {
      p_situacao: 'falhou',
      p_detalhe: 'Deploy Hook da Vercel ainda não configurado (VERCEL_DEPLOY_HOOK).',
    }).catch(() => {});
    return responder({
      erro: 'A publicação automática ainda não foi configurada. '
        + 'Falta criar o Deploy Hook na Vercel e guardá-lo no Supabase, em Edge Functions → Secrets, '
        + 'como VERCEL_DEPLOY_HOOK. Enquanto isso, o site é gerado de novo a cada envio de código.',
    }, 503);
  }

  // 3. Dispara o build.
  try {
    const resposta = await fetch(hook, { method: 'POST' });
    if (!resposta.ok) {
      throw new Error(`a Vercel respondeu ${resposta.status}`);
    }
    const dados = await resposta.json().catch(() => ({}));
    const id = dados?.job?.id ?? '';

    await rpc(req, 'registrar_publicacao', {
      p_situacao: 'enviado',
      p_detalhe: id ? `Build ${id} na fila da Vercel.` : 'Build pedido à Vercel.',
    });
    return responder({ mensagem: 'Publicação pedida. Em dois ou três minutos o site estará no ar.' });
  } catch (erro) {
    await rpc(req, 'registrar_publicacao', {
      p_situacao: 'falhou',
      p_detalhe: String(erro).slice(0, 300),
    }).catch(() => {});
    return responder({ erro: `Não foi possível pedir o build à Vercel: ${erro}.` }, 502);
  }
});
