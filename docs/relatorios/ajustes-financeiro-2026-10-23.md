# Correções locais — AjusteFinanceiro — 23/10/2026

## Resultado e alcance

As 16 situações do [relatório de auditoria](auditoria-bugs-2026-10-23.md)
foram tratadas localmente: 15 defeitos confirmados e a divergência de política
de arredondamento dos estornos de acordo. A revisão também reproduziu e
corrigiu um defeito adicional de exibição de erros de formulário.

Branch: **`AjusteFinanceiro`**, a partir de
`997f507da7f55e0ed8baa88f685a6a0289636a0b`. Não houve commit, push, PR,
publicação na Vercel, aplicação de migração remota ou escrita de teste em
produção. Os documentos de requisitos orientaram a interpretação dos
fluxos; a autorização para corrigir veio do pedido do Ithalo.

As conexões de Supabase, GitHub e Vercel foram conferidas na etapa inicial
da auditoria. As alterações e os testes desta entrega usaram o repositório
e bancos locais com dados fictícios. A produção permanece na versão auditada.

## Correções, comprovação e riscos

| Caso | Correção local e comprovação | Cuidado e possível impacto |
|---|---|---|
| FIN01 — estorno de acréscimo já recebido | O banco recusa o estorno que deixaria saldo negativo. Após estornar os recebimentos necessários, a operação volta a ser permitida. Testes verificam a recusa sem alteração parcial e o caminho válido. | O operador precisa seguir a ordem dos estornos. Nenhum pagamento antigo é recalculado automaticamente. |
| FIN02 — frações de centavo | RPCs conferem o JSON original antes da conversão para colunas com duas casas. Redistribuição, renegociação e outras entradas monetárias rejeitam frações e conservam o plano anterior em caso de erro. | Integrações que enviavam três casas passam a receber recusa explícita. Valores legítimos com duas casas continuam aceitos. Colunas existentes não mudam de tipo. |
| FIN03 — dívida reaparece em contrato arquivado | O banco exige desarquivar antes de lançar ou estornar recebimento e de estornar ajuste. A interface acompanha as restrições. Testes cobrem recusa e posterior desarquivamento. | A correção exige uma ação explícita antes do estorno. Não muda o estado de contratos já arquivados. |
| FIN04 — centavo da cota após estorno intermediário | O banco verifica se a soma das cotas sobreviventes continua compatível com a regra acumulada. Se houver diferença, recusa o estorno e orienta desfazer primeiro os pagamentos posteriores. | Decisão conservadora: não redistribuir centavos nos recebimentos e repasses históricos. Alguns estornos intermediários passam a exigir outra ordem; ver exemplo abaixo. |
| FIN05 — NaN e valores monetários especiais | Validação de finitude e limite nas RPCs e gatilhos das tabelas financeiras. A verificação de UPDATE considera apenas valores monetários realmente alterados. Testes cobrem API direta e RPCs. | Valores inválidos preexistentes são preservados, sem conversão para zero. Editar uma observação antiga continua possível. Corrigir uma anomalia histórica exige análise específica. |
| FIN06 — cálculo de uma data gravado em outra | Cada recálculo tem uma versão; respostas atrasadas não substituem a seleção atual. O envio espera a conclusão, confere data e valor e mantém pagamentos parciais digitados. A data inicial é capturada antes das consultas. | Durante o recálculo o botão fica indisponível. Teste com respostas fora de ordem gravou R$ 520,50 e memória de 02/09, mesmo com a resposta de agosto chegando depois. Outro teste preservou parcial de R$ 100. |
| FIN07 — corte do histórico em mil linhas | A ficha usa `db.todos` com ordenação estável e apresenta páginas de 100 pagamentos. Partes de antecipação acompanham o pagamento de origem. | A consulta carrega o histórico completo antes de paginar visualmente. Históricos muito maiores ainda podem exigir paginação no servidor. Teste percorreu 1.001 recebimentos em 11 páginas sem perda nem duplicação; testes de domínio cobrem agrupamento e partes órfãs. |
| SYS01 — resposta de renovação restaura logout | Geração e identidade da sessão invalidam respostas antigas após sair ou entrar novamente, inclusive entre abas. Resposta de erro antiga também não limpa a sessão nova. | Validação com Auth simulado e cenários entre abas; não provocamos logout ou troca de senha em contas reais. A política do provedor sobre tokens já emitidos permanece a mesma. |
| SYS02 — apagar texto e parar restaura o texto anterior | Vazio explícito limpa o campo; parâmetro omitido preserva o conteúdo. A parada da tela usa uma RPC com versão e mudanças de texto na mesma transação. | Compatibilidade da RPC antiga mantida para chamadas sem texto. Testes SQL e navegador confirmam a limpeza sem apagar os demais campos. |
| SYS03 — segunda aba sobrescreve anotações | RPC com bloqueio da linha e comparação de versão; fila por diálogo serializa autosave, Salvar e Fechar. Conflito mantém o rascunho na tela. Fechar, × e Esc aguardam a gravação; descartar exige confirmação explícita. | Para conflito real é necessário copiar o rascunho e consultar a versão atual. Não fazemos mesclagem automática de relatos. O navegador testou duas abas, falha ao fechar, Esc e descarte explícito. |
| SYS04 — transferência Google perde cliente/processo | Metadados privados de UID e ocorrência permitem reconhecer a identidade. O sincronizador consulta a origem antes de aplicar exclusões e só transfere com identidade comprovada. Conserva o compromisso e seus vínculos; uma cópia viva permanece separada. | Vínculos antigos sem identidade suficiente suspendem a rodada com aviso. Não são associados por título. Testes de handler e banco cobrem transferência, cópia, recorrência, particular e autorização; não houve movimentação em agenda real. |
| SYS05 — homônimo troca o cliente selecionado | O identificador explicitamente escolhido é preservado se o rótulo continuar correspondente. Texto ambíguo sem seleção não escolhe o primeiro cadastro. | Quem digita um nome ambíguo precisa selecionar um cadastro. Testes de domínio e do componente real conservaram o segundo identificador. |
| SYS06 — PDF ativo comprimido passa como verificado | Inspeção estrutural local com parser fixo e limites de recursos, além da verificação rápida anterior. Percorre objetos comprimidos e indiretos; recusa JavaScript, abertura de programa, arquivos embutidos, ações automáticas e ações externas de formulário/arquivo/multimídia. | PDFs cifrados, inválidos, complexos demais ou com recursos não suportados são recusados. PDF comum e links clicáveis normais continuam aceitos. O original não é regravado; testes conferem hash. Não equivale a antivírus ou garantia contra todas as vulnerabilidades de leitores PDF. |
| SYS07 — falha de feriados produz sugestão silenciosa | Falha tem aviso próprio; sugestão em dias fica suspensa, preenchimento manual continua disponível e há botão para tentar novamente. A recuperação não recalcula nem substitui a data manual. | Em indisponibilidade, a data exige conferência manual. Contagem por horas conserva a regra existente. Teste de navegador simulou HTTP 503 e recuperação. |
| SYS08 — falha de documentos parece ausência de atrasados | A consulta indisponível suspende o filtro de retorno e conserva a lista de processos sob os demais filtros, com aviso e nova tentativa. Depois da recuperação, o filtro selecionado volta a ser aplicado. | Durante a falha a lista pode conter mais processos; a suspensão fica explícita. Teste cobriu criar/retornar/cancelar documento sem excluir, falha e recuperação do filtro. |
| WEB01 — HTML editável executa no site público | Textos CMS são escapados conforme o contexto. Apenas `<strong>` sem atributos permanece como formatação legada. Links sociais exigem HTTPS e imagens ficam sob assets; dimensões são validadas. | HTML arbitrário previamente digitado aparece como texto. Entidades antigas e os três destaques fortes do artigo estático foram preservados. Testes do renderizador e Chrome confirmaram payload literal sem execução. |
| EXTRA01 — mensagem de erro desaparece ao receber foco | O foco colocado no erro não é tratado como correção do campo anterior. O evento `change` emitido ao perder foco não esconde a mensagem recém-criada. | Mudança limitada ao instante em que o validador move o foco; edições posteriores continuam limpando erros normalmente. Reproduzido no recebimento recusado de mês fechado; aviso agora permanece visível e nenhum lançamento é salvo. |

### Estorno e arredondamento: decisão aplicada

No acordo de R$ 333,33 com cota de 30%, três pagamentos de R$ 111,11
produzem honorários de R$ 33,33, R$ 33,34 e R$ 33,33 pela regra acumulada.
Retirar apenas o pagamento do meio deixaria R$ 66,66, enquanto a regra para
os R$ 222,22 restantes exige R$ 66,67. A correção recusa essa sequência.
Estornar primeiro os posteriores conserva a regra e os registros históricos.
Não alteramos os valores antigos para realocar esse centavo.

### Coordenação das operações financeiras

As duas hipóteses de concorrência do relatório foram tratadas preventivamente:
há coordenação por contrato antes de montar planos de antecipação, ajustes,
redistribuição e arquivamento. A inserção direta de parte de antecipação trava
e relê o pagamento de origem antes de prosseguir. Gatilhos que já receberam
linhas bloqueadas usam tentativa sem espera e devolvem conflito em vez de
esperar outra operação enquanto seguram a linha. A mensagem orienta preservar
o formulário e tentar de novo após conferir o estado atual.

Os testes verificam integridade, permissões e ordem dos caminhos em PostgreSQL
local. **Não foi executado um teste com duas conexões simultâneas a um servidor
PostgreSQL independente:** o PGlite serializa as operações. Isso é um limite
da comprovação, não uma afirmação de concorrência real testada.

## Preservação de informações

Foram criadas duas migrações novas; nenhuma migração histórica foi editada:

- `20261023130752_ajustes_financeiro_integridade.sql`;
- `20261023130757_ajustes_cronometro_google.sql`.

Não há limpeza ou recálculo retroativo dos registros. As migrações definem
funções/gatilhos/permissões e acrescentam duas colunas privadas inicialmente
nulas. O sincronizador aprende a identidade Google nas leituras posteriores.

Um ensaio aplicou **as duas migrações sobre uma base antiga fictícia** com
recebimentos, acordo com arredondamento, saldo negativo legado, NaN legado,
cronômetro aberto com relato e vínculo Google. Foram comparados quantidade
e hash do conteúdo dos campos anteriores em **66 tabelas e views**, incluindo
o esquema privado: **nenhuma diferença**. As duas colunas novas de identidade
foram excluídas da comparação porque não existiam antes. Também foi possível
editar observações dos registros legados sem mudar seus valores.

A suíte ainda contém ensaios separados da migração de sistema e das migrações
anteriores. Isso demonstra preservação nas bases de teste; não usamos nem
copiamos os dados reais dos clientes para executar os testes.

Anomalias históricas eventualmente existentes permanecem como estavam.
A correção impede novos casos nos caminhos tratados e não declara os dados
antigos automaticamente saneados.

## Verificações realizadas

| Verificação | Resultado |
|---|---|
| Suíte completa JavaScript (`node --test "sistema/testes/*.test.mjs"`) | **223/223 aprovados**, sem testes ignorados; antes eram 205 |
| Banco com todas as migrações (`node scripts/validar-banco.mjs`) | **756/756 aprovados**; antes eram 707. Inclui 34 novos financeiros, 15 novos de sistema e 16 de migrações anteriores |
| Inspeção estrutural de PDFs, integrada à suíte JS | **7/7**; PDFs simples e modernos, objeto comprimido, ação indireta, SubmitForm/ImportData/GoToR/GoToE, arquivo truncado, quantidade e descompressão excessivas, hash e resposta do finalizador |
| Renderização segura (`node scripts/testar-conteudo-seguro.mjs`) | Payloads, atributos, entidades e conteúdo estático aprovados |
| Navegação por perfis e celular | **53 verificações**, sem erros de página, respostas locais inesperadas ou transbordamento horizontal |
| Antecipação, recibo e estorno integral | R$ 1.800 distribuídos entre pagamento e três partes; saldos e estorno integral conferidos, sem exclusão |
| Respostas de índices fora de ordem | Data, valor e memória permaneceram em 02/09/2026; índices inteiramente fictícios |
| Envio durante recálculo e pagamento parcial | Não gravou enquanto pendente; conservou R$ 100 digitados; mês fechado recusado com aviso visível; mês aberto gravado corretamente |
| Histórico de recebimentos | 1.001 linhas consultadas em lotes; 11 páginas percorridas, sem repetição ou perda |
| Documentos e homônimos | Cancelamento preserva registro; falha e recuperação do filtro; identificador selecionado mantido |
| Cronômetro e feriados no navegador | Duas abas, conflito, Fechar/Esc, descarte explícito, limpeza ao parar e recuperação sem substituir data manual |
| Site público, build/check isolados sem consulta remota | **19 páginas**, links, âncoras, metadados e SEO aprovados |
| Site público no Chrome | Payload não executado, destaques legados mantidos, 19 páginas e 3 rotas móveis sem erros |
| Migração conjunta sobre dados antigos | **66/66 conjuntos sem diferença** nos campos preexistentes |
| Revisão final | Sintaxe dos arquivos alterados, integridade do parser e `git diff --check` conferidos |

As evidências locais, JSONs, capturas e scripts de reprodução estão em
`.local/ajuste-financeiro/`. As evidências da auditoria anterior foram
conservadas em `.local/auditoria-20261023/`. Esses diretórios são ignorados
pelo Git. Os testes de regressão de código e banco estão nas pastas de testes
versionáveis do projeto.

## Limites e estado para uma futura publicação

O frontend novo depende das duas migrações. O sincronizador Google e o
finalizador de anexos também mudaram; publicar apenas o site não entrega
essas correções de servidor. Uma futura publicação precisa coordenar banco,
funções de borda e frontend, com cópia recuperável e validação do ambiente.
Esta entrega não executou essa publicação.

Não havia Deno, Docker ou servidor PostgreSQL independente disponível no
ambiente. As funções de borda foram exercitadas pelos handlers reais em Node,
com rede simulada. Google, Auth, Storage, DJEN e Banco Central não receberam
operações de teste reais. A prévia usa PostgreSQL em memória e simula a
camada externa do Supabase; não reproduz integralmente PostgREST, Auth,
Storage, `safeupdate` e o ambiente de execução das funções de borda.

A auditoria não encontrou execução bem-sucedida registrada na rotina de
backup do sistema. Isso não exclui backups manuais externos. A rotina de
backup não foi ativada neste pedido local.

Os arquivos pessoais que já estavam modificados ou soltos na árvore foram
preservados. Durante uma checagem anterior do site, `scripts/check.mjs` foi
executado na raiz e regenerou o `dist/` local usando conteúdo local após
falha da leitura pública; não houve escrita remota. Os testes seguintes
usaram uma cópia isolada. Não se tentou restaurar cegamente esse diretório
gerado. Nenhum resultado desta branch foi enviado à produção.
