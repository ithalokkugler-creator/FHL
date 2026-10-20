// Google fictício para a prévia e os testes: autorização (OAuth) e a parte
// da API do Google Agenda que a função google-agenda usa. Em memória; nada
// sai desta máquina e nenhuma credencial real existe aqui.
//
// Extras só da prévia: POST google/__evento cria um evento "pelo Google"
// (como uma reserva feita pelo cliente) e GET google/__estado mostra tudo.

const json = (corpo, status = 200, extra = {}) => Response.json(corpo, { status, headers: extra });
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const erro = (status, mensagem) => json({ error: { code: status, message: mensagem } }, status);

export function criarGoogleFicticio({ base, conta = 'contato@advocaciafl.com.br' }) {
  // calendario → Map(id → evento)
  let agendas = new Map();
  let versao = 0;
  let sequencia = 0;

  const agenda = (id) => {
    if (!agendas.has(id)) agendas.set(id, new Map());
    return agendas.get(id);
  };
  const carimbar = (ev) => {
    versao += 1;
    ev.etag = `"${versao}"`;
    ev.updated = new Date(Date.now() + versao).toISOString();  // sempre crescente
    return ev;
  };
  const instante = (q) => (q?.dateTime ? Date.parse(q.dateTime) : q?.date ? Date.parse(`${q.date}T03:00:00Z`) : NaN);
  const juntar = (atual, novo) => {
    const ev = { ...atual };
    for (const [k, v] of Object.entries(novo)) {
      if (k === 'start' || k === 'end') ev[k] = Object.fromEntries(Object.entries({ ...atual[k], ...v }).filter(([, x]) => x !== null));
      else if (k !== 'id') ev[k] = v;
    }
    return ev;
  };

  function restaurar() {
    agendas = new Map();
    versao = 0;
    sequencia = 0;
  }

  /** Cria um evento como se tivesse sido marcado no Google. */
  function criarNoGoogle(calendario, dados) {
    sequencia += 1;
    const ev = carimbar({ id: `g${String(sequencia).padStart(6, '0')}ficticio`, status: 'confirmed', ...dados });
    agenda(calendario).set(ev.id, ev);
    return ev;
  }

  async function api(req, resto) {
    const url = new URL(req.url);
    const m = /^calendars\/([^/]+)\/events(?:\/([^/]+)(\/move)?)?$/.exec(resto);
    if (!m) return erro(404, 'Rota fora do Google fictício.');
    if (!(req.headers.get('authorization') ?? '').startsWith('Bearer acesso-ficticio')) return erro(401, 'Invalid Credentials');
    const cal = decodeURIComponent(m[1]);
    const id = m[2] && decodeURIComponent(m[2]);
    const eventos = agenda(cal);

    if (!id && req.method === 'GET') {
      const de = Date.parse(url.searchParams.get('timeMin') ?? '1970-01-01T00:00:00Z');
      const ate = Date.parse(url.searchParams.get('timeMax') ?? '2999-01-01T00:00:00Z');
      const comExcluidos = url.searchParams.get('showDeleted') === 'true';
      const items = [...eventos.values()]
        .filter((ev) => comExcluidos || ev.status !== 'cancelled')
        .filter((ev) => ev.status === 'cancelled' || (instante(ev.end) > de && instante(ev.start) < ate))
        .sort((a, b) => instante(a.start) - instante(b.start))
        .map((ev) => structuredClone(ev));
      return json({ kind: 'calendar#events', items });
    }
    if (!id && req.method === 'POST') {
      const corpo = await req.json();
      const novoId = corpo.id ?? `g${String(++sequencia).padStart(6, '0')}ficticio`;
      if (eventos.has(novoId)) return erro(409, 'The requested identifier already exists.');
      const ev = carimbar({ ...juntar({}, corpo), id: novoId, status: 'confirmed' });
      eventos.set(novoId, ev);
      return json(ev);
    }
    const atual = id && eventos.get(id);
    if (m[3] && req.method === 'POST') {
      const destino = url.searchParams.get('destination');
      if (!atual || atual.status === 'cancelled') return erro(404, 'Not Found');
      eventos.set(id, carimbar({ ...atual, status: 'cancelled' }));
      const movido = carimbar({ ...atual });
      agenda(destino).set(id, movido);
      return json(movido);
    }
    if (!atual) return erro(404, 'Not Found');
    if (req.method === 'GET') return json(atual);
    if (req.method === 'PATCH') {
      const ev = carimbar(juntar(atual, await req.json()));
      eventos.set(id, ev);
      return json(ev);
    }
    if (req.method === 'DELETE') {
      if (atual.status === 'cancelled') return erro(410, 'Resource has been deleted');
      eventos.set(id, carimbar({ ...atual, status: 'cancelled' }));
      return new Response(null, { status: 204 });
    }
    return erro(405, 'Método fora do Google fictício.');
  }

  async function tratar(req, resto) {
    const url = new URL(req.url);
    if (resto === 'auth') {
      // Autoriza na hora, como se o administrador tivesse clicado em "Permitir".
      const volta = new URL(url.searchParams.get('redirect_uri'));
      volta.searchParams.set('code', 'codigo-ficticio');
      volta.searchParams.set('state', url.searchParams.get('state') ?? '');
      return new Response(null, { status: 302, headers: { Location: volta.href } });
    }
    if (resto === 'token' && req.method === 'POST') {
      const campos = new URLSearchParams(await req.text());
      if (campos.get('grant_type') === 'authorization_code') {
        return json({
          access_token: 'acesso-ficticio', expires_in: 3599, token_type: 'Bearer', refresh_token: 'refresh-ficticio',
          scope: 'openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
          id_token: `${b64url({ alg: 'none' })}.${b64url({ email: conta, email_verified: true })}.assinatura`,
        });
      }
      if (campos.get('refresh_token') === 'refresh-ficticio') return json({ access_token: 'acesso-ficticio', expires_in: 3599 });
      return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    }
    if (resto.startsWith('revoke')) return json({});
    if (resto.startsWith('calendar/v3/')) return api(req, resto.slice('calendar/v3/'.length));
    if (resto === '__evento' && req.method === 'POST') {
      const { calendario, evento } = await req.json();
      return json(criarNoGoogle(calendario, evento));
    }
    if (resto === '__estado') {
      return json(Object.fromEntries([...agendas].map(([cal, evs]) => [cal, [...evs.values()]])));
    }
    return erro(404, 'Rota fora do Google fictício.');
  }

  return {
    tratar,
    restaurar,
    criarNoGoogle,
    agendas: () => agendas,
    enderecos: {
      auth: `${base}/google/auth`,
      token: `${base}/google/token`,
      revogar: `${base}/google/revoke`,
      api: `${base}/google/calendar/v3`,
    },
  };
}
