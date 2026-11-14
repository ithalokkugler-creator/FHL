// Um documento salvo: o texto final, como foi entregue. Não se edita (F3):
// imprimir ou baixar de novo registra outra geração; cancelar exige motivo.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe } from '../../nucleo/estado.js';
import { dataHora } from '../../nucleo/formato.js';
import { pode } from '../../nucleo/estado.js';
import { $, aoClicar, cru, desenhar, html } from '../../nucleo/html.js';
import { higienizar } from '../../nucleo/higienizar.js';
import { db } from '../../nucleo/supabase.js';
import {
  ajustarFolha, baixarWord, COLUNAS_DOCUMENTO, confirmarPendencias, imprimirDocumento, salvarDocumento,
} from '../../documentos/acoes.js';
import { TITULOS_MODELO } from '../../documentos/modelos.js';
import { repetirEmissao } from '../../documentos/catalogo.js';
import { cabecalho } from '../comum.js';
import { abrirHistorico } from '../historico.js';

export default async function telaDocumento(ctx) {
  const d = await db.um('documentos', { select: COLUNAS_DOCUMENTO, filtros: [['id', 'eq', ctx.params.id]] });
  if (!ctx.ativa()) return;
  if (!d) {
    desenhar(ctx.raiz, cabecalho('Documento não encontrado'));
    return;
  }

  const nome = d.modelo_versao_id ? d.titulo : TITULOS_MODELO[d.modelo] ?? d.titulo;
  const podeGravar = d.modelo === 'recibo' ? pode.lancar() : pode.clientes();
  // Recibo nasce do recebimento, no contrato; o resto, na tela de gerar.
  const gerarOutro = d.modelo === 'recibo'
    ? (d.contrato_id ? `#/financeiro/contratos/${d.contrato_id}` : '#/financeiro/relatorios')
    : d.modelo === 'relatorio_atividades'
      ? `#/atualizacoes/relatorio?cliente=${d.cliente_id}`
      : d.modelo_catalogo_id
        ? `#/documentos/novo?${new URLSearchParams({ modelo_catalogo:d.modelo_catalogo_id,cliente:d.cliente_id,
          ...(d.processo_id ? {processo:d.processo_id} : {}), ...(d.contrato_id ? {contrato:d.contrato_id} : {}),
          ...(d.compromisso_id ? {compromisso:d.compromisso_id} : {}), ...(d.atualizacao_id ? {atualizacao:d.atualizacao_id} : {}) })}`
        : `#/documentos/novo?cliente=${d.cliente_id}&modelo=${d.modelo}`;
  if (d.modelo === 'recibo' && !pode.clientes()) ctx.definirRetorno(gerarOutro.slice(1));
  desenhar(ctx.raiz, html`
    ${cabecalho(nome, `Gerado em ${dataHora(d.criado_em)} por ${nomeDe(d.criado_por)}`, html`
      ${d.cancelado_em ? '' : html`
        <button class="botao botao--primario" type="button" data-acao="imprimir">Imprimir de novo</button>
        <button class="botao" type="button" data-acao="word">Baixar para o Word</button>
        <a class="botao" href="${gerarOutro}">${d.modelo === 'recibo' ? 'Abrir o contrato' : 'Gerar outro'}</a>`}
      <button class="botao" type="button" data-acao="historico">Histórico</button>
      ${d.cancelado_em || !podeGravar ? '' : html`<button class="botao botao--discreto" type="button" data-acao="cancelar">Cancelar documento</button>`}`)}
    ${d.cancelado_em ? html`
      <p class="nota">Cancelado em ${dataHora(d.cancelado_em)} por ${nomeDe(d.cancelado_por)}. Motivo: ${d.motivo_cancelamento}</p>` : ''}
    <p class="sub">Texto final guardado, sem edição. Para corrigir, gere outro documento.${pode.clientes() ? html` · <a href="#/clientes/${d.cliente_id}">Abrir ficha do cliente</a>` : ''}</p>
    <p class="sub so-celular">No celular a folha aparece em modo de leitura. A impressão e o Word saem em A4.</p>
    <div class="documento-visualizacao secao">
      <article class="documento-folha ${d.modelo_versao_id ? 'doc-padrao-fl' : ''}" aria-label="Documento salvo">${cru(higienizar(d.conteudo))}</article>
    </div>`);
  const desligarFolha = ajustarFolha($('.documento-visualizacao', ctx.raiz));

  let ocupado = false;
  let tentativa = null;
  const executar = async (acao) => {
    if (ocupado) return;
    ocupado = true;
    const botoes = ctx.raiz.querySelectorAll('[data-acao=imprimir],[data-acao=word]');
    botoes.forEach((b) => { b.disabled = true; });
    try {
      const folha = $('.documento-folha', ctx.raiz);
      if (!await confirmarPendencias(folha, acao) || !ctx.ativa()) return;
      // Cada nova saída é uma geração nova, ligada à original.
      const { id, modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, atualizacao_id, recebimento_id, dados } = d;
      if (podeGravar && d.modelo_versao_id) {
        if (tentativa?.acao !== acao) tentativa = { id:crypto.randomUUID(),acao };
        await repetirEmissao({ ...tentativa,origem_id:id });
        tentativa = null;
      } else if (podeGravar) await salvarDocumento({
        modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, atualizacao_id, recebimento_id,
        dados: { ...dados, origem_documento: id, acao },
        conteudo: folha.innerHTML,
      });
      if (acao === 'word') await baixarWord(folha, nome);
      else imprimirDocumento(folha);
      if (podeGravar) avisar('Nova geração registrada.');
    } catch (erro) {
      avisarErro(erro);
    } finally {
      ocupado = false;
      botoes.forEach((b) => { b.disabled = false; });
    }
  };

  const desligar = aoClicar(ctx.raiz, {
    imprimir: () => executar('imprimir'),
    word: () => executar('word'),
    historico: () => abrirHistorico({ titulo: nome, registros: [d.id] }),
    cancelar: async () => {
      try {
        const motivo = await pedirMotivo({
          titulo: 'Cancelar documento',
          texto: 'O texto e o histórico serão preservados.',
          rotuloOk: 'Cancelar documento',
        });
        if (!motivo || !ctx.ativa()) return;
        await db.alterar('documentos', [['id', 'eq', d.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
        avisar('Documento cancelado.');
        await ctx.recarregar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
  return () => {
    desligar();
    desligarFolha();
  };
}
