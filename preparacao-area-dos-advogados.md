# Preparação — Área dos advogados: Agenda e Financeiro

> **Fase 2 do projeto FHL (sistema interno).** Documento de análise, sem código.
>
> **Base:** reunião de 11/09/2026 com o Vinícius (transcrição completa e frames
> do vídeo), o protótipo dele (`fhl-site-etapa6-1-estabilidade-abas-documentos-clientes.html`)
> e o `CLAUDE.md`.
>
> **Escopo:** só **Agenda** e **Financeiro**. Os outros doze módulos do
> protótipo ficam para depois.
>
> `[~MM:SS]` indica o minuto aproximado do vídeo.

## Sumário

1. [Resumo em uma página](#1-resumo-em-uma-página)
2. [O que ele disse, com as palavras dele](#2-o-que-ele-disse-com-as-palavras-dele)
3. [O que o protótipo já faz e onde falha](#3-o-que-o-protótipo-já-faz-e-onde-falha)
4. [Princípios que decidem o desenho](#4-princípios-que-decidem-o-desenho)
5. [Base comum aos dois módulos](#5-base-comum-aos-dois-módulos)
6. [Financeiro](#6-financeiro)
7. [Agenda](#7-agenda)
8. [Custos](#8-custos)
9. [Fases, esforço e riscos](#9-fases-esforço-e-riscos)
10. [Perguntas para o Vinícius](#10-perguntas-para-o-vinícius)
11. [Glossário](#11-glossário)

---

## 1. Resumo em uma página

**O Financeiro é a prioridade nº 1 dele** ("seria mais a questão do financeiro"
[~23:40]). A Agenda vem depois e é mais simples do que parece, porque o Google
Agenda já resolve o essencial.

**Financeiro — o que propomos.** Um controle de caixa do escritório, manual e
sem banco conectado (decisão dele, por custo), que responde a quatro perguntas:

1. Quanto entrou e quanto saiu no mês?
2. Quem está devendo, e quanto dá hoje com multa e juros?
3. Quais contas do escritório vencem nos próximos dias?
4. No fechamento do mês, quanto cabe a cada sócio?

E que exporta tudo em PDF e planilha, inclusive para ele ter cópia se o sistema
sair do ar.

**Agenda — o que propomos.** O Google Agenda continua sendo a agenda oficial: é
nele que o cliente marca horário pelo link. O sistema vira um **painel da
semana dos quatro advogados**, lendo o Google, e grava no Google o que nasce
dentro do sistema (bloqueios, audiências vindas de publicações). Ninguém digita
nada duas vezes.

**Três decisões antes de orçar:**

1. **Sair do arquivo HTML com dados no navegador** para um sistema web com
   login individual e banco de dados na nuvem. Sem isso não há prova, acesso
   simultâneo nem backup.
2. **Regra de divisão do faturamento entre os sócios** — só ele pode definir.
3. **Gmail comum ou Google Workspace** — muda o jeito de conectar a agenda.

**Custo de infraestrutura:** US$ 0 num piloto com planos gratuitos, e cerca de
**US$ 45/mês** em produção com planos pagos. A mensalidade de vocês vai por
cima (seção 8).

---

## 2. O que ele disse, com as palavras dele

Trechos da transcrição, levemente limpos.

### 2.1 Financeiro

| Assunto | O que ele disse |
|---|---|
| Sem banco | "não é uma ferramenta que vai estar conectada com o nosso banco, porque isso também é um custo… aqui é para a gente ter um controle mesmo" [~07:40] |
| Contrato | "cliente… a descrição, o valor cobrado, a entrada, data do primeiro pagamento. Aí eles geram um contrato financeiro" [~07:50] |
| Contas mensais | "o ideal seria colocar uma forma mensal… você gasta com isso, isso, isso" [~08:00] |
| Atrasados | "tem o Ítalo, tem o Vinícius, tem a Giovanna, tem o André que estão em atraso… você tem 10% e mais um jurinho aqui, então… a tua parcela, o valor é X" [~08:30] |
| Exportar como garantia | "o site está fora do ar e eu conseguir exportar para saber o que tem até aquela data específica" [~08:50] |
| Prioridade | "seria mais a questão do financeiro… se pudesse ter dentro uma área dentro do financeiro" [~23:40] |
| Entradas × saídas | "sempre entra e sai dinheiro… foi gasto com água, luz, internet, telefone, aluguel… um café que a gente fez pra algum cliente… o que eu tenho pra receber e o que está ganhando" [~23:50] |
| Dinheiro perdido | "tem muito dinheiro perdido na praça… a gente faz o parcelamento no contrato, que a gente fala que é no fio do bigode, mas tem muito cliente que se a gente não cobra… não vou pagar… eu fiquei quase um ano sem cobrar o cliente" [~24:20] |
| Divisão | "o nosso faturamento foi esse, entrou isso, saiu isso, então a gente vai dividir isso" [~24:40] |
| Login | "você não precisa colocar vários logins, colocando um já tá safo" [~24:45] — **contradiz a auditoria que ele pediu; ver pergunta 19** |

### 2.2 Agenda

| Assunto | O que ele disse |
|---|---|
| Integração | "não sei se… teria uma funcionalidade de colocar ela conectada com o Google Agendas… ou senão de uma forma mais simples… exportar o que você tem no mês" [~10:50] |
| Rotina que ele aceita | "faria essa atualização específica toda sexta-feira… pegar a agenda da semana seguinte e incluir ela aí" [~11:00] |
| Objetivo | "a gente usa muito mais o Google Agenda, mas é só pra também ter aqui uma forma de que cada um sabe o que cada um está fazendo" [~11:10] |
| Bloqueio | "eu não vou vir no dia tal, aí eu coloco a data de início e data de fim… mas aí como eu vou fazer no Google Agenda, então em tese não precisaria" [~11:30] |
| Link para o cliente | "a gente manda o nosso link da agenda hoje para os próprios clientes… veja lá o horário para você" [~11:35] |
| O porquê | "eu não gosto de que as pessoas fiquem esperando… uma coisa é um cliente chegar duas horas da tarde e ser atendido seis horas da tarde… escritório cheio não quer dizer que você está ganhando" [~11:40] |

### 2.3 Permissões e prova (valem para os dois)

| Assunto | O que ele disse |
|---|---|
| Quem vê o quê | "o Vinícius vai ver o cliente, contato e atualizações. Financeiro, agenda, publicações, prazos, ele não mexe… a secretária vai ver o cliente, o contato, atualizações e o financeiro" [~19:00] (usou o próprio nome como exemplo de um advogado) |
| Registro de exclusão | "aparecia um registro de que o Vinícius apagou alguma coisa aqui… o administrador apagaria de todo mundo, para não ter aquela manipulação de informação" [~05:00] |
| Crescimento | "hoje nós somos quatro, mas vai que talvez a gente tenha um estagiário, a gente tenha uma secretária" [~05:10] |

### 2.4 Leitura

- **O que ele quer é controle e visibilidade, não automação.** O Financeiro é
  para parar de perder dinheiro por falta de cobrança e para dividir o
  resultado com clareza.
- **A marcação de horário já está resolvida pelo Google.** A Agenda do sistema
  é para a equipe se enxergar.
- **"Exportar" aparece nos dois módulos como garantia**, não como relatório.

---

## 3. O que o protótipo já faz e onde falha

### 3.1 Financeiro (tela "Dashboard financeiro")

| Parte | Como funciona hoje | Lacuna |
|---|---|---|
| Painel | Cartões: A receber, Recebido, Em débito, Contas pagas, Contas a pagar. Gráfico e alertas. | Não mostra o **resultado do mês** (entradas − saídas). |
| Contrato financeiro | Cliente, Descrição, Valor total, Entrada, Quantidade de parcelas, Data da 1ª parcela → gera as parcelas. | Sem forma de pagamento, sem sócio de origem, sem honorário de êxito. A **entrada é contada como recebida** automaticamente. |
| Parcela | Situação aberta, em atraso ou paga. "Marcar pago" grava a data; "Marcar aberto" desfaz; "Alterar vencimento". | **Sem pagamento parcial.** Não guarda quem deu baixa. Desfazer não deixa rastro. |
| Exclusão | "Excluir contrato" apaga de vez. | **Contradiz a ideia de prova** que ele defendeu na reunião. |
| Contas do escritório | Descrição, Categoria (texto livre), Valor, Vencimento, Situação (a pagar/paga), Responsável. | **Não é recorrente**, e ele pediu "forma mensal". Categoria livre impede relatório por tipo de gasto. |
| Atraso | Multa de **10%** + juros de mora de **1% ao mês**, simples, proporcionais aos dias, sobre o valor original. Um critério para o escritório todo. | Sem correção monetária. Não varia por contrato. O valor não "congela" na data do pagamento. O campo chama a multa de "compensatória" — ver 6.5. |
| Exportação | CSV mensal e anual com 5 colunas (Cliente/Descrição, Tipo, Situação, Valor, Vencimento), CSV de atualizações e PDF. | Sem data de pagamento, sem categoria, sem resultado, **sem divisão entre sócios**: não responde "quanto cabe a cada um". |
| Índices | IPCA, INPC, IGP-M, Selic, CDI, TR e Poupança, direto da API gratuita do Banco Central (SGS). | Existem só nas calculadoras jurídicas, **não no Financeiro**. Dá para reaproveitar. |

### 3.2 Agenda (tela "Agenda dos advogados")

| Parte | Como funciona hoje | Lacuna |
|---|---|---|
| Grade | Segunda a sexta, horários fixos das 9h às 12h e das 14h às 18h, de hora em hora. Filtro e cor por advogado. | Não comporta atendimento de 30 minutos, audiência às 13h, sábado ou fora do expediente. |
| Novo agendamento | Profissional, Data, Início, Fim, Tipo (Presencial/Online/Retorno), Nome, CPF/CNPJ, Telefone/WhatsApp, E-mail, Assunto. Avisa conflito de horário. | Cliente digitado à mão, sem vínculo com o cadastro. |
| Bloqueio | Advogado, Data, Início, Fim, Motivo. | **Um dia só**, mas ele descreveu data de início e data de fim (férias, viagem). |
| Audiência | Cliente, Processo, Quem irá realizar, Data, Início, Fim, Modalidade (Presencial/Online/Híbrida), Notificação (15 min a 1 dia antes), Local ou link, Observações. | — |
| Ligação com Publicações | Publicação conferida pode virar bloqueio de agenda; intimação com audiência vira compromisso. | Boa ideia, que deve ser mantida. |
| Google | Botão "Google Agenda" em cada compromisso abre o Google para criar o evento. | **Uma via, manual, evento por evento.** Nada volta do Google. |
| Situação | "Agendado" ou "Realizado/Passado", decidida só pelo horário. | Não registra se o cliente veio, faltou ou remarcou. |
| Escritório Virtual | Agenda de hoje, tarefas a fazer e concluídas, aniversários de clientes. | Responde em parte à dúvida do `CLAUDE.md` sobre o que é esse módulo: é a tela inicial do dia. |

### 3.3 Problemas de estrutura (valem para os dois)

- **Dados no navegador de quem usa.** Cada computador tem a sua versão; limpar
  o navegador apaga tudo; um usuário não vê o que o outro lançou. É o
  "Controle de edição simultânea indisponível" que apareceu na demo.
- **Sincronização que não existe.** O arquivo tenta falar com um servidor que
  não está no ar quando é aberto do computador. Daí o "Failed to fetch".
- **Login simulado.** Senha padrão igual para todos e escrita dentro do próprio
  arquivo: quem tiver o arquivo abre tudo. Para dado financeiro e de cliente
  não serve (LGPD).
- **Permissões do protótipo contradizem a reunião.** No código, a secretária
  **não** vê o Financeiro e o advogado vê Agenda e Publicações. Na reunião,
  ele disse o contrário.
- **Os quatro advogados aparecem cadastrados como sócios** — relevante para a
  divisão do faturamento.

---

## 4. Princípios que decidem o desenho

Os cinco padrões do `CLAUDE.md`, traduzidos em regras para estes dois módulos:

| Padrão dele | Regra de desenho |
|---|---|
| Tudo é medido em custo | Nada de integração bancária, boleto automático ou WhatsApp pago na primeira versão. Toda proposta vem com o custo mensal ao lado. |
| Quer prova, não automação | Nada se apaga: cancela ou estorna, com motivo. Todo lançamento guarda quem fez e quando. Mês fechado não muda sem reabertura justificada. |
| Aceita trabalho manual | Lançar precisa ser rápido: contrato em menos de um minuto, baixa de parcela em dois cliques, contas fixas geradas sozinhas. |
| Espera que a gente refine | Tirar o que atrapalha (horário fixo, critério único de juros) e acrescentar o que falta (divisão entre sócios, pagamento parcial). |
| Prazo não é pressão | Fases pequenas, cada uma útil sozinha. |

---

## 5. Base comum aos dois módulos

### 5.1 Sistema, não arquivo

- **Sistema web com login**, acessado de qualquer computador ou celular, com os
  mesmos dados para todos.
- **Um login por pessoa**, com recuperação de senha. Um login compartilhado
  inviabiliza a auditoria que ele pediu (pergunta 19).
- **Banco de dados na nuvem com backup diário**, hospedado no Brasil (região
  São Paulo). Facilita a conversa sobre LGPD.
- **Exportação completa a qualquer momento** — é o "e se o site sair do ar"
  dele.
- **Migração:** o protótipo já tem exportação de backup. Os dados atuais podem
  ser importados uma única vez.

### 5.2 Perfis e permissões (proposta inicial, a confirmar)

| Perfil | Agenda | Financeiro |
|---|---|---|
| Administrador (Vinícius) | Vê e edita todas | Tudo, inclusive divisão, fechamento e histórico |
| Sócio | Vê todas, edita a própria | A definir: painel completo ou só a própria parte |
| Secretária | Vê e edita todas | Lança recebimentos e contas; não vê a divisão entre sócios |
| Advogado associado / estagiário | Vê todas (compromisso privado aparece como "Ocupado"), edita a própria | Sem acesso |

> ⚠️ Na reunião ele disse que o advogado "não mexe" em Agenda. "Não mexe" pode
> querer dizer "não edita a dos outros". A proposta acima assume isso — confirmar
> (pergunta 15).

### 5.3 Auditoria

- Todo registro guarda **criado por / em** e **alterado por / em**.
- **Histórico de alterações**: valor anterior → valor novo, quem e quando.
- **Nada é apagado.** "Cancelar" exige motivo; o registro sai das listas e fica
  no histórico.
- Cada registro tem um "ver histórico". O administrador vê tudo e pode desfazer.

### 5.4 Notificações que avisam, não enviam

- **Central de avisos** no sistema e **resumo do dia** ao abrir.
- **Nada vai automaticamente para o cliente.** O sistema **prepara** a mensagem
  (cobrança, lembrete) para o advogado copiar e mandar pelo próprio WhatsApp.
- E-mail diário para a equipe: opcional, numa fase posterior.

### 5.5 Ligações com módulos futuros

Não entram agora, mas o desenho não pode impedir:

- **Clientes:** contrato e compromisso ficam ligados a um cliente cadastrado.
  Enquanto o módulo Clientes não existir, um cadastro mínimo (nome, CPF/CNPJ,
  telefone) resolve e é migrado depois.
- **Atualizações (cronômetro):** as horas registradas por cliente podem
  aparecer no Financeiro ("recebido × horas trabalhadas"). É o argumento que ele
  quer mostrar ao cliente.
- **Publicações e Prazos:** audiência capturada vira compromisso na agenda do
  responsável, como o protótipo já faz.

---

## 6. Financeiro

### 6.1 Objetivo

Saber, a qualquer momento, **quanto entrou, quanto saiu, quem deve e quanto
cabe a cada sócio** — sem conectar banco.

### 6.2 Conceitos

| Termo | Significado |
|---|---|
| Contrato financeiro | O acordo de pagamento com um cliente: valor, entrada, parcelas. Pode existir sem processo. |
| Parcela | Cada valor com seu vencimento. |
| Recebimento | O dinheiro que de fato entrou: data, valor, forma. Uma parcela pode ter mais de um (pagamento parcial). |
| Entrada avulsa | Dinheiro fora de contrato: consulta paga na hora, reembolso de custas. |
| Conta do escritório | Saída de dinheiro: aluguel, luz, café. Pode ser recorrente. |
| Categoria | Lista fixa e editável: Aluguel, Energia, Água, Internet e telefone, Material, Copa e café, Impostos, Custas adiantadas, Marketing, Outros. |
| Fechamento do mês | Foto do mês — entradas, saídas, resultado e divisão — que não muda depois de conferida. |
| Regra de divisão | Como o resultado é repartido entre os sócios. |

### 6.3 Tipos de honorários (confirmar quais eles usam)

O protótipo só cobre o primeiro. Em trabalhista e previdenciário, que são áreas
centrais do escritório, o honorário de êxito costuma ser comum.

| Tipo | Como entra no sistema |
|---|---|
| Contratual fixo, à vista ou parcelado | Contrato com parcelas |
| Êxito (percentual sobre o que o cliente receber) | Contrato "a apurar", sem parcelas até o resultado. Quando o valor sai, vira recebível. |
| Sucumbência (paga pela parte perdedora) | Entrada avulsa ligada ao processo. Confirmar como entra na divisão. |
| Consulta avulsa | Entrada avulsa |

### 6.4 Fluxos principais

**A. Criar contrato financeiro** — em menos de um minuto

1. Escolher o cliente (ou cadastrá-lo rapidamente).
2. Descrição (ex.: "Honorários — ação trabalhista").
3. Tipo de honorário, valor total, entrada (valor e data), número de parcelas,
   vencimento da primeira.
4. Forma de pagamento prevista: Pix, dinheiro, transferência, cartão, boleto.
5. Sócio responsável ou de origem, se a regra de divisão usar isso.
6. Critério de atraso: o padrão do escritório ou um próprio do contrato.
7. **O sistema mostra as parcelas antes de salvar**, e dá para ajustar datas e
   valores (o arredondamento vai para a última parcela).

**B. Registrar recebimento** — dois cliques no caso comum

- "Recebido" na parcela abre com a data de hoje e o valor atualizado sugerido.
- Campos: data, valor, forma, observação e, numa fase posterior, comprovante.
- **Pagou menos:** o saldo continua em aberto na parcela.
- **Pagou mais** (multa e juros): a diferença fica registrada como encargos
  recebidos.
- **Desfazer é estornar**, com motivo, e fica no histórico.

**C. Cobrar atrasado** — avisa, não envia

- Lista "Em atraso": cliente, parcelas, dias de atraso, valor original, multa,
  juros, correção e **total hoje**.
- **"Preparar mensagem"**: texto pronto com o valor atualizado e a chave Pix do
  escritório, para copiar no WhatsApp.
- **"Registrar cobrança"**: "cobrado em 15/09 por Juliana". É a prova de que
  cobrou, e ataca o "fiquei quase um ano sem cobrar".
- **Renegociar**: gera parcelas novas e encerra as antigas como
  "renegociadas", sem apagar.

**D. Lançar contas do escritório**

- **Conta avulsa:** descrição, categoria, valor, vencimento, data e forma de
  pagamento.
- **Conta recorrente:** "todo dia 10, aluguel, R$ X". O sistema cria a conta de
  cada mês; conta de valor variável (luz) nasce sem valor, para preencher.
- **Quem pagou:** se um sócio pagou do próprio bolso, o sistema registra para
  reembolso (pergunta 9).

**E. Fechar o mês**

1. O sistema lista pendências: parcelas vencidas sem baixa e contas do mês sem
   situação.
2. Mostra o resultado: entradas − saídas.
3. Aplica a regra de divisão e mostra quanto cabe a cada sócio.
4. O administrador confere e fecha. O sistema gera o PDF e a planilha, com data,
   hora e quem fechou.
5. **Mês fechado não aceita alteração.** Reabrir exige motivo e fica no
   histórico.

**F. Exportar**

- Mensal e anual, em PDF (para ler) e planilha (para o contador).
- **A planilha abre certa no Excel em português**: separador ponto e vírgula,
  vírgula decimal, acentos preservados. O CSV do protótipo não garante isso.
- **Exportação completa de segurança**, de todos os dados, a qualquer hora.

### 6.5 Atualização de valores em atraso

É a parte mais sensível: um cálculo errado cobra errado do cliente. **O sistema
deve ser configurável, e a fórmula precisa ser validada pelo Vinícius.**

**Parâmetros por contrato**, com um padrão do escritório:

| Parâmetro | Opções | Protótipo hoje |
|---|---|---|
| Multa por atraso | % sobre o valor da parcela, cobrada uma vez | 10% |
| Juros de mora | % ao mês, simples, proporcional aos dias; ou "taxa legal" | 1% ao mês |
| Correção monetária | Nenhuma, IPCA, INPC ou IGP-M | Não existe |
| Carência | Dias depois do vencimento sem encargos | Não existe |

**Referências para ele validar** (não são decisão nossa):

- Desde a **Lei 14.905/2024**, quando o contrato não diz nada, a correção é pelo
  **IPCA** e os juros legais são a **Selic menos o IPCA**, em juros simples; se
  o resultado for negativo, vale zero (arts. 389 e 406 do Código Civil).
- **Limite da multa:** há discussão sobre aplicar ou não a contrato de
  honorários o limite de 2% do Código de Defesa do Consumidor. O protótipo usa
  10%.
- **Nome:** o protótipo chama de "multa compensatória"; para atraso, o termo
  usual é multa moratória.

**Exemplo ilustrativo**, com números fictícios — parcela de R$ 1.000,00 vencida
há 45 dias, multa de 2%, juros de 1% ao mês e correção de 0,80% no período:

| Etapa | Cálculo | Valor |
|---|---|---|
| Valor corrigido | 1.000,00 × 1,0080 | R$ 1.008,00 |
| Multa (2%) | 1.008,00 × 2% | R$ 20,16 |
| Juros (1% ao mês por 45 dias) | 1.008,00 × 1,5% | R$ 15,12 |
| **Total hoje** | | **R$ 1.043,28** |

A ordem das operações (multa sobre o valor corrigido ou o original, juros sobre
qual base) é decisão jurídica dele. O sistema implementa a regra que ele
definir e **sempre mostra a memória do cálculo**, que também sai na exportação.

- **O valor congela na data do pagamento:** recebido em 15/09, o cálculo
  daquele dia fica gravado com o recebimento.
- **Índices:** a mesma API gratuita do Banco Central que o protótipo já usa nas
  calculadoras.

### 6.6 Divisão do faturamento entre os sócios

Só ele pode definir. Modelos comuns, para a conversa:

| Modelo | Como funciona | Observação |
|---|---|---|
| Igual | Resultado ÷ número de sócios | O mais simples |
| Cota fixa | Cada sócio tem um percentual definido por eles | Cotas editáveis, com histórico |
| Por origem | Quem trouxe o cliente fica com uma parte; o resto é dividido | Exige marcar a origem em cada contrato |
| Por trabalho | Proporcional às horas registradas em Atualizações | Depende do módulo Atualizações |
| Misto | Uma parte cobre as despesas e o restante segue outra regra | Comum em escritórios pequenos |

Dentro de qualquer modelo, falta decidir:

- As despesas saem **antes** da divisão?
- Êxito e sucumbência seguem a mesma regra?
- Retiradas e adiantamentos a sócio entram como saída?
- Vinícius e Juliana contam como uma cota ou duas?

### 6.7 Telas

| Tela | Conteúdo |
|---|---|
| Painel do mês | Entrou, Saiu, Resultado, A receber no mês, Em atraso (já atualizado). Gráfico de 12 meses. Avisos: vence em 7 dias, em atraso, contas a pagar. |
| Recebíveis | Todas as parcelas, com filtros (a vencer, vencidas, pagas, período, cliente, sócio). Ação principal: "Recebido". |
| Contratos | Agrupados por cliente, como no protótipo, com saldo e histórico. |
| Em atraso | Lista de cobrança com valores atualizados, "Preparar mensagem" e "Registrar cobrança". |
| Contas do escritório | Contas do mês, recorrentes e totais por categoria. |
| Fechamento | Mês a mês: pendências, resultado, divisão, fechar e reabrir. |
| Relatórios | Mensal, anual, por categoria, por sócio. Exportação de segurança. |
| Configurações | Critério padrão de atraso, categorias, formas de pagamento, regra de divisão e cotas. |

### 6.8 O que o sistema guarda

Todo item abaixo carrega também os campos de auditoria (5.3).

| Registro | Campos |
|---|---|
| Contrato financeiro | Cliente, processo (opcional), descrição, tipo de honorário, valor total, entrada (valor e data), número de parcelas, sócio responsável ou de origem, critério de atraso, situação (ativo, quitado, renegociado, cancelado), observações |
| Parcela | Contrato, número, vencimento, valor original, situação (a vencer, vencida, paga em parte, paga, renegociada, cancelada) |
| Recebimento | Parcela ou entrada avulsa, data, valor, forma, encargos recebidos, memória do cálculo do dia, comprovante, estorno e motivo |
| Conta do escritório | Descrição, categoria, valor, vencimento, data e forma de pagamento, quem pagou, recorrência, situação |
| Cobrança registrada | Parcelas, data, quem cobrou, canal, texto enviado |
| Fechamento | Mês, totais, divisão por sócio, quem fechou e quando, reaberturas com motivo, arquivos gerados |
| Configuração | Multa, juros, índice, carência, categorias, formas de pagamento, regra de divisão, cotas |

### 6.9 Fora da primeira versão

| Fica de fora | Por quê | Caminho barato para depois |
|---|---|---|
| Conexão com o banco | Custo; decisão dele | Importar o extrato em arquivo (OFX ou CSV) baixado do internet banking e conferir no sistema |
| Boleto e Pix de cobrança automáticos | Custo por transação e contrato com banco | Chave Pix fixa na mensagem de cobrança, que é grátis |
| Emissão de nota fiscal de serviço | Integração com a prefeitura, normalmente por serviço pago | Guardar o número da nota emitida por fora |
| Cobrança automática por WhatsApp ou e-mail | Ele quer avisar, não enviar; a API do WhatsApp é cobrada por mensagem | "Preparar mensagem" para copiar |
| Contabilidade completa | É trabalho do contador | Planilha no formato que o contador pedir |

### 6.10 Critérios de aceite

- [ ] Criar um contrato com entrada e parcelas em menos de um minuto.
- [ ] Dar baixa em parcela com dois cliques; pagamento parcial funciona.
- [ ] Parcela vencida mostra o valor atualizado com a memória do cálculo,
      conferida pelo Vinícius em três casos reais.
- [ ] Contas recorrentes aparecem sozinhas todo mês.
- [ ] O painel responde entradas × saídas do mês e do ano.
- [ ] Fechamento do mês com divisão entre sócios, em PDF e em planilha que abre
      certa no Excel.
- [ ] Nada se apaga; todo lançamento mostra quem fez e quando.
- [ ] A secretária lança, mas não vê a divisão (se essa for a regra).
- [ ] A exportação completa de segurança funciona.

---

## 7. Agenda

### 7.1 Objetivo

**Cada um saber o que cada um está fazendo, e cliente nunca esperar** — sem
abandonar o Google Agenda que eles já usam.

### 7.2 O ponto que decide tudo

O cliente marca horário pelo **link de agendamento do Google**, e esse link
confere a disponibilidade **na agenda do Google**.

> **O Google só respeita o que está no Google.** Um bloqueio ou uma audiência
> lançados só no sistema não impedem que um cliente marque aquele horário pelo
> link.

Consequência: o Google Agenda precisa continuar sendo a agenda oficial, e tudo
o que nasce no sistema tem de chegar até ele.

### 7.3 Opções

| Opção | Como funciona | Custo | Esforço | Problema |
|---|---|---|---|---|
| A. Importar e exportar o mês (o que ele sugeriu) | Toda sexta alguém exporta do Google e importa no sistema | R$ 0 | Baixo | Trabalho manual toda semana; agenda desatualizada entre uma sexta e outra; o que nasce no sistema não chega ao Google |
| B. Painel que lê o Google | O sistema lê as agendas dos quatro sozinho, a cada poucos minutos | R$ 0 | Baixo a médio | Só leitura: bloqueio e audiência do sistema ainda precisam ser lançados no Google à mão |
| **C. Integração nos dois sentidos (recomendada)** | Lê as quatro agendas e grava no Google o que nasce no sistema | R$ 0 (API gratuita) | Médio | Configuração inicial com cada advogado; o caminho depende de Gmail ou Workspace |
| D. Agenda própria, sem Google | Tudo dentro do sistema | R$ 0 | Alto | Perde o link de agendamento e o aplicativo no celular que eles já usam |

**Recomendação:** C, feita em dois passos. Primeiro B, que já resolve "cada um
sabe o que cada um está fazendo"; depois a escrita no Google.

### 7.4 Como conectar ao Google, sem código

| Caminho | Como funciona | Serve para |
|---|---|---|
| Endereço secreto iCal | Cada agenda do Google tem um link privado de leitura. Colado no sistema, permite ler a agenda. | Leitura rápida, sem configuração. O link precisa ser guardado como uma senha. |
| Conta de serviço (Gmail comum) | Cada advogado compartilha a própria agenda com o e-mail técnico do sistema, com permissão para editar eventos. | Leitura e escrita **sem Google Workspace** e sem aprovação do Google. Não convida participantes, e não é preciso. |
| Autorização do domínio (Google Workspace) | O administrador do Workspace autoriza o sistema para o domínio inteiro. | Leitura e escrita sem que cada um compartilhe nada. |

> ⚠️ **Armadilha a evitar:** a autorização pelo "entrar com Google" (OAuth) num
> aplicativo em modo de teste **expira a cada 7 dias**, e tirar o aplicativo do
> modo de teste exige verificação do Google. Por isso os caminhos acima.
>
> **Antes de orçar:** um teste técnico de um dia com a agenda de um advogado,
> para confirmar o caminho escolhido.

### 7.5 Funcionalidades da primeira versão

1. **Semana de todos** — colunas por dia, cores por advogado (como no
   protótipo), filtro por advogado. Horário livre, não só 9h–12h e 14h–18h.
2. **Hoje** — a tela de abertura do sistema (o "Escritório Virtual"): quem
   atende quem, a que horas, e as audiências do dia.
3. **Tipos de compromisso** — Atendimento (presencial, online, retorno),
   Audiência, Bloqueio (ausência, férias, diligência), Interno (reunião).
   Prazo não é compromisso: fica no módulo Prazos.
4. **Criar pelo sistema** — atendimento, audiência e **bloqueio de vários
   dias**, gravados na agenda do Google do advogado.
5. **Conflito** — aviso ao marcar num horário ocupado, contando o que está no
   Google.
6. **Privacidade** — compromisso pessoal marcado como particular no Google
   aparece para os outros só como "Ocupado".
7. **Imprimir** — semana ou dia em PDF, para a recepção.

**Desejável — ataca direto o "cliente esperando":**

8. **Chegada do cliente** — a secretária marca "chegou" e o advogado vê há
   quanto tempo o cliente espera. Ao iniciar o atendimento, pode disparar o
   cronômetro do módulo Atualizações.

### 7.6 Lembretes

- **No sistema:** compromissos do dia, audiência de amanhã, bloqueios da
  semana.
- **Para o cliente:** no Gmail comum, o link de agendamento do Google não manda
  lembrete automático (isso é recurso pago do Workspace). O sistema **prepara**
  a mensagem ("Lembrete: amanhã às 14h com Dra. Juliana") para copiar no
  WhatsApp.
- **Para o advogado:** o alerta do próprio evento no Google Agenda do celular.
  A "Notificação" do protótipo (15 min a 1 dia antes) vira esse alerta.

### 7.7 Regras

- Fuso horário de Brasília.
- Duração padrão por tipo (ex.: atendimento de 1 hora, retorno de 30 minutos),
  a confirmar.
- **Intervalo mínimo entre atendimentos** (ex.: 15 minutos), para não
  encavalar — é o "entra-sai" que ele quer.
- Feriados nacionais, do Paraná e de Paranaguá. O recesso forense (20/12 a
  20/01) interessa mais ao módulo Prazos.

### 7.8 Fora da primeira versão

| Fica de fora | Por quê |
|---|---|
| Lembrete automático por WhatsApp ou SMS | Custo por mensagem; ele quer avisar, não enviar |
| Página de agendamento própria no lugar do link do Google | O link do Google já funciona e é grátis |
| Reserva de sala | Não foi pedido |
| Outlook ou agenda do iPhone | Eles usam Google |
| Link de videochamada automático | Dá para acrescentar depois |

### 7.9 Critérios de aceite

- [ ] A semana dos quatro advogados aparece no sistema sem ninguém digitar nada.
- [ ] Compromisso criado no Google aparece no sistema em poucos minutos.
- [ ] Bloqueio de vários dias criado no sistema aparece no Google e impede
      agendamento pelo link.
- [ ] Audiência vinda de publicação cai na agenda do Google do responsável.
- [ ] Conflito de horário é avisado antes de salvar.
- [ ] Compromisso particular aparece para os outros só como "Ocupado".

---

## 8. Custos

### 8.1 Infraestrutura

Preços de setembro de 2026, em dólar. Conferir câmbio e valores antes de propor.

| Item | Piloto | Produção | Observação |
|---|---|---|---|
| Banco de dados, login e arquivos (Supabase) | Plano gratuito: US$ 0 | Pro: US$ 25/mês | O plano pago inclui backup diário. Tem região em São Paulo. |
| Hospedagem do sistema (Vercel) | Hobby: US$ 0 | Pro: US$ 20/mês por membro da equipe de desenvolvimento | O Hobby é **só para uso não comercial**. Um escritório é uso comercial, e isso vale também para o site institucional, se ficar lá. |
| API do Google Agenda | US$ 0 | US$ 0 | As cotas gratuitas sobram para uma equipe deste tamanho |
| Índices do Banco Central | R$ 0 | R$ 0 | API pública |
| E-mail do sistema (recuperação de senha, resumo do dia) | US$ 0 | US$ 0 | O volume de um escritório cabe em planos gratuitos |
| **Total** | **US$ 0** | **≈ US$ 45/mês** | |

### 8.2 A mensalidade de vocês

O valor é decisão de vocês. Uma estrutura para apresentar do jeito que ele
pediu ("para fazer isso vai dar X, vai dar Y"):

- **Mensalidade** = infraestrutura + manutenção (correções, atualizações,
  backup conferido, suporte) + um pacote de horas de evolução.
- **Cada fase nova** com valor próprio, somado à mensalidade ou pago à parte.
- **Tabela "o que está incluso"**, para evitar o "eu não pedi isso" que ele
  mesmo citou.
- **Referência que ele deu:** a ferramenta de publicações que ele usa custa
  R$ 220/mês e faz menos; as completas custam de R$ 700 a R$ 900, e algumas
  R$ 3.000/mês. É a régua de valor dele — não é o preço de Agenda + Financeiro.

---

## 9. Fases, esforço e riscos

### 9.1 Fases

| Fase | Entrega | Útil sozinha? |
|---|---|---|
| 0. Base | Login individual, perfis, auditoria, banco, backup, exportação de segurança, migração do protótipo | Não — é pré-requisito |
| 1. Financeiro essencial | Contratos, parcelas, recebimentos (inclusive parciais), contas e recorrentes, painel do mês, exportação | Sim — já substitui a planilha |
| 2. Financeiro completo | Atraso com correção e memória do cálculo, cobrança registrada, fechamento com divisão entre sócios | Sim |
| 3. Agenda: leitura | Semana dos quatro lida do Google, tela "Hoje", aviso de conflito | Sim |
| 4. Agenda: escrita | Bloqueios, audiências e atendimentos do sistema gravados no Google | Sim |
| 5. Ligações | Clientes, horas de Atualizações, Publicações → Agenda | Depende dos outros módulos |

### 9.2 Ordem de grandeza do esforço

Semanas de trabalho de uma pessoa dedicada, com testes. Serve para calibrar o
orçamento; não é prazo.

| Fase | Esforço |
|---|---|
| 0. Base | 2 a 3 semanas |
| 1. Financeiro essencial | 3 a 4 semanas |
| 2. Financeiro completo | 2 a 3 semanas |
| 3. Agenda: leitura | 1 a 2 semanas |
| 4. Agenda: escrita | 2 semanas |
| **Agenda + Financeiro** | **10 a 14 semanas** |

Cabe no "4, 5 meses não tem problema" que ele disse [~24:30].

### 9.3 Riscos

| Risco | Efeito | Como reduzir |
|---|---|---|
| Cálculo de atraso errado | Cobrança errada; problema com cliente | Vinícius define a regra e confere casos reais antes de liberar; memória do cálculo sempre visível |
| Regra de divisão indefinida | Fechamento do mês não sai | Decidir antes da fase 2 |
| Ninguém lança os dados | Sistema vazio — "começam e não fazem", disse ele sobre conteúdo | Lançamento em segundos, recorrentes automáticas, painel útil desde o primeiro dia |
| Conexão com o Google | Agenda não sincroniza | Teste técnico de um dia antes de orçar; plano B é a leitura pelo endereço iCal |
| Dados sensíveis | Vazamento de dados financeiros e de clientes (LGPD) | Login individual, permissões, backup, servidor no Brasil |
| Crescimento de escopo | O protótipo tem 14 módulos | Orçar por fase; cada fase fecha antes da próxima |
| Dados presos no protótipo | O que ele já lançou fica no navegador dele | Usar a exportação de backup que o protótipo já tem |

---

## 10. Perguntas para o Vinícius

### Financeiro

1. Como vocês dividem o faturamento hoje: em partes iguais, por cota, por quem
   trouxe o cliente ou por trabalho? As despesas saem antes?
2. Quem entra na divisão? Vinícius e Juliana contam como uma cota ou duas?
3. Quais tipos de honorários vocês usam: fixo parcelado, êxito, sucumbência?
   Êxito e sucumbência seguem a mesma divisão?
4. Qual critério de atraso vocês querem: multa de quanto, juros de quanto,
   correção por qual índice? Vale para todos os contratos ou muda por contrato?
5. Acontece pagamento parcial? E renegociação?
6. Quem lança no dia a dia: você, a secretária, cada advogado?
7. A secretária pode ver quanto cada sócio recebe?
8. Quais contas são fixas todo mês, e em que dia vencem?
9. Algum sócio paga conta do escritório do próprio bolso e precisa de
   reembolso?
10. O contador pede algum formato de relatório?
11. Há dados no protótipo que precisam vir junto?

### Agenda

12. Vocês usam Gmail comum ou Google Workspace (e-mail com o domínio do
    escritório)?
13. Cada advogado tem a própria agenda no Google, ou existe uma agenda do
    escritório?
14. O link de agendamento que vocês mandam ao cliente é de cada advogado ou um
    só?
15. Todos devem ver a agenda de todos? O que é particular? Na reunião, o
    advogado "não mexe" em Agenda — isso é não ver ou não editar a dos outros?
16. A secretária marca e remarca pelos advogados?
17. Qual a duração padrão de um atendimento? Atendem sábado ou fora do horário
    comercial?
18. Faz sentido registrar a chegada do cliente e o tempo de espera?

### Base

19. Na reunião você disse que "um login já tá safo", mas também quer saber quem
    apagou o quê. Podemos ter um login por pessoa? Sem isso não há como provar
    quem fez o quê.
20. Qual o teto mensal confortável para o sistema?

---

## 11. Glossário

| Termo | Significado |
|---|---|
| API | Porta pela qual um sistema conversa com outro — por exemplo, o sistema lendo o Google Agenda |
| Backup | Cópia de segurança dos dados |
| Conta de serviço | E-mail técnico do sistema, com o qual o advogado compartilha a agenda |
| Endereço iCal | Link secreto que permite ler uma agenda do Google |
| Estorno | Desfazer um lançamento sem apagá-lo; fica registrado |
| Fechamento do mês | Foto do mês que não muda depois de conferida |
| LGPD | Lei Geral de Proteção de Dados |
| Memória do cálculo | O passo a passo de como um valor atualizado foi calculado |
| OFX | Arquivo de extrato que o banco permite baixar |
| Primeira versão (MVP) | O mínimo que já resolve o problema |
| SGS | Sistema de séries do Banco Central (IPCA, Selic e outros índices) |

---

### Fontes externas consultadas

- [Supabase — preços em 2026 (MakerKit)](https://makerkit.dev/blog/saas/supabase-pricing)
- [Vercel — preços em 2026 (CostBench)](https://costbench.com/software/developer-tools/vercel/)
- [Google OAuth — tokens de 7 dias em modo de teste (Unipile)](https://www.unipile.com/google-oauth-refresh-token/)
- [Google Agenda via conta de serviço com agenda compartilhada (CData)](https://www.cdata.com/kb/articles/googlecalendar-service-authentication.rst)
- [Google Agenda — recursos premium da página de agendamento](https://support.google.com/calendar/answer/16287038?hl=en)
- [Lei 14.905/2024 — taxa legal (Cálculo Jurídico)](https://calculojuridico.com.br/nova-taxa-legal-lei-14905/)
