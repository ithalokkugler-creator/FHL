// Site · Publicação — escrever um artigo.
// =======================================
//
// O texto é montado em BLOCOS, não num editor de texto rico: parágrafo,
// subtítulo, destaque, lista e cartão de post de rede social. É o mesmo
// formato que o site renderiza (src/pages/publicacoes.mjs), e é o que impede
// texto colado do Word de entrar no site com fonte, cor e tabela invisível
// junto. Quem controla a marcação é o site.
//
// NÃO HÁ PRÉVIA FIEL AQUI, de propósito: uma segunda cópia do renderizador do
// site divergiria dele na primeira mudança de layout. O que existe é a
// estrutura visível — subtítulo parece subtítulo — e o link "Ver no site"
// depois de publicar.
//
// O CARTÃO DE REDE SOCIAL (CLAUDE.md §5.2) é o post do Instagram dentro do
// artigo. A imagem é enviada aqui e passa a ser servida pelo próprio site: o
// endereço da imagem dentro do Instagram muda e expira, e o cartão quebraria.

import { avisar } from '../../nucleo/avisos.js';
import { estado } from '../../nucleo/estado.js';
import { hoje } from '../../nucleo/formato.js';
import { $, $$, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, opcoes } from '../comum.js';
import {
  AREAS, SIMBOLOS, comoSlug, deLinhas, enderecoDaImagem, enviarImagem, linhas, linkNoSite, notaOab,
} from './base.js';

const TIPOS = {
  p: 'Parágrafo',
  h2: 'Subtítulo',
  pq: 'Destaque',
  ul: 'Lista',
  instagram: 'Post do Instagram',
  facebook: 'Post do Facebook',
  linkedin: 'Post do LinkedIn',
};

const SOCIAIS = ['instagram', 'facebook', 'linkedin'];
const social = (tipo) => SOCIAIS.includes(tipo);

/** Valor vazio de cada tipo, ao criar ou trocar um bloco. */
const vazioDoTipo = (tipo) => {
  if (tipo === 'ul') return [];
  if (social(tipo)) return { url: '', imagem: '', legenda: '', alt: '', video: false };
  return '';
};

export default async function telaPublicacao(ctx) {
  const nova = ctx.params.id === 'nova';
  const registro = nova ? null : await db.um('publicacoes', {
    select: 'id,slug,titulo,resumo,area,autor,data,thumb,corpo,publicado',
    filtros: [['id', 'eq', ctx.params.id]],
  });
  if (!ctx.ativa()) return;

  if (!nova && !registro) {
    desenhar(ctx.raiz, html`
      <a class="pagina__voltar" href="#/site/publicacoes">← Publicações</a>
      ${cabecalho('Artigo não encontrado', 'Ele pode ter sido aberto por um link antigo.')}`);
    return;
  }

  // Cópia própria: mexer nos blocos não altera o que veio do banco enquanto
  // não se salva.
  const blocos = (registro?.corpo ?? [['p', '']]).map(([tipo, valor]) => [
    tipo,
    Array.isArray(valor) ? [...valor] : (valor && typeof valor === 'object' ? { ...valor } : valor),
  ]);

  desenhar(ctx.raiz, tela(registro, nova));

  const form = $('form', ctx.raiz);
  const caixaBlocos = $('[data-papel="blocos"]', form);
  const erro = $('.erro-formulario', form);

  const mostrarErro = (texto) => {
    erro.textContent = texto;
    erro.hidden = !texto;
    if (texto) erro.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const desenharBlocos = () => {
    desenhar(caixaBlocos, blocos.length
      ? blocos.map((bloco, i) => editorDeBloco(bloco, i, blocos.length))
      : html`<p class="vazio">Sem nenhum bloco. Acrescente o primeiro parágrafo abaixo.</p>`);
  };
  desenharBlocos();

  // O endereço da página acompanha o título enquanto o artigo é novo e
  // ninguém mexeu no campo à mão. Depois de publicado, trocar o slug quebra
  // link e posição no Google — por isso não se ajusta sozinho.
  let slugAutomatico = nova;
  const exemplo = $('[data-papel="slug-exemplo"]', form);
  const mostrarSlug = () => { exemplo.textContent = comoSlug(form.slug.value) || '…'; };

  form.slug.addEventListener('input', () => {
    slugAutomatico = false;
    mostrarSlug();
  });
  form.titulo.addEventListener('input', () => {
    if (!slugAutomatico) return;
    form.slug.value = comoSlug(form.titulo.value);
    mostrarSlug();
  });

  // Um ouvinte para os campos de todos os blocos: eles nascem e morrem o
  // tempo todo, e reassinar a cada redesenho deixaria ouvintes para trás.
  caixaBlocos.addEventListener('input', (e) => {
    const campo = e.target.closest('[data-i]');
    if (!campo) return;
    const bloco = blocos[Number(campo.dataset.i)];
    if (!bloco) return;

    if (campo.dataset.campo === 'texto') bloco[1] = campo.value;
    else if (campo.dataset.campo === 'itens') bloco[1] = deLinhas(campo.value);
    else if (campo.dataset.campo) bloco[1][campo.dataset.campo] = campo.type === 'checkbox' ? campo.checked : campo.value;
  });

  caixaBlocos.addEventListener('change', async (e) => {
    const campo = e.target.closest('[data-i]');
    const i = Number(campo?.dataset.i);
    const bloco = blocos[i];
    if (!bloco) return;

    if (campo.dataset.papel === 'tipo') {
      const antes = bloco[0];
      bloco[0] = campo.value;
      // Texto vira lista e volta sem perder o que foi escrito; o resto zera.
      if (antes === 'ul' && !social(campo.value)) bloco[1] = bloco[1].join('\n');
      else if (campo.value === 'ul' && !social(antes)) bloco[1] = deLinhas(bloco[1]);
      else if (social(antes) !== social(campo.value)) bloco[1] = vazioDoTipo(campo.value);
      desenharBlocos();
      return;
    }

    if (campo.dataset.papel === 'imagem') {
      const arquivo = campo.files?.[0];
      if (!arquivo) return;
      const slug = comoSlug(form.slug.value || form.titulo.value);
      if (!slug) {
        mostrarErro('Preencha o título antes de enviar a imagem: é dele que sai o nome do arquivo.');
        campo.value = '';
        return;
      }
      try {
        mostrarErro('');
        campo.disabled = true;
        bloco[1].imagem = await enviarImagem(arquivo, slug, i);
        avisar('Imagem enviada.');
        desenharBlocos();
      } catch (falha) {
        mostrarErro(falha.message);
        campo.disabled = false;
      }
    }
  });

  caixaBlocos.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    e.preventDefault();
    const i = Number(botao.dataset.i);

    if (botao.dataset.acao === 'subir' && i > 0) blocos.splice(i - 1, 0, ...blocos.splice(i, 1));
    else if (botao.dataset.acao === 'descer' && i < blocos.length - 1) blocos.splice(i + 1, 0, ...blocos.splice(i, 1));
    else if (botao.dataset.acao === 'remover') blocos.splice(i, 1);
    else return;

    desenharBlocos();
  });

  $('[data-acao="acrescentar"]', form).addEventListener('click', () => {
    const tipo = form.novo_tipo.value;
    blocos.push([tipo, vazioDoTipo(tipo)]);
    desenharBlocos();
    $$('[data-i]', caixaBlocos).at(-1)?.focus();
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
      const d = lerFormulario(form);
      const artigo = {
        slug: comoSlug(d.slug),
        titulo: d.titulo,
        resumo: d.resumo,
        area: d.area,
        autor: d.autor,
        data: d.data,
        thumb: form.thumb.value,
        corpo: corpoLimpo(blocos),
        publicado: form.publicado.checked,
      };
      if (!artigo.slug) throw new Error('O endereço da página não pode ficar em branco.');

      botao.disabled = true;
      if (nova) await db.inserir('publicacoes', artigo, 'id');
      else await db.alterar('publicacoes', [['id', 'eq', registro.id]], artigo, 'id');
      avisar(nova ? 'Artigo criado.' : 'Artigo salvo.');
      navegar('/site/publicacoes');
    } catch (falha) {
      mostrarErro(falha.message);
      botao.disabled = false;
    }
  });
}

/** Blocos da tela → o que vai para o banco, com as conferências em português. */
function corpoLimpo(blocos) {
  const corpo = [];

  blocos.forEach(([tipo, valor], i) => {
    const onde = `Bloco ${i + 1} (${TIPOS[tipo]})`;

    if (tipo === 'ul') {
      const itens = valor.filter((x) => x.trim());
      if (!itens.length) throw new Error(`${onde}: a lista está vazia.`);
      corpo.push([tipo, itens]);
      return;
    }

    if (social(tipo)) {
      const cartao = {
        url: valor.url.trim(),
        imagem: valor.imagem.trim(),
        legenda: valor.legenda.trim(),
        ...(valor.alt?.trim() ? { alt: valor.alt.trim() } : {}),
        ...(valor.video ? { video: true } : {}),
      };
      if (!cartao.url) throw new Error(`${onde}: falta o link do post.`);
      if (!/^https:\/\//i.test(cartao.url)) throw new Error(`${onde}: o link precisa começar com https://.`);
      if (!cartao.imagem) throw new Error(`${onde}: falta a imagem do post.`);
      if (!cartao.legenda) throw new Error(`${onde}: falta a legenda.`);
      corpo.push([tipo, cartao]);
      return;
    }

    // Parágrafo em branco é rascunho, não conteúdo: some sem reclamar.
    const texto = String(valor).trim();
    if (texto) corpo.push([tipo, texto]);
  });

  if (!corpo.length) throw new Error('O artigo está sem texto.');
  return corpo;
}

// ---------------------------------------------------------------------------

function tela(p, nova) {
  const eu = estado.membro;

  return html`
    <a class="pagina__voltar" href="#/site/publicacoes">← Publicações</a>
    ${cabecalho(
      nova ? 'Nova publicação' : 'Editar publicação',
      nova ? 'Um artigo do site' : p.titulo,
      p?.publicado ? linkNoSite(`publicacoes/${p.slug}.html`) : '',
    )}

    <form class="painel" novalidate>
      <div class="painel__corpo campos">
        ${notaOab()}

        <label class="campo campo--8">
          <span>Título</span>
          <input name="titulo" value="${p?.titulo ?? ''}" required maxlength="160" autofocus>
        </label>
        <label class="campo campo--4">
          <span>Data</span>
          <input type="date" name="data" value="${p?.data ?? hoje()}" required>
        </label>

        <label class="campo campo--8">
          <span>Endereço da página</span>
          <input name="slug" value="${p?.slug ?? ''}" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*"
                 placeholder="ex.: clausula-de-nao-concorrencia">
          <span class="campo__ajuda">publicacoes/<strong data-papel="slug-exemplo">${p?.slug ?? '…'}</strong>.html${
            p?.publicado ? ' — o artigo já está no ar: mudar isto quebra o link de quem já compartilhou.' : ''}</span>
        </label>
        <label class="campo campo--4">
          <span>Símbolo na lista</span>
          <select name="thumb">${opcoes(SIMBOLOS.map((s) => [s, s]), p?.thumb ?? '§')}</select>
          <span class="campo__ajuda">Aparece grande atrás do título, no site.</span>
        </label>

        <label class="campo">
          <span>Resumo</span>
          <textarea name="resumo" rows="2" required maxlength="300">${p?.resumo ?? ''}</textarea>
          <span class="campo__ajuda">Duas linhas. É o que o Google mostra e o que aparece na prévia do link.</span>
        </label>

        <label class="campo campo--6">
          <span>Área</span>
          <input name="area" list="areas-do-site" value="${p?.area ?? ''}" required maxlength="60">
          <datalist id="areas-do-site">${AREAS.map((a) => html`<option value="${a.curto}"></option>`)}</datalist>
        </label>
        <label class="campo campo--6">
          <span>Autor</span>
          <input name="autor" value="${p?.autor ?? eu.nome}" required maxlength="120">
          <span class="campo__ajuda">Como assina no artigo.</span>
        </label>

        <fieldset class="fieldset">
          <legend>Texto do artigo</legend>
          <div class="blocos" data-papel="blocos"></div>
          <div class="blocos__acrescentar">
            <label class="campo campo--6">
              <span class="sr-only">Tipo do bloco</span>
              <select name="novo_tipo">${opcoes(Object.entries(TIPOS), 'p')}</select>
            </label>
            <button type="button" class="botao" data-acao="acrescentar">Acrescentar bloco</button>
          </div>
        </fieldset>

        <div class="campo">
          <label class="opcao">
            <input type="checkbox" name="publicado" ${p?.publicado ? 'checked' : ''}>
            Mostrar no site
          </label>
          <span class="campo__ajuda">Sem isto o artigo fica aqui como rascunho. Em qualquer caso, o site só muda depois de publicar.</span>
        </div>
      </div>

      <p class="erro-formulario" role="alert" hidden></p>
      <footer class="painel__rodape grupo-botoes">
        <button class="botao botao--primario" type="submit">${nova ? 'Criar artigo' : 'Salvar'}</button>
        <a class="botao" href="#/site/publicacoes">Cancelar</a>
      </footer>
    </form>`;
}

function editorDeBloco([tipo, valor], i, total) {
  return html`
    <article class="bloco bloco--${tipo}">
      <header class="bloco__topo">
        <label class="bloco__tipo">
          <span class="sr-only">Tipo do bloco ${i + 1}</span>
          <select data-i="${i}" data-papel="tipo">${opcoes(Object.entries(TIPOS), tipo)}</select>
        </label>
        <div class="bloco__acoes">
          <button type="button" class="botao botao--pequeno botao--discreto" data-acao="subir" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover para cima">↑</button>
          <button type="button" class="botao botao--pequeno botao--discreto" data-acao="descer" data-i="${i}" ${i === total - 1 ? 'disabled' : ''} aria-label="Mover para baixo">↓</button>
          <button type="button" class="botao botao--pequeno botao--discreto" data-acao="remover" data-i="${i}" aria-label="Remover bloco">Remover</button>
        </div>
      </header>
      ${social(tipo) ? cartaoSocial(valor, i, tipo) : texto(tipo, valor, i)}
    </article>`;
}

function texto(tipo, valor, i) {
  if (tipo === 'ul') {
    return html`
      <textarea class="bloco__campo" data-i="${i}" data-campo="itens" rows="${Math.max(3, valor.length + 1)}"
                placeholder="Um item por linha">${linhas(valor)}</textarea>
      <p class="bloco__ajuda">Um item por linha. <code>&lt;strong&gt;Assim:&lt;/strong&gt;</code> deixa o começo do item em negrito.</p>`;
  }

  const rotulo = { h2: 'Subtítulo da seção', pq: 'Frase em destaque' }[tipo] ?? 'Parágrafo';
  const alturas = { h2: 1, pq: 2, p: 4 };
  return html`
    <textarea class="bloco__campo" data-i="${i}" data-campo="texto" rows="${alturas[tipo] ?? 4}"
              placeholder="${rotulo}">${valor}</textarea>`;
}

function cartaoSocial(v, i, tipo) {
  const rede = TIPOS[tipo].replace('Post do ', '');
  return html`
    <div class="campos bloco__cartao">
      <label class="campo campo--8">
        <span>Link do post</span>
        <input type="url" data-i="${i}" data-campo="url" value="${v.url}" placeholder="https://www.instagram.com/p/…">
      </label>
      <label class="opcao campo--4">
        <input type="checkbox" data-i="${i}" data-campo="video" ${v.video ? 'checked' : ''}>
        É Reel ou vídeo
      </label>

      <label class="campo campo--6">
        <span>Imagem do post</span>
        <input type="file" data-i="${i}" data-papel="imagem" accept="image/png,image/jpeg,image/webp">
        <span class="campo__ajuda">${v.imagem
          ? `Enviada: ${v.imagem.split('/').pop()}. Escolher outra substitui.`
          : `A arte do post, salva aqui — o endereço da imagem dentro do ${rede} expira e o cartão quebraria.`}</span>
      </label>
      <div class="campo campo--6">
        <span>Prévia</span>
        ${v.imagem
          ? html`<img class="bloco__previa" src="${enderecoDaImagem(v.imagem)}" alt="">`
          : html`<p class="bloco__ajuda">Nenhuma imagem ainda.</p>`}
      </div>

      <label class="campo">
        <span>Legenda</span>
        <textarea data-i="${i}" data-campo="legenda" rows="2" maxlength="400">${v.legenda}</textarea>
        <span class="campo__ajuda">Texto curto — no site aparecem no máximo 5 linhas.</span>
      </label>
      <label class="campo">
        <span>Descrição da imagem</span>
        <input data-i="${i}" data-campo="alt" value="${v.alt ?? ''}" maxlength="200"
               placeholder="O que a arte mostra, para quem usa leitor de tela">
      </label>
    </div>`;
}
