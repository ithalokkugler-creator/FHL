# FHL Advocacia — contexto do cliente

Este arquivo guarda **o que o cliente quer e por quê**. A parte técnica do site
(como rodar, build, arquitetura, tokens, pendências de lançamento) está no
[`README.md`](README.md) — não duplicar aqui.

Fonte: primeira reunião com o cliente, 11/09/2026, 47 min, Google Meet.
Transcrição e 168 frames em `../Advocacia contexto/`. Marcações `[MM:SS]`
referenciam o minuto do vídeo.

---

## 1. Quem é quem

**Cliente — FHL Advocacia — Fonseca Hespanha Lisboa.**
Rua Dr. Leocádio, 282 — Centro, Paranaguá/PR · (41) 2152-2607 ·
WhatsApp 55 41 2152-2607 · Seg–sex, 9h–18h.
FHL = iniciais dos sobrenomes dos sócios: **F**onseca, **H**espanha, **L**isboa.

| Advogado | OAB/PR | Áreas |
|---|---|---|
| Guilherme de Oliveira da Fonseca | 116.072 | Cível, Consumidor, Imobiliário, Contratual, Assessoria Preventiva |
| Juliana Cristina da Silva Lisboa | 117.141 | Família, Sucessões, Previdenciário, Consumidor |
| Marlon Albini Hespanha | 131.898 | Trabalhista, Empresarial, Administrativo, Portuário, Assessoria Preventiva |
| **Vinícius Rangel de Lima de Paula Lisboa** | 105.790 | Trabalhista, Criminal, Previdenciário, Regularização Fundiária, Ambiental, Portuário |

**Vinícius é o interlocutor** — advogado-chefe, foi quem apresentou tudo e quem
decide. Juliana é esposa dele. Escritório com 6 anos. Hoje são 4 pessoas; ele já
fala em estagiário e secretária no futuro.

**Fornecedores — Ithalo e Rodrigo** (primos). Ithalo é o organizador da reunião;
Rodrigo é designer e chegou a cursar Direito (trancou). Vinícius conhece o pai
de um deles — a relação é meio profissional, meio pessoal, e ele deixou isso
explícito e confortável [~26:00].

---

## 2. Como o Vinícius pensa — ler antes de propor qualquer coisa

Cinco padrões que se repetem na reunião inteira e que explicam quase todos os
pedidos dele:

1. **Tudo é medido em custo.** "Tudo depende do custo" [12:40]. Ele descartou
   sozinho a integração bancária no Financeiro e a API do Google Places nas
   avaliações — só por causa do preço. Ao propor qualquer coisa, diga o custo
   mensal junto, ou ele mesmo vai perguntar.
2. **Ele quer prova, não automação.** Quase todo módulo existe para se
   **respaldar** depois: ficha de atendimento assinada porque "o cliente tem
   memória seletiva" [01:20]; registro de quem apagou o quê; horas de
   atendimento para mostrar ao cliente quanto trabalho houve. O sistema é um
   arquivo de provas antes de ser uma ferramenta de produtividade.
3. **Ele aceita trabalho manual.** Disse várias vezes que dá para fazer manual
   hoje e automatizar depois — publicações do CNJ, agenda, backup. Não
   superdimensionar.
4. **Ele sabe que não sabe.** Montou o protótipo atual com ChatGPT e chama isso
   de "fiz no serrote e na picareta" [~28:00]. Espera que a gente **refine,
   tire e acrescente** — inclusive discordando dele. Ele pediu isso
   explicitamente.
5. **Prazo não é pressão.** "Você fala: Vinícius, vou levar 4, 5 meses, e não
   tem problema" [~24:00]. O fluxo do escritório hoje é pequeno. A pressa que
   existir vai ser ele que vai sinalizar.

---

## 3. Escopo: duas frentes, uma contratada

### Fase 1 — Site institucional ✅ contratado, em andamento

É o que está neste repositório. **Decisão dele:** "para mim hoje está pesado,
vamos só fazer o site" [~23:00].

### Fase 2 — Sistema interno ⏳ não contratado, a orçar como mensalidade

Ele espera que a gente analise, proponha escopo e **preço mensal**: "vocês vão
tendo essa ideia, vão refinando — ó Vinícius, para fazer isso vai dar X, vai dar
Y" [~23:30]. Nada foi fechado.

**Prioridade nº 1 dentro da fase 2, dita por ele:** o **Financeiro**. "Se pudesse
ter uma área dentro do financeiro… seria mais urgente" [~23:40]. Quer saber
entrada × saída e poder exportar para dividir o faturamento entre os sócios.

### Oportunidade de produto (ele levantou, não nós) [13:00]

O módulo de **Publicações/Intimações via API do CNJ** é uma dor de mercado.
Números que ele deu: ferramentas equivalentes custam **R$ 700–900/mês**, algumas
**R$ 3.000/mês**; ele paga hoje **R$ 220/mês** por uma que faz menos. Propôs
sociedade: FHL como piloto, a gente constrói, e vende para outros escritórios.
**Não prometer nada sobre isso ainda** — mas é a maior alavanca comercial da
relação e vale manter viva.

---

## 4. O sistema interno hoje

Um **único arquivo HTML de 15 MB** feito por ele com ChatGPT, rodando local pelo
`file://`, com todo o estado em `localStorage`.
Arquivo: `../Advocacia contexto/fhl-site-etapa6-1-estabilidade-abas-documentos-clientes.html`

Chaves de estado: `fhlState`, `fhl_site_state_v1`, `fhlCurrentUser*`,
`fhlArchivedProcesses`. Bibliotecas embutidas: JSZip, pako.
Integrações externas já tentadas: **CNJ Comunica** (`comunicaapi.pje.jus.br`),
**BCB/SGS** (índices para juros), Google Maps/Reviews, WhatsApp.

**Estado real durante a demo — tudo quebrado da metade para baixo:**
"Modo local — banco não conectado" · "Failed to fetch" · "Não foi possível
sincronizar tudo" · "Controle de edição simultânea indisponível" · Backup do
Google Drive "aguardando configuração". Ele sabe e não se incomoda: é protótipo.

### Os 14 módulos e o que ele quer de cada um

| Módulo | Existe | O que ele quer de fato |
|---|---|---|
| **Clientes** | pré-cadastro completo, representante legal, endereço, contato para recados, responsável interno, área, status, nº do processo | Cadastro leve que **gere documento pronto para imprimir** logo abaixo. Busca/filtro por nome. |
| **Documentos Automáticos** | procuração, contrato de honorários, declaração de hipossuficiência, **ficha de atendimento**, hipoteca | O mais importante é a **ficha de atendimento**: resume a conversa, o cliente assina, vira prova. Fluxo mínimo aceito: gerar → editar na tela → imprimir. [02:00, 20:00] |
| **Contatos** (`leads`) | lista | Receber aqui quem preencheu o formulário do site. "Para eu saber quem entrou, quem eu posso contatar" [03:00] |
| **Atualizações** (`cases`) | cliente, nº processo, área, quem atendeu, **hora início/fim**, tipo, status, próxima providência, relato, histórico, arquivados | **Ele chamou de "a parte importante"** [03:20]. Dois objetivos: (a) qualquer sócio consegue atender o cliente de outro sem parecer perdido; (b) o **cronômetro** prova ao cliente quanto tempo foi gasto. Regra de auditoria já implementada: atualização não se apaga, só se edita, com data e responsável. |
| **Financeiro** | honorários a receber, parcelas, contrato financeiro, contas do escritório, multa+juros por atraso, exportação CSV/PDF mensal e anual | **Prioridade nº 1.** Controle manual, **sem integração bancária** (custo). Entrada × saída, despesas do escritório (água, luz, internet, telefone, aluguel, café), inadimplentes com valor já atualizado, e exportação para dividir faturamento. [07:00, 23:40] |
| **Agenda** | grade semanal, novo agendamento, bloqueio de período, audiências | Eles já usam **Google Agenda** e mandam o link ao cliente para ele mesmo escolher horário. Aceita integração **ou** só importar/exportar o mês. Motivo declarado: nunca deixar cliente esperando — "escritório cheio não quer dizer que você está ganhando" [10:00] |
| **Publicações/Intimações** | consulta à API Comunica/CNJ por OAB + UF + período, importação → prazo / audiência / tarefa, conferência humana obrigatória | Captura diária do Diário de Justiça Eletrônico. Campos de prazo já modelados: **data base, dias úteis × corridos, prazo fatal, prazo de entrega** (3–4 dias antes, de propósito), prioridade. **Falta: prazo em HORAS** — ele pediu, juiz às vezes intima em horas [16:00] |
| **Prazos** | lista | Só um resumo filtrável: **diário, semanal, mensal, anual**. Não é agenda. [17:00] |
| **Tarefas** | delegação com responsável, prioridade, prazo, bloqueio de agenda | Delegar entre sócios e acompanhar. |
| **Fotos e Notícias** | título, categoria, texto, imagem, links Instagram/Facebook/LinkedIn | Conteúdo jurídico para **tráfego orgânico**. Publica no admin e sai no site público. Medo declarado: "o ruim é que começam e não fazem" [18:00] |
| **Membros** | 4 advogados com OAB e perfil | **Permissão por módulo.** Exemplo dele: um advogado vê Clientes/Contatos/Atualizações; a secretária vê esses mais Financeiro; ninguém além do admin mexe em Prazos e Publicações. [19:00] |
| **Configurações** | textos do site, contato, redes, avaliações do Google, logo, áreas de atuação | Também é onde ficam as áreas de atuação que alimentam o site. |
| **Notificações** | contador | Lembretes que **avisam, não enviam**: "não precisa mandar automático, mas que me avisaria e eu falaria: pô, Rodrigo, estou passando para dar parabéns" [00:00] |
| **Escritório Virtual** | — | Não foi demonstrado. Perguntar o que ele espera disso. |

### Google Drive por cliente — o que ele realmente precisa

Ele tentou e não conseguiu: criar automaticamente `Drive/<Cliente>/<Área>/` e
salvar os documentos gerados lá [20:00]. **Mas ele mesmo rebaixou a prioridade**:
"eu não preciso que o documento fique salvo no site ou no drive — o que eu
preciso é gerar, manusear conforme o cliente e imprimir".

→ **Obrigatório:** gerar com dados do cadastro, editar na tela, imprimir.
→ **Desejável:** a estrutura de pastas no Drive.

---

## 5. Reação dele ao protótipo do site [34:49 em diante]

Aprovou sem ressalvas: *"ficou muito legal"*, *"ficou muito mais refinado do que
a gente faz"*, *"ficou totalmente melhor do que eu pensava"*. Chegou a pegar o
link para abrir no celular.

**O que ele pediu de novo, durante a demo:**

1. **Avaliações do Google no site** [~29:00]. Eles têm perfil no Google Business
   (é a presença online que existe hoje — não tinham site). Quer um recorte das
   **últimas 3–4 avaliações** exibido na página, não só o link. Já há um campo
   para isso nas Configurações do sistema, em "modo sem API" para não gerar
   custo com a Places API. Link candidato encontrado no HTML:
   `https://share.google/eAFEBsxvmaAHzK3f2` — **confirmar com ele**.
   ⚠️ Conflito com OAB: ver §6.
2. **Prévia de post de rede social dentro da notícia** [~30:00]. Ex.: semana de
   violência doméstica → artigo no site com o card do post do Instagram
   embutido e link. Objetivo é interação nos dois sentidos.
3. **Landing page de campanha** [~32:00]. Ele não sabia o termo e perguntou se
   precisa de uma página por campanha (ex.: Dia do Trabalhador captando
   acidentes de trabalho) ou se dá para usar o mesmo site. Já foi respondido na
   reunião que o mesmo site serve — **confirmar como isso vira estrutura**.
4. **Logo** [46:47, fim do áudio]. "Estamos com um problema muito chato, a gente
   tentou repaginar a nossa logo" — a transcrição corta exatamente aqui.
   **Resolvido em 29/09/2026:** a logo nova (monograma serifado FHL + filete +
   "Fonseca Hespanha Lisboa", em `LogosNovas/`) substituiu a antiga no site e
   na área dos advogados. Ainda falta o arquivo vetorial original — o site usa
   uma vetorização do PNG (README §Identidade).
5. **SEO / tráfego** [18:30]. Pergunta genuína dele: mais interação = mais
   entrega, como no Instagram? Quer orgânico **e** pago. Merece uma resposta
   curta e honesta na próxima conversa.

---

## 6. Restrições que não se negociam

**Provimento 205/2021 da OAB** — o `README.md` detalha; o essencial:
sem depoimento de cliente, sem taxa de êxito, sem resultado obtido, sem
honorário, sem superlativo, sem captação agressiva.

> ⚠️ **As avaliações do Google que ele pediu (§5.1) colidem com isso.**
> Avaliação de cliente exibida no site é, na prática, depoimento. É preciso
> avaliar antes de implementar — provavelmente linkar o perfil do Google
> (conteúdo hospedado por terceiro, escolhido pelo usuário) é defensável,
> enquanto reproduzir o texto das avaliações dentro do site não é.
> **Levar essa dúvida a ele como advogado, não decidir sozinho.**

**LGPD** — consentimento opt-in, mapa só carrega após clique, fontes
auto-hospedadas. Já implementado; não regredir.

---

## 7. Dados pendentes de confirmação

| Item | Situação |
|---|---|
| **E-mail oficial** | Site usa `contato@fhladvocacia.com.br` (suposição). O sistema dele traz `contato@casenhali.com`. **Conflito — perguntar qual é o real.** |
| **Domínio** | `fhladvocacia.com.br` é suposição. Confirmar se já foi registrado. |
| **OAB da sociedade e CNPJ** | Vazios em `src/data/site.mjs` (o site mostrava "00.000"). Até lá, o rodapé lista a inscrição de cada advogado. Os 4 advogados são OAB/PR; a inscrição da *sociedade* não aparece em lugar nenhum. |
| **Anos de atuação** | Era `10`, sem fonte; agora `6` (`ANOS_DE_ATUACAO`). Ele disse "estou há seis anos" [~24:30] — mas pode ser o tempo dele, não do escritório. |
| **Redes sociais** | Os campos no sistema dele estão com URL genérica (`https://instagram.com/`). Nunca foram preenchidos. |
| **Áreas de atuação** | O site mostra 4 (Trabalhista, Previdenciário, Consumidor, Cível), mas os perfis somam 12+, incluindo **Portuário** — que num escritório de Paranaguá provavelmente é central. Decisão dele: vitrine de 4 ou abrir uma quinta página? |
| **Licença webfont Galano Grotesque** | Bloqueia o lançamento. Ver README §Pendências. |

---

## 8. Bug que apareceu na reunião — corrigido

`src/pages/escritorio.mjs` dizia **"A I&D Legal atua em direito cível e
contratual…"** — texto herdado de `preparacao-ied-legal.md`, de quando o cliente
era chamado de "I&D". **Ficou visível na tela durante a reunião** [37:59 e
46:14]. Já corrigido; ao mexer em texto institucional, procurar "I&D" antes de
qualquer demo.

---

## 9. Caminho sugerido para Ithalo e Rodrigo

**Agora (fecha a fase 1):**
1. Corrigir o texto "I&D Legal".
2. Resolver e-mail, domínio, OAB da sociedade, anos de atuação.
3. Levar a ele a questão OAB × avaliações do Google (§6) — como pergunta técnica
   a um advogado, que é o terreno dele.
4. Backend do formulário — e já projetá-lo para que o lead **caia no módulo
   Contatos** da fase 2. É a primeira ponte entre site e sistema.
5. Logo: a nova já está no site. Pedir ao Rodrigo o arquivo vetorial original.

**Depois (proposta da fase 2):**
1. Orçar **só o Financeiro** primeiro. É a prioridade declarada, é o módulo mais
   simples de especificar e entrega valor isolado.
2. Segundo módulo: **Clientes + Documentos Automáticos + Ficha de Atendimento**.
   É o que ele mais usa no dia a dia e o que mais o protege.
3. Terceiro: **Atualizações** com cronômetro e auditoria.
4. Publicações/CNJ por último dentro do escopo FHL — mas é o que vale conversar
   como **produto** (§3).

**Decisões técnicas a tomar antes de orçar a fase 2:**
Um HTML de 15 MB em `localStorage` não sobrevive a 5 usuários simultâneos —
ele já viu "Controle de edição simultânea indisponível" na própria demo.
A fase 2 precisa de backend e banco de verdade. Isso muda o custo mensal, e o
custo mensal é o critério dele. **Chegar na conversa com esse número pronto.**

---

## 10. Perguntas para a próxima reunião

1. Qual é o e-mail e o domínio oficiais?
2. Qual a inscrição da sociedade na OAB e o CNPJ?
3. Direito Portuário entra como área do site?
4. O que é o "Escritório Virtual" que aparece no menu do sistema?
5. Quantos anos o **escritório** tem (não você)?
6. A logo nova está aprovada por todos os sócios? Existe o arquivo vetorial?
7. Qual o teto mensal confortável para o sistema?
8. Você topa que as avaliações do Google fiquem como link para o perfil, em vez
   de reproduzidas no site, se for isso que o Provimento 205 exigir?
