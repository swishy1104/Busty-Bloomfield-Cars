/* Bloomfield Drift — hero plug-in (heroes.js kit): 1399 S US Highway 231, the house half a mile south of the town square on the EAST side
   of the road (routes.js's south band), from the owner's four Street View screenshots as they were described to us (never their pixels), on
   the band's Overture footprints and lidar ground (corridors.js), and the two places beside it. The front faces west to the road, 47 m off
   its edge, on ground rising from it; seen from the road (looking east) left is north, right is south.
   - The house: band building 26 (holding the address point; a straight 25.6 m front, the north half 8.5 m deep, the south half 13 m) and
     building 25 touching its back (a 1.8 m strip, no roof data: a one-storey rear addition, flat roofed, with the rest of the deep half
     behind the main block). A one-and-a-half-storey Cape: steep side-gabled roof of charcoal shingles, three gabled dormers on the front
     slope, the south (right) end a front-facing cross gable 10.2 m wide, 0.7 m forward of the main front and the full depth, whose gable wall
     is tan ledgestone like the whole ground floor of the front, cream siding on the gable ends, dormer cheeks and back, white-trimmed
     double-hung windows, a covered entry (8.1 m wide, 3.5 m out) under a low-slope metal roof on white posts, mulch beds of round clipped
     shrubs along the whole front, a red Japanese maple at the left (north) front corner, a white propane tank on the lawn to the right
     (south). The lidar classed this roof flat (6.2 m, no slope fit), so the eave (2.75 m over the floor) and ridge follow the photos.
   - The lawn from the road ditch to the woods, mowed in diagonal stripes (the lidar trees stand on it: the tall sycamores in front, the white
     pines behind); a white crushed-limestone drive leaving US 231 south of the house at a short asphalt apron edged with red brick pavers (a
     white double mailbox on a square post with a small blue plaque, no number, at the mouth), curving up the lawn between the sycamores and
     on as a gravel strip in front of the house, round its north end to the pole building.
   - Next door on the left (north), 1383: band building 24, a single-storey ranch (white siding, dark grey roof, its lidar ridge front to
     back: a front gable with the porch's smaller gable nested in it, craftsman trim, ledgestone wainscot and porch piers), a side-load
     garage door in its north wall, its concrete drive curving up the hill from the road to the pad there.
   - Between the two, set back behind them: band building 27 (not 25, which is attached to the house and 1.8 m deep), a white steel pole
     building on its L outline (a 30 m barn and a lean-to under its south slope carried on down), grey metal roof at the lidar's eave and
     rise, the overhead door in its west end at the gravel's end.
   The drives are drivable: W.maskAt answers gravel (2) on the limestone, pavement (5, asphalt to the tyres) on the concrete and the apron,
   and W.surface follows it. Solids (a W.collide wrapper, as hero_destinations.js): porch posts, mailbox post, tank, maple trunk; the four
   buildings are band footprints, already solid (and building, 4, in the mask) in routes.js, whose plain shells of them are folded away (by
   position). Shown within 1.6 km: heroes.js's facade and roof materials (bound on the first frame), a ledgestone material, the paving (the
   terrain's detail texture, polygon-offset) and, within 350 m (while routes.js draws the band at its 4 m level, whose triangles it is cut
   from), the striped lawn: 5 draw calls. Dusk: windows and porch lamps light with the town's. 1388 across the road (buildings 32, 33) is
   routes.js's plain shells again.
   Public: one BD.heroPlugins entry 'us231' (footprints: []); nothing else. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {}), CD = window.BLOOMFIELD_CORRIDORS;
  const band = CD && CD.corridors && CD.corridors.find((c) => c.kind === 'area');
  if (!band) return;
  const ADDR = [661.9, -2586.4];      // 1399's Overture address point (map metres), in band building 26 east of US 231
  const inPoly = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > y) !== (p[j + 1] > y) && x < p[j] + (y - p[j + 1]) / (p[i + 1] - p[j + 1]) * (p[i] - p[j])) c = !c; return c; };
  const segD = (x, y, ax, ay, bx, by) => { const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1))); return Math.hypot(x - ax - ex * t, y - ay - ey * t); };
  const ringD = (p, x, y) => { let d = 1e9; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) d = Math.min(d, segD(x, y, p[j], p[j + 1], p[i], p[i + 1])); return d; };
  // the house: the band footprint holding the address point (else the nearest within 40 m); the rear addition: footprints within 2 m of it
  let hi = band.buildings.findIndex((b) => inPoly(b.p, ADDR[0], ADDR[1]));
  if (hi < 0) { let best = 40; band.buildings.forEach((b, i) => { const d = ringD(b.p, ADDR[0], ADDR[1]); if (d < best) { best = d; hi = i; } }); }
  if (hi < 0) return;
  const house = band.buildings[hi], hp = house.p;
  const annex = band.buildings.filter((b, i) => { if (i === hi) return false; for (let k = 0; k < b.p.length; k += 2) if (ringD(hp, b.p[k], b.p[k + 1]) < 2) return true; return false; });
  // next door (by position, band footprints): the ranch, 1383 (building 24), north; the pole building (building 27) between them, set back
  const fpAt = (x, y) => band.buildings.find((b) => inPoly(b.p, x, y)), ranch = fpAt(685, -2537), pole = fpAt(700, -2563);
  if (!ranch || !pole) return;
  // frame: the outline's dominant axis, a toward SOUTH (along the front, left to right seen from the road), b = a turned anticlockwise
  // (east, away from the road: the front faces west); origin its (min a, min b) corner, the north-west corner
  let sx = 0, sy = 0;
  for (let k = 0; k < hp.length; k += 2) { const j = (k + 2) % hp.length, dx = hp[j] - hp[k], dy = hp[j + 1] - hp[k + 1], L = Math.hypot(dx, dy), t = 4 * Math.atan2(dy, dx); sx += Math.cos(t) * L; sy += Math.sin(t) * L; }
  let th = Math.atan2(sy, sx) / 4; while (th < Math.PI / 4) th += Math.PI / 2; while (th > 3 * Math.PI / 4) th -= Math.PI / 2; th += Math.PI;
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
    const gb = U.Buf(), circ = [], drives = [], later = [], info = {};

    // ---------- the house's plan from its outline ----------
    // the outline: a straight front 25.6 m long; the north half 8.5 m deep, the south half 13 m. The model on it, as built before: the main
    // block (0..pa1) with its covered entry projecting 3.5 m (outside the outline) and the front-facing cross gable, its outer 10.2 m, at the
    // south end standing 0.7 m forward of the main front and running the full depth; the rest of the deep half behind the main block is a
    // flat-roofed rear addition like building 25 (a 1.8 m strip on the north half's back)
    const ring = local(K, hp), A1 = Math.max(...ring.map((q) => q[0])), B1 = Math.max(...ring.map((q) => q[1])), ea = [];
    ring.forEach((q, i) => { const r = ring[(i + 1) % ring.length]; if (Math.abs(r[1] - q[1]) < 0.6 && Math.abs(r[0] - q[0]) > 2) ea.push([Math.min(q[0], r[0]), Math.max(q[0], r[0]), (q[1] + r[1]) / 2]); });
    ea.sort((x, y) => x[2] - y[2]);
    if (ea.length !== 3 || ea[1][0] > 1 || ea[2][1] < A1 - 1) throw new Error('us231: expected the outline with the straight front and the deeper south half');
    const fw = ea[0][2], fm = fw + 0.7, fp = fm - 3.5, B1m = ea[1][2], aStep = ea[2][0], pa1 = A1 - 10.2, pa0 = pa1 - 8.1, aW = (pa1 + A1) / 2;
    const addR = annex.map((b) => local(K, b.p)); if (pa1 - aStep > 0.5) addR.push([[aStep, B1m], [pa1 - 0.05, B1m], [pa1 - 0.05, B1], [aStep, B1]]);
    let gLo = 1e9, gHi = -1e9; for (let a = 0; a <= A1 + 0.01; a += A1 / 8) for (const b of [fp, fm, (fm + B1) / 2, B1]) { const g = G(a, b); gLo = Math.min(gLo, g); gHi = Math.max(gHi, g); }
    const F = gHi + 0.25, YE = F + 2.75, RISE = 3.55, YR = YE + RISE, k = RISE / ((B1m - fm) / 2), kw = RISE / ((A1 - pa1) / 2);
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
    // the ranch next door (north, up the hill): band building 24's outline (10.9 m front, 13.5 m deep, within 1 deg of this frame), its
    // lidar ridge along the depth: a front gable, the porch's smaller front gable nested in it over the door; a side-load garage door on
    // the north wall; ledgestone wainscot along its front and the porch piers
    const rp = local(K, ranch.p), RA0 = Math.min(...rp.map((q) => q[0])), RA1 = Math.max(...rp.map((q) => q[0])), RB0 = Math.min(...rp.map((q) => q[1])), RB1 = Math.max(...rp.map((q) => q[1]));
    const RL = RA1 - RA0, rmA = (RA0 + RA1) / 2, PG0 = rmA - 2.2, PG1 = rmA + 2.2, PD = 2.4;
    let rLo = 1e9, rFront = -1e9; for (let a = RA0; a <= RA1 + 0.01; a += RL / 4) { for (const b of [RB0, (RB0 + RB1) / 2, RB1]) rLo = Math.min(rLo, G(a, b)); rFront = Math.max(rFront, G(a, RB0)); }
    // the eave a storey over the floor; the ridge at the lidar's (its eave + rise over the ground at the middle), pitch within reason
    const FR = rFront + 0.35, YER = FR + 2.75, RR = Math.min(3.2, Math.max(1.8, G(rmA, (RB0 + RB1) / 2) + (ranch.e || 4.3) + (ranch.r || 1.6) - YER)), gd = G(RA0 - 0.6, RB0 + 5.6);
    const rFrontW = Wall(true, RB0, -1);
    K.wall(rFrontW, RA0, RA1, rLo - 0.3, FR + 0.7, [[rmA - 0.5, rmA + 0.5, FR, FR + 2.1]], C(0xd8d2c8), 0, 'plain');
    for (const pa of [PG0 + 0.35, PG1 - 0.35]) K.box(pa - 0.28, pa + 0.28, RB0 - PD + 0.02, RB0 - PD + 0.58, G(pa, RB0 - PD) - 0.2, FR + 0.75, C(0xd8d2c8));
    const st = take(hb, sMark);
    for (let v = 0; v < st.pos.length / 3; v++) { const nx = st.nor[3 * v], ny = st.nor[3 * v + 1], nz = st.nor[3 * v + 2], X = st.pos[3 * v], Y = st.pos[3 * v + 1], Z = st.pos[3 * v + 2];
      if (Math.abs(ny) > 0.5) { st.uv[2 * v] = X / 2; st.uv[2 * v + 1] = Z / 1.5; } else { st.uv[2 * v] = (Z * nx - X * nz) / 2; st.uv[2 * v + 1] = Y / 1.5; } }

    // ---------- the house: siding walls, gables, roofs, dormers ----------
    for (const f of later.splice(0)) f();
    // the main block's outer (north) end and back, the wing's outer (south) end and back, the wing's side behind the main block
    const endM = Wall(false, 0, -1), endW = Wall(false, A1, 1), backM = Wall(true, B1m, 1), backW = Wall(true, B1, 1), sideW = Wall(false, pa1, -1);
    const aRange = addR.map((r) => [Math.min(...r.map((q) => q[0])), Math.max(...r.map((q) => q[0]))]);
    const clear = (c) => !aRange.some((r) => c > r[0] - 1 && c < r[1] + 1);
    for (const [w, s0, s1, hs] of [[endM, fm, B1m, [one(fm + 2.1), one(B1m - 2.1)]], [endW, fw, B1, [one(fw + 1.9), one((fw + B1) / 2), one(B1 - 1.9)]],
      [backM, 0, pa1, [1.6, pa1 - 5.4, pa1 - 2].filter(clear).map(one)], [backW, pa1, A1, [pa1 + 2.2, A1 - 2.2].filter(clear).map(one)]]) {
      K.wall(w, s0, s1, gLo - 0.3, F - 0.05, [], CONC, 0, 'plain'); wallW(w, s0, s1, F - 0.05, YE, hs, SID, F - 0.05, 'siding');
    }
    const yAdd = F + 2.55, hidden = addR.length > annex.length;      // the rear additions' flat roofs; the wing's side wall above the one against it
    K.wall(sideW, B1m, B1, hidden ? yAdd - 0.1 : gLo - 0.3, YE, [], SID, F - 0.05, 'siding');
    K.gable(endM, fm, B1m, YE, YR, SID, F - 0.05); K.gable(backW, pa1, A1, YE, YR, SID, F - 0.05);
    for (const c of [fm + 2.9, B1m - 2.9]) K.flatWindow(endM, c - 0.42, c + 0.42, YE + 0.55, YE + 1.65, 'S1');
    K.flatWindow(backW, aW - 0.45, aW + 0.45, YE + 0.5, YE + 1.6, 'S1');
    for (const [w, s] of [[endM, fm], [endM, B1m], [endW, fw], [endW, B1], [backM, 0], [backW, A1], [backW, pa1]]) w.box(s - 0.09, s + 0.09, -0.02, 0.06, F - 0.05, YE, TRIM);
    for (const f of later.splice(0)) f();
    // main roof: ridge along a to the cross gable's ridge; no back overhang where the cross gable's back wall continues the main back wall
    const rm = groof(K, true, -0.4, aW, fm, B1m, YE, RISE, [[[-0.4, aW, 0.4]], [[-0.4, pa1, 0.4], [pa1, aW, 0]]], [0.4, 0], { col: ROOF, gutter: true });
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
    for (const rr0 of addR) {
      const r = rr0.map((q) => [q[0], Math.abs(q[1] - B1m) < 1.2 ? B1m - 0.05 : q[1]]), ya = yAdd;
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
    { const ta = A1 + 4.2, tb = 4.2, tg = G(ta, tb);
      for (const da of [-0.85, 0.85]) K.box(ta + da - 0.2, ta + da + 0.2, tb - 0.3, tb + 0.3, tg - 0.1, tg + 0.32, CONC);
      tank(K, ta - 1.45, ta + 1.45, tb, tg + 0.85, 0.52, C(0xeceae4)); K.box(ta - 0.15, ta + 0.15, tb - 0.15, tb + 0.15, tg + 1.35, tg + 1.5, C(0x9a9a96));
      for (const da of [-0.8, 0.8]) { const p = P(ta + da, tb, 0); circ.push(p[0], p[2], 0.6); } }

    // ---------- the pole building between the two houses: band building 27, set back behind them (its L outline: a 30 m barn, 8.5 m wide,
    // and a lean-to on its south-east), white steel, the grey metal roof at the lidar's eave and rise (the lean-to under its south slope
    // carried on down), the overhead door in its west end to the gravel. Its own frame (u across, v along the barn, about 2 deg off this one).
    const qp = local(K, pole.p); let vL = 0, vd = null;
    qp.forEach((q, i) => { const r = qp[(i + 1) % qp.length], L = Math.hypot(r[0] - q[0], r[1] - q[1]); if (L > vL) { vL = L; vd = [(r[0] - q[0]) / L, (r[1] - q[1]) / L]; } });
    if (vd[1] < 0) vd = [-vd[0], -vd[1]];
    const ud = [vd[1], -vd[0]], uvOf = (q) => [q[0] * ud[0] + q[1] * ud[1], q[0] * vd[0] + q[1] * vd[1]], quv = qp.map(uvOf);
    const u0 = Math.min(...quv.map((q) => q[0])), v0 = Math.min(...quv.map((q) => q[1])), uE = Math.max(...quv.map((q) => q[0])) - u0, Lm = Math.max(...quv.map((q) => q[1])) - v0;
    const wM = Math.max(...quv.filter((q) => q[1] - v0 < Lm / 2).map((q) => q[0])) - u0, vE = Math.min(...quv.filter((q) => q[0] - u0 > wM + 0.5).map((q) => q[1])) - v0;
    if (!(wM > 5 && uE - wM > 1 && vE > 5 && vE < Lm - 2)) throw new Error('us231: expected building 27 as an L (the barn and its lean-to)');
    const ab = (u, v) => [(u + u0) * ud[0] + (v + v0) * vd[0], (u + u0) * ud[1] + (v + v0) * vd[1]];
    const V = Object.assign({}, K, { P: (u, v, y) => { const q = ab(u, v); return P(q[0], q[1], y); }, N: (du, dv, dy) => N(du * ud[0] + dv * vd[0], du * ud[1] + dv * vd[1], dy) });
    const UV = [[0, 0], [wM, 0], [wM, vE], [uE, vE], [uE, Lm], [0, Lm]], dc = wM / 2 - 0.7;      // the overhead door's middle (u)
    let qLo = 1e9; for (const q of UV) qLo = Math.min(qLo, G(...ab(q[0], q[1])));
    const qF = G(...ab(dc, -1)) + 0.08, qR = pole.r > 0.5 ? pole.r : 1.6, qE = Math.max(qF + 3, G(...ab(wM / 2, Lm / 2)) + (pole.e || 3.7)), kq = qR / (wM / 2), yLean = qE - (uE - wM) * kq, STEEL = C(0xf1f1ec);
    UV.forEach((q, i) => {
      const r = UV[(i + 1) % 6], p0 = ab(q[0], q[1]), p1 = ab(r[0], r[1]), w = K.Seg(p0[0], p0[1], p1[0], p1[1]), L = w.L, sl = uE - wM;
      // the wall's top at s: the barn's eave, the lean-to's eave, or sloping with the lean-to's roof (its west face, the east end over it)
      const top = (s) => i === 2 ? qE + (yLean - qE) * s / L : i === 3 ? yLean : i === 4 ? (s < sl ? yLean + (qE - yLean) * s / sl : qE) : qE;
      const hs = i === 0 ? [[dc - 1.55, dc + 1.55, qF, qF + 2.75], [wM - 1.75, wM - 0.85, qF, qF + 2.05]] : i === 1 ? [[4, 4.9, qF + 1.2, qF + 2.1], [L - 4.9, L - 4, qF + 1.2, qF + 2.1]]
        : i === 5 ? [0.25, 0.5, 0.75].map((t) => [L * t - 0.45, L * t + 0.45, qF + 1.2, qF + 2.1]) : [];
      K.wall(w, 0, L, qLo - 0.3, qF + 0.15, [], CONC, 0, 'plain');
      if (i === 2) { K.wall(w, 0, L, qF + 0.15, yLean, [], STEEL, 0, 'plain'); K.skin(w, [[0, yLean], [L, yLean], [0, qE]], STEEL, 0, 'plain'); }
      else if (i === 4) { K.wall(w, 0, L, qF + 0.15, yLean, [], STEEL, 0, 'plain'); K.skin(w, [[0, yLean], [sl, yLean], [sl, qE]], STEEL, 0, 'plain'); K.wall(w, sl, L, yLean, qE, [], STEEL, 0, 'plain'); K.gable(w, sl, L, qE, qE + qR, STEEL, qE, 'plain'); }
      else K.wall(w, 0, L, qF + 0.15, top(0), hs, STEEL, 0, 'plain');
      for (let s = 0.45; s < L; s += 0.9) if (!hs.some((h) => s > h[0] - 0.05 && s < h[1] + 0.05)) w.box(s - 0.02, s + 0.02, 0, 0.025, qF + 0.15, top(s) - 0.05, C(0xd9d9d4));
      w.box(-0.06, 0.12, -0.01, 0.07, qF + 0.1, top(0), C(0xdcdcd6));
      if (i === 0) { K.opening(w, dc - 1.55, dc + 1.55, qF, qF + 2.75, 'PLN', { door: true, col: C(0xf6f6f2) }); for (let j = 1; j < 5; j++) w.box(dc - 1.55, dc + 1.55, -0.06, -0.035, qF + j * 0.55, qF + j * 0.55 + 0.03, C(0xc4c4be));
        K.opening(w, wM - 1.75, wM - 0.85, qF, qF + 2.05, 'DOOR', { door: true, col: C(0xeeeeea) }); lamp(K, w, dc, qF + 3.0); K.gable(w, 0, L, qE, qE + qR, STEEL, qE, 'plain'); }
      for (const h of hs) if (h[2] > qF + 1) K.opening(w, h[0], h[1], h[2], h[3], 'S1');
    });
    groof(V, false, -0.3, Lm + 0.3, 0, wM, qE, qR, [[[-0.3, Lm + 0.3, 0.3]], [[-0.3, vE, 0.3], [vE, Lm + 0.3, uE - wM + 0.3]]], [0.3, 0.3], { metal: true, col: C(0x8e9497) });
    info.pole = { wM: +wM.toFixed(1), uE: +uE.toFixed(1), vE: +vE.toFixed(1), Lm: +Lm.toFixed(1), qF: +qF.toFixed(2), qE: +qE.toFixed(2) };

    // ---------- the ranch next door ----------
    const RSID = C(0xf2f1ec), RROOF = new T.Color(1.75, 1.88, 2.1), rr = [[RA0, RB0], [RA1, RB0], [RA1, RB1], [RA0, RB1]], rw = rr.map((q, i) => K.Seg(q[0], q[1], rr[(i + 1) % 4][0], rr[(i + 1) % 4][1]));
    const rs = FR + 0.7, rh = FR + 2.15, rwin = (c, w2) => [c - w2, c + w2, rs + 0.1, rh, w2 > 0.6 ? 2 : 1], RD = RB1 - RB0, gs0 = RD - 8.2, gs1 = RD - 3;
    // front (RB0, s = a - RA0): windows either side of the door under the porch; the garage door in the north wall (s = RB1 - b) to the
    // concrete pad; the south side (to the house) and the back plainer
    const rHoles = [[rwin(2.3, 0.85), [RL / 2 - 0.5, RL / 2 + 0.5, FR, FR + 2.1, 1, (w) => { K.opening(w, RL / 2 - 0.5, RL / 2 + 0.5, FR, FR + 2.1, 'DOOR', { door: true, col: C(0x2f3236) }); lamp(K, w, RL / 2 + 0.85, FR + 1.75); }], rwin(RL - 2.3, 0.85)],
      [rwin(3.0, 0.5), rwin(RD / 2, 0.85), rwin(RD - 3.0, 0.5)], [rwin(3.0, 0.85), rwin(RL - 3.0, 0.5)],
      [[gs0, gs1, gd, gd + 2.25, 1, (w) => { K.opening(w, gs0, gs1, gd, gd + 2.25, 'PLN', { door: true, col: C(0xf6f6f2) }); for (let j = 1; j < 4; j++) w.box(gs0, gs1, -0.06, -0.035, gd + j * 0.56, gd + j * 0.56 + 0.03, C(0xc8c8c2)); lamp(K, w, gs1 + 0.5, gd + 2.0); }], rwin(2.6, 0.5)]];
    rw.forEach((w, i) => {
      const hs = rHoles[i]; if (i !== 0) K.wall(w, 0, w.L, rLo - 0.3, FR - 0.05, i === 3 ? [hs[0].slice(0, 4)] : [], CONC, 0, 'plain');
      wallW(w, 0, w.L, i === 0 ? FR + 0.7 : FR - 0.05, YER, hs, RSID, FR - 0.05, 'siding');
      if (i % 2 === 0) K.gable(w, 0, w.L, YER, YER + RR, RSID, FR - 0.05);      // the lidar's ridge runs front to back
      w.box(-0.09, 0.09, -0.02, 0.06, i === 0 ? FR + 0.7 : FR - 0.05, YER, TRIM);
    });
    for (const f of later.splice(0)) f();
    groof(K, false, RB0 - 0.35, RB1 + 0.35, RA0, RA1, YER, RR, [[[RB0 - 0.35, RB1 + 0.35, 0.35]], [[RB0 - 0.35, RB1 + 0.35, 0.35]]], [0.35, 0.35], { col: RROOF, gutter: true });
    // the porch under its own front gable nested in the house's: slab, two tapered white columns on the ledgestone piers, craftsman trim in
    // both gables (beam, king post, braces; corbels under the big gable's eaves)
    const pm = rmA, pr = Math.min(1.6, RR - 0.5), yP = YER, pSlab = FR - 0.12;
    K.box(PG0, PG1, RB0 - PD, RB0, rLo - 0.2, pSlab, C(0xbab6ac));
    groof(K, false, RB0 - PD - 0.3, RB0 + 0.05, PG0, PG1, yP, pr, [[[RB0 - PD - 0.3, RB0 + 0.05, 0.3]], [[RB0 - PD - 0.3, RB0 + 0.05, 0.3]]], [0.3, 0], { col: RROOF });
    const pf = Wall(true, RB0 - PD, -1);
    K.gable(pf, PG0, PG1, yP - 0.02, yP + pr - 0.05, RSID, yP);
    pf.box(PG0, PG1, -0.02, 0.2, yP - 0.32, yP, TRIM, true); pf.box(pm - 0.08, pm + 0.08, 0, 0.12, yP, yP + pr - 0.25, TRIM);
    for (const s of [-1, 1]) { const x0 = pm + s * 0.1, x1 = pm + s * 1.3; K.poly(hb, [pf.pt(x0, 0.05, yP + 0.9), pf.pt(x1, 0.05, yP + 0.02), pf.pt(x1, 0.05, yP + 0.14), pf.pt(x0, 0.05, yP + 1.02)], pf.n, TRIM); }
    if (RR - pr > 0.9) rw[0].box(RL / 2 - 0.08, RL / 2 + 0.08, 0, 0.12, yP + pr + 0.3, YER + RR - 0.3, TRIM);
    for (const s of [0.12, RL - 0.12]) rw[0].box(s - 0.08, s + 0.08, 0, 0.32, YER - 0.55, YER - 0.04, TRIM);
    for (const pa of [PG0 + 0.35, PG1 - 0.35]) { K.box(pa - 0.16, pa + 0.16, RB0 - PD + 0.14, RB0 - PD + 0.46, FR + 0.75, FR + 1.5, WHITE); K.box(pa - 0.12, pa + 0.12, RB0 - PD + 0.18, RB0 - PD + 0.42, FR + 1.5, yP - 0.3, WHITE);
      const p = P(pa, RB0 - PD + 0.3, 0); circ.push(p[0], p[2], 0.32); }
    info.ranch = { RA0: +RA0.toFixed(1), RB0: +RB0.toFixed(1), FR: +FR.toFixed(2), RR: +RR.toFixed(2), gd: +gd.toFixed(2) };

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
    // the gravel: south of the house (right, seen from the road) up between the sycamores, along the front, round the north end to the
    // pole building's door; the concrete: from the road north of it (left) up the hill to the pad by the ranch's garage door
    const DM = 28, eM = edgeAt(DM), RM = -33, eR = edgeAt(RM), pd0 = ab(dc, -0.3), pd1 = ab(dc, -5);      // the drive mouths (a); the barn door
    const gpts = drive([[DM, eM - 0.3, 1.75], [DM - 0.2, eM + 6, 1.75], [28.3, -31, 1.75], [28.5, -22, 1.75], [26.8, -13.5, 1.75], [22.8, -8.9, 1.8], [17, -7.3, 1.75], [10, -7.2, 1.75], [3, -7.2, 1.75], [-2.8, -6.6, 1.8], [-6.4, -2, 1.9], [-7.2, 8, 1.9], [-7.6, 18, 1.9], [pd1[0], pd1[1], 2.0], [pd0[0], pd0[1], 2.2]],
      2, [[-1, -0.6, GRAV], [-0.6, -0.25, TRACK], [-0.25, 0.25, GRAV], [0.25, 0.6, TRACK], [0.6, 1, GRAV]], 0.1);
    drive([[DM, eM - 0.2, 3.8], [DM - 0.1, eM + 2.5, 2.6], [DM - 0.2, eM + 5.5, 1.95]], 5, [[-1, -0.86, BRICK], [-0.86, 0.86, ASPH], [0.86, 1, BRICK]], 0.12, 0.7);
    const cpts = drive([[RM, eR - 0.3, 1.9], [RM - 0.4, eR + 7, 1.9], [-35.6, -36, 1.9], [-39.4, -24, 1.95], [-40.6, -10, 2.0], [-42.6, 3, 2.2], [RA0 - 3.2, RB0 - 3, 2.6], [RA0 - 3.2, RB0 + 2, 2.9], [RA0 - 3.2, RB0 + 9, 2.9]], 5, [[-1, 1, CONCD]], 0.1);
    for (let i = 3, d = 0; i < cpts.length; i++) { d += Math.hypot(cpts[i][0] - cpts[i - 1][0], cpts[i][1] - cpts[i - 1][1]); if (d < 3.2) continue; d = 0;      // control joints
      const p = cpts[i], q = cpts[i - 1], L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ua = (p[0] - q[0]) / L, ub = (p[1] - q[1]) / L, w = p[2];
      drape(K, W, gb, [[p[0] + ub * w, p[1] - ua * w], [p[0] + ub * w + ua * 0.05, p[1] - ua * w + ub * 0.05], [p[0] - ub * w + ua * 0.05, p[1] + ua * w + ub * 0.05], [p[0] - ub * w, p[1] + ua * w]], C(0x8f8b83), 0.108); }
    drape(K, W, gb, [[door - 0.6, -5.5], [door + 0.6, -5.5], [door + 0.6, fp - 0.2], [door - 0.6, fp - 0.2]], C(0xbab6ac), 0.1);      // the walk to the strip
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
    // ponytail: a hidden tree keeps routes.js's 0.45 m trunk circle (sealed in its strip grid); the drives are laid round the lidar trunks
    // (treesOnDrives counts any on one: 0 today), so only trees inside the footprints would go, inside solid walls, and the one 6 m lidar
    // tree in the bed before the entry (the screenshots show only shrubs there and the maple at the corner): its trunk circle stays in the
    // bed, a shrub to the tyres; a skip list in routes.js if a drive ever must cross one
    const rings = [hp, ranch.p, pole.p].concat(annex.map((b) => b.p)), onSite = (X, Z, l) => rings.some((r) => inPoly(r, X, -Z)) || (l[0] > -1 && l[0] < A1 + 1 && l[1] > fp - 2 && l[1] < fw);
    const onD = (d, X, Z, m) => { if (X < d.x0 - m || X > d.x1 + m || Z < d.z0 - m || Z > d.z1 + m) return false; const s = d.s; for (let q = 0; q + 5 < s.length; q += 3) if (segD(X, Z, s[q], s[q + 1], s[q + 3], s[q + 4]) < s[q + 2] + m) return true; return false; };
    const onDrive = (X, Z, m) => drives.some((d) => onD(d, X, Z, m));
    let hid = 0, drv = 0;
    for (const m of scene.children) { if (m.name !== 'rt:tree') continue; const a = m.instanceMatrix.array; let n = 0;
      for (let q = 0; q < m.count; q++) { const X = a[16 * q + 12], Z = a[16 * q + 14], l = K.toLocal(X, Z); if (Math.abs(l[0]) > 160 || Math.abs(l[1]) > 160 || !a[16 * q + 5]) continue;
        const d = onDrive(X, Z, 0.8); if (onSite(X, Z, l) || d) { a.fill(0, 16 * q, 16 * q + 16); n++; hid++; if (d) drv++; } }
      if (n) m.instanceMatrix.needsUpdate = true; }
    info.treesHidden = hid; info.treesOnDrives = drv;

    // ---------- routes.js's plain shells of the house, its addition, the ranch and the pole building fold away ----------
    const hx = K.P(A1 / 2, B1 / 2, 0);
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

    // ---------- the tyres: the drives in W.maskAt; the posts, mailbox, tank and maple in W.collide (all four buildings are band footprints:
    // routes.js already makes them solid and building (4) in its mask) ----------
    // ponytail: the minimap (routes.js's band canvas) does not show the drives; draw them on R.map if it matters
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const d of drives) { bx0 = Math.min(bx0, d.x0); bx1 = Math.max(bx1, d.x1); bz0 = Math.min(bz0, d.z0); bz1 = Math.max(bz1, d.z1); }
    for (let q = 0; q < circ.length; q += 3) { bx0 = Math.min(bx0, circ[q] - 1); bx1 = Math.max(bx1, circ[q] + 1); bz0 = Math.min(bz0, circ[q + 1] - 1); bz1 = Math.max(bz1, circ[q + 1] + 1); }
    drives.sort((p, q) => q.m - p.m);      // the apron (pavement) wins over the gravel under it
    const m0 = W.maskAt;
    W.maskAt = (X, Z) => {
      if (X < bx0 || X > bx1 || Z < bz0 || Z > bz1) return m0(X, Z);
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
        return hit.depth > 0 && (!a || hit.depth > a.depth) ? hit : a;
      };
    };
    info.plan = { A1: +A1.toFixed(2), B1m: +B1m.toFixed(2), B1: +B1.toFixed(2), fw: +fw.toFixed(2), pa0: +pa0.toFixed(2), pa1: +pa1.toFixed(2), aStep: +aStep.toFixed(2), F: +F.toFixed(2), eM: +eM.toFixed(1), eR: +eR.toFixed(1) };
    info.drive = gpts.filter((p, i) => i % 6 === 0).map((p) => { const w = P(p[0], p[1], 0); return [+w[0].toFixed(1), +(-w[2]).toFixed(1), +p[0].toFixed(1), +p[1].toFixed(1)]; });
    K.result.info = info;
  }

  B.heroPlugins = (B.heroPlugins || []).concat({ id: 'us231', name: 'The house on US 231 south of town, and next door', at, dir, footprints: [], build });
})();
