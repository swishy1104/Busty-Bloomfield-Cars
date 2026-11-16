/* Bloomfield Drift — post-processing (BD.buildFx): bloom, colour grade, speed blur and sun glare on top of the
   unchanged scene render.
   How it matches the plain render: in three.js r128 every material tone-maps and encodes in its own shader whether
   it draws to the screen or to a render target (the encoding comes from target.texture.encoding). So the scene is
   drawn into a target tagged sRGB with the renderer's own tone mapping and exposure left alone: the target holds
   exactly the pixels the screen would have had (the display-referred sky, fog, smoke, beams and decals included,
   blended and multisample-resolved the same way) and nothing has to be reproduced afterwards. The depth buffer is
   depth+stencil because r128 gives a depth-only target 16 bits, which z-fights the road decals.
   Highlights: ACES only reaches display white at about 17x scene white, so the bright pass runs the curve
   backwards to get the highlight range back; in a half-float target the sky's sun disc also overshoots 1.0, which
   feeds the bloom and is what the sun-visibility test looks for (nothing else in the frame is brighter than white).
   Passes at quality 2: scene (4x MSAA on WebGL2, FXAA pass on WebGL1) -> bright pass (1/2 res) -> 4 blur levels
   (1/2 .. 1/16, two passes each) -> 1 px sun-visibility pass -> composite to the screen (speed blur and chromatic
   fringe at the edges, bloom, sun glow and lens ghosts, contrast, split tone, warm saturation, vignette, grain).
   Quality 1: the same with the bloom pyramid starting at 1/4 res and no speed blur or glare. Quality 0: bypass.
   Public surface: BD.buildFx({ renderer, scene, camera, W, game }) -> { render(dt, time), resize(w, h, pixelRatio),
   setQuality(0|1|2), params }, also left on BD.fx. params = { bloom, grade, vignette, grain, speed, glare }
   strengths (1 = as tuned, 0 = off; all 0 reproduces the plain render). Reads game.car.speed and the 'frame'
   event; reads no settings, makes no DOM, emits no events. */
(function () {
  'use strict';
  const BD = window.BD = window.BD || {}, T = THREE;

  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const HASH = 'float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }';
  // bright pass: 4-tap downsample; display sRGB -> pseudo scene-linear (inverse of three's ACES curve fit), soft-knee threshold
  const FS_BRIGHT = `uniform sampler2D tex; uniform vec2 off; uniform vec2 thr; varying vec2 vUv;
    vec4 tap(vec2 o){ vec3 s = texture2D(tex, vUv + o).rgb, over = max(s - 1.0, 0.0), c = clamp(s, 0.0, 1.0);
      c = min(c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878), 0.985);
      vec3 A = 0.983729 * c - 1.0, B = 0.432951 * c - 0.0245786, C = 0.238081 * c + 0.000090537;
      c = (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A) + over;
      float l = mix(dot(c, vec3(0.2126, 0.7152, 0.0722)), max(c.r, max(c.g, c.b)), 0.5);
      float k = clamp(l - thr.x + thr.y, 0.0, 2.0 * thr.y), e = max(k * k / (4.0 * thr.y), l - thr.x);
      c *= e / max(l, 1e-4); float w = 1.0 / (1.0 + 0.15 * e); return vec4(c * w, w); }
    void main(){ vec4 s = tap(off) + tap(-off) + tap(vec2(off.x, -off.y)) + tap(vec2(-off.x, off.y)); vec3 c = s.rgb / s.w;
      #ifdef LDR
      c = sqrt(c / 16.0);
      #endif
      gl_FragColor = vec4(c, 1.0); }`;
  // 9-tap gaussian in 5 bilinear fetches
  const FS_BLUR = `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tex, vUv).rgb * 0.2270270270;
      c += (texture2D(tex, vUv + dir * 1.3846153846).rgb + texture2D(tex, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
      c += (texture2D(tex, vUv + dir * 3.2307692308).rgb + texture2D(tex, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(c, 1.0); }`;
  // how much of the sun disc is in view: 12 taps over the disc, blended over time into a 1 px target (alpha = k)
  const FS_SUN = `uniform sampler2D tex; uniform vec4 sun; uniform float k;
    void main(){ float v = 0.0;
      for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 12.0); vec2 p = sun.xy + vec2(cos(a), sin(a)) * r * sun.zw;
        vec3 c = texture2D(tex, p).rgb;
        #ifdef LDR
        float s = step(0.98, min(c.r, c.g));
        #else
        float s = step(2.5, c.r);
        #endif
        v += s * step(abs(p.x - 0.5), 0.5) * step(abs(p.y - 0.5), 0.5); }
      gl_FragColor = vec4(vec3(v / 12.0), k); }`;
  const FS_FXAA = `uniform sampler2D tex; uniform vec2 px; varying vec2 vUv; const vec3 L = vec3(0.299, 0.587, 0.114);
    void main(){ vec3 m = texture2D(tex, vUv).rgb;
      float nw = dot(texture2D(tex, vUv + vec2(-px.x, -px.y)).rgb, L), ne = dot(texture2D(tex, vUv + vec2(px.x, -px.y)).rgb, L);
      float sw = dot(texture2D(tex, vUv + vec2(-px.x, px.y)).rgb, L), se = dot(texture2D(tex, vUv + px).rgb, L), lm = dot(m, L);
      float lo = min(lm, min(min(nw, ne), min(sw, se))), hi = max(lm, max(max(nw, ne), max(sw, se)));
      vec2 d = vec2(sw + se - nw - ne, nw + sw - ne - se);
      d = clamp(d / (min(abs(d.x), abs(d.y)) + max((nw + ne + sw + se) * 0.03125, 0.0078125)), -8.0, 8.0) * px;
      vec3 a = 0.5 * (texture2D(tex, vUv - d * 0.1666667).rgb + texture2D(tex, vUv + d * 0.1666667).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tex, vUv - d * 0.5).rgb + texture2D(tex, vUv + d * 0.5).rgb); float lb = dot(b, L);
      gl_FragColor = vec4(lb < lo || lb > hi ? a : b, 1.0); }`;
  const FS_OUT = `uniform sampler2D tScene, tB0, tB1, tB2, tB3, tSun; uniform vec4 sun, bw, grade; uniform vec3 sunCol; uniform vec2 fx; uniform float aspect;
    varying vec2 vUv; const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
    ${HASH}
    float ghost(float at, float r, float edge){ vec2 q = (vUv - sun.xy - (0.5 - sun.xy) * at) * vec2(aspect, 1.0); float d = length(q) / r; return (1.0 - smoothstep(edge, 1.0, d)) * (0.35 + 0.65 * d * d); }
    void main(){ vec2 d = vUv - 0.5, da = d * vec2(aspect, 1.0); float rr = length(da); vec3 c;
      // speed: radial streaks with a red/blue split, zero inside the middle of the frame
      if (fx.x > 0.0) { float a = fx.x * smoothstep(0.22, 0.85, rr) * 0.05, j = hash(gl_FragCoord.xy); vec3 acc = vec3(0.0), ws = vec3(0.0);
        for (int i = 0; i < 6; i++) { float t = (float(i) + j) / 6.0; vec3 w = vec3(t, 1.0 - abs(2.0 * t - 1.0), 1.0 - t) + 0.12;
          acc += w * min(texture2D(tScene, vUv - d * (t - 0.5) * a).rgb, 1.0); ws += w; }
        c = acc / ws;
      } else c = min(texture2D(tScene, vUv).rgb, 1.0);
      c = pow(max(c, 0.0), vec3(2.2));
      // bloom: screen-blended so it glows around highlights without flattening them
      vec3 b = texture2D(tB0, vUv).rgb * bw.x + texture2D(tB1, vUv).rgb * bw.y + texture2D(tB2, vUv).rgb * bw.z + texture2D(tB3, vUv).rgb * bw.w;
      #ifdef LDR
      b = b * b * 16.0;
      #endif
      c += (1.0 - exp(-b)) * (1.0 - c);
      // sun glare: glow, a faint horizontal streak and four ghosts on the line through the screen centre
      float vis = texture2D(tSun, vec2(0.5)).r * sun.z;
      if (sun.z > 0.0) { vec2 q = (vUv - sun.xy) * vec2(aspect, 1.0); float dq = length(q);
        vec3 g = sunCol * (0.34 * exp(-dq * dq * 60.0) + 0.13 * exp(-dq * 4.0) + 0.07 * exp(-abs(q.y) * 55.0 - abs(q.x) * 2.5));
        g += vec3(0.10, 0.16, 0.06) * ghost(0.62, 0.035, 0.75) + vec3(0.05, 0.10, 0.14) * ghost(1.28, 0.07, 0.8);
        g += vec3(0.14, 0.09, 0.04) * ghost(1.62, 0.022, 0.5) + vec3(0.07, 0.05, 0.10) * ghost(2.15, 0.13, 0.9);
        c += g * vis * (1.0 - c); }
      c = pow(c, vec3(1.0 / 2.2));
      // grade (display space): S-curve, warm highlights / cool shadows, richer reds and oranges
      float l = dot(c, LUM);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.22 * grade.x);
      c += grade.x * 4.0 * l * (1.0 - l) * (vec3(0.034, 0.010, -0.034) * l + vec3(-0.016, 0.000, 0.026) * (1.0 - l));
      l = dot(c, LUM); float warm = smoothstep(0.0, 0.16, c.r - c.g) * smoothstep(0.02, 0.2, c.r - c.b);
      c = l + (c - l) * (1.0 + grade.x * (0.05 + 0.2 * warm));
      float rv = rr / length(vec2(aspect, 1.0) * 0.5); c *= 1.0 - grade.y * 0.26 * rv * rv * smoothstep(0.15, 1.0, rv);
      c += (hash(gl_FragCoord.xy + fx.y) - 0.5) * grade.z * 0.022 * (1.0 - 0.5 * l);
      gl_FragColor = vec4(c, 1.0); }`;

  BD.buildFx = function ({ renderer, scene, camera, W, game }) {
    const caps = renderer.capabilities, ext = renderer.extensions, gl2 = caps.isWebGL2, sstep = BD.util.sstep;
    const HF = gl2 ? ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
      : ext.has('OES_texture_half_float') && ext.has('OES_texture_half_float_linear') && ext.has('EXT_color_buffer_half_float');
    // ponytail: trusts the extension list; render a 1 px half-float target and checkFramebufferStatus if a driver lies
    const TYPE = HF ? T.HalfFloatType : T.UnsignedByteType, AA = renderer.getContextAttributes().antialias;   // no antialiasing where game.js asked for none (phones)
    const OK = caps.precision === 'highp';   // ponytail: mediump-only GPUs get the plain render; the blur and grain maths need highp
    const P = { bloom: 1, grade: 1, vignette: 1, grain: 1, speed: 1, glare: 1 };
    const defines = HF ? {} : { LDR: 1 };
    const mat = (fragmentShader, uniforms, more) => new T.ShaderMaterial(Object.assign({ vertexShader: VS, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false }, more));
    const mBright = mat(FS_BRIGHT, { tex: { value: null }, off: { value: new T.Vector2() }, thr: { value: new T.Vector2(4.2, 1.6) } });
    const mBlur = mat(FS_BLUR, { tex: { value: null }, dir: { value: new T.Vector2() } });
    const mSun = mat(FS_SUN, { tex: { value: null }, sun: { value: new T.Vector4() }, k: { value: 1 } }, { transparent: true });
    const mFxaa = mat(FS_FXAA, { tex: { value: null }, px: { value: new T.Vector2() } });
    const U = { tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tSun: { value: null },
      sun: { value: new T.Vector4() }, bw: { value: new T.Vector4() }, grade: { value: new T.Vector4() }, sunCol: { value: new T.Vector3(1, 0.9, 0.75) }, fx: { value: new T.Vector2() }, aspect: { value: 1 } };
    const mOut = mat(FS_OUT, U);
    const tri = new T.Mesh(new T.BufferGeometry(), mOut), cam = new T.Camera(); tri.frustumCulled = false;
    tri.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.geometry.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

    let q = 0, rtScene = null, rtAA = null, rtSun = null, driving = false, speed = 0, seed = 0;
    const lv = [], size = new T.Vector2(), v2 = new T.Vector2(), v3 = new T.Vector3();
    const target = (w, h, depth, Cls) => new (Cls || T.WebGLRenderTarget)(w, h, { type: TYPE, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false, depthBuffer: depth, stencilBuffer: depth });
    function free() { for (const t of [rtScene, rtAA, rtSun].concat(lv)) if (t) t.dispose(); rtScene = rtAA = rtSun = null; lv.length = 0; }
    function alloc() {
      free(); if (!q) return;
      const w = size.x, h = size.y;
      rtScene = target(w, h, true, AA && gl2 ? T.WebGLMultisampleRenderTarget : null); rtScene.texture.encoding = renderer.outputEncoding;
      if (AA && !gl2) rtAA = target(w, h, false);
      rtSun = target(1, 1, false);
      for (let i = 0, d = q > 1 ? 2 : 4; i < 4; i++, d *= 2) for (let j = 0; j < 2; j++) lv.push(target(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d)), false));
    }
    function fit() { renderer.getDrawingBufferSize(v2); if (v2.x !== size.x || v2.y !== size.y || !rtScene) { size.copy(v2); alloc(); } }
    function pass(m, to) { tri.material = m; renderer.setRenderTarget(to); renderer.render(tri, cam); }
    game.on('frame', (dt, drv) => { driving = drv; });

    function render(dt) {
      if (!q) { renderer.render(scene, camera); return; }
      fit();
      const out = renderer.getRenderTarget(), info = renderer.info, autoReset = info.autoReset, autoClear = renderer.autoClear;
      info.autoReset = false; info.reset();          // one frame's totals: the scene plus these passes
      renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
      let src = rtScene.texture;
      if (rtAA) { mFxaa.uniforms.tex.value = src; mFxaa.uniforms.px.value.set(1 / size.x, 1 / size.y); pass(mFxaa, rtAA); src = rtAA.texture; }
      // bloom pyramid: bright pass into the first level, then each level blurs the one above it at half the size
      mBright.uniforms.tex.value = src; mBright.uniforms.off.value.set(0.25 / lv[0].width, 0.25 / lv[0].height); pass(mBright, lv[0]);
      for (let i = 0; i < 4; i++) {
        const a = lv[i * 2], b = lv[i * 2 + 1], u = mBlur.uniforms;
        u.tex.value = lv[i ? i * 2 - 2 : 0].texture; u.dir.value.set(1 / a.width, 0); pass(mBlur, b);
        u.tex.value = b.texture; u.dir.value.set(0, 1 / a.height); pass(mBlur, a);
      }
      // sun: screen position from the view-space direction; the 1 px target eases toward the visible share of the disc
      const e = camera.projectionMatrix.elements, s = mSun.uniforms.sun.value;
      v3.copy(W.sunDir).transformDirection(camera.matrixWorldInverse);
      const on = q > 1 && P.glare > 0 && v3.z < -0.05 && Math.abs(v3.x / v3.z * e[0]) < 1.4 && Math.abs(v3.y / v3.z * e[5]) < 1.4;
      if (q > 1) {
        if (on) s.set(0.5 - 0.5 * v3.x / v3.z * e[0], 0.5 - 0.5 * v3.y / v3.z * e[5], 0.019 * e[0], 0.019 * e[5]); else s.set(-9, -9, 0, 0);
        mSun.uniforms.tex.value = src; mSun.uniforms.k.value = 1 - Math.exp(-Math.max(dt, 0.016) * 12);
        renderer.autoClear = false; pass(mSun, rtSun); renderer.autoClear = autoClear;
        if (W.sun) U.sunCol.value.set(W.sun.color.r, W.sun.color.g, W.sun.color.b).lerp(v3.set(1, 1, 1), 0.3);
      }
      U.sun.value.set(s.x, s.y, on ? P.glare : 0, 0);
      // speed blur eases in from 60 mph to full at about 135 mph, and out when the game is not being driven
      const car = game.car, want = q > 1 && driving && car ? sstep((car.speed - 26) / 34) : 0;
      speed += (want - speed) * Math.min(1, dt * 5); if (speed < 0.004) speed = 0;
      if (dt > 0 && (driving || game.mode === 'title')) seed = (seed + 0.6180339) % 1;   // grain holds still on a paused or photo-mode frame
      U.fx.value.set(speed * P.speed, seed * 289);
      U.tScene.value = src; U.tSun.value = rtSun.texture; U.aspect.value = size.x / size.y;
      U.tB0.value = lv[0].texture; U.tB1.value = lv[2].texture; U.tB2.value = lv[4].texture; U.tB3.value = lv[6].texture;
      U.bw.value.set(0.34, 0.28, 0.22, 0.16).multiplyScalar(0.11 * P.bloom);
      U.grade.value.set(P.grade, P.vignette, P.grain, 0);
      pass(mOut, out);
      info.autoReset = autoReset;
    }
    const api = BD.fx = { render, resize: fit, setQuality(v) { v = OK ? v | 0 : 0; if (v !== q) { q = v; size.set(0, 0); free(); } }, params: P };
    return api;
  };
})();
