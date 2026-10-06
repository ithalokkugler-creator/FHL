# Correções dos erros FHL — 06/10/2026

Pedido: corrigir `Erros FHL.md`, revisar outros bugs encontrados e melhorar a experiência dos formulários, principalmente **Nova tarefa / prazo**. Os handoffs foram usados como contexto técnico; o roteiro de produção não foi executado.

## Tarefas e prazos

A causa do erro “Algum valor não é aceito” era a diferença entre `null` de JSON e `NULL` do PostgreSQL. O formulário enviava `memoria_prazo: null` na criação de tarefa comum; a RPC lia esse valor com `->`, produzindo um JSON não nulo e violando `tarefa_prazo_completo`. A simulação local tratava o mesmo payload como se fosse SQL NULL e escondia o problema.

- Na criação de tarefa comum, o frontend omite os campos exclusivos de prazo. Na edição, continua limpando esses campos ao converter um prazo em tarefa.
- A nova migração `20261006211332_corrigir_tarefa_memoria_nula.sql` normaliza JSON null para SQL NULL na RPC, inclusive para formulários antigos. Não muda permissões, RLS, regras de prazo nem migrações anteriores.
- O formulário informa que basta título e responsável para tarefa; cliente, processo, ato e entrega são opcionais.
- Campos condicionais ficam desabilitados quando não são usados. Horas só são exigidas em prazos contados em horas; bloqueio de agenda só exige período quando marcado.
- Quantidade inteira, data fatal, entrega e horário do bloqueio têm mensagens específicas e foco no campo correspondente.
- Limpar o processo ou trocar de cliente não restaura silenciosamente o processo antigo.
- A edição de prazo pelo responsável sem acesso a Prazos continua preservando os dados processuais.

## Formulários e outras melhorias

- Validação compartilhada para os formulários do sistema: resumo do motivo, mensagem junto ao campo, destaque acessível, foco e rolagem até o erro. Os demais dados permanecem preenchidos.
- Falhas de rede, sessão, permissão e servidor aparecem com motivos próprios; quando não há um campo responsável pela falha, o foco vai ao resumo do erro.
- Tradução das restrições conhecidas do banco sem mostrar SQL ou detalhes de linhas com dados pessoais.
- Botão dos diálogos mostra “Salvando…” durante a operação e continua protegendo contra envio duplicado.
- Agenda desabilita campos ocultos ao alternar bloqueio/dia inteiro e aponta datas e horários incorretos.
- Senhas divergentes apontam a repetição; CPF do representante aponta o documento do representante; erros de parcelas apontam a parcela ou total correspondente.
- Configurações financeiras validam todas as cotas antes da primeira gravação para não salvar algumas cotas e depois descobrir um valor inválido. Falhas de servidor durante múltiplas gravações continuam sujeitas ao comportamento existente; não foi criada uma transação nova para esse módulo.
- Formulário público valida telefone com DDD e rola ao campo incorreto. Tentativas rápidas com campos inválidos mostram a validação antes do aviso de tempo mínimo.
- Avisos no canto ficam limitados a três, não acumulam mensagens iguais e podem ser dispensados.

## Hoje

Os cartões usam colunas independentes no desktop, eliminando o espaço vazio causado pela altura da Agenda. Em telas estreitas, voltam à sequência de uma coluna, mantendo “Para hoje” e “Agenda de hoje” no início. A mudança de largura reorganiza os painéis sem buscar novamente os dados.

## Word

A exportação `.doc` passa a usar MHTML: texto e PNG da marca ficam no próprio arquivo, sem buscar imagem remota quando aberto. A marca tem dimensões explícitas em atributos HTML e pontos tipográficos: **180 × 54 px / 135 × 40,5 pt**, com PNG de **915 × 275 px** para nitidez. Os caminhos de novo documento, documento salvo e relatório aguardam a conclusão da exportação e mostram falhas de geração.

O arquivo gerado foi validado com um leitor MIME independente, incluindo HTML UTF-8, PNG incorporado, proporção, tamanho e ausência de eventos/scripts. O navegador passou sem erro de CSP. **Não foi feita inspeção visual no aplicativo Microsoft Word nesta sessão.**

## Verificação

- **108/108 testes JavaScript**.
- **333/333 verificações SQL** no PostgreSQL isolado via PGlite, com 16 migrações. Inclui o payload exato com memória JSON null e a manutenção da recusa de memória não nula em tarefa comum.
- **93 fluxos existentes de navegador** aprovados: Contatos, Clientes, vínculos, Documentos/Atualizações, Tarefas/Intimações, Hoje e Agenda.
- **18 cenários adicionais** aprovados: validações, troca de tipo, bloqueio, datas, edição de vínculos, conversão de prazo, rede, erro de restrição do banco, foco/rolagem em 390 px, senha, cotas, representante, Word, avisos e telefone público. Sem exceções JavaScript/CSP.
- **17 páginas** aprovadas em `npm run check`. A conexão de conteúdo remoto não estava disponível; o build usou a cópia local de publicações/campanhas. Esse check não confirma conteúdo de produção atualizado.
- `git diff --check` aprovado.

Roteiros, capturas e resultados ficam em `.local/`, ignorada pelo Git. Foram usados dados fictícios nos testes locais. Em 06/10/2026, após autorização do usuário para produção, a migração foi aplicada ao projeto `ulnpnbzibwbrzrpomgia` pelo conector Supabase. A versão local corresponde à versão registrada remotamente. A função anterior foi preservada em `.local/criar-tarefa-antes-publicacao.sql`; a normalização, o `search_path` e o acesso autenticado foram conferidos no banco remoto. Este conjunto de alterações segue para a branch `main`, que publica o frontend no projeto Vercel `fhl-advocacia`, equipe `wibble`. O resultado da publicação e as verificações remotas serão registrados em `.local/PRODUCAO-CORRECOES-FHL-20261006.md`.
