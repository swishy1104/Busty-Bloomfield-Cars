// Stress test, run in the page: node tools/shot.js out.png "click:#bDrive" "$(cat tools/monkey_page.js)"
// Random driving, button clicks, keys, car swaps, teleports and races; reports exceptions and non-finite car state.
(async () => { const g = BD.game, W = g.world, errs = [], log = []; let seed = +(window.MONKEY_SEED || 7), n = 0;
  const r = () => { seed = seed * 1664525 + 1013904223 >>> 0; return seed / 4294967296; }, pick = (a) => a[r() * a.length | 0];
  window.addEventListener('error', (e) => errs.push('ERR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  const oe = console.error; console.error = (...a) => { errs.push('console.error ' + a.map(String).join(' ').slice(0, 200)); oe.apply(console, a); };
  const keys = ['KeyR', 'KeyC', 'KeyG', 'KeyP', 'Escape', 'KeyM', 'KeyJ', 'KeyT', 'KeyH', 'KeyE', 'KeyQ', 'Enter', 'Tab', 'KeyV', 'KeyL', 'KeyN', 'KeyB', 'Digit1', 'Digit2'];
  const ids = DriftPhysics.CARS.map((c) => c.id), roads = W.roads.filter((s) => s.X.length > 8);
  const act = { drive() { g.advance(0.2 + r() * 2.5, { gas: r() < 0.8 ? r() : 0, brake: r() < 0.2 ? r() : 0, steer: r() * 2 - 1, handbrake: r() < 0.25 ? 1 : 0 }); },
    click() { const b = [...document.querySelectorAll('button, .chip, input[type=range]')].filter((e) => e.offsetParent !== null && !e.disabled); if (b.length) { const e = pick(b); log.push('click ' + (e.id || e.textContent.trim().slice(0, 14))); e.click(); } },
    key() { const k = pick(keys); log.push(k); for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { code: k, key: k, bubbles: true })); },
    car() { g.setCar(pick(ids), r() < 0.5); }, tele() { const s = pick(roads), k = r() * (s.X.length - 2) | 0; g.placeCar(s.X[k], -s.Z[k], r() * 6.28); },
    race() { if (g.courses.length) g.startRace(pick(g.courses)); }, wild() { g.placeCar((r() - 0.5) * 2 * W.PLAY, (r() - 0.5) * 2 * W.PLAY, r() * 6.28); },
    frame() { return new Promise((res) => setTimeout(res, 60)); } };
  const bag = ['drive', 'drive', 'drive', 'drive', 'click', 'click', 'key', 'key', 'car', 'tele', 'race', 'wild', 'frame'];
  for (; n < 700 && errs.length < 12; n++) { const a = pick(bag); log.push(a); if (log.length > 14) log.shift();
    try { await act[a](); } catch (e) { errs.push('THROW in ' + a + ': ' + e.message + ' | ' + (e.stack || '').split('\n')[1]); }
    const c = g.car; for (const k of ['x', 'y', 'psi', 'vx', 'vy', 'r', 'rpm', 'h', 'speed']) if (!isFinite(c[k])) { errs.push('NaN car.' + k + ' after ' + log.slice(-6).join(',')); g.setCar(c.spec.id, false); g.placeCar(-150, 57, 0); break; }
    if ((Math.abs(c.x) > W.HALF + 5 || Math.abs(c.y) > W.HALF + 5) && !(W.inCorridor && W.inCorridor(c.x, -c.y))) errs.push('car left the map ' + (c.x | 0) + ',' + (c.y | 0) + ' after ' + log.slice(-6).join(',')), g.placeCar(-150, 57, 0);
    if (c.speed > 120) errs.push('speed ' + (c.speed | 0) + ' m/s after ' + log.slice(-6).join(',')), g.placeCar(-150, 57, 0); }
  console.error = oe; return JSON.stringify({ steps: n, errors: errs.length, list: [...new Set(errs)].slice(0, 12), mode: g.mode, panel: g.panel }); })()
