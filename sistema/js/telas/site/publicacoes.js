// Site · Publicações — os artigos de publicacoes.html.
// ====================================================
//
// "Conteúdo jurídico para tráfego orgânico" (CLAUDE.md §4). O medo declarado
// do cliente era "começam e não fazem": por isso a lista mostra rascunho e
// publicado lado a lado, e a data com que o artigo sai no site.
//
// Artigo não se apaga — sai do ar. Link já compartilhado, post que aponta
// para ele e posição no Google somem juntos se a página deixar de existir.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { data } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { linkNoSite, notaOab, seloPublicado } from './base.js';

export default async function telaPublicacoes(ctx) {
  let lista = [];

  const mostrar = async () => {
    lista = await db.listar('publicacoes', {
      select: 'id,slug,titulo,area,autor,data,thumb,publicado',
      ordem: 'data.desc,titulo.asc',
    });
    if (ctx.ativa()) desenhar(ctx.raiz, tela(lista));
  };
  await mostrar();

  const daLinha = (el) => lista.find((p) => p.id === el.dataset.id);

  return aoClicar(ctx.raiz, {
    historico: (el) => abrirHistorico({ titulo: daLinha(el).titulo, registros: [el.dataset.id] }),
    alternar: (el) => {
      const p = daLinha(el);
      abrirDialogo({
        titulo: p.publicado ? 'Tirar do site' : 'Publicar no site',
        rotuloOk: p.publicado ? 'Tirar do site' : 'Publicar',
        perigo: p.publicado,
        corpo: html`
          <p class="dialogo__texto"><strong>${p.titulo}</strong></p>
          <p class="dialogo__texto">${p.publicado
            ? 'A página sai do site na próxima publicação. Quem tiver o link vai encontrar um erro, e o Google tira o artigo dos resultados com o tempo.'
            : 'O artigo entra em publicacoes.html e ganha a página publicacoes/' + p.slug + '.html na próxima publicação do site.'}</p>
          ${p.publicado ? '' : notaOab()}`,
        aoEnviar: async () => {
          await db.alterar('publicacoes', [['id', 'eq', p.id]], { publicado: !p.publicado }, 'id');
          avisar(p.publicado ? 'Artigo marcado para sair do site.' : 'Artigo marcado para entrar no site.');
          return true;
        },
      }).then((feito) => feito && mostrar()).catch(avisarErro);
    },
  });
}

function tela(lista) {
  return html`
    ${cabecalho('Publicações', 'Os artigos que aparecem no site', html`
      <a class="botao botao--primario" href="#/site/publicacoes/nova">Nova publicação</a>`)}

    <p class="pagina__nota">
      O que está aqui só aparece no site depois de <a href="#/site/publicar">publicar</a>.
    </p>

    <section class="painel">
      ${lista.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr><th>Artigo</th><th>Área</th><th>Autor</th><th>Data</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              ${lista.map((p) => html`
                <tr class="${p.publicado ? '' : 'apagada'}">
                  <td>
                    <span class="titulo-com-marca">
                      <span class="marca-artigo" aria-hidden="true">${p.thumb}</span>
                      <span>${p.titulo}<span class="sub">publicacoes/${p.slug}.html</span></span>
                    </span>
                  </td>
                  <td>${p.area}</td>
                  <td>${p.autor}</td>
                  <td>${data(p.data)}</td>
                  <td>${seloPublicado(p.publicado)}</td>
                  <td class="acoes">
                    <a class="botao botao--pequeno" href="#/site/publicacoes/${p.id}">Editar</a>
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="alternar" data-id="${p.id}">${p.publicado ? 'Tirar do site' : 'Publicar'}</button>
                    ${p.publicado ? linkNoSite(`publicacoes/${p.slug}.html`) : ''}
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${p.id}">Histórico</button>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>`
      : vazio('Nenhum artigo ainda. O primeiro pode ser uma dúvida que aparece toda semana no atendimento.')}
    </section>`;
}
