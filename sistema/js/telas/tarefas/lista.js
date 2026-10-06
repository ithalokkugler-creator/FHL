// Tarefas (F5): delegação entre a equipe, com quem fez e quando. A tabela e
// os botões são os mesmos em Tarefas, Prazos e na ficha do cliente.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { pedirMotivo } from '../../nucleo/dialogo.js';
import { corDe, estado, iniciais, nomeDe, pode } from '../../nucleo/estado.js';
import { data, dataHora, diasEntre, hoje, numeroCnj } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { alertaTarefa, COLUNAS_TAREFA, filtrarTarefas, podeAlterarTarefa, PRIORIDADES, SITUACOES_TAREFA } from '../../dominio/tarefas.js';
import { cabecalho, opcoes, plural, seloAlertaTarefa, seloTarefa, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { formularioTarefa } from './formulario.js';

const VISOES = [['minhas', 'Minhas'], ['deleguei', 'Que eu deleguei'], ['todas', 'Todas']];
export const SITUACOES_FILTRO = [['abertas', 'Abertas'], ['todos', 'Todas'], ...Object.entries(SITUACOES_TAREFA), ['cancelada', 'Canceladas']];

/**
 * Quanto falta, quando não há selo de alerta dizendo o mesmo: "Entrega em
 * 3 dias", "Vence em 5 h". Prazo em horas conta até a hora fatal.
 */
export function prazoRestante(t) {
  if (t.cancelado_em || t.situacao === 'concluida') return '';
  if (t.contagem === 'horas' && t.fatal_em) {
    const horas = (Date.parse(t.fatal_em) - Date.now()) / 3600000;
    return horas < 0 ? 'Prazo vencido' : `Vence em ${Math.ceil(horas)} h`;
  }
  if (!t.entrega) return '';
  const dias = diasEntre(hoje(), t.entrega);
  if (dias < 0) return `Entrega atrasada há ${plural(-dias, 'dia', 'dias')}`;
  return dias === 0 ? 'Entrega hoje' : `Entrega em ${plural(dias, 'dia', 'dias')}`;
}

/** Fatal (se for prazo), entrega e o alerta. Quando há selo — "Entrega
 *  hoje", "Fatal vencido" —, o texto de quanto falta seria repetição. */
function celulaDatas(t) {
  const selo = seloAlertaTarefa(alertaTarefa(t));
  const restante = prazoRestante(t);
  const emHoras = t.contagem === 'horas' && t.fatal_em;
  return html`
    <div class="tarefa-datas">
      ${t.fatal_em ? html`
        <strong class="num">${dataHora(t.fatal_em)}</strong>
        <span class="sub">${emHoras ? `Fatal · prazo em horas${restante ? ` · ${restante.toLowerCase()}` : ''}` : 'Data fatal'}</span>` : ''}
      <span class="num">${t.entrega ? `Entrega ${data(t.entrega)}` : 'Sem entrega'}</span>
      ${!emHoras && !selo && restante ? html`<span class="sub">${restante}</span>` : ''}
      ${selo}
    </div>`;
}

function celulaResponsavel(t) {
  const delegada = t.criado_por && t.criado_por !== t.responsavel_id;
  return html`
    <span class="tarefa-responsavel"><span class="avatar avatar--pequeno" data-vars="--cor:${corDe(t.responsavel_id)}" aria-hidden="true">${iniciais(nomeDe(t.responsavel_id))}</span>${nomeDe(t.responsavel_id)}</span>
    ${delegada ? html`<span class="sub">Delegada por ${nomeDe(t.criado_por)}</span>` : ''}`;
}

function celulaOrigem(t) {
  const intimacao = t.intimacao_id
    ? (pode.prazos() ? html`<a href="#/intimacoes?id=${t.intimacao_id}&situacao=todas">Intimação</a>` : 'Intimação')
    : 'Manual';
  const bloqueio = t.compromisso_id && pode.agenda() ? html`<span class="sub"><a href="#/agenda">Bloqueio na Agenda</a></span>` : '';
  return html`${intimacao}${bloqueio}`;
}

function celulaAcoes(t) {
  const historico = html`<button class="botao botao--pequeno botao--discreto" type="button" data-acao="tarefa-historico" data-id="${t.id}">Histórico</button>`;
  if (!podeAlterarTarefa(t, estado.membro)) return html`<div class="registro-acoes">${historico}</div>`;
  const andamento = t.situacao === 'concluida'
    ? html`<button class="botao botao--pequeno" type="button" data-acao="tarefa-reabrir" data-id="${t.id}">Reabrir</button>`
    : html`
      <button class="botao botao--pequeno" type="button" data-acao="tarefa-concluir" data-id="${t.id}">Concluir</button>
      ${t.situacao === 'pendente' ? html`<button class="botao botao--pequeno" type="button" data-acao="tarefa-andamento" data-id="${t.id}">Em andamento</button>` : ''}`;
  return html`
    <div class="registro-acoes">
      ${andamento}
      <button class="botao botao--pequeno" type="button" data-acao="tarefa-editar" data-id="${t.id}">Editar</button>
      <button class="botao botao--pequeno botao--discreto" type="button" data-acao="tarefa-cancelar" data-id="${t.id}">Cancelar</button>
      ${historico}
    </div>`;
}

/** `resumo` (tela Prazos): a data vem antes do título. */
export function tabelaTarefas(lista, { resumo = false, vazio: semTarefas = 'Nenhuma tarefa ou prazo neste filtro.' } = {}) {
  if (!lista.length) return vazio(semTarefas);
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--tarefas">
      <thead><tr>
        <th>${resumo ? 'Fatal / entrega' : 'Tarefa / ato'}</th><th>${resumo ? 'Ato / tarefa' : 'Entrega / fatal'}</th>
        <th>Cliente / processo</th><th>Responsável / delegação</th><th>Prioridade / situação</th><th>Origem</th>
        <th class="nao-imprimir">Ações</th>
      </tr></thead>
      <tbody>${lista.map((t) => {
        const titulo = html`
          <strong>${t.titulo}</strong><span class="sub">${t.ato ?? ''}</span>
          ${t.descricao ? html`<details><summary>Descrição</summary><p class="texto-preservado">${t.descricao}</p></details>` : ''}`;
        const datas = celulaDatas(t);
        const cliente = t.cliente_id && pode.clientes() ? html`<a href="#/clientes/${t.cliente_id}">${t.cliente_nome}</a>` : t.cliente_nome ?? 'Sem cliente';
        return html`
          <tr>
            <td>${resumo ? datas : titulo}</td>
            <td>${resumo ? titulo : datas}</td>
            <td>${cliente}<span class="sub num">${numeroCnj(t.processo_numero) || t.processo_titulo || 'Sem processo'}</span></td>
            <td>${celulaResponsavel(t)}</td>
            <td>
              <span class="selo${['urgente', 'alta'].includes(t.prioridade) ? ' selo--perigo' : ''}">${PRIORIDADES[t.prioridade]}</span>
              ${seloTarefa(t.cancelado_em ? 'cancelada' : t.situacao)}
              ${t.concluida_em ? html`<span class="sub">${nomeDe(t.concluida_por)} · ${dataHora(t.concluida_em)}</span>` : ''}
              ${t.motivo_cancelamento ? html`<span class="sub">${t.motivo_cancelamento}</span>` : ''}
            </td>
            <td>${celulaOrigem(t)}</td>
            <td class="nao-imprimir">${celulaAcoes(t)}</td>
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
    'tarefa-andamento': (el) => mudarSituacao(el, 'em_andamento', 'Tarefa em andamento.'),
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
