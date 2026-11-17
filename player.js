/* Bloomfield Drift — the player on foot, the golf carts, the wallet and the pro shop (golf contract item 4).
   What this file adds (plain IIFE, loads last; polls for BD.game.world and waits for BD.golfWorld.ready when the course is installed):
   - ON FOOT: E (pad X, touch WALK) when the car is stopped gets the player out: the car stays where it is (its physics step is skipped
     while nobody is in it; it is driven again the moment the player gets back in), a stylised person (cream shirt, dark trousers, red cap,
     arms and legs that swing with speed, a golf bag on the back during a round) walks on W.heightXZ with WASD / arrows / left stick
     (1.6 m/s, Shift / right trigger / E-BRAKE pad runs at 4 m/s), heading relative to a third-person chase camera (C or pad Y: near /
     far; mouse drag or right stick looks around), blocked by W.collide (which BD.golfWorld wraps for the course) and by parked vehicles,
     cannot enter water, cannot leave the map. E near a vehicle gets in. If anything else moves the car while the player is out (Reset,
     the map, a race start), the player is put back in it.
   - VEHICLES: the player's car and the golf carts are all real physics cars. Entering a cart calls BD.game.setCar('cart') + placeCar at
     the cart's spot and leaves the car behind as a parked static model (BD.buildCar(spec).group, its paint kept) until the player walks
     back and presses E, which restores it (setCar(oldId)) and parks the cart as a static where it was left. Four carts stand at
     BLOOMFIELD_GOLF.cartSpots (two beside the car for testing when the course is missing). Carts are locked until rented in the pro shop
     when the course exists. The saved car id is restored after every swap, so a reload never boots in a cart.
   - WALLET: BD.wallet = { cash (bd.cash, starts $100), earn(n, why) (HUD toast '+$12: drift'), pay(n) -> false if short }: $1 per 100
     drift points when a drift banks ('bank'), $40 per race finish, +$100 for a best time ('raceFinish'); a cash readout in the HUD.
   - PRO SHOP: walking into the clubhouse door (BLOOMFIELD_GOLF.clubhouse.door, or a marked stub door 10 m east of the start when the
     course is missing) opens #pProShop through BD.game.openPanel: Play 9 holes $18, 18 holes $30, Practice range $5, stroke or match
     play, club sets (Rental free / Standard $150 / Tour $400, owned sets persisted; passed to BD.golf.setClubs as { set, ids, acc, dist }),
     Golf cart rental $10 for the round, the scoreboard of past rounds (bd.golf.rounds) and the handicap, Leave. Paying calls
     BD.golf.startRound({ holes, mode, clubs }) and puts the player beside the first tee (BD.golf.state.ball) or beside a cart if rented.
   Public surface: BD.player = { onFoot, exit(), enter(vehicle?), pos: [x, y] (map metres, live), heading, walkSpeed, cameraMode,
   cartRented, vehicles (parked statics), shop: { open(), close() }, person (the THREE.Group) }; BD.wallet as above.
   Keys: E get in / out / interact, WASD walk, Shift run, C camera (on foot). Pad: X get in / out, left stick walk, RT run, right stick look,
   Y camera. Touch: WALK button (get out / get in / shop), then GAS walks, BRAKE backs up, ◀ ▶ turn, E-BRAKE runs. Rows are added to the
   Controls panel. Game patch needed: the garage skips P.CARS entries with hidden: true (game.patch). No per-frame allocations. */
(function () {
  'use strict';
  const T = window.THREE, B = (window.BD = window.BD || {}), P = window.DriftPhysics;
  if (!T || !B.game || !P) return;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), hyp = Math.hypot, PI = Math.PI, lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const store = B.game.store, $ = (id) => document.getElementById(id), toast = (m) => B.game.toast(m);
  const WALK = 1.6, RUN = 4.0, REACH = 1.6, DOOR_R = 1.5;
  const SHOP_SETS = { rental: { price: 0, acc: 0.9, dist: 0.97, name: 'Rental set', note: 'free · less accurate' }, standard: { price: 150, acc: 1.0, dist: 1.0, name: 'Standard set', note: '$150' }, tour: { price: 400, acc: 1.08, dist: 1.03, name: 'Tour set', note: '$400 · longer and straighter' } };
  const CLUB_IDS = ['Dr', '3W', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW', 'LW', 'Pt'];

  let W, scene, C = null, GW = null, built = false, onFoot = false, swapping = false, errOnce = false, quietWas = false;
  const pl = { x: 0, y: 0, h: 0, psi: 0, v: 0, phase: 0, yaw: 0, pitch: 0.24, mode: 0, hold: 0 };      // the walker; yaw / pitch: chase camera
  const park = { x: 0, y: 0 };                 // where the car was left (if it moves while we are out, we are put back in)
  const parked = [];                           // static vehicles: { id, kind: 'car' | 'cart', spec, drift, x, y, psi, h, pitch, roll, group, model, home }
  const cam = [0, 0, 0, 0, 0, 0, 60], keys = new Set(), touch = { f: 0, b: 0, l: 0, r: 0, run: 0 }, pad = { ix: 0, iy: 0, run: 0, xWas: false, yWas: false, lx: 0, ly: 0 };
  let prevCar = null, cartHome = null, doorArmed = true, doorStub = null, roundWas = false, lightsWas = null, drag = null, person = null, ui = null;
  const MOVE = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1, ShiftRight: 1 };

  // ------------------------------------------------------------------ wallet (works before the world is built: races and drifts pay any time)
  const wallet = (B.wallet = {
    cash: Math.max(0, Math.round(+store.get('cash', 100) || 0)),
    earn(n, why) { n = Math.round(n); if (n <= 0) return; wallet.cash += n; store.set('cash', wallet.cash); cashHud(); flash('+$' + n + (why ? ': ' + why : '')); },
    pay(n) { n = Math.round(n); if (n > wallet.cash) { flash('Need $' + n + ', have $' + wallet.cash); return false; } wallet.cash -= n; store.set('cash', wallet.cash); cashHud(); if (n > 0) flash('-$' + n); return true; },
  });
  B.game.on('bank', (pts) => { const n = Math.floor((pts || 0) / 100); if (n > 0) wallet.earn(n, 'drift'); });
  B.game.on('raceFinish', (t, isBest) => { wallet.earn(40, 'race finish'); if (isBest) wallet.earn(100, 'best time'); });
  let flashT = 0;
  function flash(m) { if (!ui) return; ui.flash.textContent = m; ui.flash.classList.remove('on'); void ui.flash.offsetWidth; ui.flash.classList.add('on'); flashT = 1.8; }
  function cashHud() { if (ui) ui.cash.textContent = '$' + wallet.cash.toLocaleString(); }

  // ------------------------------------------------------------------ DOM: cash readout, hint line, touch button, the pro shop panel, help rows
  function buildUi() {
    const css = document.createElement('style'); css.textContent = `
#plCash { margin-left:14px; white-space:nowrap } #plCash b { color:var(--gold) }
#plFlash { position:absolute; left:100%; bottom:0; margin-left:14px; white-space:nowrap; text-transform:none; letter-spacing:.02em; font:700 18px var(--text); color:var(--gold); text-shadow:0 1px 4px #000; opacity:0; pointer-events:none } #plFlash.on { animation: plUp 1.8s ease-out }
@keyframes plUp { 0% { opacity:0; transform:translateY(8px) } 15% { opacity:1 } 70% { opacity:1 } 100% { opacity:0; transform:translateY(-14px) } }
#plHint { position:absolute; left:50%; bottom:196px; transform:translateX(-50%); max-width:92%; width:max-content; text-align:center; padding:6px 12px; border-radius:4px; background:rgba(24,22,23,.62); font:600 16px var(--text); letter-spacing:.04em; color:var(--cream); pointer-events:none }
#plHint kbd { margin-right:4px } #hud.golf #plHint { bottom:120px }
#tWalk { right:30px; bottom:180px; width:96px; height:44px; border-radius:12px; font-size:14px }
.touch #plHint { bottom:280px } .touch #plFlash { left:0; bottom:auto; top:100%; margin:4px 0 0 }
@media (max-width: 920px) { #plHint { bottom:226px } }
#pProShop .list { display:flex; flex-direction:column; gap:6px } #pProShop .item .price { color:var(--gold); font-weight:700; font-size:18px; white-space:nowrap }
#pProShop .rounds { font-size:15px; color:var(--dim); line-height:1.5; max-height:160px; overflow:auto } #pProShop .rounds b { color:var(--cream) } #pProShop h3 { margin:6px 0 0; font:700 17px var(--text); letter-spacing:.06em; text-transform:uppercase; color:var(--dim) }`;
    document.head.append(css);
    const st = $('stage2'), mk = (tag, id, html, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
    const cash = mk('span', 'plCash', '· Cash <b>$0</b>'), fl = mk('div', 'plFlash'), hint = mk('div', 'plHint'); hint.hidden = true; st.append(hint); $('total').append(cash, fl);      // on the drift-score line (the challenge tracker owns the line above it)
    const tw = mk('button', 'tWalk', 'WALK', 'pad'); tw.setAttribute('aria-label', 'Get out, get in, enter the shop'); $('touch').append(tw);
    tw.addEventListener('pointerdown', (e) => { e.preventDefault(); if (onFoot) interact(); else exit(); }); tw.addEventListener('contextmenu', (e) => e.preventDefault());
    // on foot the driving pads walk: GAS forward, BRAKE back, ◀ ▶ turn, E-BRAKE run (the car's own handlers keep running; its physics is frozen)
    for (const [id, k] of [['tGas', 'f'], ['tBrk', 'b'], ['tL', 'l'], ['tR', 'r'], ['tHb', 'run']]) { const el = $(id); if (!el) continue; const set = (v) => () => { touch[k] = v; }; el.addEventListener('pointerdown', set(1)); el.addEventListener('pointerup', set(0)); el.addEventListener('pointercancel', set(0)); }
    // the pro shop panel
    const panel = mk('div', 'pProShop', '', 'panel'); panel.hidden = true;
    panel.innerHTML = '<div class="head"><h2 id="plShopTitle">Pro shop</h2><button class="btn small" id="plLeave">Leave</button></div><p id="plShopInfo"></p>' +
      '<div class="list" id="plPlays"></div>' +
      '<div class="opt"><label>Scoring</label><div class="seg" id="segPlMode"><button data-v="stroke">Stroke play</button><button data-v="match">Match play vs the pro</button></div></div>' +
      '<div class="opt"><label>Clubs</label><div class="seg" id="segPlClubs"><button data-v="rental">Rental</button><button data-v="standard">Standard</button><button data-v="tour">Tour</button></div></div><p class="fine" id="plClubNote"></p>' +
      '<div class="opt"><label>Golf cart</label><button class="btn ghost small" id="plCart">Rent a cart · $10</button></div>' +
      '<h3>Past rounds</h3><div class="rounds" id="plRounds"></div>';
    $('pPause').parentElement.append(panel);
    ui = { cash: cash.querySelector('b'), flash: fl, hint, tw, panel, plays: panel.querySelector('#plPlays'), info: panel.querySelector('#plShopInfo'), note: panel.querySelector('#plClubNote'), cart: panel.querySelector('#plCart'), rounds: panel.querySelector('#plRounds'), title: panel.querySelector('#plShopTitle'), hintWas: 0 };
    panel.querySelector('#plLeave').onclick = closeShop;
    for (const [holes, mode, label, price] of [[9, 'round', 'Play 9 holes', 18], [18, 'round', 'Play 18 holes', 30], [0, 'range', 'Practice range', 5]]) {
      const b = mk('button', null, '<div class="grow"><b>' + label + '</b><span>' + (mode === 'range' ? 'A bucket of balls on the range across the highway' : 'From the first tee · stroke or match play') + '</span></div><span class="price">$' + price + '</span>', 'item');
      b.onclick = () => buy(holes, mode, price); ui.plays.append(b);
    }
    seg('segPlMode', shop.mode, (v) => { shop.mode = v; store.set('player.mode', v); });
    seg('segPlClubs', shop.set, pickSet);
    ui.cart.onclick = rentCart;
    cashHud();
    // Controls panel rows (keyboard, touch, pad)
    const help = $('pHelp'), kb = help && help.querySelector('.kb'), tp = help && help.querySelector('.tp');
    if (kb) kb.insertAdjacentHTML('beforeend', '<div><kbd>E</kbd></div><span>Get out of the car when stopped · get into a car or golf cart · enter the pro shop</span><div><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>Shift</kbd></div><span>On foot: walk, run · <kbd>C</kbd> camera · drag the mouse to look around</span>');
    if (tp) tp.insertAdjacentHTML('beforeend', '<div><kbd>WALK</kbd></div><span>Get out / get in / enter the pro shop · on foot GAS walks, BRAKE backs up, ◀ ▶ turn, E-BRAKE runs</span>');
    const gpRow = help && help.querySelector('.keys > span:last-of-type'); if (gpRow) gpRow.insertAdjacentHTML('afterend', '<div>On foot pad</div><span>X get in / out · left stick walk · right trigger run · right stick look · Y camera</span>');
  }
  function seg(id, value, onPick) { const el = $(id); for (const b of el.children) { b.classList.toggle('on', b.dataset.v === String(value)); if (onPick) b.onclick = () => { seg(id, b.dataset.v); onPick(b.dataset.v); }; } }

  // ------------------------------------------------------------------ the person
  function buildPerson() {
    const g = new T.Group(), M = { shirt: std(0xf6ead3, 0.85), pants: std(0x2a2c33, 0.9), skin: std(0xc98f68, 0.7), cap: std(0xc8202b, 0.7), shoe: std(0x1b1a1c, 0.6), bag: std(0x3a2a1c, 0.8), chrome: std(0xd8dadd, 0.3, 0.8) };
    const legs = [], arms = [];
    for (const sd of [-1, 1]) {
      const hip = new T.Group(); hip.position.set(0, 0.86, sd * 0.1); const leg = cyl(M.pants, 0.075, 0.06, 0.78, 0, -0.39, 0), shoe = box(M.shoe, 0.26, 0.08, 0.11, 0.04, -0.82, 0); hip.add(leg, shoe); g.add(hip); legs.push(hip);
      const sh = new T.Group(); sh.position.set(0, 1.44, sd * 0.25); const up = cyl(M.shirt, 0.05, 0.045, 0.28, 0, -0.14, 0), lo = cyl(M.skin, 0.045, 0.04, 0.34, 0, -0.45, 0), hand = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), M.skin); hand.position.y = -0.64; hand.castShadow = true; sh.add(up, lo, hand); g.add(sh); arms.push(sh);
    }
    g.add(box(M.pants, 0.27, 0.2, 0.34, 0, 0.95, 0), box(M.shirt, 0.29, 0.5, 0.4, 0, 1.3, 0), cyl(M.skin, 0.05, 0.05, 0.08, 0, 1.58, 0));
    const head = new T.Mesh(new T.SphereGeometry(0.12, 14, 10), M.skin); head.position.y = 1.7; head.castShadow = true; g.add(head);
    g.add(cyl(M.cap, 0.125, 0.13, 0.08, 0, 1.78, 0), box(M.cap, 0.16, 0.02, 0.2, 0.15, 0.1 + 1.65, 0));
    const bag = new T.Group(); bag.position.set(-0.24, 1.15, 0); bag.rotation.z = -0.22;
    bag.add(cyl(M.bag, 0.11, 0.1, 0.78, 0, 0, 0)); for (let k = 0; k < 4; k++) { bag.add(cyl(M.chrome, 0.006, 0.006, 0.42, (k - 1.5) * 0.03, 0.56, (k % 2 - 0.5) * 0.08)); bag.add(box(M.shoe, 0.05, 0.03, 0.06, (k - 1.5) * 0.03, 0.79, (k % 2 - 0.5) * 0.08)); }
    bag.add(box(M.bag, 0.03, 0.5, 0.04, 0.13, 0.05, 0)); g.add(bag); bag.visible = false;
    g.visible = false; scene.add(g);
    return { group: g, legs, arms, bag };
  }
  const std = (hex, rough, metal) => new T.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: metal || 0 });
  const box = (m, w, h, d, x, y, z) => { const q = new T.Mesh(new T.BoxGeometry(w, h, d), m); q.position.set(x, y, z); q.castShadow = true; return q; };
  const cyl = (m, r0, r1, h, x, y, z) => { const q = new T.Mesh(new T.CylinderGeometry(r0, r1, h, 12), m); q.position.set(x, y, z); q.castShadow = true; return q; };

  // ------------------------------------------------------------------ parked vehicles (static models that collide)
  function addStatic(kind, o) {
    const model = B.buildCar(o.spec), v = { id: o.id, kind, spec: o.spec, drift: !!o.drift, x: o.x, y: o.y, psi: o.psi, h: o.h === undefined ? W.heightXZ(o.x, -o.y) : o.h, pitch: o.pitch || 0, roll: o.roll || 0, group: model.group, model, home: o.home || null };
    model.group.rotation.order = 'YZX'; model.group.rotation.set(v.roll, v.psi, v.pitch); model.group.position.set(v.x, v.h + 0.06, -v.y);
    if (kind === 'car') { const paints = store.get('paints', {}), hex = paints[o.id]; if (hex !== undefined) { const fac = lin(o.spec.color).getHex(); model.group.traverse((q) => { if (q.isMesh) for (const m of Array.isArray(q.material) ? q.material : [q.material]) if (m.color && m.color.getHex() === fac) m.color.copy(lin(hex)); }); } }
    model.setLights(lightsWas === 'dusk' || lightsWas === 'night', false);
    scene.add(model.group); parked.push(v); return v;
  }
  function removeStatic(v) { const i = parked.indexOf(v); if (i >= 0) parked.splice(i, 1); scene.remove(v.group); }
  function cartSpec() { return P.makeCar(P.CARS.find((c) => c.id === 'cart'), false).spec; }
  function seatStatics() {        // the course terrain can arrive late and the lamps follow the time of day
    const tod = W.time; if (tod !== lightsWas) { lightsWas = tod; const on = tod === 'dusk' || tod === 'night'; for (let i = 0; i < parked.length; i++) parked[i].model.setLights(on, false); }
    for (let i = 0; i < parked.length; i++) { const v = parked[i]; if (v.kind === 'cart') { v.h = W.heightXZ(v.x, -v.y); v.group.position.y = v.h + 0.06; } }
  }
  const hit = { nx: 0, nz: 0, depth: 0 };
  // a vehicle is two circles (radius W/2) along its body axis; the deepest penetration of circle (X, Z, r) goes into hit
  function vehicleHit(p, X, Z, r) {
    const cs = Math.cos(p.psi), sn = Math.sin(p.psi), half = p.spec.L / 2 - p.spec.W / 2, rr = p.spec.W / 2;
    for (let q = -1; q <= 1; q += 2) { const dx = X - (p.x + cs * half * q), dz = Z + (p.y + sn * half * q), d = Math.hypot(dx, dz), pen = r + rr - d; if (pen > hit.depth && d > 1e-4) { hit.depth = pen; hit.nx = dx / d; hit.nz = dz / d; } }
  }
  function wrapCollide() {        // parked vehicles block the walker and whatever is being driven (the live car tests itself here, so it is not in this list)
    const c0 = W.collide;
    W.collide = (X, Z, r) => {
      const a = c0(X, Z, r); if (!parked.length) return a; hit.depth = 0;
      for (let i = 0; i < parked.length; i++) vehicleHit(parked[i], X, Z, r);
      return hit.depth > 0 && (!a || hit.depth > a.depth) ? hit : a;
    };
  }

  // ------------------------------------------------------------------ in and out
  const racing = () => B.game.race && B.game.race.state !== 'done';
  function exit() {
    if (onFoot || !built || B.game.mode !== 'drive' || B.game.panel) return false;
    const car = B.game.car; if (car.speed > 1 || car.air) return false;
    if (racing()) { toast('Finish the race first'); return false; }
    car.vx = car.vy = car.r = 0; car.thr = 0; park.x = car.x; park.y = car.y;
    const s = car.spec, lx = -Math.sin(car.psi), ly = Math.cos(car.psi), fx = Math.cos(car.psi), fy = Math.sin(car.psi);
    // beside the driver's door; the other side or behind if that spot is blocked or wet
    let ok = false;
    for (const [ox, oy] of [[lx, ly], [-lx, -ly], [-fx, -fy], [fx, fy]]) {
      const d = ox === fx || ox === -fx ? s.L / 2 + 0.9 : s.W / 2 + 0.8, x = car.x + ox * d, y = car.y + oy * d;
      if (!W.collide(x, -y, 0.3) && W.surface(x, -y) !== 3) { pl.x = x; pl.y = y; ok = true; break; }
    }
    if (!ok) { pl.x = car.x + lx * (s.W / 2 + 0.8); pl.y = car.y + ly * (s.W / 2 + 0.8); }
    pl.psi = car.psi; pl.yaw = car.psi; pl.pitch = 0.24; pl.v = 0; pl.h = W.heightXZ(pl.x, -pl.y);
    onFoot = true; person.group.visible = true; placePerson(); doorArmed = hyp(pl.x - door()[0], pl.y - door()[1]) > DOOR_R + 1;
    keys.clear(); if (B.game.isTouch) { ui.tw.textContent = 'ENTER'; $('tGas').textContent = 'WALK'; $('tBrk').textContent = 'BACK'; $('tHb').textContent = 'RUN'; }
    return true;
  }
  function enterLive() {
    if (!onFoot) return; onFoot = false; person.group.visible = false; if (B.game.cam === cam) B.game.cam = null; keys.clear();
    if (B.game.isTouch) { ui.tw.textContent = 'WALK'; $('tGas').textContent = 'GAS'; $('tBrk').textContent = 'BRAKE'; $('tHb').textContent = 'E-BRAKE'; }
  }
  const cartsLocked = () => !!C && !shop.cartRented;
  function nearest() {            // the live car or a parked vehicle within reach of the walker, else null
    const car = B.game.car; let best = null, bd = REACH;
    let d = hyp(pl.x - car.x, pl.y - car.y) - car.spec.L / 2; if (d < bd) { bd = d; best = LIVE; }
    for (let i = 0; i < parked.length; i++) { const v = parked[i]; d = hyp(pl.x - v.x, pl.y - v.y) - v.spec.L / 2; if (d < bd) { bd = d; best = v; } }
    return best;
  }
  const LIVE = { live: true };
  function enter(v) {
    if (!onFoot || B.game.mode !== 'drive' || B.game.panel) return false;
    v = v || nearest(); if (!v) return false;
    if (v === LIVE) { enterLive(); return true; }
    if (v.kind === 'cart') { if (!B.cartModel) return false; if (cartsLocked()) { toast('Rent a cart in the pro shop ($10)'); return false; } }
    swapInto(v); return true;
  }
  function swapInto(v) {        // ponytail: the swap is not persisted; a reload while in a cart boots in the player's own car at the start (bd.car is kept). Save prevCar + the static's pose under bd.player.* to resume in the cart
    const car = B.game.car, S = B.game.settings, cur = { id: car.spec.id, spec: car.spec, drift: !!car.spec.drift, x: car.x, y: car.y, psi: car.psi, h: car.h, pitch: car.pitch, roll: car.roll, home: cartHome };
    enterLive();
    addStatic(cur.id === 'cart' ? 'cart' : 'car', cur); removeStatic(v);
    swapping = true;
    try { B.game.setCar(v.id, v.kind === 'cart' ? false : v.drift); B.game.placeCar(v.x, v.y, v.psi); } finally { swapping = false; }
    if (v.kind === 'cart') { if (!prevCar) prevCar = { id: cur.id, drift: cur.drift }; cartHome = v.home; S.car = prevCar.id; S.drift = prevCar.drift; store.set('car', prevCar.id); store.set('drift', prevCar.drift); }
    else { prevCar = null; cartHome = null; }
    toast(v.kind === 'cart' ? 'Golf cart · 24 km/h' : v.spec.name);
  }
  function interact() {           // E on foot: the shop door first, then a vehicle
    const d = door(); if (hyp(pl.x - d[0], pl.y - d[1]) < DOOR_R + 0.6) { openShop(); return true; }
    return enter();
  }
  // the garage can swap the car while we drive a cart: the cart goes home, the parked car static is dropped
  B.game.on('car', (spec) => {
    if (swapping || !built || !prevCar || spec.id === 'cart') return;
    for (let i = parked.length - 1; i >= 0; i--) if (parked[i].kind === 'car') removeStatic(parked[i]);
    if (cartHome) addStatic('cart', { id: 'cart', spec: cartSpec(), x: cartHome[0], y: cartHome[1], psi: cartHome[2], home: cartHome });
    prevCar = null; cartHome = null;
  });
  B.game.on('raceStart', () => { if (onFoot) enterLive(); });

  // ------------------------------------------------------------------ the pro shop
  const shop = { mode: store.get('player.mode', 'stroke'), set: store.get('player.set', 'rental'), owned: store.get('player.sets', ['rental']), cartRented: !!store.get('player.cart', false) };
  if (shop.mode !== 'match') shop.mode = 'stroke';
  if (!SHOP_SETS[shop.set] || !shop.owned.includes(shop.set)) shop.set = 'rental';
  const door = () => (C ? C.clubhouse.door : doorStub);
  const doorDir = () => (C ? C.clubhouse.doorDir : [1, 0]);
  function clubSet() { const q = SHOP_SETS[shop.set] || SHOP_SETS.rental; return { set: shop.set, ids: B.golf && B.golf.CLUBS ? B.golf.CLUBS.map((c) => c.id) : CLUB_IDS, acc: q.acc, dist: q.dist }; }
  function pickSet(v) {
    const q = SHOP_SETS[v]; if (!q) return;
    if (!shop.owned.includes(v)) { if (!wallet.pay(q.price)) { seg('segPlClubs', shop.set); renderShop(); return; } shop.owned.push(v); store.set('player.sets', shop.owned); toast(q.name + ' bought'); }
    shop.set = v; store.set('player.set', v); if (B.golf) B.golf.setClubs(clubSet()); renderShop();
  }
  function rentCart() { if (shop.cartRented) return; if (!wallet.pay(10)) return; shop.cartRented = true; store.set('player.cart', true); toast('Cart rented: the carts by the clubhouse are yours'); renderShop(); }
  function renderShop() {
    const hc = B.golf && B.golf.handicap ? B.golf.handicap() : 0;
    ui.title.textContent = (C && C.name ? C.name : 'Golf course') + ' · Pro shop';
    ui.info.textContent = 'Cash $' + wallet.cash.toLocaleString() + ' · handicap ' + (Math.round(hc * 10) / 10) + (B.golf ? '' : ' · golf is not installed');
    seg('segPlClubs', shop.set); for (const b of $('segPlClubs').children) { const q = SHOP_SETS[b.dataset.v]; b.textContent = q.name.replace(' set', '') + (shop.owned.includes(b.dataset.v) ? '' : ' $' + q.price); }
    ui.note.textContent = SHOP_SETS[shop.set].name + ' · ' + SHOP_SETS[shop.set].note + '. Rental clubs are free and a little wild; the Standard set is true; the Tour set flies 3 % farther and straighter.';
    ui.cart.textContent = shop.cartRented ? 'Cart rented for this round' : 'Rent a cart · $10'; ui.cart.disabled = shop.cartRented;
    const rs = store.get('golf.rounds', []); let html = '';
    for (let i = rs.length - 1; i >= Math.max(0, rs.length - 8); i--) { const r = rs[i], tp = r.gross - r.par; html += '<div><b>' + new Date(r.d).toLocaleDateString() + '</b> · ' + (r.holes || 0) + ' holes · ' + r.gross + ' (' + (tp > 0 ? '+' + tp : tp === 0 ? 'E' : tp) + ') · net ' + r.net + ' · ' + (r.mode === 'match' ? 'match play' : 'stroke play') + '</div>'; }
    ui.rounds.innerHTML = html || '<div>No rounds yet. Pay for a round and head to the first tee.</div>';
  }
  function openShop() { if (B.game.panel || B.game.mode !== 'drive') return; renderShop(); B.game.openPanel('pProShop'); doorArmed = false; }
  function closeShop() {
    B.game.closePanel();
    if (onFoot) { const d = door(), dd = doorDir(); pl.x = d[0] + dd[0] * 1.8; pl.y = d[1] + dd[1] * 1.8; pl.psi = pl.yaw = Math.atan2(dd[1], dd[0]); pl.h = W.heightXZ(pl.x, -pl.y); placePerson(); }
  }
  function buy(holes, mode, price) {
    if (!B.golf || !B.golf.startRound) { toast('Golf is not installed'); return; }
    if (!wallet.pay(price)) return;
    B.golf.startRound(mode === 'range' ? { mode: 'range', clubs: clubSet() } : { holes, mode: shop.mode === 'match' ? 'match' : 'stroke', clubs: clubSet() });
    B.game.closePanel(); roundWas = true;
    // out to the first tee (the ball), or beside the nearest cart when one is rented
    const ball = B.golf.state && B.golf.state.ball; let tx = pl.x, ty = pl.y, cart = null;
    if (shop.cartRented && mode !== 'range') { let bd = 1e9; for (let i = 0; i < parked.length; i++) { const v = parked[i]; if (v.kind !== 'cart') continue; const d = hyp(v.x - pl.x, v.y - pl.y); if (d < bd) { bd = d; cart = v; } } }
    if (cart) { tx = cart.x - Math.sin(cart.psi) * 1.6; ty = cart.y + Math.cos(cart.psi) * 1.6; }
    else if (ball) { const d = door(), ang = Math.atan2(d[1] - ball[1], d[0] - ball[0]); tx = ball[0] + Math.cos(ang) * 2.4; ty = ball[1] + Math.sin(ang) * 2.4; }
    if (!onFoot) exit();
    if (onFoot) { pl.x = tx; pl.y = ty; pl.h = W.heightXZ(tx, -ty); pl.psi = pl.yaw = ball ? Math.atan2(ball[1] - ty, ball[0] - tx) : pl.psi; placePerson(); }
    if (cart) flash('Your cart is waiting');
  }

  // ------------------------------------------------------------------ input
  addEventListener('keydown', (e) => {
    if (!built || B.game.mode !== 'drive' || B.game.panel || (e.target && e.target.tagName === 'INPUT')) return;
    const c = e.code;
    if (c === 'KeyE') { if (!e.repeat && (onFoot ? interact() : exit())) { e.preventDefault(); e.stopImmediatePropagation(); } else if (onFoot) e.stopImmediatePropagation(); return; }
    if (!onFoot) return;
    if (MOVE[c]) { keys.add(c); e.preventDefault(); }
    else if (c === 'KeyP') e.stopImmediatePropagation();      // photo mode orbits the car and fights the chase camera
    else if (c === 'KeyC' && !e.repeat) { pl.mode = (pl.mode + 1) % 2; }
  }, true);
  addEventListener('keyup', (e) => keys.delete(e.code), true);
  addEventListener('blur', () => { keys.clear(); touch.f = touch.b = touch.l = touch.r = touch.run = 0; });
  const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
  function readPad(dt) {        // ponytail: the browser's standard layout only (X 2, Y 3, RT 7, sticks 0-3); read game.js's captured padMap (bd.padMap) to honour custom layouts
    const pads = navigator.getGamepads ? navigator.getGamepads() : null; let gp = null;
    if (pads) for (let i = 0; i < pads.length; i++) { const g = pads[i]; if (g && g.connected && g.buttons.length >= 4) { gp = g; break; } }
    pad.ix = pad.iy = pad.run = 0; if (!gp) { pad.xWas = pad.yWas = false; return; }
    pad.ix = -dz(gp.axes[0] || 0); pad.iy = -dz(gp.axes[1] || 0); pad.run = gp.buttons[7] && (gp.buttons[7].value > 0.5 || gp.buttons[7].pressed) ? 1 : 0;
    const bx = !!(gp.buttons[2] && gp.buttons[2].pressed), by = !!(gp.buttons[3] && gp.buttons[3].pressed);
    if (bx && !pad.xWas && B.game.mode === 'drive' && !B.game.panel) { if (onFoot) interact(); else exit(); }
    if (by && !pad.yWas && onFoot) pl.mode = (pl.mode + 1) % 2;
    pad.xWas = bx; pad.yWas = by;
    if (onFoot) { const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0); if (rx || ry) { pl.yaw -= rx * dt * 2.6; pl.pitch = clamp(pl.pitch + ry * dt * 1.6, -0.15, 1.1); pl.hold = 1.2; } }
  }
  function pointers() {
    const view = $('view');
    view.addEventListener('pointerdown', (e) => { if (onFoot && !(B.golf && B.golf.camActive) && B.game.mode === 'drive' && !B.game.panel) drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    view.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; pl.yaw -= (e.clientX - drag.x) * 0.006; pl.pitch = clamp(pl.pitch + (e.clientY - drag.y) * 0.004, -0.15, 1.1); drag.x = e.clientX; drag.y = e.clientY; pl.hold = 2; });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; }; view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------ per frame
  function placePerson() { const g = person.group; g.position.set(pl.x, pl.h, -pl.y); g.rotation.y = pl.psi; }
  function tryMove(nx, ny) { return moveTo(nx, ny) || moveTo(nx, pl.y) || moveTo(pl.x, ny); }      // blocked head-on (a trunk, a wall): slide along it
  const ditch = (x, y) => (W.surface(x + 2, -y) !== 3 && W.surface(x - 2, -y) !== 3) || (W.surface(x, -y - 2) !== 3 && W.surface(x, -y + 2) !== 3);      // water under 4 m wide (the course's streams) is stepped over; ponds are not
  function moveTo(nx, ny) {      // ponytail: traffic (W.dynamic) is not tested, so a walker and a traffic car pass through each other; add a circle test against W.dynamic to stop them
    let h = W.collide(nx, -ny, 0.32); if (h) { nx += h.nx * h.depth; ny -= h.nz * h.depth; if (W.collide(nx, -ny, 0.32)) return false; }
    hit.depth = 0; vehicleHit(B.game.car, nx, -ny, 0.32); if (hit.depth > 0) { nx += hit.nx * hit.depth; ny -= hit.nz * hit.depth; h = hit; }      // the car we got out of
    if (GW && GW.collide && GW.collide(nx, ny, 0.32) && !h) return false;
    if (W.surface(nx, -ny) === 3 && !ditch(nx, ny)) return false;
    if ((Math.abs(nx) > W.HALF || Math.abs(ny) > W.HALF) && !(W.inCorridor && W.inCorridor(nx, -ny))) return false;
    pl.x = nx; pl.y = ny; return true;
  }
  function walk(dt) {
    const golfing = !!(B.golf && B.golf.camActive);       // golf owns the keys and the camera while the player addresses the ball
    let ix = 0, iy = 0, run = 0;
    const gs = golfing && B.golf.state, gph = gs && gs.phase;
    if (gph === 'address' || gph === 'power' || gph === 'acc') { const a = gs.aim; pl.x = gs.ball[0] + Math.sin(a) * 0.8; pl.y = gs.ball[1] - Math.cos(a) * 0.8; pl.psi = a + PI / 2; pl.v = 0; }      // the stance: a right-hander beside the ball, facing it, the target on the left
    if (!golfing) {
      ix = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + pad.ix;
      iy = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + pad.iy + touch.f - touch.b;
      run = keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.run || touch.run ? 1 : 0;
      if (touch.l || touch.r) { pl.yaw += (touch.l - touch.r) * dt * 2.2; if (!iy) pl.psi = pl.yaw; }
    }
    const mag = Math.min(1, hyp(ix, iy)), want = mag > 0.05 ? (run ? RUN : WALK) * mag : 0;
    if (mag > 0.05) { const dir = pl.yaw + Math.atan2(ix, iy); let da = dir - pl.psi; da = Math.atan2(Math.sin(da), Math.cos(da)); pl.psi += da * Math.min(1, dt * 12); }
    pl.v += (want - pl.v) * Math.min(1, dt * 9);
    if (pl.v > 0.02) { const step = pl.v * dt; if (!tryMove(pl.x + Math.cos(pl.psi) * step, pl.y + Math.sin(pl.psi) * step)) pl.v *= 0.3; }
    pl.h = W.heightXZ(pl.x, -pl.y);
    // the camera settles behind the walker's heading unless the player is looking around
    if (pl.hold > 0) pl.hold -= dt; else if (pl.v > 0.3 && iy > 0.1) { let da = pl.psi - pl.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); pl.yaw += da * Math.min(1, dt * 2.2); }      // backing up (S) keeps the camera where it is, so S stays 'towards the camera'
    // arms and legs
    const k = clamp(pl.v / 2.2, 0, 1.3); pl.phase += pl.v * dt * (pl.v > 2.5 ? 3.4 : 4.0); const sw = Math.sin(pl.phase) * 0.62 * Math.min(1, k);
    person.legs[0].rotation.z = sw; person.legs[1].rotation.z = -sw; person.arms[0].rotation.z = -sw * 0.8; person.arms[1].rotation.z = sw * 0.8;
    person.bag.visible = !!(B.golf && B.golf.inRound);
    placePerson(); person.group.position.y += Math.abs(Math.sin(pl.phase)) * 0.035 * Math.min(1, k);
    // chase camera (yielded to golf while it owns the view)
    if (golfing) { if (B.game.cam === cam) B.game.cam = null; return; }
    const d = pl.mode ? 7.5 : 4.4, cp = Math.cos(pl.pitch), tall = B.game.camera && B.game.camera.aspect < 1;
    let px = pl.x - Math.cos(pl.yaw) * cp * d, py = pl.y - Math.sin(pl.yaw) * cp * d, ph = pl.h + 1.25 + Math.sin(pl.pitch) * d;
    const floor = W.heightXZ(px, -py) + 0.45; if (ph < floor) ph = floor;
    cam[0] = px; cam[1] = ph; cam[2] = -py; cam[3] = pl.x + Math.cos(pl.yaw) * 0.6; cam[4] = pl.h + 1.3; cam[5] = -(pl.y + Math.sin(pl.yaw) * 0.6); cam[6] = tall ? 70 : 60;
    B.game.cam = cam;
  }
  const HINTS = ['', 'pro shop', 'Golf carts are rented in the pro shop · $10', 'get in', 'get in the cart', 'get in your car', 'get out'];
  function hint() {           // a state code per frame; the DOM (and a string) only when it changes
    let k = 0;
    if (onFoot) {
      const d = door(), nd = hyp(pl.x - d[0], pl.y - d[1]), v = nd < DOOR_R + 0.6 ? null : nearest();
      if (nd < DOOR_R + 0.6) k = 1; else if (v) k = v !== LIVE && v.kind === 'cart' && cartsLocked() ? 2 : v === LIVE ? 3 : v.kind === 'cart' ? 4 : 5;
    } else if (B.game.car.speed < 1 && !racing() && !(B.golf && B.golf.inRound && B.golf.state.phase !== 'walk')) k = 6;
    if (k === ui.hintWas) return; ui.hintWas = k;
    ui.hint.innerHTML = k === 0 || k === 2 ? HINTS[k] : '<kbd>' + (B.game.isTouch ? (k === 6 ? 'WALK' : 'ENTER') : 'E') + '</kbd>' + HINTS[k]; ui.hint.hidden = !k;
  }
  function update(dt, driving) {
    if (flashT > 0 && (flashT -= dt) <= 0) ui.flash.classList.remove('on');
    if (!driving) return;
    seatStatics(); readPad(dt);
    const inRound = !!(B.golf && B.golf.inRound); if (roundWas && !inRound && shop.cartRented) { shop.cartRented = false; store.set('player.cart', false); } roundWas = inRound;
    // ponytail: the engine voice is silenced on foot (the car is off) and in the cart (electric); an ENG 'cart' whine in audio.js is the upgrade
    const quiet = onFoot || B.game.car.spec.id === 'cart'; if (quiet !== quietWas && B.audio && B.audio.setVolume) { quietWas = quiet; try { B.audio.setVolume({ engine: quiet ? 0 : +store.get('vol.engine', 0.8) }); } catch (e) {} }
    if (onFoot) {
      const car = B.game.car;
      if (hyp(car.x - park.x, car.y - park.y) > 2.5) { enterLive(); toast('Back in the car'); }      // reset, the map or a race moved it
      else {
        walk(dt);
        const d = door(), nd = hyp(pl.x - d[0], pl.y - d[1]); if (nd < DOOR_R) { if (doorArmed) openShop(); } else if (nd > DOOR_R + 1.5) doorArmed = true;
      }
    } else if (B.game.cam === cam) B.game.cam = null;
    hint();
  }

  // ------------------------------------------------------------------ build
  function build() {
    W = B.game.world; scene = B.game.scene; C = window.BLOOMFIELD_GOLF || B.BLOOMFIELD_GOLF || null; GW = B.golfWorld && B.golfWorld.ready ? B.golfWorld : null;
    if (C && !(C.clubhouse && C.clubhouse.door && C.cartSpots)) C = null;
    lightsWas = W.time; buildUi(); pointers(); person = buildPerson(); wrapCollide();
    const car = B.game.car, cs = cartSpec();
    if (C) { for (let i = 0; i < Math.min(4, C.cartSpots.length); i++) { const s = C.cartSpots[i]; addStatic('cart', { id: 'cart', spec: cs, x: s[0], y: s[1], psi: s[2], home: s }); } }
    else {        // no course: two carts beside the player's car and a marked stub door 10 m east of the start
      const fx = Math.cos(car.psi), fy = Math.sin(car.psi), lx = -fy, ly = fx;
      for (const sd of [-1, 1]) { const x = car.x + fx * 6 + lx * sd * 3, y = car.y + fy * 6 + ly * sd * 3, home = [x, y, car.psi]; addStatic('cart', { id: 'cart', spec: cs, x, y, psi: car.psi, home }); }
      doorStub = [car.x + 10, car.y - 4]; const h = W.heightXZ(doorStub[0], -doorStub[1]), m = std(0xf6ead3, 0.8), red = std(0xc8202b, 0.8);
      for (const q of [box(m, 0.2, 2.2, 0.2, -0.7, 1.1, 0), box(m, 0.2, 2.2, 0.2, 0.7, 1.1, 0), box(red, 1.8, 0.3, 0.3, 0, 2.35, 0)]) { q.position.x += doorStub[0]; q.position.y += h; q.position.z += -doorStub[1]; scene.add(q); }
    }
    // the car is frozen while nobody is in it (game.js steps P.step on the live car each frame)
    const step0 = P.step; P.step = function (c, inp, dt, env) { if (onFoot && c === B.game.car) return; return step0(c, inp, dt, env); };
    B.game.on('frame', (dt, driving) => { try { update(dt, driving); } catch (e) { if (!errOnce) { errOnce = true; console.error('player', e); } } });
    if (B.golf && B.golf.setClubs) B.golf.setClubs(clubSet());
    built = true;
  }
  const POS = [0, 0];
  B.player = {
    get onFoot() { return onFoot; }, exit, enter, get pos() { POS[0] = pl.x; POS[1] = pl.y; return POS; }, get heading() { return pl.psi; }, get walkSpeed() { return pl.v; }, get cameraMode() { return pl.mode; }, set cameraMode(v) { pl.mode = v ? 1 : 0; },
    get cartRented() { return shop.cartRented; }, vehicles: parked, shop: { open: openShop, close: closeShop, buy, pickSet, rentCart, state: shop }, get person() { return person && person.group; }, get ready() { return built; },
    sets: SHOP_SETS, clubSet, debug: { pl, park, get prevCar() { return prevCar; } },      // the walker's live state, for the tools
  };
  let tries = 0;      // game.js emits no 'ready': poll for the world and the car; give the course engineer's BD.golfWorld a minute to finish
  (function wait() { if (B.game.world && B.game.scene && B.game.car && (!window.BLOOMFIELD_GOLF || (B.golfWorld && B.golfWorld.ready) || tries > 300)) { try { build(); } catch (e) { console.error('player failed to build', e); } } else { tries++; setTimeout(wait, 200); } })();
})();
