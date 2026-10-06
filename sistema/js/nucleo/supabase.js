// Cliente mínimo do Supabase: Auth e Data API, só com fetch.
// ==========================================================
//
// A área dos advogados segue a regra do site — sem dependência e sem build —,
// então não usa o @supabase/supabase-js. O que o sistema precisa cabe aqui:
// entrar, manter a sessão viva, sair, trocar senha, ler, incluir, alterar e
// chamar funções do banco.
//
// Este arquivo não decide o que alguém pode ver. Quem decide é o banco, pelas
// políticas de supabase/migrations/; aqui só se carrega o token de quem entrou.

import { SUPABASE_CHAVE, SUPABASE_URL } from '../config.js';
import { montarConsulta } from './consulta.js';

const CHAVE_LOCAL = 'fhl.sessao';

// Renova um pouco antes de expirar: token que vence no meio de uma requisição
// vira um 401 sem motivo aparente.
const MARGEM = 90; // segundos

export class ErroApi extends Error {
  constructor(mensagem, { status = 0, codigo = '', detalhe = '', dica = '' } = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.detalhe = detalhe;
    this.dica = dica;
  }
}

const agora = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

let sessao = lerGuardada();
const ouvintes = new Set();
let timer = null;

function lerGuardada() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || 'null');
    return s?.access_token && s?.refresh_token ? s : null;
  } catch {
    return null;
  }
}

function guardar(nova) {
  sessao = nova;
  try {
    if (nova) localStorage.setItem(CHAVE_LOCAL, JSON.stringify(nova));
    else localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    // Armazenamento bloqueado: a sessão vale enquanto a aba estiver aberta.
  }
  agendar();
  for (const fn of ouvintes) fn(sessao);
}

function agendar() {
  clearTimeout(timer);
  if (!sessao) return;
  const faltam = sessao.expires_at - agora() - MARGEM;
  timer = setTimeout(() => renovar().catch(() => {}), Math.max(faltam, 5) * 1000);
}

// Outra aba entrou, saiu ou renovou.
addEventListener('storage', (e) => {
  if (e.key !== CHAVE_LOCAL) return;
  sessao = lerGuardada();
  agendar();
  for (const fn of ouvintes) fn(sessao);
});

agendar();

export const sessaoAtual = () => sessao;

/** E-mail de quem entrou. A sessão que volta de um link de e-mail não traz o
 *  usuário, só o token — e o e-mail está dentro dele. */
export function emailDaSessao() {
  if (sessao?.user?.email) return sessao.user.email;
  try {
    const carga = sessao.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(carga)).email ?? null;
  } catch {
    return null;
  }
}

export function aoMudarSessao(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function sessaoDe(r) {
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: Number(r.expires_at) || agora() + (Number(r.expires_in) || 3600),
    user: r.user ?? null,
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const MENSAGENS_AUTH = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  invalid_grant: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Este e-mail ainda não foi confirmado.',
  user_banned: 'Este acesso está bloqueado.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Espere e tente de novo.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  reauthentication_needed: 'Por segurança, saia e entre de novo antes de trocar a senha.',
  refresh_token_not_found: 'Sua sessão expirou. Entre de novo.',
  refresh_token_already_used: 'Sua sessão expirou. Entre de novo.',
  session_not_found: 'Sua sessão expirou. Entre de novo.',
  session_expired: 'Sua sessão expirou. Entre de novo.',
};

async function buscar(url, opcoes) {
  try {
    return await fetch(url, opcoes);
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Confira a internet e tente de novo.');
  }
}

async function jsonOuNada(resposta) {
  const texto = await resposta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return { message: texto };
  }
}

async function auth(caminho, { metodo = 'POST', corpo, token } = {}) {
  const headers = { apikey: SUPABASE_CHAVE };
  if (corpo) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const resposta = await buscar(`${SUPABASE_URL}/auth/v1/${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await jsonOuNada(resposta);

  if (!resposta.ok) {
    const codigo = String(dados?.error_code || dados?.code || dados?.error || '');
    const mensagem = MENSAGENS_AUTH[codigo]
      || (resposta.status === 429 ? MENSAGENS_AUTH.over_request_rate_limit : '')
      || 'Não foi possível concluir. Tente de novo.';
    throw new ErroApi(mensagem, {
      status: resposta.status,
      codigo,
      detalhe: dados?.msg || dados?.error_description || dados?.message || '',
    });
  }
  return dados;
}

export async function entrar(email, senha) {
  guardar(sessaoDe(await auth('token?grant_type=password', { corpo: { email, password: senha } })));
  return sessao;
}

export async function sair() {
  const token = sessao?.access_token;
  guardar(null);
  if (token) await auth('logout?scope=local', { token }).catch(() => {});
}

let renovacao = null;

/** Troca o refresh token por uma sessão nova. Uma renovação por vez, também
 *  entre abas: o refresh token é de uso único, e duas abas renovando juntas
 *  derrubariam uma à outra.
 *
 *  `recusado` é o access token que o servidor acabou de recusar: se a sessão
 *  guardada ainda for ele, renova mesmo sem estar perto de expirar. */
export function renovar(recusado = null) {
  renovacao ??= comTrava(async () => {
    const guardada = lerGuardada() ?? sessao;
    if (!guardada) return null;

    const outraAbaRenovou = guardada.access_token !== (recusado ?? sessao?.access_token);
    const perto = guardada.expires_at - agora() <= MARGEM;
    if (!perto && (recusado === null || outraAbaRenovou)) {
      if (guardada.access_token !== sessao?.access_token) guardar(guardada);
      return guardada;
    }

    try {
      const d = await auth('token?grant_type=refresh_token', {
        corpo: { refresh_token: guardada.refresh_token },
      });
      guardar(sessaoDe(d));
      return sessao;
    } catch (erro) {
      // Token recusado: a sessão acabou. Falha de rede: tenta de novo depois.
      if (erro.status >= 400 && erro.status < 500) guardar(null);
      else agendar();
      throw erro;
    }
  }).finally(() => {
    renovacao = null;
  });
  return renovacao;
}

function comTrava(fn) {
  return navigator.locks?.request ? navigator.locks.request('fhl.sessao', fn) : fn();
}

async function tokenValido() {
  if (!sessao) return null;
  if (sessao.expires_at - agora() <= MARGEM) await renovar().catch(() => {});
  return sessao?.access_token ?? null;
}

export async function pedirNovaSenha(email) {
  // O link do e-mail volta para esta mesma página (ver sessaoDoLink).
  const volta = location.origin + location.pathname;
  await auth(`recover?redirect_to=${encodeURIComponent(volta)}`, { corpo: { email } });
}

export async function trocarSenha(senha) {
  await auth('user', { metodo: 'PUT', corpo: { password: senha }, token: await tokenValido() });
}

/** Links da Auth — recuperar senha, convite — voltam com a sessão no
 *  fragmento da URL: #access_token=…&refresh_token=…&type=recovery.
 *  Devolve o tipo do link, ou null quando a página não foi aberta por um. */
export function sessaoDoLink() {
  const fragmento = location.hash.slice(1);
  if (!/(^|&)(access_token|error_description)=/.test(fragmento)) return null;

  const p = new URLSearchParams(fragmento);
  history.replaceState(null, '', location.pathname + location.search);

  if (p.get('error_description')) {
    throw new ErroApi(
      p.get('error_code') === 'otp_expired'
        ? 'Este link expirou. Peça um novo na tela de entrada.'
        : 'Este link não vale mais. Peça um novo na tela de entrada.'
    );
  }

  guardar(sessaoDe({
    access_token: p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    expires_at: p.get('expires_at'),
    expires_in: p.get('expires_in'),
  }));
  return p.get('type') || 'link';
}

// ---------------------------------------------------------------------------
// Data API
// ---------------------------------------------------------------------------

const MENSAGENS_BANCO = {
  23505: 'Já existe um registro com esses dados.',
  23503: 'Este registro depende de outro que não existe.',
  23514: 'Algum valor não é aceito. Confira os campos.',
  23502: 'Falta preencher um campo obrigatório.',
  '22P02': 'Algum valor está num formato inválido.',
  42501: 'Seu acesso não permite esta ação.',
};

function mensagemDoBanco(d, status) {
  const codigo = d?.code || '';
  const texto = d?.message || '';
  // As funções do banco levantam erros já escritos para quem usa o sistema.
  // Os do próprio Postgres vêm em inglês e ganham uma tradução genérica.
  const escritoNoBanco = codigo === 'P0001' || codigo === '22023'
    || (codigo === '42501' && !/permission denied/i.test(texto));
  if (escritoNoBanco && texto) return texto;
  if (MENSAGENS_BANCO[codigo]) return MENSAGENS_BANCO[codigo];
  if (status === 401) return 'Sua sessão expirou. Entre de novo.';
  return 'Não foi possível concluir. Tente de novo.';
}

async function rest(metodo, caminho, { params = [], corpo, prefer } = {}, repetida = false) {
  const token = await tokenValido();
  const headers = { apikey: SUPABASE_CHAVE, Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const url = new URL(`${SUPABASE_URL}/rest/v1/${caminho}`);
  for (const [chave, valor] of params) url.searchParams.append(chave, valor);

  const resposta = await buscar(url, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  // Token recusado no meio do caminho: renova uma vez e repete.
  if (resposta.status === 401 && token && !repetida) {
    await renovar(token).catch(() => {});
    if (sessao) return rest(metodo, caminho, { params, corpo, prefer }, true);
  }

  const dados = await jsonOuNada(resposta);
  if (!resposta.ok) {
    throw new ErroApi(mensagemDoBanco(dados, resposta.status), {
      status: resposta.status,
      codigo: dados?.code || '',
      detalhe: dados?.details || dados?.message || '',
      dica: dados?.hint || '',
    });
  }
  // Quem depende de uma gravação (os contadores do menu, por exemplo) decide
  // por conta própria se ela interessa: aqui só se avisa onde se gravou.
  if (metodo !== 'GET') dispatchEvent(new CustomEvent('fhl:gravou', { detail: { caminho } }));
  return dados;
}

export const db = {
  /** Linhas de uma tabela ou view. Ver consulta.js para o formato. */
  listar: (tabela, consulta) => rest('GET', tabela, { params: montarConsulta(consulta) }),

  /** Todas as linhas, de mil em mil: a Data API do Supabase devolve no máximo
   *  1000 por chamada e corta o resto em silêncio. */
  async todos(tabela, consulta = {}) {
    const linhas = [];
    for (let deslocamento = 0; ; deslocamento += 1000) {
      const pagina = await rest('GET', tabela, {
        params: montarConsulta({ ordem: 'id.asc', ...consulta, limite: 1000, deslocamento }),
      });
      linhas.push(...pagina);
      if (pagina.length < 1000) return linhas;
    }
  },

  async um(tabela, consulta) {
    const linhas = await rest('GET', tabela, { params: montarConsulta({ ...consulta, limite: 1 }) });
    return linhas[0] ?? null;
  },

  /** Inclui e devolve a linha criada. */
  async inserir(tabela, dados, select = '*') {
    const linhas = await rest('POST', tabela, {
      params: [['select', select]],
      corpo: dados,
      prefer: 'return=representation',
    });
    return Array.isArray(dados) ? linhas : linhas[0];
  },

  /** Altera as linhas que passam nos filtros e devolve a primeira. */
  async alterar(tabela, filtros, dados, select = '*') {
    if (!filtros?.length) throw new Error('alterar() sem filtro mudaria a tabela inteira.');
    const linhas = await rest('PATCH', tabela, {
      params: montarConsulta({ select, filtros }),
      corpo: dados,
      prefer: 'return=representation',
    });
    if (!linhas.length) throw new ErroApi('Registro não encontrado ou sem permissão para alterar.');
    return linhas[0];
  },

  /** Chama uma função do banco. */
  rpc: (funcao, args = {}) => rest('POST', `rpc/${funcao}`, { corpo: args }),

  /**
   * Envia um arquivo para o Storage e devolve o caminho dentro do balde.
   *
   * Só as imagens dos cartões de rede social passam por aqui (ver
   * telas/site/publicacao.js). Quem pode enviar é decidido pela política do
   * balde, não por esta função. `x-upsert` deixa reenviar a mesma imagem
   * corrigida sem trocar o nome — e sem trocar o endereço já gravado no
   * artigo.
   */
  async enviarArquivo(balde, caminho, arquivo) {
    const token = await tokenValido();
    const resposta = await buscar(`${SUPABASE_URL}/storage/v1/object/${balde}/${caminho}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CHAVE,
        Authorization: `Bearer ${token}`,
        'Content-Type': arquivo.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: arquivo,
    });

    if (!resposta.ok) {
      const dados = await jsonOuNada(resposta);
      throw new ErroApi(
        resposta.status === 403 || resposta.status === 401
          ? 'Seu acesso não permite enviar imagens.'
          : dados?.message || 'Não foi possível enviar a imagem.',
        { status: resposta.status, detalhe: dados?.error || '' },
      );
    }
    return caminho;
  },

  /** Endereço público do arquivo, para mostrar a prévia na tela. */
  enderecoDoArquivo: (balde, caminho) =>
    `${SUPABASE_URL}/storage/v1/object/public/${balde}/${caminho}`,

  /**
   * Chama uma função de borda (Edge Function).
   *
   * Existe uma só: `publicar-site`, que guarda a URL do Deploy Hook da Vercel.
   * Ela precisa ficar fora do navegador — quem tem essa URL dispara build no
   * site do escritório sem passar por login nenhum.
   */
  async funcao(nome, corpo = {}) {
    const token = await tokenValido();
    const resposta = await buscar(`${SUPABASE_URL}/functions/v1/${nome}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CHAVE,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
    });

    const dados = await jsonOuNada(resposta);
    if (!resposta.ok) {
      throw new ErroApi(dados?.erro || 'Não foi possível concluir. Tente de novo.', {
        status: resposta.status,
        detalhe: dados?.detalhe || '',
      });
    }
    return dados;
  },
};
