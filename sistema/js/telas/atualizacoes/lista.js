// Atualizações (F4): a linha do tempo de tudo o que foi feito por cliente,
// com quem fez e quanto tempo levou. É também o que permite a qualquer sócio
// atender o cliente de outro sem parecer perdido (CLAUDE.md §4).

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { estado, nomeDe, pode } from '../../nucleo/estado.js';
import { data, duracao, hoje, hora, instante, noFuso, somarDias } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO } from '../../dominio/clientes.js';
import { COLUNAS_ATUALIZACAO, filtrarAtualizacoes, minutosDe, TIPOS_ATUALIZACAO, totais } from '../../dominio/tempo.js';
import { cabecalho, indicador, opcoes, plural, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { iniciarCronometro, pararCronometro } from './cronometro.js';
import { formularioAtualizacao, notificarAtualizacoes } from './formulario.js';

const SITUACOES = [['ativas', 'Ativas'], ['cancelados', 'Canceladas'], ['todos', 'Todas']];
const diaValido = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');

/** "1 cronômetro rodando, fora do total" — o tempo aberto ainda não conta. */
export const notaRodando = (n) => (n ? ` · ${plural(n, 'cronômetro rodando', 'cronômetros rodando')}, fora do total` : '');

function periodoDaAtividade(a, dia) {
  if (!a.fim) return `${hora(a.inicio)}–rodando`;
  const fim = noFuso(a.fim).dia !== dia ? `${data(noFuso(a.fim).dia)} ${hora(a.fim)}` : hora(a.fim);
  return `${hora(a.inicio)}–${fim}`;
}

function atividade(a, { nomes, casos, mostrarCliente }) {
  const dia = noFuso(a.inicio).dia;
  const edita = pode.administrar() || a.membro_id === estado.membro.id;
  const relato = a.relato ?? 'Sem relato.';
  const ficha = `#/documentos/novo?modelo=ficha_atendimento&cliente=${a.cliente_id}&processo=${a.processo_id ?? ''}&atualizacao=${a.id}`;

  return html`
    <article class="atualizacao${a.cancelado_em ? ' atualizacao--cancelada' : ''}">
      <div class="atualizacao__topo">
        ${mostrarCliente ? html`<strong><a href="#/clientes/${a.cliente_id}">${nomes.get(a.cliente_id) ?? 'Cliente'}</a></strong>` : ''}
        <span class="num">${periodoDaAtividade(a, dia)} · ${a.cancelado_em ? 'cancelada' : duracao(minutosDe(a))}</span>
        <span class="selo${a.cronometrado ? ' selo--ok' : ''}">${a.cronometrado ? 'Cronômetro' : 'Lançada à mão'}</span>
      </div>
      <p class="sub">${TIPOS_ATUALIZACAO[a.tipo]} · ${[a.membro_id, ...(a.participantes ?? [])].map(nomeDe).join(' + ')}${a.processo_id ? ` · ${casos.get(a.processo_id) ?? 'Processo'}` : ''}</p>
      <p class="atualizacao__relato">${relato.slice(0, 200)}${relato.length > 200 ? '…' : ''}</p>
      ${a.proxima_providencia ? html`<p><strong>Próxima providência:</strong> ${a.proxima_providencia}</p>` : ''}
      ${a.cancelado_em ? html`<p class="sub">Motivo do cancelamento: ${a.motivo_cancelamento}</p>` : ''}
      <div class="registro-acoes">
        <button class="botao botao--pequeno" type="button" data-acao="atualizacao-ver" data-id="${a.id}">Abrir relato</button>
        ${edita && !a.cancelado_em ? html`
          ${a.fim
            ? html`<button class="botao botao--pequeno" type="button" data-acao="atualizacao-editar" data-id="${a.id}">Editar</button>`
            : html`<button class="botao botao--pequeno" type="button" data-acao="atualizacao-parar" data-id="${a.id}">Parar cronômetro</button>`}
          <button class="botao botao--pequeno botao--discreto" type="button" data-acao="atualizacao-cancelar" data-id="${a.id}">Cancelar atualização</button>` : ''}
        <a class="botao botao--pequeno" href="${ficha}">Ficha de atendimento</a>
        <button class="botao botao--pequeno botao--discreto" type="button" data-acao="atualizacao-historico" data-id="${a.id}">Histórico</button>
      </div>
    </article>`;
}

/** Atividades agrupadas por dia, a mais recente primeiro. Na ficha de um
 *  cliente, o nome dele não se repete em cada linha (`mostrarCliente`). */
export function linhaDoTempo(lista, clientes = [], processos = [], { mostrarCliente = true } = {}) {
  if (!lista.length) return vazio('Nenhuma atualização neste período.');
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const casos = new Map(processos.map((p) => [p.id, p.titulo]));
  const dias = new Map();
  for (const a of [...lista].sort((x, y) => Date.parse(y.inicio) - Date.parse(x.inicio))) {
    const dia = noFuso(a.inicio).dia;
    if (!dias.has(dia)) dias.set(dia, []);
    dias.get(dia).push(a);
  }
  return html`
    <div class="atualizacoes-linha">
      ${[...dias].map(([dia, atividades]) => html`
        <section class="atualizacoes-dia">
          <h3 class="cliente-subtitulo">${data(dia)}</h3>
          ${atividades.map((a) => atividade(a, { nomes, casos, mostrarCliente }))}
        </section>`)}
    </div>`;
}

/** Botões da linha do tempo. `depois` recarrega a tela quando algo mudou. */
export function ligarAcoesAtualizacoes(raiz, lista, depois) {
  const registro = (el) => lista.find((a) => a.id === el.dataset.id);
  const fazer = async (promessa) => {
    try {
      if (await promessa) await depois();
    } catch (erro) {
      avisarErro(erro);
    }
  };

  const cancelar = async (el) => {
    const motivo = await pedirMotivo({
      titulo: 'Cancelar atualização',
      rotuloOk: 'Cancelar atualização',
      texto: 'O relato, os horários e o histórico serão preservados. O tempo cancelado sai dos totais.',
    });
    if (!motivo) return null;
    await db.alterar('atualizacoes', [['id', 'eq', el.dataset.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
    avisar('Atualização cancelada.');
    notificarAtualizacoes();
    return true;
  };

  return aoClicar(raiz, {
    'atualizacao-ver': (el) => {
      const a = registro(el);
      return abrirDialogo({
        titulo: 'Relato completo',
        somenteLeitura: true,
        largo: true,
        corpo: html`
          <p class="sub">${nomeDe(a.membro_id)} · ${TIPOS_ATUALIZACAO[a.tipo]} · ${data(noFuso(a.inicio).dia)}</p>
          <p class="atualizacao__relato">${a.relato || 'Sem relato.'}</p>
          <p class="atualizacao__relato"><strong>Próxima providência:</strong> ${a.proxima_providencia || '—'}</p>`,
      });
    },
    'atualizacao-editar': (el) => fazer(formularioAtualizacao({ atualizacao: registro(el) })),
    'atualizacao-parar': (el) => fazer(pararCronometro(el.dataset.id)),
    'atualizacao-cancelar': (el) => fazer(cancelar(el)),
    'atualizacao-historico': (el) => abrirHistorico({ titulo: 'Atualização', registros: [el.dataset.id] }),
  });
}

export default async function telaAtualizacoes(ctx) {
  const f = {
    cliente: ctx.consulta.cliente ?? '',
    processo: ctx.consulta.processo ?? '',
    quem: ctx.consulta.quem ?? '',
    tipo: ctx.consulta.tipo ?? '',
    de: diaValido(ctx.consulta.de) ? ctx.consulta.de : somarDias(hoje(), -29),
    ate: diaValido(ctx.consulta.ate) ? ctx.consulta.ate : hoje(),
    situacao: SITUACOES.some(([v]) => v === ctx.consulta.situacao) ? ctx.consulta.situacao : 'ativas',
  };
  if (f.ate < f.de) f.ate = f.de;

  let lista = [];
  let clientes = [];
  let processos = [];
  let limparAcoes = () => {};

  const carregar = async () => {
    [lista, clientes, processos] = await Promise.all([
      db.todos('atualizacoes', {
        select: COLUNAS_ATUALIZACAO,
        filtros: [['inicio', 'gte', instante(f.de)], ['inicio', 'lt', instante(somarDias(f.ate, 1))]],
        ordem: 'inicio.desc,id.desc',
      }),
      db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
      db.todos('processos', { select: COLUNAS_PROCESSO }),
    ]);
    if (!ctx.ativa()) return;

    const relatorio = `#/atualizacoes/relatorio?cliente=${f.cliente}&processo=${f.processo}&de=${f.de}&ate=${f.ate}`;
    desenhar(ctx.raiz, html`
      ${cabecalho('Atualizações', 'Cada atendimento e cada trabalho feito, com quem fez e quanto tempo levou', html`
        <button class="botao botao--primario" type="button" data-acao="iniciar">Iniciar cronômetro</button>
        <button class="botao" type="button" data-acao="lancar">Lançar atualização</button>
        <a class="botao" href="${relatorio}">Relatório de atividades</a>`)}
      <form class="filtros">
        <label class="campo"><span>Cliente</span><select name="cliente">${opcoes(clientes.map((c) => [c.id, c.nome]), f.cliente, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Processo</span><select name="processo">${opcoes(processos.filter((p) => !f.cliente || p.cliente_id === f.cliente).map((p) => [p.id, p.titulo]), f.processo, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Quem / participante</span><select name="quem">${opcoes(estado.membros.map((m) => [m.id, m.nome_curto]), f.quem, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Tipo</span><select name="tipo">${opcoes(Object.entries(TIPOS_ATUALIZACAO), f.tipo, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>De</span><input type="date" name="de" value="${f.de}" required></label>
        <label class="campo"><span>Até</span><input type="date" name="ate" value="${f.ate}" required></label>
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES, f.situacao)}</select></label>
      </form>
      <div data-indicadores></div>
      <section class="painel secao"><div class="painel__corpo" data-linha></div></section>`);

    const mostrar = () => {
      const atividades = filtrarAtualizacoes(lista, f);
      const t = totais(atividades);
      const clientesAtendidos = new Set(atividades.filter((a) => !a.cancelado_em).map((a) => a.cliente_id)).size;
      desenhar($('[data-indicadores]', ctx.raiz), html`
        <div class="indicadores">
          ${indicador('Tempo no período', duracao(t.total), `${duracao(t.cronometrado)} cronometrado · ${duracao(t.manual)} à mão${notaRodando(t.rodando)}`)}
          ${indicador('Atualizações', atividades.length)}
          ${indicador('Clientes atendidos', clientesAtendidos)}
        </div>`);
      desenhar($('[data-linha]', ctx.raiz), linhaDoTempo(atividades, clientes, processos, { mostrarCliente: !f.cliente }));
    };

    const form = $('form', ctx.raiz);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', async (e) => {
      if (!form.checkValidity()) return;
      const antes = { ...f };
      Object.assign(f, Object.fromEntries(new FormData(form)));
      if (e.target.name === 'cliente') f.processo = '';
      if (f.ate < f.de) {
        avisarErro(new Error('O fim do período deve ser igual ou posterior ao início.'));
        Object.assign(f, antes);
        return;
      }
      guardarConsulta(f);
      // Período e cliente mudam o que vem do banco; o resto filtra na tela.
      if (['de', 'ate', 'cliente'].includes(e.target.name)) {
        try {
          await carregar();
        } catch (erro) {
          avisarErro(erro);
        }
      } else {
        mostrar();
      }
    });
    mostrar();

    limparAcoes();
    limparAcoes = ligarAcoesAtualizacoes(ctx.raiz, lista, recarregar);
  };
  // Pedidos seguidos de recarga viram uma leitura só.
  let carregando = null;
  const recarregar = () => (carregando ??= carregar().finally(() => { carregando = null; }));

  await carregar();
  if (!ctx.ativa()) return;

  // Cronômetro iniciado ou parado em outro lugar (lateral, outra aba).
  const sincronizar = () => {
    if (ctx.ativa()) recarregar().catch(avisarErro);
  };
  addEventListener('fhl:atualizacoes', sincronizar);

  const depois = async (promessa) => {
    try {
      if (await promessa && ctx.ativa()) await recarregar();
    } catch (erro) {
      avisarErro(erro);
    }
  };
  const desligar = aoClicar(ctx.raiz, {
    iniciar: () => depois(iniciarCronometro({ cliente_id: f.cliente, processo_id: f.processo })),
    lancar: () => depois(formularioAtualizacao({ cliente_id: f.cliente, processo_id: f.processo })),
  });
  return () => {
    removeEventListener('fhl:atualizacoes', sincronizar);
    desligar();
    limparAcoes();
  };
}
