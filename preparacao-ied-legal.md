# I&D Legal — Preparação de Design

**Documento de preparação para construção do site**
Versão 1.0 · 04/09/2026 · Idioma do site: Português (Brasil)

---

## 0. Como ler este documento

Este é o plano completo. Nenhuma linha de código do site foi escrita ainda — e não deve ser, até que este documento seja aprovado.

O objetivo é que um desenvolvedor (ou uma futura sessão de IA) consiga construir o site inteiro a partir daqui, sem precisar fazer uma única pergunta. Por isso tudo está em valores concretos: hexadecimais, pesos de fonte, durações em segundos, easings nomeados, comportamento em mobile de cada animação.

Onde uma informação depende do cliente e ainda não existe, está marcada com **`[CONFIRMAR]`** e listada na seção 17.

---

## 1. O conceito

### 1.1 A ideia central: **"O peso da palavra"**

I&D Legal atua em **Direito Cível e Contratos**. Isso não é um detalhe de escopo — é o conceito criativo inteiro.

Um contrato é duas partes que chegam a um texto comum. Uma cláusula é uma palavra que gera consequência. O material de trabalho do escritório é **a linguagem escrita e o que ela sustenta**.

Então o site não vai falar de "excelência jurídica", "soluções sob medida" ou "parceria de confiança" — o vocabulário morto de 90% dos sites de advocacia brasileiros. Ele vai ser construído sobre três gestos:

| Gesto | Como se manifesta |
|---|---|
| **Duas partes que convergem** | Cortinas de menu que fecham dos dois lados; painéis que se encontram no centro; o "&" como símbolo estrutural, não decorativo |
| **A palavra que pesa** | Tipografia gigante como protagonista absoluta; texto que revela palavra a palavra, com massa e cadência lenta |
| **Do ruído à clareza** | O shader do herói que se aquieta conforme você desce; a seção "Linguagem" que traduz juridiquês em português na sua frente |

### 1.2 O que o visitante deve sentir nos primeiros 5 segundos

> Discrição cara. Alguém que lê com atenção. Nada apressado, nada gritado, nada barato.

O oposto de: escritório com foto de martelo, balança da justiça, aperto de mão em stock photo, azul corporativo e a palavra "excelência".

### 1.3 O público

1. **Empresas de médio porte** que precisam de contratos e contencioso cível — decisor é sócio, diretor jurídico ou financeiro.
2. **Pessoas físicas de alta renda** em questões cíveis, imobiliárias e sucessórias.

Ambos chegam com um problema já em curso. O site não precisa "vender": precisa **provar seriedade em 20 segundos e tornar o contato fácil**.

---

## 2. Diagnóstico da referência — adhoclegal.gr

Naveguei o site ao vivo e inspecionei o DOM, o CSS e os scripts. Segue o que ele realmente é por dentro — não impressões, medições.

### 2.1 Radiografia técnica

| Item | Valor real medido |
|---|---|
| Fundo | `rgb(35,35,35)` → `#232323` |
| Texto | `rgba(255,255,255,0.99)` |
| Acento | `#E9B934` (amarelo) e `#BF9F1E` (amarelo escuro) |
| Display | `PFMarletText-Light` — serifada, **sempre em caixa alta** |
| Corpo / rótulos | `ProximaNova-Regular` — geométrica |
| Escala display | `clamp(40px, 10.8vw, 156px)` · line-height **0.94em** |
| Escala secundária | `clamp(32px, 1rem + 2.4vw, 56px)` · lh 1.04em |
| Sub-título | `clamp(28px, 0.5rem + 2vw, 38px)` · lh 1.2em |
| Rótulo (eyebrow) | 16px / 24px, uppercase |
| Padding de seção | **240px** topo e base |
| Altura da home | **21.475px** ≈ 21 telas de scroll |
| Animação | **GSAP + ScrollTrigger** |
| 3D / WebGL | **Nenhum.** Zero `<canvas>`, sem Three.js |
| Scroll | Smooth scroll **próprio** (não é Lenis nem Locomotive) |
| Snap | Classe `.snap` em seções de tela cheia |

**Ganchos de animação encontrados no HTML** (revelam a gramática de movimento):

- `js-anim-sp` → split text, aplicado nos títulos display
- `js-staggerKids` → revelação escalonada dos filhos de um bloco
- `js-invisible`, `js-kid` → estados iniciais de opacidade
- `js-section-with-bg` → seções que **trocam a cor de fundo** conforme o scroll

**Cursor customizado** (três elementos no DOM):

```
.cursor           → círculo fixo, border-radius 50%, pointer-events: none
.cursor__dot      → ponto interno, cor #BF9F1E
.cursor__drag     → estado "arraste", fundo #BF9F1E, texto branco
```

**Menu**: `.menu-holder__bg` é um painel `position: fixed` com `background: #E9B934` e `transform: matrix(0,0,0,1,0,0)` — ou seja, **`scaleX(0)` com origem no canto superior direito**. Ao clicar em MENU, uma cortina amarela varre a tela da direita para a esquerda. Capturei a transição no meio do movimento.

**Herói**: círculos enormes e suaves em tom sobre tom no carvão, com grão fino por cima. São a marca do escritório ampliada e recortada, usada como marca d'água gigante.

### 2.2 O que **PEGAR** (usar em espírito, como está)

1. **Tipografia display absurdamente grande, em caixa alta, com line-height abaixo de 1** (0.94). É isso que dá a sensação de peso e de galeria.
2. **Título quebrado uma palavra por linha**, revelado em cascata. `UNIQUE / SERVICES / FOR / UNIQUE / CLIENTS` — a leitura fica lenta e cerimoniosa de propósito.
3. **Rótulo minúsculo em caixa alta acima de cada seção** (`OUR PROFILE`, `OUR FOCUS`). Contraste brutal de escala entre rótulo de 16px e título de 156px — é o truque estrutural do site inteiro.
4. **Padding vertical enorme** (240px). O vazio é o que comunica preço.
5. **Fundo escuro monocromático com um único acento metálico.**
6. **Marca ampliada e recortada como marca d'água de fundo**, tom sobre tom.
7. **Grão/ruído sutil sobre tudo** — tira o aspecto de "chapado digital".
8. **Cursor customizado com estado de arraste explícito** ("DRAG"), que ensina o usuário a interagir.
9. **Home longa e cinematográfica** — 21 telas. O site é um percurso, não uma página.
10. **Transição de cor de fundo entre seções**, guiada pelo scroll.

### 2.3 O que **ADAPTAR** (mudar para caber na marca)

| Referência | O que faremos na I&D Legal | Por quê |
|---|---|---|
| Display **serifada** (PF Marlet) | **Galano Grotesque Bold** em caixa alta | O cliente já tem Galano. Uma geométrica em 160px, com as contraformas circulares do `O`, `D` e `&`, tem tanta presença quanto uma serifada — e é mais contemporânea e mais "marca". A serifada entra em papel restrito (seção 4.2). |
| Amarelo `#E9B934` | **Latão `#C08A3E`** sobre verde-petróleo | O amarelo puro é ácido demais para o registro sóbrio que queremos. O latão tem o mesmo brilho metálico, com metade da estridência. |
| Carvão `#232323` | **Verde-petróleo `#0E1F1C`** | O jurídico brasileiro é um mar de azul-marinho. O verde profundo é raro no setor, tem a mesma seriedade e cria marca própria em vez de clonar a referência. |
| Cortina de menu de **um lado só** | **Dois painéis que se encontram no centro** | Materializa o conceito: duas partes convergindo em um acordo. Mesma técnica, significado próprio. |
| Smooth scroll proprietário | **Lenis** | Padrão moderno, integra nativamente com ScrollTrigger, mantém acessibilidade de teclado. |
| **Sem 3D** | **Uma única cena WebGL**, no herói | Ver seção 8 — com justificativa conceitual e orçamento de performance. |
| Números de impacto (`>90% de processos ganhos`) | **Números institucionais** (anos, equipe, áreas, publicações) | Obrigatório por conformidade OAB. Ver seção 3. |
| `scroll-snap` em todas as seções | Snap **apenas** na passagem herói → manifesto | Snap na página inteira briga com a intenção do usuário e é hostil em trackpad. Usar como pontuação, não como regra. |

### 2.4 O que **DESCARTAR** (não cabe — e por quê)

| Descartado | Motivo |
|---|---|
| **Parede de depoimentos de clientes** (8 depoimentos nomeados, o clímax emocional do site grego) | Risco de infração ao Provimento 205/2021 da OAB. Ver seção 3. Substituído pela seção **Linguagem** (6.6). |
| **Estatística de êxito** (`>90% successful trials`) | Vedado: divulgação de resultados obtidos, Art. 4, §2. |
| **Logos de clientes** (Beiersdorf, COCO-MAT, Septona…) | Uso da carteira de clientes como argumento comercial cai em captação indevida. |
| **Carrossel arrastável de depoimentos** (`app-drag.min.js`) | Some junto com os depoimentos. O estado `drag` do cursor é reaproveitado na galeria da equipe. |
| **Toggle de idioma EN/GR** | Site é PT-BR monolíngue na v1. Estrutura fica pronta para `/en` numa fase 2, mas sem construir agora. |
| **Home de 21 telas na íntegra** | Vamos para **~12–14 telas**. 21 é longo até para o padrão awwwards, e o público jurídico brasileiro tem menos paciência de scroll que o público de portfólio. |

---

## 3. Conformidade OAB — as regras que moldam o design

**Esta seção vem antes da identidade visual de propósito: ela elimina componentes inteiros que seriam óbvios num site comum.**

O site está sujeito ao **Provimento nº 205/2021 do Conselho Federal da OAB**, que dispõe sobre publicidade e informação na advocacia. Confirmei que segue vigente em 2026 (há propostas de atualização apresentadas em outubro de 2025, ainda não aprovadas).

### 3.1 Vedado — não pode entrar no site

| Regra | Artigo | Impacto no design |
|---|---|---|
| Menção a **promessa de resultados** ou uso de **casos concretos** para oferta de atuação | Art. 6 | Sem "cases de sucesso", sem portfólio de processos |
| Divulgação de **resultados obtidos de qualquer natureza** | Art. 4, §2 | **Mata a seção de números de êxito da referência.** Sem "% de causas ganhas", sem "R$ X milhões recuperados" |
| **Valores de honorários**, forma de pagamento, gratuidade ou descontos | Art. 3, I | Sem tabela de preços, sem "primeira consulta grátis", sem CTA de "orçamento" |
| Expressões **persuasivas, de autoengrandecimento ou de comparação** | Art. 3, IV | Sem "o melhor escritório", "referência no mercado", "líder em". Elimina o superlativo do copy inteiro |
| **Sensacionalismo, mercantilização, captação indevida de clientela** | Provimento | Sem urgência artificial, sem pop-up de saída, sem "fale agora e garanta seus direitos" |
| **Ostentação** de bens, veículos, viagens | Provimento | A fotografia mostra trabalho e arquitetura, nunca símbolos de riqueza |

**Depoimentos de clientes:** o Provimento não cita "depoimento" com essa palavra. Mas depoimento elogioso é, na prática, expressão de comparação e autoengrandecimento (Art. 3, IV) e frequentemente carrega menção a resultado (Art. 4, §2) — e é assim que os Tribunais de Ética e Disciplina têm tratado. **Decisão tomada: seguir à risca, sem depoimentos.** É a opção conservadora e é a correta para um escritório que quer durar.

### 3.2 Permitido — e que vamos usar bem

- Site institucional próprio, com domínio próprio
- Nome do escritório, **número de inscrição na OAB**, endereço, telefone, e-mail
- **Áreas de atuação** e qualificações
- **Equipe, com fotos dos advogados e logomarca** (Art. 5 autoriza expressamente)
- **Conteúdo informativo e educativo**: artigos, publicações, newsletters
- Formulário de contato para receber consultas

O critério que atravessa tudo: **discrição e sobriedade**. Convenientemente, é exatamente o mesmo critério estético do projeto.

### 3.3 Substituições — o que entra no lugar do que foi cortado

| Saiu (proibido) | Entrou (permitido, mesmo impacto visual) |
|---|---|
| `>90% de processos ganhos` | `18 anos de atuação` |
| `R$ 40 mi recuperados` | `4 áreas do direito civil` |
| Parede de depoimentos | **Seção "Linguagem"** — a posição editorial do escritório sobre clareza contratual (6.6) |
| Logos de clientes | **Setores atendidos**, em texto: "Construção civil · Varejo · Saúde · Tecnologia · Agronegócio" |
| Cases de sucesso | **Publicações** — artigos assinados pelos sócios (permitido *e* excelente para SEO) |

**Elementos obrigatórios no rodapé:**

```
I&D Legal Sociedade de Advogados
OAB/[UF] nº [CONFIRMAR]
[Endereço completo]
Política de Privacidade · Termos de Uso
```

---

## 4. Identidade visual

### 4.1 Paleta

Direção escolhida: **verde-petróleo + latão**.

```css
:root {
  /* Superfícies escuras — modo principal */
  --c-abyss:      #0A1614;  /* fundo mais profundo — loader, rodapé */
  --c-petrol:     #0E1F1C;  /* FUNDO PRINCIPAL do site */
  --c-petrol-up:  #142A26;  /* superfície elevada — cards, inputs */
  --c-petrol-ln:  #1D3833;  /* linhas e divisores sobre escuro */

  /* Superfícies claras — seções de respiro */
  --c-bone:       #F4F1EA;  /* off-white quente — fundo claro */
  --c-bone-dim:   #E7E2D6;  /* off-white secundário */

  /* Texto */
  --c-ink:        #F4F1EA;  /* texto sobre escuro */
  --c-ink-mute:   #A8B5B1;  /* texto secundário sobre escuro */
  --c-ink-dark:   #0E1F1C;  /* texto sobre claro */
  --c-ink-dark-m: #4A5C57;  /* texto secundário sobre claro */

  /* Acento */
  --c-brass:      #C08A3E;  /* LATÃO — acento principal */
  --c-brass-lo:   #8A5F22;  /* latão escurecido — texto sobre fundo claro */
  --c-brass-hi:   #D9A65C;  /* latão claro — hover, brilho especular */

  /* Semânticos (nomeados por função, nunca por cor) */
  --c-bg:            var(--c-petrol);
  --c-surface:       var(--c-petrol-up);
  --c-text:          var(--c-ink);
  --c-text-muted:    var(--c-ink-mute);
  --c-rule:          var(--c-petrol-ln);
  --c-action:        var(--c-brass);
  --c-action-hover:  var(--c-brass-hi);
  --c-focus:         var(--c-brass-hi);
}
```

**Contrastes verificados (WCAG 2.1):**

| Combinação | Ratio | Status |
|---|---|---|
| `#F4F1EA` sobre `#0E1F1C` | **14.98:1** | AAA ✓ |
| `#0E1F1C` sobre `#F4F1EA` | **14.98:1** | AAA ✓ |
| `#C08A3E` sobre `#0E1F1C` | **5.59:1** | AA ✓ (AAA ✗) |
| `#C08A3E` sobre `#F4F1EA` | **2.68:1** | ✗ **FALHA** |
| `#8A5F22` sobre `#F4F1EA` | **4.98:1** | AA ✓ |

> **Regra dura:** latão `#C08A3E` **nunca** é usado como texto sobre fundo claro. Em fundo claro, texto de acento usa `--c-brass-lo` (`#8A5F22`). O `#C08A3E` em fundo claro só pode ser preenchimento, filete ou display acima de 32px.

**Proporção de uso:** 78% petróleo · 16% off-white · 5% texto · **1% latão**. O latão é raro de propósito — é o que faz ele valer. Se aparecer em tudo, vira decoração.

### 4.2 Tipografia

**Família principal: Galano Grotesque** (René Bieder, 2014). Geométrica na linhagem Futura / Avant Garde / Avenir, com esqueleto largo, altura-x grande, formas circulares, aberturas fechadas e ascendentes/descendentes curtas. Em corpo gigante, as contraformas circulares do `O`, `D`, `G` e `&` viram o traço de marca do site.

Arquivos disponíveis na pasta do projeto:

```
GalanoGrotesqueRegular.otf   → peso 400
GalanoGrotesqueMedium.otf    → peso 500
GalanoGrotesqueBold.otf      → peso 700
```

> ⚠️ **Duas pendências reais antes do build:**
>
> **1. Licença.** Os arquivos `.otf` são licença *desktop*. Incorporar via `@font-face` na web exige **licença Webfont** separada do René Bieder (MyFonts / Fontspring). Isso precisa ser resolvido antes do lançamento — é exposição jurídica real, e ironicamente para um escritório de advocacia. **`[CONFIRMAR]`**
>
> **2. Conversão.** `.otf` não é formato web. Converter para **`.woff2`** (queda de ~47 KB → ~20 KB por peso). Subset para `latin` + `latin-ext` (o português precisa de `ã õ ç á é í ó ú â ê ô à`). Não subsetar de forma agressiva demais: nomes de clientes e termos jurídicos usam acentuação completa.

```css
@font-face {
  font-family: 'Galano Grotesque';
  src: url('/fonts/galano-regular.woff2') format('woff2');
  font-weight: 400; font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2212;
}
/* idem para 500 (Medium) e 700 (Bold) */
```

**Stack de fallback** — geométricas com métrica próxima, para minimizar o salto no swap:

```css
--font-sans: 'Galano Grotesque', 'Futura', 'Avenir Next', 'Century Gothic',
             'Trebuchet MS', system-ui, sans-serif;
```

**Restrição a respeitar:** só existem 3 pesos e **nenhum itálico**. O sistema de tipografia inteiro tem que funcionar com 400/500/700. Nada de contar com Light ou Black.

---

**Família secundária: uma serifada editorial, em papel restrito.**

Por que adicionar uma segunda família, se Galano é a marca? Dois motivos concretos:

1. Galano **não tem itálico**, e texto jurídico longo precisa de ênfase (`termos latinos`, títulos de lei, citações).
2. Leitura longa (artigos, publicações) rende mais em uma serifada de texto.

Recomendação: **Newsreader** (Production Type, SIL Open Font License, gratuita, self-hostable). Tem itálicos verdadeiros, ótica editorial e caráter de documento — não de "fonte de blog".

**Regra dura de papel:** a serifada aparece **exclusivamente** em:
- Corpo de texto dos artigos em `/publicacoes/[slug]`
- Citações em destaque (*pull-quotes*)
- Numerais grandes da seção de números institucionais

Nunca em: navegação, botões, títulos da home, rótulos, formulários. Assim a voz da marca continua sendo Galano.

Alternativa se o cliente quiser mais drama no display: **Instrument Serif** — mas só para display, não tem robustez para texto corrido.

---

**Escala tipográfica** (fluida, base 16px):

| Token | Tamanho | Line-height | Tracking | Peso | Uso |
|---|---|---|---|---|---|
| `--t-display` | `clamp(44px, 10.5vw, 160px)` | **0.90** | `-0.025em` | 700 | Título do herói e de seção. **Sempre caixa alta** |
| `--t-h1` | `clamp(34px, 5.4vw, 76px)` | 1.02 | `-0.02em` | 700 | Títulos de página interna |
| `--t-h2` | `clamp(28px, 3.2vw, 52px)` | 1.08 | `-0.015em` | 500 | Subtítulos de seção |
| `--t-h3` | `clamp(22px, 2.2vw, 32px)` | 1.2 | `-0.01em` | 500 | Títulos de card, nome de advogado |
| `--t-lead` | `clamp(18px, 1.5vw, 23px)` | 1.5 | `0` | 400 | Parágrafo de abertura |
| `--t-body` | `17px` | 1.62 | `0` | 400 | Corpo |
| `--t-small` | `14px` | 1.5 | `0` | 400 | Legendas, notas de rodapé |
| `--t-label` | `12px` | 1.4 | **`0.18em`** | 500 | **Rótulo (eyebrow)**, caixa alta |

O contraste extremo entre `--t-label` (12px) e `--t-display` (160px) é o mesmo truque estrutural da referência — e é o que faz a página parecer editorial em vez de institucional.

**Regras tipográficas:**
- Display e rótulos: `text-transform: uppercase`
- Corpo: caixa normal, **nunca** justificado (rio de espaços em português é feio e prejudica leitura)
- Medida de leitura: máximo **68 caracteres** por linha
- `text-wrap: balance` em títulos, `text-wrap: pretty` em parágrafos
- Hifenização desligada; em português gera quebras estranhas

### 4.3 Grid e espaçamento

```css
--grid-cols: 12;
--grid-gutter: clamp(16px, 1.6vw, 24px);
--grid-margin: clamp(20px, 5vw, 80px);
--max-width: 1680px;
```

Escala de espaçamento base **8px**, com passos deliberadamente **não uniformes** (uniformidade é sinal de site gerado por IA — ver seção 16):

```css
--s-1: 8px;    --s-2: 16px;   --s-3: 24px;   --s-4: 40px;
--s-5: 64px;   --s-6: 96px;   --s-7: 144px;  --s-8: 200px;
--s-section: clamp(96px, 15vh, 240px);   /* padding vertical de seção */
```

**As seções não têm todas o mesmo respiro** — isso é intencional. Ritmo definido na seção 6: seções de manifesto respiram no máximo (`--s-section`), seções funcionais (contato, publicações) usam `--s-6`. A variação é o que cria cadência.

### 4.4 A marca d'água — o monograma

A referência usa círculos gigantes tom sobre tom, derivados da própria marca. O equivalente para I&D Legal é o **ampersand**.

Como o significado da sigla ainda não está definido **`[CONFIRMAR]`**, tratamos "I&D" de forma geométrica e abstrata — o que na verdade é uma vantagem: o `&` é conceitualmente perfeito aqui. **O ampersand é o símbolo da união entre duas partes. Que é literalmente o que um contrato é.**

**Especificação:**
- O `&` do **Galano Grotesque Bold**, renderizado em tamanho gigantesco (~140vh de altura)
- Recortado pela borda da viewport — só se vê um fragmento da curva
- Cor: `--c-brass` com `opacity: 0.045`, ou `--c-petrol-up` em tom sobre tom
- Deriva vertical lenta com parallax `yPercent: -12` ao longo da seção (`scrub: true`)
- Aparece em exatamente **3 momentos** da home. Repetir mais mata o efeito.

### 4.5 Textura e grão

Uma superfície digital perfeitamente chapada tem cara de template. A referência resolve isso com grão fino, e nós vamos fazer o mesmo — melhor.

```css
.grain::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.035;
  background-image: url('/img/noise.png');  /* tile 128×128, PNG-8, ~2 KB */
  background-repeat: repeat;
  mix-blend-mode: overlay;
}
```

- Tile de 128×128px, **não** animado (grão animado consome GPU sem retorno e incomoda quem tem sensibilidade visual)
- `opacity` entre `0.03` e `0.045` — acima disso vira sujeira
- Desligado sob `prefers-reduced-motion`? Não: ele é estático, pode ficar.

**Vinheta:** um único radial suave no herói, `radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(10,22,20,0.55) 100%)`. **É o único gradiente do site inteiro.** Ver seção 16.

### 4.6 Fotografia

Esta é a área onde sites de advocacia mais escorregam. Direção de arte obrigatória:

**Fazer:**
- **Arquitetura e detalhe do escritório**: canto de mesa, luz entrando por uma janela, textura de papel, lombada de livro, detalhe de uma escrivaninha. Enquadramentos apertados, muita sombra.
- **Retratos da equipe**: fundo escuro (`--c-petrol` ou parede real do escritório), luz lateral única e dura, expressão neutra e direta, olhar na câmera. Meio-corpo. Sem sorriso de vendedor.
- **Tratamento uniforme**: dessaturar para ~65%, elevar levemente o ponto preto (preto lavado, não puro), leve viés quente nas altas-luzes para conversar com o latão.
- Proporções: retratos `4:5`, ambientes `3:2`, detalhes `1:1`.

**Não fazer — a lista de proibições:**
- ❌ Martelo de juiz, balança da justiça, estátua da Têmis, código com fita vermelha
- ❌ Aperto de mão genérico
- ❌ Stock de "equipe diversa sorrindo ao redor de um notebook em escritório bem iluminado" — o clichê nº 1 dos sites gerados por IA
- ❌ Foto de prédio corporativo de vidro
- ❌ Qualquer imagem gerada por IA (plástica, simétrica demais, mãos erradas — e num site de advocacia, é um risco reputacional)
- ❌ Ostentação: carro, relógio, garrafa de uísque (também vedado pela OAB)

**Se o cliente não tiver fotos profissionais: contratar ensaio é inegociável.** Um site deste nível com fotos de celular ou banco de imagens perde toda a credibilidade que a tipografia construiu. Enquanto o ensaio não existe, construir com blocos tipográficos e a marca d'água — o site funciona sem fotos, e fica bom. Não funciona com fotos ruins.

### 4.7 Iconografia e forma

- **Sem biblioteca de ícones.** Nada de Font Awesome, Lucide, Heroicons. Ícone genérico é assinatura de template.
- O que existe: **setas e filetes desenhados à mão em SVG**, com espessura de 1px, alinhados à geometria da Galano (traço reto, terminação em ângulo de 45°).
- **Numerais de índice** (`01`, `02`, `03`) fazem o trabalho que ícones fariam.

**Regra de raio de canto** — importante, porque "tudo com 16px de raio" é o tell nº 1 de site gerado por IA:

```css
--r-none: 0;      /* PADRÃO: cards, imagens, inputs, seções — tudo reto */
--r-pill: 999px;  /* apenas: botões primários e o cursor customizado */
```

**Nada no site tem raio intermediário.** Ou é reto (documento, papel, folha) ou é totalmente circular (o cursor, o botão). Essa binariedade é uma decisão de marca, e é o que impede o site de parecer "cards do Bootstrap".

**Filetes:** `1px solid var(--c-rule)`. Filete horizontal separando blocos é o principal recurso de divisão — como uma linha em um contrato.

---

## 5. Arquitetura de informação

```
/                        Home (o percurso completo, ~13 telas)
/escritorio              O Escritório — história, valores, método expandido
/atuacao                 Atuação — índice das áreas
  /atuacao/[slug]        Página por área (4 páginas)
/equipe                  Equipe — grid de advogados
  /equipe/[slug]         Perfil individual (formação, OAB, publicações)
/publicacoes             Publicações — índice de artigos
  /publicacoes/[slug]    Artigo
/contato                 Contato — formulário, endereço, mapa
/politica-de-privacidade LGPD
/termos-de-uso
```

**Navegação:** header minimalista fixo com apenas **logo à esquerda** + **botão MENU à direita** (como a referência). Todo o resto vive dentro da cortina. Isso mantém o herói limpo e dá o momento de transição do menu.

**Áreas de atuação — Cível e Contratos** `[CONFIRMAR a lista final]`:

| Slug | Nome | Ângulo |
|---|---|---|
| `contratos-empresariais` | Contratos Empresariais | Redação, revisão e negociação |
| `contencioso-civel` | Contencioso Cível | Disputas judiciais e arbitragem |
| `responsabilidade-civil` | Responsabilidade Civil | Danos, indenizações, defesa |
| `imobiliario` | Direito Imobiliário | Compra e venda, locação, incorporação |

Quatro áreas é o número certo: cabe em uma tela sem rolagem interna, e é grande o suficiente para parecer um escritório completo.

---

## 6. A narrativa do scroll — seção por seção

Esta é a parte central do documento. Cada seção descreve: **o que aparece, o que anima, o que dispara, quanto dura, e o que acontece no mobile.**

Extensão total da home: **~13 telas** (≈ 11.500px em desktop 1080p).

---

### 6.0 · Loader (0 – 1,8s)

**O que se vê:** tela `--c-abyss` cheia. No centro, o monograma `I&D` em Galano Bold, 96px. Abaixo, um filete horizontal de 1px em latão, com 0 de largura.

**Sequência:**

| t | Evento |
|---|---|
| 0,0s | `I&D` entra com `clipPath` revelando de baixo, `duration: 0.7`, `ease: expo.out` |
| 0,3s | Filete de latão cresce de `scaleX: 0` → `1`, origem à esquerda, atrelado ao **progresso real de carregamento das fontes e do shader** |
| ao completar | Filete pisca uma vez em `--c-brass-hi` |
| +0,15s | **Dois painéis** `--c-abyss` se separam — um sobe, um desce — revelando o herói. `duration: 1.0`, `ease: expo.inOut`, `stagger: 0.06` |

**Regras:**
- Máximo **1,8s**. Se as fontes carregarem antes, sai antes. Loader que dura mais do que precisa é arrogância.
- Só aparece na **primeira visita da sessão** (`sessionStorage`). Navegações internas não repetem.
- `prefers-reduced-motion`: sem loader. Conteúdo direto, `opacity` 0→1 em 0,2s.

---

### 6.1 · Herói (tela 1)

**Layout:** tela cheia, `--c-petrol`, cena WebGL de fundo (seção 8).

```
                    I&D LEGAL — ADVOCACIA CÍVEL E CONTRATUAL          ← rótulo 12px

                              CADA
                            CLÁUSULA
                               TEM
                               UMA
                          CONSEQUÊNCIA                                 ← display 160px

LINKEDIN   INSTAGRAM                                    ROLE ↓
```

**Copy:**
- Rótulo: `I&D LEGAL — ADVOCACIA CÍVEL E CONTRATUAL`
- H1: `CADA / CLÁUSULA / TEM / UMA / CONSEQUÊNCIA`
- *(alternativa, se o cliente preferir menos gravidade:* `ONDE / A PALAVRA / TEM / PESO` *)*

**Animação de entrada** (após o loader):
- Rótulo: `opacity` 0→1 + `y` 12→0, `duration: 0.6`, `ease: power2.out`
- H1: revelação **palavra por palavra**, cada palavra em uma máscara `overflow: hidden`, `yPercent: 110 → 0`, `duration: 0.95`, `ease: expo.out`, `stagger: 0.075`
- Rodapé do herói (redes + "ROLE"): `stagger: 0.05` após o H1

**Ao rolar** (`scrub: true`, do topo até 100vh):
- H1 sobe com `yPercent: -30` e `opacity` → 0.15 (parallax mais rápido que o fundo)
- Amplitude do shader cai de `1.0` → `0.15` — **a superfície se aquieta**
- Indicador "ROLE" some nos primeiros 5% do scroll

**Mobile (< 768px):**
- Display cai para `clamp(44px, 13vw, 68px)` — o `10.5vw` fica pequeno demais em tela estreita
- H1 quebra em 3 linhas em vez de 5 (`CADA CLÁUSULA / TEM UMA / CONSEQUÊNCIA`)
- **Sem WebGL.** Substituído por um `.webp` estático do próprio render (seção 8.4)
- Parallax do H1 reduzido para `yPercent: -12`

---

### 6.2 · Manifesto (telas 2–3)

Transição de fundo: `--c-petrol` → `--c-abyss`, com `scrub`, ao longo de 40vh.

**Copy:**
- Rótulo: `O ESCRITÓRIO`
- Display: `UM / CONTRATO / BEM / ESCRITO / EVITA / ANOS / DE / PROCESSO`
- Parágrafo (`--t-lead`, coluna de 5 colunas, alinhado à direita da tela):
  > A I&D Legal atua em direito cível e contratual. Trabalhamos no texto antes que ele vire disputa — e no tribunal quando já virou. Em qualquer um dos dois momentos, o método é o mesmo: entender o negócio primeiro, escrever depois.
- Link: `CONHEÇA O ESCRITÓRIO →`

**Animação:**
- As 8 palavras do display revelam com `stagger: 0.06` conforme entram na viewport (`start: 'top 75%'`, `once: true`)
- **O ampersand gigante** aparece aqui pela 1ª vez, recortado à esquerda, com parallax `yPercent: -12` em `scrub`
- Parágrafo: `js-staggerKids` — revela linha a linha, `stagger: 0.08`, `duration: 0.7`, `ease: power3.out`

**Mobile:** display quebra em 4 linhas de 2 palavras. Ampersand reduzido para 90vh e `opacity: 0.03`. Parágrafo passa a alinhamento à esquerda, largura total.

---

### 6.3 · Atuação (telas 4–6) — **a seção com pin**

Fundo volta para `--c-petrol`.

**Comportamento:** a seção é **pinada** por 300vh. À esquerda, um índice fixo das 4 áreas. À direita, o conteúdo da área ativa troca conforme o scroll avança.

```
┌──────────────────────────────────────────────────────┐
│  ATUAÇÃO                                             │
│                                                      │
│  01 CONTRATOS EMPRESARIAIS  ◄     [imagem / detalhe] │
│  02 Contencioso Cível              CONTRATOS         │
│  03 Responsabilidade Civil         EMPRESARIAIS      │
│  04 Direito Imobiliário                              │
│                                    Redação, revisão  │
│  ──────────────────────────        e negociação...   │
│  [barra de progresso latão]        VER ÁREA →        │
└──────────────────────────────────────────────────────┘
```

**Animação:**
- `ScrollTrigger.create({ pin: true, end: '+=300%', scrub: 0.6 })`
- Item ativo: `opacity` 0.35 → 1, e um **filete de latão** cresce à esquerda dele (`scaleX: 0→1`, `transform-origin: left`, `0.5s`, `ease: power2.inOut`)
- Troca de conteúdo à direita: `clipPath` `inset(0 0 100% 0)` → `inset(0 0 0% 0)`, `0.65s`, `ease: expo.out`
- Barra de progresso do latão na base do índice, atrelada ao `scrub`
- **Hover em item inativo:** `opacity` → 0.7 e `x: 6px`, `0.3s`, `ease: power2.out`. Cursor vira o estado `link`.
- **Clique** em qualquer item leva à página da área

**Mobile:** **pin desligado.** Vira uma pilha vertical de 4 blocos, cada um revelando com `y: 40 → 0` + `opacity`, `stagger: 0.1`, `once: true`. Pin com scrub em mobile é caro e briga com a barra de URL do navegador que aparece/some.

---

### 6.4 · Método (telas 7–8)

Fundo muda para `--c-bone` — **a primeira quebra de luz do site**. Depois de 7 telas escuras, o off-white é um respiro físico, e sinaliza "aqui a informação é prática".

Transição: **wipe vertical** com `clipPath`, `scrub` ao longo de 30vh — o claro sobe por cima do escuro.

**Copy:**
- Rótulo: `MÉTODO` (em `--c-brass-lo`, porque o fundo é claro)
- H2: `COMO TRABALHAMOS`

| # | Etapa | Texto |
|---|---|---|
| 01 | **Escuta** | Antes de olhar o contrato, entendemos o negócio. O que a empresa vende, para quem, e onde já se queimou antes. |
| 02 | **Diagnóstico** | Mapeamos os riscos reais do documento e separamos o que é negociável do que é inegociável. |
| 03 | **Redação e negociação** | Escrevemos em português. Negociamos com posição definida, não com improviso. |
| 04 | **Acompanhamento** | Contrato assinado não é assunto encerrado. Revisão periódica e suporte na execução. |

**Animação:**
- 4 linhas separadas por filete de 1px `--c-ink-dark` a 12% de opacidade
- Cada linha: `y: 30 → 0` + `opacity: 0 → 1`, `stagger: 0.12`, `duration: 0.8`, `ease: power3.out`, `once: true`
- Numeral `01`–`04` em **serifada Newsreader**, 64px, `--c-brass-lo` — o único lugar da home onde a serifada aparece
- **Hover na linha:** fundo passa a `--c-bone-dim` em `0.4s ease: power2.out`, e o numeral desliza `x: 8px`. Nada pisca, nada salta.

**Mobile:** cada etapa vira um bloco empilhado com o numeral acima do título. `stagger` reduzido para `0.08`.

---

### 6.5 · Números institucionais (tela 9)

Ainda em `--c-bone`. **Esta é a seção reescrita por conformidade OAB** — o lugar onde a referência colocava `>90% de processos ganhos`.

```
      18                4                12               40+
   ANOS DE          ÁREAS DO         ADVOGADOS       ARTIGOS
   ATUAÇÃO        DIREITO CIVIL      NA EQUIPE      PUBLICADOS
```
*(todos os valores `[CONFIRMAR]`)*

**Animação:**
- Contagem de 0 até o valor, `duration: 1.6`, `ease: power2.out`, disparo em `start: 'top 70%'`, `once: true`
- Numerais em **Newsreader**, `clamp(56px, 8vw, 120px)`, cor `--c-ink-dark`
- Rótulos abaixo em Galano Medium 12px, tracking `0.18em`, `--c-brass-lo`
- `stagger: 0.15` entre as quatro colunas
- Usar `Intl.NumberFormat('pt-BR')` na contagem — separador de milhar correto

> **Nota de conformidade:** nenhum destes números se refere a resultado obtido em processo. São dados institucionais, permitidos. **Não adicionar** "% de êxito", "causas ganhas" ou "valores recuperados" em nenhuma circunstância (Art. 4, §2).

**Mobile:** grid 2×2 em vez de 1×4.

---

### 6.6 · Linguagem (telas 10–11) — **o clímax**

Volta para `--c-petrol`. Esta seção **substitui a parede de depoimentos da referência** e é a peça mais autoral do site — a que nenhum concorrente vai ter.

**Copy:**
- Rótulo: `LINGUAGEM`
- Display: `CONTRATO / QUE O CLIENTE / NÃO ENTENDE / É RISCO — / NÃO É PROTEÇÃO`

**A interação — "tradução ao vivo":**

Abaixo do título, um parágrafo de contrato em juridiquês pesado. Conforme o usuário rola, **as expressões rebuscadas são substituídas pelas equivalentes em português claro**, uma por vez.

```
Antes:  "O outorgante obriga-se, sob pena de multa cominatória,
         a promover a entrega do bem no prazo avençado, ressalvadas
         as hipóteses de caso fortuito ou força maior."

Depois: "Quem vende tem que entregar no prazo combinado. Se atrasar,
         paga multa — a não ser que aconteça algo fora do seu controle."
```

**Especificação técnica:**
- Cada expressão é um `<span data-plain="...">` inline
- ScrollTrigger com `scrub: 1`, pinado por 150vh
- A cada ~18% de progresso, uma troca dispara:
  1. Um risco em latão varre o termo antigo (`scaleX: 0→1`, `0.35s`, `ease: power2.inOut`)
  2. O termo antigo faz `opacity` → 0 + `blur(3px)`, `0.25s`
  3. O termo novo entra com máscara de baixo, `yPercent: 100 → 0`, `0.45s`, `ease: expo.out`
  4. Sublinhado latão de 1px pisca sob o termo novo e some em `0.6s`
- Reversível: rolar para cima desfaz as trocas (é o comportamento natural do `scrub`)

**Por que isso funciona:** é uma demonstração da tese do escritório, não uma afirmação sobre ele. Não elogia o escritório (Art. 3, IV), não menciona resultado (Art. 4, §2), não usa caso concreto (Art. 6). É informativo e educativo — exatamente o que a OAB incentiva. E é uma interação que ninguém copia de template.

**Mobile:** pin desligado. As trocas disparam por `IntersectionObserver` conforme cada parágrafo entra na tela, com `duration` fixa, sem scrub. Máximo 3 trocas em vez de 5, para não alongar demais.

---

### 6.7 · Equipe (tela 12)

Fundo `--c-abyss`.

- Rótulo: `EQUIPE`
- H2: `QUEM ASSINA`
- Grid de retratos. Desktop: 3 colunas. Cada card mostra **nome, cargo e número OAB**.

**Animação:**
- Cards revelam com `clipPath: inset(0 0 100% 0)` → `inset(0 0 0% 0)`, `stagger: 0.09`, `duration: 0.85`, `ease: expo.out`, `once: true`
- **Hover:** a imagem passa de dessaturada (`filter: saturate(0.35)`) para `saturate(0.8)` em `0.5s ease: power2.out`, e escala `1 → 1.03`. O nome ganha um sublinhado latão que cresce da esquerda.
- Cursor entra no estado `link` com rótulo "VER PERFIL"

**Mobile:** 1 coluna, `stagger: 0.06`. Sem hover — o estado dessaturado vira o estado padrão (`saturate(0.7)`), já que não existe hover em toque.

---

### 6.8 · Publicações (tela 13)

Fundo `--c-petrol`.

- Rótulo: `PUBLICAÇÕES`
- H2: `O QUE ESTAMOS ESCREVENDO`
- Lista dos **3 artigos mais recentes**: data · título · área · autor
- Link: `TODAS AS PUBLICAÇÕES →`

**Animação:**
- Lista em linhas separadas por filete de 1px
- **Hover:** a linha inteira expande a altura em `+16px`, o título desliza `x: 12px`, e uma **miniatura do artigo aparece seguindo o cursor** (`120×160px`, `opacity` 0→1 + `scale` 0.9→1, `0.4s`, `ease: power3.out`), com leve rotação seguindo a velocidade do mouse (máximo 6°)
- A miniatura é a interação de hover mais rica do site — concentrada aqui de propósito

**Mobile:** sem miniatura no hover. Lista simples com data, título e área empilhados.

---

### 6.9 · Contato + Rodapé (tela 14)

Fundo `--c-bone`. O site termina na luz — o percurso vai do escuro (problema) ao claro (resolução).

**Copy:**
- Display: `VAMOS / CONVERSAR`
- Parágrafo: `Descreva sua situação. Respondemos em até um dia útil.`
- Formulário: Nome · E-mail · Telefone · Empresa (opcional) · Mensagem · **checkbox LGPD**
- Botão: `ENVIAR` (não "Solicitar orçamento" — honorários não podem ser mencionados)

**Bloco institucional:**
```
I&D Legal Sociedade de Advogados
[Endereço]  ·  [CEP, Cidade – UF]
[Telefone]  ·  [E-mail]
OAB/[UF] nº [número]
```

**Animação:**
- Display `VAMOS / CONVERSAR` revela palavra a palavra
- Inputs: linha de base de 1px que cresce em latão no `focus` (`scaleX: 0→1`, `0.4s`, `ease: power2.out`), label sobe e diminui
- Botão **magnético**: segue o cursor até 8px de deslocamento dentro de um raio de 80px, com `gsap.quickTo`, `duration: 0.4`, `ease: power3.out`. Volta ao centro com `elastic.out(1, 0.5)` ao sair.
- Estado de envio: o texto do botão troca por um filete que corre da esquerda à direita; ao sucesso, vira `MENSAGEM ENVIADA ✓` em latão

**Mobile:** botão magnético desligado (não existe cursor). Substituído por um `active` state com `scale: 0.97`.

---

## 7. Sistema de movimento

### 7.1 Vocabulário de revelação — quatro gestos nomeados

O erro clássico de site gerado por IA é aplicar **o mesmo `fade-in-up` em tudo**. Aqui existem exatamente **quatro** revelações, e cada uma tem um tipo de conteúdo atribuído. Nada de improviso no build.

| Nome | O que faz | Onde é usado |
|---|---|---|
| **`reveal-mask`** | Palavra/linha dentro de `overflow:hidden`, `yPercent: 110 → 0`. `duration: 0.95`, `ease: expo.out`, `stagger: 0.075` | **Exclusivo dos títulos display.** É a assinatura do site |
| **`reveal-rise`** | `y: 30 → 0` + `opacity: 0 → 1`. `duration: 0.8`, `ease: power3.out`, `stagger: 0.1` | Parágrafos, itens de lista, cards do método |
| **`reveal-wipe`** | `clipPath: inset(0 0 100% 0)` → `inset(0 0 0% 0)`. `duration: 0.85`, `ease: expo.out` | Imagens, retratos, blocos de mídia |
| **`reveal-rule`** | `scaleX: 0 → 1`, `transform-origin: left`. `duration: 0.6`, `ease: power2.inOut` | Filetes, sublinhados, barras de progresso |

**Regras globais:**
- Disparo padrão: `start: 'top 78%'`, `once: true`. **Nada re-anima ao subir** — reanimação constante irrita.
- Exceção: elementos com `scrub` (parallax, pin, a seção Linguagem) são contínuos por natureza.
- `stagger` nunca passa de `0.12` — acima disso a página parece lenta.

### 7.2 Easing e duração

```js
// Curvas — nomeadas por intenção
const EASE = {
  entrada:  'expo.out',            // algo chega e assenta — o gesto dominante
  saida:    'power2.in',           // algo sai de cena
  suave:    'power3.out',          // transições de estado, hover
  cortina:  'expo.inOut',          // painéis de menu e de página
  elastico: 'elastic.out(1, 0.5)', // apenas o retorno do botão magnético
};
```

| Tipo | Duração |
|---|---|
| Micro (hover, focus) | **0,25 – 0,4s** |
| Revelação de conteúdo | **0,7 – 0,95s** |
| Cortina / transição de página | **0,9 – 1,2s** |
| Parallax e scrub | contínuo, `scrub: 0.6 – 1` |

> **Nada "snapa".** Toda mudança de estado passa por uma curva. Botão que troca de cor instantaneamente é um dos tells de site gerado por IA (seção 16).

### 7.3 Cursor customizado

Adaptado da referência, com estados próprios.

```
.cursor       → círculo de 32px, border: 1px solid var(--c-brass), mix-blend-mode: difference
.cursor__dot  → ponto de 5px, background: var(--c-brass), segue com atraso maior
```

**Estados:**

| Estado | Comportamento |
|---|---|
| `default` | Círculo 32px + ponto central. Segue com `gsap.quickTo`, `duration: 0.5`, `ease: power3.out`. O ponto segue com `0.15` — o atraso entre os dois é o que dá vida |
| `link` | Círculo expande para 72px, preenche com `--c-brass` a 15%, e pode exibir um rótulo (`VER PERFIL`, `LER`) |
| `text` | Círculo colapsa em uma barra vertical de 2×24px sobre áreas de texto selecionável |
| `drag` | Círculo vira 88px com setas `← →`, preenchido em `--c-brass`. Herdado da referência, usado na galeria da equipe em tablet |
| `hidden` | Sobre inputs de formulário e iframes (mapa), o cursor nativo volta |

**Regras:**
- Só ativa em ponteiro fino: `@media (hover: hover) and (pointer: fine)`
- `pointer-events: none` sempre, `z-index: 10000`
- Nunca esconder o cursor nativo em elementos de formulário — prejudica usabilidade real
- Desligado sob `prefers-reduced-motion`

### 7.4 Menu e transições de página

**Menu — a cortina que converge:**

Enquanto a referência varre um painel amarelo da direita para a esquerda, aqui **dois painéis se encontram no centro** — o gesto conceitual do acordo.

| t | Evento |
|---|---|
| 0,00s | Painel superior desce de `yPercent: -100 → 0`; painel inferior sobe de `100 → 0`. Cor `--c-brass`. `duration: 0.9`, `ease: expo.inOut` |
| 0,45s | Ao se encontrarem, um filete `--c-abyss` de 1px pulsa na linha de encontro |
| 0,55s | Itens do menu revelam com `reveal-mask`, `stagger: 0.07`, em Galano Bold `clamp(36px, 7vw, 92px)`, cor `--c-abyss` |
| 0,70s | Bloco secundário (endereço, redes, OAB) entra com `reveal-rise` |

Fechar: sequência inversa, `duration: 0.7`. Botão MENU vira um `×` desenhado em SVG com dois traços que rotacionam `0.35s ease: power2.inOut`.

**Hover nos itens do menu:** o item ativo fica em `--c-abyss` cheio; os demais caem para `opacity: 0.45`. O item sob o cursor ganha um sublinhado latão escuro que cresce da esquerda. Efeito "spotlight" — o menu inteiro reage a um item.

**Transição entre páginas:**
- Saída: os dois painéis `--c-brass` convergem (0,55s, `expo.in`)
- Troca de rota acontece com a tela coberta
- Entrada: painéis se separam (0,75s, `expo.out`), conteúdo novo já em posição
- Scroll volta ao topo **antes** da revelação, nunca durante
- Implementação: View Transitions API onde suportado, com fallback GSAP

### 7.5 Comportamentos transversais

- **Header:** esconde ao rolar para baixo (`y: -100%`, `0.4s`), reaparece ao rolar para cima. Fundo ganha `backdrop-filter: blur(12px)` + `--c-petrol` a 80% após 100vh.
- **Links de texto:** sublinhado de 1px que, no hover, **sai pela direita e entra pela esquerda** (dois `scaleX` encadeados com `transform-origin` oposto, `0.45s`, `ease: power2.inOut`). Nunca `text-decoration` padrão.
- **Botão primário:** preenchimento latão que sobe de baixo (`scaleY: 0 → 1`, origem `bottom`, `0.45s`, `ease: power3.out`), texto inverte para `--c-abyss` no mesmo tempo.
- **Imagens:** todas entram com `reveal-wipe` + um `scale: 1.08 → 1` interno de `1.2s` que continua durante a revelação — dá sensação de câmera assentando.

---

## 8. WebGL — onde o 3D se justifica

### 8.1 O princípio

Three.js num site de advocacia é uma faca de dois gumes. Partícula flutuante, esfera com distorção, "blob" gradiente — tudo isso é **exatamente** o vocabulário de site gerado por IA, e num escritório de advocacia destrói a credibilidade que a tipografia construiu.

**Regra deste projeto: existe UMA cena WebGL no site inteiro, ela ocupa apenas o herói, e ela representa uma coisa concreta do ofício.**

### 8.2 A cena: **"O Documento"**

Um plano que se comporta como uma folha de papel pesado.

**Especificação:**

```
Geometria    PlaneGeometry(viewportW * 1.4, viewportH * 1.4, 96, 96)
Câmera       PerspectiveCamera, fov 32, posicionada em z = 3.2, olhando levemente de cima
Luz          Direcional virtual computada no shader (sem luzes reais — é tudo fragment)
Render       WebGLRenderer, antialias: false, alpha: false, powerPreference: 'high-performance'
DPR          Math.min(devicePixelRatio, 1.5)
```

**Vertex shader:** desloca o eixo Z por três oitavas de ruído simplex 3D, em escalas `1.0`, `2.3` e `4.7`, com amplitudes `1.0`, `0.4` e `0.15`. Um `uTime` lento (`0.12` de multiplicador) faz a superfície respirar.

**A ideia central — `uSettle`:** um uniform de `0.0` a `1.0` que multiplica a amplitude total, **atrelado ao progresso do scroll no herói via ScrollTrigger `scrub`**.

- Scroll em 0% → `uSettle = 1.0` → a superfície ondula, inquieta
- Scroll em 100% do herói → `uSettle = 0.12` → a superfície está quase plana

> **A leitura:** o documento começa agitado e **se assenta** conforme você desce. O ruído vira acordo. É a tese do escritório, executada em movimento.

**Fragment shader:**
- Cor base `--c-petrol` (`#0E1F1C`)
- Rim light em `--c-brass` (`#C08A3E`), calculado por `dot(normal, lightDir)` com `pow(..., 3.0)` — só as cristas do relevo pegam o brilho de latão
- Fresnel sutil nas bordas para dar espessura
- Grão procedural adicionado no fragment (evita uma textura extra)

**Interação do cursor:** um `uMouse` cria um deslocamento local gaussiano de raio 0.25 e amplitude 0.3, com `lerp` de `0.06` por frame. Passar o mouse é como encostar o dedo no papel. Sutil — se ficar óbvio demais, vira brinquedo.

### 8.3 Orçamento de performance

| Métrica | Limite |
|---|---|
| Peso do Three.js | **≤ 60 KB gzip** — importar apenas os módulos usados (`WebGLRenderer`, `Scene`, `PerspectiveCamera`, `PlaneGeometry`, `ShaderMaterial`, `Mesh`), nunca o bundle completo |
| Draw calls | **1** |
| Triângulos | ~18.400 |
| Frame budget | ≤ 4ms em GPU integrada |

**Regras de ciclo de vida:**
- Carregado com **`import()` dinâmico**, depois do `load`, nunca bloqueando o LCP
- `IntersectionObserver` pausa o `requestAnimationFrame` quando o herói sai da tela — **obrigatório**, senão o site consome GPU o percurso inteiro
- `document.hidden` → pausa
- Se `WebGLRenderingContext` não existir ou o contexto for perdido → fallback estático, sem erro visível

### 8.4 Fallbacks — obrigatórios

| Condição | Comportamento |
|---|---|
| `prefers-reduced-motion: reduce` | Imagem `.webp` estática de um frame do render, com `uSettle = 0.4`. Zero JS de animação |
| Viewport < 768px | **Sem WebGL.** Mesma imagem estática. Economiza bateria e evita jank na barra de URL móvel |
| `navigator.hardwareConcurrency <= 4` | Sem WebGL. Imagem estática |
| `navigator.connection.saveData === true` | Sem WebGL |
| Sem suporte a WebGL | Imagem estática |

A imagem de fallback (`hero-fallback.webp`, ~1920×1080, qualidade 72, alvo ≤ 90 KB) é gerada **exportando um frame do próprio shader** — assim o fallback é visualmente idêntico, não uma aproximação.

### 8.5 Ideias de 3D consideradas e **rejeitadas**

Registrado aqui para que ninguém as reintroduza no build:

| Ideia | Por que foi rejeitada |
|---|---|
| Partículas flutuantes / campo de estrelas | O clichê nº 1 de site gerado por IA. Sem relação alguma com advocacia |
| Balança da justiça em 3D girando | Literal, brega, e derruba o site de "premium" para "clip-art" |
| Ampersand `I&D` extrudado em 3D com material metálico | Tentador, mas vira logo de empresa de tecnologia dos anos 2000. O `&` funciona melhor **chapado e gigante** (seção 4.4) |
| Livros/documentos empilhados em 3D | Custo de modelagem alto, retorno baixo, e risco enorme de parecer render de banco de imagens |
| Distorção de imagem WebGL nos retratos da equipe | Distorcer o rosto de um advogado é o oposto de transmitir seriedade |

---

## 9. Copy — tom de voz e textos reais

### 9.1 Como a I&D Legal escreve

| Faz | Não faz |
|---|---|
| Frases curtas. Ponto final. | Períodos de quatro linhas com três subordinadas |
| Fala do problema do cliente | Fala das qualidades do escritório |
| Verbos concretos: escrever, revisar, negociar, defender | Verbos vagos: atuar, promover, viabilizar, potencializar |
| Português comum, mesmo em assunto técnico | Juridiquês como demonstração de erudição |
| Primeira pessoa do plural ("trabalhamos", "escrevemos") | Terceira pessoa institucional ("o escritório oferece") |
| Afirmações verificáveis | Superlativos e comparações (também vedados pela OAB) |

### 9.2 Vocabulário banido

Estas expressões são o esperanto morto dos sites de advocacia brasileiros. **Nenhuma delas entra no site:**

> excelência · soluções jurídicas sob medida · parceria de confiança · equipe altamente qualificada · atendimento personalizado · comprometimento com resultados · tradição e modernidade · seus direitos em boas mãos · referência no mercado · advocacia de resultados · sinergia · expertise multidisciplinar · atuação de ponta · profissionais renomados · seriedade e ética *(dizer que é ético é como dizer que é honesto)*

E os clichês de site gerado por IA em português:

> Bem-vindo ao nosso site · Transformando o futuro do direito · Sua jornada jurídica começa aqui · Muito mais que um escritório · Onde tradição encontra inovação

### 9.3 Textos prontos (usar como está)

**Herói**
```
Rótulo:  I&D LEGAL — ADVOCACIA CÍVEL E CONTRATUAL
H1:      CADA CLÁUSULA TEM UMA CONSEQUÊNCIA
```

**Manifesto**
```
Rótulo:  O ESCRITÓRIO
Display: UM CONTRATO BEM ESCRITO EVITA ANOS DE PROCESSO
Texto:   A I&D Legal atua em direito cível e contratual. Trabalhamos no
         texto antes que ele vire disputa — e no tribunal quando já virou.
         Em qualquer um dos dois momentos, o método é o mesmo: entender o
         negócio primeiro, escrever depois.
CTA:     CONHEÇA O ESCRITÓRIO →
```

**Atuação — descrições curtas**
```
CONTRATOS EMPRESARIAIS
Redigimos, revisamos e negociamos os contratos que sustentam a operação.
De acordos de fornecimento a estruturas societárias.

CONTENCIOSO CÍVEL
Quando a negociação não resolve, a disputa precisa de estratégia definida
antes da primeira petição.

RESPONSABILIDADE CIVIL
Defesa e postulação em danos materiais, morais e à imagem — com leitura
técnica do risco antes de qualquer movimento.

DIREITO IMOBILIÁRIO
Compra e venda, locação, incorporação e regularização. O imóvel é o ativo;
o contrato é o que o protege.
```

**Linguagem (clímax)**
```
Rótulo:  LINGUAGEM
Display: CONTRATO QUE O CLIENTE NÃO ENTENDE É RISCO — NÃO É PROTEÇÃO
Texto:   Escrever difícil é fácil. O trabalho está em escrever um documento
         que resista a um tribunal e ainda assim possa ser lido pela pessoa
         que vai assiná-lo.
```

**Contato**
```
Display: VAMOS CONVERSAR
Texto:   Descreva sua situação. Respondemos em até um dia útil.
Botão:   ENVIAR
LGPD:    Autorizo o contato e o tratamento dos meus dados para essa
         finalidade, nos termos da Política de Privacidade.
```

**Microcopy**
```
Erro de campo:      Preencha este campo.
E-mail inválido:    Confira o e-mail digitado.
Enviando:           Enviando…
Sucesso:            Mensagem enviada. Retornamos em até um dia útil.
Erro de envio:      Não foi possível enviar. Tente novamente ou escreva
                    para [e-mail].
404 título:         PÁGINA NÃO ENCONTRADA
404 texto:          O endereço que você acessou não existe mais.
404 CTA:            VOLTAR AO INÍCIO →
```

---

## 10. Stack técnica

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Astro 5** | Zero JS por padrão. Ilhas para o WebGL e o menu. Um site institucional com blog não precisa carregar um framework inteiro no cliente — e a nota de performance é o que separa awwwards de "site bonito e lento" |
| Animação | **GSAP 3** + ScrollTrigger | Mesma base da referência. ScrollTrigger é insubstituível para pin e scrub |
| Smooth scroll | **Lenis** | Integração nativa com ScrollTrigger via `scrollerProxy`. Preserva navegação por teclado e `scroll-behavior` |
| 3D | **Three.js** (imports seletivos) | Apenas o herói, carga dinâmica |
| Split text | **SplitType** (3 KB) ou split manual | GSAP SplitText é pago; SplitType resolve. Importante: re-split no `resize` |
| Conteúdo | **Markdown/MDX** via Content Collections | Publicações versionadas em git, sem custo de CMS |
| Formulário | Astro Actions + **Resend** | Ou Formspree se o cliente preferir zero backend |
| Hospedagem | **Vercel** | Edge, previews por branch, analytics |
| Fontes | Self-hosted `.woff2` | Nunca Google Fonts CDN (LGPD: transfere IP do visitante para os EUA) |

**Alternativa:** se o escritório exigir edição por pessoa não técnica, trocar Content Collections por **Sanity** ou **Payload**, mantendo Astro. Recomendo começar com Markdown — advogado que escreve artigo manda `.docx`, e a conversão é trivial. **`[CONFIRMAR]`**

**Estrutura de pastas sugerida:**

```
src/
  components/
    hero/          Hero.astro, HeroCanvas.ts, shaders/{vertex,fragment}.glsl
    ui/            Cursor.ts, MagneticButton.ts, SplitReveal.ts
    sections/      Manifesto, Atuacao, Metodo, Numeros, Linguagem, Equipe
  layouts/
  content/
    publicacoes/   *.md
    equipe/        *.md
    atuacao/       *.md
  lib/
    motion.ts      EASE, DURATION, e os 4 reveals nomeados
    lenis.ts
  styles/
    tokens.css     todas as variáveis das seções 4.1–4.3
public/
  fonts/  img/  noise.png
```

> `src/lib/motion.ts` centraliza os quatro reveals nomeados. **Nenhum componente escreve `gsap.to` com valores literais** — todos importam de lá. É o que impede o site de virar uma colcha de retalhos de durações aleatórias durante o build.

---

## 11. Performance

**Metas (Core Web Vitals, 4G móvel, dispositivo mediano):**

| Métrica | Alvo |
|---|---|
| LCP | **< 2,0s** |
| CLS | **< 0,05** |
| INP | **< 200ms** |
| JS total (home, gzip) | **< 250 KB** |
| Lighthouse Performance | **≥ 92** móvel |

**Como chegar lá:**

1. **O herói renderiza sem JS.** Título e rótulo são HTML/CSS puro; o WebGL entra depois. Assim o LCP é o texto, não o canvas.
2. **Fontes:** `preload` apenas de Galano Bold (o peso do display, que é o LCP). `font-display: swap`. Regular e Medium carregam normalmente.
3. **Imagens:** AVIF com fallback WebP, via `<Image>` do Astro. `loading="lazy"` em tudo abaixo da dobra, `fetchpriority="high"` na primeira imagem visível. `width`/`height` sempre declarados (CLS).
4. **Retratos da equipe:** máximo 1200px de lado maior, qualidade 72. Um retrato acima de 200 KB não passa.
5. **GSAP:** importar apenas `gsap` e `ScrollTrigger`. Sem o bundle `all`.
6. **Three.js:** `import()` dinâmico, após `window.load`.
7. **`will-change`:** apenas em elementos animando *no momento*, removido no `onComplete`. `will-change` permanente estoura memória de GPU.
8. **Animar exclusivamente `transform` e `opacity`.** Nunca `top`, `left`, `width`, `height` ou `filter` em `scrub`.
9. `ScrollTrigger.batch()` para listas longas em vez de um trigger por item.
10. `ScrollTrigger.refresh()` no `resize` com debounce de 200ms — e re-split dos textos junto.

---

## 12. Acessibilidade e movimento reduzido

Meta: **WCAG 2.1 AA**. Um site de advocacia que exclui usuários é uma contradição em si.

**`prefers-reduced-motion: reduce` — comportamento completo:**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

| Recurso | Sob reduced-motion |
|---|---|
| Loader | Não existe. Conteúdo direto |
| Lenis smooth scroll | **Desligado** — scroll nativo |
| Todos os reveals | Viram `opacity: 0 → 1` em 0,2s, sem deslocamento |
| Parallax e scrub | Desligados. Elementos em posição final |
| Pin da seção Atuação | Desligado. Vira pilha vertical |
| Seção Linguagem | Mostra o texto **já traduzido**, com o original em `<details>` |
| WebGL | Imagem estática |
| Cursor customizado | Desligado, cursor nativo |
| Botão magnético | Desligado |
| Contagem de números | Valor final direto |

**Checklist de acessibilidade:**
- Estrutura de headings `h1` → `h2` → `h3` sem pular níveis
- Contraste conforme a tabela em 4.1 — atenção especial à regra do latão em fundo claro
- **Foco visível sempre:** `outline: 2px solid var(--c-focus); outline-offset: 3px`. Nunca `outline: none` sem substituto
- Navegação por teclado completa: menu abre com `Enter`, fecha com `Esc`, **foco preso dentro da cortina** enquanto aberta, e devolvido ao botão MENU ao fechar
- Skip link "Pular para o conteúdo" como primeiro elemento focável
- `aria-label` em todos os links de ícone; `aria-expanded` no botão do menu
- Texto animado por SplitType precisa de `aria-label` no elemento pai com a frase completa — leitores de tela não devem ler letra a letra
- Vídeo, se houver: legendas e sem autoplay com som
- Formulário: `<label>` real associado a cada input, erros anunciados via `aria-live="polite"`
- Zoom até 200% sem quebra de layout ou perda de conteúdo
- `lang="pt-BR"` no `<html>`

---

## 13. Responsivo

**Breakpoints:**
```css
--bp-sm:  480px;
--bp-md:  768px;    /* corte do WebGL e dos pins */
--bp-lg:  1024px;
--bp-xl:  1440px;
--bp-2xl: 1680px;   /* max-width do conteúdo */
```

**Resumo do comportamento móvel de cada animação** (detalhado em cada seção de 6.x):

| Recurso | < 768px |
|---|---|
| Cena WebGL do herói | **Desligada** → `.webp` estático |
| Cursor customizado | Desligado (`hover: none`) |
| Botão magnético | Desligado → `active` com `scale: 0.97` |
| Pin da seção Atuação | Desligado → pilha vertical |
| Pin da seção Linguagem | Desligado → trocas por `IntersectionObserver`, máximo 3 |
| Parallax do ampersand | Reduzido a 40% da amplitude |
| Miniatura no hover das publicações | Removida |
| Hover dos retratos | Vira estado padrão `saturate(0.7)` |
| `stagger` geral | Reduzido em ~30% |
| Display do herói | `clamp(44px, 13vw, 68px)`, 3 linhas |
| Menu | Cortina mantida (é barata), itens em `clamp(30px, 9vw, 48px)` |

**Cuidados específicos de mobile:**
- Usar **`100dvh`**, não `100vh` — a barra de URL do Safari/Chrome móvel quebra `100vh`
- Alvos de toque mínimos de **44×44px**
- Testar o `pin` em iOS Safari é obrigatório: é onde ScrollTrigger mais falha. Por isso todos os pins estão desligados em mobile.
- Teste real em iPhone SE (tela pequena) e em um Android de entrada — não só no DevTools

---

## 14. LGPD e formulários

O site coleta dados pessoais no formulário. Requisitos legais (Lei 13.709/2018), não opcionais:

1. **Checkbox de consentimento não pré-marcado**, com o texto da seção 9.3.
2. **Política de Privacidade** acessível do rodapé e linkada no formulário, contendo: controlador (razão social e CNPJ), finalidade do tratamento, base legal, prazo de retenção, direitos do titular (Art. 18) e canal do encarregado/DPO.
3. **Banner de cookies opt-in** — nada de analytics antes do aceite. Botões: `Aceitar` / `Recusar` / `Preferências`, com **Recusar tão visível quanto Aceitar** (banner que esconde o "recusar" é irregular).
4. **Fontes self-hosted** — usar Google Fonts via CDN envia o IP do visitante para servidores nos EUA sem base legal. Já resolvido na seção 10.
5. **Analytics:** preferir **Vercel Analytics** ou **Plausible** (sem cookies, dados na UE) a Google Analytics. Reduz a superfície de conformidade a quase zero.
6. **Anti-spam sem CAPTCHA de terceiros:** honeypot + verificação de tempo de preenchimento. reCAPTCHA envia dados a mais um terceiro.
7. **Retenção:** definir prazo para as mensagens do formulário (sugestão: 24 meses) e registrar na política. **`[CONFIRMAR]`**

---

## 15. SEO

- **Title/description por página**, escritos à mão. Nada gerado por template.
- `Schema.org` **`LegalService`** no JSON-LD da home, com `name`, `address`, `telephone`, `areaServed`, `founder`, `sameAs`. `Article` nas publicações, `Person` nos perfis da equipe.
- URLs limpas em português: `/atuacao/contratos-empresariais`, não `/practice-areas/1`.
- **As publicações são o motor de SEO** — e são o único recurso de conteúdo que a OAB explicitamente incentiva. Meta: 1–2 artigos por mês, respondendo dúvidas reais de cliente ("o que é cláusula de não concorrência", "o que verificar antes de assinar um contrato de locação comercial").
- Open Graph com imagem 1200×630 desenhada — tipografia sobre `--c-petrol` com o ampersand, não uma foto genérica.
- `sitemap.xml` e `robots.txt` gerados pelo Astro.
- Google Business Profile para busca local — decisivo para "advogado [cidade]".
- Sem texto oculto, sem keyword stuffing: além de ineficaz, é sensacionalismo aos olhos da OAB.

---

## 16. Checklist anti-slop

Pesquisei os padrões que hoje denunciam um site gerado por IA. Abaixo, cada tell e a decisão deste projeto que o neutraliza. **Esta é a lista de verificação final antes de entregar.**

| Tell de site gerado por IA | Decisão deste projeto |
|---|---|
| Fonte **Inter** ou `system-ui` como voz da marca | **Galano Grotesque**, licenciada, com papel definido para cada peso |
| **Gradiente roxo→azul** em herói, botões e fundos | Zero gradientes de cor. Existe **um** gradiente no site: a vinheta radial do herói, monocromática |
| Cards com **`border-radius: 16px` em tudo** | Regra binária: `0` em tudo, `999px` só em botão primário e cursor (4.7) |
| **Grid de 4 cards** iguais para "features" | Grid editorial assimétrico, com spans variáveis; a seção Atuação é um índice pinado, não cards |
| **Padding idêntico** em todas as seções | Ritmo variável definido em 4.3 — seções de manifesto respiram, seções funcionais são compactas |
| Mesmo **`fade-in-up` em todo elemento** | Quatro reveals nomeados, cada um atribuído a um tipo de conteúdo (7.1) |
| **Hover que não faz nada** | Todo elemento interativo tem hover especificado nas seções 6.x e 7.5 |
| Botões que **"snapam"** entre estados | Toda mudança de estado tem curva e duração (7.2) |
| Ícones de **biblioteca genérica** | Sem biblioteca. SVG desenhado + numerais de índice (4.7) |
| **Stock de "equipe diversa sorrindo ao redor de um notebook"** | Direção fotográfica proibindo explicitamente (4.6) |
| **Ilustrações geradas por IA**, plásticas e simétricas | Proibidas (4.6) |
| Copy vaga: *"Construindo o futuro"*, *"soluções completas"* | Vocabulário banido em 9.2; copy real escrito em 9.3 |
| **Superlativos** genéricos: "de ponta", "líder" | Banidos por escolha editorial **e** pelo Art. 3, IV da OAB (3.1) |
| Herói gigante com mensagem vaga | Herói com uma afirmação específica sobre contratos |
| Seções na ordem previsível Hero→Features→Testimonials→CTA | Ordem própria, com a seção **Linguagem** ocupando o lugar dos depoimentos (6.6) |
| **Partículas / blob 3D** decorativo | Rejeitados explicitamente em 8.5. O único WebGL tem função semântica |
| Tokens de cor **decorativos** (`--purple-500`) | Tokens semânticos (`--c-action`, `--c-rule`, `--c-surface`) em 4.1 |
| Espaçamento em escala uniforme e previsível | Escala com passos deliberadamente irregulares (4.3) |

**A pergunta-teste, aplicada em cada tela antes da entrega:**
> *Se eu trocar o logo e o texto por outro escritório, o site ainda funciona igual?*

Se a resposta for sim, aquela tela ainda não está pronta.

---

## 17. Pendências — o que preciso do cliente

Nada aqui bloqueia o começo do build. Mas tudo precisa estar resolvido antes do lançamento.

**Bloqueia o lançamento:**

| # | Item | Por quê |
|---|---|---|
| 1 | **Licença Webfont da Galano Grotesque** | Os `.otf` da pasta são licença desktop. Uso em `@font-face` exige licença web (4.2) |
| 2 | **Logo em vetor** (`.svg` ou `.ai`) | Sem ele não há header, favicon, OG image nem marca d'água |
| 3 | **Número de inscrição na OAB** e razão social completa | Obrigatório no rodapé (3.3) |
| 4 | **Endereço, telefone e e-mail** | Rodapé, contato e `LegalService` no JSON-LD |
| 5 | **Ensaio fotográfico** — retratos da equipe + ambiente | O site não deve ir ao ar com stock (4.6) |
| 6 | **Política de Privacidade** revisada pelo próprio escritório | Ironicamente, o cliente é quem tem competência técnica para isso |

**Define conteúdo (posso começar com placeholder):**

| # | Item |
|---|---|
| 7 | **Significado de "I&D"** — muda o conceito do monograma (4.4) |
| 8 | **Lista final das áreas de atuação** — assumi 4 (seção 5) |
| 9 | **Números institucionais reais** — anos, tamanho da equipe, publicações (6.5) |
| 10 | **Nomes, cargos, formação e OAB de cada advogado** |
| 11 | **2–3 artigos** para o lançamento das publicações |
| 12 | **Setores atendidos** — a lista em texto que substitui os logos de clientes (3.3) |
| 13 | Redes sociais ativas (LinkedIn? Instagram?) |
| 14 | Prazo de retenção dos dados do formulário (14.7) |
| 15 | Quem edita o conteúdo depois? Define Markdown vs. CMS (seção 10) |

---

## 18. Roadmap de construção

| Fase | Escopo | Entregável |
|---|---|---|
| **1 · Fundação** | Setup Astro, conversão das fontes para `.woff2`, `tokens.css`, grid, `motion.ts` com os 4 reveals, Lenis + ScrollTrigger, cursor | Storybook de tokens: tipografia, cores, os 4 reveals isolados |
| **2 · Home estática** | Todas as seções em HTML/CSS, **sem animação**, com copy real | Home completa e legível — precisa ficar boa parada. Se não ficar, animação não salva |
| **3 · Movimento** | Aplicação dos reveals, pins, parallax, transições de fundo, menu | Home animada, sem WebGL |
| **4 · WebGL** | Shader do herói, `uSettle`, cursor, fallbacks, export do frame estático | Herói completo + imagem de fallback |
| **5 · Páginas internas** | Escritório, Atuação (×4), Equipe, Publicações, Contato, 404 | Site navegável, transições de página |
| **6 · Conformidade** | Formulário + LGPD, banner de cookies, política, JSON-LD, sitemap, OG images | Site legalmente pronto |
| **7 · Polimento** | Auditoria de acessibilidade, Lighthouse, teste em iOS/Android reais, **checklist anti-slop da seção 16** | Aprovação para lançamento |

**Marco de qualidade da Fase 2:** a home sem nenhuma animação precisa já parecer um site caro. Animação é amplificador, não maquiagem. Se a Fase 2 não convencer, o problema é de tipografia e espaçamento — e nenhuma quantidade de GSAP conserta isso.

---

## Fontes consultadas

- [Provimento nº 205/2021 — Conselho Federal da OAB](https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021)
- [Provimento nº 205/2021 (PDF) — OAB/SP](https://www.oabsp.org.br/upload/526840268.pdf)
- [Publicidade na advocacia: saiba o que é permitido — OAB/RS](https://www2.oabrs.org.br/noticia/publicidade-na-advocacia-saiba-que-e-permitido/63959)
- [Marketing jurídico permitido e o Provimento 205/2021 — Jusbrasil](https://www.jusbrasil.com.br/artigos/marketing-juridico-permitido-como-o-provimento-205-2021-da-ordem-dos-advogados-do-brasil-oab-regula-a-publicidade-na-dvocacia/5175073683)
- [Propostas de atualização do Provimento 205/2021 (out/2025) — OAB](https://s.oab.org.br/arquivos/2025/10/b0a81d83-3467-41bf-8eed-083a117267cb.pdf)
- [AI Slop Web Design: Spotting and Fixing Generic Websites — 925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide)
- [7 Common AI Website Mistakes That Are Easy To Avoid — Search Engine Journal](https://www.searchenginejournal.com/7-common-ai-website-mistakes-that-are-easy-to-avoid/574196/)
- [2026 Law Firm Website Design Trends — PaperStreet](https://www.paperstreet.com/blog/2026-law-firm-website-design-trends/)
- [Galano Grotesque — Typewolf](https://www.typewolf.com/galano-grotesque)
- [Galano Grotesque, René Bieder — MyFonts](https://www.myfonts.com/collections/galano-grotesque-font-rene-bieder/)
- Análise técnica ao vivo de [adhoclegal.gr](https://www.adhoclegal.gr/) — DOM, CSS computado, scripts e transições (04/09/2026)
