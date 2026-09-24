// Financeiro — painel do mês (preparação 6.7).
// ============================================
//
// Os números do mês e a tendência de doze meses. Cada número é um link para
// a tela onde ele mora — Contas, Recebíveis, Em atraso, Fechamento —, em vez
// de repetir aqui o detalhe de cada uma. O que vence nos próximos dias fica na
// tela Hoje, que é por onde todo mundo entra.
//
// Regime de caixa: o mês de uma entrada é o do recebimento; o de uma saída, o
// do pagamento.

import { avisarErro } from '../../nucleo/avisos.js';
import { centavos, fimDoMes, hoje, inicioDoMes, mesAbreviado, moeda, somarMeses } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, indicador, mesDaConsulta, plural, seletorMes } from '../comum.js';
import { atualizarParcelas, garantirContasDoMes, somaCentavos } from './base.js';

export default async function telaPainel(ctx) {
  let mes = mesDaConsulta(ctx.consulta.mes, inicioDoMes(hoje()));

  const mostrar = async () => {
    const dados = await carregar(mes);
    if (ctx.ativa()) desenhar(ctx.raiz, tela(mes, dados));
  };
  await mostrar();

  const trocarMes = (delta) => {
    mes = somarMeses(mes, delta);
    guardarConsulta({ mes });
    mostrar().catch(avisarErro);
  };

  return aoClicar(ctx.raiz, {
    'mes-anterior': () => trocarMes(-1),
    'mes-seguinte': () => trocarMes(1),
  });
}

async function carregar(mes) {
  const fim = fimDoMes(mes);

  // Contas fixas do mês aparecem antes de qualquer soma.
  await garantirContasDoMes(mes);

  const [recebimentos, contas, aReceber, vencidas, serie] = await Promise.all([
    db.todos('recebimentos', {
      select: 'id,valor',
      filtros: [['data', 'gte', mes], ['data', 'lte', fim], ['estornado_em', 'is', null]],
    }),
    db.todos('v_contas', {
      select: 'id,valor,situacao,data_pagamento,competencia',
      filtros: [['or', `(and(data_pagamento.gte.${mes},data_pagamento.lte.${fim}),competencia.eq.${mes})`]],
    }),
    db.todos('v_parcelas', {
      select: 'id,saldo',
      filtros: [['situacao', 'in', ['a_vencer', 'vencida']], ['vencimento', 'gte', mes], ['vencimento', 'lte', fim]],
    }),
    db.todos('v_parcelas', {
      select: 'id,saldo,vencimento,multa_pct,juros_mes_pct,correcao,carencia_dias',
      filtros: [['situacao', 'eq', 'vencida']],
    }),
    db.rpc('serie_mensal', { p_ate: mes, p_meses: 12 }),
  ]);

  // Saiu: pago dentro do mês, seja de que mês for a conta. A pagar: conta do
  // mês que ainda não foi paga.
  const pagas = contas.filter((c) => c.situacao === 'paga' && c.data_pagamento >= mes && c.data_pagamento <= fim);
  const aPagar = contas.filter((c) => c.competencia === mes && ['a_pagar', 'vencida', 'sem_valor'].includes(c.situacao));

  const atualizadas = await atualizarParcelas(vencidas, hoje());
  return { recebimentos, pagas, aPagar, aReceber, atualizadas, serie };
}

function tela(mes, d) {
  const entrou = somaCentavos(d.recebimentos, 'valor');
  const saiu = somaCentavos(d.pagas, 'valor');
  const resultado = entrou - saiu;
  const aReceber = somaCentavos(d.aReceber, 'saldo');
  const aPagar = somaCentavos(d.aPagar, 'valor');
  const semValor = d.aPagar.filter((c) => c.valor == null).length;
  const atrasoTotal = d.atualizadas.reduce((s, x) => s + x.calculo.total, 0);
  const atrasoSaldo = d.atualizadas.reduce((s, x) => s + x.calculo.saldo, 0);
  const am = mes.slice(0, 7);

  return html`
    ${cabecalho('Financeiro', 'Painel do mês', html`
      ${seletorMes(mes)}
      <a class="botao botao--primario" href="#/financeiro/contratos/novo">Novo contrato</a>`)}

    <div class="indicadores indicadores--3">
      ${indicador('Entrou', moeda(entrou), plural(d.recebimentos.length, 'recebimento', 'recebimentos'),
        { tom: entrou ? 'ok' : '', href: `#/financeiro/relatorios?tipo=mes&mes=${am}` })}
      ${indicador('Saiu', moeda(saiu), plural(d.pagas.length, 'conta paga', 'contas pagas'),
        { href: `#/financeiro/contas?mes=${mes}` })}
      ${indicador('Resultado', moeda(resultado), 'entrou − saiu · ver o fechamento',
        { tom: resultado < 0 ? 'perigo' : '', href: `#/financeiro/fechamento?mes=${mes}` })}
      ${indicador('A receber no mês', moeda(aReceber), plural(d.aReceber.length, 'parcela em aberto', 'parcelas em aberto'),
        { href: `#/financeiro/recebiveis?mes=${am}` })}
      ${indicador('A pagar no mês', moeda(aPagar),
        `${plural(d.aPagar.length, 'conta em aberto', 'contas em aberto')}${semValor ? ` · ${semValor} sem valor` : ''}`,
        { tom: semValor ? 'alerta' : '', href: `#/financeiro/contas?mes=${mes}` })}
      ${indicador('Em atraso hoje', moeda(atrasoTotal), `saldo de ${moeda(atrasoSaldo)} + encargos`,
        { tom: atrasoTotal ? 'perigo' : '', href: '#/financeiro/atraso' })}
    </div>

    <section class="painel">
      <header class="painel__topo">
        <h2 class="painel__titulo">Entrou e saiu — 12 meses</h2>
        <p class="legenda">
          <span data-vars="--cor:var(--c-teal)">Entrou</span>
          <span data-vars="--cor:var(--c-wine)">Saiu</span>
        </p>
      </header>
      <div class="painel__corpo">${grafico(d.serie)}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Gráfico em SVG, sem biblioteca
// ---------------------------------------------------------------------------

const fmtEixo = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const r1 = (n) => Math.round(n * 10) / 10;

function teto(maior) {
  const potencia = 10 ** Math.floor(Math.log10(maior));
  return [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((v) => v >= maior);
}

function grafico(serie) {
  const L = 960;
  const A = 240;
  const esquerda = 48;
  const baixo = 24;
  const cima = 10;
  const maximo = teto(Math.max(10000, ...serie.flatMap((s) => [centavos(s.entradas), centavos(s.saidas)])));
  const y = (c) => r1(cima + (A - cima - baixo) * (1 - c / maximo));
  const grupo = (L - esquerda) / serie.length;
  const barra = r1(Math.max(4, Math.min(18, grupo * 0.3)));

  return html`
    <svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="Entradas e saídas dos últimos 12 meses">
      ${[0.5, 1].map((f) => html`
        <line class="grafico__guia" x1="${esquerda}" x2="${L}" y1="${y(maximo * f)}" y2="${y(maximo * f)}"></line>
        <text x="${esquerda - 8}" y="${y(maximo * f) + 4}" text-anchor="end">${fmtEixo.format((maximo * f) / 100)}</text>`)}
      ${serie.map((s, i) => {
        const centro = r1(esquerda + grupo * i + grupo / 2);
        const entrou = centavos(s.entradas);
        const saiu = centavos(s.saidas);
        return html`
          <rect class="grafico__barra--entrada" x="${r1(centro - barra - 1)}" y="${y(entrou)}" width="${barra}" height="${r1(y(0) - y(entrou))}">
            <title>${mesAbreviado(s.competencia)} — entrou ${moeda(entrou)}</title>
          </rect>
          <rect class="grafico__barra--saida" x="${r1(centro + 1)}" y="${y(saiu)}" width="${barra}" height="${r1(y(0) - y(saiu))}">
            <title>${mesAbreviado(s.competencia)} — saiu ${moeda(saiu)}</title>
          </rect>
          <text x="${centro}" y="${A - 6}" text-anchor="middle">${mesAbreviado(s.competencia)}</text>`;
      })}
      <line class="grafico__eixo" x1="${esquerda}" x2="${L}" y1="${y(0)}" y2="${y(0)}"></line>
      <text x="${esquerda - 8}" y="${y(0) + 4}" text-anchor="end">0</text>
    </svg>`;
}
