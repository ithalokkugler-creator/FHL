# HANDOFF — Fonseca Lisboa Advocacia (site + área dos advogados)

**O guia único para quem pega este projeto.** Atualizado em 21/10/2026.
Substitui todos os handoffs, roteiros e relatórios antigos da raiz (o
histórico deles está no git e, para as especificações, em
[`docs/historico/`](docs/historico/)).

**Ordem de leitura**

| Arquivo | Para quê |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Quem é o cliente, como ele pensa, o que pediu e por quê. Ler primeiro. |
| **este arquivo** | Estado atual, contas, como rodar/testar/publicar, armadilhas, pendências. |
| [`README.md`](README.md) | O **site público** em detalhe (build, identidade, OAB, LGPD, SEO). |
| [`sistema/README.md`](sistema/README.md) | A **área dos advogados** em detalhe (arquitetura, segurança, permissões, Financeiro, Agenda/Google, banco, tabela de migrações, decisões). |
| [`docs/operacao/backup-restauracao.md`](docs/operacao/backup-restauracao.md) | Rotina de cópia de segurança (desenhada, **não ativa**). |
| [`docs/historico/`](docs/historico/) | Especificações originais. Migrações e comentários do código citam "preparação 7.5", "§10.7", "T16" etc. — é lá que estão. |

---

## 1. Em uma página

- **Cliente:** Fonseca Lisboa Advocacia (FL; até out/2026, FHL), Paranaguá/PR.
  Sócios: **Vinícius** (advogado-chefe, decide tudo, administrador no
  sistema), **Juliana** (esposa dele) e **Guilherme**. **Marlon saiu** em
  out/2026 (inativo no sistema; a marca virou FL).
- **Fornecedores:** **Ithalo** (organiza, aprova commits/publicação, é quem
  conversa com a gente) e **Rodrigo** (designer; o domínio está no CPF dele).
- **Dois produtos num repositório só, num deploy só:**
  1. **Site institucional** (`src/` → `dist/`), estático, gerado por
     `scripts/build.mjs`. Contratado.
  2. **Área dos advogados** (`sistema/`, servida em `/sistema`), SPA em ES
     modules **sem build**, sobre Supabase. Piloto da "fase 2", ainda não
     contratado formalmente, mas **em uso real desde 15/10/2026**.
- **Tudo está em produção** em <https://advocaciafl.com.br> e
  <https://advocaciafl.com.br/sistema>. Testes: **189/189 JS, 611/611
  SQL**, site 19 páginas OK. Último pacote: pedidos de 21/10 (§9).
- **Planos gratuitos** (Supabase Free, Vercel Hobby). Para uso comercial de
  verdade: Vercel Pro US$ 20 + Supabase Pro US$ 25/mês (backup diário).

---

## 2. Regras de trabalho (combinadas com o Ithalo)

1. **Nunca commitar/publicar sem o "pode publicar" do Ithalo** naquele
   pedido. Aprovação de um pedido não vale para o próximo. O classificador do
   modo automático também bloqueia `db push` sem um pedido explícito.
2. **Testar só na prévia local** (dados fictícios). Nunca gravar teste em
   produção. Exceção: quando o Ithalo pede para ver na produção — aí usar o
   perfil dele, título "TESTE", e cancelar no fim.
3. **Não digitar senha nem criar conta** em produção (Supabase, Google,
   registro.br). Quando o Google/registro.br pedir senha, pedir ao Ithalo.
   Segredos (chave secreta do OAuth, senha de app do SMTP) **quem cola é o
   Ithalo**; nunca repetir segredo no chat.
4. **E-mails pessoais dos advogados não aparecem em lugar nenhum** (site,
   repositório, memória). Ficam só no banco (`membros.email`).
5. **Não redesenhar a marca FL** (paleta, logo, fontes). Ajustes de interface
   sim; identidade não.
6. **Sem resposta do escritório, implementar a recomendação** e marcar
   "a confirmar" (lista em §10). Bloqueado por conta externa: não avançar.
7. **Nada se apaga** no sistema: cancelar exige motivo e fica no histórico.
   Exclusão em massa (limpeza de teste) só pelo Ithalo, no SQL Editor, com
   cópia antes — o classificador bloqueia o agente, e está certo.
8. **Não commitar arquivos do Ithalo** que estão soltos na árvore:
   `LogosNovas/FL/LEIA-ME.md` (modificado), `LogosNovas/FL/_fonte/*`,
   `LogosNovas/FL/manual-ia/`, `LogosNovas/FL/marca-fl-para-ia.zip`,
   `GUIA-NOVAS-FUNCOES-FHL (2).md`, `diagnostico_tecnico_pedidos_advogados.md`.
9. Texto ao usuário em português do Brasil, simples (o Ithalo é leigo em
   técnica; os advogados mais ainda). Mensagens de WhatsApp para os
   advogados: blocos prontos, com *negrito* do WhatsApp.

---

## 3. Contas e infraestrutura

### Código e publicação
- **GitHub:** `ithalokkugler-creator/FHL`, branch `main`.
- **Vercel:** projeto `fhl-advocacia` (time "Wibble"). **Cada push na `main`
  publica** site + sistema em ~1 min. Proteção Vercel só nas prévias.
  `vercel.json` da raiz tem os cabeçalhos (CSP) do site e de `/sistema`.
- Conferir que o deploy entrou: `curl -s "https://advocaciafl.com.br/sistema/js/<arquivo>.js?v=$RANDOM" | grep -c "<trecho novo>"`.
- Se o GitHub estiver fora (já aconteceu), tentar o push de novo em laço.

### Domínio e DNS — `advocaciafl.com.br`
- Registrado no **registro.br** (titular: Rodrigo; o Ithalo entra com o
  código de usuário dele). DNS **do próprio registro.br**, zona em **modo
  avançado**.
- Registros: `A` → Vercel (64.29.17.1 e 216.198.79.1); `CNAME www` → Vercel;
  `MX 1 smtp.google.com`; `TXT google-site-verification=…` (**não apagar**:
  verifica o Workspace e o Search Console); `TXT google-gws-recovery-…`;
  `CNAME 76535524 → google.com.`; **SPF** `v=spf1 include:_spf.google.com ~all`;
  **DKIM** `google._domainkey` (2048 bits, ativo no Google Admin); **DMARC**
  `_dmarc` `v=DMARC1; p=none` (sem `rua`, de propósito).
- `www`, `http` e o `.vercel.app` redirecionam para o domínio.

### Google Workspace — `contato@advocaciafl.com.br`
- Conta do escritório, **compartilhada** pelos advogados. A organização do
  Workspace tem também o domínio **casenhali.com** (de outro negócio: **não
  mexer**). Verificação em 2 etapas **desligada** (decisão do escritório,
  20/10; ver §10).
- **Google Agenda:** agenda principal "FONSECA LISBOA Advocacia" + uma
  **subagenda por advogado** (Guilherme, Juliana, Vinicius e a do Marlon) +
  aniversários e tarefas. **Quatro páginas de agendamento** ("Atendimento
  com …"), cada uma considera ocupado só o que está na subagenda do próprio
  advogado. A do **Marlon continua ativa** — os advogados decidem.
- **Google Cloud:** projeto `fl-agenda` (o "My First Project" que já existia:
  não mexer). Google Calendar API ativa. Tela de consentimento **Interna**
  ("Sistema Fonseca Lisboa"; não expira em 7 dias, sem verificação do
  Google). Cliente OAuth Web "Sistema FL - Agenda", URI de retorno
  `https://ulnpnbzibwbrzrpomgia.supabase.co/functions/v1/google-agenda`.
  A chave secreta do cliente só aparece na criação: se perder, gera-se outra
  e o Ithalo cola no Supabase.
- **Search Console:** propriedade de domínio na conta contato@, verificada
  pelo TXT; `sitemap.xml` processado (18 páginas); indexação da home pedida.

### Supabase — projeto `fhl-advocacia` (`ulnpnbzibwbrzrpomgia`), org "Haderach solutions", Free
- **Pausa sem uso** (~1 semana): `.github/workflows/manter-supabase.yml` lê o
  banco a cada 3 dias. Limite de 2 projetos Free ativos na org (o outro é
  `frida-hearth-staging`: não mexer).
- **CLI:** binário em cache
  `$LOCALAPPDATA/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe`
  (já linkado; `db push` sem senha). `functions deploy <nome> --use-api`.
  `secrets list` mostra só hashes.
- **Auth:** Site URL `https://advocaciafl.com.br/sistema`, Redirect
  `https://advocaciafl.com.br/**`. Sign-up público desligado (entra quem tem
  `membros.email`; o 1º login liga o usuário ao membro em `iniciar_sessao`).
  **SMTP próprio** com o Gmail do Ithalo (`smtp.gmail.com:465`, senha de app,
  remetente "Fonseca Lisboa Advocacia"); modelos Invite e Reset em português.
  **Validade do link (Email OTP expiration) em 86400 s temporariamente** —
  voltar para 3600 quando a Juliana entrar.
- **Funções de borda** (todas `verify_jwt = false` em `supabase/config.toml`;
  conferem o token por conta própria): `receber-contato` (formulário do site
  → Contatos), `finalizar-anexo`, `administrar-usuarios` (convite),
  `publicar-site` (Deploy Hook da Vercel), `google-agenda` (sincronização).
- **Segredos** (só nomes): `CONTATO_SAL`, `VERCEL_DEPLOY_HOOK`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (+ os automáticos do Supabase).
- **Extensões:** `pg_net` (schema `extensions`) e `pg_cron`; job
  `google-agenda` `*/2 * * * *` → `privado.google_cron()`.
- **Schemas:** `public` (Data API), `privado` (funções e tabelas internas,
  fora da API), `arquivo_teste_20261020` (cópia dos dados de teste apagados
  em 20/10; fechado a anon/authenticated; pode ser descartado quando o
  escritório confirmar que nada faz falta).
- **MCP do Supabase** está ligado nesta máquina: `execute_sql`,
  `get_advisors`, `query_logs` (logs de funções: `function_edge_logs`,
  `function_logs`, `edge_logs`, `postgres_logs`).

### Navegador
- **Claude in Chrome** (Chrome do Ithalo) tem as sessões logadas: Supabase,
  Vercel, Google (contas do Ithalo e **contato@ = `authuser=2`**), registro.br
  (quando ele entra). Abrir aba própria, não mexer nas dele, fechar no fim.
- Senhas são sempre do Ithalo; o Google pede "Confirme que é você" no Cloud
  Console e no Admin.

---

## 4. Mapa do repositório

```
src/                  site (páginas .mjs, partials, data/*.mjs, estilos)
scripts/              build.mjs, dev.mjs (8123), check.mjs, og.mjs, marca.mjs,
                      testar-local.mjs (prévia), validar-banco.mjs (banco:test)
scripts/local/        prévia: banco.mjs (PGlite + PostgREST emulado),
                      previa-banco.mjs (Auth/Storage/funções), semente.sql,
                      djen-ficticio.mjs, google-ficticio.mjs, dados.mjs (mock antigo)
sistema/              SPA (index.html, css/sistema.css, js/)
  js/nucleo/          supabase.js (db.listar/um/inserir/alterar/rpc/funcao),
                      estado.js (membros, permissões), html.js, dialogo.js,
                      formularios.js, avisos.js, erros-banco.js, rotas.js…
  js/dominio/         regras puras e testáveis (agenda, atraso, parcelas, ics,
                      prazos, djen, importacao, extenso…)
  js/telas/           uma tela por arquivo (agenda, inicio=Hoje, membros,
                      financeiro/*, clientes/*, documentos/*, site/*…)
  js/documentos/      modelos jurídicos, recibo, editor estilo Word
  js/escritorio.js    identidade (nome, endereço, e-mail, CONTA_GOOGLE)
  testes/             node --test (*.test.mjs), inclusive o ponta a ponta do Google
supabase/
  migrations/         40 migrações (15/09 → 21/10/2026), aplicadas em produção
  functions/          5 funções de borda (handler.js testável + index.ts)
  testes/             SQL por módulo (pg_temp.t, bloco desfeito no fim)
docs/operacao/        backup-restauracao.md
docs/historico/       especificações originais (citadas pelo código)
LogosNovas/           marca FL vetorizada (arquivos do Ithalo — não commitar o que é dele)
.local/               fora do git: PGlite, prévias geradas, roteiros antigos
dist/                 saída do build (fora do git)
```

---

## 5. Rodar, testar, publicar

### Rodar
- **Site:** `npm run dev` → <http://localhost:8123> (serve site e `/sistema`
  falando com o Supabase de produção — cuidado ao clicar).
- **Prévia do sistema com banco de verdade em memória:** `npm run testar:local`
  → <http://127.0.0.1:8125/__teste> (porta via `PORT_TESTE`; o agente usa
  **8127**, config `previa` em `.claude/launch.json`).
  - PGlite com **todas as migrações**, RLS e gatilhos + `scripts/local/semente.sql`.
  - Perfil pelo endereço: `?perfil=admin | socia | secretaria | sem-clientes |
    clientes-sem-financeiro | consulta | auditoria`.
  - `POST /__teste/restaurar` zera o banco e o Google fictício. Reiniciar a
    prévia também zera, e é preciso **reiniciar para ver código novo** (o
    build vai para `.local/previa/`, compartilhado entre prévias).
  - DJEN, CEP e **Google fictícios**: `GET /__teste/google/__estado`,
    `POST /__teste/google/__evento {calendario, evento}`; "Ligar ao Google
    Agenda" autoriza na hora. **Sem pg_net/pg_cron**: sincroniza pelo botão
    "Atualizar".
  - O painel de prévias do app aceita **no máximo 5 servidores**; mais que
    isso, subir por Bash em segundo plano com `PORT_TESTE`.

### Testar
| Comando | O quê | Hoje |
|---|---|---|
| `npm run sistema:test` | regras JS + ponta a ponta do Google (PGlite + Google fictício) | 189/189 |
| `npm run banco:test [filtro]` | todas as migrações no PGlite + `supabase/testes/*.sql` + ensaio da migração sobre dados antigos | 611/611 |
| `npm run build` / `npm run check` | gera `dist/` / links, âncoras, meta e SEO do site | 19 páginas OK |

- **Navegador automatizado:** Playwright do runtime do Codex
  (`file:///C:/Users/Ithalo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`)
  com o Chrome instalado (`C:/Program Files/Google/Chrome/Application/chrome.exe`),
  headless. Celular: `{ width: 390, height: 844 }, isMobile, hasTouch`.
  Entre rotas, ir para `about:blank` (trocar só o `#` mantém diálogos
  abertos). O painel do navegador do app, oculto, pausa
  `requestAnimationFrame` (animações do site param) — usar headless.
- **Caça a bugs com subagentes** (19/10 e 20/10): um briefing comum em
  arquivo, uma prévia por testador (portas 8131–8137), relatório por agente;
  o modelo maior confere cada achado no código antes de corrigir.

### Publicar (sempre nesta ordem, e só com o "pode publicar")
1. **Banco:** `supabase.exe db push --dry-run` (deve listar só as migrações
   novas) → `db push --yes`.
2. **Funções:** `supabase.exe functions deploy <nome> --use-api`.
3. **Telas:** commit na `main` (só os arquivos da tarefa) → push → conferir o
   deploy (curl acima). O frontend novo pode depender das colunas/funções
   novas — por isso o banco vai primeiro.
4. **Conferir:** `get_advisors` (nada novo de nível ERROR), consultas rápidas
   pelo MCP, logs da função se for o caso.
- Mensagem de commit em português, explicando o porquê; termina com a linha
  `Co-Authored-By` da sessão.

### Escrevendo migração
- **Nunca editar migração aplicada.** Mudança = migração nova
  (`AAAAMMDDHHMMSS_nome.sql`) com cabeçalho numerado ("37 · …") e
  comentário do porquê. Linha na tabela de migrações do `sistema/README.md`.
- Para alterar uma função grande, um script no scratchpad copia a última
  definição da migração anterior e aplica substituições exatas (falha alto se
  o trecho não existir). **Cuidado:** em `String.replace` do JS, `$$` no
  texto de substituição vira `$` — usar `replace(de, () => para)`.
- Teste SQL novo em `supabase/testes/`, no padrão `pg_temp.como(uuid)` /
  `pg_temp.erro(sql)` / `pg_temp.t(ok, nome, detalhe)`, tudo dentro de um
  bloco que termina com `raise exception 'FIM_DOS_TESTES'` (nada fica gravado).

### Armadilhas que já custaram tempo
- **`safeupdate` do Supabase:** UPDATE/DELETE **sem WHERE** falham (400)
  pela Data API, **mesmo dentro de função security definer**. A prévia não
  tem o safeupdate. Tabela de uma linha: `where unica`.
- **Permissões:** `revoke … from public, anon` em toda função nova;
  `grant` explícito só a quem deve. Funções `privado.*` só para
  `service_role`. Os advisors listam ~54 "security definer executável" — é o
  desenho (as RPCs checam permissão por dentro), não alarme.
- **Prévia ≠ produção:** sem pg_net/pg_cron/safeupdate; a CSP da prévia
  bloqueia a API do Banco Central (correção monetária fica zero) — normal.
- **Duas prévias** em portas diferentes dividem `.local/previa/`.
- Na prévia, **abas do mesmo navegador trocam o perfil entre si**
  (`localStorage`): testadores em paralelo "veem" bugs de permissão que não
  existem. Reproduzir o achado numa aba isolada, com a prévia reiniciada,
  antes de aceitar.
- No Bash da ferramenta, heredoc com aspas às vezes quebra; script Python
  grande → criar o arquivo com Write e rodar.
- Google Calendar API: usar `sendUpdates=none` (o sistema nunca manda e-mail
  a cliente); id de evento escolhido `fl` + uuid sem hífens (reenvio não
  duplica).

---

## 6. O sistema, módulo por módulo

Detalhes técnicos de cada um no `sistema/README.md`.

| Módulo | O essencial |
|---|---|
| **Hoje** (`#/inicio`) | Quadro "Seu dia" (compromissos + tarefas numa linha do tempo, "Agora", amanhã ao lado), Financeiro, intimações, contatos, aniversários. Botões rápidos Chegou/Realizado/Faltou/Iniciar atendimento. |
| **Agenda** | Grade semanal (lista no celular), filtro "Todos / Só eu" + chips (lembrado no navegador), particular = "Ocupado" para os outros, conflito com intervalo mínimo, Remarcar (pede nova data; liga antigo↔novo), Voltar para agendado, Exportar .ics, Imprimir, Configurar (admin), **Google Agenda nos dois sentidos** (§8). |
| **Contatos** | Leads do formulário do site (`receber-contato`), com página/campanha/consentimento. |
| **Clientes / Processos** | Cadastro completo, vários contatos, etiquetas, CEP, filiação em mãe e pai; processos CNJ validados. O campo Cliente dos formulários acha por parte do nome, sem acento, e pelo CPF com ou sem pontos. |
| **Documentos** | 8 modelos (procuração, contratos, declaração, ficha de atendimento…), editor estilo Word, imprimir. **Textos jurídicos ainda sem revisão do escritório.** |
| **Atualizações** | Relato de atendimento com **cronômetro** (prova de tempo ao cliente); não se apaga. |
| **Tarefas e Prazos** | Delegação, cores por prazo, prazo em horas, contagem automática sugerida (CPC/CLT/CPP) — sempre com conferência humana. |
| **Intimações / DJEN** | Busca no DJEN **pelo navegador** (a API recusa fora do Brasil), captura diária, conferência → prazo/audiência/tarefa. Feriados em "Feriados e prazos". **Processos que o escritório não acompanha** (os do Marlon): as intimações deles chegam já arquivadas. Filtro por advogado. |
| **Financeiro** | Painel, alertas, recebíveis, em atraso, contratos (C001/AAAA, fixo, êxito, **fixo + êxito**, **encadeado**, **acordo com repasse**), contas do escritório, contas financeiras, fechamento mensal/anual, 9 relatórios (XLSX/CSV), recibos, anexos, importação da planilha antiga. Sem integração bancária (decisão). |
| **Site** | Publicações e campanhas no banco; "Publicar o site" chama o Deploy Hook (salvar ≠ publicar). Provimento 205/2021 lembrado no editor. |
| **Membros** | Perfis e níveis por módulo, convite por e-mail, "Agenda no Google" de cada um (só admin). |
| **Operação e LGPD** | Acessos, erros, cópia, retenção, inatividade (30 min). Sem 2FA (decisão). |
| **Histórico** | Auditoria de tudo; cada módulo vê o próprio; **particular só o dono** (nem quem audita). |

### Regras de domínio que mais importam
- **Dinheiro em centavos inteiros** no frontend; numeric no banco.
- **Acordo:** cota do escritório **por parcela**; divisão sobre o **acumulado**
  da parcela (centavo não se perde em pagamentos parciais).
  `valor` = o que entrou na conta; `valor_direto_cliente` = o que a parte
  contrária pagou direto ao cliente; `valor + valor_direto_cliente =
  principal + encargos`. Multa/juros podem ter **cota própria**
  (`cota_encargos_pct`; vazia = a mesma). Repasse ao cliente é **saída
  própria**, nunca despesa, e fica fora da divisão entre sócios.
- **Atraso:** 10% de multa + 1% a.m. + IPCA (recomendação, a confirmar);
  pagamento parcial abate o saldo antes dos encargos (art. 354 CC diz o
  contrário — a confirmar).
- **Fixo + êxito:** `valor_total` = fixo; êxito apurado vai para
  `valor_exito`. **Encadeado:** 1ª parcela no mês seguinte ao fim do anterior.
- **Remarcado:** não ocupa o horário antigo, não sai no .ics; só se grava
  "remarcado" pela RPC `remarcar_compromisso` (que cria o novo).

---

## 7. Dados em produção (20/10/2026)

- **Membros:** Vinícius (admin), Guilherme e Juliana (sócios), "Ithalo —
  suporte técnico do piloto" (admin), Marlon (inativo).
  Guilherme e Vinícius **já entraram**; **Juliana ainda não** (convite de
  20/10 10h41, link vale até 21/10 ~10h40; reenviar em Membros).
- **Limpeza de 20/10** (rodada pelo Ithalo; script em
  `supabase/manutencao/limpeza-dados-de-teste-20261020.sql`): Financeiro
  zerado (numeração recomeça em C001/2026), testes de 06–13/10 removidos;
  ficaram 40 clientes, 40 processos, 65 intimações do DJEN e o uso real
  desde 15/10. Cópia em `arquivo_teste_20261020`.
- **Google Agenda ligado** em 20/10 às 15h39 (conta contato@): 51 eventos do
  Google importados (Guilherme 22, Juliana 6, Vinícius 23); a única escrita
  no Google foi um bloqueio do Vinícius (22/10). Subagendas de Vinícius,
  Juliana e Guilherme preenchidas em `membros.google_agenda` (IDs só no banco).
- Uma audiência real do Guilherme (06/11) ficou "Remarcado" num teste dele;
  ele mesmo volta com "Voltar para agendado".

---

## 8. Google Agenda (sincronização) — resumo operacional

Código: `supabase/functions/google-agenda/` (`handler.js` = HTTP e
orquestração, `eventos.js` = tradução pura), migrações `2026102018…` a
`2026102023…`. Detalhes em `sistema/README.md` → Agenda.

- **Sistema → Google:** gatilho `y_google` põe na fila
  `privado.google_eventos`; `pg_net` chama a função logo depois; `pg_cron` a
  cada 2 min. Evento na subagenda do responsável; particular = "Ocupado";
  observação interna nunca vai.
- **Google → sistema:** a cada rodada lê as subagendas dos membros ativos (30
  dias atrás → 180 à frente). Novo vira compromisso; mudou → muda; excluído
  → cancela com "Excluído no Google Agenda".
- **Regra pedida pelo Ithalo:** o sistema **só escreve no Google os eventos
  que ele criou**. O que nasceu no Google (reservas, eventos dos advogados)
  nunca é alterado/excluído daqui. Cópia manual antiga (mesmo membro, horário
  e título) é **ligada**, não reescrita.
- **Autorização:** refresh token em `privado.google_conexao` (só a função
  lê). Se der `invalid_grant` (acesso revogado), a tela mostra o erro e o
  admin religa em Agenda → Configurar → "Ligar de novo".
- **Novo advogado no futuro:** criar a subagenda dele no contato@, copiar o
  "ID da agenda" e colar em Membros → Editar → "Agenda no Google".
- **Diagnóstico:** `select * from privado.google_conexao` (ultima_sincronizacao,
  ultimo_erro, travado_ate) e `privado.google_eventos` (situacao, erro);
  logs da função pelo `query_logs`.

---

## 9. Linha do tempo (para entender as camadas)

| Data | O que aconteceu |
|---|---|
| 04/09/2026 | Preparação de design do site (`docs/historico/preparacao-ied-legal.md`), antes da reunião |
| 11/09 | Reunião com o Vinícius (transcrição em `../Advocacia contexto/`) |
| 15–16/09 | Área dos advogados (Agenda, Financeiro, Site) e união com o site num deploy |
| 24/09 | Revisão de design e bugs do site |
| 29/09 | **No ar** na Vercel; logo FHL |
| 05–06/10 | E0/F1–F8 (Contatos, Clientes, Documentos, Atualizações, Tarefas, Intimações manuais, Avisos, Agenda manual) — em produção |
| 08–09/10 | Financeiro do DOCX (T01–T17), DJEN, Operação/LGPD, marca **FL** — em produção |
| 11/10 | Red team (8 subagentes) e correções (`docs/historico/RELATORIO-RED-TEAM-1110.md`) |
| 12–13/10 | Hoje "Seu dia"; peixinho (marca antiga) retirado do site |
| 15/10 | **Começa o uso real** pelos advogados |
| 19/10 | Pedidos do grupo: e-mail contato@, Criminal/Imobiliário, fixo+êxito, encadeado, acordo com repasse; caça a bugs 1; domínio `advocaciafl.com.br` |
| 20/10 | Respostas dos advogados (direto ao cliente, cota de encargos); limpeza dos dados de teste; convites; DNS de e-mail; Search Console; **Google Agenda nos dois sentidos**; Remarcar; caça a bugs 2 + revisão de design |
| 21/10 | Pedidos do grupo: campo Cliente com busca por nome/CPF, processos que o escritório não acompanha (intimações do Marlon), filiação em mãe e pai (migração 38; `sistema/README.md` → Pedidos dos advogados) |

---

## 10. Pendências

### Do Ithalo (segurança — só ele pode)
1. **Trocar a senha de app do Gmail** dele (apareceu num print) e colar a nova
   no Supabase → Authentication → SMTP.
2. **Trocar a senha dele no sistema** (foi escrita no chat).
3. Ativar **Leaked password protection** (Supabase → Authentication).
4. Revisar as **22 sessões abertas** do contato@ (Google → Segurança →
   Seus dispositivos).
5. Reconsiderar a **verificação em 2 etapas** do contato@ (protege agenda,
   e-mail e Google Cloud; e é pré-requisito para mandar os e-mails do sistema
   pelo contato@ em vez do Gmail do Ithalo).

### Do agente, quando chegar a hora
- Juliana entrou → **voltar a validade do link para 3600 s**.
- Remetente do SMTP → contato@ (depois da 2 etapas e de uma senha de app do
  contato@, colada pelo Ithalo).
- **Cópia de segurança** diária (desenhada em `docs/operacao/`, não ativa):
  precisa de destino e segredos.

### Decisões do escritório (implementado pela recomendação; confirmar)
- Pagamento parcial em atraso: multa recalculada sobre o saldo restante ×
  multa cheia; encargos não pagos ao quitar o saldo deixam de ser cobrados
  (a tela avisa) × continuam em aberto; imputação (art. 354 CC).
- Critério de atraso (10% + 1% a.m. + IPCA); divisão igual entre sócios
  depois das despesas; prefixo "C"; fechamento anual só com 12 meses fechados.
- **Revisão jurídica dos 8 modelos de documento** (não usar com cliente real
  antes).
- Textos de **Criminal** (Vinícius) e **Imobiliário** (Guilherme); o Cível
  cede "posse/usucapião" e "locação" ao Imobiliário?
- Contrato encadeado começar no mês seguinte ao último vencimento.
- **Filiação antiga** (24 cadastros com o texto "MÃE / PAI" num campo só) não
  foi dividida sozinha — a ordem varia. Separa-se com um clique em Editar
  dados; a ficha mostra "Filiação (cadastro antigo)" até lá.
- "Não acompanhar" é **por processo**, não pelo advogado que saiu (filtrar
  pela OAB do Marlon esconderia processos do escritório). Quem marca informa o
  motivo; as intimações seguem guardadas em Arquivadas.
- Página de agendamento do **Marlon** (ainda ativa no Google).
- Grafia "Vinicius" (site) × "Vinícius" (sistema).
- Pendências antigas do CLAUDE.md §7/§10: OAB da sociedade e CNPJ, anos de
  atuação, redes sociais, Portuário como área, "Escritório Virtual",
  avaliações do Google × Provimento 205, fotos da equipe (código pronto),
  arquivo vetorial original da logo, licença da fonte Galano Grotesque.
- Antes de uso comercial pleno: **Vercel Pro** (Hobby é não comercial) e
  Supabase Pro (backup).

### Ideias boas que ficaram para depois (vieram dos testadores)
- Hoje: cartão "Próximo compromisso" com Ligar / WhatsApp / Iniciar.
- Novo compromisso: campos raros em "Mais opções"; sugerir próximo horário livre.
- Financeiro no celular: contratos e parcelas em cartões (hoje tabela com
  rolagem lateral); no "Receber", a escolha "Como a parte contrária pagou"
  logo depois do valor.
- Histórico: mostrar "Google Agenda" em vez de "Sistema" nas mudanças da
  sincronização.
- Vocabulário: "Retorno" é tipo em Configurar e modalidade no formulário.
- Feriados estaduais/municipais/do tribunal ainda só cadastrados à mão.
- Importação real da planilha antiga quando o escritório mandar o arquivo.

---

## 11. Documentos arquivados (`docs/historico/`)

| Arquivo | O que é |
|---|---|
| `preparacao-ied-legal.md` | Preparação de design do site (04/09). Base do `README.md`. |
| `preparacao-area-dos-advogados.md` | Proposta da fase 2 (Agenda §7, Permissões §5.2, Financeiro §6). Citada no código como "preparação X.Y". |
| `preparacao-novas-funcoes.md` | Especificação de E0/F1–F9 (05/10). Citada pelas migrações de 05/10 e pelo teste de prazos. |
| `relatorio-especificacao-financeira.md` + `preparacao-financeiro-docx.md` | Especificação do Financeiro do DOCX (T01–T17). Citadas pelas migrações `20261008*`. |
| `preparacao-pedidos-advogados.md` | Pedidos do grupo de 19/10 e decisões D1–D9. |
| `RELATORIO-RED-TEAM-1110.md` | Achados do red team de 11/10 (citado pela migração `20261011120000`). |

Removidos por estarem superados (estão no git, se precisar):
`HANDOFF-FINANCEIRO-DJEN.md`, `HANDOFF-PRODUCAO-FHL.md`,
`handoff-area-dos-advogados.md`, `handoff-novas-funcoes.md`,
`handoff-fhl-site-publico.md`, `TESTAR-NOVAS-FUNCOES.md`,
`REVISAO-NOVAS-FUNCOES.md`, `REVISAO-FINANCEIRO-DJEN.md`,
`AJUSTES-TAREFAS-DOCUMENTOS-FHL.md`, `CORRECOES-DOCUMENTOS-FHL.md`,
`CORRECOES-ERROS-FHL.md`, `GUIA-NOVAS-FUNCOES-FHL.md`.
Para ver um deles: `git log --all -- <arquivo>` e `git show <commit>:<arquivo>`.
