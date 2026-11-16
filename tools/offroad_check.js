// Off-road self-check for physics.js:  node tools/offroad_check.js   (PHYS=<path> measures another physics.js)
// Scripted drives on flat grass / gravel / asphalt and a 10% slope for three cars (rear-drive drift build,
// front-drive, rear-drive pickup), prints the table and asserts that loose ground is drivable but looser than asphalt.
// measure() is exported so the same drives can be replayed on the real terrain (env from W.heightXZ / W.surface) in the browser.

/** site(kind, surf) -> { env, x, y, psi }; kind: 'line' (accelerate, brake), 'slope' (10% climb), 'pad' (corner, flick). */
function measure(P, site) {
  const DT = 1 / 240, MPH = 2.23694, f1 = (v) => Math.round(v * 10) / 10;
  const rows = [];
  for (const surf of [0, 2, 1]) for (const [id, drift] of [['mazda3', true], ['passat', false], ['ranger', false]]) {
    const spec = P.CARS.find((c) => c.id === id);
    let env;
    const start = (kind, mph) => {
      const s = site(kind, surf), c = P.makeCar(spec, drift), v = mph / MPH;
      env = s.env; c.x = s.x; c.y = s.y; c.psi = s.psi; c.vx = v * Math.cos(s.psi); c.vy = v * Math.sin(s.psi);
      c.w.fill(v / c.spec.R); c.gear = v > 9 ? 2 : 1; c.x0 = s.x; c.y0 = s.y; return c;
    };
    const inp = { steer: 0, gas: 0, brake: 0, handbrake: 0, assist: true };
    const run = (c, secs, drive, each) => { for (let t = 0; t < secs; t += DT) { inp.steer = inp.gas = inp.brake = 0; drive(t, c); P.step(c, inp, DT, env); if (each && each(t, c)) break; } };
    const dist = (c) => Math.hypot(c.x - c.x0, c.y - c.y0);

    // 0-30 mph and speed after 15 s, full throttle
    let c = start('line', 0), t30 = null, d30 = null;
    run(c, 15, () => { inp.gas = 1; }, (t, c) => { if (t30 === null && c.speed * MPH >= 30) { t30 = t; d30 = dist(c); } });
    const v15 = c.speed * MPH;
    // pull away up the slope: metres climbed and speed after 6 s
    c = start('slope', 0); run(c, 6, () => { inp.gas = 1; });
    const climb = dist(c), climbMph = c.speed * MPH;
    // brake from 30 mph
    c = start('line', 30); run(c, 12, () => { inp.brake = 1; }, (t, c) => c.speed < 0.5);
    const stop = dist(c);
    // constant steer 0.4, driver holds 25 mph
    c = start('pad', 25); let cornB = 0, rSum = 0, gSum = 0, m = 0, vMin = 99;
    run(c, 8, (t, c) => { inp.steer = 0.4; inp.gas = Math.max(0, Math.min(1, (25 / MPH - c.speed) * 0.6)); }, (t, c) => {
      cornB = Math.max(cornB, Math.abs(Math.atan2(c.v, c.u))); if (t > 5) { rSum += c.r; gSum += c.r * c.speed / 9.81; m++; vMin = Math.min(vMin, c.speed * MPH); } });
    // 1 s full-lock flick at 30 mph on a held throttle, then hands off: time until the slide is over
    c = start('pad', 30); let flickB = 0, last = 1;
    run(c, 7, (t) => { inp.gas = 1; inp.steer = t < 1 ? 1 : 0; }, (t, c) => { const b = Math.abs(Math.atan2(c.v, c.u)); flickB = Math.max(flickB, b); if (b >= 0.1) last = t; });
    // keyboard style: full lock + full throttle from 25 mph for 5 s
    c = start('pad', 25); let kbB = 0;
    run(c, 5, () => { inp.gas = 1; inp.steer = 1; }, (t, c) => { kbB = Math.max(kbB, Math.abs(Math.atan2(c.v, c.u))); });
    const kbMph = c.speed * MPH;
    rows.push({ surf: ['grass', 'asphalt', 'gravel'][surf], car: id + (drift ? '*' : ''), t30: t30 === null ? null : f1(t30), d30: d30 === null ? null : Math.round(d30), v15: Math.round(v15),
      climb_m: f1(climb), climbMph: f1(climbMph), stop_m: f1(stop), cornBeta: Math.round(cornB * 57.3), cornYaw: f1(rSum / m * 57.3), cornG: Math.round(gSum / m * 100) / 100, cornMinMph: Math.round(vMin),
      flickBeta: Math.round(flickB * 57.3), recover_s: f1(last - 1), kbBeta: Math.round(kbB * 57.3), kbMph: Math.round(kbMph) });
  }
  return rows;
}

if (typeof module !== 'undefined') module.exports = { measure };
if (typeof require !== 'undefined' && require.main === module) {
  require(process.env.PHYS ? require('path').resolve(process.env.PHYS) : '../physics.js');
  const assert = require('assert');
  const rows = measure(globalThis.DriftPhysics, (kind, surf) => ({ x: 0, y: 0, psi: 0, env: { height: kind === 'slope' ? (x) => 0.1 * x : () => 0, surface: () => surf } }));
  console.table(rows);
  const row = (surf, car) => rows.find((r) => r.surf === surf && r.car.startsWith(car));
  // before the off-road retune (grass mu 0.55 rr 0.09, gravel mu 0.70) grass gave: 0-30 in 9.5 / 8.0 / 11.6 s, 16.1 / 17.4 / 18.5 m stops,
  // 7.5 / 10.6 / 4.3 mph after 6 s up the slope and a 2.0 s flick recovery for the drift Mazda3
  for (const car of ['mazda3', 'passat', 'ranger']) {
    const g = row('grass', car), v = row('gravel', car), a = row('asphalt', car);
    for (const r of [g, v]) {
      assert(r.t30 < 9.3 && r.climbMph > 10, `${car} bogs down on ${r.surf}: 0-30 in ${r.t30} s, ${r.climbMph} mph after 6 s up a 10% slope`);
      assert(r.stop_m < 15.8, `${car} takes ${r.stop_m} m to stop from 30 mph on ${r.surf}`);
      assert(r.cornBeta < 25 && r.cornG > 0.42 && r.cornMinMph > 18, `${car} does not hold a line on ${r.surf}: slip ${r.cornBeta} deg, ${r.cornG} g, down to ${r.cornMinMph} mph`);
      assert(r.flickBeta < 45 && r.recover_s < 1.8 && r.kbBeta < 90, `${car} spins on ${r.surf}: flick ${r.flickBeta} deg, ${r.recover_s} s to recover, ${r.kbBeta} deg at full lock and throttle`);
    }
    // still loose: grass < gravel < asphalt
    assert(g.stop_m > v.stop_m * 1.1 && v.stop_m > a.stop_m * 1.1, `${car} braking order ${g.stop_m} / ${v.stop_m} / ${a.stop_m} m`);
    assert(g.cornG < v.cornG && v.cornG < a.cornG * 0.93, `${car} cornering order ${g.cornG} / ${v.cornG} / ${a.cornG} g`);
    assert(g.t30 > v.t30 * 1.2 && v.t30 > a.t30 * 1.2 && g.v15 < a.v15 * 0.8, `${car} too quick off-road: 0-30 in ${g.t30} / ${v.t30} / ${a.t30} s, ${g.v15} vs ${a.v15} mph after 15 s`);
  }
  console.log('offroad check OK');
}
