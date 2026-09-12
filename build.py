#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FHL ADVOCACIA — gerador de páginas estáticas
========================================

Não há Node nesta máquina, então não há Astro. Este script cumpre o papel do
`src/layouts/` da preparação (seção 10): um shell único — head, header, cortina
de menu, transição, rodapé, cookies, cursor e scripts — aplicado a todas as
páginas. Editar o cabeçalho ou o rodapé aqui atualiza o site inteiro, em vez de
manter treze cópias divergentes.

O site gerado NÃO depende deste script para funcionar: são arquivos .html
estáticos. Ao migrar para Astro, cada `Page` daqui vira um `.astro` e o SHELL
vira `src/layouts/Base.astro`.

    python build.py
"""

import os
import re
from dataclasses import dataclass, field

ROOT = os.path.dirname(os.path.abspath(__file__))

# Dados extraídos do sistema interno da FHL (fhl-site-etapa6-1…html)
MARCA = "FHL"
MARCA_LONGA = "FHL Advocacia"
RAZAO = "FHL Advocacia — Fonseca Hespanha Lisboa"
SLOGAN = "Advocacia estratégica e institucional"
OAB = "OAB/PR nº 00.000"                     # [CONFIRMAR] inscrição da sociedade
ENDERECO = "Rua Dr. Leocádio, 282 — Centro"
CIDADE = "Paranaguá — PR"
TEL = "(41) 2152-2607"
TEL_HREF = "+554121522607"
WHATS = "554121522607"
EMAIL = "contato@fhladvocacia.com.br"        # [CONFIRMAR] não constava no sistema

_END_Q = "Rua+Dr.+Leocadio,+282+-+Centro,+Paranagua+-+PR"
MAPS = "https://www.google.com/maps/search/?api=1&query=" + _END_Q
MAPS_EMBED = "https://www.google.com/maps?q=" + _END_Q + "&output=embed"


# ---------------------------------------------------------------------------
# ÁREAS DE ATUAÇÃO  [CONFIRMAR lista final com o escritório]
# ---------------------------------------------------------------------------
AREAS = [
    {
        "slug": "trabalhista",
        "num": "01",
        "nome": "Direito Trabalhista",
        "resumo": "Reclamações trabalhistas, verbas rescisórias, vínculo de emprego, "
                  "horas extras e defesa empresarial.",
        "intro": "Atuamos dos dois lados da relação de trabalho: para quem foi demitido "
                 "sem receber o que era devido, e para a empresa que precisa responder a "
                 "uma reclamação — ou evitar a próxima. Em ambos os casos o trabalho "
                 "começa no mesmo lugar: nos documentos que já existem.",
        "itens": [
            "Verbas rescisórias não pagas ou pagas a menor",
            "Reconhecimento de vínculo de emprego",
            "Horas extras, adicionais e jornada",
            "Rescisão indireta e justa causa",
            "Defesa empresarial em reclamatórias",
            "Acordos, homologações e cálculos",
        ],
        "quando": "Assim que o contrato de trabalho termina, ou assim que a empresa é "
                  "notificada. O prazo para reclamar direitos trabalhistas é curto, e "
                  "documento reunido depois vale menos do que documento reunido antes.",
    },
    {
        "slug": "previdenciario",
        "num": "02",
        "nome": "Direito Previdenciário",
        "resumo": "Aposentadorias, benefícios, revisões e processos administrativos "
                  "perante o INSS.",
        "intro": "Boa parte dos benefícios negados pelo INSS é negada por falha de "
                 "documentação, não por falta de direito. Antes de discutir na Justiça, "
                 "vale entender o que o processo administrativo registrou — e o que "
                 "deixou de registrar.",
        "itens": [
            "Aposentadoria por idade, tempo de contribuição e especial",
            "Auxílio por incapacidade temporária e permanente",
            "BPC/LOAS — benefício assistencial",
            "Pensão por morte e auxílio-reclusão",
            "Revisão de benefício concedido",
            "Recurso administrativo e ação judicial",
        ],
        "quando": "Antes de protocolar o pedido, para reunir a prova certa; e logo após "
                  "uma negativa, porque o prazo de recurso administrativo corre rápido.",
    },
    {
        "slug": "consumidor",
        "num": "03",
        "nome": "Direito do Consumidor",
        "resumo": "Fraudes bancárias, cobranças indevidas, negativação irregular e "
                  "vícios de produtos ou serviços.",
        "intro": "Fraude bancária, empréstimo que ninguém contratou, nome negativado por "
                 "dívida inexistente. São situações em que a prova costuma estar com a "
                 "empresa, não com o consumidor — e é justamente isso que a lei "
                 "reconhece.",
        "itens": [
            "Fraude bancária, golpes e empréstimos não contratados",
            "Cobrança indevida e negativação irregular",
            "Vício e defeito de produto ou serviço",
            "Serviço contratado e não prestado",
            "Planos de saúde e negativa de cobertura",
            "Revisão de contratos de adesão",
        ],
        "quando": "Assim que a cobrança aparece. Guarde prints, protocolos e extratos "
                  "antes de qualquer contato — é o que sustenta o caso depois.",
    },
    {
        "slug": "civel",
        "num": "04",
        "nome": "Direito Cível",
        "resumo": "Contratos, cobranças, indenizações, responsabilidade civil, posse, "
                  "propriedade e locação.",
        "intro": "O direito cível é onde a maior parte dos conflitos do dia a dia se "
                 "resolve: um contrato descumprido, uma dívida não paga, um dano que "
                 "alguém precisa reparar, um imóvel em disputa. Cada um deles é, antes "
                 "de tudo, um problema de prova e de prazo.",
        "itens": [
            "Contratos: redação, revisão e rescisão",
            "Cobrança e execução de dívidas",
            "Responsabilidade civil e indenizações",
            "Danos morais e materiais",
            "Posse, propriedade e usucapião",
            "Locação residencial e comercial",
        ],
        "quando": "Antes de assinar, quando ainda dá para mudar o texto. E assim que o "
                  "descumprimento acontece, enquanto a prova ainda é recuperável.",
    },
]


# ---------------------------------------------------------------------------
# EQUIPE — dados reais fornecidos pelo escritório
# ---------------------------------------------------------------------------
EQUIPE = [
    {
        "nome": "Guilherme O. Fonseca", "completo": "Guilherme de Oliveira da Fonseca", "ini": "GF", "oab": "OAB/PR 116.072",
        "atuacao": "Direito Cível, Consumidor, Imobiliário, Contratual e "
                   "Assessoria Preventiva.",
        "perfil": "Atuação estratégica em demandas consultivas e contenciosas, com "
                  "foco em organização documental, prevenção de riscos e condução "
                  "técnica de conflitos patrimoniais e contratuais.",
    },
    {
        "nome": "Juliana S. Lisboa", "completo": "Juliana Cristina da Silva Lisboa", "ini": "JL", "oab": "OAB/PR 117.141",
        "atuacao": "Direito de Família, Sucessões, Previdenciário e Consumidor.",
        "perfil": "Atuação voltada à solução de conflitos familiares, patrimoniais e "
                  "previdenciários, com atendimento humanizado, análise documental "
                  "criteriosa e estratégia processual individualizada.",
    },
    {
        "nome": "Marlon A. Hespanha", "completo": "Marlon Albini Hespanha", "ini": "MH", "oab": "OAB/PR 131.898",
        "atuacao": "Direito Trabalhista, Empresarial, Administrativo, Portuário e "
                   "Assessoria Preventiva.",
        "perfil": "Atuação em demandas empresariais, trabalhistas e administrativas, "
                  "com foco na prevenção de passivos, defesa técnica e estruturação "
                  "jurídica de procedimentos internos.",
    },
    {
        "nome": "Vinicius L. Lisboa", "completo": "Vinicius Rangel de Lima de Paula Lisboa", "ini": "VL", "oab": "OAB/PR 105.790",
        "atuacao": "Direito Trabalhista, Criminal, Previdenciário, Regularização "
                   "Fundiária, Ambiental e Portuário.",
        "perfil": "Atuação contenciosa e estratégica em demandas complexas, com "
                  "ênfase em análise probatória, construção de teses, defesa técnica "
                  "e medidas judiciais de urgência.",
    },
]


# ---------------------------------------------------------------------------
# PUBLICAÇÕES
# ---------------------------------------------------------------------------
POSTS = [
    {
        "slug": "clausula-nao-concorrencia",
        "data": "12 Ago 2026",
        "datetime": "2026-08-12",
        "titulo": "O que é, afinal, uma cláusula de não concorrência",
        "area": "Trabalhista",
        "thumb": "§",
        "autor": "Marlon A. Hespanha",
        "resumo": "Ela aparece em quase todo contrato relevante e quase nunca é lida com "
                  "atenção. Três perguntas para saber se a sua é válida.",
        "corpo": [
            ("p", "A cláusula de não concorrência aparece em contratos de trabalho, de "
                  "compra e venda de empresa, de sociedade e de prestação de serviços. "
                  "Em todos eles ela cumpre a mesma função: impedir que alguém use o "
                  "que aprendeu ali para competir logo em seguida."),
            ("h2", "O problema não é existir, é o alcance"),
            ("p", "Uma cláusula que proíbe atuação em qualquer atividade, em qualquer "
                  "lugar, por tempo indeterminado, tende a ser tratada como abusiva. Não "
                  "porque a proteção seja ilegítima, mas porque ela deixou de proteger "
                  "um interesse concreto e passou a simplesmente restringir o trabalho "
                  "de alguém."),
            ("pq", "Cláusula boa é cláusula específica."),
            ("h2", "As três perguntas"),
            ("ul", [
                "<strong>Prazo:</strong> por quanto tempo? Prazos longos sem "
                "contrapartida chamam atenção negativa.",
                "<strong>Território:</strong> onde? A restrição precisa acompanhar a "
                "área em que a empresa efetivamente atua.",
                "<strong>Atividade:</strong> o quê? Descrever a atividade concorrente "
                "vale mais do que proibir genericamente.",
            ]),
            ("p", "Há ainda uma quarta questão que costuma decidir a discussão: existe "
                  "compensação? Uma restrição remunerada é defendida com muito mais "
                  "facilidade do que uma restrição gratuita."),
            ("h2", "O que fazer com isso"),
            ("p", "Se a cláusula já foi assinada, o caminho é avaliar a extensão real da "
                  "restrição antes de assumir que ela é integralmente válida — ou "
                  "integralmente inválida. Se ainda não foi, é o momento de escrevê-la "
                  "com limites que se sustentem."),
        ],
    },
    {
        "slug": "locacao-comercial",
        "data": "28 Jul 2026",
        "datetime": "2026-07-28",
        "titulo": "Sete pontos para verificar antes de assinar uma locação comercial",
        "area": "Cível",
        "thumb": "¶",
        "autor": "Guilherme O. Fonseca",
        "resumo": "A locação comercial tem regras próprias e um direito que muita gente "
                  "desconhece: o da renovação.",
        "corpo": [
            ("p", "Locação comercial não é locação residencial com outro nome. Ela tem "
                  "regime próprio, e algumas das suas regras mais relevantes só "
                  "aparecem quando o contrato já está em execução."),
            ("h2", "1. O direito de renovação"),
            ("p", "Preenchidos certos requisitos de prazo e continuidade, o locatário "
                  "pode ter direito à renovação compulsória do contrato. Esse direito se "
                  "exerce dentro de uma janela específica de tempo — perdida a janela, "
                  "perde-se o direito."),
            ("h2", "2. O índice de reajuste"),
            ("p", "Índices diferentes produzem resultados muito diferentes ao longo de "
                  "cinco anos. Vale simular antes, não depois."),
            ("h2", "3. Quem paga o quê"),
            ("p", "Despesas ordinárias e extraordinárias de condomínio seguem lógicas "
                  "distintas. O contrato precisa dizer, com clareza, o que cabe a cada "
                  "lado — inclusive obras estruturais."),
            ("h2", "4. Garantia"),
            ("p", "Fiança, caução e seguro-fiança têm custos e consequências diferentes "
                  "em caso de inadimplemento. A escolha não é apenas financeira."),
            ("h2", "5. Benfeitorias"),
            ("p", "Quem faz a obra, quem paga, e o que acontece com ela ao fim do "
                  "contrato. A ausência dessa previsão é uma das causas mais comuns de "
                  "disputa na saída."),
            ("h2", "6. Multa por rescisão antecipada"),
            ("p", "A multa costuma ser proporcional ao tempo restante. Contratos que "
                  "cobram o valor integral independentemente do momento da saída tendem "
                  "a ser questionados."),
            ("h2", "7. A destinação do imóvel"),
            ("p", "Se a atividade pretendida depende de licença ou de zoneamento "
                  "específico, isso precisa estar no contrato — junto com o que acontece "
                  "se a licença não sair."),
            ("pq", "O contrato de locação é lido com atenção duas vezes: antes de "
                   "assinar, ou no dia da briga."),
        ],
    },
    {
        "slug": "multa-contratual",
        "data": "03 Jul 2026",
        "datetime": "2026-07-03",
        "titulo": "Multa contratual: quando ela protege e quando ela vira problema",
        "area": "Cível",
        "thumb": "†",
        "autor": "Vinicius L. Lisboa",
        "resumo": "Multa alta demais não intimida mais — só aumenta a chance de a "
                  "cláusula ser reduzida em juízo.",
        "corpo": [
            ("p", "A multa contratual existe para dar consequência ao descumprimento. "
                  "Sem ela, a obrigação vira recomendação. O erro comum não é usar "
                  "multa: é calibrá-la mal."),
            ("h2", "Moratória e compensatória"),
            ("p", "A multa moratória pune o atraso; a compensatória, o descumprimento "
                  "definitivo. São coisas diferentes e produzem efeitos diferentes — "
                  "contratos que as tratam como sinônimos costumam gerar discussão "
                  "sobre o que exatamente está sendo cobrado."),
            ("h2", "O limite prático"),
            ("p", "Multa manifestamente excessiva em relação à obrigação principal pode "
                  "ser reduzida. O efeito prático é que uma multa desproporcional não "
                  "protege mais do que uma multa proporcional: apenas transfere a "
                  "discussão para o juiz."),
            ("pq", "Multa que ninguém acredita que será cobrada não é garantia; é "
                   "decoração."),
            ("h2", "O que costuma funcionar melhor"),
            ("ul", [
                "Multa proporcional ao valor e à duração da obrigação",
                "Previsão expressa de cumulação — ou não — com perdas e danos",
                "Mecanismo de notificação antes da incidência",
                "Prazo de cura, quando a obrigação admite correção",
            ]),
            ("p", "Um prazo de cura bem escrito resolve mais descumprimentos do que "
                  "qualquer multa — e preserva a relação comercial, que costuma valer "
                  "mais do que o valor em disputa."),
        ],
    },
]


# ---------------------------------------------------------------------------
# SHELL
# ---------------------------------------------------------------------------
ARROW = ('<svg viewBox="0 0 22 8" fill="none" aria-hidden="true">'
         '<path class="link-arrow__line" d="M0 4h20" stroke="currentColor"/>'
         '<path d="M17 1l3.5 3-3.5 3" stroke="currentColor" fill="none"/></svg>')


def arrow_link(href, text, cls="link-arrow"):
    return (f'<a class="{cls}" href="{href}">{text} {ARROW}</a>')


NAV = [
    ("index.html", "Início"),
    ("escritorio.html", "O Escritório"),
    ("atuacao.html", "Atuação"),
    ("equipe.html", "Quem somos"),
    ("publicacoes.html", "Publicações"),
    ("contato.html", "Contato"),
]


def shell(page):
    """Monta a página completa. `p` é o prefixo de caminho para subpastas."""
    p = "../" * page.depth

    menu_items = "\n".join(
        f'        <li class="menu__item"><a class="menu__link" href="{p}{href}">{label}</a>'
        f'<span class="menu__link-underline"></span></li>'
        for href, label in NAV
    )

    areas_footer = "\n".join(
        f'          <li><a class="link" href="{p}atuacao/{a["slug"]}.html">{a["nome"]}</a></li>'
        for a in AREAS
    )

    nav_footer = "\n".join(
        f'          <li><a class="link" href="{p}{href}">{label}</a></li>'
        for href, label in NAV[1:]
    )

    scripts = f'''<script src="{p}assets/vendor/gsap.min.js"></script>
<script src="{p}assets/vendor/ScrollTrigger.min.js"></script>
<script src="{p}assets/vendor/lenis.min.js"></script>
<script>if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);</script>
<script src="{p}assets/js/motion.js"></script>'''

    # hero-gl.js só na home (é a única página com a cena WebGL).
    # home.js vai em TODAS: a contagem de números (escritorio.html) e a
    # miniatura das publicações também vivem lá, e cada função já retorna
    # cedo quando o elemento não existe na página.
    if page.home:
        scripts += f'\n<script src="{p}assets/js/hero-gl.js"></script>'
    scripts += f'\n<script src="{p}assets/js/home.js"></script>'
    scripts += f'\n<script src="{p}assets/js/site.js"></script>'

    loader = ""
    if page.home:
        loader = f'''
<div class="loader" aria-hidden="true">
  <div class="loader__panel loader__panel--top"></div>
  <div class="loader__panel loader__panel--bottom"></div>
  <div class="loader__inner">
    <img class="loader__logo" src="{p}assets/img/logo.png" alt="" width="64" height="111">
    <div class="loader__mark">FHL</div>
    <div class="loader__bar"><i></i></div>
  </div>
</div>'''

    jsonld = ""
    if page.home:
        jsonld = f'''
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "LegalService",
  "name": "FHL Advocacia — Fonseca Hespanha Lisboa",
  "description": "Advocacia estratégica e institucional em Paranaguá — PR.",
  "areaServed": "BR",
  "address": {{
    "@type": "PostalAddress",
    "streetAddress": "Rua Dr. Leocádio, 282 — Centro",
    "addressLocality": "Paranaguá",
    "addressRegion": "PR",
    "addressCountry": "BR"
  }},
  "telephone": "+55 41 2152-2607",
  "email": "{EMAIL}",
  "knowsAbout": [{", ".join(chr(34) + a["nome"] + chr(34) for a in AREAS)}]
}}
</script>'''
    elif page.article:
        jsonld = f'''
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{page.article['titulo']}",
  "datePublished": "{page.article['datetime']}",
  "author": {{"@type": "Person", "name": "{page.article['autor']}"}},
  "publisher": {{"@type": "Organization", "name": "FHL Advocacia — Fonseca Hespanha Lisboa"}}
}}
</script>'''

    preload = f'<link rel="preload" href="{p}assets/fonts/galano-bold.woff2" as="font" type="font/woff2" crossorigin>'

    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<title>{page.title}</title>
<meta name="description" content="{page.desc}">
<meta name="theme-color" content="#0C1917">

<meta property="og:type" content="{'article' if page.article else 'website'}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="{page.title}">
<meta property="og:description" content="{page.desc}">
<meta property="og:image" content="{p}assets/img/og.png">

<link rel="icon" href="{p}assets/img/favicon.png" type="image/png">
{preload}
<link rel="stylesheet" href="{p}assets/css/tokens.css">
<link rel="stylesheet" href="{p}assets/css/base.css">
<link rel="stylesheet" href="{p}assets/css/components.css">
<link rel="stylesheet" href="{p}assets/css/sections.css">

<script>
/* Estados iniciais de revelação só existem com JS ativo — sem JS nada fica escondido.
   REDE DE SEGURANÇA: se o GSAP não carregar (CDN bloqueado, rede caindo, bloqueador
   de scripts), a classe `js` permaneceria e os títulos ficariam visibility:hidden
   PARA SEMPRE. Passados 3s sem o site ter inicializado, devolvemos a página ao
   estado sem-JS: sem animação, mas com todo o conteúdo legível. */
document.documentElement.classList.add('js');
setTimeout(function () {{
  var h = document.documentElement;
  if (!h.classList.contains('ied-ready')) h.classList.remove('js');
}}, 3000);
</script>{jsonld}
</head>

<body>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
{loader}
<header class="header">
  <div class="wrap header__inner">
    <a class="brand" href="{p}index.html" aria-label="FHL Advocacia — início">
      <img class="brand__mark" src="{p}assets/img/logo.png" alt="" width="26" height="45">
      <span class="brand__name">FHL<span class="brand__word">Advocacia</span></span>
    </a>
    <div class="header__actions">
      <!-- Contato sempre à mão: era o principal pedido do cliente. -->
      <a class="header__cta" href="{p}contato.html">Fale conosco</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu">
        <span class="menu-toggle__glyph" aria-hidden="true"><i></i><i></i></span>
        <span>Menu</span>
      </button>
    </div>
  </div>
</header>

<div class="menu" id="menu" aria-hidden="true">
  <div class="menu__panel menu__panel--top"></div>
  <div class="menu__panel menu__panel--bottom"></div>
  <div class="menu__seam"></div>

  <div class="wrap menu__inner">
    <nav class="menu__nav" aria-label="Navegação principal">
      <ul>
{menu_items}
      </ul>
    </nav>

    <div class="menu__meta">
      <div>
        <div class="menu__meta-label">Escritório</div>
        <address>{ENDERECO}<br>{CIDADE}</address>
      </div>
      <div>
        <div class="menu__meta-label">Contato</div>
        <a href="tel:{TEL_HREF}">{TEL}</a><br>
        <a href="mailto:{EMAIL}">{EMAIL}</a>
      </div>
      <div>
        <div class="menu__meta-label">Inscrição</div>
        {OAB}
      </div>
    </div>
  </div>
</div>

<div class="transition" aria-hidden="true">
  <div class="transition__panel transition__panel--top"></div>
  <div class="transition__panel transition__panel--bottom"></div>
</div>

<main id="conteudo">
{page.body}
</main>

<footer class="footer">
  <div class="wrap">
    <div class="footer__top">
      <div class="footer__col">
        <a class="brand" href="{p}index.html">
          <img class="brand__mark" src="{p}assets/img/logo.png" alt="" width="26" height="45">
          <span class="brand__name">FHL<span class="brand__word">Advocacia</span></span>
        </a>
        <p class="footer__slogan">{SLOGAN}</p>
      </div>

      <div class="footer__col">
        <p class="footer__label">Navegação</p>
        <ul class="footer__list">
{nav_footer}
        </ul>
      </div>

      <div class="footer__col">
        <p class="footer__label">Atuação</p>
        <ul class="footer__list">
{areas_footer}
        </ul>
      </div>

      <div class="footer__col">
        <p class="footer__label">Contato</p>
        <address>
          {ENDERECO}<br>
          {CIDADE}<br>
          <a class="link" href="tel:{TEL_HREF}">{TEL}</a>
        </address>
      </div>
    </div>

    <div class="footer__bottom">
      <p class="footer__oab">{RAZAO} · {OAB}</p>
      <p>
        <a class="link" href="{p}politica-de-privacidade.html">Política de Privacidade</a>
        &nbsp;·&nbsp;
        <a class="link" href="{p}termos-de-uso.html">Termos de Uso</a>
        &nbsp;·&nbsp;
        <span>© <span data-year>2026</span></span>
      </p>
    </div>
  </div>
</footer>

<div class="cookie" role="dialog" aria-label="Preferências de cookies">
  <p class="small">
    Usamos cookies apenas para entender como o site é usado. Nada é ativado
    antes da sua escolha. Detalhes na
    <a class="link" href="{p}politica-de-privacidade.html">Política de Privacidade</a>.
  </p>
  <div class="cookie__actions">
    <button class="btn" type="button" data-cookie="accept">Aceitar</button>
    <button class="btn" type="button" data-cookie="reject">Recusar</button>
  </div>
</div>

<!-- Canal direto sempre visível. Discreto de propósito: nada de pulsar ou
     abrir sozinho — captação agressiva é vedada pelo Provimento 205/2021. -->
<a class="whats" href="https://wa.me/{WHATS}" target="_blank" rel="noopener noreferrer"
   aria-label="Conversar com a FHL Advocacia pelo WhatsApp">
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.38c0-4.54 3.7-8.23 8.24-8.23a8.18 8.18 0 0 1 5.82 2.42 8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23z"/>
  </svg>
  <span class="whats__label">WhatsApp</span>
</a>

<div class="grain" aria-hidden="true"></div>

<div class="post-thumb" aria-hidden="true"><div class="post-thumb__art">&amp;</div></div>

{scripts}
</body>
</html>
'''


@dataclass
class Page:
    path: str
    title: str
    desc: str
    body: str
    depth: int = 0
    home: bool = False
    article: dict = field(default=None)


def page_head(label, title, lead=None, depth=0):
    """Cabeçalho padrão das páginas internas."""
    lead_html = f'<p class="lead" data-reveal="rise">{lead}</p>' if lead else ""
    return f'''  <section class="page-head">
    <img class="watermark watermark--right" src="{"../" * depth}assets/img/logo-watermark.png" alt="" aria-hidden="true">
    <div class="wrap page-head__inner">
      <p class="label" data-reveal="rise">{label}</p>
      <h1 class="h1 page-head__title r-mask" data-reveal="mask">{title}</h1>
      {lead_html}
    </div>
  </section>'''


def next_block(title, href, cta, depth=0):
    p = "../" * depth
    return f'''  <section class="next-block">
    <div class="wrap">
      <h2 class="display" style="font-size:var(--t-h1)">{title}</h2>
      {arrow_link(p + href, cta)}
    </div>
  </section>'''


# ---------------------------------------------------------------------------
# PÁGINAS
# ---------------------------------------------------------------------------
def build_escritorio():
    body = page_head(
        "O Escritório",
        "Entender o negócio primeiro, escrever depois",
        "A I&amp;D Legal atua em direito cível e contratual para empresas e pessoas "
        "que precisam de segurança antes, durante e depois da assinatura."
    ) + f'''

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">Como chegamos aqui</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <div class="prose">
          <p class="lead r-rise">
            O escritório nasceu de uma observação simples: a maior parte das disputas
            que chegam ao contencioso cível estava escrita, com todas as letras, em um
            contrato que ninguém leu com atenção.
          </p>
          <p class="r-rise">
            Por isso trabalhamos nas duas pontas. Na redação e na negociação, para que o
            documento resista ao que vier. E no contencioso, quando o documento já não
            resistiu — nossa própria experiência em juízo é o que informa a forma como
            escrevemos.
          </p>
          <p class="r-rise">
            Atendemos empresas de médio porte em contratos e disputas cíveis, e pessoas
            físicas em questões imobiliárias, contratuais e sucessórias. Em ambos os
            casos o cliente costuma chegar com um problema já em curso — e o que ele
            precisa primeiro é de um diagnóstico honesto do tamanho dele.
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="section metodo is-light">
    <div class="wrap">
      <div class="metodo__head">
        <p class="label" data-reveal="rise">Método</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Como trabalhamos</h2>
      </div>
      <div class="metodo__steps" data-reveal="rise-group">
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">01</div>
          <h3 class="h3 metodo__title">Escuta</h3>
          <p class="metodo__text">Antes de olhar o contrato, entendemos o negócio. O que a
          empresa vende, para quem, e onde já se queimou antes.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">02</div>
          <h3 class="h3 metodo__title">Diagnóstico</h3>
          <p class="metodo__text">Mapeamos os riscos reais do documento e separamos o que
          é negociável do que é inegociável.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">03</div>
          <h3 class="h3 metodo__title">Redação e negociação</h3>
          <p class="metodo__text">Escrevemos em português. Negociamos com posição definida,
          não com improviso.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">04</div>
          <h3 class="h3 metodo__title">Acompanhamento</h3>
          <p class="metodo__text">Contrato assinado não é assunto encerrado. Revisão
          periódica e suporte na execução.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--fn numeros is-light section--flush-top">
    <div class="wrap">
      <div class="numeros__grid">
        <div><div class="numeros__value numeral" data-count="18">0</div>
          <div class="numeros__label">Anos de<br>atuação</div></div>
        <div><div class="numeros__value numeral" data-count="4">0</div>
          <div class="numeros__label">Áreas do<br>direito civil</div></div>
        <div><div class="numeros__value numeral" data-count="4">0</div>
          <div class="numeros__label">Advogados<br>na equipe</div></div>
        <div><div class="numeros__value numeral" data-count="40" data-suffix="+">0</div>
          <div class="numeros__label">Artigos<br>publicados</div></div>
      </div>
      <p class="numeros__note">
        Setores atendidos: construção civil, varejo, saúde, tecnologia e agronegócio.
      </p>
    </div>
  </section>

''' + next_block("Vamos conversar", "contato.html", "Entrar em contato")

    return Page("escritorio.html",
                "O Escritório — FHL Advocacia",
                "Advocacia cível e contratual. Entender o negócio primeiro, escrever depois.",
                body)


def build_atuacao_index():
    items = "\n".join(f'''      <a class="index-item" href="atuacao/{a["slug"]}.html">
        <span class="index-item__num numeral">{a["num"]}</span>
        <span class="index-item__title">{a["nome"]}</span>
        <span class="index-item__text">{a["resumo"]}</span>
        <span class="link-arrow">Ver {ARROW}</span>
      </a>''' for a in AREAS)

    body = page_head(
        "Atuação",
        "Direito cível e contratual",
        "Quatro frentes que se comunicam: o que escrevemos informa o que defendemos, "
        "e o que defendemos informa o que escrevemos."
    ) + f'''

  <section class="section">
    <div class="wrap">
      <div class="index-list" data-reveal="rise-group">
{items}
      </div>
    </div>
  </section>

''' + next_block("Não sabe por onde começar?", "contato.html", "Descreva sua situação")

    return Page("atuacao.html", "Atuação — FHL Advocacia",
                "Contratos empresariais, contencioso cível, responsabilidade civil e direito imobiliário.",
                body)


def build_area(area):
    itens = "\n".join(f'          <li>{i}</li>' for i in area["itens"])
    outras = [a for a in AREAS if a["slug"] != area["slug"]]
    outras_html = "\n".join(f'''      <a class="index-item" href="{o["slug"]}.html">
        <span class="index-item__num numeral">{o["num"]}</span>
        <span class="index-item__title">{o["nome"]}</span>
        <span class="index-item__text">{o["resumo"]}</span>
        <span class="link-arrow">Ver {ARROW}</span>
      </a>''' for o in outras)

    body = page_head("Atuação · " + area["num"], area["nome"], area["intro"], depth=1) + f'''

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">O que fazemos</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <div class="prose r-rise">
          <ul>
{itens}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--fn is-light">
    <div class="wrap grid">
      <div style="grid-column:1 / span 5">
        <p class="label" data-reveal="rise">Quando procurar</p>
      </div>
      <div style="grid-column:7 / -1" data-reveal="rise-group">
        <p class="lead r-rise">{area["quando"]}</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <p class="label" data-reveal="rise" style="margin-bottom:var(--s-4)">Outras áreas</p>
      <div class="index-list" data-reveal="rise-group">
{outras_html}
      </div>
    </div>
  </section>

''' + next_block("Vamos conversar", "contato.html", "Entrar em contato", depth=1)

    return Page(f"atuacao/{area['slug']}.html",
                f"{area['nome']} — FHL Advocacia",
                area["resumo"],
                body, depth=1)


def build_equipe():
    cards = "\n".join(f'''        <article class="equipe__card r-wipe">
          <div class="equipe__media">
            <img class="equipe__avatar" src="assets/img/avatar.svg" alt="" width="400" height="500">
          </div>
          <h2 class="h3 equipe__name">{m["nome"]}</h2>
          <p class="equipe__full">{m["completo"]}</p>
          <p class="equipe__oab">{m["oab"]}</p>
          <hr class="equipe__rule">
          <div class="equipe__block">
            <p class="equipe__block-label">Atuação</p>
            <p class="equipe__block-text">{m["atuacao"]}</p>
          </div>
          <div class="equipe__block">
            <p class="equipe__block-label">Perfil</p>
            <p class="equipe__block-text">{m["perfil"]}</p>
          </div>
        </article>''' for m in EQUIPE)

    body = page_head(
        "Quem somos", "Os advogados por trás de cada caso",
        "Toda peça que sai daqui tem um responsável com nome e inscrição na OAB. "
        "A relação é com a pessoa, não com o protocolo."
    ) + f'''

  <section class="section equipe">
    <div class="wrap">
      <!-- Art. 5 do Provimento 205/2021 autoriza expressamente fotos dos advogados.
           Placeholders de iniciais até o ensaio fotográfico existir (pendência 5). -->
      <div class="equipe__grid" data-reveal="wipe-group">
{cards}
      </div>
    </div>
  </section>

''' + next_block("Vamos conversar", "contato.html", "Entrar em contato")

    return Page("equipe.html", "Quem somos — FHL Advocacia",
                "Advogados responsáveis por cada frente de atuação da FHL Advocacia.", body)


def build_publicacoes_index():
    items = "\n".join(f'''      <a class="post" href="publicacoes/{po["slug"]}.html" data-thumb="{po["thumb"]}">
        <span class="post__date">{po["data"]}</span>
        <span class="post__title">{po["titulo"]}</span>
        <span class="post__area">{po["area"]}</span>
      </a>''' for po in POSTS)

    body = page_head(
        "Publicações", "O que estamos escrevendo",
        "Conteúdo informativo sobre as questões que mais aparecem na prática. "
        "Nada aqui substitui a análise do seu caso concreto."
    ) + f'''

  <section class="section publicacoes">
    <div class="wrap">
{items}
    </div>
  </section>

''' + next_block("Tem uma dúvida específica?", "contato.html", "Fale com o escritório")

    return Page("publicacoes.html", "Publicações — FHL Advocacia",
                "Artigos sobre contratos, contencioso cível, responsabilidade civil e direito imobiliário.",
                body)


def build_post(post):
    parts = []
    for kind, val in post["corpo"]:
        if kind == "p":
            parts.append(f"      <p>{val}</p>")
        elif kind == "h2":
            parts.append(f"      <h2>{val}</h2>")
        elif kind == "pq":
            parts.append(f'      <blockquote class="pullquote">{val}</blockquote>')
        elif kind == "ul":
            lis = "\n".join(f"        <li>{i}</li>" for i in val)
            parts.append(f"      <ul>\n{lis}\n      </ul>")
    corpo = "\n".join(parts)

    outros = [x for x in POSTS if x["slug"] != post["slug"]]
    outros_html = "\n".join(f'''      <a class="post" href="{o["slug"]}.html" data-thumb="{o["thumb"]}">
        <span class="post__date">{o["data"]}</span>
        <span class="post__title">{o["titulo"]}</span>
        <span class="post__area">{o["area"]}</span>
      </a>''' for o in outros)

    body = f'''  <section class="page-head">
    <div class="wrap page-head__inner">
      <p class="label" data-reveal="rise">{post["area"]}</p>
      <h1 class="h1 page-head__title page-head__title--article r-mask" data-reveal="mask">{post["titulo"]}</h1>
      <p class="lead" data-reveal="rise">{post["resumo"]}</p>
    </div>
  </section>

  <article class="section">
    <div class="wrap grid">
      <div style="grid-column:3 / span 8">
        <div class="article-meta">
          <span>{post["autor"]}</span>
          <time datetime="{post["datetime"]}">{post["data"]}</time>
          <span>{post["area"]}</span>
        </div>

        <div class="article-body" data-reveal="rise-group">
{corpo}
        </div>

        <p class="small text-muted" style="margin-top:var(--s-6);max-width:60ch">
          Este texto tem finalidade informativa e não constitui consulta jurídica.
          Cada situação depende de análise específica.
        </p>
      </div>
    </div>
  </article>

  <section class="section section--fn publicacoes">
    <div class="wrap">
      <p class="label" data-reveal="rise" style="margin-bottom:var(--s-4)">Continue lendo</p>
{outros_html}
    </div>
  </section>

''' + next_block("Vamos conversar", "contato.html", "Entrar em contato", depth=1)

    return Page(f"publicacoes/{post['slug']}.html",
                f"{post['titulo']} — FHL Advocacia",
                post["resumo"], body, depth=1, article=post)



# ---------------------------------------------------------------------------
# CANAIS DIRETOS
# O cliente reclamou que o contato ficava "lá embaixo, no último". Este bloco
# põe os canais reais na frente — clicáveis, com o valor visível, antes do
# formulário. Quem quer falar agora não precisa preencher nada.
# ---------------------------------------------------------------------------
def canais_diretos(depth=0):
    p = "../" * depth
    maps = ("https://www.google.com/maps/search/?api=1&query="
            "Rua+Dr.+Leocadio,+282+-+Centro,+Paranagua+-+PR")
    return f'''      <div class="contato__direct" data-reveal="rise-group">
        <a class="channel r-rise" href="https://wa.me/{WHATS}" target="_blank" rel="noopener noreferrer">
          <span class="channel__label">WhatsApp</span>
          <span class="channel__value">{TEL}</span>
          <span class="channel__note">O caminho mais rápido</span>
        </a>
        <a class="channel r-rise" href="tel:{TEL_HREF}">
          <span class="channel__label">Telefone</span>
          <span class="channel__value">{TEL}</span>
          <span class="channel__note">Seg. a sex., 9h às 18h</span>
        </a>
        <a class="channel r-rise" href="mailto:{EMAIL}">
          <span class="channel__label">E-mail</span>
          <span class="channel__value">{EMAIL}</span>
          <span class="channel__note">Resposta em até um dia útil</span>
        </a>
        <a class="channel r-rise" href="{maps}" target="_blank" rel="noopener noreferrer">
          <span class="channel__label">Escritório</span>
          <span class="channel__value">{ENDERECO}</span>
          <span class="channel__note">{CIDADE}</span>
        </a>
      </div>'''


CONTATO_FORM = f'''        <div class="contato__form">
          <p class="lead" data-reveal="rise" style="margin-bottom:var(--s-5)">
            Descreva sua situação. Respondemos em até um dia útil.
          </p>

          <form data-form novalidate>
            <div class="contato__fields">
              <div class="contato__row">
                <div class="field">
                  <input class="field__input" type="text" id="nome" name="nome" placeholder=" " required autocomplete="name">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="nome">Nome</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
                <div class="field">
                  <input class="field__input" type="email" id="email" name="email" placeholder=" " required autocomplete="email">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="email">E-mail</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
              </div>

              <div class="contato__row">
                <div class="field">
                  <input class="field__input" type="tel" id="telefone" name="telefone" placeholder=" " autocomplete="tel">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="telefone">Telefone</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
                <div class="field">
                  <input class="field__input" type="text" id="empresa" name="empresa" placeholder=" " autocomplete="organization">
                  <span class="field__line" aria-hidden="true"></span>
                  <label class="field__label" for="empresa">Empresa (opcional)</label>
                  <span class="field__error" role="alert" aria-live="polite"></span>
                </div>
              </div>

              <div class="field">
                <textarea class="field__input" id="mensagem" name="mensagem" placeholder=" " required rows="4"></textarea>
                <span class="field__line" aria-hidden="true"></span>
                <label class="field__label" for="mensagem">Mensagem</label>
                <span class="field__error" role="alert" aria-live="polite"></span>
              </div>

              <div class="hp" aria-hidden="true">
                <label for="website">Não preencha este campo</label>
                <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
              </div>

              <label class="consent">
                <input type="checkbox" name="consent" value="1">
                <span>Autorizo o contato e o tratamento dos meus dados para essa
                finalidade, nos termos da
                <a href="politica-de-privacidade.html">Política de Privacidade</a>.</span>
              </label>
            </div>

            <div class="contato__submit">
              <button class="btn" type="submit" data-magnetic>
                <span class="btn__label">Enviar</span>
              </button>
              <p class="form-status" role="status" aria-live="polite"></p>
            </div>
          </form>
        </div>'''


def build_contato():
    body = f'''  <section class="section contato is-light" style="padding-top:calc(var(--header-h) + var(--s-7))">
    <div class="wrap">
      <p class="label" data-reveal="rise">Contato</p>
      <h1 class="display contato__title r-mask" data-reveal="mask">Fale com o escritório</h1>
      <p class="lead contato__intro" data-reveal="rise">
        Escolha o canal que preferir. Se for mais fácil escrever, use o formulário abaixo.
      </p>

{canais_diretos()}

      <div class="grid">
{CONTATO_FORM}

        <aside class="contato__aside" data-reveal="rise-group">
          <div class="contato__info r-rise">
            <p class="label label--mute">Escritório</p>
            <address>{ENDERECO}<br>{CIDADE}</address>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Direto</p>
            <a class="link" href="tel:{TEL_HREF}">{TEL}</a><br>
            <a class="link" href="mailto:{EMAIL}">{EMAIL}</a>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Inscrição</p>
            <p>{OAB}</p>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Atendimento</p>
            <p>Segunda a sexta, das 9h às 18h</p>
          </div>
        </aside>
      </div>
    </div>
  </section>'''

    return Page("contato.html", "Contato — FHL Advocacia",
                "Descreva sua situação. Respondemos em até um dia útil.", body)


def build_privacidade():
    body = page_head("Jurídico", "Política de Privacidade") + f'''

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:3 / span 8">
        <div class="prose" data-reveal="rise-group">
          <p class="r-rise"><strong>Última atualização:</strong> setembro de 2026.
          <!-- [CONFIRMAR] Este texto é um esqueleto conforme a Lei 13.709/2018 e
               PRECISA ser revisado pelo próprio escritório antes do lançamento
               (pendência 6 da preparação). --></p>

          <h2>1. Quem trata os seus dados</h2>
          <p>{RAZAO}, inscrita no CNPJ sob o nº 00.000.000/0001-00,
          com endereço em {ENDERECO}, {CIDADE}, é a controladora dos dados
          pessoais coletados neste site.</p>

          <h2>2. Quais dados coletamos</h2>
          <ul>
            <li>Os dados que você informa no formulário de contato: nome, e-mail,
            telefone, empresa e o conteúdo da mensagem.</li>
            <li>Dados de navegação anonimizados, apenas se você aceitar os cookies
            de medição.</li>
          </ul>

          <h2>3. Para que usamos</h2>
          <p>Exclusivamente para responder ao seu contato e, se for o caso, avaliar
          a viabilidade de uma atuação profissional. Não usamos os seus dados para
          publicidade e não os vendemos.</p>

          <h2>4. Base legal</h2>
          <p>O tratamento se apoia no seu consentimento (art. 7º, I da LGPD), colhido
          no próprio formulário, e no legítimo interesse de responder a uma solicitação
          que partiu de você.</p>

          <h2>5. Por quanto tempo guardamos</h2>
          <p>As mensagens recebidas pelo formulário são mantidas por 24 meses
          <!-- [CONFIRMAR] prazo, pendência 14 --> e depois eliminadas, salvo quando a
          guarda for necessária para cumprimento de obrigação legal ou para o exercício
          regular de direitos.</p>

          <h2>6. Com quem compartilhamos</h2>
          <p>Com o provedor de hospedagem e com o serviço de envio de e-mail, apenas
          na medida necessária para operar o site. Não há transferência para
          finalidades comerciais.</p>

          <h2>7. Seus direitos</h2>
          <p>Nos termos do art. 18 da LGPD, você pode solicitar confirmação da
          existência de tratamento, acesso, correção, anonimização, portabilidade,
          eliminação e revogação do consentimento. Basta escrever para
          <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>

          <h2>8. Cookies</h2>
          <p>Nenhum cookie de medição é ativado antes da sua escolha no banner. Você
          pode recusar sem qualquer prejuízo à navegação. As fontes do site são
          servidas pelo nosso próprio domínio, de modo que a sua navegação não é
          compartilhada com provedores externos de tipografia.</p>

          <h2>9. Encarregado (DPO)</h2>
          <p>Contato do encarregado pelo tratamento de dados:
          <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
        </div>
      </div>
    </div>
  </section>'''

    return Page("politica-de-privacidade.html",
                "Política de Privacidade — FHL Advocacia",
                "Como a FHL Advocacia trata os dados pessoais coletados no site, nos termos da LGPD.",
                body)


def build_termos():
    body = page_head("Jurídico", "Termos de Uso") + f'''

  <section class="section">
    <div class="wrap grid">
      <div style="grid-column:3 / span 8">
        <div class="prose" data-reveal="rise-group">
          <h2 class="r-rise">1. Finalidade do site</h2>
          <p>Este site tem caráter meramente informativo sobre a atuação de
          {RAZAO}, em conformidade com o Provimento nº 205/2021 do
          Conselho Federal da OAB.</p>

          <h2>2. O conteúdo não é consulta jurídica</h2>
          <p>Os artigos e textos publicados aqui têm finalidade informativa e
          educativa. Não constituem parecer, opinião legal ou consulta, e não criam
          relação advogado-cliente. Cada caso depende de análise específica.</p>

          <h2>3. Ausência de promessa de resultado</h2>
          <p>Em nenhuma hipótese este site veicula promessa de resultado, menção a
          casos concretos para oferta de atuação, ou informação sobre honorários,
          em observância aos arts. 3º, 4º e 6º do Provimento nº 205/2021.</p>

          <h2>4. Contato pelo formulário</h2>
          <p>O envio de mensagem pelo formulário não estabelece, por si só, relação
          profissional. A atuação só se inicia após aceitação expressa do escritório
          e formalização entre as partes.</p>

          <h2>5. Propriedade intelectual</h2>
          <p>Os textos, a identidade visual e o código deste site pertencem ao
          escritório e não podem ser reproduzidos sem autorização.</p>

          <h2>6. Alterações</h2>
          <p>Estes termos podem ser atualizados a qualquer momento. A versão vigente
          é sempre a publicada nesta página.</p>
        </div>
      </div>
    </div>
  </section>'''

    return Page("termos-de-uso.html", "Termos de Uso — FHL Advocacia",
                "Condições de uso do site da FHL Advocacia.", body)


def build_404():
    body = f'''  <section class="notfound">
    <div class="wrap" style="width:100%">
      <p class="label" data-reveal="rise">Erro 404</p>
      <h1 class="display r-mask" data-reveal="mask" style="margin-block:var(--s-3) var(--s-4)">Página não encontrada</h1>
      <p class="lead" data-reveal="rise" style="margin-inline:auto">
        O endereço que você acessou não existe mais.
      </p>
      <div style="margin-top:var(--s-5)">{arrow_link("index.html", "Voltar ao início")}</div>
    </div>
  </section>'''

    return Page("404.html", "Página não encontrada — FHL Advocacia",
                "O endereço que você acessou não existe mais.", body)



# ---------------------------------------------------------------------------
# HOME
# Única página com o herói WebGL. Passou a ser gerada aqui junto com as demais
# para não divergir do shell (marca, header, rodapé) a cada alteração.
# ---------------------------------------------------------------------------
def build_home():
    itens = "\n".join(f'''              <li><a class="atuacao__item{" is-active" if i == 0 else ""}" href="atuacao/{a["slug"]}.html">
                <span class="atuacao__num">{a["num"]}</span>
                <span class="atuacao__name">{a["nome"]}</span>
              </a></li>''' for i, a in enumerate(AREAS))

    paineis = "\n".join(f'''            <article class="atuacao__panel{" is-active" if i == 0 else ""}">
              <h3 class="h2 atuacao__panel-title">{a["nome"]}</h3>
              <p class="lead atuacao__panel-text">{a["resumo"]}</p>
              {arrow_link("atuacao/" + a["slug"] + ".html", "Ver área")}
            </article>''' for i, a in enumerate(AREAS))

    equipe = "\n".join(f'''        <a class="equipe__card r-wipe" href="equipe.html">
          <div class="equipe__media">
            <img class="equipe__avatar" src="assets/img/avatar.svg" alt="" width="400" height="500">
          </div>
          <h3 class="h3 equipe__name">{m["nome"]}</h3>
          <p class="equipe__oab">{m["oab"]}</p>
          <hr class="equipe__rule">
          <p class="equipe__block-text">{m["atuacao"]}</p>
        </a>''' for m in EQUIPE)

    posts = "\n".join(f'''        <a class="post" href="publicacoes/{po["slug"]}.html" data-thumb="{po["thumb"]}">
          <span class="post__date">{po["data"]}</span>
          <span class="post__title">{po["titulo"]}</span>
          <span class="post__area">{po["area"]}</span>
        </a>''' for po in POSTS)

    body = f'''
  <!-- HERÓI -->
  <section class="hero" data-reveal-hold>
    <canvas class="hero__canvas" aria-hidden="true"></canvas>
    <img class="hero__fallback" src="assets/img/hero-fallback.jpg" alt="" aria-hidden="true" fetchpriority="high">
    <div class="hero__vignette"></div>

    <div class="wrap hero__inner">
      <p class="label hero__label">{RAZAO}</p>
      <h1 class="display hero__title r-mask">Advocacia estratégica, técnica e comprometida com cada detalhe</h1>
      <div class="hero__cta">
        <a class="btn" href="contato.html" data-magnetic><span class="btn__label">Fale com o escritório</span></a>
        <a class="link-arrow" href="atuacao.html">Ver áreas de atuação {ARROW}</a>
      </div>
    </div>

    <div class="hero__foot wrap">
      <div class="hero__social">
        <a class="link" href="tel:{TEL_HREF}">{TEL}</a>
        <a class="link" href="https://wa.me/{WHATS}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
      <div class="hero__scroll"><span>Role</span><i aria-hidden="true"></i></div>
    </div>
  </section>

  <!-- MANIFESTO -->
  <section class="section manifesto">
    <img class="watermark watermark--left" src="assets/img/logo-watermark.png" alt="" aria-hidden="true">

    <div class="wrap manifesto__inner">
      <p class="label" data-reveal="rise">O Escritório</p>

      <h2 class="display manifesto__title r-mask" data-reveal="mask">
        Escuta qualificada, análise criteriosa, condução responsável
      </h2>

      <div class="grid">
        <div class="manifesto__aside" data-reveal="rise-group">
          <p class="lead r-rise">
            A FHL Advocacia atua na defesa de interesses de pessoas físicas e jurídicas,
            com abordagem técnica, estratégica e personalizada. O escritório preza pela
            escuta qualificada, análise criteriosa de documentos, avaliação de riscos e
            condução responsável de cada caso.
          </p>
          {arrow_link("escritorio.html", "Conheça o escritório", cls="link-arrow r-rise")}
        </div>
      </div>
    </div>
  </section>

  <!-- ATUAÇÃO — pin de 300vh -->
  <section class="atuacao">
    <div class="atuacao__sticky">
      <div class="wrap" style="width:100%">
        <div class="atuacao__head">
          <p class="label" data-reveal="rise">Atuação</p>
        </div>

        <div class="grid">
          <div class="atuacao__index">
            <ul class="atuacao__list">
{itens}
            </ul>
            <div class="atuacao__progress" aria-hidden="true"><i></i></div>
          </div>

          <div class="atuacao__panels">
{paineis}
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- MÉTODO -->
  <section class="section metodo is-light">
    <div class="wrap">
      <div class="metodo__head">
        <p class="label" data-reveal="rise">Método</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Como trabalhamos</h2>
      </div>

      <div class="metodo__steps">
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">01</div>
          <h3 class="h3 metodo__title">Escuta</h3>
          <p class="metodo__text">Entender a situação antes de opinar sobre ela. O que
          aconteceu, quando, e o que já foi tentado.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">02</div>
          <h3 class="h3 metodo__title">Documentos</h3>
          <p class="metodo__text">Análise criteriosa do que já existe. Contrato, holerite,
          extrato, protocolo do INSS — a prova costuma estar aí.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">03</div>
          <h3 class="h3 metodo__title">Riscos</h3>
          <p class="metodo__text">O que dá para buscar, em quanto tempo e a que custo.
          Dito com clareza no começo, não descoberto no meio.</p>
        </div>
        <div class="metodo__step r-rise">
          <div class="metodo__num numeral">04</div>
          <h3 class="h3 metodo__title">Condução</h3>
          <p class="metodo__text">Acompanhamento do caso do protocolo ao desfecho, com
          quem assinou a peça respondendo por ela.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- NÚMEROS INSTITUCIONAIS
       Conformidade OAB — Provimento 205/2021, Art. 4, §2: nenhum destes valores
       se refere a resultado obtido em processo. NÃO adicionar "% de êxito",
       "causas ganhas" ou "valores recuperados". -->
  <section class="section section--fn numeros is-light section--flush-top">
    <div class="wrap">
      <div class="numeros__grid">
        <div><div class="numeros__value numeral" data-count="10">0</div>
          <div class="numeros__label">Anos de<br>atuação</div></div>
        <div><div class="numeros__value numeral" data-count="4">0</div>
          <div class="numeros__label">Áreas de<br>atuação</div></div>
        <div><div class="numeros__value numeral" data-count="4">0</div>
          <div class="numeros__label">Advogados<br>na equipe</div></div>
        <div><div class="numeros__value numeral" data-count="1">0</div>
          <div class="numeros__label">Escritório em<br>Paranaguá</div></div>
      </div>
      <p class="numeros__note">
        Atendimento a pessoas físicas e jurídicas em Paranaguá e região.
        <!-- [CONFIRMAR] anos de atuação -->
      </p>
    </div>
  </section>

  <!-- LINGUAGEM -->
  <section class="linguagem">
    <div class="linguagem__sticky">
      <div class="wrap linguagem__inner">
        <img class="watermark watermark--right" src="assets/img/logo-watermark.png" alt="" aria-hidden="true">

        <div class="grid">
          <div style="grid-column:1 / span 5">
            <p class="label" data-reveal="rise">Linguagem</p>
            <h2 class="display linguagem__title r-mask" data-reveal="mask">
              Documento que o cliente não entende é risco, não é proteção
            </h2>
          </div>

          <div class="linguagem__doc">
            <span class="linguagem__doc-label">Cláusula 4.1 — Entrega</span>

            <p><span class="term" data-term><span
                  class="term__old">O outorgante<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">Quem vende</span><i class="term__underline" aria-hidden="true"></i></span> <span class="term" data-term><span
                  class="term__old">obriga-se a<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">tem que</span><i class="term__underline" aria-hidden="true"></i></span> entregar o bem <span class="term" data-term><span
                  class="term__old">no prazo avençado<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">no prazo combinado</span><i class="term__underline" aria-hidden="true"></i></span>, <span class="term" data-term><span
                  class="term__old">sob pena de<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">ou paga</span><i class="term__underline" aria-hidden="true"></i></span> <span class="term" data-term><span
                  class="term__old">multa cominatória<i class="term__strike" aria-hidden="true"></i></span><span
                  class="term__new">multa por atraso</span><i class="term__underline" aria-hidden="true"></i></span>.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="wrap linguagem__coda">
      <p class="lead" data-reveal="rise">
        Escrever difícil é fácil. O trabalho está em produzir um documento que
        resista a um tribunal e ainda assim possa ser lido por quem vai assiná-lo.
      </p>
    </div>
  </section>

  <!-- QUEM SOMOS -->
  <section class="section equipe" id="quem-somos">
    <div class="wrap">
      <div class="equipe__head">
        <p class="label" data-reveal="rise">Quem somos</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Quem assina cada caso</h2>
        <p class="lead" data-reveal="rise" style="margin-top:var(--s-3)">
          FHL são as iniciais dos sobrenomes dos sócios: Fonseca, Hespanha e Lisboa.
        </p>
      </div>

      <!-- Silhueta 2D até o ensaio fotográfico existir. O Art. 5 do Provimento
           205/2021 autoriza expressamente fotos dos advogados. -->
      <div class="equipe__grid" data-reveal="wipe-group">
{equipe}
      </div>

      <div style="margin-top:var(--s-5)">
        {arrow_link("equipe.html", "Ver perfis completos")}
      </div>
    </div>
  </section>

  <!-- PUBLICAÇÕES -->
  <section class="section publicacoes">
    <div class="wrap">
      <div class="publicacoes__head">
        <p class="label" data-reveal="rise">Publicações</p>
        <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">O que estamos escrevendo</h2>
      </div>

      <div>
{posts}
      </div>

      <div style="margin-top:var(--s-5)">
        {arrow_link("publicacoes.html", "Todas as publicações")}
      </div>
    </div>
  </section>

  <!-- LOCALIZAÇÃO
       O mapa NÃO carrega sozinho: um iframe do Google enviaria o IP e o
       user-agent do visitante para os servidores deles antes de qualquer
       consentimento, o que contradiria o próprio banner de cookies do site.
       Carrega sob clique — e há sempre o link direto como alternativa. -->
  <section class="section local" id="localizacao">
    <div class="wrap">
      <p class="label" data-reveal="rise">Localização</p>
      <h2 class="h1 r-mask" data-reveal="mask" style="margin-top:var(--s-3)">Onde estamos</h2>

      <div class="local__grid">
        <div class="local__info" data-reveal="rise-group">
          <div class="local__row r-rise">
            <p class="label label--mute">Endereço</p>
            <address class="local__value">{ENDERECO}<br>{CIDADE}</address>
          </div>
          <div class="local__row r-rise">
            <p class="label label--mute">Atendimento</p>
            <p class="local__value">Segunda a sexta, das 9h às 18h</p>
          </div>
          <div class="local__row r-rise">
            <p class="label label--mute">Telefone</p>
            <p class="local__value"><a class="link" href="tel:{TEL_HREF}">{TEL}</a></p>
          </div>
          <div class="local__row r-rise">
            <a class="btn" href="{MAPS}" target="_blank" rel="noopener noreferrer">
              <span class="btn__label">Abrir no Google Maps</span>
            </a>
          </div>
        </div>

        <div class="local__map" data-map data-map-src="{MAPS_EMBED}">
          <div class="local__map-ph">
            <svg class="local__pin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>
            </svg>
            <p class="local__map-addr">{ENDERECO}<br>{CIDADE}</p>
            <button class="btn" type="button" data-map-load>
              <span class="btn__label">Carregar mapa</span>
            </button>
            <p class="local__map-note">
              O mapa é servido pelo Google. Ao carregar, seus dados de navegação
              são enviados a eles.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CONTATO -->
  <section class="section contato is-light" id="contato">
    <div class="wrap">
      <p class="label" data-reveal="rise">Contato</p>
      <h2 class="display contato__title r-mask" data-reveal="mask">Fale com o escritório</h2>
      <p class="lead contato__intro" data-reveal="rise">
        Escolha o canal que preferir. Se for mais fácil escrever, use o formulário abaixo.
      </p>

{canais_diretos()}

      <div class="grid">
{CONTATO_FORM}

        <aside class="contato__aside" data-reveal="rise-group">
          <div class="contato__info r-rise">
            <p class="label label--mute">Escritório</p>
            <address>{ENDERECO}<br>{CIDADE}</address>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Atendimento</p>
            <p>Segunda a sexta, das 9h às 18h</p>
          </div>
          <div class="contato__info r-rise">
            <p class="label label--mute">Inscrição</p>
            <p>{OAB}</p>
          </div>
        </aside>
      </div>
    </div>
  </section>
'''

    return Page("index.html",
                "FHL Advocacia — Fonseca Hespanha Lisboa | Paranaguá — PR",
                "Advocacia estratégica e institucional em Paranaguá. Direito Trabalhista, "
                "Previdenciário, do Consumidor e Cível.",
                body, home=True)


# ---------------------------------------------------------------------------
def main():
    pages = [
        build_home(),
        build_escritorio(),
        build_atuacao_index(),
        build_equipe(),
        build_publicacoes_index(),
        build_contato(),
        build_privacidade(),
        build_termos(),
        build_404(),
    ]
    pages += [build_area(a) for a in AREAS]
    pages += [build_post(p) for p in POSTS]

    gerados = set()
    for pg in pages:
        full = os.path.join(ROOT, pg.path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8", newline="\n") as f:
            f.write(shell(pg))
        gerados.add(os.path.normpath(full))
        print(f"  {pg.path}")

    # Limpa páginas órfãs. Quando um slug muda — as áreas trocaram de
    # "contratos-empresariais" para "trabalhista" — o arquivo antigo ficava no
    # disco carregando a marca anterior, sem nada apontando para ele.
    for pasta in ("atuacao", "publicacoes"):
        d = os.path.join(ROOT, pasta)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            p = os.path.normpath(os.path.join(d, fn))
            if fn.endswith(".html") and p not in gerados:
                os.remove(p)
                print(f"  removido (órfão): {pasta}/{fn}")

    # sitemap.xml (Preparação 15)
    urls = [p.path for p in pages if p.path != "404.html"]
    entries = "\n".join(
        f"  <url><loc>https://fhladvocacia.com.br/{u}</loc></url>" for u in urls)
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                f'{entries}\n</urlset>\n')

    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nAllow: /\n\n"
                "Sitemap: https://fhladvocacia.com.br/sitemap.xml\n")

    print(f"\n{len(pages)} páginas + sitemap.xml + robots.txt")
    print("index.html agora também sai daqui, com o mesmo shell das demais.")


if __name__ == "__main__":
    main()
