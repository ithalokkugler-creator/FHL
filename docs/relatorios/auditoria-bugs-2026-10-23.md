# Relatório de auditoria de bugs — Fonseca Lisboa Advocacia

**Data:** 23/10/2026 · **Referência:** `997f507da7f55e0ed8baa88f685a6a0289636a0b` · **Situação:** investigação concluída, sem correções aplicadas.

## 1. Resultado para decisão

Foram documentados **16 achados: 15 falhas confirmadas e 1 divergência de arredondamento comprovada cuja política de compensação precisa ser definida**. Há ainda **2 hipóteses de concorrência**, separadas dos achados confirmados. Os testes existentes passam, mas não cobrem esses cenários adicionais.

**Supabase, GitHub e Vercel estão conectados.** A Vercel voltou a ser verificada depois da conexão feita nesta conversa. O deploy pronto usa o mesmo commit da cópia local e da branch main.

**Nenhum código de aplicação, configuração, migração ou dado real foi corrigido ou alterado.** Não houve commit, push, publicação, envio de mensagem, uso de senha ou teste de negócio em produção. As operações remotas foram consultas de conexão, deploy, migrações, definições de funções, avisos técnicos, logs agregados e metadados de backup. As reproduções e gravações de teste ocorreram apenas com dados fictícios locais.

As prioridades abaixo combinam impacto, condição de ocorrência e evidência. **Alta/P1** indica risco importante de informação errada, exposição ou perda de conteúdo. **Média/P2** indica falha relevante com condição mais restrita, tratamento manual possível ou dependência de volume. Não foi demonstrado incidente real nem consultado o conteúdo dos cadastros dos clientes para procurar vítimas.

| ID | Prioridade | Problema e condição principal |
|---|---|---|
| FIN-01 | Alta/P1 | Estornar acréscimo já recebido deixa saldo negativo sem tratamento de crédito. |
| FIN-02 | Média/P2 | Redistribuição e renegociação aceitam frações de centavo pela API e gravam soma diferente do combinado. |
| FIN-03 | Média/P2 | Estorno pode reabrir dívida mantendo contrato arquivado, fora do filtro de contratos ativos. |
| FIN-04 | Regra a definir | Estorno intermediário deixa diferença comprovada de R$ 0,01 na cota acumulada do acordo. |
| FIN-05 | Média/P2 | API aceita o valor especial NaN como dinheiro, contaminando saldos e somas. |
| FIN-06 | Alta/P1 | Trocar datas com respostas lentas pode gravar pagamento de uma data com juros calculados para outra. |
| FIN-07 | Média/P2 | Ficha do contrato trata lista limitada de recebimentos como completa; reproduzido com 1.001 registros. |
| SYS-01 | Alta/P1 | Renovação pendente pode restaurar a sessão depois de Sair. |
| SYS-02 | Média/P2 | Apagar anotações ao parar cronômetro mantém os textos antigos. |
| SYS-03 | Alta/P1 | Anotar em duas abas sobrescreve texto da outra sem aviso. |
| SYS-04 | Média/P2 | Transferência de evento nativo entre subagendas perde vínculos ativos com cliente/processo. |
| SYS-05 | Alta/P1 | Dois homônimos sem CPF podem fazer o componente trocar o id do cliente já selecionado. |
| SYS-06 | Média/P2 | PDF com JavaScript comprimido passa pela restrição de conteúdo ativo e recebe estado verificado. |
| SYS-07 | Média/P2 | Falha na leitura de feriados vira lista vazia, sem aviso na sugestão de prazo. |
| SYS-08 | Média/P2 | Falha na leitura de documentos faz o filtro de atrasados afirmar que não há processos, mesmo havendo. |
| WEB-01 | Alta/P1 | Textos do CMS viram HTML executável nas páginas públicas após publicação. |

**Ordem sugerida para uma futura correção:** preservar uma cópia restaurável; tratar WEB-01 e SYS-01; corrigir associações e sobrescritas (SYS-05/SYS-03); corrigir FIN-06/FIN-01; então tratar as demais validações, listas e falhas de leitura. FIN-04 exige decisão contábil antes de implementar compensação. Esta ordem é uma recomendação de planejamento, sem execução de ajustes.

## 2. Estado atual e conexões confirmadas

| Componente | Verificação e resultado |
|---|---|
| GitHub | Acesso autenticado a ithalokkugler-creator/FHL; branch main em 997f507da7f55e0ed8baa88f685a6a0289636a0b. [Código de referência](https://github.com/ithalokkugler-creator/FHL/tree/997f507da7f55e0ed8baa88f685a6a0289636a0b). |
| Cópia local | Mesmo commit; arquivos pessoais já modificados/não rastreados preservados. Nenhuma alteração rastreada de aplicação feita pela auditoria. |
| Vercel | Time Wibble, projeto fhl-advocacia, deploy dpl_Ycf5LGKqeMfjx9YF1pQJZxULeqS8 em READY/production; metadados apontam main e o mesmo commit. [Inspeção do deploy](https://vercel.com/wibble/fhl-advocacia/Ycf5LGKqeMfjx9YF1pQJZxULeqS8). O botão de publicar não foi acionado. |
| Supabase | Projeto fhl-advocacia / ulnpnbzibwbrzrpomgia em ACTIVE_HEALTHY; 42 migrações listadas até 20261022120000_antecipacao_documentos_processo. |
| Funções de borda | Cinco funções listadas como ACTIVE: receber-contato, publicar-site, finalizar-anexo, administrar-usuarios e google-agenda. Não foram chamadas com operações reais para testar. O handler publicado de finalizar-anexo também foi lido e seu conteúdo coincide com o arquivo local (normalizado apenas o fim do arquivo). |
| Definições do banco | Hash de 10 funções relevantes consultado no catálogo de produção e comparado com todas as migrações aplicadas no banco local: **10/10 idênticos**. Isto confirma essas definições, sem afirmar equivalência integral de todos os objetos/configurações. |

O sistema reúne site estático gerado a partir de src/ e área interna em sistema/, em JavaScript modular sem framework. O banco governa permissões e integridade por RLS, concessões de colunas, funções e gatilhos. Financeiro usa centavos inteiros na tela e numeric no banco; recebimentos e ajustes ficam no histórico por estorno/cancelamento. Agenda integra Google; intimações e tarefas têm conferência humana; documentos de processo são a entrega mais recente junto com antecipação.

Foram considerados o guia anexado de 22/10, CLAUDE.md, HANDOFF.md, os READMEs e as definições efetivas das migrações. O anexo foi usado como especificação e roteiro de revisão; não foi tratado como autorização para implementar, publicar ou sobrescrever dados.

## 3. Como a investigação foi feita

Trabalharam o revisor principal e **três subagentes**, incluindo um modelo menor: banco/financeiro; fluxos do sistema; site/regras. O principal reconferiu as reproduções financeiras e do sistema e executou testes adicionais no navegador.

| Método | Resultado / limite |
|---|---|
| Suíte JavaScript existente | 205/205 aprovados. |
| Suíte SQL existente | 707/707 aprovados, incluindo 16 verificações do ensaio de migração sobre dados antigos. |
| Revisão adicional do sistema | 120/120 testes selecionados repetidos pelo subagente; são subconjunto da suíte, não 120 casos novos. |
| Navegador interno | 53 combinações de rota/perfil/tamanho: sem erro JavaScript, resposta local 4xx/5xx ou overflow horizontal na carga normal observada. |
| Perfis | Admin, consulta, sem Clientes e Clientes sem Financeiro em contextos separados; bloqueios esperados de acesso foram observados. A suíte SQL cobre permissões adicionais. |
| Antecipação | Fluxo real de tela, banco fictício, recibo único e estorno integral; conferidos todos os saldos. |
| Documentos de processo | Cadastro, retorno e cancelamento pela tela; registro preservado. Controle de versão e perfil sem Clientes conferidos em banco local. |
| Testes de falha | Respostas lentas e fora de ordem, HTTP 503 simulado, sessão renovada após logout, dados com mais de 2 casas, NaN, 1.001 recebimentos, edições com fotografia antiga, PDF estruturado e conteúdo CMS fictício. |
| Site | Build offline em cópia isolada: 19 páginas; check 19/19. Home, contato e campanha em desktop e celular. Execução inofensiva de HTML injetado confirmada nos dois renderizadores reais. |

As duas primeiras tentativas de conectar o navegador à prévia ficaram bloqueadas pelas restrições do ambiente. Os testes efetivos foram executados na prévia local isolada em 127.0.0.1:8128. As falhas de infraestrutura do roteiro e um localizador de teste corrigido não foram contabilizados como bugs do produto.

### Fluxos novos que funcionaram nos cenários testados

- Pagamento de R$ 1.800 no contrato de seis parcelas de R$ 500, sem encargos na data usada: parcela 1 quitada; parcelas 6 e 5 quitadas; R$ 300 abatidos da parcela 4, que ficou com R$ 200. Parcelas 2 e 3 continuaram com R$ 500 cada. Um recibo de R$ 1.800 foi emitido; não houve soma duplicada nos recebimentos consultados.
- Estorno do pai estornou os três filhos, preservou os lançamentos e devolveu os seis saldos a R$ 500.
- Antecipação com R$ 333,33 mais R$ 0,01 e desconto existente respeitou centavos e ordem de abatimento.
- Mês fechado recusou a antecipação sem deixar pai ou filho gravado parcialmente.
- Documento de processo foi cadastrado, marcado como retornado e cancelado com motivo, permanecendo guardado.
- Atualização de documento com versão antiga afetou zero linhas; perfil sem Clientes não leu a tabela.

Não se conclui daí que todo cenário possível esteja correto; os achados e os limites abaixo mostram onde faltam garantias.

## 4. Achados financeiros detalhados

### FIN-01 — Estornar acréscimo já recebido produz saldo negativo sem tratar o crédito

**Gravidade:** alta (P1), integridade do saldo. **Demonstrado:** F01.

**Passos:** criar parcela de R$ 500; conceder acréscimo de R$ 100; receber R$ 600 de principal; estornar o acréscimo com motivo.

**Esperado:** recusar o estorno enquanto o principal ativo exceder o exigível resultante, ou realizar tratamento explícito de crédito/devolução validado pelo escritório.

**Real:** a operação é aceita. `v_parcelas`: `valor=500`, `exigivel=500`, `pago_principal=600`, `saldo=-100`, `situacao=paga`. O recebimento permanece de R$ 600 e não surge crédito/devolução separado. O modelo não trata esse saldo negativo como obrigação do escritório. A interface oferece o estorno do ajuste mesmo quando a parcela está paga.

**Causa / referências:** [supabase/migrations/20261008120100_contas_financeiras.sql:287](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261008120100_contas_financeiras.sql:287>) (`estornar_ajuste`), especialmente `:295`, atualiza diretamente o ajuste, sem travar a parcela nem validar o exigível após a retirada. O saldo é calculado em [supabase/migrations/20261020120000_acordo_direto_encargos.sql:546](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020120000_acordo_direto_encargos.sql:546>). A ação fica disponível em [sistema/js/telas/financeiro/contrato.js:472](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/contrato.js:472>). Nenhuma migração posterior redefine `estornar_ajuste`.

**Proposta sem aplicar:** obter a trava da parcela na mesma ordem usada por recebimento/concessão; calcular exigível e principal ativos depois do estorno; rejeitar resultado negativo com orientação clara. Se crédito for comportamento desejado, modelá-lo como evento próprio, com conta e destino, em vez de deixar saldo negativo silencioso.

**Perigos/regressões:** bloquear indiscriminadamente qualquer estorno de ajuste impediria retirar desconto legítimo; validar apenas na tela deixa API e outra aba vulneráveis; recalcular ou reduzir o recebimento apagaria evidência de dinheiro realmente recebido. A trava deve compartilhar a ordem com os recebimentos para evitar deadlocks.

**Preservação dos dados:** bloquear operações novas e inventariar divergências antigas sem alterá-las automaticamente; conciliar cada uma com os recebimentos/documentos. Qualquer crédito ou ajuste corretivo deve ser novo evento motivado e auditado. Não reescrever pagamentos nem totais de fechamentos aprovados.

### FIN-02 — Redistribuição e renegociação aceitam frações de centavo e alteram o total após gravar

**Gravidade:** média (P2), integridade financeira na API. **Demonstrado:** F02 e F03.

**Reprodução A:** contrato de R$ 1.000 com 2 parcelas de R$ 500; chamar `redistribuir_parcelas` com R$ 499,995 e R$ 500,005. A soma recebida é exatamente R$ 1.000, então passa nas validações. A gravação em `numeric(12,2)` transforma os valores em R$ 500,00 + R$ 500,01. **Real:** plano de R$ 1.000,01 versus contrato de R$ 1.000,00.

**Reprodução B:** renegociar R$ 1.000 em parcelas de R$ 333,333, R$ 333,333 e R$ 333,334. **Real:** `renegociacoes.valor_renegociado=1000,00`, mas parcelas somam R$ 999,99.

**Esperado:** recusar valores com mais de duas casas antes da comparação/gravação, como `criar_contrato` e `apurar_exito` já fazem. A interface atual envia centavos inteiros; reproduções usam a API/RPC para verificar a garantia do banco.

**Causa / referências efetivas:** [supabase/migrations/20261020150000_revisao_acordo.sql:255](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020150000_revisao_acordo.sql:255>) compara a soma crua; `:275` verifica somente valor maior que zero e `:281` grava com arredondamento implícito. [supabase/migrations/20261020120000_acordo_direto_encargos.sql:510](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020120000_acordo_direto_encargos.sql:510>) soma valores crus na renegociação; `:513` grava total e `:526` grava parcelas arredondadas. As versões anteriores são substituídas por essas definições. Não há redefinição posterior.

**Proposta sem aplicar:** exigir valor positivo, finito e igual a `round(valor,2)` em cada parcela, antes de somar; comparar os mesmos valores que serão persistidos. Aplicar a mesma regra nas demais RPCs financeiras.

**Perigos/regressões:** arredondar automaticamente em vez de recusar pode mudar o combinado; distribuir diferença na última parcela sem decisão pode alterar cota de acordo ou plano aceito. Endurecer só a RPC não protege outros pontos que escrevem valores monetários.

**Preservação dos dados:** nenhuma atualização em massa de parcelas existentes. Inventariar contratos/renegociações cuja soma armazenada diverge do combinado; aprovar correção individual e registrar evento e motivo, mantendo histórico anterior e fechamentos.

### FIN-03 — Estornos reabrem dívida em contrato arquivado e ele continua fora da lista de abertos

**Gravidade:** média (P2), inconsistência de ciclo e de visibilidade no filtro de contratos ativos. **Demonstrado:** F04 e F06.

**Reprodução pela interface:** criar parcela de R$ 500; conceder desconto de R$ 500; arquivar o contrato; acessar a tabela Ajustes e estornar o desconto. O botão continua disponível no arquivado.

**Reprodução API / aba antiga:** receber integralmente parcela de R$ 500; arquivar o contrato; estornar o recebimento com motivo através de chamada ainda disponível numa aba antiga ou diretamente na API.

**Real nos dois casos:** `v_contratos.ciclo=arquivado`, `rotulo=arquivado`, `saldo=500`, `situacao=ativo`. Esse achado não afirma desaparecimento de toda tela financeira: a evidência demonstra a exclusão do filtro de contratos ativos. A lista de contratos em aberto exige `ciclo=ativo`; esse contrato não aparece nela. A tela desativa o estorno de recebimento em arquivados, mas o banco aceita; o estorno de ajuste permanece habilitado na tela.

**Esperado:** exigir desarquivamento antes de operação que volta a criar obrigação, coerente com a proteção já implementada para estornar repasse.

**Causa / referências:** [supabase/migrations/20261008120100_contas_financeiras.sql:287](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261008120100_contas_financeiras.sql:287>) não verifica contrato arquivado; [supabase/migrations/20260915194302_financeiro.sql:453](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:453>) (`registrar_estorno`) não verifica ciclo. [sistema/js/telas/financeiro/contrato.js:472](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/contrato.js:472>) não testa `c.arquivado_em`. [sistema/js/telas/financeiro/contratos.js:74](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/contratos.js:74>) exclui arquivados da lista de abertos. Para comparação, [supabase/migrations/20261019180000_correcoes_cacada.sql:104](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261019180000_correcoes_cacada.sql:104>) já bloqueia estorno de repasse em arquivado.

**Proposta sem aplicar:** centralizar validação no banco em operações de estorno/ajuste que possam mudar saldo ou repasse; travar o contrato e exigir desarquivamento explícito; alinhar a tela. Estorno de pai de antecipação deve verificar o contrato antes de iniciar a cascata.

**Perigos/regressões:** desarquivar silenciosamente cria mudança de ciclo inesperada; bloquear todos os updates dos recebimentos impediria correção de observação permitida; a proteção deve cobrir estorno em cascata sem impedir a transação autorizada após desarquivar.

**Preservação dos dados:** detectar arquivados com saldo/repasse/êxito pendente e apresentar para revisão. Não apagar estornos nem arquivamentos existentes; desarquivamento corretivo precisa motivo e auditoria, preservando suas datas e histórico.

### FIN-04 — Estorno intermediário quebra a cota acumulada do acordo por um centavo

**Classificação:** divergência numérica comprovada; a existência de uma regra de compensação obrigatória após estorno e sua implementação dependem de decisão do escritório. Não foi contada entre as 15 falhas confirmadas. **Demonstrado:** F05.

**Passos:** parcela de acordo de R$ 333,33, cota de 30%; receber 3 × R$ 111,11. O sistema aloca honorários de R$ 33,33, R$ 33,34 e R$ 33,33, totalizando R$ 100,00, coerente com a correção de acumulado. Estornar a **segunda** parte antes de fazer repasse.

**Real:** principal ativo de R$ 222,22 e honorários ativos de R$ 66,66, enquanto `round(222,22 × 30%,2)=66,67`. A parte do cliente fica um centavo maior; a divergência permanece enquanto não entrar novo recebimento que compense o acumulado.

**Esperado segundo a regra acumulada existente:** o total ativo seguir a cota após estorno, ou a interface/relatório reconhecer explicitamente a diferença de arredondamento e sua compensação. A diferença numérica é comprovada; o tratamento contábil exato deve ser definido pelo escritório antes de corrigir.

**Causa / referências:** [supabase/migrations/20261020120000_acordo_direto_encargos.sql:137](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020120000_acordo_direto_encargos.sql:137>)–`:150` compensa a diferença somente no próximo INSERT de recebimento. O estorno em [supabase/migrations/20260915194302_financeiro.sql:453](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:453>) remove um componente do acumulado sem registrar compensação de cota. `previa_fechamento` soma os honorários armazenados em [supabase/migrations/20261020120000_acordo_direto_encargos.sql:662](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020120000_acordo_direto_encargos.sql:662>).

**Proposta sem aplicar:** definir uma política explícita de compensação de centavos em estornos; considerar ajuste contábil separado e auditável, ou restrição de ordem de estorno com instrução apropriada. Exibir a conciliação entre cota contratual, honorários registrados e diferença de arredondamento.

**Perigos/regressões:** recalcular os recebimentos posteriores pode mudar repasses já feitos e meses fechados; impor estorno reverso como regra nova pode impedir correções legítimas antigas; as cotas distintas sobre principal e encargos e o pagamento direto ao cliente precisam entrar na decisão.

**Preservação dos dados:** não atualizar automaticamente `valor_repasse` dos pagamentos sobreviventes. Manter valores originais e registrar eventual centavo compensatório como novo evento aprovado.

### FIN-05 — A API aceita `NaN` como dinheiro e grava saldo não numérico

**Gravidade:** média (P2), validação da API com potencial de contaminar relatórios. **Demonstrado:** F07.

**Passos:** chamar `criar_contrato` com `valor_total: "NaN"` e uma parcela com `valor: "NaN"`; demais campos válidos. Perfil usado: membro administrador com acesso legítimo ao financeiro. Não é um teste pela interface de formulário, que rejeita a entrada.

**Real:** contrato criado com `valor_total="NaN"` e `v_contratos.saldo="NaN"`. PostgreSQL aceita `NaN` no tipo `numeric`; comparações positivas e igualdade com arredondamento não o rejeitam. Somatórios que incluírem a linha podem retornar `NaN`; a conversão do front também resulta em `NaN`.

**Esperado:** rejeitar qualquer valor monetário não finito antes de gravar.

**Causa / referências:** [supabase/migrations/20261020120000_acordo_direto_encargos.sql:216](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020120000_acordo_direto_encargos.sql:216>) só verifica nulo/menor ou igual a zero; `:246` compara `v_total` a `round(v_total,2)`. Valores das parcelas recebem a mesma forma de validação em `:317`. Constraints de `numeric(12,2)` com `>0` em [supabase/migrations/20260915194302_financeiro.sql:126](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20260915194302_financeiro.sql:126>) e `:172` não excluem `NaN`. Conversão do front: [sistema/js/nucleo/formato.js:24](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/formato.js:24>).

**Proposta sem aplicar:** constraints e validações explícitas que excluam `NaN` em valores monetários, em conjunto com limite positivo/faixa e casas decimais; validar consistentemente em todas as entradas financeiras, mantendo nulos nos campos opcionais legados.

**Perigos/regressões:** proibir nulos indiscriminadamente quebra contratos de êxito ainda a apurar e campos legados; acrescentar constraint validada diretamente pode falhar caso existam valores antigos inválidos. Evitar converter `NaN` para zero: isso inventaria informação financeira.

**Preservação dos dados:** primeiro consultar/inventariar valores especiais, sem alterá-los; novas restrições podem começar para escritas novas e ser validadas depois da revisão dos legados. Corrigir cada dado inválido com evidência e auditoria, nunca substituir por zero silenciosamente.

### FIN-06 — Resposta antiga de cálculo pode prevalecer sobre a data atual do pagamento

**Gravidade:** alta/P1. **Comprovação:** navegador com código real, banco fictício e índice externo integralmente simulado.

**Passos:** criar parcela de R$ 500 vencida em 01/07/2026, multa 2%, juros 1% ao mês e IPCA. No diálogo Receber, escolher 02/08/2026 e logo depois 02/09/2026. Simular 900 ms para a resposta da primeira data e 30 ms para a segunda. Os índices fictícios foram todos zero, para isolar juros e ordem das respostas. Esperar ambas e registrar o valor sugerido.

**Esperado:** campo Data e cálculo devem ser de 02/09; pela própria regra do sistema, R$ 520,50. Uma resposta anterior deve ser descartada quando a data muda.

**Real:** o campo fica em 02/09/2026, mas o valor sugerido e gravado é R$ 515,33, de 02/08. O recebimento salvo traz data 2026-09-02 e memoria_calculo.calculado_em 2026-08-02. Diferença demonstrada: R$ 5,17. O banco aceita e a parcela fica quitada. Na antecipação, o mesmo cálculo também decide quanto é encargo e quanto é sobra para outras parcelas.

**Causa / referências:** [sistema/js/telas/financeiro/base.js:389](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/base.js:389>) cria um pedido a cada mudança de data; `:391` aplica qualquer resposta na variável compartilhada calculo; `:409` espera somente a promessa mais recentemente atribuída. Uma promessa anterior ainda pode terminar depois e substituir o resultado, mesmo que a mais nova já tenha sido aguardada.

**Proposta, sem aplicar:** associar cada pedido a uma versão e à data que o iniciou, aplicar apenas o resultado da seleção atual e garantir na submissão que o cálculo usado corresponde exatamente à data enviada. Impedir a gravação durante o cálculo vigente ou recalcular de forma consistente antes de construir os dados. O critério deve abranger recibo, memória, encargos e excedente da antecipação.

**Perigos/regressões:** desabilitar o botão sem restaurá-lo em falha de rede prende o diálogo; cancelar requisição que está em cache e é compartilhada pode afetar outra tela; preencher automaticamente o valor após cada resposta pode sobrescrever um pagamento parcial digitado. O controle de versão deve preservar o estado valorDigitado e tratar as duas ordens possíveis de resposta.

**Preservação:** corrigir o fluxo futuro sem recalcular recebimentos antigos automaticamente. Uma eventual conferência de divergência entre data e memória deve produzir lista para revisão; diferenças de valor precisam de decisão e lançamento auditado, mantendo pagamentos, recibos e fechamentos originais.

**Evidências:** [.local/auditoria-20261023/principal/casos-adicionais.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/casos-adicionais.mjs>), [.local/auditoria-20261023/principal/casos-adicionais.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/casos-adicionais.json>) e [.local/auditoria-20261023/principal/corrida-datas.png](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/corrida-datas.png>).

### FIN-07 — Ficha do contrato mostra lista truncada como se fosse completa

**Gravidade:** média/P2; depende de atingir o limite de resposta da API.

**Passos:** criar contrato fictício de R$ 500 e 1.001 recebimentos de R$ 0,01. Abrir sua ficha, fazendo a API local emular o teto de 1.000 linhas por resposta. O teste de transporte corta apenas a resposta da consulta sem paginação; o banco guarda todos os registros e a consulta paginada comprova 1.001.

**Esperado:** mostrar todas as linhas por paginação, ou informar total e oferecer próximas páginas. As partes de antecipação e seu pai devem permanecer relacionáveis mesmo na fronteira da página.

**Real:** há 1.001 recebimentos no banco; a ficha mostra 1.000, sem aviso ou continuação. O cabeçalho usa totais completos de v_contratos, mas o histórico de recebimentos apresentado fica incompleto. Não houve apagamento físico. O limite de 1.000 é o padrão descrito no projeto e foi emulado explicitamente: não foi medido o teto atual de produção nem afirmado que contratos reais já tenham esse volume.

**Causa / referências:** [sistema/js/telas/financeiro/contrato.js:212](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/contrato.js:212>) usa db.listar para recebimentos; `:213`, `:214` e `:222` têm consultas semelhantes para renegociações, ajustes e recibos. [sistema/js/nucleo/supabase.js:331](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/supabase.js:331>) implementa listar como uma chamada; `:338` já oferece todos para percorrer páginas. A ocorrência foi demonstrada na lista de recebimentos; as outras listas são pontos de revisão pela mesma causa, sem reproduções volumétricas independentes.

**Proposta, sem aplicar:** paginação com contagem total e ordem estável terminada no id; quando necessário para agrupar antecipações, buscar pai/filhos vinculados explicitamente. Para listas pequenas, todos pode ser suficiente, mas o custo de desenhar milhares de linhas deve ser considerado.

**Perigos/regressões:** trocar apenas listar por todos pode congelar a interface em contratos extensos; paginação instável duplica ou pula registros; dividir pai/filhos entre páginas pode esconder partes do estorno/recibo. As ações financeiras não podem depender da soma das linhas atualmente visíveis.

**Preservação:** mudança de leitura/apresentação, sem regravar linhas, valores, vínculos ou recibos. Comparar quantidade e soma do conjunto total com a exportação e testar cortes entre pai e filhos de antecipação.

**Evidências:** [.local/auditoria-20261023/principal/casos-adicionais.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/casos-adicionais.mjs>) e [.local/auditoria-20261023/principal/casos-adicionais.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/casos-adicionais.json>), cenário limite 1000 da API emulado.

## 5. Achados nos demais fluxos do sistema

### SYS-01 — Logout pode ser desfeito por uma renovação de sessão em andamento

**Gravidade:** alta / P1, exposição de sessão e comportamento incompatível com Sair. Janela pequena, mas determinística quando a resposta da renovação fica pendente.

**Local:** [sistema/js/nucleo/supabase.js:179](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/supabase.js:179>) (`sair`), `:193` (`renovar`), `:209` (gravação incondicional da sessão retornada).

**Reprodução:** 1) entrar com uma sessão próxima de expirar; 2) iniciar a renovação automática e atrasar sua resposta; 3) clicar Sair — o armazenamento fica vazio; 4) entregar a resposta de sucesso da renovação. O cliente volta a gravar os novos tokens e informa seus ouvintes de que existe sessão novamente.

**Esperado:** depois de Sair, uma requisição antiga não pode restaurar a identidade anterior.

**Real:** `sessaoAtual()` passa de `null` para uma nova sessão; `fhl.sessao` reaparece no armazenamento. O teste não presume que um token específico continuaria válido eternamente no servidor: prova a restauração indevida do estado autenticado do cliente. Em uma corrida equivalente com outra entrada, a resposta antiga também poderia trocar a identidade atual.

**Causa:** `sair()` limpa a sessão sem invalidar/cancelar a renovação pendente; `renovar()` usa uma fotografia anterior e chama `guardar(sessaoDe(d))` mesmo que a sessão já tenha sido encerrada ou substituída.

**Proposta, sem aplicar:** manter um identificador de geração da sessão e validar que a sessão que iniciou a renovação ainda é a atual antes de gravar seu resultado. Invalidar essa geração ao sair e ao trocar de identidade; considerar também a coordenação das abas, que já usa `navigator.locks` para renovação.

**Perigos da correção:** abortar indiscriminadamente renovações pode derrubar abas que acabaram de entrar; comparar só o access token pode descartar renovação válida de outra aba. Não tornar o logout dependente da rede. Ensaiar sair/entrar rapidamente, duas abas, internet lenta e renovação recusada.

**Preservação:** nenhuma atualização de banco de clientes/financeiro é necessária. Não apagar armazenamento genérico, notas de trabalho ou registros do usuário para resolver o problema; limitar a mudança ao estado de autenticação.

**Evidência:** [.local/auditoria-20261023/sistema/repro-auth.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-auth.mjs>), [.local/auditoria-20261023/sistema/resultado-auth.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-auth.json>).

### SYS-02 — Texto removido no diálogo Parar reaparece no registro concluído

**Gravidade:** média / P2. Um rascunho incorreto pode ser mantido num registro que serve de prova do atendimento.

**Local:** [sistema/js/telas/atualizacoes/cronometro.js:272](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/atualizacoes/cronometro.js:272>); [supabase/migrations/20261005212642_atualizacoes.sql:273](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261005212642_atualizacoes.sql:273>) e `:274`.

**Reprodução:** iniciar cronômetro com relato `RASCUNHO INCORRETO`; anotar uma próxima providência; abrir Parar; apagar integralmente os dois textos; salvar e parar. A tela envia `p_relato: ''` e `p_proxima: ''`.

**Esperado:** os campos que a pessoa esvaziou devem ficar vazios após confirmação.

**Real:** o relógio para, mas os dois textos antigos continuam. O banco trata texto vazio e ausência de parâmetro como a mesma intenção: `coalesce(nullif(btrim(p_relato), ''), relato)`.

**Proposta, sem aplicar:** distinguir parâmetro não enviado (preservar, inclusive para clientes antigos) de campo enviado vazio (limpar). Pode-se acrescentar indicação explícita dos campos alterados ou uma nova assinatura de RPC compatível com a antiga. A exclusão intencional deve permanecer no histórico como qualquer edição.

**Perigos da correção:** trocar o `coalesce` por atribuição direta apagaria relatos em chamadas antigas que param o relógio sem enviar texto. O cenário se combina com notas abertas em outra aba: texto vazio deve significar intenção comprovada do formulário, sem eliminar notas mais novas silenciosamente.

**Preservação:** corrigir comportamento apenas das próximas edições. Não limpar em lote textos antigos, pois não é possível inferir se foram ou não mantidos intencionalmente. Manter o histórico anterior.

**Evidência:** [.local/auditoria-20261023/sistema/repro-banco.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-banco.mjs>), achado SYS-02 de [.local/auditoria-20261023/sistema/resultado-banco.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-banco.json>).

### SYS-03 — Anotações do cronômetro perdem alterações entre abas

**Gravidade:** alta / P1, perda silenciosa de informação no registro ativo. O histórico pode conter versões anteriores; isso não evita que a ficha/relatório use um relato desatualizado.

**Local:** [sistema/js/telas/atualizacoes/cronometro.js:172](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/atualizacoes/cronometro.js:172>), `:177`–`:179`. Comparação: os novos documentos do processo já usam `alterado_em` corretamente em [sistema/js/telas/documentos-processo.js:81](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/documentos-processo.js:81>).

**Reprodução:** abrir Anotar para o mesmo relógio nas abas A e B, ambas com `Relato inicial`. Em A trocar o relato para `Relato escrito na aba A` e salvar. Em B, sem mexer no relato, escrever somente `Providência escrita na aba B` e salvar.

**Esperado:** preservar a alteração da aba A e a providência da aba B, ou bloquear o segundo salvamento com aviso de conflito que conserve o texto para copiar/conferir.

**Real:** B envia os dois campos da fotografia antiga, sem condição de versão. O banco aceita; o relato volta a `Relato inicial`. Os dois salvamentos são considerados bem sucedidos.

**Causa:** a tela compara os campos somente com sua variável local `salvo`. Os filtros só verificam id, relógio ainda aberto e não cancelado. Não verificam o instante/versão da leitura; os dois campos são gravados juntos mesmo que só um tenha sido editado.

**Proposta, sem aplicar:** combinar atualização apenas dos campos efetivamente editados com controle de versão no servidor (como documentos do processo). Serializar os salvamentos automáticos e o Salvar/fechar para evitar requisições da mesma tela fora de ordem; apresentar conflito sem remover o texto digitado.

**Perigos da correção:** controle de versão sem atualizar a versão local após cada autosave passa a bloquear os próprios próximos salvamentos; tentar mesclar automaticamente dois relatos pode duplicar ou adulterar a narrativa. O fechamento atual dispara salvamento assíncrono antes de o diálogo desaparecer, então conflitos precisam conservar o rascunho visível/recuperável.

**Preservação:** não reescrever relatos existentes em massa. Onde houver suspeita de sobrescrita, conferir manualmente as versões da auditoria e acrescentar a correção com justificativa. O objetivo é preservar o conteúdo mais recente e o histórico completo.

**Evidência:** [.local/auditoria-20261023/sistema/repro-banco.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-banco.mjs>), achado SYS-03 de [.local/auditoria-20261023/sistema/resultado-banco.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-banco.json>).

### SYS-04 — Evento do Google movido entre subagendas perde o vínculo ativo com o cliente

**Gravidade:** média / P2. Mantém um original cancelado e cria outro sem cliente/processo; informações internas deixam de acompanhar o compromisso que continua ativo.

**Local:** [supabase/migrations/20261020200000_agenda_google_sincronizacao.sql:479](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020200000_agenda_google_sincronizacao.sql:479>)–`:481` (busca da ligação), `:590` (criação sem vínculos), [supabase/functions/google-agenda/handler.js:206](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/functions/google-agenda/handler.js:206>) (confirmados antes de cancelados).

**Reprodução local:** importar evento nativo `evento-nativo-ficticio` na subagenda A; associá-lo no sistema a um cliente e preencher a referência interna de processo; aplicar o mesmo evento confirmado na subagenda B, seguido da exclusão na A — a ordem que o handler já utiliza para movimentos. A RPC cria novo compromisso na B e cancela o antigo na A.

**Esperado:** reconhecer a transferência do mesmo evento entre duas subagendas conhecidas e conservar os vínculos e o histórico internos, mudando o responsável. A própria integração tem tratamento de transferência para os ids de eventos originados no sistema.

**Real:** compromisso ativo na B com `cliente_id = null` e `processo = null`; original com cliente e referência fica cancelado. Não houve erro em nenhuma RPC. Os dados antigos permanecem no registro cancelado, mas deixam de acompanhar o compromisso em uso.

**Causa:** a busca inicial exige calendário + id. A busca em outro calendário só existe quando o id começa com `fl` e contém o UUID do compromisso criado no sistema. Um evento nativo não usa esse formato e cai na criação.

**Limite da evidência:** a [documentação Google de movimentação](https://developers.google.com/workspace/calendar/api/v3/reference/events/move) confirma a operação entre calendários. O comportamento da aplicação foi reproduzido com eventos fictícios no banco e o protocolo consumido pelo handler, sem mover agenda real do escritório. Não foi necessário alterar Google ou produção.

**Proposta, sem aplicar:** identificar transferências com dados de identidade do evento suficientes para diferenciar uma movimentação real de uma cópia; preservar o id do compromisso e seus vínculos. Considerar `iCalUID`/organizador/recorrência e a exclusão de origem, pois só comparar título, horário ou id sem calendário pode unir eventos independentes.

**Perigos da correção:** deduplicação agressiva pode fundir duas reservas diferentes; mover particular para outra pessoa exige reavaliar privacidade. Deve continuar valendo a regra de não escrever em eventos nascidos no Google.

**Preservação:** não apagar originais cancelados nem juntar retrospectivamente por título. Para casos existentes, apresentar pareamentos para revisão e preservar histórico/vínculos explícitos antes de qualquer remapeamento.

**Evidência:** [.local/auditoria-20261023/sistema/repro-banco.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-banco.mjs>), achado SYS-04 de [.local/auditoria-20261023/sistema/resultado-banco.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-banco.json>).

### SYS-05 — Dois clientes homônimos sem CPF se resolvem para o primeiro id

**Gravidade:** alta / P1. Pode associar compromisso, tarefa ou documento à pessoa errada; CPF é opcional no cadastro rápido, portanto a condição é válida.

**Local:** [sistema/js/dominio/clientes.js:226](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/dominio/clientes.js:226>)–`:229`; [sistema/js/telas/clientes.js:30](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/clientes.js:30>), `:170`–`:175` e `:235`.

**Reprodução:** ter dois clientes com o nome exato `HOMÔNIMO FICTÍCIO` e sem documento. Um formulário vem preenchido com o id do segundo. O rótulo dos dois é apenas o nome. `ligarCampoCliente` chama `resolver({sempre:true})` ao abrir; a regra `acharCliente` retorna o primeiro rótulo coincidente e pode substituir o id oculto pelo do primeiro cliente.

**Esperado:** conservar o id explicitamente selecionado e exigir escolha inequívoca se o usuário apenas digitar um nome ambíguo.

**Real:** a função real retorna o primeiro id para o texto do segundo. A verificação posterior de nomes duplicados não é alcançada, porque o `find` pelo rótulo retorna antes.

**Reconferência adicional no navegador:** o principal montou o componente real campoCliente com id inicial ficticio-b; após ligarCampoCliente, o id oculto passou para ficticio-a. Nenhum cliente real foi criado ou alterado. Evidência: [.local/auditoria-20261023/principal/documentos-ui.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/documentos-ui.json>).

**Cobertura anterior:** [sistema/testes/pedidos-2110.test.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/testes/pedidos-2110.test.mjs>) cobre homônimos com CPFs diferentes e o caso de somente um homônimo sem CPF. Não cobre dois rótulos sem CPF iguais.

**Proposta, sem aplicar:** não resolver automaticamente rótulos duplicados; manter a seleção explicitamente feita por id enquanto o texto corresponder a ela. Incluir distinção visual segura entre homônimos, sem tornar CPF obrigatório para cadastros existentes. Ensaiar formulário já preenchido, clique no segundo nome, teclado, navegação vinda da ficha e perfis que não podem ler CPF.

**Perigos da correção:** retirar a resolução automática sem adaptar o componente pode apagar o cliente ao abrir formulários antigos; acrescentar dados pessoais ao rótulo indiscriminadamente pode expor campos a perfis com cadastro mínimo. Também é necessário impedir que a ambiguidade retorne ao recarregar uma lista nova.

**Preservação:** não fundir clientes por nome nem criar CPF fictício. Correção deve manter todos os ids atuais. Eventuais associações antigas erradas exigem conferência manual e edição auditada, sem realocar contratos/pagamentos automaticamente.

**Evidência:** [.local/auditoria-20261023/sistema/repro-regras-anexos.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-regras-anexos.mjs>), achado SYS-05 de [.local/auditoria-20261023/sistema/resultado-regras-anexos.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-regras-anexos.json>). A inferência de impacto nos formulários vem da chamada de `resolver` na abertura; o id errado foi reproduzido diretamente na regra real.

### SYS-06 — PDF com conteúdo ativo comprimido é marcado como verificado

**Gravidade:** média / P2 nesta consolidação, por depender de envio de arquivo e do leitor que o abrir. Falha da restrição anunciada pela verificação; não é alegação de antivírus completo nem de execução automática no navegador. A execução depende do leitor que abrir o arquivo.

**Local:** [supabase/functions/finalizar-anexo/handler.js:41](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/functions/finalizar-anexo/handler.js:41>)–`:47`, `:105` e etapa que chama `finalizar_anexo_servico`.

**Reprodução:** criar PDF 1.5 válido contendo uma ação de abertura com JavaScript benigno `app.alert("AUDITORIA FICTICIA")`, guardada em fluxo de objetos comprimido (`ObjStm`/`FlateDecode`). Submeter seus bytes ao scanner real e ao handler de finalização com reserva e Storage fictícios.

**Esperado:** recusar o PDF por conter JavaScript, conforme a regra explícita do módulo.

**Real:** `riscoNoPdf` retorna `null`; o handler devolve HTTP 200, estado `verificado` e chama a RPC com `p_aprovado: true`. O analisador independente Poppler `pdfinfo` confirma uma página A4, PDF 1.5 válido, `JavaScript: yes`; `pdfinfo -js` extrai a ação. Nenhum JavaScript foi executado no teste.

**Causa:** os bytes são decodificados como texto e varridos por regex. Nomes em objetos comprimidos não aparecem no texto bruto. A verificação atual trata somente nomes escritos em claro ou com escapes hexadecimais; não interpreta a estrutura do PDF.

**Proposta, sem aplicar:** usar análise estrutural de PDF que percorra objetos/fluxos e identifique ações e arquivos embutidos; impor limites à descompressão/complexidade e recusar formatos não inspecionáveis com mensagem clara. Não basta acrescentar outra regex ao fluxo comprimido.

**Perigos da correção:** falso positivo pode impedir contratos e digitalizações legítimas; descompressão sem limite cria risco de consumo de memória. Alguns PDFs usam estruturas modernas de forma legítima, por isso bloquear todo ObjStm prejudicaria arquivos comuns. Preservar o arquivo original e o SHA-256; não reprocessar/adulterar a evidência assinada para retirar conteúdo automaticamente.

**Preservação:** aplicar a regra a novos envios e preparar eventual conferência dos já existentes mantendo todos os arquivos/versões e seus hashes. Não excluir PDFs antigos por uma classificação nova sem revisão e registro do motivo.

**Evidência:** [.local/auditoria-20261023/sistema/repro-regras-anexos.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-regras-anexos.mjs>), achado SYS-06 de [.local/auditoria-20261023/sistema/resultado-regras-anexos.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-regras-anexos.json>), [.local/auditoria-20261023/sistema/pdf-objstm-ficticio.pdf](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/pdf-objstm-ficticio.pdf>), [.local/auditoria-20261023/sistema/pdfinfo-estrutura.txt](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/pdfinfo-estrutura.txt>), [.local/auditoria-20261023/sistema/pdfinfo-javascript.txt](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/pdfinfo-javascript.txt>).

### SYS-07 — Feriados indisponíveis viram silenciosamente ausência de feriados cadastrados

**Gravidade:** média / P2. A conferência humana obrigatória reduz o risco, mas a tela deixa de informar uma falha conhecida e apresenta uma sugestão incompleta como uma sugestão normal.

**Local:** [sistema/js/telas/tarefas/formulario.js:77](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/tarefas/formulario.js:77>); cálculo em `:179`–`:181`.

**Reprodução:** ter um feriado local fictício em 26/10/2026; fazer a consulta da tabela `feriados` falhar; abrir novo prazo com base 23/10/2026 e quantidade 1 dia útil. O carregamento usa `.catch(() => [])`; a sugestão passa a usar apenas os feriados que consegue derivar automaticamente, sem os cadastrados que falharam.

**Esperado:** informar que os feriados cadastrados não foram carregados e impedir a sugestão baseada neles, ou mostrar a limitação de forma explícita mantendo a entrada manual disponível.

**Real:** a mesma regra retorna 27/10 com o feriado fictício e 26/10 com a lista vazia; o formulário absorve o erro e não guarda um estado de indisponibilidade para avisar a pessoa.

**Limite da evidência:** o descarte do erro foi confirmado na implementação e a divergência de cálculo foi reproduzida com a função real. Não foi forçada falha de rede no navegador. O exemplo não afirma que a data fictícia seja feriado verdadeiro nem faz interpretação jurídica.

**Proposta, sem aplicar:** distinguir consulta concluída sem feriados de consulta falha. Manter o formulário manual utilizável, mas sinalizar falha e oferecer nova tentativa; só sugerir contando com o conjunto explicitamente conhecido. Guardar na memória do prazo quais fontes foram usadas.

**Perigos da correção:** bloquear todo o cadastro em qualquer falha de feriado impediria lançar manualmente um prazo urgente; tentar novamente depois que o advogado ajustou a data não pode substituir a data conferida silenciosamente. Não recalcular prazos já salvos retroativamente.

**Preservação:** os prazos existentes e suas memórias devem permanecer intactos. Um recálculo posterior deve ser uma proposta revisável, com histórico da decisão do advogado.

**Evidência:** [.local/auditoria-20261023/sistema/repro-regras-anexos.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-regras-anexos.mjs>), achado SYS-07 de [.local/auditoria-20261023/sistema/resultado-regras-anexos.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/resultado-regras-anexos.json>).

### SYS-08 — Falha de leitura dos documentos produz falso “nenhum atrasado”

**Gravidade:** média/P2. Afeta a função nova de documentos do processo em condição de erro de rede/servidor.

**Passos:** na semente fictícia, abrir Processos com filtro Retorno de documentos = Com retorno atrasado. A usucapião fictícia aparece, pois tem uma certidão atrasada. Fazer a consulta GET processos_documentos falhar com HTTP 503 e recarregar o mesmo filtro.

**Esperado:** informar que os documentos não puderam ser carregados e que o filtro não pode afirmar ausência de pendências; permitir nova tentativa. A listagem geral de processos pode continuar disponível com indicação da limitação.

**Real:** a tela mostra “Nenhum processo com retorno de documento atrasado, com esses filtros.” Nenhuma mensagem de erro fica visível, e o processo que deveria aparecer é removido do resultado. O registro continua intacto no banco. Foi reproduzido no navegador com a consulta real da aplicação e falha local simulada.

**Causa / referências:** [sistema/js/telas/processos.js:201](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/processos.js:201>) transforma qualquer falha de leitura dos documentos em uma lista vazia; `:183`–`:185` filtram sobre essa lista; `:189` escolhe a mensagem de ausência de atrasados. O comentário considera o resumo um dado extra, mas o mesmo dado decide um filtro funcional.

**Proposta, sem aplicar:** distinguir “carregado e vazio” de “não carregado”. Suspender o filtro dependente de documentos até obter os dados e oferecer nova tentativa; preservar os demais filtros e a busca já digitada. O painel Hoje e outros resumos dependentes merecem o mesmo tratamento de disponibilidade, sem presumir novos bugs ali.

**Perigos/regressões:** bloquear a tela inteira por um resumo opcional dificulta consultar processos em uma falha parcial; refazer a consulta não pode apagar busca/rolagem nem aplicar resposta de filtro antigo depois de outro. A mensagem de nenhum resultado só deve surgir após uma leitura bem sucedida.

**Preservação:** solução exclusivamente de estado/leitura; não criar, cancelar ou mudar documentos para compensar erro de rede. Não recalcular datas existentes. O teste anterior de cadastrar, registrar retorno e cancelar conservou a linha e seu motivo.

**Evidências:** [.local/auditoria-20261023/principal/documentos-ui.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/documentos-ui.mjs>), [.local/auditoria-20261023/principal/documentos-ui.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/documentos-ui.json>) e [.local/auditoria-20261023/principal/documentos-falha-silenciosa.png](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/documentos-falha-silenciosa.png>).

## 6. Site público

### WEB-01 — HTML executável vindo dos textos do CMS

- **Gravidade:** Alta/P1 nesta consolidação. Site público e área interna compartilham a mesma origem, e a sessão da área interna é guardada no localStorage dessa origem ([sistema/js/nucleo/supabase.js:16](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/supabase.js:16>)). Um script no site pode, portanto, alcançar o estado da sessão de quem também entrou no sistema nesse navegador. Esse impacto é inferido da arquitetura; nenhum token real foi lido no teste. É XSS persistente condicionado a acesso de escrita/publicação no CMS; quem visita a página publicada executa o HTML injetado.
- **Passos verificáveis com dado fictício:** com dados fictícios, passe `<img src="data:image/png;base64,AA==" onerror="document.documentElement.setAttribute('data-auditoria','prova')">` como título para `buildCampanha()`, abra o resultado no Chrome headless e aguarde o erro da imagem. O elemento aparece dentro do `h1` e seu handler altera o atributo local `data-auditoria` do documento para `prova`. O mesmo conteúdo também é devolvido cru por `buildPost()`.
- **Esperado:** os campos de texto simples são escapados e aparecem como texto. A tela do editor descreve publicações como blocos (parágrafo, subtítulo, destaque, lista), “não num editor de texto rico”, e afirma que o site controla a marcação.
- **Real:** valores salvos são interpolados sem escape em contexto HTML. O CMS aceita esses valores como texto e grava sem rejeitar tags.
- **Referências:** `sistema/js/telas/site/publicacao.js:1-5, 112-116, 217-250` documenta/coleta conteúdo simples; `src/pages/publicacoes.mjs:17-25, 121-129, 193-198` injeta resumo, título, autor, área e corpo sem escape; `src/pages/campanhas.mjs:36-40, 88-90, 125-128, 140-144, 156, 160, 179-182` injeta os campos da campanha; [sistema/js/telas/site/campanha.js:81-103](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/site/campanha.js:81>) mapeia os campos para persistência.
- **Causa:** os renderizadores usam templates HTML brutos para dados editáveis. `attr()` protege atributos HTML, mas não há escape de texto aplicado aos dados do CMS.
- **Validação no banco e CSP:** `supabase/migrations/20260916120520_conteudo.sql:128-175, 250-275` verifica estrutura, tipo e campos não vazios, mas não rejeita markup; [supabase/migrations/20261011120000_correcoes_red_team.sql:136-151](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261011120000_correcoes_red_team.sql:136>) trata links de cartões sociais. Em `vercel.json:7-36` as rotas públicas não recebem CSP; `script-src 'self'` está somente nos cabeçalhos de `/sistema` (`:47-70`). Assim, a política configurada para a área interna não bloqueia o handler no site público.
- **Proposta (não aplicada):** escapar os campos CMS que são texto antes de interpolá-los; manter cartões sociais como estruturas renderizadas pelo código. Se formatação inline for necessária, definir formato explícito e sanitizador allowlist que retire scripts, handlers e URLs executáveis, aplicado a artigos e campanhas.
- **Perigos/regressões:** escapar o corpo inteiro pode alterar formatação legítima que já exista em conteúdo antigo. Primeiro identificar campos antigos que contenham markup legítimo e converter apenas o necessário para representação segura.
- **Preservação de dados antigos:** não apagar nem sobrescrever registros. Fazer cópia/contagem dos campos com tags; aplicar a correção na saída, mantendo o texto original no banco. Se houver migração para novo formato, fazer backup e conversão reversível antes de qualquer gravação.
- **Limite de acesso necessário:** alguém com permissão de edição/publicação precisa cadastrar o conteúdo; depois disso, visitantes comuns acionam a execução ao abrir a página.


**Reconferência independente do principal:** foram importados diretamente buildCampanha e buildPost do código original, usando o título fictício com uma imagem data: inválida e um handler que só define o atributo data-auditoria=prova. O navegador interpretou uma imagem dentro do h1 e executou o marcador nos dois casos. Todo acesso de rede foi bloqueado. Evidências: [.local/auditoria-20261023/principal/prova-site-real.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/prova-site-real.mjs>), [.local/auditoria-20261023/principal/prova-site-real.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/prova-site-real.json>) e capturas xss-campanha-renderizador.png / xss-publicacao-renderizador.png. Nenhum payload foi publicado ou salvo no CMS real.

## 7. Hipóteses que não devem ser confundidas com bugs demonstrados

1. **Deadlock entre antecipações concorrentes no mesmo contrato.** O plano é lido antes de travar todas as parcelas; cada inserção trava primeiro a origem e depois os alvos. Duas chamadas com origens diferentes podem exigir travas em ordem incompatível. Referências: [supabase/migrations/20261022120000_antecipacao_documentos_processo.sql:181](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261022120000_antecipacao_documentos_processo.sql:181>), `:206`, `:240`, `:257` e [supabase/migrations/20261020120000_acordo_direto_encargos.sql:104](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261020120000_acordo_direto_encargos.sql:104>). PGlite serializa as transações e não demonstra essa hipótese. Requer PostgreSQL local com duas conexões. Se ocorrer, espera-se abortamento integral de uma transação, não perda parcial de dados; o erro e sua recuperação precisam ser testados.
2. **Filho inserido diretamente enquanto o pai é estornado.** O gatilho novo lê o pai sem trava e a cascata só vê filhos visíveis à transação. Referências: [supabase/migrations/20261022120000_antecipacao_documentos_processo.sql:70](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/migrations/20261022120000_antecipacao_documentos_processo.sql:70>) e `:137`. O caminho normal da RPC cria tudo em uma transação e não demonstrou problema. A inserção direta autorizada com estorno simultâneo exige ensaio local em duas sessões antes de qualquer conclusão.

Não foi classificada como bug a regra declarada de antecipar somente parcelas com vencimento posterior à data do pagamento. Também foi mantida como decisão em aberto a regra antiga de que o estorno não volta a cobrar parcela já renegociada/cancelada. Sua revisão exige decisão de negócio, sobretudo para não contar a dívida duas vezes.

## 8. Avisos de infraestrutura e condição para preservar os dados

### Cópia restaurável ainda não foi demonstrada

A consulta somente leitura a backups_execucoes encontrou **zero execuções com situação ok e nenhuma última cópia registrada**. O documento [docs/operacao/backup-restauracao.md:1](<C:/Users/Ithalo/Desktop/Advocacia site/docs/operacao/backup-restauracao.md:1>) informa que a rotina desenhada não está ativa. Isso não prova ausência de cópias manuais fora do sistema: elas não foram inspecionadas. **Antes de corrigir banco ou dados reais, é necessário obter uma cópia verificável e ensaiar a restauração**, incluindo os arquivos do Storage e seus vínculos. O JSON operacional da tela não é um backup completo.

Esse é um risco operacional, separado dos 16 achados. Nenhuma rotina de backup, retenção ou restauração foi instalada por esta auditoria.

### Avisos técnicos consultados

- Segurança: 55 avisos de funções SECURITY DEFINER executáveis por autenticados; o projeto usa RPCs com checagem interna. A mera presença do aviso não demonstra falha de autorização, e não foi contada como 55 bugs. Revogar essas funções sem revisar o desenho quebraria operações legítimas. [Referência do Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Segurança: proteção contra senhas vazadas aparece desligada; tratar como configuração a avaliar, sem alegar senha comprometida. [Referência do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- RLS sem política em contatos_envios: aviso informativo; pode ser bloqueio intencional para a rotina de servidor. Não se deve abrir acesso para “eliminar o aviso”.
- Desempenho: 9 chaves estrangeiras sem índice cobrindo, 44 índices sem uso observado e 24 tabelas sem chave primária no schema de arquivo de testes. São sinais para análise de volume e finalidade, sem lentidão ou perda comprovadas. Não remover índices/tabelas arquivadas automaticamente. [Referência sobre índices de chaves estrangeiras](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Logs: acesso confirmado e fontes agregadas consultadas. Uma tentativa de agrupar severidade não retornou esse campo preenchido. Não foi feita investigação exaustiva de incidentes nem declarado que os logs estejam livres de erros.

## 9. Plano de correção futura que preserva o histórico

Este plano não foi executado. A aprovação de uma correção deve se referir a uma proposta concreta e testada.

1. **Guardar uma cópia restaurável antes de escrever.** Banco, arquivos/versões de anexos e metadados necessários. Conferir hashes e testar restauração isolada; registrar a cópia e o ensaio.
2. **Fotografar o estado de referência.** Quantidades, ids, hashes por linha e totais de contratos, parcelas, recebimentos, ajustes, repasses, despesas, saldos de contas e versões de fechamento. Registrar também vínculos de clientes, notas e documentos afetados. A fotografia deve ser lida e guardada com controle de acesso, sem expor dados pessoais no relatório público.
3. **Separar prevenção de reparo histórico.** Primeiro impedir novas gravações inválidas e perdas de texto. Uma proteção nova não deve reescrever pagamentos antigos, apagar créditos, fundir clientes ou recalcular prazos/fechamentos silenciosamente.
4. **Ensaiar cada mudança em cópia isolada.** Reproduzir o defeito, demonstrar o comportamento corrigido e executar regressões úteis de permissões, mês fechado, acordos, pagamento direto ao cliente, legado, antecipação, recibos e estorno. Não editar migração já aplicada; planejar uma migração nova quando necessária.
5. **Conservar versões e compatibilidade.** RPCs antigas que omitem campos devem manter o sentido de “não alterar”; vazio explícito deve ter semântica clara. Novos controles de versão devem preservar rascunho no conflito. Relações e ids existentes permanecem.
6. **Conferir antes/depois.** Para correção de tela/leitura, hashes financeiros devem continuar idênticos. Para uma alteração de dado aprovada, cada diferença deve ter origem, motivo e auditoria; manter a fotografia anterior e nenhuma diferença inexplicada. Totais mensais/anuais aprovados não devem mudar por recálculo retroativo implícito.
7. **Revisar anomalias antigas individualmente.** Saldos negativos, NaN, diferenças de plano, vínculos errados e textos sobrescritos não devem ser “consertados” com valor zero, nome parecido, mescla automática ou exclusão. Usar evidências e versões anteriores para decidir o ajuste, com registro do responsável.
8. **Publicar apenas o pacote aprovado.** Banco/serviços/frontend na ordem compatível e com plano de retorno que não apague lançamentos feitos depois. A publicação não foi autorizada nem realizada neste trabalho.

## 10. Limites da conclusão e cobertura

O relatório cobre a versão identificada e os cenários descritos; nenhuma auditoria finita prova ausência de todos os bugs. Foram lidos contexto, arquitetura e caminhos relevantes e abertos os módulos principais. Não houve reprodução de negócio em produção, auditoria de senhas/segredos, carga real prolongada, ensaio de duas conexões PostgreSQL simultâneas nem conferência de cada cadastro existente. Google, DJEN, CEP e índices externos foram simulados nos testes. O PDF foi analisado e classificado, sem executar seu JavaScript em leitor de documentos.

O check do site foi executado na cópia isolada com build local/offline; validou 19 páginas de conteúdo fictício/local. Não compara todo o conteúdo atual do CMS real. O scanner de rotas mede carregamento e largura nas combinações listadas, sem prometer cobertura de todas as ações em cada perfil. Os testes de falha e de volume foram executados separadamente e registram suas condições simuladas.

As modificações pessoais prévias em LogosNovas/FL/LEIA-ME.md e os arquivos pessoais não rastreados foram preservados. Os artefatos de teste ficaram em .local/auditoria-20261023 e o único produto final novo é este relatório. Não houve correção aplicada durante a investigação.

## 11. Índice de evidências reproduzíveis

Todos os dados dessas provas são fictícios. Os roteiros adicionais não fazem parte da suíte do produto.

| Evidência | O que contém |
|---|---|
| [.local/auditoria-20261023/principal/testes-js.txt](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/testes-js.txt>) | Saída 205/205. |
| [.local/auditoria-20261023/principal/testes-sql.txt](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/testes-sql.txt>) | Saída 707/707 e migração sobre dados antigos. |
| [.local/auditoria-20261023/principal/infraestrutura.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/infraestrutura.json>) | Conexões, commit, migrações, funções e avisos técnicos, sem segredos. |
| [.local/auditoria-20261023/principal/comparacao-esquema.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/comparacao-esquema.json>) | 10 hashes de funções iguais entre produção e migrações locais. |
| [.local/auditoria-20261023/principal/navegador.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/navegador.json>) | 53 cargas de telas/perfis/tamanhos. |
| [.local/auditoria-20261023/principal/financeiro-ui.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/financeiro-ui.json>) | Antecipação, recibo e estorno pela interface. |
| [.local/auditoria-20261023/principal/casos-adicionais.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/casos-adicionais.json>) | Data/cálculo incompatíveis e limite emulado de 1.000 linhas. |
| [.local/auditoria-20261023/principal/documentos-ui.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/documentos-ui.json>) | Documento preservado, filtro com erro de leitura e homônimos no componente real. |
| [.local/auditoria-20261023/principal/prova-site-real.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/principal/prova-site-real.json>) | Marcador inofensivo executado na saída dos dois renderizadores reais. |
| [.local/auditoria-20261023/financeiro/diagnostico.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/financeiro/diagnostico.mjs>) | Reproduções financeiras em banco novo, sem rede. |
| [.local/auditoria-20261023/financeiro/resultados.json](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/financeiro/resultados.json>) | Sete reproduções e dois controles financeiros. |
| [.local/auditoria-20261023/sistema/repro-auth.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-auth.mjs>) | Sessão restaurada após sair, com rede fictícia. |
| [.local/auditoria-20261023/sistema/repro-banco.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-banco.mjs>) | Cronômetro, edições antigas, Google e controles de documentos. |
| [.local/auditoria-20261023/sistema/repro-regras-anexos.mjs](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/repro-regras-anexos.mjs>) | Homônimos, PDF e tratamento de falha de feriados. |
| [.local/auditoria-20261023/sistema/pdfinfo-estrutura.txt](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/sistema/pdfinfo-estrutura.txt>) | Validação independente do PDF fictício e JavaScript presente. |
| [.local/auditoria-20261023/site-achados.md](<C:/Users/Ithalo/Desktop/Advocacia site/.local/auditoria-20261023/site-achados.md>) | Relatório auxiliar do site e verificações na cópia isolada. |

Os scripts de diagnóstico de banco e regras podem ser repetidos sem rede na raiz do projeto. Os testes de navegador usam a prévia fictícia, cujos dados são descartados ao encerrar o servidor. O PDF de prova permanece na pasta técnica apenas como evidência; não é necessário abri-lo em leitor de documentos para reproduzir a classificação.