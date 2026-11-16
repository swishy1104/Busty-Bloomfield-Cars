/* Bloomfield Drift — hero plug-in: the Dairy Queen Grill & Chill on the south side of W Main St (State Road 54), map footprint 1183
   (17.1 x 15.9 m, ~440 m west of the courthouse). No open photos of it exist, so it is the brand's newer Grill & Chill prototype of this
   size, chosen from the lidar: roofs.js fits ONE plane over the whole footprint (4.1 m up at the middle, falling 4.5 % from the street
   front to the back) with no sloped band round the edge, i.e. a flat roof behind parapets, not the older red standing-seam mansard.
   Adds: tan stucco on a ledgestone base, storefront glass (reflective, with booths, tables, lamps and the order counter behind it; lit at
   dusk), the entrance under a tall forward-leaning red fascia lettered "Dairy Queen" / "Grill & Chill" (plain bold sans-serif, no logos),
   red standing-seam canopy bands, roof units; a drive-thru lane round the building (counter-clockwise, so the driver's window faces the
   building) with clearance bar, menu board, speaker and pick-up window; a fresh asphalt lot over the lidar pavement with striped bays; a
   tall pole sign by Main St; at dusk, pools of light on the lot (a light map on the lot mesh: lamps, doors, windows, pick-up window, menu board).
   Solids: entrance columns, menu board, posts, bollards, sign pole, lot lights (the walls are the footprint's own).
   Public surface: one BD.heroPlugins entry { id: 'dairy-queen', name, footprints: [1183], build(K) } (K = heroes.js kit). Own draw calls:
   an atlas mesh (lettering, stone, seams, interior; emissive at dusk), the lot (tiling asphalt), the glass; plain trim goes in the kit's mesh. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {}), T = THREE;
  const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  try { document.fonts.load('700 80px "Barlow Condensed"'); } catch (e) { /* the lettering falls back to Arial bold */ }

  // ---------- atlas: 1024 x 512, a colour map and a glow map with the same layout. Regions [x, y, w, h] ----------
  const AW = 1024, AH = 512;
  const RG = { DQ: [0, 0, 512, 128], GC: [512, 0, 512, 128], DT: [0, 128, 256, 64], BAR: [0, 192, 256, 32], CLR: [0, 224, 256, 32],
    MENU: [256, 128, 256, 192], STONE: [512, 128, 256, 192], SEAM: [768, 128, 128, 128] };
  // 32 px cells at (896 + 32 i % 4, 128 + 32 (i >> 2)): [day colour, dusk glow]
  const CELL = { W: ['#fff', '#000'], LW: ['#fff', '#8e7556'], LB: ['#fff', '#9a2a22'], LT: ['#fff', '#c9c2b4'], LF: ['#fff', '#4a3a2e'], LL: ['#fff', '#fff1cf'], LC: ['#fff', '#b8a68a'], LS: ['#f3f0e8', '#ffe9bf'] };
  const KEYS = Object.keys(CELL);

  function atlas(U) {
    const draw = (glow) => (g) => {
      const rng = U.mulberry(1183);
      g.fillStyle = '#000'; g.fillRect(0, 0, AW, AH);
      KEYS.forEach((k, i) => { g.fillStyle = CELL[k][glow ? 1 : 0]; g.fillRect(896 + (i % 4) * 32, 128 + (i >> 2) * 32, 32, 32); });
      const text = (r, s, bg, fg, k, y = 0.55) => {
        const [x, y0, w, h] = r; g.fillStyle = bg; g.fillRect(x, y0, w, h);
        let px = h * k; do { g.font = '700 ' + px + 'px ' + FONT; px -= 2; } while (g.measureText(s).width > w * 0.88 && px > 10);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x + w / 2, y0 + h * y);
      };
      // lettering: lit faces glow in their own colours at dusk
      text(RG.DQ, 'Dairy Queen', glow ? '#3a0608' : '#d01f2a', glow ? '#fff6ea' : '#ffffff', 0.74);
      text(RG.GC, 'Grill & Chill', glow ? '#9aa3ab' : '#f5f3ee', glow ? '#2f7ad6' : '#1b5aa6', 0.74);
      text([RG.DT[0], RG.DT[1], 196, 64], 'Drive-Thru', glow ? '#3a0608' : '#d01f2a', glow ? '#fff6ea' : '#ffffff', 0.7);
      { const [x, y] = RG.DT; g.fillStyle = glow ? '#3a0608' : '#d01f2a'; g.fillRect(x + 196, y, 60, 64); g.fillStyle = glow ? '#fff6ea' : '#fff';
        g.beginPath(); g.moveTo(x + 220, y + 8); g.lineTo(x + 234, y + 8); g.lineTo(x + 234, y + 34); g.lineTo(x + 246, y + 34); g.lineTo(x + 227, y + 56); g.lineTo(x + 208, y + 34); g.lineTo(x + 220, y + 34); g.fill(); }
      { const [x, y, w, h] = RG.BAR; g.fillStyle = glow ? '#000' : '#f2c200'; g.fillRect(x, y, w, h); if (!glow) { g.fillStyle = '#1b1b1b'; for (let k = -2; k < 16; k++) { g.beginPath(); g.moveTo(x + k * 24, y + h); g.lineTo(x + k * 24 + 12, y + h); g.lineTo(x + k * 24 + 12 + h, y); g.lineTo(x + k * 24 + h, y); g.fill(); } } }
      text(RG.CLR, 'CLEARANCE 9\'-0"', glow ? '#000' : '#f2c200', glow ? '#000' : '#1b1b1b', 0.8);
      // menu board: three lit panels of price rows under coloured headers
      { const [x, y, w, h] = RG.MENU; g.fillStyle = glow ? '#151515' : '#1c1c1e'; g.fillRect(x, y, w, h);
        for (let c = 0; c < 3; c++) { const px = x + 8 + c * 82, hue = ['#c8202a', '#1d5aa6', '#c8202a'][c];
          g.fillStyle = glow ? '#e8e2d2' : '#d9d4c6'; g.fillRect(px, y + 8, 74, h - 16);
          g.fillStyle = hue; g.fillRect(px, y + 8, 74, 22);
          g.fillStyle = glow ? '#c09a5a' : '#a77d45'; g.fillRect(px + 6, y + 36, 62, 40);   // the food photo
          g.fillStyle = '#2a2a2a'; for (let r = 0; r < 9; r++) { g.fillRect(px + 6, y + 86 + r * 10, 34 + rng() * 14, 4); g.fillRect(px + 56, y + 86 + r * 10, 12, 4); } } }
      // ledgestone: 2 m x 1.5 m, thin courses of varied buff and grey stones in dark joints, seamless left to right
      { const [x, y, w, h] = RG.STONE; g.fillStyle = glow ? '#000' : '#4b4238'; g.fillRect(x, y, w, h);
        if (!glow) for (let yy = 0; yy < h;) { const ch = 6 + rng() * 9 | 0; for (let xx = -rng() * 40; xx < w;) { const cw = 18 + rng() * 46, v = rng(), tone = [[188, 172, 150], [160, 148, 132], [204, 192, 170], [140, 124, 104], [176, 160, 132]][rng() * 5 | 0];
            g.fillStyle = `rgb(${tone.map((q) => q * (0.86 + v * 0.24) | 0).join(',')})`; for (const o of [0, w]) g.fillRect(x + ((xx + o) % (2 * w)) - (xx + o >= w ? w : 0), y + yy + 1, cw - 2, ch - 2);
            xx += cw; } yy += ch; } }
      // standing seam: 1 m x 1 m of red pan with three raised seams (light edge, dark shadow)
      { const [x, y, w, h] = RG.SEAM; g.fillStyle = glow ? '#000' : '#c3202a'; g.fillRect(x, y, w, h);
        if (!glow) for (let k = 0; k < 3; k++) { const sx = x + 21 + k * 43; g.fillStyle = '#d4373d'; g.fillRect(sx - 2, y, 2, h); g.fillStyle = '#8a161c'; g.fillRect(sx, y, 3, h); } }
    };
    return { map: U.canvasTex(AW, AH, draw(false)), glow: U.canvasTex(AW, AH, draw(true)) };
  }
  // the lot: 4 m of light grey aggregate that the vertex colours tint (asphalt, paint, concrete, mulch)
  function groundTex(U) {
    return U.canvasTex(128, 128, (g) => {
      const rng = U.mulberry(5411), im = g.createImageData(128, 128), d = im.data;
      for (let k = 0; k < d.length; k += 4) { const r = rng(), v = r < 0.2 ? 150 + r * 500 : 204 + (r - 0.2) * 30; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
      g.putImageData(im, 0, 0);
    }, true);
  }

  function build(K) {
    const U = B.util, W = B.game.world, scene = B.game.scene, { P, N, G, C, poly, Seg } = K, t0 = performance.now();
    const tex = atlas(U), gtex = groundTex(U), tTex = performance.now() - t0, mb = U.Buf(), gb = U.Buf(), glb = U.Buf(), hb = K.hb;
    const uvOf = (r, i = 1) => [(r[0] + i) / AW, 1 - (r[1] + r[3] - i) / AH, (r[0] + r[2] - i) / AW, 1 - (r[1] + i) / AH];
    const cell = (k) => { const i = KEYS.indexOf(k); return [(896 + (i % 4) * 32 + 16) / AW, 1 - (128 + (i >> 2) * 32 + 16) / AH]; };
    const UVW = cell('W'), WHITE = C(0xffffff), neg = (v) => v.map((x) => -x);
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    // a flat polygon facing (roughly) hint, its true normal from the points; uv: per point, a [u, v] texel, or a function of the point
    function face(pts, hint, col, uv = UVW, buf = mb) {
      let n = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))); if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = neg(n);
      poly(buf, pts, n, col, typeof uv === 'function' ? pts.map(uv) : Array.isArray(uv[0]) ? uv : pts.map(() => uv));
    }
    const quadUV = (r, i) => { const [u0, v0, u1, v1] = uvOf(r, i); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; };
    // rectangle on wall plane w (s along, d out, y up), facing out (or in)
    const rect = (w, s0, s1, d, y0, y1, col, uv = UVW, inward) => face([w.pt(s0, d, y0), w.pt(s1, d, y0), w.pt(s1, d, y1), w.pt(s0, d, y1)], inward ? neg(w.n) : w.n, col, uv);
    // box in wall w's frame: four sides and a top (s0 < s1, d0 < d1)
    function wbox(w, s0, s1, d0, d1, y0, y1, col, uv = UVW, buf = mb) {
      const p = (s, d, y) => w.pt(s, d, y), n = w.n, t = w.t;
      face([p(s0, d0, y0), p(s1, d0, y0), p(s1, d0, y1), p(s0, d0, y1)], neg(n), col, uv, buf); face([p(s0, d1, y0), p(s1, d1, y0), p(s1, d1, y1), p(s0, d1, y1)], n, col, uv, buf);
      face([p(s0, d0, y0), p(s0, d1, y0), p(s0, d1, y1), p(s0, d0, y1)], neg(t), col, uv, buf); face([p(s1, d0, y0), p(s1, d1, y0), p(s1, d1, y1), p(s1, d0, y1)], t, col, uv, buf);
      face([p(s0, d0, y1), p(s1, d0, y1), p(s1, d1, y1), p(s0, d1, y1)], [0, 1, 0], col, uv, buf);
    }
    // surface of revolution round a vertical axis at (x, y, z): prof = [[radius, height], ...] bottom to top, n sides
    function lathe(col, x, y, z, prof, n, buf = mb) {
      for (let i = 0; i < n; i++) { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, am = (a0 + a1) / 2;
        for (let k = 0; k < prof.length - 1; k++) { const [r0, h0] = prof[k], [r1, h1] = prof[k + 1], q = (r, h, a) => [x + r * Math.cos(a), y + h, z + r * Math.sin(a)], sl = Math.atan2(r0 - r1, h1 - h0);
          const pts = [q(r0, h0, a0), q(r0, h0, a1), q(r1, h1, a1), q(r1, h1, a0)].filter((p, j, all) => j === 0 || Math.hypot(p[0] - all[j - 1][0], p[1] - all[j - 1][1], p[2] - all[j - 1][2]) > 1e-6);
          if (pts.length >= 3) poly(buf, pts, [Math.cos(am) * Math.cos(sl), Math.sin(sl), Math.sin(am) * Math.cos(sl)], col, pts.map(() => UVW)); } }
    }
    // a lettered panel centred at c with unit right / up vectors (it faces right x up)
    const panel = (c, r, u, w, h, reg, buf = mb) => { const q = (x, y) => [c[0] + r[0] * x + u[0] * y, c[1] + r[1] * x + u[1] * y, c[2] + r[2] * x + u[2] * y];
      face([q(-w / 2, -h / 2), q(w / 2, -h / 2), q(w / 2, h / 2), q(-w / 2, h / 2)], cross(r, u), WHITE, quadUV(reg, 2), buf); };
    // wall with rectangular holes [s0, s1, y0, y1]; step > 0 also cuts it every step metres (for tiles) and passes the tile start to uv(s, y, s0)
    function holed(w, s0, s1, y0, y1, holes, d, col, uv, inward, step) {
      const cuts = [s0, s1, ...holes.flatMap((h) => [h[0], h[1]])]; if (step) for (let x = Math.ceil(s0 / step) * step; x < s1; x += step) cuts.push(x);
      const xs = [...new Set(cuts.map((x) => Math.min(s1, Math.max(s0, x))))].sort((p, q) => p - q);
      const R = (sa, sb, ya, yb) => { if (yb - ya < 1e-3) return; const t0 = step ? Math.floor((sa + 1e-6) / step) * step : 0;
        rect(w, sa, sb, d, ya, yb, col, typeof uv === 'function' ? (p) => uv(p, t0, w) : uv, inward); };
      for (let i = 0; i < xs.length - 1; i++) {
        const sa = xs[i], sb = xs[i + 1]; let y = y0;
        for (const h of holes.filter((h) => h[0] <= sa + 1e-6 && h[1] >= sb - 1e-6).sort((p, q) => p[2] - q[2])) { if (h[2] > y) R(sa, sb, y, Math.min(h[2], y1)); y = Math.max(y, h[3]); }
        if (y1 > y) R(sa, sb, y, y1);
      }
    }

    // ---------- the frame: footprint corners, walls, heights ----------
    const f = K.fp(1183), rec = f.rec, pk = (fn) => f.pts.reduce((m, p) => (fn(p) > fn(m) ? p : m));
    const SW = pk((p) => -p[0] - p[1]), SE = pk((p) => p[0] - p[1]), NE = pk((p) => p[0] + p[1]), NW = pk((p) => p[1] - p[0]);
    const A = (SE[0] + NE[0]) / 2, D = (NE[1] + NW[1]) / 2;   // east wall a, street-front b (the footprint is square within 0.2 m)
    const rear = Seg(SW[0], SW[1], SE[0], SE[1]), east = Seg(SE[0], SE[1], NE[0], NE[1]), front = Seg(NE[0], NE[1], NW[0], NW[1]), west = Seg(NW[0], NW[1], SW[0], SW[1]);
    const F = rec.floorY, low = f.lo - 0.4, roofAt = (a, b) => { const q = P(a, b, 0), r = rec.roofAt(q[0], q[2]); return r == null ? rec.top : r; };
    const YP = Math.max(roofAt(NE[0] - 0.5, NE[1] - 0.5), roofAt(NW[0] + 0.5, NW[1] - 0.5)) + 0.12;   // parapet line: the lidar roof at the street front, level all round
    const YS = F + 0.65, YH = F + 2.95, YC = F + 3.1, YB = F + 3.2, YA = Math.min(F + 3.95, YP - 0.3), DA = 0.9, YT = YP + 2.0;   // stone top / sill, window head, ceiling, canopy bottom and top, fascia top
    const STUCCO = C(0xd8c8ab), RED = C(0xc3202a), BRONZE = C(0x3b322b), SOFF = C(0xe6e1d6), COPE = C(0xece6da), STEEL = C(0x8e9295);
    const tc = new T.Color(), ao = (base, y0, k) => (p) => tc.copy(base).multiplyScalar(1 - k + k * Math.min(1, Math.max(0, (p[1] - y0) / 1.6)));   // poly() reads the colour at once
    const room = { b: 7.0 };   // dining room: everything in front of b = 7 m (the kitchen behind it)

    // stone uv from the point's position along its wall (the holed() tile start s0 gives the 2 m tile)
    const [su0, sv0, su1, sv1] = uvOf(RG.STONE, 1);
    const sUV = (w) => (p, s0) => { const s = (p[0] - w.pt(0, 0, 0)[0]) * w.t[0] + (p[2] - w.pt(0, 0, 0)[2]) * w.t[2]; return [su0 + (su1 - su0) * Math.min(1, Math.max(0, (s - s0) / 2)), sv1 - (sv1 - sv0) * Math.min(1, (YS - p[1]) / 1.5)]; };
    // a stone-clad block in wall w's frame (columns, the sign's base), courses counted down from its top
    function stoneBox(w, s0, s1, d0, d1, y0, y1) {
      const p = (s, d, y) => w.pt(s, d, y), uv = (h, y) => [su0 + (su1 - su0) * h / 2, sv1 - (sv1 - sv0) * Math.min(1, (y1 - y) / 1.5)];
      for (const [a, b, n] of [[[s0, d1], [s1, d1], w.n], [[s1, d0], [s0, d0], neg(w.n)], [[s1, d1], [s1, d0], w.t], [[s0, d0], [s0, d1], neg(w.t)]]) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); face([p(a[0], a[1], y0), p(b[0], b[1], y0), p(b[0], b[1], y1), p(a[0], a[1], y1)], n, WHITE, [uv(0, y0), uv(L, y0), uv(L, y1), uv(0, y1)]); }
      face([p(s0, d0, y1), p(s1, d0, y1), p(s1, d1, y1), p(s0, d1, y1)], [0, 1, 0], C(0xb9ac96));
    }

    // ---------- openings per wall: [s0, s1, y0, y1, kind] ----------
    const Lf = front.L, Lw = west.L, Le = east.L, Lr = rear.L, sc = Lf - 6.2, TW0 = sc - 2.15, TW1 = sc + 2.15;   // entrance centre and fascia ends (s from the NE corner)
    const sOfB = (w, b0, b1, b) => (b - b0) / (b1 - b0) * w.L;   // s on a side wall where it crosses b
    const wE7 = sOfB(east, SE[1], NE[1], room.b), wW7 = sOfB(west, NW[1], SW[1], room.b);
    const groups = new Map([[front, [[0.6, TW0 - 0.45, 4], [TW1 + 0.45, Lf - 0.6, 2]]], [west, [[0.6, wW7 - 0.3, 4]]], [east, [[wE7 + 2.9, Le - 0.6, 2]]], [rear, []]]);
    const pick = [5.0, 6.6, F + 0.95, F + 2.2], door = [3.2, 4.2, F, F + 2.15], ent = [sc - 1.6, sc + 1.6, F, YH];
    const holes = (w) => [...groups.get(w).map((g) => [g[0], g[1], YS, YH]), ...(w === front ? [ent] : w === east ? [pick] : w === rear ? [door] : [])];

    // ---------- walls: ledgestone base, stucco to the parapet, coping; inner faces round the dining room ----------
    for (const w of [rear, east, front, west]) {
      const hs = holes(w);
      holed(w, 0, w.L, low, YS, hs, 0, WHITE, sUV(w), false, 2);
      holed(w, 0, w.L, YS, YP, hs, 0, ao(STUCCO, YS, 0.25), UVW);
      wbox(w, -0.06, w.L + 0.06, -0.02, 0.07, YS - 0.06, YS, C(0xb9ac96));                                      // stone cap
      w.box(-0.3, w.L + 0.3, -0.3, 0.1, YP, YP + 0.12, COPE, true);                                               // coping
      w.box(-0.06, w.L + 0.06, 0, 0.05, YP - 0.34, YP - 0.26, C(0xb4a385));                                       // reveal band under the coping
      // parapet inside, down to the lidar roof
      const rr = (s) => { const q = w.pt(s, -0.4, 0), r = rec.roofAt(q[0], q[2]); return r == null ? rec.top : r; }, r0 = rr(0.4), r1 = rr(w.L - 0.4);
      face([w.pt(0, -0.25, r0), w.pt(w.L, -0.25, r1), w.pt(w.L, -0.25, YP), w.pt(0, -0.25, YP)], neg(w.n), C(0xc9bba0));
    }
    // roof membrane on the lidar plane, two roof-top units and the kitchen exhaust
    { const c = [[SW[0] + 0.25, SW[1] + 0.25], [SE[0] - 0.25, SE[1] + 0.25], [NE[0] - 0.25, NE[1] - 0.25], [NW[0] + 0.25, NW[1] - 0.25]];
      face(c.map((q) => P(q[0], q[1], roofAt(q[0], q[1]) - 0.02)), [0, 1, 0], C(0xa9a8a2));
      for (const [a, b, l, d, h, col] of [[3.0, 3.5, 2.2, 1.4, 1.1, 0xb9bcbc], [9.5, 9.0, 2.0, 1.3, 1.0, 0xb4b7b7], [12.6, 2.6, 0.9, 0.9, 0.75, 0x9da1a2]]) {
        const s = Seg(a, b, a + l, b), y = roofAt(a + l / 2, b - d / 2); wbox(s, 0, l, 0, d, y - 0.05, y + h, C(col)); wbox(s, 0.1, l - 0.1, 0.1, d - 0.1, y + h, y + h + 0.06, C(0x6f7374)); } }

    // ---------- storefront glass: reveals, bronze frames, glass, and the room behind ----------
    const glassQ = (w, s0, s1, y0, y1) => face([w.pt(s0, -0.07, y0), w.pt(s1, -0.07, y0), w.pt(s1, -0.07, y1), w.pt(s0, -0.07, y1)], w.n, WHITE, UVW, glb);
    function reveals(w, s0, s1, y0, y1, col) {
      face([w.pt(s0, 0, y0), w.pt(s0, -0.25, y0), w.pt(s0, -0.25, y1), w.pt(s0, 0, y1)], w.t, col); face([w.pt(s1, 0, y0), w.pt(s1, -0.25, y0), w.pt(s1, -0.25, y1), w.pt(s1, 0, y1)], neg(w.t), col);
      face([w.pt(s0, 0, y1), w.pt(s1, 0, y1), w.pt(s1, -0.25, y1), w.pt(s0, -0.25, y1)], [0, -1, 0], col); face([w.pt(s0, 0, y0), w.pt(s1, 0, y0), w.pt(s1, -0.25, y0), w.pt(s0, -0.25, y0)], [0, 1, 0], C(0xb9ac96));
    }
    const dim = (hex) => C(hex).multiplyScalar(0.62), BOOTH = dim(0x8e1d1a), TABLE = dim(0xc9c3b6), FLOOR = dim(0x6a5446), INW = dim(0xcdbd9f), LAMP = C(0xfff4dc);
    for (const [w, gs] of groups) for (const [g0, g1, n] of gs) {
      reveals(w, g0, g1, YS, YH, ao(STUCCO, YS, 0.2));
      const lw = (g1 - g0) / n;
      w.box(g0, g1, -0.12, -0.02, YS, YS + 0.07, BRONZE); w.box(g0, g1, -0.12, -0.02, YH - 0.07, YH, BRONZE);
      for (let k = 0; k <= n; k++) { const s = g0 + k * lw; w.box(Math.max(g0, s - 0.035), Math.min(g1, s + 0.035), -0.13, -0.02, YS, YH, BRONZE); }
      for (let k = 0; k < n; k++) {
        const a = g0 + k * lw, b = a + lw; glassQ(w, a + 0.03, b - 0.03, YS + 0.07, YH - 0.07);
        // a booth set at each lite: high backs square to the glass, two seats, a table and a lamp over it
        if (lw > 1.7) {
          const m = (a + b) / 2; for (const [x0, x1] of [[a + 0.06, a + 0.18], [b - 0.18, b - 0.06]]) wbox(w, x0, x1, -1.6, -0.3, F, F + 1.2, BOOTH, cell('LB'));
          for (const [x0, x1] of [[a + 0.18, a + 0.66], [b - 0.66, b - 0.18]]) wbox(w, x0, x1, -1.6, -0.3, F, F + 0.46, BOOTH, cell('LB'));
          wbox(w, m - 0.36, m + 0.36, -1.2, -0.32, F + 0.72, F + 0.77, TABLE, cell('LT')); wbox(w, m - 0.06, m + 0.06, -0.8, -0.68, F, F + 0.72, STEEL, cell('LT'));
          wbox(w, m - 0.16, m + 0.16, -0.92, -0.6, F + 2.12, F + 2.3, LAMP, cell('LL'));
        } else { const m = (a + b) / 2; wbox(w, m - 0.38, m + 0.38, -1.1, -0.35, F + 0.72, F + 0.77, TABLE, cell('LT')); wbox(w, m - 0.15, m + 0.15, -0.88, -0.58, F + 2.12, F + 2.3, LAMP, cell('LL')); }
      }
    }
    // the dining room: floor, ceiling with light panels, inner wall faces (with the window holes), the back wall with the counter and menu
    { const rW = west.pt(wW7, -0.25, 0), rE = east.pt(wE7, -0.25, 0), cNE = front.pt(0.25, -0.25, 0), cNW = front.pt(Lf - 0.25, -0.25, 0), at = (p, y) => [p[0], y, p[2]];
      face([rW, rE, cNE, cNW].map((p) => at(p, F + 0.01)), [0, 1, 0], FLOOR, cell('LF'));
      face([rW, rE, cNE, cNW].map((p) => at(p, YC)), [0, -1, 0], dim(0xcfc9bd), cell('LC'));
      for (const w of [front, west, east]) { const [s0, s1] = w === front ? [0, Lf] : w === west ? [0, wW7] : [wE7, Le];
        holed(w, s0, s1, F, YC, holes(w).filter((h) => h[1] > s0 && h[0] < s1), -0.25, INW, cell('LW'), true); }
      const back = Seg(...K.toLocal(rE[0], rE[2]), ...K.toLocal(rW[0], rW[2]));   // outward = into the room (+b)
      rect(back, 0, back.L, 0, F, YC, dim(0xd3c3a3), cell('LW')); rect(back, 0, back.L, 0.01, F + 2.75, YC, dim(0xc3202a), cell('LB'));
      wbox(back, 2.2, back.L - 2.2, 0, 0.8, F, F + 1.05, dim(0xd9d4c8), cell('LT'));
      for (let k = 0; k < 3; k++) { const m = back.L / 2 + (k - 1) * 1.9; panel(back.pt(m, 0.03, F + 2.35), back.t, [0, 1, 0], 1.7, 1.15, RG.MENU); }
      for (const [s, d] of [[3, 2.2], [8.5, 2.2], [14, 2.2], [5.5, 5.5], [11.5, 5.5]]) { const q = front.pt(Math.min(Lf - 1, s), -d, 0); face([[q[0] - 0.5, YC - 0.01, q[2] - 0.5], [q[0] + 0.5, YC - 0.01, q[2] - 0.5], [q[0] + 0.5, YC - 0.01, q[2] + 0.5], [q[0] - 0.5, YC - 0.01, q[2] + 0.5]], [0, -1, 0], LAMP, cell('LL')); }
      for (const s of [4.5, 8.0, 12.0]) { const q = front.pt(s, -4.6, 0), t = Seg(...K.toLocal(q[0], q[2]), ...K.toLocal(q[0] + 1, q[2])); wbox(t, -0.4, 0.4, -0.4, 0.4, F + 0.72, F + 0.77, TABLE, cell('LT')); wbox(t, -0.06, 0.06, -0.06, 0.06, F, F + 0.72, STEEL, cell('LT')); }
    }

    // ---------- the entrance: doors with sidelights and transoms under the tall leaning fascia ----------
    { const w = front, e0 = ent[0], e1 = ent[1], yT = F + 2.25;
      reveals(w, e0, e1, F, YH, ao(STUCCO, F, 0.2));
      for (const s of [e0, sc - 0.9, sc, sc + 0.9, e1]) w.box(s - 0.05, s + 0.05, -0.13, -0.01, F, YH, BRONZE);
      w.box(e0, e1, -0.13, -0.01, yT - 0.05, yT + 0.05, BRONZE); w.box(e0, e1, -0.13, -0.01, YH - 0.07, YH, BRONZE);
      for (const [a, b] of [[e0, sc - 0.9], [sc + 0.9, e1]]) { w.box(a, b, -0.13, -0.01, F, F + 0.3, BRONZE); glassQ(w, a + 0.05, b - 0.05, F + 0.3, yT - 0.05); }
      for (const [a, b] of [[sc - 0.9, sc], [sc, sc + 0.9]]) { w.box(a, b, -0.12, -0.02, F, F + 0.25, BRONZE); w.box(a + 0.08, b - 0.08, -0.03, 0.02, F + 0.98, F + 1.04, C(0xc8cccf)); glassQ(w, a + 0.05, b - 0.05, F + 0.25, yT - 0.05); }
      for (const [a, b] of [[e0, sc - 0.9], [sc - 0.9, sc + 0.9], [sc + 0.9, e1]]) glassQ(w, a + 0.05, b - 0.05, yT + 0.05, YH - 0.07);
      // the fascia: a red box over the doors whose face leans out as it rises, on two columns
      const d0 = 1.6, d1 = 2.25, p = (s, d, y) => w.pt(s, d, y);
      face([p(TW0, d0, YB), p(TW1, d0, YB), p(TW1, d1, YT), p(TW0, d1, YT)], w.n, RED);
      face([p(TW0, 0, YB), p(TW0, d0, YB), p(TW0, d1, YT), p(TW0, 0, YT)], neg(w.t), RED); face([p(TW1, 0, YB), p(TW1, d0, YB), p(TW1, d1, YT), p(TW1, 0, YT)], w.t, RED);
      face([p(TW0, 0, YB), p(TW1, 0, YB), p(TW1, d0, YB), p(TW0, d0, YB)], [0, -1, 0], SOFF, cell('LS'));
      face([p(TW0, 0, YT), p(TW1, 0, YT), p(TW1, 0, YP), p(TW0, 0, YP)], neg(w.n), ao(STUCCO, YP, 0.1));
      w.box(TW0 - 0.05, TW1 + 0.05, -0.05, d1 + 0.08, YT, YT + 0.12, COPE, true);
      const up = unit(sub(p(sc, d1, YT), p(sc, d0, YB))), nf = cross(w.t, up), at = (y, off) => { const q = p(sc, d0 + (d1 - d0) * (y - YB) / (YT - YB), y); return [q[0] + nf[0] * off, q[1] + nf[1] * off, q[2] + nf[2] * off]; };
      panel(at(YT - 0.85, 0.03), w.t, up, 3.75, 0.94, RG.DQ);
      panel(at(YB + 0.95, 0.03), w.t, up, 3.1, 0.78, RG.GC);
      for (const s of [sc - 0.9, sc + 0.9]) { const q = p(s, 0.9, YB - 0.01); face([[q[0] - 0.2, q[1], q[2] - 0.2], [q[0] + 0.2, q[1], q[2] - 0.2], [q[0] + 0.2, q[1], q[2] + 0.2], [q[0] - 0.2, q[1], q[2] + 0.2]], [0, -1, 0], LAMP, cell('LL')); }
      for (const s of [TW0 + 0.25, TW1 - 0.25]) {
        stoneBox(w, s - 0.22, s + 0.22, d0 - 0.47, d0 - 0.03, low, YS + 0.1);
        wbox(w, s - 0.2, s + 0.2, d0 - 0.45, d0 - 0.05, YS + 0.1, YB, ao(STUCCO, YS, 0.15));
        const c = w.pt(s, d0 - 0.25, 0), l = K.toLocal(c[0], c[2]); K.circle(l[0], l[1], 0.36);   // >= 0.35: game.js lets thinner posts break away
      }
    }

    // ---------- canopy bands: red standing seam sloping out over the windows, mitred round the street corners ----------
    function band(w, s0, s1, m0, m1) {
      const [u0, v0, u1, v1] = uvOf(RG.SEAM, 1), x0 = s0 - (m0 ? DA : 0), x1 = s1 + (m1 ? DA : 0), top = (s) => w.pt(Math.min(s1, Math.max(s0, s)), 0, YA), bot = (s) => w.pt(s, DA, YB);
      const nrm = unit(cross(w.t, sub(top((s0 + s1) / 2), bot((s0 + s1) / 2))));
      for (let x = x0; x < x1 - 1e-3; x += 1) { const xb = Math.min(x1, x + 1), cs = (s) => Math.min(s1, Math.max(s0, s)), u = (s) => u0 + (u1 - u0) * (s - x);
        poly(mb, [bot(x), bot(xb), top(xb), top(x)], nrm, WHITE, [[u(x), v0], [u(xb), v0], [u(cs(xb)), v1], [u(cs(x)), v1]].map((q) => [Math.min(u1, Math.max(u0, q[0])), q[1]])); }
      face([w.pt(s0, 0, YB), w.pt(s1, 0, YB), w.pt(x1, DA, YB), w.pt(x0, DA, YB)], [0, -1, 0], SOFF);
      face([w.pt(x0, DA, YB - 0.12), w.pt(x1, DA, YB - 0.12), w.pt(x1, DA, YB + 0.02), w.pt(x0, DA, YB + 0.02)], w.n, C(0x9e1a22));
      if (!m0) face([w.pt(s0, 0, YA), w.pt(s0, 0, YB), w.pt(s0, DA, YB)], neg(w.t), RED);
      if (!m1) face([w.pt(s1, 0, YA), w.pt(s1, 0, YB), w.pt(s1, DA, YB)], w.t, RED);
      return { nrm, at: (s, k, off) => { const q = bot(s), r = top(s); return [q[0] + (r[0] - q[0]) * k + nrm[0] * off, q[1] + (r[1] - q[1]) * k + nrm[1] * off, q[2] + (r[2] - q[2]) * k + nrm[2] * off]; }, up: unit(sub(top(s0 + 0.5), bot(s0 + 0.5))) };
    }
    band(front, 0, TW0, true, false); band(front, TW1, Lf, false, true);
    const bw = band(west, 0, wW7 + 0.2, true, false), be = band(east, wE7 + 2.4, Le, false, true);
    panel(bw.at(wW7 / 2 + 0.6, 0.5, 0.025), west.t, bw.up, 2.9, 0.62, RG.DQ);
    panel(be.at((wE7 + 2.4 + Le) / 2, 0.5, 0.025), east.t, be.up, 2.9, 0.62, RG.DQ);

    // ---------- pick-up window (east wall, the driver's side) and the service door at the back ----------
    { const w = east, [s0, s1, y0, y1] = pick; reveals(w, s0, s1, y0, y1, ao(STUCCO, YS, 0.2));
      wbox(w, s0 - 0.25, s1 + 0.25, 0, 0.32, y0 - 0.12, y0 - 0.02, STEEL);
      for (const [a, b, c, d] of [[s0, s1, y0, y0 + 0.06], [s0, s1, y1 - 0.06, y1], [s0, s0 + 0.06, y0, y1], [s1 - 0.06, s1, y0, y1], [(s0 + s1) / 2 - 0.03, (s0 + s1) / 2 + 0.03, y0, y1]]) w.box(a, b, -0.12, -0.02, c, d, BRONZE);
      glassQ(w, s0 + 0.05, s1 - 0.05, y0 + 0.05, y1 - 0.05);
      wbox(w, s0 - 0.45, s1 + 0.45, 0, 0.95, y1 + 0.35, y1 + 0.55, RED); face([w.pt(s0 - 0.45, 0, y1 + 0.35), w.pt(s1 + 0.45, 0, y1 + 0.35), w.pt(s1 + 0.45, 0.95, y1 + 0.35), w.pt(s0 - 0.45, 0.95, y1 + 0.35)], [0, -1, 0], SOFF, cell('LS'));
      panel(w.pt((s0 + s1) / 2, 0.96, y1 + 0.45), w.t, [0, 1, 0], 0.8, 0.2, RG.DT);
      const q = w.pt(s0 - 0.6, -1.4, 0), r = w.pt(s1 + 0.6, -1.4, 0), ks = Seg(...K.toLocal(q[0], q[2]), ...K.toLocal(r[0], r[2]));
      rect(ks, 0, ks.L, 0, F, YC, C(0x8a8c8a), cell('LT')); wbox(ks, 0.2, ks.L - 0.2, 0, 0.6, F, F + 0.92, C(0xb9bdbf), cell('LT'));
      face([w.pt(s0 - 0.6, -0.25, YC), w.pt(s1 + 0.6, -0.25, YC), w.pt(s1 + 0.6, -1.4, YC), w.pt(s0 - 0.6, -1.4, YC)], [0, -1, 0], C(0xd8d6d0), cell('LL'));
      for (const s of [s0 - 0.6, s1 + 0.6]) face([w.pt(s, -0.25, F), w.pt(s, -1.4, F), w.pt(s, -1.4, YC), w.pt(s, -0.25, YC)], s < s0 ? w.t : neg(w.t), C(0x8a8c8a), cell('LT'));
    }
    { const w = rear, [s0, s1, y0, y1] = door; reveals(w, s0, s1, y0, y1, ao(STUCCO, F, 0.2)); rect(w, s0, s1, -0.1, y0, y1, C(0x5b4a3c));
      wbox(w, (s0 + s1) / 2 - 0.15, (s0 + s1) / 2 + 0.15, 0, 0.18, y1 + 0.25, y1 + 0.4, C(0x2a2a2a)); face([w.pt((s0 + s1) / 2 - 0.12, 0.1, y1 + 0.249), w.pt((s0 + s1) / 2 + 0.12, 0.1, y1 + 0.249), w.pt((s0 + s1) / 2 + 0.12, 0.17, y1 + 0.249), w.pt((s0 + s1) / 2 - 0.12, 0.17, y1 + 0.249)], [0, -1, 0], LAMP, cell('LL')); }

    // ---------- the lot: fresh asphalt over the lidar pavement (its holes are where cars stood during the survey), paint, kerbs ----------
    const gcol = (c, b) => (q) => tc.copy(c).multiplyScalar(1 + b * Math.sin(q[0] * 0.37) * Math.sin(q[2] * 0.29));
    function pave(q, col, off = 0.05, cs = 3) {   // quad [[a, b] x 4] counter-clockwise, tessellated to follow the ground
      const L = (p, r) => Math.hypot(r[0] - p[0], r[1] - p[1]), nu = Math.max(1, Math.ceil(Math.max(L(q[0], q[1]), L(q[3], q[2])) / cs)), nv = Math.max(1, Math.ceil(Math.max(L(q[0], q[3]), L(q[1], q[2])) / cs)), k0 = gb.pos.length / 3;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, ab = [0, 1].map((k) => (1 - v) * ((1 - u) * q[0][k] + u * q[1][k]) + v * ((1 - u) * q[3][k] + u * q[2][k])), p = P(ab[0], ab[1], G(ab[0], ab[1]) + off), c = typeof col === 'function' ? col(p) : col;
        gb.pos.push(p[0], p[1], p[2]); gb.nor.push(0, 1, 0); gb.col.push(c.r, c.g, c.b); gb.uv.push(p[0] / 4, p[2] / 4);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = k0 + j * (nu + 1) + i; gb.idx.push(k, k + 1, k + nu + 2, k, k + nu + 2, k + nu + 1); }
    }
    const gpoly = (ab, col, off) => poly(gb, ab.map((q) => P(q[0], q[1], G(q[0], q[1]) + off)), [0, 1, 0], col, ab.map((q) => { const p = P(q[0], q[1], 0); return [p[0] / 4, p[2] / 4]; }));
    function line(a0, b0, a1, b1, w, col, off = 0.07) {   // painted line, cut every 2.5 m to follow the ground
      const L = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.ceil(L / 2.5)), ua = (a1 - a0) / L, ub = (b1 - b0) / L, pa = -ub * w / 2, pb = ua * w / 2;
      for (let k = 0; k < n; k++) { const s = L * k / n, e = L * (k + 1) / n; gpoly([[a0 + ua * s - pa, b0 + ub * s - pb], [a0 + ua * e - pa, b0 + ub * e - pb], [a0 + ua * e + pa, b0 + ub * e + pb], [a0 + ua * s + pa, b0 + ub * s + pb]], col, off); }
    }
    function arrow(a, b, da, db, col) { const pa = -db, pb = da, Q = (s, t) => [a + da * s + pa * t, b + db * s + pb * t];
      gpoly([Q(-1.3, -0.13), Q(0.3, -0.13), Q(0.3, 0.13), Q(-1.3, 0.13)], col, 0.07); gpoly([Q(0.3, -0.48), Q(1.3, 0), Q(0.3, 0.48)], col, 0.07); }
    // a raised kerbed bed or slab: top at y (flat) or ground + h, kerb faces down into the ground on the given sides (0 S, 1 E, 2 N, 3 W)
    function bed(a0, a1, b0, b1, top, col, kerb, sides) {
      const c = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]], y = (q) => (typeof top === 'number' ? top : G(q[0], q[1]) + top.h);
      if (typeof top === 'number') poly(gb, c.map((q) => P(q[0], q[1], top)), [0, 1, 0], col, c.map((q) => { const p = P(q[0], q[1], 0); return [p[0] / 4, p[2] / 4]; })); else pave(c, col, top.h, 2.5);
      for (const i of sides) { const p = c[i], q = c[(i + 1) % 4], w = Seg(p[0], p[1], q[0], q[1]), n = Math.max(1, Math.ceil(w.L / 2.5));
        for (let k = 0; k < n; k++) { const s0 = w.L * k / n, s1 = w.L * (k + 1) / n, A0 = [p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], A1 = [p[0] + (q[0] - p[0]) * (k + 1) / n, p[1] + (q[1] - p[1]) * (k + 1) / n];
          face([w.pt(s0, 0, G(A0[0], A0[1]) - 0.08), w.pt(s1, 0, G(A1[0], A1[1]) - 0.08), w.pt(s1, 0, y(A1)), w.pt(s0, 0, y(A0))], w.n, kerb, (r) => [r[0] / 4, r[2] / 4], gb); } }
    }
    // Main St's south edge (b) at a: the nearest road to a point near its centreline, taken only if it runs along a (South Lewis St crosses at the east end)
    const ax = N(1, 0, 0), roadB = (a) => { const q = P(a, D + 24, 0), r = W.nearestRoad(q[0], q[2], 40); return r && Math.abs(r.tx * ax[0] + r.tz * ax[2]) > 0.7 ? K.toLocal(r.x, r.z)[1] - r.hw : NaN; };
    const roadA = (() => { const q = P(A + 18, 6, 0), r = W.nearestRoad(q[0], q[2], 40); return r ? K.toLocal(r.x, r.z)[0] - r.hw : A + 17.6; })();
    const aW = -20.8, aE = roadA - 1.0, rW = roadB(aW), rE = roadB(aE), bN0 = (rW || rE || D + 19.6) - 0.4, bN1 = (rE || rW || D + 19.6) - 0.4, bN = (a) => bN0 + (bN1 - bN0) * (a - aW) / (aE - aW);
    const ASPH = C(0x3d3e40), PAINT = C(0xf0efe6), BLUE = C(0x2a5cb0), CONC = C(0xbdb8ad), MULCH = C(0x4a3427), LANE = { w: -6.0, e: A + 4.0, s: -4.0 };
    // ponytail: rectangles traced once from the 2 m pavement mask (W.maskAt === 5) round the footprint; re-trace if the pavement data changes
    const lot = [[aW, aE, D, Math.max(bN0, bN1)], [aW, -12.8, 1.0, D], [-12.8, -2.1, -7.6, D], [-2.1, 9.5, -7.6, 0], [9.5, aE, -4.2, 0], [A, aE, -4.2, D]];
    pave([[aW, D], [aE, D], [aE, bN1], [aW, bN0]], gcol(ASPH, 0.04));
    for (const [a0, a1, b0, b1] of lot.slice(1)) pave([[a0, b0], [a1, b0], [a1, b1], [a0, b1]], gcol(ASPH, 0.04));
    // the walk along the front (the floor level at the doors), the planted strip between the drive-thru lane and the west wall
    bed(-2.1, A, D, D + 2.0, F - 0.03, CONC, CONC, [1, 2, 3]);
    bed(-2.1, 0, 0, D, { h: 0.13 }, MULCH, CONC, [0, 3]);
    // ponytail: landmarks.js already stands a generic pole sign for this place (its pole-sign pass has no hero check); ours is found by its
    // 0.3 m obstacle and built round it (cabinets 5.3 x 1.8 m enclose its 4.96 x 1.4 m). Drop once landmarks.js skips BD.heroSkip footprints
    let pole = null; { const ob = W.obstacles, lm = W.landmarks && W.landmarks.obstacles, k1 = lm ? lm[1] * 3 : ob.length;
      for (let k = lm ? lm[0] * 3 : 0; k < k1; k += 3) if (Math.abs(ob[k + 2] - 0.3) < 1e-6) { const l = K.toLocal(ob[k], ob[k + 1]); if (l[0] > aW && l[0] < aE && l[1] > D + 6 && l[1] < bN(l[0]) + 1) pole = l; } }
    const [pa, pb] = pole || [0.6, bN(0.6) - 2.4];
    bed(pa - 1.3, pa + 1.3, pb - 1.6, pb + 1.6, { h: 0.15 }, MULCH, CONC, [0, 1, 2, 3]);
    // stalls: nose to the building along the front, to Main St across the aisle (split by the sign's island), west and east rows
    const stalls = (a0, b0, a1, b1, n, along, col = PAINT) => { for (let k = 0; k <= n; k++) { if (along === 'a') { const a = a0 + (a1 - a0) * k / n; line(a, b0, a, b1, 0.1, col); } else { const b = b0 + (b1 - b0) * k / n; line(a0, b, a1, b, 0.1, col); } } };
    stalls(0.4, D + 2.0, 16.9, D + 7.5, 6, 'a'); stalls(3.15, D + 2.0, 5.9, D + 7.5, 1, 'a', BLUE);
    { const bR = Math.min(bN0, bN1), n0 = Math.floor((pa - 1.5 - (aW + 9.2)) / 2.75), n1 = Math.floor((LANE.e + 1.5 - (pa + 1.5)) / 2.75);   // bR: the stripes stay on the asphalt whichever way its edge slants
      if (n0 > 0) stalls(pa - 1.5 - n0 * 2.75, bR - 5.5, pa - 1.5, bR, n0, 'a'); if (n1 > 0) stalls(pa + 1.5, bR - 5.5, pa + 1.5 + n1 * 2.75, bR, n1, 'a'); }
    stalls(aW + 0.2, 1.8, aW + 5.7, 1.8 + 8 * 2.75, 8, 'b');
    stalls(aE - 5.5, -3.0, aE - 0.1, -3.0 + 9 * 2.75, 9, 'b');
    // drive-thru lane: edge line with chamfered corners, arrows round the building
    line(LANE.w, D + 1.2, LANE.w, LANE.s + 1.6, 0.12, PAINT); line(LANE.w, LANE.s + 1.6, LANE.w + 1.6, LANE.s, 0.12, PAINT);
    line(LANE.w + 1.6, LANE.s, LANE.e - 1.6, LANE.s, 0.12, PAINT); line(LANE.e - 1.6, LANE.s, LANE.e, LANE.s + 1.6, 0.12, PAINT); line(LANE.e, LANE.s + 1.6, LANE.e, D + 0.5, 0.12, PAINT);
    for (const [a, b, da, db] of [[-4.05, 12.5, 0, -1], [-4.05, 1.5, 0, -1], [6.5, -2.0, 1, 0], [A + 2.0, 1.0, 0, 1], [A + 2.0, 11.5, 0, 1]]) arrow(a, b, da, db, PAINT);

    // ---------- drive-thru furniture ----------
    const at3 = (a, b, h) => P(a, b, G(a, b) + h), yel = C(0xe8b400), dark = C(0x2b2a29);
    // clearance bar over the lane mouth: two posts, a striped bar, the drive-thru board on top
    { const b = D + 0.7, w = Seg(LANE.w - 0.45, b, -1.65, b), yb = F + 2.9;   // runs east, faces south; the readable faces are on its north side
      for (const s of [0, w.L]) { const q = w.pt(s, 0, 0), l = K.toLocal(q[0], q[2]); wbox(w, s - 0.08, s + 0.08, -0.08, 0.08, G(l[0], l[1]) - 0.1, yb + 0.25, dark); K.circle(l[0], l[1], 0.16); }
      const [u0, v0, u1, v1] = uvOf(RG.BAR, 1); for (const d of [-0.09, 0.09]) face([w.pt(0.08, d, yb), w.pt(w.L - 0.08, d, yb), w.pt(w.L - 0.08, d, yb + 0.2), w.pt(0.08, d, yb + 0.2)], d < 0 ? neg(w.n) : w.n, WHITE, [[u0, v0], [u0 + (u1 - u0) * w.L / 4, v0], [u0 + (u1 - u0) * w.L / 4, v1], [u0, v1]]);
      face([w.pt(0.08, -0.09, yb), w.pt(w.L - 0.08, -0.09, yb), w.pt(w.L - 0.08, 0.09, yb), w.pt(0.08, 0.09, yb)], [0, -1, 0], dark); face([w.pt(0.08, -0.09, yb + 0.2), w.pt(w.L - 0.08, -0.09, yb + 0.2), w.pt(w.L - 0.08, 0.09, yb + 0.2), w.pt(0.08, 0.09, yb + 0.2)], [0, 1, 0], dark);
      const m = w.L / 2, back = neg(w.t); panel(w.pt(m, -0.095, yb - 0.12), back, [0, 1, 0], 1.6, 0.2, RG.CLR);
      wbox(w, m - 1.0, m + 1.0, -0.06, 0.06, yb + 0.2, yb + 0.72, dark); panel(w.pt(m, -0.065, yb + 0.46), back, [0, 1, 0], 1.9, 0.46, RG.DT); }
    // menu board in the planted strip, angled to face the cars coming down the west lane, and the speaker post ahead of it
    { const c = [-1.05, 4.2], t = [-0.5, -0.866], L = 2.5, w = Seg(c[0] - t[0] * L / 2, c[1] - t[1] * L / 2, c[0] + t[0] * L / 2, c[1] + t[1] * L / 2), g = G(...c) + 0.13;
      wbox(w, 0.25, L - 0.25, -0.35, 0.05, g - 0.1, g + 0.75, C(0x8a8378)); wbox(w, 0, L, -0.3, 0, g + 0.75, g + 2.45, dark); wbox(w, 0, L, -0.32, 0.02, g + 2.45, g + 2.62, RED);
      panel(w.pt(L / 2, 0.012, g + 1.6), w.t, [0, 1, 0], L - 0.16, 1.6, RG.MENU); panel(w.pt(L / 2, 0.025, g + 2.535), w.t, [0, 1, 0], 0.62, 0.155, RG.DQ);
      K.wallSeg(c[0] - t[0] * L / 2, c[1] - t[1] * L / 2, c[0] + t[0] * L / 2, c[1] + t[1] * L / 2);
      const sp = [-1.75, 7.0], s = Seg(sp[0], sp[1] + 0.2, sp[0], sp[1] - 0.2), gs = G(...sp) + 0.13; wbox(s, 0, 0.4, -0.15, 0.15, gs - 0.1, gs + 1.05, dark); wbox(s, 0.05, 0.35, 0.15, 0.17, gs + 0.55, gs + 0.95, C(0x55585a)); K.circle(sp[0], sp[1], 0.25); }
    // bollards at the pick-up window
    for (const s of [pick[0] - 0.7, pick[1] + 0.7]) { const q = east.pt(s, 0.5, 0), l = K.toLocal(q[0], q[2]); lathe(yel, q[0], G(l[0], l[1]) - 0.1, q[2], [[0.1, 0], [0.1, 1.05], [0.07, 1.12], [0, 1.14]], 8); K.circle(l[0], l[1], 0.12); }
    // shrubs in the strip
    { const rng = U.mulberry(54); for (const b of [1.2, 9.6, 11.6, 13.6, 15.0]) { const a = -1.05 + (rng() - 0.5) * 0.4, r = 0.45 + rng() * 0.2, q = P(a, b, G(a, b) + 0.1); const c0 = C(0x2f4a24).multiplyScalar(0.8 + rng() * 0.4); lathe((p) => tc.copy(c0).multiplyScalar(0.55 + 0.45 * Math.min(1, (p[1] - q[1]) / (r + 0.3))), q[0], q[1], q[2], [[0.25 * r, 0], [0.85 * r, 0.12], [r * 1.05, 0.45 * r + 0.15], [r * 0.85, 0.85 * r + 0.25], [r * 0.4, r + 0.33], [0, r + 0.38]], 9); } }

    // ---------- pole sign by Main St: ledgestone pier, a steel pole, the name cabinet and the Grill & Chill cabinet below ----------
    { const q = P(pa, pb, 0), r = W.nearestRoad(q[0], q[2], 40), d = r ? K.toLocal(q[0] + r.tx, q[2] + r.tz) : [pa + 1, pb], ta = d[0] - pa, tb = d[1] - pb, yg = G(pa, pb);
      const w = Seg(pa + tb * 2.65, pb - ta * 2.65, pa - tb * 2.65, pb + ta * 2.65), L = w.L;   // across the road, so its faces look up and down Main St
      stoneBox(w, L / 2 - 0.55, L / 2 + 0.55, -0.55, 0.55, yg - 0.3, yg + 1.3); wbox(w, L / 2 - 0.6, L / 2 + 0.6, -0.6, 0.6, yg + 1.3, yg + 1.4, C(0xb9ac96));
      lathe(C(0x4a4d50), q[0], yg + 1.3, q[2], [[0.28, 0], [0.28, 7.5]], 10);
      for (const [s0, s1, d0, y0, y1, reg, frame] of [[0, L, 0.38, yg + 7.0, yg + 8.8, RG.DQ, RED], [0.55, L - 0.55, 0.36, yg + 5.6, yg + 6.7, RG.GC, C(0xe9e6df)]]) {
        wbox(w, s0, s1, -d0, d0, y0, y1, frame); face([w.pt(s0, -d0, y0), w.pt(s1, -d0, y0), w.pt(s1, d0, y0), w.pt(s0, d0, y0)], [0, -1, 0], frame);
        panel(w.pt((s0 + s1) / 2, d0 + 0.012, (y0 + y1) / 2), w.t, [0, 1, 0], s1 - s0 - 0.16, y1 - y0 - 0.16, reg); panel(w.pt((s0 + s1) / 2, -d0 - 0.012, (y0 + y1) / 2), neg(w.t), [0, 1, 0], s1 - s0 - 0.16, y1 - y0 - 0.16, reg);
      }
      K.circle(pa, pb, 0.75); }

    // ---------- back-of-house: downspouts, wall packs, the electric meter; lot lights round the edge ----------
    for (const s of [0.35, Lr - 0.35]) { rear.box(s - 0.06, s + 0.06, 0, 0.09, G(...K.toLocal(rear.pt(s, 0, 0)[0], rear.pt(s, 0, 0)[2])) - 0.05, YP - 0.45, C(0xb8a88e)); rear.box(s - 0.14, s + 0.14, 0, 0.18, YP - 0.6, YP - 0.36, C(0xb8a88e)); }
    for (const [w, s] of [[rear, 7.5], [rear, 13.5], [east, 1.5], [west, 13.0]]) { wbox(w, s - 0.18, s + 0.18, 0, 0.2, F + 3.0, F + 3.28, dark); face([w.pt(s - 0.14, 0.04, F + 2.999), w.pt(s + 0.14, 0.04, F + 2.999), w.pt(s + 0.14, 0.17, F + 2.999), w.pt(s - 0.14, 0.17, F + 2.999)], [0, -1, 0], LAMP, cell('LL')); }
    wbox(rear, 14.6, 15.2, 0, 0.18, F + 0.9, F + 1.75, C(0x8d9192)); wbox(rear, 14.7, 15.1, 0, 0.05, F + 1.75, F + 2.9, C(0x6d7172));
    const lamps = [[aW + 0.7, bN0 - 0.8], [aE - 0.7, bN1 - 0.8], [aW + 0.7, 1.2], [aE - 0.7, -3.5]];
    for (const [a, b] of lamps) {
      const q = P(a, b, 0), g = G(a, b), l = Math.hypot(A / 2 - a, D / 2 - b), s = Seg(a, b, a + (A / 2 - a) / l, b + (D / 2 - b) / l);
      lathe(C(0x9a958b), q[0], g - 0.1, q[2], [[0.22, 0], [0.22, 0.7], [0.09, 0.72]], 8); lathe(C(0x3c3e40), q[0], g + 0.7, q[2], [[0.075, 0], [0.06, 7.0], [0, 7.05]], 6);
      wbox(s, -0.05, 0.95, -0.2, 0.2, g + 7.65, g + 7.8, dark); face([s.pt(0.1, -0.16, g + 7.649), s.pt(0.9, -0.16, g + 7.649), s.pt(0.9, 0.16, g + 7.649), s.pt(0.1, 0.16, g + 7.649)], [0, -1, 0], LAMP, cell('LL'));
      K.circle(a, b, 0.25);
    }

    // ---------- dusk light on the ground: a light map over the lot (uv2) with pools under the lamps, at the doors, windows, pick-up window, menu board ----------
    const L0 = [aW - 1, -9], L1 = [aE + 1, Math.max(bN0, bN1) + 1], loc = (w, s, d) => { const q = w.pt(s, d, 0); return K.toLocal(q[0], q[2]); };
    const pools = [...lamps.map(([a, b]) => [a, b, 11, 0.85]), [...loc(front, sc, 1.6), 5, 1], [...loc(east, (pick[0] + pick[1]) / 2, 1.3), 3.5, 0.8], [-2.6, 5.0, 3, 0.6],
      ...[[rear, 7.5], [rear, 13.5], [east, 1.5], [west, 13.0]].map(([w, s]) => [...loc(w, s, 1.6), 4.5, 0.55]),
      ...[...groups].flatMap(([w, gs]) => gs.flatMap(([g0, g1]) => { const r = []; for (let s = g0 + 0.8; s < g1; s += 1.6) r.push([...loc(w, s, 1.2), 2.6, 0.35]); return r; }))];
    const lmap = U.canvasTex(128, 128, (g) => { const sx = 128 / (L1[0] - L0[0]), sy = 128 / (L1[1] - L0[1]); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
      g.setTransform(sx, 0, 0, -sy, -L0[0] * sx, L1[1] * sy); g.globalCompositeOperation = 'lighter';   // draw in frame metres, b up (the texture's v)
      for (const [a, b, r, k] of pools) { const gr = g.createRadialGradient(a, b, 0, a, b, r); gr.addColorStop(0, `rgba(255,232,196,${k})`); gr.addColorStop(1, 'rgba(255,232,196,0)'); g.fillStyle = gr; g.fillRect(a - r, b - r, 2 * r, 2 * r); } });
    const uv2 = (geo) => { const p = geo.attributes.position, t = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { const l = K.toLocal(p.getX(i), p.getZ(i)); t[2 * i] = (l[0] - L0[0]) / (L1[0] - L0[0]); t[2 * i + 1] = (l[1] - L0[1]) / (L1[1] - L0[1]); }
      geo.setAttribute('uv2', new T.BufferAttribute(t, 2)); return geo; };

    // ---------- meshes ----------
    const mat = new T.MeshLambertMaterial({ vertexColors: true, map: tex.map, emissiveMap: tex.glow, emissive: new T.Color(0, 0, 0) });
    const glass = new T.MeshStandardMaterial({ color: C(0x22343a), roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.44, depthWrite: false });
    const tGeo = performance.now() - t0 - tTex;
    const gmat = new T.MeshLambertMaterial({ vertexColors: true, map: gtex, lightMap: lmap, lightMapIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const meshes = [[mb, mat, true], [gb, gmat, false], [glb, glass, false]].filter((q) => q[0].idx.length).map(([buf, m, sh]) => { const o = new T.Mesh(buf === gb ? uv2(U.bufGeo(buf)) : U.bufGeo(buf), m); o.castShadow = sh; o.receiveShadow = true; o.name = 'hero-dq'; scene.add(o); return o; });
    const g0 = W.windowGlow; W.windowGlow = (v) => { if (g0) g0(v); mat.emissive.setScalar(v); gmat.lightMapIntensity = Math.max(0, v - 0.3) * 6; };
    { const o = P(0, 0, 0), ea = P(1, 0, 0), eb = P(0, 1, 0), ax = ea[0] - o[0], az = ea[2] - o[2], bx = eb[0] - o[0], bz = eb[2] - o[2], s0 = W.surface, bed = [[-2.1, 0, 0, D], [pa - 1.3, pa + 1.3, pb - 1.6, pb + 1.6]];
      W.surface = (X, Z) => { const a = (X - o[0]) * ax + (Z - o[2]) * az, b = (X - o[0]) * bx + (Z - o[2]) * bz;
        for (const r of lot) if (a > r[0] && a < r[1] && b > r[2] && b < r[3]) { for (const q of bed) if (a > q[0] && a < q[1] && b > q[2] && b < q[3]) return 0; return 1; }
        return s0(X, Z); }; }
    K.keep(0, A, 0, D); K.keep(aW, aE, -8, Math.max(bN0, bN1));
    K.result.info = { F: +F.toFixed(2), YP: +(YP - F).toFixed(2), A: +A.toFixed(2), D: +D.toFixed(2), tris: meshes.reduce((t, o) => t + o.geometry.index.count / 3, 0), texMs: +tTex.toFixed(1), geoMs: +tGeo.toFixed(1), ms: +(performance.now() - t0).toFixed(1) };
  }

  B.heroPlugins = (B.heroPlugins || []).concat({ id: 'dairy-queen', name: 'Dairy Queen Grill & Chill', footprints: [1183], build });
})();
