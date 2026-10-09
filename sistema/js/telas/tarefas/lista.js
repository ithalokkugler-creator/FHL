// Tarefas (F5): delegação entre a equipe, com quem fez e quando. A tabela e
// os botões são os mesmos em Tarefas, Prazos e na ficha do cliente.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { pedirMotivo } from '../../nucleo/dialogo.js';
import { corDe, estado, iniciais, nomeDe, pode } from '../../nucleo/estado.js';
import { data, dataHora, noFuso, numeroCnj } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import {
  COLUNAS_TAREFA, filtrarTarefas, podeAlterarTarefa, prazoRestante, PRIORIDADES, SITUACOES_TAREFA, urgenciaTarefa,
} from '../../dominio/tarefas.js';
import { cabecalho, opcoes, seloTarefa, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { formularioTarefa } from './formulario.js';

const VISOES = [['minhas', 'Minhas'], ['deleguei', 'Que eu deleguei'], ['todas', 'Todas']];
export const SITUACOES_FILTRO = [['abertas', 'Abertas'], ['todos', 'Todas'], ...Object.entries(SITUACOES_TAREFA), ['cancelada', 'Canceladas']];

/** Fatal (se for prazo), entrega e quanto falta, na cor da urgência. */
function celulaDatas(t) {
  const emHoras = t.contagem === 'horas' && t.fatal_em;
  const restante = prazoRestante(t);
  const nivel = urgenciaTarefa(t)?.nivel ?? 'neutro';
  return html`
    <div class="tarefa-datas">
      ${t.fatal_em ? html`
        <span class="tarefa-data"><span class="tarefa-data__rotulo">Fatal</span>
          <strong class="num">${emHoras ? dataHora(t.fatal_em) : data(noFuso(t.fatal_em).dia)}</strong></span>` : ''}
      ${t.entrega ? html`
        <span class="tarefa-data"><span class="tarefa-data__rotulo">Entrega</span><span class="num">${data(t.entrega)}</span></span>` : ''}
      ${!t.fatal_em && !t.entrega ? html`<span class="sub">Sem data</span>` : ''}
      ${restante ? html`<span class="selo tarefa-quando tarefa-quando--${nivel}">${restante}</span>` : ''}
    </div>`;
}

/**
 * Título; abaixo, numa linha só, a situação, a prioridade quando não é a
 * normal, o ato, se veio de intimação e o bloqueio na agenda. Juntar tudo
 * aqui poupa uma coluna — a tabela cabe num notebook sem rolar para o lado.
 */
function celulaTarefa(t) {
  const detalhes = [
    t.ato,
    t.intimacao_id && (pode.prazos() ? html`<a href="#/intimacoes?id=${t.intimacao_id}&situacao=todas">Da intimação</a>` : 'Da intimação'),
    t.compromisso_id && pode.agenda() && html`<a href="#/agenda">Bloqueio na agenda</a>`,
  ].filter(Boolean);
  return html`
    <strong class="tarefa-titulo">${t.titulo}</strong>
    <span class="tarefa-meta">
      ${seloTarefa(t.cancelado_em ? 'cancelada' : t.situacao)}
      ${t.prioridade !== 'normal' ? html`<span class="selo${['urgente', 'alta'].includes(t.prioridade) ? ' selo--perigo' : ''}">Prioridade ${PRIORIDADES[t.prioridade].toLowerCase()}</span>` : ''}
      ${detalhes.length ? html`<span class="tarefa-meta__texto">${detalhes.map((d, i) => html`${i ? ' · ' : ''}${d}`)}</span>` : ''}
    </span>
    ${t.concluida_em ? html`<span class="sub">Concluída por ${nomeDe(t.concluida_por)} · ${dataHora(t.concluida_em)}</span>` : ''}
    ${t.motivo_cancelamento ? html`<span class="sub">Motivo: ${t.motivo_cancelamento}</span>` : ''}
    ${t.descricao ? html`<details class="tarefa-descricao"><summary>Descrição</summary><p class="texto-preservado">${t.descricao}</p></details>` : ''}`;
}

function celulaResponsavel(t) {
  const delegada = t.criado_por && t.criado_por !== t.responsavel_id;
  return html`
    <span class="tarefa-responsavel"><span class="avatar avatar--pequeno" data-vars="--cor:${corDe(t.responsavel_id)}" aria-hidden="true">${iniciais(nomeDe(t.responsavel_id))}</span>${nomeDe(t.responsavel_id)}</span>
    ${delegada ? html`<span class="sub">Delegada por ${nomeDe(t.criado_por)}</span>` : ''}`;
}

/** Duas fileiras: concluir/reabrir e editar; abaixo, as ações de texto. */
function celulaAcoes(t) {
  const historico = html`<button class="acao-texto" type="button" data-acao="tarefa-historico" data-id="${t.id}">Histórico</button>`;
  if (!podeAlterarTarefa(t, estado.membro)) {
    return html`<div class="tarefa-acoes"><div class="tarefa-acoes__textos">${historico}</div></div>`;
  }
  return html`
    <div class="tarefa-acoes">
      <div class="tarefa-acoes__botoes">
        ${t.situacao === 'concluida'
          ? html`<button class="botao botao--pequeno" type="button" data-acao="tarefa-reabrir" data-id="${t.id}">Reabrir</button>`
          : html`<button class="botao botao--pequeno" type="button" data-acao="tarefa-concluir" data-id="${t.id}">Concluir</button>`}
        <button class="botao botao--pequeno" type="button" data-acao="tarefa-editar" data-id="${t.id}">Editar</button>
      </div>
      <div class="tarefa-acoes__textos">
        ${t.situacao === 'pendente' ? html`<button class="acao-texto" type="button" data-acao="tarefa-andamento" data-id="${t.id}" title="Marcar como em andamento (volta a pendente em Editar)">Iniciar</button>` : ''}
        <button class="acao-texto" type="button" data-acao="tarefa-cancelar" data-id="${t.id}">Cancelar</button>
        ${historico}
      </div>
    </div>`;
}

/** `resumo` (tela Prazos): a data vem antes do título. */
export function tabelaTarefas(lista, { resumo = false, vazio: semTarefas = 'Nenhuma tarefa ou prazo neste filtro.' } = {}) {
  if (!lista.length) return vazio(semTarefas);
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--tarefas${resumo ? ' tabela--tarefas-resumo' : ''}">
      <thead><tr>
        <th>${resumo ? 'Fatal / entrega' : 'Tarefa / situação'}</th><th>${resumo ? 'Tarefa / situação' : 'Entrega / fatal'}</th>
        <th>Cliente / processo</th><th>Responsável</th>
        <th class="nao-imprimir"><span class="sr-only">Ações</span></th>
      </tr></thead>
      <tbody>${lista.map((t) => {
        const titulo = celulaTarefa(t);
        const datas = celulaDatas(t);
        const nivel = urgenciaTarefa(t)?.nivel;
        const cliente = t.cliente_id && pode.clientes() ? html`<a href="#/clientes/${t.cliente_id}">${t.cliente_nome}</a>` : t.cliente_nome ?? 'Sem cliente';
        return html`
          <tr class="tarefa-linha${nivel ? ` tarefa-linha--${nivel}` : ''}">
            <td class="${resumo ? 'tarefa-celula-datas' : 'tarefa-celula-titulo'}">${resumo ? datas : titulo}</td>
            <td class="${resumo ? 'tarefa-celula-titulo' : 'tarefa-celula-datas'}">${resumo ? titulo : datas}</td>
            <td class="tarefa-celula-cliente">${cliente}<span class="sub num">${numeroCnj(t.processo_numero) || t.processo_titulo || 'Sem processo'}</span></td>
            <td class="tarefa-celula-responsavel">${celulaResponsavel(t)}</td>
            <td class="tarefa-celula-acoes nao-imprimir">${celulaAcoes(t)}</td>
          </tr>`;
      })}
      </tbody>
    </table></div>`;
}

/** Os botões da tabela. `recarregar` roda depois de cada mudança. */
export function ligarAcoesTarefas(raiz, lista, recarregar) {
  const tarefa = (el) => lista.find((t) => t.id === el.dataset.id);
  const executar = async (el, fn) => {
    if (el.disabled) return;
    el.disabled = true;
    try {
      if (await fn()) await recarregar();
    } catch (erro) {
      avisarErro(erro);
    } finally {
      el.disabled = false;
    }
  };
  const mudarSituacao = (el, situacao, aviso) => executar(el, async () => {
    await db.alterar('tarefas', [['id', 'eq', el.dataset.id]], { situacao }, 'id');
    avisar(aviso);
    return true;
  });

  return aoClicar(raiz, {
    'tarefa-editar': (el) => executar(el, () => formularioTarefa({ tarefa: tarefa(el) })),
    'tarefa-concluir': (el) => mudarSituacao(el, 'concluida', 'Tarefa concluída.'),
    'tarefa-andamento': (el) => mudarSituacao(el, 'em_andamento', 'Tarefa em andamento. Para voltar a pendente, use Editar.'),
    'tarefa-cancelar': (el) => executar(el, async () => {
      const motivo = await pedirMotivo({
        titulo: 'Cancelar tarefa / prazo',
        texto: 'O registro continuará no histórico. O bloqueio na agenda deve ser ajustado por lá.',
        rotuloOk: 'Cancelar tarefa',
      });
      if (!motivo) return false;
      await db.alterar('tarefas', [['id', 'eq', el.dataset.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
      avisar('Tarefa cancelada.');
      return true;
    }),
    'tarefa-reabrir': (el) => executar(el, async () => {
      const motivo = await pedirMotivo({ titulo: 'Reabrir tarefa', rotuloOk: 'Reabrir' });
      if (!motivo) return false;
      await db.rpc('reabrir_tarefa', { p_id: el.dataset.id, p_motivo: motivo });
      avisar('Tarefa reaberta.');
      return true;
    }),
    'tarefa-historico': (el) => abrirHistorico({ titulo: tarefa(el).titulo, registros: [el.dataset.id] }),
  });
}

export default async function telaTarefas(ctx) {
  const c = ctx.consulta;
  const f = {
    visao: VISOES.some(([v]) => v === c.visao) ? c.visao : 'minhas',
    situacao: SITUACOES_FILTRO.some(([v]) => v === c.situacao) ? c.situacao : 'abertas',
    prioridade: PRIORIDADES[c.prioridade] ? c.prioridade : '',
    busca: c.busca ?? '',
    cliente: c.cliente ?? '',
  };
  let lista = [];
  let limparAcoes = () => {};

  const carregar = async () => {
    lista = await db.todos('v_tarefas', { select: COLUNAS_TAREFA, ordem: 'criado_em.desc,id.desc' });
    if (!ctx.ativa()) return;

    desenhar(ctx.raiz, html`
      ${cabecalho('Tarefas', 'Delegação e trabalho do escritório, com conclusão registrada', html`
        <button class="botao botao--primario" type="button" data-acao="nova-tarefa">Nova tarefa / prazo</button>`)}
      <form class="filtros">
        <label class="campo"><span>Mostrar</span><select name="visao">${opcoes(VISOES, f.visao)}</select></label>
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES_FILTRO, f.situacao)}</select></label>
        <label class="campo"><span>Prioridade</span><select name="prioridade">${opcoes(Object.entries(PRIORIDADES), f.prioridade, { vazio: 'Todas' })}</select></label>
        <label class="campo campo--busca"><span>Buscar</span><input name="busca" type="search" value="${f.busca}" placeholder="Título, ato, cliente ou processo"></label>
      </form>
      <section class="painel" data-lista></section>`);

    const mostrar = () => desenhar($('[data-lista]', ctx.raiz), tabelaTarefas(filtrarTarefas(lista, f, estado.membro.id)));
    const form = $('form.filtros', ctx.raiz);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', () => {
      Object.assign(f, Object.fromEntries(new FormData(form)));
      guardarConsulta(f);
      mostrar();
    });
    mostrar();

    limparAcoes();
    limparAcoes = ligarAcoesTarefas(ctx.raiz, lista, carregar);
  };

  await carregar();
  if (!ctx.ativa()) return;

  const limpar = aoClicar(ctx.raiz, {
    'nova-tarefa': async () => {
      try {
        if (await formularioTarefa({ cliente_id: f.cliente }) && ctx.ativa()) await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
  return () => {
    limpar();
    limparAcoes();
  };
}
