// Site · Campanha — montar uma página de campanha.
// ================================================
//
// A ordem dos campos é a ordem da página no site, e a página segue quem chega
// de um anúncio ou de um post e decide em segundos se aquilo é com ele: a
// pergunta direta e o WhatsApp no topo, depois as situações em que a pessoa se
// reconhece, o que pode ser buscado, como funciona, documentos, dúvidas e
// contato (src/pages/campanhas.mjs).
//
// Seção sem conteúdo simplesmente não aparece — dá para publicar uma campanha
// só com o topo e o formulário, e ir enchendo o resto depois.

import { limparErrosFormulario, mostrarErroFormulario } from '../../nucleo/formularios.js';
import { avisar } from '../../nucleo/avisos.js';
import { hoje } from '../../nucleo/formato.js';
import { $, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, opcoes } from '../comum.js';
import { AREAS, comoSlug, deLinhas, dePares, linhas, linkNoSite, notaOab, pares } from './base.js';

const CAMPOS = 'id,slug,rotulo,titulo,subtitulo,descricao,whatsapp,area,inicio,fim,'
  + 'situacoes,direitos,passos,documentos,prazo,faq,publicado';

export default async function telaCampanha(ctx) {
  const nova = ctx.params.id === 'nova';
  const c = nova ? null : await db.um('campanhas', {
    select: CAMPOS,
    filtros: [['id', 'eq', ctx.params.id]],
  });
  if (!ctx.ativa()) return;

  if (!nova && !c) {
    desenhar(ctx.raiz, html`
      <a class="pagina__voltar" href="#/site/campanhas">← Campanhas</a>
      ${cabecalho('Campanha não encontrada', 'Ela pode ter sido aberta por um link antigo.')}`);
    return;
  }

  desenhar(ctx.raiz, tela(c, nova));

  const form = $('form', ctx.raiz);

  const mostrarErro = (falha) => {
    if (falha) mostrarErroFormulario(form, falha);
    else limparErrosFormulario(form);
  };

  let slugAutomatico = nova;
  form.slug.addEventListener('input', () => { slugAutomatico = false; });
  form.titulo.addEventListener('input', () => {
    if (slugAutomatico) form.slug.value = comoSlug(form.rotulo.value || form.titulo.value);
  });
  form.rotulo.addEventListener('input', () => {
    if (slugAutomatico) form.slug.value = comoSlug(form.rotulo.value);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarErro('');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const botao = $('[type="submit"]', form);
    try {
      const campanha = montar(lerFormulario(form), form);
      botao.disabled = true;
      if (nova) await db.inserir('campanhas', campanha, 'id');
      else await db.alterar('campanhas', [['id', 'eq', c.id]], campanha, 'id');
      avisar(nova ? 'Campanha criada.' : 'Campanha salva.');
      navegar('/site/campanhas');
    } catch (falha) {
      mostrarErro(falha);
      botao.disabled = false;
    }
  });
}

function montar(d, form) {
  const slug = comoSlug(d.slug);
  if (!slug) throw new Error('O endereço da página não pode ficar em branco.');
  if (d.inicio && d.fim && d.fim < d.inicio) throw new Error('O fim da campanha vem antes do início.');

  return {
    slug,
    rotulo: d.rotulo,
    titulo: d.titulo,
    subtitulo: d.subtitulo,
    descricao: d.descricao,
    whatsapp: d.whatsapp || null,
    area: form.area.value || null,
    inicio: d.inicio || null,
    fim: d.fim || null,
    situacoes: deLinhas(d.situacoes),
    direitos: dePares(d.direitos, 'Direitos'),
    passos: d.passos.trim() ? dePares(d.passos, 'Como funciona') : null,
    documentos: deLinhas(d.documentos),
    prazo: d.prazo || null,
    faq: dePares(d.faq, 'Perguntas frequentes'),
    publicado: form.publicado.checked,
  };
}

function tela(c, nova) {
  return html`
    <a class="pagina__voltar" href="#/site/campanhas">← Campanhas</a>
    ${cabecalho(
      nova ? 'Nova campanha' : 'Editar campanha',
      nova ? 'Uma página de campanha do site' : c.titulo,
      c?.publicado ? linkNoSite(`campanhas/${c.slug}.html`) : '',
    )}

    <form class="painel" novalidate>
      <div class="painel__corpo campos">
        ${notaOab()}

        <fieldset class="fieldset campos">
          <legend>Topo da página</legend>
          <label class="campo campo--4">
            <span>Rótulo</span>
            <input name="rotulo" value="${c?.rotulo ?? ''}" required maxlength="60" placeholder="Ex.: Acidente de trabalho">
            <span class="campo__ajuda">Texto pequeno acima do título.</span>
          </label>
          <label class="campo campo--8">
            <span>Título</span>
            <input name="titulo" value="${c?.titulo ?? ''}" required maxlength="160"
                   placeholder="Uma pergunta direta: “Sofreu um acidente de trabalho?”">
          </label>
          <label class="campo">
            <span>Subtítulo</span>
            <textarea name="subtitulo" rows="2" required maxlength="400">${c?.subtitulo ?? ''}</textarea>
            <span class="campo__ajuda">A frase logo abaixo do título: o que a pessoa pode ter direito a saber.</span>
          </label>
          <label class="campo">
            <span>Mensagem já escrita no WhatsApp</span>
            <input name="whatsapp" value="${c?.whatsapp ?? ''}" maxlength="200"
                   placeholder="Olá! Vim pela página sobre…">
            <span class="campo__ajuda">Chega digitada no WhatsApp de vocês — é como se sabe que o contato veio desta campanha.</span>
          </label>
        </fieldset>

        <fieldset class="fieldset campos">
          <legend>Endereço, área e período</legend>
          <label class="campo campo--6">
            <span>Endereço da página</span>
            <input name="slug" value="${c?.slug ?? ''}" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*">
            <span class="campo__ajuda">campanhas/&lt;endereço&gt;.html — é o link que vai no anúncio e no post.</span>
          </label>
          <label class="campo campo--6">
            <span>Área de atuação</span>
            <select name="area">${opcoes(AREAS.map((a) => [a.slug, a.nome]), c?.area ?? '', { vazio: 'Nenhuma' })}</select>
            <span class="campo__ajuda">Liga a campanha à página da área, nos dois sentidos.</span>
          </label>
          <label class="campo campo--6">
            <span>Início</span>
            <input type="date" name="inicio" value="${c?.inicio ?? (nova ? hoje() : '')}">
            <span class="campo__ajuda">Antes disso a página existe para revisar, mas fica fora do Google.</span>
          </label>
          <label class="campo campo--6">
            <span>Fim</span>
            <input type="date" name="fim" value="${c?.fim ?? ''}">
            <span class="campo__ajuda">Depois disso a página continua no ar, com aviso de encerrada. Em branco, não acaba.</span>
          </label>
          <label class="campo">
            <span>Descrição para o Google e para a prévia do link</span>
            <textarea name="descricao" rows="2" required maxlength="300">${c?.descricao ?? ''}</textarea>
            <span class="campo__ajuda">Até uns 155 caracteres.</span>
          </label>
        </fieldset>

        <fieldset class="fieldset campos">
          <legend>Conteúdo</legend>
          <label class="campo">
            <span>“Você pode ter direitos se…”</span>
            <textarea name="situacoes" rows="6" placeholder="Uma situação por linha">${linhas(c?.situacoes)}</textarea>
            <span class="campo__ajuda">Uma por linha. São as situações em que a pessoa se reconhece.</span>
          </label>
          <label class="campo">
            <span>“O que pode ser buscado”</span>
            <textarea name="direitos" rows="5" placeholder="Título — texto explicando, um por linha">${pares(c?.direitos)}</textarea>
            <span class="campo__ajuda">Um por linha, no formato <strong>Título — texto</strong> (travessão).</span>
          </label>
          <label class="campo">
            <span>“Como funciona”</span>
            <textarea name="passos" rows="4" placeholder="Em branco usa as quatro etapas padrão do site">${pares(c?.passos)}</textarea>
            <span class="campo__ajuda">Mesmo formato. Em branco, o site usa as etapas de sempre: conte o que aconteceu, análise dos documentos, caminhos possíveis, acompanhamento.</span>
          </label>
          <label class="campo campo--8">
            <span>“Documentos que ajudam”</span>
            <textarea name="documentos" rows="5" placeholder="Um documento por linha">${linhas(c?.documentos)}</textarea>
          </label>
          <label class="campo campo--4">
            <span>Aviso de prazo</span>
            <textarea name="prazo" rows="5" maxlength="400">${c?.prazo ?? ''}</textarea>
            <span class="campo__ajuda">Aparece em destaque ao lado dos documentos.</span>
          </label>
          <label class="campo">
            <span>Perguntas frequentes</span>
            <textarea name="faq" rows="6" placeholder="Pergunta — resposta, uma por linha">${pares(c?.faq)}</textarea>
            <span class="campo__ajuda">Mesmo formato <strong>Pergunta — resposta</strong>. Elas vão também para o Google, que às vezes as mostra direto no resultado.</span>
          </label>
        </fieldset>

        <div class="campo">
          <label class="opcao">
            <input type="checkbox" name="publicado" ${c?.publicado ? 'checked' : ''}>
            Mostrar no site
          </label>
          <span class="campo__ajuda">Sem isto a campanha fica aqui como rascunho. Em qualquer caso, o site só muda depois de publicar.</span>
        </div>
      </div>

      <p class="erro-formulario" role="alert" hidden></p>
      <footer class="painel__rodape grupo-botoes">
        <button class="botao botao--primario" type="submit">${nova ? 'Criar campanha' : 'Salvar'}</button>
        <a class="botao" href="#/site/campanhas">Cancelar</a>
      </footer>
    </form>`;
}
