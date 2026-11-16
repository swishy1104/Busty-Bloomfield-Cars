// Offline check of the tyre sounds:  node tools/tyre_check.js [scenario,...]   (FALLBACK=1 hides engine_worklet.js: the synth
// stand-in plays and every scenario reports FAIL for want of the worklet; WAV=1 also writes clips/tyre_<name>.wav: L/R mix, then
// a second file with the tyre worklet alone). Serves the folder, builds BD.audio on a 4-channel OfflineAudioContext (0-1 the whole
// mix, 2-3 the 'bd-tyres' node alone), runs the real physics (DriftPhysics.step at 240 Hz, flat ground of one surface) and drives
// update() 60x a second. Prints per scenario: whole-mix peak (< 0.9), tyre RMS, and per 0.5 s window the tyre level, the dominant
// squeal frequency (400-2500 Hz) against the commanded pitch of the loudest tyre, the hiss share above 2 kHz and the mean slip.
// Expectations: squeal where the scenario says so, silence (< -60 dB) rolling straight and on loose ground. Exits 1 on a failure.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), SR = 44100;
// name: [car, drift build, seconds, start speed m/s, surface, inputs(t) as JS, expect: 'squeal' | 'silent' (< -60 dB) | 'chirp' (a loud
// window, < -35 dB over all)]
const SC = {
  straight: ['mazda3', 0, 3, 25, 1, '({ gas: 0.25 })', 'silent'],
  accel_tc: ['mazda3', 0, 3, 0, 1, '({ gas: 1, assist: true })', 'chirp'],      // traction control: quiet but for the 1-2 shift chirp
  corner_limit: ['mazda3', 0, 5, 20, 1, '({ gas: 0.45, steer: Math.min(1, t / 3) })', 'squeal'],
  corner_e300: ['e300', 0, 5, 22, 1, '({ gas: 0.5, steer: Math.min(1, t / 3) })', 'squeal'],
  hard_stop: ['mazda3', 0, 3, 28, 1, '({ brake: 1 })', 'squeal'],
  handbrake_lock: ['mazda3', 0, 3, 20, 1, '({ handbrake: 1 })', 'squeal'],
  launch_spin: ['mustang', 0, 5, 0, 1, '({ gas: 1, assist: false })', 'squeal'],
  drift_held: ['mustang', 1, 5, 12, 1, '({ gas: 1, steer: 1, assist: true })', 'squeal'],
  drift_grass: ['mustang', 1, 4, 12, 0, '({ gas: 1, steer: 1, assist: true })', 'silent'],
  drift_gravel: ['mustang', 1, 4, 12, 2, '({ gas: 1, steer: 1, assist: true })', 'silent'],
};
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), xr = re[i + k + l / 2], xi = im[i + k + l / 2], tr = xr * c - xi * s, ti = xr * s + xi * c; re[i + k + l / 2] = re[i + k] - tr; im[i + k + l / 2] = im[i + k] - ti; re[i + k] += tr; im[i + k] += ti; } } }
function wav(file, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } fs.writeFileSync(file, b); }
const srv = http.createServer((q, s) => { const p = q.url.split('?')[0]; if (p === '/') { s.writeHead(200, { 'content-type': 'text/html' }); return s.end('<!doctype html><html><body></body></html>'); } const f = path.join(root, p); if (!fs.existsSync(f) || (process.env.FALLBACK && p.endsWith('engine_worklet.js'))) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': 'text/javascript' }); s.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SC); let fails = 0;
  const b = await chromium.launch(); const page = await b.newPage(); page.on('console', (m) => { if (m.type() !== 'warning' || process.env.V) console.log(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => { fails++; console.log('PAGEERROR', e.message); });
  await page.goto('http://localhost:' + srv.address().port + '/');
  for (const f of ['physics.js', 'audio.js']) await page.addScriptTag({ url: '/' + f });
  if (process.env.WAV) fs.mkdirSync(path.join(root, 'clips'), { recursive: true });
  for (const name of only) {
    const [id, drift, secs, v0, surf, inp, expect] = SC[name];
    const r = await page.evaluate(async ([id, drift, secs, v0, surf, inp]) => {
      const ac = new OfflineAudioContext(4, Math.round(44100 * secs), 44100), mix = ac.createGain(), m = ac.createChannelMerger(4), sp = ac.createChannelSplitter(2);
      m.connect(ac.destination); mix.connect(sp); sp.connect(m, 0, 0); sp.connect(m, 1, 1);
      const g = BD.audio.build(ac, mix); await g.ready;
      if (g.tyres) { const s2 = ac.createChannelSplitter(2); g.tyres.connect(s2); s2.connect(m, 0, 2); s2.connect(m, 1, 3); }
      const spec = DriftPhysics.CARS.find((c) => c.id === id), car = DriftPhysics.makeCar(spec, !!drift); car.x = -900; car.y = 80;
      car.vx = v0; car.speed = v0; for (let i = 0; i < 4; i++) car.w[i] = v0 / car.spec.R;
      const env = { height: () => 0, surface: () => surf }, st = { car, driving: true, mode: 'drive', time: 0, camera: null }, dt = 1 / 60, fin = new Function('t', 'return ' + inp);
      const log = []; let err = null, t = 0;
      const step = () => { try { for (let k = 0; k < 4; k++) { t += dt / 4; DriftPhysics.step(car, Object.assign({ steer: 0, gas: 0, brake: 0, handbrake: 0, assist: true }, fin(t)), dt / 4, env); } g.update(dt, st);
        let ia = 0, am = 0; if (g.tyres) for (let i = 0; i < 4; i++) { const a = g.tyres.parameters.get('a' + i).value; if (a > am) { am = a; ia = i; } }
        log.push([t, car.speed, (car.slip[0] + car.slip[1] + car.slip[2] + car.slip[3]) / 4, Math.max(...car.slip), am, g.tyres ? g.tyres.parameters.get('f' + ia).value : 0, car.gear]); } catch (e) { err = err || e.message; } };
      step(); for (let k = 1; k * dt < secs - 0.03; k++) ac.suspend(k * dt).then(() => { step(); ac.resume(); });
      const buf = await ac.startRendering(), enc = (a) => { const u = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
      return { err, voice: g.voice, tyres: !!g.tyres, nodes: g.nodes, log, ch: [0, 1, 2, 3].map((c) => enc(buf.getChannelData(c))) };
    }, [id, drift, secs, v0, surf, inp]);
    const dec = (s) => new Float32Array(Buffer.from(s, 'base64').buffer.slice(0)), [L, R, TL, TR] = r.ch.map(dec), n = L.length;
    let peak = 0, nan = 0, tpk = 0, tss = 0;
    for (let i = 0; i < n; i++) { if (!isFinite(L[i]) || !isFinite(R[i]) || !isFinite(TL[i])) nan++; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); tpk = Math.max(tpk, Math.abs(TL[i]), Math.abs(TR[i])); tss += TL[i] * TL[i] + TR[i] * TR[i]; }
    const trms = 10 * Math.log10(tss / (2 * n) + 1e-12), win = +(process.env.WIN || 0.5), N = 16384, rows = [];
    for (let w0 = +(process.env.T0 || 0.5); w0 + win <= r.log[r.log.length - 1][0] + 0.02; w0 += win) {
      const i0 = Math.round(w0 * SR), len = Math.round(win * SR); let ss = 0; for (let i = i0; i < i0 + len; i++) ss += TL[i] * TL[i] + TR[i] * TR[i];
      const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < Math.min(N, len); i++) re[i] = ((TL[i0 + i] || 0) + (TR[i0 + i] || 0)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.min(N, len))); fft(re, im);
      const hz = SR / N; let pk = 0, pf = 0, tot = 0, hi = 0;
      for (let i = Math.round(100 / hz); i < 10000 / hz; i++) { const p = re[i] * re[i] + im[i] * im[i]; tot += p; if (i * hz > 2000) hi += p; if (i * hz > 400 && i * hz < 2500 && p > pk) { pk = p; pf = i * hz; } }
      const L_ = r.log.filter((q) => q[0] >= w0 && q[0] < w0 + win), avg = (k) => L_.reduce((s, q) => s + q[k], 0) / (L_.length || 1);
      let wpk = 0; for (let i = i0; i < i0 + len; i++) wpk = Math.max(wpk, Math.abs(TL[i]), Math.abs(TR[i]));
      rows.push({ wpk, t: w0, db: 10 * Math.log10(ss / (2 * len) + 1e-12), f: pf, fc: avg(5), a: avg(4), hiss: hi / (tot || 1), slip: avg(2), smax: avg(3), v: avg(1), gear: L_.length ? L_[L_.length - 1][6] : 0 });
    }
    const loud = rows.filter((q) => q.db > -45), silent = trms < -60;
    const bad = nan || peak >= 0.9 || r.err || !r.tyres || (expect === 'silent' ? !silent : loud.length === 0 || (expect === 'chirp' && trms > -35)); if (bad) fails++;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${name.padEnd(15)} expect ${expect.padEnd(6)} ${r.err ? 'ERR ' + r.err + ' ' : ''}nan=${nan} mixPeak=${peak.toFixed(3)} tyrePeak=${tpk.toFixed(3)} tyreRMS=${trms.toFixed(1)}dB nodes=${r.nodes}`);
    for (const q of rows) console.log(`    t${q.t.toFixed(2)} pk${q.wpk.toFixed(3)} v${q.v.toFixed(1)} g${q.gear} slip ${q.slip.toFixed(1)}/${q.smax.toFixed(1)} a${q.a.toFixed(3)} ${q.db.toFixed(1)}dB f=${q.db > -60 ? q.f.toFixed(0) + 'Hz (cmd ' + q.fc.toFixed(0) + ')' : '-'} hiss>2k ${(100 * q.hiss).toFixed(0)}%`);
    if (process.env.WAV) { wav(path.join(root, 'clips', 'tyre_' + name + '.wav'), L, R); wav(path.join(root, 'clips', 'tyre_' + name + '_alone.wav'), TL, TR); }
  }
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
});
