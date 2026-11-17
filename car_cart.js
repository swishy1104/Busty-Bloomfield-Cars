/* Bloomfield Drift — the golf cart model (player.js drives it between holes at Phil Harris; four stand by the clubhouse).
   What this file adds: BD.buildCar(spec) returns this model for spec.id 'cart'; every other id still goes to the cars.js (or car_e300.js)
   builder. Same return shape as cars.js: { group, wheels[FL,FR,RL,RR], steer[L,R], brake (MeshBasicMaterial the game recolours),
   setLights(on, beams), noseX, tailX }; +X forward, +Y up, +Z right, origin = CG on the ground. Primitives only: a white fibreglass
   cowl and rear body on a grey chassis, a tan bench seat, a steering column, a white roof on four posts, a bag rack with two
   strapped-in bags behind the seat, 8-inch wheels, two headlamps and two tail lamps (lit by setLights; beams via BD.headBeam).
   Body paint = the one material in lin(spec.color), so the garage's paint logic would work if the cart were ever listed (it is hidden). */
(function () {
  'use strict';
  const T = window.THREE, B = (window.BD = window.BD || {});
  if (!T || typeof B.buildCar !== 'function') return;      // cars.js must load first
  const prevBuild = B.buildCar, PI = Math.PI, lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  const std = (hex, rough, metal) => new T.MeshStandardMaterial({ color: lin(hex), roughness: rough === undefined ? 0.6 : rough, metalness: metal || 0 });
  const box = (m, w, h, d, x, y, z, ry) => { const q = new T.Mesh(new T.BoxGeometry(w, h, d), m); q.position.set(x, y, z); if (ry) q.rotation.z = ry; q.castShadow = true; return q; };
  const cyl = (m, r0, r1, h, x, y, z, rx, rz) => { const q = new T.Mesh(new T.CylinderGeometry(r0, r1, h, 14), m); q.position.set(x, y, z); if (rx) q.rotation.x = rx; if (rz) q.rotation.z = rz; q.castShadow = true; return q; };
  let wheelGeo = null;

  function build(s) {
    const g = new T.Group(), a = s.a, b = -s.b, tw = s.track / 2, R = s.R;
    const M = { paint: std(s.color, 0.35, 0.05), grey: std(0x3b3d41, 0.55, 0.3), dark: std(0x17181b, 0.7), tan: std(0xb98b55, 0.85), seat: std(0x6b4a2a, 0.9), chrome: std(0xd8dadd, 0.25, 0.9),
      bag: std(0x24344a, 0.8), bag2: std(0x7a1f2b, 0.8), lamp: new T.MeshBasicMaterial({ color: lin(0x6f6a5a) }), brake: new T.MeshBasicMaterial({ color: 0x6a0a0a }), rubber: std(0x101113, 0.95) };
    // chassis rail, floor and the step sills
    g.add(box(M.grey, a - b + 0.6, 0.08, 0.9, (a + b) / 2, 0.3, 0));
    g.add(box(M.dark, 1.1, 0.03, 1.02, (a + b) / 2 + 0.15, 0.36, 0));                          // rubber floor mat
    for (const sd of [-1, 1]) g.add(box(M.grey, 1.0, 0.06, 0.12, (a + b) / 2 + 0.1, 0.33, sd * (tw + 0.08)));
    // front cowl: a rounded nose (box + a sloped dash), the bumper strip, two headlamps
    g.add(box(M.paint, 0.62, 0.42, 1.06, a + 0.12, 0.55, 0));
    const dash = box(M.paint, 0.5, 0.3, 1.02, a - 0.1, 0.8, 0, 0.5); g.add(dash);
    g.add(box(M.rubber, 0.08, 0.1, 1.0, a + 0.45, 0.4, 0));
    for (const sd of [-1, 1]) g.add(box(M.lamp, 0.03, 0.09, 0.14, a + 0.44, 0.6, sd * 0.36));
    // rear body over the motor and the batteries, the rear bumper, two tail lamps
    g.add(box(M.paint, 1.05, 0.46, 1.06, b - 0.05, 0.57, 0));
    g.add(box(M.rubber, 0.08, 0.1, 1.0, b - 0.6, 0.4, 0));
    for (const sd of [-1, 1]) g.add(box(M.brake, 0.03, 0.07, 0.12, b - 0.6, 0.62, sd * 0.4));
    // bench seat, backrest, the hip restraints
    g.add(box(M.seat, 0.5, 0.14, 1.0, b + 0.35, 0.87, 0));
    const back = box(M.seat, 0.1, 0.46, 1.0, b + 0.07, 1.14, 0, 0.12); g.add(back);
    for (const sd of [-1, 1]) g.add(box(M.chrome, 0.3, 0.03, 0.03, b + 0.3, 1.05, sd * 0.52));
    // steering column and wheel, the pedals
    g.add(cyl(M.dark, 0.02, 0.02, 0.55, a - 0.25, 0.95, 0.18, 0, -0.9));
    const sw = new T.Mesh(new T.TorusGeometry(0.16, 0.018, 8, 20), M.dark); sw.position.set(a - 0.5, 1.15, 0.18); sw.rotation.y = PI / 2; sw.rotation.x = -0.65; g.add(sw);
    g.add(box(M.dark, 0.06, 0.1, 0.08, a - 0.15, 0.45, 0.1)); g.add(box(M.dark, 0.06, 0.1, 0.08, a - 0.15, 0.45, 0.26));
    // roof on four posts (front pair raked back), with a rolled edge
    g.add(box(M.paint, 2.0, 0.05, 1.18, (a + b) / 2 + 0.05, 1.8, 0));
    g.add(box(M.paint, 2.0, 0.04, 0.05, (a + b) / 2 + 0.05, 1.76, 0.57)); g.add(box(M.paint, 2.0, 0.04, 0.05, (a + b) / 2 + 0.05, 1.76, -0.57));
    for (const sd of [-1, 1]) { g.add(cyl(M.grey, 0.025, 0.025, 1.08, a + 0.1, 1.26, sd * 0.53, 0, -0.22)); g.add(cyl(M.grey, 0.025, 0.025, 1.0, b - 0.15, 1.3, sd * 0.53)); }
    g.add(box(M.dark, 0.03, 0.42, 1.1, a - 0.46, 1.52, 0, 0.1));                                 // the windscreen (dark acrylic)
    // bag rack behind the seat: a frame, a basket and two bags with club heads
    g.add(box(M.grey, 0.04, 0.5, 1.0, b - 0.35, 1.0, 0)); g.add(box(M.grey, 0.3, 0.04, 1.0, b - 0.5, 0.82, 0));
    for (const sd of [-1, 1]) { g.add(box(M.grey, 0.3, 0.04, 0.04, b - 0.5, 1.22, sd * 0.49)); g.add(box(M.grey, 0.04, 0.44, 0.04, b - 0.64, 1.02, sd * 0.49)); }
    for (const sd of [-1, 1]) {
      g.add(cyl(sd < 0 ? M.bag : M.bag2, 0.11, 0.1, 0.8, b - 0.52, 1.22, sd * 0.26, 0, 0.18));
      for (let k = 0; k < 3; k++) { g.add(cyl(M.chrome, 0.006, 0.006, 0.5, b - 0.56 - k * 0.03, 1.8, sd * 0.26 + (k - 1) * 0.045, 0, 0.18)); g.add(box(M.dark, 0.05, 0.03, 0.07, b - 0.6 - k * 0.03, 2.03, sd * 0.26 + (k - 1) * 0.045)); }
    }
    // wheels: a wide 8-inch tyre with a plain steel rim and a hub cap
    if (!wheelGeo) wheelGeo = [new T.CylinderGeometry(R, R, 0.18, 20).rotateX(PI / 2), new T.CylinderGeometry(R * 0.58, R * 0.58, 0.19, 14).rotateX(PI / 2), new T.CylinderGeometry(0.035, 0.035, 0.2, 10).rotateX(PI / 2)];
    const wheels = [], steer = [];
    for (let r = 0; r < 2; r++) for (const sd of [-1, 1]) {
      const piv = new T.Group(), spin = new T.Group(), ty = new T.Mesh(wheelGeo[0], M.rubber), rm = new T.Mesh(wheelGeo[1], M.chrome), hub = new T.Mesh(wheelGeo[2], M.dark);
      ty.castShadow = true; piv.position.set(r ? b : a, R, sd * tw); spin.add(ty, rm, hub); piv.add(spin); g.add(piv); wheels.push(spin); if (!r) steer.push(piv);
    }
    let beam = null;
    const setLights = (on, beams) => { M.lamp.color.copy(lin(on ? 0xfff6dc : 0x6f6a5a)); if (beams && !beam && B.headBeam) beam = B.headBeam(g, a + 0.45); if (beam) beam.visible = !!beams; };
    return { group: g, wheels, steer, brake: M.brake, setLights, noseX: a + 0.48, tailX: b - 0.64 };
  }
  B.buildCar = function (s) { return s && s.id === 'cart' ? build(s) : prevBuild(s); };
  B.cartModel = true;      // player.js checks this before it lets anyone into a cart
})();
