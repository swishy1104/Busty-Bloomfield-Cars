/* Bloomfield Drift — game loop, input, camera, HUD, drift scoring, effects, garage, races + course editor.
   Add-on modules (streets, landmarks, traffic, challenges, fx, audio) plug in through BD.game: see the api object below. */
(function () {
  'use strict';
  const T = THREE, P = window.DriftPhysics, B = window.BD;
  const $ = (id) => document.getElementById(id);
  const MPH = 2.23694, DT = 1 / 240, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bd.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bd.' + k, JSON.stringify(v)); } catch (e) { /* storage is optional */ } },
  };
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const S = { leaves: store.get('leaves', true), car: store.get('car', 'mazda3'), drift: store.get('drift', true), quality: store.get('quality', isTouch ? 0 : 2), assist: store.get('assist', true), manual: !isTouch && store.get('manual', false), sound: store.get('sound', true), traffic: store.get('traffic', 'light'), tod: store.get('tod', 'golden') };
  if (isTouch) document.body.classList.add('touch');
  // volume sliders (Options): master, engine, music 0..1, saved as bd.vol.*; audio.js scales its sound by them and hands master x music to the radio
  const VOL = { master: 0.8, engine: 0.8, music: 0.6 };
  for (const k in VOL) VOL[k] = clamp(+store.get('vol.' + k, VOL[k]) || 0, 0, 1);

  let renderer, scene, camera, W, car, view, env, mode = 'title', panel = null, panelBack = null, time = 0, camMode = 0, camA = 0, camD = 0, shake = 0, crash = 0, crashT = 0, postK = -1, postT = 0;
  const inp = { steer: 0, gas: 0, brake: 0, handbrake: 0, assist: true };
  const keys = new Set(), touch = { l: 0, r: 0, gas: 0, brk: 0, hb: 0 };
  const D = { pts: 0, mult: 1, time: 0, grace: 0, total: 0, best: store.get('bestDrift', 0) };
  const safe = { x: 0, y: 0, psi: 0, ok: false }, home = { x: 0, y: 0, psi: 0 }, posts = new Map(), errs = new Set();
  let wet = 0, slowT = 0, slowN = 0, perfLast = 0, fx = null, lastGear = 1, photo = null;
  let autoQ = store.get('quality', -1) === -1;      // graphics level never chosen by hand: step it down if the machine struggles
  const paints = store.get('paints', {});     // car id -> chosen paint colour (0xRRGGBB); absent = factory colour

  // ------------------------------------------------------------------ module API (also used by tools/shot.js)
  // Events: frame(dt, driving, time) every frame after physics | crash(speed m/s) | land(speed) | shift(gear) | bank(points)
  //         car(spec) | drive() | raceStart(course) | raceGate(index, total) | raceFinish(seconds, isBest) | raceQuit()
  const listeners = {};
  const api = B.game = {
    cam: null,                 // [X,Y,Z, lookX,lookY,lookZ, fov] pins the camera (world coords)
    markers: [],               // minimap markers modules may push: { x, y (map coords, y north), c: css colour, r: radius px }
    store, drift: D, settings: S, isTouch,
    get car() { return car; }, get view() { return view; }, get world() { return W; }, get courses() { return courses; }, get race() { return race; },
    get mode() { return mode; }, get panel() { return panel; }, get time() { return time; }, get input() { return inp; },
    on(name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); },
    emit(name, a, b, c) { const l = listeners[name]; if (l) for (const fn of l) try { fn(a, b, c); } catch (e) { logOnce(name, e); } if (B.audio && B.audio.event) try { B.audio.event(name, a, b, c); } catch (e) { logOnce('audio', e); } },
    toast: (m) => toast(m), openPanel: (id) => openPanel(id), closePanel: () => closePanel(),
    placeCar: (x, y, psi) => placeCar(x, y, psi), setCar: (id, drift) => setCar(id, drift), startRace: (c) => startRace(c),
    /** Adds a button to the top-right menu; returns the element. */
    addMenuButton(label, onClick) { const b = document.createElement('button'); b.className = 'btn ghost small'; b.textContent = label; b.onclick = onClick; $('menu').insertBefore(b, $('bReset')); const p = document.createElement('button'); p.className = 'btn'; p.textContent = label; p.onclick = onClick; $('pauseExtra').append(p); return b; },   // also listed in the pause menu (the only menu on phones)
    /** Fast-forwards the simulation without rendering (headless checks). */
    advance(sec, i) { Object.assign(inp, { steer: 0, gas: 0, brake: 0, handbrake: 0, assist: S.assist }, i); for (let t = 0; t < sec; t += 1 / 60) { for (let q = 0; q < 4; q++) { P.step(car, inp, DT, env); collideCar(); } afterPhysics(1 / 60); api.emit('frame', 1 / 60, true, time += 1 / 60); } },
  };

  // one bad add-on must not stop the game: its error is logged once and the frame carries on
  function logOnce(where, e) { const k = where + (e && e.message); if (!errs.has(k)) { errs.add(k); console.error('module error in ' + where, e); } }

  // ------------------------------------------------------------------ boot
  async function boot(hot) {
    const canvas = $('view');
    try { renderer = new T.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' }); }
    catch (e) { $('loadText').textContent = 'This browser cannot start WebGL, which the game needs.'; return; }
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(60, 1, 0.7, 12000);
    Object.assign(api, { renderer, scene, camera });
    try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load('40px "Alfa Slab One"'), document.fonts.load('30px "Barlow Condensed"')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fall back to system fonts on signs */ }
    try { W = await B.buildWorld(scene, { small: isTouch }, (msg, f) => { $('loadText').textContent = msg; $('loadFill').style.width = Math.round(f * 100) + '%'; }); }
    catch (e) { $('loadText').textContent = 'The map could not be loaded. Reload the page to try again.'; throw e; }
    if (B.buildRoutes) try { $('loadText').textContent = 'Laying the roads out of town'; await B.buildRoutes({ scene, W, M: window.BLOOMFIELD, game: api }); } catch (e) { console.error('detail module failed: routes', e); }
    if (B.makeEnv) try { scene.environment = B.makeEnv(renderer); } catch (e) { console.error('reflection environment failed', e); }
    // add-on modules hang their meshes on the scene, their obstacles on W, and listen on the api; the town still loads if one fails
    W.dynamic = [];            // moving obstacles (traffic): { x, z (world), r, vx, vz, hit(speed, nx, nz)? }
    for (const [name, build] of [['street furniture', B.buildStreets], ['landmarks', B.buildLandmarks], ['hero buildings', B.buildHeroes], ['traffic', B.buildTraffic], ['challenges', B.buildChallenges]]) if (build) {
      $('loadText').textContent = 'Setting out ' + name; await new Promise((r) => setTimeout(r, 0));
      try { build({ scene, W, M: window.BLOOMFIELD, game: api }); } catch (e) { console.error('detail module failed: ' + name, e); }
    }
    $('loadText').textContent = 'Ready';
    if (B.buildFx) try { fx = B.buildFx({ renderer, scene, camera, W, game: api }); } catch (e) { console.error('post-processing failed', e); fx = null; }
    W.buildCollision();
    env = { height: (x, y) => W.heightXZ(x, -y), surface: (x, y) => W.surface(x, -y) };
    initEffects(); initRaceObjects();
    setCar(S.car, S.drift);
    const st = W.nearestRoad(-150, -57, 80); Object.assign(home, { x: st.x, y: -st.z, psi: 0 });
    placeCar(hot && hot.x !== undefined ? hot.x : home.x, hot && hot.y !== undefined ? hot.y : home.y, hot && hot.psi !== undefined ? hot.psi : 0);
    const ob = W.obstacles; for (let k = 0; k < ob.length; k += 3) if (ob[k + 2] < 0.35) { const c = cell(ob[k], ob[k + 1]); (posts.get(c) || posts.set(c, []).get(c)).push(k); }
    setTod(S.tod); W.setLeaves(S.leaves);
    applyQuality(); resize(); addEventListener('resize', resize);
    courses = PRESETS.map(snapCourse).concat(store.get('courses', []));
    $('load').hidden = true; for (const id of ['bDrive', 'bTitleCars', 'bTitleRace', 'bTitleOptions']) $(id).disabled = false;
    if (hot && hot.driving) startDriving();
    let last = performance.now();
    // real time down to 10 fps (the cap was 0.05 s: under 20 fps the whole game ran in slow motion)
    (function loop(now) { requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000); last = now; frame(dt); })(last);
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ x: car.x, y: car.y, psi: car.psi, driving: mode !== 'title' }));
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, [1, 1.5, 2][S.quality]);
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false); if (fx && fx.resize) fx.resize(w, h, pr);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (smokeMat) smokeMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  }
  function applyQuality() {
    renderer.shadowMap.enabled = S.quality > 0; W.setQuality(S.quality); if (fx && fx.setQuality) fx.setQuality(S.quality);
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    resize();
  }

  // ------------------------------------------------------------------ car
  function setCar(id, drift) {
    const spec = P.CARS.find((c) => c.id === id) || P.CARS[0], old = car;
    car = P.makeCar(spec, drift); car.manual = S.manual;
    if (old) { car.x = old.x; car.y = old.y; car.psi = old.psi; }
    if (view) scene.remove(view.group);
    view = B.buildCar(car.spec); view.group.rotation.order = 'YZX'; view.spin = [0, 0, 0, 0]; view.hood = hoodCam(view, car.spec); scene.add(view.group);
    carLights();
    const factory = lin(spec.color).getHex(); view.paint = new Set();      // every material in the factory colour is body paint
    view.group.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.color && m.color.getHex() === factory) view.paint.add(m); });
    if (paints[spec.id] !== undefined) for (const m of view.paint) m.color.copy(lin(paints[spec.id]));
    S.car = spec.id; S.drift = !!drift; store.set('car', S.car); store.set('drift', S.drift);
    if (ghost) { scene.remove(ghost); ghost = null; }
    lastGear = car.gear; syncCar(0); buildTach(car.spec.redline); api.emit('car', car.spec);
  }
  // time of day: the world's lighting and exposure, and the player's lamps (lit at dusk; real headlight beams at night)
  function carLights() { if (view && view.setLights) view.setLights(W.time === 'dusk' || W.time === 'night', W.time === 'night'); }
  function setTod(v) { renderer.toneMappingExposure = W.setTime(v); carLights(); }
  // tachometer face: a tick every 500 rpm and a number every 1,000 along the arc (centre 115,118, radius 88 in the dash's 230x128 box)
  let tachRed = 0;
  function buildTach(red) {
    const g = $('tachTicks'), ns = 'http://www.w3.org/2000/svg'; if (!g || tachRed === red) return; tachRed = red; g.textContent = '';
    for (let k = 0; k * 500 <= red; k++) {
      const a = Math.PI * (1 - k * 500 / red), c = Math.cos(a), sn = Math.sin(a), big = k % 2 === 0, r0 = big ? 75 : 78;
      const l = document.createElementNS(ns, 'line'); l.setAttribute('x1', (115 + c * r0).toFixed(1)); l.setAttribute('y1', (118 - sn * r0).toFixed(1)); l.setAttribute('x2', (115 + c * 81.5).toFixed(1)); l.setAttribute('y2', (118 - sn * 81.5).toFixed(1)); if (!big) l.setAttribute('class', 'minor'); g.appendChild(l);
      if (big) { const t = document.createElementNS(ns, 'text'); t.setAttribute('x', (115 + c * 66).toFixed(1)); t.setAttribute('y', (118 - sn * 66 + 4.3).toFixed(1)); t.textContent = k / 2; g.appendChild(t); }
    }
  }
  // hood cam: measured from the car model so the hood fills about the bottom fifth of the view on a Miata and a Ranger alike
  function hoodCam(v, s) {
    const nx = v.noseX || s.L / 2, p = new T.Vector3(); let top = 0, front = 0; v.group.updateMatrixWorld(true);
    v.group.traverse((o) => { const a = o.isMesh && o.geometry.attributes.position; if (a) for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); if (p.x > 0.45 * nx && Math.abs(p.z) < 0.45) { top = Math.max(top, p.y); if (p.x > 0.8 * nx) front = Math.max(front, p.y); } } });
    if (!top) top = front = s.H * 0.75;
    return [0.4 * nx, Math.max(top + 0.12, front + 0.18 * nx)];      // the front edge of the hood about 17 degrees below the horizon
  }
  function placeCar(x, y, psi) {
    Object.assign(car, { x, y, psi, vx: 0, vy: 0, r: 0, steer: 0, gear: 1, fresh: true, air: false, gap: 0, axf: 0, ayf: 0, anf: 0, thr: 0, brk: 0, rpm: car.spec.idle, pitch: 0, roll: 0, h: 0, vh: 0, land: 0, fall: 0 }); car.w.fill(0);
    camA = Math.atan2(-Math.sin(psi), Math.cos(psi)); camD = 0; skidOn.fill(0);
    P.step(car, { steer: 0, gas: 0, brake: 1, handbrake: 1 }, DT, env); car.gear = 1; syncCar(0);
  }
  function resetCar() {     // onto the nearest street; in a race, the street where the car last ran clean, clock still running
    const q = race && race.state !== 'done' && safe.ok ? safe : car, r = W.nearestRoad(q.x, -q.y, 600); if (!r) return;
    let psi = Math.atan2(-r.tz, r.tx); if (Math.cos(psi - q.psi) < 0) psi += Math.PI;
    placeCar(r.x, -r.z, psi);
  }
  function syncCar(dt) {
    const g = view.group, s = car.spec;
    g.position.set(car.x, car.h + 0.06, -car.y); g.rotation.set(car.roll, car.psi, car.pitch);
    view.steer[0].rotation.y = view.steer[1].rotation.y = car.steer;
    for (let i = 0; i < 4; i++) { view.spin[i] -= car.w[i] * dt; view.wheels[i].rotation.z = view.spin[i]; }
    view.brake.color.setHex(car.brk > 0.05 || inp.handbrake ? 0xff2a1a : 0x6a0a0a);
  }
  const cell = (X, Z) => Math.floor(X / 4) * 4096 + Math.floor(Z / 4);
  // thin posts (signs, poles: r < 0.35) break away: which circle W.collide hit is found from the depth it reports
  // ponytail: the post stays standing and is passed through for 1 s; streets.js could knock it over on 'crash'
  function postAt(X, Z, R, depth) {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = posts.get(cell(X + i * 4, Z + j * 4)), ob = W.obstacles; if (l) for (const k of l) if (Math.abs(R + ob[k + 2] - Math.hypot(X - ob[k], Z - ob[k + 1]) - depth) < 0.01) return k; }
    return -1;
  }
  function collideCar() {
    const s = car.spec, cs = Math.cos(car.psi), sn = Math.sin(car.psi), off = (s.a - s.b) / 2, d = s.L / 2 - s.W / 2;
    for (let q = 0; q < 2; q++) {
      const o = q ? off - d : off + d, rx = cs * o, ry = sn * o, X = car.x + rx, Z = -(car.y + ry), h = W.collide(X, Z, s.W / 2); if (!h) continue;
      const post = posts.size ? postAt(X, Z, s.W / 2, h.depth) : -1; if (post >= 0 && post === postK && time - postT < 1) continue;
      const nx = h.nx, ny = -h.nz; car.x += nx * h.depth; car.y += ny * h.depth;
      const vpx = car.vx - car.r * ry, vpy = car.vy + car.r * rx, vn = vpx * nx + vpy * ny; if (vn >= 0) continue;
      const rn = rx * ny - ry * nx; let j = -1.2 * vn / (1 / s.m + rn * rn / s.Izz);
      if (post >= 0) { postK = post; postT = time; j = Math.min(j, 3.5 * s.m); }     // a post takes off at most 3.5 m/s and barely turns the car
      car.vx += j * nx / s.m; car.vy += j * ny / s.m; car.r += rn * j / s.Izz * (post >= 0 ? 0.2 : 1);
      const vt = vpx * -ny + vpy * nx, jt = clamp(-vt * s.m * 0.25, -0.35 * j, 0.35 * j);     // scrub along the wall
      car.vx += jt * -ny / s.m; car.vy += jt * nx / s.m;
      const hv = post >= 0 ? j / s.m : -vn; if (hv > crash) { crash = hv; hitX = car.x + rx - nx * s.W / 2; hitZ = -(car.y + ry - ny * s.W / 2); }
    }
    for (const o of W.dynamic) {     // traffic: a car of about 1500 kg, so a nudge shoves it rather than stopping the player dead
      if (Math.abs(o.x - car.x) > 8 || Math.abs(o.z + car.y) > 8) continue;
      for (let q = 0; q < 2; q++) {
        const rx = cs * (q ? off - d : off + d), ry = sn * (q ? off - d : off + d), dx = car.x + rx - o.x, dy = car.y + ry + o.z, dist = Math.hypot(dx, dy), pen = s.W / 2 + o.r - dist; if (pen <= 0 || dist < 1e-4) continue;
        const nx = dx / dist, ny = dy / dist; car.x += nx * pen; car.y += ny * pen;
        const vn = (car.vx - car.r * ry - o.vx) * nx + (car.vy + car.r * rx + o.vz) * ny; if (vn >= 0) continue;
        const rn = rx * ny - ry * nx, j = -1.3 * vn / (1 / s.m + 1 / 1500 + rn * rn / s.Izz);
        car.vx += j * nx / s.m; car.vy += j * ny / s.m; car.r += rn * j / s.Izz; if (-vn > crash) { crash = -vn; hitX = car.x + rx - nx * s.W / 2; hitZ = -(car.y + ry - ny * s.W / 2); }
        if (o.hit) o.hit(j / 1500, -nx, ny);      // the traffic car's change of speed
      }
    }
    const lim = W.PLAY;
    if ((Math.abs(car.x) > lim || Math.abs(car.y) > lim) && W.inCorridor && W.inCorridor(car.x, -car.y)) return;     // the roads out of town (routes.js) fence their own sides
    if (Math.abs(car.x) > lim) { if (Math.abs(car.x) > lim + 2) car.fresh = true; car.x = Math.sign(car.x) * lim; car.vx *= -0.3; toast('Edge of the map. Turn around.'); }      // a big move re-seats the car on the ground (no launch)
    if (Math.abs(car.y) > lim) { if (Math.abs(car.y) > lim + 2) car.fresh = true; car.y = Math.sign(car.y) * lim; car.vy *= -0.3; toast('Edge of the map. Turn around.'); }
  }

  // ------------------------------------------------------------------ input
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Escape') e.target.blur(); return; }
    const onBtn = (mode === 'title' || panel) && document.activeElement && document.activeElement.matches('button:focus-visible');     // menus: Space/Enter press a button reached by keyboard or pad
    if (GAME_KEYS.includes(e.code) && !onBtn) e.preventDefault();
    if (e.repeat) return; keys.add(e.code); initAudio();
    if (photo) photoWake();
    if (e.code === 'Escape') { if (photo) setPhoto(false); else if (panel) back(); else pause(); return; }
    if (mode === 'title') { if (!panel && !onBtn && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); startDriving(); } return; }
    if (panel) { if (e.code === 'Enter' && panel === 'pFinish' && !onBtn) { e.preventDefault(); $('bRetry').click(); } return; }
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    else if (e.code === 'KeyR') resetCar();
    else if (e.code === 'KeyG') openPanel('pGarage');
    else if (e.code === 'KeyM') openPanel('pCourses');
    else if (e.code === 'KeyO') openPanel('pOptions');
    else if (e.code === 'KeyH') openPanel('pHelp');
    else if (e.code === 'KeyT') openDropMap();
    else if (e.code === 'KeyP') setPhoto(!photo);
    else if (e.code === 'KeyE' || e.code === 'ShiftLeft') P.shift(car, 1);
    else if (e.code === 'KeyQ' || e.code === 'ControlLeft') P.shift(car, -1);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  let padName = null, padMap = store.get('padMap', null), padSetup = null;      // padMap: a layout captured in Options (null = the browser's standard layout)
  const padPrev = new Uint8Array(20), padHit = new Uint8Array(20);
  const PAD_STD = { steer: { a: 0, s: 1 }, gas: { b: 7 }, brake: { b: 6 }, hb: { b: 0 }, up: { b: 5 }, down: { b: 4 }, cam: { b: 3 }, reset: { b: 1 }, pause: { b: 9 } };
  const PAD_ACTS = ['gas', 'brake', 'hb', 'up', 'down', 'cam', 'reset', 'pause'], padWas = {}, padEdge = {}, PAD_NONE = { steer: { a: 0, s: 1 } }, menuWas = {}, menuEdge = {};
  // a control is a button {b} or an axis {a, r: rest value, t: the end it travels to} (triggers are axes on some pads); 0..1
  const padVal = (gp, m) => { if (!m) return 0; if (m.b !== undefined) { const q = gp.buttons[m.b]; return q ? Math.max(q.value || 0, q.pressed ? 1 : 0) : 0; } const v = gp.axes[m.a]; return v === undefined ? 0 : clamp((v - m.r) / (m.t - m.r), 0, 1); };
  const PAD_STEPS = [['steer', 'Push the LEFT STICK to the right'], ['gas', 'Pull the GAS trigger (right trigger)'], ['brake', 'Pull the BRAKE trigger (left trigger)'], ['hb', 'Press HANDBRAKE (A)'], ['up', 'Press SHIFT UP (right bumper)'], ['down', 'Press SHIFT DOWN (left bumper)'], ['cam', 'Press CAMERA (Y)'], ['reset', 'Press RESET (B)'], ['pause', 'Press PAUSE (Start)']];
  function padSetupStart(auto) { padSetup = { i: 0, map: {}, rest: null, idle: false }; openPanel('pPad', auto ? null : 'pOptions'); $('padStep').textContent = padRef ? '' : 'Press any button on the controller to begin'; if (padRef) padStepText(); }
  function padStepText() { $('padStep').textContent = (padSetup.i + 1) + ' of ' + PAD_STEPS.length + ': ' + PAD_STEPS[padSetup.i][1]; }
  function padOptText() { const g = padRef; $('padOpt').textContent = g ? 'Controller connected: ' + padName.replace(/\s*\(.*$/, '').trim() + ' · ' + g.buttons.length + ' buttons, ' + g.axes.length + ' axes, ' + (g.mapping === 'standard' ? 'standard layout' : 'non-standard layout: use Set up buttons') + (padMap ? ' · custom layout in use' : '') : 'No controller detected. Click in the game, then press any button on the controller.'; }
  function padCapture(gp) {     // one step per control: wait for a quiet pad, then take the first button pressed or axis moved
    const s = padSetup; if (panel !== 'pPad') { padSetup = null; return; }
    if (!s.rest) { s.rest = Array.from(gp.axes); padStepText(); return; }
    const quiet = !gp.buttons.some((b) => b.pressed || b.value > 0.3) && gp.axes.every((v, i) => Math.abs(v - s.rest[i]) < 0.3);
    $('padLive').textContent = 'Your pad right now · buttons down: ' + (gp.buttons.map((b, i) => b.pressed || b.value > 0.3 ? i : -1).filter((i) => i >= 0).join(' ') || 'none') + ' · axes: ' + Array.from(gp.axes, (v) => v.toFixed(1)).join(' ');
    if (!s.idle) { if (quiet) s.idle = true; return; }
    const key = PAD_STEPS[s.i][0]; let m = null;
    for (let i = 0; i < gp.buttons.length && !m; i++) if (gp.buttons[i].pressed || gp.buttons[i].value > 0.6) m = { b: i };
    for (let i = 0; i < gp.axes.length && !m; i++) { const d = gp.axes[i] - s.rest[i]; if (Math.abs(d) > 0.6) m = key === 'steer' ? { a: i, s: Math.sign(d), r: s.rest[i] } : { a: i, r: s.rest[i], t: Math.sign(d) }; }
    if (!m || (key === 'steer' && m.b !== undefined)) return;
    s.map[key] = m; s.idle = false; s.i++;
    if (s.i < PAD_STEPS.length) { padStepText(); return; }
    $('padLive').textContent = ''; padMap = s.map; store.set('padMap', padMap); padSetup = null; padOptText(); if (panelBack) openPanel('pOptions'); else closePanel(); toast('Controller set up');
  }     // standard pad buttons 0-15, then 16/17 = left stick up/down, 18/19 = left stick left/right
  function readInput() {
    let steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + touch.l - touch.r;
    let gas = keys.has('KeyW') || keys.has('ArrowUp') || touch.gas ? 1 : 0, brake = keys.has('KeyS') || keys.has('ArrowDown') || touch.brk ? 1 : 0, hb = keys.has('Space') || touch.hb ? 1 : 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null; let gp = null;
    if (pads) for (let i = 0; i < pads.length; i++) { const g = pads[i]; if (g && g.connected && g.buttons.length >= 4) { gp = g; break; } }
    padRef = gp; const pn = gp ? gp.id : null;
    if (pn !== padName) { padName = pn; const short = pn ? pn.replace(/\s*\(.*$/, '').trim() || 'Gamepad' : null; $('padStatus').textContent = short ? 'Controller connected: ' + short : 'No controller detected. Click in the game, then press any button on the controller.'; if (mode !== 'title') toast(short ? 'Controller connected: ' + short : 'Controller disconnected'); padOptText();
      const unknown = gp && gp.mapping !== 'standard' && !padMap; $('titlePad').hidden = !gp; if (gp) $('titlePad').textContent = 'Controller: ' + short + (unknown ? ' · layout unknown: Options → Controller → Set up buttons' : ' · ready'); }
    if (gp && gp.mapping !== 'standard' && !padMap && mode === 'drive' && !panel && !padSetup && store.get('padAsked') !== gp.id) { store.set('padAsked', gp.id); padSetupStart(true); toast('Unknown controller layout: set up its buttons'); }      // a pad the browser cannot map: ask once, while driving
    if (gp) {
      const M = padMap || (gp.mapping === 'standard' ? PAD_STD : PAD_NONE), sv = gp.axes[M.steer.a + 1] || 0;      // the stick's vertical axis moves menus; an unknown layout drives nothing until it is set up
      const sx = ((gp.axes[M.steer.a] || 0) - (M.steer.r || 0)) * (M.steer.s || 1);      // > 0: stick right
      for (let i = 0; i < 20; i++) { const p = i < 16 ? !!(gp.buttons[i] && gp.buttons[i].pressed) : i === 16 ? sv < -0.6 : i === 17 ? sv > 0.6 : i === 18 ? sx < -0.6 : sx > 0.6; padHit[i] = p && !padPrev[i] ? 1 : 0; padPrev[i] = p ? 1 : 0; }
      for (const k of PAD_ACTS) { const p = padVal(gp, M[k]) > 0.5; padEdge[k] = p && !padWas[k] ? 1 : 0; padWas[k] = p; }
      const MM = padMap || PAD_STD, odd = !padMap && gp.mapping !== 'standard';      // menus on any pad: A (0) selects; B (1), Start (9, or 11 on Android-style pads) go back
      for (const k of ['hb', 'reset', 'pause']) { const p = padVal(gp, MM[k]) > 0.5 || (odd && k === 'pause' && padVal(gp, { b: 11 }) > 0.5); menuEdge[k] = p && !menuWas[k] ? 1 : 0; menuWas[k] = p; }
      const a0 = (gp.axes[M.steer.a] || 0) - (M.steer.r || 0), ax = Math.abs(a0) < 0.08 ? 0 : a0; steer -= (M.steer.s || 1) * Math.sign(ax) * Math.pow(Math.abs(ax), 1.6);
      gas = Math.max(gas, padVal(gp, M.gas)); brake = Math.max(brake, padVal(gp, M.brake)); hb = Math.max(hb, padVal(gp, M.hb));
      if (padSetup) padCapture(gp);
      else if (photo) { if (menuEdge.reset || menuEdge.pause) setPhoto(false); }
      else if (panel || mode === 'title') padMenu();
      else if (B.player && B.player.onFoot) { if (padEdge.pause) pause(); }      // on foot: player.js and golf.js own the other buttons
      else { if (padEdge.up) P.shift(car, 1); if (padEdge.down) P.shift(car, -1); if (padEdge.cam) camMode = (camMode + 1) % 3; if (padEdge.reset) resetCar(); if (padEdge.pause) pause(); if (padHit[8] && !padMap && gp.mapping === 'standard') openDropMap(); }      // View / Back / Select opens the map
    }
    inp.steer = clamp(steer, -1, 1); inp.gas = gas; inp.brake = brake; inp.handbrake = hb; inp.assist = S.assist;
  }
  // menus on a pad: D-pad or stick moves the focus, A presses, B or Start goes back (Start on the title drives); on a volume
  // slider, left / right (D-pad or stick) move it by 5 %
  function padMenu() {
    const root = $(panel || 'title'), a = document.activeElement, on = a && (a.tagName === 'BUTTON' || a.type === 'range') && root.contains(a) ? a : null;
    const side = padHit[14] || padHit[18] ? -1 : padHit[15] || padHit[19] ? 1 : 0;
    const dir = padHit[12] || padHit[14] || padHit[16] ? -1 : padHit[13] || padHit[15] || padHit[17] ? 1 : menuEdge.hb && !on && panel ? 1 : 0;
    if (side && on && on.type === 'range') { if (side > 0) on.stepUp(); else on.stepDown(); on.dispatchEvent(new Event('input')); }
    else if (dir) { const l = Array.prototype.filter.call(root.querySelectorAll('button, input[type=range]'), (b) => !b.disabled && b.offsetParent), i = l.indexOf(on); if (l.length) l[i < 0 ? 0 : (i + dir + l.length) % l.length].focus({ focusVisible: true }); }
    else if (menuEdge.hb) { if (on) { if (on.tagName === 'BUTTON') on.click(); } else startDriving(); }
    else if (menuEdge.reset || menuEdge.pause) { if (panel) back(); else if (menuEdge.pause) startDriving(); }
  }
  $('tCam').onclick = () => { camMode = (camMode + 1) % 3; };      // touch: chase / far chase / hood
  [['tL', 'l'], ['tR', 'r'], ['tGas', 'gas'], ['tBrk', 'brk'], ['tHb', 'hb']].forEach(([id, key]) => {
    const el = $(id), set = (v) => (e) => { e.preventDefault(); touch[key] = v; el.classList.toggle('on', !!v); if (v) initAudio(); };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); set(1)(e); }); el.addEventListener('pointerup', set(0)); el.addEventListener('pointercancel', set(0));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ------------------------------------------------------------------ frame
  let acc = 0, tut = store.get('tutDone', 0) ? 7 : 0;
  const audioState = { car: null, driving: false, mode: '', time: 0, camera: null };
  function frame(dt) {
    time += dt; readInput();
    const driving = mode === 'drive' && !panel && !photo;
    if (driving && tut < 7) { tut |= (inp.gas ? 1 : 0) | (inp.steer ? 2 : 0) | (inp.handbrake ? 4 : 0); if (tut === 7) { tutEl.hidden = true; store.set('tutDone', 1); } }
    if (photo && !photo.faded && performance.now() - photo.seen > 2000) { photo.faded = true; photoBar.style.opacity = 0; photoBar.style.visibility = 'hidden'; }
    if (driving) {
      const frozen = race && race.state === 'count';
      if (frozen) { inp.gas = 0; inp.brake = 1; inp.handbrake = 1; inp.steer = 0; }
      acc = Math.min(acc + dt, 0.12);
      while (acc >= DT) { P.step(car, inp, DT, env); if (frozen) car.gear = 1; collideCar(); acc -= DT; }
      afterPhysics(dt);
    }
    api.emit('frame', dt, driving, time);
    updateCamera(dt, driving);
    try { W.update(dt, time, camera, mode === 'title' && panel !== 'pGarage' ? focus0 : view.group.position); } catch (e) { logOnce('world', e); }
    if (mode !== 'title') updateHud(dt);
    if (B.audio) try { const a = audioState; a.car = car; a.driving = driving; a.mode = mode; a.time = time; a.camera = camera; B.audio.update(dt, audioState); } catch (e) { logOnce('audio', e); }
    if (fx) fx.render(dt, time); else renderer.render(scene, camera);
    if (driving && dt > 0) {      // frame-rate watch on real time (a gap of many seconds is a hidden tab, not a slow machine)
      const now = performance.now(), real = now - perfLast; perfLast = now;
      if (real < 5000) { slowT += real; slowN++; }
      if (slowT > 3500) {
        const fps = slowN * 1000 / slowT; slowT = slowN = 0;
        // ponytail: one-way; it never steps back up by itself, Options does that (and switches this off)
        // the auto step stops at Medium: Low turns shadows off, which recompiles every lit shader (seconds of stall mid-drive)
        if (fps < 33 && autoQ && S.quality > 1) { S.quality--; store.set('quality', S.quality); seg('segQuality', S.quality); applyQuality(); slowT = -3000; toast('Graphics set to Medium to keep it smooth'); }
        else if (fps < 24 && S.quality > 0 && !store.get('slowTold', 0)) { toast('Running slow? Options → Graphics → Low'); store.set('slowTold', 1); }
      }
    }
  }
  function afterPhysics(dt) {
    if (!Number.isFinite(car.x + car.y + car.psi + car.vx + car.vy + car.r + car.h + car.rpm)) {     // never seen in play; a NaN must not freeze the game for good
      const p = safe.ok && Number.isFinite(safe.x + safe.y + safe.psi) ? safe : home; setCar(S.car, S.drift); placeCar(p.x, p.y, p.psi); toast('Car reset'); logOnce('physics', new Error('non-finite car state'));
    }
    syncCar(dt); updateDrift(dt); updateEffects(dt); updateRace(dt); housekeeping(dt); }
  function housekeeping(dt) {
    if (crash > 0) { if (crash > 2.5) { crashT = 0.3; shake = Math.min(1, crash / 12); sparks(crash); rumble(crash / 10, 0.6, 180 + crash * 12); api.emit('crash', crash); if (D.pts > 0) { D.pts = 0; D.time = 0; D.mult = 1; toast('Combo lost'); } } crash = 0; }
    crashT -= dt;     // a hard knock can lift a wheel for a step: no landing then
    if (car.land > 1.5 && crashT <= 0) { shake = Math.max(shake, Math.min(0.6, car.land / 8)); rumble(car.land / 7, 0.3, 160); api.emit('land', car.land); } car.land = 0;
    if ((rumbleT -= dt) <= 0) { rumbleT = 0.12; const sl = Math.max(car.slip[2], car.slip[3]); if (sl > 4 && !car.air) rumble(0, clamp((sl - 4) / 14, 0.08, 0.45), 130); }
    if (car.gear !== lastGear) { lastGear = car.gear; api.emit('shift', car.gear); }
    const onRoad = car.surf[0] === 1 && car.surf[3] === 1;
    if (onRoad && car.speed > 2 && Math.abs(car.beta) < 0.3) { safe.x = car.x; safe.y = car.y; safe.psi = car.psi; safe.ok = true; }
    if (car.surf[0] === 3 && car.surf[1] === 3 && car.surf[2] === 3 && car.surf[3] === 3) { wet += dt; if (wet > 0.7) { wet = 0; if (safe.ok) placeCar(safe.x, safe.y, safe.psi); else resetCar(); toast('Splash! Back on the road.'); } } else wet = 0;
  }

  // ------------------------------------------------------------------ camera
  const camPos = new T.Vector3(), look = new T.Vector3(), v3 = new T.Vector3(), focus0 = new T.Vector3(0, 160, 0); let camRoll = 0;
  function updateCamera(dt, driving) {
    const X = car.x, Y = car.h, Z = -car.y;
    if (B.game && B.game.cam) { const c = B.game.cam; camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); camera.fov = c[6] || 55; camera.updateProjectionMatrix(); return; }
    if (camera.view && camera.view.enabled && panel !== 'pGarage') camera.clearViewOffset();
    if (mode === 'title' && panel !== 'pGarage') { const a = time * 0.07 + 2.2; camera.position.set(Math.cos(a) * 125, W.heightXZ(0, 0) + 52, Math.sin(a) * 125 - 5); camera.lookAt(0, W.heightXZ(0, 0) + 8, -5); camera.fov = 52; camera.updateProjectionMatrix(); return; }
    if (photo) {     // photo mode: free orbit around the frozen car
      const ce = Math.cos(photo.e); camera.position.set(X + Math.cos(photo.a) * ce * photo.d, Y + 0.8 + Math.sin(photo.e) * photo.d, Z + Math.sin(photo.a) * ce * photo.d);
      camera.position.y = Math.max(camera.position.y, W.heightXZ(camera.position.x, camera.position.z) + 0.4); camera.lookAt(X, Y + 0.8, Z); camera.fov = 42; camera.updateProjectionMatrix(); return;
    }
    if (!driving) { const a = time * 0.3, gar = panel === 'pGarage'; let rd = gar && camera.aspect < 1 ? 11 : 7.2; for (let k = 0; k < 4 && W.inBuilding(X + Math.cos(a) * rd, Z + Math.sin(a) * rd); k++) rd *= 0.75; camera.position.set(X + Math.cos(a) * rd, Y + 1.7, Z + Math.sin(a) * rd); camera.position.y = Math.max(camera.position.y, W.heightXZ(camera.position.x, camera.position.z) + 1); camera.lookAt(X, Y + 0.8, Z); camera.fov = 50;
      if (gar) { const w = innerWidth, h = innerHeight, wide = w >= 820; camera.setViewOffset(w, h, wide ? Math.min(480, w * 0.48) / 2 : 0, wide ? 0 : h * 0.26, w, h); }      // showroom: the car sits in the part of the screen the docked panel leaves free (see #pGarage in the CSS)
      camera.updateProjectionMatrix(); camA = a + Math.PI; return; }
    const fx = Math.cos(car.psi), fz = -Math.sin(car.psi); let dx = fx, dz = fz;
    if (car.speed > 4 && car.u > 0) { dx = fx * 0.5 + car.vx / car.speed * 0.5; dz = fz * 0.5 - car.vy / car.speed * 0.5; }
    let da = Math.atan2(dz, dx) - camA; da = Math.atan2(Math.sin(da), Math.cos(da)); camA += da * (1 - Math.exp(-dt * 5.5));
    const tall = camera.aspect < 1 ? 1.45 : 1, fov = clamp(58 + car.speed * 0.42, 58, 80) + (tall > 1 ? 10 : 0); camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    if (camMode === 2) {    // hood
      const hc = view.hood; view.group.updateMatrixWorld(); camera.position.copy(v3.set(hc[0], hc[1], 0).applyMatrix4(view.group.matrixWorld)); look.set(12, hc[1] - 0.3, 0).applyMatrix4(view.group.matrixWorld); camera.up.set(0, 1, 0); camera.lookAt(look);
    } else {
      let dist = ((camMode ? 10.5 : 6.6) + car.speed * 0.035) * tall; const hgt = (camMode ? 3.6 : 2.25) * (tall > 1 ? 1.2 : 1);
      for (let k = 0; k < 5 && W.inBuilding(X - Math.cos(camA) * dist, Z - Math.sin(camA) * dist); k++) dist *= 0.72;   // keep the camera out of buildings
      camD = camD > 0 ? camD + (dist - camD) * Math.min(1, dt * (dist < camD ? 15 : 2.5)) : dist;      // quick in, slow back out
      camPos.set(X - Math.cos(camA) * camD, Y + hgt, Z - Math.sin(camA) * camD); camPos.y = Math.max(camPos.y, W.heightXZ(camPos.x, camPos.z) + 0.9);
      if (shake > 0.01) { camPos.x += (Math.random() - 0.5) * shake * 0.5; camPos.y += (Math.random() - 0.5) * shake * 0.5; }
      const buzz = clamp((car.speed - 30) / 40, 0, 1) * 0.02; if (buzz > 0) { camPos.x += (Math.random() - 0.5) * buzz; camPos.y += (Math.random() - 0.5) * buzz; }
      camera.position.copy(camPos); camera.lookAt(X + Math.cos(camA) * 3, Y + 1.15, Z + Math.sin(camA) * 3);
      camRoll += (clamp(car.ayf, -10, 10) * -0.0045 - camRoll) * Math.min(1, dt * 4); camera.rotateZ(camRoll);
    }
    shake *= Math.exp(-dt * 6); camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ drift scoring
  function updateDrift(dt) {
    const ang = Math.abs(car.beta) * 57.3, drifting = ang > 12 && car.speed > 6.5 && car.u > 1 && !car.air && (car.slip[2] + car.slip[3]) > 4;
    if (drifting) { D.time += dt; D.grace = 1.3; D.mult = 1 + Math.min(4, Math.floor(D.time / 2.5)); D.pts += ang * car.speed * dt * 0.9 * D.mult; }
    else if (D.pts > 0 && (D.grace -= dt) <= 0) {
      const p = Math.round(D.pts); D.total += p; if (race && race.state === 'run') race.drift += p;
      if (p > 400) toast((p > 12000 ? 'Legendary slide' : p > 5000 ? 'Huge drift' : p > 1800 ? 'Great drift' : 'Nice') + '  +' + p.toLocaleString());
      if (p > D.best) { D.best = p; store.set('bestDrift', p); }
      api.emit('bank', p);
      D.pts = 0; D.time = 0; D.mult = 1;
    }
  }

  // ------------------------------------------------------------------ effects: skid marks, tyre smoke, sparks, kicked-up leaves
  const SK = 7000, lastSkid = new Float32Array(12), skidOn = new Uint8Array(4); let skGeo, skPos, skN = 0, skCount = 0;
  const SM = 520, emitAcc = [0, 0, 0, 0]; let smGeo, smPos, smData, smRot, smokeMat, smVel, smAge, smLife, smI = 0;
  const BT = 160; let btGeo, btPos, btCol, btVel, btAge, btLife, btKind, btI = 0, bitsMat, hitX = 0, hitZ = 0, leafAcc = 0;
  const LEAFC = [0xd9601a, 0xe3a51d, 0xb5261e, 0x8a4b1f, 0xf0c12b].map((h) => lin(h));
  function initEffects() {
    skPos = new Float32Array(SK * 12); const idx = new Uint32Array(SK * 6);
    for (let q = 0; q < SK; q++) idx.set([4 * q, 4 * q + 1, 4 * q + 2, 4 * q + 1, 4 * q + 3, 4 * q + 2], 6 * q);
    skGeo = new T.BufferGeometry(); skGeo.setAttribute('position', new T.BufferAttribute(skPos, 3)); skGeo.setIndex(new T.BufferAttribute(idx, 1)); skGeo.setDrawRange(0, 0);
    const sk = new T.Mesh(skGeo, new T.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); sk.frustumCulled = false; scene.add(sk);
    // smoke: soft billboards with a cloudy texture, each turned by its own angle, tinted by the daylight
    const puff = document.createElement('canvas'); puff.width = puff.height = 64; { const c = puff.getContext('2d'), r = (a, b) => a + Math.random() * (b - a);
      for (let k = 0; k < 26; k++) { const x = r(18, 46), y = r(18, 46), rad = r(8, 17), gr = c.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); } }
    const puffTex = new T.CanvasTexture(puff);
    smPos = new Float32Array(SM * 3); smData = new Float32Array(SM * 3); smRot = new Float32Array(SM); smVel = new Float32Array(SM * 3); smAge = new Float32Array(SM).fill(9); smLife = new Float32Array(SM).fill(1);
    smGeo = new T.BufferGeometry(); smGeo.setAttribute('position', new T.BufferAttribute(smPos, 3)); smGeo.setAttribute('aData', new T.BufferAttribute(smData, 3)); smGeo.setAttribute('aRot', new T.BufferAttribute(smRot, 1));
    smokeMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { scale: { value: 500 }, map: { value: puffTex }, light: { value: new T.Color(1, 1, 1) } },
      vertexShader: 'attribute vec3 aData; attribute float aRot; uniform float scale; varying vec2 vA; varying vec2 vR; void main(){ vA = aData.xz; vR = vec2(cos(aRot), sin(aRot)); vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aData.y * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 light; varying vec2 vA; varying vec2 vR; void main(){ vec2 p = gl_PointCoord - 0.5; p = vec2(p.x * vR.x - p.y * vR.y, p.x * vR.y + p.y * vR.x) + 0.5; float a = texture2D(map, p).a; vec3 c = mix(light, light * vec3(0.66, 0.55, 0.40), vA.y); gl_FragColor = vec4(c * (0.82 + 0.3 * a), a * vA.x); }' });
    const pts = new T.Points(smGeo, smokeMat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
    // bits: sparks (kind 1, glow) and leaves (kind 0)
    btPos = new Float32Array(BT * 3); btCol = new Float32Array(BT * 3); btVel = new Float32Array(BT * 3); btAge = new Float32Array(BT).fill(9); btLife = new Float32Array(BT).fill(1); btKind = new Uint8Array(BT);
    btGeo = new T.BufferGeometry(); btGeo.setAttribute('position', new T.BufferAttribute(btPos, 3)); btGeo.setAttribute('color', new T.BufferAttribute(btCol, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 16; { const c = dot.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(8, 8, 7, 4.5, 0.6, 0, 7); c.fill(); }
    bitsMat = new T.PointsMaterial({ size: 0.2, map: new T.CanvasTexture(dot), alphaTest: 0.4, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false });
    const bits = new T.Points(btGeo, bitsMat); bits.frustumCulled = false; scene.add(bits);
  }
  function spawnBit(kind, X, Y, Z, vx, vy, vz, life, col) { const k = btI; btI = (btI + 1) % BT; btKind[k] = kind; btPos[3 * k] = X; btPos[3 * k + 1] = Y; btPos[3 * k + 2] = Z; btVel[3 * k] = vx; btVel[3 * k + 1] = vy; btVel[3 * k + 2] = vz; btAge[k] = 0; btLife[k] = life; btCol[3 * k] = col.r; btCol[3 * k + 1] = col.g; btCol[3 * k + 2] = col.b; }
  const SPARK = new T.Color(1.5, 0.7, 0.18);
  function sparks(v) { const n = clamp(Math.round(v * 2.5), 6, 36), y = car.h + 0.45; for (let k = 0; k < n; k++) spawnBit(1, hitX, y, hitZ, car.vx * 0.3 + (Math.random() - 0.5) * 7, 1 + Math.random() * 4, -car.vy * 0.3 + (Math.random() - 0.5) * 7, 0.3 + Math.random() * 0.45, SPARK); }
  function updateEffects(dt) {
    const s = car.spec, cs = Math.cos(car.psi), sn = Math.sin(car.psi); let wrote = false;
    for (let i = 0; i < 4; i++) {
      const lx = i < 2 ? s.a : -s.b, ly = (i % 2 ? -1 : 1) * s.track / 2, X = car.x + lx * cs - ly * sn, Z = -(car.y + lx * sn + ly * cs), slip = car.slip[i], surf = car.surf[i];
      if (slip > 3.2 && !car.air && car.Fz[i] > 300) {
        if (surf === 1) {
          const l = 3 * i, lx = lastSkid[l], ly = lastSkid[l + 1], lz = lastSkid[l + 2], Y = car.hh[i] + 0.135;
          if (skidOn[i]) { const dx = X - lx, dz = Z - lz, d = Math.hypot(dx, dz); if (d > 0.04 && d < 3) { const px = -dz / d * 0.11, pz = dx / d * 0.11, o = skN * 12, P4 = skPos;
            P4[o] = lx - px; P4[o + 1] = ly; P4[o + 2] = lz - pz; P4[o + 3] = lx + px; P4[o + 4] = ly; P4[o + 5] = lz + pz; P4[o + 6] = X - px; P4[o + 7] = Y; P4[o + 8] = Z - pz; P4[o + 9] = X + px; P4[o + 10] = Y; P4[o + 11] = Z + pz;
            skN = (skN + 1) % SK; skCount = Math.min(SK, skCount + 1); wrote = true; } }
          lastSkid[l] = X; lastSkid[l + 1] = Y; lastSkid[l + 2] = Z; skidOn[i] = 1;
        } else skidOn[i] = 0;
        // smoke builds with slip; the driven rear tyres make most of it
        emitAcc[i] += dt * (surf === 1 ? 34 : 18) * clamp((slip - 3) / 7, 0.15, 1.6) * (i > 1 ? 1 : 0.35);
        while (emitAcc[i] >= 1) { emitAcc[i] -= 1; const k = smI; smI = (smI + 1) % SM;
          smPos[3 * k] = X + (Math.random() - 0.5) * 0.3; smPos[3 * k + 1] = car.hh[i] + 0.2; smPos[3 * k + 2] = Z + (Math.random() - 0.5) * 0.3;
          smVel[3 * k] = car.vx * 0.22 + (Math.random() - 0.5) * 1.6; smVel[3 * k + 1] = 0.5 + Math.random() * 1.1; smVel[3 * k + 2] = -car.vy * 0.22 + (Math.random() - 0.5) * 1.6;
          smAge[k] = 0; smLife[k] = 1.3 + Math.random() * 1.5; smRot[k] = Math.random() * 6.28; smData[3 * k + 2] = surf === 1 ? 0 : 1; }
      } else { skidOn[i] = 0; emitAcc[i] = 0; }
    }
    if (wrote) { skGeo.attributes.position.needsUpdate = true; skGeo.setDrawRange(0, skCount * 6); }
    for (let k = 0; k < SM; k++) {
      if (smAge[k] > smLife[k]) { smData[3 * k] = 0; continue; }
      smAge[k] += dt; const u = smAge[k] / smLife[k], dr = Math.exp(-dt * 1.6);
      smVel[3 * k] *= dr; smVel[3 * k + 2] *= dr; smPos[3 * k] += (smVel[3 * k] + 0.6) * dt; smPos[3 * k + 1] += smVel[3 * k + 1] * dt; smPos[3 * k + 2] += smVel[3 * k + 2] * dt;
      smData[3 * k] = 0.55 * (1 - u) * (1 - u) * Math.min(1, u * 10); smData[3 * k + 1] = 1.1 + u * 5.2; smRot[k] += dt * 0.4;
    }
    smGeo.attributes.position.needsUpdate = true; smGeo.attributes.aData.needsUpdate = true; smGeo.attributes.aRot.needsUpdate = true;
    if (W.sun) { const h = W.hemi.color, su = W.sun.color; smokeMat.uniforms.light.value.setRGB(h.r * 0.55 + su.r * 0.42, h.g * 0.55 + su.g * 0.42, h.b * 0.55 + su.b * 0.42); }
    // leaves fly up from the tyres on grass
    if (S.leaves && !car.air && car.speed > 5 && (car.surf[2] === 0 || car.surf[3] === 0)) { leafAcc += dt * Math.min(30, car.speed * 1.2); while (leafAcc >= 1) { leafAcc -= 1; const i = 2 + (Math.random() * 2 | 0), ly = (i % 2 ? -1 : 1) * s.track / 2; spawnBit(0, car.x - s.b * cs - ly * sn, car.hh[i] + 0.15, -(car.y - s.b * sn + ly * cs), car.vx * 0.3 + (Math.random() - 0.5) * 3, 1.2 + Math.random() * 2.6, -car.vy * 0.3 + (Math.random() - 0.5) * 3, 0.9 + Math.random() * 0.9, LEAFC[Math.random() * LEAFC.length | 0]); } }
    for (let k = 0; k < BT; k++) {
      if (btAge[k] > btLife[k]) { if (btPos[3 * k + 1] > -900) btPos[3 * k + 1] = -999; continue; }
      btAge[k] += dt; btVel[3 * k + 1] -= (btKind[k] ? 12 : 5) * dt; if (!btKind[k]) { btVel[3 * k] += Math.sin(time * 9 + k) * 4 * dt; btVel[3 * k + 2] += Math.cos(time * 7 + k) * 4 * dt; }
      btPos[3 * k] += btVel[3 * k] * dt; btPos[3 * k + 1] += btVel[3 * k + 1] * dt; btPos[3 * k + 2] += btVel[3 * k + 2] * dt;
    }
    btGeo.attributes.position.needsUpdate = true; btGeo.attributes.color.needsUpdate = true;
  }
  // controller rumble (where the browser and pad support it)
  let padRef = null, rumbleT = 0;
  function rumble(strong, weak, ms) { const a = padRef && padRef.vibrationActuator; if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }).catch(() => {}); }

  // sound lives in audio.js (BD.audio); these keep the call sites short
  const initAudio = () => { if (!B.audio) return; const fresh = !B.audio.context; B.audio.init(S.sound); if (fresh && B.audio.context && B.audio.setVolume) B.audio.setVolume(VOL); };
  if (B.audio && B.audio.setVolume) B.audio.setVolume(VOL);      // kept by audio.js until its graph exists
  const beep = (f, len, vol) => { if (B.audio) B.audio.beep(f, len, vol); };

  // ------------------------------------------------------------------ HUD
  const hudCache = {}; let streetT = 0, toastT = 0;
  const setText = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  const show = (id, on) => { if (hudCache['h' + id] !== on) { hudCache['h' + id] = on; $(id).hidden = !on; } };
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); toastT = 2.2; }
  const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
  const mini = $('miniC').getContext('2d');
  function updateHud(dt) {
    if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('on');
    const sp = Math.round(car.speed * MPH); if (hudCache.sp !== sp) { hudCache.sp = sp; $('speed').firstChild.nodeValue = sp; }
    setText('gear', car.gear < 0 ? 'R' : String(car.gear));
    const rp = Math.round(clamp(car.rpm / car.spec.redline, 0, 1) * 100); if (hudCache.rp !== rp) { hudCache.rp = rp; $('rpmFill').style.strokeDasharray = (rp * 2.7646).toFixed(1) + ' 999'; $('dash').classList.toggle('lim', rp >= 96); }
    const rn = Math.round(car.rpm / 50) * 50; if (hudCache.rn !== rn) { hudCache.rn = rn; $('rpmNum').firstChild.nodeValue = rn; }
    show('drift', D.pts > 30); if (D.pts > 30) { setText('driftPts', Math.round(D.pts).toLocaleString()); setText('driftMeta', '×' + D.mult + '   ' + Math.round(Math.abs(car.beta) * 57.3) + '°'); $('driftBarFill').style.transform = 'scaleX(' + clamp(D.grace / 1.3, 0, 1).toFixed(2) + ')'; if (hudCache.mult !== D.mult) { if (D.mult > (hudCache.mult || 1)) { const el = $('driftMeta'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } hudCache.mult = D.mult; } }
    setText('totalPts', D.total.toLocaleString());
    if ((streetT -= dt) <= 0) { streetT = 0.35; const r = W.nearestRoad(car.x, -car.y, 30); setText('streetName', r && r.d < r.hw + 6 ? (r.name || (r.cls === 'primary' || r.cls === 'secondary' ? 'State Highway' : r.cls === 'service' || r.cls === 'unknown' ? 'Alley' : 'County Road')) : 'Off road'); }
    // minimap: heading up
    const R = 150, k = W.mapScale, f = 0.625 / k, px = (car.x + W.HALF) * k, py = (-car.y + W.HALF) * k, span = 350 * k;
    mini.setTransform(1, 0, 0, 1, 0, 0); mini.fillStyle = '#a39a6a'; mini.fillRect(0, 0, 300, 300);
    mini.translate(R, R); mini.rotate(car.psi - Math.PI / 2); mini.scale(f, f); mini.translate(-px, -py);
    const sx = clamp(px - span, 0, 2048), sy = clamp(py - span, 0, 2048), sw = Math.min(2048, px + span) - sx, sh = Math.min(2048, py + span) - sy;
    if (sw > 0 && sh > 0) mini.drawImage(W.mapCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
    if (W.drawMap) W.drawMap(mini, px, py, span);      // the corridors out of town (routes.js)
    if (race && race.state !== 'done') for (let q = Math.min(race.total, race.i + 2) - 1; q >= race.i; q--) { const p = race.seq[q % race.seq.length]; mini.fillStyle = q === race.i ? '#f2c230' : '#f6ead3'; mini.strokeStyle = '#1b1a1c'; mini.lineWidth = 3 / f; mini.beginPath(); mini.arc((p[0] + W.HALF) * k, (-p[1] + W.HALF) * k, (q === race.i ? 15 : 10) / f, 0, 7); mini.fill(); mini.stroke(); }
    for (const m of api.markers) { if (Math.abs(m.x - car.x) > 360 || Math.abs(m.y - car.y) > 360) continue; mini.fillStyle = m.c; mini.strokeStyle = '#1b1a1c'; mini.lineWidth = 2 / f; mini.beginPath(); mini.arc((m.x + W.HALF) * k, (-m.y + W.HALF) * k, (m.r || 6) / f, 0, 7); mini.fill(); mini.stroke(); }
    mini.setTransform(1, 0, 0, 1, 0, 0); mini.fillStyle = '#c8202b'; mini.strokeStyle = '#fff'; mini.lineWidth = 3; mini.beginPath(); mini.moveTo(R, R - 16); mini.lineTo(R + 11, R + 12); mini.lineTo(R, R + 5); mini.lineTo(R - 11, R + 12); mini.closePath(); mini.fill(); mini.stroke();
  }

  // ------------------------------------------------------------------ races
  // Courses are lists of checkpoints in map metres (x east, y north of the courthouse); laps 0 = point-to-point sprint.
  const PRESETS = [
    { id: 'p-square', name: 'Courthouse Square', laps: 3, pts: [[0, 57], [50, 5], [0, -44], [-51, 5]] },
    { id: 'p-town', name: 'Seminary Street Loop', laps: 2, pts: [[-150, 57], [50, -100], [-100, -243], [-248, -100]] },
    { id: 'p-main', name: 'Main Street Sprint', laps: 0, pts: [[-1881, 87], [-1025, 79], [-505, 62], [0, 57], [540, 95], [1016, 191], [1511, 281]] },
    { id: 'p-hwy', name: 'Highway Run, North to South', laps: 0, pts: [[184, 1491], [103, 1031], [62, 714], [64, 362], [50, 0], [49, -338], [111, -672], [331, -1146], [434, -1492], [507, -1900]] },
    { id: 'p-cold', name: 'Cold Springs Hill Climb', laps: 0, pts: [[300, 120], [489, 437], [1339, 884], [1449, 1546]] },
    // the road graph's class-weighted shortest path (W.roads + routes.js's corridor roads): from the Taco Bell's lot exit on A St in Linton east
    // on SR 54 over the White River into W Main St, through downtown, right on S Washington St, south on US 231; a gate on that path at every
    // turn and bend (30 m Douglas-Peucker) and at least every 1.4 km. Third element 1: kept as is, not snapped to a road (the start, where the
    // route meets the lot exit, which the nearest-road snap would move 20 m along A St; the finish, up the house's gravel drive)
    { id: 'p-taco', name: 'Taco Bell Run', sub: 'Linton to US 231', laps: 0, pts: [[-18088, 1235, 1], [-18058, 1240, 1], [-18058, 1257, 1], [-17392.1, 1393.1], [-16104.3, 1329.7], [-14834.5, 1324.5], [-13569.6, 1328.9], [-12299.7, 1329.5], [-11034.9, 1318.2], [-10524.7, 1030.4], [-9518.8, 924.2], [-8363.9, 926], [-7214.4, 922.9], [-6647.2, 659.5], [-5291.7, 337.5], [-4477.6, 299.2], [-3663.4, 271.4], [-2899.8, 195.1], [-2142.5, 91.8], [-1045.1, 79.3], [49.7, 55.3], [53.1, -516.5], [420.4, -1428.3], [611.3, -2606.0], [631.3, -2605.4, 1], [648.7, -2603.0, 1], [654.3, -2587.3, 1]] },
  ];
  PRESETS.find((c) => c.id === 'p-taco').night = true;      // runs at night (startRace); set here, not on the line above, so route edits to it merge cleanly
  let courses = [], race = null, ghost = null, beams = [];
  const bests = store.get('bests', {}), ghosts = store.get('ghosts', {});
  function snapCourse(c) { return Object.assign({}, c, { preset: true, pts: c.pts.map((p) => { if (p[2]) return [p[0], p[1], 1]; const r = W.nearestRoad(p[0], -p[1], 150); return r ? [r.x, -r.z] : p; }) }); }
  function courseLen(c) { let d = 0; for (let i = 1; i < c.pts.length; i++) d += Math.hypot(c.pts[i][0] - c.pts[i - 1][0], c.pts[i][1] - c.pts[i - 1][1]); if (c.laps) d = (d + Math.hypot(c.pts[0][0] - c.pts[c.pts.length - 1][0], c.pts[0][1] - c.pts[c.pts.length - 1][1])) * c.laps; return d; }
  function initRaceObjects() {
    for (let k = 0; k < 2; k++) {
      const g = new T.Group(), col = k ? 0xf6ead3 : 0xf2c230, op = k ? 0.16 : 0.42;
      const beam = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 70, 12, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: T.DoubleSide, fog: false })); beam.position.y = 35;
      const ring = new T.Mesh(new T.TorusGeometry(10, 0.35, 6, 40).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op + 0.3, fog: false })); ring.position.y = 0.5;
      g.add(beam, ring); g.visible = false; scene.add(g); beams.push(g);
    }
  }
  function startRace(course) {
    closePanel(); if (mode === 'title') enterDrive();
    const p0 = course.pts[0], p1 = course.pts[1], r = W.nearestRoad(p0[0], -p0[1], 60);
    let psi = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    if (r && !p0[2]) { const a = Math.atan2(-r.tz, r.tx); psi = Math.cos(a - psi) >= 0 ? a : a + Math.PI; }      // a pinned start (a parking lot) faces the next gate, not the road
    placeCar(p0[0], p0[1], psi); Object.assign(safe, { x: p0[0], y: p0[1], psi, ok: true });
    const tod = course.night ? 'night' : S.tod; if (W.time !== tod) setTod(tod);      // a night course (night: true) runs at night; the player's own time comes back on quit
    const seq = course.laps ? course.pts.slice(1).concat([course.pts[0]]) : course.pts.slice(1);
    // the ghost is recorded every gdt s: 0.1 s, or 0.25 s on the presets over 8 km (a 15 minute run: 3,600 samples, about 55 KB in localStorage)
    race = { course, seq, total: seq.length * (course.laps || 1), gdt: course.preset && courseLen(course) > 8000 ? 0.25 : 0.1, i: 0, t: 0, count: 3.4, state: 'count', rec: [], recT: 0, drift: 0, lastBeep: 4 };
    D.pts = 0; D.time = 0;
    const gdata = ghosts[course.id];
    if (gdata && gdata.length > 6) { if (!ghost) { ghost = B.buildCar(car.spec).group; const gm = new T.MeshBasicMaterial({ color: 0xf6ead3, transparent: true, opacity: 0.28, depthWrite: false }); ghost.traverse((o) => { if (o.isMesh) { o.material = gm; o.castShadow = false; } }); scene.add(ghost); } race.ghost = gdata; ghost.visible = true; } else if (ghost) ghost.visible = false;
    placeBeams(); show('race', true); show('arrow', true); show('bQuit', true); $('hud').classList.add('racing'); api.emit('raceStart', course);
  }
  function placeBeams() {
    for (let k = 0; k < 2; k++) { const q = race.i + k, g = beams[k]; if (q >= race.total) { g.visible = false; continue; } const p = race.seq[q % race.seq.length]; g.position.set(p[0], W.heightXZ(p[0], -p[1]), -p[1]); g.visible = true; }
  }
  function quitRace() { if (W.time !== S.tod) setTod(S.tod); if (race) api.emit('raceQuit'); race = null; beams.forEach((b) => { b.visible = false; }); if (ghost) ghost.visible = false; show('race', false); show('arrow', false); show('count', false); show('bQuit', false); $('hud').classList.remove('racing'); }
  function updateRace(dt) {
    if (!race) return;
    if (race.state === 'count') {
      race.count -= dt; const n = Math.ceil(race.count - 0.4);
      if (n !== race.lastBeep && n >= 0) { race.lastBeep = n; beep(n ? 440 : 880, n ? 0.18 : 0.5); }
      show('count', true); setText('count', n > 0 ? String(n) : 'GO');
      if (race.count <= 0.4) { race.state = 'run'; setTimeout(() => show('count', false), 700); }
    }
    if (race.state === 'run') {
      race.t += dt;
      if ((race.recT -= dt) <= 0 && race.rec.length < 18000) { race.recT += race.gdt; race.rec.push(Math.round(car.x * 10), Math.round(car.y * 10), Math.round(car.psi * 100)); }
      const p = race.seq[race.i % race.seq.length], d = Math.hypot(car.x - p[0], car.y - p[1]);
      if (d < (p[2] && race.i === race.total - 1 ? 7 : 12)) { race.i++; beep(race.i >= race.total ? 1175 : 660, 0.25); api.emit('raceGate', race.i, race.total); if (race.i >= race.total) finishRace(); else placeBeams(); }
      if (race && race.state === 'run') {
        const a = Math.atan2(p[1] - car.y, p[0] - car.x) - car.psi; $('arrowI').style.transform = 'rotate(' + (-a * 57.3).toFixed(0) + 'deg)';
        setText('arrowD', d * 3.281 < 1000 ? Math.round(d * 3.281 / 10) * 10 + ' ft' : (d / 1609.34).toFixed(1) + ' mi');
        const L = race.course.laps, per = race.seq.length;
        setText('raceTime', fmtTime(race.t)); setText('raceMeta', (L ? 'Lap ' + Math.min(L, Math.floor(race.i / per) + 1) + '/' + L + ' · ' : '') + 'Gate ' + (race.i + 1) + '/' + race.total + (bests[race.course.id] ? ' · Best ' + fmtTime(bests[race.course.id]) : ''));
      }
    }
    if (race && race.ghost && ghost) { const g = race.ghost, f = Math.max(0, race.state === 'count' ? 0 : race.t / race.gdt), i = Math.min(Math.floor(f), g.length / 3 - 2), u = clamp(f - i, 0, 1), o = i * 3; const x = (g[o] + (g[o + 3] - g[o]) * u) / 10, y = (g[o + 1] + (g[o + 4] - g[o + 1]) * u) / 10; let dp = (g[o + 5] - g[o + 2]) / 100; dp = Math.atan2(Math.sin(dp), Math.cos(dp)); ghost.position.set(x, W.heightXZ(x, -y) + 0.06, -y); ghost.rotation.y = g[o + 2] / 100 + dp * u; }
  }
  function finishRace() {
    race.state = 'done'; beams.forEach((b) => { b.visible = false; }); show('arrow', false); show('race', false); show('bQuit', false);
    const id = race.course.id, old = bests[id], isBest = !old || race.t < old;
    if (isBest) { bests[id] = race.t; store.set('bests', bests); ghosts[id] = race.rec; store.set('ghosts', ghosts); }
    api.emit('raceFinish', race.t, isBest);
    $('finTitle').textContent = race.course.name; $('finTime').textContent = fmtTime(race.t);
    $('finMeta').textContent = (isBest ? (old ? 'New best, ' + (old - race.t).toFixed(2) + ' s faster. ' : 'First time on the board. ') : 'Best is ' + fmtTime(old) + '. ') + 'Drift points this run: ' + race.drift.toLocaleString() + '.';
    openPanel('pFinish');
  }
  $('bRetry').onclick = () => startRace(race.course);
  $('bFree').onclick = () => { quitRace(); closePanel(); };
  $('bQuit').onclick = quitRace;

  function renderCourses() {
    const list = $('courseList'); list.textContent = '';
    for (const c of courses) {
      const row = document.createElement('div'); row.className = 'item';
      const info = document.createElement('div'); info.className = 'grow';
      const b = document.createElement('b'); b.textContent = c.name; const sp = document.createElement('span');
      sp.textContent = (c.sub ? c.sub + ' · ' : '') + (c.laps ? 'Loop · ' + c.laps + (c.laps > 1 ? ' laps' : ' lap') : 'Sprint') + ' · ' + (courseLen(c) / 1609.34).toFixed(1) + ' mi' + (bests[c.id] ? ' · Best ' + fmtTime(bests[c.id]) : '');
      info.append(b, sp); row.append(info);
      const go = document.createElement('button'); go.className = 'btn small primary'; go.textContent = 'Race'; go.onclick = () => startRace(c); row.append(go);
      if (!c.preset) { const del = document.createElement('button'); del.className = 'btn small ghost'; del.textContent = 'Delete'; del.onclick = () => { if (del.dataset.sure) { courses = courses.filter((q) => q !== c); saveCourses(); renderCourses(); } else { del.dataset.sure = 1; del.textContent = 'Sure?'; setTimeout(() => { delete del.dataset.sure; del.textContent = 'Delete'; }, 2500); } }; row.append(del); }
      list.append(row);
    }
  }
  const saveCourses = () => store.set('courses', courses.filter((c) => !c.preset));

  // course editor: tap the map to drop checkpoints
  const ed = { pts: [], laps: 2, loop: true, cx: 1024, cy: 1024, zoom: 1, ptrs: new Map(), moved: 0, pinch: 0 };
  const edC = $('edMap'), edG = edC.getContext('2d');
  function edDraw() {
    const w = edC.clientWidth, h = edC.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); if (!w) return;
    if (edC.width !== Math.round(w * dpr)) { edC.width = Math.round(w * dpr); edC.height = Math.round(h * dpr); }
    const s = w / 2048 * ed.zoom * dpr, k = W.mapScale; edG.setTransform(1, 0, 0, 1, 0, 0); edG.fillStyle = '#a39a6a'; edG.fillRect(0, 0, edC.width, edC.height);
    edG.setTransform(s, 0, 0, s, edC.width / 2 - ed.cx * s, edC.height / 2 - ed.cy * s); edG.drawImage(W.mapCanvas, 0, 0);
    const P2 = (p) => [(p[0] + W.HALF) * k, (-p[1] + W.HALF) * k], u = 1 / s * dpr;
    if (ed.pts.length > 1) { edG.strokeStyle = '#c8202b'; edG.lineWidth = 4 * u; edG.setLineDash([10 * u, 7 * u]); edG.beginPath(); ed.pts.forEach((p, i) => { const q = P2(p); edG[i ? 'lineTo' : 'moveTo'](q[0], q[1]); }); if (ed.loop && ed.pts.length > 2) edG.closePath(); edG.stroke(); edG.setLineDash([]); }
    ed.pts.forEach((p, i) => { const q = P2(p); edG.fillStyle = i ? '#f2c230' : '#c8202b'; edG.strokeStyle = '#1b1a1c'; edG.lineWidth = 2 * u; edG.beginPath(); edG.arc(q[0], q[1], 11 * u, 0, 7); edG.fill(); edG.stroke(); edG.fillStyle = i ? '#1b1a1c' : '#fff'; edG.font = '700 ' + 13 * u + 'px "Barlow Condensed", Arial'; edG.textAlign = 'center'; edG.textBaseline = 'middle'; edG.fillText(i ? String(i + 1) : 'S', q[0], q[1] + u); });
    const c = P2([car.x, car.y]); edG.fillStyle = '#fff'; edG.strokeStyle = '#1b1a1c'; edG.beginPath(); edG.arc(c[0], c[1], 6 * u, 0, 7); edG.fill(); edG.stroke();
  }
  function edClampView() { const half = 1024 / ed.zoom; ed.cx = clamp(ed.cx, half, 2048 - half); ed.cy = clamp(ed.cy, half, 2048 - half); }
  function edZoom(f, mx, my) { const w = edC.clientWidth, s0 = w / 2048 * ed.zoom, z = clamp(ed.zoom * f, 1, 12), wx = ed.cx + (mx - w / 2) / s0, wy = ed.cy + (my - edC.clientHeight / 2) / s0, s1 = w / 2048 * z; ed.zoom = z; ed.cx = wx - (mx - w / 2) / s1; ed.cy = wy - (my - edC.clientHeight / 2) / s1; edClampView(); edDraw(); }
  edC.addEventListener('pointerdown', (e) => { edC.setPointerCapture(e.pointerId); ed.ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); ed.moved = 0; ed.pinch = 0; });
  edC.addEventListener('pointermove', (e) => {
    const p = ed.ptrs.get(e.pointerId); if (!p) return; const s = edC.clientWidth / 2048 * ed.zoom;
    if (ed.ptrs.size === 1) { ed.moved += Math.abs(e.offsetX - p[0]) + Math.abs(e.offsetY - p[1]); if (ed.moved > 6) { ed.cx -= (e.offsetX - p[0]) / s; ed.cy -= (e.offsetY - p[1]) / s; edClampView(); edDraw(); } }
    ed.ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (ed.ptrs.size === 2) { const [a, b] = Array.from(ed.ptrs.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (ed.pinch) edZoom(d / ed.pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); ed.pinch = d; ed.moved = 99; }
  });
  const edUp = (e) => {
    const had = ed.ptrs.delete(e.pointerId); if (!had || ed.ptrs.size || ed.moved > 6 || e.type === 'pointercancel') return;
    const s = edC.clientWidth / 2048 * ed.zoom, mx = ed.cx + (e.offsetX - edC.clientWidth / 2) / s, my = ed.cy + (e.offsetY - edC.clientHeight / 2) / s, x = mx / W.mapScale - W.HALF, z = my / W.mapScale - W.HALF;
    if (ed.drop) { dropAt(x, z, 120); return; }
    const r = W.nearestRoad(x, z, 90);
    if (!r || Math.abs(r.x) > W.PLAY - 20 || Math.abs(r.z) > W.PLAY - 20) { $('edHint').textContent = 'No street there. Tap closer to a road inside the map.'; return; }
    if (ed.pts.length >= 40) { $('edHint').textContent = 'A course holds up to 40 checkpoints.'; return; }
    ed.pts.push([Math.round(r.x * 10) / 10, Math.round(-r.z * 10) / 10]); edHint(); edDraw();
  };
  edC.addEventListener('pointerup', edUp); edC.addEventListener('pointercancel', edUp);
  edC.addEventListener('wheel', (e) => { e.preventDefault(); edZoom(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); }, { passive: false });
  $('bZin').onclick = () => edZoom(1.6, edC.clientWidth / 2, edC.clientHeight / 2); $('bZout').onclick = () => edZoom(1 / 1.6, edC.clientWidth / 2, edC.clientHeight / 2);
  function edHint() { const n = ed.pts.length; $('edHint').textContent = n === 0 ? 'Tap streets to drop checkpoints in driving order. The first one is the start line. Drag to pan, pinch or scroll to zoom.' : n === 1 ? 'Start line set. Tap the next street corner.' : n + ' checkpoints. ' + (ed.loop ? 'The loop closes back to the start.' : 'The last one is the finish.'); }
  // map view = the course editor's map in 'drop' mode: a tap on a street (or a place button) puts the car there, facing along the road
  const DROPS = { taco: [-18087.6, 1255.3], north: [1942.9, 6188.8], south: [523, -2560] };
  function setDrop(on) { ed.drop = on; $('pEditor').classList.toggle('drop', on); $('pEditor').querySelector('h2').textContent = on ? 'Map' : 'Create a course'; $('bEdCancel').textContent = on ? 'Close' : 'Cancel'; }
  function openDropMap() {
    if (!W || mode !== 'drive') return; if (race && race.state !== 'done') { toast('Quit the race first: Menu, then Quit race'); return; }
    setDrop(true); ed.pts = []; ed.zoom = 3; ed.cx = (car.x + W.HALF) * W.mapScale; ed.cy = (-car.y + W.HALF) * W.mapScale; edClampView(); openPanel('pEditor');
    $('edHint').textContent = 'Tap any street to drop your car there. Drag to pan, pinch or scroll to zoom.'; requestAnimationFrame(edDraw);
  }
  function dropAt(X, Z, maxD) {
    const r = W.nearestRoad(X, Z, maxD); if (!r) { $('edHint').textContent = 'No street there. Tap on or next to a road.'; return; }
    setDrop(false); closePanel(); placeCar(r.x, -r.z, Math.atan2(-(r.tz || 0), r.tx || 1)); toast('Dropped on ' + (r.name || 'the road'));
  }
  for (const b of document.querySelectorAll('[data-drop]')) b.onclick = () => { const k = b.dataset.drop; if (k === 'square') { setDrop(false); closePanel(); placeCar(home.x, home.y, home.psi); toast('Dropped at the courthouse square'); } else dropAt(DROPS[k][0], -DROPS[k][1], 250); };
  function openEditor() { setDrop(false); ed.pts = []; ed.zoom = 3; ed.cx = (car.x + W.HALF) * W.mapScale; ed.cy = (-car.y + W.HALF) * W.mapScale; edClampView(); $('edName').value = ''; openPanel('pEditor'); edHint(); seg('segType', ed.loop ? 'loop' : 'sprint'); seg('segLaps', String(ed.laps)); requestAnimationFrame(edDraw); }
  $('bNewCourse').onclick = openEditor;
  $('bMap').onclick = openDropMap; $('bPauseMap').onclick = () => { closePanel(); openDropMap(); };
  $('bEdCancel').onclick = () => {      // checkpoints are only thrown away on a second press
    if (ed.drop) { setDrop(false); closePanel(); return; }
    const b = $('bEdCancel'); if (ed.pts.length && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Discard?'; $('edHint').textContent = 'Press again to throw away ' + ed.pts.length + (ed.pts.length > 1 ? ' checkpoints.' : ' checkpoint.'); setTimeout(() => { delete b.dataset.sure; b.textContent = 'Cancel'; }, 2500); return; }
    openPanel('pCourses');
  };
  $('bEdUndo').onclick = () => { ed.pts.pop(); edHint(); edDraw(); };
  $('bEdClear').onclick = () => { ed.pts = []; edHint(); edDraw(); };
  $('bEdSave').onclick = () => {
    const need = ed.loop ? 3 : 2; if (ed.pts.length < need) { $('edHint').textContent = 'Add at least ' + need + ' checkpoints for a ' + (ed.loop ? 'loop' : 'sprint') + '.'; return; }
    const c = { id: 'c' + Date.now().toString(36), name: $('edName').value.trim() || 'My course ' + (courses.filter((q) => !q.preset).length + 1), laps: ed.loop ? ed.laps : 0, pts: ed.pts.slice() };
    courses.push(c); saveCourses(); startRace(c);
  };

  // ------------------------------------------------------------------ panels
  function seg(id, value, onPick) {
    const el = $(id); for (const b of el.children) { b.classList.toggle('on', b.dataset.v === String(value)); if (onPick) b.onclick = () => { seg(id, b.dataset.v); onPick(b.dataset.v); }; }
  }
  function openPanel(id, from) {      // from: the panel that Close / Escape / B return to (sub-menus of Paused)
    if (!W && id !== 'pHelp') return; for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== id;
    const f = document.activeElement, kb = f && f.matches(':focus-visible'); if (f && f.blur) f.blur(); if (kb) $(id).querySelector('button').focus();     // keyboard and pad users land on the new panel
    panel = id; panelBack = from || null; const cb = $(id).querySelector('[data-close]'); if (cb) cb.textContent = from ? 'Back' : cb.dataset.label || (cb.dataset.label = cb.textContent); $('shade').hidden = false; $('shade').classList.toggle('clear', id === 'pGarage'); $('hud').classList.toggle('quiet', id === 'pGarage'); $('title').hidden = true; keys.clear();
    if (id === 'pGarage') renderGarage(); if (id === 'pCourses') renderCourses();
  }
  function closePanel() {
    if (panel === 'pFinish' && race && race.state === 'done') quitRace();
    for (const p of document.querySelectorAll('.panel')) p.hidden = true; panel = null; $('shade').hidden = true; $('hud').classList.remove('quiet');
    if (mode === 'title') $('title').hidden = false;
  }
  function back() { if (panel === 'pEditor') $('bEdCancel').click(); else if (panelBack) openPanel(panelBack); else closePanel(); }
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => { const g = panel === 'pGarage'; back(); if (g && mode === 'title') startDriving(); };
  $('shade').onclick = () => { if (panel !== 'pFinish' && panel !== 'pEditor') back(); };
  const PAINTS = [0xf3f3ee, 0xb9bcc2, 0x6f747b, 0x16181d, 0xc8161d, 0xe2581c, 0xf2c230, 0x2f6b3a, 0x1f4fa8, 0x5a2d82, 0x7a1f2b, 0x3aa0c8];
  function renderGarage() {
    seg('segBuild', S.drift ? 1 : 0, (v) => { setCar(S.car, v === '1'); renderGarage(); });
    $('buildNote').textContent = S.drift ? 'Drift build: rear-wheel-drive swap, welded diff, big steering angle and more power. Every car can hold a slide.' : 'Stock: factory power and drivetrain. Front-drivers need the handbrake; the Ranger and Mustang will still step out.';
    const hex = (c) => '#' + c.toString(16).padStart(6, '0'), cur = P.CARS.find((c) => c.id === S.car), row = $('paintRow'); row.textContent = '';
    for (const c of [cur.color].concat(PAINTS.filter((p) => p !== cur.color))) {
      const b = document.createElement('button'), on = (paints[S.car] === undefined ? cur.color : paints[S.car]) === c; b.className = 'chip' + (on ? ' on' : ''); b.style.background = hex(c);
      b.setAttribute('aria-label', c === cur.color ? 'Factory colour' : 'Paint ' + hex(c)); b.setAttribute('aria-pressed', on);
      b.onclick = () => { if (c === cur.color) delete paints[S.car]; else paints[S.car] = c; store.set('paints', paints); for (const m of view.paint) m.color.copy(lin(c)); renderGarage(); };
      row.append(b);
    }
    const list = $('carList'); list.textContent = '';
    for (const c of P.CARS) {
      if (c.hidden) continue;      // the golf cart (player.js, car_cart.js) is driven from the course, never picked here
      const s = P.makeCar(c, S.drift).spec, b = document.createElement('button'); b.className = 'item' + (c.id === S.car ? ' sel' : '');
      const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = hex(paints[c.id] === undefined ? c.color : paints[c.id]);
      const info = document.createElement('div'); info.className = 'grow'; const n = document.createElement('b'); n.textContent = c.name; const sp = document.createElement('span');
      sp.textContent = c.sub + ' · ' + s.hp + ' hp · ' + Math.round(s.m * 2.2046 / 10) * 10 + ' lb · ' + s.drive;
      const bars = document.createElement('div'); bars.className = 'bars';
      for (const [label, v] of [['Power', (s.hp - 100) / 500], ['Grip', (s.mu - 0.8) / 0.3], ['Agility', 1 - (s.m - 1000) / 1000]]) { const w = document.createElement('div'), f = document.createElement('i'); w.title = label; w.setAttribute('aria-label', label + ' ' + Math.round(clamp(v, 0.08, 1) * 10) + ' of 10'); f.style.width = Math.round(clamp(v, 0.08, 1) * 100) + '%'; w.append(label, f); bars.append(w); }
      info.append(n, sp, bars); b.append(sw, info); b.onclick = () => { setCar(c.id, S.drift); renderGarage(); }; list.append(b);
    }
  }
  $('bPadSetup').onclick = padSetupStart; $('bPadStd').onclick = () => { padMap = null; store.set('padMap', null); padOptText(); toast('Standard controller layout'); }; padOptText();
  seg('segQuality', S.quality, (v) => { autoQ = false; S.quality = +v; store.set('quality', S.quality); applyQuality(); });
  seg('segAssist', S.assist ? 1 : 0, (v) => { S.assist = v === '1'; store.set('assist', S.assist); });
  seg('segTime', S.tod, (v) => { S.tod = v; store.set('tod', v); setTod(v); });
  seg('segLeaves', S.leaves ? 1 : 0, (v) => { S.leaves = v === '1'; store.set('leaves', S.leaves); W.setLeaves(S.leaves); });
  seg('segTraffic', S.traffic, (v) => { S.traffic = v; store.set('traffic', v); });
  $('segTraffic').parentElement.hidden = !B.buildTraffic;
  // photo mode: the game freezes, the HUD hides, drag orbits the camera, the wheel or a pinch zooms; the controls fade after 2 s
  const photoBar = document.createElement('div'), bSave = document.createElement('button'), cap = document.createElement('div'), pRow = document.createElement('div');
  photoBar.style.cssText = 'left:50%;bottom:0;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:8px;transition:opacity .4s,visibility .4s';
  cap.style.cssText = 'font:600 15px var(--text);letter-spacing:.04em;text-shadow:0 1px 4px #000;white-space:nowrap'; cap.textContent = 'Drag to orbit · ' + (isTouch ? 'pinch' : 'scroll or pinch') + ' to zoom';
  pRow.style.cssText = 'display:flex;gap:10px'; bSave.className = 'btn primary'; bSave.textContent = 'Save photo';
  $('bPhotoDone').style.cssText = ''; $('bPhotoDone').hidden = false; $('bPhotoDone').before(photoBar); pRow.append(bSave, $('bPhotoDone')); photoBar.append(cap, pRow);
  function photoWake() { photo.seen = performance.now(); if (photo.faded) { photo.faded = false; photoBar.style.opacity = 1; photoBar.style.visibility = 'visible'; } }
  function setPhoto(on) {
    if (on && (mode !== 'drive' || panel)) return;
    photo = on ? { a: camA + Math.PI * 0.8, e: 0.22, d: 8.5, seen: performance.now(), faded: true } : null; if (on) photoWake();
    $('hud').hidden = !!on; photoBar.style.display = on ? 'flex' : 'none'; keys.clear(); ptrs.clear();
  }
  bSave.onclick = () => {      // render a clean frame and read it back in the same task (the drawing buffer is not preserved)
    if (fx) fx.render(0, time); else renderer.render(scene, camera);
    renderer.domElement.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'bloomfield-drift.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
  };
  $('bPhoto').onclick = () => setPhoto(true); $('bPhotoDone').onclick = () => setPhoto(false);
  const ptrs = new Map(); let pinch = 0;
  { const cv = $('view'), up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    cv.addEventListener('pointerdown', (e) => { if (!photo) return; photoWake(); cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    cv.addEventListener('pointermove', (e) => {
      if (!photo) return; photoWake(); const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 1) { photo.a += (e.clientX - p[0]) * 0.006; photo.e = clamp(photo.e + (e.clientY - p[1]) * 0.004, -0.05, 1.35); }
      p[0] = e.clientX; p[1] = e.clientY;
      if (ptrs.size === 2) { const [a, b] = ptrs.values(), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) photo.d = clamp(photo.d * pinch / d, 3, 80); pinch = d; }
    });
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { if (photo) { e.preventDefault(); photoWake(); photo.d = clamp(photo.d * (e.deltaY > 0 ? 1.1 : 0.9), 3, 80); } }, { passive: false }); }
  seg('segGear', S.manual ? 1 : 0, (v) => { S.manual = v === '1'; store.set('manual', S.manual); car.manual = S.manual; });
  $('segGear').parentElement.hidden = isTouch;      // no shift pads on a touch screen: always automatic there
  seg('segSound', S.sound ? 1 : 0, (v) => { S.sound = v === '1'; store.set('sound', S.sound); initAudio(); if (B.audio) B.audio.setMuted(!S.sound); });
  for (const k in VOL) {      // 0-100 % in 5 % steps
    const el = $('vol_' + k), out = el.nextElementSibling, show = () => { out.textContent = Math.round(VOL[k] * 100) + '%'; };
    el.value = Math.round(VOL[k] * 100); show();
    el.oninput = () => { VOL[k] = clamp(el.valueAsNumber / 100, 0, 1); store.set('vol.' + k, VOL[k]); show(); initAudio(); if (B.audio && B.audio.setVolume) B.audio.setVolume(VOL); };
  }
  seg('segType', 'loop', (v) => { ed.loop = v === 'loop'; $('segLaps').style.visibility = ed.loop ? '' : 'hidden'; edHint(); edDraw(); });
  seg('segLaps', 2, (v) => { ed.laps = +v; });
  const bRestart = document.createElement('button'); bRestart.className = 'btn'; bRestart.textContent = 'Restart race'; bRestart.onclick = () => startRace(race.course); $('bPauseQuit').before(bRestart);
  function pause() { if (mode !== 'drive') return; $('bPauseQuit').hidden = bRestart.hidden = !(race && race.state !== 'done'); openPanel('pPause'); }
  $('bPauseReset').onclick = () => { closePanel(); resetCar(); };
  $('bPauseGarage').onclick = () => openPanel('pGarage', 'pPause'); $('bPauseRaces').onclick = () => openPanel('pCourses', 'pPause'); $('bPauseOptions').onclick = () => openPanel('pOptions', 'pPause'); $('bPauseHelp').onclick = () => openPanel('pHelp', 'pPause');
  $('bPausePhoto').onclick = () => { closePanel(); setPhoto(true); }; $('bPauseQuit').onclick = () => { quitRace(); closePanel(); };
  $('bMenu').onclick = pause;
  $('bGarage').onclick = () => openPanel('pGarage'); $('bCourses').onclick = () => openPanel('pCourses'); $('bOptions').onclick = () => openPanel('pOptions'); $('bHelp').onclick = () => openPanel('pHelp');
  $('bReset').onclick = resetCar;
  $('bTitleCars').onclick = () => openPanel('pGarage'); $('bTitleRace').onclick = () => openPanel('pCourses'); $('bTitleHelp').onclick = () => openPanel('pHelp'); $('bTitleOptions').onclick = () => openPanel('pOptions');
  // controls strip: stays until gas, steering and handbrake have each been used once (then never again)
  const tutEl = document.createElement('div'); tutEl.hidden = true; $('stage2').append(tutEl);
  tutEl.style.cssText = 'position:absolute;left:50%;bottom:' + (isTouch ? 250 : innerWidth <= 920 ? 226 : 166) + 'px;transform:translateX(-50%);max-width:92%;width:max-content;text-align:center;padding:6px 12px;border-radius:4px;background:rgba(24,22,23,.62);font:600 16px var(--text);letter-spacing:.04em;pointer-events:none';
  tutEl.textContent = isTouch ? 'Hold GAS · tap E-BRAKE in a turn to slide' : 'W gas · S brake · A D steer · Space handbrake · Esc menu';
  function enterDrive() { mode = 'drive'; $('title').hidden = true; $('hud').hidden = false; initAudio(); tutEl.hidden = tut === 7; api.emit('drive'); }
  function startDriving() { if (W && mode === 'title' && !panel) enterDrive(); }
  $('bDrive').onclick = startDriving;

  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot); else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
})();
