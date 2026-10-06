// Hoje — a tela de abertura (preparação 7.5.2).
// =============================================
//
// O "Escritório Virtual" do protótipo: quem atende quem e a que horas, se há
// cliente esperando, e o que pede atenção no Financeiro. Avisa, não envia (5.4).

import { avisarErro } from '../nucleo/avisos.js';
import { corDe, estado, nomeDe, pode } from '../nucleo/estado.js';
import {
  centavos, dataCurta, dataExtensa, dataHora, diasEntre, fimDoMes, hoje, hora, inicioDoMes, instante, moeda, nomeDoMes,
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
import { mensagemAniversario, mensagemLembrete } from '../dominio/mensagens.js';
import { prepararMensagem } from './preparar-mensagem.js';

export default async function telaInicio(ctx) {
  const dia = hoje();
  let dados;

  const carregarEDesenhar = async () => {
    dados = await carregar(dia);
    if (ctx.ativa()) desenhar(ctx.raiz, tela(dados, dia));
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

  // "Aguardando há 12 min" anda sozinho.
  const relogio = setInterval(() => {
    if (ctx.ativa() && dados?.agenda?.some((c) => c.chegada_em && c.situacao === 'agendado')) {
      desenhar(ctx.raiz, tela(dados, dia));
    }
  }, 60_000);

  const largura = matchMedia('(max-width: 1100px)');
  const ajustarColunas = () => { if (ctx.ativa()) desenhar(ctx.raiz, tela(dados, dia)); };
  largura.addEventListener('change', ajustarColunas);

  return () => {
    removeEventListener('fhl:atualizacoes', sincronizar);
    desligar();
    clearInterval(relogio);
    largura.removeEventListener('change', ajustarColunas);
  };
}

async function carregar(dia) {
  const tarefas = {
    minhasTarefas: db.todos('v_tarefas', {
      select: 'id,titulo,tipo,cliente_nome,entrega,fatal_em,situacao,cancelado_em',
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
    tarefas.contas = contasCriadas.then(() => db.listar('v_contas', {
      select: 'id,descricao,valor,vencimento,competencia,situacao',
      filtros: [['situacao', 'in', ['a_pagar', 'vencida', 'sem_valor']], ['vencimento', 'lte', daquiAUmaSemana]],
      ordem: 'vencimento.asc',
      limite: 8,
    }));
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

function tela(dados, dia) {
  const paineis = [
    painelTarefas(dados.minhasTarefas),
    pode.agenda() ? dados.agenda ? painelAgenda(dados.agenda) : indisponivel('Agenda de hoje') : '',
    pode.clientes() ? painelAniversarios(dados.aniversarios) : '',
    pode.agenda() ? painelLembretes(dados.amanha) : '',
    pode.clientes() ? painelContatos(dados) : '',
    pode.prazos() ? painelIntimacoes(dados) : '',
    pode.financeiro() ? ['vencendo', 'vencidas', 'contas'].some((k) => dados[k] === null) ? indisponivel('Financeiro') : painelFinanceiro(dados, dia) : '',
    pode.site() ? dados.falhas.includes('ultimaPublicacao') ? indisponivel('Publicações do site') : painelSite(dados.ultimaPublicacao, dia) : '',
  ];
  return html`
    ${cabecalho(`${saudacao()}, ${estado.membro.nome_curto}`, capitalizar(dataExtensa(dia)))}
    <div class="grade grade--hoje">
      ${matchMedia('(max-width: 1100px)').matches ? paineis : html`
        <div class="hoje-coluna">${paineis.filter((_, i) => i % 2 === 0)}</div>
        <div class="hoje-coluna">${paineis.filter((_, i) => i % 2 === 1)}</div>`}
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

const GRUPOS_TAREFAS = { atrasadas: 'Atrasadas', hoje: 'Hoje', proximas: 'Próximos 7 dias' };

function painelTarefas(lista) {
  if (!lista) return indisponivel('Para hoje');
  const grupo = (chave, titulo) => {
    const itens = lista.filter((t) => t.grupo === chave);
    if (!itens.length) return '';
    return html`
      <h3 class="aviso-lista__titulo rotulo">${titulo} · ${itens.length}</h3>
      <ul class="lista">${itens.map((t) => html`
        <li><a class="lista__item" href="#/tarefas?visao=minhas&busca=${encodeURIComponent(t.titulo)}">
          <span>
            <strong>${t.titulo}</strong>
            <span class="sub">${t.cliente_nome || 'Sem cliente'}${t.entrega ? ` · entrega ${dataCurta(t.entrega)}` : ''}</span>
            ${t.fatal_em ? html`<span class="selo ${chave === 'atrasadas' ? 'selo--perigo' : 'selo--alerta'}">Fatal · ${dataHora(t.fatal_em)}</span>` : ''}
          </span>
        </a></li>`)}
      </ul>`;
  };
  return html`
    <section class="painel" data-painel="tarefas">
      ${topoPainel('Para hoje', '#/tarefas?visao=minhas', 'Minhas tarefas')}
      ${lista.length
        ? Object.entries(GRUPOS_TAREFAS).map(([chave, titulo]) => grupo(chave, titulo))
        : vazio('Nenhuma tarefa ou prazo vencido, para hoje ou nos próximos 7 dias.')}
    </section>`;
}

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

function painelLembretes(lista) {
  if (!lista) return indisponivel('Lembretes de amanhã');
  return html`
    <section class="painel" data-painel="lembretes">
      ${topoPainel('Lembretes de amanhã', '#/agenda', 'Agenda')}
      ${lista.length
        ? html`<ul class="lista">${lista.map((c) => html`
            <li class="aviso-dia">
              <span>
                <strong>${c.cliente_nome}</strong>
                <span class="sub">${hora(c.inicio)} · ${nomeDe(c.membro_id)} · ${rotuloTipo(c.tipo, c.modalidade)}</span>
              </span>
              <button type="button" class="botao botao--pequeno" data-acao="lembrete" data-id="${c.id}">Preparar lembrete</button>
            </li>`)}</ul>`
        : vazio('Nenhum atendimento marcado para amanhã.')}
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
  return html`
    <section class="painel" data-painel="intimacoes">
      ${topoPainel('Intimações a conferir', '#/intimacoes?situacao=pendente', 'Conferir')}
      ${total != null ? html`<p class="painel__corpo">${plural(total, 'intimação pendente', 'intimações pendentes')}.</p>` : ''}
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
            ${pode.clientes() && c.cliente_id && c.tipo === 'atendimento'
              ? html`<button type="button" class="botao botao--pequeno botao--primario" data-acao="iniciar-atendimento" data-id="${c.id}">Iniciar atendimento</button>`
              : ''}
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
