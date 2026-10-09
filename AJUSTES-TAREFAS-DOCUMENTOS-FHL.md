# Tarefas e Documentos — ajustes de 08/10/2026

Pedido do Ithalo: cores por prazo, voltar de "Em andamento" pelo Editar e
tabela de Tarefas sem espaços vazios; na geração de documentos, um Word
simplificado. Tudo **local, sem commit nem push**. Só frontend: **não há
migração** (o banco já aceitava voltar de `em_andamento` para `pendente`).

## Tarefas

- **Cor pela data.** Conta a data que vem primeiro — entrega ou fatal.
  Faltando **até 7 dias: amarelo**; **até 2 dias, hoje ou atrasada: vermelho**;
  mais longe: sem cor. A linha ganha faixa à esquerda e fundo leve, e a
  etiqueta diz quanto falta ("Entrega em 4 dias", "Fatal hoje", "Vence em 48 h").
  Vale em Tarefas, Prazos, ficha do cliente e no "Para hoje" da tela Hoje.
- **Voltar de "Em andamento".** O Editar ganhou o campo **Situação**
  (Pendente / Em andamento). Concluída continua saindo só por **Reabrir**,
  que pede o motivo. O atalho da lista agora se chama **Iniciar** (verbo de
  ação; o selo da linha mostra "Em andamento").
- **Tabela sem vãos.** De 7 para 5 colunas: situação e prioridade foram para
  baixo do título (prioridade só aparece quando não é a normal), "Origem"
  virou "Da intimação" / "Bloqueio na agenda" na mesma linha do ato, e as
  ações ficaram em duas fileiras fixas (Concluir/Editar; Iniciar · Cancelar ·
  Histórico). Cabe em notebook de 1280 px sem rolar para o lado; no celular
  cada tarefa vira um cartão.

## Documentos — barra de formatação

Acima da folha, em **Gerar documento**:

| Grupo | Funções |
|---|---|
| Histórico | Desfazer / Refazer (também Ctrl+Z, Ctrl+Y) |
| Texto | Estilo (Texto normal, Título, Subtítulo), Fonte (Times, Arial, Calibri, Garamond, Georgia, Courier), Tamanho (8 a 28) |
| Ênfase | Negrito, Itálico, Sublinhado, Riscado |
| Cores | Cor da fonte (9 + Automática), Realce (6 + Sem realce) |
| Parágrafo | Alinhar à esquerda, centralizar, à direita, justificar; lista com marcadores e numerada; diminuir/aumentar recuo |
| Limpar | Tira a formatação do trecho e do parágrafo |

Como no Word: com o cursor dentro de uma palavra, a cor/fonte vale para a
palavra inteira; com o cursor solto, vale para o que for digitado em seguida.
A barra mostra a fonte, o tamanho e os botões ligados do trecho selecionado.

O que se formata na tela sai **igual na impressão/PDF e no Word** e fica
gravado no documento. Tecnicamente cada formatação é uma classe `doc-*`
(a política de segurança da área bloqueia estilo inline); detalhes em
`sistema/README.md` → Notas de manutenção.

## Como ver

A prévia com dados fictícios (porta **8127**, já rodando nesta sessão):

- Tarefas com as cores: <http://127.0.0.1:8127/sistema/?perfil=admin#/tarefas?visao=todas>
- Editor: <http://127.0.0.1:8127/sistema/?perfil=admin#/documentos/novo?modelo=procuracao>

Na sua prévia da porta 8125, **reinicie** o `npm run testar:local` para pegar
o código novo. Ganhou três tarefas fictícias para mostrar as cores (duas
delegadas à Sócia — use "Mostrar: Todas").

## Verificação

- `npm run sistema:test`: **118/118** (6 testes novos: cor, etiqueta e a
  sincronia entre `formatacao.js` e `sistema.css`).
- Roteiros de navegador do projeto, todos aprovados: Contatos 12, vínculos,
  Clientes 12, Documentos/Atualizações 21, Tarefas/Intimações 12, Hoje 16,
  Agenda 18 e o de erros de 06/10.
- Roteiros novos: editor (16 cenários — cores, separar/remover cor e realce,
  fonte, tamanho, ênfases, alinhamento, recuo, listas, estilos, palavra sob
  o cursor, digitação colorida, desfazer/refazer, limpar, triplo clique,
  salvar sem `style`/`font`, Word com as regras) e tarefas (cores, largura
  em 1280 px, Iniciar → Editar → Pendente, concluída sem Situação).
- `npm run check`: 17 páginas.

Observação: desfazer uma lista num parágrafo com estilo próprio (a data do
documento) faz o Chrome registrar no console um aviso da política de
segurança; o editor limpa o resultado e não há efeito visível.

## Para publicar (aguarda sua aprovação)

`main` está igual ao `origin/main`. Como não há migração, basta commitar e
dar push na `main` — a Vercel publica site e `/sistema` juntos. Entram:
`sistema/` (CSS, telas de Tarefas/Documentos/Hoje, `documentos/editor.js`,
`documentos/formatacao.js`, lista branca, testes), `scripts/local/prazos.mjs`
(só a prévia), `sistema/README.md` e este arquivo. Ficam de fora os arquivos
que já estavam sem rastreamento (`GUIA-NOVAS-FUNCOES-FHL (2).md`,
`HANDOFF-PRODUCAO-FHL.md`, `preparacao-financeiro-docx.md`,
`relatorio-especificacao-financeira.md`).
