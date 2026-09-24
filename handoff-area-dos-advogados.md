# Handoff: área dos advogados (FHL Advocacia) — piloto da fase 2

> **Atualização de 16/09/2026.** O item 5 dos "Próximos passos" — ligar a área
> ao site — **foi feito**: site e área saem no mesmo deploy da Vercel (a área em
> `/sistema`), publicações e campanhas moram no Supabase e são escritas na área,
> e o build do site as lê. Migração `20260916120520_conteudo`, função de borda
> `publicar-site`, telas em `sistema/js/telas/site/`. O que está descrito abaixo
> sobre dois projetos na Vercel e sobre `npm run sistema` na porta 8124 **não
> vale mais** — a fonte técnica atual é [`sistema/README.md`](sistema/README.md).
> Os itens 1 a 4 continuam de pé.

**Data:** 15/09/2026
**Foco da próxima sessão:** decidir o commit e publicar na Vercel; depois, se o Ithalo quiser, começar a ligação entre a área e o site (publicações e campanhas editáveis pelos advogados).

## Contexto geral

Cliente: FHL Advocacia — Fonseca Hespanha Lisboa, Paranaguá/PR. A fase 1 (site institucional) já existe neste repositório. A fase 2 é o sistema interno do escritório, **ainda não contratada**: este piloto serve para demonstrar e orçar.

O escopo desta sessão foi **Agenda + Financeiro**, conforme `preparacao-area-dos-advogados.md`. As seções citadas nos comentários do código (5.2, 6.4, 6.5, 7.5…) são dessa preparação.

Três regras do Ithalo que valem para a próxima sessão:
- **Não commitar nem publicar sem aprovação dele.**
- Onde o cliente ainda não respondeu, seguir a recomendação própria e deixar configurável.
- O que depende de conta ou acesso que ainda não existe **não avança** — fica só o ponto de extensão e a pendência documentada.

## O que foi feito

- **Banco:** projeto Supabase `fhl-advocacia` (organização Haderach solutions, região São Paulo, plano gratuito), com 4 migrações aplicadas e versionadas. RLS em tudo, permissão por módulo, auditoria por gatilho, "nada se apaga", mês fechado travado.
- **Sistema:** app estático em `sistema/` — sem dependências, sem build, cliente Supabase próprio. 14 telas: Hoje, Agenda, Financeiro (Painel, Recebíveis, Em atraso, Contratos, novo contrato, detalhe do contrato, Contas, Fechamento, Relatórios, Configurações), Membros, Histórico, Minha conta.
- **Verificação:** 71 testes de permissão no banco (com identidades simuladas por JWT), 27 testes unitários dos cálculos, e varredura de todas as telas e fluxos no navegador contra uma API simulada — receber, cobrar, criar e renegociar contrato, estornar, fechar e reabrir mês, marcar compromisso com aviso de conflito.
- **Três bugs achados e corrigidos:** `opcoes` re-exportado sem import local (quebrava diálogos); diálogo que dependia do evento `close` do `<dialog>` (não chega com a aba em segundo plano); deflação do IPCA reduzindo a dívida (agora preserva o valor nominal, STJ Tema 678).
- **Documentação:** `sistema/README.md` é a fonte técnica; o README do site aponta para ele.
- **Acesso de suporte:** um membro administrador com o e-mail do Ithalo foi inserido direto no banco (fora das migrações). O usuário do Auth ainda precisa ser criado por ele.
- **Nada foi commitado e nada foi publicado.**

## Artefatos e referências

| O quê | Onde |
|---|---|
| Documentação técnica do sistema | `sistema/README.md` — **ler primeiro** |
| Escopo e decisões do cliente | `preparacao-area-dos-advogados.md`, `CLAUDE.md` |
| Migrações | `supabase/migrations/` — base, financeiro, agenda, ajustes_piloto |
| Testes de permissão | `supabase/testes/permissoes.sql` (roda no SQL Editor, desfaz tudo no fim) |
| Testes dos cálculos | `sistema/testes/` — `npm run sistema:test` |
| Servidor local do sistema | `scripts/sistema.mjs` — `npm run sistema`, porta 8124 (site: `npm run dev`, porta 8123) |
| Infra | Supabase `fhl-advocacia` (id `ulnpnbzibwbrzrpomgia`) · Vercel, time "Wibble" (Hobby) · GitHub `ithalokkugler-creator/FHL` |

**Git no fim da sessão** — tudo na árvore de trabalho, sem commit:
- Novos: `sistema/`, `supabase/`, `scripts/sistema.mjs`, este handoff (e `preparacao-area-dos-advogados.md`, que já era do Ithalo).
- Modificados por mim: `package.json`, `.claude/launch.json`, `README.md`.
- Modificados **antes** desta sessão, pelo Ithalo, e não tocados por mim: `assets/css/sections.css`, `assets/js/home.js`, `src/data/campanhas.mjs`, `src/pages/atuacao.mjs`, `src/pages/campanhas.mjs`, `src/pages/home.mjs`.

## Próximos passos

1. **Primeiro acesso do Ithalo:** Supabase → Authentication → Users → Add user → Create new user, com o e-mail dele (já cadastrado no membro de suporte), senha e *Auto Confirm User* marcado. Depois, `npm run sistema` e entrar. É o único fluxo que não pôde ser testado nesta sessão — não se digita senha nem se cria conta pelo agente.
2. **Commit:** se ele aprovar, commitar e dar push; em seguida criar o projeto na Vercel com Root Directory `sistema`, sem build, output `.` — e então pôr a URL do sistema em Supabase → Authentication → URL Configuration.
3. **Recomendação de segurança:** desligar *Allow new users to sign up* no Supabase.
4. **Levar ao Vinícius** as perguntas em aberto (lista pronta em `sistema/README.md`, seção Pendências).
5. **Possível bloco seguinte — ligar a área ao site:** conteúdo (publicações, campanhas) no Supabase, editor na área e *Deploy Hook* da Vercel para o site se regenerar. Estimativa combinada com o Ithalo: ~2 semanas para Publicações, mais ~1 para campanhas e áreas de atuação. Dois cuidados já levantados: o Deploy Hook deve ser chamado por uma Edge Function (nunca pelo navegador) e a imagem de compartilhamento hoje depende do `npm run og` local. E o editor deve lembrar as regras do Provimento 205/2021 a quem escreve.

## Pendências e bloqueios

**Parado por dependência externa:**
- Google Agenda nos dois sentidos — depende de qual conta o escritório vai usar (Gmail comum ou Workspace). As colunas `google_*` de `compromissos` estão reservadas e a tela avisa que não sincroniza.
- Convite e recuperação de senha por e-mail — dependem do e-mail e domínio oficiais e de um SMTP.
- Migração dos dados do protótipo — depende do arquivo de backup do Vinícius.

**Decidido pela recomendação, a confirmar com o Vinícius:**
- Atraso: multa de 10% + juros de 1% ao mês + correção pelo IPCA, sem carência.
- Divisão: partes iguais entre os quatro sócios, depois das despesas.
- Sócios com Financeiro completo; secretária lança sem ver a divisão.
- Pagamento parcial abate primeiro o saldo — o art. 354 do Código Civil manda imputar primeiro nos juros, salvo acordo. **É o ponto jurídico mais sensível em aberto.**

**Do plano gratuito:** o projeto Supabase pausa após cerca de uma semana sem uso (reativa no painel) e o Hobby da Vercel é só para uso não comercial — trocar por Pro antes de produção (~US$ 45/mês no total).

## Skills sugeridas

- `/code-review` antes do commit, sobre o diff da branch.
- `security-review` se mexer em migrações, RLS ou permissões.
- Nenhuma skill de documento (docx, pdf, xlsx) é necessária aqui.
