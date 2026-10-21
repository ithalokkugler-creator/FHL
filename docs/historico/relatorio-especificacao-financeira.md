# Relatório de aderência do sistema FHL à especificação financeira

Data da análise: **8 de outubro de 2026**. Destinatário: Ithalo e equipe de desenvolvimento. Documento analisado: **Especificação Funcional do Sistema Web de Controle Financeiro, versão 1.0**, entregue pelos advogados na mesma data.

O sistema atual já possui um núcleo financeiro funcional, banco multiusuário, clientes, contratos, parcelas, recebimentos parciais, despesas, fechamento mensal, auditoria e relatórios básicos. **Ainda não atende integralmente ao DOCX.** As lacunas mais importantes estão no tratamento de despesas pagas parcialmente, integridade de alterações contratuais, contas financeiras, permissões de consulta e auditoria, recuperação operacional, fechamento anual e relatórios gerenciais.

A recomendação é evoluir a arquitetura existente por migrações aditivas e entregas pequenas. Uma reescrita do site, do sistema ou do cliente Supabase não é necessária para atender ao documento. O plano executável está em [Preparação de implementação](<C:/Users/Ithalo/Desktop/Advocacia site/preparacao-financeiro-docx.md>).

## 1 Escopo e grau de confirmação

O DOCX foi tratado como **fonte de requisitos**, não como autorização para implementar, importar dados, alterar contas, contratar serviços ou publicar. Nesta análise não houve gravação no banco remoto, envio de mensagem, commit, push ou deploy. Os dois documentos de análise são os entregáveis desta solicitação.

Foram lidos os dois READMEs, os quatro handoffs, o contexto em `CLAUDE.md`, documentação de revisão e preparação pertinente, as telas financeiras e seus módulos compartilhados, as migrações e os testes relacionados. As declarações da documentação foram confrontadas com o código e com consultas remotas de metadados.

O levantamento remoto leu somente estrutura do banco, histórico de migrações, funções publicadas e informações de deploy. **Não examinou os dados financeiros reais dos clientes.** Não há certificação de saldos reais, operação de e-mail, recuperação de senha, backups ou uso por todos os perfis em produção.

### Estado remoto encontrado

| Verificação | Resultado em 08/10/2026 | Consequência |
|---|---|---|
| Supabase FHL | Projeto `ulnpnbzibwbrzrpomgia`, São Paulo, `ACTIVE_HEALTHY`, PostgreSQL 17 | O banco está ativo na consulta realizada |
| Migrações | **16 versões aplicadas**, correspondentes às 16 migrações locais | As oito migrações E0–F7 já não são pendentes |
| Edge Functions | `receber-contato` ativa v1; `publicar-site` ativa v4 | Backend do formulário e publicação existem no remoto; configuração e fluxo completo não foram exercitados |
| Vercel | Deploy de produção `READY`, commit `5ba97ce58233cc6c04b09468e9e832fd7602bf16` | Site e sistema foram publicados após os handoffs antigos |
| Deploy | [Registro da Vercel](https://vercel.com/wibble/fhl-advocacia/AFZ8h1ZcXEsX7ZfT4FLe8B3eakBT) | Evidência de implantação, não prova de cada fluxo de negócio |
| Banco público | Todas as tabelas `public` listadas estavam com RLS ativo | Há controle de acesso na estrutura; sua suficiência depende das políticas |
| Ambiente local | HEAD `5ba97ce`; alterações de trabalho adicionais observadas durante a leitura | As alterações locais de tarefas não foram presumidas como publicadas |

**Correção necessária na documentação:** `README.md`, `sistema/README.md`, `CLAUDE.md`, `handoff-novas-funcoes.md` e `HANDOFF-PRODUCAO-FHL.md` ainda contêm afirmações de que as funções novas não foram publicadas. Elas descrevem a situação de 05–06/10 antes da implantação. Também há referências antigas a quatro sócios e dois projetos de hospedagem. Uma IA futura deve partir do esquema remoto e do commit confirmado, preservando a documentação antiga como histórico.

### Verificação local desta análise

- **112 testes JavaScript passaram, zero falhas**, executados com o runtime Node disponibilizado pelo Codex.
- O comando equivalente a `npm run check` aprovou **17 páginas**, links, âncoras e metadados.
- O build não conseguiu consultar conteúdo do Supabase pelo ambiente de execução e utilizou o fallback de publicações/campanhas. Isso limita a verificação ao conteúdo local; não demonstra indisponibilidade do Supabase, que respondeu pelos conectores.
- Os resultados de **329 testes SQL e 93 fluxos de navegador** são evidências históricas dos handoffs. Não foram reexecutados nesta análise.
- A prévia isolada iniciou corretamente. A inspeção interativa pelo navegador disponível não completou a conexão; não apresento uma nova aprovação visual das telas. A classificação funcional se apoia em código, esquema e testes citados.

## 2 O que o website e o sistema já oferecem

O **website público** usa um gerador estático próprio em Node, com conteúdo em português, identidade compartilhada com o sistema, páginas institucionais, equipe, áreas de atuação, publicações, campanha, contato e páginas jurídicas. Artigos e campanhas vêm do Supabase no build. A área interna é servida em `/sistema`, no mesmo projeto Vercel.

O **sistema interno** usa ES modules e CSS próprios, sem framework de frontend. As telas chamam Auth, Data API, RPCs e Edge Functions pelo cliente de `sistema/js/nucleo/supabase.js`. O PostgreSQL aplica permissões, auditoria, carimbos de autoria, validações e bloqueios financeiros.

Além do financeiro, há Contatos, cadastro completo PF/PJ, Processos, oito modelos de Documentos, Atualizações com cronômetro, Agenda, Tarefas, Prazos manuais, Intimações manuais, Feriados cadastrados e avisos em Hoje. Esses módulos podem ser reaproveitados, mas não substituem requisitos específicos do DOCX. Por exemplo, documento gerado em HTML não equivale a um arquivo anexado ao pagamento, e compromisso no Google por cópia não equivale a sincronização.

O DOCX recebido especifica principalmente **controle financeiro**. DJEN, contagem automática de prazos processuais, integração bidirecional Google, Drive e novidades de marketing pertencem ao backlog anterior. Não foram contabilizados como lacunas desse DOCX nem incluídos no ranking financeiro.

## 3 Matriz de requisitos

**Implementado:** há fluxo e estrutura correspondentes, com as ressalvas de verificação acima. **Parcial:** existe uma parte, mas faltam campos, regras, filtros ou operação. **Ausente:** não foi encontrada implementação correspondente no repositório e esquema consultados. **A confirmar:** depende de configuração ou procedimento externo que não foi demonstrado.

Os IDs R01–R75 tornam cada conclusão rastreável. Os IDs T01–T17 apontam para os pacotes detalhados no documento de preparação. A ausência de percentual de conclusão é deliberada: uma autenticação segura e um campo cadastral não têm o mesmo peso operacional.

### Base navegação e acessos

| ID | Pedido do DOCX | Estado | Evidência e diferença | Complemento |
|---|---|---|---|---|
| R01 | Base web contínua, multiusuário e responsiva; §§1, 14 | Implementado | Auth + Postgres; exercícios compartilham as mesmas tabelas; CSS responsivo e testes históricos | Preservar |
| R02 | Menus financeiro, clientes, contratos, administração; §2 | Implementado | Menu lateral e recolhível em `app.js`; nomenclaturas Recebíveis e Contas do escritório cumprem a função | Preservar |
| R03 | Dashboard inicial; ano, unidade e usuário sempre identificáveis; §§2, 4 | Parcial | Inicial é Hoje; usuário aparece, período é por tela, unidade não existe | T08, T09, T17 |
| R04 | Admin configura e gerencia acessos; §3 | Implementado | Membros e níveis individuais; RLS e configurações restritas | Preservar |
| R05 | Admin cria usuários de acesso pela aplicação; §§3, 17.1 | Parcial | Membros cadastra a pessoa; criar o usuário Auth ainda depende do painel Supabase | T05 |
| R06 | Perfil Financeiro sem administração; §3 | Parcial | `lancamentos` e `completo` oferecem base; não há perfil com esse nome e separação fina de capacidades | T04 |
| R07 | Perfil Consulta sem qualquer mutação; §3 | Ausente | Níveis financeiros atuais são nenhum, lançamentos e completo; os dois últimos permitem escrever | T04 |
| R08 | Perfil Auditoria somente leitura; §3 | Ausente | Histórico existe, mas não há perfil/capacidade independente de auditor | T04 |
| R09 | Login por e-mail/senha e senha sob hash seguro; §3 | Implementado | Credenciais são tratadas por Supabase Auth; o sistema não persiste senha em sua base | Preservar |
| R10 | Recuperação segura de senha; §3 | Parcial | Endpoint e tela existem; SMTP, remetente e redirect reais não foram confirmados | T05 |
| R11 | Possibilidade de 2FA para administradores; §3 | Ausente | Não há fluxo MFA nem verificação `aal2` na autorização da aplicação | T05 |
| R12 | Encerrar sessão inativa e bloquear tentativas repetidas; §3 | Parcial | Auth oferece rate limits; cliente mantém renovação automática sem timeout de interação; configuração remota de bloqueio não foi verificada | T05 |
| R13 | Auditar acessos com usuário, hora, IP e resultado; §3 | Parcial | Auditoria de negócio existe; logs nativos de Auth são recurso do provedor, sem consulta/integração operacional no sistema | T05, T12 |

### Dashboard

| ID | Pedido do DOCX | Estado | Evidência e diferença | Complemento |
|---|---|---|---|---|
| R14 | Filtros de ano/intervalo, cliente, contrato, responsável, situações, categoria e forma; §4 | Parcial | Painel aceita mês; filtros existem fragmentados em listas, sem contrato de consulta comum | T08, T09 |
| R15 | Dez indicadores obrigatórios; §4 | Parcial | Painel tem Entrou, Saiu, Resultado, A receber, A pagar e atraso atualizado; faltam previsão integral, saldo previsto, taxa e contratos com atenção | T09 |
| R16 | Gráfico mensal previsto, realizado, despesas e saldo; §4 | Parcial | SVG de 12 meses mostra entradas e saídas realizadas; não mostra previsão e saldo | T09 |
| R17 | Vencimentos, atrasos e separação de futuro; §4 | Implementado | Hoje, Recebíveis e Em atraso; saldo futuro e vencido são separados nas views/listas | T09 para filtros comuns |
| R18 | Atalhos para contrato, recebimento e despesa; §4 | Parcial | Novo contrato no Painel; baixas e despesas exigem navegar às respectivas telas | T09 |
| R19 | Abrir exatamente os lançamentos de cada indicador; §§4, RN10 | Parcial | Indicadores possuem links; os destinos nem sempre mantêm o mesmo universo/data, sobretudo Saiu e atraso global | T08, T09 |

### Clientes

| ID | Pedido do DOCX | Estado | Evidência e diferença | Complemento |
|---|---|---|---|---|
| R20 | Um cliente com vários contratos; nome/razão social, CPF/CNPJ; §5 | Implementado | `clientes`, `contratos.cliente_id`, formulário PF/PJ e ficha integrada | Preservar |
| R21 | Impedir CPF/CNPJ duplicado, com exceção administrativa; §5 | Parcial | Índice único parcial confirmado no remoto impede duplicidade; não há procedimento de exceção | T14; confirmar necessidade |
| R22 | Nome fantasia, etiquetas, múltiplos contatos e WhatsApp próprio; §5 | Parcial | Nome, e-mail, telefone, um recado e representante existem; faltam nome fantasia, etiquetas e coleção de contatos; WhatsApp usa telefone | T14 |
| R23 | Endereço completo e preenchimento por CEP quando disponível; §5 | Parcial | Endereço existe, CEP é manual e não há integração de consulta | T14 |
| R24 | Status, responsável, observações e inativo preservado; §5 | Implementado | Dados completos, responsável e desativação/reativação; status de cliente é ativo/inativo | Preservar; ampliar só se acordado |
| R25 | Anexos cadastrais com data, autor e descrição; §5 | Parcial | Documentos gerados possuem vínculo e autoria; anexar contrato social, procuração externa ou outros arquivos não existe | T07 |

### Contratos e cronogramas

| ID | Pedido do DOCX | Estado | Evidência e diferença | Complemento |
|---|---|---|---|---|
| R26 | Identificador interno único e imutável; §6, RN01 | Implementado | UUID estável; identificador não depende da posição da linha | Preservar |
| R27 | Código visível automático e imutável, como C001/ANO; §6, RN01 | Ausente | Não há `codigo` nem sequência anual no esquema de contratos | T02 |
| R28 | Data de formalização e confirmação de vencimento anterior; §6 | Ausente | `criado_em` é criação técnica; falta `data_contrato` e regra de confirmação | T02 |
| R29 | Cliente obrigatório, valor fixo positivo, entrada opcional e cronograma; §6 | Implementado | Formulário + RPC `criar_contrato`; contrato de êxito sem valor é extensão existente que deve ser preservada | Preservar |
| R30 | Calcular quantidade ou valor da parcela conforme entrada; §6 | Parcial | Calcula valor a partir da quantidade; não calcula quantidade a partir do valor-alvo | T02 |
| R31 | Mensal no MVP e frequência quinzenal/personalizada futura; §6 | Implementado no MVP | `gerarParcelas` é mensal; datas podem ser editadas na prévia, mas não há gerador quinzenal | T17 para evolução |
| R32 | Referência pesquisável, responsável e observações históricas; §6 | Parcial | Campos existem; lista de contratos busca só nome do cliente e não referência/código/responsável | T08 |
| R33 | Contrato, aditivos e comprovantes versionados; §6 | Parcial | Geração jurídica salva texto final; armazenamento genérico de anexos/versionamento não existe | T07 |
| R34 | Soma do cronograma igual ao total e centavos na última; §6, RN02 | Parcial | Criação confere soma em transação e ajusta última; alteração posterior direta de `parcelas.valor` pode quebrar a igualdade | T02 |
| R35 | Bloquear mudança que afete parcelas pagas ou renegociar; §6 | Parcial | Renegociação existe; gatilho só impede novo valor abaixo do já recebido, sem bloquear toda alteração de valor/data de parcela paga | T02 |
| R36 | Cancelar/arquivar, preservar dados e motivo; §§6, 10, RN09 | Parcial | Cancelamento motivado existe; arquivamento contratual e justificativas de todo ajuste crítico não | T02 |
| R37 | Entrada e parcelas geradas com vencimento/valor/saldo/histórico; §7 | Implementado | RPC atômica; parcela 0 é entrada; views e auditoria | Preservar |
| R38 | A vencer, vence hoje, vencido, parcial, recebido e cancelado; §7 | Parcial | `a_vencer` inclui hoje; parcial é flag adicional; faltam apresentação/filtro próprios para hoje e parcial | T08 |
| R39 | Vários recebimentos parciais por parcela; §7, RN03 | Implementado | Tabela separada e saldo por principal não estornado; trava da parcela contra recebimentos simultâneos | Preservar |
| R40 | Valor, data, forma e conta de destino; §7 | Parcial | Valor/data/forma/observação existem; conta financeira de destino não | T03 |
| R41 | Juros, multa, desconto, acréscimo e abatimento separados; §7 | Parcial | Memória de cálculo discrimina encargos; registro monetário agrega `valor_encargos`; faltam componentes e ajustes estruturados de desconto/abatimento | T03 |
| R42 | Comprovante anexado; §7 | Ausente | Sem vínculo de arquivo ao recebimento | T07 |
| R43 | Estorno com motivo e baixa original preservada; §7, RN05 | Implementado para receitas | Campos de estorno imutáveis e autoria; despesas ainda não têm equivalente | T01 para despesas |
| R44 | Recibo opcional em PDF; §7 | Parcial | Prestação de contas imprimível utiliza recebimentos; não há recibo individual vinculado a uma baixa | T07 |
| R45 | Renegociação com histórico, data, usuário, motivo e anexos; §7 | Parcial | Cronograma antigo e pagamentos são preservados; faltam anexos e reforço de versão/integridade | T02, T07 |
| R46 | Pesquisa por cliente/contrato/vencimento/status/valor/responsável; §7 | Parcial | Cliente, mês, situação e responsável em Recebíveis; faltam intervalo livre, contrato/código e faixa de valor | T08 |
| R47 | Baixa individual e lote somente com confirmação detalhada; §7 | Implementado na regra individual | Só existe baixa individual. Lote não é requisito para liberar o MVP; se criado precisa de confirmação e resumo | T17 opcional |
| R48 | Exportar lista filtrada e imprimir vencimentos; §7 | Parcial | Relatórios exportam recebimentos por mês/ano; não a relação completa dos recebíveis filtrados | T11 |

### Despesas e contas financeiras

| ID | Pedido do DOCX | Estado | Evidência e diferença | Complemento |
|---|---|---|---|---|
| R49 | Despesas sem limite fixo de linhas, com categoria e observação; §8 | Implementado na base | Banco não limita a 25 despesas; há cadastro e categorias; listas ainda precisam paginação | T08 |
| R50 | Tipo fixa/variável/extraordinária, fornecedor e competência independente; §8 | Parcial | Recorrente/avulsa e categoria existem; fornecedor/tipo não; competência avulsa acompanha vencimento | T13 |
| R51 | Um ou vários pagamentos parciais por despesa; §§8, 14, 17.6 | Ausente | Pagamento é gravado na própria `contas`, com uma data; altera o valor previsto e marca conta paga | **T01** |
| R52 | Forma e conta de origem; §§8, 9 | Parcial | Forma e sócio que pagou existem; conta financeira de origem não | T03 |
| R53 | Centro de custo opcional e anexos; §8 | Parcial | Nem centro de custo nem anexos externos; centro de custo é evolutivo, anexos são necessidade funcional | T07, T13, T17 |
| R54 | Recorrência única/mensal/anual/parcelada sem duplicação; §8 | Parcial | Mensal idempotente; geração limitada até próximo mês; anual e parcelada ausentes | T13 |
| R55 | A informar, hoje, vencido, parcial, pago, cancelado e alerta de excedente; §8 | Parcial | Sem valor/a pagar/vencida/paga/cancelada existem; faltam parcial, hoje e comparação pago × previsto | T01, T08 |
| R56 | Informar impacto de mudar/excluir recorrência; §8 | Parcial | Tela informa genericamente que contas geradas não mudam; não lista lançamentos futuros afetados | T13 |
| R57 | Cadastrar contas caixa/corrente/digital e vincular movimentos; §9 | Ausente | `contas` significa despesas; dados bancários do cliente e chave Pix do escritório não são contas financeiras | T03 |
| R58 | Formas de pagamento configuráveis; §9 | Implementado | `formas_pagamento` e Configurações | Preservar |
| R59 | Transferências internas sem receita/despesa; §9 | Ausente | Não há entidade/operação de transferência entre contas financeiras | T03 |

### Fechamento relatórios alertas e segurança

| ID | Pedido do DOCX | Estado | Evidência e diferença | Complemento |
|---|---|---|---|---|
| R60 | Continuidade entre anos sem copiar registros; §10, RN07 | Implementado | Datas/competência filtram mesma base; parcelas futuras permanecem vinculadas | Preservar |
| R61 | Fechamento anual completo e posição em 31/12; §§10, 11, 17.8 | Ausente como fluxo anual | Relatório anual de caixa existe; não há fechamento anual, posição histórica contratual ou primeiro vencimento seguinte | T10 |
| R62 | Prévia, detalhamento, bloqueio e reabertura motivada; §10, RN08 | Parcial | Funciona por mês para recebimentos/contas pagas; não bloqueia integralmente cronogramas, obrigação prevista ou exercício | T02, T10 |
| R63 | Situações em andamento/pendência/quitado/renegociado/cancelado/arquivado; §10 | Parcial | View tem ativo/a apurar/quitado/cancelado; flags de atraso e registros de renegociação não viram todos os estados pedidos | T02, T08 |
| R64 | Oito relatórios mínimos e filtros comuns; §11 | Parcial | Caixa mensal/anual, recebíveis, atraso e contratos existem em telas distintas; faltam relatórios completos com filtros uniformes | T08, T10, T11 |
| R65 | Excel, PDF, filtros, emissão, usuário e páginas na impressão; §11 | Parcial | CSV compatível com Excel e impressão/PDF pelo navegador; sem XLSX, pacote comum de metadados e paginação completa dos relatórios | T11 |
| R66 | Pesquisa/paginação e capacidade sem teto fixo na tela; §11, RN12 | Parcial | `db.todos` pagina internamente; Contratos/Recebíveis limitam a 500 e Histórico a 300; não há navegar a próximas páginas | T08 |
| R67 | Central interna com vencimentos, divergências, documentos e eventos críticos; §12 | Parcial | Hoje mostra parte dos vencimentos/atrasos; avisos atuais não cobrem todo o financeiro nem eventos de segurança/fechamento anual | T12 |
| R68 | E-mail/WhatsApp e conciliação como evoluções; §§12, 16 | Parcial no apoio manual | Mensagens WhatsApp preparadas existem; envio automatizado, conciliação e importação bancária não | T17; não bloqueia MVP |
| R69 | Auditoria protegida, antes/depois, autor/data e motivos; §§13, 15 | Parcial | Triggers registram alterações e estornos; nem toda mudança crítica exige motivo; acesso/logs e exportação de auditoria incompletos | T02, T04, T05, T11 |
| R70 | Backups automáticos e restauração testada; §§15, 17.11 | Parcial | Exportação JSON manual existe; não inclui tudo para restauração integral, é limitada por perfil e não é snapshot transacional | T06 |
| R71 | HTTPS, menor privilégio, proteção de arquivos/backup e entradas; §15 | Parcial | HTTPS na hospedagem, RLS, CSP, validação e sanitização existem; anexos privados e cópias protegidas ainda precisam implementação | T04, T06, T07 |
| R72 | Finalidades, retenção, direitos, incidentes, termos e consentimentos; §15 | Parcial | Site tem textos e consentimento do formulário; política ainda marcada para revisão e não cobre operação interna completa | T16 |
| R73 | Monitorar falhas, recuperar, registrar erros seguros, desempenho/acessibilidade; §15 | Parcial | Tratamento de erro e logs do provedor existem; sem plano demonstrado de monitoramento/restauração; sem benchmark de volume atual | T08, T16 |
| R74 | Importação assistida da planilha com staging e reconciliação; §§16, 18 | Ausente | Não há importador da planilha, relatório de divergências ou carga idempotente | T15 |
| R75 | Múltiplas unidades, centros avançados, integrações e frequências futuras; §§6, 16 | Ausente como evolução | Não existem modelos/fluxos completos; são evolutivos e dependem de confirmação de escopo | T17 |

## 4 Os pontos que merecem atenção imediata

### Despesa paga parcialmente perde a obrigação original

Em `pagarConta`, informar R$ 400 para uma despesa prevista de R$ 1.000 grava `contas.valor = 400` e preenche `data_pagamento`. A view passa a mostrar a conta paga. Não resta um saldo de R$ 600. Editar uma conta já paga também permite modificar o valor/data ou retirar a marca de pagamento; há auditoria, mas não há baixa financeira original imutável corrigida por estorno.

Isso contradiz o pagamento parcial de despesas e a separação Despesa/Pagamento do DOCX. **Não adaptar o recebimento parcial de receitas apenas na interface:** criar pagamentos de despesas como registros separados e atualizar todos os consumidores de saídas.

### Integridade contratual é forte na criação e insuficiente depois

`criar_contrato` valida a soma das parcelas. Porém, `authenticated` tem UPDATE de `parcelas.valor`, e `privado.validar_parcela` somente exige que o valor não seja menor que o principal recebido. Esses dois pontos foram confirmados no remoto por metadados, sem executar alteração.

Exemplo: um contrato de R$ 1.000 criado com duas parcelas de R$ 500 pode receber uma alteração de parcela para R$ 600, sem reconferir a soma global. A interface atual não oferece esse botão, mas a proteção pedida precisa existir na API/banco. A alteração de vencimento tampouco exige justificativa em todos os casos. A solução é limitar alterações diretas e oferecer operações financeiras específicas, atômicas e motivadas.

### Histórico em 31 de dezembro exige outra consulta

`v_parcelas` calcula situação por `privado.hoje()` e soma os recebimentos atuais não estornados. Um recebimento feito em janeiro pode fazer uma dívida de dezembro aparecer quitada. Uma renegociação ou cancelamento posterior também muda a fotografia da posição antiga.

Portanto, somar os 12 meses ou usar a view atual não resolve a posição contratual em 31/12. É necessário cálculo em data de corte, com eventos e versões, e uma fotografia imutável do fechamento aprovado. O período fechado deve proteger os valores previstos e os lançamentos que compõem sua fotografia.

### Valor de indicador e lista aberta podem divergir

O Painel soma despesas por **data de pagamento**, mas seu atalho Saiu abre Contas por **competência**. Uma conta de setembro paga em outubro participa do indicador de outubro e pode não aparecer na lista correspondente. O atraso do Painel é global de hoje, mesmo navegando outro mês. A solução é compartilhar consulta, data de referência e definição do indicador com a lista e com a exportação.

### CSV e JSON não encerram os requisitos de Excel e backup

CSV abre no Excel e é uma exportação útil já implementada. Não há XLSX com tipos, abas e identificação de filtros. Se o escritório aceitar explicitamente CSV como cumprimento do formato Excel, parte da lacuna diminui; até essa decisão, classifique como parcial.

O JSON manual reúne tabelas que aquele perfil pode ler, consultadas uma depois da outra. Não é cópia transacional do banco, não inclui Auth, auditoria e arquivos de Storage, e não há restauração demonstrada. O [backup de banco do Supabase](https://supabase.com/docs/guides/platform/backups) também não inclui os arquivos físicos do Storage; a cópia de documentos deve ser planejada separadamente.

## 5 Ranking de implementação

Este ranking considera **correção financeira, impacto no trabalho cotidiano, requisitos explícitos do MVP, proteção do histórico e dependências**. Ele ordena valor/risco; a ordem técnica de execução pode começar por uma fundação usada por vários itens. Não são estimativas de prazo ou preço.

| Ordem | Entrega | Prioridade | Por que vem nesta posição | Pacote |
|---|---|---|---|---|
| 1 | Pagamentos parciais e estornos de despesas | P0 | Evita perda de saldo e pagamento sobrescrito; critério explícito do MVP | T01 |
| 2 | Integridade dos contratos, código, formalização e ajustes auditados | P0 | Fecha alterações que podem quebrar o valor contratado e preserva pagamentos | T02 |
| 3 | Perfis Consulta e Auditoria e capacidades separadas | P0 | Permite acesso operacional sem conceder escrita desnecessária | T04 |
| 4 | Contas financeiras, movimentos e componentes de ajustes | P0 | Identifica onde o dinheiro entrou/saiu e sustenta relatórios confiáveis | T03 |
| 5 | Backup automático protegido e restauração real em ambiente isolado | P0 | Dá recuperação aos dados usados como prova e atende critério do MVP | T06 |
| 6 | Cadastro de usuários, recuperação operacional, MFA e sessão | P1 | Remove dependência de intervenção no painel e completa segurança especificada | T05 |
| 7 | Anexos privados versionados e recibo individual | P1 | Une contrato e pagamento à evidência documental | T07 |
| 8 | Filtros comuns, status e paginação sem truncamento | P1 | Base para números, detalhamento e exportações concordarem | T08 |
| 9 | Dashboard completo com previsão, caixa, taxa e alertas | P1 | Entrega a visão gerencial pedida pelos advogados | T09 |
| 10 | Fechamento anual com posição histórica em 31/12 | P1 | Resolve um critério central do MVP e depende das bases financeiras anteriores | T10 |
| 11 | Relatórios completos e exportação XLSX/PDF | P1 | Permite conferência e prestação de contas com período/filtros identificados | T11 |
| 12 | Central financeira de alertas e eventos críticos | P1 | Faz as pendências relevantes chegarem ao responsável | T12 |
| 13 | Fornecedores, competência livre e recorrências anuais/parceladas | P2 | Completa despesas sem exigir integração bancária | T13 |
| 14 | Importação assistida e reconciliada da planilha | P2, sobe se houver carga imediata | Evita digitação em massa e corrupção de legado | T15 |
| 15 | Monitoramento, recuperação operacional e privacidade interna | P1 antes de uso definitivo | Parte é processo e configuração; deve amadurecer junto das entregas | T16 |
| 16 | Clientes com contatos múltiplos, nome fantasia, etiquetas e CEP | P2 | Completa o cadastro; o fluxo atual já opera com cadastro básico | T14 |
| 17 | Unidades, centros avançados, conciliação, envios automáticos, lotes e outras frequências | P3 | O DOCX classifica essas capacidades como evolutivas/opcionais | T17 |

P0 indica fundação que deve ser resolvida antes de declarar o financeiro pronto para uso amplo. P1 completa requisitos importantes do produto. P2 melhora cobertura sem bloquear o núcleo já válido. P3 depende de escopo e infraestrutura adicionais. Retenção e monitoramento não devem esperar o fim do projeto só porque aparecem abaixo em valor funcional.

## 6 Critérios do MVP do DOCX

| Critério do §17 | Resultado atual | O que falta para aceite |
|---|---|---|
| 1 Admin cria usuários e limita perfis | Parcial | Fluxo Auth dentro da aplicação e perfis somente leitura |
| 2 Um cadastro, vários contratos | Atendido na estrutura | Manter unicidade e validar fluxo real com perfis finais |
| 3 Cronograma sem diferença | Parcial | Criação atende; preservar igualdade em ajustes posteriores |
| 4 Vários recebimentos, saldo restante | Atendido na estrutura | Manter regressões e integrar contas/componentes sem alterar saldo histórico |
| 5 Diferenciar futuros, vencidos, parciais e recebidos | Parcial | Filtros próprios de parcial/hoje e semântica comum em todas as telas |
| 6 Despesa parcial e sem limite fixo mensal | Parcial | Base sem teto de 25; pagamento parcial e paginação faltam |
| 7 Dashboard detalhável e conferível | Parcial | Indicadores obrigatórios e consultas iguais aos detalhes |
| 8 Fechamento anual com posição em 31/12 | Não atendido | Fluxo anual e cálculo histórico |
| 9 PDF e Excel com filtros identificados | Parcial | Relatórios/filtros completos, XLSX e metadados |
| 10 Auditoria de alterações/estornos/cancelamentos/reaberturas | Parcial | Receitas/mês atendem; pagamentos de despesas, ajustes e exercício precisam completar |
| 11 Backup e restauração testada | Não atendido integralmente | Cópia automática, proteção e prova de restauração |

**Não aprovar o MVP pela existência das telas ou pelo sucesso dos testes antigos.** Os testes existentes cobrem a preparação anterior; o DOCX adiciona critérios diferentes.

## 7 Decisões que precisam entrar no próximo alinhamento

Estas decisões não impediram a análise. Precisam ser registradas antes das operações dependentes, sem deixar a IA escolher regras financeiras ou de retenção por conta própria.

1. **Taxa de recebimento:** o §4 usa uma expressão ambígua. Definir principal ou caixa bruto, títulos vencidos até o corte ou somente vencidos no período, recebimentos atribuídos a essas parcelas e tratamento de denominador zero. Uma proposta está na preparação.
2. **Conta financeira no MVP:** o §9 pede vínculo em cada movimento, enquanto o §19 pergunta se contas bancárias já são necessárias. Recomendo uma conta inicial Caixa e cadastro manual, sem integração bancária.
3. **Código contratual:** sequência anual, prefixo, códigos legados e possibilidade de formatos futuros. O padrão visual é configurável, mas códigos já emitidos permanecem fixos.
4. **Data de formalização legada:** data técnica de cadastro não deve ser transformada silenciosamente em data jurídica. Exigir conferência dos contratos antigos.
5. **Juros, descontos e abatimentos:** validar regra de imputação e autorização com o escritório; preservar os cálculos já congelados nos recebimentos. Não inferir percentuais novos do DOCX.
6. **Fechamento:** o anual fecha automaticamente os 12 meses ou exige que estejam previamente encerrados; como reabrir ano/mês e tratar lançamentos tardios; quais observações não financeiras podem ser corrigidas sem reabrir.
7. **CPF/CNPJ duplicado:** o bloqueio atual é mais restritivo. Confirmar se exceção é realmente necessária; preferir um cliente com vários contratos a criar duplicatas.
8. **Documentos obrigatórios:** por tipo de contrato, estágio e situação. Sem essa lista, o sistema não deve marcar todos os contratos como divergentes.
9. **Identidade, SMTP, retenção e responsabilidades:** domínio/remetente reais, responsáveis por suporte/incidentes, periodicidade da cópia e objetivos de recuperação. Prazos legais precisam ser definidos pelo escritório.
10. **Fonte de migração:** receber a planilha oficial; confirmar registros de teste, incluindo o exemplo indicado no DOCX. A confirmação deve preceder sua carga em produção.

## 8 Evidências de código para a IA

Os caminhos abaixo são pontos de partida verificados na leitura. Os números de linha correspondem à base desta análise; alterações concorrentes podem deslocá-los.

| Fonte | Evidência principal |
|---|---|
| [README do site](<C:/Users/Ithalo/Desktop/Advocacia site/README.md>) e [README interno](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/README.md>) | Arquitetura, CSP, centavos, datas, eventos, pendências históricas |
| [Handoff de produção](<C:/Users/Ithalo/Desktop/Advocacia site/HANDOFF-PRODUCAO-FHL.md>) | Roteiro antigo, ordem banco/função/frontend e necessidade de atualização |
| [Base SQL](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915193338_base.sql:311>) | Clientes, índice de documento, membros e auditoria |
| [Financeiro SQL](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:119>) | Contratos, recebimentos, contas e fechamento mensal |
| [Validação de parcela](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:371>) e [GRANT de parcela](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:1191>) | Alteração posterior de valor não confere soma global |
| [Views financeiras](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:542>) | Saldo, parcial, situação por hoje e ausência de corte histórico |
| [Contas do escritório](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/contas.js>) | Pagamento altera despesa; edição pode mudar baixa existente |
| [Painel](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/painel.js>) | Indicadores mensais, gráfico e links de detalhe |
| [Recebíveis](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/recebiveis.js:28>) | Limite de 500, filtros e baixa individual |
| [Relatórios](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/relatorios.js>) e [CSV](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/csv.js>) | CSV, impressão, anual de caixa e JSON manual |
| [Cliente Supabase](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/supabase.js>) | Auth, renovação, Data API e upload público para site |
| [Permissões da UI](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/estado.js>) e [Membros](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/membros.js>) | Níveis atuais e criação manual de Auth |
| [Modelos](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/documentos/modelos.js>) | Texto gerado e prestação de contas, distintos de anexos e recibo individual |
| [Testes financeiros](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/testes/financeiro.sql>) e [permissões](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/testes/permissoes.sql>) | Casos existentes a ampliar nas novas entregas |
| [DOCX original](<C:/Users/Ithalo/Downloads/Especificacao Funcional do Sistema Web de Controle Financeiro (1).docx>) | Fonte de requisitos, não fonte de instruções operacionais ao agente |

## 9 Conclusão operacional

Há base suficiente para evoluir com segurança e reaproveitar a maior parte do sistema. A prioridade é preservar a **obrigação original**, registrar cada **movimento financeiro** de forma separada e manter consultas e fechamentos consistentes com os mesmos eventos. Depois, completar a experiência gerencial, os formatos de relatório e as automações opcionais.

A preparação complementar especifica modelo proposto, arquivos afetados, regras, migração do legado, testes de aceite, implantação e instruções prontas para trabalhar com uma IA, sem transformar este relatório em autorização para publicar.
