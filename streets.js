/* Bloomfield Drift — street furniture and road-surface detail (BD.buildStreets), generated from the road network.
   Finds the junctions in W.roads, then adds: street-name blade signs with the real names, stop signs, the two
   signalised junctions (mast arms, 3-lens heads on a running cycle), stop bars and zebra crosswalks, ornamental
   lamps downtown and cobra-heads on the highways, parked cars, pickups and SUVs (kerb, parking lots, driveway pads),
   utility poles with wires, mailboxes, hydrants and railroad crossbucks.
   Draws as 4 merged meshes + 6 instanced meshes (parked bodies: paint + trim) + 1 line mesh; all text lives in one atlas. Everything solid goes
   onto W.obstacles (the game builds collision afterwards). Reads no settings, makes no DOM, emits no events.
   Leaves W.streets = { junctions, count, obstacles: [from, to), carObstacles: [from, kerbEnd, to), check() }
   (the ranges index the flat W.obstacles array). */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});

  B.buildStreets = function ({ scene, W, M }) {
    const U = B.util, lin = U.lin, hAt = W.heightXZ, roads = W.roads, HALF = W.HALF, PLAY = W.PLAY - 3, rng = U.mulberry(5471);
    const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1, unknown: 1, track: 0 };
    const rank = (s) => RANK[s.cls] || 0, obs0 = W.obstacles.length;
    const N = { nameSigns: 0, blades: 0, stopSigns: 0, stopBars: 0, crosswalks: 0, signalHeads: 0, lamps: 0, cobraLights: 0, kerbCars: 0, lotCars: 0, drivewayCars: 0, stalls: 0, poles: 0, wireSpans: 0, mailboxes: 0, hydrants: 0, crossbucks: 0 };
    const inPlay = (X, Z) => Math.abs(X) < PLAY && Math.abs(Z) < PLAY;
    const downtown = (X, Z) => Math.abs(X) < 262 && Math.abs(Z) < 215;                       // the blocks around the square and Main Street
    const square = (X, Z) => Math.abs(X) < 60 && Z > -66 && Z < 53;                          // the four streets round the courthouse
    const tan = (s, k) => { const a = Math.max(0, k - 1), c = Math.min(s.X.length - 1, k + 1), tx = s.X[c] - s.X[a], tz = s.Z[c] - s.Z[a], il = 1 / (Math.hypot(tx, tz) || 1); return [tx * il, tz * il]; };
    const hput = (m, k, ...v) => { const a = m.get(k); if (a) a.push(...v); else m.set(k, v); };

    // ---------- lookups: road segments (16 m cells), solid circles (8 m), building footprints (32 m) ----------
    const GC = 16, GN = Math.ceil(2 * HALF / GC), ci = (v) => U.clamp((v + HALF) / GC | 0, 0, GN - 1), rcell = new Map();
    roads.forEach((s, ri) => { for (let k = 0; k < s.X.length; k++) hput(rcell, ci(s.Z[k]) * GN + ci(s.X[k]), ri, k); });
    function nearSegs(X, Z, fn) {   // fn(road, k, distance from (X,Z) to segment k..k+1, t along it) for every segment within ~16 m
      const i0 = ci(X), j0 = ci(Z);
      for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
        const a = rcell.get(j * GN + i); if (!a) continue;
        for (let q = 0; q < a.length; q += 2) {
          const s = roads[a[q]], k = a[q + 1], k2 = Math.min(k + 1, s.X.length - 1), ax = s.X[k], az = s.Z[k], ex = s.X[k2] - ax, ez = s.Z[k2] - az;
          const t = U.clamp(((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
          fn(s, k, Math.hypot(X - ax - ex * t, Z - az - ez * t), t);
        }
      }
    }
    // distance to the nearest road edge of any class (negative = on the road)
    const edgeDist = (X, Z) => { let best = 99; nearSegs(X, Z, (s, k, d) => { best = Math.min(best, d - s.hw); }); return best; };
    const roadTop = (X, Z) => { let y = -1e9; nearSegs(X, Z, (s, k, d, t) => { if (d < s.hw + 0.2) y = Math.max(y, s.H[k] + (s.H[Math.min(k + 1, s.X.length - 1)] - s.H[k]) * t + s.lift); }); return y; };
    const ground = (X, Z) => Math.max(roadTop(X, Z), hAt(X, Z) + (W.maskAt(X, Z) === 1 ? 0.05 : 0));   // top of whatever is paved here

    const ocell = new Map(), okey = (X, Z) => Math.floor(Z / 8) * 1024 + Math.floor(X / 8);
    for (let k = 0; k < obs0; k += 3) hput(ocell, okey(W.obstacles[k], W.obstacles[k + 1]), W.obstacles[k], W.obstacles[k + 1], W.obstacles[k + 2]);
    function oClear(X, Z, r) {
      const i0 = Math.floor(X / 8), j0 = Math.floor(Z / 8);
      for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) { const a = ocell.get(j * 1024 + i); if (a) for (let q = 0; q < a.length; q += 3) if (Math.hypot(a[q] - X, a[q + 1] - Z) < r + a[q + 2]) return false; }
      return true;
    }
    const solid = (X, Z, r) => { W.obstacles.push(X, Z, r); hput(ocell, okey(X, Z), X, Z, r); };

    const bcell = new Map(), bfoot = new Map(), bkey = (X, Z) => Math.floor(Z / 32) * 512 + Math.floor(X / 32);   // by centre, and by every cell the footprint's box touches
    for (const b of W.buildings) {
      hput(bcell, bkey(b.cx, b.cz), b); const xs = b.pts.map((p) => p[0]), zs = b.pts.map((p) => p[1]);
      for (let j = Math.floor(Math.min(...zs) / 32); j <= Math.floor(Math.max(...zs) / 32); j++) for (let i = Math.floor(Math.min(...xs) / 32); i <= Math.floor(Math.max(...xs) / 32); i++) hput(bfoot, j * 512 + i, b);
    }
    function nearB(X, Z, R, fn) { const n = Math.ceil(R / 32), i0 = Math.floor(X / 32), j0 = Math.floor(Z / 32); for (let j = j0 - n; j <= j0 + n; j++) for (let i = i0 - n; i <= i0 + n; i++) { const a = bcell.get(j * 512 + i); if (a) for (const b of a) fn(b); } }
    const density = (X, Z, R) => { let n = 0; nearB(X, Z, R, (b) => { if (b.area > 45 && Math.hypot(b.cx - X, b.cz - Z) < R) n++; }); return n; };
    const inRing = (p, X, Z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > Z) !== (b[1] > Z) && X < (b[0] - a[0]) * (Z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const inBldg = (X, Z) => (bfoot.get(bkey(X, Z)) || []).some((b) => inRing(b.pts, X, Z));
    const open = (X, Z) => { const m = W.maskAt(X, Z); return m === 0 || m === 5; };   // grass, or real pavement off the roadway (sidewalk, lot, driveway)
    // a free spot for something solid: off the roadway, clear of every road edge by 0.8 m, outside buildings, not on top of another obstacle.
    // Tries (X,Z) and then nudges along (ox,oz).
    function spot(X, Z, ox, oz, r) {
      for (let q = 0; q < 4; q++, X += ox * 0.45, Z += oz * 0.45) if (inPlay(X, Z) && open(X, Z) && edgeDist(X, Z) - r > 0.8 && oClear(X, Z, r + 0.3) && !inBldg(X, Z)) return [X, Z];
      return null;
    }

    // ---------- geometry helpers ----------
    const solidB = U.Buf(), signB = U.Buf(), glowB = U.Buf(), paintB = U.Buf();
    const m4 = new T.Matrix4(), v3 = new T.Vector3(), q4 = new T.Quaternion(), sc3 = new T.Vector3(), UP = new T.Vector3(0, 1, 0), WHITE = new T.Color(1, 1, 1);
    const BOX = new T.BoxGeometry(1, 1, 1), POST = new T.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0), TAPER = new T.CylinderGeometry(0.6, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    const SQ = new T.CylinderGeometry(1, 1, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0), BALL = new T.IcosahedronGeometry(1, 0), DISC = new T.CircleGeometry(1, 8);
    function add(b, geo, col, x, y, z, sx, sy, sz, yaw) {   // append a template geometry, scaled, turned about Y and moved
      m4.compose(v3.set(x, y, z), q4.setFromAxisAngle(UP, yaw || 0), sc3.set(sx, sy, sz));
      const p = geo.attributes.position, nr = geo.attributes.normal, gc = geo.attributes.color, o = b.pos.length / 3;
      for (let k = 0; k < p.count; k++) {
        v3.fromBufferAttribute(p, k).applyMatrix4(m4); b.pos.push(v3.x, v3.y, v3.z);
        v3.fromBufferAttribute(nr, k).transformDirection(m4); b.nor.push(v3.x, v3.y, v3.z);
        const g = gc ? gc.getX(k) : 1; b.col.push(col.r * g, col.g * g, col.b * g);
      }
      if (geo.index) for (const i of geo.index.array) b.idx.push(i + o); else for (let k = 0; k < p.count; k++) b.idx.push(o + k);
    }
    // upright textured rectangle facing (nx, nz), optionally rotated in its own plane; uv = [u0, v0, u1, v1]. Text reads correctly from the front.
    function quad(b, cx, cy, cz, nx, nz, w, h, uv, rot) {
      const rx = nz, rz = -nx, c = Math.cos(rot || 0), s = Math.sin(rot || 0), o = b.pos.length / 3;
      for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const dr = a * w / 2 * c - e * h / 2 * s, du = a * w / 2 * s + e * h / 2 * c;
        b.pos.push(cx + rx * dr, cy + du, cz + rz * dr); b.nor.push(nx, 0, nz); b.uv.push(a < 0 ? uv[0] : uv[2], e < 0 ? uv[1] : uv[3]);
      }
      b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    function octa(b, cx, cy, cz, nx, nz, R, uv) {   // upright octagon, R = half the distance across the flats
      const rx = nz, rz = -nx, o = b.pos.length / 3, k8 = 1 / Math.cos(Math.PI / 8);
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4, c = Math.cos(a) * k8, s = Math.sin(a) * k8; b.pos.push(cx + rx * c * R, cy + s * R, cz + rz * c * R); b.nor.push(nx, 0, nz); b.uv.push((uv[0] + uv[2]) / 2 + (uv[2] - uv[0]) / 2 * c, (uv[1] + uv[3]) / 2 + (uv[3] - uv[1]) / 2 * s); }
      for (let k = 1; k < 7; k++) b.idx.push(o, o + k, o + k + 1);
    }
    function flat(b, c, col) {   // upward-facing quad from four [x, y, z] corners given in ring order
      const o = b.pos.length / 3, up = (c[1][2] - c[0][2]) * (c[3][0] - c[0][0]) - (c[1][0] - c[0][0]) * (c[3][2] - c[0][2]) >= 0;
      for (const p of c) { b.pos.push(p[0], p[1], p[2]); b.nor.push(0, 1, 0); b.col.push(col.r, col.g, col.b); b.uv.push(p[0] / 1.5, p[2] / 1.5); }
      b.idx.push(o, o + (up ? 1 : 3), o + 2, o, o + 2, o + (up ? 3 : 1));
    }
    // point on a road at arc distance `dist` from sample a.k walking in direction a.dir; (tx,tz) points along the walk
    function along(a, dist) {
      const s = a.s; let k = a.k;
      for (;;) {
        const k2 = k + a.dir; if (k2 < 0 || k2 >= s.X.length) return null;
        const dx = s.X[k2] - s.X[k], dz = s.Z[k2] - s.Z[k], L = Math.hypot(dx, dz) || 1e-6;
        if (dist <= L) { const t = dist / L; return { x: s.X[k] + dx * t, z: s.Z[k] + dz * t, h: s.H[k] + (s.H[k2] - s.H[k]) * t + s.lift, tx: dx / L, tz: dz / L }; }
        dist -= L; k = k2;
      }
    }
    const PAINT = lin(0xd8d8d2);
    // paint on the road surface between arc distances s0..s1 and lateral offsets l0..l1 (+ = right of traffic approaching a.k)
    function band(a, s0, s1, l0, l1) {
      const p = along(a, s0), q = along(a, s1); if (!p || !q || !inPlay(p.x, p.z)) return false;
      flat(paintB, [[p, l0], [p, l1], [q, l1], [q, l0]].map(([e, l]) => [e.x + e.tz * l, e.h + 0.03, e.z - e.tx * l]), PAINT); return true;
    }

    // ---------- one atlas: every street name as a green blade, STOP, the crossbuck blades, two plain patches ----------
    const AW = 2048, AH = 1024, uv = {}, cell = (x, y, w, h) => [(x + 1) / AW, 1 - (y + h - 1) / AH, (x + w - 1) / AW, 1 - (y + 1) / AH];
    const DIRS = { North: 'N', South: 'S', East: 'E', West: 'W' }, KINDS = { Street: 'St', Avenue: 'Ave', Drive: 'Dr', Lane: 'Ln', Road: 'Rd', Boulevard: 'Blvd' };
    const short = (n) => { const w = n.split(' '), e = w.length - 1; if (e > 1 && DIRS[w[0]]) w[0] = DIRS[w[0]]; if (e > 0 && KINDS[w[e]]) w[e] = KINDS[w[e]]; return w.join(' '); };   // blade wording: "W Main St"
    const names = [...new Set(roads.filter((s) => rank(s) && s.name).map((s) => s.name))];
    const atlas = U.canvasTex(AW, AH, (g) => {
      g.fillStyle = '#0a6a42'; g.fillRect(0, 0, AW, AH); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#fff';
      let px = 42, rh, lay;
      const layout = () => { g.font = '600 ' + px + 'px ' + U.TEXT_FONT; rh = Math.round(px * 1.4); let x = 0, y = 0; lay = names.map((n) => { const w = Math.max(rh * 2.6, Math.ceil(g.measureText(short(n)).width + px)); if (x + w > AW) { x = 0; y += rh; } const o = [x, y, w]; x += w; return o; }); return y + rh <= 764; };
      while (!layout() && px > 16) px -= 2;
      names.forEach((n, i) => { const [x, y, w] = lay[i]; g.strokeRect(x + 5.5, y + 5.5, w - 11, rh - 11); g.fillStyle = '#fff'; g.fillText(short(n), x + w / 2, y + rh / 2 + 1); uv[n] = cell(x, y, w, rh); uv[n].asp = w / rh; });
      g.fillStyle = '#b01c22'; g.fillRect(0, 768, 256, 256); g.lineWidth = 8; g.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4; g[k ? 'lineTo' : 'moveTo'](128 + Math.cos(a) * 122, 896 + Math.sin(a) * 122); }
      g.closePath(); g.stroke(); g.fillStyle = '#fff'; U.fit(g, 'STOP', 168, 100, 'Arial, Helvetica, sans-serif'); g.font = 'bold ' + g.font; g.fillText('STOP', 128, 901); uv.STOP = cell(0, 768, 256, 256);
      g.fillStyle = '#f4f4f0'; g.fillRect(256, 768, 600, 256); g.fillStyle = '#111'; g.font = 'bold 72px Arial, Helvetica, sans-serif';
      g.fillText('RAILROAD', 512, 818); g.fillText('CROSSING', 512, 918); uv.RAIL = cell(256, 768, 512, 96); uv.CROSS = cell(256, 868, 512, 96);
      g.fillStyle = '#8d9296'; g.fillRect(864, 768, 64, 64); uv.GREY = [896 / AW, 1 - 800 / AH, 896 / AW, 1 - 800 / AH]; uv.BLANK = [812 / AW, 1 - 990 / AH, 812 / AW, 1 - 990 / AH];
    });

    // ---------- junctions: clusters of places where two drivable roads touch, with one arm per road leaving them ----------
    const J = [];
    {
      const cl = [];
      roads.forEach((s, ri) => {
        if (!rank(s)) return;
        for (let k = 0; k < s.X.length; k++) {
          const X = s.X[k], Z = s.Z[k]; let touch = false;
          nearSegs(X, Z, (o, ko, d) => { if (o !== s && rank(o) && d < 1.3) touch = true; });
          if (!touch) continue;
          let c = cl.find((q) => Math.hypot(q.x - X, q.z - Z) < 9); if (!c) cl.push(c = { x: X, z: Z, n: 0, sx: 0, sz: 0, m: [] });
          c.n++; c.sx += X; c.sz += Z; c.x = c.sx / c.n; c.z = c.sz / c.n; c.m.push(ri, k);
        }
      });
      for (const c of cl) {
        const near = new Map(), arms = [];
        for (let q = 0; q < c.m.length; q += 2) { const s = roads[c.m[q]], k = c.m[q + 1], d = Math.hypot(s.X[k] - c.x, s.Z[k] - c.z), o = near.get(s); if (!o || d < o.d) near.set(s, { k, d }); }
        near.forEach((o, s) => {
          for (const dir of [1, -1]) {
            const end = dir > 0 ? s.X.length - 1 : 0, room = Math.abs(end - o.k); if (room < 3) continue;
            const k1 = o.k + dir * Math.min(room, 5), L = Math.hypot(s.X[k1] - s.X[o.k], s.Z[k1] - s.Z[o.k]) || 1; let len = 0;
            for (let q = o.k; q !== end; q += dir) len += Math.hypot(s.X[q + dir] - s.X[q], s.Z[q + dir] - s.Z[q]);
            const a = { s, k: o.k, dir, ax: (s.X[k1] - s.X[o.k]) / L, az: (s.Z[k1] - s.Z[o.k]) / L, rank: rank(s), len };
            const dup = arms.findIndex((b) => b.ax * a.ax + b.az * a.az > 0.94);
            if (dup < 0) arms.push(a); else if (a.rank > arms[dup].rank) arms[dup] = a;
          }
        });
        if (arms.length < 3) continue;
        arms.sort((a, b) => Math.atan2(a.az, a.ax) - Math.atan2(b.az, b.ax));
        // e = how far along the arm the junction box reaches (where the crossing road's edge is)
        for (const a of arms) { let e = 2; for (const b of arms) { const sn = Math.abs(a.ax * b.az - a.az * b.ax); if (b !== a && sn > 0.35) e = Math.max(e, (b.s.hw + a.s.hw * Math.abs(a.ax * b.ax + a.az * b.az)) / sn); } a.e = Math.min(e, 13); }
        const j = { x: c.x, z: c.z, arms, streets: arms.filter((a) => a.rank > 1), r: Math.max(...arms.map((a) => a.e)), town: density(c.x, c.z, 90) >= 5, ci: -1 };
        j.signal = M.signals.some((p) => Math.hypot(p[0] - j.x, -p[1] - j.z) < 14); J.push(j);
        const st = j.streets; if (st.length < 3) continue;
        // ponytail: no stop-sign data in the map, so the lower class yields and equal classes in town are all-way stops; feed real tags here if they turn up
        const top = Math.max(...st.map((a) => a.rank)), lo = st.filter((a) => a.rank < top), stem = st.filter((a) => !st.some((b) => a.ax * b.ax + a.az * b.az < -0.8));
        const allWay = j.signal || st.length - lo.length < 2 || (!lo.length && (j.town || !stem.length));
        j.cross = square(j.x, j.z) || (Math.abs(j.x) <= 260 && st.some((a) => /Main Street/.test(a.s.name)));
        for (const a of allWay ? st : lo.length ? lo : stem) a.stop = a.len > a.e + (j.cross ? 13 : 9);
      }
    }
    function corner(j, i, m) {   // the kerb corner between arm i and the next arm round, m metres back from both road edges
      const A = j.arms, a = A[i], b = A[(i + 1) % A.length], sn = a.ax * b.az - a.az * b.ax; if (sn < 0.64) return null;
      const ox = a.ax + b.ax, oz = a.az + b.az, il = 1 / (Math.hypot(ox, oz) || 1);
      return { a, b, x: j.x + (a.ax * (b.s.hw + m) + b.ax * (a.s.hw + m)) / sn, z: j.z + (a.az * (b.s.hw + m) + b.az * (a.s.hw + m)) / sn, ox: ox * il, oz: oz * il };
    }

    const STEEL = lin(0x8a8f92), GALV = lin(0x9a9da0), IRON = lin(0x1c2622), DARK = lin(0x161616), WOOD = lin(0x4a4038);
    // ---------- traffic lights at the two signalised junctions ----------
    const lenses = [];
    function head(X, y, Z, nx, nz, grp) {   // 3-lens head centred on (X, y, Z) facing (nx, nz)
      const yaw = Math.atan2(nx, nz); add(solidB, BOX, DARK, X, y, Z, 0.44, 1.3, 0.3, yaw); N.signalHeads++;
      for (let w = 0; w < 3; w++) { lenses.push({ v: glowB.pos.length / 3, n: DISC.attributes.position.count, g: grp, w }); add(glowB, DISC, DARK, X + nx * 0.16, y + 0.4 * (1 - w), Z + nz * 0.16, 0.16, 0.16, 0.16, yaw); }
    }
    for (const j of J) if (j.signal) for (const a of j.streets) {
      // far-side mast arm for traffic coming in along arm a: pole beside the far arm on the driver's right, arm reaching back over the lane
      const opp = j.streets.find((b) => a.ax * b.ax + a.az * b.az < -0.8) || a, rx = a.az, rz = -a.ax, hw = Math.min(a.s.hw, opp.s.hw), far = opp.e + 1.6;
      const q = spot(j.x - a.ax * far + rx * (opp.s.hw + 1.9), j.z - a.az * far + rz * (opp.s.hw + 1.9), rx, rz, 0.15); if (!q) continue;
     
      const y = hAt(q[0], q[1]), reach = (q[0] - j.x) * rx + (q[1] - j.z) * rz - hw / 2, L = reach + 0.4, grp = Math.abs(a.ax) > Math.abs(a.az) ? 0 : 1;
      add(solidB, TAPER, GALV, q[0], y - 0.2, q[1], 0.14, 7, 0.14, 0);
      add(solidB, BOX, GALV, q[0] - rx * L / 2, y + 6.45, q[1] - rz * L / 2, L, 0.13, 0.13, Math.atan2(-rz, rx));
      head(q[0] - rx * reach, y + 5.7, q[1] - rz * reach, a.ax, a.az, grp); head(q[0] - rx * 0.42, y + 3.1, q[1] - rz * 0.42, a.ax, a.az, grp);
      solid(q[0], q[1], 0.15);
    }

    // ---------- street-name signs: one post per junction, a blade for each of the two streets at that corner ----------
    const BH = 0.4;
    function blade(X, y, Z, a) {   // green blade parallel to arm a, readable from both sides
      const u = uv[a.s.name]; for (const s of [1, -1]) quad(signB, X - a.az * s * 0.02, y, Z + a.ax * s * 0.02, -a.az * s, a.ax * s, BH * u.asp, BH, u); N.blades++;
    }
    for (const j of J) {
      // ponytail: driveways and alleys onto a single street get no sign; one post per junction on its best corner, not one per approach
      const named = new Set(j.arms.filter((a) => a.s.name).map((a) => a.s.name)); if (!named.size || (j.streets.length < 3 && named.size < 2)) continue;
      let best = null;
      j.arms.forEach((a, i) => {
        const c = corner(j, i, 1.3); if (!c) return;
        const score = (c.a.s.name ? 4 : 0) + (c.b.s.name && c.b.s.name !== c.a.s.name ? 4 : 0) + (c.a.rank > 1) + (c.b.rank > 1); if (best && score <= best.score) return;
        const p = spot(c.x, c.z, c.ox, c.oz, 0.1); if (p) best = { p, c, i, score };
      });
      if (!best || best.score < 4) continue;
      const [X, Z] = best.p, y = hAt(X, Z), { a, b } = best.c, two = a.s.name && b.s.name && a.s.name !== b.s.name;
      add(solidB, SQ, STEEL, X, y - 0.2, Z, 0.045, 2.95 + (two ? 2 : 1) * (BH + 0.03), 0.045, 0);
      const first = a.s.name ? a : b; blade(X, y + 2.75 + BH / 2, Z, first); if (two) blade(X, y + 2.78 + BH * 1.5, Z, b);
      solid(X, Z, 0.1); j.ci = best.i; j.post = [X, Z, a]; N.nameSigns++;
    }

    // ---------- stop signs, stop bars, crosswalks ----------
    for (const j of J) for (const a of j.streets) {
      if (j.cross && a.len > a.e + 5) { let n = 0; for (let l = -a.s.hw + 0.4; l < a.s.hw - 0.7; l += 0.95) n += band(a, a.e + 0.6, a.e + 3, l, l + 0.5); if (n) N.crosswalks++; }
      if (!a.stop) continue;
      const sb = a.e + (j.cross ? 3.7 : 0.7); if (band(a, sb, sb + 0.45, 0.25, a.s.hw - 0.25)) N.stopBars++;
      if (j.signal) continue;
      const p = along(a, sb + 0.2), q = p && spot(p.x + p.tz * (a.s.hw + 1.5), p.z - p.tx * (a.s.hw + 1.5), p.tz, -p.tx, 0.08); if (!q) continue;
      const y = hAt(q[0], q[1]); add(solidB, SQ, STEEL, q[0], y - 0.2, q[1], 0.04, 2.75, 0.04, Math.atan2(-p.tz, p.tx));
      octa(signB, q[0] + p.tx * 0.045, y + 2.1, q[1] + p.tz * 0.045, p.tx, p.tz, 0.38, uv.STOP); octa(signB, q[0] - p.tx * 0.045, y + 2.1, q[1] - p.tz * 0.045, -p.tx, -p.tz, 0.38, uv.GREY);
      solid(q[0], q[1], 0.08); N.stopSigns++;
    }

    // ---------- street lights ----------
    const LAMP = lin(0xfff0c4);
    roads.forEach((s) => {   // ornamental posts round the square and along Main Street downtown, alternating sides every 15 m
      if (rank(s) < 2) return; const main = /Main Street/.test(s.name || ''); let arc = 0, next = 9, side = 1;
      for (let k = 1; k < s.X.length - 1; k++) {
        arc += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]); const X = s.X[k], Z = s.Z[k];
        if (arc < next || !((main && Math.abs(X) <= 260) || square(X, Z))) continue;
        next = arc + 15; side = -side; const [tx, tz] = tan(s, k), q = spot(X + tz * side * (s.hw + 1), Z - tx * side * (s.hw + 1), tz * side, -tx * side, 0.16); if (!q || J.some((j) => j.signal && Math.hypot(j.x - q[0], j.z - q[1]) < j.r + 6)) continue;   // the signal corners are busy enough
        const y = hAt(q[0], q[1]); add(solidB, POST, IRON, q[0], y - 0.15, q[1], 0.15, 0.85, 0.15, 0); add(solidB, TAPER, IRON, q[0], y + 0.7, q[1], 0.08, 3.1, 0.08, 0); add(solidB, POST, IRON, q[0], y + 3.8, q[1], 0.14, 0.09, 0.14, 0); add(solidB, TAPER, IRON, q[0], y + 4.5, q[1], 0.1, 0.16, 0.1, 0);
        add(glowB, BALL, LAMP, q[0], y + 4.2, q[1], 0.21, 0.33, 0.21, 0); solid(q[0], q[1], 0.16); N.lamps++;
      }
    });
    for (const j of J) {   // cobra-heads over the highway junctions in town
      if (!j.town || j.signal || j.streets.length < 3 || !j.streets.some((a) => a.rank >= 4)) continue;
      for (let t = 0; t < j.arms.length; t++) {
        const i = (j.ci + 2 + t) % j.arms.length, c = i !== j.ci && corner(j, i, 1.7), q = c && spot(c.x, c.z, c.ox, c.oz, 0.14); if (!q) continue;
        const y = hAt(q[0], q[1]), L = Math.hypot(j.x - q[0], j.z - q[1]), dx = (j.x - q[0]) / L, dz = (j.z - q[1]) / L, yaw = Math.atan2(-dz, dx);
        add(solidB, TAPER, GALV, q[0], y - 0.2, q[1], 0.13, 8.6, 0.13, 0); add(solidB, BOX, GALV, q[0] + dx * 1.3, y + 8.3, q[1] + dz * 1.3, 2.6, 0.1, 0.1, yaw);
        add(solidB, BOX, GALV, q[0] + dx * 2.8, y + 8.28, q[1] + dz * 2.8, 0.8, 0.16, 0.34, yaw); add(glowB, BOX, LAMP, q[0] + dx * 2.85, y + 8.18, q[1] + dz * 2.85, 0.5, 0.05, 0.24, yaw);
        solid(q[0], q[1], 0.14); N.cobraLights++; break;
      }
    }

    // ---------- hydrants downtown, crossbucks at the railroad ----------
    const RED = lin(0xb3261e), CAP = lin(0xd8d4c8);
    for (const j of J) {
      if (!j.post || Math.hypot(j.x, j.z) > 230) continue;
      const a = j.post[2], q = spot(j.post[0] + a.ax * 2.2, j.post[1] + a.az * 2.2, a.ax, a.az, 0.2); if (!q) continue;
      const y = hAt(q[0], q[1]); add(solidB, POST, RED, q[0], y - 0.1, q[1], 0.11, 0.68, 0.11, 0); add(solidB, BALL, CAP, q[0], y + 0.6, q[1], 0.12, 0.11, 0.12, 0); add(solidB, BOX, CAP, q[0], y + 0.4, q[1], 0.36, 0.1, 0.1, Math.atan2(-a.az, a.ax));
      solid(q[0], q[1], 0.2); N.hydrants++;
    }
    {
      const seen = [];
      const box = roads.map((s) => [Math.min(...s.X) - 1, Math.max(...s.X) + 1, Math.min(...s.Z) - 1, Math.max(...s.Z) + 1]);
      for (const rl of M.rails) for (let q = 0; q + 3 < rl.length; q += 2) {
        const cx = rl[q], cz = -rl[q + 1], ex = rl[q + 2] - cx, ez = -rl[q + 3] - cz;
        roads.forEach((s, ri) => {
          const bx = box[ri]; if (!rank(s) || M.roads[ri].b || Math.max(cx, cx + ex) < bx[0] || Math.min(cx, cx + ex) > bx[1] || Math.max(cz, cz + ez) < bx[2] || Math.min(cz, cz + ez) > bx[3]) return;   // bridges fly over the track
          for (let k = 0; k + 1 < s.X.length; k++) {
            const rx = s.X[k + 1] - s.X[k], rz = s.Z[k + 1] - s.Z[k], den = rx * ez - rz * ex; if (Math.abs(den) < 1e-9) continue;
            const wx = cx - s.X[k], wz = cz - s.Z[k], t = (wx * ez - wz * ex) / den, u = (wx * rz - wz * rx) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            if (seen.some((p) => Math.hypot(p[0] - s.X[k], p[1] - s.Z[k]) < 15)) continue; seen.push([s.X[k], s.Z[k]]);
            for (const dir of [1, -1]) {   // one crossbuck on the right of each approach
              const p = along({ s, k, dir }, 6), w = p && spot(p.x + p.tz * (s.hw + 1.5), p.z - p.tx * (s.hw + 1.5), p.tz, -p.tx, 0.08); if (!w) continue;
              const y = hAt(w[0], w[1]); add(solidB, SQ, CAP, w[0], y - 0.2, w[1], 0.055, 3.3, 0.055, 0);
              [[uv.RAIL, -1, 1], [uv.CROSS, 1, 1], [uv.BLANK, 1, -1], [uv.BLANK, -1, -1]].forEach(([c, r, f], i) => quad(signB, w[0] + p.tx * f * (0.06 + i % 2 * 0.012), y + 2.75, w[1] + p.tz * f * (0.06 + i % 2 * 0.012), p.tx * f, p.tz * f, 1.25, 0.235, c, r * Math.PI / 4));
              solid(w[0], w[1], 0.08); N.crossbucks++;
            }
          }
        });
      }
    }

    // ---------- parked vehicles ----------
    const parked = [], car0 = W.obstacles.length, CIRC = [1.15, 1.5, 1.25], AXLE = [1.35, 1.7, 1.42],   // per body (sedan, pickup, SUV): collision-circle and axle offsets
       CARCOL = [0xf2f2ee, 0xf2f2ee, 0xb9bcc2, 0xb9bcc2, 0x6b6e73, 0x1b1c1e, 0x1b1c1e, 0xa3201d, 0x24457a, 0x2f4a36, 0xb8a888, 0x5e1c22, 0x7fa3c0].map(lin);
    const farFromJunction = (X, Z, extra) => !J.some((j) => Math.hypot(j.x - X, j.z - Z) < 12 + (extra ? extra + j.r : 0));
    const shuffle = (a) => { for (let k = a.length - 1; k > 0; k--) { const q = rng() * (k + 1) | 0, t = a[k]; a[k] = a[q]; a[q] = t; } return a; };
    // parks a vehicle centred on (X,Z) heading (hx,hz) unless something is in the way; offRoad = it must stand on real pavement clear of the roadway
    function park(X, Z, hx, hz, wide, offRoad) {
      const u = rng(), t = u < 0.28 ? 1 : u < 0.52 ? 2 : 0, half = CIRC[t], c = [[X + hx * half, Z + hz * half], [X - hx * half, Z - hz * half]], col = CARCOL[rng() * CARCOL.length | 0];
      if (!c.every((p) => inPlay(p[0], p[1]) && oClear(p[0], p[1], 1.15) && (!offRoad || (W.maskAt(p[0], p[1]) === 5 && edgeDist(p[0], p[1]) - 0.9 > 0.8)))) return false;
      for (const s of [-1, 1]) for (const w of [-1, 1]) if (inBldg(X + hx * s * (half + 1.2) - hz * w * 1.25, Z + hz * s * (half + 1.2) + hx * w * 1.25)) return false;   // no corner of the body (plus 0.3 m) inside a building
      for (const p of c) solid(p[0], p[1], 0.9);
      parked.push({ X, Z, hx, hz, t, col, wide }); return true;
    }
    // centre, corners and two points between of a (2a x 2e) rectangle are all real pavement, outside buildings and off the roadway
    // (the cheap mask test runs over every point first: most candidate stalls fail it)
    const RECT = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [0.5, 0], [-0.5, 0]];
    function paved(X, Z, hx, hz, a, e) {
      for (let pass = 0; pass < 2; pass++) for (const [f, g] of RECT) { const px = X + hx * f * a - hz * g * e, pz = Z + hz * f * a + hx * g * e; if (pass ? edgeDist(px, pz) <= 0.8 || inBldg(px, pz) : W.maskAt(px, pz) !== 5) return false; }
      return true;
    }
    // (a) parallel at the kerb. Rule: downtown only, streets at least KERB_W wide, the car inside the outer 2.3 m (so the centre 6.5 m stays clear),
    // never within 12 m of a junction.
    const KERB_W = 11, LOT_CARS = 110;
    {
      const stalls = [];
      roads.forEach((s) => {
        const hw = s.hw; if (rank(s) < 2 || hw * 2 < KERB_W) return;
        const arm = { s, k: 0, dir: 1 };
        for (let a = 4; ; a += 6.3) {
          const p = along(arm, a); if (!p || !along(arm, a + 4)) break;
          if (!downtown(p.x, p.z) || !farFromJunction(p.x, p.z, 2.8)) continue;
          for (const side of [1, -1]) stalls.push([arm, a, side, p]);   // +1 = left of the road's direction, where traffic runs the other way
        }
      });
      N.stalls += stalls.length;
      // ponytail: festival day, so a kerb stall is likelier taken the nearer it is to the square; a dice roll, not a real count
      for (const [arm, a, side, p] of shuffle(stalls)) {
        const hw = arm.s.hw; if (N.kerbCars >= 55 || rng() > Math.max(0.15, 0.7 - Math.hypot(p.x, p.z) / 350) || !park(p.x + p.tz * side * (hw - 1.2), p.z - p.tx * side * (hw - 1.2), -side * p.tx, -side * p.tz, 1)) continue;
        N.kerbCars++;
      }
    }
    const kerbEnd = W.obstacles.length;
    // (b) parking lots: patches of open pavement in the lidar ground map. A cell counts when its 8 neighbours are pavement too, which drops
    // sidewalks and single driveways; stalls go nose-in in rows along the patch's long axis, squared up to the nearest street.
    {
      const n = HALF, lo = 30, hi = n - 30, m5 = (i, j) => W.maskAt(2 * i - HALF + 1, 2 * j - HALF + 1) === 5, core = new Uint8Array(n * n), lots = [];
      for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) { if (!m5(i, j)) continue; let all = 1; for (let q = 0; q < 9 && all; q++) all = m5(i + q % 3 - 1, j + (q / 3 | 0) - 1); if (all) core[j * n + i] = 1; }
      const noPark = M.areas.filter((a) => a.k === 'pitch' || a.k === 'cemetery' || a.k === 'substation').map((a) => { const p = []; for (let k = 0; k < a.p.length; k += 2) p.push([a.p[k], -a.p[k + 1]]); return p; });
      const stallOK = (X, Z, hx, hz) => paved(X, Z, hx, hz, 2.7, 1.1) && !(Math.abs(X) < 46 && Z > -52 && Z < 40) && !noPark.some((p) => inRing(p, X, Z));   // not the courthouse lawn, a ball court or the cemetery
      for (let s0 = 0; s0 < n * n; s0++) {
        if (core[s0] !== 1) continue;
        const cells = [s0]; core[s0] = 2;
        for (let h = 0; h < cells.length; h++) for (const o of [1, -1, n, -n]) if (core[cells[h] + o] === 1) { core[cells[h] + o] = 2; cells.push(cells[h] + o); }
        if (cells.length < 14) continue;                                   // 14 core cells ~ a 150 m2 patch
        const P = cells.map((q) => [2 * (q % n) - HALF + 1, 2 * (q / n | 0) - HALF + 1]), mx = P.reduce((t, p) => t + p[0], 0) / P.length, mz = P.reduce((t, p) => t + p[1], 0) / P.length;
        let sxx = 0, szz = 0, sxz = 0; for (const p of P) { sxx += (p[0] - mx) ** 2; szz += (p[1] - mz) ** 2; sxz += (p[0] - mx) * (p[1] - mz); }
        const th = Math.atan2(2 * sxz, sxx - szz) / 2, r = W.nearestRoad(mx, mz, 90); let ux = Math.cos(th), uz = Math.sin(th);
        if (r) { if (Math.abs(ux * r.tx + uz * r.tz) > 0.707) { ux = r.tx; uz = r.tz; } else { ux = r.tz; uz = -r.tx; } }
        let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of P) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
        u0 -= 3; u1 += 3; v0 -= 3; v1 += 3;
        let best = [];
        for (let ph = 0; ph < 6; ph++) {   // slide the row pattern across the lot and keep the phase that fits most stalls
          const got = [];
          for (let v = v0 + 2.8 + ph, row = 0; v + 2.8 <= v1; v += row % 2 ? 5.5 : 12.2, row++) {
            const f = row % 2 ? 1 : -1, hx = -uz * f, hz = ux * f;
            for (let u = u0 + 1.3; u + 1.3 <= u1; ) { const X = ux * u - uz * v, Z = uz * u + ux * v; if (W.maskAt(X, Z) === 5 && stallOK(X, Z, hx, hz)) { got.push([X, Z, hx, hz]); u += 2.75; } else u += 0.5; }
          }
          if (got.length > best.length) best = got;
        }
        if (best.length) lots.push(best);
      }
      // ponytail: which lots are in use is a dice roll weighted toward the square, not real occupancy; the cap keeps the module near 230 vehicles.
      // In a used lot the cars stand side by side, starting from the stall nearest a building.
      const near4 = (X, Z) => { let b = 1e9; for (let dz = -10; dz <= 10; dz += 2) for (let dx = -10; dx <= 10; dx += 2) if (W.maskAt(X + dx, Z + dz) === 4) b = Math.min(b, dx * dx + dz * dz); return b; };
      for (const lot of lots) lot.w = Math.hypot(lot[0][0], lot[0][1]) * (0.4 + rng());
      for (const lot of lots.sort((a, b) => a.w - b.w)) {
        N.stalls += lot.length; let seed = 0, bd = 2e9; lot.forEach((st, i) => { const d = near4(st[0], st[1]); if (d < bd) { bd = d; seed = i; } });
        const want = U.clamp(Math.round(lot.length * (0.15 + rng() * 0.4)), 1, 8);
        for (let q = 0, got = 0; q < 2 * lot.length && got < want && N.lotCars < LOT_CARS; q++) {
          const st = lot[seed + (q & 1 ? (q + 1) / 2 : -q / 2)], f = rng() < 0.15 ? -1 : 1;   // a few back in
          if (st && (!q || rng() > 0.2) && park(st[0], st[1], st[2] * f, st[3] * f, 1.05 + rng() * 0.05, true)) { got++; N.lotCars++; }
        }
      }
      N.lots = lots.length;
    }
    // (c) house driveways: pavement running from the street up to a house; one car, parked as far up it as it fits
    {
      // ponytail: which houses have a car out front is a dice roll weighted toward town, where the player drives
      const houses = W.buildings.filter((b) => b.kind === 'house').map((b) => [Math.hypot(b.cx, b.cz) * (0.3 + rng()), b]).sort((a, b) => a[0] - b[0]);
      for (const [, b] of houses) {
        if (N.drivewayCars >= 80) break;
        const r = W.nearestRoad(b.cx, b.cz, 45); if (!r) continue;
        const side = (b.cx - r.x) * r.tz - (b.cz - r.z) * r.tx >= 0 ? 1 : -1, nx = r.tz * side, nz = -r.tx * side, reach = (b.cx - r.x) * nx + (b.cz - r.z) * nz + 5;
        let hit = null;
        for (let d = Math.min(reach, 40); d >= r.hw + 6.5 && !hit; d -= 1) for (const l of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 8, -8, 10, -10, 12, -12]) {
          const X = r.x + nx * d + r.tx * l, Z = r.z + nz * d + r.tz * l;
          if (W.maskAt(X, Z) === 5 && paved(X, Z, nx, nz, 2.7, 0.5) && edgeDist(X, Z) > 5.5) { hit = [X, Z]; break; }
        }
        const f = rng() < 0.6 ? 1 : -1; if (hit && park(hit[0], hit[1], nx * f, nz * f, 1.05, true)) N.drivewayCars++;
      }
    }
    const car1 = W.obstacles.length;
    {
      // Bodies, local frame +X forward, ground at y = 0: a side profile with wheel-arch cut-outs extruded across the car, a glass greenhouse
      // with tumblehome and painted / black pillars, mirrors, bumpers, grille, lamps, plate and four wheels (~300 triangles). Two instanced
      // meshes per body: paint (body, roof, pillars, mirrors: white vertices take the instance colour; glossy, with scene.environment
      // reflections) and trim (glass, tyres, rims, wheel wells, bumpers, grille, lamps, plate: their own colours, matte: glossy glass
      // caught the low sun and read as grey panels).
      const C = (r, g, b) => new T.Color(r, g, b), GLASS = C(0.045, 0.06, 0.08), DK = C(0.03, 0.03, 0.033), RIM = C(0.22, 0.225, 0.23), CHROME = C(0.3, 0.31, 0.33),
        HEAD = C(0.72, 0.72, 0.68), AMBER = C(0.85, 0.3, 0.02), RED = C(0.42, 0.012, 0.01), PLATE = C(0.62, 0.62, 0.58);
      function face(b, pts, col, hx, hy, hz, ao) {   // flat polygon (fan), wound to face the hint direction; ao = [y0, y1] darkens it toward y0
        const [p0, p1, p2] = pts, ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, il = 1 / (Math.hypot(nx, ny, nz) || 1), flip = nx * hx + ny * hy + nz * hz < 0, sg = flip ? -il : il, o = b.pos.length / 3;
        for (const p of pts) { const g = ao ? 0.55 + 0.45 * U.clamp((p[1] - ao[0]) / (ao[1] - ao[0]), 0, 1) : 1; b.pos.push(p[0], p[1], p[2]); b.nor.push(nx * sg, ny * sg, nz * sg); b.col.push(col.r * g, col.g * g, col.b * g); }
        for (let k = 1; k + 1 < pts.length; k++) b.idx.push(o, o + (flip ? k + 1 : k), o + (flip ? k : k + 1));
      }
      function box(b, x0, x1, y0, y1, z0, z1, col) {   // five faces, no underside
        const c = (i, j, k) => [i ? x1 : x0, j ? y1 : y0, k ? z1 : z0];
        face(b, [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)], col, 0, 1, 0);
        for (const i of [0, 1]) face(b, [c(i, 0, 0), c(i, 1, 0), c(i, 1, 1), c(i, 0, 1)], col, i - 0.5, 0, 0);
        for (const k of [0, 1]) face(b, [c(0, 0, k), c(1, 0, k), c(1, 1, k), c(0, 1, k)], col, 0, 0, k - 0.5);
      }
      // side profile [[x, y, edge], ...], counter-clockwise seen from +Z, extruded to half width w(y). `edge` styles the strip to the next point:
      // undefined paint, 'g' glass, 'k' dark trim (both on K), 0 none (underside)
      function prism(S, P, K, prof, w, side, ao) {   // S takes the two sides
        for (const s of [1, -1]) for (const t of T.ShapeUtils.triangulateShape(prof.map((p) => new T.Vector2(p[0], p[1])), [])) face(S, t.map((i) => [prof[i][0], prof[i][1], s * w(prof[i][1])]), side, 0, 0, s, ao);
        prof.forEach((p, i) => {
          const q = prof[(i + 1) % prof.length], e = p[2]; if (e === 0) return;
          face(e ? K : P, [[p[0], p[1], w(p[1])], [q[0], q[1], w(q[1])], [q[0], q[1], -w(q[1])], [p[0], p[1], -w(p[1])]], e === 'k' ? DK : e === 'g' ? GLASS : WHITE, q[1] - p[1], p[0] - q[0], 0, e ? null : ao);
        });
      }
      const arch = (x, R, fl) => { const r = R + 0.07, p = [[x - r, fl, 'k']]; for (let k = 0; k <= 6; k++) p.push([x - r * Math.cos(k * Math.PI / 6), R + r * Math.sin(k * Math.PI / 6), 'k']); p.push([x + r, fl, 0]); return p; };
      function wheel(K, x, z, R) {   // tread, outer sidewall, rim
        const S = 10, sd = Math.sign(z), zo = z + sd * 0.12, zi = z - sd * 0.12, pt = (a, zz, r) => [x + Math.cos(a) * r, R + Math.sin(a) * r, zz];
        for (let i = 0; i < S; i++) { const a0 = i / S * Math.PI * 2, a1 = (i + 1) / S * Math.PI * 2; face(K, [pt(a0, zi, R), pt(a1, zi, R), pt(a1, zo, R), pt(a0, zo, R)], DK, Math.cos(a0 + Math.PI / S), Math.sin(a0 + Math.PI / S), 0); }
        face(K, Array.from({ length: S }, (_, i) => pt(i / S * Math.PI * 2, zo, R)), DK, 0, 0, sd);
        face(K, Array.from({ length: 8 }, (_, i) => pt(i / 4 * Math.PI, zo + sd * 0.01, R * 0.62)), RIM, 0, 0, sd);
      }
      // per body: wheel radius, sill height, profile from the front bottom round to the rear bottom (the arches go in front of it),
      // greenhouse profile (belt line first), roof half width, painted and black pillar outlines, lamps [x, y0, y1, z0, z1, colour] mirrored across the car
      const TYPES = [
        { R: 0.32, fl: 0.27, wt: 0.64, body: [[2.1, 0.3], [2.2, 0.42], [2.2, 0.62], [2.08, 0.74], [0.9, 0.84], [-1.35, 0.84], [-2.1, 0.82], [-2.2, 0.66], [-2.2, 0.42], [-2.08, 0.3, 0]],
          cab: [[-1.35, 0.84, 0], [0.9, 0.84, 'g'], [0.02, 1.4], [-0.92, 1.4, 'g']], paint: [[-1.35, 0.84], [-0.98, 0.84], [-0.7, 1.4], [-0.92, 1.4]], black: [[-0.24, 0.84], [-0.16, 0.84], [-0.16, 1.4], [-0.24, 1.4]],
          lamps: [[2.2, 0.5, 0.6, 0.42, 0.74, HEAD], [2.2, 0.5, 0.6, 0.74, 0.83, AMBER], [2.2, 0.44, 0.56, 0, 0.36, DK], [-2.2, 0.54, 0.64, 0.5, 0.83, RED], [-2.2, 0.44, 0.54, 0, 0.24, PLATE]] },
        { R: 0.38, fl: 0.36, wt: 0.72, body: [[2.6, 0.4], [2.7, 0.52], [2.7, 0.92], [2.6, 1.0], [0.95, 1.04], [-0.62, 1.04, 'k'], [-2.7, 1.04], [-2.7, 0.52], [-2.6, 0.4, 0]],
          cab: [[-0.62, 1.04, 0], [0.95, 1.04, 'g'], [0.22, 1.8], [-0.56, 1.8, 'g']], paint: [[-0.62, 1.04], [-0.4, 1.04], [-0.4, 1.8], [-0.56, 1.8]], black: null,
          lamps: [[2.7, 0.78, 0.9, 0.5, 0.78, HEAD], [2.7, 0.78, 0.9, 0.78, 0.85, AMBER], [2.7, 0.56, 0.88, 0, 0.46, CHROME], [-2.7, 0.62, 0.98, 0.72, 0.84, RED], [-2.7, 0.56, 0.68, 0, 0.24, PLATE]] },
        { R: 0.36, fl: 0.33, wt: 0.7, body: [[2.2, 0.38], [2.3, 0.5], [2.3, 0.82], [2.16, 0.92], [1.0, 0.98], [-2.22, 0.98], [-2.3, 0.9], [-2.3, 0.5], [-2.2, 0.38, 0]],
          cab: [[-2.2, 0.98, 0], [1.0, 0.98, 'g'], [0.22, 1.74], [-2.08, 1.74, 'g']], paint: [[-2.2, 0.98], [-1.86, 0.98], [-1.84, 1.74], [-2.08, 1.74]], black: [[-0.32, 0.98], [-0.22, 0.98], [-0.22, 1.74], [-0.32, 1.74]],
          lamps: [[2.3, 0.7, 0.8, 0.46, 0.76, HEAD], [2.3, 0.7, 0.8, 0.76, 0.84, AMBER], [2.3, 0.52, 0.76, 0, 0.42, DK], [-2.3, 0.66, 0.86, 0.6, 0.84, RED], [-2.3, 0.52, 0.63, 0, 0.24, PLATE]] }];
      function vehicle(t, ax) {
        const P = U.Buf(), K = U.Buf(), { R, fl, cab } = t, belt = cab[0][1], top = cab[2][1], ws = cab[1][0], h = t.body[1][0], w = (y) => 0.8 + (t.wt - 0.8) * (y - belt) / (top - belt);
        prism(P, P, K, [...arch(-ax, R, fl), ...arch(ax, R, fl), ...t.body], () => 0.85, WHITE, [fl, belt]);
        prism(K, P, K, cab, w, GLASS);
        for (const s of [1, -1]) {
          for (const [o, col, b] of [[t.paint, WHITE, P], [t.black, DK, K]]) if (o) face(b, o.map(([x, y]) => [x, y, s * (w(y) + 0.004)]), col, 0, 0, s);
          box(P, ws - 0.22, ws - 0.08, belt, belt + 0.12, s > 0 ? 0.83 : -0.98, s > 0 ? 0.98 : -0.83, WHITE);   // mirror
          box(K, s > 0 ? h - 0.08 : -h - 0.06, s > 0 ? h + 0.06 : -h + 0.08, fl, fl + 0.17, -0.87, 0.87, t.lamps[2][5] === CHROME ? CHROME : DK);   // bumper
          for (const x of [ax, -ax]) wheel(K, x, s * 0.71, R);
        }
        for (const [x, y0, y1, z0, z1, col] of t.lamps) for (const s of [1, -1]) face(K, [[x, y0, s * z0], [x, y1, s * z0], [x, y1, s * z1], [x, y0, s * z1]].map((p) => [p[0] + Math.sign(x) * 0.006, p[1], p[2]]), col, x, 0, 0);
        return [U.bufGeo(P), U.bufGeo(K)];
      }
      const paintMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }), trimMat = new T.MeshLambertMaterial({ vertexColors: true }), d = new T.Object3D();
      paintMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', T.ShaderChunk.lights_fragment_maps.replace('iblIrradiance +=', 'iblIrradiance += 0.2 *')); };   // as cars.js and traffic.js: the reflections, not the ambient
      TYPES.forEach((t, k) => {
        const list = parked.filter((c) => c.t === k); if (!list.length) return;
        const half = AXLE[k], ms = vehicle(t, half).map((g, i) => new T.InstancedMesh(g, i ? trimMat : paintMat, list.length));
        list.forEach((c, i) => {
          const yf = ground(c.X + c.hx * half, c.Z + c.hz * half), yr = ground(c.X - c.hx * half, c.Z - c.hz * half);
          d.position.set(c.X, (yf + yr) / 2 + 0.02, c.Z); d.rotation.set(0, Math.atan2(-c.hz, c.hx), Math.atan2(yf - yr, 2 * half)); d.scale.set(1, 1, c.wide); d.updateMatrix();
          for (const m of ms) m.setMatrixAt(i, d.matrix);
          ms[0].setColorAt(i, c.col);
        });
        for (const m of ms) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
      });
    }

    // ---------- utility poles with wires along the residential streets, where the map has no real pole nearby ----------
    {
      const poles = [], real = M.poles.filter((p) => p[2] === 0), wire = [];
      roads.forEach((s, ri) => {
        const r = rank(s); if (r < 2 || r > 3 || s.gravel) return;
        const key = s.name || '#' + ri, odd = [...key].reduce((t, c) => t + c.charCodeAt(0), 0) & 1; let arc = 0, next = 22;
        for (let k = 1; k < s.X.length; k++) {
          arc += Math.hypot(s.X[k] - s.X[k - 1], s.Z[k] - s.Z[k - 1]); if (arc < next) continue; next += 45;
          const X = s.X[k], Z = s.Z[k]; if (density(X, Z, 60) < 3) continue;   // ponytail: "built-up" = 3+ buildings within 60 m
          let [tx, tz] = tan(s, k), nx = tz, nz = -tx; if ((nx * 0.6 + nz * 0.8 > 0) === !odd) { nx = -nx; nz = -nz; }   // same side for every piece of a street
          const q = spot(X + nx * (s.hw + 1.5), Z + nz * (s.hw + 1.5), nx, nz, 0.3); if (!q) continue;
          if (real.some((p) => Math.hypot(p[0] - q[0], -p[1] - q[1]) < 60) || poles.some((p) => Math.hypot(p.X - q[0], p.Z - q[1]) < 25)) continue;
          const y = hAt(q[0], q[1]); add(solidB, TAPER, WOOD, q[0], y - 0.3, q[1], 0.15, 9.3, 0.15, 0); add(solidB, BOX, WOOD, q[0], y + 8.4, q[1], 2.2, 0.12, 0.12, Math.atan2(-nz, nx));
          solid(q[0], q[1], 0.3); poles.push({ X: q[0], Z: q[1], y, nx, nz, key }); N.poles++;
        }
      });
      // three wires from pole a to pole b: two on the crossarm ends, one lower on the pole, each sagging 2.5% of the span
      const done = new Set();
      function span(a, b) {
        const L = Math.hypot(b.X - a.X, b.Z - a.Z), f = a.nx * b.nx + a.nz * b.nz < 0 ? -1 : 1, id = Math.min(a.i, b.i) * 4096 + Math.max(a.i, b.i); if (done.has(id)) return; done.add(id); N.wireSpans++;
        for (const [o, h] of [[1, 8.5], [-1, 8.5], [0, 7.2]]) { const ax = a.X + a.nx * o, az = a.Z + a.nz * o, ex = b.X + b.nx * o * f - ax, ez = b.Z + b.nz * o * f - az; for (let q = 0; q < 6; q++) for (const u of [q / 6, (q + 1) / 6]) wire.push(ax + ex * u, a.y + h + (b.y - a.y) * u - L * 0.1 * u * (1 - u), az + ez * u); }
      }
      // ponytail: wires join consecutive poles of one street sorted along its long axis (spans up to 85 m); a street that doubles back would get a chord
      const groups = new Map(); poles.forEach((p, i) => { p.i = i; hput(groups, p.key, p); });
      groups.forEach((g) => {
        const xs = g.map((p) => p.X), zs = g.map((p) => p.Z), byX = Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs);
        g.sort((a, b) => (byX ? a.X - b.X : a.Z - b.Z));
        for (let i = 1; i < g.length; i++) if (Math.hypot(g[i].X - g[i - 1].X, g[i].Z - g[i - 1].Z) <= 85) span(g[i - 1], g[i]);
      });
      // the map's own poles (world.js draws them bare) get the same wires: each is joined to its nearest neighbour and to the nearest one the other way.
      // ponytail: the crossarm yaw is copied from world.js (hash2(k, 3) * 3); if that changes these wires miss the arm ends by up to a metre
      const rp = real.map((p, k) => { const a = U.hash2(k, 3) * 3; return { X: p[0], Z: -p[1], y: hAt(p[0], -p[1]), nx: Math.cos(a), nz: -Math.sin(a), i: 2000 + k }; });
      for (const a of rp) {
        const near = rp.filter((b) => b !== a && Math.hypot(b.X - a.X, b.Z - a.Z) < 110).sort((b, c) => Math.hypot(b.X - a.X, b.Z - a.Z) - Math.hypot(c.X - a.X, c.Z - a.Z)); if (!near.length) continue;
        const b = near[0], c = near.find((c) => (c.X - a.X) * (b.X - a.X) + (c.Z - a.Z) * (b.Z - a.Z) < 0); span(a, b); if (c) span(a, c);
      }
      if (wire.length) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(wire), 3)); scene.add(new T.LineSegments(g, new T.LineBasicMaterial({ color: lin(0x26221e) }))); }
    }

    // ---------- mailboxes at the road edge in front of houses outside downtown ----------
    {
      // ponytail: mailboxes are scenery only (not solid): they stand 0.7 m off the lane, where a solid post would punish every wide slide
      const done = [], BOXC = [0x1e1f22, 0xe6e3da, 0x6b6e73, 0x2f4a36, 0x8a8f92].map(lin);
      for (const b of W.buildings) {
        if (b.kind !== 'house' || Math.hypot(b.cx, b.cz) < 215 || done.length >= 420) continue;
        const r = W.nearestRoad(b.cx, b.cz, 40); if (!r || RANK[r.cls] < 2 || rng() > 0.72) continue;
        const side = (b.cx - r.x) * r.tz - (b.cz - r.z) * r.tx >= 0 ? 1 : -1, nx = r.tz * side, nz = -r.tx * side, X = r.x + nx * (r.hw + 0.7), Z = r.z + nz * (r.hw + 0.7);
        if (!inPlay(X, Z) || edgeDist(X, Z) < 0.5 || W.maskAt(X, Z) > 2 && W.maskAt(X, Z) < 5 || W.maskAt(X + nx * 1.6, Z + nz * 1.6) !== 0 || !oClear(X, Z, 0.4) || done.some((p) => Math.hypot(p[0] - X, p[1] - Z) < 5)) continue;
        const y = hAt(X, Z), yaw = Math.atan2(-nz, nx); done.push([X, Z]);
        add(solidB, SQ, WOOD, X, y - 0.1, Z, 0.055, 1.15, 0.055, yaw); add(solidB, BOX, BOXC[rng() * BOXC.length | 0], X - nx * 0.12, y + 1.16, Z - nz * 0.12, 0.5, 0.24, 0.2, yaw);
      }
      N.mailboxes = done.length;
    }

    // ---------- meshes ----------
    // ponytail: one mesh per kind for the whole town (~58k triangles always submitted, never culled); split by district if the budget tightens
    const mesh = (b, mat, cast) => { if (!b.idx.length) return null; const m = new T.Mesh(U.bufGeo(b), mat); m.castShadow = !!cast; m.receiveShadow = !cast; scene.add(m); return m; };
    mesh(solidB, new T.MeshLambertMaterial({ vertexColors: true }), true);
    mesh(signB, new T.MeshLambertMaterial({ map: atlas }));
    mesh(paintB, new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    const glow = mesh(glowB, new T.MeshBasicMaterial({ vertexColors: true }));
    if (glow && lenses.length) {   // ponytail: one fixed 24 s two-phase cycle for both lights, and nothing obeys it; the only per-frame cost is a phase compare
      const col = glow.geometry.attributes.color, ON = [0xff2a1c, 0xffbe1c, 0x2cff8a].map(lin), OFF = [0x3a0d08, 0x3a2c08, 0x08301a].map(lin); let last = -1;
      const cycle = (t) => {
        const u = t % 24, ph = u < 9 ? 0 : u < 11.5 ? 1 : u < 12 ? 2 : u < 21 ? 3 : u < 23.5 ? 4 : 5; if (ph === last) return; last = ph;
        for (const l of lenses) { const mine = l.g ? ph === 3 || ph === 4 : ph < 2, lit = !mine ? 0 : ph % 3 ? 1 : 2, c = (lit === l.w ? ON : OFF)[l.w]; for (let k = l.v; k < l.v + l.n; k++) col.setXYZ(k, c.r, c.g, c.b); }
        col.needsUpdate = true;
      };
      cycle(0); W.animated.push(cycle);
    }

    // ---------- stats + the lane self-check (call W.streets.check() once W.buildCollision() has run, or any time) ----------
    const obs1 = W.obstacles.length;
    W.streets = { junctions: J.length, count: N, obstacles: [obs0, obs1], carObstacles: [car0, kerbEnd, car1],
      /** Probes every 4th sample of each street (centreline and both lane centres, radius 1 m) against what this module made solid.
          furniture, carsOnCentreline and carsOnNarrow must all be 0; kerbCarsBesideLane counts the deliberate kerb parking on streets >= KERB_W. */
      check() {
        const O = W.obstacles, out = { probes: 0, furniture: 0, carsOnCentreline: 0, carsOnNarrow: 0, kerbCarsBesideLane: 0 };
        for (const s of roads) {
          if (rank(s) < 2) continue;
          for (let k = 0; k < s.X.length; k += 4) { const [tx, tz] = tan(s, k); for (const o of [0, s.hw - 1.3, 1.3 - s.hw]) {
            const X = s.X[k] + tz * o, Z = s.Z[k] - tx * o; out.probes++;
            for (let q = obs0; q < obs1; q += 3) { if (Math.abs(O[q] - X) > 3 || Math.hypot(O[q] - X, O[q + 1] - Z) >= 1 + O[q + 2]) continue;
              if (q < car0 || q >= car1) out.furniture++; else if (!o) out.carsOnCentreline++; else if (s.hw * 2 < KERB_W || q >= kerbEnd) out.carsOnNarrow++; else out.kerbCarsBesideLane++; break; }
          } }
        }
        return out;
      } };
  };
})();
