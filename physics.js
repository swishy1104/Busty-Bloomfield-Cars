/* Bloomfield Drift — vehicle dynamics.
   Four-wheel planar model: per-wheel slip angle + slip ratio through a combined-slip Magic Formula tyre,
   longitudinal/lateral load transfer, engine torque curve + gearbox + differential, terrain slope and crests,
   Ackermann steering, and the driver aids (grip-capped steering, traction control at each surface's peak slip, spin protection).
   Map frame: x east, y north, psi counter-clockwise from east. Body frame: u forward, v left.
   Public surface: window.DriftPhysics = { CARS, SURF, makeCar, step, shift, torqueAt, G }.
   Pure (no DOM / three.js) so tools/physics_check.js can run it under node. */
(function (root) {
  'use strict';
  const G = 9.81, RHO = 1.2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Real-world-ish specs. tq = [rpm, Nm] points; fw = front weight fraction; lock = diff lock 0 (open) .. 1 (welded).
  const CARS = [
    { id: 'mazda3', name: '2021 Mazda3 2.5 Turbo', sub: 'Hatchback', color: 0xf3f3ee, style: 'hatch',
      m: 1540, wb: 2.725, fw: 0.60, track: 1.57, hcg: 0.55, R: 0.325, L: 4.46, W: 1.80, H: 1.44,
      tq: [[1000, 220], [2000, 434], [3500, 434], [5000, 355], [6300, 270]], redline: 6300, idle: 800,
      gears: [3.552, 2.022, 1.452, 1.0, 0.708, 0.599], final: 4.33, drive: 'AWD', rearShare: 0.5, lock: 0.15, mu: 1.0, cda: 0.66, steer: 37, vgov: 134 },
    { id: 'ranger', name: 'Ford Ranger Splash', sub: 'Flareside pickup', color: 0xc8161d, style: 'pickup',
      m: 1430, wb: 2.74, fw: 0.57, track: 1.45, hcg: 0.62, R: 0.33, L: 4.69, W: 1.76, H: 1.62,
      tq: [[800, 240], [2400, 305], [3200, 300], [4200, 271], [5200, 200]], redline: 5200, idle: 750,
      gears: [3.40, 2.05, 1.31, 1.0, 0.79], final: 3.73, drive: 'RWD', lock: 0.12, mu: 0.88, cda: 0.95, steer: 37, vgov: 98 },
    { id: 'passat', name: 'Volkswagen Passat', sub: 'Sedan', color: 0x7d8288, style: 'sedan',
      m: 1470, wb: 2.80, fw: 0.60, track: 1.57, hcg: 0.55, R: 0.334, L: 4.87, W: 1.83, H: 1.49,
      tq: [[1000, 160], [1500, 250], [4750, 250], [6200, 195], [6500, 180]], redline: 6500, idle: 800,
      gears: [4.148, 2.37, 1.556, 1.155, 0.859, 0.686], final: 3.5, drive: 'FWD', lock: 0.05, mu: 0.95, cda: 0.64, steer: 36, vgov: 126 },
    { id: 'dart', name: 'Dodge Dart', sub: 'Sedan', color: 0xf1f1f1, style: 'sedan2',
      m: 1445, wb: 2.70, fw: 0.61, track: 1.57, hcg: 0.55, R: 0.317, L: 4.67, W: 1.83, H: 1.47,
      tq: [[1000, 150], [2500, 200], [4800, 232], [6250, 209], [6500, 195]], redline: 6500, idle: 800,
      gears: [4.212, 2.637, 1.8, 1.386, 1.0, 0.772], final: 3.4, drive: 'FWD', lock: 0.05, mu: 0.95, cda: 0.62, steer: 36, vgov: 127 },
    { id: 'mustang', name: 'Ford Mustang GT', sub: 'Coupe', color: 0xe2581c, style: 'coupe',
      m: 1720, wb: 2.72, fw: 0.54, track: 1.62, hcg: 0.50, R: 0.343, L: 4.78, W: 1.92, H: 1.38,
      tq: [[1000, 380], [3000, 520], [4600, 570], [7000, 468], [7500, 420]], redline: 7500, idle: 850,
      gears: [3.66, 2.43, 1.69, 1.32, 1.0, 0.65], final: 3.55, drive: 'RWD', lock: 0.6, mu: 1.05, cda: 0.75, steer: 37, vgov: 155 },
    { id: 'miata', name: 'Mazda MX-5 Miata', sub: 'Roadster', color: 0x1f4fa8, style: 'roadster',
      m: 1070, wb: 2.31, fw: 0.51, track: 1.50, hcg: 0.45, R: 0.308, L: 3.92, W: 1.74, H: 1.24,
      tq: [[1000, 130], [2500, 180], [4000, 205], [7000, 184], [7500, 170]], redline: 7500, idle: 850,
      gears: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0], final: 2.866, drive: 'RWD', lock: 0.5, mu: 1.0, cda: 0.6, steer: 38, vgov: 135 },
    { id: 'crownvic', name: 'Ford Crown Victoria', sub: 'Police Interceptor', color: 0x16181d, style: 'sedan3',
      m: 1870, wb: 2.91, fw: 0.56, track: 1.63, hcg: 0.56, R: 0.345, L: 5.39, W: 1.99, H: 1.48,
      tq: [[800, 300], [3000, 390], [4000, 403], [5000, 355], [5800, 290]], redline: 5800, idle: 700,
      gears: [2.84, 1.55, 1.0, 0.70], final: 3.55, drive: 'RWD', lock: 0.25, mu: 0.9, cda: 0.8, steer: 38, vgov: 129 },
    // W213 E300, US MY2017-20 RWD: M274 2.0 I4 with ONE turbo (not a twin-turbo), 241 hp @ 5500, 370 Nm @ 1300-4000; 9G-TRONIC; 130 mph governed
    { id: 'e300', name: 'Mercedes-Benz E300', sub: 'Sport sedan', color: 0x16181d, style: 'sedan',
      m: 1720, wb: 2.939, fw: 0.52, track: 1.61, hcg: 0.54, R: 0.338, L: 4.923, W: 1.852, H: 1.468,
      tq: [[1000, 270], [1300, 370], [4000, 370], [5000, 333], [5500, 312.5], [6300, 262]], redline: 6300, idle: 650,
      gears: [5.354, 3.243, 2.252, 1.636, 1.211, 1.0, 0.865, 0.717, 0.601], final: 2.82, drive: 'RWD', lock: 0.15, mu: 1.0, cda: 0.6, steer: 36, vgov: 130 },
    // golf cart (player.js / car_cart.js): a 48 V electric fleet cart, 24 km/h governed, one speed, rear drive. hidden: the garage does not list it.
    { id: 'cart', name: 'Golf cart', sub: 'Electric fleet cart', color: 0xf3f3ee, style: 'cart', hidden: true,
      m: 450, wb: 1.65, fw: 0.42, track: 1.0, hcg: 0.45, R: 0.23, L: 2.4, W: 1.2, H: 1.8,
      tq: [[0, 60], [2400, 60], [3000, 30]], redline: 3000, idle: 200,
      gears: [1.0], final: 10, drive: 'RWD', lock: 0.3, mu: 0.85, cda: 1.1, steer: 35, vgov: 15.6 },
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

  /** Build a car state. drift=true applies the drift build: RWD swap, welded diff, angle kit, more power. */
  function makeCar(spec, drift) {
    const s = Object.assign({}, spec);
    const hp = stockHp(s);
    s.pwr = 1; s.muF = 1; s.muR = 1; s.C = 1.4; s.ack = !drift;
    if (drift) {
      s.drive = 'RWD'; s.lock = 1; s.steer = 54; s.muF = 1.06; s.muR = 0.95; s.C = 1.32;
      s.pwr = Math.max(1.25, 0.24 * s.m / hp);
    }
    s.hp = Math.round(hp * s.pwr); s.drift = !!drift;
    s.B = Math.tan(Math.PI / (2 * s.C));           // puts the force peak at normalised slip 1
    s.kp = 0.11; s.tap = Math.tan(8.5 * Math.PI / 180);
    s.a = s.wb * (1 - s.fw); s.b = s.wb * s.fw; s.Izz = s.m * s.a * s.b;
    s.steerRad = s.steer * Math.PI / 180;
    s.fShare = s.drive === 'FWD' ? 1 : s.drive === 'RWD' ? 0 : 1 - s.rearShare;
    s.tqMax = Math.max(...s.tq.map((p) => p[1]));
    s.launch = clamp(0.5 * s.redline, 2500, 4000);
    s.brakeT = s.m * G * 1.15 * s.R; s.hbT = s.m * G * 0.6 * s.R;
    s.Iw = 1.1; s.Ie = 0.18; s.rollF = 0.56;
    return { spec: s, x: 0, y: 0, psi: 0, vx: 0, vy: 0, r: 0, w: [0, 0, 0, 0], steer: 0, gear: 1, rpm: s.idle,
      thr: 0, brk: 0, axf: 0, ayf: 0, anf: 0, h: 0, vh: 0, vgPrev: 0, fresh: true, air: false, gap: 0, fall: 0, land: 0,
      pitch: 0, roll: 0, cut: 0, shiftT: 0, shiftCd: 0, manual: false,
      u: 0, v: 0, speed: 0, beta: 0, slip: [0, 0, 0, 0], Fz: [0, 0, 0, 0], surf: [1, 1, 1, 1], hh: [0, 0, 0, 0] };
  }

  const T = { fx: 0, fy: 0 };
  function tire(vxw, vyw, wR, Fz, mu, kp, tap, B, C) {
    if (Fz <= 0) { T.fx = T.fy = 0; return; }
    const ax = Math.abs(vxw);
    const sx = (wR - vxw) / Math.max(ax, 2.0) / kp;
    const sy = vyw / Math.max(ax, 1.5) / tap;
    const rho = Math.hypot(sx, sy);
    if (rho < 1e-9) { T.fx = T.fy = 0; return; }
    const F = mu * Fz * Math.sin(C * Math.atan(B * rho)) / rho;
    T.fx = F * sx * 1.08; T.fy = -F * sy;             // tyres make a little more grip fore-aft than sideways
  }

  /** Drive force (N) in gear index k at the speed that gives rpmV in gear index cur, at pedal thr (engine braking included, as in step). */
  function pull(s, rpmV, cur, k, thr) {
    const rpm = rpmV * s.gears[k] / s.gears[cur];
    return (torqueAt(s, rpm) * s.pwr * thr - s.tqMax * 0.14 * (rpm / s.redline) * (1 - thr)) * s.gears[k] * s.final * 0.9 / s.R;
  }

  function shift(c, dir) {
    const g = c.gear + dir;
    if (g < 1 || g > c.spec.gears.length || c.gear < 1) return;
    c.gear = g; c.shiftT = 0.16; c.shiftCd = 0.55;
  }

  const X = [0, 0, 0, 0], Y = [0, 0, 0, 0], Tdrv = [0, 0, 0, 0], Iw = [0, 0, 0, 0], Tb = [0, 0, 0, 0];

  /** Advance one step. inp: {steer -1..1 (left +), gas 0..1, brake 0..1, handbrake 0..1, assist bool}.
      env: {height(x,y), surface(x,y)}. */
  function step(c, inp, dt, env) {
    const s = c.spec;
    const cs = Math.cos(c.psi), sn = Math.sin(c.psi);
    const u = c.vx * cs + c.vy * sn, v = -c.vx * sn + c.vy * cs;
    const speed = Math.hypot(u, v);

    // pedals: brake at a standstill selects reverse, gas selects drive again
    let gas = inp.gas, brake = inp.brake;
    if (c.gear > 0) { if (brake > 0.1 && gas < 0.1 && speed < 0.6 && !(inp.handbrake > 0.1)) c.gear = -1; }   // speed, not u: never mid-spin
    else if (gas > 0.1 && brake < 0.1 && u > -0.6) c.gear = 1;
    if (c.gear < 0) { const t = gas; gas = brake; brake = t; }
    c.thr += clamp(gas - c.thr, -dt * 9, dt * 6);
    c.brk += clamp(brake - c.brk, -dt * 12, dt * 7);

    // steering: speed-sensitive input; once the car slides, the front wheels self-align with the direction of
    // travel (caster) and a gyro term damps yaw, so keyboard input sets the front slip angle rather than fighting a spin.
    // This stands in for self-aligning torque, so it stays on with assists off (they only gate the throttle trims below)
    const beta = Math.atan2(v, Math.max(Math.abs(u), 1.5));
    const v2 = speed * speed, sF = (SURF[c.surf[0]].soft + SURF[c.surf[1]].soft) / 2;
    // a full input (any key press) asks for the angle that turns tightest: full lock up to ~15 mph, then the circle the grip allows
    // (wb / R) plus a few degrees of front slip, more on loose ground. Past that the fronts only scrub: the old curve (gain) asked
    // for twice that at 30-60 mph and understeered. Part stick keeps the old gain, so a pad answers as before until it reaches the cap
    // ponytail: wb / R assumes asphalt grip (loose ground only widens the slip margin); use the fronts' SURF mu if grass steering feels eager
    const grip = Math.min(s.steerRad, Math.atan(s.wb * 0.9 * G * s.mu / Math.max(v2, 0.01)) + 0.12 * sF / (1 + v2 / 900));
    const gain = Math.max(grip, (s.steerRad + (Math.min(s.steerRad, 0.64) - s.steerRad) * clamp((speed - 4) / 10, 0, 1)) / (1 + v2 / 324));
    const dirR = Math.atan2(v - s.b * c.r, Math.max(u, 1.5));          // rear-axle slip: how far the tail is out
    const tail = v * (v - s.b * c.r) > 0 ? Math.abs(beta) : 0;          // the nose-in attitude of a tight slow turn is not a slide
    const sliding = u > 2 ? clamp((tail - 0.045) / 0.07, 0, 1) * clamp((speed - 3) / 4, 0, 1) : 0;
    // steering into the slide's direction of travel unlocks more lock, so opposite lock is there without assists too
    let target = clamp(inp.steer * gain, -grip, grip) + (inp.steer * dirR > 0 ? inp.steer * 1.3 * Math.max(0, Math.abs(dirR) - 0.14) : 0);
    // sliding: a held key asks for ~7 deg of front slip into (or against) the slide instead of full lock.
    // The yaw damping eases off while the car swings back through straight (r and beta same sign), so a flick swaps sides
    if (sliding > 0) target = target * (1 - sliding) + sliding * (inp.steer * 0.12 + Math.atan2(v + s.a * c.r, Math.max(u, 1.5)) - (c.r * beta > 0 ? 0.06 : 0.20) * c.r);
    target = clamp(target, -s.steerRad, s.steerRad);
    c.steer += clamp(target - c.steer, -dt * 8, dt * 8);

    // wheel positions + terrain
    const ht = s.track / 2;
    X[0] = X[1] = s.a; X[2] = X[3] = -s.b; Y[0] = Y[2] = ht; Y[1] = Y[3] = -ht;
    const hh = c.hh;
    for (let i = 0; i < 4; i++) {
      const wx = c.x + X[i] * cs - Y[i] * sn, wy = c.y + X[i] * sn + Y[i] * cs;
      hh[i] = env.height(wx, wy); c.surf[i] = env.surface(wx, wy);
    }
    const hF = (hh[0] + hh[1]) / 2, hR = (hh[2] + hh[3]) / 2;
    const slopeF = (hF - hR) / s.wb, slopeL = ((hh[0] + hh[2]) - (hh[1] + hh[3])) / (2 * s.track);
    const ground = hR + slopeF * s.b;

    // vertical: follow the ground unless the ballistic path stays above it (crests, drops)
    if (c.fresh) { c.h = ground; c.vh = 0; c.vgPrev = 0; c.fresh = false; }
    const hb = c.h + c.vh * dt - 0.5 * G * dt * dt;
    let nload;
    if (hb > ground) {
      c.h = hb; c.vh -= G * dt; c.gap = hb - ground; c.fall = Math.max(c.fall, c.gap);
      c.anf += (0 - c.anf) * Math.min(1, dt / 0.12);
    } else {
      const vg = (ground - c.h) / dt;
      if (c.fall > 0.12) c.land = Math.max(c.land, (ground - (c.h - c.gap)) / dt - c.vh);   // closing speed at touchdown
      c.fall = 0;
      c.anf += (clamp((vg - c.vgPrev) / dt, -30, 30) - c.anf) * Math.min(1, dt / 0.12);
      c.h = ground; c.vh = vg; c.vgPrev = vg; c.gap = 0;
    }
    c.air = c.gap > 0.09;
    nload = c.air ? 0 : clamp(1 + c.anf / G, 0.35, 2.2) * (1 - c.gap / 0.09);

    // wheel loads
    const Wt = s.m * G * nload;
    const ltx = s.m * c.axf * s.hcg / s.wb / 2;
    const ltf = s.m * c.ayf * s.hcg * s.rollF / s.track, ltr = s.m * c.ayf * s.hcg * (1 - s.rollF) / s.track;
    const Fz = c.Fz;
    Fz[0] = Math.max(0, Wt * s.fw / 2 - ltx - ltf); Fz[1] = Math.max(0, Wt * s.fw / 2 - ltx + ltf);
    Fz[2] = Math.max(0, Wt * (1 - s.fw) / 2 + ltx - ltr); Fz[3] = Math.max(0, Wt * (1 - s.fw) / 2 + ltx + ltr);
    const FzNom = s.m * G / 4;

    // drivetrain
    const fShare = s.fShare, rShare = 1 - fShare;
    const ratio = (c.gear > 0 ? s.gears[c.gear - 1] : -s.gears[0]) * s.final;
    const wd = fShare > 0 && rShare > 0 ? (c.w[0] + c.w[1] + c.w[2] + c.w[3]) / 4
      : fShare > 0 ? (c.w[0] + c.w[1]) / 2 : (c.w[2] + c.w[3]) / 2;
    const rpmW = wd * ratio * 30 / Math.PI;
    const launch = s.idle + c.thr * (s.launch - s.idle);
    const rpm = Math.max(rpmW, launch);
    const hbOn = inp.handbrake > 0.1;
    // throttle assists for on/off (keyboard) throttle: trim wheelspin when driving straight, back off before a spin
    let thr = c.thr;
    // factory speed limiter: the real car's governed (or tyre-rated) top speed in mph, vgov in CARS; fuel fades out over the last 1.5 m/s
    if (s.vgov && c.gear > 0) thr *= clamp((s.vgov / 2.23694 - u) / 1.5, 0, 1);
    const thrE = thr;                                   // engine braking follows the pedal (and limiter), not the traction trims below
    if (inp.assist !== false) {
      const iD = rShare > 0 ? 2 : 0, vD = Math.max(Math.abs(u), 2);
      const kD = Math.sign(c.gear) * ((c.w[iD] + c.w[iD + 1]) / 2 * s.R - u) / vD;
      // open = how much wheelspin the driver is asking for: steering hard (rear drive only: spinning front tyres just plough), or already
      // well sideways (in reverse only a little, to turn a welded axle)
      const turn = rShare > 0 ? clamp(Math.abs(inp.steer) * 2 - 0.6, 0, 1) : 0;
      const open = c.gear < 0 ? 0.3 * turn : Math.max(sliding > 0 ? clamp((Math.abs(beta) - 0.2) / 0.15, 0, 1) : 0, turn);
      // traction control holds the driven tyres at their peak slip, which loose ground puts later (SURF soft): about 11 % on asphalt,
      // 19 % on gravel, 25 % on grass, so the tyres dig
      const lo = (SURF[c.surf[iD]].soft + SURF[c.surf[iD + 1]].soft) / 2 - 1;      // 0 asphalt, 0.5 gravel, 0.8 grass
      thr *= clamp(1 - (kD - (0.08 + 0.14 * lo) - 1.33 * open) / (0.06 + 0.06 * lo + 0.2 * open), 0.1, 1);
      // spin protection: cut power as the slip angle nears what the steering lock can still catch (~48 deg on an angle kit)
      if (c.gear > 0 && c.r * beta < 0) thr *= 1 - 0.9 * clamp((Math.abs(beta) - (s.steerRad - 0.1)) / 0.3, 0, 1);
      // stability: tail stepping out while the driver is not asking for a slide -> ease off so the rear tyres can grip sideways.
      // Loose ground runs bigger slip angles before the tyre gives up (soft), and below a jog there is no spin to catch
      const sR = (SURF[c.surf[2]].soft + SURF[c.surf[3]].soft) / 2;
      if (c.gear > 0) thr *= 1 - 0.85 * (1 - open) * clamp((Math.abs(dirR) - 0.02 * sR) / (0.04 * sR), 0, 1) * clamp((speed - 3) / 4, 0, 1);
    }
    let Te = torqueAt(s, rpm) * s.pwr * thr;
    if (rpm > s.redline) c.cut = 0.06;
    if (c.cut > 0) { c.cut -= dt; Te = 0; }
    if (c.shiftT > 0) { c.shiftT -= dt; Te = 0; }
    if (rpmW >= launch) Te -= s.tqMax * 0.14 * (rpm / s.redline) * (1 - thrE);
    const declutch = hbOn && rShare > 0;               // handbrake kicks the clutch on rear-driven cars
    if (declutch) Te = 0;
    const Tw = Te * ratio * 0.9, Ie = declutch ? 0 : s.Ie * ratio * ratio;
    Tdrv[0] = Tdrv[1] = Tw * fShare / 2; Tdrv[2] = Tdrv[3] = Tw * rShare / 2;
    Iw[0] = Iw[1] = s.Iw + Ie * fShare / 2; Iw[2] = Iw[3] = s.Iw + Ie * rShare / 2;
    c.rpm += (clamp(rpm, s.idle, s.redline + 150) - c.rpm) * Math.min(1, dt / 0.05);

    // automatic gearbox (holds the gear while sliding so drifts are not interrupted). Uphill it only upshifts into a gear that still
    // pulls against the road load (or at the limiter), and a part-throttle climb that bogs down kicks down before the engine lugs,
    // so the box neither short-shifts nor hunts on a hill
    c.shiftCd -= dt;
    c.hbK = hbOn ? 0.7 : Math.max(0, (c.hbK || 0) - dt);   // handbrake entry scrubs speed: don't let that kick down into the limiter
    if (!c.manual && c.gear > 0 && c.shiftCd <= 0 && !c.air) {
      const rpmV = speed / s.R * ratio * 30 / Math.PI;     // rpm without wheelspin: spinning tyres don't cause upshifts
      const hold = Math.abs(beta) > 0.2 && speed > 6;
      c.limT = Math.max(0, (c.limT || 0) + (rpmW > 0.9 * s.redline ? dt : -2 * dt));   // sitting on the limiter mid-slide: grab the next gear
      c.liftT = c.thr < 0.5 ? (c.liftT || 0) + dt : 0;                  // short lifts keep the gear; cruising upshifts early
      // ponytail: road load = slope + one tyre's base rr + aero, only above a 3 % grade (flat-road shifts are as they were), and blind to
      // traction control, so a part-throttle grass climb can still cycle slowly off the limiter; a real grade/shift map if that matters
      const climb = slopeF > 0.03, load = s.m * G * (slopeF + SURF[c.surf[2]].rr) + 0.5 * RHO * s.cda * speed * speed;
      const pulls = !climb || c.gear >= s.gears.length || c.thr < 0.05 || pull(s, rpmV, c.gear - 1, c.gear, c.thr) > 1.1 * load;
      if (((rpmV > s.redline * (hold ? 0.985 : c.liftT > 1.5 ? 0.55 + 0.38 * c.thr : 0.93) && (hold || pulls)) || rpmV > 0.985 * s.redline || (hold && c.limT > 0.7)) && c.gear < s.gears.length) { shift(c, 1); c.limT = 0; }
      else if (c.gear > 1) {
        const down = (hold ? Math.max(rpmV, rpmW) : rpmV) * s.gears[c.gear - 2] / s.gears[c.gear - 1];
        if (rpmV < s.idle * 1.5 + 300 || (c.thr > 0.7 && !(c.hbK > 0 && rpmV > 0.4 * s.redline) && down < (hold ? 0.62 : 0.8) * s.redline)
          || (climb && c.thr > 0.25 && !hold && down < 0.7 * s.redline && pull(s, rpmV, c.gear - 1, c.gear - 1, c.thr) < load)) shift(c, -1);
      }
    }

    // brakes
    const bT = c.brk * s.brakeT;
    Tb[0] = Tb[1] = bT * 0.64 / 2; Tb[2] = Tb[3] = bT * 0.36 / 2 + inp.handbrake * s.hbT;

    // tyres
    let FX = 0, FY = 0, MZ = 0;
    // Ackermann: each front wheel aims at the turn centre that c.steer (the angle at the axle's middle) implies, so the inner wheel
    // turns further and a tight turn does not scrub the fronts against each other. Stock cars only, and it fades to parallel steer in a
    // slide, where it would cost counter-steer (the drift build's angle kit is parallel)
    const tn = Math.tan(c.steer), ak = s.ack ? 1 - sliding : 0;
    const dL = c.steer + ak * (Math.atan2(s.wb * tn, s.wb - ht * tn) - c.steer), dR = c.steer + ak * (Math.atan2(s.wb * tn, s.wb + ht * tn) - c.steer);
    for (let i = 0; i < 4; i++) {
      const d = i === 0 ? dL : i === 1 ? dR : 0, cd = Math.cos(d), sd = Math.sin(d);
      const ux = u - c.r * Y[i], vy = v + c.r * X[i];
      const vxw = ux * cd + vy * sd, vyw = -ux * sd + vy * cd;
      const sf = SURF[c.surf[i]];
      const mu = s.mu * (i < 2 ? s.muF : s.muR) * sf.mu * clamp(1 - 0.15 * (Fz[i] / FzNom - 1), 0.7, 1.12);
      const kp = s.kp * sf.soft, tap = s.tap * sf.soft, wR = c.w[i] * s.R;
      tire(vxw, vyw, wR + 0.05 * s.R, Fz[i], mu, kp, tap, s.B, s.C);
      const fx1 = T.fx;
      tire(vxw, vyw, wR, Fz[i], mu, kp, tap, s.B, s.C);
      const fx = T.fx, fy = T.fy, dF = Math.max(0, (fx1 - fx) / 0.05);
      c.slip[i] = Fz[i] > 0 ? Math.hypot(wR - vxw, vyw) : 0;

      // wheel spin, implicit in the tyre's longitudinal stiffness so it stays stable at low speed.
      // brake + rolling drag use the same effective inertia, so a free wheel settles at R*fx = -drag exactly
      const Ieff = Iw[i] + dt * s.R * dF;
      let wn = c.w[i] + dt * (Tdrv[i] - s.R * fx) / Ieff;
      if ((wR - vxw) * (wn * s.R - vxw) < 0 && Math.abs(wn * s.R - vxw) > kp * Math.max(Math.abs(vxw), 2)) wn = vxw / s.R;   // don't overshoot through the grip region
      let tb = Tb[i];
      if (i < 2 || !hbOn) { if ((wR - vxw) * Math.sign(vxw) < -0.13 * Math.max(Math.abs(vxw), 2) && speed > 3) tb *= 0.25; }  // ABS, either direction
      tb = (tb + (sf.rr + sf.rrv * Math.abs(vxw)) * Fz[i] * s.R) * dt / Ieff;
      if (Math.abs(wn) <= tb) wn = 0; else wn -= Math.sign(wn) * tb;
      c.w[i] = wn;

      const fxi = clamp(fx + dF * (wn - wR / s.R), -mu * Fz[i] * 1.08, mu * Fz[i] * 1.08);   // tyre force at the end of the step, matching the implicit wheel update
      const fxb = fxi * cd - fy * sd, fyb = fxi * sd + fy * cd;
      FX += fxb; FY += fyb; MZ += X[i] * fyb - Y[i] * fxb;
    }
    // differentials
    for (let ax = 0; ax < 2; ax++) {
      const share = ax === 0 ? fShare : rShare, i = ax * 2;
      if (share <= 0 || (ax === 1 && declutch)) continue;
      const avg = (c.w[i] + c.w[i + 1]) / 2, k = s.lock >= 1 ? 1 : 1 - Math.exp(-s.lock * 40 * dt);
      c.w[i] += (avg - c.w[i]) * k; c.w[i + 1] += (avg - c.w[i + 1]) * k;
    }

    if (fShare > 0 && rShare > 0 && !declutch) {          // AWD centre coupling (opens with the handbrake, like the clutch)
      const d = ((c.w[2] + c.w[3]) - (c.w[0] + c.w[1])) / 4 * (1 - Math.exp(-20 * dt));
      c.w[0] += d; c.w[1] += d; c.w[2] -= d; c.w[3] -= d;
    }

    // load-transfer accelerations come from tyre forces only, lagged like a sprung body
    const kf = Math.min(1, dt / 0.09);
    c.axf += (FX / s.m - c.axf) * kf; c.ayf += (FY / s.m - c.ayf) * kf;

    // aero drag + gravity along the slope
    const drag = 0.5 * RHO * s.cda * speed;
    FX -= drag * u; FY -= drag * v;
    if (!c.air) {
      FX -= s.m * G * slopeF / Math.sqrt(1 + slopeF * slopeF);
      FY -= s.m * G * slopeL / Math.sqrt(1 + slopeL * slopeL);
    }

    c.vx += (FX * cs - FY * sn) / s.m * dt; c.vy += (FX * sn + FY * cs) / s.m * dt;
    c.r += MZ / s.Izz * dt;
    if (c.thr < 0.02 && speed < 0.3 && Math.abs(c.r) < 0.12 && !c.air) { c.vx = c.vy = c.r = 0; c.w[0] = c.w[1] = c.w[2] = c.w[3] = 0; }
    c.x += c.vx * dt; c.y += c.vy * dt; c.psi += c.r * dt;

    // body attitude for rendering: ground plane + squat/dive/roll
    const ka = Math.min(1, dt / 0.07);
    if (!c.air) {
      c.pitch += (Math.atan(slopeF) + clamp(c.axf, -11, 11) * 0.007 - c.pitch) * ka;
      c.roll += (Math.atan(slopeL) + clamp(c.ayf, -11, 11) * 0.009 * (s.hcg / 0.55) - c.roll) * ka;
    }
    c.u = u; c.v = v; c.speed = speed; c.beta = beta;
    return c;
  }

  root.DriftPhysics = { CARS, SURF, makeCar, step, shift, torqueAt, G };
})(typeof window !== 'undefined' ? window : globalThis);
