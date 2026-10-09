// Anexos de um registro (preparação T07): contrato, aditivo, comprovante.
// =====================================================================
//
// Um diálogo para qualquer destino — cliente, contrato, renegociação,
// recebimento, despesa ou pagamento. O arquivo vai para o balde PRIVADO:
//
//   1. reservar_anexo: o banco confere a permissão e cria a versão com um
//      caminho opaco;
//   2. o arquivo sobe para esse caminho (sem sobrescrever nada);
//   3. a função de borda finalizar-anexo confere tipo, tamanho e calcula o
//      hash — só então o anexo vale. Falhou no meio? A versão fica
//      "reservada" e aparece como envio não concluído; não vira anexo.
//
// Baixar é por link assinado que vale um minuto. Versão nova é arquivo novo;
// a anterior continua guardada. Cancelar pede motivo e não apaga o arquivo.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../nucleo/dialogo.js';
import { estado, nomeDe } from '../nucleo/estado.js';
import { dataHora } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';
import { opcoes, vazio } from './comum.js';

export const CATEGORIAS_ANEXO = {
  comprovante: 'Comprovante de pagamento', contrato: 'Contrato assinado', aditivo: 'Aditivo',
  procuracao: 'Procuração', documento_pessoal: 'Documento pessoal', contrato_social: 'Contrato social',
  recibo: 'Recibo', nota_fiscal: 'Nota fiscal', outro: 'Outro',
};
const ACEITOS = 'application/pdf,image/png,image/jpeg,image/webp';
const LIMITE = 10 * 1024 * 1024;

const tamanho = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Envia um arquivo para o destino (ou como nova versão de `anexoId`). */
export async function enviarAnexo({ destino, arquivo, categoria = 'outro', descricao = '', anexoId = null }) {
  if (!arquivo) throw new Error('Escolha o arquivo.');
  if (arquivo.size > LIMITE) throw new Error('Arquivo maior que 10 MB.');
  if (!ACEITOS.split(',').includes(arquivo.type)) throw new Error('Envie PDF, PNG, JPG ou WEBP.');
  const reserva = await db.rpc('reservar_anexo', {
    p: { ...destino, anexo_id: anexoId, categoria, descricao: descricao || arquivo.name, nome_original: arquivo.name },
  });
  await db.enviarArquivoPrivado(reserva.balde, reserva.objeto, arquivo);
  return db.funcao('finalizar-anexo', { versao_id: reserva.versao_id });
}

export async function baixarAnexo(objeto) {
  // Abrir durante o clique preserva a ativação do usuário; esperar o link
  // primeiro faz os navegadores bloquearem a janela como pop-up.
  const janela = window.open('about:blank', '_blank');
  if (!janela) throw new Error('Permita abrir uma nova aba neste site para visualizar o anexo.');
  janela.opener = null;
  try {
    const url = await db.linkAssinado('anexos', objeto, 60);
    janela.location.replace(url);
  } catch (erro) {
    janela.close();
    throw erro;
  }
}

/**
 * @param {object} p
 * @param {string} p.titulo
 * @param {Record<string,string>} p.destino  ex.: { recebimento_id: '…' }
 * @param {boolean} p.podeGravar
 * @param {string} [p.categoria]  sugerida no envio
 */
export function abrirAnexos({ titulo, destino, podeGravar, categoria = 'outro' }) {
  const [campo, id] = Object.entries(destino)[0];
  let lista = [];
  let pendentes = [];

  return abrirDialogo({
    titulo: `Anexos — ${titulo}`,
    largo: true,
    somenteLeitura: true,
    corpo: html`
      <div data-papel="lista"><p class="carregando">Carregando…</p></div>
      ${podeGravar ? html`
        <fieldset class="fieldset campos secao" data-papel="envio">
          <legend>Anexar arquivo</legend>
          <label class="campo campo--6"><span>Arquivo (PDF, PNG, JPG ou WEBP, até 10 MB)</span><input type="file" name="arquivo" accept="${ACEITOS}"></label>
          <label class="campo campo--6"><span>Tipo</span><select name="categoria">${opcoes(Object.entries(CATEGORIAS_ANEXO), categoria)}</select></label>
          <label class="campo"><span>Descrição</span><input name="descricao" maxlength="200" placeholder="Ex.: comprovante do Pix de 05/10"></label>
          <p class="campo"><button type="button" class="botao botao--primario" data-acao="enviar">Enviar</button>
            <span class="sub" data-papel="estado-envio" role="status"></span></p>
        </fieldset>` : ''}
      <p class="nota">Os arquivos ficam num espaço privado: o link de download vale um minuto e só sai para quem pode ver este registro.</p>`,
    aoAbrir: (dialogo) => {
      const caixa = $('[data-papel="lista"]', dialogo);
      const carregar = async () => {
        lista = await db.todos('v_anexos', { select: '*', filtros: [[campo, 'eq', id]], ordem: 'criado_em.desc,id.asc' });
        pendentes = lista.length ? await db.todos('anexos_versoes', {
            select: 'id,anexo_id,versao,nome_original,estado,motivo_recusa,criado_em,criado_por',
            filtros: [['anexo_id', 'in', lista.map((a) => a.id)], ['estado', 'in', ['reservado', 'recusado']]],
            ordem: 'criado_em.desc',
          }) : [];
        desenhar(caixa, lista.length ? html`
          <ul class="anexos">
            ${lista.map((a) => html`
              <li class="${a.cancelado_em ? 'apagada' : ''}">
                <div>
                  <strong>${a.descricao}</strong>
                  <span class="sub">${CATEGORIAS_ANEXO[a.categoria] ?? a.categoria}${a.versao_atual > 1 ? ` · versão ${a.versao_atual}` : ''}
                    ${a.versao_id ? ` · ${a.nome_original} · ${tamanho(a.tamanho)} · ${dataHora(a.versao_criada_em)} por ${nomeDe(a.versao_criada_por)}` : ' · envio não concluído'}</span>
                  ${a.cancelado_em ? html`<span class="sub">Cancelado: ${a.motivo_cancelamento}</span>` : ''}
                  ${pendentes.filter((v) => v.anexo_id === a.id).map((v) => html`<span class="sub ${v.estado === 'recusado' ? 'perigo' : ''}">
                    Versão ${v.versao} (${v.nome_original}): ${v.estado === 'recusado' ? `recusada — ${v.motivo_recusa}` : 'envio não concluído'}</span>`)}
                </div>
                <div class="registro-acoes">
                  ${a.versao_id && !a.cancelado_em ? html`<button type="button" class="botao botao--pequeno" data-acao="baixar" data-objeto="${a.objeto}">Abrir</button>` : ''}
                  ${a.versao_atual > 1 && !a.cancelado_em ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${a.id}">Versões anteriores</button>` : ''}
                  ${podeGravar && !a.cancelado_em ? pendentes.filter((v) => v.anexo_id === a.id && v.estado === 'reservado' && v.criado_por === estado.membro.id).map((v) => html`<button type="button" class="botao botao--pequeno" data-acao="verificar" data-id="${v.id}">Verificar envio da versão ${v.versao}</button>`) : ''}
                  ${podeGravar && !a.cancelado_em ? html`
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="versao" data-id="${a.id}">Nova versão</button>
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="cancelar" data-id="${a.id}">Cancelar</button>` : ''}
                </div>
              </li>`)}
          </ul>` : vazio('Nenhum arquivo anexado.'));
      };
      carregar().catch(avisarErro);

      let versaoDe = null;
      const estadoEnvio = $('[data-papel="estado-envio"]', dialogo);
      aoClicar(dialogo, {
        baixar: (el) => baixarAnexo(el.dataset.objeto).catch(avisarErro),
        historico: async (el) => {
          try {
            const versoes = await db.todos('anexos_versoes', { select: 'versao,nome_original,objeto,tamanho,criado_em,criado_por', filtros: [['anexo_id', 'eq', el.dataset.id], ['estado', 'eq', 'verificado']], ordem: 'versao.desc' });
            abrirDialogo({ titulo: 'Versões do anexo', somenteLeitura: true, corpo: html`<ul class="lista">${versoes.map((v) => html`<li class="painel__corpo"><strong>Versão ${v.versao} — ${v.nome_original}</strong><p class="sub">${tamanho(v.tamanho)} · ${dataHora(v.criado_em)} por ${nomeDe(v.criado_por)}</p><button type="button" class="botao" data-acao="baixar" data-objeto="${v.objeto}">Abrir</button></li>`)}</ul>`, aoAbrir: (d) => aoClicar(d, { baixar: (b) => baixarAnexo(b.dataset.objeto).catch(avisarErro) }) });
          } catch (erro) { avisarErro(erro); }
        },
        verificar: async (el) => {
          el.disabled = true;
          try {
            await db.funcao('finalizar-anexo', { versao_id: el.dataset.id });
            avisar('Envio verificado.');
          } catch (erro) { avisarErro(erro); }
          finally { await carregar().catch(avisarErro); }
        },
        versao: (el) => {
          versaoDe = el.dataset.id;
          const a = lista.find((x) => x.id === versaoDe);
          estadoEnvio.textContent = `Nova versão de "${a.descricao}": escolha o arquivo e envie.`;
          $('[name="arquivo"]', dialogo).focus();
        },
        cancelar: async (el) => {
          const motivo = await pedirMotivo({ titulo: 'Cancelar anexo', texto: 'O arquivo continua guardado, marcado como cancelado.', rotuloOk: 'Cancelar anexo' });
          if (!motivo) return;
          try {
            await db.alterar('anexos', [['id', 'eq', el.dataset.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
            avisar('Anexo cancelado.');
            await carregar();
          } catch (erro) {
            avisarErro(erro);
          }
        },
        enviar: async (botao) => {
          const arquivo = $('[name="arquivo"]', dialogo).files[0];
          botao.disabled = true;
          estadoEnvio.textContent = 'Enviando e conferindo o arquivo…';
          try {
            await enviarAnexo({
              destino, arquivo, anexoId: versaoDe,
              categoria: $('[name="categoria"]', dialogo).value,
              descricao: $('[name="descricao"]', dialogo).value.trim(),
            });
            avisar(versaoDe ? 'Nova versão anexada.' : 'Arquivo anexado.');
            versaoDe = null;
            $('[name="arquivo"]', dialogo).value = '';
            $('[name="descricao"]', dialogo).value = '';
            estadoEnvio.textContent = '';
            await carregar();
          } catch (erro) {
            estadoEnvio.textContent = erro.message;
            await carregar().catch(() => {});
          } finally {
            botao.disabled = false;
          }
        },
      });
    },
  });
}
