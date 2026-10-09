# Revisão do Financeiro, DJEN e novas áreas — 09/10/2026

O código foi revisado e corrigido, e os fluxos principais foram conferidos
localmente, incluindo banco, permissões e interface. A entrega está preparada
para a próxima etapa de publicação e homologação. Ainda há dependências
operacionais que precisam ser resolvidas antes de liberar o uso real de todas
as funções, principalmente backup, e-mail de convite e calendário jurídico.

Não houve commit, push, aplicação de migração, deploy de função nem mudança
em registros de produção. As alterações que já estavam no projeto foram
preservadas. Não foram acrescentados 2FA, OFX, Open Finance ou conciliação.

## Escopo e método

Foram usados os READMEs, os handoffs, especialmente
[HANDOFF-FINANCEIRO-DJEN.md](<C:/Users/Ithalo/Desktop/Advocacia site/HANDOFF-FINANCEIRO-DJEN.md>),
e o registro dos ajustes de Tarefas e Documentos de 08/10. A conferência
combinou leitura do código, testes de domínio e serviços, execução das
migrações e políticas em PostgreSQL isolado e uso da interface no navegador.

A prévia usou dados fictícios, autenticação e armazenamento locais. A consulta
ao histórico remoto de migrações foi somente leitura e confirmou que as doze
migrações de 08/10 ainda não estavam aplicadas. Isso permitiu corrigir esses
arquivos antes da primeira publicação. Os dados reais do escritório não foram
usados nas ações de teste.

O visual foi conferido no Chromium em 1280 × 720 e 390 × 844. Isso verifica
computador e celular nesse navegador; não equivale a homologação em Safari,
Firefox, aparelhos físicos ou serviços externos reais.

## Problemas encontrados e correções

Prioridade alta significa risco de acesso indevido, informação financeira
incorreta ou perda de uma parte da captura. Prioridade média cobre falhas de
operação, importação, navegação e recuperação; baixa cobre apresentação.

| Prioridade | Problema | Correção realizada |
|---|---|---|
| Alta | O acesso a Clientes podia permitir ler ou gerar recibo financeiro sem acesso ao Financeiro. | Políticas dos documentos distinguem recibos dos outros modelos e exigem a capacidade financeira adequada. Testes comprovam a negativa pelo banco. |
| Alta | Financeiro Consulta não conseguia abrir os fechamentos, embora essa capacidade estivesse prevista. | Permissão de leitura mensal/anual e de suas versões foi alinhada no banco e na navegação. Fechar e reabrir continuam restritos ao administrador. |
| Alta | Uma consulta DJEN podia descartar páginas recebidas quando a seguinte falhava ou alcançar o limite de páginas e aparentar estar completa. | Transporte separado, preservação do resultado parcial, reconhecimento de limite, timeout e respostas inválidas. Capturas parciais não avançam o marco de sucesso. |
| Alta | A retomada DJEN podia pular um intervalo antigo ou deixar de rever o último dia, perdendo publicações tardias. | Retomada inclusiva, deduplicada e em blocos antigos de até 31 dias. O limite da API encerra o lote sem esconder as OABs não consultadas. |
| Alta | Falha ao carregar feriados era tratada como calendário vazio na importação DJEN. | A captura exige o calendário carregado; a falha interrompe a operação, sem assumir silenciosamente que não havia feriados. |
| Alta | A numeração de contratos com três dígitos truncava números maiores que 999 e podia provocar colisão repetida. | Largura mínima de três dígitos, sem truncar números maiores; teste cobre o avanço acima de 999. |
| Alta | As séries do painel podiam incluir o mês inteiro em um período livre e ignorar o responsável nos recebimentos. | Datas exatas e responsável são aplicados também nas séries, mantendo a base dos totais. |
| Alta | O saldo do recibo podia ser alterado por pagamentos, descontos ou estornos feitos depois do recebimento original. | Saldo reconstruído no instante de criação do recebimento, considerando a existência e vigência histórica dos pagamentos e ajustes. Recibos já salvos preservam sua cópia. Recebimento estornado não gera novo recibo. |
| Alta | A cobrança podia voltar ao telefone antigo do cliente mesmo quando os contatos não estavam autorizados a recebê-la. | Somente contatos ativos, com WhatsApp e autorização de cobrança são utilizados. Erro na leitura dos contatos não vira autorização implícita. |
| Média | Indicadores abriam detalhes sem todos os filtros ou com situação diferente da que compunha o total. | Conta, categoria e responsável são preservados onde se aplicam; atraso abre vencidas; atenção considera atraso, divergência do plano e fim de vigência. Busca e atenção podem ser combinadas. |
| Média | Relatório de despesas futuras excluía recorrentes ainda não geradas e podia divergir do painel. | Inclui a previsão, identifica as linhas como “a gerar”, preserva categoria, fornecedor e centro de custo e deixa valor desconhecido em branco. |
| Média | Relatório podia imprimir informação anterior durante falha ou atualização, e aceitava intervalo invertido. | Resultado anterior é invalidado durante o carregamento; impressão exige relatório válido; datas invertidas mostram erro. Filtros também constam na exportação. |
| Média | Consulta podia chegar ao formulário de novo contrato e a ações de gravação em recibos. | Rota de criação exige lançamento; recibo permite leitura e download sem inserir outro documento; ações de cancelamento ficam ocultas para Consulta. |
| Média | XLSX com calendário 1904 ou data fracionária podia gerar data errada; fórmulas sem resultado armazenado podiam produzir importação incompleta. | Calendário 1904 e parte inteira da data são respeitados; fórmula sem resultado impede a carga e pede recalcular/salvar a planilha. |
| Média | ZIP corrompido, duplicado ou com tamanho expandido falso e planilha com coordenadas enormes podiam consumir recursos ou ser lidos incorretamente. | Verificação de cabeçalhos, tamanho real, CRC, duplicações e limites de descompressão; limites de 20 mil linhas de dados e 256 colunas antes de alocar a planilha. |
| Média | Anexo abria uma janela apenas depois da chamada assíncrona, sujeita a bloqueio; reservas antigas podiam sumir pelo limite global da consulta. | Janela nasce no clique e recebe o endereço assinado depois; reservas são lidas por anexo; histórico permite abrir versões verificadas e repetir verificação pendente. |
| Média | PDFs podiam disfarçar nomes de ações com escapes ou usar referência indireta a JavaScript. | A inspeção decodifica os nomes e recusa essas ações. Continua sendo uma verificação inicial, sem prometer antivírus ou sanitização completa de PDF. |
| Média | Indisponibilidade de serviço podia produzir exceção sem resposta controlada; convite enviado com falha de histórico podia aparecer como sucesso completo. | Funções devolvem erro controlado; reserva permanece recuperável; convite com resultado incerto informa que o destinatário deve ser conferido antes de reenviar. |
| Média | Lista de etiquetas enviada como JSON `null` podia falhar no cadastro do cliente. | O banco normaliza o valor para lista vazia. |
| Média | Escolher outro cliente no editor não atualizava a folha automaticamente e podia impedir salvar. | A saída do campo de cliente passa pelo fluxo de atualização e confirmação das edições; cadastro selecionado e texto ficam coerentes. |
| Baixa | Data e hora da última captura DJEN ultrapassavam o cartão no celular. | Indicadores podem quebrar o texto; a página voltou a caber na largura disponível. |
| Baixa | Campos de data dos relatórios cortavam o ano; orientação de Prazos dizia que a contagem automática ainda estava pendente. | Campos mais largos e orientação compatível com a sugestão já implementada; texto da pendência anual também ajustado. |

Também foi corrigida uma verificação SQL de caminho de anexo que poderia
falhar por acaso com certos UUIDs. O teste agora verifica a estrutura exata
do caminho. Isso não altera a regra de armazenamento.

## Conferência funcional e visual

| Área | O que foi conferido | Resultado |
|---|---|---|
| Painel financeiro | Cartões, gráfico, filtros, links para detalhes e largura em celular | Totais e filtros coerentes nos cenários executados; sem transbordamento da página. |
| Contratos e novo contrato | Listagem, atenção com busca, formulário, detalhe, parcelas, ações e recibo | Busca combinada retorna o contrato esperado; formulários e detalhes utilizáveis. Regras financeiras também cobertas em SQL. |
| Recebíveis e Em atraso | Filtros, lista, cartões, encargos e aviso de indisponibilidade de índice | Telas utilizáveis; ausência de índice informada, sem apresentar correção monetária como calculada. |
| Contas do escritório | Mês, recorrentes, fornecedores, reembolsos e formulários | As quatro áreas abrem e mostram os dados esperados. Pagamento parcial e estorno exercitados no navegador. |
| Contas financeiras | Saldos, movimentos e controles conforme capacidade | Tela e permissões conferidas; regras de transferência e estorno cobertas nos testes SQL. |
| Fechamento | Mensal, anual, pendências e acesso Consulta | Consulta lê os dois formatos e não recebe ações de fechamento. Bloqueios, versões e snapshots cobertos em SQL. |
| Relatórios | Filtros, totais, previsão futura, impressão e exportação no código | Responsável é preservado ao abrir detalhe do painel; previsão futura conferida visualmente com fornecedor. |
| Importação | Seleção de arquivo, prévia, conferência e confirmação | Uma planilha XLSX fictícia foi carregada pela interface e a despesa apareceu no mês correspondente. Casos corrompidos e limites têm testes de domínio. |
| Alertas e configurações | Lista, filtros, indicadores e controles | Telas conferidas em computador e celular. |
| Anexos | Upload, verificação, nova versão e histórico | PDF fictício enviado, duas versões verificadas e versão anterior aberta por endereço assinado. |
| DJEN e feriados | Busca, registro, revisão, sugestão de prazo e apresentação no celular | Publicações fictícias capturadas e prazo gerado. Limites e falhas exercitados por testes; calendário e memória visíveis. |
| Clientes | Cadastro, dados complementares, CEP e contatos de cobrança | CEP fictício preencheu endereço; contato adicional foi cadastrado. Valor JSON nulo tratado no banco. |
| Membros | Capacidades e apresentação da lista | Interface conferida; convites testados no serviço com respostas simuladas. E-mail real depende do SMTP. |
| Operação e LGPD | Estado do backup e registro de solicitação | Solicitação fictícia salva e listada. Tela informa ausência de backup bom quando não há execução. |
| Tarefas e Prazos | Cores, cartões móveis, edição e geração a partir da intimação | Iniciar → Editar → Pendente executado com sucesso; orientação da contagem atualizada. |
| Documentos | Editor, fonte, tamanho, cor, desfazer/refazer, gravação e recibo Consulta | Documento fictício salvo com classes de Arial, 16 e azul. Consulta baixou recibo em Word sem gravar novo documento. |

Exemplo financeiro exercitado: despesa fictícia de **R$ 120**, pagamento de
**R$ 50**, saldo de **R$ 70**. Após o estorno justificado, saldo de **R$ 120**.
A despesa e o valor original foram preservados. O teste aconteceu somente no
banco da prévia.

As tabelas extensas mantêm rolagem horizontal dentro de seu próprio bloco,
sem ampliar a página inteira. A folha A4 do editor mantém a apresentação de
documento e a barra de ferramentas se adapta à largura; no celular, a leitura
e edição de uma folha inteira continuam mais confortáveis em um computador.

Evidências locais com dados fictícios:

- [Painel no computador](<C:/Users/Ithalo/Desktop/Advocacia site/.local/revisao-financeiro-djen/painel-desktop.jpg>).
- [DJEN no celular após a correção](<C:/Users/Ithalo/Desktop/Advocacia site/.local/revisao-financeiro-djen/djen-mobile.jpg>).
- [Documento formatado e gravado](<C:/Users/Ithalo/Desktop/Advocacia site/.local/revisao-financeiro-djen/editor-gravado.jpg>).

Essas imagens e os arquivos fictícios ficam em `.local/`, fora do Git.

## Verificação automatizada

| Verificação | Resultado |
|---|---|
| JavaScript: domínio, importação, editor e serviços | **150/150**, nenhuma falha |
| PostgreSQL: permissões, financeiro, clientes, documentos, prazos e avisos | **440/440**, nenhuma falha |
| Migração sobre registros no formato anterior | **12/12**, incluídos nos 440 |
| Suite específica Financeiro/DOCX | **95/95**, incluídos nos 440 |
| Site público: links, âncoras, metadados e SEO | **17 páginas**, aprovado |
| Sintaxe dos módulos, scripts e funções JavaScript | **115 arquivos**, nenhuma falha |

Os novos testes cobrem especialmente falhas/limites da captura DJEN,
importação malformada, PDFs disfarçados, serviços indisponíveis, resultado
incerto do convite, saldo histórico de recibo, Consulta, restrição financeira
de recibos, período exato das séries e numeração acima de 999.

Esses resultados não significam que todos os navegadores, arquivos reais ou
combinações possíveis foram esgotados. Os cenários reais abaixo são a próxima
conferência necessária.

## Preparação para produção, em ordem

1. **Backup e restauração.** Providenciar destino e secrets da rotina descrita
   em [backup-restauracao.md](<C:/Users/Ithalo/Desktop/Advocacia site/docs/operacao/backup-restauracao.md>).
   Fazer cópia antes da migração, verificar o arquivo e ensaiar restauração.
   A rotina diária ainda não está ativa. Confirmar com o escritório RPO, RTO
   e retenção; registrar uma execução boa em Operação.
2. **Validar regras com Vinícius.** Aprovar imputação de pagamento parcial,
   texto dos recibos, taxa de recebimento, numeração, formalização de legados,
   fechamento anual e regras de contagem. Esta revisão não muda uma regra
   jurídica por interpretação própria. Cadastrar feriados do estado,
   município e tribunal antes de usar as sugestões em processos reais.
3. **Aplicar o banco.** Reconsultar o histórico remoto; aplicar em ordem as
   doze migrações de 08/10, usando os arquivos corrigidos. Não executar
   novamente uma migração já aplicada nem reescrever seu histórico. Conferir
   invariantes e dados legados conforme o handoff. Preservar os registros
   reais de teste do Ithalo, Rodrigo e da conta Luz.
4. **Publicar as duas funções de borda.** Publicar `finalizar-anexo` e
   `administrar-usuarios`, conferir configuração e token da pessoa que chama.
   Configurar SMTP, domínio e redirecionamentos antes do convite real.
   Nunca levar chave de serviço para o navegador.
5. **Publicar a prévia do frontend.** Fazer revisão do diff e commit incluindo
   novas funções, correções, testes e documentos. A prévia Vercel usa o mesmo
   banco real, portanto exige banco e funções prontos. Depois da homologação,
   fazer merge na `main`, que publica automaticamente o site e o sistema.
6. **Homologar integrações reais.** Administrador, Consulta e perfil sem
   Financeiro; contratos e pagamentos legados; fechamento; envio/versão de
   anexo; convite recebido; DJEN a partir do Brasil; CEP; índice do Banco
   Central e planilha oficial do escritório. Importação real passa primeiro
   por conferência, sem confirmação automática. Não usar clientes reais para
   experimentar cobranças.
7. **Acompanhar a primeira operação.** Conferir registro de erros, resultado
   do backup, reservas de anexos e capturas DJEN parciais. Uma captura parcial
   exige retomada, sem assumir que não existem intimações.

O frontend antigo não é totalmente compatível com a nova gravação de
pagamentos de despesas. Evitar um período prolongado com banco novo e
frontend antigo. Em falha, promover temporariamente um deploy anterior pode
recuperar parte da interface, mas não substitui corrigir a integração. Banco
deve ser recuperado por restauração validada ou migração corretiva, conforme
o handoff, sem apagar lançamentos.

## Referências para manutenção

- [Captura DJEN](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/dominio/consulta-djen.js>) e [regras DJEN](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/dominio/djen.js>).
- [Recibo histórico](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/documentos/recibo.js>) e [ações financeiras compartilhadas](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/base.js>).
- [Relatórios](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/financeiro/relatorios.js>), [anexos](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/anexos.js>) e [editor de novos documentos](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/telas/documentos/novo.js>).
- [Leitor XLSX](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/xlsx.js>), [leitor ZIP](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/js/nucleo/zip.js>) e [testes de revisão](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/testes/revisao-arquivos.test.mjs>).
- [Testes SQL Financeiro/DOCX](<C:/Users/Ithalo/Desktop/Advocacia site/supabase/testes/financeiro-docx.sql>) e [README do sistema](<C:/Users/Ithalo/Desktop/Advocacia site/sistema/README.md>).

Uma IA que continuar o trabalho deve ler este relatório e o handoff antes de
alterar código. Deve preservar as regras aprovadas e os dados existentes,
usar ambiente isolado para testar e confirmar novamente o estado remoto de
migrações antes de decidir se pode editar um arquivo pendente ou precisa
criar uma migração corretiva nova.
