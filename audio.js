/* Bloomfield Drift — sound (BD.audio). Everything is synthesised with the Web Audio API; nothing is loaded.
   Adds: an engine per car (a PeriodicWave exhaust spectrum computed from each engine's firing order and bank layout, combustion
   jitter, waveshaper rasp, load-dependent low-pass and exhaust formants, pulsed exhaust noise, intake roar, turbo whistle and
   blow-off, overrun crackle and pops, rev-limiter stutter, shift clunk / downshift blip, reverse-gear whine), tyre squeal per
   axle, gravel and grass scrub, wind and road roar, crash and landing impacts, interface chimes (beep, bank, gates, race fanfare,
   golden apples, drift zones, speed traps) and ambience: wind in dry leaves, birds, and on the courthouse square the Apple
   Festival crowd with a small fairground-organ waltz (original tune).
   Public: BD.audio = { init(soundOn), update(dt, state), event(name, a, b, c), beep(freq, seconds, volume), setMuted(bool),
   context, nodes, build(ctx, dest) }. build() makes the whole graph on any BaseAudioContext (the offline tests use it) and
   returns { update, event, beep, setMuted, nodes }. All 63 nodes are created once in build(): nothing per frame or per event.
   Reads BD.game.settings.tod ('dusk' = fewer birds). Creates no DOM, emits no events. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const VOL = 0.8;

  // engines: banks = firing order written as the bank each cylinder exhausts into (R/L); dl, ga = the L bank's extra path
  // (fraction of a cycle) and strength; half = added half-firing-order rumble; jit = cylinder-to-cylinder spread.
  // L level, f1 exhaust formant Hz, f2 rasp formant Hz, drive = waveshaper pre-gain, rough = combustion AM, ex = pulsed exhaust
  // noise, intake = intake roar, turbo = whistle/blow-off, burble = stock overrun burble, bright = extra low-pass Hz at full load.
  const I4 = { banks: 'RRRR', dl: 0, ga: 1, half: 0, jit: 0.06 };
  const ENG = {
    mazda3: { ...I4, L: 0.30, f1: 470, f2: 1700, drive: 0.45, rough: 0.10, ex: 0.55, intake: 0.16, turbo: 1, burble: 0, bright: 500 },
    ranger: { banks: 'RLRLRL', dl: 0.015, ga: 0.75, half: 0, jit: 0.05, L: 0.33, f1: 330, f2: 1350, drive: 0.6, rough: 0.20, ex: 0.7, intake: 0.12, turbo: 0, burble: 0, bright: 300 },
    passat: { ...I4, jit: 0.05, L: 0.28, f1: 520, f2: 1900, drive: 0.4, rough: 0.08, ex: 0.45, intake: 0.15, turbo: 1.4, burble: 0, bright: 500 },
    dart: { ...I4, jit: 0.08, L: 0.28, f1: 600, f2: 2100, drive: 0.55, rough: 0.14, ex: 0.5, intake: 0.24, turbo: 0, burble: 0, bright: 700 },
    mustang: { banks: 'RLRLLRLR', dl: 0.02, ga: 0.7, half: 0.22, jit: 0.05, L: 0.36, f1: 250, f2: 1250, drive: 0.7, rough: 0.26, ex: 0.85, intake: 0.15, turbo: 0, burble: 0.5, bright: 600 },
    miata: { ...I4, jit: 0.05, L: 0.27, f1: 680, f2: 2400, drive: 0.6, rough: 0.10, ex: 0.6, intake: 0.30, turbo: 0, burble: 0, bright: 1100 },
    crownvic: { banks: 'RRLRLLRL', dl: 0.015, ga: 0.8, half: 0.18, jit: 0.05, L: 0.30, f1: 230, f2: 1100, drive: 0.5, rough: 0.20, ex: 0.6, intake: 0.10, turbo: 0, burble: 0, bright: 300 },
  };
  // the organ waltz (3/4, C major): [midi, beats] per note, 16 bars; then chord roots per bar; then 2 bars rest
  const TUNE = [76, 2, 74, 1, 72, 1, 76, 1, 79, 1, 81, 2, 79, 1, 77, 3, 74, 2, 77, 1, 83, 2, 81, 1, 79, 1, 76, 1, 72, 1, 79, 3,
    76, 2, 74, 1, 72, 1, 76, 1, 79, 1, 84, 2, 81, 1, 77, 3, 79, 1, 77, 1, 74, 1, 71, 1, 74, 1, 77, 1, 76, 2, 74, 1, 72, 3];
  const ROOT = [60, 60, 65, 65, 67, 67, 60, 67, 60, 60, 65, 65, 67, 67, 60, 60], BEAT = 0.4, NB = 18 * 3;
  const PENTA = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637, 3136];

  function build(ac, dest) {
    const sr = ac.sampleRate;
    let nodes = 0;
    const G = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); nodes++; return g; };
    const F = (type, f, q, to) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); nodes++; return b; };
    const O = (w, f, to) => { const o = ac.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); o.frequency.value = f; if (to) o.connect(to); o.start(); nodes++; return o; };
    const S = (buf, rate) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(0, Math.random() * buf.duration); nodes++; return s; };
    // harmonic amplitudes -> PeriodicWave; raw = keep the absolute level (no normalisation) so no gain node is needed after it
    const wave = (amps, raw) => { const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1); for (let k = 0; k < amps.length; k++) im[k + 1] = amps[k]; return ac.createPeriodicWave(re, im, { disableNormalization: !!raw }); };
    const buffer = (secs, fill, peak) => { const b = ac.createBuffer(1, Math.round(secs * sr), sr), d = b.getChannelData(0); fill(d, d.length); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); for (let i = 0; i < d.length; i++) d[i] *= (peak || 1) / (m || 1); return b; };
    // AudioParam glide that skips repeats, so per-frame calls do not pile up automation events
    const set = (p, v, tau) => { if (p.$ !== undefined && Math.abs(v - p.$) <= 1e-4 * Math.abs(v) + 1e-6) return; p.$ = v; p.setTargetAtTime(v, ac.currentTime, tau); };
    // one-shot envelope on a gain that starts from wherever it is (no clicks): rise with time constant atk, fall with tau
    const hit = (g, a, t, atk, tau) => { const p = g.gain; p.cancelScheduledValues(t); p.setTargetAtTime(a, t, atk); p.setTargetAtTime(0, t + atk * 4, tau); };

    // ---- shared sources (looping buffers, random start points)
    const white = buffer(2, (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    const brown = buffer(2, (d, n) => { let y = 0; for (let i = 0; i < n; i++) d[i] = y = 0.98 * y + (Math.random() * 2 - 1); const e = d[n - 1] - d[0]; for (let i = 0; i < n; i++) d[i] -= e * i / (n - 1); let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n; for (let i = 0; i < n; i++) d[i] -= m; });
    // sparse decaying clicks of very uneven size: overrun crackle
    const crackle = buffer(3, (d, n) => { for (let e = 0; e < 240; e++) { const p = Math.random() * n | 0, a = Math.pow(Math.random(), 2.2) * (Math.random() < 0.5 ? -1 : 1), L = 6 + Math.random() * 60; for (let j = 0; j < L * 5; j++) d[(p + j) % n] += a * (Math.random() * 2 - 1) * Math.exp(-j / L); } });
    // dense even rustle (dry leaves, gravel): many small bursts of equal-ish size
    const rustle = buffer(3, (d, n) => { for (let e = 0; e < 1500; e++) { const p = Math.random() * n | 0, a = (0.3 + 0.7 * Math.random()) * (Math.random() < 0.5 ? -1 : 1), L = 10 + Math.random() * 110; for (let j = 0; j < L * 4; j++) d[(p + j) % n] += a * (Math.random() * 2 - 1) * Math.exp(-j / L); } });
    // ponytail: a 5 s crowd loop; a longer buffer if the repeat becomes noticeable
    // crowd murmur: 11 talkers, glottal pulse trains through two vowel formants with syllable envelopes, each wrapped around the loop
    const crowd = buffer(5, (d, n) => {
      const VW = [730, 1090, 270, 2290, 530, 1840, 300, 870, 570, 840, 440, 1020, 660, 1720, 490, 1350];
      for (let v = 0; v < 11; v++) {
        const o = Math.random() * n | 0, f0 = 95 + Math.random() * 150, amp = 0.35 + Math.random() * 0.65, quiet = n - 0.35 * sr;
        let ph = 0, y1 = 0, y2 = 0, w1 = 0, w2 = 0, a1 = 0, a2 = 0, b1 = 0, b2 = 0, s0 = 0, len = 0.3 * sr, on = false, f = f0;
        for (let t = 0; t < n; t++) {
          if (t >= s0 + len) {
            s0 = t;
            if (t > quiet || (on && Math.random() < 0.2)) { on = false; len = (0.25 + Math.random() * 0.8) * sr; }
            else {
              on = true; len = (0.08 + Math.random() * 0.17) * sr; f = f0 * (0.85 + Math.random() * 0.3);
              const k = (Math.random() * 8 | 0) * 2, r1 = Math.exp(-Math.PI * 90 / sr), r2 = Math.exp(-Math.PI * 130 / sr);
              a1 = 2 * r1 * Math.cos(2 * Math.PI * VW[k] / sr); a2 = r1 * r1; b1 = 2 * r2 * Math.cos(2 * Math.PI * VW[k + 1] / sr); b2 = r2 * r2;
            }
          }
          const q = (t - s0) / len, e = on ? 4 * q * (1 - q) : 0;
          ph += f / sr; let x = e * 0.04 * (Math.random() * 2 - 1); if (ph >= 1) { ph -= 1; x += e; }
          const y = x + a1 * y1 - a2 * y2; y2 = y1; y1 = y; const w = x + b1 * w1 - b2 * w2; w2 = w1; w1 = w;
          d[(o + t) % n] += amp * (y + 0.6 * w);
        }
      }
      let lp = 0, hp = 0; for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) { lp += 0.35 * (d[i] - lp); hp += 0.012 * (lp - hp); if (k) d[i] = lp - hp; }
    }, 0.45);
    const whiteS = S(white), brownS = S(brown), crkA = S(crackle), crkB = S(rustle, 1), crowdS = S(crowd);

    // ---- master: everything -> compressor -> master gain (mute / fade-in) -> destination
    const out = G(0, dest), comp = ac.createDynamicsCompressor(); nodes++;
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25; comp.connect(out);
    const bus = comp;

    // ---- engine: osc(cycle freq) -> drive gain (+ combustion AM) -> tanh shaper -> load low-pass -> exhaust formant -> rasp formant -> level
    const engOsc = O('sine', 30), engAm = G(0.5), roughG = G(0), jitG = G(0), shaper = ac.createWaveShaper(); nodes++;
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(3 * (i / 511.5 - 1)) / Math.tanh(3);
    shaper.curve = curve; shaper.oversample = '2x';
    const engG = G(0, bus), f2 = F('peaking', 1500, 1.2, engG), f1 = F('peaking', 400, 1.4, f2), engLP = F('lowpass', 600, 0.8, f1);
    engOsc.connect(engAm); engAm.connect(shaper); shaper.connect(F('highpass', 12, 0.7, engLP)); brownS.connect(roughG); roughG.connect(engAm.gain); brownS.connect(jitG); jitG.connect(engOsc.frequency);
    // pulsed exhaust noise: band noise multiplied by the raw exhaust waveform; intake roar; overrun crackle
    const exG = G(0, bus), exMul = G(0, exG), exBP = F('bandpass', 500, 0.7, exMul); whiteS.connect(exBP); engOsc.connect(exMul.gain);
    const inG = G(0, bus), inBP = F('bandpass', 1500, 1.1, inG); whiteS.connect(inBP);
    const popG = G(0, bus), popBP = F('bandpass', 1100, 0.8, popG); crkA.connect(popBP);
    // turbo whistle (also the reverse-gear whine) and blow-off valve
    const whG = G(0, bus), whOsc = O('sine', 3000, whG);
    const boG = G(0, bus), boBP = F('bandpass', 3000, 0.9, boG); whiteS.connect(boBP);
    // ---- tyres: per axle a warbling tone plus narrow band noise; loose-surface crunch from the crackle loop
    const sqWave = wave([0.15, 0.06, 0.035, 0.018, 0.009], true), sq = [];
    for (let a = 0; a < 2; a++) { const g = G(0, bus), bp = F('bandpass', 900, 9, g); whiteS.connect(bp); sq.push({ g, bp, o: O(sqWave, 900, g) }); }
    const grvG = G(0, bus), grvBP = F('bandpass', 2000, 0.6, grvG); crkB.connect(grvBP);
    const roadG = G(0, bus), roadLP = F('lowpass', 200, 0.7, roadG); brownS.connect(roadLP);
    const windG = G(0, bus), windLP = F('lowpass', 400, 0.5, windG); whiteS.connect(windLP);
    const leafG = G(0, bus), leafHP = F('highpass', 2200, 0.5, leafG); crkB.connect(leafHP);
    // ---- impacts (crash, landing, shift clunk, exhaust bangs share these two voices)
    // ponytail: one shared thud and one crunch voice, so a crash cuts a pop still ringing; a 2-voice pool if that is ever heard
    const thG = G(0, bus), thOsc = O('sine', 80, thG);
    const crG = G(0, bus), crF = F('lowpass', 1500, 1.2, crG); whiteS.connect(crF);
    // ---- interface: three round-robin chime voices
    const uiWave = wave([1, 0.22, 0.06, 0.14, 0, 0.05]), uiO = [], uiG = [];
    for (let i = 0; i < 4; i++) { uiG.push(G(0, bus)); uiO.push(O(uiWave, 880, uiG[i])); }
    // ---- ambience: birds; festival bed (crowd + organ melody, oom-pah bass and chord) -> distance low-pass -> gain -> pan
    const birdPan = ac.createStereoPanner(); nodes++; birdPan.connect(bus); const birdG = G(0, birdPan), birdOsc = O('sine', 3000, birdG);
    const festPan = ac.createStereoPanner(); nodes++; festPan.connect(bus); const festG = G(0, festPan), festLP = F('lowpass', 3000, 0.6, festG);
    crowdS.connect(festLP);
    const melG = G(0, festLP), melOsc = O(wave([1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05]), 523, melG);
    const bassG = G(0, festLP), bassOsc = O(wave([1, 0.5, 0.3, 0.12, 0.06]), 130, bassG);
    // a just major triad from one oscillator: harmonics 4:5:6 (+ octaves) over a fundamental two octaves below the root
    const chAmps = new Array(24).fill(0); [[4, 1], [5, 0.9], [6, 0.9], [8, 0.35], [10, 0.25], [12, 0.25], [16, 0.08], [20, 0.06], [24, 0.06]].forEach(([k, a]) => { chAmps[k - 1] = a; });
    const chG = G(0, festLP), chOsc = O(wave(chAmps), 65, chG);
    // tune -> per-beat onset table
    const MEL = new Float32Array(NB), LEN = new Float32Array(NB);
    for (let i = 0, b = 0; i < TUNE.length; i += 2) { MEL[b] = mtof(TUNE[i]); LEN[b] = TUNE[i + 1]; b += TUNE[i + 1]; }

    // ---- per-car engine set-up
    const waves = {};
    function engWave(e) {
      const n = e.banks.length, N = 160, re = new Float32Array(N + 1), im = new Float32Array(N + 1), kc = n * 1.2;
      for (let k = 1; k <= N; k++) {
        const P = 1 / (1 + Math.pow(k / kc, 1.6));
        for (let i = 0; i < n; i++) {
          const L = e.banks[i] === 'L', th = 2 * Math.PI * k * (i / n + (L ? e.dl : 0)), a = P * (L ? e.ga : 1) * (1 + e.jit * Math.sin(i * 2.4 + 0.7));
          re[k] += a * Math.cos(th); im[k] += a * Math.sin(th);
        }
        if (k * 2 === n) im[k] += e.half * n * P;
      }
      return ac.createPeriodicWave(re, im);
    }
    let spec = null, E = ENG.dart, drift = false, cyl = 4;
    function setCar(s) {
      spec = s; const id = ENG[s.id] ? s.id : 'dart'; E = ENG[id]; drift = !!s.drift; cyl = E.banks.length;
      engOsc.setPeriodicWave(waves[id] || (waves[id] = engWave(E)));
      f1.frequency.value = E.f1; f2.frequency.value = E.f2 * (drift ? 1.1 : 1); flare = 1;
    }

    // ---- state
    let thrS = 0, boost = 0, prevThr = 0, overrun = 0, lastCut = false, blip = 0, flare = 0, gear = 1, wob = 0, rpmNow = 800;
    let gust = 0.4, gustTo = 0.4, gustT = 0, birdT = 2.5, tuneT = 0, beat = 0, ui = 0;
    const fz0 = 9.81 / 4;

    function bang(a, t) { crF.frequency.cancelScheduledValues(t); crF.frequency.setValueAtTime(1200 + Math.random() * 1800, t); hit(crG, a, t, 0.001, 0.02 + Math.random() * 0.03); if (a > 0.5) thud(120, 50, 0.4 * a, t, 0.03); }
    function thud(f0, f1_, a, t, tau) { const p = thOsc.frequency; p.cancelScheduledValues(t); p.setValueAtTime(f0, t); p.exponentialRampToValueAtTime(f1_, t + tau * 3); hit(thG, a, t, 0.002, tau); }
    function note(f, t, len, vol, own) {
      const k = own ? 3 : (ui = (ui + 1) % 3), g = uiG[k].gain;
      g.cancelScheduledValues(t - 0.008); g.setTargetAtTime(0, t - 0.008, 0.002);
      uiO[k].frequency.cancelScheduledValues(t); uiO[k].frequency.setValueAtTime(f, t);
      g.setTargetAtTime(vol, t, 0.003); g.setTargetAtTime(0, t + 0.012, len / 4);
    }
    function arp(n, from, t, step, len, vol) { for (let i = 0; i < n; i++) note(PENTA[clamp(from + i, 0, 8)], t + i * step, i === n - 1 ? len * 2 : len, vol); }
    function env(p, a, t, len) { p.setTargetAtTime(a, t, 0.006); p.setTargetAtTime(a * 0.6, t + 0.04, 0.12); p.setTargetAtTime(0, t + len - 0.05, 0.012); }
    function playBeat(i, t) {
      const bar = (i / 3) | 0, b = i % 3;
      if (bar >= 16) return;
      if (MEL[i]) { melOsc.frequency.setValueAtTime(MEL[i], t); env(melG.gain, 0.09, t, LEN[i] * BEAT); }
      const r = ROOT[bar];
      if (b === 0) { bassOsc.frequency.setValueAtTime(mtof(r - (bar & 1 ? 17 : 12)), t); env(bassG.gain, 0.13, t, BEAT * 0.85); }
      else { chOsc.frequency.setValueAtTime(mtof(r) / 4, t); env(chG.gain, 0.055, t, BEAT * 0.55); }
    }
    // a bird phrase from a random direction; returns its length in seconds
    function birds(t0) {
      const f = birdOsc.frequency, g = birdG.gain, lv = 0.008 + Math.random() * 0.02, kind = Math.random();
      birdPan.pan.setValueAtTime(Math.random() * 1.6 - 0.8, t0);
      let t = t0;
      if (kind < 0.4) {          // slurred down-whistles, "cheer cheer cheer"
        for (let i = 2 + (Math.random() * 4 | 0); i > 0; i--) { f.setValueAtTime(3700, t); f.exponentialRampToValueAtTime(2000, t + 0.17); g.setValueAtTime(0, t); g.linearRampToValueAtTime(lv, t + 0.025); g.linearRampToValueAtTime(0, t + 0.18); t += 0.27; }
      } else if (kind < 0.7) {   // two clear notes, high then lower, sometimes twice
        for (let i = Math.random() < 0.5 ? 2 : 4, k = 0; k < i; k++) { const fr = k % 2 ? 3350 : 3950; f.setValueAtTime(fr, t); f.linearRampToValueAtTime(fr * 0.97, t + 0.28); g.setValueAtTime(0, t); g.linearRampToValueAtTime(lv, t + 0.04); g.linearRampToValueAtTime(0, t + 0.3); t += 0.38; }
      } else {                   // a quick trill
        for (let i = 7 + (Math.random() * 8 | 0); i > 0; i--) { f.setValueAtTime(4900, t); f.exponentialRampToValueAtTime(4100, t + 0.04); g.setValueAtTime(0, t); g.linearRampToValueAtTime(lv * 0.8, t + 0.008); g.linearRampToValueAtTime(0, t + 0.045); t += 0.058; }
      }
      return t - t0;
    }

    function update(dt, st) {
      const car = st && st.car; if (!car || !car.spec) return;
      const t = ac.currentTime, title = st.mode === 'title', drv = !!st.driving && !title;
      dt = clamp(dt || 0, 0, 0.1); wob += dt;
      if (car.spec !== spec) setCar(car.spec);
      // ---------------- engine
      const idle = spec.idle || 800, red = spec.redline || 6500;
      flare = Math.max(0, flare - dt * 1.5);
      const rpm = rpmNow = (drv ? car.rpm : idle) + 0.9 * idle * flare * flare;
      let thr = drv ? car.thr : 0;
      const cut = drv && car.cut > 0, shifting = drv && car.shiftT > 0;
      if (shifting) thr = 0;
      if (blip > 0) { blip -= dt; thr = Math.max(thr, 0.75); }
      thr = Math.max(thr, flare * 0.6);
      thrS += (thr - thrS) * Math.min(1, dt / 0.05);
      const rn = clamp((rpm - idle) / (red - idle), 0, 1), ff = rpm / 60 * cyl / 2, d = drift ? 1 : 0;
      const lvl = title ? 0 : E.L * (1 + 0.45 * d) * ((0.35 + 0.65 * thrS) * (0.45 + 0.55 * rn) + 0.22 * (1 - rn) * (1 - rn) * (1 - rn)) * (drv ? 1 : 0.6);
      set(engOsc.frequency, rpm / 120, drv ? 0.012 : 0.2);
      set(jitG.gain, rpm / 120 * (0.022 - 0.014 * rn), 0.1);
      const drive = Math.min(1, E.drive * (1 + 0.7 * d) * (0.5 + 0.5 * thrS));
      set(engAm.gain, drive, 0.04); set(roughG.gain, drive * E.rough * (1.4 - rn), 0.1);
      set(engLP.frequency, 380 + ff * (2 + 3.5 * thrS) + E.bright * thrS, 0.04); set(engLP.Q, 0.7 + 0.9 * thrS, 0.1);
      set(f1.gain, 2 + 2.5 * thrS, 0.08); set(f2.gain, (drift ? 9 : 2.5) * thrS, 0.08);
      set(engG.gain, cut ? lvl * 0.12 : lvl, cut || lastCut ? 0.004 : 0.03);
      set(exG.gain, (cut ? 0.12 : 1) * lvl * E.ex * (0.5 + 0.5 * thrS), cut || lastCut ? 0.004 : 0.03); set(exBP.frequency, E.f1 * 1.3 + ff, 0.05);
      set(inG.gain, title ? 0 : (cut ? 0.25 : 1) * 0.5 * E.intake * thrS * (0.15 + rn) * (1 + 0.4 * d) * (drv ? 1 : 0.3), cut || lastCut ? 0.004 : 0.05); set(inBP.frequency, 700 + rpm * 0.28, 0.05);
      // turbo: boost builds with rpm under load, dumps through the blow-off valve when the throttle snaps shut
      const bt = E.turbo && drv ? clamp((rpm - 1800) / 2600, 0, 1) * thr : 0;
      boost += (bt - boost) * Math.min(1, dt / (bt > boost ? 0.8 : 0.25));
      if (E.turbo && prevThr > 0.5 && thr < 0.2 && boost > 0.3) {
        boBP.frequency.cancelScheduledValues(t); boBP.frequency.setValueAtTime(4200, t); boBP.frequency.setTargetAtTime(1500, t, 0.18);
        hit(boG, 0.5 * boost * E.turbo, t, 0.006, 0.14); boost *= 0.3;
      }
      const rev = drv && car.gear < 0 ? clamp(Math.abs(car.u) / 5, 0, 1) : 0;
      set(whOsc.frequency, rev > 0 ? 250 + Math.abs(car.u) * 150 : 2600 + 5200 * boost, 0.05);
      set(whG.gain, rev > 0 ? 0.035 * rev : E.turbo * 0.02 * boost * boost, 0.05);
      // overrun: crackle and pops after a lift at high rpm (drift builds, a little burble on the V8s), bangs on the limiter
      if (prevThr > 0.45 && thr < 0.15 && rpm > 0.5 * red && (drift || E.burble)) overrun = drift ? 1.5 : 0.8;
      if (thr > 0.2 || rpm < 0.3 * red || !drv) overrun = 0; else overrun = Math.max(0, overrun - dt);
      const ov = overrun > 0 ? (drift ? 1 : E.burble) * Math.min(1, overrun * 2) : 0;
      set(popG.gain, ov * (0.5 + 0.7 * Math.random()), 0.02);
      if (ov > 0 && Math.random() < dt * (drift ? 6 : 1.5) * ov) bang((0.25 + 0.75 * Math.random()) * ov, t);
      if (cut && !lastCut && drift && Math.random() < 0.5) bang(0.3 + 0.4 * Math.random(), t);
      lastCut = cut; prevThr = thr;

      // ---------------- tyres and road
      let sF = 0, sR = 0, loose = 0, nGv = 0, nGr = 0, nWt = 0;
      if (drv) for (let i = 0; i < 4; i++) {
        const sf = car.surf[i]; if (sf === 2) nGv++; else if (sf === 0) nGr++; else if (sf === 3) nWt++;
        if (car.air) continue;
        const sl = car.slip[i] * (car.Fz && car.Fz[i] > 0 ? Math.sqrt(clamp(car.Fz[i] / (spec.m * fz0), 0, 2)) : 1);
        if (sf === 1) { if (i < 2) sF = Math.max(sF, sl); else sR = Math.max(sR, sl); } else if (sf !== 3) loose = Math.max(loose, sl);
      }
      for (let a = 0; a < 2; a++) {
        const s = a ? sR : sF, q = sstep(1.5, 10, s), v = sq[a];
        const f = (a ? 960 : 820) * (1 + 0.03 * clamp(s - 3, 0, 12)) * (1 + 0.02 * Math.sin(wob * (a ? 8.3 : 6.7)) + 0.014 * (Math.random() - 0.5));
        set(v.o.frequency, f, 0.03); set(v.bp.frequency, f * 1.02, 0.03); set(v.g.gain, 0.9 * q, 0.04);
      }
      const v = drv ? car.speed : 0, gv = nGv >= 2, gr = !gv && nGr >= 2, lq = sstep(1.5, 9, loose), air = drv && car.air ? 0.15 : 1;
      
      set(grvBP.frequency, gv ? 2000 : 900, 0.1);
      set(grvG.gain, ((gv ? 0.6 : gr ? 0.1 : 0) * clamp(v / 22, 0, 1) + (gv ? 0.5 : gr ? 0.2 : 0) * lq) * air, 0.06);
      const rk = Math.pow(clamp(v / 35, 0, 1.5), 1.2);
      const wt = nWt >= 2;   // wading: a brighter, louder slosh
      set(roadLP.frequency, (wt ? 900 : gv ? 420 : gr ? 300 : 170) + v * (gr ? 12 : 6), 0.1);
      set(roadG.gain, rk * (wt ? 1.2 : gv ? 0.5 : gr ? 0.35 + 0.4 * lq : 0.3) * air, 0.08);
      // ---------------- wind (speed + ambient gusts), leaves, birds
      if ((gustT -= dt) <= 0) { gustT = 1.5 + Math.random() * 5; gustTo = Math.pow(Math.random(), 1.5); }
      gust += (gustTo - gust) * Math.min(1, dt / 1.2);
      set(windLP.frequency, 250 + v * 18 + gust * 350, 0.2);
      set(windG.gain, 0.45 * (v / 50) * (v / 50) + 0.05 + 0.12 * gust, 0.15);
      set(leafG.gain, 0.04 + 0.1 * gust * gust, 0.3); set(crkB.playbackRate, Math.max(0.7 + 0.6 * gust, gv ? 0.6 + clamp(v / 12, 0, 1.6) : 0), 0.15);
      const gm = B.game, dusk = !!(gm && gm.settings && gm.settings.tod === 'dusk');
      if ((birdT -= dt) <= 0) birdT = birds(t + 0.05) + (dusk ? 14 : 3) + Math.random() * (dusk ? 30 : 9);
      // ---------------- festival on the courthouse square: fades in from 220 m to 60 m, panned toward the square
      const near = 1 - sstep(60, 220, Math.hypot(car.x, car.y)), cam = st.camera;
      set(festG.gain, 0.6 * near * near, 0.3); set(festLP.frequency, 1200 + 5000 * near, 0.3);
      let pan = 0;
      if (cam && cam.matrixWorld) { const e = cam.matrixWorld.elements, px = cam.position.x, pz = cam.position.z, dl = Math.hypot(px, pz) || 1; pan = clamp(-(e[0] * px + e[2] * pz) / dl, -1, 1) * 0.7 * clamp(dl / 70, 0, 1); }
      set(festPan.pan, pan, 0.2);
      if (tuneT < t - 1) tuneT = t + 0.1;
      while (tuneT < t + 0.25) { if (near > 0) playBeat(beat, tuneT); beat = (beat + 1) % NB; tuneT += BEAT; }
    }

    function event(n, a, b, c) {
      if (n === 'frame') return;
      const t = ac.currentTime + 0.01;
      switch (n) {
        case 'crash': { const k = clamp(a / 20, 0.12, 1); crF.frequency.cancelScheduledValues(t); crF.frequency.setValueAtTime(700 + 2600 * k, t); crF.frequency.setTargetAtTime(400, t + 0.02, 0.15);
          hit(crG, 0.55 * k, t, 0.0015, 0.05 + 0.12 * k); if (k > 0.4) hit(crG, 0.3 * k, t + 0.07 + 0.05 * Math.random(), 0.002, 0.08); thud(130, 38, 0.75 * k, t, 0.07 + 0.1 * k); break; }
        case 'land': { const k = clamp(a / 8, 0.15, 1); crF.frequency.cancelScheduledValues(t); crF.frequency.setValueAtTime(380, t); hit(crG, 0.18 * k, t, 0.003, 0.05); thud(85, 36, 0.6 * k, t, 0.09); break; }
        case 'shift': { const up = a > gear; gear = a; thud(up ? 75 : 95, 45, up ? 0.12 : 0.08, t, 0.035); crF.frequency.cancelScheduledValues(t); crF.frequency.setValueAtTime(2400, t); hit(crG, 0.04, t, 0.001, 0.012);
          if (!up && a > 0) blip = 0.14; else if (up && drift && spec && rpmNow > 0.55 * spec.redline) bang(0.6, t + 0.05); break; }
        case 'bank': { const k = a > 12000 ? 5 : a > 5000 ? 4 : a > 1800 ? 3 : a > 400 ? 2 : 1; arp(k + 1, k > 3 ? 2 : 0, t, 0.075, 0.3, 0.08 + 0.015 * k); break; }
        case 'raceGate': note(2349, t, 0.05, 0.07); break;
        case 'raceFinish': if (b) { arp(4, 0, t, 0.1, 0.25, 0.14); note(PENTA[2], t + 0.45, 1.6, 0.11); note(PENTA[3], t + 0.45, 1.6, 0.11); note(PENTA[5], t + 0.45, 1.8, 0.13); }
          else { note(784, t, 0.25, 0.12); note(1047, t + 0.12, 0.25, 0.12); note(1319, t + 0.24, 0.3, 0.12); note(1047, t + 0.4, 1, 0.09); note(1319, t + 0.4, 1, 0.09); note(1568, t + 0.4, 1.1, 0.1); } break;
        case 'apple': if (a >= b) arp(6, 0, t, 0.07, 0.3, 0.11); else { note(1319, t, 0.25, 0.1); note(1976, t + 0.07, 0.45, 0.1); } break;
        case 'zone': arp(2 + (c | 0), c | 0, t, 0.09, 0.3, 0.1 + 0.015 * (c | 0)); break;
        case 'trap': note(2637, t, 0.06, 0.07); note(2637, t + 0.08, 0.06, 0.07); arp(1 + (c | 0), 1 + (c | 0), t + 0.2, 0.08, 0.3, 0.1); break;
        case 'raceQuit': note(784, t, 0.2, 0.08); note(523, t + 0.12, 0.4, 0.08); break;
        case 'car': gear = 1; flare = 1; break; case 'drive': flare = 1; break;
      }
    }
    const beep = (f, len, vol) => note(f, ac.currentTime + 0.01, len || 0.2, (vol || 0.25) * 0.55, 1);
    const setMuted = (m) => set(out.gain, m ? 0 : VOL, 0.08);
    setMuted(false);
    return { update, event, beep, setMuted, nodes };
  }

  // ---- the live context, created on the first user gesture with sound on; faded out and suspended while muted (saves CPU) and
  // while the tab is hidden (no frames reach update() then, so the last engine / squeal / wind levels would drone on)
  let ac = null, g = null, muted = false, sleep = 0;
  const quiet = () => muted || document.hidden;
  function apply() {
    if (!g) return;
    clearTimeout(sleep);
    if (quiet()) sleep = setTimeout(() => { if (quiet() && ac.state === 'running') ac.suspend(); }, 500);
    else if (ac.state !== 'running') ac.resume();
    g.setMuted(quiet());
  }
  function setMuted(m) { muted = !!m; apply(); }
  document.addEventListener('visibilitychange', apply);
  function init(on) {
    if (!ac && on !== false) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { ac = new AC({ latencyHint: 'interactive' }); g = build(ac, ac.destination); } catch (e) { console.warn('audio unavailable', e); ac = g = null; return; }
    }
    if (g && muted !== (on === false)) setMuted(on === false);
    else if (g && !quiet() && ac.state === 'suspended') ac.resume();
  }
  B.audio = {
    init, setMuted, build,
    update(dt, s) { if (g && ac.state === 'running') g.update(dt, s); },
    event(n, a, b, c) { if (g && n !== 'frame' && !muted) g.event(n, a, b, c); },      // cues made while muted would all play at once on unmute
    beep(f, len, vol) { if (g && !muted) g.beep(f, len, vol); },
    get context() { return ac; },
    get nodes() { return g ? g.nodes : 0; },
  };
})();
