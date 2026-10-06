// Um documento salvo: o texto final, como foi entregue. Não se edita (F3):
// imprimir ou baixar de novo registra outra geração; cancelar exige motivo.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe } from '../../nucleo/estado.js';
import { dataHora } from '../../nucleo/formato.js';
import { $, aoClicar, cru, desenhar, html } from '../../nucleo/html.js';
import { higienizar } from '../../nucleo/higienizar.js';
import { db } from '../../nucleo/supabase.js';
import {
  ajustarFolha, baixarWord, COLUNAS_DOCUMENTO, confirmarPendencias, imprimirDocumento, salvarDocumento,
} from '../../documentos/acoes.js';
import { TITULOS_MODELO } from '../../documentos/modelos.js';
import { cabecalho } from '../comum.js';
import { abrirHistorico } from '../historico.js';

export default async function telaDocumento(ctx) {
  const d = await db.um('documentos', { select: COLUNAS_DOCUMENTO, filtros: [['id', 'eq', ctx.params.id]] });
  if (!ctx.ativa()) return;
  if (!d) {
    desenhar(ctx.raiz, html`${cabecalho('Documento não encontrado')}<a href="#/documentos">Voltar para Documentos</a>`);
    return;
  }

  const nome = TITULOS_MODELO[d.modelo] ?? d.titulo;
  const gerarOutro = d.modelo === 'relatorio_atividades'
    ? `#/atualizacoes/relatorio?cliente=${d.cliente_id}`
    : `#/documentos/novo?cliente=${d.cliente_id}&modelo=${d.modelo}`;

  desenhar(ctx.raiz, html`
    <a class="pagina__voltar" href="#/documentos">← Documentos</a>
    ${cabecalho(nome, `Gerado em ${dataHora(d.criado_em)} por ${nomeDe(d.criado_por)}`, html`
      ${d.cancelado_em ? '' : html`
        <button class="botao botao--primario" type="button" data-acao="imprimir">Imprimir de novo</button>
        <button class="botao" type="button" data-acao="word">Baixar para o Word</button>
        <a class="botao" href="${gerarOutro}">Gerar outro</a>`}
      <button class="botao" type="button" data-acao="historico">Histórico</button>
      ${d.cancelado_em ? '' : html`<button class="botao botao--discreto" type="button" data-acao="cancelar">Cancelar documento</button>`}`)}
    ${d.cancelado_em ? html`
      <p class="nota">Cancelado em ${dataHora(d.cancelado_em)} por ${nomeDe(d.cancelado_por)}. Motivo: ${d.motivo_cancelamento}</p>` : ''}
    <p class="sub">Texto final guardado, sem edição. Para corrigir, gere outro documento. · <a href="#/clientes/${d.cliente_id}">Abrir ficha do cliente</a></p>
    <div class="documento-visualizacao secao">
      <article class="documento-folha" aria-label="Documento salvo">${cru(higienizar(d.conteudo))}</article>
    </div>`);
  const desligarFolha = ajustarFolha($('.documento-visualizacao', ctx.raiz));

  let ocupado = false;
  const executar = async (acao) => {
    if (ocupado) return;
    ocupado = true;
    const botoes = ctx.raiz.querySelectorAll('[data-acao=imprimir],[data-acao=word]');
    botoes.forEach((b) => { b.disabled = true; });
    try {
      const folha = $('.documento-folha', ctx.raiz);
      if (!await confirmarPendencias(folha, acao) || !ctx.ativa()) return;
      // Cada nova saída é uma geração nova, ligada à original.
      const { id, modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, atualizacao_id, dados } = d;
      await salvarDocumento({
        modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, atualizacao_id,
        dados: { ...dados, origem_documento: id, acao },
        conteudo: folha.innerHTML,
      });
      if (acao === 'word') baixarWord(folha, nome);
      else imprimirDocumento(folha);
      avisar('Nova geração registrada.');
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
