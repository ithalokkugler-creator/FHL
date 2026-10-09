// Site · Publicar — mandar o que foi escrito para o ar.
// =====================================================
//
// O site do escritório é estático: as páginas são geradas uma vez e servidas como
// arquivos. É isso que o deixa rápido e indexável, e é isso que separa
// "salvar" de "publicar".
//
//   salvar     grava aqui, na área dos advogados. O site no ar não muda.
//   publicar   manda a Vercel gerar o site de novo, lendo o que está gravado.
//              Dois ou três minutos depois, está no ar.
//
// QUEM CHAMA A VERCEL — a função de borda `publicar-site`, no Supabase, e não
// esta tela. A URL do Deploy Hook é um segredo: quem a tem dispara build no
// site de vocês, sem login nenhum. Guardada no navegador, estaria à vista de
// qualquer pessoa que abrisse o código da página.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { nomeDe } from '../../nucleo/estado.js';
import { dataHora } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, indicador, vazio } from '../comum.js';

export default async function telaPublicar(ctx) {
  const mostrar = async () => {
    const [situacao, deploys] = await Promise.all([
      db.rpc('site_situacao'),
      db.listar('site_deploys', { select: 'id,situacao,detalhe,criado_em,criado_por', ordem: 'criado_em.desc', limite: 10 }),
    ]);
    if (ctx.ativa()) desenhar(ctx.raiz, tela(situacao, deploys));
  };
  await mostrar();

  return aoClicar(ctx.raiz, {
    publicar: () => {
      abrirDialogo({
        titulo: 'Publicar o site',
        rotuloOk: 'Publicar agora',
        corpo: html`
          <p class="dialogo__texto">
            O site vai ser gerado de novo com tudo o que está marcado como “no site”, em
            Publicações e em Campanhas. Leva dois ou três minutos até aparecer no endereço
            público.
          </p>
          <p class="dialogo__texto">
            Rascunho continua rascunho. O que foi tirado do site sai agora.
          </p>`,
        aoEnviar: async () => {
          const r = await db.funcao('publicar-site');
          avisar(r?.mensagem || 'Publicação pedida. Em alguns minutos o site estará no ar.');
          return true;
        },
      }).then((feito) => feito && mostrar()).catch(avisarErro);
    },
  });
}

function tela(situacao, deploys) {
  const pendentes = situacao.publicacoes + situacao.campanhas;

  return html`
    ${cabecalho('Publicar', 'Mandar para o ar o que foi escrito', html`
      <button type="button" class="botao botao--primario" data-acao="publicar">Publicar o site</button>`)}

    <div class="indicadores">
      ${indicador(
        'No ar desde',
        situacao.publicado_em ? dataHora(situacao.publicado_em) : '—',
        situacao.publicado_em ? 'última publicação pedida por aqui' : 'o site nunca foi publicado por esta tela',
      )}
      ${indicador('Publicações alteradas', String(situacao.publicacoes), 'desde então', { tom: situacao.publicacoes ? 'alerta' : '' })}
      ${indicador('Campanhas alteradas', String(situacao.campanhas), 'desde então', { tom: situacao.campanhas ? 'alerta' : '' })}
    </div>

    <p class="pagina__nota">${pendentes
      ? 'Há texto salvo que ainda não está no ar.'
      : 'Nada mudou desde a última vez. Publicar de novo não faz mal: só gera o site outra vez.'}</p>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Últimos pedidos</h2></header>
      ${deploys.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>Situação</th><th>Detalhe</th></tr></thead>
            <tbody>
              ${deploys.map((d) => html`
                <tr>
                  <td>${dataHora(d.criado_em)}</td>
                  <td>${nomeDe(d.criado_por)}</td>
                  <td>${d.situacao === 'enviado'
                    ? html`<span class="selo selo--ok">Enviado</span>`
                    : html`<span class="selo selo--perigo">Falhou</span>`}</td>
                  <td class="sub">${d.detalhe ?? '—'}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>`
      : vazio('O site ainda não foi publicado por aqui.')}
    </section>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Como funciona</h2></header>
      <ol class="painel__corpo lista-numerada">
        <li><strong>Escrever e salvar</strong> em Publicações ou Campanhas. Fica guardado aqui; o site no ar não muda.</li>
        <li><strong>Marcar “mostrar no site”</strong> no que já pode ser visto por qualquer pessoa.</li>
        <li><strong>Publicar</strong>, nesta tela. A Vercel gera o site de novo lendo o que está guardado.</li>
        <li><strong>Conferir</strong>, dois ou três minutos depois, pelo link “Ver no site” de cada página.</li>
      </ol>
      <p class="painel__rodape sub">
        Imagem de compartilhamento — a prévia que aparece quando o link é colado no WhatsApp —
        ainda é gerada na máquina de quem desenvolve (<code>npm run og</code>). Artigo novo entra
        no ar com a imagem padrão do site até lá.
      </p>
    </section>`;
}
