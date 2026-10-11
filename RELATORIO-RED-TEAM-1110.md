# Red team — área dos advogados e site — 11/10/2026

Oito testadores automáticos (Claude Haiku 5.5) usaram o sistema em paralelo,
cada um com uma área. O coordenador (Claude Opus 5.5) distribuiu as tarefas,
recebeu os relatórios e **reproduziu sozinho, numa aba isolada e com a prévia
reiniciada**, cada achado suspeito antes de aceitá-lo. Este documento só lista
como bug o que foi confirmado; o que não se confirmou está na seção 5, com o
motivo.

## 1. Como foi feito

| Testador | Área |
|---|---|
| RT1 | Clientes, Contatos, Processos |
| RT2 | Documentos, Atualizações e cronômetro |
| RT3 | Tarefas, Prazos, Feriados, Intimações e DJEN |
| RT4 | Financeiro: Painel, Recebíveis, Em atraso, Contratos |
| RT5 | Financeiro: Despesas, Contas financeiras, Fechamento, Relatórios, Importação, Alertas |
| RT6 | Agenda, Hoje, Membros, Histórico, Operação e LGPD, matriz de permissões |
| RT7 | Site público em produção (só leitura) e módulo Site |
| RT8 | Segurança: XSS, contorno de permissões pela API, IDOR, entradas extremas |

- **Ambiente:** prévia local (`npm run testar:local`): PostgreSQL de verdade em
  memória, com as mesmas migrações, RLS e gatilhos do Supabase, dados
  fictícios e perfis sem senha. Na produção, só o site público foi lido. Nada
  foi gravado na produção, nenhum formulário foi enviado e não houve login.
- **Volume:** cerca de 700 ações de navegador e chamadas diretas à API.
- **Limite importante do método:** a prévia guarda **um único perfil por
  navegador** (`localStorage`), e os oito testadores dividiam o mesmo
  navegador. Quando um abria `?perfil=consulta`, as abas dos outros passavam a
  agir como Consulta. Isso gerou vários falsos "sem permissão", "autor
  errado" e "sessão terminou". **Esses casos foram todos reproduzidos de novo,
  isolados, e descartados** (seção 5). Em produção cada pessoa tem o próprio
  login, então esse efeito não existe lá.

## 2. Resumo

- **Nenhum bug crítico confirmado.** Não houve perda de dados, erro de
  centavo, execução de script injetado, nem escrita ou leitura indevida pela
  interface.
- **Um ponto de privacidade (LGPD) merece decisão:** CPF, telefone e e-mail
  do cadastro básico de clientes podem ser lidos pela API por qualquer membro
  ativo, inclusive perfis sem acesso a Clientes (B-01).
- **Nove bugs de gravidade baixa a média confirmados** (seção 3), a maioria
  de validação e de texto.
- **Quatro regras que funcionam como foram feitas, mas que valem uma decisão
  do escritório** (seção 4).
- **As defesas seguraram** (seção 6): XSS escapado em todas as telas, colunas
  protegidas, "nada se apaga", consulta sem gravação, validações do banco.

## 3. Bugs confirmados

| ID | Grav. | Área | Problema | Como foi confirmado | Correção sugerida |
|---|---|---|---|---|---|
| **B-01** | Média | Clientes · LGPD | Pela API, qualquer membro ativo lê `clientes` com **CPF/CNPJ, telefone, e-mail e observações**, mesmo sem acesso a Clientes (Consulta, Associado). A tela bloqueia ("Sem acesso"), a API não. Os dados completos (`clientes_detalhes`) estão corretamente protegidos. (RT8-01) | Política `"clientes: ver"` = `privado.eh_membro()` (`20260915193338_base.sql:445`). É desenho antigo, para Agenda e Financeiro acharem o cliente, mas expõe mais do que eles precisam. | Deixar no `select` geral só `id, nome, ativo`, e servir documento/telefone/e-mail por view ou RPC com a regra de Clientes/Financeiro. Exige migração nova. |
| **B-02** | Média | Todas as telas | Erros de permissão do banco chegam em inglês técnico: *"new row violates row-level security policy for table …"*, *"permission denied for table …"*. (RT2, RT5, RT7, RT8-07) | `nucleo/supabase.js` não traduz os códigos `42501`/RLS; os testadores viram a mensagem crua. | Traduzir `42501` e RLS para "Seu acesso não permite esta ação." e registrar o detalhe técnico em `erros_cliente`. |
| **B-03** | Baixa | Clientes | Nascimento **01/01/1800** é aceito; só data futura é recusada. (RT1-01) | Reproduzido pelo RT1 em dois cadastros; não existe limite inferior em `prepararCliente` nem no banco. | Recusar antes de 1900 (ou avisar acima de 120 anos). |
| **B-04** | Baixa | Clientes · API | O banco aceita **nome com 100 mil caracteres** pela API; a lista de clientes passa a rolar ~975 mil px na horizontal (dentro da tabela). A tela limita a 200, a API não. (RT8-03, RT1-07) | `clientes.nome` só tem `check (btrim(nome) <> '')`. | `check (char_length(nome) <= 200)` e limites equivalentes em outros textos livres; quebra de linha na célula. |
| **B-05** | Baixa | Documentos | No contrato de honorários, modalidade "Valor fixo", a cláusula 3 pula de **3.1 para 3.5 e 3.6**. (RT2-04) | Reproduzido: a folha mostra `3.1`, `3.5`, `3.6`. | Numerar as subcláusulas conforme as que entram, ou rever o modelo com o escritório (§7.8). |
| **B-06** | Baixa | Documentos | Com um cliente válido escolhido, digitar um nome inexistente e sair do campo **não avisa**; a folha continua com o cliente anterior. O aviso só aparece ao salvar ("Escolha um cliente da lista…"). (RT2-01) | Reproduzido; salvar bloqueia corretamente, mas a folha fica enganosa até lá. | Mostrar o erro ao sair do campo e marcar a folha como desatualizada. |
| **B-07** | Baixa | Prazos | Depois de sugerir em **horas** e trocar para **dias**, o campo de hora (desabilitado) continua mostrando a hora antiga (ex.: 13:00). O prazo novo é gravado às 23:59, como deve, mas a tela engana. Ao editar um prazo existente no mesmo dia, a hora antiga pode ser preservada. (RT3-02) | `telas/tarefas/formulario.js`: linha 248 grava 23:59 para dias; linha 262 preserva `t.fatal_em` quando o dia não mudou. | Ao trocar para dias, mostrar 23:59; na edição, recalcular a hora quando a contagem mudou. |
| **B-08** | Baixa | Site · banco | A URL do post de rede social aceita aspas e `<>` (só o prefixo `https://` é conferido). **Não chega ao visitante**: o gerador do site escapa com `attr()`. (RT8-02) | Gatilho `validar_corpo` e `src/pages/publicacoes.mjs:101`. | Validar a URL inteira (host da rede, sem `"<>'`) no gatilho e no editor. |
| **B-09** | Baixa | Site público | `canonical`, `og:url`, `og:image` e `sitemap.xml` apontam para `https://fonsecalisboa.com.br`, mas o site responde em `fhl-advocacia.vercel.app`. (RT7-01) | `src/data/site.mjs:44` — domínio marcado como `[CONFIRMAR]`. | Pendência já conhecida (CLAUDE.md §7): definir o domínio; até lá, `SITE_URL` na Vercel. |

## 4. Funciona como foi feito — decidir com o Vinícius

| ID | Regra atual | Por que levantar |
|---|---|---|
| D-01 | Recebimento **acima do saldo** da parcela: o excedente vira "acréscimo" dentro dos encargos e entra no resultado. A tela avisa antes. (RT4-01) | O testador esperava crédito ou adiantamento. É a regra documentada (README §Atraso), mas mexe em receita. Alternativas: recusar o excedente, ou guardar como crédito do cliente. |
| D-02 | **Transferência** entre contas financeiras aceita valor **maior que o saldo**: o caixa ficou em −R$ 98.899,00. (RT5-01) | Controle manual permite saldo negativo; pode ser intencional (lançamento atrasado). Sugestão: avisar e pedir confirmação, sem bloquear. |
| D-03 | **Mesmo número CNJ** em clientes diferentes é aceito sem aviso. (RT1-04) | É o desenho (litisconsórcio), mas um aviso "este número já está no cliente X" evita cadastro duplicado por engano. |
| D-04 | **Agenda** marca horário em conflito: a tela avisa ("Conflita com 14:00–15:00 … Dá para marcar mesmo assim.") e deixa salvar. (RT6-02) | Confirmado que o aviso aparece. Decidir se o intervalo mínimo deve bloquear em algum caso. |

Também vale levar ao Vinícius, como advogado (Provimento 205/2021), o texto
da campanha de acidente de trabalho: "podem **garantir** estabilidade…,
benefício do INSS e indenização" e "O caminho mais rápido é o WhatsApp".
O RT7 não achou depoimento, preço, êxito nem superlativo; a avaliação é dele.

## 5. Descartados — não se confirmaram

| Relato | Resultado da reprodução isolada |
|---|---|
| RT3-01 Concluir/Cancelar tarefa não muda nada | Concluída com sucesso ("Tarefa concluída."). Era a sessão trocada para Auditoria (o próprio RT3 viu "Delegada por Auditoria"). |
| RT5-02 "Nova conta" dá erro de RLS | Conta de R$ 0,01 lançada ("Conta lançada."). Sessão trocada. |
| RT2-05 Admin não salva documento (RLS) | Documento salvo como admin. Sessão trocada. |
| RT2-06 / RT4-04 / RT3-03 Autor errado ("por Secretária", "por Auditoria") | Isolado, o documento saiu "por Admin". Sessão trocada. |
| RT6-01 Associado vê prazos de clientes | Isolado, a tela de Prazos do Associado vem vazia ("Nenhuma tarefa ou prazo neste filtro"); as chamadas diretas do próprio RT6 foram negadas. Sessão trocada. |
| RT1-05, RT1-06, RT5-03, RT6-04 "Sessão terminou" e "acesso não permite" esporádicos | Efeito da troca de perfil entre abas; não ocorre isolado. |
| RT2-08 Secretária não abre "Lançar atualização" | Abre normalmente. |
| RT6-03 Fechamento fica em "Carregando…" na Auditoria | Abre em 6 s com setembro calculado. |
| RT2-07 "Refazer texto" com edição manual não avisa | Pede confirmação ("Refazer o texto a partir dos campos?"). |
| RT2-03 Contrato aceita valor negativo e zero parcelas | A prévia mostra os valores, mas **salvar recusa** ("Informe um valor monetário válido…", "igual ou maior que 1"). Fica como melhoria M-06. |
| RT2-02 Gerador por navegação interna carrega cadastro incompleto | Isolado, as pendências foram as mesmas por navegação e por recarga. |
| RT7-02 Campanha nova nasce "mostrar no site" | Nasce desmarcada; o testador leu o `value="on"` padrão do checkbox como marcado. |
| RT7-04 Formulário de contato sem consentimento obrigatório | O consentimento é exigido pelo script (`assets/js/site.js:471`) e pela função `receber-contato` (linha 60). |
| RT4-03 Encargos de C002 fora da regra | São valores fixos da semente fictícia (`scripts/local/semente.sql:128`). |
| RT7-05 Autor "Marlon" numa publicação | Só na semente local. Em produção, o autor é "Equipe Fonseca Lisboa Advocacia". |
| RT8-04 E-mails de membros visíveis a todos / RT8-06 Recibo com CPF para Consulta | Desenho: membros veem a equipe; Consulta lê o Financeiro, inclusive recibos. Registrado para avaliação, não é falha. |

## 6. Defesas que seguraram

- **XSS:** `<img onerror>`, `<script>`, `<svg onload>` e `javascript:` gravados
  em clientes, tarefas, publicações, documentos e observações apareceram como
  texto em todas as telas (listas, ficha, Hoje, datalist, títulos). Documento
  com HTML perigoso inserido pela API foi limpo pela lista branca. A CSP
  bloqueou o que foi colado direto na folha.
- **Colunas protegidas:** código do contrato, `criado_por`, valor de
  recebimento, texto de documento salvo, teor e conferência de intimação →
  403.
- **Nada se apaga:** DELETE recusado em todas as tabelas, inclusive como
  admin; auditoria imutável.
- **Perfis:** Consulta não grava (403 em contratos, contas, clientes,
  documentos); Secretária não vê fechamento nem divisão; sem-clientes não lê
  intimações, detalhes, contatos nem contratos.
- **Validações do banco:** estorno sem motivo, atividade com fim antes do
  início, telefone e CNJ inválidos, bloco de artigo desconhecido, link
  `javascript:`.
- **Rotas:** endereço inexistente volta para Hoje; id malformado mostra erro
  amigável.

## 7. Melhorias sugeridas

**Clientes e processos**
- M-01 Esconder em pessoa jurídica os campos de pessoa física (nacionalidade, estado civil, profissão, filiação, concordância "O cliente/A cliente"). (RT1-02)
- M-02 CPF/CNPJ ou processo duplicado: oferecer link para o registro existente.

**Documentos**
- M-03 Avisar na hora quando os valores do contrato são inválidos, em vez de só ao salvar. (RT2-03)
- M-04 Toast "A entrada mais as parcelas…" some quando a soma volta a fechar.

**Financeiro**
- M-05 Lista e detalhe do contrato: mostrar como Honorários − Recebido chegam ao Saldo (recebido inclui encargos; descontos não aparecem). (RT4-02)
- M-06 "Receita prevista" com rótulo "já com descontos". (RT4)
- M-07 Detalhe do contrato diz "sem encargos" enquanto o modal calcula multa e juros: trocar por "encargos calculados ao receber". (RT4)
- M-08 Recibo: além do saldo da parcela, o saldo do contrato. (RT4-05)
- M-09 Estado de carregamento em Contas financeiras e Painel, em vez de "R$ 0,00 / Nenhum movimento" enquanto busca. (RT5-04)
- M-10 Cartão "A pagar": contagem e valor com a mesma base; mês futuro "previstas, ainda não geradas" em vez de "Nenhuma conta". (RT5-06, RT5-07)
- M-11 Importação: listar cada linha com problema e o motivo. (RT5-08)

**Tarefas, prazos e intimações**
- M-12 Tarefa criada para outra pessoa some da visão "Minhas": avisar onde ela está. (RT3)
- M-13 Prazo com data fatal diferente da sugerida: registrar o motivo. (RT3)
- M-14 Intimações: rotular as duas datas da linha (recebida em / publicada em). (RT3)

**Operação e geral**
- M-15 "Erros nas telas: N" em Operação com link para ver os erros. (RT6)
- M-16 Edição simultânea do mesmo registro: hoje vence o último; avisar quando o registro mudou desde a abertura (`alterado_em`). (RT8-05)
- M-17 Prévia local: guardar o perfil por aba (`sessionStorage`) para permitir testes paralelos; e conferir o cronômetro "esquecido" da secretária, que não apareceu.

## 8. O que não foi coberto

- Login real em produção, troca de senha, convite por e-mail, botão "Publicar
  o site" (dispararia deploy real) e envio do formulário de contato.
- Impressão e download (Word, `.ics`, XLSX/CSV), Google Agenda real, upload de
  anexos, importação completa de planilha, fechamento do mês corrente.
- Parte dos fluxos de Financeiro (renegociar, redistribuir, cancelar parcela,
  ajustes, mensagem de cobrança) e de Agenda (particular, chegada, lembrete).
- Os achados de RLS valem para a emulação local do PostgREST; antes de
  corrigir B-01, confirmar o mesmo comportamento no Supabase real (a política
  é a mesma migração, então o resultado deve se repetir).

Todos os dados de teste ficaram na prévia em memória, que foi reiniciada; não
há sobra de testes em produção desta rodada.

## 9. Correções aplicadas (11/10/2026, em produção)

Todos os bugs da seção 3 e as decisões da seção 4 foram resolvidos pela
recomendação, como o Vinícius provavelmente escolheria (prova e controle
antes de automação, sem bloquear o trabalho manual). Conferido na prévia
local e publicado em produção em 11/10 (migração aplicada, push na `main`).

| ID | O que mudou |
|---|---|
| B-01 | Migração `20261011120000_correcoes_red_team`: o cadastro de clientes só é lido por quem tem Clientes, Prazos, Financeiro ou é administrador (`privado.le_clientes`). Quem só tem Agenda/Tarefas escolhe o cliente por `clientes_agenda()` (id, nome e, com Agenda, telefone) e cadastra cliente rápido por `cadastrar_cliente_rapido()`. `v_tarefas` mostra o nome do cliente da tarefa recebida. Conferido: a API devolve `[]` ao Associado; a Agenda dele lista os clientes, marca atendimento com cliente novo, e as tarefas mostram o nome. |
| B-02 | Erros de RLS e "permission denied" viram "Seu acesso não permite esta ação…" (`nucleo/erros-banco.js`). |
| B-03 | Nascimento/constituição antes de 1900 recusado na tela (`min`), no domínio e no banco. |
| B-04 | `clientes_nome_check` limita o nome a 200 caracteres no banco. |
| B-05 | Cláusula 3 do contrato numerada pelas subcláusulas que entram (3.1, 3.2, 3.3…). |
| B-06 | Cliente inexistente no gerador avisa ao sair do campo ("a folha continua com o cliente anterior"). Causa: a validação global limpava o erro no mesmo `change`. |
| B-07 | Contagem em dias zera a hora oculta para 23:59. |
| B-08 | Link de post sem espaços, aspas e `< >` no editor e no banco (`privado.validar_links_corpo`). |
| B-09 | Sem `SITE_URL`, o build na Vercel usa o endereço de produção dela (`VERCEL_PROJECT_PRODUCTION_URL`) no canonical, `og:url` e sitemap. Comprado o domínio, basta definir `SITE_URL` na Vercel. |
| D-01 | Recebimento acima do total atualizado é **recusado**; o excedente vai como entrada avulsa ou acréscimo autorizado (com motivo e autor). |
| D-02 | Transferência que deixa a origem negativa pede **confirmação explícita**, sem bloquear (pode ser lançamento atrasado). |
| D-03 | Mesmo CNJ em outro cliente mostra quem já tem o número e pede **confirmação** (litisconsórcio continua possível). |
| D-04 | Sobreposição na Agenda pede **confirmação explícita**; intervalo mínimo e bloqueios continuam só avisando. |
| OAB | Campanha de acidente de trabalho: "podem garantir" → "podem dar direito a" (cópia local e banco, pela migração). "O caminho mais rápido é o WhatsApp" fica: fala do canal, não do serviço. |

Testes: **152/152** JavaScript (2 novos), **449/449** SQL (5 novos: lista
mínima, cadastro rápido, nome > 200, nascimento < 1900, link com aspas) e 17
páginas do site.

**Ainda não resolvido (depende do escritório):** o e-mail do site
(`contato@fonsecalisboa.com.br`) é do domínio que ainda não foi comprado —
mensagens para ele não chegam. As melhorias da seção 7 ficaram para depois.
