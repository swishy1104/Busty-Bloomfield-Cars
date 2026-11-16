/* Bloomfield Drift — hero plug-in: the north side of the courthouse square (E. Main St, Franklin St to Washington Ave) and the old
   hotel-over-stores block at the NW corner of Main & Franklin. Replaces footprints 603 and 607 (heroes.js kit, see its header).
   603 is one OSM polygon over eight 2-storey brick fronts; split here as the owner's 2010 (looking east) and 2013 (looking west) photos
   show them, west to east: Town Hall & Police Dept (12 E. Main: modern storefront under a grey sign panel, white pressed-metal fan frieze);
   the Hunley Real Estate pair (same frieze, stone lintels, green dome awning, red mansard awning); a narrow front with two round-arched
   windows; the six-bay front with the bracketed white cornice and window boxes; the front with the blue-grey cornice, gablet and attic
   lights; a narrow blue-grey front (Bloomfield Arms & Ammo); the seven-arch front with the corbelled parapet and maroon awning; and the
   China House corner (red-painted ground floor, ochre cornice, boarded upper windows), its Washington Ave side made to match.
   Also the narrow corner unit west of the Town Hall that no footprint covers (white-painted ground floor, brick upstairs, corbel table),
   with its own walls, collision, minimap outline and Franklin St sidewalk; its depth matches the Town Hall's (no photo shows its side).
   Widths: photo perspective fitted to the footprint ends (the 2010 photo puts every front but the China House on one line: OSM's notch
   and its step at the fourth/fifth fronts are dropped, the step moves to the China House); heights: lidar roof levels, details as the
   photos show. 607 (only its west end is in a photo: plain red brick, plain windows, a parapet stepping down behind
   the front) follows the 1921-40 Sanborn: seven fronts (hotel lobby, office, store, restaurant, three stores) under the hotel's rooms.
   Rear walls, roofs and party walls follow the footprint and the lidar's low rear wing. Lettering from the photos (and "The Chapel", the
   map's name for 607) is drawn on one small canvas: the only mesh this adds beyond the kit's shared ones. Public surface: just this
   plug-in record. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  B.heroPlugins = (B.heroPlugins || []).concat({ id: 'square_north', name: 'north side of the square', footprints: [603, 607], build });

  function build(K) {
    const T = THREE, U = B.util, C = K.C, hb = K.hb, WH = C(0xffffff), STONE = C(0xd2c7ae), up = [0, 1, 0], neg = (v) => v.map((x) => -x);
    const tint = (r, g, b) => new T.Color(r, g, b), BRK = C(0x8e6458), sb = U.Buf();
    const mulc = (c, t) => c.clone().multiply(t);

    // ---------- wall-plane helpers (w from K.Wall / K.Seg: s along, d outward, y up) ----------
    const reg = (r) => { const [u0, v0, u1, v1] = K.uvr(K.R[r], 1); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; };
    const quad = (w, s0, s1, ya, yb, d, n, col, uv) => K.poly(hb, [w.pt(s0, d, ya), w.pt(s1, d, ya), w.pt(s1, d, yb), w.pt(s0, d, yb)], n, col, uv);
    function lining(w, s0, s1, ya, yb, D, rc, head = true) {
      if (head) K.poly(hb, [w.pt(s0, 0, yb), w.pt(s1, 0, yb), w.pt(s1, -D, yb), w.pt(s0, -D, yb)], [0, -1, 0], rc);
      K.poly(hb, [w.pt(s0, 0, ya), w.pt(s1, 0, ya), w.pt(s1, -D, ya), w.pt(s0, -D, ya)], up, rc);
      K.poly(hb, [w.pt(s0, 0, ya), w.pt(s0, -D, ya), w.pt(s0, -D, yb), w.pt(s0, 0, yb)], w.t, rc);
      K.poly(hb, [w.pt(s1, 0, ya), w.pt(s1, -D, ya), w.pt(s1, -D, yb), w.pt(s1, 0, yb)], neg(w.t), rc);
    }
    // sash window in masonry: brick reveals, sash 0.12 back, stone sill, optional stone lintel (o.lin = its overhang), o.blind = the part a
    // white blind covers (lit at dusk)
    function win(w, s0, s1, ya, yb, rc, o = {}) {
      lining(w, s0, s1, ya, yb, 0.15, rc);
      quad(w, s0, s1, ya, yb, -0.12, w.n, o.col || WH, reg(o.region || 'S1'));
      if (o.blind) quad(w, s0 + 0.07, s1 - 0.07, yb - 0.07 - (yb - ya - 0.14) * o.blind, yb - 0.07, -0.112, w.n, C(0xe2e0d8), reg('LIT'));
      if (o.sill !== false) w.box(s0 - 0.08, s1 + 0.08, 0, 0.08, ya - 0.1, ya, STONE, true);
      if (o.lin) w.box(s0 - o.lin, s1 + o.lin, 0, 0.035, yb, yb + 0.28, o.linCol || STONE, true);
    }
    // round-headed window: the sash over the whole height (meeting rail mid-way), brick spandrels to the hole's square head, a hood ring
    function archWin(w, s0, s1, ya, ys, rc, wallCol, hood) {
      const r = (s1 - s0) / 2, sm = s0 + r, yt = ys + r, D = 0.15, N = 8, [u0, v0, u1, v1] = K.uvr(K.R.S1, 1), arc = [];
      for (let k = 0; k <= N; k++) { const t = Math.PI * k / N; arc.push([sm + r * Math.cos(t), ys + r * Math.sin(t)]); }
      const sash = [[s0, ya], [s1, ya], ...arc], uv = (q) => [u0 + (u1 - u0) * (q[0] - s0) / (s1 - s0), v0 + (v1 - v0) * (q[1] - ya) / (yt - ya)];
      K.poly(hb, sash.map((q) => w.pt(q[0], -0.12, q[1])), w.n, WH, sash.map(uv));
      lining(w, s0, s1, ya, ys, D, rc, false);
      for (let k = 0; k < N; k++) { const p = arc[k], q = arc[k + 1], tm = Math.PI * (k + 0.5) / N, n = w.t.map((v, i) => -Math.cos(tm) * v - (i === 1 ? Math.sin(tm) : 0));
        K.poly(hb, [w.pt(p[0], 0, p[1]), w.pt(q[0], 0, q[1]), w.pt(q[0], -D, q[1]), w.pt(p[0], -D, p[1])], n, rc); }
      K.skin(w, [[s0, yt], ...arc.slice(N / 2).reverse()], wallCol, ya, 'brick'); K.skin(w, [[s1, yt], ...arc.slice(0, N / 2 + 1)], wallCol, ya, 'brick');
      for (let k = 0; k < N && hood; k++) {
        const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N, R = r + 0.2, Pp = (t, rr, d) => w.pt(sm + rr * Math.cos(t), d, ys + rr * Math.sin(t)), tm = (a0 + a1) / 2;
        K.poly(hb, [Pp(a0, r, 0.035), Pp(a1, r, 0.035), Pp(a1, R, 0.035), Pp(a0, R, 0.035)], w.n, hood);
        K.poly(hb, [Pp(a0, R, 0), Pp(a1, R, 0), Pp(a1, R, 0.035), Pp(a0, R, 0.035)], w.t.map((v, i) => Math.cos(tm) * v + (i === 1 ? Math.sin(tm) : 0)), hood);
      }
      w.box(s0 - 0.08, s1 + 0.08, 0, 0.08, ya - 0.1, ya, STONE, true);
    }
    // cornice from y0 to y1: bed moulding, frieze, crown (reaching back over the parapet); o.brk bracket spacing (o.bw half width), o.pan raised panels, o.dent dentils
    function cornice(w, s0, s1, y0, y1, col, o = {}) {
      const out = o.out || 0.3, dk = col.clone().multiplyScalar(0.8), n = (sp) => Math.max(1, Math.round((s1 - s0) / sp)), at = (k, m) => s0 + (k + 0.5) * (s1 - s0) / m;
      w.box(s0, s1, -0.3, out, y1 - 0.15, y1, col, true); w.box(s0, s1, 0, out * 0.6, y1 - 0.27, y1 - 0.15, col, true);
      w.box(s0, s1, 0, 0.05, y0 + 0.12, y1 - 0.27, col); w.box(s0, s1, 0, 0.13, y0, y0 + 0.12, col, true);
      if (o.brk) { const m = n(o.brk), bw = o.bw || 0.06, yc = o.con ? y1 - 0.27 - (y1 - y0) * 0.32 : y0 + 0.08;   // o.con: consoles (deep head, shallow drop)
        for (let k = 0; k < m; k++) { const s = at(k, m); w.box(s - bw, s + bw, 0.05, out * 0.85, yc, y1 - 0.27, col, true); if (o.con) w.box(s - bw * 0.7, s + bw * 0.7, 0.05, out * 0.38, y0 + 0.08, yc, col, true); } }
      if (o.pan) { const m = n(o.pan); for (let k = 0; k < m; k++) { const s = at(k, m), h = o.pan * 0.34; w.box(s - h, s + h, 0.05, 0.085, y0 + 0.2, y1 - 0.37, dk); } }
      if (o.dent) { const m = n(0.2); for (let k = 0; k < m; k++) { const s = at(k, m); w.box(s - 0.045, s + 0.045, 0.05, out * 0.5, y1 - 0.4, y1 - 0.27, col, true); } }
    }
    // storefront in a hole s0..s1 from the pavement: bulkhead, glass (mullions every o.bay m, transom bar), frame-coloured reveals; doors [s, ...] 0.95 m
    function shop(w, s0, s1, gl, o = {}) {
      const y1 = gl + (o.bulk === undefined ? 0.5 : o.bulk), y2 = gl + (o.top || 2.9), yt = gl + 2.3, D = 0.2, fc = o.frame || C(0x37332f), doors = o.doors || [];
      lining(w, s0, s1, gl - 0.1, y2, D, fc);
      const glass = (p) => { const t = Math.min(1, Math.max(0, (p[1] - gl) / (y2 - gl))); return tint(0.32 + 0.45 * t, 0.36 + 0.6 * t, 0.42 + 0.9 * t); };   // sky reflection toward the top
      K.poly(hb, [w.pt(s0, -D + 0.04, gl), w.pt(s1, -D + 0.04, gl), w.pt(s1, -D + 0.04, y2), w.pt(s0, -D + 0.04, y2)], w.n, glass, reg('PANE'));
      const xs = [s0, ...doors.flatMap((s) => [s, s + 0.95]), s1];
      for (let i = 0; i < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) {   // bulkheads between doors, mullions in each stretch
        w.box(xs[i], xs[i + 1], -D, -D + 0.1, gl - 0.1, y1, o.bulkCol || fc);
        const m = Math.max(1, Math.round((xs[i + 1] - xs[i]) / (o.bay || 1.8)));
        for (let k = 1; k < m; k++) { const s = xs[i] + (xs[i + 1] - xs[i]) * k / m; w.box(s - 0.035, s + 0.035, -D + 0.04, -D + 0.1, y1, y2, fc); }
      }
      w.box(s0, s1, -D + 0.04, -D + 0.1, yt - 0.04, yt + 0.04, fc);
      for (const s of doors) { w.box(s - 0.05, s + 0.03, -D + 0.04, -D + 0.12, gl, yt, fc); w.box(s + 0.92, s + 1.0, -D + 0.04, -D + 0.12, gl, yt, fc); w.box(s, s + 0.95, -D + 0.04, -D + 0.12, gl + 1.0, gl + 1.06, fc); }
    }
    // awnings: 'dome' (quarter round), 'slope' (straight), 'mansard' (steep, seamed); front valance; side cheeks
    function awning(w, s0, s1, ya, yb, dep, col, kind) {
      const N = kind === 'dome' ? 5 : 1, prof = [];
      for (let k = 0; k <= N; k++) { const t = k / N; prof.push(kind === 'dome' ? [dep * Math.sin(t * Math.PI / 2), yb - (yb - ya) * (1 - Math.cos(t * Math.PI / 2))] : [dep * t, yb - (yb - ya) * t]); }
      const dk = col.clone().multiplyScalar(0.72), seam = kind === 'mansard' ? Math.max(1, Math.round((s1 - s0) / 0.42)) : 1;
      for (let k = 0; k < N; k++) { const p = prof[k], q = prof[k + 1], n = w.n.map((v, i) => v * (p[1] - q[1]) + (i === 1 ? q[0] - p[0] : 0));
        for (let j = 0; j < seam; j++) { const a = s0 + (s1 - s0) * j / seam, b = s0 + (s1 - s0) * (j + 1) / seam;
          K.poly(hb, [w.pt(a, p[0], p[1]), w.pt(b, p[0], p[1]), w.pt(b, q[0], q[1]), w.pt(a, q[0], q[1])], n, j & 1 ? col.clone().multiplyScalar(0.9) : col); } }
      const e = prof[N], vh = kind === 'mansard' ? 0.12 : 0.28;
      quad(w, s0, s1, e[1] - vh, e[1], e[0], w.n, col); K.poly(hb, [w.pt(s0, 0, e[1] - vh), w.pt(s1, 0, e[1] - vh), w.pt(s1, e[0], e[1] - vh), w.pt(s0, e[0], e[1] - vh)], [0, -1, 0], dk);
      for (const [s, n] of [[s0, neg(w.t)], [s1, w.t]]) K.poly(hb, [w.pt(s, 0, e[1] - vh), w.pt(s, e[0], e[1] - vh), ...prof.slice().reverse().map((q) => w.pt(s, q[0], q[1]))], n, dk);
      return e;
    }
    // lettering: a quad on the plane w at offset d, showing slot k of the sign canvas
    const SL = { th: [0, 0, 1024, 216], china: [0, 216, 620, 120], arms: [620, 216, 260, 150], hunB: [880, 216, 144, 112], hunA: [0, 336, 512, 56], grill: [512, 368, 400, 74], chapel: [0, 400, 512, 64], flag: [912, 340, 112, 59] };
    const sign = (w, k, s0, s1, ya, yb, d) => { const [x, y, sw, sh] = SL[k], u0 = (x + 2) / 1024, u1 = (x + sw - 2) / 1024, v0 = 1 - (y + sh - 2) / 512, v1 = 1 - (y + 2) / 512;   // 2 px in: no bleed from the next slot
      K.poly(sb, [w.pt(s0, d, ya), w.pt(s1, d, ya), w.pt(s1, d, yb), w.pt(s0, d, yb)], w.n, WH, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]); };

    // ---------- 603: the footprint, its front lines, and the split ----------
    const f = K.fp(603), F = f.rec.floorY, ring = f.pts.map((p) => p.slice()), fr = ring.filter((p) => p[1] < 6);
    const bE = Math.min(...fr.map((p) => p[1])), aStep = Math.min(...fr.filter((p) => p[1] < bE + 0.3).map((p) => p[0]));   // OSM's front steps 1.6 m out here
    const bW = Math.min(...fr.filter((p) => p[0] < aStep - 6).map((p) => p[1])), A8 = 66.8;
    // the 2010 photo shows one unbroken front from the Town Hall to the corner building, which alone stands out (A8 = its west wall): OSM's
    // 5 x 2.3 m notch and its step at aStep go, and the fifth to seventh fronts stand on the west line
    { const i = ring.findIndex((p, k) => { const q = ring[(k + 1) % ring.length]; return p[1] < bE + 0.3 && q[1] < bE + 0.3 && p[0] < A8 && q[0] > A8; });
      ring.splice(i + 1, 0, [A8, bW], [A8, bE]); }
    for (const p of ring) if (p[1] < 6 && p[0] < A8 - 0.01) p[1] = bW;
    const clean = (r) => { let o = r; for (let n = -1; n !== o.length;) { n = o.length; o = o.filter((p, i) => { const a = o[(i + o.length - 1) % o.length], c = o[(i + 1) % o.length];
      return Math.hypot(p[0] - a[0], p[1] - a[1]) > 0.02 && Math.abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 1e-3; }); } return o; };
    const R0 = clean(ring), aMax = Math.max(...R0.map((p) => p[0]));
    const frontB = (a) => (a < A8 ? bW : bE);
    // 603's own collision walls (buildings.js put them in W.walls; read at W.buildCollision, after this) still follow OSM's notch and step:
    // re-aim those segments at this front line
    const wl = B.game && B.game.world && B.game.world.walls;
    if (wl) { const P = f.rec.pts, hit = [], NEW = [[aStep - 6, bW, A8, bW], [A8, bW, A8, bE], [A8, bE, aMax, bE]], eq = (k, x, z) => Math.abs(wl[k] - x) + Math.abs(wl[k + 1] - z) < 1e-3;
      P.forEach((p, i) => { const q = P[(i + 1) % P.length], m = K.toLocal((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        if (m[1] > -1 && m[1] < 6 && m[0] > aStep - 6 && m[0] < aMax - 1) for (let k = 0; k < wl.length; k += 4) if (eq(k, p[0], p[1]) && eq(k + 2, q[0], q[1])) hit.push(k); });
      NEW.forEach((n, j) => { const p = K.P(n[0], n[1], 0), q = K.P(n[2], n[3], 0), v = [p[0], p[2], q[0], q[2]]; if (j < hit.length) v.forEach((x, c) => (wl[hit[j] + c] = x)); else wl.push(...v); });
      for (const k of hit.slice(NEW.length)) for (let c = 0; c < 4; c++) wl[k + c] = wl[hit[0] + c];   // spare segments: copies of the first
    }
    // the split (a, m from the frame origin at the Town Hall's west corner) and heights: top = cornice top above the pavement in front
    const cuts = [0, 7.4, 21.8, 27.2, aStep, 46.5, 53, A8, aMax], TOPS = [9.5, 9.5, 9.6, 11.0, 10.5, 10.2, 10.4, 10.8];
    const TINT = [[1.16, 0.94, 0.93], [1.14, 0.93, 0.91], [1.02, 0.86, 0.85], [1.06, 0.88, 0.87], [1.16, 0.94, 0.92], [1.08, 0.88, 0.86], [0.86, 0.74, 0.76], [0.74, 0.29, 0.3]].map((t) => tint(...t));
    const BL = TOPS.map((top, i) => { const a0 = cuts[i], a1 = cuts[i + 1], gl = K.G((a0 + a1) / 2, frontB(a0 + 0.1) - 1.2);
      return { i, a0, a1, gl, top: gl + top, roof: gl + top - 1.0, tint: TINT[i], brick: mulc(BRK, TINT[i]) }; });
    const WING = [19.7, 31.1, 14, BL[0].gl + 5.5];   // the lidar's one-storey rear wing behind the third and fourth fronts
    const bldAt = (a) => BL.find((d) => a < d.a1) || BL[BL.length - 1];
    const hAt = (a, b) => (a > WING[0] && a < WING[1] && b > WING[2] ? WING[3] : bldAt(a).roof);
    const inside = (r, a, b) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const p = r[i], q = r[j]; if ((p[1] > b) !== (q[1] > b) && a < p[0] + (q[0] - p[0]) * (b - p[1]) / (q[1] - p[1])) c = !c; } return c; };
    const clip = (r, k, v, sg) => { const o = []; r.forEach((p, i) => { const q = r[(i + 1) % r.length], ip = (p[k] - v) * sg >= 0, iq = (q[k] - v) * sg >= 0;
      if (ip) o.push(p); if (ip !== iq) { const t = (v - p[k]) / (q[k] - p[k]); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } }); return o; };
    const ROOF = C(0x55534f), COPE = C(0xb9b2a4);

    // roofs: one flat roof per front (and the low wing), membrane only; parapets come with the walls
    const allCuts = [...new Set([...cuts, WING[0], WING[1]])].sort((p, q) => p - q);
    for (let i = 0; i < allCuts.length - 1; i++) {
      const a0 = allCuts[i], a1 = allCuts[i + 1], P = clean(clip(clip(R0, 0, a0, 1), 0, a1, -1)), m = (a0 + a1) / 2;
      if (P.length < 3) continue;
      const parts = m > WING[0] && m < WING[1] ? [clip(P, 1, WING[2], -1), clip(P, 1, WING[2], 1)] : [P];
      for (const q of parts.map(clean)) if (q.length > 2) { const c = q.reduce((s, p) => [s[0] + p[0] / q.length, s[1] + p[1] / q.length], [0, 0]); K.flat(q, hAt(c[0], c[1]), { parapet: 0, col: ROOF }); }
    }
    // a wall with a coping and the parapet's inner face (roof side), brick from yb up
    function plainWall(w, s0, s1, ya, yb, roofY, col, holes = []) {
      K.wall(w, s0, s1, ya, yb, holes, col, ya, 'brick');
      w.box(s0, s1, -0.3, 0.05, yb, yb + 0.09, COPE, true);
      if (roofY < yb) quad(w, s0, s1, roofY, yb, -0.3, neg(w.n), mulc(BRK, col).multiplyScalar(0.8));
    }
    // outer walls (not the fronts): split at the cuts; rear walls get windows upstairs and a back door
    const isStub = (p, q) => Math.abs(p[0] - A8) < 0.05 && Math.abs(q[0] - A8) < 0.05 && Math.max(p[1], q[1]) <= bW + 0.05;   // the corner building's west return: below
    let eastSeg = null;
    R0.forEach((p, i) => {
      const q = R0[(i + 1) % R0.length], da = q[0] - p[0], db = q[1] - p[1], L = Math.hypot(da, db);
      if (da > 0.5 && Math.abs(db) < 0.3 && Math.max(p[1], q[1]) <= frontB((p[0] + q[0]) / 2) + 0.05) return;   // a front: the facades below
      if (isStub(p, q)) return;
      if (p[0] > aMax - 1 && q[0] > aMax - 1) { eastSeg = [p, q]; return; }   // China House's Washington Ave side: below
      const ts = [0, 1];
      for (const c of allCuts) { const t = (c - p[0]) / da; if (Math.abs(da) > 1e-6 && t > 0.001 && t < 0.999) ts.push(t); }
      { const t = (WING[2] - p[1]) / db; if (Math.abs(db) > 1e-6 && t > 0.001 && t < 0.999) ts.push(t); }
      ts.sort((x, y) => x - y);
      for (let k = 0; k < ts.length - 1; k++) {
        const A = [p[0] + da * ts[k], p[1] + db * ts[k]], Bq = [p[0] + da * ts[k + 1], p[1] + db * ts[k + 1]], m = [(A[0] + Bq[0]) / 2, (A[1] + Bq[1]) / 2];
        if (Math.hypot(Bq[0] - A[0], Bq[1] - A[1]) < 0.05) continue;
        const d = bldAt(m[0]), h = hAt(m[0], m[1]), w = K.Seg(A[0], A[1], Bq[0], Bq[1]), g = Math.min(K.G(A[0], A[1]), K.G(Bq[0], Bq[1]), K.G(m[0], m[1])), holes = [];
        if (da / L < -0.7 && w.L > 2.5 && h - d.gl > 6.5) {   // walking west = a rear wall: windows upstairs, a back door
          const n = Math.floor(w.L / 3.6);
          for (let j = 0; j < n; j++) { const c = w.L * (j + 0.5) / n; holes.push([c - 0.45, c + 0.45, d.gl + 5.1, d.gl + 6.7]); }
          if (n) holes.push([w.L * 0.5 / n - 0.48, w.L * 0.5 / n + 0.48, g + 0.3, g + 2.4]);
        }
        plainWall(w, 0, w.L, g - 0.3, h + 0.5, h, d.tint, holes);
        holes.forEach((hh, j) => (j === holes.length - 1 ? win(w, hh[0], hh[1], hh[2], hh[3], d.brick, { region: 'DOOR', sill: false }) : win(w, hh[0], hh[1], hh[2], hh[3], d.brick, { lin: 0.05, linCol: d.brick.clone().multiplyScalar(0.8) })));
      }
    });
    // party walls where neighbouring roofs differ: across the cut lines and the wing's front edge
    const cross = (k, v) => { const xs = []; R0.forEach((p, i) => { const q = R0[(i + 1) % R0.length]; if ((p[k] - v) * (q[k] - v) < 0) xs.push(p[1 - k] + (q[1 - k] - p[1 - k]) * (v - p[k]) / (q[k] - p[k])); }); return xs.sort((x, y) => x - y); };
    for (const c of allCuts.slice(1, -1)) {
      const xs = cross(0, c + 1e-4);
      for (let k = 0; k + 1 < xs.length; k += 2) for (const [b0, b1] of [[Math.max(xs[k], frontB(c - 0.01), frontB(c + 0.01)), Math.min(xs[k + 1], WING[2])], [Math.max(xs[k], WING[2]), xs[k + 1]]]) {
        if (b1 - b0 < 0.05) continue;
        const bm = (b0 + b1) / 2, hl = hAt(c - 0.01, bm), hr = hAt(c + 0.01, bm); if (Math.abs(hl - hr) < 0.05) continue;
        const tall = hl > hr ? -1 : 1, w = tall < 0 ? K.Seg(c, b0, c, b1) : K.Seg(c, b1, c, b0), d = bldAt(c + tall * 0.01);
        plainWall(w, 0, w.L, Math.min(hl, hr) - 0.1, Math.max(hl, hr) + 0.5, Math.max(hl, hr), d.tint);
      }
    }
    { const xs = cross(1, WING[2] + 1e-4);
      for (let k = 0; k + 1 < xs.length; k += 2) { const a0 = Math.max(xs[k], WING[0]), a1 = Math.min(xs[k + 1], WING[1]); if (a1 - a0 < 0.05) continue;
        const w = K.Seg(a1, WING[2], a0, WING[2]); plainWall(w, 0, w.L, WING[3] - 0.1, bldAt((a0 + a1) / 2).roof + 0.5, bldAt((a0 + a1) / 2).roof, bldAt((a0 + a1) / 2).tint); } }

    // ---------- 603: the eight fronts ----------
    const front = (d) => K.Wall(true, frontB(d.a0 + 0.1), -1);
    const brickWall = (d, w, holes, y1 = d.top) => K.wall(w, d.a0, d.a1, Math.min(K.G(d.a0, frontB(d.a0 + 0.1) - 0.3), K.G(d.a1 - 0.01, frontB(d.a1 - 0.1) - 0.3)) - 0.3, y1, holes, d.tint, 0, 'brick');
    const parapetBack = (d, w) => quad(w, d.a0, d.a1, d.roof, d.top, -0.3, neg(w.n), d.brick.clone().multiplyScalar(0.8));
    const WHT = C(0xe9e6dc), BLUEGREY = C(0x6b7b88), OCHRE = C(0xb08a45), SILVER = C(0xa9adae);
    const wbox = (w, c, y) => { w.box(c - 0.45, c + 0.45, 0.02, 0.26, y - 0.26, y, C(0x9a5a3c), true); w.box(c - 0.4, c + 0.4, 0.05, 0.22, y, y + 0.1, C(0x3f5a2c)); };   // window box, planted

    // 1 Town Hall & Police Dept: three windows (one narrow), stone lintels and sills, grey sign panel over an aluminium storefront
    { const d = BL[0], w = front(d), g = d.gl, s = (x) => d.a0 + x * (d.a1 - d.a0) / 7.02, wins = [[0.68, 1.53, 5.33], [2.44, 3.76, 5.0], [4.96, 6.24, 5.0]];   // the narrow one sits higher
      const holes = [[s(0.55), s(6.75), g - 1, g + 4.45], ...wins.map(([p, q, y]) => [s(p), s(q), g + y, g + 6.7])];
      brickWall(d, w, holes); parapetBack(d, w);
      shop(w, s(0.55), s(6.75), g, { top: 2.9, bulk: 0.12, frame: SILVER, doors: [s(0.75), s(1.9)], bay: 2.2 });
      w.box(s(0.55), s(6.75), -0.06, 0.04, g + 2.9, g + 4.45, C(0xd9d8d2), true); sign(w, 'th', s(0.62), s(6.68), g + 2.98, g + 4.37, 0.06);
      w.box(d.a0, d.a1, 0, 0.06, g + 4.45, g + 4.58, STONE, true);
      for (const [p, q, y] of wins) win(w, s(p), s(q), g + y, g + 6.7, d.brick, { lin: 0.14, blind: 1 });
      cornice(w, d.a0, d.a1, g + 8.35, d.top, WHT, { pan: 0.55, out: 0.24 });
      for (const [x, hw] of [[0.32, 0.32], [7.02, 0.2]]) { w.box(s(x) - hw, s(x) + hw, -0.3, 0.3, g + 8.3, d.top + 0.32, WHT, true); w.box(s(x) - hw - 0.04, s(x) + hw + 0.04, -0.3, 0.34, d.top + 0.32, d.top + 0.4, WHT, true); }
    }
    // 2 Hunley pair: four windows over a stone sill course, wide stone lintels; buff-brick shop with the green dome awning, shop with a red mansard awning
    { const d = BL[1], w = front(d), g = d.gl, L = d.a1 - d.a0, cs = [0, 1, 2, 3].map((k) => d.a0 + L * (k + 0.5) / 4), mid = d.a0 + L * 0.47;
      const holes = [[d.a0, mid + 0.3, g - 1, g + 3.45], [mid + 0.3, d.a1 - 0.4, g - 1, g + 2.9], ...cs.map((c) => [c - 0.47, c + 0.47, g + 5.05, g + 6.85])];
      brickWall(d, w, holes); parapetBack(d, w);
      const BUFF = C(0xcdb88e);   // the buff-brick shop face, as paint (the red brick texture would fight it)
      K.wall(w, d.a0, mid + 0.3, g - 0.4, g + 3.45, [[d.a0 + 0.4, mid - 0.3, g - 1, g + 2.75]], BUFF, 0, 'plain');
      shop(w, d.a0 + 0.4, mid - 0.3, g - 0.0, { top: 2.75, frame: C(0x5a2a26), bulkCol: BUFF, doors: [mid - 1.6] });
      w.box(d.a0 + 0.4, d.a0 + 1.9, 0.05, 0.09, g + 1.9, g + 2.7, C(0xb7c2c4));   // glass-block light
      w.box(d.a0, mid + 0.3, 0, 0.12, g + 3.45, g + 3.75, C(0x5c2426), true);   // maroon band along the awning's top
      const e = awning(w, d.a0 + 1.9, mid - 0.25, g + 2.75, g + 3.5, 0.95, C(0x17614f), 'dome');
      sign(w, 'hunA', d.a0 + 2.0, mid - 0.35, e[1] - 0.27, e[1] - 0.01, e[0] + 0.01);
      shop(w, mid + 0.3, d.a1 - 0.4, g, { top: 2.9, frame: C(0x2f2b28), doors: [d.a1 - 1.6] });
      awning(w, mid + 0.3, d.a1 - 0.3, g + 3.0, g + 4.15, 1.25, C(0x8a3a2c), 'mansard');
      w.box(d.a0, d.a1, 0, 0.08, g + 4.85, g + 5.05, STONE, true);
      cs.forEach((c, k) => win(w, c - 0.47, c + 0.47, g + 5.05, g + 6.85, d.brick, { sill: false, lin: 0.3, blind: k > 1 ? 0.45 : 0 }));
      w.box(cs[1] - 0.5, cs[1] + 0.5, 0.06, 0.12, g + 6.0, g + 6.8, WH, true); sign(w, 'hunB', cs[1] - 0.47, cs[1] + 0.47, g + 6.03, g + 6.77, 0.125);
      cornice(w, d.a0, d.a1, g + 8.35, d.top, WHT, { pan: 0.55, out: 0.24 });
      w.box(d.a1 - 0.35, d.a1, -0.3, 0.3, g + 8.3, d.top + 0.32, WHT, true); w.box(d.a1 - 0.39, d.a1 + 0.02, -0.3, 0.34, d.top + 0.32, d.top + 0.4, WHT, true);
    }
    // 3 and 4 share a flat white canopy; 3: two round-headed windows; 4: six windows with boxes, a sunk brick panel and the big bracketed cornice
    const CANOPY = C(0xe8e8e3);
    { const d = BL[2], w = front(d), g = d.gl, L = d.a1 - d.a0, cs = [0.29, 0.71].map((t) => d.a0 + L * t);
      brickWall(d, w, [[d.a0 + 0.35, d.a1 - 0.35, g - 1, g + 3.0], ...cs.map((c) => [c - 0.46, c + 0.46, g + 5.1, g + 7.36])]); parapetBack(d, w);
      shop(w, d.a0 + 0.35, d.a1 - 0.35, g, { top: 3.0, frame: C(0xd8d6cf), doors: [d.a0 + 0.6] });
      w.box(d.a0, d.a1, 0, 0.07, g + 4.95, g + 5.1, STONE, true);
      for (const c of cs) { archWin(w, c - 0.46, c + 0.46, g + 5.1, g + 6.9, d.brick, d.tint, d.brick.clone().multiplyScalar(0.75)); wbox(w, c, g + 4.93); }
      cornice(w, d.a0, d.a1, g + 8.75, d.top, WHT, { pan: 0.5, out: 0.26 });
    }
    { const d = BL[3], w = front(d), g = d.gl, L = d.a1 - d.a0, cs = [0, 1, 2, 3, 4, 5].map((k) => d.a0 + L * (k + 0.5) / 6), sp = d.a0 + 4.8;
      brickWall(d, w, [[d.a0 + 0.35, sp - 0.3, g - 1, g + 3.0], [sp + 0.3, d.a1 - 0.35, g - 1, g + 3.0], ...cs.map((c) => [c - 0.42, c + 0.42, g + 5.15, g + 7.05])]); parapetBack(d, w);
      shop(w, d.a0 + 0.35, sp - 0.3, g, { top: 3.0, frame: C(0xd8d6cf), doors: [sp - 1.5] });
      shop(w, sp + 0.3, d.a1 - 0.35, g, { top: 3.0, frame: C(0x2f2b28), doors: [sp + 0.6] });
      w.box(d.a0, d.a1, 0, 0.07, g + 5.0, g + 5.15, STONE, true); w.box(d.a0, d.a1, 0, 0.04, g + 7.05, g + 7.3, STONE, true);
      for (const c of cs) { win(w, c - 0.42, c + 0.42, g + 5.15, g + 7.05, d.brick, { sill: false }); wbox(w, c, g + 4.98); }
      w.box(d.a0 + 0.3, d.a1 - 0.3, 0, 0.06, g + 7.6, g + 7.75, d.brick, true); w.box(d.a0 + 0.3, d.a1 - 0.3, 0, 0.06, g + 8.45, g + 8.6, d.brick, true);   // a sunk panel framed by projecting brick
      for (const x of [d.a0 + 0.3, d.a1 - 0.45]) w.box(x, x + 0.15, 0, 0.06, g + 7.75, g + 8.45, d.brick);
      cornice(w, d.a0, d.a1, g + 8.9, g + 9.6, WHT, { pan: 0.55, out: 0.2 }); cornice(w, d.a0, d.a1, g + 9.6, d.top, WHT, { brk: 0.8, bw: 0.11, con: true, out: 0.55 });
    }
    { const s0 = BL[2].a0 + 0.1, s1 = BL[3].a0 + 4.6, w = front(BL[2]), y = BL[2].gl + 3.25;
      w.box(s0, s1, 0, 1.55, y, y + 0.14, CANOPY, true); w.box(s0, s1, 1.47, 1.58, y - 0.28, y + 0.22, CANOPY, true); }
    // 5: blue-grey cornice with brackets and a slate gablet, four attic lights, windows rect-arch-arch-rect; the Grill's sign; its west return
    { const d = BL[4], w = front(d), g = d.gl, L = d.a1 - d.a0, cs = [0.14, 0.38, 0.62, 0.86].map((t) => d.a0 + L * t), sm = d.a0 + L / 2;
      const holes = [[d.a0 + 0.35, d.a1 - 0.35, g - 1, g + 2.95], ...cs.map((c, k) => [c - 0.43, c + 0.43, g + 5.05, k % 3 ? g + 7.2 : g + 6.95]), ...[0, 1, 2, 3].map((k) => { const c = d.a0 + L * (k + 0.5) / 4; return [c - 0.26, c + 0.26, g + 8.3, g + 8.8]; })];
      brickWall(d, w, holes); parapetBack(d, w);
      shop(w, d.a0 + 0.35, d.a1 - 0.35, g, { top: 2.95, frame: C(0x34302c), doors: [d.a1 - 1.45] });
      w.box(d.a0 + 1.6, d.a1 - 1.6, 0.04, 0.1, g + 3.25, g + 4.05, WH, true); sign(w, 'grill', d.a0 + 1.65, d.a1 - 1.65, g + 3.28, g + 4.02, 0.105);
      w.box(d.a0, d.a1, 0, 0.1, g + 4.2, g + 4.4, C(0x5d4a3a), true);
      cs.forEach((c, k) => (k % 3 ? archWin(w, c - 0.43, c + 0.43, g + 5.05, g + 6.77, d.brick, d.tint, d.brick.clone().multiplyScalar(0.75)) : win(w, c - 0.43, c + 0.43, g + 5.05, g + 6.95, d.brick, { lin: 0.1 })));
      for (let k = 0; k < 4; k++) { const c = d.a0 + L * (k + 0.5) / 4; win(w, c - 0.26, c + 0.26, g + 8.3, g + 8.8, d.brick, { region: 'PANE', sill: false }); }
      const y1 = d.top; cornice(w, d.a0, d.a1, g + 9.05, y1, BLUEGREY, { brk: 0.5, out: 0.34 });
      const w2 = K.Wall(true, frontB(d.a0 + 0.1) - 0.2, -1), hw = 1.25, ya = y1 - 0.05, yp = y1 + 1.45, SL8 = C(0x3d3c42);   // the gablet: slate face, light rakes
      K.skin(w2, [[sm - hw, ya], [sm + hw, ya], [sm, yp]], SL8, ya, 'plain');
      K.poly(hb, [w2.pt(sm - hw, -0.4, ya), w2.pt(sm + hw, -0.4, ya), w2.pt(sm, -0.4, yp)], neg(w2.n), SL8);
      for (const sg of [-1, 1]) { const e0 = [sm + sg * (hw + 0.12), ya - 0.05], e1 = [sm, yp + 0.17], k = (yp - ya) / hw, nn = w2.t.map((v, i) => sg * v * k / Math.hypot(1, k) + (i === 1 ? 1 / Math.hypot(1, k) : 0));
        K.poly(hb, [w2.pt(e0[0], 0.04, e0[1]), w2.pt(e1[0], 0.04, e1[1]), w2.pt(e1[0], 0.04, e1[1] - 0.2), w2.pt(e0[0] - sg * 0.05, 0.04, e0[1] - 0.2)], w2.n, BLUEGREY);
        K.poly(hb, [w2.pt(e0[0], 0.04, e0[1]), w2.pt(e1[0], 0.04, e1[1]), w2.pt(e1[0], -0.45, e1[1]), w2.pt(e0[0], -0.45, e0[1])], nn, BLUEGREY.clone().multiplyScalar(1.1)); }
    }
    // 6: narrow, lower blue-grey cornice, two round-headed windows (an air-conditioner in one), Bloomfield Arms & Ammo
    { const d = BL[5], w = front(d), g = d.gl, L = d.a1 - d.a0, cs = [0.3, 0.72].map((t) => d.a0 + L * t);
      brickWall(d, w, [[d.a0 + 0.3, d.a1 - 0.3, g - 1, g + 2.9], ...cs.map((c) => [c - 0.43, c + 0.43, g + 5.05, g + 7.33])]); parapetBack(d, w);
      shop(w, d.a0 + 0.3, d.a1 - 0.3, g, { top: 2.9, frame: C(0x2b2a29), doors: [d.a0 + 0.5] });
      w.box(d.a0 + 0.5, d.a1 - 0.5, 0.03, 0.09, g + 3.1, g + 4.15, WH, true); sign(w, 'arms', d.a0 + 0.55, d.a1 - 0.55, g + 3.13, g + 4.12, 0.095);
      for (const c of cs) archWin(w, c - 0.43, c + 0.43, g + 5.05, g + 6.9, d.brick, d.tint, d.brick.clone().multiplyScalar(0.75));
      w.box(cs[1] - 0.33, cs[1] + 0.33, -0.1, 0.25, g + 5.05, g + 5.45, C(0xc9c9c4), true);
      cornice(w, d.a0, d.a1, g + 9.0, d.top, BLUEGREY.clone().multiplyScalar(1.12), { pan: 0.3, out: 0.28 });
    }
    // 7: dark red brick, seven round-headed windows (3 + 1 + 3), a painted sign band under a corbel table, maroon dome awning
    { const d = BL[6], w = front(d), g = d.gl, L = d.a1 - d.a0, m = d.a0 + L / 2, cs = [-4.4, -3.15, -1.9, 0, 1.9, 3.15, 4.4].map((x) => m + x);
      brickWall(d, w, [[d.a0 + 0.4, d.a1 - 0.4, g - 1, g + 2.95], ...cs.map((c) => [c - 0.47, c + 0.47, g + 4.9, g + 7.8])]); parapetBack(d, w);
      shop(w, d.a0 + 0.4, d.a1 - 0.4, g, { top: 2.95, frame: C(0x2e2a27), doors: [m - 0.47, d.a1 - 1.9] });
      awning(w, d.a0 + 0.3, d.a1 - 0.3, g + 3.0, g + 4.05, 1.3, C(0x6a1c34), 'dome');
      w.box(d.a0, d.a1, 0, 0.07, g + 4.75, g + 4.9, STONE, true);
      for (const c of cs) archWin(w, c - 0.47, c + 0.47, g + 4.9, g + 7.33, d.brick, d.tint, d.brick.clone().multiplyScalar(0.8));
      w.box(d.a0, d.a1, 0, 0.1, g + 8.12, g + 8.32, d.brick, true);
      quad(w, d.a0 + 0.5, d.a1 - 0.5, g + 8.42, g + 9.18, 0.025, w.n, d.brick.clone().multiplyScalar(1.1));   // faded painted band
      const n = Math.round(L / 0.45); for (let k = 0; k < n; k++) { const s = d.a0 + (k + 0.5) * L / n; w.box(s - 0.11, s + 0.11, 0, 0.12, g + 9.3, g + 9.55, d.brick, true); }
      w.box(d.a0, d.a1, 0, 0.18, g + 9.55, g + 9.8, d.brick, true); w.box(d.a0, d.a1, -0.3, 0.06, d.top - 0.1, d.top, COPE, true);
      for (const x of [d.a0, d.a1 - 0.45]) w.box(x, x + 0.45, 0, 0.1, g + 4.4, d.top, d.brick);
    }
    // 8 China House: red-painted ground floor with yellow lining, navy belt, green sign; painted upper floor with two boarded openings and a
    // stone plaque; ochre cornice with dentils and a raised corner block. The only front on OSM's forward line: its west return and its
    // Washington Ave side match the front (no photo shows them)
    const RED = C(0x7c2226), NAVY = C(0x1f2946), YEL = C(0xc39a45), BLUE = C(0x2c4c96), BOARD = C(0xe5e3dc);
    { const d = BL[7], w = front(d), g = d.gl, L = d.a1 - d.a0, s = (x) => d.a0 + x * L / 17, yc = d.top - 0.95, yu = [g + 5.2, g + 7.9];
      const ups = [[1.1, 3.6], [8.3, 11.0]], holes = [[s(1.0), s(5.6), g + 0.45, g + 2.9], [s(6.5), s(11.2), g + 0.45, g + 2.9], [s(13.0), s(14.2), g - 1, g + 2.4], ...ups.map(([p, q]) => [s(p), s(q), ...yu])];
      K.wall(w, d.a0, d.a1, g - 0.4, g + 4.45, holes.slice(0, 3), RED, 0, 'plain'); K.wall(w, d.a0, d.a1, g + 4.45, d.top, holes.slice(3), d.tint, 0, 'brick'); parapetBack(d, w);
      for (const [p, q] of [[1.0, 5.6], [6.5, 11.2]]) shop(w, s(p), s(q), g, { bulk: 0.45, top: 2.9, frame: BLUE, bulkCol: RED, bay: 2.3 });
      lining(w, s(13.0), s(14.2), g, g + 2.4, 0.5, RED); quad(w, s(13.0), s(14.2), g, g + 2.4, -0.45, w.n, C(0x8f9aa6), reg('PANE')); w.box(s(13.05), s(14.15), -0.47, -0.4, g + 2.05, g + 2.12, BLUE);
      const belt = (v, s0, s1) => { v.box(s0, s1, 0, 0.1, g + 4.45, g + 4.8, NAVY, true); v.box(s0, s1 + 0.01, 0.02, 0.11, g + 4.33, g + 4.41, YEL, true); };
      belt(w, d.a0, d.a1 + 0.1);
      for (const x of [d.a0 + 0.05, d.a1 - 0.12]) w.box(x, x + 0.07, 0.005, 0.02, g, g + 4.33, YEL);
      w.box(s(6.4), s(11.3), 0.03, 0.1, g + 3.05, g + 4.0, C(0x1d6a4c), true); sign(w, 'china', s(6.45), s(11.25), g + 3.08, g + 3.97, 0.105);
      const boarded = (v, p, q) => { lining(v, p, q, ...yu, 0.12, d.brick); quad(v, p, q, ...yu, -0.08, v.n, BOARD); v.box(p - 0.1, q + 0.1, 0, 0.09, yu[0] - 0.1, yu[0], STONE, true); };
      for (const [p, q] of ups) boarded(w, s(p), s(q));
      w.box(s(5.4), s(6.5), 0, 0.06, g + 6.5, g + 7.5, STONE, true); w.box(s(5.55), s(6.35), 0.06, 0.08, g + 6.65, g + 7.35, C(0xc4b89c));
      cornice(w, d.a0, d.a1 + 0.32, yc, d.top, OCHRE, { dent: true, out: 0.32 });
      w.box(d.a1 - 2.0, d.a1 + 0.2, -0.3, 0.2, d.top, d.top + 0.6, d.brick, true); w.box(d.a1 - 2.05, d.a1 + 0.26, -0.3, 0.26, d.top + 0.6, d.top + 0.72, OCHRE, true);
      { const r = K.Seg(A8, bW, A8, bE), lo = K.G(A8 - 0.4, bE - 0.4) - 0.3;   // west return, beside the seventh front
        K.wall(r, 0, r.L, lo, g + 4.45, [], RED, 0, 'plain'); K.wall(r, 0, r.L, g + 4.45, d.top, [], d.tint, 0, 'brick'); quad(r, 0, r.L, d.roof, d.top, -0.3, neg(r.n), d.brick.clone().multiplyScalar(0.8));
        belt(r, 0, r.L + 0.1); cornice(r, 0, r.L + 0.32, yc, d.top, OCHRE, { dent: true, out: 0.32 }); }
      if (eastSeg) {   // Washington Ave side
        const [p, q] = eastSeg, e = K.Seg(p[0], p[1], q[0], q[1]), ge = (t) => K.G(p[0] + 1, p[1] + (q[1] - p[1]) * t), lo = Math.min(ge(0), ge(0.5), ge(1)) - 0.3;
        const ups2 = [], n = Math.floor(e.L / 3.4); for (let k = 0; k < n; k++) { const c = e.L * (k + 0.5) / n; ups2.push([c - 0.48, c + 0.48]); }
        const gh = [[2.0, 4.6, g + 0.6, g + 2.9], [6.0, 7.0, lo + 0.3, g + 2.35]], top = d.top, roof = hAt(aMax - 1, e.L / 2);
        K.wall(e, 0, e.L, lo, g + 4.45, gh, RED, 0, 'plain');
        K.wall(e, 0, e.L, g + 4.45, top, ups2.map(([a, b]) => [a, b, ...yu]), d.tint, 0, 'brick');
        quad(e, 0, e.L, roof, top, -0.3, neg(e.n), d.brick.clone().multiplyScalar(0.8));
        shop(e, 2.0, 4.6, g + 0.6, { bulk: 0.1, top: 2.3, frame: BLUE }); lining(e, 6.0, 7.0, lo + 0.3, g + 2.35, 0.15, RED); quad(e, 6.0, 7.0, lo + 0.3, g + 2.35, -0.12, e.n, WH, reg('DOOR'));
        belt(e, 0, e.L);
        ups2.forEach(([a, b], k) => (k < 2 ? boarded(e, a, b) : win(e, a, b, ...yu, d.brick, { lin: 0.08 })));
        cornice(e, 0, e.L, yc, top, OCHRE, { dent: true, out: 0.32 });
        e.box(0.3, 2.0, -0.3, 0.2, top, top + 0.6, d.brick, true); e.box(0.3, 2.05, -0.3, 0.26, top + 0.6, top + 0.72, OCHRE, true);
      }
    }

    // 0: the narrow corner unit west of the Town Hall (in no footprint, so this adds its solids, minimap and keep-out): white-painted
    // ground floor with a green sign (not legible in the photo), red brick upstairs under a corbel table and a white coping, as the 2010
    // front photo shows its east bay; its Franklin St side and rear made to match
    // ponytail: unit 0 is solid and on the minimap, but W.maskAt / inBuilding still read grass there (the kit cannot mark the mask) and
    // its depth copies the Town Hall's (its rear wall runs on in the Town Hall's plane); add a kit mask hook if streets or challenges ever
    // place things on that strip. Its west wall stands 0.5 m in from the catalogue's x -45, clear of the Franklin St pole and sign post
    const U0 = [-6.5, 0, bW, Math.max(...R0.filter((p) => p[0] < 0.5).map((p) => p[1]))];
    { const [a0, a1, b0, b1] = U0, g = BL[0].gl, top = g + 8.8, roof = top - 0.75, tn = BL[0].tint, bc = BL[0].brick, PAINT = C(0xe6e4dc), lin = bc.clone().multiplyScalar(0.8);
      const ring = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]], base = Math.min(...ring.map((p) => K.G(p[0], p[1]))) - 0.3, door = (s0, a, b) => { const y = K.G(a, b) + 0.05; return [s0, s0 + 0.95, y, y + 2.15]; };
      K.flat(ring, roof, { parapet: 0, col: ROOF }); K.foot(ring); K.keep(a0 - 0.5, a1, b0 - 0.3, b1 + 0.5);
      K.wallSeg(a0, b0, a1, b0); K.wallSeg(a0, b1, a0, b0); K.wallSeg(a1, b1, a0, b1);
      const w = K.Wall(true, b0, -1), gw = [[a0 + 0.7, a0 + 2.0], [a1 - 2.0, a1 - 0.7]], dr = [(a0 + a1) / 2 - 0.5, (a0 + a1) / 2 + 0.5], ups = [[a0 + 1.0, a0 + 2.4], [a1 - 2.4, a1 - 1.0]];
      K.wall(w, a0, a1, base, g + 4.5, [...gw.map(([p, q]) => [p, q, g + 0.8, g + 3.0]), [dr[0], dr[1], g - 1, g + 2.45]], PAINT, 0, 'plain');
      for (const [p, q] of gw) win(w, p, q, g + 0.8, g + 3.0, PAINT.clone().multiplyScalar(0.92), { col: C(0xf3eee0) });   // drawn curtains
      win(w, dr[0], dr[1], g, g + 2.45, PAINT.clone().multiplyScalar(0.92), { region: 'DOOR', sill: false });
      w.box(a0 + 0.5, (a0 + a1) / 2 - 0.3, 0.02, 0.09, g + 3.25, g + 3.85, C(0x1f5a44), true); w.box(a0, a1, 0, 0.12, g + 4.2, g + 4.5, PAINT, true);
      K.wall(w, a0, a1, g + 4.5, top, ups.map(([p, q]) => [p, q, g + 4.65, g + 6.7]), tn, 0, 'brick');
      for (const [p, q] of ups) win(w, p, q, g + 4.65, g + 6.7, bc, { lin: 0.12 });
      const n = Math.round((a1 - a0) / 0.45); for (let k = 0; k < n; k++) { const s = a0 + (k + 0.5) * (a1 - a0) / n; w.box(s - 0.1, s + 0.1, 0, 0.12, g + 7.6, g + 7.95, bc, true); }
      w.box(a0, a1, 0, 0.16, g + 7.95, g + 8.1, bc, true); w.box(a0, a1, -0.3, 0.08, top, top + 0.14, WHT, true); quad(w, a0, a1, roof, top, -0.3, neg(w.n), lin);
      const side = K.Seg(a0, b1, a0, b0), L = side.L, sh = [];   // Franklin St side (walking south) and rear
      for (let k = 0; k < 6; k++) { const c = L * (k + 0.5) / 6; sh.push([c - 0.45, c + 0.45, g + 5.0, g + 6.7]); }
      sh.push([L - 4.0, L - 2.9, g + 0.9, g + 2.6], [L - 8.0, L - 6.9, g + 0.9, g + 2.6], door(7.0, a0 + 0.5, b1 - 7.5));
      plainWall(side, 0, L, base, top, roof, tn, sh);
      sh.forEach((h, k) => win(side, h[0], h[1], h[2], h[3], bc, k === sh.length - 1 ? { region: 'DOOR', sill: false } : { lin: 0.05, linCol: lin }));
      const rear = K.Seg(a1, b1, a0, b1), rh = [[1.2, 2.2, g + 5.0, g + 6.7], [4.8, 5.8, g + 5.0, g + 6.7], door(2.9, (a0 + a1) / 2, b1 + 0.6)];
      plainWall(rear, 0, rear.L, base, top, roof, tn, rh);
      rh.forEach((h, k) => win(rear, h[0], h[1], h[2], h[3], bc, k === 2 ? { region: 'DOOR', sill: false } : { lin: 0.05, linCol: lin }));
    }

    // ---------- 607: two storeys of red brick; the 1921-40 Sanborn's seven fronts (hotel lobby at 26 W. Main, office, store, restaurant,
    // three stores to the Franklin St corner) under the hotel's rooms, two windows per front; corbelled band, coped parapet raised over the
    // front and returned 3 m along both sides (the 2011 photo shows the step on the west side) ----------
    { const f7 = K.fp(607), r7 = f7.pts, frontE = r7.map((p, i) => [p, r7[(i + 1) % r7.length]]);
      const fe = frontE.reduce((m, e) => (e[0][1] + e[1][1] < m[0][1] + m[1][1] ? e : m)), gF = K.G((fe[0][0] + fe[1][0]) / 2, (fe[0][1] + fe[1][1]) / 2 - 1.2);
      const top = f7.rec.floorY + 7.5, low = top - 0.5, roof = top - 0.95, tn = tint(1.16, 0.93, 0.88), bc = mulc(BRK, tn), bd = bc.clone().multiplyScalar(0.8);
      K.flat(r7, roof, { parapet: 0, col: ROOF });
      for (const [p, q] of frontE) {
        const w = K.Seg(p[0], p[1], q[0], q[1]), L = w.L;
        const out = [(q[1] - p[1]) / L, -(q[0] - p[0]) / L], gl = (t) => K.G(p[0] + (q[0] - p[0]) * t + out[0] * 1.2, p[1] + (q[1] - p[1]) * t + out[1] * 1.2);
        const base = Math.min(gl(0), gl(0.5), gl(1)) - 0.3, isFront = out[1] < -0.7, isRear = out[1] > 0.7, side = Math.abs(out[0]) > 0.7 ? Math.sign(out[0]) : 0;   // side +1 Franklin St, -1 west
        const ups = [], stores = [], lows = [], doors = [];
        if (isFront) { const U = [5.7, 5.2, 5.7, 6.2, 5.2, 5.2, 7.6], pw = 0.6, k = (L - pw * 8) / 40.8; let a = pw;
          U.forEach((u, i) => { const bw = u * k, m = a + bw / 2; ups.push(a + bw * 0.27, a + bw * 0.73);
            if (i) stores.push([a, a + bw]); else { lows.push([a + 0.5, a + 1.6], [a + bw - 1.6, a + bw - 0.5]); doors.push(m - 0.6); }
            a += bw + pw; }); }
        else { const n = side ? 6 : isRear ? 10 : 0; for (let i = 0; i < n; i++) ups.push(L * (i + 0.5) / n); }
        if (side > 0) { stores.push([0.7, 5.6]); doors.push(L - 3.2); }
        if (side < 0) lows.push([L - 3.2, L - 2.2], [L - 9.2, L - 8.2]);
        const gs = (s) => gl(s / L), holes = [...ups.map((c) => [c - 0.45, c + 0.45, gF + 5.0, gF + 6.8]), ...stores.map(([a, b]) => [a, b, base, gs((a + b) / 2) + 2.85]),
          ...lows.map(([a, b]) => [a, b, gs((a + b) / 2) + 0.95, gs((a + b) / 2) + 2.55]), ...doors.map((a) => [a, a + (isFront ? 1.2 : 1), base, gs(a) + 2.3])];
        const yt = isFront ? top : low, ret = side > 0 ? [0, 3] : [L - 3, L];   // the raised return at the front end of a side wall
        K.wall(w, 0, L, base, yt, holes, tn, 0, 'brick');
        w.box(0, L, -0.3, 0.06, yt, yt + 0.1, COPE, true); quad(w, 0, L, roof, yt, -0.3, neg(w.n), bd);
        if (side) { K.wall(w, ret[0], ret[1], low, top, [], tn, 0, 'brick'); w.box(ret[0], ret[1], -0.3, 0.06, top, top + 0.1, COPE, true); quad(w, ret[0], ret[1], low, top, -0.3, neg(w.n), bd);
          const s = side > 0 ? ret[1] : ret[0], tt = side > 0 ? w.t : neg(w.t); K.poly(hb, [w.pt(s, -0.3, low + 0.1), w.pt(s, 0.06, low + 0.1), w.pt(s, 0.06, top + 0.1), w.pt(s, -0.3, top + 0.1)], tt, bd); }
        for (const c of ups) { win(w, c - 0.45, c + 0.45, gF + 5.0, gF + 6.8, bc, {}); w.box(c - 0.5, c + 0.5, 0, 0.025, gF + 6.8, gF + 7.02, bd, true); }
        for (const [a, b] of lows) win(w, a, b, gs((a + b) / 2) + 0.95, gs((a + b) / 2) + 2.55, bc, { lin: 0.05, linCol: bd });
        for (const a of doors) win(w, a, a + (isFront ? 1.2 : 1), gs(a), gs(a) + 2.3, bc, { region: 'DOOR', sill: false, lin: isFront ? 0.15 : 0, linCol: STONE });
        if (isFront) { w.box(0, L, 0, 0.12, gF + 7.55, gF + 7.7, bc, true); const n = Math.round(L / 0.36); for (let k = 0; k < n; k++) { const s = (k + 0.5) * L / n; w.box(s - 0.09, s + 0.09, 0, 0.1, gF + 7.35, gF + 7.55, bc, true); } }
        for (const [a, b] of stores) { const g = gs((a + b) / 2);
          shop(w, a, b, g, { top: 2.85, frame: C(0x34312d), doors: [b - a > 6 ? a + (b - a) / 2 - 0.47 : b - 1.4], bay: 1.9 });
          w.box(a - 0.1, b + 0.1, 0, 0.1, g + 2.95, g + 3.75, C(0x3d3a35), true); }
        if (isFront || side > 0) w.box(0, L, 0, 0.07, gF + 3.9, gF + 4.05, STONE, true);
        if (isFront) { const a = doors[0] + 0.6; w.box(a - 2.4, a + 2.4, 0.04, 0.1, gF + 2.85, gF + 3.55, C(0x2c2a27), true); sign(w, 'chapel', a - 2.3, a + 2.3, gF + 2.9, gF + 3.5, 0.11); }
      }
    }

    // ---------- the pavement in front (the terrain's pavement map has grass here): concrete slabs from the kerb to the fronts ----------
    const Wd = B.game && B.game.world, CONC = C(0xb4aea3);
    // kerb of the street in front, as a line in the frame fitted at two points well away from the corners: [a, b] pairs
    const kerbLine = (a0, a1, bf) => [a0, a1].map((a) => { const p = K.P(a, bf - 1.5, 0), r = Wd && Wd.nearestRoad(p[0], p[2], 30); if (!r) return [a, bf - 3]; const c = K.toLocal(r.x, r.z); return [c[0], c[1] + r.hw]; });
    const kerbAt = (kl, a) => kl[0][1] + (kl[1][1] - kl[0][1]) * (a - kl[0][0]) / (kl[1][0] - kl[0][0]);
    function pavement(p, q, kl) {
      const n = Math.max(1, Math.ceil((q[0] - p[0]) / 1.6)), row = [];
      for (let k = 0; k <= n; k++) { const t = k / n, a = p[0] + (q[0] - p[0]) * t, bf = p[1] + (q[1] - p[1]) * t; row.push([a, Math.min(kerbAt(kl, a), bf - 0.5), bf]); }
      for (let k = 0; k < n; k++) { const r0 = row[k], r1 = row[k + 1], pts = [[r0[0], r0[1]], [r1[0], r1[1]], [r1[0], r1[2]], [r0[0], r0[2]]];
        K.poly(hb, pts.map((v) => K.P(v[0], v[1], K.G(v[0], v[1]) + 0.06)), up, CONC.clone().multiplyScalar(k & 1 ? 0.95 : 1)); }
    }
    const kl3 = kerbLine(10, 60, bW);
    pavement([U0[0], bW], [A8, bW], kl3); pavement([A8, bE], [aMax, bE], kl3);
    { const [a0, , b0, b1] = U0, n = Math.ceil((b1 - b0) / 1.6), edge = (b) => { const p = K.P(a0 - 1, b, 0), r = Wd && Wd.nearestRoad(p[0], p[2], 20);   // Franklin St sidewalk beside unit 0
        return r && /Franklin/.test(r.name) ? Math.max(a0 - 3, Math.min(a0 - 0.3, K.toLocal(r.x, r.z)[0] + r.hw)) : a0 - 1.5; };
      for (let k = 0; k < n; k++) { const p = b0 + (b1 - b0) * k / n, q = b0 + (b1 - b0) * (k + 1) / n, pts = [[edge(p), p], [a0, p], [a0, q], [edge(q), q]];
        K.poly(hb, pts.map((v) => K.P(v[0], v[1], K.G(v[0], v[1]) + 0.15)), up, CONC.clone().multiplyScalar(k & 1 ? 0.95 : 1)); } }   // kerb height: the road mesh runs a little past hw
    { const f7 = K.fp(607).pts, fr7 = f7.map((p, i) => [p, f7[(i + 1) % f7.length]]).reduce((m, e) => (e[0][1] + e[1][1] < m[0][1] + m[1][1] ? e : m)), [p, q] = fr7[0][0] < fr7[1][0] ? fr7 : [fr7[1], fr7[0]];
      pavement(p, q, kerbLine(p[0] + 8, q[0] - 8, (p[1] + q[1]) / 2)); }
    // the Town Hall's flagpole at the kerb, flag flying east (static)
    { const a = BL[0].a0 + 3.9 * (BL[0].a1 - BL[0].a0) / 7.02, b = kerbAt(kl3, a) + 0.45, g = K.G(a, b), H = 7.3, ft = g + H - 0.2;
      K.box(a - 0.05, a + 0.05, b - 0.05, b + 0.05, g, g + H, C(0xe6e6e2)); K.box(a - 0.08, a + 0.08, b - 0.08, b + 0.08, g + H, g + H + 0.16, C(0xc9b26a));
      const [x, y, sw, sh] = SL.flag, fl = [0, 1, 2, 3].map((i) => [a + 0.06 + 0.5 * i, b + [0, 0.13, -0.05, 0.1][i], x / 1024 + sw / 1024 * i / 3]), v0 = 1 - (y + sh) / 512, v1 = 1 - y / 512;
      for (let i = 0; i < 3; i++) { const P0 = fl[i], P1 = fl[i + 1], n = K.N(-(P1[1] - P0[1]), P1[0] - P0[0], 0), l = Math.hypot(n[0], n[2]), nn = [n[0] / l, 0, n[2] / l], pts = [K.P(P0[0], P0[1], ft - 0.95), K.P(P1[0], P1[1], ft - 0.95), K.P(P1[0], P1[1], ft), K.P(P0[0], P0[1], ft)], uv = [[P0[2], v0], [P1[2], v0], [P1[2], v1], [P0[2], v1]];
        K.poly(sb, pts, nn, WH, uv); K.poly(sb, pts, neg(nn), WH, uv); }
      K.circle(a, b, 0.12);
    }

    // ---------- lettering canvas: slots [x, y, w, h] on 1024 x 512 ----------
    const tex = U.canvasTex(1024, 512, (g) => {
      const SF = U.SIGN_FONT, TF = U.TEXT_FONT, txt = (s, x, y, size, font, col, maxW, sh) => { const st = font.match(/^((?:italic |bold )*)(.*)$/), f = (z) => (g.font = st[1] + z + 'px ' + st[2]);
        f(size); const m = g.measureText(s).width; if (m > maxW) f(Math.max(9, Math.floor(size * maxW / m)));   // one measure: font setting is the slow part
        g.textAlign = 'center'; g.textBaseline = 'middle'; if (sh) { g.fillStyle = sh; g.fillText(s, x + 3, y + 3); } g.fillStyle = col; g.fillText(s, x, y); };
      const box = (k, bg) => { const [x, y, w, h] = SL[k]; g.fillStyle = bg; g.fillRect(x, y, w, h); return [x + w / 2, y, w, h]; };
      { const [cx, y, w] = box('th', '#dcdbd5'); txt('Bloomfield', cx, y + 46, 78, 'italic bold Georgia, serif', '#c41f2b', w * 0.5, '#8f8f8f');
        txt('TOWN  HALL  &', cx, y + 112, 66, 'bold Georgia, serif', '#c41f2b', w * 0.62, '#8f8f8f'); txt('POLICE  DEPARTMENT', cx, y + 176, 66, 'bold Georgia, serif', '#c41f2b', w * 0.94, '#8f8f8f'); }
      { const [cx, y, w, h] = box('china', '#1d6a4c'); g.strokeStyle = '#f2f2ea'; g.lineWidth = 4; g.strokeRect(SL.china[0] + 6, y + 6, w - 12, h - 12);
        txt('CHINA HOUSE', cx, y + 44, 60, SF, '#ffffff', w * 0.84); txt('CHINESE RESTAURANT', cx, y + 86, 30, TF, '#ffffff', w * 0.7); txt('EAT IN & TAKE OUT', cx, y + 108, 18, TF, '#ffffff', w * 0.5); }
      { const [cx, y, w] = box('arms', '#efeee8'); txt('BLOOMFIELD', cx, y + 45, 44, SF, '#1c1c1c', w * 0.88); txt('ARMS & AMMO', cx, y + 100, 44, SF, '#1c1c1c', w * 0.88); }
      { const [cx, y, w] = box('hunB', '#f4f4f0'); txt('Hunley', cx, y + 44, 40, 'bold Georgia, serif', '#1d2c5a', w * 0.86); txt('Real Estate, Inc.', cx, y + 84, 20, 'Georgia, serif', '#1d2c5a', w * 0.86); }
      { const [cx, y, w] = box('hunA', '#17614f'); txt('HUNLEY  REAL ESTATE', cx, y + 30, 40, TF, '#ffffff', w * 0.9); }
      { const [cx, y, w] = box('grill', '#f4f2ec'); txt('GRILL', cx, y + 28, 44, SF, '#c3262c', w * 0.6); txt('PIZZA  ·  STEAK  ·  SEAFOOD', cx, y + 60, 20, TF, '#222222', w * 0.86); }
      { const [cx, y, w] = box('chapel', '#2c2a27'); txt('THE CHAPEL', cx, y + 33, 44, 'Georgia, serif', '#efe6cf', w * 0.7); }
      { const [x, y, w, h] = SL.flag; for (let k = 0; k < 13; k++) { g.fillStyle = k & 1 ? '#f4f2ee' : '#b8222e'; g.fillRect(x, y + h * k / 13, w, h / 13 + 0.5); }
        g.fillStyle = '#2a3468'; g.fillRect(x, y, w * 0.4, h * 7 / 13); g.fillStyle = '#e8e8f0'; for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.fillRect(x + 3 + i * 7.2, y + 3 + j * 7.5 + (i & 1) * 3, 1.6, 1.6); }
    });
    const mesh = new T.Mesh(U.bufGeo(sb), new T.MeshLambertMaterial({ map: tex }));
    mesh.receiveShadow = true; mesh.name = 'heroes';
    if (B.game && B.game.scene) B.game.scene.add(mesh);
  }
})();
