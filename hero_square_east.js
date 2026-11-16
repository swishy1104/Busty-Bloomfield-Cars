/* Bloomfield Drift — hero plug-in: the east side of the courthouse square (S. Washington Ave between E. Main and E. Spring, footprint 1443)
   and the small brick bank at Spring & Washington (footprint 1435: MainSource Bank in the 2013 photo, OSM now "Library Annex").
   heroes.js kit (see its header). Public surface: just this plug-in record.
   1443 is one OSM polygon over the whole row. The lidar roof (W.buildings roofAt) steps where one building meets the next, and the
   OSM rear corners line up with those steps, so the row is split into eight fronts, north to south (frame: a runs south along the
   fronts from the polygon's north-west corner, b east, away from the street):
     a 13.9-33.8  the wide corner front on the lawn at Main St (2011 photo): orange-red brick, a limestone lintel course over seven tall
                  1/1 sashes, a corbelled parapet, two shops (the white door) under one maroon metal awning with white seams (2011, 2018);
     a 33.8-41.2  the tallest front: three segmental-arched windows with stone hoods, bracketed cream cornice;
     a 41.2-47.2  tall arched windows, brown dentil cornice, the white box canopy with a sign panel (2018; it runs 1.4 m onto the front north);
     a 47.2-53.5  three small arched windows high over plain brick and one large display window (2018);
     a 53.5-61.1  the one-storey blue-grey store (lidar 3.6 m);   a 61.1-68.5  white storefront fascia over a blue bulkhead, a blank upper
                  wall under a dark coping (its faded painted sign is not drawn);
     a 68.5-73.8  four narrow sashes under a cream lintel band, corbelled brick cornice, dark brown awning (2018);
     a 73.8-82    the Spring St corner: arched windows front and side, green bracketed cornice, brown awnings (2018).
   Facades the photos do not show (the 2018 view is far and through bare trees) are made consistent with their neighbours. Side and rear
   walls, roofs and the one-storey rear wings come from the footprint and the lidar heights (ZONES); the rear building behind the corner
   lawn gets a plain brick face on Main St. The terrain's pavement map has grass in front of the row: a concrete sidewalk runs from Main St
   to Spring St (its globe lamps are streets.js's).
   1435: main N-S gable (lidar eave 2.8 m, ridge 6.1 m), a west cross gable and a lower drive-through canopy at the south end on brick
   piers; red-brown brick, brown shingles and fascia. The north gable faces Spring St with the recessed entrance and the sign (now the
   OSM name instead of the 2013 bank's). Solids: 1435's footprint walls give way to the drawn ones (the footprint steps in behind the
   west wall and covers the open drive-through), the piers are posts, the lane is paved for the tyres.
   Lettering is on one small canvas: the only mesh this adds beyond the kit's shared ones. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  B.heroPlugins = (B.heroPlugins || []).concat({ id: 'square_east', name: 'east side of the square', footprints: [1443, 1435], build });

  function build(K) {
    const T = THREE, U = B.util, C = K.C, hb = K.hb, up = [0, 1, 0], neg = (v) => v.map((x) => -x);
    const tint = (r, g, b) => new T.Color(r, g, b), mul = (c, t) => c.clone().multiply(t), sc = (c, k) => c.clone().multiplyScalar(k);
    const GLS = 3.6, WH = C(0xffffff), STONE = C(0xd6ccb4), COPE = C(0xb9b2a4), ROOF = C(0x55534f), BRK = C(0x8a4a3c), CONC = C(0x938f87), DARK = C(0x2b2b2b);

    // ---------- wall-plane helpers (w from K.Wall / K.Seg: s along it, d outward, y up) ----------
    const reg = (r) => { const [u0, v0, u1, v1] = K.uvr(K.R[r], 1); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; };
    const quad = (w, s0, s1, ya, yb, d, n, col, uv) => K.poly(hb, [w.pt(s0, d, ya), w.pt(s1, d, ya), w.pt(s1, d, yb), w.pt(s0, d, yb)], n, col, uv);
    function lining(w, s0, s1, ya, yb, D, rc, head = true) {
      if (head) K.poly(hb, [w.pt(s0, 0, yb), w.pt(s1, 0, yb), w.pt(s1, -D, yb), w.pt(s0, -D, yb)], [0, -1, 0], rc);
      K.poly(hb, [w.pt(s0, 0, ya), w.pt(s1, 0, ya), w.pt(s1, -D, ya), w.pt(s0, -D, ya)], up, rc);
      K.poly(hb, [w.pt(s0, 0, ya), w.pt(s0, -D, ya), w.pt(s0, -D, yb), w.pt(s0, 0, yb)], w.t, rc);
      K.poly(hb, [w.pt(s1, 0, ya), w.pt(s1, -D, ya), w.pt(s1, -D, yb), w.pt(s1, 0, yb)], neg(w.t), rc);
    }
    // sash window in a masonry hole s0..s1 x ya..yb (+ o.arch: a segmental head that rises o.arch above yb): reveals, sash 0.12 back,
    // stone sill; o.lin a flat stone lintel (its overhang), o.hood a hood moulding round the arch; o.mat the wall finish (spandrels)
    function win(w, s0, s1, ya, yb, rc, wallCol, o = {}) {
      const D = 0.15, r = o.arch || 0;
      if (!r) { lining(w, s0, s1, ya, yb, D, rc); quad(w, s0, s1, ya, yb, -0.12, w.n, WH, reg('S1')); }
      else {
        const hw = (s1 - s0) / 2, sm = s0 + hw, R = (hw * hw + r * r) / (2 * r), yc = yb + r - R, t0 = Math.asin(Math.min(1, hw / R)), N = 6, arc = [], yt = yb + r;
        for (let k = 0; k <= N; k++) { const t = -t0 + 2 * t0 * k / N; arc.push([sm + R * Math.sin(t), yc + R * Math.cos(t)]); }
        const [u0, v0, u1, v1] = K.uvr(K.R.S1, 1), uv = (q) => [u0 + (u1 - u0) * (q[0] - s0) / (s1 - s0), v0 + (v1 - v0) * (q[1] - ya) / (yt - ya)], sash = [[s0, ya], [s1, ya], ...arc.slice().reverse()];
        K.poly(hb, sash.map((q) => w.pt(q[0], -0.12, q[1])), w.n, WH, sash.map(uv));
        lining(w, s0, s1, ya, yb, D, rc, false);
        for (let k = 0; k < N; k++) { const p = arc[k], q = arc[k + 1], tm = -t0 + 2 * t0 * (k + 0.5) / N, n = w.t.map((v, i) => -Math.sin(tm) * v - (i === 1 ? Math.cos(tm) : 0));
          K.poly(hb, [w.pt(p[0], 0, p[1]), w.pt(q[0], 0, q[1]), w.pt(q[0], -D, q[1]), w.pt(p[0], -D, p[1])], n, rc); }
        K.skin(w, [[s0, yt], ...arc.slice(0, N / 2 + 1)], wallCol, ya, o.mat || 'brick'); K.skin(w, [[s1, yt], ...arc.slice(N / 2).reverse()], wallCol, ya, o.mat || 'brick');
        if (o.hood) for (let k = 0; k < N; k++) {
          const ta = -t0 + 2 * t0 * k / N, tb = -t0 + 2 * t0 * (k + 1) / N, tm = (ta + tb) / 2, Ro = R + 0.17, Q = (t, rr, d) => w.pt(sm + rr * Math.sin(t), d, yc + rr * Math.cos(t));
          K.poly(hb, [Q(ta, R, 0.05), Q(tb, R, 0.05), Q(tb, Ro, 0.05), Q(ta, Ro, 0.05)], w.n, o.hood);
          K.poly(hb, [Q(ta, Ro, 0), Q(tb, Ro, 0), Q(tb, Ro, 0.05), Q(ta, Ro, 0.05)], w.t.map((v, i) => Math.sin(tm) * v + (i === 1 ? Math.cos(tm) : 0)), o.hood);
        }
      }
      w.box(s0 - 0.08, s1 + 0.08, 0, 0.08, ya - 0.1, ya, STONE, true);
      if (o.lin) w.box(s0 - o.lin, s1 + o.lin, 0, 0.04, yb, yb + 0.3, STONE, true);
    }
    // cornice y0..y1: bed moulding, frieze, crown reaching back over the parapet (it is the coping); o.brk bracket spacing, o.dent dentils
    function cornice(w, s0, s1, y0, y1, col, o = {}) {
      const out = o.out || 0.3, n = (sp) => Math.max(1, Math.round((s1 - s0) / sp)), at = (k, m) => s0 + (k + 0.5) * (s1 - s0) / m;
      w.box(s0, s1, -0.3, out, y1 - 0.15, y1, col, true); w.box(s0, s1, 0, out * 0.6, y1 - 0.27, y1 - 0.15, col, true);
      w.box(s0, s1, 0, 0.05, y0 + 0.12, y1 - 0.27, col); w.box(s0, s1, 0, 0.13, y0, y0 + 0.12, col, true);
      if (o.brk) { const m = n(o.brk); for (let k = 0; k < m; k++) { const s = at(k, m); w.box(s - 0.06, s + 0.06, 0.05, out * 0.85, y0 + 0.08, y1 - 0.27, col, true); } }
      if (o.dent) { const m = n(0.2); for (let k = 0; k < m; k++) { const s = at(k, m); w.box(s - 0.045, s + 0.045, 0.05, out * 0.5, y1 - 0.4, y1 - 0.27, col, true); } }
    }
    // storefront in a hole s0..s1 from the pavement gl: bulkhead, glass (mullions every o.bay m, transom bar), framed reveals; doors [s] 0.95 m
    function shop(w, s0, s1, gl, o = {}) {
      const y1 = gl + (o.bulk === undefined ? 0.5 : o.bulk), y2 = gl + (o.top || 2.9), yt = gl + 2.3, D = 0.2, fc = o.frame || DARK, doors = o.doors || [];
      lining(w, s0, s1, gl - 0.1, y2, D, fc);
      const glass = glassCol(gl, y2, o.dim || 1);
      K.poly(hb, [w.pt(s0, -D + 0.04, gl), w.pt(s1, -D + 0.04, gl), w.pt(s1, -D + 0.04, y2), w.pt(s0, -D + 0.04, y2)], w.n, glass, reg('PANE'));
      const xs = [s0, ...doors.flatMap((s) => [s, s + 0.95]), s1];
      for (let i = 0; i < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) {
        w.box(xs[i], xs[i + 1], -D, -D + 0.1, gl - 0.1, y1, o.bulkCol || fc);
        const m = Math.max(1, Math.round((xs[i + 1] - xs[i]) / (o.bay || 1.8)));
        for (let k = 1; k < m; k++) { const s = xs[i] + (xs[i + 1] - xs[i]) * k / m; w.box(s - 0.035, s + 0.035, -D + 0.04, -D + 0.1, y1, y2, fc); }
      }
      w.box(s0, s1, -D + 0.04, -D + 0.1, yt - 0.04, yt + 0.04, fc);
      for (const s of doors) { w.box(s - 0.05, s + 0.03, -D + 0.04, -D + 0.12, gl, yt, fc); w.box(s + 0.92, s + 1.0, -D + 0.04, -D + 0.12, gl, yt, fc); if (!o.solid) w.box(s, s + 0.95, -D + 0.04, -D + 0.12, gl + 1.0, gl + 1.06, fc); }
      if (o.solid) quad(w, o.doors[0], o.doors[0] + 0.95, gl, yt - 0.04, -D + 0.05, w.n, WH, reg('DOOR'));   // a painted door with a glass light
    }
    // glass: the sky's reflection brightening toward the top (the atlas pane is near black, so the tint runs well over 1)
    const glassCol = (y0, y1, dim) => (p) => { const t = Math.min(1, Math.max(0, (p[1] - y0) / (y1 - y0))); return tint(0.32 + 0.45 * t, 0.36 + 0.6 * t, 0.42 + 0.9 * t).multiplyScalar(dim * GLS); };
    // sloped awning from the wall at yb to the front edge dep out at ya, valance, side cheeks; o.rib: light seams every o.rib m
    function awning(w, s0, s1, ya, yb, dep, col, o = {}) {
      const nr = w.n.map((v, i) => v * (yb - ya) + (i === 1 ? dep : 0)), l = Math.hypot(...nr), n = nr.map((v) => v / l), dk = sc(col, 0.6), vh = o.val || 0.22;
      const top = [w.pt(s0, 0, yb), w.pt(s1, 0, yb), w.pt(s1, dep, ya), w.pt(s0, dep, ya)];
      K.poly(hb, top, n, col); K.poly(hb, top, neg(n), dk); quad(w, s0, s1, ya - vh, ya, dep, w.n, col);
      for (const [s, sn] of [[s0, neg(w.t)], [s1, w.t]]) K.poly(hb, [w.pt(s, 0, yb), w.pt(s, dep, ya), w.pt(s, dep, ya - vh)], sn, dk);
      if (o.rib) { const m = Math.round((s1 - s0) / o.rib), e = n.map((v) => v * 0.02);
        for (let k = 1; k < m; k++) { const s = s0 + (s1 - s0) * k / m, P = (ss, d, y) => w.pt(ss, d, y).map((v, i) => v + e[i]);
          K.poly(hb, [P(s - 0.035, 0, yb), P(s + 0.035, 0, yb), P(s + 0.035, dep, ya), P(s - 0.035, dep, ya)], n, WH); } }
    }

    // ---------- 1443: plan, roof zones (lidar, metres above the record's floorY), the split ----------
    const f = K.fp(1443), F = f.rec.floorY;
    // [a0, a1, b0, b1, roof above F, building]: each front's two-storey part and its one-storey rear wing, the rear building behind the lawn
    const ZONES = [[13.9, 21.3, 0, 14, 7.8, 0], [13.9, 21.3, 14, 38.5, 3.3, 0], [21.3, 33.8, 0, 18, 7.6, 0], [21.3, 33.8, 18, 38.5, 5.0, 0],
      [33.8, 41.2, 0, 30.7, 8.3, 1], [41.2, 47.2, 0, 24.4, 8.2, 2], [47.2, 53.5, 0, 12, 7.6, 3], [47.2, 53.5, 12, 19.8, 2.8, 3],
      [53.5, 61.1, 0, 13, 3.3, 4], [53.5, 61.1, 13, 19.8, 1.8, 4], [61.1, 68.5, 0, 21.5, 7.4, 5], [68.5, 73.8, 0, 21.5, 7.9, 6],
      [73.8, 82, 0, 30.2, 8.3, 7], [0, 13.9, 23, 43.2, 5.0, 8]];
    const TINT = [[1.12, 0.92, 0.86], [1.0, 0.84, 0.84], [0.92, 0.8, 0.78], [1.05, 0.9, 0.85], [1.1, 0.92, 0.88], [1.08, 0.88, 0.86], [1.15, 0.92, 0.86], [0.98, 0.84, 0.8], [1.1, 0.9, 0.85]].map((t) => tint(...t));
    const SA = [...new Set(ZONES.flatMap((z) => [z[0], z[1]]).concat([4.3, 6.5, 11.6, 56.6]))].sort((p, q) => p - q);
    const SB = [...new Set(ZONES.flatMap((z) => [z[2], z[3]]).concat([33.6, 35.8, 37.4, 38.8]))].sort((p, q) => p - q);
    const snap = (v, L) => { const c = L.reduce((m, x) => (Math.abs(v - x) < Math.abs(v - m) ? x : m)); return Math.abs(c - v) < 0.25 ? c : v; };
    const ring = f.pts.map((p) => [snap(p[0], SA), snap(p[1], SB)]);
    const inRing = (a, b) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const p = ring[i], q = ring[j]; if ((p[1] > b) !== (q[1] > b) && a < p[0] + (q[0] - p[0]) * (b - p[1]) / (q[1] - p[1])) c = !c; } return c; };
    const zoneAt = (a, b) => (inRing(a, b) ? ZONES.find((z) => a > z[0] && a < z[1] && b > z[2] && b < z[3]) || null : null);
    const AC = [...new Set([...SA, ...ring.map((p) => p[0])])].sort((p, q) => p - q), BC = [...new Set([...SB, ...ring.map((p) => p[1])])].sort((p, q) => p - q);
    const cells = AC.slice(1).map((a1, i) => BC.slice(1).map((b1, j) => zoneAt((AC[i] + a1) / 2, (BC[j] + b1) / 2)));
    const cell = (i, j) => (cells[i] && cells[i][j]) || null, PAR = 0.45;

    // roofs: membrane per cell; walls: every cell edge that stands above its neighbour (or the ground), merged along each line
    const lines = new Map();
    cells.forEach((col, i) => col.forEach((z, j) => {
      if (!z) return;
      const a0 = AC[i], a1 = AC[i + 1], b0 = BC[j], b1 = BC[j + 1], y = F + z[4];
      K.poly(hb, [K.P(a0, b0, y), K.P(a1, b0, y), K.P(a1, b1, y), K.P(a0, b1, y)], up, ROOF);
      for (const [ii, jj, alongA, c, out] of [[i - 1, j, false, a0, -1], [i + 1, j, false, a1, 1], [i, j - 1, true, b0, -1], [i, j + 1, true, b1, 1]]) {
        const n = cell(ii, jj);
        if (n && n[4] >= z[4] - 0.01) continue;
        if (alongA && c === 0 && out < 0 && !n) continue;   // the fronts: built below
        const key = [alongA, c, out, n ? n[4] : 'g', z[4], z[5]].join('|'), s = alongA ? [a0, a1] : [b0, b1];
        if (!lines.has(key)) lines.set(key, { alongA, c, out, lo: n ? F + n[4] : null, hi: F + z[4] + PAR, bi: z[5], r: [] });
        lines.get(key).r.push(s);
      }
    }));
    for (const ln of lines.values()) {
      ln.r.sort((p, q) => p[0] - q[0]);
      const runs = []; for (const s of ln.r) { const l = runs[runs.length - 1]; if (l && Math.abs(l[1] - s[0]) < 1e-6) l[1] = s[1]; else runs.push(s.slice()); }
      const { alongA, c, out, lo, hi, bi } = ln, w = K.Wall(alongA, c, out), col = TINT[bi], rc = sc(mul(BRK, col), 0.75), gAt = (s) => (alongA ? K.G(s, c) : K.G(c, s));
      for (const [s0, s1] of runs) {
        const L = s1 - s0, gm = Math.min(gAt(s0), gAt(s1), gAt((s0 + s1) / 2)), ya = lo === null ? gm - 0.3 : lo, holes = [], wins = [], doors = [];
        if (lo === null) {   // outer walls: windows upstairs where two storeys, a back door, the Main St face of the rear building
          const twoUp = hi - F > 7, arch = bi === 7 && !alongA, step = arch ? 3.0 : 3.4, nU = twoUp && !(!alongA && c === 13.9 && out < 0) ? Math.floor((L - 0.8) / step) : 0;
          for (let k = 0; k < nU; k++) { const m = s0 + L * (k + 0.5) / nU; wins.push([m - 0.5, m + 0.5, F + 4.6, F + 4.6 + (arch ? 2.0 : 1.8), arch]); }
          if (arch && c === 82 && out > 0) for (const m of [3.6, 7.6]) wins.push([m - 0.55, m + 0.55, F - 1.1, F + 1.2, 0]);   // the corner store's ground-floor windows on Spring St
          if (!alongA && c === 0) { wins.push([s0 + 1.6, s0 + 3.0, gAt(s0 + 2.3) + 0.9, gAt(s0 + 2.3) + 2.5, 0], [s1 - 3.0, s1 - 1.6, gAt(s1 - 2.3) + 0.9, gAt(s1 - 2.3) + 2.5, 0]); doors.push((s0 + s1) / 2 - 0.5); }
          else if (alongA && out > 0 && L >= 4) doors.push(s0 + Math.min(1.5, L * 0.3));
        }
        for (const q of wins) holes.push([q[0], q[1], q[2], q[3] + (q[4] ? 0.45 : 0)]);
        for (const s of doors) holes.push([s, s + 1, gAt(s + 0.5), gAt(s + 0.5) + 2.2]);
        K.wall(w, s0, s1, ya, hi, holes, col, ya, 'brick');
        for (const q of wins) win(w, q[0], q[1], q[2], q[3], rc, col, q[4] ? { arch: 0.45, hood: STONE } : { lin: 0.1 });
        for (const s of doors) K.opening(w, s, s + 1, gAt(s + 0.5), gAt(s + 0.5) + 2.2, 'DOOR', { door: true });
        w.box(s0, s1, -0.3, 0.05, hi, hi + 0.09, COPE, true);
        quad(w, s0, s1, hi - PAR, hi, -0.3, neg(w.n), rc);
      }
    }

    // ---------- 1443: the fronts (b = 0, facing the street; s = a runs south, left to right seen from the square) ----------
    const fw = K.Wall(true, 0, -1), roofAt = (a) => F + (zoneAt(a, 0.5) || [0, 0, 0, 0, 0])[4];
    const spread = (a0, a1, n, m) => Array.from({ length: n }, (_, k) => (n === 1 ? (a0 + a1) / 2 : a0 + m + (a1 - a0 - 2 * m) * k / (n - 1)));
    function front(a0, a1, top, o) {
      const gl = K.G((a0 + a1) / 2, -1.2), g0 = Math.min(K.G(a0, -0.4), K.G(a1, -0.4)) - 0.3, zr = roofAt((a0 + a1) / 2), mat = o.paint ? 'plain' : 'brick';
      const col = o.paint || o.tint, rc = o.paint ? sc(o.paint, 0.8) : sc(mul(BRK, o.tint), 0.75), W1 = o.win, holes = [];
      const ws = W1 ? spread(a0, a1, W1.n, W1.m || 1.6).map((c) => [c - W1.w / 2, c + W1.w / 2]) : [];
      for (const [s0, s1] of ws) holes.push([s0, s1, gl + W1.sill, gl + W1.sill + W1.h + (W1.arch || 0)]);
      for (const s of o.shops) { const g = K.G((s.s0 + s.s1) / 2, -1.2); s.gl = g; holes.push([s.s0, s.s1, g - 0.1, g + s.top]); }
      K.wall(fw, a0, a1, g0, top, holes, col, g0, mat);
      for (const [s0, s1] of ws) win(fw, s0, s1, gl + W1.sill, gl + W1.sill + W1.h, rc, col, { ...W1, mat });
      for (const s of o.shops) shop(fw, s.s0, s.s1, s.gl, s);
      quad(fw, a0, a1, zr, top, -0.3, neg(fw.n), rc);   // the parapet's back and ends, seen over the lower roofs
      for (const [s, n] of [[a0, neg(fw.t)], [a1, fw.t]]) K.poly(hb, [fw.pt(s, 0, zr), fw.pt(s, -0.3, zr), fw.pt(s, -0.3, top), fw.pt(s, 0, top)], n, rc);
      if (o.corn) cornice(fw, a0, a1, top - o.corn.h, top, o.corn.col, o.corn); else fw.box(a0, a1, -0.3, 0.06, top, top + 0.09, o.cope || COPE, true);
      return gl;
    }
    const tp = (lid, add) => F + lid + add;   // a front's top: lidar roof just behind it + its parapet / cornice
    { // the wide corner front (2011 photo)
      const t = TINT[0], top = tp(8.3, 0.6), brick = sc(mul(BRK, t), 0.7);
      const gl = front(13.9, 33.8, top, { tint: t, win: { n: 7, w: 1.38, h: 2.15, sill: 6.15, m: 1.7 },
        shops: [{ s0: 14.5, s1: 23.7, top: 3.6, doors: [15.5], frame: C(0xe8e6df), solid: true, bulk: 0.7, bulkCol: brick }, { s0: 24.5, s1: 33.2, top: 3.6, doors: [25.1], frame: C(0x8a8a86), bulk: 0.7, bulkCol: brick }] });
      fw.box(13.9, 33.8, 0, 0.06, gl + 8.33, gl + 8.63, STONE, true);   // limestone lintel course over the heads
      fw.box(13.9, 33.8, 0, 0.05, gl + 5.75, gl + 5.95, WH, true);   // white band at the awning head
      fw.box(13.9, 33.8, 0, 0.07, top - 0.8, top - 0.65, brick, true); fw.box(13.9, 33.8, 0, 0.13, top - 0.65, top - 0.5, brick, true);   // corbelled courses
      awning(fw, 14.2, 32.6, gl + 3.75, gl + 5.75, 1.75, C(0x4a1c1a), { rib: 0.9, val: 0.18 });   // both shops, to the south door bay (2011, 2018)
    }
    // #2-#4 heights from the 2018 photo, scaled by the 4.2 m lamp and the lidar tops: #3's sashes 5.7-8.3 m, #4's 5.6-7.9 m on a stone sill course
    front(33.8, 41.2, tp(9.4, 0.6), { tint: TINT[1], win: { n: 3, w: 1.1, h: 2.2, sill: 5.8, arch: 0.45, hood: C(0xe0d8c4), m: 1.5 },
      corn: { h: 1.1, col: C(0xd9d0bb), brk: 0.75, dent: true, out: 0.35 }, shops: [{ s0: 34.3, s1: 40.7, top: 3.3, doors: [36.9] }] });
    { const gl = front(41.2, 47.2, tp(8.8, 0.6), { tint: TINT[2], win: { n: 3, w: 0.95, h: 2.15, sill: 5.7, arch: 0.45, hood: STONE, m: 0.9 },
        corn: { h: 0.8, col: C(0x5b4a3a), dent: true }, shops: [{ s0: 41.7, s1: 46.7, top: 3.0, doors: [42.1] }] });
      // white box canopy (2018: it ends where the display front starts and runs 1.4 m onto the front north), a 1.85 m face; a sign panel
      // stands on its front edge (its lettering not drawn)
      fw.box(39.8, 46.9, 0, 1.2, gl + 3.0, gl + 4.85, WH, true); fw.box(43.6, 45.2, 1.2, 1.3, gl + 4.0, gl + 5.3, WH, true); fw.box(43.85, 44.95, 1.3, 1.33, gl + 4.5, gl + 5.05, C(0x58536a));
      fw.box(41.2, 53.5, 0, 0.06, gl + 5.45, gl + 5.6, STONE, true); }
    front(47.2, 53.5, tp(8.0, 0.5), { tint: TINT[3], win: { n: 3, w: 0.95, h: 1.9, sill: 5.6, arch: 0.35, hood: STONE, m: 1.0 },   // one large display window
      corn: { h: 0.6, col: sc(mul(BRK, TINT[3]), 0.85), dent: true }, shops: [{ s0: 47.6, s1: 53.1, top: 2.8, doors: [51.9], bay: 9 }] });
    front(53.5, 61.1, tp(3.6, 0.9), { paint: C(0xc8cfd2), corn: { h: 0.4, col: C(0xb3babd) }, shops: [{ s0: 54.0, s1: 60.6, top: 3.3, doors: [54.4], frame: C(0x8a8a86) }] });
    { const gl = front(61.1, 68.5, tp(7.8, 0.5), { tint: TINT[5], cope: C(0x3a3633), shops: [{ s0: 61.5, s1: 68.1, top: 3.0, doors: [64.3], frame: WH, bulkCol: C(0x2c4f86) }] });
      fw.box(61.3, 68.3, 0, 0.12, gl + 3.0, gl + 5.0, WH, true); }   // tall white storefront fascia
    const AWN = C(0x3b2a22);
    { const gl = front(68.5, 73.8, tp(8.6, 0.5), { tint: TINT[6], win: { n: 4, w: 0.8, h: 2.1, sill: 6.2, m: 0.9 },
        corn: { h: 0.7, col: sc(mul(BRK, TINT[6]), 0.72), dent: true }, shops: [{ s0: 68.9, s1: 73.4, top: 3.3, doors: [69.2] }] });
      fw.box(68.5, 73.8, 0, 0.06, gl + 8.3, gl + 8.55, STONE, true);   // cream lintel band over the heads
      awning(fw, 68.8, 73.5, gl + 2.85, gl + 4.75, 1.3, AWN, { val: 0.25 }); fw.box(68.8, 73.5, 0, 0.1, gl + 4.75, gl + 4.95, WH, true); }   // tall awning, white head strip (2018)
    { const gl = front(73.8, 82, tp(9.0, 0.5), { tint: TINT[7], win: { n: 3, w: 1.05, h: 2.2, sill: 6.3, arch: 0.5, hood: STONE, m: 1.6 },
        corn: { h: 1.0, col: C(0x2f5b47), brk: 0.8, out: 0.35 }, shops: [{ s0: 74.3, s1: 81.6, top: 3.3, doors: [77.2] }] });
      awning(fw, 74.2, 77.05, gl + 2.85, gl + 4.75, 1.3, AWN, { val: 0.25 }); awning(fw, 78.15, 81.7, gl + 2.85, gl + 4.75, 1.3, AWN, { val: 0.25 });
      // the cornice and its parapet return round the corner onto Spring St for one bay
      const top = tp(9.0, 0.5), sw = K.Wall(false, 82, 1), y0 = F + 8.3 + PAR, rc = sc(mul(BRK, TINT[7]), 0.75);
      K.wall(sw, 0, 3.2, y0, top, [], TINT[7], y0, 'brick'); quad(sw, 0, 3.2, y0, top, -0.3, neg(sw.n), rc);
      K.poly(hb, [sw.pt(3.2, 0, y0), sw.pt(3.2, -0.3, y0), sw.pt(3.2, -0.3, top), sw.pt(3.2, 0, top)], sw.t, rc);
      cornice(sw, -0.35, 3.2, top - 1.0, top, C(0x2f5b47), { brk: 0.8, out: 0.35 }); }

    // ---------- the sidewalk (Main St to Spring St, and along the corner store on Spring St) ----------
    // ponytail: the slabs are only drawn, the tyres still read the terrain's grass there; push the strip into K.result.drives if that matters
    const Wd = B.game && B.game.world, kerb = (a, b, d) => { const p = K.P(a, b, 0), r = Wd && Wd.nearestRoad(p[0], p[2], 30); return r ? K.toLocal(r.x, r.z)[d] + (d ? r.hw : -r.hw) : null; };
    { const k0 = kerb(4, -6, 1) || -5.7, k1 = kerb(80, -6, 1) || -5.7, kb = (a) => Math.min(-1, k0 + (k1 - k0) * (a - 4) / 76), n = 54;
      for (let k = 0; k < n; k++) { const a = -1 + 86 * k / n, a2 = -1 + 86 * (k + 1) / n, pts = [[a, kb(a)], [a2, kb(a2)], [a2, 0], [a, 0]];
        K.poly(hb, pts.map((v) => K.P(v[0], v[1], K.G(v[0], v[1]) + 0.07)), up, sc(CONC, k & 1 ? 0.95 : 1)); }
      const ks = kerb(86, 15, 0); if (ks && ks > 82.5) for (let k = 0; k < 18; k++) { const b = kb(85) + (30.2 - kb(85)) * k / 18, b2 = kb(85) + (30.2 - kb(85)) * (k + 1) / 18, pts = [[82, b], [Math.min(ks, 87), b], [Math.min(ks, 87), b2], [82, b2]];
        K.poly(hb, pts.map((v) => K.P(v[0], v[1], K.G(v[0], v[1]) + 0.07)), up, sc(CONC, k & 1 ? 0.95 : 1)); } }

    // ---------- 1435: the bank (frame: a south, b east; north gable on Spring St at a 99.3, east wall on Washington at b -21.8) ----------
    const gk = K.fp(1435), FB = gk.rec.floorY, ye = gk.rec.top, yr = Math.max(gk.rec.ridge, ye + 2.5), bt = tint(0.84, 0.62, 0.56);
    const BROWN = C(0x4f3a2b), BRC = sc(mul(BRK, bt), 0.7), RFC = tint(1.2, 0.95, 0.8), gb = (a, b) => K.G(a, b);
    // ponytail: one rectangle for the main block (the footprint's west wall steps in 1.3 m south of the cross gable; the solids below follow the drawing)
    const a0 = 99.3, a1 = 121, bw = -39, be = -21.8, bm = (bw + be) / 2, glB = Math.min(gb(a0, bw), gb(a0, be), gb(a1, bw), gb(a1, be)) - 0.3;
    // brown trim: the kit's roofs use TRIM for fascia, soffits and barge boards; recolour what one roof call adds
    const browned = (fn) => { const c = hb.col, i0 = c.length, t = K.TRIM; fn(); for (let i = i0; i < c.length; i += 3) if (c[i] === t.r && c[i + 1] === t.g && c[i + 2] === t.b) { c[i] = BROWN.r; c[i + 1] = BROWN.g; c[i + 2] = BROWN.b; } };
    const nW = K.Wall(false, a0, -1), sW = K.Wall(false, a1, 1), eW = K.Wall(true, be, 1), wW = K.Wall(true, bw, -1);
    // the north gable stands on a 6.6 m entrance bay (the 2013 photo: the bay's east side in shade, the wall west of it in the roof's shadow):
    // the north wall either side is set back RD under the roof, the rake soffit runs on over the recesses
    const RD = 1.4, bay = [bm - 3.3, bm + 3.3], nR = K.Wall(false, a0 + RD, -1), ec = bm - 0.5, ent = [ec - 1.4, ec + 1.4], entH = Math.min(ye - FB - 0.35, 2.6), ED = 1.8;
    const ry = (b) => ye + (yr - ye) * (1 - Math.abs(b - bm) / ((be - bw) / 2));   // the main roof's underside over b
    K.wall(nW, bay[0], bay[1], glB, ye, [[ent[0], ent[1], FB - 0.05, FB + entH]], bt, glB, 'brick');
    K.skin(nW, [[bay[0], ye], [bay[1], ye], [bay[1], ry(bay[1])], [bm, yr], [bay[0], ry(bay[0])]], bt, glB, 'brick');
    lining(nW, ent[0], ent[1], FB - 0.05, FB + entH, ED, sc(BRC, 0.5));   // the recessed entrance: brick reveals, glass front with doors at the back
    shop(K.Wall(false, a0 + ED - 0.2, -1), ent[0], ent[1], FB, { top: entH - 0.05, doors: [ec - 0.95, ec], frame: C(0x3a2e24), bulk: 0.1, dim: 0.45 });
    K.box(a0 - 0.05, a0 + ED, ent[0], ent[1], FB - 0.12, FB, CONC, false);
    const ao = (p) => sc(bt, 0.55 + 0.25 * Math.min(1, Math.max(0, (ye - p[1]) / (ye - glB))));   // the recesses in the roof's shadow, lighter toward the base
    for (const [s0, s1] of [[bw, bay[0]], [bay[1], be]]) K.wall(nR, s0, s1, glB, ye, [], ao, glB, 'brick');
    K.skin(nR, [[bw, ye], [bay[0], ye], [bay[0], ry(bay[0])]], ao, glB, 'brick'); K.skin(nR, [[bay[1], ye], [be, ye], [bay[1], ry(bay[1])]], ao, glB, 'brick');
    for (const [b, out] of [[bay[0], -1], [bay[1], 1]]) K.wall(K.Wall(true, b, out), a0, a0 + RD, glB, ry(b), [], ao, glB, 'brick');
    K.wall(sW, bw, be, glB, ye, [[-28.6, -27.4, FB + 1.0, FB + 2.0], [-35.5, -34.5, FB, FB + 2.2]], bt, glB, 'brick');   // teller window under the canopy, back door
    win(sW, -28.6, -27.4, FB + 1.0, FB + 2.0, BRC, bt, {}); K.opening(sW, -35.5, -34.5, FB, FB + 2.2, 'DOOR', { door: true });
    K.gable(sW, bw, be, ye, yr, bt, glB, 'brick');
    const ew = [104.5, 109.5, 114.5].map((m) => [m - 0.6, m + 0.6]);
    K.wall(eW, a0 + RD, a1, glB, ye, ew.map((q) => [q[0], q[1], FB + 0.8, FB + 2.3]), bt, glB, 'brick');
    const bwin = (w, q) => { const y0 = FB + 0.8, y1 = FB + 2.3, m = (q[0] + q[1]) / 2; lining(w, q[0], q[1], y0, y1, 0.15, BRC); quad(w, q[0], q[1], y0, y1, -0.12, w.n, glassCol(y0, y1, 0.55), reg('PANE'));
      w.box(m - 0.035, m + 0.035, -0.12, -0.08, y0, y1, BROWN); w.box(q[0] - 0.08, q[1] + 0.08, 0, 0.08, y0 - 0.1, y0, STONE, true); };
    for (const q of ew) bwin(eW, q);
    const wwin = [[102.0, 103.2], [108.2, 109.4], [115.0, 116.2]];
    K.wall(wW, a0 + RD, a1, glB, ye, [...wwin.map((q) => [q[0], q[1], FB + 0.8, FB + 2.3]), [105.15, 106.15, FB, FB + 2.3]], bt, glB, 'brick');
    for (const q of wwin) bwin(wW, q);
    K.opening(wW, 105.15, 106.15, FB, FB + 2.3, 'DOOR', { door: true });
    const cx = [a0 + RD + 0.6, 111.7], cr = (cx[1] - cx[0]) / 2 * 0.37;   // the west cross gable: its gable on the west wall, roof running into the main one
    K.gable(wW, cx[0], cx[1], ye, ye + cr, bt, glB, 'brick');
    browned(() => {
      K.roof(true, a0 - 0.5, a1 + 0.3, bw, be, ye, yr - ye, 0.55, { col: RFC, rakes: [[a0 - 0.5, a0 + RD]] });
      K.roof(false, bw - 0.5, bm, cx[0], cx[1], ye, cr, 0.5, { col: RFC, rakes: [[bw - 0.5, bw]] });
      // drive-through canopy at the south end: lower gable on two brick piers, a brick gable over the lane's south end
      K.roof(true, a1, 129.5, -30, be, ye, 1.7, 0.45, { col: RFC, under: BROWN });
    });
    for (const b of [-30, be - 0.6]) for (const [w, s0, s1] of [[K.Wall(false, 128.4, -1), b, b + 0.6], [K.Wall(false, 129, 1), b, b + 0.6], [K.Wall(true, b, -1), 128.4, 129], [K.Wall(true, b + 0.6, 1), 128.4, 129]])
      K.wall(w, s0, s1, gb(128.7, b + 0.3) - 0.2, ye, [], bt, ye, 'brick');   // brick piers
    const cw = K.Wall(false, 129, 1); cw.box(-30, be, -0.3, 0, ye - 0.55, ye, BRC, true); K.gable(cw, -30, be, ye, ye + 1.7, bt, ye, 'brick'); K.gable(K.Wall(false, 128.7, -1), -30, be, ye, ye + 1.7, bt, ye, 'brick');
    K.box(a1, 129, -30, -29.7, ye - 0.45, ye, BROWN, true); K.box(a1, 129, be - 0.3, be, ye - 0.45, ye, BROWN, true);
    // solids: the footprint's walls (buildings.js) fold to a point inside the block, the drawn walls and the piers take over; the lane is paved
    // ponytail: edits W.walls in place by matching the outline's corners, as hero_fuel.js does; a kit option for open footprints would replace it
    if (Wd) { const on = (x, z) => gk.rec.pts.some((q) => Math.abs(q[0] - x) < 1e-3 && Math.abs(q[1] - z) < 1e-3), w = Wd.walls, c = K.P(110, -30, 0);
      for (let k = 0; k < w.length; k += 4) if (on(w[k], w[k + 1]) && on(w[k + 2], w[k + 3])) { w[k] = w[k + 2] = c[0]; w[k + 1] = w[k + 3] = c[2]; } }
    for (const [p, q] of [[[a0, bw], [a0, be]], [[a0, be], [a1, be]], [[a1, be], [a1, bw]], [[a1, bw], [a0, bw]]]) K.wallSeg(p[0], p[1], q[0], q[1]);
    for (const b of [-29.7, be - 0.3]) K.circle(128.7, b, 0.42);
    K.drive([[-30, a1, 129], [be, a1, 129]]);

    // ---------- lettering: the north gable's sign (OSM name of 1435), one small canvas ----------
    const sb = U.Buf(), tex = U.canvasTex(512, 128, (g) => {
      g.clearRect(0, 0, 512, 128); g.textAlign = 'center'; g.textBaseline = 'middle';
      const txt = (s, y, px, font) => { g.font = px + 'px ' + font; const m = g.measureText(s).width; if (m > 480) g.font = Math.floor(px * 480 / m) + 'px ' + font; g.fillStyle = 'rgba(30,20,10,0.55)'; g.fillText(s, 258, y + 3); g.fillStyle = '#efe4c8'; g.fillText(s, 256, y); };
      txt('LIBRARY', 40, 54, U.SIGN_FONT); txt('ANNEX', 96, 44, U.SIGN_FONT);
    });
    { const sw = 3.4, y0 = ye + 0.3, y1 = y0 + sw * 0.25;
      K.poly(sb, [nW.pt(bm + sw / 2, 0.03, y0), nW.pt(bm - sw / 2, 0.03, y0), nW.pt(bm - sw / 2, 0.03, y1), nW.pt(bm + sw / 2, 0.03, y1)], nW.n, WH, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    const mesh = new T.Mesh(U.bufGeo(sb), new T.MeshLambertMaterial({ map: tex, alphaTest: 0.5 }));
    mesh.receiveShadow = true; mesh.name = 'heroes';
    if (B.game && B.game.scene) B.game.scene.add(mesh);
  }
})();
