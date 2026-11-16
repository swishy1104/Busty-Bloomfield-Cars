/* Bloomfield Drift — hero plug-ins: three civic buildings west and south of the courthouse square, hand-modelled from the owner's reference
   photos (never from their pixels) on heroes.js's kit (see its header). Public surface: three BD.heroPlugins records, nothing else.
     methodist641  Bloomfield United Methodist Church (1924, 60 W. Main St, footprint 641; 2011 front photo). Dark red-brown brick with
                   limestone trim on a raised basement: the big N-S gable with its traceried drop-arch window and stone-coped parapet gable behind
                   a flat-roofed front wing, the crenellated stone porch with the pointed MEC doorway and steps, the white-trimmed right gable
                   with the pointed traceried window, the square corner tower (lancet louvres, oculus, stone crosses, merlons), the lower
                   E-W gabled east wing (its street front the photo's lighter brick, two storeys under a parapet), the brick sign monument. Big gable (eave 7.0 / ridge 11.9 m) and the sanctuary's E-W ridge (10.7 m at b = 12.5) from the
                   lidar facets; the narrow right gable (apex 8.1 m) and the tower (8.4 m) as the photo measures them, since the lidar
                   facet there is one plane pair fitted over the whole N-S run and carries the sanctuary ridge forward to the street.
     christian636  First Christian Church (Disciples of Christ, 1912, 120 W. Spring St, footprint 636; 2011 corner photo). Red brick, stone
                   belt and lintel courses: the Spring St gable (the footprint's 10 m front projection) and the Jefferson St cross gable,
                   each a fan window over three stained windows; the crenellated bell tower in the footprint's SE notch with an arched
                   doorway on each street face, two small windows a side and an open arched belfry; the lower east wing gable with its four
                   small windows and arched door; the long N-S main roof (lidar ridge 10 m); the south stair, the bell and the sign. The
                   east door opens at grade: the game's S. Jefferson St roadway runs at the tower, where the photo has a stair and a ramp.
     library610    Bloomfield-Eastern Greene County Public Library (125 S. Franklin St, footprint 610; 2012 SW photo, 2013 SE photo): the
                   1911 Carnegie block (limestone base, red brick, pilasters with stone capitals, white double sash windows, wide white
                   boxed eaves on a hip roof, tall chimney), its west entrance bay with the curved stone attic, door hood, stone stair and
                   globe lamps; the flat-roofed link and the modern brick-and-glass addition (hip roof, white entablature, two tall glass
                   curtain walls a side); the PUBLIC LIBRARY sign pier at the Franklin & Mechanic corner.
   Sides and backs that no photo shows are made consistent with the photographed fronts. Stained glass and lettering share one 512 px
   canvas (one small mesh per building, its glass lit with the town's windows at dusk); everything else is on the kit's shared meshes.
   Each build also takes down world.js's roadside name board for its place (the building carries its own sign now), as landmarks.js
   does for hero_fuel.js's stations. Solids beyond the footprints: the porch steps, the Christian tower (the footprint's SE notch) and its
   stairs, the library's entrance bay and stair, the lamps, the bell and the signs.
   Frames: a along the building's street front (east), b north; heights F + h with F the lidar floorY of the footprint. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {}), T = THREE;

  // ---------- the shared canvas: leaded glass (glows at dusk) and the signs (dark at night) ----------
  const S = 512, reg = (x, y, w, h) => [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S];
  const RG = { glassA: reg(0, 0, 128, 256), glassB: reg(128, 0, 128, 256), mec: reg(0, 256, 128, 64), signM: reg(0, 320, 256, 192),
    signC: reg(256, 112, 256, 64), frieze: reg(256, 176, 256, 40), signL: reg(256, 224, 144, 224) };
  let SH = null;
  function leaded(g, x0, y0, w, h, rng, pal, lead, meds, border) {
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip(); g.strokeStyle = lead; g.lineWidth = 1.4;
    const cw = 16, ch = 22;
    for (let j = -1; j <= (2 * h) / ch + 1; j++) for (let i = -1; i <= w / cw + 1; i++) {
      const cx = x0 + i * cw + (j & 1 ? cw / 2 : 0), cy = y0 + (j * ch) / 2;
      g.fillStyle = pal[(rng() * pal.length) | 0]; g.beginPath(); g.moveTo(cx, cy - ch / 2); g.lineTo(cx + cw / 2, cy); g.lineTo(cx, cy + ch / 2); g.lineTo(cx - cw / 2, cy); g.closePath(); g.fill(); g.stroke();
    }
    for (const [mx, my, r, cols] of meds) cols.forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.arc(x0 + mx * w, y0 + my * h, r * (1 - k / cols.length), 0, 7); g.fill(); g.stroke(); });
    if (border) { g.lineWidth = 7; g.strokeStyle = border; g.strokeRect(x0 + 3.5, y0 + 3.5, w - 7, h - 7); g.lineWidth = 2; g.strokeStyle = lead; g.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16); }
    g.restore();
  }
  function shared() {
    if (SH) return SH;
    const U = B.util, W = B.game && B.game.world;
    const draw = (glow) => (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
      const A = glow ? ['#5d7cff', '#6f8cff', '#4060e0', '#ff5a70', '#ffc850', '#50d0a0', '#a070ff'] : ['#9a9ea2', '#8e9498', '#a6a49e', '#949a98', '#a09a94', '#8a9298'];
      const AM = glow ? [['#ffb040', '#ff4060', '#5070ff', '#ffe080'], ['#ff5060', '#40e090', '#ffd060']] : [['#6a5a40', '#5a3a40', '#3a4a6a', '#7a6a50'], ['#5a3a44', '#3e5a4c', '#6a5e40']];
      const Bp = glow ? ['#ffe6a0', '#ffd88a', '#f4f0c0', '#ffeab0', '#ffc870', '#fff0c8'] : ['#a2a496', '#aaa898', '#9ca296', '#aeaa9a', '#a09c8e', '#b2ae9e'];
      const lead = glow ? '#3a2a10' : '#18191c';
      leaded(g, 0, 0, 128, 256, U.mulberry(641), A, lead, [[0.5, 0.3, 22, AM[0]], [0.5, 0.72, 19, AM[1]]], glow ? '#ff7050' : '#56506a');
      leaded(g, 128, 0, 128, 256, U.mulberry(636), Bp, glow ? '#5a4a20' : '#2a2620', [[0.5, 0.5, 24, glow ? ['#ffb050', '#ffe070', '#d0f0a0'] : ['#7a5a3a', '#9a8a50', '#5a6a4a']]], glow ? '#ffb040' : '#7a6a44');
      leaded(g, 0, 256, 128, 64, U.mulberry(642), A, lead, []);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = glow ? '#fff2cc' : '#d8cfb4'; g.font = 'bold 34px ' + U.TEXT_FONT; g.fillText('M  E  C', 64, 292);
      if (glow) return;
      const txt = (s, x, y, maxW, px, font, col) => { U.fit(g, s, maxW, px, font); g.fillStyle = col; g.fillText(s, x, y); };
      // Methodist sign: black board, the header on its frame over a white message panel (the 2011 photo's board and lines)
      g.fillStyle = '#161412'; g.fillRect(0, 320, 256, 192); txt('FIRST METHODIST CHURCH', 128, 340, 220, 22, U.TEXT_FONT, '#e8e2d2');
      g.fillStyle = '#eeece4'; g.fillRect(14, 360, 228, 140); for (const [t, yy, px] of [['REST FOR', 392, 36], ['THE WEARY', 432, 36], ['MATT. 11:25-30', 474, 28]]) txt(t, 128, yy, 212, px, U.TEXT_FONT, '#1a1a1a');
      // First Christian Church: white board, black letters
      g.fillStyle = '#f0eee6'; g.fillRect(256, 112, 256, 64); g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(259, 115, 250, 58);
      txt('FIRST CHRISTIAN CHURCH', 384, 134, 236, 28, U.TEXT_FONT, '#151515'); txt('DISCIPLES OF CHRIST', 384, 160, 200, 20, U.TEXT_FONT, '#151515');
      // the Carnegie attic's carved inscription
      g.fillStyle = '#d6cfbd'; g.fillRect(256, 176, 256, 40); U.fit(g, 'PUBLIC  LIBRARY', 236, 30, U.SIGN_FONT);
      g.fillStyle = '#f2ede0'; g.fillText('PUBLIC  LIBRARY', 385, 197); g.fillStyle = '#8d8676'; g.fillText('PUBLIC  LIBRARY', 384, 196);
      // the sign pier's board
      g.fillStyle = '#f4f2ec'; g.fillRect(256, 224, 144, 224); txt('PUBLIC', 328, 300, 128, 44, U.SIGN_FONT, '#151515'); txt('LIBRARY', 328, 372, 132, 40, U.SIGN_FONT, '#151515');
    };
    const mat = new T.MeshLambertMaterial({ vertexColors: true, map: U.canvasTex(S, S, draw(false)), emissiveMap: U.canvasTex(S, S, draw(true)), emissive: new T.Color(0, 0, 0) });
    if (W) { const g0 = W.windowGlow; W.windowGlow = (v) => { if (g0) g0(v); mat.emissive.setScalar(Math.min(1, v)); }; }
    return (SH = { mat });
  }
  function addMesh(buf) {
    if (!buf.idx.length || !(B.game && B.game.scene)) return;
    const m = new T.Mesh(B.util.bufGeo(buf), shared().mat); m.castShadow = m.receiveShadow = true; m.name = 'heroes'; B.game.scene.add(m);
  }

  // world.js's roadside name board for a place a hero now signs itself: the board goes, its post is folded away and the post's solid parked
  // off the map (what landmarks.js does for hero_fuel.js's stations)
  function unboard(name) {
    const W = B.game && B.game.world, sc = B.game && B.game.scene, p = window.BLOOMFIELD.places.find((q) => q[2] === name); if (!W || !sc || !p) return;
    const X = p[0], Z = -p[1], r = W.nearestRoad(X, Z, 90); if (!r) return;
    const side = ((X - r.x) * r.tz + (Z - r.z) * -r.tx) >= 0 ? 1 : -1, sx = r.x + r.tz * side * (r.hw + 3.6), sz = r.z - r.tx * side * (r.hw + 3.6);
    const near = (x, z, e) => Math.abs(x - sx) < e && Math.abs(z - sz) < e, g = sc.children.find((o) => o.isGroup && near(o.position.x, o.position.z, 0.01)); if (!g) return;
    sc.remove(g); const post = B.util.lin(0x4a4038).getHex();
    for (const o of sc.children) {
      const ix = o.isMesh && !o.isInstancedMesh && o.material.color && o.material.color.getHex() === post && o.geometry.index, ps = ix && o.geometry.attributes.position; if (!ix) continue;
      const on = (i) => near(ps.getX(i), ps.getZ(i), 2);
      for (let k = 0; k < ix.count; k += 3) if (on(ix.getX(k)) && on(ix.getX(k + 1)) && on(ix.getX(k + 2))) { ix.setX(k + 1, ix.getX(k)); ix.setX(k + 2, ix.getX(k)); }
      ix.needsUpdate = true;
    }
    for (let k = 0; k < W.obstacles.length; k += 3) if (near(W.obstacles[k], W.obstacles[k + 1], 0.01)) { W.obstacles[k] = 1e5; W.obstacles[k + 1] = 1e5; }
  }

  // arch points from the left springing (s0, ys) to the right one: 'round' (semicircle), 'point' (two arcs of radius R, default the span:
  // equilateral), 'seg' (segmental, rise R); n even
  function arc(s0, s1, ys, kind, n = 12, R) {
    const hw = (s1 - s0) / 2, sm = s0 + hw, out = [];
    if (kind === 'round') for (let k = 0; k <= n; k++) { const t = Math.PI * (1 - k / n); out.push([sm + hw * Math.cos(t), ys + hw * Math.sin(t)]); }
    else if (kind === 'point') {
      R = R || 2 * hw; const ta = Math.acos((hw - R) / R), h = n / 2;
      for (let k = 0; k <= h; k++) { const t = Math.PI + ((ta - Math.PI) * k) / h; out.push([s0 + R + R * Math.cos(t), ys + R * Math.sin(t)]); }
      for (let k = h - 1; k >= 0; k--) out.push([2 * sm - out[k][0], out[k][1]]);
    } else { const r = R, Rr = (hw * hw + r * r) / (2 * r), t0 = Math.asin(Math.min(1, hw / Rr)), yc = ys + r - Rr; for (let k = 0; k <= n; k++) { const t = -t0 + (2 * t0 * k) / n; out.push([sm + Rr * Math.sin(t), yc + Rr * Math.cos(t)]); } }
    return out;
  }

  // ---------- builders on top of the kit, bound to one hero's frame; mb = this building's own buffer (canvas atlas) ----------
  function ext(K, mb) {
    const C = K.C, hb = K.hb, up = [0, 1, 0], dn = [0, -1, 0], neg = (v) => v.map((x) => -x), WH1 = new T.Color(1, 1, 1);
    const mid = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], LIT = mid(K.uvr(K.R.LIT, 8)), PANE = mid(K.uvr(K.R.PANE, 8));
    const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    // wall lines keep their ends so they can be offset; outward is to the right of travel
    const seg = (a0, b0, a1, b1) => Object.assign(K.Seg(a0, b0, a1, b1), { e: [a0, b0, a1, b1] });
    const at = (w, s, d) => { const [a0, b0, a1, b1] = w.e, ua = (a1 - a0) / w.L, ub = (b1 - b0) / w.L; return [a0 + ua * s + ub * d, b0 + ub * s - ua * d]; };
    const off = (w, d) => { const p = at(w, 0, d), q = at(w, w.L, d); return seg(p[0], p[1], q[0], q[1]); };
    const inPlane = (w, ns, ny) => unit([w.t[0] * ns, ny, w.t[2] * ns]);
    function fillPoly(w, sy, d, fill, s0, s1, ya, yt, tint) {
      if (!fill || fill === 'open') return;
      const p3 = sy.map((p) => w.pt(p[0], d, p[1]));
      if (fill === 'pane' || fill === 'lit') { const t = fill === 'pane' ? PANE : LIT; K.poly(hb, p3, w.n, tint || WH1, sy.map(() => t)); }
      else if (RG[fill]) { const r = RG[fill]; K.poly(mb, p3, w.n, tint || WH1, sy.map((p) => [r[0] + ((r[2] - r[0]) * (p[0] - s0)) / (s1 - s0), r[1] + ((r[3] - r[1]) * (p[1] - ya)) / (yt - ya)])); }
      else K.poly(hb, p3, w.n, fill);
    }
    // quads between two point lists (an arch band, a ring) on wall w at depth d
    function band(w, pin, pout, d, col) { for (let k = 0; k < pin.length - 1; k++) K.poly(hb, [w.pt(pin[k][0], d, pin[k][1]), w.pt(pin[k + 1][0], d, pin[k + 1][1]), w.pt(pout[k + 1][0], d, pout[k + 1][1]), w.pt(pout[k][0], d, pout[k][1])], w.n, col); }
    function ring(w, cs, cy, r, wd, d, col, n = 16) { const c = (rr) => Array.from({ length: n + 1 }, (_, k) => [cs + rr * Math.cos((2 * Math.PI * k) / n), cy + rr * Math.sin((2 * Math.PI * k) / n)]); band(w, c(r), c(r + wd), d, col); }
    function disc(w, cs, cy, r, d, fill, n = 16) { const p = Array.from({ length: n }, (_, k) => [cs + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]); fillPoly(w, p, d, fill, cs - r, cs + r, cy - r, cy + r); }
    // gable or plain wall with rectangular holes: the top runs ye -> yr (at sm) -> ye; drawn over s0..cut
    function gwall(w, s0, s1, ya, ye, yr, holes, col, mat = 'brick', sm = (s0 + s1) / 2, cut = s1) {
      const yt = (s) => ye + (yr - ye) * (s <= sm ? (s - s0) / (sm - s0 || 1) : (s1 - s) / (s1 - sm || 1));
      const xs = [...new Set([s0, cut, sm, ...holes.flatMap((h) => [h[0], h[1]])])].filter((s) => s >= s0 && s <= cut).sort((p, q) => p - q);
      for (let i = 0; i < xs.length - 1; i++) {
        const sa = xs[i], sb = xs[i + 1]; let y = ya;
        for (const h of holes.filter((h) => h[0] <= sa + 1e-6 && h[1] >= sb - 1e-6).sort((p, q) => p[2] - q[2])) { if (h[2] > y) K.skin(w, [[sa, y], [sb, y], [sb, h[2]], [sa, h[2]]], col, ya, mat); y = Math.max(y, h[3]); }
        if (yt(sa) > y + 1e-3 || yt(sb) > y + 1e-3) K.skin(w, [[sa, y], [sb, y], [sb, yt(sb)], [sa, yt(sa)]], col, ya, mat);
      }
    }
    // masonry box in the frame (pier, chimney, merlon), textured on its four sides; top: a colour or null
    function tbox(a0, a1, b0, b1, y0, y1, col, top, mat = 'brick') {
      for (const [w, s0, s1] of [[K.Wall(true, b0, -1), a0, a1], [K.Wall(true, b1, 1), a0, a1], [K.Wall(false, a0, -1), b0, b1], [K.Wall(false, a1, 1), b0, b1]]) K.skin(w, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], col, y0, mat);
      if (top) K.poly(hb, [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map((p) => K.P(p[0], p[1], y1)), up, top);
    }
    // the same in a wall's frame (s along it, d outward)
    function sbox(w, s0, s1, d0, d1, y0, y1, col, top, mat = 'brick') {
      const c = [at(w, s0, d1), at(w, s1, d1), at(w, s1, d0), at(w, s0, d0)];
      for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4], f = seg(p[0], p[1], q[0], q[1]); K.skin(f, [[0, y0], [f.L, y0], [f.L, y1], [0, y1]], col, y0, mat); }
      if (top) K.poly(hb, c.map((p) => K.P(p[0], p[1], y1)), up, top);
    }
    // sloped slab on wall w from (s0, y0) to (s1, y1), d0..d1 deep, th thick (copings along rakes, cheek-wall caps)
    function slab(w, s0, y0, s1, y1, d0, d1, th, col) {
      const q = (s, d, y) => w.pt(s, d, y), L = Math.hypot(s1 - s0, y1 - y0), n = inPlane(w, -(y1 - y0) / L, (s1 - s0) / L);
      K.poly(hb, [q(s0, d0, y0 + th), q(s1, d0, y1 + th), q(s1, d1, y1 + th), q(s0, d1, y0 + th)], n, col);
      K.poly(hb, [q(s0, d1, y0), q(s1, d1, y1), q(s1, d1, y1 + th), q(s0, d1, y0 + th)], w.n, col);
      K.poly(hb, [q(s0, d0, y0), q(s1, d0, y1), q(s1, d0, y1 + th), q(s0, d0, y0 + th)], neg(w.n), col);
      K.poly(hb, [q(s0, d0, y0), q(s1, d0, y1), q(s1, d1, y1), q(s0, d1, y0)], neg(n), col);
    }
    // pyramid cap over a frame-aligned square (pinnacles, weatherings)
    function pyr(a, b, hw, y0, y1, col) {
      const q = [[a - hw, b - hw], [a + hw, b - hw], [a + hw, b + hw], [a - hw, b + hw]], o = [[0, -1], [1, 0], [0, 1], [-1, 0]], top = K.P(a, b, y1);
      for (let i = 0; i < 4; i++) { const p0 = q[i], p1 = q[(i + 1) % 4]; K.poly(hb, [K.P(p0[0], p0[1], y0), K.P(p1[0], p1[1], y0), top], unit(K.N(o[i][0] * (y1 - y0), o[i][1] * (y1 - y0), hw)), col); }
    }
    // a thin bar between two world points (railings, frames)
    function bar(p, q, r, col) {
      const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], u = unit(d); let s = [u[2], 0, -u[0]]; const ls = Math.hypot(s[0], s[2]); s = ls < 1e-3 ? [1, 0, 0] : [s[0] / ls, 0, s[2] / ls];
      const v = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]], sq = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      const c = (o, a, b) => [o[0] + (s[0] * a + v[0] * b) * r, o[1] + (s[1] * a + v[1] * b) * r, o[2] + (s[2] * a + v[2] * b) * r];
      for (let i = 0; i < 4; i++) { const [a0, b0] = sq[i], [a1, b1] = sq[(i + 1) % 4], ma = (a0 + a1) / 2, mb2 = (b0 + b1) / 2; K.poly(hb, [c(p, a0, b0), c(p, a1, b1), c(q, a1, b1), c(q, a0, b0)], [s[0] * ma + v[0] * mb2, s[1] * ma + v[1] * mb2, s[2] * ma + v[2] * mb2], col); }
    }
    // arched opening in wall w, which has a rectangular hole s0..s1 x ya..apex: spandrels in the wall finish, the reveal D deep, the fill
    // (glass region, 'pane', 'lit', 'open', a colour or null), o.band [width, colour, proud] round the arch (o.jamb: down the jambs too),
    // o.sill (colour, null = none), o.mull: stone tracery (lights; sub-arches springing at o.subY (default ys) and a ring in the head when o.sub)
    function archOpen(w, s0, s1, ya, ys, o = {}) {
      const kind = o.kind || 'round', n = o.n || 12, pts = arc(s0, s1, ys, kind, n, o.R), m = n / 2, top = pts[m][1], D = o.D === undefined ? 0.22 : o.D, rc = o.rev || o.col;
      if (!o.noSpan) { K.skin(w, [[s0, top], ...pts.slice(0, m + 1)], o.col, ya, o.mat || 'brick'); K.skin(w, [[s1, top], ...pts.slice(m)], o.col, ya, o.mat || 'brick'); }   // each spandrel fanned from its corner
      if (!o.noRev) {
        const q = (p, d) => w.pt(p[0], d, p[1]), rv = (p, r, nr) => K.poly(hb, [q(p, 0), q(r, 0), q(r, -D), q(p, -D)], nr, rc);
        rv([s0, ya], [s0, ys], w.t); rv([s1, ys], [s1, ya], neg(w.t));
        for (let k = 0; k < n; k++) { const p = pts[k], r = pts[k + 1], ds = r[0] - p[0], dy = r[1] - p[1], l = Math.hypot(ds, dy) || 1; rv(p, r, inPlane(w, dy / l, -ds / l)); }
        if (o.sill !== null && o.sill !== undefined) w.box(s0 - 0.06, s1 + 0.06, -D, 0.07, ya - 0.08, ya, o.sill, true);
      }
      fillPoly(w, [[s0, ya], [s1, ya], ...pts.slice().reverse()], -D + 0.03, o.fill, s0, s1, ya, top, o.tint);
      if (o.band) {
        const [wd, col, dp = 0.03] = o.band, po = arc(s0 - wd, s1 + wd, ys, kind, n, kind === 'point' ? (o.R || s1 - s0) + wd : o.R);
        band(w, pts, po, dp, col);
        if (dp > 0.02) for (let k = 0; k < n; k++) { const p = po[k], r = po[k + 1], ds = r[0] - p[0], dy = r[1] - p[1], l = Math.hypot(ds, dy) || 1; K.poly(hb, [w.pt(p[0], 0, p[1]), w.pt(r[0], 0, r[1]), w.pt(r[0], dp, r[1]), w.pt(p[0], dp, p[1])], inPlane(w, -dy / l, ds / l), col); }
        if (o.jamb) { w.box(s0 - wd, s0, 0, dp, ya, ys, col); w.box(s1, s1 + wd, 0, dp, ya, ys, col); }
      }
      if (o.mull) {
        const k = o.mull, lw = (s1 - s0) / k, mw = o.mw || 0.08, d = -D + 0.09, sc = o.mcol || C(0xd9d2c0), sub = o.sub ? (o.subY || ys) - 0.05 : null;
        const yArc = (s) => { for (let i = 0; i < n; i++) { const p = pts[i], r = pts[i + 1]; if (s >= p[0] && s <= r[0]) return p[1] + ((r[1] - p[1]) * (s - p[0])) / (r[0] - p[0] || 1); } return ys; };
        for (let i = 1; i < k; i++) { const s = s0 + lw * i; w.box(s - mw / 2, s + mw / 2, d - 0.06, d, ya, sub === null ? yArc(s) : sub, sc); }
        if (sub !== null) {
          let head = sub;
          for (let i = 0; i < k; i++) { const a0 = s0 + lw * i + (i ? mw / 2 : 0), a1 = s0 + lw * (i + 1) - (i < k - 1 ? mw / 2 : 0), pi = arc(a0, a1, sub, 'point', 8), pin = pi.map((p) => [p[0], p[1]]), pou = arc(a0 - mw, a1 + mw, sub, 'point', 8, a1 - a0 + mw); band(w, pin, pou, d, sc); head = Math.max(head, pi[4][1]); }
          const sm = (s0 + s1) / 2, room = top - head, r = Math.min(room * 0.36, (s1 - s0) * 0.2);
          if (r > 0.12) ring(w, sm, head + room * 0.45, r, mw, d, sc);
        }
      }
      return { pts, top };
    }
    // rectangular opening (hole already cut): reveal, fill, o.frame (thin bars inside, a colour), o.mull lights, o.sill / o.lintel (stone)
    function rectOpen(w, s0, s1, ya, yb, o = {}) {
      const D = o.D === undefined ? 0.15 : o.D, rc = o.rev || C(0x8c6c60), q = (s, d, y) => w.pt(s, d, y);
      K.poly(hb, [q(s0, 0, yb), q(s1, 0, yb), q(s1, -D, yb), q(s0, -D, yb)], dn, rc); K.poly(hb, [q(s0, 0, ya), q(s1, 0, ya), q(s1, -D, ya), q(s0, -D, ya)], up, rc);
      K.poly(hb, [q(s0, 0, ya), q(s0, -D, ya), q(s0, -D, yb), q(s0, 0, yb)], w.t, rc); K.poly(hb, [q(s1, 0, ya), q(s1, -D, ya), q(s1, -D, yb), q(s1, 0, yb)], neg(w.t), rc);
      fillPoly(w, [[s0, ya], [s1, ya], [s1, yb], [s0, yb]], -D + 0.03, o.fill, s0, s1, ya, yb, o.tint);
      const f = o.frame, fd = -D + 0.03;
      if (f) { const t = 0.05; w.box(s0, s0 + t, fd, fd + 0.04, ya, yb, f); w.box(s1 - t, s1, fd, fd + 0.04, ya, yb, f); w.box(s0, s1, fd, fd + 0.04, yb - t, yb, f); w.box(s0, s1, fd, fd + 0.04, ya, ya + t, f);
        for (let i = 1; i < (o.mull || 1); i++) { const s = s0 + ((s1 - s0) * i) / o.mull; w.box(s - 0.03, s + 0.03, fd, fd + 0.04, ya, yb, f); }
        for (let i = 1; i < (o.rows || 1); i++) { const y = ya + ((yb - ya) * i) / o.rows; w.box(s0, s1, fd, fd + 0.04, y - 0.025, y + 0.025, f); } }
      if (o.sill) w.box(s0 - 0.08, s1 + 0.08, -0.02, 0.08, ya - 0.1, ya, o.sill, true);
      if (o.lintel) w.box(s0 - 0.1, s1 + 0.1, 0, 0.05, yb, yb + 0.22, o.lintel, true);
    }
    // glass curtain wall (hole cut): dark glass in a light grid, cols x rows
    function curtain(w, s0, s1, ya, yb, cols, rows, gc) {
      rectOpen(w, s0, s1, ya, yb, { D: 0.12, fill: 'pane', rev: gc }); const fd = -0.12 + 0.03;
      for (let i = 0; i <= cols; i++) { const s = s0 + ((s1 - s0) * i) / cols; w.box(s - 0.05, s + 0.05, fd, 0.03, ya, yb, gc); }
      for (let j = 0; j <= rows; j++) { const y = ya + ((yb - ya) * j) / rows; w.box(s0, s1, fd, 0.03, y - 0.05, y + 0.05, gc); }
    }
    // a flight of steps out from wall w (s0..s1), the top step's tread at ytop next to the wall, each rise lower, run deep
    function stairs(w, s0, s1, d0, n, run, ytop, rise, col, gl) { for (let k = 0; k < n; k++) w.box(s0, s1, d0 + k * run, d0 + (k + 1) * run, gl, ytop - k * rise, col); }
    // cheek wall beside steps: s0..s1 across, from d = dA (height yA) out to dB (yB), down to gl
    function cheek(w, s0, s1, dA, dB, yA, yB, gl, col) {
      const p = (s, d, y) => w.pt(s, d, y), l = Math.hypot(dB - dA, yB - yA);
      for (const [s, nn] of [[s0, neg(w.t)], [s1, w.t]]) K.poly(hb, [p(s, dA, gl), p(s, dB, gl), p(s, dB, yB), p(s, dA, yA)], nn, col);
      K.poly(hb, [p(s0, dA, yA), p(s1, dA, yA), p(s1, dB, yB), p(s0, dB, yB)], unit([w.n[0] * (-(yB - yA) / l), (dB - dA) / l, w.n[2] * (-(yB - yA) / l)]), col);
      K.poly(hb, [p(s0, dB, gl), p(s1, dB, gl), p(s1, dB, yB), p(s0, dB, yB)], w.n, col);
    }
    // handrail on posts from (s, dA, yA) to (s, dB, yB), h above the steps
    function rail(w, s, dA, dB, yA, yB, h, col) {
      const n = Math.max(1, Math.round(Math.abs(dB - dA) / 1.2));
      bar(w.pt(s, dA, yA + h), w.pt(s, dB, yB + h), 0.025, col);
      for (let k = 0; k <= n; k++) { const f = k / n, d = dA + (dB - dA) * f, y = yA + (yB - yA) * f; bar(w.pt(s, d, y - 0.05), w.pt(s, d, y + h), 0.02, col); }
    }
    // a flat sign face on wall w (a canvas region)
    function sign(w, s0, s1, y0, y1, d, rg) { fillPoly(w, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], d, rg, s0, s1, y0, y1); }
    return { C, hb, up, dn, neg, LIT, PANE, unit, seg, at, off, fillPoly, band, ring, disc, gwall, tbox, sbox, slab, pyr, bar, archOpen, rectOpen, curtain, stairs, cheek, rail, sign };
  }

  // ---------- Bloomfield United Methodist Church (641) ----------
  // frame: a east along W. Main from the footprint's SW corner, b north. Front wing a 0..10.2 (b 0..5.9), big gable a 0..12.2 (b 5.9..19),
  // porch a 10.2..13.9, right gable block a 12.2..21.8 (b 0..12.55), tower a 18.1..21.9 (b -0.05..3.65), east wing a 21.8..31.6 (b 6.2..18.9),
  // north-west wing a 0..9.1 (b 19..23.6). The porch threshold is 1.3 m below floorY, the sidewalk about 2.2 m.
  function methodist(K) {
    const f = K.fp(641), F = f.rec.floorY, U = B.util, mb = U.Buf(), X = ext(K, mb), C = K.C, y = (h) => F + h, gl = f.lo - 0.3;
    const BR = C(0x9196a6), LBR = C(0xf0cdb8), ST = C(0xb8b09c), STEP = C(0x7a4a3c), CONC = C(0x9a968c), DARK = C(0x26201c), MET = C(0x2a2a2a), ROOF = C(0xb8b8b8);
    const gF = K.G(12, -1.5);   // sidewalk at the porch
    const band = (w, s0, s1, ya, yb, dp = 0.09) => w.box(s0, s1, 0, dp, ya, yb, ST, true);
    // --- front wing: flat roof behind a parapet; paired and single stained windows in stone frames, basement windows and door
    const wF = X.seg(0, 0, 10.2, 0), winF = [[4.25, 5.35], [5.55, 6.65], [8.45, 9.55]];
    K.wall(wF, 0, 10.2, gl, y(4.15), [...winF.map(([a, b]) => [a, b, y(1.15), y(2.45)]), [5.45, 6.45, y(-1.75), y(-0.8)], [8.5, 9.5, y(-1.75), y(-0.8)], [3.9, 4.9, gF - 0.05, y(-0.25)]], BR, gl, 'brick');
    for (const [a, b] of winF) X.rectOpen(wF, a, b, y(1.15), y(2.45), { fill: 'glassA', D: 0.14, frame: K.WHITE, rev: ST });
    for (const [a0, a1] of [[4.05, 6.85], [8.25, 9.75]]) { band(wF, a0, a1, y(0.95), y(1.15), 0.07); band(wF, a0, a1, y(2.45), y(2.67), 0.07); band(wF, a0, a0 + 0.2, y(1.15), y(2.45), 0.07); band(wF, a1 - 0.2, a1, y(1.15), y(2.45), 0.07); }
    band(wF, 5.35, 5.55, y(1.15), y(2.45), 0.07);
    for (const a of [5.45, 8.5]) K.opening(wF, a, a + 1.0, y(-1.75), y(-0.8), 'S6', { split: 1 });
    X.rectOpen(wF, 3.9, 4.9, gF - 0.05, y(-0.25), { fill: DARK, D: 0.12, rev: ST });
    for (const [a0, a1] of [[0, 0.55], [2.5, 3.15], [7.2, 7.8], [9.75, 10.2]]) { X.tbox(a0, a1, -0.18, 0, gl, y(3.18), BR); K.box(a0 - 0.04, a1 + 0.04, -0.24, 0.02, y(3.18), y(3.5), ST); }
    band(wF, 0, 10.2, y(3.18), y(3.45)); band(wF, 0, 10.2, y(-0.4), y(-0.2));
    const wFW = X.seg(0, 5.9, 0, 0);
    K.wall(wFW, 0, 5.9, gl, y(4.15), [[2.3, 3.4, y(1.15), y(2.45)]], BR, gl, 'brick'); X.rectOpen(wFW, 2.3, 3.4, y(1.15), y(2.45), { fill: 'glassA', D: 0.14, frame: K.WHITE, sill: ST, lintel: ST });
    band(wFW, 0, 5.9, y(3.18), y(3.45)); band(wFW, 0, 5.9, y(-0.4), y(-0.2));
    K.flat([[0, 0], [10.2, 0], [10.2, 5.9], [0, 5.9]], y(3.8), { parapet: 0.35, coping: ST });
    // --- the big gable: parapet gable with a stone coping and finial, the round traceried window; side walls with round-headed windows
    const ye = 7.0, yr = 11.9, k1 = (yr - ye) / 6.1, wG = X.seg(0, 5.9, 12.2, 5.9);
    const rw = [3.75, 8.45, y(5.25), y(5.95)], rR = 2.7, rTop = rw[3] + Math.sqrt(2 * rR * 2.35 - 2.35 * 2.35);   // photo: rise / half-span ~1.14
    X.gwall(wG, 0, 12.2, y(3.5), y(ye + 0.35), y(yr + 0.35), [[rw[0], rw[1], rw[2], rTop]], BR);
    X.archOpen(wG, rw[0], rw[1], rw[2], rw[3], { kind: 'point', R: rR, n: 16, fill: 'glassA', D: 0.3, col: BR, rev: ST, band: [0.3, ST, 0.06], jamb: true, sill: ST, mull: 5, sub: true, subY: y(6.65), mw: 0.1 });
    X.slab(wG, -0.12, y(ye + 0.35), 6.1, y(yr + 0.35), -0.35, 0.14, 0.16, ST); X.slab(wG, 6.1, y(yr + 0.35), 12.32, y(ye + 0.35), -0.35, 0.14, 0.16, ST);
    K.box(5.8, 6.4, 5.75, 6.2, y(yr + 0.4), y(yr + 1.05), ST); K.box(5.62, 6.58, 5.72, 6.23, y(yr + 0.2), y(yr + 0.45), ST);
    for (const a of [-0.3, 11.75]) { X.tbox(a, a + 0.75, 5.55, 6.3, a < 0 ? gl : y(3.5), y(ye + 0.5), BR); X.pyr(a + 0.375, 5.925, 0.42, y(ye + 0.5), y(ye + 1.15), ST); }
    const wW = X.seg(0, 19, 0, 5.9), side = [[2.4, 3.7], [6.4, 7.7], [10.4, 11.7]];   // s = 19 - b
    K.wall(wW, 0, 13.1, gl, y(ye), [...side.map(([a, b]) => [a, b, y(1.0), y(3.6 + 0.65)]), ...side.map(([a, b]) => [a + 0.15, b - 0.15, y(-1.7), y(-0.85)])], BR, gl, 'brick');
    for (const [a, b] of side) { X.archOpen(wW, a, b, y(1.0), y(3.6), { kind: 'round', fill: 'glassA', D: 0.2, col: BR, rev: ST, band: [0.2, ST, 0.05], sill: ST }); K.opening(wW, a + 0.15, b - 0.15, y(-1.7), y(-0.85), 'S6'); }
    band(wW, 0, 13.1, y(-0.4), y(-0.2));
    K.roof(false, 6.0, 19.35, 0, 12.2, y(ye), yr - ye, 0.4, { gutter: 'both', rakes: [[19.0, 19.35]], col: ROOF });
    X.gwall(X.seg(12.2, 19, 0, 19), 0, 12.2, y(3.9), y(ye), y(yr), [], BR); K.wall(X.seg(12.2, 19, 9.1, 19), 0, 3.1, gl, y(4.0), [], BR, gl, 'brick');
    // --- north-west wing (low, gabled)
    K.wall(X.seg(0, 23.6, 0, 19), 0, 4.6, gl, y(3.6), [[1.4, 2.4, y(1.0), y(2.6)]], BR, gl, 'brick'); K.opening(X.seg(0, 23.6, 0, 19), 1.4, 2.4, y(1.0), y(2.6), 'S6');
    { const w = X.seg(9.1, 23.6, 0, 23.6); X.gwall(w, 0, 9.1, gl, y(3.6), y(5.6), [[2.0, 3.0, y(1.0), y(2.6)], [6.1, 7.1, y(1.0), y(2.6)]], BR); for (const a of [2.0, 6.1]) K.opening(w, a, a + 1.0, y(1.0), y(2.6), 'S6'); }
    K.wall(X.seg(9.1, 19, 9.1, 23.6), 0, 4.6, gl, y(3.6), [], BR, gl, 'brick');
    K.roof(false, 19.0, 23.95, 0, 9.1, y(3.6), 2.0, 0.3, { gutter: 'both', rakes: [[23.6, 23.95]], col: ROOF });
    // --- porch: brick with a stone parapet (blind tracery, pinnacles, central gablet and cross), pointed doorway with the MEC tympanum
    const pf = -0.6, wP = X.seg(10.2, pf, 13.9, pf), TH = y(-1.3), dS = 11.2, dE = 12.85, dSp = y(0.95), dTop = dSp + 0.866 * (dE - dS);
    K.wall(wP, 0, 3.7, gl, y(3.55), [[dS - 10.2, dE - 10.2, TH, dTop]], BR, gl, 'brick');
    X.archOpen(wP, dS - 10.2, dE - 10.2, TH, dSp, { kind: 'point', fill: null, D: 0.4, col: BR, rev: ST, band: [0.3, ST, 0.07], jamb: true, sill: null });
    { const w = X.off(wP, -0.37), s0 = dS - 10.2, s1 = dE - 10.2, pts = arc(s0, s1, dSp, 'point', 12);
      X.fillPoly(w, [[s0, TH], [s1, TH], [s1, dSp], [s0, dSp]], 0, DARK); X.fillPoly(w, [[s0, dSp], ...pts.slice(1, -1), [s1, dSp]].reverse(), 0.01, 'mec', s0, s1, dSp, dTop);
      w.box(s0, s1, 0, 0.06, dSp - 0.08, dSp + 0.04, ST); w.box((s0 + s1) / 2 - 0.03, (s0 + s1) / 2 + 0.03, 0, 0.04, TH, dSp, C(0x16120f));
      for (const s of [s0 + 0.2, s1 - 0.6]) X.fillPoly(w, [[s, TH + 0.9], [s + 0.4, TH + 0.9], [s + 0.4, dSp - 0.3], [s, dSp - 0.3]], 0.015, 'pane'); }
    for (const s of [0.275, 3.425]) { wP.box(s - 0.08, s + 0.08, 0.35, 0.47, y(0.35), y(0.8), C(0xe8e4dc)); X.fillPoly(wP, [[s - 0.06, y(0.4)], [s + 0.06, y(0.4)], [s + 0.06, y(0.75)], [s - 0.06, y(0.75)]], 0.475, 'lit'); }
    K.wall(X.seg(13.9, pf, 13.9, 0), 0, 0.6, gl, y(3.55), [], BR, gl, 'brick'); K.wall(X.seg(10.2, 0, 10.2, pf), 0, 0.6, gl, y(3.55), [], BR, gl, 'brick');
    for (const a of [10.2, 13.35]) { X.tbox(a, a + 0.55, pf - 0.35, pf + 0.2, gl, y(3.45), BR); K.box(a - 0.04, a + 0.59, pf - 0.4, pf + 0.24, y(3.45), y(3.6), ST); }
    { const w = X.off(wP, 0.02);   // stone parapet: face, blind arcade, coping, pinnacles, gablet with a cross
      w.box(-0.02, 3.72, -0.3, 0.05, y(3.55), y(4.3), ST); w.box(-0.08, 3.78, -0.3, 0.12, y(3.5), y(3.66), ST);
      for (let i = 0; i < 6; i++) { const s = 0.55 + i * 0.52; X.fillPoly(w, [[s, y(3.75)], [s + 0.3, y(3.75)], [s + 0.3, y(4.02)], [s + 0.15, y(4.14)], [s, y(4.02)]], 0.055, C(0xb0a894)); }
      for (const s of [0.27, 1.0, 2.7, 3.43]) { K.box(...[X.at(w, s - 0.14, 0)[0], X.at(w, s + 0.14, 0)[0]], pf - 0.25, pf + 0.03, y(4.3), y(4.5), ST); X.pyr(X.at(w, s, 0)[0], pf - 0.11, 0.17, y(4.5), y(4.75), ST); }
      const sm = 1.85; X.fillPoly(w, [[sm - 0.6, y(4.3)], [sm + 0.6, y(4.3)], [sm, y(4.85)]], 0.05, ST);
      w.box(sm - 0.07, sm + 0.07, -0.22, -0.08, y(4.7), y(5.55), ST); w.box(sm - 0.26, sm + 0.26, -0.22, -0.08, y(5.15), y(5.29), ST); }
    K.flat([[10.2, pf], [13.9, pf], [13.9, 5.9], [10.2, 5.9]], y(3.55), { parapet: 0, coping: ST });
    { const w = X.seg(10.75, pf, 13.35, pf);   // steps, cheek walls, rails
      X.stairs(w, 0, 2.6, 0, 5, 0.3, TH, 0.19, STEP, gl);
      X.cheek(w, -0.4, 0, 0, 1.75, TH + 0.45, gF + 0.35, gl, CONC); X.cheek(w, 2.6, 3.0, 0, 1.75, TH + 0.45, gF + 0.35, gl, CONC);
      X.rail(w, 0.25, 0.1, 1.5, TH, gF + 0.15, 0.9, MET); X.rail(w, 2.35, 0.1, 1.5, TH, gF + 0.15, 0.9, MET); }
    // --- right section, as the photo measures it (the lidar facet here is one plane pair fitted over the whole N-S run, so it carries the
    // sanctuary's 10.7 m ridge forward): a narrow white-trimmed gable (eave 6.0, apex 8.1 m) over the pointed traceried window, flat-roofed
    // bays either side at 6 m, the tall stone-capped pier and a stepped buttress; the corner tower stands just behind the gable's plane
    const wR = X.seg(15.0, 0, 19.2, 0), gS = 1.22, gE = 2.98, gSp = y(3.05), gTop = gSp + 0.866 * (gE - gS);   // s = a - 15
    X.gwall(wR, 0, 4.2, gl, y(6.0), y(8.1), [[gS, gE, y(0.7), gTop], [0.9, 1.6, y(-1.75), y(-0.8)], [2.75, 3.3, y(-1.75), y(-0.8)], [1.85, 2.5, gF, y(-0.2)]], BR);
    X.archOpen(wR, gS, gE, y(0.7), gSp, { kind: 'point', n: 12, fill: 'glassA', D: 0.28, col: BR, rev: ST, band: [0.2, ST, 0.06], jamb: true, sill: ST, mull: 3, sub: true });
    for (const s0 of [0.9, 2.75]) K.opening(wR, s0, s0 + (s0 < 2 ? 0.7 : 0.55), y(-1.75), y(-0.8), 'S6');
    X.rectOpen(wR, 1.85, 2.5, gF, y(-0.2), { fill: C(0x8a7c6c), D: 0.1, rev: K.WHITE, frame: K.WHITE }); X.fillPoly(X.off(wR, -0.07), [[1.91, gF + 1.05], [2.44, gF + 1.05], [2.44, y(-0.3)], [1.91, y(-0.3)]], 0, 'pane');
    band(wR, 0, 4.2, y(-0.4), y(-0.2)); band(wR, 0.6, 3.6, y(0.5), y(0.7), 0.06);
    for (const w of [X.seg(15.0, 7.8, 15.0, 0), X.seg(19.2, 0, 19.2, 7.8)]) K.wall(w, 0, 7.8, gl, y(6.0), [], BR, gl, 'brick');
    K.roof(false, -0.25, 10.4, 15.0, 19.2, y(6.0), 2.1, 0.25, { gutter: 'both', rakes: [[-0.25, 0]], col: ROOF });
    const fl = (a0, a1, b0, b1) => { K.flat([[a0, b0], [a1, b0], [a1, b1], [a0, b1]], y(5.95), { parapet: 0.35, coping: ST }); K.wall(X.seg(a1, b1, a0, b1), 0, a1 - a0, y(4.3), y(6.3), [], BR, y(4.3), 'brick'); };
    K.wall(X.seg(12.2, 0, 15.0, 0), 0, 2.8, gl, y(6.3), [], BR, gl, 'brick'); fl(12.2, 15.0, 0, 6.2);
    K.wall(X.seg(21.8, 3.85, 21.8, 6.2), 0, 2.35, gl, y(6.3), [], BR, gl, 'brick'); fl(19.2, 21.8, 3.85, 6.2);
    K.wall(X.seg(12.2, 5.9, 12.2, 19), 0, 13.1, y(4.3), y(ye), [], BR, y(4.3), 'brick');
    X.tbox(14.1, 15.4, -0.3, 0, gl, y(7.1), BR); K.box(14.04, 15.46, -0.36, 0.06, y(7.1), y(7.38), ST);
    X.tbox(14.75, 15.4, -0.68, -0.3, gl, y(3.2), BR); X.slab(X.seg(14.75, -0.3, 15.4, -0.3), -0.02, y(3.2), 0.67, y(3.2), -0.02, 0.42, 0.25, ST);
    // --- the tower: water table, stone-capped corner piers, round-headed window, lancet louvres, crosses, oculus, corbel band, merlons
    const T0 = [18.1, 21.8, 0.15, 3.85], tw = [X.seg(18.1, 0.15, 21.8, 0.15), X.seg(21.8, 0.15, 21.8, 3.85), X.seg(21.8, 3.85, 18.1, 3.85), X.seg(18.1, 3.85, 18.1, 0.15)];
    tw.forEach((w, i) => {
      const L = w.L, c = i ? L / 2 : 2.45, front = i < 2, lan = [[c - 0.4, c - 0.05], [c + 0.05, c + 0.4]], holes = lan.map(([a, b]) => [a, b, y(4.35), y(5.7)]);
      if (i === 0) holes.push([c - 0.33, c + 0.33, y(0.6), y(2.0 + 0.33)]);
      K.wall(w, 0, L, front ? gl : y(4.5), y(7.9), holes, BR, gl, 'brick');
      for (const [a] of lan) X.archOpen(w, a, a + 0.35, y(4.35), y(5.7) - 0.303, { kind: 'point', n: 8, fill: C(0x302c28), D: 0.2, col: BR, rev: ST, sill: ST, band: [0.08, ST, 0.03] });
      if (i === 0) { X.archOpen(w, c - 0.33, c + 0.33, y(0.6), y(2.0), { kind: 'round', n: 10, fill: 'pane', D: 0.2, col: BR, rev: K.WHITE, sill: ST, band: [0.12, ST, 0.04] }); w.box(c - 0.03, c + 0.03, -0.17, -0.13, y(0.6), y(2.33), K.WHITE); w.box(c - 0.33, c + 0.33, -0.17, -0.13, y(1.45), y(1.5), K.WHITE); }
      X.ring(w, c, y(6.6), 0.3, 0.1, 0.04, ST); X.disc(w, c, y(6.6), 0.3, 0.02, C(0x3a3632));
      for (let k = -2; k <= 2; k++) w.box(c - 0.28, c + 0.28, 0.02, 0.05, y(6.6) + k * 0.1 - 0.02, y(6.6) + k * 0.1 + 0.02, C(0x8e8a84));
      for (const s0 of [c - 0.95, c + 0.95]) { w.box(s0 - 0.05, s0 + 0.05, 0, 0.05, y(6.15), y(7.05), ST); w.box(s0 - 0.2, s0 + 0.2, 0, 0.05, y(6.67), y(6.77), ST); }
      w.box(-0.1, L + 0.1, 0, 0.1, y(7.4), y(7.65), ST, true); w.box(0, L, 0, 0.06, y(4.2), y(4.35), ST, true);
      if (front) { band(w, 0, L, y(-0.4), y(-0.2)); for (const s0 of i ? [L - 0.5] : [1.3, L - 0.5]) { X.sbox(w, s0, s0 + 0.5, 0, 0.18, gl, y(1.9), BR); X.slab(w, s0 - 0.02, y(1.9), s0 + 0.52, y(1.9), 0, 0.22, 0.4, ST); } }
      const mer = [[0, 0.75], [c - 0.4, c + 0.4], [L - 0.75, L - 0.3]];
      for (const [a0, a1] of mer) { X.sbox(w, a0, a1, -0.3, 0, y(7.9), y(8.4), BR, ST); w.box(a0 - 0.02, a1 + 0.02, -0.32, 0.03, y(8.4), y(8.48), ST, true); }
    });
    K.flat([[T0[0], T0[2]], [T0[1], T0[2]], [T0[1], T0[3]], [T0[0], T0[3]]], y(7.9), { parapet: 0, coping: ST });
    // --- east wing (lidar E-W gable): its street front is the 2011 photo's lighter orange-red brick, two storeys under a plain parapet with
    // metal coping, built 0.2 m proud of the wall so it hides the roof's eave; a pointed window in the east gable
    const wES = X.seg(21.8, 6.2, 31.6, 6.2), eW = [1.4, 3.9, 6.4, 8.9], wEU = X.off(wES, 0.2);
    K.wall(wES, 0, 9.8, gl, y(4.2), eW.map((s) => [s - 0.5, s + 0.5, y(1.3), y(3.3)]), LBR, gl, 'brick');
    for (const s of eW) { K.opening(wES, s - 0.5, s + 0.5, y(1.3), y(3.3), 'S6'); wES.box(s - 0.6, s + 0.6, 0, 0.08, y(1.2), y(1.3), ST, true); K.flatWindow(wEU, s - 0.45, s + 0.45, y(4.55), y(5.75), 'S1'); wEU.box(s - 0.55, s + 0.55, 0, 0.08, y(4.42), y(4.5), ST, true); }
    band(wES, 0, 9.8, y(-0.4), y(-0.2)); X.sbox(wES, -0.02, 9.82, -0.3, 0.2, y(4.2), y(6.3), LBR, null);
    wES.box(-0.02, 9.82, 0, 0.2, y(4.1), y(4.2), C(0x9a5a48), true); wES.box(-0.06, 9.86, -0.34, 0.25, y(6.3), y(6.4), C(0xb4b8ba), true);
    const wEE = X.seg(31.6, 6.2, 31.6, 18.9);
    X.gwall(wEE, 0, 12.7, gl, y(4.5), y(10.7), [[1.9, 2.9, y(1.3), y(3.3)], [9.8, 10.8, y(1.3), y(3.3)], [5.6, 7.1, y(4.6), y(6.4 + 1.3)]], LBR);
    for (const s of [1.9, 9.8]) K.opening(wEE, s, s + 1.0, y(1.3), y(3.3), 'S6');
    X.archOpen(wEE, 5.6, 7.1, y(4.6), y(6.4), { kind: 'point', fill: 'glassA', D: 0.2, col: BR, rev: ST, band: [0.15, ST, 0.05], sill: ST, mull: 2 });
    band(wEE, 0, 12.7, y(-0.4), y(-0.2));
    const wEN = X.seg(31.6, 18.9, 12.2, 18.9), nW = [2.5, 5.5, 8.5, 11.5, 14.5, 17.5];
    K.wall(wEN, 0, 19.4, gl, y(4.5), nW.map((s) => [s - 0.5, s + 0.5, y(1.3), y(3.3)]), BR, gl, 'brick'); for (const s of nW) K.opening(wEN, s - 0.5, s + 0.5, y(1.3), y(3.3), 'S6');
    K.roof(true, 7.6, 31.95, 6.2, 18.9, y(4.5), 6.2, 0.05, { gutter: 'both', rakes: [[31.6, 31.95]], col: ROOF });
    // --- the sign at the west end of the front lawn: a brick monument with a stone cap on a concrete plinth, the black board set in it
    { const w = X.seg(0.2, -3.0, 2.6, -3.0), g0 = K.G(1.4, -3.0);
      w.box(-0.06, 2.46, -0.36, 0.06, g0 - 0.3, g0 + 0.22, CONC); X.sbox(w, 0, 2.4, -0.3, 0, g0 + 0.22, g0 + 1.72, BR, null); w.box(-0.06, 2.46, -0.36, 0.06, g0 + 1.72, g0 + 1.84, ST, true);
      w.box(0.48, 1.92, 0, 0.03, g0 + 0.42, g0 + 1.56, C(0x161412)); X.sign(w, 0.52, 1.88, g0 + 0.46, g0 + 1.52, 0.035, 'signM');
      K.wallSeg(0.25, -2.85, 2.55, -2.85); }
    // --- solids beyond the footprint, tree keep-outs
    K.wallSeg(10.3, pf - 0.4, 10.3, pf - 1.8); K.wallSeg(10.3, pf - 1.8, 13.8, pf - 1.8); K.wallSeg(13.8, pf - 1.8, 13.8, pf - 0.4); K.wallSeg(10.2, pf - 0.4, 13.9, pf - 0.4);
    K.keep(9.5, 14.5, -3.0, 0); K.keep(0, 3, -4, 0);
    unboard('Bloomfield United Methodist Church'); addMesh(mb);
  }

  // ---------- First Christian Church (636) ----------
  // frame: a east along W. Spring from the footprint's SW corner, b north. Front projection (Spring St gable) a 2.33..12.4 (b 0..3.92),
  // main body a 0..17.4 (b 3.92..36.05) with the Jefferson St cross gable (b 4.2..13.2) and east wing gable (b 13.9..21.9) on its
  // east wall, tower a 12.7..17.2 (b -0.3..4.2) in the footprint's SE notch. Main floor 0.9 m above floorY, the front ground ~0.9 below.
  function christian(K) {
    const f = K.fp(636), F = f.rec.floorY, U = B.util, mb = U.Buf(), X = ext(K, mb), C = K.C, y = (h) => F + h, gl = f.lo - 0.3;
    const BR = C(0xa8adbd), BRd = C(0x5e352d), ST = C(0xbdb5a2), CONC = C(0x9a968c), MET = C(0xd4d6d8), ROOF = C(0x9c9c9c), FL = 0.9, eave = 4.6;
    const band = (w, s0, s1, ya, yb, dp = 0.08) => w.box(s0, s1, 0, dp, ya, yb, ST, true);
    // a gable face (sizes from the 2011 photo: fan and window group ~4.2 m wide): three stained windows on the belt course under a two-course
    // stone lintel, the fan window on it in a brick arch (white sash: an inner half-disc and six radial lights), basement windows
    function gableFace(w, L, apex, sm) {
      const R = 2.1, ys = y(3.45), wd = 1.0, ws = [-2.1, -0.5, 1.1].map((o) => sm + o), fan = [sm - R, sm + R];
      X.gwall(w, 0, L, gl, y(eave), y(apex), [...ws.map((s) => [s, s + wd, y(1.25), y(2.95)]), [fan[0], fan[1], ys, ys + R], [sm - 1.2, sm - 0.4, y(-0.6), y(0.4)], [sm + 0.4, sm + 1.2, y(-0.6), y(0.4)], [sm - 0.2, sm + 0.2, y(7.0), y(7.8)]], BR, 'brick', L / 2);
      for (const s of ws) X.rectOpen(w, s, s + wd, y(1.25), y(2.95), { fill: 'glassB', D: 0.14, frame: K.WHITE, rows: 2, rev: ST });
      band(w, 0, L, y(1.05), y(1.25)); band(w, sm - 2.55, sm + 2.55, y(2.95), y(3.3), 0.08); band(w, sm - 2.4, sm + 2.4, y(3.3), ys, 0.05);
      X.archOpen(w, fan[0], fan[1], ys, ys, { kind: 'round', n: 16, fill: null, D: 0.16, col: BR, rev: ST, band: [0.28, BRd, 0.04], sill: null });
      const fw = X.off(w, -0.12), rp = (r, t) => fw.pt(sm + r * Math.cos(t), 0, ys + r * Math.sin(t)), gp = (r, t) => [sm + r * Math.cos(t), ys + r * Math.sin(t)];
      for (let k = 0; k < 8; k++) {   // the glass pane by pane (six radial lights, the half-disc's two quarters), each leaded with its medallion
        const t0 = (Math.PI * (k < 6 ? k : 3 * (k - 6))) / 6, t1 = t0 + Math.PI / (k < 6 ? 6 : 2), m = k < 6 ? 3 : 4;
        const pp = k < 6 ? [gp(0.84, t0), ...Array.from({ length: m + 1 }, (_, j) => gp(R, t0 + ((t1 - t0) * j) / m)), gp(0.84, t1)] : [[sm, ys], ...Array.from({ length: m + 1 }, (_, j) => gp(0.84, t0 + ((t1 - t0) * j) / m))];
        const xs = pp.map((p) => p[0]), yv = pp.map((p) => p[1]);
        X.fillPoly(w, pp, -0.13, 'glassB', Math.min(...xs), Math.max(...xs), Math.min(...yv), Math.max(...yv)); }
      for (let k = 1; k < 6; k++) X.bar(rp(0.86, (Math.PI * k) / 6), rp(R - 0.08, (Math.PI * k) / 6), 0.035, K.WHITE);
      X.bar(fw.pt(sm, 0, ys), rp(0.8, Math.PI / 2), 0.03, K.WHITE); X.bar(fw.pt(fan[0], 0, ys + 0.03), fw.pt(fan[1], 0, ys + 0.03), 0.04, K.WHITE);
      X.band(fw, arc(sm - 0.8, sm + 0.8, ys, 'round', 10), arc(sm - 0.88, sm + 0.88, ys, 'round', 10), 0.02, K.WHITE);
      X.band(fw, arc(fan[0] + 0.1, fan[1] - 0.1, ys, 'round', 16), arc(fan[0], fan[1], ys, 'round', 16), 0.02, K.WHITE);
      for (const s of [sm - 1.2, sm + 0.4]) K.opening(w, s, s + 0.8, y(-0.6), y(0.4), 'S6');
      K.opening(w, sm - 0.2, sm + 0.2, y(7.0), y(7.8), 'S1');
      band(w, 0, L, y(-0.75), y(-0.6), 0.05);
    }
    // --- the Spring St gable (front projection) and its sides
    const wP = X.seg(2.33, 0, 12.4, 0);
    gableFace(wP, 10.07, 10.8, 5.035);
    for (const w of [X.seg(2.33, 3.92, 2.33, 0), X.seg(12.4, 0, 12.4, 3.92)]) { K.wall(w, 0, 3.92, gl, y(eave), w.e[0] < 5 ? [[1.4, 2.2, y(1.25), y(3.2)]] : [], BR, gl, 'brick'); band(w, 0, 3.92, y(1.05), y(1.25)); }
    X.rectOpen(X.seg(2.33, 3.92, 2.33, 0), 1.4, 2.2, y(1.25), y(3.2), { fill: 'glassB', D: 0.14, frame: K.WHITE, rows: 2, rev: ST });
    K.roof(false, -0.35, 5.6, 2.33, 12.4, y(eave), 10.8 - eave, 0.35, { gutter: 'both', rakes: [[-0.35, 0]], col: ROOF });
    X.gwall(X.seg(12.4, 5.6, 2.33, 5.6), 0, 10.07, y(eave), y(eave), y(10.8), [], BR);
    // --- main body: south gable end (the west bay with its arched door), west, north and east walls, the long roof
    const wMS = X.seg(0, 3.92, 17.4, 3.92);
    X.gwall(wMS, 0, 17.4, gl, y(eave), y(10.0), [[0.75, 1.65, y(FL), y(3.0 + 0.45)]], BR, 'brick', 8.7, 12.7);
    X.archOpen(wMS, 0.75, 1.65, y(FL), y(3.0), { kind: 'round', fill: C(0x6e5a48), D: 0.2, col: BR, rev: ST, band: [0.2, BRd, 0.03], sill: null });
    band(wMS, 0, 2.33, y(1.05), y(1.25)); X.fillPoly(X.off(wMS, -0.17), [[0.85, y(FL + 1.2)], [1.55, y(FL + 1.2)], [1.55, y(2.8)], [0.85, y(2.8)]], 0, 'pane');
    { const w = X.seg(0.3, 3.92, 2.1, 3.92); K.box(0.3, 2.1, 2.9, 3.92, gl, y(FL - 0.02), CONC); X.stairs(w, 0, 1.8, 1.02, 9, 0.3, y(FL - 0.2), 0.18, CONC, gl); X.rail(w, 0.05, 1.02, 3.72, y(FL - 0.2), y(FL - 1.64), 0.9, MET); }
    const wMW = X.seg(0, 36.05, 0, 3.92), sw = [[19.0, 20.1], [23.5, 24.6], [28.0, 29.1]], nw = [1.0, 5.0, 9.0, 13.0];   // s = 36.05 - b
    K.wall(wMW, 0, 32.13, gl, y(eave), [...sw.map(([a, b]) => [a, b, y(1.25), y(3.4 + 0.55)]), ...nw.map((s) => [s, s + 1.0, y(1.2), y(2.9)])], BR, gl, 'brick');
    for (const [a, b] of sw) X.archOpen(wMW, a, b, y(1.25), y(3.4), { kind: 'round', fill: 'glassB', D: 0.16, col: BR, rev: ST, band: [0.2, BRd, 0.03], sill: ST });
    for (const s of nw) { K.opening(wMW, s, s + 1.0, y(1.2), y(2.9), 'S6'); wMW.box(s - 0.1, s + 1.1, 0, 0.08, y(1.1), y(1.2), ST, true); }
    band(wMW, 15, 32.13, y(1.05), y(1.25));
    const wMN = X.seg(17.4, 36.05, 0, 36.05);
    X.gwall(wMN, 0, 17.4, gl, y(eave), y(10.0), [[3.5, 4.5, y(1.2), y(2.9)], [8.2, 9.2, y(1.2), y(2.9)], [12.9, 13.9, y(1.2), y(2.9)]], BR);
    for (const s of [3.5, 8.2, 12.9]) K.opening(wMN, s, s + 1.0, y(1.2), y(2.9), 'S6');
    // the long main roof (lidar ridge 10 m) by hand, as the kit's roof() would run its east eave (overhang, fascia, gutter) across the faces
    // of the two east gables: here that eave stops at each gable, as the photo's gutter dies against the gable's side
    { const ov = 0.4, cm = 8.7, k = (10.0 - eave) / cm, len = Math.hypot(1, k), th = 0.12, yr = y(10.0), h = (a) => yr - Math.abs(a - cm) * k, P = K.P, TR = K.TRIM;
      const dv = (a) => ((cm + ov - Math.abs(a - cm)) * len) / 2;   // shingle courses counted from the eave line, so the runs line up
      for (const [sg, b0, b1, ce] of [[-1, 3.6, 36.4, -ov], [1, 3.6, 4.2, 17.4 + ov], [1, 4.2, 13.2, 17.38], [1, 13.2, 13.9, 17.4 + ov], [1, 13.9, 21.9, 17.38], [1, 21.9, 36.4, 17.4 + ov]]) {
        const e = h(ce), n = X.unit(K.N((sg * k) / len, 0, 1 / len));
        K.poly(K.rb, [P(ce, b0, e + th), P(ce, b1, e + th), P(cm, b1, yr + th), P(cm, b0, yr + th)], n, ROOF, [[b0 / 2, dv(ce)], [b1 / 2, dv(ce)], [b1 / 2, dv(cm)], [b0 / 2, dv(cm)]]);
        if (ce === 17.38) continue;   // inside a gable's face: no eave
        K.poly(K.hb, [P(ce, b0, e - 0.08), P(ce, b1, e - 0.08), P(ce, b1, e + th + 0.02), P(ce, b0, e + th + 0.02)], K.N(sg, 0, 0), TR);
        K.poly(K.hb, [P(ce, b0, e - 0.08), P(ce, b1, e - 0.08), P(ce - sg * ov, b1, e - 0.08), P(ce - sg * ov, b0, e - 0.08)], X.dn, TR);
        K.box(Math.min(ce, ce + sg * 0.13), Math.max(ce, ce + sg * 0.13), b0 + 0.05, b1 - 0.05, e - 0.1, e + 0.04, C(0xd8d9d6), true);
      }
      for (const ce of [-ov, 17.4 + ov]) {
        const e = h(ce), sg = Math.sign(ce - cm);
        K.poly(K.rb, [P(cm, 3.58, yr + th + 0.04), P(cm, 36.42, yr + th + 0.04), P(cm + sg * 0.16, 36.42, yr + th - 0.16 * k + 0.02), P(cm + sg * 0.16, 3.58, yr + th - 0.16 * k + 0.02)], X.unit(K.N((sg * k) / len, 0, 1 / len)), C(0x9a8f88), [[0.1, 0.1], [0.3, 0.1], [0.3, 0.15], [0.1, 0.15]]);
        for (const b of [3.6, 36.4]) K.poly(K.hb, [P(ce, b, e - 0.08), P(cm, b, yr - 0.08), P(cm, b, yr + th + 0.03), P(ce, b, e + th + 0.03)], K.N(0, b < cm ? -1 : 1, 0), TR);
        for (const [b0, b1] of [[3.6, 3.92], [36.05, 36.4]]) K.poly(K.hb, [P(ce, b0, e - 0.08), P(ce, b1, e - 0.08), P(cm, b1, yr - 0.08), P(cm, b0, yr - 0.08)], X.unit(K.N((-sg * k) / len, 0, -1 / len)), TR);
      } }
    // east wall, south to north: the cross gable (fan window), a short wall, the wing gable (arched door, three arched windows, four
    // small gable windows), the north end with a door
    const wC = X.seg(17.4, 4.2, 17.4, 13.2); gableFace(wC, 9.0, 9.6, 4.5);
    K.roof(true, 9.5, 17.75, 4.2, 13.2, y(eave), 9.6 - eave, 0.35, { gutter: 'both', rakes: [[17.4, 17.75]], col: ROOF });
    K.wall(X.seg(17.4, 3.92, 17.4, 4.2), 0, 0.28, gl, y(eave), [], BR, gl, 'brick');
    K.wall(X.seg(17.4, 13.2, 17.4, 13.9), 0, 0.7, gl, y(eave), [], BR, gl, 'brick');
    const wWg = X.seg(17.4, 13.9, 17.4, 21.9), aw = [2.7, 3.75, 4.8];
    X.gwall(wWg, 0, 8.0, gl, y(eave), y(7.6), [[0.6, 1.6, y(FL), y(3.0 + 0.5)], ...aw.map((s) => [s, s + 0.75, y(1.6), y(3.0 + 0.375)]), ...[2.3, 3.3, 4.3, 5.3].map((s) => [s, s + 0.45, y(5.0), y(5.6)])], BR);
    X.archOpen(wWg, 0.6, 1.6, y(FL), y(3.0), { kind: 'round', fill: C(0xefece4), D: 0.15, col: BR, rev: ST, band: [0.2, BRd, 0.03], sill: null });
    X.fillPoly(X.off(wWg, -0.12), [[0.75, y(FL + 1.3)], [1.45, y(FL + 1.3)], [1.45, y(2.85)], [0.75, y(2.85)]], 0, 'pane');
    for (const s of aw) X.archOpen(wWg, s, s + 0.75, y(1.6), y(3.0), { kind: 'round', fill: 'glassB', D: 0.15, col: BR, rev: ST, band: [0.16, BRd, 0.03], sill: ST });
    for (const s of [2.3, 3.3, 4.3, 5.3]) K.opening(wWg, s, s + 0.45, y(5.0), y(5.6), 'S1');
    band(wWg, 0, 8.0, y(1.05), y(1.25)); band(wWg, 2.0, 6.0, y(4.85), y(5.0), 0.06);
    K.roof(true, 11.0, 17.75, 13.9, 21.9, y(eave), 7.6 - eave, 0.35, { gutter: 'both', rakes: [[17.4, 17.75]], col: ROOF });
    const wEN = X.seg(17.4, 21.9, 17.4, 30.5);
    K.wall(wEN, 0, 8.6, gl, y(eave), [[3.6, 4.6, y(0.1), y(2.4)], [6.4, 7.4, y(1.2), y(2.9)]], BR, gl, 'brick');
    X.rectOpen(wEN, 3.6, 4.6, y(0.1), y(2.4), { fill: 'pane', D: 0.12, frame: C(0xd4d6d8), rev: C(0xd4d6d8), mull: 2 }); K.opening(wEN, 6.4, 7.4, y(1.2), y(2.9), 'S6');
    wEN.box(-0.2, 8.6, 0, 0.9, y(2.75), y(2.95), K.WHITE, true);   // ponytail: the 2011 canopy stands on posts 2 m out; the game's S. Jefferson St runs at this wall, so only a shallow awning
    // north-east vestibule (the footprint's bump)
    { const r = [[17.4, 30.5], [19.3, 30.5], [19.3, 36.05], [17.4, 36.05]], ws = X.seg(17.4, 30.5, 19.3, 30.5);
      K.wall(ws, 0, 1.9, gl, y(3.35), [[0.4, 1.5, y(0.1), y(2.4)]], BR, gl, 'brick'); X.rectOpen(ws, 0.4, 1.5, y(0.1), y(2.4), { fill: 'pane', D: 0.1, frame: MET, rev: MET, mull: 2 });
      K.wall(X.seg(19.3, 30.5, 19.3, 36.05), 0, 5.55, gl, y(3.35), [], BR, gl, 'brick'); K.wall(X.seg(19.3, 36.05, 17.4, 36.05), 0, 1.9, gl, y(3.35), [], BR, gl, 'brick');
      K.flat(r, y(3.1), { parapet: 0.25, coping: ST }); }
    // --- the tower: arched doorway on each street face, stone imposts and bands, two small windows a side, open belfry, merlons
    const ta = 12.7, tb = 17.2, t0 = -0.3, t1 = 4.2, th = 0.42, sill = 9.2, top = 12.05, bs = 1.25, be = 3.25, bsp = 10.55;
    const outer = [X.seg(ta, t0, tb, t0), X.seg(tb, t0, tb, t1), X.seg(tb, t1, ta, t1), X.seg(ta, t1, ta, t0)];
    const inner = [X.seg(tb - th, t0 + th, ta + th, t0 + th), X.seg(tb - th, t1 - th, tb - th, t0 + th), X.seg(ta + th, t1 - th, tb - th, t1 - th), X.seg(ta + th, t0 + th, ta + th, t1 - th)];
    // ponytail: the 2011 east door is up a stair and a ramp toward the street, but the game's S. Jefferson St roadway runs at this tower face, so
    // the east door opens at grade (a tall glazed door under the same arch; the climb to the main floor is inside); a wider road edge would allow the stair
    outer.forEach((w, i) => {
      const L = w.L, c = L / 2, door = i < 2, dy = i === 1 ? K.G(tb + 0.3, t0 + c) - 0.03 : y(FL), holes = [[c - 0.55, c - 0.1, y(6.8), y(7.5)], [c + 0.1, c + 0.55, y(6.8), y(7.5)]];
      if (door) holes.push([c - 0.7, c + 0.7, dy, y(3.0 + 0.7)]);
      K.wall(w, 0, L, gl, y(sill), holes, BR, gl, 'brick');
      if (door) {
        X.archOpen(w, c - 0.7, c + 0.7, dy, y(3.0), { kind: 'round', fill: null, D: 0.5, col: BR, rev: BRd, band: [0.26, BRd, 0.04], sill: null });
        const dw = X.off(w, -0.47), dp = arc(c - 0.7, c + 0.7, y(3.0), 'round', 12);
        X.fillPoly(dw, [[c - 0.7, dy], [c + 0.7, dy], [c + 0.7, y(3.0)], ...dp.slice(1, -1).reverse(), [c - 0.7, y(3.0)]], 0, 'pane');
        for (const s of [c - 0.7, c, c + 0.66]) dw.box(s, s + 0.05, 0, 0.05, dy, y(3.0), MET);
        for (const yy of [dy, Math.min(y(2.55), dy + 2.2), y(2.95)]) dw.box(c - 0.7, c + 0.7, 0, 0.05, yy, yy + 0.06, MET);
        for (const s of [c - 1.0, c + 0.7]) w.box(s, s + 0.3, 0, 0.08, y(2.85), y(3.05), ST);
        band(w, 0, c - 1.0, y(3.2), y(3.45)); band(w, c + 1.0, L, y(3.2), y(3.45)); band(w, 0, c - 0.7, y(1.05), y(1.25)); band(w, c + 0.7, L, y(1.05), y(1.25));
      }
      for (const s of [c - 0.55, c + 0.1]) { K.opening(w, s, s + 0.45, y(6.8), y(7.5), 'S1'); w.box(s - 0.06, s + 0.51, 0, 0.08, y(6.7), y(6.8), ST, true); }
      band(w, -0.08, L + 0.08, y(sill - 0.15), y(sill), 0.1);
      // belfry: outer and inner faces with the arch, the reveal through the wall, brick arch
      K.wall(w, 0, L, y(sill), y(top + 0.45), [[bs, be, y(sill), y(bsp + 1.0)]], BR, gl, 'brick');
      X.archOpen(w, bs, be, y(sill), y(bsp), { kind: 'round', fill: 'open', D: th, col: BR, rev: BRd, band: [0.24, BRd, 0.04], sill: null });
      const wi = inner[i], ci = wi.L / 2;
      K.wall(wi, 0, wi.L, y(sill), y(top), [[ci - 1.0, ci + 1.0, y(sill), y(bsp + 1.0)]], BR, gl, 'brick');
      X.archOpen(wi, ci - 1.0, ci + 1.0, y(sill), y(bsp), { kind: 'round', fill: 'open', col: BR, noRev: true });
      const mer = [[0, 0.75], [c - 0.4, c + 0.4], [L - 0.75, L - 0.35]];
      for (const [a0, a1] of mer) { X.sbox(w, a0, a1, -0.35, 0, y(top + 0.45), y(top + 1.15), BR, C(0x9a5444)); }
    });
    K.poly(K.hb, [[ta + th, t0 + th], [tb - th, t0 + th], [tb - th, t1 - th], [ta + th, t1 - th]].map((p) => K.P(p[0], p[1], y(sill))), X.up, C(0x8a7a6a));
    K.poly(K.hb, [[ta + th, t0 + th], [tb - th, t0 + th], [tb - th, t1 - th], [ta + th, t1 - th]].map((p) => K.P(p[0], p[1], y(top))), X.dn, C(0x6a5a4c));
    K.flat([[ta, t0], [tb, t0], [tb, t1], [ta, t1]], y(top), { parapet: 0.45, coping: C(0x9a5444), wall: BR });
    // --- the south stair to the tower door, the bell and the sign at the corner
    { const c = (ta + tb) / 2, w = X.seg(c - 1.05, -1.5, c + 1.05, -1.5);
      K.box(c - 1.05, c + 1.05, -1.5, t0, gl, y(FL - 0.02), CONC); X.stairs(w, 0, 2.1, 0, 10, 0.28, y(FL - 0.18), 0.18, CONC, gl);
      for (const s of [0.05, 1.05, 2.05]) X.rail(w, s, 0, 2.6, y(FL - 0.18), y(FL - 1.8), 0.9, MET);
      X.cheek(w, -0.3, 0, -1.2, 2.8, y(FL + 0.3), y(FL - 1.6), gl, CONC); X.cheek(w, 2.1, 2.4, -1.2, 2.8, y(FL + 0.3), y(FL - 1.6), gl, CONC);
      const bx = 16.6, by = -1.4, g0 = K.G(bx, by);   // the bell on its frame, the sign facing the corner
      K.box(bx - 0.45, bx + 0.45, by - 0.45, by + 0.45, g0 - 0.2, g0 + 0.35, CONC);
      for (const s of [-0.5, 0.5]) X.bar(K.P(bx + s * 0.7, by + s * 0.7, g0 + 0.35), K.P(bx + s * 0.7, by + s * 0.7, g0 + 1.6), 0.035, MET);
      X.bar(K.P(bx - 0.4, by - 0.4, g0 + 1.55), K.P(bx + 0.4, by + 0.4, g0 + 1.55), 0.04, MET);
      const bc = C(0x4a3a24); for (let k = 0; k < 8; k++) { const a0 = (Math.PI * k) / 4, a1 = (Math.PI * (k + 1)) / 4, P = (r, a, yy) => K.P(bx + r * Math.cos(a), by + r * Math.sin(a), yy);
        K.poly(K.hb, [P(0.32, a0, g0 + 0.55), P(0.32, a1, g0 + 0.55), P(0.18, a1, g0 + 1.2), P(0.18, a0, g0 + 1.2)], X.unit(K.N(Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0.3)), bc); }
      K.box(bx - 0.15, bx + 0.15, by - 0.15, by + 0.15, g0 + 1.2, g0 + 1.5, bc);
      const sw2 = X.seg(16.2, -5.4, 17.35, -4.25), g1 = K.G(16.8, -4.8);   // low white sign facing the street corner
      sw2.box(-0.05, 1.68, -0.1, 0.1, g1 - 0.3, g1 + 0.15, CONC); sw2.box(0, 1.63, -0.05, 0.05, g1 + 0.15, g1 + 0.6, C(0xf0eee6)); X.sign(sw2, 0.03, 1.6, g1 + 0.17, g1 + 0.58, 0.055, 'signC');
      K.wallSeg(ta, t0, tb, t0); K.wallSeg(tb, t0, tb, t1); K.wallSeg(c - 1.05, -1.5, c - 1.05, -4.3); K.wallSeg(c - 1.05, -4.3, c + 1.05, -4.3); K.wallSeg(c + 1.05, -4.3, c + 1.05, -1.5);
      K.circle(bx, by, 0.6); K.circle(16.78, -4.83, 0.6);
      K.keep(12.4, 18.5, -4.6, 6); }
    unboard('First Christian Church'); addMesh(mb);
  }

  // ---------- Bloomfield-Eastern Greene County Public Library (610) ----------
  // frame: a east along E. Mechanic from the footprint's SW corner, b north. Carnegie a 0.6..11.47 (b 0..15.2) with the entrance bay
  // a -0.5..0.6 (b 5.6..9.6) on Franklin St; link a 11.47..15.3 (b 0..22.5); addition a 15.3..30.1 (b 0..25.8). Main floor 1.5 m up.
  function library(K) {
    const f = K.fp(610), F = f.rec.floorY, U = B.util, mb = U.Buf(), X = ext(K, mb), C = K.C, y = (h) => F + h, gl = f.lo - 0.3;
    const BR = new T.Color(0.62, 0.66, 0.82), STW = C(0xf0f0f0), ST = C(0xd2ccbe), WT = C(0xeceae4), MET = C(0x262626), ROOF = C(0x8c8c8c), GRID = C(0xc4c6c4);
    const FL = 1.5, band = (w, s0, s1, ya, yb, dp = 0.09, col = ST) => w.box(s0, s1, 0, dp, ya, yb, col, true);
    // --- Carnegie block: limestone base with basement windows, brick with pilasters and stone capitals, white double sashes, frieze band
    function cwall(w, L, wins, pil) {
      K.wall(w, 0, L, gl, y(1.5), wins.map(([a, b]) => [a + 0.1, b - 0.1, y(0.05), y(1.1)]), STW, gl, 'stone');
      K.wall(w, 0, L, y(1.5), y(5.95), wins.map(([a, b]) => [a, b, y(2.3), y(4.9)]), BR, y(1.5), 'brick');
      for (const [a, b] of wins) { K.opening(w, a, b, y(2.3), y(4.9), 'S6', { split: 2 }); w.box(a - 0.12, b + 0.12, -0.02, 0.1, y(2.16), y(2.3), ST, true); K.opening(w, a + 0.1, b - 0.1, y(0.05), y(1.1), 'S6', { split: 2 }); }
      for (const [a, b] of pil) { X.sbox(w, a, b, 0, 0.12, y(1.5), y(5.5), BR); w.box(a - 0.05, b + 0.05, 0, 0.18, y(5.45), y(5.8), ST, true); }
      band(w, -0.02, L + 0.02, y(1.35), y(1.56), 0.12); band(w, 0, L, y(5.7), y(5.97), 0.07);
    }
    const sw = [[1.06, 2.86], [4.535, 6.335], [8.01, 9.81]], sp = [[0, 0.55], [3.37, 3.97], [6.9, 7.5], [10.32, 10.87]];
    cwall(X.seg(0.6, 0, 11.47, 0), 10.87, sw, sp);
    cwall(X.seg(11.47, 15.2, 0.6, 15.2), 10.87, sw, sp);
    cwall(X.seg(0.6, 15.2, 0.6, 0), 15.2, [[2.1, 3.9], [11.3, 13.1]], [[0, 0.55], [14.65, 15.2]]);   // west, s = 15.2 - b
    K.hip(false, 0, 15.2, 0.6, 11.47, y(6.5), 3.0, 0.9, { col: ROOF });
    X.tbox(8.9, 10.0, 3.2, 4.1, y(7.0), y(12.4), BR); K.box(8.82, 10.08, 3.12, 4.18, y(12.4), y(12.56), ST);
    // --- entrance bay: brick on the stone base, glazed doors in a stone frame under a hood, panel, stone drops, curved attic with the inscription
    const wB = X.seg(-0.5, 9.6, -0.5, 5.6), sides = [X.seg(0.6, 9.6, -0.5, 9.6), X.seg(-0.5, 5.6, 0.6, 5.6)];
    K.wall(wB, 0, 4.0, gl, y(1.5), [], STW, gl, 'stone'); K.wall(wB, 0, 4.0, y(1.5), y(6.0), [[1.3, 2.7, y(FL), y(4.2)]], BR, y(1.5), 'brick');
    K.opening(wB, 1.3, 2.7, y(FL), y(4.2), 'S6', { door: true, split: 2 });
    wB.box(1.05, 1.3, 0, 0.1, y(FL), y(4.42), ST); wB.box(2.7, 2.95, 0, 0.1, y(FL), y(4.42), ST); wB.box(1.05, 2.95, 0, 0.1, y(4.2), y(4.42), ST);
    wB.box(0.85, 3.15, 0, 0.3, y(4.5), y(4.72), ST, true); wB.box(0.95, 3.05, 0, 0.22, y(4.42), y(4.5), ST, true);
    for (const s of [1.0, 2.9]) wB.box(s - 0.08, s + 0.08, 0, 0.22, y(3.9), y(4.42), ST, true);
    wB.box(1.15, 2.85, 0, 0.05, y(4.95), y(5.5), ST, true);
    for (const s of [0.05, 3.55]) X.fillPoly(wB, [[s, y(5.95)], [s + 0.4, y(5.95)], [s + 0.2, y(5.15)]], 0.03, ST);
    band(wB, -0.02, 4.02, y(1.35), y(1.56), 0.12);
    for (const w of sides) { K.wall(w, 0, 1.1, gl, y(1.5), [], STW, gl, 'stone'); K.wall(w, 0, 1.1, y(1.5), y(6.0), [], BR, y(1.5), 'brick'); band(w, 0, 1.1, y(1.35), y(1.56), 0.12); K.wall(w, 0, 1.1, y(6.0), y(7.3), [], STW, y(6.0), 'stone'); band(w, -0.15, 1.1, y(6.0), y(6.25), 0.15); w.box(-0.2, 1.1, -0.1, 0.06, y(7.3), y(7.42), ST, true); }
    { const cv = arc(0, 4.0, y(7.3), 'seg', 10, 0.45);
      K.wall(wB, 0, 4.0, y(6.0), y(7.3), [], STW, y(6.0), 'stone'); for (let k = 0; k < cv.length - 1; k++) K.skin(wB, [[cv[k][0], y(7.3)], [cv[k + 1][0], y(7.3)], cv[k + 1], cv[k]], STW, y(6.0), 'stone');
      band(wB, -0.15, 4.15, y(6.0), y(6.25), 0.15); X.sign(wB, 0.35, 3.65, y(6.45), y(6.95), 0.02, 'frieze');
      for (let k = 0; k < cv.length - 1; k++) X.slab(wB, cv[k][0] - (k ? 0 : 0.12), cv[k][1], cv[k + 1][0] + (k === cv.length - 2 ? 0.12 : 0), cv[k + 1][1], -0.25, 0.1, 0.12, ST);
      K.poly(K.hb, [[-0.5, 5.6], [0.6, 5.6], [0.6, 9.6], [-0.5, 9.6]].map((p) => K.P(p[0], p[1], y(7.15))), X.up, C(0x5a5a58)); }
    // --- the stone stair, cheek walls and rails; the two globe lamps
    { const w = X.seg(-1.6, 8.9, -1.6, 6.3);
      const SC = C(0x9a968c); K.box(-1.6, -0.5, 6.3, 8.9, gl, y(FL - 0.02), SC); X.stairs(w, 0, 2.6, 0, 7, 0.32, y(FL - 0.27), 0.27, SC, gl);
      X.cheek(w, -0.3, 0, -1.1, 2.24, y(FL + 0.35), y(-0.1), gl, SC); X.cheek(w, 2.6, 2.9, -1.1, 2.24, y(FL + 0.35), y(-0.1), gl, SC);
      X.rail(w, 0.1, 0, 2.2, y(FL - 0.27), y(-0.2), 0.9, MET); X.rail(w, 2.5, 0, 2.2, y(FL - 0.27), y(-0.2), 0.9, MET);
      for (const b of [5.4, 10.0]) { const g0 = K.G(-4.3, b); X.bar(K.P(-4.3, b, g0 - 0.1), K.P(-4.3, b, g0 + 3.4), 0.05, C(0x3a3632)); K.box(-4.42, -4.18, b - 0.12, b + 0.12, g0 + 3.35, g0 + 3.45, C(0x3a3632));
        const o = K.P(-4.3, b, g0 + 3.66), v = (i, j) => { const t = (Math.PI * j) / 4 - Math.PI / 2, f = (Math.PI * i) / 4; return [o[0] + 0.21 * Math.cos(t) * Math.cos(f), o[1] + 0.21 * Math.sin(t), o[2] + 0.21 * Math.cos(t) * Math.sin(f)]; };
        for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) {   // the globe: an 8 x 4 faceted sphere in the lit-window texel (glows at dusk)
          const q = [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)], p = j === 0 ? [q[0], q[2], q[3]] : j === 3 ? q.slice(0, 3) : q, m = [0, 1, 2].map((k) => p.reduce((acc, pt) => acc + pt[k], 0) / p.length - o[k]);
          K.poly(K.hb, p, X.unit(m), C(0xf4f0e6), p.map(() => X.LIT)); }
        K.circle(-4.3, b, 0.15); }
      K.wallSeg(-1.6, 6.3, -3.9, 6.3); K.wallSeg(-3.9, 6.3, -3.9, 8.9); K.wallSeg(-3.9, 8.9, -1.6, 8.9); K.wallSeg(-1.6, 8.9, -0.5, 8.9); K.wallSeg(-0.5, 6.3, -1.6, 6.3); K.wallSeg(-0.5, 5.6, -0.5, 9.6); K.wallSeg(-0.5, 5.6, 0.6, 5.6); K.wallSeg(-0.5, 9.6, 0.6, 9.6);
      K.keep(-4.6, 0.6, 5.0, 10.4); }
    // --- link: brick, narrow glazed bays, white parapet band, flat roof
    const lk = [[11.47, 0], [15.3, 0], [15.3, 22.5], [11.47, 22.5]];
    { const w = X.seg(11.47, 0, 15.3, 0);
      K.wall(w, 0, 3.83, gl, y(6.3), [[0.45, 1.15, y(0.2), y(5.6)], [1.55, 2.25, y(0.2), y(5.6)], [2.65, 3.35, y(0.2), y(5.6)]], BR, gl, 'brick');
      for (const s of [0.45, 1.55, 2.65]) X.curtain(w, s, s + 0.7, y(0.2), y(5.6), 1, 6, GRID);
      K.wall(w, 0, 3.83, y(6.3), y(7.45), [], WT, y(6.3), 'plain'); band(w, 0, 3.83, y(6.3), y(6.45), 0.1, WT); w.box(0.6, 3.2, 0, 0.02, y(6.85), y(6.95), C(0x6a6a66)); }
    for (const w of [X.seg(14.7, 22.5, 11.47, 22.5), X.seg(11.47, 22.5, 11.47, 15.2)]) { K.wall(w, 0, w.L, gl, y(6.3), [], BR, gl, 'brick'); K.wall(w, 0, w.L, y(6.3), y(7.45), [], WT, y(6.3), 'plain'); }
    K.flat(lk, y(7.0), { parapet: 0.45, coping: WT });
    // --- addition: brick, white entablature, two glass curtain walls on the south and east faces, the north entrance, hip roof
    function awall(w, curtains, ent) {
      K.wall(w, 0, w.L, gl, y(5.8), curtains.map(([a, b]) => [a, b, y(-0.6), y(5.4)]), BR, gl, 'brick');
      for (const [a, b] of curtains) { X.curtain(w, a, b, y(-0.6), y(5.4), 4, 6, GRID); w.box(a - 0.25, b + 0.25, 0, 0.08, y(5.4), y(5.62), ST, true); }
      w.box(-0.12, w.L + 0.12, -0.02, 0.12, y(5.75), y(6.3), WT, true); w.box(-0.14, w.L + 0.14, -0.02, 0.16, y(5.68), y(5.78), WT, true);
      if (ent) { const [a, b] = ent, g0 = K.G(...X.at(w, (a + b) / 2, 1)); w.box(a + 0.6, b - 0.6, 0, 0.04, g0 + 0.02, g0 + 2.3, C(0x9a9c9c)); X.fillPoly(w, [[a + 0.7, g0 + 0.05], [b - 0.7, g0 + 0.05], [b - 0.7, g0 + 2.2], [a + 0.7, g0 + 2.2]], 0.05, 'pane'); w.box(a, b, 0, 1.4, g0 + 2.5, g0 + 2.75, WT, true); }
    }
    awall(X.seg(15.3, 0, 30.1, 0), [[2.3, 6.8], [8.8, 13.3]]);
    awall(X.seg(30.1, 0, 30.1, 25.8), [[4.0, 8.5], [13.5, 18.0]]);
    awall(X.seg(30.1, 25.8, 15.3, 25.8), [[5.2, 9.6]], [5.6, 9.2]);
    awall(X.seg(15.3, 25.8, 15.3, 22.5), []);
    K.hip(false, 0, 25.8, 15.3, 30.1, y(6.55), 3.6, 0.45, { col: ROOF });
    // --- the sign pier at the corner of Franklin and Mechanic: two brick piers with stone caps, the white arched board between
    { const w = X.seg(-1.82, -2.69, -0.98, -4.51), g0 = K.G(-1.4, -3.6);
      for (const [s0, s1] of [[-0.1, 0.42], [1.42, 1.94]]) { X.sbox(w, s0, s1, -0.26, 0.26, g0 - 0.3, g0 + 1.95, BR); w.box(s0 - 0.06, s1 + 0.06, -0.32, 0.32, g0 + 1.95, g0 + 2.08, ST, true); }
      w.box(0.42, 1.42, -0.07, 0.07, g0 + 0.35, g0 + 1.85, C(0xf2f0ea)); X.sign(w, 0.45, 1.39, g0 + 0.4, g0 + 1.8, 0.075, 'signL');
      const cv = arc(0.38, 1.46, g0 + 1.85, 'seg', 8, 0.22); for (let k = 0; k < cv.length - 1; k++) X.slab(w, cv[k][0], cv[k][1], cv[k + 1][0], cv[k + 1][1], -0.12, 0.12, 0.1, C(0xf2f0ea));
      K.skin(w, [[1.42, g0 + 1.85], [0.42, g0 + 1.85], ...cv.filter((p) => p[0] >= 0.42 && p[0] <= 1.42)], C(0xf2f0ea), 0, 'plain');
      K.circle(-1.4, -3.6, 1.0); K.keep(-3, 0.2, -5.2, -2); }
    unboard('Bloomfield Public Library'); addMesh(mb);
  }

  B.heroPlugins = (B.heroPlugins || []).concat(
    { id: 'methodist641', name: 'Bloomfield United Methodist Church', footprints: [641], dir: [21.8, 0.3], build: methodist },
    { id: 'christian636', name: 'First Christian Church', footprints: [636], dir: [1, 0.0188], build: christian },
    { id: 'library610', name: 'Bloomfield-Eastern Greene County Public Library', footprints: [610], dir: [29.4, 0.4], build: library });
})();
