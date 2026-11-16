// Car model viewer (no world): node tools/carview.js <out.png> [carId]
// No carId: every car from three angles. With a carId: that car large, from six angles. Uses BD.makeEnv for reflections when cars.js provides it.
// Loads car_e300.js (and any other car_*.js listed in index.html after cars.js) the way the game does.
// One pinned view instead of six: CAM="ex,ey,ez,lx,ly,lz,vfov[,upx,upy,upz]" (car frame: +X forward, +Y up, +Z right) with W, H (pixels);
// ALPHA=1 renders the car alone on a transparent background (for overlays on a photo); DUSK=1 calls setLights(true); PRE="js" runs in the page first.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..');
(async () => {
  const one = process.argv[3], cam1 = one && process.env.CAM ? process.env.CAM.split(',').map(Number) : null, alpha = !!process.env.ALPHA, dusk = !!process.env.DUSK;
  const Wd = cam1 ? +(process.env.W || 1280) : 1500, Hd = cam1 ? +(process.env.H || 960) : one ? 1000 : 1260;
  const extra = (fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/src="(car_[a-z0-9_]+\.js)"/g) || []).map((m) => m.slice(5, -1)).concat('car_e300.js').filter((f, i, a) => a.indexOf(f) === i && fs.existsSync(path.join(root, f)));
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await b.newPage({ viewport: { width: Wd, height: Hd } }); page.on('console', (m) => console.log(m.type() + ': ' + m.text())); page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.setContent(`<canvas id="c" width="${Wd}" height="${Hd}"></canvas>`);
  for (const f of ['node_modules/three/build/three.min.js', 'physics.js', 'cars.js', ...extra]) await page.addScriptTag({ content: fs.readFileSync(path.join(root, f), 'utf8') });
  if (process.env.PRE) await page.evaluate(process.env.PRE);
  const info = await page.evaluate(([one, Wd, Hd, cam1, alpha, dusk]) => {
    const T = THREE, r = new T.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true, alpha: alpha });
    r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.setClearColor(0x9fb4c6, alpha ? 0 : 1); r.autoClear = false; r.clear();
    const lin = (h) => new T.Color(h).convertSRGBToLinear(), sc = new T.Scene();
    if (BD.makeEnv) sc.environment = BD.makeEnv(r);
    sc.add(new T.HemisphereLight(lin(0xcfe0ff), lin(0x9a7a48), 0.95)); const sun = new T.DirectionalLight(lin(0xffe2b8), 1.85); sun.position.set(-6, 5, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); sc.add(sun);
    const gr = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshLambertMaterial({ color: lin(0x47474a) })); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; if (!alpha) sc.add(gr);
    const cars = DriftPhysics.CARS.filter((c) => !one || c.id === one), out = [];
    const views = one ? [[6.5, 2.0, 6.0], [-6.5, 2.2, -5.5], [0.01, 1.2, 9], [9, 1.3, 0.01], [-9, 1.4, 0.01], [0.01, 9, 0.5]] : [[7, 2.2, 6.5], [-7.5, 2.4, -5], [0.01, 1.3, 11]];
    if (cam1) views.length = 1;
    const cols = cam1 ? 1 : 3, rows = cam1 ? 1 : one ? 2 : cars.length, tw = Wd / cols, th = Hd / rows, cam = new T.PerspectiveCamera(cam1 ? cam1[6] : one ? 26 : 30, tw / th, 0.05, 100);
    cars.forEach((spec, i) => {
      const t0 = performance.now(), v = BD.buildCar(DriftPhysics.makeCar(spec, false).spec), ms = performance.now() - t0; let tris = 0, meshes = 0;
      v.group.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      out.push(spec.id + ': ' + Math.round(tris) + ' triangles, ' + meshes + ' meshes, ' + ms.toFixed(0) + ' ms');
      if (!cam1) v.steer[0].rotation.y = v.steer[1].rotation.y = 0.3; if (dusk && v.setLights) v.setLights(true); sc.add(v.group);
      views.forEach((p, k) => { if (cam1) { cam.position.set(cam1[0], cam1[1], cam1[2]); if (cam1.length >= 10) cam.up.set(cam1[7], cam1[8], cam1[9]); cam.lookAt(cam1[3], cam1[4], cam1[5]); } else { cam.position.set(p[0], p[1], p[2]); cam.lookAt(0, 0.6, 0); } const x = (k % cols) * tw, y = cam1 ? 0 : one ? (1 - Math.floor(k / cols)) * th : (cars.length - 1 - i) * th; r.setViewport(x, y, tw, th); r.setScissor(x, y, tw, th); r.setScissorTest(true); r.clearDepth(); r.render(sc, cam); });
      sc.remove(v.group);
    });
    return out;
  }, [one, Wd, Hd, cam1, alpha, dusk]);
  console.log(info.join('\n'));
  await page.screenshot({ path: process.argv[2], omitBackground: alpha }); await b.close();
})();
