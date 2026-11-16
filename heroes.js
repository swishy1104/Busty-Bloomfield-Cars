/* Bloomfield Drift — hero buildings (BD.buildHeroes). Hand-modelled buildings from the owner's reference photos (never from their pixels),
   as merged vertex-coloured geometry on shared materials: a facade atlas (lap siding, sashes, door, lattice, fence boards, asphalt; lit glass
   at dusk), a shingle texture, and brick / limestone textures made only when a hero uses them. All heroes together are 2-4 draw calls
   (+ shadow passes) plus any player-car model parked on a lot (BD.buildCar, static).
   Public: BD.buildHeroes({ scene, W, M, game }) (game.js calls it before W.buildCollision()) -> W.heroes = [{ id, frame, tris, ms, treesMoved,
   treesCleared }]; BD.heroSkip (Set of M.buildings indices: buildings.js draws no shell there, landmarks.js no props; records, collision
   walls, minimap and inBuilding stay); BD.heroPlugins (below). HEROES is this file's own table (124 W Indiana Ave, a lot with no footprint).

   PLUG-IN (one file per building, loaded BEFORE heroes.js; a file loaded later must add its footprints to BD.heroSkip itself):
     (window.BD = window.BD || {}).heroPlugins = (BD.heroPlugins || []).concat({ id, name, footprints: [M.buildings indices it replaces], build(K) });
   optional: at: [x, y] map coords of the frame origin, dir: [x, y] map direction of the frame's a axis. Default frame for a footprint: a along
   the first footprint's longest edge (east-ish), origin at that footprint's corner (min a, min b), so K.fp(i).pts lie in [0, length] x [0, depth];
   without footprints: a along the nearest street, origin hero.at. A plug-in that throws is logged and dropped; the others still load.
   KIT K (frame: a, b metres on the ground, b = a turned 90 deg anticlockwise seen from above; y = world height, absolute, e.g. K.G(a, b) + 1):
     P(a, b, y) -> world [X, Y, Z]; N(da, db, dy) -> world direction; G(a, b) ground height; C(0xRRGGBB) linear colour; toLocal(X, Z) -> [a, b]
     fp(i) -> { pts: [[a, b], ...] counter-clockwise, rec: W.buildings record (lidar floorY, top = eave, ridge, roof 0 flat|1,2 gable|3 hip, wall
       colour, roofAt), lo, hi: ground range under the outline }; road: { edge (b of the nearest street's edge), name } | undefined
     walls(ring, ya, yb, o) -> [Seg per edge]: walls round a counter-clockwise ring; o: { col, mat: 'siding'|'brick'|'stone'|'plain', base
       (siding course origin), win: { w, h, sills: [y per storey], every (m of wall per window, default 3), region 'S1'|'S6'|'PANE', split, min } }
     Seg(a0, b0, a1, b1) / Wall(alongA, c, out): a wall plane { pt(s, d, y), n, t, box(s0, s1, d0, d1, ya, yb, col, bottom), L (Seg) }; s runs
       along it, d outward (Seg: to the right of travel; Wall: along a at b = c or along b at a = c, out = +1 | -1)
     wall(w, s0, s1, ya, yb, holes [[s0, s1, y0, y1]], col (Color or p => Color), sidBase, mat): a wall with rectangular holes
     opening(w, s0, s1, ya, yb, region 'S1'|'S6'|'PANE'|'DOOR', { split, door, col, casing }): recessed window or door with reveals, casing, sill
     flatWindow(w, s0, s1, ya, yb, region, split): surface-mounted window; lattice(w, s0, s1, ya, yb, rails); skin(w, [[s, y], ...], col, sidBase, mat)
     roof(alongA, s0, s1, c0, c1, ye, rise, over, { gutter: 'front'|'both', rakes: [[s0, s1], ...], under: Color, col }) -> { yr, k, at(c) }:
       gable roof, ridge along a (alongA) or b over s0..s1 (rakes included), eave walls at c0, c1, wall top ye; gable(w, sa, sb, ye, yr, col, sidBase, mat)
     hip(alongA, s0, s1, c0, c1, ye, rise, over, { col }) -> { yr, k }: hip roof, s0..s1 the wall extent along the (longer) ridge side
     flat(ring, y, { col, parapet (0.45), coping, wall }): flat roof with parapet (run the walls up to y + parapet)
     cornice(w, y, out, h, col, s0, s1): moulding on a wall, past both ends to meet its neighbours at corners
     box(a0, a1, b0, b1, y0, y1, col, bottom); poly(K.hb | K.rb, [world pts], normal, col, uvs): raw geometry; WHITE, TRIM; R, uvr(atlas region)
     wallSeg(a0, b0, a1, b1), circle(a, b, r): solids; keep(a0, a1, b0, b1, [a, b]): tree keep-out; foot(ring): minimap; drive(rows), fence(...),
     car(id, a, b, da, db): see below. A replaced footprint is already solid and on the minimap: add only what the hand model adds.
   Example (a hip-roofed ranch with a brick foundation): footprints: [729], build(K) { const f = K.fp(729), F = f.rec.floorY, ye = F + 2.7,
       A = Math.max(...f.pts.map((p) => p[0])), D = Math.max(...f.pts.map((p) => p[1]));
     K.walls(f.pts, f.lo - 0.3, F - 0.3, { mat: 'brick' });
     K.walls(f.pts, F - 0.3, ye, { col: K.C(0x8fa3b0), base: F - 0.3, win: { w: 0.9, h: 1.4, sills: [F + 0.8], every: 3.2, region: 'S6' } });
     K.hip(A >= D, 0, Math.max(A, D), 0, Math.min(A, D), ye, 2.2, 0.45); }
   HEROES entries: { id, name, at: [x, y] (map coords of the front-left corner of the main wall), build(K) }; the kit makes walls, posts and cars
   solid, moves the big lidar trees standing inside a keep-out just outside it and clears the small ones, paints footprints on the minimap,
   makes driveways asphalt for the tyres (wraps W.surface) and lights the windows at dusk (wraps W.windowGlow). */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});

  // ---------- facade atlas: regions in a 512 grid (drawn at 2x), [x, y, w, h] ----------
  const R = { SID: [0, 0, 64, 512], PLN: [64, 0, 64, 64], LIT: [64, 64, 64, 64], S6: [128, 0, 64, 128], S1: [192, 0, 64, 128], PANE: [256, 0, 64, 64],
    DOOR: [320, 0, 64, 144], LAT: [384, 0, 128, 128], ASP: [384, 136, 128, 64], FEN: [256, 192, 128, 128] };
  const uvr = (r, i) => [(r[0] + i) / 512, 1 - (r[1] + r[3] - i) / 512, (r[0] + r[2] - i) / 512, 1 - (r[1] + i) / 512];   // u0, v0 (bottom), u1, v1 (top)
  const PLAIN = [96 / 512, 1 - 32 / 512], LITUV = [96 / 512, 1 - 96 / 512], SIDH = 6;   // siding column: v 0..1 = 6 m of wall

  function textures(U) {
    const rng = U.mulberry(1240);
    const sash = (g, r, cols, rows, glow) => {
      const [x, y, w, h] = r, f = 4, mid = y + h * 0.5, white = glow ? '#000' : '#f2f0ea';
      g.fillStyle = white; g.fillRect(x, y, w, h);
      for (const [y0, y1, c, n] of [[y + f, mid - 2, cols, rows], [mid + 2, y + h - f, 1, 1]]) {
        const gx = x + f, gw = w - 2 * f;
        if (glow) { g.fillStyle = y0 < mid ? '#ffd596' : '#ffc777'; g.fillRect(gx, y0, gw, y1 - y0); }
        else {
          const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#7d8b96'); gr.addColorStop(0.4, '#404b56'); gr.addColorStop(1, '#1d2329'); g.fillStyle = gr; g.fillRect(gx, y0, gw, y1 - y0);
          g.fillStyle = 'rgba(255,255,255,0.09)'; g.beginPath(); g.moveTo(gx + gw * 0.55, y0); g.lineTo(gx + gw * 0.85, y0); g.lineTo(gx + gw * 0.4, y1); g.lineTo(gx + gw * 0.1, y1); g.fill();
        }
        g.fillStyle = white;
        for (let i = 1; i < c; i++) g.fillRect(gx + gw * i / c - 1, y0, 2, y1 - y0);
        for (let i = 1; i < n; i++) g.fillRect(gx, y0 + (y1 - y0) * i / n - 1, gw, 2);
      }
    };
    const draw = (glow) => (g) => {
      g.scale(2, 2); g.fillStyle = glow ? '#000' : '#fff'; g.fillRect(0, 0, 512, 512);
      sash(g, R.S6, 3, 2, glow); sash(g, R.S1, 1, 1, glow);
      { const [x, y, w, h] = R.PANE; g.fillStyle = glow ? '#ffd08a' : '#2a323a'; g.fillRect(x, y, w, h); }
      { const [x, y] = R.DOOR; g.fillStyle = glow ? '#000' : '#ebe7dc'; g.fillRect(x, y, 64, 144);
        if (!glow) { g.strokeStyle = 'rgba(60,40,10,0.28)'; g.lineWidth = 2; g.strokeRect(x + 8, y + 82, 48, 52); g.strokeRect(x + 8, y + 70, 48, 8); g.fillStyle = '#3a3226'; g.fillRect(x + 52, y + 74, 4, 4); }
        g.fillStyle = glow ? '#c99a50' : '#2c333a'; g.fillRect(x + 24, y + 14, 16, 46);
        if (!glow) { g.strokeStyle = 'rgba(220,220,200,0.45)'; g.lineWidth = 1; for (let k = -2; k < 4; k++) { g.beginPath(); g.moveTo(x + 24, y + 14 + k * 14); g.lineTo(x + 40, y + 30 + k * 14); g.moveTo(x + 40, y + 14 + k * 14); g.lineTo(x + 24, y + 30 + k * 14); g.stroke(); } g.strokeStyle = '#f2f0ea'; g.lineWidth = 2; g.strokeRect(x + 24, y + 14, 16, 46); } }
      if (glow) { g.fillStyle = '#fff0c8'; g.fillRect(...R.LIT); return; }
      // lap siding: the shadow under each lap, the board catching light toward its butt edge
      for (let i = 0; i < 50; i++) { const y0 = i * 10.24, gr = g.createLinearGradient(0, y0, 0, y0 + 10.24); gr.addColorStop(0, '#7e7e7e'); gr.addColorStop(0.2, '#cfcfcf'); gr.addColorStop(0.92, '#f2f2f2'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, y0, 64, 10.24); }
      // lattice: white slats both ways on transparent (alpha-tested), tiles every 0.9 m
      { const [x, y] = R.LAT, s = 128 / 6; g.clearRect(x, y, 128, 128); g.save(); g.beginPath(); g.rect(x, y, 128, 128); g.clip(); g.lineWidth = 5.5;
        for (const dir of [1, -1]) for (let k = -7; k <= 13; k++) { g.strokeStyle = dir > 0 ? '#f4f3ee' : '#e4e3dc'; g.beginPath(); g.moveTo(x + k * s, dir > 0 ? y : y + 128); g.lineTo(x + k * s + 128, dir > 0 ? y + 128 : y); g.stroke(); }
        g.restore(); }
      // old asphalt: dark, speckled, cracked (3 x 1.5 m)
      { const [x, y, w, h] = R.ASP; g.fillStyle = '#43423f'; g.fillRect(x, y - 8, w, h + 16);
        for (let k = 0; k < 1400; k++) { const v = 44 + rng() * 40 | 0; g.fillStyle = `rgb(${v},${v - 1},${v - 3})`; g.fillRect(x + rng() * w, y + rng() * h, 1, 1); }
        g.strokeStyle = '#2a2927'; g.lineWidth = 1;
        for (let k = 0; k < 7; k++) { let px = x + rng() * w, py = y + rng() * h; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 6; j++) { px = Math.min(x + w, Math.max(x, px + (rng() - 0.5) * 30)); py = Math.min(y + h, Math.max(y, py + (rng() - 0.5) * 22)); g.lineTo(px, py); } g.stroke(); } }
      // privacy-fence boards (1.6 m wide, 1.8 m tall), greyscale for the vertex tint
      { const [x, y] = R.FEN, n = 11, bw = 128 / n; for (let k = 0; k < n; k++) { const v = 205 + rng() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + k * bw, y, bw, 128);
        g.fillStyle = 'rgba(0,0,0,0.07)'; for (let j = 0; j < 3; j++) g.fillRect(x + k * bw + 1 + rng() * (bw - 2), y, 1, 128); g.fillStyle = '#707070'; g.fillRect(x + k * bw, y, 1, 128); } }
    };
    const atlas = U.canvasTex(1024, 1024, draw(false)), glow = U.canvasTex(512, 512, (g) => { g.scale(0.5, 0.5); draw(true)(g); });
    // asphalt shingles, 2 x 2 m: 16 courses of 0.125 m, 0.33 m tabs staggered by half a tab, weathered grey-browns with granule speckle
    const roof = U.canvasTex(512, 512, (g) => {
      const C = ['#3c372e', '#353027', '#433d32', '#302c25', '#3a352c', '#474135', '#332e27'];
      for (let i = 0; i < 16; i++) { const y0 = i * 32, off = (i & 1) * 42.67;
        for (let j = -1; j < 7; j++) { g.fillStyle = C[rng() * C.length | 0]; g.fillRect(off + j * 85.33, y0, 85.33, 32); }
        for (let k = 0; k < 500; k++) { const v = rng(); g.fillStyle = v < 0.5 ? 'rgba(30,24,20,0.35)' : 'rgba(150,135,120,0.3)'; g.fillRect(rng() * 512, y0 + rng() * 32, 1.5, 1.5); }
        g.fillStyle = '#2e2824'; for (let j = -1; j < 7; j++) g.fillRect(off + j * 85.33 - 1, y0 + 12, 2, 20);
        g.fillStyle = 'rgba(25,20,16,0.75)'; g.fillRect(0, y0 + 30, 512, 3); }
      g.fillStyle = 'rgba(40,46,30,0.12)'; for (let k = 0; k < 9; k++) g.fillRect(rng() * 512, 0, 6 + rng() * 20, 512);   // faint streaks
    }, true);
    return { atlas, glow, roof };
  }

  // ---------- the kit: one lot's frame and builders ----------
  function makeKit(W, U, hero, bufs, scene, M) {
    const lin = U.lin, [x0, y0] = hero.at, e = hero.e, ex = e[0], ey = e[1], nx = -ey, ny = ex, hb = bufs.h, rb = bufs.r;
    const P = (a, b, y) => [x0 + a * ex + b * nx, y, -(y0 + a * ey + b * ny)];
    const N = (da, db, dy) => [da * ex + db * nx, dy, -(da * ey + db * ny)];
    const G = (a, b) => { const p = P(a, b, 0); return W.heightXZ(p[0], p[2]); };
    const toLocal = (X, Z) => { const dx = X - x0, dy = -Z - y0; return [dx * ex + dy * ey, dx * nx + dy * ny]; };
    const C = (hex) => lin(hex);
    // convex polygon from world points, wound to face n; col: Color or (point) => Color; uv: per-point list or null (plain white texel)
    function poly(buf, pts, n, col, uv) {
      const [p0, p1, p2] = pts, ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      const flip = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2] < 0, base = buf.pos.length / 3, m = pts.length;
      for (let q = 0; q < m; q++) { const i = flip ? m - 1 - q : q, p = pts[i], c = typeof col === 'function' ? col(p) : col, t = uv ? uv[i] : PLAIN;
        buf.pos.push(p[0], p[1], p[2]); buf.nor.push(n[0], n[1], n[2]); buf.col.push(c.r, c.g, c.b); buf.uv.push(t[0], t[1]); }
      for (let i = 1; i < m - 1; i++) buf.idx.push(base, base + i, base + i + 1);
    }
    // axis-aligned box in the frame (a0..a1, b0..b1, y0..y1); bottom face only when asked
    function box(a0, a1, b0, b1, y0_, y1, col, bottom, buf = hb) {
      const c = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]], d = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; poly(buf, [P(p[0], p[1], y0_), P(q[0], q[1], y0_), P(q[0], q[1], y1), P(p[0], p[1], y1)], N(d[i][0], d[i][1], 0), col); }
      poly(buf, c.map((p) => P(p[0], p[1], y1)), [0, 1, 0], col);
      if (bottom) poly(buf, c.map((p) => P(p[0], p[1], y0_)), [0, -1, 0], col);
    }
    // a wall plane: along a (b = c) or along b (a = c), out = +1 / -1 (outward along the other axis); s = position along it, d = offset outward
    const Wall = (alongA, c, out) => ({
      pt: (s, d, y) => alongA ? P(s, c + out * d, y) : P(c + out * d, s, y),
      n: alongA ? N(0, out, 0) : N(out, 0, 0), t: alongA ? N(1, 0, 0) : N(0, 1, 0),
      box(s0, s1, d0, d1, ya, yb, col, bottom) { const u = [c + out * d0, c + out * d1].sort((p, q) => p - q); if (alongA) box(s0, s1, u[0], u[1], ya, yb, col, bottom); else box(u[0], u[1], s0, s1, ya, yb, col, bottom); },
    });
    // a wall plane along any straight edge (a0, b0) -> (a1, b1), s = 0..L along it; outward is to the right of travel (outside a counter-clockwise ring)
    function Seg(a0, b0, a1, b1) {
      const L = Math.hypot(a1 - a0, b1 - b0), ua = (a1 - a0) / L, ub = (b1 - b0) / L, pt = (s, d, y) => P(a0 + ua * s + ub * d, b0 + ub * s - ua * d, y);
      return { L, pt, n: N(ub, -ua, 0), t: N(ua, ub, 0),
        box(s0, s1, d0, d1, ya, yb, col, bottom) { const c = [[s0, Math.min(d0, d1)], [s1, Math.min(d0, d1)], [s1, Math.max(d0, d1)], [s0, Math.max(d0, d1)]], d = [[0, -1], [1, 0], [0, 1], [-1, 0]];
          for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; poly(hb, [pt(p[0], p[1], ya), pt(q[0], q[1], ya), pt(q[0], q[1], yb), pt(p[0], p[1], yb)], N(ua * d[i][0] + ub * d[i][1], ub * d[i][0] - ua * d[i][1], 0), col); }
          poly(hb, c.map((p) => pt(p[0], p[1], yb)), [0, 1, 0], col); if (bottom) poly(hb, c.map((p) => pt(p[0], p[1], ya)), [0, -1, 0], col); } };
    }
    const sidUV = (yb) => (p) => [32 / 512, (p[1] - yb) / SIDH];
    // a flat piece of wall w from [s, y] corners in a finish: 'siding' (lap courses counted from sidBase), 'brick' or 'stone' (own textures, 2 m repeat,
    // col tints them: white = natural), 'plain' (vertex colour only: paint, stucco, concrete)
    function skin(w, sy, col, sidBase, mat = 'siding') {
      const pts = sy.map((q) => w.pt(q[0], 0, q[1]));
      if (mat === 'siding') poly(hb, pts, w.n, col, pts.map(sidUV(sidBase))); else if (mat === 'plain') poly(hb, pts, w.n, col); else poly(bufs[mat], pts, w.n, col, sy.map((q) => [q[0] / 2, q[1] / 2]));
    }
    // wall over s0..s1 x ya..yb with rectangular holes [s0, s1, y0, y1]; col may shade by height
    function wall(w, s0, s1, ya, yb, holes, col, sidBase = ya, mat) {
      const xs = [...new Set([s0, s1, ...holes.flatMap((h) => [h[0], h[1]])])].sort((p, q) => p - q);
      const rect = (sa, sb, y0_, y1) => skin(w, [[sa, y0_], [sb, y0_], [sb, y1], [sa, y1]], col, sidBase, mat);
      for (let i = 0; i < xs.length - 1; i++) {
        const sa = xs[i], sb = xs[i + 1]; let y = ya;
        for (const h of holes.filter((h) => h[0] <= sa + 1e-6 && h[1] >= sb - 1e-6).sort((p, q) => p[2] - q[2])) { if (h[2] > y) rect(sa, sb, y, h[2]); y = Math.max(y, h[3]); }
        if (yb > y + 1e-6) rect(sa, sb, y, yb);
      }
    }
    function gable(w, sa, sb, ye, yr, col, sidBase = ye, mat) { skin(w, [[sa, ye], [sb, ye], [(sa + sb) / 2, yr]], col, sidBase, mat); }
    const WHITE = C(0xeeece6), TRIM = C(0xe6e4dc);
    // recessed opening: white reveals, the sash (or door) set back, casing, sill. region: R.* key; split: number of ganged units
    function opening(w, s0, s1, ya, yb, region, o = {}) {
      const D = 0.13, tn = w.t, tm = tn.map((v) => -v), split = o.split || 1, mull = 0.08, col = o.col || C(0xffffff);
      poly(hb, [w.pt(s0, 0, yb), w.pt(s1, 0, yb), w.pt(s1, -D, yb), w.pt(s0, -D, yb)], [0, -1, 0], WHITE);
      poly(hb, [w.pt(s0, 0, ya), w.pt(s1, 0, ya), w.pt(s1, -D, ya), w.pt(s0, -D, ya)], [0, 1, 0], WHITE);
      poly(hb, [w.pt(s0, 0, ya), w.pt(s0, -D, ya), w.pt(s0, -D, yb), w.pt(s0, 0, yb)], tn, WHITE);
      poly(hb, [w.pt(s1, 0, ya), w.pt(s1, -D, ya), w.pt(s1, -D, yb), w.pt(s1, 0, yb)], tm, WHITE);
      const uw = (s1 - s0 - mull * (split - 1)) / split, [u0, v0, u1, v1] = uvr(R[region], 1);
      for (let k = 0; k < split; k++) {
        const a = s0 + k * (uw + mull), b = a + uw, d = o.door ? -0.06 : -0.09;
        poly(hb, [w.pt(a, d, ya), w.pt(b, d, ya), w.pt(b, d, yb), w.pt(a, d, yb)], w.n, col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
        if (k) w.box(a - mull, a, -D, -0.02, ya, yb, WHITE);
      }
      const cw = o.casing || 0.1, ct = 0.03;
      w.box(s0 - cw, s0, 0, ct, ya - (o.door ? 0 : 0.02), yb, TRIM); w.box(s1, s1 + cw, 0, ct, ya - (o.door ? 0 : 0.02), yb, TRIM);
      w.box(s0 - cw - 0.03, s1 + cw + 0.03, 0, ct + 0.015, yb, yb + cw + 0.04, TRIM, true);
      if (!o.door) w.box(s0 - cw - 0.02, s1 + cw + 0.02, 0, 0.07, ya - 0.06, ya, TRIM, true);
    }
    // a surface-mounted window (gable ends, dormer face): sash quad just proud of the wall with a casing
    // ponytail: no recess (the triangles get no holes); cut one like opening() if these are ever seen up close
    function flatWindow(w, s0, s1, ya, yb, region, split = 1) {
      const [u0, v0, u1, v1] = uvr(R[region], 1), mull = 0.07, uw = (s1 - s0 - mull * (split - 1)) / split;
      for (let k = 0; k < split; k++) { const a = s0 + k * (uw + mull), b = a + uw; poly(hb, [w.pt(a, 0.02, ya), w.pt(b, 0.02, ya), w.pt(b, 0.02, yb), w.pt(a, 0.02, yb)], w.n, C(0xffffff), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]); if (k) w.box(a - mull, a, 0, 0.04, ya, yb, TRIM); }
      w.box(s0 - 0.09, s0, 0, 0.045, ya - 0.05, yb + 0.05, TRIM); w.box(s1, s1 + 0.09, 0, 0.045, ya - 0.05, yb + 0.05, TRIM);
      w.box(s0 - 0.12, s1 + 0.12, 0, 0.06, yb + 0.05, yb + 0.16, TRIM, true); w.box(s0 - 0.12, s1 + 0.12, 0, 0.07, ya - 0.1, ya - 0.05, TRIM, true);
    }
    // lattice panel, both faces, tiled per 0.9 m, with top and bottom rails
    function lattice(w, s0, s1, ya, yb, rails = true) {
      const [u0, v0, u1, v1] = uvr(R.LAT, 0.5), n = Math.max(1, Math.round((s1 - s0) / 0.9)), sl = (s1 - s0) / n, vt = v0 + (v1 - v0) * Math.min(1, (yb - ya) / 0.9);
      for (let k = 0; k < n; k++) { const a = s0 + k * sl, b = a + sl, uv = [[u0, v0], [u1, v0], [u1, vt], [u0, vt]];
        poly(hb, [w.pt(a, 0, ya), w.pt(b, 0, ya), w.pt(b, 0, yb), w.pt(a, 0, yb)], w.n, WHITE, uv); poly(hb, [w.pt(a, -0.01, ya), w.pt(b, -0.01, ya), w.pt(b, -0.01, yb), w.pt(a, -0.01, yb)], w.n.map((v) => -v), WHITE, uv); }
      if (rails) { w.box(s0, s1, -0.04, 0.05, yb, yb + 0.07, WHITE, true); w.box(s0, s1, -0.03, 0.04, ya - 0.02, ya + 0.05, WHITE); }
    }
    // gabled roof, ridge along a (alongA) or along b. s0..s1: ridge extent (rakes included); c0, c1: the two eave walls across; ye: wall top;
    // rise: ridge above the wall top; over: eave overhang. Shingles, fascia, soffits, barge boards, ridge cap; gutter: 'front' | 'both' | null
    function roof(alongA, s0, s1, c0, c1, ye, rise, over, o = {}) {
      const half = (c1 - c0) / 2, k = rise / half, cm = c0 + half, yr = ye + rise, L = Math.hypot(half + over, (half + over) * k), th = 0.12;
      const Q = (s, c, y) => alongA ? P(s, c, y) : P(c, s, y), Nn = (ds, dc, dy) => alongA ? N(ds, dc, dy) : N(dc, ds, dy), len = Math.hypot(1, k);
      const yo = ye - over * k, shade = o.col || ((p) => C(0xffffff).multiplyScalar(0.92 + 0.08 * Math.min(1, (p[1] - yo) / rise)));
      for (const sg of [-1, 1]) {
        const ce = sg < 0 ? c0 - over : c1 + over, n = Nn(0, sg * k / len, 1 / len), uv = (s, d) => [s / 2, d / 2];
        poly(rb, [Q(s0, ce, yo + th), Q(s1, ce, yo + th), Q(s1, cm, yr + th), Q(s0, cm, yr + th)], n, shade, [uv(s0, 0), uv(s1, 0), uv(s1, L), uv(s0, L)]);
        if (o.under) poly(hb, [Q(s0, ce, yo), Q(s1, ce, yo), Q(s1, cm, yr), Q(s0, cm, yr)], n.map((v) => -v), o.under);
        // fascia + soffit along the eave, barge boards along both rakes
        poly(hb, [Q(s0, ce, yo - 0.08), Q(s1, ce, yo - 0.08), Q(s1, ce, yo + th + 0.02), Q(s0, ce, yo + th + 0.02)], Nn(0, sg, 0), TRIM);
        if (!o.under) poly(hb, [Q(s0, ce, yo - 0.08), Q(s1, ce, yo - 0.08), Q(s1, sg < 0 ? c0 : c1, yo - 0.08), Q(s0, sg < 0 ? c0 : c1, yo - 0.08)], [0, -1, 0], TRIM);
        for (const se of [s0, s1]) { const so = se === s0 ? -1 : 1; poly(hb, [Q(se, ce, yo - 0.08), Q(se, cm, yr - 0.08), Q(se, cm, yr + th + 0.03), Q(se, ce, yo + th + 0.03)], Nn(so, 0, 0), TRIM); }
        if (o.gutter === 'both' || (o.gutter === 'front' && sg < 0)) {
          const gc = C(0xd8d9d6), gb = alongA ? [ce + sg * 0.13, ce].sort((p, q) => p - q) : null;
          if (alongA) box(s0 + 0.05, s1 - 0.05, gb[0], gb[1], yo - 0.1, yo + 0.04, gc, true); else { const ga = [ce + sg * 0.13, ce].sort((p, q) => p - q); box(ga[0], ga[1], s0 + 0.05, s1 - 0.05, yo - 0.1, yo + 0.04, gc, true); }
        }
        // ridge cap
        const rc = C(0x9a8f88); poly(rb, [Q(s0 - 0.02, cm, yr + th + 0.04), Q(s1 + 0.02, cm, yr + th + 0.04), Q(s1 + 0.02, cm + sg * 0.16, yr + th - 0.16 * k + 0.02), Q(s0 - 0.02, cm + sg * 0.16, yr + th - 0.16 * k + 0.02)], n, rc, [[0.1, 0.1], [0.3, 0.1], [0.3, 0.15], [0.1, 0.15]]);
      }
      // rake soffits (under the gable overhangs)
      if (o.rakes) for (const [sw, se] of o.rakes) for (const sg of [-1, 1]) { const ce = sg < 0 ? c0 - over : c1 + over; poly(hb, [Q(sw, ce, yo - 0.08), Q(se, ce, yo - 0.08), Q(se, cm, yr - 0.08), Q(sw, cm, yr - 0.08)], Nn(0, -sg * k / len, -1 / len), TRIM); }
      return { yr, k, at: (c) => ye + (half - Math.abs(c - cm)) * k };
    }
    // hip roof, same arguments as roof() with s0..s1 the wall extent along the ridge (put the ridge along the longer side; a square gives a pyramid).
    // Equal pitch all round; shingles, fascia, soffit, ridge cap. ponytail: no hip caps or gutters, add them like roof()'s ridge cap if seen up close
    function hip(alongA, s0, s1, c0, c1, ye, rise, over, o = {}) {
      const half = (c1 - c0) / 2, k = rise / half, cm = c0 + half, yr = ye + rise, th = 0.12, yo = ye - over * k, len = Math.hypot(1, k), L = (half + over) * len;
      const Q = (s, c, y) => alongA ? P(s, c, y) : P(c, s, y), Nn = (ds, dc, dy) => alongA ? N(ds, dc, dy) : N(dc, ds, dy), sm = (s0 + s1) / 2;
      const r0 = Math.min(s0 + half, sm), r1 = Math.max(s1 - half, sm), S = [s0 - over, s1 + over], Cc = [c0 - over, c1 + over], Y = yo + th, YR = yr + th;
      const shade = o.col || ((p) => C(0xffffff).multiplyScalar(0.92 + 0.08 * Math.min(1, (p[1] - yo) / rise))), rc = C(0x9a8f88);
      for (const sg of [-1, 1]) {
        const ce = Cc[(sg + 1) / 2], se = S[(sg + 1) / 2], re = sg < 0 ? r0 : r1, n = Nn(0, sg * k / len, 1 / len);
        poly(rb, [Q(S[0], ce, Y), Q(S[1], ce, Y), Q(r1, cm, YR), Q(r0, cm, YR)], n, shade, [[S[0] / 2, 0], [S[1] / 2, 0], [r1 / 2, L / 2], [r0 / 2, L / 2]]);
        poly(rb, [Q(se, Cc[0], Y), Q(se, Cc[1], Y), Q(re, cm, YR)], Nn(sg * k / len, 0, 1 / len), shade, [[Cc[0] / 2, 0], [Cc[1] / 2, 0], [cm / 2, L / 2]]);
        poly(hb, [Q(S[0], ce, yo - 0.08), Q(S[1], ce, yo - 0.08), Q(S[1], ce, Y + 0.02), Q(S[0], ce, Y + 0.02)], Nn(0, sg, 0), TRIM);
        poly(hb, [Q(se, Cc[0], yo - 0.08), Q(se, Cc[1], yo - 0.08), Q(se, Cc[1], Y + 0.02), Q(se, Cc[0], Y + 0.02)], Nn(sg, 0, 0), TRIM);
        if (r1 - r0 > 0.05) poly(rb, [Q(r0, cm, YR + 0.04), Q(r1, cm, YR + 0.04), Q(r1, cm + sg * 0.16, YR - 0.16 * k + 0.02), Q(r0, cm + sg * 0.16, YR - 0.16 * k + 0.02)], n, rc, [[0.1, 0.1], [0.3, 0.1], [0.3, 0.15], [0.1, 0.15]]);
      }
      poly(hb, [Q(S[0], Cc[0], yo - 0.08), Q(S[1], Cc[0], yo - 0.08), Q(S[1], Cc[1], yo - 0.08), Q(S[0], Cc[1], yo - 0.08)], [0, -1, 0], TRIM);
      return { yr, k };
    }
    // walls round a ring (local [[a, b], ...] counter-clockwise, e.g. K.fp(i).pts) from ya to yb, each edge a Seg (returned, in ring order).
    // o: { col, mat, base (siding course origin), win: { w, h, sills: [y, ...] one per storey, every (m of wall per window, default 3), region ('S1'|'S6'|'PANE'), split, min (shortest wall with windows) } }
    function walls(ring, ya, yb, o = {}) {
      const col = o.col || C(0xffffff), wn = o.win;
      return ring.map((p, i) => {
        const q = ring[(i + 1) % ring.length], w = Seg(p[0], p[1], q[0], q[1]), holes = [], n = wn && w.L >= (wn.min || 0) ? Math.floor(w.L / (wn.every || 3)) : 0;
        for (let k = 0; k < n; k++) for (const y of wn.sills) { const c = w.L * (k + 0.5) / n; holes.push([c - wn.w / 2, c + wn.w / 2, y, y + wn.h]); }
        wall(w, 0, w.L, ya, yb, holes, col, o.base, o.mat);
        for (const h of holes) opening(w, h[0], h[1], h[2], h[3], wn.region || 'S1', { split: wn.split });
        return w;
      });
    }
    // flat roof over a ring at height y: membrane (o.col) and a parapet o.parapet high (default 0.45; run the walls up to y + parapet) with a coping (o.coping)
    function flat(ring, y, o = {}) {
      const col = o.col || C(0x4a4a48), pp = o.parapet === undefined ? 0.45 : o.parapet;
      for (const t of T.ShapeUtils.triangulateShape(ring.map((q) => new T.Vector2(q[0], q[1])), [])) poly(hb, t.map((i) => P(ring[i][0], ring[i][1], y)), [0, 1, 0], col);
      if (pp > 0) ring.forEach((q, i) => { const r = ring[(i + 1) % ring.length], w = Seg(q[0], q[1], r[0], r[1]);
        poly(hb, [w.pt(0, -0.25, y), w.pt(w.L, -0.25, y), w.pt(w.L, -0.25, y + pp), w.pt(0, -0.25, y + pp)], w.n.map((v) => -v), o.wall || col);
        w.box(0, w.L, -0.3, 0.06, y + pp, y + pp + 0.08, o.coping || C(0xcfc8b8), true); });
    }
    // cornice on wall w: a projecting moulding from y to y + h, out from the wall, over s0..s1 (default a Seg's whole length) and past both ends to meet its neighbours
    function cornice(w, y, out, h, col = TRIM, s0 = 0, s1 = w.L) { w.box(s0 - out, s1 + out, 0, out, y + h * 0.45, y + h, col, true); w.box(s0 - out * 0.5, s1 + out * 0.5, 0, out * 0.5, y, y + h * 0.45, col, true); }
    // map footprint i in this frame: pts (counter-clockwise, edges under 5 cm dropped), its W.buildings record (lidar floorY, top, ridge, roof, wall colour), ground range
    function fp(i) {
      const raw = M.buildings[i].p, pts = [];
      for (let k = 0; k < raw.length; k += 2) { const q = toLocal(raw[k], -raw[k + 1]), l = pts[pts.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= 0.05) pts.push(q); }
      if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.05) pts.pop();
      let A = 0, lo = 1e9, hi = -1e9; pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length], g = G(p[0], p[1]); A += p[0] * q[1] - q[0] * p[1]; lo = Math.min(lo, g); hi = Math.max(hi, g); });
      if (A < 0) pts.reverse();
      return { pts, rec: W.buildings.find((r) => r.fp === i) || null, lo, hi };
    }
    const keep = [], drives = [], foot = [];
    const K = {
      P, N, G, C, poly, box, Wall, Seg, wall, skin, gable, opening, flatWindow, lattice, roof, hip, walls, flat, cornice, fp, toLocal, WHITE, TRIM, R, uvr, hb, rb,
      wallSeg: (a0, b0, a1, b1) => { const p = P(a0, b0, 0), q = P(a1, b1, 0); W.walls.push(p[0], p[2], q[0], q[2]); },
      circle: (a, b, r) => { const p = P(a, b, 0); W.obstacles.push(p[0], p[2], r); },
      keep: (a0, a1, b0, b1, to) => keep.push([a0, a1, b0, b1, to]),   // to: where a big tree found inside goes (default: just outside the nearest side)
      foot: (pts) => foot.push(pts),
      // asphalt strip along b: rows [b, aLeft, aRight] (the driveway follows the ground 6 cm up)
      drive(rows) {
        const [u0, v0, u1, v1] = uvr(R.ASP, 0.5), col = C(0xffffff);
        for (let i = 0; i < rows.length - 1; i++) {
          const r0 = rows[i], r1 = rows[i + 1], nb = Math.max(1, Math.ceil((r1[0] - r0[0]) / 1.5));
          for (let j = 0; j < nb; j++) {
            const f0 = j / nb, f1 = (j + 1) / nb, L = (f, k) => r0[k] + (r1[k] - r0[k]) * f, bA = L(f0, 0), bB = L(f1, 0), pts = [[L(f0, 1), bA], [L(f0, 2), bA], [L(f1, 2), bB], [L(f1, 1), bB]];
            poly(hb, pts.map((q) => P(q[0], q[1], G(q[0], q[1]) + 0.06)), [0, 1, 0], col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
          }
        }
        drives.push(rows);
      },
      // wooden privacy fence along a straight line (posts every 1.6 m), solid
      fence(a0, b0, a1, b1, h, hex) {
        const L = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(L / 1.6)), da = (a1 - a0) / L, db = (b1 - b0) / L, col = C(hex), [u0, v0, u1, v1] = uvr(R.FEN, 0.5), nrm = N(-db, da, 0);
        for (let k = 0; k < n; k++) {
          const sa = (k / n) * L, sb = ((k + 1) / n) * L, A = [a0 + da * sa, b0 + db * sa], Bp = [a0 + da * sb, b0 + db * sb], ga = G(A[0], A[1]), gb = G(Bp[0], Bp[1]);
          const pts = [P(A[0], A[1], ga - 0.1), P(Bp[0], Bp[1], gb - 0.1), P(Bp[0], Bp[1], gb + h), P(A[0], A[1], ga + h)], uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
          poly(hb, pts, nrm, col, uv); poly(hb, pts, nrm.map((v) => -v), col.clone().multiplyScalar(0.85), uv);
          box(A[0] - 0.05, A[0] + 0.05, A[1] - 0.05, A[1] + 0.05, ga - 0.1, ga + h + 0.06, col.clone().multiplyScalar(0.8));
        }
        K.wallSeg(a0, b0, a1, b1);
      },
      // a player-car model parked static, nose along (da, db); solid as two circles
      car(id, a, b, da, db) {
        const raw = window.DriftPhysics && DriftPhysics.CARS.find((c) => c.id === id); if (!raw || !B.buildCar) return null;
        const spec = DriftPhysics.makeCar(raw, false).spec;   // buildCar wants the resolved spec (axle offsets a, b)
        const tc = performance.now(), v = B.buildCar(spec), g = v.group, half = spec.wb / 2, gf = G(a + da * half, b + db * half), gr = G(a - da * half, b - db * half), p = P(a, b, (gf + gr) / 2 + 0.06), d = N(da, db, 0);
        g.rotation.order = 'YZX'; g.rotation.set(0, Math.atan2(-d[2], d[0]), Math.atan2(gf - gr, spec.wb)); g.position.set(p[0], p[1], p[2]);
        if (v.setLights) v.setLights(false);
        g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(g); K.result.carMs += performance.now() - tc;
        const off = spec.L / 2 - spec.W / 2, r = spec.W / 2 + 0.02; K.circle(a + da * off, b + db * off, r); K.circle(a - da * off, b - db * off, r);
        return g;
      },
    };
    K.result = { keep, drives, foot, carMs: 0 };
    return K;
  }

  // ---------- 124 W Indiana Ave: 1.5-storey cottage, navy lap siding, side-gabled shingle roof with a shed dormer, inset porch with lattice ----------
  // Frame: origin at the front-left (south-west) corner of the main block, a east along the street, b north. Measured from the owner's three
  // Street View frames against the game's lidar trees (the ivy-covered trunk in front of the west half, the tree at the east end of the porch).
  function house124(K) {
    const { P, G, C, box, Wall, wall, gable, opening, flatWindow, lattice, roof, WHITE, TRIM } = K;
    const NAVY = C(0x313d56), BRICK = C(0x5e3a30), CONC = C(0xa8a49b);
    // floors: the main block splits the ~1.1 m fall of its ground (east high, west low) so little brick shows on the low side and the
    // siding bottom (F - 0.3) dips ~0.4 m into the high back corner; the rear ell, one step up, sits on its own highest ground
    const ring = [[0, 0], [9.12, 0], [9.12, 8.8], [10, 8.8], [10, 13.6], [1.4, 13.6], [1.4, 8.8], [0, 8.8]];
    const range = (pts) => { let lo = 1e9, hi = -1e9; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; for (let t = 0; t < 1; t += 0.2) { const g = G(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t); lo = Math.min(lo, g); hi = Math.max(hi, g); } }); return [lo, hi]; };
    const [gMin, gMax] = range([[0, 0], [9.12, 0], [9.12, 8.8], [0, 8.8]]), gEll = range([[1.4, 8.8], [10, 8.8], [10, 13.6], [1.4, 13.6]]);
    const g00 = G(0, 0), F = (gMin + gMax) / 2 + 0.45, Fe = Math.max(F, gEll[1]), low = Math.min(gMin, gEll[0]) - 0.4;
    K.result.info = { floor: +F.toFixed(2), ellFloor: +Fe.toFixed(2), brickMax: +(F - 0.3 - gMin).toFixed(2), sidingBuried: +(gMax - F + 0.3).toFixed(2) };
    const Ye = F + 2.65, S0 = F - 0.3, SB = F - 1.5, porchY = F - 0.15;
    const ao = (p) => NAVY.clone().multiplyScalar(0.8 + 0.2 * Math.min(1, Math.max(0, (p[1] - F) / 1.6)));
    // --- main block 9.0 x 8.8 m; inset porch at the east end of the front (a 4.2..9.0, 2.3 deep)
    const front = Wall(true, 0, -1), back = Wall(true, 8.8, 1), west = Wall(false, 0, -1), east = Wall(false, 9, 1), pBack = Wall(true, 2.3, -1), pWest = Wall(false, 4.2, 1);
    const tri = [0.55, 3.55, F + 0.8, F + 2.1];
    wall(front, 0, 4.2, S0, Ye, [tri], ao, SB); opening(front, tri[0], tri[1], tri[2], tri[3], 'S6', { split: 3 });
    wall(pWest, 0, 2.3, porchY, Ye, [], ao, SB);
    const door = [4.6, 5.5, porchY + 0.02, porchY + 2.05], tall = [6.3, 6.98, F + 0.35, F + 2.1];
    wall(pBack, 4.2, 9, porchY, Ye, [door, tall], ao, SB);
    opening(pBack, door[0], door[1], door[2], door[3], 'DOOR', { door: true, col: C(0xd9a43c) }); opening(pBack, tall[0], tall[1], tall[2], tall[3], 'S1');
    const ew = [[3.2, 4.05, F + 0.75, F + 2.1], [6.0, 6.85, F + 0.75, F + 2.1]], ww = [[2.2, 3.05, F + 0.75, F + 2.1], [5.6, 6.45, F + 0.75, F + 2.1]];
    wall(east, 2.3, 8.8, S0, Ye, ew, ao, SB); for (const h of ew) opening(east, h[0], h[1], h[2], h[3], 'S1');
    wall(west, 0, 8.8, S0, Ye, ww, ao, SB); for (const h of ww) opening(west, h[0], h[1], h[2], h[3], 'S1');
    wall(back, 0, 9, S0, Ye, [], ao, SB);
    const main = roof(true, -0.3, 9.3, 0, 8.8, Ye, 2.3, 0.45, { gutter: 'front', rakes: [[-0.3, 0], [9, 9.3]] });
    gable(east, 0, 8.8, Ye, main.yr, NAVY, SB); gable(west, 0, 8.8, Ye, main.yr, NAVY, SB);
    flatWindow(east, 4.05, 4.75, Ye + 0.35, Ye + 1.3, 'S1'); flatWindow(west, 4.05, 4.75, Ye + 0.35, Ye + 1.3, 'S1');
    // foundation: brick under the walls, the concrete porch slab
    for (const [w, s0, s1] of [[front, 0, 4.2], [west, 0, 8.8], [back, 0, 9], [east, 2.3, 8.8]]) w.box(s0 - (w === front || w === back ? 0.02 : 0), s1, -0.05, 0.03, low, S0, BRICK);
    box(4.2, 9.12, -0.15, 2.3, low, porchY, CONC);
    // porch: corner boards, posts, header beams, ceiling, lattice front and east side, lantern
    for (const [a, b] of [[-0.03, -0.03], [-0.03, 8.83], [9.03, 8.83], [9.03, 2.27]]) box(a - 0.06, a + 0.06, b - 0.06, b + 0.06, S0, Ye, TRIM);
    box(4.06, 4.2, -0.06, 0.08, S0, Ye, TRIM);
    for (const a of [4.28, 6.62, 8.94]) box(a - 0.07, a + 0.07, -0.02, 0.12, porchY, Ye - 0.28, WHITE);
    box(4.2, 9.04, -0.04, 0.14, Ye - 0.3, Ye - 0.02, WHITE, true); box(8.86, 9.04, 0, 2.3, Ye - 0.3, Ye - 0.02, WHITE, true);
    K.poly(K.hb, [P(4.2, 0, Ye - 0.04), P(9, 0, Ye - 0.04), P(9, 2.3, Ye - 0.04), P(4.2, 2.3, Ye - 0.04)], [0, -1, 0], C(0xd9dbd8));
    lattice(Wall(true, 0.05, -1), 4.35, 6.55, porchY + 0.03, F + 0.85); lattice(Wall(true, 0.05, -1), 6.69, 8.87, porchY + 0.03, F + 0.85);
    lattice(Wall(false, 8.95, 1), 0.12, 2.25, porchY + 0.03, F + 0.85);
    pBack.box(5.72, 5.88, 0, 0.14, F + 1.72, F + 2.0, C(0x22201c), true); K.poly(K.hb, [pBack.pt(5.74, 0.145, F + 1.76), pBack.pt(5.86, 0.145, F + 1.76), pBack.pt(5.86, 0.145, F + 1.96), pBack.pt(5.74, 0.145, F + 1.96)], pBack.n, C(0xf0e2c0), [LITUV, LITUV, LITUV, LITUV]);
    // shed dormer on the front slope, left of centre
    { const d0 = 3.3, d1 = 4.9, bf = 1.5, yb = main.at(bf), yd = Ye + 1.85, ks = Math.tan(0.2), bm = (yd + 0.08 - Ye + bf * ks) / (main.k + ks), ym = Ye + bm * main.k, face = Wall(true, bf, -1);
      wall(face, d0, d1, yb - 0.05, yd, [[3.58, 4.62, yb + 0.22, yd - 0.18]], NAVY, SB); flatWindow(face, 3.58, 4.62, yb + 0.22, yd - 0.18, 'S1');
      for (const [a, s] of [[d0, -1], [d1, 1]]) { const pts = [P(a, bf, yb - 0.05), P(a, bf, yd), P(a, bm, ym)]; K.poly(K.hb, pts, K.N(s, 0, 0), NAVY, pts.map((p) => [32 / 512, (p[1] - SB) / 6])); }
      const len = Math.hypot(1, ks), n = K.N(0, -ks / len, 1 / len), L = Math.hypot(bm - bf + 0.25, (bm - bf + 0.25) * ks);
      K.poly(K.rb, [P(d0 - 0.15, bf - 0.25, yd + 0.13), P(d1 + 0.15, bf - 0.25, yd + 0.13), P(d1 + 0.15, bm, ym + 0.13), P(d0 - 0.15, bm, ym + 0.13)], n, C(0xf0f0f0), [[d0 / 2, 0], [d1 / 2, 0], [d1 / 2, L / 2], [d0 / 2, L / 2]]);
      box(d0 - 0.15, d1 + 0.15, bf - 0.27, bf - 0.2, yd - 0.05, yd + 0.15, TRIM, true);
      K.poly(K.hb, [P(d0 - 0.15, bf - 0.2, yd), P(d1 + 0.15, bf - 0.2, yd), P(d1 + 0.15, bf, yd), P(d0 - 0.15, bf, yd)], [0, -1, 0], TRIM);
      box(d0 - 0.05, d0 + 0.05, bf - 0.05, bf + 0.05, yb - 0.05, yd, TRIM); box(d1 - 0.05, d1 + 0.05, bf - 0.05, bf + 0.05, yb - 0.05, yd, TRIM); }
    // downspout at the front-left corner, from the gutter to a splash kick-out
    { const yo = Ye - 0.45 * main.k, gc = C(0xd8d9d6); box(0.05, 0.13, -0.6, -0.52, yo - 0.4, yo - 0.08, gc); box(0.05, 0.13, -0.6, -0.04, yo - 0.48, yo - 0.4, gc, true); box(0.05, 0.13, -0.12, -0.04, g00 + 0.08, yo - 0.4, gc); box(0.05, 0.13, -0.5, -0.04, g00 + 0.02, g00 + 0.1, gc); }
    // --- rear ell (one storey, gable to the east, sticks out 1 m past the main block toward the driveway): window and side door to the drive
    const e0 = 1.4, e1 = 10.0, f0 = 8.8, f1 = 13.6, Ye2 = Fe + 2.3, S0e = Fe - 0.3;
    const eE = Wall(false, e1, 1), eW = Wall(false, e0, -1), eN = Wall(true, f1, 1), eS = Wall(true, f0, -1);
    const ewin = [9.3, 10.2, Fe + 0.8, Fe + 2.0], edoor = [11.9, 12.75, Fe - 0.02, Fe + 1.98];
    wall(eE, f0, f1, S0e, Ye2, [ewin, edoor], ao, SB); opening(eE, ewin[0], ewin[1], ewin[2], ewin[3], 'S1'); opening(eE, edoor[0], edoor[1], edoor[2], edoor[3], 'DOOR', { door: true, col: C(0xf2f0ea) });
    wall(eW, f0, f1, S0e, Ye2, [[10.6, 11.4, Fe + 0.8, Fe + 2.0]], ao, SB); opening(eW, 10.6, 11.4, Fe + 0.8, Fe + 2.0, 'S1');
    wall(eN, e0, e1, S0e, Ye2, [[4.6, 5.4, Fe + 0.8, Fe + 2.0]], ao, SB); opening(eN, 4.6, 5.4, Fe + 0.8, Fe + 2.0, 'S1');
    wall(eS, 9.0, e1, S0e, Ye2, [], ao, SB);
    const ell = roof(true, e0 - 0.25, e1 + 0.25, f0, f1, Ye2, 1.45, 0.3, { gutter: 'both', rakes: [[e0 - 0.25, e0], [e1, e1 + 0.25]] });
    gable(eE, f0, f1, Ye2, ell.yr, NAVY, SB); gable(eW, f0, f1, Ye2, ell.yr, NAVY, SB);
    for (const [w, s0, s1] of [[eE, f0, f1], [eW, f0, f1], [eN, e0, e1], [eS, 9, e1]]) w.box(s0, s1, -0.05, 0.03, low, S0e, BRICK);
    for (const [a, b] of [[e1 + 0.03, f0 - 0.03], [e1 + 0.03, f1 + 0.03], [e0 - 0.03, f1 + 0.03]]) box(a - 0.06, a + 0.06, b - 0.06, b + 0.06, S0e, Ye2, TRIM);
    eE.box(13.0, 13.16, 0, 0.13, Fe + 1.85, Fe + 2.1, C(0x22201c), true);
    // --- carport over the end of the driveway: white posts, gabled roof with an open ceiling, lattice in the east gable and along the back
    const c0 = 10.5, c1 = 15.1, d0 = 12.6, d1 = 18.0, Ye3 = Math.max(G(c1, d0), G(c1, d1), G(c0, d1)) + 2.35;
    const cp = roof(true, c0, c1, d0, d1, Ye3, 0.9, 0.2, { under: C(0xcfc9bc) });
    for (const [a, b] of [[c0 + 0.1, d0 + 0.1], [c1 - 0.1, d0 + 0.1], [c0 + 0.1, d1 - 0.1], [c1 - 0.1, d1 - 0.1]]) { box(a - 0.07, a + 0.07, b - 0.07, b + 0.07, G(a, b) - 0.1, Ye3, WHITE); K.circle(a, b, 0.12); }
    box(c0, c1, d0 + 0.03, d0 + 0.17, Ye3 - 0.22, Ye3, WHITE, true); box(c0, c1, d1 - 0.17, d1 - 0.03, Ye3 - 0.22, Ye3, WHITE, true);
    { const w = Wall(false, c1 - 0.1, 1), [u0, v0, u1, v1] = K.uvr(K.R.LAT, 0.5), pts = [w.pt(d0, 0, Ye3), w.pt(d1, 0, Ye3), w.pt((d0 + d1) / 2, 0, cp.yr)], uvp = (p, i) => [u0 + (u1 - u0) * [0, 6, 3][i], v0 + (v1 - v0) * [0, 0, 1][i]];
      K.poly(K.hb, pts, w.n, WHITE, pts.map(uvp)); K.poly(K.hb, pts, w.n.map((v) => -v), WHITE, pts.map(uvp)); }
    lattice(Wall(true, d1 - 0.1, 1), c0 + 0.2, c1 - 0.2, Math.max(G(c0, d1), G(c1, d1)) + 0.05, Math.max(G(c0, d1), G(c1, d1)) + 1.85);
    // --- driveway: old asphalt from the street (mouth flared west) up under the carport
    const road = K.road, bS = road ? road.edge - 0.25 : -9.8;
    K.drive([[bS, 9.3, 15.3], [bS + 1.6, 10.6, 14.5], [bS + 3.2, 10.9, 14.0], [d1 - 0.2, 10.9, 14.0]]);
    // --- yard: landscaping timbers, three-head lamp post, mailbox at the road west of the drive mouth, privacy fences
    { const tc = C(0x786a5a); for (const [a0, a1, b0] of [[0.1, 1.5, -1.0], [1.5, 2.9, -1.0], [0.5, 1.9, -0.84], [1.9, 3.3, -0.84], [3.3, 4.6, -0.84], [3.0, 4.4, -1.0]]) { const g = Math.min(G(a0, b0), G(a1, b0)); box(a0, a1, b0, b0 + 0.14, g - 0.05, g + 0.1, b0 < -0.9 ? tc : tc.clone().multiplyScalar(0.85)); } }
    { const la = 1.8, lb = -6.0, gl = G(la, lb), bz = C(0x3a3029), glass = C(0xd9d3c4);
      box(la - 0.11, la + 0.11, lb - 0.11, lb + 0.11, gl - 0.1, gl + 0.3, bz); box(la - 0.045, la + 0.045, lb - 0.045, lb + 0.045, gl + 0.3, gl + 1.85, bz);
      box(la - 0.4, la + 0.4, lb - 0.025, lb + 0.025, gl + 1.72, gl + 1.77, bz, true);
      for (const [da, h0] of [[-0.36, 1.8], [0.36, 1.8], [0, 1.98]]) { const a = la + da, y = gl + h0;
        box(a - 0.02, a + 0.02, lb - 0.02, lb + 0.02, gl + 1.75, y, bz); const L = K.hb.uv.length; box(a - 0.06, a + 0.06, lb - 0.06, lb + 0.06, y + 0.02, y + 0.2, glass); for (let q = L; q < K.hb.uv.length; q += 2) { K.hb.uv[q] = LITUV[0]; K.hb.uv[q + 1] = LITUV[1]; }
        for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(a + sa * 0.06 - 0.012, a + sa * 0.06 + 0.012, lb + sb * 0.06 - 0.012, lb + sb * 0.06 + 0.012, y + 0.02, y + 0.2, bz);
        box(a - 0.09, a + 0.09, lb - 0.09, lb + 0.09, y + 0.2, y + 0.24, bz, true); box(a - 0.035, a + 0.035, lb - 0.035, lb + 0.035, y + 0.24, y + 0.31, bz); box(a - 0.07, a + 0.07, lb - 0.07, lb + 0.07, y - 0.01, y + 0.02, bz, true); }
      K.circle(la, lb, 0.16); }
    { const ma = 9.9, mb = road ? road.edge + 4.5 : -5.9, gm = G(ma, mb), wood = C(0x8a7458), mc = C(0xd7d8d4);
      box(ma - 0.045, ma + 0.045, mb - 0.045, mb + 0.045, gm - 0.1, gm + 1.02, wood); box(ma - 0.04, ma + 0.04, mb - 0.32, mb + 0.1, gm + 0.94, gm + 1.02, wood, true);
      box(ma - 0.1, ma + 0.1, mb - 0.5, mb + 0.02, gm + 1.02, gm + 1.2, mc, true); box(ma - 0.07, ma + 0.07, mb - 0.5, mb + 0.02, gm + 1.2, gm + 1.25, mc); }
    K.fence(10.0, 18.35, 26.0, 18.35, 1.8, 0xa69882); K.fence(-0.1, 3.2, -5.7, 3.2, 1.7, 0x7b6a58);
    // --- the owner's car: the game's white Dodge Dart, nose to the north beside the house
    K.car('dart', 12.35, 4.6, 0, 1);
    // --- solids, tree keep-outs, minimap footprint
    const outline = ring;
    outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length]; K.wallSeg(p[0], p[1], q[0], q[1]); });
    K.keep(-0.2, 9.3, -0.3, 8.9); K.keep(e0, e1, f0, f1); K.keep(c0, c1, d0, d1); K.keep(10.9, 14.0, bS, d1, [10.1, 0.6]);   // the big tree in the drive stands at the porch's east end in the photos
    K.foot(outline); K.foot([[c0, d0], [c1, d0], [c1, d1], [c0, d1]]);
  }

  const HEROES = [
    { id: 'house124', name: '124 W Indiana Ave', at: [-203.8, 185.5], build: house124 },
  ];
  // plug-ins: the footprints they model are taken off buildings.js's and landmarks.js's hands now, before the world is built
  B.heroSkip = new Set([...(B.heroSkip || []), ...(B.heroPlugins || []).flatMap((p) => p.footprints || [])]);

  // brick (running bond, 0.2 x 0.067 m) and Indiana limestone ashlar (0.4 m courses), 2 x 2 m each, in colour; made only when a hero uses them
  function masonry(U, stone) {
    const rng = U.mulberry(stone ? 77 : 78);
    return U.canvasTex(512, 512, (g) => {
      g.fillStyle = stone ? '#968e80' : '#a39d92'; g.fillRect(0, 0, 512, 512);
      const rows = stone ? 5 : 30, rh = 512 / rows, C = stone ? ['#d3cab6', '#cbc2ad', '#dad2bf', '#c6bea9', '#d0c8b6'] : ['#8c4a3a', '#7a4034', '#934f3c', '#84453a', '#6f3a2f', '#9a5a44'];
      for (let i = 0; i < rows; i++) {
        const o = stone ? rng() * 512 : (i & 1) * 25.6, j = stone ? 2 : 3;   // each course is shifted by o and wraps round, so the tile repeats
        for (let x = 0; x < 511;) {
          let w = stone ? 150 + rng() * 160 : 51.2; if (stone && 512 - x - w < 120) w = 512 - x;
          g.fillStyle = C[rng() * C.length | 0]; for (const d of [o, o - 512]) g.fillRect(x + d + j / 2, i * rh + j / 2, w - j, rh - j);
          for (let k = 0; k < (stone ? 60 : 6); k++) { g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; g.fillRect((x + o + rng() * w) % 512, i * rh + rng() * rh, 2, 2); }
          x += w;
        }
      }
    }, true);
  }

  B.buildHeroes = function ({ scene, W, M = window.BLOOMFIELD }) {
    const U = B.util, t0 = performance.now(), tex = textures(U), texMs = performance.now() - t0, bufs = { h: U.Buf(), r: U.Buf(), brick: U.Buf(), stone: U.Buf() }, stats = [];
    const mat = new T.MeshLambertMaterial({ vertexColors: true, map: tex.atlas, alphaTest: 0.5, emissiveMap: tex.glow, emissive: new T.Color(0, 0, 0) });
    const roofMat = new T.MeshLambertMaterial({ vertexColors: true, map: tex.roof });
    const drives = [];
    const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return v[0] < 0 ? [-v[0] / l, -v[1] / l] : [v[0] / l, v[1] / l]; }, nIdx = () => bufs.h.idx.length + bufs.r.idx.length + bufs.brick.idx.length + bufs.stone.idx.length;
    for (const hero of HEROES.concat(B.heroPlugins || [])) {
      // a hero that throws (here or in its build) is dropped whole, its half-built geometry cut off, so the others still load
      const h0 = performance.now(), i0 = nIdx(), lens = Object.values(bufs).map((b) => Object.values(b).map((v) => v.length)); let K, e;
      try {
        const fp0 = hero.footprints && hero.footprints.length ? M.buildings[hero.footprints[0]].p : null;
        for (const i of hero.footprints || []) if (!B.heroSkip.has(i)) console.warn('hero ' + hero.id + ': footprint ' + i + ' was drawn procedurally too (load the plug-in before heroes.js)');
        // the frame: hero.dir, else a footprint's longest edge, else the nearest street; origin hero.at, else the footprint's corner (min a, min b) in that frame
        e = hero.dir ? unit(hero.dir) : null;
        if (!e && fp0) { let best = 0; for (let k = 0; k < fp0.length; k += 2) { const j = (k + 2) % fp0.length, d = [fp0[j] - fp0[k], fp0[j + 1] - fp0[k + 1]], L = Math.hypot(d[0], d[1]); if (L > best) { best = L; e = unit(d); } } }
        if (!hero.at) { let a0 = 1e9, b0 = 1e9; for (let k = 0; k < fp0.length; k += 2) { a0 = Math.min(a0, fp0[k] * e[0] + fp0[k + 1] * e[1]); b0 = Math.min(b0, -fp0[k] * e[1] + fp0[k + 1] * e[0]); } hero.at = [a0 * e[0] - b0 * e[1], a0 * e[1] + b0 * e[0]]; }
        // the kit also tells the builder where the nearest street's edge is (in b)
        const r = W.nearestRoad(hero.at[0], -hero.at[1], 60);
        if (!e) e = r ? unit([r.tx, -r.tz]) : [1, 0];
        hero.e = e;
        K = makeKit(W, U, hero, bufs, scene, M);
        if (r) { const rl = K.toLocal(r.x, r.z); K.road = { edge: rl[1] + Math.sign(-rl[1]) * r.hw, name: r.name }; }
        hero.build(K);
      } catch (err) { console.error('hero ' + hero.id + ' failed', err); Object.values(bufs).forEach((b, i) => Object.values(b).forEach((v, j) => { v.length = lens[i][j]; })); continue; }
      const { keep, foot } = K.result; let moved = 0, cleared = 0;
      // lidar trees standing inside a keep-out, tallest first: a big one steps to the keep-out's target (or just outside it) unless a trunk
      // already stands within 3 m there (their crowns really overhang the lot); the rest go
      const inside = (a, b, m) => keep.some((q) => a > q[0] - m && a < q[1] + m && b > q[2] - m && b < q[3] + m), ob = W.obstacles, hits = [];
      const trunk = (X, Z) => { for (let q = 0; q < ob.length; q += 3) if (Math.abs(ob[q] - X) < 0.02 && Math.abs(ob[q + 1] - Z) < 0.02 && Math.abs(ob[q + 2] - 0.45) < 1e-3) return q; return -1; };
      const crowded = (p, self) => { for (let q = 0; q < ob.length; q += 3) if (q !== self && Math.abs(ob[q + 2] - 0.45) < 1e-3 && Math.hypot(ob[q] - p[0], ob[q + 1] - p[2]) < 3) return true; return false; };
      for (const c of W.treeChunks || []) {
        if (Math.abs(c.cx - hero.at[0]) > c.hs + 80 || Math.abs(c.cz + hero.at[1]) > c.hs + 80) continue;
        const m = c.near.instanceMatrix.array;
        for (let k = 0; k < c.n; k++) { const X = m[16 * k + 12], Z = m[16 * k + 14], [a, b] = K.toLocal(X, Z); if (m[16 * k + 5] > 0 && inside(a, b, 0.6)) hits.push({ c, k, X, Z, a, b, h: m[16 * k + 5] }); }
      }
      hits.sort((p, q) => q.h - p.h);
      for (const { c, k, X, Z, a, b, h } of hits) {
        const oi = trunk(X, Z); let to = null;
        if (h > 12) { const q = keep.find((q) => a > q[0] - 0.6 && a < q[1] + 0.6 && b > q[2] - 0.6 && b < q[3] + 0.6);
          const opts = (q[4] ? [q[4]] : [[q[0] - 1, b], [q[1] + 1, b], [a, q[2] - 1], [a, q[3] + 1]]).filter((p) => !inside(p[0], p[1], 0.6)).map((p) => K.P(p[0], p[1], 0))
            .filter((p) => !crowded(p, oi)).sort((p, s) => Math.hypot(p[0] - X, p[2] - Z) - Math.hypot(s[0] - X, s[2] - Z));
          if (opts.length) to = opts[0]; }
        for (const im of [c.near, c.far]) { const a2 = im.instanceMatrix.array;
          if (to) { a2[16 * k + 12] = to[0]; a2[16 * k + 13] = W.heightXZ(to[0], to[2]) - 0.3; a2[16 * k + 14] = to[2]; } else a2.fill(0, 16 * k, 16 * k + 16);
          im.instanceMatrix.needsUpdate = true; }
        // ponytail: a cleared trunk's 0.45 m circle is parked inside the first keep-out (the house), not removed, so other modules' index ranges into W.obstacles stay valid
        if (oi >= 0) { if (to) { ob[oi] = to[0]; ob[oi + 1] = to[2]; } else { const p = K.P((keep[0][0] + keep[0][1]) / 2, (keep[0][2] + keep[0][3]) / 2, 0); ob[oi] = p[0]; ob[oi + 1] = p[2]; } }
        if (to) moved++; else cleared++;
      }
      // minimap: the footprint in the building colour, the driveway in the service-road colour
      if (W.mapCanvas) { const g = W.mapCanvas.getContext('2d'), s = W.mapScale, Hf = W.HALF, path = (pts) => { g.beginPath(); pts.forEach((q, i) => { const p = K.P(q[0], q[1], 0); g[i ? 'lineTo' : 'moveTo']((p[0] + Hf) * s, (p[2] + Hf) * s); }); g.closePath(); };
        g.fillStyle = '#cdbfa0'; for (const rows of K.result.drives) { path([...rows.map((r) => [r[1], r[0]]), ...rows.slice().reverse().map((r) => [r[2], r[0]])]); g.fill(); }
        g.fillStyle = '#5b4a40'; for (const f of foot) { path(f); g.fill(); } }
      for (const rows of K.result.drives) drives.push({ x0: hero.at[0], y0: hero.at[1], ex: e[0], ey: e[1], rows });
      stats.push({ id: hero.id, frame: [hero.at[0], hero.at[1], +e[0].toFixed(4), +e[1].toFixed(4)], tris: (nIdx() - i0) / 3, ms: +(performance.now() - h0 - K.result.carMs).toFixed(1), carMs: +K.result.carMs.toFixed(1), treesMoved: moved, treesCleared: cleared, info: K.result.info });
    }
    // meshes: one for the facades + ground pieces, one for the roofs
    const house = new T.Mesh(U.bufGeo(bufs.h), mat), roofs = new T.Mesh(U.bufGeo(bufs.r), roofMat);
    house.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex.atlas, alphaTest: 0.5 });
    for (const m of [house, roofs]) { m.castShadow = m.receiveShadow = true; m.name = 'heroes'; scene.add(m); }
    for (const k of ['brick', 'stone']) if (bufs[k].idx.length) { const m = new T.Mesh(U.bufGeo(bufs[k]), new T.MeshLambertMaterial({ vertexColors: true, map: masonry(U, k === 'stone') })); m.castShadow = m.receiveShadow = true; m.name = 'heroes'; scene.add(m); }
    // driveways are asphalt to the tyres; the windows and lamps light up with the town's
    if (drives.length) { const s0 = W.surface; W.surface = (X, Z) => { for (const d of drives) { const dx = X - d.x0, dy = -Z - d.y0, a = dx * d.ex + dy * d.ey, b = dy * d.ex - dx * d.ey, r = d.rows; if (b < r[0][0] || b > r[r.length - 1][0]) continue;
      for (let i = 0; i < r.length - 1; i++) if (b <= r[i + 1][0]) { const f = (b - r[i][0]) / (r[i + 1][0] - r[i][0] || 1); if (a >= r[i][1] + (r[i + 1][1] - r[i][1]) * f && a <= r[i][2] + (r[i + 1][2] - r[i][2]) * f) return 1; break; } }
      return s0(X, Z); }; }
    const g0 = W.windowGlow; W.windowGlow = (v) => { if (g0) g0(v); mat.emissive.setScalar(v); };
    W.heroes = stats; stats.ms = +(performance.now() - t0).toFixed(1); stats.texMs = +texMs.toFixed(1);
  };
})();
