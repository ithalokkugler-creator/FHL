# Preparação — pedidos dos advogados de 12/11/2026

Documento de preparação para quem for **implementar** (modelo Opus 5.5). Quem
escreveu (Fable 5.2, 12/11/2026) **não implementou nada**: leu a
documentação, o código e consultou produção **somente para leitura**.

Os pedidos, em resumo (mensagem de um dos advogados no grupo):

1. Contratos: quantos foram fechados no mês; filtro de 3/4/5/6/12 meses com
   total e média — **na própria tela**, sem painel novo.
2. Clientes: total cadastrado e novos no mês/período.
3. Processos: total, adicionados no mês, e ativos/suspensos/encerrados.
4. Agenda: vários lembretes no mesmo compromisso ("Adicionar lembrete").
5. Menu lateral recolhível no computador.
6. Tarefas: cronômetro ao "Iniciar tarefa", com pausar, retomar e finalizar;
   tempo total no histórico.
7. Tarefas: tabela em colunas (referência: a tela de prazos do Projudi),
   ordenar por prazo/responsável/situação, destaque de vencimento.
8. Processos: vários clientes no mesmo processo, cada um com a sua condição.
9. Sessão "desconecta muito rápido": 60 minutos e aviso antes de sair.
10. Notificações no canto da tela e na barra de notificações do computador.

---

## 0. Antes de começar

1. Ler, nesta ordem: `CLAUDE.md` → `HANDOFF.md` → `sistema/README.md`.
2. Regras que valem para tudo aqui (HANDOFF §2 e §5):
   - **Nada de commit, push, `db push` ou deploy de função sem o "pode
     publicar" do Ithalo** para aquele pacote. Um "pode" não vale para o
     pacote seguinte.
   - Testar só na prévia local (`npm run testar:local`; o agente usa a porta
     **8127**). Reiniciar a prévia para ver código novo.
   - Migração aplicada **nunca se edita**: migração nova, numerada (a
     próxima é a **46**), com cabeçalho e o porquê. Linha nova na tabela de
     migrações do `sistema/README.md`.
   - Ordem de publicação: banco → funções de borda → telas.
   - Antes de `db push`: conferir que ninguém está usando (auditoria dos
     últimos 30 min, cronômetros abertos, `auth.sessions`). Os advogados
     deixam abas abertas: **toda mudança de banco tem de continuar aceitando
     a tela velha** que ainda está no navegador deles.
   - `revoke … from public, anon` em toda função nova; UPDATE/DELETE sempre
     com WHERE (`safeupdate`); nada de `style=""` (CSP) — usar `data-vars`.
   - Ação nunca é texto solto: `botao botao--pequeno botao--discreto`.
     Tabela de trabalho vira cartão no celular (`.tabela--cartoes`).
   - Nada se apaga: tabela nova usa `privado.aplicar_padrao()`, cancelamento
     com motivo (`privado.registrar_cancelamento`) e entra em
     `privado.pode_ver_auditoria()` — a **última** versão dessa função está
     em `20261022120000_antecipacao_documentos_processo.sql:485`. O molde
     completo de "tabela nova" é `processos_documentos`, na mesma migração.
   - Função grande se altera copiando a última definição e aplicando
     substituições exatas (HANDOFF §5; cuidado com `$$` em `String.replace`).
3. Como o cliente pensa (CLAUDE.md §2): quer **prova**, aceita trabalho
   manual, mede tudo em custo. **Nenhum item abaixo cria custo mensal.**
4. Ao terminar cada pacote: atualizar `HANDOFF.md` e `sistema/README.md`
   (não criar arquivo novo na raiz).

### Estado conferido em 12/11/2026 (produção, somente leitura)

| Item | Valor |
|---|---|
| Migrações aplicadas | 45; a última é `20261111120000_areas_atuacao` |
| Clientes | 104 (101 ativos) — cadastrados: set = 1, out = 94, nov = 9 |
| Processos | 96 — em andamento 80, aguardando documentos 2, em análise 1, suspenso 1, encerrado 12 — cadastrados: out = 88, nov = 8 |
| CNJ repetido em mais de um cliente | **3 números, 7 linhas** de `processos` |
| Tarefas | 41 — pendentes 15, concluídas 23, o resto canceladas; **nenhuma "em andamento"** |
| Contratos | 19, todos com `data_contrato`; 7 formalizados em out/2026 |
| Compromissos | 123; 35 com `lembrete_minutos` |
| Inatividade | `config_seguranca.inatividade_minutos = 30` |
| Erros das telas (`erros_cliente`) | nenhum nos últimos 30 dias |

---

## 1. Resumo e ordem sugerida

| # | Pedido | Banco | Risco | Pacote |
|---|---|---|---|---|
| 1 | Contratos: fechados por mês e média | não | muito baixo | A |
| 2 | Clientes: total e novos no período | não | muito baixo | A |
| 3 | Processos: total, novos, por situação | não | muito baixo | A |
| 5 | Menu lateral recolhível | não | baixo | A |
| 9 | Sessão: 60 min e aviso antes de sair | 1 valor | baixo | A |
| 7 | Tarefas: tabela em colunas e ordenação | 1 coluna numa view | médio-baixo | B |
| 6 | Tarefas: cronômetro com pausa | tabela + RPCs + view | médio | B |
| 10 | Notificações na tela e no computador | não | médio-baixo | C |
| 4 | Agenda: vários lembretes | coluna + 5 funções + função Google | **alto** | C |
| 8 | Processo com vários clientes | tabela + 4 gatilhos + ~12 telas | **o mais alto** | D (sozinho) |

Um pacote por vez, cada um com o seu "pode publicar". O pacote D não se
mistura com nenhum outro. Dentro do C, a notificação (10) vem **antes** dos
lembretes (4) — ver 4.1.

---

## 2. Pacote A — sem risco para os dados

### 2.1 Indicadores em Contratos, Clientes e Processos (pedidos 1, 2, 3)

**Hoje:** nenhuma das três telas mostra contagem por período. Contratos
mostra só "N contratos no filtro" (`telas/financeiro/contratos.js`, função
`tabela`) e é paginada no servidor. Clientes (`telas/clientes/lista.js`) e
Processos (`telas/processos.js`) carregam a lista inteira com `db.todos` e
filtram na tela.

**Proposta:** uma faixa de indicadores no alto de cada tela, com o que já
existe — `indicador()` de `telas/comum.js` dentro de
`<div class="indicadores">`, como no Painel do Financeiro. O pedido é
explícito: **não é um painel novo**.

- Regra pura num arquivo novo, `sistema/js/dominio/indicadores.js`:
  `contarPorMes(lista, pegarData, { meses, hoje })` → lista mês a mês, total
  do período e média mensal (total ÷ nº de meses, uma casa decimal). O mês é
  o de Brasília: usar `noFuso()`/`hoje()` de `nucleo/formato.js`, nunca
  `new Date` cru. Para `data_contrato` (data de calendário, `AAAA-MM-DD`)
  não há fuso: comparar o texto.
- Seletor de período: "Este mês", 3, 4, 5, 6 e 12 meses, guardado na URL com
  `guardarConsulta`, como os outros filtros da tela.
- **Contratos:** data = `data_contrato` (formalização); cancelado
  (`cancelado_em`) fica de fora. Não usar `v_contratos` (view pesada, tela
  paginada): ler a tabela `contratos` com
  `select: 'id,data_contrato,data_contrato_origem,criado_em,cancelado_em'`.
  Conferido: `authenticated` tem SELECT em `contratos`
  (`20260915194302_financeiro.sql:1169`), sujeito à RLS do Financeiro — a
  tela já exige `pode.financeiro`. Mostrar: fechados neste mês · total do
  período · média mensal · linha pequena mês a mês.
  Contrato com formalização "a confirmar" (`data_contrato_origem =
  'a_confirmar'`) hoje não existe em produção; se aparecer, contar à parte
  ("N sem data confirmada"), não pelo `criado_em`.
- **Clientes:** total de ativos (inativos em nota) + novos no período, por
  `clientes.criado_em`. A lista já está em memória.
- **Processos:** total · novos no mês (`criado_em`) · **ativos** ·
  suspensos · encerrados. "Ativos" = tudo que não é `suspenso` nem
  `encerrado` (em análise, aguardando documentos, contrato enviado, em
  andamento), com a quebra na nota. Cada indicador vira link para o filtro
  (`indicador(..., { href: '#/processos?situacao=suspenso' })`).
  Os indicadores contam **o escritório inteiro**, não o filtro da tela —
  dizer isso no rótulo ("No escritório") para não confundir com a lista.

**Avisar o Ithalo — vai aparecer na tela:** 94 dos 104 clientes e 88 dos 96
processos foram **cadastrados em outubro**, quando o escritório começou a
usar o sistema. "Novos em outubro" mostra esse pico: é a data do cadastro
no sistema, não a data em que a pessoa virou cliente. Pôr a nota "contado
pela data do cadastro no sistema". Contratos não têm o problema (usam a
data de formalização, que vem desde 2025).

**Arquivos:** `dominio/indicadores.js` (novo), `telas/financeiro/contratos.js`,
`telas/clientes/lista.js`, `telas/processos.js`, `css/sistema.css` (se
precisar), `testes/indicadores.test.mjs` (novo).
**Testes:** virada de mês e de ano, mês sem nenhum, 23h de 31/10 em
Brasília, média com mês zerado, contrato cancelado fora, período de 12
meses cruzando o ano.

### 2.2 Menu lateral recolhível (pedido 5)

**Hoje:** `.casca` é uma grade `var(--lateral-l) 1fr` (236 px;
`sistema.css` ~192). Abaixo de 900 px a lateral vira gaveta: aparece o
`.topo-movel` (botão Menu, marca, lupa e o cronômetro) e
`.casca.menu-aberto` abre a gaveta (`app.js`, ação `menu`; CSS ~324–365).

**Proposta — a mais barata e a que o pedido descreve ("como no celular"):**
botão "Recolher menu" na lateral e a classe `menu-recolhido` na `.casca`.
Recolhido, o computador se comporta como o celular: topo com "Menu" e
gaveta por cima do conteúdo. Dentro da gaveta, "Fixar menu" volta ao
normal. Preferência por navegador em `localStorage`
(`fhl.menu-recolhido`), com try/catch como em `nucleo/inatividade.js`.

**Cuidados:**
- As regras do modo celular estão espalhadas em vários
  `@media (max-width: 900px)`: casca/topo/lateral (~324), cronômetro no
  topo (~1927), lupa no topo (~2229), `.ficha-indice` e `[data-secao]`
  (~1613) e `.editor-barra` (~1859). **Todas** precisam valer também para
  `.casca.menu-recolhido` em tela larga — senão o cronômetro some, a barra
  "Ir para" da ficha e a barra do editor ficam debaixo do topo. Preferir
  seletor duplo a copiar blocos inteiros.
- O cronômetro (`.cronometro-global`) **não pode sumir**: ele já tem uma
  caixa no topo (`ligarCronometro` cria uma em `.lateral__rodape` e outra em
  `.topo-movel`). Os contadores do menu só aparecem com a gaveta aberta
  (aceitável, é igual ao celular).
- `fecharMenu()` roda a cada troca de rota: continua valendo.
- Atalho opcional: `Ctrl+B`/`⌘B` (conferir se não colide com o negrito do
  editor de documentos — lá o foco está em `contenteditable`; se colidir,
  não pôr atalho).

**Arquivos:** `app.js`, `css/sistema.css`. Sem banco.
**Testes:** Playwright em 1366×768 e 1920×1080: recolher, navegar,
recarregar (lembra), cronômetro visível, ficha do cliente, editor de
documento, impressão; e 390×844 sem mudança nenhuma.

### 2.3 Sessão que "desconecta rápido" (pedido 9)

**O que existe (`nucleo/inatividade.js`):** sem clique, tecla, roda do
mouse, toque ou digitação **dentro da aba do sistema** por N minutos, a tela
sai (`sair()`). N vem de `config_seguranca.inatividade_minutos` — **30 em
produção**. Já existe o aviso um minuto antes, com "Continuar conectado".

**Diagnóstico (conferido nos registros do Auth, 11/11 16h30 → 12/11 15h30
UTC):**
- 15 entradas com senha, 13 saídas, 8 renovações de acesso — **todas com
  sucesso; nenhuma falha de renovação**. `erros_cliente` vazio em 30 dias.
  Não é defeito de sessão/token (`renovar()` em `nucleo/supabase.js` está
  funcionando).
- As saídas acontecem **~30 min e meio depois da entrada**, e em minuto
  cheio (12:43:00, 14:22:00, 15:29:00, 22:06:00…). Minuto cheio é o sinal
  de aba em segundo plano: o navegador só deixa o relógio da página rodar
  uma vez por minuto quando a aba não está na frente.
- Leitura: a pessoa entra, usa o sistema por um instante e vai trabalhar em
  outra janela (Projudi, Word, WhatsApp). Para o sistema isso é
  inatividade: em 30 minutos sai, **sem que ninguém veja o aviso** (a aba
  está escondida). Em dois casos a pessoa entrou de novo segundos depois da
  saída. Em um dia foram 5 entradas por advogado, em média.
- Página web não enxerga o que acontece fora dela: não há como contar "está
  trabalhando no Word" como atividade.

**Proposta:**
1. Padrão **60 minutos** (o pedido). Migração pequena: `alter table … alter
   column inatividade_minutos set default 60` e `update
   public.config_seguranca set inatividade_minutos = 60 where
   inatividade_minutos = 30` (com WHERE). Continua ajustável em Operação e
   LGPD (5 a 480 min) — o administrador pode pôr mais.
2. Aviso **5 minutos antes**, com contagem regressiva e dois botões:
   "Continuar conectado" e "Sair agora".
3. **Aviso que chega com a aba escondida**: piscar o `document.title`
   ("⚠ Sessão termina em 5 min") e, se as notificações do pedido 10 estiverem
   ativadas neste computador, mandar uma notificação — clicar nela traz a
   aba e mantém a sessão. Sem isso o aviso continua invisível justamente no
   caso que gera a reclamação.
4. Contar também `mousemove` dentro da aba (com o mesmo freio de 15 s).
5. **Decisão D-9:** cronômetro aberto (de atendimento ou de tarefa) segura a
   sessão? Recomendação: **sim, por até 3 horas** desde a última interação.
   Cobre atendimento longo e tarefa feita em outro programa, sem deixar a
   sessão aberta para sempre com cronômetro esquecido.
6. Não criar "tolerância" depois do limite (voltar e clicar em continuar):
   anularia a proteção do computador esquecido aberto, que é o motivo da
   regra (DOCX §3).

**Arquivos:** `nucleo/inatividade.js`, `css/sistema.css`
(`.aviso-inatividade`, ~2175), `telas/operacao.js` (texto de ajuda),
migração 46 (só o padrão).
**Testes:** extrair a decisão (parada × limite × cronômetro aberto) para
função pura em `dominio/` e testar; vizinho: `testes/sessao-concorrencia.test.mjs`.
Na prévia, usar limite de 5 min para ver o aviso.

---

## 3. Pacote B — Tarefas

### 3.1 Tabela em colunas (pedido 7)

**Hoje (`telas/tarefas/lista.js`, `tabelaTarefas`):** 5 colunas — Tarefa /
situação · Entrega / fatal · Cliente / processo · Responsável · Ações. A cor
por prazo já existe (`urgenciaTarefa` em `dominio/tarefas.js`: amarelo até 7
dias, vermelho até 2 ou atrasada). A linha abre a descrição ao clicar. No
celular vira cartão (CSS ~2049). A mesma função serve **três telas**:
Tarefas, Prazos (`telas/tarefas/prazos.js`, com `resumo: true`) e a ficha do
cliente (`telas/clientes/cliente.js:303`).

**Referência mandada:** a tela de prazos do Projudi — primeira coluna com
número do processo, parte e vara; depois evento e prazo; datas; "Ver".

**Proposta de colunas:**

| Coluna | Conteúdo |
|---|---|
| Cliente / processo | nº CNJ (ou referência) · **nome do cliente** · vara |
| Tarefa | título, ato, prioridade, duas linhas da descrição |
| Responsável | avatar e nome; "Delegada por…" |
| Datas | criada em · entrega · fatal · etiqueta "em 2 dias" |
| Situação | Pendente / Em andamento / Pausada / Concluída (+ tempo, ver 3.2) |
| Ações | como hoje |

- **Vara:** `v_tarefas` não traz `processos.orgao`. Acrescentar
  `pr.orgao as processo_orgao` **no fim** da lista (`create or replace view`
  só aceita coluna nova no fim). Conferido: a definição vigente é a de
  `20261011120000_correcoes_red_team.sql:80` (a que usa
  `privado.nome_cliente`); nenhuma migração posterior a redefiniu. Depois,
  `COLUNAS_TAREFA` em `dominio/tarefas.js`.
- **Ordenar** por prazo, responsável ou situação: cabeçalho clicável
  (`<button>` dentro do `<th>`, com `aria-sort`), ordem guardada na URL.
  Regra pura `ordenarTarefas(lista, ordem)` em `dominio/tarefas.js` — hoje a
  ordem está embutida no fim de `filtrarTarefas` (por data, depois título);
  manter essa como padrão.
- Acrescentar o filtro **Responsável** na tela (o domínio já aceita
  `f.responsavel`). `SITUACOES_FILTRO` ganha "Pausadas" (3.2).
- O pedido diz: **manter os campos e funções que já existem.** Não tirar: a
  linha que abre a descrição (ajustar `colspan` de 5 para 6); os cartões do
  celular (o CSS usa as classes `tarefa-celula-*`); o modo `resumo` de
  Prazos (data antes do título); os links "Da intimação" e "Bloqueio na
  agenda".
- Largura: hoje `min-width: 860px`, e entre 761 e 1260 px a tabela já rola
  de lado (nota do README, 09/11). Com 6 colunas piora: conferir em 1366 px
  com o menu fixo e recolhido (2.2) e, se preciso, juntar Datas e Situação
  abaixo de 1260 px.

**Arquivos:** `telas/tarefas/lista.js`, `telas/tarefas/prazos.js`,
`telas/clientes/cliente.js`, `dominio/tarefas.js`, `css/sistema.css`
(~1945–2090), `testes/tarefas.test.mjs`, migração (view).

### 3.2 Cronômetro da tarefa (pedido 6)

**Hoje:** "Iniciar" só troca `situacao` para `em_andamento`
(`tarefa-andamento` em `lista.js`); em produção ninguém usa (nenhuma tarefa
em andamento). O cronômetro que existe é o de **Atualizações**
(`telas/atualizacoes/cronometro.js`, tabela `atualizacoes`): exige cliente,
exige acesso a Clientes, um aberto por pessoa, sem pausa. **Não serve** para
tarefa — tarefa pode não ter cliente e é aberta a todos os membros.

**Proposta — tabela própria de períodos:**

```
tarefas_tempos (id, tarefa_id → tarefas, membro_id → membros,
                inicio timestamptz not null, fim timestamptz,
                + carimbos do padrão)
check (fim is null or fim >= inicio)
índice único parcial (membro_id) where fim is null   -- um aberto por pessoa
índice (tarefa_id)
```

- RPCs com a hora do **servidor** (`clock_timestamp()`), como o cronômetro
  atual: `iniciar_tarefa(p_id)` (abre período e põe `em_andamento`),
  `pausar_tarefa(p_id, p_fim default null)` (fecha o período; `p_fim` para
  "esqueci de pausar", entre o início e agora), `finalizar_tarefa(p_id)`
  (fecha e conclui). Retomar = iniciar de novo. Quem pode: o mesmo de
  `podeAlterarTarefa` — autor, responsável ou administrador —, conferido
  dentro da função. A tela não grava direto na tabela (sem GRANT de
  INSERT/UPDATE para `authenticated`; só SELECT, com RLS "todo membro vê",
  como `tarefas`).
- Total = soma dos períodos fechados. Exemplo do pedido: 30 + 20 = 50 min.
- **"Pausada" não vira valor novo de `tarefas.situacao`.** O CHECK aceita só
  pendente / em_andamento / concluida, e mexer nele atinge `v_tarefas`,
  `avisos_do_dia`, filtros, Hoje e as abas antigas. É **derivada**:
  `em_andamento` + tem tempo registrado + nenhum período aberto = "Pausada".
  `v_tarefas` ganha, no fim: `tempo_segundos` (períodos fechados),
  `cronometro_desde` e `cronometro_membro` (período aberto, se houver).
  O filtro "Pausadas" é feito na tela (`filtrarTarefas`).
- Concluir ou cancelar com período aberto (pelos botões antigos ou por aba
  velha): gatilho em `tarefas` fecha o período na mesma transação. Reabrir
  não apaga o tempo anterior.
- `validar_tarefa`: conferido, tem uma definição só
  (`20261005225741_tarefas_prazos.sql:109`). Preferir **gatilho novo** em
  `tarefas` a mexer nela.
- Já existe outra tarefa minha rodando: oferecer "Pausar a tarefa X e
  iniciar esta" (uma transação).
- **Histórico:** em `detalheTarefa`, "Tempo dedicado: 50 min" e a lista dos
  períodos (quem, de–até, duração). Usar `duracao()` de `nucleo/formato.js`.
  A auditoria padrão cobre o resto; pôr `tarefas_tempos` em
  `pode_ver_auditoria` junto de `tarefas` (todo membro).
- **Indicador global:** tarefa rodando precisa aparecer na lateral/topo como
  o cronômetro atual (segunda caixa `.cronometro-global`, com o título da
  tarefa, Pausar e Finalizar), senão a pessoa esquece. Copiar o desenho de
  `ligarCronometro` (interpolar com `performance.now()`, `BroadcastChannel`,
  conferência a cada 15 s), **sem** o `if (!pode.clientes()) return`.
  RPC `meu_cronometro_tarefa()` devolvendo `agora` e o período aberto.
- `nucleo/avisos-do-dia.js`: incluir as RPCs novas em `MUDAM_CONTADORES`
  (finalizar muda o contador de tarefas do menu).
- Hoje (`telas/inicio.js`, `itemTarefa`): mostrar "em andamento há 12 min" /
  "pausada" no item.

**Decisões:**
- **D-6a:** o tempo da tarefa vira também uma Atualização do cliente (a
  "prova de horas" do CLAUDE.md §4)? Recomendação: **não agora** — a
  atualização tem um início e um fim só, e a tarefa tem pausas. Fica a
  melhoria: ao finalizar tarefa com cliente, botão "Lançar este tempo nas
  Atualizações".
- **D-6b:** cronômetro de atendimento e de tarefa ao mesmo tempo?
  Recomendação: **permitir** (tabelas separadas), mostrando os dois.
- **D-6c:** cronômetro esquecido: avisar depois de 8 h (como o `LONGO` do
  atual) e deixar informar o fim real ao pausar.

**Arquivos:** migração (tabela, RPCs, gatilho, view), teste SQL novo em
`supabase/testes/` (padrão `pg_temp.como` / `pg_temp.t`), novo
`telas/tarefas/cronometro.js`, `telas/tarefas/lista.js`,
`dominio/tarefas.js`, `app.js`, `telas/inicio.js`,
`scripts/local/semente.sql` (uma tarefa com tempo), teste JS.

---

## 4. Pacote C — notificações e lembretes

### 4.1 O ponto que precisa ser dito ao escritório

Hoje o "Lembrete" do compromisso **não é uma notificação do sistema**. É um
número (`compromissos.lembrete_minutos`: 15, 30, 60, 120 ou 1440) que:
- vai para o **Google Agenda** como alerta de popup
  (`supabase/functions/google-agenda/eventos.js`, `reminders.overrides`) —
  quem avisa é o Google, na conta contato@;
- sai no arquivo `.ics` como `VALARM` (`dominio/ics.js`).

O sistema, sozinho, não avisa ninguém. Então o pedido 4 ("quatro
notificações independentes") só se cumpre de verdade **junto com o pedido
10** — por isso o 10 vem primeiro. E evento que **nasceu no Google**
(reserva de cliente, evento criado lá) nunca é reescrito pelo sistema (regra
do Ithalo, HANDOFF §8): lembrete posto aqui nesses eventos só vale para a
notificação do próprio sistema.

### 4.2 Notificações no canto da tela e do computador (pedido 10)

**Proposta — sem servidor:**
- Novo `nucleo/notificacoes.js`, ligado em `desenharCasca()` e desligado em
  `mostrarEntrada()` (mesmo ciclo de `ligarInatividade`). A cada ~30 s
  confere o que venceu:
  - lembretes dos **meus** compromissos (`membro_id` = eu, não mascarados,
    agendados, não cancelados);
  - minhas tarefas: prazo em horas chegando, entrega/fatal hoje (uma vez por
    dia, de manhã) e atrasadas — a classificação já existe em
    `tarefasParaHoje` (`dominio/avisos-do-dia.js`).
- Dois canais: (a) **cartão fixo no canto** do sistema, com "Abrir" e
  "Dispensar" — o `avisar()` de hoje some em 4 s; criar uma variante que
  fica (`nucleo/avisos.js`, área `.avisos`); (b) **notificação do
  computador** (`new Notification(...)`), quando a pessoa autorizou. Clicar
  nela traz a aba e abre a Agenda ou a tarefa.
- A permissão do navegador é pedida **por um botão** em Minha conta
  (`telas/conta.js`, novo painel "Notificações neste computador"), nunca
  sozinha ao abrir. Mostrar o estado (ativadas / bloqueadas no navegador —
  e como desbloquear) e um botão "Testar".
- Não repetir entre abas nem depois de recarregar: registrar o que já foi
  avisado em `localStorage` (chave por compromisso + minutos; limpar o que
  passou) e decidir "quem avisa" com `navigator.locks`, como a sessão faz.
- Dados: `agenda_periodo` aceita até 62 dias; buscar de hoje a +8 dias (para
  o lembrete de 1 semana), refazer a cada 5 min e quando `fhl:gravou`
  trouxer `compromissos` ou RPC da agenda. Até o pedido 4 existir, usar
  `lembrete_minutos`; depois, `lembretes`.
- A API de notificação não é barrada pela CSP nem pelo `Permissions-Policy`
  do `vercel.json`. Ícone: `/sistema/img/favicon.png`.
- Texto da notificação: tipo, hora e título/cliente. Só os **meus**
  compromissos — particular de outro nunca aparece.

**Limite que tem de ficar claro para os advogados:** funciona com o sistema
**aberto em alguma aba** (pode estar em segundo plano ou minimizado). Com o
navegador fechado, ou depois da saída por inatividade, não chega nada — e é
aí que o item 2.3 ajuda (60 min, cronômetro segura a sessão). Avisar com
tudo fechado exige Web Push (service worker, chaves, função de borda,
agendador e mudança na CSP): outro projeto; **não fazer agora**. Quem usa o
Google Agenda continua recebendo o popup do Google com o sistema fechado.

**Arquivos:** `nucleo/notificacoes.js`, `dominio/notificacoes.js` (regra
pura: "dado agora, os compromissos, as tarefas e o que já foi avisado, o
que dispara?"), `nucleo/avisos.js`, `telas/conta.js`, `app.js`,
`css/sistema.css`, teste novo. Sem banco.

### 4.3 Vários lembretes no mesmo compromisso (pedido 4)

**Onde `lembrete_minutos` aparece hoje (conferido; a coluna "versão
vigente" é a que deve ser copiada):**

| Lugar | Versão vigente |
|---|---|
| Coluna com CHECK `in (0, 15, 30, 60, 120, 1440)` e GRANTs de insert/update | `20260915195203_agenda.sql:62, 234–239` |
| `agenda_periodo()` — devolve a coluna | `20260915195203_agenda.sql:171` (única) |
| `lancar_audiencia_intimacao()` | `20261006113406_…:3` |
| Gatilho `privado.google_marcar()` — decide se reenvia ao Google | `20261020200000_…:149` (única) |
| `google_agenda_pendencias()` | `20261020200000_…:386` (única) |
| `remarcar_compromisso()` — copia para o novo horário | `20261020220000_…:46` (única) |
| Corpo do evento do Google | `supabase/functions/google-agenda/eventos.js:55` |
| `.ics` | `sistema/js/dominio/ics.js:57` |
| Formulário e lista `LEMBRETES` | `sistema/js/telas/agenda.js:39, 773, 898` |
| Testes e prévia | `testes/google-agenda.test.mjs`, `testes/ics.test.mjs`, `scripts/local/agenda.mjs` |

**Proposta:**
- Coluna nova `compromissos.lembretes integer[] not null default '{}'`:
  até **5** valores distintos, cada um entre 0 e 40320 minutos. São os
  limites da API do Google Agenda, conferidos na documentação
  (`reminders.overrides[]`: "The maximum number of override reminders is 5";
  `minutes`: "between 0 and 40320 (4 weeks in minutes)"). 1 semana = 10080.
- A coluna antiga **fica** (abas antigas e a função de borda antiga a
  usam). A migração preenche `lembretes` a partir dela (35 linhas). Gatilho
  de compatibilidade (antes do `c_validar`): se `lembrete_minutos` mudou e
  `lembretes` não, `lembretes := array[lembrete_minutos]` (ou `'{}'` quando
  nulo/zero). **Não** espelhar de volta valores que o CHECK antigo recusa
  (10, 10080): `lembrete_minutos` passa a ser só o campo da tela velha.
- `agenda_periodo` muda o tipo de retorno → `drop function` + `create` +
  **refazer `revoke`/`grant`**, tudo na mesma migração (transação). Coluna
  nova no fim; aba antiga ignora.
- `google_marcar`: acrescentar `lembretes` à comparação. O preenchimento da
  migração dispararia o gatilho para as 35 linhas (UPDATE em `compromissos`)
  e as poria na fila do Google. O reenvio é idempotente (id `fl…`), mas
  evitar: fazer o preenchimento com `set_config('fl.google', 'aplicando',
  true)` — é o sinal que o próprio gatilho já respeita — e voltar o valor
  depois. Dizer no relatório o que foi feito.
- Google: `overrides` com um `{ method: 'popup', minutes }` por lembrete;
  sem lembretes → `useDefault: true`, como hoje. Os alertas valem para o
  usuário autenticado (a conta contato@, que todos compartilham).
  `.ics`: um `VALARM` por lembrete.
- Tela: lista com **"Adicionar lembrete"**; cada linha tem quantidade +
  unidade (minutos, horas, dias, semanas) e "Remover"; atalhos de um clique
  para 10 min, 1 h, 1 dia e 1 semana (o exemplo do pedido). Editar um não
  mexe nos outros. O 6º lembrete é recusado com mensagem. Compromisso de
  dia inteiro: conta a partir da 0h do primeiro dia — dizer na ajuda.
  Trocar a ajuda atual ("o alerta vai junto para o Google") por uma que
  fale também da notificação do sistema (4.2).
- `editarCompromisso` também é chamado por Intimações ("Lançar audiência",
  com `salvar`): o registro passa a levar `lembretes`.

**Publicação:** banco → `functions deploy google-agenda --use-api` → telas.
A sincronização roda a cada 2 minutos em produção: a função **antiga**
precisa continuar funcionando com a pendência que traz uma chave a mais, e a
**nova** precisa aceitar pendência sem `lembretes` (cair em
`lembrete_minutos`). Depois de publicar: `select * from
privado.google_conexao` (`ultimo_erro`) e `privado.google_eventos` com
`situacao = 'erro'` (HANDOFF §8); conferir um compromisso de teste do
Ithalo no Google com os 4 alertas.

**Testes:** `google-agenda.test.mjs` (corpo com 0, 1, 4 e 5 lembretes;
ponta a ponta com o Google fictício), `ics.test.mjs`, SQL novo
(`agenda-google.sql` é o vizinho): limite de 5, repetido, fora da faixa,
aba antiga gravando só `lembrete_minutos`, remarcar copia, audiência da
intimação leva, particular alheio continua mascarado em `agenda_periodo`.

---

## 5. Pacote D — processo com vários clientes (pedido 8)

### 5.1 Como é hoje

- `processos.cliente_id` é **obrigatório e fixo** (não há GRANT de UPDATE
  nessa coluna). Índice único `(cliente_id, numero)`.
- O mesmo CNJ pode existir em clientes diferentes, mas como **linhas
  separadas** de `processos` (o formulário pede "Confirmo: é o mesmo
  processo, com mais de uma parte atendida pelo escritório" —
  `telas/processos.js:109, 139`). É a duplicação de que o advogado reclama.
  Em produção: **3 números em 7 linhas**.
- O banco confere "o processo é deste cliente" em **quatro funções-gatilho**
  (conferido; versão vigente indicada):

| Tabela | Função | Versão vigente |
|---|---|---|
| `documentos` | `privado.validar_documento()` | `20261008120600_anexos_recibos.sql:283` |
| `atualizacoes` | `privado.validar_atualizacao()` | `20261005212642_atualizacoes.sql:56` (única) |
| `tarefas` | `privado.validar_tarefa()` | `20261005225741_tarefas_prazos.sql:109` (única) |
| `intimacoes` | `privado.validar_intimacao()` | `20261005225750_intimacoes.sql:57` (única) |

  Também dependem do cliente do processo, e **podem ficar como estão**:
  `importar_intimacoes` (`20261021120000_…:240`; liga pelo número só quando
  há **exatamente um** processo e pega o cliente dele) e
  `privado.validar_documento_processo()` (`20261022120000_…:403`; o cliente
  do documento solicitado vem do processo).
- Nas telas, o vínculo aparece como `p.cliente_id === …` ou filtro
  `['cliente_id', 'eq', id]`:

| Arquivo | Uso |
|---|---|
| `telas/clientes/cliente.js:238` | processos da ficha (`filtros: doCliente`) |
| `telas/clientes/lista.js` + `dominio/clientes.js` `agruparProcessos`, `filtrarClientes` | "processos abertos", filtros por área/situação |
| `dominio/clientes.js` `buscarClientes` (:210), `filtrarProcessos` (:299) | busca por número; busca de processos pelo nome do cliente |
| `telas/processos.js` (:63, :84, :141, :268) | coluna Cliente, cliente fixo na edição, aviso de CNJ repetido |
| `telas/atualizacoes/formulario.js:42` (`ligarProcesso`), `lista.js:165`, `relatorio.js:61` | processos do cliente escolhido |
| `telas/tarefas/formulario.js:133` | idem |
| `telas/documentos/novo.js` (:127, :131, :187) | idem, e "o processo não pertence ao cliente" |
| `telas/intimacoes.js` (:48, :170–177) | idem, e sugestão pelo número |
| `dominio/busca.js:69`, `telas/busca-rapida.js:70` | processo → abre a ficha do cliente |
| `telas/inicio.js:563` | documentos aguardando retorno |

- Contratos e compromissos guardam o processo como **texto**, não como
  vínculo: não são afetados.

### 5.2 Proposta — acrescentar, sem trocar o que existe

Manter `processos.cliente_id` como **cliente principal** (nada do que existe
muda de sentido) e criar as partes adicionais:

```
processos_partes (id, processo_id → processos, cliente_id → clientes,
                  posicao text (até 60), observacao text,
                  cancelado_em/por/motivo + carimbos do padrão)
índice único (processo_id, cliente_id) where cancelado_em is null
gatilho: a parte não pode ser o cliente principal do processo;
         processo e cliente precisam existir; cliente ativo ao incluir
```

- Permissões como as de `processos`: todo membro ativo lê; grava quem edita
  Clientes (`privado.edita_clientes()`). `aplicar_padrao`, auditoria (em
  `pode_ver_auditoria`, junto de `processos`), sem DELETE — retirar uma
  parte é cancelar com motivo.
- Função `privado.processo_do_cliente(p_processo uuid, p_cliente uuid)`:
  verdadeiro se o cliente é o principal **ou** parte ativa. As quatro
  funções da tabela acima trocam `cliente_id = new.cliente_id` por ela. Em
  `validar_intimacao`, manter a conferência do número.
  Função `stable`, `security definer`, `search_path = ''`, sem EXECUTE para
  `anon`/`public`.
- **Parte cancelada com coisas já ligadas a ela** (tarefa, atualização,
  documento daquele cliente naquele processo): o gatilho só confere em
  INSERT/UPDATE, então o que existe continua, mas editar depois falharia.
  Recomendação: recusar o cancelamento da parte enquanto houver tarefa
  aberta dela no processo, e avisar o resto.
- Posição de cada pessoa: a do principal continua em
  `processos.posicao_cliente`; a das outras, em `processos_partes.posicao`.
  Acrescentar a `POSICOES_CLIENTE` (`dominio/clientes.js:38`), no grupo
  "Outros": Herdeiro(a), Inventariante, Meeiro(a) — o pedido cita herdeiro
  e inventariante; hoje só entram por "Outra…".
- Telas:
  - Formulário do processo: bloco **"Partes representadas"** com "Adicionar
    mais partes representadas" (o `campoCliente` já acha por nome/CPF e
    permite cadastrar "Novo") e a posição de cada uma (o mesmo
    `campoPosicao`). Gravar processo + partes numa transação: RPC
    `salvar_processo(p jsonb)` (molde: `salvar_cliente`), que devolve o
    processo. A edição continua sem trocar o cliente principal.
  - Uma função única `processosDoCliente(processos, partes, clienteId)` em
    `dominio/clientes.js` substitui todos os usos da tabela de 5.1.
    `agruparProcessos` passa a agrupar também pelas partes.
  - Lista de Processos: a coluna Cliente mostra o principal e "+ 4"; a busca
    acha por qualquer parte; os indicadores (2.1) contam **processos**, não
    partes.
  - Ficha de cada cliente vinculado: o processo aparece marcado "em
    conjunto com Fulano e mais 3" e com a posição **dele**.
  - Aviso de CNJ repetido: em vez de só pedir confirmação, oferecer
    "Adicionar este cliente como parte do processo que já existe".
- A prévia: `scripts/local/semente.sql` ganha um inventário com 3 herdeiros.

### 5.3 O que NÃO fazer

- **Não juntar sozinho as 7 linhas duplicadas.** Cada uma pode ter tarefas,
  documentos, atualizações, intimações e documentos solicitados próprios, e
  "nada se apaga". Listar os 3 números para o escritório e deixar como
  está. Unificação, se pedirem, é ferramenta à parte, com conferência
  humana e "fotografia" antes e depois.
- Não tornar `cliente_id` opcional nem mover o principal para a tabela
  nova: obrigaria a reescrever tudo o que lê `processos`, inclusive
  `importar_intimacoes` e os documentos do processo.
- Não mexer em `importar_intimacoes`: com um processo só por número (o
  objetivo deste pedido), ele volta a ligar a intimação sozinho — hoje,
  nos 3 números duplicados, ele não liga (há mais de um).

### 5.4 Decisões

- **D-8a:** tarefa, atualização e documento de um processo com várias
  partes ficam ligados a **um** cliente (o escolhido no formulário), como
  hoje. Recomendação: sim.
- **D-8b:** intimação de processo com várias partes: a sugestão continua
  sendo o cliente principal. Recomendação: sim.
- **D-8c:** gerar documento (procuração, contrato) para várias partes de
  uma vez. Recomendação: fora deste pacote.
- **D-8d:** trocar o cliente principal de um processo. Recomendação: fora
  (hoje o banco nem permite).
- **D-8e:** contrato de honorários de inventário é de quem? Não muda: o
  contrato continua de um cliente, com o processo em texto.

### 5.5 Testes e publicação

- SQL novo: as quatro funções com principal, parte ativa, parte cancelada e
  cliente estranho; RLS dos perfis da prévia; auditoria; duplicidade; parte
  igual ao principal; `salvar_processo` desfazendo tudo quando uma parte é
  inválida. Rodar `npm run banco:test` inteiro (inclui o ensaio de
  `supabase/testes/migracao/antes.sql` → `depois.sql`).
- "Fotografia" antes e depois da migração, como na migração 40: contagem e
  hash de `processos`, `tarefas`, `atualizacoes`, `documentos`,
  `intimacoes`, `processos_documentos` — tem de dar idêntico, na prévia e em
  produção.
- Aba antiga em produção: continua funcionando, porque nada mudou no que
  ela lê; ela só não enxerga as partes novas.
- Rodar a caça a bugs com subagentes (HANDOFF §5) neste pacote: um para o
  banco, um para as telas com cliente (Tarefas, Atualizações, Documentos,
  Intimações), um para o celular.

---

## 6. Perguntas para os advogados (sem resposta: seguir a recomendação e marcar "a confirmar" no HANDOFF §10)

1. Contratos "fechados no mês" contam pela **data de formalização**? (sim)
2. Processos "ativos" = tudo menos suspenso e encerrado? (sim)
3. Sessão: 60 minutos, e cronômetro aberto segura a sessão por até 3 h? (sim)
4. Notificações só com o sistema aberto bastam por ora? (sim; o Google
   Agenda cobre o resto)
5. O tempo da tarefa deve aparecer para o cliente, nas Atualizações? (não
   agora)
6. Os 3 processos hoje duplicados entre clientes: unificar à mão ou deixar?
   (deixar)

## 7. Limites desta preparação

- Nenhum teste foi rodado e nenhuma tela foi aberta: é leitura de código,
  de documentação e consultas de leitura em produção.
- `telas/clientes/cliente.js`, `telas/tarefas/prazos.js`,
  `telas/inicio.js`, `telas/intimacoes.js`, `telas/documentos/novo.js` e
  `scripts/local/*` foram lidos por trechos, não inteiros. As linhas citadas
  são as de 12/11/2026 (commit `053da9e`): conferir antes de editar.
- O diagnóstico da sessão (2.3) usa um dia de registros do Auth (é o que o
  plano gratuito guarda). O padrão é claro, mas é uma amostra de um dia.
- O atalho `Ctrl+B` do menu e a largura da tabela de tarefas em 1366 px são
  suposições a conferir na tela.
