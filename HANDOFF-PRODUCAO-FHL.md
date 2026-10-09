# Handoff — novas funções da área dos advogados → produção

**06/10/2026.** Projeto: `C:\Users\Ithalo\Desktop\Advocacia site`.
Estado: tudo implementado e revisado **localmente**. Nenhum commit, push,
deploy ou migração remota foi feito.

---

## 1. O que existe hoje

### Entrega (05/10, dia)
Módulos novos, testáveis na prévia fictícia (`npm run testar:local`):

| Etapa | O que faz |
|---|---|
| E0 | Acessos **Clientes** e **Prazos** por membro; identidade do escritório única (`sistema/js/escritorio.js`) |
| F1 | **Contatos**: formulário do site grava no sistema (função `receber-contato`), triagem, resposta preparada, conversão em cliente |
| F2 | **Clientes** com cadastro completo PF/PJ, ficha integrada, **Processos** com CNJ validado |
| F3 | **Documentos**: 8 modelos, edição na folha A4, imprimir/PDF, Word, texto final imutável |
| F4 | **Atualizações** com cronômetro do servidor, lançamento à mão, relatório para o cliente |
| F5 (manual) | **Tarefas**, prazos informados à mão, resumo de **Prazos**, cadastro de **Feriados** |
| F6 (manual) | **Intimações** cadastradas à mão, conferência, geração de prazo ou audiência |
| F7 | Avisos em **Hoje**: tarefas do dia, aniversários, lembretes, contatos, intimações, contadores no menu |
| F8 (manual) | Agenda: "Pôr no Google Agenda", exportar `.ics`, preparar lembrete, feriados na grade |

Pendentes por decisão anterior: contagem automática de prazos, busca/importação
DJEN, feriados nacionais automáticos, sincronização Google nos dois sentidos.

### Revisão (05/10, noite)
Detalhe completo em `Advocacia site/REVISAO-NOVAS-FUNCOES.md`. Resumo:

- **14 bugs corrigidos.** O grave: "Lançar audiência" pedia a coluna
  inexistente `config_agenda.mostrar_fim_semana` e falharia em produção.
  Outros: tempo total somava cronômetro esquecido; contrato com êxito vazio
  imprimia "% sobre o proveito"; "Delegada por" em tarefa própria; CNJ sem
  máscara em Hoje; busca de intimação por CNJ; tribunal em minúsculas em
  Feriados; mensagens de resposta; título das declarações; prévia com 403
  em `localhost`.
- **~20 bugs visuais corrigidos**: cronômetro vazando do topo no celular,
  vão no topo das telas curtas, páginas rolando para o lado, nomes invisíveis
  em Membros, folha A4 cortada, ficha de atendimento sem bordas, tabela do
  relatório, filtros desalinhados, diálogos reorganizados.
- **Código**: ~25 arquivos novos reescritos legíveis; 5 migrações SQL
  reformatadas (mesma regra); contadores do menu desacoplados do núcleo
  (`fhl:gravou`). Texto jurídico intocado (864 saídas comparadas).
- **Verificação**: 104/104 testes JS · 329/329 SQL (PGlite, 14 migrações) ·
  93/93 fluxos de navegador · 17/17 páginas do site · 0 divergências de
  coluna entre frontend e esquema.

### Arquivos novos ou alterados (resumo)
- `supabase/migrations/` — **8 migrações novas** (abaixo)
- `supabase/functions/receber-contato/` — função pública do formulário
- `supabase/config.toml` — `verify_jwt = false` para `receber-contato` e `publicar-site`
- `supabase/testes/` — 4 arquivos de teste SQL novos
- `sistema/js/` — telas, domínio, documentos e núcleo; `sistema/css/sistema.css`
- `sistema/testes/` — 6 arquivos de teste novos
- `src/data/site.mjs` — `FORM_ENDPOINT` aponta para a função nova
- `src/pages/juridico.mjs` — política de privacidade (texto marcado [CONFIRMAR])
- `assets/js/site.js` — formulário envia para a função, com alternativa WhatsApp
- `scripts/testar-local.mjs`, `scripts/local/` — prévia fictícia
- Documentos: `GUIA-NOVAS-FUNCOES-FHL.md`, `TESTAR-NOVAS-FUNCOES.md`,
  `REVISAO-NOVAS-FUNCOES.md`, `handoff-novas-funcoes.md`, `sistema/README.md`

---

## 2. Antes de começar — leia

> **Um push na `main` publica na hora** (Vercel faz deploy automático).
> O frontend novo pede colunas novas já ao abrir (`membros.acesso_clientes`,
> `acesso_prazos`). Publicado **antes** das migrações, a **área dos advogados
> inteira deixa de abrir** e o formulário do site cai no erro.
> **Siga a ordem abaixo. Banco e função primeiro; push por último.**

As migrações novas são compatíveis com o frontend que está no ar hoje: dá
para aplicá-las antes, sem quebrar nada.

Contas: Supabase org "Haderach solutions", projeto **fhl-advocacia**
(`ulnpnbzibwbrzrpomgia`, São Paulo, plano Free — pode estar pausado; reative
no painel). Vercel time "Wibble", projeto `fhl-advocacia`
(`prj_QZHtS2FWiPekoSa0BtFZye4OAmoM`), ligado ao GitHub
`ithalokkugler-creator/FHL`.

---

## 3. Passo a passo para produção

### Passo 0 — Conferência local final (10 min)
```bash
cd "C:\Users\Ithalo\Desktop\Advocacia site"
npm run sistema:test
npm run check
npm run testar:local
```
Abra <http://127.0.0.1:8125/__teste> e faça o roteiro de
`TESTAR-NOVAS-FUNCOES.md`. Esperado: 104 testes e 17 páginas aprovados.

### Passo 1 — Commit, **sem push na main**
Revise o diff (`git diff`, arquivos novos em `git status`). Duas opções:

- **Recomendado:** commit numa branch e push dela (gera só uma *preview* na
  Vercel, não mexe no site no ar):
  ```bash
  git checkout -b novas-funcoes
  git add -A
  git commit -m "Novas funções E0–F8 e revisão"
  git push -u origin novas-funcoes
  ```
- Ou commit local na `main` **sem** `git push` até o passo 5.

Não entram no Git: `.local/` (prévia e evidências) e `dist/` (ignorados).

### Passo 2 — Backup do banco
No painel do Supabase: **Database → Backups** (no Free não há backup diário —
faça um dump manual pelo SQL Editor/CLI ou exporte as tabelas principais).
Alternativa dentro do sistema: **Financeiro → Relatórios → cópia de segurança**
(JSON) logado como administrador.

### Passo 3 — Aplicar as 8 migrações, nesta ordem
```
20261005130311_base_modulos.sql
20261005130317_contatos.sql
20261005140521_clientes_processos.sql
20261005212635_documentos.sql
20261005212642_atualizacoes.sql
20261005225741_tarefas_prazos.sql
20261005225750_intimacoes.sql
20261005232739_avisos_do_dia.sql
```
Pela CLI (projeto ligado): `supabase db push` — **confira antes** que só essas
8 aparecem como pendentes (`supabase migration list`); as 6 de setembro já
estão aplicadas. Preserve os nomes/versões dos arquivos.

Conferir depois:
- `membros` tem `acesso_clientes` e `acesso_prazos` (sócios/admin = `editar`);
- tabelas `contatos`, `clientes_detalhes`, `processos`, `documentos`,
  `atualizacoes`, `tarefas`, `feriados`, `intimacoes` existem com RLS ativo;
- **Advisors** do Supabase (Security/Performance) sem alerta novo inesperado
  (as funções `SECURITY DEFINER` conferem permissão na primeira linha).
- Opcional: rodar `supabase/testes/*.sql` só em banco **local/branch** — eles
  desfazem tudo no fim, mas não execute na produção.

### Passo 4 — Função `receber-contato`
1. Gere um segredo aleatório de **32+ caracteres** e cadastre em
   **Edge Functions → Secrets** como `CONTATO_SAL` (é o sal do hash do IP;
   sem ele a função responde 503 de propósito).
2. Publique: `supabase functions deploy receber-contato --no-verify-jwt`
   (o `config.toml` já marca `verify_jwt = false`).
3. A chave de serviço vem do ambiente da função (`SUPABASE_SECRET_KEYS` ou a
   legada); **nunca** vai para o navegador.
4. Teste real: um POST de teste e conferir que o contato aparece em
   Contatos. Confira também se o limite por IP funciona com o cabeçalho real
   (`x-real-ip`/`x-forwarded-for`) do gateway — ver ponto de atenção 3.

### Passo 5 — Publicar o frontend
- Se usou branch: abra a *preview* da Vercel, entre no `/sistema` com seu
  login e confira o básico (Hoje, Clientes, Contatos, Agenda). Depois faça o
  merge na `main`.
- Se commitou na `main`: `git push`.

A Vercel gera o site e o `/sistema` juntos (`npm run build` → `dist/`).

### Passo 6 — Conferência em produção (15 min)
- Entrar como administrador: menu mostra Clientes, Tarefas e prazos, Intimações.
- **Membros**: ajustar Clientes/Prazos de cada pessoa.
- Formulário do site (`/contato.html` e uma campanha): enviar um teste real →
  aparece em Contatos com origem e consentimento; depois arquivar.
- Cadastrar um cliente de teste? **Não** — "nada se apaga". Use um registro
  real ou teste só leitura. (Se precisar, desative depois.)
- Agenda: abrir compromisso, "Pôr no Google Agenda", exportar `.ics` e
  importar uma vez na agenda do escritório (conferência pendente).
- Documento: gerar uma procuração, imprimir em PDF e abrir o `.doc` no Word.
- Intimações → "Lançar audiência" (o bug corrigido) com uma intimação de teste.

### Passo 7 — Pendências de configuração que já existiam
- E-mails dos sócios em **Membros** e logins no Auth (Ithalo cria).
- Auth → URL Configuration: Site URL e Redirect URLs com o endereço da Vercel
  (`/sistema`).
- Desligar *Allow new users to sign up*.
- `VERCEL_DEPLOY_HOOK` em Secrets (botão "Publicar o site").
- `.github/workflows/manter-supabase.yml` mantém o projeto Free acordado.

---

## 4. Se algo der errado
- **Sistema não abre depois do push** → as migrações não foram aplicadas (ou
  falharam). Aplique-as; não é preciso reverter o frontend.
- **Formulário do site dá erro** → função não publicada ou sem `CONTATO_SAL`.
  O formulário oferece WhatsApp como alternativa. Para voltar ao modo só
  WhatsApp: `FORM_ENDPOINT = ''` em `src/data/site.mjs` e novo deploy.
- **Reverter o frontend** → na Vercel, *Promote* o deploy anterior
  (Deployments → … → Promote to Production). As migrações são aditivas e
  convivem com o frontend antigo.

---

## 5. Pontos de atenção (decidir com o Vinícius / Ithalo)
1. **Textos jurídicos** dos 8 modelos aguardam revisão do escritório (§7.8 da
   preparação). Não usar com cliente real antes.
2. **Dados [CONFIRMAR]**: e-mail oficial, domínio, OAB da sociedade, CNPJ,
   política de privacidade e prazo de guarda dos contatos (LGPD).
3. **Limite por IP** do formulário confia no cabeçalho do gateway; se ele não
   for sobrescrito, o teto global (30 envios/hora) segura.
4. **Prazo gerado de intimação** copia o teor para a descrição da tarefa, que
   todos os membros leem (de propósito). Confirmar se está bom.
5. **Planos gratuitos**: Supabase Free pausa sem uso e não tem backup diário;
   Vercel Hobby é para uso não comercial. Produção de verdade: ~US$ 45/mês
   (Supabase Pro US$ 25 + Vercel Pro US$ 20).
6. **Escritório Virtual**, Portuário no site e o "H" de FHL (saída do Marlon)
   seguem em aberto (CLAUDE.md §10).

## 6. Depois da produção — próximos passos sugeridos
1. Usar Contatos, Clientes e Documentos por algumas semanas e recolher ajustes.
2. Revisão jurídica dos modelos com o Vinícius.
3. Contagem automática de prazos e feriados nacionais (F5).
4. Busca/importação do DJEN por OAB (F6) — a maior alavanca comercial (§3).
5. Captura diária do DJEN só depois da busca manual em uso.

## 7. Referências
- `Advocacia site/REVISAO-NOVAS-FUNCOES.md` — tudo o que a revisão mudou
- `Advocacia site/TESTAR-NOVAS-FUNCOES.md` — roteiro de teste
- `Advocacia site/GUIA-NOVAS-FUNCOES-FHL.md` — guia das funções (cópia nesta pasta)
- `Advocacia site/handoff-novas-funcoes.md` — estado técnico detalhado
- `Advocacia site/sistema/README.md` — arquitetura, segurança, banco
