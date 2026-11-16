/* Bloomfield Drift — hero plug-in (heroes.js kit): the house on US 231 half a mile south of the town square (routes.js's south band), from
   the owner's four Street View screenshots as they were described to us (never their pixels), on the band's Overture footprint and lidar
   ground (corridors.js), and the place next door.
   - The house: the band footprint holding the Overture address point (28.6 m long; a covered entry 8.1 m wide projects 3.5 m in the middle of
     the front and the north 10.2 m stands 0.7 m forward) and the one-storey rear addition touching its back (its own footprint, flat roofed as
     the lidar has it). A one-and-a-half-storey Cape: steep side-gabled roof of charcoal shingles, three gabled dormers on the front slope, the
     north end a front-facing cross gable whose gable wall is tan ledgestone like the whole ground floor of the front, cream siding on the
     gable ends, dormer cheeks and back, white-trimmed double-hung windows, a low-slope metal roof on white posts over the covered entry, mulch
     beds of round clipped shrubs along the whole front, a red Japanese maple at the left front corner, a white propane tank on the lawn to
     the right. The lidar classed this roof flat (median 4.5 m over the ground, no slope fit), so the eave (3.1 m) and ridge (6.6 m) follow
     the photos' one-and-a-half storeys, keeping the model's median roof height near the lidar's (about 5 m).
   - The lawn from the road ditch to the woods, mowed in diagonal stripes (the lidar trees stand on it: the tall sycamores in front, the white
     pines behind); a white crushed-limestone drive leaving US 231 at a short asphalt apron edged with red brick pavers (a white double mailbox
     on a square post with a small blue plaque, no number, at the mouth), curving up the lawn and on as a gravel strip in front of the house
     to a white pole building between the two houses.
   - Next door on the left (south): a single-storey ranch (white siding, dark grey roof, a front-gabled porch with craftsman trim, ledgestone
     wainscot and piers), its concrete drive curving up the hill from the road. Neither it nor the pole building is in Overture or the lidar
     (both newer than the scan), so they stand where the screenshots put them, on the spur south of the house; lidar trees on them are hidden.
   The drives are drivable: W.maskAt answers gravel (2) on the limestone, pavement (5, asphalt to the tyres) on the concrete and the apron and
   building (4) inside the two new buildings, and W.surface / W.inBuilding follow it. Solids (a W.collide wrapper, as hero_destinations.js):
   the new buildings' walls, porch posts, mailbox post, tank, maple trunk; the house's own footprint is already solid in routes.js, whose plain
   shells of it are folded away. Shown within 1.6 km: heroes.js's facade and roof materials (bound on the first frame), a ledgestone material,
   the paving (the terrain's detail texture, polygon-offset) and, within 350 m (while routes.js draws the band at its 4 m level, whose
   triangles it is cut from), the striped lawn: 5 draw calls, about 8,300 triangles. Dusk: windows and porch lamps light with the town's.
   Public: one BD.heroPlugins entry 'us231' (footprints: []); nothing else. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {}), CD = window.BLOOMFIELD_CORRIDORS;
  const band = CD && CD.corridors && CD.corridors.find((c) => c.kind === 'area');
  if (!band) return;
  const ADDR = [515.3, -2560.6];      // the Overture address point (map metres)
  const inPoly = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > y) !== (p[j + 1] > y) && x < p[j] + (y - p[j + 1]) / (p[i + 1] - p[j + 1]) * (p[i] - p[j])) c = !c; return c; };
  const segD = (x, y, ax, ay, bx, by) => { const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(x - ax - ex * t, y - ay - ey * t); };
  const ringD = (p, x, y) => { let d = 1e9; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) d = Math.min(d, segD(x, y, p[j], p[j + 1], p[i], p[i + 1])); return d; };
  // the house: the band footprint holding the address point (else the nearest within 40 m); the rear addition: footprints within 2 m of it
  let hi = band.buildings.findIndex((b) => inPoly(b.p, ADDR[0], ADDR[1]));
  if (hi < 0) { let best = 40; band.buildings.forEach((b, i) => { const d = ringD(b.p, ADDR[0], ADDR[1]); if (d < best) { best = d; hi = i; } }); }
  if (hi < 0) return;
  const house = band.buildings[hi], hp = house.p;
  const annex = band.buildings.filter((b, i) => { if (i === hi) return false; for (let k = 0; k < b.p.length; k += 2) if (ringD(hp, b.p[k], b.p[k + 1]) < 2) return true; return false; });
  // frame: the outline's dominant axis, a toward north, b = a turned anticlockwise (west, away from the road); origin its (min a, min b) corner
  let sx = 0, sy = 0;
  for (let k = 0; k < hp.length; k += 2) { const j = (k + 2) % hp.length, dx = hp[j] - hp[k], dy = hp[j + 1] - hp[k + 1], L = Math.hypot(dx, dy), t = 4 * Math.atan2(dy, dx); sx += Math.cos(t) * L; sy += Math.sin(t) * L; }
  let th = Math.atan2(sy, sx) / 4; while (th < Math.PI / 4) th += Math.PI / 2; while (th > 3 * Math.PI / 4) th -= Math.PI / 2;
  const dir = [Math.cos(th), Math.sin(th)], nb = [-dir[1], dir[0]];
  let ma = 1e9, mb = 1e9; for (let k = 0; k < hp.length; k += 2) { ma = Math.min(ma, hp[k] * dir[0] + hp[k + 1] * dir[1]); mb = Math.min(mb, hp[k] * nb[0] + hp[k + 1] * nb[1]); }
  const at = [ma * dir[0] + mb * nb[0], ma * dir[1] + mb * nb[1]];

  const PLAIN = [96 / 512, 1 - 32 / 512];
  let ICO = null;
  // a corridor ring [x, y, ...] in the kit's frame, counter-clockwise, closing point dropped
  function local(K, p) {
    const r = []; for (let k = 0; k < p.length; k += 2) r.push(K.toLocal(p[k], -p[k + 1]));
    if (r.length > 3 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.05) r.pop();
    let A = 0; r.forEach((q, i) => { const s = r[(i + 1) % r.length]; A += q[0] * s[1] - s[0] * q[1]; }); return A < 0 ? r.reverse() : r;
  }
  // hb / rb geometry after a mark, cut off into a buffer of its own
  const take = (b, [p0, i0]) => { const v0 = p0 / 3, o = { pos: b.pos.splice(p0), nor: b.nor.splice(p0), col: b.col.splice(p0), uv: b.uv.splice(v0 * 2), idx: b.idx.splice(i0) }; for (let k = 0; k < o.idx.length; k++) o.idx[k] -= v0; return o; };
  // smooth ellipsoid (shrubs, the maple's crown) at world c, radii r; darker underneath
  function blob(buf, c, r, col, seed) {
    if (!ICO) ICO = new T.IcosahedronGeometry(1, 1).attributes.position.array;
    const o = buf.pos.length / 3, U = B.util;
    for (let i = 0; i < ICO.length; i += 3) {
      const x = ICO[i], y = ICO[i + 1], z = ICO[i + 2], s = 1 + 0.16 * (U.hash2(Math.round(x * 97) + seed, Math.round((y + 2.3 * z) * 89)) - 0.5);
      buf.pos.push(c[0] + x * r[0] * s, c[1] + y * r[1] * s, c[2] + z * r[2] * s);
      const nx = x / r[0], ny = y / r[1], nz = z / r[2], l = Math.hypot(nx, ny, nz); buf.nor.push(nx / l, ny / l, nz / l);
      const f = 0.72 + 0.28 * (y + 1) / 2; buf.col.push(col.r * f, col.g * f, col.b * f); buf.uv.push(PLAIN[0], PLAIN[1]); buf.idx.push(o + i / 3);
    }
  }
  // horizontal cylinder (the propane tank) from (a0, b) to (a1, b), axis at height y, capped (hero_destinations.js's)
  function tank(K, a0, a1, b, y, r, col) {
    const n = 12, at = (a, i) => { const t = i / n * 2 * Math.PI; return K.P(a, b + Math.cos(t) * r, y + Math.sin(t) * r); };
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * 2 * Math.PI; K.poly(K.hb, [at(a0, i), at(a1, i), at(a1, i + 1), at(a0, i + 1)], K.N(0, Math.cos(t), Math.sin(t)), col); }
    K.poly(K.hb, [...Array(n)].map((_, i) => at(a0, i)), K.N(-1, 0, 0), col); K.poly(K.hb, [...Array(n)].map((_, i) => at(a1, i)), K.N(1, 0, 0), col);
  }
  // a porch lamp on wall w: dark housing, a lit lens (the atlas's LIT texel glows at dusk)
  function lamp(K, w, s, y) {
    const [u0, v0, u1, v1] = K.uvr(K.R.LIT, 4); w.box(s - 0.09, s + 0.09, 0, 0.1, y - 0.15, y + 0.15, K.C(0x2a2a2a), true);
    K.poly(K.hb, [w.pt(s - 0.06, 0.105, y - 0.11), w.pt(s + 0.06, 0.105, y - 0.11), w.pt(s + 0.06, 0.105, y + 0.09), w.pt(s - 0.06, 0.105, y + 0.09)], w.n, K.C(0xfff4dc), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  // gable roof over s0..s1 (along a: alongA, else along b), eave walls at c0 < c1, wall top ye, ridge ye + rise. sides: [front pieces, back
  // pieces], each [s0, s1, overhang]; rake: [overhang past s0, past s1] (0 = no barge board there); o.metal: plain sheet in hb, else shingles
  function groof(K, alongA, s0, s1, c0, c1, ye, rise, sides, rake, o = {}) {
    const { P, N } = K, half = (c1 - c0) / 2, k = rise / half, cm = c0 + half, yr = ye + rise, len = Math.hypot(1, k), th = 0.12, buf = o.metal ? K.hb : K.rb;
    const Q = (s, c, y) => alongA ? P(s, c, y) : P(c, s, y), Nn = (ds, dc, dy) => alongA ? N(ds, dc, dy) : N(dc, ds, dy), tone = o.col || K.C(0xc6ccd2);
    const shade = (p) => tone.clone().multiplyScalar(0.9 + 0.1 * Math.min(1, Math.max(0, (p[1] - ye) / rise)));
    sides.forEach((pieces, si) => {
      const sg = si ? 1 : -1, cw = si ? c1 : c0, n = Nn(0, sg * k / len, 1 / len);
      for (const [sa, sb, ov] of pieces) {
        const ce = cw + sg * ov, yo = ye - ov * k, d0 = (half + ov) * len, uv = o.metal ? null : [[sa / 2, -d0 / 2], [sb / 2, -d0 / 2], [sb / 2, 0], [sa / 2, 0]];
        K.poly(buf, [Q(sa, ce, yo + th), Q(sb, ce, yo + th), Q(sb, cm, yr + th), Q(sa, cm, yr + th)], n, o.metal ? tone : shade, uv);
        if (ov < 0.05) continue;
        K.poly(K.hb, [Q(sa, ce, yo - 0.1), Q(sb, ce, yo - 0.1), Q(sb, ce, yo + th + 0.02), Q(sa, ce, yo + th + 0.02)], Nn(0, sg, 0), K.TRIM);       // fascia
        K.poly(K.hb, [Q(sa, ce, yo - 0.1), Q(sb, ce, yo - 0.1), Q(sb, cw, yo - 0.1), Q(sa, cw, yo - 0.1)], [0, -1, 0], K.TRIM);                     // soffit
        if (o.gutter) { const g = [ce, ce + sg * 0.13].sort((p, q) => p - q); if (alongA) K.box(sa + 0.05, sb - 0.05, g[0], g[1], yo - 0.12, yo + 0.02, K.C(0xe4e4e0), true); else K.box(g[0], g[1], sa + 0.05, sb - 0.05, yo - 0.12, yo + 0.02, K.C(0xe4e4e0), true); }
      }
      if (!o.metal) K.poly(K.rb, [Q(s0 - 0.02, cm, yr + th + 0.04), Q(s1 + 0.02, cm, yr + th + 0.04), Q(s1 + 0.02, cm + sg * 0.16, yr + th - 0.16 * k + 0.02), Q(s0 - 0.02, cm + sg * 0.16, yr + th - 0.16 * k + 0.02)], n, K.C(0x9a9a98), [[0.1, 0.1], [0.3, 0.1], [0.3, 0.15], [0.1, 0.15]]);
    });
    // barge boards and the rake soffits under them
    [[s0, rake[0], -1], [s1, rake[1], 1]].forEach(([se, rk, so]) => {
      if (!rk) return;
      for (const [si, sg] of [[0, -1], [1, 1]]) {
        const pc = sides[si].find((q) => se >= q[0] - 0.01 && se <= q[1] + 0.01) || sides[si][0], ce = (si ? c1 : c0) + sg * pc[2], yo = ye - pc[2] * k;
        K.poly(K.hb, [Q(se, ce, yo - 0.1), Q(se, cm, yr - 0.1), Q(se, cm, yr + th + 0.03), Q(se, ce, yo + th + 0.03)], Nn(so, 0, 0), K.TRIM);
        K.poly(K.hb, [Q(se, ce, yo - 0.1), Q(se - so * rk, ce, yo - 0.1), Q(se - so * rk, cm, yr - 0.1), Q(se, cm, yr - 0.1)], Nn(0, -sg * k / len, -1 / len), K.TRIM);
      }
    });
    return { k, yr, at: (c) => ye + (half - Math.abs(c - cm)) * k };
  }
  // the ground pieces (lawn, beds, drives) are draped on the terrain: world-space points of a local polygon, terrain normals, the terrain's uvs
  function drape(K, W, buf, pts, col, lift, uvf) {
    const o = buf.pos.length / 3, h = W.heightXZ;
    for (const [a, b] of pts) {
      const p = K.P(a, b, 0), X = p[0], Z = p[2], dx = h(X - 1, Z) - h(X + 1, Z), dz = h(X, Z - 1) - h(X, Z + 1), l = Math.hypot(dx, 2, dz), c = typeof col === 'function' ? col(X, Z, a, b) : col, t = uvf ? uvf(a, b) : [X / 14, Z / 14];
      buf.pos.push(X, h(X, Z) + lift, Z); buf.nor.push(dx / l, 2 / l, dz / l); buf.col.push(c.r, c.g, c.b); buf.uv.push(t[0], t[1]);
    }
    for (let i = 1; i < pts.length - 1; i++) buf.idx.push(o, o + i, o + i + 1);
  }
  // Catmull-Rom through [[a, b, half width], ...], a point every ~step m
  function spline(cp, step) {
    const out = [];
    for (let i = 0; i < cp.length - 1; i++) {
      const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)], n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < n; j++) { const t = j / n, t2 = t * t, t3 = t2 * t, f = (q) => 0.5 * (2 * p1[q] + (p2[q] - p0[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (3 * p1[q] - p0[q] - 3 * p2[q] + p3[q]) * t3); out.push([f(0), f(1), p1[2] + (p2[2] - p1[2]) * t]); }
    }
    out.push(cp[cp.length - 1].slice()); return out;
  }
  // convex polygon [[a, b], ...] clipped to the convex polygon r (both counter-clockwise)
  function clip(poly, r) {
    let out = poly;
    for (let i = 0; i < r.length && out.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length], side = (v) => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]), inp = out; out = [];
      for (let j = 0; j < inp.length; j++) {
        const u = inp[j], v = inp[(j + 1) % inp.length], su = side(u), sv = side(v);
        if (su >= 0) out.push(u);
        if ((su >= 0) !== (sv >= 0)) { const t = su / (su - sv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
      }
    }
    return out;
  }
  // ledgestone, 2 m x 1.5 m: thin courses of tan, buff and brown stones in dark joints, seamless both ways
  function ledgestone(U) {
    const rng = U.mulberry(2311);
    return U.canvasTex(512, 384, (g) => {
      g.fillStyle = '#4a3d30'; g.fillRect(0, 0, 512, 384);
      const tones = [[192, 160, 116], [166, 134, 94], [208, 182, 138], [142, 112, 80], [180, 150, 108], [198, 172, 130], [156, 124, 90], [130, 106, 82]];
      for (let y = 0; y < 384;) {
        const ch = Math.min(384 - y, 10 + rng() * 16 | 0), x0 = rng() * 60;
        for (let x = -x0; x < 512 - x0;) {
          const cw = 36 + rng() * 110, v = 0.84 + rng() * 0.26, t = tones[rng() * tones.length | 0], c = `rgb(${t.map((q) => Math.min(255, q * v) | 0).join(',')})`;
          for (const o of [0, 512]) { g.fillStyle = c; g.fillRect(x + o + 1.5, y + 1.5, cw - 3, ch - 3); g.fillStyle = 'rgba(255,240,210,0.16)'; g.fillRect(x + o + 1.5, y + 1.5, cw - 3, 2); }
          x += cw;
        }
        y += ch;
      }
    }, true);
  }

  // the lawn, 4.8 m square: a light and a dark mowing stripe, grass blades, a few fallen leaves (the vertex colours only shade it)
  function lawnTex(U) {
    const rng = U.mulberry(4402);
    return U.canvasTex(256, 256, (g) => {
      g.fillStyle = '#6a9a40'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#578535'; g.fillRect(128, 0, 128, 256);
      for (let k = 0; k < 9000; k++) { const x = rng() * 256, dk = x >= 128, v = rng(); g.fillStyle = v < 0.5 ? (dk ? 'rgba(52,84,30,0.5)' : 'rgba(92,128,52,0.5)') : (dk ? 'rgba(112,150,70,0.45)' : 'rgba(160,190,96,0.45)'); g.fillRect(x, rng() * 256, 1, 2 + rng() * 3); }
      const leaf = ['#d88a2a', '#c4562a', '#d6aa3e', '#9c3a24', '#b07a3a'];
      for (let k = 0; k < 120; k++) { g.fillStyle = leaf[rng() * leaf.length | 0]; g.globalAlpha = 0.8; g.beginPath(); g.ellipse(rng() * 256, rng() * 256, 1.4 + rng() * 1.6, 0.9 + rng(), rng() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }, true);
  }

  function build(K) {
    const W = B.game && B.game.world, scene = B.game && B.game.scene, U = B.util;
    if (!W || !scene || !W.corridors) return;      // no south band (routes.js missing or failed): nothing out here is seen
    const AR = W.corridors.find((R) => R.area); if (!AR) return;
    const { P, N, G, C, Wall } = K, hb = K.hb, mark = [[hb.pos.length, hb.idx.length], [K.rb.pos.length, K.rb.idx.length]];
    const gb = U.Buf(), circ = [], segs = [], rects = [], drives = [], later = [], info = {};

    // ---------- the house's plan from its outline ----------
    const ring = local(K, hp), A1 = Math.max(...ring.map((q) => q[0])), B1 = Math.max(...ring.map((q) => q[1])), fr = [];
    ring.forEach((q, i) => { const r = ring[(i + 1) % ring.length]; if (Math.abs(r[1] - q[1]) < 0.4 && Math.abs(r[0] - q[0]) > 2 && q[1] + r[1] < B1) fr.push([Math.min(q[0], r[0]), Math.max(q[0], r[0]), (q[1] + r[1]) / 2]); });
    fr.sort((x, y) => x[0] - y[0]);
    if (fr.length !== 3 || fr[1][2] > Math.min(fr[0][2], fr[2][2]) - 1.5) throw new Error('us231: expected the outline with the covered entry projecting in the middle of the front');
    const fm = fr[0][2], fp = fr[1][2], fw = fr[2][2], pa0 = (fr[0][1] + fr[1][0]) / 2, pa1 = (fr[1][1] + fr[2][0]) / 2, aW = (pa1 + A1) / 2;
    let gLo = 1e9, gHi = -1e9; for (let a = 0; a <= A1 + 0.01; a += A1 / 8) for (const b of [fp, fm, (fm + B1) / 2, B1]) { const g = G(a, b); gLo = Math.min(gLo, g); gHi = Math.max(gHi, g); }
    const F = gHi + 0.25, YE = F + 2.75, RISE = 3.55, YR = YE + RISE, k = RISE / ((B1 - fm) / 2), kw = RISE / ((A1 - pa1) / 2);
    const SID = C(0xeee6d2), CONC = C(0xa8a49b), WHITE = C(0xf4f3ef), TAN = C(0xfff0d8), TRIM = K.TRIM, ROOF = new T.Color(1.45, 1.58, 1.8), DOORC = C(0x5d3f28);
    const win = (s0, s1, y0, y1, split) => (w) => K.opening(w, s0, s1, y0, y1, 'S1', { split });
    const sill = F + 0.78, head = F + 2.18;
    const pair = (c, w2 = 0.95) => [c - w2, c + w2, sill, head, 2], one = (c) => [c - 0.48, c + 0.48, sill, head, 1];
    // a wall from holes [s0, s1, y0, y1, split]: material walls now, the windows after the ledgestone is cut off
    const wallW = (w, s0, s1, ya, yb, holes, col, base, mat) => { K.wall(w, s0, s1, ya, yb, holes.filter((h) => h[2] < yb && h[3] > ya).map((h) => h.slice(0, 4)), col, base, mat); for (const h of holes) if (h[5] !== false) later.push(() => (h[5] || win(h[0], h[1], h[2], h[3], h[4]))(w)); };

    // ---------- ledgestone first (cut off into its own mesh): the house's front, the ranch's wainscot and piers ----------
    const sMark = [hb.pos.length, hb.idx.length];
    const front = Wall(true, fm, -1), door = (pa0 + pa1) / 2;
    const dormers = [1 / 6, 1 / 2, 5 / 6].map((t) => t * (pa1 + 0.6));
    wallW(front, 0, pa1, gLo - 0.3, YE, [pair(dormers[0]), pair(Math.min(pa0 - 1.6, dormers[0] + 4.4)), one(pa0 + 1.3), one(pa1 - 1.3),
      [door - 0.96, door + 0.96, F, F + 2.12, 1, (w) => { K.opening(w, door - 0.5, door + 0.5, F, F + 2.12, 'DOOR', { door: true, col: DOORC }); for (const s of [-1, 1]) K.opening(w, door + s * 0.73 - 0.17, door + s * 0.73 + 0.17, F + 0.35, F + 2.12, 'PANE', { door: true }); lamp(K, w, door - 1.25, F + 1.8); }]], TAN, 0, 'plain');
    const stubW = Wall(false, pa1, -1); K.wall(stubW, fw, fm, gLo - 0.3, YE, [], TAN, 0, 'plain');
    const wingF = Wall(true, fw, -1);
    wallW(wingF, pa1, A1, gLo - 0.3, YE, [pair(pa1 + 2.6, 0.9), pair(A1 - 2.6, 0.9)], TAN, 0, 'plain');
    K.gable(wingF, pa1, A1, YE, YR, TAN, 0, 'plain');
    later.push(() => K.flatWindow(wingF, aW - 0.5, aW + 0.5, YE + 0.45, YE + 1.75, 'S1'));
    // the ranch next door (south, on the spur): ledgestone wainscot along its front and the porch piers
    // ponytail: placed from the screenshots' description (no footprint, no lidar), on the spur south of the house in this frame; real outline if Overture adds one
    const RA0 = -38, RA1 = -18, RB0 = -38, RB1 = -27, PG0 = -27.5, PG1 = -22.5, PD = 2.4;
    let rLo = 1e9, rFront = -1e9; for (let a = RA0; a <= RA1; a += 2.5) { for (const b of [RB0, RB1]) rLo = Math.min(rLo, G(a, b)); rFront = Math.max(rFront, G(a, RB0)); }
    const FR = rFront + 0.35, YER = FR + 2.75, gd = G(-34.3, RB0 - 0.5);
    const rFrontW = Wall(true, RB0, -1);
    K.wall(rFrontW, -31.4, RA1, rLo - 0.3, FR + 0.7, [[-26, -25, FR, FR + 2.1]], C(0xd8d2c8), 0, 'plain');
    for (const pa of [PG0 + 0.35, PG1 - 0.35]) K.box(pa - 0.28, pa + 0.28, RB0 - PD + 0.02, RB0 - PD + 0.58, G(pa, RB0 - PD) - 0.2, FR + 0.75, C(0xd8d2c8));
    const st = take(hb, sMark);
    for (let v = 0; v < st.pos.length / 3; v++) { const nx = st.nor[3 * v], ny = st.nor[3 * v + 1], nz = st.nor[3 * v + 2], X = st.pos[3 * v], Y = st.pos[3 * v + 1], Z = st.pos[3 * v + 2];
      if (Math.abs(ny) > 0.5) { st.uv[2 * v] = X / 2; st.uv[2 * v + 1] = Z / 1.5; } else { st.uv[2 * v] = (Z * nx - X * nz) / 2; st.uv[2 * v + 1] = Y / 1.5; } }

    // ---------- the house: siding walls, gables, roofs, dormers ----------
    for (const f of later.splice(0)) f();
    const south = Wall(false, 0, -1), north = Wall(false, A1, 1), back = Wall(true, B1, 1);
    const aRange = annex.map((b) => { const r = local(K, b.p); return [Math.min(...r.map((q) => q[0])), Math.max(...r.map((q) => q[0]))]; });
    const clear = (c) => !aRange.some((r) => c > r[0] - 1 && c < r[1] + 1);
    for (const [w, s0, s1, hs] of [[south, fm, B1, [one(fm + 2.1), one(B1 - 2.1)]], [north, fw, B1, [one(fw + 1.9), one((fw + B1) / 2), one(B1 - 1.9)]],
      [back, 0, A1, [1.6, pa1 - 5.4, pa1 - 2, pa1 + 2.2, A1 - 2.2].filter(clear).map(one)]]) {
      K.wall(w, s0, s1, gLo - 0.3, F - 0.05, [], CONC, 0, 'plain'); wallW(w, s0, s1, F - 0.05, YE, hs, SID, F - 0.05, 'siding');
    }
    K.gable(south, fm, B1, YE, YR, SID, F - 0.05); K.gable(back, pa1, A1, YE, YR, SID, F - 0.05);
    for (const c of [fm + 2.9, B1 - 2.9]) K.flatWindow(south, c - 0.42, c + 0.42, YE + 0.55, YE + 1.65, 'S1');
    K.flatWindow(back, aW - 0.45, aW + 0.45, YE + 0.5, YE + 1.6, 'S1');
    for (const [w, s] of [[south, fm], [south, B1], [north, fw], [north, B1], [back, 0], [back, A1]]) w.box(s - 0.09, s + 0.09, -0.02, 0.06, F - 0.05, YE, TRIM);
    for (const f of later.splice(0)) f();
    // main roof: ridge along a to the cross gable's ridge; no back overhang where the cross gable's back wall continues the main back wall
    const rm = groof(K, true, -0.4, aW, fm, B1, YE, RISE, [[[-0.4, aW, 0.4]], [[-0.4, pa1, 0.4], [pa1, aW, 0]]], [0.4, 0], { col: ROOF, gutter: true });
    groof(K, false, fw - 0.4, B1 + 0.4, pa1, A1, YE, RISE, [[[fw - 0.4, B1 + 0.4, 0.4]], [[fw - 0.4, B1 + 0.4, 0.4]]], [0.4, 0.4], { col: ROOF, gutter: true });
    // three gabled dormers on the front slope: face 0.7 m up the slope, cheeks and gable in siding, a double-hung window
    const bf = fm + 0.7, yd = YE + 2.15, dr = 1.0;
    for (const ac of dormers) {
      const y0 = rm.at(bf) - 0.12, face = Wall(true, bf, -1), bc = fm + (yd - YE) / k;
      K.wall(face, ac - dr, ac + dr, y0, yd, [[ac - 0.42, ac + 0.42, YE + 0.75, YE + 1.95]], SID, y0); K.gable(face, ac - dr, ac + dr, yd, yd + dr, SID, y0);
      K.opening(face, ac - 0.42, ac + 0.42, YE + 0.75, YE + 1.95, 'S1');
      for (const s of [-1, 1]) { const pts = [P(ac + s * dr, bf, y0), P(ac + s * dr, bf, yd), P(ac + s * dr, bc, yd)]; K.poly(hb, pts, N(s, 0, 0), SID, pts.map((p) => [32 / 512, (p[1] - y0) / 6])); }
      const dEnd = fm + (yd + dr - YE) / k + 0.05;      // where the dormer ridge dies into the main roof
      groof(K, false, bf - 0.25, dEnd, ac - dr, ac + dr, yd, dr, [[[bf - 0.25, dEnd, 0.15]], [[bf - 0.25, dEnd, 0.15]]], [0.25, 0], { col: ROOF });
    }
    // the covered entry: a slab, white posts on a beam, a low-slope charcoal metal roof tied into the main roof 0.4 m up its slope
    const slab = Math.max(F - 0.15, G(door, fp) + 0.12), bt = fm + 0.4, yT = rm.at(bt) + 0.12, kp = 0.125, yF = yT - (bt - fp + 0.3) * kp;
    K.box(pa0, pa1, fp, fm, gLo - 0.2, slab, C(0xbab6ac));
    if (slab - G(door, fp - 0.4) > 0.22) K.box(door - 1.0, door + 1.0, fp - 0.4, fp, G(door, fp - 0.4) - 0.2, slab - 0.17, C(0xbab6ac));
    const pe = [pa0 - 0.3, pa1 + 0.05], pl = Math.hypot(1, kp);
    K.poly(hb, [P(pe[0], fp - 0.3, yF), P(pe[1], fp - 0.3, yF), P(pe[1], bt, yT), P(pe[0], bt, yT)], N(0, -kp / pl, 1 / pl), C(0x3a3d41));
    K.poly(hb, [P(pe[0], fp - 0.3, yF - 0.18), P(pe[1], fp - 0.3, yF - 0.18), P(pe[1], fm, yF - 0.18 + (fm - fp + 0.3) * kp), P(pe[0], fm, yF - 0.18 + (fm - fp + 0.3) * kp)], N(0, kp / pl, -1 / pl), WHITE);
    K.box(pe[0], pe[1], fp - 0.32, fp - 0.27, yF - 0.2, yF + 0.02, TRIM, true);
    K.poly(hb, [P(pe[0], fp - 0.3, yF - 0.2), P(pe[0], bt, yT - 0.2), P(pe[0], bt, yT + 0.02), P(pe[0], fp - 0.3, yF + 0.02)], N(-1, 0, 0), TRIM);
    for (const [a0, a1] of [[pa0 + 0.25, pa0 + 0.47], [pa0 + 2.4, pa0 + 2.62], [pa1 - 2.62, pa1 - 2.4], [pa1 - 0.47, pa1 - 0.25]]) {
      K.box(a0, a1, fp + 0.19, fp + 0.41, slab, yF - 0.42, WHITE); K.box(a0 - 0.05, a1 + 0.05, fp + 0.14, fp + 0.46, slab, slab + 0.22, WHITE);
      const p = P((a0 + a1) / 2, fp + 0.3, 0); circ.push(p[0], p[2], 0.2);
    }
    K.box(pa0 + 0.2, pa1, fp + 0.17, fp + 0.43, yF - 0.44, yF - 0.18, WHITE, true);
    // the rear addition: its own footprint, snapped to the back wall, one storey, flat roof with a white fascia
    for (const b of annex) {
      const r = local(K, b.p).map((q) => [q[0], Math.abs(q[1] - B1) < 1.2 ? B1 - 0.05 : q[1]]), ya = F + 2.55;
      K.walls(r, gLo - 0.6, ya, { col: SID, mat: 'siding', base: F - 0.05, win: { w: 0.9, h: 1.3, sills: [F + 0.85], every: 3.4, region: 'S1', min: 3 } });
      K.flat(r, ya, { parapet: 0, col: C(0x4a4c4e) });
      r.forEach((q, i) => { const s = r[(i + 1) % r.length], w = K.Seg(q[0], q[1], s[0], s[1]); w.box(-0.04, w.L + 0.04, 0, 0.05, ya - 0.25, ya + 0.06, TRIM); });
    }

    // ---------- mulch beds of round clipped shrubs along the whole front; the maple; the propane tank ----------
    const MULCH = C(0x4a3021), rng = U.mulberry(231);
    const beds = [[-0.6, pa0, fm - 1.7, fm], [pa0 - 0.3, door - 1.1, fp - 1.5, fp - 0.3], [door + 1.1, pa1 + 0.3, fp - 1.5, fp - 0.3], [pa1, A1 + 0.6, fw - 1.7, fw]];
    for (const [a0, a1, b0, b1] of beds) {
      for (let a = a0; a < a1 - 0.01; a += 2) drape(K, W, gb, [[a, b0], [Math.min(a1, a + 2), b0], [Math.min(a1, a + 2), b1], [a, b1]], MULCH, 0.07);
      const n = Math.max(1, Math.round((a1 - a0) / 1.7));
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / n, b = (b0 + b1) / 2 + (rng() - 0.5) * 0.3, r = 0.45 + rng() * 0.2, g = G(a, b), p = P(a, b, g + r * 0.8);
        blob(hb, p, [r, r * 0.85, r], C([0x3b5626, 0x435f2a, 0x34502a][i % 3]), i * 7 + 3); }
    }
    { const ma = -1.7, mbb = fm - 1.9, g = G(ma, mbb), p = P(ma, mbb, 0), red = [0x8e1a12, 0xa3241a, 0x7a1510, 0xb3301e];      // the Japanese maple
      K.box(ma - 0.08, ma + 0.08, mbb - 0.08, mbb + 0.08, g - 0.1, g + 1.5, C(0x3d3029));
      for (const [da, db, dy, rx, ry] of [[0, 0, 2.3, 1.9, 0.9], [0.9, -0.6, 1.9, 1.2, 0.7], [-0.9, 0.5, 2.0, 1.3, 0.75], [0.2, 0.7, 2.9, 1.2, 0.7], [-0.5, -0.8, 2.6, 1.1, 0.6]])
        blob(hb, P(ma + da, mbb + db, g + dy), [rx, ry, rx * 0.9], C(red[(da * 7 + 9 | 0) % 4]), (da * 13 | 0) + 40);
      circ.push(p[0], p[2], 0.25); }
    { const ta = A1 + 5, tb = 4.2, tg = G(ta, tb);
      for (const da of [-0.85, 0.85]) K.box(ta + da - 0.2, ta + da + 0.2, tb - 0.3, tb + 0.3, tg - 0.1, tg + 0.32, CONC);
      tank(K, ta - 1.45, ta + 1.45, tb, tg + 0.85, 0.52, C(0xeceae4)); K.box(ta - 0.15, ta + 0.15, tb - 0.15, tb + 0.15, tg + 1.35, tg + 1.5, C(0x9a9a96));
      for (const da of [-0.8, 0.8]) { const p = P(ta + da, tb, 0); circ.push(p[0], p[2], 0.6); } }

    // ---------- the pole building between the two houses: white steel, grey metal roof, overhead door to the gravel strip ----------
    const QA0 = -15, QA1 = -3, QB0 = -21, QB1 = -12;
    let qLo = 1e9; for (let a = QA0; a <= QA1; a += 3) for (let b = QB0; b <= QB1; b += 3) qLo = Math.min(qLo, G(a, b));
    const qF = G(QA1 + 0.5, (QB0 + QB1) / 2) + 0.08, qE = qF + 3.3, STEEL = C(0xf1f1ec);
    const qr = [[QA0, QB0], [QA1, QB0], [QA1, QB1], [QA0, QB1]], qw = qr.map((q, i) => K.Seg(q[0], q[1], qr[(i + 1) % 4][0], qr[(i + 1) % 4][1]));
    qw.forEach((w, i) => {
      K.wall(w, 0, w.L, qLo - 0.3, qF + 0.15, [], CONC, 0, 'plain');
      const hs = i === 1 ? [[2.2, 5.3, qF, qF + 2.75], [6.6, 7.5, qF, qF + 2.05]] : i === 0 ? [[3.0, 3.9, qF + 1.2, qF + 2.1], [8.1, 9.0, qF + 1.2, qF + 2.1]] : [];
      K.wall(w, 0, w.L, qF + 0.15, qE, hs, STEEL, 0, 'plain');
      for (let s = 0.45; s < w.L; s += 0.9) if (!hs.some((h) => s > h[0] - 0.05 && s < h[1] + 0.05)) w.box(s - 0.02, s + 0.02, 0, 0.025, qF + 0.15, qE - 0.05, C(0xd9d9d4));
      w.box(-0.06, 0.12, -0.01, 0.07, qF + 0.1, qE, C(0xdcdcd6));
      if (i === 1) { K.opening(w, 2.2, 5.3, qF, qF + 2.75, 'PLN', { door: true, col: C(0xf6f6f2) }); for (let j = 1; j < 5; j++) w.box(2.2, 5.3, -0.06, -0.035, qF + j * 0.55, qF + j * 0.55 + 0.03, C(0xc4c4be));
        K.opening(w, 6.6, 7.5, qF, qF + 2.05, 'DOOR', { door: true, col: C(0xeeeeea) }); lamp(K, w, 3.75, qF + 3.0); }
      if (i === 0) for (const s of [3.0, 8.1]) K.opening(w, s, s + 0.9, qF + 1.2, qF + 2.1, 'S1');
      if (i % 2) K.gable(w, 0, w.L, qE, qE + 1.5, STEEL, qE, 'plain');
      segs.push(...(() => { const p = K.P(qr[i][0], qr[i][1], 0), q = K.P(qr[(i + 1) % 4][0], qr[(i + 1) % 4][1], 0); return [p[0], p[2], q[0], q[2]]; })());
    });
    groof(K, true, QA0 - 0.3, QA1 + 0.3, QB0, QB1, qE, 1.5, [[[QA0 - 0.3, QA1 + 0.3, 0.3]], [[QA0 - 0.3, QA1 + 0.3, 0.3]]], [0.3, 0.3], { metal: true, col: C(0x8e9497) });
    rects.push(qr);

    // ---------- the ranch next door ----------
    const RSID = C(0xf2f1ec), RROOF = new T.Color(1.75, 1.88, 2.1), rr = [[RA0, RB0], [RA1, RB0], [RA1, RB1], [RA0, RB1]], rw = rr.map((q, i) => K.Seg(q[0], q[1], rr[(i + 1) % 4][0], rr[(i + 1) % 4][1]));
    const rs = FR + 0.7, rh = FR + 2.15, rwin = (c, w2) => [c - w2, c + w2, rs + 0.1, rh, w2 > 0.6 ? 2 : 1];
    // front (RB0, s = a - RA0): garage door, the door under the porch, windows; ends and back plainer
    const rHoles = [[[1.1, 6.3, gd, gd + 2.25, 1, (w) => { K.opening(w, 1.1, 6.3, gd, gd + 2.25, 'PLN', { door: true, col: C(0xf6f6f2) }); for (let j = 1; j < 4; j++) w.box(1.1, 6.3, -0.06, -0.035, gd + j * 0.56, gd + j * 0.56 + 0.03, C(0xc8c8c2)); lamp(K, w, 0.6, gd + 2.0); }],
      rwin(9.3, 0.85), [12.0, 13.0, FR, FR + 2.1, 1, (w) => { K.opening(w, 12.0, 13.0, FR, FR + 2.1, 'DOOR', { door: true, col: C(0x2f3236) }); lamp(K, w, 13.35, FR + 1.75); }], rwin(16.6, 0.85)],
      [rwin(3.0, 0.5), rwin(8.0, 0.5)], [rwin(4.0, 0.85), rwin(10.0, 0.5), rwin(15.5, 0.85)], [rwin(3.5, 0.5), rwin(8.5, 0.5)]];
    rw.forEach((w, i) => {
      const hs = rHoles[i]; if (i !== 0) K.wall(w, 0, w.L, rLo - 0.3, FR - 0.05, [], CONC, 0, 'plain');
      wallW(w, 0, w.L, i === 0 ? FR + 0.7 : FR - 0.05, YER, hs, RSID, FR - 0.05, 'siding');
      if (i === 0) K.wall(w, 0, 6.6, rLo - 0.3, FR + 0.7, [[1.1, 6.3, gd, gd + 2.25]], RSID, FR - 0.05, 'siding');
      if (i % 2) K.gable(w, 0, w.L, YER, YER + 2.75, RSID, FR - 0.05);
      w.box(-0.09, 0.09, -0.02, 0.06, i === 0 ? FR + 0.7 : FR - 0.05, YER, TRIM);
      const p = K.P(rr[i][0], rr[i][1], 0), q = K.P(rr[(i + 1) % 4][0], rr[(i + 1) % 4][1], 0); segs.push(p[0], p[2], q[0], q[2]);
    });
    for (const f of later.splice(0)) f();
    groof(K, true, RA0 - 0.35, RA1 + 0.35, RB0, RB1, YER, 2.75, [[[RA0 - 0.35, RA1 + 0.35, 0.35]], [[RA0 - 0.35, RA1 + 0.35, 0.35]]], [0.35, 0.35], { col: RROOF, gutter: true });
    // the porch under a front gable: slab, two tapered white columns on the ledgestone piers, craftsman trim in the gable
    const pm = (PG0 + PG1) / 2, pr = 1.85, yP = YER, pSlab = FR - 0.12;
    K.box(PG0, PG1, RB0 - PD, RB0, rLo - 0.2, pSlab, C(0xbab6ac));
    const pEnd = RB0 + pr / 0.5 + 0.05;      // where the porch ridge dies into the main roof (pitch 0.5)
    groof(K, false, RB0 - PD - 0.3, pEnd, PG0, PG1, yP, pr, [[[RB0 - PD - 0.3, pEnd, 0.3]], [[RB0 - PD - 0.3, pEnd, 0.3]]], [0.3, 0], { col: RROOF });
    const pf = Wall(true, RB0 - PD, -1);
    K.gable(pf, PG0, PG1, yP - 0.02, yP + pr - 0.05, RSID, yP);
    pf.box(PG0, PG1, -0.02, 0.2, yP - 0.32, yP, TRIM, true); pf.box(pm - 0.08, pm + 0.08, 0, 0.12, yP, yP + pr - 0.25, TRIM);
    for (const s of [-1, 1]) { const x0 = pm + s * 0.1, x1 = pm + s * 1.3; K.poly(hb, [pf.pt(x0, 0.05, yP + 0.9), pf.pt(x1, 0.05, yP + 0.02), pf.pt(x1, 0.05, yP + 0.14), pf.pt(x0, 0.05, yP + 1.02)], pf.n, TRIM); }
    for (const pa of [PG0 + 0.35, PG1 - 0.35]) { K.box(pa - 0.16, pa + 0.16, RB0 - PD + 0.14, RB0 - PD + 0.46, FR + 0.75, FR + 1.5, WHITE); K.box(pa - 0.12, pa + 0.12, RB0 - PD + 0.18, RB0 - PD + 0.42, FR + 1.5, yP - 0.3, WHITE);
      const p = P(pa, RB0 - PD + 0.3, 0); circ.push(p[0], p[2], 0.32); }
    rects.push(rr);

    // ---------- drives (gravel to the house and the pole building, concrete to the ranch), the apron, the mailbox ----------
    const route = AR.route, rl = []; for (let q = 0; q < route.X.length; q++) { const l = K.toLocal(route.X[q], route.Z[q]); if (l[0] > -120 && l[0] < 120) rl.push(l); }
    const edgeAt = (a) => { let best = null, d = 1e9; for (const q of rl) if (Math.abs(q[0] - a) < d) { d = Math.abs(q[0] - a); best = q; } return best[1] + route.hw; };
    const GRAV = C(0xd6d2c6), TRACK = C(0xb9b3a5), CONCD = C(0xc6c3ba), ASPH = C(0x3c3c3b), BRICK = C(0x8a3a2a);
    const ribbon = (pts, cols, lift) => {
      const rows = pts.map((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], L = Math.hypot(dx, dy) || 1; return [p, -dy / L, dx / L]; });
      const pt = (r, f) => [r[0][0] + r[1] * r[0][2] * f, r[0][1] + r[2] * r[0][2] * f];
      for (let i = 0; i < rows.length - 1; i++) for (const [f0, f1, col] of cols) drape(K, W, gb, [pt(rows[i], f0), pt(rows[i + 1], f0), pt(rows[i + 1], f1), pt(rows[i], f1)], col, lift);
    };
    const drive = (cp, m, cols, lift, step = 1.4) => {
      const pts = spline(cp, step); ribbon(pts, cols, lift);
      const s = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { const w = P(p[0], p[1], 0); s.push(w[0], w[2], p[2]); x0 = Math.min(x0, w[0] - p[2]); x1 = Math.max(x1, w[0] + p[2]); z0 = Math.min(z0, w[2] - p[2]); z1 = Math.max(z1, w[2] + p[2]); }
      drives.push({ s, m, x0, x1, z0, z1 }); return pts;
    };
    const DM = 28, eM = edgeAt(DM), eR = edgeAt(-26);      // the two drive mouths (a)
    drive([[DM, eM - 0.3, 1.75], [DM - 0.3, eM + 7, 1.75], [26.3, -57, 1.75], [24.2, -47.5, 1.75], [21.8, -37.5, 1.75], [21.4, -28, 1.75], [22.6, -18, 1.75], [21.6, -10.6, 1.8], [18, -6.4, 1.8], [12, -5.5, 1.75], [5, -5.6, 1.75], [2.7, -7.8, 1.75], [2.1, -11, 1.75], [1.2, -14.6, 1.8], [-1.0, -16.5, 2.0], [-3.1, -16.5, 2.0]],
      2, [[-1, -0.6, GRAV], [-0.6, -0.25, TRACK], [-0.25, 0.25, GRAV], [0.25, 0.6, TRACK], [0.6, 1, GRAV]], 0.1);
    drive([[DM, eM - 0.2, 3.8], [DM - 0.1, eM + 2.5, 2.6], [DM - 0.2, eM + 5.5, 1.95]], 5, [[-1, -0.86, BRICK], [-0.86, 0.86, ASPH], [0.86, 1, BRICK]], 0.12, 0.7);
    const cpts = drive([[-26, eR - 0.3, 1.9], [-26.4, eR + 9, 1.9], [-28, -62, 1.9], [-31, -52, 1.95], [-33.6, -45, 2.3], [-34.3, -41.2, 2.9], [-34.3, RB0 - 0.1, 2.9]], 5, [[-1, 1, CONCD]], 0.1);
    for (let i = 3, d = 0; i < cpts.length; i++) { d += Math.hypot(cpts[i][0] - cpts[i - 1][0], cpts[i][1] - cpts[i - 1][1]); if (d < 3.2) continue; d = 0;      // control joints
      const p = cpts[i], q = cpts[i - 1], L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ua = (p[0] - q[0]) / L, ub = (p[1] - q[1]) / L, w = p[2];
      drape(K, W, gb, [[p[0] + ub * w, p[1] - ua * w], [p[0] + ub * w + ua * 0.05, p[1] - ua * w + ub * 0.05], [p[0] - ub * w + ua * 0.05, p[1] + ua * w + ub * 0.05], [p[0] - ub * w, p[1] + ua * w]], C(0x8f8b83), 0.108); }
    drape(K, W, gb, [[door - 0.6, -4.2], [door + 0.6, -4.2], [door + 0.6, fp - 0.2], [door - 0.6, fp - 0.2]], C(0xbab6ac), 0.1);      // the walk to the strip
    // the double mailbox on its square post, north of the mouth, a small blue plaque (no number) on the post
    { const ma = DM + 3.2, mb2 = eM + 1.6, g = G(ma, mb2), p = P(ma, mb2, 0);
      K.box(ma - 0.06, ma + 0.06, mb2 - 0.06, mb2 + 0.06, g - 0.2, g + 1.12, WHITE); K.box(ma - 0.42, ma + 0.42, mb2 - 0.07, mb2 + 0.07, g + 1.0, g + 1.1, WHITE);
      for (const da of [-0.22, 0.22]) { K.box(ma + da - 0.12, ma + da + 0.12, mb2 - 0.3, mb2 + 0.22, g + 1.1, g + 1.32, WHITE, true); K.box(ma + da - 0.1, ma + da + 0.1, mb2 - 0.28, mb2 + 0.2, g + 1.32, g + 1.38, WHITE); }
      K.box(ma - 0.075, ma + 0.075, mb2 - 0.075, mb2 - 0.06, g + 0.78, g + 0.88, C(0x1f4fa0));
      circ.push(p[0], p[2], 0.12); }

    // ---------- the lawn, road ditch to the woods: the band's own terrain triangles (routes.js's 4 m strip grid, same diagonal) clipped to its
    // outline, so it lies exactly on the ground; diagonal mowing stripes from its texture, fading to rough grass toward the woods ----------
    const LA0 = -50, LA1 = A1 + 17, LB1 = B1 + 10, lawnR = [[LA0, edgeAt(LA0) + 2.5], [LA1, edgeAt(LA1) + 2.5], [LA1, LB1 - 14], [LA1 - 14, LB1], [LA0 + 20, LB1], [LA0, LB1 - 22]];
    const lb = U.Buf(), SW = 2.4, s2 = Math.SQRT1_2, ROUGH = new T.Color(1.25, 0.9, 0.5);
    const woods = (a, b) => { let d = 1e9; for (let i = 1; i < lawnR.length; i++) { const p = lawnR[i], q = lawnR[(i + 1) % lawnR.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); d = Math.min(d, ((q[0] - p[0]) * (b - p[1]) - (q[1] - p[1]) * (a - p[0])) / l); } return d; };   // metres in from the woods side
    const lawnCol = (X, Z, a, b) => new T.Color(1, 1, 1).multiplyScalar(0.82 + 0.18 * U.vnoise(X / 9, Z / 9)).lerp(ROUGH, U.clamp(1 - woods(a, b) / 10, 0, 1));
    const lawnUV = (a, b) => [(b - a) * s2 / (2 * SW), (a + b) * s2 / (2 * SW)];
    { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of lawnR) { const p = P(q[0], q[1], 0); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
      for (let i = Math.floor((x0 - AR.X0) / 4); i <= Math.ceil((x1 - AR.X0) / 4); i++) for (let j = Math.floor((z0 - AR.Z0) / 4); j <= Math.ceil((z1 - AR.Z0) / 4); j++) {
        const X = AR.X0 + 4 * i, Z = AR.Z0 + 4 * j, c = [[X, Z], [X + 4, Z], [X + 4, Z + 4], [X, Z + 4]].map((q) => K.toLocal(q[0], q[1]));
        for (const t of [[c[0], c[1], c[3]], [c[1], c[2], c[3]]]) {
          const ar = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]), p = clip(ar < 0 ? t.slice().reverse() : t, lawnR);
          if (p.length > 2) drape(K, W, lb, p, lawnCol, 0.012, lawnUV);
        }
      } }

    // ---------- lidar trees standing on the new buildings or drives: hidden ----------
    // ponytail: a hidden tree keeps routes.js's 0.45 m trunk circle (sealed in its strip grid); only trees inside the new buildings are hidden
    // today (treesOnDrives counts any on a drive), so the circles stay inside solid walls; a skip list in routes.js if a drive ever crosses one
    const onSite = (a, b) => rects.some((r) => a > r[0][0] - 1 && a < r[1][0] + 1 && b > r[0][1] - 1 && b < r[2][1] + 1);
    const onD = (d, X, Z, m) => { if (X < d.x0 - m || X > d.x1 + m || Z < d.z0 - m || Z > d.z1 + m) return false; const s = d.s; for (let q = 0; q + 5 < s.length; q += 3) if (segD(X, Z, s[q], s[q + 1], s[q + 3], s[q + 4]) < s[q + 2] + m) return true; return false; };
    const onDrive = (X, Z, m) => drives.some((d) => onD(d, X, Z, m));
    let hid = 0, drv = 0;
    for (const m of scene.children) { if (m.name !== 'rt:tree') continue; const a = m.instanceMatrix.array; let n = 0;
      for (let q = 0; q < m.count; q++) { const X = a[16 * q + 12], Z = a[16 * q + 14], l = K.toLocal(X, Z); if (Math.abs(l[0]) > 160 || Math.abs(l[1]) > 160 || !a[16 * q + 5]) continue;
        const d = onDrive(X, Z, 0.8); if (onSite(l[0], l[1]) || d) { a.fill(0, 16 * q, 16 * q + 16); n++; hid++; if (d) drv++; } }
      if (n) m.instanceMatrix.needsUpdate = true; }
    info.treesHidden = hid; info.treesOnDrives = drv;

    // ---------- routes.js's plain shells of the house and its addition fold away ----------
    const rings = [hp].concat(annex.map((b) => b.p)), hx = K.P(A1 / 2, B1 / 2, 0);
    for (const m of scene.children) {
      if (m.name !== 'rt:bldg' || !m.geometry || !m.geometry.index) continue;
      const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const s = g.boundingSphere; if (Math.hypot(s.center.x - hx[0], s.center.z - hx[2]) > s.radius + 60) continue;
      const p = g.attributes.position.array, ix = g.index.array; let n = 0;
      for (let q = 0; q < ix.length; q += 3) { const a = 3 * ix[q], b = 3 * ix[q + 1], c = 3 * ix[q + 2], X = (p[a] + p[b] + p[c]) / 3, Z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
        if (rings.some((r) => inPoly(r, X, -Z) || ringD(r, X, -Z) < 0.6)) { ix[q + 1] = ix[q + 2] = ix[q]; n++; } }
      if (n) { g.index.needsUpdate = true; info.shellTris = (info.shellTris || 0) + n; }
    }

    // ---------- meshes: the kit's facade and roofs (heroes.js's materials, bound on the first frame), ledgestone, ground ----------
    const stub = new T.MeshLambertMaterial({ vertexColors: true }), ms = [];
    const sMat = new T.MeshLambertMaterial({ vertexColors: true, map: ledgestone(U) });
    const tm = W.kit && W.kit.terrainMat, gMat = new T.MeshLambertMaterial({ vertexColors: true, map: tm ? tm.map : null, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const lMat = new T.MeshLambertMaterial({ vertexColors: true, map: lawnTex(U), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    for (const [b, m, shadow] of [[take(hb, mark[0]), 0, true], [take(K.rb, mark[1]), 1, true], [st, sMat, true], [gb, gMat, false], [lb, lMat, false]]) {
      if (!b.idx.length) continue;
      const mesh = new T.Mesh(U.bufGeo(b), typeof m === 'number' ? stub : m);
      mesh.userData.heroMat = m; mesh.name = 'hero-us231'; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.visible = false; scene.add(mesh); ms.push(mesh);
    }
    info.tris = ms.reduce((t, m) => t + m.geometry.index.count / 3, 0);
    const cx = hx[0], cz = hx[2]; let bound = false, on = -1;
    W.animated.push((t, dt, cam) => {
      // heroes.js adds its facade mesh (the atlas with the glow map) and its roof mesh right after it, last of the meshes named 'heroes'
      if (!bound) { bound = true; const c = scene.children, i = c.map((o) => o.name === 'heroes' && !!o.material.emissiveMap).lastIndexOf(true), h = i < 0 ? [] : [c[i], c[i + 1]];
        for (const m of ms) { const s = h[m.userData.heroMat]; if (typeof m.userData.heroMat === 'number' && s && s.name === 'heroes') { m.material = s.material; m.customDepthMaterial = s.customDepthMaterial; } } }
      // the lawn only while the band's terrain is at its 4 m level (routes.js: within 170 m of its 512 m chunk), which it was cut from
      // and none of it while routes.js leaves the band undrawn (a camera in town more than 600 m north of it, its NEARB)
      const p = cam.position, d = Math.hypot(p.x - cx, p.z - cz), band = Math.abs(p.x) > W.HALF || Math.abs(p.z) > W.HALF || p.z > W.HALF - 600, v = band && d < 1600 ? (d < 350 ? 2 : 1) : 0; if (v !== on) { on = v; for (const m of ms) m.visible = v > (m.material === lMat ? 1 : 0); }
    });

    // ---------- the tyres and the camera: drives and the new buildings in W.maskAt; their solids in W.collide ----------
    // ponytail: the minimap (routes.js's band canvas) shows neither the drives nor the two new buildings; draw them on R.map if it matters
    const rw2 = rects.map((r) => r.map((q) => { const p = P(q[0], q[1], 0); return [p[0], -p[2]]; }).flat());
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const d of drives) { bx0 = Math.min(bx0, d.x0); bx1 = Math.max(bx1, d.x1); bz0 = Math.min(bz0, d.z0); bz1 = Math.max(bz1, d.z1); }
    for (const r of rw2) for (let q = 0; q < r.length; q += 2) { bx0 = Math.min(bx0, r[q]); bx1 = Math.max(bx1, r[q]); bz0 = Math.min(bz0, -r[q + 1]); bz1 = Math.max(bz1, -r[q + 1]); }
    for (let q = 0; q < circ.length; q += 3) { bx0 = Math.min(bx0, circ[q] - 1); bx1 = Math.max(bx1, circ[q] + 1); bz0 = Math.min(bz0, circ[q + 1] - 1); bz1 = Math.max(bz1, circ[q + 1] + 1); }
    drives.sort((p, q) => q.m - p.m);      // the apron (pavement) wins over the gravel under it
    const m0 = W.maskAt;
    W.maskAt = (X, Z) => {
      if (X < bx0 || X > bx1 || Z < bz0 || Z > bz1) return m0(X, Z);
      for (const r of rw2) if (inPoly(r, X, -Z)) return 4;
      for (const d of drives) if (onD(d, X, Z, 0)) return d.m;
      return m0(X, Z);
    };
    const bc = W.buildCollision, hit = { nx: 0, nz: 0, depth: 0 };
    W.buildCollision = function () {
      bc.call(W); const c0 = W.collide;
      W.collide = (X, Z, r) => {
        const a = c0(X, Z, r); if (X < bx0 - 8 || X > bx1 + 8 || Z < bz0 - 8 || Z > bz1 + 8) return a;
        hit.depth = 0;
        for (let q = 0; q < circ.length; q += 3) { const dx = X - circ[q], dz = Z - circ[q + 1], d = Math.hypot(dx, dz), pen = r + circ[q + 2] - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
        for (let q = 0; q < segs.length; q += 4) { const ax = segs[q], az = segs[q + 1], ex = segs[q + 2] - ax, ez = segs[q + 3] - az, t = Math.max(0, Math.min(1, ((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1))), dx = X - ax - ex * t, dz = Z - az - ez * t, d = Math.hypot(dx, dz), pen = r - d;
          if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
        return hit.depth > 0 && (!a || hit.depth > a.depth) ? hit : a;
      };
    };
    K.result.info = info;
  }

  B.heroPlugins = (B.heroPlugins || []).concat({ id: 'us231', name: 'The house on US 231 south of town, and next door', at, dir, footprints: [], build });
})();
