// Importação da planilha financeira: o modelo e a leitura (preparação T15).
// ========================================================================
//
// A planilha oficial do escritório ainda não chegou. Em vez de adivinhar o
// formato dela, o sistema aceita um MODELO documentado: uma linha por
// parcela de contrato (com o que já foi pago dela) ou por despesa. Os
// títulos das colunas são reconhecidos sem acento e sem diferença de
// maiúsculas; colunas a mais são ignoradas.
//
// Aqui só se lê e normaliza. Quem valida de verdade, aponta divergência e
// carrega é o banco (registrar_importacao, validar_importacao,
// carregar_importacao). Célula vazia nunca vira "zero pago".
//
// Arquivo puro: é testado em sistema/testes/.

import { documentoValido, lerMoeda, limparDocumento, semAcento, soDigitos } from '../nucleo/formato.js';

export const VERSAO_PARSER = 'modelo-fhl-2026-10-08';

export const COLUNAS_PARCELA = [
  ['tipo', 'parcela (ou despesa)'],
  ['cliente', 'nome do cliente'],
  ['cpf_cnpj', 'CPF ou CNPJ (opcional; liga ao cliente já cadastrado)'],
  ['telefone', 'opcional'],
  ['codigo', 'código do contrato na planilha antiga (opcional; fica como o código do contrato)'],
  ['contrato', 'descrição do contrato'],
  ['processo', 'número do processo (opcional)'],
  ['data_contrato', 'data de formalização, DD/MM/AAAA (opcional)'],
  ['valor_total', 'valor total do contrato (opcional; confere a soma das parcelas)'],
  ['parcela', 'número da parcela (0 = entrada; opcional)'],
  ['vencimento', 'DD/MM/AAAA'],
  ['valor', 'valor da parcela'],
  ['valor_pago', 'quanto já foi pago desta parcela (vazio = nada)'],
  ['data_pagamento', 'DD/MM/AAAA, se houve pagamento'],
];

export const COLUNAS_DESPESA = [
  ['tipo', 'despesa'],
  ['descricao', 'descrição da despesa'],
  ['categoria', 'categoria (Aluguel, Energia…; desconhecida vira Outros)'],
  ['tipo_despesa', 'fixa, variavel ou extraordinaria (opcional)'],
  ['competencia', 'mês da despesa, MM/AAAA (opcional; padrão: o do vencimento)'],
  ['vencimento', 'DD/MM/AAAA'],
  ['valor', 'valor da despesa'],
  ['valor_pago', 'quanto já foi pago (vazio = nada)'],
  ['data_pagamento', 'DD/MM/AAAA, se houve pagamento'],
];

/** O modelo para baixar: cabeçalho + dois exemplos fictícios de cada tipo. */
export function linhasDoModelo() {
  const cab = [...new Set([...COLUNAS_PARCELA, ...COLUNAS_DESPESA].map(([c]) => c))];
  const linha = (o) => cab.map((c) => o[c] ?? '');
  return [cab,
    linha({ tipo: 'parcela', cliente: 'Cliente Exemplo', cpf_cnpj: '529.982.247-25', codigo: 'P-001', contrato: 'Honorários — ação de exemplo', data_contrato: '10/01/2026', valor_total: '1.000,00', parcela: '1', vencimento: '10/02/2026', valor: '500,00', valor_pago: '500,00', data_pagamento: '12/02/2026' }),
    linha({ tipo: 'parcela', cliente: 'Cliente Exemplo', cpf_cnpj: '529.982.247-25', codigo: 'P-001', contrato: 'Honorários — ação de exemplo', data_contrato: '10/01/2026', valor_total: '1.000,00', parcela: '2', vencimento: '10/03/2026', valor: '500,00' }),
    linha({ tipo: 'despesa', descricao: 'Aluguel de janeiro', categoria: 'Aluguel', tipo_despesa: 'fixa', competencia: '01/2026', vencimento: '05/01/2026', valor: '1.500,00', valor_pago: '1.500,00', data_pagamento: '05/01/2026' }),
  ];
}

const chaveDe = (t) => semAcento(String(t ?? '')).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const SINONIMOS = {
  cpf: 'cpf_cnpj', cnpj: 'cpf_cnpj', documento: 'cpf_cnpj', cpf_cnpj: 'cpf_cnpj',
  descricao_do_contrato: 'contrato', contrato: 'contrato', descricao: 'descricao',
  n_parcela: 'parcela', numero_da_parcela: 'parcela', parcela: 'parcela',
  data_de_vencimento: 'vencimento', vencimento: 'vencimento',
  valor_da_parcela: 'valor', valor: 'valor', pago: 'valor_pago', valor_pago: 'valor_pago', valor_recebido: 'valor_pago',
  data_do_pagamento: 'data_pagamento', data_pagamento: 'data_pagamento', pago_em: 'data_pagamento',
  codigo: 'codigo', codigo_do_contrato: 'codigo', numero_do_contrato: 'codigo',
};
const nomeCanonico = (t) => {
  const k = chaveDe(t);
  return SINONIMOS[k] ?? k;
};

/** "10/02/2026", "2026-02-10", Date do Excel já convertida → 'AAAA-MM-DD'. Vazio → null; inválida → NaN. */
export function lerData(valor) {
  if (valor == null || String(valor).trim() === '') return null;
  const t = String(valor).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return valida(`${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  return NaN;
}
const valida = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : NaN;
};

/** "01/2026" ou data → primeiro dia do mês. */
const lerMes = (valor) => {
  const t = String(valor ?? '').trim();
  const m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return valida(`${m[2]}-${m[1].padStart(2, '0')}-01`);
  const d = lerData(t);
  return typeof d === 'string' ? `${d.slice(0, 7)}-01` : d;
};

/** Número do Excel (reais) ou texto "1.234,56" → reais com 2 casas. */
function lerValor(valor) {
  if (valor == null || String(valor).trim() === '') return null;
  if (typeof valor === 'number') return Math.round(valor * 100) / 100;
  const c = lerMoeda(valor);
  return Number.isNaN(c) ? NaN : c / 100;
}

/**
 * Linhas de células (a primeira é o cabeçalho) → linhas para a preparação.
 * @param {any[][]} linhas
 * @param {string} aba
 * @returns {{ linhas: object[], ignoradas: number, colunas: string[] }}
 */
export function normalizarPlanilha(linhas, aba = '') {
  const inicio = linhas.findIndex((l) => l.some((c) => String(c ?? '').trim()));
  if (inicio < 0) return { linhas: [], ignoradas: 0, colunas: [] };
  const cab = linhas[inicio].map(nomeCanonico);
  const resultado = [];
  let ignoradas = 0;
  const tipoDaAba = /despesa/i.test(semAcento(aba)) ? 'despesa' : /parcela|receb|contrat/i.test(semAcento(aba)) ? 'parcela' : null;

  linhas.slice(inicio + 1).forEach((celulas, i) => {
    const linha = inicio + 2 + i;
    const bruto = Object.fromEntries(cab.map((c, j) => [c, celulas[j] ?? null]));
    if (!Object.values(bruto).some((v) => String(v ?? '').trim())) return;
    const texto = (c) => (bruto[c] == null ? null : String(bruto[c]).trim() || null);
    // Linhas de total e subtotal da planilha antiga não são dado — o "Total"
    // pode estar na primeira célula preenchida ou no nome.
    const primeira = Object.values(bruto).map((v) => String(v ?? '').trim()).find(Boolean) ?? '';
    if ([primeira, texto('cliente') ?? texto('descricao') ?? texto('contrato') ?? ''].some((t) => /^(sub)?total\b/i.test(semAcento(t)))) {
      ignoradas++;
      return;
    }

    const tipo = /desp/i.test(texto('tipo') ?? '') ? 'despesa' : /parc|receb/i.test(texto('tipo') ?? '') ? 'parcela'
      : tipoDaAba ?? (texto('cliente') || texto('contrato') ? 'parcela' : 'despesa');
    const mensagens = [];
    const aviso = (t) => mensagens.push({ nivel: 'erro', texto: t, origem: 'arquivo' });
    const data = (c, rotulo) => {
      const d = lerData(bruto[c]);
      if (Number.isNaN(d)) aviso(`${rotulo} inválida: "${bruto[c]}".`);
      return typeof d === 'string' ? d : null;
    };
    const valor = (c, rotulo) => {
      const v = lerValor(bruto[c]);
      if (Number.isNaN(v)) aviso(`${rotulo} inválido: "${bruto[c]}".`);
      return typeof v === 'number' && !Number.isNaN(v) ? v : null;
    };

    let normalizado;
    let chave;
    if (tipo === 'parcela') {
      const doc = limparDocumento(texto('cpf_cnpj'));
      if (doc && !documentoValido(doc)) aviso('CPF/CNPJ com dígito verificador errado.');
      const processo = soDigitos(texto('processo'));
      normalizado = {
        cliente_nome: texto('cliente'),
        documento: doc && documentoValido(doc) ? doc : null,
        telefone: soDigitos(texto('telefone')) || null,
        codigo: texto('codigo'),
        descricao: texto('contrato') ?? texto('descricao'),
        processo: processo.length === 20 ? processo : texto('processo'),
        data_contrato: data('data_contrato', 'Data do contrato'),
        valor_total: valor('valor_total', 'Valor total'),
        parcela: texto('parcela') && /^\d+$/.test(texto('parcela')) ? Number(texto('parcela')) : null,
        vencimento: data('vencimento', 'Vencimento'),
        valor: valor('valor', 'Valor da parcela'),
        valor_pago: valor('valor_pago', 'Valor pago'),
        data_pagamento: data('data_pagamento', 'Data do pagamento'),
      };
      const base = normalizado.codigo
        ? `codigo:${chaveDe(normalizado.codigo)}`
        : `contrato:${normalizado.documento ?? chaveDe(normalizado.cliente_nome)}|${chaveDe(normalizado.descricao)}|${normalizado.data_contrato ?? ''}`;
      chave = base;
    } else {
      const comp = bruto.competencia == null || String(bruto.competencia).trim() === '' ? null : lerMes(bruto.competencia);
      if (Number.isNaN(comp)) aviso(`Competência inválida: "${bruto.competencia}".`);
      const tipoDespesa = chaveDe(texto('tipo_despesa'));
      normalizado = {
        descricao: texto('descricao') ?? texto('contrato'),
        categoria: texto('categoria'),
        tipo_despesa: ['fixa', 'variavel', 'extraordinaria'].includes(tipoDespesa) ? tipoDespesa : null,
        competencia: typeof comp === 'string' ? comp : null,
        vencimento: data('vencimento', 'Vencimento'),
        valor: valor('valor', 'Valor'),
        valor_pago: valor('valor_pago', 'Valor pago'),
        data_pagamento: data('data_pagamento', 'Data do pagamento'),
      };
      chave = `despesa:${chaveDe(normalizado.descricao)}|${normalizado.vencimento ?? ''}|${normalizado.valor ?? ''}`;
    }
    resultado.push({ aba, linha, tipo, dados: bruto, normalizado, mensagens, chave_origem: chave });
  });
  return { linhas: resultado, ignoradas, colunas: cab };
}

/** SHA-256 de um ArrayBuffer, em hexadecimal. */
export async function hashDoArquivo(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
