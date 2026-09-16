// Financeiro — painel do mês (preparação 6.7).
// ============================================
//
// Entrou, saiu, resultado, a receber no mês e em atraso já atualizado, mais os
// doze meses em gráfico. Regime de caixa: o mês de uma entrada é o do
// recebimento; o de uma saída, o do pagamento.

import { avisarErro } from '../../nucleo/avisos.js';
import {
  centavos, dataCurta, fimDoMes, hoje, inicioDoMes, mesAbreviado, moeda, somarDias, somarMeses,
} from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, seletorMes, seloConta, vazio } from '../comum.js';
import { apoio, atualizarParcelas, criterioEmTexto, rotuloParcela, somaCentavos } from './base.js';

const mesValido = (m) => (/^\d{4}-\d{2}-01$/.test(m ?? '') ? m : null);

export default async function telaPainel(ctx) {
  let mes = mesValido(ctx.consulta.mes) ?? inicioDoMes(hoje());

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
  const dia = hoje();

  // Contas fixas do mês aparecem antes de qualquer soma.
  await db.rpc('gerar_contas_do_mes', { p_competencia: mes }).catch(() => 0);

  const [recebimentos, pagas, aReceber, vencidas, serie, contasDoMes, vencendo, { config }] = await Promise.all([
    db.listar('recebimentos', {
      select: 'valor',
      filtros: [['data', 'gte', mes], ['data', 'lte', fim], ['estornado_em', 'is', null]],
    }),
    db.listar('v_contas', {
      select: 'valor',
      filtros: [['situacao', 'eq', 'paga'], ['data_pagamento', 'gte', mes], ['data_pagamento', 'lte', fim]],
    }),
    db.listar('v_parcelas', {
      select: 'saldo',
      filtros: [['situacao', 'in', ['a_vencer', 'vencida']], ['vencimento', 'gte', mes], ['vencimento', 'lte', fim]],
    }),
    db.listar('v_parcelas', {
      select: 'id,saldo,vencimento,multa_pct,juros_mes_pct,correcao,carencia_dias',
      filtros: [['situacao', 'eq', 'vencida']],
    }),
    db.rpc('serie_mensal', { p_ate: mes, p_meses: 12 }),
    db.listar('v_contas', {
      select: 'id,descricao,valor,vencimento,situacao',
      filtros: [['competencia', 'eq', mes], ['situacao', 'in', ['a_pagar', 'vencida', 'sem_valor']]],
      ordem: 'vencimento.asc',
    }),
    db.listar('v_parcelas', {
      select: 'id,contrato_id,cliente_nome,numero,vencimento,saldo',
      filtros: [['situacao', 'eq', 'a_vencer'], ['vencimento', 'gte', dia], ['vencimento', 'lte', somarDias(dia, 7)]],
      ordem: 'vencimento.asc',
      limite: 10,
    }),
    apoio(),
  ]);

  const atualizadas = await atualizarParcelas(vencidas, dia);
  return { recebimentos, pagas, aReceber, atualizadas, serie, contasDoMes, vencendo, config };
}

function indicador(rotulo, valor, nota, tom = '', href = '') {
  const conteudo = html`
    <span class="rotulo">${rotulo}</span>
    <span class="indicador__valor">${valor}</span>
    <span class="indicador__nota">${nota}</span>`;
  const classe = `indicador${tom ? ` indicador--${tom}` : ''}`;
  return href ? html`<a class="${classe}" href="${href}">${conteudo}</a>` : html`<div class="${classe}">${conteudo}</div>`;
}

function tela(mes, d) {
  const entrou = somaCentavos(d.recebimentos, 'valor');
  const saiu = somaCentavos(d.pagas, 'valor');
  const resultado = entrou - saiu;
  const aReceber = somaCentavos(d.aReceber, 'saldo');
  const atrasoTotal = d.atualizadas.reduce((s, x) => s + x.calculo.total, 0);
  const atrasoSaldo = d.atualizadas.reduce((s, x) => s + x.calculo.saldo, 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  return html`
    ${cabecalho('Financeiro', 'Painel do mês', html`
      ${seletorMes(mes)}
      <a class="botao botao--primario" href="#/financeiro/contratos/novo">Novo contrato</a>`)}

    <div class="indicadores">
      ${indicador('Entrou', moeda(entrou), plural(d.recebimentos.length, 'recebimento', 'recebimentos'), entrou ? 'ok' : '')}
      ${indicador('Saiu', moeda(saiu), plural(d.pagas.length, 'conta paga', 'contas pagas'))}
      ${indicador('Resultado', moeda(resultado), 'entrou − saiu', resultado < 0 ? 'perigo' : '')}
      ${indicador('A receber no mês', moeda(aReceber), plural(d.aReceber.length, 'parcela em aberto', 'parcelas em aberto'), '', '#/financeiro/recebiveis')}
      ${indicador('Em atraso hoje', moeda(atrasoTotal), `saldo de ${moeda(atrasoSaldo)} + encargos`, atrasoTotal ? 'perigo' : '', '#/financeiro/atraso')}
    </div>

    <div class="grade grade--2">
      <section class="painel">
        <header class="painel__topo">
          <h2 class="painel__titulo">Entrou e saiu — 12 meses</h2>
          <p class="legenda">
            <span data-vars="--cor:var(--c-teal)">Entrou</span>
            <span data-vars="--cor:var(--c-wine)">Saiu</span>
          </p>
        </header>
        <div class="painel__corpo">${grafico(d.serie)}</div>
      </section>

      <section class="painel">
        <header class="painel__topo">
          <h2 class="painel__titulo">Pede atenção</h2>
          <a class="botao botao--pequeno" href="#/financeiro/contas">Contas</a>
        </header>
        <h3 class="aviso-lista__titulo rotulo"><span>Parcelas nos próximos 7 dias</span></h3>
        ${d.vencendo.length
          ? html`<ul class="lista">${d.vencendo.map((p) => html`
              <li><a class="lista__item" href="#/financeiro/contratos/${p.contrato_id}">
                <span>${p.cliente_nome}<span class="sub">${rotuloParcela(p)} · vence ${dataCurta(p.vencimento)}</span></span>
                <span class="num">${moeda(centavos(p.saldo))}</span>
              </a></li>`)}</ul>`
          : vazio('Nenhuma parcela vence nos próximos 7 dias.')}
        <h3 class="aviso-lista__titulo rotulo"><span>Contas do mês em aberto</span></h3>
        ${d.contasDoMes.length
          ? html`<ul class="lista">${d.contasDoMes.map((c) => html`
              <li><a class="lista__item" href="#/financeiro/contas?mes=${mes}">
                <span>${c.descricao}<span class="sub">vence ${dataCurta(c.vencimento)}</span></span>
                <span>${c.valor != null ? html`<span class="num">${moeda(centavos(c.valor))}</span> ` : ''}${seloConta(c.situacao)}</span>
              </a></li>`)}</ul>`
          : vazio('Todas as contas do mês estão pagas.')}
      </section>
    </div>

    <p class="sub secao">Atraso calculado com ${criterioEmTexto(d.config)}. <a href="#/financeiro/configuracoes">Configurar</a></p>`;
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
  const L = 640;
  const A = 220;
  const esquerda = 48;
  const baixo = 24;
  const cima = 10;
  const maximo = teto(Math.max(10000, ...serie.flatMap((s) => [centavos(s.entradas), centavos(s.saidas)])));
  const y = (c) => r1(cima + (A - cima - baixo) * (1 - c / maximo));
  const grupo = (L - esquerda) / serie.length;
  const barra = r1(Math.max(4, Math.min(16, grupo * 0.3)));

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
