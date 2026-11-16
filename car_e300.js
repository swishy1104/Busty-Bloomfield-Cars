/* Bloomfield Drift — Mercedes-Benz E300 (W213 saloon, US model years 2017-2020, AMG Line exterior, Obsidian Black metallic).
   What this file adds: the eighth player car's model. It wraps BD.buildCar: spec.id 'e300' gets this model, every other id still goes to
   the cars.js builder. Public surface (unchanged from cars.js): BD.buildCar(spec) -> { group, wheels[FL,FR,RL,RR], steer[L,R],
   brake (MeshBasicMaterial the game recolours), setLights(on), noseX, tailX }; +X forward, +Y up, +Z right, origin = CG on the ground.
   How it is made (all numbers from ref/e300/shape.json, the photo traces: x forward from the front axle, y up, z right, metres):
   - Body: one skin lofted through ~290 stations x 49 rows per half-section. A section is the boundary of the region under the top
     surface (bonnet, cowl, windscreen, roof, rear screen, deck: a crown, rail, glass and shelf curve), inside the side surface (sill,
     lower character line, shoulder) and above the floor; the nose and tail are two swept faces (centreline profile + plan sweep)
     that clip the side, so bumpers, corners and the boot lip come out of the same field. The shoulder crease, the lower line and
     the bonnet power domes sit on rows, so they stay crisp.
   - Panels: windows, chrome surround, B-pillar applique, lamps, grille and intake openings, wheel arches are regions given as
     signed-distance outlines in side, front, rear or plan view; every skin cell they cross is split along the outline (no stair
     steps), each piece takes the material of the region it lies in, openings are left empty and filled by recessed parts.
   - Parts: lamp units behind clear lenses (projector, two LED eyebrow guides, LED tail bars), Sport grille (two louvres, plain disc),
     AMG apron fins and mesh, splitter, diffuser, exhaust trims, mirrors, handles, wipers, shark fin, plate (blank), cabin with the
     twin screen, round vents, three-spoke wheel and seats, 19-inch twin-five-spoke wheels on 245/40 and 275/35 tyres, vented discs
     and calipers that steer but do not spin.
   - Lamps: the lens cells of the skin are emitted a second time, pushed 2-3 cm inwards, as the housing seen through the clear lens.
   No logos, badges, lettering or numbers anywhere: badge places are plain discs or nothing. Geometry is built once and cached (by
   axle position, tyre radius and track; the cache is also warmed when the page goes idle); every build gets fresh materials.
   Budget: ~130k triangles, 31 meshes (one draw call each); first build ~0.3 s, cached builds a few ms.
   Debug hooks for the tools: BD.e300Normals (normal shading), BD.e300NoCut (no region cuts), BD.e300Info() (build statistics);
   materials are named 'e300.<part>'. */
(function () {
  'use strict';
  const T = window.THREE, B = (window.BD = window.BD || {});
  if (!T || typeof B.buildCar !== 'function') return;      // cars.js must load first
  const prevBuild = B.buildCar, PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const lin = (h) => new T.Color(h).convertSRGBToLinear();

  // monotone cubic through knots [[x, y, corner?], ...] (any order of x); a corner knot keeps the slopes of both neighbouring segments
  function mono(k0) {
    const k = k0[0][0] > k0[k0.length - 1][0] ? k0.slice().reverse() : k0, n = k.length, ml = new Float64Array(n), mr = new Float64Array(n), d = new Float64Array(n);
    const X = new Float64Array(n), Y = new Float64Array(n); for (let i = 0; i < n; i++) { X[i] = k[i][0]; Y[i] = k[i][1]; }
    for (let i = 0; i < n - 1; i++) d[i] = (Y[i + 1] - Y[i]) / Math.max(X[i + 1] - X[i], 1e-9);
    for (let i = 0; i < n; i++) {
      const a = d[i - 1], b = d[i];
      if (i === 0) ml[i] = mr[i] = b; else if (i === n - 1) ml[i] = mr[i] = a;
      else if (k[i][2]) { ml[i] = a; mr[i] = b; } else if (a * b <= 0) ml[i] = mr[i] = 0;
      else { const h0 = X[i] - X[i - 1], h1 = X[i + 1] - X[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; ml[i] = mr[i] = (w1 + w2) / (w1 / a + w2 / b); }
    }
    return (x) => {
      if (x <= X[0]) return Y[0]; if (x >= X[n - 1]) return Y[n - 1];
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] > x) hi = m; else lo = m; }
      const h = X[hi] - X[lo], t = (x - X[lo]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * Y[lo] + (t3 - 2 * t2 + t) * h * mr[lo] + (3 * t2 - 2 * t3) * Y[hi] + (t3 - t2) * h * ml[hi];
    };
  }
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

  // ================================================================ measured shape (shape.json frame) ================================================================
  const XN = 0.8425, XT = -4.082, XL = 0.776, XLR = -3.878;        // nose, tail, bonnet leading edge (centre), boot lip (centre)
  // centreline face profiles, x of the skin against height (the grille top recess under the bonnet lip is a separate part)
  const xf = mono([[0.10, 0.62], [0.15, 0.72], [0.187, 0.763], [0.21, 0.795], [0.25, 0.825], [0.30, 0.837], [0.35, 0.8412], [0.39, XN], [0.43, 0.8412], [0.47, 0.836], [0.52, 0.824],
    [0.58, 0.807], [0.64, 0.793], [0.70, 0.784], [0.75, 0.7785], [0.779, XL], [0.80, 0.745], [0.82, 0.70], [0.85, 0.60], [0.90, 0.40], [1.0, -0.2]]);
  const xr = mono([[0.18, -3.70], [0.28, -3.93], [0.32, -4.01], [0.36, -4.055], [0.41, -4.077], [0.47, -4.0815], [0.50, XT], [0.53, -4.0815], [0.57, -4.073], [0.62, -4.055],
    [0.67, -4.030], [0.71, -4.010], [0.76, -3.990], [0.80, -3.972], [0.85, -3.946], [0.89, -3.930], [0.94, -3.912], [1.00, -3.889], [1.038, XLR], [1.07, -3.80], [1.12, -3.60]]);
  // top centreline: the face's upper branch ahead of the bonnet edge / behind the boot lip, then bonnet, cowl, windscreen, roof, rear screen, deck
  const fT = mono([[XN, 0.39], [0.8412, 0.43], [0.836, 0.47], [0.824, 0.52], [0.807, 0.58], [0.793, 0.64], [0.784, 0.70], [0.7785, 0.75], [XL, 0.779], [0.74, 0.794], [0.62, 0.830],
    [0.50, 0.859], [0.375, 0.884], [0.25, 0.906], [0.125, 0.923], [0.0, 0.938], [-0.125, 0.951], [-0.25, 0.965], [-0.365, 0.984], [-0.48, 1.006], [-0.53, 1.019], [-0.58, 1.031],
    [-0.625, 1.050], [-0.66, 1.0888], [-0.76, 1.137], [-0.86, 1.1838], [-0.96, 1.2292], [-1.06, 1.2733], [-1.16, 1.3159], [-1.26, 1.3572], [-1.36, 1.397], [-1.42, 1.4105],
    [-1.47, 1.419], [-1.55, 1.4329], [-1.65, 1.4478], [-1.75, 1.4579], [-1.85, 1.4641], [-1.95, 1.4669], [-2.05, 1.467], [-2.15, 1.4646], [-2.25, 1.4597], [-2.35, 1.4524],
    [-2.45, 1.4422], [-2.55, 1.4287], [-2.65, 1.4112], [-2.75, 1.3888], [-2.85, 1.3599], [-2.95, 1.3267], [-3.05, 1.2905], [-3.15, 1.251], [-3.25, 1.2081], [-3.35, 1.1618],
    [-3.45, 1.1121], [-3.50, 1.084], [-3.55, 1.064], [-3.62, 1.052], [-3.70, 1.045], [-3.78, 1.041], [-3.86, 1.0385], [XLR, 1.038], [-3.889, 1.00], [-3.912, 0.94],
    [-3.930, 0.89], [-3.946, 0.85], [-3.972, 0.80], [-3.990, 0.76], [-4.010, 0.71], [-4.030, 0.67], [-4.055, 0.62], [-4.073, 0.57], [-4.0815, 0.53], [XT, 0.50]]);
  // bottom centreline: splitter, floor, rear valance and diffuser, the faces' lower branches at the ends
  const fB = mono([[XN, 0.39], [0.8412, 0.35], [0.837, 0.30], [0.825, 0.25], [0.795, 0.21], [0.763, 0.187], [0.65, 0.19], [0.40, 0.198], [0.0, 0.205], [-2.5, 0.205],
    [-2.9, 0.212], [-3.3, 0.235], [-3.6, 0.262], [-3.85, 0.276], [-3.93, 0.28], [-4.01, 0.32], [-4.055, 0.36], [-4.077, 0.41], [-4.0815, 0.47], [XT, 0.50]]);
  // junction of the side and the top: bonnet leading edge, headlamp tops, shoulder crease, tail-lamp tops, boot lip
  const fyJ = mono([[XL, 0.779], [0.74, 0.777], [0.70, 0.773], [0.65, 0.765], [0.60, 0.755], [0.55, 0.750], [0.50, 0.748], [0.45, 0.748], [0.41, 0.752], [0.37, 0.765],
    [0.33, 0.788], [0.29, 0.815], [0.24, 0.828], [0.12, 0.838], [0.0, 0.845], [-0.5, 0.849], [-1.0, 0.857], [-1.5, 0.865], [-2.0, 0.877], [-2.5, 0.887], [-2.94, 0.895],
    [-3.2, 0.900], [-3.4, 0.906], [-3.55, 0.912], [-3.65, 0.928], [-3.75, 0.945], [-3.80, 0.962], [-3.84, 0.995], [-3.865, 1.024], [-3.875, 1.035], [XLR, 1.038]]);
  const fzJ = mono([[0.6, 0.86], [0.40, 0.88], [0.30, 0.898], [0.24, 0.905], [0.12, 0.913], [0.0, 0.918], [-0.5, 0.920], [-1.0, 0.922], [-1.5, 0.924], [-2.0, 0.925], [-2.5, 0.926],
    [-2.94, 0.926], [-3.2, 0.91], [-3.4, 0.87], [-3.55, 0.81], [-3.7, 0.74]]);
  // greenhouse controls: glass base / fender top G and rail / bonnet-edge corner R (z, y), crown exponent p
  const fzG = mono([[0.4, 0.80], [0.0, 0.85], [-0.3, 0.86], [-0.5, 0.88], [-0.7, 0.866], [-0.9, 0.852], [-1.5, 0.851], [-2.5, 0.851], [-2.8, 0.857], [-2.95, 0.862], [-3.2, 0.84],
    [-3.45, 0.79], [-3.6, 0.70], [-3.75, 0.64]]);
  const fyG = mono([[0.4, 0.828], [0.0, 0.90], [-0.3, 0.915], [-0.5, 0.950], [-0.7, 0.962], [-0.9, 0.975], [-1.1, 0.985], [-1.36, 1.003], [-1.65, 1.019], [-1.94, 1.034], [-2.24, 1.042],
    [-2.53, 1.047], [-2.82, 1.049], [-2.95, 1.043], [-3.2, 1.03], [-3.45, 1.005], [-3.6, 0.99], [-3.75, 0.995]]);
  const fzR = mono([[0.5, 0.68], [0.0, 0.70], [-0.3, 0.72], [-0.52, 0.79], [-0.64, 0.788], [-0.80, 0.770], [-0.95, 0.755], [-1.10, 0.740], [-1.30, 0.70], [-1.50, 0.655],
    [-1.70, 0.635], [-1.90, 0.625], [-2.30, 0.620], [-2.60, 0.620], [-2.80, 0.605], [-2.94, 0.590], [-3.20, 0.572], [-3.45, 0.56], [-3.60, 0.55], [-3.75, 0.52]]);
  const fdR = mono([[0.6, 0.032], [0.3, 0.024], [0.0, 0.018], [-0.3, 0.018], [-0.52, 0.02], [-0.8, 0.025], [-1.1, 0.03], [-1.3, 0.04], [-1.5, 0.052], [-1.9, 0.07], [-2.3, 0.07],
    [-2.6, 0.07], [-2.94, 0.065], [-3.2, 0.058], [-3.45, 0.035], [-3.6, 0.023], [-3.75, 0.017]]);
  const fP = mono([[0.6, 2.0], [0.0, 2.0], [-0.5, 2.2], [-0.8, 3.0], [-1.2, 3.2], [-1.6, 3.0], [-2.5, 3.0], [-3.0, 2.6], [-3.5, 2.2], [-3.8, 2.0]]);
  // side: lower character line (crease along the doors), body widths at the sill, mid height, lower line
  const fyL = mono([[0.6, 0.70], [0.2, 0.70], [-0.357, 0.692], [-0.751, 0.686], [-1.343, 0.68], [-2.133, 0.667], [-2.527, 0.661], [-3.2, 0.66], [-3.8, 0.66]]);
  const fcL = mono([[0.05, 0], [-0.30, 1], [-2.55, 1], [-2.85, 0]]);     // lower-line crease strength
  const fzM = mono([[0.9, 0.86], [0.4, 0.88], [0.2, 0.90], [0.0, 0.906], [-0.5, 0.911], [-1.5, 0.913], [-2.5, 0.914], [-2.94, 0.918], [-3.2, 0.911], [-3.5, 0.893], [-4.1, 0.87]]);
  const fzS = mono([[0.9, 0.84], [0.3, 0.87], [0.0, 0.885], [-0.4, 0.893], [-2.5, 0.894], [-2.9, 0.895], [-3.3, 0.885], [-4.1, 0.84]]);      // sill
  // face sweeps: how far a point at half-width z sits behind the centreline face, Q(z) = k2 z^2 + c max(0, z - z0)^2
  function qinv(d, k2, c, z0) {
    if (d <= 0) return 0; if (d <= k2 * z0 * z0) return Math.sqrt(d / k2);
    const a = k2 + c, b = -2 * c * z0, cc = c * z0 * z0 - d; return (-b + Math.sqrt(Math.max(b * b - 4 * a * cc, 0))) / (2 * a);
  }
  // bumper level: flat middle, corners rolling back fast (plan, photo 41); lamp level: the tracer's 0.64 z^2 lamp band; boot lip: straight to 0.41
  const QF = (y, o) => { const t = sstep(0.50, 0.72, y); o[0] = lerp(0.40, 0.61, t); o[1] = lerp(4.5, 0, t); o[2] = 0.625; return o; };
  const QR = (y, o) => { const t = sstep(0.82, 1.04, y); o[0] = lerp(0.33, 0.04, t); o[1] = lerp(5.6, 1.4, t); o[2] = lerp(0.62, 0.41, t); return o; };
  const Qv = (z, q) => q[0] * z * z + q[1] * Math.max(0, z - q[2]) * Math.max(0, z - q[2]), Qd = (z, q) => 2 * q[0] * z + 2 * q[1] * Math.max(0, z - q[2]);
  const q0 = [0, 0, 0], q1 = [0, 0, 0];
  const Zf = (x, y) => { QF(y, q0); return qinv(xf(y) - x, q0[0], q0[1], q0[2]); };
  const Zr = (x, y) => { QR(y, q0); return qinv(x - xr(y), q0[0], q0[1], q0[2]); };
  // outward gradients of the two faces, F = Q(z; y) -+ (x - centreline x(y)): regular where the face contour closes (z -> 0)
  const gradF = (y, z, o) => { const e = 1e-4; o[0] = 1; o[1] = (Qv(z, QF(y + e, q0)) - Qv(z, QF(y - e, q1))) / (2 * e) - (xf(y + e) - xf(y - e)) / (2 * e); o[2] = Qd(z, QF(y, q0)); return o; };
  const gradR = (y, z, o) => { const e = 1e-4; o[0] = -1; o[1] = (Qv(z, QR(y + e, q0)) - Qv(z, QR(y - e, q1))) / (2 * e) + (xr(y + e) - xr(y - e)) / (2 * e); o[2] = Qd(z, QR(y, q0)); return o; };
  // bonnet power domes: two long low bulges either side of the centre (estimated from the reflections in 25, 40, 41)
  // (u = z over the rail half-width)
  // (a raised-cosine bump across each dome, so the reflections bend smoothly instead of breaking on steps)
  const dome = (x, u) => { const d = Math.abs(u - 0.37) / 0.21; return d >= 1 ? 0 : 0.009 * 0.5 * (1 + Math.cos(PI * d)) * sstep(-0.52, -0.2, x) * (1 - sstep(0.18, 0.62, x)); };

  // ================================================================ sections ================================================================
  // rows: floor 3, floor fillet 3, side below the lower line 8, side above it 6, top fillet 2, shelf 3, glass 7, crown 16 (R to the centre)
  const BANDS = [3, 3, 8, 6, 2, 3, 7, 16], RB = [0]; for (const b of BANDS) RB.push(RB[RB.length - 1] + b);
  const NR = RB[RB.length - 1] + 1;                                   // 49 rows: 0 = floor centre ... 48 = top centre
  const CROWN = [1, 0.94, 0.87, 0.79, 0.70, 0.60, 0.53, 0.50, 0.47, 0.40, 0.31, 0.25, 0.215, 0.185, 0.12, 0.06, 0];
  function ctl(x) {
    const c = { x, T: fT(x), B: fB(x) };
    if (x >= XL || x <= XLR) { c.zJ = 0; c.yJ = c.T; c.zJm = fzJ(x); }
    else {
      c.yJ = fyJ(x); c.zJm = fzJ(x);
      const wF = sstep(0.27, 0.42, x), wR = 1 - sstep(-3.58, -3.46, x);
      c.zJ = Math.min(c.zJm, lerp(c.zJm, wF > 0 ? Zf(x, c.yJ) : Zr(x, c.yJ), Math.max(wF, wR)));
    }
    c.zR = fzR(x); c.yR = c.T - fdR(x); c.zG = fzG(x); c.yG = fyG(x); c.p = fP(x);
    // near the ends everything folds inside the junction
    c.zG = Math.min(c.zG, c.zJ * 0.93); c.zR = Math.min(c.zR, c.zG * 0.86, c.zJ * 0.78);
    c.yG = Math.min(c.yG, lerp(c.yJ, c.T, 0.3)); c.yR = clamp(c.yR, lerp(c.yG, c.T, 0.45), c.T);
    if (c.zJ < 1e-4) { c.zG = c.zR = 0; c.yG = c.yR = c.T; }
    c.yL = fyL(x); c.cL = fcL(x); c.zM = fzM(x); c.zS = fzS(x);
    return c;
  }
  // top surface y(z) of a station: crown to the rail corner R, glass to G, shelf to the junction J, then a steep extension
  function topCurve(c) {
    if (c.zJ < 1e-4) return () => c.T;
    const k = [], dT = c.T - c.yR;
    for (const f of [0, 0.35, 0.6, 0.8, 0.92]) k.push([f * c.zR, c.T - dT * Math.pow(f, c.p)]);
    k.push([c.zR, c.yR]);
    const gz = c.zG - c.zR, gy = c.yG - c.yR, gl = Math.hypot(gz, gy) || 1, bul = 0.012 * Math.min(1, gl / 0.3);
    for (const f of [0.33, 0.67]) { const s = Math.sin(PI * f) * bul; k.push([c.zR + gz * f - gy / gl * s, c.yR + gy * f + gz / gl * s]); }      // glass bows outwards
    k.push([c.zG, c.yG]); k.push([lerp(c.zJ, c.zG, 0.35), lerp(c.yJ, c.yG, 0.55)]); k.push([c.zJ, c.yJ]); k.push([c.zJ + 0.04, c.yJ - 0.3]);
    for (let i = 1; i < k.length; i++) if (k[i][0] <= k[i - 1][0] + 1e-6) k[i][0] = k[i - 1][0] + 1e-6;
    const f = mono(k), x = c.x, zr = c.zR; return (z) => f(z) + dome(x, z / zr);
  }
  // main side z(y) (before the face clip): sill, mid, lower-line crease, shoulder; KF / KR: blend widths into the front / rear face
  const KF = 0.06, KR = 0.12;
  function sideCurve(c) {
    const zt = Math.max(c.zJm, c.zJ), yt = c.yJ, k = [];
    const zL = lerp(lerp(c.zM, zt, (c.yL - 0.5) / Math.max(yt - 0.5, 0.05)), c.zM + 0.009, c.cL);
    for (const q of [[0.08, c.zS - 0.16], [0.24, c.zS], [0.33, c.zS + 0.014], [0.50, c.zM], [c.yL, zL, 1]]) if (q[0] < yt - 0.02) k.push(q);
    k.push([yt, zt]); k.push([yt + 0.3, zt + 0.06]);
    const f = mono(k), x = c.x, g = (y) => Math.max(0, smin(smin(f(y), Zf(x, y), KF), Zr(x, y), KR));
    g.m = f; return g;
  }
  // n rows spread evenly by arc length along z = f(y), y0..y1 (sampled densely towards both ends, where a closed face contour turns fast)
  const AS = new Float64Array(65), AZ = new Float64Array(65), AY = new Float64Array(65);
  function arcRows(f, y0, y1, n, put) {
    for (let k = 0; k <= 64; k++) { const y = y0 + (y1 - y0) * (1 - Math.cos(PI * k / 64)) / 2; AY[k] = y; AZ[k] = f(y); AS[k] = k ? AS[k - 1] + Math.hypot(AZ[k] - AZ[k - 1], y - AY[k - 1]) : 0; }
    for (let q = 0, k = 0; q < n; q++) {
      const t = AS[64] * q / n; while (k < 63 && AS[k + 1] < t) k++;
      const u = AS[k + 1] > AS[k] ? (t - AS[k]) / (AS[k + 1] - AS[k]) : 0; put(lerp(AZ[k], AZ[k + 1], u), lerp(AY[k], AY[k + 1], u));
    }
  }
  const rootf = (g, a, b) => { let ga = g(a); if (ga <= 0) return a; let gb = g(b); if (gb > 0) return b; for (let i = 0; i < 40; i++) { const m = (a + b) / 2, gm = g(m); if (gm > 0) { a = m; ga = gm; } else { b = m; gb = gm; } } return (a + b) / 2; };
  // one station -> NR (z, y) rows, from the floor centre round the side to the top centre; with nrm, two normals per row (cells below
  // and above it: they differ on creases), taken from the body field itself (side z(x, y), top y(x, z), floor, fillet tangents)
  const KB = new Int8Array(NR), KA = new Int8Array(NR), PB = new Float64Array(NR), PA = new Float64Array(NR);
  function section(x, out, nrm) {
    const c = ctl(x), top = topCurve(c), side = sideCurve(c), bot = (z) => c.B + 0.022 * Math.pow(z / 0.85, 4);
    // junctions: the top meets the (clipped) side; the side meets the floor
    const zj = c.zJ < 1e-4 ? 0 : rootf((z) => side(top(z)) - z, 0, c.zJ + 0.04), yj = c.zJ < 1e-4 ? c.T : top(zj);
    const zb = rootf((z) => side(bot(z)) - z, 0, 1.3), yb = bot(zb);
    const rj = Math.min(x > 0.3 ? lerp(0.004, 0.02, sstep(0.3, 0.42, x)) : x < -3.5 ? lerp(0.004, 0.012, 1 - sstep(-3.62, -3.5, x)) : 0.004, 0.45 * zj, 0.3 * (yj - yb));
    const rb = Math.min(lerp(0.035, 0.03, sstep(0.3, 0.6, x)), 0.5 * zb, 0.3 * (yj - yb));
    const ylo = yb + rb, yhi = yj - rj, yL = clamp(c.yL, ylo + 0.3 * (yhi - ylo), ylo + 0.75 * (yhi - ylo));
    const zs = Math.max(zj - rj, 0), zg = Math.min(c.zG, zs * 0.97), zr = Math.min(c.zR, zg * 0.97);
    const f1 = [zb - rb, bot(zb - rb), zb, yb, side(ylo), ylo], f2 = [side(yhi), yhi, zj, yj, zs, top(zs)];      // fillets: A, corner, C
    const ends = [[0, zb - rb], [1, 1], [2, yL], [2, yhi], [3, 1], [4, zg], [4, zr], [4, 0]];
    let r = 0, band = 0; const put = (z, y, k, q) => {
      out[r * 2] = Math.max(z, 0); out[r * 2 + 1] = y; KA[r] = k; PA[r] = q;
      if (r === RB[band] && band > 0) { KB[r] = ends[band - 1][0]; PB[r] = ends[band - 1][1]; } else { KB[r] = k; PB[r] = q; }
      r++; if (r === RB[band + 1]) band++;
    };
    const bez = (f, t, k) => { const u = 1 - t; put(u * u * f[0] + 2 * u * t * f[2] + t * t * f[4], u * u * f[1] + 2 * u * t * f[3] + t * t * f[5], k, t); };
    for (let q = 0; q < BANDS[0]; q++) { const z = (zb - rb) * q / BANDS[0]; put(z, bot(z), 0, z); }
    for (let q = 0; q < BANDS[1]; q++) bez(f1, q / BANDS[1], 1);
    arcRows(side, ylo, yL, BANDS[2], (z, y) => put(z, y, 2, y)); arcRows(side, yL, yhi, BANDS[3], (z, y) => put(z, y, 2, y));
    for (let q = 0; q < BANDS[4]; q++) bez(f2, q / BANDS[4], 3);
    for (let q = 0; q < BANDS[5]; q++) { const z = lerp(zs, zg, q / BANDS[5]); put(z, top(z), 4, z); }
    for (let q = 0; q < BANDS[6]; q++) { const z = lerp(zg, zr, q / BANDS[6]); put(z, top(z), 4, z); }
    for (let q = 0; q < BANDS[7]; q++) { const z = zr * CROWN[q]; put(z, top(z), 4, z); }
    put(0, top(0), 4, 0);
    if (!nrm) return out;
    // x-derivatives from the neighbouring field (kept inside the car's ends)
    const dp = Math.min(0.0015, (XN - x) * 0.9), dm = Math.min(0.0015, (x - XT) * 0.9), dd = dp + dm || 1e-6;
    const cP = ctl(x + dp), cM = ctl(x - dm), topP = topCurve(cP), topM = topCurve(cM), sideP = sideCurve(cP), sideM = sideCurve(cM), e = 1e-4;
    const n3 = [0, 0, 0], unit = (a, b, cc) => { const l = Math.hypot(a, b, cc) || 1; n3[0] = a / l; n3[1] = b / l; n3[2] = cc / l; return n3; };
    // dir: -1 = derivative from the lower-row side, +1 = from the upper-row side, 0 = central
    const nrmAt = (k, p, dir) => {
      if (k === 0) { const yz = 0.088 * p * p * p / 0.522; return unit((cP.B - cM.B) / dd, -1, yz); }
      if (k === 2) {
        // the side is smin(main side, front face, rear face): blend the three unit normals with the smooth-min weights
        const m = side.m, a = m(p), b = Zf(x, p), cz = Zr(x, p), z = side(p);
        const zy = dir < 0 ? (m(p) - m(p - e)) / e : dir > 0 ? (m(p + e) - m(p)) / e : (m(p + e) - m(p - e)) / (2 * e);
        const wb = clamp(0.5 + 0.5 * (a - b) / KF, 0, 1), m1 = smin(a, b, KF), wc = clamp(0.5 + 0.5 * (m1 - cz) / KR, 0, 1), wa = (1 - wc) * (1 - wb), wf = (1 - wc) * wb;
        let nx = 0, ny = 0, nz = 0, l;
        if (wa > 0) { const gx = -(sideP.m(p) - sideM.m(p)) / dd; l = Math.hypot(gx, zy, 1); nx += wa * gx / l; ny -= wa * zy / l; nz += wa / l; }
        if (wf > 0) { gradF(p, z, n3); l = Math.hypot(n3[0], n3[1], n3[2]); nx += wf * n3[0] / l; ny += wf * n3[1] / l; nz += wf * n3[2] / l; }
        if (wc > 0) { gradR(p, z, n3); l = Math.hypot(n3[0], n3[1], n3[2]); nx += wc * n3[0] / l; ny += wc * n3[1] / l; nz += wc * n3[2] / l; }
        return unit(nx, ny, nz);
      }
      if (k === 4) { const yz = dir < 0 ? (top(p + e) - top(p)) / e : dir > 0 ? (top(p) - top(Math.max(p - e, 0))) / Math.max(Math.min(e, p), 1e-9) : (top(p + e) - top(Math.max(p - e, 0))) / (e + Math.min(e, p)); return unit(-(topP(p) - topM(p)) / dd, 1, -yz); }
      // fillet: in-plane normal from the Bezier tangent, x-part blended between the two pieces it joins
      const f = k === 1 ? f1 : f2, t = p, tz = 2 * (1 - t) * (f[2] - f[0]) + 2 * t * (f[4] - f[2]), ty = 2 * (1 - t) * (f[3] - f[1]) + 2 * t * (f[5] - f[3]);
      const a = k === 1 ? nrmAt(0, f1[0], -1).slice() : nrmAt(2, f2[1], -1).slice(), b = k === 1 ? nrmAt(2, f1[5], 1).slice() : nrmAt(4, f2[4], 1).slice();
      const tl = Math.hypot(tz, ty); if (tl < 1e-9) return unit(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
      const nx = lerp(a[0], b[0], t), w = Math.sqrt(Math.max(1 - nx * nx, 0)); return unit(nx, (-tz / tl) * w, (ty / tl) * w);
    };
    for (let j = 0; j < NR; j++) {
      const bnd = RB.includes(j), q = j * 6;
      let v = nrmAt(KB[j], PB[j], bnd ? -1 : 0); nrm[q] = v[0]; nrm[q + 1] = v[1]; nrm[q + 2] = v[2];
      v = nrmAt(KA[j], PA[j], bnd ? 1 : 0); nrm[q + 3] = v[0]; nrm[q + 4] = v[1]; nrm[q + 5] = v[2];
      if (out[j * 2] < 1e-7) for (const o of [q, q + 3]) { nrm[o + 2] = 0; const l = Math.hypot(nrm[o], nrm[o + 1]) || 1; nrm[o] /= l; nrm[o + 1] /= l; }      // on the centreline
    }
    return out;
  }
  // stations from the nose to the tail: quadratic spacing into both face tips, fine at the corners and the boot lip
  function stations() {
    // spacing by x: fine where the faces stand nearly upright (bumper tip, grille top / bonnet lip, boot lip), coarse along the doors
    const h = (x) => x > 0.80 ? 0.003 : x > 0.785 ? 0.002 : x > 0.768 ? 0.0012 : x > 0.70 ? 0.004 : x > 0.30 ? 0.011 : x > -3.50 ? 0.028 : x > -3.85 ? 0.012 : x > -3.93 ? 0.002 : 0.004;
    const S = []; for (let k = 0; k <= 7; k++) S.push(XN - 0.00021 * k * k);      // quadratic into the tip: the contour grows like a square root
    for (let x = S[S.length - 1] - h(S[S.length - 1]); x > XT + 0.0105; x -= h(x)) S.push(x);
    for (let k = 7; k >= 0; k--) S.push(XT + 0.0002 * k * k);
    return S;
  }

  // ================================================================ geometry builders ================================================================
  function Bld(col, uv) { this.p = []; this.n = []; this.i = []; this.c = col ? [] : null; this.uv = uv ? [] : null; this.col = [1, 1, 1]; }
  Bld.prototype.v = function (x, y, z, nx, ny, nz) { this.p.push(x, y, z); this.n.push(nx, ny, nz); if (this.c) this.c.push(this.col[0], this.col[1], this.col[2]); return this.p.length / 3 - 1; };
  Bld.prototype.tri = function (a, b, c) { this.i.push(a, b, c); };
  // a three.js geometry through matrix m (normals through its normal matrix); flip turns it inside out
  const _m3 = new T.Matrix3(), _v = new T.Vector3();
  Bld.prototype.add = function (geo, m, flip) {
    const g = geo.index ? geo : geo, pa = g.attributes.position, na = g.attributes.normal, o = this.p.length / 3; _m3.getNormalMatrix(m);
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(m); const x = _v.x, y = _v.y, z = _v.z;
      if (na) _v.fromBufferAttribute(na, i).applyMatrix3(_m3).normalize(); else _v.set(0, 1, 0);
      this.v(x, y, z, flip ? -_v.x : _v.x, flip ? -_v.y : _v.y, flip ? -_v.z : _v.z);
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 3) { const a = g.index.getX(i), b = g.index.getX(i + 1), c = g.index.getX(i + 2); flip ? this.tri(o + a, o + c, o + b) : this.tri(o + a, o + b, o + c); }
    else for (let i = 0; i < pa.count; i += 3) flip ? this.tri(o + i, o + i + 2, o + i + 1) : this.tri(o + i, o + i + 1, o + i + 2);
    geo.dispose(); return this;
  };
  Bld.prototype.geo = function () {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    if (this.c) g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3)); if (this.uv) g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.p.length / 3 > 65535 ? new T.Uint32BufferAttribute(this.i, 1) : new T.Uint16BufferAttribute(this.i, 1)); g.computeBoundingSphere(); return g;
  };
  const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new T.Vector3(sx || 1, sy || 1, sz || 1));

  // ================================================================ outlines (shape.json, right side) ================================================================
  const OL = {
    archF: [[0.338, 0.242], [0.348, 0.292], [0.357, 0.341], [0.366, 0.391], [0.375, 0.44], [0.385, 0.49], [0.369, 0.537], [0.343, 0.58], [0.309, 0.617], [0.268, 0.646], [0.224, 0.669], [0.177, 0.689],
      [0.129, 0.703], [0.08, 0.715], [0.03, 0.721], [-0.02, 0.724], [-0.07, 0.719], [-0.12, 0.713], [-0.169, 0.699], [-0.214, 0.679], [-0.257, 0.653], [-0.297, 0.622], [-0.335, 0.589],
      [-0.366, 0.549], [-0.379, 0.501], [-0.386, 0.452], [-0.387, 0.401], [-0.389, 0.351], [-0.39, 0.3], [-0.392, 0.25], [-0.392, -0.3], [0.338, -0.3]],
    archR: [[-2.517, 0.255], [-2.517, 0.305], [-2.521, 0.355], [-2.527, 0.404], [-2.534, 0.453], [-2.551, 0.499], [-2.571, 0.545], [-2.597, 0.587], [-2.625, 0.628], [-2.664, 0.659], [-2.705, 0.686],
      [-2.752, 0.702], [-2.8, 0.717], [-2.849, 0.724], [-2.898, 0.73], [-2.948, 0.73], [-2.997, 0.726], [-3.046, 0.719], [-3.093, 0.703], [-3.14, 0.685], [-3.183, 0.66], [-3.22, 0.628],
      [-3.255, 0.593], [-3.278, 0.549], [-3.298, 0.504], [-3.308, 0.455], [-3.317, 0.406], [-3.322, 0.357], [-3.327, 0.307], [-3.327, 0.258], [-3.327, -0.3], [-2.517, -0.3]],
    // window opening: outer edge of the chrome surround (top) closed along the beltline
    dlo: [[-0.742, 0.944], [-0.777, 0.978], [-0.816, 1.01], [-0.857, 1.038], [-0.898, 1.065], [-0.94, 1.089], [-0.976, 1.111], [-1.017, 1.136], [-1.06, 1.16], [-1.104, 1.182], [-1.151, 1.203],
      [-1.196, 1.222], [-1.241, 1.24], [-1.287, 1.259], [-1.33, 1.284], [-1.362, 1.302], [-1.409, 1.321], [-1.457, 1.336], [-1.506, 1.347], [-1.555, 1.356], [-1.604, 1.363], [-1.654, 1.369],
      [-1.704, 1.374], [-1.754, 1.378], [-1.804, 1.381], [-1.854, 1.383], [-1.904, 1.385], [-1.954, 1.387], [-2.004, 1.388], [-2.054, 1.387], [-2.104, 1.387], [-2.154, 1.386], [-2.204, 1.384],
      [-2.254, 1.382], [-2.304, 1.377], [-2.353, 1.371], [-2.403, 1.363], [-2.452, 1.355], [-2.5, 1.342], [-2.547, 1.328], [-2.593, 1.309], [-2.639, 1.29], [-2.684, 1.269], [-2.727, 1.243],
      [-2.771, 1.219], [-2.812, 1.19], [-2.852, 1.161], [-2.886, 1.126], [-2.911, 1.083], [-2.922, 1.034], [-2.9, 1.03], [-2.824, 1.034], [-2.726, 1.034], [-2.628, 1.032], [-2.53, 1.032], [-2.432, 1.03], [-2.334, 1.029], [-2.237, 1.027], [-2.139, 1.025], [-2.041, 1.022], [-1.943, 1.019], [-1.845, 1.016], [-1.748, 1.01], [-1.65, 1.005], [-1.552, 1.001], [-1.455, 0.996], [-1.357, 0.99], [-1.26, 0.985], [-1.163, 0.979], [-1.068, 0.968], [-0.973, 0.957], [-0.884, 0.957], [-0.787, 0.957]],
    head: [[0.841, 0.725], [0.813, 0.726], [0.785, 0.726], [0.758, 0.726], [0.729, 0.724], [0.7, 0.722], [0.671, 0.719], [0.642, 0.715], [0.614, 0.706], [0.585, 0.697], [0.557, 0.687], [0.53, 0.674],
      [0.512, 0.647], [0.498, 0.616], [0.488, 0.582], [0.479, 0.548], [0.511, 0.54], [0.551, 0.532], [0.583, 0.528], [0.615, 0.525], [0.646, 0.522], [0.676, 0.521], [0.705, 0.519], [0.735, 0.518],
      [0.764, 0.517], [0.791, 0.517], [0.819, 0.519], [0.839, 0.54], [0.855, 0.565], [0.863, 0.597], [0.865, 0.634], [0.861, 0.672], [0.851, 0.709]],
    grille: [[0.429, 0.704], [0.218, 0.705], [0, 0.703], [-0.218, 0.705], [-0.429, 0.704], [-0.447, 0.685], [-0.444, 0.619], [-0.422, 0.544], [-0.369, 0.526], [-0.22, 0.502], [-0.074, 0.474],
      [0, 0.462], [0.074, 0.474], [0.22, 0.502], [0.369, 0.526], [0.422, 0.544], [0.444, 0.619], [0.447, 0.685]],
    apron: [[0.792, 0.406], [0.76, 0.417], [0.727, 0.427], [0.694, 0.435], [0.658, 0.437], [0.614, 0.44], [0.578, 0.438], [0.543, 0.432], [0.509, 0.421], [0.484, 0.391], [0.465, 0.36],
      [0.481, 0.324], [0.503, 0.296], [0.547, 0.283], [0.582, 0.273], [0.617, 0.263], [0.651, 0.252], [0.685, 0.242], [0.718, 0.231], [0.752, 0.223], [0.784, 0.235], [0.805, 0.27], [0.81, 0.309],
      [0.804, 0.348], [0.796, 0.387]],
    lower: [[0.505, 0.317], [0.227, 0.353], [0, 0.359], [-0.227, 0.353], [-0.505, 0.317], [-0.505, 0.215], [-0.232, 0.25], [0, 0.257], [0.232, 0.25], [0.505, 0.215]],
    tailR: [[0.662, 0.946], [0.627, 0.939], [0.592, 0.929], [0.564, 0.911], [0.545, 0.88], [0.529, 0.851], [0.517, 0.821], [0.51, 0.787], [0.508, 0.771], [0.516, 0.758], [0.532, 0.748], [0.55, 0.745],
      [0.597, 0.74], [0.634, 0.74], [0.67, 0.742], [0.704, 0.75], [0.722, 0.778], [0.73, 0.811], [0.733, 0.846], [0.729, 0.863], [0.719, 0.898], [0.695, 0.927], [0.679, 0.938]],
    tailS: [[-3.575, 0.895], [-3.607, 0.917], [-3.646, 0.923], [-3.686, 0.925], [-3.726, 0.924], [-3.743, 0.892], [-3.761, 0.856], [-3.779, 0.82], [-3.795, 0.784], [-3.803, 0.746],
      [-3.764, 0.754], [-3.728, 0.77], [-3.696, 0.794], [-3.665, 0.82], [-3.634, 0.845], [-3.601, 0.867]],
    // side-view limit of the head-lamp lens: the traced upper edge and rear tip, then straight down (the traced lower edge would cut
    // the lens short on this body, whose corner sweeps back a little further than the real one)
    headS: [[0.377, 0.733], [0.394, 0.742], [0.433, 0.752], [0.472, 0.758], [0.531, 0.761], [0.95, 0.78], [0.95, 0.45], [0.43, 0.45], [0.415, 0.62], [0.40, 0.70]],
    refl: [[0.692, 0.562], [0.455, 0.594], [0.461, 0.575], [0.685, 0.543]],
    mirror: [[-1.018, 1.112], [-0.98, 1.098], [-0.943, 1.084], [-0.921, 1.05], [-0.913, 1.013], [-0.938, 0.981], [-0.976, 0.974], [-1.016, 0.972], [-1.057, 0.973], [-1.087, 0.984], [-1.089, 1.024],
      [-1.088, 1.064], [-1.075, 1.1], [-1.039, 1.111]],
  };
  // signed distance to a closed polygon [[a, b], ...] (negative inside)
  function sd2(poly) {
    const n = poly.length, A = new Float64Array(n), Bv = new Float64Array(n); poly.forEach((p, i) => { A[i] = p[0]; Bv[i] = p[1]; });
    return (a, b) => {
      let d = 1e9, ins = false;
      for (let k = 0, m = n - 1; k < n; m = k++) {
        const ax = A[m], ay = Bv[m], ex = A[k] - ax, ey = Bv[k] - ay, wx = a - ax, wy = b - ay, l = ex * ex + ey * ey;
        const t = l > 0 ? clamp((wx * ex + wy * ey) / l, 0, 1) : 0, dx = wx - ex * t, dy = wy - ey * t, dd = dx * dx + dy * dy; if (dd < d) d = dd;
        if ((ay > b) !== (Bv[k] > b) && a < ax + (b - ay) * ex / ey) ins = !ins;
      }
      return ins ? -Math.sqrt(d) : Math.sqrt(d);
    };
  }
  // signed distance to the line through (a0, b0)-(a1, b1); negative on the left of the direction of travel
  const sdLine = (a0, b0, a1, b1) => { const l = Math.hypot(a1 - a0, b1 - b0), na = -(b1 - b0) / l, nb = (a1 - a0) / l; return (a, b) => -((a - a0) * na + (b - b0) * nb); };
  // rounded box in two coordinates
  const sdRBox = (ca, cb, ha, hb, r) => (a, b) => { const qa = Math.abs(a - ca) - ha + r, qb = Math.abs(b - cb) - hb + r; return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r; };

  // regions: material, priority, box [x0, x1, y0, y1, z0, z1] and conditions [field, sign]: inside where sign * f < 0 for all
  // a field { f(x, y, z), cut }: cut fields split the skin cells they cross; the others only sort pieces (no visible edge there)
  function regions() {
    const R = [], fld = (f, cut = true) => ({ f, cut }), reg = (m, p, box, ...c) => R.push({ m, p, box, c: c.map((q) => (q.f ? [q, 1] : q)) });
    const side = (poly) => { const g = sd2(poly); return (x, y) => g(x, y); };
    // wheel openings (the floor is kept under the cabin)
    for (const a of [OL.archF, OL.archR]) { const g = side(a); reg(null, 9, [-3.4, 0.45, -0.1, 0.8, 0.5, 1.2], fld((x, y) => g(x, y)), fld((x, y, z) => 0.58 - z, false)); }
    // side windows: chrome surround 16 mm, black seal 5 mm, glass; gloss-black B-pillar applique; black quarter-light divider
    const dl = sd2(OL.dlo), dlo = fld((x, y) => dl(x, y)), dlo1 = fld((x, y) => dl(x, y) + 0.016), dlo2 = fld((x, y) => dl(x, y) + 0.021), zs = fld((x, y, z) => 0.55 - z, false), bx = [-2.95, -0.72, 0.92, 1.41, 0.5, 1.0];
    reg('chrome', 4, bx, dlo, zs); reg('gloss', 5, bx, dlo1, zs); reg('glass', 6, bx, dlo2, zs);
    const bF = fld(sdLine(-1.726, 1.027, -1.818, 1.354)), bR = fld(sdLine(-1.952, 1.353, -1.926, 1.026)), qF = fld(sdLine(-2.493, 1.035, -2.511, 1.318)), qR = fld(sdLine(-2.541, 1.308, -2.532, 1.038));
    reg('gloss', 7, bx, dlo1, zs, [bF, -1], [bR, -1]); reg('gloss', 7, bx, dlo1, zs, [qF, -1], [qR, -1]);
    // windscreen (frit border gloss black) and the cowl between the bonnet's rear edge and the glass
    const xb = (z) => -0.625 + 0.11 * (z / 0.72) * (z / 0.72), xtp = (z) => -1.47 - 0.03 * (z / 0.6) * (z / 0.6), xbr = (z) => -0.575 + 0.075 * (z / 0.78) * (z / 0.78);
    const wB = fld((x, y, z) => x - xb(z)), wT = fld((x, y, z) => xtp(z) - x), wS = fld((x, y, z) => z - fzR(x) + 0.028), up = fld((x, y) => 0.93 - y, false);
    const wB2 = fld((x, y, z) => x - xb(z) + 0.035), wT2 = fld((x, y, z) => xtp(z) - x + 0.075), wS2 = fld((x, y, z) => z - fzR(x) + 0.055), wbx = [-1.62, -0.45, 0.93, 1.46, 0, 0.85];
    reg('gloss', 4, wbx, wB, wT, wS, up); reg('glass', 5, wbx, wB2, wT2, wS2, up);
    const cw = fld((x, y, z) => x - xbr(z)); reg('trim', 4, [-0.68, -0.45, 0.93, 1.1, 0, 0.82], cw, [wB, -1], up, fld((x, y, z) => z - 0.79, false));
    // rear screen
    const xrt = (z) => -2.86 + 0.05 * (z / 0.55) * (z / 0.55), xrb = (z) => -3.505 + 0.09 * (z / 0.62) * (z / 0.62), rbx = [-3.56, -2.75, 1.0, 1.45, 0, 0.8];
    const rT = fld((x, y, z) => x - xrt(z)), rB = fld((x, y, z) => xrb(z) - x), rS = fld((x, y, z) => z - fzR(x) + 0.03);
    const rT2 = fld((x, y, z) => x - xrt(z) + 0.06), rB2 = fld((x, y, z) => xrb(z) - x + 0.035), rS2 = fld((x, y, z) => z - fzR(x) + 0.06);
    reg('gloss', 4, rbx, rT, rB, rS, up); reg('glass', 5, rbx, rT2, rB2, rS2, up);
    // panoramic roof: two dark panes in a black frame, a bar between them
    const pr = sdRBox(-2.15, 0, 0.56, 0.475, 0.09), pR = fld((x, y, z) => pr(x, z)), pR2 = fld((x, y, z) => pr(x, z) + 0.035), pbar = fld((x) => Math.abs(x + 2.2) - 0.018), hi = fld((x, y) => 1.3 - y, false);
    const pbx = [-2.75, -1.55, 1.3, 1.5, 0, 0.5];
    reg('gloss', 4, pbx, pR, hi); reg('roofglass', 5, pbx, pR2, hi); reg('gloss', 6, pbx, pR2, pbar, hi);
    // lamps, grille and intakes (front view), tail lamps (rear and side view)
    const fv = (poly, xmin) => { const g = sd2(poly); return [fld((x, y, z) => g(z, y)), fld((x) => xmin - x, false)]; };
    // the lens is inside the front outline and, seen from the side, ahead of OL.headS: no lens on the wing
    const hs = sd2(OL.headS); reg('hlens', 6, [0.25, 0.9, 0.5, 0.78, 0.45, 0.9], ...fv(OL.head, 0.22), fld((x, y) => hs(x, y)));
    reg(null, 6, [0.55, 0.9, 0.44, 0.73, 0, 0.47], ...fv(OL.grille, 0.6));
    reg(null, 6, [0.4, 0.9, 0.2, 0.46, 0.44, 0.83], ...fv(OL.apron, 0.4));
    reg(null, 6, [0.6, 0.9, 0.19, 0.37, 0, 0.52], ...fv(OL.lower, 0.6));
    const spl = mono([[0, 0.229], [0.232, 0.226], [0.505, 0.196]]);
    reg('chrome', 5, [0.6, 0.9, 0.17, 0.25, 0, 0.53], fld((x, y, z) => y - spl(z) - 0.0085), fld((x, y, z) => spl(z) - 0.0085 - y), fld((x, y, z) => z - 0.505), fld((x) => 0.6 - x, false));
    const tr = sd2(OL.tailR), ts = sd2(OL.tailS);
    reg('tlens', 6, [-4.0, -3.7, 0.72, 0.96, 0.45, 0.8], fld((x, y, z) => tr(z, y)), fld((x) => x + 3.735, false));
    reg('tlens', 6, [-3.82, -3.55, 0.72, 0.95, 0.6, 0.85], fld((x, y) => ts(x, y)), fld((x, y, z) => 0.66 - z, false), fld((x) => -3.735 - x, false));
    // rear: reflectors, boot chrome strip, diffuser insert with the chrome strip joining the exhaust trims
    const rf = sd2(OL.refl); reg('refl', 6, [-4.1, -3.85, 0.52, 0.62, 0.42, 0.72], fld((x, y, z) => rf(z, y)), fld((x) => x + 3.86, false));
    const bst = mono([[0, 0.936], [0.213, 0.937], [0.396, 0.93], [0.579, 0.913]]);
    reg('chrome', 5, [-4.0, -3.75, 0.86, 0.96, 0, 0.6], fld((x, y, z) => y - bst(z) + 0.004 - 0.0075), fld((x, y, z) => bst(z) - 0.004 - 0.0075 - y), fld((x, y, z) => z - 0.56), fld((x) => x + 3.76, false));
    const dtop = mono([[0, 0.425], [0.40, 0.418], [0.62, 0.395]]);
    reg('trim', 5, [-4.1, -3.85, 0.15, 0.44, 0, 0.66], fld((x, y, z) => y - dtop(z)), fld((x, y, z) => z - 0.635), fld((x) => x + 3.86, false));
    reg('chrome', 6, [-4.1, -3.85, 0.38, 0.46, 0, 0.66], fld((x, y, z) => y - dtop(z) - 0.021), fld((x, y, z) => dtop(z) + 0.003 - y), fld((x, y, z) => z - 0.62), fld((x) => x + 3.86, false));
    return R;
  }

  // ================================================================ skin ================================================================
  // split a convex polygon of vertices [x, y, z, nx, ny, nz, key] by the zero line of f: [f < 0 part, f >= 0 part]
  function split(pc, f) {
    const n = pc.length, fv = pc.map((v) => f(v[0], v[1], v[2])), A = [], Bo = [];
    for (let k = 0; k < n; k++) {
      const p = pc[k], q = pc[(k + 1) % n], fp = fv[k], fq = fv[(k + 1) % n];
      (fp < 0 ? A : Bo).push(p);
      if ((fp < 0) !== (fq < 0)) { const t = fp / (fp - fq), v = [0, 0, 0, 0, 0, 0, -1]; for (let i = 0; i < 6; i++) v[i] = p[i] + (q[i] - p[i]) * t; A.push(v); Bo.push(v); }
    }
    return [A, Bo];
  }
  const CABIN = [-3.45, -0.58], HB = [0.15, 0.155, 0.17], TR = [0.32, 0.012, 0.016], TD = [0.09, 0.006, 0.008];
  function buildSkin(bl, info) {
    const S = stations(), NS = S.length, P = new Float64Array(NS * NR * 3), sec = new Float64Array(NR * 2), nr = new Float64Array(NR * 6);
    // NB serves the cells below a row, NA the cells above it (they differ on creases and fillet ends)
    const NA = new Float32Array(NS * NR * 3), NB = new Float32Array(NS * NR * 3);
    for (let i = 0; i < NS; i++) {
      section(S[i], sec, nr);
      for (let j = 0; j < NR; j++) { const q = (i * NR + j) * 3; P[q] = S[i]; P[q + 1] = sec[j * 2 + 1]; P[q + 2] = sec[j * 2]; for (let k = 0; k < 3; k++) { NB[q + k] = nr[j * 6 + k]; NA[q + k] = nr[j * 6 + 3 + k]; } }
    }
    const R = B.e300NoCut ? [] : regions(), maps = {}, cab = (x, y) => x > CABIN[0] && x < CABIN[1] && y > 0.22;
    const vtx = (i, j, top) => { const q = (i * NR + j) * 3, N = top ? NB : NA; return [P[q], P[q + 1], P[q + 2], N[q], N[q + 1], N[q + 2], (i * NR + j) * 2 + top]; };
    // one vertex per (builder, side, grid point and normal); split points are new
    // off > 0: a copy pushed inwards along the normal and facing inwards (cabin liner); col: a lamp housing, same offset, facing out
    const vid = (key, b, v, sd, off, col) => {
      const k = v[6], mk = sd > 0 ? key : key + '-', mp = maps[mk] || (maps[mk] = new Int32Array(NS * NR * 2).fill(-1));
      if (k >= 0 && mp[k] >= 0) return mp[k];
      let nx = v[3], ny = v[4], nz = v[5]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (col) b.col = col; else if (b.c) { const ao = 0.5 + 0.5 * sstep(0.12, 0.55, v[1]); b.col[0] = b.col[1] = b.col[2] = ao; }
      const id = col ? b.v(v[0] - nx * off, v[1] - ny * off, sd * (v[2] - nz * off), nx, ny, sd * nz)
        : off ? b.v(v[0] - nx * off, v[1] - ny * off, sd * (v[2] - nz * off), -nx, -ny, -sd * nz) : b.v(v[0], v[1], sd * v[2], nx, ny, sd * nz);
      if (k >= 0) mp[k] = id; return id;
    };
    const emit = (key, b, pc, off, col) => {
      for (const sd of [1, -1]) {
        const ids = pc.map((v) => vid(key, b, v, sd, off, col)), p = b.p, n = b.n;
        for (let k = 1; k < ids.length - 1; k++) {
          const a = ids[0], c = ids[k], e = ids[k + 1], ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
          const ux = p[c * 3] - ax, uy = p[c * 3 + 1] - ay, uz = p[c * 3 + 2] - az, wx = p[e * 3] - ax, wy = p[e * 3 + 1] - ay, wz = p[e * 3 + 2] - az;
          const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx; if (fx * fx + fy * fy + fz * fz < 1e-16) continue;
          const s = fx * (n[a * 3] + n[c * 3] + n[e * 3]) + fy * (n[a * 3 + 1] + n[c * 3 + 1] + n[e * 3 + 1]) + fz * (n[a * 3 + 2] + n[c * 3 + 2] + n[e * 3 + 2]);
          s >= 0 ? b.tri(a, c, e) : b.tri(a, e, c);
        }
      }
    };
    let cuts = 0; const cand = [];
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NR - 1; j++) {
      const poly = [vtx(i, j, 0), vtx(i + 1, j, 0), vtx(i + 1, j + 1, 1), vtx(i, j + 1, 1)];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const v of poly) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); }
      if (x1 - x0 + y1 - y0 + z1 - z0 < 1e-9) continue;
      cand.length = 0; for (const r of R) if (r.box[0] <= x1 && r.box[1] >= x0 && r.box[2] <= y1 && r.box[3] >= y0 && r.box[4] <= z1 && r.box[5] >= z0) cand.push(r);
      let pieces = [poly];
      if (cand.length) {
        const fs = [];
        for (const r of cand) for (const cd of r.c) { const fl = cd[0]; if (!fl.cut || fs.includes(fl)) continue; let mn = 1e9, mx = -1e9; for (const v of poly) { const f = fl.f(v[0], v[1], v[2]); if (f < mn) mn = f; if (f > mx) mx = f; } if (mn < 0 && mx >= 0) fs.push(fl); }
        for (const fl of fs) { const nx = []; for (const pc of pieces) { const sp = split(pc, fl.f); if (sp[0].length > 2) nx.push(sp[0]); if (sp[1].length > 2) nx.push(sp[1]); } pieces = nx; cuts++; }
      }
      for (const pc of pieces) {
        let cx = 0, cy = 0, cz = 0; for (const v of pc) { cx += v[0]; cy += v[1]; cz += v[2]; } cx /= pc.length; cy /= pc.length; cz /= pc.length;
        let best = null, bp = -1;
        for (const r of cand) { if (r.p <= bp) continue; let ins = true; for (const cd of r.c) if (cd[1] * cd[0].f(cx, cy, cz) >= 0) { ins = false; break; } if (ins) { best = r; bp = r.p; } }
        const m = best ? best.m : j < RB[1] ? 'under' : 'paint'; if (!m) continue;
        emit(m, bl[m], pc, 0);
        if (cab(cx, cy) && m !== 'glass' && m !== 'roofglass') emit('liner', bl.liner, pc, 0.014);
        // lamp bodies: the lens skin again, pushed in, as the housing seen through it (gunmetal head lamps, deep red tail lamps)
        // ponytail: no side walls between lens and housing (a 2-3 cm slot shows at grazing angles); sweep the outline if that ever shows
        if (m === 'hlens') emit('hh', bl.house, pc, 0.034, HB);
        if (m === 'tlens') emit('th', bl.house, pc, 0.022, cy > 0.9 || cy < 0.765 ? TD : TR);
      }
    }
    info.stations = NS; info.cuts = cuts;
    return { S, NS, P, NA };
  }

  // ================================================================ parts ================================================================
  // surface queries on the field (right side, shape frame)
  const QC = new Map();
  function stn(x) { const k = Math.round(x * 4000); let v = QC.get(k); if (!v) { const c = ctl(x); v = { top: topCurve(c), side: sideCurve(c) }; QC.set(k, v); } return v; }
  const sideZ = (x, y) => stn(x).side(y), topY = (x, z) => stn(x).top(z);
  const faceX = (z, y) => { QF(y, q0); return xf(y) - Qv(z, q0); }, rearX = (z, y) => { QR(y, q0); return xr(y) + Qv(z, q0); };
  const nrm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  // sweep a profile [[u, v], ...] along a path of points; u runs along aOf(p) (made square to the path), v along tangent x a
  function sweep(b, path, prof, aOf, closed, col) {
    const n = path.length, m = prof.length, o = b.p.length / 3; if (col) b.col = col;
    for (let i = 0; i < n; i++) {
      const p = path[i], A = path[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], C = path[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
      const t = nrm3([C[0] - A[0], C[1] - A[1], C[2] - A[2]]); let a = aOf(p); const d = a[0] * t[0] + a[1] * t[1] + a[2] * t[2]; a = nrm3([a[0] - d * t[0], a[1] - d * t[1], a[2] - d * t[2]]);
      const bb = [t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]];
      for (const [u, v] of prof) { const l = Math.hypot(u, v) || 1; b.v(p[0] + a[0] * u + bb[0] * v, p[1] + a[1] * u + bb[1] * v, p[2] + a[2] * u + bb[2] * v, (a[0] * u + bb[0] * v) / l, (a[1] * u + bb[1] * v) / l, (a[2] * u + bb[2] * v) / l); }
    }
    for (let i = 0; i < (closed ? n : n - 1); i++) for (let k = 0; k < m; k++) { const i1 = (i + 1) % n, k1 = (k + 1) % m, A = o + i * m + k, Bq = o + i * m + k1, C = o + i1 * m + k1, D = o + i1 * m + k; b.tri(A, D, C); b.tri(A, C, Bq); }
  }
  // a patch over a front- or rear-view outline (z, y) at x = xOf(z, y), facing along nx (+1 forward, -1 rearward); uv = (z, y) * us
  function vPatch(b, poly, xOf, nx, st, pad, us, col) {
    const sd = sd2(poly); let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of poly) { z0 = Math.min(z0, q[0]); z1 = Math.max(z1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const nz = Math.ceil((z1 - z0 + 2 * pad) / st), ny = Math.ceil((y1 - y0 + 2 * pad) / st), idx = new Int32Array((nz + 1) * (ny + 1)).fill(-1); if (col) b.col = col;
    const at = (i, j) => { const q = j * (nz + 1) + i; if (idx[q] < 0) { const z = z0 - pad + i * st, y = y0 - pad + j * st; idx[q] = b.v(xOf(z, y), y, z, nx, 0, 0); if (b.uv) b.uv.push(z * us, y * us); } return idx[q]; };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nz; i++) { const zc = z0 - pad + (i + 0.5) * st, yc = y0 - pad + (j + 0.5) * st; if (sd(zc, yc) > pad) continue; const A = at(i, j), Bq = at(i + 1, j), C = at(i + 1, j + 1), D = at(i, j + 1); nx > 0 ? (b.tri(A, Bq, C), b.tri(A, C, D)) : (b.tri(A, C, Bq), b.tri(A, D, C)); }
  }
  // mirror everything added to b since vertex o and index io to the left side
  function mirror(b, o, io) {
    const n = b.p.length / 3, off = n - o;
    for (let i = o; i < n; i++) { b.p.push(b.p[i * 3], b.p[i * 3 + 1], -b.p[i * 3 + 2]); b.n.push(b.n[i * 3], b.n[i * 3 + 1], -b.n[i * 3 + 2]); if (b.c) b.c.push(b.c[i * 3], b.c[i * 3 + 1], b.c[i * 3 + 2]); if (b.uv) b.uv.push(-b.uv[i * 2], b.uv[i * 2 + 1]); }
    const ni = b.i.length; for (let k = io; k < ni; k += 3) b.i.push(b.i[k] + off, b.i[k + 2] + off, b.i[k + 1] + off);
  }
  const mark = (b) => [b.p.length / 3, b.i.length];
  // the arc of an arch outline (without the extension below the sill)
  const archArc = (poly) => poly.filter((q) => q[1] > 0.2);

  // ponytail: night-lit lamps share one MeshBasic material dimmed to 0.07 by day; the tail bars and the amber marker carry vertex colours
  // above 1 so they still read as red / amber lenses by day (0.07 x 5 = 0.35) and saturate at night; a separate material if that ever clips oddly
  const TB = [5, 0.16, 0.1];
  function parts(bl, info) {
    const { paint, trim, gloss, chrome, house, lamp, lampN, brake, under, inter, plate, screen, mesh } = bl;
    // ---- wheel wells: dark liner from just inside the arch lip to the inner wall, a painted return at the lip ----
    for (const poly of [OL.archF, OL.archR]) {
      const arc = archArc(poly), cx = (arc[0][0] + arc[arc.length - 1][0]) / 2, cy = 0.33, [o, io] = mark(under), [o2, io2] = mark(paint);
      const path = arc.map((q) => [q[0], q[1], sideZ(q[0], q[1])]);
      for (const [b, z0, z1, k] of [[paint, 0, 0.022, 0], [under, 0.02, 0.33, 1]]) {
        const s0 = b.p.length / 3;
        for (const q of path) { const nx = cx - q[0], ny = cy - q[1], l = Math.hypot(nx, ny); if (b.c) b.col = [0.7, 0.7, 0.7]; b.v(q[0], q[1], q[2] - z0, nx / l, ny / l, 0); if (b.c) b.col = [0.7, 0.7, 0.7]; b.v(q[0], q[1], Math.min(q[2] - z1, 0.6), nx / l, ny / l, 0); }
        for (let i = 0; i < path.length - 1; i++) { const A = s0 + i * 2; b.tri(A, A + 2, A + 3); b.tri(A, A + 3, A + 1); }
      }
      const s0 = under.p.length / 3; under.v(cx, 0.33, 0.6, 0, 0, 1); for (const q of arc) under.v(q[0], q[1], 0.6, 0, 0, 1); for (let i = 1; i < arc.length; i++) under.tri(s0, s0 + i, s0 + i + 1);
      mirror(under, o, io); mirror(paint, o2, io2);
    }
    // ---- Sport grille: chrome surround, black honeycomb, two chrome louvres a side, plain chrome disc (the real star is left out) ----
    {
      // the outline is the whole loop, both sides
      const loop = []; for (let k = 0; k < OL.grille.length; k++) { const A = OL.grille[k], C = OL.grille[(k + 1) % OL.grille.length]; for (let t = 0; t < 1; t += 0.25) { const z = lerp(A[0], C[0], t), y = lerp(A[1], C[1], t); loop.push([faceX(z, y) - 0.006, y, z]); } }
      sweep(chrome, loop, [[0.012, -0.012], [0.016, 0], [0.012, 0.012], [-0.012, 0.014], [-0.012, -0.014]], () => [1, 0, 0], true);
      vPatch(mesh, OL.grille, (z, y) => faceX(z, y) - 0.05, 1, 0.02, 0.02, 30);
      const [o1, io1] = mark(chrome);
      for (const [y, z1] of [[0.619, 0.434], [0.543, 0.41]]) { const path = []; for (let z = 0.1; z <= z1 + 1e-6; z += (z1 - 0.1) / 12) path.push([faceX(z, y) - 0.017, y, z]); sweep(chrome, path, [[0.016, 0.0115], [0.02, 0.004], [0.019, -0.008], [0.014, -0.0125], [-0.018, -0.0125], [-0.018, 0.0115]], () => [1, 0, 0], false); }
      mirror(chrome, o1, io1);
      const dx = faceX(0, 0.586) - 0.01; chrome.add(new T.CylinderGeometry(0.087, 0.091, 0.022, 40).rotateZ(PI / 2), M4(dx, 0.586, 0)); gloss.add(new T.CircleGeometry(0.072, 40).rotateY(PI / 2), M4(dx + 0.0115, 0.586, 0)); chrome.add(new T.CylinderGeometry(0.03, 0.034, 0.012, 30).rotateZ(PI / 2), M4(dx + 0.014, 0.586, 0));
    }
    // ---- AMG apron: side intakes with honeycomb and two gloss fins, wide lower intake with mesh ----
    { const [om, iom] = mark(mesh), [og, iog] = mark(gloss);
      vPatch(mesh, OL.apron, (z, y) => faceX(z, y) - 0.045, 1, 0.02, 0.02, 30);
      vPatch(mesh, OL.lower.filter((q) => q[0] >= -1e-6).concat([[0, 0.257]]), (z, y) => faceX(z, y) - 0.05, 1, 0.02, 0.02, 30);
      for (const f of [[[0.727, 0.368], [0.60, 0.372], [0.481, 0.357]], [[0.761, 0.292], [0.62, 0.30], [0.477, 0.304]]]) {
        const path = []; for (let k = 0; k <= 10; k++) { const t = k / 10, q = t < 0.5 ? [lerp(f[0][0], f[1][0], t * 2), lerp(f[0][1], f[1][1], t * 2)] : [lerp(f[1][0], f[2][0], t * 2 - 1), lerp(f[1][1], f[2][1], t * 2 - 1)]; path.push([faceX(q[0], q[1]) - 0.004, q[1], q[0]]); }
        sweep(gloss, path, [[0.006, 0.011], [0.006, -0.011], [-0.03, -0.011], [-0.03, 0.011]], () => [1, 0, 0], false);
      }
      mirror(mesh, om, iom); mirror(gloss, og, iog); }
    // ---- headlamps: dark chrome housing behind the clear lens, projector, two LED eyebrow light guides (DRL), amber side marker ----
    { const [oh, ih] = mark(house), [ol, il] = mark(lamp), [on, inn] = mark(lampN), [oc, ic] = mark(chrome);
      const px = faceX(0.705, 0.612) - 0.034; house.col = [0.03, 0.035, 0.05]; house.add(new T.SphereGeometry(0.026, 18, 10, 0, 2 * PI, 0, PI / 2).rotateZ(-PI / 2), M4(px, 0.612, 0.705));
      chrome.add(new T.TorusGeometry(0.04, 0.0045, 6, 28).rotateY(PI / 2), M4(px + 0.004, 0.612, 0.705)); house.col = [0.55, 0.56, 0.6]; house.add(new T.CylinderGeometry(0.046, 0.05, 0.03, 28, 1, true).rotateZ(PI / 2), M4(px - 0.012, 0.612, 0.705));
      lampN.col = [1, 0.97, 0.9]; lampN.add(new T.CircleGeometry(0.02, 20).rotateY(PI / 2), M4(px + 0.03, 0.612, 0.705));
      const eb = (pts, dz) => { const c = new T.CatmullRomCurve3(pts.map((q) => { const x = faceX(q[0], q[1]) - 0.012 - dz; return new T.Vector3(x, q[1], Math.min(q[0], sideZ(x, q[1]) - 0.012)); })); lamp.col = [0.92, 0.96, 1]; lamp.add(new T.TubeGeometry(c, 40, 0.0036, 6, false), new T.Matrix4()); };
      eb([[0.53, 0.668], [0.6, 0.692], [0.7, 0.707], [0.8, 0.712], [0.846, 0.70]], 0);
      eb([[0.52, 0.640], [0.6, 0.666], [0.7, 0.681], [0.79, 0.685], [0.83, 0.672], [0.848, 0.645]], 0.004);
      lampN.col = [4.5, 2.1, 0.25]; { const mx = 0.43, my = 0.722; lampN.add(new T.BoxGeometry(0.055, 0.013, 0.004), M4(mx, my, sideZ(mx, my) - 0.014, 0, 0, -0.35)); }
      mirror(house, oh, ih); mirror(lamp, ol, il); mirror(lampN, on, inn); mirror(chrome, oc, ic); }
    // ---- tail lamps: dark housing, five LED light bars (two of them the brake lamp), clear reverse band, red side marker ----
    { const [oh, ih] = mark(house), [on, inn] = mark(lampN), [ob, ib] = mark(brake);
      const sdT = sd2(OL.tailR);
      [0.772, 0.806, 0.84, 0.874, 0.906].forEach((y, k) => {
        let za = 1, zb2 = 0; for (let z = 0.45; z < 0.76; z += 0.002) if (sdT(z, y) < -0.012) { za = Math.min(za, z); zb2 = Math.max(zb2, z); }
        if (zb2 <= za) return; const path = []; for (let i = 0; i <= 12; i++) { const z = lerp(za, zb2, i / 12); path.push([rearX(z, y) + 0.01, y, z]); }
        const b = k === 1 || k === 2 ? brake : lampN; if (b !== brake) b.col = TB;
        sweep(b, path, [[0.002, 0.0045], [0.002, -0.0045], [-0.004, -0.0045], [-0.004, 0.0045]], () => [-1, 0, 0], false);
      });
      // the wing part wraps onto the side: two bars there and the US red side marker
      for (const [y, b] of [[0.82, lampN], [0.88, brake], [0.86, lampN]]) { const path = []; const xs = b === brake ? [-3.70, -3.76] : y === 0.86 ? [-3.60, -3.64] : [-3.68, -3.775]; for (let i = 0; i <= 6; i++) { const x = lerp(xs[0], xs[1], i / 6); path.push([x, y, sideZ(x, y) - 0.01]); } if (b !== brake) b.col = TB; sweep(b, path, [[0.002, 0.0045], [0.002, -0.0045], [-0.004, -0.0045], [-0.004, 0.0045]], () => [0, 0, 1], false); }
      house.col = [0.75, 0.75, 0.78]; { const path = []; for (let z = 0.53; z <= 0.70; z += 0.017) path.push([rearX(z, 0.752) + 0.008, 0.752, z]); sweep(house, path, [[0.001, 0.005], [0.001, -0.005], [-0.004, -0.005], [-0.004, 0.005]], () => [-1, 0, 0], false); }
      mirror(house, oh, ih); mirror(lampN, on, inn); mirror(brake, ob, ib); }
    // ---- door mirrors: body-colour cap over a black base, rear-facing glass, indicator strip along the lower outer edge ----
    { const [op, ip] = mark(paint), [ot, it] = mark(trim), [oc, ic] = mark(chrome), [oh, ih] = mark(house), cx = -1.0, cy = 1.042, cz = 0.948, m = M4(cx, cy, cz, 0, 0, 0.06, 0.088, 0.07, 0.085);
      paint.col = [1, 1, 1]; paint.add(new T.SphereGeometry(1, 28, 10, 0, 2 * PI, 0, 0.56 * PI), m); trim.add(new T.SphereGeometry(1, 28, 8, 0, 2 * PI, 0.56 * PI, 0.44 * PI), m);
      chrome.add(new T.CircleGeometry(1, 28).rotateY(-PI / 2), M4(cx - 0.064, cy + 0.003, cz + 0.004, 0, 0, 0.06, 1, 0.047, 0.056));
      trim.add(new T.CircleGeometry(1, 28).rotateY(-PI / 2), M4(cx - 0.062, cy + 0.003, cz + 0.004, 0, 0, 0.06, 1, 0.052, 0.062));
      const ip2 = []; for (let k = 0; k <= 14; k++) { const a = -0.15 + k / 14 * 1.75; ip2.push([cx + 0.088 * Math.cos(a) * 0.99, cy - 0.004 - 0.006 * Math.sin(a), cz + 0.085 * Math.sin(a) * 0.99]); }
      sweep(house, ip2, [[0.003, 0.003], [0.003, -0.003], [-0.003, -0.003], [-0.003, 0.003]], () => [0, 1, 0], false, [0.85, 0.62, 0.35]);
      trim.add(new T.BoxGeometry(0.1, 0.035, 0.07), M4(-0.965, 0.99, 0.875, 0, 0, 0.1));
      mirror(paint, op, ip); mirror(trim, ot, it); mirror(chrome, oc, ic); mirror(house, oh, ih); }
    // ---- door handles: body-colour grip with a chrome strip on top over a dark recess ----
    { const [op, ip] = mark(paint), [oc, ic] = mark(chrome), [ou, iu] = mark(under);
      for (const [x0, x1] of [[-1.708, -1.484], [-2.722, -2.498]]) {
        const g = [], c = [], rec = [];
        for (let k = 0; k <= 12; k++) { const x = lerp(x0, x1, k / 12), w = Math.sin(PI * (0.04 + 0.92 * k / 12)); g.push([x, 0.887, sideZ(x, 0.887) + 0.006 + 0.008 * w]); c.push([x, 0.9, sideZ(x, 0.9) + 0.006 + 0.0095 * w]); }
        sweep(paint, g, [[0.012, 0.004], [0.006, 0.011], [-0.004, 0.012], [-0.008, 0], [-0.004, -0.012], [0.006, -0.011]], (q) => [0, 0, 1], false);
        sweep(chrome, c.slice(1, -1), [[0.003, 0.0035], [0.003, -0.0035], [-0.002, -0.0035], [-0.002, 0.0035]], (q) => [0, 0, 1], false);
        const cx = (x0 + x1) / 2, s0 = under.p.length / 3; under.v(cx, 0.885, sideZ(cx, 0.885) + 0.0012, 0, 0, 1);
        for (let k = 0; k <= 24; k++) { const a = k / 24 * 2 * PI, x = cx + Math.cos(a) * 0.1, y = 0.885 + Math.sin(a) * 0.024; under.v(x, y, sideZ(x, y) + 0.0012, 0, 0, 1); if (k) under.tri(s0, s0 + k, s0 + k + 1); }
        void rec;
      }
      mirror(paint, op, ip); mirror(chrome, oc, ic); mirror(under, ou, iu); }
    // ---- shut lines: dark grooves riding just above the skin (doors, bonnet, boot lid, bumpers, fuel door) ----
    { const [ou, iu] = mark(under), W2 = 0.0024;
      const line = (pts, P, nrmOf) => { const path = pts.map(P), prof = [[0.0016, W2], [0.0016, -W2], [0, -W2], [0, W2]]; sweep(under, path, prof, nrmOf, false); };
      const sideP = (q) => [q[0], q[1], sideZ(q[0], q[1])], sideN = () => [0, 0, 1];
      const dens = (pts, n) => { const o = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) { const t = k / n; o.push([lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]); } o.push(pts[pts.length - 1]); return o; };
      line(dens([[-0.709, 0.93], [-0.679, 0.86], [-0.675, 0.763], [-0.674, 0.667], [-0.661, 0.576], [-0.664, 0.478], [-0.663, 0.379], [-0.656, 0.29]], 3), sideP, sideN);
      line(dens([[-1.828, 0.99], [-1.807, 0.894], [-1.815, 0.806], [-1.812, 0.706], [-1.802, 0.608], [-1.796, 0.509], [-1.793, 0.41], [-1.797, 0.29]], 3), sideP, sideN);
      line(dens([[-2.92, 1.012], [-2.877, 0.918], [-2.811, 0.847], [-2.745, 0.774], [-2.706, 0.689], [-2.663, 0.6], [-2.613, 0.515], [-2.573, 0.426], [-2.551, 0.33]], 3), sideP, sideN);
      line(dens([[-0.656, 0.292], [-1.2, 0.29], [-1.797, 0.288], [-2.3, 0.29], [-2.54, 0.31]], 6), sideP, sideN);
      line(dens([[-3.875, 0.63], [-3.6, 0.607], [-3.36, 0.575]], 6), sideP, sideN);
      line(dens([[0.37, 0.63], [0.40, 0.55], [0.39, 0.50]], 4), sideP, sideN);
      // bonnet side edges on top of the front wings, boot-lid edges on the deck
      const topP = (q) => [q[0], topY(q[0], q[1]), q[1]], upN = () => [0, 1, 0];
      line(dens([[-0.52, 0.792], [-0.3, 0.774], [0.0, 0.763], [0.25, 0.756], [0.42, 0.735], [0.52, 0.665]], 6).map((q) => [q[0], q[1]]), (q) => { const y = topY(q[0], q[1]); return [q[0], y, q[1]]; }, upN);
      line(dens([[-3.515, 0.545], [-3.65, 0.535], [-3.79, 0.528]], 6), topP, upN);
      // boot lid edge down the rear face (through the lamp split) and the bumper's top gap
      const rearP = (q) => [rearX(q[0], q[1]) - 0.0005, q[1], q[0]], backN = () => [-1, 0, 0];
      line(dens([[0.523, 1.005], [0.574, 0.909], [0.526, 0.798], [0.484, 0.736], [0.406, 0.69], [0.249, 0.683], [0, 0.686]], 4), rearP, backN);
      line(dens([[0.738, 0.622], [0.6, 0.637], [0.466, 0.651], [0.248, 0.677], [0, 0.688]], 4), rearP, backN);
      mirror(under, ou, iu);
      // fuel door, right rear wing only
      line(dens([[-3.293, 0.937], [-3.25, 1.0], [-3.151, 1.008], [-3.042, 1.0], [-3.017, 0.936], [-3.048, 0.87], [-3.159, 0.863], [-3.265, 0.871], [-3.293, 0.937]], 3), sideP, sideN);
    }
    // ---- rear: AMG exhaust trims (chrome rounded trapezoids, dark recess, round tailpipe), blank Indiana plate and its lamps ----
    { const [oc, ic] = mark(chrome), [ot, it] = mark(trim), [ou, iu] = mark(under), [on, inn] = mark(lampN);
      const zc = 0.51, yc = 0.385, hw = 0.122, hh = 0.04, rr = 0.03, loop = [];
      for (let k = 0; k < 48; k++) {
        const a = k / 48 * 2 * PI, ca = Math.cos(a), sa = Math.sin(a), sq = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.28);
        const z = zc + sq(ca) * (hw - (sa > 0 ? 0.012 * Math.abs(ca) : 0)), y = yc + sq(sa) * hh; loop.push([rearX(z, y) - 0.004, y, z]);
      }
      sweep(chrome, loop, [[0.012, 0.009], [0.016, 0], [0.012, -0.009], [-0.02, -0.009], [-0.02, 0.009]], () => [-1, 0, 0], true);
      const in2 = loop.map((q) => [q[0] + 0.02, yc + (q[1] - yc) * 0.82, zc + (q[2] - zc) * 0.9]); const s0 = trim.p.length / 3; trim.v(rearX(zc, yc) + 0.025, yc, zc, -1, 0, 0); for (const q of in2) trim.v(q[0], q[1], q[2], -1, 0, 0); for (let k = 1; k <= in2.length; k++) trim.tri(s0, s0 + (k % in2.length) + 1, s0 + k);
      chrome.add(new T.CylinderGeometry(0.033, 0.033, 0.03, 24, 1, true).rotateZ(PI / 2), M4(rearX(zc, yc) + 0.008, yc, zc)); under.add(new T.CircleGeometry(0.031, 20).rotateY(-PI / 2), M4(rearX(zc, yc) + 0.02, yc, zc));
      mirror(chrome, oc, ic); mirror(trim, ot, it); mirror(under, ou, iu);
      // US plate 12 x 6 in, blank (no lettering), following the boot lid's lean
      // a 6 x 4 grid riding 6 mm off the curved lid (a flat quad would cut into it at the centre)
      const P = (z, y) => [rearX(z, y) - 0.006, y, z], s1 = plate.p.length / 3;
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 6; i++) { const z = lerp(-0.1525, 0.1525, i / 6), y = lerp(0.764, 0.916, j / 4), q = P(z, y), n = nrm3(gradR(y, z, [0, 0, 0])); plate.v(q[0], q[1], q[2], n[0], n[1], n[2]); }
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { const a = s1 + j * 7 + i; plate.tri(a, a + 1, a + 8); plate.tri(a, a + 8, a + 7); }
      const fr = []; for (const [z, y] of [[-0.1525, 0.764], [0.1525, 0.764], [0.1525, 0.916], [-0.1525, 0.916], [-0.1525, 0.764]]) fr.push(P(z, y));
      const frd = []; for (let k = 0; k < 4; k++) for (let t = 0; t < 6; t++) frd.push(fr[k].map((v, i) => lerp(v, fr[k + 1][i], t / 6))); frd.push(fr[4]);
      sweep(under, frd.map((q) => [rearX(q[2], q[1]) - 0.0065, q[1], q[2]]), [[0.003, 0.004], [0.003, -0.004], [-0.002, -0.004], [-0.002, 0.004]], () => [-1, 0, 0], false);
      lampN.col = [1, 0.95, 0.85]; for (const z of [-0.09, 0.09]) lampN.add(new T.BoxGeometry(0.004, 0.006, 0.03), M4(rearX(z, 0.93) - 0.002, 0.93, z)); }
    // ---- parking sensors (body colour in a dark ring), third brake lamp, wipers, shark-fin antenna ----
    { const [op, ip] = mark(paint), [ou, iu] = mark(under);
      for (const [z, y] of [[0.27, 0.41], [0.66, 0.465]]) { const x = faceX(z, y), n = nrm3(gradF(y, z, [0, 0, 0])), ry = Math.atan2(-n[2], n[0]); under.add(new T.RingGeometry(0.0105, 0.0128, 16).rotateY(PI / 2), M4(x + 0.0012, y, z, 0, ry, 0)); paint.add(new T.CircleGeometry(0.0106, 16).rotateY(PI / 2), M4(x + 0.0016, y, z, 0, ry, 0)); }
      for (const [z, y] of [[0.22, 0.505], [0.5, 0.52]]) { const x = rearX(z, y), n = nrm3(gradR(y, z, [0, 0, 0])), ry = Math.atan2(-n[2], n[0]); under.add(new T.RingGeometry(0.0105, 0.0128, 16).rotateY(PI / 2), M4(x - 0.0012, y, z, 0, ry, 0)); paint.add(new T.CircleGeometry(0.0106, 16).rotateY(PI / 2), M4(x - 0.0016, y, z, 0, ry, 0)); }
      mirror(paint, op, ip); mirror(under, ou, iu);
      brake.add(new T.BoxGeometry(0.018, 0.011, 0.3), M4(-2.94, topY(-2.94, 0) - 0.022, 0, 0, 0, -0.33)); trim.add(new T.BoxGeometry(0.03, 0.02, 0.34), M4(-2.93, topY(-2.93, 0) - 0.03, 0, 0, 0, -0.33));
      for (const [z0, z1, dy] of [[-0.64, 0.04, 0.012], [-0.02, 0.56, 0.02]]) { const path = []; for (let k = 0; k <= 16; k++) { const z = lerp(z0, z1, k / 16), x = -0.625 + 0.11 * (z / 0.72) * (z / 0.72) - 0.035 - dy * 0.6; path.push([x, topY(x, Math.abs(z)) + 0.012 + dy * 0.3, z]); } sweep(trim, path, [[0.009, 0.004], [0.009, -0.004], [-0.004, -0.007], [-0.004, 0.007]], () => [0, 1, 0], false); }
      const fin = new T.Shape(); fin.moveTo(0, 0); fin.lineTo(0.16, 0); fin.bezierCurveTo(0.153, 0.026, 0.136, 0.05, 0.115, 0.053); fin.bezierCurveTo(0.07, 0.05, 0.03, 0.026, 0, 0);
      const fx = -2.62, fg = new T.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.008, bevelSegments: 3, curveSegments: 12 }); fg.translate(0, 0, -0.015);
      paint.col = [1, 1, 1]; paint.add(fg, M4(fx, topY(fx, 0) - 0.008, 0, 0, PI, Math.atan2(topY(fx - 0.165, 0) - topY(fx, 0), 0.165) * -1)); }
    // ---- cabin (seen through the glass): dash with the wide twin screen, round turbine vents, three-spoke wheel, black seats ----
    { const C = (k) => { inter.col = [k * 0.6, k * 0.6, k * 0.63]; }, box = (x, y, z, sx, sy, sz, rz) => inter.add(new T.BoxGeometry(sx, sy, sz), M4(x, y, z, 0, 0, rz || 0));
      C(0.032); box(-1.9, 0.29, 0, 2.3, 0.04, 1.5);                                         // floor
      C(0.04); box(-0.86, 0.83, 0, 0.42, 0.34, 1.52); C(0.05); box(-0.84, 1.0, 0, 0.36, 0.05, 1.5, -0.12);     // dash and its top pad
      C(0.045); box(-1.55, 0.52, 0, 0.92, 0.34, 0.2);                                       // centre console
      for (const z of [-0.37, 0.37]) {                                                       // front seats: cushion, backrest, headrest
        C(0.04); box(-1.78, 0.47, z, 0.52, 0.12, 0.5, 0.06); box(-2.1, 0.8, z, 0.12, 0.6, 0.5, 0.3); C(0.05); box(-2.22, 1.17, z, 0.09, 0.17, 0.27, 0.25);
      }
      C(0.04); box(-2.62, 0.5, 0, 0.5, 0.12, 1.3, 0.05); box(-2.9, 0.79, 0, 0.12, 0.56, 1.3, 0.38); C(0.05); for (const z of [-0.45, 0.45]) box(-3.03, 1.1, z, 0.08, 0.13, 0.25, 0.38);
      C(0.03); box(-3.24, 1.04, 0, 0.46, 0.03, 1.36, 0.1);                                  // parcel shelf
      C(0.035); box(-1.39, 1.3, 0, 0.02, 0.065, 0.26); box(-1.36, 1.34, 0, 0.02, 0.06, 0.02);  // rear-view mirror
      // steering wheel (left-hand drive): rim, three spokes, plain hub
      const wm = M4(-1.37, 0.93, -0.37, 0, 0, -1.12), wq = new T.Matrix4();
      C(0.03); inter.add(new T.TorusGeometry(0.183, 0.017, 8, 40).rotateY(PI / 2), wm);
      for (const a of [0, PI, -PI / 2]) { wq.copy(wm).multiply(M4(0, Math.sin(a) * 0.1, Math.cos(a) * 0.1, a, 0, 0)); C(0.22); inter.add(new T.BoxGeometry(0.016, 0.034, 0.15), wq); }
      wq.copy(wm); C(0.035); inter.add(new T.CylinderGeometry(0.065, 0.07, 0.04, 24).rotateZ(PI / 2), wq); box(-1.2, 0.86, -0.37, 0.3, 0.07, 0.08, -0.45);
      // twin 12.3-inch screens under one glass on the driver's side, faint display glow (no lettering)
      const sm = M4(-1.085, 0.985, -0.39, 0, 0, -0.26); screen.add(new T.BoxGeometry(0.012, 0.125, 0.66), sm);
      lamp.col = [0.03, 0.08, 0.17]; for (const z of [-0.6, -0.47]) lamp.add(new T.RingGeometry(0.036, 0.04, 28).rotateY(-PI / 2), new T.Matrix4().copy(sm).multiply(M4(-0.0065, 0, z + 0.39)));
      lamp.col = [0.025, 0.05, 0.09]; lamp.add(new T.PlaneGeometry(0.27, 0.095).rotateY(-PI / 2), new T.Matrix4().copy(sm).multiply(M4(-0.0065, 0, 0.18)));
      // four round turbine vents in the centre, one at each end of the dash
      for (const [z, y, r] of [[-0.165, 0.9, 0.034], [-0.055, 0.9, 0.034], [0.055, 0.9, 0.034], [0.165, 0.9, 0.034], [-0.66, 0.95, 0.04], [0.66, 0.95, 0.04]]) {
        const x = -1.075; chrome.add(new T.TorusGeometry(r, 0.0045, 6, 24).rotateY(PI / 2), M4(x, y, z)); C(0.015); inter.add(new T.CircleGeometry(r, 20).rotateY(-PI / 2), M4(x + 0.004, y, z));
        C(0.3); for (let k = 0; k < 6; k++) inter.add(new T.BoxGeometry(0.004, 0.004, r * 1.7), M4(x - 0.002, y, z, k * PI / 6, 0, 0));
      }
    }
  }

  // ================================================================ wheels ================================================================
  // axis +Z = outer face (right-hand wheel); the left wheels are turned round. R tyre radius, w tyre width, rw rim width
  const V2 = (a) => a.map((p) => new T.Vector2(p[0], p[1]));
  function lathe(b, prof, seg, col, a0, a1) { const g = new T.LatheGeometry(V2(prof), seg, a0 || 0, a1 || 2 * PI); g.rotateX(PI / 2); if (col) b.col = col; b.add(g, new T.Matrix4()); }
  function tyreGeo(R, w) {
    const b = new Bld(true), h = w / 2, rb = 0.247, wall = R - rb;
    // sidewall with rim protector, rounded shoulders, four circumferential grooves on the tread (lathe profile r, axial)
    const P = [[rb + 0.004, -h * 0.78], [rb + 0.013, -h * 0.92], [rb + 0.026, -h * 0.97], [rb + wall * 0.45, -h], [rb + wall * 0.8, -h * 0.97], [R - 0.010, -h * 0.9], [R - 0.0025, -h * 0.76], [R, -h * 0.62]];
    for (const g of [-0.42, -0.14, 0.14, 0.42]) P.push([R, (g - 0.07) * h], [R - 0.007, (g - 0.05) * h], [R - 0.007, (g + 0.05) * h], [R, (g + 0.07) * h]);
    P.push([R, h * 0.62], [R - 0.0025, h * 0.76], [R - 0.010, h * 0.9], [rb + wall * 0.8, h * 0.97], [rb + wall * 0.45, h], [rb + 0.026, h * 0.97], [rb + 0.013, h * 0.92], [rb + 0.004, h * 0.78]);
    const g = new T.LatheGeometry(V2(P.map((q) => [q[0], q[1]]).reverse().map((q) => [q[0], -q[1]])), 80); g.rotateX(PI / 2);
    // darker tread, slightly lifted sidewall (rubber is never pure black)
    const pa = g.attributes.position, c = []; for (let i = 0; i < pa.count; i++) { const r = Math.hypot(pa.getX(i), pa.getY(i)), k = r > R - 0.006 ? 0.028 : r > R - 0.012 ? 0.034 : 0.05; c.push(k, k, k * 1.04); }
    b.add(g, new T.Matrix4()); b.c = c; return b.geo();
  }
  function rimGeo(rw, front) {
    const b = new Bld(true), h = rw / 2, fo = h + 0.004, BR = [0.2, 0.205, 0.215], MC = [0.82, 0.83, 0.85], DK = [0.06, 0.06, 0.065];
    // barrel and lips (outer lip machined), dark well behind the spokes
    lathe(b, [[0.239, fo - 0.012], [0.251, fo - 0.004], [0.2565, fo], [0.2575, fo - 0.008], [0.2505, fo - 0.016]], 80, MC);
    lathe(b, [[0.2505, fo - 0.016], [0.236, fo - 0.03], [0.232, h * 0.4], [0.214, h * 0.1], [0.214, -h * 0.55], [0.236, -h * 0.8], [0.2525, -h * 0.98]], 64, BR);
    lathe(b, [[0.214, -h * 0.4], [0.06, -h * 0.4]], 32, DK);
    // twin five spokes: a pair per fifth, converging at the hub, slight concave dish, machined face, painted flanks
    const N = 7, dep = 0.034;
    for (let k = 0; k < 5; k++) for (const sd of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= N; i++) {
        // straight spokes: lateral offset from the pair's centre line grows linearly from the hub to the rim
        const t = i / N, r = lerp(0.07, 0.238, t), lat = sd * lerp(0.0105, 0.031, t), hw = lerp(0.0165, 0.0125, t), a0 = k * 2 * PI / 5 + PI / 2;
        const wf = fo - 0.006 - 0.012 * Math.sin(PI * Math.min(t * 1.1, 1)) - 0.004 * t;     // gently concave face
        pts.push([r, a0 + Math.atan2(lat - hw, r), a0 + Math.atan2(lat + hw, r), wf]);
      }
      const v = (r, a, w, c, nx, ny, nz) => { b.col = c; return b.v(Math.cos(a) * r, Math.sin(a) * r, w, nx, ny, nz); };
      for (let i = 0; i < N; i++) {
        const [r0, l0, h0, w0] = pts[i], [r1, l1, h1, w1] = pts[i + 1];
        // face (towards +z)
        let a = v(r0, l0, w0, MC, 0, 0, 1), c = v(r0, h0, w0, MC, 0, 0, 1), d = v(r1, h1, w1, MC, 0, 0, 1), e = v(r1, l1, w1, MC, 0, 0, 1); b.tri(a, d, c); b.tri(a, e, d);
        for (const [s0, s1] of [[l0, l1], [h0, h1]]) {      // flanks
          const am = (s0 + s1) / 2 + (s0 === l0 ? -PI / 2 : PI / 2), nx = Math.cos(am), ny = Math.sin(am);
          a = v(r0, s0, w0, BR, nx, ny, 0); c = v(r0, s0, w0 - dep, BR, nx, ny, 0); d = v(r1, s1, w1 - dep, BR, nx, ny, 0); e = v(r1, s1, w1, BR, nx, ny, 0);
          s0 === l0 ? (b.tri(a, c, d), b.tri(a, d, e)) : (b.tri(a, d, c), b.tri(a, e, d));
        }
      }
    }
    // hub: raised centre with five bolts and a plain centre disc (the real cap's emblem is left out)
    lathe(b, [[0.0, fo + 0.002], [0.03, fo + 0.002], [0.031, fo - 0.001], [0.04, fo - 0.004], [0.068, fo - 0.007], [0.085, fo - 0.02], [0.088, fo - 0.04]], 40, BR);
    lathe(b, [[0, fo + 0.0035], [0.026, fo + 0.0035], [0.0285, fo + 0.001]], 36, [0.55, 0.56, 0.58]);
    for (let k = 0; k < 5; k++) { const a = k * 2 * PI / 5 + PI / 5; b.col = [0.7, 0.71, 0.73]; b.add(new T.CylinderGeometry(0.0095, 0.0095, 0.01, 6).rotateX(PI / 2), M4(Math.cos(a) * 0.056, Math.sin(a) * 0.056, fo - 0.002)); b.col = DK; b.add(new T.CylinderGeometry(0.0105, 0.0105, 0.003, 12).rotateX(PI / 2), M4(Math.cos(a) * 0.056, Math.sin(a) * 0.056, fo - 0.0055)); }
    return b.geo();
  }
  // brake disc (vented ring, drilled at the front, dark hat) and caliper; they sit on the steering knuckle, so they turn but do not spin
  function brakeGeo(rd, w, front) {
    const b = new Bld(true), wc = w / 2 - 0.095, th = front ? 0.028 : 0.022, DI = [0.36, 0.36, 0.37], HT = [0.12, 0.12, 0.12], CA = [0.33, 0.34, 0.36];
    lathe(b, [[0.098, wc + th / 2], [rd, wc + th / 2], [rd, wc - th / 2], [0.098, wc - th / 2]], 64, DI);
    lathe(b, [[0, wc + th / 2 + 0.03], [0.07, wc + th / 2 + 0.03], [0.085, wc + th / 2 + 0.01], [0.098, wc + th / 2]], 32, HT);
    if (front) for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 18; k++) {        // cross-drilled holes in three staggered rings
      const a = (k + ring / 3) * 2 * PI / 18, r = 0.115 + ring * 0.018; b.col = [0.03, 0.03, 0.03]; b.add(new T.CircleGeometry(0.0042, 7), M4(Math.cos(a) * r, Math.sin(a) * r, wc + th / 2 + 0.0006));
    }
    // single-piston floating caliper, behind the axle and a little above it (no lettering)
    const ac = PI * 0.86, span = front ? 0.5 : 0.42, r0 = rd - (front ? 0.055 : 0.045), r1 = rd + 0.016, wz0 = wc - th / 2 - 0.026, wz1 = wc + th / 2 + 0.03;
    const sh = new T.Shape(); sh.absarc(0, 0, r1, ac - span / 2, ac + span / 2, false); sh.absarc(0, 0, r0, ac + span / 2, ac - span / 2, true);
    b.col = CA; b.add(new T.ExtrudeGeometry(sh, { depth: wz1 - wz0, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 }), M4(0, 0, wz0));
    return b.geo();
  }

  // ================================================================ geometry (built once) ================================================================
  const BODY_KEYS = ['paint', 'under', 'trim', 'gloss', 'chrome', 'glass', 'roofglass', 'hlens', 'tlens', 'refl', 'liner', 'inter', 'house', 'lamp', 'lampN', 'brake', 'plate', 'screen', 'mesh'];
  let CACHE = null;
  function geometry(s) {
    const key = [s.a, s.R, s.track].join();
    if (CACHE && CACHE.key === key) return CACHE;
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now(), info = {};
    const bl = {}; for (const k of BODY_KEYS) bl[k] = new Bld(k === 'paint' || k === 'inter' || k === 'lamp' || k === 'lampN' || k === 'house', k === 'mesh');
    buildSkin(bl, info); parts(bl, info);
    const body = {}; for (const k of BODY_KEYS) if (bl[k].i.length) body[k] = bl[k].geo();
    // 245/40 R19 front, 275/35 R19 rear on 8.5J / 9.5J rims (visual widths kept a touch inside the body side)
    const wheel = [{ tyre: tyreGeo(s.R, 0.236), rim: rimGeo(0.214, true), brake: brakeGeo(0.171, 0.236, true), w: 0.236 }, { tyre: tyreGeo(s.R - 0.001, 0.258), rim: rimGeo(0.236, false), brake: brakeGeo(0.15, 0.258, false), w: 0.258 }];
    info.ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
    CACHE = { key, body, wheel, info };
    return CACHE;
  }

  // ================================================================ materials (fresh per build) ================================================================
  // environment light: keep its reflections, cut its diffuse part (as cars.js does); bright repaints get cars.js's albedo compression
  function iblFix(sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', T.ShaderChunk.lights_fragment_maps.replace('iblIrradiance +=', 'iblIrradiance += 0.2 *')); }
  function paintFix(sh) {
    iblFix(sh); sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float pw = smoothstep( 0.55, 0.8, min( diffuse.r, min( diffuse.g, diffuse.b ) ) );\n\tvec4 diffuseColor = vec4( diffuse * ( 1.0 - ( 0.4 - 0.2 * pw ) * smoothstep( 0.15, 0.6, max( diffuse.r, max( diffuse.g, diffuse.b ) ) ) ), opacity );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor *= 1.0 - pw;')
      .replace('#include <lights_fragment_end>', 'irradiance *= 1.0 - 0.3 * pw; radiance *= 1.0 - 0.45 * pw;\n\t#ifdef CLEARCOAT\n\tclearcoatRadiance *= 1.0 - 0.45 * pw;\n\t#endif\n#include <lights_fragment_end>');
  }
  const PO = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  // honeycomb for the grille and intakes: dark hexagon cells with glossy rims, tiled (canvas; none outside a browser)
  let HC = null;
  function honeycomb() {
    if (HC || typeof document === 'undefined') return HC;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 56; const g = cv.getContext('2d'); g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, 64, 56); g.fillStyle = '#030304';
    const hex = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * PI / 3; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.fill(); };
    for (const [cx, cy] of [[0, 0], [32, 0], [64, 0], [16, 28], [48, 28], [0, 56], [32, 56], [64, 56]]) hex(cx, cy, 13.5);
    HC = new T.CanvasTexture(cv); HC.encoding = T.sRGBEncoding; HC.wrapS = HC.wrapT = T.RepeatWrapping; HC.anisotropy = 4; return HC;
  }
  function pbr(o, e, fix) { const m = new (o.clearcoat || o.transmission ? T.MeshPhysicalMaterial : T.MeshStandardMaterial)(o); m.envMapIntensity = m.userData.e = e; m.onBeforeCompile = fix || iblFix; return m; }
  function materials(s) {
    const D = T.DoubleSide, M = {
      // Obsidian Black: dark metallic base under a glossy clearcoat, so the shape reads in the reflections
      paint: pbr({ color: lin(s.color), metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, side: D, vertexColors: true }, 1.1, paintFix),
      under: new T.MeshLambertMaterial({ color: lin(0x0b0b0c), side: D }),
      trim: pbr({ color: lin(0x0c0c0d), roughness: 0.5, metalness: 0.1, side: D }, 0.6),
      gloss: pbr({ color: lin(0x050506), roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, side: D }, 1.3),
      chrome: pbr({ color: lin(0xe9ebee), roughness: 0.07, metalness: 1, side: D }, 1.25),
      glass: pbr({ color: lin(0x0c1116), roughness: 0.02, metalness: 0, transmission: 0.45, transparent: true }, 1.05),
      roofglass: pbr({ color: lin(0x07090b), roughness: 0.02, metalness: 0, transmission: 0.25, transparent: true }, 0.9),
      hlens: pbr({ color: lin(0xffffff), roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }, 1.4),
      tlens: pbr({ color: lin(0x5a0306), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.03 }, 1.2),
      refl: pbr({ color: lin(0x8a0a0c), roughness: 0.25, metalness: 0.3 }, 0.8),
      liner: new T.MeshLambertMaterial({ color: lin(0x161617) }),
      inter: new T.MeshLambertMaterial({ vertexColors: true, side: D }),
      house: pbr({ vertexColors: true, roughness: 0.18, metalness: 0.9, side: D }, 1.1),
      lamp: new T.MeshBasicMaterial({ vertexColors: true }),
      lampN: new T.MeshBasicMaterial({ vertexColors: true }),
      brake: new T.MeshBasicMaterial({ color: 0x6a0a0a }),
      plate: pbr({ color: lin(0xd9dde2), roughness: 0.55, metalness: 0.05 }, 0.6),
      screen: pbr({ color: lin(0x020306), roughness: 0.05, metalness: 0, emissive: lin(0x0b1424), emissiveMap: null }, 1.0),
      tyre: pbr({ vertexColors: true, roughness: 0.88, metalness: 0 }, 0.5),
      rim: pbr({ vertexColors: true, roughness: 0.3, metalness: 0.85, side: D }, 1.15),
      disc: pbr({ vertexColors: true, roughness: 0.45, metalness: 0.75 }, 0.8),
      mesh: pbr({ color: lin(0xffffff), map: honeycomb(), roughness: 0.4, metalness: 0.2, side: D }, 0.4),
    };
    // only body paint may carry the paint colour exactly (the garage recolours by it)
    const fac = lin(s.color).getHex();
    for (const k in M) if (k !== 'paint' && M[k].color && M[k].color.getHex() === fac) M[k].color.r += 2 / 255;
    for (const k in M) M[k].name = 'e300.' + k;
    return M;
  }

  // ================================================================ build ================================================================
  function build(s) {
    const G = geometry(s), M = materials(s), g = new T.Group(), body = new T.Group();
    body.position.set(s.a, s.R - 0.33, 0); g.add(body);
    for (const k in G.body) { const m = new T.Mesh(G.body[k], B.e300Normals ? new T.MeshNormalMaterial({ side: T.DoubleSide }) : M[k]); m.castShadow = k === 'paint' || k === 'trim' || k === 'gloss'; body.add(m); }
    const wheels = [], steer = [];
    // FL, FR, RL, RR (left is -Z); the tyre's outer face stays just inside the arch lip
    for (let r = 0; r < 2; r++) for (const sd of [-1, 1]) {
      const W = G.wheel[r], piv = new T.Group(), spin = new T.Group(), zo = 0.915 - W.w / 2 - s.track / 2;
      piv.position.set(r ? -s.b : s.a, s.R, sd * s.track / 2); piv.add(spin); g.add(piv); wheels.push(spin); if (!r) steer.push(piv);
      const ty = new T.Mesh(W.tyre, M.tyre), rm = new T.Mesh(W.rim, M.rim), br = new T.Mesh(W.brake, M.disc); ty.castShadow = true;
      for (const m of [ty, rm]) { m.position.z = sd * zo; if (sd < 0) m.rotation.y = PI; spin.add(m); }
      br.position.z = sd * zo; br.scale.z = sd; piv.add(br);
    }
    let beam = null; const setLights = (on, beams) => { if (beams && !beam && B.headBeam) beam = B.headBeam(g, s.a + XN); if (beam) beam.visible = !!beams; M.lampN.color.setScalar(on ? 1 : 0.07); for (const k of ['paint', 'glass', 'roofglass', 'chrome', 'gloss', 'trim', 'rim', 'hlens', 'tlens', 'house']) M[k].envMapIntensity = M[k].userData.e * (on ? 0.35 : 1); };
    setLights(false);
    return { group: g, wheels, steer, brake: M.brake, setLights, noseX: s.a + XN, tailX: s.a + XT };
  }
  B.buildCar = function (s) { return s && s.id === 'e300' ? build(s) : prevBuild(s); };
  B.e300Info = () => CACHE && CACHE.info;      // build statistics for the tools
  // warm the geometry cache while the page is idle (about 0.3 s of work), so picking the car in the garage does not hitch
  if (typeof requestIdleCallback === 'function' && window.DriftPhysics) requestIdleCallback(() => {
    const e = DriftPhysics.CARS.find((c) => c.id === 'e300'); if (e && !CACHE) geometry(DriftPhysics.makeCar(e, false).spec);
  }, { timeout: 8000 });
})();
