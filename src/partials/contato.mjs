// Blocos de contato compartilhados entre a home (#contato), contato.html e as
// páginas de campanha.
//
// CANAIS DIRETOS
// O cliente reclamou que o contato ficava "lá embaixo, no último". Este bloco
// põe os canais reais na frente — clicáveis, com o valor visível, antes do
// formulário. Quem quer falar agora não precisa preencher nada.

import {
  CIDADE, EMAIL, ENDERECO, FORM_ENDPOINT, HORARIO, HORARIO_CURTO, MAPS, OAB, TEL, TEL_HREF,
  WHATS, whatsappUrl,
} from '../data/site.mjs';
import { attr, prefix } from '../lib/html.mjs';
import { ICONE } from '../lib/icones.mjs';

// O e-mail é a palavra mais longa do bloco: em telas de 1024 a 1280px ele
// atravessava a borda do cartão e encostava no endereço ao lado. <wbr> deixa
// a quebra acontecer depois da arroba, e só se precisar.
const EMAIL_QUEBRAVEL = EMAIL.replace('@', '@<wbr>');

function canal({ href, externo = false, icone, rotulo, valor, nota }) {
  const alvo = externo ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `        <a class="channel r-rise" href="${href}"${alvo}>
          <span class="channel__top">${ICONE[icone]}${externo ? `<span class="channel__out">${ICONE.externo}</span>` : ''}</span>
          <span class="channel__label">${rotulo}</span>
          <span class="channel__value">${valor}</span>
          <span class="channel__note">${nota}</span>
        </a>`;
}

/** `whatsapp` pré-preenche a mensagem — as campanhas usam para dizer de onde o contato veio. */
export function canaisDiretos({ whatsapp = '' } = {}) {
  return `      <div class="contato__direct" data-reveal="rise-group">
${[
    canal({ href: whatsappUrl(whatsapp), externo: true, icone: 'whatsapp', rotulo: 'WhatsApp',
      valor: TEL, nota: 'O caminho mais rápido' }),
    canal({ href: `tel:${TEL_HREF}`, icone: 'telefone', rotulo: 'Telefone',
      valor: TEL, nota: HORARIO_CURTO }),
    canal({ href: `mailto:${EMAIL}`, icone: 'email', rotulo: 'E-mail',
      valor: EMAIL_QUEBRAVEL, nota: 'Resposta em até um dia útil' }),
    canal({ href: MAPS, externo: true, icone: 'local', rotulo: 'Escritório',
      valor: ENDERECO, nota: CIDADE }),
  ].join('\n')}
      </div>`;
}

/**
 * Coluna ao lado do formulário. Não repete o endereço, que já está nos canais
 * logo acima: diz como é o primeiro atendimento e quando o escritório atende.
 */
export function contatoAside({ extra = '' } = {}) {
  const inscricao = OAB ? `
          <div class="contato__info r-rise">
            <p class="label label--mute">Inscrição</p>
            <p>${OAB}</p>
          </div>` : '';

  return `        <aside class="contato__aside" data-reveal="rise-group">${extra}
          <div class="contato__info r-rise">
            <p class="label label--mute">Atendimento</p>
            <p>${HORARIO}</p>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Primeira conversa</p>
            <p>Pode ser pelo WhatsApp ou por telefone. Se for preciso, marcamos um
            atendimento no escritório, em ${CIDADE.split(' — ')[0]}.</p>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Sigilo</p>
            <p>O que você contar aqui é tratado com sigilo profissional e usado só
            para responder ao seu contato.</p>
          </div>${inscricao}
        </aside>`;
}

// O formulário existe na raiz (home, contato.html) e em campanhas/, daí o
// `depth` para o link da política de privacidade.
//
// `campanha` vai num campo oculto do formulário: o contato já chega dizendo de
// qual campanha veio — no WhatsApp hoje, no backend quando ele existir.
//
// ENVIO — sem FORM_ENDPOINT (src/data/site.mjs), o formulário valida e abre o
// WhatsApp do escritório com a mensagem montada. Antes ele exibia "Mensagem
// enviada" sem mandar nada a lugar nenhum: no ar, todo contato escrito pelo
// formulário se perderia sem ninguém saber.
export function contatoForm({ depth = 0, campanha = '' } = {}) {
  const origem = campanha
    ? `\n\n              <input type="hidden" name="campanha" value="${attr(campanha)}">`
    : '';
  const peloWhats = !FORM_ENDPOINT;

  return `        <div class="contato__form">
          <p class="lead contato__form-lead" data-reveal="rise">
            Descreva sua situação. Respondemos em até um dia útil.
          </p>

          <!-- method="post": sem JavaScript, o envio nativo seria um GET e
               nome, e-mail e mensagem iriam parar na URL (histórico, logs). -->
          <form data-form data-endpoint="${attr(FORM_ENDPOINT)}" data-whatsapp="${WHATS}" method="post" novalidate>
            <div class="contato__fields">
              <div class="contato__row">
                <div class="field">
                  <input class="field__input" type="text" id="nome" name="nome" placeholder=" " required maxlength="200" autocomplete="name">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="nome">Nome</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
                <div class="field">
                  <input class="field__input" type="email" id="email" name="email" placeholder=" " required maxlength="200" autocomplete="email">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="email">E-mail</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
              </div>

              <div class="contato__row">
                <div class="field">
                  <input class="field__input" type="tel" id="telefone" name="telefone" placeholder=" " maxlength="40" autocomplete="tel">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="telefone">Telefone</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
                <div class="field">
                  <input class="field__input" type="text" id="empresa" name="empresa" placeholder=" " maxlength="200" autocomplete="organization">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="empresa">Empresa (opcional)</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
              </div>

              <div class="field">
                <textarea class="field__input" id="mensagem" name="mensagem" placeholder=" " required maxlength="5000" rows="4"></textarea>
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
                <span class="btn__label">${peloWhats ? 'Enviar pelo WhatsApp' : 'Enviar'}</span>
              </button>${peloWhats ? `
              <p class="contato__submit-note">A mensagem abre pronta no WhatsApp do escritório — é só confirmar o envio.</p>` : ''}
              <noscript><p class="contato__submit-note">Com o JavaScript desligado o formulário não envia: use o WhatsApp, o telefone ou o e-mail acima.</p></noscript>
              <p class="form-status" role="status" aria-live="polite"></p>
            </div>
          </form>
        </div>`;
}
