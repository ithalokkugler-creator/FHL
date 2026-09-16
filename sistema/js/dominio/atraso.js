// Atualização de parcela em atraso (preparação 6.5).
// ==================================================
//
// É a parte mais sensível do Financeiro: cálculo errado é cobrança errada.
// Por isso a função devolve sempre a MEMÓRIA do cálculo — cada etapa com o
// valor —, que aparece na tela, entra na mensagem de cobrança e fica gravada
// junto com o recebimento.
//
// Regra implementada, A VALIDAR PELO VINÍCIUS:
//
//   corrigido = saldo × fator do índice no período
//   multa     = corrigido × multa%                        uma vez só
//   juros     = corrigido × juros% ao mês × dias ÷ 30     simples, pró-rata
//   total     = corrigido + multa + juros
//
//   Carência: até N dias depois do vencimento, nada incide. Passado o prazo,
//   tudo conta desde o vencimento.
//
// É a regra do protótipo (multa e juros sobre a base, juros × dias/30), com a
// correção monetária que o próprio contrato de honorários do escritório prevê
// — a ordem das etapas segue o exemplo da preparação. Tudo em centavos, cada
// etapa arredondada para o centavo mais próximo.
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

import { data, diasEntre, moeda, percentual } from '../nucleo/formato.js';

// toFixed(6) antes de arredondar: 1234,5 em ponto flutuante às vezes chega
// como 1234,4999999998 e cairia para baixo.
const arredondar = (x) => Math.round(Number(x.toFixed(6)));

/**
 * @param {object} p
 * @param {number} p.saldo         centavos em aberto
 * @param {string} p.vencimento    'AAAA-MM-DD'
 * @param {string} p.dataCalculo   'AAAA-MM-DD' — hoje, ou a data do pagamento
 * @param {number} p.multaPct
 * @param {number} p.jurosMesPct
 * @param {number} [p.carenciaDias]
 * @param {object} [p.correcao]    { nome: 'IPCA', fator, meses: ['AAAA-MM'], faltando: [] } ou null
 */
export function atualizar({ saldo, vencimento, dataCalculo, multaPct = 0, jurosMesPct = 0, carenciaDias = 0, correcao = null }) {
  const dias = Math.max(diasEntre(vencimento, dataCalculo), 0);
  const base = { saldo, vencimento, dataCalculo, dias, multaPct, jurosMesPct, carenciaDias };

  if (dias === 0 || dias <= carenciaDias) {
    return {
      ...base,
      emAtraso: false,
      corrigido: saldo,
      correcao: 0,
      multa: 0,
      juros: 0,
      encargos: 0,
      total: saldo,
      indice: null,
      passos: [
        { rotulo: 'Saldo em aberto', valor: saldo },
        { rotulo: dias === 0 ? 'Em dia — sem encargos' : `Dentro da carência de ${carenciaDias} dias — sem encargos`, valor: 0 },
        { rotulo: 'Total', valor: saldo, total: true },
      ],
    };
  }

  // Deflação entra na conta acumulada, mas a dívida não fica abaixo do valor
  // nominal (STJ, Tema 678).
  const acumulado = correcao?.fator ?? 1;
  const fator = Math.max(1, acumulado);
  const corrigido = arredondar(saldo * fator);
  const multa = arredondar((corrigido * multaPct) / 100);
  const juros = arredondar(corrigido * (jurosMesPct / 100) * (dias / 30));
  const total = corrigido + multa + juros;

  const passos = [{ rotulo: 'Saldo em aberto', valor: saldo }];

  if (correcao) {
    const periodo = correcao.meses.length
      ? `${mesBR(correcao.meses[0])} a ${mesBR(correcao.meses.at(-1))}`
      : 'sem mês completo no período';
    passos.push({
      rotulo: `Correção pelo ${correcao.nome} (${periodo})`,
      detalhe: correcao.indisponivel
        ? 'Banco Central fora do ar agora — calculado sem correção'
        : `fator ${acumulado.toFixed(6).replace('.', ',')}`
          + (acumulado < 1 ? ' — deflação no período: fica o valor nominal' : '')
          + (correcao.faltando.length ? ` · sem índice publicado: ${correcao.faltando.map(mesBR).join(', ')}` : ''),
      valor: corrigido - saldo,
    });
  }

  passos.push(
    { rotulo: `Multa de ${percentual(multaPct)}`, detalhe: `sobre ${moeda(corrigido)}`, valor: multa },
    {
      rotulo: `Juros de ${percentual(jurosMesPct)} ao mês por ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
      detalhe: `${percentual(Number(((jurosMesPct * dias) / 30).toFixed(4)))} no período, desde ${data(vencimento)}`,
      valor: juros,
    },
    { rotulo: 'Total atualizado', valor: total, total: true },
  );

  return {
    ...base,
    emAtraso: true,
    corrigido,
    correcao: corrigido - saldo,
    multa,
    juros,
    encargos: total - saldo,
    total,
    indice: correcao
      ? { nome: correcao.nome, fator: acumulado, aplicado: fator, meses: correcao.meses, faltando: correcao.faltando, indisponivel: Boolean(correcao.indisponivel) }
      : null,
    passos,
  };
}

const mesBR = (am) => `${am.slice(5, 7)}/${am.slice(0, 4)}`;

/** A memória que fica gravada no recebimento (recebimentos.memoria_calculo),
 *  em reais, legível direto no banco. */
export function memoriaParaGravar(r) {
  const reais = (c) => Math.round(c) / 100;
  return {
    calculado_em: r.dataCalculo,
    vencimento: r.vencimento,
    dias_atraso: r.dias,
    saldo: reais(r.saldo),
    indice: r.indice,
    corrigido: reais(r.corrigido),
    multa_pct: r.multaPct,
    multa: reais(r.multa),
    juros_mes_pct: r.jurosMesPct,
    juros: reais(r.juros),
    carencia_dias: r.carenciaDias,
    total: reais(r.total),
    passos: r.passos.map((p) => ({ rotulo: p.rotulo, detalhe: p.detalhe ?? null, valor: reais(p.valor) })),
  };
}
