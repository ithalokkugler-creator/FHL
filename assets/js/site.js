/* ==========================================================================
   FHL ADVOCACIA — SITE
   Componentes globais: loader, header, cortina de menu, botão
   magnético, transição de página, formulário e banner de cookies.
   Preparação, seções 6.0, 7.3, 7.4, 7.5 e 14.
   ========================================================================== */

window.IED = window.IED || {};

(function (IED) {
  'use strict';

  var gsap = window.gsap;
  var M = IED.motion;
  var EASE = M.EASE;
  var DUR = M.DUR;
  var reduced = M.reduced;

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* =====================================================================
     LOADER (6.0)
     A assinatura da FHL se monta: o F e o HL são desenhados a traço e
     preenchidos, o filete cresce do centro e os três nomes saem de trás
     dele. Depois os painéis se separam. ~2,6s, só na 1ª visita da sessão;
     com movimento reduzido nem aparece.
     ===================================================================== */
  function initLoader(done) {
    var el = document.querySelector('.loader');

    if (!el) { done(); return; }

    var seen = false;
    try { seen = sessionStorage.getItem('ied:loaded') === '1'; } catch (e) {}

    if (seen || reduced) {
      el.remove();
      done();
      return;
    }

    document.body.classList.add('is-locked');

    var marca = el.querySelector('.loader__marca');
    var letras = el.querySelectorAll('.loader__letra');
    var filete = el.querySelector('.loader__filete');
    var nomes = el.querySelectorAll('.loader__nome');
    var panels = el.querySelectorAll('.loader__panel');
    var inner = el.querySelector('.loader__inner');

    /* Traço do tamanho exato do contorno: começa todo recolhido e é
       "desenhado" levando o deslocamento a zero. */
    letras.forEach(function (p) {
      var len = Math.ceil(p.getTotalLength());
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0, strokeOpacity: 1 });
    });
    gsap.set(filete, { scaleY: 0, transformOrigin: '50% 50%' });
    /* Cada nome começa inteiro à esquerda do filete — escondido pelo recorte
       do SVG — e anda a própria largura até o lugar. */
    gsap.set(nomes, {
      x: function (i, n) { var b = n.getBBox(); return 505 - (b.x + b.width); },
    });
    gsap.set(marca, { visibility: 'visible' });

    var tl = gsap.timeline({
      onComplete: function () {
        try { sessionStorage.setItem('ied:loaded', '1'); } catch (e) {}
        document.body.classList.remove('is-locked');
        el.remove();
        done();
      }
    });

    tl.fromTo(marca, { scale: 0.96 }, { scale: 1, duration: 1.7, ease: 'power2.out' }, 0)
      .to(letras, { strokeDashoffset: 0, duration: 0.95, ease: 'power2.inOut', stagger: 0.14 }, 0)
      .to(letras, { fillOpacity: 1, duration: 0.5, ease: 'power1.out', stagger: 0.14 }, 0.55)
      .to(letras, { strokeOpacity: 0, duration: 0.4, ease: 'power1.out' }, 1.0)
      .to(filete, { scaleY: 1, duration: 0.75, ease: EASE.entrada }, 0.5)
      .to(nomes, { x: 0, duration: 0.9, ease: EASE.entrada, stagger: 0.1 }, 0.8)
      .to(inner, { opacity: 0, y: -14, duration: 0.3, ease: EASE.saida }, 1.65)
      /* dois painéis se separam — um sobe, um desce (6.0) */
      .to(panels[0], { yPercent: -100, duration: 0.9, ease: EASE.cortina }, 1.72)
      .to(panels[1], { yPercent: 100, duration: 0.9, ease: EASE.cortina }, '<0.06');

    /* Teto rígido: se algo travar (aba em segundo plano, rAF parado), o site
       abre mesmo assim. */
    setTimeout(function () {
      if (tl.isActive()) tl.progress(1);
    }, 3200);
  }

  /* =====================================================================
     HEADER (7.5)
     ===================================================================== */
  function initHeader() {
    var header = document.querySelector('.header');
    if (!header) return;

    var last = 0;
    var menuOpen = function () {
      return document.documentElement.classList.contains('menu-open');
    };

    window.addEventListener('scroll', function () {
      var y = window.scrollY || window.pageYOffset;

      header.classList.toggle('is-solid', y > window.innerHeight * 0.9);

      if (menuOpen()) { header.classList.remove('is-hidden'); last = y; return; }

      // esconde ao descer, reaparece ao subir
      if (y > last && y > 200) header.classList.add('is-hidden');
      else header.classList.remove('is-hidden');

      last = y;
    }, { passive: true });
  }

  /* =====================================================================
     HEADER SOBRE FUNDO CLARO
     O header é fixo e passa por cima de seções claras. Sem isto a marca
     desaparece — texto near-white sobre off-white. Verifica a cada scroll
     qual seção está sob a faixa do header.
     ===================================================================== */
  function initHeaderTheme() {
    var header = document.querySelector('.header');
    if (!header) return;

    var lights = document.querySelectorAll('.is-light');
    if (!lights.length) return;

    function update() {
      var band = header.getBoundingClientRect().height * 0.55;
      var onLight = false;

      for (var i = 0; i < lights.length; i++) {
        var r = lights[i].getBoundingClientRect();
        if (r.top <= band && r.bottom >= band) { onLight = true; break; }
      }
      header.classList.toggle('is-light-bg', onLight);
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    document.addEventListener('ied:ready', update);
  }

  /* =====================================================================
     CORTINA DE MENU (7.4)
     Dois painéis que se encontram no centro — o gesto do acordo.
     ===================================================================== */
  function initMenu() {
    var menu = document.querySelector('.menu');
    var toggle = document.querySelector('.menu-toggle');
    if (!menu || !toggle) return;

    var panels = menu.querySelectorAll('.menu__panel');
    var seam = menu.querySelector('.menu__seam');
    var links = menu.querySelectorAll('.menu__link');
    var meta = menu.querySelectorAll('.menu__meta > *');
    var label = toggle.querySelector('.menu-toggle__label');
    var open = false;
    var tl = null;
    var lastFocus = null;

    // pré-quebra dos itens para a revelação em máscara
    var inners = [];
    links.forEach(function (l) {
      var span = document.createElement('span');
      span.className = 'menu__link-inner';
      span.style.display = 'inline-block';
      while (l.firstChild) span.appendChild(l.firstChild);
      l.appendChild(span);
      inners.push(span);
    });

    function build() {
      var t = gsap.timeline({ paused: true });

      /* Os painéis PARTEM de -100% (topo) e +100% (base) e convergem para 0:
         cada um ocupa 50,5% da altura, ancorados em top:0 e bottom:0, então em
         yPercent 0 eles se encontram no centro.

         fromTo com `y: 0` explícito é obrigatório aqui. O estado inicial vem do
         CSS como translate3d(0,-100%,0) — que existe para o menu não ficar
         cobrindo a tela sem JS. O GSAP lê essa transform como `y` em PIXELS, de
         modo que um `to({yPercent: 0})` não moveria nada: zeraria uma
         propriedade que estava em zero e manteria o y herdado. O fromTo devolve
         ao GSAP o controle das duas propriedades. */
      t.set(menu, { visibility: 'visible' })
        .fromTo(panels[0], { yPercent: -100, y: 0 },
          { yPercent: 0, duration: 0.9, ease: EASE.cortina }, 0)
        .fromTo(panels[1], { yPercent: 100, y: 0 },
          { yPercent: 0, duration: 0.9, ease: EASE.cortina }, 0)
        .fromTo(seam,
          { scaleX: 0, opacity: 1 },
          { scaleX: 1, duration: 0.5, ease: EASE.cortina }, 0.45)
        .to(seam, { opacity: 0, duration: 0.4 }, 0.75)
        .fromTo(inners,
          { yPercent: 110 },
          { yPercent: 0, duration: DUR.mask, ease: EASE.entrada, stagger: 0.07 }, 0.55)
        .fromTo(meta,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, ease: EASE.suave, stagger: 0.08 }, 0.7);

      return t;
    }

    // O botão de fechar fica no header, fora da cortina, e vem antes dela no
    // DOM: abre o ciclo do Tab, para o foco nunca ficar preso sem saída.
    function focusables() {
      return [toggle].concat(Array.prototype.slice.call(
        menu.querySelectorAll('a[href], button:not([disabled])')));
    }

    function setOpen(next) {
      if (next === open) return;
      open = next;

      if (!tl) tl = build();

      document.documentElement.classList.toggle('menu-open', open);
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('is-locked', open);
      // Com o menu aberto o botão é o único jeito de fechar no toque: diz isso.
      if (label) label.textContent = open ? 'Fechar' : 'Menu';

      var lenis = M.lenis();
      if (lenis) { open ? lenis.stop() : lenis.start(); }

      if (open) {
        lastFocus = document.activeElement;
        if (reduced) { tl.progress(1); } else { tl.timeScale(1).play(); }
        var f = focusables();
        if (f.length > 1) setTimeout(function () { f[1].focus(); }, reduced ? 0 : 700);
      } else {
        if (reduced) { tl.progress(0).pause(); gsap.set(menu, { visibility: 'hidden' }); }
        else {
          tl.timeScale(1.4).reverse();
          tl.eventCallback('onReverseComplete', function () {
            gsap.set(menu, { visibility: 'hidden' });
          });
        }
        if (lastFocus) lastFocus.focus();
      }
    }

    toggle.addEventListener('click', function () { setOpen(!open); });

    // Esc fecha; Tab fica preso dentro da cortina enquanto aberta (12)
    document.addEventListener('keydown', function (e) {
      if (!open) return;

      if (e.key === 'Escape') { setOpen(false); return; }

      if (e.key === 'Tab') {
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    menu.querySelectorAll('.menu__link').forEach(function (l) {
      l.addEventListener('click', function () { setOpen(false); });
    });
  }

  /* =====================================================================
     BOTÃO MAGNÉTICO (6.9)
     Segue o cursor até 8px dentro de um raio de 80px. Volta com elástico.
     Desligado em mobile — não existe cursor (13).
     ===================================================================== */
  function initMagnetic() {
    if (!finePointer || reduced) return;

    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: EASE.suave });
      var yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: EASE.suave });
      var RADIUS = 80, PULL = 8;

      function move(e) {
        var r = btn.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;
        var dist = Math.hypot(dx, dy);

        if (dist > RADIUS + Math.max(r.width, r.height) / 2) { reset(); return; }

        var f = Math.min(dist / RADIUS, 1);
        xTo(dx * f * (PULL / Math.max(dist, 1)) * 4);
        yTo(dy * f * (PULL / Math.max(dist, 1)) * 4);
      }

      function reset() {
        gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: EASE.elastico });
      }

      window.addEventListener('mousemove', move, { passive: true });
      btn.addEventListener('mouseleave', reset);
    });
  }

  /* =====================================================================
     TRANSIÇÃO DE PÁGINA (7.4)
     Saída: os painéis convergem. Entrada: se separam.
     ===================================================================== */
  function initTransitions() {
    var wrap = document.querySelector('.transition');
    if (!wrap) return;

    var panels = wrap.querySelectorAll('.transition__panel');

    // entrada: painéis se separam com o conteúdo já em posição
    // (mesmo motivo do menu: y:0 explícito para o GSAP assumir a transform)
    if (!reduced) {
      gsap.set(wrap, { visibility: 'visible' });
      gsap.set(panels, { yPercent: 0, y: 0 });
      gsap.timeline({ onComplete: function () { gsap.set(wrap, { visibility: 'hidden' }); } })
        .to(panels[0], { yPercent: -100, duration: 0.75, ease: EASE.entrada })
        .to(panels[1], { yPercent: 100, duration: 0.75, ease: EASE.entrada }, '<');
    }

    if (reduced) return;

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a) return;

      var href = a.getAttribute('href');
      if (!href ||
          a.target === '_blank' ||
          a.hasAttribute('download') ||
          href.charAt(0) === '#' ||
          href.indexOf('mailto:') === 0 ||
          href.indexOf('tel:') === 0 ||
          a.hostname !== window.location.hostname) return;

      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

      e.preventDefault();

      gsap.set(wrap, { visibility: 'visible' });
      gsap.timeline({
        onComplete: function () { window.location.href = href; }
      })
        .fromTo(panels[0], { yPercent: -100, y: 0 },
          { yPercent: 0, duration: 0.55, ease: EASE.saida })
        .fromTo(panels[1], { yPercent: 100, y: 0 },
          { yPercent: 0, duration: 0.55, ease: EASE.saida }, '<');
    });
  }

  /* =====================================================================
     FORMULÁRIO (6.9 / 14)
     Validação em português, honeypot + tempo de preenchimento no lugar
     de CAPTCHA de terceiros (14.6). Erros anunciados via aria-live.

     ENVIO — com data-endpoint (FORM_ENDPOINT em src/data/site.mjs), POST
     com os campos em JSON. Sem ele, a mensagem validada abre pronta no
     WhatsApp do escritório. Antes, o formulário dizia "Mensagem enviada"
     sem mandar nada a lugar nenhum: no ar, cada contato escrito ali se
     perderia sem que o visitante nem o escritório soubessem.
     ===================================================================== */
  var CAMPOS_WHATS = [
    ['nome', 'Nome'], ['email', 'E-mail'], ['telefone', 'Telefone'],
    ['empresa', 'Empresa'], ['campanha', 'Campanha']
  ];

  function mensagemWhats(d) {
    var linhas = ['Olá! Escrevo pelo formulário do site da FHL Advocacia.', ''];
    CAMPOS_WHATS.forEach(function (c) {
      if (d[c[0]]) linhas.push(c[1] + ': ' + d[c[0]]);
    });
    linhas.push('', d.mensagem || '');
    return linhas.join('\n');
  }

  function initForm() {
    var form = document.querySelector('[data-form]');
    // degradar() também chama: a guarda impede dois envios por clique.
    if (!form || form.dataset.pronto) return;
    form.dataset.pronto = '1';

    var status = form.querySelector('.form-status');
    var btn = form.querySelector('[type="submit"]');
    var endpoint = form.getAttribute('data-endpoint') || '';
    var whats = form.getAttribute('data-whatsapp') || '';
    var openedAt = Date.now();

    function setStatus(msg, tipo) {
      status.textContent = msg || '';
      status.classList.toggle('is-ok', tipo === 'ok');
      status.classList.toggle('is-erro', tipo === 'erro');
    }

    function setError(input, msg) {
      var slot = input.parentElement.querySelector('.field__error');
      if (slot) slot.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    function validate(input) {
      var v = input.value.trim();

      if (input.required && !v) { setError(input, 'Preencha este campo.'); return false; }
      if (input.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        setError(input, 'Confira o e-mail digitado.'); return false;
      }
      if (input.type === 'tel' && v && !/^\d{10,13}$/.test(v.replace(/\D/g, ''))) {
        setError(input, 'Informe o telefone com DDD, como (41) 99999-9999.'); return false;
      }
      setError(input, '');
      return true;
    }

    form.querySelectorAll('.field__input').forEach(function (input) {
      input.addEventListener('blur', function () { validate(input); });
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') validate(input);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.disabled) return;

      var ok = true;
      form.querySelectorAll('.field__input').forEach(function (i) {
        if (!validate(i)) ok = false;
      });

      var consent = form.querySelector('[name="consent"]');
      if (consent && !consent.checked) {
        setStatus('É necessário autorizar o tratamento dos dados para enviar.', 'erro');
        ok = false;
      } else {
        setStatus('');
      }

      if (!ok) {
        var bad = form.querySelector('[aria-invalid="true"]');
        var campoErrado = bad || (consent && !consent.checked ? consent : null);
        if (bad) setStatus('Revise os campos destacados antes de enviar.', 'erro');
        if (campoErrado) {
          campoErrado.focus({ preventScroll: true });
          campoErrado.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }

      // Uma tentativa rápida com erro deve mostrar o campo a corrigir.
      var hp = form.querySelector('[name="website"]');
      if (hp && hp.value) {
        setStatus('Não foi possível enviar. Tente novamente.', 'erro');
        return;
      }
      if (Date.now() - openedAt < 2500) {
        setStatus('Aguarde alguns segundos e clique novamente em enviar.', 'erro');
        return;
      }

      var dados = Object.fromEntries(new FormData(form).entries());
      dados.pagina = location.pathname;

      if (!endpoint) {
        // window.open é chamado ainda dentro do submit: fora do gesto do
        // usuário, o bloqueador de pop-up o barraria.
        var url = 'https://wa.me/' + whats + '?text=' + encodeURIComponent(mensagemWhats(dados));
        var janela = window.open(url, '_blank');
        if (janela) janela.opener = null;
        else window.location.href = url;
        setStatus('Abrimos o WhatsApp do escritório com a sua mensagem pronta. ' +
          'Confira e toque em enviar — respondemos em até um dia útil.', 'ok');
        return;
      }

      btn.disabled = true;
      setStatus('Enviando…');

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
        signal: AbortSignal.timeout(12000)
      })
        .then(async function (r) {
          var resposta = await r.json();
          if (!r.ok || resposta.ok !== true) throw new Error(resposta.erro || 'Não foi possível registrar agora.');
          setStatus('Mensagem enviada. Retornamos em até um dia útil.', 'ok');
          form.reset();
        })
        .catch(function (erro) {
          setStatus(erro.message && erro.name === 'Error' ? erro.message : 'Não foi possível enviar agora.', 'erro');
          var nome = /telefone|DDD/i.test(erro.message) ? 'telefone' : /e-mail/i.test(erro.message) ? 'email' : null;
          var campo = nome ? form.querySelector('[name="' + nome + '"]') : null;
          if (campo) {
            setError(campo, erro.message);
            campo.focus({ preventScroll: true });
            campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
          } else {
            status.tabIndex = -1;
            status.focus({ preventScroll: true });
            status.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          var alternativa = document.createElement('a');
          alternativa.href = 'https://wa.me/' + whats + '?text=' + encodeURIComponent(mensagemWhats(dados));
          alternativa.target = '_blank';
          alternativa.rel = 'noopener';
          alternativa.textContent = 'Enviar pelo WhatsApp';
          status.append(document.createTextNode(' '), alternativa);
        })
        .then(function () { btn.disabled = false; });
    });
  }

  /* =====================================================================
     COPIAR LINK (fim dos artigos)
     O botão sai escondido do build e só aparece onde a área de
     transferência existe. Copia o endereço em que a página está — num
     endereço provisório, o domínio oficial ainda não responderia.
     ===================================================================== */
  function initCopiar() {
    var btns = document.querySelectorAll('[data-copiar]');
    if (!btns.length || !navigator.clipboard || !window.isSecureContext) return;

    btns.forEach(function (b) {
      if (!b.hidden) return;   // já ligado (degradar() também chama)
      var rotulo = b.querySelector('span');
      var original = rotulo ? rotulo.textContent : '';
      var timer;
      b.hidden = false;

      b.addEventListener('click', function () {
        var url = /^https?:$/.test(location.protocol)
          ? location.href.split('#')[0]
          : b.getAttribute('data-copiar');
        navigator.clipboard.writeText(url).then(function () {
          b.classList.add('is-feito');
          if (rotulo) rotulo.textContent = 'Link copiado';
          clearTimeout(timer);
          timer = setTimeout(function () {
            b.classList.remove('is-feito');
            if (rotulo) rotulo.textContent = original;
          }, 2400);
        });
      });
    });
  }

  /* =====================================================================
     ÂNCORAS NA MESMA PÁGINA
     "Prefiro escrever", nas campanhas, pulava seco até o formulário. Com o
     Lenis ativo, a rolagem até a âncora é suave como o resto do site. O
     link de pular para o conteúdo fica de fora: ele move o foco, e o salto
     imediato é o comportamento esperado.
     ===================================================================== */
  function initAncoras() {
    var lenis = M.lenis();
    if (!lenis) return;

    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains('skip-link')) return;
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      var alvo = id && document.getElementById(id);
      if (!alvo) return;
      e.preventDefault();
      lenis.scrollTo(alvo);
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
  }

  /* =====================================================================
     BANNER DE COOKIES (14.3)
     Opt-in: nada de analytics antes do aceite. "Recusar" tão visível
     quanto "Aceitar".
     ===================================================================== */
  function initCookies() {
    var el = document.querySelector('.cookie');
    if (!el) return;

    var stored = null;
    try { stored = localStorage.getItem('ied:cookies'); } catch (e) {}
    if (stored) return;

    el.classList.add('is-visible');
    gsap.to(el, { y: 0, duration: 0.7, ease: EASE.entrada, delay: 1.4 });

    function decide(value) {
      try { localStorage.setItem('ied:cookies', value); } catch (e) {}
      gsap.to(el, {
        y: '120%', duration: 0.5, ease: EASE.saida,
        onComplete: function () { el.classList.remove('is-visible'); }
      });
      // Só aqui um analytics poderia ser inicializado, se aceito.
    }

    el.querySelector('[data-cookie="accept"]')
      .addEventListener('click', function () { decide('accepted'); });
    el.querySelector('[data-cookie="reject"]')
      .addEventListener('click', function () { decide('rejected'); });
  }

  /* =====================================================================
     MAPA SOB DEMANDA
     O iframe do Google só é inserido depois do clique. Carregá-lo junto com
     a página mandaria IP e user-agent do visitante para o Google antes de
     qualquer consentimento — o oposto do que o banner de cookies promete.
     ===================================================================== */
  function initMapa() {
    var box = document.querySelector('[data-map]');
    if (!box) return;

    var btn = box.querySelector('[data-map-load]');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (box.classList.contains('is-loaded')) return;

      var frame = document.createElement('iframe');
      frame.src = box.dataset.mapSrc;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.title = 'Mapa do escritório da FHL Advocacia em Paranaguá';
      frame.setAttribute('allowfullscreen', '');

      box.appendChild(frame);
      box.classList.add('is-loaded');
    });
  }

  /* =====================================================================
     CAMPANHAS
     O aviso de "campanha encerrada" sai do build já visível quando a data
     tinha passado; senão vem escondido e é revelado aqui no dia seguinte ao
     fim — a página se corrige sozinha, mesmo sem novo deploy.
     As perguntas frequentes mudam a altura da página ao abrir: sem refresh,
     as revelações do contato, logo abaixo, disparariam no ponto errado.
     ===================================================================== */
  function initCampanha() {
    var aviso = document.querySelector('[data-campanha-fim]');
    if (aviso) {
      var d = new Date();
      var hoje = d.getFullYear() + '-' +
        ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if (hoje > aviso.getAttribute('data-campanha-fim')) aviso.hidden = false;
    }

    if (!window.ScrollTrigger) return;
    document.querySelectorAll('.faq__item').forEach(function (item) {
      item.addEventListener('toggle', function () { window.ScrollTrigger.refresh(); });
    });
  }

  /* =====================================================================
     ANO NO RODAPÉ
     ===================================================================== */
  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (n) {
      n.textContent = new Date().getFullYear();
    });
  }

  /* =====================================================================
     BOOT
     ===================================================================== */
  /* Devolve a página ao estado sem-JS: sem animação, mas com todo o conteúdo
     legível. É o destino de qualquer falha de inicialização. */
  function degradar(motivo, erro) {
    document.documentElement.classList.remove('js');
    var loader = document.querySelector('.loader');
    if (loader) loader.remove();
    document.body.classList.remove('is-locked');
    initYear();
    initCampanha();
    initCopiar();
    // O formulário não depende do GSAP. Sem este init, o envio caía no
    // comportamento nativo do navegador, sem validação.
    try { initForm(); } catch (e) {}
    console.warn('[IED] ' + motivo + ' — site servido sem animação.', erro || '');
  }

  function boot() {
    /* Sem GSAP não existe site animado. Falhar cedo e de forma limpa é muito
       melhor do que quebrar no meio da inicialização e deixar todo título com
       visibility:hidden, que é exatamente o que acontecia antes desta guarda. */
    if (!window.gsap || !window.ScrollTrigger) {
      degradar('GSAP não carregou');
      return;
    }

    try {
      M.initScroll();
      M.initResize();

      initHeader();
      initHeaderTheme();
      initMenu();
      initMagnetic();
      initTransitions();
      initForm();
      initCookies();
      initMapa();
      initCampanha();
      initCopiar();
      initAncoras();
      initYear();
    } catch (err) {
      degradar('erro ao inicializar componentes', err);
      return;
    }

    /* A partir daqui quem cuida das falhas é este arquivo: a rede de segurança
       do <head> não pode derrubar o loader no meio da animação. */
    document.documentElement.classList.add('ied-boot');

    initLoader(function () {
      try {
        M.autoRegister();
        if (IED.home) IED.home.init();
        if (IED.page) IED.page.init();
      } catch (err) {
        degradar('erro ao registrar as revelações', err);
        return;
      }

      /* Só AQUI a rede de segurança do <head> é desarmada: o conteúdo está
         revelado de fato. Marcá-la no início do boot desarmava a proteção
         antes de saber se a inicialização daria certo. */
      document.documentElement.classList.add('ied-ready');
      document.dispatchEvent(new CustomEvent('ied:ready'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.IED);
