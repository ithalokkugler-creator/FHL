// Membros — quem entra no sistema e o que cada um vê (preparação 5.2).
// ====================================================================
//
// O e-mail cadastrado aqui é o que libera o login: no primeiro acesso, o
// banco liga a conta ao membro com o mesmo e-mail (iniciar_sessao). Membro
// não se apaga — desativa, e o histórico dele continua.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import {
  carregarMembros, estado, iniciais, NIVEIS_AGENDA, NIVEIS_FINANCEIRO, NIVEIS_SITE, NIVEIS_CLIENTES, NIVEIS_PRAZOS, PAPEIS,
} from '../nucleo/estado.js';
import { aoClicar, desenhar, html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';
import { cabecalho, opcoes } from './comum.js';
import { abrirHistorico } from './historico.js';

// Níveis sugeridos ao escolher o perfil — o exemplo da reunião: o advogado vê
// clientes e atualizações, a secretária vê isso e o Financeiro (5.2).
// Site: quem escreve publicação e campanha assina conteúdo de publicidade de
// escritório de advocacia (Provimento 205/2021). Por padrão, só sócio.
const SUGESTOES = {
  admin: { acesso_agenda: 'todas', acesso_financeiro: 'completo', acesso_site: 'editar', acesso_clientes: 'editar', acesso_prazos: 'editar' },
  socio: { acesso_agenda: 'propria', acesso_financeiro: 'completo', acesso_site: 'editar', acesso_clientes: 'editar', acesso_prazos: 'editar' },
  secretaria: { acesso_agenda: 'todas', acesso_financeiro: 'lancamentos', acesso_site: 'nenhum', acesso_clientes: 'editar', acesso_prazos: 'nenhum' },
  associado: { acesso_agenda: 'propria', acesso_financeiro: 'nenhum', acesso_site: 'nenhum', acesso_clientes: 'editar', acesso_prazos: 'nenhum' },
};

// Na tabela, a versão curta de cada nível; a descrição longa fica no
// diálogo, junto da escolha, e no title da célula. Administrador tem sempre
// o máximo, qualquer que seja o valor gravado.
const NIVEIS = {
  acesso_agenda: [NIVEIS_AGENDA, { nenhum: '—', propria: 'Própria', todas: 'Todas' }, 'todas'],
  acesso_financeiro: [NIVEIS_FINANCEIRO, { nenhum: '—', lancamentos: 'Lançamentos', completo: 'Completo' }, 'completo'],
  acesso_site: [NIVEIS_SITE, { nenhum: '—', editar: 'Publica' }, 'editar'],
  acesso_clientes: [NIVEIS_CLIENTES, { nenhum: '—', editar: 'Edita' }, 'editar'],
  acesso_prazos: [NIVEIS_PRAZOS, { nenhum: '—', editar: 'Edita' }, 'editar'],
};

function celulaNivel(m, campo) {
  const [longos, curtos, maximo] = NIVEIS[campo];
  const valor = m.papel === 'admin' ? maximo : m[campo];
  return html`<td title="${longos[valor] ?? ''}">${curtos[valor] ?? '—'}</td>`;
}

export default async function telaMembros(ctx) {
  const mostrar = async () => {
    await carregarMembros();
    if (ctx.ativa()) desenhar(ctx.raiz, tela());
  };
  await mostrar();

  const membroDe = (el) => estado.membros.find((m) => m.id === el.dataset.id);
  const depois = (promessa) => promessa.then((feito) => feito && mostrar()).catch(avisarErro);

  return aoClicar(ctx.raiz, {
    novo: () => depois(editarMembro(null)),
    editar: (el) => depois(editarMembro(membroDe(el))),
    historico: (el) => abrirHistorico({ titulo: membroDe(el).nome_curto, registros: [el.dataset.id] }),
    alternar: (el) => {
      const m = membroDe(el);
      depois(abrirDialogo({
        titulo: m.ativo ? `Desativar ${m.nome_curto}` : `Reativar ${m.nome_curto}`,
        rotuloOk: m.ativo ? 'Desativar' : 'Reativar',
        perigo: m.ativo,
        corpo: html`<p class="dialogo__texto">${m.ativo
          ? 'A pessoa perde o acesso na hora. O que ela lançou continua no sistema, com o nome dela no histórico.'
          : 'A pessoa volta a entrar com o mesmo login e os mesmos acessos de antes.'}</p>`,
        aoEnviar: async () => {
          await db.alterar('membros', [['id', 'eq', m.id]], { ativo: !m.ativo }, 'id');
          avisar(m.ativo ? 'Membro desativado.' : 'Membro reativado.');
          return true;
        },
      }));
    },
  });
}

function tela() {
  return html`
    ${cabecalho('Membros', 'Quem entra no sistema e o que cada um vê', html`
      <button type="button" class="botao botao--primario" data-acao="novo">Novo membro</button>`)}

    <section class="painel">
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr><th>Membro</th><th>Perfil</th><th>E-mail de acesso</th><th>Agenda</th><th>Financeiro</th><th>Site</th><th>Clientes</th><th>Prazos</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr>
          </thead>
          <tbody>
            ${estado.membros.map((m) => html`
              <tr class="${m.ativo ? '' : 'apagada'}">
                <td>
                  <span class="usuario">
                    <span class="avatar avatar--pequeno" data-vars="--cor:${m.cor}" aria-hidden="true">${iniciais(m.nome)}</span>
                    <span>${m.nome_curto}<span class="sub">${m.oab ?? m.nome}</span></span>
                  </span>
                </td>
                <td>${PAPEIS[m.papel]}</td>
                <td>${m.email ?? html`<span class="sub">sem e-mail</span>`}${m.email ? html`<span class="sub">${m.user_id ? 'login vinculado' : 'aguardando o primeiro acesso'}</span>` : ''}</td>
                ${Object.keys(NIVEIS).map((campo) => celulaNivel(m, campo))}
                <td>${m.ativo ? html`<span class="selo selo--ok">Ativo</span>` : html`<span class="selo">Desativado</span>`}</td>
                <td class="acoes">
                  <button type="button" class="botao botao--pequeno" data-acao="editar" data-id="${m.id}">Editar</button>
                  ${m.id === estado.membro.id ? '' : html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="alternar" data-id="${m.id}">${m.ativo ? 'Desativar' : 'Reativar'}</button>`}
                  <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${m.id}">Histórico</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Como liberar o acesso de alguém (piloto)</h2></header>
      <ol class="painel__corpo lista-numerada">
        <li>Cadastre a pessoa aqui, com o e-mail que ela vai usar para entrar.</li>
        <li>No painel do Supabase, projeto <strong>fhl-advocacia</strong>: Authentication → Users → Add user → Create new user. Use o mesmo e-mail, uma senha provisória e marque <em>Auto Confirm User</em>.</li>
        <li>Passe a senha provisória para a pessoa. No primeiro acesso, o login se liga a este cadastro sozinho; a senha se troca em Minha conta.</li>
      </ol>
      <p class="painel__rodape sub">Quando o e-mail oficial do escritório existir, os passos 2 e 3 viram um convite automático.</p>
    </section>`;
}

function editarMembro(m) {
  const novo = !m;
  const souEu = m?.id === estado.membro.id;

  return abrirDialogo({
    titulo: novo ? 'Novo membro' : `Editar — ${m.nome_curto}`,
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Nome completo</span><input name="nome" value="${m?.nome ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo campo--4"><span>Como aparece</span><input name="nome_curto" value="${m?.nome_curto ?? ''}" required maxlength="40" placeholder="Ex.: Juliana"></label>
        <label class="campo campo--8">
          <span>E-mail de acesso</span>
          <input type="email" name="email" value="${m?.email ?? ''}" maxlength="200">
          <span class="campo__ajuda">É ele que libera o login.${m?.user_id ? ' Esta pessoa já entrou pelo menos uma vez.' : ''}</span>
        </label>
        <label class="campo campo--4"><span>OAB</span><input name="oab" value="${m?.oab ?? ''}" maxlength="40" placeholder="OAB/PR 000.000"></label>
        <label class="campo campo--8">
          <span>Perfil</span>
          <select name="papel" ${souEu ? 'disabled' : ''}>${opcoes(Object.entries(PAPEIS), m?.papel ?? 'associado')}</select>
          ${souEu ? html`<span class="campo__ajuda">O próprio perfil não se muda.</span>` : ''}
        </label>
        <label class="campo campo--4"><span>Cor na agenda</span><input type="color" name="cor" value="${(m?.cor ?? '#2E615D').toLowerCase()}"></label>
        <fieldset class="fieldset campos">
          <legend>Acesso aos módulos</legend>
          <label class="campo campo--4"><span>Agenda</span><select name="acesso_agenda">${opcoes(Object.entries(NIVEIS_AGENDA), m?.acesso_agenda ?? 'propria')}</select></label>
          <label class="campo campo--4"><span>Financeiro</span><select name="acesso_financeiro">${opcoes(Object.entries(NIVEIS_FINANCEIRO), m?.acesso_financeiro ?? 'nenhum')}</select></label>
          <label class="campo campo--4"><span>Site</span><select name="acesso_site">${opcoes(Object.entries(NIVEIS_SITE), m?.acesso_site ?? 'nenhum')}</select></label>
          <label class="campo campo--6"><span>Clientes</span><select name="acesso_clientes">${opcoes(Object.entries(NIVEIS_CLIENTES), m?.acesso_clientes ?? 'editar')}</select></label>
          <label class="campo campo--6"><span>Prazos</span><select name="acesso_prazos">${opcoes(Object.entries(NIVEIS_PRAZOS), m?.acesso_prazos ?? 'nenhum')}</select></label>
        </fieldset>
      </div>
      <p class="nota nota--info secao" data-papel="admin" hidden>Administrador vê e altera tudo, qualquer que seja o nível escolhido acima.</p>`,

    aoAbrir: (dialogo, form) => {
      const atualizar = (sugerir) => {
        const papel = form.papel.value;
        if (sugerir && SUGESTOES[papel]) {
          for (const [campo, valor] of Object.entries(SUGESTOES[papel])) form[campo].value = valor;
        }
        dialogo.querySelector('[data-papel="admin"]').hidden = papel !== 'admin';
      };
      form.papel.addEventListener('change', () => atualizar(true));
      atualizar(novo);
    },

    aoEnviar: async (d, form) => {
      const registro = {
        nome: d.nome,
        nome_curto: d.nome_curto,
        email: d.email ? d.email.toLowerCase() : null,
        oab: d.oab || null,
        cor: form.cor.value.toUpperCase(),
        papel: souEu ? m.papel : form.papel.value,
        acesso_agenda: form.acesso_agenda.value,
        acesso_financeiro: form.acesso_financeiro.value,
        acesso_site: form.acesso_site.value,
        acesso_clientes: form.acesso_clientes.value,
        acesso_prazos: form.acesso_prazos.value,
      };
      if (novo) await db.inserir('membros', registro, 'id');
      else await db.alterar('membros', [['id', 'eq', m.id]], registro, 'id');
      avisar(novo ? 'Membro cadastrado.' : 'Membro salvo.');
      return true;
    },
  });
}
