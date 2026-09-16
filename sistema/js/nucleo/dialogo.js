// Diálogos com formulário.
// ========================
//
// Toda ação que grava passa por aqui: o erro do banco aparece dentro do
// próprio diálogo, sem perder o que foi digitado, e o botão fica travado
// enquanto salva — dois cliques não lançam o mesmo recebimento duas vezes.
//
// Clique fora não fecha, de propósito: um clique errado apagaria um
// formulário inteiro. Esc e o × fecham.

import { $, desenhar, html, lerFormulario } from './html.js';

/**
 * @param {object} p
 * @param {string} p.titulo
 * @param {*} p.corpo                 html``
 * @param {string} [p.rotuloOk]
 * @param {boolean} [p.perigo]        botão vermelho (cancelar, estornar)
 * @param {boolean} [p.largo]
 * @param {boolean} [p.somenteLeitura] sem botão de salvar
 * @param {(dialogo, form, fechar) => void} [p.aoAbrir]
 * @param {(dados, form, dialogo) => Promise<any>} [p.aoEnviar]  devolve false para não fechar
 * @returns {Promise<any>} o que aoEnviar devolveu, ou null se fechou sem salvar
 */
export function abrirDialogo({ titulo, corpo, rotuloOk = 'Salvar', perigo = false, largo = false, somenteLeitura = false, aoAbrir, aoEnviar }) {
  return new Promise((resolver) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = `dialogo${largo ? ' dialogo--largo' : ''}`;
    document.body.append(dialogo);

    desenhar(dialogo, html`
      <form class="dialogo__form" novalidate>
        <header class="dialogo__topo">
          <h2 class="dialogo__titulo">${titulo}</h2>
          <button type="button" class="dialogo__fechar" data-fechar aria-label="Fechar">×</button>
        </header>
        <div class="dialogo__corpo">${corpo}</div>
        <p class="dialogo__erro" role="alert" hidden></p>
        <footer class="dialogo__rodape">
          <button type="button" class="botao" data-fechar>${somenteLeitura ? 'Fechar' : 'Cancelar'}</button>
          ${somenteLeitura ? '' : html`<button type="submit" class="botao ${perigo ? 'botao--perigo' : 'botao--primario'}">${rotuloOk}</button>`}
        </footer>
      </form>`);

    const form = $('form', dialogo);
    const erro = $('.dialogo__erro', dialogo);
    let resultado = null;
    let salvando = false;
    let encerrado = false;

    // Resolve na hora, sem esperar o evento `close`: com a aba em segundo plano
    // o Chromium só entrega esse evento quando a página volta a ser desenhada,
    // e a tela ficaria sem recarregar depois de salvar.
    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      dialogo.remove();
      resolver(resultado);
    };

    const fechar = (valor = null) => {
      resultado = valor;
      if (dialogo.open) dialogo.close();
      encerrar();
    };

    // Esc fecha pelo próprio navegador.
    dialogo.addEventListener('close', encerrar);
    dialogo.addEventListener('cancel', (e) => {
      if (salvando) e.preventDefault();
    });
    dialogo.addEventListener('click', (e) => {
      if (e.target.closest('[data-fechar]') && !salvando) fechar();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (salvando) return;
      erro.hidden = true;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      if (!aoEnviar) {
        fechar(true);
        return;
      }

      const botao = $('[type="submit"]', form);
      salvando = true;
      botao.disabled = true;
      try {
        const valor = await aoEnviar(lerFormulario(form), form, dialogo);
        if (valor !== false) fechar(valor ?? true);
      } catch (falha) {
        erro.textContent = falha?.message || 'Não foi possível salvar.';
        erro.hidden = false;
        erro.scrollIntoView({ block: 'nearest' });
      } finally {
        salvando = false;
        botao.disabled = false;
      }
    });

    dialogo.showModal();
    aoAbrir?.(dialogo, form, fechar);
    $('[autofocus]', dialogo)?.focus();
  });
}

/** Confirmação que exige motivo — cancelar, estornar, reabrir.
 *  Devolve o motivo digitado, ou null. */
export function pedirMotivo({ titulo, texto, rotuloOk = 'Confirmar', rotulo = 'Motivo' }) {
  return abrirDialogo({
    titulo,
    rotuloOk,
    perigo: true,
    corpo: html`
      ${texto ? html`<p class="dialogo__texto">${texto}</p>` : ''}
      <label class="campo">
        <span>${rotulo}</span>
        <textarea name="motivo" rows="3" required autofocus></textarea>
        <span class="campo__ajuda">Fica registrado no histórico, com o seu nome e a data.</span>
      </label>`,
    aoEnviar: async ({ motivo }) => motivo,
  });
}
