// Financeiro — painel gerencial (preparação 6.7; DOCX §4, T09).
// =============================================================
//
// Os dez números do DOCX para o período escolhido, a série mês a mês e os
// atalhos. Os números vêm de resumo_financeiro, e cada um abre a lista que o
// compõe, com o mesmo período e filtros: somar a lista dá o número, no
// centavo.
//
//   · receita prevista — o que as parcelas do plano vigente exigem, pelo
//     vencimento;
//   · receita recebida e despesas pagas — o dinheiro, pela data do caixa;
//   · despesas previstas — as obrigações pela competência, inclusive as
//     recorrentes que ainda não viraram conta;
//   · a vencer e vencida — o saldo de hoje das parcelas do período.
//
// Previsão não é saldo de banco, e juros calculados não são receita.

import { avisarErro } from '../../nucleo/avisos.js';
import { estado, pode } from '../../nucleo/estado.js';
import {
  centavos, data, dataHora, fimDoMes, hoje, inicioDoMes, mesAbreviado, moeda, nomeDoMes, somarMeses,
} from '../../nucleo/formato.js';
import { $$, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, capitalizar, indicador, opcoes, plural, seletorMes } from '../comum.js';
import { apoio, garantirContasDoMes } from './base.js';

const PERIODOS = [['mes', 'Mês'], ['ano', 'Ano'], ['livre', 'Período livre']];
const SERIES = [
  ['receita_prevista', 'Receita prevista', 'var(--c-teal-claro, #8DB8B0)'],
  ['receita_recebida', 'Receita recebida', 'var(--c-teal)'],
  ['despesa_prevista', 'Despesa prevista', 'var(--c-vinho-claro, #C49A9A)'],
  ['despesa_paga', 'Despesa paga', 'var(--c-wine)'],
];

export default async function telaPainel(ctx) {
  const q = ctx.consulta;
  const f = {
    periodo: PERIODOS.some(([v]) => v === q.periodo) ? q.periodo : 'mes',
    mes: /^\d{4}-\d{2}-01$/.test(q.mes ?? '') ? q.mes : inicioDoMes(hoje()),
    ano: /^\d{4}$/.test(q.ano ?? '') ? q.ano : hoje().slice(0, 4),
    de: /^\d{4}-\d{2}-\d{2}$/.test(q.de ?? '') ? q.de : inicioDoMes(hoje()),
    ate: /^\d{4}-\d{2}-\d{2}$/.test(q.ate ?? '') ? q.ate : fimDoMes(hoje()),
    responsavel: q.responsavel ?? '',
    conta: q.conta ?? '',
    categoria: q.categoria ?? '',
    series: (q.series ?? 'receita_prevista,receita_recebida,despesa_paga').split(',').filter((s) => SERIES.some(([v]) => v === s)),
  };
  const listas = await apoio();
  let pedido = 0;

  const intervalo = () => (f.periodo === 'mes' ? { de: f.mes, ate: fimDoMes(f.mes) }
    : f.periodo === 'ano' ? { de: `${f.ano}-01-01`, ate: `${f.ano}-12-31` } : { de: f.de, ate: f.ate });

  const mostrar = async () => {
    const este = ++pedido;
    const { de, ate } = intervalo();
    if (f.periodo === 'mes') await garantirContasDoMes(f.mes);
    const resumo = await db.rpc('resumo_financeiro', {
      p: { de, ate, responsavel_id: f.responsavel || null, conta_financeira_id: f.conta || null, categoria_id: f.categoria || null },
    });
    if (este !== pedido || !ctx.ativa()) return;
    desenhar(ctx.raiz, tela(resumo, f, listas));
  };
  await mostrar();

  const guardar = () => {
    guardarConsulta({ ...f, series: f.series.join(',') });
    mostrar().catch(avisarErro);
  };
  const trocarMes = (delta) => {
    f.mes = somarMeses(f.mes, delta);
    guardar();
  };

  ctx.raiz.addEventListener('change', (e) => {
    const campo = e.target;
    if (campo.name === 'serie') {
      f.series = $$('[name="serie"]:checked', ctx.raiz).map((c) => c.value);
    } else if (campo.form?.dataset.papel === 'filtros' && campo.name in f) {
      f[campo.name] = campo.value;
    } else return;
    guardar();
  });

  return aoClicar(ctx.raiz, {
    'mes-anterior': () => trocarMes(-1),
    'mes-seguinte': () => trocarMes(1),
  });
}

function tela(r, f, { contasFinanceiras, categorias }) {
  const i = r.indicadores;
  const { de, ate } = r.parametros;
  const v = (k) => centavos(i[k]?.valor ?? 0);
  const filtrosLink = `${f.responsavel ? `&responsavel=${f.responsavel}` : ''}`;
  const caixaLink = `${f.conta ? `&conta=${f.conta}` : ''}`;
  const despesaLink = `${f.categoria ? `&categoria=${f.categoria}` : ''}`;
  const titulo = f.periodo === 'mes' ? capitalizar(nomeDoMes(f.mes)) : f.periodo === 'ano' ? `Ano de ${f.ano}` : `${data(de)} a ${data(ate)}`;
  const taxa = i.taxa_recebimento?.valor;
  const lanca = pode.lancar();

  return html`
    ${cabecalho('Financeiro', html`Painel · ${titulo} · ${estado.membro.nome_curto}`, html`
      ${f.periodo === 'mes' ? seletorMes(f.mes) : ''}
      ${lanca ? html`
        <a class="botao" href="#/financeiro/recebiveis?situacao=abertas">Registrar recebimento</a>
        <a class="botao" href="#/financeiro/contas?nova=1">Nova despesa</a>
        <a class="botao botao--primario" href="#/financeiro/contratos/novo">Novo contrato</a>` : ''}`)}

    <form class="filtros" data-papel="filtros">
      <label class="campo"><span>Período</span><select name="periodo">${opcoes(PERIODOS, f.periodo)}</select></label>
      ${f.periodo === 'ano' ? html`<label class="campo"><span>Ano</span><input type="number" name="ano" min="2000" max="2200" value="${f.ano}"></label>` : ''}
      ${f.periodo === 'livre' ? html`
        <label class="campo"><span>De</span><input type="date" name="de" value="${f.de}"></label>
        <label class="campo"><span>Até</span><input type="date" name="ate" value="${f.ate}"></label>` : ''}
      <label class="campo"><span>Responsável</span><select name="responsavel">${opcoes(estado.membros.map((m) => [m.id, m.nome_curto]), f.responsavel, { vazio: 'Todos' })}</select></label>
      <label class="campo"><span>Conta financeira</span><select name="conta">${opcoes(contasFinanceiras.map((c) => [c.id, c.nome]), f.conta, { vazio: 'Todas' })}</select></label>
      <label class="campo"><span>Categoria de despesa</span><select name="categoria">${opcoes(categorias.map((c) => [c.id, c.nome]), f.categoria, { vazio: 'Todas' })}</select></label>
    </form>

    <div class="indicadores indicadores--4">
      ${indicador('Receita prevista', moeda(v('receita_prevista')), `${plural(i.receita_prevista.quantidade, 'parcela', 'parcelas')} com vencimento no período`,
        { href: `#/financeiro/recebiveis?situacao=vigentes&de=${de}&ate=${ate}${filtrosLink}` })}
      ${indicador('Receita recebida', moeda(v('receita_recebida')), `${plural(i.receita_recebida.quantidade, 'recebimento', 'recebimentos')} · ${moeda(centavos(i.receita_recebida.encargos))} de encargos`,
        { tom: v('receita_recebida') ? 'ok' : '', href: `#/financeiro/relatorios?relatorio=recebimentos&de=${de}&ate=${ate}${caixaLink}${filtrosLink}` })}
      ${indicador('Receita a vencer', moeda(v('receita_a_vencer')), `${plural(i.receita_a_vencer.quantidade, 'parcela', 'parcelas')}${centavos(i.receita_a_vencer.vence_hoje) ? ` · ${moeda(centavos(i.receita_a_vencer.vence_hoje))} vence hoje` : ''}`,
        { href: `#/financeiro/recebiveis?situacao=a_vencer&de=${de}&ate=${ate}${filtrosLink}` })}
      ${indicador('Receita vencida', moeda(v('receita_vencida')), `${plural(i.receita_vencida.quantidade, 'parcela', 'parcelas')} do período, sem encargos`,
        { tom: v('receita_vencida') ? 'perigo' : '', href: `#/financeiro/recebiveis?situacao=vencida&de=${de}&ate=${ate}${filtrosLink}` })}
      ${indicador('Despesas previstas', moeda(v('despesas_previstas')), `${plural(i.despesas_previstas.quantidade, 'conta', 'contas')} pela competência${i.despesas_previstas.sem_valor ? ` · ${i.despesas_previstas.sem_valor} sem valor` : ''}`,
        { tom: i.despesas_previstas.sem_valor ? 'alerta' : '', href: `#/financeiro/relatorios?relatorio=despesas&de=${de}&ate=${ate}${despesaLink}` })}
      ${indicador('Despesas pagas', moeda(v('despesas_pagas')), `${plural(i.despesas_pagas.quantidade, 'pagamento', 'pagamentos')} no período`,
        { href: `#/financeiro/relatorios?relatorio=pagamentos&de=${de}&ate=${ate}${caixaLink}${despesaLink}` })}
      ${indicador('Saldo previsto', moeda(v('saldo_previsto')), 'receita prevista − despesas previstas', { tom: v('saldo_previsto') < 0 ? 'perigo' : '' })}
      ${indicador('Saldo realizado', moeda(v('saldo_realizado')), 'recebido − pago (sem transferências)',
        { tom: v('saldo_realizado') < 0 ? 'perigo' : '', href: pode.fechamento() && f.periodo === 'mes' && !f.responsavel && !f.conta && !f.categoria ? `#/financeiro/fechamento?mes=${f.mes}` : '' })}
      ${indicador('Taxa de recebimento', taxa == null ? 'Não se aplica' : `${String(taxa).replace('.', ',')}%`,
        taxa == null ? 'nenhuma parcela venceu no período' : `${moeda(centavos(i.taxa_recebimento.numerador))} de ${moeda(centavos(i.taxa_recebimento.denominador))} já vencidos`,
        { tom: taxa != null && taxa < 80 ? 'alerta' : '', href: `#/financeiro/recebiveis?situacao=vigentes&de=${de}&ate=${ate < r.parametros.hoje ? ate : r.parametros.hoje}${filtrosLink}` })}
      ${indicador('Contratos com atenção', String(i.contratos_atencao.quantidade), 'atraso, plano divergente ou vigência terminando',
        { tom: i.contratos_atencao.quantidade ? 'alerta' : '', href: `#/financeiro/contratos?situacao=atencao${filtrosLink}` })}
      ${indicador('Em atraso hoje (todos)', moeda(v('estoque_vencido')), `${plural(i.estoque_vencido.quantidade, 'parcela vencida', 'parcelas vencidas')} de qualquer mês, sem encargos`,
        { tom: v('estoque_vencido') ? 'perigo' : '', href: `#/financeiro/recebiveis?situacao=vencida${filtrosLink}` })}
    </div>

    <section class="painel">
      <header class="painel__topo">
        <h2 class="painel__titulo">Mês a mês</h2>
        <p class="legenda legenda--escolha">${SERIES.map(([valor, rotulo, cor]) => html`
          <label data-vars="--cor:${cor}"><input type="checkbox" name="serie" value="${valor}" ${f.series.includes(valor) ? 'checked' : ''}> ${rotulo}</label>`)}</p>
      </header>
      <div class="painel__corpo">${grafico(r.serie, f.series)}</div>
      <details class="painel__corpo">
        <summary>Ver os números em tabela</summary>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Mês</th>${SERIES.map(([, rotulo]) => html`<th class="num">${rotulo}</th>`)}<th class="num">Saldo realizado</th></tr></thead>
            <tbody>${r.serie.map((s) => html`
              <tr><td>${mesAbreviado(s.competencia)}</td>${SERIES.map(([k]) => html`<td class="num">${moeda(centavos(s[k]))}</td>`)}
                <td class="num">${moeda(centavos(s.receita_recebida) - centavos(s.despesa_paga))}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </details>
      <p class="painel__rodape sub">Calculado em ${dataHora(r.emitido_em)}. Previsão não é saldo de banco; juros calculados não são receita até serem recebidos.</p>
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

function grafico(serie, escolhidas) {
  const series = SERIES.filter(([v]) => escolhidas.includes(v));
  if (!series.length || !serie.length) return html`<p class="sub">Escolha ao menos uma série acima.</p>`;
  const L = 960;
  const A = 240;
  const esquerda = 48;
  const baixo = 24;
  const cima = 10;
  const maximo = teto(Math.max(10000, ...serie.flatMap((s) => series.map(([k]) => centavos(s[k])))));
  const y = (c) => r1(cima + (A - cima - baixo) * (1 - c / maximo));
  const grupo = (L - esquerda) / serie.length;
  const barra = r1(Math.max(3, Math.min(16, (grupo * 0.8) / series.length)));

  return html`
    <svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${series.map(([, r]) => r).join(', ')} mês a mês">
      ${[0.5, 1].map((fr) => html`
        <line class="grafico__guia" x1="${esquerda}" x2="${L}" y1="${y(maximo * fr)}" y2="${y(maximo * fr)}"></line>
        <text x="${esquerda - 8}" y="${y(maximo * fr) + 4}" text-anchor="end">${fmtEixo.format((maximo * fr) / 100)}</text>`)}
      ${serie.map((s, i) => {
        const centro = esquerda + grupo * i + grupo / 2;
        const inicio = centro - (barra * series.length) / 2;
        return html`
          ${series.map(([k, rotulo, cor], j) => {
            const valor = centavos(s[k]);
            return html`
              <rect class="grafico__barra" data-vars="--cor:${cor}" x="${r1(inicio + j * barra)}" y="${y(valor)}" width="${r1(barra - 1)}" height="${r1(y(0) - y(valor))}">
                <title>${mesAbreviado(s.competencia)} — ${rotulo}: ${moeda(valor)}</title>
              </rect>`;
          })}
          <text x="${r1(centro)}" y="${A - 6}" text-anchor="middle">${mesAbreviado(s.competencia)}</text>`;
      })}
      <line class="grafico__eixo" x1="${esquerda}" x2="${L}" y1="${y(0)}" y2="${y(0)}"></line>
      <text x="${esquerda - 8}" y="${y(0) + 4}" text-anchor="end">0</text>
    </svg>`;
}
