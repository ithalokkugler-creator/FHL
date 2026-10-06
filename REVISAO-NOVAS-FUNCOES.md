# Revisão das novas funções — bugs, visual e código

**05/10/2026, noite.** Revisão completa da entrega E0, F1–F4, F5/F6 manuais, F7
e F8 (ver [GUIA-NOVAS-FUNCOES-FHL.md](GUIA-NOVAS-FUNCOES-FHL.md)). Tudo
continua local: **nenhum commit, push, deploy ou migração remota**. O texto
jurídico dos modelos não mudou.

## Resultado

| Verificação | Antes | Depois |
|---|---|---|
| Testes JavaScript (`npm run sistema:test`) | 100 | **104 aprovados** |
| SQL em PostgreSQL local (PGlite, 14 migrações) | 329 | **329 aprovados** |
| Fluxos no Chrome (prévia, desktop e celular) | 93 | **93 aprovados** |
| Páginas públicas (`npm run check`) | 17 | **17 aprovadas** |
| Colunas pedidas pelo frontend × esquema real | — | **0 divergências** (havia 1) |

Para garantir que a reorganização do código não mudou nada sem querer, as
864 saídas dos oito modelos de documento (com dados variados) foram comparadas
antes e depois: idênticas, exceto pelas duas correções abaixo. O texto visível
das 100 combinações tela × perfil também foi comparado.

## Bugs corrigidos

1. **"Lançar audiência" (Intimações) falharia em produção.** O formulário da
   Agenda, aberto de fora dela, pedia ao banco a coluna `mostrar_fim_semana`,
   que não existe em `config_agenda`. A prévia não acusava porque a API
   simulada ignora nomes de coluna. Achado por uma checagem nova: cada
   `select`, filtro e ordenação do frontend comparado com o esquema montado
   pelas migrações. (`telas/agenda.js`)
2. **Tempo total inflado pelo cronômetro esquecido.** Ficha e Atualizações
   somavam o cronômetro ainda rodando: o exemplo de 9 h esquecidas mostrava
   "10 h 31 min", enquanto o relatório para o cliente dizia "1 h 30 min".
   Agora os dois usam o mesmo critério e o aberto aparece à parte —
   "1 cronômetro rodando, fora do total". (`dominio/tempo.js`)
3. **Contrato com êxito apagado imprimia "e % sobre o proveito econômico".**
   Agora aparece `[ÊXITO]` destacado, como os outros dados que faltam.
4. **Ficha de atendimento sem forma de formulário.** A tabela da ficha não
   tinha estilo nenhum (sem bordas, rótulos centralizados, relato numa linha).
   Agora tem bordas, rótulos à esquerda e uma área para o relato — é o papel
   que o cliente assina. Vale também para o Word.
5. **Tarefas:** "Delegada por" aparecia na tarefa que a pessoa criou para si
   mesma; "Entrega hoje" saía duas vezes (texto e selo); "dia(s)".
6. **Prazos:** o indicador "Atrasados" ficava vermelho mesmo com zero.
7. **Hoje:** número do processo das intimações sem máscara
   (`00012342220258160001`).
8. **Intimações:** "·" sobrando quando faltava tribunal ou órgão; a busca por
   número CNJ com pontuação não achava nada; "Conferidas em 7 dias" comparava
   datas como texto, em fusos diferentes; "Motivo do arquivamento" aparecia
   sempre, mesmo para só conferir.
9. **Feriados:** tribunal digitado em minúsculas era recusado com a mensagem
   genérica do navegador; data repetida dava "Já existe um registro com esses
   dados" — agora diz qual data e qual tribunal.
10. **Prazo em dias** mostrava os campos de hora, que eram ignorados. Agora
    eles só aparecem para prazo em horas.
11. **Resposta a contato** começava com o nome inteiro ("Olá, Pedro Fictício —
    Telefone!") e dizia "por presencial"; a observação gravava "respondeu por
    whatsapp". Agora: primeiro nome, frase certa para cada canal, "WhatsApp".
12. **Declarações** eram salvas e baixadas só como "Declaração"
    (`Declaracao.doc`), sem dizer de qual tipo.
13. **Parar o cronômetro pela lateral** remontava a ficha inteira (a tela voltava
    ao topo) e lia o banco duas vezes. Agora a tela se atualiza no lugar.
14. **Prévia local:** abrir por `http://localhost:8125` em vez de
    `127.0.0.1:8125` fazia toda gravação dar erro 403.

## Bugs visuais corrigidos

- **Celular, cronômetro rodando:** a caixa vazava do topo fixo — o "Parar"
  ficava por cima do título e o nome e o tempo sumiam (texto claro sobre fundo
  claro). Agora cabe na própria linha do topo.
- **Celular, telas curtas** (Tarefas, Documentos, Feriados, Processos): um vão
  vazio enorme entre o topo e o título.
- **Celular, Membros e Feriados:** a página inteira rolava para o lado — o
  rótulo invisível "Ações" da tabela escapava da área de rolagem.
- **Membros:** o nome de cada membro estava quase invisível (estilo da lateral
  escura reaproveitado na tabela clara), e as descrições longas dos níveis
  espremiam a tabela. Agora: rótulos curtos (a descrição completa aparece ao
  passar o mouse) e o diálogo de edição em grupos.
- **Folha A4 cortada** no gerador, no documento salvo e no relatório; agora
  encolhe para caber na coluna (no celular, até 55%, depois rola).
- **Relatório de atividades:** "Duraçã/o" quebrado no meio da palavra, número
  do processo quebrado no hífen, "Tempo por membro" sem marcadores.
- **Prestação de contas:** a linha com pagamento ficava mais alta que as outras.
- **Filtros:** campos de data 2 px desalinhados dos demais.
- **Tarefas:** iniciais do responsável fora do centro do quadrado.
- **Intimações:** botões esticados até a altura do card.
- **Agenda no celular:** "Segunda, 5 De Outubro" → "Segunda, 5 de outubro".
- **Indicadores:** com três números no celular, sobrava uma célula cinza vazia.
- **Agenda:** o dia de feriado ficava cinza-escuro, parecendo bloqueado; agora
  tem um tom quente leve (o destaque não impede marcar).
- **Detalhe do compromisso:** onze botões misturados → três fileiras (situação
  do atendimento; editar, Google, lembrete, declaração; histórico e cancelar).
- **Contato → Abrir:** rótulos e valores empilhados → duas colunas, com a
  mensagem recebida destacada.
- Caixas de marcar sem espaçamento (participantes, advogados); "· Completar o
  cadastro" solto numa linha; lista "De onde vêm os contatos" sem respiro.

## Código

- **Legibilidade.** Cerca de 25 arquivos novos estavam escritos "comprimidos" —
  linhas de até 400 caracteres, várias instruções por linha, sem espaços —,
  muito diferente do resto do projeto e difícil de revisar antes do commit.
  Foram reescritos no estilo do projeto, com comentários dizendo o porquê.
  O mesmo nas cinco migrações SQL mais densas (`clientes_processos`,
  `documentos`, `atualizacoes`, `tarefas_prazos`, `intimacoes`), sem mudar
  regra nenhuma. `scripts/testar-local.mjs` e o painel `/__teste` também.
- **Núcleo sem regra de módulo.** `nucleo/supabase.js` tinha uma lista fixa de
  tabelas que atualizavam os contadores do menu. Agora o cliente só avisa onde
  gravou (`fhl:gravou`) e `nucleo/avisos-do-dia.js` decide.
- **CSS:** o bloco novo foi organizado por seção, usando os tokens do sistema
  (sem cores soltas) e o raio de canto da marca; uma regra duplicada de avatar
  saiu; as regras de impressão ficaram juntas.
- **Testes novos:** êxito vazio, estrutura da ficha, nomes das declarações e
  cronômetro aberto fora do total; resposta a contato por canal.

Arquivos de dados fictícios da prévia (`scripts/local/*.mjs`) e os testes SQL
continuam no formato em que foram escritos: são ferramenta de teste, e mexer
neles não muda o que vai ao ar.

## Pontos de atenção — não mudei, decidir antes de publicar

1. **Um push na main publica na hora** (Vercel). O frontend novo já pede as
   colunas novas ao abrir (`membros.acesso_clientes`…): publicado antes das
   migrações, **a área dos advogados inteira deixa de abrir** e o formulário do
   site cai no erro (com a alternativa do WhatsApp). Ordem: aplicar as oito
   migrações → configurar `CONTATO_SAL` → publicar `receber-contato` → só
   então commit/push. Ou commitar numa branch, que gera só prévia.
2. **A API simulada não confere nomes de coluna** — foi por isso que o bug 1
   passou nos 93 fluxos. Antes de publicar, vale repetir a checagem de colunas
   contra o esquema.
3. **Limite por IP do formulário** usa o cabeçalho `x-real-ip` /
   `x-forwarded-for`. Se o gateway do Supabase não sobrescrever esse
   cabeçalho, quem quiser pode variar o IP declarado; o teto global de 30
   envios por hora continua valendo. Conferir no ambiente real.
4. **Prazo gerado de uma intimação copia o teor para a descrição da tarefa**, e
   tarefas são lidas por todos os membros (de propósito: quem recebe precisa
   ler). Intimação em si continua restrita a quem tem Prazos. Confirmar com o
   escritório se está bom assim.
5. Continuam pendentes como antes: revisão dos textos jurídicos (§7.8), dados
   `[CONFIRMAR]`, conferência do `.doc` no Word e do `.ics` no Google,
   contagem automática de prazos, DJEN e feriados nacionais.

## Como repetir a verificação

```bash
npm run sistema:test
npm run check
npm run testar:local
```

O banco de teste local é montado em PostgreSQL via PGlite por
`.local/validar-banco.mjs` (fora do Git). Os roteiros de navegador ficam em
`.local/testar-*.mjs`; eles restauram os dados fictícios ao começar — rode-os
numa prévia separada (`PORT_TESTE`), não na que você estiver usando.
