import { page } from '../lib/html.mjs';
import { canaisDiretos, contatoAside, contatoForm } from '../partials/contato.mjs';

export function buildContato() {
  const body = `  <section class="section contato contato--page is-light">
    <div class="wrap">
      <p class="label" data-reveal="rise">Contato</p>
      <h1 class="display contato__title r-mask" data-reveal="mask">Fale com o escritório</h1>
      <p class="lead contato__intro" data-reveal="rise">
        Escolha o canal que preferir. Se for mais fácil escrever, use o formulário abaixo.
      </p>

${canaisDiretos()}

      <div class="grid">
${contatoForm()}

${contatoAside()}
      </div>
    </div>
  </section>`;

  return page({
    path: 'contato.html',
    title: 'Contato — Fonseca Lisboa Advocacia',
    desc: 'Fale com a Fonseca Lisboa Advocacia, em Paranaguá: WhatsApp, telefone, e-mail ou ' +
      'formulário. Respondemos em até um dia útil.',
    body,
  });
}
