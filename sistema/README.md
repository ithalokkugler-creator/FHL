# FHL Advocacia — área dos advogados

Sistema interno do escritório: **Agenda**, **Financeiro** e o **Site** — as
publicações e campanhas que aparecem em fhladvocacia.com.br —, com login
individual, permissão por módulo e histórico de tudo. É o piloto da fase 2
descrita em [`preparacao-area-dos-advogados.md`](../preparacao-area-dos-advogados.md)
— ainda não contratado, rodando nos planos gratuitos do Supabase e da Vercel.

A área **vai ao ar junto com o site**, em `/sistema`, no mesmo deploy e no mesmo
repositório. O site tem um link discreto para ela no rodapé; ela tem "Ver o
site" na lateral e "Voltar ao site" na tela de entrada.

---

## Como rodar

Mesma regra do site: Node 20 ou mais novo, sem dependências, sem build. E o
mesmo servidor — o do site:

```bash
npm run dev
```

E abra `http://127.0.0.1:8123/sistema`. Salvar qualquer arquivo em `sistema/`
recarrega o navegador. O endereço local é o mesmo que a Vercel vai usar, o que
evita a classe de erro que só aparece em produção.

| Comando | O que faz |
|---|---|
| `npm run dev` | Serve o site em `/` e a área dos advogados em `/sistema`, com live reload |
| `npm run dev -- 3000` | O mesmo, em outra porta |
| `npm run sistema:test` | Testes dos cálculos: atraso, parcelas, índices, cobrança, agenda, formatos |

Não existe banco local: rodando na máquina, o sistema já fala com o projeto
Supabase **fhl-advocacia** (organização Haderach solutions, região São Paulo).

### Primeiro acesso

Não há tela de cadastro, de propósito — quem entra é o escritório que decide.

1. O e-mail precisa estar num **membro ativo**. Os quatro advogados já estão
   cadastrados, sem e-mail; há também um administrador de suporte do piloto
   (Ithalo), com e-mail.
2. Supabase → **Authentication → Users → Add user → Create new user**: o mesmo
   e-mail, uma senha e **Auto Confirm User** marcado.
3. Entrar. No primeiro acesso o login se liga ao membro sozinho
   (`iniciar_sessao`), e a senha se troca em **Minha conta**.

Para liberar os sócios, o administrador põe o e-mail de cada um na tela
**Membros** e repete o passo 2.

---

## Arquitetura

| Parte | Onde | Por quê |
|---|---|---|
| Telas | `sistema/` — HTML, CSS e ES modules servidos como estão | Nada para instalar ou compilar. Cada tela é um módulo, carregado quando alguém a abre (`import()` nas rotas de `js/app.js`). `scripts/build.mjs` copia a pasta para `dist/sistema/`. |
| Supabase | `js/nucleo/supabase.js` — cliente próprio | O `@supabase/supabase-js` traria ~150 KB e pediria bundler. O que o sistema usa cabe num arquivo: login, renovação da sessão (uma por vez, também entre abas), leitura, escrita e funções. |
| Regras | `supabase/migrations/` — Postgres com RLS | A tela esconde o botão; quem **impede** é o banco. Permissão, auditoria, "nada se apaga" e mês fechado valem para qualquer cliente da API, não só para estas telas. |
| Cálculos | `js/dominio/` — funções puras | Atraso, parcelas, índices, cobrança e grade da agenda, testados com `node --test`. |

```
sistema/
  index.html · vercel.json · .vercelignore
  css/sistema.css            Tokens da marca, casca, componentes e telas
  img/                       Logo e favicon (cópias de assets/img)
  js/
    app.js                   Rotas, menu por permissão, sessão
    config.js                URL e chave publicável do Supabase
    nucleo/                  supabase, consulta, html, formato, csv, dialogo, estado, rotas, avisos
    dominio/                 atraso, parcelas, indices, cobranca, agenda
    telas/                   entrar, inicio, agenda, membros, historico, conta, clientes, comum
    telas/financeiro/        base, painel, recebiveis, em-atraso, contratos, contrato,
                             contrato-novo, contas, fechamento, relatorios, configuracoes
    telas/site/              base, publicacoes, publicacao, campanhas, campanha, publicar
  testes/                    node --test

supabase/
  migrations/                base · financeiro · agenda · ajustes_piloto · conteudo
  functions/publicar-site/   função de borda que chama o Deploy Hook da Vercel
  testes/permissoes.sql      87 testes de permissão e de regra, desfeitos no fim
```

### Segurança

- **RLS em todas as tabelas.** `anon` não tem GRANT nenhum; `authenticated` só
  nas colunas permitidas — `id`, `user_id` e carimbos ficam de fora.
- **Login só enxerga dados depois de vinculado** a um membro ativo, e o vínculo
  exige e-mail confirmado. Membro desativado perde o acesso na hora.
- **Nada se apaga.** Sem GRANT de DELETE, e um gatilho recusa a exclusão até para
  o dono das tabelas. Cancelar e estornar exigem motivo e não se desfazem.
- **Auditoria por gatilho** (`auditoria`): quem, quando, campos, antes → depois.
  Ninguém escreve nela direto, e cada um só lê o histórico do que pode ver.
- **Particular fica particular.** Compromisso particular não sai pela tabela para
  os outros; sai por `agenda_periodo()`, como "Ocupado".
- **CSP estrita** (`vercel.json`): `script-src 'self'` e `style-src 'self'`. Cor e
  posição na agenda passam por variável CSS definida em JavaScript
  (`aplicarVariaveis`), porque `style=""` dentro de HTML gerado seria bloqueado.
- **Origem separada do site.** O site vai receber pixel e analytics; a sessão do
  sistema não fica ao alcance deles.

As 12 funções `SECURITY DEFINER` que o advisor do Supabase aponta são de
propósito: cada uma confere a permissão na primeira linha.

**A única exceção ao "`anon` não tem GRANT nenhum"** é o conteúdo do site:
`publicacoes` e `campanhas` dão SELECT das colunas públicas ao `anon`, e a
política só deixa ver o que está publicado. Quem lê por ali é o build do site,
e o que ele lê é, por definição, o que vai ficar visível para qualquer pessoa
na internet. `publicado` fica fora do GRANT de propósito: é a política que
filtra, e sem SELECT na coluna nem dá para filtrar por ela de fora.

**Recomendado desligar** Authentication → Sign In / Providers → *Allow new users
to sign up*. Conta criada pela API sem membro não vê nada, mas as contas deste
sistema são criadas pelo administrador — não há motivo para o cadastro público
ficar aberto.

---

## Permissões (preparação 5.2)

| Nível | Agenda | Financeiro | Site |
|---|---|---|---|
| Administrador | Vê e edita todas | Tudo, inclusive fechar e reabrir o mês e mudar as configurações | Escreve e publica |
| `todas` / `completo` / `editar` | Vê e edita a de todos, menos o particular dos outros | Lança e vê tudo, inclusive fechamento e divisão | Escreve publicações e campanhas e manda publicar |
| `propria` / `lancamentos` | Vê a de todos, edita a sua | Lança e consulta; não vê fechamento nem divisão | — |
| `nenhum` | Sem acesso | Sem acesso | Sem acesso |

Sugestão ao escolher o perfil em **Membros**, ajustável por pessoa:

| Perfil | Agenda | Financeiro | Site |
|---|---|---|---|
| Sócio | `propria` | `completo` | `editar` |
| Secretária | `todas` | `lancamentos` | `nenhum` |
| Advogado associado ou estagiário | `propria` | `nenhum` | `nenhum` |

O Site nasce fechado para quem não é sócio: o texto que sai dali é publicidade
de escritório de advocacia, e quem escreve assina.

---

## Financeiro

**Regime de caixa.** Entrada conta no mês em que foi recebida; saída, no mês em
que foi paga. Parcela vencida e conta a pagar aparecem como pendência, não no
resultado.

### Atraso — a validar pelo Vinícius (6.5)

```
corrigido = saldo × fator do IPCA no período
multa     = corrigido × 10%                        uma vez
juros     = corrigido × 1% ao mês × dias ÷ 30      simples, pró-rata
total     = corrigido + multa + juros
```

- **Multa de 10% e juros de 1% ao mês** são os do próprio contrato de honorários
  do escritório, e os do protótipo. **IPCA** porque o contrato prevê correção sem
  dizer o índice, e é o que a Lei 14.905/2024 adota nesse caso.
- **Período do índice:** do mês do vencimento ao mês anterior ao cálculo. Mês sem
  índice publicado entra sem correção e fica anotado. Fonte: API pública do
  Banco Central (séries 433, 188 e 189), chamada direto do navegador.
- **Deflação** entra no acumulado, mas a dívida não fica abaixo do valor nominal
  (STJ, Tema 678).
- **Pagamento parcial** abate primeiro o saldo da parcela; o que passar vira
  encargo. *Conferir:* o art. 354 do Código Civil manda imputar primeiro nos
  juros, salvo acordo entre as partes.
- A **memória do cálculo** aparece na tela, entra na mensagem de cobrança e fica
  gravada no recebimento.

Tudo configurável em **Financeiro → Configurações**, para o escritório e por
contrato.

### Divisão entre sócios (6.6)

Padrão até o escritório definir: **partes iguais entre os quatro sócios, depois
das despesas.** Alternativa pronta: cota por sócio. O fechamento mostra, por
sócio, o valor e o reembolso pendente de conta paga do próprio bolso. A
diferença de centavos fica com o último da lista.

---

## Agenda

Semana de todos com cor por advogado, horário livre, bloqueio de vários dias,
particular como "Ocupado", aviso de conflito contando o intervalo mínimo entre
atendimentos, chegada do cliente com tempo de espera, situação do atendimento e
impressão. A tela **Hoje** junta a agenda do dia e o que pede atenção no
Financeiro.

**Não conversa com o Google Agenda.** A ligação (7.3, opção C) depende da conta
que o escritório vai usar — Gmail comum ou Workspace, pergunta 12. As colunas
`google_*` de `compromissos` ficam reservadas. Até lá, o que é marcado aqui não
bloqueia o link de agendamento do Google, e a tela avisa isso.

---

## Site

O que o escritório publica em fhladvocacia.com.br sem precisar de ninguém que
mexa em código: **Publicações** (os artigos de `publicacoes.html`) e
**Campanhas** (as páginas de campanha). É o pedido do CLAUDE.md §4 e §5.3 —
conteúdo jurídico para tráfego orgânico, e landing page de campanha sem site à
parte.

### Salvar não é publicar

O site é estático: as páginas são geradas uma vez e servidas como arquivos. É
isso que o deixa rápido e indexável, e é isso que separa as duas coisas.

| | O que faz |
|---|---|
| **Salvar** | Grava no Supabase. O site no ar não muda |
| **Mostrar no site** | Marca que aquilo já pode ser visto por qualquer pessoa. Continua sem mudar o site |
| **Publicar** (tela *Site → Publicar*) | Manda a Vercel gerar o site de novo. Dois ou três minutos depois está no ar |

A tela Publicar mostra quanto mudou desde a última vez e o registro de todos os
pedidos — quem pediu, quando, e o que aconteceu.

### Quem chama a Vercel

A função de borda [`publicar-site`](../supabase/functions/publicar-site/index.ts),
no Supabase — **nunca o navegador**. A URL do Deploy Hook é um segredo: quem a
tem dispara build no site do escritório sem passar por login nenhum. No
navegador, ela estaria no código da página.

A função confere a permissão pelo banco (`pode_publicar_site()`) antes de tocar
na Vercel, e registra o pedido com o nome de quem pediu. `verify_jwt` fica
desligado para o preflight do CORS passar; sem sessão de membro com acesso ao
Site, a resposta é 403.

**Falta configurar:** criar o Deploy Hook na Vercel (projeto do site → Settings
→ Git → Deploy Hooks) e guardar a URL no Supabase, em Edge Functions → Secrets,
como `VERCEL_DEPLOY_HOOK`. Até lá o botão responde que não está configurado,
registra o pedido como falho, e o site continua sendo gerado a cada push.

### O que o artigo aceita

Parágrafo, subtítulo, frase em destaque, lista e **cartão de post de rede
social** — o post do Instagram dentro do artigo (CLAUDE.md §5.2). Não é um
editor de texto rico, de propósito: o formato é o mesmo que
`src/pages/publicacoes.mjs` renderiza, e é o que impede texto colado do Word de
entrar no site com fonte, cor e tabela invisível junto. Bloco malformado é
recusado pelo banco, com a mensagem em português — e não na hora de publicar,
quando quebraria o build inteiro.

A imagem do cartão é enviada na própria tela, vai para o balde `site` do Storage
e o build a copia para `dist/assets/img/publicacoes/`. No ar, quem serve a
imagem é o site.

**Não há prévia fiel na tela**, de propósito: uma segunda cópia do renderizador
do site divergiria dele na primeira mudança de layout. O que há é a estrutura
visível e o link "Ver no site" depois de publicar.

### O que continua no código

Área de atuação, equipe, textos institucionais, endereço, telefone e navegação
seguem em `src/data/`. Elas moldam o site inteiro — menu, rodapé, páginas —, não
são conteúdo: mudá-las é mexer no site, não publicar nele.

### Imagem de compartilhamento

A prévia que aparece quando o link é colado no WhatsApp é gerada por
`npm run og`, que precisa de um navegador instalado e por isso não roda no
servidor da Vercel. Artigo novo entra no ar com a imagem padrão do site até
alguém rodar o comando e commitar. A tela Publicar avisa isso.

### Provimento 205/2021

O banco não tem como conferir conteúdo. As telas de escrita lembram as regras a
quem escreve — sem depoimento, resultado, percentual de êxito, honorário,
promessa, superlativo ou captação — e o acesso ao módulo nasce fechado para
quem não é sócio.

---

## Banco

| Versão | Migração | Conteúdo |
|---|---|---|
| 20260915193338 | `base` | Membros, permissões, auditoria, clientes, vínculo do login |
| 20260915194302 | `financeiro` | Contratos, parcelas, recebimentos, renegociações, cobranças, contas, recorrentes, fechamento, views e funções |
| 20260915195203 | `agenda` | Compromissos, configuração, `agenda_periodo` |
| 20260915201001 | `ajustes_piloto` | Índices das chaves estrangeiras; correção pelo IPCA como padrão |
| 20260916114500 | `conteudo` | Publicações, campanhas, `acesso_site`, pedidos de publicação, balde das imagens — e o conteúdo que já estava no site como semente |

Numa base nova: rodar as cinco em ordem no SQL Editor, ou `supabase db push`
com a CLI. Depois, `supabase/testes/permissoes.sql` — 87 testes que simulam
anônimo, login sem membro, e-mail não confirmado, administrador, sócia,
secretária e associado. Nada fica gravado.

**Tabela nova segue o mesmo roteiro:** `privado.aplicar_padrao()` (carimbo,
auditoria, sem exclusão), RLS, GRANT coluna a coluna e a tabela no
`privado.pode_ver_auditoria()`.

---

## Pôr no ar

**Um projeto na Vercel, para o site e para a área** — a raiz do repositório,
build `npm run build`, saída `dist/`. O build copia `sistema/` para
`dist/sistema/` (sem `testes/` e sem este README), e a área fica em `/sistema`.

Não existe mais um segundo projeto com Root Directory `sistema`: os cabeçalhos
que ficavam em `sistema/vercel.json` estão no `vercel.json` da raiz, aplicados
só às rotas `/sistema` e `/sistema/*`.

Com o endereço definido:

1. Supabase → **Authentication → URL Configuration** → pôr `https://<domínio>/sistema`
   em *Site URL* e *Redirect URLs*, para o link de "Esqueci a senha" voltar para
   o lugar certo.
2. Vercel → projeto do site → **Settings → Git → Deploy Hooks** → criar um hook
   para a branch `main`, copiar a URL e guardá-la no Supabase, em
   **Edge Functions → Secrets**, como `VERCEL_DEPLOY_HOOK`.

## Custos

| | Piloto | Produção |
|---|---|---|
| Supabase | Free — US$ 0 | Pro — US$ 25/mês, com backup diário |
| Vercel | Hobby — US$ 0 | Pro — US$ 20/mês |

No Free, o projeto Supabase **pausa depois de uma semana sem uso** (reativa pelo
painel). O Hobby da Vercel é só para uso não comercial.

---

## Pendências

### Seguiu a recomendação — confirmar com o Vinícius

| Decisão | O que ficou | Onde muda |
|---|---|---|
| Login (pergunta 19) | Um por pessoa | — |
| Sócios no Financeiro (perguntas 7 e 15) | Completo; secretária lança sem ver a divisão | Membros |
| Critério de atraso (pergunta 4) | 10% + 1% ao mês + IPCA, sem carência | Financeiro → Configurações |
| Pagamento parcial | Saldo primeiro, depois encargos | `receberParcela` em `telas/financeiro/base.js` |
| Divisão (perguntas 1 e 2) | Partes iguais entre os quatro, depois das despesas | Financeiro → Configurações |
| Agenda (pergunta 17) | Grade 8h–19h sem sábado; atendimento 60 min, retorno 30, intervalo de 15 | Agenda → Configurar |
| Categorias e formas de pagamento | As da preparação (6.2) | Financeiro → Configurações |
| Quem escreve no site | Só sócio e administrador; associado e secretária ficam de fora | Membros → Site |

### Parado — depende de algo que ainda não existe

| O quê | Depende de |
|---|---|
| Google Agenda nos dois sentidos | Conta do Google do escritório (Gmail comum ou Workspace) |
| Convite e recuperação de senha por e-mail | E-mail e domínio oficiais, e um SMTP. No Free, o e-mail padrão do Supabase só chega a quem é da equipe da organização |
| Migração dos dados do protótipo | O arquivo de backup exportado pelo Vinícius |
| Publicação na Vercel | Aprovação do commit |
| Botão "Publicar o site" funcionar de verdade | O projeto na Vercel existir, para criar o Deploy Hook e guardá-lo como `VERCEL_DEPLOY_HOOK` |
| Imagem de compartilhamento de artigo novo | Um jeito de gerar o cartão sem navegador — hoje é `npm run og`, na máquina de quem desenvolve |

### Para depois

Comprovante anexado ao recebimento, importação de extrato OFX, feriados
(nacionais, do Paraná e de Paranaguá) na agenda, resumo diário por e-mail,
"desfazer" pelo histórico e horas trabalhadas vindas de Atualizações. No Site:
agendar a publicação de um artigo para uma data, editar áreas de atuação e
receber no módulo Contatos quem preencher o formulário do site.

---

## Notas de manutenção

- **Dinheiro circula em centavos inteiros.** O banco guarda reais; a conversão é
  só na borda (`centavos`, `paraReais`). Erro de centavo é erro de cobrança.
- **Datas de calendário não passam por fuso** (`'AAAA-MM-DD'`); instantes sempre
  aparecem em Brasília (`noFuso`, `instante`). "Hoje" é o de Paranaguá, no banco
  (`privado.hoje()`) e na tela (`hoje()`).
- **Nada de `style=""` em template.** A CSP bloqueia; use `data-vars`.
- **A Data API devolve no máximo 1000 linhas por chamada** e corta o resto sem
  avisar. Lista que pode passar disso usa `db.todos()`.
- **Diálogo resolve sem esperar o evento `close`.** Com a aba em segundo plano, o
  Chromium só entrega esse evento quando a página volta a ser desenhada — antes
  da correção, a tela não recarregava depois de salvar.
- **Tela nova recebe `ctx.raiz` própria** e confere `ctx.ativa()` depois de cada
  `await`: quem troca de tela no meio de um carregamento não vê a anterior
  desenhar por cima.
- **Os caminhos desta pasta são absolutos** (`/sistema/css/…`). A Vercel serve a
  página tanto em `/sistema` quanto em `/sistema/`, e caminho relativo
  resolveria errado numa das duas. Vale para `index.html` e para HTML gerado em
  JavaScript; `import()` entre módulos continua relativo, porque resolve pela
  URL do módulo, não pela da página.
- **Bloco de artigo tem três guardiões**, e os três precisam concordar: o editor
  (`telas/site/publicacao.js`), o gatilho do banco (`privado.validar_corpo`) e o
  renderizador do site (`src/pages/publicacoes.mjs`). Tipo novo se acrescenta
  nos três.
