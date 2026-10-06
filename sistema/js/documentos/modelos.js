// Os oito modelos de documento (preparação, Apêndice A).
// ======================================================
//
// A redação é a do protótipo do Vinícius, transcrita sem mudança: cada
// parágrafo fica numa linha só, para o texto jurídico não se misturar com o
// código. Mudar redação é decisão do escritório (§7.8 da preparação) — os
// pontos de revisão continuam pendentes.
//
// Cada modelo recebe { cliente, detalhes, processo, advogados, dados, hoje }
// e devolve a folha inteira (partes.js → folha). `complementos` são os campos
// que a tela "Gerar documento" pede além do cadastro.

import { centavos, data, documento, lerMoeda, moeda, numeroCnj, telefone } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';
import { advogados, dado, endereco, estadoCivil, folha, qualificacao } from './partes.js';

const campo = (nome, rotulo, tipo = 'text', extra = {}) => ({ nome, rotulo, tipo, ...extra });

function modelo({ id, titulo, nome = titulo, descricao, complementos = [], corpo, assinaturas = [['Declarante']] }) {
  return {
    id,
    titulo,
    nome,
    descricao,
    complementos,
    montar(ctx) {
      const c = { ...ctx, cliente: ctx.cliente ?? {}, detalhes: ctx.detalhes ?? {}, dados: ctx.dados ?? {}, advogados: ctx.advogados ?? [] };
      const quem = typeof assinaturas === 'function' ? assinaturas(c) : assinaturas;
      return folha(titulo, corpo(c), c.dados.data_emissao || c.hoje, quem);
    },
  };
}

// ---------------------------------------------------------------------------
// Pedaços que os modelos repetem
// ---------------------------------------------------------------------------

const q = (ctx) => qualificacao(ctx.cliente, ctx.detalhes);

/** Advogados marcados na tela; sem escolha, todos os ativos com OAB. */
const selecionados = (ctx) => (ctx.dados.advogados_ids
  ? ctx.advogados.filter((m) => ctx.dados.advogados_ids.includes(m.id))
  : ctx.advogados);
const a = (ctx) => advogados(selecionados(ctx));

/** Número dos autos: o digitado no complemento, o CNJ do processo ou a referência. */
const numero = (ctx) => ctx.dados.processo
  || (ctx.processo?.numero && numeroCnj(ctx.processo.numero))
  || ctx.processo?.referencia
  || '';

const dinheiro = (v, rotulo) => {
  const n = lerMoeda(v);
  return n !== null && Number.isFinite(n) ? moeda(n) : html`R$ ${dado(null, rotulo)}`;
};

const GARANTIAS = { nenhuma: 'Nenhuma', fianca: 'Fiança', penhor: 'Penhor', hipoteca: 'Hipoteca', anticrese: 'Anticrese' };
const FORMAS_RENUNCIA = { com_comunicacao: 'Com comunicação e prazo de 10 dias', outro_procurador: 'Parte segue com outro procurador' };
const campoProcesso = campo('processo', 'Número dos autos / referência');

// ---------------------------------------------------------------------------
// 1. Procuração
// ---------------------------------------------------------------------------

const procuracao = modelo({
  id: 'procuracao',
  titulo: 'Procuração',
  descricao: 'Poderes e advogados outorgados.',
  assinaturas: [['Outorgante']],
  corpo: (ctx) => html`
    <p><strong>Outorgante(s):</strong> ${q(ctx)}.</p>
    <p><strong>Outorgado(s):</strong> ${a(ctx)}</p>
    <p><strong>Poderes:</strong> Amplos, gerais e ilimitados para o foro em geral, ou onde com este se apresentarem em nome do(a) outorgante, em juízo ou fora dele, como autor, réu, assistente ou opoente, podendo propor ou contestar ações, participar de processos incidentes, preliminares, cautelares, acessórios e especiais para defesa de todo e qualquer interesse ou direito do(a) outorgante.</p>
    <p>Conferem-se, ainda, poderes para transigir, receber e dar quitação, levantar quantias depositadas, inclusive fianças, firmar compromissos, celebrar acordos, apresentar memoriais, recorrer a qualquer instância ou tribunal, substabelecer com ou sem reserva de iguais poderes, representar perante repartições públicas, autarquias, empresas públicas, sociedades de economia mista, estabelecimentos bancários e demais pessoas jurídicas de direito público ou privado, bem como requerer justiça gratuita quando necessário.</p>`,
});

// ---------------------------------------------------------------------------
// 2. Contrato de honorários
// ---------------------------------------------------------------------------

const contratoHonorarios = modelo({
  id: 'contrato_honorarios',
  titulo: 'Contrato de Honorários',
  descricao: 'Objeto, honorários, garantia e contratados.',
  complementos: [
    campoProcesso,
    campo('objeto', 'Objeto', 'textarea'),
    campo('area', 'Área jurídica', 'area'),
    campo('garantia', 'Garantia', 'select', { opcoes: GARANTIAS, padrao: 'nenhuma' }),
    campo('valor_total', 'Valor total (R$)'),
    campo('entrada', 'Entrada (R$)'),
    campo('parcelas', 'Número de parcelas', 'number', { min: 1 }),
    campo('valor_parcela', 'Valor da parcela (R$)'),
    campo('dia_vencimento', 'Dia do vencimento', 'number', { min: 1, max: 31 }),
    campo('exito', 'Êxito (%)', 'number', { min: 0, max: 100, padrao: 30 }),
  ],
  assinaturas: [['Contratante(s)'], ['Contratado(a)(s)']],
  corpo: (ctx) => {
    const d = ctx.dados;
    const objeto = d.objeto || `promover a defesa de seus direitos${numero(ctx) ? ` nos autos de n.º ${numero(ctx)}` : ''}`;
    const garantia = ({ fianca: 'fiança', penhor: 'penhor', hipoteca: 'hipoteca', anticrese: 'anticrese' })[d.garantia] || 'nenhuma';
    // Campo apagado na tela vira pendência visível, não "% sobre o proveito".
    const exito = dado(d.exito ?? 30, 'ÊXITO');
    return html`
    <p><strong>Contratante(s):</strong> ${q(ctx)}.</p>
    <p><strong>Contratado(s):</strong> ${a(ctx)}</p>
    <p><strong>Termos:</strong> As partes, expressando suas vontades, com fundamento no art. 593 e seguintes do Código Civil c/c Lei n.º 8.906/1994, decidem por <strong>CONTRATAR</strong>, nos seguintes termos:</p>
    <p><strong>1. Objeto</strong> — 1.1. O presente acordo tem como objeto ajustar o binômio dos honorários advocatícios e da contratação de serviços jurídico-profissionais a serem prestados, em especial para ${objeto}.</p>
    <p><strong>2. Vigência</strong> — 2.1. A duração deste pacto é indeterminada e está ligada à obrigação do contratante e à duração do processo/procedimento objeto, encerrando-se com decisão final, sentença, acórdão, portaria/resolução ou ato equivalente.</p>
    <p><strong>3. Honorários advocatícios</strong> — 3.1. O contratante pagará aos contratados ${dinheiro(d.valor_total, 'VALOR')}, parcelado em ${dado(d.parcelas, 'N.º')} vez(es) de ${dinheiro(d.valor_parcela, 'PARCELA')}, todo dia ${dado(d.dia_vencimento, 'DIA')} de cada mês subsequente à assinatura deste instrumento, e ${exito}% sobre o proveito econômico do processo, cumprindo o art. 22 do Estatuto da OAB e respeitando o art. 85, §14, do CPC.</p>
    <p>3.2. Nas ações criminais, em sendo arbitrada fiança, ao final, se absolvido ou arquivado o processo, poderá o contratado levantar a fiança e retê-la para deduzir/compensar valores devidos.</p>
    <p>3.3. Nas ações trabalhistas, em caso de pagamento por parcelamento, o contratante autoriza que os contratados adiantem 30% dos honorários em parcela única na primeira prestação, ou procedam à dedução necessária para saldar os honorários.</p>
    <p>3.4. Nas ações previdenciárias, se os valores retroativos forem suficientes, os honorários serão pagos em parcela única; sendo insuficientes, proceder-se-á ao desconto máximo viável, permanecendo saldo remanescente em pagamento mensal.</p>
    <p>3.5. O atraso no pagamento ensejará vencimento antecipado das demais parcelas, cobrança integral, correção monetária, juros de 1% ao mês e multa compensatória de 10%.</p>
    <p>3.6. Os honorários de sucumbência não excluem os honorários aqui pactuados, por possuírem natureza distinta.</p>
    <p><strong>4. Garantia</strong> — 4.1. Garantia selecionada: <strong>${garantia}</strong>. Salvo detalhamento específico, o contrato não possui outras garantias pessoais/fidejussórias ou reais.</p>
    <p><strong>5. Obrigações</strong> — 5.1. O contratante compromete-se a prestar informações, documentos, indicar testemunhas e manter seus dados atualizados. Declara ciência de que a advocacia não assegura certeza de sucesso, constituindo meio de acesso à justiça, não promessa de resultado.</p>
    <p>5.2. Os contratados comprometem-se a prestar serviços jurídico-profissionais com zelo, técnica e diligência, com base nas informações e provas apresentadas.</p>
    <p><strong>6. Foro</strong> — 6.1. Para dirimir controvérsias oriundas deste instrumento, fica eleito o foro competente, sem prejuízo das regras legais aplicáveis.</p>`;
  },
});

// ---------------------------------------------------------------------------
// 3. Declaração de hipossuficiência
// ---------------------------------------------------------------------------

const hipossuficiencia = modelo({
  id: 'hipossuficiencia',
  titulo: 'Declaração de Hipossuficiência',
  descricao: 'Declaração com qualificação do assistido.',
  corpo: (ctx) => html`
    <p>${q(ctx)}, assegurado(a) pelo art. 5º, LXXIV, da Constituição Federal, ecoado no art. 98 do Código de Processo Civil, com fundamento na Lei n.º 7.115/1983, e ciente das penas legais, <strong>DECLARO-ME POBRE NA CONCEPÇÃO JURÍDICO-LEGAL</strong>, não tendo condições de suportar despesas processuais sem prejuízo do sustento próprio e/ou de minha família.</p>`,
});

// ---------------------------------------------------------------------------
// 4. Declaração de endereço
// ---------------------------------------------------------------------------

const declaracaoEndereco = modelo({
  id: 'declaracao_endereco',
  titulo: 'Declaração',
  nome: 'Declaração de Endereço',
  descricao: 'Pessoa que reside com o cliente declarante.',
  complementos: [
    campo('pessoa_declarada', 'Pessoa declarada'),
    campo('documento_declarado', 'CPF / CNPJ da pessoa declarada'),
  ],
  corpo: (ctx) => {
    const pessoa = dado(ctx.dados.pessoa_declarada || ctx.cliente.nome, 'PESSOA DECLARADA');
    const doc = dado(documento(ctx.dados.documento_declarado || ctx.cliente.documento), 'CPF/CNPJ');
    return html`
    <p>Eu, ${q(ctx)}, com fundamento na Lei n.º 7.115/1983, e ciente das penas legais às quais me submeto, <strong>DECLARO</strong> que ${pessoa} (CPF/CNPJ: ${doc}) tem seu domicílio junto a mim, no endereço ${endereco(ctx.detalhes)}.</p>`;
  },
});

// ---------------------------------------------------------------------------
// 5. Declaração de comparecimento
// ---------------------------------------------------------------------------

const declaracaoComparecimento = modelo({
  id: 'declaracao_comparecimento',
  titulo: 'Declaração',
  nome: 'Declaração de Comparecimento',
  descricao: 'Data de comparecimento e advogado declarante.',
  complementos: [
    campo('advogado_id', 'Advogado declarante', 'advogado'),
    campo('data_comparecimento', 'Data do comparecimento', 'date'),
    campo('empresa', 'Destinatário / empresa'),
  ],
  corpo: (ctx) => {
    const m = ctx.dados.advogado_id
      ? ctx.advogados.find((x) => x.id === ctx.dados.advogado_id && x.ativo && x.oab)
      : selecionados(ctx).find((x) => x.ativo && x.oab);
    return html`
    <p>Eu, <strong>${dado(m?.nome.toUpperCase(), 'NOME DO ADVOGADO')}</strong>, advogado(a), inscrito(a) nos quadros da ${dado(m?.oab, 'OAB')}, <strong>DECLARO</strong>, para os devidos fins legais, que ${q(ctx)} compareceu a este escritório profissional na data de ${dado(data(ctx.dados.data_comparecimento), 'DATA DO COMPARECIMENTO')}.</p>
    <p>Em razão disso, solicita-se que sejam abonadas quaisquer faltas e/ou prejuízos que porventura possam recair sobre seu funcionário, conforme art. 473, VIII, da Consolidação das Leis do Trabalho c/c art. 463 do Código de Processo Civil.</p>
    ${ctx.dados.empresa ? html`<p><strong>Destinatário/empresa:</strong> ${ctx.dados.empresa}.</p>` : ''}`;
  },
});

// ---------------------------------------------------------------------------
// 6. Ficha de atendimento ao assistido
// ---------------------------------------------------------------------------

/** Linha da ficha: rótulo e valor, ou dois pares lado a lado. */
const linhaFicha = (rotulo, valor, rotulo2, valor2, classe = '') => html`<tr><th>${rotulo}</th><td ${rotulo2 ? '' : html`colspan="3"`} ${classe ? html`class="${classe}"` : ''}>${valor}</td>${rotulo2 ? html`<th>${rotulo2}</th><td>${valor2}</td>` : ''}</tr>`;

const fichaAtendimento = modelo({
  id: 'ficha_atendimento',
  titulo: 'Ficha de Atendimento ao Assistido',
  descricao: 'Dados do assistido, fatos narrados e orientação.',
  complementos: [campoProcesso, campo('fatos', 'Fatos narrados e orientação', 'textarea')],
  assinaturas: [['Assistido']],
  corpo: (ctx) => {
    const c = ctx.cliente;
    const d = ctx.detalhes;
    return html`
    <table class="doc-ficha"><tbody>
      ${linhaFicha('Nome', dado(c.nome, 'NOME DO CLIENTE'), 'CPF/CNPJ', dado(documento(c.documento), 'CPF/CNPJ'))}
      ${linhaFicha('Nacionalidade', dado(d.nacionalidade, 'nacionalidade'), 'DN', dado(data(d.nascimento), 'nascimento'))}
      ${linhaFicha('Filiação', dado(d.filiacao, 'filiação'))}
      ${linhaFicha('Endereço', endereco(d))}
      ${linhaFicha('Estado civil', estadoCivil(d), 'Profissão', dado(d.profissao, 'profissão'))}
      ${linhaFicha('e-mail', dado(c.email, 'e-mail'), 'Telefone', dado(telefone(c.telefone), 'telefone'))}
      ${linhaFicha('Banco', dado(d.banco, 'banco'), 'Ag.', dado(d.agencia, 'agência'))}
      ${linhaFicha('Conta', dado(d.conta, 'conta'), 'PIX', dado(d.pix, 'PIX'))}
      ${linhaFicha('Obs.', c.observacoes || '—')}
      ${linhaFicha('N.º dos autos, fatos narrados e orientação', dado(ctx.dados.fatos || numero(ctx), 'FATOS NARRADOS E ORIENTAÇÃO'), null, null, 'doc-ficha-relato')}
    </tbody></table>
    <p><strong>DECLARO</strong> que os dados acima são verdadeiros e, tendo ciência do teor do art. 298 do Decreto-Lei n.º 2.848/1940, por ser expressão da verdade, firmo.</p>`;
  },
});

// ---------------------------------------------------------------------------
// 7. Renúncia de mandato
// ---------------------------------------------------------------------------

const renuncia = modelo({
  id: 'renuncia',
  titulo: 'Renúncia de Mandato',
  descricao: 'Renunciantes e forma de comunicação.',
  complementos: [
    campoProcesso,
    campo('forma', 'Forma', 'select', { opcoes: FORMAS_RENUNCIA, padrao: 'com_comunicacao' }),
    campo('comunicacao', 'Comunicação / ciência', 'textarea'),
  ],
  // Uma assinatura por advogado renunciante.
  assinaturas: (ctx) => {
    const ms = selecionados(ctx).filter((m) => m.ativo && m.oab);
    return ms.length ? ms.map((m) => ['Advogado(a) renunciante', m.nome]) : [['Advogado(a) renunciante']];
  },
  corpo: (ctx) => html`
    <p>Nós, ${a(ctx)}, <strong>RENUNCIAMOS TODOS E QUAISQUER PODERES</strong> a nós conferidos por qualquer procuração outorgada por ${q(ctx)}, para atuar em favor de seus interesses${numero(ctx) ? ` nos autos de n.º ${numero(ctx)}` : ''}.</p>
    <p>Assim, por força do art. 112 da Lei n.º 13.105/2015 c/c art. 5º, §3º, da Lei n.º 8.906/1994, ${ctx.dados.forma === 'outro_procurador' ? 'considerando que a parte segue representada por outro procurador, os renunciantes deixam de representá-la e de comunicá-la, ressalvada a ciência quando necessária.' : 'os renunciantes continuarão a representar o renunciado pelos próximos 10 dias, salvo se forem substituídos antes do término desse prazo.'}</p>
    ${ctx.dados.comunicacao ? html`<p><strong>Comunicação/ciência:</strong> ${ctx.dados.comunicacao}.</p>` : ''}
    <p>Assinam os advogados renunciantes, para fins de formalização da renúncia e ciência do ato, dispensada assinatura do assistido se tomada ciência por meios digitais efetivos.</p>`,
});

// ---------------------------------------------------------------------------
// 8. Termo de prestação de contas
// ---------------------------------------------------------------------------

const prestacaoContas = modelo({
  id: 'prestacao_contas',
  titulo: 'Termo de Prestação de Contas',
  descricao: 'Demonstrativo dos valores e repasse ao cliente.',
  complementos: [
    campoProcesso,
    campo('data_contrato', 'Data do contrato', 'date'),
    campo('valor_total', 'Total contratado (R$)'),
    campo('total_pago', 'Total pago (R$)'),
    campo('valor_repassado', 'Valor repassado ao cliente (R$)'),
  ],
  assinaturas: [['Contratante(s)'], ['Contratado(a)(s)']],
  corpo: (ctx) => {
    // Vindo do contrato (Financeiro): parcelas válidas e recebimentos não estornados.
    const parcelas = (ctx.dados.financeiro?.parcelas ?? []).filter((p) => !['cancelada', 'renegociada'].includes(p.situacao));
    const recebimentos = (ctx.dados.financeiro?.recebimentos ?? []).filter((r) => !r.estornado_em);
    const linhas = parcelas.length
      ? parcelas.map((p) => html`<tr><td>${data(p.vencimento)} - ${moeda(centavos(p.valor))}</td><td>${recebimentos.filter((r) => r.parcela_id === p.id).map((r) => html`<p>${data(r.data)} - ${moeda(centavos(r.valor))}</p>`)}</td></tr>`)
      : html`<tr><td>${dado(null, 'VENCIMENTO E VALOR')}</td><td>${dado(null, 'PAGAMENTO E VALOR')}</td></tr>`;
    return html`
    <p><strong>Contratante(s):</strong> ${q(ctx)}.</p>
    <p><strong>Contratados:</strong> ${a(ctx)}</p>
    <p><strong>Termos:</strong> Considerando o dever de prestar contas contido no art. 34, XXI, da Lei n.º 8.906/1994; considerando o contrato de honorários ajustado entre as partes em ${dado(data(ctx.dados.data_contrato), 'DATA DO CONTRATO')}; considerando os valores recebidos nos autos de n.º ${dado(numero(ctx), 'N.º DOS AUTOS')} e repassados ao(à) contratante, temos:</p>
    <p><em>Demonstrativo de parcelas pagas, vencidas e vincendas, até o presente momento:</em></p>
    <table class="doc-tabela"><thead><tr><th>Data de vencimento - valor da parcela</th><th>Data de pagamento - valor pago</th></tr></thead><tbody>
      ${linhas}
      <tr><td><strong>Total contratado:</strong> ${dinheiro(ctx.dados.valor_total, 'VALOR')}</td><td><strong>Total pago:</strong> ${dinheiro(ctx.dados.total_pago, 'VALOR PAGO')}</td></tr>
    </tbody></table>
    <p><em>Demonstrativo de valor pago ao(à) contratante, na data de assinatura deste termo:</em></p>
    <p><strong>${dinheiro(ctx.dados.valor_repassado, 'VALOR REPASSADO')}</strong></p>
    <p>Ambas as partes, de comum acordo com todas as quantias acima descritas, declaram nada mais ter a reclamar uma da outra, assinando este instrumento, dando-o valor de recibo e de renúncia ao recebimento e/ou cobrança de quaisquer outros valores referentes a estes autos.</p>`;
  },
});

// ---------------------------------------------------------------------------

const LISTA = [procuracao, contratoHonorarios, hipossuficiencia, declaracaoEndereco, declaracaoComparecimento,
  fichaAtendimento, renuncia, prestacaoContas];

export const MODELOS = Object.fromEntries(LISTA.map((m) => [m.id, m]));

/** Nome na lista de documentos — as duas declarações têm o mesmo título no papel. */
export const TITULOS_MODELO = {
  ...Object.fromEntries(LISTA.map((m) => [m.id, m.nome])),
  relatorio_atividades: 'Relatório de Atividades',
};
