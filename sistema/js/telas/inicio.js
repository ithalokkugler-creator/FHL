// Hoje — a tela de abertura (preparação 7.5.2).
// =============================================
//
// O "Escritório Virtual" do protótipo: quem atende quem e a que horas, se há
// cliente esperando, e o que pede atenção no Financeiro. Avisa, não envia (5.4).

import { avisarErro } from '../nucleo/avisos.js';
import { corDe, estado, nomeDe, pode } from '../nucleo/estado.js';
import {
  centavos, dataCurta, dataExtensa, dataHora, diasEntre, fimDoMes, hoje, hora, inicioDoMes, instante, moeda, noFuso, nomeDoMes,
  numeroCnj, somarDias, somarMeses,
} from '../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';
import {
  cabecalho, capitalizar, indicador, notaGoogle, plural, rotuloTipo, seloCompromisso, seloConta, vazio,
} from './comum.js';
import { garantirContasDoMes, rotuloParcela } from './financeiro/base.js';
import { iniciarCronometro } from './atualizacoes/cronometro.js';
import { aniversariantes } from '../dominio/aniversarios.js';
import { tarefasParaHoje } from '../dominio/avisos-do-dia.js';
import { diaDaTarefa, prazoRestante, PRIORIDADES, urgenciaTarefa } from '../dominio/tarefas.js';
import { mensagemAniversario, mensagemLembrete } from '../dominio/mensagens.js';
import { prepararMensagem } from './preparar-mensagem.js';

export default async function telaInicio(ctx) {
  const dia = hoje();
  let dados;
  // Filtro do quadro do dia (Tudo / Compromissos / Tarefas): sobrevive ao
  // redesenho do relógio e ao recarregar depois de uma ação.
  let filtro = 'tudo';
  const redesenhar = () => desenhar(ctx.raiz, tela(dados, dia, filtro));

  const carregarEDesenhar = async () => {
    dados = await carregar(dia);
    if (ctx.ativa()) redesenhar();
  };
  await carregarEDesenhar();
  if (!ctx.ativa()) return;

  // Cronômetro parado em outra tela (ou aba): o atendimento pode ter virado "realizado".
  const sincronizar = () => {
    if (ctx.ativa()) carregarEDesenhar().catch(avisarErro);
  };
  addEventListener('fhl:atualizacoes', sincronizar);

  const alterar = async (id, mudanca) => {
    try {
      await db.alterar('compromissos', [['id', 'eq', id]], mudanca, 'id');
      await carregarEDesenhar();
    } catch (erro) {
      avisarErro(erro);
    }
  };

  const desligar = aoClicar(ctx.raiz, {
    'filtro-dia': (el) => {
      filtro = FILTROS_DIA.some(([v]) => v === el.dataset.filtro) ? el.dataset.filtro : 'tudo';
      redesenhar();
      ctx.raiz.querySelector(`[data-acao="filtro-dia"][data-filtro="${filtro}"]`)?.focus();
    },
    aniversario: (el) => {
      const cliente = dados.aniversarios?.find((c) => c.id === el.dataset.id);
      if (cliente) return prepararMensagem({ titulo: `Aniversário — ${cliente.nome}`, telefone: cliente.telefone,
        texto: mensagemAniversario({ cliente, remetente: estado.membro.nome_curto }) });
    },
    lembrete: (el) => {
      const compromisso = dados.amanha?.find((c) => c.id === el.dataset.id);
      if (compromisso) return prepararMensagem({ titulo: `Lembrete — ${compromisso.cliente_nome}`, telefone: compromisso.cliente_telefone,
        texto: mensagemLembrete({ compromisso, remetente: estado.membro.nome_curto, advogado: nomeDe(compromisso.membro_id) }) });
    },
    'iniciar-atendimento': async (el) => {
      try {
        const c = dados.agenda.find((x) => x.id === el.dataset.id);
        const tipo = c.modalidade === 'online' ? 'atendimento_online' : 'atendimento_presencial';
        if (await iniciarCronometro({ cliente_id: c.cliente_id, compromisso_id: c.id, tipo }) && ctx.ativa()) await carregarEDesenhar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
    chegou: (el) => alterar(el.dataset.id, { chegada_em: new Date().toISOString() }),
    realizado: (el) => alterar(el.dataset.id, { situacao: 'realizado' }),
    faltou: (el) => alterar(el.dataset.id, { situacao: 'faltou' }),
  });

  // "Aguardando há 12 min" e a linha do "Agora" andam sozinhos. Não redesenha
  // com o foco num botão do quadro nem com texto selecionado.
  const relogio = setInterval(() => {
    const focoNaTela = ctx.raiz.contains(document.activeElement) && document.activeElement !== ctx.raiz;
    const selecionando = String(getSelection?.() ?? '').trim() !== '';
    if (ctx.ativa() && dados?.agenda?.length && !focoNaTela && !selecionando) redesenhar();
  }, 60_000);

  return () => {
    removeEventListener('fhl:atualizacoes', sincronizar);
    desligar();
    clearInterval(relogio);
  };
}

async function carregar(dia) {
  const tarefas = {
    minhasTarefas: db.todos('v_tarefas', {
      select: 'id,titulo,tipo,cliente_nome,entrega,fatal_em,contagem,prioridade,situacao,cancelado_em',
      filtros: [['responsavel_id', 'eq', estado.membro.id], ['situacao', 'in', ['pendente', 'em_andamento']], ['cancelado_em', 'is', null]],
    }).then((lista) => tarefasParaHoje(lista)),
    avisos: db.rpc('avisos_do_dia'),
  };

  if (pode.clientes()) {
    tarefas.contatos = db.listar('contatos', {
      select: 'id,nome,recebido_em,canal', filtros: [['situacao', 'eq', 'novo'], ['canal', 'eq', 'site']], ordem: 'recebido_em.desc,id.desc', limite: 3,
    });
    tarefas.aniversarios = Promise.all([
      db.todos('clientes', { select: 'id,nome,telefone,ativo', filtros: [['ativo', 'eq', true]] }),
      db.todos('clientes_detalhes', { select: 'id,cliente_id,tipo_pessoa,nascimento', filtros: [['tipo_pessoa', 'eq', 'fisica']] }),
    ]).then(([clientes, detalhes]) => {
      const porCliente = new Map(detalhes.map((d) => [d.cliente_id, d]));
      return aniversariantes(clientes.map((c) => ({ ...porCliente.get(c.id), ...c })), dia);
    });
  }

  if (pode.agenda()) {
    tarefas.agenda = db.rpc('agenda_periodo', { p_de: instante(dia), p_ate: instante(somarDias(dia, 1)) });
    tarefas.amanha = db.rpc('agenda_periodo', { p_de: instante(somarDias(dia, 1)), p_ate: instante(somarDias(dia, 2)) })
      .then((lista) => lista.filter((c) => !c.mascarado && !c.particular && c.tipo === 'atendimento' && c.situacao === 'agendado' && c.cliente_nome));
  }

  if (pode.prazos()) {
    tarefas.intimacoes = db.listar('intimacoes', {
      select: 'id,numero_processo,publicada_em,disponibilizada_em',
      filtros: [['situacao', 'eq', 'pendente']],
      ordem: 'disponibilizada_em.desc,id.desc',
      limite: 5,
    });
  }
  if (pode.site()) {
    tarefas.ultimaPublicacao = db.um('publicacoes', {
      select: 'id,titulo,data', filtros: [['publicado', 'eq', true]], ordem: 'data.desc,id.desc',
    });
  }

  if (pode.financeiro()) {
    const daquiAUmaSemana = somarDias(dia, 7);
    // O aluguel do dia 5 só existe depois que alguém "olha" o mês. Na virada,
    // a semana que vem já é do mês seguinte.
    const contasCriadas = Promise.all([
      garantirContasDoMes(inicioDoMes(dia)),
      ...(inicioDoMes(daquiAUmaSemana) !== inicioDoMes(dia) ? [garantirContasDoMes(inicioDoMes(daquiAUmaSemana))] : []),
    ]);

    // Sem limite: os totais dos cartões somam a semana inteira; a lista
    // mostra só as primeiras.
    tarefas.vencendo = db.todos('v_parcelas', {
      select: 'id,contrato_id,cliente_nome,numero,vencimento,saldo',
      filtros: [['situacao', 'eq', 'a_vencer'], ['vencimento', 'lte', daquiAUmaSemana]],
      ordem: 'vencimento.asc,id.asc',
    });
    tarefas.vencidas = db.todos('v_parcelas', {
      select: 'id,saldo,cliente_id',
      filtros: [['situacao', 'eq', 'vencida']],
    });
    tarefas.contas = contasCriadas.then(() => db.todos('v_contas', {
      select: 'id,descricao,valor,saldo,parcial,vencimento,competencia,situacao',
      filtros: [['situacao', 'in', ['a_pagar', 'vencida', 'sem_valor']], ['vencimento', 'lte', daquiAUmaSemana]],
      ordem: 'vencimento.asc,id.asc',
    }));
  }

  if (pode.fechamento()) {
    const mesPassado = somarMeses(inicioDoMes(dia), -1);
    tarefas.fechamento = db.um('fechamentos', {
      select: 'fechado',
      filtros: [['competencia', 'eq', mesPassado]],
    });
    // Lembrar de fechar só faz sentido se o mês teve movimento — entrada ou
    // saída. A saída é qualquer pagamento de despesa, mesmo parcial.
    tarefas.movimentoMesPassado = Promise.all([
      db.um('recebimentos', {
        select: 'id',
        filtros: [['data', 'gte', mesPassado], ['data', 'lte', fimDoMes(mesPassado)], ['estornado_em', 'is', null]],
      }),
      db.um('pagamentos_despesa', {
        select: 'id',
        filtros: [['data', 'gte', mesPassado], ['data', 'lte', fimDoMes(mesPassado)], ['estornado_em', 'is', null]],
      }),
    ]).then(([entrada, saida]) => Boolean(entrada || saida));
  }

  const chaves = Object.keys(tarefas);
  const valores = await Promise.allSettled(Object.values(tarefas));
  const falhas = valores.filter((v) => v.status === 'rejected');
  falhas.forEach((v) => console.error('Não foi possível carregar um painel de Hoje.', v.reason));
  return { ...Object.fromEntries(chaves.map((chave, i) => [chave, valores[i].status === 'fulfilled' ? valores[i].value : null])),
    falhas: chaves.filter((_, i) => valores[i].status === 'rejected') };
}

function saudacao() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (h < 12) return 'Bom dia';
  return h < 18 ? 'Boa tarde' : 'Boa noite';
}


// A ordem da tela é a ordem de importância para quem abre o sistema de manhã:
// o dia (compromissos e tarefas juntos, com o amanhã ao lado), o dinheiro,
// o que chegou de fora (intimações e contatos) e, por último, os lembretes
// de relacionamento (site e aniversários).
function tela(dados, dia, filtro) {
  const entrada = [
    pode.prazos() ? painelIntimacoes(dados) : '',
    pode.clientes() ? painelContatos(dados) : '',
  ].filter(Boolean);
  const financeiro = pode.financeiro()
    ? ['vencendo', 'vencidas', 'contas'].some((k) => dados[k] === null) ? indisponivel('Financeiro') : painelFinanceiro(dados, dia)
    : '';
  const site = pode.site() ? dados.falhas.includes('ultimaPublicacao') ? indisponivel('Publicações do site') : painelSite(dados.ultimaPublicacao, dia) : '';
  return html`
    ${cabecalho(`${saudacao()}, ${estado.membro.nome_curto}`, capitalizar(dataExtensa(dia)))}
    <div class="hoje">
      ${painelDia(dados, dia, filtro)}
      ${financeiro}
      ${entrada.length ? html`<div class="grade grade--2">${entrada}</div>` : ''}
      ${site}
      ${pode.clientes() ? painelAniversarios(dados.aniversarios) : ''}
    </div>`;
}

const topoPainel = (titulo, href, link) => html`
  <header class="painel__topo">
    <h2 class="painel__titulo">${titulo}</h2>
    ${href ? html`<a class="botao botao--pequeno" href="${href}">${link}</a>` : ''}
  </header>`;

/** Um painel que falhou não derruba os outros: fica o aviso no lugar dele. */
const indisponivel = (titulo) => html`
  <section class="painel">
    ${topoPainel(titulo)}
    ${vazio('Não foi possível carregar este aviso. Abra a tela correspondente ou recarregue Hoje.')}
  </section>`;

// --------------------------------------------------------------------------
// O dia — compromissos e tarefas numa linha do tempo só; amanhã ao lado.
// --------------------------------------------------------------------------

const FILTROS_DIA = [['tudo', 'Tudo'], ['agenda', 'Compromissos'], ['tarefas', 'Tarefas']];

/** Prazo em horas tem hora de verdade; o resto vale "até o fim do dia". */
const horaDaTarefa = (t, dia) => (t.contagem === 'horas' && t.fatal_em && noFuso(t.fatal_em).dia === dia ? t.fatal_em : null);

function painelDia(dados, dia, filtro) {
  const comAgenda = pode.agenda();
  const tarefas = dados.minhasTarefas;
  const agenda = comAgenda ? dados.agenda : [];
  const grupo = (g) => (tarefas ?? []).filter((t) => t.grupo === g);
  const atrasadas = grupo('atrasadas');
  const deHoje = grupo('hoje');
  const proximas = grupo('proximas');
  const verAgenda = filtro !== 'tarefas';
  const verTarefas = filtro !== 'agenda';
  const agora = Date.now();

  // Linha do tempo: primeiro o que vale o dia todo (compromisso de dia inteiro
  // e tarefa sem hora), depois por horário, com a marca do "Agora".
  const semHora = [
    ...(verAgenda ? (agenda ?? []).filter((c) => c.dia_inteiro).map((c) => itemCompromisso(c, agora)) : []),
    ...(verTarefas ? deHoje.filter((t) => !horaDaTarefa(t, dia)).map((t) => itemTarefa(t, html`<span>${t.fatal_em && noFuso(t.fatal_em).dia === dia ? 'Fatal' : 'Entrega'}</span>`)) : []),
  ];
  const comHora = [
    ...(verAgenda ? (agenda ?? []).filter((c) => !c.dia_inteiro).map((c) => ({ quando: Date.parse(c.inicio), item: itemCompromisso(c, agora) })) : []),
    ...(verTarefas ? deHoje.filter((t) => horaDaTarefa(t, dia)).map((t) => ({
      quando: Date.parse(t.fatal_em), item: itemTarefa(t, html`<span class="num">${hora(t.fatal_em)}</span>`),
    })) : []),
  ].sort((a, b) => a.quando - b.quando);
  const posAgora = comHora.findIndex((e) => e.quando > agora);
  const marcaAgora = html`<li class="dia-agora"><span class="dia-agora__hora">Agora <span class="num">${hora(new Date(agora).toISOString())}</span></span><span class="dia-agora__linha" aria-hidden="true"></span></li>`;
  const linhaDoTempo = comHora.length
    ? [...comHora.slice(0, posAgora < 0 ? comHora.length : posAgora).map((e) => e.item), marcaAgora,
      ...(posAgora < 0 ? [] : comHora.slice(posAgora).map((e) => e.item))]
    : [];

  const nCompromissos = agenda?.length ?? 0;
  const nTarefas = atrasadas.length + deHoje.length;
  const contagem = { tudo: nCompromissos + nTarefas, agenda: nCompromissos, tarefas: nTarefas };
  const nadaHoje = !semHora.length && !comHora.length;
  const textoVazio = filtro === 'agenda' ? 'Nenhum compromisso marcado para hoje.'
    : filtro === 'tarefas' ? 'Nenhuma tarefa para hoje.' : 'Nada marcado para hoje.';

  return html`
    <section class="painel dia" data-painel="tarefas" aria-labelledby="dia-titulo">
      <header class="painel__topo dia__topo">
        <div class="dia__titulos">
          <h2 class="painel__titulo dia__titulo" id="dia-titulo">Seu dia</h2>
          <p class="sub">${resumoDoDia({ nCompromissos: comAgenda && agenda ? nCompromissos : null, atrasadas: atrasadas.length, deHoje: deHoje.length })}</p>
        </div>
        <div class="dia__comandos">
          ${comAgenda ? html`
            <div class="segmentos" role="group" aria-label="Mostrar no quadro">
              ${FILTROS_DIA.map(([valor, rotulo]) => html`
                <button type="button" class="segmentos__botao" data-acao="filtro-dia" data-filtro="${valor}" aria-pressed="${filtro === valor}">
                  ${rotulo}<span class="segmentos__n">${contagem[valor]}</span>
                </button>`)}
            </div>` : ''}
          <a class="botao botao--pequeno" href="#/tarefas?visao=minhas">Minhas tarefas</a>
          ${comAgenda ? html`<a class="botao botao--pequeno" href="#/agenda">Semana</a>` : ''}
        </div>
      </header>

      <div class="dia__corpo${comAgenda || proximas.length ? '' : ' dia__corpo--sem-lado'}">
        <div class="dia__hoje">
          ${!tarefas ? html`<p class="nota nota--perigo dia__falha">Não foi possível carregar suas tarefas. Abra Tarefas ou recarregue Hoje.</p>` : ''}
          ${comAgenda && !agenda ? html`<p class="nota nota--perigo dia__falha">Não foi possível carregar a agenda de hoje. Abra a Agenda ou recarregue Hoje.</p>` : ''}

          ${verTarefas && atrasadas.length ? html`
            <div class="dia-bloco dia-bloco--atrasadas">
              <h3 class="dia-bloco__titulo rotulo">Atrasadas · ${atrasadas.length}</h3>
              <ul class="dia-lista">${atrasadas.map((t) => itemTarefa(t, html`<span>Atrasada</span>`))}</ul>
            </div>` : ''}

          <div class="dia-bloco">
            <h3 class="dia-bloco__titulo rotulo">Hoje</h3>
            ${nadaHoje
              ? html`<p class="dia__vazio">${textoVazio}</p>`
              : html`<ul class="dia-lista dia-lista--tempo">${semHora}${linhaDoTempo}</ul>`}
          </div>
          ${verTarefas && tarefas && !tarefas.length
            ? html`<p class="dia__vazio dia__vazio--tarefas">Nenhuma tarefa ou prazo vencido, para hoje ou nos próximos 7 dias.</p>` : ''}
        </div>

        ${comAgenda || proximas.length ? html`
          <aside class="dia__lado" aria-label="Amanhã e próximos dias">
            ${comAgenda && verAgenda ? painelLembretes(dados.amanha) : ''}
            ${verTarefas && proximas.length ? html`
              <div class="dia-bloco">
                <h3 class="dia-bloco__titulo rotulo">Próximos 7 dias · ${proximas.length}</h3>
                <ul class="dia-lista">${proximas.map((t) => itemTarefa(t, html`<span class="num">${dataCurta(diaDaTarefa(t))}</span>`))}</ul>
              </div>` : ''}
            ${filtro === 'tarefas' && tarefas?.length && !proximas.length ? html`
              <div class="dia-bloco">
                <h3 class="dia-bloco__titulo rotulo">Próximos 7 dias</h3>
                <p class="dia__vazio">Nenhuma tarefa nos próximos 7 dias.</p>
              </div>` : ''}
          </aside>` : ''}
      </div>

      ${comAgenda && verAgenda ? html`<div class="painel__rodape dia__rodape">${notaGoogle()}</div>` : ''}
    </section>`;
}

function resumoDoDia({ nCompromissos, atrasadas, deHoje }) {
  const partes = [];
  if (nCompromissos != null) partes.push(nCompromissos ? plural(nCompromissos, 'compromisso', 'compromissos') : 'nenhum compromisso');
  partes.push(deHoje ? plural(deHoje, 'tarefa para hoje', 'tarefas para hoje') : 'nenhuma tarefa para hoje');
  if (atrasadas) partes.push(plural(atrasadas, 'atrasada', 'atrasadas'));
  return capitalizar(partes.join(' · '));
}

function itemTarefa(t, quando) {
  const nivel = urgenciaTarefa(t)?.nivel ?? 'neutro';
  const restante = prazoRestante(t);
  return html`
    <li class="dia-item dia-item--tarefa dia-item--${nivel}">
      <span class="dia-item__hora">${quando}</span>
      <a class="dia-item__corpo" href="#/tarefas?visao=minhas&busca=${encodeURIComponent(t.titulo)}">
        <span class="dia-item__tipo">${t.tipo === 'prazo' ? 'Prazo' : 'Tarefa'}${['alta', 'urgente'].includes(t.prioridade) ? ` · prioridade ${PRIORIDADES[t.prioridade].toLowerCase()}` : ''}</span>
        <strong class="dia-item__titulo">${t.titulo}</strong>
        <span class="sub">${t.cliente_nome || 'Sem cliente'}${t.entrega ? ` · entrega ${dataCurta(t.entrega)}` : ''}</span>
        ${restante || t.fatal_em ? html`<span class="dia-item__selos">
          ${restante ? html`<span class="selo tarefa-quando tarefa-quando--${nivel}">${restante}</span>` : ''}
          ${t.fatal_em ? html`<span class="selo ${t.grupo === 'atrasadas' ? 'selo--perigo' : 'selo--alerta'}">Fatal · ${dataHora(t.fatal_em)}</span>` : ''}
        </span>` : ''}
      </a>
    </li>`;
}

function itemCompromisso(c, agora) {
  const passado = new Date(c.fim).getTime() < agora;
  const emCurso = !c.dia_inteiro && new Date(c.inicio).getTime() <= agora && !passado;
  const esperando = c.chegada_em && c.situacao === 'agendado';
  const minutos = esperando ? Math.max(0, Math.round((agora - new Date(c.chegada_em).getTime()) / 60000)) : 0;
  const acoes = c.pode_editar && ['atendimento', 'audiencia'].includes(c.tipo) && c.situacao === 'agendado';

  return html`
    <li class="dia-item dia-item--compromisso${passado && !esperando ? ' dia-item--passado' : ''}${emCurso ? ' dia-item--agora' : ''}" data-vars="--cor:${corDe(c.membro_id)}">
      <span class="dia-item__hora">${c.dia_inteiro ? html`<span>Dia todo</span>` : html`<span class="num">${hora(c.inicio)}</span><span class="sub num">${hora(c.fim)}</span>`}</span>
      <div class="dia-item__corpo">
        <span class="dia-item__tipo">${rotuloTipo(c.tipo, c.modalidade)}${emCurso ? ' · agora' : ''}</span>
        <strong class="dia-item__titulo">${c.titulo || c.cliente_nome || rotuloTipo(c.tipo, c.modalidade)}</strong>
        <span class="sub">${nomeDe(c.membro_id)}${c.cliente_nome && c.titulo ? ` · ${c.cliente_nome}` : ''}</span>
        ${esperando ? html`<span class="dia-item__selos"><span class="selo selo--alerta">Cliente aguardando há ${minutos} min</span></span>` : ''}
        ${acoes
          ? html`<span class="dia-item__acoes">
            ${pode.clientes() && c.cliente_id && c.tipo === 'atendimento'
              ? html`<button type="button" class="botao botao--pequeno botao--primario" data-acao="iniciar-atendimento" data-id="${c.id}">Iniciar atendimento</button>`
              : ''}
            ${c.tipo === 'atendimento' && !c.chegada_em ? html`<button type="button" class="botao botao--pequeno" data-acao="chegou" data-id="${c.id}">Chegou</button>` : ''}
            <button type="button" class="botao botao--pequeno" data-acao="realizado" data-id="${c.id}">Realizado</button>
            <button type="button" class="botao botao--pequeno botao--discreto" data-acao="faltou" data-id="${c.id}">Faltou</button>
          </span>`
          : c.mascarado ? '' : html`<span class="dia-item__selos">${seloCompromisso(c.situacao)}</span>`}
      </div>
    </li>`;
}

function painelLembretes(lista) {
  return html`
    <div class="dia-bloco dia-bloco--amanha" data-painel="lembretes">
      <h3 class="dia-bloco__titulo rotulo">Amanhã · lembretes</h3>
      ${!lista
        ? html`<p class="dia__vazio">Não foi possível carregar os atendimentos de amanhã.</p>`
        : lista.length
          ? html`<ul class="dia-lista">${lista.map((c) => html`
              <li class="dia-item dia-item--lembrete" data-vars="--cor:${corDe(c.membro_id)}">
                <span class="dia-item__hora"><span class="num">${hora(c.inicio)}</span></span>
                <div class="dia-item__corpo">
                  <strong class="dia-item__titulo">${c.cliente_nome}</strong>
                  <span class="sub">${nomeDe(c.membro_id)} · ${rotuloTipo(c.tipo, c.modalidade)}</span>
                  <span class="dia-item__acoes">
                    <button type="button" class="botao botao--pequeno" data-acao="lembrete" data-id="${c.id}">Preparar lembrete</button>
                  </span>
                </div>
              </li>`)}</ul>`
          : html`<p class="dia__vazio">Nenhum atendimento marcado para amanhã.</p>`}
    </div>`;
}

// --------------------------------------------------------------------------
// Os demais painéis, em ordem de importância.
// --------------------------------------------------------------------------

/** Até `n` itens; o resto vira "e mais N" com o link da tela completa. */
const limitar = (lista, n, href, rotulo) => [
  lista.slice(0, n),
  lista.length > n ? html`<li><a class="lista__item lista__mais" href="${href}">e mais ${lista.length - n} — ${rotulo}</a></li>` : '',
];

function painelFinanceiro(dados, dia) {
  const saldoVencido = dados.vencidas.reduce((soma, p) => soma + centavos(p.saldo), 0);
  const clientesVencidos = new Set(dados.vencidas.map((p) => p.cliente_id)).size;
  const aReceber = dados.vencendo.reduce((soma, p) => soma + centavos(p.saldo), 0);
  const comValor = dados.contas.filter((c) => c.valor != null);
  const aPagar = comValor.reduce((soma, c) => soma + centavos(c.parcial ? c.saldo : c.valor), 0);
  const semValor = dados.contas.length - comValor.length;
  const contasVencidas = dados.contas.filter((c) => c.situacao === 'vencida').length;
  const mesPassado = somarMeses(inicioDoMes(dia), -1);
  const lembrarFechamento = pode.fechamento() && dados.movimentoMesPassado && !dados.fechamento?.fechado;
  const alertas = dados.avisos?.alertas_financeiros ?? null;

  return html`
    <section class="painel" data-painel="financeiro">
      ${topoPainel('Financeiro', '#/financeiro', 'Painel')}

      <div class="indicadores indicadores--embutido">
        ${indicador('Em atraso', moeda(saldoVencido),
          `${plural(dados.vencidas.length, 'parcela', 'parcelas')} · ${plural(clientesVencidos, 'cliente', 'clientes')} · sem encargos`,
          { tom: saldoVencido ? 'perigo' : '', href: '#/financeiro/atraso' })}
        ${indicador('A receber · 7 dias', moeda(aReceber), plural(dados.vencendo.length, 'parcela', 'parcelas'),
          { tom: aReceber ? 'ok' : '', href: '#/financeiro/recebiveis' })}
        ${indicador('A pagar · 7 dias', moeda(aPagar),
          [plural(dados.contas.length, 'conta', 'contas'), contasVencidas && `${contasVencidas} vencida${contasVencidas > 1 ? 's' : ''}`,
            semValor && `${semValor} sem valor`].filter(Boolean).join(' · '),
          { tom: contasVencidas ? 'perigo' : '', href: '#/financeiro/contas' })}
        ${alertas != null ? indicador('Alertas novos', String(alertas), 'fechamentos, estornos, acessos',
          { tom: alertas ? 'alerta' : '', href: '#/financeiro/alertas' }) : ''}
      </div>

      ${lembrarFechamento
        ? html`<div class="painel__corpo fin-hoje__aviso"><p class="nota"><strong>${capitalizar(nomeDoMes(mesPassado))}</strong> ainda não foi fechado. <a href="#/financeiro/fechamento?mes=${mesPassado}">Ver fechamento</a></p></div>`
        : ''}

      <div class="fin-hoje">
        <div class="fin-hoje__coluna">
          <h3 class="aviso-lista__titulo rotulo"><span>A receber · próximos 7 dias</span></h3>
          ${dados.vencendo.length
            ? html`<ul class="lista">${limitar(dados.vencendo.map((p) => html`
                <li><a class="lista__item" href="#/financeiro/contratos/${p.contrato_id}">
                  <span>${p.cliente_nome}<span class="sub">${rotuloParcela(p)} · vence ${dataCurta(p.vencimento)}</span></span>
                  <span class="num">${moeda(centavos(p.saldo))}</span>
                </a></li>`), 6, '#/financeiro/recebiveis', 'ver recebíveis')}</ul>`
            : vazio('Nenhuma parcela vence nesta semana.')}
        </div>
        <div class="fin-hoje__coluna">
          <h3 class="aviso-lista__titulo rotulo"><span>A pagar · contas do escritório</span></h3>
          ${dados.contas.length
            ? html`<ul class="lista">${limitar(dados.contas.map((c) => html`
                <li><a class="lista__item" href="#/financeiro/contas?mes=${c.competencia}">
                  <span>${c.descricao}<span class="sub">vence ${dataCurta(c.vencimento)}</span></span>
                  <span class="fin-hoje__valor">${c.valor != null ? html`<span class="num">${moeda(centavos(c.parcial ? c.saldo : c.valor))}</span>${c.parcial ? html`<span class="sub">pago em parte · total ${moeda(centavos(c.valor))}</span>` : ''} ` : ''}${seloConta(c.situacao)}</span>
                </a></li>`), 6, '#/financeiro/contas', 'ver contas')}</ul>`
            : vazio('Nenhuma conta vencida ou vencendo nesta semana.')}
        </div>
      </div>
    </section>`;
}

function painelContatos(dados) {
  if (!dados.contatos) return indisponivel('Contatos novos do site');
  const total = dados.avisos?.contatos_site_novos;
  return html`
    <section class="painel" data-painel="contatos">
      ${topoPainel('Contatos novos do site', '#/contatos?canal=site&situacao=novo', 'Ver contatos')}
      ${total != null ? html`<p class="painel__corpo">${plural(total, 'contato novo', 'contatos novos')} do site.</p>` : ''}
      ${dados.contatos.length
        ? html`<ul class="lista">${dados.contatos.map((c) => html`
            <li><a class="lista__item" href="#/contatos?busca=${encodeURIComponent(c.nome)}">${c.nome}<span class="sub">${dataHora(c.recebido_em)}</span></a></li>`)}</ul>`
        : vazio('Nenhum contato novo do site.')}
    </section>`;
}

function painelIntimacoes(dados) {
  if (!dados.intimacoes) return indisponivel('Intimações a conferir');
  const total = dados.avisos?.intimacoes_pendentes;
  const novasHoje = dados.avisos?.intimacoes_novas_hoje ?? 0;
  return html`
    <section class="painel" data-painel="intimacoes">
      ${topoPainel('Intimações a conferir', '#/intimacoes?situacao=pendente', 'Conferir')}
      ${total != null ? html`<p class="painel__corpo">${plural(total, 'intimação pendente', 'intimações pendentes')}${novasHoje
        ? html` · <strong>${plural(novasHoje, 'nova do diário hoje', 'novas do diário hoje')}</strong>` : ''}.</p>` : ''}
      ${dados.intimacoes.length
        ? html`<ul class="lista">${dados.intimacoes.map((i) => html`
            <li><a class="lista__item" href="#/intimacoes?situacao=pendente&busca=${encodeURIComponent(i.numero_processo || '')}">
              <span class="num">${numeroCnj(i.numero_processo) || 'Intimação sem número de processo'}</span>
              <span class="sub">${dataCurta(i.publicada_em || i.disponibilizada_em)}</span>
            </a></li>`)}</ul>`
        : vazio('Nenhuma intimação aguardando conferência.')}
    </section>`;
}

// O aviso editorial só aparece quando o site está parado: nenhum artigo
// publicado, ou o último com mais de 21 dias (CLAUDE.md §4 — "começam e não fazem").
function painelSite(ultima, dia) {
  const dias = ultima ? diasEntre(ultima.data, dia) : null;
  if (ultima && dias <= 21) return '';
  return html`
    <section class="painel" data-painel="site">
      ${topoPainel('Publicações do site', '#/site/publicacoes/nova', 'Escrever publicação')}
      <div class="painel__corpo">
        <p class="nota">${ultima ? `A última publicação foi há ${dias} dias: ${ultima.titulo}.` : 'O site ainda não tem publicação.'}</p>
      </div>
    </section>`;
}

// Por último: relacionamento, não urgência.
function painelAniversarios(lista) {
  if (!lista) return indisponivel('Aniversários');
  return html`
    <section class="painel" data-painel="aniversarios">
      ${topoPainel('Aniversários', '#/clientes', 'Clientes')}
      ${lista.length
        ? html`<ul class="lista">${lista.map((c) => html`
            <li class="aviso-dia">
              <span>
                <a href="#/clientes/${c.id}"><strong>${c.nome}</strong></a>
                <span class="sub">${c.aniversario.dias === 0 ? 'Hoje' : dataCurta(c.aniversario.data)} · ${c.aniversario.idade} anos</span>
              </span>
              <button type="button" class="botao botao--pequeno" data-acao="aniversario" data-id="${c.id}">Preparar mensagem</button>
            </li>`)}</ul>`
        : vazio('Nenhum aniversário hoje ou nos próximos 7 dias.')}
    </section>`;
}
