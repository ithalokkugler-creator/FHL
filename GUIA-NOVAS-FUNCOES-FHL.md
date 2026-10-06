# Guia das novas funções — Sistema FHL Advocacia

**Entrega desta sessão · 05/10/2026**

Este guia explica o que foi acrescentado nesta sessão, onde encontrar cada recurso e como experimentá-lo. Abrange E0, F1, F2, F3, F4, as partes manuais de F5/F6, F7 e os recursos manuais de F8.

As funções estão disponíveis na prévia local com dados fictícios. **Ainda não houve commit, publicação na Vercel ou aplicação das novas migrações no Supabase de produção.** Algumas partes da preparação continuam pendentes e estão identificadas abaixo.

**Revisão de 05/10 (noite):** bugs e problemas visuais encontrados na entrega foram corrigidos e o código foi reorganizado, sem mudar regras nem o texto jurídico dos modelos. O que mudou está em [REVISAO-NOVAS-FUNCOES.md](<C:/Users/Ithalo/Desktop/Advocacia site/REVISAO-NOVAS-FUNCOES.md>).

## 1. Como abrir o sistema para testar

Se a prévia já estiver rodando, abra o [painel de teste](http://127.0.0.1:8125/__teste).

Para iniciar novamente, abra o PowerShell e execute:

```powershell
cd "C:\Users\Ithalo\Desktop\Advocacia site"
npm run testar:local
```

Mantenha o terminal aberto. É necessário Node.js 20 ou superior; a prévia não exige instalar dependências, Docker ou Supabase CLI.

O painel permite escolher perfis fictícios de administrador, sócia, secretária, associado sem Clientes e equipe só de Clientes. Não é necessário informar senha. Os botões e menus mudam conforme os acessos do perfil.

- Use **Administrador** para conhecer todos os recursos.
- Use os outros perfis para conferir as restrições de acesso.
- **Restaurar dados fictícios** retorna aos exemplos iniciais.
- Os dados de teste ficam na memória e desaparecem ao restaurar ou reiniciar o servidor.
- `Ctrl+C` encerra a prévia. Alterações no código exigem reiniciar; não há recarga automática nesse modo.

Se a porta 8125 estiver ocupada por uma prévia já aberta, use-a. Para executar em outra porta:

```powershell
$env:PORT_TESTE = "8126"
npm run testar:local
```

Nesse caso, troque 8125 por 8126 nos links deste guia. Para voltar à porta padrão em um terminal novo, basta usar o comando normal.

**Para testar esta entrega, use `testar:local`.** O comando `npm run dev` mantém a conexão com o Supabase configurado no projeto. Os exemplos deste guia são fictícios; não use dados reais de clientes na prévia.

## 2. Onde fica cada módulo

Os módulos aparecem no menu lateral do sistema; no celular, use **Menu**.

| Etapa | Recurso | Onde acessar |
|---|---|---|
| E0 | Novos acessos de Clientes e Prazos | [Membros](http://127.0.0.1:8125/sistema/?perfil=admin#/membros) |
| F1 | Contatos e interessados | [Contatos](http://127.0.0.1:8125/sistema/?perfil=admin#/contatos) |
| F2 | Cadastro completo e ficha | [Clientes](http://127.0.0.1:8125/sistema/?perfil=admin#/clientes) |
| F2 | Processos e casos consultivos | [Processos](http://127.0.0.1:8125/sistema/?perfil=admin#/processos) |
| F3 | Geração e consulta de documentos | [Documentos](http://127.0.0.1:8125/sistema/?perfil=admin#/documentos) |
| F4 | Atividades, cronômetro e relatórios | [Atualizações](http://127.0.0.1:8125/sistema/?perfil=admin#/atualizacoes) |
| F5 parcial | Tarefas e delegação | [Tarefas](http://127.0.0.1:8125/sistema/?perfil=admin#/tarefas) |
| F5 parcial | Prazos informados manualmente | [Prazos](http://127.0.0.1:8125/sistema/?perfil=admin#/prazos) |
| F5 parcial | Cadastro de feriados/suspensões | [Feriados](http://127.0.0.1:8125/sistema/?perfil=admin#/feriados) |
| F6 parcial | Registro e conferência de intimações | [Intimações](http://127.0.0.1:8125/sistema/?perfil=admin#/intimacoes) |
| F7 | Avisos, aniversários e lembretes | [Hoje](http://127.0.0.1:8125/sistema/?perfil=admin#/inicio) |
| F8 parcial | Google, arquivo `.ics`, lembretes e feriados | [Agenda](http://127.0.0.1:8125/sistema/?perfil=admin#/agenda) |

## 3. E0 — Acessos e base compartilhada

**Onde:** Membros → cadastro ou edição do membro.

Foram acrescentados controles de acesso aos módulos **Clientes** e **Prazos**. Eles determinam quais telas e dados cada pessoa pode utilizar. Administrar os membros é uma função do administrador.

O acesso a Clientes controla o cadastro completo, processos, contatos, documentos e atualizações. O cadastro mínimo utilizado por Agenda e Financeiro continua disponível conforme suas permissões anteriores. Um membro sem Prazos ainda pode trabalhar nas tarefas que recebeu, mas não pode modificar os campos protegidos do prazo processual.

Também foram reunidos os dados institucionais do escritório e as áreas de atuação para que documentos, mensagens e cadastros usem as mesmas informações.

**Como experimentar:** abra Membros como administrador, confira os novos campos e depois troque os perfis pelo painel de teste. O perfil **Equipe só de Clientes** permite conferir uma ficha sem acesso à Agenda/Financeiro.

## 4. F1 — Contatos: do interessado ao cliente

**Onde:** menu Contatos. A entrada pública está no [formulário do site](http://127.0.0.1:8125/contato.html) e no [formulário de campanha](http://127.0.0.1:8125/campanhas/acidente-de-trabalho.html).

### Entrada pelo site e cadastro manual

Os formulários alimentam a lista de interessados, preservando a mensagem, origem/campanha e registro de consentimento. A equipe também pode cadastrar contatos recebidos por outros canais. Os envios públicos têm validação e limites contra abuso.

**Como usar:** envie um exemplo fictício pelo formulário e volte a Contatos, ou use o botão de novo contato na própria tela.

### Triagem, filtros e responsável

A lista permite buscar sem depender de acentos e filtrar situação, canal, campanha e período. Abra um contato para definir responsável, mudar a situação e acrescentar observações internas. A mensagem original permanece protegida.

### Resposta preparada

**Responder** permite editar a mensagem, copiar, abrir WhatsApp ou abrir e-mail. **Registrar que respondi** registra a ação no sistema; abrir o aplicativo não envia a mensagem automaticamente.

### Conversão em cliente

Em **Virou cliente**, escolha um cliente já cadastrado ou use **Cadastrar com os dados do contato**. Depois confirme **Vincular cliente**. O contato convertido aponta para a ficha e a ficha identifica a origem do contato.

### Arquivamento e histórico

Arquivar retira o contato do fluxo ativo sem apagar sua mensagem. Consulte-o pelo filtro correspondente e abra Histórico para conferir as alterações.

## 5. F2 — Clientes e processos

### Cadastro completo de pessoa física e jurídica

**Onde:** Clientes → Novo cliente; para alterar, abra a ficha e use a edição.

O cadastro passou a reunir identificação, contatos, endereço, dados complementares, representante quando necessário, dados bancários, responsável e recados. Há validação de CPF/CNPJ e dos demais campos aplicáveis. O CEP é informado manualmente.

### Busca e filtros

**Onde:** lista de Clientes.

É possível buscar nome sem acentos, documento com ou sem máscara e número de processo. Os filtros ajudam a encontrar clientes por responsável, área, situação, representante e cadastro ativo/inativo.

### Ficha integrada

**Onde:** clique em um cliente. Para começar, abra a [ficha de José Fictício da Silva](http://127.0.0.1:8125/sistema/?perfil=admin#/clientes/00000000-0000-4000-8000-000000000202).

A ficha reúne cadastro, processos, compromissos, contratos, tarefas/prazos, atualizações, aniversário e histórico. Oferece atalhos para gerar documento, iniciar cronômetro e criar tarefa. Agenda e Financeiro aparecem somente quando o perfil tem acesso. O particular de outra pessoa mantém sua proteção.

### Processos e casos sem número

**Onde:** menu Processos ou Novo processo na ficha do cliente.

O cadastro aceita número CNJ com validação, máscara e identificação do tribunal. Casos consultivos podem ser registrados sem número, com título e referência. A lista permite buscar e filtrar, editar a situação e consultar processos encerrados. Repetir o mesmo número para o mesmo cliente é impedido; o processo pode envolver clientes distintos.

### Histórico, desativação e reativação

**Onde:** ficha do cliente.

Alterações ficam registradas. Desativar preserva cadastro, processos e histórico; o cliente pode ser localizado no filtro de inativos e reativado.

## 6. F3 — Documentos

**Onde:** menu Documentos ou Gerar documento na ficha do cliente. Também há atalhos no contrato e no compromisso da Agenda.

### Oito modelos adicionados

1. Procuração.
2. Contrato de honorários.
3. Declaração de hipossuficiência.
4. Declaração de endereço.
5. Declaração de comparecimento.
6. Ficha de atendimento.
7. Renúncia.
8. Prestação de contas.

### Preenchimento e edição

Escolha o modelo e o cliente, preencha os complementos e edite a folha. Campos faltantes aparecem destacados entre colchetes. **Completar o cadastro** abre o cadastro do cliente. Ao mudar o modelo ou complemento depois de editar a folha, o sistema pergunta se deve refazer o texto.

### Salvar, imprimir/PDF e Word

- **Salvar sem imprimir:** guarda o texto final e abre a cópia somente para leitura.
- **Imprimir:** usa a impressão do navegador; escolha Salvar como PDF para gerar um PDF.
- **Baixar para o Word:** gera um `.doc` em HTML, que precisa ser conferido no Word. Não é um `.docx` nativo.

Os documentos têm apresentação A4 e identificação do escritório. Se o navegador acrescentar URL/data no papel, desative os cabeçalhos e rodapés da impressão.

### Registro final e cancelamento

O texto salvo fica preservado com autor e data. Para corrigir, gere uma nova versão. Cancelar exige motivo e mantém a cópia e seu histórico; novas impressões/exportações também registram a geração.

### Atalhos de outras telas

- No contrato: **Gerar contrato** e **Prestação de contas** aproveitam os valores daquele contrato.
- Na Agenda: **Declaração de comparecimento** recebe cliente, data e advogado do compromisso.
- Ao parar um atendimento cronometrado: **Gerar ficha de atendimento ao salvar** aproveita o relato registrado.

**Pendente:** revisão do escritório sobre os textos jurídicos e decisões do §7.8 da preparação, comparação com os DOCX originais e dados institucionais ainda marcados para confirmação. A implementação não equivale à aprovação desses textos.

## 7. F4 — Atualizações, cronômetro e relatório de atividades

**Onde:** menu Atualizações e atalhos na ficha do cliente, em Hoje e na Agenda.

### Cronômetro

Use **Iniciar cronômetro**, escolha cliente, processo/caso e tipo de atividade. O indicador permanece na lateral enquanto você navega; no celular, fica no topo. Uma segunda aba do mesmo perfil pode retomar o acompanhamento. Cada membro pode manter um cronômetro ativo por vez.

**Parar** abre relato, próxima providência e opções adicionais. Se esqueceu de parar, use **Esqueci de parar: informar a hora real do fim**. Corrigir a hora transforma a atividade em lançamento manual e deixa registro da alteração.

### Lançamento à mão e anotação sem tempo

**Lançar atualização** permite informar datas, horários, participantes, tipo e relato. **Sem tempo, só anotação** registra uma anotação com duração zero. É possível atualizar a situação do processo junto com o lançamento.

### Linha do tempo, edição e cancelamento

A lista pode ser filtrada por cliente, processo, participante, tipo, período e situação. O autor edita suas próprias atividades; o administrador também pode editar/cancelar as de outros membros. Alterar somente o relato mantém a marca do cronômetro. Cancelar exige motivo, preserva o relato e retira o tempo dos totais.

Quando há participantes, cada pessoa recebe o tempo integral da atividade; o total do cliente conta a atividade uma vez. Cronômetros ainda rodando ficam fora do tempo total — como no relatório — e aparecem à parte.

### Iniciar atendimento

**Onde:** atendimento do dia em Hoje ou detalhe do compromisso na Agenda.

**Iniciar atendimento** abre o cronômetro ligado ao compromisso e registra a chegada. Ao parar, o atendimento fica realizado. A ficha de atendimento pode ser gerada com o relato salvo.

### Relatório para o cliente

**Onde:** Relatório de atividades em Atualizações ou Relatório para o cliente na ficha.

Escolha período e processo para gerar uma folha A4 com atividades e tempo. Relatos internos começam ocultos e podem ser incluídos explicitamente. Atividades canceladas e cronômetros ainda abertos ficam fora. Salvar, imprimir ou baixar registra uma versão em Documentos.

## 8. F5 parcial — Tarefas, prazos manuais e feriados

### Tarefas e delegação

**Onde:** menu Tarefas ou Nova tarefa / prazo na ficha do cliente.

Crie a tarefa, informe descrição, prioridade, responsável, cliente/processo e datas aplicáveis. Alterne **Minhas**, **Que eu deleguei** e **Todas**, combinando os filtros. O responsável pode marcar Em andamento e Concluída; reabrir/cancelar exige motivo, com histórico.

### Bloqueio da agenda junto com a tarefa

No formulário, marque **Bloquear a agenda do responsável?** e informe o período. A tarefa e o compromisso são criados juntos. Essa opção exige acesso à Agenda. Cancelar a tarefa não cancela o compromisso: ajuste-o na Agenda.

### Prazo processual manual

**Onde:** Tarefas → novo registro → Prazo processual, com acesso a Prazos.

Informe os dados de publicação/intimação, contagem, quantidade, data fatal e entrega já conferidos. Marque a conferência antes de salvar. **Os valores são informados manualmente; não há cálculo ou sugestão automática.** Quem recebe o prazo sem acesso a Prazos pode trabalhar na tarefa, mas não alterar os campos protegidos da data fatal/contagem.

### Resumo e impressão de prazos

**Onde:** menu Prazos.

Consulte Hoje, Semana, Mês, Ano ou Todos abertos; filtre responsável e situação. Imprima ou salve em PDF. A folha identifica os filtros e inclui as descrições.

### Cadastro de feriados e suspensões

**Onde:** menu Feriados, com acesso a Prazos.

Informe data, nome, tipo e tribunal; deixe tribunal vazio para um registro geral. É possível editar, desativar e consultar histórico. A mesma data/tribunal não pode ser cadastrada duas vezes. Registros gerais ativos também aparecem na Agenda de F8.

**Pendente em F5:** contagem jurídica automática, feriados calculados/datas móveis, memória de contagem dia a dia e entrega automática com antecedência. A geração dos módulos automáticos foi bloqueada pelo filtro de conteúdo na etapa anterior, sem motivo detalhado; essa ação não foi repetida.

## 9. F6 parcial — Intimações manuais

**Onde:** menu Intimações, com acesso a Prazos.

### Cadastro e conferência

Use **Cadastrar intimação** para informar recebimento, publicação já conferida, teor, advogado e origem. Vincule cliente/processo quando disponíveis. O teor salvo fica protegido.

Em **Conferir / vincular**, leia a comunicação, confira datas e número do processo, ajuste vínculos/observações ou escolha **Só conferir**. A conferência depende de uma ação humana.

### Gerar prazo

No detalhe, **Gerar prazo** abre o formulário de F5 usando a publicação informada. Complete manualmente os campos e confirme. Salvar registra prazo e conferência juntos, com vínculo à intimação. Cancelar o formulário não a marca como conferida.

### Lançar audiência

Com acesso à Agenda, use **Lançar audiência**, confira cliente/processo e informe data, horários e responsável. A audiência e a conferência são gravadas juntas, evitando outra audiência para a mesma comunicação.

### Arquivar e consultar histórico

**Arquivar** exige motivo. O filtro Arquivadas permite consultar o teor e o histórico preservados.

**Pendente em F6:** busca/importação do DJEN por OAB, normalização e deduplicação, associação automática ao processo, publicação calculada e captura diária. A leitura automática do DJEN também ficou pendente após o bloqueio registrado na etapa anterior. Não há consulta automática ao CNJ nesta entrega.

## 10. F7 — Avisos do dia

**Onde:** menu Hoje, que abre o painel inicial do sistema.

### Tarefas e prazos que pedem atenção

**Para hoje** reúne suas tarefas abertas atrasadas, de hoje e próximas, até sete dias adiante. Um prazo fatal aparece em destaque. Cada tarefa entra uma vez no agrupamento.

### Aniversários

Mostra os aniversariantes do dia e próximos dias. **Preparar mensagem** abre texto editável, com opções para copiar e abrir WhatsApp. Pessoas jurídicas e clientes inativos não entram na lista. Em anos sem 29/02, o aniversário dessa data é lembrado em 28/02.

### Lembretes de amanhã

Mostra atendimentos de amanhã que podem receber lembrete, com cliente e telefone. A mensagem informa dia, hora, advogado e endereço ou link online. Particulares não geram lembretes.

### Contatos e intimações

O painel exibe os três contatos mais recentes do site e o total desse canal. O contador do menu de Contatos considera novos contatos de todos os canais. Intimações a conferir utiliza os cadastros manuais de F6.

### Publicação antiga e contadores

O aviso de publicação aparece quando não há artigo publicado ou a última publicação passou de 21 dias. Ele usa a data do artigo, não a data do deploy. Os contadores mudam ao registrar ações e respeitam as permissões; valores zero ficam ocultos.

Mensagens são preparadas para a equipe revisar e enviar no aplicativo. O sistema não faz envio automático. O painel opcional de processos sem atualização há 60 dias não foi incluído.

## 11. F8 parcial — Novos recursos da Agenda

**Onde:** menu Agenda. A grade semanal já existia; esta sessão acrescentou os recursos abaixo.

### Pôr no Google Agenda

Abra um compromisso e clique em **Pôr no Google Agenda**. O botão abre o formulário do Google com título, datas, horários, descrição e local/link preenchidos. Confira e salve manualmente na conta/agenda desejada.

Blocos de dias inteiros usam datas sem hora, com fim exclusivo. O botão de um compromisso particular aparece somente para o dono. Observações internas não são incluídas.

### Exportar semana ou mês em `.ics`

Na parte superior da Agenda, use **Exportar .ics**. Escolha semana ou mês; para mês, selecione o mês desejado. Escolha todos os advogados, um responsável ou os marcados na grade. A seleção inicial acompanha os filtros da grade.

O arquivo preserva horários, acentos e o período original dos blocos de vários dias. Particulares de outras pessoas saem como **Ocupado**, sem detalhes; cancelados e observações internas não entram. O lembrete configurado no compromisso é incluído como alarme no arquivo.

Para importar no Google Agenda pelo computador: **Configurações → Importar e exportar → escolher arquivo `.ics` → escolher agenda de destino → Importar**. Confira os eventos após a importação. [Instruções oficiais do Google](https://support.google.com/calendar/answer/37118?hl=pt-BR).

### Preparar lembrete no detalhe

No detalhe de um atendimento agendado com cliente e telefone, clique em **Preparar lembrete**. Edite, copie ou abra WhatsApp. O texto informa cliente, dia, hora de Brasília, advogado e endereço presencial ou link online. Sem link online, pede confirmação pela equipe.

### Feriados cadastrados na grade

Registros ativos de Feriados com tribunal vazio aparecem no cabeçalho do dia, com a coluna suavemente destacada, e na lista do celular. O destaque não impede agendamentos. Registros específicos de tribunal e inativos não aparecem na grade geral. Feriados cadastrados no fim de semana também podem expandir a grade.

### Limites da cópia para o Google

Salvar pelo botão ou importar `.ics` cria uma cópia. Alterações e cancelamentos posteriores também precisam ser ajustados no Google. Não há sincronização automática nos dois sentidos.

Para ocupar horários do link de agendamento, confira se a agenda de destino participa da verificação de disponibilidade desse link. A importação/formulário na sua conta Google ainda precisa de conferência manual; os testes locais validaram a URL e os arquivos, sem salvar eventos no Google.

**Pendente em F8:** geração automática dos feriados nacionais, após o bloqueio anterior. Os feriados já cadastrados estão funcionando. Iniciar atendimento e Declaração de comparecimento continuam disponíveis no detalhe, vindos de F4/F3.

## 12. Sugestão de teste completo

1. Pelo formulário público, envie um contato fictício.
2. Em Contatos, prepare uma resposta e converta o interessado em cliente.
3. Abra a ficha, complete o cadastro e crie um processo ou caso sem número.
4. Gere um documento, edite e salve a versão final.
5. Crie uma tarefa para outro membro e confira o acesso dele pelo painel.
6. Cadastre uma intimação fictícia e confira sua vinculação a um prazo manual ou audiência.
7. Na Agenda, abra um atendimento, prepare o lembrete e confira o botão Google.
8. Inicie e pare o atendimento, registrando o relato e gerando a ficha.
9. Abra o relatório de atividades e confira os tempos, com relatos internos inicialmente ocultos.
10. Em Hoje, confira avisos, aniversários e contadores.
11. Exporte a semana e um mês em `.ics` e faça sua conferência manual no Google, se desejar.

## 13. O que foi validado e o que ainda falta

| Verificação registrada nesta sessão | Resultado |
|---|---|
| Testes JavaScript | 104 aprovados |
| Verificações SQL em banco local isolado | 329 aprovadas |
| Fluxos de navegador registrados | 93 aprovados, incluindo 18 de F8 (repetidos depois da revisão) |
| Páginas públicas verificadas | 17 aprovadas, usando conteúdo local em cache |
| Arquivos `.ics` em leitor independente | 9 aprovados |

As verificações SQL foram feitas em ambiente isolado; os testes de navegador usam API e perfis fictícios. Não substituem a validação no ambiente real depois da aplicação das migrações e publicação. O servidor da prévia não acessa os dados reais do Supabase nem dispara publicação na Vercel.

Além das partes automáticas identificadas em F5/F6/F8, ainda faltam sua conferência local, revisão dos documentos/dados institucionais e validação da importação na conta Google. F9 é opcional e não foi implementada nesta sessão.

A aplicação das oito novas migrações, publicação da função de entrada de contatos e publicação do frontend continuam aguardando sua aprovação. **Um push na `main` já publica o site na Vercel**: aplique as migrações e publique a função antes do push — senão a área dos advogados deixa de abrir. O sistema continua usando Supabase para banco/autenticação e Vercel para hospedar o site e a área interna; a entrega desta sessão ainda não foi colocada no ar.

## 14. Arquivos do projeto para consulta

- [Roteiro detalhado de testes](<C:/Users/Ithalo/Desktop/Advocacia site/TESTAR-NOVAS-FUNCOES.md>).
- [Revisão: bugs corrigidos e pontos de atenção](<C:/Users/Ithalo/Desktop/Advocacia site/REVISAO-NOVAS-FUNCOES.md>).
- [Estado técnico e handoff da implementação](<C:/Users/Ithalo/Desktop/Advocacia site/handoff-novas-funcoes.md>).
- [Preparação original e critérios de cada etapa](<C:/Users/Ithalo/Desktop/Advocacia site/preparacao-novas-funcoes.md>).

Este guia descreve o que foi efetivamente entregue. Os itens planejados na preparação que ainda não foram implementados estão separados como pendências.
