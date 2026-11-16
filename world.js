/* Bloomfield Drift — world builder.
   Turns map.js (OpenStreetMap/Overture roads + building footprints, ESA land cover, horizon elevation) and the
   lidar-derived detail (detail.js, terrain.png, ground.png: 2.5 m terrain, measured roofs, every tree, real pavement)
   into the 3D town.
   World frame (three.js): X east, Y up, Z south; origin = Greene County Courthouse. */
(function () {
  'use strict';
  const T = THREE, M = window.BLOOMFIELD, DT = window.BLOOMFIELD_DETAIL;
  const B = (window.BD = window.BD || {});
  const HALF = M.half, STEP = DT.terrain.step, N = DT.terrain.n, DN = M.dem.n;     // terrain grid: 2.5 m, 1641 x 1641
  const MS = HALF;                     // surface mask is MS x MS cells of 2 m
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rng = mulberry(1104);
  function hash2(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, z) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v; }
  function b64u16(s) { const b = atob(s), n = b.length >> 1, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = (b.charCodeAt(2 * i) | b.charCodeAt(2 * i + 1) << 8) / 50 + M.base; return o; }
  function b64u8(s) { const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const FALL = [  // [weight, colours] — maples, oaks, hickories, the odd evergreen
    [0.20, [0xb5261e, 0xc8371b, 0x9c1f2e, 0xd0402a]], [0.27, [0xd9601a, 0xe07b1f, 0xc8501a, 0xe8892a]],
    [0.25, [0xe3a51d, 0xf0c12b, 0xd1a019, 0xf2cf4a]], [0.14, [0x8a4b1f, 0x7a3e22, 0xa0602a]],
    [0.09, [0x6d8a2e, 0x7d9434, 0x5e7a2a]], [0.05, [0x2c4a2e, 0x254028]]];
  // ever: true = evergreen, false = never evergreen, undefined = by chance
  function fallColor(r, ever) { let a = r() * (ever === false ? 0.95 : 1), k = 0; if (ever) k = 5; else while (k < FALL.length - 1 && a > FALL[k][0]) { a -= FALL[k][0]; k++; } const c = lin(FALL[k][1][Math.floor(r() * FALL[k][1].length)]); const j = 0.85 + r() * 0.3; c.multiplyScalar(j); c.evergreen = k === 5; return c; }

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  const SIGN_FONT = '"Alfa Slab One", Rockwell, Georgia, serif', TEXT_FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  function fit(g, text, maxW, size, font) { do { g.font = size + 'px ' + font; size -= 2; } while (g.measureText(text).width > maxW && size > 9); }

  // growable geometry buffers
  function Buf() { return { pos: [], nor: [], col: [], uv: [], idx: [] }; }
  function bufGeo(b) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(b.pos), 3));
    if (b.nor.length) g.setAttribute('normal', new T.BufferAttribute(new Float32Array(b.nor), 3));
    if (b.col.length) g.setAttribute('color', new T.BufferAttribute(new Float32Array(b.col), 3));
    if (b.uv.length) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(b.uv), 2));
    g.setIndex(new T.BufferAttribute(new Uint32Array(b.idx), 1));
    if (!b.nor.length) g.computeVertexNormals();
    return g;
  }
  function mergeGeos(list) {   // non-indexed merge with position / normal / color
    let n = 0; const parts = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const q of parts) { pos.set(q.attributes.position.array, o); nor.set(q.attributes.normal.array, o); col.set(q.attributes.color.array, o); o += q.attributes.position.count * 3; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
  }
  function paint(g, fn) { const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c[3 * i] = v[0]; c[3 * i + 1] = v[1]; c[3 * i + 2] = v[2]; } g.setAttribute('color', new T.BufferAttribute(c, 3)); return g; }

  B.util = { lin, clamp, sstep, mulberry, hash2, vnoise, canvasTex, fit, Buf, bufGeo, mergeGeos, paint, b64u8, SIGN_FONT, TEXT_FONT };

  B.buildWorld = async function (scene, opts, progress) {
    // obstacles: flat [X, Z, radius, ...] circles; walls: flat [X1, Z1, X2, Z2, ...] segments; buildings: one record per footprint.
    // Add-on modules append to these, then game.js calls W.buildCollision() once.
    const W = { HALF, PLAY: HALF - 55, obstacles: [], walls: [], buildings: [], animated: [] };
    progress('Reading the USGS lidar scan', 0.05); await tick();

    // ---------- elevation: 1 m lidar bare-earth model, shipped at 2.5 m ----------
    const loadImg = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Could not load ' + src)); im.src = src; });
    const [timg, gimg] = await Promise.all([loadImg(DT.terrain.file), loadImg(DT.ground.file)]);
    const H = new Float32Array(N * N);
    { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(timg, 0, 0); const d = g.getImageData(0, 0, N, N).data; for (let k = 0; k < N * N; k++) H[k] = DT.terrain.base + (d[4 * k] << 8 | d[4 * k + 1]) * DT.terrain.q; }
    for (let i = 0; i < N; i++) { H[(N - 1) * N + i] = H[(N - 2) * N + i] = H[(N - 3) * N + i]; H[i * N] = H[i * N + 1] = H[i * N + 2]; }      // build_detail.py's 1 m roll wrapped the north edge into the last two (south) rows and the east edge into the first two (west) columns: take the third
    function gridAt(a, n, step, half, X, Z) {
      const fx = clamp((X + half) / step, 0, n - 1.001), fz = clamp((Z + half) / step, 0, n - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i;
      return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + n] * (1 - u) + a[k + n + 1] * u) * v;
    }
    function blur(src, n) { let a = src; for (let pass = 0; pass < 2; pass++) { const t = new Float32Array(n * n), o = new Float32Array(n * n), w = [1, 4, 6, 4, 1];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0; for (let k = -2; k <= 2; k++) s += a[j * n + clamp(i + k, 0, n - 1)] * w[k + 2]; t[j * n + i] = s / 16; }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0; for (let k = -2; k <= 2; k++) s += t[clamp(j + k, 0, n - 1) * n + i] * w[k + 2]; o[j * n + i] = s / 16; } a = o; } return a; }
    const H0 = H.slice(), Hs = blur(H, N);                 // H0: untouched ground (water levels); Hs: smoothed ~3.5 m (road profile)
    const demAt = (X, Z) => gridAt(H0, N, STEP, HALF, X, Z), roadLevel = (X, Z) => gridAt(Hs, N, STEP, HALF, X, Z);
    M.roads.forEach((r, i) => { r.w = DT.widths[i] || r.w; });      // street widths measured in the lidar pavement map

    // ---------- roads: resample, give each point a smoothed level, press a flat bed into the terrain ----------
    progress('Grading 40 miles of streets', 0.12); await tick();
    const roadD = new Float32Array(N * N).fill(99), roadH = new Float32Array(N * N);
    function resample(p, maxStep) {
      const X = [], Z = [];
      for (let k = 0; k + 3 < p.length; k += 2) { const x0 = p[k], z0 = -p[k + 1], x1 = p[k + 2], z1 = -p[k + 3], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / maxStep)); for (let q = 0; q < n; q++) { X.push(x0 + (x1 - x0) * q / n); Z.push(z0 + (z1 - z0) * q / n); } }
      X.push(p[p.length - 2]); Z.push(-p[p.length - 1]);
      return { X: Float32Array.from(X), Z: Float32Array.from(Z) };
    }
    function levels(s, bridge) {
      const n = s.X.length, h = new Float32Array(n);
      for (let k = 0; k < n; k++) h[k] = roadLevel(s.X[k], s.Z[k]);
      if (bridge) { const w = 14, d = new Float32Array(n);      // fill the creek dip under bridges
        for (let k = 0; k < n; k++) { let m = -1e9; for (let q = Math.max(0, k - w); q <= Math.min(n - 1, k + w); q++) m = Math.max(m, h[q]); d[k] = m; }
        for (let k = 0; k < n; k++) { let m = 1e9; for (let q = Math.max(0, k - w); q <= Math.min(n - 1, k + w); q++) m = Math.min(m, d[q]); h[k] = m; } }
      return h;
    }
    // cap a road's grade at 12 %: approaches rise to meet an embankment (the lidar ramps over the railway were one or two samples
    // long, a 51 % wall). Samples past the drivable edge are not sources (the DEM is unreliable at its border).
    function capGrade(s) {
      const n = s.X.length, h = s.H, g = new Float32Array(n), d = (k) => 0.12 * Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]);
      for (let k = 0; k < n; k++) g[k] = Math.max(Math.abs(s.X[k]), Math.abs(s.Z[k])) < W.PLAY ? h[k] : -1e9;
      for (let k = 1; k < n; k++) g[k] = Math.max(g[k], g[k - 1] - d(k));
      for (let k = n - 2; k >= 0; k--) g[k] = Math.max(g[k], g[k + 1] - d(k + 1));
      for (let k = 0; k < n; k++) h[k] = Math.max(h[k], g[k]);
    }
    function stamp(s, hw) {
      const R = hw + 20;
      for (let k = 0; k < s.X.length; k++) {
        const x = s.X[k], z = s.Z[k], h = s.H[k];
        const i0 = Math.max(0, Math.ceil((x - R + HALF) / STEP)), i1 = Math.min(N - 1, Math.floor((x + R + HALF) / STEP));
        const j0 = Math.max(0, Math.ceil((z - R + HALF) / STEP)), j1 = Math.min(N - 1, Math.floor((z + R + HALF) / STEP));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(-HALF + i * STEP - x, -HALF + j * STEP - z) - hw, q = j * N + i; if (d < roadD[q]) { roadD[q] = d; roadH[q] = h; } }
      }
    }
    const LIFT = { primary: 0.09, secondary: 0.08, tertiary: 0.07, residential: 0.06, unclassified: 0.06, service: 0.05, unknown: 0.05, track: 0.04 };
    const roads = M.roads.map((r) => { const s = resample(r.p, 2.5); s.H = levels(s, r.b); if (r.c !== 'track') capGrade(s); s.hw = r.w / 2; s.cls = r.c; s.name = r.n; s.gravel = r.g; s.lift = LIFT[r.c]; stamp(s, s.hw); return s; });
    const rails = M.rails.map((p) => { const s = resample(p, 2.5); s.H = levels(s, true); s.hw = 1.7; stamp(s, s.hw); return s; });
    const lots = M.areas.filter((a) => a.k === 'parking');

    // ---------- surface mask (2 m): 0 grass, 1 asphalt, 2 gravel, 3 water, 4 building ----------
    const mask = new Uint8Array(MS * MS);
    {
      const c = document.createElement('canvas'); c.width = c.height = MS; const g = c.getContext('2d', { willReadFrequently: true });
      const path = (p) => { g.beginPath(); for (let k = 0; k < p.length; k += 2) g[k ? 'lineTo' : 'moveTo']((p[k] + HALF) / 2, (-p[k + 1] + HALF) / 2); };
      g.fillStyle = '#000'; g.fillRect(0, 0, MS, MS); g.lineCap = g.lineJoin = 'round';
      g.fillStyle = '#00f'; for (const w of M.water) { path(w.p); g.closePath(); g.fill(); g.fillStyle = '#000'; for (const h of w.holes) { path(h); g.closePath(); g.fill(); } g.fillStyle = '#00f'; }
      g.strokeStyle = '#0f0'; g.lineWidth = 1.7; for (const p of M.rails) { path(p); g.stroke(); }
      for (const r of M.roads) if (r.g) { g.lineWidth = r.w / 2; path(r.p); g.stroke(); }
      g.strokeStyle = g.fillStyle = '#f00'; for (const r of M.roads) if (!r.g) { g.lineWidth = r.w / 2; path(r.p); g.stroke(); }
      let d = g.getImageData(0, 0, MS, MS).data;
      for (let k = 0; k < MS * MS; k++) mask[k] = d[4 * k] > 110 ? 1 : d[4 * k + 1] > 110 ? 2 : d[4 * k + 2] > 110 ? 3 : 0;
      g.fillStyle = '#000'; g.fillRect(0, 0, MS, MS); g.fillStyle = '#fff'; for (const b of M.buildings) { path(b.p); g.closePath(); g.fill(); }
      d = g.getImageData(0, 0, MS, MS).data;
      for (let k = 0; k < MS * MS; k++) if (d[4 * k] > 110 && mask[k] === 0) mask[k] = 4;
      // real pavement seen by the lidar (driveways, lots, alleys) grips like asphalt too
      const gh = DT.ground.half, o = (HALF - gh) / 2;
      g.fillStyle = '#000'; g.fillRect(0, 0, MS, MS); g.drawImage(gimg, o, o, gh, gh); d = g.getImageData(0, 0, MS, MS).data;
      for (let k = 0; k < MS * MS; k++) if (d[4 * k] > 127 && mask[k] === 0) mask[k] = 5;
    }
    const maskAt = (X, Z) => mask[clamp((Z + HALF) >> 1, 0, MS - 1) * MS + clamp((X + HALF) >> 1, 0, MS - 1)];
    W.surface = (X, Z) => { const m = maskAt(X, Z); return m === 4 ? 0 : m === 5 ? 1 : m; };
    const openAt = (X, Z) => { const m = maskAt(X, Z); return m === 0 || m === 5; };      // not roadway, water or building
    W.inBuilding = (X, Z) => maskAt(X, Z) === 4;
    W.maskAt = maskAt;                                   // raw 2 m mask: 0 grass, 1 roadway, 2 gravel, 3 water, 4 building, 5 pavement off the road (lots, driveways, sidewalks)

    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i, d = roadD[q];
      if (d < 9.6) H[q] += (roadH[q] - H[q]) * (d <= 3.6 ? 1 : 1 - sstep((d - 3.6) / 6));
      else if (maskAt(-HALF + i * STEP, -HALF + j * STEP) === 3) H[q] -= 1.6;       // river and pond beds sit below the water sheet
    }
    // exact height of the rendered terrain triangles (physics and props use the same surface)
    W.heightXZ = function (X, Z) {
      const fx = clamp((X + HALF) / STEP, 0, N - 1.0001), fz = clamp((Z + HALF) / STEP, 0, N - 1.0001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * N + i;
      return u + v <= 1 ? H[k] + (H[k + 1] - H[k]) * u + (H[k + N] - H[k]) * v : H[k + N + 1] + (H[k + N] - H[k + N + 1]) * (1 - u) + (H[k + 1] - H[k + N + 1]) * (1 - v);
    };
    const hAt = W.heightXZ;

    // ---------- terrain ----------
    progress('Laying out the hills and river bottoms', 0.24); await tick();
    const cover = b64u8(M.cover);
    const coverAt = (X, Z) => cover[clamp(Math.round((Z + HALF) / 10), 0, DN - 1) * DN + clamp(Math.round((X + HALF) / 10), 0, DN - 1)];
    const PAL = { 10: lin(0x7a5a30), 30: lin(0x74893d), 40: lin(0xb89a56), 50: lin(0x78903f), 60: lin(0x9a8a70), 80: lin(0x4a4a38), 90: lin(0x6a7a45) };
    const leafA = lin(0xa8682a), dry = lin(0x9a9648), soil = lin(0x8a6a42), gold = lin(0xc9a546), shoulder = lin(0x8f8672);
    const tc = new T.Color();
    function groundColor(X, Z, d, cov) {      // cov: optional land-cover lookup (routes.js passes its corridor strips')
      const cls = (cov || coverAt)(X + (hash2(X | 0, Z | 0) - 0.5) * 9, Z + (hash2(Z | 0, X | 0) - 0.5) * 9);
      tc.copy(PAL[cls] || PAL[30]);
      const n1 = vnoise(X / 55, Z / 55), n2 = vnoise(X / 9 + 40, Z / 9);
      if (cls === 10) tc.lerp(leafA, n2 * 0.75);
      else if (cls === 40) tc.lerp(n1 > 0.5 ? gold : soil, Math.abs(n1 - 0.5) * 1.3 + (Math.sin((X * 0.8 + Z * 0.6) * 0.9) > 0.3 ? 0.08 : 0));
      else tc.lerp(dry, n1 * 0.55).lerp(leafA, Math.max(0, n2 - 0.62) * 1.2);
      if (d < 3.5) tc.lerp(shoulder, 0.75 * (1 - sstep((d - 0.5) / 3)));
      tc.multiplyScalar((0.9 + n2 * 0.25) * 1.18);
      return tc;
    }
    const detailTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
      const r = mulberry(7);
      for (let k = 0; k < 9000; k++) { const v = 150 + r() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
      const leaf = ['#f2a23a', '#e8c14a', '#d9632a', '#c4402c', '#f0d070'];
      for (let k = 0; k < 2600; k++) { g.fillStyle = leaf[r() * leaf.length | 0]; g.globalAlpha = 0.5 + r() * 0.4; g.beginPath(); g.ellipse(r() * w, r() * h, 1.2 + r() * 1.6, 0.8 + r(), r() * 3, 0, 7); g.fill(); }
    }, true);
    const terrainMat = new T.MeshLambertMaterial({ vertexColors: true, map: detailTex });
    // the lidar ground map is laid over the whole terrain: R = paved amount, G = shade (asphalt..concrete, or lawn/field brightness)
    let gsrc = gimg;
    if (opts.small) { gsrc = document.createElement('canvas'); gsrc.width = gsrc.height = 2048; gsrc.getContext('2d').drawImage(gimg, 0, 0, 2048, 2048); }   // phones: quarter the texture memory
    const groundTex = new T.Texture(gsrc); groundTex.flipY = false; groundTex.format = T.RGBFormat; groundTex.anisotropy = 4; groundTex.needsUpdate = true;
    terrainMat.onBeforeCompile = (sh) => {
      const gh = DT.ground.half.toFixed(1);
      sh.uniforms.groundMap = { value: groundTex };
      sh.vertexShader = 'varying vec2 vGround;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGround = (position.xz + ' + gh + ') / (2.0 * ' + gh + ');');
      sh.fragmentShader = 'uniform sampler2D groundMap;\nvarying vec2 vGround;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  vec4 gt = texture2D(groundMap, vGround);
  float inMap = step(0.0, vGround.x) * step(vGround.x, 1.0) * step(0.0, vGround.y) * step(vGround.y, 1.0);
  vec3 pav = mix(vec3(0.028, 0.028, 0.030), vec3(0.085, 0.084, 0.082), smoothstep(0.0, 0.8, gt.g));      // fresh to weathered asphalt
  pav = mix(pav, vec3(0.25, 0.245, 0.23), smoothstep(0.86, 1.0, gt.g)) * (0.8 + 0.4 * texture2D(map, vUv).g);   // concrete
  diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, 0.7 + 0.55 * gt.g, inMap), pav, smoothstep(0.35, 0.65, gt.r) * inMap);   // crisp kerb-like edges, not 1 m bilinear ramps`);
    };
    // each 260 m chunk exists at 5, 10 and 20 m spacing; the 2.5 m level is built on demand for the chunks around the camera.
    // The coarse levels sit flat for a few metres either side of a road so they never poke through the road ribbons
    const CS = 104; W.terrainChunks = [];
    function chunkGeo(i0, j0, i1, j1, st) {
      const w = (i1 - i0) / st + 1, h = (j1 - j0) / st + 1;
      const pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2), idx = new Uint16Array((w - 1) * (h - 1) * 6);
      let p = 0, t = 0;
      for (let j = j0; j <= j1; j += st) for (let i = i0; i <= i1; i += st, p++) {
        const q = j * N + i, X = -HALF + i * STEP, Z = -HALF + j * STEP;
        pos[3 * p] = X; pos[3 * p + 1] = st > 1 && roadD[q] < 12 ? roadH[q] : H[q]; pos[3 * p + 2] = Z;
        const nx = (H[j * N + Math.max(0, i - 1)] - H[j * N + Math.min(N - 1, i + 1)]) / (2 * STEP), nz = (H[Math.max(0, j - 1) * N + i] - H[Math.min(N - 1, j + 1) * N + i]) / (2 * STEP), il = 1 / Math.hypot(nx, 1, nz);
        nor[3 * p] = nx * il; nor[3 * p + 1] = il; nor[3 * p + 2] = nz * il;
        const c = groundColor(X, Z, roadD[q]); col[3 * p] = c.r; col[3 * p + 1] = c.g; col[3 * p + 2] = c.b;
        uv[2 * p] = X / 14; uv[2 * p + 1] = Z / 14;
      }
      for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i; idx[t++] = a; idx[t++] = a + w; idx[t++] = a + 1; idx[t++] = a + 1; idx[t++] = a + w; idx[t++] = a + w + 1; }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(new T.BufferAttribute(idx, 1));
      return g;
    }
    const chunkMesh = (c, st) => { const m = new T.Mesh(chunkGeo(c.i0, c.j0, c.i1, c.j1, st), terrainMat); m.receiveShadow = true; m.visible = false; scene.add(m); return m; };
    for (let j0 = 0; j0 < N - 1; j0 += CS) for (let i0 = 0; i0 < N - 1; i0 += CS) {
      const c = { i0, j0, i1: Math.min(N - 1, i0 + CS), j1: Math.min(N - 1, j0 + CS) };
      c.x0 = -HALF + c.i0 * STEP; c.x1 = -HALF + c.i1 * STEP; c.z0 = -HALF + c.j0 * STEP; c.z1 = -HALF + c.j1 * STEP;
      c.lods = [null, chunkMesh(c, 2), chunkMesh(c, 4), chunkMesh(c, 8)];
      W.terrainChunks.push(c);
    }

    // ---------- horizon terrain (14 km across, real hills) ----------
    const farGround = { fc: b64u8(M.farcover), n: M.far.n, st: M.far.step, fhalf: M.far.half, g: new Float32Array(M.far.n * M.far.n) };   // ground under the edge woods
    {
      const fh = b64u16(M.far.d), { fc, n, st, fhalf } = farGround, b = Buf();
      const pal = { 30: lin(0x7c8c44), 40: lin(0xb39757), 50: lin(0x80904a), 60: lin(0x9a8a70), 80: lin(0x4f6a78), 90: lin(0x6a7a45) };
      const wood = lin(0x8a5a2e), woodB = lin(0x76683a);      // far woods: one muted rust-brown, smooth patches (per-vertex random striped at this step)
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const X = -fhalf + i * st, Z = -fhalf + j * st, cls = fc[j * n + i], inside = Math.abs(X) < HALF - 1 && Math.abs(Z) < HALF - 1, edge = Math.abs(X) <= HALF && Math.abs(Z) <= HALF;
        let y = fh[j * n + i] + (cls === 10 ? 9 * clamp((Math.max(Math.abs(X), Math.abs(Z)) - HALF) / 180, 0, 1) : 0);   // canopy stand-in fades in past the edge
        if (inside) y = Math.min(y, hAt(X, Z)) - 5; else if (edge) y = hAt(X, Z);
        farGround.g[j * n + i] = edge ? hAt(X, Z) : fh[j * n + i];
        b.pos.push(X, y, Z);
        const c = (cls === 10 ? tc.copy(wood).lerp(woodB, vnoise(X / 700, Z / 700) * 0.7) : tc.copy(pal[cls] || pal[30])).multiplyScalar(0.85 + 0.2 * vnoise(X / 260 + 7, Z / 260));
        b.col.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const X = -fhalf + i * st, Z = -fhalf + j * st;
        if (X >= -HALF + 50 && X + st <= HALF - 50 && Z >= -HALF + 50 && Z + st <= HALF - 50) continue;
        const a = j * n + i; b.idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
      const m = new T.Mesh(bufGeo(b), new T.MeshLambertMaterial({ vertexColors: true })); scene.add(m); W.farMesh = m;      // routes.js swaps in a copy sunk under its corridor strips
    }

    // ---------- road surfaces ----------
    progress('Paving Main Street', 0.36); await tick();
    const roadTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); const r = mulberry(3); for (let k = 0; k < 7000; k++) { const v = 170 + r() * 80 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } g.strokeStyle = 'rgba(90,90,90,0.5)'; for (let k = 0; k < 14; k++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let q = 0; q < 6; q++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } }, true);
    const RC = 64, RN = Math.ceil(2 * HALF / RC), roadCells = Array.from({ length: RN * RN }, () => []);
    roads.forEach((s, ri) => { if (s.cls === 'track' || s.hw < 2) return; for (let k = 0; k < s.X.length; k += 2) roadCells[clamp((s.Z[k] + HALF) / RC | 0, 0, RN - 1) * RN + clamp((s.X[k] + HALF) / RC | 0, 0, RN - 1)].push(ri, k); });
    const segD = (x, z, o, q) => { const r = Math.min(o.X.length - 1, q + 2), ax = o.X[q], az = o.Z[q], dx = o.X[r] - ax, dz = o.Z[r] - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
    // junction gaps in the paint: centre lines stop at the crossing street's stop bar / crosswalk (its hw + 4.5 m, as streets.js
    // sets them back), edge lines open across a side street's mouth. Returns [centre, left edge, right edge] cut flags per sample.
    function gaps(s) {
      const n = s.X.length, cut = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)], e = s.hw - 0.3;
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, k - 1), c = Math.min(n - 1, k + 1); let tx = s.X[c] - s.X[a], tz = s.Z[c] - s.Z[a]; const il = 1 / (Math.hypot(tx, tz) || 1); tx *= il; tz *= il;
        const x = s.X[k], z = s.Z[k], ci = clamp((x + HALF) / RC | 0, 0, RN - 1), cj = clamp((z + HALF) / RC | 0, 0, RN - 1);
        for (let j = Math.max(0, cj - 1); j <= Math.min(RN - 1, cj + 1); j++) for (let i = Math.max(0, ci - 1); i <= Math.min(RN - 1, ci + 1); i++) {
          const L = roadCells[j * RN + i];
          for (let p = 0; p < L.length; p += 2) {
            const o = roads[L[p]], q = L[p + 1]; if (o === s || Math.abs(o.H[q] - s.H[k]) > 3) continue;
            const r = Math.min(o.X.length - 1, q + 2), ol = Math.hypot(o.X[r] - o.X[q], o.Z[r] - o.Z[q]) || 1;
            const cs = Math.abs((o.X[r] - o.X[q]) * tx + (o.Z[r] - o.Z[q]) * tz) / ol, sn = Math.sqrt(1 - cs * cs); if (cs > 0.9) continue;      // continuation of the same street, or a parallel lane
            const dc = segD(x, z, o, q); if (dc > o.hw + s.hw + 5) continue;
            if (o.cls !== 'service' && dc < o.hw + s.hw * cs + 4.5 * sn) cut[0][k] = 1;                               // driveways and lot entrances do not break the centre line
            for (let side = 1; side < 3; side++) { const l = side === 1 ? e : -e, dp = segD(x + tz * l, z - tx * l, o, q); if (dp < o.hw + 1.5 && dp < dc + 1) cut[side][k] = 1; }
          }
        }
      }
      return cut;
    }
    const rb = Buf(), mb = Buf();
    // flat ribbon along a sampled line. off = lateral offset (left +); dash = [on, period] metres; cut = per-sample gap flags
    function ribbon(b, s, hw, lift, col, off, dash, cut) {
      const n = s.X.length; let base = -1, run = 0;
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, k - 1), c = Math.min(n - 1, k + 1); let tx = s.X[c] - s.X[a], tz = s.Z[c] - s.Z[a]; const il = 1 / (Math.hypot(tx, tz) || 1); tx *= il; tz *= il;
        if (k) run += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]);
        if ((dash && run % dash[1] > dash[0]) || (cut && cut[k])) { base = -1; continue; }
        const lx = tz, lz = -tx, cx = s.X[k] + lx * off, cz = s.Z[k] + lz * off, y = s.H[k] + lift, v = b.pos.length / 3;
        b.pos.push(cx + lx * hw, y, cz + lz * hw, cx - lx * hw, y, cz - lz * hw); b.nor.push(0, 1, 0, 0, 1, 0);
        b.col.push(col.r, col.g, col.b, col.r, col.g, col.b); b.uv.push((cx + lx * hw) / 7, (cz + lz * hw) / 7, (cx - lx * hw) / 7, (cz - lz * hw) / 7);
        if (base >= 0) b.idx.push(base, base + 1, v, base + 1, v + 1, v);
        base = v;
      }
    }
    function disc(b, x, y, z, r, col) { const v = b.pos.length / 3; b.pos.push(x, y, z); b.nor.push(0, 1, 0); b.col.push(col.r, col.g, col.b); b.uv.push(x / 7, z / 7); for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; b.pos.push(px, y, pz); b.nor.push(0, 1, 0); b.col.push(col.r, col.g, col.b); b.uv.push(px / 7, pz / 7); if (k) b.idx.push(v, v + k + 1, v + k); } }
    const asphalt = { primary: lin(0x38383b), secondary: lin(0x3d3d40), tertiary: lin(0x434346), residential: lin(0x4b4b4d), unclassified: lin(0x4d4c4b), service: lin(0x565553), unknown: lin(0x565553), track: lin(0x565553) };
    const gravelC = lin(0x9a9080), yellow = lin(0xd9a514), white = lin(0xd8d8d2);
    for (const s of roads) {
      const col = s.gravel ? gravelC : asphalt[s.cls], n = s.X.length;
      ribbon(rb, s, s.hw, s.lift, col, 0);
      disc(rb, s.X[0], s.H[0] + s.lift, s.Z[0], s.hw, col); disc(rb, s.X[n - 1], s.H[n - 1] + s.lift, s.Z[n - 1], s.hw, col);
      if (s.cls === 'primary' || s.cls === 'secondary') { const g = gaps(s); ribbon(mb, s, 0.06, s.lift + 0.02, yellow, 0.13, 0, g[0]); ribbon(mb, s, 0.06, s.lift + 0.02, yellow, -0.13, 0, g[0]); ribbon(mb, s, 0.06, s.lift + 0.02, white, s.hw - 0.3, 0, g[1]); ribbon(mb, s, 0.06, s.lift + 0.02, white, -s.hw + 0.3, 0, g[2]); }
      else if (s.cls === 'tertiary') ribbon(mb, s, 0.06, s.lift + 0.02, yellow, 0, [3, 12], gaps(s)[0]);
    }
    const roadMat = new T.MeshLambertMaterial({ vertexColors: true, map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const roadMesh = new T.Mesh(bufGeo(rb), roadMat); roadMesh.receiveShadow = true; scene.add(roadMesh);
    const markMesh = new T.Mesh(bufGeo(mb), new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); markMesh.receiveShadow = true; scene.add(markMesh);
    W.kit = { terrainMat, roadMat, markMat: markMesh.material, ribbon, disc, groundColor, fallColor, LIFT, asphalt, gravelC, yellow, white };   // shared with routes.js (corridors out of town)
    {  // railroad
      const b = Buf(), tex = canvasTex(64, 64, (g) => { g.fillStyle = '#8a8378'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4a3a2c'; g.fillRect(6, 4, 52, 12); g.fillRect(6, 36, 52, 12); g.fillStyle = '#b9b9bd'; g.fillRect(17, 0, 3, 64); g.fillRect(44, 0, 3, 64); }, true);
      for (const s of rails) { let run = 0; for (let k = 0; k < s.X.length; k++) { const a = Math.max(0, k - 1), c = Math.min(s.X.length - 1, k + 1); let tx = s.X[c] - s.X[a], tz = s.Z[c] - s.Z[a]; const il = 1 / (Math.hypot(tx, tz) || 1); tx *= il; tz *= il; if (k) run += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]); const v = b.pos.length / 3, y = s.H[k] + 0.13; b.pos.push(s.X[k] + tz * 1.7, y, s.Z[k] - tx * 1.7, s.X[k] - tz * 1.7, y, s.Z[k] + tx * 1.7); b.nor.push(0, 1, 0, 0, 1, 0); b.uv.push(0, run / 1.1, 1, run / 1.1); if (k) b.idx.push(v - 2, v - 1, v, v - 1, v + 1, v); } }
      const m = new T.Mesh(bufGeo(b), new T.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); m.receiveShadow = true; scene.add(m);
    }

    // ---------- water ----------
    {
      const b = Buf();
      for (const w of M.water) {
        const ring = [], holes = w.holes.map((h) => { const o = []; for (let k = 0; k < h.length; k += 2) o.push(new T.Vector2(h[k], -h[k + 1])); return o; });
        for (let k = 0; k < w.p.length; k += 2) ring.push(new T.Vector2(w.p[k], -w.p[k + 1]));
        const all = ring.concat(...holes), v0 = b.pos.length / 3;
        let lvl = 1e9; for (const p of ring) lvl = Math.min(lvl, demAt(p.x, p.y));
        for (const p of all) { b.pos.push(p.x, Math.min(demAt(p.x, p.y), lvl + 1.2) + 0.3, p.y); b.nor.push(0, 1, 0); }
        for (const f of T.ShapeUtils.triangulateShape(ring, holes)) { const a = all[f[0]], c = all[f[1]], d = all[f[2]]; const up = (c.y - a.y) * (d.x - a.x) - (c.x - a.x) * (d.y - a.y) > 0; b.idx.push(v0 + f[0], v0 + (up ? f[1] : f[2]), v0 + (up ? f[2] : f[1])); }
      }
      for (const c of M.creeks) { const s = resample(c.p, 6); s.H = new Float32Array(s.X.length); for (let k = 0; k < s.X.length; k++) s.H[k] = hAt(s.X[k], s.Z[k]); const q = Buf(); ribbon(q, s, 2.2, 0.12, white, 0); const o = b.pos.length / 3; b.pos.push(...q.pos); b.nor.push(...q.nor); for (const i of q.idx) b.idx.push(i + o); }
      const m = new T.Mesh(bufGeo(b), new T.MeshPhongMaterial({ color: lin(0x3f6672), specular: lin(0xfff0d0), shininess: 90, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); scene.add(m);
    }

    // ---------- buildings ----------
    progress('Raising 1,752 buildings to their measured heights', 0.46); await tick();
    B.buildBuildings({ scene, W, M, DT, hAt });       // buildings.js: walls, roofs, facade textures; fills W.buildings and W.walls

    // ---------- nearest-road lookup (snap, reset, street names) ----------
    W.roads = roads;
    W.nearestRoad = function (X, Z, maxD) {
      const ci = clamp((X + HALF) / RC | 0, 0, RN - 1), cj = clamp((Z + HALF) / RC | 0, 0, RN - 1), R = Math.ceil((maxD || 200) / RC); let best = null, bd = (maxD || 200) ** 2;
      for (let j = Math.max(0, cj - R); j <= Math.min(RN - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(RN - 1, ci + R); i++) { const c = roadCells[j * RN + i]; for (let q = 0; q < c.length; q += 2) { const s = roads[c[q]], k = c[q + 1], d = (s.X[k] - X) ** 2 + (s.Z[k] - Z) ** 2; if (d < bd) { bd = d; best = { s, k }; } } }
      if (!best) return null;
      const { s, k } = best, a = Math.max(0, k - 1), c = Math.min(s.X.length - 1, k + 1), il = 1 / (Math.hypot(s.X[c] - s.X[a], s.Z[c] - s.Z[a]) || 1);
      return { x: s.X[k], z: s.Z[k], tx: (s.X[c] - s.X[a]) * il, tz: (s.Z[c] - s.Z[a]) * il, name: s.name, hw: s.hw, d: Math.sqrt(bd), cls: s.cls };
    };

    // ---------- fall trees ----------
    progress('Planting 32,000 trees where they stand', 0.58); await tick();
    const trees = [], firs = [], edgeTrees = [];
    {
      // every tree the lidar found: position, height, crown radius, evergreen flag (6 bytes each)
      const tb = atob(DT.trees), clearAt = (X, Z) => openAt(X, Z) && openAt(X + 1.5, Z) && openAt(X - 1.5, Z) && openAt(X, Z + 1.5) && openAt(X, Z - 1.5);
      const i16 = (k) => { const v = tb.charCodeAt(k) | tb.charCodeAt(k + 1) << 8; return v > 32767 ? v - 65536 : v; };
      const NUDGE = [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [4, 4], [-4, 4], [4, -4], [-4, -4]];   // crowns overhang streets; trunks do not stand in them
      for (let k = 0; k < tb.length; k += 6) {
        const x = i16(k) / 2, z = -i16(k + 2) / 2, h = tb.charCodeAt(k + 4) / 4, cb = tb.charCodeAt(k + 5), cr = (cb & 127) / 8, ever = cb > 127;
        if (Math.abs(x) > HALF - 12 || Math.abs(z) > HALF - 12) continue;
        const n = NUDGE.find((o) => clearAt(x + o[0], z + o[1])); if (!n) continue;
        const X = x + n[0], Z = z + n[1];
        (ever ? firs : trees).push({ X, Z, y: hAt(X, Z) - 0.3, sx: ever ? Math.max(3, cr * 1.7) : Math.max(3.5, cr * 2.2), sy: Math.max(4, h * 1.04), c: fallColor(rng, ever), rot: rng() * 6.28 });
        W.obstacles.push(X, Z, 0.45);
      }
      {   // a few rows of woods past the map edge on the horizon's forest cells, so the edge reads as woodland, not a bare slope
        const { fc, n, st, fhalf, g } = farGround, re = mulberry(5), gAt = (X, Z) => { const fx = (X + fhalf) / st, fz = (Z + fhalf) / st, i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, q = j * n + i; return (g[q] * (1 - u) + g[q + 1] * u) * (1 - v) + (g[q + n] * (1 - u) + g[q + n + 1] * u) * v; };
        for (let k = 0; k < 14000; k++) {
          const side = k & 3, along = (re() - 0.5) * 2 * (HALF + 120), out = HALF - 10 + re() * 130, X = side < 2 ? along : side === 2 ? out : -out, Z = side < 2 ? (side ? out : -out) : along;
          if (fc[Math.round((Z + fhalf) / st) * n + Math.round((X + fhalf) / st)] !== 10 || W.nearestRoad(clamp(X, -HALF, HALF), clamp(Z, -HALF, HALF), 14)) continue;      // roads leave the map through a gap
          const inMap = Math.max(Math.abs(X), Math.abs(Z)) <= HALF; if (inMap && !openAt(X, Z)) continue;
          edgeTrees.push({ X, Z, y: (inMap ? hAt(X, Z) : gAt(X, Z)) - 0.5, sx: 7 + re() * 5, sy: 13 + re() * 9, c: fallColor(re, false), rot: re() * 6.28 });
        }
      }
      // Crowns are clusters of leaf cards (one alpha-cut leaf texture) round a dark core: leafy silhouettes and dappled
      // shadows for fewer triangles than a faceted blob. Normals point out from the crown centre so the whole crown shades as one.
      const leafTex = canvasTex(512, 512, (g) => {
        const r = mulberry(77); g.fillStyle = '#909090'; g.beginPath(); g.arc(256, 256, 50, 0, 7); g.fill();
        for (let k = 0; k < 3000; k++) {
          const a = r() * 6.283, d = Math.pow(r(), 0.75) * 236, s = 5 + r() * 5, v = 150 + r() * 105 | 0;
          g.save(); g.translate(256 + Math.cos(a) * d, 256 + Math.sin(a) * d); g.rotate(r() * 6.283);
          g.fillStyle = 'rgb(' + v + ',' + (v * (0.9 + r() * 0.1) | 0) + ',' + (v * (0.78 + r() * 0.2) | 0) + ')';
          g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.7, s, 0); g.quadraticCurveTo(0, s * 0.7, -s, 0); g.fill(); g.restore();
        }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(256, 256, 5, 0, 7); g.fill();      // the core and the trunk sample this opaque white spot
      });
      const CY = 0.7, RY = 0.36;      // unit tree: 1 tall, crown 1 wide, crown centre at 0.7
      function treeGeo(cards, half, coreK, coreShade, sides, seed) {
        const r = mulberry(seed), b = Buf(), put = (x, y, z, nx, ny, nz, cr, cg, cb, u, v) => { b.pos.push(x, y, z); b.nor.push(nx, ny, nz); b.col.push(cr, cg, cb); b.uv.push(u, v); b.idx.push(b.idx.length); };
        const leaf = (x, y, z, u, v, k) => { const ny = (y - CY) * 1.9, il = 1 / (Math.hypot(x, ny, z) || 1), c = k * Math.max(0.42, 0.5 + (y - 0.34) * 0.85); put(x, y, z, x * il, ny * il, z * il, c, c, c, u, v); };
        const ico = new T.IcosahedronGeometry(0.5 * coreK, 0), ip = (ico.index ? ico.toNonIndexed() : ico).attributes.position;
        for (let k = 0; k < ip.count; k++) leaf(ip.getX(k), ip.getY(k) * 0.72 + CY, ip.getZ(k), 0.5, 0.5, coreShade);
        const tr = new T.CylinderGeometry(0.022, 0.04, 0.56, sides, 1, true).translate(0, 0.28, 0).toNonIndexed(), tp = tr.attributes.position, tn = tr.attributes.normal;
        for (let k = 0; k < tp.count; k++) put(tp.getX(k), tp.getY(k), tp.getZ(k), tn.getX(k), tn.getY(k), tn.getZ(k), 0.05, 0.036, 0.027, 0.5, 0.5);
        for (let k = 0; k < cards; k++) {
          const yy = 1 - (k + 0.5) / cards * 1.75, rr = Math.sqrt(1 - yy * yy), ph = k * 2.39996 + r() * 0.6, dx = rr * Math.cos(ph), dz = rr * Math.sin(ph);   // Fibonacci shell, open underneath
          const cx = dx * 0.35, cy = CY + yy * RY * 0.7, cz = dz * 0.35;
          let nx = dx + (r() - 0.5) * 1.3, ny = yy + (r() - 0.5) * 1.3, nz = dz + (r() - 0.5) * 1.3; const nl = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= nl; ny *= nl; nz *= nl;
          let ux = -nz, uy = 0, uz = nx; if (Math.abs(ny) > 0.95) { ux = 0; uy = nz; uz = -ny; } const ul = 1 / Math.hypot(ux, uy, uz); ux *= ul; uy *= ul; uz *= ul;
          const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux, a = r() * 6.283, ca = Math.cos(a) * half, sa = Math.sin(a) * half;
          const ax = ux * ca + vx * sa, ay = uy * ca + vy * sa, az = uz * ca + vz * sa, bx = vx * ca - ux * sa, by = vy * ca - uy * sa, bz = vz * ca - uz * sa;
          const q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
          for (const [s, t] of q) leaf(cx + ax * s + bx * t, cy + ay * s + by * t, cz + az * s + bz * t, s * 0.5 + 0.5, t * 0.5 + 0.5, 1);
        }
        return bufGeo(b);
      }
      const nearG = treeGeo(14, 0.3, 0.7, 0.36, 5, 11), farG = treeGeo(10, 0.42, 0.6, 0.3, 3, 12);   // far: more, larger cards round a small dark core, so the silhouette stays leafy
      const wind = W.wind = { value: 0 };
      const sway = (sh) => {      // crowns sway in the breeze: more at the top, each tree out of phase
        sh.uniforms.uWind = wind;
        sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23, sw = transformed.y * transformed.y * 0.02;
    transformed.x += sin(uWind * 1.7 + ph) * sw; transformed.z += cos(uWind * 1.3 + ph * 1.7) * sw;
  #endif`);
      };
      const leafMat = new T.MeshLambertMaterial({ vertexColors: true, map: leafTex, alphaTest: 0.5, side: T.DoubleSide });
      const leafy = leafMat.onBeforeCompile = (sh) => {      // leaves: light wraps round the crown (thin leaves glow when backlit) and both faces of a card are lit alike
        sway(sh);
        sh.vertexShader = sh.vertexShader.replace('#include <lights_lambert_vertex>', T.ShaderChunk.lights_lambert_vertex.replace(/saturate\( dotNL \)/g, 'saturate( dotNL * 0.5 + 0.5 )'))
          .replace('#include <project_vertex>', '#include <project_vertex>\n  if (uv == vec2(0.5) && color.b >= 0.1) vColor.xyz *= 0.3 + 0.7 * abs(dot(normalize(transformedNormal), normalize(mvPosition.xyz)));   // the core darkens toward its rim, hiding its facets in the crown')
          .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  if ( color.b < 0.1 ) vColor.xyz = color.xyz;      // bark keeps its own colour\n#endif');
        sh.fragmentShader = sh.fragmentShader.replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront').replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront');
      };
      const leafDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
      const TC = 24, cs = 2 * HALF / TC, groups = Array.from({ length: TC * TC }, () => []);
      for (const t of trees.concat(edgeTrees)) groups[clamp((t.Z + HALF) / cs | 0, 0, TC - 1) * TC + clamp((t.X + HALF) / cs | 0, 0, TC - 1)].push(t);
      const dummy = new T.Object3D(); W.treeChunks = [];
      groups.forEach((list, gi) => {
        if (!list.length) return;
        for (let k = list.length - 1; k > 0; k--) { const q = rng() * (k + 1) | 0, t = list[k]; list[k] = list[q]; list[q] = t; }
        const cx = -HALF + (gi % TC + 0.5) * cs, cz = -HALF + ((gi / TC | 0) + 0.5) * cs; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const t of list) { lo[0] = Math.min(lo[0], t.X); hi[0] = Math.max(hi[0], t.X); lo[1] = Math.min(lo[1], t.y); hi[1] = Math.max(hi[1], t.y + t.sy); lo[2] = Math.min(lo[2], t.Z); hi[2] = Math.max(hi[2], t.Z); }
        const sphere = new T.Sphere(new T.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 18);   // edge chunks also hold the woods past the edge
        const mk = (base, shadow) => { const g = new T.BufferGeometry(); for (const k in base.attributes) g.setAttribute(k, base.attributes[k]); g.setIndex(base.index); g.boundingSphere = sphere; const m = new T.InstancedMesh(g, leafMat, list.length); m.customDepthMaterial = leafDepth; list.forEach((t, k) => { dummy.position.set(t.X, t.y, t.Z); dummy.scale.set(t.sx, t.sy, t.sx); dummy.rotation.set(0, t.rot, 0); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); m.setColorAt(k, t.c); }); m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = true; scene.add(m); return m; };   // r128 InstancedMesh turns culling off; the chunk sphere bounds it
        W.treeChunks.push({ cx, cz, hs: cs / 2, n: list.length, near: mk(nearG, true), far: mk(farG, false) });
      });
      {   // evergreens: tiers of drooping boughs (cones whose lower edge is an alpha-cut fringe), one instanced mesh for the whole map (a few hundred trees)
        const firTex = canvasTex(256, 128, (g) => {
          const r = mulberry(31); g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 256, 46);
          for (let k = 0; k < 150; k++) { const x = r() * 256, w = 5 + r() * 9, len = 55 + r() * 73, tip = (r() - 0.5) * 8, v = 120 + r() * 135 | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; for (const o of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + o - w, 0); g.lineTo(x + o + w, 0); g.lineTo(x + o + tip, len); g.fill(); } }
        }, true); firTex.wrapT = T.ClampToEdgeWrapping;
        const b = Buf(), SEG = 9;      // c < 0 marks bark
        const vert = (x, y, z, nx, ny, nz, c, u, v) => { b.pos.push(x, y, z); b.nor.push(nx, ny, nz); if (c < 0) b.col.push(0.05, 0.036, 0.027); else b.col.push(c, c, c); b.uv.push(u, v); b.idx.push(b.idx.length); };
        for (let i = 0; i < 6; i++) {
          const y0 = 0.12 + i * 0.125, hh = 0.25, rr = 0.5 * Math.pow(1 - i / 6.2, 0.9), sl = 1 / Math.hypot(hh, rr);
          for (let q = 0; q < SEG; q++) {
            const a0 = (q + i * 0.5) / SEG * 6.2832, a1 = (q + 1 + i * 0.5) / SEG * 6.2832, am = (a0 + a1) / 2;
            vert(Math.cos(a0) * rr, y0, Math.sin(a0) * rr, Math.cos(a0) * hh * sl, rr * sl, Math.sin(a0) * hh * sl, 0.8, q * 3 / SEG, 0);
            vert(Math.cos(a1) * rr, y0, Math.sin(a1) * rr, Math.cos(a1) * hh * sl, rr * sl, Math.sin(a1) * hh * sl, 0.8, (q + 1) * 3 / SEG, 0);
            vert(0, y0 + hh, 0, Math.cos(am) * hh * sl, rr * sl, Math.sin(am) * hh * sl, 1, (q + 0.5) * 3 / SEG, 1);
          }
        }
        const tr = new T.CylinderGeometry(0.03, 0.045, 0.2, 5, 1, true).translate(0, 0.1, 0).toNonIndexed(), tp = tr.attributes.position, tn = tr.attributes.normal;
        for (let k = 0; k < tp.count; k++) vert(tp.getX(k), tp.getY(k), tp.getZ(k), tn.getX(k), tn.getY(k), tn.getZ(k), -1, 0.5, 0.92);
        const firMat = new T.MeshLambertMaterial({ vertexColors: true, map: firTex, alphaTest: 0.5, side: T.DoubleSide }); firMat.onBeforeCompile = leafy;
        const m = new T.InstancedMesh(bufGeo(b), firMat, firs.length); m.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: firTex, alphaTest: 0.5 });
        firs.forEach((t, k) => { dummy.position.set(t.X, t.y, t.Z); dummy.scale.set(t.sx, t.sy, t.sx); dummy.rotation.set(0, t.rot, 0); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); m.setColorAt(k, t.c); });
        m.castShadow = true; m.frustumCulled = false; scene.add(m); W.firMesh = m;
      }
      W.treeCount = trees.length + firs.length;
    }

    {  // leaves gather along the road edges wherever trees stand close by
      const cell = 24, gn = Math.ceil(2 * HALF / cell), near = new Uint8Array(gn * gn);
      for (const t of trees) { const q = clamp((t.Z + HALF) / cell | 0, 0, gn - 1) * gn + clamp((t.X + HALF) / cell | 0, 0, gn - 1); if (near[q] < 255) near[q]++; }
      const tex = canvasTex(128, 128, (g) => { const rn = mulberry(9), cols = ['#d9601a', '#e3a51d', '#b5261e', '#8a4b1f', '#f0c12b', '#c8501a']; for (let k = 0; k < 150; k++) { const a = rn() * 6.28, d = Math.pow(rn(), 0.7) * 56; g.fillStyle = cols[rn() * cols.length | 0]; g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2.2 + rn() * 2.6, 1.3 + rn() * 1.4, rn() * 3.14, 0, 7); g.fill(); } });
      const b = Buf(), rl = mulberry(4);
      for (const s of roads) { if (s.cls === 'track') continue;
        for (let k = 2; k < s.X.length - 2; k += 3) for (const side of [-1, 1]) {
          const q = clamp((s.Z[k] + HALF) / cell | 0, 0, gn - 1) * gn + clamp((s.X[k] + HALF) / cell | 0, 0, gn - 1); if (rl() > Math.min(0.6, near[q] * 0.12)) continue;
          let tx = s.X[k + 1] - s.X[k - 1], tz = s.Z[k + 1] - s.Z[k - 1]; const il = 1 / (Math.hypot(tx, tz) || 1); tx *= il; tz *= il;
          const off = side * (s.hw - 0.5 + rl() * 1.1), cx = s.X[k] + tz * off, cz = s.Z[k] - tx * off, y = s.H[k] + s.lift + 0.035, hl = 1.2 + rl() * 1.6, hw2 = 0.5 + rl() * 0.7, v = b.pos.length / 3, sh = 0.8 + rl() * 0.35;
          for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { b.pos.push(cx + tx * hl * a + tz * hw2 * c, y, cz + tz * hl * a - tx * hw2 * c); b.nor.push(0, 1, 0); b.col.push(sh, sh, sh); b.uv.push(a * 0.5 + 0.5, c * 0.5 + 0.5); }
          b.idx.push(v, v + 2, v + 1, v, v + 3, v + 2, v, v + 1, v + 2, v, v + 2, v + 3);     // both windings: orientation depends on the road's direction
        } }
      const m = new T.Mesh(bufGeo(b), new T.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 })); m.receiveShadow = true; scene.add(m);
    }

    // ---------- props: signs, festival, poles, bales ----------
    progress('Hanging Apple Festival banners', 0.74); await tick();
    const postMat = new T.MeshLambertMaterial({ color: lin(0x4a4038) }), steelMat = new T.MeshLambertMaterial({ color: lin(0x9a9da0) });
    const postBoxes = [];   // sign posts and backing boards, merged into one mesh below
    const box = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
    // double-sided sign board on posts; yaw = direction the front face looks toward
    function board(tex, w, h, X, Z, yaw, clear, posts) {
      const g = new T.Group(), y0 = hAt(X, Z), mat = new T.MeshLambertMaterial({ map: tex });
      const fg = new T.PlaneGeometry(w, h).translate(0, clear + h / 2, 0.06), kg = new T.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, clear + h / 2, -0.06), both = new T.BufferGeometry();
      for (const a of ['position', 'normal', 'uv']) { const n = fg.attributes[a].itemSize, arr = new Float32Array(8 * n); arr.set(fg.attributes[a].array); arr.set(kg.attributes[a].array, 4 * n); both.setAttribute(a, new T.BufferAttribute(arr, n)); }
      both.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]); g.add(new T.Mesh(both, mat));
      const c = Math.cos(yaw), s = Math.sin(yaw), put = (bw, bh, bd, lx, ly) => postBoxes.push([bw, bh, bd, X + c * lx, y0 + ly, Z - s * lx, yaw]);
      put(w + 0.16, h + 0.16, 0.08, 0, clear + h / 2);
      for (const px of posts) { put(0.16, clear + h, 0.16, px, (clear + h) / 2); W.obstacles.push(X + c * px, Z - s * px, 0.28); }
      g.position.set(X, y0, Z); g.rotation.y = yaw; scene.add(g); return g;
    }
    const apple = (g, x, y, r) => { g.fillStyle = '#c8202b'; g.beginPath(); g.arc(x - r * 0.28, y, r * 0.72, 0, 7); g.arc(x + r * 0.28, y, r * 0.72, 0, 7); g.fill(); g.fillStyle = '#5a3a22'; g.fillRect(x - r * 0.07, y - r * 1.05, r * 0.14, r * 0.5); g.fillStyle = '#4f8a2e'; g.beginPath(); g.ellipse(x + r * 0.38, y - r * 0.95, r * 0.36, r * 0.17, -0.5, 0, 7); g.fill(); };
    const bannerTex = canvasTex(1024, 160, (g, w, h) => { g.fillStyle = '#f6ead3'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8202b'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); apple(g, 70, 88, 44); apple(g, w - 70, 88, 44); g.fillStyle = '#7a1a1f'; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, 'BLOOMFIELD APPLE FESTIVAL', w - 300, 74, SIGN_FONT); g.fillText('BLOOMFIELD APPLE FESTIVAL', w / 2, 70); g.fillStyle = '#3a5a2a'; fit(g, 'ON THE COURTHOUSE SQUARE  ·  CIDER  ·  APPLE BUTTER  ·  PARADE', w - 60, 30, TEXT_FONT); g.fillText('ON THE COURTHOUSE SQUARE  ·  CIDER  ·  APPLE BUTTER  ·  PARADE', w / 2, 122); });
    const welcomeTex = canvasTex(768, 384, (g, w, h) => { g.fillStyle = '#2f4a36'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2c230'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28); g.textAlign = 'center'; g.fillStyle = '#f6ead3'; g.font = '44px ' + TEXT_FONT; g.fillText('WELCOME TO', w / 2, 84); g.font = '104px ' + SIGN_FONT; g.fillText('Bloomfield', w / 2, 184); g.fillStyle = '#f2c230'; g.font = '38px ' + TEXT_FONT; g.fillText('GREENE COUNTY, INDIANA', w / 2, 234); g.fillStyle = '#c8202b'; g.fillRect(60, 262, w - 120, 84); apple(g, 112, 308, 30); apple(g, w - 112, 308, 30); g.fillStyle = '#f6ead3'; g.font = '50px ' + SIGN_FONT; g.fillText('Apple Festival', w / 2, 322); });
    const bunt = Buf(), buntCols = [0xc8202b, 0xf2c230, 0xe58a1f, 0x4f8a2e, 0xf6ead3].map(lin);
    function bunting(ax, az, bx, bz, y) { const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 0.8), ux = (bx - ax) / L, uz = (bz - az) / L; for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 0.7) / n, um = (k + 0.35) / n, sag = (u) => y - 5 * u * (1 - u), c = buntCols[k % buntCols.length], v = bunt.pos.length / 3; bunt.pos.push(ax + ux * L * u0, sag(u0), az + uz * L * u0, ax + ux * L * u1, sag(u1), az + uz * L * u1, ax + ux * L * um, sag(um) - 0.65, az + uz * L * um); for (let q = 0; q < 3; q++) { bunt.col.push(c.r, c.g, c.b); bunt.nor.push(0, 1, 0); } bunt.idx.push(v, v + 1, v + 2); } }
    function streetBanner(X, Z) {   // banner strung across the nearest street
      const r = W.nearestRoad(X, Z, 60); if (!r) return; const lx = r.tz, lz = -r.tx, span = r.hw + 1.4, y0 = hAt(r.x, r.z), yaw = Math.atan2(r.tx, r.tz);
      for (const s of [-1, 1]) { const px = r.x + lx * span * s, pz = r.z + lz * span * s; scene.add(box(0.22, 7.4, 0.22, postMat, px, hAt(px, pz) + 3.7, pz)); W.obstacles.push(px, pz, 0.3); }
      const mat = new T.MeshLambertMaterial({ map: bannerTex }); for (const s of [0, Math.PI]) { const m = new T.Mesh(new T.PlaneGeometry(span * 2, span * 2 * 160 / 1024), mat); m.position.set(r.x, y0 + 6.3, r.z); m.rotation.y = yaw + s; scene.add(m); }
      bunting(r.x + lx * span + r.tx * 5, r.z + lz * span + r.tz * 5, r.x - lx * span + r.tx * 5, r.z - lz * span + r.tz * 5, y0 + 7.2); bunting(r.x + lx * span - r.tx * 5, r.z + lz * span - r.tz * 5, r.x - lx * span - r.tx * 5, r.z - lz * span - r.tz * 5, y0 + 7.2);
    }
    [[-78, -57], [82, -57], [50, 72], [-51, 72], [54, -95], [-51, -92]].forEach((p) => streetBanner(p[0], p[1]));
    // welcome signs where the highways enter town
    for (const s of roads) { if (s.cls !== 'primary' && s.cls !== 'secondary') continue; for (let k = 1; k < s.X.length; k++) { const d0 = Math.hypot(s.X[k - 1], s.Z[k - 1]), d1 = Math.hypot(s.X[k], s.Z[k]); if ((d0 - 1300) * (d1 - 1300) > 0) continue; const out = d1 > d0 ? 1 : -1, tx = (s.X[k] - s.X[k - 1]) * out, tz = (s.Z[k] - s.Z[k - 1]) * out, il = 1 / Math.hypot(tx, tz), ox = -tz * il, oz = tx * il; board(welcomeTex, 8, 4, s.X[k] + ox * (s.hw + 7), s.Z[k] + oz * (s.hw + 7), Math.atan2(tx, tz), 1.6, [-3, 3]); break; } }

    // courthouse square: booths, hay, pumpkins, the big apple
    {
      const cols = [0xc8202b, 0xf6ead3, 0xe58a1f, 0x4f8a2e, 0xf2c230].map(lin), spots = [];
      const free = (x, z) => [[0, 0], [2.4, 2.4], [-2.4, 2.4], [2.4, -2.4], [-2.4, -2.4]].every((o) => openAt(x + o[0], z + o[1]));
      for (let x = -36; x <= 36; x += 9) { if (Math.abs(x) > 10 && free(x, -45)) spots.push([x, -45, 0]); if (free(x, 32)) spots.push([x, 32, Math.PI]); }
      for (let z = -34; z <= 22; z += 9.3) { if (free(-38, z)) spots.push([-38, z, Math.PI / 2]); if (free(37, z)) spots.push([37, z, -Math.PI / 2]); }
      const canopy = new T.InstancedMesh(new T.ConeGeometry(2.7, 1.3, 4).rotateY(Math.PI / 4), new T.MeshLambertMaterial(), spots.length);
      const table = new T.InstancedMesh(new T.BoxGeometry(3, 0.9, 0.9), new T.MeshLambertMaterial({ color: lin(0x8a6a42) }), spots.length);
      const posts = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.05, 2.6, 5), steelMat, spots.length * 4), d = new T.Object3D();
      spots.forEach((s, k) => { const y = hAt(s[0], s[1]); d.rotation.set(0, s[2], 0); d.scale.set(1, 1, 1); d.position.set(s[0], y + 3.2, s[1]); d.updateMatrix(); canopy.setMatrixAt(k, d.matrix); canopy.setColorAt(k, cols[k % cols.length]); d.position.set(s[0], y + 0.45, s[1]); d.updateMatrix(); table.setMatrixAt(k, d.matrix); [[-1.8, -1.8], [1.8, -1.8], [1.8, 1.8], [-1.8, 1.8]].forEach((o, q) => { d.position.set(s[0] + o[0], y + 1.3, s[1] + o[1]); d.updateMatrix(); posts.setMatrixAt(k * 4 + q, d.matrix); }); W.obstacles.push(s[0], s[1], 2.2); });
      canopy.castShadow = true; scene.add(canopy, table, posts);
      W.booths = spots;                                    // festival booths: [X, Z, yaw] (front faces local -Z rotated by yaw)
      const hay = [], pump = [], r = mulberry(5);
      for (const c of [[-42, -50], [41, -50], [-42, 36], [41, 36], [7, -41], [-7, -41], [-60, -67], [60, -67], [22, -38], [-22, -38]].filter((q) => [[0, 0], [2, 2], [-2, 2], [2, -2], [-2, -2]].every((o) => openAt(q[0] + o[0], q[1] + o[1])))) { for (let k = 0; k < 4; k++) hay.push([c[0] + (r() - 0.5) * 3, c[1] + (r() - 0.5) * 3, r() * 3, k > 2 ? 0.55 : 0]); for (let k = 0; k < 12; k++) { const px = c[0] + (r() - 0.5) * 7, pz = c[1] + (r() - 0.5) * 7; if (openAt(px, pz)) pump.push([px, pz, 0.16 + r() * 0.17]); } W.obstacles.push(c[0], c[1], 1.6); }
      const hm = new T.InstancedMesh(new T.BoxGeometry(1.15, 0.5, 0.55), new T.MeshLambertMaterial({ color: lin(0xd2b45a) }), hay.length), pm = new T.InstancedMesh(new T.SphereGeometry(1, 9, 6), new T.MeshLambertMaterial({ color: lin(0xe5771c) }), pump.length);
      hay.forEach((h, k) => { d.position.set(h[0], hAt(h[0], h[1]) + 0.25 + h[3], h[1]); d.rotation.set(0, h[2], 0); d.scale.set(1, 1, 1); d.updateMatrix(); hm.setMatrixAt(k, d.matrix); });
      pump.forEach((p, k) => { d.position.set(p[0], hAt(p[0], p[1]) + p[2] * 0.7, p[1]); d.rotation.set(0, 0, 0); d.scale.set(p[2], p[2] * 0.78, p[2]); d.updateMatrix(); pm.setMatrixAt(k, d.matrix); });
      hm.castShadow = pm.castShadow = true; scene.add(hm, pm);
      // giant apple on the lawn facing Main Street
      const ax = 0, az = -44, ay = hAt(ax, az), g = new T.Group(); const red = new T.MeshPhongMaterial({ color: lin(0xc8202b), shininess: 60 });
      const body = new T.Mesh(new T.SphereGeometry(2.3, 20, 14), red); body.scale.y = 0.9; body.position.y = 3.3; body.castShadow = true;
      const stem = box(0.18, 1, 0.18, postMat, 0, 5.6, 0), leaf = new T.Mesh(new T.SphereGeometry(0.7, 8, 6), new T.MeshLambertMaterial({ color: lin(0x4f8a2e) })); leaf.scale.set(1, 0.18, 0.5); leaf.position.set(0.6, 5.8, 0); leaf.rotation.z = 0.4;
      g.add(body, stem, leaf, box(3.4, 1.3, 3.4, new T.MeshLambertMaterial({ color: lin(0xd2b45a) }), 0, 0.65, 0)); g.position.set(ax, ay, az); scene.add(g); W.obstacles.push(ax, az, 2.6);
    }
    // Ferris wheel on the lot east of the square
    {
      const X = 150, Z = 6, y = hAt(X, Z), g = new T.Group(), wheel = new T.Group(), R = 9, rimMat = new T.MeshLambertMaterial({ color: lin(0xf6ead3) }), cabCols = [0xc8202b, 0xf2c230, 0x4f8a2e, 0xe58a1f, 0x2f6fb0].map((c) => new T.MeshLambertMaterial({ color: lin(c) }));
      for (const z of [-0.7, 0.7]) { const rim = new T.Mesh(new T.TorusGeometry(R, 0.09, 5, 40), rimMat); rim.position.z = z; wheel.add(rim); }
      const cabs = [];
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, sp = box(R, 0.07, 0.07, rimMat, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a; sp.castShadow = false; wheel.add(sp); const cab = box(1.3, 1.1, 1.2, cabCols[k % 5], Math.cos(a) * R, Math.sin(a) * R - 0.7, 0); wheel.add(cab); cabs.push(cab); }
      wheel.position.y = R + 2.2; g.add(wheel);
      for (const z of [-1.1, 1.1]) for (const s of [-1, 1]) { const leg = box(0.25, R + 3, 0.25, steelMat, s * 2.6, (R + 2.2) / 2, z); leg.rotation.z = s * 0.24; g.add(leg); }
      g.position.set(X, y, Z); g.rotation.y = 0.5; scene.add(g); W.obstacles.push(X, Z, 3.6);
      W.animated.push((t) => { wheel.rotation.z = t * 0.25; for (const c of cabs) c.rotation.z = -wheel.rotation.z; });
    }
    scene.add(new T.Mesh(bufGeo(bunt), new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));

    // real place names on roadside signs
    {
      const kinds = [[/church|chapel|baptist/i, '#f4f1e8', '#1d2a3a'], [/school|library|courthouse|police|fire|park|pool|postal|legion/i, '#2f4a36', '#f6ead3'], [/bank/i, '#1d2f4f', '#f6ead3'], [/pizza|dairy|subway|cafe|china|casa|ribeye|bakery|feed store beer/i, '#b3261e', '#fff4d6'], [/./, '#f2c230', '#1b1a1c']];
      const placed = [];
      for (const p of M.places) {
        const X = p[0], Z = -p[1], r = W.nearestRoad(X, Z, 90); if (!r) continue;
        const side = ((X - r.x) * r.tz + (Z - r.z) * -r.tx) >= 0 ? 1 : -1, sx = r.x + r.tz * side * (r.hw + 3.6), sz = r.z - r.tx * side * (r.hw + 3.6);
        if (placed.some((q) => Math.hypot(q[0] - sx, q[1] - sz) < 11) || maskAt(sx, sz) === 4) continue; placed.push([sx, sz]);
        const k = kinds.find((q) => q[0].test(p[2])), words = p[2].split(' '), half = Math.ceil(words.length / 2), lines = p[2].length > 15 && words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [p[2]];
        const tex = canvasTex(384, 160, (g, w, h) => { g.fillStyle = k[1]; g.fillRect(0, 0, w, h); g.strokeStyle = k[2]; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = k[2]; g.textAlign = 'center'; g.textBaseline = 'middle'; const size = lines.length > 1 ? 54 : 66; lines.forEach((t, i) => { fit(g, t, w - 44, size, SIGN_FONT); g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 62); }); });
        board(tex, 3.4, 1.42, sx, sz, Math.atan2(r.tx, r.tz), 2.5, [0]);
      }
    }
    { const b = Buf(), m4 = new T.Matrix4(), v = new T.Vector3();
      for (const p of postBoxes) { const g = new T.BoxGeometry(p[0], p[1], p[2]), o = b.pos.length / 3; m4.makeRotationY(p[6]).setPosition(p[3], p[4], p[5]); for (let k = 0; k < g.attributes.position.count; k++) { v.fromBufferAttribute(g.attributes.position, k).applyMatrix4(m4); b.pos.push(v.x, v.y, v.z); v.fromBufferAttribute(g.attributes.normal, k).transformDirection(m4); b.nor.push(v.x, v.y, v.z); } for (const i of g.index.array) b.idx.push(i + o); }
      const m = new T.Mesh(bufGeo(b), postMat); m.castShadow = true; scene.add(m); }
    {  // utility poles
      const poles = M.poles.filter((p) => p[2] === 0), pm = new T.InstancedMesh(new T.CylinderGeometry(0.11, 0.15, 9, 6), postMat, poles.length), am = new T.InstancedMesh(new T.BoxGeometry(2.2, 0.12, 0.12), postMat, poles.length), d = new T.Object3D();
      poles.forEach((p, k) => { const X = p[0], Z = -p[1], y = hAt(X, Z); d.rotation.set(0, hash2(k, 3) * 3, 0); d.position.set(X, y + 4.5, Z); d.updateMatrix(); pm.setMatrixAt(k, d.matrix); d.position.y = y + 8.4; d.updateMatrix(); am.setMatrixAt(k, d.matrix); if (maskAt(X, Z) !== 1) W.obstacles.push(X, Z, 0.3); });
      pm.castShadow = true; scene.add(pm, am);
      // round bales left in the harvested fields
      const bales = []; for (let k = 0; k < 4000 && bales.length < 170; k++) { const X = (rng() - 0.5) * 2 * (HALF - 60), Z = (rng() - 0.5) * 2 * (HALF - 60); if (coverAt(X, Z) === 40 && maskAt(X, Z) === 0 && roadD[clamp(Math.round((Z + HALF) / STEP), 0, N - 1) * N + clamp(Math.round((X + HALF) / STEP), 0, N - 1)] > 12) bales.push([X, Z, rng() * 3.14]); }
      const bm = new T.InstancedMesh(new T.CylinderGeometry(0.78, 0.78, 1.5, 12).rotateZ(Math.PI / 2), new T.MeshLambertMaterial({ color: lin(0xcdb162) }), bales.length);
      bales.forEach((p, k) => { d.rotation.set(0, p[2], 0); d.position.set(p[0], hAt(p[0], p[1]) + 0.74, p[1]); d.updateMatrix(); bm.setMatrixAt(k, d.matrix); W.obstacles.push(p[0], p[1], 0.95); });
      bm.castShadow = true; scene.add(bm);
    }

    // ---------- collision grid: circles (trees, posts, bales) + wall segments ----------
    progress('Checking the brakes', 0.88); await tick();
    W.buildCollision = function () {
      const CG = 16, GN = Math.ceil(2 * HALF / CG), cellOf = (X, Z) => clamp((Z + HALF) / CG | 0, 0, GN - 1) * GN + clamp((X + HALF) / CG | 0, 0, GN - 1);
      const circ = Float32Array.from(W.obstacles), seg = Float32Array.from(W.walls), cc = Array.from({ length: GN * GN }), sc = Array.from({ length: GN * GN });
      for (let k = 0; k < circ.length; k += 3) { const c = cellOf(circ[k], circ[k + 1]); (cc[c] || (cc[c] = [])).push(k); }
      for (let k = 0; k < seg.length; k += 4) { const i0 = clamp((Math.min(seg[k], seg[k + 2]) + HALF) / CG | 0, 0, GN - 1), i1 = clamp((Math.max(seg[k], seg[k + 2]) + HALF) / CG | 0, 0, GN - 1), j0 = clamp((Math.min(seg[k + 1], seg[k + 3]) + HALF) / CG | 0, 0, GN - 1), j1 = clamp((Math.max(seg[k + 1], seg[k + 3]) + HALF) / CG | 0, 0, GN - 1); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (sc[j * GN + i] || (sc[j * GN + i] = [])).push(k); }
      const hit = { nx: 0, nz: 0, depth: 0 };
      /** Deepest penetration of a circle (X,Z,r) into any obstacle, or null. Normal points out of the obstacle. */
      W.collide = function (X, Z, r) {
        const ci = clamp((X + HALF) / CG | 0, 0, GN - 1), cj = clamp((Z + HALF) / CG | 0, 0, GN - 1); hit.depth = 0;
        for (let j = Math.max(0, cj - 1); j <= Math.min(GN - 1, cj + 1); j++) for (let i = Math.max(0, ci - 1); i <= Math.min(GN - 1, ci + 1); i++) {
          const a = cc[j * GN + i], s = sc[j * GN + i];
          if (a) for (const k of a) { const dx = X - circ[k], dz = Z - circ[k + 1], d = Math.hypot(dx, dz), pen = r + circ[k + 2] - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
          if (s) for (const k of s) { const ax = seg[k], az = seg[k + 1], ex = seg[k + 2] - ax, ez = seg[k + 3] - az, t = clamp(((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez), 0, 1), dx = X - ax - ex * t, dz = Z - az - ez * t, d = Math.hypot(dx, dz), pen = r - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
        }
        return hit.depth > 0 ? hit : null;
      };
    };

    // ---------- 2D map (minimap + course editor) ----------
    {
      const S = 2048, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), k = S / (2 * HALF), P = (x, y) => [(x + HALF) * k, (-y + HALF) * k];
      const cv = document.createElement('canvas'); cv.width = cv.height = DN; const cg = cv.getContext('2d'), id = cg.createImageData(DN, DN), CC = { 10: [168, 104, 48], 30: [150, 158, 92], 40: [198, 172, 104], 50: [160, 160, 110], 60: [170, 160, 140], 80: [96, 140, 160], 90: [130, 150, 100] };
      for (let q = 0; q < DN * DN; q++) { const col = CC[cover[q]] || CC[30], n = 0.92 + hash2(q, 7) * 0.16; id.data[4 * q] = col[0] * n; id.data[4 * q + 1] = col[1] * n; id.data[4 * q + 2] = col[2] * n; id.data[4 * q + 3] = 255; }
      cg.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(cv, 0, 0, S, S);
      const path = (p) => { g.beginPath(); for (let q = 0; q < p.length; q += 2) { const a = P(p[q], p[q + 1]); g[q ? 'lineTo' : 'moveTo'](a[0], a[1]); } };
      g.fillStyle = '#5f8ea3'; for (const w of M.water) { path(w.p); g.closePath(); g.fill(); }
      for (const a of M.areas) { const f = { park: '#8aa860', pitch: '#7fa056', parking: '#77777a', cemetery: '#9fae8a' }[a.k]; if (f) { g.fillStyle = f; path(a.p); g.closePath(); g.fill(); } }
      g.fillStyle = '#5b4a40'; for (const b of M.buildings) { path(b.p); g.closePath(); g.fill(); }
      g.lineCap = g.lineJoin = 'round';
      const RW = { primary: 7, secondary: 6, tertiary: 5, residential: 3.6, unclassified: 3.6, service: 2, unknown: 2, track: 1.6 };
      g.strokeStyle = '#2a2420'; for (const r of M.roads) { g.lineWidth = RW[r.c] + 2; path(r.p); g.stroke(); }
      for (const r of M.roads) { g.strokeStyle = r.c === 'primary' ? '#f2c230' : r.c === 'secondary' ? '#f0d890' : r.g ? '#cdbfa0' : '#f6ead3'; g.lineWidth = RW[r.c]; path(r.p); g.stroke(); }
      g.strokeStyle = '#1b1a1c'; g.lineWidth = 2; g.setLineDash([6, 5]); for (const p of M.rails) { path(p); g.stroke(); } g.setLineDash([]);
      W.mapCanvas = c; W.mapScale = k;
    }

    // ---------- sky, sun, falling leaves ----------
    const sunDir = new T.Vector3(-0.62, 0.5, 0.6).normalize();
    W.sunDir = sunDir;
    const sky = new T.Mesh(new T.SphereGeometry(8500, 24, 14), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: sunDir }, time: { value: 0 }, night: { value: 0 }, zen: { value: new T.Vector3() }, hor: { value: new T.Vector3() }, glow: { value: new T.Vector3() }, cloud: { value: new T.Vector3() } },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 d; uniform vec3 sun, zen, hor, glow, cloud; uniform float time, night;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){ vec3 v = normalize(d); float y = max(v.y, 0.0);
          vec3 c = mix(hor, zen, pow(y, 0.5));
          float s = max(dot(v, sun), 0.0);
          c += glow * (pow(s, 6.0) * 0.35 + pow(s, 400.0) * 6.0);
          vec2 uv = v.xz / (y + 0.12) * 1.3 + time * 0.004;
          float cl = smoothstep(0.52, 0.86, fbm(uv)) * smoothstep(0.02, 0.22, y);
          c = mix(c, mix(cloud, mix(cloud, glow, 0.45) + 0.12, pow(s, 3.0)), cl * 0.85);
          if (night > 0.0) {   // night: stars on a 3D cell grid (one in ~30 cells, twinkling, hidden by cloud) and the moon where the sun was
            vec3 q = v * 110.0, id = floor(q), f = q - id - 0.5; float r = h(id.xy + id.z * 37.17);
            float st = step(0.965, r) * smoothstep(0.45, 0.0, length(f)) * (0.45 + 0.95 * h(id.zx + 3.1)) * (0.75 + 0.25 * sin(time * 2.7 + r * 900.0));
            c += vec3(0.82, 0.88, 1.0) * st * smoothstep(0.03, 0.3, y) * (1.0 - cl) * night;
            float md = smoothstep(0.99982, 0.99990, s), mm = 0.82 + 0.18 * n(v.xy * 2400.0);
            c = mix(c, vec3(0.92, 0.94, 1.0) * mm * 1.25, md * night * (1.0 - cl * 0.7));
            c += vec3(0.16, 0.19, 0.27) * (pow(s, 900.0) * 0.6 + pow(s, 40.0) * 0.12) * night;
          }
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    scene.fog = new T.FogExp2(lin(0xf0d8b0).getHex(), 0.00019);
    const hemi = new T.HemisphereLight(lin(0xcfe0ff), lin(0x9a7a48), 0.95), sun = new T.DirectionalLight(lin(0xffe2b8), 1.85);
    // time of day: sun direction (toward the sun), light colours and strengths, fog, sky zenith / horizon / sun glow / cloud colours (display RGB), exposure
    const TIMES = {
      golden: { dir: [-0.62, 0.5, 0.6], sun: 0xffe2b8, si: 1.85, sky: 0xcfe0ff, gnd: 0x9a7a48, hi: 0.95, fog: 0xf0d8b0, fd: 0.00019, zen: [0.17, 0.40, 0.80], hor: [0.95, 0.80, 0.60], glow: [1.0, 0.62, 0.28], cloud: [1.0, 0.97, 0.93], exp: 1.05, win: 0.1 },
      midday: { dir: [-0.22, 0.86, 0.46], sun: 0xfff6e6, si: 2.0, sky: 0xd4e4ff, gnd: 0x8c8660, hi: 1.0, fog: 0xdbe6ee, fd: 0.00015, zen: [0.13, 0.36, 0.84], hor: [0.74, 0.85, 0.95], glow: [1.0, 0.92, 0.75], cloud: [1.0, 1.0, 1.0], exp: 1.0, win: 0 },
      dusk: { dir: [-0.9, 0.13, 0.42], sun: 0xff9050, si: 1.35, sky: 0x8f9ccc, gnd: 0x6a503c, hi: 0.72, fog: 0xd9a184, fd: 0.00024, zen: [0.10, 0.17, 0.42], hor: [0.99, 0.58, 0.32], glow: [1.0, 0.45, 0.16], cloud: [0.86, 0.66, 0.62], exp: 1.12, win: 1.25 },
      // night: the directional light is the moon (low in the east-south-east, so it still casts the shadows), the sky draws stars and the moon
      night: { dir: [0.84, 0.3, 0.34], sun: 0x9db4ff, si: 0.3, sky: 0x40507e, gnd: 0x141519, hi: 0.22, fog: 0x0e1424, fd: 0.00042, zen: [0.004, 0.007, 0.02], hor: [0.04, 0.05, 0.09], glow: [0.02, 0.025, 0.035], cloud: [0.035, 0.04, 0.055], exp: 1.45, win: 1.5, night: 1 },
    };
    /** Switches the lighting preset ('golden' | 'midday' | 'dusk' | 'night'); returns the tone-mapping exposure to use. */
    W.setTime = function (name) {
      const t = TIMES[name] || TIMES.golden, u = sky.material.uniforms;
      sunDir.set(t.dir[0], t.dir[1], t.dir[2]).normalize(); sun.color.copy(lin(t.sun)); sun.intensity = t.si;
      hemi.color.copy(lin(t.sky)); hemi.groundColor.copy(lin(t.gnd)); hemi.intensity = t.hi;
      scene.fog.color.copy(lin(t.fog)); scene.fog.density = t.fd;
      u.zen.value.fromArray(t.zen); u.hor.value.fromArray(t.hor); u.glow.value.fromArray(t.glow); u.cloud.value.fromArray(t.cloud); u.night.value = t.night || 0;
      if (t.night && !lampLight && W.streets) lampLight = lampLights();
      if (lampLight) lampLight.visible = !!t.night;
      const rm = t.night ? roadNight() : W.kit.roadMat, was = rm === W.kit.roadMat ? nightRoad : W.kit.roadMat;
      if (was) scene.traverse((o) => { if (o.material === was) o.material = rm; });
      W.windowGlow(t.win); W.time = name in TIMES ? name : 'golden'; return t.exp;
    };
    // night street lighting, made on the first switch to night (streets.js has placed the lamps by then): a soft pool on the ground under
    // every lamp (one additive mesh draped over the ground, 7x7 vertices per pool) and a halo on every head (one Points draw)
    // ...and the asphalt lit per pixel: Lambert lights per vertex and a road ribbon has a vertex only at each edge, so a headlight cone
    // (much narrower than the road at 10 m) would light it in saw-teeth. At night every mesh on W.kit.roadMat (town and corridors) gets
    // a Phong twin with a faint sheen, its asphalt 2.2x paler so the road reads in headlights that do not burn out the verges; the day keeps the cheaper Lambert.
    let lampLight = null, nightRoad = null;
    function roadNight() {
      const m = W.kit.roadMat;
      return nightRoad || (nightRoad = new T.MeshPhongMaterial({ vertexColors: true, map: m.map, color: new T.Color(2.2, 2.2, 2.2), specular: lin(0x1c1c1c), shininess: 24, polygonOffset: true, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits }));
    }
    function lampLights() {
      const O = W.obstacles, r0 = W.streets.obstacles, hAtNow = W.heightXZ, b = Buf(), hp = [], n = 6;
      for (let k = r0[0]; k < r0[1]; k += 3) {
        const r = O[k + 2]; if (r !== 0.16 && r !== 0.14) continue;   // streets.js's lamp posts: 0.16 the ornamental posts downtown (head 4.2 m up), 0.14 the cobra-heads (8.2 m, 2.85 m out toward the road)
        let x = O[k], z = O[k + 1], hy = 4.2, R = 8;
        if (r === 0.14) { const q = W.nearestRoad(x, z, 30); if (q) { const dx = q.x - x, dz = q.z - z, l = Math.hypot(dx, dz) || 1; x += dx / l * 2.85; z += dz / l * 2.85; } hy = 8.18; R = 13; }
        hp.push(x, hAtNow(x, z) + hy, z);
        const v0 = b.pos.length / 3;
        for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
          const px = x + (2 * i / n - 1) * R, pz = z + (2 * j / n - 1) * R; b.pos.push(px, hAtNow(px, pz) + 0.2, pz); b.uv.push(i / n, j / n);
          if (i && j) { const a = v0 + j * (n + 1) + i; b.idx.push(a - n - 2, a - 1, a - n - 1, a - 1, a, a - n - 1); }
        }
      }
      const g = new T.Group(); g.name = 'night-lamps';
      if (!hp.length) return g;
      const soft = (inner) => canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(inner, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
      const pool = new T.Mesh(bufGeo(b), new T.MeshBasicMaterial({ map: soft(0.45), color: lin(0xffd49a).multiplyScalar(0.5), transparent: true, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
      const hg = new T.BufferGeometry(); hg.setAttribute('position', new T.BufferAttribute(new Float32Array(hp), 3));
      const halo = new T.Points(hg, new T.PointsMaterial({ size: 2.6, map: soft(0.18), color: lin(0xffe2b0).multiplyScalar(0.8), transparent: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      pool.frustumCulled = halo.frustumCulled = false; pool.renderOrder = 2;   // ponytail: ~70 pools in one always-drawn mesh (7k triangles); split by district if the lamp count grows
      g.add(pool, halo); scene.add(g); return g;
    }
    W.setTime('golden'); W.sun = sun; W.hemi = hemi; W.sky = sky;
    scene.add(hemi, sun, sun.target);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35; sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
    let nearR = 75, farK = [1, 1, 0.6, 0.38];
    W.setLeaves = (on) => { leaves.visible = on; };      // falling leaves around the camera (Options)
    /** 0 low (no shadows), 1 medium, 2 high. Safe to call at any time. */
    W.setQuality = function (q) {
      sun.castShadow = q > 0; const sz = q > 1 ? 2048 : 1024, e = q > 1 ? 85 : 60, sc = sun.shadow.camera;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      sun.shadow.mapSize.set(sz, sz); sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix();
      nearR = [45, 75, 105][q]; farK = [[1, 0.45, 0.25, 0.12], [1, 0.8, 0.5, 0.3], [1, 1, 0.6, 0.38]][q];   // far-tree density by distance band (phones draw half the woods) lg.setDrawRange(0, [140, 320, 520][q]);
    };
    const LN = 520, lp = new Float32Array(LN * 3), lc = new Float32Array(LN * 3), lph = new Float32Array(LN);
    for (let k = 0; k < LN; k++) { lp[3 * k] = (rng() - 0.5) * 70; lp[3 * k + 1] = rng() * 22; lp[3 * k + 2] = (rng() - 0.5) * 70; const c = fallColor(rng); lc[3 * k] = c.r; lc[3 * k + 1] = c.g; lc[3 * k + 2] = c.b; lph[k] = rng() * 6.28; }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(lp, 3)); lg.setAttribute('color', new T.BufferAttribute(lc, 3));
    const leafTex = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 7, 0.6, 0, 7); g.fill(); });
    const leaves = new T.Points(lg, new T.PointsMaterial({ size: 0.34, map: leafTex, vertexColors: true, transparent: true, alphaTest: 0.4, sizeAttenuation: true })); leaves.frustumCulled = false; scene.add(leaves);

    let lodT = 0;
    W.update = function (dt, t, cam, focus) {
      sky.position.copy(cam.position); sky.material.uniforms.time.value = t; W.wind.value = t;
      sun.position.copy(focus).addScaledVector(sunDir, 300); sun.target.position.copy(focus);
      for (const f of W.animated) f(t, dt, cam);
      if (leaves.visible) for (let k = 0; k < LN; k++) {   // leaves drift down around the camera and wrap
        let x = lp[3 * k] + (Math.sin(t * 0.9 + lph[k]) * 1.4 + 1.1) * dt, y = lp[3 * k + 1] - (0.9 + (k % 5) * 0.16) * dt, z = lp[3 * k + 2] + Math.cos(t * 0.7 + lph[k]) * 1.2 * dt;
        const rx = x - cam.position.x, rz = z - cam.position.z, ry = y - cam.position.y;
        if (rx > 35) x -= 70; else if (rx < -35) x += 70; if (rz > 35) z -= 70; else if (rz < -35) z += 70; if (ry < -6) y += 24; else if (ry > 18) y -= 24;
        lp[3 * k] = x; lp[3 * k + 1] = y; lp[3 * k + 2] = z;
      }
      lg.attributes.position.needsUpdate = leaves.visible;
      if ((lodT -= dt) <= 0) {
        lodT = 0.3; const cx = cam.position.x, cz = cam.position.z;
        for (const c of W.treeChunks) { const d = Math.hypot(Math.max(0, Math.abs(c.cx - cx) - c.hs), Math.max(0, Math.abs(c.cz - cz) - c.hs)), near = d < nearR; c.near.visible = near; c.far.visible = !near; c.far.count = Math.ceil(c.n * farK[d < 250 ? 0 : d < 700 ? 1 : d < 1400 ? 2 : 3]); }   // d = distance to the chunk's edge
        let built = false;
        for (const c of W.terrainChunks) {
          const d = Math.hypot(cx - clamp(cx, c.x0, c.x1), cz - clamp(cz, c.z0, c.z1)); let l = d < 130 ? 0 : d < 600 ? 1 : d < 1300 ? 2 : 3;
          if (!l && !c.lods[0]) { if (built) l = 1; else { c.lods[0] = chunkMesh(c, 1); built = true; } }   // full 2.5 m detail around the camera, one new chunk per pass (no hitch)
          else if (c.lods[0] && d > 420) { scene.remove(c.lods[0]); c.lods[0].geometry.dispose(); c.lods[0] = null; }
          for (let k = 0; k < 4; k++) if (c.lods[k]) c.lods[k].visible = k === l;
        }
      }
    };
    progress('Ready', 1);
    return W;
  };
})();
