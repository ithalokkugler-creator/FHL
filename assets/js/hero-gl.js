/* ==========================================================================
   FHL ADVOCACIA — "O DOCUMENTO"
   A única cena WebGL do site inteiro. Preparação, seção 8.

   Um plano que se comporta como uma folha de papel pesado. A amplitude do
   relevo é controlada por uSettle, atrelado ao progresso do scroll no herói:
   a superfície começa agitada e SE ASSENTA conforme o visitante desce.
   O ruído vira acordo — a tese do escritório, executada em movimento.

   NOTA DE IMPLEMENTAÇÃO — desvio consciente da preparação (10):
   a preparação especifica Three.js com imports seletivos e teto de 60 KB gzip.
   Esse teto só é alcançável com tree-shaking, que exige bundler — e não há
   Node nesta máquina. Como a cena é UM plano com shader próprio (sem scene
   graph, sem loader, sem material system), ela foi escrita em WebGL puro:
   mesmos shaders, mesmo resultado visual, 1 draw call, e 0 KB de dependência.
   Ao migrar para Astro, este arquivo continua válido como está.
   ========================================================================== */

window.IED = window.IED || {};

(function (IED) {
  'use strict';

  var SEGMENTS = 96;   // 97×97 vértices = 18.432 triângulos (Preparação 8.3)

  /* ---------------------------------------------------------------------
     VERTEX SHADER
     Três oitavas de ruído simplex nas escalas 1.0 / 2.3 / 4.7 com
     amplitudes 1.0 / 0.4 / 0.15. A normal é derivada por diferenças
     finitas para o rim light do fragment.
     --------------------------------------------------------------------- */
  var VERT = [
    'precision highp float;',
    'attribute vec2 aPos;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform vec2 uSize;',
    'uniform float uTime;',
    'uniform float uSettle;',
    'uniform vec2 uMouse;',
    'varying vec3 vNormal;',
    'varying float vHeight;',
    'varying vec2 vUv;',

    /* simplex noise 3D — Ashima Arts / Stefan Gustavson (MIT) */
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    '  i=mod289(i);',
    '  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))',
    '        +i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y);',
    '  vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}',

    /* deslocamento: 3 oitavas + toque local do cursor */
    'float displace(vec2 p){',
    '  float t=uTime*0.12;',                       // respiração lenta
    '  float h = snoise(vec3(p*1.0, t))       * 1.00;',
    '  h     += snoise(vec3(p*2.3, t*1.25))   * 0.40;',
    '  h     += snoise(vec3(p*4.7, t*1.6))    * 0.15;',
    '  h *= uSettle;',                             // ← o assentamento
    /* cursor: deslocamento gaussiano local, raio 0.25, amplitude 0.3 */
    '  float d = distance(p, uMouse);',
    '  h += exp(-(d*d)/(2.0*0.25*0.25)) * 0.30;',
    '  return h;',
    '}',

    'void main(){',
    '  vec2 p = aPos * uSize;',
    '  float e = 0.035;',
    '  float h  = displace(aPos);',
    '  float hx = displace(aPos + vec2(e, 0.0));',
    '  float hy = displace(aPos + vec2(0.0, e));',
    '  vec3 tx = vec3(e*uSize.x, 0.0, hx-h);',
    '  vec3 ty = vec3(0.0, e*uSize.y, hy-h);',
    '  vNormal = normalize(cross(tx, ty));',
    '  vHeight = h;',
    '  vUv = aPos + 0.5;',
    '  gl_Position = uProj * uView * vec4(p, h, 1.0);',
    '}'
  ].join('\n');

  /* ---------------------------------------------------------------------
     FRAGMENT SHADER
     Base petróleo. Rim light na menta da marca só nas cristas do relevo.
     Fresnel sutil nas bordas para dar espessura. Grão procedural.
     --------------------------------------------------------------------- */
  var FRAG = [
    'precision highp float;',
    'varying vec3 vNormal;',
    'varying float vHeight;',
    'varying vec2 vUv;',
    'uniform float uTime;',

    'const vec3 PETROL = vec3(0.047, 0.098, 0.090);',  // #0C1917
    'const vec3 MINT   = vec3(0.635, 0.796, 0.722);',  // #A2CBB8 (pétala clara)
    'const vec3 ABYSS  = vec3(0.027, 0.051, 0.047);',  // #070D0C

    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',

    'void main(){',
    '  vec3 n = normalize(vNormal);',
    '  vec3 lightDir = normalize(vec3(-0.45, 0.55, 0.72));',
    '  float lambert = max(dot(n, lightDir), 0.0);',

    /* só as cristas pegam o brilho da menta */
    '  float rim = pow(lambert, 3.0);',

    /* fresnel: bordas ganham espessura */
    '  vec3 viewDir = vec3(0.0, 0.0, 1.0);',
    '  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);',

    /* vales escurecem, cristas clareiam */
    '  float depth = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 col = mix(ABYSS, PETROL, depth);',
    '  col += MINT * rim * 0.22;',
    '  col += MINT * fres * 0.07;',

    /* vinheta radial suave no próprio shader */
    '  float v = distance(vUv, vec2(0.5));',
    '  col *= 1.0 - smoothstep(0.35, 0.95, v) * 0.55;',

    /* grão procedural — evita uma textura extra */
    '  float g = hash(gl_FragCoord.xy + fract(uTime) * 100.0);',
    '  col += (g - 0.5) * 0.018;',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* --------------------------------------------------------------------- */

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[hero-gl] shader:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  /* Malha do plano em espaço normalizado [-0.5, 0.5] */
  function buildPlane(seg) {
    var verts = [];
    var idx = [];
    var n = seg + 1;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        verts.push(x / seg - 0.5, y / seg - 0.5);
      }
    }
    for (var j = 0; j < seg; j++) {
      for (var i = 0; i < seg; i++) {
        var a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    return {
      verts: new Float32Array(verts),
      idx: new Uint32Array(idx),
      count: idx.length
    };
  }

  function perspective(out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0;  out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0;           out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  /* Câmera: recuada em z e levemente acima, olhando para baixo (8.2) */
  function viewMatrix(out, z, tilt) {
    var c = Math.cos(tilt), s = Math.sin(tilt);
    out[0] = 1; out[1] = 0;  out[2] = 0;  out[3] = 0;
    out[4] = 0; out[5] = c;  out[6] = s;  out[7] = 0;
    out[8] = 0; out[9] = -s; out[10] = c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = -z; out[15] = 1;
    return out;
  }

  /* ---------------------------------------------------------------------
     GUARDAS (8.4) — a cena só roda quando faz sentido rodar
     --------------------------------------------------------------------- */
  function shouldRun() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.innerWidth < 768) return false;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return false;
    var conn = navigator.connection;
    if (conn && conn.saveData === true) return false;
    return true;
  }

  function init(canvas) {
    if (!canvas || !shouldRun()) return null;

    var gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: true
    });
    if (!gl) return null;

    // índices de 32 bits para uma malha de 97×97
    var uintExt = gl.getExtension('OES_element_index_uint');
    var seg = uintExt ? SEGMENTS : 64;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[hero-gl] link:', gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    var mesh = buildPlane(seg);

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      uintExt ? mesh.idx : new Uint16Array(mesh.idx), gl.STATIC_DRAW);

    var U = {
      proj:   gl.getUniformLocation(prog, 'uProj'),
      view:   gl.getUniformLocation(prog, 'uView'),
      size:   gl.getUniformLocation(prog, 'uSize'),
      time:   gl.getUniformLocation(prog, 'uTime'),
      settle: gl.getUniformLocation(prog, 'uSettle'),
      mouse:  gl.getUniformLocation(prog, 'uMouse')
    };

    var proj = new Float32Array(16);
    var view = new Float32Array(16);
    var FOV = 32 * Math.PI / 180;
    var CAM_Z = 3.2;
    var TILT = 0.26;

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.027, 0.051, 0.047, 1.0);

    var state = {
      settle: 1.0,
      mouse: [0, 0],
      mouseTarget: [0, 0],
      running: false,
      visible: true,
      raf: 0,
      t0: performance.now()
    };

    function resize() {
      // DPR limitado a 1.5 (Preparação 8.2)
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = canvas.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);

      var aspect = w / h;
      perspective(proj, FOV, aspect, 0.1, 100);
      viewMatrix(view, CAM_Z, TILT);
      gl.uniformMatrix4fv(U.proj, false, proj);
      gl.uniformMatrix4fv(U.view, false, view);

      // o plano precisa cobrir a viewport com folga para o tilt
      var visH = 2 * CAM_Z * Math.tan(FOV / 2);
      var visW = visH * aspect;
      gl.uniform2f(U.size, visW * 1.65, visH * 2.05);
    }

    function frame(now) {
      if (!state.running) return;
      var t = (now - state.t0) / 1000;

      // lerp de 0.06 por frame: passar o mouse é como encostar o dedo no papel
      state.mouse[0] += (state.mouseTarget[0] - state.mouse[0]) * 0.06;
      state.mouse[1] += (state.mouseTarget[1] - state.mouse[1]) * 0.06;

      gl.uniform1f(U.time, t);
      gl.uniform1f(U.settle, state.settle);
      gl.uniform2f(U.mouse, state.mouse[0], state.mouse[1]);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, mesh.count,
        uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);

      state.raf = requestAnimationFrame(frame);
    }

    function start() {
      if (state.running) return;
      state.running = true;
      state.t0 = performance.now() - 1000;
      state.raf = requestAnimationFrame(frame);
    }
    function stop() {
      state.running = false;
      cancelAnimationFrame(state.raf);
    }

    resize();
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 150);
    });

    /* Pausa quando o herói sai da tela — OBRIGATÓRIO (8.3).
       Sem isto o site consome GPU o percurso inteiro. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting;
        if (state.visible && !document.hidden) start(); else stop();
      }, { threshold: 0 }).observe(canvas);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (state.visible) start();
    });

    window.addEventListener('mousemove', function (e) {
      state.mouseTarget[0] = (e.clientX / window.innerWidth - 0.5);
      state.mouseTarget[1] = -(e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    // contexto perdido: cai para o fallback estático, sem erro visível
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      stop();
      canvas.classList.remove('is-ready');
    });

    start();
    canvas.classList.add('is-ready');

    return {
      /* uSettle: 1.0 no topo → 0.12 no fim do herói.
         Quem dirige este valor é o ScrollTrigger em home.js. */
      setSettle: function (v) { state.settle = v; },
      start: start,
      stop: stop
    };
  }

  IED.heroGL = { init: init, shouldRun: shouldRun };
})(window.IED);
