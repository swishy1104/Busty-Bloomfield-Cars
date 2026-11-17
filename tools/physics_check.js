// Self-check for physics.js:  node tools/physics_check.js   (asserts plausible real-car numbers + a holdable drift)
require('../physics.js');
const assert = require('assert');
const P = globalThis.DriftPhysics, DT = 1 / 240, MPH = 2.23694;
const flat = { height: () => 0, surface: () => 1 };
const run = (c, inp, secs, env = flat, each) => { for (let t = 0; t < secs; t += DT) { P.step(c, typeof inp === 'function' ? inp(t, c) : inp, DT, env); if (each) each(t, c); } };
const I = (o) => Object.assign({ steer: 0, gas: 0, brake: 0, handbrake: 0 }, o);
const verbose = process.argv.includes('-v');
const rows = [];
for (const spec of P.CARS) {
  if (spec.hidden) continue;      // the golf cart (24 km/h) is not a car: player.js drives it, the garage hides it
  // 0-60 mph, stock
  let c = P.makeCar(spec, false), t60 = null;
  run(c, I({ gas: 1 }), 20, flat, (t, c) => { if (t60 === null && c.speed * MPH >= 60) t60 = t; });
  const vmax = c.speed * MPH;
  // 60-0 braking distance
  c = P.makeCar(spec, false); c.vx = 60 / MPH; c.w.fill(c.vx / c.spec.R); c.gear = 3;
  let stop = null; run(c, I({ brake: 1 }), 6, flat, (t, c) => { if (stop === null && c.speed < 0.5) stop = c.x; });
  // steady cornering grip: hold steering at 22 m/s, measure peak lateral g
  c = P.makeCar(spec, false); c.vx = 22; c.w.fill(22 / c.spec.R); c.gear = 3; let latg = 0;
  run(c, (t, c) => I({ steer: 0.5, gas: c.speed < 22 ? 0.5 : 0, assist: true }), 6, flat, (t, c) => { if (t > 2) latg = Math.max(latg, Math.abs(c.ayf) / 9.81); });
  // drift build, keyboard style: hold left + handbrake tap at ~45 mph, then hold left and full throttle for 7 s
  c = P.makeCar(spec, true); c.vx = 20; c.w.fill(20 / c.spec.R); c.gear = 2; let held = 0, maxB = 0, spun = false;
  run(c, (t) => I({ steer: 1, gas: t < 0.25 ? 0 : 1, handbrake: t > 0.25 && t < 0.6 ? 1 : 0 }), 7, flat, (t, c) => {
    const b = Math.abs(c.beta) * 57.3; maxB = Math.max(maxB, b); if (b > 12 && c.speed > 6) held += DT; if (Math.abs(Math.atan2(c.v, c.u)) * 57.3 > 100) spun = true; });   // true heading-to-travel angle (c.beta folds at 90)
  const end = { v: c.speed * MPH, b: c.beta * 57.3 };
  // parked on a 10% slope stays put
  c = P.makeCar(spec, false); run(c, I({}), 3, { height: (x) => 0.1 * x, surface: () => 1 }); const creep = Math.hypot(c.x, c.y);
  rows.push({ car: spec.id, hp: P.makeCar(spec).spec.hp, driftHp: P.makeCar(spec, true).spec.hp, t60: +t60?.toFixed(2), vmax: +vmax.toFixed(0), stop_m: +stop.toFixed(1), latg: +latg.toFixed(2), driftHeld_s: +held.toFixed(1), maxAngle: +maxB.toFixed(0), endMph: +end.v.toFixed(0), endAngle: +end.b.toFixed(0), spun });
  if (verbose) console.log(rows[rows.length-1]);
  assert(t60 > 3.5 && t60 < 11, `${spec.id} 0-60 ${t60}`);
  assert(stop > 28 && stop < 52, `${spec.id} braking ${stop}`);
  assert(latg > 0.7 && latg < 1.15, `${spec.id} lat g ${latg}`);
  assert(held > 2.5 && maxB > 20 && !spun, `${spec.id} drift held ${held}s max ${maxB} spun ${spun}`);
  assert(creep < 0.05, `${spec.id} creeps on slope ${creep}`);
  assert([c.x, c.y, c.psi, c.r].every(Number.isFinite));
}
console.table(rows);
console.log('physics check OK');
