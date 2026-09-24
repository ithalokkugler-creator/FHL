// Relatórios e exportação (preparação 6.4 F).
// ============================================
//
// Os lançamentos do período, para ler (imprimir/PDF) e para o contador
// (planilha que abre certa no Excel). E a cópia de segurança completa — o "e
// se o site sair do ar" do Vinícius.
//
// O RESUMO DO MÊS MORA NO FECHAMENTO. Entradas, saídas, resultado, composição
// e divisão entre os sócios estavam aqui e lá, iguais; o relatório mensal
// agora é só a lista, com um atalho para o fechamento. O anual continua com o
// resumo, porque não existe em outro lugar.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { baixarArquivo, gerarCsv } from '../../nucleo/csv.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, fimDoMes, hoje, mesAbreviado, moeda, nomeDoMes } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { nomeDaParcela } from '../../dominio/parcelas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, cabecalhoImpressao, capitalizar, indicador, plural, TIPOS_AVULSA, vazio } from '../comum.js';
import { somaCentavos } from './base.js';

export default async function telaRelatorios(ctx) {
  const dia = hoje();
  const periodo = {
    tipo: ctx.consulta.tipo === 'ano' ? 'ano' : 'mes',
    mes: /^\d{4}-\d{2}$/.test(ctx.consulta.mes ?? '') ? ctx.consulta.mes : dia.slice(0, 7),
    ano: /^\d{4}$/.test(ctx.consulta.ano ?? '') ? ctx.consulta.ano : dia.slice(0, 4),
  };
  let dados;

  desenhar(ctx.raiz, html`
    ${cabecalho('Relatórios', 'Lançamentos do período, para ler e para o contador', html`
      <button type="button" class="botao" data-acao="imprimir">Imprimir / PDF</button>
      <button type="button" class="botao" data-acao="copia">Cópia de segurança</button>`)}
    <form class="filtros">
      <label class="campo">
        <span>Período</span>
        <select name="tipo">
          <option value="mes" ${periodo.tipo === 'mes' ? 'selected' : ''}>Mensal</option>
          <option value="ano" ${periodo.tipo === 'ano' ? 'selected' : ''}>Anual</option>
        </select>
      </label>
      <label class="campo" data-papel="mes" ${periodo.tipo === 'mes' ? '' : 'hidden'}>
        <span>Mês</span>
        <input type="month" name="mes" value="${periodo.mes}">
      </label>
      <label class="campo" data-papel="ano" ${periodo.tipo === 'ano' ? '' : 'hidden'}>
        <span>Ano</span>
        <input type="number" name="ano" min="2020" max="2100" value="${periodo.ano}">
      </label>
    </form>
    <div data-papel="corpo"><p class="carregando">Carregando…</p></div>`);

  const form = $('form', ctx.raiz);
  const corpo = $('[data-papel="corpo"]', ctx.raiz);
  let pedido = 0;

  const mostrar = async () => {
    const este = ++pedido;
    const resultado = await carregar(periodo);
    if (este !== pedido || !ctx.ativa()) return;
    dados = resultado;
    desenhar(corpo, tela(dados));
  };

  form.addEventListener('input', () => {
    periodo.tipo = form.tipo.value;
    if (/^\d{4}-\d{2}$/.test(form.mes.value)) periodo.mes = form.mes.value;
    if (/^\d{4}$/.test(form.ano.value)) periodo.ano = form.ano.value;
    $('[data-papel="mes"]', form).hidden = periodo.tipo !== 'mes';
    $('[data-papel="ano"]', form).hidden = periodo.tipo !== 'ano';
    guardarConsulta(periodo);
    mostrar().catch(avisarErro);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await mostrar();

  return aoClicar(ctx.raiz, {
    imprimir: () => print(),
    'csv-entradas': () => baixarArquivo(`entradas-${dados.chave}.csv`, csvEntradas(dados.entradas)),
    'csv-saidas': () => baixarArquivo(`saidas-${dados.chave}.csv`, csvSaidas(dados.saidas)),
    copia: async (botao) => {
      botao.disabled = true;
      botao.textContent = 'Preparando…';
      try {
        const copia = await copiaDeSeguranca();
        baixarArquivo(`fhl-copia-de-seguranca-${hoje()}.json`, JSON.stringify(copia, null, 2), 'application/json');
        avisar('Cópia de segurança baixada.');
      } catch (erro) {
        avisarErro(erro);
      } finally {
        botao.disabled = false;
        botao.textContent = 'Cópia de segurança';
      }
    },
  });
}

async function carregar({ tipo, mes, ano }) {
  const de = tipo === 'mes' ? `${mes}-01` : `${ano}-01-01`;
  const ate = tipo === 'mes' ? fimDoMes(`${mes}-01`) : `${ano}-12-31`;

  const [entradas, saidas, serie] = await Promise.all([
    db.todos('v_recebimentos', {
      select: '*',
      filtros: [['data', 'gte', de], ['data', 'lte', ate], ['estornado_em', 'is', null]],
    }),
    db.todos('v_contas', {
      select: '*',
      filtros: [['situacao', 'eq', 'paga'], ['data_pagamento', 'gte', de], ['data_pagamento', 'lte', ate]],
    }),
    tipo === 'ano' ? db.rpc('serie_mensal', { p_ate: `${ano}-12-01`, p_meses: 12 }) : [],
  ]);
  // db.todos pagina pelo id; a leitura é por data.
  entradas.sort((a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em));
  saidas.sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento) || a.descricao.localeCompare(b.descricao));

  return {
    tipo,
    mes,
    chave: tipo === 'mes' ? mes : ano,
    titulo: tipo === 'mes' ? capitalizar(nomeDoMes(`${mes}-01`)) : `Ano de ${ano}`,
    entradas,
    saidas,
    serie,
  };
}

function tela(d) {
  return html`
    ${cabecalhoImpressao()}
    <h2 class="secao__titulo">${d.titulo}</h2>
    ${d.tipo === 'ano' ? resumoDoAno(d) : html`
      <p class="nota nota--info nao-imprimir">
        Entradas, saídas, resultado e a divisão entre os sócios deste mês estão no
        <a href="#/financeiro/fechamento?mes=${d.mes}-01">fechamento de ${nomeDoMes(`${d.mes}-01`)}</a>.
        Aqui ficam os lançamentos, um por um, para conferir e exportar.
      </p>`}
    ${listaEntradas(d.entradas)}
    ${listaSaidas(d.saidas)}`;
}

function resumoDoAno({ entradas, saidas, serie }) {
  const entrou = somaCentavos(entradas, 'valor');
  const saiu = somaCentavos(saidas, 'valor');

  const porCategoria = new Map();
  for (const c of saidas) porCategoria.set(c.categoria_nome, (porCategoria.get(c.categoria_nome) ?? 0) + centavos(c.valor));

  const principal = entradas.filter((r) => r.parcela_id).reduce((s, r) => s + centavos(r.valor_principal), 0);
  const encargos = entradas.reduce((s, r) => s + centavos(r.valor_encargos), 0);
  const avulsas = new Map();
  for (const r of entradas.filter((x) => !x.parcela_id)) {
    avulsas.set(r.tipo_avulsa, (avulsas.get(r.tipo_avulsa) ?? 0) + centavos(r.valor));
  }

  return html`
    <div class="indicadores">
      ${indicador('Entradas', moeda(entrou), plural(entradas.length, 'recebimento', 'recebimentos'), { tom: 'ok' })}
      ${indicador('Saídas', moeda(saiu), plural(saidas.length, 'conta paga', 'contas pagas'))}
      ${indicador('Resultado', moeda(entrou - saiu), 'regime de caixa', { tom: entrou - saiu < 0 ? 'perigo' : '' })}
    </div>

    <section class="painel">
      <header class="painel__topo"><h2 class="painel__titulo">Mês a mês</h2></header>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Resultado</th><th class="nao-imprimir"><span class="sr-only">Fechamento</span></th></tr></thead>
          <tbody>
            ${serie.map((s) => html`
              <tr>
                <td>${mesAbreviado(s.competencia)}</td>
                <td class="num">${moeda(centavos(s.entradas))}</td>
                <td class="num">${moeda(centavos(s.saidas))}</td>
                <td class="num">${moeda(centavos(s.entradas) - centavos(s.saidas))}</td>
                <td class="acoes nao-imprimir"><a class="botao botao--pequeno botao--discreto" href="#/financeiro/fechamento?mes=${s.competencia}">Fechamento</a></td>
              </tr>`)}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td class="num">${moeda(entrou)}</td><td class="num">${moeda(saiu)}</td><td class="num">${moeda(entrou - saiu)}</td><td class="nao-imprimir"></td></tr>
          </tfoot>
        </table>
      </div>
    </section>

    <div class="grade grade--2 secao">
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Origem das entradas</h2></header>
        <table class="tabela">
          <tbody>
            <tr><td>Parcelas de contratos</td><td class="num">${moeda(principal)}</td></tr>
            <tr><td>Multa, juros e correção</td><td class="num">${moeda(encargos)}</td></tr>
            ${[...avulsas].map(([t, v]) => html`<tr><td>${TIPOS_AVULSA[t] ?? t} (avulsa)</td><td class="num">${moeda(v)}</td></tr>`)}
          </tbody>
        </table>
      </section>
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Saídas por categoria</h2></header>
        ${porCategoria.size ? html`
          <table class="tabela">
            <tbody>${[...porCategoria].sort((a, b) => b[1] - a[1]).map(([nome, v]) => html`<tr><td>${nome}</td><td class="num">${moeda(v)}</td></tr>`)}</tbody>
          </table>` : vazio('Nenhuma conta paga no período.')}
      </section>
    </div>`;
}

function listaEntradas(entradas) {
  const entrou = somaCentavos(entradas, 'valor');
  const encargos = somaCentavos(entradas, 'valor_encargos');
  return html`
    <section class="painel secao">
      <header class="painel__topo">
        <h2 class="painel__titulo">Entradas</h2>
        <button type="button" class="botao botao--pequeno nao-imprimir" data-acao="csv-entradas">Planilha</button>
      </header>
      ${entradas.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Data</th><th>Cliente</th><th>Origem</th><th>Forma</th><th class="num">Encargos</th><th class="num">Valor</th></tr></thead>
            <tbody>
              ${entradas.map((r) => html`
                <tr>
                  <td class="num">${data(r.data)}</td>
                  <td>${r.cliente_nome ?? '—'}</td>
                  <td>${r.parcela_id
                    ? html`<a href="#/financeiro/contratos/${r.contrato_id}">${r.contrato_descricao}</a><span class="sub">${nomeDaParcela(r.parcela_numero)}</span>`
                    : html`${TIPOS_AVULSA[r.tipo_avulsa] ?? r.tipo_avulsa}<span class="sub">${r.descricao ?? ''}</span>`}</td>
                  <td>${r.forma_nome ?? '—'}</td>
                  <td class="num">${moeda(centavos(r.valor_encargos))}</td>
                  <td class="num">${moeda(centavos(r.valor))}</td>
                </tr>`)}
            </tbody>
            <tfoot><tr><td colspan="4">${plural(entradas.length, 'recebimento', 'recebimentos')}</td><td class="num">${moeda(encargos)}</td><td class="num">${moeda(entrou)}</td></tr></tfoot>
          </table>
        </div>` : vazio('Nenhuma entrada no período.')}
    </section>`;
}

function listaSaidas(saidas) {
  const saiu = somaCentavos(saidas, 'valor');
  return html`
    <section class="painel secao">
      <header class="painel__topo">
        <h2 class="painel__titulo">Saídas</h2>
        <button type="button" class="botao botao--pequeno nao-imprimir" data-acao="csv-saidas">Planilha</button>
      </header>
      ${saidas.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Pago em</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th>Pago por</th><th class="num">Valor</th></tr></thead>
            <tbody>
              ${saidas.map((c) => html`
                <tr>
                  <td class="num">${data(c.data_pagamento)}</td>
                  <td>${c.descricao}</td>
                  <td>${c.categoria_nome}</td>
                  <td>${c.forma_nome ?? '—'}</td>
                  <td>${c.pago_por_id ? nomeDe(c.pago_por_id) : 'Caixa'}</td>
                  <td class="num">${moeda(centavos(c.valor))}</td>
                </tr>`)}
            </tbody>
            <tfoot><tr><td colspan="5">${plural(saidas.length, 'conta paga', 'contas pagas')}</td><td class="num">${moeda(saiu)}</td></tr></tfoot>
          </table>
        </div>` : vazio('Nenhuma saída no período.')}
    </section>`;
}

const csvEntradas = (linhas) => gerarCsv([
  { titulo: 'Data', valor: (r) => r.data, tipo: 'data' },
  { titulo: 'Cliente', valor: (r) => r.cliente_nome },
  { titulo: 'Contrato', valor: (r) => r.contrato_descricao },
  { titulo: 'Parcela', valor: (r) => (r.parcela_id ? nomeDaParcela(r.parcela_numero) : null) },
  { titulo: 'Entrada avulsa', valor: (r) => (r.tipo_avulsa ? TIPOS_AVULSA[r.tipo_avulsa] : null) },
  { titulo: 'Descrição', valor: (r) => r.descricao },
  { titulo: 'Forma', valor: (r) => r.forma_nome },
  { titulo: 'Saldo abatido', valor: (r) => centavos(r.valor_principal), tipo: 'moeda' },
  { titulo: 'Encargos', valor: (r) => centavos(r.valor_encargos), tipo: 'moeda' },
  { titulo: 'Valor', valor: (r) => centavos(r.valor), tipo: 'moeda' },
  { titulo: 'Lançado por', valor: (r) => nomeDe(r.criado_por) },
], linhas);

const csvSaidas = (linhas) => gerarCsv([
  { titulo: 'Pago em', valor: (c) => c.data_pagamento, tipo: 'data' },
  { titulo: 'Vencimento', valor: (c) => c.vencimento, tipo: 'data' },
  { titulo: 'Descrição', valor: (c) => c.descricao },
  { titulo: 'Categoria', valor: (c) => c.categoria_nome },
  { titulo: 'Forma', valor: (c) => c.forma_nome },
  { titulo: 'Pago por', valor: (c) => (c.pago_por_id ? nomeDe(c.pago_por_id) : 'Caixa do escritório') },
  { titulo: 'Valor', valor: (c) => centavos(c.valor), tipo: 'moeda' },
], linhas);

/** Tudo o que este login pode ler, num arquivo só. Serve de garantia e de
 *  migração: cada tabela vem inteira, com os ids. */
async function copiaDeSeguranca() {
  const tabelas = ['clientes', 'membros', 'categorias', 'formas_pagamento', 'config_financeiro',
    'contratos', 'parcelas', 'recebimentos', 'renegociacoes', 'cobrancas', 'contas', 'contas_recorrentes'];
  if (pode.fechamento()) tabelas.push('fechamentos', 'divisao_cotas');
  if (pode.agenda()) tabelas.push('config_agenda', 'compromissos');
  if (pode.site()) tabelas.push('publicacoes', 'campanhas', 'site_deploys');

  const copia = { gerado_em: new Date().toISOString(), sistema: 'FHL Advocacia — área dos advogados', tabelas: {} };
  for (const tabela of tabelas) {
    copia.tabelas[tabela] = await db.todos(tabela, { select: '*' });
  }
  return copia;
}
