# Fonseca Lisboa Advocacia — site

**Fonseca Lisboa Advocacia (FL).** Paranaguá — PR. Até out/2026 a sociedade
era FHL — Fonseca Hespanha Lisboa; com a saída do Marlon, passou a FL.
Site institucional construído a partir de [`preparacao-ied-legal.md`](preparacao-ied-legal.md)
(escrito quando o cliente ainda era chamado de "I&D"; a marca real veio depois).
Conteúdo em português do Brasil.

---

## Como rodar

**Financeiro do DOCX e DJEN (08–09/10/2026):** use `npm run testar:local` e abra
<http://127.0.0.1:8125/__teste>. Essa prévia usa dados fictícios e não acessa a
produção. Estado atual e ordem das migrações: [HANDOFF-FINANCEIRO-DJEN.md](HANDOFF-FINANCEIRO-DJEN.md).
As funções de 08/10 ainda não foram publicadas; a revisão de código e visual
de 09/10 está em [REVISAO-FINANCEIRO-DJEN.md](REVISAO-FINANCEIRO-DJEN.md).
`npm run dev` mantém a conexão
com o Supabase configurado no projeto.

Precisa de Node.js 20 ou mais novo. Não há dependências para instalar — o
gerador usa só a biblioteca padrão, então não existe `node_modules`.

```bash
npm run dev
```

E abra `http://127.0.0.1:8123` — e `http://127.0.0.1:8123/sistema` para a área
dos advogados, que sai no **mesmo servidor e no mesmo deploy**. Salvar qualquer
arquivo em `src/`, `assets/` ou `sistema/` regera o site e recarrega o navegador
sozinho.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor local com rebuild automático e live reload |
| `npm run dev -- 3000` | O mesmo, em outra porta |
| `npm run testar:local` | Prévia isolada das novas funções, incluindo Agenda/Google/`.ics`, com perfis e dados fictícios, na porta 8125 |
| `npm run build` | Gera o site completo em `dist/` |
| `npm run preview` | Serve `dist/` como está, sem watch — confere o que vai ao ar |
| `npm run check` | Valida links, âncoras, meta tags e SEO de todas as páginas |
| `npm run og` | Gera as imagens de compartilhamento que faltam (artigos e campanhas) |
| `npm run marca` | Regera marca d'água, assinatura do rodapé, favicon, `logo.png`, `og.png` e as peças da área dos advogados a partir de `assets/img/logo.svg` (FL) e `assets/img/peixinho.svg` |
| `npm run clean` | Apaga `dist/` |
| `npm run sistema:test` | Testes dos cálculos da área dos advogados — ver [`sistema/README.md`](sistema/README.md) |

O resultado do build são arquivos `.html` comuns: o site **não depende de Node
para funcionar**, só para ser gerado. Abrir o `index.html` pelo `file://` é que
não funciona — os caminhos são relativos e as fontes e scripts não carregam.

### O conteúdo vem do banco

Publicações e campanhas **não estão mais só no código**: elas moram no Supabase
e são escritas pelo próprio escritório, na área dos advogados. O build lê o que
está publicado, uma vez, e gera o HTML — ver
[`src/data/conteudo.mjs`](src/data/conteudo.mjs).

O site continua estático: nenhum visitante consulta banco, e é isso que mantém
o artigo indexável pelo Google. O preço é que texto salvo na área dos advogados
**só aparece depois de um build novo** — é o que a tela *Site → Publicar* faz,
chamando o Deploy Hook da Vercel.

`src/data/posts.mjs` e `src/data/campanhas.mjs` continuam no repositório como
**cópia de segurança**: se o Supabase não responder — no plano gratuito ele pausa
depois de uma semana sem uso —, o build avisa e gera o site a partir deles, em
vez de publicar um site sem publicação nenhuma.

### Publicar

Um projeto na Vercel para as duas partes: build `npm run build`, saída `dist/`,
e a área dos advogados copiada para `dist/sistema/`. Conectando o repositório,
cada push publica o site **e** a área.

| Endereço | O que é |
|---|---|
| `/` | Site institucional, público. Link discreto para a área no rodapé |
| `/sistema` | Área dos advogados, com login. Fora do Google e do `robots.txt` |

`vercel.json` cuida das duas: cache e cabeçalhos de segurança no site e, em
`/sistema`, uma CSP estrita, `noindex` e `Referrer-Policy: no-referrer`. A área
dos advogados **não tem build** — os arquivos de `sistema/` são servidos como
estão, e por isso os caminhos dela são absolutos (`/sistema/css/…`): a Vercel
serve a página tanto em `/sistema` quanto em `/sistema/`, e caminho relativo
quebraria numa das duas.

Em qualquer outra hospedagem estática (Netlify, S3, Apache), o que se sobe é o
conteúdo de `dist/` — no Netlify, comando `npm run build` e diretório `dist`.
Não há backend, com duas exceções anotadas abaixo: o formulário de contato e a
função de borda que publica o site.

---

## Estrutura

```
src/
  data/site.mjs          Marca, endereço, telefone, e-mail, horário, OAB, CNPJ, domínio,
                         redes, navegação, anos de atuação, envio do formulário
  data/areas.mjs         As 4 áreas de atuação
  data/equipe.mjs        Os 4 advogados (âncora, retrato, áreas em que atendem)
  data/posts.mjs         Cópia de segurança dos artigos (a fonte é o Supabase)
  data/campanhas.mjs     Cópia de segurança das campanhas (a fonte é o Supabase)
  data/conteudo.mjs      Lê publicações e campanhas do Supabase para o build
  layouts/shell.mjs      O invólucro de TODAS as páginas
  partials/contato.mjs   Canais diretos, formulário e a coluna ao lado dele
  partials/equipe.mjs    Retrato tipográfico, cartões da equipe e assinatura compacta
  partials/institucional.mjs  Método e números (home e escritório)
  lib/html.mjs           pageHead, nextBlock, arrowLink, descritor de página
  lib/icones.mjs         Ícones de traço em SVG inline (canais, compartilhar)
  lib/marca.mjs          Marcas: lê logo.svg (FL) e peixinho.svg e monta os SVG embutidos
  lib/seo.mjs            Canonical, Open Graph, JSON-LD
  lib/assets.mjs         Existência e dimensões de imagens
  pages/*.mjs            Uma função por página (ou por família de páginas)

scripts/
  build.mjs              Gera dist/
  dev.mjs                Servidor local, watch e live reload
  check.mjs              Validação de links, âncoras, meta tags e SEO
  og.mjs                 Imagens de compartilhamento (Chrome/Edge headless)
  marca.mjs              Arquivos derivados das marcas (`npm run marca`)

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
  img/logo.svg           Logomarca FL — fonte única (ver Identidade)
  img/peixinho.svg       A marca antiga, de volta — fonte única (ver Identidade)
  img/                   Marca d'água, assinatura, favicon, logo.png, grão, fallback do herói, OG
  img/og/                Imagens de compartilhamento geradas por `npm run og`
  img/publicacoes/       Imagens dos cartões de post dentro dos artigos

sistema/                 Área dos advogados — copiada para dist/sistema/ pelo build.
                         Ver sistema/README.md
supabase/                Banco da área dos advogados: migrações, função de borda e testes

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
| Trocar telefone, e-mail, endereço e horário | `sistema/js/escritorio.js`, identidade compartilhada com o site |
| Trocar OAB da sociedade, CNPJ, domínio e redes | `src/data/site.mjs` |
| Configurar o backend do formulário | `receber-contato` em `supabase/functions/`; `FORM_ENDPOINT` em `src/data/site.mjs`. Implementado localmente; migrações e função pendentes de publicação |
| Pôr a foto de um advogado | `foto` em `src/data/equipe.mjs` — entra no lugar do retrato tipográfico |
| Dizer em que áreas um advogado atende | `areas` em `src/data/equipe.mjs` — alimenta "Quem atende" da página da área |
| Publicar um artigo novo | Área dos advogados → **Site → Publicações**. Índice, "continue lendo" e sitemap se atualizam sozinhos. Depois, `npm run og` para a imagem de compartilhamento |
| Pôr um post do Instagram (ou Facebook, LinkedIn) num artigo | Bloco "Post do Instagram" no editor do artigo — a imagem é enviada ali e o build a copia para `assets/img/publicacoes/` |
| Criar uma campanha | Área dos advogados → **Site → Campanhas**, depois `npm run og` |
| Mudar o formato de um artigo ou de uma campanha | `src/pages/publicacoes.mjs` e `src/pages/campanhas.mjs` — o conteúdo é do escritório, a marcação é do site |
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
| Formulário via Astro Actions + Resend | Função Supabase `receber-contato` e módulo Contatos, implementados localmente em F1 | Mensagem, origem e consentimento ficam no sistema. Limites e chave de serviço no servidor; WhatsApp como alternativa de falha. Publicação ainda pendente. |

Fora isso, a preparação foi seguida: paleta, escala tipográfica, grid, os quatro
gestos de revelação nomeados, a cortina de dois painéis, os pins de Atuação (300vh) e Linguagem (150vh), a tradução ao vivo do
juridiquês, e a conformidade com o Provimento 205/2021.

---

## Identidade

Duas marcas convivem desde 09/10/2026, a pedido dos advogados:

**Logomarca FL** — o monograma FL serifado cruzado pelo traço em três faixas,
"FONSECA LISBOA" e "ADVOCACIA" entre filetes. Original: `Fonseca Lisboa Logo
final.png` (raiz). Vetorizada em `LogosNovas/FL/_fonte/` (`vetorizar.py` →
`tracado.json` → `gerar.py`), que também gera as peças avulsas em
`LogosNovas/FL/` e a fonte do site, **`assets/img/logo.svg`**: cada elemento
tem id (`#monograma`, `#fl`, `#traco`, `#traco-terra`, `#traco-verde`, `#nome`,
`#advocacia`, `#filete-esquerdo`, `#advocacia-letras`, `#filete-direito`) e
caixa (`data-caixa`), e `src/lib/marca.mjs` monta tudo dali.

**Peixinho** — a marca antiga (`Logo.jpg`, igual a `LogosNovas/Logo_Peixinho.jpg`):
três setores de círculo em teal, vinho e menta — as cores do site. Desenhado em
**`assets/img/peixinho.svg`** por medida do JPG (lados retos 809,5, arco de raio
854,7; 99% de sobreposição com o original). **Nunca vai para os documentos
gerados.**

| Onde | Marca |
|---|---|
| Header | FL embutido (letras em `currentColor`, escurecem sozinhas sobre as seções claras; faixas terra/verde fixas) + filete + FONSECA LISBOA; no celular só o FL |
| Rodapé | Assinatura horizontal FL (`assinatura.svg`) |
| Abertura da home | Peixinho e FL desenhados lado a lado + nome FL (ver abaixo) |
| Marca d'água | Peixinho numa cor (`marca-dagua.svg`) ampliado e recortado pela borda, 4,5% de opacidade |
| Favicon | Peixinho sobre o carvão |
| `logo.png` (JSON-LD), `og.png`, cartões de `npm run og` | FL (os cartões levam o peixinho de marca d'água) |
| Área dos advogados | Entrada: logo FL completa + peixinho de marca d'água · menu: monograma FL · **documentos: só a assinatura FL** |
| Retratos da equipe | O filete, na cor do advogado |

Trocar a FL = regerar com `LogosNovas/FL/_fonte/gerar.py`; depois
`npm run marca` e `npm run og -- --todas`.

**Abertura (1ª visita da sessão, só na home, ~3s):** as duas marcas se
desenham lado a lado — o peixinho à esquerda, o FL à direita, um filete
vertical entre eles crescendo do centro. Cada contorno é traçado em menta
(`stroke-dasharray`) e depois preenchido: as pétalas nas próprias cores, o FL
na tinta, e as faixas terra e verde do traço entram por último. Então
FONSECA LISBOA se revela embaixo, da esquerda (um `clipPath` que cresce), e os
filetes do ADVOCACIA crescem a partir das letras. Depois os painéis se separam.
Timeline em `initLoader()` de `assets/js/site.js`; marcação em `aberturaLoader()`
de `src/lib/marca.mjs`. Como passa dos 3s da rede de segurança do `<head>` em
rede lenta, o `site.js` marca `ied-boot` ao começar e a rede deixa de agir — a
abertura tem teto próprio (4,2s).

**Cores.** As do site são as do peixinho; a FL entra em tinta clara sobre o
petróleo e em petróleo sobre o claro, com as faixas do traço em cor própria:

| Cor | Papel |
|---|---|
| `#2E615D` teal | Acento sobre fundo **claro** (6,2:1) · pétala |
| `#A2CBB8` menta | Acento sobre fundo **escuro** (9,7:1) · cortina de menu · rim light do herói · pétala |
| `#6E5551` vinho | Acento quente, preenchimentos · pétala |
| `#4B3D37` terra · `#435B54` verde | Faixas do traço da FL |
| `#202322` carvão | Fundo do favicon e do `logo.png`; tinta da FL nos documentos |

Paleta completa da FL (Pantone/CMYK): `LogosNovas/FL/paleta.svg`. Não existe
dourado na identidade.

**Dados reais** (extraídos do sistema interno do escritório):
Rua Dr. Leocádio, 282 — Centro, Paranaguá/PR · (41) 2152-2607 ·
áreas: Trabalhista, Previdenciário, Consumidor e Cível ·
sócios: Fonseca e Lisboa — as iniciais **FL** (era FHL até a saída do Marlon).

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
6. **Faixa final das páginas internas** com botão, WhatsApp e horário — era
   só um título e um link pequeno.
7. **Rodapé** com endereço, telefone, WhatsApp, e-mail e horário.

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
campanha escrita na área dos advogados vira `campanhas/<slug>.html`: pergunta
direta e WhatsApp no topo, situações, direitos, como funciona, documentos e
prazo, perguntas frequentes e contato. O WhatsApp abre com uma mensagem que
identifica a campanha, e o formulário leva um campo oculto `campanha` para o
backend, quando ele existir.

O período (`inicio`/`fim`) decide se a página vai para o Google e se é
anunciada na home (logo abaixo das publicações) e na página da área.
Encerrada, ela continua no ar com um aviso — link de post antigo não quebra —,
e o aviso aparece no dia certo mesmo sem novo deploy.

## Posts de rede social nos artigos

Um bloco "Post do Instagram" no corpo do artigo vira um cartão com a imagem do
post, a legenda e o link. **Não é o embed oficial**, de propósito: o embed
carrega script e cookies da Meta assim que a página abre, antes de qualquer
consentimento. O cartão é HTML do site, com a imagem hospedada aqui, e nada de
terceiros carrega até o clique. Aceita também Facebook e LinkedIn, e uma marca
de vídeo para Reels.

A imagem é enviada no próprio editor, vai para o Storage do Supabase e o build
a baixa para `dist/assets/img/publicacoes/`. No ar, quem serve a imagem é o
site — o endereço dela dentro do Instagram muda e expira, e o cartão
quebraria.

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
   atrás da classe `.js`, aplicada por script inline. O loader da home também:
   sem a classe ele cobria a página para sempre. Os números institucionais já
   saem escritos no HTML (eram "0" até a contagem), a seção Linguagem mostra a
   cláusula traduzida, e o formulário usa `method="post"` — um envio nativo
   por GET poria nome, e-mail e mensagem na URL.
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
2. **Logomarca em vetor original.** `assets/img/logo.svg` foi vetorizado do
   PNG `Fonseca Lisboa Logo final.png` (2368 px) — fiel no tamanho em que o
   site usa. Se o designer tiver o `.ai`/`.svg` original, trocar o
   `tracado.json` de `LogosNovas/FL/_fonte/` (ver Identidade).
3. **Inscrição da sociedade na OAB e CNPJ.** `OAB` e `CNPJ` estão **vazios**
   em `src/data/site.mjs` — o site mostrava "OAB/PR nº 00.000" no rodapé, no
   menu e no contato, e "00.000.000/0001-00" na Política de Privacidade.
   Vazios, o rodapé lista a inscrição de cada advogado e a política omite o
   CNPJ; preenchidos, aparecem sozinhos em todos esses lugares.
4. **E-mail e domínio oficiais.** `contato@fonsecalisboa.com.br` e
   `fonsecalisboa.com.br` são suposições (antes, `fhladvocacia.com.br`, também
   suposição) — não havia e-mail do escritório no arquivo.
5. **Ensaio fotográfico.** Até ele existir, cada advogado tem um retrato
   tipográfico — iniciais em serifada e o filete da logomarca
   (`src/partials/equipe.mjs`). A foto entra pelo campo `foto` de
   `src/data/equipe.mjs`. Foto de banco de imagens derrubaria o site.
6. **Política de Privacidade revisada pelo próprio escritório.**
7. **Backend do formulário — implementado localmente (E0/F1, 05/10/2026).**
   `receber-contato` grava no módulo Contatos com página, campanha e
   consentimento. Falta aprovação do teste, aplicação das oito migrações (E0/F1–F4, F5/F6 manuais e F7),
   configuração do segredo e publicação da função antes do frontend.
   Ver [TESTAR-NOVAS-FUNCOES.md](TESTAR-NOVAS-FUNCOES.md). A produção atual
   continua com o comportamento anterior até essa publicação.

**Já resolvidos com os dados reais:** endereço (Rua Dr. Leocádio, 282 — Centro,
Paranaguá/PR), telefone e WhatsApp, as quatro áreas de atuação, os nomes
completos e inscrições dos quatro advogados, o texto institucional e o slogan.

**Não bloqueiam:**

8. Anos de atuação — `ANOS_DE_ATUACAO` em `src/data/site.mjs`. Era `10`, sem
   fonte; está `6`, a única referência que existe ("hoje eu já estou há seis
   anos", Vinícius, reunião de 11/09), mas pode ser o tempo dele e não o do
   escritório. Também: artigos de lançamento, redes sociais e prazo de
   retenção dos dados do formulário.

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
- **Tweens de entrada e saída do mesmo elemento levam `overwrite: 'auto'`.**
  Sem isso os dois rodam juntos, e o que termina por último vence. A miniatura
  entrava em 0,4s e saía em 0,3s: numa passada rápida pela lista, a entrada
  terminava depois da saída e a miniatura ficava presa ao cursor. Hoje a
  visibilidade também é conferida a cada `mousemove`, pelo que está de fato
  sob o ponteiro.
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
- **Com o menu aberto, o header sobe acima da cortina.** Ficava embaixo dela
  (z 100 contra 200): o botão de fechar sumia, e no celular — sem Esc — a
  única saída era escolher uma página. O botão agora diz "Fechar".
- **Não fixe `text-align` no `<p>` global.** `p { text-align: left }`
  descentralizava todo parágrafo de bloco centralizado: a 404, o rótulo do
  herói no celular, a nota do mapa.
- **A 404 usa caminhos a partir da raiz** (`raiz: true` no descritor). Ela é
  servida em qualquer endereço que não existe, inclusive `/atuacao/xyz.html`,
  onde os caminhos relativos do resto do site abririam a página sem CSS.
- **Os cartões da equipe usam `subgrid`.** É o que alinha nome, inscrição,
  filete e textos entre os quatro cartões quando um nome quebra em duas
  linhas. Ao mudar a quantidade de filhos do cartão, ajuste `grid-row: span`.
- **Na seção Linguagem, a caixa de cada termo anima a largura** do texto
  antigo ao novo. Fixa em max(antigo, novo), o texto traduzido — o estado em
  que a seção passa a maior parte do tempo — ficava cheio de buracos. São
  cinco caixas num parágrafo de duas linhas: o custo do reflow é desprezível.
- **`npm run check` confere âncoras entre páginas** (`equipe.html#slug`), não
  só as da própria página.
