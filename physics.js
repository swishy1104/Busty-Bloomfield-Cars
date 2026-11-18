/* Bloomfield Drift — vehicle dynamics.
   Every car has two setups. RACE (makeCar(spec, false)): the real car, judged like a sim (sourced steering ratio, lock and turning
   circle, a lagged rack, per-car tyres with load-sensitive cornering stiffness and relaxation length whose force turns toward the
   sliding velocity past the peak, compliance steer, a sprung body on four springs and two-slope dampers with anti-roll bars,
   torque-limited differentials, a clutch with a free-running engine, brake bias, switchable assists: TC, ABS, ESC on yaw-rate error
   and body slip, countersteer help). Pad and keyboard steer up to the car's steady-state grip limit. DRIFT (makeCar(spec, true)): an
   arcade build tuned for control (rear-drive swap, welded diff, 54 deg lock, forgiving rear tyres, angle-holding steering and a yaw
   helper that starts slides and stops spins).
   step() order: pedals -> input layer (device shaping, countersteer help; the chassis below it is a pure rack) -> terrain -> suspension
   loads -> driveline and assists -> brakes and ABS -> tyres (combined-slip curve, one evaluation per wheel, implicit wheel spin) ->
   diff, engine and clutch -> planar body -> sprung body (heave, pitch, roll). A dt over 1/120 s runs as 1/240 s sub-steps.
   Map frame: x east, y north, psi counter-clockwise from east. Body frame: u forward, v left.
   inp: { steer -1..1 (left +), gas, brake, handbrake 0..1, assist bool, and optional device 'wheel' | 'pad' | 'kb' | 'touch' (default kb),
          tc 0 off / 1 low / 2 high, abs, esc, cs (countersteer help) bools; each missing assist follows inp.assist (ABS stays on) }.
   Car state (read by game.js, audio.js, fx.js, player.js, tools): x y psi vx vy r w[4] steer (road-wheel angle at the axle middle, rad,
   left +) gear rpm thr brk axf ayf (90 ms filtered tyre-force accelerations, for the camera) anf h (body reference height, world: the
   ground under the CG at static ride) vh vgPrev fresh air gap fall land (closing speed at touchdown) pitch (nose up +) roll (left side up +) cut shiftT shiftCd
   manual u v speed beta slip[4] (slip speed, m/s) Fz[4] surf[4] hh[4]. Set c.fresh after moving the car: step() re-seats everything.
   Public surface: window.DriftPhysics = { CARS, SURF, makeCar, step, shift, torqueAt, G }.
   Pure (no DOM / three.js) so the tools and the bench run it under node. */
(function (root) {
  'use strict';
  const G = 9.81, RHO = 1.2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // input layer (race setup; the drift build keeps its own angle-holding steering)
  const PAD_RATE = 6;                  // /s: virtual steering wheel follows the stick (full travel 0.17 s)
  const KB_RATE0 = 1, KB_RATE1 = 8;    // /s, /s^2: a held key turns the wheel faster the longer it is held (100 ms tap ~ 14 %, full ~ 0.39 s)
  const KB_RET = 5;                    // /s: key release and reversal
  const RW_T = 0.3;                    // s: shortest pad / keyboard sweep of the road wheels across the speed's range (+0.4 s from 60 to 100 km/h)
  const RW_RATE = 1.6;                 // rad/s: road-wheel rate cap on pad, keyboard and touch
  const CS_MAXANG = 0.5, CS_DAMP = 0.06;   // countersteer help: largest self-steer angle (rad), yaw damping (s)
  const ESC_TAU = 0.12, ESC_MAX = 0.3;     // stability control: s to cancel a yaw-rate error, largest single-wheel brake (x m g R)

  // tyre sets: apk peak slip angle (deg, at nominal load), kpk peak slip ratio, C curve shape (grip far past the peak = sin(C pi/2)),
  // cx longitudinal / lateral peak, sig relaxation length (m), ls mu load sensitivity, ea peak-slip growth with load
  const TYRES = {
    touring: { apk: 8.5, kpk: 0.11, C: 1.38, cx: 1.10, sig: 0.45, ls: 0.13, ea: 0.3 },    // performance all-season
    summer: { apk: 7.0, kpk: 0.10, C: 1.30, cx: 1.08, sig: 0.35, ls: 0.15, ea: 0.3 },     // performance summer
    truck: { apk: 10.5, kpk: 0.12, C: 1.45, cx: 1.10, sig: 0.45, ls: 0.10, ea: 0.3 },     // tall-sidewall all-season
    drift: { apk: 11.0, kpk: 0.13, C: 1.12, cx: 1.07, sig: 0.25, ls: 0.10, ea: 0.2 },     // rear of every drift build: a wide, flat top
    cart: { apk: 10.0, kpk: 0.12, C: 1.40, cx: 1.00, sig: 0.20, ls: 0.10, ea: 0.3 },
  };

  // Real-world-ish specs. tq = [rpm, Nm] points; fw = front weight fraction.
  // Race setup: ratio = on-centre steering ratio, ltl = lock-to-lock turns, steer = road-wheel lock (deg, mid-axle) that gives the
  // sourced curb-to-curb circle; tyre set; cs = compliance steer (deg/g, sets the understeer gradient); mu = grip (skidpad);
  // cx = longitudinal grip (60-0); bias = front brake share; diff = [preload Nm, power lock, coast lock] of the driven axle
  // (cdiff: AWD centre coupling); coast = engine braking at the redline (Nm); rideF/rideR ride frequencies (Hz); rollG roll gradient
  // (deg/g); rollF front share of roll stiffness; hra roll-axis height (m); muD: the drift build's grip when it differs from mu.
  // Optional: csr rear share of compliance steer (same phase, default 0.1); tr rack and column lag (s, default 0.05); K understeer
  // gradient (deg/g) where cs + 0.4 misses it; zF / zR damper ratios (default 0.3); izz dynamic yaw index (default 1.1).
  // The 1993-97 Ranger: recirculating-ball box (tr 0.09) and leaf-spring roll understeer at the rear axle (csr 0.45).
  const CARS = [
    { id: 'mazda3', name: '2021 Mazda3 2.5 Turbo', sub: 'Hatchback', color: 0xf3f3ee, style: 'hatch',
      m: 1540, wb: 2.725, fw: 0.60, track: 1.57, hcg: 0.55, R: 0.325, L: 4.46, W: 1.80, H: 1.44,
      tq: [[1000, 220], [2000, 434], [3500, 434], [5000, 355], [6300, 270]], redline: 6300, idle: 800,
      gears: [3.552, 2.022, 1.452, 1.0, 0.708, 0.599], final: 4.33, drive: 'AWD', rearShare: 0.4, mu: 1.0, cda: 0.66, vgov: 134,
      ratio: 15, ltl: 2.7, steer: 36.8, tyre: 'touring', cs: 2.8, cx: 1.09, bias: 0.70, diff: [0, 0, 0], cdiff: [50, 0.3, 0.1], coast: 80,
      rideF: 1.35, rideR: 1.50, rollG: 4.5, rollF: 0.58, hra: 0.10 },
    { id: 'ranger', name: 'Ford Ranger Splash', sub: 'Flareside pickup', color: 0xc8161d, style: 'pickup',
      m: 1430, wb: 2.74, fw: 0.57, track: 1.45, hcg: 0.62, R: 0.33, L: 4.69, W: 1.76, H: 1.62,
      tq: [[800, 240], [2400, 305], [3200, 300], [4200, 271], [5200, 200]], redline: 5200, idle: 750,
      gears: [3.40, 2.05, 1.31, 1.0, 0.79], final: 3.73, drive: 'RWD', mu: 0.87, cda: 0.95, vgov: 98,
      ratio: 18, ltl: 3.0, steer: 33.9, tyre: 'truck', cs: 4.3, csr: 0.45, K: 5.3, tr: 0.09, cx: 1.015, bias: 0.68, diff: [0, 0, 0], coast: 65,
      rideF: 1.30, rideR: 1.70, rollG: 7.0, rollF: 0.56, hra: 0.15 },
    { id: 'passat', name: 'Volkswagen Passat', sub: 'Sedan', color: 0x7d8288, style: 'sedan',
      m: 1470, wb: 2.80, fw: 0.60, track: 1.57, hcg: 0.55, R: 0.334, L: 4.87, W: 1.83, H: 1.49,
      tq: [[1000, 160], [1500, 250], [4750, 250], [6200, 195], [6500, 180]], redline: 6500, idle: 800,
      gears: [4.148, 2.37, 1.556, 1.155, 0.859, 0.686], final: 3.5, drive: 'FWD', mu: 0.95, cda: 0.64, vgov: 126,
      ratio: 16, ltl: 2.7, steer: 34.6, tyre: 'touring', cs: 3.6, cx: 1.10, bias: 0.72, diff: [0, 0.15, 0], coast: 65,
      rideF: 1.25, rideR: 1.40, rollG: 5.5, rollF: 0.54, hra: 0.10 },
    { id: 'dart', name: 'Dodge Dart', sub: 'Sedan', color: 0xf1f1f1, style: 'sedan2',
      m: 1445, wb: 2.70, fw: 0.61, track: 1.57, hcg: 0.55, R: 0.317, L: 4.67, W: 1.83, H: 1.47,
      tq: [[1000, 150], [2500, 200], [4800, 232], [6250, 209], [6500, 195]], redline: 6500, idle: 800,
      gears: [4.212, 2.637, 1.8, 1.386, 1.0, 0.772], final: 3.4, drive: 'FWD', mu: 0.95, cda: 0.62, vgov: 127,
      ratio: 15, ltl: 3.0, steer: 33.8, tyre: 'touring', cs: 3.6, cx: 1.21, bias: 0.72, diff: [0, 0, 0], coast: 70,
      rideF: 1.30, rideR: 1.45, rollG: 5.5, rollF: 0.52, hra: 0.10 },
    { id: 'mustang', name: 'Ford Mustang GT', sub: 'Coupe', color: 0xe2581c, style: 'coupe',
      m: 1720, wb: 2.72, fw: 0.54, track: 1.62, hcg: 0.50, R: 0.343, L: 4.78, W: 1.92, H: 1.38,
      tq: [[1000, 380], [3000, 520], [4600, 570], [7000, 468], [7500, 420]], redline: 7500, idle: 850,
      gears: [3.66, 2.43, 1.69, 1.32, 1.0, 0.65], final: 3.55, drive: 'RWD', mu: 1.08, muD: 1.05, cda: 0.75, vgov: 155,
      ratio: 16, ltl: 2.6, steer: 33.3, tyre: 'summer', cs: 1.9, cx: 1.03, bias: 0.64, diff: [100, 0.35, 0.35], coast: 95,
      rideF: 1.32, rideR: 1.40, rollG: 3.8, rollF: 0.56, hra: 0.10 },
    { id: 'miata', name: 'Mazda MX-5 Miata', sub: 'Roadster', color: 0x1f4fa8, style: 'roadster',
      m: 1070, wb: 2.31, fw: 0.51, track: 1.50, hcg: 0.45, R: 0.308, L: 3.92, W: 1.74, H: 1.24,
      tq: [[1000, 130], [2500, 180], [4000, 205], [7000, 184], [7500, 170]], redline: 7500, idle: 850,
      gears: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0], final: 2.866, drive: 'RWD', mu: 1.03, muD: 1.0, cda: 0.6, vgov: 135,
      ratio: 15.5, ltl: 2.7, steer: 35.7, tyre: 'summer', cs: 2.1, cx: 1.12, bias: 0.62, diff: [30, 0.25, 0.12], coast: 55,
      rideF: 1.25, rideR: 1.35, rollG: 5.5, rollF: 0.53, hra: 0.08 },
    { id: 'crownvic', name: 'Ford Crown Victoria', sub: 'Police Interceptor', color: 0x16181d, style: 'sedan3',
      m: 1870, wb: 2.91, fw: 0.56, track: 1.63, hcg: 0.56, R: 0.345, L: 5.39, W: 1.99, H: 1.48,
      tq: [[800, 300], [3000, 390], [4000, 403], [5000, 355], [5800, 290]], redline: 5800, idle: 700,
      gears: [2.84, 1.55, 1.0, 0.70], final: 3.55, drive: 'RWD', mu: 0.9, cda: 0.8, vgov: 129,
      ratio: 18.5, ltl: 2.9, steer: 33.1, tyre: 'touring', cs: 4.4, cx: 1.02, bias: 0.66, diff: [0, 0, 0], coast: 85,
      rideF: 1.20, rideR: 1.35, rollG: 6.0, rollF: 0.58, hra: 0.12 },
    // W213 E300, US MY2017-20 RWD: M274 2.0 I4 with ONE turbo (not a twin-turbo), 241 hp @ 5500, 370 Nm @ 1300-4000; 9G-TRONIC; 130 mph governed
    { id: 'e300', name: 'Mercedes-Benz E300', sub: 'Sport sedan', color: 0x16181d, style: 'sedan',
      m: 1720, wb: 2.939, fw: 0.52, track: 1.61, hcg: 0.54, R: 0.338, L: 4.923, W: 1.852, H: 1.468,
      tq: [[1000, 270], [1300, 370], [4000, 370], [5000, 333], [5500, 312.5], [6300, 262]], redline: 6300, idle: 650,
      gears: [5.354, 3.243, 2.252, 1.636, 1.211, 1.0, 0.865, 0.717, 0.601], final: 2.82, drive: 'RWD', mu: 1.0, cda: 0.6, vgov: 130,
      ratio: 15.5, ltl: 2.7, steer: 35.8, tyre: 'touring', cs: 3.0, cx: 1.14, bias: 0.65, diff: [0, 0, 0], coast: 50,
      rideF: 1.15, rideR: 1.30, rollG: 5.0, rollF: 0.57, hra: 0.10 },
    // golf cart (player.js / car_cart.js): a 48 V electric fleet cart, 24 km/h governed, one speed, rear drive. hidden: the garage does not list it.
    { id: 'cart', name: 'Golf cart', sub: 'Electric fleet cart', color: 0xf3f3ee, style: 'cart', hidden: true,
      m: 450, wb: 1.65, fw: 0.42, track: 1.0, hcg: 0.45, R: 0.23, L: 2.4, W: 1.2, H: 1.8,
      tq: [[0, 60], [2400, 60], [3000, 30]], redline: 3000, idle: 200,
      gears: [1.0], final: 10, drive: 'RWD', mu: 0.85, cda: 1.1, vgov: 15.6,
      ratio: 12, ltl: 1.2, steer: 35, tyre: 'cart', cs: 0, cx: 1.0, bias: 0.5, diff: [0, 0, 0], coast: 20,
      rideF: 2.0, rideR: 2.0, rollG: 4, rollF: 0.5, hra: 0.20 },
  ];

  // surface index: 0 grass, 1 asphalt, 2 gravel, 3 water. mu = grip, rr = rolling drag (in g) + rrv per m/s (soft ground and bumps
  // drag harder the faster the car goes), soft = how much later the tyre peaks (traction control in step() aims at that later peak).
  // Loose ground is tuned to be forgiving rather than real: grass keeps about 2/3 and gravel 4/5 of asphalt grip, every car pulls
  // away from a standstill up a 22 % grass slope, and grass still costs pace (tools/offroad_check.js holds the numbers).
  const SURF = [
    { mu: 0.68, rr: 0.055, rrv: 0.0025, soft: 1.8 },
    { mu: 1.0, rr: 0.013, rrv: 0, soft: 1.0 },
    { mu: 0.80, rr: 0.025, rrv: 0.001, soft: 1.5 },
    { mu: 0.4, rr: 0.3, rrv: 0, soft: 2.0 },
  ];

  function torqueAt(s, rpm) {
    const t = s.tq;
    if (rpm <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) {
      if (rpm <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (rpm - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    }
    return t[t.length - 1][1];
  }
  const stockHp = (s) => Math.max(...s.tq.map(([r, n]) => n * r / 7127));
  const coastT = (s, rpm) => s.coast * (0.3 + 0.7 * clamp(rpm / s.redline, 0, 1.1));      // engine braking, Nm at the crank (closed throttle)
  const coastK = (thr) => 1 - thr;      // full on a closed throttle, none at full pedal

  function tyreAxle(t, mu, cx) {      // a tyre set resolved for one axle: B puts the force peak at normalised slip 1
    return { mu, C: t.C, B: Math.tan(Math.PI / (2 * t.C)), kpk: t.kpk, tap0: Math.tan(t.apk * DEG), apk: t.apk * DEG, cx, sig: t.sig, ls: t.ls, ea: t.ea };
  }

  /** Build a car state. drift=true applies the drift build: RWD swap, welded diff, angle kit, more power, forgiving rear tyres. */
  function makeCar(spec, drift) {
    const s = Object.assign({}, spec);
    const hp = stockHp(s), ty = TYRES[s.tyre] || TYRES.touring, cx = s.cx || ty.cx;
    s.pwr = 1; s.ack = !drift; s.drift = !!drift;
    // an 'open' diff keeps a little gear friction (torque bias ~1.05): it does not lock, but one wheel cannot run away from the other on a
    // straight launch
    if (s.diff && s.diff[0] === 0 && s.diff[1] === 0 && s.diff[2] === 0) s.diff = [10, 0.02, 0.02];
    s.diff = s.diff || (s.lock >= 1 ? [Infinity, 0, 0] : s.lock >= 0.3 ? [60, 0.3, 0.3] : [0, 0, 0]);
    s.cs = s.cs || 0; s.csr = s.csr === undefined ? 0.1 : s.csr; s.bias = s.bias || 0.66; s.coast = s.coast || 0.14 * Math.max(...s.tq.map((p) => p[1]));
    s.ratio = s.ratio || 15; s.ltl = s.ltl || 2.7; s.tr = drift ? 0 : s.tr || 0.05;
    let kSus = 1;
    s.tyF = tyreAxle(ty, 1, cx); s.tyR = tyreAxle(ty, 1, cx);
    if (drift) {
      s.drive = 'RWD'; s.diff = [Infinity, 0, 0]; s.steer = 54; s.mu = s.muD || s.mu; s.cs = 0; s.bias = 0.60; kSus = 1.2;
      s.tyF = tyreAxle(ty, 1.06, cx); s.tyR = tyreAxle(TYRES.drift, 0.95, TYRES.drift.cx);
      s.pwr = Math.max(1.25, 0.24 * s.m / hp);
    }
    s.hp = Math.round(hp * s.pwr);
    s.a = s.wb * (1 - s.fw); s.b = s.wb * s.fw; s.Izz = (drift ? 1.2 : s.izz || 1.1) * s.m * s.a * s.b;      // ponytail: one dynamic index (top of the real 0.9-1.1 spread) for every race car, the drift build keeps the 1.2 its helper is tuned on; per-car Izz from measured data if it turns up
    s.steerRad = s.steer * DEG; s.Kus = (s.K || s.cs + 0.4) * DEG;      // understeer gradient (rad/g) for the pad / keyboard range and ESC
    // rack: on-centre ratio from the steering wheel, mildly progressive to the lock that gives the real turning circle
    s.SWmax = s.ltl * Math.PI; s.d0 = s.SWmax / s.ratio; s.pk = s.steerRad / s.d0 - 1;
    s.fShare = s.drive === 'FWD' ? 1 : s.drive === 'RWD' ? 0 : 1 - (s.rearShare || 0.5);
    s.tqMax = Math.max(...s.tq.map((p) => p[1]));
    s.launch = clamp(0.5 * s.redline, 2500, 4000);
    s.brakeT = s.m * G * 1.3 * s.R; s.hbT = s.m * G * (drift ? 1.0 : 0.6) * s.R;
    s.Iw = 1.1; s.Ie = 0.18;      // ponytail: one engine inertia for every car (keeps the 0-60 calibration); per-car Ie with a 0-60 recheck
    // sprung body: corner springs from the ride frequencies, roll stiffness from the roll gradient (split by rollF, the difference to
    // the springs is the anti-roll bar), dampers at 30 % critical in bump, 1.6x in rebound
    // ponytail: the full mass is sprung, no unsprung mass or tyre stiffness (no wheel hop); a 2-DOF corner at 240 Hz if hop matters
    // ponytail: one roll-axis height, no anti-dive / anti-squat geometry; per-axle roll centres and pitch-centre geometry next
    const t2 = s.track * s.track / 2, mcF = s.m * s.fw / 2, mcR = s.m * (1 - s.fw) / 2;
    s.fsF = mcF * G; s.fsR = mcR * G;
    s.kF = mcF * Math.pow(2 * Math.PI * (s.rideF || 1.3), 2) * kSus; s.kR = mcR * Math.pow(2 * Math.PI * (s.rideR || 1.45), 2) * kSus;
    s.hra = s.hra === undefined ? 0.1 : s.hra;
    const Kphi = s.m * G * (s.hcg - s.hra) * (1 / ((s.rollG || 5) * DEG) + 1) * kSus, rF = s.rollF || 0.56;
    s.arbF = (rF * Kphi - s.kF * t2) / t2; s.arbR = ((1 - rF) * Kphi - s.kR * t2) / t2;
    s.cbF = 2 * (s.zF || 0.3) * Math.sqrt(s.kF * mcF); s.cbR = 2 * (s.zR || 0.3) * Math.sqrt(s.kR * mcR);
    s.Ixx = 0.9 * s.m * (s.W * s.W + s.H * s.H) / 12; s.Iyy = 0.85 * s.m * (s.L * s.L + s.H * s.H) / 12;
    return { spec: s, x: 0, y: 0, psi: 0, vx: 0, vy: 0, r: 0, w: [0, 0, 0, 0], steer: 0, gear: 1, rpm: s.idle,
      thr: 0, brk: 0, axf: 0, ayf: 0, anf: 0, h: 0, vh: 0, vgPrev: 0, fresh: true, air: false, gap: 0, fall: 0, land: 0,
      pitch: 0, roll: 0, cut: 0, shiftT: 0, shiftCd: 0, manual: false,
      u: 0, v: 0, speed: 0, beta: 0, slip: [0, 0, 0, 0], Fz: [0, 0, 0, 0], surf: [1, 1, 1, 1], hh: [0, 0, 0, 0],
      // internal: tyre lag, previous road heights, body rates, virtual stick, key-held time, compliance angle, engine speed, clutch
      ta: [0, 0, 0, 0], hhP: [0, 0, 0, 0], vp: 0, vr: 0, sx: 0, tH: 0, sw: 0, comp: 0, compR: 0, we: s.idle * Math.PI / 30, clutch: 0,
      fyF: 0, fyR: 0, dst: 0, kdT: 0, fzf: [0, 0, 0, 0], fzs: true, bPrev: 0, hbK: 0, limT: 0, liftT: 0, gz: 0, gp: 0, gr: 0 };
  }

  /** Drive force (N) in gear index k at the speed that gives rpmV in gear index cur, at pedal thr (engine braking included, as in step). */
  function pull(s, rpmV, cur, k, thr) {
    const rpm = rpmV * s.gears[k] / s.gears[cur];
    return (torqueAt(s, rpm) * s.pwr * thr - coastT(s, rpm) * coastK(thr)) * s.gears[k] * s.final * 0.9 / s.R;
  }

  function shift(c, dir) {
    const g = c.gear + dir;
    if (g < 1 || g > c.spec.gears.length || c.gear < 1) return;
    c.gear = g; c.shiftT = 0.16; c.shiftCd = 0.55;
  }

  // per-step scratch (no allocation in step)
  const X = [0, 0, 0, 0], Y = [0, 0, 0, 0], Tdrv = [0, 0, 0, 0], Tb = [0, 0, 0, 0], FS = [0, 0, 0, 0], DI = [0, 0, 0, 0], DD = [0, 0, 0, 0];
  const FX0 = [0, 0, 0, 0], FY0 = [0, 0, 0, 0], DF = [0, 0, 0, 0], W0 = [0, 0, 0, 0], IE = [0, 0, 0, 0], MUF = [0, 0, 0, 0], CD = [0, 0, 0, 0], SD = [0, 0, 0, 0];

  // Coulomb friction between two wheels (diff) or two axles (centre coupling): moves angular momentum from the faster side to the
  // slower one, at most Tlim * dt, never past equal speeds. Exact, so stable at any dt
  function couple(w, i, j, Ii, Ij, Tlim, dt) {
    const d = w[i] - w[j]; if (d === 0) return;
    const L = Math.min(Math.abs(d) * Ii * Ij / (Ii + Ij), Tlim * dt) * Math.sign(d);
    w[i] -= L / Ii; w[j] += L / Ij;
  }

  /** Advance the car by dt. inp: see the header. env: {height(x,y), surface(x,y)}. A frame longer than 1/120 s is split into 1/240 s
   *  sub-steps (the game steps at 1/240; a tool or a dropped frame may not). */
  function step(c, inp, dt, env) {
    if (dt > 1 / 120) { const n = Math.ceil(dt * 240); for (let i = 0; i < n; i++) step1(c, inp, dt / n, env); return c; }
    return step1(c, inp, dt, env);
  }

  function step1(c, inp, dt, env) {
    const s = c.spec;
    const cs = Math.cos(c.psi), sn = Math.sin(c.psi);
    const u = c.vx * cs + c.vy * sn, v = -c.vx * sn + c.vy * cs;
    const speed = Math.sqrt(u * u + v * v);

    // pedals: brake at a standstill selects reverse, gas selects drive again
    let gas = inp.gas, brake = inp.brake;
    if (c.gear > 0) { if (brake > 0.1 && gas < 0.1 && speed < 0.6 && !(inp.handbrake > 0.1)) c.gear = -1; }   // speed, not u: never mid-spin
    else if (gas > 0.1 && brake < 0.1 && u > -0.6) c.gear = 1;
    if (c.gear < 0) { const t = gas; gas = brake; brake = t; }
    c.thr += clamp(gas - c.thr, -dt * 9, dt * 6);
    c.brk += clamp(brake - c.brk, -dt * 12, dt * 7);

    // assists: explicit fields win, else the "Driving assists" preset (ABS is factory equipment and stays on)
    const asOn = inp.assist !== false;
    const tc = inp.tc !== undefined ? +inp.tc : asOn ? 2 : 0, esc = inp.esc !== undefined ? !!inp.esc : asOn;
    const csHelp = inp.cs !== undefined ? !!inp.cs : asOn, abs = inp.abs !== undefined ? !!inp.abs : true;
    const dev = inp.device || 'kb';
    if (c.fresh) { c.dst = c.steer; c.fzs = true; c.sx = 0; c.tH = 0; c.comp = c.compR = 0; c.ta[0] = c.ta[1] = c.ta[2] = c.ta[3] = 0; c.clutch = 0; c.we = Math.max(c.rpm, s.idle) * Math.PI / 30; c.fyF = c.fyR = 0; }

    // ---------------------------------------------------------------- input layer: sets c.steer, the road-wheel angle
    const beta = Math.atan2(v, Math.max(Math.abs(u), 1.5));
    const v2 = speed * speed, sF = (SURF[c.surf[0]].soft + SURF[c.surf[1]].soft) / 2;
    const dirR = Math.atan2(v - s.b * c.r, Math.max(u, 1.5));          // rear-axle slip: how far the tail is out
    const tail = v * (v - s.b * c.r) > 0 ? Math.abs(beta) : 0;          // the nose-in attitude of a tight slow turn is not a slide
    const sliding = u > 2 ? clamp((tail - 0.045) / 0.07, 0, 1) * clamp((speed - 3) / 4, 0, 1) : 0;
    const trav = Math.atan2(v + s.a * c.r, Math.max(u, 1.5));          // front-axle direction of travel
    if (s.drift) {
      // DRIFT build (arcade, every device): speed-sensitive input; once the car slides the front wheels follow the direction of travel
      // and a gyro term damps yaw, so a held key or stick sets the front slip angle rather than fighting a spin
      // ponytail: wb / R assumes asphalt grip (loose ground only widens the slip margin); use the fronts' SURF mu if grass steering feels eager
      const grip = Math.min(s.steerRad, Math.atan(s.wb * 0.9 * G * s.mu / Math.max(v2, 0.01)) + 0.12 * sF / (1 + v2 / 900));
      const gain = Math.max(grip, (s.steerRad + (Math.min(s.steerRad, 0.64) - s.steerRad) * clamp((speed - 4) / 10, 0, 1)) / (1 + v2 / 324));
      // steering into the slide's direction of travel unlocks more lock, so opposite lock is there without assists too
      let target = clamp(inp.steer * gain, -grip, grip) + (inp.steer * dirR > 0 ? inp.steer * 1.3 * Math.max(0, Math.abs(dirR) - 0.14) : 0);
      // sliding: a held key asks for ~7 deg of front slip into (or against) the slide instead of full lock.
      // The yaw damping eases off while the car swings back through straight (r and beta same sign), so a flick swaps sides
      if (sliding > 0) target = target * (1 - sliding) + sliding * (inp.steer * 0.12 + trav - (c.r * beta > 0 ? 0.06 : 0.20) * c.r);
      target = clamp(target, -s.steerRad, s.steerRad);
      c.steer += clamp(target - c.steer, -dt * 8, dt * 8);
      c.sx = clamp(inp.steer, -1, 1); c.sw = c.sx * s.SWmax;
    } else if (dev === 'wheel') {
      // RACE, steering wheel (or raw input): the rack, nothing else
      const x = clamp(inp.steer, -1, 1);
      c.sx = x; c.sw = x * s.SWmax; c.steer = x * s.d0 * (1 + s.pk * x * x);
    } else {
      // RACE, pad / keyboard / touch: a virtual steering wheel with device rates, mapped to a speed-sensitive range that ends just past
      // the steady-state grip limit (full stick = the most the car can corner, never dead travel); counter-lock toward the direction
      // of travel is always open
      const tgt = clamp(inp.steer, -1, 1);
      if (dev === 'pad') { c.sx += clamp(tgt - c.sx, -PAD_RATE * dt, PAD_RATE * dt); c.tH = 0; }
      else {
        const press = tgt * c.sx >= 0 && Math.abs(tgt) > Math.abs(c.sx);
        c.tH = press ? c.tH + dt : 0;
        const rate = (press ? KB_RATE0 + KB_RATE1 * c.tH : KB_RET) * dt;
        c.sx += clamp(tgt - c.sx, -rate, rate);
      }
      // full input = the steady-state limit on asphalt (geometry at mu g + the car's understeer at mu g) plus a little slip: past the
      // limit a keyboard or stick only scrubs the fronts and swings the yaw
      // ponytail: the range is set for asphalt (the same stick gives the same wheel angle on every surface; grass grips less but peaks
      // later, which roughly cancels). Scale by the fronts' SURF mu and soft if loose-ground steering feels off
      const sx = c.sx, ax = Math.abs(sx), aF = s.tyF.apk * sF;
      const L = Math.min(s.steerRad, Math.atan(s.wb * s.mu * G / Math.max(v2, 0.01)) + s.Kus * s.mu + 0.2 * s.tyF.apk);
      // pad: a gentle on-centre curve, so the stick's 1.6 power curve keeps its resolution without a dead last third; keyboard and
      // touch: the held key's ramp turns in quickly and eases into full input (x (2 - x): a half-way ramp is 3/4 of the range)
      const sh = dev === 'pad' ? ax * (1.3 - 0.3 * ax) : ax * (2 - ax);
      // (counter-lock, steering against the yaw, opens to the front axle's travel + the peak slip; steering with it stays at L)
      let dt0 = sx >= 0 ? sh * clamp(c.r < 0 ? Math.max(L, trav + aF) : L, -s.steerRad, s.steerRad) : sh * clamp(c.r > 0 ? Math.min(-L, trav - aF) : -L, -s.steerRad, s.steerRad);
      if (csHelp) {
        // countersteer help: the caster self-steer a wheel driver feels through force feedback. Hands off in a slide, the wheels
        // follow the front axle's travel (no front slip) with some yaw damping; fades as the player steers and when the rear grips
        const aR = s.tyR.apk * (SURF[c.surf[2]].soft + SURF[c.surf[3]].soft) / 2;
        const gw = (1 - ax) * clamp((Math.abs(dirR) - 0.8 * aR) / (0.6 * aR), 0, 1) * clamp((speed - 3) / 3, 0, 1);
        dt0 += gw * (clamp(trav, -CS_MAXANG, CS_MAXANG) - dt0) - gw * CS_DAMP * c.r;
      }
      c.sw = sx * s.SWmax;
      // the road wheels cross the range in use in no less than RW_T (at speed the range is small, so a stick snap or a held key turns
      // in at a pace the yaw can follow), and never faster than RW_RATE
      const rw = Math.min(RW_RATE, Math.max(L, Math.abs(dt0)) / (RW_T + 0.4 * clamp((speed - 16.7) / 11.1, 0, 1))) * dt;
      c.steer += clamp(dt0 - c.steer, -rw, rw);
    }

    // ---------------------------------------------------------------- terrain
    const ht = s.track / 2;
    X[0] = X[1] = s.a; X[2] = X[3] = -s.b; Y[0] = Y[2] = ht; Y[1] = Y[3] = -ht;
    const hh = c.hh;
    for (let i = 0; i < 4; i++) {
      const wx = c.x + X[i] * cs - Y[i] * sn, wy = c.y + X[i] * sn + Y[i] * cs;
      hh[i] = env.height(wx, wy); c.surf[i] = env.surface(wx, wy);
    }
    const hF = (hh[0] + hh[1]) / 2, hR = (hh[2] + hh[3]) / 2;
    const slopeF = (hF - hR) / s.wb, slopeL = ((hh[0] + hh[2]) - (hh[1] + hh[3])) / (2 * s.track);
    if (c.fresh) {      // re-seat the body on the ground at static ride
      c.h = c.gz = hR + slopeF * s.b; c.vh = 0; c.pitch = c.gp = Math.atan(slopeF); c.roll = c.gr = Math.atan(slopeL); c.vp = c.vr = 0;
      for (let i = 0; i < 4; i++) c.hhP[i] = hh[i];
      c.fresh = false; c.air = false; c.gap = c.fall = 0;
    }

    // ---------------------------------------------------------------- suspension: corner forces from the body's attitude
    const tp = Math.tan(c.pitch), tr = Math.tan(c.roll), idt = 1 / dt;
    let dmax = -1, imax = 0;
    for (let i = 0; i < 4; i++) {
      const f = i < 2, d = hh[i] - (c.h + X[i] * tp + Y[i] * tr);          // compression from static ride
      let dd = (hh[i] - c.hhP[i]) * idt - (c.vh + X[i] * c.vp + Y[i] * c.vr);
      dd = dd > 5 ? 5 : dd < -5 ? -5 : dd;
      const k = f ? s.kF : s.kR, cb = f ? s.cbF : s.cbR;
      // two-slope damper (AC slow/fast): full rate to 0.12 m/s, 0.4x beyond; rebound 1.6x bump
      const sl = dd > 0.12 ? 0.12 + 0.4 * (dd - 0.12) : dd < -0.12 ? -0.12 + 0.4 * (dd + 0.12) : dd;
      FS[i] = (f ? s.fsF : s.fsR) + k * d + (dd > 0 ? cb : 1.6 * cb) * sl + (d > 0.08 ? 10 * k * (d - 0.08) : 0);
      DI[i] = d; DD[i] = dd; c.hhP[i] = hh[i];
      if (d > dmax) { dmax = d; imax = i; }
    }
    const arbF = s.arbF * (DI[0] - DI[1]) / 2, arbR = s.arbR * (DI[2] - DI[3]) / 2;
    FS[0] += arbF; FS[1] -= arbF; FS[2] += arbR; FS[3] -= arbR;
    for (let i = 0; i < 4; i++) if (FS[i] < 0) FS[i] = 0;             // a wheel past full droop carries nothing
    // deep on the bump stops (a lidar step, a jump landing) the wheel loads blend, from 0.1 to 0.2 m, into rigid-body loads (static
    // share plus the transfer from last step's tyre forces) instead of the stop's spike, and past 0.15 m the body rides the ground
    // plane below: the car crawls up a step as the old model did rather than bouncing off it
    // ponytail: no bump-stop load spike past 0.1 m; a stop with travel and a tyre spring if kerb strikes need it
    if (dmax > 0.1) {
      const lx = s.m * c.axf * s.hcg / (2 * s.wb), ly = s.m * c.ayf * s.hcg / s.track, rF = s.rollF || 0.56, wb = dmax < 0.2 ? (dmax - 0.1) / 0.1 : 1;
      FS[0] += (Math.max(0, s.fsF - lx - rF * ly) - FS[0]) * wb; FS[1] += (Math.max(0, s.fsF - lx + rF * ly) - FS[1]) * wb;
      FS[2] += (Math.max(0, s.fsR + lx - (1 - rF) * ly) - FS[2]) * wb; FS[3] += (Math.max(0, s.fsR + lx + (1 - rF) * ly) - FS[3]) * wb;
    }
    // wheel loads: the springs plus the roll-centre (geometric) share of last step's side force, on the outside wheels
    const gF = c.fyF * s.hra / s.track, gR = c.fyR * s.hra / s.track, Fz = c.Fz;
    Fz[0] = FS[0] > 0 ? Math.max(0, FS[0] - gF) : 0; Fz[1] = FS[1] > 0 ? Math.max(0, FS[1] + gF) : 0; Fz[2] = FS[2] > 0 ? Math.max(0, FS[2] - gR) : 0; Fz[3] = FS[3] > 0 ? Math.max(0, FS[3] + gR) : 0;      // (no spring load, no contact)
    const airNow = Fz[0] + Fz[1] + Fz[2] + Fz[3] === 0;
    if (c.air && !airNow) { let cl = 0; for (let i = 0; i < 4; i++) if (Fz[i] > 0 && DD[i] > cl) cl = DD[i]; c.land = Math.max(c.land, cl); }   // closing speed at touchdown
    c.air = airNow;
    const FzNom = s.m * G / 4;

    // ---------------------------------------------------------------- driveline
    const fShare = s.fShare, rShare = 1 - fShare, awd = fShare > 0 && rShare > 0;
    const ratio = (c.gear > 0 ? s.gears[c.gear - 1] : -s.gears[0]) * s.final;
    const wd = awd ? (c.w[0] + c.w[1] + c.w[2] + c.w[3]) / 4 : fShare > 0 ? (c.w[0] + c.w[1]) / 2 : (c.w[2] + c.w[3]) / 2;
    const rpmW = wd * ratio * 30 / Math.PI;
    const launch = s.idle + c.thr * (s.launch - s.idle);
    const hbOn = inp.handbrake > 0.1;
    // throttle assists for on/off (keyboard) throttle: trim wheelspin when driving straight, back off before a spin
    let thr = c.thr;
    // factory speed limiter: the real car's governed (or tyre-rated) top speed in mph, vgov in CARS; fuel fades out over the last 1.5 m/s
    if (s.vgov && c.gear > 0) thr *= clamp((s.vgov / 2.23694 - u) / 1.5, 0, 1);
    const thrE = thr;                                   // engine braking follows the pedal (and limiter), not the traction trims below
    const iD = rShare > 0 ? 2 : 0;
    // open = how much wheelspin the driver is asking for: steering hard (rear drive only: spinning front tyres just plough), or already
    // well sideways (in reverse only a little, to turn a welded axle)
    // (race setup: only traction control Low opens; High and stability control hold the car straight whatever the steering does)
    const turn = rShare > 0 ? clamp(Math.abs(inp.steer) * 2 - 0.6, 0, 1) : 0;
    const open = !s.drift && tc !== 1 ? 0 : c.gear < 0 ? 0.3 * turn : Math.max(sliding > 0 ? clamp((Math.abs(beta) - 0.2) / 0.15, 0, 1) : 0, turn);
    // stability control (race): yaw rate past what the steering and speed ask for (the car's own understeer gradient, capped at
    // the grip under the car), or a body slip angle past ~6 deg (later on loose ground) or growing fast, is oversteer: it trims the
    // power here and brakes the outside front below for a yaw moment of Izz * error / ESC_TAU, which also damps the yaw swing of a
    // step past the limit
    // ponytail: oversteer only, no understeer braking (it made loose ground corner like asphalt); inside-rear braking if wanted
    let over = 0;
    const muS = s.mu * (SURF[c.surf[0]].mu + SURF[c.surf[1]].mu + SURF[c.surf[2]].mu + SURF[c.surf[3]].mu) / 4;      // the grip under the car (as ESC estimates it)
    if (esc && !s.drift && u > 5) {
      const rl = 0.88 * muS * G / u, e = c.r - clamp(u * c.steer / (s.wb + s.Kus * u * u / G), -rl, rl), ab = Math.abs(beta);
      if (c.r * e > 0) over = Math.abs(e) - 0.03;
      if (c.r * beta < 0) over = Math.max(over, 0.6 * (ab - 0.10 * (SURF[c.surf[2]].soft + SURF[c.surf[3]].soft) / 2) + 0.15 * Math.max(0, (ab - c.bPrev) / dt));   // loose ground slides later
    }
    if (tc > 0) {
      // traction control holds the driven tyres at their peak slip, which loose ground puts later (SURF soft): about 11 % on asphalt,
      // 19 % on gravel, 25 % on grass, so the tyres dig. Low lets them run 60 % further past it
      // (the axle's mean slip: a single wheel spinning up on an open diff is braked below)
      const vD = Math.max(Math.abs(u), 2), kD = Math.sign(c.gear) * ((c.w[iD] + c.w[iD + 1]) / 2 * s.R - u) / vD, wl = tc === 1 ? 1.6 : 1;
      const lo = (SURF[c.surf[iD]].soft + SURF[c.surf[iD + 1]].soft) / 2 - 1;      // 0 asphalt, 0.5 gravel, 0.8 grass
      // the driven tyres' own peak: 0.08 on touring tyres, later on truck and drift tyres; race setup: less mid-corner (the slip a tyre
      // spends on drive it takes from cornering)
      const kq = ((iD ? s.tyR : s.tyF).kpk * 0.73 + 0.14 * lo) * (s.drift ? 1 : 1 - clamp(Math.abs(c.ayf) / (muS * G), 0, 1));
      thr *= clamp(1 - (kD - wl * kq - 1.33 * open) / (wl * (0.06 + 0.06 * lo) + 0.2 * open), 0.1, 1);
    }
    if (esc && c.gear > 0) {
      // power side: cut power as the slip angle nears what the lock can still catch
      if (c.r * beta < 0) thr *= 1 - 0.9 * clamp((Math.abs(beta) - (s.steerRad - 0.1)) / 0.3, 0, 1);
      if (s.drift) {      // drift build (the old assist): with the tail stepping out while the driver is not asking for a slide, ease off
        const sR = (SURF[c.surf[2]].soft + SURF[c.surf[3]].soft) / 2;
        thr *= 1 - 0.85 * (1 - open) * clamp((Math.abs(dirR) - 0.02 * sR) / (0.04 * sR), 0, 1) * clamp((speed - 3) / 4, 0, 1);
      } else if (over > 0) thr *= 1 - clamp(over / 0.08, 0, 0.95);
    }
    // engine and clutch. Locked: the engine turns with the driven wheels (below the launch rpm the clutch slips at the launch rpm; a
    // gear change cuts the torque for shiftT and re-syncs, as a smooth shift does). Slipping (handbrake on a rear-driven car): the
    // engine runs free, the clutch passes at most Tcap and locks again when the speeds meet: a handbrake flare revs the engine,
    // letting go kicks the clutch
    const declutch = hbOn && rShare > 0 && (s.drift || c.manual);      // an automatic has no clutch pedal to drop
    const wE = ratio * wd;                                // engine speed the wheels ask for (rad/s)
    if (declutch) c.clutch = 1;
    let rpm, Tcl = 0, coupled = false;
    if (c.clutch) {
      rpm = c.we * 30 / Math.PI;
      let Te = torqueAt(s, rpm) * s.pwr * thr - coastT(s, rpm) * coastK(thrE);
      if (rpm > s.redline) c.cut = 0.06;
      if (c.cut > 0) { c.cut -= dt; if (Te > 0) Te = 0; }
      // below the launch rpm the clutch grips along a stall-speed curve (an engine at idle does not lurch the car), and it hands over
      // to the launch slip once the engine has come down to the launch rpm
      const low = Math.abs(wE) * 30 / Math.PI < launch, slip = c.we - wE;
      const Tcap = declutch ? 0 : low ? 1.2 * s.tqMax * s.pwr * Math.pow(clamp((rpm - s.idle) / (s.launch - s.idle), 0, 1), 2) : 1.5 * s.tqMax * s.pwr;
      Tcl = Tcap * Math.sign(slip);
      const weN = c.we + (Te - Tcl) / s.Ie * dt;
      if (!declutch && ((weN - wE) * slip <= 0 || Math.abs(weN - wE) < 5.2 || (low && weN * 30 / Math.PI <= launch + 50))) c.clutch = 0;   // speeds met: lock
      c.we = clamp(weN, s.idle * Math.PI / 30, (s.redline + 150) * Math.PI / 30);   // the idle governor keeps it running
    }
    if (!c.clutch) {
      rpm = Math.max(rpmW, launch);
      let Te = torqueAt(s, rpm) * s.pwr * thr;
      if (rpm > s.redline) c.cut = 0.06;
      if (c.cut > 0) { c.cut -= dt; Te = 0; }
      if (c.shiftT > 0) { c.shiftT -= dt; Te = 0; }
      if (rpmW >= launch) Te -= coastT(s, rpm) * coastK(thrE);
      Tcl = Te; coupled = true;
      c.we = rpm * Math.PI / 30;
    }
    const Tw = Tcl * ratio * 0.9;
    Tdrv[0] = Tdrv[1] = Tw * fShare / 2; Tdrv[2] = Tdrv[3] = Tw * rShare / 2;
    c.rpm += (clamp(Math.abs(rpm), s.idle, s.redline + 150) - c.rpm) * Math.min(1, dt / 0.05);

    // automatic gearbox (holds the gear while sliding so drifts are not interrupted). Uphill it only upshifts into a gear that still
    // pulls against the road load (or at the limiter), and a part-throttle climb that bogs down kicks down before the engine lugs,
    // so the box neither short-shifts nor hunts on a hill
    c.shiftCd -= dt; c.kdT -= dt;
    c.hbK = hbOn ? 0.7 : Math.max(0, c.hbK - dt);   // handbrake entry scrubs speed: don't let that kick down into the limiter
    if (!c.manual && c.gear > 0 && c.shiftCd <= 0 && !c.air) {
      const rpmV = speed / s.R * ratio * 30 / Math.PI;     // rpm without wheelspin: spinning tyres don't cause upshifts
      const hold = Math.abs(beta) > 0.2 && speed > 6;
      c.limT = Math.max(0, c.limT + (rpmW > 0.9 * s.redline ? dt : -2 * dt));   // sitting on the limiter mid-slide: grab the next gear
      c.liftT = c.thr < 0.5 ? c.liftT + dt : 0;                  // short lifts keep the gear; cruising upshifts early
      // ponytail: road load = slope + one tyre's rolling drag + aero, only above a 3 % grade (flat-road shifts are as they were), and blind to
      // traction control, so a part-throttle grass climb can still cycle slowly off the limiter; a real grade/shift map if that matters
      const climb = slopeF > 0.03, load = s.m * G * (slopeF + SURF[c.surf[2]].rr + SURF[c.surf[2]].rrv * speed) + 0.5 * RHO * s.cda * speed * speed;
      // (a climb kickdown holds the lower gear for 3 s unless the engine nears the limiter, so lidar bumps cannot cycle it; on a climb
      // the limiter only upshifts into a gear that still pulls, as a grade-logic box holds the gear rather than cycle every few seconds)
      const pulls = !climb || c.gear >= s.gears.length || c.thr < 0.05 || pull(s, rpmV, c.gear - 1, c.gear, c.thr) > 1.25 * load;
      if (((rpmV > s.redline * (hold ? 0.985 : c.liftT > 1.5 ? 0.55 + 0.38 * c.thr : 0.93) && (hold || pulls) && (c.kdT <= 0 || rpmV > 0.95 * s.redline))
        || (rpmV > 0.985 * s.redline && (hold || pulls)) || (hold && c.limT > 0.7)) && c.gear < s.gears.length) { shift(c, 1); c.limT = 0; }
      else if (c.gear > 1) {
        const down = (hold ? Math.max(rpmV, rpmW) : rpmV) * s.gears[c.gear - 2] / s.gears[c.gear - 1];
        if (rpmV < s.idle * 1.5 + 300 || (c.thr > 0.7 && !(c.hbK > 0 && rpmV > 0.4 * s.redline) && down < (hold ? 0.62 : 0.8) * s.redline)
          || (climb && c.thr > 0.25 && !hold && down < 0.7 * s.redline && pull(s, rpmV, c.gear - 1, c.gear - 1, c.thr) < load)) { shift(c, -1); if (climb) c.kdT = 3; }
      }
    }

    // ---------------------------------------------------------------- brakes
    const bT = c.brk * s.brakeT;
    Tb[0] = Tb[1] = bT * s.bias / 2; Tb[2] = Tb[3] = bT * (1 - s.bias) / 2 + inp.handbrake * s.hbT;
    if (tc > 0 && !s.drift && c.gear !== 0) {
      // traction control, brake side: a driven wheel spinning faster than its partner is braked, which an open diff turns into drive
      // on the other wheel (what TC does on cars without a limited-slip diff)
      for (let ax = 0; ax < 2; ax++) {
        const i = ax * 2, Tin = Math.abs(Tdrv[i] + Tdrv[i + 1]); if (Tin <= 0) continue;
        const dk = (c.w[i] - c.w[i + 1]) * s.R * Math.sign(c.gear) / Math.max(Math.abs(u), 2), j = dk > 0 ? i : i + 1;
        Tb[j] += 0.5 * Tin * clamp((Math.abs(dk) - 0.03) * 10, 0, 1);
      }
    }
    // stability control, brake side: oversteer -> the outside front
    if (over > 0) Tb[c.r > 0 ? 1 : 0] += Math.min(s.Izz * over / ESC_TAU / ht * s.R, ESC_MAX * s.m * G * s.R);

    // ---------------------------------------------------------------- tyres
    // Ackermann: each front wheel aims at the turn centre that c.steer implies (race setup; the drift build's angle kit is parallel).
    // Both front wheels lose the compliance angle: steering, roll steer and aligning-torque compliance in one deg/g figure
    // ponytail: compliance is one lumped knob; separate rack compliance and roll steer next
    c.dst += (c.steer - c.dst) * (s.tr > 0 ? Math.min(1, dt / s.tr) : 1);      // rack and column compliance: the tyres see the angle tr s late
    const tn = Math.tan(c.dst);
    let dL = c.dst, dR = c.dst;
    if (s.ack) { dL = Math.atan2(s.wb * tn, s.wb - ht * tn); dR = Math.atan2(s.wb * tn, s.wb + ht * tn); }
    dL -= c.comp; dR -= c.comp;
    CD[0] = Math.cos(dL); SD[0] = Math.sin(dL); CD[1] = Math.cos(dR); SD[1] = Math.sin(dR); CD[2] = CD[3] = Math.cos(c.compR); SD[2] = SD[3] = Math.sin(c.compR);
    // ponytail: no aligning torque, camber, pressure or temperature; brush-model Mz and camber from body roll next
    // the tyres see the corner load through their own compliance (~25 ms), so grip does not follow lidar noise step by step
    // ponytail: a filter in place of the unsprung mass and tyre spring; a 2-DOF corner if wheel hop matters
    const kz = c.fzs ? 1 : Math.min(1, dt / 0.025); c.fzs = false;
    for (let i = 0; i < 4; i++) {
      const cd = CD[i], sd = SD[i];
      const ux = u - c.r * Y[i], vy = v + c.r * X[i];
      const vxw = ux * cd + vy * sd, vyw = -ux * sd + vy * cd, avx = vxw < 0 ? -vxw : vxw;
      c.fzf[i] = Fz[i] > 0 ? c.fzf[i] + (Fz[i] - c.fzf[i]) * kz : 0;      // (a wheel off the ground carries nothing at once)
      const sf = SURF[c.surf[i]], ty = i < 2 ? s.tyF : s.tyR, fz = c.fzf[i];
      const q = clamp(fz / FzNom, 0.2, 2.5);
      const mu = s.mu * ty.mu * sf.mu * clamp(1 - ty.ls * (q - 1), 0.7, 1.15);
      const kp = ty.kpk * sf.soft, tap = ty.tap0 * (1 + ty.ea * (q - 1)) * sf.soft, wR = c.w[i] * s.R;
      // drift build (arcade): on a steep grass climb its driven tyres dig up to 15 % harder (from a 10 % grade, full at 20 %), so it
      // climbs the grass hills the old model let it climb; flat grass is unchanged
      const tcx = s.drift && i > 1 && sf.soft > 1.6 ? ty.cx * (1 + 0.15 * clamp((slopeF - 0.1) / 0.1, 0, 1)) : ty.cx;
      // relaxation length: the slip angle builds up over sig metres of travel (faded out at a crawl, where a lagged slip would ring)
      const raw = vyw / (avx > 1.5 ? avx : 1.5);
      c.ta[i] += (raw - c.ta[i]) * Math.min(1, dt * (avx > 3 ? avx : 3) / ty.sig);
      const bl = clamp((avx - 2) / 4, 0, 1), ta = raw + bl * (c.ta[i] - raw);
      const vref = avx > 2 ? avx : 2, sxn = (wR - vxw) / vref / kp, syn = ta / tap;
      let fx = 0, fy = 0, dF = 0;
      if (fz > 0) {
        const r2 = sxn * sxn + syn * syn, rho = Math.sqrt(r2), mF = mu * fz, B = ty.B, C = ty.C;
        if (rho > 1e-6) {
          const A = Math.atan(B * rho), F = mF * Math.sin(C * A), Fr = F / rho, Fp = mF * C * B * Math.cos(C * A) / (1 + B * B * r2);
          fx = Fr * sxn * tcx; fy = -Fr * syn;
          if (rho > 1) {
            // past the peak the tyre slides: turn the force from the normalised-slip direction toward the sliding velocity (fully by
            // twice the peak) at the same size, so a locked steered wheel pulls straight back and a spinning wheel pushes along its slip
            const sx = (wR - vxw) / vref, sm2 = sx * sx + ta * ta, wb = rho < 2 ? rho - 1 : 1, fm = Math.sqrt(fx * fx + fy * fy);
            if (sm2 > 1e-12 && fm > 1e-6) {      // (a wheel touching down carries ~0 N: nothing to turn)
              const sm = Math.sqrt(sm2), dx = fx / fm * (1 - wb) + wb * sx / sm, dy = fy / fm * (1 - wb) - wb * ta / sm;
              const dm = Math.sqrt(dx * dx + dy * dy); fx = fm * dx / dm; fy = fm * dy / dm;
            }
          }
          dF = tcx * (Fp * sxn * sxn + Fr * syn * syn) / r2;
        } else dF = tcx * mF * B * C;
        dF = dF > 0 ? s.R * dF / (vref * kp) : 0;       // d(fx)/d(wheel speed), N per rad/s
      }
      c.slip[i] = Fz[i] > 0 ? Math.sqrt((wR - vxw) * (wR - vxw) + vyw * vyw) : 0;

      // wheel spin, implicit in the tyre's longitudinal stiffness so it stays stable at low speed.
      // brake + rolling drag use the same effective inertia, so a free wheel settles at R*fx = -drag exactly
      const Ieff = s.Iw + dt * s.R * dF;
      let wn = c.w[i] + dt * (Tdrv[i] - s.R * fx) / Ieff;
      if ((wR - vxw) * (wn * s.R - vxw) < 0 && Math.abs(wn * s.R - vxw) > kp * vref) wn = vxw / s.R;   // don't overshoot through the grip region
      let tb = Tb[i] * dt / Ieff;
      if (abs && (i < 2 || !hbOn) && speed > 3 && wn * vxw > 0) {
        // ABS: per-wheel slip target just short of the peak (0.9 of the peak slip ratio): the brake never takes the wheel slower than
        // that within a step. Below 3 m/s it lets go, as real ABS does; the handbrake bypasses it
        // ponytail: the same four-channel ABS on every car (the 1997 Ranger had rear-only ABS); per-car channels if anyone asks
        const room = Math.abs(wn) - avx * (1 - 0.9 * kp) / s.R;
        if (tb > room) tb = room > 0 ? room : 0;
      }
      tb += (sf.rr + sf.rrv * avx) * fz * s.R * dt / Ieff;
      if (Math.abs(wn) <= tb) wn = 0; else wn -= Math.sign(wn) * tb;
      W0[i] = c.w[i]; c.w[i] = wn; IE[i] = Ieff; FX0[i] = fx; FY0[i] = fy; DF[i] = dF; MUF[i] = mu * fz * tcx;
    }
    // engine inertia on the driven wheels' mean (locked clutch, off the brakes): an open diff can spin one wheel at the wheel's own
    // inertia while the axle mean still carries the engine
    if (coupled && c.brk < 0.3) {
      let Lm = 0, Is = 0;
      for (let i = fShare > 0 ? 0 : 2, n = rShare > 0 ? 4 : 2; i < n; i++) { Lm += IE[i] * (c.w[i] - W0[i]); Is += IE[i]; }
      const corr = Lm / (Is + s.Ie * ratio * ratio) - Lm / Is;
      for (let i = fShare > 0 ? 0 : 2, n = rShare > 0 ? 4 : 2; i < n; i++) c.w[i] += corr;
    }
    // differentials: preload plus a power or coast ramp on the axle's input torque (welded = infinite, open = 0); AWD centre coupling
    // ponytail: the Mazda3 i-Activ is a fixed-split friction coupling, the Passat XDS a small power lock, not brake vectoring
    const dg = s.diff;
    for (let ax = 0; ax < 2; ax++) {
      const share = ax === 0 ? fShare : rShare, i = ax * 2;
      if (share <= 0) continue;
      const Tin = Tdrv[i] + Tdrv[i + 1], Tlim = dg[0] + (Tin >= 0 ? dg[1] : dg[2]) * Math.abs(Tin);
      if (Tlim > 0) couple(c.w, i, i + 1, IE[i], IE[i + 1], Tlim, dt);
    }
    if (awd && !declutch && s.cdiff) {
      const cg = s.cdiff, Tin = Math.abs(Tw), Tlim = cg[0] + cg[1] * Tin, IF = IE[0] + IE[1], IR = IE[2] + IE[3];
      const d = (c.w[0] + c.w[1] - c.w[2] - c.w[3]) / 2, L = Math.min(Math.abs(d) * IF * IR / (IF + IR), Tlim * dt) * Math.sign(d);
      c.w[0] -= L / IF; c.w[1] -= L / IF; c.w[2] += L / IR; c.w[3] += L / IR;
    }
    // tyre forces at the end of the step, matching the wheel speeds the implicit update, engine and diffs settled on
    let FX = 0, FY = 0, MZ = 0, fyF = 0, fyR = 0;
    for (let i = 0; i < 4; i++) {
      const lim = MUF[i], fxi = clamp(FX0[i] + DF[i] * (c.w[i] - W0[i]), -lim, lim), fy = FY0[i];
      const fxb = fxi * CD[i] - fy * SD[i], fyb = fxi * SD[i] + fy * CD[i];
      FX += fxb; FY += fyb; MZ += X[i] * fyb - Y[i] * fxb;
      if (i < 2) fyF += fy; else fyR += fy;
    }
    c.fyF = fyF; c.fyR = fyR;
    // compliance steer follows the front axle's side force with a 20 ms lag: cs deg per g of front-axle lateral load
    // (csr of it is the rear axle's: its wheels steer with the turn, same phase, which also damps the yaw response)
    const kc = Math.min(1, dt / 0.02);
    c.comp += ((1 - s.csr) * s.cs * DEG * fyF / (s.m * G * s.fw) - c.comp) * kc;
    c.compR += (s.csr * s.cs * DEG * fyR / (s.m * G * (1 - s.fw)) - c.compR) * kc;

    // load-transfer-free accelerations for the consumers (camera, physics_check), lagged like the old body
    const kf = Math.min(1, dt / 0.09), axT = FX / s.m, ayT = FY / s.m;
    c.axf += (axT - c.axf) * kf; c.ayf += (ayT - c.ayf) * kf;

    // aero drag + gravity along the slope
    // ponytail: the normal load on a slope stays m*g; cos(slope), then re-run the hill census
    const drag = 0.5 * RHO * s.cda * speed;
    FX -= drag * u; FY -= drag * v;
    if (!c.air) {
      FX -= s.m * G * slopeF / Math.sqrt(1 + slopeF * slopeF);
      FY -= s.m * G * slopeL / Math.sqrt(1 + slopeL * slopeL);
    }
    if (s.drift) {
      // drift helper (drift builds only, assists on or off): a push toward the steering side while the handbrake is on or the driver
      // steers on full throttle, fading out at 40 deg, so a slide starts on a flick and holds on the throttle; and a guard past
      // 55 deg that winds the angle back so an over-rotation recovers instead of spinning
      // ponytail: arcade yaw aid by design
      const ab = Math.abs(beta), want = hbOn || (c.thr > 0.8 && Math.abs(inp.steer) > 0.5);
      // (loose ground slides by itself: the push fades out on gravel and grass)
      const grip = clamp(((SURF[c.surf[2]].mu + SURF[c.surf[3]].mu) / 2 - 0.7) / 0.3, 0, 1);
      if (want) MZ += s.Izz * 3.0 * grip * Math.sign(inp.steer) * clamp((40 * DEG - ab) / (20 * DEG), 0, 1) * clamp((speed - 5) / 5, 0, 1);
      if (ab > 55 * DEG) MZ += Math.sign(beta) * s.Izz * (6 * (ab - 55 * DEG) + 2 * Math.max(0, (ab - c.bPrev) / dt));
    }
    c.bPrev = Math.abs(beta);

    c.vx += (FX * cs - FY * sn) / s.m * dt; c.vy += (FX * sn + FY * cs) / s.m * dt;
    c.r += MZ / s.Izz * dt;
    if (c.thr < 0.02 && speed < 0.3 && Math.abs(c.r) < 0.12 && !c.air) { c.vx = c.vy = c.r = 0; c.w[0] = c.w[1] = c.w[2] = c.w[3] = 0; }
    c.x += c.vx * dt; c.y += c.vy * dt; c.psi += c.r * dt;

    // ---------------------------------------------------------------- sprung body: heave, pitch, roll (semi-implicit Euler)
    const hr = s.hcg - s.hra;
    c.vh += ((FS[0] + FS[1] + FS[2] + FS[3]) / s.m - G) * dt;
    c.vp += (s.m * axT * s.hcg + (FS[0] + FS[1]) * s.a - (FS[2] + FS[3]) * s.b) / s.Iyy * dt;
    c.vr += (s.m * ayT * hr + (FS[0] + FS[2] - FS[1] - FS[3]) * ht + s.m * G * hr * Math.sin(c.roll - Math.atan(slopeL))) / s.Ixx * dt;
    c.h += c.vh * dt; c.pitch += c.vp * dt; c.roll += c.vr * dt;
    // past the bump stops (a kerb, a lidar step, a landing from height): the road rises faster than the suspension can travel, so
    // the body rides the ground plane, as the old model always did, moving with it at no more than 3 m/s (no launch off a step)
    const gz = hR + slopeF * s.b, gp = Math.atan(slopeF), gr = Math.atan(slopeL);
    if (dmax > 0.15) {
      c.vh = clamp((gz - c.gz) * idt, -3, 3); c.vp = clamp((gp - c.gp) * idt, -2, 2); c.vr = clamp((gr - c.gr) * idt, -2, 2);
      c.h = gz; c.pitch = gp; c.roll = gr;
    }
    c.gz = gz; c.gp = gp; c.gr = gr;

    c.u = u; c.v = v; c.speed = speed; c.beta = beta;
    return c;
  }

  root.DriftPhysics = { CARS, SURF, makeCar, step, shift, torqueAt, G };
})(typeof window !== 'undefined' ? window : globalThis);
