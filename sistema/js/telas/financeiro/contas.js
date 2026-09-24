// Contas do escritório (preparação 6.4 D).
// ========================================
//
// O que sai: aluguel, luz, internet, café. As fixas nascem sozinhas todo mês
// (recorrentes); conta de valor variável nasce sem valor, para preencher
// quando chegar. Sócio que pagou do próprio bolso fica com reembolso a
// receber — e isso aparece no fechamento.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { membrosAtivos, nomeDe } from '../../nucleo/estado.js';
import {
  centavos, data, dataHora, decimal, hoje, inicioDoMes, lerMoeda, moeda, nomeDoMes, paraReais, somarMeses,
} from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, indicador, mesDaConsulta, plural, seletorMes, seloConta, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { apoio, garantirContasDoMes, opcoes, somaCentavos } from './base.js';

const ABAS = [['mes', 'Do mês'], ['recorrentes', 'Recorrentes'], ['reembolsos', 'Reembolsos a sócios']];

export default async function telaContas(ctx) {
  const aba = ABAS.some(([v]) => v === ctx.consulta.aba) ? ctx.consulta.aba : 'mes';
  let mes = mesDaConsulta(ctx.consulta.mes, inicioDoMes(hoje()));
  const { categorias, formas } = await apoio();
  let dados = {};

  const mostrar = async () => {
    dados = await CARREGAR[aba](mes);
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, html`${topo(aba, mes)}${DESENHAR[aba](dados, categorias)}`);
  };
  await mostrar();

  const depois = (promessa) => promessa.then((feito) => feito && mostrar()).catch(avisarErro);
  const conta = (el) => [...(dados.contas ?? []), ...(dados.pendentes ?? []), ...(dados.feitos ?? [])].find((c) => c.id === el.dataset.id);
  const recorrente = (el) => dados.recorrentes.find((r) => r.id === el.dataset.id);
  const trocarMes = (delta) => {
    mes = somarMeses(mes, delta);
    guardarConsulta({ aba, mes });
    mostrar().catch(avisarErro);
  };

  return aoClicar(ctx.raiz, {
    'mes-anterior': () => trocarMes(-1),
    'mes-seguinte': () => trocarMes(1),
    nova: () => depois(editarConta(null, { categorias, formas, mes })),
    editar: (el) => depois(editarConta(conta(el), { categorias, formas, mes })),
    pagar: (el) => depois(pagarConta(conta(el), formas)),
    historico: (el) => abrirHistorico({ titulo: conta(el).descricao, registros: [el.dataset.id] }),
    cancelar: async (el) => {
      const c = conta(el);
      const motivo = await pedirMotivo({ titulo: `Cancelar — ${c.descricao}`, rotuloOk: 'Cancelar conta' });
      if (motivo) {
        depois(db.alterar('contas', [['id', 'eq', c.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id')
          .then(() => avisar('Conta cancelada.')).then(() => true));
      }
    },
    'nova-recorrente': () => depois(editarRecorrente(null, { categorias, formas })),
    'editar-recorrente': (el) => depois(editarRecorrente(recorrente(el), { categorias, formas })),
    'alternar-recorrente': (el) => {
      const r = recorrente(el);
      depois(db.alterar('contas_recorrentes', [['id', 'eq', r.id]], { ativo: !r.ativo }, 'id')
        // Reativada, a conta deste mês já pode nascer.
        .then(() => (r.ativo ? null : garantirContasDoMes(inicioDoMes(hoje()), { forcar: true })))
        .then(() => avisar(r.ativo ? 'Recorrente desativada: não gera mais contas.' : 'Recorrente reativada.')).then(() => true));
    },
    reembolsado: (el) => depois(marcarReembolso(conta(el))),
  });
}

function topo(aba, mes) {
  const acoes = {
    mes: html`${seletorMes(mes)}<button type="button" class="botao botao--primario" data-acao="nova">Nova conta</button>`,
    recorrentes: html`<button type="button" class="botao botao--primario" data-acao="nova-recorrente">Nova recorrente</button>`,
    reembolsos: '',
  };
  return html`
    ${cabecalho('Contas do escritório', 'Despesas, contas fixas e reembolsos', acoes[aba])}
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
    const [contas, atrasadas] = await Promise.all([
      db.listar('v_contas', { select: '*', filtros: [['competencia', 'eq', mes]], ordem: 'vencimento.asc,descricao.asc' }),
      mes === inicioDoMes(hoje())
        ? db.listar('v_contas', {
          select: '*',
          filtros: [['competencia', 'lt', mes], ['situacao', 'in', ['vencida', 'sem_valor']]],
          ordem: 'vencimento.asc',
        })
        : [],
    ]);
    return { contas: [...contas, ...atrasadas], doMes: contas, atrasadas };
  },

  async recorrentes() {
    return { recorrentes: await db.listar('contas_recorrentes', { select: '*', ordem: 'ativo.desc,dia_vencimento.asc,descricao.asc' }) };
  },

  // Pendentes, todos — um reembolso antigo esquecido é justamente o que esta
  // tela existe para mostrar. Feitos, só os últimos.
  async reembolsos() {
    const [pendentes, feitos] = await Promise.all([
      db.todos('v_contas', {
        select: '*',
        filtros: [['pago_por_id', 'not.is', null], ['situacao', 'eq', 'paga'], ['reembolsado_em', 'is', null]],
      }),
      db.listar('v_contas', {
        select: '*',
        filtros: [['pago_por_id', 'not.is', null], ['situacao', 'eq', 'paga'], ['reembolsado_em', 'not.is', null]],
        ordem: 'reembolsado_em.desc',
        limite: 30,
      }),
    ]);
    pendentes.sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
    return { pendentes, feitos };
  },
};

// ---------------------------------------------------------------------------
// Desenhar
// ---------------------------------------------------------------------------

const DESENHAR = {
  mes({ doMes, atrasadas }) {
    const validas = doMes.filter((c) => c.situacao !== 'cancelada');
    const pagas = validas.filter((c) => c.situacao === 'paga');
    const abertas = validas.filter((c) => c.situacao !== 'paga');
    const semValor = abertas.filter((c) => c.valor == null).length;

    const porCategoria = new Map();
    for (const c of validas) {
      const linha = porCategoria.get(c.categoria_nome) ?? { previsto: 0, pago: 0 };
      linha.previsto += centavos(c.valor);
      if (c.situacao === 'paga') linha.pago += centavos(c.valor);
      porCategoria.set(c.categoria_nome, linha);
    }

    return html`
      <div class="indicadores">
        ${indicador('Previsto', moeda(somaCentavos(validas, 'valor')), `${plural(validas.length, 'conta', 'contas')}${semValor ? ` · ${semValor} sem valor ainda` : ''}`)}
        ${indicador('Pago', moeda(somaCentavos(pagas, 'valor')), plural(pagas.length, 'conta', 'contas'), { tom: 'ok' })}
        ${indicador('A pagar', moeda(somaCentavos(abertas, 'valor')), plural(abertas.length, 'conta', 'contas'),
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

  recorrentes({ recorrentes }, categorias) {
    const nomeCategoria = (id) => categorias.find((k) => k.id === id)?.nome ?? '—';
    return html`
      <p class="nota nota--info">
        Cada recorrente gera a conta do mês sozinha, no dia de vencimento escolhido. Sem valor,
        ela nasce "falta o valor", para preencher quando a conta chegar (luz, água).
      </p>
      <section class="painel secao">
        ${recorrentes.length ? html`
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Descrição</th><th>Categoria</th><th class="num">Dia</th><th class="num">Valor</th><th>Período</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>
                ${recorrentes.map((r) => html`
                  <tr class="${r.ativo ? '' : 'apagada'}">
                    <td>${r.descricao}</td>
                    <td>${nomeCategoria(r.categoria_id)}</td>
                    <td class="num">${r.dia_vencimento}</td>
                    <td class="num">${r.valor != null ? moeda(centavos(r.valor)) : html`<span class="sub">variável</span>`}</td>
                    <td>desde ${r.inicio.slice(5, 7)}/${r.inicio.slice(0, 4)}${r.fim ? ` até ${r.fim.slice(5, 7)}/${r.fim.slice(0, 4)}` : ''}</td>
                    <td>${r.ativo ? html`<span class="selo selo--ok">Ativa</span>` : html`<span class="selo">Desativada</span>`}</td>
                    <td class="acoes">
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-recorrente" data-id="${r.id}">Editar</button>
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="alternar-recorrente" data-id="${r.id}">${r.ativo ? 'Desativar' : 'Reativar'}</button>
                    </td>
                  </tr>`)}
              </tbody>
            </table>
          </div>` : vazio('Nenhuma conta recorrente. Comece por aluguel, energia e internet.')}
      </section>`;
  },

  reembolsos({ pendentes, feitos }) {
    const porSocio = new Map();
    for (const c of pendentes) porSocio.set(c.pago_por_id, (porSocio.get(c.pago_por_id) ?? 0) + centavos(c.valor));

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
        </section>` : ''}`;
  },
};

function tabelaContas(contas) {
  return html`
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th>Pagamento</th><th class="acoes"><span class="sr-only">Ações</span></th></tr>
        </thead>
        <tbody>
          ${contas.map((c) => html`
            <tr class="${c.situacao === 'cancelada' ? 'apagada' : ''}">
              <td class="num">${data(c.vencimento)}</td>
              <td>${c.descricao}<span class="sub">${[c.recorrente_id ? 'recorrente' : null, c.observacao, c.motivo_cancelamento].filter(Boolean).join(' · ')}</span></td>
              <td>${c.categoria_nome}</td>
              <td class="num">${c.valor != null ? moeda(centavos(c.valor)) : '—'}</td>
              <td>${seloConta(c.situacao)}</td>
              <td>${c.data_pagamento ? html`${data(c.data_pagamento)}<span class="sub">${[c.forma_nome, c.pago_por_id ? `pago por ${nomeDe(c.pago_por_id)}` : null].filter(Boolean).join(' · ')}</span>` : '—'}</td>
              <td class="acoes">
                ${c.situacao === 'cancelada' ? '' : html`
                  ${c.situacao !== 'paga' ? html`<button type="button" class="botao botao--pequeno" data-acao="pagar" data-id="${c.id}">Pagar</button>` : ''}
                  <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar" data-id="${c.id}">Editar</button>
                  <button type="button" class="botao botao--pequeno botao--discreto" data-acao="cancelar" data-id="${c.id}">Cancelar</button>`}
                <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${c.id}">Histórico</button>
              </td>
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

function tabelaReembolsos(contas, pendente) {
  return html`
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Sócio</th><th>Descrição</th><th>Pago em</th><th class="num">Valor</th><th>${pendente ? html`<span class="sr-only">Ações</span>` : 'Reembolsado em'}</th></tr></thead>
        <tbody>
          ${contas.map((c) => html`
            <tr>
              <td>${nomeDe(c.pago_por_id)}</td>
              <td>${c.descricao}<span class="sub">${c.categoria_nome}</span></td>
              <td class="num">${data(c.data_pagamento)}</td>
              <td class="num">${moeda(centavos(c.valor))}</td>
              <td class="${pendente ? 'acoes' : 'num'}">
                ${pendente ? html`<button type="button" class="botao botao--pequeno" data-acao="reembolsado" data-id="${c.id}">Reembolsado</button>` : data(c.reembolsado_em)}
              </td>
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

const quemPagou = (atual) => opcoes(
  membrosAtivos().map((m) => [m.id, `${m.nome_curto} — do próprio bolso, reembolsar`]),
  atual,
  { vazio: 'Caixa do escritório' },
);

function editarConta(c, { categorias, formas, mes }) {
  const dia = hoje();
  const nova = !c;
  const paga = Boolean(c?.data_pagamento);
  const vencimentoPadrao = mes === inicioDoMes(dia) ? dia : mes;

  return abrirDialogo({
    titulo: nova ? 'Nova conta' : 'Editar conta',
    rotuloOk: nova ? 'Lançar conta' : 'Salvar',
    corpo: html`
      <div class="campos">
        <label class="campo campo--8">
          <span>Descrição</span>
          <input name="descricao" value="${c?.descricao ?? ''}" required maxlength="200" autofocus>
        </label>
        <label class="campo campo--4">
          <span>Categoria</span>
          <select name="categoria_id" required>${opcoes(categorias.filter((k) => k.ativo || k.id === c?.categoria_id).map((k) => [k.id, k.nome]), c?.categoria_id, { vazio: 'Escolha' })}</select>
        </label>
        <label class="campo campo--4">
          <span>Valor</span>
          <input name="valor" class="num" inputmode="decimal" value="${c?.valor != null ? decimal(centavos(c.valor)) : ''}" placeholder="0,00">
        </label>
        <label class="campo campo--4">
          <span>Vencimento</span>
          <input type="date" name="vencimento" value="${c?.vencimento ?? vencimentoPadrao}" required>
        </label>
        <label class="opcao campo--4"><input type="checkbox" name="paga" ${paga ? 'checked' : ''}> Já está paga</label>
        <div class="campos" data-papel="pagamento" ${paga ? '' : 'hidden'}>
          <label class="campo campo--4">
            <span>Pago em</span>
            <input type="date" name="data_pagamento" value="${c?.data_pagamento ?? dia}" max="${dia}">
          </label>
          <label class="campo campo--4">
            <span>Forma</span>
            <select name="forma_id">${opcoes(formas.filter((f) => f.ativo || f.id === c?.forma_id).map((f) => [f.id, f.nome]), c?.forma_id, { vazio: 'Não informada' })}</select>
          </label>
          <label class="campo campo--4">
            <span>Quem pagou</span>
            <select name="pago_por_id">${quemPagou(c?.pago_por_id)}</select>
          </label>
        </div>
        <label class="campo">
          <span>Observação</span>
          <input name="observacao" value="${c?.observacao ?? ''}" maxlength="500">
        </label>
      </div>
      ${c?.recorrente_id ? html`<p class="sub secao">Conta gerada por uma recorrente. O que mudar aqui vale só para este mês.</p>` : ''}`,

    aoAbrir: (dialogo, form) => {
      form.paga.addEventListener('change', () => {
        dialogo.querySelector('[data-papel="pagamento"]').hidden = !form.paga.checked;
      });
    },

    aoEnviar: async (d) => {
      const valor = lerMoeda(d.valor);
      if (Number.isNaN(valor) || (valor != null && valor <= 0)) throw new Error('Valor inválido.');
      if (valor == null && (nova || d.paga)) throw new Error(d.paga ? 'Conta paga precisa de valor.' : 'Informe o valor.');
      if (d.paga && d.data_pagamento > hoje()) throw new Error('A data de pagamento não pode estar no futuro.');

      const registro = {
        descricao: d.descricao,
        categoria_id: d.categoria_id,
        valor: valor == null ? null : paraReais(valor),
        vencimento: d.vencimento,
        data_pagamento: d.paga ? d.data_pagamento : null,
        forma_id: d.paga ? d.forma_id || null : c?.forma_id ?? null,
        pago_por_id: d.paga ? d.pago_por_id || null : null,
        observacao: d.observacao || null,
      };
      if (!registro.pago_por_id) registro.reembolsado_em = null;

      const salva = nova
        ? await db.inserir('contas', registro, 'id,competencia')
        : await db.alterar('contas', [['id', 'eq', c.id]], registro, 'id,competencia');
      // Conta avulsa acompanha o mês do vencimento. Se foi para outro mês,
      // diz para onde — senão ela só some da lista que está aberta. A conta
      // já está gravada aqui: nada neste aviso pode falhar e deixar o diálogo
      // aberto, convidando a lançar de novo.
      const outroMes = salva?.competencia && salva.competencia !== (nova ? mes : c.competencia);
      avisar(outroMes
        ? `Conta ${nova ? 'lançada' : 'salva'} em ${nomeDoMes(salva.competencia)}.`
        : (nova ? 'Conta lançada.' : 'Conta salva.'));
      return true;
    },
  });
}

function pagarConta(c, formas) {
  const dia = hoje();
  return abrirDialogo({
    titulo: `Pagar — ${c.descricao}`,
    rotuloOk: 'Registrar pagamento',
    corpo: html`
      <div class="campos">
        <label class="campo campo--6">
          <span>Valor</span>
          <input name="valor" class="num" inputmode="decimal" value="${c.valor != null ? decimal(centavos(c.valor)) : ''}" required autofocus>
        </label>
        <label class="campo campo--6">
          <span>Pago em</span>
          <input type="date" name="data_pagamento" value="${dia}" max="${dia}" required>
        </label>
        <label class="campo campo--6">
          <span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((f) => f.ativo).map((f) => [f.id, f.nome]), c.forma_id, { vazio: 'Não informada' })}</select>
        </label>
        <label class="campo campo--6">
          <span>Quem pagou</span>
          <select name="pago_por_id">${quemPagou(null)}</select>
        </label>
      </div>`,
    aoEnviar: async (d) => {
      const valor = lerMoeda(d.valor);
      if (!(valor > 0)) throw new Error('Informe o valor pago.');
      await db.alterar('contas', [['id', 'eq', c.id]], {
        valor: paraReais(valor),
        data_pagamento: d.data_pagamento,
        forma_id: d.forma_id || null,
        pago_por_id: d.pago_por_id || null,
      }, 'id');
      avisar('Pagamento registrado.');
      return true;
    },
  });
}

function editarRecorrente(r, { categorias, formas }) {
  const nova = !r;
  const mesAtual = hoje().slice(0, 7);

  return abrirDialogo({
    titulo: nova ? 'Nova conta recorrente' : 'Editar conta recorrente',
    rotuloOk: nova ? 'Criar' : 'Salvar',
    corpo: html`
      <div class="campos">
        <label class="campo campo--8">
          <span>Descrição</span>
          <input name="descricao" value="${r?.descricao ?? ''}" required maxlength="200" autofocus placeholder="Ex.: Aluguel da sala">
        </label>
        <label class="campo campo--4">
          <span>Categoria</span>
          <select name="categoria_id" required>${opcoes(categorias.filter((k) => k.ativo || k.id === r?.categoria_id).map((k) => [k.id, k.nome]), r?.categoria_id, { vazio: 'Escolha' })}</select>
        </label>
        <label class="campo campo--4">
          <span>Dia do vencimento</span>
          <input type="number" name="dia" min="1" max="31" value="${r?.dia_vencimento ?? 10}" required>
          <span class="campo__ajuda">Dia 31 cai no último dia dos meses mais curtos.</span>
        </label>
        <label class="campo campo--4">
          <span>Valor</span>
          <input name="valor" class="num" inputmode="decimal" value="${r?.valor != null ? decimal(centavos(r.valor)) : ''}" placeholder="Vazio se muda todo mês">
        </label>
        <label class="campo campo--4">
          <span>Forma</span>
          <select name="forma_id">${opcoes(formas.filter((f) => f.ativo || f.id === r?.forma_id).map((f) => [f.id, f.nome]), r?.forma_id, { vazio: 'Não informada' })}</select>
        </label>
        <label class="campo campo--6">
          <span>Começa em</span>
          <input type="month" name="inicio" value="${r?.inicio?.slice(0, 7) ?? mesAtual}" ${nova ? 'required' : 'disabled'}>
        </label>
        <label class="campo campo--6">
          <span>Termina em</span>
          <input type="month" name="fim" value="${r?.fim?.slice(0, 7) ?? ''}">
          <span class="campo__ajuda">Vazio: sem data para acabar.</span>
        </label>
      </div>
      ${nova ? '' : html`<p class="sub secao">Vale para os próximos meses. Contas já geradas não mudam.</p>`}`,

    aoEnviar: async (d) => {
      const valor = lerMoeda(d.valor);
      if (Number.isNaN(valor) || (valor != null && valor <= 0)) throw new Error('Valor inválido.');
      const dia = Number(d.dia);
      if (!(dia >= 1 && dia <= 31)) throw new Error('O dia vai de 1 a 31.');
      const inicio = nova ? `${d.inicio}-01` : r.inicio;
      const fim = d.fim ? `${d.fim}-01` : null;
      if (fim && fim < inicio) throw new Error('O fim não pode ser antes do começo.');

      const registro = {
        descricao: d.descricao,
        categoria_id: d.categoria_id,
        dia_vencimento: dia,
        valor: valor == null ? null : paraReais(valor),
        forma_id: d.forma_id || null,
        fim,
      };
      if (nova) {
        await db.inserir('contas_recorrentes', { ...registro, inicio }, 'id');
        await garantirContasDoMes(inicioDoMes(hoje()), { forcar: true });
        avisar('Recorrente criada.');
      } else {
        await db.alterar('contas_recorrentes', [['id', 'eq', r.id]], registro, 'id');
        avisar('Recorrente salva.');
      }
      return true;
    },
  });
}

function marcarReembolso(c) {
  const dia = hoje();
  return abrirDialogo({
    titulo: 'Marcar como reembolsado',
    rotuloOk: 'Reembolsado',
    corpo: html`
      <p class="dialogo__texto">${nomeDe(c.pago_por_id)} pagou ${c.descricao} (${moeda(centavos(c.valor))}) em ${data(c.data_pagamento)}.</p>
      <label class="campo">
        <span>Reembolsado em</span>
        <input type="date" name="reembolsado_em" value="${dia}" max="${dia}" required autofocus>
      </label>
      <p class="sub secao">Registrado em ${dataHora(new Date().toISOString())}, com o seu nome.</p>`,
    aoEnviar: async ({ reembolsado_em: quando }) => {
      await db.alterar('contas', [['id', 'eq', c.id]], { reembolsado_em: quando }, 'id');
      avisar('Reembolso registrado.');
      return true;
    },
  });
}
