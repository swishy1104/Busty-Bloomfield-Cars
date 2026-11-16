/* Bloomfield Drift — hero plug-ins (heroes.js kit) for the two places the roads out of town (routes.js) lead to, modelled on the footprints,
   lidar heights and lidar pavement in corridors.js (window.BLOOMFIELD_CORRIDORS). There are no photos of either yet, so both stay plain.
   - The property at the end of SR 157 (north corridor, its dest building): an L-shaped ranch as the 1 m lidar measures it (wall tops 200.1 m,
     a hip-roofed wing with its ridge north-south at 203.0 m, a gabled block west of it at 202.05 m; the ground falls 2 m to the east, so the
     wing has a walkout basement on the east and the garage under its south end, facing the lidar's paved apron), vinyl siding, shingles, a
     stoop at the front door in the inside corner of the L where Overture's driveway ends (routes.js draws the driveway and the paving), a
     propane tank; the three outbuildings north of it (footprints within 120 m) as a red gable barn, a steel pole barn and a shed.
   - Taco Bell, 1459 NE A St, Linton (west corridor, the footprint Overture names): the brand's present-day single-storey box on the real
     11 x 20.3 m footprint, rendered walls on a dark base, a flat roof with a parapet (lidar 4.3 m), the entrance tower (5.9 m) and a purple
     raised parapet over the side door where the lidar has them, storefront glass with the dining room behind it, concrete walks round it,
     the drive-thru round the back and up the east side (menu board where the lidar has a 3 m object behind the building, pickup window
     under a canopy, lane line and arrows), striped bays on the three Overture parking rows, lot lights on the lidar's 8 m poles, the pole
     sign at the lidar's 15.8 m sign (the canopy model's "tree" on it is removed). Signs are plain "Taco Bell" text panels, no logos; the
     menu board is abstract.
   Dusk: the house windows and lamps light with the town's (heroes.js material), the Taco Bell's lettering and glass are backlit, and
   additive pools of lamplight lie on the ground under the lamps and lot lights.
   Public: BD.heroPlugins entries 'dest-north' and 'dest-tacobell' (footprints: [], these are corridor buildings, not town ones); nothing
   else. heroes.js's meshes are drawn from everywhere, so each destination moves what the kit drew into meshes of its own (heroes.js's two
   materials, bound on the first frame), shown only within 2.6 km: 3 meshes each (kit, lettering or roofs, light pools), about 2,200 and
   1,800 triangles. routes.js's plain shells of the replaced footprints and its stand-in pole sign are folded away (degenerate triangles);
   the footprint walls are already solid in routes.js, the extra solids (posts, poles, board, tank, stoop) go in a W.collide wrapper because
   routes.js seals its strip grids before the heroes build. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {}), CD = window.BLOOMFIELD_CORRIDORS;
  if (!CD || !CD.corridors) return;
  const corr = (id) => CD.corridors.find((c) => c.id === id);
  let stub = null;

  // the frame: a along the footprint's most east-west edge (b north), origin at its min corner, as heroes.js frames a town footprint
  function frameOf(p) {
    let e = [1, 0], best = -1;
    for (let k = 0; k < p.length; k += 2) { const j = (k + 2) % p.length, dx = p[j] - p[k], dy = p[j + 1] - p[k + 1], L = Math.hypot(dx, dy); if (L > 0.5 && Math.abs(dx) / L > best) { best = Math.abs(dx) / L; e = dx < 0 ? [-dx / L, -dy / L] : [dx / L, dy / L]; } }
    let a0 = 1e9, b0 = 1e9; for (let k = 0; k < p.length; k += 2) { a0 = Math.min(a0, p[k] * e[0] + p[k + 1] * e[1]); b0 = Math.min(b0, -p[k] * e[1] + p[k + 1] * e[0]); }
    return { at: [a0 * e[0] - b0 * e[1], a0 * e[1] + b0 * e[0]], dir: e };
  }
  // a corridor ring [x, y, ...] (map) in the kit's frame, counter-clockwise, closing point dropped
  function local(K, p) {
    const r = []; for (let k = 0; k < p.length; k += 2) r.push(K.toLocal(p[k], -p[k + 1]));
    if (r.length > 3 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.05) r.pop();
    let A = 0; r.forEach((q, i) => { const s = r[(i + 1) % r.length]; A += q[0] * s[1] - s[0] * q[1]; }); return A < 0 ? r.reverse() : r;
  }
  const worldRing = (p) => { const r = []; for (let k = 0; k < p.length; k += 2) r.push([p[k], -p[k + 1]]); return r; };
  // the outward side of edge i of a counter-clockwise ring (a east, b north)
  const side = (r, i) => { const p = r[i], q = r[(i + 1) % r.length], da = q[0] - p[0], db = q[1] - p[1]; return Math.abs(da) > Math.abs(db) ? (da > 0 ? 'S' : 'N') : (db > 0 ? 'E' : 'W'); };
  // inside a world ring [[X, Z], ...] or within m of its outline
  function inRing(r, X, Z, m) {
    let inside = false, d = 1e9;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, az] = r[j], [bx, bz] = r[i], ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1)));
      if ((az > Z) !== (bz > Z) && X < ax + (Z - az) / (bz - az) * ex) inside = !inside;
      d = Math.min(d, Math.hypot(X - ax - ex * t, Z - az - ez * t));
    }
    return inside || d < m;
  }

  // ---------- a destination draws into meshes of its own ----------
  function begin(K) {
    const W = B.game && B.game.world, scene = B.game && B.game.scene;
    if (!W || !scene || !W.corridors) return null;      // no roads out of town (routes.js missing or failed): nothing out here is seen
    return { K, W, scene, U: B.util, mark: [K.hb, K.rb].map((b) => [b.pos.length, b.idx.length]), sb: B.util.Buf(), pb: B.util.Buf(), solid: [] };
  }
  // pools of lamplight on the ground (additive, dusk only), one material for both places
  let pmat = null;
  function pool(D, a, b, ra, rb = ra) {
    const { K, W, U } = D, n = 4, at = (i, j) => { const u = a + ra * (2 * i / n - 1), v = b + rb * (2 * j / n - 1); return K.P(u, v, K.G(u, v) + 0.1); };
    if (!pmat) {
      const tex = U.canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
      pmat = new T.MeshBasicMaterial({ map: tex, color: U.lin(0xffe2b0), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const g0 = W.windowGlow; W.windowGlow = (v) => { if (g0) g0(v); pmat.opacity = U.clamp((v - 0.3) / 0.9, 0, 1) * 0.55; };
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K.poly(D.pb, [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], [0, 1, 0], K.WHITE, [[i / n, j / n], [(i + 1) / n, j / n], [(i + 1) / n, (j + 1) / n], [i / n, (j + 1) / n]]);
  }
  const take = (b, [p0, i0]) => { const v0 = p0 / 3, o = { pos: b.pos.splice(p0), nor: b.nor.splice(p0), col: b.col.splice(p0), uv: b.uv.splice(v0 * 2), idx: b.idx.splice(i0) }; for (let k = 0; k < o.idx.length; k++) o.idx[k] -= v0; return o; };
  function finish(D, X, Z, mat) {
    const { K, W, scene, U } = D, ms = [];
    for (const [b, m] of [[take(K.hb, D.mark[0]), 0], [take(K.rb, D.mark[1]), 1], [D.sb, mat], [D.pb, pmat]]) {
      if (!b.idx.length) continue;
      const mesh = new T.Mesh(U.bufGeo(b), typeof m === 'number' ? (stub = stub || new T.MeshLambertMaterial({ vertexColors: true })) : m);
      mesh.userData.heroMat = m; mesh.name = 'hero-dest'; mesh.castShadow = typeof m === 'number'; mesh.receiveShadow = m !== pmat; mesh.visible = false; scene.add(mesh); ms.push(mesh);
    }
    const pm = ms.find((m) => m.material === pmat);
    let bound = false, on = false;
    W.animated.push((t, dt, cam) => {
      // ponytail: heroes.js's materials found by order (its facade mesh first, roofs second); heroes.js exposing them would be sturdier
      if (!bound) { bound = true; const c = scene.children, i = c.map((o) => o.name === 'heroes' && !!(o.material && o.material.emissiveMap)).lastIndexOf(true), h = i < 0 ? [] : [c[i], c[i + 1]]; for (const m of ms) { const s = h[m.userData.heroMat]; if (typeof m.userData.heroMat === 'number' && s && s.name === 'heroes') { m.material = s.material; m.customDepthMaterial = s.customDepthMaterial; } } }      // heroes.js's facade (the only 'heroes' mesh with a glow map) and its roof mesh right after it; other hero files add 'heroes' meshes before them
      const v = Math.hypot(cam.position.x - X, cam.position.z - Z) < 2600; if (v !== on) { on = v; for (const m of ms) m.visible = v; }
      if (pm) pm.visible = on && pmat.opacity > 0;
    });
    solids(W, D.solid);
  }
  // extra solids [X, Z, r, ...]: the footprint walls are routes.js's, whose strip grids are sealed before the heroes build
  function solids(W, s) {
    if (!s.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < s.length; k += 3) { x0 = Math.min(x0, s[k]); x1 = Math.max(x1, s[k]); z0 = Math.min(z0, s[k + 1]); z1 = Math.max(z1, s[k + 1]); }
    const bc = W.buildCollision, hit = { nx: 0, nz: 0, depth: 0 };
    W.buildCollision = function () {
      bc.call(W); const c0 = W.collide;
      W.collide = (X, Z, r) => {
        const a = c0(X, Z, r); if (X < x0 - 8 || X > x1 + 8 || Z < z0 - 8 || Z > z1 + 8) return a;
        hit.depth = 0;
        for (let k = 0; k < s.length; k += 3) { const dx = X - s[k], dz = Z - s[k + 1], d = Math.hypot(dx, dz), pen = r + s[k + 2] - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
        return hit.depth > 0 && (!a || hit.depth > a.depth) ? hit : a;
      };
    };
  }
  // routes.js's stand-ins (its plain shells on the footprints, the Taco Bell's yellow pole panel): their triangles fold to nothing
  // ponytail: folded, not removed (their vertices stay in routes.js's cell meshes); a skip list in routes.js, like BD.heroSkip, if it matters
  function fold(scene, kinds, X, Z, R, hit) {
    for (const m of scene.children) {
      if (!kinds.includes(m.name) || !m.geometry || !m.geometry.index) continue;
      const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const s = g.boundingSphere; if (Math.hypot(s.center.x - X, s.center.z - Z) > s.radius + R) continue;
      const p = g.attributes.position.array, ix = g.index.array; let n = 0;
      for (let k = 0; k < ix.length; k += 3) { const a = 3 * ix[k], b = 3 * ix[k + 1], c = 3 * ix[k + 2]; if (hit((p[a] + p[b] + p[c]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3)) { ix[k + 1] = ix[k + 2] = ix[k]; n++; } }
      if (n) g.index.needsUpdate = true;
    }
  }

  // ---------- builders on the kit ----------
  // walls round a counter-clockwise ring in layers [[ya, yb, col, mat], ...] (or layers(w, p, q) per edge), with openings
  // [side, at (the wall's own a or b, null = any), from, to (along the wall, in a or b), y0, y1, draw(w, s0, s1, y0, y1)] cut through every layer
  function shell(K, ring, layers, open) {
    return ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length], sd = side(ring, i), k = sd === 'N' || sd === 'S' ? 0 : 1, w = K.Seg(p[0], p[1], q[0], q[1]), hs = [];
      const sOf = (x) => (x - p[k]) / (q[k] - p[k]) * w.L;
      for (const o of open) if (o[0] === sd && (o[1] === null || Math.abs(p[1 - k] - o[1]) < 1.5)) { const s0 = sOf(o[2]), s1 = sOf(o[3]); hs.push([Math.min(s0, s1), Math.max(s0, s1), o[4], o[5], o[6]]); }
      // only the holes that reach into a layer: K.wall fills a hole's column from the layer's foot to the hole's sill, past the layer's top
      for (const [ya, yb, col, mat] of typeof layers === 'function' ? layers(w, p, q) : layers) K.wall(w, 0, w.L, ya, yb, hs.filter((h) => h[2] < yb && h[3] > ya), col, ya, mat);
      for (const h of hs) h[4](w, h[0], h[1], h[2], h[3]);
      w.side = sd; w.p = p; w.q = q; return w;
    });
  }
  // box centred (ca, cb) with half sizes hu along the unit (ua, ub) and hv across it, y0..y1 (sides and top)
  function obox(K, buf, ca, cb, ua, ub, hu, hv, y0, y1, col) {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [ca + ua * hu * i - ub * hv * j, cb + ub * hu * i + ua * hv * j]);
    for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; K.poly(buf, [K.P(p[0], p[1], y0), K.P(q[0], q[1], y0), K.P(q[0], q[1], y1), K.P(p[0], p[1], y1)], K.N((q[1] - p[1]) / l, -(q[0] - p[0]) / l, 0), col); }
    K.poly(buf, c.map((p) => K.P(p[0], p[1], y1)), [0, 1, 0], col);
  }
  // horizontal cylinder (a tank) from (a0, b0) to (a1, b1), axis at height y, capped
  function tank(K, a0, b0, a1, b1, y, r, col) {
    const L = Math.hypot(a1 - a0, b1 - b0), ua = (a1 - a0) / L, ub = (b1 - b0) / L, n = 12, at = (a, b, i) => { const t = i / n * 2 * Math.PI; return K.P(a - ub * Math.cos(t) * r, b + ua * Math.cos(t) * r, y + Math.sin(t) * r); };
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * 2 * Math.PI; K.poly(K.hb, [at(a0, b0, i), at(a1, b1, i), at(a1, b1, i + 1), at(a0, b0, i + 1)], K.N(-ub * Math.cos(t), ua * Math.cos(t), Math.sin(t)), col); }
    K.poly(K.hb, [...Array(n)].map((_, i) => at(a0, b0, i)), K.N(-ua, -ub, 0), col); K.poly(K.hb, [...Array(n)].map((_, i) => at(a1, b1, i)), K.N(ua, ub, 0), col);
  }
  // a lamp on wall w: dark housing, a lit lens (the atlas's LIT texel glows at dusk)
  function lamp(K, w, s, y) {
    const [u0, v0, u1, v1] = K.uvr(K.R.LIT, 4); w.box(s - 0.09, s + 0.09, 0, 0.1, y - 0.15, y + 0.15, K.C(0x2a2a2a), true);
    K.poly(K.hb, [w.pt(s - 0.06, 0.105, y - 0.11), w.pt(s + 0.06, 0.105, y - 0.11), w.pt(s + 0.06, 0.105, y + 0.09), w.pt(s - 0.06, 0.105, y + 0.09)], w.n, K.C(0xfff4dc), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  // paint on the ground: a stripe wd wide from (a0, b0) to (a1, b1), draped in 2 m pieces just above the lot
  function paint(K, a0, b0, a1, b1, wd, col) {
    const L = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.ceil(L / 2)), na = -(b1 - b0) / L * wd / 2, nb = (a1 - a0) / L * wd / 2, at = (a, b) => K.P(a, b, K.G(a, b) + 0.06);
    for (let k = 0; k < n; k++) { const pa = a0 + (a1 - a0) * k / n, pb = b0 + (b1 - b0) * k / n, qa = a0 + (a1 - a0) * (k + 1) / n, qb = b0 + (b1 - b0) * (k + 1) / n;
      K.poly(K.hb, [at(pa - na, pb - nb), at(qa - na, qb - nb), at(qa + na, qb + nb), at(pa + na, pb + nb)], [0, 1, 0], col); }
  }
  // a gabled roof on a rotated rectangle q (q0 -> q1 and q2 -> q3 the eaves): two planes, their undersides, a fascia
  function gableRoof(K, q, ye, rise, over, col, under) {
    const sub = (p, r) => [p[0] - r[0], p[1] - r[1]], len = (v) => Math.hypot(v[0], v[1]), L = len(sub(q[1], q[0])), Wd = len(sub(q[3], q[0]));
    const u = sub(q[1], q[0]).map((v) => v / L), v = sub(q[3], q[0]).map((x) => x / Wd), k = rise / (Wd / 2), yo = ye - over * k, yr = ye + rise;
    const at = (p, du, dv) => [p[0] + u[0] * du + v[0] * dv, p[1] + u[1] * du + v[1] * dv], m0 = at(q[0], 0, Wd / 2), m1 = at(q[1], 0, Wd / 2);
    for (const [e0, e1, r0, r1] of [[at(q[0], -over, -over), at(q[1], over, -over), at(m1, over, 0), at(m0, -over, 0)], [at(q[2], over, over), at(q[3], -over, over), at(m0, -over, 0), at(m1, over, 0)]]) {
      const pts = [K.P(e0[0], e0[1], yo), K.P(e1[0], e1[1], yo), K.P(r0[0], r0[1], yr), K.P(r1[0], r1[1], yr)], a = pts[0], b = pts[1], c = pts[3];
      let n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const l = Math.hypot(...n) * (n[1] < 0 ? -1 : 1); n = n.map((x) => x / l);
      K.poly(K.hb, pts.map((p) => [p[0], p[1] + 0.1, p[2]]), n, col); K.poly(K.hb, pts, n.map((x) => -x), under);
      K.poly(K.hb, [pts[0], pts[1], [pts[1][0], pts[1][1] + 0.1, pts[1][2]], [pts[0][0], pts[0][1] + 0.1, pts[0][2]]], K.N((e1[1] - e0[1]) / len(sub(e1, e0)), -(e1[0] - e0[0]) / len(sub(e1, e0)), 0), under);
    }
    return yr;
  }

  // ---------- the property at the end of SR 157 ----------
  function north(K, c) {
    const D = begin(K); if (!D) return;
    const { G, C } = K, hi = c.dest.buildings[0], bd = c.buildings[hi], ring = local(K, bd.p);
    // the L: the reflex corner gives the wing's west wall (ai) and the main block's south wall (bi); the notch is the south-west quarter
    const ri = ring.findIndex((p, i) => { const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) < 0; });
    if (ring.length !== 6 || ri < 0) throw new Error('dest-north: expected the L-shaped footprint');
    const [ai, bi] = ring[ri], as = ring.map((p) => p[0]), bs = ring.map((p) => p[1]), A0 = Math.min(...as), A1 = Math.max(...as), B0 = Math.min(...bs), B1 = Math.max(...bs);
    // lidar (1 m): wall tops 200.1 m and ground 196.42 m at the centroid; floor 0.3-0.9 m above the front grade
    const YE = bd.f + 3.7, F = bd.f + 0.8, SID = C(0xe4dccb), CONC = C(0xa9a59c), SHUT = C(0x2e3833), GREY = C(0x8d8f8e);
    const gMin = (p, q) => { let m = 1e9; for (let t = 0; t <= 1.0001; t += 0.1) m = Math.min(m, G(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)); return m; };
    const win = (w, s0, s1, y0, y1) => { K.opening(w, s0, s1, y0, y1, 'S6'); };
    const shut = (w, s0, s1, y0, y1) => { win(w, s0, s1, y0, y1); w.box(s0 - 0.5, s0 - 0.14, 0, 0.05, y0, y1, SHUT); w.box(s1 + 0.14, s1 + 0.5, 0, 0.05, y0, y1, SHUT); };
    const ad = ai - 2.7, gb = G(A1 + 1.5, B0 + 10.5) + 0.05, gd = G(A1 - 4.25, B0 - 1) + 0.05;      // front door; basement and garage floors (east, low side)
    const S6 = [F + 0.9, F + 2.3];
    const open = [
      ['W', A0, B1 - 3.1, B1 - 2.2, ...S6, shut], ['W', A0, bi + 2.2, bi + 3.1, ...S6, shut],
      ['S', bi, A0 + 1.8, A0 + 2.7, ...S6, shut], ['S', bi, A0 + 5.0, A0 + 5.9, ...S6, shut],
      ['S', bi, ad - 0.48, ad + 0.48, F, F + 2.05, (w, s0, s1, y0, y1) => { K.opening(w, s0, s1, y0, y1, 'DOOR', { door: true, col: C(0x8a3228) }); lamp(K, w, s1 + 0.35, F + 1.75); }],
      ['W', ai, B0 + 6.2, B0 + 7.1, ...S6, shut], ['W', ai, B0 + 2.4, B0 + 3.3, ...S6, win],
      ['S', B0, ai + 2.0, ai + 2.9, ...S6, win],
      ['S', B0, A1 - 6.7, A1 - 1.8, gd, gd + 2.15, (w, s0, s1, y0, y1) => { K.opening(w, s0, s1, y0, y1, 'PLN', { door: true, col: C(0xf4f2ec) }); for (let k = 1; k < 4; k++) w.box(s0, s1, -0.06, -0.035, y0 + k * 0.54, y0 + k * 0.54 + 0.03, C(0xb9b8b2)); lamp(K, w, s1 + 0.4, y1 + 0.25); }],
      ['E', A1, B0 + 2.9, B0 + 3.8, ...S6, win], ['E', A1, B0 + 9.9, B0 + 10.8, ...S6, win], ['E', A1, B0 + 15.9, B0 + 16.8, ...S6, win],
      ['E', A1, B0 + 4.4, B0 + 5.3, gb + 0.9, gb + 1.85, (w, s0, s1, y0, y1) => K.opening(w, s0, s1, y0, y1, 'S1')],
      ['E', A1, B0 + 14.6, B0 + 15.5, gb + 0.9, gb + 1.85, (w, s0, s1, y0, y1) => K.opening(w, s0, s1, y0, y1, 'S1')],
      ['E', A1, B0 + 9.4, B0 + 11.2, gb, gb + 2.05, (w, s0, s1, y0, y1) => { K.opening(w, s0, s1, y0, y1, 'PANE', { door: true, split: 2 }); lamp(K, w, s1 + 0.35, y1 - 0.2); }],
      ['N', B1, A0 + 2.0, A0 + 2.9, ...S6, win], ['N', B1, A0 + 6.4, A0 + 7.3, ...S6, win], ['N', B1, A0 + 11.4, A0 + 12.4, F + 1.2, F + 2.3, (w, s0, s1, y0, y1) => K.opening(w, s0, s1, y0, y1, 'S1')],
      ['N', B1, A0 + 16.0, A0 + 16.9, ...S6, win], ['N', B1, A0 + 21.2, A0 + 22.1, ...S6, win],
    ];
    const walls = shell(K, ring, (w, p, q) => { const base = Math.min(F - 0.15, gMin(p, q) + 0.4); return [[gMin(p, q) - 0.3, base, CONC, 'plain'], [base, YE, SID, 'siding']]; }, open);
    // roofs (lidar pitch 0.44): the wing a hip with its ridge north-south; the block west of it a gable whose east end dies into the wing's roof, 3 cm low so its north slope never fights the wing's north hip
    K.hip(false, B0, B1, ai, A1, YE, 2.9, 0.45);
    K.roof(true, A0 - 0.45, ai + 4.6, bi, B1, YE - 0.03, 2.0, 0.45, { gutter: 'both', rakes: [[A0 - 0.45, A0]] });
    const ww = walls.find((w) => w.side === 'W' && Math.abs(w.p[0] - A0) < 1.5); K.gable(ww, 0, ww.L, YE, YE + 1.97, SID, YE);
    // the stoop in the inside corner, where the driveway ends
    const gs = G(ad, bi - 1.6), top = F - 0.18; K.box(ad - 1.1, ad + 1.1, bi - 1.6, bi, gs - 0.2, top, CONC);
    for (let k = 1, y = top - 0.18; y > gs + 0.05 && k < 6; k++, y -= 0.18) K.box(ad - 0.9, ad + 0.9, bi - 1.6 - 0.3 * k, bi - 1.6 - 0.3 * (k - 1), G(ad, bi - 1.6 - 0.3 * k) - 0.2, y, CONC);
    { const p = K.P(ad, bi - 0.9, 0); D.solid.push(p[0], p[2], 1.0); }
    // a 500-gallon propane tank off the north wall
    const ta = A0 + 6, tb = B1 + 4, tg = G(ta, tb);
    for (const da of [-0.9, 0.9]) K.box(ta + da - 0.2, ta + da + 0.2, tb - 0.3, tb + 0.3, tg - 0.1, tg + 0.35, CONC);
    tank(K, ta - 1.45, tb, ta + 1.45, tb, tg + 0.85, 0.5, C(0xe9e8e2));
    for (const da of [-0.8, 0.8]) { const p = K.P(ta + da, tb, 0); D.solid.push(p[0], p[2], 0.55); }
    pool(D, ad, bi - 1.8, 2.8); pool(D, A1 - 4.25, B0 - 2.6, 3.6, 2.8); pool(D, A1 + 2.3, B0 + 10.3, 2.6);     // under the porch, garage and patio lamps

    // the outbuildings north of the house: the biggest pitched one a red gable barn, a low or flat one a steel pole barn, a small one a shed
    const cxy = (b) => { let x = 0, y = 0, n = b.p.length / 2; for (let k = 0; k < b.p.length; k += 2) { x += b.p[k]; y += b.p[k + 1]; } return [x / n, y / n]; };
    const near = c.buildings.map((b, i) => [b, i]).filter(([b, i]) => i !== hi && b.p.length === 8 && Math.hypot(cxy(b)[0] - c.dest.x, cxy(b)[1] - c.dest.y) < 120);
    const house = K.toLocal(c.dest.x, -c.dest.y);
    for (const [b] of near) {
      const r = local(K, b.p), d01 = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), d12 = Math.hypot(r[2][0] - r[1][0], r[2][1] - r[1][1]);
      const q = (d01 >= d12) !== (b.t === 2) ? r : [r[1], r[2], r[3], r[0]], area = d01 * d12;
      const kind = area < 70 ? 'shed' : b.r >= 1.5 ? 'barn' : 'pole';
      let lo = 1e9, hi2 = -1e9; for (const p of q) { const g = G(p[0], p[1]); lo = Math.min(lo, g); hi2 = Math.max(hi2, g); }
      const ye = Math.max(hi2 + 2.6, b.f + (b.e > 0.5 ? b.e : 3.2) - (kind === 'barn' ? 0.6 : 0)), rise = kind === 'barn' ? Math.max(2.4, b.r) : Math.max(0.9, Math.min(b.r, 1.4));
      const col = C(kind === 'barn' ? 0x8b2e24 : kind === 'pole' ? 0xc8c1b0 : 0xe2ddd2), trim = C(kind === 'pole' ? 0x6f6a60 : 0xf0eee8), roofc = C(kind === 'barn' ? 0x5c5f61 : kind === 'pole' ? 0x8a8f91 : 0x4f5356);
      const segs = K.walls(q, lo - 0.3, ye, { col, mat: 'plain' });
      for (const k of [1, 3]) K.gable(segs[k], 0, segs[k].L, ye, ye + rise, col, ye, 'plain');
      for (const w of segs) { w.box(-0.06, 0.1, 0, 0.05, lo - 0.1, ye, trim); w.box(w.L - 0.1, w.L + 0.06, 0, 0.05, lo - 0.1, ye, trim); }
      gableRoof(K, q, ye, rise, 0.3, roofc, C(0x9a958a));
      // its door on the wall facing the house: a gable end for the barn, a long side for the others
      const cands = (kind === 'barn' ? [1, 3] : [0, 2]).map((k) => segs[k]), m = (w) => { const p = w.pt(w.L / 2, 0, 0), l = K.toLocal(p[0], p[2]); return Math.hypot(l[0] - house[0], l[1] - house[1]); };
      const w = cands.sort((x, y) => m(x) - m(y))[0], dw = kind === 'shed' ? 0.95 : Math.min(kind === 'barn' ? 3.6 : 3.7, w.L - 2), dh = kind === 'shed' ? 2.05 : Math.min(3.2, ye - hi2 - 0.3), s0 = w.L / 2 - dw / 2, dp = w.pt(w.L / 2, 0, 0), gy = G(...K.toLocal(dp[0], dp[2])) + 0.02;
      w.box(s0, s0 + dw, 0, 0.06, gy, gy + dh, kind === 'barn' ? C(0x7a281f) : C(0xeceae4));
      w.box(s0 - 0.12, s0 + dw + 0.12, 0, 0.09, gy + dh, gy + dh + 0.12, trim, true); w.box(s0 - 0.12, s0, 0, 0.09, gy, gy + dh, trim); w.box(s0 + dw, s0 + dw + 0.12, 0, 0.09, gy, gy + dh, trim);
      if (kind === 'pole') for (let k = 1; k < 5; k++) w.box(s0, s0 + dw, 0.06, 0.075, gy + k * dh / 5, gy + k * dh / 5 + 0.03, C(0xbdbab2));
      if (kind === 'barn') { lamp(K, w, w.L / 2, gy + dh + 0.45); const o = w.pt(w.L / 2, 2.6, 0), l = K.toLocal(o[0], o[2]); pool(D, l[0], l[1], 3.2); }
    }
    // routes.js's plain shells of the house and these outbuildings fold away
    const rings = [bd].concat(near.map((n) => n[0])).map((b) => worldRing(b.p));
    fold(D.scene, ['rt:bldg'], c.dest.x, -c.dest.y, 160, (X, Z) => rings.some((r) => inRing(r, X, Z, 0.6)));
    finish(D, c.dest.x, -c.dest.y, null);
  }

  // ---------- Taco Bell lettering: plain text, no logos; the glow copy is what is lit at dusk ----------
  const L = { POLE: [0, 0, 512, 208], BAND: [0, 208, 512, 112], DT: [0, 320, 256, 96], MENU: [512, 0, 512, 224], DINE: [512, 224, 512, 288] };
  const luv = (r) => [(r[0] + 2) / 1024, 1 - (r[1] + r[3] - 2) / 512, (r[0] + r[2] - 2) / 1024, 1 - (r[1] + 2) / 512];
  function lettering(g, glow) {
    const U = B.util, PUR = glow ? '#9a3cb4' : '#6c1f80';
    const panel = (r, s, px) => { const [x, y, w, h] = r; g.fillStyle = PUR; g.fillRect(x, y, w, h); g.strokeStyle = glow ? '#d8a8e8' : '#efe6f2'; g.lineWidth = 5; g.strokeRect(x + 9, y + 9, w - 18, h - 18);
      U.fit(g, s, w - 60, px, U.TEXT_FONT); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x + w / 2, y + h / 2 + 3); };
    panel(L.POLE, 'Taco Bell', 150); panel(L.BAND, 'Taco Bell', 92); panel(L.DT, 'DRIVE THRU', 56);
    { const [x, y, w, h] = L.MENU, C = ['#b8742a', '#d9a441', '#7d9b3c', '#b3392b', '#e2b860', '#8e5a2a'];      // the menu board: items as pictures and bars, no words
      g.fillStyle = '#141216'; g.fillRect(x, y, w, h); g.fillStyle = PUR; g.fillRect(x + 8, y + 8, w - 16, 30);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const bx = x + 14 + i * 164, by = y + 48 + j * 86; g.fillStyle = glow ? '#3d3742' : '#25212a'; g.fillRect(bx, by, 154, 78);
        g.fillStyle = C[(i + 3 * j) % 6]; g.beginPath(); g.ellipse(bx + 40, by + 40, 30, 21, 0, 0, 7); g.fill();
        g.fillStyle = glow ? '#ffffff' : '#cfcad4'; for (let k = 0; k < 3; k++) g.fillRect(bx + 82, by + 20 + k * 18, 58 - k * 14, 6); } }
    { const [x, y, w, h] = L.DINE;      // the dining room through the glass: back wall, ceiling lights, tables and chairs
      g.fillStyle = glow ? '#6b4a36' : '#202327'; g.fillRect(x, y, w, h);
      g.fillStyle = glow ? '#8a3e9c' : '#2f2536'; g.fillRect(x, y + h * 0.22, w * 0.42, h * 0.46); g.fillStyle = glow ? '#d2ab80' : '#34312d'; g.fillRect(x + w * 0.42, y + h * 0.22, w * 0.58, h * 0.46);
      g.fillStyle = glow ? '#fff2cc' : '#5b6067'; for (let i = 0; i < 6; i++) g.fillRect(x + 28 + i * 82, y + 18, 44, 7);
      g.fillStyle = glow ? '#3b2619' : '#131416'; for (let i = 0; i < 5; i++) { const tx = x + 24 + i * 100; g.fillRect(tx, y + h * 0.66, 64, 8); g.fillRect(tx + 28, y + h * 0.66, 9, h * 0.22); g.fillRect(tx - 9, y + h * 0.56, 13, h * 0.32); g.fillRect(tx + 60, y + h * 0.56, 13, h * 0.32); }
      g.fillStyle = glow ? '#7a5640' : '#17181a'; g.fillRect(x, y + h * 0.88, w, h * 0.12);
      if (!glow) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(176,196,214,0.6)'); gr.addColorStop(0.55, 'rgba(120,136,152,0.28)'); gr.addColorStop(1, 'rgba(40,46,52,0.2)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo(x + w * 0.18, y); g.lineTo(x + w * 0.44, y); g.lineTo(x + w * 0.26, y + h); g.lineTo(x, y + h); g.fill(); } }
  }

  // ---------- Taco Bell, 1459 NE A St, Linton ----------
  // measured on the 1 m lidar (map coords): the entrance tower's centre on the north wall, the raised west parapet (y range), the 3 m object
  // behind the building (x range: the menu board), rooftop units, the lot's 8-8.6 m single-echo poles
  const TB = { tower: [-18079, 1229.4], west: [-18083.7, 1216.5, 1220.5], menu: [-18078, -18073, 1208.5], hvac: [[-18080.5, -18078, 1221, 1223.2], [-18078.5, -18076.6, 1212, 1214.8]],
    lights: [[-18079, 1197], [-18066, 1212.5], [-18070, 1238.5], [-18100, 1240]] };
  function tacoBell(K, c, bi) {
    const D = begin(K); if (!D) return;
    const { P, G, C } = K, hb = K.hb, sb = D.sb, U = D.U, bd = c.buildings[bi], ring = local(K, bd.p), at = (x, y) => K.toLocal(x, -y);
    const as = ring.map((p) => p[0]), bs = ring.map((p) => p[1]), A0 = Math.min(...as), A1 = Math.max(...as), B0 = Math.min(...bs), B1 = Math.max(...bs);
    let lo = 1e9, hi = -1e9; for (const p of ring) { const g = G(p[0], p[1]); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const F = hi + 0.12, TOP = F + 4.2, PP = 0.38, TW = F + 5.8, WHITE = C(0xffffff);
    const STUCCO = C(0xe7e2d9), BASE = C(0x56555a), CHAR = C(0x2f3034), FRAME = C(0x26272a), PURP = C(0x6c1f80), CONC = C(0xb7b4ac), BRONZE = C(0x3a342e);
    const tc = at(TB.tower[0], TB.tower[1])[0], wc = (at(TB.west[0], TB.west[1])[1] + at(TB.west[0], TB.west[2])[1]) / 2, bw = B1 - 6.0;
    // the lettered material, once per world: backlit faces, a little by day too
    const map = U.canvasTex(1024, 512, (g) => lettering(g, false)), glow = U.canvasTex(1024, 512, (g) => lettering(g, true));
    const mat = new T.MeshLambertMaterial({ map, emissiveMap: glow, emissive: new T.Color(0.15, 0.15, 0.15) });
    const g0 = D.W.windowGlow; D.W.windowGlow = (v) => { if (g0) g0(v); mat.emissive.setScalar(0.15 + 0.85 * Math.min(1, v)); };
    const face = (pts, n, r) => { const [u0, v0, u1, v1] = luv(r); K.poly(sb, pts, n, WHITE, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]); };
    // storefront: glass set 0.12 m in, the dining room behind it, dark aluminium frame and mullions
    const glass = (door) => (w, s0, s1, y0, y1) => {
      const d = 0.12, n = Math.max(1, Math.round((s1 - s0) / 1.6));
      K.poly(hb, [w.pt(s0, 0, y1), w.pt(s1, 0, y1), w.pt(s1, -d, y1), w.pt(s0, -d, y1)], [0, -1, 0], FRAME); K.poly(hb, [w.pt(s0, 0, y0), w.pt(s1, 0, y0), w.pt(s1, -d, y0), w.pt(s0, -d, y0)], [0, 1, 0], FRAME);
      K.poly(hb, [w.pt(s0, 0, y0), w.pt(s0, -d, y0), w.pt(s0, -d, y1), w.pt(s0, 0, y1)], w.t, FRAME); K.poly(hb, [w.pt(s1, 0, y0), w.pt(s1, -d, y0), w.pt(s1, -d, y1), w.pt(s1, 0, y1)], w.t.map((v) => -v), FRAME);
      face([w.pt(s0, -d, y0), w.pt(s1, -d, y0), w.pt(s1, -d, y1), w.pt(s0, -d, y1)], w.n, L.DINE);
      for (let k = 0; k <= n; k++) { const s = s0 + (s1 - s0) * k / n; w.box(Math.max(s0, s - 0.05), Math.min(s1, s + 0.05), -d, -d + 0.07, y0, y1, FRAME); }
      w.box(s0, s1, -d, -d + 0.07, y0, y0 + 0.1, FRAME); w.box(s0, s1, -d, -d + 0.07, y1 - 0.08, y1, FRAME);
      if (door) { w.box(s0, s1, -d, -d + 0.07, y0 + 0.95, y0 + 1.05, C(0x9a9ca0)); w.box(s0, s1, -d, -d + 0.07, y1 - 0.5, y1 - 0.42, FRAME); } else w.box(s0, s1, -d, -d + 0.07, y1 - 0.55, y1 - 0.48, FRAME);
    };
    const GL = [F + 0.5, F + 2.8], DR = [F, F + 2.45];
    const open = [
      ['N', null, A0 + 0.7, tc - 2.6, ...GL, glass(false)], ['N', null, tc - 1.8, tc - 0.95, ...GL, glass(false)], ['N', null, tc - 0.95, tc + 0.95, ...DR, glass(true)],
      ['N', null, tc + 0.95, tc + 1.8, ...GL, glass(false)], ['N', null, tc + 2.6, A1 - 0.7, ...GL, glass(false)],
      ['W', null, B1 - 7.4, B1 - 4.4, ...GL, glass(false)], ['W', null, B1 - 4.0, B1 - 0.8, ...GL, glass(false)], ['W', null, wc - 0.95, wc + 0.95, ...DR, glass(true)],
      ['E', null, bw - 0.85, bw + 0.85, F + 0.95, F + 2.15, glass(false)],
      ['S', null, A0 + 1.4, A0 + 2.4, F, F + 2.15, (w, s0, s1, y0, y1) => { K.opening(w, s0, s1, y0, y1, 'PLN', { door: true, col: C(0x77797c) }); lamp(K, w, s1 + 0.4, y1 + 0.35); }],
    ];
    shell(K, ring, [[lo - 0.3, F + 0.5, BASE, 'plain'], [F + 0.5, TOP + PP, STUCCO, 'plain']], open);
    K.flat(ring, TOP, { parapet: PP, col: C(0x8b8c89), coping: C(0x45464a) });
    // concrete walks round the building (the lidar pavement stops short of the walls): wide at the entrance and the side door, a curb strip along the lane
    const slab = (a0, a1, b0, b1) => K.box(a0, a1, b0, b1, Math.min(G(a0, b0), G(a1, b0), G(a1, b1), G(a0, b1)) - 0.15, F - 0.03, CONC);
    slab(A0 - 1.8, A1 + 0.7, B1, B1 + 2.0); slab(A0 - 1.8, A0, B0 - 0.6, B1); slab(A1, A1 + 0.7, B0 - 0.6, B1); slab(A0, A1, B0 - 0.6, B0);
    for (const [x0, x1, y0, y1] of TB.hvac) { const p = at(x0, y0), q = at(x1, y1); K.box(Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), TOP, TOP + 1.1, C(0xb5b7b5)); }
    // the entrance tower (charcoal, proud of the north wall) and the purple raised parapet over the side door: piers and a head over the door
    const tower = (a0, a1, b0, b1, yb, col, alongA) => { const pw = 0.6, hy = F + 2.95;
      if (alongA) { K.box(a0, a0 + pw, b0, b1, lo - 0.2, yb, col); K.box(a1 - pw, a1, b0, b1, lo - 0.2, yb, col); K.box(a0 + pw, a1 - pw, b0, b1, hy, yb, col, true); }
      else { K.box(a0, a1, b0, b0 + pw, lo - 0.2, yb, col); K.box(a0, a1, b1 - pw, b1, lo - 0.2, yb, col); K.box(a0, a1, b0 + pw, b1 - pw, hy, yb, col, true); }
      K.box(a0 - 0.05, a1 + 0.05, b0 - 0.05, b1 + 0.05, yb, yb + 0.1, C(0x5a5b5f)); };
    tower(tc - 2.5, tc + 2.5, B1 - 1.8, B1 + 0.35, TW, CHAR, true);
    face([P(tc + 1.8, B1 + 0.36, F + 3.75), P(tc - 1.8, B1 + 0.36, F + 3.75), P(tc - 1.8, B1 + 0.36, F + 4.55), P(tc + 1.8, B1 + 0.36, F + 4.55)], K.N(0, 1, 0), L.BAND);
    tower(A0 - 0.3, A0 + 1.6, wc - 2.0, wc + 2.0, F + 5.2, PURP, false);
    face([P(A0 - 0.31, wc + 1.35, F + 3.6), P(A0 - 0.31, wc - 1.35, F + 3.6), P(A0 - 0.31, wc - 1.35, F + 4.18), P(A0 - 0.31, wc + 1.35, F + 4.18)], K.N(-1, 0, 0), L.BAND);
    // canopies: over the front glass, over the pickup window
    K.box(A0 + 0.35, tc - 2.5, B1, B1 + 1.0, F + 2.95, F + 3.12, CHAR, true); K.box(tc + 2.5, A1 - 0.35, B1, B1 + 1.0, F + 2.95, F + 3.12, CHAR, true);
    K.box(A1, A1 + 1.2, bw - 1.5, bw + 1.5, F + 2.6, F + 2.82, CHAR, true);
    pool(D, tc, B1 + 2.6, 7.5, 3.4); pool(D, A0 - 2.6, wc, 3, 5); pool(D, A1 + 2.4, bw, 2.8);      // the lit dining room and the pickup window spill onto the walks

    // the drive-thru: round the back (east-bound), up the east side past the window (the building on the driver's left), out north
    const mb = at(TB.menu[0], TB.menu[2])[0], me = at(TB.menu[1], TB.menu[2])[0], am = (mb + me) / 2 + 0.6, bm = B0 - 0.95, gm = G(am, bm);
    K.box(am - 1.35, am + 1.35, bm - 0.14, bm + 0.14, gm + 0.75, gm + 3.0, CHAR, true);
    for (const da of [-0.9, 0.9]) K.box(am + da - 0.1, am + da + 0.1, bm - 0.1, bm + 0.1, gm - 0.1, gm + 0.75, CHAR);
    face([P(am - 1.22, bm - 0.15, gm + 0.86), P(am + 1.22, bm - 0.15, gm + 0.86), P(am + 1.22, bm - 0.15, gm + 2.38), P(am - 1.22, bm - 0.15, gm + 2.38)], K.N(0, -1, 0), L.MENU);
    face([P(am - 1.1, bm - 0.15, gm + 2.47), P(am + 1.1, bm - 0.15, gm + 2.47), P(am + 1.1, bm - 0.15, gm + 2.93), P(am - 1.1, bm - 0.15, gm + 2.93)], K.N(0, -1, 0), L.BAND);
    K.box(am - 2.7, am - 2.45, bm - 0.12, bm + 0.12, G(am - 2.6, bm) - 0.1, G(am - 2.6, bm) + 1.15, CHAR);     // the order speaker post
    for (const p of [K.P(am - 0.7, bm, 0), K.P(am + 0.7, bm, 0), K.P(am - 2.6, bm, 0)]) D.solid.push(p[0], p[2], 0.45);
    pool(D, am, bm - 1.8, 2.4);
    const LW = C(0xf1f0ea), lb = B0 - 5.3, la = A1 + 4.3;
    paint(K, A0 - 7, lb, la, lb, 0.12, LW); paint(K, la, lb, la, B1 + 2.5, 0.12, LW);
    const arrow = (a, b, ua, ub) => { paint(K, a - ua * 1.2, b - ub * 1.2, a + ua * 0.5, b + ub * 0.5, 0.28, LW);
      const tip = [a + ua * 1.3, b + ub * 1.3], l = [a + ua * 0.4 - ub * 0.55, b + ub * 0.4 + ua * 0.55], r = [a + ua * 0.4 + ub * 0.55, b + ub * 0.4 - ua * 0.55];
      K.poly(hb, [l, r, tip].map((p) => P(p[0], p[1], G(p[0], p[1]) + 0.06)), [0, 1, 0], LW); };
    arrow(A0 + 2.5, B0 - 3.4, 1, 0); arrow(A1 + 2.45, B0 + 4.0, 0, 1);
    // "DRIVE THRU" at the lane's mouth, facing the lot
    { const a = A0 - 2.3, b = B0 - 1.6, g = G(a, b); K.box(a - 0.05, a + 0.05, b - 0.05, b + 0.05, g - 0.1, g + 1.55, C(0x6a6c6f)); K.box(a - 0.02, a + 0.04, b - 0.52, b + 0.52, g + 1.0, g + 1.42, CHAR, true);
      face([P(a - 0.03, b + 0.5, g + 1.02), P(a - 0.03, b - 0.5, g + 1.02), P(a - 0.03, b - 0.5, g + 1.4), P(a - 0.03, b + 0.5, g + 1.4)], K.N(-1, 0, 0), L.DT); const p = K.P(a, b, 0); D.solid.push(p[0], p[2], 0.15); }
    // striped bays on the Overture parking rows: lines across each row every 2.75 m
    for (const pk of c.dest.parking || []) {
      const r = local(K, pk); if (r.length !== 4) continue;
      const u = [r[1][0] - r[0][0], r[1][1] - r[0][1]], v = [r[3][0] - r[0][0], r[3][1] - r[0][1]], [lg, sh] = Math.hypot(...u) >= Math.hypot(...v) ? [u, v] : [v, u], n = Math.max(1, Math.round(Math.hypot(...lg) / 2.75));
      for (let k = 0; k <= n; k++) { const a = r[0][0] + lg[0] * k / n, b = r[0][1] + lg[1] * k / n; paint(K, a, b, a + sh[0] * 0.94, b + sh[1] * 0.94, 0.11, LW); }
    }
    // lot lights on the lidar's poles: concrete base, bronze pole, a shoebox head reaching toward the building, lit underneath
    const [lu0, lv0, lu1, lv1] = K.uvr(K.R.LIT, 4), cm = [(A0 + A1) / 2, (B0 + B1) / 2];
    for (const [x, y] of TB.lights) {
      const [a, b] = at(x, y), g = G(a, b), dx = cm[0] - a, dy = cm[1] - b, l = Math.hypot(dx, dy) || 1, ua = dx / l, ub = dy / l, h = g + 8.0;
      K.box(a - 0.28, a + 0.28, b - 0.28, b + 0.28, g - 0.1, g + 0.6, CONC); K.box(a - 0.08, a + 0.08, b - 0.08, b + 0.08, g + 0.6, h, BRONZE);
      obox(K, hb, a + ua * 0.45, b + ub * 0.45, ua, ub, 0.45, 0.05, h - 0.18, h - 0.08, BRONZE); obox(K, hb, a + ua * 1.15, b + ub * 1.15, ua, ub, 0.36, 0.22, h - 0.26, h - 0.1, BRONZE);
      const hc = [a + ua * 1.15, b + ub * 1.15], q = [[-0.32, -0.18], [0.32, -0.18], [0.32, 0.18], [-0.32, 0.18]].map(([s, t]) => P(hc[0] + ua * s - ub * t, hc[1] + ub * s + ua * t, h - 0.265));
      K.poly(hb, q, [0, -1, 0], C(0xfff6e0), [[lu0, lv0], [lu1, lv0], [lu1, lv1], [lu0, lv1]]); pool(D, hc[0], hc[1], 7.5);
      const p = K.P(a, b, 0); D.solid.push(p[0], p[2], 0.35);
    }
    // the pole sign at the lidar's sign: a cabinet 4.2 x 1.8 m topping out at the measured 15.8 m, faces up and down A St
    { const sg = c.dest.sign, [a, b] = at(sg.x, sg.y), g = G(a, b), rt = c.roads[0].p; let bk = 0, bd2 = 1e9;
      for (let k = 0; k < rt.length - 2; k += 2) { const d = Math.hypot(rt[k] - sg.x, rt[k + 1] - sg.y); if (d < bd2) { bd2 = d; bk = k; } }
      const t0 = at(rt[bk], rt[bk + 1]), t1 = at(rt[bk + 2], rt[bk + 3]), tl = Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) || 1, ta = (t1[0] - t0[0]) / tl, tb = (t1[1] - t0[1]) / tl;
      const ua = tb, ub = -ta, y1 = g + (sg.h || 15.8), y0 = y1 - 1.8;      // the cabinet's width runs across the road, its faces along it
      obox(K, hb, a, b, ua, ub, 0.5, 0.5, g - 0.1, g + 1.2, CONC); obox(K, hb, a, b, ua, ub, 0.28, 0.28, g + 1.2, y0, CHAR); obox(K, hb, a, b, ua, ub, 2.1, 0.32, y0, y1, CHAR);
      for (const sgn of [1, -1]) { const o = 0.33 * sgn, nA = -ub * sgn, nB = ua * sgn, pt = (s, y) => P(a + ua * s + nA * Math.abs(o), b + ub * s + nB * Math.abs(o), y);
        face([pt(2.0 * sgn, y0 + 0.1), pt(-2.0 * sgn, y0 + 0.1), pt(-2.0 * sgn, y1 - 0.1), pt(2.0 * sgn, y1 - 0.1)], K.N(nA, nB, 0), L.POLE); }
      const p = K.P(a, b, 0); D.solid.push(p[0], p[2], 0.45);
      fold(D.scene, ['rt:sign', 'rt:solid'], p[0], p[2], 10, (X, Z) => Math.hypot(X - p[0], Z - p[2]) < 2.6);
      // the canopy model took the sign for a tall thin tree (12.5 m, 2.2 m off): it goes
      for (const m of D.scene.children) if (m.name === 'rt:tree') { const t = m.instanceMatrix.array; let n = 0; for (let k = 0; k < m.count; k++) if (Math.hypot(t[16 * k + 12] - p[0], t[16 * k + 14] - p[2]) < 3.5) { t.fill(0, 16 * k, 16 * k + 16); n++; } if (n) m.instanceMatrix.needsUpdate = true; }
    }
    const r0 = worldRing(bd.p); fold(D.scene, ['rt:bldg'], r0[0][0], r0[0][1], 40, (X, Z) => inRing(r0, X, Z, 0.6));
    finish(D, c.dest.x, -c.dest.y, mat);
  }

  const plugs = [], N = corr('north'), Wc = corr('west');
  if (N && N.dest && N.dest.buildings && N.dest.buildings.length) { const f = frameOf(N.buildings[N.dest.buildings[0]].p); plugs.push({ id: 'dest-north', name: 'The property at the end of SR 157', at: f.at, dir: f.dir, footprints: [], build: (K) => north(K, N) }); }
  const tbi = Wc && Wc.dest && Wc.dest.name ? Wc.buildings.findIndex((b) => b.n === Wc.dest.name) : -1;
  if (tbi >= 0) { const f = frameOf(Wc.buildings[tbi].p); plugs.push({ id: 'dest-tacobell', name: 'Taco Bell, 1459 NE A St, Linton', at: f.at, dir: f.dir, footprints: [], build: (K) => tacoBell(K, Wc, tbi) }); }
  B.heroPlugins = (B.heroPlugins || []).concat(plugs);
})();
