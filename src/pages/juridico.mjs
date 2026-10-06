// Páginas jurídicas obrigatórias: LGPD (Lei 13.709/2018) e Provimento 205/2021
// do Conselho Federal da OAB.

import { CIDADE, CNPJ, EMAIL, ENDERECO, RAZAO } from '../data/site.mjs';
import { arrowLink, page, pageHead } from '../lib/html.mjs';

export function buildPrivacidade() {
  // CNPJ ainda não confirmado (src/data/site.mjs): melhor omitir do que
  // publicar "00.000.000/0001-00" numa política de privacidade.
  const cnpj = CNPJ ? `, inscrita no CNPJ sob o nº ${CNPJ},` : ',';

  const body = pageHead('Jurídico', 'Política de Privacidade') + `

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:3 / span 8">
        <div class="prose" data-reveal="rise-group">
          <p class="r-rise"><strong>Última atualização:</strong> outubro de 2026.
          <!-- [CONFIRMAR] Este texto é um esqueleto conforme a Lei 13.709/2018 e
               PRECISA ser revisado pelo próprio escritório antes do lançamento
               (pendência 6 da preparação). --></p>

          <h2>1. Quem trata os seus dados</h2>
          <p>${RAZAO}${cnpj}
          com endereço em ${ENDERECO}, ${CIDADE}, é a controladora dos dados
          pessoais coletados neste site.</p>

          <h2>2. Quais dados coletamos</h2>
          <ul>
            <li>Os dados que você informa no formulário de contato: nome, e-mail,
            telefone, empresa e o conteúdo da mensagem.</li>
            <li>Dados de navegação anonimizados, apenas se você aceitar os cookies
            de medição.</li>
          </ul>

          <h2>3. Para que usamos</h2>
          <p>Exclusivamente para responder ao seu contato e, se for o caso, avaliar
          a viabilidade de uma atuação profissional. Não usamos os seus dados para
          publicidade e não os vendemos.</p>

          <h2>4. Base legal</h2>
          <p>O tratamento se apoia no seu consentimento (art. 7º, I da LGPD), colhido
          no próprio formulário, e no legítimo interesse de responder a uma solicitação
          que partiu de você.</p>

          <h2>5. Por quanto tempo guardamos</h2>
          <p>Guardamos as mensagens pelo tempo necessário ao atendimento e ao
          exercício regular de direitos.</p>
          <!-- [CONFIRMAR] F1 §5.7: prazo e procedimento de anonimização dependem
               da revisão do escritório. Não há eliminação automática. -->

          <h2>6. Com quem compartilhamos</h2>
          <p>As mensagens ficam no sistema interno do escritório, no Supabase,
          com banco de dados em São Paulo e acesso restrito à equipe autorizada.
          O formulário registra também a página de origem, a campanha quando
          houver e a data do consentimento. Para prevenir abuso, usamos um resumo
          criptográfico do endereço IP, com segredo. Os registros técnicos com
          mais de um dia são removidos no processamento de novos envios;
          o endereço IP não é gravado na ficha do contato.</p>
          <p>Compartilhamos com os provedores de hospedagem apenas os dados
          necessários à operação. Não há compartilhamento para finalidades comerciais.</p>

          <h2>7. Seus direitos</h2>
          <p>Nos termos do art. 18 da LGPD, você pode solicitar confirmação da
          existência de tratamento, acesso, correção, anonimização, portabilidade,
          eliminação e revogação do consentimento. Basta escrever para
          <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

          <h2>8. Cookies</h2>
          <p>Nenhum cookie de medição é ativado antes da sua escolha no banner. Você
          pode recusar sem qualquer prejuízo à navegação. As fontes do site são
          servidas pelo nosso próprio domínio, de modo que a sua navegação não é
          compartilhada com provedores externos de tipografia.</p>

          <h2>9. Encarregado (DPO)</h2>
          <p>Contato do encarregado pelo tratamento de dados:
          <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
        </div>
      </div>
    </div>
  </section>`;

  return page({
    path: 'politica-de-privacidade.html',
    title: 'Política de Privacidade — FHL Advocacia',
    desc: 'Como a FHL Advocacia trata os dados pessoais coletados no site, nos termos da LGPD.',
    body,
  });
}

export function buildTermos() {
  const body = pageHead('Jurídico', 'Termos de Uso') + `

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:3 / span 8">
        <div class="prose" data-reveal="rise-group">
          <h2 class="r-rise">1. Finalidade do site</h2>
          <p>Este site tem caráter meramente informativo sobre a atuação de
          ${RAZAO}, em conformidade com o Provimento nº 205/2021 do
          Conselho Federal da OAB.</p>

          <h2>2. O conteúdo não é consulta jurídica</h2>
          <p>Os artigos e textos publicados aqui têm finalidade informativa e
          educativa. Não constituem parecer, opinião legal ou consulta, e não criam
          relação advogado-cliente. Cada caso depende de análise específica.</p>

          <h2>3. Ausência de promessa de resultado</h2>
          <p>Em nenhuma hipótese este site veicula promessa de resultado, menção a
          casos concretos para oferta de atuação, ou informação sobre honorários,
          em observância aos arts. 3º, 4º e 6º do Provimento nº 205/2021.</p>

          <h2>4. Contato pelo formulário</h2>
          <p>O envio de mensagem pelo formulário não estabelece, por si só, relação
          profissional. A atuação só se inicia após aceitação expressa do escritório
          e formalização entre as partes.</p>

          <h2>5. Propriedade intelectual</h2>
          <p>Os textos, a identidade visual e o código deste site pertencem ao
          escritório e não podem ser reproduzidos sem autorização.</p>

          <h2>6. Alterações</h2>
          <p>Estes termos podem ser atualizados a qualquer momento. A versão vigente
          é sempre a publicada nesta página.</p>
        </div>
      </div>
    </div>
  </section>`;

  return page({
    path: 'termos-de-uso.html',
    title: 'Termos de Uso — FHL Advocacia',
    desc: 'Condições de uso do site da FHL Advocacia.',
    body,
  });
}

export function build404() {
  // Quem cai aqui quase sempre veio de um link antigo ou digitado à mão:
  // além do início, os caminhos que costumam ser o destino de verdade.
  //
  // Caminhos a partir da raiz: a 404 é servida em QUALQUER endereço que não
  // existe, inclusive dentro de /atuacao/ ou /publicacoes/, onde os relativos
  // do resto do site apontariam para o lugar errado.
  const body = `  <section class="notfound">
    <img class="watermark watermark--right" src="/assets/img/monograma.svg" alt="" aria-hidden="true">
    <div class="wrap notfound__inner">
      <p class="label" data-reveal="rise">Erro 404</p>
      <h1 class="display notfound__title r-mask" data-reveal="mask">Página não encontrada</h1>
      <p class="lead" data-reveal="rise">
        O endereço que você acessou não existe mais — ou mudou de lugar.
      </p>
      <div class="notfound__actions" data-reveal="rise">
        <a class="btn" href="/"><span class="btn__label">Voltar ao início</span></a>
      </div>
      <nav class="notfound__links" aria-label="Talvez você procure" data-reveal="rise">
        ${arrowLink('/atuacao.html', 'Áreas de atuação')}
        ${arrowLink('/publicacoes.html', 'Publicações')}
        ${arrowLink('/contato.html', 'Contato')}
      </nav>
    </div>
  </section>`;

  return page({
    path: '404.html',
    title: 'Página não encontrada — FHL Advocacia',
    desc: 'O endereço que você acessou não existe mais.',
    body,
    noindex: true,
    raiz: true,
  });
}
