/* Bloomfield Drift — cars: lofted car models and the reflection environment.
   Every body is one skin lofted from cross-sections along the car (about 60 stations x 21 rows per side). A section is driven by
   five smooth curves per car (top and bottom centreline, plan half-width, shoulder line, boxiness); wheel arches are real openings
   (the lowest side row follows the arch circle), glass, pillars, two-tone panels and the pickup bed are cells of the same grid
   given another material, and lamps, grilles and badges are patches projected onto the skin. Glass is see-through: a dark
   headliner, dash, seats and steering wheel sit behind it. Each car's entry in DEF is drawn from the real car: nose lean and overhangs,
   cowl, roof peak, glass rake and deck in the profile; pillars, quarter glass and belt kick-up in the window outline; then the face and
   tail graphics (Mazda shield grille, wing and slit lamps over a forward-leaning nose; Ranger slot grille, Flareside fenders and Splash
   stripe; Passat three-bar grille band and six-window cabin; Dart crosshair and racetrack lamp; Mustang tri-bars; Miata almond lamps
   and oval mouth; Crown Victoria police livery).
   ponytail: the skin has 5 rows across the hood and one optional shoulder crease, so hood bulges, bonnet creases and sculpted
   door lines are not modelled (likeness is profile, window outline and graphics); add rows 10-14 and a crease list to go further.
   Public surface:
     BD.buildCar(spec) -> { group, wheels[FL,FR,RL,RR], steer[L,R], brake (MeshBasicMaterial), setLights(on), noseX, tailX }
       local frame +X forward, +Y up, +Z right, origin = centre of gravity on the ground. Body paint is the only material whose
       colour equals lin(spec.color). setLights(true) gives the night look: head, tail and marker lamps lit and the (daytime)
       environment reflections turned down; setLights(false) restores the day look. No real light sources, nothing per frame.
     BD.makeEnv(renderer) -> PMREM environment texture (low warm sun in the south-west, blue zenith, autumn tree line and ground). */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {}), PI = Math.PI;
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear(), W1 = [1, 1, 1];
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), sq = (x) => x * x;
  const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

  // monotone cubic through knots [x, y, corner]; a corner knot keeps the slopes of its two neighbouring segments (a crease)
  function curve(k) {
    const n = k.length, ml = [], mr = [], dl = [];
    for (let i = 0; i < n - 1; i++) dl[i] = (k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]);
    for (let i = 0; i < n; i++) {
      const a = dl[i - 1], b = dl[i];
      if (i === 0) ml[i] = mr[i] = b; else if (i === n - 1) ml[i] = mr[i] = a;
      else if (k[i][2]) { ml[i] = a; mr[i] = b; } else if (a * b <= 0) ml[i] = mr[i] = 0;
      else { const h0 = k[i][0] - k[i - 1][0], h1 = k[i + 1][0] - k[i][0], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; ml[i] = mr[i] = (w1 + w2) / (w1 / a + w2 / b); }
    }
    return (x) => {
      if (x <= k[0][0]) return k[0][1]; if (x >= k[n - 1][0]) return k[n - 1][1];
      let i = 0; while (k[i + 1][0] < x) i++;
      const h = k[i + 1][0] - k[i][0], t = (x - k[i][0]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * k[i][1] + (t3 - 2 * t2 + t) * h * mr[i] + (3 * t2 - 2 * t3) * k[i + 1][1] + (t3 - t2) * h * ml[i + 1];
    };
  }

  // ---- indexed triangle builder; normals come from vertex sharing ----
  const M4 = new T.Matrix4(), V3 = new T.Vector3(), E3 = new T.Euler(), Q3 = new T.Quaternion(), S3 = new T.Vector3();
  function Bld() { this.p = []; this.i = []; this.c = []; this.c2 = []; this.uv = []; this.col = null; this.col2 = null; }
  Bld.prototype = {
    v(x, y, z) {
      this.p.push(x, y, z); const a = this.col, b = this.col2 || a;
      if (a) { this.c.push(a[0], a[1], a[2]); this.c2.push(b[0], b[1], b[2]); }
      return this.p.length / 3 - 1;
    },
    quad(a, b, c, d, flip) { if (flip) this.i.push(a, c, b, a, d, c); else this.i.push(a, b, c, a, c, d); },
    // append a three.js geometry at (x, y, z), turned ry about Y then rz about Z; sz = -1 mirrors it across its own XY plane
    add(g, x, y, z, rz, sz, ry) {
      M4.compose(V3.set(x, y, z), Q3.setFromEuler(E3.set(0, ry || 0, rz || 0, 'ZYX')), S3.set(1, 1, sz || 1));
      const p = g.attributes.position, ix = g.index, o = this.p.length / 3, fl = sz < 0, n = ix ? ix.count : p.count;
      for (let k = 0; k < p.count; k++) { V3.fromBufferAttribute(p, k).applyMatrix4(M4); this.v(V3.x, V3.y, V3.z); }
      for (let k = 0; k < n; k += 3) { const a = ix ? ix.getX(k) : k, b = ix ? ix.getX(k + 1) : k + 1, c = ix ? ix.getX(k + 2) : k + 2; this.i.push(o + a, o + (fl ? c : b), o + (fl ? b : c)); }
      return this;
    },
    box(x, y, z, sx, sy, sz, rz) { return this.add(new T.BoxGeometry(sx, sy, sz), x, y, z, rz); },
    geo() {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setIndex(this.i);
      if (this.c.length) g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
      if (this.uv.length) g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
      g.computeVertexNormals(); return g;
    },
  };

  // ---- body section ----
  // rows per side: 0-2 floor (centre, mid, sill corner), 3-10 body side (sill to shoulder), 10-14 fender top / hood / deck / belt shelf
  // (shoulder to the foot of the cabin), 14-15 body-colour panel under the side glass (zero height unless the car's gr curve lifts the
  // lower glass edge, which is how a window line kicks up into a thick pillar), 15-17 side glass, 17-19 pillar and roof rail,
  // 19-22 windscreen / roof / rear glass to the centreline
  const NR = 23, U = [0, 0.1, 0.24, 0.4, 0.56, 0.72, 0.87, 1], SH = [0.955, 0.83, 0.5, 0], RF = [0, 0.62, 0.31, 0], PT = [0, 0.5, 0.82, 0.97, 1], O = {};
  function zLow(c, o, d, y) {      // half-width of the body side at height y
    const u = clamp((y - o.yb) / (o.ys - o.yb), 0, 1), uw = c.uw;
    let z = o.w - (u < uw ? o.tuck * sq(1 - u / uw) : o.ins * sq((u - uw) / (1 - uw))) + c.cr * sstep(0.1, 0.6, d) * Math.max(0, 1 - Math.abs(u - 0.87) / 0.14);   // cr: shoulder crease, faded out round the nose (it runs along the sides, not across the bumper)
    if (c.cv) z -= c.cv * sq(Math.max(0, 1 - sq((u - 0.5) / 0.42))) * sstep(c.ax[0].d + 0.3, c.ax[0].d + 0.9, d) * (1 - sstep(c.ax[1].d - 0.9, c.ax[1].d - 0.35, d));   // cv: doors hollowed between the arches
    for (const a of c.ax) {
      if (a.pon) { const p = a.pon, yT = p.f(d), t = (y - yT + p.r) / p.r; if (t < 1) z += a.fl * p.g(d) * (t <= 0 ? 1 : Math.sqrt(1 - t * t)); }      // separate fender with a rounded top edge
      else { const dd = Math.hypot(d - a.d, y - a.R) - a.Ra; if (dd < a.band) z += a.fl * sq(sq(1 - sq(Math.max(0, dd) / a.band))); }
    }
    return z;
  }
  // section parameters at distance d behind the nose. The lower body is closed by a crowned deck (hood, boot lid, or the shelf under the
  // glass); the cabin stands on it: flat side glass leaning in by the tumblehome, a rounded rail, and a roof crowned across the car.
  function prof(c, d, o) {
    const yb = c.fb(d), tp = Math.max(c.ft(d), yb + 1e-4), cab = d > c.dc && d < c.db, yl = cab ? c.tdc + (c.tdb - c.tdc) * (d - c.dc) / (c.db - c.dc) : tp;
    const sc = Math.min(1, (yl - yb) / 0.5), f = c.fsf + (1 - c.fsf) * sstep(c.dc - 0.3, c.dc + 0.05, d) * (1 - sstep(c.db - 0.05, c.db + 0.3, d));
    o.yb = yb; o.yt = tp; o.ys = Math.max(yb + 5e-5, Math.min(c.fs(d), yb + f * (yl - yb))); o.yd = cab ? Math.max(yl, o.ys + 0.012) : tp;
    o.w = c.fw(d) * c.W2; o.tuck = c.tuck * sc; o.ins = c.ins * sc; o.rc = 0.035 * sc; o.q = c.fn(d);
    o.zs = zLow(c, o, d, o.ys); o.cw = o.wh = 0;
    if (cab && tp > o.yd + 1e-4) {      // foot of the cabin: where its crowned top comes out of the deck (cw), and how tall its side is there (wh)
      const gw = Math.max(0.05, o.zs - c.sf), cr = c.fc(d), e = tp - o.yd, g = o.yd - o.ys, F = (z) => e - cr * sq(z / gw) + g * Math.pow(z / o.zs, o.q);
      if (F(gw) >= 0) { o.cw = gw; o.wh = F(gw); } else { let lo = 0, hi = gw; for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (F(m) > 0) lo = m; else hi = m; } o.cw = lo; }
    }
    return o;
  }
  const deckY = (o, z) => o.ys + (o.yd - o.ys) * (1 - Math.pow(clamp(z / o.zs, 0, 1), o.q));
  function sect(c, d, Z, Y, k) {
    const o = prof(c, d, O); let y0 = o.yb + o.rc, ar = 0;
    for (const a of c.ax) { const dx = Math.abs(d - a.d); if (dx <= a.Ra + 1e-5) { y0 = Math.min(a.R + Math.sqrt(Math.max(0, a.Ra * a.Ra - dx * dx)), o.ys - 0.03); ar = 1; } }
    const pn = c.pon && d > c.pon.d0 && d <= c.pon.d1 ? c.ax[1].pon : null, yT = pn ? pn.f(d) : 0, ya = pn ? Math.max(y0 + 0.01, yT - pn.r) : 0;      // rows gather on a fender's top edge
    for (let q = 0; q < 8; q++) { const y = !pn ? y0 + (o.ys - y0) * U[q] : q === 0 ? y0 : q === 1 ? (y0 + ya) / 2 : q === 7 ? o.ys : ya + (yT - ya) * PT[q - 2]; Y[k + 3 + q] = y; Z[k + 3 + q] = zLow(c, o, d, y); }
    if (ar) { Z[k + 2] = Z[k + 3] - 0.05; Y[k + 2] = Y[k + 3]; } else { Z[k + 2] = Math.max(0, Z[k + 3] - o.rc); Y[k + 2] = o.yb; }   // arch lip / sill corner
    Z[k + 1] = ar ? Math.min(Z[k + 2] * 0.6, c.zin) : Z[k + 2] * 0.6; Y[k + 1] = Y[k] = o.yb; Z[k] = 0;      // the floor carries on between the arches
    const cw = o.cw, wh = o.wh, tp = o.yt;
    for (let q = 0; q < 4; q++) { const z = cw + (o.zs - cw) * SH[q]; Z[k + 11 + q] = z; Y[k + 11 + q] = deckY(o, z); }
    const yf = Y[k + 14], r = Math.min(c.rail, wh * 0.5), cz = cw - c.tum * wh, cy = yf + wh, drop = tp - cy, gb = c.fg ? c.fg(d) : 0;
    for (let q = 0; q < 3; q++) { const t = (gb + (1 - gb) * q / 2) * (wh - r); Z[k + 15 + q] = cw - c.tum * t; Y[k + 15 + q] = yf + t; }
    Z[k + 18] = cz - 0.29 * r; Y[k + 18] = cy - 0.29 * r;
    for (let q = 0; q < 4; q++) { const z = q ? cz * RF[q] : cz - Math.max(1.2 * r, 0.2 * cz * clamp(1 - wh / 0.15, 0, 1)); Z[k + 19 + q] = z; Y[k + 19 + q] = cz > 1e-6 ? tp - drop * sq(z / cz) : tp; }
    return o;
  }

  // ---- the seven cars. Lengths in metres, d = distance behind the nose, heights above the ground. ----
  // top / bot: centreline profile; hw: plan half-width as a fraction of W/2; sh: shoulder (fender top, belt line, deck edge);
  // nk: boxiness of hood, cabin, deck; dc / db: cowl and rear end of the cabin; ws / rw: windscreen and rear glass; sg: side glass
  // [front, rear]; bp: pillars inside it; sl: [lean of the rear glass edge, where the lean starts]; doors: shut lines; cv: depth of
  // the hollow in the doors; fo: front overhang. A corner knot in top a few cm before db, 3-5 cm above the deck, ends the rear glass
  // on a step so its base stays full width (without it the cabin tapers to a point on the centreline).
  const HD = [0.72, 0.76, 0.82], HN = [2.6, 2.5, 2.1], TD = [0.26, 0.012, 0.012], TN = [1.1, 0.05, 0.03], AD = [0.8, 0.36, 0.03], AN = [1.1, 0.5, 0.04], WD = [0.74, 0.74, 0.7], WN = [0.45, 0.45, 0.42];
  const R4 = (z0, z1, y0, y1) => (u, v) => [z0 + (z1 - z0) * u, y0 + (y1 - y0) * v];
  const Q4 = (a, b, c, d) => (u, v) => [(a[0] + (b[0] - a[0]) * u) * (1 - v) + (d[0] + (c[0] - d[0]) * u) * v, (a[1] + (b[1] - a[1]) * u) * (1 - v) + (d[1] + (c[1] - d[1]) * u) * v];
  const DISC = (cz, cy, r0, r1, ky) => (u, v) => { const r = r0 + (r1 - r0) * u, t = v * 2 * PI; return [cz + r * Math.cos(t), cy + r * Math.sin(t) * (ky || 1)]; };
  // BN: a band between two polylines of equal knot count, [z, y] in front view (lamps and grilles with shaped outlines)
  const pl = (k, u) => { const t = u * (k.length - 1), i = Math.min(k.length - 2, Math.floor(t)), f = t - i; return [k[i][0] + (k[i + 1][0] - k[i][0]) * f, k[i][1] + (k[i + 1][1] - k[i][1]) * f]; };
  const BN = (lo, hi) => { const f = (u, v) => { const a = pl(lo, u), e = pl(hi, u); return [a[0] + (e[0] - a[0]) * v, a[1] + (e[1] - a[1]) * v]; }; f.n = lo.length - 1; return f; };
  // end shapes: an upright face rolling into the hood / deck (top), the valance (bottom) or the fender line (shoulder) within 7k cm
  // of the tip, and the plan outline of a corner (half-width as a fraction of W/2: f0 at the tip, w1 from 70k cm in)
  const EX = [0, 0.004, 0.012, 0.03, 0.07], EF = [0, 0.45, 0.75, 0.93, 1], PX = [0, 0.01, 0.03, 0.07, 0.15, 0.35, 0.7], PF = [0, 0.3, 0.5, 0.68, 0.82, 0.93, 0.985];
  const nose = (t, h, k) => EX.map((x, i) => [x * (k || 1), t + (h - t) * EF[i]]), tail = (L, t, h, k) => nose(t, h, k).map((p) => [L - p[0], p[1]]).reverse();
  const plan = (f, k, w) => PX.map((x, i) => [x * (k || 1), f + ((w || 1) - f) * PF[i]]), planT = (L, f, k, w) => plan(f, k, w).map((p) => [L - p[0], p[1]]).reverse();
  const DEF0 = { fsf: 0.9, tuck: 0.06, ins: 0.035, uw: 0.55, tum: 0.3, nk: [2.8, 4.5, 3], bp: [], cells: [], arch: 0.065, fl: [0.012, 0.1, 0.012, 0.1], tw: 0.225, rr: 0.68, wheel: { ns: 5, sw: 0.05, col: 0.6 }, pm: {}, rwj: 19, seats: 4, wrap: 0.1, cr: 0, sf: 0.04, rail: 0.045, crn: [0.11, 0.05, 0.09] };
  const DEF = {
    mazda3: {
      fo: 0.93, tum: 0.4, fsf: 0.93, sf: 0.05, arch: 0.05, cv: 0.035, rwj: 20, nk: [3.2, 4.2, 3.4], dc: 1.42, db: 4.3, ws: [1.5, 2.2], rw: [4.045, 4.275], sg: [1.64, 3.52], bp: [[2.52, 2.6]], doors: [1.5, 2.56, 3.46],
      gr: [[2.8, 0], [3.1, 0.14], [3.32, 0.5], [3.52, 1]], crk: [[1.42, 0.11], [2.1, 0.11], [2.5, 0.055], [3, 0.07], [3.5, 0.12], [3.9, 0.14], [4.18, 0.08], [4.3, 0.03]],
      top: [...nose(0.675, 0.765), [0.4, 0.82], [0.9, 0.89], [1.42, 0.955, 1], [1.8, 1.19], [2.2, 1.395], [2.5, 1.435], [2.75, 1.44], [3.2, 1.42], [3.6, 1.375], [3.9, 1.315], [4.03, 1.285, 1], [4.04, 1.255, 1], [4.27, 1.085, 1], [4.3, 1.04, 1], [4.35, 1.02], ...tail(4.46, 0.7, 0.985)],
      // the rear glass ends on a small step above the hatch (knot at 4.27), so its base stays full width instead of running to a point
      bot: [[0, 0.675], [0.006, 0.62], [0.022, 0.52], [0.05, 0.4], [0.08, 0.31], [0.12, 0.25], [0.2, 0.21], [0.4, 0.185], [0.7, 0.165], [3.6, 0.165], [4.05, 0.22], [4.3, 0.28], ...tail(4.46, 0.7, 0.33)],      // shark nose: the grille leans forward
      hw: [...plan(0.58), [0.93, 0.995], [1.8, 1], [2.9, 1], [3.5, 1], ...planT(4.46, 0.64, 1.1)],
      sh: [...nose(0.675, 0.735, 2), [0.5, 0.8], [0.93, 0.865], [1.42, 0.925], [2, 0.965], [2.8, 1], [3.4, 1.05], [3.9, 1.085], [4.15, 1.07], ...tail(4.46, 0.7, 0.99, 3)],
      pm: { m: 0.2, r: 0.32 }, wheel: { ns: 10, sw: 0.026, col: 0.05, pair: 0.14 }, rr: 0.7,
      det(K) {
        const mz = (k) => k.concat(k.slice(0, -1).reverse().map((p) => [-p[0], p[1]]));      // mirror a half outline that ends on the centreline
        K.P('mesh', 0, BN(mz([[-0.43, 0.685], [-0.36, 0.45], [-0.26, 0.378], [0, 0.363]]), mz([[-0.43, 0.69], [-0.4, 0.7], [-0.28, 0.705], [0, 0.71]])), 6, 4, 0.004, 0, 0, 1);      // shield grille, black mesh
        K.P('dchrome', 0, BN(mz([[-0.8, 0.69], [-0.62, 0.636], [-0.47, 0.612], [-0.385, 0.44], [-0.275, 0.354], [0, 0.338]]), mz([[-0.8, 0.697], [-0.62, 0.657], [-0.445, 0.64], [-0.36, 0.452], [-0.26, 0.38], [0, 0.365]])), 10, 1, 0.007, 0, 0, 1);      // signature wing: under the grille, then out under the lamps with a line of paint between, tapering
        K.P('chrome', 0, DISC(0, 0.6, 0.035, 0.062), 1, 14, 0.009, 0, 0, 1);
        K.P('trim', 0, BN([[0.43, 0.652], [0.62, 0.674], [0.87, 0.73]], [[0.43, 0.735], [0.62, 0.755], [0.87, 0.772]]), 4, 2, 0.005);      // swept headlamps: a dark housing a third as tall as it is wide,
        K.P('lamps', 0, BN([[0.46, 0.708], [0.62, 0.728], [0.84, 0.752]], [[0.46, 0.724], [0.62, 0.744], [0.84, 0.763]]), 4, 1, 0.008, HD, HN);      // a light blade under its upper edge
        K.P('lamps', 0, DISC(0.545, 0.686, 0.015, 0.029), 1, 12, 0.008, HD, HN);      // and a round projector ring
        K.P('trim', 0, BN([[0.52, 0.33], [0.78, 0.36]], [[0.52, 0.375], [0.78, 0.42]]), 2, 1, 0.004);      // corner intakes
        K.P('trim', 0, R4(-0.5, 0.5, 0.235, 0.27), 4, 1, 0.004, 0, 0, 1);
        K.c.wrap = 0.26;
        K.P('lamps', 1, BN([[0.33, 0.892], [0.62, 0.875], [0.99, 0.885]], [[0.33, 0.938], [0.62, 0.957], [0.99, 0.95]]), 6, 1, 0.005, [0.07, 0.008, 0.008], [0.3, 0.015, 0.01]);
        for (const z of [0.47, 0.71]) { const r = z > 0.6 ? 0.036 : 0.028; K.P('lamps', 1, DISC(z, 0.917, r * 0.55, r), 1, 14, 0.008, [0.45, 0.02, 0.02], TN); K.P('brake', 1, DISC(z, 0.917, 0, r * 0.5), 1, 14, 0.008); }
        K.c.wrap = 0.1;
        K.P('chrome', 1, DISC(0, 0.915, 0.03, 0.052), 1, 14, 0.007, 0, 0, 1);
        K.P('trim', 1, BN([[-0.72, 0.3], [0.72, 0.3]], [[-0.62, 0.48], [0.62, 0.48]]), 4, 2, 0.004, 0, 0, 1);      // black lower bumper insert
        K.P('lamps', 1, R4(0.66, 0.82, 0.5, 0.525), 2, 1, 0.005, [0.3, 0.01, 0.01], [0.5, 0.02, 0.02]);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.5, 0.63), 1, 1, 0.005, WD, WN, 1);      // the plate sits low, in the bumper
        K.P('brake', 1, R4(-0.2, 0.2, 1.262, 1.28), 2, 1, 0.004, 0, 0, 1);
        for (const z of [-0.47, 0.47]) { K.b('chrome').add(new T.CylinderGeometry(0.058, 0.058, 0.1, 14, 1, true), K.c.x0 - 4.43, 0.36, z, PI / 2); K.b('trim').add(new T.CircleGeometry(0.05, 12).rotateY(-PI / 2), K.c.x0 - 4.44, 0.36, z); }      // the Turbo's two large tailpipes
        K.b('paint').add(new T.ConeGeometry(1, 1, 8).scale(0.08, 0.05, 0.02), K.c.x0 - 3.8, K.c.ft(3.8) + 0.02, 0);      // shark-fin antenna
      },
    },
    passat: {
      fo: 0.96, cr: 0.026, fsf: 0.95, tuck: 0.045, tum: 0.27, crn: [0.11, 0.05, 0.05], dlo: 'chrome', nk: [3.6, 4.5, 4.4], dc: 1.33, db: 4.27, ws: [1.41, 2.06], rw: [3.68, 4.23], sg: [1.56, 3.92], bp: [[2.58, 2.66], [3.5, 3.55]], sl: [0.36, 3.25], doors: [1.46, 2.62, 3.6],
      top: [...nose(0.52, 0.815, 1.3), [0.3, 0.86], [0.7, 0.912], [1.05, 0.945], [1.33, 0.965, 1], [1.7, 1.22], [2.06, 1.415], [2.35, 1.475], [2.75, 1.49], [3.3, 1.478], [3.68, 1.425], [4, 1.25], [4.27, 1.105, 1], [4.55, 1.097], [4.72, 1.087], ...tail(4.87, 0.62, 1.075, 1.3)],
      bot: [...nose(0.5, 0.22), [0.3, 0.185], [0.7, 0.17], [3.9, 0.17], [4.4, 0.215], [4.7, 0.27], ...tail(4.87, 0.62, 0.3)],
      hw: [...plan(0.72), [0.96, 0.995], [1.8, 1], [3.3, 1], [3.9, 0.995], ...planT(4.87, 0.78, 0.9)],
      sh: [...nose(0.52, 0.79, 2), [0.5, 0.85], [0.96, 0.895], [1.33, 0.925], [1.8, 0.95], [2.6, 0.965], [3.4, 0.985], [4, 1.01], [4.27, 1.03], [4.6, 1.03], ...tail(4.87, 0.62, 1.015, 2)],
      pm: { m: 0.6, r: 0.34 }, wheel: { ns: 10, sw: 0.034, col: 0.62 }, rr: 0.65,
      det(K) {
        K.P('trim', 0, R4(-0.45, 0.45, 0.635, 0.78), 6, 2, 0.004, 0, 0, 1);      // grille and lamps read as one band: three chrome bars running into squared-off lamps
        for (const y of [0.647, 0.695, 0.743]) K.P('chrome', 0, R4(-0.44, 0.44, y, y + 0.026), 6, 1, 0.008, 0, 0, 1);
        K.P('chrome', 0, DISC(0, 0.708, 0.04, 0.068), 1, 14, 0.012, 0, 0, 1); K.P('trim', 0, DISC(0, 0.708, 0, 0.04), 1, 14, 0.012, 0, 0, 1);
        K.P('trim', 0, Q4([0.45, 0.635], [0.89, 0.67], [0.89, 0.788], [0.45, 0.78]), 4, 2, 0.004);
        K.P('lamps', 0, Q4([0.47, 0.652], [0.865, 0.685], [0.865, 0.772], [0.47, 0.766]), 4, 2, 0.008, HD, HN);
        K.P('trim', 0, R4(0.685, 0.693, 0.672, 0.77), 1, 2, 0.011);      // the split between main beam and turn signal
        K.P('mesh', 0, R4(-0.5, 0.5, 0.27, 0.39), 4, 1, 0.004, 0, 0, 1); K.P('chrome', 0, R4(-0.5, 0.5, 0.325, 0.338), 4, 1, 0.008, 0, 0, 1);
        K.P('lamps', 0, R4(0.6, 0.78, 0.3, 0.36), 2, 1, 0.006, HD, HN);
        K.c.wrap = 0.2;
        K.P('lamps', 1, Q4([0.34, 0.85], [0.98, 0.87], [0.98, 0.975], [0.34, 0.97]), 6, 2, 0.005, TD, TN); K.P('brake', 1, Q4([0.62, 0.875], [0.9, 0.885], [0.9, 0.96], [0.62, 0.955]), 3, 1, 0.012);
        K.P('lamps', 1, Q4([0.4, 0.914], [0.54, 0.917], [0.54, 0.933], [0.4, 0.93]), 2, 1, 0.012, [0.45, 0.45, 0.42], WD);      // reversing lamp in the lid half
        K.P('trim', 1, R4(0.588, 0.598, 0.858, 0.976), 1, 3, 0.014);      // the boot lid cuts the lamp in two
        K.c.wrap = 0.1;
        K.P('chrome', 1, R4(-0.34, 0.34, 0.83, 0.848), 4, 1, 0.006, 0, 0, 1);
        K.P('chrome', 1, DISC(0, 0.935, 0.03, 0.055), 1, 14, 0.008, 0, 0, 1);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.7, 0.84), 1, 1, 0.005, WD, WN, 1);
        K.P('trim', 1, R4(-0.7, 0.7, 0.3, 0.4), 4, 1, 0.004, 0, 0, 1);      // hidden exhaust
        K.P('lamps', 1, R4(0.58, 0.8, 0.47, 0.5), 2, 1, 0.006, TD, TD);
        K.P('brake', 1, R4(-0.17, 0.17, 1.375, 1.39), 2, 1, 0.004, 0, 0, 1);
      },
    },
    dart: {
      fo: 0.94, cr: 0.02, fsf: 0.93, crn: [0.11, 0.05, 0.035], nk: [3.4, 4.5, 4], dc: 1.2, db: 4.3, ws: [1.28, 1.98], rw: [3.52, 4.275], sg: [1.44, 3.66], bp: [[2.46, 2.54], [3.34, 3.37]], sl: [0.42, 2.75], doors: [1.34, 2.5, 3.5], fl: [0.012, 0.1, 0.024, 0.24],
      top: [...nose(0.5, 0.755, 1.2), [0.3, 0.81], [0.7, 0.88], [1, 0.92], [1.2, 0.95, 1], [1.6, 1.21], [1.98, 1.395], [2.3, 1.455], [2.6, 1.47], [3.1, 1.44], [3.52, 1.365], [4, 1.225], [4.27, 1.168, 1], [4.3, 1.135, 1], [4.5, 1.143], [4.6, 1.143], ...tail(4.67, 0.64, 1.125, 0.7)],
      bot: [...nose(0.5, 0.22), [0.3, 0.185], [0.7, 0.165], [3.7, 0.165], [4.2, 0.21], [4.5, 0.27], ...tail(4.67, 0.64, 0.3)],
      hw: [...plan(0.6), [0.94, 0.99], [1.8, 0.99], [3.1, 0.985], [3.7, 0.98], ...planT(4.67, 0.66)],
      sh: [...nose(0.5, 0.69, 2), [0.5, 0.785], [0.94, 0.86], [1.2, 0.905], [1.7, 0.96], [2.5, 0.995], [3.3, 1.05], [3.9, 1.095], [4.3, 1.11], [4.5, 1.11], ...tail(4.67, 0.64, 1.09, 1.4)],
      pm: { m: 0.4, r: 0.3 }, wheel: { ns: 5, sw: 0.06, col: 0.5 },
      det(K) {
        K.P('mesh', 0, R4(-0.42, 0.42, 0.618, 0.706), 6, 2, 0.004, 0, 0, 1);
        K.P('paint', 0, R4(-0.42, 0.42, 0.656, 0.668), 6, 1, 0.009, 0, 0, 1); K.P('paint', 0, R4(-0.012, 0.012, 0.618, 0.706), 1, 2, 0.009, 0, 0, 1);
        K.P('trim', 0, BN([[0.44, 0.62], [0.66, 0.642], [0.89, 0.716]], [[0.44, 0.706], [0.66, 0.726], [0.89, 0.738]]), 4, 2, 0.004);      // swept-back headlamps ending in a point
        K.P('lamps', 0, BN([[0.465, 0.636], [0.66, 0.658], [0.85, 0.714]], [[0.465, 0.692], [0.66, 0.712], [0.85, 0.728]]), 4, 1, 0.008, HD, HN);
        K.P('trim', 0, DISC(0.57, 0.672, 0.03, 0.039), 1, 12, 0.011);
        K.P('mesh', 0, Q4([-0.56, 0.26], [0.56, 0.26], [0.44, 0.5], [-0.44, 0.5]), 6, 3, 0.004, 0, 0, 1);
        K.P('paint', 0, R4(-0.5, 0.5, 0.375, 0.4), 6, 1, 0.01, 0, 0, 1); K.P('paint', 0, R4(-0.014, 0.014, 0.27, 0.49), 1, 3, 0.01, 0, 0, 1);
        K.P('lamps', 0, DISC(0.7, 0.36, 0, 0.045), 1, 10, 0.006, HD, HN);
        K.P('trim', 1, R4(-1, 1, 0.895, 1.04), 8, 2, 0.004, 0, 0, 1);
        for (const q of [[-0.98, 0.98, 0.91, 0.936], [-0.98, 0.98, 1, 1.026], [0.945, 0.98, 0.91, 1.026], [-0.98, -0.945, 0.91, 1.026]]) K.P('lamps', 1, R4(q[0], q[1], q[2], q[3]), q[1] - q[0] > 1 ? 8 : 1, 1, 0.007, TD, TN, 1);
        K.P('brake', 1, R4(0.5, 0.76, 0.946, 0.99), 2, 1, 0.008);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.68, 0.82), 1, 1, 0.005, WD, WN, 1);
        K.P('trim', 1, R4(-0.72, 0.72, 0.3, 0.44), 4, 1, 0.004, 0, 0, 1); K.P('chrome', 1, R4(0.4, 0.62, 0.33, 0.4), 2, 1, 0.008);
        K.P('brake', 1, R4(-0.17, 0.17, 1.35, 1.365), 2, 1, 0.004, 0, 0, 1);
      },
    },
    mustang: {
      fo: 0.92, cr: 0.014, tum: 0.36, fsf: 0.93, sill: 1, nk: [3.2, 4, 3.6], dc: 1.64, db: 4.22, ws: [1.72, 2.38], rw: [3.34, 4.18], sg: [1.86, 3.5], bp: [[2.92, 2.96]], sl: [0.34, 2.7], doors: [1.74, 2.94], fl: [0.012, 0.16, 0.03, 0.3], tw: 0.265, rr: 0.7, seats: 2,
      top: [...nose(0.56, 0.75, 0.8), [0.5, 0.815], [1.1, 0.875], [1.64, 0.915, 1], [2.02, 1.14], [2.38, 1.305], [2.65, 1.365], [2.9, 1.38], [3.3, 1.335], [3.75, 1.19], [4.22, 1.02, 1], [4.5, 1], [4.66, 0.99], ...tail(4.78, 0.64, 0.985, 0.9)],
      bot: [...nose(0.56, 0.2, 0.8), [0.25, 0.16], [0.7, 0.14], [3.7, 0.145], [4.25, 0.2], [4.6, 0.27], ...tail(4.78, 0.64, 0.3)],
      hw: [...plan(0.62, 1, 0.975), [0.9, 0.978], [1.7, 0.965], [2.6, 0.97], [3.3, 0.98], [3.62, 0.985], ...planT(4.78, 0.7)],
      sh: [...nose(0.56, 0.715, 2), [0.5, 0.775], [0.9, 0.83], [1.64, 0.875], [2.3, 0.915], [3, 0.955], [3.6, 1], [4.22, 1], [4.55, 0.985], ...tail(4.78, 0.64, 0.97, 1.6)],
      pm: { m: 0.5, r: 0.3, e: 1 }, wheel: { ns: 10, sw: 0.03, col: 0.06 },
      det(K) {
        K.P('mesh', 0, Q4([-0.4, 0.45], [0.4, 0.45], [0.5, 0.69], [-0.5, 0.69]), 6, 3, 0.004, 0, 0, 1);
        K.P('chrome', 0, R4(-0.07, 0.07, 0.56, 0.6), 1, 1, 0.009, 0, 0, 1);
        K.P('trim', 0, Q4([0.53, 0.62], [0.89, 0.66], [0.89, 0.73], [0.53, 0.708]), 4, 2, 0.004);      // slim angled headlamps: three slanted light strokes inboard of the main beam
        K.P('lamps', 0, Q4([0.7, 0.652], [0.855, 0.672], [0.855, 0.716], [0.7, 0.702]), 3, 1, 0.008, HD, HN);
        for (const z of [0.555, 0.6, 0.645]) K.P('lamps', 0, Q4([z, 0.638], [z + 0.016, 0.64], [z + 0.04, 0.698], [z + 0.024, 0.696]), 1, 2, 0.008, HD, HN);
        K.P('mesh', 0, R4(-0.6, 0.6, 0.24, 0.38), 4, 1, 0.004, 0, 0, 1);
        K.P('lamps', 0, R4(0.66, 0.84, 0.42, 0.455), 2, 1, 0.006, AD, AN);
        K.P('trim', 1, R4(-0.88, 0.88, 0.74, 0.94), 8, 2, 0.004, 0, 0, 1);
        for (const z of [0.5, 0.63, 0.76]) { K.P('lamps', 1, R4(z - 0.047, z + 0.047, 0.755, 0.925), 1, 1, 0.007, TD, TN); K.P('brake', 1, R4(z - 0.025, z + 0.025, 0.775, 0.905), 1, 1, 0.01); }
        K.P('chrome', 1, DISC(0, 0.84, 0.03, 0.055), 1, 12, 0.008, 0, 0, 1);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.48, 0.62), 1, 1, 0.005, WD, WN, 1);
        K.P('trim', 1, R4(-0.75, 0.75, 0.24, 0.43), 4, 1, 0.004, 0, 0, 1); K.exh(0.56, 0.3, 0.055); K.exh(-0.56, 0.3, 0.055);
        K.P('brake', 1, R4(-0.17, 0.17, 1.25, 1.265), 2, 1, 0.004, 0, 0, 1);
        K.b('paint').box(K.c.x0 - 4.715, 0.995, 0, 0.1, 0.022, 1.44, -0.1);
      },
    },
    miata: {
      fo: 0.8, tum: 0.4, fsf: 0.97, nk: [3, 3.8, 3.2], dc: 1.42, db: 3.12, ws: [1.5, 1.97], rw: [2.78, 3], rwj: 20, sg: [1.6, 2.62], sl: [0.2, 2.1], doors: [1.52, 2.6], tw: 0.205, rr: 0.7, seats: 2, crn: [0.1, 0.05, 0.08],
      cells: [[1.97, 3.12, 14, 21, 'paint2'], [1.44, 1.97, 17, 21, 'trim']], p2: { color: 0x121214, r: 0.9 },
      top: [...nose(0.44, 0.61, 1.6), [0.5, 0.705], [1, 0.78], [1.42, 0.835, 1], [1.72, 1.035], [1.97, 1.185], [2.2, 1.23], [2.45, 1.235], [2.75, 1.17], [2.98, 1.02], [3.12, 0.9, 1], [3.45, 0.885], [3.72, 0.85], ...tail(3.92, 0.58, 0.82, 1.6)],
      bot: [...nose(0.44, 0.19, 1.2), [0.3, 0.155], [0.7, 0.14], [3.1, 0.15], [3.5, 0.2], [3.75, 0.27], ...tail(3.92, 0.58, 0.3)],
      hw: [...plan(0.52, 1.3, 0.985), [1.4, 0.965], [2.1, 0.965], [2.75, 0.99], [2.95, 1], ...planT(3.92, 0.6, 1.3)],
      sh: [...nose(0.44, 0.585, 2.5), [0.5, 0.675], [0.8, 0.725], [1.1, 0.745], [1.42, 0.77], [2, 0.8], [2.7, 0.85], [3.12, 0.865], [3.5, 0.85], ...tail(3.92, 0.58, 0.79, 2.5)],
      pm: { m: 0.6, r: 0.3 }, wheel: { ns: 8, sw: 0.034, col: 0.12 },
      det(K) {
        K.P('mesh', 0, DISC(0, 0.3, 0, 0.33, 0.25), 2, 18, 0.004, 0, 0, 1);      // oval smiling intake
        K.P('trim', 0, BN([[0.44, 0.51], [0.58, 0.497], [0.72, 0.52], [0.82, 0.572]], [[0.44, 0.51], [0.58, 0.578], [0.72, 0.607], [0.82, 0.572]]), 6, 2, 0.004);      // almond headlamps on the fender tops
        K.P('lamps', 0, BN([[0.48, 0.52], [0.59, 0.512], [0.71, 0.532], [0.79, 0.572]], [[0.48, 0.52], [0.59, 0.566], [0.71, 0.594], [0.79, 0.572]]), 6, 2, 0.008, HD, HN);
        K.P('chrome', 0, DISC(0, 0.5, 0, 0.04), 1, 10, 0.008, 0, 0, 1);
        K.P('lamps', 0, R4(0.58, 0.72, 0.3, 0.325), 2, 1, 0.006, HD, HN);
        K.P('lamps', 1, DISC(0.58, 0.7, 0, 0.078), 1, 12, 0.005, TD, TN); K.P('brake', 1, DISC(0.58, 0.7, 0.025, 0.056), 1, 12, 0.009);
        K.P('lamps', 1, R4(0.66, 0.78, 0.685, 0.72), 2, 1, 0.005, TD, TN);
        K.P('trim', 1, R4(-0.6, 0.6, 0.22, 0.4), 4, 1, 0.004, 0, 0, 1); K.exh(0.38, 0.27, 0.035); K.exh(0.47, 0.27, 0.035);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.46, 0.6), 1, 1, 0.005, WD, WN, 1);
        K.P('brake', 1, R4(-0.12, 0.12, 0.79, 0.805), 2, 1, 0.004, 0, 0, 1);
      },
    },
    crownvic: {
      fo: 1.1, cr: 0.008, fsf: 0.95, wrap: 0.17, tum: 0.26, nk: [4.5, 5, 5], dc: 1.58, db: 4.36, ws: [1.66, 2.22], rw: [3.78, 4.32], sg: [1.78, 3.86], bp: [[2.78, 2.87]], sl: [0.22, 2.95], doors: [1.68, 2.82, 3.78], rr: 0.6, tw: 0.235,
      cells: [[1.68, 3.78, 3, 13, 'paint2'], [1.64, 4.34, 14, 21, 'paint2']], p2: { color: 0xf2f2ee, r: 0.35, cc: 1 },
      top: [...nose(0.55, 0.66, 0.6), [0.075, 0.67, 1], [0.085, 0.8], [0.1, 0.855], [0.15, 0.885], [0.6, 0.94], [1.2, 0.985], [1.58, 1.005, 1], [1.94, 1.255], [2.22, 1.41], [2.52, 1.468], [3, 1.48], [3.5, 1.466], [3.78, 1.415], [4.1, 1.235], [4.36, 1.09, 1], [4.8, 1.085], [5.2, 1.07], [5.27, 1.05], [5.305, 0.99], [5.315, 0.75, 1], [5.335, 0.7, 1], ...tail(5.39, 0.57, 0.69, 0.6)],
      bot: [...nose(0.55, 0.36), [0.4, 0.24], [0.9, 0.19], [4.3, 0.2], [4.9, 0.26], [5.2, 0.33], ...tail(5.39, 0.57, 0.4)],
      hw: [...plan(0.74, 0.7, 0.985), [1.1, 0.985], [4.3, 0.985], ...planT(5.39, 0.76, 0.8, 0.985)],
      sh: [[0, 0.55], [0.003, 0.6], [0.02, 0.645], [0.07, 0.66], [0.085, 0.78], [0.11, 0.835], [0.18, 0.855], [0.6, 0.9], [1.2, 0.94], [1.58, 0.96], [2, 0.98], [4.36, 1.005], [5.15, 1], [5.26, 0.985], [5.305, 0.94], [5.318, 0.74], [5.34, 0.69], [5.39, 0.57]],
      pm: { m: 0.3, r: 0.32, e: 0.6 }, wheel: { ns: 0, col: 0.03 }, mr: 1,
      det(K) {
        K.P('mesh', 0, R4(-0.43, 0.43, 0.71, 0.84), 6, 2, 0.004, 0, 0, 1);
        K.P('chrome', 0, R4(-0.44, 0.44, 0.835, 0.85), 6, 1, 0.007, 0, 0, 1); K.P('chrome', 0, R4(-0.44, 0.44, 0.7, 0.712), 6, 1, 0.007, 0, 0, 1);
        K.P('lamps', 0, R4(0.46, 0.84, 0.715, 0.84), 4, 1, 0.006, HD, HN); K.P('lamps', 0, R4(0.85, 1.02, 0.715, 0.79), 2, 1, 0.006, AD, AN);
        K.P('trim', 0, R4(-0.75, 0.75, 0.585, 0.625), 6, 1, 0.005, 0, 0, 1);
        K.P('mesh', 0, R4(-0.6, 0.6, 0.42, 0.5), 4, 1, 0.004, 0, 0, 1);
        K.P('lamps', 1, R4(0.42, 0.95, 0.78, 0.96), 4, 1, 0.005, TD, TN); K.P('brake', 1, R4(0.6, 0.92, 0.81, 0.93), 3, 1, 0.009);
        K.P('lamps', 1, R4(0.44, 0.57, 0.81, 0.93), 1, 1, 0.009, WD, WD);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.8, 0.94), 1, 1, 0.005, WD, WN, 1);
        K.P('trim', 1, R4(-0.75, 0.75, 0.615, 0.65), 6, 1, 0.005, 0, 0, 1);
        K.P('brake', 1, R4(-0.2, 0.2, 1.375, 1.39), 2, 1, 0.004, 0, 0, 1);
        K.S('decal2', 2.08, 3.44, 0.5, 0.84, 8, 2, 0.004, 0, 1);
        K.b('chrome').add(new T.SphereGeometry(0.055, 8, 6), K.c.x0 - 1.74, 1.09, -0.9);      // A-pillar spotlight
        const x = K.c.x0 - 2.92, y = 1.5, L = K.b('lamps');
        K.b('trim').box(x, y + 0.045, 0, 0.26, 0.05, 1.2); for (const z of [-0.45, 0.45]) K.b('trim').box(x, y, z, 0.1, 0.06, 0.06);
        L.col = L.col2 = [0.55, 0.02, 0.02]; L.box(x, y + 0.05, -0.33, 0.28, 0.085, 0.5); L.col = L.col2 = [0.03, 0.08, 0.6]; L.box(x, y + 0.05, 0.33, 0.28, 0.085, 0.5);
        L.col = L.col2 = WD; L.box(x, y + 0.05, 0, 0.28, 0.085, 0.14);
      },
    },
    ranger: {
      fo: 0.8, fsf: 0.95, wrap: 0.16, tum: 0.22, nk: [4, 5, 7], dc: 1.15, db: 2.652, ws: [1.23, 1.72], rw: [2.62, 2.635], sg: [1.34, 2.44], doors: [1.24, 2.4], rr: 0.58, tw: 0.235, seats: 2, tuck: 0.03, ins: 0.02,
      fl: [0.02, 0.2, 0.125, 0], arch: 0.075, cells: [[2.7, 4.47, 12, 21, null]], bed: [2.7, 4.47, 0.78], crn: [0.09, 0.04, 0.03],
      // Flareside: narrow box, separate fenders standing out to the cab width from behind the step to the tail
      pon: { r: 0.11, d0: 2.72, d1: 4.53, top: [[2.9, 0.66], [3, 0.82], [3.15, 0.91], [3.5, 0.95], [4.1, 0.95], [4.5, 0.91]], plan: [[2.9, 0], [2.915, 0.45], [2.96, 0.75], [3.05, 0.95], [3.14, 1], [4.5, 1, 1], [4.53, 0, 1]] },
      top: [...nose(0.52, 0.615, 0.5), [0.05, 0.63, 1], [0.064, 0.7], [0.09, 0.865], [0.12, 0.918], [0.22, 0.962], [0.6, 1.022], [1.15, 1.07, 1], [1.45, 1.36], [1.72, 1.565], [1.95, 1.612], [2.3, 1.62], [2.56, 1.605], [2.62, 1.56, 1], [2.635, 1.3, 1], [2.65, 1.13, 1], [4.5, 1.13, 1], [4.53, 1.1, 1], [4.54, 0.6, 1], [4.6, 0.59, 1], ...tail(4.69, 0.5, 0.58, 0.6)],
      bot: [...nose(0.52, 0.36), [0.45, 0.34], [0.75, 0.32], [4, 0.34], [4.5, 0.4], ...tail(4.69, 0.5, 0.42)],
      hw: [[0, 0.7], [0.02, 0.83], [0.07, 0.905], [0.2, 0.948], [0.5, 0.97], [1.2, 0.975], [2.62, 0.975, 1], [2.66, 0.85, 1], [4.53, 0.85, 1], [4.56, 0.96, 1], [4.66, 0.94], [4.69, 0.82]],
      sh: [[0, 0.52], [0.003, 0.56], [0.02, 0.595], [0.05, 0.61], [0.066, 0.69], [0.094, 0.85], [0.125, 0.892], [0.22, 0.93], [0.6, 0.987], [1.15, 1.035], [1.3, 1.1], [2.6, 1.13], [2.7, 1.1], [4.53, 1.1, 1], [4.54, 0.58, 1], [4.6, 0.575], [4.69, 0.5]],
      pm: { m: 0.1, r: 0.3, e: 0.9 }, wheel: { ns: 5, sw: 0.075, col: 0.75, dish: 0.2 },
      det(K) {
        for (const y of [0.735, 0.802]) for (const sd of [-1, 1]) K.P('trim', 0, R4(sd * 0.03, sd * 0.43, y, y + 0.048), 4, 1, 0.004, 0, 0, 1);      // two rows of slots in a body-colour panel
        K.P('lamps', 0, DISC(0, 0.793, 0, 0.075, 0.42), 2, 14, 0.008, [0.02, 0.07, 0.36], [0.02, 0.07, 0.36], 1); K.P('chrome', 0, DISC(0, 0.793, 0.075, 0.088, 0.44), 1, 14, 0.008, 0, 0, 1);      // blue oval
        K.P('chrome', 0, R4(0.45, 0.8, 0.728, 0.858), 3, 1, 0.005); K.P('lamps', 0, R4(0.475, 0.775, 0.745, 0.842), 3, 1, 0.008, HD, HN);      // flush rectangular headlamps
        K.P('lamps', 0, R4(0.805, 0.95, 0.728, 0.858), 2, 1, 0.006, AD, AN);
        K.P('trim', 0, R4(-0.46, 0.46, 0.4, 0.47), 4, 1, 0.004, 0, 0, 1);      // air slot under the bumper
        K.P('lamps', 1, R4(0.6, 0.715, 0.8, 1.07), 1, 2, 0.006, TD, TN); K.P('brake', 1, R4(0.62, 0.695, 0.9, 1.05), 1, 1, 0.01); K.P('lamps', 1, R4(0.62, 0.695, 0.82, 0.875), 1, 1, 0.01, WD, WD);
        K.P('lamps', 1, R4(-0.15, 0.15, 0.44, 0.57), 1, 1, 0.005, WD, WN, 1);
        K.P('trim', 1, R4(-0.09, 0.09, 1.03, 1.06), 1, 1, 0.006, 0, 0, 1);
        K.S('decal', 1.46, 2.56, 0.47, 0.77, 6, 2, 0.004, 0.5, 1); K.S('decal', 3.97, 4.47, 0.5, 0.64, 3, 1, 0.004, 0.5, 1);
        const x0 = K.c.x0, dc = K.b('decal'), o = dc.p.length / 3, x = x0 - 4.545;      // pressed tailgate lettering
        for (const [z, y, u, v] of [[0.42, 0.82, 1, 0], [-0.42, 0.82, 0, 0], [-0.42, 1.0, 0, 0.5], [0.42, 1.0, 1, 0.5]]) { dc.v(x, y, z); dc.uv.push(u, v); } dc.quad(o, o + 3, o + 2, o + 1);
        K.b('brake').box(x0 - 2.642, 1.57, 0, 0.02, 0.022, 0.3);
        for (const sd of [-1, 1]) K.b('trim').box(x0 - 2.79, 0.5, sd * 0.79, 0.2, 0.035, 0.14);      // step between cab and fender
      },
    },
  };
  const STYLE = { hatch: 'mazda3', pickup: 'ranger', sedan: 'passat', sedan2: 'dart', coupe: 'mustang', roadster: 'miata', sedan3: 'crownvic' };

  function prep(s) {
    const c = Object.assign({}, DEF0, DEF[s.id] || DEF[STYLE[s.style]] || DEF.passat), L = (c.L = c.top[c.top.length - 1][0]), wb = s.a + s.b;
    // x of the nose: the real front overhang fo ahead of the front axle. The wheels are exactly at +a / -b and the body hangs over
    // them as the real car does (a long boot puts its middle up to 0.17 m behind the wheelbase midpoint); noseX / tailX report it.
    c.W2 = s.W / 2; c.zin = s.track / 2 - 0.21; c.x0 = s.a + c.fo;
    c.ft = curve(c.top); c.fb = curve(c.bot); c.fw = curve(c.hw); c.fs = curve(c.sh);
    c.y0 = c.fb(L / 2); c.tdc = c.ft(c.dc); c.tdb = c.ft(c.db); c.fg = c.gr && curve(c.gr);
    c.fc = c.crk ? curve(c.crk) : curve([[c.dc, c.crn[0]], [c.ws[1] - 0.15, c.crn[0]], [c.ws[1] + 0.15, c.crn[1]], [c.rw[0] - 0.15, c.crn[1]], [c.rw[0] + 0.15, c.crn[2]], [c.db, c.crn[2]]]);
    c.fn = curve([[0, c.nk[0]], [c.dc - 0.06, c.nk[0]], [c.dc + 0.14, c.nk[1]], [c.db - 0.14, c.nk[1]], [c.db + 0.06, c.nk[2]], [L, c.nk[2]]]);
    c.ax = [0, 1].map((r) => ({ d: c.fo + r * wb, R: s.R, Ra: s.R + c.arch, fl: c.fl[r * 2], band: c.fl[r * 2 + 1], pon: r && c.pon ? { f: curve(c.pon.top), g: curve(c.pon.plan), r: c.pon.r } : null }));
    // stations: wheel arches first (their edges are doubled so the opening is cut square), then feature edges, the ends, the profile knots, and fill
    const S = [], put = (x, t) => { if (x >= 0 && x <= L && !S.some((q) => Math.abs(q - x) < t)) S.push(x); };
    for (const a of c.ax) { for (let q = 0; q <= 10; q++) S.push(a.d - a.Ra * Math.cos(q * PI / 10)); S.push(a.d - a.Ra - 0.008, a.d + a.Ra + 0.008); }
    for (const k of c.top.concat(c.pon ? c.pon.plan : [])) if (k[2]) put(k[0], 0.004);
    for (const x of [c.dc - 0.03, ...c.ws, ...c.rw, c.sg[0], c.sg[1], ...c.doors].concat(...c.bp, (c.gr || []).map((k) => k[0]), ...c.cells.map((r) => [r[0], r[1]]))) put(x, 0.03);
    for (const x of [0, 0.006, 0.02, 0.045, 0.085, 0.14]) { put(x, 0.004); put(L - x, 0.004); }
    for (const k of c.top) put(k[0], 0.03);
    for (let x = 0.2; x < L - 0.2; x += 0.02) put(x, 0.12);
    c.S = S.sort((a, b) => a - b);
    c.ix = (d) => { let b = 0; for (let i = 1; i < S.length; i++) if (Math.abs(S[i] - d) < Math.abs(S[b] - d)) b = i; return b; };
    return c;
  }

  // ---- materials ----
  let SM, splashTex;
  // the environment map lights paint from every side at once and flattens it (white cars lose all shading): keep its reflections, cut its diffuse part
  function iblFix(sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', T.ShaderChunk.lights_fragment_maps.replace('iblIrradiance +=', 'iblIrradiance += 0.2 *')); }
  // bright paint: the diffuse albedo is compressed (bright red and orange by 0.6, white by 0.8: 0.9 -> 0.72) so a sunlit panel stays under the
  // tone-mapper's shoulder and a shaded flank is clearly darker. White (pw) is also made non-metallic so its shading follows the light instead
  // of the blurred sky reflection, and gets a sky term (panels facing down darker than panels facing up, sides x0.8) with 30% less ambient
  // light and 45% less sky reflection, so a shaded flank stays clearly darker than a sunlit panel and curved forms read in full sun. The material colour itself is untouched (the game matches and repaints by it), so a garage repaint adapts.
  function paintFix(sh) {
    iblFix(sh); sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float pw = smoothstep( 0.55, 0.8, min( diffuse.r, min( diffuse.g, diffuse.b ) ) );\n\tvec4 diffuseColor = vec4( diffuse * ( 1.0 - ( 0.4 - 0.2 * pw ) * smoothstep( 0.15, 0.6, max( diffuse.r, max( diffuse.g, diffuse.b ) ) ) ), opacity );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tdiffuseColor.rgb *= mix( 1.0, 0.8 + 0.2 * inverseTransformDirection( normal, viewMatrix ).y, pw );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor *= 1.0 - pw;')
      .replace('#include <lights_fragment_end>', 'irradiance *= 1.0 - 0.3 * pw; radiance *= 1.0 - 0.45 * pw;\n\t#ifdef CLEARCOAT\n\tclearcoatRadiance *= 1.0 - 0.45 * pw;\n\t#endif\n#include <lights_fragment_end>');
  }
  const pbr = (o, e) => { const m = new (o.clearcoat || o.transmission ? T.MeshPhysicalMaterial : T.MeshStandardMaterial)(o); m.envMapIntensity = m.userData.e = e; m.onBeforeCompile = iblFix; return m; };
  function shared() {
    // overlays are pulled towards the camera; the slope term grows at grazing angles and differs between two overlapping patches, so lenses
    // (always the top layer, over their dark housings) get twice the pull, or a housing hides them on the top of a curved nose
    const po = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, po2 = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    return SM || (SM = {
      glass: pbr({ color: lin(0x0a1014), roughness: 0.03, transmission: 0.5, transparent: true }, 1.5),
      trim: pbr(Object.assign({ color: lin(0x0d0d0f), roughness: 0.4, metalness: 0.2 }, po), 1),
      dark: new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }),
      chrome: pbr(Object.assign({ color: lin(0xe6e8ec), roughness: 0.12, metalness: 0.95 }, po), 1),
      dchrome: pbr(Object.assign({ color: lin(0x6a6e74), roughness: 0.18, metalness: 0.95 }, po), 1),
      rim: pbr({ vertexColors: true, roughness: 0.3, metalness: 0.8, side: T.DoubleSide }, 1),
      po, po2,
    });
  }
  // one decal sheet: top half the Splash brush strokes and script, bottom half the lettering pressed into the tailgate
  function splashDecal() {
    if (!splashTex) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d'); g.lineCap = 'round';
      [['#19b3a6', 26, 0], ['#f5d21f', 16, 1], ['#c2278f', 20, 2], ['#5b2a91', 8, 3]].forEach(([col, w, k]) => {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(14 + k * 26, 112 - k * 4); g.bezierCurveTo(120 + k * 30, 118 - k * 16, 250 + k * 20, 60 - k * 6, 330 + k * 34, 22 + k * 5); g.stroke();
        g.lineWidth = w * 0.3; g.beginPath(); g.moveTo(40 + k * 30, 122 - k * 3); g.lineTo(150 + k * 40, 104 - k * 14); g.stroke();      // dry-brush tail
      });
      g.fillStyle = '#fff'; g.font = 'italic 700 46px Georgia, serif'; g.textAlign = 'center'; g.fillText('Splash', 386, 104);
      g.font = '900 104px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle';
      for (const [col, o] of [['rgba(255,255,255,0.22)', 3], ['rgba(0,0,0,0.42)', -2]]) { g.fillStyle = col; g.fillText('F O R D', 256 + o, 196 + o); }
      splashTex = new T.CanvasTexture(cv); splashTex.encoding = T.sRGBEncoding; splashTex.anisotropy = 4;
    }
    return new T.MeshLambertMaterial(Object.assign({ map: splashTex, transparent: true, depthWrite: false }, shared().po));
  }

  // ponytail: the brake disc turns with the wheel and there is no caliper or suspension travel; needs a non-spinning hub group per wheel to add them
  // ---- wheel: rounded tyre (dark material) and alloy rim with spokes, hub and brake disc (rim material); axis Z, outer face +Z ----
  function wheelGeo(R, rr, wt, st) {
    const ty = new Bld(), rm = new Bld(), h = wt / 2, V = (a) => a.map((p) => new T.Vector2(p[0], p[1])), f = h * (st.dish || 0.55), k = st.col, sp = [k, k, k * 1.03];
    ty.col = [0.014, 0.014, 0.015];
    ty.add(new T.LatheGeometry(V([[rr, -h * 0.82], [R - 0.045, -h], [R - 0.012, -h * 0.9], [R, -h * 0.66], [R, h * 0.66], [R - 0.012, h * 0.9], [R - 0.045, h], [rr, h * 0.82]]), 24).rotateX(PI / 2), 0, 0, 0);
    rm.col = [k * 0.35, k * 0.35, k * 0.37]; rm.add(new T.LatheGeometry(V([[rr - 0.012, -h * 0.8], [rr - 0.012, h * 0.55]]), 24).rotateX(PI / 2), 0, 0, 0);
    rm.col = sp; rm.add(new T.LatheGeometry(V([[rr - 0.012, h * 0.55], [rr + 0.003, h * 0.82], [rr + 0.003, h * 0.9], [rr - 0.02, h * 0.88], [rr - 0.035, f + 0.01]]), 24).rotateX(PI / 2), 0, 0, 0);
    rm.col = [0.012, 0.012, 0.012]; rm.add(new T.CircleGeometry(rr - 0.012, 20), 0, 0, -h * 0.2);
    rm.col = [0.22, 0.22, 0.23]; rm.add(new T.RingGeometry(0.07, rr * 0.8, 20), 0, 0, h * 0.1);
    rm.col = sp;
    if (st.ns) {
      const r0 = 0.03, r1 = rr - 0.025;
      for (let q = 0; q < st.ns; q++) { const a = st.pair ? (q >> 1) * 4 * PI / st.ns + (q & 1 ? st.pair : -st.pair) : q * 2 * PI / st.ns; rm.add(new T.BoxGeometry(r1 - r0, st.sw, 0.03), Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, f, a); }
      rm.add(new T.CylinderGeometry(0.062, 0.07, 0.045, 12).rotateX(PI / 2), 0, 0, f + 0.004);
    } else {        // steel wheel with a chrome centre cap
      rm.add(new T.LatheGeometry(V([[0.1, f + 0.01], [rr * 0.72, f - 0.02], [rr - 0.012, h * 0.55]]), 24).rotateX(PI / 2), 0, 0, 0);
      rm.col = [0.8, 0.8, 0.82]; rm.add(new T.SphereGeometry(0.105, 12, 6, 0, 2 * PI, 0, PI / 2).rotateX(PI / 2), 0, 0, f - 0.03, 0, 0.45);
    }
    return [ty.geo(), rm.geo()];
  }

  // ---- extras: tiled grille lattice (patch key 'mesh') and door lettering (side patch key 'decal2') ----
  let meshTex, policeTex;
  function meshMap() {      // radiator grille: a dark diamond lattice, tiled
    if (!meshTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d');
      g.fillStyle = '#050506'; g.fillRect(0, 0, 32, 32); g.strokeStyle = '#3a3a40'; g.lineWidth = 3; g.beginPath();
      for (const o of [-32, 0, 32]) { g.moveTo(o, 0); g.lineTo(o + 32, 32); g.moveTo(o + 32, 0); g.lineTo(o, 32); } g.stroke();
      meshTex = new T.CanvasTexture(cv); meshTex.encoding = T.sRGBEncoding; meshTex.wrapS = meshTex.wrapT = T.RepeatWrapping; meshTex.anisotropy = 4;
    }
    return meshTex;
  }
  function policeMap() {
    if (!policeTex) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
      g.fillStyle = '#14161a'; g.font = '700 50px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.fillText('POLICE', 128, 50);
      policeTex = new T.CanvasTexture(cv); policeTex.encoding = T.sRGBEncoding; policeTex.anisotropy = 4;
    }
    return policeTex;
  }

  /** Build the mesh for a car spec (the resolved spec from DriftPhysics.makeCar). */
  B.buildCar = function (s) {
    const c = prep(s), S = c.S, NS = S.length, g = new T.Group(), bl = {}, b = (k) => bl[k] || (bl[k] = Object.assign(new Bld(), k[0] === 'p' ? { col: W1 } : null)), sm = shared(), ao = [0, 0, 0];
    const X = new Float32Array(NS * NR), Y = new Float32Array(NS * NR), Z = new Float32Array(NS * NR), N = new Float32Array(NS * NR * 3), tz = new Float32Array(NR), ty = new Float32Array(NR), inA = new Uint8Array(NS), cab = new Uint8Array(NS), LW = [0, 0.5, 1, 1, 0.5];
    // skin vertices; rows 15-19 lean forward towards the rear edge of the side glass so that edge follows the pillar
    for (let i = 0; i < NS; i++) {
      const o = sect(c, S[i], Z, Y, i * NR); cab[i] = (o.cw > 0 ? 1 : 0) | (c.fg && c.fg(S[i]) > 1e-3 ? 2 : 0); for (let j = 0; j < NR; j++) X[i * NR + j] = c.x0 - S[i];
      for (const a of c.ax) if (Math.abs(S[i] - a.d) <= a.Ra + 1e-5) inA[i] = 1;
      const w = c.sl ? c.sl[0] * sstep(c.sl[1], c.sg[1] - 0.02, S[i]) * (1 - sstep(c.sg[1] + 0.05, c.sg[1] + 0.5, S[i])) : 0;
      if (w > 1e-3) for (let j = 15; j <= 19; j++) { const d = S[i] - w * LW[j - 15], q = i * NR + j; sect(c, d, tz, ty, 0); Z[q] = tz[j]; Y[q] = ty[j]; X[q] = c.x0 - d; }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {     // skin normals, used to offset liners and shut lines
      const a = Math.min(i + 1, NS - 1) * NR + j, e = Math.max(i - 1, 0) * NR + j, f = i * NR + Math.min(j + 1, NR - 1), h = i * NR + Math.max(j - 1, 0);
      const ux = X[a] - X[e], uy = Y[a] - Y[e], uz = Z[a] - Z[e], vx = X[f] - X[h], vy = Y[f] - Y[h], vz = Z[f] - Z[h];
      let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux; const l = Math.hypot(nx, ny, nz) || 1, q = (i * NR + j) * 3;
      N[q] = nx / l; N[q + 1] = ny / l; N[q + 2] = nz / l;
    }
    const matOf = (i, j) => {
      const dm = (S[i] + S[i + 1]) / 2;
      if (j === 1 && (inA[i] || inA[i + 1])) return null;
      if (j >= 14 && !((cab[i] | cab[i + 1]) & (j === 14 ? 2 : 1))) return null;      // nothing above the hood and deck, no panel under the glass unless it is lifted
      let m = j < 2 && dm > 0.3 && dm < c.L - 0.35 ? 'dark' : 'paint';
      if (c.sill && j === 3 && dm > c.ax[0].d + c.ax[0].Ra && dm < c.ax[1].d - c.ax[1].Ra) m = 'trim';      // black sill
      for (const r of c.cells) if (dm > r[0] && dm < r[1] && j >= r[2] && j <= r[3]) m = r[4];
      if (j >= 15 && j <= 16 && dm > c.sg[0] && dm < c.sg[1]) { m = 'glass'; for (const p of c.bp) if (dm > p[0] && dm < p[1]) m = 'trim'; }
      if (j >= 19 && dm > c.dc - 0.04 && dm < c.ws[0]) m = 'trim';
      if (j >= 19 && dm > c.ws[0] && dm < c.ws[1]) m = 'glass';
      if (j >= c.rwj && dm > c.rw[0] && dm < c.rw[1]) m = 'glass';
      return m;
    };
    const maps = {}, vid = (key, s, i, j, off) => {
      const bb = b(key), m = maps[key + off] || (maps[key + off] = new Int32Array(2 * NS * NR).fill(-1)), q = i * NR + j, k = (s < 0 && j > 0 && j < NR - 1 ? NS * NR : 0) + q;
      if (m[k] < 0) {
        // paint carries a baked ground shadow in its vertex colours: darker towards the ground (floor, sills, valances) and on the arch lips
        if (key[0] === 'p') { ao[0] = ao[1] = ao[2] = (0.5 + 0.5 * sstep(c.y0 - 0.05, c.y0 + 0.3, Y[q])) * (j === 3 && inA[i] ? 0.8 : 1); bb.col = ao; }
        m[k] = bb.v(X[q] - N[q * 3] * off, Y[q] - N[q * 3 + 1] * off, s * (Z[q] - N[q * 3 + 2] * off)); if (key[0] === 'p') bb.col = W1;
      }
      return m[k];
    };
    const D = b('dark'); D.col = [0.008, 0.008, 0.009];
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR - 1; j++) {
      const m = matOf(i, j), dm = (S[i] + S[i + 1]) / 2; if (!m) continue;
      for (const sd of [1, -1]) {
        b(m).quad(vid(m, sd, i, j, 0), vid(m, sd, i, j + 1, 0), vid(m, sd, i + 1, j + 1, 0), vid(m, sd, i + 1, j, 0), sd < 0);
        if (j >= 14 && m !== 'glass' && dm > c.dc && dm < c.db) D.quad(vid('dark', sd, i, j, 0.012), vid('dark', sd, i, j + 1, 0.012), vid('dark', sd, i + 1, j + 1, 0.012), vid('dark', sd, i + 1, j, 0.012));   // headliner, inner pillars
      }
    }
    // shut lines: thin dark strips riding 3 mm above the skin along a station (doors, hood and boot edges) or along a row
    const Tm = b('trim'), lp = (q, sd, ox, oy, oz) => Tm.v(X[q] + N[q * 3] * 0.003 + ox, Y[q] + N[q * 3 + 1] * 0.003 + oy, sd * (Z[q] + N[q * 3 + 2] * 0.003 + oz));
    const sline = (d, j0, j1) => { const i = c.ix(d); for (const sd of [1, -1]) for (let j = j0; j < j1; j++) { const q = i * NR + j; Tm.quad(lp(q, sd, 0.006, 0, 0), lp(q, sd, -0.006, 0, 0), lp(q + 1, sd, -0.006, 0, 0), lp(q + 1, sd, 0.006, 0, 0), sd > 0); } };
    const rline = (j, d0, d1) => {
      for (const sd of [1, -1]) for (let i = c.ix(d0), i1 = c.ix(d1); i < i1; i++) {
        const P = (q) => { const a = q + 1, e = q - 1, l = Math.hypot(Y[a] - Y[e], Z[a] - Z[e]) || 1, ty = (Y[a] - Y[e]) / l * 0.006, tz = (Z[a] - Z[e]) / l * 0.006; return [lp(q, sd, 0, ty, tz), lp(q, sd, 0, -ty, -tz)]; };
        const A = P(i * NR + j), E = P((i + 1) * NR + j); Tm.quad(A[0], A[1], E[1], E[0], sd < 0);
      }
    };
    // window frame: a strip w wide on the glass from row j towards row jn (belt moulding, upper edge)
    const bline = (j, jn, d0, d1, bb, w) => {
      for (const sd of [1, -1]) for (let i = c.ix(d0), i1 = c.ix(d1); i < i1; i++) {
        const P = (q, e) => { const dx = X[e] - X[q], dy = Y[e] - Y[q], dz = Z[e] - Z[q], l = w / (Math.hypot(dx, dy, dz) || 1), n = q * 3, V = (t) => bb.v(X[q] + dx * l * t + N[n] * 0.004, Y[q] + dy * l * t + N[n + 1] * 0.004, sd * (Z[q] + dz * l * t + N[n + 2] * 0.004)); return [V(0), V(1)]; };
        const A = P(i * NR + j, i * NR + jn), E = P((i + 1) * NR + j, (i + 1) * NR + jn); bb.quad(A[0], A[1], E[1], E[0], (sd < 0) !== (jn < j));
      }
    };
    { const i = c.ix((c.sg[0] + c.sg[1]) / 2 + 0.2); let j0 = 11; while (j0 < NR - 2 && matOf(i, j0) !== 'glass') j0++; let j1 = j0; while (j1 < NR - 2 && matOf(i, j1) === 'glass' && Z[i * NR + j1] > Z[i * NR + j0] * 0.75) j1++;      // side glass spans rows j0..j1
      if (j1 > j0) { bline(j0, j0 + 1, c.sg[0], c.sg[1], b(c.dlo || 'trim'), 0.022); bline(j1, j1 - 1, c.sg[0], c.sg[1], b(c.dlo || 'trim'), 0.014); } }
    for (const d of c.doors) sline(d, 3, 10);
    rline(12, 0.2, c.dc - 0.12); sline(0.2, 12, 14);
    if (!c.bed && c.L - c.db > 0.5) { rline(12, c.db + 0.06, c.L - 0.14); sline(c.L - 0.14, 12, 14); }

    // ---- patches ----
    // the lofted skin at any distance d: ring(d) interpolates the two neighbouring stations, hwAt gives its half-width at height y
    // (-1 outside), proj finds how far behind the nose (or ahead of the tail) the skin passes through (z, y) in front view
    // ponytail: lamps and grilles are flat patches laid on the skin, no recessed lenses or modelled reflectors; cut real openings into the loft if close-ups ever need them
    const rz = new Float32Array(NR), ry = new Float32Array(NR);
    const ring = (d) => { let lo = 0, hi = NS - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] > d) hi = m; else lo = m; } const t = clamp((d - S[lo]) / (S[hi] - S[lo]), 0, 1), a = lo * NR, e = hi * NR; for (let j = 1; j < NR; j++) { rz[j] = Z[a + j] + (Z[e + j] - Z[a + j]) * t; ry[j] = Y[a + j] + (Y[e + j] - Y[a + j]) * t; } };
    const hwAt = (d, y) => { ring(d); if (y < ry[1] || y > ry[NR - 1]) return -1; if (y < ry[3]) return rz[3]; let j = 3; while (j < NR - 2 && ry[j + 1] < y) j++; const h = ry[j + 1] - ry[j]; return h < 1e-6 ? Math.max(rz[j], rz[j + 1]) : rz[j] + (rz[j + 1] - rz[j]) * (y - ry[j]) / h; };
    const proj = (z, y, rear) => { let lo = rear ? c.L : 0, hi = rear ? c.L - 1.9 : 1.9; if (hwAt(hi, y) < z) return -1; for (let k = 0; k < 13; k++) { const m = (lo + hi) / 2; if (hwAt(m, y) >= z) hi = m; else lo = m; } return hi; };
    const K = {
      c, b,
      // P: patch on the nose (rear = 0) or tail (rear = 1); f(u, v) -> [z, y] in front view; mirrored to both sides unless one
      P(key, rear, f, nu, nv, off, col, col2, one) {
        const e0 = f(0, 0.5), e1 = f(1, 0.5), e2 = f(0.5, 0), e3 = f(0.5, 1);      // sample finely enough to follow the curved nose
        nu = Math.max(nu, Math.ceil(Math.max(Math.abs(e1[0] - e0[0]) / 0.07, Math.abs(e1[1] - e0[1]) / 0.07))); nv = Math.max(nv, Math.ceil(Math.max(Math.abs(e3[0] - e2[0]) / 0.07, Math.abs(e3[1] - e2[1]) / 0.07)));
        if (f.n) nu = Math.ceil(nu / f.n) * f.n;      // keep the corners of a band on sample points
        const dw = rear ? c.L - c.wrap : c.wrap, at = (u, v, o, k) => {
          // past the corner (wider than the skin is at depth c.wrap) the extra width runs back along the body side, so lamps wrap round
          const q = f(u, v), y = q[1]; let az = Math.abs(q[0]), zc = hwAt(dw, y), d, h;
          if (zc < 0) zc = 9;
          if (az <= zc) { d = proj(az, y, rear); if (d < 0) d = dw; h = hwAt(d, y); if (h >= 0) az = Math.min(az, h); } else { d = dw + (az - zc) * (rear ? -1 : 1); az = Math.max(0, hwAt(d, y)); }
          o[k] = c.x0 - d; o[k + 1] = y; o[k + 2] = Math.sign(q[0]) * az;
        };
        // the steps above are even in front view, but where the skin curves away (a corner, the top of the nose) a flat facet between two
        // samples sinks into it and paint shows through: split every step whose midpoint lies more than 1 mm off its chord
        const A = [0, 0, 0], E = [0, 0, 0], M = [0, 0, 0];
        const split = (ts, os, swap) => {
          const out = [0];
          for (let i = 0; i < ts.length - 1; i++) {
            let sag = 0; const t0 = ts[i], t1 = ts[i + 1], tm = (t0 + t1) / 2;
            for (const o of os) {
              if (swap) { at(o, t0, A, 0); at(o, t1, E, 0); at(o, tm, M, 0); } else { at(t0, o, A, 0); at(t1, o, E, 0); at(tm, o, M, 0); }
              sag = Math.max(sag, Math.hypot(M[0] - (A[0] + E[0]) / 2, M[1] - (A[1] + E[1]) / 2, M[2] - (A[2] + E[2]) / 2));
            }
            const k = Math.min(6, Math.ceil(Math.sqrt(sag / 0.001)) || 1);
            for (let s = 1; s <= k; s++) out.push(t0 + (t1 - t0) * s / k);
          }
          return out;
        };
        const tk = (n) => Array.from({ length: n + 1 }, (_, i) => i / n), u0 = tk(nu), v0 = tk(nv), us = split(u0, v0, false), vs = split(v0, us, true);
        nu = us.length - 1; nv = vs.length - 1;
        const n1 = nu + 1, cnt = n1 * (nv + 1), pp = new Float32Array(cnt * 3), nn = new Float32Array(cnt * 3), bb = b(key);
        for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) at(us[u], vs[v], pp, (v * n1 + u) * 3);
        if (col) { bb.col = col; bb.col2 = col2 || col; }
        for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
          const k = (v * n1 + u) * 3, a = (v * n1 + Math.min(u + 1, nu)) * 3, e = (v * n1 + Math.max(u - 1, 0)) * 3, h = (Math.min(v + 1, nv) * n1 + u) * 3, l = (Math.max(v - 1, 0) * n1 + u) * 3;
          const ux = pp[a] - pp[e], uy = pp[a + 1] - pp[e + 1], uz = pp[a + 2] - pp[e + 2], vx = pp[h] - pp[l], vy = pp[h + 1] - pp[l + 1], vz = pp[h + 2] - pp[l + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const len = Math.hypot(nx, ny, nz);
          if (len < 1e-9) { nx = rear ? -1 : 1; ny = nz = 0; } else { const sg = (nx * (rear ? c.L - 1.2 - (c.x0 - pp[k]) : 1.2 - (c.x0 - pp[k])) + ny * (pp[k + 1] - 0.5) + nz * pp[k + 2] < 0 ? -1 : 1) / len; nx *= sg; ny *= sg; nz *= sg; }      // outward: away from a point inside the body 1.2 m from the end, so patches on the top of the nose (normal up and back) are not pushed in
          // offset along the skin's own normal: the skin is z = h(d, y), so n ~ (dh/dd, -dh/dy, 1); the patch grid's normal goes wrong where
          // a lamp wraps past the corner onto the side, and the lamp ends up inside the body
          const d = c.x0 - pp[k], y = pp[k + 1], h0 = hwAt(d, y), D = (p, m, s0) => (p >= 0 && m >= 0 ? (p - m) / (2 * s0) : p >= 0 && h0 >= 0 ? (p - h0) / s0 : m >= 0 && h0 >= 0 ? (h0 - m) / s0 : NaN);
          const hd = D(hwAt(d + 0.008, y), hwAt(d - 0.008, y), 0.008), hy = D(hwAt(d, y + 0.008), hwAt(d, y - 0.008), 0.008);
          if (h0 >= 0 && hd === hd && hy === hy) { const l2 = Math.hypot(hd, hy, 1); nx = hd / l2; ny = -hy / l2; nz = (pp[k + 2] < 0 ? -1 : 1) / l2; }
          nn[k] = nx; nn[k + 1] = ny; nn[k + 2] = nz;
        }
        for (const sd of one ? [1] : [1, -1]) {
          const o = bb.p.length / 3;
          for (let k = 0; k < cnt * 3; k += 3) { bb.v(pp[k] + nn[k] * off, pp[k + 1] + nn[k + 1] * off, sd * (pp[k + 2] + nn[k + 2] * off)); if (key === 'mesh') { const mr = c.mr || 0; bb.uv.push((sd * pp[k + 2] + mr * pp[k + 1]) * 16, (pp[k + 1] - mr * sd * pp[k + 2]) * 16); } }
          for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
            // facing from the quad's diagonals, which stay apart where a disc's centre row collapses to one point (an edge cross product is zero there)
            const a = v * n1 + u, e = a + 1, h = a + n1 + 1, l = a + n1, A = a * 3, E = e * 3, Hq = h * 3, Lq = l * 3;
            const px = pp[Hq] - pp[A], py = pp[Hq + 1] - pp[A + 1], pz = pp[Hq + 2] - pp[A + 2], qx = pp[Lq] - pp[E], qy = pp[Lq + 1] - pp[E + 1], qz = pp[Lq + 2] - pp[E + 2];
            const fx = py * qz - pz * qy, fy = pz * qx - px * qz, fz = px * qy - py * qx;
            bb.quad(o + a, o + e, o + h, o + l, (fx * nn[A] + fy * nn[A + 1] + fz * nn[A + 2] < 0) !== (sd < 0));
          }
        }
      },
      // S: patch on both body sides between d0..d1 and heights y0..y1, with decal uvs
      S(key, d0, d1, y0, y1, nd, ny, off, v0, v1) {
        const bb = b(key);
        for (const sd of [1, -1]) {
          const o = bb.p.length / 3;
          for (let v = 0; v <= ny; v++) for (let u = 0; u <= nd; u++) { const d = d0 + (d1 - d0) * u / nd, y = y0 + (y1 - y0) * v / ny; bb.v(c.x0 - d, y, sd * (hwAt(d, y) + off)); bb.uv.push(sd > 0 ? 1 - u / nd : u / nd, v0 + (v1 - v0) * v / ny); }
          for (let v = 0; v < ny; v++) for (let u = 0; u < nd; u++) { const a = o + v * (nd + 1) + u; bb.quad(a, a + 1, a + nd + 2, a + nd + 1, sd > 0); }
        }
      },
    };
    // exhaust tip: a chrome tube with a dark mouth poking out under the tail at (z, y)
    K.exh = (z, y, r) => { b('chrome').add(new T.CylinderGeometry(r, r, 0.14, 10, 1, true), c.x0 - c.L + 0.075, y, z, PI / 2); D.col = [0.004, 0.004, 0.004]; D.add(new T.CircleGeometry(r, 10), c.x0 - c.L + 0.04, y, z, 0, 1, -PI / 2); };
    c.det(K);

    // ---- mirrors, handles, interior, wheel-arch liners, bed ----
    const belt = (d) => prof(c, d, O).ys, dm0 = c.sg[0] + 0.05, pm = prof(c, dm0, {}), mk = c.p2 && c.p2.cc ? 'trim' : 'paint';
    for (const sd of [1, -1]) {
      b(mk).add(new T.SphereGeometry(1, 10, 7).scale(0.04, 0.062, 0.105), c.x0 - dm0 + 0.02, pm.ys + 0.085, sd * (pm.zs + 0.115), 0, sd);
      b('chrome').add(new T.CircleGeometry(1, 10).scale(0.088, 0.05, 1), c.x0 - dm0 - 0.022, pm.ys + 0.085, sd * (pm.zs + 0.115), 0, 1, -PI / 2);      // mirror glass
      Tm.box(c.x0 - dm0, pm.ys + 0.04, sd * (pm.zs + 0.03), 0.07, 0.035, 0.1);
      for (let q = 1; q < c.doors.length; q++) { const d = c.doors[q] - 0.14, o = prof(c, d, O), y = o.ys - 0.09; b(mk).box(c.x0 - d, y, sd * (zLow(c, o, d, y) + 0.008), 0.17, 0.028, 0.03); }
    }
    const yf = belt((c.dc + c.db) / 2) - 0.36, i0 = c.ix(c.dc + 0.04), i1 = c.ix(c.db - 0.03), zs = c.W2 * 0.4, xs = (d) => c.x0 - d;
    D.col = [0.006, 0.006, 0.007];
    for (const sd of [1, -1]) for (let i = i0; i < i1; i++) { const q = i * NR + 14, e = q + NR; D.quad(D.v(X[q], Y[q] - 0.01, sd * (Z[q] - 0.02)), D.v(X[e], Y[e] - 0.01, sd * (Z[e] - 0.02)), D.v(X[e], yf, sd * (Z[e] - 0.02)), D.v(X[q], yf, sd * (Z[q] - 0.02))); }
    const wz = c.W2 - 0.08, da = S[i0], de = S[i1], ya = belt(da), ye = belt(de);
    D.quad(D.v(xs(da), yf, -wz), D.v(xs(da), yf, wz), D.v(xs(de), yf, wz), D.v(xs(de), yf, -wz));
    D.quad(D.v(xs(da), yf, -wz), D.v(xs(da), yf, wz), D.v(xs(da), ya, wz), D.v(xs(da), ya, -wz)); D.quad(D.v(xs(de), yf, -wz), D.v(xs(de), yf, wz), D.v(xs(de), ye, wz), D.v(xs(de), ye, -wz));
    // ponytail: the interior is a silhouette (boxes for dash and seats behind tinted glass), not a modelled cabin; replace if an in-car camera is added
    D.col = [0.016, 0.016, 0.018]; D.box(xs(c.dc + 0.3), ya - 0.06, 0, 0.56, 0.2, 2 * wz - 0.1);                       // dash
    D.col = [0.004, 0.004, 0.004]; D.add(new T.TorusGeometry(0.175, 0.017, 5, 14), xs(c.dc + 0.66), ya + 0.02, -zs, -0.42, 1, PI / 2);   // steering wheel
    const yh = (d) => Math.min(belt(d) + 0.3, c.ft(d) - 0.17);        // headrest centre: below the roof
    const seat = (d, z, wd) => { const h = yh(d); D.col = [0.03, 0.03, 0.034]; D.box(xs(d - 0.24), yf + 0.14, z, 0.5, 0.16, wd); D.box(xs(d + 0.04), (yf + h) / 2, z, 0.12, h - yf - 0.1, wd, 0.2); D.box(xs(d + 0.1), h, z, 0.09, 0.17, Math.min(wd, 0.26), 0.1); };
    const df = c.dc + 1.2; seat(df, -zs, 0.48); seat(df, zs, 0.48);
    if (c.seats > 2) { const dr = Math.min(df + 0.88, c.db - 0.42), h = yh(dr) - 0.04; D.col = [0.03, 0.03, 0.034]; D.box(xs(dr + 0.04), (yf + h) / 2, 0, 0.12, h - yf - 0.1, 2 * wz - 0.2, 0.25); for (const z of [-zs, zs]) D.box(xs(dr + 0.1), h, z, 0.09, 0.16, 0.24, 0.15); D.quad(D.v(xs(dr + 0.1), ye - 0.03, -wz), D.v(xs(dr + 0.1), ye - 0.03, wz), D.v(xs(de), ye - 0.03, wz), D.v(xs(de), ye - 0.03, -wz)); }
    D.col = [0.005, 0.005, 0.005];
    for (const a of c.ax) for (const sd of [1, -1]) {
      const o = prof(c, a.d, O), zo = o.w - o.tuck + a.fl - 0.03, zi = s.track / 2 - 0.2, r = a.Ra + 0.02, lo = Math.asin(clamp((a.R - o.yb - 0.03) / r, 0, 0.6));   // stops at the sill
      D.add(new T.CylinderGeometry(r, r, zo - zi, 12, 1, true, PI / 2 - lo, PI + 2 * lo).rotateX(PI / 2), xs(a.d), a.R, sd * (zo + zi) / 2);
      D.add(new T.CircleGeometry(r, 12, -lo, PI + 2 * lo), xs(a.d), a.R, sd * zi);
    }
    if (c.bed) {      // open pickup bed: inner walls in body colour hanging from the cut edge of the skin, dark floor
      const Pt = b('paint'), i2 = c.ix(c.bed[0]), i3 = c.ix(c.bed[1]), fy = c.bed[2];
      for (const sd of [1, -1]) {
        for (let i = i2; i < i3; i++) { const q = i * NR + 12, e = q + NR; Pt.quad(Pt.v(X[q], Y[q], sd * Z[q]), Pt.v(X[q], fy, sd * Z[q]), Pt.v(X[e], fy, sd * Z[e]), Pt.v(X[e], Y[e], sd * Z[e]), sd < 0); }
        for (const i of [i2, i3]) for (let j = 12; j < NR - 1; j++) { const q = i * NR + j; Pt.quad(Pt.v(X[q], Y[q], sd * Z[q]), Pt.v(X[q + 1], Y[q + 1], sd * Z[q + 1]), Pt.v(X[q + 1], fy, sd * Z[q + 1]), Pt.v(X[q], fy, sd * Z[q]), (sd < 0) !== (i === i3)); }
      }
      const q = i2 * NR + 12, e = i3 * NR + 12; D.col = [0.01, 0.01, 0.011]; D.quad(D.v(X[q], fy, -Z[q]), D.v(X[q], fy, Z[q]), D.v(X[e], fy, Z[e]), D.v(X[e], fy, -Z[e]));
    }

    // ---- materials and meshes ----
    // paint is double-sided so the hood camera, which sits inside the body, sees the underside of the panels instead of the road
    const p = c.pm, paint = pbr({ color: lin(s.color), metalness: p.m, roughness: p.r, clearcoat: 1, clearcoatRoughness: 0.05, side: T.DoubleSide, vertexColors: true }, p.e || 1.4);
    paint.onBeforeCompile = paintFix;
    const brake = new T.MeshBasicMaterial(Object.assign({ color: 0x6a0a0a }, sm.po2)), lampM = new T.MeshBasicMaterial(Object.assign({ vertexColors: true }, sm.po2));
    const mats = { paint, glass: sm.glass, trim: sm.trim, dark: sm.dark, chrome: sm.chrome, dchrome: sm.dchrome, brake, lamps: lampM };
    if (c.p2) mats.paint2 = pbr(Object.assign({ color: lin(c.p2.color), roughness: c.p2.r, side: T.DoubleSide, vertexColors: true }, c.p2.cc ? { clearcoat: 1, clearcoatRoughness: 0.05 } : {}), 0.8);
    if (c.p2 && c.p2.cc) mats.paint2.onBeforeCompile = paintFix;
    if (bl.decal) mats.decal = splashDecal();
    if (bl.mesh) mats.mesh = sm.mesh || (sm.mesh = pbr(Object.assign({ map: meshMap(), roughness: 0.6, metalness: 0.3 }, sm.po), 0.5));
    if (bl.decal2) mats.decal2 = new T.MeshLambertMaterial(Object.assign({ map: policeMap(), transparent: true, depthWrite: false }, sm.po));
    paint.metalness = Math.max(paint.metalness, 0.4);      // less diffuse: saturated paint (red, orange) otherwise washes out to pastel under the game's sun and tone mapping
    let lamps = null, day = null, night = null;
    for (const k in bl) {
      const geo = bl[k].geo(), m = new T.Mesh(geo, mats[k]); m.castShadow = k === 'paint' || k === 'paint2' || k === 'trim'; g.add(m);
      if (k === 'lamps') { lamps = geo; day = geo.attributes.color; night = new T.Float32BufferAttribute(bl[k].c2, 3); }
    }
    // wheels: FL, FR, RL, RR (left is -Z); the tyre is kept inside the body side
    const wheels = [], steer = [];
    c.ax.forEach((a, r) => {
      const wt = Math.min(c.tw, 2 * (prof(c, a.d, O).w + a.fl - 0.012 - s.track / 2)), wg = wheelGeo(s.R, s.R * c.rr, wt, c.wheel);
      for (const sd of [-1, 1]) {
        const piv = new T.Group(), spin = new T.Group(), t = new T.Mesh(wg[0], sm.dark), rm = new T.Mesh(wg[1], sm.rim); t.castShadow = true;
        if (sd < 0) t.rotation.y = rm.rotation.y = PI;
        piv.position.set(r ? -s.b : s.a, s.R, sd * s.track / 2); spin.add(t, rm); piv.add(spin); g.add(piv); wheels.push(spin); if (!r) steer.push(piv);
      }
    });
    // night look: lamps lit, and the (daytime) environment reflections turned down on this car's paint and on the shared glass and trim
    const setLights = (on) => { if (lamps) lamps.setAttribute('color', on ? night : day); for (const m of [paint, mats.paint2, sm.glass, sm.trim, sm.chrome, sm.dchrome, sm.rim]) if (m) m.envMapIntensity = m.userData.e * (on ? 0.35 : 1); };
    return { group: g, wheels, steer, brake, setLights, noseX: c.x0, tailX: c.x0 - c.L };
  };

  /** Reflection environment: a small sky dome (blue zenith, warm horizon, autumn tree line and ground, low sun in the south-west) prefiltered with PMREM. */
  B.makeEnv = function (renderer) {
    const sc = new T.Scene(), geo = new T.SphereGeometry(40, 48, 24), p = geo.attributes.position, col = new Float32Array(p.count * 3), v = new T.Vector3();
    const sun = new T.Vector3(-0.61, 0.5, 0.61).normalize(), zen = [0.17, 0.4, 0.8], hor = [0.95, 0.8, 0.6], tree = [0.3, 0.16, 0.05], gnd = [0.05, 0.047, 0.044], gh = [0.11, 0.1, 0.085];      // the ground is road: dark, or dark paint mirrors a pale haze on its flanks
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize(); const up = v.y, glow = Math.pow(Math.max(0, v.dot(sun)), 5) * 0.7;
      for (let k = 0; k < 3; k++) col[i * 3 + k] = up > 0.1 ? hor[k] + (zen[k] - hor[k]) * Math.pow((up - 0.1) / 0.9, 0.55) + glow * hor[k] : up > 0.01 ? tree[k] : gh[k] + (gnd[k] - gh[k]) * Math.pow(-Math.min(up, 0), 0.4);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    sc.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const disc = new T.Mesh(new T.SphereGeometry(2, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(36, 29, 18) })); disc.position.copy(sun).multiplyScalar(36); sc.add(disc);
    const pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(sc, 0.03).texture; pm.dispose(); return tex;
  };
})();
