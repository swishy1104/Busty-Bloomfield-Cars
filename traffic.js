/* Bloomfield Drift — ambient traffic (BD.buildTraffic({ scene, W, M, game })).
   Ordinary drivers on the real street network while the player drifts around them:
   - road graph from W.roads: drivable classes only (primary .. unclassified, no gravel), sharp mapped vertices rounded; a junction wherever samples of two
     roads come within 6 m; right-hand lanes min(hw / 2, 2.1) m off the centreline (clear of the kerb-side parked cars),
     pushed out of walls and obstacles with W.collide
   - speed by context (town 12, highway 20-24, residential 9-11 m/s), slower into bends (2 m/s2 lateral) and on steep
     grades; IDM car-following that brakes for anything in the lane, the player included; quadratic-Bezier turns
   - junctions: the lower class stops and waits until the junction is clear of traffic and of the player; equal classes in
     town and the two signals (M.signals) are all-way stops, first come first served; left turns off a through road yield;
     turn signals flash from 35 m out. A queue behind the parked player goes round it once the oncoming lane is free.
   - 0 / 8 / 14 vehicles (game.settings.traffic 'off' | 'light' | 'normal', re-read every 2 s), spawned 160-450 m from the
     player and never in view inside 250 m (heading inwards near the map edge); despawned beyond 550 m, when stuck once out of
     view, or at a dead end / the map edge (U-turn by despawning: once unseen or after 8 s stopped there)
   - two circles per vehicle (r 0.95) in W.dynamic, kept clear of walls and obstacles with W.collide; hit() shoves the vehicle, stops it and flashes its hazards
   Draws 3 body InstancedMeshes (sedan, pickup, SUV, 170-172 triangles each, cast shadows) + 1 lamp InstancedMesh (8 triangles
   per vehicle: head, tail, brake and flasher lamps) = 4 calls, under 2,600 triangles for 14 vehicles.
   Public: W.traffic = { cars (fixed pool: on, x, z, v, hx, hz, t ...), junctions, ms (last update, milliseconds) }.
   Reads game.settings.traffic; makes no DOM, emits no events. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});

  B.buildTraffic = function ({ scene, W, M, game }) {
    const U = B.util, lin = U.lin, clamp = U.clamp, rng = U.mulberry(7311);
    const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2 }, COUNT = { off: 0, light: 8, normal: 14 };
    const LIM = W.PLAY - 60, CAP = 160, LOOK = 110, MAXN = 14;
    const HL = [2.38, 2.73, 2.43], AX = [1.4, 1.72, 1.45], CO = [1.4, 1.75, 1.45];   // per body: half length, axle and circle offsets

    // ---------- drivable roads: arc length, right-hand normals, speed caps ----------
    const R = [];
    for (const s of W.roads) {
      if (!RANK[s.cls] || s.gravel || s.hw < 2 || s.X.length < 8) continue;
      const n = s.X.length; let X = s.X, Z = s.Z;
      for (let it = 0; it < 3; it++) {   // round the sharp vertices of the mapped centreline: a body on two axle points crabs round a kink
        const x2 = Float32Array.from(X), z2 = Float32Array.from(Z);
        for (let k = 1; k < n - 1; k++) { x2[k] = (X[k - 1] + 2 * X[k] + X[k + 1]) / 4; z2[k] = (Z[k - 1] + 2 * Z[k] + Z[k + 1]) / 4; }
        X = x2; Z = z2;
      }
      const S = new Float32Array(n), NX = new Float32Array(n), NZ = new Float32Array(n), V = new Float32Array(n), Y = new Float32Array(n), rank = RANK[s.cls];
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, k - 1), c = Math.min(n - 1, k + 1), tx = X[c] - X[a], tz = Z[c] - Z[a], il = 1 / (Math.hypot(tx, tz) || 1);
        NX[k] = -tz * il; NZ[k] = tx * il; Y[k] = s.H[k] + s.lift; if (k) S[k] = S[k - 1] + Math.hypot(X[k] - X[k - 1], Z[k] - Z[k - 1]);
      }
      for (let k = 0; k < n; k++) {   // context speed x grade factor, capped by 2 m/s2 lateral through the bend measured over +-5 samples
        const a = Math.max(0, k - 5), c = Math.min(n - 1, k + 5), span = S[c] - S[a] || 1, ux = X[k] - X[a], uz = Z[k] - Z[a], wx = X[c] - X[k], wz = Z[c] - Z[k], lu = Math.hypot(ux, uz), lw = Math.hypot(wx, wz);
        const ang = lu > 0.1 && lw > 0.1 ? Math.acos(clamp((ux * wx + uz * wz) / (lu * lw), -1, 1)) : 0;
        const base = s.cls === 'residential' ? 10 : Math.hypot(X[k], Z[k]) < 700 ? 12 : rank >= 4 ? 22 : 16;
        V[k] = Math.min(base * clamp(1.24 - 4 * Math.abs(Y[c] - Y[a]) / span, 0.6, 1), Math.max(4, Math.sqrt(span / Math.max(ang, 1e-3))));
      }
      R.push({ n, X, Z, S, NX, NZ, V, Y, hw: s.hw, off: Math.min(s.hw / 2, 2.1), rank, nodes: [] });
    }

    // ---------- junctions: clusters of samples lying within 6 m of another drivable road ----------
    const GC = 8, grid = new Map(), gkey = (X, Z) => Math.floor(X / GC) * 8192 + Math.floor(Z / GC), cl = [];
    R.forEach((o, ri) => { for (let k = 0; k < o.n; k++) { const key = gkey(o.X[k], o.Z[k]); (grid.get(key) || grid.set(key, []).get(key)).push(ri, k); } });
    R.forEach((o, ri) => {
      for (let k = 0; k < o.n; k++) {
        const X = o.X[k], Z = o.Z[k]; let touch = false;
        for (let i = -1; i <= 1 && !touch; i++) for (let j = -1; j <= 1 && !touch; j++) {
          const a = grid.get(gkey(X + i * GC, Z + j * GC)); if (!a) continue;
          for (let q = 0; q < a.length && !touch; q += 2) {
            const p = R[a[q]], kj = a[q + 1];
            if (p === o || (p.X[kj] - X) ** 2 + (p.Z[kj] - Z) ** 2 > 36 || Math.abs(p.Y[kj] - o.Y[k]) > 2.5) continue;    // bridges are not junctions
            touch = !(Math.abs(o.NX[k] * p.NX[kj] + o.NZ[k] * p.NZ[kj]) > 0.9 && k > 1 && k < o.n - 2 && kj > 1 && kj < p.n - 2);   // side by side is not meeting
          }
        }
        if (!touch) continue;
        let c = cl.find((q) => (q.x - X) ** 2 + (q.z - Z) ** 2 < 144); if (!c) cl.push(c = { x: X, z: Z, sx: 0, sz: 0, n: 0, m: [] });
        c.n++; c.sx += X; c.sz += Z; c.x = c.sx / c.n; c.z = c.sz / c.n; c.m.push(ri, k);
      }
    });
    const J = [];
    for (const c of cl) {
      const near = new Map();
      for (let q = 0; q < c.m.length; q += 2) { const ri = c.m[q], k = c.m[q + 1], o = R[ri], d = (o.X[k] - c.x) ** 2 + (o.Z[k] - c.z) ** 2, b = near.get(ri); if (!b || d < b.d) near.set(ri, { k, d }); }
      const j = { id: J.length, x: c.x, z: c.z, arms: [], e: 0, top: 0, signal: false };
      near.forEach((b, ri) => {
        const o = R[ri]; j.e = Math.max(j.e, o.hw);
        for (const dir of [1, -1]) {
          if (b.k + dir * 3 < 0 || b.k + dir * 3 >= o.n) continue;
          const k4 = clamp(b.k + dir * 5, 0, o.n - 1), ax = o.X[k4] - o.X[b.k], az = o.Z[k4] - o.Z[b.k], il = 1 / (Math.hypot(ax, az) || 1);
          j.arms.push({ ri, k: b.k, dir, ax: ax * il, az: az * il, rank: o.rank, dead: false });
        }
      });
      if (j.arms.length < 2) continue;
      j.top = Math.max(...j.arms.map((a) => a.rank));
      // who stops: the lower class; where the top class meets itself, everyone in town (all-way) and outside town the stem of a T
      // ponytail: re-derives streets.js's stop-sign rule instead of reading its signs; export per-arm stop flags from W.streets if they drift apart
      const tops = j.arms.filter((a) => a.rank === j.top), thru = (a) => tops.some((b) => a.ax * b.ax + a.az * b.az < -0.8);
      j.signal = M.signals.some((p) => Math.hypot(p[0] - j.x, -p[1] - j.z) < 16);
      for (const a of j.arms) a.stop = j.arms.length > 2 && (a.rank < j.top || j.signal || (tops.length > 2 && (Math.hypot(j.x, j.z) < 700 || !thru(a) || tops.every(thru))));
      j.e = j.arms.length > 2 ? clamp(j.e + 1.5, 4.5, 10) : 2.5;     // how far before the centre the turn starts (and the stop line is)
      J.push(j); near.forEach((b, ri) => R[ri].nodes.push([b.k, j.id]));
    }
    for (const o of R) o.nodes = Int32Array.from(o.nodes.sort((a, b) => a[0] - b[0]).flat());
    function nextNode(o, k, d) { const a = o.nodes; let best = -1; for (let q = 0; q < a.length; q += 2) if ((a[q] - k) * d > 0 && (best < 0 || (a[q] - a[best]) * d < 0)) best = q; return best; }
    for (const j of J) for (const a of j.arms) a.dead = nextNode(R[a.ri], a.k, a.dir) < 0;

    // spawn candidates: every 4th sample, clear of junction boxes, main roads listed more than once
    const cand = [];
    R.forEach((o, ri) => {
      for (let k = 3; k < o.n - 4; k += 4) {
        if (Math.abs(o.X[k]) > LIM - 30 || Math.abs(o.Z[k]) > LIM - 30) continue;
        let ok = true; for (let q = 0; q < o.nodes.length; q += 2) if (Math.abs(o.S[o.nodes[q]] - o.S[k]) < J[o.nodes[q + 1]].e + 10) ok = false;
        if (ok) for (let r = o.rank >= 4 ? 3 : o.rank === 3 ? 2 : 1; r > 0; r--) cand.push(ri, k);   // main roads carry more traffic
      }
    });
    const near = new Int32Array(cand.length / 2 + 1); let nearN = 0;

    // ---------- vehicles: fixed pool, each with a plan (a polyline ahead of it) and its junction events ----------
    const P = [0, 0];
    function nudge(X, Z) {   // push a path point out of walls and obstacles (W.collide exists once the game has built collision)
      for (let q = 0; q < 3 && W.collide; q++) { const h = W.collide(X, Z, 1.1); if (!h) break; X += h.nx * (h.depth + 0.05); Z += h.nz * (h.depth + 0.05); }
      P[0] = X; P[1] = Z;
    }
    const lane = (o, k, d) => nudge(o.X[k] + o.NX[k] * o.off * d, o.Z[k] + o.NZ[k] * o.off * d);
    const PAL = [0xf2f2ee, 0xf2f2ee, 0xe6e4dc, 0xb9bcc2, 0xb9bcc2, 0x8d9096, 0x6b6e73, 0x1b1c1e, 0x1b1c1e, 0xa3201d, 0x24457a, 0x2f4a36, 0xb8a888, 0x5e1c22, 0x7fa3c0, 0x3a3f47].map(lin);
    const cars = [];
    for (let i = 0; i < MAXN; i++) {
      const c = { i, on: false, t: 0, col: new T.Color(), f: 1, PX: new Float32Array(CAP), PZ: new Float32Array(CAP), PS: new Float32Array(CAP), PV: new Float32Array(CAP), PY: new Float32Array(CAP), n: 0, ci: 0,
        gr: 0, gk: 0, gd: 1, end: false, edge: false, s: 0, v: 0, br: false, x: 1e6, z: 1e6, yf: 0, yr: 0, hx: 1, hz: 0,
        EJ: new Int32Array(8), EA: new Int32Array(8), ES: new Float32Array(8), EX: new Float32Array(8), EF: new Uint8Array(8), ne: 0, go: false, arr: 0,
        hold: 0, haz: 0, ox: 0, oz: 0, stuck: 0, wp: 0, pa: 0, hits: 0, d0: { x: 1e6, z: 1e6, r: 0.95, vx: 0, vz: 0, hit: null }, d1: { x: 1e6, z: 1e6, r: 0.95, vx: 0, vz: 0, hit: null } };
      c.arrs = [c.PX, c.PZ, c.PS, c.PV, c.PY]; c.evs = [c.EJ, c.EA, c.ES, c.EX, c.EF];
      c.d0.hit = c.d1.hit = (sp, nx, nz) => {    // shoved a little, stops, hazards on
        const k = Math.min(0.3, sp * 0.05); c.ox += nx * k; c.oz += nz * k; const m = Math.hypot(c.ox, c.oz); if (m > 1) { c.ox /= m; c.oz /= m; }
        c.v = Math.max(0, c.v + sp * (nx * c.hx + nz * c.hz)); c.hold = 2.5; c.haz = 5; c.hits++;      // sp = this car's change in speed from game.js's impulse
      };
      W.dynamic.push(c.d0, c.d1); cars.push(c);
    }
    function add(c, X, Z, v, y) {
      const n = c.n; if (n && Math.abs(X - c.PX[n - 1]) + Math.abs(Z - c.PZ[n - 1]) < 0.2) return;
      c.PX[n] = X; c.PZ[n] = Z; c.PS[n] = n ? c.PS[n - 1] + Math.hypot(X - c.PX[n - 1], Z - c.PZ[n - 1]) : 0; c.PV[n] = v; c.PY[n] = y; c.n = n + 1;
    }
    function shift(c) { const sh = c.ci - 2; if (sh < 8) return false; for (const A of c.arrs) A.copyWithin(0, sh, c.n); c.n -= sh; c.ci -= sh; return true; }
    function extend(c) {    // grow the plan along the lane, turning at junctions, until it reaches LOOK metres ahead
      while (!c.end && c.PS[c.n - 1] < c.s + LOOK && (c.n < CAP - 26 || shift(c))   /* a turn adds up to 25 points */) {
        const o = R[c.gr], k = c.gk + c.gd;
        if (k < 0 || k >= o.n) { c.end = true; break; }
        const q = nextNode(o, c.gk, c.gd);
        if (q >= 0 && Math.abs(o.S[o.nodes[q]] - o.S[k]) < J[o.nodes[q + 1]].e) { junction(c, J[o.nodes[q + 1]]); continue; }
        lane(o, k, c.gd); if (Math.abs(P[0]) > LIM || Math.abs(P[1]) > LIM) { c.end = c.edge = true; break; }
        add(c, P[0], P[1], o.V[k], o.Y[k]); c.gk = k;
      }
    }
    const WT = new Float32Array(32);
    function junction(c, j) {
      const o = R[c.gr], d = c.gd, n = c.n, A = j.arms, X0 = c.PX[n - 1], Z0 = c.PZ[n - 1];
      let ix = X0 - c.PX[Math.max(0, n - 2)], iz = Z0 - c.PZ[Math.max(0, n - 2)]; const il = 1 / (Math.hypot(ix, iz) || 1); ix *= il; iz *= il;
      if (n < 2) { ix = o.NZ[c.gk] * d; iz = -o.NX[c.gk] * d; }
      let tot = 0, back = -1, q = 0;
      for (q = 0; q < A.length && q < 32; q++) {   // prefer straight on; turns less; never back the way we came; dead ends rarely
        const a = A[q], dot = a.ax * ix + a.az * iz; let w = 0;
        if (a.ri === c.gr && a.dir === -d) back = q;
        else if (dot > -0.8) w = (dot > 0.7 ? 4 : 1.2) * (a.dead ? 0.05 : 1) * (a.rank >= 4 ? 2.5 : a.rank === 3 ? 1.6 : 1);
        WT[q] = w; tot += w;
      }
      if (!tot) { c.end = true; return; }
      let r = rng() * tot; for (q = 0; q < A.length; q++) { if (!WT[q]) continue; r -= WT[q]; if (r <= 0) break; }
      if (q >= A.length) { q = A.length - 1; while (!WT[q]) q--; }
      const a = A[q], p = R[a.ri]; let ke = a.k;
      while (Math.abs(p.S[ke] - p.S[a.k]) < j.e && ke + a.dir >= 0 && ke + a.dir < p.n) ke += a.dir;
      if (ke === a.k) { c.end = true; return; }
      lane(p, ke, a.dir); const X2 = P[0], Z2 = P[1], ox = p.NZ[ke] * a.dir, oz = -p.NX[ke] * a.dir, cr = ix * oz - iz * ox, dx = X2 - X0, dz = Z2 - Z0;
      let CX = (X0 + X2) / 2, CZ = (Z0 + Z2) / 2;       // control point where the two lane lines cross
      if (Math.abs(cr) > 0.15) { const t = (dx * oz - dz * ox) / cr, u = (dz * ix - dx * iz) / cr; if (t > 0.3 && u > 0.3 && t < 20 && u < 20) { CX = X0 + ix * t; CZ = Z0 + iz * t; } }
      const len = Math.hypot(CX - X0, CZ - Z0) + Math.hypot(X2 - CX, Z2 - CZ), nb = clamp(Math.round(len / 0.8), 4, 24), ang = Math.acos(clamp(ix * ox + iz * oz, -1, 1));
      const vb = Math.min(c.PV[n - 1], p.V[ke], Math.max(3, Math.sqrt(1.2 * len / Math.max(ang, 1e-3)))), Y0 = c.PY[n - 1], sIn = c.PS[n - 1];
      for (let i = 1; i <= nb; i++) {
        const t = i / nb, a0 = (1 - t) * (1 - t), a1 = 2 * t * (1 - t), a2 = t * t;
        if (i < nb) nudge(a0 * X0 + a1 * CX + a2 * X2, a0 * Z0 + a1 * CZ + a2 * Z2); else { P[0] = X2; P[1] = Z2; }
        add(c, P[0], P[1], vb, Y0 + (p.Y[ke] - Y0) * t);
      }
      if (A.length > 2 && c.ne < 8) { const e = c.ne++; c.EJ[e] = j.id; c.EA[e] = back; c.ES[e] = sIn; c.EX[e] = c.PS[c.n - 1]; c.EF[e] = (back >= 0 ? A[back].stop : o.rank < j.top) | (cr < -0.3 ? 2 : cr > 0.3 ? 4 : 0); }
      c.gr = a.ri; c.gk = ke; c.gd = a.dir;
    }

    // ---------- per-frame state ----------
    let time = 0, N = 8, setT = 0, nearT = 0, spawnT = 0, px = 0, pz = 0, pvx = 0, pvz = 0, pv = 0, prr = 0.9, camX = 0, camZ = 0, cfx = 1, cfz = 0, cosV = 0.5, dt = 0;
    const PC = [0, 0, 0, 0], F = [0, 0, 0];
    const seen = (x, z) => { const dx = x - camX, dz = z - camZ, d = Math.hypot(dx, dz); return d < 250 && (d < 10 || dx * cfx + dz * cfz > cosV * d); };
    function idm(v, v0, g, lv, s0) { const ss = s0 + Math.max(0, v * 1.3 + v * (v - lv) / 3.5); return 1.5 * (1 - (v / v0) ** 4 - (ss / Math.max(g, 0.1)) ** 2); }
    function inLane(c, sF, ax, az, bx, bz, th) {   // gap from our front bumper to the first plan point that either circle covers
      const t2 = th * th;
      for (let i = c.ci; i < c.n; i++) {
        const g = c.PS[i] - sF; if (g < -1.5) continue; if (g > 60) break;
        const X = c.PX[i], Z = c.PZ[i]; if ((X - ax) ** 2 + (Z - az) ** 2 < t2 || (X - bx) ** 2 + (Z - bz) ** 2 < t2) return Math.max(0, g - 0.5);
      }
      return 1e9;
    }
    function clear(c, jid) {   // nobody in the junction, nobody coming through it, nobody who stopped first; the player not near it
      const ea = c.EA[0], j = J[jid];
      for (let i = 0; i < MAXN; i++) {
        const u = cars[i]; if (!u.on || u === c) continue;
        for (let e = 0; e < u.ne; e++) {
          if (u.EJ[e] !== jid) continue;
          const uh = HL[u.t], uF = u.s + uh; if (uF > u.ES[e] && u.s - uh < u.EX[e]) return false;
          const d = u.ES[e] - uF;
          if (u.EA[e] !== ea && d > 0 && d < Math.max(25, u.v * 3)) {
            const go = e === 0 && u.go;
            if ((go || !(u.EF[e] & 1)) && u.v > 1) return false;
            if (e === 0 && u.arr && !go && c.arr && (u.arr < c.arr || (u.arr === c.arr && u.i < c.i))) return false;
          }
          break;
        }
      }
      const dx = j.x - px, dz = j.z - pz, d = Math.hypot(dx, dz);
      return d > j.e + 5 && !(d < 30 && pv > 1.5 && pvx * dx + pvz * dz > 0.5 * pv * d);
    }
    function at(c, s) {
      let i = c.ci; while (i < c.n - 2 && c.PS[i + 1] < s) i++; while (i > 0 && c.PS[i] > s) i--;
      const L = c.PS[i + 1] - c.PS[i], t = L > 1e-4 ? clamp((s - c.PS[i]) / L, 0, 1) : 0;
      F[0] = c.PX[i] + (c.PX[i + 1] - c.PX[i]) * t; F[1] = c.PZ[i] + (c.PZ[i + 1] - c.PZ[i]) * t; F[2] = c.PY[i] + (c.PY[i + 1] - c.PY[i]) * t;
    }
    function pose(c) {
      const a = AX[c.t]; at(c, c.s + a); const fx = F[0], fz = F[1], fy = F[2]; at(c, c.s - a);
      const hx = fx - F[0], hz = fz - F[1], l = Math.hypot(hx, hz); if (l > 0.3) { c.hx = hx / l; c.hz = hz / l; }
      if (c.hold <= 0 && c.v > 0.5) { const k = Math.max(0, 1 - 0.8 * dt); c.ox *= k; c.oz *= k; }
      const mx = (fx + F[0]) / 2, mz = (fz + F[1]) / 2, co = CO[c.t];
      for (let q = 0; q < 4 && W.collide; q++) {   // both body circles clear of walls, posts and parked cars (a plan chord can clip a corner)
        const sg = q & 1 ? -co : co, h = W.collide(mx + c.ox + c.hx * sg, mz + c.oz + c.hz * sg, 0.97);
        if (h) { c.ox += h.nx * h.depth; c.oz += h.nz * h.depth; } else if (q) break;
      }
      c.x = mx + c.ox; c.z = mz + c.oz;
      c.yf = Math.max(W.heightXZ(fx + c.ox, fz + c.oz), fy); c.yr = Math.max(W.heightXZ(F[0] + c.ox, F[1] + c.oz), F[2]);
      c.d0.x = c.x + c.hx * co; c.d0.z = c.z + c.hz * co; c.d1.x = c.x - c.hx * co; c.d1.z = c.z - c.hz * co;
      c.d0.vx = c.d1.vx = c.v * c.hx; c.d0.vz = c.d1.vz = c.v * c.hz;
    }
    function kill(c) { c.on = false; c.x = c.z = c.d0.x = c.d0.z = c.d1.x = c.d1.z = 1e6; c.d0.vx = c.d0.vz = c.d1.vx = c.d1.vz = 0; }

    function step(c) {
      extend(c);
      const hl = HL[c.t], sF = c.s + hl;
      while (c.ne && c.EX[0] < c.s - hl) { for (const A of c.evs) A.copyWithin(0, 1, c.ne); c.ne--; c.go = false; c.arr = 0; }
      let v0 = 40;     // free-road speed: the slowest cap ahead that we can still slow to at 1.6 m/s2
      for (let i = c.ci; i < c.n; i++) { const ds = c.PS[i] - c.s; if (ds > 120) break; if (ds < -hl) continue; const vl = c.PV[i] * c.f, vv = vl * vl + 3.2 * Math.max(0, ds); if (vv < v0 * v0) v0 = Math.sqrt(vv); }
      let acc = 1.5 * (1 - (c.v / v0) ** 4), gmin = c.PS[c.n - 1] - sF;
      for (let i = 0; i < MAXN; i++) {   // anything in our lane: other vehicles, the player
        const u = cars[i]; if (!u.on || u === c || Math.abs(u.x - c.x) > 70 || Math.abs(u.z - c.z) > 70) continue;
        const g = inLane(c, sF, u.d0.x, u.d0.z, u.d1.x, u.d1.z, 2.1); if (g < 1e9) { acc = Math.min(acc, idm(c.v, v0, g, u.v * (u.hx * c.hx + u.hz * c.hz), 2.5)); gmin = Math.min(gmin, g); }
      }
      if (Math.abs(px - c.x) < 70 && Math.abs(pz - c.z) < 70) {
        const g = inLane(c, sF, PC[0], PC[1], PC[2], PC[3], prr + 1.15);
        if (g < 1e9) { acc = Math.min(acc, idm(c.v, v0, g, pvx * c.hx + pvz * c.hz, 4)); gmin = Math.min(gmin, g); }
        c.wp = g < 12 && pv < 0.5 && c.v < 0.5 ? c.wp + dt : 0;      // stuck behind the parked player: go round after 3 s
        if (c.wp > 3) { c.wp = 0; pass(c, sF); }
      }
      if (c.ne && !c.go && (c.EF[0] & 3) && sF < c.ES[0] + 2) {    // stop line (bit 1) or a left turn that yields (bit 2)
        const dS = c.ES[0] - sF;
        if (c.EF[0] & 1) { if (dS < 3 && c.v < 0.3) { if (!c.arr) c.arr = time; if (time - c.arr > 1 && (clear(c, c.EJ[0]) || time - c.arr > 12)) c.go = true; } }
        else if (dS < 18) { if (!c.arr && c.v < 0.3) c.arr = time; if (clear(c, c.EJ[0]) || (c.arr && time - c.arr > 12)) c.go = true; }
        if (!c.go) { const g = Math.max(0, dS) + 0.2; acc = Math.min(acc, idm(c.v, v0, g, 0, 0.3)); gmin = Math.min(gmin, g); }
      }
      if (c.end) acc = Math.min(acc, idm(c.v, v0, c.PS[c.n - 1] - sF, 0, 0.5));
      if (c.hold > 0) { c.hold -= dt; c.v = Math.max(0, c.v - 6 * dt); } else c.v = clamp(c.v + clamp(acc, -8, 1.5) * dt, 0, 30);      // shoved, then brakes to a stop with hazards on
      let ds = c.v * dt; if (ds > gmin - 0.3) { ds = Math.max(0, gmin - 0.3); c.v = ds / dt; }
      c.br = acc < -0.6 || c.v < 0.4; c.s += ds; if (c.haz > 0) c.haz -= dt;
      while (c.ci < c.n - 2 && c.PS[c.ci + 1] < c.s - hl - 1) c.ci++;
      pose(c);
      c.stuck = c.v < 0.3 ? c.stuck + dt : 0;
      // dead end or map edge = U-turn by despawning: at the end once unseen, or after 8 s stopped there in view; nearing the edge
      // already once 120 m from the camera (an ended vehicle that waits in view would block its lane for good)
      const atEnd = c.end && sF > c.PS[c.n - 1] - 2.5;
      if ((c.x - px) ** 2 + (c.z - pz) ** 2 > 550 * 550 || (atEnd || c.stuck > 25) && !seen(c.x, c.z) || atEnd && c.stuck > 8 ||
        c.edge && sF > c.PS[c.n - 1] - 40 && (c.x - camX) ** 2 + (c.z - camZ) ** 2 > 14400) kill(c);
    }
    const ss = (a, b, x) => U.sstep((x - a) / (b - a));
    // ponytail: only the parked player is overtaken (a stalled or slow vehicle is queued behind, then despawned once unseen); generalise the leader here if that shows
    function pass(c, sF) {   // shift the plan into the oncoming lane round the parked player, if that lane is free and no junction is near
      if (c.s < c.pa) return;
      for (let i = 0; i < MAXN; i++) { const u = cars[i]; if (u.on && u !== c && u.hx * c.hx + u.hz * c.hz < -0.5 && (u.x - c.x) * c.hx + (u.z - c.z) * c.hz > -10 && (u.x - c.x) ** 2 + (u.z - c.z) ** 2 < 22500) return; }
      const cov = (X, Z, m) => Math.min((X - PC[0]) ** 2 + (Z - PC[1]) ** 2, (X - PC[2]) ** 2 + (Z - PC[3]) ** 2) < (prr + 1.15 + m) ** 2;
      const a0 = c.s + AX[c.t] + 0.5, a1 = a0 + 8; let last = -1, i0 = -1; for (let i = c.ci; i < c.n && c.PS[i] < sF + 30; i++) { if (c.PS[i] > a0 && i0 < 0) i0 = i; if (cov(c.PX[i], c.PZ[i], 0)) last = c.PS[i]; }
      if (last < 0 || i0 < 1) return;
      const rd = W.nearestRoad(c.x, c.z, 12), w = 2 * Math.min((rd ? rd.hw : 3) / 2, 2.1), b0 = last + 6, b1 = b0 + 10;
      if (c.ne && c.ES[0] < b1 + 3) return;     // back in lane before the next junction
      const kf = (s) => Math.min(ss(a0, a1, s), 1 - ss(b0, b1, s)) * w;   // points under the axles do not move
      let i1 = i0, lx = c.PX[i0 - 1], lz = c.PZ[i0 - 1];
      for (; i1 < c.n - 1 && c.PS[i1] < b1; i1++) {   // dry run: the shifted path (vertices and midpoints) must clear the player with room to spare
        const dx = c.PX[i1 + 1] - c.PX[i1 - 1], dz = c.PZ[i1 + 1] - c.PZ[i1 - 1], il = kf(c.PS[i1]) / (Math.hypot(dx, dz) || 1), X = c.PX[i1] + dz * il, Z = c.PZ[i1] - dx * il;
        if (c.PS[i1] > c.s && (cov(X, Z, 0.25) || cov((X + lx) / 2, (Z + lz) / 2, 0.25))) return;
        lx = X; lz = Z;
      }
      if (c.PS[i1] < b1) return;
      let qx = c.PX[i0 - 1], qz = c.PZ[i0 - 1];
      for (let i = i0; i < i1; i++) {
        const dx = c.PX[i + 1] - qx, dz = c.PZ[i + 1] - qz, il = kf(c.PS[i]) / (Math.hypot(dx, dz) || 1);
        qx = c.PX[i]; qz = c.PZ[i]; nudge(qx + dz * il, qz - dx * il); c.PX[i] = P[0]; c.PZ[i] = P[1]; c.PV[i] = Math.min(c.PV[i], 7);
      }
      const old = c.PS[c.n - 1]; for (let i = i0; i < c.n; i++) c.PS[i] = c.PS[i - 1] + Math.hypot(c.PX[i] - c.PX[i - 1], c.PZ[i] - c.PZ[i - 1]);
      for (let e = 0; e < c.ne; e++) { c.ES[e] += c.PS[c.n - 1] - old; c.EX[e] += c.PS[c.n - 1] - old; }
      c.pa = b1 + c.PS[c.n - 1] - old;
    }
    function spawn() {
      let c = null; for (let i = 0; i < MAXN; i++) if (!cars[i].on) { c = cars[i]; break; }
      if (!c || !nearN) return false;
      for (let tr = 0; tr < 12; tr++) {
        const q = near[rng() * nearN | 0], o = R[cand[q]], k = cand[q + 1], X = o.X[k], Z = o.Z[k], d = Math.hypot(X - px, Z - pz);
        if (d < 163 || d > 447 || seen(X, Z)) continue;   // the lane sits ~2 m off the sample
        let free = true; for (let i = 0; i < MAXN; i++) if (cars[i].on && (cars[i].x - X) ** 2 + (cars[i].z - Z) ** 2 < 900) free = false;
        if (!free) continue;
        const dir = Math.max(Math.abs(X), Math.abs(Z)) > LIM - 600 ? (o.NZ[k] * X - o.NX[k] * Z < 0 ? 1 : -1) : rng() < 0.5 ? 1 : -1, u = rng();   // near the map edge head inwards
        c.t = u < 0.5 ? 0 : u < 0.75 ? 2 : 1; c.col.copy(PAL[rng() * PAL.length | 0]); c.f = 0.92 + rng() * 0.16;
        c.gr = cand[q]; c.gd = dir; c.gk = k - 2 * dir; c.n = c.ci = c.ne = 0; c.end = c.edge = c.go = false; c.arr = c.hold = c.haz = c.ox = c.oz = c.stuck = c.wp = c.pa = c.s = 0;
        lane(o, c.gk, dir); add(c, P[0], P[1], o.V[c.gk], o.Y[c.gk]); extend(c);
        if (c.n < 4) continue;
        c.s = c.PS[2]; c.v = Math.min(c.PV[2] * c.f, 14) * 0.85; c.on = true; pose(c); return true;
      }
      return false;
    }

    // ---------- looks: sedan, pickup, SUV (+X forward, ground at y = 0); white vertices take the instance paint ----------
    const WH = new T.Color(1, 1, 1), GL = new T.Color(0.05, 0.065, 0.08), DK = new T.Color(0.05, 0.05, 0.052), TY = new T.Color(0.03, 0.03, 0.03), HUB = new T.Color(0.45, 0.45, 0.46), BED = new T.Color(0.09, 0.09, 0.09);
    function face(b, pts, col, hx, hy, hz, ao) {   // flat polygon (fan), wound to face the hint direction
      const [p0, p1, p2] = pts, ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const il = 1 / (Math.hypot(nx, ny, nz) || 1), flip = nx * hx + ny * hy + nz * hz < 0, sg = flip ? -il : il, o = b.pos.length / 3;
      for (const p of pts) { const g = ao ? 0.55 + 0.45 * clamp((p[1] - ao[0]) / (ao[1] - ao[0]), 0, 1) : 1; b.pos.push(p[0], p[1], p[2]); b.nor.push(nx * sg, ny * sg, nz * sg); b.col.push(col.r * g, col.g * g, col.b * g); }
      for (let k = 1; k + 1 < pts.length; k++) b.idx.push(o, o + (flip ? k + 1 : k), o + (flip ? k : k + 1));
    }
    const ring = (x0, x1, y, w) => [[x0, y, -w], [x1, y, -w], [x1, y, w], [x0, y, w]];
    function box(b, P8, cols, ao) {   // bottom ring + top ring: four sides and the top
      const cx = P8.reduce((t, p) => t + p[0], 0) / 8, cy = P8.reduce((t, p) => t + p[1], 0) / 8;
      [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]].forEach((f, i) => {
        const pts = f.map((q) => P8[q]), m = [0, 1, 2].map((a) => pts.reduce((t, p) => t + p[a], 0) / 4);
        face(b, pts, cols[i], m[0] - cx, m[1] - cy, m[2], ao);
      });
    }
    function wheel(b, x, z, Rw) {
      const S = 10, sd = Math.sign(z), zo = z + sd * 0.12, zi = z - sd * 0.12, pt = (a, zz, r) => [x + Math.cos(a) * r, Rw + Math.sin(a) * r, zz];
      for (let i = 0; i < S; i++) { const a0 = i / S * Math.PI * 2, a1 = (i + 1) / S * Math.PI * 2, am = (a0 + a1) / 2; face(b, [pt(a0, zi, Rw), pt(a1, zi, Rw), pt(a1, zo, Rw), pt(a0, zo, Rw)], TY, Math.cos(am), Math.sin(am), 0); }
      face(b, Array.from({ length: S }, (_, i) => pt(i / S * Math.PI * 2, zo, Rw)), TY, 0, 0, sd);
      face(b, Array.from({ length: 6 }, (_, i) => pt(i / 6 * Math.PI * 2, zo + sd * 0.01, Rw * 0.58)), HUB, 0, 0, sd);
    }
    const LS = [];
    function vehicle(L, y0, y1, cab, top, Rw, axle, bed) {
      const b = U.Buf(), h = L / 2, lo = ring(-h + 0.03, h - 0.03, y0, 0.88).concat(ring(-h + 0.12, h - 0.12, y1, 0.9)); lo[5][1] -= 0.07; lo[6][1] -= 0.07;  // bonnet drops to the front
      box(b, lo, [WH, WH, WH, WH, WH], [y0, y1]);
      box(b, ring(cab[0], cab[1], y1 - 0.01, 0.85).concat(ring(cab[2], cab[3], top, 0.71)), [GL, GL, GL, GL, WH]);
      for (const s of [1, -1]) box(b, ring(s > 0 ? h - 0.08 : -h - 0.03, s > 0 ? h + 0.03 : -h + 0.08, y0 - 0.06, 0.9).concat(ring(s > 0 ? h - 0.08 : -h - 0.03, s > 0 ? h + 0.03 : -h + 0.08, y0 + 0.2, 0.9)), [DK, DK, DK, DK, DK]);
      const ly = y1 - 0.1, fx = h - 0.03 - 0.09 * clamp((ly - y0) / (y1 - 0.07 - y0), 0, 1);   // front face at lamp height
      const gx = h - 0.03 - 0.09 * clamp((y0 + 0.3 - y0) / (y1 - 0.07 - y0), 0, 1) + 0.006;
      face(b, [[gx, y0 + 0.22, -0.42], [gx, y0 + 0.22, 0.42], [gx - 0.03, ly - 0.02, 0.42], [gx - 0.03, ly - 0.02, -0.42]], DK, 1, 0, 0);
      if (bed) face(b, [[-h + 0.16, y1 + 0.006, -0.78], [cab[0] - 0.1, y1 + 0.006, -0.78], [cab[0] - 0.1, y1 + 0.006, 0.78], [-h + 0.16, y1 + 0.006, 0.78]], BED, 0, 1, 0);
      for (const x of [axle, -axle]) for (const z of [0.78, -0.78]) wheel(b, x, z, Rw);   // ponytail: wheels are baked into the body and do not spin; a 4th-per-type wheel InstancedMesh if close-ups need it
      LS.push([fx + 0.02, ly + 0.02, 0.9]);
      return U.bufGeo(b);
    }
    const geos = [vehicle(4.7, 0.3, 0.8, [-1.45, 0.95, -0.95, 0.25], 1.4, 0.32, AX[0]), vehicle(5.4, 0.48, 1.02, [-0.75, 1.25, -0.62, 0.62], 1.82, 0.4, AX[1], true), vehicle(4.8, 0.42, 0.98, [-2.2, 0.95, -2.12, 0.25], 1.74, 0.37, AX[2])];
    const bodyMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 });   // paint and glass pick up scene.environment reflections
    bodyMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', T.ShaderChunk.lights_fragment_maps.replace('iblIrradiance +=', 'iblIrradiance += 0.2 *')); };   // as cars.js: keep the reflections, not the flat fill
    const bodies = geos.map((g) => { const m = new T.InstancedMesh(g, bodyMat, MAXN); m.setColorAt(0, WH); m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; });
    // lamps: unit quads scaled per body (x = half length, y = lamp top, z = half width). Instance colour = (brake level, left
    // flasher, right flasher): head lamps keep their own colour and turn amber while their side flashes; tail lamps are red x max(brake, flasher)
    const lb = U.Buf(), HEAD = new T.Color(1, 0.96, 0.86), TAIL = new T.Color(1, 0.035, 0.025);
    for (const s of [1, -1]) face(lb, [[1, 0.86, s * 0.42], [1, 0.86, s * 0.92], [1, 1, s * 0.92], [1, 1, s * 0.42]], HEAD, 1, 0, 0);
    for (const s of [1, -1]) face(lb, [[-1, 0.8, s * 0.5], [-1, 0.8, s * 0.94], [-1, 1, s * 0.94], [-1, 1, s * 0.5]], TAIL, -1, 0, 0);
    const lampMat = new T.MeshBasicMaterial({ vertexColors: true });
    lampMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', 'vColor = color;\n#ifdef USE_INSTANCING_COLOR\nfloat fl = position.z > 0.0 ? instanceColor.z : instanceColor.y;\nvColor = vColor.g > 0.5 ? mix(vColor, vec3(1.0, 0.45, 0.03), fl) : vColor * max(instanceColor.x, fl);\n#endif'); };
    const lamps = new T.InstancedMesh(U.bufGeo(lb), lampMat, MAXN); lamps.setColorAt(0, WH); lamps.count = 0; lamps.frustumCulled = false; scene.add(lamps);
    const dummy = new T.Object3D(), cnt = [0, 0, 0], LC = new T.Color();
    function draw() {
      cnt[0] = cnt[1] = cnt[2] = 0; let nl = 0;
      for (let i = 0; i < MAXN; i++) {
        const c = cars[i]; if (!c.on) continue;
        const t = c.t, m = bodies[t];
        dummy.position.set(c.x, (c.yf + c.yr) / 2, c.z); dummy.rotation.set(0, Math.atan2(-c.hz, c.hx), Math.atan2(c.yf - c.yr, 2 * AX[t])); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        m.setMatrixAt(cnt[t], dummy.matrix); m.setColorAt(cnt[t]++, c.col);
        dummy.scale.set(LS[t][0], LS[t][1], LS[t][2]); dummy.updateMatrix(); lamps.setMatrixAt(nl, dummy.matrix);
        const on = time * 1.5 % 1 < 0.5, ind = c.ne && c.ES[0] - c.s < 35 && c.s < c.EX[0] ? c.EF[0] : 0;   // flash for a turn from 35 m out
        LC.setRGB(c.br ? 1 : 0.3, on && (c.haz > 0 || ind & 2) ? 1 : 0, on && (c.haz > 0 || ind & 4) ? 1 : 0); lamps.setColorAt(nl++, LC);
      }
      for (let t = 0; t < 3; t++) { bodies[t].count = cnt[t]; bodies[t].instanceMatrix.needsUpdate = bodies[t].instanceColor.needsUpdate = true; }
      lamps.count = nl; lamps.instanceMatrix.needsUpdate = lamps.instanceColor.needsUpdate = true;
    }

    const api = W.traffic = { cars, junctions: J.length, ms: 0 };
    game.on('frame', (fdt, driving) => {
      if (!driving && game.mode !== 'drive') return;
      const t0 = performance.now(); dt = Math.min(fdt, 0.1); time += dt;
      const car = game.car, sp = car.spec, cs = Math.cos(car.psi), sn = Math.sin(car.psi), off = (sp.a - sp.b) / 2, dd = sp.L / 2 - sp.W / 2;
      px = car.x; pz = -car.y; pvx = car.vx; pvz = -car.vy; pv = Math.hypot(pvx, pvz); prr = sp.W / 2;
      PC[0] = px + cs * (off + dd); PC[1] = pz - sn * (off + dd); PC[2] = px + cs * (off - dd); PC[3] = pz - sn * (off - dd);
      const cam = game.camera, e = cam.matrixWorld.elements, fl = Math.hypot(e[8], e[10]) || 1;
      camX = e[12]; camZ = e[14]; cfx = -e[8] / fl; cfz = -e[10] / fl; cosV = Math.cos(Math.min(3, Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect) + 0.35));
      if ((setT -= dt) <= 0) { setT = 2; N = COUNT[game.settings.traffic] ?? 8; if (!N) for (const c of cars) kill(c); }   // switched off: gone at once
      if ((nearT -= dt) <= 0) { nearT = 2; nearN = 0; for (let q = 0; q < cand.length; q += 2) { const o = R[cand[q]], k = cand[q + 1], d2 = (o.X[k] - px) ** 2 + (o.Z[k] - pz) ** 2; if (d2 > 25600 && d2 < 202500) near[nearN++] = q; } }
      let alive = 0;
      for (let i = 0; i < MAXN; i++) if (cars[i].on) { step(cars[i]); if (cars[i].on) alive++; }
      for (let i = MAXN - 1; i >= 0 && alive > N; i--) if (cars[i].on && !seen(cars[i].x, cars[i].z)) { kill(cars[i]); alive--; }
      if (alive < N && (spawnT -= dt) <= 0 && spawn()) spawnT = 0.3;
      draw();
      api.ms = performance.now() - t0;
    });
  };
})();
