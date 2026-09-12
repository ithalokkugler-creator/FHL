import { CIDADE, EMAIL, ENDERECO, OAB, TEL, TEL_HREF } from '../data/site.mjs';
import { page } from '../lib/html.mjs';
import { CONTATO_FORM, canaisDiretos } from '../partials/contato.mjs';

export function buildContato() {
  const body = `  <section class="section contato is-light" style="padding-top:calc(var(--header-h) + var(--s-7))">
    <div class="wrap">
      <p class="label" data-reveal="rise">Contato</p>
      <h1 class="display contato__title r-mask" data-reveal="mask">Fale com o escritório</h1>
      <p class="lead contato__intro" data-reveal="rise">
        Escolha o canal que preferir. Se for mais fácil escrever, use o formulário abaixo.
      </p>

${canaisDiretos()}

      <div class="grid">
${CONTATO_FORM}

        <aside class="contato__aside" data-reveal="rise-group">
          <div class="contato__info r-rise">
            <p class="label label--mute">Escritório</p>
            <address>${ENDERECO}<br>${CIDADE}</address>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Direto</p>
            <a class="link" href="tel:${TEL_HREF}">${TEL}</a><br>
            <a class="link" href="mailto:${EMAIL}">${EMAIL}</a>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Inscrição</p>
            <p>${OAB}</p>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Atendimento</p>
            <p>Segunda a sexta, das 9h às 18h</p>
          </div>
        </aside>
      </div>
    </div>
  </section>`;

  return page({
    path: 'contato.html',
    title: 'Contato — FHL Advocacia',
    desc: 'Descreva sua situação. Respondemos em até um dia útil.',
    body,
  });
}
