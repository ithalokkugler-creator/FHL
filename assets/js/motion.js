/* ==========================================================================
   FHL ADVOCACIA — MOTION
   Preparação 7.1 e 7.2.

   Este arquivo é a única fonte de durações, easings e revelações do site.
   NENHUM outro arquivo escreve gsap.to() com valores literais de duração
   ou easing — todos importam daqui. É o que impede o site de virar uma
   colcha de retalhos de timings aleatórios durante o build.
   ========================================================================== */

window.IED = window.IED || {};

(function (IED) {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  /* ---------------------------------------------------------------------
     CURVAS — nomeadas por intenção, não por fórmula (7.2)
     --------------------------------------------------------------------- */
  var EASE = {
    entrada:  'expo.out',              // algo chega e assenta — gesto dominante
    saida:    'power2.in',             // algo sai de cena
    suave:    'power3.out',            // transições de estado, hover
    cortina:  'expo.inOut',            // painéis de menu e de página
    elastico: 'elastic.out(1, 0.5)'    // apenas o retorno do botão magnético
  };

  var DUR = {
    micro:   0.32,   // hover, focus              0,25–0,4s
    reveal:  0.85,   // revelação de conteúdo     0,7–0,95s
    mask:    0.95,
    curtain: 1.0     // cortina de menu/página    0,9–1,2s
  };

  /* Disparo padrão: nada re-anima ao subir — reanimação constante irrita. */
  var START = 'top 78%';
  var STAGGER_MAX = 0.12;   // acima disto a página parece lenta

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------------
     SPLITTER
     Quebra um título em palavras mascaradas. O elemento pai recebe
     aria-label com a frase completa: leitores de tela não devem ler
     palavra a palavra (Preparação 12).
     --------------------------------------------------------------------- */
  function splitWords(el) {
    var source = el.dataset.text;
    if (!source) {
      source = el.textContent.replace(/\s+/g, ' ').trim();
      el.dataset.text = source;
    }

    el.setAttribute('aria-label', source);
    el.textContent = '';

    var words = source.split(' ');
    var inners = [];

    words.forEach(function (word, i) {
      var mask = document.createElement('span');
      mask.className = 'word-mask';
      mask.setAttribute('aria-hidden', 'true');

      var inner = document.createElement('span');
      inner.className = 'word-inner';
      inner.textContent = word;

      mask.appendChild(inner);
      el.appendChild(mask);
      inners.push(inner);

      // espaço real entre palavras quando elas correm inline
      if (i < words.length - 1) {
        el.appendChild(document.createTextNode(' '));
      }
    });

    el.style.visibility = 'visible';
    return inners;
  }

  /* ---------------------------------------------------------------------
     OS QUATRO GESTOS (7.1)
     Cada um tem um tipo de conteúdo atribuído. Não há um quinto.
     --------------------------------------------------------------------- */

  /* Terminada a revelação, o recorte da máscara não tem mais função e só cria
     risco de decepar texto (palavra longa em tela estreita) ou diacrítico. */
  function markRevealed(el) {
    el.querySelectorAll('.word-mask').forEach(function (m) {
      m.classList.add('is-revealed');
    });
  }

  /* 1 · reveal-mask — EXCLUSIVO dos títulos display. É a assinatura do site. */
  function revealMask(el, opts) {
    opts = opts || {};
    var inners = splitWords(el);

    return gsap.fromTo(inners,
      { yPercent: 110 },
      {
        yPercent: 0,
        duration: DUR.mask,
        ease: EASE.entrada,
        stagger: Math.min(opts.stagger || 0.075, STAGGER_MAX),
        delay: opts.delay || 0,
        paused: !!opts.paused,
        onComplete: function () { markRevealed(el); },
        scrollTrigger: opts.trigger === false ? null : {
          trigger: opts.triggerEl || el,
          start: opts.start || START,
          once: true
        }
      }
    );
  }

  /* 2 · reveal-rise — parágrafos, itens de lista, cards */
  function revealRise(targets, opts) {
    opts = opts || {};
    return gsap.to(targets, {
      y: 0,
      opacity: 1,
      duration: DUR.reveal,
      ease: EASE.suave,
      stagger: Math.min(opts.stagger || 0.1, STAGGER_MAX),
      delay: opts.delay || 0,
      clearProps: 'willChange',
      scrollTrigger: opts.trigger === false ? null : {
        trigger: opts.triggerEl || targets,
        start: opts.start || START,
        once: true
      }
    });
  }

  /* 3 · reveal-wipe — imagens, retratos, blocos de mídia */
  function revealWipe(targets, opts) {
    opts = opts || {};
    return gsap.to(targets, {
      clipPath: 'inset(0 0 0% 0)',
      duration: DUR.reveal,
      ease: EASE.entrada,
      stagger: Math.min(opts.stagger || 0.09, STAGGER_MAX),
      delay: opts.delay || 0,
      clearProps: 'willChange',
      scrollTrigger: opts.trigger === false ? null : {
        trigger: opts.triggerEl || targets,
        start: opts.start || START,
        once: true
      }
    });
  }

  /* 4 · reveal-rule — filetes, sublinhados, barras */
  function revealRule(targets, opts) {
    opts = opts || {};
    return gsap.to(targets, {
      scaleX: 1,
      duration: 0.6,
      ease: 'power2.inOut',
      stagger: Math.min(opts.stagger || 0.08, STAGGER_MAX),
      delay: opts.delay || 0,
      clearProps: 'willChange',
      scrollTrigger: opts.trigger === false ? null : {
        trigger: opts.triggerEl || targets,
        start: opts.start || START,
        once: true
      }
    });
  }

  /* ---------------------------------------------------------------------
     AUTO-REGISTRO
     Varre o documento por [data-reveal] e aplica o gesto correspondente.
     Elementos dentro de um contêiner com [data-reveal-hold] são ignorados
     aqui — quem os anima é um timeline específico (herói, loader).
     --------------------------------------------------------------------- */
  function autoRegister(root) {
    if (reduced) return;   // CSS já devolveu tudo ao estado final
    root = root || document;

    root.querySelectorAll('[data-reveal]').forEach(function (el) {
      if (el.closest('[data-reveal-hold]')) return;
      if (el.dataset.revealDone) return;
      el.dataset.revealDone = '1';

      var kind = el.dataset.reveal;
      var stagger = parseFloat(el.dataset.stagger) || undefined;

      if (kind === 'mask') {
        revealMask(el, { stagger: stagger });
      } else if (kind === 'rise') {
        revealRise(el, { stagger: stagger });
      } else if (kind === 'rise-group') {
        var kids = el.querySelectorAll('.r-rise');
        if (kids.length) revealRise(kids, { stagger: stagger, triggerEl: el });
      } else if (kind === 'wipe') {
        revealWipe(el, { stagger: stagger });
      } else if (kind === 'wipe-group') {
        var wkids = el.querySelectorAll('.r-wipe');
        if (wkids.length) revealWipe(wkids, { stagger: stagger, triggerEl: el });
      } else if (kind === 'rule') {
        revealRule(el, { stagger: stagger });
      }
    });
  }

  /* ---------------------------------------------------------------------
     SMOOTH SCROLL — Lenis + ScrollTrigger
     Desligado sob movimento reduzido: scroll nativo (Preparação 12).
     --------------------------------------------------------------------- */
  var lenis = null;

  function initScroll() {
    if (reduced || !window.Lenis) return null;

    lenis = new window.Lenis({
      duration: 1.1,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      touchMultiplier: 1.6
    });

    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    return lenis;
  }

  /* ---------------------------------------------------------------------
     RESIZE — refresh do ScrollTrigger com debounce de 200ms (Preparação 11.10)
     --------------------------------------------------------------------- */
  function initResize() {
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { ScrollTrigger.refresh(); }, 200);
    });
  }

  IED.motion = {
    EASE: EASE,
    DUR: DUR,
    START: START,
    reduced: reduced,
    splitWords: splitWords,
    markRevealed: markRevealed,
    revealMask: revealMask,
    revealRise: revealRise,
    revealWipe: revealWipe,
    revealRule: revealRule,
    autoRegister: autoRegister,
    initScroll: initScroll,
    initResize: initResize,
    lenis: function () { return lenis; }
  };
})(window.IED);
