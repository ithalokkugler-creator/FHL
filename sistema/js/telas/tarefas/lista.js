// Tarefas (F5): delegação entre a equipe, com quem fez e quando. A tabela e
// os botões são os mesmos em Tarefas, Prazos e na ficha do cliente.
//
// 12/11/2026 (pedido dos advogados, com a tela de prazos do Projudi como
// referência): colunas Cliente / processo (número, cliente e vara), Tarefa,
// Responsável, Datas (criação, entrega, fatal), Situação (pendente, em
// andamento, pausada, concluída) e o cronômetro — Iniciar, Pausar, Retomar,
// Finalizar. Ordena por prazo, responsável ou situação.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { pedirMotivo } from '../../nucleo/dialogo.js';
import { corDe, estado, iniciais, membrosAtivos, nomeDe, pode } from '../../nucleo/estado.js';
import { data, dataCurta, dataHora, duracao, hora, noFuso, numeroCnj } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import {
  COLUNAS_TAREFA, cronometrosDaTarefa, filtrarTarefas, lerOrdem, meuCronometro, ORDENS_TAREFA, ordenarTarefas,
  podeAlterarTarefa, prazoRestante, PRIORIDADES, segundosDaTarefa, situacaoDaTarefa, SITUACOES_VISTAS, urgenciaTarefa,
} from '../../dominio/tarefas.js';
import { cabecalho, opcoes, seloTarefa, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { formularioTarefa } from './formulario.js';
import { avisarTarefas, finalizarTarefa, iniciarTarefa, pausarTarefa } from './cronometro.js';

const VISOES = [['minhas', 'Minhas'], ['deleguei', 'Que eu deleguei'], ['todas', 'Todas']];
export const SITUACOES_FILTRO = [
  ['abertas', 'Abertas'], ['todos', 'Todas'],
  ...['pendente', 'em_andamento', 'pausada', 'concluida'].map((s) => [s, SITUACOES_VISTAS[s]]),
  ['cancelada', 'Canceladas'],
];

const tempoTexto = (segundos) => (segundos >= 60 ? duracao(segundos / 60) : segundos > 0 ? 'menos de 1 min' : '');

/** Número do processo, cliente e vara, como na tela de prazos do Projudi. */
function celulaCliente(t) {
  const numero = numeroCnj(t.processo_numero) || t.processo_titulo;
  const cliente = t.cliente_id && pode.clientes()
    ? html`<a href="#/clientes/${t.cliente_id}">${t.cliente_nome}</a>` : t.cliente_nome;
  return html`
    ${numero ? html`<span class="tarefa-processo ${t.processo_numero ? 'num' : ''}">${numero}</span>` : ''}
    ${cliente ? html`<strong class="tarefa-cliente">${cliente}</strong>` : html`<span class="sub">Sem cliente</span>`}
    ${t.processo_orgao || t.tribunal ? html`<span class="sub">${t.processo_orgao || t.tribunal}</span>` : ''}
    ${!numero && cliente ? html`<span class="sub">Sem processo</span>` : ''}`;
}

/**
 * Título; abaixo, numa linha só, a prioridade quando não é a normal, o ato,
 * se veio de intimação e o bloqueio na agenda; e o começo da descrição.
 */
function celulaTarefa(t) {
  const detalhes = [
    t.tipo === 'prazo' ? 'Prazo processual' : '',
    t.ato,
    t.intimacao_id && (pode.prazos() ? html`<a href="#/intimacoes?id=${t.intimacao_id}&situacao=todas">Da intimação</a>` : 'Da intimação'),
    t.compromisso_id && pode.agenda() && html`<a href="#/agenda">Bloqueio na agenda</a>`,
  ].filter(Boolean);
  return html`
    <strong class="tarefa-titulo">${t.titulo}</strong>
    ${t.prioridade !== 'normal' || detalhes.length ? html`<span class="tarefa-meta">
      ${t.prioridade !== 'normal' ? html`<span class="selo${['urgente', 'alta'].includes(t.prioridade) ? ' selo--perigo' : ''}">Prioridade ${PRIORIDADES[t.prioridade].toLowerCase()}</span>` : ''}
      ${detalhes.length ? html`<span class="tarefa-meta__texto">${detalhes.map((d, i) => html`${i ? ' · ' : ''}${d}`)}</span>` : ''}
    </span>` : ''}
    ${t.motivo_cancelamento ? html`<span class="sub">Motivo: ${t.motivo_cancelamento}</span>` : ''}
    ${t.descricao ? html`<p class="tarefa-resumo">${t.descricao}</p>` : ''}
    <button type="button" class="botao botao--pequeno botao--discreto tarefa-abrir" data-acao="tarefa-alternar" data-id="${t.id}"
      aria-controls="tarefa-detalhe-${t.id}" aria-expanded="${abertas.has(t.id)}">${t.descricao ? 'Ver descrição completa' : 'Ver detalhes'}</button>`;
}

/** Criada em, entrega, fatal e quanto falta, na cor da urgência. */
function celulaDatas(t) {
  const emHoras = t.contagem === 'horas' && t.fatal_em;
  const restante = prazoRestante(t);
  const nivel = urgenciaTarefa(t)?.nivel ?? 'neutro';
  return html`
    <div class="tarefa-datas">
      ${t.criado_em ? html`<span class="tarefa-data"><span class="tarefa-data__rotulo">Criada</span><span class="num">${data(noFuso(t.criado_em).dia)}</span></span>` : ''}
      ${t.entrega ? html`
        <span class="tarefa-data"><span class="tarefa-data__rotulo">Entrega</span><span class="num">${data(t.entrega)}</span></span>` : ''}
      ${t.fatal_em ? html`
        <span class="tarefa-data"><span class="tarefa-data__rotulo">Fatal</span>
          <strong class="num">${emHoras ? dataHora(t.fatal_em) : data(noFuso(t.fatal_em).dia)}</strong></span>` : ''}
      ${!t.fatal_em && !t.entrega ? html`<span class="tarefa-data"><span class="tarefa-data__rotulo">Prazo</span><span class="sub">Sem data</span></span>` : ''}
      ${restante ? html`<span class="selo tarefa-quando tarefa-quando--${nivel}">${restante}</span>` : ''}
    </div>`;
}

/** Situação vista (com "pausada") e o tempo dedicado, que corre ao vivo. */
function celulaSituacao(t) {
  const situacao = situacaoDaTarefa(t);
  const abertos = cronometrosDaTarefa(t);
  const segundos = segundosDaTarefa(t);
  const quem = abertos.map((c) => (c.membro_id === estado.membro.id ? 'você' : nomeDe(c.membro_id)));
  return html`
    <span class="tarefa-situacao">
      ${abertos.length
        ? html`<span class="selo selo--ok tarefa-rodando"><span class="tarefa-rodando__ponto" aria-hidden="true"></span>Contando</span>`
        : seloTarefa(situacao)}
      ${segundos || abertos.length ? html`<span class="sub tarefa-tempo" data-tempo-tarefa="${t.id}">Tempo: ${tempoTexto(segundos) || '0 min'}</span>` : ''}
      ${abertos.length ? html`<span class="sub">com ${quem.join(' e ')}</span>` : ''}
      ${t.concluida_em ? html`<span class="sub">Por ${nomeDe(t.concluida_por)} · ${dataCurta(noFuso(t.concluida_em).dia)}</span>` : ''}
    </span>`;
}

const CONTAGENS = { uteis: 'dias úteis', corridos: 'dias corridos', horas: 'horas' };

/** Os períodos do cronômetro: quem, de quando a quando, quanto. */
function periodosTexto(t) {
  const periodos = Array.isArray(t.periodos) ? t.periodos : [];
  if (!periodos.length) return '';
  return html`<ol class="tarefa-periodos">${periodos.map((p) => {
    const ini = noFuso(p.inicio);
    const fim = p.fim ? noFuso(p.fim) : null;
    const minutos = ((p.fim ? Date.parse(p.fim) : Date.now()) - Date.parse(p.inicio)) / 60000;
    return html`<li><span class="num">${dataCurta(ini.dia)} ${hora(p.inicio)}–${fim ? `${fim.dia === ini.dia ? '' : `${dataCurta(fim.dia)} `}${hora(p.fim)}` : 'agora'}</span>
      · ${duracao(minutos)} · ${nomeDe(p.membro_id)}${p.informado ? ' (fim informado à mão)' : ''}</li>`;
  })}</ol>`;
}

/**
 * O que abre ao clicar na linha: a descrição inteira, em letra de leitura, e
 * os dados que não cabem na tabela (pedido do escritório, 12/10/2026 — a
 * setinha "Descrição" era pequena demais para quem precisa ler).
 */
function detalheTarefa(t) {
  const prazo = t.quantidade && t.contagem
    ? `${t.quantidade} ${CONTAGENS[t.contagem] ?? t.contagem}${t.base_em ? ` a partir de ${t.contagem === 'horas' ? dataHora(t.base_em) : data(noFuso(t.base_em).dia)}` : ''}`
    : '';
  const segundos = segundosDaTarefa(t);
  const dados = [
    ['Ato', t.ato],
    ['Processo', [numeroCnj(t.processo_numero), t.processo_titulo].filter(Boolean).join(' · ')],
    ['Vara / órgão', t.processo_orgao],
    ['Tribunal', t.tribunal],
    ['Contagem', prazo],
    ['Criada', t.criado_em && `${dataHora(t.criado_em)}${t.criado_por ? ` por ${nomeDe(t.criado_por)}` : ''}`],
    ['Última alteração', t.alterado_em && t.alterado_em !== t.criado_em && `${dataHora(t.alterado_em)}${t.alterado_por ? ` por ${nomeDe(t.alterado_por)}` : ''}`],
    ['Concluída', t.concluida_em && `${dataHora(t.concluida_em)} por ${nomeDe(t.concluida_por)}`],
    ['Motivo da reabertura', t.motivo_reabertura],
    ['Tempo dedicado', segundos ? html`${tempoTexto(segundos)}${periodosTexto(t)}` : ''],
  ].filter(([, valor]) => valor);
  return html`
    <div class="tarefa-detalhe__conteudo">
      <div class="tarefa-detalhe__descricao">
        <h3 class="rotulo">Descrição</h3>
        ${t.descricao
          ? html`<p class="texto-preservado">${t.descricao}</p>`
          : html`<p class="tarefa-detalhe__vazio">Sem descrição. ${podeAlterarTarefa(t, estado.membro) ? 'Use Editar para acrescentar.' : ''}</p>`}
      </div>
      ${dados.length ? html`<dl class="tarefa-detalhe__dados">${dados.map(([rotulo, valor]) => html`<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`)}</dl>` : ''}
    </div>`;
}

// Linhas abertas continuam abertas quando o filtro redesenha a tabela.
const abertas = new Set();

function celulaResponsavel(t) {
  const delegada = t.criado_por && t.criado_por !== t.responsavel_id;
  return html`
    <span class="tarefa-responsavel"><span class="avatar avatar--pequeno" data-vars="--cor:${corDe(t.responsavel_id)}" aria-hidden="true">${iniciais(nomeDe(t.responsavel_id))}</span>${nomeDe(t.responsavel_id)}</span>
    ${delegada ? html`<span class="sub">Delegada por ${nomeDe(t.criado_por)}</span>` : ''}`;
}

/** Duas fileiras: o cronômetro e concluir em cima; editar, cancelar e histórico embaixo. */
function celulaAcoes(t) {
  const historico = html`<button class="botao botao--pequeno botao--discreto" type="button" data-acao="tarefa-historico" data-id="${t.id}">Histórico</button>`;
  if (!podeAlterarTarefa(t, estado.membro)) {
    return html`<div class="tarefa-acoes"><div class="tarefa-acoes__textos">${historico}</div></div>`;
  }
  const meu = meuCronometro(t, estado.membro.id);
  const situacao = situacaoDaTarefa(t);
  let principais;
  if (t.situacao === 'concluida') {
    principais = html`<button class="botao botao--pequeno" type="button" data-acao="tarefa-reabrir" data-id="${t.id}">Reabrir</button>`;
  } else if (meu) {
    principais = html`
      <button class="botao botao--pequeno botao--primario" type="button" data-acao="tarefa-pausar" data-id="${t.id}" title="Pausar o cronômetro (o tempo fica guardado)">Pausar</button>
      <button class="botao botao--pequeno" type="button" data-acao="tarefa-finalizar" data-id="${t.id}" title="Parar o cronômetro e concluir a tarefa">Finalizar</button>`;
  } else {
    principais = html`
      <button class="botao botao--pequeno" type="button" data-acao="tarefa-iniciar" data-id="${t.id}"
        title="${situacao === 'pausada' ? 'Voltar a contar o tempo desta tarefa' : 'Começar a contar o tempo desta tarefa'}">${situacao === 'pausada' ? 'Retomar' : 'Iniciar'}</button>
      <button class="botao botao--pequeno" type="button" data-acao="tarefa-concluir" data-id="${t.id}">Concluir</button>`;
  }
  return html`
    <div class="tarefa-acoes">
      <div class="tarefa-acoes__botoes">${principais}</div>
      <div class="tarefa-acoes__textos">
        <button class="botao botao--pequeno botao--discreto" type="button" data-acao="tarefa-editar" data-id="${t.id}">Editar</button>
        <button class="botao botao--pequeno botao--discreto" type="button" data-acao="tarefa-cancelar" data-id="${t.id}">Cancelar</button>
        ${historico}
      </div>
    </div>`;
}

/** Cabeçalho que ordena: botão com caixa, seta e aria-sort. */
function colunaOrdenavel(rotulo, campo, ordem) {
  if (!ordem) return html`<th>${rotulo}</th>`;
  const atual = ordem.replace(/^-/, '') === campo;
  const inverso = ordem.startsWith('-');
  // Só o prazo inverte (o mais distante primeiro); responsável e situação têm uma ordem só.
  const proxima = campo === 'prazo' && atual && !inverso ? '-prazo' : campo;
  return html`<th aria-sort="${atual ? (inverso ? 'descending' : 'ascending') : 'none'}">
    <button type="button" class="ordenar${atual ? ' ordenar--atual' : ''}" data-acao="tarefas-ordenar" data-ordem="${proxima}"
      title="Ordenar por ${rotulo.toLowerCase()}">${rotulo}<span class="ordenar__seta" aria-hidden="true">${atual ? (inverso ? '▼' : '▲') : '↕'}</span></button></th>`;
}

/**
 * `resumo` (tela Prazos): as datas vêm primeiro. `ordem` ('prazo', '-prazo',
 * 'responsavel', 'situacao'…): com ela, os cabeçalhos ordenam a lista.
 */
export function tabelaTarefas(lista, { resumo = false, ordem = null, vazio: semTarefas = 'Nenhuma tarefa ou prazo neste filtro.' } = {}) {
  if (!lista.length) return vazio(semTarefas);
  const colunas = resumo
    ? [['datas', 'Datas', 'prazo'], ['cliente', 'Cliente / processo'], ['tarefa', 'Tarefa'], ['responsavel', 'Responsável', 'responsavel'], ['situacao', 'Situação', 'situacao']]
    : [['cliente', 'Cliente / processo'], ['tarefa', 'Tarefa'], ['responsavel', 'Responsável', 'responsavel'], ['datas', 'Datas', 'prazo'], ['situacao', 'Situação', 'situacao']];
  const celulas = {
    cliente: (t) => html`<td class="tarefa-celula-cliente">${celulaCliente(t)}</td>`,
    tarefa: (t) => html`<td class="tarefa-celula-titulo">${celulaTarefa(t)}</td>`,
    responsavel: (t) => html`<td class="tarefa-celula-responsavel">${celulaResponsavel(t)}</td>`,
    datas: (t) => html`<td class="tarefa-celula-datas">${celulaDatas(t)}</td>`,
    situacao: (t) => html`<td class="tarefa-celula-situacao">${celulaSituacao(t)}</td>`,
  };
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--tarefas${resumo ? ' tabela--tarefas-resumo' : ''}">
      <thead><tr>
        ${colunas.map(([, rotulo, campo]) => (campo ? colunaOrdenavel(rotulo, campo, ordem) : html`<th>${rotulo}</th>`))}
        <th class="nao-imprimir"><span class="sr-only">Ações</span></th>
      </tr></thead>
      <tbody>${lista.map((t) => {
        const nivel = urgenciaTarefa(t)?.nivel;
        const aberta = abertas.has(t.id);
        return html`
          <tr class="tarefa-linha tarefa-linha--clicavel${nivel ? ` tarefa-linha--${nivel}` : ''}${aberta ? ' tarefa-linha--aberta' : ''}${cronometrosDaTarefa(t).length ? ' tarefa-linha--rodando' : ''}"
            data-tarefa="${t.id}" tabindex="0" aria-expanded="${aberta}" aria-controls="tarefa-detalhe-${t.id}"
            title="${aberta ? 'Clique para fechar a descrição' : 'Clique para ver a descrição completa'}">
            ${colunas.map(([chave]) => celulas[chave](t))}
            <td class="tarefa-celula-acoes nao-imprimir">${celulaAcoes(t)}</td>
          </tr>
          <tr class="tarefa-detalhe${nivel ? ` tarefa-detalhe--${nivel}` : ''}" id="tarefa-detalhe-${t.id}" ${aberta ? '' : 'hidden'}>
            <td colspan="${colunas.length + 1}">${detalheTarefa(t)}</td>
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
    // Concluir com o cronômetro rodando fecha o relógio (no banco): o indicador acompanha.
    avisarTarefas();
    avisar(aviso);
    return true;
  });

  // A linha inteira abre e fecha a descrição. Botões e links de dentro dela
  // continuam fazendo só o que fazem; quem está selecionando texto não abre nada.
  const alternar = (linha) => {
    const id = linha.dataset.tarefa;
    const detalhe = raiz.querySelector(`#tarefa-detalhe-${CSS.escape(id)}`);
    if (!detalhe) return;
    const abrir = detalhe.hidden;
    detalhe.hidden = !abrir;
    linha.setAttribute('aria-expanded', String(abrir));
    linha.classList.toggle('tarefa-linha--aberta', abrir);
    linha.title = abrir ? 'Clique para fechar a descrição' : 'Clique para ver a descrição completa';
    linha.querySelector('.tarefa-abrir')?.setAttribute('aria-expanded', String(abrir));
    if (abrir) abertas.add(id);
    else abertas.delete(id);
  };
  const aoClicarLinha = (e) => {
    const linha = e.target.closest('tr[data-tarefa]');
    if (!linha || !raiz.contains(linha)) return;
    const interativo = e.target.closest('a, button, input, select, textarea, label, [data-acao]');
    if (interativo && linha.contains(interativo)) return;
    if (String(getSelection?.() ?? '').trim()) return;
    alternar(linha);
  };
  const aoTeclar = (e) => {
    if (!['Enter', ' '].includes(e.key) || !e.target.matches?.('tr[data-tarefa]')) return;
    e.preventDefault();
    alternar(e.target);
  };
  raiz.addEventListener('click', aoClicarLinha);
  raiz.addEventListener('keydown', aoTeclar);

  // O tempo das tarefas que estão contando anda sozinho (de minuto em minuto).
  const relogio = setInterval(() => {
    for (const el of raiz.querySelectorAll('[data-tempo-tarefa]')) {
      const t = lista.find((x) => x.id === el.dataset.tempoTarefa);
      if (t && cronometrosDaTarefa(t).length) el.textContent = `Tempo: ${tempoTexto(segundosDaTarefa(t)) || '0 min'}`;
    }
  }, 30_000);

  const desligarAcoes = aoClicar(raiz, {
    'tarefa-alternar': (el) => {
      const linha = el.closest('tr[data-tarefa]');
      if (linha) alternar(linha);
    },
    'tarefa-editar': (el) => executar(el, () => formularioTarefa({ tarefa: tarefa(el) })),
    'tarefa-concluir': (el) => mudarSituacao(el, 'concluida', 'Tarefa concluída.'),
    'tarefa-iniciar': (el) => executar(el, () => iniciarTarefa(el.dataset.id)),
    'tarefa-pausar': (el) => executar(el, () => pausarTarefa(el.dataset.id, meuCronometro(tarefa(el), estado.membro.id)?.desde)),
    'tarefa-finalizar': (el) => executar(el, () => finalizarTarefa(el.dataset.id, meuCronometro(tarefa(el), estado.membro.id)?.desde)),
    'tarefa-cancelar': (el) => executar(el, async () => {
      const motivo = await pedirMotivo({
        titulo: 'Cancelar tarefa / prazo',
        texto: 'O registro continuará no histórico. O bloqueio na agenda deve ser ajustado por lá.',
        rotuloOk: 'Cancelar tarefa',
      });
      if (!motivo) return false;
      await db.alterar('tarefas', [['id', 'eq', el.dataset.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
      avisarTarefas();
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
  return () => {
    clearInterval(relogio);
    desligarAcoes();
    raiz.removeEventListener('click', aoClicarLinha);
    raiz.removeEventListener('keydown', aoTeclar);
  };
}

export default async function telaTarefas(ctx) {
  const c = ctx.consulta;
  const f = {
    visao: VISOES.some(([v]) => v === c.visao) ? c.visao : 'minhas',
    situacao: SITUACOES_FILTRO.some(([v]) => v === c.situacao) ? c.situacao : 'abertas',
    prioridade: PRIORIDADES[c.prioridade] ? c.prioridade : '',
    responsavel: c.responsavel ?? '',
    ordem: lerOrdem(c.ordem),
    busca: c.busca ?? '',
    cliente: c.cliente ?? '',
  };
  let lista = [];
  let limparAcoes = () => {};
  let mostrar = () => {};

  const carregar = async () => {
    lista = await db.todos('v_tarefas', { select: COLUNAS_TAREFA, ordem: 'criado_em.desc,id.desc' });
    if (!ctx.ativa()) return;

    desenhar(ctx.raiz, html`
      ${cabecalho('Tarefas', 'Delegação e trabalho do escritório, com o tempo dedicado e a conclusão registrada', html`
        <button class="botao botao--primario" type="button" data-acao="nova-tarefa">Nova tarefa / prazo</button>`)}
      <form class="filtros">
        <label class="campo"><span>Mostrar</span><select name="visao">${opcoes(VISOES, f.visao)}</select></label>
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES_FILTRO, f.situacao)}</select></label>
        <label class="campo"><span>Responsável</span><select name="responsavel">${opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), f.responsavel, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Prioridade</span><select name="prioridade">${opcoes(Object.entries(PRIORIDADES), f.prioridade, { vazio: 'Todas' })}</select></label>
        <label class="campo"><span>Ordenar por</span><select name="ordem">${opcoes(ORDENS_TAREFA, ORDENS_TAREFA.some(([o]) => o === f.ordem) ? f.ordem : 'prazo')}</select></label>
        <label class="campo campo--busca"><span>Buscar</span><input name="busca" type="search" value="${f.busca}" placeholder="Título, ato, cliente, processo ou vara"></label>
      </form>
      <section class="painel" data-lista></section>`);

    const form = $('form.filtros', ctx.raiz);
    mostrar = () => desenhar($('[data-lista]', ctx.raiz), tabelaTarefas(
      ordenarTarefas(filtrarTarefas(lista, f, estado.membro.id), f.ordem, { nomeDe }), { ordem: f.ordem }));
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

  // O cronômetro mudou (no indicador da lateral ou em outra aba): recarrega.
  const aoMudarTempo = () => {
    if (ctx.ativa() && !document.querySelector('dialog[open]')) carregar().catch(avisarErro);
  };
  addEventListener('fhl:tarefas', aoMudarTempo);

  const limpar = aoClicar(ctx.raiz, {
    'nova-tarefa': async () => {
      try {
        if (await formularioTarefa({ cliente_id: f.cliente }) && ctx.ativa()) await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
    'tarefas-ordenar': (el) => {
      f.ordem = lerOrdem(el.dataset.ordem);
      const select = $('form.filtros [name="ordem"]', ctx.raiz);
      if (select) select.value = ORDENS_TAREFA.some(([o]) => o === f.ordem) ? f.ordem : 'prazo';
      guardarConsulta(f);
      mostrar();
    },
  });
  return () => {
    removeEventListener('fhl:tarefas', aoMudarTempo);
    limpar();
    limparAcoes();
  };
}
