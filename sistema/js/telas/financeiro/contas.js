// Contas do escritório — as despesas (preparação 6.4 D; DOCX §8, T01 e T13).
// =========================================================================
//
// O que sai: aluguel, luz, internet, café. Desde 08/10/2026 a conta é a
// OBRIGAÇÃO (o valor previsto) e cada pagamento é um registro à parte: dá
// para pagar em partes, estornar um pagamento com motivo e ver o saldo. O
// valor da conta não muda quando se paga.
//
// As fixas nascem sozinhas (recorrentes: mensal, anual ou parcelada); a de
// valor variável nasce "falta o valor". Sócio que pagou do próprio bolso
// fica com reembolso a receber — e o reembolso sai de uma conta financeira
// quando acontece. Quem só consulta vê tudo, inclusive a previsão das
// recorrentes que ainda não viraram conta, e não grava nada.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { estado, membrosAtivos, nomeDe, pode } from '../../nucleo/estado.js';
import {
  centavos, data, dataHora, decimal, fimDoMes, hoje, inicioDoMes, lerMoeda, moeda, nomeDoMes, paraReais, somarMeses,
} from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, indicador, mesDaConsulta, plural, seletorMes, seloConta, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { abrirAnexos } from '../anexos.js';
import { apoio, garantirContasDoMes, nomeContaFinanceira, opcoes, opcoesContasFinanceiras, somaCentavos } from './base.js';

const ABAS = [['mes', 'Do mês'], ['recorrentes', 'Recorrentes'], ['reembolsos', 'Reembolsos a sócios'], ['fornecedores', 'Fornecedores']];
export const TIPOS_DESPESA = { fixa: 'Fixa', variavel: 'Variável', extraordinaria: 'Extraordinária' };
const FREQUENCIAS = { mensal: 'Todo mês', anual: 'Uma vez por ano', parcelada: 'Parcelada (número de meses)' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default async function telaContas(ctx) {
  const aba = ABAS.some(([v]) => v === ctx.consulta.aba) ? ctx.consulta.aba : 'mes';
  let mes = mesDaConsulta(ctx.consulta.mes, inicioDoMes(hoje()));
  const base = await apoio();
  const [fornecedores, centros] = await Promise.all([
    db.listar('fornecedores', { select: 'id,nome,documento,contato,observacoes,ativo', ordem: 'ativo.desc,nome.asc' }),
    db.listar('centros_custo', { select: 'id,nome,ativo', ordem: 'nome.asc' }),
  ]);
  const listas = { ...base, fornecedores, centros };
  let dados = {};

  const mostrar = async () => {
    dados = await CARREGAR[aba](mes, listas);
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, html`${topo(aba, mes)}${DESENHAR[aba](dados, listas)}`);
  };
  await mostrar();
  if (ctx.consulta.nova === '1' && pode.lancar() && aba === 'mes') depois(editarConta(null, listas, mes));

  function depois(promessa) {
    return promessa.then((feito) => feito && ctx.ativa() && mostrar()).catch(avisarErro);
  }
  const conta = (el) => [...(dados.contas ?? [])].find((c) => c.id === el.dataset.id);
  const recorrente = (el) => dados.recorrentes.find((r) => r.id === el.dataset.id);
  const trocarMes = (delta) => {
    mes = somarMeses(mes, delta);
    guardarConsulta({ aba, mes });
    mostrar().catch(avisarErro);
  };

  return aoClicar(ctx.raiz, {
    'mes-anterior': () => trocarMes(-1),
    'mes-seguinte': () => trocarMes(1),
    nova: () => depois(editarConta(null, listas, mes)),
    editar: (el) => depois(editarConta(conta(el), listas, mes)),
    pagar: (el) => depois(pagarConta(conta(el), listas)),
    pagamentos: (el) => depois(verPagamentos(conta(el), listas)),
    anexos: (el) => abrirAnexos({ titulo: conta(el).descricao, destino: { conta_id: el.dataset.id }, podeGravar: pode.lancar() }),
    historico: (el) => abrirHistorico({ titulo: conta(el).descricao, registros: [el.dataset.id] }),
    cancelar: async (el) => {
      const c = conta(el);
      const motivo = await pedirMotivo({ titulo: `Cancelar — ${c.descricao}`, rotuloOk: 'Cancelar conta' });
      if (motivo) {
        depois(db.alterar('contas', [['id', 'eq', c.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id')
          .then(() => avisar('Conta cancelada.')).then(() => true));
      }
    },
    'nova-recorrente': () => depois(editarRecorrente(null, listas)),
    'editar-recorrente': (el) => depois(editarRecorrente(recorrente(el), listas)),
    'alternar-recorrente': (el) => {
      const r = recorrente(el);
      depois(db.alterar('contas_recorrentes', [['id', 'eq', r.id]], { ativo: !r.ativo }, 'id')
        .then(() => (r.ativo ? null : garantirContasDoMes(inicioDoMes(hoje()), { forcar: true })))
        .then(() => avisar(r.ativo ? 'Recorrente desativada: não gera mais contas.' : 'Recorrente reativada.')).then(() => true));
    },
    reembolsar: (el) => depois(marcarReembolso(dados.pendentes.find((p) => p.id === el.dataset.id), listas)),
    'novo-fornecedor': () => depois(editarFornecedor(null)),
    'editar-fornecedor': (el) => depois(editarFornecedor((dados.fornecedores ?? fornecedores).find((f) => f.id === el.dataset.id))),
  });
}

function topo(aba, mes) {
  const lanca = pode.lancar();
  const acoes = {
    mes: html`${seletorMes(mes)}${lanca ? html`<button type="button" class="botao botao--primario" data-acao="nova">Nova conta</button>` : ''}`,
    recorrentes: lanca ? html`<button type="button" class="botao botao--primario" data-acao="nova-recorrente">Nova recorrente</button>` : '',
    reembolsos: '',
    fornecedores: lanca ? html`<button type="button" class="botao botao--primario" data-acao="novo-fornecedor">Novo fornecedor</button>` : '',
  };
  return html`
    ${cabecalho('Contas do escritório', 'Despesas, pagamentos, contas fixas e reembolsos', acoes[aba])}
    ${lanca ? '' : html`<p class="nota nota--info">Seu acesso é de consulta: dá para ver tudo, sem lançar.</p>`}
    <nav class="abas" aria-label="Contas">
      ${ABAS.map(([valor, rotulo]) => html`
        <a href="#/financeiro/contas?aba=${valor}${valor === 'mes' ? `&mes=${mes}` : ''}" ${valor === aba ? html`aria-current="page"` : ''}>${rotulo}</a>`)}
    </nav>`;
}

// ---------------------------------------------------------------------------
// Carregar
// ---------------------------------------------------------------------------

const CARREGAR = {
  async mes(mes) {
    await garantirContasDoMes(mes);
    const fim = fimDoMes(mes);
    const atual = mes === inicioDoMes(hoje());
    const [doMes, atrasadas, pagosNoMes, previstas] = await Promise.all([
      db.todos('v_contas', { select: '*', filtros: [['competencia', 'eq', mes]] }),
      atual
        ? db.listar('v_contas', {
          select: '*',
          filtros: [['competencia', 'lt', mes], ['situacao', 'in', ['vencida', 'sem_valor']]],
          ordem: 'vencimento.asc,id.asc',
        })
        : [],
      db.todos('v_pagamentos_despesa', {
        select: 'id,valor,data,conta_id,competencia,estornado_em',
        filtros: [['data', 'gte', mes], ['data', 'lte', fim], ['estornado_em', 'is', null]],
      }),
      db.rpc('previsao_recorrentes', { p_de: mes, p_ate: fim }),
    ]);
    doMes.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao));
    return { mes, contas: [...doMes, ...atrasadas], doMes, atrasadas, pagosNoMes, previstas };
  },

  async recorrentes() {
    return { recorrentes: await db.listar('contas_recorrentes', { select: '*', ordem: 'ativo.desc,dia_vencimento.asc,descricao.asc' }) };
  },

  // Pendentes, todos — um reembolso antigo esquecido é justamente o que esta
  // aba existe para mostrar. Feitos, os últimos.
  async reembolsos() {
    const [pendentes, feitos] = await Promise.all([
      db.todos('v_pagamentos_despesa', {
        select: '*',
        filtros: [['pago_por_id', 'not.is', null], ['estornado_em', 'is', null], ['reembolsado_em', 'is', null]],
      }),
      db.listar('v_pagamentos_despesa', {
        select: '*',
        filtros: [['pago_por_id', 'not.is', null], ['estornado_em', 'is', null], ['reembolsado_em', 'not.is', null]],
        ordem: 'reembolsado_em.desc,id.asc',
        limite: 30,
      }),
    ]);
    pendentes.sort((a, b) => b.data.localeCompare(a.data));
    return { pendentes, feitos };
  },

  async fornecedores() {
    return { fornecedores: await db.listar('fornecedores', { select: '*', ordem: 'ativo.desc,nome.asc' }) };
  },
};

// ---------------------------------------------------------------------------
// Desenhar
// ---------------------------------------------------------------------------

const DESENHAR = {
  mes({ mes, doMes, atrasadas, pagosNoMes, previstas }, listas) {
    const validas = doMes.filter((c) => c.situacao !== 'cancelada');
    const abertas = validas.filter((c) => c.situacao !== 'paga');
    const semValor = abertas.filter((c) => c.valor == null).length;
    const pago = somaCentavos(pagosNoMes, 'valor');
    const previsto = somaCentavos(validas, 'valor') + somaCentavos(previstas, 'valor');
    const aPagar = abertas.reduce((s, c) => s + centavos(c.saldo ?? c.valor), 0);

    const porCategoria = new Map();
    const nomeCategoria = (id) => listas.categorias.find((k) => k.id === id)?.nome ?? '—';
    for (const c of [...validas, ...previstas.map((p) => ({ ...p, categoria_nome: nomeCategoria(p.categoria_id), pago_total: 0 }))]) {
      const linha = porCategoria.get(c.categoria_nome) ?? { previsto: 0, pago: 0 };
      linha.previsto += centavos(c.valor);
      linha.pago += centavos(c.pago_total);
      porCategoria.set(c.categoria_nome, linha);
    }

    return html`
      <div class="indicadores">
        ${indicador('Previsto (competência)', moeda(previsto), `${plural(validas.length + previstas.length, 'conta', 'contas')}${semValor ? ` · ${semValor} sem valor ainda` : ''}`)}
        ${indicador('Pago no mês (caixa)', moeda(pago), `${plural(pagosNoMes.length, 'pagamento', 'pagamentos')} · de qualquer competência`,
          { tom: 'ok', href: `#/financeiro/relatorios?relatorio=pagamentos&de=${mes}&ate=${fimDoMes(mes)}` })}
        ${indicador('A pagar', moeda(aPagar), plural(abertas.length, 'conta em aberto', 'contas em aberto'),
          { tom: abertas.some((c) => c.situacao === 'vencida') ? 'perigo' : '' })}
      </div>

      ${atrasadas.length ? html`
        <section class="painel">
          <header class="painel__topo"><h2 class="painel__titulo perigo">Vencidas de meses anteriores</h2></header>
          ${tabelaContas(atrasadas)}
        </section>` : ''}

      <section class="painel${atrasadas.length ? ' secao' : ''}">
        ${doMes.length ? tabelaContas(doMes) : vazio('Nenhuma conta neste mês. Cadastre as fixas em "Recorrentes" e elas aparecem sozinhas.')}
      </section>

      ${previstas.length ? html`
        <section class="painel secao">
          <header class="painel__topo"><h2 class="painel__titulo">Previstas pelas recorrentes, ainda não geradas</h2></header>
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th></tr></thead>
              <tbody>${previstas.map((p) => html`
                <tr><td class="num">${data(p.vencimento)}</td>
                  <td>${p.descricao}${p.parcela_total ? html`<span class="sub">parcela ${p.parcela_numero} de ${p.parcela_total}</span>` : ''}</td>
                  <td>${nomeCategoria(p.categoria_id)}</td>
                  <td class="num">${p.valor != null ? moeda(centavos(p.valor)) : html`<span class="sub">variável</span>`}</td></tr>`)}
              </tbody>
            </table>
          </div>
          <p class="painel__rodape sub">A conta nasce quando alguém que lança abre o mês, ou no fechamento.</p>
        </section>` : ''}

      ${porCategoria.size ? html`
        <section class="painel secao">
          <header class="painel__topo"><h2 class="painel__titulo">Por categoria</h2></header>
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Categoria</th><th class="num">Previsto</th><th class="num">Pago</th></tr></thead>
              <tbody>
                ${[...porCategoria].sort((a, b) => b[1].previsto - a[1].previsto).map(([nome, v]) => html`
                  <tr><td>${nome}</td><td class="num">${moeda(v.previsto)}</td><td class="num">${moeda(v.pago)}</td></tr>`)}
              </tbody>
            </table>
          </div>
        </section>` : ''}`;
  },

  recorrentes({ recorrentes }, { categorias }) {
    const nomeCategoria = (id) => categorias.find((k) => k.id === id)?.nome ?? '—';
    const lanca = pode.lancar();
    return html`
      <p class="nota nota--info">
        Cada recorrente gera a obrigação do mês sozinha, no dia escolhido: todo mês, uma vez por ano
        ou parcelada em N meses. Sem valor, ela nasce "falta o valor", para preencher quando a conta chegar.
      </p>
      <section class="painel secao">
        ${recorrentes.length ? html`
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Descrição</th><th>Categoria</th><th>Frequência</th><th class="num">Dia</th><th class="num">Valor</th><th>Período</th><th>Situação</th>${lanca ? html`<th class="acoes"><span class="sr-only">Ações</span></th>` : ''}</tr></thead>
              <tbody>
                ${recorrentes.map((r) => html`
                  <tr class="${r.ativo ? '' : 'apagada'}">
                    <td>${r.descricao}<span class="sub">${TIPOS_DESPESA[r.tipo] ?? ''}</span></td>
                    <td>${nomeCategoria(r.categoria_id)}</td>
                    <td>${r.frequencia === 'anual' ? `Anual (${MESES[r.mes_referencia - 1]})` : r.frequencia === 'parcelada' ? `${r.quantidade}x` : 'Mensal'}</td>
                    <td class="num">${r.dia_vencimento}</td>
                    <td class="num">${r.frequencia === 'parcelada' ? html`${moeda(centavos(r.valor_total))}<span class="sub">total</span>`
                      : r.valor != null ? moeda(centavos(r.valor)) : html`<span class="sub">variável</span>`}</td>
                    <td>desde ${r.inicio.slice(5, 7)}/${r.inicio.slice(0, 4)}${r.fim ? ` até ${r.fim.slice(5, 7)}/${r.fim.slice(0, 4)}` : ''}</td>
                    <td>${r.ativo ? html`<span class="selo selo--ok">Ativa</span>` : html`<span class="selo">Desativada</span>`}</td>
                    ${lanca ? html`<td class="acoes">
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-recorrente" data-id="${r.id}">Editar</button>
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="alternar-recorrente" data-id="${r.id}">${r.ativo ? 'Desativar' : 'Reativar'}</button>
                    </td>` : ''}
                  </tr>`)}
              </tbody>
            </table>
          </div>` : vazio('Nenhuma conta recorrente. Comece por aluguel, energia e internet.')}
      </section>`;
  },

  reembolsos({ pendentes, feitos }) {
    const porSocio = new Map();
    for (const p of pendentes) porSocio.set(p.pago_por_id, (porSocio.get(p.pago_por_id) ?? 0) + centavos(p.valor));

    return html`
      ${porSocio.size ? html`
        <div class="indicadores">
          ${[...porSocio].map(([id, total]) => indicador(nomeDe(id), moeda(total), 'a reembolsar'))}
        </div>` : ''}
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">A reembolsar</h2></header>
        ${pendentes.length ? tabelaReembolsos(pendentes, true) : vazio('Nenhum reembolso pendente.')}
      </section>
      ${feitos.length ? html`
        <section class="painel secao">
          <header class="painel__topo"><h2 class="painel__titulo">Reembolsados recentemente</h2></header>
          ${tabelaReembolsos(feitos, false)}
        </section>` : ''}
      <p class="sub secao">A despesa conta uma vez, no mês em que o sócio pagou. O reembolso é o dinheiro voltando para ele: sai de uma conta financeira, sem virar despesa de novo.</p>`;
  },

  fornecedores({ fornecedores }) {
    const lanca = pode.lancar();
    return html`
      <section class="painel">
        ${fornecedores.length ? html`
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Fornecedor</th><th>CPF/CNPJ</th><th>Contato</th><th>Situação</th>${lanca ? html`<th class="acoes"><span class="sr-only">Ações</span></th>` : ''}</tr></thead>
              <tbody>${fornecedores.map((f) => html`
                <tr class="${f.ativo ? '' : 'apagada'}">
                  <td>${f.nome}${f.observacoes ? html`<span class="sub">${f.observacoes}</span>` : ''}</td>
                  <td>${f.documento ?? '—'}</td>
                  <td>${f.contato ?? '—'}</td>
                  <td>${f.ativo ? html`<span class="selo selo--ok">Ativo</span>` : html`<span class="selo">Inativo</span>`}</td>
                  ${lanca ? html`<td class="acoes"><button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-fornecedor" data-id="${f.id}">Editar</button></td>` : ''}
                </tr>`)}
              </tbody>
            </table>
          </div>` : vazio('Nenhum fornecedor cadastrado. Ele é opcional na despesa.')}
      </section>`;
  },
};

function tabelaContas(contas) {
  const lanca = pode.lancar();
  return html`
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Saldo</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr>
        </thead>
        <tbody>
          ${contas.map((c) => html`
            <tr class="${c.situacao === 'cancelada' ? 'apagada' : ''}">
              <td class="num">${data(c.vencimento)}${c.competencia_manual ? html`<span class="sub">comp. ${c.competencia.slice(5, 7)}/${c.competencia.slice(0, 4)}</span>` : ''}</td>
              <td>${c.descricao}<span class="sub">${[
                c.parcela_total ? `parcela ${c.parcela_numero} de ${c.parcela_total}` : c.recorrente_id ? 'recorrente' : null,
                TIPOS_DESPESA[c.tipo], c.fornecedor_nome, c.centro_custo_nome, c.observacao, c.motivo_cancelamento,
              ].filter(Boolean).join(' · ')}</span></td>
              <td>${c.categoria_nome}</td>
              <td class="num">${c.valor != null ? moeda(centavos(c.valor)) : '—'}</td>
              <td class="num">${Number(c.pago_total) ? moeda(centavos(c.pago_total)) : '—'}${c.ultimo_pagamento ? html`<span class="sub">${data(c.ultimo_pagamento)}</span>` : ''}</td>
              <td class="num">${c.saldo != null && c.situacao !== 'paga' ? moeda(centavos(c.saldo)) : '—'}</td>
              <td>${seloConta(c.situacao)}${c.parcial ? html` <span class="selo selo--alerta">Paga em parte</span>` : ''}${c.vence_hoje && c.situacao === 'a_pagar' ? html` <span class="selo selo--alerta">Vence hoje</span>` : ''}</td>
              <td class="acoes">
                ${c.situacao !== 'cancelada' && lanca ? html`
                  ${!['paga', 'sem_valor'].includes(c.situacao) ? html`<button type="button" class="botao botao--pequeno" data-acao="pagar" data-id="${c.id}">Pagar</button>` : ''}
                  <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar" data-id="${c.id}">Editar</button>` : ''}
                ${Number(c.pagamentos) ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="pagamentos" data-id="${c.id}">Pagamentos</button>` : ''}
                <button type="button" class="botao botao--pequeno botao--discreto" data-acao="anexos" data-id="${c.id}">Anexos</button>
                ${c.situacao !== 'cancelada' && lanca && !Number(c.pagamentos) ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="cancelar" data-id="${c.id}">Cancelar</button>` : ''}
                <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${c.id}">Histórico</button>
              </td>
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

function tabelaReembolsos(lista, pendente) {
  return html`
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Sócio</th><th>Despesa</th><th>Pago em</th><th class="num">Valor</th><th>${pendente ? html`<span class="sr-only">Ações</span>` : 'Reembolsado'}</th></tr></thead>
        <tbody>
          ${lista.map((p) => html`
            <tr>
              <td>${nomeDe(p.pago_por_id)}</td>
              <td>${p.descricao}<span class="sub">${p.categoria_nome}${p.origem === 'legado' ? ' · lançado antes de 08/10/2026' : ''}</span></td>
              <td class="num">${data(p.data)}</td>
              <td class="num">${moeda(centavos(p.valor))}</td>
              <td class="${pendente ? 'acoes' : ''}">
                ${pendente
                  ? pode.lancar() ? html`<button type="button" class="botao botao--pequeno" data-acao="reembolsar" data-id="${p.id}">Reembolsar</button>` : ''
                  : html`${data(p.reembolsado_em)}${p.reembolso_conta_financeira_id ? '' : html`<span class="sub">origem legada</span>`}`}
              </td>
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

const opcoesFornecedores = (fornecedores, atual) => opcoes(
  fornecedores.filter((f) => f.ativo || f.id === atual).map((f) => [f.id, f.nome]), atual, { vazio: 'Não informado' });
const opcoesCentros = (centros, atual) => opcoes(
  centros.filter((c) => c.ativo || c.id === atual).map((c) => [c.id, c.nome]), atual, { vazio: 'Não informado' });

function editarConta(c, { categorias, fornecedores, centros }, mes) {
  const dia = hoje();
  const nova = !c;
  const comPagamento = Number(c?.pagamentos) > 0;
  const vencimentoPadrao = mes === inicioDoMes(dia) ? dia : mes;

  return abrirDialogo({
    titulo: nova ? 'Nova conta' : 'Editar conta',
    rotuloOk: nova ? 'Lançar conta' : 'Salvar',
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Descrição</span>
          <input name="descricao" value="${c?.descricao ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo campo--4"><span>Categoria</span>
          <select name="categoria_id" required>${opcoes(categorias.filter((k) => k.ativo || k.id === c?.categoria_id).map((k) => [k.id, k.nome]), c?.categoria_id, { vazio: 'Escolha' })}</select></label>
        <label class="campo campo--4"><span>Tipo</span><select name="tipo">${opcoes(Object.entries(TIPOS_DESPESA), c?.tipo ?? 'variavel')}</select></label>
        <label class="campo campo--4"><span>Fornecedor</span><select name="fornecedor_id">${opcoesFornecedores(fornecedores, c?.fornecedor_id)}</select></label>
        <label class="campo campo--4"><span>Centro de custo</span><select name="centro_custo_id">${opcoesCentros(centros, c?.centro_custo_id)}</select></label>
        <label class="campo campo--4"><span>Valor da conta</span>
          <input name="valor" class="num" inputmode="decimal" value="${c?.valor != null ? decimal(centavos(c.valor)) : ''}" placeholder="0,00">
          ${comPagamento ? html`<span class="campo__ajuda">Já pago: ${moeda(centavos(c.pago_total))}. Não pode ficar abaixo disso.</span>` : ''}</label>
        <label class="campo campo--4"><span>Vencimento</span><input type="date" name="vencimento" value="${c?.vencimento ?? vencimentoPadrao}" required></label>
        <label class="campo campo--4"><span>Competência (mês da despesa)</span>
          <input type="month" name="competencia" value="${(c?.competencia ?? inicioDoMes(c?.vencimento ?? vencimentoPadrao)).slice(0, 7)}" ${c?.recorrente_id ? 'disabled' : ''}>
          <span class="campo__ajuda">${c?.recorrente_id ? 'Fixada pela recorrente.' : 'Muda sozinha com o vencimento, até você escolher outra.'}</span></label>
        <label class="campo campo--8" data-papel="motivo" hidden><span>Motivo da mudança de valor</span>
          <input name="motivo_ajuste" maxlength="500" placeholder="Ex.: reajuste do aluguel; fatura corrigida"></label>
        <label class="campo"><span>Observação</span><input name="observacao" value="${c?.observacao ?? ''}" maxlength="500"></label>
        ${nova ? html`<label class="opcao campo"><input type="checkbox" name="pagar_agora"> Registrar o pagamento logo depois de lançar</label>` : ''}
      </div>
      ${c?.recorrente_id ? html`<p class="sub secao">Conta gerada por uma recorrente. O que mudar aqui vale só para este mês.</p>` : ''}`,

    aoAbrir: (dialogo, form) => {
      const valorOriginal = c?.valor != null ? centavos(c.valor) : null;
      // A competência acompanha o vencimento até a pessoa escolher outra.
      form.vencimento.addEventListener('change', () => {
        if (!form.dataset.competenciaTocada && !c?.competencia_manual && !c?.recorrente_id && form.vencimento.value) {
          form.competencia.value = form.vencimento.value.slice(0, 7);
        }
      });
      form.valor.addEventListener('input', () => {
        const pede = comPagamento && lerMoeda(form.valor.value) !== valorOriginal;
        $('[data-papel="motivo"]', dialogo).hidden = !pede;
        form.motivo_ajuste.required = pede;
      });
      form.dataset.competenciaTocada = '';
      form.competencia.addEventListener('input', () => { form.dataset.competenciaTocada = '1'; });
    },

    aoEnviar: async (d, form) => {
      const valor = lerMoeda(d.valor);
      if (Number.isNaN(valor) || (valor != null && valor <= 0)) throw new Error('Valor inválido.');
      if (valor == null && nova) throw new Error('Informe o valor (só a recorrente nasce sem valor).');

      const registro = {
        descricao: d.descricao,
        categoria_id: d.categoria_id,
        tipo: d.tipo,
        fornecedor_id: d.fornecedor_id || null,
        centro_custo_id: d.centro_custo_id || null,
        valor: valor == null ? null : paraReais(valor),
        vencimento: d.vencimento,
        observacao: d.observacao || null,
      };
      // Competência escolhida à mão: fica onde está, mesmo mudando o vencimento.
      if (!c?.recorrente_id && d.competencia) {
        const escolhida = `${d.competencia}-01`;
        if (form.dataset.competenciaTocada || c?.competencia_manual || escolhida !== inicioDoMes(d.vencimento)) {
          registro.competencia = escolhida;
          registro.competencia_manual = escolhida !== inicioDoMes(d.vencimento);
        }
      }
      if (d.motivo_ajuste) registro.motivo_ajuste = d.motivo_ajuste;

      const salva = nova
        ? await db.inserir('contas', registro, '*')
        : await db.alterar('contas', [['id', 'eq', c.id]], registro, '*');
      const outroMes = salva?.competencia && salva.competencia !== (nova ? mes : c.competencia);
      avisar(outroMes
        ? `Conta ${nova ? 'lançada' : 'salva'} em ${nomeDoMes(salva.competencia)}.`
        : (nova ? 'Conta lançada.' : 'Conta salva.'));
      if (nova && d.pagar_agora) {
        const completa = await db.um('v_contas', { select: '*', filtros: [['id', 'eq', salva.id]] });
        await pagarConta(completa, await apoio());
      }
      return true;
    },
  });
}

const quemPagou = (atual) => opcoes(
  membrosAtivos().map((m) => [m.id, `${m.nome_curto} — do próprio bolso, reembolsar`]),
  atual,
  { vazio: 'Ninguém: saiu de uma conta do escritório' },
);

/** Pagamento de uma despesa — integral ou parcial. */
export function pagarConta(c, { formas, contasFinanceiras }) {
  const dia = hoje();
  const saldo = centavos(c.saldo ?? c.valor);
  // Um clique duplo ou a rede caindo não gera dois pagamentos: o pedido
  // repetido tem a mesma chave, e o banco devolve o mesmo pagamento.
  const chave = crypto.randomUUID();

  return abrirDialogo({
    titulo: `Pagar — ${c.descricao}`,
    rotuloOk: 'Registrar pagamento',
    corpo: html`
      <p class="dialogo__texto">Valor da conta ${moeda(centavos(c.valor))}${Number(c.pago_total) ? ` · já pago ${moeda(centavos(c.pago_total))}` : ''} · <strong>saldo ${moeda(saldo)}</strong> · vence ${data(c.vencimento)}</p>
      <div class="campos">
        <label class="campo campo--6"><span>Valor pago agora</span>
          <input name="valor" class="num" inputmode="decimal" value="${decimal(saldo)}" required autofocus></label>
        <label class="campo campo--6"><span>Pago em</span><input type="date" name="data" value="${dia}" max="${dia}" required></label>
        <label class="campo campo--6"><span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), c.forma_id, { vazio: 'Não informada' })}</select></label>
        <label class="campo campo--6"><span>Quem pagou</span><select name="pago_por_id">${quemPagou(null)}</select></label>
        <label class="campo campo--6" data-papel="conta"><span>Saiu da conta</span>
          <select name="conta_financeira_id">${opcoesContasFinanceiras(contasFinanceiras)}</select></label>
        <label class="campo campo--6"><span>Observação</span><input name="observacao" maxlength="500"></label>
        <label class="opcao campo"><input type="checkbox" name="comprovante"> Anexar o comprovante depois de registrar</label>
      </div>
      <p class="nota nota--info" data-papel="efeito"></p>`,
    aoAbrir: (dialogo, form) => {
      const efeito = () => {
        const v = lerMoeda(form.valor.value);
        const caixa = $('[data-papel="efeito"]', dialogo);
        caixa.classList.toggle('nota--perigo', v > saldo);
        caixa.textContent = !(v > 0) ? 'Informe o valor pago.'
          : v > saldo ? `Passa do saldo (${moeda(saldo)}). Se a conta ficou maior, corrija o valor dela antes, em Editar.`
            : v < saldo ? `Pagamento parcial: ficam ${moeda(saldo - v)} em aberto nesta conta.`
              : 'Quita a conta.';
      };
      const origem = () => {
        const socio = Boolean(form.pago_por_id.value);
        $('[data-papel="conta"]', dialogo).hidden = socio;
        form.conta_financeira_id.disabled = socio;
      };
      form.valor.addEventListener('input', efeito);
      form.pago_por_id.addEventListener('change', origem);
      efeito();
      origem();
    },
    aoEnviar: async (d) => {
      const valor = lerMoeda(d.valor);
      if (!(valor > 0)) throw new Error('Informe o valor pago.');
      if (valor > saldo) throw new Error(`O pagamento passa do saldo da conta (${moeda(saldo)}).`);
      const r = await db.rpc('registrar_pagamento_despesa', {
        p: {
          conta_id: c.id,
          valor: paraReais(valor),
          data: d.data,
          forma_id: d.forma_id || null,
          pago_por_id: d.pago_por_id || null,
          conta_financeira_id: d.pago_por_id ? null : d.conta_financeira_id || null,
          observacao: d.observacao || null,
          chave,
        },
      });
      avisar(Number(r.saldo) > 0 ? `Pagamento parcial registrado. Saldo: ${moeda(centavos(r.saldo))}.` : 'Pagamento registrado. Conta quitada.');
      if (d.comprovante) {
        await abrirAnexos({ titulo: `pagamento de ${c.descricao}`, destino: { pagamento_despesa_id: r.pagamento_id }, podeGravar: true, categoria: 'comprovante' });
      }
      return true;
    },
  });
}

/** Os pagamentos de uma despesa, com estorno e comprovantes. */
async function verPagamentos(c, listas) {
  let mudou = false;
  const carregar = () => db.listar('v_pagamentos_despesa', {
    select: '*', filtros: [['conta_id', 'eq', c.id]], ordem: 'data.asc,criado_em.asc',
  });
  let lista = await carregar();

  const corpo = () => html`
    <p class="dialogo__texto">Valor da conta ${moeda(centavos(c.valor))} · competência ${c.competencia.slice(5, 7)}/${c.competencia.slice(0, 4)}</p>
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Data</th><th class="num">Valor</th><th>Origem do dinheiro</th><th>Lançado por</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${lista.map((p) => html`
          <tr class="${p.estornado_em ? 'apagada' : ''}">
            <td class="num">${data(p.data)}${p.forma_nome ? html`<span class="sub">${p.forma_nome}</span>` : ''}</td>
            <td class="num">${moeda(centavos(p.valor))}</td>
            <td>${p.pago_por_id ? `${nomeDe(p.pago_por_id)} (do bolso)${p.reembolsado_em ? ` · reembolsado em ${data(p.reembolsado_em)}` : ''}` : nomeContaFinanceira(p.conta_financeira_nome)}
              ${p.observacao ? html`<span class="sub">${p.observacao}</span>` : ''}
              ${p.estornado_em ? html`<span class="sub">Estornado por ${nomeDe(p.estornado_por)} em ${dataHora(p.estornado_em)}: ${p.motivo_estorno}</span>` : ''}</td>
            <td>${p.origem === 'legado' ? html`${nomeDe(p.legado_registrado_por)}<span class="sub">antes de 08/10/2026</span>` : html`${nomeDe(p.criado_por)}<span class="sub">${dataHora(p.criado_em)}</span>`}</td>
            <td class="acoes">
              <button type="button" class="botao botao--pequeno botao--discreto" data-acao="comprovantes" data-id="${p.id}">Comprovantes</button>
              ${!p.estornado_em && pode.lancar() ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="estornar" data-id="${p.id}">Estornar</button>` : ''}
            </td>
          </tr>`)}
        </tbody>
      </table>
    </div>
    <p class="sub secao">Estornar não apaga: o pagamento fica visível, riscado, com o motivo. O mês dele precisa estar aberto.</p>`;

  await abrirDialogo({
    titulo: `Pagamentos — ${c.descricao}`,
    largo: true,
    somenteLeitura: true,
    corpo: html`<div data-papel="pagamentos">${corpo()}</div>`,
    aoAbrir: (dialogo) => {
      const redesenhar = async () => {
        lista = await carregar();
        desenhar($('[data-papel="pagamentos"]', dialogo), corpo());
      };
      aoClicar(dialogo, {
        comprovantes: (el) => abrirAnexos({ titulo: 'pagamento', destino: { pagamento_despesa_id: el.dataset.id }, podeGravar: pode.lancar(), categoria: 'comprovante' }),
        estornar: async (el) => {
          const p = lista.find((x) => x.id === el.dataset.id);
          const motivo = await pedirMotivo({
            titulo: 'Estornar pagamento',
            texto: `O pagamento de ${moeda(centavos(p.valor))} em ${data(p.data)} deixa de contar e o saldo volta para a conta.`,
            rotuloOk: 'Estornar',
          });
          if (!motivo) return;
          try {
            await db.rpc('estornar_pagamento_despesa', { p_id: p.id, p_motivo: motivo });
            mudou = true;
            avisar('Pagamento estornado.');
            await redesenhar();
          } catch (erro) {
            avisarErro(erro);
          }
        },
      });
    },
  });
  return mudou;
}

function editarRecorrente(r, { categorias, formas, fornecedores, centros }) {
  const nova = !r;
  const mesAtual = hoje().slice(0, 7);
  const f = r?.frequencia ?? 'mensal';

  return abrirDialogo({
    titulo: nova ? 'Nova conta recorrente' : 'Editar conta recorrente',
    rotuloOk: nova ? 'Criar' : 'Salvar',
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Descrição</span>
          <input name="descricao" value="${r?.descricao ?? ''}" required maxlength="200" autofocus placeholder="Ex.: Aluguel da sala"></label>
        <label class="campo campo--4"><span>Categoria</span>
          <select name="categoria_id" required>${opcoes(categorias.filter((k) => k.ativo || k.id === r?.categoria_id).map((k) => [k.id, k.nome]), r?.categoria_id, { vazio: 'Escolha' })}</select></label>
        <label class="campo campo--4"><span>Frequência</span>
          <select name="frequencia" ${nova ? '' : 'disabled'}>${opcoes(Object.entries(FREQUENCIAS), f)}</select></label>
        <label class="campo campo--4"><span>Tipo</span><select name="tipo">${opcoes(Object.entries(TIPOS_DESPESA), r?.tipo ?? 'fixa')}</select></label>
        <label class="campo campo--4"><span>Dia do vencimento</span>
          <input type="number" name="dia" min="1" max="31" value="${r?.dia_vencimento ?? 10}" required>
          <span class="campo__ajuda">Dia 31 cai no último dia dos meses mais curtos.</span></label>
        <label class="campo campo--4" data-freq="anual"><span>Mês do ano</span>
          <select name="mes_referencia">${opcoes(MESES.map((m, i) => [i + 1, m]), r?.mes_referencia ?? Number(mesAtual.slice(5, 7)))}</select></label>
        <label class="campo campo--4" data-freq="mensal anual"><span>Valor</span>
          <input name="valor" class="num" inputmode="decimal" value="${r?.valor != null ? decimal(centavos(r.valor)) : ''}" placeholder="Vazio se muda todo mês"></label>
        <label class="campo campo--4" data-freq="parcelada"><span>Valor total</span>
          <input name="valor_total" class="num" inputmode="decimal" value="${r?.valor_total != null ? decimal(centavos(r.valor_total)) : ''}"></label>
        <label class="campo campo--4" data-freq="parcelada"><span>Em quantas vezes</span>
          <input type="number" name="quantidade" min="2" max="120" value="${r?.quantidade ?? 3}" ${nova ? '' : 'disabled'}></label>
        <label class="campo campo--4"><span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((x) => x.ativo || x.id === r?.forma_id).map((x) => [x.id, x.nome]), r?.forma_id, { vazio: 'Não informada' })}</select></label>
        <label class="campo campo--4"><span>Fornecedor</span><select name="fornecedor_id">${opcoesFornecedores(fornecedores, r?.fornecedor_id)}</select></label>
        <label class="campo campo--4"><span>Centro de custo</span><select name="centro_custo_id">${opcoesCentros(centros, r?.centro_custo_id)}</select></label>
        <label class="campo campo--6"><span>Começa em</span>
          <input type="month" name="inicio" value="${r?.inicio?.slice(0, 7) ?? mesAtual}" ${nova ? 'required' : 'disabled'}></label>
        <label class="campo campo--6" data-freq="mensal anual"><span>Termina em</span>
          <input type="month" name="fim" value="${r?.fim?.slice(0, 7) ?? ''}">
          <span class="campo__ajuda">Vazio: sem data para acabar.</span></label>
        <p class="campo sub" data-papel="previa-parcelas"></p>
      </div>
      ${nova ? '' : html`<p class="sub secao">Vale para as próximas contas geradas. Depois de salvar, o sistema mostra as já geradas em aberto que ainda podem mudar.</p>`}`,

    aoAbrir: (dialogo, form) => {
      const ajustar = () => {
        const freq = form.frequencia.value;
        for (const el of dialogo.querySelectorAll('[data-freq]')) el.hidden = !el.dataset.freq.split(' ').includes(freq);
        form.valor_total.required = freq === 'parcelada';
        const previa = $('[data-papel="previa-parcelas"]', dialogo);
        const total = lerMoeda(form.valor_total.value);
        const q = Number(form.quantidade.value);
        if (freq === 'parcelada' && total > 0 && q >= 2) {
          const cada = Math.floor(total / q);
          previa.textContent = `${q - 1} × ${moeda(cada)} + última de ${moeda(total - cada * (q - 1))}.`;
        } else previa.textContent = '';
      };
      form.addEventListener('input', ajustar);
      ajustar();
    },

    aoEnviar: async (d, form) => {
      const freq = form.frequencia.value;
      const valor = lerMoeda(d.valor);
      if (Number.isNaN(valor) || (valor != null && valor <= 0)) throw new Error('Valor inválido.');
      const dia = Number(d.dia);
      if (!(dia >= 1 && dia <= 31)) throw new Error('O dia vai de 1 a 31.');
      const inicio = nova ? `${d.inicio}-01` : r.inicio;
      const fim = freq !== 'parcelada' && d.fim ? `${d.fim}-01` : null;
      if (fim && fim < inicio) throw new Error('O fim não pode ser antes do começo.');

      const registro = {
        descricao: d.descricao,
        categoria_id: d.categoria_id,
        tipo: d.tipo,
        dia_vencimento: dia,
        forma_id: d.forma_id || null,
        fornecedor_id: d.fornecedor_id || null,
        centro_custo_id: d.centro_custo_id || null,
      };
      if (freq === 'parcelada') {
        const total = lerMoeda(d.valor_total);
        if (!(total > 0)) throw new Error('Informe o valor total.');
        Object.assign(registro, { valor_total: paraReais(total) });
        if (nova) registro.quantidade = Number(form.quantidade.value);
      } else {
        Object.assign(registro, { valor: valor == null ? null : paraReais(valor), fim });
        if (freq === 'anual') registro.mes_referencia = Number(d.mes_referencia);
      }

      if (nova) {
        await db.inserir('contas_recorrentes', { ...registro, frequencia: freq, inicio }, 'id');
        await garantirContasDoMes(inicioDoMes(hoje()), { forcar: true });
        avisar('Recorrente criada.');
        return true;
      }
      await db.alterar('contas_recorrentes', [['id', 'eq', r.id]], registro, 'id');
      avisar('Recorrente salva.');
      await oferecerImpacto(r.id);
      return true;
    },
  });
}

/** Depois de mudar a recorrente: as contas já geradas, em aberto, que ainda podem acompanhar. */
async function oferecerImpacto(id) {
  const afetadas = await db.rpc('impacto_recorrente', { p_id: id });
  if (!afetadas.length) return;
  const ok = await abrirDialogo({
    titulo: 'Atualizar as contas já geradas?',
    rotuloOk: `Atualizar ${plural(afetadas.length, 'conta', 'contas')}`,
    corpo: html`
      <p class="dialogo__texto">Estas contas desta recorrente já existem, estão sem pagamento e em mês aberto. Elas podem passar a usar o valor e os dados novos:</p>
      <ul class="lista">${afetadas.map((a) => html`<li class="lista__item"><span>${a.descricao}<span class="sub">vence ${data(a.vencimento)}</span></span><span class="num">${a.valor != null ? moeda(centavos(a.valor)) : '—'}</span></li>`)}</ul>
      <p class="sub">Contas pagas, em parte ou no todo, e meses fechados nunca mudam.</p>`,
  });
  if (!ok) return;
  const n = await db.rpc('aplicar_recorrente_em_abertas', { p_id: id });
  avisar(`${plural(n, 'conta atualizada', 'contas atualizadas')}.`);
}

function marcarReembolso(p, { contasFinanceiras }) {
  const dia = hoje();
  return abrirDialogo({
    titulo: 'Reembolsar o sócio',
    rotuloOk: 'Registrar reembolso',
    corpo: html`
      <p class="dialogo__texto">${nomeDe(p.pago_por_id)} pagou ${p.descricao} (${moeda(centavos(p.valor))}) em ${data(p.data)}.</p>
      <div class="campos">
        <label class="campo campo--6"><span>Reembolsado em</span><input type="date" name="data" value="${dia}" min="${p.data}" max="${dia}" required autofocus></label>
        <label class="campo campo--6"><span>Saiu da conta</span><select name="conta">${opcoesContasFinanceiras(contasFinanceiras)}</select></label>
      </div>
      <p class="sub secao">Registrado em ${dataHora(new Date().toISOString())}, com o seu nome (${estado.membro.nome_curto}).</p>`,
    aoEnviar: async (d) => {
      await db.rpc('registrar_reembolso', { p_id: p.id, p_data: d.data, p_conta_financeira: d.conta || null });
      avisar('Reembolso registrado.');
      return true;
    },
  });
}

function editarFornecedor(f) {
  return abrirDialogo({
    titulo: f ? 'Editar fornecedor' : 'Novo fornecedor',
    corpo: html`
      <div class="campos">
        <label class="campo"><span>Nome</span><input name="nome" value="${f?.nome ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo campo--6"><span>CPF/CNPJ (opcional)</span><input name="documento" value="${f?.documento ?? ''}" maxlength="18"></label>
        <label class="campo campo--6"><span>Contato</span><input name="contato" value="${f?.contato ?? ''}" maxlength="200"></label>
        <label class="campo"><span>Observações</span><input name="observacoes" value="${f?.observacoes ?? ''}" maxlength="500"></label>
        ${f ? html`<label class="opcao"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''}> Ativo</label>` : ''}
      </div>`,
    aoEnviar: async (d) => {
      const documento = d.documento.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (documento && !/^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$/.test(documento)) throw new Error('CPF/CNPJ com 11 ou 14 caracteres.');
      const registro = { nome: d.nome, documento: documento || null, contato: d.contato || null, observacoes: d.observacoes || null };
      if (f) await db.alterar('fornecedores', [['id', 'eq', f.id]], { ...registro, ativo: d.ativo }, 'id');
      else await db.inserir('fornecedores', registro, 'id');
      avisar(f ? 'Fornecedor salvo.' : 'Fornecedor cadastrado.');
      return true;
    },
  });
}
