# FHL Advocacia — site

**FHL Advocacia — Fonseca Hespanha Lisboa.** Paranaguá — PR.
Site institucional construído a partir de [`preparacao-ied-legal.md`](preparacao-ied-legal.md)
(escrito quando o cliente ainda era chamado de "I&D"; a marca real veio depois).
Conteúdo em português do Brasil.

---

## Como rodar

Precisa de Node.js 20 ou mais novo. Não há dependências para instalar — o
gerador usa só a biblioteca padrão, então não existe `node_modules`.

```bash
npm run dev
```

E abra `http://127.0.0.1:8123`. Salvar qualquer arquivo em `src/` ou `assets/`
regera o site e recarrega o navegador sozinho.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor local com rebuild automático e live reload |
| `npm run dev -- 3000` | O mesmo, em outra porta |
| `npm run build` | Gera o site completo em `dist/` |
| `npm run preview` | Serve `dist/` como está, sem watch — confere o que vai ao ar |
| `npm run check` | Valida links, âncoras, meta tags e SEO de todas as páginas |
| `npm run og` | Gera as imagens de compartilhamento que faltam (artigos e campanhas) |
| `npm run clean` | Apaga `dist/` |

O resultado do build são arquivos `.html` comuns: o site **não depende de Node
para funcionar**, só para ser gerado. Abrir o `index.html` pelo `file://` é que
não funciona — os caminhos são relativos e as fontes e scripts não carregam.

### Publicar

`vercel.json` já está configurado: build `npm run build`, saída `dist/`, mais
headers de cache e de segurança. Conectando o repositório à Vercel, cada push
publica. Em qualquer outra hospedagem estática (Netlify, S3, Apache), o que se
sobe é o conteúdo de `dist/` — no Netlify, comando `npm run build` e diretório
`dist`. Não há backend, com uma exceção anotada abaixo.

---

## Estrutura

```
src/
  data/site.mjs          Marca, endereço, telefone, e-mail, OAB, domínio, redes, navegação
  data/areas.mjs         As 4 áreas de atuação
  data/equipe.mjs        Os 4 advogados
  data/posts.mjs         Os artigos das publicações
  data/campanhas.mjs     As páginas de campanha
  layouts/shell.mjs      O invólucro de TODAS as páginas
  partials/contato.mjs   Canais diretos + formulário
  partials/institucional.mjs  Método e números (home e escritório)
  lib/html.mjs           pageHead, nextBlock, arrowLink, descritor de página
  lib/seo.mjs            Canonical, Open Graph, JSON-LD
  lib/assets.mjs         Existência e dimensões de imagens
  pages/*.mjs            Uma função por página (ou por família de páginas)

scripts/
  build.mjs              Gera dist/
  dev.mjs                Servidor local, watch e live reload
  check.mjs              Validação de links, âncoras, meta tags e SEO
  og.mjs                 Imagens de compartilhamento (Chrome/Edge headless)

dist/                    Saída do build — descartável, fora do git

assets/
  css/tokens.css         Cores, tipografia, grid, espaçamento, movimento
  css/base.css           Reset, tipografia, revelações, acessibilidade
  css/components.css     Header, menu, botões, links, formulário, rodapé
  css/sections.css       Seções da home e páginas internas
  js/motion.js           ÚNICA fonte de durações, easings e revelações
  js/hero-gl.js          Cena WebGL do herói
  js/home.js             Narrativa do scroll (pins, contagens, tradução)
  js/site.js             Loader, header, menu, formulário, cookies
  fonts/                 Galano Grotesque + Newsreader (.woff2)
  vendor/                GSAP, ScrollTrigger, Lenis
  img/                   Grão, fallback do herói, OG, favicon
  img/og/                Imagens de compartilhamento geradas por `npm run og`
  img/publicacoes/       Imagens dos cartões de post dentro dos artigos

package.json · vercel.json
```

As 17 páginas geradas: `index.html`, `escritorio.html`, `atuacao.html` +
`atuacao/*.html` (4), `equipe.html`, `publicacoes.html` + `publicacoes/*.html`
(3), `campanhas/*.html` (1), `contato.html`, `politica-de-privacidade.html`,
`termos-de-uso.html`, `404.html` — mais `sitemap.xml` e `robots.txt`.

### O build

`src/layouts/shell.mjs` cumpre o papel do `src/layouts/Base.astro` da
preparação: um shell único (head, header, cortina de menu, transição, rodapé,
cookies, WhatsApp, scripts) aplicado a todas as páginas. Editar o rodapé ali
atualiza todas as páginas de uma vez, em vez de manter cópias que divergem. A home
sai do mesmo shell: mantida à mão, divergia a cada alteração.

`dist/` é apagado e regerado a cada build. Isso resolve de graça o problema das
páginas órfãs — quando um slug muda em `src/data/`, o arquivo antigo
simplesmente não reaparece.

#### Tarefas comuns

| Quero… | Mexo em… |
|---|---|
| Trocar telefone, e-mail, endereço, OAB, domínio, redes | `src/data/site.mjs` |
| Publicar um artigo novo | `src/data/posts.mjs` — índice, "continue lendo" e sitemap se atualizam sozinhos. Depois, `npm run og` |
| Pôr um post do Instagram (ou Facebook, LinkedIn) num artigo | Bloco `['instagram', {...}]` no `corpo` do artigo — formato no topo de `src/data/posts.mjs`; a imagem do post vai em `assets/img/publicacoes/` |
| Criar uma campanha | Copiar um objeto em `src/data/campanhas.mjs`, depois `npm run og` |
| Editar uma área de atuação | `src/data/areas.mjs` |
| Mudar um advogado da equipe | `src/data/equipe.mjs` |
| Alterar header, rodapé, menu, cookies | `src/layouts/shell.mjs` |
| Mudar o texto de uma página só | `src/pages/<pagina>.mjs` |
| Acrescentar uma página | Novo arquivo em `src/pages/`, registrado em `allPages()` de `scripts/build.mjs` |

---

## Desvios conscientes da preparação

| Preparação dizia | O que foi feito | Por quê |
|---|---|---|
| **Astro 5** | Gerador próprio em Node, sem dependências | A arquitetura da preparação está toda aqui — shell único, dados separados das páginas, uma função por página — só sem o framework e sem `node_modules`. Para um site de 16 páginas estáticas, Astro traria bundler, islands e atualizações de dependência que nada aqui usa. Se algum dia precisar de MDX, otimização de imagem ou componentes interativos, cada `page()` vira um `.astro` e o shell vira `src/layouts/Base.astro`. |
| **Three.js**, imports seletivos, ≤ 60 KB gzip | **WebGL puro**, 5,3 KB gzip | O teto de 60 KB só é atingível com tree-shaking, que exige bundler. E a cena é *um plano com shader próprio* — sem scene graph, sem loader, sem sistema de materiais. Os shaders são exatamente os especificados: mesmo resultado visual, 1 draw call, zero dependência. |
| Formulário via Astro Actions + Resend | Validação completa no cliente, envio **não conectado** | Precisa de backend. O contrato já está pronto: o `payload` montado é logado no console em `site.js`. Ligar a um endpoint é trocar um `setTimeout` por um `fetch`. |

Fora isso, a preparação foi seguida: paleta, escala tipográfica, grid, os quatro
gestos de revelação nomeados, a cortina de dois painéis, os pins de Atuação (300vh) e Linguagem (150vh), a tradução ao vivo do
juridiquês, e a conformidade com o Provimento 205/2021.

---

## Identidade

A marca veio depois da preparação, no `Logo.jpg`: três pétalas sobre preto. As
cores do site foram **amostradas do arquivo**, não escolhidas:

| Cor | Papel |
|---|---|
| `#2E615D` teal | Acento sobre fundo **claro** (6,2:1) |
| `#A2CBB8` menta | Acento sobre fundo **escuro** (9,7:1) · cortina de menu · rim light do herói |
| `#6E5551` vinho | Acento quente, preenchimentos |

O latão da fase anterior saiu: **não existe dourado na identidade**. A logomarca
foi extraída do JPG com fundo transparente e quantizada nas três cores exatas
(`assets/img/logo.png`, 23 KB) — a versão ampliada é a marca d'água das seções.

**Dados reais** (extraídos do sistema interno da FHL):
Rua Dr. Leocádio, 282 — Centro, Paranaguá/PR · (41) 2152-2607 ·
áreas: Trabalhista, Previdenciário, Consumidor e Cível ·
sócios: Fonseca, Hespanha e Lisboa — que são as iniciais **FHL**.

Paranaguá é a segunda maior cidade portuária do Brasil, o que explica por que
dois dos advogados listam Direito Portuário no perfil.

---

## Conformidade OAB

O site segue o **Provimento nº 205/2021 do Conselho Federal da OAB**:

- **Sem depoimentos de clientes** e **sem taxa de êxito** — a parede de
  depoimentos da referência grega foi substituída pela seção **Linguagem**.
- **Sem menção a resultados obtidos** (Art. 4, §2). Os números institucionais
  são anos, áreas, tamanho de equipe e artigos publicados. *Não adicionar
  "% de êxito", "causas ganhas" ou "valores recuperados" — há comentário no
  HTML avisando.*
- **Sem honorários, descontos ou consulta grátis** (Art. 3, I).
- **Sem superlativo ou comparação** (Art. 3, IV) — o vocabulário banido está na
  seção 9.2 da preparação.
- Rodapé com razão social e inscrição na OAB em todas as páginas.
- `termos-de-uso.html` declara que o conteúdo é informativo e não cria relação
  advogado-cliente.

> **Exceção deliberada (12/09/2026):** as páginas de campanha e os cartões de
> post foram feitos **sem o filtro do Provimento**, por decisão da equipe — a
> adequação vai ser discutida com os próprios advogados. Revisar antes de
> publicar uma campanha.

## LGPD

Consentimento não pré-marcado, banner de cookies opt-in com "Recusar" tão
visível quanto "Aceitar", nenhum analytics ativado antes da escolha, honeypot no
lugar de CAPTCHA de terceiros, e **fontes auto-hospedadas** — carregar do CDN do
Google enviaria o IP do visitante para os EUA sem base legal.

---

## Contato em evidência

O contato existia só no fim da home. Agora aparece em cinco lugares:

1. **CTA "Fale conosco"** fixo no header, em todas as páginas.
2. **Dois botões no herói** — "Fale com o escritório" e as áreas de atuação.
3. **Botão flutuante de WhatsApp**, discreto de propósito: sem pulsar, sem abrir
   sozinho, sem balão. Captação agressiva é vedada pelo Provimento 205/2021.
4. **Quatro canais diretos** — WhatsApp, telefone, e-mail e endereço (com link
   para o mapa) — antes do formulário, na home e na página de contato.
5. **Seção Localização** na home, com endereço, horário, telefone e mapa.

### O mapa não carrega sozinho

O iframe do Google só entra **depois do clique** em "Carregar mapa". Carregá-lo
junto com a página mandaria o IP e o user-agent do visitante para o Google antes
de qualquer consentimento — exatamente o que o banner de cookies do site promete
que não acontece. Há sempre o link "Abrir no Google Maps" como alternativa.

O mapa do Google chega claro e azul; um `filter: invert(0.92) grayscale(0.86)`
o transforma em mapa escuro, e uma camada de teal em `mix-blend-mode: color`
puxa o resultado para o verde da marca em vez de deixar um cinza neutro.

---

## SEO

O que `src/lib/seo.mjs` põe em todas as páginas:

- **Canonical e URLs absolutas** em `og:url`, `og:image` e no sitemap. Antes o
  `og:image` era relativo — WhatsApp e Facebook ignoram imagem relativa, e o
  link compartilhado saía sem imagem.
- **Imagem de compartilhamento por artigo e por campanha**, com o título da
  página, gerada por `npm run og` (Chrome ou Edge headless, sem dependência) e
  versionada em `assets/img/og/`. Enquanto não existe, vale `og.png`.
  `npm run check` avisa quando falta gerar ou quando um título mudou.
- **JSON-LD**: `LegalService` na home (endereço, horário, áreas, redes),
  `Article` nos artigos, `FAQPage` nas campanhas e `BreadcrumbList` nas páginas
  internas. Montado com `JSON.stringify`, e o `check` confere se é válido.
- **noindex** na 404 e em campanha fora do período. O sitemap deixa as duas de
  fora e traz a data de publicação dos artigos.
- **Cidade no título das áreas** ("Direito Trabalhista em Paranaguá"), que é
  como se procura advogado.

**Domínio.** `DOMINIO` em `src/data/site.mjs` ainda é suposição. Para testar a
prévia de links num endereço provisório, gere com a variável `SITE_URL`:
`SITE_URL=https://endereco-provisorio npm run build` — no PowerShell,
`$env:SITE_URL="https://endereco-provisorio"; npm run build`.

**Com o domínio no ar:** cadastrar no Google Search Console (verificação por
DNS), enviar o `sitemap.xml` e conferir a prévia dos links no opengraph.xyz ou
no Sharing Debugger do Facebook.

## Campanhas

É a "landing page" que o cliente perguntou se exigiria um site à parte. Cada
objeto de `src/data/campanhas.mjs` vira `campanhas/<slug>.html`: pergunta
direta e WhatsApp no topo, situações, direitos, como funciona, documentos e
prazo, perguntas frequentes e contato. O WhatsApp abre com uma mensagem que
identifica a campanha, e o formulário leva um campo oculto `campanha` para o
backend, quando ele existir.

O período (`inicio`/`fim`) decide se a página vai para o Google e se aparece
na página da área. Encerrada, ela continua no ar com um aviso — link de post
antigo não quebra —, e o aviso aparece no dia certo mesmo sem novo deploy.

## Posts de rede social nos artigos

Um bloco `['instagram', {...}]` no corpo do artigo vira um cartão com a imagem
do post, a legenda e o link. **Não é o embed oficial**, de propósito: o embed
carrega script e cookies da Meta assim que a página abre, antes de qualquer
consentimento. O cartão é HTML do site, com a imagem hospedada aqui, e nada de
terceiros carrega até o clique. Aceita também `facebook` e `linkedin`, e
`video: true` para Reels.

---

## Medições

| | Resultado | Meta da preparação |
|---|---|---|
| JS total (gzip) | **67,1 KB** | < 250 KB |
| CSS total (gzip) | 14,6 KB | — |
| Cena WebGL (gzip) | 5,3 KB | ≤ 60 KB |
| Fontes | 122 KB (5 arquivos `.woff2`) | — |
| Fallback do herói | 40 KB | ≤ 90 KB |
| Home | 16,3 telas de scroll | ~13 telas |
| Páginas | 17, todas HTTP 200, sem link quebrado | — |

Galano Grotesque foi convertida de `.otf` (47 KB por peso) para `.woff2`
subsetado em latin + latin-ext: **14 KB por peso**.

---

## Comportamento em falha

O site degrada em três níveis, todos testados:

1. **Sem JS** — nada fica escondido. Os estados iniciais de revelação vivem
   atrás da classe `.js`, aplicada por script inline.
2. **JS ativo mas GSAP não carrega** (CDN bloqueado, bloqueador de scripts) —
   `site.js` detecta e devolve a página ao estado sem-JS. Há ainda uma rede de
   segurança de 3s no `<head>` para o caso de o próprio `site.js` não chegar.
3. **Sem WebGL** — imagem estática no herói. Também em `prefers-reduced-motion`,
   abaixo de 768px, com `saveData`, ou com 4 núcleos ou menos.

`prefers-reduced-motion` desliga: loader, Lenis, todos os reveals (viram
`opacity` simples), parallax, os dois pins, o botão magnético e a contagem dos
números. A seção Linguagem mostra o texto já traduzido.

---

## Pendências antes do lançamento

**Bloqueiam:**

1. **Licença Webfont da Galano Grotesque.** Os `.otf` da pasta são licença
   *desktop*. Uso em `@font-face` exige licença web do René Bieder. Exposição
   jurídica real, num site de advocacia.
2. **Logomarca em vetor.** A do site foi extraída do `Logo.jpg` e quantizada —
   funciona bem, mas um `.svg` ou `.ai` original renderiza melhor em tamanhos
   grandes e pesaria menos que os 23 KB atuais.
3. **Inscrição da sociedade na OAB e CNPJ.** Estão como `[CONFIRMAR]` em
   `src/data/site.mjs`. Os quatro advogados são OAB/PR; a inscrição da
   *sociedade* não constava no sistema.
4. **E-mail e domínio oficiais.** `contato@fhladvocacia.com.br` e
   `fhladvocacia.com.br` são suposições — não havia e-mail da FHL no arquivo.
5. **Ensaio fotográfico.** Hoje há uma silhueta 2D sobre fundo quase preto.
   Funciona como placeholder; foto de banco de imagens derrubaria o site.
6. **Política de Privacidade revisada pelo próprio escritório.**
7. **Backend do formulário.** Nas campanhas, o formulário já leva o campo
   oculto `campanha`.

**Já resolvidos com os dados reais:** endereço (Rua Dr. Leocádio, 282 — Centro,
Paranaguá/PR), telefone e WhatsApp, as quatro áreas de atuação, os nomes
completos e inscrições dos quatro advogados, o texto institucional e o slogan.

**Não bloqueiam:**

8. Anos de atuação (está `10` como marcador), artigos de lançamento, redes
   sociais e prazo de retenção dos dados do formulário.

### Ressalva: áreas do site vs. áreas da equipe

As quatro áreas do site agora são as **do próprio escritório**, tiradas da
configuração do sistema interno: Trabalhista, Previdenciário, Consumidor e Cível.
Isso resolveu a maior parte do descompasso que existia antes.

Sobra uma ponta: os perfis dos advogados declaram também **Criminal, Empresarial,
Administrativo, Ambiental, Portuário, Imobiliário, Família e Sucessões e
Regularização Fundiária** — competências que a página de Atuação não oferece.
Chama atenção o **Portuário**, que num escritório de Paranaguá provavelmente é
mais central do que a lista de quatro sugere.

A decisão é do escritório: ou as quatro áreas são mesmo a vitrine e o resto fica
no perfil de cada advogado, ou vale abrir uma quinta página de atuação.

---

## Notas de manutenção

- **Nunca escreva `gsap.to()` com duração ou easing literal.** Tudo vem de
  `assets/js/motion.js`. É o que impede o site de virar uma colcha de retalhos
  de timings.
- **Existem quatro revelações, não cinco**: `mask` (só títulos display), `rise`
  (texto), `wipe` (mídia), `rule` (filetes). Aplicar o mesmo fade em tudo é o
  atalho que faz um site parecer gerado por IA.
- **Raio de canto é binário**: `0` em tudo, `999px` só em botão primário e
  cursor. Nada intermediário.
- **Latão `#C08A3E` nunca é texto sobre fundo claro** — dá 2,68:1 e reprova.
  Em fundo claro use `--c-brass-lo` (`#8A5F22`, 4,98:1).
- **Ao animar `yPercent`, zere o `y` junto.** Esta armadilha do GSAP já mordeu
  duas vezes: quando o CSS deixa um `transform: translate(...)` como estado de
  repouso, o GSAP o lê como `y` em PIXELS, e um `yPercent: 0` não o desfaz.
  Aconteceu na cortina de menu (não abria) e no termo traduzido da seção
  Linguagem (assentava 9,6px abaixo da linha de base). Use sempre
  `fromTo(el, {yPercent: N, y: 0}, {yPercent: 0, y: 0})`.
- **Todo elemento que segue o cursor precisa sair no scroll.** A miniatura das
  publicações ficava colada ao ponteiro pela página inteira: rolar com o mouse
  sobre um artigo tira o elemento de baixo do cursor sem disparar `mouseleave`.
  Ela agora some no `scroll`, no `mouseleave` do documento e no `blur`.
- **Máscaras de palavra levam folga vertical de 0,24em.** Com `line-height:
  0.90`, um `overflow: hidden` justo decepa os acentos — o circunflexo de
  "CONSEQUÊNCIA", o agudo de "CLÁUSULA". Medido: os diacríticos maiúsculos da
  Galano sobem 0,20em acima da altura de caixa.
- **Empilhar uma palavra por linha só vale no herói e no manifesto.** Em títulos
  de 6+ palavras vira uma parede ilegível.
- **O cursor é o nativo do sistema**, por escolha do cliente. O cursor
  customizado que a preparação previa (7.3) foi removido. Os efeitos que seguem
  o mouse — botão magnético e miniatura das publicações — continuam.
- **O tamanho dos itens do menu depende da ALTURA da tela**, não só da largura:
  são seis itens empilhados mais o bloco de endereço, contato e inscrição. Com
  medida só em `vw`, numa tela larga e baixa o bloco de contato saía da tela.
