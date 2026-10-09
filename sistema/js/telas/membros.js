// Membros — quem entra no sistema e o que cada um vê (preparação 5.2).
// ====================================================================
//
// O e-mail cadastrado aqui é o que libera o login: no primeiro acesso, o
// banco liga a conta ao membro com o mesmo e-mail (iniciar_sessao). Membro
// não se apaga — desativa, e o histórico dele continua.
//
// "Enviar convite" pede à função de borda administrar-usuarios que o Auth
// mande o e-mail com o link para a pessoa criar a própria senha. Depende do
// SMTP do Auth: sem ele, o Supabase só entrega para a equipe da organização
// (ver sistema/README.md). Enquanto isso, o caminho manual continua valendo.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import {
  carregarMembros, estado, iniciais, NIVEIS_AGENDA, NIVEIS_AUDITORIA, NIVEIS_FINANCEIRO, NIVEIS_SITE, NIVEIS_CLIENTES, NIVEIS_PRAZOS, PAPEIS,
} from '../nucleo/estado.js';
import { dataHora } from '../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';
import { cabecalho, opcoes } from './comum.js';
import { abrirHistorico } from './historico.js';

// Níveis sugeridos ao escolher o perfil — o exemplo da reunião: o advogado vê
// clientes e atualizações, a secretária vê isso e o Financeiro (5.2).
// Site: quem escreve publicação e campanha assina conteúdo de publicidade de
// escritório de advocacia (Provimento 205/2021). Por padrão, só sócio.
const SUGESTOES = {
  admin: { acesso_agenda: 'todas', acesso_financeiro: 'completo', acesso_site: 'editar', acesso_clientes: 'editar', acesso_prazos: 'editar', acesso_auditoria: 'ver' },
  socio: { acesso_agenda: 'propria', acesso_financeiro: 'completo', acesso_site: 'editar', acesso_clientes: 'editar', acesso_prazos: 'editar', acesso_auditoria: 'nenhum' },
  secretaria: { acesso_agenda: 'todas', acesso_financeiro: 'lancamentos', acesso_site: 'nenhum', acesso_clientes: 'editar', acesso_prazos: 'nenhum', acesso_auditoria: 'nenhum' },
  associado: { acesso_agenda: 'propria', acesso_financeiro: 'nenhum', acesso_site: 'nenhum', acesso_clientes: 'editar', acesso_prazos: 'nenhum', acesso_auditoria: 'nenhum' },
};

// Modelos do DOCX (§3): atalhos que preenchem os níveis; nada é gravado como
// "modelo" — o que vale são os níveis escolhidos. Contador externo ou
// conferente: Consulta lê o Financeiro sem gravar; Auditoria lê o histórico.
const MODELOS = {
  financeiro: ['Financeiro (lança)', { acesso_agenda: 'nenhum', acesso_financeiro: 'lancamentos', acesso_site: 'nenhum', acesso_clientes: 'nenhum', acesso_prazos: 'nenhum', acesso_auditoria: 'nenhum' }],
  consulta: ['Consulta (só lê o Financeiro)', { acesso_agenda: 'nenhum', acesso_financeiro: 'consulta', acesso_site: 'nenhum', acesso_clientes: 'nenhum', acesso_prazos: 'nenhum', acesso_auditoria: 'nenhum' }],
  auditoria: ['Auditoria (lê histórico e Financeiro)', { acesso_agenda: 'nenhum', acesso_financeiro: 'consulta', acesso_site: 'nenhum', acesso_clientes: 'nenhum', acesso_prazos: 'nenhum', acesso_auditoria: 'ver' }],
};

const CONVITES = { pendente: ['Convite em preparo', ''], enviado: ['Convite enviado', 'ok'], falhou: ['Convite falhou', 'perigo'], aceito: ['Convite aceito', 'ok'] };

// Na tabela, a versão curta de cada nível; a descrição longa fica no
// diálogo, junto da escolha, e no title da célula. Administrador tem sempre
// o máximo, qualquer que seja o valor gravado.
const NIVEIS = {
  acesso_agenda: [NIVEIS_AGENDA, { nenhum: '—', propria: 'Própria', todas: 'Todas' }, 'todas'],
  acesso_financeiro: [NIVEIS_FINANCEIRO, { nenhum: '—', consulta: 'Consulta', lancamentos: 'Lançamentos', completo: 'Completo' }, 'completo'],
  acesso_site: [NIVEIS_SITE, { nenhum: '—', editar: 'Publica' }, 'editar'],
  acesso_clientes: [NIVEIS_CLIENTES, { nenhum: '—', editar: 'Edita' }, 'editar'],
  acesso_prazos: [NIVEIS_PRAZOS, { nenhum: '—', editar: 'Edita' }, 'editar'],
  acesso_auditoria: [NIVEIS_AUDITORIA, { nenhum: '—', ver: 'Lê' }, 'ver'],
};

function celulaNivel(m, campo) {
  const [longos, curtos, maximo] = NIVEIS[campo];
  const valor = m.papel === 'admin' ? maximo : m[campo];
  return html`<td title="${longos[valor] ?? ''}">${curtos[valor] ?? '—'}</td>`;
}

export default async function telaMembros(ctx) {
  let convites = new Map();
  const mostrar = async () => {
    const [, lista] = await Promise.all([
      carregarMembros(),
      db.listar('convites_acesso', { select: 'membro_id,estado,ultimo_erro,enviado_em,criado_em', ordem: 'criado_em.desc' }).catch(() => []),
    ]);
    // O mais recente de cada membro.
    convites = new Map();
    for (const c of lista) if (!convites.has(c.membro_id)) convites.set(c.membro_id, c);
    if (ctx.ativa()) desenhar(ctx.raiz, tela(convites));
  };
  await mostrar();

  const membroDe = (el) => estado.membros.find((m) => m.id === el.dataset.id);
  const depois = (promessa) => promessa.then((feito) => feito && mostrar()).catch(avisarErro);

  return aoClicar(ctx.raiz, {
    novo: () => depois(editarMembro(null)),
    editar: (el) => depois(editarMembro(membroDe(el))),
    historico: (el) => abrirHistorico({ titulo: membroDe(el).nome_curto, registros: [el.dataset.id] }),
    convidar: (el) => {
      const m = membroDe(el);
      depois(abrirDialogo({
        titulo: `Convidar ${m.nome_curto}`,
        rotuloOk: 'Enviar convite',
        corpo: html`<p class="dialogo__texto">Vai um e-mail para <strong>${m.email}</strong> com um link para a pessoa criar a própria senha.
          Nenhuma senha passa por aqui. Se o link vencer, envie de novo.</p>
          <p class="sub">Precisa do SMTP configurado no Supabase (Authentication → Emails). Sem ele, o e-mail só chega para quem é da equipe da organização no Supabase.</p>`,
        aoEnviar: async () => {
          const voltar = `${location.origin}${location.pathname}`;
          await db.funcao('administrar-usuarios', { acao: 'convidar', membro_id: m.id, voltar_para: voltar });
          avisar(`Convite enviado para ${m.email}.`);
          return true;
        },
      }));
    },
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

function seloConvite(c) {
  if (!c) return '';
  const [rotulo, tom] = CONVITES[c.estado] ?? [c.estado, ''];
  return html`<span class="sub" title="${c.ultimo_erro ?? ''}"><span class="selo selo--${tom || 'escuro'}">${rotulo}</span>
    ${c.enviado_em ? ` ${dataHora(c.enviado_em)}` : ''}${c.estado === 'falhou' && c.ultimo_erro ? ` — ${c.ultimo_erro}` : ''}</span>`;
}

function tela(convites) {
  return html`
    ${cabecalho('Membros', 'Quem entra no sistema e o que cada um vê', html`
      <button type="button" class="botao botao--primario" data-acao="novo">Novo membro</button>`)}

    <section class="painel">
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr><th>Membro</th><th>Perfil</th><th>E-mail de acesso</th><th>Agenda</th><th>Financeiro</th><th>Site</th><th>Clientes</th><th>Prazos</th><th>Histórico</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr>
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
                <td>${m.email ?? html`<span class="sub">sem e-mail</span>`}${m.email ? html`<span class="sub">${m.user_id ? 'login vinculado' : 'aguardando o primeiro acesso'}</span>` : ''}
                  ${m.user_id ? '' : seloConvite(convites.get(m.id))}</td>
                ${Object.keys(NIVEIS).map((campo) => celulaNivel(m, campo))}
                <td>${m.ativo ? html`<span class="selo selo--ok">Ativo</span>` : html`<span class="selo">Desativado</span>`}</td>
                <td class="acoes">
                  <button type="button" class="botao botao--pequeno" data-acao="editar" data-id="${m.id}">Editar</button>
                  ${m.ativo && m.email && !m.user_id ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="convidar" data-id="${m.id}">${convites.has(m.id) ? 'Reenviar convite' : 'Enviar convite'}</button>` : ''}
                  ${m.id === estado.membro.id ? '' : html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="alternar" data-id="${m.id}">${m.ativo ? 'Desativar' : 'Reativar'}</button>`}
                  <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${m.id}">Histórico</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Como liberar o acesso de alguém</h2></header>
      <ol class="painel__corpo lista-numerada">
        <li>Cadastre a pessoa aqui, com o e-mail que ela vai usar para entrar.</li>
        <li><strong>Com o SMTP configurado:</strong> clique em "Enviar convite". A pessoa recebe um link e cria a própria senha.</li>
        <li><strong>Sem SMTP (piloto):</strong> no painel do Supabase, Authentication → Users → Add user → Create new user, com o mesmo e-mail, uma senha provisória e <em>Auto Confirm User</em>. Passe a senha para a pessoa; ela troca em Minha conta.</li>
      </ol>
      <p class="painel__rodape sub">Nos dois casos, no primeiro acesso o login se liga a este cadastro sozinho. Desativar corta o acesso na hora.</p>
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
          <label class="campo"><span>Preencher com um modelo</span>
            <select name="modelo">${opcoes(Object.entries(MODELOS).map(([v, [r]]) => [v, r]), '', { vazio: 'Escolher os níveis um a um' })}</select>
            <span class="campo__ajuda">Só preenche os campos abaixo; dá para ajustar antes de salvar.</span></label>
          <label class="campo campo--4"><span>Agenda</span><select name="acesso_agenda">${opcoes(Object.entries(NIVEIS_AGENDA), m?.acesso_agenda ?? 'propria')}</select></label>
          <label class="campo campo--4"><span>Financeiro</span><select name="acesso_financeiro">${opcoes(Object.entries(NIVEIS_FINANCEIRO), m?.acesso_financeiro ?? 'nenhum')}</select></label>
          <label class="campo campo--4"><span>Site</span><select name="acesso_site">${opcoes(Object.entries(NIVEIS_SITE), m?.acesso_site ?? 'nenhum')}</select></label>
          <label class="campo campo--4"><span>Clientes</span><select name="acesso_clientes">${opcoes(Object.entries(NIVEIS_CLIENTES), m?.acesso_clientes ?? 'editar')}</select></label>
          <label class="campo campo--4"><span>Prazos</span><select name="acesso_prazos">${opcoes(Object.entries(NIVEIS_PRAZOS), m?.acesso_prazos ?? 'nenhum')}</select></label>
          <label class="campo campo--4"><span>Histórico (auditoria)</span><select name="acesso_auditoria">${opcoes(Object.entries(NIVEIS_AUDITORIA), m?.acesso_auditoria ?? 'nenhum')}</select></label>
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
      form.modelo.addEventListener('change', () => {
        for (const [campo, valor] of Object.entries(MODELOS[form.modelo.value]?.[1] ?? {})) form[campo].value = valor;
      });
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
        acesso_auditoria: form.acesso_auditoria.value,
      };
      if (novo) await db.inserir('membros', registro, 'id');
      else await db.alterar('membros', [['id', 'eq', m.id]], registro, 'id');
      avisar(novo ? 'Membro cadastrado.' : 'Membro salvo.');
      return true;
    },
  });
}
