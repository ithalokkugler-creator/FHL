// Minha conta: dados de acesso e troca de senha.

import { avisar } from '../nucleo/avisos.js';
import { ErroCampo, mostrarErroFormulario } from '../nucleo/formularios.js';
import { estado, NIVEIS_AGENDA, NIVEIS_FINANCEIRO, PAPEIS } from '../nucleo/estado.js';
import { $, desenhar, html, lerFormulario } from '../nucleo/html.js';
import { emailDaSessao, trocarSenha } from '../nucleo/supabase.js';
import { cabecalho } from './comum.js';

export default function telaConta({ raiz, consulta }) {
  const m = estado.membro;

  desenhar(raiz, html`
    ${cabecalho('Minha conta', m.nome)}
    ${consulta.nova ? html`<p class="nota nota--info">Crie uma senha nova para continuar usando o sistema.</p>` : ''}
    <div class="grade grade--2 secao">
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Acesso</h2></header>
        <dl class="dados">
          <div><dt>E-mail de entrada</dt><dd>${emailDaSessao() ?? '—'}</dd></div>
          <div><dt>Perfil</dt><dd>${PAPEIS[m.papel]}</dd></div>
          <div><dt>Agenda</dt><dd>${NIVEIS_AGENDA[m.acesso_agenda]}</dd></div>
          <div><dt>Financeiro</dt><dd>${NIVEIS_FINANCEIRO[m.acesso_financeiro]}</dd></div>
        </dl>
        <p class="painel__rodape sub">Perfil e acessos são definidos pelo administrador, na tela Membros.</p>
      </section>

      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Trocar senha</h2></header>
        <form class="painel__corpo campos" novalidate>
          <label class="campo">
            <span>Nova senha</span>
            <input name="senha" type="password" minlength="8" autocomplete="new-password" required ${consulta.nova ? 'autofocus' : ''}>
            <span class="campo__ajuda">Pelo menos 8 caracteres, com letras e números.</span>
          </label>
          <label class="campo">
            <span>Repita a nova senha</span>
            <input name="repeticao" type="password" minlength="8" autocomplete="new-password" required>
          </label>
          <p class="nota nota--perigo campo" role="alert" hidden></p>
          <div class="campo"><button class="botao botao--primario" type="submit">Salvar senha</button></div>
        </form>
      </section>
    </div>`);

  const form = $('form', raiz);
  const erro = $('[role="alert"]', form);
  if (consulta.nova) form.senha.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const { senha, repeticao } = lerFormulario(form);
    if (senha !== repeticao) {
      mostrarErroFormulario(form, new ErroCampo('repeticao', 'As duas senhas não são iguais.'));
      return;
    }
    const botao = $('[type="submit"]', form);
    botao.disabled = true;
    try {
      await trocarSenha(senha);
      form.reset();
      avisar('Senha trocada.');
    } catch (falha) {
      mostrarErroFormulario(form, falha);
    } finally {
      botao.disabled = false;
    }
  });
}
