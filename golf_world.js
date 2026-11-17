/* Bloomfield Drift — Phil Harris Golf Course: the course as a place in the world (BD.golfWorld).
   Data: golf_course.js (window.BLOOMFIELD_GOLF: holes, clubhouse, car park, cart paths, range, lidar trees) and golf_terrain.png (1 m
   USGS DEM over the course rectangle, R,G = 16-bit height as corridors.js's strips, B = surface class), both from golf/build_golf.py.
   Loads after game.js: polls until BD.game.world has routes.js's corridors, then
   - LOOKUPS (map coords, y north): BD.golfWorld = { heightAt(x, y) (1 m, bilinear; blended into the west corridor's own ground over the
     rectangle's outer 50 m and pressed to SR 54 and the corridor roads it keeps, so the seam is continuous), surfaceAt(x, y) -> 'green' |
     'tee' | 'fairway' | 'rough' | 'bunker' | 'water' | 'path' | 'oob', slopeAt(x, y) -> [dh/dx, dh/dy], inCourse(x, y), collide(x, y, r)
     (true if a tree trunk, the clubhouse or another building blocks the circle), flag(n, visible), ready, rect, info }.
   - THE WORLD: wraps W.heightXZ / W.maskAt / W.surface / W.inCorridor / W.collide so cars and the on-foot player use the 1 m ground and the
     right surfaces inside rect (grass 0 on turf, gravel 2 in sand, water 3, asphalt 1 on paths, the car park and the kept roads) and may
     drive anywhere in it; SR 54's own band keeps routes.js's answers.
   - DRAWN (built on the first approach within 1.5 km, then shown within it): the ground in 288 m chunks (2 m within 150 m, 4 m to 700 m, 8 m
     beyond, each vertex at the lowest 1 m sample around it) under a 96 m exact 1 m patch that follows the camera; one Lambert material whose
     shader reads a 1 m mask texture: mown stripes along each hole on fairways and tees, finer stripes on greens, sand, asphalt paths, the rough
     and the fields from the vertex tint; ponds and streams in the game's water look; the lidar trees as the town's instanced leaf cards (five
     cells by latitude, near cards within 60 m, the evergreens in one mesh); the clubhouse (walls with a real door opening, hipped roof, windows that light with the town's at dusk, the
     pro shop inside: floor, counter, two racks of clubs) and the other course buildings as plain shells; pin flags with cups (flag(n, v) hides
     one), tee markers, the range tee mat and yard posts. Budget at the near level: ~21 draw calls, under 400k triangles (info reports both).
   - routes.js's own things inside rect fold away: its 4 m strip terrain and the 50 m far terrain are sunk under the course as they are built,
     its trees, fence, water, lots, the cart-path ribbons and the buildings inside the course polygon are hidden by position; SR 54, the
     residential roads and the shells outside the course stay.
   Public surface: BD.golfWorld as above; nothing else. No per-frame allocations: the patch and the flags update buffers in place. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});
  const D = window.BLOOMFIELD_GOLF; if (!D) return;
  const R = D.rect, TT = D.terrain, NX = TT.nx, NY = TT.ny, X0 = TT.x0, Y1 = TT.y1, CL = TT.cls, NEAR = 1500, CHUNK = 288, PATCH = 96;
  const SURF = []; for (const k in CL) SURF[CL[k]] = k; SURF[CL.range] = 'fairway'; SURF[CL.building] = 'path';
  const MASK = []; for (const k in CL) MASK[CL[k]] = 0; MASK[CL.bunker] = 2; MASK[CL.water] = 3; MASK[CL.path] = 1; MASK[CL.building] = 5;
  const G = (B.golfWorld = { ready: false, rect: R, info: {} });
  const inRect = (x, y) => x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1;
  const inPoly = (p, x, y) => { let c = false; for (let a = 0, b = p.length - 1; a < p.length; b = a++) { const ax = p[a][0], ay = p[a][1], bx = p[b][0], by = p[b][1]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
  const segD2 = (x, y, ax, ay, bx, by) => { const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-9))); return (x - ax - ex * t) ** 2 + (y - ay - ey * t) ** 2; };
  const sstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  // ---------- the height and class grids (row 0 = north) ----------
  let H = null, CLS = null, CW = null, CWN = 0, MINH = null, MNX = 0, MNY = 0, h0 = null;      // CW: corridor weight at 2 m; MINH: lowest height per 10 m cell
  const img = new Image();
  const loaded = new Promise((ok, no) => { img.onload = () => ok(img); img.onerror = () => no(new Error('golf_terrain.png')); });
  img.src = TT.file;
  function decode() {
    const c = document.createElement('canvas'); c.width = NX; c.height = NY; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, NX, NY).data, n = NX * NY; H = new Float32Array(n); CLS = new Uint8Array(n);
    for (let k = 0; k < n; k++) { H[k] = TT.base + (d[4 * k] << 8 | d[4 * k + 1]) * TT.q; CLS[k] = d[4 * k + 2]; }
    MNX = Math.ceil(NX / 10); MNY = Math.ceil(NY / 10); MINH = new Float32Array(MNX * MNY).fill(1e9);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const q = (j / 10 | 0) * MNX + (i / 10 | 0); if (H[j * NX + i] < MINH[q]) MINH[q] = H[j * NX + i]; }
    // buildings stand on a flat floor: the highest ground under the footprint (the walker and the pro shop floor agree)
    const seen = new Uint8Array(n);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i; if (CLS[k] !== CL.building || seen[k]) continue;
      const st = [k], cells = []; seen[k] = 1; let mx = -1e9;
      while (st.length) { const q = st.pop(); cells.push(q); if (H[q] > mx) mx = H[q]; const qi = q % NX, qj = q / NX | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = qi + di, b = qj + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue; const r = b * NX + a; if (CLS[r] === CL.building && !seen[r]) { seen[r] = 1; st.push(r); } } }
      const dr = D.clubhouse.door, dd = D.clubhouse.doorDir, di = Math.round(dr[0] + dd[0] * 1.2 - X0), dj = Math.round(Y1 - (dr[1] + dd[1] * 1.2)), club = cells.some((q) => Math.abs(q % NX - di) <= 2 && Math.abs((q / NX | 0) - dj) <= 2);
      const fl = club ? H[dj * NX + di] + 0.08 : mx + 0.05;      // the clubhouse floor is a step above the ground at its door; sheds sit on their highest ground
      for (const q of cells) H[q] = fl;
    }
  }
  const rawH = (x, y) => {      // bilinear on the 1 m grid, clamped to it
    let fx = x - X0, fy = Y1 - y; fx = fx < 0 ? 0 : fx > NX - 1.001 ? NX - 1.001 : fx; fy = fy < 0 ? 0 : fy > NY - 1.001 ? NY - 1.001 : fy;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * NX + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + NX] * (1 - u) + H[k + NX + 1] * u) * v;
  };
  const clsAt = (x, y) => { const i = Math.round(x - X0), j = Math.round(Y1 - y); return i < 0 || j < 0 || i >= NX || j >= NY ? CL.oob : CLS[j * NX + i]; };
  const cwAt = (x, y) => { let fx = (x - X0) / 2, fy = (Y1 - y) / 2; fx = fx < 0 ? 0 : fx > CWN - 1.001 ? CWN - 1.001 : fx; const cwy = Math.ceil(NY / 2) + 1; fy = fy < 0 ? 0 : fy > cwy - 1.001 ? cwy - 1.001 : fy; const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * CWN + i; return (CW[k] * (1 - u) + CW[k + 1] * u) * (1 - v) + (CW[k + CWN] * (1 - u) + CW[k + CWN + 1] * u) * v; };
  const minH = (x, y, r) => { const i0 = Math.max(0, (x - X0 - r) / 10 | 0), i1 = Math.min(MNX - 1, (x - X0 + r) / 10 | 0), j0 = Math.max(0, (Y1 - y - r) / 10 | 0), j1 = Math.min(MNY - 1, (Y1 - y + r) / 10 | 0); let m = 1e9; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (MINH[j * MNX + i] < m) m = MINH[j * MNX + i]; return m; };
  G.heightAt = (x, y) => { if (!H || !inRect(x, y)) return h0 ? h0(x, -y) : 0; const w = cwAt(x, y), a = rawH(x, y); return w > 0.002 ? a + (h0(x, -y) - a) * w : a; };
  G.surfaceAt = (x, y) => (H && inRect(x, y) ? SURF[clsAt(x, y)] : 'oob');
  G.inCourse = (x, y) => G.surfaceAt(x, y) !== 'oob';
  G.slopeAt = (x, y) => [(G.heightAt(x + 0.5, y) - G.heightAt(x - 0.5, y)), (G.heightAt(x, y + 0.5) - G.heightAt(x, y - 0.5))];

  // ---------- collision: circles (trees) and segments (walls) in 16 m cells over the rectangle ----------
  const circ = [], seg = [], hit = { nx: 0, nz: 0, depth: 0 }; let cc = null, sc = null, CGN = 0, CGM = 0;
  const CG = 16, ci = (X) => Math.max(0, Math.min(CGN - 1, (X - R.x0) / CG | 0)), cj = (Z) => Math.max(0, Math.min(CGM - 1, (Z + R.y1) / CG | 0));
  function buildCollision() {
    CGN = Math.ceil((R.x1 - R.x0) / CG) + 1; CGM = Math.ceil((R.y1 - R.y0) / CG) + 1; cc = new Array(CGN * CGM); sc = new Array(CGN * CGM);
    for (let k = 0; k < circ.length; k += 3) { const c = cj(circ[k + 1]) * CGN + ci(circ[k]); (cc[c] || (cc[c] = [])).push(k); }
    for (let k = 0; k < seg.length; k += 4) { const i0 = ci(Math.min(seg[k], seg[k + 2])), i1 = ci(Math.max(seg[k], seg[k + 2])), j0 = cj(Math.min(seg[k + 1], seg[k + 3])), j1 = cj(Math.max(seg[k + 1], seg[k + 3])); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (sc[j * CGN + i] || (sc[j * CGN + i] = [])).push(k); }
  }
  function hitXZ(X, Z, r) {      // world coords; the deepest penetration, normal out of the obstacle
    if (!cc) return null; const i0 = ci(X), j0 = cj(Z); hit.depth = 0;
    for (let j = Math.max(0, j0 - 1); j <= Math.min(CGM - 1, j0 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(CGN - 1, i0 + 1); i++) {
      const a = cc[j * CGN + i], s = sc[j * CGN + i];
      if (a) for (const k of a) { const dx = X - circ[k], dz = Z - circ[k + 1], d = Math.hypot(dx, dz), pen = r + circ[k + 2] - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
      if (s) for (const k of s) { const ax = seg[k], az = seg[k + 1], ex = seg[k + 2] - ax, ez = seg[k + 3] - az, t = Math.max(0, Math.min(1, ((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1e-9))), dx = X - ax - ex * t, dz = Z - az - ez * t, d = Math.hypot(dx, dz), pen = r - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
    }
    return hit.depth > 0 ? hit : null;
  }
  G.collide = (x, y, r) => !!hitXZ(x, -y, r);
  G.flag = () => {};

  // ---------- wait for the world, then install ----------
  const poll = setInterval(() => { const g = B.game, W = g && g.world; if (!W || !W.corridors || !g.scene || !W.animated) return; clearInterval(poll); loaded.then(() => install(g, W)).catch((e) => console.error('golf world', e)); }, 100);

  function install(game, W) {
    decode();
    const U = B.util, { lin, clamp, mulberry, hash2, vnoise, Buf, bufGeo } = U, K = W.kit, scene = game.scene, rng = mulberry(1961), tc = new T.Color();
    h0 = W.heightXZ; const m0 = W.maskAt, ic0 = W.inCorridor;
    const west = W.corridors.find((c) => c.id === 'west') || W.corridors[0];
    const route = west.route, routeHW = route.hw + 3.6;
    const nearRoute = (x, y, d) => { const Z = -y; for (let k = 0; k < route.X.length; k++) { const dx = route.X[k] - x, dz = route.Z[k] - Z; if (dx * dx + dz * dz < d * d) return true; } return false; };   // 2.5 m samples
    // corridor roads kept inside rect: SR 54 and everything that is not a cart path (a service road with a point inside the course)
    const kept = west.roads.filter((s, k) => { let inr = false, course = false; for (let q = 0; q < s.X.length; q++) { const x = s.X[q], y = -s.Z[q]; if (!inRect(x, y)) continue; inr = true; if (s.cls === 'service' && (inPoly(D.course, x, y) || segD2(x, y, D.entrance[0][0], D.entrance[0][1], D.entrance[1][0], D.entrance[1][1]) < 100)) course = true; } return inr && (k === 0 || !course); });
    // the corridor weight at 2 m: 1 at the rectangle's edge fading over 50 m, 1 on SR 54 (its half-width + 3.6 m) fading over 20 m, on the other kept roads over 8 m
    CWN = Math.ceil(NX / 2) + 1; const CWM = Math.ceil(NY / 2) + 1; CW = new Float32Array(CWN * CWM);
    for (let j = 0; j < CWM; j++) for (let i = 0; i < CWN; i++) { const x = X0 + 2 * i, y = Y1 - 2 * j, e = Math.min(x - R.x0, R.x1 - x, y - R.y0, R.y1 - y); CW[j * CWN + i] = 1 - sstep(e / 50); }
    for (const s of kept) {
      const hw = s.hw + 3.6, fade = s === route ? 20 : 8, reach = hw + fade;
      for (let k = 0; k + 1 < s.X.length; k++) {
        const ax = s.X[k], ay = -s.Z[k], bx = s.X[k + 1], by = -s.Z[k + 1];
        const i0 = Math.max(0, (Math.min(ax, bx) - reach - X0) / 2 | 0), i1 = Math.min(CWN - 1, Math.ceil((Math.max(ax, bx) + reach - X0) / 2)), j0 = Math.max(0, (Y1 - Math.max(ay, by) - reach) / 2 | 0), j1 = Math.min(CWM - 1, Math.ceil((Y1 - Math.min(ay, by) + reach) / 2));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.sqrt(segD2(X0 + 2 * i, Y1 - 2 * j, ax, ay, bx, by)); if (d >= reach) continue; const w = 1 - sstep((d - hw) / fade), q = j * CWN + i; if (w > CW[q]) CW[q] = w; }
      }
    }
    const inBand = (x, y) => nearRoute(x, y, routeHW + 2);       // SR 54's own band: routes.js answers there
    // ---------- the world's lookups ----------
    W.heightXZ = (X, Z) => (inRect(X, -Z) ? G.heightAt(X, -Z) : h0(X, Z));
    W.maskAt = (X, Z) => { const y = -Z; if (!inRect(X, y) || inBand(X, y)) return m0(X, Z); return MASK[clsAt(X, y)]; };
    W.surface = (X, Z) => { const m = W.maskAt(X, Z); return m === 4 ? 0 : m === 5 ? 1 : m; };
    W.inCorridor = (X, Z) => inRect(X, -Z) || ic0(X, Z);
    const wrapCollide = () => { const c0 = W.collide; W.collide = (X, Z, r) => (inRect(X, -Z) ? hitXZ(X, Z, r) : c0(X, Z, r)); };
    if (W.collide) wrapCollide(); else { const bc = W.buildCollision; W.buildCollision = function () { bc.call(W); wrapCollide(); }; }

    // ---------- obstacles: trees, the clubhouse (door open), other buildings, the corridor's buildings outside the course ----------
    const park = D.carpark[0], spots = D.cartSpots, ent = D.entrance;
    const nearEntrance = (x, y) => { for (let k = 0; k + 1 < ent.length; k++) if (segD2(x, y, ent[k][0], ent[k][1], ent[k + 1][0], ent[k + 1][1]) < 16) return true; return false; };
    const trees = D.trees.filter((t) => !inPoly(park, t[0], t[1]) && !nearEntrance(t[0], t[1]) && !spots.some((s) => Math.hypot(s[0] - t[0], s[1] - t[1]) < 4));
    for (const t of trees) circ.push(t[0], -t[1], 0.45);
    const wallSegs = (poly, door) => { for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const p = poly[b], q = poly[a]; if (door && segD2(door[0], door[1], p[0], p[1], q[0], q[1]) < 0.25) { const ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey), ux = ex / l, uy = ey / l, t = ((door[0] - p[0]) * ux + (door[1] - p[1]) * uy); seg.push(p[0], -p[1], p[0] + ux * (t - 0.9), -(p[1] + uy * (t - 0.9)), p[0] + ux * (t + 0.9), -(p[1] + uy * (t + 0.9)), q[0], -q[1]); } else seg.push(p[0], -p[1], q[0], -q[1]); } };
    wallSegs(D.clubhouse.poly, D.clubhouse.door);
    for (const b of D.buildings) wallSegs(b.poly);
    for (const b of west.c.buildings) { const p = b.p; let any = false, course = false; for (let k = 0; k < p.length; k += 2) { if (inRect(p[k], p[k + 1])) any = true; if (inPoly(D.course, p[k], p[k + 1])) course = true; } if (any && !course) for (let k = 0; k < p.length; k += 2) { const n = (k + 2) % p.length; seg.push(p[k], -p[k + 1], p[n], -p[n + 1]); } }
    buildCollision();
    G.ready = true;

    // ---------- fold routes.js's things inside the rectangle ----------
    const fence = west.fence || [];
    const nearFence = (x, y) => { const Z = -y; for (const ln of fence) for (let q = 0; q + 1 < ln.length; q++) { const a = ln[q], c = ln[q + 1]; if (Math.abs(a[0] - x) > 25 && Math.abs(c[0] - x) > 25) continue; if (segD2(x, Z, a[0], a[1], c[0], c[1]) < 9) return true; } return false; };
    const inCourse = (x, y) => inPoly(D.course, x, y) || inPoly(D.range, x, y);
    const folds = { fence: 0, water: 0, lot: 0, bldg: 0, road: 0, mark: 0, solid: 0, wire: 0, tree: 0 };
    for (const m of scene.children) {
      const nm = m.name || ''; if (!nm.startsWith('rt:')) continue; const kind = nm.slice(3);
      if (kind === 'tree') { const a = m.instanceMatrix.array; let n = 0; for (let q = 0; q < m.count; q++) { const x = a[16 * q + 12], y = -a[16 * q + 14]; if (a[16 * q + 5] && inRect(x, y)) { a.fill(0, 16 * q, 16 * q + 16); n++; } } if (n) { m.instanceMatrix.needsUpdate = true; folds.tree += n; } continue; }
      if (kind === 'wire') { const p = m.geometry.attributes.position, a = p.array; let n = 0; for (let q = 0; q + 5 < a.length; q += 6) { const x = (a[q] + a[q + 3]) / 2, y = -(a[q + 2] + a[q + 5]) / 2; if (inRect(x, y) && inCourse(x, y) && !nearRoute(x, y, 30)) { a[q + 1] = a[q + 4] = -500; n++; } } if (n) { p.needsUpdate = true; folds.wire += n; } continue; }
      if (!(kind in folds) || !m.geometry || !m.geometry.index) continue;
      const g = m.geometry, p = g.attributes.position.array, ix = g.index.array; let n = 0;
      for (let q = 0; q < ix.length; q += 3) {
        const a = 3 * ix[q], b = 3 * ix[q + 1], c = 3 * ix[q + 2], x = (p[a] + p[b] + p[c]) / 3, y = -(p[a + 2] + p[b + 2] + p[c + 2]) / 3; if (!inRect(x, y)) continue;
        let f = false;
        if (kind === 'fence' || kind === 'water' || kind === 'lot') f = true;
        else if (kind === 'bldg') f = inPoly(D.course, x, y);
        else if (kind === 'road' || kind === 'mark') f = inCourse(x, y) && !nearRoute(x, y, routeHW + 2);
        else if (kind === 'solid') f = nearFence(x, y) || (inCourse(x, y) && !nearRoute(x, y, 30));
        if (f) { ix[q + 1] = ix[q + 2] = ix[q]; n++; }
      }
      if (n) { g.index.needsUpdate = true; folds[kind] += n; }
    }
    G.info.folds = folds;
    const sink = (m) => {      // routes.js's strip and far terrain meshes, built when first wanted: sunk under the course as they appear
      m.userData.golf = true; const p = m.geometry.attributes.position, a = p.array; let n = 0;
      for (let q = 0; q < a.length; q += 3) { const x = a[q], y = -a[q + 2]; if (x <= R.x0 + 0.5 || x >= R.x1 - 0.5 || y <= R.y0 + 0.5 || y >= R.y1 - 0.5) continue; const low = minH(x, y, 52) - 2; if (a[q + 1] > low) { a[q + 1] = low; n++; } }
      if (n) p.needsUpdate = true;
    };
    for (const m of scene.children) if ((m.name === 'rt:outer' || (m.name || '').startsWith('rt:terrain')) && !m.userData.golf) sink(m);

    // ---------- the ground: material ----------
    const mask = new Uint8Array(NX * NY * 4);
    for (let k = 0; k < NX * NY; k++) { const c = CLS[k]; mask[4 * k] = c === CL.fairway || c === CL.tee || c === CL.range ? 255 : 0; mask[4 * k + 1] = c === CL.green ? 255 : 0; mask[4 * k + 2] = c === CL.bunker ? 255 : 0; mask[4 * k + 3] = c === CL.path || c === CL.building ? 255 : 0; }
    const maskTex = new T.DataTexture(mask, NX, NY, T.RGBAFormat); maskTex.minFilter = T.LinearFilter; maskTex.magFilter = T.LinearFilter; maskTex.generateMipmaps = false; maskTex.flipY = false; maskTex.needsUpdate = true;
    const groundMat = new T.MeshLambertMaterial({ vertexColors: true, map: K.terrainMat.map });
    groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.golfMask = { value: maskTex }; sh.uniforms.golfOrg = { value: new T.Vector4(-X0 + 0.5, Y1 + 0.5, NX, NY) };
      sh.vertexShader = 'attribute vec2 axis;\nvarying vec2 vGolf, vAxis;\nvarying vec3 vWp;\nvarying float vDist;\nuniform vec4 golfOrg;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGolf = (position.xz + golfOrg.xy) / golfOrg.zw; vAxis = axis; vWp = position;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vDist = -mvPosition.z;');
      sh.fragmentShader = 'uniform sampler2D golfMask;\nvarying vec2 vGolf, vAxis;\nvarying vec3 vWp;\nvarying float vDist;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  vec4 gm = texture2D(golfMask, vGolf);
  float mown = smoothstep(0.42, 0.58, gm.r), grn = smoothstep(0.42, 0.58, gm.g), sand = smoothstep(0.42, 0.58, gm.b), pav = smoothstep(0.42, 0.58, gm.a);
  float fade = 1.0 - smoothstep(120.0, 420.0, vDist), s = dot(vWp.xz, vAxis);
  float sf = 0.5 + 0.5 * smoothstep(-0.35, 0.35, sin(s * 1.0472)) * fade, sg = 0.5 + 0.5 * smoothstep(-0.5, 0.5, sin(s * 3.1416)) * fade;
  float tex = texture2D(map, vUv).g;
  vec3 fair = mix(vec3(0.085, 0.19, 0.035), vec3(0.14, 0.27, 0.05), sf) * (0.8 + 0.4 * tex);
  vec3 green = mix(vec3(0.07, 0.19, 0.04), vec3(0.115, 0.27, 0.055), sg) * (0.92 + 0.16 * tex);
  vec3 sandc = vec3(0.56, 0.47, 0.30) * (0.75 + 0.5 * tex);
  vec3 pavc = vec3(0.045, 0.046, 0.048) * (0.7 + 0.6 * tex);
  diffuseColor.rgb = mix(diffuseColor.rgb, fair, mown); diffuseColor.rgb = mix(diffuseColor.rgb, green, grn); diffuseColor.rgb = mix(diffuseColor.rgb, sandc, sand); diffuseColor.rgb = mix(diffuseColor.rgb, pavc, pav);`);
    };
    const roughC = lin(0x5a7a2c), roughB = lin(0x7a7f3a), fieldC = lin(0x8d9a52), fieldB = lin(0xa89a5c), leafC = lin(0xa8682a);
    // the stripe axis: each hole's direction, looked up in 8 m cells; the range's its own
    const AXN = Math.ceil((R.x1 - R.x0) / 8) + 1, AXM = Math.ceil((R.y1 - R.y0) / 8) + 1, AX = new Float32Array(AXN * AXM * 2), segs = [];
    for (const h of D.holes) for (let k = 0; k + 1 < h.path.length; k++) segs.push([h.path[k], h.path[k + 1]]);
    { const p = D.range.poly, e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1]], e2 = [p[2][0] - p[1][0], p[2][1] - p[1][1]], e = Math.hypot(e1[0], e1[1]) > Math.hypot(e2[0], e2[1]) ? e1 : e2, l = Math.hypot(e[0], e[1]); G.info.rangeAxis = [e[0] / l, e[1] / l]; }
    for (let j = 0; j < AXM; j++) for (let i = 0; i < AXN; i++) {
      const x = R.x0 + 8 * i, y = R.y1 - 8 * j; let bd = 1e18, bs = null;
      for (const s of segs) { const d = segD2(x, y, s[0][0], s[0][1], s[1][0], s[1][1]); if (d < bd) { bd = d; bs = s; } }
      let dx = bs[1][0] - bs[0][0], dy = bs[1][1] - bs[0][1]; if (inPoly(D.range.poly, x, y)) { dx = G.info.rangeAxis[0]; dy = G.info.rangeAxis[1]; }
      const l = Math.hypot(dx, dy) || 1; AX[2 * (j * AXN + i)] = dx / l; AX[2 * (j * AXN + i) + 1] = -dy / l;
    }
    const axisAt = (x, y) => { const i = clamp(Math.round((x - R.x0) / 8), 0, AXN - 1), j = clamp(Math.round((R.y1 - y) / 8), 0, AXM - 1); return 2 * (j * AXN + i); };
    const tint = (x, y, c) => { const field = c === CL.oob, n1 = vnoise(x / 47, y / 47), n2 = vnoise(x / 7 + 40, y / 7); tc.copy(field ? fieldC : roughC).lerp(field ? fieldB : roughB, n1 * 0.6).lerp(leafC, Math.max(0, n2 - 0.6) * 0.9).multiplyScalar(0.92 + n2 * 0.2); return tc; };
    const gridN = (i, j) => { const i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NY - 1, j + 1), gx = (H[j * NX + i0] - H[j * NX + i1]) / (i1 - i0 || 1), gz = (H[j0 * NX + i] - H[j1 * NX + i]) / (j1 - j0 || 1), il = 1 / Math.hypot(gx, 1, gz); return [gx * il, il, gz * il]; };   // row j grows south (+Z)
    const chunks = [], CS = CHUNK;
    function chunkGeo(ch, st) {
      const i0 = ch.i0, j0 = ch.j0, w = Math.ceil((ch.i1 - i0) / st) + 1, hN = Math.ceil((ch.j1 - j0) / st) + 1, n = w * hN;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), ax = new Float32Array(n * 2), idx = new Uint32Array((w - 1) * (hN - 1) * 6); let p = 0, t = 0;
      for (let b = 0; b < hN; b++) for (let a = 0; a < w; a++, p++) {
        const i = Math.min(ch.i1, i0 + a * st), j = Math.min(ch.j1, j0 + b * st), x = X0 + i, y = Y1 - j; let hh = 1e9;
        for (let jj = Math.max(0, j - st); jj <= Math.min(NY - 1, j + st); jj++) for (let ii = Math.max(0, i - st); ii <= Math.min(NX - 1, i + st); ii++) if (H[jj * NX + ii] < hh) hh = H[jj * NX + ii];
        const cw = cwAt(x, y); if (cw > 0.002) hh += (h0(x, -y) - hh) * cw; hh -= 0.025;
        pos[3 * p] = x; pos[3 * p + 1] = hh; pos[3 * p + 2] = -y; const nn = gridN(i, j); nor[3 * p] = nn[0]; nor[3 * p + 1] = nn[1]; nor[3 * p + 2] = nn[2];
        const c = tint(x, y, CLS[j * NX + i]); col[3 * p] = c.r; col[3 * p + 1] = c.g; col[3 * p + 2] = c.b; uv[2 * p] = x / 14; uv[2 * p + 1] = -y / 14; const q = axisAt(x, y); ax[2 * p] = AX[q]; ax[2 * p + 1] = AX[q + 1];
      }
      for (let b = 0; b < hN - 1; b++) for (let a = 0; a < w - 1; a++) { const v = b * w + a; idx[t++] = v; idx[t++] = v + w; idx[t++] = v + 1; idx[t++] = v + 1; idx[t++] = v + w; idx[t++] = v + w + 1; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('axis', new T.BufferAttribute(ax, 2)); g.setIndex(new T.BufferAttribute(idx, 1)); return g;
    }
    for (let j0 = 0; j0 < NY - 1; j0 += CS) for (let i0 = 0; i0 < NX - 1; i0 += CS) chunks.push({ i0, j0, i1: Math.min(NX - 1, i0 + CS), j1: Math.min(NY - 1, j0 + CS), x0: X0 + i0, x1: X0 + Math.min(NX - 1, i0 + CS), z0: -(Y1 - j0), z1: -(Y1 - Math.min(NY - 1, j0 + CS)), lods: [] });
    const STEPS = [2, 4, 8], meshes = [];
    const chunkMesh = (ch, l) => { const m = new T.Mesh(chunkGeo(ch, STEPS[l]), groundMat); m.name = 'golf:ground' + l; m.receiveShadow = true; m.visible = false; m.frustumCulled = true; scene.add(m); meshes.push(m); return m; };
    // the 1 m patch round the camera (updated in place when it has moved 24 m)
    const PN = PATCH + 1, patchPos = new Float32Array(PN * PN * 3), patchNor = new Float32Array(PN * PN * 3), patchCol = new Float32Array(PN * PN * 3), patchUv = new Float32Array(PN * PN * 2), patchAx = new Float32Array(PN * PN * 2), patchIdx = new Uint32Array(PATCH * PATCH * 6);
    { let t = 0; for (let b = 0; b < PATCH; b++) for (let a = 0; a < PATCH; a++) { const v = b * PN + a; patchIdx[t++] = v; patchIdx[t++] = v + PN; patchIdx[t++] = v + 1; patchIdx[t++] = v + 1; patchIdx[t++] = v + PN; patchIdx[t++] = v + PN + 1; } }
    const patchG = new T.BufferGeometry(); patchG.setAttribute('position', new T.BufferAttribute(patchPos, 3)); patchG.setAttribute('normal', new T.BufferAttribute(patchNor, 3)); patchG.setAttribute('color', new T.BufferAttribute(patchCol, 3)); patchG.setAttribute('uv', new T.BufferAttribute(patchUv, 2)); patchG.setAttribute('axis', new T.BufferAttribute(patchAx, 2)); patchG.setIndex(new T.BufferAttribute(patchIdx, 1));
    const patchMat = groundMat.clone(); patchMat.onBeforeCompile = groundMat.onBeforeCompile; patchMat.polygonOffset = true; patchMat.polygonOffsetFactor = -1; patchMat.polygonOffsetUnits = -2;
    const patch = new T.Mesh(patchG, patchMat); patch.name = 'golf:patch'; patch.receiveShadow = true; patch.visible = false; patch.frustumCulled = false; scene.add(patch);
    let pcx = 1e9, pcy = 1e9;
    function movePatch(cx, cy) {
      pcx = cx = Math.round(clamp(cx, R.x0 + PATCH / 2, R.x1 - PATCH / 2)); pcy = cy = Math.round(clamp(cy, R.y0 + PATCH / 2, R.y1 - PATCH / 2));
      let p = 0; const i0 = cx - PATCH / 2 - X0, j0 = Y1 - (cy + PATCH / 2);
      for (let b = 0; b < PN; b++) for (let a = 0; a < PN; a++, p++) {
        const i = clamp(i0 + a, 0, NX - 1), j = clamp(j0 + b, 0, NY - 1), x = X0 + i, y = Y1 - j;
        patchPos[3 * p] = x; patchPos[3 * p + 1] = G.heightAt(x, y); patchPos[3 * p + 2] = -y; const nn = gridN(i, j); patchNor[3 * p] = nn[0]; patchNor[3 * p + 1] = nn[1]; patchNor[3 * p + 2] = nn[2];
        const c = tint(x, y, CLS[j * NX + i]); patchCol[3 * p] = c.r; patchCol[3 * p + 1] = c.g; patchCol[3 * p + 2] = c.b; patchUv[2 * p] = x / 14; patchUv[2 * p + 1] = -y / 14; const q = axisAt(x, y); patchAx[2 * p] = AX[q]; patchAx[2 * p + 1] = AX[q + 1];
      }
      for (const a of ['position', 'normal', 'color', 'uv', 'axis']) patchG.attributes[a].needsUpdate = true;
      patchG.computeBoundingSphere();
    }

    // ---------- water: ponds at their lowest shore, streams as 2.2 m ribbons in their dug beds ----------
    const water = (() => {
      const b = Buf(), seen = [];
      for (const h of D.holes) for (const w of h.water) { if (seen.some((s) => s === w)) continue; seen.push(w); }
      for (const w of seen) {
        const ring = w.map((p) => new T.Vector2(p[0], -p[1])); let lvl = 1e9; for (const p of w) lvl = Math.min(lvl, rawH(p[0], p[1])); lvl += 0.25;
        const v0 = b.pos.length / 3; for (const p of ring) { b.pos.push(p.x, lvl, p.y); b.nor.push(0, 1, 0); }
        for (const f of T.ShapeUtils.triangulateShape(ring, [])) { const a = ring[f[0]], c = ring[f[1]], d = ring[f[2]], up = (c.y - a.y) * (d.x - a.x) - (c.x - a.x) * (d.y - a.y) > 0; b.idx.push(v0 + f[0], v0 + (up ? f[1] : f[2]), v0 + (up ? f[2] : f[1])); }
      }
      for (const s of D.streams || []) {
        for (let k = 0; k + 1 < s.length; k++) {
          const [ax, ay] = s[k], [bx, by] = s[k + 1], ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1, nx = -ey / l * 1.1, ny = ex / l * 1.1, ya = rawH(ax, ay) + 0.15, yb = rawH(bx, by) + 0.15, v0 = b.pos.length / 3;
          b.pos.push(ax + nx, ya, -(ay + ny), ax - nx, ya, -(ay - ny), bx + nx, yb, -(by + ny), bx - nx, yb, -(by - ny)); for (let q = 0; q < 4; q++) b.nor.push(0, 1, 0);
          b.idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
        }
      }
      const m = new T.Mesh(bufGeo(b), new T.MeshPhongMaterial({ color: lin(0x3f6672), specular: lin(0xfff0d0), shininess: 90, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.name = 'golf:water'; m.visible = false; scene.add(m); return m;
    })();

    // ---------- trees: the town's leaf cards, two cells (north and south halves), near cards within 90 m of a cell ----------
    const treeCells = (() => {
      const T0 = W.treeChunks[0], leafMat = T0.near.material, leafDepth = T0.near.customDepthMaterial, nearG = T0.near.geometry, farG = T0.far.geometry, fir = W.firMesh, dummy = new T.Object3D(), cells = [];
      const NC = 5, th = (R.y1 - R.y0) / NC, groups = []; for (let k = 0; k < NC; k++) groups.push({ t: [], f: [] });
      for (const t of trees) { const ever = !!t[4], g = groups[ever ? 0 : Math.min(NC - 1, (t[1] - R.y0) / th | 0)]; (ever ? g.f : g.t).push({ X: t[0], Z: -t[1], y: G.heightAt(t[0], t[1]) - 0.3, sx: ever ? Math.max(3, t[3] * 1.7) : Math.max(3.5, t[3] * 2.2), sy: Math.max(4, t[2] * 1.04), c: K.fallColor(rng, ever), rot: rng() * 6.28 }); }
      for (const gr of groups) {
        const all = gr.t.concat(gr.f); if (!all.length) continue; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (const t of all) { lo[0] = Math.min(lo[0], t.X); hi[0] = Math.max(hi[0], t.X); lo[1] = Math.min(lo[1], t.y); hi[1] = Math.max(hi[1], t.y + t.sy); lo[2] = Math.min(lo[2], t.Z); hi[2] = Math.max(hi[2], t.Z); }
        const sphere = new T.Sphere(new T.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 15);
        const mk = (base, mat, depth, list, shadow) => { if (!list.length) return null; const g = new T.BufferGeometry(); for (const a in base.attributes) g.setAttribute(a, base.attributes[a]); g.setIndex(base.index); g.boundingSphere = sphere; const m = new T.InstancedMesh(g, mat, list.length); m.name = 'golf:tree'; m.customDepthMaterial = depth; list.forEach((t, k) => { dummy.position.set(t.X, t.y, t.Z); dummy.scale.set(t.sx, t.sy, t.sx); dummy.rotation.set(0, t.rot, 0); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); m.setColorAt(k, t.c); }); m.castShadow = shadow; m.visible = false; scene.add(m); return m; };
        cells.push({ x0: lo[0], x1: hi[0], z0: lo[2], z1: hi[2], near: mk(nearG, leafMat, leafDepth, gr.t, true), far: mk(farG, leafMat, leafDepth, gr.t, false), fir: mk(fir.geometry, fir.material, fir.customDepthMaterial, gr.f, true) });
      }
      return cells;
    })();

    // ---------- buildings: the clubhouse (walls with the door opening, hipped roof, windows, the pro shop inside) and plain shells ----------
    const WALL = lin(0xeae4d2), TRIM = lin(0xf6f4ee), ROOF = lin(0x3b3b3d), SHED = lin(0xb9b4a6), SHEDR = lin(0x6a6d70), FLOOR = lin(0x8a6a44), WOOD = lin(0x5a3b22), DARK = lin(0x2a2a2e), STEEL = lin(0xb8bcc2), GRIP = lin(0x202024), REDH = lin(0x9a2a24), GLASS = lin(0x6f879a);
    const ext = Buf(), inn = Buf(), win = Buf();
    const quad = (b, a, c, d, e, n, col, uvs) => { const v0 = b.pos.length / 3; for (const p of [a, c, d, e]) { b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); b.col.push(col.r, col.g, col.b); } if (uvs) b.uv.push(...uvs); b.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3); };
    const box = (b, col, x, y, z, sx, sy, sz, yaw) => { const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c], hx = sx / 2, hy = sy / 2, hz = sz / 2;
      quad(b, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), [s, 0, c], col); quad(b, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), [-s, 0, -c], col);
      quad(b, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), [c, 0, -s], col); quad(b, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), [-c, 0, s], col);
      quad(b, P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), [0, 1, 0], col); };
    function building(poly, h, door, isClub) {
      let fl = -1e9; for (const p of poly) fl = Math.max(fl, rawH(p[0], p[1])); fl += 0.05;      // the flat floor heightAt gives under the footprint
      const wallC = isClub ? WALL : SHED, roofC = isClub ? ROOF : SHEDR, top = fl + h, cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const p = poly[b], q = poly[a], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey), ux = ex / l, uy = ey / l; let nx = uy, ny = -ux;      // outward for a counter-clockwise ring
        if (inPoly(poly, (p[0] + q[0]) / 2 + nx * 0.3, (p[1] + q[1]) / 2 + ny * 0.3)) { nx = -nx; ny = -ny; }
        const N = [nx, 0, -ny], at = (t, yy) => [p[0] + ux * t, yy, -(p[1] + uy * t)];
        const td = door && segD2(door[0], door[1], p[0], p[1], q[0], q[1]) < 0.25 ? (door[0] - p[0]) * ux + (door[1] - p[1]) * uy : -1;
        if (td >= 0) { quad(ext, at(0, fl - 0.6), at(td - 0.8, fl - 0.6), at(td - 0.8, top), at(0, top), N, wallC); quad(ext, at(td + 0.8, fl - 0.6), at(l, fl - 0.6), at(l, top), at(td + 0.8, top), N, wallC); quad(ext, at(td - 0.8, fl + 2.2), at(td + 0.8, fl + 2.2), at(td + 0.8, top), at(td - 0.8, top), N, wallC);
          for (const s of [-0.85, 0.85]) box(ext, TRIM, p[0] + ux * (td + s) + nx * 0.06, fl + 1.1, -(p[1] + uy * (td + s) + ny * 0.06), 0.1, 2.3, 0.1, Math.atan2(uy, ux)); box(ext, TRIM, p[0] + ux * td + nx * 0.06, fl + 2.25, -(p[1] + uy * td + ny * 0.06), 1.8, 0.1, 0.1, Math.atan2(uy, ux)); }
        else quad(ext, at(0, fl - 0.6), at(l, fl - 0.6), at(l, top), at(0, top), N, wallC);
        if (isClub && l > 5) { const nw = Math.floor(l / 3.6); for (let k = 0; k < nw; k++) { const t = (k + 0.5) * l / nw; if (td >= 0 && Math.abs(t - td) < 1.8) continue; const w = [p[0] + ux * t + nx * 0.03, -(p[1] + uy * t + ny * 0.03)]; quad(win, [w[0] - ux * 0.6, fl + 1.0, w[1] + uy * 0.6], [w[0] + ux * 0.6, fl + 1.0, w[1] - uy * 0.6], [w[0] + ux * 0.6, fl + 2.3, w[1] - uy * 0.6], [w[0] - ux * 0.6, fl + 2.3, w[1] + uy * 0.6], N, GLASS); } }
      }
      // hipped roof on the footprint's oriented box, eaves 0.4 m out
      let best = null; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const ex = poly[a][0] - poly[b][0], ey = poly[a][1] - poly[b][1], l = Math.hypot(ex, ey); if (l < 1) continue; const ux = ex / l, uy = ey / l; let s0 = 1e9, s1 = -1e9, t0 = 1e9, t1 = -1e9; for (const p of poly) { const s = p[0] * ux + p[1] * uy, t = -p[0] * uy + p[1] * ux; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); } const ar = (s1 - s0) * (t1 - t0); if (!best || ar < best.ar) best = { ar, ux, uy, s0, s1, t0, t1 }; }
      const { ux, uy, s0, s1, t0, t1 } = best, L = (ux0, uy0, s, t) => [s * ux0 - t * uy0, -(s * uy0 + t * ux0)], long = s1 - s0 >= t1 - t0, A = long ? [s0 - 0.4, s1 + 0.4] : [t0 - 0.4, t1 + 0.4], Bb = long ? [t0 - 0.4, t1 + 0.4] : [s0 - 0.4, s1 + 0.4], half = (Bb[1] - Bb[0]) / 2, rise = Math.min(half, 4) * 0.7, rh = top + rise, hip = Math.min(half, (A[1] - A[0]) / 2 - 0.5);
      const P = (a, bb, yy) => { const s = long ? a : bb, t = long ? bb : a, w = L(ux, uy, s, t); return [w[0], yy, w[1]]; }, mid = (Bb[0] + Bb[1]) / 2;
      const c0 = P(A[0], Bb[0], top), c1 = P(A[1], Bb[0], top), c2 = P(A[1], Bb[1], top), c3 = P(A[0], Bb[1], top), r0 = P(A[0] + hip, mid, rh), r1 = P(A[1] - hip, mid, rh);
      const face = (pts) => { const v0 = ext.pos.length / 3, a = pts[0], b = pts[1], c = pts[2]; let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]; const il = 1 / (Math.hypot(n[0], n[1], n[2]) || 1); n = n.map((v) => v * il); const up = n[1] >= 0; for (const p of pts) { ext.pos.push(p[0], p[1], p[2]); ext.nor.push(up ? n[0] : -n[0], up ? n[1] : -n[1], up ? n[2] : -n[2]); ext.col.push(roofC.r, roofC.g, roofC.b); } for (let k = 1; k + 1 < pts.length; k++) ext.idx.push(v0, up ? v0 + k : v0 + k + 1, up ? v0 + k + 1 : v0 + k); };
      face([c0, c1, r1, r0]); face([c2, c3, r0, r1]); face([c1, c2, r1]); face([c3, c0, r0]);
      for (const [a, b] of [[c0, c1], [c1, c2], [c2, c3], [c3, c0]]) quad(ext, [a[0], top - 0.25, a[2]], [b[0], top - 0.25, b[2]], [b[0], top, b[2]], [a[0], top, a[2]], [0, 0, 1], TRIM);
      const cyl = (s) => { const w = L(ux, uy, s, mid); return w; };     // along the long axis
      return { fl, cx, cy, ux: long ? ux : -uy, uy: long ? uy : ux, ax: cyl };
    }
    const club = building(D.clubhouse.poly, D.clubhouse.h, D.clubhouse.door, true);
    for (const b of D.buildings) building(b.poly, b.h, null, false);
    {   // the pro shop: floor, counter facing the door, two racks of clubs on the back wall, a register
      const fl = club.fl, ring = D.clubhouse.poly.map((p) => new T.Vector2(p[0], -p[1])), v0 = inn.pos.length / 3;
      for (const p of ring) { inn.pos.push(p.x, fl + 0.01, p.y); inn.nor.push(0, 1, 0); inn.col.push(FLOOR.r, FLOOR.g, FLOOR.b); }
      for (const f of T.ShapeUtils.triangulateShape(ring, [])) { const a = ring[f[0]], c = ring[f[1]], d = ring[f[2]], up = (c.y - a.y) * (d.x - a.x) - (c.x - a.x) * (d.y - a.y) > 0; inn.idx.push(v0 + f[0], v0 + (up ? f[1] : f[2]), v0 + (up ? f[2] : f[1])); }
      const dd = D.clubhouse.doorDir, yaw = Math.atan2(-dd[1], dd[0]) + Math.PI / 2, cnt = D.clubhouse.proshop.counter;
      box(inn, WOOD, cnt[0], fl + 0.52, -cnt[1], 3.2, 1.04, 0.9, yaw); box(inn, DARK, cnt[0], fl + 1.17, -cnt[1], 0.36, 0.26, 0.3, yaw);
      for (const side of [-1, 1]) {
        const rx = cnt[0] - dd[0] * 3.2 + (-dd[1]) * side * 2.2, ry = cnt[1] - dd[1] * 3.2 + dd[0] * side * 2.2;
        box(inn, WOOD, rx, fl + 0.9, -ry, 2.2, 1.8, 0.42, yaw); box(inn, WOOD, rx, fl + 0.12, -ry, 2.3, 0.24, 0.6, yaw);
        for (let k = 0; k < 11; k++) { const t = -1.0 + k * 0.2, hx = rx + (-dd[1]) * t, hy = ry + dd[0] * t, col = k % 3 === 0 ? REDH : k % 3 === 1 ? STEEL : DARK; box(inn, STEEL, hx - dd[0] * 0.14, fl + 0.72, -(hy - dd[1] * 0.14), 0.025, 1.0, 0.025, yaw); box(inn, col, hx - dd[0] * 0.18, fl + 1.25, -(hy - dd[1] * 0.18), 0.07, 0.05, 0.1, yaw); box(inn, GRIP, hx - dd[0] * 0.14, fl + 0.32, -(hy - dd[1] * 0.14), 0.035, 0.3, 0.035, yaw); }
      }
    }
    const extMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), winMat = new T.MeshLambertMaterial({ vertexColors: true, emissive: lin(0xffd27a), emissiveIntensity: 0, side: T.DoubleSide });
    const extMesh = new T.Mesh(bufGeo(ext), extMat), innMesh = new T.Mesh(bufGeo(inn), new T.MeshLambertMaterial({ vertexColors: true, emissive: lin(0x3a3128) })), winMesh = new T.Mesh(bufGeo(win), winMat);
    for (const m of [extMesh, innMesh, winMesh]) { m.name = 'golf:bldg'; m.castShadow = m !== winMesh; m.receiveShadow = true; m.visible = false; scene.add(m); }
    { const g0 = W.windowGlow; W.windowGlow = (v) => { if (g0) g0(v); winMat.emissiveIntensity = v; }; }

    // ---------- flags with cups (dynamic), tee markers, the range mat and yard posts (static) ----------
    const flags = Buf(), marks = Buf(), FLAG = lin(0xd62828), POLE = lin(0xf4f4f0), CUP = lin(0x101010), HOLE_RANGE = {};
    for (const h of D.holes) {
      const x = h.pin[0], z = -h.pin[1], y = G.heightAt(h.pin[0], h.pin[1]), v0 = flags.pos.length / 3;
      box(flags, CUP, x, y + 0.012, z, 0.22, 0.02, 0.22, 0); box(flags, POLE, x, y + 1.1, z, 0.035, 2.2, 0.035, 0);
      quad(flags, [x, y + 2.2, z], [x + 0.55, y + 2.05, z + 0.12], [x + 0.55, y + 1.8, z + 0.12], [x, y + 1.75, z], [0, 0, 1], FLAG);
      HOLE_RANGE[h.n] = [v0, flags.pos.length / 3, 0];
      const d = h.path.length > 1 ? [h.path[1][0] - h.tee[0], h.path[1][1] - h.tee[1]] : [1, 0], l = Math.hypot(d[0], d[1]) || 1, nx = -d[1] / l, ny = d[0] / l;
      for (const t of h.tees) for (const s of [-2.2, 2.2]) { const mx = t.p[0] + nx * s, my = t.p[1] + ny * s; box(marks, h.n <= 9 ? lin(0xf2f2f2) : lin(0x2d5fb8), mx, G.heightAt(mx, my) + 0.1, -my, 0.18, 0.2, 0.18, 0); }
    }
    { const t = D.range.tee, ax = G.info.rangeAxis, y = G.heightAt(t[0], t[1]); box(marks, lin(0x2f5a28), t[0], y + 0.02, -t[1], 3.2, 0.04, 2.0, Math.atan2(-ax[1], ax[0]) + Math.PI / 2);
      for (const m of D.range.yardMarkers) { const yy = G.heightAt(m[0], m[1]); box(marks, POLE, m[0], yy + 0.6, -m[1], 0.12, 1.2, 0.12, 0); box(marks, m[2] === 150 ? FLAG : m[2] % 100 === 0 ? lin(0x2d5fb8) : lin(0xf0c020), m[0], yy + 1.0, -m[1], 0.5, 0.3, 0.06, Math.atan2(-ax[1], ax[0]) + Math.PI / 2); } }
    for (const s of D.cartSpots) box(marks, lin(0xf2f2f2), s[0], G.heightAt(s[0], s[1]) + 0.01, -s[1], 0.1, 0.02, 3.0, -s[2]);
    const flagMesh = new T.Mesh(bufGeo(flags), new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })), markMesh = new T.Mesh(bufGeo(marks), new T.MeshLambertMaterial({ vertexColors: true }));
    for (const m of [flagMesh, markMesh]) { m.name = 'golf:marks'; m.castShadow = true; m.visible = false; m.frustumCulled = false; scene.add(m); }
    G.flag = (n, visible) => { const r = HOLE_RANGE[n]; if (!r || r[2] === (visible ? 0 : 1)) return; r[2] = visible ? 0 : 1; const p = flagMesh.geometry.attributes.position, a = p.array, d = visible ? 1000 : -1000; for (let k = r[0]; k < r[1]; k++) a[3 * k + 1] += d; p.needsUpdate = true; };

    // ---------- per frame: build on approach, level of detail, the patch, the fold of routes.js's lazy terrain ----------
    const stat = [water, extMesh, innMesh, winMesh, flagMesh, markMesh]; let on = false, lodT = 0, lx = 1e9, lz = 1e9, scanT = 0;
    const dist = (o, cx, cz) => Math.hypot(cx - clamp(cx, o.x0, o.x1), cz - clamp(cz, o.z0, o.z1));
    const rectD = (cx, cz) => Math.hypot(cx - clamp(cx, R.x0, R.x1), cz - clamp(cz, -R.y1, -R.y0));
    W.animated.push((t, dt, cam) => {
      const cx = cam.position.x, cz = cam.position.z, moved = Math.abs(cx - lx) + Math.abs(cz - lz);
      if ((scanT -= dt) <= 0) { scanT = 0.5; for (const m of scene.children) if ((m.name === 'rt:outer' || (m.name || '').startsWith('rt:terrain')) && !m.userData.golf) sink(m); }
      if ((lodT -= dt) > 0 && moved < 30) return; lodT = 0.3; lx = cx; lz = cz;
      const near = rectD(cx, cz) < NEAR; if (near !== on) { on = near; for (const m of stat) m.visible = near; if (!near) { for (const ch of chunks) for (const m of ch.lods) if (m) m.visible = false; patch.visible = false; for (const c of treeCells) for (const m of [c.near, c.far, c.fir]) if (m) m.visible = false; } }
      if (!near) return;
      let tris = 0, calls = 0, trG = 0, trT = 0;
      for (const ch of chunks) {
        const d = dist(ch, cx, cz), l = d < 150 ? 0 : d < 700 ? 1 : 2; if (ch.lods[l] === undefined) ch.lods[l] = chunkMesh(ch, l);
        for (let k = 0; k < 3; k++) if (ch.lods[k]) ch.lods[k].visible = k === l; tris += ch.lods[l].geometry.index.count / 3; trG += ch.lods[l].geometry.index.count / 3; calls++;
      }
      const inR = inRect(cx, -cz); patch.visible = inR || rectD(cx, cz) < 60; if (patch.visible && Math.abs(cx - pcx) + Math.abs(-cz - pcy) > 24) movePatch(cx, -cz);
      if (patch.visible) { tris += PATCH * PATCH * 2; calls++; }
      for (const c of treeCells) { const d = dist(c, cx, cz), nr = d < 60; if (c.near) { c.near.visible = nr; if (nr) { tris += c.near.count * c.near.geometry.index.count / 3; trT += c.near.count * c.near.geometry.index.count / 3; calls++; } } if (c.far) { c.far.visible = !nr; if (!nr) { tris += c.far.count * c.far.geometry.index.count / 3; trT += c.far.count * c.far.geometry.index.count / 3; calls++; } } if (c.fir) { c.fir.visible = true; tris += c.fir.count * c.fir.geometry.index.count / 3; trT += c.fir.count * c.fir.geometry.index.count / 3; calls++; } }
      for (const m of stat) { tris += m.geometry.index.count / 3; calls++; }
      G.info.tris = Math.round(tris); G.info.calls = calls; G.info.trisGround = Math.round(trG); G.info.trisTrees = Math.round(trT);
    });
    G.info.trees = trees.length; G.info.kept = kept.length; G.info.clubFloor = club.fl;
  }
})();
