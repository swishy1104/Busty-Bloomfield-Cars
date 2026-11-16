// Offline audio checks: node tools/audio_test.js  -> renders scripted clips through BD.audio.build on OfflineAudioContext,
// prints level / spectrum numbers, writes WAVs to clips/.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..');
const SR = 44100;
const SC = {   // name: [car, drift, seconds, script(t, car, st, g, dt)]
  idle: ['mazda3', 0, 3, 'car.rpm=car.spec.idle; car.thr=0;'],
  part3000: ['mazda3', 0, 3, 'car.rpm=3000; car.thr=0.4; car.speed=14; car.gear=3;'],
  redline: ['mazda3', 0, 3, 'car.rpm=6200; car.thr=1; car.speed=38; car.gear=3;'],
  i4_2000: ['dart', 0, 2.5, 'car.rpm=2000; car.thr=0.6;'],
  i4_4000: ['dart', 0, 2.5, 'car.rpm=4000; car.thr=0.6;'],
  i4_6000: ['dart', 0, 2.5, 'car.rpm=6000; car.thr=0.6;'],
  v8_3000: ['mustang', 0, 2.5, 'car.rpm=3000; car.thr=0.5;'],
  i4_3000: ['dart', 0, 2.5, 'car.rpm=3000; car.thr=0.5;'],
  v6_3000: ['ranger', 0, 2.5, 'car.rpm=3000; car.thr=0.5;'],
  cv_idle: ['crownvic', 0, 2.5, 'car.rpm=car.spec.idle; car.thr=0;'],
  skid: ['mustang', 0, 3, 'car.rpm=4500; car.thr=0.8; car.speed=14; car.slip=[2,2,9,11]; car.surf=[1,1,1,1];'],
  crash: ['mazda3', 0, 3, 'car.rpm=car.spec.idle; car.thr=0; if (Math.abs(t-1.2)<dt/2) g.event("crash", 18);'],
  fest150: ['dart', 0, 6, 'car.x=150; car.y=0; st.mode="title"; st.driving=false;'],
  ambient: ['dart', 0, 8, 'st.mode="title"; st.driving=false;'],
  festival: ['dart', 0, 3, 'car.x=0; car.y=0; st.mode="title"; st.driving=false;'],
  muted: ['mazda3', 0, 3, 'car.rpm=6200; car.thr=1; car.speed=38; if (t===0) g.setMuted(true);'],
  pops: ['mustang', 1, 3.5, 'car.thr = t<1.2 ? 1 : 0; car.rpm = t<1.2 ? 7000 : Math.max(3500, 7000-(t-1.2)*1500); car.speed=20;'],
  limstock: ['miata', 0, 2, 'car.thr=1; car.rpm=7550; car.cut = (t%0.1)<0.06 ? 0.03 : 0;'],
  limiter: ['miata', 1, 3, 'car.thr=1; car.rpm=7550; car.cut = (t%0.1)<0.06 ? 0.03 : 0;'],
  red_mustang: ['mustang', 1, 2.5, 'car.rpm=7300; car.thr=1;'],
  red_mus_stock: ['mustang', 0, 2.5, 'car.rpm=7300; car.thr=1;'],
  red_crownvic: ['crownvic', 0, 2.5, 'car.rpm=5700; car.thr=1;'],
  red_ranger: ['ranger', 0, 2.5, 'car.rpm=5100; car.thr=1;'],
  red_miata: ['miata', 1, 2.5, 'car.rpm=7400; car.thr=1;'],
  red_passat: ['passat', 0, 2.5, 'car.rpm=6400; car.thr=1;'],
  red_dart: ['dart', 1, 2.5, 'car.rpm=6400; car.thr=1;'],
  nosk: ['mustang', 0, 3, 'car.rpm=4500; car.thr=0.8; car.speed=14;'],
  turbo: ['passat', 0, 3.5, 'car.thr = t<1.8 ? 1 : 0; car.rpm = t<1.8 ? 2500+t*1600 : Math.max(2000, 5380-(t-1.8)*1200); car.speed=20;'],
  gravel: ['dart', 0, 3, 'car.rpm=3500; car.thr=0.6; car.speed=20; car.surf=[2,2,2,2]; car.slip=[1,1,5,5];'],
  highway: ['mazda3', 0, 3, 'car.rpm=3500; car.thr=0.5; car.speed=45; car.gear=6;'],
  events: ['dart', 0, 4.5, 'car.rpm=car.spec.idle; car.thr=0; const E=[[0.3,"shift",2],[0.6,"shift",1],[0.9,"bank",6000],[1.4,"raceFinish",60,true],[2.6,"apple",3,10],[3.0,"zone","x",9000,3],[3.5,"trap","x",62,2],[3.9,"raceGate",1,5]]; for (const e of E) if (Math.abs(t-e[0])<dt/2) g.event(e[1],e[2],e[3],e[4]); if (Math.abs(t-4.1)<dt/2) g.beep(880, 0.5);'],
};
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), xr = re[i + k + len / 2], xi = im[i + k + len / 2], tr = xr * c - xi * s, ti = xr * s + xi * c; re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti; re[i + k] += tr; im[i + k] += ti; } } }
function spectrum(x, off) { const N = 32768, re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = (x[off + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); fft(re, im); const p = new Float64Array(N / 2); for (let i = 0; i < N / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i]; return p; }
function wav(file, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } fs.writeFileSync(file, b); }
(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SC);
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage(); page.on('console', (m) => console.log(m.type() + ': ' + m.text())); page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.setContent('<html><body></body></html>');
  for (const f of ['physics.js', 'audio.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, f), 'utf8') });
  for (const name of only) {
    const [id, drift, secs, script] = SC[name];
    const r = await page.evaluate(async ([id, drift, secs, script]) => {
      const sr = 44100, ac = new OfflineAudioContext(2, Math.round(sr * secs), sr), t0 = performance.now(), g = BD.audio.build(ac, ac.destination), buildMs = performance.now() - t0;
      const car = DriftPhysics.makeCar(DriftPhysics.CARS.find((c) => c.id === id), !!drift); car.x = -900; car.y = 80; car.speed = 0;
      const st = { car, driving: true, mode: 'drive', time: 0, camera: null }, dt = 1 / 60, fn = new Function('t', 'car', 'st', 'g', 'dt', script); let err = null;
      const step = (t) => { try { fn(t, car, st, g, dt); g.update(dt, st); } catch (e) { err = err || e.message; } };
      step(0); for (let k = 1; k * dt < secs - 0.03; k++) { const tt = k * dt; ac.suspend(tt).then(() => { step(tt); ac.resume(); }); }
      const buf = await ac.startRendering(), enc = (a) => { const u = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
      return { err, nodes: g.nodes, buildMs, ff: car.rpm / 60 * ({ mustang: 8, crownvic: 8, ranger: 6 }[id] || 4) / 2, L: enc(buf.getChannelData(0)), R: enc(buf.getChannelData(1)) };
    }, [id, drift, secs, script]);
    const dec = (s) => new Float32Array(Buffer.from(s, 'base64').buffer.slice(0)), L = dec(r.L), R = dec(r.R), n = L.length, a = Math.round(0.8 * SR);
    let peak = 0, nan = 0, ss = 0; const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) { if (!isFinite(L[i]) || !isFinite(R[i])) nan++; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); mono[i] = (L[i] + R[i]) / 2; if (i >= a) ss += mono[i] * mono[i]; }
    const rms = 10 * Math.log10(ss / (n - a) + 1e-12), p = spectrum(mono, a), hz = SR / 32768;
    let pk = 0, pf = 0; for (let i = Math.round(20 / hz); i < 700 / hz; i++) if (p[i] > pk && p[i] >= p[i - 1] && p[i] >= p[i + 1]) { pk = p[i]; pf = i * hz; }
    let below = 0, tot = 0; for (let i = Math.round(15 / hz); i < 4000 / hz; i++) { tot += p[i]; if (i * hz < 0.8 * r.ff) below += p[i]; }
    let cen = 0; for (let i = 1; i < 8000 / hz; i++) cen += p[i] * i * hz; cen /= tot || 1;
    let band = 0; for (let i = Math.round(700 / hz); i < 2500 / hz; i++) band += p[i];
    if (process.env.ENV && process.env.ENV.split(',').includes(name)) { let e = ''; const w = Math.round((+process.env.WIN || 0.025) * SR); for (let i = 0; i + w <= n; i += w) { let q = 0; for (let j = 0; j < w; j++) { const x = process.env.HF ? mono[i + j] - (mono[i + j - 1] || 0) : mono[i + j]; q += x * x; } const db = 10 * Math.log10(q / w + 1e-12); e += db < -60 ? '.' : String.fromCharCode(97 + Math.min(25, Math.round((db + 60) / 2.4))); } console.log('  env25ms(a=-60dB, z=0dB): ' + e); }
    console.log(`${name.padEnd(12)} mid=${(100 * band / tot).toFixed(0)}% ${r.err ? 'ERR ' + r.err : 'ok'} nan=${nan} peak=${peak.toFixed(3)} rms=${rms.toFixed(1)}dB lowPeak=${pf.toFixed(1)}Hz ff=${r.ff.toFixed(1)} below=${(100 * below / tot).toFixed(1)}% centroid=${cen.toFixed(0)}Hz nodes=${r.nodes} build=${r.buildMs.toFixed(0)}ms`);
    wav(path.join(root, 'clips', name + '.wav'), L, R);
  }
  await b.close();
})();
