/* Bloomfield Drift — landmarks add-on (BD.buildLandmarks({ scene, W, M })): detail hung on the real footprints and named places.
   Adds: fascia signs with the real business names (M.places) on the wall that faces the street; shop fronts, awnings and
   cornices on the downtown blocks; cased doors, stoops, porches and chimneys on the houses; steeples on the churches; school
   flagpoles; backstops, skinned infields and bleachers on the ball diamonds and fenced courts in the park; a picnic shelter
   and playground; the pool; fuel canopies and tall pole signs; the water tank, silos, transmission line, phone mast,
   substation and cemetery from the map's areas and poles; the courthouse portico and flagpole; Apple Festival
   stall names and parking signs. Heights and roof shapes are read from W.buildings (lidar), never guessed.
   Draws as: vertex-coloured chunks (1 km cells, hidden beyond ~900 m) + one always-on mesh for tall landmarks, one mesh on a
   single 2048 px atlas (all lettering, clock faces, chain-link), ground pads, wires and flags (the only per-frame work).
   Footprints in BD.heroSkip (drawn by hand by heroes.js plug-ins) get none of the props above (signs, doors, shop fronts, awnings,
   cornices, chimneys, porches, steeples, the courthouse portico). Solids go on W.obstacles / W.walls before the game builds collision. Reads no settings, makes no DOM, emits no events.
   Leaves W.landmarks = { counts by name, tris: { per section }, triangles, skipped: [why], unsigned: [why],
   obstacles: [from, to), walls: [from, to) } (ranges of this module's entries in W.obstacles / W.walls, in items).
   Three repairs to what the world already drew are marked "ponytail" below: the roof world.js puts on the round water tank is
   collapsed, the trees the lidar "found" inside the lattice towers, the mast and the substation are zeroed, and world.js's low
   roadside name board is removed wherever a pole sign carries the same name. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  B.buildLandmarks = function ({ scene, W, M }) {
    const T = THREE, U = B.util, hAt = W.heightXZ, rnd = U.mulberry(1877), TAU = Math.PI * 2;
    const stats = { unsigned: [], skipped: [], tris: {}, obstacles: [W.obstacles.length / 3], walls: [W.walls.length / 4] }, count = (k, n) => { stats[k] = (stats[k] || 0) + (n === undefined ? 1 : n); };
    const cc = {}, C = (hex) => cc[hex] || (cc[hex] = U.lin(hex)), pick = (a) => a[rnd() * a.length | 0];
    const STEEL = C(0x8d9396), CONC = C(0x9a968c), WHITE = C(0xf1eee4), DARK = C(0x23201e);

    // ---------- geometry buffers: chunked detail + one "big" buffer for landmarks seen from across town ----------
    const CELL = 1025, chunks = new Map(), big = U.Buf(), padBuf = U.Buf(); let cur = big;
    const at = (X, Z, b) => { const k = Math.floor((X + W.HALF) / CELL) * 8 + Math.floor((Z + W.HALF) / CELL); cur = chunks.get(k); if (!cur) chunks.set(k, cur = U.Buf()); if (b && hero(b)) cur = junk; };
    // a footprint a hero building draws by hand (BD.heroSkip, filled by heroes.js plug-ins): its props are laid out as usual (same random sequence and
    // claimed ground, so every other building keeps its props) into a buffer that is never drawn, and add no solids
    const junk = U.Buf(), hero = (b) => !!(B.heroSkip && B.heroSkip.has(b.fp));
    // flat polygon (fan). Either winding works: the material is double-sided and the normal follows the winding. c may be a [bottom, top] pair for a quad
    function face(c, ...p) {
      const v = cur.pos.length / 3, a = p[0], b = p[1], d = p[p.length - 1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, il = 1 / (Math.hypot(nx, ny, nz) || 1);
      for (let k = 0; k < p.length; k++) { const q = p[k], e = c.length ? c[k >> 1 ? 1 : 0] : c; cur.pos.push(q[0], q[1], q[2]); cur.nor.push(nx * il, ny * il, nz * il); cur.col.push(e.r, e.g, e.b); }
      for (let k = 2; k < p.length; k++) cur.idx.push(v, v + k - 1, v + k);
    }
    // box with the centre of its base at (x, y, z): w along the unit vector (ux, uz), d across it, h tall. t scales the top (0 = pyramid). No bottom face
    function box(c, x, y, z, w, h, d, ux, uz, t) {
      if (ux === undefined) { ux = 1; uz = 0; } if (t === undefined) t = 1;
      const P = (a, b, s, yy) => [x + (ux * a * w - uz * b * d) * s / 2, yy, z + (uz * a * w + ux * b * d) * s / 2], Q = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const lo = Q.map((q) => P(q[0], q[1], 1, y)), hi = Q.map((q) => P(q[0], q[1], t, y + h));
      for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; if (t) face(c, lo[k], lo[j], hi[j], hi[k]); else face(c, lo[k], lo[j], hi[0]); }
      if (t) face(c, hi[0], hi[1], hi[2], hi[3]);
    }
    // square bar of thickness t between two points (no end caps)
    function beam(c, a, b, t) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; let px = -dz, pz = dx; const pl = Math.hypot(px, pz);
      if (pl < 1e-4) { px = t / 2; pz = 0; } else { px *= t / 2 / pl; pz *= t / 2 / pl; }
      const qx = dy * pz / L, qy = (dz * px - dx * pz) / L, qz = -dy * px / L, K = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      const E = (e) => K.map((k) => [e[0] + px * k[0] + qx * k[1], e[1] + qy * k[1], e[2] + pz * k[0] + qz * k[1]]), A0 = E(a), B0 = E(b);
      for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; face(c, A0[k], A0[j], B0[j], B0[k]); }
    }
    // surface of revolution about the vertical through (x, z): prof = [[radius, height above y], ...] bottom to top, smooth shaded
    function lathe(c, x, y, z, prof, n) {
      const v = cur.pos.length / 3, m = prof.length;
      for (let i = 0; i < m; i++) {
        const a = prof[Math.max(0, i - 1)], b = prof[Math.min(m - 1, i + 1)], tr = b[0] - a[0], ty = b[1] - a[1], il = 1 / (Math.hypot(tr, ty) || 1);
        for (let j = 0; j <= n; j++) { const cs = Math.cos(j / n * TAU), sn = Math.sin(j / n * TAU); cur.pos.push(x + prof[i][0] * cs, y + prof[i][1], z + prof[i][0] * sn); cur.nor.push(ty * il * cs, -tr * il, ty * il * sn); cur.col.push(c.r, c.g, c.b); }
      }
      for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) { const a = v + i * (n + 1) + j, b = a + n + 1; cur.idx.push(a, b, b + 1, a, b + 1, a + 1); }
    }

    // ---------- one atlas for every word, clock face and fence panel ----------
    const AS = 2048, slots = [], A = U.Buf(); let sx = 0, sy = 0, sh = 0;
    function slot(w, h, draw) {   // reserve a cell; returns [u0, v0, u1, v1]
      if (sx + w > AS) { sx = 0; sy += sh; sh = 0; }
      slots.push({ x: sx, y: sy, w, h, draw }); const uv = [(sx + 2) / AS, 1 - (sy + h - 2) / AS, (sx + w - 2) / AS, 1 - (sy + 2) / AS];
      sx += w; sh = Math.max(sh, h); return uv;
    }
    // textured quad: corners bottom-left, bottom-right, top-right, top-left as seen from the side the normal points to
    function tq(uv, p0, p1, p2, p3, nx, nz) { const o = cur === junk ? junk : A, v = o.pos.length / 3; o.pos.push(...p0, ...p1, ...p2, ...p3); for (let k = 0; k < 4; k++) o.nor.push(nx, 0, nz); o.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]); o.idx.push(v, v + 1, v + 2, v, v + 2, v + 3); }
    // upright sign face centred on (x, y, z) looking along (nx, nz); a viewer's right is (nz, -nx), so text is never mirrored
    function plate(uv, x, y, z, nx, nz, w, h) { const rx = nz * w / 2, rz = -nx * w / 2; tq(uv, [x - rx, y - h / 2, z - rz], [x + rx, y - h / 2, z + rz], [x + rx, y + h / 2, z + rz], [x - rx, y + h / 2, z - rz], nx, nz); }
    const KIND = [[/church|chapel|baptist/i, '#f4f1e8', '#1d2a3a'], [/school|library|courthouse|police|fire|park|pool|postal|legion/i, '#2f4a36', '#f6ead3'], [/bank/i, '#1d2f4f', '#f6ead3'], [/pizza|dairy|subway|cafe|china|casa|ribeye|bakery|feed store beer/i, '#b3261e', '#fff4d6'], [/./, '#f2c230', '#1b1a1c']];
    const cells = {};
    function nameCell(name) {   // 4:1 name board in the colours of the place's trade (same scheme as the roadside signs)
      if (cells[name]) return cells[name];
      const k = KIND.find((q) => q[0].test(name)), words = name.split(' '), half = Math.ceil(words.length / 2), lines = name.length > 15 && words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [name];
      return (cells[name] = slot(400, 100, (g, w, h) => { g.fillStyle = k[1]; g.fillRect(0, 0, w, h); g.strokeStyle = k[2]; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = k[2]; lines.forEach((t, i) => { U.fit(g, t, w - 34, lines.length > 1 ? 40 : 58, U.SIGN_FONT); g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 40 + 2); }); }));
    }
    const FENCE = slot(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#c3c9cd'; g.lineWidth = 1.5; g.beginPath(); for (let k = -h; k < w + h; k += 12) { g.moveTo(k, 0); g.lineTo(k + h, h); g.moveTo(k, h); g.lineTo(k + h, 0); } g.stroke(); g.fillStyle = '#9aa1a5'; g.fillRect(0, 2, w, 6); g.fillRect(0, 0, 6, h); });
    const CLOCK = slot(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#2b2623'; g.beginPath(); g.arc(w / 2, h / 2, 122, 0, 7); g.fill(); g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(w / 2, h / 2, 108, 0, 7); g.fill(); g.strokeStyle = g.fillStyle = '#1b1a1c'; g.lineCap = 'round';
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, r0 = k % 3 ? 90 : 78; g.lineWidth = k % 3 ? 5 : 10; g.beginPath(); g.moveTo(w / 2 + Math.sin(a) * r0, h / 2 - Math.cos(a) * r0); g.lineTo(w / 2 + Math.sin(a) * 100, h / 2 - Math.cos(a) * 100); g.stroke(); }
      for (const [a, r, lw] of [[10.17 / 12 * TAU, 56, 12], [2 / 12 * TAU, 86, 8]]) { g.lineWidth = lw; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.sin(a) * r, h / 2 - Math.cos(a) * r); g.stroke(); } g.beginPath(); g.arc(w / 2, h / 2, 9, 0, 7); g.fill(); });
    const FLAG = slot(256, 160, (g, w, h) => { for (let k = 0; k < 13; k++) { g.fillStyle = k % 2 ? '#f4f1e8' : '#b22234'; g.fillRect(0, k * h / 13, w, h / 13 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.42, h * 7 / 13 + 1); g.fillStyle = '#f4f1e8'; for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(12 + i * 17 + (j % 2) * 4, 10 + j * 17, 3.4, 0, 7); g.fill(); } });

    let seen = 0; const done = (k) => { let n = big.idx.length + A.idx.length + padBuf.idx.length; for (const b of chunks.values()) n += b.idx.length; stats.tris[k] = n / 3 - seen; seen = n / 3; };   // triangles per section, for the budget

    // ---------- where things may stand ----------
    const HC = 16, hash = new Map();
    function mark(X, Z, r) { const k = Math.floor(X / HC) * 4096 + Math.floor(Z / HC); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(X, Z, r); }
    for (let k = 0; k < W.obstacles.length; k += 3) mark(W.obstacles[k], W.obstacles[k + 1], W.obstacles[k + 2]);
    function solid(X, Z, r) { if (cur !== junk) W.obstacles.push(X, Z, r); mark(X, Z, r); }
    // is a disc clear of everything already standing (trees, posts, earlier landmarks)?
    function empty(X, Z, r) {
      for (let i = Math.floor((X - r - 4) / HC); i <= Math.floor((X + r + 4) / HC); i++) for (let j = Math.floor((Z - r - 4) / HC); j <= Math.floor((Z + r + 4) / HC); j++) { const a = hash.get(i * 4096 + j); if (a) for (let k = 0; k < a.length; k += 3) if (Math.hypot(a[k] - X, a[k + 1] - Z) < r + a[k + 2]) return false; }
      return true;
    }
    // may a solid disc stand here? grass or off-road pavement only (att: or against a building), inside the play area, its edge 0.8 m clear of any road.
    // nearestRoad measures to samples 5 m apart, so allow for a sample sitting 2.5 m along the road from the true nearest point
    function ok(X, Z, r, att) {
      if (Math.abs(X) > W.PLAY - r - 1 || Math.abs(Z) > W.PLAY - r - 1) return false;
      for (let a = 0; a < 9; a++) { const q = a < 8 ? r + 1 : 0, m = W.maskAt(X + Math.cos(a * 0.7854) * q, Z + Math.sin(a * 0.7854) * q); if (m !== 0 && m !== 5 && !(att && m === 4)) return false; }
      const rd = W.nearestRoad(X, Z, 40); return !rd || Math.sqrt(Math.max(0, rd.d * rd.d - 6.25)) - rd.hw - r > 0.8;
    }
    // grid of points (2 m or finer) over a rectangle: centre, unit axis, half length along it, half depth across
    function grid(cx, cz, ux, uz, hw, hd) { const o = [], nu = Math.ceil(hw), nv = Math.ceil(hd); for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const a = -hw + 2 * hw * i / nu, b = -hd + 2 * hd * j / nv; o.push([cx + ux * a - uz * b, cz + uz * a + ux * b]); } return o; }
    const okRect = (cx, cz, ux, uz, hw, hd) => grid(cx, cz, ux, uz, hw, hd).every((p) => ok(p[0], p[1], 0.6) && empty(p[0], p[1], 1.6));
    const claim = (cx, cz, ux, uz, hw, hd) => grid(cx, cz, ux, uz, hw, hd).forEach((p) => mark(p[0], p[1], 1.5));
    function wallRect(cx, cz, ux, uz, hw, hd) { const q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => [cx + ux * p[0] - uz * p[1], cz + uz * p[0] + ux * p[1]]); for (let k = 0; k < 4; k++) W.walls.push(q[k][0], q[k][1], q[(k + 1) % 4][0], q[(k + 1) % 4][1]); claim(cx, cz, ux, uz, hw, hd); }
    // first point on rings spreading out from (x0, z0) that passes the test
    function spot(x0, z0, maxR, test) { for (let r = 0; r <= maxR; r += 2) for (let a = 0, n = r ? Math.ceil(r * 3) : 1; a < n; a++) { const X = x0 + Math.cos(a / n * TAU) * r, Z = z0 + Math.sin(a / n * TAU) * r; if (test(X, Z)) return [X, Z]; } return null; }
    const post = (X, Z) => ok(X, Z, 0.4) && empty(X, Z, 1.5);

    // ---------- polygons ----------
    const ring = (p) => { const o = []; for (let k = 0; k < p.length; k += 2) o.push([p[k], -p[k + 1]]); return o; };   // map polygon -> world [X, Z]
    const inRing = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const segD = (x, z, p, q) => { const ex = q[0] - p[0], ez = q[1] - p[1], t = U.clamp(((x - p[0]) * ex + (z - p[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1); return Math.hypot(x - p[0] - ex * t, z - p[1] - ez * t); };
    const ringD = (pts, x, z) => { if (inRing(pts, x, z)) return 0; let d = 1e9; for (let k = 0; k < pts.length; k++) d = Math.min(d, segD(x, z, pts[k], pts[(k + 1) % pts.length])); return d; };
    const mid = (pts) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, x0, x1, z0, z1, r: Math.max(x1 - x0, z1 - z0) / 2 }; };
    // tightest bounding rectangle (same search as world.js uses for roofs): centre, unit long axis, half length, half width
    function rect(pts) {
      let best = null;
      for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1) continue; const dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const s of pts) { const u = s[0] * dx + s[1] * dz, v = -s[0] * dz + s[1] * dx; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); } const ar = (a1 - a0) * (b1 - b0); if (!best || ar < best.ar) best = { ar, dx, dz, a0, a1, b0, b1 }; }
      if (!best) return null;
      let { dx, dz, a0, a1, b0, b1 } = best, ha = (a1 - a0) / 2, hb = (b1 - b0) / 2; const mu = (a0 + a1) / 2, mv = (b0 + b1) / 2, ox = mu * dx - mv * dz, oz = mu * dz + mv * dx;
      if (hb > ha) { [ha, hb] = [hb, ha]; [dx, dz] = [-dz, dx]; }
      return { ox, oz, dx, dz, ha, hb };
    }
    // the measured roof as world.js builds it over the bounding rectangle: ridge along (ax, az) through the centre, half length ra, half span rb,
    // eaves 0.4 m out at b.top, ridge at b.ridge; hips slope in from the ends. ponytail: mirrors world.js; read it from W if the model ever exposes its roof planes
    const rcache = new Map();
    function roofOf(b) {
      let r = rcache.get(b); if (r !== undefined) return r; const rc = rect(b.pts);
      if (rc) { const x = b.roof === 2, ra = x ? rc.hb : rc.ha, rb = x ? rc.ha : rc.hb; r = { ox: rc.ox, oz: rc.oz, ax: x ? -rc.dz : rc.dx, az: x ? rc.dx : rc.dz, ra, rb, hip: b.kind === 'court' ? rb * 0.8 : b.roof === 3 ? Math.min(rb, ra * 0.85) : 0 }; } else r = null;
      rcache.set(b, r); return r;
    }
    function roofY(b, X, Z) {   // height of the roof surface over (X, Z)
      const y = b.roofAt ? b.roofAt(X, Z) : null; if (y !== null) return y;   // the lidar roof as buildings.js built it; the rectangle model below only where that has no answer
      const r = roofOf(b); if (!r || !b.roof) return b.top; const u = (X - r.ox) * r.ax + (Z - r.oz) * r.az, v = (Z - r.oz) * r.ax - (X - r.ox) * r.az;
      return b.top + (b.ridge - b.top) * U.clamp(Math.min(1 - Math.abs(v) / (r.rb + 0.4), r.hip ? (r.ra + 0.4 - Math.abs(u)) / r.hip : 1), 0, 1);
    }

    // ---------- street-facing walls of a footprint, best first ----------
    const fcache = new Map();
    function fronts(b) {
      let out = fcache.get(b); if (out) return out; out = []; out.maxL = 0; let spare = null;
      for (let k = 0; k < b.pts.length; k++) {
        const p = b.pts[k], q = b.pts[(k + 1) % b.pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); out.maxL = Math.max(out.maxL, L); if (L < 2.4) continue;
        const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, nx = uz, nz = -ux, mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        if (W.maskAt(mx + nx * 2.3, mz + nz * 2.3) === 4) continue;                                  // party wall or a notch in the footprint
        const f = { p, L, ux, uz, nx, nz, mx, mz, gap: 40, street: false, score: 200 - L, road: null }, r = W.nearestRoad(mx + nx * 2.3, mz + nz * 2.3, 90);
        if (r) { const vx = r.x - mx, vz = r.z - mz, along = vx * nx + vz * nz; if (along > 0.6 * Math.hypot(vx, vz)) { f.gap = along - r.hw; f.street = !/service|unknown/.test(r.cls); f.road = r; f.score = f.gap + (f.street ? 0 : 30) - Math.min(L, 14) * 0.5; out.push(f); continue; } }
        if (!spare || L > spare.L) spare = f;
      }
      if (!out.length && spare) out.push(spare);
      out.sort((a, c) => a.score - c.score); fcache.set(b, out); return out;
    }
    const wp = (f, t, o) => [f.p[0] + f.ux * t + f.nx * o, f.p[1] + f.uz * t + f.nz * o];              // point t along wall f, o out from it
    const w3 = (f, t, o, y) => [f.p[0] + f.ux * t + f.nx * o, y, f.p[1] + f.uz * t + f.nz * o];
    // block standing against wall f at t: w wide, d deep, top at y, sides run into the ground
    function slab(c, f, t, w, d, y) {
      const a = t - w / 2, b = t + w / 2, lo = Math.min(hAt(...wp(f, a, d)), hAt(...wp(f, b, d)), hAt(...wp(f, a, 0)), hAt(...wp(f, b, 0))) - 0.25;
      face(c, w3(f, a, 0, y), w3(f, b, 0, y), w3(f, b, d, y), w3(f, a, d, y)); face(c, w3(f, a, d, lo), w3(f, b, d, lo), w3(f, b, d, y), w3(f, a, d, y));
      face(c, w3(f, a, 0, lo), w3(f, a, d, lo), w3(f, a, d, y), w3(f, a, 0, y)); face(c, w3(f, b, 0, lo), w3(f, b, d, lo), w3(f, b, d, y), w3(f, b, 0, y));
    }
    // landing at the door plus steps down to the ground where the floor sits above it
    function stoop(b, f, t, w, d) {
      const drop = b.floorY - hAt(...wp(f, t, d + 0.4)), n = Math.min(2, Math.max(0, Math.round(drop / 0.22) - 1)), s = wp(f, t, d / 2); slab(CONC, f, t, w, d, b.floorY - 0.04);
      for (let k = 1; k <= n; k++) slab(CONC, f, t, w, d + 0.32 * k, b.floorY - 0.04 - drop * k / (n + 1));
      if (drop > 0.12 && ok(s[0], s[1], w / 2 - 0.15, true)) solid(s[0], s[1], w / 2 - 0.15);   // a landing flush with the ground is nothing to hit
    }
    const wq = (f, y, t0, t1, o, y0, y1, c) => face(c, w3(f, t0, o, y + y0), w3(f, t1, o, y + y0), w3(f, t1, o, y + y1), w3(f, t0, o, y + y1));   // upright quad o out from wall f
    const GLASS2 = [C(0x1b232b), C(0x4d6272)];   // glazing: dark at the sill, sky at the head
    function leaf(b, f, t, w, h, c, glazed) { wq(f, b.floorY, t - w / 2, t + w / 2, 0.09, 0, h, c); if (glazed) wq(f, b.floorY, t - w / 2 + 0.12, t + w / 2 - 0.12, 0.11, 0.3, h - 0.12, GLASS2); }
    // world.js skins each wall with facade tiles: round(L / 3.3) along it, one row per ~3.1 m floor, most with a window in the middle; flat roofs get a 0.45 m parapet.
    // A door takes the middle of the tile nearest t: a casing big enough to cover that tile's window (cw = its half width as a share of the tile), the leaf, a transom light. Returns where it went.
    // ponytail: mirrors world.js's tiling, and steps off the middle tile of a store's or shed's longest wall, where world.js may hang a roll-up door; ask W for the tile map if it ever exposes one
    const storey = (b) => b.wallH / Math.max(1, Math.round(b.wallH / 3.1)), parapet = (b) => (b.roof || b.kind === 'shed' ? 0 : 0.45);
    function door(b, f, t, w, h, c, glazed, trim, cw) {
      const n = Math.max(1, Math.round(f.L / 3.3)), tw = f.L / n; let i = U.clamp(Math.floor(t / tw), 0, n - 1); if ((b.kind === 'block' || b.kind === 'shed') && n > 1 && i === n >> 1 && f.L >= fronts(b).maxL) i += i ? -1 : 1;
      const tc = (i + 0.5) * tw, hw = Math.max(w / 2 + 0.15, tw * (cw || 0.23)), ht = Math.min(b.wallH, Math.max(h + 0.2, storey(b) * (b.kind === 'house' ? 0.8 : 0.88)));
      wq(f, b.floorY, tc - hw, tc + hw, 0.04, 0, ht, trim || WHITE); leaf(b, f, tc, w, h, c, glazed); if (ht - h > 0.45) wq(f, b.floorY, tc - w / 2, tc + w / 2, 0.07, h + 0.12, ht - 0.12, GLASS2); return tc;
    }

    // ---------- 1. real names on the real buildings ----------
    const info = new Map(), groups = new Map(), CHURCH = /church|chapel|baptist/i;
    for (const p of M.places) {
      const X = p[0], Z = -p[1], name = p[2]; let b = null, bd = 30;
      for (const q of W.buildings) { const d = ringD(q.pts, X, Z); if (d < bd) { bd = d; b = q; } }
      if (!b) { stats.unsigned.push(name + ' (no building within 30 m)'); continue; }
      let f = null, best = 1e9; for (const c of fronts(b)) { const s = segD(X, Z, c.p, wp(c, c.L, 0)) + c.gap * 0.3 + (c.street ? 0 : 20) - Math.min(c.L, 14) * 0.5; if (s < best) { best = s; f = c; } }
      if (!f) { stats.unsigned.push(name + ' (no free wall)'); continue; }
      let i = info.get(b); if (!i) info.set(b, i = { signs: [], church: false, f }); i.church = i.church || CHURCH.test(name);
      let g = groups.get(f); if (!g) groups.set(f, g = { b, f, items: [] }); g.items.push({ name, X, Z, t: U.clamp((X - f.p[0]) * f.ux + (Z - f.p[1]) * f.uz, 0, f.L) });
    }
    for (const { b, f, items } of groups.values()) {
      items.sort((a, c) => a.t - c.t); at(b.cx, b.cz, b);
      for (const it of items.splice(3)) stats.unsigned.push(it.name + ' (more than three names on one wall)');
      const n = items.length, across = n === 1 || f.L / n >= 3.6, room = across ? f.L / n : f.L, fh = storey(b), two = b.wallH / fh > 1.5, stack = across ? 1 : n;
      const w = Math.min(4 * Math.min(U.clamp(b.wallH * 0.2, 0.9, 1.3), two ? fh * 0.3 : 9) * (across ? 1 : 0.8), room - 0.5), h = w / 4;
      if (w < 1.6) { for (const it of items) stats.unsigned.push(it.name + ' (wall too short)'); continue; }
      const yc = b.floorY + (two ? fh : b.wallH + parapet(b) - 0.1 - (stack * h + (stack - 1) * 0.1) / 2);   // two storeys: on the floor line, between the window heads and the sills above; one: on the parapet or under the eave
      items.forEach((it, k) => {
        const t = across ? U.clamp(it.t, k * room + w / 2 + 0.25, (k + 1) * room - w / 2 - 0.25) : f.L / 2, y = across ? yc : yc + ((n - 1) / 2 - k) * (h + 0.1), q = wp(f, t, 0);
        box(DARK, q[0] + f.nx * 0.04, y - h / 2 - 0.06, q[1] + f.nz * 0.04, w + 0.12, h + 0.12, 0.08, f.ux, f.uz);
        plate(nameCell(it.name), q[0] + f.nx * 0.09, y, q[1] + f.nz * 0.09, f.nx, f.nz, w, h);
        info.get(b).signs.push({ name: it.name, f, t, y, w, h }); count('signs');
      });
    }
    // a customer door for the signed buildings that are not downtown shop fronts (those get theirs below): under the sign if there is room, else beside it
    for (const [b, i] of info) {
      const s = i.signs[0]; if (!s || b.kind === 'downtown' || b.kind === 'court') continue;
      const f = s.f, t = s.y - s.h / 2 - b.floorY >= 2.3 ? s.t : s.t - s.w / 2 - 1.3 > 0.3 ? s.t - s.w / 2 - 1.3 : s.t + s.w / 2 + 1.3;
      at(b.cx, b.cz, b); stoop(b, f, i.church ? door(b, f, t, 1.8, 2.3, C(0x4a2f1e)) : door(b, f, t, 1.7, 2.1, C(0x2b3138), true, C(0x3a3f45)), 2.4, 1.1); count('doors');
    }
    done('signs');

    // ---------- 2. downtown shop fronts, awnings, cornices ----------
    const TRIM = [0x23382c, 0x1f2a3c, 0x5a1f1f, 0x2b2b2b, 0xe9e2d0, 0x3a2a1e], AWN = [0x2f5d3a, 0x8a1f24, 0x1f3f6b, 0xc9962a, 0x3b3b3b, 0xb5532a];
    for (const b of W.buildings) {
      if (b.kind !== 'downtown') continue;
      at(b.cx, b.cz, b); const trim = C(pick(TRIM)), awn = C(pick(AWN)), striped = rnd() < 0.45, y = b.floorY, church = (info.get(b) || {}).church;
      for (const f of fronts(b)) {
        if (!f.street || f.gap > 24 || f.L < 3.5) continue;
        if (!b.roof && !b.cornice) { box(C(0xd9d2c2), f.mx + f.nx * 0.12, b.top + parapet(b) - 0.5, f.mz + f.nz * 0.12, f.L + 0.3, 0.55, 0.45, f.ux, f.uz); count('cornices'); }   // cornice along the parapet of the flat-roofed blocks
        if (church) { stoop(b, f, door(b, f, f.L / 2, 2, 2.6, C(0x4a2f1e), false, C(0xd9d2c2), 0.47), 3, 1.2); continue; }
        const q = (t0, t1, o, y0, y1, c) => wq(f, y, t0, t1, o, y0, y1, c), sg = (info.get(b) || { signs: [] }).signs.filter((s) => s.f === f).map((s) => s.y - s.h / 2 - y - 0.25);
        const sh = Math.max(2.4, Math.min(U.clamp(storey(b) * 0.82, 2.6, 3.6), b.wallH - 0.3, ...sg));   // covers the shop-window row world.js paints, and stays under the name board
        q(0.2, f.L - 0.2, 0.05, 0, sh, trim); q(0.55, f.L - 0.55, 0.08, 0.6, sh - 0.4, GLASS2);                // painted surround, glazing
        const nb = Math.max(1, Math.round((f.L - 1.1) / 2.6)), bw = (f.L - 1.1) / nb, dt = 0.55 + ((nb >> 1) + 0.5) * bw;
        for (let k = 1; k < nb; k++) q(0.49 + k * bw, 0.61 + k * bw, 0.11, 0.6, sh - 0.4, trim);
        q(dt - 0.62, dt + 0.62, 0.1, 0, sh - 0.4, trim); leaf(b, f, dt, 1, Math.min(2.3, sh - 0.7), C(0x3a2a1e), true); stoop(b, f, dt, 1.8, 1); count('shop fronts');
        const out = Math.min(1.3, f.gap - 0.5); if (out < 0.6) continue;
        const ns = striped ? Math.max(2, Math.round((f.L - 0.5) / 0.7)) : 1, sw = (f.L - 0.5) / ns;
        for (let k = 0; k < ns; k++) { const t0 = 0.25 + k * sw, t1 = t0 + sw, c = k % 2 ? C(0xf1ead8) : awn; face(c, w3(f, t0, 0.02, y + sh + 0.1), w3(f, t1, 0.02, y + sh + 0.1), w3(f, t1, out, y + sh - 0.45), w3(f, t0, out, y + sh - 0.45)); face(c, w3(f, t0, out, y + sh - 0.45), w3(f, t1, out, y + sh - 0.45), w3(f, t1, out, y + sh - 0.7), w3(f, t0, out, y + sh - 0.7)); }
        for (const t of [0.25, f.L - 0.25]) face(awn, w3(f, t, 0.02, y + sh + 0.1), w3(f, t, out, y + sh - 0.45), w3(f, t, 0.02, y + sh - 0.45)); count('awnings');
      }
    }
    done('downtown');

    // ---------- 3. houses: chimney on the measured roof, front door, stoop or porch ----------
    const BRICKS = [0x8c4a3a, 0x7a4034, 0x9a5a44, 0x6f6a64].map(C), DOORS = [0x7a1f1f, 0x1f3a2a, 0x23364f, 0xf4f1e8, 0x5a3a22, 0x2b2b2b].map(C), PROOF = [0x4a4744, 0x5b4636, 0x3e4a44, 0x6b6e70].map(C);
    for (const b of W.buildings) {
      if (b.kind !== 'house' || info.has(b)) continue;
      at(b.cx, b.cz, b); const r = roofOf(b), f = fronts(b)[0], y = b.floorY;
      if (r && rnd() < 0.5) {   // stack through the roof slope a third of the way down from the ridge, topping out above it
        const u = (rnd() - 0.5) * r.ra * 1.2, v = (rnd() < 0.5 ? -0.3 : 0.3) * r.rb, x = r.ox + r.ax * u - r.az * v, z = r.oz + r.az * u + r.ax * v, y0 = Math.min(roofY(b, x - r.az * 0.4, z + r.ax * 0.4), roofY(b, x + r.az * 0.4, z - r.ax * 0.4), roofY(b, x + r.ax * 0.45, z + r.az * 0.45), roofY(b, x - r.ax * 0.45, z - r.az * 0.45)) - 0.1;
        const bc = pick(BRICKS); if (!b.roofAt || b.roofAt(x, z) !== null) { box(bc, x, y0, z, 0.75, Math.max(Math.min(b.ridge + 0.45, y0 + 3), y0 + 1.3) - y0, 0.6, r.ax, r.az); count('chimneys'); }
      }
      if (!f) continue;
      const t = door(b, f, f.L * (0.5 + (rnd() - 0.5) * 0.3), 0.95, 2.05, pick(DOORS)), pw = Math.min(f.L - 0.6, 3 + rnd() * 3.5), pc = U.clamp(t, pw / 2 + 0.3, f.L - pw / 2 - 0.3), a = pc - pw / 2, c = pc + pw / 2, d = 1.9, wantPorch = rnd() < 0.5 && f.L > 5; count('house doors');
      if (wantPorch && ok(...wp(f, a, d), 0.2, true) && ok(...wp(f, c, d), 0.2, true) && empty(...wp(f, pc, d * 0.6), 1.3)) {   // slab, two posts, lean-to roof tucked under the eave
        const yr = y + Math.min(2.9, b.wallH - 0.1); slab(CONC, f, pc, pw, d, y - 0.05);
        for (const e of [a + 0.12, c - 0.12]) for (const k of [0, 1]) face(WHITE, w3(f, e - 0.07 * k, d - 0.12 - 0.07 * (1 - k), y - 0.05), w3(f, e + 0.07 * k, d - 0.12 + 0.07 * (1 - k), y - 0.05), w3(f, e + 0.07 * k, d - 0.12 + 0.07 * (1 - k), yr - 0.5), w3(f, e - 0.07 * k, d - 0.12 - 0.07 * (1 - k), yr - 0.5));
        face(pick(PROOF), w3(f, a - 0.2, 0.02, yr), w3(f, c + 0.2, 0.02, yr), w3(f, c + 0.2, d + 0.25, yr - 0.48), w3(f, a - 0.2, d + 0.25, yr - 0.48));
        face(WHITE, w3(f, a - 0.2, d + 0.25, yr - 0.48), w3(f, c + 0.2, d + 0.25, yr - 0.48), w3(f, c + 0.2, d + 0.25, yr - 0.68), w3(f, a - 0.2, d + 0.25, yr - 0.68));
        if (cur !== junk) W.walls.push(...wp(f, a, d), ...wp(f, c, d), ...wp(f, a, 0), ...wp(f, a, d), ...wp(f, c, 0), ...wp(f, c, d)); count('porches');
      } else { stoop(b, f, t, 1.5, 1); count('stoops'); }
    }
    done('houses');

    // ---------- 4. churches, schools, pitches, park, pool ----------
    const flags = [], wires = [];
    function span(a, b, sag) { const n = sag ? 16 : 1; for (let k = 0; k < n; k++) { const s = k / n, e = (k + 1) / n; wires.push(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - sag * 4 * s * (1 - s), a[2] + (b[2] - a[2]) * s, a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e - sag * 4 * e * (1 - e), a[2] + (b[2] - a[2]) * e); } }
    function flagpole(X, Z, h) { cur = big; const y = hAt(X, Z); lathe(C(0xc9ccd0), X, y - 0.2, Z, [[0.09, 0], [0.05, h + 0.2]], 6); box(C(0xd8b84a), X, y + h, Z, 0.18, 0.18, 0.18); solid(X, Z, 0.25); flags.push([X, y + h - 0.1, Z]); count('flagpoles'); }
    for (const [b, i] of info) {
      const f = i.signs.length ? i.signs[0].f : i.f;
      if (i.church) {   // steeple rising through the measured roof: tower in the building's own material, white belfry, spire, cross
        cur = hero(b) ? junk : big; const r = roofOf(b), s = U.clamp((r ? r.rb : 4) * 0.45, 1.7, 4); let x, z, ux = f.ux, uz = f.uz;
        if (r && b.roof) { const u = (((f.mx - r.ox) * r.ax + (f.mz - r.oz) * r.az) < 0 ? -1 : 1) * Math.max(0, r.ra - r.hip - s / 2 - 0.3); x = r.ox + r.ax * u; z = r.oz + r.az * u; ux = r.ax; uz = r.az; }   // on the ridge, at the end nearer the street
        else { x = f.mx - f.nx * (s / 2 + 0.5); z = f.mz - f.nz * (s / 2 + 0.5); if (!inRing(b.pts, x, z)) { x = b.cx; z = b.cz; } }                                                    // flat roof: just behind the front wall
        const y0 = b.top - 0.4, th = b.ridge - y0 + s * 0.6, yb = y0 + th + 0.25;
        box(b.wall, x, y0, z, s, th, s, ux, uz); box(WHITE, x, y0 + th, z, s * 1.12, 0.25, s * 1.12, ux, uz); box(WHITE, x, yb, z, s * 0.8, s * 0.9, s * 0.8, ux, uz);
        for (const [ex, ez] of [[ux, uz], [-uz, ux], [-ux, -uz], [uz, -ux]]) { const o = s * 0.4 + 0.03, hw = s * 0.2, L = (k, yy) => [x + ex * o - ez * hw * k, yy, z + ez * o + ex * hw * k]; face(C(0x2c2f33), L(-1, yb + s * 0.2), L(1, yb + s * 0.2), L(1, yb + s * 0.75), L(-1, yb + s * 0.75)); }
        box(C(0x3d4a4c), x, yb + s * 0.9, z, s * 0.92, s * 2.4, s * 0.92, ux, uz, 0);
        box(WHITE, x, yb + s * 3.25, z, 0.16, 1.5, 0.16, ux, uz); box(WHITE, x, yb + s * 3.25 + 0.9, z, 0.9, 0.16, 0.16, ux, uz); count('steeples');
      }
      for (const s of i.signs) if (/school/i.test(s.name)) { const q = wp(s.f, s.t, 7), p = spot(q[0], q[1], 12, post); if (p) flagpole(p[0], p[1], 9); }
    }
    // chain-link fence from the atlas tile (posts and top rail are drawn in the tile), both faces, solid. Not built where it would cross a road or a building
    function fence(x1, z1, x2, z2, h) {
      const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(L / 2.5)), ux = (x2 - x1) / L, uz = (z2 - z1) / L, rows = Math.max(1, Math.round(h / 2.5));
      for (let k = 0; k <= n; k++) if (!ok(x1 + ux * L * k / n, z1 + uz * L * k / n, 0.2)) return false;
      for (let k = 0; k < n; k++) {
        const ax = x1 + ux * L * k / n, az = z1 + uz * L * k / n, bx = x1 + ux * L * (k + 1) / n, bz = z1 + uz * L * (k + 1) / n, ya = hAt(ax, az) - 0.05, yb = hAt(bx, bz) - 0.05; mark((ax + bx) / 2, (az + bz) / 2, 1.3);
        for (let r = 0; r < rows; r++) { const y0 = h * r / rows, y1 = h * (r + 1) / rows; tq(FENCE, [bx, yb + y0, bz], [ax, ya + y0, az], [ax, ya + y1, az], [bx, yb + y1, bz], uz, -ux); tq(FENCE, [ax, ya + y0, az], [bx, yb + y0, bz], [bx, yb + y1, bz], [ax, ya + y1, az], -uz, ux); }
      }
      W.walls.push(x1, z1, x2, z2); count('fence metres', Math.round(L)); return true;
    }
    // ground patch draped on the terrain (decal) over a rectangle, kept to the grass and to `inside(x, z)` if given; cell = grid spacing, up = lift.
    // Grid points just outside are pulled onto the outline, so the edge follows the shape (and the pavement) instead of the grid
    // ponytail: follows the 2.5 m terrain; beyond ~130 m the coarser terrain LOD can poke through it. Give pads their own LOD skirt if that ever shows
    function pad(c, cx, cz, ux, uz, hw, hd, inside, cell, up) {
      const nu = Math.max(1, Math.ceil(2 * hw / (cell || 1.8))), nv = Math.max(1, Math.ceil(2 * hd / (cell || 1.8))), w = nu + 1, v0 = padBuf.pos.length / 3, pt = [], st = [];
      const IN = (x, z) => W.maskAt(x, z) === 0 && (!inside || inside(x, z));
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const a = -hw + 2 * hw * i / nu, b = -hd + 2 * hd * j / nv, p = [cx + ux * a - uz * b, cz + uz * a + ux * b]; pt.push(p); st.push(IN(p[0], p[1]) ? 1 : 0); }
      for (let k = 0; k < pt.length; k++) {
        if (st[k]) continue; const i = k % w, o = pt[k];
        for (const n of [i < nu ? k + 1 : -1, i ? k - 1 : -1, k + w, k - w]) { if (st[n] !== 1) continue; const q = pt[n]; let lo = 0, hi = 1; for (let e = 0; e < 6; e++) { const m = (lo + hi) / 2; if (IN(q[0] + (o[0] - q[0]) * m, q[1] + (o[1] - q[1]) * m)) lo = m; else hi = m; } pt[k] = [q[0] + (o[0] - q[0]) * lo, q[1] + (o[1] - q[1]) * lo]; st[k] = 2; break; }
      }
      for (const p of pt) { padBuf.pos.push(p[0], hAt(p[0], p[1]) + (up || 0.05), p[1]); padBuf.nor.push(0, 1, 0); padBuf.col.push(c.r, c.g, c.b); }
      for (let j = 1; j <= nv; j++) for (let i = 1; i <= nu; i++) { const q = j * w + i, cs = [q - w - 1, q - 1, q, q - w].filter((k) => st[k]).map((k) => k + v0); if (cs.length === 4) padBuf.idx.push(cs[0], cs[1], cs[3], cs[3], cs[1], cs[2]); else if (cs.length === 3) padBuf.idx.push(cs[0], cs[1], cs[2]); }
    }
    function bleachers(cx, cz, ux, uz, L, vx, vz) {   // five rows L long; (vx, vz) points from the front row to the back
      at(cx, cz); const y = hAt(cx, cz), P = (a, b, yy) => [cx + ux * a + vx * b, y + yy, cz + uz * a + vz * b], al = C(0xa4a9ad), dk = C(0x55595e);
      for (let r = 0; r < 5; r++) { face(al, P(-L / 2, r * 0.75, r * 0.42 + 0.42), P(L / 2, r * 0.75, r * 0.42 + 0.42), P(L / 2, r * 0.75 + 0.75, r * 0.42 + 0.42), P(-L / 2, r * 0.75 + 0.75, r * 0.42 + 0.42)); face(dk, P(-L / 2, r * 0.75, r * 0.42 - 0.4), P(L / 2, r * 0.75, r * 0.42 - 0.4), P(L / 2, r * 0.75, r * 0.42 + 0.42), P(-L / 2, r * 0.75, r * 0.42 + 0.42)); }
      face(dk, P(-L / 2, 3.75, -0.4), P(L / 2, 3.75, -0.4), P(L / 2, 3.75, 3), P(-L / 2, 3.75, 3)); for (const s of [-1, 1]) face(dk, P(s * L / 2, 0, -0.4), P(s * L / 2, 3.75, -0.4), P(s * L / 2, 3.75, 2.1));
      wallRect(cx + vx * 1.875, cz + vz * 1.875, ux, uz, L / 2, 1.875); count('bleachers');
    }
    // a pitch whose two longest sides meet at a right angle with a curved far side is a ball diamond: returns home plate and the two foul lines
    function diamond(pts) {
      const e = pts.map((p, k) => { const q = pts[(k + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); return { p, q, L, dx: (q[0] - p[0]) / L, dz: (q[1] - p[1]) / L }; }).sort((a, b) => b.L - a.L), a = e[0], b = e[1];
      const det = a.dx * b.dz - a.dz * b.dx; if (pts.length < 6 || Math.abs(det) < 0.94) return null;
      const s = ((b.p[0] - a.p[0]) * b.dz - (b.p[1] - a.p[1]) * b.dx) / det, hx = a.p[0] + a.dx * s, hz = a.p[1] + a.dz * s, far = (g) => (Math.hypot(g.p[0] - hx, g.p[1] - hz) > Math.hypot(g.q[0] - hx, g.q[1] - hz) ? g.p : g.q);
      if (Math.min(segD(hx, hz, a.p, a.q), segD(hx, hz, b.p, b.q)) > 14) return null;
      const d1 = far(a), d2 = far(b), l1 = Math.hypot(d1[0] - hx, d1[1] - hz), l2 = Math.hypot(d2[0] - hx, d2[1] - hz);
      return { x: hx, z: hz, ax: (d1[0] - hx) / l1, az: (d1[1] - hz) / l1, bx: (d2[0] - hx) / l2, bz: (d2[1] - hz) / l2 };
    }
    const parks = M.areas.filter((a) => a.k === 'park').map((a) => ring(a.p));
    for (const a of M.areas) {
      if (a.k !== 'pitch') continue;
      const pts = ring(a.p), c = mid(pts), rc = rect(pts); if (!rc || pts.some((p) => Math.abs(p[0]) > W.PLAY - 4 || Math.abs(p[1]) > W.PLAY - 4)) { stats.skipped.push('pitch at ' + Math.round(c.x) + ',' + Math.round(c.z) + ' (reaches past the play area)'); continue; }
      const dm = diamond(pts);
      if (dm) {   // ball diamond: backstop behind home plate, skinned infield with bases, a strip of bleachers behind the backstop
        let ox = dm.ax + dm.bx, oz = dm.az + dm.bz; const il = 1 / Math.hypot(ox, oz); ox *= il; oz *= il; const px = -oz, pz = ox, E = (b, s) => [dm.x - ox * b + px * s, dm.z - oz * b + pz * s];
        let bs = 5; for (const d of [5, 3.5, 7.5]) if (fence(...E(d, -3.5), ...E(d, 3.5), 5)) { fence(...E(d, 3.5), ...E(d - 4, 9), 5); fence(...E(d, -3.5), ...E(d - 4, -9), 5); bs = d; count('backstops'); break; }
        // in foul-line coordinates (a, b): bases 27.4 m apart, the mound at (13, 13); dirt = the 29 m arc round the mound less the grass square inside the base paths
        const F = (a, b) => [dm.x + dm.ax * a + dm.bx * b, dm.z + dm.az * a + dm.bz * b], dirt = (x, z) => { const a = (x - dm.x) * dm.ax + (z - dm.z) * dm.az, b = (x - dm.x) * dm.bx + (z - dm.z) * dm.bz, m = Math.hypot(a - 13, b - 13), h = Math.hypot(a, b); return h < 4 || (a > -1 && b > -1 && m < 29 && (m < 2.7 || a < 2.5 || b < 2.5 || a > 24.9 || b > 24.9)); };
        pad(C(0xa9825a), ...F(19, 19), dm.ax, dm.az, 23.5, 23.5, dirt, 1.5);
        for (const q of [[0, 0], [27.4, 0], [27.4, 27.4], [0, 27.4], [13, 13]]) pad(WHITE, ...F(q[0], q[1]), ox, oz, 0.3, 0.3, null, 1, 0.09);
        for (const d of [bs + 4.5, bs + 7, bs + 10, bs + 13]) { const bc = E(d, 0); if (okRect(bc[0] - ox * 1.875, bc[1] - oz * 1.875, px, pz, 8, 2.4)) { bleachers(bc[0], bc[1], px, pz, 16, -ox, -oz); break; } }
      } else if (parks.some((p) => inRing(p, c.x, c.z)) && rc.ha < 30) {   // small rectangle in the park: a fenced hard court
        pad(C(0x5d6b63), rc.ox, rc.oz, rc.dx, rc.dz, rc.ha, rc.hb); for (let k = 0; k < pts.length; k++) fence(...pts[k], ...pts[(k + 1) % pts.length], 3); claim(rc.ox, rc.oz, rc.dx, rc.dz, rc.ha, rc.hb); count('courts');
      }
    }
    function table(x, y, z) { const wood = C(0x8a6a42); box(wood, x, y + 0.7, z, 1.8, 0.06, 0.75); for (const s of [-0.62, 0.62]) box(wood, x, y + 0.42, z + s, 1.8, 0.05, 0.28); for (const e of [-0.7, 0.7]) face(wood, [x + e, y, z - 0.76], [x + e, y, z + 0.76], [x + e, y + 0.7, z + 0.3], [x + e, y + 0.7, z - 0.3]); solid(x, z, 1); }
    for (const pts of parks) {
      const c = mid(pts), cand = []; for (let X = c.x0 + 6; X < c.x1 - 6; X += 5) for (let Z = c.z0 + 6; Z < c.z1 - 6; Z += 5) if (inRing(pts, X, Z)) cand.push([X, Z]);
      cand.sort((p, q) => Math.hypot(p[0] - c.x, p[1] - c.z) - Math.hypot(q[0] - c.x, q[1] - c.z));
      const s = cand.find((p) => okRect(p[0], p[1], 1, 0, 5.5, 4));
      if (s) {   // picnic shelter: slab, six posts, gable roof, two tables
        const [x, z] = s, y = Math.max(hAt(x - 4, z - 2.5), hAt(x + 4, z - 2.5), hAt(x + 4, z + 2.5), hAt(x - 4, z + 2.5)) + 0.1, wood = C(0x6b4a2e), roofc = C(0x3f5a45); at(x, z);
        box(CONC, x, y - 0.7, z, 9, 0.7, 6); for (const a of [-4, 0, 4]) for (const e of [-2.5, 2.5]) { box(wood, x + a, y, z + e, 0.18, 2.6, 0.18); solid(x + a, z + e, 0.25); }
        for (const e of [-1, 1]) { face(roofc, [x - 4.7, y + 2.5, z + e * 3.3], [x + 4.7, y + 2.5, z + e * 3.3], [x + 4.7, y + 4, z], [x - 4.7, y + 4, z]); face(C(0xd8c7a3), [x + e * 4.4, y + 2.6, z - 3], [x + e * 4.4, y + 2.6, z + 3], [x + e * 4.4, y + 3.95, z]); }
        table(x - 2, y, z); table(x + 2, y, z); claim(x, z, 1, 0, 5.5, 4); count('picnic shelters');
      }
      const g = cand.find((p) => okRect(p[0], p[1], 1, 0, 6.5, 5));
      if (g) {   // playground on a mulch pad: swing set and a slide tower
        const [x, z] = g, blue = C(0x2f6fb0), red = C(0xc8202b), yel = C(0xd9a514), y = hAt(x - 3, z), sx2 = x + 3, y2 = hAt(sx2, z); at(x, z); pad(C(0x8a6642), x, z, 1, 0, 6.5, 5);
        for (const e of [-1.7, 1.7]) { for (const s of [-1.3, 1.3]) beam(blue, [x - 3 + e, y - 0.1, z + s], [x - 3 + e, y + 2.5, z], 0.09); solid(x - 3 + e, z, 0.5); }
        beam(blue, [x - 4.7, y + 2.5, z], [x - 1.3, y + 2.5, z], 0.09);
        for (const e of [-0.8, 0.8]) { box(DARK, x - 3 + e, y + 0.5, z, 0.5, 0.05, 0.2); for (const s of [-0.22, 0.22]) wires.push(x - 3 + e + s, y + 2.5, z, x - 3 + e + s, y + 0.52, z); }
        for (const a of [-0.6, 0.6]) for (const e of [-0.6, 0.6]) box(red, sx2 + a, y2 - 0.1, z + e, 0.1, 3, 0.1);
        box(yel, sx2, y2 + 1.4, z, 1.4, 0.1, 1.4); box(red, sx2, y2 + 2.9, z, 1.8, 0.8, 1.8, 1, 0, 0);
        face(yel, [sx2 - 0.3, y2 + 1.5, z + 0.7], [sx2 + 0.3, y2 + 1.5, z + 0.7], [sx2 + 0.3, y2 + 0.2, z + 3.7], [sx2 - 0.3, y2 + 0.2, z + 3.7]);
        for (const e of [-0.3, 0.3]) face(red, [sx2 + e, y2 + 1.5, z + 0.7], [sx2 + e, y2 + 0.2, z + 3.7], [sx2 + e, y2 + 0.45, z + 3.7], [sx2 + e, y2 + 1.75, z + 0.7]);
        face(blue, [sx2 - 0.3, y2 + 1.45, z - 0.7], [sx2 + 0.3, y2 + 1.45, z - 0.7], [sx2 + 0.3, y2, z - 1.5], [sx2 - 0.3, y2, z - 1.5]);
        solid(sx2, z, 1.2); claim(x, z, 1, 0, 6.5, 5); count('playgrounds');
      }
    }
    for (const p of M.places) {
      if (!/pool/i.test(p[2])) continue;   // the pool: tiled basin sunk in a concrete deck, fenced
      let nb = null, bd = 60; for (const q of W.buildings) { const d = ringD(q.pts, p[0], -p[1]); if (d < bd) { bd = d; nb = q; } }
      const rc = nb && rect(nb.pts), ux = rc ? rc.dx : 1, uz = rc ? rc.dz : 0, s = spot(p[0], -p[1], 30, (X, Z) => okRect(X, Z, ux, uz, 14.5, 9.5));
      if (!s) { stats.skipped.push(p[2] + ' basin (no clear ground within 30 m)'); continue; }
      const [x, z] = s, P = (q, yy) => [x + ux * q[0] - uz * q[1], yy, z + uz * q[0] + ux * q[1]], O = [[-13, -8], [13, -8], [13, 8], [-13, 8]], I = [[-10.5, -5.5], [10.5, -5.5], [10.5, 5.5], [-10.5, 5.5]], hs = O.map((q) => { const v = P(q, 0); return hAt(v[0], v[2]); }), y = Math.max(...hs) + 0.12, lo = Math.min(...hs) - 0.4;
      at(x, z);
      for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; face(C(0xb9b5aa), P(O[k], y), P(O[j], y), P(I[j], y), P(I[k], y)); face(CONC, P(O[k], lo), P(O[j], lo), P(O[j], y), P(O[k], y)); face(C(0xcfe6ee), P(I[k], y), P(I[j], y), P(I[j], y - 0.3), P(I[k], y - 0.3)); }
      face(C(0x2f9fc4), P(I[0], y - 0.3), P(I[1], y - 0.3), P(I[2], y - 0.3), P(I[3], y - 0.3));
      const dv = P([-10.9, 0], y); box(WHITE, dv[0], y + 0.45, dv[2], 2.6, 0.08, 0.5, ux, uz); box(STEEL, dv[0] - ux * 0.8, y, dv[2] - uz * 0.8, 0.5, 0.45, 0.5, ux, uz);
      const F = [[-13.7, -8.7], [13.7, -8.7], [13.7, 8.7], [-13.7, 8.7]].map((q) => P(q, 0)); for (let k = 0; k < 4; k++) fence(F[k][0], F[k][2], F[(k + 1) % 4][0], F[(k + 1) % 4][2], 2.5);
      claim(x, z, ux, uz, 14.5, 9.5); count('pools');
    }
    done('churches, pitches, park, pool');

    // ---------- 5. fuel canopies and tall pole signs ----------
    // ponytail: world.js plants a low roadside board for every place, which repeats the name beside a pole sign. Its spot is recomputed the way world.js picks it
    // (nearest road within 90 m, 3.6 m past its edge on the place's side, first come within 11 m, not on a building); the lettered face is removed, the post and
    // backing in world's merged post mesh collapsed, and the post's obstacle moved into the pole. Matches nothing if world.js changes; drop once it skips these places
    const roadside = new Map(), placed = [], postHex = U.lin(0x4a4038).getHex();
    for (const p of M.places) {
      const X = p[0], Z = -p[1], r = W.nearestRoad(X, Z, 90); if (!r) continue;
      const side = ((X - r.x) * r.tz + (Z - r.z) * -r.tx) >= 0 ? 1 : -1, sx = r.x + r.tz * side * (r.hw + 3.6), sz = r.z - r.tx * side * (r.hw + 3.6);
      if (placed.some((q) => Math.hypot(q[0] - sx, q[1] - sz) < 11) || W.maskAt(sx, sz) === 4) continue; placed.push([sx, sz]); roadside.set(p[2], [sx, sz]);
    }
    function unboard(name, X, Z) {
      const q = roadside.get(name), near = (x, z, e) => Math.abs(x - q[0]) < e && Math.abs(z - q[1]) < e, g = q && scene.children.find((o) => o.isGroup && near(o.position.x, o.position.z, 0.01)); if (!g) return;
      scene.remove(g); count('roadside boards replaced');
      for (const o of scene.children) {
        const ix = o.isMesh && !o.isInstancedMesh && o.material.color && o.material.color.getHex() === postHex && o.geometry.index, p = ix && o.geometry.attributes.position; if (!ix) continue;
        const on = (i) => near(p.getX(i), p.getZ(i), 2);
        for (let k = 0; k < ix.count; k += 3) if (on(ix.getX(k)) && on(ix.getX(k + 1)) && on(ix.getX(k + 2))) { ix.setX(k + 1, ix.getX(k)); ix.setX(k + 2, ix.getX(k)); }
        ix.needsUpdate = true;
      }
      for (let k = 0; k < W.obstacles.length; k += 3) if (near(W.obstacles[k], W.obstacles[k + 1], 0.01)) { W.obstacles[k] = X; W.obstacles[k + 1] = Z; }
    }
    for (const [b, i] of info) for (const s of i.signs) {
      if (!/huck|marathon|dairy queen|pizza hut|subway|drive-in/i.test(s.name)) continue;
      if (hero(b) && /huck|marathon/i.test(s.name)) { unboard(s.name, 1e5, 1e5); continue; }   // hero_fuel.js models these stations whole: world.js's board goes too, its post's obstacle parked off the map
      const f = s.f, r = f.road; if (!r) { stats.skipped.push(s.name + ' pole sign (no road in front)'); continue; }
      const side = ((f.mx - r.x) * r.tz - (f.mz - r.z) * r.tx) >= 0 ? 1 : -1, lx = r.tz * side, lz = -r.tx * side;   // from the road towards the building
      if (/huck|marathon/i.test(s.name)) {   // canopy along the street in the gap between building and street (else on the nearest clear ground): two pump islands if the big one fits, else one
        let c = null, Lc, D, rows;
        const fits = (X, Z) => grid(X, Z, r.tx, r.tz, Lc / 2, D / 2).every((p) => { const m = W.maskAt(p[0], p[1]); return (m === 0 || m === 5) && empty(p[0], p[1], 1.2); }) && rows.every((e) => grid(X - r.tz * e, Z + r.tx * e, r.tx, r.tz, Lc * 0.36, 0.3).every((p) => ok(p[0], p[1], 0.65)));
        for (const [R, l, d] of [[6, 15, 8], [6, 12, 5.5], [24, 15, 8], [24, 12, 5.5]]) { Lc = l; D = d; rows = D >= 7 ? [-D / 4, D / 4] : [0]; const c0 = wp(f, f.L / 2, Math.max(D / 2 + 2, f.gap / 2, f.gap - D / 2 - 3.5)); if ((c = spot(c0[0], c0[1], R, fits))) break; }
        if (c) {
          const [cx, cz] = c, P = (a, e) => [cx + r.tx * a - r.tz * e, cz + r.tz * a + r.tx * e], g = Math.max(...rows.map((e) => Math.max(hAt(...P(-Lc * 0.36, e)), hAt(...P(Lc * 0.36, e))))), red = C(0xc8202b);
          pad(C(0xa9a69c), cx, cz, r.tx, r.tz, Lc / 2 + 3, D / 2 + 3);                                             // forecourt slab wherever the lidar saw no pavement
          at(cx, cz); box(WHITE, cx, g + 4.7, cz, Lc, 0.75, D, r.tx, r.tz); box(red, cx, g + 4.95, cz, Lc + 0.06, 0.22, D + 0.06, r.tx, r.tz);
          for (const e of [1, -1]) plate(nameCell(s.name), cx - r.tz * (D / 2 + 0.05) * e, g + 5.075, cz + r.tx * (D / 2 + 0.05) * e, -r.tz * e, r.tx * e, 2.6, 0.65);   // the name on both long fascias
          const u = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((q) => { const v = P(q[0] * Lc / 2, q[1] * D / 2); return [v[0], g + 4.7, v[1]]; }); face(C(0xdcdcd8), u[0], u[1], u[2], u[3]);
          for (const e of rows) {
            const m = P(0, e); box(CONC, m[0], hAt(m[0], m[1]) - 0.2, m[1], Lc * 0.62, 0.36, 1.1, r.tx, r.tz);
            for (const a of [-Lc * 0.36, Lc * 0.36]) { const q = P(a, e), y = hAt(q[0], q[1]); box(WHITE, q[0], y - 0.2, q[1], 0.35, g + 4.9 - y, 0.35, r.tx, r.tz); solid(q[0], q[1], 0.3); }
            for (const a of [-Lc * 0.16, Lc * 0.16]) { const q = P(a, e), y = hAt(q[0], q[1]) + 0.16; box(C(0xe4e4e0), q[0], y, q[1], 1, 1.6, 0.5, r.tx, r.tz); box(red, q[0], y + 1.6, q[1], 1.06, 0.22, 0.56, r.tx, r.tz); box(DARK, q[0], y + 0.85, q[1], 0.6, 0.45, 0.54, r.tx, r.tz); solid(q[0], q[1], 0.65); count('fuel pumps'); }
          }
          claim(cx, cz, r.tx, r.tz, Lc / 2, D / 2); count('fuel canopies');
        } else stats.skipped.push(s.name + ' canopy (no clear ground within 24 m of the forecourt)');
      }
      let ps = null; for (const o of [9, -9, 14, -14, 5, -5, 19, -19, 0]) { const X = r.x + r.tx * o + lx * (r.hw + 2.8), Z = r.z + r.tz * o + lz * (r.hw + 2.8); if (ok(X, Z, 0.4) && empty(X, Z, 2.5)) { ps = [X, Z]; break; } }
      if (ps) { cur = big; const [X, Z] = ps, y = hAt(X, Z); lathe(STEEL, X, y - 0.2, Z, [[0.22, 0], [0.17, 7.5]], 8); box(DARK, X, y + 7.2, Z, 0.3, 1.4, 4.96, r.tx, r.tz); for (const e of [1, -1]) plate(nameCell(s.name), X + r.tx * 0.16 * e, y + 7.9, Z + r.tz * 0.16 * e, r.tx * e, r.tz * e, 4.8, 1.2); solid(X, Z, 0.3); count('pole signs'); unboard(s.name, X, Z); }
      else stats.skipped.push(s.name + ' pole sign (no clear verge)');
    }
    done('fuel');

    // ---------- 6. infrastructure from the map ----------
    for (const a of M.areas) {
      const pts = ring(a.p), c = mid(pts);
      if (a.k === 'storage_tank') {   // the town's water tank, lettered on two sides. Its own lidar footprint gives the shape: wall to the measured eave, dome to the measured peak
        let lo = 1e9; for (const p of pts) lo = Math.min(lo, hAt(p[0], p[1]));
        const inner = W.buildings.find((b) => inRing(pts, b.cx, b.cz)), R = c.r + 0.25, y = lo - 0.5, Hw = (inner ? inner.top : lo + 9) - y, d = inner ? Math.max(1.5, inner.ridge - inner.top + 0.3) : 2.5, rho = (R * R + d * d) / (2 * d), dome = [];
        const shell = C(0xdfe6e8), r = W.nearestRoad(c.x, c.z, 300), a0 = r ? Math.atan2(r.z - c.z, r.x - c.x) : 0;
        for (let k = 0; k <= 8; k++) { const ph = Math.asin(R / rho) * (1 - k / 8); dome.push([rho * Math.sin(ph), Hw + d - rho * (1 - Math.cos(ph))]); }
        cur = big; lathe(shell, c.x, y, c.z, [[R, 0], [R, Hw]], 32); lathe(C(0xcdd6d9), c.x, y, c.z, dome, 32); lathe(STEEL, c.x, y, c.z, [[R + 0.12, Hw - 0.25], [R + 0.12, Hw + 0.05], [R - 0.3, Hw + 0.05]], 32);
        box(STEEL, c.x + Math.cos(a0 + 1.57) * (R + 0.08), y, c.z + Math.sin(a0 + 1.57) * (R + 0.08), 0.12, Hw + 0.9, 0.55, Math.cos(a0 + 1.57), Math.sin(a0 + 1.57));
        // ponytail: world.js roofs every footprint over its bounding rectangle, so this round tank carries a hip roof whose corners stand 6 m outside the shell.
        // Those roof triangles (every vertex above the tank's eave, inside its bounding square) are collapsed in the world's own shadow-casting textured meshes;
        // it does nothing if world.js changes. Drop it once world.js leaves round tanks unroofed
        if (inner) scene.traverse((o) => {
          const ix = o.isMesh && o.castShadow && o.material.map && o.material.vertexColors && o.geometry.index, p = ix && o.geometry.attributes.position; if (!ix) return;
          const on = (i) => p.getY(i) > inner.top - 0.01 && Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z) < R * 1.5;
          for (let k = 0; k < ix.count; k += 3) if (on(ix.getX(k)) && on(ix.getX(k + 1)) && on(ix.getX(k + 2))) { ix.setX(k + 1, ix.getX(k)); ix.setX(k + 2, ix.getX(k)); count('tank roof triangles cleared'); }
        });
        const uv = slot(768, 128, (g, w, h) => { g.fillStyle = '#dfe6e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d2a3a'; U.fit(g, 'BLOOMFIELD', w - 30, 100, U.SIGN_FONT); g.fillText('BLOOMFIELD', w / 2, h / 2 + 4); });
        for (const am of [a0, a0 + Math.PI]) {   // lettering wrapped round the wall; a viewer's right is the direction of decreasing angle
          const top = y + Hw - 0.5, bh = Math.min(R / 4, 0.62 * (top - hAt(c.x + Math.cos(am) * (R + 1), c.z + Math.sin(am) * (R + 1)))), sp = 6 * bh / R;
          for (let k = 0; k < 10; k++) {
            const aL = am + sp / 2 - sp * k / 10, aR = aL - sp / 10, v = A.pos.length / 3, u0 = uv[0] + (uv[2] - uv[0]) * k / 10, u1 = uv[0] + (uv[2] - uv[0]) * (k + 1) / 10;
            for (const [an, hh, uu, vv] of [[aL, -bh, u0, uv[1]], [aR, -bh, u1, uv[1]], [aR, 0, u1, uv[3]], [aL, 0, u0, uv[3]]]) { A.pos.push(c.x + Math.cos(an) * (R + 0.07), top - 0.12 * bh + hh, c.z + Math.sin(an) * (R + 0.07)); A.nor.push(Math.cos(an), 0, Math.sin(an)); A.uv.push(uu, vv); }
            A.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
          }
        }
        if (!inner) for (let k = 0; k < 16; k++) solid(c.x + Math.cos(k / 16 * TAU) * (R - 1.6), c.z + Math.sin(k / 16 * TAU) * (R - 1.6), 1.7);
        count('water tanks');
      } else if (a.k === 'silo') {
        const R = U.clamp(c.r, 1.6, 6), H = U.clamp(R * 4.5, 9, 20), y = hAt(c.x, c.z) - 0.3;
        if (!ok(c.x, c.z, R)) { stats.skipped.push('silo at ' + Math.round(c.x) + ',' + Math.round(c.z) + ' (not on open ground)'); continue; }
        cur = big; lathe(C(0xb9bdbd), c.x, y, c.z, [[R, 0], [R, H]], 14); lathe(C(0x8f9698), c.x, y, c.z, [[R * 1.05, H], [R * 0.2, H + R * 0.55], [0, H + R * 0.6]], 14); solid(c.x, c.z, R); count('silos');
      } else if (a.k === 'cemetery') {   // rows of headstones running north-south, facing east and west
        for (let X = c.x0 + 3; X < c.x1; X += 7) for (let Z = c.z0 + 3; Z < c.z1; Z += 3.2) {
          if (rnd() > 0.58 || !inRing(pts, X, Z) || !ok(X, Z, 0.45) || !empty(X, Z, 0.9) || W.maskAt(X, Z) || W.maskAt(X + 1.5, Z) || W.maskAt(X - 1.5, Z)) continue;   // on the grass, off the cemetery lanes
          at(X, Z); const y = hAt(X, Z) - 0.15, col = C(pick([0xb8b6b0, 0x9a9896, 0xd6d2c8, 0x7f7f84, 0xc4bcae])), k = rnd();
          if (k < 0.6) box(col, X, y, Z, 0.16, 0.95 + rnd() * 0.35, 0.62); else if (k < 0.86) box(col, X, y, Z, 0.36, 0.62, 0.95, 1, 0, 0.8); else { box(col, X, y, Z, 0.55, 0.55, 0.55); box(col, X, y + 0.55, Z, 0.36, 1.7, 0.36, 1, 0, 0.3); }
          solid(X, Z, 0.45); count('headstones');
        }
      } else if (a.k === 'substation') {   // gravel yard behind chain-link: two dead-end gantries, a bus between them, two transformers
        const rc = rect(pts); if (!rc) continue; const P = (s, e) => [rc.ox + rc.dx * s - rc.dz * e, rc.oz + rc.dz * s + rc.dx * e], good = (p, r) => inRing(pts, p[0], p[1]) && ok(p[0], p[1], r) && empty(p[0], p[1], r);
        pad(C(0xa8a296), rc.ox, rc.oz, rc.dx, rc.dz, rc.ha, rc.hb, (x, z) => inRing(pts, x, z)); for (let k = 0; k < pts.length; k++) fence(...pts[k], ...pts[(k + 1) % pts.length], 2.5);
        cur = big; const lat = Math.min(6, rc.hb * 0.45), tops = [];
        for (const s of [-0.6, 0.45]) {
          const pa = P(rc.ha * s, -lat), pb = P(rc.ha * s, lat); if (!good(pa, 0.4) || !good(pb, 0.4)) continue; const y = Math.max(hAt(...pa), hAt(...pb)) + 8.5, ins = [];
          for (const q of [pa, pb]) { box(STEEL, q[0], hAt(q[0], q[1]) - 0.2, q[1], 0.35, y - hAt(q[0], q[1]) + 0.4, 0.35, rc.dx, rc.dz); solid(q[0], q[1], 0.4); }
          beam(STEEL, [pa[0], y, pa[1]], [pb[0], y, pb[1]], 0.4);
          for (const e of [-0.6, 0, 0.6]) { const q = P(rc.ha * s, lat * e); beam(C(0x5a4038), [q[0], y - 0.2, q[1]], [q[0], y - 1.3, q[1]], 0.16); ins.push([q[0], y - 1.3, q[1]]); }
          tops.push(ins); count('substation gantries');
        }
        if (tops.length === 2) for (let k = 0; k < 3; k++) span(tops[0][k], tops[1][k], 0.35);
        for (const s of [-0.2, 0.14]) {
          const q = P(rc.ha * s, 0); if (!good(q, 2)) continue; const y = hAt(q[0], q[1]), tank = C(0x6f7f76);
          box(CONC, q[0], y - 0.3, q[1], 2.6, 0.55, 3.6, rc.dx, rc.dz); box(tank, q[0], y + 0.25, q[1], 1.8, 2.3, 2.6, rc.dx, rc.dz);
          for (const e of [-1.2, 1.2]) box(C(0x57645c), q[0] + rc.dx * e, y + 0.5, q[1] + rc.dz * e, 0.55, 1.7, 2.2, rc.dx, rc.dz);
          for (const e of [-0.6, 0, 0.6]) { const v = P(rc.ha * s, lat * e * 1.4); lathe(C(0x7a4a36), v[0], y + 2.55, v[1], [[0.13, 0], [0.17, 0.3], [0.1, 0.6], [0.15, 0.9], [0.06, 1.2]], 6); if (tops.length === 2) wires.push(v[0], y + 3.75, v[1], v[0], tops[0][0][1] - 0.3, v[1]); }
          solid(q[0], q[1], 1.9); count('transformers');
        }
        clearTrees(c.x, c.z, c.r * 1.5, (x, z) => inRing(pts, x, z)); count('substations');   // the lidar took the switchgear for trees
      }
    }
    // ponytail: the lidar tree finder also took the lattice towers, the mast and the switchgear for trees; those instances are zeroed in W.treeChunks (near and far copies share
    // their order). Their 0.45 m collision circles stay, all inside this module's own solids or fence. Filter them out of the tree data instead when detail.js is next rebuilt
    function clearTrees(X, Z, r, inside) {
      for (const c of W.treeChunks || []) { if (Math.abs(c.cx - X) > 175 + r || Math.abs(c.cz - Z) > 175 + r) continue; const m = c.near.instanceMatrix.array;
        for (let k = 0; k < c.n; k++) if (Math.hypot(m[16 * k + 12] - X, m[16 * k + 14] - Z) < r && (!inside || inside(m[16 * k + 12], m[16 * k + 14]))) { for (const im of [c.near, c.far]) { im.instanceMatrix.array.fill(0, 16 * k, 16 * k + 15); im.instanceMatrix.needsUpdate = true; } count('lidar ghost trees cleared'); } }
    }
    // transmission line: lattice towers at the mapped positions, six conductors and a shield wire sagging between consecutive towers
    const CN = [[-1, -1], [1, -1], [1, 1], [-1, 1]], LV = [[0, 3.4], [7, 2.5], [13, 1.7], [18.5, 1.05], [24, 0.85], [29.5, 0.6], [33, 0.12]], tw = M.poles.filter((p) => p[2] === 1), heads = [];
    tw.forEach((p, i) => {
      const x = p[0], z = -p[1], a = tw[Math.max(0, i - 1)], b = tw[Math.min(tw.length - 1, i + 1)], dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, wx = (b[0] - a[0]) / dl, wz = -(b[1] - a[1]) / dl, ax = -wz, az = wx;
      if (!ok(x, z, 3.8)) { heads.push(null); stats.skipped.push('transmission tower at ' + Math.round(x) + ',' + Math.round(z) + ' (not on open ground)'); return; }
      cur = big; const y = hAt(x, z) - 0.3, K = (q, lv) => [x + (wx * q[0] + ax * q[1]) * lv[1], y + lv[0], z + (wz * q[0] + az * q[1]) * lv[1]], head = [];
      for (let l = 0; l < LV.length - 1; l++) for (let k = 0; k < 4; k++) { const q = CN[k], q2 = CN[(k + 1) % 4]; beam(STEEL, K(q, LV[l]), K(q, LV[l + 1]), 0.2); beam(STEEL, K(q, LV[l]), K(q2, LV[l + 1]), 0.1); if (l < 3) beam(STEEL, K(q2, LV[l]), K(q, LV[l + 1]), 0.1); beam(STEEL, K(q, LV[l + 1]), K(q2, LV[l + 1]), 0.1); }
      [[3, 6.5], [4, 5.4], [5, 4.3]].forEach(([l, len]) => { for (const s of [-1, 1]) { const tip = [x + ax * s * len, y + LV[l][0] + 0.2, z + az * s * len]; beam(STEEL, K([-1, s], LV[l]), tip, 0.12); beam(STEEL, K([1, s], LV[l]), tip, 0.12); beam(STEEL, [x + ax * s * LV[l][1], y + LV[l][0] - 2.2, z + az * s * LV[l][1]], tip, 0.12); beam(C(0x4c4a48), tip, [tip[0], tip[1] - 1.4, tip[2]], 0.16); head.push([tip[0], tip[1] - 1.4, tip[2]]); } });
      head.push([x, y + 33, z]); heads.push(head); solid(x, z, 3.8); clearTrees(x, z, 4.5); count('transmission towers');
    });
    for (let i = 0; i + 1 < heads.length; i++) {
      const a = heads[i], b = heads[i + 1]; if (!a || !b) continue; let sag = Math.hypot(b[0][0] - a[0][0], b[0][2] - a[0][2]) * 0.03;
      for (let k = 1; k < 16; k++) { const s = k / 16, room = a[0][1] + (b[0][1] - a[0][1]) * s - hAt(a[0][0] + (b[0][0] - a[0][0]) * s, a[0][2] + (b[0][2] - a[0][2]) * s) - 7; sag = Math.max(1, Math.min(sag, room / (4 * s * (1 - s)))); }   // keep the lowest conductor 7 m off the ground where the hills allow
      for (let k = 0; k < a.length; k++) span(a[k], b[k], k === 6 ? sag * 0.7 : sag); count('conductor spans', a.length);
    }
    for (const p of M.poles) {
      if (p[2] !== 2) continue;   // phone tower: guyed lattice mast in red and white bands
      const x = p[0], z = -p[1], H = 52, N = 13, R = 0.6, y = hAt(x, z) - 0.2, V = (k, yy) => [x + Math.cos(k * TAU / 3) * R, y + yy, z + Math.sin(k * TAU / 3) * R];
      if (!ok(x, z, 0.9)) { stats.skipped.push('phone mast (not on open ground)'); continue; }
      cur = big;
      for (let i = 0; i < N; i++) { const c = i % 2 ? C(0xeeeeea) : C(0xc23a2a), y0 = i * H / N, y1 = y0 + H / N; for (let k = 0; k < 3; k++) { beam(c, V(k, y0), V(k, y1), 0.11); beam(c, V(k, y0), V(k + 1, y1), 0.06); beam(c, V(k, y1), V(k + 1, y1), 0.06); } }
      for (let k = 0; k < 3; k++) { const an = k * TAU / 3 + 0.5; box(C(0xdcdcdc), x + Math.cos(an) * 1.1, y + H - 3.2, z + Math.sin(an) * 1.1, 0.2, 2.4, 0.4, Math.cos(an), Math.sin(an)); }
      beam(STEEL, [x, y + H, z], [x, y + H + 3, z], 0.07); solid(x, z, 0.9); clearTrees(x, z, 3); count('masts');
      const guy = (rg) => { for (let rot = 0; rot < TAU / 3; rot += 0.17) { const an = [0, 1, 2].map((k) => [x + Math.cos(rot + k * TAU / 3) * rg, z + Math.sin(rot + k * TAU / 3) * rg]); if (an.every((q) => { for (let s = 0.15; s < 1; s += 0.1) if (W.maskAt(x + (q[0] - x) * s, z + (q[1] - z) * s) !== 0) return false; return ok(q[0], q[1], 0.6) && empty(q[0], q[1], 1); })) return an; } return null; };
      const an = guy(22) || guy(14); if (!an) { stats.skipped.push('phone mast guys (no clear anchor points)'); continue; }
      for (const q of an) { const gy = hAt(q[0], q[1]); box(CONC, q[0], gy - 0.2, q[1], 0.8, 0.6, 0.8); solid(q[0], q[1], 0.5); for (const lv of [0.5, 0.94]) span([x, y + H * lv, z], [q[0], gy + 0.4, q[1]], 0); }
    }
    done('infrastructure');

    // ---------- 7. courthouse and the Apple Festival ----------
    const court = W.buildings.find((b) => b.kind === 'court');
    if (court) {
      // the entrance: the long-enough wall furthest north (towards Main Street) gets steps, four columns and a pediment
      let f = null; for (let k = 0; k < court.pts.length; k++) { const p = court.pts[k], q = court.pts[(k + 1) % court.pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L; if (L >= 4 && -ux < -0.9 && (!f || (p[1] + q[1]) / 2 < f.mz)) f = { p, L, ux, uz, nx: uz, nz: -ux, mx: (p[0] + q[0]) / 2, mz: (p[1] + q[1]) / 2 }; }
      const stone = C(0xe6e0d0), pw = f ? f.L + 0.8 : 0, pd = 3.4, t = f ? f.L / 2 : 0;
      if (f && ok(...wp(f, t - pw / 2, pd + 1.2), 0.3, true) && ok(...wp(f, t + pw / 2, pd + 1.2), 0.3, true)) {
        at(court.cx, court.cz, court); const yp = court.floorY + 0.6, ch = Math.min(8, court.wallH * 0.6), ye = yp + ch + 0.9, a = t - pw / 2 - 0.2, c = t + pw / 2 + 0.2;
        slab(stone, f, t, pw, pd, yp); for (let s = 1; s <= 3; s++) slab(stone, f, t, pw, pd + 0.4 * s, yp - 0.15 * s);
        for (let k = 0; k < 4; k++) { const q = wp(f, t + (k - 1.5) * (pw - 1.2) / 3, pd - 0.6); lathe(stone, q[0], yp, q[1], [[0.5, 0], [0.5, 0.25], [0.4, 0.32], [0.34, ch - 0.3], [0.47, ch - 0.22], [0.47, ch]], 10); }
        const m = wp(f, t, pd / 2); box(stone, m[0], yp + ch, m[1], pw, 0.9, pd, f.ux, f.uz);
        face(C(0xd8d0bc), w3(f, a, pd + 0.02, ye), w3(f, c, pd + 0.02, ye), w3(f, t, pd + 0.02, ye + 1.7));
        face(C(0x5d6468), w3(f, a, pd + 0.1, ye), w3(f, t, pd + 0.1, ye + 1.7), w3(f, t, 0, ye + 1.7), w3(f, a, 0, ye)); face(C(0x5d6468), w3(f, c, pd + 0.1, ye), w3(f, t, pd + 0.1, ye + 1.7), w3(f, t, 0, ye + 1.7), w3(f, c, 0, ye));
        face(stone, w3(f, t - 1.6, 0.04, yp), w3(f, t + 1.6, 0.04, yp), w3(f, t + 1.6, 0.04, yp + 3.7), w3(f, t - 1.6, 0.04, yp + 3.7)); face(C(0x3a2a1e), w3(f, t - 1.2, 0.07, yp), w3(f, t + 1.2, 0.07, yp), w3(f, t + 1.2, 0.07, yp + 3.3), w3(f, t - 1.2, 0.07, yp + 3.3));
        if (cur !== junk) W.walls.push(...wp(f, t - pw / 2, 0), ...wp(f, t - pw / 2, pd + 1.2), ...wp(f, t - pw / 2, pd + 1.2), ...wp(f, t + pw / 2, pd + 1.2), ...wp(f, t + pw / 2, pd + 1.2), ...wp(f, t + pw / 2, 0));
        claim(m[0] + f.nx * 0.6, m[1] + f.nz * 0.6, f.ux, f.uz, pw / 2, pd / 2 + 0.6); count('porticos');
        const fp = cur !== junk && spot(...wp(f, t + pw / 2 + 5, pd + 3), 10, post); if (fp) flagpole(fp[0], fp[1], 11);   // a hero courthouse (hero_courthouse.js) sets its own flagpoles
      } else stats.skipped.push('courthouse portico (no clear lawn north of the entrance)');
      // (clock faces removed: the lidar courthouse has no tower to carry them; the four plates hung in the air over the roof. The atlas keeps the dial for a tower built from real data.)
    }
    const STALLS = ['Caramel Apples', 'Apple Butter', 'Fresh Cider', 'Fried Pies', 'Apple Dumplings', 'Kettle Corn', 'Elephant Ears', 'Lemon Shake-Ups', 'Pork Tenderloins', 'Funnel Cakes', 'Crafts', 'Quilts', 'Honey', 'Pumpkins', 'Face Painting', 'Raffle'];
    const stallCell = STALLS.map((n) => slot(384, 64, (g, w, h) => { g.fillStyle = '#f6ead3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8202b'; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#7a1a1f'; U.fit(g, n, w - 30, 44, U.SIGN_FONT); g.fillText(n, w / 2, h / 2 + 2); }));
    (W.booths || []).forEach((s, k) => {   // name board hung under the front edge of each booth canopy (fronts face local -Z turned by yaw)
      const nx = -Math.sin(s[2]), nz = -Math.cos(s[2]), x = s[0] + nx * 1.95, z = s[1] + nz * 1.95, y = hAt(s[0], s[1]) + 2.26;
      at(x, z); box(DARK, x - nx * 0.03, y - 0.3, z - nz * 0.03, 3.4, 0.6, 0.05, nz, -nx); plate(stallCell[k % STALLS.length], x + nx * 0.01, y, z + nz * 0.01, nx, nz, 3.3, 0.55); count('stall boards');
    });
    if (court) {   // "Festival Parking" at the four street corners of the square, arrows towards the nearest mapped car park
      const edge = (dx, dz) => { for (let s = 5; s < 150; s++) if (W.maskAt(court.cx + dx * s, court.cz + dz * s) === 1) return s; return 0; }, e = edge(1, 0), w = edge(-1, 0), s = edge(0, 1), n = edge(0, -1);
      let lot = null, ld = 1e9; for (const a of M.areas) if (a.k === 'parking') { const c = mid(ring(a.p)), d = Math.hypot(c.x - court.cx, c.z - court.cz); if (d < ld) { ld = d; lot = c; } }
      const arrow = [0, 1].map((right) => slot(384, 192, (g, cw, chh) => { g.fillStyle = '#f6ead3'; g.fillRect(0, 0, cw, chh); g.strokeStyle = '#c8202b'; g.lineWidth = 8; g.strokeRect(6, 6, cw - 12, chh - 12); g.fillStyle = '#7a1a1f'; g.font = '52px ' + U.SIGN_FONT; g.fillText('FESTIVAL', cw / 2, 48); g.fillText('PARKING', cw / 2, 100); g.fillStyle = '#c8202b'; g.save(); g.translate(cw / 2, 152); if (!right) g.scale(-1, 1); g.beginPath(); g.moveTo(-90, -11); g.lineTo(40, -11); g.lineTo(40, -27); g.lineTo(92, 0); g.lineTo(40, 27); g.lineTo(40, 11); g.lineTo(-90, 11); g.fill(); g.restore(); }));
      if (e && w && s && n && lot) for (const [dx, dz] of [[e, -n], [e, s], [-w, -n], [-w, s]]) {
        const p = spot(court.cx + dx - Math.sign(dx) * 3.5, court.cz + dz - Math.sign(dz) * 3.5, 8, post); if (!p) { stats.skipped.push('festival parking sign (corner not clear)'); continue; }
        const [x, z] = p, y = hAt(x, z), nx = Math.sign(dx) * 0.7071, nz = Math.sign(dz) * 0.7071; at(x, z);
        box(C(0x4a4038), x, y - 0.2, z, 0.1, 3.1, 0.1, nz, -nx); box(DARK, x, y + 2.02, z, 1.56, 0.84, 0.06, nz, -nx);
        for (const o of [1, -1]) plate(arrow[((lot.x - x) * nz * o - (lot.z - z) * nx * o) > 0 ? 1 : 0], x + nx * 0.04 * o, y + 2.44, z + nz * 0.04 * o, nx * o, nz * o, 1.5, 0.75);
        solid(x, z, 0.25); count('parking signs');
      }
    }
    done('courthouse, festival');

    // ---------- meshes ----------
    if (sy + sh > AS) console.warn('landmarks: sign atlas overflow');
    const atlas = U.canvasTex(AS, AS, (g) => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, AS, AS); g.textAlign = 'center'; g.textBaseline = 'middle'; for (const s of slots) { g.save(); g.translate(s.x, s.y); g.beginPath(); g.rect(0, 0, s.w, s.h); g.clip(); s.draw(g, s.w, s.h); g.restore(); } });
    const mat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), add = (buf, m, shadow) => { const o = new T.Mesh(U.bufGeo(buf), m); o.castShadow = shadow; o.receiveShadow = true; scene.add(o); stats.triangles = (stats.triangles || 0) + buf.idx.length / 3; return o; };
    add(big, mat, true);
    const detail = [...chunks.values()].map((b) => { const o = add(b, mat, true); o.geometry.computeBoundingSphere(); return o; });
    add(A, new T.MeshLambertMaterial({ map: atlas, transparent: true, alphaTest: 0.04, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), false);
    add(padBuf, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), false);
    const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.BufferAttribute(new Float32Array(wires), 3)); scene.add(new T.LineSegments(wg, new T.LineBasicMaterial({ color: C(0x2b2d30) })));
    // flags: one small mesh, rippled every frame
    const FN = 6, fbuf = U.Buf();
    flags.forEach((f, i) => { for (let k = 0; k <= FN; k++) { const u = FLAG[0] + (FLAG[2] - FLAG[0]) * k / FN; fbuf.pos.push(0, 0, 0, 0, 0, 0); fbuf.nor.push(0.6, 0, -0.8, 0.6, 0, -0.8); fbuf.uv.push(u, FLAG[3], u, FLAG[1]); if (k) { const v = i * (FN + 1) * 2 + k * 2; fbuf.idx.push(v - 2, v - 1, v, v, v - 1, v + 1); } } });
    const fm = new T.Mesh(U.bufGeo(fbuf), new T.MeshLambertMaterial({ map: atlas, side: T.DoubleSide })), fp = fm.geometry.attributes.position; fm.frustumCulled = false; scene.add(fm);
    W.animated.push((t, dt, cam) => {
      for (let i = 0; i < flags.length; i++) for (let k = 0; k <= FN; k++) { const f = flags[i], s = k / FN, wv = Math.sin(t * 5 - s * 5 + i) * 0.2 * s, x = f[0] + 0.8 * s * 2.4 + 0.6 * wv, z = f[2] + 0.6 * s * 2.4 - 0.8 * wv, y = f[1] - s * 0.12 * (1.5 + Math.sin(t * 2 + i)), v = (i * (FN + 1) + k) * 2; fp.setXYZ(v, x, y, z); fp.setXYZ(v + 1, x, y - 1.5, z); }
      fp.needsUpdate = true;
      for (let k = 0; k < detail.length; k++) { const s = detail[k].geometry.boundingSphere; detail[k].visible = cam.position.distanceTo(s.center) < s.radius + 900; }
    });
    stats.triangles += wires.length / 6 + flags.length * FN * 2; stats.obstacles[1] = W.obstacles.length / 3; stats.walls[1] = W.walls.length / 4; W.landmarks = stats;
  };
})();
