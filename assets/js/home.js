/* ==========================================================================
   FHL ADVOCACIA — HOME
   A narrativa do scroll. Preparação, seção 6.
   Todas as durações e easings vêm de motion.js — nada literal aqui.
   ========================================================================== */

window.IED = window.IED || {};

(function (IED) {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var M = IED.motion;
  var EASE = M.EASE;
  var DUR = M.DUR;

  var heroScene = null;

  /* =====================================================================
     6.1 HERÓI
     ===================================================================== */
  function hero() {
    var sec = document.querySelector('.hero');
    if (!sec) return;

    var label = sec.querySelector('.hero__label');
    var title = sec.querySelector('.hero__title');
    var foot = sec.querySelectorAll('.hero__foot > *');

    /* --- cena WebGL ---
       Só entra depois do window.load: nunca bloqueia o LCP (11.1 e 8.3), e
       garante que innerWidth/clientWidth já refletem o layout final — as
       guardas de shouldRun() dependem disso para decidir corretamente. */
    var canvas = sec.querySelector('.hero__canvas');
    var fallback = sec.querySelector('.hero__fallback');

    function startGL() {
      if (!canvas || !IED.heroGL || heroScene) return;
      if (!canvas.clientWidth || !canvas.clientHeight) return;

      heroScene = IED.heroGL.init(canvas);

      // o canvas assumiu: some com a imagem estática
      if (heroScene && fallback) {
        gsap.to(fallback, { opacity: 0, duration: 0.8, delay: 0.2 });
      }
    }

    if (document.readyState === 'complete') {
      requestAnimationFrame(startGL);
    } else {
      window.addEventListener('load', function () {
        requestAnimationFrame(startGL);
      });
    }

    /* --- entrada --- */
    if (!M.reduced) {
      var inners = M.splitWords(title);

      gsap.timeline()
        .fromTo(label, { y: 12, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' })
        .fromTo(inners, { yPercent: 110 },
          { yPercent: 0, duration: DUR.mask, ease: EASE.entrada, stagger: 0.075,
            onComplete: function () { M.markRevealed(title); } }, '-=0.35')
        .fromTo(foot, { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, ease: EASE.suave, stagger: 0.05 }, '-=0.5');
    }

    if (M.reduced) return;

    /* --- ao rolar --- */
    var scroll = sec.querySelector('.hero__scroll');

    ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: function (self) {
        var p = self.progress;

        /* O ASSENTAMENTO (8.2): uSettle de 1.0 → 0.12.
           A superfície começa agitada e se aquieta. O ruído vira acordo. */
        if (heroScene) heroScene.setSettle(1 - p * 0.88);
      }
    });

    // o título sobe mais rápido que o fundo (parallax)
    gsap.to(title, {
      yPercent: window.innerWidth < 768 ? -12 : -30,
      opacity: 0.15,
      ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true }
    });

    // "ROLE" some nos primeiros 5% do scroll
    if (scroll) {
      gsap.to(scroll, {
        opacity: 0, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: '5% top', scrub: true }
      });
    }
  }

  /* =====================================================================
     4.4 MARCA D'ÁGUA — parallax do ampersand
     ===================================================================== */
  function watermarks() {
    if (M.reduced) return;

    document.querySelectorAll('.watermark').forEach(function (w) {
      var amount = window.innerWidth < 768 ? -5 : -12;   // 40% em mobile (13)
      gsap.to(w, {
        yPercent: amount,
        ease: 'none',
        scrollTrigger: {
          trigger: w.closest('section') || w.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });
  }

  /* =====================================================================
     6.3 ATUAÇÃO — pin de 300vh
     ===================================================================== */
  function atuacao() {
    var sec = document.querySelector('.atuacao');
    if (!sec) return;

    var items = sec.querySelectorAll('.atuacao__item');
    var panels = sec.querySelectorAll('.atuacao__panel');
    var bar = sec.querySelector('.atuacao__progress i');
    if (!items.length) return;

    function activate(i) {
      items.forEach(function (el, n) { el.classList.toggle('is-active', n === i); });
      panels.forEach(function (el, n) { el.classList.toggle('is-active', n === i); });
    }

    activate(0);

    var mm = gsap.matchMedia();

    /* Pin só em desktop. Em mobile vira pilha vertical — pin com scrub é
       caro e briga com a barra de URL que aparece/some (6.3). */
    mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', function () {
      var st = ScrollTrigger.create({
        trigger: sec,
        start: 'top top',
        end: '+=300%',
        pin: sec.querySelector('.atuacao__sticky'),
        scrub: 0.6,
        onUpdate: function (self) {
          var i = Math.min(items.length - 1,
                  Math.floor(self.progress * items.length));
          activate(i);
          if (bar) gsap.set(bar, { scaleX: self.progress });
        }
      });
      return function () { st.kill(); activate(0); };
    });

    // clique leva à página da área
    items.forEach(function (item, i) {
      item.addEventListener('mouseenter', function () {
        if (window.innerWidth > 900) return;
        activate(i);
      });
    });
  }

  /* =====================================================================
     6.5 NÚMEROS INSTITUCIONAIS
     Conformidade OAB: nenhum destes valores se refere a resultado
     obtido em processo (Provimento 205/2021, Art. 4, §2).
     ===================================================================== */
  function numeros() {
    var nodes = document.querySelectorAll('[data-count]');
    if (!nodes.length) return;

    var fmt = new Intl.NumberFormat('pt-BR');

    nodes.forEach(function (node) {
      var target = parseFloat(node.dataset.count);
      var suffix = node.dataset.suffix || '';

      if (M.reduced) { node.textContent = fmt.format(target) + suffix; return; }

      var obj = { v: 0 };
      node.textContent = '0' + suffix;

      gsap.to(obj, {
        v: target,
        duration: 1.6,
        ease: 'power2.out',
        onUpdate: function () {
          node.textContent = fmt.format(Math.round(obj.v)) + suffix;
        },
        scrollTrigger: { trigger: node, start: 'top 70%', once: true }
      });
    });
  }

  /* =====================================================================
     6.6 LINGUAGEM — o clímax
     Tradução ao vivo: juridiquês → português claro, dirigida pelo scrub.
     Reversível por natureza: rolar para cima desfaz as trocas.
     ===================================================================== */
  function linguagem() {
    var sec = document.querySelector('.linguagem');
    if (!sec || M.reduced) return;

    var terms = sec.querySelectorAll('[data-term]');
    var coda = sec.querySelector('.linguagem__coda');
    if (!terms.length) return;

    /* A caixa de cada termo começa na largura do texto antigo e termina na do
       novo (ver swap). Antes ela ficava fixa em max(antigo, novo) e o texto
       traduzido — o estado em que a seção passa a maior parte do tempo —
       saía cheio de buracos: "tem que      entregar", "ou paga       multa".
       São cinco caixas num parágrafo de duas linhas: o reflow é desprezível. */
    var mm = gsap.matchMedia();

    mm.add('(min-width: 901px)', function () {
      var tl = gsap.timeline({
        scrollTrigger: {
          trigger: sec,
          start: 'top top',
          end: '+=150%',
          pin: sec.querySelector('.linguagem__sticky'),
          scrub: 1,
          // as larguras são medidas de novo quando a fonte assenta
          invalidateOnRefresh: true
        }
      });

      buildSwaps(tl, terms, 0.18);

      // A conclusão entra depois da última troca, na mesma cena.
      if (coda) {
        tl.fromTo(coda, { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, ease: EASE.suave }, '+=0.05');
      }
    });

    /* Mobile: sem pin. A tradução roda inteira, com tempo próprio, quando o
       documento entra na tela. Eram só as três primeiras trocas: o parágrafo
       terminava metade em português claro, metade em juridiquês. */
    mm.add('(max-width: 900px)', function () {
      var tl = gsap.timeline({ paused: true });
      buildSwaps(tl, terms, 0.22);
      if (coda) {
        tl.fromTo(coda, { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: DUR.reveal, ease: EASE.suave }, '-=0.3');
      }

      ScrollTrigger.create({
        trigger: sec.querySelector('.linguagem__doc'),
        start: 'top 75%',
        once: true,
        onEnter: function () { tl.play(); }
      });
    });
  }

  function buildSwaps(tl, terms, spacing) {
    terms.forEach(function (t, i) { swap(tl, t, i * spacing); });
  }

  function swap(tl, term, at) {
    var oldEl = term.querySelector('.term__old');
    var newEl = term.querySelector('.term__new');
    var strike = term.querySelector('.term__strike');
    var under = term.querySelector('.term__underline');

    // 1 · o risco em menta varre o termo antigo
    tl.fromTo(strike, { scaleX: 0 },
      { scaleX: 1, duration: 0.35, ease: 'power2.inOut' }, at);

    // 2 · o antigo desfoca e sai
    tl.to(oldEl, { opacity: 0, filter: 'blur(3px)', duration: 0.25 }, at + 0.2);

    // 3 · a caixa acomoda o texto novo, e a frase se reorganiza em volta
    //     dele, como numa revisão de verdade. Valores em função: são medidos
    //     de novo a cada refresh (fonte carregada, janela redimensionada).
    tl.fromTo(term,
      { width: function () { return oldEl.offsetWidth; } },
      { width: function () { return newEl.offsetWidth; }, duration: 0.4, ease: 'power2.inOut' },
      at + 0.22);

    /* 4 · o novo entra com máscara de baixo.
       `y: 0` explícito é obrigatório: o CSS dá ao termo novo um
       transform: translateY(0.6em) como estado de repouso, e o GSAP lê isso
       como `y` em PIXELS. Sem zerar, o yPercent: 0 não desfaz nada e o texto
       traduzido assentava 9,6px abaixo da linha de base do texto estático. */
    tl.fromTo(newEl, { yPercent: 100, y: 0, opacity: 0 },
      { yPercent: 0, y: 0, opacity: 1, duration: 0.45, ease: EASE.entrada }, at + 0.28);

    // 5 · sublinhado pisca sob o termo novo e some
    if (under) {
      tl.fromTo(under, { scaleX: 0, opacity: 1 },
        { scaleX: 1, duration: 0.3, ease: 'power2.out' }, at + 0.34)
        .to(under, { opacity: 0, duration: 0.6 }, at + 0.66);
    }
  }

  /* =====================================================================
     6.8 PUBLICAÇÕES — miniatura que segue o cursor
     A interação de hover mais rica do site, concentrada aqui de propósito.
     ===================================================================== */
  function postThumb() {
    var thumb = document.querySelector('.post-thumb');
    var posts = document.querySelectorAll('.post');
    if (!thumb || !posts.length) return;

    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine || M.reduced) { thumb.remove(); return; }

    var art = thumb.querySelector('.post-thumb__art');
    var xTo = gsap.quickTo(thumb, 'x', { duration: 0.5, ease: EASE.suave });
    var yTo = gsap.quickTo(thumb, 'y', { duration: 0.5, ease: EASE.suave });
    var rTo = gsap.quickTo(thumb, 'rotation', { duration: 0.6, ease: EASE.suave });

    var lastX = 0;
    var visivel = false;
    var atual = null;

    function mostrar(post) {
      if (post !== atual) {
        atual = post;
        art.textContent = post.dataset.thumb || '§';
      }
      if (visivel) return;
      visivel = true;
      gsap.to(thumb, { opacity: 1, scale: 1, duration: 0.4, ease: EASE.suave, overwrite: 'auto' });
    }

    function esconder() {
      atual = null;
      if (!visivel) return;
      visivel = false;
      gsap.to(thumb, { opacity: 0, scale: 0.9, duration: 0.3, ease: EASE.suave, overwrite: 'auto' });
    }

    /* A miniatura ficava presa ao cursor depois de uma passada rápida pela
       lista. Dois motivos, os dois tratados aqui:
       1. Corrida de tweens. A entrada dura 0,4s e a saída 0,3s; sem
          `overwrite`, as duas rodavam juntas e, numa passada de menos de
          0,1s, a entrada terminava por último — opacidade 1 com `visivel` já
          em false, e nada mais a escondia. `overwrite: 'auto'` faz o tween
          novo cancelar o anterior.
       2. Estado guardado em evento. Em vez de confiar em mouseenter e
          mouseleave, cada movimento confere se há de fato uma publicação sob
          o cursor. */
    window.addEventListener('mousemove', function (e) {
      xTo(e.clientX + 28);
      yTo(e.clientY - 80);
      // rotação segue a velocidade do mouse, no máximo 6° (6.8)
      var vx = e.clientX - lastX;
      lastX = e.clientX;
      rTo(Math.max(-6, Math.min(6, vx * 0.35)));

      var post = e.target.closest ? e.target.closest('.post') : null;
      if (post) mostrar(post);
      else esconder();
    }, { passive: true });

    /* Rolar com o ponteiro parado sobre um artigo tira o elemento de baixo do
       cursor sem nenhum mousemove. Scroll, saída da janela e perda de foco
       dispensam a miniatura. */
    window.addEventListener('scroll', esconder, { passive: true });
    document.addEventListener('mouseleave', esconder);
    window.addEventListener('blur', esconder);

    gsap.set(thumb, { scale: 0.9, transformOrigin: '50% 50%' });
  }

  /* =====================================================================
     MÉTODO — revelação linha a linha
     ===================================================================== */
  function metodo() {
    var steps = document.querySelectorAll('.metodo__step');
    if (!steps.length || M.reduced) return;

    M.revealRise(steps, {
      stagger: 0.12,
      triggerEl: document.querySelector('.metodo__steps')
    });
  }

  function init() {
    hero();
    watermarks();
    atuacao();
    metodo();
    numeros();
    linguagem();
    postThumb();

    // as posições finais só são confiáveis depois das fontes assentarem
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  IED.home = { init: init };
})(window.IED);
