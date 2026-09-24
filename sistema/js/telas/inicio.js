// Hoje — a tela de abertura (preparação 7.5.2).
// =============================================
//
// O "Escritório Virtual" do protótipo: quem atende quem e a que horas, se há
// cliente esperando, e o que pede atenção no Financeiro. Avisa, não envia (5.4).

import { avisarErro } from '../nucleo/avisos.js';
import { corDe, estado, nomeDe, pode } from '../nucleo/estado.js';
import {
  centavos, dataCurta, dataExtensa, fimDoMes, hoje, hora, inicioDoMes, instante, moeda, nomeDoMes,
  somarDias, somarMeses,
} from '../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';
import {
  cabecalho, capitalizar, indicador, notaGoogle, plural, rotuloTipo, seloCompromisso, seloConta, vazio,
} from './comum.js';
import { garantirContasDoMes, rotuloParcela } from './financeiro/base.js';

export default async function telaInicio(ctx) {
  const dia = hoje();
  let dados;

  const carregarEDesenhar = async () => {
    dados = await carregar(dia);
    if (ctx.ativa()) desenhar(ctx.raiz, tela(dados, dia));
  };
  await carregarEDesenhar();

  const alterar = async (id, mudanca) => {
    try {
      await db.alterar('compromissos', [['id', 'eq', id]], mudanca, 'id');
      await carregarEDesenhar();
    } catch (erro) {
      avisarErro(erro);
    }
  };

  const desligar = aoClicar(ctx.raiz, {
    chegou: (el) => alterar(el.dataset.id, { chegada_em: new Date().toISOString() }),
    realizado: (el) => alterar(el.dataset.id, { situacao: 'realizado' }),
    faltou: (el) => alterar(el.dataset.id, { situacao: 'faltou' }),
  });

  // "Aguardando há 12 min" anda sozinho.
  const relogio = setInterval(() => {
    if (ctx.ativa() && dados?.agenda?.some((c) => c.chegada_em && c.situacao === 'agendado')) {
      desenhar(ctx.raiz, tela(dados, dia));
    }
  }, 60_000);

  return () => {
    desligar();
    clearInterval(relogio);
  };
}

async function carregar(dia) {
  const tarefas = {};

  if (pode.agenda()) {
    tarefas.agenda = db.rpc('agenda_periodo', { p_de: instante(dia), p_ate: instante(somarDias(dia, 1)) });
  }

  if (pode.financeiro()) {
    const daquiAUmaSemana = somarDias(dia, 7);
    // O aluguel do dia 5 só existe depois que alguém "olha" o mês. Na virada,
    // a semana que vem já é do mês seguinte.
    await garantirContasDoMes(inicioDoMes(dia));
    if (inicioDoMes(daquiAUmaSemana) !== inicioDoMes(dia)) await garantirContasDoMes(inicioDoMes(daquiAUmaSemana));

    tarefas.vencendo = db.listar('v_parcelas', {
      select: 'id,contrato_id,cliente_nome,numero,vencimento,saldo',
      filtros: [['situacao', 'eq', 'a_vencer'], ['vencimento', 'lte', daquiAUmaSemana]],
      ordem: 'vencimento.asc',
      limite: 8,
    });
    tarefas.vencidas = db.todos('v_parcelas', {
      select: 'id,saldo,cliente_id',
      filtros: [['situacao', 'eq', 'vencida']],
    });
    tarefas.contas = db.listar('v_contas', {
      select: 'id,descricao,valor,vencimento,competencia,situacao',
      filtros: [['situacao', 'in', ['a_pagar', 'vencida', 'sem_valor']], ['vencimento', 'lte', daquiAUmaSemana]],
      ordem: 'vencimento.asc',
      limite: 8,
    });
  }

  if (pode.fechamento()) {
    const mesPassado = somarMeses(inicioDoMes(dia), -1);
    tarefas.fechamento = db.um('fechamentos', {
      select: 'fechado',
      filtros: [['competencia', 'eq', mesPassado]],
    });
    // Lembrar de fechar só faz sentido se o mês teve movimento — entrada ou saída.
    tarefas.movimentoMesPassado = Promise.all([
      db.um('recebimentos', {
        select: 'id',
        filtros: [['data', 'gte', mesPassado], ['data', 'lte', fimDoMes(mesPassado)], ['estornado_em', 'is', null]],
      }),
      db.um('contas', {
        select: 'id',
        filtros: [['data_pagamento', 'gte', mesPassado], ['data_pagamento', 'lte', fimDoMes(mesPassado)], ['cancelado_em', 'is', null]],
      }),
    ]).then(([entrada, saida]) => Boolean(entrada || saida));
  }

  const chaves = Object.keys(tarefas);
  const valores = await Promise.all(Object.values(tarefas));
  return Object.fromEntries(chaves.map((chave, i) => [chave, valores[i]]));
}

function saudacao() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (h < 12) return 'Bom dia';
  return h < 18 ? 'Boa tarde' : 'Boa noite';
}

function tela(dados, dia) {
  return html`
    ${cabecalho(`${saudacao()}, ${estado.membro.nome_curto}`, capitalizar(dataExtensa(dia)))}
    <div class="grade grade--hoje">
      ${pode.agenda() ? painelAgenda(dados.agenda) : ''}
      ${pode.financeiro() ? painelFinanceiro(dados, dia) : ''}
      ${!pode.agenda() && !pode.financeiro()
        ? html`<section class="painel">${vazio('Seu perfil ainda não tem acesso a nenhum módulo. Fale com o administrador.')}</section>`
        : ''}
    </div>`;
}

function painelAgenda(agenda) {
  const agora = Date.now();
  return html`
    <section class="painel">
      <header class="painel__topo">
        <h2 class="painel__titulo">Agenda de hoje</h2>
        <a class="botao botao--pequeno" href="#/agenda">Semana</a>
      </header>
      ${agenda.length
        ? html`<ul class="compromissos">${agenda.map((c) => itemAgenda(c, agora))}</ul>`
        : vazio('Nenhum compromisso marcado para hoje.')}
      <div class="painel__corpo">${notaGoogle()}</div>
    </section>`;
}

function itemAgenda(c, agora) {
  const passado = new Date(c.fim).getTime() < agora;
  const esperando = c.chegada_em && c.situacao === 'agendado';
  const minutos = esperando ? Math.max(0, Math.round((agora - new Date(c.chegada_em).getTime()) / 60000)) : 0;
  const acoes = c.pode_editar && ['atendimento', 'audiencia'].includes(c.tipo) && c.situacao === 'agendado';

  return html`
    <li class="compromisso${passado && !esperando ? ' compromisso--passado' : ''}" data-vars="--cor:${corDe(c.membro_id)}">
      <span class="compromisso__hora">${c.dia_inteiro ? 'Dia todo' : `${hora(c.inicio)}–${hora(c.fim)}`}</span>
      <span class="compromisso__corpo">
        <strong>${c.titulo || c.cliente_nome || rotuloTipo(c.tipo, c.modalidade)}</strong>
        <span class="sub">${nomeDe(c.membro_id)} · ${rotuloTipo(c.tipo, c.modalidade)}${c.cliente_nome && c.titulo ? ` · ${c.cliente_nome}` : ''}</span>
        ${esperando ? html`<span class="selo selo--alerta">Cliente aguardando há ${minutos} min</span>` : ''}
      </span>
      <span class="compromisso__acoes">
        ${acoes
          ? html`
            ${c.tipo === 'atendimento' && !c.chegada_em ? html`<button type="button" class="botao botao--pequeno" data-acao="chegou" data-id="${c.id}">Chegou</button>` : ''}
            <button type="button" class="botao botao--pequeno" data-acao="realizado" data-id="${c.id}">Realizado</button>
            <button type="button" class="botao botao--pequeno botao--discreto" data-acao="faltou" data-id="${c.id}">Faltou</button>`
          : c.mascarado ? '' : seloCompromisso(c.situacao)}
      </span>
    </li>`;
}

function painelFinanceiro(dados, dia) {
  const saldoVencido = dados.vencidas.reduce((soma, p) => soma + centavos(p.saldo), 0);
  const clientesVencidos = new Set(dados.vencidas.map((p) => p.cliente_id)).size;
  const mesPassado = somarMeses(inicioDoMes(dia), -1);
  const lembrarFechamento = pode.fechamento() && dados.movimentoMesPassado && !dados.fechamento?.fechado;

  return html`
    <section class="painel">
      <header class="painel__topo">
        <h2 class="painel__titulo">Financeiro</h2>
        <a class="botao botao--pequeno" href="#/financeiro">Painel</a>
      </header>

      <div class="indicadores indicadores--embutido">
        ${indicador('Em atraso', moeda(saldoVencido),
          `${plural(dados.vencidas.length, 'parcela', 'parcelas')} · ${plural(clientesVencidos, 'cliente', 'clientes')} · sem encargos`,
          { tom: saldoVencido ? 'perigo' : '', href: '#/financeiro/atraso' })}
      </div>

      ${lembrarFechamento
        ? html`<div class="painel__corpo"><p class="nota"><strong>${capitalizar(nomeDoMes(mesPassado))}</strong> ainda não foi fechado. <a href="#/financeiro/fechamento?mes=${mesPassado}">Ver fechamento</a></p></div>`
        : ''}

      <h3 class="aviso-lista__titulo rotulo"><span>Parcelas nos próximos 7 dias</span></h3>
      ${dados.vencendo.length
        ? html`<ul class="lista">${dados.vencendo.map((p) => html`
            <li><a class="lista__item" href="#/financeiro/contratos/${p.contrato_id}">
              <span>${p.cliente_nome}<span class="sub">${rotuloParcela(p)} · vence ${dataCurta(p.vencimento)}</span></span>
              <span class="num">${moeda(centavos(p.saldo))}</span>
            </a></li>`)}</ul>`
        : vazio('Nenhuma parcela vence nesta semana.')}

      <h3 class="aviso-lista__titulo rotulo"><span>Contas do escritório</span></h3>
      ${dados.contas.length
        ? html`<ul class="lista">${dados.contas.map((c) => html`
            <li><a class="lista__item" href="#/financeiro/contas?mes=${c.competencia}">
              <span>${c.descricao}<span class="sub">vence ${dataCurta(c.vencimento)}</span></span>
              <span>${c.valor != null ? html`<span class="num">${moeda(centavos(c.valor))}</span> ` : ''}${seloConta(c.situacao)}</span>
            </a></li>`)}</ul>`
        : vazio('Nenhuma conta vencida ou vencendo nesta semana.')}
    </section>`;
}
