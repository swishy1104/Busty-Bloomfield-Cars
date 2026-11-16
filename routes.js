/* Bloomfield Drift — the roads out of town (BD.buildRoutes). Two drivable corridors leave the 4.1 km town square along the real roads:
   north on State Road 157 (N Washington St) to a private property 6.2 km out, and west on W Main St / SR 54 over the White River,
   through Switz City, to the Taco Bell on A St in Linton (16 km). Only a strip about 300 m either side of the road exists: a farm
   fence 200 m out (gates and barricades where it crosses a road) keeps the car on it, and the horizon beyond is the 50 m far terrain.
   South of town an area corridor (kind 'area') adds a whole band half a mile deep along the south edge: every road crossing that edge
   (US 231, Baseline Road, 100 West ...) runs on into it, the car drives anywhere in it, and the fence runs round its outer sides and up both
   ends of the town's edge strip (the 55 m between PLAY and the old edge), so game.js's map-edge clamp never has to move a car there.
   Data: corridors.js (window.BLOOMFIELD_CORRIDORS, tools/build_corridors.py): roads with graded levels, lidar trees and roofs, Overture
   buildings, mailboxes, power lines, water; corridor_north.png / corridor_west.png (4 m graded terrain + land cover) and
   corridor_far.png (50 m horizon terrain + land cover).
   Adds: terrain strips (512 m chunks at 4 / 8 / 16 / 32 / 64 m, the town's ground shading), the far terrain past the town's horizon ring
   (drawn only out of town), roads with the town's markings, the White River bridge, trees (the town's instanced leaf cards), the
   buildings as plain shells (the town's far-shell material), utility poles and wires, mailboxes, the fence, road signs, water, rails,
   and in the band the 345 kV line's lattice towers where the lidar found them.
   Deep in town (over 1 km from both mouths) none of it is drawn and the town's own horizon ring and edge woods show, so town views cost
   what they did (the band shows from 600 m); terrain and far-terrain meshes are built when first wanted, nearest first; the minimap layers on the first frame.
   Public surface: await BD.buildRoutes({ scene, W, M, game }) (game.js, right after BD.buildWorld; uses W.kit, W.farMesh, W.firMesh,
   W.treeChunks from world.js and the 'buildings-far' material from buildings.js). It wraps W.heightXZ (one continuous surface: the strips'
   ground with the roads pressed in as the town's are; on a ribbon and its shoulder the road's own smoothed profile, C1 along the road, as the
   ribbon draws it; the decks' own level; a blend over the town's last 8 m), W.surface, W.maskAt, W.inBuilding, W.nearestRoad
   (band roads only where a car can stand: 3 m or more inside the fence, so a reset never lands on it) and W.buildCollision (-> W.collide) so they answer inside the corridors, and
   adds W.corridors (the strips), W.inCorridor(X, Z) (inside a corridor's fence: game.js lifts the map-edge clamp there) and
   W.drawMap(ctx, px, py, span) (the corridors on the minimap). W.roads is unchanged: street furniture and challenges stay in town, and
   traffic.js treats everything past PLAY - 60 m as the map edge (no spawns, cars end there), so the corridors have no traffic. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});
  const D = 200, CH = 128, CELL = 512;      // fence distance from the route (m); terrain chunk = 128 cells of 4 m; prop cell (m)

  B.buildRoutes = async function ({ scene, W, game }) {
    const C = window.BLOOMFIELD_CORRIDORS, K = W.kit; if (!C || !K || !W.farMesh) return;
    const U = B.util, { lin, clamp, sstep, mulberry, hash2, vnoise, canvasTex, Buf, bufGeo } = U, HALF = W.HALF, rng = mulberry(5402), tc = new T.Color();
    const town = { h: W.heightXZ, mask: W.maskAt, road: W.nearestRoad };
    const inSq = (X, Z) => X >= -HALF && X <= HALF && Z >= -HALF && Z <= HALF;
    const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Could not load ' + src)); im.src = src; });
    const pixels = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const imgs = await Promise.all([C.far.file].concat(C.corridors.map((c) => c.terrain.file)).map(load));

    // ---------- far terrain (50 m) ----------
    const F = C.far, FNX = F.nx, FNZ = F.ny, FX0 = F.x0, FZ0 = -F.y1, FS = F.step, FH = new Float32Array(FNX * FNZ), FC = new Uint8Array(FNX * FNZ);
    { const d = pixels(imgs[0]); for (let k = 0; k < FH.length; k++) { FH[k] = C.base + (d[4 * k] << 8 | d[4 * k + 1]) * C.q; FC[k] = d[4 * k + 2]; } }
    const farAt = (X, Z) => { const fx = clamp((X - FX0) / FS, 0, FNX - 1.001), fz = clamp((Z - FZ0) / FS, 0, FNZ - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * FNX + i; return (FH[k] * (1 - u) + FH[k + 1] * u) * (1 - v) + (FH[k + FNX] * (1 - u) + FH[k + FNX + 1] * u) * v; };

    // ---------- strips: 4 m graded terrain + land cover; roads in world coords ----------
    const CS = C.corridors.map((c, ci) => {
      const t = c.terrain, nx = t.nx, nz = t.ny, n = nx * nz, H = new Float32Array(n), cov = new Uint8Array(n), d = pixels(imgs[ci + 1]);
      if (imgs[ci + 1].width !== nx || imgs[ci + 1].height !== nz) throw new Error(t.file + ' does not match its grid');
      for (let k = 0; k < n; k++) { H[k] = C.base + (d[4 * k] << 8 | d[4 * k + 1]) * C.q; cov[k] = d[4 * k + 2]; }
      const R = { id: c.id, c, nx, nz, H, cov, X0: t.x0, Z0: -t.y1, X1: t.x0 + (nx - 1) * 4, Z1: -t.y1 + (nz - 1) * 4, roads: [], bridges: [], circ: [], seg: [], cells: [] };
      if (c.band) { const b = c.band; R.area = { x0: b.x0, x1: b.x1, z0: -b.y1, z1: -b.y0 }; }      // the band's drivable rectangle (world coords)
      R.cnx = Math.ceil((R.X1 - R.X0) / CELL); R.cnz = Math.ceil((R.Z1 - R.Z0) / CELL);
      c.roads.forEach((r, ri) => {       // the route keeps its 2.5 m points (spans and bridges index them); side roads are resampled to 2.5 m
        const p = r.p, h = r.h, X = [], Z = [], Y = [];
        for (let k = 0; k < p.length / 2 - 1; k++) {
          const m = ri ? Math.max(1, Math.round(Math.hypot(p[2 * k + 2] - p[2 * k], p[2 * k + 3] - p[2 * k + 1]) / 2.5)) : 1;
          for (let q = 0; q < m; q++) { const u = q / m; X.push(p[2 * k] + (p[2 * k + 2] - p[2 * k]) * u); Z.push(-(p[2 * k + 1] + (p[2 * k + 3] - p[2 * k + 1]) * u)); Y.push(h[k] + (h[k + 1] - h[k]) * u); }
        }
        X.push(p[p.length - 2]); Z.push(-p[p.length - 1]); Y.push(h[h.length - 1]);
        R.roads.push({ X: Float32Array.from(X), Z: Float32Array.from(Z), H: Float32Array.from(Y), hw: r.w / 2, cls: r.c, name: r.n, gravel: !!r.g, lift: K.LIFT[r.c] || 0.05, sub: r.s || '', bridge: !!r.b, spans: r.spans, brs: r.bridges || [], town: r.t != null });
      });
      R.route = R.roads[0];
      {     // the route starts at the town road's level (the strip's DEM and world.js's differ by up to 0.6 m at the edge), eased in over 60 m
        const s = R.route, dl = town.h(clamp(s.X[0], -HALF + 0.3, HALF - 0.3), clamp(s.Z[0], -HALF + 0.3, HALF - 0.3)) - s.H[0];
        for (let k = 0, a = 0; k < s.X.length && a < 60; k++) { if (k) a += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]); s.H[k] += dl * Math.max(0, 1 - a / 60); }
      }
      return R;
    });
    imgs.length = 0;      // the decoded PNGs are copied into the grids: let them go
    const AR = CS.find((R) => R.area), PLAY = W.PLAY, XW = PLAY + 0.85;      // XW: the walls up the ends of the town's edge strip (a car's centre stays inside PLAY there)
    const inBand = (X, Z, m) => { const a = AR.area; return Z <= a.z1 - m && (Z >= a.z0 + m ? X >= a.x0 + m && X <= a.x1 - m : Z > PLAY - 1 && Math.abs(X) <= XW - m); };   // m metres inside the band's fence (the band, and the town's edge strip north of it)
    const inArea = (X, Z) => !!AR && inBand(X, Z, -2);
    const simplify = (p, tol) => {      // Douglas-Peucker on a closed flat ring: the lidar pavement outlines come as 1 m staircases
      const n = p.length / 2, keep = new Uint8Array(n); let far = 0, fd = 0; for (let k = 1; k < n; k++) { const d = Math.hypot(p[2 * k] - p[0], p[2 * k + 1] - p[1]); if (d > fd) { fd = d; far = k; } }
      keep[0] = keep[n - 1] = keep[far] = 1; const st = [[0, far], [far, n - 1]];
      while (st.length) { const [a, b] = st.pop(), ax = p[2 * a], ay = p[2 * a + 1], ex = p[2 * b] - ax, ey = p[2 * b + 1] - ay, l = Math.hypot(ex, ey) || 1e-9; let md = tol, mi = -1; for (let k = a + 1; k < b; k++) { const d = Math.abs((p[2 * k] - ax) * ey - (p[2 * k + 1] - ay) * ex) / l; if (d > md) { md = d; mi = k; } } if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
      const o = []; for (let k = 0; k < n; k++) if (keep[k]) o.push(p[2 * k], p[2 * k + 1]); return o;
    };
    for (const c of C.corridors) c.dest.paved = c.dest.paved.map((p) => simplify(p, 1.2));
    const stripOf = (X, Z) => { for (const R of CS) if (X >= R.X0 && X <= R.X1 && Z >= R.Z0 && Z <= R.Z1) return R; return null; };
    const tan = (s, k) => { const n = s.X.length, a = Math.max(0, k - 2), c = Math.min(n - 1, k + 2), tx = s.X[c] - s.X[a], tz = s.Z[c] - s.Z[a], l = Math.hypot(tx, tz) || 1; return [tx / l, tz / l]; };
    const onBridge = (R, k) => R.route.brs.some((b) => k >= b[0] && k <= b[1]);

    // ---------- road profiles: each road's graded levels become a smoothing spline (a real crest or dip stays, the lidar's ripples and 2 cm
    // steps go); a side road takes the level of a road already done where it overlaps it. heightXZ reads them on and beside the ribbons ----------
    const LAM = 3000;      // second-difference penalty at 2.5 m samples: ripples under ~110 m smoothed out, the grade changes at most ~1 % per 10 m
    function whit(h, w, lam) {     // Whittaker smoother (discrete smoothing spline): min sum w (y - h)^2 + lam sum (y[k-1] - 2 y[k] + y[k+1])^2, banded LDL^T
      const n = h.length, a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n), y = new Float64Array(n);
      for (let i = 0; i < n; i++) a[i] = w[i];
      for (let i = 1; i < n - 1; i++) { a[i - 1] += lam; a[i] += 4 * lam; a[i + 1] += lam; b[i - 1] -= 2 * lam; b[i] -= 2 * lam; c[i - 1] += lam; }
      for (let i = 0; i < n; i++) {
        l2[i] = i > 1 ? c[i - 2] / d[i - 2] : 0; l1[i] = i ? (b[i - 1] - (i > 1 ? l2[i] * l1[i - 1] * d[i - 2] : 0)) / d[i - 1] : 0;
        d[i] = a[i] - (i ? l1[i] * l1[i] * d[i - 1] : 0) - (i > 1 ? l2[i] * l2[i] * d[i - 2] : 0); y[i] = w[i] * h[i] - (i ? l1[i] * y[i - 1] : 0) - (i > 1 ? l2[i] * y[i - 2] : 0);
      }
      for (let i = 0; i < n; i++) y[i] /= d[i];
      for (let i = n - 1; i >= 0; i--) y[i] -= (i + 1 < n ? l1[i + 1] * y[i + 1] : 0) + (i + 2 < n ? l2[i + 2] * y[i + 2] : 0);
      return y;
    }
    const prof = (s, k, t, l) => { const t2 = t * t, t3 = t2 * t; return s.H[k] * (2 * t3 - 3 * t2 + 1) + s.H[k + 1] * (3 * t2 - 2 * t3) + l * (s.G[k] * (t3 - 2 * t2 + t) + s.G[k + 1] * (t3 - t2)); };   // cubic Hermite: C1 along the road
    let sgK = 0, sgT = 0, sgL = 0;
    function nearSeg(s, L, q0, X, Z) {     // the nearest of road s's segments listed from L[q0] on (one road's run): squared distance; sgK, sgT, sgL its segment, parameter, length
      let bd = 1e18; const ri = L[q0] >> 16;
      const SX = s.X, SZ = s.Z;
      for (let q = q0; q < L.length && L[q] >> 16 === ri; q++) { const k = L[q] & 65535, ax = SX[k], az = SZ[k], ex = SX[k + 1] - ax, ez = SZ[k + 1] - az, px = X - ax, pz = Z - az, u = px * ex + pz * ez; let d;
        if (u <= 0) d = px * px + pz * pz; else { const l2 = ex * ex + ez * ez; if (u >= l2) d = (px - ex) * (px - ex) + (pz - ez) * (pz - ez); else { const c = px * ez - pz * ex; d = c * c / l2; } }
        if (d < bd) { bd = d; sgK = k; } }
      // the parameter between the ribbon's vertex rows (each across its vertex's chord tangent, as K.ribbon lays them), so it runs on from segment
      // to segment off the centre line too (a plain projection jumps at every vertex of the 0.1 m-rounded polylines: 5 mm steps 4 m out on a grade)
      const n = s.X.length; let k = sgK, t = 0;
      for (let it = 0; it < 3; it++) {
        const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 2), ax = s.X[k + 1] - s.X[a], az = s.Z[k + 1] - s.Z[a], bx = s.X[b] - s.X[k], bz = s.Z[b] - s.Z[k];
        const dA = ((X - s.X[k]) * ax + (Z - s.Z[k]) * az) / (Math.hypot(ax, az) || 1e-9), dB = ((X - s.X[k + 1]) * bx + (Z - s.Z[k + 1]) * bz) / (Math.hypot(bx, bz) || 1e-9);
        t = dA - dB > 1e-6 ? dA / (dA - dB) : 0.5;
        if (t < 0 && k > 0) k--; else if (t > 1 && k < n - 2) k++; else break;
      }
      sgK = k; sgT = clamp(t, 0, 1); sgL = Math.hypot(s.X[k + 1] - s.X[k], s.Z[k + 1] - s.Z[k]); return bd;
    }
    for (const R of CS) {
      const g = R.sg = new Map();      // 16 m cells: the segments (road << 16 | k) within hw + 3.6 m, a road's in one run
      R.roads.forEach((s, ri) => { const m = s.hw + 3.6; for (let k = 0; k + 1 < s.X.length; k++) for (let i = Math.floor((Math.min(s.X[k], s.X[k + 1]) - m) / 16); i <= Math.floor((Math.max(s.X[k], s.X[k + 1]) + m) / 16); i++) for (let j = Math.floor((Math.min(s.Z[k], s.Z[k + 1]) - m) / 16); j <= Math.floor((Math.max(s.Z[k], s.Z[k + 1]) + m) / 16); j++) { const key = i * 65536 + j; (g.get(key) || g.set(key, []).get(key)).push(ri << 16 | k); } });
      for (const [key, L] of g) g.set(key, Int32Array.from(L));
      const deck = R.route.deck = new Uint8Array(R.route.X.length); for (const [i0, i1] of R.route.brs) deck.fill(1, i0, i1 + 1);      // segments i0..i1, as onBridge
      R.roads.forEach((s, ri) => {
        const n = s.X.length, w = new Float64Array(n).fill(1);
        if (!ri || s.town) w[0] = 1e6;      // the mouths stay at their town road's level
        if (ri) for (let k = 0; k < n; k++) {      // on a road already done or 2 m off its edge (not on a deck: nothing passes under one at grade), take its level
          const L = g.get(Math.floor(s.X[k] / 16) * 65536 + Math.floor(s.Z[k] / 16)); if (!L) continue;
          for (let q = 0; q < L.length && L[q] >> 16 < ri; q++) { const o = R.roads[L[q] >> 16], d = nearSeg(o, L, q, s.X[k], s.Z[k]); while (q + 1 < L.length && L[q + 1] >> 16 === L[q] >> 16) q++;
            if (d < (o.hw + 2) ** 2 && !(o === R.route && deck[sgK])) { const v = prof(o, sgK, sgT, sgL); if (Math.abs(v - s.H[k]) < 2) { s.H[k] = v; w[k] = 1e6; } } }
        }
        // ponytail: where several lot aisles overlap at different levels (Linton's service roads) a later aisle's ribbon can sit up to 0.7 m off
        // the level heightXZ gives there (0.2 % of ribbon samples); give a lot's aisles one shared surface if a car is seen sinking or floating there
        if (n > 4) s.H.set(whit(s.H, w, LAM));
        const G = s.G = new Float32Array(n), len = (k) => Math.hypot(s.X[k + 1] - s.X[k], s.Z[k + 1] - s.Z[k]) || 1e-3;
        for (let k = 0; k < n; k++) G[k] = (s.H[Math.min(n - 1, k + 1)] - s.H[Math.max(0, k - 1)]) / ((k ? len(k - 1) : 0) + (k < n - 1 ? len(k) : 0));
      });
    }
    let rW = 0;
    function roadLvl(R, X, Z) {      // the roads' smooth level at (X, Z) (2 cm under the ribbons, as the pressed ground), and in rW its weight over the ground:
      // 1 on a ribbon and 0.3 m past it, easing to 0 3.3 m out; laid in road order, each over the ones after it (the route's ribbon is the route's alone,
      // a side road eases in past its edge); a deck alone and only within hw + 1 of its centre
      rW = 0; const L = R.sg.get(Math.floor(X / 16) * 65536 + Math.floor(Z / 16)); if (!L) return NaN;
      let left = 1, sh = 0;
      for (let q = 0; q < L.length; q++) {
        const ri = L[q] >> 16, s = R.roads[ri], d = Math.sqrt(nearSeg(s, L, q, X, Z)) - s.hw; while (q + 1 < L.length && L[q + 1] >> 16 === ri) q++;
        if (!ri && s.deck[sgK]) { if (d < 1) { rW = 1; return prof(s, sgK, sgT, sgL) - 0.02; } continue; }
        const w = d < 0.3 ? 1 : 1 - sstep((d - 0.3) / 3); if (w <= 0) continue;
        sh += w * left * (prof(s, sgK, sgT, sgL) - 0.02); left *= 1 - w; if (!left) break;
      }
      rW = 1 - left; return rW > 0 ? sh / rW : NaN;
    }

    // route samples (plus a 60 m run straight back into town from the edge: the corridor's mouth, fenced at its sides) in 32 m cells
    for (const R of CS) {
      const s = R.route, [tx, tz] = R.out = Math.abs(s.X[0]) > Math.abs(s.Z[0]) ? [Math.sign(s.X[0]), 0] : [0, Math.sign(s.Z[0])], ext = 24, n = s.X.length + ext, EX = R.EX = new Float32Array(n), EZ = R.EZ = new Float32Array(n), g = R.rg = new Map();
      for (let k = 0; k < n; k++) { const q = k - ext; EX[k] = q < 0 ? s.X[0] + tx * q * 2.5 : s.X[q]; EZ[k] = q < 0 ? s.Z[0] + tz * q * 2.5 : s.Z[q]; const key = Math.floor(EX[k] / 32) * 65536 + Math.floor(EZ[k] / 32); (g.get(key) || g.set(key, []).get(key)).push(k); }
      R.ext = ext;
    }
    let nearK = 0;
    function routeDist(R, X, Z, maxD) {     // distance to the nearest route sample (nearK = its index, < 0 on the run into town), at most maxD
      const ci = Math.floor(X / 32), cj = Math.floor(Z / 32), r = Math.ceil(maxD / 32); let bd = maxD * maxD, bk = -1e9;
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const L = R.rg.get(i * 65536 + j); if (L) for (let q = 0; q < L.length; q++) { const k = L[q], d = (R.EX[k] - X) ** 2 + (R.EZ[k] - Z) ** 2; if (d < bd) { bd = d; bk = k; } } }
      nearK = bk - R.ext; return Math.sqrt(bd);
    }

    // corridor roads in 64 m cells (every other sample, as world.js does) for the nearest-road lookup
    for (const R of CS) {
      const g = R.nr = new Map();
      R.roads.forEach((s, ri) => { if (s.hw < 1.5) return; for (let k = 0; k < s.X.length; k += 2) { const key = Math.floor(s.X[k] / 64) * 65536 + Math.floor(s.Z[k] / 64); (g.get(key) || g.set(key, []).get(key)).push(ri, k); } });
    }
    function corrRoad(X, Z, maxD, fenced) {      // fenced: only samples a car can stand on (the band's 3 m or more inside its fence)
      let best = null, bd = maxD * maxD, bR = null;
      for (const R of CS) {
        if (X < R.X0 - maxD || X > R.X1 + maxD || Z < R.Z0 - maxD || Z > R.Z1 + maxD) continue;
        const ci = Math.floor(X / 64), cj = Math.floor(Z / 64), r = Math.ceil(maxD / 64);
        for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const L = R.nr.get(i * 65536 + j); if (L) for (let q = 0; q < L.length; q += 2) { const s = R.roads[L[q]], k = L[q + 1], d = (s.X[k] - X) ** 2 + (s.Z[k] - Z) ** 2; if (d < bd && !(fenced && R.area && !inBand(s.X[k], s.Z[k], 3))) { bd = d; best = { s, k }; bR = R; } } }
      }
      if (!best) return null;
      const { s, k } = best, [tx, tz] = tan(s, k);
      return { x: s.X[k], z: s.Z[k], tx, tz, name: s.spans ? spanName(s, k) : s.name, hw: s.hw, d: Math.sqrt(bd), cls: s.cls, s, k, R: bR };
    }
    function spanName(s, k) { for (const sp of s.spans) if (k >= sp[0] && k <= sp[1]) return sp[3] || (sp[4] ? 'Highway ' + sp[4].replace('/', ' / ') : ''); return s.name; }

    // ---------- road beds (distance and level: the ground's press below, the shoulder colour, the coarse LODs), surface mask, river beds, town edge ----------
    for (const R of CS) {
      const { nx, nz } = R, rd = R.rd = new Uint8Array(nx * nz).fill(255), rh = R.rh = new Float32Array(nx * nz), cap = R.cap = new Float32Array(nx * nz).fill(1e9);   // rd: distance past the road edge (0.25 m units), rh: its road's level
      R.roads.forEach((s, ri) => {      // cap: the terrain stays 2 cm under every road and deck within 5.7 m of its edge (one 4 m cell's diagonal), so no triangle pokes through a ribbon
        const Rr = s.hw + 14, RR = Rr * Rr, st = 1;
        for (let k = 0; k + 1 < s.X.length; k += st) {
          const k1 = Math.min(s.X.length - 1, k + st), br = !ri && onBridge(R, k), ax = s.X[k], az = s.Z[k], ex = s.X[k1] - ax, ez = s.Z[k1] - az, l2 = ex * ex + ez * ez || 1e-9;
          const i0 = Math.max(0, Math.ceil((Math.min(ax, ax + ex) - Rr - R.X0) / 4)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, ax + ex) + Rr - R.X0) / 4)), j0 = Math.max(0, Math.ceil((Math.min(az, az + ez) - Rr - R.Z0) / 4)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, az + ez) + Rr - R.Z0) / 4));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const x = R.X0 + i * 4 - ax, z = R.Z0 + j * 4 - az, tr = (x * ex + z * ez) / l2, t = clamp(tr, 0, 1), dd = (x - ex * t) ** 2 + (z - ez * t) ** 2; if (dd > RR) continue;
            const d = Math.sqrt(dd) - s.hw, lv = s.H[k] + (s.H[k1] - s.H[k]) * t, q = j * nx + i;
            if (d < 5.7 && lv - 0.02 < cap[q] && ((tr > -0.4 && tr < 1.4) || (tr < 0 ? !k : k1 === s.X.length - 1))) cap[q] = lv - 0.02;   // not a segment's level 10 m along a grade: one it is level with
            if (s.bridge && d < 2 && lv - 0.02 > R.H[q]) R.H[q] = lv - 0.02;      // the side-road 'bridges' run under 1 m above the ground: an embankment
            if (br) continue; const e = clamp(Math.round(d * 4), 0, 255); if (e < rd[q]) { rd[q] = e; rh[q] = lv; }
          }
        }
      });
      // 2 m surface mask (cell centres), as world.js's: 0 grass, 1 roadway, 2 gravel or rail bed, 3 water, 4 building, 5 pavement off the road
      const c = R.c, mw = R.mw = Math.ceil((R.X1 - R.X0) / 2), mh = R.mh = Math.ceil((R.Z1 - R.Z0) / 2), m = R.mask = new Uint8Array(mw * mh), xs = [];
      const line = (p, hw, v) => { for (let k = 0; k + 3 < p.length; k += 2) {      // cells within hw of the polyline (map coords)
        const ax = p[k], az = -p[k + 1], ex = p[k + 2] - ax, ez = -p[k + 3] - az, l2 = ex * ex + ez * ez || 1e-9;
        const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - hw - R.X0) / 2)), i1 = Math.min(mw - 1, Math.floor((Math.max(ax, ax + ex) + hw - R.X0) / 2)), j0 = Math.max(0, Math.floor((Math.min(az, az + ez) - hw - R.Z0) / 2)), j1 = Math.min(mh - 1, Math.floor((Math.max(az, az + ez) + hw - R.Z0) / 2));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = R.X0 + 2 * i + 1 - ax, z = R.Z0 + 2 * j + 1 - az, t = clamp((x * ex + z * ez) / l2, 0, 1); if ((x - ex * t) ** 2 + (z - ez * t) ** 2 <= hw * hw) m[j * mw + i] = v; }
      } };
      const fill = (p, v, if0) => {      // scanline fill of a ring (map coords)
        let z0 = 1e9, z1 = -1e9, n = p.length >> 1; for (let k = 1; k < p.length; k += 2) { z0 = Math.min(z0, -p[k]); z1 = Math.max(z1, -p[k]); }
        for (let j = Math.max(0, Math.ceil((z0 - R.Z0 - 1) / 2)); j <= Math.min(mh - 1, Math.floor((z1 - R.Z0 - 1) / 2)); j++) {
          const z = R.Z0 + 2 * j + 1; xs.length = 0;
          for (let a = 0, b = n - 1; a < n; b = a++) { const za = -p[2 * a + 1], zb = -p[2 * b + 1]; if ((za > z) !== (zb > z)) xs.push(p[2 * a] + (z - za) / (zb - za) * (p[2 * b] - p[2 * a])); }
          xs.sort((u, w) => u - w);
          for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q] - R.X0 - 1) / 2)), i1 = Math.min(mw - 1, Math.floor((xs[q + 1] - R.X0 - 1) / 2)); i <= i1; i++) { const o = j * mw + i; if (!if0 || !m[o]) m[o] = v; }
        }
      };
      for (const w of c.water) fill(w.p, 3);
      for (const p of c.rails) line(p, 1.7, 2);
      for (const r of c.roads) if (r.g) line(r.p, r.w / 2, 2);
      for (const r of c.roads) if (!r.g) line(r.p, r.w / 2, 1);
      for (const b of c.buildings) fill(b.p, 4, true);
      for (const p of c.dest.paved.concat(c.dest.parking || [])) fill(p, 5, true);
    }
    const maskOf = (R, X, Z) => { const i = Math.floor((X - R.X0) / 2), j = Math.floor((Z - R.Z0) / 2); return i >= 0 && j >= 0 && i < R.mw && j < R.mh ? R.mask[j * R.mw + i] : 0; };
    function stripH(R, X, Z) {     // the strip surface (same triangles as its 4 m mesh), NaN outside the strip
      const fx = (X - R.X0) / 4, fz = (Z - R.Z0) / 4; if (!(fx >= 0 && fz >= 0 && fx < R.nx - 1 && fz < R.nz - 1)) return NaN;
      const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, n = R.nx, k = j * n + i, H = R.H, cv = R.cov;
      if (u + v <= 1) return cv[k] && cv[k + 1] && cv[k + n] ? H[k] + (H[k + 1] - H[k]) * u + (H[k + n] - H[k]) * v : NaN;
      return cv[k + 1] && cv[k + n] && cv[k + n + 1] ? H[k + n + 1] + (H[k + n] - H[k + n + 1]) * (1 - u) + (H[k + 1] - H[k + n + 1]) * (1 - v) : NaN;
    }
    // water levels from the untouched surface (as world.js: the lowest shore point), before the beds are dug
    for (const R of CS) for (const w of R.c.water) { let lv = 1e9; for (let k = 0; k < w.p.length; k += 2) { const h = stripH(R, w.p[k], -w.p[k + 1]); if (h === h) lv = Math.min(lv, h); } w.lvl = lv < 1e9 ? lv : NaN; }
    // the ground: pressed onto the roads as world.js's is (flat to 3.6 m past an edge, eased over 6 m), so heightXZ is one continuous surface
    const depthIn = (X, Z) => HALF - Math.max(Math.abs(X), Math.abs(Z));      // metres inside the town square (< 0 outside)
    for (const R of CS) {
      const { nx, nz, H, cov, rd, rh, cap } = R;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const q = j * nx + i, X = R.X0 + i * 4, Z = R.Z0 + j * 4, d = rd[q] / 4; if (!cov[q] || depthIn(X, Z) > 0) continue;
        if (rd[q] > 38) { if (maskOf(R, X, Z) === 3) H[q] -= 1.6; }      // river and pond beds sit below the water sheet
        else { const r = roadLvl(R, X, Z); H[q] += ((rW > 0 ? r : rh[q] - 0.02) - H[q]) * (d <= 3.6 ? 1 : 1 - sstep((d - 3.6) / 6)); }     // the level heightXZ blends in there
        if (cap[q] < H[q]) H[q] = cap[q];
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {      // the overlap, drawn under the town's ground: as edgeH over its last 8 m
        const q = j * nx + i, X = R.X0 + i * 4, Z = R.Z0 + j * 4, si = depthIn(X, Z); if (!cov[q] || si <= 0) continue;
        const e = si < 8 ? edgeH(X, Z, si) : NaN; H[q] = (e === e ? e : town.h(X, Z)) - 0.15 * Math.min(1, si / 8);
      }
      R.cap = null;
    }
    function edgeH(X, Z, si) {     // world.js's last DEM cells ramp up to 2 m at its edge: inside a strip, its last 8 m blend from its level 8 m in to the strip's edge
      // ponytail: world.js still draws that ramp (a 2.5 m crest seen from town, culled from outside); patch its edge cells if a car dipping into it shows
      const w = Math.abs(X) >= Math.abs(Z), ex = w ? Math.sign(X) * HALF : X, ez = w ? Z : Math.sign(Z) * HALF, R = stripOf(ex, ez), e = R && !(w && R.area) ? stripH(R, ex, ez) : NaN;   // the band meets the town along its south edge only
      if (e !== e) return NaN; const t = town.h(w ? Math.sign(X) * (HALF - 8) : X, w ? Z : Math.sign(Z) * (HALF - 8)); return t + (e - t) * (1 - si / 8);
    }
    // bridge decks (the White River): extents for the deck geometry (the valley floor stays under the deep part of a bridge)
    for (const R of CS) for (const [i0, i1] of R.route.brs) {
      const s = R.route, b = { i0, i1, hw: s.hw + 0.8, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
      for (let k = i0; k <= i1; k++) { b.x0 = Math.min(b.x0, s.X[k] - 8); b.x1 = Math.max(b.x1, s.X[k] + 8); b.z0 = Math.min(b.z0, s.Z[k] - 8); b.z1 = Math.max(b.z1, s.Z[k] + 8); }
      R.bridges.push(b);
    }
    const groundAt = (X, Z) => { if (inSq(X, Z)) return town.h(X, Z); const R = stripOf(X, Z), h = R ? stripH(R, X, Z) : NaN; return h === h ? h : farAt(X, Z); };   // terrain only (no decks)

    // ---------- terrain chunks: 512 m, five levels (4 to 64 m cells), each built when first wanted (level of detail below) ----------
    const STEPS = [1, 2, 4, 8, 16], chunks = [];
    for (const R of CS) R.cf = (X, Z) => R.cov[clamp(Math.round((Z - R.Z0) / 4), 0, R.nz - 1) * R.nx + clamp(Math.round((X - R.X0) / 4), 0, R.nx - 1)] || 30;
    function chunkGeo(ch, st) {
      const R = ch.R, n = R.nx, H = R.H, cov = R.cov, rd = R.rd, rh = R.rh, is = [], js = [];
      for (let i = ch.i0; i < ch.i1; i += st) is.push(i); is.push(ch.i1); for (let j = ch.j0; j < ch.j1; j += st) js.push(j); js.push(ch.j1);
      const w = is.length, hN = js.length, pos = new Float32Array(w * hN * 3), nor = new Float32Array(w * hN * 3), col = new Float32Array(w * hN * 3), uv = new Float32Array(w * hN * 2), idx = [];
      let p = 0;
      for (const j of js) for (const i of is) {
        const q = j * n + i, X = R.X0 + i * 4, Z = R.Z0 + j * 4, d = rd[q] / 4, hq = (ii, jj) => { const o = clamp(jj, 0, R.nz - 1) * n + clamp(ii, 0, n - 1); return cov[o] ? H[o] : H[q]; };
        pos[3 * p] = X; pos[3 * p + 1] = st > 1 && d < 12 ? rh[q] : H[q]; pos[3 * p + 2] = Z;
        const gx = (hq(i - 1, j) - hq(i + 1, j)) / 8, gz = (hq(i, j - 1) - hq(i, j + 1)) / 8, il = 1 / Math.hypot(gx, 1, gz);
        nor[3 * p] = gx * il; nor[3 * p + 1] = il; nor[3 * p + 2] = gz * il;
        const c = K.groundColor(X, Z, d, R.cf); col[3 * p] = c.r; col[3 * p + 1] = c.g; col[3 * p + 2] = c.b; uv[2 * p] = X / 14; uv[2 * p + 1] = Z / 14; p++;
      }
      for (let b = 0; b < hN - 1; b++) for (let a = 0; a < w - 1; a++) {
        if (!cov[js[b] * n + is[a]] || !cov[js[b] * n + is[a + 1]] || !cov[js[b + 1] * n + is[a]] || !cov[js[b + 1] * n + is[a + 1]]) continue;
        const v = b * w + a; idx.push(v, v + w, v + 1, v + 1, v + w, v + w + 1);
      }
      if (!idx.length) return null;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(idx);
      return g;
    }
    const chunkMesh = (ch, l) => { const g = chunkGeo(ch, STEPS[l]); if (!g) return null; const m = new T.Mesh(g, K.terrainMat); m.name = 'rt:terrain' + l; m.receiveShadow = true; m.visible = false; scene.add(m); return m; };
    const align = (a0, a1) => { for (const e of [-HALF, HALF]) if (e > a0 && e < a1) return ((Math.round((e - a0) / 4) % CH) + CH) % CH; return 0; };     // a chunk edge on the town edge, at every LOD
    for (const R of CS) {
      const ai = align(R.X0, R.X1), aj = align(R.Z0, R.Z1);
      for (let j0 = aj - CH; j0 < R.nz - 1; j0 += CH) for (let i0 = ai - CH; i0 < R.nx - 1; i0 += CH) {
        const ch = { R, i0: Math.max(0, i0), j0: Math.max(0, j0), i1: Math.min(R.nx - 1, i0 + CH), j1: Math.min(R.nz - 1, j0 + CH), lods: [] };
        if (ch.i1 <= ch.i0 || ch.j1 <= ch.j0) continue;
        let any = false; for (let j = ch.j0; j <= ch.j1 && !any; j += 2) for (let i = ch.i0; i <= ch.i1; i += 2) if (R.cov[j * R.nx + i]) { any = true; break; }
        if (!any) continue;
        ch.x0 = R.X0 + ch.i0 * 4; ch.x1 = R.X0 + ch.i1 * 4; ch.z0 = R.Z0 + ch.j0 * 4; ch.z1 = R.Z0 + ch.j1 * 4;
        chunks.push(ch);
      }
    }

    // ---------- the horizon: sink the town's far ring under the strips; far terrain past it ----------
    function sunk(X, Z) {      // a far-terrain height hidden under a strip (its lowest point within 48 m, less 1.5 m); NaN where the strip does not cover
      const R = stripOf(X, Z); if (!R) return NaN; let m = 1e9;
      for (let dz = -48; dz <= 48; dz += 16) for (let dx = -48; dx <= 48; dx += 16) {
        const x = X + dx, z = Z + dz; let h;
        if (inSq(x, z)) h = town.h(x, z);
        else { const i = Math.round((x - R.X0) / 4), j = Math.round((z - R.Z0) / 4); if (i < 0 || j < 0 || i >= R.nx || j >= R.nz || !R.cov[j * R.nx + i]) return NaN; h = R.H[j * R.nx + i]; }
        if (h < m) m = h;
      }
      return m - 1.5;
    }
    const farMat = W.farMesh.material; farMat.polygonOffset = true; farMat.polygonOffsetFactor = farMat.polygonOffsetUnits = 2;   // where it meets a strip, the strip wins
    const ring0 = W.farMesh.geometry, ring1 = ring0.clone();      // the town's horizon ring as it is (drawn deep in town, where the strips are hidden) and sunk under the strips
    { const p = ring1.attributes.position; for (let k = 0; k < p.count; k++) { const X = p.getX(k), Z = p.getZ(k); if (Math.max(Math.abs(X), Math.abs(Z)) < HALF - 0.01) continue; const s = sunk(X, Z); if (s === s && s < p.getY(k)) p.setY(k, s); } ring1.computeVertexNormals(); }
    const outer = []; let buildOuter;
    {      // the far terrain past the town's ring (drawn only out of town): 2.5 km chunks, woods raised 9 m as the ring's are, normals from the grid
      const PALF = { 30: lin(0x7c8c44), 40: lin(0xb39757), 50: lin(0x80904a), 60: lin(0x9a8a70), 80: lin(0x4f6a78), 90: lin(0x6a7a45) }, wood = lin(0x8a5a2e), woodB = lin(0x76683a), fh = window.BLOOMFIELD.far.half, OC = 50;
      const hy = (i, j) => { i = clamp(i, 0, FNX - 1); j = clamp(j, 0, FNZ - 1); const k = j * FNX + i, X = FX0 + i * FS, Z = FZ0 + j * FS, s = sunk(X, Z), y = FH[k] + (FC[k] === 10 ? 9 : 0); return s === s ? Math.min(y, s) : y; };
      for (let j0 = 0; j0 < FNZ - 1; j0 += OC) for (let i0 = 0; i0 < FNX - 1; i0 += OC) {
        const i1 = Math.min(FNX - 1, i0 + OC), j1 = Math.min(FNZ - 1, j0 + OC), w = i1 - i0 + 1, hN = j1 - j0 + 1, x0 = FX0 + i0 * FS, x1 = FX0 + i1 * FS, z0 = FZ0 + j0 * FS, z1 = FZ0 + j1 * FS;
        if (x0 >= -fh && x1 <= fh && z0 >= -fh && z1 <= fh) continue;      // inside the ring
        outer.push({ i0, j0, i1, j1, w, hN, x0, x1, z0, z1, m: undefined });
      }
      buildOuter = (o) => {
        const { i0, j0, i1, j1, w, hN } = o;
        const pos = new Float32Array(w * hN * 3), nor = new Float32Array(w * hN * 3), col = new Float32Array(w * hN * 3), idx = [], yw = w + 2, Y = new Float32Array(yw * (hN + 2)), y = (i, j) => Y[(j - j0 + 1) * yw + i - i0 + 1];
        for (let j = j0 - 1; j <= j1 + 1; j++) for (let i = i0 - 1; i <= i1 + 1; i++) Y[(j - j0 + 1) * yw + i - i0 + 1] = hy(i, j);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const p = (j - j0) * w + (i - i0), k = j * FNX + i, X = FX0 + i * FS, Z = FZ0 + j * FS, cls = FC[k], gx = (y(i - 1, j) - y(i + 1, j)) / (2 * FS), gz = (y(i, j - 1) - y(i, j + 1)) / (2 * FS), il = 1 / Math.hypot(gx, 1, gz);
          pos[3 * p] = X; pos[3 * p + 1] = y(i, j); pos[3 * p + 2] = Z; nor[3 * p] = gx * il; nor[3 * p + 1] = il; nor[3 * p + 2] = gz * il;
          const cc = (cls === 10 ? tc.copy(wood).lerp(woodB, vnoise(X / 700, Z / 700) * 0.7) : tc.copy(PALF[cls] || PALF[30])).multiplyScalar(0.85 + 0.2 * vnoise(X / 260 + 7, Z / 260)); col[3 * p] = cc.r; col[3 * p + 1] = cc.g; col[3 * p + 2] = cc.b;
        }
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const X = FX0 + i * FS, Z = FZ0 + j * FS; if (X >= -fh && X + FS <= fh && Z >= -fh && Z + FS <= fh) continue; const a = (j - j0) * w + (i - i0); idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setIndex(idx);
        const m = new T.Mesh(g, farMat); m.name = 'rt:outer'; m.visible = false; scene.add(m); o.m = m;
      };
    }

    // ---------- props in 512 m cells, one mesh per kind per cell ----------
    const cellOf = (R, X, Z) => { const i = clamp(Math.floor((X - R.X0) / CELL), 0, R.cnx - 1), j = clamp(Math.floor((Z - R.Z0) / CELL), 0, R.cnz - 1), q = j * R.cnx + i; return R.cells[q] || (R.cells[q] = { x0: R.X0 + i * CELL, z0: R.Z0 + j * CELL, b: {}, m: {} }); };
    const bufAt = (R, X, Z, kind) => { const c = cellOf(R, X, Z); return c.b[kind] || (c.b[kind] = Buf()); };
    const BOXG = new T.BoxGeometry(1, 1, 1), BP = BOXG.attributes.position.array, BN = BOXG.attributes.normal.array, BI = BOXG.index.array;
    function box(b, col, x, y, z, sx, sy, sz, yaw, taper) {      // box centred at (x, y, z), turned yaw about Y (local +X -> world (cos, -sin)); taper narrows its top
      const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), o = b.pos.length / 3;
      for (let k = 0; k < 24; k++) {
        const f = taper && BP[3 * k + 1] > 0 ? taper : 1, lx = BP[3 * k] * sx * f, lz = BP[3 * k + 2] * sz * f, nx = BN[3 * k], nz = BN[3 * k + 2];
        b.pos.push(x + lx * c + lz * s, y + BP[3 * k + 1] * sy, z - lx * s + lz * c); b.nor.push(nx * c + nz * s, BN[3 * k + 1], -nx * s + nz * c); b.col.push(col.r, col.g, col.b);
      }
      for (let k = 0; k < BI.length; k++) b.idx.push(o + BI[k]);
    }
    function quad(b, a, bb, c, d, n, col, uvs) {        // a b c d counter-clockwise seen from the front
      const o = b.pos.length / 3; for (const p of [a, bb, c, d]) { b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); if (col) b.col.push(col.r, col.g, col.b); }
      if (uvs) b.uv.push(...uvs); b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }

    // ---------- roads: the town's ribbons and markings, cut into 120 m pieces filed by cell ----------
    const sub = (s, a, e) => ({ X: s.X.subarray(a, e + 1), Z: s.Z.subarray(a, e + 1), H: s.H.subarray(a, e + 1) });
    function lay(R, s, kind, fn) { for (let a = 0; a < s.X.length - 1; a += 48) { const e = Math.min(s.X.length - 1, a + 49); fn(bufAt(R, s.X[a], s.Z[a], kind), sub(s, a, e), a, e); } }      // pieces overlap by a segment: a piece's last vertex turns on its own tangent, which left a crack on bends
    for (const R of CS) {
      const s = R.route, n = s.X.length, cl = new Uint8Array(n), cr = new Uint8Array(n);
      R.roads.forEach((o, oi) => {      // edge lines open across side-road mouths
        if (!oi || o.hw < 1.5) return;
        for (let q = 0; q < o.X.length; q += 2) {
          if (routeDist(R, o.X[q], o.Z[q], s.hw + 1.2) > s.hw + 1) continue; const k = Math.max(0, nearK), [tx, tz] = tan(s, k), span = Math.ceil((o.hw + 3) / 2.5);
          for (const qq of [q - 6, q + 6]) {
            if (qq < 0 || qq >= o.X.length) continue; const side = (o.X[qq] - s.X[k]) * tz - (o.Z[qq] - s.Z[k]) * tx; if (Math.abs(side) < s.hw + 2) continue;
            const arr = side > 0 ? cl : cr; for (let kk = Math.max(0, k - span); kk <= Math.min(n - 1, k + span); kk++) arr[kk] = 1;
          }
        }
      });
      R.roads.forEach((r, ri) => {
        const col = r.gravel ? K.gravelC : K.asphalt[r.cls] || K.asphalt.service, n2 = r.X.length;
        lay(R, r, 'road', (b, p) => K.ribbon(b, p, r.hw, r.lift, col, 0));
        if (ri) { if (!r.town) K.disc(bufAt(R, r.X[0], r.Z[0], 'road'), r.X[0], r.H[0] + r.lift, r.Z[0], r.hw, col); K.disc(bufAt(R, r.X[n2 - 1], r.Z[n2 - 1], 'road'), r.X[n2 - 1], r.H[n2 - 1] + r.lift, r.Z[n2 - 1], r.hw, col); }
        const y = r.lift + 0.02;
        if (!ri) lay(R, r, 'mark', (b, p, a, e) => { K.ribbon(b, p, 0.06, y, K.yellow, 0.13); K.ribbon(b, p, 0.06, y, K.yellow, -0.13); K.ribbon(b, p, 0.06, y, K.white, r.hw - 0.3, 0, cl.subarray(a, e + 1)); K.ribbon(b, p, 0.06, y, K.white, -r.hw + 0.3, 0, cr.subarray(a, e + 1)); });
        else if (!r.gravel && (r.cls === 'primary' || r.cls === 'secondary' || r.cls === 'tertiary')) {
          const cut = new Uint8Array(n2); for (let k = 0; k < n2; k++) cut[k] = routeDist(R, r.X[k], r.Z[k], s.hw + 6) < s.hw + 5 ? 1 : 0;
          lay(R, r, 'mark', (b, p, a, e) => { const c = cut.subarray(a, e + 1); if (r.cls === 'tertiary') K.ribbon(b, p, 0.06, y, K.yellow, 0, [3, 12], c); else { K.ribbon(b, p, 0.06, y, K.yellow, 0.13, 0, c); K.ribbon(b, p, 0.06, y, K.yellow, -0.13, 0, c); } });
        }
      });
    }

    // ---------- the White River bridge: deck slab, parapets, piers; parapets (and 25 m of guardrail beyond) are walls ----------
    const concrete = lin(0xa9a59c), steel = lin(0x9a9da0), dark = lin(0x5d5a55);
    for (const R of CS) for (const br of R.bridges) {
      const s = R.route, b = bufAt(R, s.X[br.i0], s.Z[br.i0], 'big'), hw = s.hw, k0 = Math.max(1, br.i0 - 10), k1 = Math.min(s.X.length - 2, br.i1 + 10);
      for (let k = k0; k < k1; k++) {
        const [tx, tz] = tan(s, k), [ux, uz] = tan(s, k + 1), y0 = s.H[k] + s.lift, y1 = s.H[k + 1] + s.lift, deck = k >= br.i0 && k < br.i1;
        for (const sd of [1, -1]) {
          const ox = tz * sd, oz = -tx * sd, px = uz * sd, pz = -ux * sd, A = [s.X[k] + ox * (hw + 0.1), s.Z[k] + oz * (hw + 0.1)], Bq = [s.X[k + 1] + px * (hw + 0.1), s.Z[k + 1] + pz * (hw + 0.1)], A2 = [s.X[k] + ox * (hw + 0.55), s.Z[k] + oz * (hw + 0.55)], B2 = [s.X[k + 1] + px * (hw + 0.55), s.Z[k + 1] + pz * (hw + 0.55)];
          const inn = sd > 0 ? [-ox, 0, -oz] : [-ox, 0, -oz], up = [0, 1, 0], out = [ox, 0, oz];
          if (deck) {     // concrete parapet 0.85 m on the deck
            const f = sd > 0 ? (a, bq, c, d, nn) => quad(b, a, bq, c, d, nn, concrete) : (a, bq, c, d, nn) => quad(b, bq, a, d, c, nn, concrete);
            f([A[0], y0, A[1]], [Bq[0], y1, Bq[1]], [Bq[0], y1 + 0.85, Bq[1]], [A[0], y0 + 0.85, A[1]], inn);
            f([A[0], y0 + 0.85, A[1]], [Bq[0], y1 + 0.85, Bq[1]], [B2[0], y1 + 0.85, B2[1]], [A2[0], y0 + 0.85, A2[1]], up);
            f([A2[0], y0 + 0.85, A2[1]], [B2[0], y1 + 0.85, B2[1]], [B2[0], y1 - 1.5, B2[1]], [A2[0], y0 - 1.5, A2[1]], out);
          } else if ((k - k0) % 2 === 0) box(b, steel, A2[0], groundAt(A2[0], A2[1]) + 0.55, A2[1], 0.08, 1.1, 0.08);   // guardrail posts on the approaches
          if (!deck) { const g0 = groundAt(A2[0], A2[1]), g1 = groundAt(B2[0], B2[1]), f = sd > 0 ? (a, bq, c, d) => quad(b, a, bq, c, d, inn, steel) : (a, bq, c, d) => quad(b, bq, a, d, c, inn, steel); f([A2[0], g0 + 0.55, A2[1]], [B2[0], g1 + 0.55, B2[1]], [B2[0], g1 + 0.85, B2[1]], [A2[0], g0 + 0.85, A2[1]]); }
          R.seg.push(A2[0] - ox * 0.3, A2[1] - oz * 0.3, B2[0] - px * 0.3, B2[1] - pz * 0.3);
        }
        if (deck) {     // slab underside
          const L = [s.X[k] + tz * (hw + 0.55), y0 - 1.5, s.Z[k] - tx * (hw + 0.55)], Rr = [s.X[k] - tz * (hw + 0.55), y0 - 1.5, s.Z[k] + tx * (hw + 0.55)], L2 = [s.X[k + 1] + uz * (hw + 0.55), y1 - 1.5, s.Z[k + 1] - ux * (hw + 0.55)], R2 = [s.X[k + 1] - uz * (hw + 0.55), y1 - 1.5, s.Z[k + 1] + ux * (hw + 0.55)];
          quad(b, L, L2, R2, Rr, [0, -1, 0], dark); quad(b, L, Rr, R2, L2, [0, -1, 0], dark);
        }
      }
      for (let k = br.i0 + 6; k < br.i1 - 3; k += 14) {      // piers every 35 m where the deck is well above the ground
        const [tx, tz] = tan(s, k), gy = groundAt(s.X[k], s.Z[k]), top = s.H[k] + s.lift - 1.5; if (top - gy < 2.5) continue;
        for (const o of [-hw + 1.6, 0, hw - 1.6]) { const x = s.X[k] + tz * o, z = s.Z[k] - tx * o; box(b, concrete, x, (top + gy - 1) / 2, z, 1.1, top - gy + 1, 1.1); }   // not solid: they stand under the deck
        box(b, concrete, s.X[k], top - 0.45, s.Z[k], 1.3, 0.9, 2 * hw + 1, Math.atan2(-tz, tx));
      }
    }

    // ---------- water: ponds and the river as sheets, creeks as ribbons; rails ----------
    const waterMat = new T.MeshPhongMaterial({ color: lin(0x3f6672), specular: lin(0xfff0d0), shininess: 90, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    for (const R of CS) {
      for (const w of R.c.water) {
        if (!(w.lvl === w.lvl)) continue; const ring = []; for (let k = 0; k < w.p.length; k += 2) ring.push(new T.Vector2(w.p[k], -w.p[k + 1]));
        const b = bufAt(R, ring[0].x, ring[0].y, 'water'), v0 = b.pos.length / 3;
        for (const p of ring) { const h = stripH(R, p.x, p.y); b.pos.push(p.x, Math.min(h === h ? h : w.lvl, w.lvl + 1.2) + 0.3, p.y); b.nor.push(0, 1, 0); b.col.push(1, 1, 1); b.uv.push(0, 0); }   // col / uv only to match the creek ribbons in the same buffer
        for (const f of T.ShapeUtils.triangulateShape(ring, [])) { const a = ring[f[0]], c = ring[f[1]], d = ring[f[2]], up = (c.y - a.y) * (d.x - a.x) - (c.x - a.x) * (d.y - a.y) > 0; b.idx.push(v0 + f[0], v0 + (up ? f[1] : f[2]), v0 + (up ? f[2] : f[1])); }
      }
      for (const cr of R.c.creeks) {      // a creek ribbon stops short of the roads it passes under
        let X = [], Z = [], Y = []; const p = cr.p, n = p.length / 2;
        const flush = () => { if (X.length > 1) K.ribbon(bufAt(R, X[0], Z[0], 'water'), { X, Z, H: Y }, 2.2, 0.12, K.white, 0); X = []; Z = []; Y = []; };
        for (let k = 0; k < n; k++) {
          const last = k === n - 1, x0 = p[2 * k], z0 = -p[2 * k + 1], m = last ? 1 : Math.max(1, Math.ceil(Math.hypot(p[2 * k + 2] - x0, -p[2 * k + 3] - z0) / 6));
          for (let q = 0; q < m; q++) { const x = last ? x0 : x0 + (p[2 * k + 2] - x0) * q / m, z = last ? z0 : z0 + (-p[2 * k + 3] - z0) * q / m, rr = corrRoad(x, z, 14); if (rr && rr.d < rr.hw + 3.5) { flush(); continue; } X.push(x); Z.push(z); Y.push(groundAt(x, z)); }
        }
        flush();
      }
      for (const p of R.c.rails) {
        const X = [], Z = [], Y = [];
        for (let k = 0; k + 3 < p.length; k += 2) { const x0 = p[k], z0 = -p[k + 1], x1 = p[k + 2], z1 = -p[k + 3], m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2.5)); for (let q = 0; q < m; q++) { const x = x0 + (x1 - x0) * q / m, z = z0 + (z1 - z0) * q / m; X.push(x); Z.push(z); Y.push(groundAt(x, z)); } }
        X.push(p[p.length - 2]); Z.push(-p[p.length - 1]); Y.push(groundAt(X[X.length - 1], Z[Z.length - 1]));
        const b = bufAt(R, X[0], Z[0], 'rail'); let run = 0;
        for (let k = 0; k < X.length; k++) { const a = Math.max(0, k - 1), c = Math.min(X.length - 1, k + 1); let tx = X[c] - X[a], tz = Z[c] - Z[a]; const il = 1 / (Math.hypot(tx, tz) || 1); tx *= il; tz *= il; if (k) run += Math.hypot(X[k] - X[k - 1], Z[k] - Z[k - 1]); const v = b.pos.length / 3, y = Y[k] + 0.13; b.pos.push(X[k] + tz * 1.7, y, Z[k] - tx * 1.7, X[k] - tz * 1.7, y, Z[k] + tx * 1.7); b.nor.push(0, 1, 0, 0, 1, 0); b.uv.push(0, run / 1.1, 1, run / 1.1); if (k) b.idx.push(v - 2, v - 1, v, v - 1, v + 1, v); }
      }
    }
    const railMat = new T.MeshLambertMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#8a8378'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4a3a2c'; g.fillRect(6, 4, 52, 12); g.fillRect(6, 36, 52, 12); g.fillStyle = '#b9b9bd'; g.fillRect(17, 0, 3, 64); g.fillRect(44, 0, 3, 64); }, true), polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });

    // ---------- paved lots at the destinations (lidar pavement + Overture parking), draped on the ground ----------
    for (const R of CS) for (const ring0 of R.c.dest.paved.concat(R.c.dest.parking || [])) {
      const ring = []; for (let k = 0; k < ring0.length; k += 2) ring.push(new T.Vector2(ring0[k], -ring0[k + 1]));
      if (ring.length > 3 && ring[0].distanceTo(ring[ring.length - 1]) < 0.01) ring.pop();
      if (ring.length < 3) continue;
      const b = bufAt(R, ring[0].x, ring[0].y, 'lot'), col = K.asphalt.service, stack = [];
      for (const f of T.ShapeUtils.triangulateShape(ring, [])) { const a = ring[f[0]], c = ring[f[1]], d = ring[f[2]], up = (c.y - a.y) * (d.x - a.x) - (c.x - a.x) * (d.y - a.y) > 0; stack.push(up ? [a, c, d] : [a, d, c]); }
      while (stack.length) {
        const t = stack.pop(), l = [0, 1, 2].map((i) => t[i].distanceTo(t[(i + 1) % 3])), m = l.indexOf(Math.max(...l));
        if (l[m] > 4) { const p = t[m], q = t[(m + 1) % 3], r = t[(m + 2) % 3], mid = p.clone().add(q).multiplyScalar(0.5); stack.push([p, mid, r], [mid, q, r]); continue; }
        const o = b.pos.length / 3; for (const p of t) { b.pos.push(p.x, groundAt(p.x, p.y) + 0.035, p.y); b.nor.push(0, 1, 0); b.col.push(col.r, col.g, col.b); b.uv.push(p.x / 7, p.y / 7); } b.idx.push(o, o + 1, o + 2);
      }
    }
    const lotMat = K.roadMat.clone(); lotMat.polygonOffsetFactor = lotMat.polygonOffsetUnits = -1;

    // ---------- trees: every lidar tree in the strips, the town's leaf-card trees; the town's edge woods give way to the strips ----------
    const T0 = W.treeChunks[0], leafMat = T0.near.material, leafDepth = T0.near.customDepthMaterial, nearG = T0.near.geometry, farG = T0.far.geometry, fir = W.firMesh;
    const stripHas = (X, Z) => { const R = stripOf(X, Z); if (!R) return false; const i = Math.round((X - R.X0) / 4), j = Math.round((Z - R.Z0) / 4); return !!R.cov[j * R.nx + i]; };
    const edge = [];      // the town's edge woods standing in a strip: hidden while the strips are drawn
    for (const ch of W.treeChunks) {
      if (Math.abs(ch.cx) + ch.hs < HALF - 20 && Math.abs(ch.cz) + ch.hs < HALF - 20) continue;
      for (const m of [ch.near, ch.far]) { const a = m.instanceMatrix.array, ks = []; for (let k = 0; k < ch.n; k++) { const x = a[16 * k + 12], z = a[16 * k + 14]; if (inSq(x, z) ? inArea(x, z) && z > HALF - 12 : stripHas(x, z)) ks.push(k); } if (ks.length) edge.push({ m, ks, keep: ks.map((k) => a.slice(16 * k, 16 * k + 11)) }); }
    }
    const edgeWoods = (cut) => { for (const e of edge) { const a = e.m.instanceMatrix.array; e.ks.forEach((k, q) => { if (cut) a.fill(0, 16 * k, 16 * k + 11); else a.set(e.keep[q], 16 * k); }); e.m.instanceMatrix.needsUpdate = true; } };
    const treeCells = [], dummy = new T.Object3D(), NUDGE = [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [4, 4], [-4, 4], [4, -4], [-4, -4]];
    for (const R of CS) {
      const open = (X, Z) => { const m = maskOf(R, X, Z); return m === 0 || m === 5; }, clear = (X, Z) => open(X, Z) && open(X + 1.5, Z) && open(X - 1.5, Z) && open(X, Z + 1.5) && open(X, Z - 1.5);
      const tb = atob(R.c.trees), o = R.c.treeOrigin, groups = new Map(), u16 = (k) => tb.charCodeAt(k) | tb.charCodeAt(k + 1) << 8;
      for (let k = 0; k < tb.length; k += 6) {
        const x = o[0] + u16(k) / 2, z = -(o[1] + u16(k + 2) / 2), h = tb.charCodeAt(k + 4) / 4, cb = tb.charCodeAt(k + 5), cr = (cb & 127) / 8, ever = cb > 127;
        if (inSq(x, z)) continue; const nd = NUDGE.find((q) => clear(x + q[0], z + q[1])); if (!nd) continue;
        const X = x + nd[0], Z = z + nd[1], y = stripH(R, X, Z); if (!(y === y)) continue;
        const key = Math.floor((X - R.X0) / CELL) * 1024 + Math.floor((Z - R.Z0) / CELL); let gr = groups.get(key); if (!gr) groups.set(key, gr = { t: [], f: [] });
        (ever ? gr.f : gr.t).push({ X, Z, y: y - 0.3, sx: ever ? Math.max(3, cr * 1.7) : Math.max(3.5, cr * 2.2), sy: Math.max(4, h * 1.04), c: K.fallColor(rng, ever), rot: rng() * 6.28 });
        R.circ.push(X, Z, 0.45);
      }
      for (const gr of groups.values()) {
        const all = gr.t.concat(gr.f); if (!all.length) continue; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (const t of all) { lo[0] = Math.min(lo[0], t.X); hi[0] = Math.max(hi[0], t.X); lo[1] = Math.min(lo[1], t.y); hi[1] = Math.max(hi[1], t.y + t.sy); lo[2] = Math.min(lo[2], t.Z); hi[2] = Math.max(hi[2], t.Z); }
        const sphere = new T.Sphere(new T.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 15);
        for (let k = gr.t.length - 1; k > 0; k--) { const q = rng() * (k + 1) | 0, t = gr.t[k]; gr.t[k] = gr.t[q]; gr.t[q] = t; }
        const mk = (base, mat, depth, list, shadow) => { if (!list.length) return null; const g = new T.BufferGeometry(); for (const a in base.attributes) g.setAttribute(a, base.attributes[a]); g.setIndex(base.index); g.boundingSphere = sphere; const m = new T.InstancedMesh(g, mat, list.length); m.name = 'rt:tree'; m.customDepthMaterial = depth; list.forEach((t, k) => { dummy.position.set(t.X, t.y, t.Z); dummy.scale.set(t.sx, t.sy, t.sx); dummy.rotation.set(0, t.rot, 0); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); m.setColorAt(k, t.c); }); m.castShadow = shadow; m.visible = false; scene.add(m); return m; };
        treeCells.push({ x0: lo[0], x1: hi[0], z0: lo[2], z1: hi[2], n: gr.t.length, near: mk(nearG, leafMat, leafDepth, gr.t, true), far: mk(farG, leafMat, leafDepth, gr.t, false), fir: mk(fir.geometry, fir.material, fir.customDepthMaterial, gr.f, true) });
      }
    }

    // ---------- buildings: plain shells in the town's far-shell look (window strips per wall style, flat-coloured roofs) ----------
    const farShell = scene.getObjectByName('buildings-far'), shellMat = farShell ? farShell.material : new T.MeshLambertMaterial({ vertexColors: true });
    const FARP = [4.5 / 256, 1 - 4.5 / 1024], pick = (a) => a[rng() * a.length | 0];
    const SIDING = [0xf3f1e8, 0xf3f1e8, 0xf3f1e8, 0xece4c9, 0xece4c9, 0xe8d88e, 0xb5c0a0, 0xa9b8c6, 0xceb68d, 0x9a4a3a, 0xd0d1cc, 0xbba993, 0x8196a8].map(lin), BRICKC = [0x96604d, 0x8a5244, 0xa06a52].map(lin);
    const METAL = [0xb5ada0, 0x9aa3a8, 0xc2b59b, 0x8b8f92, 0xd4d7d6, 0x7c8f7e, 0x8a4338, 0x8a4338].map(lin), BLOCK = [0xd8d4c8, 0xc4c6c4, 0xe6e2d6, 0xb8ad98].map(lin);
    const ROOF = [0x4a4744, 0x5b4636, 0x6b6e70, 0x4f2f29, 0x3e4a44, 0x55504a, 0x3a3836].map(lin), MROOF = [0xb4b8b9, 0xb4b8b9, 0x7a3229, 0x2f4a3a, 0x4a4d50, 0x5a4636, 0x8f999e].map(lin), FLATS = [0x77797a, 0x8a8577, 0x565859, 0x9b9d9a, 0x6f6a62].map(lin);
    function wall(b, x0, z0, x1, z1, yb, ya, yc, col, nt, row) {   // from (x0, z0) to (x1, z1) seen from outside on the left-hand side; top ya at the start, yc at the end
      const L = Math.hypot(x1 - x0, z1 - z0) || 1, n = [-(z1 - z0) / L, 0, (x1 - x0) / L], o = b.pos.length / 3, v0 = 1 - (row + 1) / 8 + 0.004, v1 = 1 - row / 8 - 0.004;
      b.pos.push(x0, yb, z0, x1, yb, z1, x1, yc, z1, x0, ya, z0); for (let k = 0; k < 4; k++) { b.nor.push(n[0], 0, n[2]); b.col.push(col.r, col.g, col.b); }
      if (nt && row >= 0) b.uv.push(0, v0, nt / 2, v0, nt / 2, v1, 0, v1); else b.uv.push(FARP[0], FARP[1], FARP[0], FARP[1], FARP[0], FARP[1], FARP[0], FARP[1]);
      b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    function face(b, pts, col) {      // a planar roof facet (any winding: turned to face up)
      const [a, c, d] = pts, nx = (c[1] - a[1]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[1] - a[1]), ny = (c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2]), nz = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]), l = Math.hypot(nx, ny, nz) || 1, f = ny < 0 ? -1 : 1, o = b.pos.length / 3;
      for (const p of pts) { b.pos.push(p[0], p[1], p[2]); b.nor.push(nx / l * f, ny / l * f, nz / l * f); b.col.push(col.r, col.g, col.b); b.uv.push(FARP[0], FARP[1]); }
      for (let k = 1; k + 1 < pts.length; k++) if (f > 0) b.idx.push(o, o + k, o + k + 1); else b.idx.push(o, o + k + 1, o + k);
    }
    for (const R of CS) { const g = R.rs = new Map(); R.roads.forEach((s, ri) => { for (let k = 0; k < s.X.length; k++) { const key = Math.floor(s.X[k] / 32) * 65536 + Math.floor(s.Z[k] / 32); (g.get(key) || g.set(key, []).get(key)).push(ri, k); } }); }
    function onRoad(R, pts) {      // a road's carriageway runs over 1 m into the walls, or they stand within 1.2 m of its centre line (Overture and OSM disagree)
      // ponytail: the whole building is left out; clip its footprint at the carriageway if a real one goes missing
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      for (let i = Math.floor((x0 - 8) / 32); i <= Math.floor((x1 + 8) / 32); i++) for (let j = Math.floor((z0 - 8) / 32), L; j <= Math.floor((z1 + 8) / 32); j++) if ((L = R.rs.get(i * 65536 + j))) for (let q = 0; q < L.length; q += 2) {
        const s = R.roads[L[q]], X = s.X[L[q + 1]], Z = s.Z[L[q + 1]], lim = Math.max(s.hw - 1, 1.2); if (X < x0 - lim || X > x1 + lim || Z < z0 - lim || Z > z1 + lim) continue; let ins = false;
        for (let a = 0, e = pts.length - 1; a < pts.length; e = a++) { const [ax, az] = pts[e], ex = pts[a][0] - ax, ez = pts[a][1] - az, t = clamp(((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1e-9), 0, 1); if (Math.hypot(X - ax - ex * t, Z - az - ez * t) < lim) return true; if ((az > Z) !== (az + ez > Z) && X < ax + (Z - az) / ez * ex) ins = !ins; }
        if (ins) return true;
      }
      return false;
    }
    for (const R of CS) R.c.buildings.forEach((bd, bi) => {
      let ring = []; for (let k = 0; k < bd.p.length; k += 2) ring.push([bd.p[k], -bd.p[k + 1]]);
      if (ring.length > 3 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 0.01) ring.pop();
      if (ring.length < 3) return;
      let A = 0, cx = 0, cz = 0; for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length], cr = p[0] * q[1] - q[0] * p[1]; A += cr; cx += (p[0] + q[0]) * cr; cz += (p[1] + q[1]) * cr; }
      cx /= 3 * A; cz /= 3 * A; A /= 2; if (A > 0) { ring.reverse(); A = -A; } A = -A;      // walls want the ring with negative signed area
      if (inSq(cx, cz)) return;
      const dest = R.c.dest.buildings.includes(bi), town = R.c.dest.name && Math.hypot(cx - R.c.dest.x, cz + R.c.dest.y) < 400;      // the property's house; the Linton frontage round the Taco Bell is commercial
      const named = /retail|commercial/.test(bd.k) || !!bd.n || (town && A > 250), church = bd.k === 'church', shed = A < 45 && !named && !dest, barn = !named && !church && !dest && bd.k !== 'house' && A > 260;
      const has = bd.e > 0.5, e = has ? bd.e : shed ? 2.6 : barn ? 4.5 : named ? 4.3 : 3.2, rise = has ? bd.r : named ? 0 : shed ? 1 : 2, typ = has ? bd.t : named ? 0 : 1;
      let lo = 1e9; for (const p of ring) lo = Math.min(lo, groundAt(p[0], p[1])); const fc = stripH(R, cx, cz), fl = fc === fc ? fc : bd.f, ye = fl + e;
      const wc = barn || shed ? pick(METAL) : named ? pick(BLOCK) : church ? pick(BRICKC) : pick(SIDING), rc = barn || shed ? pick(MROOF) : typ === 0 || rise < 0.4 ? pick(FLATS) : pick(ROOF);
      const row = barn || shed ? -1 : church ? 2 : named ? 1 : 0, nst = clamp(Math.round(e / 3.1), 1, 3), b = bufAt(R, cx, cz, 'bldg');
      const walls = (pts, top) => { for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), nt = L > 3 ? Math.round(L / 3.3) : 0; if (L < 0.05) continue;
        wall(b, p[0], p[1], q[0], q[1], lo - 0.4, fl, fl, wc, 0, -1); for (let s = 0; s < nst; s++) wall(b, p[0], p[1], q[0], q[1], fl + e * s / nst, fl + e * (s + 1) / nst, fl + e * (s + 1) / nst, wc, nt, s && named ? 3 : row);
        if (top) top(p, q); R.seg.push(p[0], p[1], q[0], q[1]); } };
      // minimum-area rectangle (one side on a footprint edge); a near-rectangle gets its lidar roof type, anything else a flat roof
      let best = null; for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue; const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const r of ring) { const u = r[0] * ux + r[1] * uz, v = -r[0] * uz + r[1] * ux; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); } const ar = (a1 - a0) * (b1 - b0); if (!best || ar < best.ar) best = { ar, ux, uz, a0, a1, b0, b1 }; }
      const rect = typ > 0 && rise >= 0.4 && best && A / best.ar > 0.8;      // the walls follow the min-area rectangle, else the footprint
      if (!dest && onRoad(R, rect ? [[best.a0, best.b0], [best.a1, best.b0], [best.a1, best.b1], [best.a0, best.b1]].map(([u, v]) => [u * best.ux - v * best.uz, u * best.uz + v * best.ux]) : ring)) { bd.drop = true; return; }      // the road wins
      const hip = (fx, fz, a0, a1, b0, b1, yr) => { const P = (u, v, y) => [u * fx - v * fz, y, u * fz + v * fx], hl = (a1 - a0) / 2, hwd = (b1 - b0) / 2, vm = (b0 + b1) / 2, r0 = Math.min(hwd, hl);
        face(b, [P(a0, b0, ye), P(a1, b0, ye), P(a1 - r0, vm, yr), P(a0 + r0, vm, yr)], rc); face(b, [P(a1, b1, ye), P(a0, b1, ye), P(a0 + r0, vm, yr), P(a1 - r0, vm, yr)], rc); face(b, [P(a0, b1, ye), P(a0, b0, ye), P(a0 + r0, vm, yr)], rc); face(b, [P(a1, b0, ye), P(a1, b1, ye), P(a1 - r0, vm, yr)], rc); };
      const lslabs = () => {      // a 6-corner rectilinear footprint (the L-shaped house) as its two slabs [u0, u1, v0, v1] in the min-area frame, else null
        // ponytail: L shapes only; T / U and odd footprints keep a flat roof, slab-decompose them too if they show
        if (ring.length !== 6 || !best) return null; const { ux, uz } = best, uv = ring.map((p) => [p[0] * ux + p[1] * uz, -p[0] * uz + p[1] * ux]);
        for (let k = 0; k < 6; k++) { const p = uv[k], q = uv[(k + 1) % 6], du = Math.abs(q[0] - p[0]), dv = Math.abs(q[1] - p[1]); if (Math.min(du, dv) > 0.15 * Math.max(du, dv)) return null; }
        const vs = uv.map((p) => p[1]).sort((x, y) => x - y), lv = [vs[0]]; for (const v of vs) if (v - lv[lv.length - 1] > 0.6) lv.push(v); if (lv.length !== 3) return null;
        const sl = [[lv[0], lv[1]], [lv[1], lv[2]]].map(([v0, v1]) => { const vm = (v0 + v1) / 2, us = []; for (let k = 0; k < 6; k++) { const p = uv[k], q = uv[(k + 1) % 6]; if ((p[1] - vm) * (q[1] - vm) < 0) us.push(p[0] + (vm - p[1]) / (q[1] - p[1]) * (q[0] - p[0])); } return us.length === 2 ? [Math.min(us[0], us[1]), Math.max(us[0], us[1]), v0, v1] : null; });
        return sl[0] && sl[1] ? sl : null;
      };
      const L2 = typ > 0 && rise >= 0.4 && best && A / best.ar <= 0.8 ? lslabs() : null;
      if (rect) {
        let { ux, uz, a0, a1, b0, b1 } = best; if ((a1 - a0 < b1 - b0) !== (typ === 2)) { const t = ux; ux = -uz; uz = t; [a0, a1, b0, b1] = [b0, b1, -a1, -a0]; }   // u along the ridge
        const P = (u, v, y) => [u * ux - v * uz, y, u * uz + v * ux], hl = (a1 - a0) / 2, hwd = (b1 - b0) / 2, vm = (b0 + b1) / 2, yr = ye + rise;
        const c4 = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([u, v]) => { const p = P(u, v, 0); return [p[0], p[2]]; }); let sa = 0; for (let k = 0; k < 4; k++) sa += c4[k][0] * c4[(k + 1) % 4][1] - c4[(k + 1) % 4][0] * c4[k][1]; if (sa > 0) c4.reverse();
        lo = 1e9; for (const p of c4) lo = Math.min(lo, groundAt(p[0], p[1]));
        walls(c4, null);
        if (typ === 3) hip(ux, uz, a0, a1, b0, b1, yr);
        else {
          face(b, [P(a0, b0, ye), P(a1, b0, ye), P(a1, vm, yr), P(a0, vm, yr)], rc); face(b, [P(a1, b1, ye), P(a0, b1, ye), P(a0, vm, yr), P(a1, vm, yr)], rc);
          for (const [u, s1] of [[a0, 1], [a1, -1]]) { const p = P(u, b0, ye), q = P(u, b1, ye), m = P(u, vm, yr), o = b.pos.length / 3, nx = -s1 * ux, nz = -s1 * uz; for (const v of [p, q, m]) { b.pos.push(v[0], v[1], v[2]); b.nor.push(nx, 0, nz); b.col.push(wc.r, wc.g, wc.b); b.uv.push(FARP[0], FARP[1]); } const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [m[0] - p[0], m[1] - p[1], m[2] - p[2]], f = (e1[1] * e2[2] - e1[2] * e2[1]) * nx + (e1[0] * e2[1] - e1[1] * e2[0]) * nz; b.idx.push(o, f > 0 ? o + 1 : o + 2, f > 0 ? o + 2 : o + 1); }   // gable ends
        }
      } else if (L2) {      // two hip roofs at the lidar pitch, each ridge along its slab's long side (a hipped L-shaped ranch house)
        walls(ring, null); const { ux, uz } = best, hw2 = L2.map((s) => Math.min(s[1] - s[0], s[3] - s[2]) / 2), pitch = rise / Math.max(hw2[0], hw2[1]);
        L2.forEach(([a0, a1, b0, b1], i) => { if (a1 - a0 >= b1 - b0) hip(ux, uz, a0, a1, b0, b1, ye + pitch * hw2[i]); else hip(-uz, ux, b0, b1, -a1, -a0, ye + pitch * hw2[i]); });
      } else {
        walls(ring, null);
        const v2 = ring.map((p) => new T.Vector2(p[0], p[1])), o = b.pos.length / 3, yt = ye + (typ > 0 && rise >= 0.4 ? Math.min(rise, 1.5) * 0.4 : 0);
        for (const p of ring) { b.pos.push(p[0], yt, p[1]); b.nor.push(0, 1, 0); b.col.push(rc.r, rc.g, rc.b); b.uv.push(FARP[0], FARP[1]); }
        if (yt > ye + 0.01) for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length]; wall(b, p[0], p[1], q[0], q[1], ye, yt, yt, wc, 0, -1); }
        for (const f of T.ShapeUtils.triangulateShape(v2, [])) { const a = v2[f[0]], c = v2[f[1]], d = v2[f[2]], up = (c.y - a.y) * (d.x - a.x) - (c.x - a.x) * (d.y - a.y) > 0; b.idx.push(o + f[0], o + (up ? f[1] : f[2]), o + (up ? f[2] : f[1])); }
      }
    });
    for (const R of CS) R.rs = null;

    // ---------- utility poles with wires along the route (procedural: rural lines are mostly unmapped) and on the mapped lines ----------
    const WOOD = lin(0x4a4038), wire = new Map(), BOXC = [0x1e1f22, 0xe6e3da, 0x6b6e73, 0x2f4a36, 0x8a8f92].map(lin);
    const clearSpot = (R, X, Z, r) => { if (inSq(X, Z)) return false; const m = maskOf(R, X, Z); if (m !== 0) return false; const q = corrRoad(X, Z, 30); return !q || q.d - q.hw > r; };
    function pole(R, X, Z, nx, nz) { const y = groundAt(X, Z), b = bufAt(R, X, Z, 'solid'), yaw = Math.atan2(-nz, nx); box(b, WOOD, X, y + 4.35, Z, 0.3, 9.3, 0.3, 0, 0.55); box(b, WOOD, X, y + 8.4, Z, 2.2, 0.12, 0.12, yaw); R.circ.push(X, Z, 0.3); return { X, Z, y, nx, nz }; }
    function tower(R, X, Z, nx, nz) {      // a lattice transmission tower (four see-through faces, 3.8 m half-width at the foot, 1 m at 30 m), its cross-arm along (nx, nz)
      const y = groundAt(X, Z), b = bufAt(R, X, Z, 'tower'), sb = bufAt(R, X, Z, 'solid'), ux = -nz, uz = nx, yaw = Math.atan2(-nz, nx), P = (s, t, h, w) => [X + (ux * s + nx * t) * w, y + h, Z + (uz * s + nz * t) * w];
      for (const [s0, t0, s1, t1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) quad(b, P(s0, t0, -0.5, 3.8), P(s1, t1, -0.5, 3.8), P(s1, t1, 30, 1), P(s0, t0, 30, 1), [ux * (s0 + s1) / 2 + nx * (t0 + t1) / 2, 0, uz * (s0 + s1) / 2 + nz * (t0 + t1) / 2], null, [0, 0, 1, 0, 1, 1, 0, 1]);
      box(sb, steel, X, y + 25.6, Z, 17, 1.1, 1.1, yaw); box(sb, steel, X, y + 31.6, Z, 2, 3.2, 2, yaw, 0.4); box(sb, steel, X, y + 33.2, Z, 8, 0.4, 0.4, yaw);
      R.circ.push(X, Z, 4.2); return { X, Z, y, nx, nz };
    }
    const TWIRE = [[7.5, 23.4], [-7.5, 23.4], [0, 23.4], [4, 33], [-4, 33]];      // three conductors under the arm on insulators, two earth wires on the peak
    function span(R, a, b, lay) {
      const L = Math.hypot(b.X - a.X, b.Z - a.Z), f = a.nx * b.nx + a.nz * b.nz < 0 ? -1 : 1, c = cellOf(R, a.X, a.Z); let w = wire.get(c); if (!w) wire.set(c, w = []);
      for (const [o, h] of lay || [[1, 8.5], [-1, 8.5], [0, 7.2]]) { const ax = a.X + a.nx * o, az = a.Z + a.nz * o, ex = b.X + b.nx * o * f - ax, ez = b.Z + b.nz * o * f - az; for (let q = 0; q < 6; q++) for (const u of [q / 6, (q + 1) / 6]) w.push(ax + ex * u, a.y + h + (b.y - a.y) * u - L * 0.1 * u * (1 - u), az + ez * u); }
    }
    for (const R of CS) {
      const s = R.route, n = s.X.length; let arc = 0, next = 45, prev = null;
      for (let k = 1; k < n; k++) {
        arc += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]); if (arc < next) continue; next = arc + 48;
        if (onBridge(R, k)) { prev = null; continue; }
        const [tx, tz] = tan(s, k), lx = tz, lz = -tx; let p = null;
        for (const o of [9, 12, 6.5, 15]) { const X = s.X[k] + lx * (s.hw + o), Z = s.Z[k] + lz * (s.hw + o); if (clearSpot(R, X, Z, 2.5)) { p = pole(R, X, Z, lx, lz); break; } }
        if (!p) continue; if (prev && Math.hypot(p.X - prev.X, p.Z - prev.Z) < 80) span(R, prev, p); prev = p;
      }
      const TW = R.area ? R.c.poles.filter((p) => p[2] === 1) : [], isT = (x, y) => TW.some((t) => Math.hypot(x - t[0], y - t[1]) < 3);
      // ponytail: towers in the band only (the west corridor's two keep their wooden poles, as before); drop the R.area test to give them towers too
      for (const ln of R.c.power) {        // mapped lines: a pole at every vertex and every 60 m between; a transmission line: a tower at each of its mapped towers
        let prevP = null, tl = false; for (let k = 0; k < ln.length && !tl; k += 2) tl = isT(ln[k], ln[k + 1]);
        if (tl) { for (let k = 0; k < ln.length; k += 2) if (isT(ln[k], ln[k + 1]) && !inSq(ln[k], -ln[k + 1])) { const a = Math.max(0, k - 2), e = Math.min(ln.length - 2, k + 2), tx = ln[e] - ln[a], tz = ln[a + 1] - ln[e + 1], l = Math.hypot(tx, tz) || 1, p = tower(R, ln[k], -ln[k + 1], tz / l, -tx / l); if (prevP) span(R, prevP, p, TWIRE); prevP = p; } continue; }
        for (let k = 0; k + 1 < ln.length; k += 2) {
          const x0 = ln[k], z0 = -ln[k + 1], last = k + 3 >= ln.length, x1 = last ? x0 : ln[k + 2], z1 = last ? z0 : -ln[k + 3], L = Math.hypot(x1 - x0, z1 - z0), m = last ? 1 : Math.max(1, Math.ceil(L / 60)), tx = L ? (x1 - x0) / L : 1, tz = L ? (z1 - z0) / L : 0;
          for (let q = 0; q < m; q++) { const X = x0 + (x1 - x0) * q / m, Z = z0 + (z1 - z0) * q / m; if (!stripHas(X, Z) || inSq(X, Z) || maskOf(R, X, Z) === 1) { prevP = null; continue; } const p = pole(R, X, Z, tz, -tx); if (prevP) span(R, prevP, p); prevP = p; }
        }
      }
      for (const mb of R.c.mailboxes) {   // scenery only (not solid), as in town
        const X = mb[0], Z = -mb[1], y = groundAt(X, Z), b = bufAt(R, X, Z, 'solid'), c = Math.cos(mb[2]), sn = Math.sin(mb[2]); if (inSq(X, Z)) continue;
        box(b, WOOD, X, y + 0.475, Z, 0.11, 1.15, 0.11, mb[2]); box(b, pick(BOXC), X + c * 0.1, y + 1.16, Z - sn * 0.1, 0.5, 0.24, 0.2, mb[2]);
      }
    }

    // ---------- signs: one atlas (route markers, distances, speed limit, road closed, the Taco Bell pole sign) ----------
    const LEN = CS.map((R) => { let a = 0; const s = R.route; for (let k = 1; k < s.X.length; k++) a += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]); return a; });
    const mi = (m) => Math.max(1, Math.round(m / 1609.34)), SL = [], dirOf = { north: 'NORTH', west: 'WEST' };
    const refOf = (R) => { const sp = R.route.spans; let r = sp && sp.length ? sp[0][4] || '' : ''; r = r.split('/').pop(); return r; };
    const signsTex = canvasTex(1024, 512, (g) => {
      g.fillStyle = '#8d9093'; g.fillRect(0, 0, 1024, 512);
      const slot = (n, w, h, draw) => { const x0 = (n % 4) * 256 + (256 - w) / 2, y0 = (n >> 2) * 256 + (256 - h) / 2; g.save(); g.translate(x0, y0); draw(w, h); g.restore(); SL[n] = [x0 / 1024, 1 - (y0 + h) / 512, (x0 + w) / 1024, 1 - y0 / 512]; };
      const txt = (t, x, y, px, font, col, maxW) => { g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; U.fit(g, t, maxW || 999, px, font); g.fillText(t, x, y); };
      const bold = 'bold ' + U.TEXT_FONT, frame = (w, h, bg, fg, r) => { g.fillStyle = fg; g.fillRect(0, 0, w, h); g.fillStyle = bg; g.fillRect(r, r, w - 2 * r, h - 2 * r); };
      CS.forEach((R, i) => R.area || slot(i, 200, 256, (w, h) => { frame(w, h, '#f4f4ef', '#141414', 7); g.fillStyle = '#141414'; g.fillRect(7, 62, w - 14, 5); txt(dirOf[R.id] || R.id.toUpperCase(), w / 2, 36, 46, bold, '#141414', w - 30); txt(refOf(R), w / 2, 160, 128, bold, '#141414', w - 26); }));
      slot(2, 200, 256, (w, h) => { frame(w, h, '#f4f4ef', '#141414', 7); txt('SPEED', w / 2, 46, 50, bold, '#141414', w - 30); txt('LIMIT', w / 2, 96, 50, bold, '#141414', w - 30); txt('55', w / 2, 182, 118, bold, '#141414', w - 30); });
      const green = (n, a, b) => slot(n, 256, 96, (w, h) => { g.fillStyle = '#0d6b3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2f2ea'; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10); g.textBaseline = 'middle'; g.fillStyle = '#f2f2ea'; g.textAlign = 'left'; U.fit(g, a, 170, 52, bold); g.fillText(a, 18, h / 2 + 2); g.textAlign = 'right'; U.fit(g, b, 60, 52, bold); g.fillText(b, w - 18, h / 2 + 2); });
      const wI = CS.findIndex((R) => R.id === 'west'), nI = CS.findIndex((R) => R.id === 'north');
      if (wI >= 0) { green(3, 'Linton', String(mi(LEN[wI] - 700))); green(4, 'Bloomfield', String(mi(LEN[wI] - 500 + HALF))); }
      if (nI >= 0) green(5, 'Bloomfield', String(mi(LEN[nI] - 300 + HALF)));
      slot(6, 256, 128, (w, h) => { frame(w, h, '#f6f3e8', '#c8202b', 6); txt('ROAD', w / 2, h * 0.3, 54, bold, '#141414', w - 30); txt('CLOSED', w / 2, h * 0.72, 54, bold, '#141414', w - 30); });
      const dn = (CS[wI] && CS[wI].c.dest.name) || '';
      if (dn) slot(7, 256, 168, (w, h) => { frame(w, h, '#f2c230', '#1b1a1c', 6); txt(dn, w / 2, h / 2 + 4, 76, U.SIGN_FONT, '#1b1a1c', w - 34); });
    });
    const signMat = new T.MeshLambertMaterial({ map: signsTex });
    function sign(R, slot, X, Z, nx, nz, w, h, clear, posts, both) {     // panel facing (nx, nz); the back is grey, or the same face again (pole signs)
      const y = groundAt(X, Z) + clear, rx = nz, rz = -nx, uv = SL[slot], b = bufAt(R, X, Z, 'sign'), gp = [0.002, 0.002, 0.002, 0.002], m = 0.03;
      const BL = [X - rx * w / 2 + nx * m, y, Z - rz * w / 2 + nz * m], BR = [X + rx * w / 2 + nx * m, y, Z + rz * w / 2 + nz * m], TR = [BR[0], y + h, BR[2]], TL = [BL[0], y + h, BL[2]];
      quad(b, BL, BR, TR, TL, [nx, 0, nz], null, [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);
      const bl = [X + rx * w / 2 - nx * m, y, Z + rz * w / 2 - nz * m], br = [X - rx * w / 2 - nx * m, y, Z - rz * w / 2 - nz * m], tr = [br[0], y + h, br[2]], tl = [bl[0], y + h, bl[2]];
      quad(b, bl, br, tr, tl, [-nx, 0, -nz], null, both ? [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]] : [gp[0], gp[1], gp[0], gp[1], gp[0], gp[1], gp[0], gp[1]]);
      const sb = bufAt(R, X, Z, 'solid'), yaw = Math.atan2(-nz, nx); box(sb, steel, X, y + h / 2, Z, 0.05, h + 0.06, w + 0.06, yaw);
      for (const p of posts) { const px = X + rx * p, pz = Z + rz * p, g0 = groundAt(px, pz); box(sb, steel, px - nx * 0.06, (g0 - 0.3 + y + h * 0.8) / 2, pz - nz * 0.06, clear > 6 ? 0.45 : 0.08, y + h * 0.8 - g0 + 0.3, clear > 6 ? 0.45 : 0.08); }
    }
    function roadside(R, arc, out, slot, w, h) {     // a sign on the right of the lane, `arc` m from the town edge (out) or from the end (in)
      const s = R.route, n = s.X.length; let a = 0, k = 0, target = out ? arc : LEN[CS.indexOf(R)] - arc;
      for (k = 1; k < n && a < target; k++) a += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]);
      for (let tries = 0; tries < 8; tries++, k += out ? 4 : -4) {
        const kk = clamp(k, 0, n - 1), [tx, tz] = tan(s, kk), sd = out ? -1 : 1, X = s.X[kk] + tz * sd * (s.hw + 3.2), Z = s.Z[kk] - tx * sd * (s.hw + 3.2);
        if (!clearSpot(R, X, Z, 1.5)) continue; sign(R, slot, X, Z, out ? -tx : tx, out ? -tz : tz, w, h, 2.1, [0], false); R.circ.push(X, Z, 0.12); return;
      }
    }
    CS.forEach((R, i) => {
      if (!R.area) roadside(R, 160, true, i, 0.75, 0.96); roadside(R, 420, true, 2, 0.75, 0.96);
      if (R.id === 'west') { roadside(R, 760, true, 3, 2.4, 0.9); roadside(R, 500, false, 4, 2.4, 0.9); roadside(R, 900, false, 2, 0.75, 0.96); }
      if (R.id === 'north') { roadside(R, 300, false, 5, 2.4, 0.9); roadside(R, 700, false, 2, 0.75, 0.96); }
      const sg = R.c.dest.sign; if (sg && SL[7]) { routeDist(R, sg.x, -sg.y, 60); const [tx, tz] = tan(R.route, Math.max(0, nearK)); sign(R, 7, sg.x, -sg.y, tx, tz, 3.4, 2.2, Math.max(4, sg.h - 2.2), [0], true); R.circ.push(sg.x, -sg.y, 0.3); }
    });

    // ---------- the fence: both sides of the route at D, round the far end; gates or barricades where it crosses a road ----------
    const fenceMat = new T.MeshLambertMaterial({ map: canvasTex(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128); g.fillStyle = '#c9cbc9';
      for (const y of [6, 30, 52, 72, 89, 103, 114, 123]) g.fillRect(0, y, 256, 2.2);       // woven field fence: line wires closer near the ground
      for (let x = 4; x < 256; x += 21.3) g.fillRect(x, 30, 2, 95);
      g.fillStyle = '#9da09e'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 4, 3, 6);    // barbs on the top strand
    }, true), alphaTest: 0.5, side: T.DoubleSide });
    const STRIPE = [lin(0xe8661c), lin(0xf2f0e8)], GATE = lin(0x9fa3a6);
    const towerMat = new T.MeshLambertMaterial({ map: canvasTex(64, 256, (g) => {      // galvanised lattice: corner legs, struts and cross bracing
      g.clearRect(0, 0, 64, 256); g.strokeStyle = g.fillStyle = '#b3b6b4'; g.fillRect(0, 0, 6, 256); g.fillRect(58, 0, 6, 256); g.lineWidth = 3;
      for (let y = 0; y < 256; y += 32) { g.fillRect(0, y, 64, 3); g.beginPath(); g.moveTo(3, y); g.lineTo(61, y + 32); g.moveTo(61, y); g.lineTo(3, y + 32); g.stroke(); }
    }, true), alphaTest: 0.5, side: T.DoubleSide });
    for (const R of CS) {
      const s = R.route, base = [], [t0x, t0z] = R.out;
      for (let e = 60; e > 0; e -= 10) base.push([s.X[0] - t0x * e, s.Z[0] - t0z * e, t0x, t0z]);
      for (let k = 0; k < s.X.length; k += 8) { const t = tan(s, k); base.push([s.X[k], s.Z[k], t[0], t[1]]); }      // a fence vertex every 20 m along the route
      { const k = s.X.length - 1; if (k % 8) { const t = tan(s, k); base.push([s.X[k], s.Z[k], t[0], t[1]]); } }      // and at its end, the cap's centre
      const L = base.map((b) => [b[0] + b[3] * D, b[1] - b[2] * D]), Rt = base.map((b) => [b[0] - b[3] * D, b[1] + b[2] * D]), e = base[base.length - 1], cap = [];
      for (let a = 1; a < 32; a++) { const th = Math.PI / 2 - a * Math.PI / 32, c = Math.cos(th), sn = Math.sin(th); cap.push([e[0] + (e[2] * c + e[3] * sn) * D, e[1] + (e[3] * c - e[2] * sn) * D]); }
      const lines = [L.concat(cap, Rt.reverse()).filter((p) => routeDist(R, p[0], p[1], D) >= D - 1.5)];      // one closed run: points pulled inside a bend are dropped and their neighbours joined
      if (R.area) {      // the band: its three outer sides, 55 m along the old edge at each corner, and up each end of the town's edge strip into town, a vertex every 20 m
        // the strip's walls lean out over their last 35 m in town, past the reach of a car held at PLAY by game.js, so a car hugging the town's edge is steered inside them
        const a = R.area, P = [[-PLAY - 2.5, PLAY - 60], [-XW, PLAY - 25], [-XW, a.z0], [a.x0, a.z0], [a.x0, a.z1], [a.x1, a.z1], [a.x1, a.z0], [XW, a.z0], [XW, PLAY - 25], [PLAY + 2.5, PLAY - 60]], ln = lines[0] = [];
        for (let q = 0; q + 1 < P.length; q++) { const [ax, az] = P[q], [bx, bz] = P[q + 1], m = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 20)); for (let k = 0; k < m; k++) ln.push([ax + (bx - ax) * k / m, az + (bz - az) * k / m]); }
        ln.push(P[P.length - 1]);
      }
      R.fence = lines;
      for (const ln of lines) for (let q = 0; q + 1 < ln.length; q++) {
        const a = ln[q], c = ln[q + 1], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.1) continue;
        R.seg.push(a[0], a[1], c[0], c[1]);
        let rd = null; for (let u = 0; u <= 1; u += 0.125) { const r = corrRoad(a[0] + dx * u, a[1] + dz * u, 14); if (r && r.d < r.hw + 1.2 && (!rd || r.d < rd.d)) rd = r; }
        const sb = bufAt(R, a[0], a[1], 'solid'), yaw = Math.atan2(-dz, dx);
        if (rd) {        // a barricade across a road, a farm gate across a lane
          const ux = dx / len, uz = dz / len, t = ((rd.x - a[0]) * ux + (rd.z - a[1]) * uz), cx = a[0] + ux * t, cz = a[1] + uz * t, half = rd.hw + 0.7, y = groundAt(cx, cz);
          const big = rd.cls === 'primary' || rd.cls === 'secondary' || rd.cls === 'tertiary' || rd.cls === 'residential' || rd.cls === 'unclassified';
          for (const o of [-half, half]) box(sb, big ? STRIPE[1] : WOOD, cx + ux * o, groundAt(cx + ux * o, cz + uz * o) + 0.7, cz + uz * o, 0.14, 1.6, 0.14, yaw);
          if (big) { const nseg = Math.max(2, Math.round(2 * half / 0.6)); for (const hy of [0.62, 1.05]) for (let i = 0; i < nseg; i++) { const o = -half + (i + 0.5) * 2 * half / nseg; box(sb, STRIPE[i & 1], cx + ux * o, y + hy, cz + uz * o, 2 * half / nseg, 0.22, 0.05, yaw); } sign(R, 6, cx, cz, -uz, ux, 1.2, 0.6, 1.25, [], true); }
          else for (const hy of [0.3, 0.55, 0.8, 1.05, 1.3]) box(sb, GATE, cx, y + hy, cz, 2 * half, 0.05, 0.05, yaw);
        }
        const nsp = Math.max(1, Math.round(len / 5));
        for (let i = 0; i < nsp; i++) {
          const u0 = i / nsp, u1 = (i + 1) / nsp, x0 = a[0] + dx * u0, z0 = a[1] + dz * u0, x1 = a[0] + dx * u1, z1 = a[1] + dz * u1, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          if (rd && Math.hypot(mx - rd.x, mz - rd.z) < rd.hw + 3) continue;
          const mm = inSq(mx, mz) ? town.mask(mx, mz) : maskOf(R, mx, mz); if (mm === 4 || mm === 1 || (mm === 3 && R.area)) continue;      // the band's fence stops at the White River's banks
          const y0 = groundAt(x0, z0), y1 = groundAt(x1, z1), b = bufAt(R, x0, z0, 'fence'), uA = i * len / nsp / 2.1, uB = uA + len / nsp / 2.1;
          quad(b, [x0, y0 + 0.06, z0], [x1, y1 + 0.06, z1], [x1, y1 + 1.28, z1], [x0, y0 + 1.28, z0], [-dz / len, 0, dx / len], null, [uA, 0, uB, 0, uB, 1, uA, 1]);
          box(sb, i ? GATE : WOOD, x0, y0 + 0.62, z0, i ? 0.05 : 0.12, 1.5, i ? 0.05 : 0.12, yaw);
        }
      }
    }

    // ---------- collision grids (16 m), as world.js's ----------
    for (const R of CS) {
      const CG = 16, gnx = Math.ceil((R.X1 - R.X0) / CG) + 1, gnz = Math.ceil((R.Z1 - R.Z0) / CG) + 1, circ = Float32Array.from(R.circ), seg = Float32Array.from(R.seg), cc = new Array(gnx * gnz), sc = new Array(gnx * gnz);
      const ci = (X) => clamp(Math.floor((X - R.X0) / CG), 0, gnx - 1), cj = (Z) => clamp(Math.floor((Z - R.Z0) / CG), 0, gnz - 1);
      for (let k = 0; k < circ.length; k += 3) { const c = cj(circ[k + 1]) * gnx + ci(circ[k]); (cc[c] || (cc[c] = [])).push(k); }
      for (let k = 0; k < seg.length; k += 4) { const i0 = ci(Math.min(seg[k], seg[k + 2])), i1 = ci(Math.max(seg[k], seg[k + 2])), j0 = cj(Math.min(seg[k + 1], seg[k + 3])), j1 = cj(Math.max(seg[k + 1], seg[k + 3])); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (sc[j * gnx + i] || (sc[j * gnx + i] = [])).push(k); }
      const hit = { nx: 0, nz: 0, depth: 0 };
      R.collide = (X, Z, r) => {
        const i0 = ci(X), j0 = cj(Z); hit.depth = 0;
        for (let j = Math.max(0, j0 - 1); j <= Math.min(gnz - 1, j0 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(gnx - 1, i0 + 1); i++) {
          const a = cc[j * gnx + i], s = sc[j * gnx + i];
          if (a) for (const k of a) { const dx = X - circ[k], dz = Z - circ[k + 1], d = Math.hypot(dx, dz), pen = r + circ[k + 2] - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
          if (s) for (const k of s) { const ax = seg[k], az = seg[k + 1], ex = seg[k + 2] - ax, ez = seg[k + 3] - az, t = clamp(((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dx = X - ax - ex * t, dz = Z - az - ez * t, d = Math.hypot(dx, dz), pen = r - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
        }
        return hit.depth > 0 ? hit : null;
      };
    }

    // ---------- meshes for the cells ----------
    const propMat = new T.MeshLambertMaterial({ vertexColors: true }), bigMat = propMat, wireMat = new T.LineBasicMaterial({ color: lin(0x26221e) });
    const KINDS = { road: [K.roadMat, 4000, false, true], lot: [lotMat, 1500, false, true], mark: [K.markMat, 700, false, true], solid: [propMat, 900, true, false], big: [bigMat, 3500, true, true], bldg: [shellMat, 2600, true, true], fence: [fenceMat, 650, false, false], tower: [towerMat, 3000, true, false], sign: [signMat, 900, false, false], water: [waterMat, 4000, false, false], rail: [railMat, 2000, false, true] };
    const cells = [];
    for (const R of CS) for (const c of R.cells) {
      if (!c) continue; c.x1 = c.x0 + CELL; c.z1 = c.z0 + CELL; c.list = [];
      for (const kd in c.b) { const b = c.b[kd]; if (!b.idx.length) continue; const [mat, r, cast, recv] = KINDS[kd], m = new T.Mesh(bufGeo(b), mat); m.name = 'rt:' + kd; m.castShadow = cast; m.receiveShadow = recv; m.visible = false; scene.add(m); c.list.push([m, r]); }
      const w = wire.get(c); if (w && w.length) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(w), 3)); const m = new T.LineSegments(g, wireMat); m.name = 'rt:wire'; m.visible = false; scene.add(m); c.list.push([m, 700]); }
      c.b = null; cells.push(c);
    }

    // ---------- minimap layers at the town map's scale ----------
    const mk = W.mapScale, mf = game && game.isTouch ? 0.5 : 1, CC = { 10: [168, 104, 48], 30: [150, 158, 92], 40: [198, 172, 104], 50: [160, 160, 110], 60: [170, 160, 140], 80: [96, 140, 160], 90: [130, 150, 100] };
    const RW = { primary: 7, secondary: 6, tertiary: 5, residential: 3.6, unclassified: 3.6, service: 2, unknown: 2, track: 1.6 };
    const buildMaps = () => { for (const R of CS) {
      const ks = mk * mf, cw = Math.ceil((R.X1 - R.X0) * ks), chh = Math.ceil((R.Z1 - R.Z0) * ks), cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
      const g = cv.getContext('2d'), cc = document.createElement('canvas'); cc.width = R.nx; cc.height = R.nz; const cg = cc.getContext('2d'), id = cg.createImageData(R.nx, R.nz);
      for (let q = 0; q < R.nx * R.nz; q++) { const cl = R.cov[q]; if (!cl) continue; const col = CC[cl] || CC[30], nn = 0.92 + hash2(q, 7) * 0.16; id.data[4 * q] = col[0] * nn; id.data[4 * q + 1] = col[1] * nn; id.data[4 * q + 2] = col[2] * nn; id.data[4 * q + 3] = 255; }
      cg.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(cc, 0, 0, cw, chh);
      const path = (p) => { g.beginPath(); for (let k = 0; k < p.length; k += 2) g[k ? 'lineTo' : 'moveTo']((p[k] - R.X0) * ks, (-p[k + 1] - R.Z0) * ks); };
      g.fillStyle = '#5f8ea3'; for (const w of R.c.water) { path(w.p); g.closePath(); g.fill(); }
      g.fillStyle = '#5b4a40'; for (const b of R.c.buildings) if (!b.drop) { path(b.p); g.closePath(); g.fill(); }
      g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#2a2420'; for (const r of R.c.roads) { g.lineWidth = (RW[r.c] + 2) * mf; path(r.p); g.stroke(); }
      for (const r of R.c.roads) { g.strokeStyle = r.c === 'primary' ? '#f2c230' : r.c === 'secondary' ? '#f0d890' : r.g ? '#cdbfa0' : '#f6ead3'; g.lineWidth = RW[r.c] * mf; path(r.p); g.stroke(); }
      g.strokeStyle = '#1b1a1c'; g.lineWidth = 2 * mf; g.setLineDash([6 * mf, 5 * mf]); for (const p of R.c.rails) { path(p); g.stroke(); } g.setLineDash([]);
      R.map = { cv, ox: (R.X0 + HALF) * mk, oy: (R.Z0 + HALF) * mk, w: cw / mf, h: chh / mf, f: mf };
    } };
    let mapsDue = true;      // ponytail: drawn on the first frame after loading (about 0.1 s of canvas work off the load time), not in idle slices
    if (game && game.on) game.on('frame', () => { if (mapsDue) { mapsDue = false; buildMaps(); } }); else buildMaps();

    // ---------- level of detail and draw distances, every 0.3 s ----------
    // deep in town (over NEAR m from both mouths) the strips are hidden and the horizon ring and edge woods are the town's own: town views cost what they did
    const NEAR = 1000, NEARB = 600, mouths = CS.filter((R) => !R.area).map((R) => [R.route.X[0], R.route.Z[0]]);      // the band, seen across the town's south side: from 600 m
    const hideAll = () => { for (const ch of chunks) for (const m of ch.lods) if (m) m.visible = false; for (const c of treeCells) for (const m of [c.near, c.far, c.fir]) if (m) m.visible = false; for (const c of cells) for (const [m] of c.list) m.visible = false; for (const o of outer) if (o.m) o.m.visible = false; };
    let lodT = 0, mode = false, lx = 1e9, lz = 1e9;
    W.animated.push((t, dt, cam) => {
      const cx = cam.position.x, cz = cam.position.z;
      const moved = Math.abs(cx - lx) + Math.abs(cz - lz); if ((lodT -= dt) > 0 && moved < 40) return; lodT = 0.3; lx = cx; lz = cz;      // every 0.3 s, or at once after a jump
      const out = !inSq(cx, cz), near = out || mouths.some((m) => Math.hypot(cx - m[0], cz - m[1]) < NEAR) || (!!AR && cz > AR.area.z0 - NEARB);
      const jump = moved > 150;      // a teleport (reset, race start, tests): build everything wanted now
      if (near !== mode) { mode = near; W.farMesh.geometry = near ? ring1 : ring0; edgeWoods(near); if (!near) hideAll(); }
      if (!near) return;
      const cap = out ? 1e9 : 2300, q = game && game.settings ? game.settings.quality : 1;
      const dist = (o) => Math.hypot(cx - clamp(cx, o.x0, o.x1), cz - clamp(cz, o.z0, o.z1));
      const want = (d) => d > Math.min(cap, 9500) ? -1 : d < 170 ? 0 : d < 600 ? 1 : d < 1400 ? 2 : d < 3000 ? 3 : 4;
      const todo = [], far = [];      // meshes are built when first wanted, nearest first: three a pass, all of them after a jump; the far terrain all at once on leaving town
      for (const ch of chunks) { const d = dist(ch), l = want(d); if (l >= 0 && ch.lods[l] === undefined) todo.push([d, ch, l]); }
      todo.sort((a, b) => a[0] - b[0]); for (let n = 0; n < todo.length && (n < 3 || jump); n++) { const [, ch, l] = todo[n]; ch.lods[l] = chunkMesh(ch, l); }
      for (const o of outer) if (!o.m) far.push([dist(o), o]); far.sort((a, b) => a[0] - b[0]); for (let n = 0; n < far.length && (n < 1 || out); n++) buildOuter(far[n][1]);
      for (const ch of chunks) {
        const d = dist(ch), l = want(d); let v = l; while (v >= 0 && v < 5 && !ch.lods[v]) v++; if (v === 5) { v = l; while (v > 0 && !ch.lods[v]) v--; }
        if (ch.lods[0] && d > 420) { scene.remove(ch.lods[0]); ch.lods[0].geometry.dispose(); ch.lods[0] = undefined; }
        if (ch.lods[1] && d > 1100) { scene.remove(ch.lods[1]); ch.lods[1].geometry.dispose(); ch.lods[1] = undefined; }
        for (let k = 0; k < 5; k++) if (ch.lods[k]) ch.lods[k].visible = l >= 0 && k === v;
      }
      const nearR = [45, 75, 105][q] || 75, farK = [[1, 0.45, 0.25, 0.12], [1, 0.8, 0.5, 0.3], [1, 1, 0.6, 0.38]][q] || [1, 0.8, 0.5, 0.3], tmax = out ? 2200 : 1300;
      for (const c of treeCells) {
        const d = dist(c), near = d < nearR, on = d < tmax;
        if (c.near) c.near.visible = on && near; if (c.far) { c.far.visible = on && !near; c.far.count = Math.ceil(c.n * farK[d < 250 ? 0 : d < 700 ? 1 : d < 1400 ? 2 : 3]); } if (c.fir) c.fir.visible = on && d < 1600;
      }
      for (const c of cells) { const d = dist(c); for (const [m, r] of c.list) m.visible = d < Math.min(r, cap); }
      for (const o of outer) if (o.m) o.m.visible = out && dist(o) < 11000;
    });

    // ---------- the world's lookups, answering inside the corridors too ----------
    W.corridors = CS;
    W.heightXZ = (X, Z) => {      // the roads' smooth profiles over the strips' ground (roads pressed into it), the decks, and the blend over the town's last 8 m: continuous everywhere a car can go
      const si = depthIn(X, Z); if (si >= 8) return town.h(X, Z);
      if (si > 0) { const e = edgeH(X, Z, si); return e === e ? e : town.h(X, Z); }
      const R = stripOf(X, Z); if (R) { const g = stripH(R, X, Z), r = roadLvl(R, X, Z); if (rW > 0) return g === g ? g + (r - g) * rW : r; if (g === g) return g; }
      return Math.max(Math.abs(X), Math.abs(Z)) < HALF + 60 ? town.h(X, Z) : farAt(X, Z);
    };
    W.maskAt = (X, Z) => { if (inSq(X, Z)) return town.mask(X, Z); const R = stripOf(X, Z); return R ? maskOf(R, X, Z) : 0; };
    W.surface = (X, Z) => { const m = W.maskAt(X, Z); return m === 4 ? 0 : m === 5 ? 1 : m; };
    W.inBuilding = (X, Z) => W.maskAt(X, Z) === 4;
    W.nearestRoad = (X, Z, maxD) => {
      const md = maxD || 200, a = X > -HALF - md && X < HALF + md && Z > -HALF - md && Z < HALF + md ? town.road(X, Z, maxD) : null;
      if (X > -HALF + md && X < HALF - md && Z > -HALF + md && Z < HALF - md) return a;
      const b = corrRoad(X, Z, md, true); if (b) { delete b.s; delete b.k; delete b.R; }
      return !a ? b : !b ? a : a.d <= b.d ? a : b;
    };
    let icX = 1e9, icZ = 1e9, icV = false;      // game.js asks every physics step near the map edge: answer again only after 2 m
    W.inCorridor = (X, Z) => { if (Math.abs(X - icX) + Math.abs(Z - icZ) < 2) return icV; icX = X; icZ = Z; const R = stripOf(X, Z); return (icV = inArea(X, Z) || (!!R && !R.area && routeDist(R, X, Z, D + 3) <= D + 2)); };
    W.drawMap = (g, px, py, span) => {
      for (const R of CS) { const m = R.map; if (!m) continue; const x0 = Math.max(px - span, m.ox), y0 = Math.max(py - span, m.oy), x1 = Math.min(px + span, m.ox + m.w), y1 = Math.min(py + span, m.oy + m.h); if (x1 > x0 && y1 > y0) g.drawImage(m.cv, (x0 - m.ox) * m.f, (y0 - m.oy) * m.f, (x1 - x0) * m.f, (y1 - y0) * m.f, x0, y0, x1 - x0, y1 - y0); }
    };
    const bc = W.buildCollision;
    W.buildCollision = function () {
      bc.call(W); const c0 = W.collide;
      W.collide = (X, Z, r) => {
        if (depthIn(X, Z) > 65) return c0(X, Z, r);      // the fence runs 60 m into town at the mouths
        const a = X > -HALF - 20 && X < HALF + 20 && Z > -HALF - 20 && Z < HALF + 20 ? c0(X, Z, r) : null, R = stripOf(X, Z) || (AR && Z > PLAY - 64 && Math.abs(X) > PLAY - 4 ? AR : null), b = R ? R.collide(X, Z, r) : null;   // the band's strip walls stand in town
        return !a ? b : !b ? a : a.depth >= b.depth ? a : b;
      };
    };
    if (game && game.markers) for (const R of CS) if (!R.area) game.markers.push({ x: R.c.dest.x, y: R.c.dest.y, c: '#c8202b', r: 7 });
  };
})();
