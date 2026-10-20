# Preparação — pedidos dos advogados (grupo "Site e Identidade Visual")

**19/10/2026.** Base: `diagnostico_tecnico_pedidos_advogados.md` (Área de
Trabalho) conferido contra o código atual. Este arquivo diz o que fazer, em
que ordem, em quais arquivos, e onde o diagnóstico erra. Ponto de partida
medido antes: `npm run sistema:test` 152/152.

> **Situação (19/10/2026, mesmo dia): Lotes 1, 2 e 3 implementados**, a
> pedido do Ithalo. Diferenças em relação ao plano abaixo, e por quê:
>
> - **Uma migração só** (`20261019120000_honorarios_misto_repasse`), não
>   duas: as funções que os dois lotes mudam (`criar_contrato`,
>   `apurar_exito`, `renegociar`, `v_parcelas`, `v_contratos`…) ficam
>   definidas uma vez, sem uma reescrever a outra.
> - **D9 não aplicada:** o domínio está sendo ajustado pelo Ithalo; `DOMINIO`
>   continua como estava. Lote 4 (fotos, SMTP, Google, domínio) também fica
>   para quando ele trouxer o material.
> - **Êxito puro:** a apuração também grava `valor_exito` (igual ao
>   `valor_total`), e os já apurados ganharam o valor e a data na migração.
>   "Já foi apurado" passa a valer pela data da apuração.
> - **Em atraso:** parcela de acordo atrasada é dívida da parte contrária;
>   aparece marcada e fica fora da mensagem de cobrança ao cliente (não
>   estava no plano).
> - **Recibo de acordo:** diz que o escritório recebeu como procurador do
>   cliente e separa honorários da parte do cliente (texto a revisar).
>
> Verificação: 503/503 SQL (50 novas), 157/157 JS, `npm run check` com 19
> páginas, prévia clicada (acordo, repasse, apuração em acordo, encadeado,
> documentos) e capturas em 1366, 1440 e 390 sem transbordamento.
> As perguntas do §7 continuam abertas: o que está lá foi feito pela
> recomendação.
>
> **Respostas dos advogados (20/10/2026)** às perguntas 1 e 2 do §7, já no
> sistema (migração `20261020120000_acordo_direto_encargos`):
>
> 1. *"Depende muito do processo, mas na maioria das vezes sim"* (o dinheiro
>    do acordo cai na conta do escritório). O caso comum já era o do sistema.
>    Para os outros, o recebimento de parcela de acordo pergunta **como a
>    parte contrária pagou**: tudo na conta do escritório (repassa-se a parte
>    do cliente) ou **a parte do cliente direto a ele** — aí entra no caixa só
>    a parte do escritório, sem repasse. O último jeito usado no contrato já
>    vem marcado. Se o processo inteiro for assim, também dá para lançar só os
>    honorários, sem marcar acordo.
> 2. *"Depende do caso; tem cliente que acertamos 50% quando não há
>    honorário inicial"*. A cota do acordo já era por contrato (50% funciona).
>    D3 vira opção: **cota do escritório em multa e juros**, própria, em Novo
>    contrato (acordo) e em Apurar êxito (acordo). Vazia = a mesma do acordo.

---

## 0. O que o diagnóstico aborda (lista breve)

**Precisam de código**
1. **Contrato "fixo + êxito"** no Financeiro — hoje é um *ou* outro; o
   contrato em Word já tem a modalidade mista.
2. **Contrato que começa quando outro termina** — data futura já se põe à
   mão; falta o atalho "começar depois do contrato X".
3. **Acordo parcelado com repasse ao cliente** — parcelas e alertas já
   existem; falta separar a parte do escritório da parte do cliente.
4. **Áreas Criminal e Imobiliário no site** — Guilherme no Imobiliário,
   Vinícius no Criminal.
5. **E-mail novo: `contato@advocaciafl.com.br`** — no site, no rodapé e nos
   documentos.

**Já existem — só explicar ou esperar material**
6. Editar áreas pelo painel — não existe, de propósito (áreas moldam o site).
7. Fotos da equipe — código pronto, faltam as fotos (sem IA).
8. Modelos de documento com a logo — prontos.
9. Login individual por advogado — existe.
10. Busca de cliente em "Conferir intimação" — o botão **Novo** cadastra na hora.
11. Google Agenda — botão "Pôr no Google Agenda" e `.ics` prontos;
    sincronização automática é opcional.

---

## 1. Onde o diagnóstico erra (e o que muda no trabalho)

| # | O diagnóstico diz | O código diz | Consequência |
|---|---|---|---|
| a | Metas com "**Belém — PA**" | O escritório é em **Paranaguá — PR** | Usar Paranaguá em todas as descrições |
| b | Textos das áreas novas com `intro: [..]`, `itens: [{titulo, texto}]`, `quando: [..]` | `src/data/areas.mjs` usa `intro` texto, `itens` = 6 frases curtas, `quando` texto | O formato dele quebraria a página (`[object Object]`). Textos reescritos no formato certo (§3.2) |
| c | `npm run og` gera `atuacao-criminal.png` | `og.mjs` só gera cartões de **artigos e campanhas** | Áreas usam o `og.png`, que **lista as áreas** (`scripts/marca.mjs:70`) → rodar `npm run marca` |
| d | `criar_contrato` "zera `exito_pct`" e valida tipo (linhas 268/290) | Não faz isso; quem barra é o `CHECK` da tabela. `apurar_exito` só existe em `20260915194302_financeiro.sql:747` | Linhas citadas não existem; o plano abaixo usa as definições vigentes |
| e | Êxito apurado em contrato misto precisa de numeração nova | `apurar_exito` já numera a partir de `max(numero)+1` | Nada a fazer nisso |
| f | Placeholders `nome@fonsecalisboa.com.br` em `sistema/index.html` e `membros.js` | Não existem | O e-mail mora só em `escritorio.js` (+ domínio padrão e documentação) |
| g | 8 modelos incluem substabelecimento, notificação, renúncia JEF | Os 8 reais: procuração, contrato de honorários, hipossuficiência, declaração de endereço, declaração de comparecimento, ficha de atendimento, renúncia, prestação de contas (+ recibo e relatório de atividades) | Corrigir antes de mostrar ao Guilherme |
| h | Membros tem "Criar acesso" com senha | Tem **Enviar convite** (precisa de SMTP) ou criação manual no painel do Supabase | O e-mail novo destrava o convite (§5.2) |
| i | Formulário de contato lista as áreas | Não lista | Nada a fazer |
| j | Só `atuacao.mjs` e `home.mjs` citam "4 áreas" | Também `escritorio.mjs` (3 lugares) e `publicacoes.mjs:160` | Incluídos no §3.2 |
| k | — | O pin de Atuação da home tem rolagem fixa de 300% (`assets/js/home.js:135`) | Com 6 áreas cada uma ficaria com metade do tempo; ajustar |
| l | Repasse por `cota_escritorio_pct` no **contrato** | Num contrato misto a parte fixa é 100% do escritório e a de êxito (acordo) não | A cota vai na **parcela** (§4.3, D2) |
| m | No misto, somar o êxito apurado em `valor_total` | O gatilho proíbe mudar `valor_total` com parcelas ativas, e o contrato em Word usa `valor_total` como "valor fixo" | Êxito apurado em coluna própria `valor_exito` (D1) |

---

## 2. Decisões tomadas por recomendação — confirmar com o Vinícius

Seguem a regra da casa: sem resposta, implementa-se a recomendação, marcada
"a confirmar".

| | Decisão | Por quê |
|---|---|---|
| **D1** | Misto: `valor_total` = parte fixa; o êxito apurado vai para `valor_exito` | Não afrouxa a trava "valor total não muda"; o Word continua mostrando o fixo certo; o plano (`v_contratos_plano`) fecha somando os dois |
| **D2** | Cota do escritório **por parcela** (padrão 100%) | Cobre o misto cuja parte de êxito é um acordo bruto; contratos atuais ficam 100%, sem mudança |
| **D3** | Multa e juros pagos com atraso no acordo dividem na **mesma proporção** da cota | **Respondido 20/10:** depende do caso — virou cota própria opcional (vazia = a mesma) |
| **D4** | "Recebido" continua sendo o dinheiro que entrou (bruto, bate com o banco). **Honorários** = bruto − repasse. Divisão entre sócios usa honorários | Separa caixa de receita; nada infla a divisão |
| **D5** | O repasse feito ao cliente é **saída própria**, nunca despesa | Despesa baixaria o resultado duas vezes; e reter valor do cliente é infração (art. 34, XXI, EAOAB) — o sistema deve lembrar do repasse pendente |
| **D6** | Encadeado: sugere a 1ª parcela no **mês seguinte ao último vencimento** do contrato anterior (ou ao fim da vigência, se informada); a pessoa pode mudar | É o que o Vinícius descreveu; a data continua editável |
| **D7** | Criminal = 05, Imobiliário = 06 (no fim da lista) | Não renumera as páginas atuais |
| **D8** | Cível cede "Posse, propriedade e usucapião" e "Locação" ao Imobiliário | Evita duas páginas prometendo o mesmo. **Guilherme decide** |
| **D9** | Domínio padrão do build passa a `advocaciafl.com.br` (fora da Vercel) | O e-mail indica que o domínio é deles; na Vercel nada muda até `SITE_URL`. **Confirmar** |

---

## 3. Lote 1 — Site e e-mail (sem migração; o push já publica)

### 3.1 E-mail `contato@advocaciafl.com.br`

1. `sistema/js/escritorio.js:11` → `EMAIL = 'contato@advocaciafl.com.br'`; o
   comentário passa a "confirmado pelo Vinícius no grupo, out/2026".
2. Propaga sozinho (nenhuma outra edição): menu e rodapé
   (`src/layouts/shell.mjs:165, 211`), contato (`src/partials/contato.mjs:19, 39`),
   Política e Termos (`src/pages/juridico.mjs:67, 77`), JSON-LD
   (`src/lib/seo.mjs:104`), rodapé de todo documento novo e do recibo
   (`sistema/js/documentos/partes.js:99`).
3. (D9) `src/data/site.mjs:48`: padrão `https://advocaciafl.com.br`, com
   `[CONFIRMAR]`; ajustar o comentário das linhas 39–45.
4. Documentação: `README.md:434–436` (pendência 4: e-mail resolvido, domínio
   a confirmar), `CLAUDE.md:245–246` (§7) e a pergunta 1 do §10.
5. **Não mexer:** documentos já salvos guardam o rodapé antigo — o texto
   salvo é imutável, de propósito. A produção ainda é de demonstração; se
   algum for real, gera-se de novo. Dados fictícios `@example.test` ficam.
6. Conferir: `git grep fonsecalisboa -- src sistema scripts` sem resultado.

### 3.2 Áreas Criminal e Imobiliário

**Arquivos**

| Arquivo | Mudança |
|---|---|
| `src/data/areas.mjs` | Acrescentar os dois objetos abaixo. (D8) Cível: trocar os itens 5 e 6 e o resumo (abaixo). Atualizar o comentário do topo |
| `src/data/equipe.mjs:23` | Guilherme: `['civel', 'consumidor', 'imobiliario']` |
| `src/data/equipe.mjs:55` | Vinícius: `['trabalhista', 'previdenciario', 'criminal']` |
| `src/pages/atuacao.mjs:22–24` | "Seis frentes de atuação" · "Trabalhista, previdenciário, consumidor, cível, criminal e imobiliário: as questões que mais chegam ao escritório, do fim de um contrato de trabalho à compra de um imóvel." |
| `src/pages/atuacao.mjs:40` | "Direito Trabalhista, Previdenciário, do Consumidor, Cível, Criminal e Imobiliário em Paranaguá — PR." |
| `src/pages/home.mjs:285–286` | "…em Paranaguá. Direito Trabalhista, Previdenciário, do Consumidor, Cível, Criminal e Imobiliário." |
| `src/pages/escritorio.mjs:10–11, 55–56` | Acrescentar "criminal e imobiliária" às duas listas |
| `src/pages/escritorio.mjs:32–35` | "Além das seis áreas principais, a equipe atua em família e sucessões, direito ambiental, regularização fundiária e direito portuário — este último, natural para um escritório em Paranaguá." |
| `src/pages/publicacoes.mjs:160` | Lista das seis áreas |
| `sistema/js/telas/site/base.js:22–27` | `{ slug: 'criminal', nome: 'Direito Criminal', curto: 'Criminal' }`, `{ slug: 'imobiliario', nome: 'Direito Imobiliário', curto: 'Imobiliário' }` — campanha e publicação passam a aceitá-las. O banco não tem CHECK em `area` (`20260916120520_conteudo.sql:118, 223`): sem migração |
| `assets/js/home.js:135` | `end: '+=' + items.length * 75 + '%'` (75vh por área, como hoje); trocar "300vh" nos comentários de `home.js:109`, `home.mjs:97` e `sections.css:161` |
| `assets/img/og.png` | `npm run marca` (o rótulo lista as áreas). Conferir no `git diff` que só o `og.png` mudou e que o rótulo cabe no cartão; se não couber, abreviar em `scripts/marca.mjs:70` |
| `README.md` | "As 4 áreas" → 6; "17 páginas" → 19; §"Ressalva: áreas do site vs. áreas da equipe" |
| `CLAUDE.md` §7 | Linha "Áreas de atuação": Criminal e Imobiliário entram; Portuário segue fora |

Sai sozinho: as duas páginas novas, sitemap, rodapé, "Outras áreas",
"Quem atende", contador "6 áreas" e `knowsAbout` do JSON-LD.

**Textos — no formato de `areas.mjs`** (revisão: Vinícius o criminal,
Guilherme o imobiliário; conferidos contra o Provimento 205: sem promessa,
superlativo ou resultado)

```js
  {
    slug: 'criminal',
    num: '05',
    nome: 'Direito Criminal',
    resumo:
      'Defesa em inquérito policial e ação penal, prisão em flagrante, ' +
      'audiência de custódia, habeas corpus e recursos.',
    intro:
      'No processo penal, boa parte do caso se define nos primeiros atos: o ' +
      'depoimento na delegacia, a audiência de custódia, a forma como a prova ' +
      'foi colhida. Por isso a defesa técnica começa cedo — pelo que já está ' +
      'nos autos, com orientação clara a quem é investigado e à família.',
    itens: [
      'Acompanhamento em delegacia e inquérito policial',
      'Prisão em flagrante e audiência de custódia',
      'Liberdade provisória, revogação de prisão e habeas corpus',
      'Defesa em ação penal e no Tribunal do Júri',
      'Acordo de não persecução penal e transação penal',
      'Recursos criminais e assistência de acusação',
    ],
    quando:
      'Ao receber intimação para depor, antes de comparecer; logo depois de ' +
      'uma prisão ou de um mandado de busca; e assim que chegar a citação. Os ' +
      'prazos da defesa são curtos, e o que se diz no primeiro depoimento ' +
      'acompanha o caso até o fim.',
  },
  {
    slug: 'imobiliario',
    num: '06',
    nome: 'Direito Imobiliário',
    resumo:
      'Compra e venda, análise de documentos do imóvel, locação, distrato, ' +
      'usucapião e regularização registral.',
    intro:
      'O imóvel costuma ser o maior patrimônio de uma família ou de uma ' +
      'empresa, e o problema quase sempre nasce antes da assinatura: matrícula ' +
      'com pendência, vendedor com dívida, contrato que não diz o que as ' +
      'partes combinaram. Atuamos na prevenção — conferindo documentos e ' +
      'redigindo contratos — e no conflito, quando ele já existe.',
    itens: [
      'Análise de matrícula, certidões e documentos antes da compra',
      'Contratos de compra e venda, permuta e promessa',
      'Locação residencial e comercial, despejo e renovatória',
      'Atraso na entrega de obra e distrato com construtora',
      'Usucapião judicial e extrajudicial',
      'Regularização de imóvel, escritura e registro',
    ],
    quando:
      'Antes de assinar o contrato ou dar o sinal, quando ainda dá para ' +
      'conferir a matrícula e mudar o texto. E assim que surgir o atraso, a ' +
      'inadimplência ou a disputa sobre a posse — documento reunido cedo vale mais.',
  },
```

(D8) Cível: `resumo` → "Contratos, cobranças, indenizações, responsabilidade
civil e assessoria preventiva."; itens 5 e 6 → "Assessoria preventiva e
notificações extrajudiciais" e "Obrigações de fazer e tutelas de urgência".
Se o Guilherme preferir manter, basta não aplicar.

### 3.3 Verificar e publicar o Lote 1

- `npm run build` e `npm run check` (19 páginas, sem link quebrado).
- Chrome headless (memória `referencia-capturas-headless`): home em
  1440×900 **e 1366×768** — as 6 áreas da lista do pin precisam caber na
  altura; se não couberem, reduzir `.atuacao__item` com `@media (max-height: …)`.
  Celular 390×844: pilha das 6. Páginas `atuacao/criminal.html` e
  `atuacao/imobiliario.html` com "Quem atende". Rodapé com 6 links. Um
  documento gerado na prévia mostrando o e-mail novo no rodapé.
- Publicação: commit aprovado → push na `main` (publica na hora).

---

## 4. Financeiro — Lotes 2 e 3 (cada um com uma migração nova)

Regras que valem para os dois:
- Migração **nova** (`supabase migration new …`), nunca editar as aplicadas.
- `create or replace view` só acrescenta colunas **no fim**; expressões das
  existentes podem mudar.
- Colunas novas sem GRANT de UPDATE para `authenticated`: só as funções
  gravam. Toda RPC nova confere a permissão na 1ª linha e ganha
  `revoke … from public, anon` / `grant … to authenticated`.
- Contrato e parcela antigos não mudam de valor nem de situação
  (testar com `supabase/testes/migracao/`).
- **Ordem de publicação:** `supabase db push` da migração → push do
  frontend. O frontend novo não abre sem as colunas novas.

### 4.1 Lote 2 — Honorários mistos (pedido 1) e contrato encadeado (pedido 2)

**Migração `…_honorarios_misto.sql`**

1. `contratos`: trocar o CHECK de `tipo_honorario` (nome provável
   `contratos_tipo_honorario_check` — confirmar em `pg_constraint`) para
   `('fixo', 'exito', 'misto')`; `contrato_fixo_tem_valor` →
   `tipo_honorario not in ('fixo','misto') or valor_total is not null`;
   `contrato_exito_tem_percentual` → `tipo_honorario not in ('exito','misto') or exito_pct is not null`
   (hoje em `20260915194302_financeiro.sql:125, 143–144`).
2. Colunas novas em `contratos`: `valor_exito numeric(12,2) check (valor_exito > 0)`,
   `exito_base numeric(12,2)` (quanto o cliente recebeu — memória da
   apuração), `exito_apurado_em timestamptz`, `exito_apurado_por uuid`,
   `inicia_apos_contrato_id uuid references public.contratos (id)` com
   `check (inicia_apos_contrato_id <> id)`.
3. `parcelas.parte text not null default 'fixo' check (parte in ('fixo','exito'))`.
4. Carga dos antigos (gatilhos desligados e `auditoria` "migrou", como em
   `20261008120300_contratos_integridade.sql:79–105`): contratos `exito` com
   parcelas ganham `exito_apurado_em` = criação da 1ª parcela e
   `valor_exito = valor_total`; as parcelas deles ficam `parte = 'exito'`.
5. `privado.validar_contrato()` (`contratos_integridade.sql:110`): `valor_exito`,
   `exito_base` e `exito_apurado_em` só passam de nulo a preenchido, uma vez.
6. `public.criar_contrato` (`contratos_integridade.sql:189`): aceitar `misto`;
   exigir parcelas e soma = `valor_total` para `fixo` **e** `misto`
   (linhas 213 e 265); exigir `exito_pct` em `exito`/`misto` e gravá-lo **só**
   nesses; aceitar `inicia_apos_contrato_id` se for do mesmo cliente e não
   cancelado.
7. `public.apurar_exito` (`financeiro.sql:747`): aceitar `exito` e `misto`;
   recusar se `exito_apurado_em` já existe; parcelas novas com
   `parte = 'exito'`; em `exito`, segue gravando `valor_total` (como hoje)
   e também `valor_exito`; em `misto`, grava só `valor_exito` — `valor_total`
   não muda, e o gatilho não precisa de exceção. Grava `exito_base`,
   `exito_apurado_em/por`.
8. `public.renegociar` (`financeiro.sql:794`): parcelas novas herdam
   `parte = 'exito'` quando todas as renegociadas forem de êxito.
9. `v_contratos_plano` (`contratos_integridade.sql:431`): valor contratado =
   `valor_total + (case when tipo_honorario = 'misto' then coalesce(valor_exito, 0) else 0 end)`.
10. `v_contratos` (`contratos_integridade.sql:495`): `situacao`/`rotulo` dão
    `a_apurar` também ao misto com a parte fixa quitada e o êxito pendente
    (assim não se arquiva — `arquivar_contrato` já barra `a_apurar`).
    Colunas no fim: `valor_exito`, `exito_base`, `exito_apurado_em`,
    `inicia_apos_contrato_id`, `exito_pendente boolean`,
    `ultimo_vencimento date` (maior vencimento das parcelas ativas — base do
    encadeado).
11. `v_parcelas`: coluna `parte` no fim.
12. `privado.parcela_vigente` (`20261008120400_fechamento_anual.sql:206`):
    `when c.tipo_honorario = 'exito'` → `when p.parte = 'exito'`;
    `posicao_financeira_em` (linha 247): `a_apurar` também para misto com fixo
    quitado e êxito apurado depois do corte.
13. Importação (`20261008120900_importacao.sql:380`) continua só `fixo`: misto
    entra pela tela.

**Frontend**

| Arquivo | Mudança |
|---|---|
| `sistema/js/telas/comum.js:161` | `misto: 'Fixo + êxito'` (Histórico pega sozinho) |
| `telas/financeiro/contrato-novo.js:59–60` | 3ª opção: "Valor fixo + êxito no fim do processo" |
| `contrato-novo.js:62, 116, 231–233` | `data-tipo="fixo misto"` e `"exito misto"`; mostrar com `split(' ').includes(tipo)`; texto do êxito para misto: "a parte fixa gera as parcelas agora; o êxito fica a apurar" |
| `contrato-novo.js:280–330` (`montar`) | Misto valida e envia os dois: `valor_total`, `parcelas`, `entrada_recebida` e `exito_pct` |
| `contrato-novo.js:171` (encadeado) | Usar `ligarCampoCliente(form, clientes, { aoMudar })`: buscar em `v_contratos` os do cliente com `ciclo = ativo` e `situacao in (ativo, a_apurar)`. Se houver, aviso acima do vencimento: "C003/2026 — Honorários trabalhista: última parcela em 15/12/2026. **Começar depois dele**". O botão põe a data (D6) — com entrada, a entrada recebe a data e a 1ª parcela um mês depois —, regera a prévia e guarda `inicia_apos_contrato_id` num campo oculto, com "desfazer". Data calculada por função pura nova em `dominio/parcelas.js` (`inicioDepoisDe({ ultimo_vencimento, data_fim })`, usando `somarMeses`) |
| `telas/financeiro/contrato.js:217` | "Apurar êxito" quando `c.exito_pendente` (não mais só `situacao === 'a_apurar'`) |
| `contrato.js:237–239` | Indicador do misto: "R$ 3.000,00 + 30% de êxito (a apurar)" ou "+ êxito apurado R$ X" |
| `contrato.js:262–289` e `dominio/parcelas.js:99` (`posicoes`) | Agrupar também por `parte`: "Êxito 1 de 3" separado de "1 de 10" |
| `contrato.js:224` | "Começa depois de C003/2026" com link, quando houver |
| `contrato.js:508` (`apurarExito`) | Texto para misto ("Além da parte fixa…") |
| `telas/financeiro/contratos.js:28, 72` | Filtro "Êxito a apurar" passa a `exito_pendente = true` |
| `contratos.js:139, 177–178` | Lista e exportação: "Fixo + 30% êxito" |
| `telas/documentos/novo.js:59–61` | `modalidade` já passa `misto`; corrigir `data_contrato` para `c.data_contrato ?? hoje(new Date(c.criado_em))` (hoje usa a data do cadastro) |
| `documentos/modelos.js:100` | Tabela do contrato de honorários só com parcelas `parte !== 'exito'` |
| `modelos.js:109` | Prestação de contas: "êxito a apurar" também com `exito_pendente` |
| `scripts/local/semente.sql` | Um contrato misto e um encadeado fictícios para a prévia |

**Testes** — `supabase/testes/honorarios-misto.sql` (o `banco:test` já
descobre arquivos novos): criar misto; misto sem % / sem parcelas / soma
errada recusados; apurar misto com parcelas fixas ativas; numeração
continua; `valor_total` intacto e `diferenca_plano = 0`; apurar duas vezes
recusado; fixo quitado + êxito pendente = `a_apurar` e não arquiva;
êxito puro e fixo antigos iguais depois da carga; `parcela_vigente` com
`parte`; encadeado de outro cliente ou cancelado recusado; permissões de
secretária e consulta como hoje. JS: `inicioDepoisDe` (fim de mês, data_fim),
`posicoes` por parte. Prévia: criar misto → receber → apurar → gerar contrato
Word (cláusula mista) → prestação de contas; criar encadeado.

### 4.2 Lote 3 — Acordo com repasse ao cliente (pedido 3)

**Como fica para quem usa:** acordo de R$ 15.000 (entrada R$ 5.000 + 10 ×
R$ 1.000), escritório com 30%. Cada parcela cobra o bruto (é o que a parte
contrária deve; atraso e alerta pelo bruto). Ao receber R$ 1.000, a tela
mostra "Escritório R$ 300,00 · Repasse ao cliente R$ 700,00". O repasse fica
**pendente** até alguém registrar "Repasse feito" (data, conta, comprovante).
Fechamento e divisão usam os R$ 300.

**Migração `…_acordo_repasse.sql`**

1. `parcelas.cota_escritorio_pct numeric(5,2) not null default 100 check (cota_escritorio_pct > 0 and cota_escritorio_pct <= 100)` —
   gravada só por `criar_contrato` (campo `cota_escritorio_pct` do contrato,
   aplicado às parcelas) e por `apurar_exito` (acordo bruto, cota sugerida =
   `exito_pct`). `renegociar` herda a cota; parcelas com cotas diferentes não
   se renegociam juntas.
2. `recebimentos.valor_repasse numeric(12,2) not null default 0`, com
   `check (valor_repasse between 0 and valor)`, calculado em
   `privado.validar_recebimento()` (`20261008120100_contas_financeiras.sql:177`)
   no INSERT: `valor − round(valor × cota / 100, 2)` (D3: inclui encargos).
   Avulsa = 0. Fica congelado como a memória do cálculo.
3. Tabela `repasses_cliente` (molde: `pagamentos_despesa`): `recebimento_id`,
   `valor` (= `valor_repasse`), `data`, `conta_financeira_id`, `forma_id`,
   `observacao`, estorno com motivo; `privado.aplicar_padrao()`, RLS,
   índice único parcial (um ativo por recebimento), mês aberto. RPCs
   `registrar_repasse(p jsonb)` e `estornar_repasse(p_id, p_motivo)`.
   Comprovante: anexos do próprio recebimento (sem mexer em `anexos`).
4. Estorno de recebimento com repasse ativo: recusar ("estorne o repasse
   antes") — em `privado.registrar_estorno()`.
5. `v_movimentacoes_financeiras` (`20261008120200_pagamentos_despesa.sql:765`):
   perna `repasse_cliente`, saída. `v_saldos_contas` passa a refletir.
6. Views, colunas no fim: `v_parcelas` → `cota_escritorio_pct`,
   `valor_escritorio`, `exigivel_escritorio`, `saldo_escritorio`;
   `v_recebimentos` (`contas_financeiras.sql:368`) → `valor_repasse`,
   `valor_escritorio`, `repasse_id`, `repassado_em`, `repasse_situacao`
   (`nao_se_aplica` / `pendente` / `feito`); `v_contratos` →
   `valor_escritorio_total`, `repasse_pendente`.
7. `previa_fechamento` (`pagamentos_despesa.sql:826`): totais ganham
   `repasses`, `honorarios` (= entradas − repasses) e `repasses_feitos`;
   **`resultado = honorarios − saidas`** (linha 856) e a base da divisão usa
   honorários (linha 893). Pendências: `repasses_pendentes` e valor.
   Meses já fechados guardam a foto antiga, sem essas chaves — a tela trata
   a ausência como zero. Como não há acordo lançado, nenhum resultado passado
   muda.
8. `previa_fechamento_anual` (`fechamento_anual.sql:263`): repasses do ano em
   subconsulta própria; `saldo_realizado` sobre honorários. `serie_mensal`
   fica como está (caixa bruto) — evita derrubar e recriar a função.
9. `resumo_financeiro` (`20261008120500_resumo_relatorios.sql:22`):
   indicadores `repasses_clientes` e `honorarios_recebidos`,
   `receita_prevista_escritorio`; `saldo_previsto` e `saldo_realizado` pela
   parte do escritório; série com `repasses`; `regra` com data nova. A soma
   da lista de detalhe continua igual ao indicador, no centavo.
10. `pendencias_financeiras` (`20261008120700_alertas.sql:21`): "repasse a
    fazer" — avisa, não envia.

**Frontend**

| Arquivo | Mudança |
|---|---|
| `contrato-novo.js` (bloco fixo) | Caixa "Acordo ou valor recebido em nome do cliente (há repasse)" → "Valor total" vira "Valor bruto do acordo", aparece "Cota do escritório (%)" e o resumo ao vivo "Bruto · Escritório (30%) · Repasse (70%)"; coluna "Escritório" na prévia das parcelas |
| `contrato.js:508` (`apurarExito`) | Opção "Lançar o acordo inteiro (a parte contrária paga ao escritório)": valor bruto, entrada e data, parcelas e 1º vencimento, cota = `exito_pct` |
| `telas/financeiro/base.js` (`receberParcela`) | Mostrar a divisão antes de confirmar; depois, "Registrar o repasse agora?" |
| `contrato.js:292–327` | Recebimentos: "Repasse R$ 700,00 — pendente · Registrar" / "feito em 10/11, Conta X · Estornar" |
| `telas/financeiro/recebiveis.js:67–68` | Botão "+ Novo contrato ou acordo" (`#/financeiro/contratos/novo`); legenda "Escritório R$ · Cliente R$" quando cota < 100 |
| `fechamento.js:139–152, 225–231` | Entradas (bruto) · Repasses a clientes · Honorários · Saídas · Resultado; mesmo na planilha |
| `painel.js`, `relatorios.js` | Indicadores e colunas novos; relatório de recebimentos com escritório/repasse e filtro de repasse pendente |
| `contas-financeiras.js` | Rótulo da perna "Repasse ao cliente" |
| `inicio.js` (Financeiro do Hoje) | "Repasses a fazer: N (R$ X)" |
| `documentos/novo.js` + `modelos.js` (prestação de contas) | `valor_repassado` preenchido pelos repasses feitos; tabela bruto/honorários/repasse |
| `historico.js`, `nucleo/erros-banco.js` | Rótulos e mensagens das colunas e restrições novas |
| `scripts/local/semente.sql` | O acordo do exemplo, com um recebimento repassado e outro pendente |

**Testes** — `supabase/testes/acordo-repasse.sql`: centavos (R$ 1.000 × 30%
= 300/700; R$ 333,33 × 30% arredondado), encargos na proporção, fechamento e
divisão pela parte do escritório, saldo da conta = bruto − repasse feito,
repasse em mês fechado recusado, estorno de recebimento com repasse ativo
recusado, estorno do repasse volta a pendência, cota fora de 0–100 recusada,
renegociação mantém cota, misto com fixo 100% e êxito 30%, permissões
(secretária lança, consulta só lê). JS: divisão em centavos no domínio.
Prévia: lançar o acordo → receber 2 parcelas → repassar 1 → fechar o mês →
conferir divisão e saldo da conta.

---

## 5. Lote 4 — Depende de material ou de conta (não avança sozinho)

1. **Fotos (pedido 7).** Quando chegarem: `assets/img/equipe/<slug>.jpg`,
   recorte 4:5, ~900×1125, JPG ≤ 150 KB; preencher `foto` em
   `src/data/equipe.mjs`. Aproveitar para pôr `width`/`height` no `<img>` de
   `retrato()` (`src/partials/equipe.mjs:16`) e evitar salto de layout.
   Conferir home, equipe, páginas de área e fim de artigo.
2. **SMTP com o e-mail novo (destrava "Enviar convite" e "Esqueci a
   senha").** Supabase → Authentication → SMTP, remetente
   `contato@advocaciafl.com.br`. Com Google Workspace: `smtp.gmail.com:587` e
   senha de app; sem Workspace, Resend ou Brevo grátis, com SPF/DKIM no DNS.
   Custo R$ 0 além da caixa de e-mail. A senha é do Ithalo — não passa por
   aqui. Depois, testar um convite real.
3. **Google Agenda automático (pedido 11, opcional).** A conta existe agora.
   Recomendação: só sistema → Google, pela Calendar API com conta de
   serviço; o escritório compartilha as 4 sub-agendas com o e-mail dela
   ("fazer alterações nos eventos"); função de borda chamada depois de
   salvar o compromisso grava o evento na sub-agenda do advogado (particular
   vira "Ocupado") e preenche as colunas `google_*` já reservadas
   (`20260915195203_agenda.sql:63–65`). Custo R$ 0. Feed `.ics` assinado é
   mais simples, mas o Google o atualiza a cada várias horas e ele não ocupa
   o link de agendamento — não serve. Google → sistema fica para depois.
   Precisa do sim do Vinícius e do compartilhamento das agendas.
4. **Domínio `advocaciafl.com.br` (se confirmado).** Domínio no projeto da
   Vercel, `SITE_URL`, Supabase Auth → Site URL e Redirect URLs com
   `/sistema`, Search Console. Antes de uso real: Vercel Pro (US$ 20/mês),
   o Hobby é não comercial.

---

## 6. Sem código — para o vídeo/tutorial

- **Conferir intimação:** a busca acha só cliente cadastrado; o botão
  **Novo**, ao lado (`sistema/js/telas/clientes.js:43`), cadastra sem sair da
  intimação e já seleciona.
- **Logins:** um por pessoa, com permissão por módulo (Membros). Até o SMTP,
  o login se cria no painel do Supabase.
- **Áreas pelo painel:** não, de propósito — elas moldam menu, rodapé e
  páginas; mudam no código (foi o que fizemos no Lote 1).
- **Modelos:** os 8 reais (§1g) já saem com a logo FL e dados do cliente e do
  sócio. Se o Guilherme mandar os textos do escritório, revisamos os modelos
  — a revisão jurídica (§7.8 da preparação de 05/10) continua pendente.
- **Agenda:** cores por advogado, filtro e conflito já existem.

---

## 7. Perguntas curtas para o Vinícius

1. ~~No acordo, o dinheiro cai na conta do escritório e vocês transferem a
   parte do cliente?~~ Respondido em 20/10: na maioria das vezes sim (ver o
   quadro no topo).
2. ~~Multa e juros de parcela do acordo paga com atraso: dividem na mesma
   proporção?~~ Respondido em 20/10: depende do caso (ver o quadro no topo).
3. O domínio `advocaciafl.com.br` é de vocês e o site vai para ele? O e-mail
   é Google Workspace? (D9, §5.2)
4. Os textos de Criminal e Imobiliário servem? O Cível cede posse e locação
   ao Imobiliário? (D8)
5. Contrato encadeado: começar no mês seguinte ao último vencimento está
   certo? (D6)

---

## 8. Ordem sugerida e verificação

| Lote | Risco | Migração | Publicação |
|---|---|---|---|
| 1 — e-mail + áreas | Baixo | Não | Commit aprovado → push |
| 2 — misto + encadeado | Médio | `…_honorarios_misto` | `db push` → push |
| 3 — acordo com repasse | Alto (mexe no fechamento) | `…_acordo_repasse` | `db push` → push, depois de fechar um mês de teste na prévia |
| 4 — fotos, SMTP, Google, domínio | — | Não (Google: função nova) | Quando houver material/conta |

Em cada lote: `npm run sistema:test`, `npm run banco:test`, `npm run build`,
`npm run check`, prévia `testar:local` na porta 8127 (a 8125 é do Ithalo)
com os perfis admin, sócia, secretária e consulta, e capturas no Chrome
headless para o site. Nada de commit sem aprovação do Ithalo.
