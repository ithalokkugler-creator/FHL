# Handoff — E0/F1–F4, F5/F6 manuais, F7 e recursos de F8, antes de commit/publicação

**05/10/2026.** Ithalo pediu começar `preparacao-novas-funcoes.md` e testar
localmente antes do commit e da publicação. A entrega implementa E0 + F1–F4;
F5/F6 foram parcialmente implementadas nos fluxos manuais. Contagem e
busca/importação DJEN continuam pendentes. F7 está implementado e testado
localmente; F8 tem Google/`.ics`, lembrete e feriados cadastrados prontos.
Feriados automáticos e teste na conta Google estão pendentes; F9 é opcional.

## Estado da entrega

- Nenhum commit, push, deploy, migração remota ou conta real de teste.
- Supabase `ulnpnbzibwbrzrpomgia`, São Paulo, ativo; seis migrações remotas
  conferidas. Novas migrações geradas pela CLI:
  `20261005130311_base_modulos.sql`, `20261005130317_contatos.sql` e
  `20261005140521_clientes_processos.sql`, `20261005212635_documentos.sql` e
  `20261005212642_atualizacoes.sql`, `20261005225741_tarefas_prazos.sql` e
  `20261005225750_intimacoes.sql` e `20261005232739_avisos_do_dia.sql`.
- Vercel `prj_QZHtS2FWiPekoSa0BtFZye4OAmoM`, projeto `fhl-advocacia`:
  site e `/sistema` juntos; build Node, `dist/`, Node 24 configurado.
- Os documentos `handoff-fhl-site-publico.md` e
  `preparacao-novas-funcoes.md` já estavam sem rastreamento no início.
  A preparação recebeu apenas atualização de estado/checklists desta entrega.

## Arquivos principais

- `sistema/js/escritorio.js`: identidade pública compartilhada.
- `nucleo/estado.js`, `telas/membros.js`: Clientes/Prazos, sessão e perfil.
- `telas/contatos.js`, `dominio/contatos.js`, `dominio/mensagens.js`:
  filtros, triagem, resposta manual, conversão e histórico.
- `supabase/functions/receber-contato/{index.ts,handler.js}`:
  endpoint público validado, limites, consentimento e hash salgado do IP.
- `supabase/config.toml`: `verify_jwt=false` para `receber-contato` e preservado
  para `publicar-site` (modo confirmado na função remota ativa, versão 3).
- `supabase/testes/clientes.sql`: 64 cenários locais, transação desfeita.
- `dominio/clientes.js`, `telas/clientes/{lista,cliente,formulario}.js` e
  `telas/processos.js`: cadastro completo PF/PJ, busca, ficha integrada e processos.
- `scripts/testar-local.mjs` e `scripts/local/dados.mjs`: prévia fictícia,
  sem credenciais nem chamadas externas. Não entram em `dist/`.
- `documentos/{partes,modelos,acoes,relatorio}.js`, `nucleo/higienizar.js` e
  `telas/documentos/`: oito modelos, edição, A4, Word e registro imutável.
- `dominio/tempo.js`, `telas/atualizacoes/`: lançamentos, cronômetro do servidor,
  participantes, linha do tempo, filtros e relatório para o cliente.
- `supabase/testes/documentos-atualizacoes.sql`: 42 verificações de F3/F4.
- `sistema/img/logo-documento.svg`: mesma marca em tinta escura, derivada da
  fonte única por `arquivoAssinatura`; regenerável com `npm run marca`.

O cadastro mínimo existente de clientes segue atendendo Agenda/Financeiro.
F2 separa os dados completos em `clientes_detalhes`, restrita a Clientes.
`salvar_cliente` salva as duas partes atomicamente e ignora IDs de detalhe e
carimbos recebidos. Processos são legíveis por todos os membros ativos;
escrita só com Clientes. CNJ é validado na tela e no banco, único por cliente.
Referência sem número atende casos consultivos. Ficha consulta Agenda e
Financeiro só com os respectivos níveis e abre histórico das duas partes.
Desativação/reativação preserva os registros; backup inclui os novos dados.
Conversão de contato agora abre o formulário completo preenchido e o vínculo
oferece a ficha. CEP manual; próxima data de prazo e demais seções chegam em
F5, sem atalhos inoperantes. A conversão adiciona `convertido_em`
ao contato, preenchido por trigger; o indicador usa essa data, não a chegada.
`registrar_contato` usa trava transacional antes dos limites, para evitar
exceder as contagens com requisições simultâneas.

F3 salva o HTML final higienizado: edição posterior gera outro documento;
reimpressão/Word guarda outra geração ligada ao original. Somente cancelamento
com motivo pode alterar o registro. Fontes de contrato, prestação e Agenda
exigem os respectivos níveis antes da consulta; vínculos cliente/caso/origem
são validados no banco. Impressão usa caixas de margem no Chrome atual para
repetir o rodapé, com elemento fixo como alternativa; a marca escura mantém
os caminhos da marca original. Word é HTML `.doc`; abertura no Word ainda
precisa da conferência do Ithalo.

F4 inicia/para via RPC com `clock_timestamp`, uma atividade aberta por membro,
trava da linha e validação da autorização do atendimento. `meu_cronometro`
retorna hora do servidor e atividade aberta; a UI interpola com relógio
monotônico, consulta a cada 15 s e usa BroadcastChannel entre abas. Horário
corrigido retira a marca; editar só o relato preserva os segundos. Autor edita
o seu, administrador também edita/cancela os dos outros, inclusive autor
posteriormente inativo. Chegada/conclusão da Agenda são atômicas com início/
parada. Situação do processo é operação separada com aviso de falha. Relatório
omite relato por padrão e exclui canceladas e abertas; participantes recebem
o tempo integral, sem duplicar o total do cliente. Backup inclui ambos os módulos.

Redação jurídica: preservado Apêndice A; §7.8 continua pendente. A instrução
de identidade na renúncia fica só na tela; adotada a proposta de PF/PJ. Não
alterados artigos 298/299, multa compensatória, entrada ausente na cláusula
3.1 ou sentido da declaração de endereço. Drive/Google não foram integrados.

## Teste e evidência

Roteiro para Ithalo: **[TESTAR-NOVAS-FUNCOES.md](TESTAR-NOVAS-FUNCOES.md)**.
Comando: `npm run testar:local`. Painel: <http://127.0.0.1:8125/__teste>.
Sem senha; dados em memória; reiniciar/restaurar limpa a prévia.

- `npm run sistema:test`: 100/100 após F8.
- PostgreSQL 17 local via PGlite: todas as quatorze migrações executadas;
  87/87 permissões + 62/62 Financeiro + 64/64 E0/F1/F2 + 42/42 F3/F4 + 53/53 F5/F6 manuais + 21/21 F7 = 329/329.
  Auth/Storage simulados por esquemas mínimos; sem tráfego para produção.
- Chrome: 93 fluxos (12 Contatos + 12 F2 + 2 vínculos + 21 F3/F4 + 12 F5/F6 manuais + 16 F7 + 18 F8), desktop e celular, sem exceções
  JavaScript ou API externa. Inclui validações, preservação dos campos após
  erro, CNJ/duplicidade, permissões, desativação, documentos, Word, impressão,
  cronômetros, cancelamento, participantes, relatório e integração da ficha.
  Dois contextos de página conferidos com o mesmo perfil; dois computadores
  físicos ainda não foram usados. Injeção intencional de estilo provocou o
  bloqueio esperado de CSP; nenhum erro de execução inesperado.
- PDF do contrato: duas páginas A4 renderizadas e inspecionadas, com marca
  legível e rodapé em ambas; somente documento, sem botões ou menu.
- `npm run check`: 17 páginas com links/âncoras/metadados/SEO aprovados.
- Identidade: SHA-256 igual nas 17 páginas ao trocar apenas o módulo de
  identidade original pela versão compartilhada, mantendo o endpoint de
  F1 igual nas duas versões.

Capturas e resultados da sessão ficam em `.local/`, ignorada pelo Git.
Playwright do runtime do Codex e PGlite instalado temporariamente foram usados
só na verificação; o site e a prévia não ganharam dependências.

## Ao retomar

Primeiro receber o resultado do teste do Ithalo. Não tratar a existência deste
handoff como autorização para publicar. Revisar diff e privacidade, aplicar
as oito migrações, configurar `CONTATO_SAL`, publicar a função e verificar o
runtime real; só então frontend. `src/data/site.mjs` já aponta para a função
nova por padrão; `FORM_ENDPOINT=''` preserva o modo WhatsApp se necessário.

A prévia tem saída própria `.local/previa`, não altera `dist/`, e substitui a
configuração do Supabase e a chave de sessão apenas na resposta local.
`npm run dev` continua conectado ao projeto configurado e não é o comando
para testar as colunas ainda ausentes em produção.

Anonimização após 12 meses arquivado depende de aprovação do escritório e
não foi implementada. Hashes técnicos são limpos no próximo processamento de
envios, sem cron. Confirmar política de privacidade e dados institucionais
marcados `[CONFIRMAR]` e revisão dos modelos (§7.8) antes de usar os documentos
com clientes reais. Próximas pendências: contagem automática F5 e busca/importação DJEN F6.


## F5/F6 manuais — 05/10/2026

O filtro de conteúdo bloqueou a geração dos módulos de contagem e leitura
DJEN, sem informar motivo detalhado. A ação não foi repetida. F5/F6 não estão
concluídas integralmente: não tratar os registros manuais como cálculo jurídico
ou consulta ao DJEN funcionando. A captura diária depende da etapa 1 em uso.

Entregue e testado:

- tarefas, feriados, v_tarefas: leitura para todos os membros ativos;
  autor/responsável/admin alteram tarefas; prazo fatal, base, quantidade,
  contagem, recesso e memória exigem Prazos. Datas inseridas manualmente.
- criar_tarefa: tarefa e bloqueio facultativo da agenda do responsável
  juntos. Exceção de delegação prevista na preparação; sem Agenda, recusa.
- Concluir registra relógio/autor; reabrir usa RPC motivado e limpa o sinal
  transacional; cancelar preserva registro. Responsável inativo não impede
  cancelamento administrativo de tarefa antiga.
- intimacoes e intimacoes_consultas: leitura só Prazos. Teor e datas
  salvos são imutáveis; conferência registra login/data. Consulta ao diário
  permanece somente leitura, sem RPC de importação implementado.
- criar_prazo_intimacao e lancar_audiencia_intimacao: registro e
  conferência em transação única, com travas, vínculo cliente/processo e
  autorização da agenda. Origem em tarefas é coluna exclusiva do servidor.
- Telas telas/tarefas/{lista,formulario,prazos}.js, feriados.js e
  intimacoes.js; ficha do cliente, backup, histórico e menu integrados.
- Agenda exporta editarCompromisso com valores iniciais e callback de
  gravação, preservando os fluxos existentes. Seleção da configuração usa
  os nomes reais do esquema, inclusive duracao_interno.
- scripts/local/prazos.mjs: dados fictícios e API simulada; não importa
  configuração de produção. Testes reais separados em supabase/testes/prazos.sql.

Verificação nova: 5 testes puros (77 total), 53 SQL novos (308 total) e 12
fluxos Chrome manuais. Regressões de F2 e F3/F4 reexecutadas; checks do site
aprovam 17 páginas usando conteúdo local em cache. Evidências em .local/.
Não houve commit, push, migração remota, consulta de dados judiciais reais
ou deploy. A especificação pública do CNJ foi apenas lida; CSP não ganhou
origem DJEN porque a busca ainda não está implementada.

## F7 — 05/10/2026

Hoje agrega minhas tarefas abertas atrasadas/de hoje/até sete dias adiante,
com fatal em destaque; aniversários de pessoas físicas ativas; os três novos
contatos mais recentes do site e total desse canal; intimações pendentes;
lembretes de atendimentos de amanhã; e aviso quando o último artigo publicado
tem mais de 21 dias (ou não há artigo). Não consulta módulos negados. Usa os
registros manuais existentes de F5/F6; não adiciona cálculo nem captura DJEN.

`dominio/aniversarios.js` compartilha a regra de 29/02 com a ficha do cliente.
`dominio/mensagens.js` concentra aniversário/lembrete/resposta. O diálogo
`telas/preparar-mensagem.js` permite editar, copiar e abrir WhatsApp; não grava
envio. Endereço vem da identidade única; particulares não viram lembrete.

RPC `avisos_do_dia` é invocador, com RLS e permissão explícita de execução.
Retorna null para quem não é membro ativo; contatos/intimações somente quando
autorizados. Atrasadas e hoje não se sobrepõem. Menu usa total de novos contatos
de todos os canais; painel usa `contatos_site_novos`. Atualiza ao abrir/trocar
rota e após mutações desses módulos. Respostas antigas são descartadas; erro
de contador só vai ao console. Falha de um painel preserva os outros.

Migração `20261005232739_avisos_do_dia.sql` criada pela CLI e validada somente
no PostgreSQL local. 12 testes puros, 21 SQL e 16 fluxos Chrome novos; total
89 JavaScript / 329 SQL / 75 fluxos registrados. Capturas desktop e 390px,
falhas simuladas e resposta fora de ordem em `.local/`. Prévia em
<http://127.0.0.1:8125/sistema/?perfil=admin#/inicio>.
Regressões F3/F4 (21) e F5/F6 manuais (12) reexecutadas e aprovadas nesta etapa.

F8 `.ics`/Google foi acrescentado na etapa seguinte; o painel opcional de
processos sem atualização continua pendente. Aviso editorial usa `publicacoes.data` das marcadas publicadas,
não a data do deploy. Nenhum commit, push, deploy ou migração remota.

## F8 — 05/10/2026

Implementado o caminho manual da Agenda: botão Google no detalhe, exportação
da semana ou mês escolhido por responsável/todos/marcados e lembrete com
advogado no detalhe e em Hoje. Particular alheio continua Ocupado; só o dono
abre o próprio particular no Google. Nada é salvo no Google pelo sistema.
Exportação usa nova chamada à RPC `agenda_periodo`, exclui cancelados e
observações internas. `dominio/ics.js` gera CRLF, escapes, dobra UTF-8 de até
75 octetos, UID estável, horários UTC, datas exclusivas e VALARM configurado.
Blocos que atravessam semana/mês conservam seu período original.

A grade consulta `feriados` ativos com tribunal nulo, mostra nome e coluna
suave, inclui fim de semana quando necessário e preserva os compromissos
quando a consulta falha. Só lê cadastros existentes: geração automática de
feriados nacionais continua pendente após o bloqueio de conteúdo registrado
em F5/F6. A ação bloqueada não foi repetida. Sem migração nova ou credencial.

11 testes JavaScript novos e 18 fluxos Chrome aprovados; total 100 JavaScript,
329 SQL já registrados e 93 fluxos. Nove `.ics` passaram no leitor independente
`icalendar 6.3.2`, incluindo Unicode, escapes, alarme e vetores de datas.
Roteiros/evidências em `.local/testar-f8.mjs`, `verificacao-f8.json`,
`verificacao-f8-ics.json` e capturas desktop/390px. Não houve chamada externa
no teste de navegador. Importação real e formulário na conta Google ficam
para conferência humana; não marcar esses critérios como concluídos.

Revisar no Google a agenda de destino e sua participação na disponibilidade
do link de agendamento. Cópias não acompanham mudanças/cancelamentos.
Roteiro em `TESTAR-NOVAS-FUNCOES.md`. Prévia:
<http://127.0.0.1:8125/sistema/?perfil=admin#/agenda>.
Nenhum commit, push, deploy ou migração remota.

Na regressão de F3/F4, identificada e corrigida uma comparação textual de
timestamps na API fictícia: após 21h de Brasília, registros em UTC já tinham
o dia seguinte e eram excluídos do filtro local. `scripts/local/dados.mjs`
agora compara e ordena instantes normalizados, como `timestamptz` no Postgres.
Intervalo, ordenação e igualdade com offsets distintos foram conferidos
em `.local/testar-fuso-previa.mjs`. Os 21 fluxos de F3/F4, os 16 de F7 e os
12 manuais de F5/F6 foram reexecutados e aprovados após a correção. O roteiro
de cadastro fictício de feriado usa 20/10 para não duplicar o exemplo TJPR
do dia atual acrescentado em F8.

## Revisão — 05/10/2026 (noite)

Pedido do Ithalo: procurar bugs e bugs visuais, corrigir e revisar o código.
Relatório para ele em [REVISAO-NOVAS-FUNCOES.md](REVISAO-NOVAS-FUNCOES.md).
Nenhum commit, push, deploy ou migração remota.

- Bug que só apareceria em produção: `editarCompromisso` (chamado por
  Intimações → Lançar audiência) pedia `config_agenda.mostrar_fim_semana`,
  coluna inexistente; agora `select: '*'`. A API simulada ignora colunas —
  conferir coluna nova contra as migrações (checagem usada nesta revisão:
  cada `select`/filtro/ordem de `sistema/js` contra `information_schema` do
  PGlite com as 14 migrações; zero divergências depois da correção).
- `totais` deixou de somar cronômetro aberto (mesmo critério do relatório);
  `rodando` conta os abertos, mostrados à parte na ficha e em Atualizações.
- Visual: cronômetro no topo do celular, vão no topo das telas curtas,
  `.sr-only` escapando de `.tabela-rolagem`, nomes invisíveis em Membros,
  folha A4 cortada (`ajustarFolha`), ficha de atendimento sem estilo, tabela
  do relatório, filtros de data, indicadores, agenda, diálogos — lista no
  relatório.
- Código: ~25 arquivos novos reescritos no estilo do projeto; migrações
  `clientes_processos`, `documentos`, `atualizacoes`, `tarefas_prazos` e
  `intimacoes` reformatadas sem mudar regra; `supabase.js` dispara
  `fhl:gravou` e `nucleo/avisos-do-dia.js` decide os contadores; app.js não
  remonta mais a rota em `fhl:atualizacoes` (as telas se atualizam no lugar).
- Modelos: 864 saídas comparadas antes/depois — idênticas, salvo o `[ÊXITO]`
  pendente no contrato e a classe `doc-ficha-relato` na ficha.
- Verificação: 104/104 JS, 329/329 SQL, 93/93 fluxos Chrome (5 asserções dos
  roteiros `.local/testar-*.mjs` atualizadas às mudanças intencionais; porta
  por `PORT_TESTE`), 17 páginas no check. `.claude/launch.json` ganhou a
  configuração `previa` (porta 8127) para não disputar a 8125 do Ithalo — os
  roteiros restauram os dados fictícios ao começar.
- Risco principal antes de publicar: push na `main` = deploy na Vercel; o
  frontend novo não abre sem as migrações (`carregarMembros` pede
  `acesso_clientes`/`acesso_prazos`).
