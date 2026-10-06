# Handoff: FHL Advocacia — revisão de design e bugs do site público

**Data:** 29/09/2026 (trabalho feito em 23–24/09/2026)
**Projeto:** `C:\Users\Ithalo\Desktop\Advocacia site`
**Foco da próxima sessão:** (1) perguntar ao Ithalo se pode commitar a revisão; (2) decidir o que fazer com as logos novas em `LogosNovas/`; (3) levar ao Vinícius os pontos "a confirmar".

---

## Contexto Geral

Site institucional (fase 1, contratada) da FHL Advocacia, Paranaguá/PR. Gerador estático próprio em Node (sem dependências): `npm run dev` → http://127.0.0.1:8123 (serve também a área dos advogados em `/sistema`). Contexto do cliente em `CLAUDE.md`; parte técnica em `README.md` — **ler os dois antes de mexer**.

O Ithalo pediu: deixar a parte pública "extremamente bonita e profissional", corrigir bugs, **mantendo o estilo atual** (petróleo + menta, Galano em caixa alta, numerais serifados Newsreader, raio 0 ou pílula, quatro gestos de revelação de `assets/js/motion.js`).

**Regra fixa:** nunca commitar nem publicar sem aprovação explícita do Ithalo.

## O que foi feito (tudo na árvore de trabalho, SEM commit — último commit é `96e8f1e`)

### Bugs corrigidos
- Menu no celular não fechava (header ficava sob a cortina). Agora o botão fica por cima e vira "✕ Fechar"; ciclo de Tab inclui o botão.
- Formulário fingia envio ("Mensagem enviada" sem mandar nada). Agora, com `FORM_ENDPOINT` vazio (`src/data/site.mjs`), abre a mensagem pronta no WhatsApp (campanhas incluem "Campanha: <slug>"); com endpoint, faz POST JSON. `method="post"` evita dados na URL sem JS.
- "OAB/PR nº 00.000" e CNPJ falso visíveis → `OAB`/`CNPJ` vazios; rodapé lista as inscrições reais dos 4 advogados; política omite CNPJ.
- 404 sem CSS em subpastas (`/atuacao/xyz.html`) → flag `raiz: true` no descritor (caminhos a partir de `/`).
- E-mail estourando o cartão em 1024–1280px → `<wbr>` após "@".
- Sem JS: loader cobria a home para sempre; números apareciam "0"; seção Linguagem só em juridiquês — todos resolvidos.
- Linguagem: buracos no texto traduzido (largura agora anima do termo antigo ao novo); celular traduzia só 3 de 5; leitor de tela lia frase embaralhada.
- Alinhamentos: rodapé do herói com margem dobrada e "Role" atrás do WhatsApp; `p { text-align:left }` global descentralizava blocos centrados (404, mapa, herói no celular); rótulo colado no título do Contato; filete duplo Método/Números; WhatsApp cobrindo o rodapé; banner de cookies cobrindo o CTA do herói.
- "Anos de atuação": 10 (sem fonte) → 6 (`ANOS_DE_ATUACAO`).

### Design
- Equipe: silhueta genérica → retrato tipográfico (iniciais serifadas + pétala da marca, `src/partials/equipe.mjs`); campo `foto` em `src/data/equipe.mjs` substitui quando houver ensaio; subgrid alinha nome/OAB/textos; âncoras `equipe.html#<slug>`; lista compacta no celular.
- Home: painéis de Atuação com numeral + 4 itens; conclusão da Linguagem dentro da cena fixada.
- Áreas: "Principais demandas" (checklist) e "Quem atende nesta área" (campo `areas` em equipe.mjs).
- Artigos: cabeçalho alinhado ao texto, tempo de leitura, "Quem escreveu" (casamento de autor por nome em `advogadoPorNome`), compartilhar só com links + "Copiar link".
- Canais de contato com ícones (`src/lib/icones.mjs`); rodapé completo; faixa final das páginas internas com botão + WhatsApp; 404 com atalhos; índice de publicações com resumo/autor; chamada de campanha em 2 colunas; banner de cookies fino; `aria-current` no menu.
- `scripts/check.mjs` agora valida âncoras entre páginas.
- `assets/img/avatar.svg` removido (não usado).

### Verificação (24/09)
`npm run check` → 17 páginas OK; `npm run sistema:test` → 29/29; capturas reais desktop/tablet/celular, movimento reduzido e JS desligado; sem erros de console.

## Artefatos e Referências
- Diff completo: `git diff` + novos `src/lib/icones.mjs`, `src/partials/equipe.mjs`.
- `README.md` — seções Estrutura, Tarefas comuns, Pendências e Notas de manutenção atualizadas com tudo acima.
- `CLAUDE.md` §7 e §8 atualizados (OAB, anos, bug I&D já corrigido).
- Memórias do projeto: `projeto-site-publico.md`, `referencia-capturas-headless.md` (em `~/.claude/projects/C--Users-Ithalo-Desktop-Advocacia-site/memory/`).
- **Novo, ainda não analisado:** `Advocacia site/LogosNovas/` (`fhl logonova.png`, `fhllogonovaversao2.png`, adicionados em 29/09). Estudos anteriores em `Logos/` (monograma serifado "FHL | FONSECA HESPANHA LISBOA"). O site ainda usa a marca de pétalas (`assets/img/logo.png`, `logo-watermark.png`, favicon, `og.png`, loader, retratos).

## Próximos Passos
1. Perguntar ao Ithalo se pode commitar a revisão (mostrar `git status`). Não commitar sem "sim".
2. Ver `LogosNovas/` e perguntar se a logo nova deve entrar no site. Se sim: trocar `logo.png`/marca d'água/favicon/og, revisar o loader e `scripts/og.mjs`, e reavaliar os retratos da equipe (usam a pétala da marca antiga) e a paleta.
3. Levar ao Vinícius os pontos a confirmar (abaixo).
4. Backend do formulário → módulo Contatos no Supabase `fhl-advocacia` (exige migração: pedir aprovação antes; plano gratuito).

## Pendências / Bloqueios
- **A confirmar com o Vinícius:** anos de atuação (6 pode ser o tempo dele, não do escritório); textos novos no contato ("Primeira conversa", "Sigilo"); mapeamento advogado → área; envio do formulário via WhatsApp como solução provisória.
- Continuam abertos (ver CLAUDE.md §7/§10): e-mail e domínio oficiais, OAB da sociedade e CNPJ, licença webfont da Galano (bloqueia lançamento), avaliações do Google × Provimento 205, Portuário como 5ª área.
- Verificação visual: o Browser pane oculto pausa `requestAnimationFrame` (GSAP/Lenis parados). Use Chrome headless via CDP (receita em `referencia-capturas-headless.md`); o script usado ficava no scratchpad da sessão antiga e não existe mais — recriar se precisar.

## Skills Sugeridas
- `code-review` sobre o diff antes do commit.
- `run` para subir o site (`npm run dev`) e conferir.
- `artifact-design`/`Artifact` só se for preciso apresentar as logos lado a lado para decisão.
