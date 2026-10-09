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

import { centavos, data, documento, moeda } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';
import { valorPorExtenso } from '../dominio/extenso.js';
import { nomeDaParcela } from '../dominio/parcelas.js';
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
 */
export function montarRecibo({ recebimento: r, parcela, contrato, cliente, saldoDepois, emitente, dia }) {
  const valor = centavos(r.valor);
  const referente = r.parcela_id
    ? html`${nomeDaParcela(r.parcela_numero).toLowerCase()} do contrato ${contrato?.codigo ? html`<strong>${contrato.codigo}</strong> — ` : ''}${r.contrato_descricao}${parcela ? html`, com vencimento em ${data(parcela.vencimento)}` : ''}`
    : html`${AVULSAS[r.tipo_avulsa] ?? 'serviços advocatícios'}${r.descricao ? html` (${r.descricao})` : ''}`;
  const comDoc = cliente.documento ? html`, inscrito(a) no ${cliente.documento.length === 14 ? 'CNPJ' : 'CPF'} sob o nº ${documento(cliente.documento)}` : '';

  const composicao = [
    ['Abatido do valor devido', centavos(r.valor_principal)],
    ...(r.encargos_discriminados
      ? [['Correção monetária', centavos(r.valor_correcao)], ['Multa', centavos(r.valor_multa)],
        ['Juros', centavos(r.valor_juros)], ['Acréscimo', centavos(r.valor_acrescimo)]]
      : [['Multa, juros e correção', centavos(r.valor_encargos)]]),
  ].filter(([, v]) => v > 0);

  const corpo = html`
    <p>Recebemos de <strong>${dado(cliente.nome?.toUpperCase(), 'CLIENTE')}</strong>${comDoc}, a importância de
      <strong>${moeda(valor)}</strong> (${valorPorExtenso(valor)}), referente a ${referente}, paga em ${data(r.data)}${r.forma_nome ? `, por ${r.forma_nome}` : ''}.</p>
    ${composicao.length > 1 ? html`
      <table class="doc-tabela">
        <tbody>
          ${composicao.map(([rotulo, v]) => html`<tr><td>${rotulo}</td><td class="num">${moeda(v)}</td></tr>`)}
          <tr><td><strong>Total recebido</strong></td><td class="num"><strong>${moeda(valor)}</strong></td></tr>
        </tbody>
      </table>` : ''}
    ${r.parcela_id && saldoDepois != null ? html`
      <p>${saldoDepois > 0
        ? html`Depois deste pagamento, permanece em aberto nesta parcela o valor de <strong>${moeda(saldoDepois)}</strong> (${valorPorExtenso(saldoDepois)}).`
        : 'Com este pagamento, esta parcela fica quitada.'}</p>` : ''}
    <p>Este recibo se refere exclusivamente ao valor acima e não dá quitação de outras parcelas ou obrigações.</p>
    <p class="doc-nota">Recibo nº ${r.id.slice(0, 8).toUpperCase()} · lançamento de ${data(String(r.criado_em).slice(0, 10))}</p>`;

  return folha('Recibo', corpo, dia, [['Fonseca Lisboa Advocacia', emitente]]);
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
