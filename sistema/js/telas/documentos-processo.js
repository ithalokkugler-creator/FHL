// Documentos do processo (pedido do Vinícius, 22/10/2026).
// =========================================================
//
// O que o escritório pediu ou entregou — ao cliente, ao cartório, ao INSS —,
// quem recebeu, quando, e quando deve voltar. Abre da linha do processo, na
// lista de Processos e na ficha do cliente; o retorno perto ou atrasado
// aparece em Hoje. Nada se apaga: cancelar pede motivo e fica no histórico.
//
// Editar grava só o que mudou e só se ninguém mudou o registro depois que a
// tela o leu: duas pessoas no mesmo documento não apagam o retorno uma da outra.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../nucleo/dialogo.js';
import { nomeDe } from '../nucleo/estado.js';
import { data, dataHora, hoje, numeroCnj } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';
import {
  COLUNAS_DOCUMENTO_PROCESSO, MOVIMENTOS, ordenarDocumentos, prepararDocumentoProcesso, resumoDocumentos, situacaoDocumento,
} from '../dominio/documentos-processo.js';
import { plural, vazio } from './comum.js';
import { abrirHistorico } from './historico.js';

export const seloDocumento = (s) => html`<span class="selo${s.tom ? ` selo--${s.tom}` : ''}">${s.texto}</span>`;

/** Para a lista de processos: só o que precisa para o resumo da linha. */
export const COLUNAS_RESUMO_DOCUMENTOS = 'id,processo_id,movimento,data,retorno_previsto,retornou_em,cancelado_em';

/** Agrupa por processo, para a tabela. */
export const documentosPorProcesso = (lista) => lista.reduce((mapa, d) => {
  if (!mapa.has(d.processo_id)) mapa.set(d.processo_id, []);
  mapa.get(d.processo_id).push(d);
  return mapa;
}, new Map());

/** A linha de baixo do processo na tabela — "3 documentos · 2 aguardando
 *  retorno (1 atrasado)" — e abre os documentos (no celular, o botão
 *  Documentos fica do lado de lá da rolagem). */
export function resumoNaTabela(lista = [], dia = hoje(), processoId = null) {
  const r = resumoDocumentos(lista, dia);
  if (!r.total) return '';
  return html`<button type="button" class="processo-documentos" data-acao="documentos-processo" data-id="${processoId}">${plural(r.total, 'documento', 'documentos')}${r.aguardando
    ? html` · ${r.aguardando} aguardando retorno${r.atrasados ? html` <strong class="perigo">(${plural(r.atrasados, 'atrasado', 'atrasados')})</strong>` : ''}` : ''}</button>`;
}

const descricaoProcesso = (processo, clienteNome) => [
  clienteNome,
  processo.numero ? numeroCnj(processo.numero) : processo.referencia || 'Sem número judicial',
  processo.orgao,
].filter(Boolean).join(' · ');

function listaDocumentos(lista, dia) {
  if (!lista.length) return vazio('Nenhum documento registrado neste processo.');
  return html`
    <ul class="anexos docs-processo">
      ${lista.map((d) => html`
        <li class="${d.cancelado_em ? 'apagada' : ''}">
          <div class="docs-processo__topo">
            <strong>${d.documento}</strong>
            ${seloDocumento(situacaoDocumento(d, dia))}
          </div>
          <span class="sub">${MOVIMENTOS[d.movimento]} em ${data(d.data)}${d.quem_recebeu ? ` · quem recebeu: ${d.quem_recebeu}` : ''}${d.retorno_previsto && (d.retornou_em || d.cancelado_em) ? ` · retorno previsto para ${data(d.retorno_previsto)}` : ''}</span>
          ${d.observacoes ? html`<span class="sub docs-processo__obs">${d.observacoes}</span>` : ''}
          ${d.cancelado_em ? html`<span class="sub">Cancelado por ${nomeDe(d.cancelado_por)} em ${dataHora(d.cancelado_em)}: ${d.motivo_cancelamento}</span>` : ''}
          <span class="sub">Registrado por ${nomeDe(d.criado_por)} em ${dataHora(d.criado_em)}</span>
          <div class="registro-acoes">
            ${!d.cancelado_em && !d.retornou_em ? html`<button type="button" class="botao botao--pequeno" data-acao="retorno-documento" data-id="${d.id}"
              aria-label="Registrar retorno — ${d.documento}">Registrar retorno</button>` : ''}
            ${!d.cancelado_em ? html`
              <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-documento" data-id="${d.id}" aria-label="Editar — ${d.documento}">Editar</button>
              <button type="button" class="botao botao--pequeno botao--discreto" data-acao="cancelar-documento" data-id="${d.id}"
                aria-label="Cancelar registro — ${d.documento}">Cancelar registro</button>` : ''}
            <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico-documento" data-id="${d.id}" aria-label="Histórico — ${d.documento}">Histórico</button>
          </div>
        </li>`)}
    </ul>`;
}

/** Gravar com a tela atualizada: se outra tela mudou o registro, o banco não
 *  acha a linha (filtro por alterado_em) e a pessoa é avisada. */
async function gravarSeIgual(d, mudanca) {
  try {
    await db.alterar('processos_documentos', [['id', 'eq', d.id], d.alterado_em ? ['alterado_em', 'eq', d.alterado_em] : ['alterado_em', 'is', null]], mudanca, 'id');
  } catch (erro) {
    if (/não encontrado/i.test(erro.message)) throw new Error('Este registro mudou em outra tela depois que você o abriu. Feche, abra de novo e confira antes de salvar.');
    throw erro;
  }
}

/**
 * Lista e registro dos documentos de um processo. Devolve true se algo
 * mudou (para a tela de trás atualizar o resumo).
 */
export function abrirDocumentosProcesso({ processo, clienteNome = '' }) {
  let lista = [];
  let mudou = false;
  return abrirDialogo({
    titulo: `Documentos solicitados e entregues — ${processo.titulo}`,
    largo: true,
    somenteLeitura: true,
    corpo: html`
      <p class="dialogo__texto">${descricaoProcesso(processo, clienteNome)}</p>
      <p class="docs-processo__novo"><button type="button" class="botao botao--primario" data-acao="novo-documento" autofocus>Registrar documento</button>
        <span class="sub">Anote o que foi pedido ou entregue, a data, quem recebeu e quando deve voltar.</span></p>
      <div data-papel="lista"><p class="carregando">Carregando…</p></div>`,
    aoAbrir: (dialogo) => {
      const caixa = $('[data-papel="lista"]', dialogo);
      const carregar = async () => {
        lista = await db.todos('processos_documentos', {
          select: COLUNAS_DOCUMENTO_PROCESSO, filtros: [['processo_id', 'eq', processo.id]], ordem: 'data.desc,criado_em.desc',
        });
        const dia = hoje();
        desenhar(caixa, listaDocumentos(ordenarDocumentos(lista, dia), dia));
      };
      carregar().catch((erro) => {
        desenhar(caixa, vazio('Não foi possível carregar os documentos. Feche e abra de novo.'));
        avisarErro(erro);
      });
      const depois = async (promessa) => {
        try {
          if (await promessa) {
            mudou = true;
            await carregar();
            // O botão clicado sumiu com a lista redesenhada: o foco volta ao principal.
            $('[data-acao="novo-documento"]', dialogo)?.focus();
          }
        } catch (erro) {
          avisarErro(erro);
        }
      };
      const doc = (el) => lista.find((d) => d.id === el.dataset.id);
      aoClicar(dialogo, {
        'novo-documento': () => depois(formularioDocumento({ processo })),
        'editar-documento': (el) => depois(formularioDocumento({ processo, documento: doc(el) })),
        'retorno-documento': (el) => depois(registrarRetorno(doc(el))),
        'cancelar-documento': async (el) => {
          const d = doc(el);
          const motivo = await pedirMotivo({
            titulo: 'Cancelar registro',
            texto: `“${d.documento}” fica riscado no fim da lista, com o motivo, e continua no histórico.`,
            rotuloOk: 'Cancelar registro',
          });
          if (motivo) {
            depois(gravarSeIgual(d, { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo })
              .then(() => {
                avisar(`Registro cancelado: ${d.documento}.`);
                return true;
              }));
          }
        },
        'historico-documento': (el) => abrirHistorico({ titulo: doc(el).documento, registros: [el.dataset.id] }),
      });
    },
  }).then(() => mudou);
}

const ROTULOS_DATA = { solicitado: 'Data da solicitação', entregue: 'Data da entrega' };
const ROTULOS_QUEM = { solicitado: 'Quem recebeu o pedido', entregue: 'Quem recebeu o documento' };
const EXEMPLOS_QUEM = { solicitado: 'Ex.: Ana, do balcão do cartório', entregue: 'Ex.: o próprio cliente' };
const AJUDAS_MOVIMENTO = { solicitado: 'pedimos o documento a alguém', entregue: 'entregamos o documento a alguém' };

/** Registrar (sem `documento`) ou editar um documento do processo. */
function formularioDocumento({ processo, documento: d = null }) {
  const dia = hoje();
  const atual = d ?? { movimento: 'solicitado', data: dia };
  return abrirDialogo({
    titulo: d ? 'Editar documento' : 'Registrar documento',
    rotuloOk: d ? 'Salvar' : 'Registrar',
    corpo: html`
      <p class="dialogo__texto">${processo.titulo}</p>
      <div class="campos">
        <fieldset class="fieldset campos campo">
          <legend>O documento foi</legend>
          ${Object.entries(MOVIMENTOS).map(([valor, rotulo]) => html`
            <label class="opcao campo--6"><input type="radio" name="movimento" value="${valor}" ${atual.movimento === valor ? 'checked' : ''}>
              <span>${rotulo} <span class="sub">— ${AJUDAS_MOVIMENTO[valor]}</span></span></label>`)}
        </fieldset>
        <label class="campo"><span>Documento</span>
          <input name="documento" value="${atual.documento ?? ''}" required maxlength="200" placeholder="Ex.: certidão de matrícula do imóvel" autofocus></label>
        <label class="campo campo--6"><span data-rotulo-data>${ROTULOS_DATA[atual.movimento]}</span>
          <input type="date" name="data" value="${atual.data}" min="2000-01-01" max="${dia}" required></label>
        <label class="campo campo--6"><span data-rotulo-quem>${ROTULOS_QUEM[atual.movimento]}</span>
          <input name="quem_recebeu" value="${atual.quem_recebeu ?? ''}" maxlength="200" placeholder="${EXEMPLOS_QUEM[atual.movimento]}"></label>
        <label class="campo campo--6"><span>Prazo previsto para retorno</span>
          <input type="date" name="retorno_previsto" value="${atual.retorno_previsto ?? ''}" min="${atual.data}">
          <span class="campo__ajuda">Opcional. Com prazo, o documento aparece em Hoje 7 dias antes (amarelo nos últimos 3). Sem prazo, não há aviso.</span></label>
        ${d ? html`<label class="campo campo--6"><span>Retornou em</span>
          <input type="date" name="retornou_em" value="${d.retornou_em ?? ''}" min="${d.data}" max="${dia}">
          <span class="campo__ajuda">Vazio enquanto não voltar.</span></label>` : ''}
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2" maxlength="2000">${atual.observacoes ?? ''}</textarea></label>
      </div>`,
    aoAbrir: (dialogo, form) => {
      form.addEventListener('change', (e) => {
        if (e.target.name === 'movimento') {
          $('[data-rotulo-data]', form).textContent = ROTULOS_DATA[e.target.value];
          $('[data-rotulo-quem]', form).textContent = ROTULOS_QUEM[e.target.value];
          form.quem_recebeu.placeholder = EXEMPLOS_QUEM[e.target.value];
        }
        if (e.target.name === 'data' && form.data.value) {
          form.retorno_previsto.min = form.data.value;
          if (form.retornou_em) form.retornou_em.min = form.data.value;
        }
      });
    },
    aoEnviar: async (dados) => {
      const registro = prepararDocumentoProcesso(dados, hoje());
      if (d) {
        // Só o que mudou nesta tela; o resto fica como está no banco.
        const mudanca = Object.fromEntries(Object.entries(registro).filter(([k, v]) => (d[k] ?? null) !== v));
        if (!Object.keys(mudanca).length) return true;
        await gravarSeIgual(d, mudanca);
        avisar(`Documento salvo: ${registro.documento}.`);
      } else {
        const { retornou_em: _vazio, ...novo } = registro;
        await db.inserir('processos_documentos', { processo_id: processo.id, ...novo }, 'id');
        avisar(`Documento registrado: ${registro.documento}.`);
      }
      return true;
    },
  });
}

function registrarRetorno(d) {
  const dia = hoje();
  return abrirDialogo({
    titulo: 'Registrar retorno',
    rotuloOk: 'Registrar retorno',
    corpo: html`
      <p class="dialogo__texto">${d.documento} · ${MOVIMENTOS[d.movimento].toLowerCase()} em ${data(d.data)}${d.retorno_previsto ? ` · retorno previsto para ${data(d.retorno_previsto)}` : ''}</p>
      <label class="campo"><span>Retornou em</span>
        <input type="date" name="retornou_em" value="${dia}" min="${d.data}" max="${dia}" required autofocus></label>`,
    aoEnviar: async ({ retornou_em: retornou }) => {
      const { retornou_em: valido } = prepararDocumentoProcesso({ ...d, retornou_em: retornou }, hoje());
      await gravarSeIgual(d, { retornou_em: valido });
      avisar(`Retorno registrado: ${d.documento}.`);
      return true;
    },
  });
}
