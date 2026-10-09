# Handoff: Financeiro DOCX (T01–T17), DJEN, Clientes e Operação

**Data:** 09/10/2026
**Foco da próxima sessão:** revisar o diff e, **com a aprovação do Ithalo**, publicar em produção na ordem da §4. Até lá, nada vai ao ar.

> ⚠️ **Push na `main` publica na hora** (a Vercel faz o deploy sozinha).
> O frontend novo **não abre** sem as migrações: ele usa colunas, views e
> funções que só existem nelas. Ordem obrigatória: **banco → funções → push**.

---

## 1. Contexto

- **Pedido do Ithalo (08/10):**
  - implementar tudo o que faltava do [relatório de aderência ao DOCX](relatorio-especificacao-financeira.md) e da [preparação T01–T17](preparacao-financeiro-docx.md);
  - adicionar a API do CNJ (DJEN);
  - "não precisa fazer integração com banco".
- **Como foi interpretado "sem integração com banco":** sem OFX, Open Finance ou conciliação bancária. Também não foi aplicado nada no Supabase remoto.
- **2FA:** no meio do trabalho, o Ithalo disse "não precisa de 2FA". Foi removido e não existe em nenhum lugar.
- **Estado do repositório:** está todo **local, sem commit**. O working tree também carrega os ajustes de Tarefas e do editor de documentos de 08/10 (ver [AJUSTES-TAREFAS-DOCUMENTOS-FHL.md](AJUSTES-TAREFAS-DOCUMENTOS-FHL.md)), igualmente não commitados. Um commit vai levar os dois.
- **Produção hoje:** é o que foi publicado em 06/10 (E0–F8). A última migração aplicada no remoto é `20261006211332_corrigir_tarefa_memoria_nula`.
- **Dados de teste do Ithalo em produção:** 1 contrato, a conta "Luz" e o cliente "Rodrigo". **Não apagar.**

---

## 2. O que foi adicionado, área por área

### 2.1 Perfis de acesso (T04)

- **Financeiro `consulta`:** lê tudo o que o `completo` lê, inclusive fechamento e relatórios. **Não grava nada.** Serve para contador ou conferente.
- **Auditoria (`membros.acesso_auditoria = 'ver'`):** lê o histórico de todos os módulos e a tela Operação e LGPD.
- **No banco:** `privado.financeiro_le()`, `financeiro_lanca()`, `financeiro_ajusta()` e `audita()`. As políticas de leitura usam `financeiro_le`.
- **Na tela Membros:**
  - coluna "Histórico";
  - "Preencher com um modelo" (Financeiro, Consulta, Auditoria), que só preenche os níveis;
  - botão "Enviar convite" (ver §2.12).
- **Arquivos:** migração `20261008120000_perfis_capacidades.sql`, `sistema/js/nucleo/estado.js` (`pode.*`) e `telas/membros.js`.

### 2.2 Despesas e pagamentos (T01, T13)

- **Obrigação separada do pagamento:**
  - `contas.valor` é a obrigação.
  - Cada pagamento é uma linha em `pagamentos_despesa`: parcial, estorno com motivo, quem pagou, reembolso ao sócio, `chave_idempotencia`.
  - "Paga" quer dizer que o pago cobre o valor.
- **Regras:**
  - O pagamento não pode passar do saldo.
  - Mudar o valor de uma conta que já tem pagamento exige `motivo_ajuste`.
  - Conta com pagamento ativo não se cancela.
- **Cadastros novos:**
  - tipo (fixa, variável, extraordinária);
  - fornecedor (`fornecedores`);
  - centro de custo (`centros_custo`);
  - competência escolhida;
  - recorrência mensal, anual ou parcelada, com prévia do impacto ao mudar uma recorrente.
- **RPCs:** `registrar_pagamento_despesa`, `estornar_pagamento_despesa`, `registrar_reembolso`, `impacto_recorrente` e `aplicar_recorrente_em_abertas`.
- **Migração dos dados antigos (dentro da `…120200`):**
  - cada `contas.data_pagamento` vira um pagamento com origem `legado`;
  - um bloco final confere entradas, saídas e reembolsos por mês e **aborta a migração inteira** se algum total mudar.
- **Tela:** `telas/financeiro/contas.js`, com as abas Do mês, Recorrentes, Reembolsos e Fornecedores.

### 2.3 Contas financeiras, transferências e ajustes (T03)

- **Contas financeiras:**
  - `contas_financeiras` cadastra o caixa e os bancos, com saldo inicial;
  - nasce com "Caixa do escritório" como conta padrão;
  - cada recebimento e cada pagamento cai numa conta (a padrão, se ninguém escolher).
- **Transferências e saldos:**
  - `transferencias_financeiras` registra transferência entre contas, com estorno;
  - a view `v_movimentacoes_financeiras` junta todos os movimentos;
  - `v_saldos_contas` dá o saldo de cada conta.
- **Ajustes:** `ajustes_financeiros` registra desconto, abatimento e acréscimo, com motivo, quem autorizou e estorno (`conceder_ajuste`, `estornar_ajuste`).
- **Encargos do recebimento:** ficam discriminados em multa, juros, correção e acréscimo. Um `check` garante que a soma bate.
- **Tela:** `telas/financeiro/contas-financeiras.js`. Recebimento e ajuste ficam no contrato.

### 2.4 Contratos (T02)

- **Código:**
  - formato `C001/2026`, dado pelo banco pelo **ano da formalização**, com contador por ano (`privado.alocar_codigo`);
  - nunca muda;
  - o prefixo fica em Configurações;
  - contratos importados guardam o código da planilha.
- **Data do contrato:**
  - opcional;
  - sem ela, fica `data_contrato_origem = 'a_confirmar'`;
  - os contratos antigos migram assim e se confirmam em "Confirmar formalização".
- **Outras regras:**
  - vencimento no passado exige confirmação e motivo;
  - arquivar e desarquivar pedem motivo, e contrato arquivado não se altera;
  - "Redistribuir parcelas" mantém o total;
  - a view `v_contratos_plano` aponta quando as parcelas não fecham com o valor do contrato.
- **Migração:** `…120300_contratos_integridade.sql`.
- **Telas:** `contrato.js`, `contrato-novo.js` e `contratos.js` (paginada, com exportação).

### 2.5 Fechamento anual (T10)

- **Regra:** `fechar_ano` só funciona com o ano terminado e os 12 meses fechados.
- **Versões:** cada fechamento grava uma versão imutável (`fechamentos_anuais_versoes`).
- **Reabertura:** `reabrir_ano` pede motivo. Mês de ano fechado não reabre.
- **Posição em data de corte:** `posicao_financeira_em(date)` dá a foto do que existia naquela data.
- **Concorrência:** advisory locks impedem lançar enquanto alguém fecha.
- **Tela:** `fechamento.js`, aba Anual, e `fechamento-anual.js`.

### 2.6 Painel, relatórios e exportação (T09, T11)

- **Regra única:** `resumo_financeiro(p jsonb)` é a fonte dos números. Recebe período e filtros (cliente, responsável, contrato, categoria, centro, conta) e devolve indicadores, série mensal e a regra usada.
- **Taxa de recebimento:** das parcelas que venceram no período (até hoje), quanto já foi pago dividido pelo valor delas.
- **Relatórios:** nove — fluxo, a receber, inadimplência, contratos, recebimentos, despesas, pagamentos, anual e auditoria.
- **Exportação:**
  - XLSX gerado sem biblioteca (`nucleo/xlsx.js`, `nucleo/zip.js`) e CSV;
  - cada exportação fica registrada em `exportacoes`.
- **Telas:** `painel.js`, `relatorios.js` e `exportar.js`.

### 2.7 Recibo e anexos (T07)

- **Recibo:** sai do recebimento, com valor por extenso (`dominio/extenso.js`) e o saldo depois do pagamento. Ver `documentos/recibo.js` e o modelo `recibo` em `documentos`.
- **Anexos:**
  - o balde **privado** `anexos` é criado pela migração;
  - fluxo de envio: `reservar_anexo` (o banco confere a permissão e devolve um caminho opaco) → envio → função `finalizar-anexo` (confere o tipo real pelos bytes, procura conteúdo ativo em PDF e calcula o SHA-256);
  - o download é por link assinado de 1 minuto;
  - versão nova não apaga a anterior.
- **Onde aparecem:** contrato, recebimento, despesa, pagamento e ficha do cliente (`telas/anexos.js`).

### 2.8 Alertas (T12)

- **Pendências, calculadas na hora (`pendencias_financeiras`):**
  - parcelas e despesas vencidas ou vencendo;
  - despesa sem valor;
  - plano de parcelas divergente;
  - vigência terminando;
  - formalização a confirmar;
  - anexo incompleto;
  - mês passado aberto.
- **Eventos registrados (`eventos_alerta`):** fechamento, estorno, mudança de acesso e mudança de configuração. Cada pessoa marca lido, resolvido ou silenciado até uma data.
- **Nada é enviado por e-mail.**
- **Onde aparecem:** tela `telas/financeiro/alertas.js`, contador no menu e indicador em Início.

### 2.9 Importação da planilha antiga (T15)

- **Formato:** modelo próprio, em CSV ou XLSX, descrito em `dominio/importacao.js`. A planilha oficial do escritório ainda não chegou.
- **Leitura:**
  - aceita títulos sem acento e sinônimos;
  - ignora linhas de "Total";
  - célula vazia **não** vira "zero pago".
- **Fluxo:**
  1. `registrar_importacao` leva as linhas para a área de conferência.
  2. `validar_importacao` aponta erros e avisos linha a linha.
  3. Uma linha pode ser excluída com motivo.
  4. `carregar_importacao` carrega tudo numa transação só. Só quem tem Financeiro completo carrega.
- **Proteções:**
  - o mesmo arquivo (mesmo SHA) não carrega duas vezes;
  - a mesma chave de origem em outro arquivo é ignorada (`importacao_vinculos`).
- **Tela:** `telas/financeiro/importacao.js`.

### 2.10 Clientes (T14)

- **Novos campos:**
  - `clientes_detalhes.nome_fantasia`;
  - `etiquetas` (lista normalizada, com filtro e busca na lista de clientes).
- **Contatos (`clientes_contatos`):**
  - várias pessoas e canais por cliente;
  - um é o principal (`definir_contato_principal`);
  - "Recebe cobrança" define para quem vai a cobrança do Financeiro, e o Financeiro só enxerga esses contatos;
  - contato não se apaga, desativa;
  - o telefone e o e-mail atuais viraram o contato principal na migração.
- **CEP:** preenche o endereço pelo ViaCEP (gratuito, sem chave). Só o CEP sai do navegador.
- **Telas:** `telas/clientes/formulario.js`, `cliente.js` (com contatos e anexos) e `lista.js`.

### 2.11 Intimações, DJEN e prazos

- **Busca no DJEN (`telas/djen.js`):**
  - quem consulta é o **navegador**, porque a API do CNJ só aceita pedidos do Brasil;
  - usa as OABs do campo "OAB" de cada membro ativo;
  - uma requisição por vez, com pausa, parando em 429 ou em `x-ratelimit-remaining = 0`;
  - a mesma comunicação para dois advogados entra uma vez;
  - `importar_intimacoes` grava sem duplicar (`djen_id`), liga ao processo quando o número bate com exatamente um e registra a consulta (completa, parcial ou falhou).
- **Captura diária:**
  - acontece com `config_prazos.busca_automatica` ligada;
  - a primeira pessoa com acesso a Prazos que abre o sistema num dia útil busca desde a última consulta completa, 4 segundos depois de abrir;
  - não há servidor buscando sozinho.
- **Publicação:** considerada no primeiro dia útil depois da disponibilização (Lei 11.419, art. 4º §3º), com os feriados do tribunal da comunicação.
- **Na conferência:**
  - link para a certidão do DJEN;
  - o prazo vem sugerido a partir do texto ("15 (quinze) dias"), com a contagem da área (criminal conta corridos);
  - a audiência também vem sugerida a partir do texto.
- **Contagem automática (`dominio/prazos.js` + `telas/tarefas/formulario.js`):**
  - dias úteis, corridos ou horas;
  - recesso de 20/12 a 20/01;
  - feriados nacionais fixos e os cadastrados (do tribunal do processo);
  - mostra a memória dia a dia e sugere a entrega N dias úteis antes;
  - a data fatal **continua editável** e "Conferi" é obrigatório;
  - a memória vai para `tarefas.memoria_prazo`, dizendo se o advogado mudou a data.
- **Feriados e prazos (`telas/feriados.js`):**
  - lista os nacionais fixos;
  - sugere as datas móveis do ano (Carnaval, Sexta-feira Santa, Corpus Christi), que só contam depois de cadastradas;
  - configura a busca automática, os dias da primeira busca e a entrega.
- **Agenda:** os nacionais fixos aparecem sozinhos na grade.
- **Arquivos:** migração `…121100_djen.sql`, `dominio/djen.js`, `dominio/feriados.js` e `dominio/prazos.js`.

### 2.12 Operação, segurança e LGPD (T05, T06, T16)

Tudo fica em `telas/operacao.js` (administrador e auditoria).

- **Saída por inatividade:** padrão de 30 minutos, com aviso 1 minuto antes. Ver `config_seguranca` e `nucleo/inatividade.js`.
- **Convite:**
  - a função `administrar-usuarios` confere com o token de quem pede que é o administrador (`solicitar_convite`);
  - manda o convite pelo Auth com a chave do servidor e registra o resultado;
  - a pessoa cria a própria senha;
  - **depende de SMTP.**
- **Acessos:** `acessos_recentes` lê os registros do Auth (`auth.audit_log_entries`).
- **Erros das telas:** `erros_cliente` guarda os erros, com e-mails e números longos apagados e limite de 30 por hora por pessoa (`nucleo/erros.js`).
- **Pedidos de titulares (LGPD art. 18):** `solicitacoes_titular`, com prazo de 15 dias, responsável e decisão.
- **Cópias de segurança:** `backups_execucoes` registra cada execução da rotina. Ver §5.
- **CSP (`vercel.json`):** passa a liberar `comunicaapi.pje.jus.br` e `viacep.com.br` no `connect-src` do `/sistema`.

### 2.13 Configurações do Financeiro

Prefixo do código, centros de custo e atalhos para contas financeiras e fornecedores, em `telas/financeiro/configuracoes.js`.

---

## 3. Testes e prévia local

| Comando | Resultado em 09/10 |
|---|---|
| `npm run sistema:test` | 150/150, após a revisão de 09/10 |
| `npm run banco:test` | 444/444 (após o QA de 09/10, §9). Inclui `supabase/testes/financeiro-docx.sql` (96) e o ensaio da migração sobre dados antigos (`supabase/testes/migracao/`, 12/12) |
| `npm run check` | site OK (17 páginas) |

- **Prévia:** `npm run testar:local` → `http://127.0.0.1:8125/__teste`.
  - É PostgreSQL de verdade em memória (PGlite em `.local/ferramentas/`), com todas as migrações, RLS e gatilhos e a semente fictícia `scripts/local/semente.sql`.
  - DJEN e CEP são fictícios.
  - Perfis: admin, sócia, secretária, consulta, auditoria e sem-clientes.
  - Reiniciar zera o banco.
  - `-- --simulado` volta à API simulada antiga.
- **Roteiros Playwright** (na pasta `.local/`, fora do git), sempre com `PORT_TESTE=8127`:
  - `fumaca-banco.mjs`: todas as rotas × perfis;
  - `fluxos-novos.mjs`: DJEN, prazo, importação, contatos, CEP, convite, LGPD, feriados e centro de custo.

  Todos passam. O único erro é a API do Banco Central, bloqueada de propósito pela CSP da prévia.

---

## 4. Como mandar para produção

Projeto Supabase **fhl-advocacia** (`ulnpnbzibwbrzrpomgia`, plano Free) e Vercel **fhl-advocacia** (time Wibble, deploy automático a cada push na `main`).

### 4.0 Antes de começar

1. **Aprovação do Ithalo** para commit e publicação. Nunca publicar sem ela.
2. Revisar o diff:
   ```bash
   git status
   ```
   ```bash
   git diff --stat
   ```
3. Confirmar no remoto que a última migração aplicada é `20261006211332`. Use Supabase → Database → Migrations, ou `list_migrations` pelo MCP.
4. **Cópia do banco de produção.** O plano Free não tem backup automático. Pegue a URI em Project Settings → Database → Connection string e rode:
   ```bash
   npx supabase db dump --db-url "<URI>" -f backup-antes-docx-schema.sql
   ```
   ```bash
   npx supabase db dump --db-url "<URI>" --data-only -f backup-antes-docx-dados.sql
   ```
   Guarde os arquivos **fora do repositório**: têm dados de clientes.

### 4.1 Banco: as 12 migrações, em ordem

```
20261008120000_perfis_capacidades
20261008120100_contas_financeiras
20261008120200_pagamentos_despesa      ← migra os pagamentos antigos; aborta se algum total mudar
20261008120300_contratos_integridade   ← dá código aos contratos existentes; data fica "a confirmar"
20261008120400_fechamento_anual
20261008120500_resumo_relatorios
20261008120600_anexos_recibos          ← cria o balde privado "anexos"
20261008120700_alertas
20261008120800_clientes_contatos       ← telefone/e-mail atuais viram o contato principal
20261008120900_importacao
20261008121000_operacao_seguranca
20261008121100_djen
```

**Opção A, pela CLI.** Grava o histórico com os mesmos nomes dos arquivos.

```bash
npx supabase link --project-ref ulnpnbzibwbrzrpomgia
```
```bash
npx supabase db push --dry-run
```

O `--dry-run` tem que listar **só** as 12 acima. Se listar outras, pare: o histórico remoto está diferente. Se estiver certo, rode:

```bash
npx supabase db push
```

**Opção B, pelo MCP ou pelo SQL Editor.** Aplicar uma de cada vez, na ordem, com `apply_migration` e o nome sem o timestamp. Foi assim que as anteriores entraram. Se uma falhar, **pare**: cada migração é atômica e as seguintes dependem dela.

**Depois de aplicar:**
- Rodar os advisors de segurança e desempenho (`get_advisors`). Nada novo de nível "ERROR" deve aparecer.
- Conferir que o balde `anexos` existe e é **privado** (Storage).
- Consultas rápidas no SQL Editor:
  ```sql
  select codigo, data_contrato_origem from contratos order by criado_em;      -- todos com código
  select count(*) from pagamentos_despesa where origem = 'legado';           -- = contas pagas antes
  select * from config_prazos; select * from config_seguranca;               -- 1 linha cada
  ```

### 4.2 Funções de borda

```bash
npx supabase functions deploy finalizar-anexo --no-verify-jwt
```
```bash
npx supabase functions deploy administrar-usuarios --no-verify-jwt
```

- `verify_jwt = false` já está em `supabase/config.toml`. As duas conferem o token do usuário por conta própria.
- `SUPABASE_URL` e a chave de serviço (`SUPABASE_SECRET_KEYS` ou `SUPABASE_SERVICE_ROLE_KEY`) são injetadas automaticamente pelo Supabase. **Nenhum segredo manual.**
- Sem a chave, as funções respondem 503 (não quebram nada).

### 4.3 Configurações no painel do Supabase

- **Authentication → URL Configuration:** Site URL e Redirect URLs com `https://fhl-advocacia.vercel.app/sistema` (ou o domínio oficial, quando existir). O link do convite e o de "Esqueci a senha" voltam para lá.
- **Authentication → Emails → SMTP:** só quando houver e-mail e domínio oficiais. Sem SMTP, o convite só chega para quem é da equipe da organização no Supabase. Continua valendo o caminho manual: Users → Add user.

### 4.4 Frontend (Vercel)

Recomendado, para ver antes de ir ao ar: commit numa branch e PR.

```bash
git switch -c financeiro-docx-djen
```
```bash
git add -A
```
```bash
git commit -m "Financeiro DOCX (T01–T17), DJEN, contatos de clientes e operação"
```
```bash
git push -u origin financeiro-docx-djen
```

- A Vercel gera uma **prévia** do PR. Ela usa o **mesmo Supabase de produção**, por isso só depois de 4.1 e 4.2.
- Conferir a prévia (§4.5) e então fazer o merge na `main`. O merge publica em produção.
- A mensagem do commit termina com a linha de coautoria da sessão.
- O commit inclui também os ajustes de Tarefas e do editor de 08/10. Se quiser separar, faça dois commits.
- `.local/`, `dist/` e `node_modules/` estão no `.gitignore` e não vão.

### 4.5 Conferência depois de publicar

Entrar com um login real de administrador:

1. **Início** abre, com o indicador "Alertas novos".
2. **Contratos:**
   - o contrato do Ithalo aparece com código `C001/2026`, ou o ano em que foi criado;
   - a formalização aparece "a confirmar".
3. **Contas do escritório** do mês, com a conta "Luz":
   - se estava paga, aparece paga;
   - abrir "Pagamentos" mostra o lançamento `legado`.
4. **Painel:** os números batem com o Fechamento do último mês fechado.
5. **Intimações → Buscar no diário**, de um computador no Brasil, com um período curto:
   - registra a consulta;
   - se algum membro não tiver OAB legível, preencher em Membros ("OAB/PR 105.790").
6. **Ficha do cliente "Rodrigo":** o contato principal veio do cadastro.
7. **Operação e LGPD** abre. "Última cópia boa: Nenhuma" é o esperado até existir a rotina da §5.
8. **Anexo:** enviar um PDF pequeno num contrato. Ele aparece como verificado, o que prova que `finalizar-anexo` está no ar.

### 4.6 Se algo der errado

- **Frontend:** Vercel → Deployments → promover o deploy anterior (volta em segundos). O banco novo continua compatível com o frontend antigo? **Não totalmente:** as despesas passam a exigir `pagamentos_despesa`, e o frontend antigo grava `contas.data_pagamento`, que foi revogado. Então volte o frontend só por pouco tempo, e corrija para a frente.
- **Banco:** as migrações não têm "desfazer". Em caso grave, restaure a cópia de 4.0 num projeto de teste, compare e corrija com uma migração nova. **Nunca** apague dados em produção ("nada se apaga").

---

## 5. Pendências e bloqueios

- **Cópia de segurança:** a rotina diária (GitHub Actions, `pg_dump` criptografado e registro em `backups_execucoes`) está descrita em [docs/operacao/backup-restauracao.md](docs/operacao/backup-restauracao.md), mas **não está ativa**. Precisa de destino e dos secrets `SUPABASE_DB_URL`, `BACKUP_SENHA`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.
- **SMTP e domínio oficial:** necessários para o convite.
- **Planilha oficial do escritório:** necessária para a importação real. Pode exigir ajustar os sinônimos em `dominio/importacao.js`.
- **Feriados estaduais, municipais e do tribunal:** precisam ser cadastrados em Feriados e prazos antes de confiar na contagem.
- **Fora do escopo por decisão:** OFX, Open Finance e conciliação; 2FA; exceção de CPF/CNPJ repetido.

### Decisões a confirmar com o Vinícius

Todas implementadas pela recomendação e configuráveis onde possível. Lista em `sistema/README.md` → Pendências.

- Taxa de recebimento: das parcelas vencidas no período, quanto foi pago.
- Imputação do pagamento parcial: hoje o saldo vem antes dos encargos, e o art. 354 do CC manda os juros primeiro.
- Prefixo "C" e numeração por ano da formalização.
- Formalização dos contratos antigos "a confirmar".
- Fechamento anual só com os 12 meses fechados.
- Texto do recibo.
- Regras de contagem de prazo (CPC/CLT/CPP, recesso, Súmula 310) e quais datas móveis suspendem prazo.
- RPO de 24 h e RTO de 4 h da cópia; retenção de dados (LGPD).

---

## 6. Artefatos

- **Especificação:**
  - [relatorio-especificacao-financeira.md](relatorio-especificacao-financeira.md)
  - [preparacao-financeiro-docx.md](preparacao-financeiro-docx.md)
  - [preparacao-novas-funcoes.md](preparacao-novas-funcoes.md) (F5/F6, DJEN)
- **Documentação técnica:**
  - [sistema/README.md](sistema/README.md), seções Financeiro, Intimações e Operação
  - [docs/operacao/backup-restauracao.md](docs/operacao/backup-restauracao.md)
- **Banco:** `supabase/migrations/20261008*`, `supabase/testes/financeiro-docx.sql` e `supabase/testes/migracao/`
- **Funções:** `supabase/functions/finalizar-anexo/` e `supabase/functions/administrar-usuarios/`
- **Prévia local:**
  - `scripts/testar-local.mjs`
  - `scripts/local/banco.mjs`, que emula o PostgREST
  - `scripts/local/previa-banco.mjs`, com Storage, Auth e funções
  - `scripts/local/semente.sql`
  - `scripts/local/djen-ficticio.mjs`
  - `scripts/validar-banco.mjs`
- **Contexto do cliente:** [CLAUDE.md](CLAUDE.md)

## 7. Skills sugeridas para a próxima sessão

- **`code-review`:** revisar o diff antes do commit.
- **`run`** ou o navegador embutido (`built-in-browser`): conferir a prévia ou a produção depois de publicar.
- **`security-review`:** opcional, sobre as migrações e as funções de borda antes de aplicar.

## 8. Revisão de código e visual — 09/10/2026

Revisão solicitada pelo Ithalo, com correções locais e testes em PostgreSQL
isolado e no navegador. Relatório completo, cenários conferidos e sequência
de publicação: [REVISAO-FINANCEIRO-DJEN.md](REVISAO-FINANCEIRO-DJEN.md).

- **Permissões:** Consulta abre fechamentos mensal/anual e baixa o recibo sem
  gravar; Clientes sem Financeiro não lê nem emite recibos financeiros.
- **DJEN:** páginas já recebidas sobrevivem a falhas/limites; consulta parcial
  não avança o marco de captura; retomada inclui o último dia e percorre o
  intervalo antigo sem saltar para o presente. Feriados precisam carregar.
- **Financeiro:** numeração funciona acima de 999 contratos no ano; séries
  respeitam o período e o responsável; os indicadores preservam filtros e
  abrem as listas correspondentes. Despesas futuras entram nos relatórios.
- **Recibos e cobranças:** saldo reconstruído na emissão do pagamento,
  incluindo ajustes e estornos históricos; pagamento estornado não gera novo
  recibo. Cobrança usa apenas contatos ativos autorizados para recebê-la.
- **Importação e anexos:** calendário Excel 1904, datas com horário, limites
  de linhas/colunas, tamanho expandido e CRC do ZIP; fórmulas sem resultado
  impedem importar. Anexos abrem sem depender de popup tardio; versões
  anteriores e repetição da verificação ficam acessíveis. PDFs com nomes
  escapados e JavaScript indireto são recusados.
- **Editor e visual:** escolher outro cliente atualiza a folha; formatação
  persistida conferida; datas dos relatórios cabem nos campos; data da captura
  DJEN não provoca rolagem lateral no celular; orientação dos prazos atualizada.
- **Falhas de serviço:** convite e verificação de anexo devolvem erro
  controlado em indisponibilidade; convite enviado com falha no histórico
  informa o resultado incerto para evitar reenvio automático.

As doze migrações de 08/10 permanecem **não aplicadas no remoto**, verificado
pela lista de migrações. As correções SQL foram feitas nesses arquivos ainda
inéditos. Se forem aplicados antes de uma próxima sessão, qualquer ajuste novo
deve usar outra migração, sem reescrever o histórico aplicado.

Não houve commit, push, deploy nem alteração de registros de produção nesta
revisão. Continuam as pendências da seção 5, especialmente backup, SMTP,
calendários locais, planilha oficial e validação das regras pelo escritório.

## 9. Correções do QA de 09/10/2026

Sessão de QA exploratório na versão **publicada** (relatório
`RELATORIO-QA-FHL-0910.md`, fora do repositório). Os seis achados foram
corrigidos aqui, no código local, e conferidos na prévia `testar:local`
(computador e 390 × 844). Sem commit, push, deploy ou migração remota.

| ID | Problema | Correção |
|---|---|---|
| QA-01 | Gerador vazio: cliente escolhido não atualizava a folha e "Salvar" bloqueava | Já resolvido localmente em 09/10 (saída do campo refaz a folha). Reforço: se a folha ainda não acompanhou a escolha, Salvar/Imprimir/Word atualizam a folha e pedem para conferir, em vez de só bloquear. |
| QA-02 | Nascimento futuro era salvo | Campo com data máxima de hoje, `prepararCliente` recusa e o gatilho `privado.preparar_detalhes` (migração `…120800`, ainda inédita) recusa no banco quando a data muda. Mensagens de data mínima/máxima saem em dd/mm/aaaa. |
| QA-03 | Intimação manual sem publicação não tinha como receber a data | A conferência mostra "Publicação conferida", obrigatória para gerar prazo. No banco (migração `…121100`, inédita): `publicada_em` passa a ter UPDATE só para intimação **manual**, sem apagar a data e sem prazo ativo contado dela (`privado.validar_publicacao_intimacao`). |
| QA-04 | Histórico com datas invertidas parecia "nada registrado" | Aviso de intervalo inválido, sem consultar. |
| QA-05 | Histórico mostrava `em_andamento`, `[["p", …]]` | Situação, prioridade, tipo, contagem, área etc. com os nomes das telas; corpo de artigo vira resumo bloco a bloco, com o trecho que mudou. Quatro tabelas auditadas ganharam rótulo. |
| QA-06 | Folha A4 ilegível e com rolagem lateral no celular | Até 640 px a folha vira modo de leitura na largura da tela (com aviso). Impressão e Word continuam em A4; no computador nada muda. |

Testes depois das correções: **150/150** JavaScript, **444/444** SQL (novos:
nascimento futuro, publicação completada, publicação com prazo ativo e
publicação apagada) e 17 páginas do site.

Os registros fictícios que o QA deixou **na produção** (cliente "TESTE QA
0910…", contrato de R$ 100 com recebimento de R$ 10, conta de R$ 75,50,
rascunhos do site etc.) continuam lá — nada foi apagado ou alterado.
