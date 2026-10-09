// Tela de entrada.
// ================
//
// Um login por pessoa (preparação 5.1, pergunta 19): sem isso, o histórico
// não tem como dizer quem fez o quê.

import { $, aoClicar, desenhar, html, lerFormulario } from '../nucleo/html.js';
import { entrar, pedirNovaSenha } from '../nucleo/supabase.js';
import { ErroCampo, mostrarErroFormulario } from '../nucleo/formularios.js';

export default function telaEntrada(app, { erro, aviso } = {}) {
  app.dataset.tela = 'entrada';
  document.title = 'Entrar — Fonseca Lisboa Advocacia';

  desenhar(app, html`
    <div class="entrada">
      <section class="entrada__marca">
        <img class="entrada__peixe" src="/sistema/img/marca-dagua.svg" alt="" aria-hidden="true" width="1349" height="2346">
        <img class="entrada__assinatura" src="/sistema/img/logo.svg" alt="Fonseca Lisboa Advocacia" width="1972" height="1280">
        <div>
          <p class="rotulo">Área dos advogados</p>
          <p class="entrada__frase">Agenda da equipe e financeiro do escritório.</p>
        </div>
        <p class="entrada__rodape">Fonseca Lisboa · Rua Dr. Leocádio, 282 · Paranaguá — PR</p>
      </section>

      <section class="entrada__painel">
        <form class="entrada__form" novalidate>
          <h1 class="pagina__titulo">Entrar</h1>
          <p class="nota nota--info" data-papel="aviso" ${aviso ? '' : 'hidden'}>${aviso ?? ''}</p>
          <p class="nota nota--perigo" data-papel="erro" role="alert" ${erro ? '' : 'hidden'}>${erro ?? ''}</p>
          <label class="campo">
            <span>E-mail</span>
            <input name="email" type="email" autocomplete="username" required autofocus>
          </label>
          <label class="campo">
            <span>Senha</span>
            <input name="senha" type="password" autocomplete="current-password" required>
          </label>
          <button class="botao botao--primario botao--largo" type="submit">Entrar</button>
          <button class="botao botao--discreto" type="button" data-acao="esqueci">Esqueci a senha</button>
          <p class="entrada__volta"><a href="/">Voltar ao site</a></p>
        </form>
      </section>
    </div>`);

  const form = $('form', app);
  const caixaErro = $('[data-papel="erro"]', app);
  const caixaAviso = $('[data-papel="aviso"]', app);
  const botao = $('[type="submit"]', form);

  const mostrar = (caixa, texto) => {
    caixaErro.hidden = true;
    caixaAviso.hidden = true;
    caixa.textContent = texto;
    caixa.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const { email, senha } = lerFormulario(form);
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      // app.js percebe a sessão nova e abre o sistema.
      await entrar(email, senha);
    } catch (falha) {
      mostrarErroFormulario(form, falha);
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });

  aoClicar(form, {
    esqueci: async (alvo) => {
      const email = form.email.value.trim();
      if (!email || !form.email.checkValidity()) {
        mostrarErroFormulario(form, new ErroCampo('email', 'Digite um e-mail válido acima e clique de novo em "Esqueci a senha".'));
        return;
      }
      alvo.disabled = true;
      try {
        await pedirNovaSenha(email);
        mostrar(caixaAviso, 'Se este e-mail tiver acesso, chega em alguns minutos um link para criar uma senha nova.');
      } catch (falha) {
        mostrarErroFormulario(form, falha);
      } finally {
        alvo.disabled = false;
      }
    },
  });
}
