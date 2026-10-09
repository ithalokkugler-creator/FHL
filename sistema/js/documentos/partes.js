// Peças comuns dos documentos (preparação, Apêndice A).
// =====================================================
//
// Qualificação, advogados, endereço, local e data, assinatura e a folha com
// cabeçalho e rodapé. Dado que falta não some do texto: aparece entre
// colchetes, destacado (`dado`), para ninguém imprimir sem perceber.
//
// Os trechos longos são montados em pedaços (`juntar`) e não com `+`: somar
// dois html`` vira texto comum, que seria escapado na hora de desenhar.

import { EMAIL, ENDERECO_DOCUMENTO, FORO, TEL } from '../escritorio.js';
import { dataPorExtenso, documento, telefone } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';

const juntar = (...pedacos) => html`${pedacos}`;

/** O valor, ou "[rótulo]" destacado quando está vazio. */
export const dado = (v, rotulo) => (v != null && String(v).trim() ? v : html`<span class="doc-falta">[${rotulo}]</span>`);

/** Concordância escolhida no cadastro; sem escolha, a forma com "(a)". */
export const flexao = (d, m, f) => (d.flexao === 'm' ? m : d.flexao === 'f' ? f : `${m}(a)`);

const ESTADOS_CIVIS = {
  solteiro: ['solteiro', 'solteira'],
  casado: ['casado', 'casada'],
  uniao_estavel: ['em união estável', 'em união estável'],
  separado: ['separado', 'separada'],
  divorciado: ['divorciado', 'divorciada'],
  viuvo: ['viúvo', 'viúva'],
};

export function estadoCivil(d) {
  const formas = ESTADOS_CIVIS[d.estado_civil];
  if (!formas) return dado(null, 'estado civil');
  return formas[0] === formas[1] ? formas[0] : flexao(d, ...formas);
}

export function endereco(d = {}) {
  if (!d.logradouro) return dado(null, 'ENDEREÇO COMPLETO');
  const cep = d.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  return juntar(
    html`${d.logradouro}, ${dado(d.numero, 'número')}${d.complemento ? `, ${d.complemento}` : ''}, `,
    html`${dado(d.bairro, 'bairro')}, ${dado(d.cidade, 'cidade')}/${dado(d.uf, 'UF')}, CEP ${dado(cep, 'CEP')}`,
  );
}

function nacionalidade(d) {
  if (!d.nacionalidade) return dado(null, 'nacionalidade');
  const brasileira = ['brasileira', 'brasileiro'].includes(d.nacionalidade.toLowerCase());
  return brasileira ? flexao(d, 'brasileiro', 'brasileira') : d.nacionalidade;
}

/** "Fulano, brasileiro, casado, …, domiciliado na …" — pessoa física ou jurídica. */
export function qualificacao(c = {}, d = {}) {
  if (d.tipo_pessoa === 'juridica') {
    return juntar(
      html`${dado(c.nome, 'NOME DO CLIENTE')}, pessoa jurídica de direito privado, `,
      html`inscrita no CNPJ sob o n.º ${dado(documento(c.documento), 'CNPJ')}, com sede na ${endereco(d)}, `,
      html`neste ato representada por ${dado(d.representante_nome, 'representante')}, `,
      dado(d.representante_qualificacao, 'qualificação do representante'),
    );
  }

  return juntar(
    html`${dado(c.nome, 'NOME DO CLIENTE')}, ${nacionalidade(d)}, ${estadoCivil(d)}, ${dado(d.profissao, 'profissão')}, `,
    html`${flexao(d, 'inscrito', 'inscrita')} no CPF/CNPJ de n.º ${dado(documento(c.documento), 'CPF/CNPJ')}, `,
    html`${flexao(d, 'domiciliado', 'domiciliada')} na ${endereco(d)}`,
    c.telefone ? `, telefone: ${telefone(c.telefone)}` : '',
    c.email ? `, e-mail: ${c.email}` : '',
    d.representante_nome
      ? html`, neste ato ${flexao(d, 'representado', 'representada')} por ${dado(d.representante_relacao, 'relação')} ${d.representante_nome}, ${dado(d.representante_qualificacao, 'qualificação do representante')}`
      : '',
  );
}

/** Os advogados escolhidos, um por um, e o endereço do escritório. Fica de
 *  fora quem está desativado ou não tem OAB (o suporte técnico do piloto). */
export function advogados(membros = []) {
  const ativos = membros.filter((m) => m.ativo && m.oab);
  const nomes = ativos.length
    ? ativos.map((m, i) => html`${i ? '; ' : ''}<strong>${m.nome.toUpperCase()}</strong>, advogado(a), inscrito(a) na ${m.oab}`)
    : dado(null, 'ADVOGADOS E OAB');
  return html`${nomes}, todos com escritório profissional localizado na ${ENDERECO_DOCUMENTO}, telefone: ${TEL}.`;
}

export const localEData = (iso) => `${FORO}, ${dataPorExtenso(iso)}.`;

export const assinatura = (rotulo, nome = '') =>
  html`<div class="doc-assinatura"><p>________________________________________</p><p>${nome ? html`${nome}<br>` : ''}${rotulo}</p></div>`;

/** A folha inteira: logomarca, título, corpo, local e data, assinaturas e rodapé. */
export function folha(titulo, corpo, dia, assinaturas = []) {
  return html`
    <div class="doc-cabecalho"><img src="/sistema/img/logo-documento.svg" alt="Fonseca Lisboa Advocacia"></div>
    <h1 class="doc-titulo">${titulo}</h1>
    ${corpo}
    <p class="doc-data">${localEData(dia)}</p>
    ${assinaturas.map(([rotulo, nome]) => assinatura(rotulo, nome))}
    <div class="doc-rodape">${ENDERECO_DOCUMENTO} | ${TEL} | ${EMAIL}</div>`;
}
