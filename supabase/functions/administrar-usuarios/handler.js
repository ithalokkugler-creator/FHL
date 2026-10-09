// Convite de acesso pelo próprio sistema (T05).
// ============================================
//
// Hoje o administrador cria o login no painel do Supabase e passa uma senha
// provisória. Com esta função, ele clica em "Enviar convite" em Membros:
//
//   1. o banco confere, COM O TOKEN de quem pediu, que é o administrador e
//      que a pessoa está ativa, tem e-mail e ainda não entrou
//      (solicitar_convite) — e registra o convite como pendente;
//   2. com a chave do servidor, o Auth do Supabase manda o e-mail de convite;
//      a pessoa escolhe a própria senha pelo link (nenhuma senha passa pela
//      tela nem fica registrada);
//   3. o resultado volta para o registro: enviado ou falhou, com o motivo.
//
// Auth e banco não são uma transação: por isso o estado fica gravado, e pedir
// de novo reaproveita o mesmo convite. O e-mail sai pelo SMTP configurado no
// Auth — o padrão do Supabase só entrega para a equipe da organização.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export function criarAdministrador({ url, chave, buscar = fetch }) {
  const servico = { apikey: chave, 'Content-Type': 'application/json' };
  if (chave && !chave.startsWith('sb_secret_')) servico.Authorization = `Bearer ${chave}`;

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405);
    if (!url || !chave) return responder({ erro: 'O convite por e-mail não está configurado.' }, 503);

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return responder({ erro: 'Entre no sistema para convidar.' }, 401);
    let pedido;
    try {
      pedido = await req.json();
      if (pedido?.acao !== 'convidar' || !/^[0-9a-f-]{36}$/i.test(String(pedido.membro_id ?? ''))) throw new Error();
    } catch {
      return responder({ erro: 'Pedido inválido.' }, 400);
    }
    const volta = typeof pedido.voltar_para === 'string' && /^https?:\/\/[^\s]+$/.test(pedido.voltar_para) ? pedido.voltar_para : '';

    try {
    // 1 · Quem pediu pode? (o banco decide)
    const rs = await buscar(`${url}/rest/v1/rpc/solicitar_convite`, {
      method: 'POST',
      headers: { apikey: req.headers.get('apikey') ?? chave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_membro: pedido.membro_id }),
    });
    const convite = await rs.json().catch(() => ({}));
    if (!rs.ok) return responder({ erro: convite?.message || 'Não foi possível preparar o convite.' }, rs.status === 403 ? 403 : 422);

    // 2 · O e-mail, pelo Auth.
    let ok = false;
    let erro = '';
    try {
      const ri = await buscar(`${url}/auth/v1/invite${volta ? `?redirect_to=${encodeURIComponent(volta)}` : ''}`, {
        method: 'POST',
        headers: servico,
        body: JSON.stringify({ email: convite.email, data: { nome: convite.nome } }),
      });
      ok = ri.ok;
      if (!ok) {
        const d = await ri.json().catch(() => ({}));
        const codigo = String(d.error_code || d.code || '');
        erro = codigo === 'email_exists' || /already been registered/i.test(d.msg || '')
          ? 'Este e-mail já tem login no Auth. A pessoa pode entrar ou usar "Esqueci a senha".'
          : codigo === 'over_email_send_rate_limit'
            ? 'Limite de e-mails do Auth atingido. Tente mais tarde ou configure um SMTP.'
            : `O Auth recusou o convite (${ri.status}).`;
      }
    } catch {
      erro = 'Sem resposta do Auth.';
    }

    // 3 · O resultado fica registrado.
    let registrado = false;
    try {
      const registro = await buscar(`${url}/rest/v1/rpc/registrar_resultado_convite`, {
        method: 'POST', headers: servico,
        body: JSON.stringify({ p_convite: convite.convite_id, p_ok: ok, p_erro: erro || null }),
      });
      registrado = registro.ok;
    } catch { /* Auth e banco não são uma transação; explicar o resultado incerto. */ }
    if (!registrado) return responder({ ok: false, erro: ok
      ? 'O Auth enviou o convite, mas o histórico não foi atualizado. Confira o e-mail do destinatário antes de reenviar.'
      : 'O convite não foi enviado e não foi possível atualizar o histórico. Tente novamente mais tarde.' }, 503);

    return ok ? responder({ ok: true, email: convite.email }) : responder({ ok: false, erro }, 502);
    } catch {
      return responder({ erro: 'Não foi possível preparar o convite. Tente novamente mais tarde.' }, 503);
    }
  };
}
