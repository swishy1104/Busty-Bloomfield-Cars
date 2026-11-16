/* Bloomfield Drift — hero plug-ins (heroes.js) for the town's two gas stations, each the brand's typical present-day station at the size and
   height the lidar measured. Plain text on the signs, generic price digits, no logos.
   - Huck's Food and Fuel, W Main St (State Road 54), west end of town. Canopy = footprint 1222: a flat slab 31.4 x 7.8 m, top 5.0 m over a
     forecourt paved all round. Store = 1224: 24.4 x 14 m, flat roof 4.3 m, raised front 4.6 m, a 3.3 m back annex, a rooftop unit. Four
     islands in a row under a red and yellow canopy, the store across the parking.
   - Marathon Gas, S Washington St (US 231) south of the square. Canopy = 1379: a flat slab 7.5 m square, top 4.3 m, alone in the paving.
     Store = 1380: 15.9 m square, gable roof (eaves 2.9 m, ridge 5.65 m), its front to the forecourt. One island, two pumps, a white fascia
     with a blue stripe over a narrower red one.
   Each station: storefront glass and doors (the shop lit inside at dusk), the brand's fascia band, ice chest, propane cage, air/vacuum stand, parking bays,
   concrete under the canopy; canopy on columns with recessed lights that glow at dusk; islands with pumps (screens, nozzles, hoses), bins and
   bollards; a tall pole price sign by the road. Solid: columns, islands, pumps, sign posts, store-front props (the store walls are the
   footprint's own). Under the canopies is drivable: their outline walls are folded away, the ground is paving to the tyres, the chase
   camera may follow the car in.
   Public: BD.heroPlugins entries 'fuel-hucks' (footprints 1222, 1224) and 'fuel-marathon' (1380, 1379). Both stations share two meshes:
   one textured from a lettering atlas (sign cabinets, fascia letters, pump faces, the stores' glass with shelves behind it, the canopy
   ceilings; lit a little by day and fully at dusk) and additive light pools on the ground at dusk. Everything else goes in heroes.js's meshes. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});

  // ---------- lettering atlas, 1024 px: panels in colour, letters on clear (alpha-tested); the glow copy is what is backlit at night ----------
  const A = { HN: [0, 0, 512, 192], MN: [512, 0, 512, 192], HF: [0, 192, 512, 96], LMB: [512, 192, 512, 96], PR: [0, 288, 512, 288],
    LH: [512, 288, 512, 128], LMW: [512, 416, 512, 96], PH: [0, 576, 128, 256], PM: [128, 576, 128, 256], ICE: [256, 576, 256, 128],
    PRO: [256, 704, 256, 64], AIR: [512, 576, 128, 128], OPEN: [640, 576, 128, 64], SHOP: [0, 832, 160, 192], CEIL: [160, 832, 32, 32] };
  const uvOf = (r) => [r[0] / 1024, 1 - (r[1] + r[3]) / 1024, (r[0] + r[2]) / 1024, 1 - r[1] / 1024];
  const SHOPUV = uvOf(A.SHOP), CEILUV = uvOf([A.CEIL[0] + 12, A.CEIL[1] + 12, 8, 8]);
  // the game's own text face (BD.util.TEXT_FONT), weight 500, which game.js preloads: a system face costs a font lookup per size (100+ ms here)
  const FONT = '500 {px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  const HRED = '#c8161d', HYEL = '#f6b900', MBLU = '#0d3a8c', MRED = '#d7281c';
  const PRICES = [['REGULAR', '2.99'], ['PLUS', '3.29'], ['DIESEL', '3.49']];   // generic

  function lettering(g, glow) {
    const fill = (r, c) => { g.fillStyle = c; g.fillRect(r[0], r[1], r[2], r[3]); };
    const text = (s, r, px, col, o = {}) => {   // centred in r, shrunk to fit o.w of its width; stroked in its own colour to embolden unless o.thin
      g.font = FONT.replace('{px}', px); const w = g.measureText(s).width, m = r[2] * (o.w || 0.86); if (w > m) { px = Math.floor(px * m / w); g.font = FONT.replace('{px}', px); }
      const x = r[0] + r[2] / 2, y = r[1] + r[3] * (o.y || 0.5); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
      if (!o.thin) { g.strokeStyle = col; g.lineWidth = px * 0.05; g.lineJoin = 'round'; g.strokeText(s, x, y); }
    };
    if (glow) fill([0, 0, 1024, 1024], '#000');
    // Huck's: red cabinet, yellow keyline, white name; yellow "Food & Fuel" strip
    fill(A.HN, HRED); g.strokeStyle = HYEL; g.lineWidth = 8; g.strokeRect(A.HN[0] + 14, A.HN[1] + 14, A.HN[2] - 28, A.HN[3] - 28); text("Huck's", A.HN, 165, '#fff', { y: 0.53 });
    fill(A.HF, HYEL); text('Food & Fuel', A.HF, 80, HRED, { y: 0.54 });
    // Marathon: white cabinet, blue name over a blue stripe and a narrower red one
    fill(A.MN, '#f4f5f6'); fill([A.MN[0] + 20, A.MN[1] + 138, A.MN[2] - 40, 20], MBLU); fill([A.MN[0] + 20, A.MN[1] + 164, A.MN[2] - 40, 9], MRED);
    text('Marathon', [A.MN[0], A.MN[1] + 8, A.MN[2], 128], 132, MBLU, { y: 0.53 });
    // prices: three rows of LED digits on black
    fill(A.PR, glow ? '#000' : '#121314');
    if (!glow) { g.strokeStyle = '#4a4c4f'; g.lineWidth = 6; g.strokeRect(A.PR[0] + 3, A.PR[1] + 3, A.PR[2] - 6, A.PR[3] - 6); }
    PRICES.forEach(([lab, p], i) => {
      const y = A.PR[1] + 16 + i * 88;
      text(lab, [A.PR[0] + 14, y, 180, 84], 48, glow ? '#5a5a5a' : '#ececec', { thin: true, w: 0.95 });
      text(p, [A.PR[0] + 196, y, 252, 84], 100, '#ff3b24', { w: 0.98, y: 0.54 });
      text('9', [A.PR[0] + 450, y, 50, 50], 46, '#ff3b24');
    });
    // fascia letters
    text("Huck's", A.LH, 140, '#fff', { y: 0.53 }); text('Marathon', A.LMB, 100, MBLU, { y: 0.53 }); text('Marathon', A.LMW, 100, '#fff', { y: 0.53 });
    // pump faces: brand header, screen, price window, keypad, grade buttons, kick panel
    for (const [r, top, name] of [[A.PH, HRED, "Huck's"], [A.PM, MBLU, 'Marathon']]) {
      const [x, y] = r;
      if (!glow) { fill(r, '#e3e5e7'); fill([x, y + 222, 128, 34], '#4b5055'); fill([x + 30, y + 134, 68, 50], '#9aa0a6');
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) fill([x + 34 + i * 21, y + 138 + j * 11, 17, 8], '#dadde0');
        ['#2f6db5', '#d23a2a', '#3a8d3e'].forEach((c, k) => fill([x + 14 + k * 36, y + 194, 30, 18], c)); }
      fill([x, y, 128, 30], top); text(name, [x, y, 128, 30], 22, '#fff', {});
      fill([x + 18, y + 42, 92, 60], glow ? '#2b5878' : '#0f151b');
      fill([x + 18, y + 108, 92, 20], glow ? '#000' : '#1b1b1b'); text('3.299', [x + 18, y + 108, 92, 20], 18, '#ff8a2a');
    }
    if (!glow) {
      fill(A.ICE, '#2a6cb2'); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(A.ICE[0] + 20 + k * 34, A.ICE[1] + 10); g.lineTo(A.ICE[0] + 4 + k * 34, A.ICE[1] + 118); g.stroke(); }
      text('ICE', A.ICE, 96, '#fff'); fill(A.PRO, '#f2f2ef'); text('PROPANE', A.PRO, 40, '#c8202b');
      fill(A.AIR, '#1f4f8f'); text('AIR', [A.AIR[0], A.AIR[1], 128, 80], 56, '#ffd23a'); text('VACUUM', [A.AIR[0], A.AIR[1] + 72, 128, 44], 26, '#fff');
    }
    fill(A.OPEN, '#070707'); g.strokeStyle = '#3d7bff'; g.lineWidth = 3; g.strokeRect(A.OPEN[0] + 5, A.OPEN[1] + 5, 118, 54);
    g.font = FONT.replace('{px}', 40); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#ff3030'; g.strokeText('OPEN', A.OPEN[0] + 64, A.OPEN[1] + 33);
    // a storefront bay (one 1.5 x 2 m pane): ceiling lights and shelves seen through tinted glass; the glow copy is the store lit at dusk
    { const [x, y, w, h] = A.SHOP, rng = B.util.mulberry(11), PROD = ['#b8432f', '#d9a531', '#3f74a8', '#5f8f3a', '#e2e2dc', '#8a3f78', '#e07a2a'];
      if (glow) { fill(A.SHOP, '#e9d2a6'); fill([x, y + 10, w, 9], '#fffaf0'); }
      else { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#62727e'); gr.addColorStop(0.3, '#28323a'); gr.addColorStop(1, '#14191e'); g.fillStyle = gr; g.fillRect(x, y, w, h); fill([x, y + 10, w, 7], '#9aa5ab'); }
      g.globalAlpha = glow ? 1 : 0.5;
      for (let row = 0; row < 4; row++) { const sy = y + 62 + row * 33;
        for (let px = x + 3; px < x + w - 4;) { const bw = 5 + rng() * 9, bh = 9 + rng() * 15; g.fillStyle = PROD[rng() * PROD.length | 0]; g.fillRect(px, sy - bh, Math.min(bw, x + w - 3 - px), bh); px += bw + 1; }
        g.fillStyle = glow ? '#a49a88' : '#56606a'; g.fillRect(x, sy, w, 4); }
      g.globalAlpha = 1;
      if (!glow) { g.globalAlpha = 0.09; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + w * 0.5, y); g.lineTo(x + w * 0.78, y); g.lineTo(x + w * 0.32, y + h); g.lineTo(x + w * 0.04, y + h); g.fill(); g.globalAlpha = 1; }
    }
    // canopy ceiling: white; its glow is the lamps' spill, and a little of it shows by day too (see the emissive floor in setup)
    fill(A.CEIL, glow ? '#aaa496' : '#f1f1ee');
  }

  // ---------- state shared by both stations (one lettered mesh, one light-pool mesh), and the world hooks, made once per world ----------
  let S = null;
  function setup(U, W, scene) {
    const map = U.canvasTex(1024, 1024, (g) => lettering(g, false)), glow = U.canvasTex(1024, 1024, (g) => lettering(g, true));
    const mat = new T.MeshLambertMaterial({ map, emissiveMap: glow, emissive: new T.Color(0.3, 0.3, 0.3), alphaTest: 0.5 });
    const pool = U.canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    const pmat = new T.MeshBasicMaterial({ map: pool, color: U.lin(0xffe2b0), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const s = { W, sb: U.Buf(), pb: U.Buf(), areas: [], sm: new T.Mesh(new T.BufferGeometry(), mat), pm: new T.Mesh(new T.BufferGeometry(), pmat) };
    s.sm.receiveShadow = true;   // the solid parts behind every lettered face cast the shadows
    s.pm.visible = false; s.sm.name = s.pm.name = 'hero-fuel'; scene.add(s.sm, s.pm);
    s.refresh = () => { for (const [m, b] of [[s.sm, s.sb], [s.pm, s.pb]]) { m.geometry.dispose(); m.geometry = U.bufGeo(b); } };
    // dusk: the cabinets and letters backlit, pools of light under the canopies
    const g0 = W.windowGlow; W.windowGlow = (v) => { if (g0) g0(v); mat.emissive.setScalar(0.3 + Math.min(1, v) * 0.65); pmat.opacity = U.clamp((v - 0.3) / 0.9, 0, 1) * 0.55; s.pm.visible = pmat.opacity > 0; };
    // under the canopies: paving to the tyres, and not "inside a building" for the camera (the footprints stay 4 in world.js's mask)
    const inA = (X, Z) => { for (let k = 0; k < s.areas.length; k++) if (s.areas[k](X, Z)) return true; return false; };
    const s0 = W.surface; W.surface = (X, Z) => (inA(X, Z) ? 1 : s0(X, Z));
    const i0 = W.inBuilding; W.inBuilding = (X, Z) => i0(X, Z) && !inA(X, Z);
    return s;
  }
  const append = (d, s) => { const o = d.pos.length / 3; for (const k of ['pos', 'nor', 'col', 'uv']) for (let i = 0; i < s[k].length; i++) d[k].push(s[k][i]); for (let i = 0; i < s.idx.length; i++) d.idx.push(s.idx[i] + o); };

  // ---------- builders on top of the kit; everything solid or hooked into the world is queued and applied only if the station builds whole ----------
  function begin(K) {
    const U = B.util, W = B.game && B.game.world, scene = B.game && B.game.scene;
    if (!W || !scene) throw new Error('hero_fuel needs BD.game.world and BD.game.scene');
    const t0 = performance.now(); if (!S || S.W !== W) S = setup(U, W, scene);
    const setupMs = +(performance.now() - t0).toFixed(1), sb = U.Buf(), pb = U.Buf(), solid = [], areas = [], folds = [], C = K.C;
    // an oriented frame in the kit: origin (a0, b0), u at angle t from the kit's a, v = u turned 90 deg anticlockwise; y absolute
    const frame = (a0, b0, t) => { const c = Math.cos(t), s = Math.sin(t), ab = (u, v) => [a0 + u * c - v * s, b0 + u * s + v * c];
      return { ab, P: (u, v, y) => { const q = ab(u, v); return K.P(q[0], q[1], y); }, N: (du, dv, dy) => K.N(du * c - dv * s, du * s + dv * c, dy), G: (u, v) => { const q = ab(u, v); return K.G(q[0], q[1]); } }; };
    const quad = (buf, pts, n, col, r) => { const [u0, v0, u1, v1] = r; K.poly(buf, pts, n, col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]); };
    const X = {
      U, W, C, frame, quad, sb, pb, solid, areas, folds, setupMs,
      box(F, u0, u1, v0, v1, y0, y1, col, bottom) {
        const c = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], d = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; K.poly(K.hb, [F.P(p[0], p[1], y0), F.P(q[0], q[1], y0), F.P(q[0], q[1], y1), F.P(p[0], p[1], y1)], F.N(d[i][0], d[i][1], 0), col); }
        K.poly(K.hb, c.map((p) => F.P(p[0], p[1], y1)), [0, 1, 0], col);
        if (bottom) K.poly(K.hb, c.map((p) => F.P(p[0], p[1], y0)), [0, -1, 0], col);
      },
      // lettered face centred at (uc, vc), facing frame direction nd, w wide, y0..y1, atlas region r (reads left to right from the front)
      plate(F, uc, vc, nd, w, y0, y1, r, col = C(0xffffff)) {
        const ru = -nd[1] * w / 2, rv = nd[0] * w / 2;
        quad(sb, [F.P(uc - ru, vc - rv, y0), F.P(uc + ru, vc + rv, y0), F.P(uc + ru, vc + rv, y1), F.P(uc - ru, vc - rv, y1)], F.N(nd[0], nd[1], 0), col, uvOf(r));
      },
      // ground-following slab u0..u1 x v0..v1, h above the ground, in cells about `cell` across; tone(i, j) -> colour; sides: curb faces
      slab(F, u0, u1, v0, v1, h, tone, cell, sides) {
        const nu = Math.max(1, Math.round((u1 - u0) / cell)), nv = Math.max(1, Math.round((v1 - v0) / cell)), U_ = (i) => u0 + (u1 - u0) * i / nu, V_ = (j) => v0 + (v1 - v0) * j / nv, y = (u, v) => F.G(u, v) + h;
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = U_(i), b = U_(i + 1), c = V_(j), d = V_(j + 1); K.poly(K.hb, [F.P(a, c, y(a, c)), F.P(b, c, y(b, c)), F.P(b, d, y(b, d)), F.P(a, d, y(a, d))], [0, 1, 0], tone(i, j)); }
        if (sides) for (const [e, n] of [[(k) => [U_(k), v0], [0, -1]], [(k) => [U_(k), v1], [0, 1]], [(k) => [u0, V_(k)], [-1, 0]], [(k) => [u1, V_(k)], [1, 0]]]) {
          const m = n[1] ? nu : nv; for (let k = 0; k < m; k++) { const p = e(k), q = e(k + 1); K.poly(K.hb, [F.P(p[0], p[1], F.G(p[0], p[1]) - 0.1), F.P(q[0], q[1], F.G(q[0], q[1]) - 0.1), F.P(q[0], q[1], y(q[0], q[1])), F.P(p[0], p[1], y(p[0], p[1]))], F.N(n[0], n[1], 0), tone(0, 0).clone().multiplyScalar(0.85)); }
        }
      },
      // pool of light on the ground (additive, dusk only), an ellipse filling u0..u1 x v0..v1, following the ground on a 4 x 4 grid
      pool(F, u0, u1, v0, v1) {
        const n = 4, P = (i, j) => { const u = u0 + (u1 - u0) * i / n, v = v0 + (v1 - v0) * j / n; return F.P(u, v, F.G(u, v) + 0.09); }, W_ = C(0xffffff);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) quad(pb, [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], [0, 1, 0], W_, [i / n, j / n, (i + 1) / n, (j + 1) / n]);
      },
      circle: (F, u, v, r) => solid.push(['c', ...F.ab(u, v), r]),
      rect(F, u0, u1, v0, v1) { const c = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map((p) => F.ab(p[0], p[1])); for (let i = 0; i < 4; i++) solid.push(['w', ...c[i], ...c[(i + 1) % 4]]); },
      // an area paved to the tyres and open to the camera (allocation-free test in world coords)
      area(F, u0, u1, v0, v1) { const o = F.P(0, 0, 0), pu = F.P(1, 0, 0), pv = F.P(0, 1, 0), ux = pu[0] - o[0], uz = pu[2] - o[2], vx = pv[0] - o[0], vz = pv[2] - o[2];
        areas.push((x, z) => { const dx = x - o[0], dz = z - o[2], u = dx * ux + dz * uz, v = dx * vx + dz * vz; return u >= u0 && u <= u1 && v >= v0 && v <= v1; }); },
    };
    return X;
  }
  function finish(K, X) {
    for (const s of X.solid) if (s[0] === 'c') K.circle(s[1], s[2], s[3]); else K.wallSeg(s[1], s[2], s[3], s[4]);
    // a canopy footprint's outline walls (buildings.js) shrink to a point inside one of its columns, so the car drives under it.
    // ponytail: edits W.walls in place by matching the outline's corners; a kit option for an open (wall-less) footprint would replace it
    let folded = 0;
    for (const [rec, p] of X.folds) { const on = (x, z) => rec.pts.some((q) => Math.abs(q[0] - x) < 1e-3 && Math.abs(q[1] - z) < 1e-3), w = X.W.walls;
      for (let k = 0; k < w.length; k += 4) if (on(w[k], w[k + 1]) && on(w[k + 2], w[k + 3])) { w[k] = w[k + 2] = p[0]; w[k + 1] = w[k + 3] = p[2]; folded++; } }
    for (const a of X.areas) S.areas.push(a);
    append(S.sb, X.sb); append(S.pb, X.pb); S.refresh();
    K.result.info = { folded, solids: X.solid.length, letterTris: X.sb.idx.length / 3, setupMs: X.setupMs };
  }

  const tone = (C, hex, amp) => { const base = C(hex); return (i, j) => base.clone().multiplyScalar(1 - amp + 2 * amp * B.util.hash2(i * 7 + 1, j * 13 + 5)); };

  // ---------- shared station pieces ----------
  // canopy over frame F's u 0..L, v 0..D, flat top at `top`: roof, fascia (o.bands: [y0, y1, colour, s0, s1] from the bottom, s along a side
  // 0..1 as seen from outside), letters (o.letters: [region, width, height, centre y, centre s]), ceiling with recessed lights in o.rows x o.cols
  function canopy(K, X, F, L, D, top, o) {
    const C = X.C, fh = o.fh, yb = top - fh, yc = top - fh + 0.2, t = 0.15, WH = C(0xeeeeea), [l0, l1, l2, l3] = K.uvr(K.R.LIT, 2);
    K.poly(K.hb, [F.P(0, 0, top), F.P(L, 0, top), F.P(L, D, top), F.P(0, D, top)], [0, 1, 0], C(0xc9cbcc));
    // hidden underside inside the slab: the shadow pass draws FrontSide back faces only, so this (not the up-facing roof) casts the canopy's shadow
    K.poly(K.hb, [F.P(0, 0, top - 0.02), F.P(L, 0, top - 0.02), F.P(L, D, top - 0.02), F.P(0, D, top - 0.02)], [0, -1, 0], WH);
    X.quad(X.sb, [F.P(t, t, yc), F.P(L - t, t, yc), F.P(L - t, D - t, yc), F.P(t, D - t, yc)], [0, -1, 0], WH, CEILUV);
    for (const [p, q, n] of [[[0, 0], [L, 0], [0, -1]], [[L, 0], [L, D], [1, 0]], [[L, D], [0, D], [0, 1]], [[0, D], [0, 0], [-1, 0]]]) {
      const at = (s, d) => [p[0] + (q[0] - p[0]) * s + n[0] * d, p[1] + (q[1] - p[1]) * s + n[1] * d], len = Math.hypot(q[0] - p[0], q[1] - p[1]), Nn = F.N(n[0], n[1], 0);
      o.bands.forEach(([y0, y1, col, s0 = 0, s1 = 1], k) => { const a = at(s0, 0.004 * k), b = at(s1, 0.004 * k); K.poly(K.hb, [F.P(a[0], a[1], yb + y0), F.P(b[0], b[1], yb + y0), F.P(b[0], b[1], yb + y1), F.P(a[0], a[1], yb + y1)], Nn, col); });
      const i0 = at(0, -t), i1 = at(1, -t), e0 = at(0, 0), e1 = at(1, 0);
      K.poly(K.hb, [F.P(e0[0], e0[1], yb), F.P(e1[0], e1[1], yb), F.P(i1[0], i1[1], yb), F.P(i0[0], i0[1], yb)], [0, -1, 0], WH);
      K.poly(K.hb, [F.P(i0[0], i0[1], yb), F.P(i1[0], i1[1], yb), F.P(i1[0], i1[1], yc), F.P(i0[0], i0[1], yc)], F.N(-n[0], -n[1], 0), WH);
      for (const [r, w, h, y, s] of o.letters) { if (w > len * 0.8) continue; const k = Math.max(1, Math.round(len / 15));   // one name per 15 m of side
        for (let j = 0; j < k; j++) { const c = at(k === 1 ? s : (j + 0.5) / k, 0.02); X.plate(F, c[0], c[1], n, w, yb + y - h / 2, yb + y + h / 2, r); } }
    }
    for (let i = 0; i < o.cols; i++) for (let j = 0; j < o.rows; j++) {   // recessed lights: a dark bezel and the lamp (glows at dusk)
      const u = L * (i + 0.5) / o.cols, v = D * (j + 0.5) / o.rows, hu = o.lamp[0] / 2, hv = o.lamp[1] / 2;
      K.poly(K.hb, [F.P(u - hu - 0.06, v - hv - 0.06, yc - 0.01), F.P(u + hu + 0.06, v - hv - 0.06, yc - 0.01), F.P(u + hu + 0.06, v + hv + 0.06, yc - 0.01), F.P(u - hu - 0.06, v + hv + 0.06, yc - 0.01)], [0, -1, 0], C(0xb9bcbf));
      X.quad(K.hb, [F.P(u - hu, v - hv, yc - 0.02), F.P(u + hu, v - hv, yc - 0.02), F.P(u + hu, v + hv, yc - 0.02), F.P(u - hu, v + hv, yc - 0.02)], [0, -1, 0], C(0xffffff), [l0, l1, l2, l3]);
    }
    return yc;
  }
  // multi-product dispenser at (u, v) on an island top y, its faces toward +-v
  function pump(X, F, u, v, y, face, brand) {
    const C = X.C, ink = C(0x1b1c1e);
    X.box(F, u - 0.58, u + 0.58, v - 0.33, v + 0.33, y, y + 0.1, C(0x55595d));
    X.box(F, u - 0.52, u + 0.52, v - 0.27, v + 0.27, y + 0.1, y + 1.95, C(0xd9dbdd));
    X.box(F, u - 0.56, u + 0.56, v - 0.31, v + 0.31, y + 1.95, y + 2.3, brand, true);
    for (const s of [-1, 1]) {
      X.plate(F, u, v + s * 0.28, [0, s], 1.0, y + 0.12, y + 1.93, face);
      for (const e of [-1, 1]) { X.box(F, u + e * 0.4 - 0.05, u + e * 0.4 + 0.05, v + s * 0.27 - (s < 0 ? 0.12 : 0), v + s * 0.27 + (s > 0 ? 0.12 : 0), y + 0.98, y + 1.32, ink);
        X.box(F, u + e * 0.47 - 0.025, u + e * 0.47 + 0.025, v + s * 0.3 - 0.025, v + s * 0.3 + 0.025, y + 0.5, y + 1.95, ink); }
    }
  }
  // pump island along u centred (uc, vc), len long, 1.2 m wide: curb with yellow noses; items [kind, du]: 'pump' | 'col' | 'bin' | 'bol'
  function island(X, F, uc, vc, len, items, o) {
    const C = X.C, h = len / 2, gs = [[-h, -0.6], [h, -0.6], [h, 0.6], [-h, 0.6]].map((p) => F.G(uc + p[0], vc + p[1])), y = Math.max(...gs) + 0.18, gl = Math.min(...gs) - 0.1, yel = C(0xf0c419);
    X.box(F, uc - h + 0.3, uc + h - 0.3, vc - 0.6, vc + 0.6, gl, y, C(0xc4c1b8));
    X.box(F, uc - h, uc - h + 0.3, vc - 0.6, vc + 0.6, gl, y, yel); X.box(F, uc + h - 0.3, uc + h, vc - 0.6, vc + 0.6, gl, y, yel);
    for (const [kind, du] of items) {
      const u = uc + du;
      if (kind === 'pump') pump(X, F, u, vc, y, o.face, o.brand);
      else if (kind === 'col') { X.box(F, u - 0.21, u + 0.21, vc - 0.21, vc + 0.21, y, o.yc, o.column); X.box(F, u - 0.27, u + 0.27, vc - 0.27, vc + 0.27, y, y + 1.1, o.base); }
      else if (kind === 'bol') X.box(F, u - 0.09, u + 0.09, vc - 0.09, vc + 0.09, y, y + 0.95, yel);
      else if (kind === 'bin') { X.box(F, u - 0.24, u + 0.24, vc - 0.24, vc + 0.24, y, y + 0.9, C(0x3d4a40)); X.box(F, u - 0.27, u + 0.27, vc - 0.27, vc + 0.27, y + 0.9, y + 0.98, C(0x2c3530)); X.box(F, u - 0.13, u + 0.13, vc - 0.13, vc + 0.13, y + 0.98, y + 1.22, C(0x2a62b0)); }
    }
    X.rect(F, uc - h, uc + h, vc - 0.6, vc + 0.6);
    return y;
  }
  // tall pole sign at (0, 0) of frame F (u along the road): twin posts, cabinets [region, height] stacked from the bottom, faces toward +-u
  function poleSign(X, F, clear, stack, trim) {
    const C = X.C, g = F.G(0, 0), w = 3.6, d = 0.22, H = stack.reduce((s, q) => s + q[1] + 0.1, 0); let y = g + clear;
    for (const s of [-1, 1]) { X.box(F, -0.15, 0.15, s * 1.15 - 0.15, s * 1.15 + 0.15, g - 0.3, y + H, C(0x3b3d40)); X.box(F, -0.32, 0.32, s * 1.15 - 0.32, s * 1.15 + 0.32, g - 0.2, g + 0.3, C(0xb9b6ad)); X.circle(F, 0, s * 1.15, 0.36); }
    for (const [r, h] of stack) {
      X.box(F, -d, d, -w / 2 - 0.07, w / 2 + 0.07, y - 0.05, y + h + 0.05, trim, true);
      for (const s of [-1, 1]) X.plate(F, s * (d + 0.01), 0, [s, 0], w, y, y + h, r);
      y += h + 0.1;
    }
    X.box(F, -d - 0.05, d + 0.05, -w / 2 - 0.12, w / 2 + 0.12, y - 0.1, y + 0.08, trim, true);
  }
  // store-front props against a wall: ice chest, propane cage (u along the wall, +v out of it, y = the sidewalk top)
  function iceChest(X, F, u, v, y) {
    const C = X.C; X.box(F, u - 0.8, u + 0.8, v, v + 0.8, y, y + 1.3, C(0xf1f3f4)); X.box(F, u - 0.83, u + 0.83, v - 0.02, v + 0.83, y + 1.3, y + 1.38, C(0xb8bdc2));
    X.plate(F, u, v + 0.81, [0, 1], 1.5, y + 0.32, y + 1.07, A.ICE); X.circle(F, u - 0.4, v + 0.4, 0.45); X.circle(F, u + 0.4, v + 0.4, 0.45);
  }
  function propane(K, X, F, u, v, y) {
    const C = X.C, grey = C(0xbfc3c6), [l0, l1, l2, l3] = K.uvr(K.R.LAT, 0.5), w = 0.75, d = 0.85, h = 1.7, tank = C(0xe9ecee);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) { const tu = u - 0.45 + k * 0.45, tv = v + 0.25 + r * 0.38, ty = y + 0.05; X.box(F, tu - 0.15, tu + 0.15, tv - 0.15, tv + 0.15, ty, ty + 0.5, tank); X.box(F, tu - 0.15, tu + 0.15, tv - 0.15, tv + 0.15, ty + 0.85, ty + 1.35, tank); }
    X.box(F, u - w, u + w, v, v + d, y + 0.78, y + 0.82, grey);
    for (const [p, q, n] of [[[u - w, v + d], [u + w, v + d], [0, 1]], [[u + w, v + d], [u + w, v], [1, 0]], [[u - w, v], [u - w, v + d], [-1, 0]]])
      X.quad(K.hb, [F.P(p[0], p[1], y), F.P(q[0], q[1], y), F.P(q[0], q[1], y + h), F.P(p[0], p[1], y + h)], F.N(n[0], n[1], 0), grey, [l0, l1, l2, l3]);
    X.box(F, u - w - 0.03, u + w + 0.03, v - 0.03, v + d + 0.03, y + h, y + h + 0.06, grey, true);
    X.plate(F, u, v + d + 0.02, [0, 1], 1.2, y + h - 0.36, y + h - 0.06, A.PRO); X.circle(F, u - 0.4, v + 0.42, 0.45); X.circle(F, u + 0.4, v + 0.42, 0.45);
  }
  // air / vacuum stand on its own little pad with two bollards; faces +v
  function airStand(X, F, u, v) {
    const C = X.C, g = F.G(u, v), body = C(0x234f8c), ink = C(0x1b1c1e);
    X.box(F, u - 1.0, u + 1.0, v - 0.8, v + 0.8, g - 0.1, g + 0.1, C(0xbdb9ae));
    X.box(F, u - 0.35, u + 0.35, v - 0.25, v + 0.25, g + 0.1, g + 1.55, body); X.box(F, u - 0.4, u + 0.4, v - 0.3, v + 0.3, g + 1.55, g + 1.65, C(0xd0d2d4));
    for (const s of [-1, 1]) X.plate(F, u, v + s * 0.26, [0, s], 0.6, g + 0.85, g + 1.45, A.AIR);
    for (const s of [-1, 1]) { X.box(F, u + s * 0.38 - 0.03, u + s * 0.38 + 0.03, v - 0.03, v + 0.03, g + 0.35, g + 1.4, ink); X.box(F, u + s * 0.75 - 0.08, u + s * 0.75 + 0.08, v + 0.55 - 0.08, v + 0.55 + 0.08, g + 0.1, g + 1.05, C(0xf0c419)); X.circle(F, u + s * 0.75, v + 0.55, 0.14); }
    X.circle(F, u, v, 0.45);
  }
  // where the pole sign goes: the nearest road to kit point (a, b), off its edge by `off` toward that point; returns a frame along the road
  function signSpot(K, X, a, b, off) {
    const p = K.P(a, b, 0), r = X.W.nearestRoad(p[0], p[2], 80); if (!r) return null;
    const side = (p[0] - r.x) * r.tz - (p[2] - r.z) * r.tx >= 0 ? 1 : -1;
    for (const slide of [0, 3, -3, 6, -6]) {
      const x = r.x + r.tx * slide + r.tz * side * (r.hw + off), z = r.z + r.tz * slide - r.tx * side * (r.hw + off), m = X.W.maskAt(x, z);
      if (m !== 0 && m !== 5) continue;
      const q = K.toLocal(x, z), q2 = K.toLocal(x + r.tx, z + r.tz);
      return X.frame(q[0], q[1], Math.atan2(q2[1] - q[1], q2[0] - q[0]));
    }
    return null;
  }

  // ---------- Huck's Food and Fuel ----------
  function hucks(K) {
    const X = begin(K), C = X.C, fc = K.fp(1222), fs = K.fp(1224), F0 = X.frame(0, 0, 0), RED = C(0xc4161c), YEL = C(0xf2b300), WHT = C(0xf3f3ef);
    // canopy: the kit's frame runs along its long edge from its corner, so it spans u 0..L, v 0..D; the lidar top is the slab's top
    const L = Math.max(...fc.pts.map((p) => p[0])), D = Math.max(...fc.pts.map((p) => p[1])), top = fc.rec.top;
    X.slab(F0, -2, L + 2, -2.5, D + 2.5, 0.05, tone(C, 0xa29f97, 0.035), 2.25);
    const yc = canopy(K, X, F0, L, D, top, { fh: 1.0, rows: 2, cols: 7, lamp: [1.2, 0.6],
      bands: [[0, 0.2, YEL], [0.2, 0.93, RED], [0.93, 1.0, WHT]], letters: [[A.LH, 2.72, 0.68, 0.565, 0.5]] });
    // four islands in a row, each with its column at the outer end (the columns stand symmetric under the canopy)
    const o = { yc, face: A.PH, brand: RED, column: C(0xeeeeea), base: RED };
    for (let k = 0; k < 4; k++) { const uc = L * (2 * k + 1) / 8, s = k < 2 ? -1 : 1;
      island(X, F0, uc, D / 2, 4.6, [['bol', -2.12], ['bol', 2.12], ['col', s * 1.55], ['pump', -s * 0.2], ['bin', -s * 1.55]], o); }
    X.area(F0, -2, L + 2, -2.5, D + 2.5); X.folds.push([fc.rec, F0.P(L * 3 / 8 - 1.55, D / 2, 0)]);
    X.pool(F0, -3, L / 2, -5, D + 5); X.pool(F0, L / 2, L + 3, -5, D + 5);

    // store: a main block and a lower back annex, as rectangles from the outline's levels (the annex is the east end of the back)
    const sp = fs.pts; if (sp.length !== 6) throw new Error('footprint 1224 changed shape');
    const srt = (k) => sp.map((p) => p[k]).sort((p, q) => p - q), av = srt(0), bv = srt(1), m2 = (v, i) => (v[i] + v[i + 1]) / 2;
    const a0 = m2(av, 0), aN = m2(av, 2), a1 = m2(av, 4), b0 = m2(bv, 0), bM = m2(bv, 2), bN = m2(bv, 4), rs = fs.rec, Fl = rs.floorY, mid = (a0 + a1) / 2;
    const roofAt = (a, b) => { const p = K.P(a, b, 0); return rs.roofAt(p[0], p[2]); };
    const yF = Math.max(rs.top + 0.15, roofAt(mid, bN - 0.5) || 0), yA = roofAt((aN + a1) / 2, (b0 + bM) / 2) || rs.top - 1, lo = fs.lo - 0.3, ws = Fl + 0.75;
    const EIFS = C(0xd8c6a0), BRICK = C(0xffffff), FRAME = C(0x2e2a26), GL = C(0xffffff);
    const part = (w, s0, s1, yb, holes = []) => { K.wall(w, s0, s1, lo, ws, holes, BRICK, lo, 'brick'); K.wall(w, s0, s1, ws, yb, holes, EIFS, ws, 'plain'); };
    const Wf = K.Wall(true, bN, 1), glass = [[mid - 7.4, mid - 1.15, Fl + 0.75, Fl + 2.75], [mid + 1.15, mid + 7.4, Fl + 0.75, Fl + 2.75]], door = [mid - 1.15, mid + 1.15, Fl + 0.02, Fl + 2.75];
    part(Wf, a0, a1, rs.top, [...glass, door]); part(K.Wall(false, a0, -1), bM, bN, rs.top); part(K.Wall(false, a1, 1), bM, bN, rs.top); part(K.Wall(true, bM, -1), a0, a1, rs.top);
    part(K.Wall(true, b0, -1), aN, a1, yA); part(K.Wall(false, aN, -1), b0, bM, yA); part(K.Wall(false, a1, 1), b0, bM, yA);
    K.flat([[a0, bM], [a1, bM], [a1, bN], [a0, bN]], rs.top - 0.3, { parapet: 0.3, col: C(0x5f615e) });
    K.flat([[aN, b0], [a1, b0], [a1, bM], [aN, bM]], yA - 0.25, { parapet: 0.25, col: C(0x5f615e) });
    // rooftop unit where the lidar sees one (a spike over the roof)
    let best = null; for (let a = a0 + 1; a < a1 - 1; a += 1) for (let b = bM + 1; b < bN - 1; b += 1) { const h = roofAt(a, b); if (h && h > rs.top + 0.8 && (!best || h > best[2])) best = [a, b, h]; }
    if (best) { X.box(F0, best[0] - 1.0, best[0] + 1.0, best[1] - 0.7, best[1] + 0.7, rs.top - 0.3, Math.min(best[2], rs.top + 1.4), C(0xb4b8ba)); X.box(F0, best[0] - 0.45, best[0] + 0.45, best[1] - 0.45, best[1] + 0.45, Math.min(best[2], rs.top + 1.4), Math.min(best[2], rs.top + 1.4) + 0.05, C(0x3a3d40)); }
    // storefront: glass (lit at dusk) in dark bronze frames, a pair of glass doors under a transom, the OPEN sign
    const pane = (s0, s1, y0, y1) => X.quad(X.sb, [Wf.pt(s0, -0.1, y0), Wf.pt(s1, -0.1, y0), Wf.pt(s1, -0.1, y1), Wf.pt(s0, -0.1, y1)], Wf.n, GL, SHOPUV);
    for (const [s0, s1, y0, y1] of glass) { const n = Math.round((s1 - s0) / 1.55);
      for (let k = 0; k <= n; k++) { const s = s0 + (s1 - s0) * k / n; Wf.box(s - 0.05, s + 0.05, -0.12, 0.02, y0, y1, FRAME); if (k < n) pane(s, s0 + (s1 - s0) * (k + 1) / n, y0, y1); }
      Wf.box(s0, s1, -0.12, 0.05, y0 - 0.07, y0, FRAME, true); Wf.box(s0, s1, -0.12, 0.02, y1, y1 + 0.07, FRAME, true); }
    pane(door[0], mid, door[2], door[3]); pane(mid, door[1], door[2], door[3]);
    for (const s of [door[0], mid, door[1]]) Wf.box(s - 0.06, s + 0.06, -0.12, 0.02, Fl, door[3], FRAME);
    Wf.box(door[0], door[1], -0.12, 0.02, Fl + 2.32, Fl + 2.42, FRAME, true);
    for (const s of [-1, 1]) Wf.box(mid + s * 0.57 - 0.32, mid + s * 0.57 + 0.32, -0.09, -0.03, Fl + 1.0, Fl + 1.06, C(0xc9c9c9), true);
    X.plate(F0, mid + 3.0, bN - 0.08, [0, 1], 0.8, Fl + 1.75, Fl + 2.15, A.OPEN);
    // fascia band across the raised front: yellow stripe, red band, white cap; the name in white letters
    Wf.box(a0 - 0.15, a1 + 0.15, 0, 0.35, Fl + 3.15, Fl + 3.37, YEL, true); Wf.box(a0 - 0.15, a1 + 0.15, 0, 0.35, Fl + 3.37, yF - 0.08, RED); Wf.box(a0 - 0.17, a1 + 0.17, -0.02, 0.37, yF - 0.08, yF, WHT);
    X.plate(F0, mid, bN + 0.37, [0, 1], 3.4, (Fl + 3.37 + yF - 0.08) / 2 - 0.42, (Fl + 3.37 + yF - 0.08) / 2 + 0.42, A.LH);
    // sidewalk (15 cm curb) with the ice chest, propane cage and bollards; parking bays in front
    X.slab(F0, a0 - 0.6, a1 + 0.6, bN, bN + 2.4, 0.15, tone(C, 0xc2beb4, 0.02), 2.0, true);
    const yS = (u) => F0.G(u, bN + 0.6) + 0.15;
    iceChest(X, F0, mid - 3.3, bN + 0.12, yS(mid - 3.3)); propane(K, X, F0, a1 - 1.6, bN + 0.1, yS(a1 - 1.6));
    for (const u of [mid - 5.6, mid - 4.4, mid + 4.4, mid + 6.0, mid + 7.6]) { const y = yS(u); X.box(F0, u - 0.09, u + 0.09, bN + 2.0, bN + 2.18, y - 0.15, y + 0.95, YEL); X.circle(F0, u, bN + 2.09, 0.14); }
    const line = C(0xe9e9e3);
    for (let u = a0 + 1.2; u <= a1 - 1.0; u += 2.75) { const y0 = F0.G(u, bN + 2.7) + 0.07, y1 = F0.G(u, bN + 8.0) + 0.07; K.poly(K.hb, [F0.P(u - 0.06, bN + 2.7, y0), F0.P(u + 0.06, bN + 2.7, y0), F0.P(u + 0.06, bN + 8.0, y1), F0.P(u - 0.06, bN + 8.0, y1)], [0, 1, 0], line); }
    airStand(X, F0, a1 + 2.6, bN + 3.5);
    X.pool(F0, a0, a1, bN - 1, bN + 9);
    // pole sign on the verge of W Main St, east of the canopy
    const Fs = signSpot(K, X, L + 4, D + 8, 2.6);
    if (Fs) poleSign(X, Fs, 3.3, [[A.PR, 2.02], [A.HF, 0.675], [A.HN, 1.35]], RED);
    finish(K, X);
  }

  // ---------- Marathon Gas ----------
  function marathon(K) {
    const X = begin(K), C = X.C, fs = K.fp(1380), fc = K.fp(1379), F0 = X.frame(0, 0, 0), BLU = C(0x0d3a8c), MR = C(0xd7281c), WHT = C(0xf3f4f5);
    // store: the kit's frame runs along its south wall from the south-west corner (u east, v north); gable roof, ridge north-south
    const sp = fs.pts, rs = fs.rec, Fl = rs.floorY, Aw = Math.max(...sp.map((p) => p[0])), Dd = Math.max(...sp.map((p) => p[1])), ye = rs.top, yr = Math.max(rs.ridge, ye + 1.5), lo = fs.lo - 0.3, ws = Fl + 0.45;
    const SID = C(0xd4d8d6), BRICK = C(0xffffff), FRAME = C(0x2e2a26), GL = C(0xffffff);
    let front = null;
    sp.forEach((p, i) => {
      const q = sp[(i + 1) % sp.length], w = K.Seg(p[0], p[1], q[0], q[1]), isFront = w.L > 10 && (q[1] - p[1]) / w.L > 0.95 && p[0] > Aw - 1;
      const m = w.L / 2, holes = isFront ? [[m - 5.2, m - 1.05, Fl + 0.45, Fl + 2.2], [m + 1.05, m + 5.2, Fl + 0.45, Fl + 2.2], [m - 1.05, m + 1.05, Fl + 0.02, Fl + 2.2]] : [];
      K.wall(w, 0, w.L, lo, ws, holes, BRICK, lo, 'brick'); K.wall(w, 0, w.L, ws, ye, holes, SID, ws, 'siding');
      if (isFront) front = { w, m, holes };
    });
    if (!front) throw new Error('footprint 1380: no front wall');
    const rf = K.roof(false, -0.35, Dd + 0.35, 0, Aw, ye, yr - ye, 0.45, { gutter: 'both' });
    K.gable(K.Wall(true, 0, -1), 0, Aw, ye, rf.yr, SID, ye, 'siding'); K.gable(K.Wall(true, Dd, 1), 0, Aw, ye, rf.yr, SID, ye, 'siding');
    // the cut-out north-west corner is a porch under the roof: a post and two headers
    const notch = sp.find((p) => p[0] > 1 && p[0] < Aw / 3 && p[1] > Dd / 2 && p[1] < Dd - 1);
    if (notch) { const g = F0.G(0.15, Dd - 0.15); X.box(F0, 0.03, 0.27, Dd - 0.27, Dd - 0.03, g - 0.2, ye, K.TRIM); X.box(F0, 0, notch[0], Dd - 0.2, Dd, ye - 0.3, ye, K.TRIM, true); X.box(F0, 0, 0.2, notch[1], Dd, ye - 0.3, ye, K.TRIM, true); X.circle(F0, 0.15, Dd - 0.15, 0.2); }
    // storefront on the east wall: glass, doors, OPEN sign; the brand band under the eave (red stripe, blue band with white letters)
    const { w: Wf, m, holes } = front;
    const pane = (s0, s1, y0, y1) => X.quad(X.sb, [Wf.pt(s0, -0.1, y0), Wf.pt(s1, -0.1, y0), Wf.pt(s1, -0.1, y1), Wf.pt(s0, -0.1, y1)], Wf.n, GL, SHOPUV);
    for (const [s0, s1, y0, y1] of holes) { const n = Math.max(1, Math.round((s1 - s0) / 1.5));
      for (let k = 0; k <= n; k++) { const s = s0 + (s1 - s0) * k / n; Wf.box(s - 0.05, s + 0.05, -0.12, 0.02, y0, y1, FRAME); if (k < n) pane(s, s0 + (s1 - s0) * (k + 1) / n, y0, y1); }
      Wf.box(s0, s1, -0.12, 0.05, y0 - 0.07, y0, FRAME, true); Wf.box(s0, s1, -0.12, 0.02, y1, y1 + 0.07, FRAME, true); }
    for (const s of [-1, 1]) Wf.box(m + s * 0.52 - 0.3, m + s * 0.52 + 0.3, -0.09, -0.03, Fl + 1.0, Fl + 1.06, C(0xc9c9c9), true);
    const sideOf = (s, d) => K.toLocal(...((p) => [p[0], p[2]])(Wf.pt(s, d, 0)));
    { const q = sideOf(m - 3.0, -0.08); X.plate(F0, q[0], q[1], [1, 0], 0.8, Fl + 1.55, Fl + 1.95, A.OPEN); }
    // the brand fascia: a box sign along the front standing proud of the eave and its gutter (a band on the wall hid under them): red keyline, blue face, white cap
    const fy = Fl + 2.34, fz = ye + 0.42;
    Wf.box(0.1, Wf.L - 0.1, 0, 0.75, fy, fy + 0.12, MR, true); Wf.box(0.1, Wf.L - 0.1, 0, 0.75, fy + 0.12, fz - 0.08, BLU); Wf.box(0.08, Wf.L - 0.08, -0.02, 0.77, fz - 0.08, fz, WHT);
    { const q = sideOf(m, 0.76); X.plate(F0, q[0], q[1], [1, 0], 3.4, fy + 0.2, fz - 0.15, A.LMW); }
    // sidewalk along the front, the ice chest and propane cage on it, bays in front, the air stand at the north-east corner
    X.slab(F0, Aw, Aw + 2.2, 0.3, Dd - 0.3, 0.15, tone(C, 0xc2beb4, 0.02), 2.0, true);
    const Fe = X.frame(Aw, Dd, -Math.PI / 2);   // along the front, u from north to south, v out to the east
    const yS = (u) => Fe.G(u, 0.6) + 0.15;
    iceChest(X, Fe, m - 2.6, 0.12, yS(m - 2.6)); propane(K, X, Fe, 2.0, 0.1, yS(2.0));
    const line = C(0xe9e9e3);
    for (let u = 1.5; u <= Dd - 1.0; u += 2.9) { const y0 = Fe.G(u, 2.5) + 0.07, y1 = Fe.G(u, 7.7) + 0.07; K.poly(K.hb, [Fe.P(u - 0.06, 2.5, y0), Fe.P(u + 0.06, 2.5, y0), Fe.P(u + 0.06, 7.7, y1), Fe.P(u - 0.06, 7.7, y1)], [0, 1, 0], line); }
    airStand(X, F0, Aw + 1.6, Dd + 2.6);
    X.pool(Fe, -1, Dd + 1, -1, 7);

    // canopy (1379): a frame on its own outline, u along the side nearest the road's direction
    const cp = fc.pts, ctr = cp.reduce((s, p) => [s[0] + p[0] / cp.length, s[1] + p[1] / cp.length], [0, 0]);
    const cw = K.P(ctr[0], ctr[1], 0), road = X.W.nearestRoad(cw[0], cw[2], 80), rl = road ? [K.toLocal(road.x, road.z), K.toLocal(road.x + road.tx, road.z + road.tz)] : null;
    const rd = rl ? [rl[1][0] - rl[0][0], rl[1][1] - rl[0][1]] : [0, 1];
    const e0 = [cp[1][0] - cp[0][0], cp[1][1] - cp[0][1]], e1 = [cp[2][0] - cp[1][0], cp[2][1] - cp[1][1]], par = (e) => Math.abs(e[0] * rd[0] + e[1] * rd[1]) / Math.hypot(e[0], e[1]);
    const eu = par(e0) >= par(e1) ? e0 : e1, ev = eu === e0 ? e1 : e0, L = Math.hypot(eu[0], eu[1]), D = Math.hypot(ev[0], ev[1]), t = Math.atan2(eu[1], eu[0]);
    const Fc = X.frame(ctr[0] - Math.cos(t) * L / 2 + Math.sin(t) * D / 2, ctr[1] - Math.sin(t) * L / 2 - Math.cos(t) * D / 2, t), top = fc.rec.top;
    X.slab(Fc, -2.5, L + 2.5, -2.5, D + 2.5, 0.05, tone(C, 0xa29f97, 0.035), 2.4);
    const yc = canopy(K, X, Fc, L, D, top, { fh: 0.8, rows: 2, cols: 3, lamp: [1.1, 0.55],
      bands: [[0, 0.8, WHT], [0.3, 0.48, BLU, 0.04, 0.58], [0.2, 0.26, MR, 0.04, 0.58]], letters: [[A.LMB, 2.3, 0.43, 0.37, 0.79]] });
    island(X, Fc, L / 2, D / 2, 5.6, [['bol', -2.62], ['bol', 2.62], ['col', -2.0], ['col', 2.0], ['pump', -0.88], ['pump', 0.88], ['bin', 0]], { yc, face: A.PM, brand: BLU, column: WHT, base: BLU });
    X.area(Fc, -2.5, L + 2.5, -2.5, D + 2.5); X.folds.push([fc.rec, Fc.P(L / 2 - 2.0, D / 2, 0)]);
    X.pool(Fc, -4, L + 4, -4, D + 4);
    // pole sign on the verge of S Washington St, north of the canopy
    const Fs = signSpot(K, X, ctr[0] + 8, ctr[1] + 14, 2.6);
    if (Fs) poleSign(X, Fs, 3.3, [[A.PR, 2.02], [A.MN, 1.35]], BLU);
    finish(K, X);
  }

  B.heroPlugins = (B.heroPlugins || []).concat(
    { id: 'fuel-hucks', name: "Huck's Food and Fuel", footprints: [1222, 1224], build: hucks },
    { id: 'fuel-marathon', name: 'Marathon Gas', footprints: [1380, 1379], build: marathon });
})();
