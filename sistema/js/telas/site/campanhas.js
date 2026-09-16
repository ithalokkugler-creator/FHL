// Site · Campanhas — as páginas de campanha do site.
// ==================================================
//
// "Precisa de uma página por campanha ou dá para usar o mesmo site?"
// (CLAUDE.md §5.3) — dá para usar o mesmo site: cada campanha daqui vira
// campanhas/<slug>.html, com a marca, o domínio e o SEO da FHL.
//
// O PERÍODO NÃO ESCONDE A PÁGINA. Antes do início ela existe para revisar o
// link, mas fica fora do Google. Depois do fim continua no ar, com aviso de
// encerrada — quem chega por um post antigo não cai num erro.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { data, hoje } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { linkNoSite, notaOab, seloPublicado } from './base.js';

/** A mesma regra de src/pages/campanhas.mjs, para a tela dizer o mesmo que o site. */
function situacaoDaCampanha(c, dia = hoje()) {
  if (c.inicio && dia < c.inicio) return 'agendada';
  if (c.fim && dia > c.fim) return 'encerrada';
  return 'ativa';
}

const SELOS = {
  agendada: ['Começa depois', 'alerta'],
  ativa: ['No período', 'ok'],
  encerrada: ['Encerrada', 'escuro'],
};

export default async function telaCampanhas(ctx) {
  let lista = [];

  const mostrar = async () => {
    lista = await db.listar('campanhas', {
      select: 'id,slug,rotulo,titulo,area,inicio,fim,publicado',
      ordem: 'inicio.desc.nullslast,titulo.asc',
    });
    if (ctx.ativa()) desenhar(ctx.raiz, tela(lista));
  };
  await mostrar();

  const daLinha = (el) => lista.find((c) => c.id === el.dataset.id);

  return aoClicar(ctx.raiz, {
    historico: (el) => abrirHistorico({ titulo: daLinha(el).titulo, registros: [el.dataset.id] }),
    alternar: (el) => {
      const c = daLinha(el);
      abrirDialogo({
        titulo: c.publicado ? 'Tirar do site' : 'Publicar no site',
        rotuloOk: c.publicado ? 'Tirar do site' : 'Publicar',
        perigo: c.publicado,
        corpo: html`
          <p class="dialogo__texto"><strong>${c.titulo}</strong></p>
          <p class="dialogo__texto">${c.publicado
            ? 'A página sai do site na próxima publicação. Se houver anúncio ou post apontando para ela, o link vai dar erro.'
            : `A página campanhas/${c.slug}.html entra no site na próxima publicação.`}</p>
          ${c.publicado ? '' : notaOab()}`,
        aoEnviar: async () => {
          await db.alterar('campanhas', [['id', 'eq', c.id]], { publicado: !c.publicado }, 'id');
          avisar(c.publicado ? 'Campanha marcada para sair do site.' : 'Campanha marcada para entrar no site.');
          return true;
        },
      }).then((feito) => feito && mostrar()).catch(avisarErro);
    },
  });
}

function tela(lista) {
  return html`
    ${cabecalho('Campanhas', 'Páginas de campanha do site', html`
      <a class="botao botao--primario" href="#/site/campanhas/nova">Nova campanha</a>`)}

    <p class="pagina__nota">
      O que está aqui só aparece no site depois de <a href="#/site/publicar">publicar</a>.
      Campanha no período também é anunciada na home e na página da área.
    </p>

    <section class="painel">
      ${lista.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr><th>Campanha</th><th>Período</th><th>Situação</th><th>No site</th><th class="acoes"><span class="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              ${lista.map((c) => {
                const [rotulo, tom] = SELOS[situacaoDaCampanha(c)];
                return html`
                  <tr class="${c.publicado ? '' : 'apagada'}">
                    <td>${c.titulo}<span class="sub">campanhas/${c.slug}.html · ${c.rotulo}</span></td>
                    <td>${c.inicio ? data(c.inicio) : '—'}${c.fim ? html` a ${data(c.fim)}` : html` <span class="sub">sem fim</span>`}</td>
                    <td><span class="selo selo--${tom}">${rotulo}</span></td>
                    <td>${seloPublicado(c.publicado)}</td>
                    <td class="acoes">
                      <a class="botao botao--pequeno" href="#/site/campanhas/${c.id}">Editar</a>
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="alternar" data-id="${c.id}">${c.publicado ? 'Tirar do site' : 'Publicar'}</button>
                      ${c.publicado ? linkNoSite(`campanhas/${c.slug}.html`) : ''}
                      <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${c.id}">Histórico</button>
                    </td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>`
      : vazio('Nenhuma campanha ainda. Uma data do calendário — Dia do Trabalhador, semana de combate à violência doméstica — costuma ser o gancho.')}
    </section>`;
}
