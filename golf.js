/* golf.js — Bloomfield Drift: the golf gameplay at Phil Harris Golf Course (Linton). Adds BD.golf: a point-mass ball with
   backspin and sidespin (Magnus lift and curve), quadratic drag, a per-round wind with gusts, gravity, bounce and roll by surface
   and slope; the club set (loft, carry, spin: the launch speed of each club is calibrated at load so its flat no-wind carry equals
   the table); the 3-click swing meter (start, power 0-110 %, accuracy: off-centre = sidespin, left = hook, right = slice); the lie
   (tee, fairway, rough with flyers, bunker, slope) changes distance, launch and accuracy; putting mode (one power click, the green's
   slope grid with downhill arrows, a read-the-break line simulated with the same roll model); cameras behind the ball, free-look,
   ball-follow in flight and a top-down green camera (all through BD.game.cam); the golf HUD (club selector, distance to the pin
   and how it plays, wind, lie, hole/par/yards, stroke and score, meter, messages), the scorecard panel (M) with gross, net and
   handicap; rules (water = +1 and a drop: near the crossing or replay; OOB = stroke and distance; max strokes per hole, Options);
   modes: practice range, stroke play over 9 or 18 holes, match play against a computer opponent; the round is saved in progress.
   Reads BD.BLOOMFIELD_GOLF (holes) and BD.golfWorld (heights, surfaces, slopes); when they are missing it builds its own flat
   stub (one 380 m par 4 with green, fairway, rough, bunker and pond at the real course's position) so it runs alone.
   Public: BD.golf = { startRound({ holes: 9 | 18, mode: 'stroke' | 'match' | 'range', clubs }), inRound, endRound(), setClubs(list
   of club ids or a set name 'rental' | 'standard' | 'tour'), practice(), resume(), saved (a round in progress, or null), state
   (hole, holeIdx, par, stroke, card, phase, ball: [x, y] map metres, club, aim, putt, wind, ...), CLUBS, handicap(), debug }.
   Store keys (bd.golf.*): round (in progress), rounds (history: the handicap and the pro shop's scoreboard), max (max strokes), set.
   Keys: Space / pad A / SWING button = meter click, ← → (A D) aim, ↑ ↓ trajectory, 1-9 0 and [ ] clubs, P putt mode, C camera,
   M scorecard; mouse drag or right stick = free-look. Golf keys are taken in the capture phase while a round is on so the car,
   photo mode and the races panel do not react; Escape still pauses. BD.golf never moves the car. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {}), T = THREE;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), hyp = Math.hypot, TAU = Math.PI * 2, DEG = Math.PI / 180, RPM = TAU / 60, YD = 1.09361;
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const store = { get: (k, d) => (B.game ? B.game.store.get('golf.' + k, d) : d), set: (k, v) => { if (B.game) B.game.store.set('golf.' + k, v); } };
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;        // ponytail: 3-uniform bell, sd 1; Box-Muller if the tails matter
  function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const snd = (f, l, v) => { if (B.audio && B.audio.beep) B.audio.beep(f, l, v); };

  // ------------------------------------------------------------------ tunables
  // ball: USGA 45.93 g, 21.35 mm radius. K = rho A / 2m. Cd = cd0 + cdS * S, Cl = min(clMax, clK * S), S = R w / v (spin ratio).
  const PHYS = { g: 9.81, R: 0.02135, K: 1.225 * Math.PI * 0.02135 * 0.02135 / (2 * 0.04593), cd0: 0.24, cdS: 0.12, clK: 1.6, clMax: 0.32, spinDecay: 0.06, windK: 0.65, sideRpm: 1500, dt: 1 / 120 };      // windK: the wind the ball feels (reported wind is at 10 m; the flight is lower); sideRpm: sidespin at the worst meter miss x the club's side factor
  // surfaces: e = normal restitution, mu = sliding friction during the bounce (tangential loss mu (1+e) |vn|), keep = tangential
  // factor after that, grip = how much backspin bites on landing (x R w), roll = rolling deceleration m/s2 (green ~ stimp 9.5)
  const SURF = {
    green: { e: 0.38, mu: 0.4, keep: 0.72, grip: 0.22, roll: 0.62, name: 'Green' }, tee: { e: 0.45, mu: 0.4, keep: 0.75, grip: 0.15, roll: 2.6, name: 'Tee' },
    fairway: { e: 0.45, mu: 0.4, keep: 0.75, grip: 0.15, roll: 2.6, name: 'Fairway' }, rough: { e: 0.28, mu: 0.6, keep: 0.5, grip: 0.1, roll: 6.5, name: 'Rough' },
    bunker: { e: 0.12, mu: 0.8, keep: 0.3, grip: 0.05, roll: 9, name: 'Bunker' }, path: { e: 0.7, mu: 0.3, keep: 0.85, grip: 0.05, roll: 1.4, name: 'Cart path' },
    water: { e: 0, mu: 1, keep: 0, grip: 0, roll: 99, name: 'Water' }, oob: { e: 0.28, mu: 0.6, keep: 0.5, grip: 0.1, roll: 6.5, name: 'Out of bounds' },
  };
  // clubs: loft deg, launch deg, backspin rpm, full-power carry m (flat, no wind: v0 is solved for it at load), side = sidespin
  // sensitivity to a meter miss (driver most), wood / wedge flags for the sand rule
  const CLUBS = [
    { id: 'Dr', name: 'Driver', loft: 10.5, launch: 11.5, spin: 2600, carry: 230, side: 1.0, wood: true },
    { id: '3W', name: '3-wood', loft: 15, launch: 12.5, spin: 3400, carry: 212, side: 0.9, wood: true },
    { id: 'Hy', name: 'Hybrid', loft: 19, launch: 14, spin: 4000, carry: 192, side: 0.8, wood: true },
    { id: '4i', name: '4-iron', loft: 21, launch: 15, spin: 4500, carry: 175, side: 0.85 },
    { id: '5i', name: '5-iron', loft: 24, launch: 16.5, spin: 5000, carry: 163, side: 0.8 },
    { id: '6i', name: '6-iron', loft: 27, launch: 18, spin: 5600, carry: 152, side: 0.8 },
    { id: '7i', name: '7-iron', loft: 31, launch: 19.5, spin: 6400, carry: 140, side: 0.75 },
    { id: '8i', name: '8-iron', loft: 35, launch: 21.5, spin: 7200, carry: 128, side: 0.7 },
    { id: '9i', name: '9-iron', loft: 39, launch: 24, spin: 8000, carry: 116, side: 0.65 },
    { id: 'PW', name: 'Pitching wedge', loft: 45, launch: 27, spin: 8800, carry: 104, side: 0.6 },
    { id: 'SW', name: 'Sand wedge', loft: 55, launch: 31, spin: 9500, carry: 82, side: 0.5, wedge: true },
    { id: 'LW', name: 'Lob wedge', loft: 60, launch: 35, spin: 10000, carry: 62, side: 0.45, wedge: true },
    { id: 'Pt', name: 'Putter', loft: 3, launch: 0, spin: 0, carry: 0, side: 0 },
  ];
  const PT = CLUBS.length - 1, DIGITS = { Digit1: 'Dr', Digit2: '3W', Digit3: 'Hy', Digit4: '4i', Digit5: '5i', Digit6: '6i', Digit7: '7i', Digit8: '8i', Digit9: '9i', Digit0: 'PW' };
  // club sets (the pro shop sells them): aim = heading noise sd deg, dist = distance noise sd (fraction), bonus = distance factor
  const SETS = { rental: { aim: 1.3, dist: 0.045, bonus: 1, name: 'Rental set' }, standard: { aim: 0.75, dist: 0.025, bonus: 1.01, name: 'Standard set' }, tour: { aim: 0.4, dist: 0.015, bonus: 1.03, name: 'Tour set' } };
  const METER = { up: 1.1, low: -0.25, speed: 1.35, zone: 0.03 };          // the marker sweeps 0 -> 1.1 (power) then back down to -0.25 (accuracy); zone = perfect half-width
  const OPP = [[-1, 0.14], [0, 0.46], [1, 0.3], [2, 0.1]];                 // match play: the computer's score to par per hole
  const CUP = 0.054, PV_N = 480, TRAIL_N = 80, GRID_V = 48000;

  // ------------------------------------------------------------------ ball record (two: the ball and the preview; no per-step allocation)
  const mkBall = () => ({ x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, wx: 0, wy: 0, wz: 0, mode: 2, t: 0, n: 0, bounces: 0, x0: 0, y0: 0, landX: NaN, landY: NaN, carry: 0, tLand: 0, apex: 0, surf: 'fairway', dryX: NaN, dryY: NaN, cup: false, cupX: 0, cupY: 0 });
  const b = mkBall(), pb = mkBall();
  function launch(o, hd, v, el, back, side) {
    const cx = Math.cos(hd), cy = Math.sin(hd), ce = Math.cos(el);
    o.vx = v * ce * cx; o.vy = v * ce * cy; o.vh = v * Math.sin(el);
    o.wx = back * cy; o.wy = -back * cx; o.wz = side;           // backspin axis = d x up = (dy, -dx, 0); +side (up axis) curves left
    o.mode = 0; o.t = 0; o.n = 0; o.bounces = 0; o.x0 = o.x; o.y0 = o.y; o.landX = o.landY = NaN; o.carry = 0; o.tLand = 0; o.apex = o.h; o.dryX = o.dryY = NaN;
  }
  function roll(o, hd, v) { o.vx = v * Math.cos(hd); o.vy = v * Math.sin(hd); o.vh = 0; o.wx = o.wy = o.wz = 0; o.mode = 1; o.t = 0; o.n = 0; o.bounces = 0; o.x0 = o.x; o.y0 = o.y; o.landX = o.x; o.landY = o.y; o.carry = 0; o.apex = o.h; o.dryX = o.dryY = NaN; }
  // one integration step. flat: a level reference ground at h = 0 with no surfaces (calibration). wx, wy: the wind vector m/s.
  function step(o, dt, flat, wx, wy) {
    if (o.mode === 0) {
      const ax = o.vx - wx * PHYS.windK, ay = o.vy - wy * PHYS.windK, az = o.vh, va = Math.sqrt(ax * ax + ay * ay + az * az) + 1e-6;
      const w = Math.sqrt(o.wx * o.wx + o.wy * o.wy + o.wz * o.wz), S = PHYS.R * w / va, cd = PHYS.cd0 + PHYS.cdS * S, cl = Math.min(PHYS.clMax, PHYS.clK * S);
      let fx = -PHYS.K * cd * va * ax, fy = -PHYS.K * cd * va * ay, fz = -PHYS.K * cd * va * az - PHYS.g;
      if (w > 1) { const m = PHYS.K * cl * va / w; fx += m * (o.wy * az - o.wz * ay); fy += m * (o.wz * ax - o.wx * az); fz += m * (o.wx * ay - o.wy * ax); }
      o.vx += fx * dt; o.vy += fy * dt; o.vh += fz * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.h += o.vh * dt; o.t += dt;
      const dec = 1 - PHYS.spinDecay * dt; o.wx *= dec; o.wy *= dec; o.wz *= dec;
      if (o.h > o.apex) o.apex = o.h;
      const g = flat ? 0 : GW.heightAt(o.x, o.y);
      if (o.h - PHYS.R < g) contact(o, g, flat);
      else if (!flat && (o.n++ & 7) === 0) { const s = GW.surfaceAt(o.x, o.y); if (s !== 'water' && s !== 'oob') { o.dryX = o.x; o.dryY = o.y; } }
      if (o.t > 30) o.mode = 2;
    } else if (o.mode === 1) {
      let sx = 0, sy = 0; if (!flat) { const s = GW.slopeAt(o.x, o.y); sx = s[0]; sy = s[1]; }
      const P = SURF[o.surf] || SURF.rough, sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy), gs = 5 / 7 * PHYS.g;
      let ax = -gs * sx, ay = -gs * sy; const gm = Math.sqrt(ax * ax + ay * ay);
      if (sp < 0.12 && gm < P.roll) { o.vx = o.vy = 0; o.mode = 2; return; }
      if (sp > 1e-4) { ax -= P.roll * o.vx / sp; ay -= P.roll * o.vy / sp; }
      const nvx = o.vx + ax * dt, nvy = o.vy + ay * dt;
      if (nvx * o.vx + nvy * o.vy < 0 && gm < P.roll) { o.vx = o.vy = 0; o.mode = 2; return; }      // friction turned it round: it stops
      o.vx = nvx; o.vy = nvy; o.x += o.vx * dt; o.y += o.vy * dt; o.t += dt;
      o.h = (flat ? 0 : GW.heightAt(o.x, o.y)) + PHYS.R;
      if (!flat) {
        if ((o.n++ & 7) === 0) { const s = GW.surfaceAt(o.x, o.y); if (s === 'water') { o.mode = 3; return; } o.surf = s; if (s !== 'oob') { o.dryX = o.x; o.dryY = o.y; } }
        if (o.cup && hyp(o.x - o.cupX, o.y - o.cupY) < CUP && sp < 1.7) { o.mode = 4; o.x = o.cupX; o.y = o.cupY; o.h -= 0.1; return; }     // faster: lips out and rolls on
      }
      if (o.t > 60) o.mode = 2;
    }
  }
  function contact(o, g, flat) {
    let sx = 0, sy = 0, surf = 'fairway';
    if (!flat) { const s = GW.slopeAt(o.x, o.y); sx = s[0]; sy = s[1]; surf = GW.surfaceAt(o.x, o.y); }
    o.surf = surf; if (surf === 'water') { o.mode = 3; o.h = g; return; }
    if (surf !== 'oob') { o.dryX = o.x; o.dryY = o.y; }
    if (Number.isNaN(o.landX)) { o.landX = o.x; o.landY = o.y; o.carry = hyp(o.x - o.x0, o.y - o.y0); o.tLand = o.t; }
    const P = SURF[surf] || SURF.rough, inv = 1 / Math.sqrt(sx * sx + sy * sy + 1), nx = -sx * inv, ny = -sy * inv, nz = inv;
    const vn = o.vx * nx + o.vy * ny + o.vh * nz; o.h = g + PHYS.R + 1e-3;
    if (vn >= 0) return;
    const sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy + o.vh * o.vh);
    if (!flat && o.cup && sp < 4 && hyp(o.x - o.cupX, o.y - o.cupY) < CUP * 1.2) { o.mode = 4; o.x = o.cupX; o.y = o.cupY; o.h = g - 0.08; return; }     // a chip that drops
    let tx = o.vx - vn * nx, ty = o.vy - vn * ny, tz = o.vh - vn * nz; const vt = Math.sqrt(tx * tx + ty * ty + tz * tz);
    let vt2 = Math.max(0, vt - P.mu * (1 + P.e) * -vn) * P.keep - P.grip * PHYS.R * Math.sqrt(o.wx * o.wx + o.wy * o.wy);
    vt2 = Math.max(vt2, -2.5);                                   // heavy backspin on a soft green draws the ball back a little
    if (vt > 1e-4) { const f = vt2 / vt; tx *= f; ty *= f; tz *= f; } else tx = ty = tz = 0;
    const vn2 = -vn * P.e; o.wx *= 0.45; o.wy *= 0.45; o.wz *= 0.6; o.bounces++;
    if (vn2 < 0.6 || o.bounces > 12) { o.mode = 1; o.vx = tx; o.vy = ty; o.vh = 0; o.h = g + PHYS.R; }
    else { o.vx = tx + vn2 * nx; o.vy = ty + vn2 * ny; o.vh = tz + vn2 * nz; }
    if (!flat && o === b && -vn > 2) snd(100 + Math.min(80, -vn * 3), 0.03, Math.min(0.25, -vn * 0.012));
  }
  // flat no-wind flight of a club at power p (0..1.1), straight: { carry, total, time, apex, side (m, + left) }; also calibration
  const simOut = { carry: 0, total: 0, time: 0, apex: 0, side: 0 };
  function simFlat(c, p, wx, wy, err, back, elev) {
    pb.x = pb.y = 0; pb.h = PHYS.R;
    launch(pb, 0, c.v0 * Math.pow(Math.max(p || 1, 0.02), 0.62), (elev === undefined ? c.launch : elev) * DEG, (back === undefined ? c.spin : back) * RPM, -clamp((err || 0) / 0.25, -1, 1) * c.side * PHYS.sideRpm * RPM);
    pb.surf = 'fairway'; let n = 0; while (pb.mode < 2 && n++ < 8000) step(pb, 1 / 120, true, wx || 0, wy || 0);
    simOut.carry = pb.carry; simOut.total = hyp(pb.x, pb.y); simOut.time = pb.tLand || pb.t; simOut.apex = pb.apex; simOut.side = pb.y; return simOut;
  }
  function calibrate() {                      // v0 per club: bisection so the flat carry equals the table (runs once, ~10 ms)
    for (const c of CLUBS) { if (c.id === 'Pt') { c.v0 = 0; continue; } let lo = 15, hi = 100; for (let i = 0; i < 22; i++) { c.v0 = (lo + hi) / 2; if (simFlat(c, 1).carry < c.carry) lo = c.v0; else hi = c.v0; } c.v0 = (lo + hi) / 2; }
  }

  // ------------------------------------------------------------------ stub course and world (used only while the course engineer's files are missing)
  function stubCourse() {
    const tx = -16040, ty = 1210, gx = -15660, gy = 1210;
    const circ = (cx, cy, r, n) => { const p = []; for (let i = 0; i < n; i++) p.push([cx + r * Math.cos(i / n * TAU), cy + r * Math.sin(i / n * TAU)]); return p; };
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const hole = { n: 1, par: 4, yards: Math.round(380 * YD), tee: [tx, ty], tees: [{ name: 'white', p: [tx, ty] }], path: [[tx, ty], [gx, gy]], green: { c: [gx, gy], poly: circ(gx, gy, 13, 24) }, pin: [gx + 3, gy + 2], fairway: [rect(tx + 35, ty - 16, gx - 18, ty + 16)], bunkers: [circ(gx - 14, gy - 14, 5, 16)], water: [rect(tx + 200, ty - 42, tx + 245, ty - 14)], teePoly: rect(tx - 4, ty - 4, tx + 4, ty + 4) };
    return { name: 'Stub par 4', stub: true, rect: { x0: tx - 60, y0: ty - 180, x1: gx + 60, y1: ty + 80 }, holes: [hole], range: { tee: [tx, ty - 120], poly: rect(tx + 20, ty - 160, tx + 290, ty - 80), yardMarkers: [[tx + 91, ty - 120, 100], [tx + 137, ty - 120, 150], [tx + 183, ty - 120, 200], [tx + 229, ty - 120, 250]] }, course: rect(tx - 40, ty - 170, gx + 40, ty + 60), clubhouse: null, carpark: [], cartPaths: [], cartSpots: [], entrance: [], trees: [] };
  }
  function stubWorld(C, W, scene) {
    const real = !C.stub, h = C.holes[0], r = C.rect, gc = h.green.c, sl = [0, 0]; let h0 = -1e9, H;
    if (real) H = (x, y) => W.heightXZ(x, -y);                       // real course data without BD.golfWorld: the corridor's own 4 m terrain carries the ball
    else { for (let x = r.x0; x <= r.x1; x += 15) for (let y = r.y0; y <= r.y1; y += 15) h0 = Math.max(h0, W.heightXZ(x, -y)); h0 += 0.3;
      H = (x, y) => { const d = hyp(x - gc[0], y - gc[1]), t = clamp((15.5 - d) / 2.5, 0, 1), w = t * t * (3 - 2 * t); return h0 + 0.02 * (y - gc[1]) * w; }; }      // flat, with a 2 % tilt on the green (break to test the putting aids)
    const inRange = (x, y) => !!(C.range && C.range.poly && inPoly(x, y, C.range.poly));
    const surfaceAt = (x, y) => {      // ponytail: point-in-polygon over every hole (18 x a few polys, called ~25 Hz); BD.golfWorld's raster replaces it
      if (!inPoly(x, y, C.course) && !inRange(x, y)) return 'oob';
      if (C.range && hyp(x - C.range.tee[0], y - C.range.tee[1]) < 5) return 'tee';
      for (const k of C.holes) {
        for (const p of k.water) if (inPoly(x, y, p)) return 'water';
        if (inPoly(x, y, k.green.poly)) return 'green';
        for (const p of k.bunkers) if (inPoly(x, y, p)) return 'bunker';
        if (k.teePoly ? inPoly(x, y, k.teePoly) : hyp(x - k.tee[0], y - k.tee[1]) < 5) return 'tee';
        for (const p of k.fairway) if (inPoly(x, y, p)) return 'fairway';
      }
      return inRange(x, y) ? 'fairway' : 'rough';
    };
    // drawing: the stub hole's flat lawns above the corridor's own ground; on real data only poles and flags at the pins
    const g = new T.Group(), mat = (hex) => new T.MeshStandardMaterial({ color: lin(hex), roughness: 0.95 }), flags = [];
    const shape = (poly, hex, dh, hole) => { const s = new T.Shape(poly.map((p) => new T.Vector2(p[0], p[1]))); if (hole) s.holes.push(new T.Path(hole.map((p) => new T.Vector2(p[0], p[1])))); const m = new T.Mesh(new T.ShapeGeometry(s), mat(hex)); m.rotation.x = -Math.PI / 2; m.position.y = h0 + dh; g.add(m); };
    if (!real) {
      const ring = []; for (let i = 0; i < 48; i++) ring.push([gc[0] + 15.5 * Math.cos(i / 48 * TAU), gc[1] + 15.5 * Math.sin(i / 48 * TAU)]);
      shape([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], 0x4e7a2a, -0.012, ring);
      for (const p of h.fairway) shape(p, 0x5f9a30, -0.006); if (C.range && C.range.poly) shape(C.range.poly, 0x5f9a30, -0.006); if (h.teePoly) shape(h.teePoly, 0x6aa838, -0.002);
      for (const p of h.bunkers) shape(p, 0xd9c48a, -0.002); for (const p of h.water) shape(p, 0x3a6f9c, -0.003);
      const cg = new T.CircleGeometry(15.5, 48, 0, TAU), ca = cg.attributes.position; for (let i = 0; i < ca.count; i++) ca.setZ(i, H(gc[0] + ca.getX(i), gc[1] + ca.getY(i)) - h0 + 0.002); cg.computeVertexNormals();
      const gm = new T.Mesh(cg, mat(0x6fb33a)); gm.rotation.x = -Math.PI / 2; gm.position.set(gc[0], h0, -gc[1]); g.add(gm);
      if (C.range && C.range.yardMarkers) for (const m of C.range.yardMarkers) { const p = new T.Mesh(new T.BoxGeometry(0.3, 0.9, 0.3), mat(0xffffff)); p.position.set(m[0], h0 + 0.4, -m[1]); g.add(p); }
    }
    const pole = new T.CylinderGeometry(0.02, 0.025, 2.2, 6), cloth = new T.PlaneGeometry(0.5, 0.32), poleM = mat(0xeeeeee), clothM = new T.MeshStandardMaterial({ color: lin(0xc8202b), side: T.DoubleSide });
    for (const k of C.holes) { const flag = new T.Group(); flag.add(new T.Mesh(pole, poleM).translateY(1.1)); const fl = new T.Mesh(cloth, clothM); fl.position.set(0.27, 2.0, 0); flag.add(fl); flag.position.set(k.pin[0], H(k.pin[0], k.pin[1]), -k.pin[1]); g.add(flag); flags[k.n] = flag; }
    scene.add(g);
    return { stub: true, ready: true, heightAt: H, surfaceAt, inCourse: (x, y) => inPoly(x, y, C.course), collide: () => null, flag: (n, v) => { if (flags[n]) flags[n].visible = v !== false; },
      slopeAt: (x, y) => { sl[0] = (H(x + 0.25, y) - H(x - 0.25, y)) * 2; sl[1] = (H(x, y + 0.25) - H(x, y - 0.25)) * 2; return sl; } };
  }

  // ------------------------------------------------------------------ state
  let W, scene, C, GW, G, el = null, built = false, errOnce = false, lateReg = false, hudT = 0, pvDirty = true, gridHole = -1, acc = 0, holdT = 0, camOwned = false, aimWas = false, camMode = 0, lastTarget = null;
  const R = { on: false, mode: 'stroke', holesN: 18, holeIdx: 0, hole: null, stroke: 0, card: [], opp: [], par: 0, phase: 'off', club: 0, aim: 0, traj: 0, power: 1, err: 0, putt: false, wind: { spd: 0, dir: 0 }, ball: [0, 0], set: 'rental', clubs: CLUBS.map((c) => c.id), t: 0, prev: [0, 0, 0], lieF: 1, msg: '', shotDir: 0, pen: 0, last: { carry: 0, total: 0 }, done: false };
  const M = { v: 0 }, cam = [0, 0, 0, 0, 0, 0, 55], fl = { yaw: 0, pitch: 0.22, dist: 6 }, cp = { x: 0, y: 0, h: 0, ok: false }, held = new Set(), padPrev = new Uint8Array(16), tmp = { x: 0, y: 0 };
  const padMap = { KeyA: 'ArrowLeft', KeyD: 'ArrowRight', KeyW: 'ArrowUp', KeyS: 'ArrowDown' };

  const hole = () => R.hole, pin = () => (R.mode === 'range' ? C.range.tee : R.hole.pin);
  const distPin = () => { const p = pin(); return hyp(p[0] - b.x, p[1] - b.y); };
  const maxStrokes = () => +store.get('max', 10) || 0;
  const near = () => { const p = B.player; if (!p || p.onFoot === undefined) return true; return !!p.onFoot && !!p.pos && hyp(p.pos[0] - b.x, p.pos[1] - b.y) <= 3.2; };
  const groundAt = (x, y) => (x >= C.rect.x0 && x <= C.rect.x1 && y >= C.rect.y0 && y <= C.rect.y1 ? GW.heightAt(x, y) : W.heightXZ(x, -y));
  const windNow = () => { const g = 1 + 0.22 * Math.sin(R.t * 0.7) + 0.13 * Math.sin(R.t * 1.9 + 1); tmp.x = Math.cos(R.wind.dir) * R.wind.spd * g; tmp.y = Math.sin(R.wind.dir) * R.wind.spd * g; return tmp; };
  const lieFactor = (surf, c) => (surf === 'tee' ? 1.03 : surf === 'rough' ? 0.885 : surf === 'bunker' ? (c.wood ? 0.4 : c.wedge ? 0.7 : 0.6) : 1);

  // ------------------------------------------------------------------ round flow
  function startRound(o) {
    o = o || {}; if (R.on) endRound(true);
    R.mode = o.mode === 'range' || o.mode === 'match' ? o.mode : 'stroke'; R.holesN = R.mode === 'range' ? 0 : Math.min(C.holes.length, o.holes === 9 ? 9 : 18);
    if (o.clubs) setClubs(o.clubs);
    R.wind.spd = Math.random() * 8; R.wind.dir = Math.random() * TAU; R.card.length = 0; R.opp.length = 0; R.holeIdx = 0; R.t = 0; R.done = false; R.on = true; R.traj = 0;
    document.getElementById('hud').classList.add('golf'); el.root.hidden = false;
    if (R.mode === 'range') { R.hole = { n: 0, par: 0, yards: 0, pin: C.range.tee, path: [C.range.tee] }; placeBall(C.range.tee[0], C.range.tee[1]); R.stroke = 0; R.phase = 'walk'; R.putt = false; selClub(0); const ym = C.range.yardMarkers, far = ym && ym.length ? ym[ym.length - 1] : null; R.hole.aim = far ? aimAt(far) : 0; R.aim = R.hole.aim; pvDirty = true; toast('Practice range: hit away'); }
    else startHole(0);
    camMode = 0; cp.ok = false; save();
  }
  function startHole(i) {
    R.holeIdx = i; R.hole = C.holes[i]; R.stroke = 0; R.putt = false; R.traj = 0; R.pen = 0; if (el) el.drop.hidden = true;
    placeBall(R.hole.tee[0], R.hole.tee[1]); R.phase = 'walk'; autoClub(); aimDefault(); R.aim = aimAt(lastTarget);
    if (GW.flag) GW.flag(R.hole.n, true);
    toast('Hole ' + R.hole.n + ' · Par ' + R.hole.par + ' · ' + R.hole.yards + ' yd'); M.v = 0; cp.ok = false; pvDirty = true;
  }
  function placeBall(x, y) { b.x = x; b.y = y; b.h = GW.heightAt(x, y) + PHYS.R; b.vx = b.vy = b.vh = 0; b.mode = 2; b.surf = GW.surfaceAt(x, y); R.ball[0] = x; R.ball[1] = y; }
  function endRound(quiet) {
    R.on = false; R.phase = 'off'; R.done = false; store.set('round', null); B.golf.saved = null; held.clear();
    if (el) { el.root.hidden = true; el.meter.classList.remove('on'); el.drop.hidden = true; document.getElementById('hud').classList.remove('golf'); }
    if (G) { G.pv.visible = G.trail.visible = G.mark.visible = G.grid.visible = false; }
    releaseCam(); if (!quiet) toast('Round over');
  }
  function setClubs(list) {
    if (typeof list === 'string') { if (SETS[list]) { R.set = list; store.set('set', list); } return; }
    if (list && list.set && SETS[list.set]) { R.set = list.set; store.set('set', list.set); list = list.ids || list.clubs; }
    if (Array.isArray(list) && list.length) { R.clubs = list.filter((id) => CLUBS.some((c) => c.id === id)); if (!R.clubs.includes('Pt')) R.clubs.push('Pt'); if (el) buildClubRow(); }
  }
  function nextHole() { if (R.holeIdx + 1 >= R.holesN) finishRound(); else startHole(R.holeIdx + 1); save(); }
  function finishRound() {
    const t = totals(), rounds = store.get('rounds', []); rounds.push({ d: Date.now(), holes: R.holesN, gross: t.gross, par: t.par, net: t.net, mode: R.mode, course: C.name }); store.set('rounds', rounds.slice(-30));
    R.phase = 'done'; R.done = true; store.set('round', null); B.golf.saved = null; releaseCam(); snd(660, 0.12, 0.3); setTimeout(() => snd(990, 0.25, 0.3), 140);
    openCard();
  }
  function totals() {
    let gross = 0, par = 0, opp = 0, up = 0; for (let i = 0; i < R.card.length; i++) { gross += R.card[i]; par += C.holes[i].par; if (R.mode === 'match') { opp += R.opp[i] || 0; up += Math.sign((R.opp[i] || 0) - R.card[i]); } }
    const hc = handicap(), net = gross - Math.round(hc * R.holesN / 18); return { gross, par, net, hc, opp, up, toPar: gross - par };
  }
  function handicap() { const rs = store.get('rounds', []).filter((r) => r.mode !== 'range' && r.holes).slice(-5); if (!rs.length) return 0; let s = 0; for (const r of rs) s += (r.gross - r.par) * 18 / r.holes; return clamp(s / rs.length * 0.96, 0, 36); }
  function save() { if (!R.on || R.mode === 'range' || R.done) return; const o = { mode: R.mode, holesN: R.holesN, holeIdx: R.holeIdx, stroke: R.stroke, card: R.card.slice(), opp: R.opp.slice(), ball: [b.x, b.y], wind: [R.wind.spd, R.wind.dir], set: R.set, clubs: R.clubs, prev: R.prev.slice(), t: R.t }; store.set('round', o); B.golf.saved = o; }
  function resume() {
    const o = B.golf.saved; if (!o || !C.holes[o.holeIdx]) return false; if (R.on) endRound(true);
    R.mode = o.mode; R.holesN = o.holesN; R.card.length = 0; R.card.push(...o.card); R.opp.length = 0; R.opp.push(...(o.opp || [])); R.wind.spd = o.wind[0]; R.wind.dir = o.wind[1]; R.set = o.set; if (o.clubs) R.clubs = o.clubs; R.t = o.t || 0; R.on = true; R.done = false;
    document.getElementById('hud').classList.add('golf'); el.root.hidden = false; buildClubRow();
    startHole(o.holeIdx); R.stroke = o.stroke; placeBall(o.ball[0], o.ball[1]); R.prev[0] = o.prev[0]; R.prev[1] = o.prev[1]; R.prev[2] = o.prev[2]; autoClub(); aimDefault(); R.aim = aimAt(lastTarget); pvDirty = true;
    toast('Round resumed: hole ' + R.hole.n); return true;
  }

  // ------------------------------------------------------------------ aiming, clubs, the shot
  const aimAt = (p) => Math.atan2(p[1] - b.y, p[0] - b.x);
  function aimDefault() {            // the pin, or the farthest dogleg point a driver reaches when the pin is out of range
    const h = R.hole, p = pin(); lastTarget = p; const d = hyp(p[0] - b.x, p[1] - b.y), reach = CLUBS[0].carry * 1.05;
    if (d > reach && h.path && h.path.length > 2) for (let k = h.path.length - 2; k >= 1; k--) { const q = h.path[k]; if (hyp(q[0] - b.x, q[1] - b.y) <= reach && hyp(q[0] - p[0], q[1] - p[1]) < d) { lastTarget = q; break; } }
    if (lastTarget === p && d > reach && h.path && h.path.length > 2) lastTarget = h.path[1];
  }
  function autoClub() {
    const surf = GW.surfaceAt(b.x, b.y), d = distPin();
    if (surf === 'green' && R.mode !== 'range') { R.putt = true; selClub(PT); return; }
    R.putt = false; let best = 0, bd = 1e9;
    for (let i = 0; i < PT; i++) { if (!R.clubs.includes(CLUBS[i].id)) continue; const e = Math.abs(CLUBS[i].carry * lieFactor(surf, CLUBS[i]) - d); if (e < bd) { bd = e; best = i; } }
    selClub(best);
  }
  function selClub(i) {
    i = clamp(i | 0, 0, PT); if (!R.clubs.includes(CLUBS[i].id)) { let j = i; while (j <= PT && !R.clubs.includes(CLUBS[j].id)) j++; if (j > PT) { j = i; while (j >= 0 && !R.clubs.includes(CLUBS[j].id)) j--; } i = Math.max(0, j); }
    R.club = i; if (i === PT) R.putt = true; else if (R.putt) R.putt = false;
    pvDirty = true; if (el) for (const c of el.clubs.children) c.classList.toggle('on', c.dataset.i == i);
  }
  function cycleClub(d) { let i = R.club; for (let k = 0; k <= PT; k++) { i = (i + d + PT + 1) % (PT + 1); if (R.clubs.includes(CLUBS[i].id)) break; } selClub(i); }
  function togglePutt() { if (R.phase !== 'walk' && R.phase !== 'address') return; if (R.putt) { R.putt = false; autoClub(); if (R.putt) { R.putt = false; selClub(PT - 1); } } else selClub(PT); pvDirty = true; }
  const puttMax = () => clamp(distPin() * 1.6 + 1, 4, 45);
  // click 3 of the meter -> the shot. power 0.02..1.1, err in meter units (0 = the line, + = early = slice, - = late = hook)
  function shoot(power, err) {
    const c = CLUBS[R.club], q = SETS[R.set] || SETS.rental, surf = GW.surfaceAt(b.x, b.y), sl = GW.slopeAt(b.x, b.y);
    R.prev[0] = b.x; R.prev[1] = b.y; R.prev[2] = b.h; R.stroke++; R.power = power; R.err = err; R.shotDir = R.aim;
    b.cup = R.mode !== 'range'; b.cupX = pin()[0]; b.cupY = pin()[1]; b.surf = surf;
    if (R.putt || c.id === 'Pt') {
      const d = clamp(power, 0, METER.up) * puttMax(), v0 = Math.sqrt(2 * SURF.green.roll * d) * (surf === 'green' ? 1 : 0.8);
      roll(b, R.aim + gauss() * q.aim * 0.25 * DEG, v0); snd(1400, 0.015, 0.25);
    } else {
      let lieF = lieFactor(surf, c), lan = c.launch, spin = c.spin, side = 0, noise = q.aim;
      if (surf === 'rough') { lieF = 0.85 + Math.random() * 0.07; if (Math.random() < 0.15) { lieF += 0.08; toast('Flyer!'); } noise *= 1.3; }
      else if (surf === 'bunker') { lan += 6; spin *= 0.6; noise *= 2; }
      const ax = Math.cos(R.aim), ay = Math.sin(R.aim), sf = sl[0] * ax + sl[1] * ay, sr = sl[0] * ay - sl[1] * ax;      // slope up the aim line, up to the right
      lan += sf * 40; lieF *= 1 - 0.8 * Math.min(0.3, Math.abs(sf)); side -= sr * 3000;                                  // uphill lie: higher and shorter; ball below the feet: fade
      lan += R.traj * 4; spin *= 1 + 0.2 * R.traj; lieF *= 1 - 0.03 * Math.abs(R.traj);
      side -= clamp(err / 0.25, -1, 1) * c.side * PHYS.sideRpm;
      const v = c.v0 * Math.pow(Math.max(power, 0.02), 0.62) * Math.pow(lieF, 0.62) * (1 + gauss() * q.dist) * q.bonus;
      launch(b, R.aim + gauss() * noise * DEG, v, lan * DEG, spin * RPM, side * RPM); R.lieF = lieF;
      snd(c.wood ? 180 : 240, 0.03, 0.5); snd(2200, 0.01, 0.15);
    }
    R.phase = 'flight'; acc = 0; cp.ok = false; G.trail.geometry.setDrawRange(0, 0); G.trailN = 0; G.trail.visible = true; G.mark.visible = false; G.pv.visible = false; el.meter.classList.remove('on');
    if (B.game) B.game.emit('golfShot', c.id, power);
  }
  // the ball came to rest (or splashed, or dropped): rules
  function settle() {
    const m = b.mode; R.ball[0] = b.x; R.ball[1] = b.y;
    if (m !== 4) { R.last.carry = b.carry; R.last.total = hyp(b.x - b.x0, b.y - b.y0); }
    if (R.mode === 'range') { R.msg = 'Carry ' + Math.round(b.carry * YD) + ' yd · Total ' + Math.round(R.last.total * YD) + ' yd'; toast(R.msg); R.phase = 'holed'; holdT = 2.2; return; }
    if (m === 4) { holed(); return; }
    if (m === 3) {
      R.stroke++; R.pen++; R.phase = 'drop'; snd(90, 0.2, 0.3); toast('Water: +1 penalty'); el.drop.hidden = false;
      const okDry = !Number.isNaN(b.dryX) && GW.surfaceAt(b.dryX, b.dryY) !== 'water'; el.dropA.disabled = !okDry; return;
    }
    const surf = GW.surfaceAt(b.x, b.y);
    if (surf === 'oob') { R.stroke++; R.pen++; toast('Out of bounds: stroke and distance'); snd(120, 0.2, 0.3); placeBall(R.prev[0], R.prev[1]); rest(); return; }
    rest();
  }
  function rest() {
    const mx = maxStrokes(); if (mx && R.stroke >= mx) { toast('Max strokes (' + mx + '): pick up'); R.card[R.holeIdx] = mx; oppPlay(); R.phase = 'holed'; holdT = 2.5; G.trail.visible = false; save(); return; }
    R.phase = 'walk'; el.drop.hidden = true; autoClub(); aimDefault(); R.aim = aimAt(R.putt ? pin() : lastTarget); R.traj = 0; pvDirty = true; cp.ok = false; camMode = 0; save(); }
  function drop(which) {
    el.drop.hidden = true;
    if (which === 0 && !el.dropA.disabled) { const p = pin(), d = hyp(p[0] - b.dryX, p[1] - b.dryY) || 1; placeBall(b.dryX + (b.dryX - p[0]) / d * 2, b.dryY + (b.dryY - p[1]) / d * 2); if (GW.surfaceAt(b.x, b.y) === 'water') placeBall(R.prev[0], R.prev[1]); }
    else placeBall(R.prev[0], R.prev[1]);
    rest();
  }
  const NAMES = { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey' };
  function holed() {
    R.card[R.holeIdx] = R.stroke; const d = R.stroke - R.hole.par; let msg = R.stroke === 1 ? 'Hole in one!' : NAMES[d] || (d > 0 ? '+' + d : d);
    oppPlay(); if (R.mode === 'match') { const o = R.opp[R.holeIdx]; msg += o < R.stroke ? ' · hole lost (' + o + ')' : o > R.stroke ? ' · hole won (' + o + ')' : ' · halved'; }
    toast(msg); snd(520, 0.08, 0.3); setTimeout(() => snd(780, 0.18, 0.3), 90); R.phase = 'holed'; holdT = 2.8; G.trail.visible = false; save();
  }
  function oppPlay() { if (R.mode !== 'match') return; let r = Math.random(), s = 1; for (const [d, p] of OPP) { r -= p; if (r <= 0) { s = d; break; } } R.opp[R.holeIdx] = Math.max(1, R.hole.par + s); }
  function matchText() { if (R.mode !== 'match') return ''; let up = 0; for (let i = 0; i < R.card.length; i++) up += Math.sign((R.opp[i] || 0) - R.card[i]); const left = R.holesN - R.card.length; return (up > 0 ? up + ' UP' : up < 0 ? -up + ' DOWN' : 'ALL SQUARE') + (left ? ' · ' + left + ' to play' : Math.abs(up) > 0 ? (up > 0 ? ' · match won' : ' · match lost') : ' · halved'); }

  // ------------------------------------------------------------------ the swing meter
  function click() {
    const ph = R.phase;
    if (ph === 'walk') { if (!near()) { toast('Walk to your ball'); return; } R.phase = 'address'; M.v = 0; el.meter.classList.add('on'); pvDirty = true; cp.ok = false; }
    else if (ph === 'address') { R.phase = 'power'; M.v = 0; R.power = 0; }
    else if (ph === 'power') { R.power = clamp(M.v, 0.02, METER.up); if (R.putt || R.club === PT) shoot(R.power, 0); else { R.phase = 'acc'; } }
    else if (ph === 'acc') shoot(R.power, M.v);
    else if (ph === 'drop') drop(0);
  }
  function meterStep(dt) {
    if (R.phase === 'power') { M.v += METER.speed * dt; if (M.v >= METER.up) { M.v = METER.up; R.power = METER.up; if (R.putt || R.club === PT) shoot(METER.up, 0); else R.phase = 'acc'; } if (R.putt) pvDirty = true; }
    else if (R.phase === 'acc') { M.v -= METER.speed * dt; if (M.v <= METER.low) shoot(R.power, METER.low); }
  }

  // ------------------------------------------------------------------ preview (shot shape / read the break) and the green grid
  function preview() {
    pvDirty = false; const c = CLUBS[R.club], surf = GW.surfaceAt(b.x, b.y), sl = GW.slopeAt(b.x, b.y), w = windNow();
    pb.x = b.x; pb.y = b.y; pb.h = b.h; pb.surf = surf; pb.cup = false;
    if (R.putt || R.club === PT) { const p = R.phase === 'power' ? clamp(M.v, 0.02, METER.up) : clamp((distPin() + 0.6) / puttMax(), 0.02, METER.up); roll(pb, R.aim, Math.sqrt(2 * SURF.green.roll * p * puttMax()) * (surf === 'green' ? 1 : 0.8)); }
    else {
      const ax = Math.cos(R.aim), ay = Math.sin(R.aim), sf = sl[0] * ax + sl[1] * ay, sr = sl[0] * ay - sl[1] * ax;
      let lieF = lieFactor(surf, c), lan = c.launch + sf * 40 + R.traj * 4, spin = c.spin * (1 + 0.2 * R.traj) * (surf === 'bunker' ? 0.6 : 1); if (surf === 'bunker') lan += 6; lieF *= (1 - 0.8 * Math.min(0.3, Math.abs(sf))) * (1 - 0.03 * Math.abs(R.traj));
      const p = R.phase === 'acc' ? R.power : 1;
      launch(pb, R.aim, c.v0 * Math.pow(p, 0.62) * Math.pow(lieF, 0.62) * (SETS[R.set] || SETS.rental).bonus, lan * DEG, spin * RPM, -sr * 3000 * RPM);
    }
    const a = G.pvPos; let n = 0, k = 0; a[0] = pb.x; a[1] = pb.h; a[2] = -pb.y; n = 1;
    while (pb.mode < 2 && n < PV_N && k++ < 4000) { step(pb, 1 / 60, false, w.x, w.y); if ((k & 3) === 0) { a[n * 3] = pb.x; a[n * 3 + 1] = pb.h + 0.03; a[n * 3 + 2] = -pb.y; n++; } }
    G.pv.geometry.setDrawRange(0, n & ~1); G.pv.geometry.attributes.position.needsUpdate = true; G.pv.visible = true;
    R.pvCarry = pb.carry; R.pvTotal = hyp(pb.x - b.x, pb.y - b.y);
    if (!(R.putt || R.club === PT)) { G.mark.position.set(pb.x, pb.h + 0.02, -pb.y); G.mark.visible = true; }
  }
  function buildGrid() {              // the green's slope grid: 0.5 m lines tinted by steepness, small arrows pointing downhill (one per hole, on demand)
    const h = R.hole, P = h.green.poly, pos = G.gridPos, col = G.gridCol; gridHole = R.holeIdx; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, k = 0;
    for (const p of P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const st = 0.5, nx = Math.ceil((x1 - x0) / st) + 1, ny = Math.ceil((y1 - y0) / st) + 1, lim = GRID_V * 3 - 24;
    const put = (x, y, r, g, bl) => { pos[k] = x; pos[k + 1] = GW.heightAt(x, y) + 0.015; pos[k + 2] = -y; col[k] = r; col[k + 1] = g; col[k + 2] = bl; k += 3; };
    const tint = (m, x, y) => { const t = clamp(m / 0.05, 0, 1); put(x, y, 0.3 + 0.7 * t, 0.95 - 0.8 * t * t, 0.3 - 0.25 * t); };      // flat = green, 2.5 % = yellow, 5 %+ = red
    const seg = (xa, ya, xb, yb) => { const s = GW.slopeAt((xa + xb) / 2, (ya + yb) / 2), m = hyp(s[0], s[1]); tint(m, xa, ya); tint(m, xb, yb); };
    for (let j = 0; j < ny && k < lim; j++) for (let i = 0; i < nx && k < lim; i++) {
      const x = x0 + i * st, y = y0 + j * st; if (!inPoly(x, y, P)) continue;
      if (inPoly(x + st, y, P)) seg(x, y, x + st, y); if (inPoly(x, y + st, P)) seg(x, y, x, y + st);
      if ((i & 3) === 1 && (j & 3) === 1) { const s = GW.slopeAt(x, y), m = hyp(s[0], s[1]); if (m > 0.004) { const dx = -s[0] / m, dy = -s[1] / m, L = 0.6, tx = x + dx * L, ty = y + dy * L, t = clamp(m / 0.05, 0, 1), r = 1, g = 0.6 - 0.5 * t, bl = 0.15; put(x, y, r, g, bl); put(tx, ty, r, g, bl); put(tx, ty, r, g, bl); put(tx - (dx * 0.87 - dy * 0.5) * 0.25, ty - (dy * 0.87 + dx * 0.5) * 0.25, r, g, bl); put(tx, ty, r, g, bl); put(tx - (dx * 0.87 + dy * 0.5) * 0.25, ty - (dy * 0.87 - dx * 0.5) * 0.25, r, g, bl); } }
    }
    G.grid.geometry.setDrawRange(0, k / 3); G.grid.geometry.attributes.position.needsUpdate = true; G.grid.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ cameras
  function releaseCam() { if (camOwned && B.game && B.game.cam === cam) B.game.cam = null; camOwned = false; }
  function updateCam(dt) {
    const ph = R.phase, own = ph === 'address' || ph === 'power' || ph === 'acc' || ph === 'flight' || ph === 'drop' || ((ph === 'walk' || ph === 'holed') && !(B.player && B.player.onFoot !== undefined));
    if (!own) { releaseCam(); return; }
    const ax = Math.cos(R.aim), ay = Math.sin(R.aim), putt = R.putt || R.club === PT; let px, py, ph2, lx, ly, lh, fov = 55;
    if (ph === 'flight') {
      const dx = Math.cos(R.shotDir), dy = Math.sin(R.shotDir), back = putt ? 3.5 : 11, up = putt ? 1.5 : 3.6;
      const tx = b.x - dx * back, ty = b.y - dy * back, th = Math.max(b.h + up, groundAt(tx, ty) + 1.3), k = cp.ok ? 1 - Math.exp(-dt * 3.2) : 1;
      cp.x += (tx - cp.x) * k; cp.y += (ty - cp.y) * k; cp.h += (th - cp.h) * k; cp.ok = true;
      px = cp.x; py = cp.y; ph2 = cp.h; lx = b.x + b.vx * 0.15; ly = b.y + b.vy * 0.15; lh = b.h + 0.3;
    } else if (camMode === 1) {       // free-look orbit around the ball
      const yaw = R.aim + Math.PI + fl.yaw, cpch = Math.cos(fl.pitch); px = b.x + Math.cos(yaw) * cpch * fl.dist; py = b.y + Math.sin(yaw) * cpch * fl.dist; ph2 = b.h + Math.sin(fl.pitch) * fl.dist; lx = b.x + ax * 3; ly = b.y + ay * 3; lh = b.h + 0.4;
    } else if (putt && camMode === 2) {   // top-down over the putt
      const p = pin(), d = Math.max(3, distPin()), mx = (b.x + p[0]) / 2, my = (b.y + p[1]) / 2, hgt = Math.max(8, d * 1.7); px = mx - ax * hgt * 0.22; py = my - ay * hgt * 0.22; ph2 = groundAt(mx, my) + hgt; lx = mx; ly = my; lh = groundAt(mx, my); fov = 50;
    } else if (putt) {                   // behind the ball, low, looking down the line
      const d = clamp(distPin() * 0.6, 3, 14); px = b.x - ax * 2.8; py = b.y - ay * 2.8; ph2 = b.h + 1.15; lx = b.x + ax * d; ly = b.y + ay * d; lh = groundAt(lx, ly) + 0.1;
    } else {                              // behind the ball, looking at the aim point
      const c = CLUBS[R.club], back = clamp(c.carry * 0.018, 3, 4.2), up = 0.6 + back * 0.22; px = b.x - ax * back; py = b.y - ay * back; ph2 = Math.max(b.h + up, groundAt(px, py) + 0.6);
      const L = clamp(c.carry * 0.3, 6, 70); lx = b.x + ax * L; ly = b.y + ay * L; lh = b.h - 0.3 + L * 0.004; fov = 58;      // the ball sits about 60 % down the frame
    }
    ph2 = Math.max(ph2, groundAt(px, py) + 0.5);
    cam[0] = px; cam[1] = ph2; cam[2] = -py; cam[3] = lx; cam[4] = lh; cam[5] = -ly; cam[6] = fov; B.game.cam = cam; camOwned = true;
  }
  function cycleCam() { const putt = R.putt || R.club === PT; camMode = (camMode + 1) % (putt ? 3 : 2); if (camMode === 1) { fl.yaw = 0; fl.pitch = 0.22; fl.dist = putt ? 3.5 : 6; } }

  // ------------------------------------------------------------------ per frame
  const reassert = () => { if (camOwned && B.game.cam !== cam) B.game.cam = cam; };      // listeners run in registration order: a late one wins the camera over player.js's chase cam during a shot
  function update(dt, driving) {
    if (!lateReg) { lateReg = true; B.game.on('frame', reassert); setTimeout(() => B.game.on('frame', reassert), 12000); }
    if (!R.on) { if (camOwned) releaseCam(); return; }
    if (!driving) return;
    R.t += dt; readPad(dt);
    const aiming = R.phase === 'address' || R.phase === 'power' || R.phase === 'acc';
    if (aiming || (R.phase === 'walk' && !B.player)) { const turn = (held.has('ArrowLeft') ? 1 : 0) - (held.has('ArrowRight') ? 1 : 0); if (turn) { R.aim += turn * dt * (R.putt ? 0.18 : 0.45); pvDirty = true; } }
    meterStep(dt);
    if (R.phase === 'flight') {
      const w = windNow(); acc = Math.min(acc + dt, 0.25);
      while (acc >= PHYS.dt && b.mode < 2) { step(b, PHYS.dt, false, w.x, w.y); acc -= PHYS.dt; }
      { const a = G.trailPos; a.copyWithin(3, 0, (TRAIL_N - 1) * 3); a[0] = b.x; a[1] = b.h; a[2] = -b.y; G.trailN = Math.min(G.trailN + 1, TRAIL_N); G.trail.geometry.setDrawRange(0, G.trailN); G.trail.geometry.attributes.position.needsUpdate = true; }
      if (!Number.isNaN(b.landX) && !G.mark.visible) { G.mark.position.set(b.landX, GW.heightAt(b.landX, b.landY) + 0.02, -b.landY); G.mark.visible = true; }
      if (b.mode >= 2) settle();
    } else if (R.phase === 'holed') { holdT -= dt; if (holdT <= 0) { if (R.mode === 'range') { placeBall(C.range.tee[0], C.range.tee[1]); R.phase = 'walk'; R.aim = R.hole.aim || R.aim; pvDirty = true; G.trail.visible = false; } else nextHole(); } }
    if (R.phase === 'walk' || R.phase === 'address' || R.phase === 'power' || R.phase === 'acc') { if (pvDirty) preview(); } else G.pv.visible = false;
    if (R.done && !B.game.panel) { endRound(); return; }
    const showGrid = (R.putt || R.club === PT) && R.phase !== 'holed' && R.mode !== 'range'; if (showGrid && gridHole !== R.holeIdx) buildGrid(); G.grid.visible = showGrid;
    G.ball.position.set(b.x, b.h, -b.y); R.ball[0] = b.x; R.ball[1] = b.y;
    updateCam(dt);
    const cd = hyp(cam[0] - b.x, cam[1] - b.h, cam[2] + b.y), sc = camOwned ? (camMode === 2 && (R.putt || R.club === PT) ? 3.5 : Math.max(1, cd / 30)) : 1; G.ball.scale.set(sc, sc, sc);      // reads on screen from the top camera too
    if (el.meter.classList.contains('on')) { el.mark.style.left = ((M.v - METER.low) / (METER.up - METER.low) * 100).toFixed(2) + '%'; const pw = R.phase === 'acc' || R.phase === 'power' ? Math.max(0, R.phase === 'acc' ? R.power : M.v) : 0; el.pw.style.width = (pw / (METER.up - METER.low) * 100).toFixed(2) + '%'; }
    if ((hudT -= dt) <= 0) { hudT = 0.1; refreshHud(); }
  }
  function readPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null; if (!pads) return; let gp = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected && pads[i].buttons.length >= 6) { gp = pads[i]; break; }
    if (!gp) return;
    const aiming = R.phase === 'address' || R.phase === 'power' || R.phase === 'acc';
    for (let i = 0; i < 16; i++) { const q = gp.buttons[i], p = q && (q.pressed || q.value > 0.6) ? 1 : 0, hit = p && !padPrev[i]; padPrev[i] = p; if (!hit) continue;
      if (i === 0) click(); else if (i === 4) cycleClub(-1); else if (i === 5) cycleClub(1); else if (i === 3 && (aiming || !B.player)) cycleCam(); else if (i === 12 && aiming) { R.traj = Math.min(1, R.traj + 1); pvDirty = true; } else if (i === 13 && aiming) { R.traj = Math.max(-1, R.traj - 1); pvDirty = true; } else if (i === 14) togglePutt(); else if (i === 15) openCard(); else if (i === 1 && R.phase === 'drop') drop(1); }
    if (aiming) { const sx = gp.axes[0] || 0; if (Math.abs(sx) > 0.15) { R.aim -= sx * dt * (R.putt ? 0.2 : 0.5); pvDirty = true; }
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0; if (Math.abs(rx) > 0.2 || Math.abs(ry) > 0.2) { if (camMode !== 1) cycleCam(); camMode = 1; fl.yaw -= rx * dt * 2; fl.pitch = clamp(fl.pitch + ry * dt * 1.2, -0.1, 1.2); } }
  }

  // ------------------------------------------------------------------ HUD
  const CSS = `
#golf{position:absolute;inset:0;pointer-events:none;color:var(--cream);text-shadow:0 1px 3px #000;font-family:var(--text)}
#golf .card{position:absolute;background:rgba(24,22,23,.66);border-radius:6px;box-shadow:inset 0 0 0 1.5px var(--line);padding:6px 12px}
#gTop{left:50%;top:10px;transform:translateX(-50%);display:flex;gap:16px;align-items:flex-end;white-space:nowrap}
#gTop b{font:700 26px/1 var(--text);display:block} #gTop small{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
#gInfo{right:14px;top:62px;width:156px;font-size:15px;line-height:1.25}
#gInfo .big{font:700 32px/1 var(--text);color:var(--gold);font-variant-numeric:tabular-nums} #gInfo small{color:var(--dim);font-size:12px;letter-spacing:.1em;text-transform:uppercase;display:block;margin-top:4px}
#gWind{display:flex;align-items:center;gap:8px;margin-top:2px} #gWind i{display:inline-block;width:20px;height:20px;background:var(--cream);clip-path:polygon(50% 0,100% 100%,50% 72%,0 100%);flex:none}
#gClubs{left:14px;top:72px;display:flex;flex-wrap:wrap;gap:4px;width:214px;pointer-events:auto;padding:6px}
#gClubs button{border:0;border-radius:3px;background:rgba(246,234,211,.12);color:var(--cream);font:700 14px var(--text);padding:4px 0;width:36px}
#gClubs button.on{background:var(--gold);color:var(--ink)} #gClubs button:disabled{opacity:.35}
#gMeter{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);width:min(520px,78%);height:26px;background:rgba(24,22,23,.78);border-radius:13px;box-shadow:inset 0 0 0 1.5px var(--line);opacity:0;transition:opacity .2s}
#gMeter.on{opacity:1} #gMeter i{position:absolute;top:0;bottom:0;background:var(--apple);width:6px;margin-left:-3px;left:18.52%}
#gMeter .pw{position:absolute;left:18.52%;top:5px;bottom:5px;background:var(--gold);border-radius:8px;width:0}
#gMeter .t100{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--cream);left:92.6%;opacity:.7} #gMeter .t100 b{position:absolute;top:-16px;left:-10px;font:700 12px var(--text);color:var(--dim)}
#gMark{position:absolute;top:-7px;width:5px;height:40px;margin-left:-2.5px;background:var(--cream);border-radius:2px;left:18.52%;box-shadow:0 0 6px #000}
#gMsg{position:absolute;left:50%;top:112px;transform:translateX(-50%);font:700 20px/1.2 var(--text);letter-spacing:.04em;text-align:center;white-space:nowrap;max-width:94%}
#gBtns{position:absolute;right:14px;bottom:24px;display:flex;gap:8px;pointer-events:auto;flex-wrap:wrap;justify-content:flex-end;width:270px}
#gBtns .pad{position:static;width:60px;height:60px;font-size:13px} #gSwing{width:96px!important;height:96px!important;font-size:19px!important;background:rgba(200,32,43,.82)!important}
#gDrop{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:10px;background:var(--panel);padding:16px 18px;border-radius:8px;pointer-events:auto;box-shadow:inset 0 0 0 1.5px var(--line)}
#gDrop h3{margin:0;font:700 22px/1 var(--text)}
#hud.golf #dash,#hud.golf #drift,#hud.golf #chTrack,#hud.golf #total{visibility:hidden} #hud.golfAim #touch .pad{display:none}
.touch #hud.golf:not(.golfAim) #gBtns .pad:not(#gSwing){display:none} .touch #hud.golf:not(.golfAim) #gBtns{right:auto;left:50%;transform:translateX(-50%);width:auto}
body:not(.touch) #gBtns .pad:not(#gSwing){display:none} body:not(.touch) #gSwing{width:72px!important;height:72px!important;font-size:15px!important}
#pGolf table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:15px} #pGolf td,#pGolf th{padding:3px 4px;text-align:center;border-bottom:1px solid var(--line)} #pGolf th{color:var(--dim);font-weight:600}
#pGolf td.u{color:var(--apple);font-weight:700} #pGolf td.o{color:var(--gold)}
.touch #gClubs{top:60px;width:150px} .touch #gMeter{bottom:150px} .touch #gMsg{top:100px;font-size:16px} .touch #gBtns{bottom:12px} .touch #gInfo{top:56px;width:130px;font-size:13px} .touch #gInfo .big{font-size:26px}
/* phones: the info card becomes one strip under the hole card so the game's right-hand pads (ENTER / RUN / BACK / WALK) stay clear */
.touch #gInfo{top:66px;left:176px;right:14px;width:auto;display:flex;gap:10px;align-items:center;white-space:nowrap;padding:4px 10px;font-size:12px;line-height:1.2} .touch #gInfo small{display:none} .touch #gInfo .big{font-size:20px} .touch #gInfo>div{overflow:hidden;text-overflow:ellipsis;min-width:0} .touch #gInfo #gWind,.touch #gInfo .big{margin-top:0;flex:none} .touch #gMsg{left:176px;right:14px;transform:none;max-width:none;white-space:normal;font-size:15px} .touch #gClubs button{padding:3px 0;font-size:13px}`;
  function buildHud() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'golf'; root.hidden = true;
    root.innerHTML = '<div class="card" id="gTop"><div><b id="gHole">Hole 1</b><small id="gPar">Par 4 · 415 yd</small></div><div><b id="gStroke">0</b><small>Strokes</small></div><div><b id="gScore">E</b><small id="gScoreL">Score</small></div></div>'
      + '<div class="card" id="gInfo"><div class="big" id="gDist">0</div><small>Yards to pin</small><div id="gPlays"></div><small>Wind</small><div id="gWind"><i id="gWindI"></i><span id="gWindT"></span></div><small>Lie</small><div id="gLie"></div><small>Club</small><div id="gClub"></div></div>'
      + '<div class="card" id="gClubs"></div><div id="gMsg"></div><div id="gMeter"><i></i><div class="pw"></div><div class="t100"><b>100</b></div><div id="gMark"></div></div>'
      + '<div id="gBtns"><button class="pad" id="gbL">◀ AIM</button><button class="pad" id="gbR">AIM ▶</button><button class="pad" id="gbCam">CAM</button><button class="pad" id="gbPutt">PUTT</button><button class="pad" id="gbCard">CARD</button><button class="pad" id="gSwing">SWING</button></div>'
      + '<div id="gDrop" hidden><h3>In the water: +1 penalty</h3><button class="btn primary" id="gDropA">Drop near where it went in (Space)</button><button class="btn" id="gDropB">Replay from the last spot</button></div>';
    document.getElementById('stage2').appendChild(root);
    const $ = (id) => document.getElementById(id);
    el = { root, hole: $('gHole'), par: $('gPar'), stroke: $('gStroke'), score: $('gScore'), scoreL: $('gScoreL'), dist: $('gDist'), plays: $('gPlays'), windI: $('gWindI'), windT: $('gWindT'), lie: $('gLie'), clubT: $('gClub'), clubs: $('gClubs'), msg: $('gMsg'), meter: $('gMeter'), mark: $('gMark'), pw: root.querySelector('.pw'), drop: $('gDrop'), dropA: $('gDropA'), dropB: $('gDropB') };
    buildClubRow();
    const hold = (id, key) => { const e = $(id); e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); e.setPointerCapture(ev.pointerId); held.add(key); }); for (const n of ['pointerup', 'pointercancel']) e.addEventListener(n, () => held.delete(key)); e.addEventListener('contextmenu', (ev) => ev.preventDefault()); };
    hold('gbL', 'ArrowLeft'); hold('gbR', 'ArrowRight');
    $('gbCam').onclick = cycleCam; $('gbPutt').onclick = togglePutt; $('gbCard').onclick = openCard; $('gSwing').onclick = click; el.dropA.onclick = () => drop(0); el.dropB.onclick = () => drop(1);
    // scorecard panel (opened through the game's panel system so the world pauses behind it)
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pGolf'; p.hidden = true;
    p.innerHTML = '<div class="head"><h2>Scorecard</h2><button class="btn small" id="gCardClose">Close</button></div><div id="gCardBody"></div><div class="row"><button class="btn" id="gCardResume" hidden>Resume round</button><button class="btn" id="gCardEnd" hidden>End round</button><button class="btn" id="gCardRange" hidden>Practice range</button></div>';
    document.getElementById('pHelp').parentNode.appendChild(p); el.cardBody = $('gCardBody'); el.cardResume = $('gCardResume'); el.cardEnd = $('gCardEnd'); el.cardRange = $('gCardRange');
    $('gCardClose').onclick = () => { B.game.closePanel(); if (R.done) endRound(); };
    el.cardResume.onclick = () => { B.game.closePanel(); resume(); }; el.cardEnd.onclick = () => { B.game.closePanel(); endRound(); }; el.cardRange.onclick = () => { B.game.closePanel(); startRound({ mode: 'range' }); };
    // Options: max strokes per hole
    const opt = document.createElement('div'); opt.className = 'opt'; opt.innerHTML = '<label>Golf: max strokes a hole</label><div class="seg" id="segGolfMax"><button data-v="8">8</button><button data-v="10">10</button><button data-v="12">12</button><button data-v="0">None</button></div>';
    document.getElementById('pOptions').appendChild(opt);
    const seg = $('segGolfMax'), segSet = (v) => { for (const bt of seg.children) bt.classList.toggle('on', bt.dataset.v === String(v)); }; segSet(maxStrokes()); for (const bt of seg.children) bt.onclick = () => { store.set('max', +bt.dataset.v); segSet(+bt.dataset.v); };
    // Controls panel rows
    const help = document.getElementById('pHelp'), kb = help.querySelector('.kb'), tp = help.querySelector('.tp');
    if (kb) kb.insertAdjacentHTML('beforeend', '<div><kbd>Space</kbd></div><span>Golf: swing meter click (start, power, accuracy)</span><div><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></div><span>Golf: aim, trajectory (high / punch); drag the mouse to look around</span><div><kbd>1</kbd>-<kbd>9</kbd> <kbd>0</kbd> <kbd>[</kbd> <kbd>]</kbd></div><span>Golf: choose a club</span><div><kbd>P</kbd> <kbd>C</kbd> <kbd>M</kbd></div><span>Golf: putting mode, camera, scorecard</span>');
    if (tp) tp.insertAdjacentHTML('beforeend', '<div><kbd>SWING</kbd></div><span>Golf: swing meter click (start, power, accuracy)</span><div><kbd>AIM</kbd> <kbd>PUTT</kbd> <kbd>CAM</kbd> <kbd>CARD</kbd></div><span>Golf: aim, putting mode, camera, scorecard; the club row picks a club</span>');
    const gpRow = help.querySelector('.keys > span:last-of-type'); if (gpRow) gpRow.insertAdjacentHTML('afterend', '<div>Golf pad</div><span>A swing click · left stick aim · right stick look · bumpers club · Y camera · D-pad up / down trajectory, left putting mode, right scorecard · B replay after a water drop</span>');
    B.game.addMenuButton('Golf', openCard);
    // free-look: drag on the canvas while aiming, wheel to zoom
    const view = document.getElementById('view'); let drag = null;
    view.addEventListener('pointerdown', (e) => { if (R.on && (R.phase === 'address' || R.phase === 'power' || R.phase === 'acc' || (R.phase === 'walk' && !B.player))) drag = { x: e.clientX, y: e.clientY, moved: false }; });
    addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return; if (!drag.moved) { drag.moved = true; if (camMode !== 1) cycleCam(); camMode = 1; } fl.yaw -= dx * 0.006; fl.pitch = clamp(fl.pitch + dy * 0.004, -0.1, 1.2); drag.x = e.clientX; drag.y = e.clientY; });
    addEventListener('pointerup', () => { drag = null; }); addEventListener('pointercancel', () => { drag = null; });
    view.addEventListener('wheel', (e) => { if (R.on && camMode === 1) fl.dist = clamp(fl.dist * (e.deltaY > 0 ? 1.1 : 0.9), 1.5, 40); }, { passive: true });
  }
  function buildClubRow() { el.clubs.textContent = ''; CLUBS.forEach((c, i) => { const bt = document.createElement('button'); bt.textContent = c.id; bt.dataset.i = i; bt.title = c.name + (c.carry ? ' · ' + Math.round(c.carry * YD) + ' yd' : ''); bt.disabled = !R.clubs.includes(c.id); bt.classList.toggle('on', i === R.club); bt.onclick = () => { if (R.phase === 'walk' || R.phase === 'address') selClub(i); }; el.clubs.appendChild(bt); }); }
  const toast = (m) => { if (B.game) B.game.toast(m); };
  function refreshHud() {
    const h = R.hole, c = CLUBS[R.club], range = R.mode === 'range', p = pin(), d = distPin(), surf = GW.surfaceAt(b.x, b.y), sl = GW.slopeAt(b.x, b.y);
    el.hole.textContent = range ? 'Range' : 'Hole ' + h.n; el.par.textContent = range ? 'Practice' : 'Par ' + h.par + ' · ' + h.yards + ' yd';
    el.stroke.textContent = R.stroke; let tp = 0; for (let i = 0; i < R.card.length; i++) tp += R.card[i] - C.holes[i].par;
    el.score.textContent = range ? '—' : tp === 0 ? 'E' : tp > 0 ? '+' + tp : tp; el.scoreL.textContent = R.mode === 'match' ? matchText() : range ? 'Range' : R.card.length ? 'Thru ' + R.card.length : 'Score';
    const rise = range ? 0 : GW.heightAt(p[0], p[1]) - b.h; el.dist.textContent = range ? Math.round(hyp(b.x - C.range.tee[0], b.y - C.range.tee[1]) * YD) : Math.round(d * YD);
    el.plays.textContent = range ? (R.last.total ? 'Last: ' + Math.round(R.last.carry * YD) + ' / ' + Math.round(R.last.total * YD) + ' yd' : 'Yards from the tee') : R.putt ? (d < 1 ? (d * 3.28).toFixed(1) + ' ft' : d.toFixed(1) + ' m · ' + Math.round(d * 3.28) + ' ft') : 'Plays ' + Math.round((d + rise) * YD) + ' yd' + (Math.abs(rise) > 1 ? (rise > 0 ? ' (up ' : ' (down ') + Math.round(Math.abs(rise) * YD) + ')' : '');
    const w = windNow(), ax = Math.cos(R.aim), ay = Math.sin(R.aim), wf = w.x * ax + w.y * ay, wr = w.x * ay - w.y * ax, ws = hyp(w.x, w.y);
    el.windI.style.transform = 'rotate(' + Math.round(Math.atan2(wr, wf) / DEG) + 'deg)'; el.windT.textContent = Math.round(ws * 2.237) + ' mph' + (ws < 0.7 ? ' calm' : Math.abs(wf) > Math.abs(wr) ? (wf > 0 ? ' helping' : ' against') : (wr > 0 ? ' L→R' : ' R→L'));
    const sf = sl[0] * ax + sl[1] * ay, sr = sl[0] * ay - sl[1] * ax, lf = lieFactor(surf, c);
    el.lie.textContent = (SURF[surf] || SURF.rough).name + (lf !== 1 && !R.putt ? ' ' + Math.round(lf * 100) + '%' : '') + (Math.abs(sf) > 0.015 ? (sf > 0 ? ' · uphill' : ' · downhill') : '') + (Math.abs(sr) > 0.015 ? (sr > 0 ? ' · below feet' : ' · above feet') : '');
    el.clubT.textContent = c.name + (R.putt || c.id === 'Pt' ? '' : ' · ' + Math.round(c.carry * lf * YD) + ' yd' + (R.traj ? (R.traj > 0 ? ' · high' : ' · punch') : ''));
    let m = R.msg; const ph = R.phase; if (camOwned !== aimWas) { aimWas = camOwned; document.getElementById('hud').classList.toggle('golfAim', camOwned); }      // the car / walker pads make way for the golf pads while golf owns the view
    if (ph === 'walk') m = near() ? (B.game.isTouch ? 'Tap SWING to address the ball' : 'Space: address the ball · 1-9 club · P putt · M card') : 'Walk to your ball · ' + (B.player && B.player.pos ? Math.round(hyp(B.player.pos[0] - b.x, B.player.pos[1] - b.y)) + ' m' : '');
    else if (ph === 'address') m = (R.putt ? 'Aim ← → · ' : 'Aim ← → · ↑ ↓ trajectory · ') + (B.game.isTouch ? 'SWING starts the meter' : 'Space starts the meter') + (R.pvCarry && !R.putt ? ' · preview carry ' + Math.round(R.pvCarry * YD) + ' yd' : R.putt ? ' · read the break: the dotted line' : '');
    else if (ph === 'power') m = R.putt ? 'Click for the distance: ' + (M.v * puttMax()).toFixed(1) + ' m' : 'Click for power';
    else if (ph === 'acc') m = 'Click on the red line · early = slice, late = hook';
    else if (ph === 'flight') m = b.mode === 1 ? 'Rolling · ' + Math.round(b.carry * YD) + ' yd carry' : Number.isNaN(b.landX) ? Math.round(hyp(b.x - b.x0, b.y - b.y0) * YD) + ' yd · ' + Math.round(b.h - GW.heightAt(b.x0, b.y0)) + ' m high' : '';
    else if (ph === 'drop') m = '';
    else if (ph === 'holed' && !range) m = 'Carry ' + Math.round(R.last.carry * YD) + ' · total ' + Math.round(R.last.total * YD) + ' yd';
    el.msg.textContent = m;
  }
  function openCard() {
    const t = totals(), hc = handicap();
    if (R.on && R.mode !== 'range') {
      const half = R.holesN > 9 ? 2 : 1; let html = '<p class="fine">' + C.name + ' · ' + (R.mode === 'match' ? 'Match play vs the computer · ' + matchText() : 'Stroke play') + ' · wind ' + Math.round(R.wind.spd * 2.237) + ' mph</p>';
      for (let hf = 0; hf < half; hf++) { const a = hf * 9, n = Math.min(9, R.holesN - a); const L = (lbl, f, cls) => { let s = '<tr><th>' + lbl + '</th>'; for (let i = a; i < a + n; i++) s += '<td' + (cls ? cls(i) : '') + '>' + f(i) + '</td>'; return s + '</tr>'; };
        html += '<table>' + L('Hole', (i) => C.holes[i].n) + L('Par', (i) => C.holes[i].par) + L('Yds', (i) => C.holes[i].yards) + L('You', (i) => (R.card[i] !== undefined ? R.card[i] : i === R.holeIdx ? R.stroke || '·' : ''), (i) => (R.card[i] !== undefined ? R.card[i] < C.holes[i].par ? ' class="u"' : R.card[i] > C.holes[i].par ? ' class="o"' : '' : '')) + (R.mode === 'match' ? L('Comp.', (i) => (R.opp[i] !== undefined ? R.opp[i] : '')) : '') + '</table>'; }
      html += '<p><b>Gross ' + t.gross + '</b> · par ' + t.par + ' · ' + (t.toPar === 0 ? 'even' : t.toPar > 0 ? '+' + t.toPar : t.toPar) + ' · handicap ' + hc.toFixed(1) + ' · net ' + t.net + (R.mode === 'match' ? ' · computer ' + t.opp : '') + (R.pen ? ' · penalties ' + R.pen : '') + '</p>';
      if (R.done) html = '<h3 style="margin:0">Round complete</h3>' + html; el.cardBody.innerHTML = html;
    } else {
      const rs = store.get('rounds', []).slice(-8).reverse(); let html = '<p>Handicap ' + hc.toFixed(1) + (rs.length ? '' : ' (no rounds yet)') + '</p>';
      if (rs.length) { html += '<table><tr><th>Date</th><th>Holes</th><th>Gross</th><th>Par</th><th>Net</th><th>Mode</th></tr>'; for (const r of rs) html += '<tr><td>' + new Date(r.d).toLocaleDateString() + '</td><td>' + r.holes + '</td><td>' + r.gross + '</td><td>' + r.par + '</td><td>' + r.net + '</td><td>' + r.mode + '</td></tr>'; html += '</table>'; }
      if (R.on) html += '<p>Practice range · last ball: carry ' + Math.round(R.last.carry * YD) + ' yd, total ' + Math.round(R.last.total * YD) + ' yd</p>';
      el.cardBody.innerHTML = html + '<p class="fine">Rounds start at the pro shop in the clubhouse at Phil Harris, Linton.</p>';
    }
    el.cardResume.hidden = !(B.golf.saved && !R.on); el.cardEnd.hidden = !(R.on && !R.done); el.cardRange.hidden = R.on;
    B.game.openPanel('pGolf');
  }

  // ------------------------------------------------------------------ keys (capture phase: golf keys never reach the car while a round is on)
  addEventListener('keydown', (e) => {
    if (!R.on || !B.game || B.game.mode !== 'drive' || B.game.panel || e.code === 'Escape') return;
    if (R.done) { if (e.code === 'KeyM') { e.preventDefault(); e.stopImmediatePropagation(); openCard(); } return; }
    const c = e.code, ph = R.phase, aiming = ph === 'address' || ph === 'power' || ph === 'acc', solo = !B.player; let take = false;
    if (c === 'Space') { if (ph !== 'walk' || near()) { take = true; if (!e.repeat) click(); } }
    else if (c === 'KeyM') { take = true; if (!e.repeat) openCard(); }
    else if (c === 'KeyP') { take = true; if (!e.repeat) togglePutt(); }
    else if (c === 'KeyC') { if (aiming || solo) { take = true; if (!e.repeat) cycleCam(); } }
    else if (c === 'BracketLeft' || c === 'BracketRight') { take = true; if (!e.repeat && (ph === 'walk' || ph === 'address')) cycleClub(c === 'BracketLeft' ? -1 : 1); }
    else if (DIGITS[c]) { take = true; if (ph === 'drop') { if (c === 'Digit1') drop(0); else if (c === 'Digit2') drop(1); } else if (ph === 'walk' || ph === 'address') selClub(CLUBS.findIndex((k) => k.id === DIGITS[c])); }
    else if (c.startsWith('Arrow') || padMap[c]) {
      const k = padMap[c] || c; if (c.startsWith('Arrow') ? aiming || solo : aiming) { take = true; held.add(k); if (!e.repeat && aiming && (k === 'ArrowUp' || k === 'ArrowDown') && !R.putt) { R.traj = clamp(R.traj + (k === 'ArrowUp' ? 1 : -1), -1, 1); pvDirty = true; } }
    }
    if (take) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  addEventListener('keyup', (e) => { held.delete(padMap[e.code] || e.code); }, true);
  addEventListener('blur', () => held.clear());

  // ------------------------------------------------------------------ build
  function build() {
    W = B.game.world; scene = B.game.scene; C = window.BLOOMFIELD_GOLF || B.BLOOMFIELD_GOLF || stubCourse(); GW = B.golfWorld && B.golfWorld.ready ? B.golfWorld : stubWorld(C, W, scene);
    if (!C.rect) C.rect = { x0: -16160, y0: 440, x1: -15585, y1: 1384 };
    calibrate();
    G = {}; const white = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    G.ball = new T.Mesh(new T.SphereGeometry(0.0215 * 2.2, 14, 10), white); G.ball.castShadow = true; scene.add(G.ball);      // bigger than life so it reads on screen
    G.pvPos = new Float32Array(PV_N * 3); const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(G.pvPos, 3)); pg.setDrawRange(0, 0); G.pv = new T.LineSegments(pg, new T.LineBasicMaterial({ color: lin(0xf2c230), transparent: true, opacity: 0.9, depthTest: false })); G.pv.frustumCulled = false; G.pv.renderOrder = 5; G.pv.visible = false; scene.add(G.pv);
    G.trailPos = new Float32Array(TRAIL_N * 3); G.trailN = 0; const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(G.trailPos, 3)); tg.setDrawRange(0, 0); G.trail = new T.Line(tg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })); G.trail.frustumCulled = false; G.trail.visible = false; scene.add(G.trail);
    G.mark = new T.Mesh(new T.RingGeometry(0.35, 0.5, 24), new T.MeshBasicMaterial({ color: lin(0xf2c230), transparent: true, opacity: 0.85, depthTest: false, side: T.DoubleSide })); G.mark.rotation.x = -Math.PI / 2; G.mark.renderOrder = 5; G.mark.visible = false; scene.add(G.mark);
    G.gridPos = new Float32Array(GRID_V * 3); G.gridCol = new Float32Array(GRID_V * 3); const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(G.gridPos, 3)); gg.setAttribute('color', new T.BufferAttribute(G.gridCol, 3)); gg.setDrawRange(0, 0);
    G.grid = new T.LineSegments(gg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })); G.grid.frustumCulled = false; G.grid.visible = false; scene.add(G.grid);
    buildHud();
    B.golf.saved = store.get('round', null); R.set = store.get('set', 'rental'); if (!SETS[R.set]) R.set = 'rental';
    B.game.on('frame', (dt, driving) => { try { update(dt, driving); } catch (e) { if (!errOnce) { errOnce = true; console.error('golf', e); } } });
    if (B.golf.saved) setTimeout(() => toast('A golf round is in progress: Menu → Golf → Resume'), 4000);
    built = true;
  }
  B.golf = {
    startRound, endRound, setClubs, resume, saved: null, practice: () => startRound({ mode: 'range' }), state: R, CLUBS, SURF, PHYS, handicap, openCard,
    get inRound() { return R.on; }, get ready() { return built; }, get camActive() { return camOwned; },
    debug: {
      ball: b, sim: simFlat, calibrate,
      hit(id, power, err) { const i = CLUBS.findIndex((c) => c.id === id); if (i >= 0) selClub(i); if (R.phase === 'walk') { R.phase = 'address'; } shoot(power === undefined ? 1 : power, err || 0); },
      settle(maxSec) { const w = windNow(); let n = 0; while (b.mode < 2 && n++ < (maxSec || 60) * 120) step(b, PHYS.dt, false, w.x, w.y); if (R.phase === 'flight') settle(); return { x: b.x, y: b.y, mode: b.mode, carry: b.carry, total: R.last.total, phase: R.phase, stroke: R.stroke }; },
      aim(rad) { R.aim = rad; pvDirty = true; }, aimAt(x, y) { R.aim = Math.atan2(y - b.y, x - b.x); pvDirty = true; }, place(x, y) { placeBall(x, y); rest(); }, wind(s, d) { R.wind.spd = s; R.wind.dir = d; }, click, drop, preview, get G() { return G; }, get C() { return C; }, get GW() { return GW; },
    },
  };
  let tries = 0;      // game.js emits no 'ready': poll for the world; give the course engineer's BD.golfWorld a minute to finish building
  (function wait() { if (B.game && B.game.world && B.game.scene && (!B.golfWorld || B.golfWorld.ready || tries > 300)) { try { build(); } catch (e) { console.error('golf failed to build', e); } } else { tries++; setTimeout(wait, 200); } })();
})();
