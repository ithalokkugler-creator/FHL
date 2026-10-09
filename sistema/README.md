# Fonseca Lisboa Advocacia — área dos advogados

Sistema interno do escritório: **Agenda**, **Financeiro** e o **Site** — as
publicações e campanhas que aparecem no site público —, com login
individual, permissão por módulo e histórico de tudo. É o piloto da fase 2
descrita em [`preparacao-area-dos-advogados.md`](../preparacao-area-dos-advogados.md)
— ainda não contratado, rodando nos planos gratuitos do Supabase e da Vercel.

A área **vai ao ar junto com o site**, em `/sistema`, no mesmo deploy e no mesmo
repositório. O site tem um link discreto para ela no rodapé; ela tem "Ver o
site" na lateral e "Voltar ao site" na tela de entrada.

**Histórico de 05/10/2026 · estado daquela entrega:** E0/F1–F4 implementados e testados localmente: níveis de acesso
Clientes/Prazos, Contatos, cadastro completo, processos, documentos e atualizações.
F5/F6 estão parcialmente implementadas com tarefas, prazos manuais, feriados
cadastrados e intimações manuais. Contagem automática, datas móveis e
busca/importação DJEN permanecem pendentes. F7 acrescenta os avisos de Hoje,
aniversários, lembretes e contadores conforme o acesso. F8 acrescenta botão
Google, exportação `.ics`, lembrete no detalhe e feriados cadastrados na grade;
feriados nacionais automáticos continuam pendentes. As oito migrações e `receber-contato`
continuam pendentes de aplicação/publicação. Para testar sem login real e
sem gravar na produção: `npm run testar:local` →
<http://127.0.0.1:8125/__teste>. Roteiro completo em
[TESTAR-NOVAS-FUNCOES.md](../TESTAR-NOVAS-FUNCOES.md).

**05/10/2026 (noite) · revisão:** bugs funcionais e visuais corrigidos, código
novo reescrito no estilo do projeto e migrações novas reformatadas, sem mudar
regra nem texto jurídico. Detalhes em
[REVISAO-NOVAS-FUNCOES.md](../REVISAO-NOVAS-FUNCOES.md).

**08–09/10/2026 · Financeiro do DOCX (T01–T17) e DJEN, só local:**
- **Financeiro:** pagamentos de despesa separados (parcial, estorno, reembolso),
  contas financeiras e transferências, descontos e acréscimos autorizados,
  encargos discriminados e código de contrato C001/AAAA.
- **Contratos e fechamento:** formalização a confirmar, arquivamento,
  redistribuição de parcelas, fechamento anual com versões e
  `resumo_financeiro`.
- **Relatórios e importação:** nove relatórios com exportação em XLSX/CSV, recibo
  com valor por extenso, central de alertas e importação da planilha antiga com
  área de conferência.
- **Arquivos:** anexos privados com verificação no servidor.
- **Acesso e operação:** perfis Consulta e Auditoria, convite por e-mail,
  saída por inatividade, tela Operação e LGPD e registro de erros.
- **Clientes:** vários contatos, nome fantasia, etiquetas e CEP.
- **Intimações:** busca no DJEN pelo navegador, captura diária, contagem
  automática de prazos sugerida e feriados nacionais na Agenda.
- **Sem 2FA**, por decisão do Ithalo.

Doze migrações (`20261008120000`–`20261008121100`) e duas funções de borda
(`finalizar-anexo`, `administrar-usuarios`) estão **sem aplicar e sem
publicar**. Estado, ordem de publicação e decisões a confirmar:
[HANDOFF-FINANCEIRO-DJEN.md](../HANDOFF-FINANCEIRO-DJEN.md).

**09/10/2026 · revisão de código, banco e visual:** correções de permissões,
captura DJEN, filtros e previsões financeiras, recibos históricos, importação,
anexos, indisponibilidade dos serviços e seleção de cliente no editor.
**150/150 testes JavaScript, 440/440 verificações SQL e 17 páginas do site.**
Correções do QA de 09/10 (444/444 SQL): [HANDOFF §9](../HANDOFF-FINANCEIRO-DJEN.md#9-correções-do-qa-de-09102026).
Telas conferidas no navegador em computador e celular, com dados fictícios e
PostgreSQL isolado. Resultados, limites da validação e preparação da publicação:
[REVISAO-FINANCEIRO-DJEN.md](../REVISAO-FINANCEIRO-DJEN.md).

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
| `npm run testar:local` | Prévia com **banco de verdade em memória** (PGlite: todas as migrações, RLS e gatilhos), perfis fictícios, DJEN e CEP fictícios; porta 8125. `-- --simulado` volta à API simulada antiga |
| `npm run sistema:test` | Testes dos cálculos: atraso, parcelas, índices, cobrança, agenda, formatos, prazos, DJEN, XLSX, importação |
| `npm run banco:test` | Testes SQL das permissões e do Financeiro no PGlite, mais o ensaio da migração sobre dados antigos (`npm run banco:test -- financeiro-docx` filtra) |

Com `npm run dev`, o sistema fala com o projeto Supabase **fhl-advocacia**,
região São Paulo. Para a entrega nova, use `testar:local`: os dados ficam em
memória e o frontend sai em `.local/previa/`, separado de `dist/`. O PGlite
fica em `.local/ferramentas/` (não vai para o repositório nem para a Vercel).

### Primeiro acesso

Não há tela de cadastro, de propósito — quem entra é o escritório que decide.

1. O e-mail precisa estar num **membro ativo**. Confira os cadastros em Membros.
   A equipe atual tem três sócios; Marlon está desativado. Há também o
   administrador de suporte do piloto.
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
  img/                       Logo FL completa (entrada), monograma FL (menu), assinatura FL dos
                             documentos, peixinho de marca d'água (entrada) e favicon — `npm run marca`.
                             O peixinho nunca entra nos documentos gerados.
  js/
    app.js                   Rotas, menu por permissão, sessão
    config.js                URL e chave publicável do Supabase
    nucleo/                  supabase, consulta, html, formato, csv, dialogo, estado, rotas, avisos,
                             avisos-do-dia (contadores do menu), higienizar (lista branca dos documentos)
    escritorio.js            Identidade única, compartilhada com o build público
    dominio/                 atraso, parcelas, indices, cobranca, agenda, contatos, mensagens, clientes,
                             tempo, tarefas, aniversarios, avisos-do-dia, ics
    documentos/              partes, modelos, acoes, relatorio — oito modelos e folha A4
    telas/                   entrar, inicio, agenda, membros, historico, conta, clientes, contatos,
                             processos, intimacoes, feriados, preparar-mensagem, comum
    telas/clientes/          lista, cliente (a ficha), formulario (cadastro completo)
    telas/financeiro/        base, painel, recebiveis, em-atraso, contratos, contrato,
                             contrato-novo, contas, fechamento, relatorios, configuracoes
    telas/site/              base, publicacoes, publicacao, campanhas, campanha, publicar
    telas/documentos/        lista, novo, documento
    telas/atualizacoes/      lista, formulario, cronometro, relatorio
    telas/tarefas/           lista, formulario, prazos
  testes/                    node --test

supabase/
  migrations/                seis aplicadas + oito pendentes de E0/F1–F7
  functions/publicar-site/   função de borda que chama o Deploy Hook da Vercel
  functions/receber-contato/ entrada pública do formulário; pendente de publicação
  testes/permissoes.sql      87 testes de permissão e de regra, desfeitos no fim
  testes/financeiro.sql      62 cenários do Financeiro, do contrato ao fechamento, desfeitos no fim
  testes/clientes.sql        64 cenários locais de E0/F1/F2, desfeitos no fim
  testes/documentos-atualizacoes.sql  42 cenários locais de F3/F4
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
- **Mesma origem do site.** `/sistema` tem HTML e CSP próprios, sem scripts
  de analytics. Isso não separa o armazenamento por origem; avaliar essa
  arquitetura antes de introduzir scripts de terceiros no domínio público.

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

**Financeiro `consulta`** (08/10): lê tudo o que o completo lê — inclusive
fechamento e relatórios — e não grava nada. Serve para contador ou conferente.
**Histórico (auditoria) `ver`**: lê o histórico de todos os módulos e a tela
Operação e LGPD, sem alterar. Em Membros, "Preencher com um modelo" oferece
Financeiro, Consulta e Auditoria; só preenche os níveis.

---

## Financeiro

**Regime de caixa.** Entrada conta no mês em que foi recebida; saída, no mês em
que foi paga. Parcela vencida e conta a pagar aparecem como pendência, não no
resultado.

**Cada informação mora num lugar.** O que vence nos próximos dias fica em
**Hoje**; os números do mês, em **Painel**, como atalhos para o detalhe; o
resumo, a composição e a divisão entre os sócios, no **Fechamento**; os
lançamentos um por um e as planilhas, em **Relatórios** (o anual continua com o
resumo do ano, que não existe em outro lugar).

**O que se corrige e o que não.** Descrição, processo, responsável, observações
e critério de atraso se corrigem em *Editar*, na tela do contrato; nome,
documento e telefone do cliente, em *editar cliente*. Valor e parcelas não —
para isso há Renegociar, Vencimento e Cancelar parcela, que deixam rastro do
que mudou e por quê.

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

### O que entrou com o DOCX (08/10)

- **Despesa ≠ pagamento.** O valor da conta é a obrigação; cada pagamento
  fica em `pagamentos_despesa` (parcial, estorno com motivo, reembolso ao
  sócio, chave de idempotência). A conta "paga" é a que o pago cobre.
- **Contas financeiras.** Caixa e bancos, com saldo inicial; cada recebimento
  e pagamento cai numa conta (a padrão, se ninguém escolher). Transferência
  entre contas e estorno. Nada disso fala com banco: é controle manual.
- **Contrato.** Código `C001/2026` dado pelo banco pelo ano da formalização,
  nunca muda (prefixo em Configurações). Sem data informada fica "a
  confirmar". Arquivar/desarquivar com motivo; redistribuir parcelas mantendo
  o total; vencimento passado só com confirmação e motivo.
- **Desconto e acréscimo** são ajustes com motivo e quem autorizou
  (`conceder_ajuste`), estornáveis. Encargos do recebimento ficam
  discriminados em multa, juros, correção e acréscimo.
- **Fechamento anual** só com os 12 meses fechados e o ano terminado; cada
  fechamento grava uma versão imutável. Reabrir o ano pede motivo.
- **Painel e relatórios** leem `resumo_financeiro` (uma regra só para os
  números). Exportação em XLSX (sem biblioteca) e CSV, com registro em
  `exportacoes`.
- **Recibo** sai do recebimento, com valor por extenso e saldo depois.
- **Anexos** vão para o balde privado `anexos`: reserva no banco → envio →
  `finalizar-anexo` confere tipo real e calcula o hash. Download por link
  assinado de 1 minuto.
- **Alertas**: pendências calculadas na hora e eventos registrados
  (fechamento, estorno, mudança de acesso), com lido/resolvido/silenciado por
  pessoa. Avisa, não envia.
- **Importar planilha**: modelo próprio (CSV/XLSX) → área de conferência →
  carga numa transação só. A planilha oficial do escritório ainda não chegou.

### Divisão entre sócios (6.6)

Padrão até o escritório definir: **partes iguais entre os quatro sócios, depois
das despesas.** Alternativa pronta: cota por sócio. O fechamento mostra, por
sócio, o valor e o reembolso pendente de conta paga do próprio bolso. A
diferença de centavos fica com o último da lista.

---

## Intimações, prazos e DJEN (08/10)

- **Busca no DJEN** (API pública do CNJ, `DJEN_URL` em `config.js`): sai do
  **navegador**, porque a API só responde a pedidos do Brasil. Uma OAB por
  vez (as dos membros ativos, lidas do campo OAB), com pausa, parando no
  limite do CNJ (429 / `x-ratelimit-remaining`). A mesma comunicação para
  dois advogados entra uma vez. Cada consulta fica registrada — completa,
  parcial ou falhou.
- **Captura diária**: com a busca automática ligada (Feriados e prazos), a
  primeira pessoa com acesso a Prazos que abre o sistema num dia útil busca
  desde a última consulta completa. Não há servidor buscando sozinho.
- **Publicação** = primeiro dia útil depois da disponibilização (Lei
  11.419/2006, art. 4º, §3º), com os feriados do tribunal da comunicação.
- **Contagem automática** (`dominio/prazos.js`): dias úteis, corridos
  (criminal) ou horas, recesso de 20/12 a 20/01, feriados nacionais fixos e
  os cadastrados. É **sugestão**: mostra a memória dia a dia, a data fatal
  continua editável e "Conferi" é obrigatório. A memória vai para
  `memoria_prazo`, dizendo se o advogado mudou a data.
- **Datas móveis** (Carnaval, Sexta-feira Santa, Corpus Christi) são
  sugeridas por ano em Feriados e prazos; só contam depois de cadastradas.
- Prazo e audiência vêm sugeridos a partir do teor ("15 (quinze) dias",
  "audiência … 12/11/2026, às 14h30"); quem confirma é a pessoa.

## Operação, segurança e LGPD (08/10)

- **Saída por inatividade**: minutos em Operação e LGPD (padrão 30), com
  aviso um minuto antes.
- **Convite** (Membros → Enviar convite): `administrar-usuarios` confere com
  o token de quem pede que é o administrador e manda o convite pelo Auth. A
  pessoa cria a própria senha. Depende de SMTP configurado no Supabase.
- **Acessos**: lidos dos registros do Auth (`acessos_recentes`), só para
  administrador e auditoria.
- **Erros das telas** vão para `erros_cliente` sem conteúdo de formulário
  (e-mails e números longos apagados), com limite por pessoa.
- **Pedidos de titulares** (LGPD art. 18), com prazo, responsável e decisão.
- **Cópias de segurança**: cada execução registrada em `backups_execucoes`.
  A rotina está descrita em
  [docs/operacao/backup-restauracao.md](../docs/operacao/backup-restauracao.md).

---

## Agenda

Semana de todos com cor por advogado, horário livre, bloqueio de vários dias,
particular como "Ocupado", aviso de conflito contando o intervalo mínimo entre
atendimentos, chegada do cliente com tempo de espera, situação do atendimento e
impressão. A tela **Hoje** junta a agenda do dia e o que pede atenção no
Financeiro.

**F8 local:** no detalhe, **Pôr no Google Agenda** abre o formulário preenchido
para a pessoa conferir e salvar. **Exportar .ics** baixa a semana inteira ou
o mês escolhido, de um responsável ou de todos; a seleção inicial acompanha
os advogados marcados. Uma nova consulta a `agenda_periodo` preserva a máscara
dos particulares alheios. A exportação exclui cancelados e observações
internas, conserva os limites originais de blocos que cruzam o período,
inclui alarmes configurados e usa fim exclusivo em eventos de dia inteiro.

**Preparar lembrete** aparece no atendimento agendado com cliente/telefone,
com data, hora de Brasília, responsável e endereço ou link online. Os feriados
cadastrados ativos com tribunal vazio aparecem no cabeçalho e na lista móvel;
falha dessa consulta mantém a agenda utilizável. Feriados automáticos continuam
pendentes após o bloqueio registrado em F5/F6. F8 não tem migração própria.

Salvar/importar cria uma cópia. Para ocupar o link de agendamento, a agenda
de destino precisa participar da verificação de disponibilidade do Google.
Alterações/cancelamentos posteriores também precisam ser ajustados ali.
A sincronização nos dois sentidos (7.3, opção C) continua aguardando a conta
do escritório; as colunas `google_*` ficam reservadas. A importação real na
conta Google ainda precisa de teste humano.

---

## Site

O que o escritório publica no site público sem precisar de ninguém que
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
| 20260916120520 | `conteudo` | Publicações, campanhas, `acesso_site`, pedidos de publicação, balde das imagens — e o conteúdo que já estava no site como semente |
| 20260923111816 | `ajustes_financeiro` | Conta avulsa muda de mês junto com o vencimento; o fechamento gera as contas fixas do mês antes de tirar a foto |
| 20261005130311 | `base_modulos` **(pendente no remoto)** | Clientes/Prazos, sessão e autorização de auditoria |
| 20261005130317 | `contatos` **(pendente no remoto)** | Contatos, ingresso pelo servidor, limites, consentimento, conversão e auditoria |
| 20261005140521 | `clientes_processos` **(pendente no remoto)** | Dados completos restritos, processos, CNJ válido, cadastro atômico e auditoria |
| 20261005212635 | `documentos` **(pendente no remoto)** | Modelos, texto final imutável, vínculos e cancelamento auditado |
| 20261005212642 | `atualizacoes` **(pendente no remoto)** | Atividades, participantes, relógio do servidor, autoria e vínculo com Agenda |
| 20261005225741 | `tarefas_prazos` **(pendente no remoto)** | Tarefas, prazos informados manualmente, feriados cadastrados e bloqueio da Agenda |
| 20261005225750 | `intimacoes` **(pendente no remoto)** | Registro/conferência manual e vínculos atômicos de prazo/audiência |
| 20261005232739 | `avisos_do_dia` **(pendente no remoto)** | Contadores pessoais e por permissão, sem sobreposição de tarefas |

As seis primeiras versões foram conferidas no projeto remoto. As oito novas
foram geradas pela CLI e executadas somente em PostgreSQL isolado. Elas ainda
não estão no histórico remoto. Preserve as versões ao aplicar; não execute
`db push` antes da aprovação desta entrega.

Numa base **local ou isolada**, aplicar as quatorze migrações em ordem. Depois,
executar os seis arquivos de teste. O piloto atual tem três sócios ativos;
o teste antigo de divisão pressupõe Marlon desativado.

| Arquivo | O que confere |
|---|---|
| `supabase/testes/permissoes.sql` | 87 testes de **quem pode**: anônimo, login sem membro, e-mail não confirmado, administrador, sócia, secretária e associado |
| `supabase/testes/financeiro.sql` | 62 cenários de **se está certo**: somas, saldos, situações, renegociação, êxito, contas fixas, mês fechado e a divisão entre os sócios no centavo |
| `supabase/testes/clientes.sql` | 64 cenários E0/F1/F2: acessos, RLS, grants, auditoria, contatos, consentimento, limites, cadastro atômico, CNJ e vínculos |
| `supabase/testes/documentos-atualizacoes.sql` | 42 cenários F3/F4: imutabilidade, cancelamento, autoria, RLS, vínculos, marcador e relógio do servidor |
| `supabase/testes/prazos.sql` | 53 cenários de tarefas/prazos/intimações manuais e seus vínculos/permissões |
| `supabase/testes/avisos.sql` | 21 cenários de contadores F7: autoria, RLS, perfis, estados e execução |

Resultado local em 05/10/2026, depois da revisão: **329/329 verificações SQL**,
em PostgreSQL 17 via PGlite (Auth e Storage com esquemas mínimos),
**104/104 testes JavaScript**, **93/93 fluxos** no navegador e 17 páginas
aprovadas por `npm run check`. Cada `select`, filtro e ordenação do frontend
também foi conferido contra o esquema das migrações.
Nove arquivos F8 passaram no parser independente `icalendar 6.3.2`, sem
gravação/importação na conta Google. As evidências locais ficam em `.local/`.

### Contatos (E0/F1)

`acesso_clientes='editar'` libera Contatos; `acesso_prazos` está preparado para
F5/F6 e ainda não cria uma tela de Prazos. O cadastro mínimo de clientes usado
pela Agenda/Financeiro mantém suas permissões anteriores; os dados completos
ficam separados em `clientes_detalhes`, com acesso a Clientes.

O visitante chama a função pública `receber-contato`, que valida os campos e
chama `registrar_contato` com a chave de serviço. `anon` e `authenticated` não
podem executar essa RPC. Limites: 3 envios por hash de IP em 10 minutos,
30 envios globais por hora; trava transacional evita exceder por concorrência.
`CONTATO_SAL` é obrigatório; configuração ausente resulta em 503.

A equipe pode incluir contatos manuais e alterar situação, responsável,
cliente e observações. Mensagem, origem e consentimento ficam protegidos por
GRANT de coluna. Conversão exige cliente e tem data do servidor. Resposta abre
texto para envio humano; arquivar mantém o histórico. Contatos entram na
cópia de segurança quando o usuário também tem acesso a Clientes.

A proposta de anonimização após 12 meses depende do escritório e ainda não
foi implementada. Hashes técnicos antigos são limpos no ingresso de novos
envios. A política pública permanece marcada para revisão.

**Tabela nova segue o mesmo roteiro:** `privado.aplicar_padrao()` (carimbo,
auditoria, sem exclusão), RLS, GRANT coluna a coluna e a tabela no
`privado.pode_ver_auditoria()`.

### Clientes e processos (F2)

Menu Clientes → **Clientes** e **Processos**. Cadastro completo PF/PJ com
qualificação, endereço, recados, representante, banco/Pix e responsável.
`salvar_cliente` salva mínimo e detalhe em uma transação; a falha de qualquer
parte desfaz tudo. O RPC ignora IDs de detalhe e carimbos fornecidos pelo cliente.

Processos permitem o mesmo CNJ para clientes distintos, mas impedem duplicação
para o mesmo cliente. O dígito verificador é conferido no formulário e no banco.
Casos consultivos/extrajudiciais aceitam referência sem CNJ. Todos os membros
ativos leem processos para Agenda/Financeiro; só acesso a Clientes autoriza escrita.

A ficha abre processos, dados completos, contato de origem e histórico;
consulta Agenda e Financeiro apenas quando o perfil permite. Desativar mantém
os registros e permite reativação. O cadastro rápido de contratos/compromissos
continua disponível. A cópia de segurança inclui processos e, com o nível de
Clientes, detalhes. Próximo prazo e seções futuras chegam nas respectivas etapas.
CEP é manual; não houve integração opcional com ViaCEP nem mudança na CSP.

### Documentos e atualizações (F3/F4)

Menu Clientes → **Documentos** e **Atualizações**. Oito modelos do Apêndice A
geram qualificação PF/PJ, complementos e folha editável. Texto higienizado por
lista branca ao colar, gravar, exibir e exportar; imagens só de `/sistema/img/`.
O texto salvo é imutável, reimpressão/exportação registra nova geração e
cancelamento exige motivo. Modelos permanecem sujeitos à revisão do §7.8.
Contrato/prestação de contas e comparecimento consultam Financeiro/Agenda
somente com os níveis correspondentes. Relato de atualização preenche a FAA.

**Barra de formatação (08/10/2026).** Acima da folha de "Gerar documento" há
um Word simplificado: desfazer/refazer, estilo do parágrafo, fonte, tamanho,
negrito, itálico, sublinhado, riscado, cor, realce, alinhamento, listas, recuo
e limpar (`documentos/editor.js`). Toda formatação é classe `doc-*` — nunca
`style=""`, que a CSP bloqueia e a lista branca descarta —, então a tela, a
impressão e o `.doc` mostram o mesmo. As opções e suas regras moram em
`documentos/formatacao.js`.

`iniciar_cronometro` e `parar_cronometro` usam relógio do servidor, trava e uma
atividade aberta por membro. `meu_cronometro` sincroniza hora e cliente; a UI
consulta a cada 15 segundos, interpola com `performance.now()` e sincroniza
abas com BroadcastChannel. Chegada e realização da Agenda são gravadas com o
início/parada. Autor edita o seu; admin edita/cancela os outros. Horário
corrigido remove o marcador; alteração só do relato preserva segundos.
Relatório A4 salva texto final em Documentos, com relato oculto por padrão.
Participantes contam o tempo integral, sem duplicar o total do cliente.

O PDF de duas páginas foi conferido no Chrome: assinatura e rodapé em ambas,
marca escura derivada da fonte única, sem controles da interface. Caixas de
margem paginada evitam sobrepor o rodapé; elemento fixo fica como alternativa
para navegadores sem suporte. Word gera HTML `.doc`; sua abertura no Word e
a retomada em dois computadores físicos ficam para a conferência do usuário.

---

## Pôr no ar

**Um projeto na Vercel, para o site e para a área** — a raiz do repositório,
build `npm run build`, saída `dist/`. O build copia `sistema/` para
`dist/sistema/` (sem `testes/` e sem este README), e a área fica em `/sistema`.

Não existe mais um segundo projeto com Root Directory `sistema`: os cabeçalhos
que ficavam em `sistema/vercel.json` estão no `vercel.json` da raiz, aplicados
só às rotas `/sistema` e `/sistema/*`.

Com o endereço definido:

Para E0/F1–F4, seguir a ordem de publicação em
[TESTAR-NOVAS-FUNCOES.md](../TESTAR-NOVAS-FUNCOES.md): banco, segredo,
função pública e então frontend. Nenhuma dessas ações remotas foi feita.

Para a entrega de 08/10, a ordem está em
[HANDOFF-FINANCEIRO-DJEN.md](../HANDOFF-FINANCEIRO-DJEN.md): migrações
`20261008*` → funções `finalizar-anexo` e `administrar-usuarios` → push. O
frontend novo **não abre** sem as migrações (colunas e funções novas).

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
| Divisão (perguntas 1 e 2) | Partes iguais entre os sócios ativos (três), depois das despesas | Financeiro → Configurações |
| Agenda (pergunta 17) | Grade 8h–19h sem sábado; atendimento 60 min, retorno 30, intervalo de 15 | Agenda → Configurar |
| Categorias e formas de pagamento | As da preparação (6.2) | Financeiro → Configurações |
| Quem escreve no site | Só sócio e administrador; associado e secretária ficam de fora | Membros → Site |
| Código de contrato | Prefixo "C", número por ano da formalização | Financeiro → Configurações |
| Contratos antigos sem data | Formalização "a confirmar", sem data inventada | Contrato → Confirmar formalização |
| Taxa de recebimento | Das parcelas que venceram no período (até hoje), quanto já foi pago ÷ o valor delas | `resumo_financeiro` |
| Fechamento anual | Só com os 12 meses fechados | `fechar_ano` |
| Importação | Modelo próprio (a planilha oficial ainda não chegou) | `dominio/importacao.js` |
| Contagem de prazos e datas móveis | Regras do CPC/CLT/CPP descritas em `dominio/prazos.js`; móveis só cadastradas | Feriados e prazos |
| Busca automática no DJEN | Ligada; 7 dias na primeira busca; entrega 3 dias úteis antes | Feriados e prazos |
| Inatividade | 30 minutos | Operação e LGPD |
| 2FA | Não implementado, por decisão do Ithalo | — |

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

Importação de extrato OFX e conciliação bancária (fora do escopo por decisão:
"sem integração com banco"), feriados do Paraná e de Paranaguá (só
cadastrados), resumo diário por e-mail, "desfazer" pelo histórico e horas
trabalhadas vindas de Atualizações. No Site: agendar a publicação de um artigo
para uma data e editar áreas de atuação. Exceção de CPF/CNPJ repetido (DOCX)
só se o escritório precisar — um cliente com vários contratos resolve o caso
comum. Importação direta da conta Google na Agenda continua pendente.

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
- **Contas fixas nascem quando alguém olha o mês.** `gerar_contas_do_mes` é
  idempotente; toda tela que lista conta passa por `garantirContasDoMes`
  (`telas/financeiro/base.js`), uma vez por mês por sessão. Tela nova que
  mostra conta deve chamar também — antes, a tela Hoje não chamava e o aluguel
  do dia 5 não aparecia na lista da semana.
- **404 do Banco Central não é queda.** A API do SGS responde 404 "Value(s) not
  found" quando não há índice publicado no intervalo — o normal para parcela
  vencida neste mês. Tratado como falha, o recibo gravava "Banco Central fora do
  ar". Parcela sem mês a corrigir nem consulta a API (`temMesParaCorrigir`), e a
  consulta desiste em 8 segundos.
- **Um número em destaque é `indicador()`** (`telas/comum.js`), com `href` quando
  o detalhe mora em outra tela. O Painel aponta para Contas, Recebíveis, Em
  atraso e Fechamento em vez de repetir o que está lá.
- **Parcela: o número é do banco, a posição é da tela.** Renegociar não renumera
  — as novas continuam a contagem (11, 12…), e é esse número que aparece no
  recibo e na cobrança. A tela do contrato mostra também "1 de 2 da
  renegociação" (`posicoes` em `dominio/parcelas.js`).
- **Gravou, avisa; quem se interessa, escuta.** Toda gravação bem-sucedida
  dispara `fhl:gravou` com o caminho (`tarefas`, `rpc/criar_tarefa`…).
  `nucleo/avisos-do-dia.js` decide se os contadores do menu mudam — o cliente
  de dados não conhece regra de módulo. Cronômetro iniciado ou parado dispara
  `fhl:atualizacoes`, e as telas abertas (Hoje, Agenda, ficha, Atualizações)
  se atualizam no lugar, sem perder a rolagem.
- **Tempo total não conta cronômetro aberto** (`totais` em `dominio/tempo.js`):
  é o mesmo critério do relatório para o cliente, e o aberto aparece à parte.
- **Folha A4 encolhe para caber** (`ajustarFolha` em `documentos/acoes.js`,
  via `zoom` e a variável `--escala`). A impressão usa outra cópia, sempre em
  tamanho real.
- **Coisa absoluta dentro de tabela rolável** (o `.sr-only` do cabeçalho
  "Ações") precisa do `position: relative` de `.tabela-rolagem` — sem ele,
  escapava da rolagem e alargava a página inteira no celular.
- **A prévia local não confere nomes de coluna:** a API simulada devolve
  `null` para qualquer coluna pedida. Coluna nova ou renomeada se confere no
  esquema (migrações) — foi assim que apareceu `mostrar_fim_semana`, que não
  existe e quebraria "Lançar audiência" em produção.
- **Bloco de artigo tem três guardiões**, e os três precisam concordar: o editor
  (`telas/site/publicacao.js`), o gatilho do banco (`privado.validar_corpo`) e o
  renderizador do site (`src/pages/publicacoes.mjs`). Tipo novo se acrescenta
  nos três.
- **Cor das tarefas** (`urgenciaTarefa` em `dominio/tarefas.js`): conta a
  data que vem primeiro — entrega ou fatal. Até 7 dias, amarelo; até 2 dias
  ou atrasada, vermelho; concluída, cancelada ou sem data, sem cor. A etiqueta
  ("Entrega em 2 dias") sai de `prazoRestante`, sobre a mesma data. Vale na
  lista de Tarefas, em Prazos, na ficha do cliente e no "Para hoje".
- **Em andamento volta a pendente pelo Editar.** Concluída, não: só por
  Reabrir, que pede o motivo (o gatilho `validar_tarefa` recusa o resto).
- **Formatação nova na barra do editor = três lugares:** a lista de
  `documentos/formatacao.js`, o bloco entre `formatacao:inicio` e
  `formatacao:fim` de `sistema.css` (cópia de `cssFormatacao('.documento-folha ')`;
  `formatacao.test.mjs` acusa a divergência) e, se for tag nova, a lista
  branca de `nucleo/higienizar.js`. O `.doc` recebe as regras sozinho.
- **Por que a barra não usa `justifyCenter`, `hiliteColor` etc. do
  navegador:** o Chrome grava `style=""` e a CSP não aplica. Fonte, tamanho,
  cor e realce passam por uma fonte-marcador (`<font face="fhlfmt">`) trocada
  na hora por `<span class="doc-…">`; alinhamento e recuo são classe no
  parágrafo. O desfazer é próprio (fotos do HTML), porque o do navegador se
  perde quando o texto muda fora dos comandos dele.
