import { EQUIPE_SITE } from '../../dominio/equipe-site.js';
import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { ErroCampo, limparErrosFormulario, mostrarErroFormulario, validarFormulario } from '../../nucleo/formularios.js';
import { $, aoClicar, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, vazio } from '../comum.js';
import { comoSlug, deLinhas, linhas, linkNoSite, notaOab } from './base.js';

const ROTA = '/site/areas';
const TABELA = 'areas_atuacao';
const RESUMO = 'id,slug,nome,advogados,posicao,publicado,alterado_em';
const ADVOGADOS = Object.values(EQUIPE_SITE);

async function alterarArea(area, dados) {
  const versao = area.alterado_em == null ? ['alterado_em', 'is', 'null'] : ['alterado_em', 'eq', area.alterado_em];
  try {
    await db.alterar(TABELA, [['id', 'eq', area.id], versao], dados, 'id');
  } catch (erro) {
    if (erro.message === 'Registro não encontrado ou sem permissão para alterar.') {
      throw new Error('A área mudou desde que você abriu esta tela ou seu acesso foi alterado. Reabra a área para conferir a versão atual.');
    }
    throw erro;
  }
}

export async function telaAreas(ctx) {
  let lista = [];

  async function mostrar() {
    lista = await db.listar(TABELA, { select: RESUMO, ordem: 'posicao.asc,slug.asc' });
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, html`
      ${cabecalho('Áreas de atuação', 'Gerencie as páginas de atuação do escritório', html`
        <a class="botao botao--primario" href="#${ROTA}/nova">Nova área</a>`)}
      <p class="pagina__nota">As alterações chegam ao site depois de <a href="#/site/publicar">publicar</a>.</p>
      <section class="painel">
        ${lista.length ? html`
          <div class="tabela-rolagem">
            <table class="tabela">
              <thead><tr><th>Posição</th><th>Área</th><th>Quem atende</th><th>Visibilidade</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${lista.map((area) => html`
                <tr class="${area.publicado ? '' : 'apagada'}">
                  <td>${area.posicao}</td>
                  <td>${area.nome}<span class="sub">atuacao/${area.slug}.html</span></td>
                  <td>${ADVOGADOS.filter((m) => area.advogados.includes(m.slug)).map((m) => m.nome).join(', ') || '—'}</td>
                  <td>${area.publicado ? html`<span class="selo selo--ok">Mostrar no site</span>` : html`<span class="selo selo--alerta">Oculta</span>`}</td>
                  <td class="acoes">
                    <a class="botao botao--pequeno" href="#${ROTA}/${area.id}">Editar</a>
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="visibilidade" data-id="${area.id}">${area.publicado ? 'Retirar do site' : 'Mostrar no site'}</button>
                    ${area.publicado ? linkNoSite(`atuacao/${area.slug}.html`) : ''}
                  </td>
                </tr>`)}
              </tbody>
            </table>
          </div>` : vazio('Nenhuma área cadastrada. Use “Nova área” para começar.')}
      </section>`);
  }

  await mostrar();
  return aoClicar(ctx.raiz, {
    visibilidade: (el) => {
      const area = lista.find((a) => a.id === el.dataset.id);
      const retirar = area.publicado;
      abrirDialogo({
        titulo: retirar ? 'Retirar área do site' : 'Mostrar área no site',
        rotuloOk: retirar ? 'Retirar do site' : 'Mostrar no site',
        perigo: retirar,
        corpo: html`
          <p class="dialogo__texto"><strong>${area.nome}</strong></p>
          <p class="dialogo__texto">${retirar
            ? 'Na próxima publicação, a página e os links para ela saem do site. A área fica salva para você poder restaurá-la.'
            : 'A página ficará disponível na próxima publicação do site.'}</p>`,
        aoEnviar: async () => {
          await alterarArea(area, { publicado: !retirar });
          avisar(retirar ? 'Área marcada para sair do site.' : 'Área marcada para aparecer no site.');
        },
      }).then((feito) => feito && ctx.ativa() && mostrar()).catch(avisarErro);
    },
  });
}

export async function telaArea(ctx) {
  const nova = ctx.params.id === 'nova';
  const area = nova ? null : await db.um(TABELA, {
    select: `${RESUMO},resumo,intro,itens,quando`, filtros: [['id', 'eq', ctx.params.id]],
  });
  if (!ctx.ativa()) return;

  desenhar(ctx.raiz, html`
    ${nova || area ? formulario(area) : cabecalho('Área não encontrada', 'Confira o endereço ou volte para a lista de áreas.')}`);
  if (!nova && !area) return;

  const form = $('form', ctx.raiz);
  if (nova) {
    let automatico = true;
    form.slug.addEventListener('input', () => { automatico = form.slug.value === ''; });
    form.nome.addEventListener('input', () => {
      if (automatico) form.slug.value = comoSlug(form.nome.value);
    });
  }

  const botao = $('button[type="submit"]', form);
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (botao.disabled) return;
    limparErrosFormulario(form);
    if (!validarFormulario(form)) return;

    botao.disabled = true;
    try {
      const { slug, nome, resumo, intro, itens, quando, posicao, publicado } = lerFormulario(form);
      if (nova && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)) {
        throw new ErroCampo('slug', 'Escolha outro endereço para a página.');
      }
      const demandas = deLinhas(itens);
      if (!demandas.length || demandas.length > 50 || demandas.some((i) => [...i].length > 400)) {
        throw new ErroCampo('itens', 'Informe de 1 a 50 demandas, com até 400 caracteres cada.');
      }
      const advogados = ADVOGADOS.filter((m) => form.elements.namedItem(m.slug).checked).map((m) => m.slug);
      const dados = { nome, resumo, intro, itens: demandas, quando, advogados, posicao: Number(posicao), publicado };
      if (nova) await db.inserir(TABELA, { ...dados, slug }, 'id');
      else await alterarArea(area, dados);
      if (ctx.ativa()) {
        avisar(nova ? 'Área criada.' : 'Área salva.');
        navegar(ROTA);
      }
    } catch (erro) {
      if (!ctx.ativa()) return;
      mostrarErroFormulario(form, erro.codigo === '23505'
        ? new ErroCampo('slug', 'Já existe uma área com esse endereço. Abra a área existente ou use outro endereço.') : erro);
    } finally {
      botao.disabled = false;
    }
  });
}

function formulario(area) {
  return html`
    ${cabecalho(area ? 'Editar área de atuação' : 'Nova área de atuação', area?.nome ?? 'Uma página de atuação do site')}
    <form class="painel" novalidate>
      <div class="painel__corpo">
        ${notaOab()}
        <fieldset class="grupo campos">
          <legend>Identificação</legend>
          <label class="campo campo--6">
            <span>Nome da área</span>
            <input name="nome" value="${area?.nome ?? ''}" required maxlength="120">
          </label>
          <label class="campo campo--3">
            <span>Endereço da página</span>
            <input name="slug" value="${area?.slug ?? ''}" ${area ? 'readonly' : 'required'} maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*">
            <span class="campo__ajuda">Use letras minúsculas, números e hífens. O endereço fica fixo após salvar.</span>
          </label>
          <label class="campo campo--3">
            <span>Posição</span>
            <input name="posicao" type="number" value="${area?.posicao ?? 100}" required min="1" max="9999">
            <span class="campo__ajuda">Menores números aparecem primeiro.</span>
          </label>
        </fieldset>
        <fieldset class="grupo campos">
          <legend>Textos da página</legend>
          <label class="campo">
            <span>Resumo</span>
            <textarea name="resumo" rows="2" maxlength="400" required>${area?.resumo ?? ''}</textarea>
            <span class="campo__ajuda">Aparece na lista de áreas e na página inicial.</span>
          </label>
          <label class="campo">
            <span>Introdução</span>
            <textarea name="intro" rows="4" maxlength="4000" required>${area?.intro ?? ''}</textarea>
          </label>
          <label class="campo">
            <span>Principais demandas</span>
            <textarea name="itens" rows="6" required>${linhas(area?.itens)}</textarea>
            <span class="campo__ajuda">Uma demanda por linha.</span>
          </label>
          <label class="campo">
            <span>Quando procurar o escritório</span>
            <textarea name="quando" rows="4" maxlength="4000" required>${area?.quando ?? ''}</textarea>
          </label>
        </fieldset>
        <fieldset class="grupo campos">
          <legend>Quem atende</legend>
          ${ADVOGADOS.map((m) => html`<label class="opcao campo--4">
            <input type="checkbox" name="${m.slug}" ${area?.advogados.includes(m.slug) ? 'checked' : ''}>
            ${m.nome}
          </label>`)}
        </fieldset>
        <div class="campo">
          <label class="opcao">
            <input type="checkbox" name="publicado" ${area?.publicado ? 'checked' : ''}>
            Mostrar no site
          </label>
          <span class="campo__ajuda">Vale a partir da próxima publicação do site.</span>
        </div>
      </div>
      <p class="erro-formulario" role="alert" hidden></p>
      <footer class="painel__rodape grupo-botoes">
        <button class="botao botao--primario" type="submit">${area ? 'Salvar' : 'Criar área'}</button>
        <a class="botao" href="#${ROTA}">Cancelar</a>
      </footer>
    </form>`;
}
