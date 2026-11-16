/* Bloomfield Drift — hero plug-in: the Greene County Courthouse (map footprint 609) and the courthouse lawn.
   Built by hand from the owner's reference photos (never their pixels) on the lidar record of footprint 609:
   - the 1885-86 courthouse by George W. Bunting as it stands now: red brick on a rock-faced limestone basement, limestone belt courses
     and two black-brick bands, corner pavilions, tall round-arched courtroom windows with stone voussoirs and keystones, the north tower
     bay (stone stair with three rails, recessed entrance, triple window, Corinthian capitals) and the tower cut down to a limestone stump
     in 1954 (one clock, to Main Street; louvres east and west; antenna mast), the low hipped roof behind the parapet (lidar eave, deck
     and tower top);
   - the 2000s addition in the same footprint: four storeys of brick on a limestone base under a precast top band, windows in precast
     groups, glass stair towers at its north corners, the glass connector, the east entrance portico and its green canopy, the low service
     wing with its garage door, and the rooftop units the lidar sees;
   - the lawn, laid out from the 2008 NRHP site plan and nudged where needed to stay clear of world.js's Apple Festival (booths, hay,
     giant apple): concrete walks (entrance, front, the west and east diagonals), four WWII anti-aircraft guns (NW, SW and the two NE ones
     of the photos), the 1886 bell on its iron yoke and plinth, the granite veterans memorial in an iron fence with four flagpoles.
   Public surface: one BD.heroPlugins entry { id: 'courthouse', footprints: [609] }, loaded before heroes.js; all geometry goes through
   heroes.js's kit into its shared meshes. Solids: the footprint stays solid (buildings.js); this adds the stair, portico, guns, bell,
   memorial fence and flagpoles (all hard: radius >= 0.35). */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  B.heroPlugins = (B.heroPlugins || []).concat({ id: 'courthouse', name: 'Greene County Courthouse', footprints: [609], at: [0, 0], dir: [1, 0.007], build });

  function build(K) {
    // frame: a ~ map x (east), b ~ map y (north), turned 0.4 deg to the footprint; heights y(h) above the lidar floor (the north lawn)
    const f = K.fp(609), F = f.rec.floorY, C = K.C, y = (h) => F + h, lo = f.lo - 0.35, hb = K.hb;
    const ctr = (r) => [(r[0] + r[2] / 2) / 512, 1 - (r[1] + r[3] / 2) / 512], PANE = ctr(K.R.PANE), LIT = ctr(K.R.LIT);
    const add = (p, q, s = 1) => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s], sub = (p, q) => add(p, q, -1), mul = (p, s) => p.map((v) => v * s);
    const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]], unit = (p) => mul(p, 1 / Math.hypot(...p));
    const quad = (pts, col) => K.poly(hb, pts, unit(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]))), col);
    const face3 = (pts, col, hint) => { const n = unit(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]))); K.poly(hb, pts, n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0 ? mul(n, -1) : n, col); };   // planar polygon facing the hint's side
    const BRICK = new THREE.Color(1.15, 1.18, 1.18), BRICK2 = new THREE.Color(1.02, 0.95, 0.9), BRICKP = C(0x7c4034), ROCK = C(0xdcd9d1), LIMET = new THREE.Color(1.0, 1.0, 1.03), LIME = C(0xd6d2c8), LIME2 = C(0xe2dfd6), STONEP = C(0xc9c1ae);
    const DARK = C(0x2a2624), PRE = C(0xc9c2b2), JOINT = C(0x9d978a), MULL = C(0xaeb2b2), GLASS = new THREE.Color(1.5, 1.6, 1.75), FAN = new THREE.Color(1.6, 1.8, 2.1), ROOF = C(0x8f908c), ROOF2 = C(0x7d7e7b), METAL = C(0x8d9193);
    const STEP = C(0xc9c3b5), GREEN = C(0x3d6a54), CONC = C(0xbcb7ab), GUN = C(0xa3a9aa), GUN2 = C(0x80888a), IRON = C(0x1c1c1d), BRONZE = C(0x3b3a37), YOKE = C(0x5a3426), GRAN = C(0xb8b6b1), GRANB = C(0x232427), POLE = C(0xd3d6d9), GOLD = C(0xd3b24c);

    // ---------- small geometry helpers (world points) ----------
    function obox(c, u, v, w, col) {   // box from its centre and three half-axis vectors
      for (const [p, q, r] of [[u, v, w], [v, w, u], [w, u, v]]) for (const s of [1, -1]) { const m = add(c, p, s); K.poly(hb, [add(add(m, q, -1), r, -1), add(add(m, q, 1), r, -1), add(add(m, q, 1), r, 1), add(add(m, q, -1), r, 1)], mul(unit(p), s), col); }
    }
    const beam = (p, q, r, col) => { const ax = mul(sub(q, p), 0.5), n1 = unit(cross(ax, Math.abs(unit(ax)[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); obox(add(p, ax), ax, mul(n1, r), mul(unit(cross(ax, n1)), r), col); };
    function cyl(p0, p1, r0, r1, n, col) {   // n-sided tapered cylinder with end caps
      const ax = unit(sub(p1, p0)), t = unit(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), bt = cross(ax, t), rim = (p, r, k) => add(add(p, t, r * Math.cos(2 * Math.PI * k / n)), bt, r * Math.sin(2 * Math.PI * k / n));
      for (let k = 0; k < n; k++) { const m = 2 * Math.PI * (k + 0.5) / n; K.poly(hb, [rim(p0, r0, k), rim(p0, r0, k + 1), rim(p1, r1, k + 1), rim(p1, r1, k)], add(mul(t, Math.cos(m)), bt, Math.sin(m)), col); }
      K.poly(hb, [...Array(n).keys()].map((k) => rim(p1, r1, k)), ax, col); K.poly(hb, [...Array(n).keys()].map((k) => rim(p0, r0, k)), mul(ax, -1), col);
    }

    // ---------- facade kit: arched heads, openings, bands ----------
    const RING = 0.3, AN = 8;
    const sunk = (w, dd) => ({ pt: (s, d, h) => w.pt(s, d - dd, h), n: w.n, t: w.t, box: (s0, s1, d0, d1, ...r) => w.box(s0, s1, d0 - dd, d1 - dd, ...r) });   // the plane dd behind w
    function arch(w, c, r, ys, col, blind) {   // round head springing at ys: brick spandrels, stone voussoirs (+ soffit, keystone), fanlight with three bars or (blind) brick 15 cm back
      const R = r + RING, yt = ys + R + 0.05, pt = (rad, i) => [c - Math.cos(Math.PI * i / AN) * rad, ys + Math.sin(Math.PI * i / AN) * rad], half = [...Array(AN / 2 + 1).keys()];
      K.skin(w, [[c - R, yt], ...half.map((i) => pt(R, i)), [c, yt]], col, 0, 'brick');
      K.skin(w, [[c + R, yt], [c, yt], ...half.map((i) => pt(R, AN / 2 + i))], col, 0, 'brick');
      for (let i = 0; i < AN; i++) {
        const [s0, h0] = pt(r, i), [s1, h1] = pt(r, i + 1), [S0, H0] = pt(R, i), [S1, H1] = pt(R, i + 1), m = Math.PI * (i + 0.5) / AN, cm = Math.cos(m), sm = Math.sin(m);
        K.poly(hb, [w.pt(s0, 0.04, h0), w.pt(s1, 0.04, h1), w.pt(S1, 0.04, H1), w.pt(S0, 0.04, H0)], w.n, LIME);
        K.poly(hb, [w.pt(S0, 0, H0), w.pt(S1, 0, H1), w.pt(S1, 0.04, H1), w.pt(S0, 0.04, H0)], add(mul(w.t, -cm), [0, sm, 0]), LIME);
        K.poly(hb, [w.pt(s0, 0.04, h0), w.pt(s1, 0.04, h1), w.pt(s1, -0.15, h1), w.pt(s0, -0.15, h0)], add(mul(w.t, cm), [0, -sm, 0]), LIME2);
      }
      w.box(c - 0.16, c + 0.16, 0, 0.08, ys + r - 0.03, ys + R + 0.08, LIME, true);
      if (blind) return K.skin(sunk(w, 0.15), [[c, ys], ...[...Array(AN + 1).keys()].map((i) => pt(r, i))], col.clone().multiplyScalar(0.75), 0, 'brick');   // in the recess's shade
      K.poly(hb, [w.pt(c, -0.1, ys), ...[...Array(AN + 1).keys()].map((i) => { const [s, h] = pt(r, i); return w.pt(s, -0.1, h); })], w.n, FAN, Array(AN + 2).fill(PANE));
      for (const i of [AN / 4, AN / 2, AN * 3 / 4]) { const [s, h] = pt(r, i), m = Math.PI * i / AN, ds = Math.sin(m) * 0.025, dh = Math.cos(m) * 0.025;
        K.poly(hb, [w.pt(c - ds, -0.08, ys - dh), w.pt(c + ds, -0.08, ys + dh), w.pt(s + ds, -0.08, h + dh), w.pt(s - ds, -0.08, h - dh)], w.n, K.WHITE); }
    }
    const GLUV = [[197, 30], [251, 30], [251, 5], [197, 5]].map(([u, v]) => [u / 512, 1 - v / 512]);   // the sky half of the atlas's S1 upper pane (light, as in the photos), lit at dusk
    function curtain(w, s0, s1, ya, yb) {   // glass panes 6 cm behind a light grey grid: mullions ~1.3 m apart, transoms at the floors
      const n = Math.max(1, Math.round((s1 - s0) / 1.3)), hs = [ya, ...[0, 2.3, 3.2, 6.0, 7.1, 9.9, 11.0, 13.8].map(y).filter((h) => h > ya + 0.1 && h < yb - 0.1), yb];
      for (let i = 0; i <= n; i++) { const a = s0 + (s1 - s0) * i / n, b = s0 + (s1 - s0) * (i + 1) / n; w.box(a - 0.05, a + 0.05, -0.06, 0.04, ya, yb, MULL);
        if (i < n) for (let j = 0; j < hs.length - 1; j++) K.poly(hb, [w.pt(a, -0.06, hs[j]), w.pt(b, -0.06, hs[j]), w.pt(b, -0.06, hs[j + 1]), w.pt(a, -0.06, hs[j + 1])], w.n, GLASS, GLUV); }
      for (const h of hs.slice(1, -1)) w.box(s0, s1, -0.06, 0.04, h - 0.05, h + 0.05, MULL);
      w.box(s0, s1, -0.06, 0.06, ya, ya + 0.12, MULL); w.box(s0, s1, -0.06, 0.06, yb - 0.12, yb, MULL);
    }
    // a wall run between ya and yb with its openings [s, width, h0, h1, kind, split]: 'w' window with stone lintel and sill, 'f' window with
    // sill, 'a' arched window (h1 = springing), 'B' window under a blind arch, 'A' blind arch, 'W' window in a blind arch, 'b' basement window, 'd' glass door, 'p' window group in a precast surround, 'g' curtain wall,
    // 'r' roll-up door. Holes are cut wherever an opening crosses the run; an opening is built by the run its bottom falls in.
    function face(w, s0, s1, ya, yb, mat, col, ops = []) {
      const holes = [];
      for (const [c, wd, h0, h1, k] of ops) if (y(h1) > ya && y(h0) < yb) { holes.push([c - wd / 2, c + wd / 2, y(h0), y(h1)]); if ('aAWB'.includes(k)) holes.push([c - wd / 2 - RING, c + wd / 2 + RING, y(h1), y(h1) + wd / 2 + RING + 0.05]); }
      K.wall(w, s0, s1, ya, yb, holes, col, ya, mat);
      for (const [c, wd, h0, h1, k, split] of ops) {
        if (y(h0) < ya - 1e-6 || y(h0) >= yb) continue;
        const a = c - wd / 2, b = c + wd / 2, Y0 = y(h0), Y1 = y(h1);
        if (k === 'g') { curtain(w, a, b, Y0, Y1); continue; }
        if (k === 'A' || k === 'W') {   // blind arch: brick 15 cm back under the stone arch ('W': a window in it)
          const ws = sunk(w, 0.15), win = k === 'W' ? [[c - 0.36, c + 0.36, Y0 + 0.1, Y1 - 0.3]] : [];
          K.wall(ws, a, b, Y0, Y1, win, col.clone().multiplyScalar(0.75), 0, 'brick'); for (const h of win) K.opening(ws, ...h, 'S1', { casing: 0.06 });
          for (const [s, o] of [[a, 1], [b, -1]]) K.poly(hb, [w.pt(s, 0, Y0), w.pt(s, -0.15, Y0), w.pt(s, -0.15, Y1), w.pt(s, 0, Y1)], mul(w.t, o), C(0x4e2a22));
          arch(w, c, wd / 2, Y1, col, true); w.box(a - 0.1, b + 0.1, -0.15, 0.06, Y0 - 0.12, Y0, LIME, true); continue;
        }
        if (k === 'r') { const D = 0.16; K.poly(hb, [w.pt(a, -D, Y0), w.pt(b, -D, Y0), w.pt(b, -D, Y1), w.pt(a, -D, Y1)], w.n, C(0xe8e8e3));
          for (let i = 1; i < 7; i++) w.box(a, b, -D, -D + 0.02, Y0 + (Y1 - Y0) * i / 7 - 0.02, Y0 + (Y1 - Y0) * i / 7 + 0.02, C(0xb4b4ae));
          for (const [s, o] of [[a, 1], [b, -1]]) K.poly(hb, [w.pt(s, 0, Y0), w.pt(s, -D, Y0), w.pt(s, -D, Y1), w.pt(s, 0, Y1)], mul(w.t, o), PRE);
          K.poly(hb, [w.pt(a, 0, Y1), w.pt(b, 0, Y1), w.pt(b, -D, Y1), w.pt(a, -D, Y1)], [0, -1, 0], PRE); continue; }
        K.opening(w, a, b, Y0, Y1, k === 'd' ? 'PANE' : 'S1', { split: split || 1, door: k === 'd', casing: k === 'p' ? 0.08 : 0.06 });
        if (k === 'a' || k === 'B') arch(w, c, wd / 2, Y1, col, k === 'B');
        if (k === 'w') w.box(a - 0.16, b + 0.16, 0, 0.07, Y1, Y1 + 0.34, LIME, true);
        if (k === 'p') { w.box(a - 0.2, b + 0.2, 0, 0.06, Y1, Y1 + 0.3, PRE, true); for (const s of [a - 0.2, b]) w.box(s, s + 0.2, 0, 0.05, Y0, Y1, PRE); }
        if (k !== 'd') w.box(a - 0.14, b + 0.14, 0, 0.09, Y0 - 0.15, Y0, k === 'p' ? PRE : LIME, true);
      }
    }
    const band = (w, s0, s1, h0, h1, out, col) => w.box(s0 - out, s1 + out, 0, out, y(h0), y(h1), col, true);
    const BANDS = [[2.5, 2.82, 0.1, LIME], [3.45, 3.62, 0.02, DARK], [7.12, 7.29, 0.02, DARK], [7.75, 8.12, 0.07, LIME], [8.45, 8.63, 0.11, LIME], [13.85, 14.1, 0.08, LIME], [15.55, 15.8, 0.08, LIME]];

    // ponytail: the lettering is this file's own canvas texture and mesh (+1 draw call); move it into the kit's atlas if more heroes need carved text
    function dateText(pos, n) {   // the date stone's carved lettering, from the photo: one canvas texture on one quad (1 draw call)
      const sc = B.game && B.game.scene, U = B.util; if (!sc || !U) return;
      const tex = U.canvasTex(512, 384, (g, w) => {
        g.fillStyle = '#d6cfbf'; g.fillRect(0, 0, w, 384); g.strokeStyle = '#a9a294'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, 364);
        const line = (t, x, yy, px, al = 'center') => { g.textAlign = al; g.font = 'bold ' + px + 'px Georgia, serif'; g.fillStyle = '#f1ece2'; g.fillText(t, x + 1.5, yy + 1.5); g.fillStyle = '#857e70'; g.fillText(t, x, yy); };
        line('1885', w / 2, 82, 76); line('MOSES CROCKETT', 36, 140, 30, 'left'); line('JOHN MILLER Jr.', 36, 174, 30, 'left'); line('ROBERT T. McKEE.', 36, 208, 30, 'left'); line('Com\u2019s.', 430, 174, 26);
        line('GEO. W. BUNTING.', w / 2, 256, 30); line('ARCHITECT.', w / 2, 282, 18); line('McKAY & BUSHMAN.', w / 2, 326, 30); line('CONTRACTORS.', w / 2, 352, 18);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.78), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(...pos); m.lookAt(pos[0] + n[0], pos[1] + n[1], pos[2] + n[2]); m.receiveShadow = true; m.name = 'courthouse date stone'; sc.add(m);
    }

    // ---------- the 1885-86 block: frame values from the footprint (pavilions project 1.5 m on the long sides) ----------
    const AWn = -11.47, AWs = -11.45, AEn = 12.33, AEs = 12.06, RW = -9.95, RE = 10.55, BN = 30.27, BS = -3.9, PN = 21.05, PS = 5.65;
    const TW = -3.23, TE = 3.92, TN = 32.75, TS = 25.2, ac = (TW + TE) / 2, WT = 2.62, TOP = 16.75, TT = 24.0;
    function run(w, s0, s1, bas, up, list = BANDS) {   // basement in rock-faced stone, brick to the parapet, bands, coping
      face(w, s0, s1, lo, y(WT), 'stone', ROCK, bas); face(w, s0, s1, y(WT), y(TOP), 'brick', BRICK, up);
      for (const [h0, h1, out, col] of list) band(w, s0, s1, h0, h1, out, col);
      w.box(s0 - 0.13, s1 + 0.13, -0.32, 0.13, y(TOP), y(TOP + 0.2), LIME, true);
    }
    const dpipe = (a, b) => K.box(a - 0.07, a + 0.07, b - 0.07, b + 0.07, lo, y(16.6), METAL);
    const hood = (w, c) => { const hy = y(2.46), pd = [w.pt(c - 0.75, 0.5, hy), w.pt(c + 0.75, 0.5, hy), w.pt(c, 0.5, hy + 0.4)];   // gabled stone hood over a basement door or window
      w.box(c - 0.75, c + 0.75, 0, 0.5, hy - 0.18, hy, LIME, true); face3(pd, LIME2, w.n);
      for (const q of [pd[0], pd[1]]) face3([q, pd[2], add(pd[2], w.n, -0.5), add(q, w.n, -0.5)], LIME, [0, 1, 0]); };
    for (const sg of [-1, 1]) {   // north front either side of the tower bay: a wide bay (paired window, big arch) and a narrow one at the corner
      const w = K.Wall(true, BN, 1), big = ac + sg * 6.55, nar = ac + sg * 10.05, s0 = sg < 0 ? AWn : TE, s1 = sg < 0 ? TW : AEn;
      run(w, s0, s1, [[big - 0.58, 0.9, 0.6, 2.2, 'b', 2], [big + 0.58, 0.9, 0.6, 2.2, 'b', 2], sg < 0 ? [nar, 1.0, 0, 2.25, 'd'] : [nar, 0.9, 0.6, 2.2, 'b', 2]],
        [[big, 1.8, 3.7, 7.0, 'w', 2], [big, 2.2, 8.65, 11.95, 'a', 2], [nar, 0.95, 8.65, 11.95, 'B']]);   // corner bays: blank main floor, a blind arch over the courtroom window (photos)
      hood(w, nar);   // over the corner bay's basement door (west) or window (east)
      dpipe(ac + sg * 4.3, BN + 0.1);
    }
    for (const sg of [-1, 1]) {   // long sides: two pavilions (paired bay + arched bay) and the five-bay courtroom middle, recessed 1.5 m
      const R0 = sg < 0 ? RW : RE, wM = K.Wall(false, R0, sg);
      for (const [b0, b1, pc, ab, A] of [[PN, BN, 23.45, 27.1, sg < 0 ? AWn : AEn], [BS, PS, 3.25, -0.4, sg < 0 ? AWs : AEs]]) {
        const w = K.Wall(false, A, sg), date = sg > 0 && b0 === PN, se = sg > 0 && b0 === BS;   // the 1885 date stone sits on the NE pavilion's east face
        // arched bay (photos): blank brick on the main floor; a deep blind arch, with a window in it only on the SE face, whose basement window has a gabled hood
        run(w, b0, b1, [[pc - 0.6, 0.9, 0.6, 2.2, 'b', 2], [pc + 0.6, 0.9, 0.6, 2.2, 'b', 2], ...(date ? [] : [[ab, 0.95, 0.6, 2.2, 'b', 2]])],
          [[pc - 0.6, 0.85, 3.7, 7.0, 'w'], [pc + 0.6, 0.85, 3.7, 7.0, 'w'], [pc - 0.6, 0.85, 8.65, 12.6, 'f'], [pc + 0.6, 0.85, 8.65, 12.6, 'f'], [pc - 0.6, 0.72, 14.45, 15.35, 'f'],
            [pc + 0.6, 0.72, 14.45, 15.35, 'f'], [ab, 1.9, 8.65, 11.95, se ? 'W' : 'A']]);
        if (se) hood(w, ab);
        for (const s of [-1, 1]) w.box(pc + s * 1.14 - 0.11, pc + s * 1.14 + 0.11, 0, 0.09, y(8.5), y(12.75), LIME, true);   // stone frame round the paired windows
        w.box(pc - 0.17, pc + 0.17, 0, 0.06, y(8.6), y(12.75), LIME); w.box(pc - 1.38, pc + 1.38, 0, 0.16, y(12.75), y(13.15), LIME, true);
        if (date) {   // the 1885 date stone: sill, tablet, pediment between two fans, and its lettering
          w.box(ab - 0.75, ab + 0.75, 0, 0.2, y(3.55), y(3.7), LIME, true); w.box(ab - 0.62, ab + 0.62, 0, 0.12, y(3.7), y(5.0), LIME2, true);
          const pd = [w.pt(ab - 0.66, 0.14, y(5.0)), w.pt(ab + 0.66, 0.14, y(5.0)), w.pt(ab, 0.14, y(5.42))]; K.poly(hb, pd, w.n, LIME2);
          for (const [p, q] of [[pd[0], pd[2]], [pd[2], pd[1]]]) face3([p, q, add(q, w.n, -0.14), add(p, w.n, -0.14)], LIME, [0, 1, 0]);
          for (const s of [-1, 1]) w.box(ab + s * 0.66 - 0.13, ab + s * 0.66 + 0.13, 0, 0.18, y(4.92), y(5.3), LIME, true);
          dateText(w.pt(ab, 0.13, y(4.33)), w.n);
        }
        const ret = K.Wall(true, b0 === PN ? PN : PS, b0 === PN ? -1 : 1), e0 = Math.min(A, R0), e1 = Math.max(A, R0);
        run(ret, e0, e1); if (b0 === BS) run(K.Wall(true, BS, -1), e0, e1);   // pavilion return; the south face beside the connector
        dpipe(R0 + sg * 0.1, b0 === PN ? PN - 0.1 : PS + 0.1);
      }
      const bays = [0, 1, 2, 3, 4].map((k) => PS + 1.54 + 3.08 * k);
      run(wM, PS, PN, bays.map((c) => [c, 1.15, 0.6, 2.2, 'b', 2]), bays.flatMap((c) => [[c - 0.62, 0.8, 3.7, 7.0, 'w'], [c + 0.62, 0.8, 3.7, 7.0, 'w'], [c, 1.6, 8.65, 12.15, 'a', 2]]));
    }
    // roof: flat behind the parapet round the edge, a hipped roof with a flat deck over the middle (lidar: eave 16.5, deck 21, slopes ~0.6)
    K.flat([[AWs, BS], [AEs, BS], [AEs, PS], [RE, PS], [RE, PN], [AEn, PN], [AEn, BN], [AWn, BN], [AWn, PN], [RW, PN], [RW, PS], [AWs, PS]], y(16.3), { parapet: TOP - 16.3, col: ROOF2, wall: BRICKP, coping: LIME });
    { const E = [[RW + 0.3, BS + 0.3], [RE - 0.3, BS + 0.3], [RE - 0.3, BN - 0.3], [RW + 0.3, BN - 0.3]].map(([a, b]) => K.P(a, b, y(16.3))), D = [[ac - 2.3, 0.6], [ac + 2.3, 0.6], [ac + 2.3, 23.8], [ac - 2.3, 23.8]].map(([a, b]) => K.P(a, b, y(20.95)));
      for (let i = 0; i < 4; i++) face3([E[i], E[(i + 1) % 4], D[(i + 1) % 4], D[i]], ROOF, [0, 1, 0]);
      K.poly(hb, D, [0, 1, 0], ROOF); }

    // ---------- tower bay: stair, entrance, triple window, Corinthian capitals; the 1954 limestone stump with its clock ----------
    {
      const w = K.Wall(true, TN, 1), dp = 0.35, wp = K.Wall(true, TN + dp, 1), PIL = [[TW, TW + 1.3], [TE - 1.3, TE]];
      K.wall(w, TW, TE, lo, y(WT), [], ROCK, 0, 'stone');
      K.wall(w, TW, TE, y(WT), y(14.75), [[ac - 1.05, ac + 1.05, y(WT), y(6.15)], [ac - 1.32, ac + 1.32, y(8.65), y(13.1)]], BRICK, 0, 'brick');
      function capital(p0, p1, d1, h0, h1, e) {   // a block flaring by e from h0 to h1 (bell), five acanthus ribs up its front
        const B = (s, d) => w.pt(s, d, y(h0)), T = (s, d) => w.pt(s, d, y(h1)), on = (u, t) => w.pt(p0 - e * t + u * (p1 - p0 + 2 * e * t), d1 + e * t + 0.03, y(h0 + (h1 - h0) * t));
        face3([B(p0, d1), B(p1, d1), T(p1 + e, d1 + e), T(p0 - e, d1 + e)], LIME2, w.n); face3([B(p0, 0), B(p1, 0), T(p1 + e, 0), T(p0 - e, 0)], LIME2, mul(w.n, -1));
        face3([B(p0, 0), B(p0, d1), T(p0 - e, d1 + e), T(p0 - e, 0)], LIME2, mul(w.t, -1)); face3([B(p1, 0), B(p1, d1), T(p1 + e, d1 + e), T(p1 + e, 0)], LIME2, w.t);
        for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) beam(on(u, 0.05), on(u, 0.8), 0.04, LIME2);
      }
      for (const [p0, p1] of PIL) {   // corner pilasters dp proud on rock-faced piers: plinth, Corinthian capital, abacus
        for (const [h0, h1, col, mat] of [[lo, y(WT), ROCK, 'stone'], [y(WT), y(13.95), BRICK, 'brick']]) {
          K.skin(wp, [[p0, h0], [p1, h0], [p1, h1], [p0, h1]], col, 0, mat);
          for (const [s, o] of [[p0, -1], [p1, 1]]) K.skin(K.Wall(false, s, o), [[TN, h0], [TN + dp, h0], [TN + dp, h1], [TN, h1]], col, 0, mat);
        }
        w.box(p0 - 0.05, p1 + 0.05, 0, dp + 0.12, y(WT), y(3.4), LIME, true);
        capital(p0, p1, dp + 0.02, 13.95, 14.55, 0.18); w.box(p0 - 0.2, p1 + 0.2, 0, dp + 0.26, y(14.55), y(14.75), LIME, true);
      }
      for (const [h0, h1, out, col] of BANDS.slice(1, 6)) {   // round the pilasters, and across the recessed middle (the dark band stops at the entrance)
        for (const [p0, p1] of PIL) w.box(p0 - out, p1 + out, 0, dp + out, y(h0), y(h1), col, true);
        for (const [s0, s1] of h0 === 3.45 ? [[TW + 1.3, ac - 1.6], [ac + 1.6, TE - 1.3]] : [[TW + 1.3, TE - 1.3]]) w.box(s0, s1, 0, out, y(h0), y(h1), col, true);
      }
      // entrance: stone piers and entablature, a 0.9 m vestibule with glass doors and transom
      for (const s of [-1, 1]) w.box(ac + s * 1.27 - 0.22, ac + s * 1.27 + 0.22, 0, dp - 0.05, y(WT), y(6.15), LIME2, true);
      w.box(ac - 1.65, ac + 1.65, 0, dp + 0.1, y(6.15), y(6.95), LIME2, true); w.box(ac - 1.85, ac + 1.85, 0, dp + 0.22, y(6.95), y(7.22), LIME, true);
      const dw = K.Wall(true, TN - 0.9, 1);
      K.wall(dw, ac - 1.05, ac + 1.05, y(WT), y(6.15), [[ac - 0.85, ac + 0.85, y(WT), y(5.3)], [ac - 0.85, ac + 0.85, y(5.42), y(6.0)]], LIME2, 0, 'plain');
      K.opening(dw, ac - 0.85, ac + 0.85, y(WT), y(5.3), 'PANE', { split: 2, door: true, casing: 0.08 }); K.opening(dw, ac - 0.85, ac + 0.85, y(5.42), y(6.0), 'PANE', { split: 2, casing: 0.05 });
      for (const [s, o] of [[ac - 1.05, 1], [ac + 1.05, -1]]) K.poly(hb, [K.P(s, TN, y(WT)), K.P(s, TN - 0.9, y(WT)), K.P(s, TN - 0.9, y(6.15)), K.P(s, TN, y(6.15))], K.N(o, 0, 0), LIME2);
      K.poly(hb, [K.P(ac - 1.05, TN, y(6.15)), K.P(ac + 1.05, TN, y(6.15)), K.P(ac + 1.05, TN - 0.9, y(6.15)), K.P(ac - 1.05, TN - 0.9, y(6.15))], [0, -1, 0], LIME);
      // triple courtroom window with transoms in a stone surround
      K.opening(w, ac - 1.32, ac + 1.32, y(8.65), y(12.25), 'S1', { split: 3, casing: 0.06 }); K.opening(w, ac - 1.32, ac + 1.32, y(12.37), y(13.1), 'PANE', { split: 3, casing: 0.05 });
      for (const s of [-1, 1]) w.box(ac + s * 1.45 - 0.13, ac + s * 1.45 + 0.13, 0, 0.14, y(8.63), y(13.1), LIME, true);
      w.box(ac - 1.62, ac + 1.62, 0, 0.2, y(13.1), y(13.45), LIME, true);
      for (const [a, o] of [[TW, -1], [TE, 1]]) { const ws = K.Wall(false, a, o); face(ws, BN, TN, lo, y(WT), 'stone', ROCK); face(ws, BN, TN, y(WT), y(14.75), 'brick', BRICK); for (const [h0, h1, out, col] of BANDS.slice(0, 6)) band(ws, BN, TN + dp, h0, h1, out, col); }
      // the stump: limestone walls, entablature over the capitals (flush with the pilasters), attic band and cornice, corner piers, top cornice (lidar top 24-24.6)
      for (const [ws, s0, s1] of [[w, TW, TE], [K.Wall(false, TW, -1), TS, TN], [K.Wall(false, TE, 1), TS, TN], [K.Wall(true, TS, -1), TW, TE]]) K.wall(ws, s0, s1, y(14.75), y(TT), [], LIMET, 0, 'stone');
      K.wall(wp, TW, TE, y(15.25), y(16.15), [], LIMET, 0, 'stone'); for (const [s, o] of [[TW, -1], [TE, 1]]) K.skin(K.Wall(false, s, o), [[TN, y(15.25)], [TN + dp, y(15.25)], [TN + dp, y(16.15)], [TN, y(16.15)]], LIMET, 0, 'stone');
      const ring = (h0, h1, out, col, nx = 0) => K.box(TW - out, TE + out, TS - out, TN + nx + out, y(h0), y(h1), col, true);
      ring(14.75, 15.25, 0.07, LIME, dp); ring(16.15, 16.5, 0.3, LIME, dp); ring(17.95, 18.3, 0.18, LIME); ring(TT - 0.3, TT, 0.12, LIME); ring(TT, TT + 0.32, 0.22, LIME);
      for (const [a0, sa] of [[TW, 1], [TE, -1]]) for (const [b0, sb] of [[TS, 1], [TN, -1]]) K.box(Math.min(a0 - sa * 0.1, a0 + sa * 0.85), Math.max(a0 - sa * 0.1, a0 + sa * 1.2), Math.min(b0 - sb * 0.1, b0 + sb * 1.2), Math.max(b0 - sb * 0.1, b0 + sb * 1.2), y(18.3), y(TT - 0.3), STONEP);
      // clock to Main Street: octagonal stone surround, dial (lit at dusk), hour marks, hands at twenty-five past five
      const cy = y(20.6), CL = (r, phi, d) => w.pt(ac + r * Math.cos(phi), d, cy + r * Math.sin(phi)), oct = (r, k, d) => CL(r / Math.cos(Math.PI / 8), (k + 0.5) * Math.PI / 4, d);
      for (let k = 0; k < 8; k++) { const m = (k + 1) * Math.PI / 4;
        K.poly(hb, [oct(1.35, k, 0.09), oct(1.35, k + 1, 0.09), oct(0.9, k + 1, 0.09), oct(0.9, k, 0.09)], w.n, LIME);
        K.poly(hb, [oct(1.35, k, 0), oct(1.35, k + 1, 0), oct(1.35, k + 1, 0.09), oct(1.35, k, 0.09)], add(mul(w.t, Math.cos(m)), [0, Math.sin(m), 0]), LIME); }
      K.poly(hb, [...Array(20).keys()].map((k) => CL(0.9, k * Math.PI / 10, 0.05)), w.n, C(0xf4f2ea), Array(20).fill(LIT));
      const bar = (th, r0, r1, wd, d, col) => { const phi = Math.PI / 2 + th, cs = Math.cos(phi), sn = Math.sin(phi), P2 = (r, s) => w.pt(ac + r * cs - s * sn * wd / 2, d, cy + r * sn + s * cs * wd / 2);
        K.poly(hb, [P2(r0, -1), P2(r0, 1), P2(r1, 1), P2(r1, -1)], w.n, col); };
      for (let k = 0; k < 12; k++) bar(k * Math.PI / 6, 0.68, 0.84, k % 3 ? 0.04 : 0.08, 0.06, IRON);
      bar((5 + 25 / 60) * Math.PI / 6, -0.08, 0.48, 0.075, 0.07, IRON); bar(25 * Math.PI / 30, -0.1, 0.76, 0.045, 0.08, IRON);
      for (const [a, o] of [[TW, -1], [TE, 1]]) {   // louvres east and west
        const ws = K.Wall(false, a, o), c = (TS + TN) / 2 - 0.4; ws.box(c - 0.5, c + 0.5, 0, 0.05, y(19.5), y(21.9), C(0xe6e6e0), true);
        for (let i = 0; i < 9; i++) ws.box(c - 0.42, c + 0.42, 0.05, 0.08, y(19.65 + i * 0.25), y(19.73 + i * 0.25), C(0xa9a9a4), true);
      }
      K.box(TW + 0.9, TW + 0.95, TN - 3.0, TN - 2.95, y(TT + 0.32), y(TT + 5.8), METAL);   // antenna: a plain thin whip (photo)
      // north stair: landing, thirteen steps, rock-faced cheek walls, three rails
      const s0 = ac - 1.8, s1 = ac + 1.8, rise = WT / 14, foot = TN + 1.0 + 13 * 0.31;
      K.box(s0, s1, TN - 0.9, TN + 1.0, lo, y(WT), STEP);
      for (let k = 1; k <= 13; k++) K.box(s0, s1, TN + 1.0 + (k - 1) * 0.31, TN + 1.0 + k * 0.31, lo, y(WT - k * rise), STEP);
      const prof = [[TN, lo], [foot, lo], [foot, y(1.15)], [foot - 0.75, y(1.15)], [TN + 1.25, y(WT + 0.8)], [TN, y(WT + 0.8)]];
      for (const [c0, c1] of [[ac - 2.75, s0], [s1, ac + 2.75]]) {
        for (const [c, o] of [[c0, -1], [c1, 1]]) K.skin(K.Wall(false, c, o), prof, ROCK, 0, 'stone');
        for (let i = 0; i < prof.length; i++) { const [b0, h0] = prof[i], [b1, h1] = prof[(i + 1) % prof.length]; if (h0 === lo && h1 === lo) continue; face3([K.P(c0, b0, h0), K.P(c1, b0, h0), K.P(c1, b1, h1), K.P(c0, b1, h1)], LIME2, add(K.N(0, h1 - h0, 0), [0, b0 - b1, 0])); }
      }
      for (const a of [s0 + 0.12, ac, s1 - 0.12]) {
        const p = K.P(a, TN + 0.2, y(WT + 0.95)), q = K.P(a, TN + 1.0, y(WT + 0.95)), r = K.P(a, foot - 0.15, y(0.95 + 0.4 * rise));
        beam(p, q, 0.025, METAL); beam(q, r, 0.025, METAL);
        for (const t of [0.05, 0.5, 0.95]) { const m = add(q, sub(r, q), t); beam(m, add(m, [0, -0.95, 0]), 0.02, METAL); }
      }
      K.wallSeg(ac - 2.75, TN, ac - 2.75, foot); K.wallSeg(ac - 2.75, foot, ac + 2.75, foot); K.wallSeg(ac + 2.75, foot, ac + 2.75, TN);
      K.wallSeg(TW, TN, TW, TN + dp); K.wallSeg(TW, TN + dp, ac - 2.75, TN + dp); K.wallSeg(ac + 2.75, TN + dp, TE, TN + dp); K.wallSeg(TE, TN + dp, TE, TN);   // pilaster piers outside the cheek walls
    }

    // ---------- the 2000s addition, its glass connector and the service wing ----------
    const XW = -14.37, XE = 14.18, XN = -6.5, XS = -25.75, MW = -10.0, ME = 10.57, MS = -27.6, GW = -7.8, GE = 8.9, GS = -32.5, GT = -9.4, AT = 14.9, AR = 17.0, AP = 17.38, BH = 2.6;
    const FL = [[0.5, 1.8], [3.5, 5.5], [7.4, 9.4], [11.3, 13.3]], grp = (c, n, fl = FL) => fl.map(([h0, h1]) => [c, n * 1.38 - 0.1, h0, h1, 'p', n]);
    function addFace(w, s0, s1, ops, from = lo) {   // limestone base to BH, brick to the 3.2 m precast top band (photos), coping, panel joints
      if (from < y(BH)) { face(w, s0, s1, from, y(BH), 'stone', LIMET, ops); band(w, s0, s1, BH - 0.3, BH, 0.08, PRE); }
      face(w, s0, s1, Math.max(from, y(BH)), y(AT), 'brick', BRICK2, ops); K.wall(w, s0, s1, y(AT), y(AP), [], PRE, 0, 'plain');
      w.box(s0 - 0.1, s1 + 0.1, -0.3, 0.1, y(AP), y(AP + 0.12), PRE, true); band(w, s0, s1, AT - 0.08, AT + 0.04, 0.05, PRE);
      for (let s = s0 + 1.2; s < s1 - 0.4; s += 1.2) w.box(s - 0.015, s + 0.015, 0, 0.012, y(AT), y(AP), JOINT);
      for (const h of [0.83, 1.66]) w.box(s0, s1, 0, 0.012, y(AT + h) - 0.015, y(AT + h) + 0.015, JOINT);
    }
    for (const sg of [-1, 1]) {
      const A = sg < 0 ? XW : XE;
      addFace(K.Wall(false, A, sg), XS, XN, [...grp(-13.5, 4), ...grp(-20.6, 3), [(GT + XN) / 2, XN - GT, 0, AT, 'g']]);   // long side, glass stair tower at the north end
      const n0 = sg < 0 ? XW : RE, n1 = sg < 0 ? RW : XE; addFace(K.Wall(true, XN, 1), n0, n1, [[(n0 + n1) / 2, n1 - n0, 0, AT, 'g']]);   // its glazed north return
      const t0 = sg < 0 ? XW : ME, t1 = sg < 0 ? MW : XE; addFace(K.Wall(true, XS, -1), t0, t1, grp((t0 + t1) / 2, 2));
      addFace(K.Wall(false, sg < 0 ? MW : ME, sg), MS, XS, []);
      addFace(K.Wall(true, MS, -1), sg < 0 ? MW : GE, sg < 0 ? GW : ME, []);
      const cw = K.Wall(false, sg < 0 ? RW : RE, sg); curtain(cw, XN, BS, lo, y(AT)); K.wall(cw, XN, BS, y(AT), y(AP), [], PRE, 0, 'plain'); cw.box(XN, BS, -0.3, 0.1, y(AP), y(AP + 0.12), PRE, true);   // connector
    }
    { const w = K.Wall(true, MS, -1), PAN = C(0xc4beb1), ap = (c, r, h0, hs, d, col) => K.skin(sunk(w, -d), [[c - r, y(h0)], [c + r, y(h0)], ...[...Array(9).keys()].map((i) => [c + r * Math.cos(Math.PI * i / 8), y(hs) + r * Math.sin(Math.PI * i / 8)])], col, 0, 'plain');
      addFace(w, GW, GE, [[5.3, 1.0, 8.9, 10.6, 'p', 1]], y(8.2));   // south wall over the wing: one small window, blind arched panels on the top floor (photos)
      for (const c of [-4.8, -1.05, 0.45, 1.95, 5.5]) { ap(c, 0.62, 10.95, 13.2, 0.03, PRE); ap(c, 0.5, 11.05, 13.2, 0.06, PAN); } }
    K.flat([[XW, XS], [MW, XS], [MW, MS], [ME, MS], [ME, XS], [XE, XS], [XE, XN], [RE, XN], [RE, BS], [RW, BS], [RW, XN], [XW, XN]], y(AR), { parapet: AP - AR, col: ROOF2, wall: PRE, coping: PRE });
    const blk = (a0, a1, b0, b1, h0, h1, mat, col, top) => { for (const [w, s0, s1] of [[K.Wall(true, b0, -1), a0, a1], [K.Wall(true, b1, 1), a0, a1], [K.Wall(false, a0, -1), b0, b1], [K.Wall(false, a1, 1), b0, b1]]) K.wall(w, s0, s1, y(h0), y(h1), [], col, 0, mat);
      K.poly(hb, [K.P(a0, b0, y(h1)), K.P(a1, b0, y(h1)), K.P(a1, b1, y(h1)), K.P(a0, b1, y(h1))], [0, 1, 0], top); };
    for (const [a0, a1, b0, b1, h] of [[-2.0, 1.8, -13.8, -6.9, 19.3], [-3.0, 3.0, -17.8, -14.0, 19.0], [-1.3, 1.5, -26.0, -18.2, 18.9], [-13.2, -6.0, -21.8, -17.2, 18.5]]) blk(a0, a1, b0, b1, AR, h, 'plain', METAL, ROOF);   // rooftop units (lidar)
    { // service wing: two storeys high (lidar: walls 8.6 m over the floor), limestone base, the garage door to the east under two precast panels,
      // blind precast panels for windows (photos)
      const g = K.G(0.5, -30.2) - F, WR = 8.2, WP = 8.5, BT = g + 3.2, PAN = C(0xc4beb1);
      const blind = (w, c, n, pw, h0, h1) => { const a = c - (n * pw) / 2; w.box(a - 0.12, a + n * pw + 0.12, 0, 0.04, y(h0 - 0.12), y(h1 + 0.12), PRE, true);
        for (let i = 0; i < n; i++) w.box(a + i * pw + 0.05, a + (i + 1) * pw - 0.05, 0, 0.07, y(h0 + 0.05), y(h1 - 0.05), PAN, true); };
      for (const [w, s0, s1, ops, bl] of [[K.Wall(true, GS, -1), GW, GE, [], [[-6.4, 1, 1.1], [-1.6, 3, 1.1], [4.6, 1, 1.1]]],
        [K.Wall(false, GW, -1), GS, MS, [[-30.4, 1.0, g, g + 2.3, 'd']], [[-29.0, 2, 1.1]]], [K.Wall(false, GE, 1), GS, MS, [[-30.05, 3.4, g, g + 3.7, 'r']], [[-30.05, 2, 1.75]]]]) {
        face(w, s0, s1, lo, y(BT), 'stone', LIMET, ops); face(w, s0, s1, y(BT), y(WR), 'brick', BRICK2, ops); band(w, s0, s1, BT - 0.15, BT, 0.06, PRE);
        K.wall(w, s0, s1, y(WR), y(WP), [], PRE, 0, 'plain'); w.box(s0 - 0.1, s1 + 0.1, -0.3, 0.1, y(WP), y(WP + 0.1), PRE, true);
        for (const [c, n, pw] of bl) blind(w, c, n, pw, g + 4.2, g + 7.0);
      }
      K.flat([[GW, GS], [GE, GS], [GE, MS], [GW, MS]], y(WR), { parapet: WP - WR, col: ROOF2, wall: PRE, coping: PRE });
      blk(0.6, 3.8, -30.0, -28.2, WR, 9.2, 'plain', METAL, ROOF);   // rooftop unit (lidar 9.2)
    }
    { // east entrance: limestone portico with a pediment in front of the connector, green canopy over the stair-tower doors
      const a0 = 12.1, a1 = 16.65, b0 = -6.65, b1 = -2.85, bm = (b0 + b1) / 2, g = K.G(16.3, bm) - F, yb = y(g + 3.9), yr = y(g + 4.75);
      for (const b of [b0 + 0.42, b1 - 0.42]) { K.box(15.85, 16.65, b - 0.4, b + 0.4, y(g - 0.2), y(g + 3.35), STONEP); K.box(15.75, 16.75, b - 0.5, b + 0.5, y(g + 3.05), y(g + 3.35), LIME); K.circle(16.25, b, 0.55); }
      K.box(a0, a1, b0, b1, y(g + 3.35), yb, LIME, true);
      K.poly(hb, [K.P(a1, b0, yb), K.P(a1, b1, yb), K.P(a1, bm, yr)], K.N(1, 0, 0), LIME2);
      for (const be of [b0 - 0.25, b1 + 0.25]) { const pts = [K.P(a0, be, yb - 0.1), K.P(a1 + 0.25, be, yb - 0.1), K.P(a1 + 0.25, bm, yr + 0.1), K.P(a0, bm, yr + 0.1)]; face3(pts, GREEN, [0, 1, 0]); face3(pts, LIME2, [0, -1, 0]);
        face3([K.P(a1 + 0.25, be, yb - 0.1), K.P(a1 + 0.25, be, yb - 0.3), K.P(a1 + 0.25, bm, yr - 0.1), K.P(a1 + 0.25, bm, yr + 0.1)], LIME, K.N(1, 0, 0)); }
      const c0 = -9.75, c1 = b0, top = [K.P(XE, c0, y(g + 3.55)), K.P(XE, c1, y(g + 3.55)), K.P(16.3, c1, y(g + 3.15)), K.P(16.3, c0, y(g + 3.15))];
      face3(top, GREEN, [0, 1, 0]); face3(top, C(0xd9d6cf), [0, -1, 0]); K.box(16.2, 16.36, c0, c1, y(g + 2.95), y(g + 3.2), GREEN);
      K.box(16.1, 16.22, c0 + 0.15, c0 + 0.27, y(g - 0.2), y(g + 3.0), GREEN); K.circle(16.16, c0 + 0.21, 0.36);
    }

    // ---------- the lawn ----------
    function walk(wd, pts) {   // concrete walk along a polyline, 5 cm over the lawn, overlapping at the joints
      for (let i = 0; i < pts.length - 1; i++) {
        const [a0, b0] = pts[i], [a1, b1] = pts[i + 1], L = Math.hypot(a1 - a0, b1 - b0), ua = (a1 - a0) / L, ub = (b1 - b0) / L, e0 = i ? wd / 2 : 0, e1 = i < pts.length - 2 ? wd / 2 : 0, n = Math.ceil((L + e0 + e1) / 2);
        const Q = (t, s) => { const pa = a0 + ua * t - ub * s * wd / 2, pb = b0 + ub * t + ua * s * wd / 2; return K.P(pa, pb, K.G(pa, pb) + 0.05); };
        for (let k = 0; k < n; k++) { const t0 = -e0 + (L + e0 + e1) * k / n, t1 = -e0 + (L + e0 + e1) * (k + 1) / n; K.poly(hb, [Q(t0, -1), Q(t1, -1), Q(t1, 1), Q(t0, 1)], [0, 1, 0], CONC); }
      }
    }
    // the west walk's north branch runs to the NW pavilion and on along it to Main St (site plan; 2008 photo), leaving the memorial plot whole
    for (const [wd, pts] of [[3.6, [[ac, TN + 5.0], [ac, 48.6]]], [1.6, [[-12.2, 38.75], [17.0, 38.75]]], [1.5, [[-42.2, 10.5], [-24.6, 10.5], [-12.2, 25.8], [-12.2, 47.5]]], [1.5, [[-24.6, 10.5], [-14.4, -8.2]]],
      [2.0, [[16.6, -5.0], [41.8, -5.0]]], [1.5, [[17.6, -3.4], [40.6, 13.2]]], [1.5, [[17.6, -6.8], [40.6, -33.8]]], [1.5, [[16.4, -9.8], [16.4, -36.3]]]]) walk(wd, pts);
    // ponytail: boxes, cylinders and bar-built handwheels (no seats, fuze-setter detail or open frame); a finer mount if the lawn gets close-up camera work
    function gun(a, b, yaw, el) {   // WWII naval 3-inch/50 dual-purpose gun on its pedestal mount (the photos), barrel at azimuth yaw (frame), elevation el
      const o = K.P(a, b, K.G(a, b)), fw = K.N(Math.cos(yaw), Math.sin(yaw), 0), lf = K.N(-Math.sin(yaw), Math.cos(yaw), 0), up = [0, 1, 0];
      const at = (x, h, z) => add(add(add(o, fw, x), lf, z), up, h), bx = (x, h, z, hx, hh, hz, col) => obox(at(x, h, z), mul(fw, hx), [0, hh, 0], mul(lf, hz), col);
      const wheel = (c, r, n) => { const P = (k) => add(add(c, fw, r * Math.cos(2 * Math.PI * k / n)), up, r * Math.sin(2 * Math.PI * k / n));   // spoked handwheel in the fw-up plane
        for (let k = 0; k < n; k++) beam(P(k), P(k + 1), 0.025, GUN2);
        beam(add(c, fw, -r), add(c, fw, r), 0.018, GUN2); beam(add(c, up, -r), add(c, up, r), 0.018, GUN2); };
      bx(0, 0, 0, 1.3, 0.1, 1.3, CONC);   // concrete pad
      cyl(at(0, 0.1, 0), at(0, 0.3, 0), 1.0, 1.0, 12, GUN2); cyl(at(0, 0.3, 0), at(0, 0.8, 0), 0.6, 0.55, 10, GUN); bx(0, 0.88, 0, 0.75, 0.08, 0.7, GUN2);   // base ring, pedestal, training base
      for (const s of [1, -1]) {   // the wide carriage of the photos: cheeks to the trunnions, big sight and fuze-setter boxes low at the sides, sight heads, handwheels
        bx(0.05, 1.42, s * 0.33, 0.5, 0.52, 0.07, GUN); bx(-0.05, 1.25, s * 0.82, 0.42, 0.4, 0.28, GUN); bx(-0.45, 1.0, s * 0.58, 0.18, 0.2, 0.2, GUN2); bx(0.15, 1.85, s * 0.75, 0.15, 0.2, 0.12, GUN2);
        wheel(at(-0.15, 1.35, s * 1.14), 0.25, 8); wheel(at(0.3, 1.0, s * 1.14), 0.16, 6);
        beam(at(-0.05, 1.62, s * 0.82), at(0.05, 2.2, s * 0.9), 0.04, GUN2); cyl(at(-0.3, 2.22, s * 0.9), at(0.45, 2.22, s * 0.9), 0.065, 0.065, 6, GUN2);   // sight boom and telescope
      }
      const tr = at(0.05, 1.8, 0), d = add(mul(fw, Math.cos(el)), up, Math.sin(el)), u = add(mul(fw, -Math.sin(el)), up, Math.cos(el));
      obox(add(tr, d, -0.15), mul(d, 1.1), mul(u, 0.26), mul(lf, 0.27), GUN); obox(add(tr, d, -1.42), mul(d, 0.24), mul(u, 0.31), mul(lf, 0.31), GUN2);   // slide, breech
      cyl(add(tr, d, 0.9), add(tr, d, 4.0), 0.12, 0.08, 8, GUN); cyl(add(tr, d, 3.85), add(tr, d, 4.08), 0.095, 0.095, 8, GUN2);   // barrel, muzzle ring
      cyl(add(add(tr, d, -1.0), u, 0.3), add(add(tr, d, 0.75), u, 0.3), 0.08, 0.08, 6, GUN2);   // recoil cylinder
      K.circle(a, b, 1.2);
    }
    gun(-15.0, 36.5, 2.4, 0.8); gun(16.0, 36.5, 1.25, 0.5); gun(31.6, 36.6, 1.9, 0.62); gun(-29.2, -23.9, 3.4, 1.53);
    { // the 1886 bell on its cast-iron yoke and concrete plinth (NE lawn): site plan (24.6, 38.7), moved east clear of the festival hay and pumpkins round (22, 38), north of the lidar tree at (27.8, 36.3)
      const a = 27.1, b = 38.9, g = K.G(a, b), y0 = g + 0.55, ya = y0 + 1.75, c = K.P(a, b, 0);
      K.box(a - 0.95, a + 0.95, b - 0.75, b + 0.75, g - 0.2, y0, CONC);
      for (const s of [-0.55, 0.55]) for (const t of [-1, 1]) beam(K.P(a + s, b + t * 0.68, y0), K.P(a + s, b + t * 0.05, ya), 0.05, YOKE);
      beam(K.P(a - 0.65, b, ya), K.P(a + 0.65, b, ya), 0.05, YOKE); K.box(a - 0.18, a + 0.18, b - 0.14, b + 0.14, y0 + 1.58, ya, YOKE);
      const prof = [[0.5, 0.62], [0.47, 0.72], [0.38, 0.95], [0.32, 1.25], [0.27, 1.48], [0.18, 1.6]], n = 12, rim = (r, h, k) => [c[0] + r * Math.cos(2 * Math.PI * k / n), y0 + h, c[2] + r * Math.sin(2 * Math.PI * k / n)];
      for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < n; k++) { const [ra, ha] = prof[i], [rb, hb_] = prof[i + 1], m = 2 * Math.PI * (k + 0.5) / n;
        K.poly(hb, [rim(ra, ha, k), rim(ra, ha, k + 1), rim(rb, hb_, k + 1), rim(rb, hb_, k)], unit([Math.cos(m), (ra - rb) / (hb_ - ha), Math.sin(m)]), BRONZE); }
      K.poly(hb, [...Array(n).keys()].map((k) => rim(0.18, 1.6, k)), [0, 1, 0], BRONZE); K.poly(hb, [...Array(n).keys()].map((k) => rim(0.46, 0.7, k)), [0, -1, 0], C(0x1d1812));
      K.wallSeg(a - 0.95, b - 0.75, a + 0.95, b - 0.75); K.wallSeg(a + 0.95, b - 0.75, a + 0.95, b + 0.75); K.wallSeg(a + 0.95, b + 0.75, a - 0.95, b + 0.75); K.wallSeg(a - 0.95, b + 0.75, a - 0.95, b - 0.75);
    }
    { // veterans memorial (NW): two granite pylons and a black granite panel facing Main Street, iron fence, four flagpoles behind
      const a = -23.0, b = 32.6, g = K.G(a, b);   // site plan (-23, 36.6) and the photos; moved 4 m south, clear of the festival hay at (-22, 38)
      K.box(a - 1.7, a + 1.7, b - 0.6, b + 0.6, g - 0.2, g + 0.3, C(0x77756f)); K.box(a - 1.55, a - 0.8, b - 0.28, b + 0.28, g + 0.3, g + 2.7, GRAN); K.box(a + 0.8, a + 1.55, b - 0.28, b + 0.28, g + 0.3, g + 3.2, GRAN);
      K.box(a - 0.8, a + 0.8, b - 0.13, b + 0.13, g + 0.3, g + 2.3, GRANB);
      const fa = [a - 2.4, a + 2.4], fb = [b - 1.5, b + 1.5], fy = (p, q) => K.G(p, q);
      for (const [p, q] of [[[fa[0], fb[0]], [fa[1], fb[0]]], [[fa[1], fb[0]], [fa[1], fb[1]]], [[fa[1], fb[1]], [fa[0], fb[1]]], [[fa[0], fb[1]], [fa[0], fb[0]]]]) {
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.round(L / 0.22);
        for (let k = 0; k < n; k++) { const pa = p[0] + (q[0] - p[0]) * k / n, pb = p[1] + (q[1] - p[1]) * k / n, h = k % 8 ? 0.95 : 1.1, r = k % 8 ? 0.012 : 0.04; K.box(pa - r, pa + r, pb - r, pb + r, fy(pa, pb) - 0.1, fy(pa, pb) + h, IRON); }
        for (const h of [0.15, 0.85]) beam(K.P(p[0], p[1], fy(...p) + h), K.P(q[0], q[1], fy(...q) + h), 0.018, IRON);
        K.wallSeg(p[0], p[1], q[0], q[1]);
      }
      const FLAGS = { us: null, in: [0x22397a, 0xd3b24c], pow: [0x18181a, 0xe9e7e0], red: [0xa8242c, 0xd3b24c] };
      for (const [fa_, fb_, h, kind] of [[-25.9, 29.8, 8.5, 'in'], [-24.2, 29.4, 8.5, 'pow'], [-22.5, 29.4, 15.5, 'us'], [-20.8, 29.7, 8.5, 'red']]) {
        const gg = K.G(fa_, fb_), Lf = kind === 'us' ? 2.8 : 1.6, Hf = Lf * 0.53, top = gg + h - 0.15, rows = kind === 'us' ? 13 : 3, nc = 8, pal = FLAGS[kind];
        cyl(K.P(fa_, fb_, gg - 0.2), K.P(fa_, fb_, gg + h), 0.075, 0.04, 6, POLE); K.box(fa_ - 0.09, fa_ + 0.09, fb_ - 0.09, fb_ + 0.09, gg + h, gg + h + 0.18, GOLD); K.circle(fa_, fb_, 0.36);   // r >= 0.35: solid, not a break-away post (game.js)
        const P2 = (u, v) => K.P(fa_ + 0.06 + u * Lf * 0.8, fb_ - u * Lf * 0.6 + Math.sin(u * 4.2) * 0.2 * u * 0.8, top - v * Hf - u * 0.12);
        for (let i = 0; i < nc; i++) for (let j = 0; j < rows; j++) {
          const u0 = i / nc, u1 = (i + 1) / nc, v0 = j / rows, v1 = (j + 1) / rows, pts = [P2(u0, v0), P2(u1, v0), P2(u1, v1), P2(u0, v1)];
          const col = C(pal ? (j === 1 && i >= 3 && i <= 4 ? pal[1] : pal[0]) : (u0 < 0.39 && j < 7 ? 0x26356b : j % 2 ? 0xefede6 : 0xb3212f));
          quad(pts, col); quad(pts.slice().reverse(), col);
        }
      }
    }
  }
})();
