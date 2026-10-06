import { avisar } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { linkWhatsApp } from '../nucleo/formato.js';
import { $, html } from '../nucleo/html.js';

export function prepararMensagem({ titulo, texto, telefone }) {
  return abrirDialogo({
    titulo, largo: true, somenteLeitura: true,
    corpo: html`<label class="campo"><span>Mensagem para conferir e enviar</span><textarea name="texto" rows="7">${texto}</textarea></label>
      <div class="pagina__acoes secao"><button type="button" class="botao" data-copiar>Copiar</button>
        ${telefone ? html`<a class="botao" data-whats href="${linkWhatsApp(telefone, texto)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>` : ''}</div>
      <p class="nota secao">Confira o texto e envie pelo aplicativo. O sistema só prepara a mensagem.</p>`,
    aoAbrir: (dialogo, form) => {
      form.texto.addEventListener('input', () => {
        const link = $('[data-whats]', dialogo);
        if (link) link.href = linkWhatsApp(telefone, form.texto.value);
      });
      $('[data-copiar]', dialogo).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(form.texto.value); avisar('Mensagem copiada.'); }
        catch { avisar('Selecione o texto e copie.'); }
      });
    },
  });
}
