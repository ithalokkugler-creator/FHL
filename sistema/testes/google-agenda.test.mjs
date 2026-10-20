import test from 'node:test';
import assert from 'node:assert/strict';
import { corpoDoEvento, diaEmBrasilia, idDoEvento, lerEvento, textoSimples, tipoDoEvento } from '../../supabase/functions/google-agenda/eventos.js';
import { criarPreviaBanco, CHAVE_SERVICO } from '../../scripts/local/previa-banco.mjs';

// ---------------------------------------------------------------------------
// Tradução (sem rede nem banco)
// ---------------------------------------------------------------------------

const pendencia = {
  id: '0b7c2f7e-3d7a-4c39-9a0e-5f1f2d3c4b5a', origem: 'sistema', tipo: 'atendimento', modalidade: 'presencial',
  titulo: null, cliente_nome: 'José Silva', responsavel: 'Juliana', processo: null, local_ou_link: null,
  inicio: '2026-10-22T17:00:00+00:00', fim: '2026-10-22T18:00:00+00:00', dia_inteiro: false,
  particular: false, lembrete_minutos: 30,
};

test('Evento do sistema: id fixo, título, endereço, lembrete e marca do compromisso', () => {
  assert.equal(idDoEvento(pendencia.id), 'fl0b7c2f7e3d7a4c399a0e5f1f2d3c4b5a');
  assert.match(idDoEvento(pendencia.id), /^[a-v0-9]{5,1024}$/);
  const corpo = corpoDoEvento(pendencia);
  assert.equal(corpo.summary, 'José Silva');
  assert.deepEqual(corpo.start, { date: null, dateTime: '2026-10-22T17:00:00.000Z', timeZone: 'America/Sao_Paulo' });
  assert.match(corpo.location, /Leocádio/);
  assert.match(corpo.description, /Responsável: Juliana/);
  assert.deepEqual(corpo.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
  assert.equal(corpo.extendedProperties.private.fl_compromisso, pendencia.id);
});

test('Particular vai como "Ocupado", sem detalhe nenhum', () => {
  const corpo = corpoDoEvento({ ...pendencia, particular: true, titulo: 'Médico', local_ou_link: 'Clínica X' });
  assert.equal(corpo.summary, 'Ocupado');
  assert.equal(corpo.description, '');
  assert.equal(corpo.location, '');
  assert.equal(corpo.visibility, 'private');
});

test('Dia inteiro usa a data de Brasília, com o fim exclusivo', () => {
  const corpo = corpoDoEvento({ ...pendencia, tipo: 'bloqueio', modalidade: 'ferias', dia_inteiro: true, cliente_nome: null,
    inicio: '2026-12-21T03:00:00+00:00', fim: '2026-12-24T03:00:00+00:00' });
  assert.deepEqual(corpo.start, { date: '2026-12-21', dateTime: null, timeZone: null });
  assert.deepEqual(corpo.end, { date: '2026-12-24', dateTime: null, timeZone: null });
  assert.equal(corpo.summary, 'Férias');
  assert.equal(diaEmBrasilia('2026-10-23T02:30:00Z'), '2026-10-22');
});

const reserva = {
  id: 'abc123', etag: '"9"', updated: '2026-10-20T15:00:00.000Z', status: 'confirmed',
  summary: 'Atendimento com Vinicius L. Lisboa (Maria Souza)',
  description: 'Agendado por<br>Maria Souza<br><br>Atendimento Presencial ou Virtual?<br>Virtual<br>Telefone: (41) 99999-0000',
  start: { dateTime: '2026-10-23T10:00:00-03:00' }, end: { dateTime: '2026-10-23T10:30:00-03:00' },
  attendees: [{ email: 'contato@advocaciafl.com.br', organizer: true, self: true }, { email: 'maria@example.test', responseStatus: 'accepted' }],
};

test('Reserva do cliente vira atendimento, com a modalidade escolhida no formulário', () => {
  const e = lerEvento(reserva);
  assert.equal(e.tipo, 'atendimento');
  assert.equal(e.modalidade, 'online');
  assert.equal(e.reserva, true);
  assert.equal(e.inicio, '2026-10-23T10:00:00-03:00');
  assert.match(e.descricao, /Maria Souza\n\nAtendimento Presencial ou Virtual\?\nVirtual/);
  assert.equal(e.particular, false);
  const presencial = lerEvento({ ...reserva, description: 'Atendimento Presencial ou Virtual?<br>Presencial' });
  assert.equal(presencial.modalidade, 'presencial');
  // O contato de quem marcou vai junto nas observações.
  assert.match(e.descricao, /^Convidado: maria@example\.test\n\n/);
});

test('Reunião com convidado de fora, sem formulário de reserva, é reunião (não atendimento)', () => {
  const e = lerEvento({ ...reserva, summary: 'Reunião com perito', description: '',
    attendees: [{ email: 'contato@advocaciafl.com.br', self: true, organizer: true }, { email: 'perito@example.test', displayName: 'Perito' }] });
  assert.equal(e.tipo, 'interno');
  assert.equal(e.reserva, true, 'continua sem ser confundida com cópia de compromisso daqui');
  assert.match(e.descricao, /Convidado: Perito <perito@example\.test>/);
});

test('Outros eventos: audiência, dia inteiro, ausência, interno; local de trabalho fica de fora', () => {
  assert.deepEqual(tipoDoEvento({ summary: 'Audiência TRT', start: { dateTime: 'x' } }), { tipo: 'audiencia', modalidade: null });
  assert.deepEqual(tipoDoEvento({ summary: 'Viagem', start: { date: '2026-11-02' } }), { tipo: 'bloqueio', modalidade: null });
  assert.deepEqual(tipoDoEvento({ eventType: 'outOfOffice', summary: 'Fora', start: { dateTime: 'x' } }), { tipo: 'bloqueio', modalidade: 'ausencia' });
  assert.deepEqual(tipoDoEvento({ summary: 'Reunião de sócios', hangoutLink: 'https://meet', start: { dateTime: 'x' } }), { tipo: 'interno', modalidade: 'online' });
  assert.equal(lerEvento({ ...reserva, eventType: 'workingLocation' }), null);
  assert.deepEqual(lerEvento({ id: 'x1', status: 'cancelled', etag: '"2"', updated: 'u' }), { id: 'x1', etag: '"2"', atualizado_em: 'u', status: 'cancelled' });
  assert.equal(lerEvento({ ...reserva, summary: '  ', visibility: 'private' }).titulo, '(sem título)');
  assert.equal(lerEvento({ ...reserva, visibility: 'private' }).particular, true);
  assert.equal(textoSimples('a&amp;b<br/>c &lt;d&gt;'), 'a&b\nc <d>');
});

// ---------------------------------------------------------------------------
// Sincronização de ponta a ponta: banco de verdade (PGlite) + Google fictício
// ---------------------------------------------------------------------------

const ORIGEM = 'http://previa.test';
const BASE = `${ORIGEM}/__teste`;

test('Google Agenda nos dois sentidos, com o banco das migrações e o Google fictício', async (t) => {
  const previa = await criarPreviaBanco({ origem: ORIGEM });
  const chamar = async (caminho, { metodo = 'GET', perfil = null, servico = false, corpo, cabecalhos = {} } = {}) => {
    const headers = { 'Content-Type': 'application/json', apikey: servico ? CHAVE_SERVICO : 'CHAVE-PUBLICA-FICTICIA', ...cabecalhos };
    if (perfil) headers.Authorization = `Bearer teste-${perfil}`;
    if (metodo !== 'GET' && metodo !== 'DELETE') headers.Prefer = 'return=representation';
    const r = await previa.tratar(new Request(`${BASE}/${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }));
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
    return { status: r.status, dados, local: r.headers.get('location') };
  };
  const sincronizar = async () => {
    const r = await chamar('functions/v1/google-agenda', { metodo: 'POST', perfil: 'admin', corpo: { acao: 'sincronizar' } });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.erro, null, r.dados.erro);
    return r.dados;
  };
  const noGoogle = (cal) => [...(previa.google.agendas().get(cal)?.values() ?? [])];
  const compromisso = async (id) => (await chamar(`rest/v1/compromissos?id=eq.${id}&select=*`, { servico: true })).dados[0];

  const membros = (await chamar('rest/v1/membros?select=id,nome_curto,papel', { servico: true })).dados;
  const socia = membros.find((m) => m.nome_curto === 'Sócia');
  const CAL = 'c_socia@group.calendar.google.com';

  await t.test('só o administrador liga, e a volta do Google guarda a ligação', async () => {
    assert.equal((await chamar('functions/v1/google-agenda', { metodo: 'POST', perfil: 'socia', corpo: { acao: 'iniciar' } })).status, 403);
    assert.equal((await chamar('functions/v1/google-agenda', { metodo: 'POST', corpo: { acao: 'sincronizar' } })).status, 401);
    const { dados } = await chamar('functions/v1/google-agenda', { metodo: 'POST', perfil: 'admin', corpo: { acao: 'iniciar' } });
    const pedido = new URL(dados.url);
    assert.equal(pedido.searchParams.get('access_type'), 'offline');
    assert.equal(pedido.searchParams.get('login_hint'), 'contato@advocaciafl.com.br');
    assert.match(pedido.searchParams.get('scope'), /calendar\.events/);
    const consentimento = await previa.tratar(new Request(dados.url));
    const volta = await previa.tratar(new Request(consentimento.headers.get('location')));
    assert.equal(volta.status, 302);
    assert.equal(volta.headers.get('location'), `${ORIGEM}/sistema/#/agenda?google=conectado`);
    // O mesmo "state" não serve duas vezes.
    const repetida = await previa.tratar(new Request(consentimento.headers.get('location')));
    assert.match(repetida.headers.get('location'), /google=erro/);
    const situacao = (await chamar('rest/v1/rpc/google_agenda_situacao', { metodo: 'POST', perfil: 'socia', corpo: {} })).dados;
    assert.equal(situacao.conectado, true);
    assert.equal(situacao.conta, 'contato@advocaciafl.com.br');
    assert.equal('refresh_token' in situacao, false);
    // A autorização não sai pela Data API para ninguém além do servidor.
    assert.notEqual((await chamar('rest/v1/rpc/google_agenda_conexao', { metodo: 'POST', perfil: 'admin', corpo: {} })).status, 200);
    assert.equal((await chamar('functions/v1/google-agenda', { metodo: 'POST', corpo: { acao: 'sincronizar' }, cabecalhos: { 'x-fl-cron': 'errado' } })).status, 401);
  });

  let lancado;
  await t.test('sistema → Google: marcado aqui vai para a subagenda do responsável', async () => {
    await chamar(`rest/v1/membros?id=eq.${socia.id}`, { metodo: 'PATCH', perfil: 'admin', corpo: { google_agenda: CAL } });
    lancado = (await chamar('rest/v1/compromissos', { metodo: 'POST', perfil: 'admin', corpo: {
      membro_id: socia.id, tipo: 'atendimento', modalidade: 'presencial', titulo: 'Consulta inicial',
      inicio: '2026-11-03T13:00:00Z', fim: '2026-11-03T14:00:00Z', observacoes: 'RELATO INTERNO',
    } })).dados[0];
    const r = await sincronizar();
    assert.ok(r.enviados >= 1);
    const ev = noGoogle(CAL).find((e) => e.id === idDoEvento(lancado.id));
    assert.ok(ev, 'o evento existe no Google');
    assert.equal(ev.summary, 'Consulta inicial');
    assert.equal(ev.start.dateTime, '2026-11-03T13:00:00.000Z');
    assert.ok(!JSON.stringify(ev).includes('RELATO INTERNO'), 'observação interna não vai');
    const [estado] = (await chamar('rest/v1/rpc/google_agenda_estados', { metodo: 'POST', perfil: 'admin', corpo: { p_ids: [lancado.id] } })).dados;
    assert.equal(estado.situacao, 'ok');
    assert.equal(estado.no_google, true);
    // Nada mudou: a rodada seguinte não envia nem traz nada.
    const quieta = await sincronizar();
    assert.deepEqual([quieta.enviados, quieta.criados, quieta.alterados, quieta.cancelados], [0, 0, 0, 0]);
  });

  await t.test('mudou o horário aqui: muda lá; mudou o horário lá: muda aqui (o título continua o daqui)', async () => {
    await chamar(`rest/v1/compromissos?id=eq.${lancado.id}`, { metodo: 'PATCH', perfil: 'admin', corpo: { inicio: '2026-11-03T15:00:00Z', fim: '2026-11-03T16:00:00Z' } });
    await sincronizar();
    let ev = noGoogle(CAL).find((e) => e.id === idDoEvento(lancado.id));
    assert.equal(ev.start.dateTime, '2026-11-03T15:00:00.000Z');

    const r = await previa.tratar(new Request(`${BASE}/google/calendar/v3/calendars/${encodeURIComponent(CAL)}/events/${ev.id}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer acesso-ficticio', 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'Renomeado no Google', start: { dateTime: '2026-11-04T12:00:00Z' }, end: { dateTime: '2026-11-04T13:00:00Z' } }),
    }));
    assert.equal(r.status, 200);
    const s = await sincronizar();
    assert.equal(s.alterados, 1);
    const c = await compromisso(lancado.id);
    assert.equal(Date.parse(c.inicio), Date.parse('2026-11-04T12:00:00Z'));
    assert.equal(c.titulo, 'Consulta inicial');
    ev = noGoogle(CAL).find((e) => e.id === idDoEvento(lancado.id));
    assert.equal(ev.start.dateTime, '2026-11-04T12:00:00Z', 'a mudança do Google não volta como envio');
  });

  let trazido;
  await t.test('Google → sistema: a reserva feita pelo cliente aparece como atendimento', async () => {
    previa.google.criarNoGoogle(CAL, {
      summary: 'Atendimento com Sócia (Maria Souza)', description: 'Atendimento Presencial ou Virtual?<br>Presencial',
      start: { dateTime: '2026-11-05T13:00:00Z' }, end: { dateTime: '2026-11-05T13:30:00Z' },
      attendees: [{ email: 'contato@advocaciafl.com.br', self: true, organizer: true }, { email: 'maria@example.test' }],
    });
    const r = await sincronizar();
    assert.equal(r.criados, 1);
    trazido = (await chamar('rest/v1/compromissos?titulo=eq.Atendimento%20com%20S%C3%B3cia%20(Maria%20Souza)&select=*', { servico: true })).dados[0];
    assert.ok(trazido);
    assert.equal(trazido.membro_id, socia.id);
    assert.equal(trazido.tipo, 'atendimento');
    assert.equal(trazido.modalidade, 'presencial');
    assert.equal(Date.parse(trazido.inicio), Date.parse('2026-11-05T13:00:00Z'));
    const [estado] = (await chamar('rest/v1/rpc/google_agenda_estados', { metodo: 'POST', perfil: 'admin', corpo: { p_ids: [trazido.id] } })).dados;
    assert.equal(estado.origem, 'google');
    assert.equal((await sincronizar()).criados, 0, 'não duplica na rodada seguinte');
  });

  await t.test('o que veio do Google nunca é alterado nem excluído por aqui', async () => {
    const antes = structuredClone(noGoogle(CAL).find((e) => e.summary === 'Atendimento com Sócia (Maria Souza)'));
    await chamar(`rest/v1/compromissos?id=eq.${trazido.id}`, { metodo: 'PATCH', perfil: 'admin', corpo: {
      titulo: 'Outro título', inicio: '2026-11-05T15:00:00Z', fim: '2026-11-05T15:30:00Z', situacao: 'realizado' } });
    const r = await sincronizar();
    assert.equal(r.enviados, 0);
    assert.deepEqual(noGoogle(CAL).find((e) => e.id === antes.id), antes, 'o evento do Google fica como estava');
    // Mudou lá depois: vale o Google.
    await previa.tratar(new Request(`${BASE}/google/calendar/v3/calendars/${encodeURIComponent(CAL)}/events/${antes.id}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer acesso-ficticio', 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: { dateTime: '2026-11-05T14:00:00Z' }, end: { dateTime: '2026-11-05T14:30:00Z' } }) }));
    await sincronizar();
    const c = await compromisso(trazido.id);
    assert.equal(Date.parse(c.inicio), Date.parse('2026-11-05T14:00:00Z'));
    assert.equal(c.titulo, 'Atendimento com Sócia (Maria Souza)');
  });

  await t.test('excluído no Google: cancela aqui, com o motivo', async () => {
    const ev = noGoogle(CAL).find((e) => e.summary === 'Atendimento com Sócia (Maria Souza)');
    await previa.tratar(new Request(`${BASE}/google/calendar/v3/calendars/${encodeURIComponent(CAL)}/events/${ev.id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer acesso-ficticio' } }));
    const r = await sincronizar();
    assert.equal(r.cancelados, 1);
    const c = await compromisso(trazido.id);
    assert.ok(c.cancelado_em);
    assert.equal(c.motivo_cancelamento, 'Excluído no Google Agenda');
  });

  await t.test('cancelado aqui: sai do Google; particular vai como "Ocupado"', async () => {
    await chamar(`rest/v1/compromissos?id=eq.${lancado.id}`, { metodo: 'PATCH', perfil: 'admin', corpo: { cancelado_em: new Date().toISOString(), motivo_cancelamento: 'Cliente desmarcou' } });
    await sincronizar();
    assert.equal(noGoogle(CAL).find((e) => e.id === idDoEvento(lancado.id)).status, 'cancelled');
    assert.equal((await compromisso(lancado.id)).motivo_cancelamento, 'Cliente desmarcou');

    const particular = (await chamar('rest/v1/compromissos', { metodo: 'POST', perfil: 'socia', corpo: {
      membro_id: socia.id, tipo: 'interno', titulo: 'Médico', local_ou_link: 'Clínica', particular: true,
      inicio: '2026-11-06T13:00:00Z', fim: '2026-11-06T14:00:00Z',
    } })).dados[0];
    await sincronizar();
    const ev = noGoogle(CAL).find((e) => e.id === idDoEvento(particular.id));
    assert.equal(ev.summary, 'Ocupado');
    assert.equal(ev.visibility, 'private');
    assert.ok(!JSON.stringify(ev).includes('Clínica'));
  });

  await t.test('reserva cancelada aqui continua no Google (de lá o cliente é avisado)', async () => {
    previa.google.criarNoGoogle(CAL, {
      summary: 'Atendimento com Sócia (João Lima)', start: { dateTime: '2026-11-12T13:00:00Z' }, end: { dateTime: '2026-11-12T13:30:00Z' },
      attendees: [{ email: 'contato@advocaciafl.com.br', self: true, organizer: true }, { email: 'joao@example.test' }],
    });
    await sincronizar();
    const c = (await chamar('rest/v1/compromissos?titulo=eq.Atendimento%20com%20S%C3%B3cia%20(Jo%C3%A3o%20Lima)&select=id', { servico: true })).dados[0];
    await chamar(`rest/v1/compromissos?id=eq.${c.id}`, { metodo: 'PATCH', perfil: 'admin', corpo: { cancelado_em: new Date().toISOString(), motivo_cancelamento: 'teste' } });
    await sincronizar();
    await sincronizar();
    assert.equal(noGoogle(CAL).find((e) => e.summary === 'Atendimento com Sócia (João Lima)').status, 'confirmed');
  });

  await t.test('cópia feita à mão no Google (mesmo horário) é ligada, não duplicada', async () => {
    const outro = membros.find((m) => m.nome_curto === 'Sócio');
    const CAL2 = 'c_socio@group.calendar.google.com';
    const c = (await chamar('rest/v1/compromissos', { metodo: 'POST', perfil: 'admin', corpo: {
      membro_id: outro.id, tipo: 'audiencia', titulo: 'Audiência TRT', inicio: '2026-11-10T17:00:00Z', fim: '2026-11-10T18:00:00Z',
    } })).dados[0];
    previa.google.criarNoGoogle(CAL2, { summary: 'Audiência TRT', start: { dateTime: '2026-11-10T14:00:00-03:00' }, end: { dateTime: '2026-11-10T15:00:00-03:00' } });
    await chamar(`rest/v1/membros?id=eq.${outro.id}`, { metodo: 'PATCH', perfil: 'admin', corpo: { google_agenda: CAL2 } });
    const r = await sincronizar();
    assert.equal(r.criados, 0);
    const vivos = noGoogle(CAL2).filter((e) => e.status !== 'cancelled');
    assert.equal(vivos.length, 1, 'continua um evento só no Google');
    assert.equal(vivos[0].extendedProperties, undefined, 'a cópia não é reescrita');
    const [estado] = (await chamar('rest/v1/rpc/google_agenda_estados', { metodo: 'POST', perfil: 'admin', corpo: { p_ids: [c.id] } })).dados;
    assert.equal(estado.situacao, 'ok');
    assert.equal(estado.origem, 'sistema');
    // Título diferente no mesmo horário: não é cópia; o sistema cria o dele.
    const d = (await chamar('rest/v1/compromissos', { metodo: 'POST', perfil: 'admin', corpo: {
      membro_id: outro.id, tipo: 'interno', titulo: 'Reunião', inicio: '2026-11-11T17:00:00Z', fim: '2026-11-11T18:00:00Z' } })).dados[0];
    const pessoal = previa.google.criarNoGoogle(CAL2, { summary: 'Dentista', start: { dateTime: '2026-11-11T17:00:00Z' }, end: { dateTime: '2026-11-11T18:00:00Z' } });
    await sincronizar();
    assert.deepEqual(noGoogle(CAL2).find((e) => e.id === pessoal.id), pessoal, 'o evento pessoal fica intacto');
    assert.ok(noGoogle(CAL2).some((e) => e.id === idDoEvento(d.id)));
  });

  await t.test('desligar: só o administrador; a autorização sai do banco', async () => {
    assert.equal((await chamar('functions/v1/google-agenda', { metodo: 'POST', perfil: 'socia', corpo: { acao: 'desconectar' } })).status, 403);
    assert.equal((await chamar('functions/v1/google-agenda', { metodo: 'POST', perfil: 'admin', corpo: { acao: 'desconectar' } })).status, 200);
    const situacao = (await chamar('rest/v1/rpc/google_agenda_situacao', { metodo: 'POST', perfil: 'admin', corpo: {} })).dados;
    assert.equal(situacao.conectado, false);
    const r = await chamar('functions/v1/google-agenda', { metodo: 'POST', perfil: 'admin', corpo: { acao: 'sincronizar' } });
    assert.deepEqual(r.dados, { conectado: false });
  });
});
