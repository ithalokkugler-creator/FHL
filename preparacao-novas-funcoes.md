# Preparação — Novas funções da área dos advogados

> **Leitor previsto: uma IA que vai implementar.** Uma pessoa também consegue
> ler, mas o texto foi escrito para não deixar margem: nomes exatos, ordem de
> trabalho, regras e critérios de pronto. **Leia inteiro antes de abrir
> qualquer arquivo.**
>
> **Fontes:** reunião de 11/09/2026 com o Vinícius (transcrição em
> `C:\Users\Ithalo\Desktop\Logos advogados\Advocacia contexto\audio.txt` e 168
> frames), o protótipo dele (`fhl-site-etapa6-1-estabilidade-abas-documentos-clientes.html`,
> na mesma pasta), [`CLAUDE.md`](CLAUDE.md), [`README.md`](README.md),
> [`sistema/README.md`](sistema/README.md),
> [`preparacao-area-dos-advogados.md`](preparacao-area-dos-advogados.md) e o
> estado do código e do banco em **05/10/2026**.
>
> **Escopo:** o que o escritório pediu — ou usava no protótipo — e que o
> sistema novo **ainda não tem**. Nada disto foi contratado: a fase 2 é piloto,
> nos planos gratuitos (CLAUDE.md §3).
>
> `[MM:SS]` = minuto do vídeo da reunião.

## Sumário

0. [Como trabalhar com este documento](#0-como-trabalhar-com-este-documento)
1. [As funções, em ordem](#1-as-funções-em-ordem)
2. [Regras da casa](#2-regras-da-casa)
3. [O que já existe — não refaça](#3-o-que-já-existe--não-refaça)
4. [E0 · Base: dois níveis de acesso novos](#4-e0--base-dois-níveis-de-acesso-novos)
5. [F1 · Contatos: o formulário do site chega no sistema](#5-f1--contatos-o-formulário-do-site-chega-no-sistema)
6. [F2 · Clientes e processos](#6-f2--clientes-e-processos)
7. [F3 · Documentos automáticos e ficha de atendimento](#7-f3--documentos-automáticos-e-ficha-de-atendimento)
8. [F4 · Atualizações com cronômetro](#8-f4--atualizações-com-cronômetro)
9. [F5 · Tarefas e prazos](#9-f5--tarefas-e-prazos)
10. [F6 · Intimações do DJEN (API do CNJ)](#10-f6--intimações-do-djen-api-do-cnj)
11. [F7 · Avisos do dia](#11-f7--avisos-do-dia)
12. [F8 · Agenda sem depender do Google](#12-f8--agenda-sem-depender-do-google)
13. [F9 · Calculadora de atualização (opcional)](#13-f9--calculadora-de-atualização-opcional)
14. [O que não fazer agora](#14-o-que-não-fazer-agora)
15. [Decisões tomadas por recomendação — confirmar com o Vinícius](#15-decisões-tomadas-por-recomendação--confirmar-com-o-vinícius)
16. [Testes e verificação](#16-testes-e-verificação)
17. [Documentação a atualizar](#17-documentação-a-atualizar)
18. [Custos](#18-custos)
- [Apêndice A — Texto dos modelos de documento](#apêndice-a--texto-dos-modelos-de-documento)
- [Apêndice B — API do DJEN](#apêndice-b--api-do-djen)
- [Apêndice C — Vetores de teste](#apêndice-c--vetores-de-teste)
- [Apêndice D — Glossário](#apêndice-d--glossário)

---

## 0. Como trabalhar com este documento

1. **Leia antes, nesta ordem:** `CLAUDE.md` (quem é o cliente e como ele
   pensa), `sistema/README.md` (arquitetura, segurança, notas de manutenção) e
   este documento. O `README.md` da raiz só se a etapa mexer no site público.
2. **Uma etapa por vez, na ordem da seção 1.** Cada etapa é útil sozinha e só
   termina com: testes passando, telas verificadas, documentação atualizada e
   um resumo para o Ithalo — que decide se vira commit.
3. **Os nomes daqui são o contrato.** Tabela, coluna, função, rota e arquivo:
   use exatamente os nomes deste documento. Se precisar de um nome novo, siga o
   padrão do projeto (português, sem acento, `snake_case` no banco, `camelCase`
   no JavaScript).
4. **Decisão que o Vinícius ainda não tomou:** implemente a recomendação deste
   documento, deixe configurável quando for barato e liste a escolha no resumo
   final. Não pare o trabalho para perguntar o que já tem recomendação aqui.
5. **O que depende de conta ou acesso que não existe não avança.** Fica o ponto
   de extensão e a pendência escrita (seção 14).
6. **Texto jurídico é do escritório.** Modelos de documento, regra de contagem
   de prazo e fórmula de cálculo: reproduza fielmente e marque para revisão.
   Não "melhore" redação jurídica por conta própria. As mudanças que este
   documento sugere estão marcadas **[propor ao Vinícius]** e só entram depois
   do sim dele — até lá, vale o texto do protótipo.
7. **Ao terminar uma etapa**, marque-a como feita na tabela da seção 1 (coluna
   "Situação", com a data).

---

## 1. As funções, em ordem

**Atualização de 05/10/2026:** E0, F1–F4 e F7 implementados e verificados localmente.
F8 tem botão Google, `.ics`, lembrete no detalhe e feriados cadastrados na grade;
feriados nacionais automáticos e importação na conta Google seguem pendentes.
F5/F6 estão parcialmente prontas no fluxo manual (tarefas, datas informadas,
feriados cadastrados e intimações manuais com prazo/audiência). A geração
dos módulos de contagem e leitura DJEN foi bloqueada pelo filtro de conteúdo,
sem motivo detalhado; contagem, feriados calculados e busca/importação continuam
pendentes. Não houve nova tentativa da ação bloqueada.
As migrações de produção, publicação da função e frontend aguardam o teste
do Ithalo. Roteiro: [TESTAR-NOVAS-FUNCOES.md](TESTAR-NOVAS-FUNCOES.md).
Os itens assinalados nas seções 4.7, 5.8, 6.4, 7.9, 8.8, 11.5 e 12.4 referem-se ao ambiente local.

| # | Função | O que resolve, nas palavras dele | Depende de | Tamanho | Situação |
|---|---|---|---|---|---|
| E0 | **Base:** acesso a Clientes e a Prazos; identidade do escritório num arquivo só; lista de áreas | "o Vinícius vai ver o cliente, contato e atualizações… publicações, prazos, ele não mexe" [19:00] | — | P | Implementado/testado localmente · 05/10/2026; migração remota pendente |
| F1 | **Contatos:** o formulário do site grava no sistema; triagem e "virou cliente" | "pra mim saber quem entrou… quem eu posso contatar" [03:00] | E0 | P | Implementado/testado localmente · 05/10/2026; publicação pendente |
| F2 | **Clientes e processos:** cadastro completo, busca, ficha do cliente com tudo ligado | "faria um pré-cadastro… vou procurar o Rodrigo, aparece o Rodrigo" [01:20] | E0 | M | Implementado/testado localmente · 05/10/2026; migração remota e publicação pendentes |
| F3 | **Documentos automáticos** e **ficha de atendimento**: gerar, editar na tela, imprimir | "o cliente tem memória seletiva… ele assina" [01:20]; "gerar, manusear conforme o cliente e imprimir" [20:00] | F2 | G | Implementado/testado localmente · 05/10/2026; migração remota e publicação pendentes |
| F4 | **Atualizações com cronômetro:** quem atendeu, o que conversou, quanto tempo levou | "isso que é a parte importante" [03:20]; "uma hora de início e uma hora de fim" | F2 | M | Implementado/testado localmente · 05/10/2026; migração remota e publicação pendentes |
| F5 | **Tarefas e prazos:** delegação, prazo fatal e de entrega, dias úteis, corridos **e horas** | "tem algumas vezes que o juiz intima a gente para cumprir algo em horas" [16:00]; "diário, semanal, mensal e anual" [17:00] | F2 | G | Parcial: tarefas e prazos manuais testados localmente · 05/10/2026; contagem automática pendente |
| F6 | **Intimações do DJEN:** consulta à API pública do CNJ por OAB, conferência humana, vira prazo ou audiência | "pra mim ter essa informação diária" [13:00] | F5 | M | Parcial: intimações manuais e conferência com prazo/audiência testados localmente · 05/10/2026; busca DJEN pendente |
| F7 | **Avisos do dia:** aniversários com mensagem pronta, prazos, contatos novos, intimações a conferir | "não precisa mandar automático, mas que me avisaria" [00:00] | F1–F6 | P | Implementado/testado localmente · 05/10/2026; usa registros manuais de F5/F6; migração e publicação pendentes |
| F8 | **Agenda sem depender do Google:** pôr no Google com um clique, exportar `.ics`, lembrete ao cliente, feriados | "exportar o que você tem no mês" [10:50]; "eu não gosto de que as pessoas fiquem esperando" [11:40] | F5 | P | Parcial: Google, `.ics`, lembrete e feriados cadastrados testados localmente · 05/10/2026; feriados automáticos e importação na conta Google pendentes |
| F9 | *(opcional)* **Calculadora** de atualização de valor e de pensão | estava no protótipo ("Calculadoras"); não foi citada na reunião | — | P | — |

**Tamanho** — mesma régua da preparação anterior, para orçar (não é prazo):
P ≈ até 1 semana · M ≈ 1 a 2 semanas · G ≈ 2 a 3 semanas de uma pessoa
dedicada, com testes. Tudo junto: **≈ 12 a 16 semanas**.

**Custo mensal novo: R$ 0** no piloto e em produção — nada aqui usa serviço
pago (seção 18). O Vinícius mede tudo em custo (CLAUDE.md §2.1): diga isso
junto de qualquer proposta.

**A ordem não é arbitrária.** F1 fecha uma pendência de lançamento do site
(README, "Backend do formulário"). F2 a F4 são o bloco que o CLAUDE.md §9 põe
logo depois do Financeiro. F5 vem antes de F6 porque intimação sem prazo não
serve para nada. F6 é a maior alavanca comercial da relação (CLAUDE.md §3,
"Oportunidade de produto") — construa genérico (OAB lida de `membros`, nada
fixo no código), mas **não prometa nada** sobre vender a ferramenta.

---

## 2. Regras da casa

### 2.1 Processo

- **Nunca `git commit` nem `git push` sem o Ithalo aprovar explicitamente.** Ao
  fim de cada etapa: resumo do que mudou e a pergunta.
- **Antes de aplicar migração no projeto real**, mostre o SQL ao Ithalo e
  espere o "pode". Projeto Supabase `fhl-advocacia`, id `ulnpnbzibwbrzrpomgia`,
  região São Paulo, plano gratuito.
- **Não grave dado de teste no banco real.** Teste no SQL com bloco desfeito
  (seção 16). Os dados que o Ithalo lançou para testar — 1 contrato, 1 conta
  "Luz", o cliente "Rodrigo" — ficam: não apague nem cancele.
- **Não digite senha nem crie login** para testar telas: verifique sem login
  (seção 16).
- **Nada pago.** Nenhum serviço, plano ou API com custo. Se algo só funcionar
  pago, pare e pergunte.
- **Conta que não existe, não avança** (seção 14).

### 2.2 Código da área dos advogados (`sistema/`)

- Sem dependências e sem build: HTML, CSS e ES modules servidos como estão.
  Nada de `npm install`.
- **Tela:** `export default async function telaX(ctx)`, carregada por `import()`
  numa `rota()` de `sistema/js/app.js`. Confira `ctx.ativa()` depois de cada
  `await` e devolva a função de limpeza (o retorno de `aoClicar`). Rota fixa
  (`/documentos/novo`) é registrada **antes** da rota com parâmetro
  (`/documentos/:id`) — o roteador testa na ordem.
- **HTML só por `` html`…` ``** (`nucleo/html.js`), que escapa tudo. `cru()` só
  para texto escrito no próprio código. **Nunca `style=""`** em HTML gerado: a
  CSP bloqueia. Para valor dinâmico de estilo, `data-vars="--x:valor"`.
- **Gravar** passa por `abrirDialogo` (`nucleo/dialogo.js`): o erro do banco
  aparece no diálogo e o botão trava enquanto salva. Cancelar, estornar e
  reabrir pedem motivo com `pedirMotivo`. Aviso curto: `avisar`/`avisarErro`.
- **Dados:** `db.listar`, `db.todos`, `db.um`, `db.inserir`, `db.alterar`,
  `db.rpc`, `db.funcao` (`nucleo/supabase.js`). Lista que pode passar de 1000
  linhas usa `db.todos` — a Data API corta em 1000 sem avisar. Em `select`,
  liste as colunas que a tela usa (a cópia de segurança é a exceção: `*`).
- **Datas:** dia de calendário é texto `'AAAA-MM-DD'`, sem fuso; instante é
  `timestamptz`, exibido em Brasília. Use `nucleo/formato.js` (`hoje`,
  `instante`, `noFuso`, `dataHora`, `data`, `somarDias`…). "Hoje" é o de
  Paranaguá: `hoje()` no JS, `privado.hoje()` no banco.
- **Dinheiro** em centavos inteiros no JS (`centavos`, `paraReais`, `moeda`).
- **`pode.*`** (`nucleo/estado.js`) só decide o que **aparece**. Quem decide o
  que se lê e grava é o banco, pelas políticas.
- **Cálculo puro** (sem DOM, sem `fetch`) vai em `sistema/js/dominio/` e ganha
  teste em `sistema/testes/<nome>.test.mjs` (`npm run sistema:test`).
- Caminho em `index.html` e em HTML gerado é absoluto (`/sistema/img/…`);
  `import` entre módulos continua relativo.
- **Aparência:** reaproveite os componentes de `sistema/css/sistema.css`
  (`painel`, `tabela`, `campos` + `campo--3/4/6/8`, `filtros`, `indicadores` +
  `indicador`, `selo--ok/alerta/perigo/escuro`, `botao--primario/pequeno/discreto/perigo`,
  `nota`, `lista`, `dados`, `historico`, `so-impressao`, `nao-imprimir`). Raio
  de canto 0; pílula só no botão principal. Cor só pelos tokens `--c-*`.
  Componente novo vai no mesmo CSS, numa seção com o nome do módulo.
- Comentário em português, explicando o **porquê**, na densidade do código
  vizinho. Rótulos de situação ganham uma função `selo…` em `telas/comum.js`,
  no padrão de `seloParcela` e `seloCompromisso`.

### 2.3 Banco (`supabase/migrations/`)

Toda tabela de negócio nova segue o roteiro do `sistema/README.md` (a única
exceção deste documento é `contatos_envios`, uma tabela técnica — ver F1):

1. Colunas `id uuid primary key default gen_random_uuid()`, `criado_em`,
   `criado_por`, `alterado_em`, `alterado_por`. **Toda tabela auditada precisa
   da coluna `id`** — o gatilho de auditoria grava `registro_id` a partir dela,
   inclusive em tabela 1:1.
2. `select privado.aplicar_padrao('public.<tabela>');` — carimbo, auditoria e
   "sem exclusão".
3. Onde o usuário precisaria excluir, ele **cancela**: colunas `cancelado_em`,
   `cancelado_por`, `motivo_cancelamento` e
   `create trigger b_cancelamento before update on public.<tabela> for each row execute function privado.registrar_cancelamento();`
   Tabela que tem situação ou `ativo` — processos (`encerrado`), contatos
   (`arquivado`), intimações (`arquivada`), feriados (`ativo`) — usa isso no
   lugar.
4. Gatilho próprio com prefixo que o ponha **depois** de `a_carimbar` na ordem
   alfabética (`b_…`, `c_…`).
5. `alter table … enable row level security;` e políticas nomeadas
   `"<tabela>: ver"`, `"<tabela>: incluir"`, `"<tabela>: alterar"`, sempre com
   `(select privado.f())`.
6. `revoke all on … from anon, authenticated;` → `grant select` →
   `grant insert (colunas)` e `grant update (colunas)` coluna a coluna — nunca
   `id`, carimbos, nem coluna que só função escreve → `grant all … to service_role;`
7. Operação de mais de uma tabela: `public.<nome>(p jsonb)`,
   `security definer`, `set search_path = ''`, permissão conferida na **primeira
   linha**, erro em português com `errcode = 'P0001'` (a tela mostra o texto do
   banco). `revoke execute … from public, anon;` e
   `grant execute … to authenticated;`
8. No fim de toda migração:
   `revoke execute on all functions in schema privado from public, anon;`,
   `grant execute on all functions in schema privado to service_role;` e
   `grant execute` ao `authenticated` das funções `privado.*` que as políticas
   usam.
9. Tabela nova entra em `TABELAS` de `sistema/js/telas/historico.js` (e seus
   campos novos em `CAMPOS`) e na `copiaDeSeguranca()` de
   `sistema/js/telas/financeiro/relatorios.js`. O ramo dela em
   `privado.pode_ver_auditoria()` já fica pronto na E0.
10. `create or replace` de `iniciar_sessao()` ou de `pode_ver_auditoria()`
    reescreve a função **inteira**: copie a última versão e acrescente.
11. **Nome do arquivo = versão que o Supabase registrou.** Aplicando pelo MCP
    (`apply_migration`), confira com `list_migrations` e salve como
    `supabase/migrations/<versão>_<nome>.sql`. Sem MCP, o Ithalo cola no SQL
    Editor e informa a versão. Arquivo com outra data seria aplicado de novo.

### 2.4 Segurança e LGPD

- Origem externa nova chamada **pelo navegador** entra no `connect-src` da CSP
  **nas duas entradas** de `vercel.json` (`/sistema` e `/sistema/(.*)`).
- `anon` continua sem GRANT nenhum no banco, fora o conteúdo publicado do site.
  O formulário do site grava por **função de borda** (F1), não por `anon`.
- Minimização: dado pessoal além do mínimo (qualificação, endereço, dados
  bancários) fica em tabela com permissão própria (F2), não em `clientes`, que
  todo membro lê.
- Nada se apaga. A única exceção prevista é anonimizar contato do site depois
  do prazo de guarda (F1, etapa 2), e só depois do sim do Vinícius.

### 2.5 Site público

- Mexeu no site: `npm run build` e `npm run check` (17 páginas, nenhum link
  quebrado). Antes de dizer que terminou, compare com o `dist/` anterior.
- O site continua sem consultar banco no navegador do visitante. A única
  chamada nova é o POST do formulário (F1).

---

## 3. O que já existe — não refaça

Conferido no código e no projeto Supabase em 05/10/2026: 6 migrações (`base`,
`financeiro`, `agenda`, `ajustes_piloto`, `conteudo`, `ajustes_financeiro`), 20
tabelas em `public`, 1 função de borda (`publicar-site`).

| Já existe | Onde | Nas funções novas |
|---|---|---|
| Login individual, membros, permissão por módulo (Agenda, Financeiro, Site) | `membros`, `iniciar_sessao()`, `telas/membros.js` | E0 acrescenta dois níveis |
| Auditoria por gatilho; tela Histórico; diálogo "Histórico" de cada registro | `auditoria`, `telas/historico.js` (`abrirHistorico`) | todo registro novo ganha o botão |
| Cadastro **mínimo** de cliente (nome, CPF/CNPJ, telefone, e-mail, observações) e o campo de escolher cliente com botão "Novo" | `clientes`, `telas/clientes.js` (`campoCliente`, `ligarCampoCliente`, `carregarClientes`, `cadastrarCliente`, `editarCliente`) | continua sendo o atalho do Financeiro e da Agenda; F2 cresce a partir dele |
| Agenda da semana, bloqueio de vários dias, particular como "Ocupado", aviso de conflito, chegada do cliente e tempo de espera, situação do atendimento, impressão | `compromissos`, `agenda_periodo()`, `telas/agenda.js` | F4 liga "Iniciar atendimento"; F8 acrescenta Google, `.ics`, lembrete e feriados |
| Tela **Hoje** — o "Escritório Virtual" do protótipo | `telas/inicio.js` | F7 acrescenta os avisos |
| Financeiro inteiro: contratos, parcelas, recebimentos, atraso com memória do cálculo, cobrança registrada, contas, fechamento, relatórios, **cópia de segurança** | migração `financeiro`, `telas/financeiro/` | F3 puxa dele o contrato de honorários e a prestação de contas |
| Mensagem pronta para WhatsApp: copiar e abrir — nada é enviado sozinho | `linkWhatsApp` (`nucleo/formato.js`), `prepararCobranca` (`telas/financeiro/base.js`) | modelo para resposta a contato, aniversário e lembrete |
| Índices do Banco Central e cálculo de atraso com memória | `dominio/indices.js`, `dominio/atraso.js`, `memoria()` em `telas/financeiro/base.js` | F9 |
| Planilha que abre certa no Excel em português | `nucleo/csv.js` (`gerarCsv`, `baixarArquivo`) | toda exportação nova |
| Publicações e campanhas do site, cartão de post de rede social, botão Publicar | `publicacoes`, `campanhas`, `telas/site/`, função `publicar-site` | nada — os pedidos [30:00] e [32:00] já foram atendidos |
| Formulário de contato do site: validação, honeypot, consentimento, campo oculto `campanha` — **sem backend**, abre o WhatsApp | `src/partials/contato.mjs`, `assets/js/site.js`, `FORM_ENDPOINT` vazio em `src/data/site.mjs` | F1 liga o backend |

---

## 4. E0 · Base: dois níveis de acesso novos

### 4.1 Por quê

"O Vinícius vai ver o cliente, contato e atualizações. Financeiro, agenda,
publicações, prazos, ele não mexe… a secretária vai ver o cliente, o contato,
atualizações e o financeiro" [19:00] — ele usou o próprio nome como exemplo de
um advogado. Os módulos novos caem exatamente em dois blocos:

| Nível novo em `membros` | Valores | O que libera |
|---|---|---|
| `acesso_clientes` | `nenhum` · `editar` | Cadastro completo do cliente, processos (escrever), contatos do site, atualizações e documentos |
| `acesso_prazos` | `nenhum` · `editar` | Intimações do DJEN, feriados e **prazo processual** (criar e mudar data fatal) |

**Tarefas não têm nível:** todo membro ativo vê e delega — é a "delegação
entre sócios e equipe" do protótipo, e quem recebe tarefa (estagiário,
secretária) precisa enxergá-la. `clientes` e `processos` também são lidos por
todo membro: Financeiro, Agenda e Tarefas dependem deles.

Sugestão por perfil (vira `SUGESTOES` em `telas/membros.js`):

| Perfil | Clientes | Prazos |
|---|---|---|
| Administrador | sempre `editar` | sempre `editar` |
| Sócio | `editar` | `editar` |
| Secretária | `editar` | `nenhum` |
| Advogado associado / estagiário | `editar` | `nenhum` |

### 4.2 Migração `base_modulos`

```sql
-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 07 · Base dos módulos novos: acesso a Clientes e a Prazos
-- =============================================================================
--
-- preparacao-novas-funcoes.md, seção 4. Dois níveis por membro, no molde de
-- acesso_site: para o administrador vale sempre o máximo.

alter table public.membros
  add column acesso_clientes text not null default 'nenhum'
    check (acesso_clientes in ('nenhum', 'editar')),
  add column acesso_prazos text not null default 'nenhum'
    check (acesso_prazos in ('nenhum', 'editar'));

comment on column public.membros.acesso_clientes is
  'nenhum · editar: cadastro completo, processos, contatos do site, atualizações e documentos';
comment on column public.membros.acesso_prazos is
  'nenhum · editar: intimações do DJEN, feriados e prazo processual';

-- Os sócios de hoje usam tudo. A restrição da reunião [19:00] é para advogado
-- associado e secretária, que ainda não existem.
update public.membros
   set acesso_clientes = 'editar', acesso_prazos = 'editar'
 where papel in ('admin', 'socio');

create function privado.acesso_clientes()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'editar' else m.acesso_clientes end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

create function privado.acesso_prazos()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when m.papel = 'admin' then 'editar' else m.acesso_prazos end
    from public.membros m
    where m.user_id = (select auth.uid()) and m.ativo
  ), 'nenhum')
$$;

create function privado.edita_clientes()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.acesso_clientes() = 'editar'
$$;

create function privado.gerencia_prazos()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.acesso_prazos() = 'editar'
$$;

-- iniciar_sessao(): copie a versão INTEIRA de 20260916120520_conteudo.sql e
-- acrescente, no jsonb_build_object do fim:
--   'acesso_clientes', case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_clientes end,
--   'acesso_prazos',   case when v_membro.papel = 'admin' then 'editar' else v_membro.acesso_prazos end

-- Histórico: a versão inteira, já com os ramos de TODAS as tabelas deste
-- documento. plpgsql só resolve nomes ao executar — tabela que ainda não
-- existe não atrapalha, e as próximas migrações não precisam mexer aqui.
create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if privado.eh_admin() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    when p_tabela in ('clientes', 'processos', 'tarefas', 'feriados') then
      return true;
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'documentos') then
      return privado.edita_clientes();
    when p_tabela in ('intimacoes', 'intimacoes_consultas') then
      return privado.gerencia_prazos();
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro') then
      return privado.acesso_financeiro() in ('lancamentos', 'completo');
    when p_tabela in ('fechamentos', 'divisao_cotas') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela in ('publicacoes', 'campanhas', 'site_deploys') then
      return privado.edita_site();
    when p_tabela = 'compromissos' then
      -- Compromisso particular: o histórico também é só do dono.
      return privado.acesso_agenda() <> 'nenhum' and exists (
        select 1 from public.compromissos c
        where c.id = p_registro
          and (c.membro_id = privado.meu_membro_id() or not c.particular));
    else
      return false;
  end case;
end
$$;

grant insert (acesso_clientes, acesso_prazos), update (acesso_clientes, acesso_prazos)
  on public.membros to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function
  privado.acesso_clientes(), privado.acesso_prazos(),
  privado.edita_clientes(), privado.gerencia_prazos()
  to authenticated;
```

### 4.3 Telas

| Arquivo | Mudança |
|---|---|
| `sistema/js/nucleo/estado.js` | no objeto `pode`: `clientes: () => estado.membro?.acesso_clientes === 'editar'` e `prazos: () => estado.membro?.acesso_prazos === 'editar'`; as duas colunas no `select` de `carregarMembros`; `NIVEIS_CLIENTES` e `NIVEIS_PRAZOS` (rótulos: "Sem acesso" / "Clientes, contatos, atualizações e documentos"; "Sem acesso" / "Intimações, feriados e prazos processuais") |
| `sistema/js/telas/membros.js` | `SUGESTOES` com os dois níveis (tabela 4.1); dois `select` novos no diálogo; duas colunas novas na tabela (admin aparece como "Completo") |
| `sistema/js/telas/historico.js` | em `CAMPOS`: `acesso_site`, `acesso_clientes`, `acesso_prazos`, `cliente_id` ("cliente"), `processo_id` ("processo"), `fatal_em` ("prazo fatal"), `entrega` ("prazo de entrega"), `proxima_providencia` ("próxima providência"), `concluida_em` ("concluída em"), `conferida_em` ("conferida em") |
| `sistema/js/telas/inicio.js` | a mensagem "Seu perfil ainda não tem acesso a nenhum módulo" passa a considerar `pode.clientes()` e as tarefas (que todo membro tem) |

### 4.4 Identidade do escritório num arquivo só

Documentos (F3) e mensagens (F1, F7, F8) precisam de endereço, telefone e
e-mail — hoje em `src/data/site.mjs`, que a área dos advogados não alcança (o
site é gerado em Node; `src/` não vai ao ar). Para não nascer uma segunda
cópia que diverge:

1. Crie `sistema/js/escritorio.js` só com constantes — o mesmo molde de
   `sistema/js/config.js`, que o navegador e o build já leem:

   ```js
   // Identidade do escritório: nome, endereço e contatos. FONTE ÚNICA.
   // Lido pela área dos advogados (documentos, mensagens) e pelo build do site
   // (src/data/site.mjs reexporta daqui). Só constantes: nada de navegador nem
   // de Node, para funcionar nos dois.
   export const RAZAO = 'FHL Advocacia — Fonseca Hespanha Lisboa';
   export const ENDERECO = 'Rua Dr. Leocádio, 282 — Centro';
   export const CIDADE = 'Paranaguá — PR';
   export const CEP = '83.203-270';                          // do protótipo
   export const TEL = '(41) 2152-2607';
   export const TEL_HREF = '+554121522607';
   export const WHATS = '554121522607';
   export const EMAIL = 'contato@fhladvocacia.com.br';       // [CONFIRMAR] CLAUDE.md §7
   export const HORARIO = 'Segunda a sexta, das 9h às 18h';
   export const HORARIO_CURTO = 'Seg. a sex., 9h às 18h';
   // Como o endereço aparece nos documentos (texto do protótipo).
   export const ENDERECO_DOCUMENTO = 'rua Doutor Leocádio, 282, Centro, Paranaguá/PR – CEP: 83.203-270';
   export const FORO = 'Paranaguá/PR';
   ```

2. Em `src/data/site.mjs`, troque as constantes repetidas por
   `export { RAZAO, ENDERECO, CIDADE, TEL, TEL_HREF, WHATS, EMAIL, HORARIO, HORARIO_CURTO } from '../../sistema/js/escritorio.js';`
   — os nomes exportados não mudam, então nenhuma página muda.
3. `npm run build`: o HTML gerado tem de sair **idêntico** ao de antes
   (compare os dois `dist/`).

### 4.5 Áreas jurídicas

Em `sistema/js/telas/comum.js`, a lista que processos (F2) e prazos (F5) usam —
as quatro do site primeiro, depois as que aparecem nos perfis dos advogados e no
protótipo:

```js
export const AREAS_JURIDICAS = {
  trabalhista: 'Trabalhista', previdenciario: 'Previdenciário', consumidor: 'Consumidor',
  civel: 'Cível', familia: 'Família', sucessoes: 'Sucessões', criminal: 'Criminal',
  contratual: 'Contratual', imobiliario: 'Imobiliário', empresarial: 'Empresarial',
  administrativo: 'Administrativo', portuario: 'Portuário', ambiental: 'Ambiental',
  regularizacao_fundiaria: 'Regularização fundiária', outro: 'Outro',
};
```

O `check` de `processos.area` (F2) repete exatamente estas chaves.

### 4.6 Formatos novos em `sistema/js/nucleo/formato.js`

Funções puras, com teste em `sistema/testes/formato.test.mjs` (vetores no
Apêndice C):

| Função | Faz |
|---|---|
| `dataPorExtenso(iso)` | `'2026-10-05'` → `'05 de outubro de 2026'` (o formato dos documentos do protótipo) |
| `numeroCnj(digitos)` | 20 dígitos → `'NNNNNNN-DD.AAAA.J.TR.OOOO'` |
| `numeroCnjValido(texto)` | confere o dígito verificador (módulo 97, Resolução CNJ 65/2008): reordene para `NNNNNNN AAAA J TR OOOO DD` e o resto por 97 tem de ser 1. Use `BigInt` |
| `tribunalDoNumero(digitos)` | sigla pelo `J.TR`: `8.16` → `TJPR`, `5.09` → `TRT9`, `4.04` → `TRF4`, `3.00` → `STJ`; Justiça Estadual pela ordem alfabética das UFs (01 AC … 16 PR … 26 SP, 27 TO); fora disso, `'J.TR'` |
| `duracao(minutos)` | `45` → `'45 min'`, `60` → `'1 h'`, `65` → `'1 h 05 min'`, `920` → `'15 h 20 min'` |
| `semAcento(texto)` | `'José da Conceição'` → `'Jose da Conceicao'` — para a busca de clientes (F2) |

### 4.7 Pronto quando

- [ ] Migração aplicada e renomeada com a versão registrada.
- [x] `iniciar_sessao()` devolve os dois níveis; admin recebe `editar` nos dois (SQL local).
- [x] Membros mostra e grava os dois níveis; a sugestão por perfil funciona.
- [x] `npm run sistema:test` passa com os formatos novos (57/57, incluindo F2).
- [x] Identidade extraída preserva o HTML das 17 páginas (comparação com o módulo original, endpoint de F1 igual nas duas versões).
- [x] Testes de permissão da seção 16 para os dois níveis: anônimo, login sem
      membro, admin, sócia, secretária e associado.

---

## 5. F1 · Contatos: o formulário do site chega no sistema

### 5.1 Por quê

"Contatos… no site ele tem como se fosse uma situação, tipo assim, entra em
contato com a gente, então ficaria concentrado aqui… pra mim saber quem
entrou… quem eu posso contatar" [03:00]. O protótipo tinha a tela
"Contatos pelo site" com as situações *Novo contato · Em atendimento ·
Contatado · Convertido em cliente · Arquivado*.

Hoje o formulário do site abre a mensagem pronta no WhatsApp do escritório
(`FORM_ENDPOINT` vazio). Funciona, mas o registro fica no celular de quem
atende: ninguém mais vê, nada se mede. É a pendência 7 do `README.md` e o item
4 do CLAUDE.md §9 ("a primeira ponte entre site e sistema").

### 5.2 Como funciona

```
visitante → formulário do site → POST → função de borda receber-contato
          → (valida, honeypot, limite por IP) → registrar_contato() com a chave de serviço
          → tabela contatos → tela Contatos + aviso na tela Hoje (F7)
```

O módulo também aceita contato **lançado à mão** — quem ligou, mandou
WhatsApp ou veio por indicação. Assim a tela vira a lista de todo mundo que
procurou o escritório e ainda não é cliente, não só de quem usou o site.

### 5.3 Migração `contatos`

```sql
-- 08 · Contatos: o formulário do site chega na área dos advogados

create table public.contatos (
  id               uuid primary key default gen_random_uuid(),
  -- De onde veio. Só 'site' entra pela função de borda; o resto é lançado à mão.
  canal            text not null default 'site'
                   check (canal in ('site', 'whatsapp', 'telefone', 'presencial', 'indicacao', 'outro')),
  nome             text not null check (btrim(nome) <> '' and char_length(nome) <= 200),
  email            text check (char_length(email) <= 200),
  telefone         text check (char_length(telefone) <= 40),
  empresa          text check (char_length(empresa) <= 200),
  mensagem         text check (char_length(mensagem) <= 5000),
  -- Página do site em que o formulário foi enviado e a campanha, se veio de
  -- uma. É o que mostra se conteúdo e campanha trazem gente [18:30].
  pagina           text check (char_length(pagina) <= 300),
  campanha         text check (campanha ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- LGPD: quando a pessoa marcou o consentimento, na hora do servidor.
  consentimento_em timestamptz,
  recebido_em      timestamptz not null default now(),
  situacao         text not null default 'novo'
                   check (situacao in ('novo', 'em_atendimento', 'contatado', 'convertido', 'arquivado')),
  responsavel_id   uuid references public.membros (id),
  cliente_id       uuid references public.clientes (id),
  observacoes      text,
  criado_em        timestamptz not null default now(),
  criado_por       uuid,
  alterado_em      timestamptz,
  alterado_por     uuid,
  constraint contato_como_responder check (email is not null or telefone is not null),
  constraint contato_site_completo check (
    canal <> 'site' or (consentimento_em is not null and coalesce(btrim(mensagem), '') <> '')),
  constraint contato_convertido check (situacao <> 'convertido' or cliente_id is not null)
);

create index contatos_situacao on public.contatos (situacao, recebido_em desc);
create index contatos_cliente on public.contatos (cliente_id);
create index contatos_responsavel on public.contatos (responsavel_id);

select privado.aplicar_padrao('public.contatos');

-- Limite de envio por IP. Fora de `contatos` de propósito: ninguém da equipe
-- precisa ver isto, e cada linha some depois de um dia. É dado técnico, não
-- registro do escritório — a regra "nada se apaga" não se aplica aqui.
create table public.contatos_envios (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  em      timestamptz not null default now()
);
create index contatos_envios_ip on public.contatos_envios (ip_hash, em desc);
alter table public.contatos_envios enable row level security;  -- sem política: só a chave de serviço
revoke all on public.contatos_envios from anon, authenticated;
grant all on public.contatos_envios to service_role;

-- Chamada só pela função de borda receber-contato, com a chave de serviço.
create function public.registrar_contato(p jsonb, p_ip_hash text default null)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  delete from public.contatos_envios where em < now() - interval '1 day';

  if p_ip_hash is not null then
    if (select count(*) from public.contatos_envios e
         where e.ip_hash = p_ip_hash and e.em > now() - interval '10 minutes') >= 3 then
      raise exception 'Muitas mensagens em pouco tempo. Tente de novo daqui a alguns minutos.'
        using errcode = 'P0001';
    end if;
    insert into public.contatos_envios (ip_hash) values (p_ip_hash);
  end if;

  -- Teto do escritório inteiro: um robô não enche o banco nem a tela.
  if (select count(*) from public.contatos c
       where c.canal = 'site' and c.recebido_em > now() - interval '1 hour') >= 30 then
    raise exception 'Recebemos muitas mensagens agora. Tente de novo mais tarde ou use o WhatsApp.'
      using errcode = 'P0001';
  end if;

  if coalesce(p ->> 'consent', '') not in ('1', 'true', 'on') then
    raise exception 'É preciso autorizar o tratamento dos dados para enviar.' using errcode = 'P0001';
  end if;

  insert into public.contatos (canal, nome, email, telefone, empresa, mensagem, pagina, campanha, consentimento_em)
  values ('site',
          btrim(p ->> 'nome'),
          nullif(lower(btrim(p ->> 'email')), ''),
          nullif(btrim(p ->> 'telefone'), ''),
          nullif(btrim(p ->> 'empresa'), ''),
          btrim(p ->> 'mensagem'),
          nullif(btrim(p ->> 'pagina'), ''),
          nullif(btrim(p ->> 'campanha'), ''),
          now())
  returning id into v_id;

  return v_id;
end
$$;

alter table public.contatos enable row level security;

create policy "contatos: ver" on public.contatos
  for select to authenticated using ((select privado.edita_clientes()));
create policy "contatos: incluir" on public.contatos
  for insert to authenticated
  with check ((select privado.edita_clientes()) and canal <> 'site');
create policy "contatos: alterar" on public.contatos
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.contatos from anon, authenticated;
grant select on public.contatos to authenticated;
grant insert (canal, nome, email, telefone, empresa, mensagem, responsavel_id, observacoes)
  on public.contatos to authenticated;
grant update (situacao, responsavel_id, cliente_id, observacoes)
  on public.contatos to authenticated;
grant all on public.contatos to service_role;

revoke execute on function public.registrar_contato(jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_contato(jsonb, text) to service_role;
-- (e o fechamento padrão do item 8 da seção 2.3)
```

### 5.4 Função de borda `receber-contato`

Arquivo `supabase/functions/receber-contato/index.ts`, no estilo de
`supabase/functions/publicar-site/index.ts` (cabeçalho explicando o porquê,
`responder()`, CORS). Publicar com **`verify_jwt` desligado** — o visitante do
site não tem login — pelo MCP (`deploy_edge_function`) ou pela CLI.

```ts
// Recebe o formulário do site (Contato, home e campanhas) e grava no módulo
// Contatos. É o FORM_ENDPOINT de src/data/site.mjs.
//
// POR QUE UMA FUNÇÃO DE BORDA — `anon` não tem GRANT nenhum no banco além do
// conteúdo publicado do site. Quem grava é a chave de serviço, aqui dentro,
// depois de validar. Pública por natureza: corpo pequeno, honeypot, limite por
// IP (só o hash, com sal) e teto por hora (em registrar_contato).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Conferir no painel qual variável o projeto injeta: com as chaves novas, a
// secreta pode vir em SUPABASE_SECRET_KEYS em vez de SUPABASE_SERVICE_ROLE_KEY.
const CHAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SAL = Deno.env.get('CONTATO_SAL') ?? '';   // segredo; sem ele, não há limite por IP
const LIMITE_BYTES = 20_000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const responder = (corpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function resumo(valor: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405);

  const bruto = await req.text();
  if (bruto.length > LIMITE_BYTES) return responder({ erro: 'Mensagem grande demais.' }, 413);
  let d: Record<string, unknown>;
  try { d = JSON.parse(bruto); } catch { return responder({ erro: 'Formato inválido.' }, 400); }

  // Robô preencheu o campo escondido: responde que deu certo e não grava nada.
  if (texto(d.website, 200)) return responder({ ok: true });

  const contato = {
    nome: texto(d.nome, 200),
    email: texto(d.email, 200),
    telefone: texto(d.telefone, 40),
    empresa: texto(d.empresa, 200),
    mensagem: texto(d.mensagem, 5000),
    pagina: texto(d.pagina, 300),
    campanha: SLUG.test(texto(d.campanha, 120)) ? texto(d.campanha, 120) : '',
    consent: d.consent,
  };
  if (!contato.nome || !contato.mensagem || (!contato.email && !contato.telefone)) {
    return responder({ erro: 'Preencha nome, mensagem e um meio de contato.' }, 422);
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const ipHash = ip && SAL ? await resumo(`${SAL}:${ip}`) : null;

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/registrar_contato`, {
    method: 'POST',
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: contato, p_ip_hash: ipHash }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    if (e?.code === 'P0001') return responder({ erro: e.message }, /muitas/i.test(e.message) ? 429 : 422);
    console.error('registrar_contato', r.status, e);
    return responder({ erro: 'Não foi possível registrar agora.' }, 500);
  }
  return responder({ ok: true }, 201);
});
```

**Segredo `CONTATO_SAL`:** o Ithalo cria em Supabase → Edge Functions →
Secrets (texto aleatório de 32+ caracteres). É segredo: não o escreva em
arquivo nem em conversa. Sem ele a função funciona, só sem o limite por IP.

Se o gateway do Supabase recusar a chamada sem `apikey` (401), o site passa a
mandar a chave **publicável** no cabeçalho — ela é pública por natureza (ver
`sistema/js/config.js`). E se a chave de serviço do projeto for a secreta nova
(`sb_secret_…`), confira na documentação do Supabase em qual cabeçalho ela vai:
ela não é um JWT, e o `Authorization: Bearer` do esqueleto acima vale para a
`service_role` antiga.

### 5.5 Site público

1. `src/data/site.mjs`:
   `import { SUPABASE_URL } from '../../sistema/js/config.js';` e
   `` export const FORM_ENDPOINT = `${SUPABASE_URL}/functions/v1/receber-contato`; ``
   — com isso o botão vira "Enviar" e a nota do WhatsApp some sozinha
   (`peloWhats` em `src/partials/contato.mjs`).
2. `assets/js/site.js`, em `initForm`, antes do `fetch`:
   `dados.pagina = location.pathname;`. No `catch`, além da mensagem de erro,
   acrescente ao `.form-status` um **link** "Enviar pelo WhatsApp" com
   `mensagemWhats(dados)` — link clicado é gesto do usuário; `window.open`
   depois de um `fetch` seria barrado pelo bloqueador de pop-up.
3. `src/pages/juridico.mjs` (Política de Privacidade): diga que as mensagens do
   formulário ficam no sistema interno do escritório (Supabase, servidores em
   São Paulo), acessível só à equipe, e por quanto tempo (5.7). Marque
   `[CONFIRMAR]` no comentário — a política precisa da revisão do escritório
   (pendência 6 do README).
4. `README.md`: pendência 7 resolvida; linha "Ligar o formulário a um backend"
   de "Tarefas comuns" atualizada.

### 5.6 Tela `/contatos` — `sistema/js/telas/contatos.js`

Menu: grupo novo **Clientes** (`permitido: pode.clientes`), item "Contatos".

- **Cabeçalho:** "Contatos" · "Quem procurou o escritório e o que foi feito com
  cada um" · botão "Novo contato" (lançamento à mão: canal, nome, telefone,
  e-mail, mensagem, responsável).
- **Indicadores:** Novos (tom `perigo` se > 0) · Em atendimento · Recebidos no
  mês · Viraram clientes nos últimos 90 dias.
- **Filtros** (guardados no endereço com `guardarConsulta`): situação — padrão
  *Abertos* (`novo`, `em_atendimento`, `contatado`) · canal · campanha · busca
  (nome, e-mail, telefone) · período.
- **Lista:** recebido em · nome · origem (selo: "Site · Contato", "Site ·
  campanha acidente-de-trabalho", "WhatsApp"…) · telefone e e-mail · começo da
  mensagem · responsável · situação.
- **Ações de cada contato:**
  - **Abrir** — diálogo com a mensagem inteira (quebras de linha preservadas
    pelo CSS, `white-space: pre-wrap`) e um formulário curto: situação,
    responsável, observações.
  - **Responder** — diálogo no molde de `prepararCobranca`: texto pronto
    ("Olá, {nome}! Aqui é {remetente}, da FHL Advocacia. Recebemos sua mensagem
    pelo site…"), Copiar, Abrir no WhatsApp (`linkWhatsApp`) e `mailto:` se
    houver e-mail. "Registrar que respondi" muda a situação para `contatado` e
    acrescenta às observações a data, o nome de quem respondeu e o canal.
  - **Virou cliente** — abre o cadastro de cliente com nome, e-mail e telefone
    já preenchidos (o completo de F2 se já existir; antes dele, o
    `cadastrarCliente` de `telas/clientes.js`, que hoje só recebe o nome —
    acrescente e-mail e telefone aos valores iniciais que ele aceita). Salvo o
    cliente, grava `situacao = 'convertido'` e `cliente_id`. Se esta segunda
    gravação falhar, avise — o vínculo pode ser refeito pelo mesmo botão.
  - **Arquivar** — confirmação com observação opcional (spam, fora da área,
    desistiu).
  - **Histórico** — `abrirHistorico`.
- **Painel "De onde vêm os contatos":** últimos 90 dias, contagem por canal e
  por campanha ou página. Responde à pergunta dele sobre tráfego orgânico e
  pago [18:30] com dado do próprio escritório.

### 5.7 LGPD

- O consentimento fica gravado (`consentimento_em`), e o IP nunca: só um hash
  com sal, numa tabela que se esvazia em um dia.
- **Prazo de guarda [propor ao Vinícius]:** contato que não virou cliente,
  12 meses depois de arquivado.
- **Etapa 2 — só depois do sim dele:** `public.anonimizar_contatos(p_meses integer)`,
  só administrador: troca o nome por "Contato anonimizado", limpa e-mail,
  telefone, empresa, mensagem e observações e — exceção prevista à regra
  "nada se apaga" — limpa `antes` e `depois` dessas linhas em `auditoria`,
  deixando o registro do evento ("anonimizou", quem, quando). Botão na tela,
  nunca automático.

### 5.8 Pronto quando

- [x] Formulário enviado no site aparece na tela Contatos com página e campanha (prévia local).
- [x] Honeypot preenchido responde `ok` e não grava; corpo sem consentimento
      responde 422; quarto envio do mesmo IP em 10 minutos responde 429.
- [x] Falha de rede no site mostra o link do WhatsApp com a mensagem pronta.
- [x] Secretária e associado com `acesso_clientes = 'editar'` veem; membro sem o
      nível não vê nem pela API (teste SQL).
- [x] "Virou cliente" cria o cliente e liga o contato (também vincula cliente existente).
- [x] Política de Privacidade atualizada e marcada para revisão do escritório.
- [x] `npm run check` passa (17 páginas).

---

## 6. F2 · Clientes e processos

### 6.1 Por quê

"No cliente… eu faria um pré-cadastro… e aí lá embaixo ele me geraria um
documento automático" [01:20]. "Eu procuraria Rodrigo, então ali ia aparecer o
nome do Rodrigo, e aí embaixo ele ia ter uma prévia… o que eu conversei com
ele, quem conversou" [03:20]. "Nós não somos oniscientes… vai ter clientes que
o Ítalo não vai conseguir atender, mas vai ter clientes que o Rodrigo" — e
quem atende o cliente do outro precisa saber o que foi dito. Para os
documentos: "nome, nacionalidade, data de nascimento, filiação, endereço, já
estivesse pronto" [20:00].

O protótipo tinha: nome, CPF/CNPJ, RG/inscrição estadual, nascimento ou
constituição, telefone, e-mail, profissão, estado civil, endereço separado em
campos, contato para recados (nome, parentesco, telefone, observação),
representante legal, responsável interno, área, situação do caso e número do
processo — com busca e filtros por responsável, área, situação e "com
representante legal".

**O que muda:**

| Peça | Papel |
|---|---|
| `clientes` (já existe) | Identificação mínima que **todo membro** lê — Financeiro, Agenda e Tarefas dependem dela. Não muda. |
| `clientes_detalhes` (nova, 1:1) | Qualificação completa, endereço, recados, representante, dados bancários e responsável. Só quem tem `acesso_clientes`. |
| `processos` (nova) | Os casos do cliente, com ou sem número do CNJ. Todo membro lê; quem tem `acesso_clientes` escreve. |
| Telas | Lista de clientes, **ficha do cliente** (tudo dele num lugar) e lista de processos. |

### 6.2 Migração `clientes_processos`

```sql
-- 09 · Clientes (cadastro completo) e processos

create table public.clientes_detalhes (
  id                         uuid primary key default gen_random_uuid(),
  cliente_id                 uuid not null unique references public.clientes (id),
  tipo_pessoa                text not null default 'fisica' check (tipo_pessoa in ('fisica', 'juridica')),
  -- Concordância nos documentos: 'm' brasileiro, 'f' brasileira, nulo
  -- "brasileiro(a)" como no protótipo. NUNCA deduzir do nome: quem cadastra escolhe.
  flexao                     text check (flexao in ('m', 'f')),
  rg                         text check (char_length(rg) <= 30),   -- ou inscrição estadual (PJ)
  nascimento                 date,                                  -- ou constituição (PJ)
  nacionalidade              text,
  estado_civil               text check (estado_civil in ('solteiro', 'casado', 'uniao_estavel',
                                                          'separado', 'divorciado', 'viuvo')),
  profissao                  text,
  filiacao                   text,
  cep                        text check (cep ~ '^[0-9]{8}$'),
  logradouro                 text,
  numero                     text,
  complemento                text,
  bairro                     text,
  cidade                     text,
  uf                         text check (uf ~ '^[A-Z]{2}$'),
  -- Contato para recados (protótipo): parente, vizinho.
  recado_nome                text,
  recado_relacao             text,
  recado_telefone            text check (recado_telefone ~ '^[0-9]{10,13}$'),
  recado_observacao          text,
  -- Representante legal: de menor, de incapaz, ou quem assina pela empresa.
  representante_nome         text,
  representante_documento    text check (representante_documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  representante_relacao      text,
  representante_qualificacao text,
  -- Para repasse de valores ao cliente (ficha de atendimento, prestação de contas).
  banco                      text,
  agencia                    text,
  conta                      text,
  pix                        text,
  responsavel_id             uuid references public.membros (id),
  criado_em                  timestamptz not null default now(),
  criado_por                 uuid,
  alterado_em                timestamptz,
  alterado_por               uuid
);

create index clientes_detalhes_responsavel on public.clientes_detalhes (responsavel_id);
select privado.aplicar_padrao('public.clientes_detalhes');

-- Dígito verificador do número único do CNJ (Resolução 65/2008, módulo 97):
-- NNNNNNN DD AAAA J TR OOOO, reordenado para NNNNNNN AAAA J TR OOOO DD,
-- tem resto 1 na divisão por 97.
create function privado.numero_cnj_valido(p text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p ~ '^[0-9]{20}$'
     and (substr(p, 1, 7) || substr(p, 10, 11) || substr(p, 8, 2))::numeric % 97 = 1
$$;

create table public.processos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id),
  -- Número único do CNJ, só dígitos. Nulo: caso sem processo (consultivo,
  -- extrajudicial, administrativo) — aí vale `referencia`.
  numero         text check (numero is null or privado.numero_cnj_valido(numero)),
  referencia     text,   -- NB do INSS, protocolo administrativo…
  titulo         text not null check (btrim(titulo) <> ''),
  area           text not null check (area in (
                   'trabalhista', 'previdenciario', 'consumidor', 'civel', 'familia', 'sucessoes',
                   'criminal', 'contratual', 'imobiliario', 'empresarial', 'administrativo',
                   'portuario', 'ambiental', 'regularizacao_fundiaria', 'outro')),
  tribunal       text,   -- sigla (TJPR, TRT9, TRF4…); a tela sugere pelo número
  orgao          text,   -- vara, juizado, turma
  responsavel_id uuid references public.membros (id),
  -- As situações do protótipo ("Status do cliente/caso").
  situacao       text not null default 'em_andamento'
                 check (situacao in ('em_analise', 'aguardando_documentos', 'contrato_enviado',
                                     'em_andamento', 'suspenso', 'encerrado')),
  observacoes    text,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  alterado_em    timestamptz,
  alterado_por   uuid
);

-- O mesmo processo pode ter mais de um cliente do escritório (litisconsórcio):
-- uma linha por cliente; o número só é único dentro do cliente.
create unique index processos_cliente_numero on public.processos (cliente_id, numero) where numero is not null;
create index processos_numero on public.processos (numero) where numero is not null;
create index processos_responsavel on public.processos (responsavel_id);
select privado.aplicar_padrao('public.processos');
```

**`public.salvar_cliente(p jsonb) returns uuid`** — `security definer`. Grava
`clientes` e `clientes_detalhes` numa transação: ou os dois, ou nenhum.

- `p`: `{ id?, nome, documento, telefone, email, observacoes, detalhes?: { …colunas de clientes_detalhes… } }`.
- Primeira linha: `privado.eh_membro()`; se `detalhes` vier, exige
  `privado.edita_clientes()` (`errcode = '42501'`, "Seu acesso não permite
  editar o cadastro completo.").
- Sem `id`: `insert` em `clientes`; com `id`: `update` (e "Cliente não
  encontrado." se não achar).
- `detalhes`: `insert … on conflict (cliente_id) do update set …` com todas as
  colunas menos `id` e carimbos. Texto vazio vira `null`
  (`nullif(btrim(x), '')`); data com `::date`.
- Devolve o `id` do cliente.

**Políticas e privilégios:**

| Tabela | ver | incluir / alterar |
|---|---|---|
| `clientes_detalhes` | `privado.edita_clientes()` | `privado.edita_clientes()` |
| `processos` | `privado.eh_membro()` | `privado.edita_clientes()` |

GRANT de insert/update coluna a coluna (em `clientes_detalhes`, `cliente_id`
só no insert). **Atenção:** o `check` de `processos.numero` chama
`privado.numero_cnj_valido` — o `authenticated` precisa de
`grant execute on function privado.numero_cnj_valido(text) to authenticated;`,
senão todo insert de processo falha por falta de permissão.

### 6.3 Telas

Menu, grupo **Clientes** (`permitido: pode.clientes`): Clientes · Processos ·
Atualizações (F4) · Contatos (F1) · Documentos (F3).

| Rota | Arquivo | Conteúdo |
|---|---|---|
| `/clientes` | `telas/clientes/lista.js` | Busca instantânea (nome, CPF/CNPJ, telefone, e-mail, número do processo — sem acento e sem máscara; use `semAcento` novo em `formato.js`) e filtros: responsável, área, situação do processo, "com representante legal", ativos/inativos. Colunas: nome, documento, telefone (link do WhatsApp), processos em andamento, responsável, última atualização. Botão "Novo cliente". Carrega tudo com `db.todos` e filtra no navegador. |
| `/clientes/:id` | `telas/clientes/cliente.js` | **Ficha do cliente** — ver abaixo. |
| `/processos` | `telas/processos.js` | Todos os processos: número formatado (`numeroCnj`), cliente, título, área, tribunal/órgão, responsável, situação, última atualização, próximo prazo. Filtros: situação (padrão: todos menos `encerrado` — os "arquivados" do protótipo), área, responsável, tribunal, busca. |

Diálogos (largos, `abrirDialogo`):

- `formularioCompleto(clienteId?)` em `telas/clientes/formulario.js` — grupos
  Identificação (nome, pessoa física/jurídica, CPF/CNPJ, RG ou IE, nascimento
  ou constituição, nacionalidade, estado civil, profissão, filiação,
  **concordância nos documentos**: "o cliente" / "a cliente" / "neutra (a)"),
  Contato, Endereço, Contato para recados (relação com sugestões: pai, mãe,
  tio, tia, avô, avó, vizinho, vizinha, outro), Representante legal, Dados
  bancários, Organização (responsável, observações). Salva por
  `db.rpc('salvar_cliente', { p })`. Validações na tela antes de mandar:
  `documentoValido`, telefone com DDD, CEP com 8 dígitos, UF.
- `formularioProcesso({ cliente_id, processo? })` em `telas/processos.js` —
  número (com máscara; ao sair do campo, valida com `numeroCnjValido` e sugere
  o tribunal com `tribunalDoNumero`), referência, título (ex.: "Reclamatória
  trabalhista contra Empresa X"), área, tribunal, órgão, responsável, situação,
  observações.

**Ficha do cliente** — a tela que faz "qualquer sócio atende o cliente do
outro" acontecer. De cima para baixo:

1. **Cabeçalho:** nome, documento, telefone (WhatsApp), e-mail, responsável,
   "aniversário em N dias" quando faltar uma semana ou menos. Ações: Editar
   dados · Iniciar cronômetro (F4) · Lançar atualização (F4) · Gerar
   documento (F3) · Nova tarefa (F5) · Histórico · Desativar.
2. **Processos** — lista com situação; "Novo processo".
3. **Atualizações** (F4) — linha do tempo, tempo dedicado, relatório de
   atividades.
4. **Tarefas e prazos abertos** (F5).
5. **Documentos gerados** (F3).
6. **Agenda** — próximos e últimos compromissos do cliente (`compromissos`
   filtrado por `cliente_id`; a política já esconde o particular dos outros).
   Só com `pode.agenda()`.
7. **Financeiro** — contratos (`v_contratos` por `cliente_id`), saldo e
   vencidas, com link para o contrato. Só com `pode.financeiro()`.
8. **Dados cadastrais** completos (`dl.dados`).
9. **Veio de:** o contato do site que o originou, se houver (F1).

Cada seção mostra "nada ainda" quando vazia e só aparece se o módulo dela já
existir — a ficha nasce em F2 com as seções 1, 2, 6, 7, 8 e 9 e ganha as
outras conforme as etapas chegam.

O cadastro rápido de `telas/clientes.js` **continua** como está: é o que deixa
lançar um contrato "em menos de um minuto" (preparação anterior, 6.10).

**Opcional — CEP:** ao sair do campo CEP, buscar
`https://viacep.com.br/ws/<cep>/json/` (gratuito; vai só o CEP) e preencher
logradouro, bairro, cidade e UF. Exige `https://viacep.com.br` no
`connect-src` (seção 2.4). Falha da busca nunca impede salvar.

### 6.4 Pronto quando

**Verificado em prévia fictícia e PostgreSQL 17 isolado.** Migração remota
e publicação ainda pendentes; próximo prazo entra com F5. CEP opcional não usado.

- [x] Cadastro completo grava e edita em uma transação; o histórico mostra
      antes e depois.
- [x] Secretária com `acesso_clientes` vê tudo; membro sem o nível lê
      `clientes` e `processos`, mas não `clientes_detalhes` (teste SQL).
- [x] Número de processo com dígito errado é recusado na tela (mensagem clara)
      e no banco.
- [x] Busca acha "José" digitando "jose", e o CPF digitado com ou sem máscara.
- [x] Ficha do cliente abre com processos, agenda e financeiro do cliente.

---

## 7. F3 · Documentos automáticos e ficha de atendimento

### 7.1 Por quê

"Uma coisa que a gente tem feito muito hoje, que é essa ficha de atendimento…
porque o cliente tem memória seletiva… às vezes o cliente fala: eu não mandei
você fazer isso… Ele vem aqui, eu converso com ele… e aí embaixo ele assina
dizendo que… foi isso a nossa conversa" [01:20]. E o mínimo que ele aceita:
"eu não preciso que o documento fique salvo no site ou no drive — o que eu
preciso é gerar, manusear conforme o cliente e imprimir" [20:00].

**Fluxo obrigatório:** gerar com os dados do cadastro → editar na tela →
imprimir. O registro de cada documento gerado não foi pedido, mas é barato e
combina com o "arquivo de provas" que ele quer (CLAUDE.md §2.2). A pasta no
Google Drive é desejável e depende de conta (seção 14).

### 7.2 Os modelos

Os oito do protótipo (`DOC_TYPES` em `fhlSpecificAutoDocsScript`) e um novo
(F4). Texto completo no **Apêndice A**.

| `documentos.modelo` | Título no papel | Do cadastro | Pedido na tela | Assinaturas |
|---|---|---|---|---|
| `procuracao` | Procuração | qualificação | advogados outorgados (padrão: todos os ativos com OAB) | Outorgante |
| `contrato_honorarios` | Contrato de Honorários | qualificação | processo, objeto, área, garantia (nenhuma, fiança, penhor, hipoteca, anticrese), valor total, entrada, nº de parcelas, valor da parcela, dia do vencimento, % de êxito (padrão 30), contratados | Contratante(s) · Contratado(a)(s) |
| `hipossuficiencia` | Declaração de Hipossuficiência | qualificação | — | Declarante |
| `declaracao_endereco` | Declaração | qualificação e endereço de quem declara | pessoa declarada e o CPF dela | Declarante |
| `declaracao_comparecimento` | Declaração | qualificação | advogado declarante, data do comparecimento, empresa destinatária (opcional) | Declarante |
| `ficha_atendimento` | Ficha de Atendimento ao Assistido | nome, CPF/CNPJ, nacionalidade, nascimento, filiação, endereço, estado civil, profissão, e-mail, telefone, banco, agência, conta, Pix, observações | nº dos autos e **fatos narrados e orientação** | Assistido |
| `renuncia` | Renúncia de Mandato | qualificação | processo, forma (com comunicação e prazo de 10 dias · parte segue com outro procurador), comunicação/ciência, renunciantes | uma linha por advogado renunciante |
| `prestacao_contas` | Termo de Prestação de Contas | qualificação | processo, data do contrato, demonstrativo (vencimento e valor × pagamento e valor pago), total contratado, total pago, valor repassado ao cliente | Contratante(s) · Contratado(a)(s) |
| `relatorio_atividades` | Relatório de Atividades | — | gerado pela tela de F4, não pelo formulário daqui | — |

A "hipoteca" que o CLAUDE.md cita entre os documentos é uma das garantias do
contrato de honorários, não um documento à parte.

### 7.3 Como a tela funciona

`/documentos/novo` (`telas/documentos/novo.js`) — duas colunas:

- **Esquerda:** 1. Cliente (`campoCliente`; carrega `clientes` + `clientes_detalhes`)
  · 2. Modelo (cartões com título e descrição) · 3. Complementos (os campos do
  modelo) · ações.
- **Direita:** a **prévia editável** — uma folha A4 com `contenteditable`.
- Dado do cadastro que falta sai entre colchetes e destacado (`[profissão]`),
  como no protótipo. Antes de imprimir, a tela avisa "Faltam N dados" com o
  link "Completar o cadastro" (formulário de F2).
- Mudar um complemento depois de editar a folha à mão refaz o texto e perde a
  edição: pergunte antes ("Refazer o texto a partir dos campos?").
- **Imprimir** grava o registro e chama `print()`. **Baixar para o Word** gera
  `.doc` (HTML com `<style>` embutido, como o protótipo fazia) e também grava.
  **Salvar sem imprimir** só grava.
- Parâmetros aceitos em `ctx.consulta`: `modelo`, `cliente`, `processo`,
  `contrato`, `compromisso`, `atualizacao` — é por eles que os outros módulos
  abrem esta tela já preenchida (7.6).

`/documentos/:id` (`telas/documentos/documento.js`): o documento gravado, só
leitura · Imprimir de novo · Baixar para o Word · Cancelar (com motivo: gerado
por engano) · Histórico.

`/documentos` (`telas/documentos/lista.js`): data, modelo, cliente, processo,
quem gerou; filtros por modelo, cliente e período.

### 7.4 Arquivos

| Arquivo | O que é |
|---|---|
| `sistema/js/documentos/partes.js` | **Puro.** `qualificacao(cliente, detalhes)`, `endereco(detalhes)`, `advogados(membros)`, `localEData(iso)`, flexão (`brasileiro/brasileira/brasileiro(a)`…), rótulos de estado civil, colchetes no que falta |
| `sistema/js/documentos/modelos.js` | **Puro.** `MODELOS`: `{ id, titulo, descricao, complementos: [campos], montar({ cliente, detalhes, advogados, dados, hoje }) }`, devolvendo `` html`…` `` — `nucleo/html.js` não usa DOM, então roda no teste do Node |
| `sistema/js/nucleo/higienizar.js` | Navegador. `higienizar(html)` por lista branca: `p h1 h2 h3 strong b em i u br ul ol li table thead tbody tr th td div span hr` e `img` só com `src` começando por `/sistema/img/`; atributos só `class` (começando por `doc-`), `colspan`, `rowspan`. Todo o resto sai — `style`, `on*`, `href`, `id`. Roda ao **gravar** e ao **mostrar** um documento gravado |
| `sistema/js/telas/documentos/{lista,novo,documento}.js` | Telas |
| `sistema/testes/documentos.test.mjs` | Qualificação com e sem dados, flexão m/f/neutra, PF e PJ, colchetes no que falta, cada modelo monta sem erro e contém nome e documento do cliente |

A CSP já bloqueia script embutido; `higienizar` é a segunda camada e também
tira o lixo de formatação de texto colado do Word.

### 7.5 Migração `documentos`

```sql
-- 10 · Documentos gerados

create table public.documentos (
  id                  uuid primary key default gen_random_uuid(),
  modelo              text not null check (modelo in (
                        'procuracao', 'contrato_honorarios', 'hipossuficiencia', 'declaracao_endereco',
                        'declaracao_comparecimento', 'ficha_atendimento', 'renuncia', 'prestacao_contas',
                        'relatorio_atividades')),
  titulo              text not null check (btrim(titulo) <> ''),
  cliente_id          uuid not null references public.clientes (id),
  processo_id         uuid references public.processos (id),
  contrato_id         uuid references public.contratos (id),
  compromisso_id      uuid references public.compromissos (id),
  -- O que foi preenchido no formulário: dá para gerar de novo.
  dados               jsonb not null default '{}'::jsonb,
  -- O texto final, depois das edições na tela, já higienizado.
  conteudo            text not null check (char_length(conteudo) between 1 and 400000),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid
);

create index documentos_cliente on public.documentos (cliente_id, criado_em desc);
select privado.aplicar_padrao('public.documentos');
create trigger b_cancelamento before update on public.documentos
  for each row execute function privado.registrar_cancelamento();
```

Políticas: ver, incluir e alterar com `privado.edita_clientes()`. GRANT:
`insert (modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, dados, conteudo)`
e `update (cancelado_em, motivo_cancelamento)` — **o texto não muda depois de
gravado**: para corrigir, gera-se outro. (F4 acrescenta `atualizacao_id`.)

### 7.6 Ligações com os outros módulos

| De onde | Botão | Abre `/documentos/novo` com |
|---|---|---|
| Ficha do cliente (F2) | Gerar documento | `cliente` |
| Contrato no Financeiro (cabeçalho de `telas/financeiro/contrato.js`) | Contrato de honorários | `modelo=contrato_honorarios&cliente&processo&contrato` — total, entrada, nº e valor das parcelas, dia do vencimento e % de êxito saem do contrato |
| Contrato no Financeiro | Prestação de contas | `modelo=prestacao_contas&…&contrato` — o demonstrativo sai de `v_parcelas` e `v_recebimentos` reais, no lugar dos colchetes vermelhos do protótipo |
| Compromisso na Agenda (`detalhe()` em `telas/agenda.js`) | Declaração de comparecimento | `modelo=declaracao_comparecimento&cliente&compromisso` — dia do compromisso e o advogado responsável |
| Atualização (F4) | Ficha de atendimento | `modelo=ficha_atendimento&cliente&processo&atualizacao` — o relato entra em "fatos narrados e orientação" |

Botão do Financeiro só com `pode.financeiro()` e `pode.clientes()`; sem
`pode.financeiro()`, a tela de documentos não tenta ler contrato.

### 7.7 Impressão

- `.documento-folha` no `sistema.css`: 210 × 297 mm na tela, com sombra leve;
  no papel, sem sombra e sem margem extra.
- Antes de `print()`: `document.body.classList.add('imprimindo-documento')`;
  no evento `afterprint`, remove. No `@media print`, com essa classe, só a folha
  aparece (o resto da tela já some com as regras de impressão existentes).
- Fonte serifada do sistema (`'Times New Roman', Georgia, serif`) — sem webfont.
  Cabeçalho com `/sistema/img/logo.svg`; rodapé com endereço, telefone e e-mail
  de `sistema/js/escritorio.js`.
- Contrato de várias páginas: rodapé repetido com `position: fixed` dentro do
  `@media print`. Conferir no Chrome antes de dar por pronto.

### 7.8 A conferir com o Vinícius — não decida

1. **Os DOCX originais.** O protótipo diz que os modelos se basearam neles.
   Pedir os arquivos e comparar com o Apêndice A.
2. **FAA, art. 298 × art. 299 do Código Penal.** O texto cita o art. 298
   (falsificação de documento particular); declaração de veracidade costuma
   citar o 299 (falsidade ideológica). **[propor ao Vinícius]**
3. **FAA como prova da conversa** — o uso que ele descreveu [01:20]. O texto do
   protótipo só declara que os dados são verdadeiros. **[propor ao Vinícius]**
   acrescentar antes da assinatura: "Declaro, ainda, que recebi as orientações
   acima e que este é o resumo fiel do que foi conversado nesta data."
4. **Contrato.** O campo "Entrada" existe no formulário do protótipo, mas não
   aparece no texto da cláusula 3.1. E a 3.5 chama de "compensatória" a multa
   por atraso — o termo usual é moratória (já anotado na preparação anterior,
   6.5). Os números da 3.5 (1% ao mês e 10%) são os mesmos do critério padrão
   do Financeiro: mudar um não muda o outro.
5. **Declaração de endereço.** No protótipo, quem declara é o cliente escolhido,
   e a "pessoa declarada" mora com ele. O uso comum é o inverso (o titular do
   comprovante declara que o cliente mora com ele). Confirmar.
6. **Renúncia.** O aviso "pedir documento de identidade com foto, conforme IN
   73/2021 CGJ/TJPR" é instrução para a equipe: fica na tela e sai do papel?
7. **Pessoa jurídica e representante legal** — o protótipo não tem texto para
   isso. O Apêndice A traz uma proposta.
8. **E-mail do rodapé.** O protótipo usa `contato@casenhali.com`; o site,
   `contato@fhladvocacia.com.br` (conflito do CLAUDE.md §7). Use `EMAIL` de
   `escritorio.js` até a resposta.

### 7.9 Pronto quando

**Verificado localmente com cadastros fictícios, Chrome e PostgreSQL 17.**
PDF A4 de duas páginas conferido visualmente, rodapé em ambas e marca escura
derivada da fonte única. Textos e DOCX originais do §7.8 continuam pendentes
de revisão; o Word foi verificado como arquivo exportado, sem abrir o Word.

- [x] Os oito modelos geram com dados reais do cadastro e colchetes no que falta.
- [x] Editar na prévia e imprimir sai igual à tela: só a folha, em A4.
- [x] Cada impressão fica registrada — quem, quando, cliente, modelo, texto final.
- [x] Contrato de honorários e prestação de contas puxam o Financeiro.
- [x] Texto colado do Word perde estilo e script.
- [x] Sem `acesso_clientes`, `documentos` não é lido (teste SQL).

---

## 8. F4 · Atualizações com cronômetro

### 8.1 Por quê

"Atualizações, isso que é a parte importante" [03:20]. Dois objetivos, os dois
nas palavras dele:

- **Qualquer sócio atende o cliente do outro:** "Ah, Vinícius falou pra ele tal
  situação. Aí eu já sei… pra passar uma credibilidade de que todo mundo sabe
  do que está acontecendo."
- **O relógio prova o trabalho:** "uma hora de início e uma hora de fim. Pro
  cliente ver que eu não estou só trabalhando no processo… você já atendeu ele
  por quinze horas."

E a regra de prova: "Ah, Vinícius, mas e se alguém apagar? … aparecia um
registro de que o Vinícius apagou… eu apago o que eu fiz e o Marlon apaga o que
ele fez e o administrador apagaria de todo mundo" [05:00].

O nome do módulo é o dele: **Atualizações** (no protótipo, "Atualização do
caso"). Tabela `atualizacoes`, rota `/atualizacoes`.

### 8.2 Regras

- Uma atualização = cliente (e processo, se houver), **quem** (o login),
  participantes (atendimento em conjunto), tipo, início, fim, relato e próxima
  providência.
- **Não se apaga.** Cada um corrige ou cancela (com motivo) o que lançou; o
  administrador, o de todos. O histórico guarda antes e depois — é o "registro
  de quem apagou" que ele pediu.
- **Cronômetro:** iniciar e parar usam a hora do **servidor**. Um rodando por
  pessoa. O relógio aparece em qualquer tela e em qualquer aparelho de quem
  iniciou.
- **Lançada à mão** (trabalho feito ontem, petição escrita em casa) é aceita,
  mas fica marcada como não cronometrada. Mexer na hora de uma cronometrada
  tira a marca. A tela interna mostra os dois tempos separados.
- **Anotação sem tempo** ("sentença publicada, cliente avisado"): início igual
  ao fim.

### 8.3 Migração `atualizacoes`

```sql
-- 11 · Atualizações dos casos, com cronômetro

create table public.atualizacoes (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes (id),
  processo_id         uuid references public.processos (id),
  membro_id           uuid not null references public.membros (id),
  -- "Vai ter horas que vocês dois vão conseguir atender em conjunto."
  participantes       uuid[] not null default '{}',
  tipo                text not null check (tipo in (
                        'atendimento_presencial', 'atendimento_online', 'telefone', 'whatsapp', 'email',
                        'reuniao', 'peca', 'pesquisa', 'audiencia', 'diligencia', 'outro')),
  inicio              timestamptz not null,
  fim                 timestamptz,                -- nulo enquanto o cronômetro roda
  -- Verdadeiro só quando início e fim vieram do relógio do servidor
  -- (iniciar_cronometro / parar_cronometro). Hora mexida à mão perde a marca.
  cronometrado        boolean not null default false,
  relato              text,
  proxima_providencia text,
  compromisso_id      uuid references public.compromissos (id),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid,
  constraint atualizacao_periodo check (fim is null or fim >= inicio)
);

-- Um cronômetro rodando por pessoa.
create unique index atualizacoes_um_cronometro on public.atualizacoes (membro_id)
  where fim is null and cancelado_em is null;
create index atualizacoes_cliente on public.atualizacoes (cliente_id, inicio desc);
create index atualizacoes_processo on public.atualizacoes (processo_id);
create index atualizacoes_membro on public.atualizacoes (membro_id, inicio desc);

select privado.aplicar_padrao('public.atualizacoes');
create trigger b_cancelamento before update on public.atualizacoes
  for each row execute function privado.registrar_cancelamento();

create function privado.validar_atualizacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.membros m where m.id = new.membro_id and m.ativo) then
    raise exception 'Quem atendeu precisa ser um membro ativo.' using errcode = 'P0001';
  end if;
  if new.membro_id = any (new.participantes)
     or (select count(*) from public.membros m where m.id = any (new.participantes) and m.ativo)
        <> cardinality(new.participantes) then
    raise exception 'Participantes precisam ser outros membros ativos.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' and new.fim is null and not new.cronometrado then
    raise exception 'Informe a hora de fim, ou use Iniciar cronômetro.' using errcode = 'P0001';
  end if;

  -- Hora mexida fora de parar_cronometro deixa de valer como cronometrada.
  if tg_op = 'UPDATE' and old.cronometrado
     and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
     and coalesce(current_setting('fhl.cronometro', true), '') <> 'parar' then
    new.cronometrado := false;
  end if;

  return new;
end
$$;

create trigger c_validar before insert or update on public.atualizacoes
  for each row execute function privado.validar_atualizacao();

-- A ficha de atendimento pode nascer de uma atualização (F3).
alter table public.documentos add column atualizacao_id uuid references public.atualizacoes (id);
grant insert (atualizacao_id) on public.documentos to authenticated;
```

**Políticas** (cada um o seu, o administrador o de todos [05:00]):

```sql
alter table public.atualizacoes enable row level security;

create policy "atualizacoes: ver" on public.atualizacoes
  for select to authenticated using ((select privado.edita_clientes()));
create policy "atualizacoes: incluir" on public.atualizacoes
  for insert to authenticated
  with check ((select privado.edita_clientes())
              and (membro_id = (select privado.meu_membro_id()) or (select privado.eh_admin())));
create policy "atualizacoes: alterar" on public.atualizacoes
  for update to authenticated
  using ((select privado.edita_clientes())
         and (membro_id = (select privado.meu_membro_id()) or (select privado.eh_admin())))
  with check ((select privado.edita_clientes())
              and (membro_id = (select privado.meu_membro_id()) or (select privado.eh_admin())));

revoke all on public.atualizacoes from anon, authenticated;
grant select on public.atualizacoes to authenticated;
grant insert (cliente_id, processo_id, membro_id, participantes, tipo, inicio, fim, relato,
              proxima_providencia, compromisso_id)
  on public.atualizacoes to authenticated;
grant update (cliente_id, processo_id, participantes, tipo, inicio, fim, relato,
              proxima_providencia, cancelado_em, motivo_cancelamento)
  on public.atualizacoes to authenticated;
grant all on public.atualizacoes to service_role;
```

`cronometrado` fica fora dos GRANTs: só as duas funções abaixo o escrevem.

**Funções do cronômetro** (`security definer`):

```sql
create function public.iniciar_cronometro(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não inclui as atualizações dos clientes.' using errcode = '42501';
  end if;

  insert into public.atualizacoes (cliente_id, processo_id, membro_id, tipo, inicio, cronometrado,
                                   relato, compromisso_id)
  values ((p ->> 'cliente_id')::uuid, nullif(p ->> 'processo_id', '')::uuid, privado.meu_membro_id(),
          coalesce(nullif(p ->> 'tipo', ''), 'atendimento_presencial'), now(), true,
          nullif(btrim(p ->> 'relato'), ''), nullif(p ->> 'compromisso_id', '')::uuid)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Você já tem um cronômetro rodando. Pare o atual antes de começar outro.'
      using errcode = 'P0001';
end
$$;

-- p_fim: "esqueci de parar" — a hora real informada. Aí deixa de ser cronometrada.
create function public.parar_cronometro(p_id uuid, p_relato text default null,
                                        p_proxima text default null, p_fim timestamptz default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.atualizacoes;
begin
  if not privado.edita_clientes() then
    raise exception 'Seu acesso não inclui as atualizações dos clientes.' using errcode = '42501';
  end if;

  select * into v from public.atualizacoes where id = p_id for update;
  if not found or v.fim is not null or v.cancelado_em is not null then
    raise exception 'Este cronômetro não está rodando.' using errcode = 'P0001';
  end if;
  if v.membro_id <> privado.meu_membro_id() and not privado.eh_admin() then
    raise exception 'Só quem iniciou, ou o administrador, para este cronômetro.' using errcode = '42501';
  end if;
  if p_fim is not null and (p_fim <= v.inicio or p_fim > now()) then
    raise exception 'A hora de fim precisa ser depois do início e antes de agora.' using errcode = 'P0001';
  end if;

  if p_fim is null then
    perform set_config('fhl.cronometro', 'parar', true);  -- só nesta transação
  end if;

  update public.atualizacoes
     set fim = coalesce(p_fim, now()),
         relato = coalesce(nullif(btrim(p_relato), ''), relato),
         proxima_providencia = coalesce(nullif(btrim(p_proxima), ''), proxima_providencia)
   where id = p_id;

  -- Veio da agenda: o compromisso vira "realizado".
  if v.compromisso_id is not null then
    update public.compromissos set situacao = 'realizado'
     where id = v.compromisso_id and situacao = 'agendado' and cancelado_em is null;
  end if;
end
$$;
```

`revoke execute … from public, anon` e `grant execute … to authenticated` nas
duas.

### 8.4 O relógio na tela

`sistema/js/telas/atualizacoes/cronometro.js`:

- `ligarCronometro(raizDaCasca)` — chamado por `app.js` logo depois de
  `desenharCasca()`, se `pode.clientes()`. Lê a atualização com `fim` nulo do
  próprio membro e mostra um selo fixo em `.lateral__rodape` e em `.topo-movel`:
  **"● Rodrigo · 00:42:13 · Parar"**. Atualiza só o texto, a cada segundo — não
  redesenha a casca. Rótulo acessível "Cronômetro de Rodrigo, desde 14:02"; os
  segundos com `aria-hidden="true"` (leitor de tela não deve ouvir um número
  mudando sem parar).
- `iniciarCronometro({ cliente_id?, processo_id?, compromisso_id?, tipo? })` —
  diálogo curto (cliente com `campoCliente`, processo do cliente, tipo, relato
  inicial opcional) → `db.rpc('iniciar_cronometro', { p })` → atualiza o selo.
- `pararCronometro()` — diálogo: relato (com foco), próxima providência,
  "situação do processo depois disto" (opcional; grava em `processos` na
  sequência) e "gerar ficha de atendimento ao salvar" (abre F3 preenchido).
  **Rodando há mais de 8 horas:** o diálogo pergunta "O cronômetro está rodando
  há 14 h. Parou na hora certa?" e oferece informar a hora real (`p_fim`).

### 8.5 Telas

- **`/atualizacoes`** (`telas/atualizacoes/lista.js`) — "Atualizações" · "Cada
  atendimento e cada trabalho feito, com quem fez e quanto tempo levou". Ações:
  **Iniciar cronômetro** (principal) e **Lançar atualização**. Filtros: cliente,
  processo, quem, tipo, período (padrão: últimos 30 dias). Indicadores: tempo
  no período, atualizações, clientes atendidos. Lista agrupada por dia: início,
  fim e duração (`duracao()`), cliente (link para a ficha), processo, tipo,
  quem e participantes, começo do relato (abre inteiro), próxima providência,
  selo "cronômetro" ou "lançada à mão". Ações: Editar (o seu, ou admin) ·
  Cancelar (motivo) · Ficha de atendimento · Histórico.
- **Lançar atualização** (diálogo): cliente, processo, tipo, dia, início e fim
  — ou "sem tempo, só anotação" —, participantes, relato, próxima providência
  e "situação do processo depois disto".
- **Na ficha do cliente (F2):** linha do tempo, e "Tempo dedicado: 15 h 20 min
  desde 12/03/2026 — Vinícius 9 h, Juliana 6 h 20 min", com o botão
  **Relatório de atividades**.
- **`/atualizacoes/relatorio?cliente=&de=&ate=&processo=`**
  (`telas/atualizacoes/relatorio.js`) — página para imprimir na mesma folha
  A4 de F3: cabeçalho do escritório, cliente, período e a tabela data ·
  início–fim · duração · quem · tipo · processo · [resumo], com o total.
  "Incluir o relato" fica **desligado** por padrão — o relato é anotação
  interna **[propor ao Vinícius]**. Imprimir grava em `documentos` como
  `relatorio_atividades`: fica a prova de que o relatório foi entregue.

### 8.6 Ligações

- **Hoje e Agenda:** no compromisso de atendimento do dia, botão **Iniciar
  atendimento** → `iniciarCronometro` com cliente, compromisso e tipo
  (presencial → `atendimento_presencial`; online → `atendimento_online`); marca
  a chegada se ainda não estiver marcada. Parar marca o compromisso como
  realizado (já feito no banco). É a ligação que a preparação anterior previa
  (7.5.8).
- **Financeiro (opcional, só `pode.financeiro()`):** na ficha do cliente,
  "Recebido × tempo dedicado" — total recebido (`v_recebimentos` por cliente),
  horas e o valor por hora. É o argumento dele [03:20], para uso interno.

### 8.7 Lógica pura

`sistema/js/dominio/tempo.js`: `minutosDe(atualizacao, agora)` (rodando conta
até `agora`), `totais(lista)` → `{ total, cronometrado, manual, porMembro }`
(participantes contam o tempo inteiro para cada um). Teste em
`sistema/testes/tempo.test.mjs`.

### 8.8 Pronto quando

**Implementado e verificado localmente.** Retomada/sincronização confirmadas
em duas páginas com o mesmo perfil; dois computadores físicos dependem de
ambiente acessível aos dois e ficam para a validação após o teste do Ithalo.
Tempos manuais, zero, participantes, timer esquecido, correção de horários,
chegada/conclusão e relatório foram conferidos. Recebido × tempo é opcional
e não foi incluído.

- [ ] Iniciar num computador e ver o relógio rodando em outro, com o mesmo login.
- [x] Segundo cronômetro da mesma pessoa é recusado com a mensagem do banco.
- [x] Mexer na hora de uma cronometrada tira a marca; o histórico mostra antes e depois.
- [x] Sócia não edita a atualização do outro; admin edita e cancela qualquer uma, com motivo.
- [x] Relatório de atividades imprime e fica em Documentos.
- [x] "Iniciar atendimento" na agenda liga cliente e compromisso; parar marca realizado.

---

## 9. F5 · Tarefas e prazos

### 9.1 Por quê

Sobre a intimação que vira trabalho [~16:00]: "se vai ser um prazo, se vai
ser uma audiência… marcar um responsável… vincular a um cliente… Quem que é o
responsável para cumprir? Ah, vai ser a Juliana. Qual o prazo? … uma
impugnação, contestação, recurso, uma manifestação, uma urgência… A data base,
contagem, dias úteis, dias corridos… tem algumas vezes que o juiz intima a gente
para cumprir algo em horas… o prazo fatal… e um prazo de entrega, que seria
geralmente eu coloco de três a quatro dias… prioridade alta, urgente… e aí ele
iria lá por tarefas… e eu colocar que já fiz."

Sobre a tela de prazos [17:00]: "não seria uma agenda, mas seria mais ou menos
um resumo… data, prazo, origem, processo, responsável, situação… filtro de
diário, semanal, mensal e anual… e até mesmo um controle interno… o cliente vem
e fala assim: não, você não fez — mas está aqui."

O protótipo tinha a delegação: título, cliente, delegada por, responsável,
prioridade (baixa, média, alta, urgente), prazo, situação (pendente, em
andamento, concluída), tipo e "bloquear agenda?" com período.

### 9.2 Decisão de desenho: prazo processual é uma tarefa com data fatal

Uma tabela só, `tarefas`. **Tarefas** mostra tudo; **Prazos** é a mesma tabela
vista por data. Assim não existe prazo cumprido com tarefa aberta, e o "eu
colocar que já fiz" é um botão. A diferença fica no `tipo`:

- `tarefa` — delegação comum, com prazo de entrega opcional. Qualquer membro cria.
- `prazo` — prazo processual: tem data fatal, contagem e base. Só quem tem
  `acesso_prazos` cria ou muda esses campos [19:00]; quem é responsável conclui.

### 9.3 Regras de contagem — implemente assim, a validar pelo Vinícius

| Contagem | Padrão para | Regra |
|---|---|---|
| `uteis` | todas as áreas menos criminal (CPC art. 219; CLT art. 775) | Não conta o dia da base. Conta só dias úteis, a partir do primeiro dia útil seguinte. |
| `corridos` | criminal (CPP art. 798) | Começa no primeiro dia útil depois da base (Súmula 310 do STF) e conta dias seguidos; se o último cair em dia não útil, passa para o próximo útil. |
| `horas` | quando o juiz fixa em horas | Minuto a minuto a partir do instante da intimação (Código Civil, art. 132, §4º): fatal = base + N horas. |

- **Dia não útil** = sábado, domingo, os **feriados nacionais fixos em lei**
  (1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11 e 25/12) e o que estiver na
  tabela `feriados` para o tribunal do processo ou para todos.
- **Recesso:** de 20/12 a 20/01, inclusive, o prazo não corre (CPC art. 220;
  CLT art. 775-A; CPP art. 798-A, com exceções — réu preso, Lei Maria da Penha,
  medida urgente). Ligado por padrão; desligável em cada prazo.
- **Publicação no DJEN:** considera-se publicada no primeiro dia útil seguinte
  ao da disponibilização (Lei 11.419/2006, art. 4º, §3º); o prazo começa no
  primeiro dia útil depois da publicação (§4º). Na tarefa, a **base é a data da
  publicação** — F6 já a entrega calculada.
- **Na dúvida, o dia é útil.** Carnaval, Sexta-feira Santa, Corpus Christi,
  28/10, 8/12 e os feriados de Paranaguá **só contam se estiverem cadastrados**
  em Feriados. Um feriado esquecido faz o sistema sugerir um prazo **mais
  curto** que o real — o erro seguro. O contrário faria perder prazo.
- **A data fatal é sugestão.** A tela mostra a memória da contagem (dia a dia,
  o que foi pulado e por quê), e o campo da data fatal continua editável. A
  conferência humana é obrigatória, como no protótipo ("esta aba não substitui
  a conferência jurídica").
- **Prazo de entrega** = fatal menos N dias úteis — **padrão 3**, editável por
  prazo ("geralmente eu coloco de três a quatro dias, dependendo da dificuldade").
- Prazo em dias vence às 23:59 do último dia, em Brasília (peticionamento
  eletrônico vai até o fim do dia — Lei 11.419/2006, art. 10, §1º).

### 9.4 Migração `tarefas_prazos`

```sql
-- 12 · Tarefas e prazos

create table public.feriados (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  nome         text not null check (btrim(nome) <> ''),
  -- Sigla do tribunal (TJPR, TRT9, TRF4…). Nulo: vale para todos.
  tribunal     text check (tribunal ~ '^[A-Z0-9]{2,10}$'),
  -- 'suspensao': portaria que suspende os prazos sem ser feriado.
  tipo         text not null default 'feriado' check (tipo in ('feriado', 'suspensao')),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint feriados_unico unique nulls not distinct (data, tribunal)
);
select privado.aplicar_padrao('public.feriados');

create table public.tarefas (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null default 'tarefa' check (tipo in ('tarefa', 'prazo')),
  titulo              text not null check (btrim(titulo) <> ''),
  ato                 text,   -- "Contestação", "Recurso", "Diligência externa"…
  descricao           text,
  cliente_id          uuid references public.clientes (id),
  processo_id         uuid references public.processos (id),
  responsavel_id      uuid not null references public.membros (id),
  prioridade          text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  situacao            text not null default 'pendente' check (situacao in ('pendente', 'em_andamento', 'concluida')),
  entrega             date,          -- prazo de entrega (interno)
  -- Só prazo processual. Em dias: 23:59 do último dia, em Brasília; em horas: o instante.
  fatal_em            timestamptz,
  contagem            text check (contagem in ('uteis', 'corridos', 'horas')),
  base_em             timestamptz,   -- publicação, intimação ou ciência
  quantidade          integer check (quantidade between 1 and 3650),
  recesso             boolean not null default true,
  -- A contagem sugerida, dia a dia — como a memória do cálculo do Financeiro.
  memoria_prazo       jsonb,
  concluida_em        timestamptz,
  concluida_por       uuid,
  compromisso_id      uuid references public.compromissos (id),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid,
  constraint tarefa_prazo_completo check (
    (tipo = 'prazo' and fatal_em is not null and contagem is not null)
    or (tipo = 'tarefa' and fatal_em is null and contagem is null and base_em is null and quantidade is null))
);

create index tarefas_responsavel on public.tarefas (responsavel_id, situacao);
create index tarefas_fatal on public.tarefas (fatal_em) where fatal_em is not null;
create index tarefas_entrega on public.tarefas (entrega) where entrega is not null;
create index tarefas_processo on public.tarefas (processo_id);
create index tarefas_cliente on public.tarefas (cliente_id);
select privado.aplicar_padrao('public.tarefas');
create trigger b_cancelamento before update on public.tarefas
  for each row execute function privado.registrar_cancelamento();

create function privado.validar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.membros m where m.id = new.responsavel_id and m.ativo) then
    raise exception 'O responsável precisa ser um membro ativo.' using errcode = 'P0001';
  end if;

  -- Prazo processual: só quem gerencia prazos cria ou muda [19:00].
  if (tg_op = 'INSERT' and new.tipo = 'prazo')
     or (tg_op = 'UPDATE'
         and (new.tipo, new.fatal_em, new.contagem, new.base_em, new.quantidade, new.recesso)
             is distinct from (old.tipo, old.fatal_em, old.contagem, old.base_em, old.quantidade, old.recesso)) then
    if not privado.gerencia_prazos() then
      raise exception 'Seu acesso não permite criar ou mudar prazo processual.' using errcode = 'P0001';
    end if;
  end if;

  -- "E eu colocar que já fiz": quem e quando, pelo login.
  if new.situacao = 'concluida' then
    if tg_op = 'INSERT' or old.situacao <> 'concluida' then
      new.concluida_em := now();
      new.concluida_por := privado.meu_membro_id();
    else
      new.concluida_em := old.concluida_em;
      new.concluida_por := old.concluida_por;
    end if;
  else
    new.concluida_em := null;
    new.concluida_por := null;
  end if;

  return new;
end
$$;

create trigger c_validar before insert or update on public.tarefas
  for each row execute function privado.validar_tarefa();

-- Tarefa nova, com o bloqueio de agenda opcional, numa transação só.
create function public.criar_tarefa(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_resp uuid := coalesce(nullif(p ->> 'responsavel_id', '')::uuid, privado.meu_membro_id());
  v_bloq jsonb := p -> 'bloquear';
  v_comp uuid;
  v_id   uuid;
begin
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;

  -- "Bloquear agenda?" do protótipo: quem delega bloqueia a agenda de quem vai
  -- cumprir. Exceção deliberada à regra da agenda (cada um edita a sua), por
  -- ser bloqueio ligado à tarefa e ficar no histórico.
  if jsonb_typeof(v_bloq) = 'object' then
    if privado.acesso_agenda() = 'nenhum' then
      raise exception 'Seu acesso não inclui a agenda: salve a tarefa sem bloquear.' using errcode = 'P0001';
    end if;
    insert into public.compromissos (membro_id, tipo, modalidade, titulo, inicio, fim, cliente_id, observacoes)
    values (v_resp, 'bloqueio', 'diligencia', 'Tarefa: ' || btrim(p ->> 'titulo'),
            (v_bloq ->> 'inicio')::timestamptz, (v_bloq ->> 'fim')::timestamptz,
            nullif(p ->> 'cliente_id', '')::uuid, 'Bloqueio criado junto com a tarefa.')
    returning id into v_comp;
  end if;

  insert into public.tarefas (tipo, titulo, ato, descricao, cliente_id, processo_id, responsavel_id,
                              prioridade, entrega, fatal_em, contagem, base_em, quantidade, recesso,
                              memoria_prazo, compromisso_id)
  values (coalesce(nullif(p ->> 'tipo', ''), 'tarefa'), btrim(p ->> 'titulo'), nullif(btrim(p ->> 'ato'), ''),
          nullif(btrim(p ->> 'descricao'), ''), nullif(p ->> 'cliente_id', '')::uuid,
          nullif(p ->> 'processo_id', '')::uuid, v_resp, coalesce(nullif(p ->> 'prioridade', ''), 'normal'),
          nullif(p ->> 'entrega', '')::date, nullif(p ->> 'fatal_em', '')::timestamptz,
          nullif(p ->> 'contagem', ''), nullif(p ->> 'base_em', '')::timestamptz,
          nullif(p ->> 'quantidade', '')::integer, coalesce((p ->> 'recesso')::boolean, true),
          p -> 'memoria_prazo', v_comp)
  returning id into v_id;

  return v_id;
end
$$;

-- O que as telas Tarefas e Prazos leem: nomes ao lado e o alerta já calculado.
create view public.v_tarefas with (security_invoker = true) as
select
  t.id, t.tipo, t.titulo, t.ato, t.descricao,
  t.cliente_id, cl.nome as cliente_nome,
  t.processo_id, pr.numero as processo_numero, pr.titulo as processo_titulo, pr.tribunal, pr.area,
  t.responsavel_id, t.prioridade, t.situacao, t.entrega,
  t.fatal_em, t.contagem, t.base_em, t.quantidade, t.recesso, t.memoria_prazo,
  t.concluida_em, t.concluida_por, t.compromisso_id,
  t.cancelado_em, t.motivo_cancelamento,
  t.criado_em, t.criado_por, t.alterado_em, t.alterado_por,
  case
    when t.cancelado_em is not null then 'cancelada'
    when t.situacao = 'concluida' then 'concluida'
    when t.fatal_em is not null and t.fatal_em < now() then 'vencida'
    when t.fatal_em is not null
         and (t.fatal_em at time zone 'America/Sao_Paulo')::date = privado.hoje() then 'fatal_hoje'
    when t.entrega is not null and t.entrega < privado.hoje() then 'atrasada'
    when t.entrega = privado.hoje() then 'entrega_hoje'
    else 'em_dia'
  end as alerta
from public.tarefas t
left join public.clientes cl on cl.id = t.cliente_id
left join public.processos pr on pr.id = t.processo_id;
```

**Políticas e privilégios:**

| Tabela | ver | incluir | alterar |
|---|---|---|---|
| `feriados` | `privado.eh_membro()` | `privado.gerencia_prazos()` | `privado.gerencia_prazos()` |
| `tarefas` | `privado.eh_membro()` | `privado.eh_membro()` | `eh_membro()` **e** (`criado_por` = eu **ou** `responsavel_id` = eu **ou** `eh_admin()`); `with check` só `eh_membro()` — quem delega pode passar para outra pessoa |

GRANT em `tarefas`: insert e update de `tipo, titulo, ato, descricao,
cliente_id, processo_id, responsavel_id, prioridade, situacao, entrega,
fatal_em, contagem, base_em, quantidade, recesso, memoria_prazo` (+ no update
`cancelado_em, motivo_cancelamento`). `compromisso_id` só pela função. `select`
na view `v_tarefas` para `authenticated` (e `revoke` de `anon`).

### 9.5 Lógica pura

```js
// sistema/js/dominio/feriados.js
export function pascoa(ano)                      // 'AAAA-MM-DD' (algoritmo de Meeus/Jones/Butcher)
export function feriadosNacionaisFixos(ano)      // Map 'AAAA-MM-DD' → nome — os 9 da lei, nada mais
export function sugestoesDoAno(ano)              // [{ data, nome }]: Carnaval (seg. e ter.), Sexta-feira Santa,
                                                 // Corpus Christi — para a tela Feriados OFERECER, nunca para contar
export function diasNaoUteis(cadastrados, tribunal, anos)
                                                 // Set: fixos nacionais + cadastrados ativos com tribunal nulo ou igual

// sistema/js/dominio/prazos.js
export const ehRecesso = (iso) => /* 20/12 a 20/01, inclusive */;
export function ehDiaUtil(iso, naoUteis)
export function proximoDiaUtil(iso, naoUteis)
export function dataDaPublicacao(disponibilizacao, naoUteis)   // F6
export function calcularPrazo({ base, quantidade, contagem, naoUteis, recesso = true })
  // dias → { fatal: 'AAAA-MM-DD', inicio: 'AAAA-MM-DD', memoria: [{ dia, conta: n | null, motivo }] }
  // horas → { fatal: instante ISO, memoria }  (base é instante)
export function dataDeEntrega(fatal, diasUteisAntes, naoUteis)
export const CONTAGEM_POR_AREA = { criminal: 'corridos' };      // as demais: 'uteis'
```

Vetores de teste no **Apêndice C** — em `sistema/testes/prazos.test.mjs` e
`feriados.test.mjs`. Calculados com estas regras e conferidos à mão: se o teste
falhar, o erro está no código, não no vetor.

### 9.6 Telas

Menu, grupo **Tarefas e prazos** (sem `permitido`): Tarefas · Prazos ·
Intimações (F6, `pode.prazos`) · Feriados (`pode.prazos`).

- **`/tarefas`** (`telas/tarefas/lista.js`): filtro principal **Minhas · Que eu
  deleguei · Todas**; situação (padrão: abertas), prioridade, busca. Cada
  linha: título e ato, cliente/processo, responsável (avatar com a cor), quem
  delegou, entrega ("em 3 dias", "atrasada"), fatal (se prazo), prioridade,
  situação. Ações: **Concluir** (um clique), Em andamento, Editar, Cancelar
  (motivo), Histórico.
- **Diálogo da tarefa** (`telas/tarefas/formulario.js`, largo): título; tipo
  (Tarefa · Prazo processual — este só com `pode.prazos()`); ato (sugestões:
  Petição inicial, Contestação, Impugnação, Réplica, Manifestação, Recurso,
  Embargos, Cumprimento de sentença, Diligência externa, Preparar audiência,
  Outro); cliente (`campoCliente`, opcional); processo (os do cliente);
  responsável (`membrosAtivos()`, padrão: quem está lançando); prioridade;
  entrega; descrição.
  - **Prazo processual:** base ("Publicação ou intimação" — e a hora, se for em
    horas); contagem (Dias úteis · Dias corridos · Horas — padrão pela área do
    processo); quantidade; "Suspender no recesso (20/12 a 20/01)" → mostra
    **"Prazo fatal sugerido: terça, 27/10/2026"**, o link "ver a contagem" (a
    memória) e o campo editável da data fatal; "Entregar N dias úteis antes"
    (padrão 3) → data de entrega.
  - **Bloquear a agenda do responsável?** → dia, início e fim; vira um
    compromisso tipo `bloqueio`, modalidade `diligencia`, "Tarefa: …".
  - Nova: `db.rpc('criar_tarefa', { p })`. Editar: `db.alterar('tarefas', …)`.
- **`/prazos`** (`telas/tarefas/prazos.js`) — o "resumo" [17:00]: abas **Hoje ·
  Semana · Mês · Ano · Todos abertos** (+ de/até). Filtros: responsável,
  situação, "só prazos processuais". Tabela: prazo fatal (data, ou data e hora;
  em vermelho se vencido) · entrega · ato · processo/cliente · responsável ·
  prioridade · situação · origem (intimação, com link; ou manual) ·
  descrição. No topo: vencem hoje · nesta semana · atrasados. **Imprimir**.
  Opcional: as audiências da agenda no período (origem "Agenda"), por
  `agenda_periodo`, quando `pode.agenda()`.
- **`/feriados`** (`telas/feriados.js`, `pode.prazos`): por ano. Os fixos
  nacionais aparecem calculados, só leitura; os cadastrados com data, nome,
  tribunal (ou "Todos"), tipo e ativo. "Novo". **"Sugerir datas de {ano}"**:
  mostra Carnaval, Sexta-feira Santa e Corpus Christi do ano para marcar e
  salvar, e lembra de conferir os calendários do TJPR, do TRT9, do TRF4 e os
  feriados municipais de Paranaguá. Nada entra sem alguém marcar.

### 9.7 Pronto quando

**Parcial local · 05/10/2026:** tarefas, resumo, datas manuais, permissões,
bloqueio, histórico e feriados cadastrados testados. Contagem automática,
memória, fixos e sugestões móveis ainda não implementados.

- [ ] Os vetores do Apêndice C passam.
- [ ] Prazo de 15 dias úteis publicado em 05/10/2026 sugere 27/10/2026, com
      entrega em 22/10/2026.
- [x] Prazo em horas **informado manualmente** mostra data e hora, e "vence em X horas".
- [x] Associado sem `acesso_prazos` cria tarefa comum e conclui a sua, mas não
      cria nem muda prazo processual (teste SQL).
- [x] Bloquear agenda cria o compromisso no responsável e o liga à tarefa.
- [x] Prazos filtra por dia, semana, mês e ano, e imprime.

---

## 10. F6 · Intimações do DJEN (API do CNJ)

### 10.1 Por quê

"No CNJ existe essa tal dessa API… ela é uma ferramenta de captura… tudo que
tem lá [no Diário de Justiça Eletrônico], essa API faz essa busca… pra mim ter
essa informação diária… É aquilo que eu falo, tudo depende do custo.
Atualmente, hoje, a gente consegue fazer manual"
[13:00]. E a oportunidade: ferramenta equivalente custa R$ 700 a 900 por mês
(algumas, R$ 3.000); ele paga R$ 220 por uma que faz menos.

O protótipo consultava a API direto do navegador, importava para conferência
e tinha a regra certa: **conferência humana obrigatória** antes de virar prazo
ou agenda. O que faltava: registro de quem conferiu, ligação com o processo e
o cálculo do prazo (F5).

### 10.2 O que a API oferece — conferido em 05/10/2026

Detalhes no Apêndice B. O que decide o desenho:

- **Pública e gratuita**, sem login: `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=…&ufOab=…&dataDisponibilizacaoInicio=AAAA-MM-DD&dataDisponibilizacaoFim=AAAA-MM-DD&itensPorPagina=100&pagina=1`.
- **CORS aberto** (`Access-Control-Allow-Origin: *`): o navegador do escritório
  chama direto — a etapa 1 não precisa de servidor.
- **Só responde no Brasil:** de fora, 403. O navegador dos advogados está em
  Paranaguá; um servidor no exterior não serviria (importa na etapa 2).
- **Limite por IP:** 20 requisições por janela (`x-ratelimit-limit: 20`); ao
  receber 429, esperar 1 minuto. Usar vários IPs para driblar o limite é uso
  abusivo e dá bloqueio — nunca fazer.
- **Página:** 5 ou 100 itens (só esses dois valores).

### 10.3 Migração `intimacoes`

```sql
-- 13 · Intimações do DJEN

create table public.intimacoes (
  id                 uuid primary key default gen_random_uuid(),
  -- Identificação no DJEN: o id evita importar duas vezes; o hash abre a certidão.
  djen_id            bigint unique,
  djen_hash          text,
  fonte              text not null default 'djen' check (fonte in ('djen', 'manual')),
  disponibilizada_em date not null,
  -- 1º dia útil depois da disponibilização (Lei 11.419/2006, art. 4º, §3º),
  -- calculado na tela com os feriados do tribunal.
  publicada_em       date,
  tribunal           text,
  orgao              text,
  tipo_comunicacao   text,   -- Intimação, Citação, Edital…
  tipo_documento     text,
  classe             text,
  numero_processo    text check (numero_processo ~ '^[0-9]{20}$'),
  texto              text not null check (btrim(texto) <> ''),
  link               text,
  destinatarios      jsonb not null default '[]'::jsonb,   -- [{ nome, polo }]
  advogados          jsonb not null default '[]'::jsonb,   -- [{ nome, numero_oab, uf_oab }]
  -- O advogado do escritório cuja OAB trouxe a comunicação.
  membro_id          uuid references public.membros (id),
  cliente_id         uuid references public.clientes (id),
  processo_id        uuid references public.processos (id),
  situacao           text not null default 'pendente' check (situacao in ('pendente', 'conferida', 'arquivada')),
  conferida_em       timestamptz,
  conferida_por      uuid,
  compromisso_id     uuid references public.compromissos (id),
  observacoes        text,
  criado_em          timestamptz not null default now(),
  criado_por         uuid,
  alterado_em        timestamptz,
  alterado_por       uuid
);

create index intimacoes_situacao on public.intimacoes (situacao, disponibilizada_em desc);
create index intimacoes_processo on public.intimacoes (processo_id);
create index intimacoes_numero on public.intimacoes (numero_processo);
select privado.aplicar_padrao('public.intimacoes');

-- Quem conferiu e quando, pelo login — como "concluída" na tarefa.
create function privado.validar_intimacao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.situacao = 'conferida' and (tg_op = 'INSERT' or old.situacao <> 'conferida') then
    new.conferida_em := now();
    new.conferida_por := privado.meu_membro_id();
  elsif new.situacao = 'pendente' then
    new.conferida_em := null;
    new.conferida_por := null;
  end if;
  return new;
end
$$;

create trigger c_validar before insert or update on public.intimacoes
  for each row execute function privado.validar_intimacao();

-- Cada busca no diário fica registrada: é a prova de que o escritório
-- conferiu o DJEN naquele dia — o mesmo espírito da cobrança registrada.
create table public.intimacoes_consultas (
  id           uuid primary key default gen_random_uuid(),
  de           date not null,
  ate          date not null,
  oabs         text[] not null,
  encontradas  integer not null default 0,
  novas        integer not null default 0,
  situacao     text not null check (situacao in ('ok', 'parcial', 'falhou')),
  detalhe      text,
  automatica   boolean not null default false,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint consulta_periodo check (ate >= de)
);
select privado.aplicar_padrao('public.intimacoes_consultas');

-- O prazo sabe de que intimação nasceu.
alter table public.tarefas add column intimacao_id uuid references public.intimacoes (id);
create index tarefas_intimacao on public.tarefas (intimacao_id);
grant insert (intimacao_id), update (intimacao_id) on public.tarefas to authenticated;
-- v_tarefas: create or replace acrescentando t.intimacao_id NO FIM da lista de
-- colunas (create or replace view só aceita coluna nova no fim).
-- criar_tarefa: create or replace lendo p ->> 'intimacao_id' e, quando vier,
-- marcando a intimação como 'conferida' na mesma transação.

create function public.importar_intimacoes(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  -- A busca automática (etapa 2) chama com a chave de serviço.
  v_auto  boolean := coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
  v_item  jsonb;
  v_ids   uuid[];
  v_proc  uuid;
  v_cli   uuid;
  v_total integer := 0;
  v_novas integer := 0;
  v_qtd   integer;
begin
  if not (privado.gerencia_prazos() or v_auto) then
    raise exception 'Seu acesso não inclui as intimações.' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) loop
    v_total := v_total + 1;
    v_proc := null;
    v_cli := null;

    -- Liga ao processo pelo número — só quando há exatamente um.
    select array_agg(pr.id) into v_ids
      from public.processos pr where pr.numero = v_item ->> 'numero_processo';
    if cardinality(v_ids) = 1 then
      v_proc := v_ids[1];
      select pr.cliente_id into v_cli from public.processos pr where pr.id = v_proc;
    end if;

    insert into public.intimacoes (
      djen_id, djen_hash, fonte, disponibilizada_em, publicada_em, tribunal, orgao,
      tipo_comunicacao, tipo_documento, classe, numero_processo, texto, link,
      destinatarios, advogados, membro_id, processo_id, cliente_id, situacao, observacoes)
    values (
      (v_item ->> 'djen_id')::bigint, v_item ->> 'djen_hash', 'djen',
      (v_item ->> 'disponibilizada_em')::date, nullif(v_item ->> 'publicada_em', '')::date,
      v_item ->> 'tribunal', v_item ->> 'orgao', v_item ->> 'tipo_comunicacao',
      v_item ->> 'tipo_documento', v_item ->> 'classe', nullif(v_item ->> 'numero_processo', ''),
      v_item ->> 'texto', v_item ->> 'link',
      coalesce(v_item -> 'destinatarios', '[]'::jsonb), coalesce(v_item -> 'advogados', '[]'::jsonb),
      nullif(v_item ->> 'membro_id', '')::uuid, v_proc, v_cli,
      -- Comunicação cancelada no DJEN entra já arquivada, para constar.
      case when (v_item ->> 'ativo')::boolean is false then 'arquivada' else 'pendente' end,
      case when (v_item ->> 'ativo')::boolean is false then 'Cancelada no DJEN.' end)
    on conflict (djen_id) do nothing;

    get diagnostics v_qtd = row_count;
    v_novas := v_novas + v_qtd;
  end loop;

  insert into public.intimacoes_consultas (de, ate, oabs, encontradas, novas, situacao, detalhe, automatica)
  values ((p -> 'consulta' ->> 'de')::date, (p -> 'consulta' ->> 'ate')::date,
          array(select jsonb_array_elements_text(coalesce(p -> 'consulta' -> 'oabs', '[]'::jsonb))),
          v_total, v_novas, coalesce(p -> 'consulta' ->> 'situacao', 'ok'),
          nullif(p -> 'consulta' ->> 'detalhe', ''), v_auto);

  return jsonb_build_object('encontradas', v_total, 'novas', v_novas);
end
$$;
```

**Políticas e privilégios:** `intimacoes` e `intimacoes_consultas` — ver com
`privado.gerencia_prazos()`; `intimacoes: incluir` só `fonte = 'manual'` (o
DJEN entra pela função); `intimacoes: alterar` com `gerencia_prazos()`. GRANT
de insert: `fonte, disponibilizada_em, publicada_em, tribunal, orgao,
tipo_comunicacao, numero_processo, texto, link, membro_id, cliente_id,
processo_id, observacoes`; de update: `cliente_id, processo_id, situacao,
compromisso_id, observacoes`. `intimacoes_consultas` só se escreve pela função.
`execute` de `importar_intimacoes` para `authenticated` (e o `service_role` já
tem).

**CSP:** acrescente `https://comunicaapi.pje.jus.br` ao `connect-src` das duas
entradas de `/sistema` em `vercel.json`.

### 10.4 Lógica pura — `sistema/js/dominio/djen.js`

```js
export const DJEN = 'https://comunicaapi.pje.jus.br/api/v1';
export function lerOab(texto)              // 'OAB/PR 105.790' → { uf: 'PR', numero: '105790' }; '' → null
export function urlDaConsulta({ numero, uf, de, ate, pagina })   // itensPorPagina=100, datas AAAA-MM-DD
export function normalizarComunicacao(item, membroId)
  // item da API → linha de importar_intimacoes (sem publicada_em):
  // djen_id ← id · djen_hash ← hash · disponibilizada_em ← data_disponibilizacao (aceita
  // AAAA-MM-DD… ou DD/MM/AAAA) · tribunal ← siglaTribunal · orgao ← nomeOrgao ·
  // tipo_comunicacao ← tipoComunicacao · tipo_documento ← tipoDocumento · classe ← nomeClasse ·
  // numero_processo ← só dígitos de numero_processo, e null se não forem 20 · texto ← textoLimpo(texto) ·
  // link · destinatarios ← [{ nome, polo }] · advogados ← destinatarioadvogados[].advogado
  // { nome, numero_oab, uf_oab } · ativo · membro_id
export function textoLimpo(html)           // tira tags; <br> e </p> viram quebra; decodifica &amp; &lt; &gt; &quot; &#39; &nbsp;
export function sugerirPrazo(texto)        // "prazo de 15 (quinze) dias" → { quantidade: 15, unidade: 'dias' }
                                           // "48 (quarenta e oito) horas" → { quantidade: 48, unidade: 'horas' }
                                           // por extenso de um a trinta; "prazo legal" → null
export function sugerirAudiencia(texto)    // "audiência … dia 12/11/2026, às 14h30" → { dia: '2026-11-12', hora: '14:30' }
export const linkDaCertidao = (hash) => `${DJEN}/comunicacao/${hash}/certidao`;
```

`sugerirPrazo` e `sugerirAudiencia` só **preenchem** o formulário; quem
confirma é a pessoa. Teste em `sistema/testes/djen.test.mjs` (Apêndice C).

### 10.5 Buscar no diário — etapa 1, pelo navegador

Botão **Buscar no diário** em `/intimacoes`:

1. **Diálogo:** período — padrão: do dia seguinte ao `ate` da última consulta
   `ok` até hoje; na primeira vez, os últimos 7 dias; no máximo 31 dias — e os
   advogados: membros ativos com OAB legível por `lerOab`, todos marcados.
2. **Busca:** para cada advogado, página a página (até vir menos de 100
   itens), **uma requisição por vez, ~600 ms entre elas**, cada uma com
   `AbortSignal.timeout(20000)`. Leia `x-ratelimit-remaining`; se chegar a 1, ou
   vier 429, pare, registre a consulta como `parcial` e diga: "O CNJ limita as
   consultas por minuto. Tente de novo daqui a 1 minuto."
3. **Importação:** normalize; o mesmo `djen_id` vindo por dois advogados entra
   uma vez só; calcule `publicada_em` com `dataDaPublicacao` (F5) e os
   feriados do tribunal; chame `db.rpc('importar_intimacoes', { p: { itens, consulta } })`.
4. **Resultado:** "12 encontradas, 9 novas"; a lista recarrega com as
   pendentes. Falha de rede ou 403 também é registrada (`falhou`, com o motivo).

### 10.6 Tela `/intimacoes` — `sistema/js/telas/intimacoes.js`

Menu: grupo Tarefas e prazos, "Intimações" (`permitido: pode.prazos`). O nome
"Publicações" já é do módulo Site — por isso **Intimações**.

- **Indicadores:** pendentes de conferência · conferidas nos últimos 7 dias ·
  prazos gerados nos últimos 7 dias · última busca (quando, quem, resultado).
- **Lista** (padrão: pendentes): disponibilização e publicação · tribunal e
  órgão · processo (formatado; link para o processo se ligado, senão
  "Vincular") · tipo · destinatários (polo) · advogado · começo do texto ·
  situação.
- **Conferir** (diálogo largo): o texto inteiro, destinatários, advogados,
  links **Certidão** (`linkDaCertidao`) e **Inteiro teor** (`link`), vínculo com
  cliente e processo e quatro saídas:
  - **Gerar prazo** → o formulário de F5 com tipo prazo, processo, cliente,
    base = `publicada_em`, contagem pela área do processo, quantidade de
    `sugerirPrazo`, responsável = responsável do processo (ou o dono da OAB) e
    `intimacao_id`. Salvo o prazo, a intimação fica `conferida`.
  - **Lançar audiência** → o formulário de compromisso da Agenda (exporte
    `editarCompromisso` de `telas/agenda.js` e faça-o aceitar valores iniciais:
    tipo, cliente, processo, dia e hora) com tipo audiência, cliente, processo e
    dia/hora de `sugerirAudiencia`; salvo, grava `compromisso_id` e `conferida`.
  - **Só conferir** — lida, nada a fazer.
  - **Arquivar** — não é do escritório, repetida, cancelada.
- **Cadastrar intimação** (fonte manual) — para o que não veio do DJEN
  (intimação pessoal, e-mail da vara). Campos do protótipo: fonte, datas,
  processo, órgão, advogado, cliente, tipo, teor, observações.
- **Consultas ao diário** — painel com `intimacoes_consultas`: data, período,
  OABs, encontradas, novas, quem (ou "automática").

### 10.7 Etapa 2 — busca automática diária (depois da etapa 1 em uso)

- Função de borda `capturar-djen` (`verify_jwt` desligado; exige o cabeçalho
  `x-fhl-cron` igual ao segredo `CRON_SEGREDO`): lê os membros ativos com OAB
  pela chave de serviço, consulta o DJEN do último dia útil, normaliza (copie o
  código de `dominio/djen.js` — função de borda não importa de `sistema/`) e
  chama `importar_intimacoes`.
- **Região:** de fora do Brasil a API responde 403, e a função de borda roda
  onde o Supabase decidir. Force São Paulo com a invocação regional do Supabase
  (cabeçalho `x-region: sa-east-1` — confira o nome na documentação atual) e
  **teste uma chamada real antes** de agendar.
- **Agendamento:** `pg_cron` + `pg_net` (extensões gratuitas do Supabase), dias
  úteis às 7h30 de Brasília — `'30 10 * * 1-5'` em UTC —, `net.http_post` para a
  função com `x-region` e o segredo guardado no Vault. Custo zero; e a atividade
  diária ainda impede o projeto gratuito de pausar.
- A tela Hoje (F7) passa a dizer "N intimações novas no diário de hoje".

### 10.8 Pronto quando

**Parcial local · 05/10/2026:** cadastro/conferência manual, arquivo com
motivo, origem do prazo, audiência atômica e restrição por Prazos testados.
Busca, normalização, deduplicação, vínculos automáticos e sugestões pendentes.
A etapa 2 continua para depois da etapa 1 em uso, conforme §10.7.

- [ ] Busca de uma semana para as três OABs traz as comunicações e não duplica
      na segunda vez.
- [ ] Comunicação de processo cadastrado chega ligada ao processo e ao cliente.
- [ ] "Gerar prazo" abre o formulário já com base e contagem; salvar marca
      conferida, com quem e quando.
- [ ] 429 do CNJ vira mensagem clara e consulta `parcial` registrada.
- [x] Sem `acesso_prazos`, `intimacoes` não é lida (teste SQL).
- [ ] CSP atualizada; a busca funciona no endereço publicado da Vercel, não só
      no `localhost` — o servidor local (`scripts/dev.mjs`) não aplica os
      cabeçalhos de `vercel.json`, então erro de CSP só aparece no ar.

---

## 11. F7 · Avisos do dia

### 11.1 Por quê

É a primeira coisa que ele disse na reunião [00:00]: "não precisa ser um
mecanismo que mandaria automaticamente, mas que me avisaria e eu falaria: pô,
Rodrigo, estou passando aqui para dar parabéns, muita sorte, que Deus te
abençoe, precisando de alguma coisa, estou à disposição." O protótipo tinha
"Aniversários de clientes" no Escritório Virtual e uma Central de notificações.
A tela Hoje já é esse lugar; falta o resto. **Avisa, não envia.**

### 11.2 O que a tela Hoje passa a mostrar

Cada painel só aparece para quem tem o módulo e só quando o módulo existir:

| Painel | Fonte | Para quem |
|---|---|---|
| **Para hoje** — minhas tarefas e prazos vencidos, de hoje e dos próximos 7 dias (o fatal em destaque) | `v_tarefas` | todos |
| **Aniversários** — hoje e nos próximos 7 dias, com "Preparar mensagem" | `clientes_detalhes.nascimento` | `pode.clientes()` |
| **Contatos novos do site** — os 3 mais recentes e o total | `contatos` | `pode.clientes()` |
| **Intimações a conferir** | `intimacoes` | `pode.prazos()` |
| **Lembretes de amanhã** — atendimentos de amanhã com "Preparar lembrete" (F8) | `agenda_periodo` | `pode.agenda()` |
| **Site parado** — "A última publicação foi há 34 dias", se passar de 21, com link para escrever. É o medo dele: "o ruim é que começam e não fazem" [18:00] | `publicacoes` | `pode.site()` |
| *(opcional)* **Processos sem atualização há 60 dias** — do responsável | `processos` + `atualizacoes` | `pode.clientes()` |

**Preparar mensagem** de aniversário: diálogo no molde de `prepararCobranca`
(copiar e abrir no WhatsApp), com o texto nas palavras dele, editável antes de
enviar:

> Olá, {primeiro nome}! Aqui é {remetente}, da FHL Advocacia. Passando para
> desejar um feliz aniversário — muita saúde, muita sorte, e que Deus te
> abençoe! Precisando de alguma coisa, estamos à disposição.

### 11.3 Contador no menu

```sql
-- 14 · Avisos do dia: os números que aparecem ao lado dos itens do menu.
-- Inclua só os ramos das tabelas que já existirem quando esta migração rodar.

create function public.avisos_do_dia()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_eu uuid := privado.meu_membro_id();
  v    jsonb := '{}'::jsonb;
begin
  if v_eu is null then
    return null;
  end if;

  select v || jsonb_build_object(
           'minhas_atrasadas', count(*) filter (where t.entrega < privado.hoje() or t.fatal_em < now()),
           'meus_prazos_hoje', count(*) filter (where t.entrega = privado.hoje()
                                 or (t.fatal_em at time zone 'America/Sao_Paulo')::date = privado.hoje()))
    into v
    from public.tarefas t
   where t.responsavel_id = v_eu and t.situacao <> 'concluida' and t.cancelado_em is null;

  if privado.edita_clientes() then
    v := v || jsonb_build_object('contatos_novos',
           (select count(*) from public.contatos c where c.situacao = 'novo'));
  end if;

  if privado.gerencia_prazos() then
    v := v || jsonb_build_object('intimacoes_pendentes',
           (select count(*) from public.intimacoes i where i.situacao = 'pendente'));
  end if;

  return v;
end
$$;
```

Em `app.js`: depois de `desenharCasca()` e a cada troca de tela, `db.rpc('avisos_do_dia')`
e um `<span class="menu__contagem">` ao lado de Tarefas (atrasadas + hoje),
Contatos e Intimações. Falha aqui não incomoda ninguém: só `console.error`.

### 11.4 Lógica pura

- `sistema/js/dominio/aniversarios.js`: `proximoAniversario(nascimento, hoje)` →
  `{ data, dias, idade }` (nascido em 29/02 comemora em 28/02 nos anos não
  bissextos) e `aniversariantes(lista, hoje, dias = 7)`.
- `sistema/js/dominio/mensagens.js`: `mensagemAniversario`, `mensagemLembrete`
  (F8) e `mensagemRespostaContato` (F1) — textos num lugar só, testados.

### 11.5 Pronto quando

- [x] Cliente com aniversário hoje aparece com a mensagem pronta.
- [x] O menu mostra os contadores certos para cada perfil.
- [x] Ninguém vê aviso de módulo que não pode abrir.

**Verificação local de 05/10/2026:** 12 testes JavaScript novos, 21 cenários SQL e 16 fluxos Chrome de F7. `avisos_do_dia` usa `security invoker`, preserva RLS e omite os contadores dos módulos negados. Cada tarefa conta uma vez, com atraso precedendo hoje. O menu inclui novos contatos de todos os canais; o painel lista os três últimos do site e o total desse canal. Mensagens são editáveis, copiáveis e abertas no aplicativo pelo usuário, sem envio automático. A geração de lembrete de amanhã já funciona; F8 foi acrescentado na etapa seguinte (§12.4). O painel opcional de processos sem atualização permanece fora desta entrega. Migração local `20261005232739_avisos_do_dia.sql`; não aplicada ao remoto.

---

## 12. F8 · Agenda sem depender do Google

### 12.1 Por quê

A ligação de verdade com o Google Agenda depende da conta do escritório (Gmail
comum ou Workspace) e está parada (seção 14). Enquanto isso, o que é marcado no
sistema não bloqueia o link de agendamento que eles mandam aos clientes — e a
tela avisa. Ele mesmo propôs o caminho simples: "exportar o que você tem no mês"
[10:50]. E o motivo da agenda existir: "eu não gosto de que as pessoas fiquem
esperando" [11:40].

### 12.2 O que entra — tudo em `telas/agenda.js`, sem conta nenhuma

| Função | Como |
|---|---|
| **Pôr no Google Agenda** | Botão no detalhe do compromisso (`detalhe()`): abre `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…&location=…` com o evento preenchido, na conta Google de quem clicou — um clique em "Salvar" e o horário passa a ocupar o link de agendamento. Bloqueio de vários dias usa datas sem hora (fim exclusivo). Particular: só o dono vê o botão. |
| **Exportar .ics** | Botão na semana: a semana visível ou o mês, de um advogado ou de todos, para importar no Google (Configurações → Importar). O particular dos outros sai como "Ocupado" — `agenda_periodo` já entrega assim. |
| **Preparar lembrete** | No detalhe de atendimento com cliente e telefone: mensagem pronta (`mensagemLembrete`), copiar e abrir no WhatsApp. Presencial: "…seu atendimento na FHL Advocacia {quando}, às {hora}, com {advogado}, na Rua Dr. Leocádio, 282 — Centro, Paranaguá. Se precisar remarcar, é só responder esta mensagem." Online: o link no lugar do endereço. É o lembrete que a preparação anterior previa (7.6). |
| **Feriados na grade** | O cabeçalho do dia mostra o nome do feriado (fixos nacionais + `feriados` com tribunal nulo), com a coluna esmaecida. |
| **Iniciar atendimento** | F4 (8.6). |
| **Declaração de comparecimento** | F3 (7.6). |

Atualize o texto de `notaGoogle()` em `telas/comum.js`: "Use **Pôr no Google
Agenda** em cada compromisso para bloquear o horário no link de agendamento."

### 12.3 Lógica pura — `sistema/js/dominio/ics.js`

```js
export function escaparIcs(texto)              // \ ; , e quebra de linha (RFC 5545, 3.3.11)
export function dobrarLinha(linha)             // mais de 75 octetos: CRLF + espaço, sem partir caractere UTF-8 (3.1)
export function gerarIcs(compromissos, { nome })  // VCALENDAR, VERSION:2.0, PRODID, um VEVENT por compromisso:
                                               // UID <id>@fhl-advocacia · DTSTAMP · DTSTART/DTEND em UTC (…Z),
                                               // ou ;VALUE=DATE no dia inteiro · SUMMARY · LOCATION · DESCRIPTION
export function linkGoogleAgenda(c)            // URL do 12.2, datas em UTC: AAAAMMDDTHHMMSSZ/AAAAMMDDTHHMMSSZ
```

Teste em `sistema/testes/ics.test.mjs` (Apêndice C).

### 12.4 Pronto quando

- [ ] "Pôr no Google Agenda" abre o Google com título, horário e local certos — URL preenchida validada localmente; formulário na conta Google aguarda teste humano.
- [ ] O `.ics` exportado importa no Google sem erro, com acentos — parser independente aprovado; importação real ainda pendente.
- [x] Lembrete sai com dia, hora, advogado e endereço.
- [x] Feriado cadastrado aparece na grade — nacionais automáticos permanecem pendentes.

**Entrega local de F8 · 05/10/2026:** 11 testes JavaScript novos, 18 fluxos
Chrome e nove `.ics` aprovados pelo leitor independente `icalendar 6.3.2`.
Semana ou mês escolhido, responsável ou todos, particulares mascarados,
CRLF/dobra UTF-8, alarmes e dias inteiros com fim exclusivo. Exportação consulta
novamente `agenda_periodo`; observações internas não entram nos arquivos nem
na URL Google. Lembrete também informa o responsável em Hoje. A grade mostra
somente feriados cadastrados ativos com tribunal nulo e continua utilizável
se essa consulta falhar. A geração automática de feriados continua pendente
após o bloqueio de conteúdo registrado em F5/F6; não houve nova tentativa.
Nenhuma migração nova, gravação no Google, commit ou publicação.

O botão e a importação geram cópias, sem sincronização posterior. Para ocupar
o link de agendamento, a pessoa precisa salvar na agenda correta e conferir
que ela é considerada na verificação de disponibilidade do Google.

---

## 13. F9 · Calculadora de atualização (opcional)

**Não foi pedida na reunião.** O protótipo tinha um módulo inteiro de
Calculadoras (atualização de valores, pensão alimentícia, condenações,
trabalhista, horas extras), refeito várias vezes — sinal de uso. O sistema
novo já tem o motor: índices do Banco Central (`dominio/indices.js`) e
atualização com memória (`dominio/atraso.js`). Faça só se sobrar fôlego.

- Rota `/calculos` (`telas/calculos.js`), item "Cálculos" no primeiro grupo do
  menu, para todos os membros. Sem banco.
- **Atualizar um valor:** valor, data inicial, data do cálculo, índice
  (nenhum, IPCA, INPC, IGP-M), juros ao mês, multa → `correcaoPara` +
  `atualizar` → memória do cálculo (`memoria()` de `telas/financeiro/base.js`)
  e Imprimir.
- **Pensão alimentícia (parcelas vencidas):** valor da parcela, quantidade,
  vencimento da primeira, data do cálculo, índice (padrão INPC), juros, multa →
  uma linha por parcela, cada uma atualizada desde o próprio vencimento, e o
  total.
- Aviso fixo, como no protótipo: "Cálculo estimativo. Para liquidação judicial,
  confira os índices oficiais do período e os critérios da decisão."
- Trabalhista e horas extras ficam de fora: são regras próprias, e o
  protótipo levou várias versões para acertá-las.

---

## 14. O que não fazer agora

| O quê | Por que não | O que já fica pronto |
|---|---|---|
| Google Agenda nos dois sentidos | Depende da conta Google do escritório — Gmail comum ou Workspace (pergunta 12 da preparação anterior) | Colunas `google_*` reservadas em `compromissos`; F8 dá o caminho manual |
| Pastas do cliente no Google Drive | Depende da conta Google; e ele mesmo rebaixou a prioridade [20:00] | `documentos` guarda tudo por cliente |
| Avaliações do Google no site | Colide com o Provimento 205/2021 — é pergunta a ele, como advogado (CLAUDE.md §6) | — |
| E-mails automáticos (resumo do dia, aviso de contato novo, convite de acesso) | Dependem do domínio oficial e de um SMTP | F7 avisa dentro do sistema |
| WhatsApp automático | Custo por mensagem; e ele quer avisar, não enviar [00:00] | Mensagens prontas para copiar |
| Integração bancária, boleto, Pix automático | Custo; decisão dele [07:40] | — |
| Chat interno | O próprio protótipo removeu as "Conversas internas" | — |
| Equipe, áreas de atuação e textos do site editáveis pela área | Moldam o site inteiro; continuam no código (`sistema/README.md`, "O que continua no código") | — |
| Agendar a publicação de um artigo | Depende do Deploy Hook (`VERCEL_DEPLOY_HOOK`) e de um agendador | — |
| Migração dos dados do protótipo | Depende do arquivo de backup do Vinícius | Quando chegar: as chaves `fhlState`, `fhl_site_state_v1` e `fhl_site_restrito_v6` do `localStorage` têm clientes, atualizações (`cases`), publicações, tarefas e financeiro — um script de importação de uma vez, para as tabelas daqui |
| Assinatura eletrônica da ficha de atendimento | Não foi pedida; ele imprime e o cliente assina | — |

---

## 15. Decisões tomadas por recomendação — confirmar com o Vinícius

Implementadas assim; cada uma muda num lugar só.

| # | Decisão | O que ficou | Onde muda |
|---|---|---|---|
| 1 | Quem vê o quê nos módulos novos [19:00] | Sócio e admin: Clientes e Prazos. Secretária e associado: só Clientes. Tarefas: todos | Membros |
| 2 | Prazo de entrega | 3 dias úteis antes do fatal | Em cada prazo |
| 3 | Contagem padrão | Criminal em dias corridos; o resto em úteis; recesso ligado | Em cada prazo |
| 4 | Feriado incerto | Conta como dia útil até alguém cadastrar | Feriados |
| 5 | Guarda dos contatos do site que não viraram cliente | 12 meses depois de arquivados; anonimizar é manual | Política de Privacidade; F1, etapa 2 |
| 6 | Relatório de atividades para o cliente | Sem o relato: data, quem, tipo e duração | Opção na tela |
| 7 | Mensagem de aniversário | As palavras dele [00:00], editável antes de mandar | `dominio/mensagens.js` |
| 8 | Texto dos documentos | O do protótipo, sem mudança, até a revisão dele (7.8) | `documentos/modelos.js` |
| 9 | E-mail nos documentos | O do site, `contato@fhladvocacia.com.br` | `escritorio.js` |
| 10 | Bloquear a agenda de outra pessoa ao delegar | Permitido, pela tarefa, e fica no histórico | `criar_tarefa` |
| 11 | "Escritório Virtual" (CLAUDE.md §10, pergunta 4) | É a tela Hoje — agenda do dia, tarefas e aniversários, o que o protótipo mostrava | — |

**Perguntas novas para a próxima conversa** — acrescentar às do CLAUDE.md §10:

1. Vocês mandam os **DOCX originais** dos modelos? (7.8)
2. Na ficha de atendimento: art. 298 ou 299? Acrescentamos a frase de ciência
   do que foi conversado? (7.8)
3. Na declaração de endereço, quem declara: o cliente ou o titular do
   comprovante? (7.8)
4. Em quais tribunais vocês mais atuam (TJPR, TRT9, TRF4…)? Quais os feriados
   municipais de Paranaguá? (9.3)
5. Por quanto tempo guardar o contato do site que não virou cliente? (5.7)
6. O relatório de horas que vai para o cliente leva o relato de cada
   atendimento? (8.5)

---

## 16. Testes e verificação

### 16.1 Banco — `supabase/testes/`

Dois arquivos novos, **no mesmo molde de `permissoes.sql`**: uma função
`pg_temp`, identidades simuladas com
`set_config('request.jwt.claims', …)` + `set_config('role', 'authenticated', true)`,
membros e usuários de teste criados dentro de um bloco que termina em
`raise exception 'FIM_DOS_TESTES'` — o bloco é desfeito, os resultados ficam
numa variável e voltam como tabela (`n`, `ok`, `teste`, `detalhe`). Nada fica
gravado. Rode pelo MCP (`execute_sql`) ou no SQL Editor.

**`clientes.sql`** (E0, F1–F4), no mínimo:

- `iniciar_sessao()` devolve `acesso_clientes` e `acesso_prazos`; admin recebe `editar`.
- Anônimo não lê `contatos`; `authenticated` não chama `registrar_contato`;
  `service_role` chama. Quarto envio do mesmo `ip_hash` em 10 minutos é recusado;
  sem consentimento é recusado; `convertido` sem cliente é recusado.
- Membro sem `acesso_clientes` lê `clientes` e `processos`, mas não
  `clientes_detalhes`, `contatos`, `atualizacoes` nem `documentos`.
- `salvar_cliente` com e sem `detalhes`; sem o nível, com `detalhes`, é recusado.
- Processo com dígito errado é recusado; o mesmo número em dois clientes é
  aceito; repetido no mesmo cliente, recusado.
- `documentos`: o conteúdo não se altera (sem GRANT); cancelar exige motivo.
- `atualizacoes`: dois cronômetros da mesma pessoa, recusado; parar mantém
  `cronometrado`; mudar a hora tira; sócia não altera a do outro; admin altera;
  inserir sem fim e sem cronômetro, recusado.

**`prazos.sql`** (F5–F6), no mínimo:

- Associado cria tarefa e não cria prazo; sócia cria prazo; associado
  responsável conclui (com `concluida_em` e `concluida_por`), mas não muda a
  data fatal.
- Quem não criou, não é responsável nem admin, não altera a tarefa.
- `criar_tarefa` com bloqueio cria o compromisso no responsável; sem acesso à
  agenda, recusa.
- `feriados`: só quem gerencia prazos grava; a mesma data com tribunal nulo não
  entra duas vezes.
- `intimacoes`: sem o nível, não lê; importar o mesmo `djen_id` duas vezes não
  duplica; liga ao processo só quando há um; a consulta fica registrada.
  Simulando a busca automática (`set_config('role', 'service_role', true)` e
  claims com `"role": "service_role"`), `importar_intimacoes` funciona e marca
  a consulta como `automatica`.
- `v_tarefas.alerta` certo para vencida, fatal hoje, atrasada e em dia.

Anote no cabeçalho de cada arquivo a data e o placar, como `permissoes.sql` faz.

### 16.2 Cálculos — `npm run sistema:test`

Um arquivo por módulo puro novo: `formato` (acrescentar), `documentos`,
`tempo`, `feriados`, `prazos`, `djen`, `aniversarios`, `mensagens`, `ics`.
Vetores no Apêndice C. Nenhum teste chama rede.

### 16.3 Telas — sem login e sem gravar no banco real

O método que o projeto já usa (memória `referencia-verificar-telas-sem-login`):

1. Monte um cenário em SQL dentro de um bloco desfeito e devolva, em
   `jsonb_agg`, o que cada tabela ou view da tela leria; salve como
   `cenario.json` (resultado grande do `execute_sql` vai para arquivo — extraia
   com script, não redigite).
2. Copie `cenario.json` e um `mock.js` para `dist/` (cada rebuild apaga —
   recopie). O mock emula a Data API sobre o cenário (filtros `eq`, `in`, `gte`,
   `lte`, `is`, `ilike`, `or`/`and`, `order`, `limit`/`offset`), guarda toda
   escrita em `window.__escritas`, grava uma sessão falsa em
   `localStorage['fhl.sessao']` e dispara `StorageEvent('storage')` — o app abre
   sozinho.
3. Percorra os fluxos no navegador do app (`npm run dev`, porta 8123,
   `/sistema`). Chamada externa (Banco Central, DJEN, ViaCEP) passa direto.
4. **Reenvie ao banco os payloads capturados** num bloco desfeito, com
   `jsonb_populate_record` — prova que o banco aceita o que a tela manda.

Armadilhas conhecidas: valor em moeda no `innerText` vem com espaço duro
(U+00A0); `document.querySelector('dialog')` pode pegar um diálogo velho que
ficou aberto por erro; o mock precisa imitar os gatilhos que a tela lê de volta.

### 16.4 Função de borda `receber-contato`

Sem gravar dado de teste: chame com o honeypot preenchido (responde `ok`, não
grava), sem consentimento (422) e com corpo grande (413). A lógica que grava já
foi testada no SQL. O teste de ponta a ponta é **um** envio real pelo site no
ar, feito pelo Ithalo depois da aprovação; o contato fica arquivado com a
observação "teste de lançamento" (nada se apaga).

### 16.5 Site

`npm run build` e `npm run check`; o formulário em `/contato.html` e numa
campanha, com e sem rede.

---

## 17. Documentação a atualizar

Ao fim de **cada** etapa, antes do resumo para o Ithalo:

| Arquivo | O quê |
|---|---|
| `sistema/README.md` | Tabela "Banco" (migração nova); "Permissões" (níveis novos); uma seção para o módulo, no estilo das de Financeiro e Agenda; "Pendências" (decisões da seção 15 e bloqueios); "Notas de manutenção" para toda armadilha encontrada |
| `README.md` | Só quando o site mudar: F1 (pendência 7, `FORM_ENDPOINT`), E0 (`escritorio.js`) |
| `CLAUDE.md` | Só contexto do cliente: na tabela do §4, o que passou a existir; no §10, as perguntas novas. Técnica não entra ali |
| `vercel.json` | CSP de F6 (e de ViaCEP, se F2 usar) |
| Este documento | Coluna "Situação" da seção 1 |

---

## 18. Custos

| Item | Custo |
|---|---|
| Supabase: tabelas, funções, função de borda, `pg_cron`, `pg_net` | Dentro do plano gratuito no piloto. Em produção, o Pro de US$ 25/mês que já estava previsto — nada a mais |
| API do DJEN (CNJ) | Gratuita e pública |
| ViaCEP | Gratuito |
| "Pôr no Google Agenda" e arquivo `.ics` | Gratuitos — não há integração |
| Mensagens de WhatsApp | Gratuitas — abrem o aplicativo de quem envia |
| **Custo mensal novo** | **R$ 0** |

Limites do plano gratuito que importam: 500 MB de banco, 1 GB de arquivos,
500 mil chamadas de função por mês. Um escritório deste tamanho fica muito
abaixo — documento gerado é texto (dezenas de KB, que a auditoria duplica).
Produção continua em ≈ US$ 45/mês (Supabase Pro + Vercel Pro), como na
preparação anterior.

**Régua de valor, para o Ithalo orçar:** F5 + F6 juntos são a ferramenta de
publicações e prazos pela qual ele paga R$ 220/mês — uma que, nas palavras
dele, "não traz todas essas funcionalidades" — e que no mercado custa de
R$ 700 a 900, algumas R$ 3.000 [13:00]. Aqui, sem custo de infraestrutura a
mais.

---

## Apêndice A — Texto dos modelos de documento

**Fonte:** o protótipo do Vinícius, script `fhlSpecificAutoDocsScript`
(`DOC_TYPES` e as funções `procuracao`, `contrato`, `hipossuficiencia`,
`endereco`, `comparecimento`, `faa`, `renuncia`, `prestacao`, por volta das
linhas 25945–25993 do HTML). Transcrito **sem mudança de redação**. `{chave}` =
dado preenchido; `[TEXTO]` = o que o protótipo mostra quando o dado falta.
Negrito = `<strong>` no original. Mudanças só depois do sim dele (7.8).

### Peças comuns

- **Cabeçalho:** a logomarca (`/sistema/img/logo.svg`) — no protótipo, "FHL" e
  "FONSECA HESPANHA LISBOA · ADVOCACIA".
- **Rodapé:** `Rua Doutor Leocádio, 282, Centro, Paranaguá/PR | (41) 2152-2607 | {EMAIL}`.
- **Local e data:** `Paranaguá/PR, {data por extenso}.` — ex.: "Paranaguá/PR, 05 de outubro de 2026."
- **Qualificação do cliente** (`qualificacao`):
  `{nome}, {nacionalidade ou "brasileiro(a)"}, {estado civil ou "[estado civil]"}, {profissão ou "[profissão]"}, inscrito(a) no CPF/CNPJ de n.º {documento ou "[CPF/CNPJ]"}, domiciliado(a) na {endereço completo ou "[ENDEREÇO COMPLETO]"}[, telefone: {telefone}][, e-mail: {e-mail}]`
  — nome ausente: `[NOME DO CLIENTE]`. Endereço completo:
  `{logradouro}, {número}[, {complemento}], {bairro}, {cidade}/{UF}, CEP {cep}`.
  Com `flexao`: `m` → brasileiro, inscrito, domiciliado; `f` → brasileira,
  inscrita, domiciliada; nulo → as formas com "(a)" do protótipo. Estado civil
  com a mesma flexão (solteiro, casado, em união estável, separado, divorciado,
  viúvo).
- **Advogados** (`advogados`), um por um, separados por "; ":
  `**{NOME EM MAIÚSCULAS}**, advogado(a), inscrito(a) na {OAB}` e, no fim,
  `, todos com escritório profissional localizado na rua Doutor Leocádio, 282, Centro, Paranaguá/PR – CEP: 83.203-270, telefone: (41) 2152-2607.`
  Padrão: membros ativos com OAB (fica de fora quem não tem — o suporte).
- **Proposta para o que o protótipo não cobre — [propor ao Vinícius]:**
  - Pessoa jurídica: `{razão social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o n.º {cnpj}, com sede na {endereço completo}, neste ato representada por {representante}, {qualificação do representante}`.
  - Cliente com representante legal: depois da qualificação,
    `, neste ato representado(a) por {relação} {representante}, {qualificação do representante}`.

### 1. Procuração — `procuracao`

> **Outorgante(s):** {qualificação}.
>
> **Outorgado(s):** {advogados}
>
> **Poderes:** Amplos, gerais e ilimitados para o foro em geral, ou onde com
> este se apresentarem em nome do(a) outorgante, em juízo ou fora dele, como
> autor, réu, assistente ou opoente, podendo propor ou contestar ações,
> participar de processos incidentes, preliminares, cautelares, acessórios e
> especiais para defesa de todo e qualquer interesse ou direito do(a)
> outorgante.
>
> Conferem-se, ainda, poderes para transigir, receber e dar quitação, levantar
> quantias depositadas, inclusive fianças, firmar compromissos, celebrar
> acordos, apresentar memoriais, recorrer a qualquer instância ou tribunal,
> substabelecer com ou sem reserva de iguais poderes, representar perante
> repartições públicas, autarquias, empresas públicas, sociedades de economia
> mista, estabelecimentos bancários e demais pessoas jurídicas de direito
> público ou privado, bem como requerer justiça gratuita quando necessário.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Outorgante

### 2. Contrato de Honorários — `contrato_honorarios`

> **Contratante(s):** {qualificação}.
>
> **Contratado(s):** {advogados}
>
> **Termos:** As partes, expressando suas vontades, com fundamento no art. 593
> e seguintes do Código Civil c/c Lei n.º 8.906/1994, decidem por
> **CONTRATAR**, nos seguintes termos:
>
> **1. Objeto** — 1.1. O presente acordo tem como objeto ajustar o binômio dos
> honorários advocatícios e da contratação de serviços jurídico-profissionais a
> serem prestados, em especial para {objeto}.
>
> **2. Vigência** — 2.1. A duração deste pacto é indeterminada e está ligada à
> obrigação do contratante e à duração do processo/procedimento objeto,
> encerrando-se com decisão final, sentença, acórdão, portaria/resolução ou ato
> equivalente.
>
> **3. Honorários advocatícios** — 3.1. O contratante pagará aos contratados
> {valor total}, parcelado em {nº de parcelas} vez(es) de {valor da parcela},
> todo dia {dia} de cada mês subsequente à assinatura deste instrumento, e
> {êxito}% sobre o proveito econômico do processo, cumprindo o art. 22 do
> Estatuto da OAB e respeitando o art. 85, §14, do CPC.
>
> 3.2. Nas ações criminais, em sendo arbitrada fiança, ao final, se absolvido
> ou arquivado o processo, poderá o contratado levantar a fiança e retê-la para
> deduzir/compensar valores devidos.
>
> 3.3. Nas ações trabalhistas, em caso de pagamento por parcelamento, o
> contratante autoriza que os contratados adiantem 30% dos honorários em
> parcela única na primeira prestação, ou procedam à dedução necessária para
> saldar os honorários.
>
> 3.4. Nas ações previdenciárias, se os valores retroativos forem suficientes,
> os honorários serão pagos em parcela única; sendo insuficientes,
> proceder-se-á ao desconto máximo viável, permanecendo saldo remanescente em
> pagamento mensal.
>
> 3.5. O atraso no pagamento ensejará vencimento antecipado das demais
> parcelas, cobrança integral, correção monetária, juros de 1% ao mês e multa
> compensatória de 10%.
>
> 3.6. Os honorários de sucumbência não excluem os honorários aqui pactuados,
> por possuírem natureza distinta.
>
> **4. Garantia** — 4.1. Garantia selecionada: **{garantia}**. Salvo
> detalhamento específico, o contrato não possui outras garantias
> pessoais/fidejussórias ou reais.
>
> **5. Obrigações** — 5.1. O contratante compromete-se a prestar informações,
> documentos, indicar testemunhas e manter seus dados atualizados. Declara
> ciência de que a advocacia não assegura certeza de sucesso, constituindo meio
> de acesso à justiça, não promessa de resultado.
>
> 5.2. Os contratados comprometem-se a prestar serviços jurídico-profissionais
> com zelo, técnica e diligência, com base nas informações e provas
> apresentadas.
>
> **6. Foro** — 6.1. Para dirimir controvérsias oriundas deste instrumento,
> fica eleito o foro competente, sem prejuízo das regras legais aplicáveis.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Contratante(s) · \_\_\_\_\_\_\_\_\_\_\_\_ Contratado(a)(s)

Faltando: valor total `R$ [VALOR]`, parcelas `[N.º]`, valor da parcela
`R$ [PARCELA]`, dia `[DIA]`; êxito padrão `30`; garantia padrão `nenhuma`.
Objeto padrão: `promover a defesa de seus direitos` + ` nos autos de n.º {processo}`
quando houver processo. Valores em moeda (`R$ 3.000,00`).

### 3. Declaração de Hipossuficiência — `hipossuficiencia`

> {qualificação}, assegurado(a) pelo art. 5º, LXXIV, da Constituição Federal,
> ecoado no art. 98 do Código de Processo Civil, com fundamento na Lei n.º
> 7.115/1983, e ciente das penas legais, **DECLARO-ME POBRE NA CONCEPÇÃO
> JURÍDICO-LEGAL**, não tendo condições de suportar despesas processuais sem
> prejuízo do sustento próprio e/ou de minha família.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Declarante

### 4. Declaração de Endereço — `declaracao_endereco` (título no papel: "Declaração")

> Eu, {qualificação}, com fundamento na Lei n.º 7.115/1983, e ciente das penas
> legais às quais me submeto, **DECLARO** que {pessoa declarada} (CPF/CNPJ:
> {CPF da pessoa declarada}) tem seu domicílio junto a mim, no endereço
> {endereço completo do cliente}.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Declarante

Sem pessoa declarada, o protótipo repete o nome e o documento do próprio
cliente (ver 7.8, item 5).

### 5. Declaração de Comparecimento — `declaracao_comparecimento` (título: "Declaração")

> Eu, **{NOME DO ADVOGADO EM MAIÚSCULAS}**, advogado(a), inscrito(a) nos
> quadros da {OAB}, **DECLARO**, para os devidos fins legais, que
> {qualificação} compareceu a este escritório profissional na data de
> {data do comparecimento, DD/MM/AAAA}.
>
> Em razão disso, solicita-se que sejam abonadas quaisquer faltas e/ou
> prejuízos que porventura possam recair sobre seu funcionário, conforme
> art. 473, VIII, da Consolidação das Leis do Trabalho c/c art. 463 do Código de
> Processo Civil.
>
> [**Destinatário/empresa:** {empresa}.]
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Declarante

### 6. Ficha de Atendimento ao Assistido — `ficha_atendimento`

Tabela com dois pares de rótulo e valor por linha:

| | | | |
|---|---|---|---|
| **Nome** | {nome} | **CPF/CNPJ** | {documento} |
| **Nacionalidade** | {nacionalidade} | **DN** | {nascimento, DD/MM/AAAA} |
| **Filiação** | {filiação} (linha inteira) | | |
| **Endereço** | {endereço completo} (linha inteira) | | |
| **Estado civil** | {estado civil} | **Profissão** | {profissão} |
| **e-mail** | {e-mail} | **Telefone** | {telefone} |
| **Banco** | {banco} | **Ag.** | {agência} |
| **Conta** | {conta} | **PIX** | {pix} |
| **Obs.** | {observações do cliente} (linha inteira) | | |
| **N.º dos autos, fatos narrados e orientação** | {fatos narrados e orientação, ou o número dos autos} (linha inteira) | | |

> **DECLARO** que os dados acima são verdadeiros e, tendo ciência do teor do
> art. 298 do Decreto-Lei n.º 2.848/1940, por ser expressão da verdade, firmo.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Assistido

(Art. 298 × 299 e a frase de ciência: 7.8, itens 2 e 3.)

### 7. Renúncia de Mandato — `renuncia`

> Nós, {advogados}, **RENUNCIAMOS TODOS E QUAISQUER PODERES** a nós conferidos
> por qualquer procuração outorgada por {qualificação}, para atuar em favor de
> seus interesses[ nos autos de n.º {processo}].
>
> Assim, por força do art. 112 da Lei n.º 13.105/2015 c/c art. 5º, §3º, da Lei
> n.º 8.906/1994, {conforme a forma escolhida}
>
> - *com comunicação:* os renunciantes continuarão a representar o renunciado
>   pelos próximos 10 dias, salvo se forem substituídos antes do término desse
>   prazo.
> - *parte segue com outro procurador:* considerando que a parte segue
>   representada por outro procurador, os renunciantes deixam de representá-la
>   e de comunicá-la, ressalvada a ciência quando necessária.
>
> [**Comunicação/ciência:** {comunicação}.]
>
> Assinam os advogados renunciantes, para fins de formalização da renúncia e
> ciência do ato, dispensada assinatura do assistido se tomada ciência por
> meios digitais efetivos.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Advogado(a) renunciante (uma linha por renunciante)

Aviso do protótipo, em destaque: "ATENÇÃO: ANTES DE ENVIAR O DOCUMENTO, PEDIR
DOCUMENTO DE IDENTIDADE COM FOTO, CONFORME IN 73/2021 CGJ/TJPR." (7.8, item 6).

### 8. Termo de Prestação de Contas — `prestacao_contas`

> **Contratante(s):** {qualificação}.
>
> **Contratados:** {advogados}
>
> **Termos:** Considerando o dever de prestar contas contido no art. 34, XXI,
> da Lei n.º 8.906/1994; considerando o contrato de honorários ajustado entre
> as partes em {data do contrato, ou "[DATA DO CONTRATO]"}; considerando os
> valores recebidos nos autos de n.º {processo, ou "[N.º DOS AUTOS]"} e
> repassados ao(à) contratante, temos:
>
> *Demonstrativo de parcelas pagas, vencidas e vincendas, até o presente
> momento:*
>
> | Data de vencimento - valor da parcela | Data de pagamento - valor pago |
> |---|---|
> | {uma linha por parcela} | {pagamento, ou vazio} |
> | **Total contratado:** {total} | **Total pago:** {total pago} |
>
> *Demonstrativo de valor pago ao(à) contratante, na data de assinatura deste
> termo:*
>
> **{valor repassado, ou "R$ [VALOR REPASSADO]"}** (em destaque)
>
> Ambas as partes, de comum acordo com todas as quantias acima descritas,
> declaram nada mais ter a reclamar uma da outra, assinando este instrumento,
> dando-o valor de recibo e de renúncia ao recebimento e/ou cobrança de
> quaisquer outros valores referentes a estes autos.
>
> Paranaguá/PR, {data por extenso}.
>
> \_\_\_\_\_\_\_\_\_\_\_\_ Contratante(s) · \_\_\_\_\_\_\_\_\_\_\_\_ Contratado(a)(s)

No protótipo as linhas do demonstrativo eram colchetes em vermelho para
preencher à mão; aqui, vindo do Financeiro, saem das parcelas e recebimentos
reais (7.6).

---

## Apêndice B — API do DJEN

**Fonte:** especificação oficial `https://comunicaapi.pje.jus.br/swagger/djen.yml`
(versão 1.0.4, atualizada em 04/03/2026), baixada e testada em 05/10/2026 a
partir do Brasil, só os cabeçalhos — sem trazer dado de processo.

| Item | Valor |
|---|---|
| Consulta | `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao` — sem autenticação |
| Filtros | `numeroOab`, `ufOab`, `nomeAdvogado`, `nomeParte`, `numeroProcesso`, `siglaTribunal`, `numeroComunicacao`, `meio` (`D` diário, `E` edital) |
| Período | `dataDisponibilizacaoInicio` e `dataDisponibilizacaoFim`, formato `AAAA-MM-DD` |
| Página | `pagina` (a partir de 1) e `itensPorPagina` — **só 5 ou 100** |
| Limites | Pesquisa por OAB ou com início ≠ fim: até 10.000 resultados. Por IP: `x-ratelimit-limit` (20 em 05/10/2026) e `x-ratelimit-remaining`; no 429, esperar 1 minuto. Vários IPs para driblar = abuso |
| Resposta | `{ status, message, count, items: [...] }` |
| Item | `id`, `data_disponibilizacao`, `siglaTribunal`, `tipoComunicacao` (citação, intimação, edital, pauta, lista de distribuição, ata), `nomeOrgao`, `texto` (teor; pode vir com HTML), `numero_processo`, `numeroprocessocommascara`, `meio`, `meiocompleto`, `link` (inteiro teor), `tipoDocumento`, `nomeClasse`, `codigoClasse`, `numeroComunicacao`, `ativo`, `hash`, `datadisponibilizacao`, `destinatarios[] { nome, polo }` (polo: A ativo, P passivo, T terceiro, D outros), `destinatarioadvogados[] { advogado: { nome, numero_oab, uf_oab } }` |
| Certidão | `GET /api/v1/comunicacao/{hash}/certidao` (PDF) |
| CORS | `Access-Control-Allow-Origin: *` (05/10/2026) |
| Região | De fora do Brasil, 403 (a própria página da especificação nega acesso de fora) |
| Publicação | Disponibilizada num dia, considera-se publicada no primeiro dia útil seguinte; o prazo começa no primeiro dia útil depois disso (Lei 11.419/2006, art. 4º, §§3º e 4º) |

Os endpoints `POST /api/v1/login` e `POST /api/v1/comunicacao` são de uso
exclusivo dos tribunais. Não usar.

---

## Apêndice C — Vetores de teste

Calculados com as regras deste documento e conferidos à mão. Se o teste
falhar, o erro está no código, não no vetor.

### Número do CNJ (`formato.js`)

| Entrada | Esperado |
|---|---|
| `numeroCnjValido('00012348920268160129')` | `true` |
| `numeroCnjValido('0001234-89.2026.8.16.0129')` | `true` (aceita a máscara) |
| `numeroCnjValido('00012340020268160129')` | `false` (dígito errado) |
| `numeroCnj('00012348920268160129')` | `'0001234-89.2026.8.16.0129'` |
| `tribunalDoNumero('00012348920268160129')` | `'TJPR'` |
| `tribunalDoNumero('10023450220255090411')` | `'TRT9'` |
| `tribunalDoNumero('50012349120264047009')` | `'TRF4'` |

### Outros formatos

| Entrada | Esperado |
|---|---|
| `dataPorExtenso('2026-10-05')` | `'05 de outubro de 2026'` |
| `duracao(0)` · `duracao(45)` · `duracao(60)` · `duracao(65)` · `duracao(920)` | `'0 min'` · `'45 min'` · `'1 h'` · `'1 h 05 min'` · `'15 h 20 min'` |
| `semAcento('José da Conceição')` | `'Jose da Conceicao'` |

### Prazos (`prazos.js`, `feriados.js`)

Só feriados nacionais fixos e recesso ligado, salvo indicação.

| Caso | Esperado |
|---|---|
| `pascoa(2026)` · `pascoa(2027)` | `'2026-04-05'` · `'2027-03-28'` |
| `sugestoesDoAno(2026)` | Carnaval 16 e 17/02, Sexta-feira Santa 03/04, Corpus Christi 04/06 |
| `sugestoesDoAno(2027)` | Carnaval 08 e 09/02, Sexta-feira Santa 26/03, Corpus Christi 27/05 |
| 15 dias **úteis**, base 05/10/2026 (seg.) — 12/10 é feriado | fatal **27/10/2026** (ter.) |
| Entrega 3 dias úteis antes de 27/10/2026 | **22/10/2026** (qui.) |
| `dataDaPublicacao('2026-10-09')` — sex., com fim de semana e 12/10 | **13/10/2026** (ter.) |
| 5 dias **úteis**, base 13/10/2026 | fatal **20/10/2026** (ter.) |
| 10 dias **corridos**, base 09/10/2026 (sex.) — começa em 13/10 | fatal **22/10/2026** (qui.) |
| 5 dias **corridos**, base 13/11/2026 (sex.) — começa em 16/11; o 5º dia é 20/11 (feriado) | fatal **23/11/2026** (seg.) |
| 15 dias **úteis**, base 14/12/2026, **com** recesso — 4 dias antes, o resto depois de 20/01 | fatal **04/02/2027** (qui.) |
| O mesmo, **sem** recesso — pula 25/12 e 01/01 | fatal **06/01/2027** (qua.) |
| 48 **horas**, base 2026-10-05T14:30:00-03:00 | fatal **2026-10-07T14:30:00-03:00** |
| `ehRecesso('2026-12-20')` · `ehRecesso('2027-01-20')` · `ehRecesso('2027-01-21')` | `true` · `true` · `false` |

### DJEN (`djen.js`)

| Entrada | Esperado |
|---|---|
| `lerOab('OAB/PR 105.790')` | `{ uf: 'PR', numero: '105790' }` |
| `lerOab('OAB/PR 117.141')` | `{ uf: 'PR', numero: '117141' }` |
| `lerOab('12.345/SC')` | `{ uf: 'SC', numero: '12345' }` |
| `lerOab('')` · `lerOab(null)` | `null` |
| `sugerirPrazo('…para manifestação no prazo de 15 (quinze) dias.')` | `{ quantidade: 15, unidade: 'dias' }` |
| `sugerirPrazo('…cumpra em 48 (quarenta e oito) horas…')` | `{ quantidade: 48, unidade: 'horas' }` |
| `sugerirPrazo('…no prazo de cinco dias…')` | `{ quantidade: 5, unidade: 'dias' }` |
| `sugerirPrazo('…no prazo legal.')` | `null` |
| `sugerirAudiencia('…audiência de conciliação para o dia 12/11/2026, às 14h30…')` | `{ dia: '2026-11-12', hora: '14:30' }` |
| `textoLimpo('A&amp;B<br>linha 2')` | `'A&B\nlinha 2'` |

### Aniversários (`aniversarios.js`)

| `proximoAniversario(nascimento, hoje)` | Esperado |
|---|---|
| `('1985-10-05', '2026-10-05')` | `{ data: '2026-10-05', dias: 0, idade: 41 }` |
| `('1985-10-12', '2026-10-05')` | `{ data: '2026-10-12', dias: 7, idade: 41 }` |
| `('1985-10-04', '2026-10-05')` | `{ data: '2027-10-04', dias: 364, idade: 42 }` |
| `('1992-02-29', '2027-02-27')` — ano não bissexto | `{ data: '2027-02-28', dias: 1, idade: 35 }` |
| `('1992-02-29', '2028-02-01')` — ano bissexto | `{ data: '2028-02-29', dias: 28, idade: 36 }` |

### Agenda (`ics.js`)

| Entrada | Esperado |
|---|---|
| `escaparIcs('a,b;c\\d' + '\n' + 'e')` | `'a\\,b\\;c\\\\d\\ne'` |
| Compromisso 05/10/2026, 14:00–15:00 em Brasília | `DTSTART:20261005T170000Z` e `DTEND:20261005T180000Z`; no link do Google, `dates=20261005T170000Z/20261005T180000Z` |
| Bloqueio de dia inteiro em 05 e 06/10/2026 | `DTSTART;VALUE=DATE:20261005` e `DTEND;VALUE=DATE:20261007` |
| Linha com mais de 75 octetos e acento | dobrada com CRLF + espaço, sem partir caractere |

---

## Apêndice D — Glossário

| Termo | Significado |
|---|---|
| DJEN | Diário de Justiça Eletrônico Nacional — onde os tribunais publicam as comunicações processuais. A API pública é a "Comunica" do CNJ |
| Intimação | Comunicação oficial ao advogado de que algo aconteceu no processo e, muitas vezes, de que há um prazo para agir |
| Disponibilização / publicação | O dia em que a comunicação aparece no DJEN / o primeiro dia útil seguinte, que conta como publicação |
| Prazo fatal | O último momento para praticar o ato no processo. Perdido, perde-se o direito |
| Prazo de entrega | Data interna, alguns dias antes do fatal, para terminar o trabalho com folga |
| Dias úteis / corridos | Contagem que pula fins de semana e feriados / que conta todos os dias |
| Recesso forense | 20/12 a 20/01: os prazos processuais não correm |
| Número único do CNJ | `NNNNNNN-DD.AAAA.J.TR.OOOO` — sequencial, dígito verificador, ano, segmento da Justiça, tribunal, origem |
| OAB/UF | Inscrição do advogado na Ordem, por estado (ex.: OAB/PR 105.790) |
| Outorgante / outorgado | Quem dá a procuração / quem a recebe |
| Hipossuficiência | Não ter como pagar as custas sem prejuízo do sustento — base da justiça gratuita |
| Renúncia de mandato | O advogado deixa de representar o cliente |
| Prestação de contas | Demonstrativo do que foi recebido no processo e repassado ao cliente |
| FAA | Ficha de Atendimento ao Assistido — o resumo da conversa que o cliente assina |
| Êxito | Honorário calculado sobre o que o cliente ganhar no processo |
| Sucumbência | Honorário pago pela parte que perdeu o processo |
| Provimento 205/2021 | Regra da OAB sobre publicidade da advocacia: sem depoimento, resultado, êxito, honorário, superlativo ou captação |
| LGPD | Lei Geral de Proteção de Dados |
