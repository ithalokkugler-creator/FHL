// Blocos de contato compartilhados entre a home (#contato), contato.html e as
// páginas de campanha.
//
// CANAIS DIRETOS
// O cliente reclamou que o contato ficava "lá embaixo, no último". Este bloco
// põe os canais reais na frente — clicáveis, com o valor visível, antes do
// formulário. Quem quer falar agora não precisa preencher nada.

import { CIDADE, EMAIL, ENDERECO, MAPS, TEL, TEL_HREF, whatsappUrl } from '../data/site.mjs';
import { attr, prefix } from '../lib/html.mjs';

/** `whatsapp` pré-preenche a mensagem — as campanhas usam para dizer de onde o contato veio. */
export function canaisDiretos({ whatsapp = '' } = {}) {
  return `      <div class="contato__direct" data-reveal="rise-group">
        <a class="channel r-rise" href="${whatsappUrl(whatsapp)}" target="_blank" rel="noopener noreferrer">
          <span class="channel__label">WhatsApp</span>
          <span class="channel__value">${TEL}</span>
          <span class="channel__note">O caminho mais rápido</span>
        </a>
        <a class="channel r-rise" href="tel:${TEL_HREF}">
          <span class="channel__label">Telefone</span>
          <span class="channel__value">${TEL}</span>
          <span class="channel__note">Seg. a sex., 9h às 18h</span>
        </a>
        <a class="channel r-rise" href="mailto:${EMAIL}">
          <span class="channel__label">E-mail</span>
          <span class="channel__value">${EMAIL}</span>
          <span class="channel__note">Resposta em até um dia útil</span>
        </a>
        <a class="channel r-rise" href="${MAPS}" target="_blank" rel="noopener noreferrer">
          <span class="channel__label">Escritório</span>
          <span class="channel__value">${ENDERECO}</span>
          <span class="channel__note">${CIDADE}</span>
        </a>
      </div>`;
}

// O formulário existe na raiz (home, contato.html) e em campanhas/, daí o
// `depth` para o link da política de privacidade.
//
// `campanha` vai num campo oculto do formulário: quando ele for ligado a um
// backend, o contato já chega dizendo de qual campanha veio.
export function contatoForm({ depth = 0, campanha = '' } = {}) {
  const origem = campanha
    ? `\n\n              <input type="hidden" name="campanha" value="${attr(campanha)}">`
    : '';

  return `        <div class="contato__form">
          <p class="lead" data-reveal="rise" style="margin-bottom:var(--s-5)">
            Descreva sua situação. Respondemos em até um dia útil.
          </p>

          <form data-form novalidate>
            <div class="contato__fields">
              <div class="contato__row">
                <div class="field">
                  <input class="field__input" type="text" id="nome" name="nome" placeholder=" " required autocomplete="name">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="nome">Nome</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
                <div class="field">
                  <input class="field__input" type="email" id="email" name="email" placeholder=" " required autocomplete="email">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="email">E-mail</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
              </div>

              <div class="contato__row">
                <div class="field">
                  <input class="field__input" type="tel" id="telefone" name="telefone" placeholder=" " autocomplete="tel">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="telefone">Telefone</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
                <div class="field">
                  <input class="field__input" type="text" id="empresa" name="empresa" placeholder=" " autocomplete="organization">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="empresa">Empresa (opcional)</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
              </div>

              <div class="field">
                <textarea class="field__input" id="mensagem" name="mensagem" placeholder=" " required rows="4"></textarea>
                <span class="field__line" aria-hidden="true"></span>
                <label class="field__label" for="mensagem">Mensagem</label>
                <span class="field__error" role="alert" aria-live="polite"></span>
              </div>

              <div class="hp" aria-hidden="true">
                <label for="website">Não preencha este campo</label>
                <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
              </div>${origem}

              <label class="consent">
                <input type="checkbox" name="consent" value="1">
                <span>Autorizo o contato e o tratamento dos meus dados para essa
                finalidade, nos termos da
                <a href="${prefix(depth)}politica-de-privacidade.html">Política de Privacidade</a>.</span>
              </label>
            </div>

            <div class="contato__submit">
              <button class="btn" type="submit" data-magnetic>
                <span class="btn__label">Enviar</span>
              </button>
              <p class="form-status" role="status" aria-live="polite"></p>
            </div>
          </form>
        </div>`;
}
