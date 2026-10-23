// Documentos solicitados e entregues num processo (pedido do Vinícius, 22/10/2026).
// ================================================================================
//
// "Registrar o documento solicitado ou entregue, quem recebeu, a data e o
// prazo previsto para retorno." O escritório pede um documento (ao cliente,
// ao cartório, ao INSS) ou entrega um, e acompanha quando ele deve voltar.
// O retorno de fato se registra depois; nada se apaga.
//
// Arquivo puro, sem navegador: é testado em sistema/testes/.

import { data, diasEntre } from '../nucleo/formato.js';

export const MOVIMENTOS = { solicitado: 'Solicitado', entregue: 'Entregue' };

export const COLUNAS_DOCUMENTO_PROCESSO = 'id,processo_id,cliente_id,documento,movimento,data,quem_recebeu,'
  + 'retorno_previsto,retornou_em,observacoes,cancelado_em,cancelado_por,motivo_cancelamento,criado_em,criado_por,alterado_em';

/** O retorno perto: avisa a partir de 3 dias antes. */
export const DIAS_AVISO_RETORNO = 3;

const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * A situação de um registro numa data.
 * @returns {{ chave: 'cancelado'|'retornou'|'sem_prazo'|'atrasado'|'hoje'|'perto'|'aguardando', texto: string, tom: string }}
 */
export function situacaoDocumento(d, dia) {
  if (d.cancelado_em) return { chave: 'cancelado', texto: 'Cancelado', tom: 'escuro' };
  if (d.retornou_em) return { chave: 'retornou', texto: `Retornou em ${data(d.retornou_em)}`, tom: 'ok' };
  if (!d.retorno_previsto) return { chave: 'sem_prazo', texto: 'Sem retorno previsto', tom: '' };
  const faltam = diasEntre(dia, d.retorno_previsto);
  if (faltam < 0) return { chave: 'atrasado', texto: `Retorno atrasado · ${dias(-faltam)}`, tom: 'perigo' };
  if (faltam === 0) return { chave: 'hoje', texto: 'Retorno previsto para hoje', tom: 'alerta' };
  if (faltam <= DIAS_AVISO_RETORNO) return { chave: 'perto', texto: `Retorno em ${dias(faltam)} · ${data(d.retorno_previsto)}`, tom: 'alerta' };
  return { chave: 'aguardando', texto: `Retorno previsto ${data(d.retorno_previsto)}`, tom: '' };
}

const ESPERANDO = ['hoje', 'perto', 'aguardando'];

/** Para a linha do processo: quantos registros, quantos aguardam retorno com
 *  prazo (atrasados inclusive, como no filtro e em Hoje) e quantos estão
 *  atrasados. Cancelados não contam; sem prazo não é "aguardando". */
export function resumoDocumentos(lista = [], dia) {
  const chaves = lista.filter((d) => !d.cancelado_em).map((d) => situacaoDocumento(d, dia).chave);
  return {
    total: chaves.length,
    aguardando: chaves.filter((c) => c === 'atrasado' || ESPERANDO.includes(c)).length,
    atrasados: chaves.filter((c) => c === 'atrasado').length,
  };
}

/** O que aguarda retorno primeiro, do mais urgente; depois os outros, do mais
 *  novo ao mais antigo; cancelados no fim. */
export function ordenarDocumentos(lista, dia) {
  const peso = (d) => {
    const c = situacaoDocumento(d, dia).chave;
    return c === 'cancelado' ? 3 : c === 'atrasado' || ESPERANDO.includes(c) ? 0 : c === 'sem_prazo' ? 1 : 2;
  };
  return [...lista].sort((a, b) => peso(a) - peso(b)
    || (peso(a) === 0 ? a.retorno_previsto.localeCompare(b.retorno_previsto) : b.data.localeCompare(a.data))
    || String(b.criado_em ?? '').localeCompare(String(a.criado_em ?? '')));
}

const texto = (v) => String(v ?? '').trim();
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');
const somarAnos = (iso, anos) => `${Number(iso.slice(0, 4)) + anos}${iso.slice(4)}`;

/**
 * Confere e limpa o formulário (as mesmas regras do banco). O erro leva
 * `campo`, para a mensagem aparecer no campo certo (nucleo/formularios.js).
 * Sem `retornou_em` no formulário (registro novo), o retorno fica vazio.
 */
export function prepararDocumentoProcesso(d, dia) {
  const erro = (campo, mensagem) => Object.assign(new Error(mensagem), { campo });
  const documento = texto(d.documento);
  if (!documento) throw erro('documento', 'Informe o documento.');
  if (documento.length > 200) throw erro('documento', 'O nome do documento pode ter até 200 letras.');
  if (!MOVIMENTOS[d.movimento]) throw erro('movimento', 'Escolha se o documento foi solicitado ou entregue.');
  if (!d.data) throw erro('data', 'Informe a data.');
  // O campo de data do navegador aceita ano de 3 ou 5 dígitos (0202, 20261).
  if (!dataValida(d.data) || d.data < '2000-01-01') throw erro('data', 'Confira o ano da data.');
  if (d.data > dia) throw erro('data', 'A data não pode estar no futuro.');
  const quem = texto(d.quem_recebeu);
  if (quem.length > 200) throw erro('quem_recebeu', 'Quem recebeu pode ter até 200 letras.');
  const retorno = d.retorno_previsto || null;
  if (retorno && (!dataValida(retorno) || retorno > somarAnos(d.data, 20))) throw erro('retorno_previsto', 'Confira o ano do prazo previsto para retorno.');
  if (retorno && retorno < d.data) throw erro('retorno_previsto', 'O retorno previsto não pode ser antes da data do registro.');
  const retornou = d.retornou_em || null;
  if (retornou && !dataValida(retornou)) throw erro('retornou_em', 'Confira o ano da data do retorno.');
  if (retornou && retornou < d.data) throw erro('retornou_em', 'O retorno não pode ser antes da data do registro.');
  if (retornou && retornou > dia) throw erro('retornou_em', 'A data do retorno não pode estar no futuro.');
  const observacoes = texto(d.observacoes);
  if (observacoes.length > 2000) throw erro('observacoes', 'As observações podem ter até 2.000 letras.');
  return {
    documento,
    movimento: d.movimento,
    data: d.data,
    quem_recebeu: quem || null,
    retorno_previsto: retorno,
    retornou_em: retornou,
    observacoes: observacoes || null,
  };
}
