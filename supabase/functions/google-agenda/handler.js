// Google Agenda nos dois sentidos (migração 34).
// ===============================================
//
// Uma função só, com quatro entradas:
//
//   · GET com ?code — a volta do Google depois que o administrador autoriza a
//     conta do escritório. Troca o código pela autorização permanente
//     (refresh token), confere a conta e guarda tudo no banco, em privado.
//   · POST {acao: 'iniciar'} — o administrador pede o endereço de autorização.
//   · POST {acao: 'sincronizar'} — uma rodada: envia ao Google o que mudou
//     aqui e traz o que mudou lá. Chamam: o banco (pg_net logo depois de cada
//     mudança, pg_cron a cada 2 minutos, com o x-fl-cron) e a tela ("Atualizar").
//   · POST {acao: 'desconectar'} — o administrador desfaz a ligação.
//
// Quem pode o quê é decidido pelo banco, com o token de quem chamou; a chave
// do servidor só lê e grava o que é da sincronização. Nada vai por e-mail ao
// cliente (sendUpdates=none): avisar continua sendo pelas mãos da equipe.
//
// No Google, o sistema só escreve nos eventos que ele mesmo criou (id "fl…").
// O que nasceu lá — reserva de cliente, evento de um advogado — só é lido.

import { corpoDoEvento, idDoEvento, lerEvento } from './eventos.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export const GOOGLE = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revogar: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/calendar/v3',
};
export const ESCOPOS = 'openid email https://www.googleapis.com/auth/calendar.events';
const DIA = 864e5;
// O que é sincronizado: de 30 dias atrás a 180 dias à frente.
const JANELA = { antes: 30 * DIA, depois: 180 * DIA };
const SUMIU = [404, 410];

class ErroConexao extends Error {}

function emailDoToken(idToken) {
  try {
    const parte = String(idToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const texto = new TextDecoder().decode(Uint8Array.from(atob(parte), (c) => c.charCodeAt(0)));
    return String(JSON.parse(texto).email ?? '').toLowerCase();
  } catch {
    return '';
  }
}

export function criarSincronizador({
  url, chave, clienteId, segredo, retorno, sistema,
  conta = 'contato@advocaciafl.com.br', google = GOOGLE, buscar = fetch, agora = () => new Date(),
}) {
  const servico = { apikey: chave, 'Content-Type': 'application/json' };
  if (chave && !chave.startsWith('sb_secret_')) servico.Authorization = `Bearer ${chave}`;
  const enc = encodeURIComponent;

  async function rpc(nome, corpo = {}, cabecalhos = servico) {
    const r = await buscar(`${url}/rest/v1/rpc/${nome}`, { method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      const erro = new Error(d?.message || `O banco recusou ${nome} (${r.status}).`);
      erro.status = r.status;
      throw erro;
    }
    return d;
  }

  // ------------------------------------------------------------ Google
  async function pedirToken(campos) {
    const r = await buscar(google.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clienteId, client_secret: segredo, ...campos }).toString(),
    });
    return { ok: r.ok, status: r.status, dados: await r.json().catch(() => ({})) };
  }

  async function tokenDeAcesso(refresh) {
    const r = await pedirToken({ grant_type: 'refresh_token', refresh_token: refresh });
    if (r.ok && r.dados.access_token) return r.dados.access_token;
    if (r.dados?.error === 'invalid_grant') {
      throw new ErroConexao('A ligação com o Google foi desfeita (acesso revogado ou senha da conta trocada). '
        + 'O administrador precisa conectar de novo em Agenda → Configurar.');
    }
    throw new Error(`O Google não liberou o acesso agora (${r.status}). Nova tentativa em 2 minutos.`);
  }

  const revogar = (token) => buscar(`${google.revogar}?token=${enc(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => null);

  async function api(acesso, metodo, caminho, corpo) {
    const r = await buscar(`${google.api}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${acesso}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = r.status === 204 ? null : await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, dados };
  }

  const eventos = (cal, id) => `/calendars/${enc(cal)}/events${id ? `/${enc(id)}` : ''}`;

  // ------------------------------------------------------------ sistema → Google
  async function enviar(acesso, p) {
    const base = { id: p.id, mudou_em: p.mudou_em };
    const falha = (x, oque) => ({ ...base, ok: false, erro: `${oque}: ${x.dados?.error?.message || `erro ${x.status}`}` });
    const pronto = (cal, d) => ({ ...base, ok: true, calendario: cal, evento_id: d.id, etag: d.etag, atualizado_em: d.updated });

    // O banco só lista o que o sistema criou; isto é a segunda trava.
    if (p.origem !== 'sistema') return { ...base, ok: true };

    if (!p.destino) {
      // Cancelado, remarcado ou sem agenda: sai do Google.
      if (!p.evento_id) return { ...base, ok: true };
      const x = await api(acesso, 'DELETE', `${eventos(p.calendario, p.evento_id)}?sendUpdates=none`);
      return x.ok || SUMIU.includes(x.status) ? { ...base, ok: true, calendario: null, evento_id: null, etag: null }
        : falha(x, 'Excluir no Google');
    }

    const corpo = corpoDoEvento(p);
    let id = p.evento_id;
    if (id && p.calendario && p.calendario !== p.destino) {
      const x = await api(acesso, 'POST', `${eventos(p.calendario, id)}/move?destination=${enc(p.destino)}&sendUpdates=none`);
      if (SUMIU.includes(x.status)) id = null;
      else if (!x.ok) return falha(x, 'Mover no Google');
    }
    if (id) {
      const x = await api(acesso, 'PATCH', `${eventos(p.destino, id)}?sendUpdates=none`, corpo);
      if (x.ok) return pronto(p.destino, x.dados);
      if (!SUMIU.includes(x.status)) return falha(x, 'Alterar no Google');
    }

    const novo = idDoEvento(p.id);
    let x = await api(acesso, 'POST', `${eventos(p.destino)}?sendUpdates=none`, { ...corpo, id: novo });
    if (x.status === 409) {
      // Já existe com esse id: envio anterior que não chegou a ser anotado, ou
      // excluído antes. Reaproveita (o status "confirmed" o traz de volta).
      x = await api(acesso, 'PATCH', `${eventos(p.destino, novo)}?sendUpdates=none`, corpo);
      if (SUMIU.includes(x.status)) x = await api(acesso, 'POST', `${eventos(p.destino)}?sendUpdates=none`, corpo);
    }
    return x.ok ? pronto(p.destino, x.dados) : falha(x, 'Criar no Google');
  }

  async function empurrar(acesso, resumo) {
    const tentados = new Set();
    for (let rodada = 0; rodada < 6; rodada++) {
      const lista = (await rpc('google_agenda_pendencias', { p_limite: 50 }) ?? [])
        .filter((p) => !tentados.has(`${p.id}|${p.mudou_em}`));
      if (!lista.length) return;
      const resultados = [];
      for (const p of lista) {
        tentados.add(`${p.id}|${p.mudou_em}`);
        try {
          resultados.push(await enviar(acesso, p));
        } catch {
          resultados.push({ id: p.id, mudou_em: p.mudou_em, ok: false, erro: 'Sem resposta do Google.' });
        }
      }
      await rpc('google_agenda_registrar', { p_resultados: resultados });
      resumo.enviados += resultados.filter((r) => r.ok).length;
      resumo.erros += resultados.filter((r) => !r.ok).length;
    }
  }

  // ------------------------------------------------------------ Google → sistema
  const somar = (resumo, r) => {
    resumo.criados += r?.criados ?? 0;
    resumo.alterados += r?.alterados ?? 0;
    resumo.cancelados += r?.cancelados ?? 0;
    resumo.erros += r?.erros?.length ?? 0;
  };

  async function trazer(acesso, resumo) {
    const agoraMs = agora().getTime();
    const de = new Date(agoraMs - JANELA.antes).toISOString();
    const ate = new Date(agoraMs + JANELA.depois).toISOString();
    const lidas = [];
    for (const { calendario } of await rpc('google_agenda_calendarios') ?? []) {
      const itens = [];
      let pagina = '';
      do {
        const q = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', timeMin: de, timeMax: ate, maxResults: '2500' });
        if (pagina) q.set('pageToken', pagina);
        const x = await api(acesso, 'GET', `${eventos(calendario)}?${q}`);
        if (!x.ok) throw new Error(`Não foi possível ler a agenda no Google: ${x.dados?.error?.message || `erro ${x.status}`}.`);
        itens.push(...(x.dados?.items ?? []));
        pagina = x.dados?.nextPageToken ?? '';
      } while (pagina);
      lidas.push({ calendario, lista: itens.map(lerEvento).filter(Boolean) });
    }

    // Primeiro o que existe (um evento levado para outra subagenda aparece
    // nela e como excluído na antiga), depois as exclusões.
    for (const status of ['confirmed', 'cancelled']) {
      for (const { calendario, lista } of lidas) {
        const parte = lista.filter((e) => e.status === status);
        if (parte.length) somar(resumo, await rpc('google_agenda_aplicar', { p_calendario: calendario, p_eventos: parte }));
      }
    }

    // Ligados a uma subagenda mas fora da lista: apagados de vez, ou levados
    // para fora do período.
    for (const { calendario, lista } of lidas) {
      const sumidos = await rpc('google_agenda_conferir', {
        p_calendario: calendario, p_vistos: lista.map((e) => e.id), p_de: de, p_ate: ate,
      }) ?? [];
      const achados = [];
      for (const id of sumidos) {
        const x = await api(acesso, 'GET', eventos(calendario, id));
        if (x.ok) {
          const e = lerEvento(x.dados);
          if (e) achados.push(e);
        } else if (SUMIU.includes(x.status)) {
          achados.push({ id, etag: null, atualizado_em: null, status: 'cancelled' });
        }
      }
      if (achados.length) somar(resumo, await rpc('google_agenda_aplicar', { p_calendario: calendario, p_eventos: achados }));
    }
  }

  async function sincronizar() {
    const conexao = await rpc('google_agenda_conexao');
    if (!conexao) return { conectado: false };
    if (!await rpc('google_agenda_travar')) return { conectado: true, ocupado: true };
    const resumo = { enviados: 0, criados: 0, alterados: 0, cancelados: 0, erros: 0 };
    let erro = null;
    try {
      const acesso = await tokenDeAcesso(conexao.refresh_token);
      // Primeiro traz: uma cópia feita à mão no Google (botão ou .ics) é ligada
      // ao compromisso daqui antes de o envio criar outra.
      await trazer(acesso, resumo);
      await empurrar(acesso, resumo);
    } catch (e) {
      erro = e instanceof Error && e.message ? e.message : 'A sincronização com o Google falhou.';
    }
    try {
      await rpc('google_agenda_destravar', { p_erro: erro });
    } catch (e) {
      // O que foi feito está feito; a trava vence sozinha em 140 segundos.
      console.error('google_agenda_destravar', e?.message);
    }
    return { conectado: true, ...resumo, erro };
  }

  // ------------------------------------------------------------ autorização
  async function voltaDoGoogle(req) {
    const q = new URL(req.url).searchParams;
    const ir = (situacao, motivo = '') => new Response(null, {
      status: 302,
      headers: { Location: `${sistema}#/agenda?google=${situacao}${motivo ? `&motivo=${enc(motivo)}` : ''}`, 'Cache-Control': 'no-store' },
    });
    if (q.get('error')) return ir('erro', q.get('error') === 'access_denied' ? 'A autorização foi recusada no Google.' : 'O Google não autorizou a ligação.');
    const codigo = q.get('code');
    const estado = q.get('state') ?? '';
    if (!codigo || !/^[0-9a-f]{64}$/.test(estado)) return ir('erro', 'A volta do Google veio sem os dados esperados.');

    const r = await pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: retorno });
    if (!r.ok || !r.dados.refresh_token) return ir('erro', 'O Google não entregou a autorização. Tente de novo.');
    const email = emailDoToken(r.dados.id_token);
    if (!String(r.dados.scope ?? '').includes('auth/calendar.events')) {
      await revogar(r.dados.refresh_token);
      return ir('erro', 'Na tela do Google, marque a permissão de ver e editar os eventos da agenda.');
    }
    if (conta && email !== conta) {
      await revogar(r.dados.refresh_token);
      return ir('erro', `Use a conta ${conta}. A escolhida foi ${email || 'outra'}.`);
    }
    try {
      await rpc('google_agenda_conectar', { p_estado: estado, p_conta: email, p_refresh: r.dados.refresh_token, p_escopos: r.dados.scope });
    } catch (e) {
      await revogar(r.dados.refresh_token);
      return ir('erro', e.message);
    }
    return ir('conectado');
  }

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (!url || !chave || !clienteId || !segredo || !retorno || !sistema) {
      return req.method === 'GET'
        ? new Response('O Google Agenda ainda não está configurado no servidor.', { status: 503 })
        : responder({ erro: 'O Google Agenda ainda não está configurado no servidor.' }, 503);
    }
    try {
      if (req.method === 'GET') return await voltaDoGoogle(req);
      if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405);

      const pedido = await req.json().catch(() => ({}));
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cron = req.headers.get('x-fl-cron') ?? '';
      const comoQuemChamou = { apikey: req.headers.get('apikey') ?? chave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      if (pedido?.acao === 'sincronizar' && cron) {
        const conexao = await rpc('google_agenda_conexao');
        if (!conexao || conexao.token_cron !== cron) return responder({ erro: 'Chamada não reconhecida.' }, 401);
        return responder(await sincronizar());
      }
      if (!token) return responder({ erro: 'Entre no sistema para usar o Google Agenda.' }, 401);

      if (pedido?.acao === 'sincronizar') {
        await rpc('google_agenda_situacao', {}, comoQuemChamou);  // sem acesso à agenda, recusa
        return responder(await sincronizar());
      }
      if (pedido?.acao === 'iniciar') {
        const estado = await rpc('google_agenda_iniciar', {}, comoQuemChamou);
        const q = new URLSearchParams({
          client_id: clienteId, redirect_uri: retorno, response_type: 'code', scope: ESCOPOS,
          access_type: 'offline', prompt: 'consent', state: estado, login_hint: conta,
        });
        return responder({ url: `${google.auth}?${q}` });
      }
      if (pedido?.acao === 'desconectar') {
        if (!await rpc('google_agenda_pode_administrar', {}, comoQuemChamou)) {
          return responder({ erro: 'Só o administrador desfaz a ligação com o Google.' }, 403);
        }
        const conexao = await rpc('google_agenda_conexao');
        if (conexao?.refresh_token) await revogar(conexao.refresh_token);
        await rpc('google_agenda_remover');
        return responder({ ok: true });
      }
      return responder({ erro: 'Pedido inválido.' }, 400);
    } catch (e) {
      const status = e?.status === 403 || e?.status === 401 ? 403 : 503;
      return responder({ erro: status === 403 ? (e.message || 'Sem permissão.') : 'O Google Agenda não respondeu agora. Tente de novo.' }, status);
    }
  };
}
