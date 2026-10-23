// Recibo de um recebimento (preparação T07, DOCX §7).
// ===================================================
//
// Um recibo por baixa, gravado em Documentos com o texto final — reimprimir
// depois de outro pagamento continua descrevendo ESTA baixa. Recibo de
// pagamento parcial diz o que foi pago e o que restou, sem quitação geral.
// Se o recebimento for estornado, o recibo emitido continua guardado (e a
// tela do contrato mostra o estorno ao lado).
//
// A redação segue o padrão dos outros documentos e fica sujeita à mesma
// revisão do escritório (§7.8 da preparação de novas funções).
//
// Acordo com repasse (out/2026): quem paga é a parte contrária, e o escritório
// recebe como procurador do cliente. O recibo diz isso e separa os honorários
// da parte do cliente — repassada ou a repassar, na data da emissão. Quando a
// parte do cliente foi paga direto a ele (20/10/2026), o recibo é só dos
// honorários que entraram, e diz que o resto não passou pelo escritório.
//
// Antecipação (22/10/2026): o pagamento que quitou a parcela e abateu as
// últimas do contrato sai num recibo só, com o total e cada parte.

import { centavos, data, documento, moeda, percentual } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';
import { valorPorExtenso } from '../dominio/extenso.js';
import { emLista, nomeDaParcela, nomesDasParcelas } from '../dominio/parcelas.js';
import { dado, folha } from './partes.js';

const AVULSAS = {
  consulta: 'consulta', sucumbencia: 'honorários de sucumbência', exito: 'honorários de êxito',
  reembolso_custas: 'reembolso de custas', outros: 'outros serviços',
};

/**
 * @param {object} p
 * @param {object} p.recebimento   linha de v_recebimentos
 * @param {object} [p.parcela]     linha de v_parcelas (sem ela, entrada avulsa)
 * @param {object} [p.contrato]    linha de v_contratos
 * @param {object} p.cliente       { nome, documento }
 * @param {number|null} p.saldoDepois  centavos que restaram na parcela depois desta baixa
 * @param {string} p.emitente      nome de quem emite
 * @param {string} p.dia           'AAAA-MM-DD' da emissão
 * @param {{ numero: number, vencimento?: string, valor: number, saldoDepois?: number|null }[]} [p.antecipacoes]
 *   as partes antecipadas deste pagamento (centavos), da última parcela para a primeira
 */
export function montarRecibo({ recebimento: r, parcela, contrato, cliente, saldoDepois, emitente, dia, antecipacoes = [] }) {
  const antecipado = antecipacoes.reduce((soma, a) => soma + a.valor, 0);
  const valor = centavos(r.valor) + antecipado;
  const referente = r.parcela_id
    ? html`${nomeDaParcela(r.parcela_numero).toLowerCase()} do contrato ${contrato?.codigo ? html`<strong>${contrato.codigo}</strong> — ` : ''}${r.contrato_descricao}${parcela ? html`, com vencimento em ${data(parcela.vencimento)}` : ''}`
    : html`${AVULSAS[r.tipo_avulsa] ?? 'serviços advocatícios'}${r.descricao ? html` (${r.descricao})` : ''}`;
  const comDoc = cliente.documento ? html`, inscrito(a) no ${cliente.documento.length === 14 ? 'CNPJ' : 'CPF'} sob o nº ${documento(cliente.documento)}` : '';
  // "referente à parcela", "à entrada", "à consulta"; "a honorários", "a reembolso".
  const a = r.parcela_id || r.tipo_avulsa === 'consulta' ? 'à' : 'a';

  const composicao = [
    [antecipado ? `${nomeDaParcela(r.parcela_numero)} — abatido do valor devido` : 'Abatido do valor devido', centavos(r.valor_principal)],
    ...(r.encargos_discriminados
      ? [['Correção monetária', centavos(r.valor_correcao)], ['Multa', centavos(r.valor_multa)],
        ['Juros', centavos(r.valor_juros)], ['Acréscimo', centavos(r.valor_acrescimo)]]
      : [['Multa, juros e correção', centavos(r.valor_encargos)]]),
    ...antecipacoes.map((x) => [`Antecipação — ${nomeDaParcela(x.numero)}${x.vencimento ? ` (vence ${data(x.vencimento)})` : ''}`, x.valor]),
  ].filter(([, v]) => v > 0);

  const repasse = centavos(r.valor_repasse);
  const direto = centavos(r.valor_direto_cliente ?? 0);
  const cotas = r.cota_encargos_pct != null && Number(r.cota_encargos_pct) !== Number(r.cota_escritorio_pct)
    ? `${percentual(r.cota_escritorio_pct)}; multa e juros, ${percentual(r.cota_encargos_pct)}` : percentual(r.cota_escritorio_pct);
  if (direto > 0) return folha('Recibo', reciboDireto({ r, valor, direto, cotas, a, referente, comDoc, cliente, saldoDepois }), dia,
    [['Fonseca Lisboa Advocacia', emitente]]);
  const corpo = html`
    <p>Recebemos${repasse > 0 ? ', na qualidade de procuradores de' : ' de'} <strong>${dado(cliente.nome?.toUpperCase(), 'CLIENTE')}</strong>${comDoc}, a importância de
      <strong>${moeda(valor)}</strong> (${valorPorExtenso(valor)}), referente ${a} ${referente}${antecipado ? ', e à antecipação de parcelas vincendas do mesmo contrato' : ''}, paga em ${data(r.data)}${r.forma_nome ? `, por ${r.forma_nome}` : ''}.</p>
    ${repasse > 0 ? html`
      <p>Deste valor, <strong>${moeda(valor - repasse)}</strong> correspondem aos honorários advocatícios
        (${cotas}) e <strong>${moeda(repasse)}</strong> (${valorPorExtenso(repasse)}) pertencem
        ao(à) cliente, ${r.repasse_data ? `repassados em ${data(r.repasse_data)}` : 'a serem repassados'}.</p>` : ''}
    ${composicao.length > 1 ? html`
      <table class="doc-tabela">
        <tbody>
          ${composicao.map(([rotulo, v]) => html`<tr><td>${rotulo}</td><td class="num">${moeda(v)}</td></tr>`)}
          <tr><td><strong>Total recebido</strong></td><td class="num"><strong>${moeda(valor)}</strong></td></tr>
        </tbody>
      </table>` : ''}
    ${r.parcela_id && saldoDepois != null && antecipado ? html`
      <p>Com este pagamento, a ${nomeDaParcela(r.parcela_numero).toLowerCase()} fica quitada e, com a antecipação, ${situacaoDasAntecipadas(antecipacoes)}.</p>`
      : r.parcela_id && saldoDepois != null ? html`
      <p>${saldoDepois > 0
        ? html`Depois deste pagamento, permanece em aberto nesta parcela o valor de <strong>${moeda(saldoDepois)}</strong> (${valorPorExtenso(saldoDepois)}).`
        : 'Com este pagamento, esta parcela fica quitada.'}</p>` : ''}
    <p>Este recibo se refere exclusivamente ao valor acima e não dá quitação de outras parcelas ou obrigações${antecipado ? ', além das indicadas neste recibo' : ''}.</p>
    <p class="doc-nota">Recibo nº ${r.id.slice(0, 8).toUpperCase()} · lançamento de ${data(String(r.criado_em).slice(0, 10))}</p>`;

  return folha('Recibo', corpo, dia, [['Fonseca Lisboa Advocacia', emitente]]);
}

/** "as parcelas 6 e 5 ficam quitadas e a parcela 4 fica com R$ 300,00 em aberto". */
function situacaoDasAntecipadas(antecipacoes) {
  const quitadas = antecipacoes.filter((x) => !(x.saldoDepois > 0)).map((x) => x.numero);
  const partes = [];
  if (quitadas.length) {
    partes.push(quitadas.length === 1 ? `a ${nomesDasParcelas(quitadas)} fica quitada` : `as ${nomesDasParcelas(quitadas)} ficam quitadas`);
  }
  for (const x of antecipacoes.filter((y) => y.saldoDepois > 0)) {
    partes.push(`a ${nomeDaParcela(x.numero).toLowerCase()} fica com ${moeda(x.saldoDepois)} em aberto`);
  }
  return emLista(partes);
}

/** Acordo em que a parte contrária pagou a parte do cliente direto a ele: o
 *  escritório recebeu só os honorários. */
function reciboDireto({ r, valor, direto, cotas, a, referente, comDoc, cliente, saldoDepois }) {
  const pago = valor + direto;
  return html`
    <p>Recebemos, na qualidade de procuradores de <strong>${dado(cliente.nome?.toUpperCase(), 'CLIENTE')}</strong>${comDoc}, a importância de
      <strong>${moeda(valor)}</strong> (${valorPorExtenso(valor)}), correspondente aos honorários advocatícios (${cotas}) sobre o
      pagamento de ${moeda(pago)} feito pela parte contrária em ${data(r.data)}${r.forma_nome ? `, por ${r.forma_nome}` : ''}, referente ${a} ${referente}.</p>
    <p>A parte do(a) cliente, <strong>${moeda(direto)}</strong> (${valorPorExtenso(direto)}), foi paga diretamente a ele(a) pela
      parte contrária e não passou pelo escritório.</p>
    <table class="doc-tabela">
      <tbody>
        <tr><td>Abatido do valor devido</td><td class="num">${moeda(centavos(r.valor_principal))}</td></tr>
        ${centavos(r.valor_encargos) > 0 ? html`<tr><td>Multa, juros e correção</td><td class="num">${moeda(centavos(r.valor_encargos))}</td></tr>` : ''}
        <tr><td>Total pago pela parte contrária</td><td class="num">${moeda(pago)}</td></tr>
        <tr><td>Pago diretamente ao(à) cliente</td><td class="num">− ${moeda(direto)}</td></tr>
        <tr><td><strong>Recebido pelo escritório</strong></td><td class="num"><strong>${moeda(valor)}</strong></td></tr>
      </tbody>
    </table>
    ${saldoDepois != null ? html`
      <p>${saldoDepois > 0
        ? html`Depois deste pagamento, permanece em aberto nesta parcela o valor de <strong>${moeda(saldoDepois)}</strong> (${valorPorExtenso(saldoDepois)}).`
        : 'Com este pagamento, esta parcela fica quitada.'}</p>` : ''}
    <p>Este recibo se refere exclusivamente ao valor acima e não dá quitação de outras parcelas ou obrigações.</p>
    <p class="doc-nota">Recibo nº ${r.id.slice(0, 8).toUpperCase()} · lançamento de ${data(String(r.criado_em).slice(0, 10))}</p>`;
}

/** Saldo na ordem dos lançamentos, sem usar descontos ou estornos posteriores. */
export function saldoDepoisDe(recebimento, recebimentosDaParcela, valorCentavos, ajustes = []) {
  const corte = Date.parse(recebimento.criado_em);
  const valia = (x) => Date.parse(x.criado_em) <= corte
    && (!x.estornado_em || Date.parse(x.estornado_em) > corte);
  const exigivelCentavos = ajustes.filter(valia).reduce((s, x) => s + (x.tipo === 'acrescimo' ? 1 : -1) * centavos(x.valor), valorCentavos);
  const ate = recebimentosDaParcela
    .filter(valia)
    .reduce((s, x) => s + centavos(x.valor_principal), 0);
  return Math.max(0, exigivelCentavos - ate);
}
