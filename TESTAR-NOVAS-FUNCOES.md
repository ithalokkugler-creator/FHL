# Testar as novas funções antes de publicar

**05/10/2026 · Entrega local: E0 + F1–F4 + partes manuais de F5/F6 + F7 + recursos manuais de F8.** Nenhum commit, push, deploy, migração remota ou dado real de teste foi criado nesta entrega.

**Revisão (05/10, noite):** bugs funcionais e visuais corrigidos e código reorganizado — lista completa em [REVISAO-NOVAS-FUNCOES.md](REVISAO-NOVAS-FUNCOES.md). O roteiro abaixo continua valendo; onde algo mudou na tela, está indicado.

## Abrir a prévia

Precisa apenas do Node.js 20 ou superior, já utilizado pelo projeto. Não precisa instalar dependências, Docker, Supabase CLI, nem criar uma conta.

Abra o PowerShell e execute:

```powershell
cd "C:\Users\Ithalo\Desktop\Advocacia site"
npm run testar:local
```

Mantenha esse terminal aberto e abra (tanto `127.0.0.1` quanto `localhost` funcionam):

- **Painel de teste e perfis:** <http://127.0.0.1:8125/__teste>
- **Hoje — avisos F7:** <http://127.0.0.1:8125/sistema/?perfil=admin#/inicio>
- **Agenda — F8:** <http://127.0.0.1:8125/sistema/?perfil=admin#/agenda>
- **Contatos:** <http://127.0.0.1:8125/sistema/#/contatos>
- **Clientes:** <http://127.0.0.1:8125/sistema/#/clientes>
- **Processos:** <http://127.0.0.1:8125/sistema/#/processos>
- **Gerar documento:** <http://127.0.0.1:8125/sistema/#/documentos/novo?cliente=00000000-0000-4000-8000-000000000202>
- **Atualizações e cronômetro:** <http://127.0.0.1:8125/sistema/#/atualizacoes>
- **Relatório de atividades:** <http://127.0.0.1:8125/sistema/#/atualizacoes/relatorio?cliente=00000000-0000-4000-8000-000000000202>
- **Ficha completa de exemplo:** <http://127.0.0.1:8125/sistema/#/clientes/00000000-0000-4000-8000-000000000202>
- **Formulário do site:** <http://127.0.0.1:8125/contato.html>
- **Formulário de campanha:** <http://127.0.0.1:8125/campanhas/acidente-de-trabalho.html>
- **Tarefas:** <http://127.0.0.1:8125/sistema/?perfil=admin#/tarefas>
- **Prazos:** <http://127.0.0.1:8125/sistema/?perfil=admin#/prazos>
- **Feriados cadastrados:** <http://127.0.0.1:8125/sistema/?perfil=admin#/feriados>
- **Intimações manuais:** <http://127.0.0.1:8125/sistema/?perfil=admin#/intimacoes>
- **Membros:** <http://127.0.0.1:8125/sistema/?perfil=admin#/membros>

A entrada é automática com um perfil fictício. O painel permite escolher administrador, sócia, secretária, associado sem Clientes e equipe de Clientes sem Agenda/Financeiro. Não use senha ou dados pessoais reais.

Os dados ficam apenas na memória do servidor. **Restaurar dados fictícios**, no painel, volta aos exemplos iniciais. `Ctrl+C` encerra. Para testar alterações no código, encerre e execute novamente; essa prévia não tem recarga automática.

Se a porta estiver ocupada, feche a outra prévia ou use:

```powershell
$env:PORT_TESTE = "8126"
npm run testar:local
```

Nesse caso, use a porta 8126 nos links.

## Roteiro sugerido

1. Abra Contatos. Teste os filtros de situação, canal, campanha, período e busca sem acentos. Selecione **Todas**, recarregue e confira que o filtro foi mantido.
2. Cadastre um contato manual, abra-o e altere situação, responsável e observações. A mensagem recebida permanece protegida.
3. Clique em **Responder**, edite o texto e confira as opções de copiar, abrir WhatsApp e abrir e-mail. **Registrar que respondi** registra a ação; o envio depende de você no aplicativo.
4. Em **Virou cliente**, escolha um cliente existente ou use **Cadastrar com os dados do contato**. Depois clique em **Vincular cliente**. Confira o contato convertido no filtro Todas.
5. Arquive um contato, consulte-o pelo filtro e abra seu histórico. O arquivamento mantém o registro.
6. Envie um contato pelo site ou campanha, usando nomes fictícios e e-mail `teste@example.test`. Volte ao sistema e atualize a tela. Confira origem, mensagem e data do consentimento. A tela **Hoje** mostra os três contatos novos mais recentes.
7. O quarto envio pelo formulário em dez minutos mostra o bloqueio, mantém os campos e oferece um link para o WhatsApp. Restaurar os exemplos também limpa esse limite local.
8. Em **Membros**, confira as novas colunas Clientes e Prazos (rótulos curtos; a descrição completa aparece ao passar o mouse e no diálogo de edição). Depois abra o perfil **Associado sem Clientes**: o menu e a rota Contatos ficam bloqueados.
9. Confira a tela no celular ou reduzindo a janela. A tabela pode ser rolada horizontalmente.

### Clientes e processos — F2

1. Abra **Clientes** e busque `jose`, `123.456.789-09`, `12345678909` ou `0001234-22.2025.8.16.0001`. Combine filtros de responsável, área, situação, representante e cadastro ativo/inativo.
2. Clique em **Novo cliente**. Preencha os grupos, incluindo recados, representante, dados bancários e responsável. Concordância começa neutra; escolha explicitamente se desejar. Use documentos fictícios válidos: CPF `529.982.247-25` ou CNPJ `45.723.174/0001-10`. Os exemplos já usam outros documentos.
3. Digite CPF inválido e tente cadastrar: o formulário mantém os dados e mostra o erro. Corrija e salve. A ficha abre após o cadastro. Edite um dado, salve e confira **Histórico**, com antes e depois.
4. Na ficha, clique em **Novo processo**. Teste o CNJ fictício válido `0001234-22.2025.8.16.0001`: a máscara e o tribunal TJPR aparecem ao sair do campo. `0001234-89.2025.8.16.0001` é inválido. O mesmo CNJ pode ter clientes distintos; repetir para o mesmo cliente mostra erro.
5. Cadastre também caso consultivo sem número, com título, área e referência. Em **Processos**, edite a situação para Encerrado; ele sai do filtro padrão. Escolha **Todos**, recarregue e confira a permanência do filtro.
6. Abra a ficha de **José Fictício da Silva**: processo, aniversário próximo, agenda, contrato com saldo/vencidas e dados completos. O compromisso particular de outro membro fica oculto. O contrato aponta para o módulo real; a simulação cobre o resumo da ficha, não os lançamentos financeiros.
7. Desative um cliente e confirme que o cadastro, processos e histórico continuam disponíveis. Confira o filtro Inativos e reative pela ficha.
8. Converta um Contato usando **Cadastrar com os dados do contato**: abre o cadastro completo com nome, telefone e e-mail preenchidos. Depois de vincular, a ficha mostra **Veio de** e o contato oferece **Abrir ficha do cliente**.
9. No painel de teste, escolha **Equipe só de Clientes**: a ficha não mostra nem consulta Agenda/Financeiro. **Associado sem Clientes** não abre a rota. A separação das tabelas também é verificada pelos testes SQL.

CEP é preenchido manualmente. A ficha já mostra tarefas e prazos abertos.

### Documentos — F3

1. Na ficha de José, clique em **Gerar documento**. Experimente os oito modelos. Dados que faltam aparecem destacados entre colchetes; **Completar o cadastro** abre o formulário de F2. A empresa fictícia ainda não tem representante, para testar essas pendências.
2. Preencha os complementos e edite diretamente a folha. Ao mudar modelo ou complemento depois de editar o texto, confira a pergunta de refazer: **Cancelar** mantém a edição e **Refazer texto** a substitui.
3. **Salvar sem imprimir** abre a cópia final, somente leitura. **Imprimir** permite escolher Salvar como PDF no Chrome/Edge. O contrato ocupa duas páginas A4 com rodapé repetido. Desative os cabeçalhos/rodapés do próprio navegador, se aparecerem URL e data.
4. **Baixar para o Word** gera um `.doc` em HTML, como o protótipo. Abra no Word e confira a aparência; o teste automatizado verifica o arquivo exportado, sem executar o Word. Mantenha a prévia aberta enquanto carregar a imagem do cabeçalho.
5. Cada impressão/exportação registra outra geração, com autor, data e texto final. Cancele um documento com motivo e abra **Histórico**: a cópia fica preservada. Para corrigir o texto salvo, gere outro documento.
6. Na ficha, abra o **Contrato Fictício de Demonstração** e use **Gerar contrato** ou **Prestação de contas**. Confira entrada de R$ 500, três parcelas e total contratado de R$ 2.000. A prestação soma R$ 500 recebidos; o recebimento estornado de R$ 999 fica fora.
7. Na Agenda, abra um atendimento e use **Declaração de comparecimento**. Cliente, data e advogado responsável chegam ao documento. Modelos sem permissão de Agenda/Financeiro não consultam essas fontes.

Os textos seguem o Apêndice A. As decisões jurídicas do §7.8, a comparação com os DOCX originais e o e-mail institucional continuam aguardando revisão do escritório. A instrução de identidade da renúncia fica na tela, fora do papel; PF/PJ usa a proposta da preparação. Nenhuma dessas pendências foi tratada como aprovação de redação.

### Atualizações e tempo — F4

1. Na ficha de José ou em **Atualizações**, clique em **Iniciar cronômetro**. O tempo total da ficha e de Atualizações não conta cronômetro ainda rodando — ele aparece à parte, como no relatório. Escolha tipo e processo, se houver. Navegue a outra tela e confira o indicador na lateral; no celular, ele fica no topo. Abra outra aba com o mesmo perfil para testar a retomada e sincronização. A referência de tempo vem do servidor; a conferência automática ocorre a cada 15 segundos.
2. Tente iniciar outro cronômetro do mesmo perfil: o servidor recusa. **Parar** abre relato, próxima providência, situação opcional do processo e **Gerar ficha de atendimento ao salvar**.
3. **Lançar atualização** permite dia e horário livres, inclusive mudança de dia e participantes. **Sem tempo, só anotação** registra duração zero. Participantes recebem o tempo integral da atividade; o total do cliente a conta uma vez.
4. Edite somente o relato de uma atividade cronometrada e confira que a marca permanece. Corrija os horários e confira que vira **Lançada à mão**, com antes/depois no histórico. A sócia edita as próprias atividades; o administrador também pode editar/cancelar as dos outros. Cancelar exige motivo e retira o tempo dos totais.
5. Em **Hoje**, clique em **Iniciar atendimento** no exemplo do dia. A chegada é registrada; ao parar, o compromisso fica realizado. A ficha de atendimento usa o relato salvo.
6. **Relatório para o cliente** na ficha abre período, processo e folha A4. Relatos internos começam ocultos; marque **Incluir relatos internos no documento** somente quando desejar. Atividades canceladas e cronômetros ainda abertos ficam fora. Imprimir, Word ou salvar registra a versão em Documentos.
7. O perfil **Secretária** começa com um timer fictício de nove horas. Ao parar, confira o aviso e **Esqueci de parar: informar a hora real do fim**. Corrigir o fim remove a marca de cronômetro.

### Tarefas e prazos manuais — F5 parcial

1. Abra **Tarefas**: escolha Minhas, Que eu deleguei ou Todas; combine situação, prioridade e busca. Crie uma tarefa comum, escolha cliente/processo e delegue ao associado.
2. Marque **Bloquear a agenda do responsável?**, informe o período e salve. O compromisso de diligência é criado junto com a tarefa. Sem acesso à Agenda, essa opção não aparece. Cancelar a tarefa não cancela o compromisso: ajuste-o pela Agenda.
3. Abra o perfil **Associado sem Clientes/Prazos** e entre em Tarefas. A tarefa recebida pode ficar Em andamento ou ser Concluída em um clique. Quem e quando são gravados pelo servidor. Reabrir e cancelar exigem motivo; confira o Histórico.
4. Como administrador, escolha **Prazo processual**. Informe publicação/intimação, contagem, quantidade, data fatal e entrega. **Todos esses valores são manuais**: não há sugestão automática. Para dias, o registro usa 23:59 em Brasília; para horas, informe os horários exatos. Marque a conferência antes de salvar.
5. Delegue esse prazo ao associado. Ele pode editar a descrição e concluir; os campos da data fatal/contagem ficam desabilitados. O banco também impede alterá-los.
6. Abra **Prazos**, filtre Hoje, Semana, Mês, Ano ou Todos abertos, responsável e situação. Imprima / salve em PDF. O papel identifica os filtros e inclui as descrições.
7. Na ficha de José, confira **Tarefas e prazos abertos** e **Nova tarefa / prazo**, com o cliente preenchido.
8. Em **Feriados**, cadastre uma data, nome, tribunal (ou vazio para todos) e tipo. Edite, desative e consulte o histórico. A mesma data/tribunal não pode ser duplicada.

**Pendente:** cálculo dos feriados nacionais, sugestão das datas móveis, contagem jurídica automática, memória dia a dia e entrega automática com antecedência de três dias úteis.

### Intimações manuais — F6 parcial

1. Abra **Intimações** e **Cadastrar intimação**. Informe recebimento e publicação conferida, teor, advogado e origem; vincule cliente e processo se disponíveis. O teor salvo fica protegido.
2. Abra **Conferir / vincular**. Confira texto, datas e número CNJ. Salve vínculo/observações ou escolha **Só conferir**, marcando que leu e conferiu a comunicação.
3. No exemplo fictício, escolha **Gerar prazo**. A base recebe a publicação informada. Preencha quantidade, contagem, fatal e entrega manualmente e confirme. Salvar cria o prazo com origem e registra a conferência na mesma transação. Se cancelar o formulário, a intimação não passa a conferida.
4. Se houver Agenda no perfil, escolha **Lançar audiência**. O formulário da Agenda recebe cliente e número do processo. Informe data/horários e responsável permitido. A audiência e a conferência são gravadas juntas, sem audiência duplicada para a mesma comunicação.
5. **Arquivar** exige motivo. Use o filtro Arquivadas e confira que o teor e o histórico continuam disponíveis.
6. O perfil sem Prazos não recebe o menu nem abre a rota e não lê as tabelas de intimações.

**Pendente:** busca por OAB, paginação, limite 429, normalização/importação e deduplicação do DJEN, associação automática ao processo, sugestão de prazo/audiência, publicação calculada e verificação na Vercel. A captura automática diária só entra depois da etapa de busca em uso (§10.7).

**Limitação desta entrega:** o filtro de conteúdo bloqueou a geração dos módulos de contagem e leitura do DJEN, sem motivo detalhado. Não foi repetida a ação bloqueada; as funções manuais acima são a alternativa entregue. F5 e F6 não estão concluídas integralmente.

## Testar F7 — avisos do dia

1. Abra **Hoje** como administrador. Confira **Para hoje**, o prazo fatal em destaque e os contadores de Tarefas, Contatos e Intimações. A lista contém apenas tarefas sob sua responsabilidade, abertas e com data vencida, hoje ou até sete dias adiante.
2. Em **Aniversários**, **Cliente Fictício Existente** faz aniversário hoje; José aparece nos próximos dias. Clique em **Preparar mensagem**, edite, copie e confira o texto do link WhatsApp. O sistema não envia nem registra um envio. Clientes inativos e pessoas jurídicas não entram na lista; 29/02 é lembrado em 28/02 nos anos sem essa data.
3. Em **Lembretes de amanhã**, prepare o texto de José e confira data, horário de Brasília, remetente e endereço. Atendimentos online usam o link informado; sem link, o texto pede confirmação pela equipe. Compromissos particulares não geram lembrete.
4. **Contatos novos do site** mostra os três mais recentes e o total desse canal. O contador do menu inclui contatos novos de todos os canais. **Intimações a conferir** usa os registros manuais de F6 já existentes.
5. O exemplo de **Publicações do site** avisa que a última publicação foi há 34 dias e oferece escrever. Rascunhos não contam. O aviso usa a data do artigo marcado como publicado, não a data do deploy; só aparece depois de 21 dias ou quando não há publicação.
6. Conclua uma tarefa, confira uma intimação ou registre resposta de contato: o contador correspondente muda sem precisar trocar de tela. Valores zero ficam ocultos.
7. Troque para **Secretária**, **Associado sem Clientes** e **Equipe só de Clientes** no painel de teste. Hoje e o menu devem mostrar somente os módulos autorizados. O associado ainda vê suas próprias tarefas.

O lembrete de atendimento de F7 também informa o advogado responsável. Exportação `.ics` e botão do Google estão disponíveis em F8. O painel opcional de processos sem atualização há 60 dias não foi incluído.

## Testar F8 — Agenda

1. Abra **Agenda** como administrador. O dia atual mostra **Feriado fictício de teste**, com a coluna suavemente destacada. Somente registros ativos de Feriados com tribunal vazio aparecem na grade; suspensões de um tribunal não afetam a agenda de todos. É possível marcar atendimento no dia destacado.
2. Abra **Atendimento Fictício de Hoje**. **Pôr no Google Agenda** abre uma nova aba com título, dia, horário de Brasília, responsável e endereço. Confira e salve manualmente na agenda desejada. O teste automático verificou a URL gerada; salvar na sua conta depende de você.
3. No mesmo detalhe, use **Preparar lembrete**. Confira cliente, dia, hora, advogado, endereço e remetente. Edite e copie; abrir o WhatsApp prepara o texto para você conferir e enviar. Um atendimento online usa o link informado; sem link, pede confirmação pela equipe.
4. Use **Exportar .ics**: escolha Semana ou Mês, o mês desejado e todos os advogados ou um responsável. A seleção inicial acompanha os advogados marcados na grade. Baixe o arquivo.
5. No computador, abra o Google Agenda → **Configurações → Importar e exportar**. Escolha o `.ics` e a agenda de destino; importe e confira acentos e horários. Esse teste na conta Google ainda está pendente. Instruções oficiais: [Importar eventos](https://support.google.com/calendar/answer/37118?hl=pt-BR).
6. Confira os dois blocos de vários dias: o público mantém nome e período; o particular da sócia aparece como **Ocupado** para o administrador, sem detalhes. No perfil Sócia, o próprio particular mostra o título e oferece o botão Google. Observações internas não entram no Google nem no `.ics`.
7. Escolha um lembrete de 15 minutos a 1 dia ao editar um compromisso e exporte novamente: o `.ics` inclui esse alarme. No formulário do Google, confira o alerta manualmente. **Iniciar atendimento** e **Declaração de comparecimento**, de F4/F3, continuam no detalhe.

Importar ou salvar cria uma cópia. Ajuste mudanças e cancelamentos posteriores também no Google. Para ocupar os horários do link de agendamento, confira se a agenda de destino está selecionada na verificação de disponibilidade desse link; veja [Conferir disponibilidade](https://support.google.com/calendar/answer/16287054?hl=en-7).

**Limite de F8:** a grade lê os feriados já cadastrados; a geração automática dos nacionais continua pendente após o bloqueio de conteúdo registrado em F5/F6. F8 não exigiu nova migração nem credencial Google. Não há sincronização automática.

## O que a prévia executa

Ela usa o frontend real e o mesmo `handler.js` da função `receber-contato`. A API e o login são simulados com dados fictícios, em `scripts/local/dados.mjs`; a prévia não prova sozinha as políticas RLS.

O build da prévia fica em `.local/previa/`, separado de `dist/`. O servidor substitui a configuração do Supabase somente na resposta local e usa outra chave de sessão (`fhl.teste.sessao`). Não lê conteúdo remoto, não chama a produção e não dispara o Deploy Hook. A prévia também permite gravar os compromissos usados nas integrações. Não simula todos os lançamentos dos módulos antigos.

**`npm run dev` continua usando o Supabase configurado em `sistema/js/config.js`. Para esta entrega, use `npm run testar:local`.** As novas colunas ainda não existem no projeto remoto.

## Verificações

```powershell
npm run sistema:test
npm run check
```

- JavaScript: **104 testes aprovados**, incluindo os 11 de F8 para UTC, dias inteiros, escapes, dobra UTF-8, privacidade, alarmes, URL Google e lembrete, e os da revisão (êxito vazio, ficha de atendimento, nomes das declarações, cronômetro aberto fora do total).
- PostgreSQL 17 isolado, via PGlite: **329 verificações aprovadas** — 87 de permissões existentes, 62 de Financeiro, 64 de E0/F1/F2, 42 de F3/F4, 53 de F5/F6 manuais e 21 de F7. Foram executadas todas as quatorze migrações, com esquemas mínimos locais para Auth e Storage. Nenhuma consulta de teste foi executada na produção.
- Navegador: cadastro, triagem, resposta, dois caminhos de conversão, arquivo, histórico, perfis, site, campanha, limite, Hoje e celular. Sem exceções JavaScript ou chamadas de API externas no roteiro.
- `npm run check`: **17 páginas aprovadas**, com links, âncoras, metadados e SEO.

Os testes SQL desfazem a transação no fim; `supabase/testes/avisos.sql` acrescenta 21 cenários de F7. Os roteiros registrados somam 93 fluxos (12 Contatos + 12 F2 + 2 vínculos + 21 F3/F4 + 12 F5/F6 manuais + 16 F7 + 18 F8), com capturas de desktop/celular. F8 cobre semana/mês, responsáveis, períodos que cruzam semanas, cancelamento, privacidade, lembretes, feriados cadastrados e falhas da API. Nove arquivos foram lidos sem erro pelo parser independente `icalendar 6.3.2`, incluindo vetores de acentos/emoji e fim exclusivo. Isso não substitui a importação manual na conta Google. Execute SQL apenas em banco local ou isolado. A implantação no runtime real de Edge Functions e o fluxo remoto ainda precisam de validação depois da sua aprovação.

Na etapa de F8, os 16 fluxos de F7, os 21 de F3/F4 e os 12 manuais de F5/F6 foram reexecutados e aprovados. A API simulada também teve sua comparação/ordenação de timestamps corrigida e conferida com offsets distintos na virada do dia UTC. O check público usou os artigos/campanhas locais em cache porque a leitura do conteúdo remoto não respondeu.

## O que foi implementado

**E0:** novos níveis de acesso Clientes e Prazos, retorno na sessão, edição por perfil em Membros, identidade compartilhada em `sistema/js/escritorio.js`, áreas jurídicas e formatos comuns.

**F1:** tabela Contatos e auditoria, entrada protegida pelo formulário, canal e campanha, consentimento no servidor, limites de 3 envios por IP/10 minutos e 30 envios globais/hora, triagem, resposta manual, conversão, arquivo, filtros, indicadores, origens, backup e aviso em Hoje. A conversão tem carimbo próprio do servidor para medir os últimos 90 dias corretamente.

**F2:** cadastro completo PF/PJ separado do mínimo, gravação atômica, dados restritos por permissão, processos com validação CNJ, casos sem número, filtros, ficha integrada, aniversário, histórico e desativação/reativação. Cadastro rápido da Agenda/Financeiro preservado. Backup inclui os novos registros conforme o acesso.

**F3:** oito modelos, edição, pendências, A4, Word, texto final imutável, cancelamento, histórico e fontes do Financeiro/Agenda.

**F4:** atividades, participantes, relógio do servidor, timer persistente, correção auditada, linha do tempo, relatório e vínculo com atendimento.

**F5/F6 parciais:** tarefas, prazos manuais, resumo/ impressão, feriados cadastrados e conferência de intimações manuais com prazo/audiência.

**F7:** painéis de Hoje, aniversários, tarefas e prazos próximos, contatos do site, intimações pendentes, lembretes de amanhã e publicação antiga; mensagens editáveis para copiar/abrir WhatsApp e contadores conforme o acesso.

**F8:** botão Pôr no Google Agenda, exportação semana/mês `.ics` por advogado ou todos, alarmes no arquivo, lembrete no detalhe e feriados cadastrados na grade. Usa a RPC que mascara particulares; não inclui observações internas.

**Ainda pendentes:** contagem automática e feriados calculados de F5, busca/importação DJEN de F6 e geração automática de feriados nacionais em F8. A importação na conta Google aguarda teste manual. Sincronização nos dois sentidos continua futura; F9 é opcional.

## Hospedagem conferida e publicação futura

- Supabase **fhl-advocacia**, projeto `ulnpnbzibwbrzrpomgia`, região São Paulo (`sa-east-1`), ativo. A produção tem as seis migrações de setembro.
- Edge Function existente `publicar-site`: ativa, versão 3, `verify_jwt=false`; não foi acionada. `receber-contato` ainda não existe no remoto.
- Vercel **fhl-advocacia**, projeto `prj_QZHtS2FWiPekoSa0BtFZye4OAmoM`: site público e `/sistema` no mesmo projeto. Build `npm run build`, saída `dist/`, sem framework; runtime configurado Node 24.
- Repositório remoto: `ithalokkugler-creator/FHL`. `vercel.json` continua com os cabeçalhos do sistema; a entrega não introduz dependências no site.

Após você testar e aprovar, a ordem é: revisar o diff e a política de privacidade; aplicar **20261005130311_base_modulos**, **20261005130317_contatos**, **20261005140521_clientes_processos**, **20261005212635_documentos**, **20261005212642_atualizacoes**, **20261005225741_tarefas_prazos**, **20261005225750_intimacoes** e **20261005232739_avisos_do_dia**; configurar `CONTATO_SAL` com segredo aleatório de pelo menos 32 caracteres na borda; publicar `receber-contato` com `verify_jwt=false`; verificar a entrada real; somente então publicar o novo frontend e conferir o fluxo completo. A chave de serviço fica na função, nunca no navegador. O código aceita `SUPABASE_SECRET_KEYS` e a chave de serviço legada do ambiente.

**Não publique este frontend antes do banco e da função:** o endpoint e as colunas novos já são referenciados pelo código — publicado antes, a área dos advogados inteira deixa de abrir. **Atenção: um push na `main` já é publicação** (a Vercel faz o deploy sozinha). Aplique as migrações e publique a função antes do push, ou faça o commit numa branch. Não foi feito commit, push ou deploy.

**Revisão do escritório:** política de privacidade, dados institucionais ainda marcados `[CONFIRMAR]` e retenção proposta de 12 meses para contatos arquivados. Não foi implementada anonimização automática; a etapa 2 de LGPD continua pendente. Os hashes técnicos antigos são limpos no processamento de novos envios, sem cron novo.
