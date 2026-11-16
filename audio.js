/* Bloomfield Drift — sound (BD.audio). Everything is synthesised with the Web Audio API; the only file loaded is
   engine_worklet.js (next to this file): the engine's physical model and the tyre squeal model. Adds: an engine per car — a
   physical model run in an AudioWorklet (cylinders firing into intake and exhaust waveguides, a header, a straight pipe, a
   muffler and a tailpipe; MIT, adapted from Antonio-R1's engine-sound-generator), tuned per car in ENG (cylinder count, pipe and
   muffler lengths, pulse sharpness) and driven by the car's rpm and throttle every frame (smoothed; the rev-limiter cut drops the
   charge to zero, a shift lifts it); on top of it pulsed exhaust noise riding on the model's exhaust pulses, turbo whistle and
   blow-off, overrun crackle and pops, shift clunk / downshift blip and reverse-gear whine. Where AudioWorklet is missing or
   engine_worklet.js fails to load (file:// pages, old browsers) the previous synthesised voice plays instead (a PeriodicWave
   exhaust spectrum from the firing order, waveshaper rasp, formants, intake roar), from the same ENG table; it also covers the
   first frames while the worklet module loads. Tyres: one stick-slip squeal voice per tyre plus scrub hiss (worklet 'bd-tyres'),
   driven by each tyre's slip speed, load and surface: silent rolling, setting in just short of the grip limit, a steady screech
   in a held drift that follows the slip, a lower howl and more hiss with a locked wheel, a chirp on a sudden grip loss and on the
   1-2 shift of a hard launch, never on grass, gravel or water (crunch, swish and rumble there); without the worklet a per-axle
   synth squeal stands in. Then wind and road roar, crash and landing impacts, interface chimes (beep, bank, gates, race fanfare,
   golden apples, drift zones, speed traps) and ambience: wind in dry leaves, birds, and on the courthouse square the Apple
   Festival crowd with a small fairground-organ waltz (original tune). The engine chain ends in a soft-knee clipper so full
   throttle at the redline cannot clip. Public: BD.audio = { init(soundOn), update(dt, state), event(name, a, b, c), beep(freq,
   seconds, volume), setMuted(bool), setVolume({ master, engine, music }) (each 0..1, missing keys unchanged; works before init
   too), getVolume(), context, nodes, voice ('worklet' | 'synth' | null), ready (promise: worklet loaded or fallback chosen),
   build(ctx, dest) }. build() makes the whole graph on any BaseAudioContext (the offline tests use it) and returns { update,
   event, beep, setMuted, setVolume, nodes, ready, voice, tyres (the tyre worklet node or null) }. All 78 nodes (+2 worklet nodes)
   are created once in build(): nothing per frame or per event. master scales everything, engine the engine voice; master * music
   is forwarded to BD.radio.setVolume when a radio is present (again whenever either changes, and once when the radio appears).
   Reads BD.game.settings.tod ('dusk' = fewer birds). Creates no DOM, emits no events. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const vol = { master: 0.8, engine: 0.8, music: 0.6 };      // the three volume sliders (game.js persists them)
  // engine_worklet.js sits next to this file; a relative URL is the fallback when the script has no src (inline test pages)
  const WORKLET_URL = (() => { try { const u = document.currentScript && document.currentScript.src; return u ? new URL('engine_worklet.js', u).href : 'engine_worklet.js'; } catch (e) { return 'engine_worklet.js'; } })();

  // engines. Physical model (engine_worklet.js): cyl cylinders; lengths in samples at 44.1 kHz (100 = 0.78 m of pipe): inL
  // intake runner, exL exhaust port, xtL header, pipe straight pipe, muf muffler chambers (longer and more = deeper, quieter
  // muffle), act muffler back-reflection (0..0.6), out tailpipe; ign combustion pulse width as a fraction of the cycle (shorter =
  // sharper); crank crank-phase wobble (std, fraction of a cycle: 0.001 smooth, 0.002 a lumpier idle); W = [idle, mid, redline]
  // levels (the model's own loudness has resonance holes; fitted by tools/engine_check.js so every car idles at -31 dB and reaches
  // its old redline level); mix = [intake, block, outlet] levels; ex pulsed
  // exhaust noise riding on the exhaust pulses (rasp); turbo = whistle/blow-off; burble = stock overrun pops. Drift builds get
  // a straight-through exhaust (two half-length chambers, half the back-reflection), a sharper pulse and more rasp.
  // Synth fallback: banks = firing order written as the bank each cylinder exhausts into (R/L); dl, ga = the L bank's extra path
  // (fraction of a cycle) and strength; half = added half-firing-order rumble; jit = cylinder-to-cylinder spread; L level,
  // f1 exhaust formant Hz, f2 rasp formant Hz (also the rasp noise band), drive = waveshaper pre-gain, rough = combustion AM,
  // intake = intake roar, bright = extra low-pass Hz at full load.
  const I4 = { banks: 'RRRR', dl: 0, ga: 1, half: 0, jit: 0.06, cyl: 4 };
  const ENG = {
    // 2.5 l turbo I4, quiet hatchback exhaust
    mazda3: { ...I4, inL: 90, exL: 70, xtL: 110, pipe: 180, muf: [30, 45, 60, 75], act: 0.2, out: 8, ign: 0.05, crank: 0.0015, W: [0.057, 0.104, 0.217], mix: [0.5, 0.5, 1],
      L: 0.30, f1: 470, f2: 1700, drive: 0.45, rough: 0.10, ex: 0.4, intake: 0.16, turbo: 1, burble: 0, bright: 500 },
    // 4.0 l OHV V6 pickup: lazy pulse, one modest muffler
    ranger: { banks: 'RLRLRL', dl: 0.015, ga: 0.75, half: 0, jit: 0.05, cyl: 6, inL: 110, exL: 90, xtL: 130, pipe: 200, muf: [25, 40, 55], act: 0.15, out: 8, ign: 0.06, crank: 0.002, W: [0.091, 0.188, 0.43], mix: [0.4, 0.5, 1.2],
      L: 0.33, f1: 330, f2: 1350, drive: 0.6, rough: 0.20, ex: 0.5, intake: 0.12, turbo: 0, burble: 0, bright: 300 },
    // 1.8 l turbo I4 sedan, well muffled
    passat: { ...I4, jit: 0.05, inL: 85, exL: 70, xtL: 100, pipe: 190, muf: [35, 50, 65, 80], act: 0.22, out: 8, ign: 0.05, crank: 0.0015, W: [0.052, 0.131, 0.169], mix: [0.45, 0.5, 0.9],
      L: 0.28, f1: 520, f2: 1900, drive: 0.4, rough: 0.08, ex: 0.35, intake: 0.15, turbo: 1.4, burble: 0, bright: 500 },
    // 2.4 l I4, stock
    dart: { ...I4, jit: 0.08, inL: 95, exL: 75, xtL: 105, pipe: 170, muf: [28, 42, 56, 70], act: 0.18, out: 8, ign: 0.045, crank: 0.0015, W: [0.059, 0.1, 0.237], mix: [0.6, 0.5, 1],
      L: 0.28, f1: 600, f2: 2100, drive: 0.55, rough: 0.14, ex: 0.4, intake: 0.24, turbo: 0, burble: 0, bright: 700 },
    // 5.0 l V8: short pipes, two small chambers, loud
    mustang: { banks: 'RLRLLRLR', dl: 0.02, ga: 0.7, half: 0.22, jit: 0.05, cyl: 8, inL: 80, exL: 60, xtL: 120, pipe: 150, muf: [8, 12], act: 0.05, out: 6, ign: 0.04, crank: 0.002, W: [0.106, 0.266, 0.795], mix: [0.5, 0.5, 1.5],
      L: 0.36, f1: 250, f2: 1250, drive: 0.7, rough: 0.26, ex: 0.5, intake: 0.15, turbo: 0, burble: 0.5, bright: 600 },
    // 2.0 l I4 roadster: short runners, intake-forward
    miata: { ...I4, jit: 0.05, inL: 80, exL: 65, xtL: 95, pipe: 140, muf: [18, 26, 34], act: 0.12, out: 6, ign: 0.04, crank: 0.0015, W: [0.062, 0.089, 0.203], mix: [0.9, 0.45, 1],
      L: 0.27, f1: 680, f2: 2400, drive: 0.6, rough: 0.10, ex: 0.5, intake: 0.30, turbo: 0, burble: 0, bright: 1100 },
    // 4.6 l V8 police sedan: long pipes, big muffler, soft pulse
    crownvic: { banks: 'RRLRLLRL', dl: 0.015, ga: 0.8, half: 0.18, jit: 0.05, cyl: 8, inL: 110, exL: 100, xtL: 150, pipe: 260, muf: [45, 60, 80, 100, 120], act: 0.3, out: 12, ign: 0.065, crank: 0.002, W: [0.061, 0.741, 0.727], mix: [0.3, 0.6, 0.8],
      L: 0.30, f1: 230, f2: 1100, drive: 0.5, rough: 0.20, ex: 0.3, intake: 0.10, turbo: 0, burble: 0, bright: 300 },
    // Mercedes-Benz E300 (W213): M274 2.0 l I4, one twin-scroll turbo; refined luxury sedan: smooth, quiet, well muffled, a soft whistle
    e300: { ...I4, jit: 0.04, inL: 90, exL: 70, xtL: 100, pipe: 200, muf: [40, 55, 70, 85], act: 0.25, out: 10, ign: 0.05, crank: 0.001, W: [0.074, 0.143, 0.204], mix: [0.35, 0.5, 0.8],
      L: 0.27, f1: 500, f2: 1800, drive: 0.38, rough: 0.07, ex: 0.3, intake: 0.13, turbo: 0.9, burble: 0, bright: 450 },
  };
  // the model's parameters for a car (engine_worklet.js processorOptions; posted again on a car change)
  function genParams(e, drift) {
    return { cylinders: e.cyl, intakeWaveguideLength: e.inL, exhaustWaveguideLength: e.exL, extractorWaveguideLength: e.xtL,
      intakeOpenReflectionFactor: 0.01, intakeClosedReflectionFactor: 0.95, exhaustOpenReflectionFactor: 0.01, exhaustClosedReflectionFactor: 0.95,
      ignitionTime: e.ign * (drift ? 0.85 : 1), straightPipeWaveguideLength: e.pipe, straightPipeReflectionFactor: 0.01,
      mufflerElementsLength: drift ? [Math.round(e.muf[0] * 0.5), Math.round(e.muf[1] * 0.5)] : e.muf, action: Math.min(0.6, drift ? e.act * 0.5 : e.act),
      outletWaveguideLength: e.out, outletReflectionFactor: 0.01, crank: e.crank * (drift ? 1.5 : 1) };
  }
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
    // ---- engine bus: every engine layer -> engine volume -> rumble high-pass -> soft-knee clipper (x / (1 + x^4)^(1/4), linear
    // below about 0.7, never above 0.97) -> bus. The clipper reads +-2 at its input, so the bus gain carries a factor 0.5.
    const engBus = G(0), engHP = F('highpass', 28, 0.7), clip = ac.createWaveShaper(); nodes++;
    const cc = new Float32Array(2049); for (let i = 0; i < 2049; i++) { const v = (i / 1024 - 1) * 2; cc[i] = v / Math.pow(1 + Math.pow(Math.abs(v), 4), 0.25); }
    clip.curve = cc; clip.oversample = '2x'; engBus.connect(engHP); engHP.connect(clip); clip.connect(bus);

    // ---- engine: osc(cycle freq) -> drive gain (+ combustion AM) -> tanh shaper -> load low-pass -> exhaust formant -> rasp formant -> level
    const engOsc = O('sine', 30), engAm = G(0.5), roughG = G(0), jitG = G(0), shaper = ac.createWaveShaper(); nodes++;
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(3 * (i / 511.5 - 1)) / Math.tanh(3);
    shaper.curve = curve; shaper.oversample = '2x';
    const engG = G(0, engBus), f2 = F('peaking', 1500, 1.2, engG), f1 = F('peaking', 400, 1.4, f2), engLP = F('lowpass', 600, 0.8, f1);
    engOsc.connect(engAm); engAm.connect(shaper); shaper.connect(F('highpass', 12, 0.7, engLP)); brownS.connect(roughG); roughG.connect(engAm.gain); brownS.connect(jitG); jitG.connect(engOsc.frequency);
    // the physical model's three outputs (intake, block, exhaust outlet); the node itself arrives when the module has loaded.
    // Each carries the same pulse train at a different delay, so summed flat they comb-filter each other (6 dB holes at some
    // rpm): the outlet carries the voice, the intake keeps only its roar above 400 Hz, the block only the idle thrum below 60 Hz
    const wIn = G(0), inHP = F('highpass', 400, 0.7, engBus), wBlk = G(0), blkLP = F('lowpass', 60, 0.7, engBus), wOut = G(0, engBus);
    wIn.connect(inHP); wBlk.connect(blkLP);
    // pulsed exhaust noise: band noise multiplied by the exhaust waveform (the model's outlet, or the synth oscillator); overrun crackle
    const exG = G(0, engBus), exMul = G(0, exG), exBP = F('bandpass', 500, 0.7, exMul); whiteS.connect(exBP);
    const exDrv = G(0, exMul.gain), oscDrv = G(1, exMul.gain); engOsc.connect(oscDrv);
    const inG = G(0, engBus), inBP = F('bandpass', 1500, 1.1, inG); whiteS.connect(inBP);
    const popG = G(0, engBus), popBP = F('bandpass', 1100, 0.8, popG); crkA.connect(popBP);
    // turbo whistle (also the reverse-gear whine) and blow-off valve
    const whG = G(0, engBus), whOsc = O('sine', 3000, whG);
    const boG = G(0, engBus), boBP = F('bandpass', 3000, 0.9, boG); whiteS.connect(boBP);
    // ---- tyres: the squeal is the worklet 'bd-tyres' (engine_worklet.js; one stick-slip voice per tyre plus scrub hiss), made when
    // the module loads; until then, or where it cannot load, the old per-axle voices (a warbling tone plus narrow band noise) stand in
    const sqWave = wave([0.15, 0.06, 0.035, 0.018, 0.009], true), sq = [], tyA = [], tyF = [], tyH = [];
    for (let a = 0; a < 2; a++) { const g = G(0, bus), bp = F('bandpass', 900, 9, g); whiteS.connect(bp); sq.push({ g, bp, o: O(sqWave, 900, g) }); }
    // loose ground never squeals: gravel crunch (the rustle loop), grass swish (soft band noise), and the rumble below
    const grvG = G(0, bus), grvBP = F('bandpass', 2000, 0.6, grvG); crkB.connect(grvBP);
    const swG = G(0, bus), swBP = F('bandpass', 1200, 0.7, swG); whiteS.connect(swBP);
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
    let spec = null, E = ENG.dart, drift = false, cyl = 4, drvF = 1, drvR = 1;
    function setCar(s) {
      spec = s; const id = ENG[s.id] ? s.id : 'dart'; E = ENG[id]; drift = !!s.drift; cyl = E.cyl;
      drvF = s.drive === 'RWD' ? 0 : 1; drvR = s.drive === 'FWD' ? 0 : 1;
      engOsc.setPeriodicWave(waves[id] || (waves[id] = engWave(E)));
      f1.frequency.value = E.f1; f2.frequency.value = E.f2 * (drift ? 1.1 : 1); flare = 1;
      if (wk) wk.port.postMessage(genParams(E, drift));      // the model rebuilds its cylinders, pipes and muffler for this car
    }
    // ---- the physical model (engine_worklet.js) loads asynchronously; the synth voice plays until it is ready and stays the
    // fallback where AudioWorklet is missing or the module fails to load (file:// pages, old browsers)
    let wk = null, pRpm = null, pThr = null, useW = false, tw = null;
    const ready = (ac.audioWorklet && typeof AudioWorkletNode === 'function' ? ac.audioWorklet.addModule(WORKLET_URL) : Promise.reject(new Error('no AudioWorklet')))
      .then(() => {
        wk = new AudioWorkletNode(ac, 'bd-engine', { numberOfInputs: 0, numberOfOutputs: 3, outputChannelCount: [1, 1, 1], processorOptions: genParams(E, drift) }); nodes++;
        wk.connect(wIn, 0); wk.connect(wBlk, 1); wk.connect(wOut, 2); wk.connect(exDrv, 2);
        pRpm = wk.parameters.get('rpm'); pThr = wk.parameters.get('throttle'); pRpm.value = rpmNow; pThr.value = 0.3;
        wk.onprocessorerror = () => { useW = false; console.warn('engine model failed; synth engine voice'); };
        useW = true;
        try {
          tw = new AudioWorkletNode(ac, 'bd-tyres', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }); nodes++; tw.connect(bus);
          for (let i = 0; i < 4; i++) { tyA.push(tw.parameters.get('a' + i)); tyF.push(tw.parameters.get('f' + i)); tyH.push(tw.parameters.get('h' + i)); }
          tw.onprocessorerror = () => { tw = null; console.warn('tyre model failed; synth squeal'); };
        } catch (e) { tw = null; console.warn('tyre model unavailable; synth squeal', e); }
        return true;
      })
      .catch((e) => { console.warn('engine model unavailable (' + ((e && e.message) || e) + '); synth engine voice'); return false; });

    // ---- state
    let thrS = 0, boost = 0, prevThr = 0, overrun = 0, lastCut = false, blip = 0, flare = 0, gear = 1, wob = 0, rpmNow = 800;
    let chirp = 0, lastShiftT = 0; const axA = new Float32Array(2), axF = new Float32Array(2);
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
      const rn = clamp((rpm - idle) / (red - idle), 0, 1), ff = rpm / 60 * cyl / 2, d = drift ? 1 : 0, fast = cut || lastCut;
      if (useW) {
        // physical model: rpm and the combustion charge (0.3 at idle .. 1, 0 on the limiter cut) are its inputs; the level law
        // keeps the idle quiet and the redline loud like the synth voice did, and the clipper catches the rest
        const w = E.W, lw = title ? 0 : (rn < 0.5 ? w[0] + (w[1] - w[0]) * 2 * rn : w[1] + (w[2] - w[1]) * (2 * rn - 1)) * (1 + 0.35 * d) * (0.7 + 0.3 * thrS) * (drv ? 1 : 0.6);
        set(pRpm, rpm, drv ? 0.012 : 0.2);
        set(pThr, cut ? 0 : 0.3 + 0.7 * thrS, fast ? 0.003 : 0.03);
        set(wIn.gain, lw * E.mix[0] * (0.4 + 0.6 * thrS), 0.05); set(wBlk.gain, lw * E.mix[1], 0.04); set(wOut.gain, lw * E.mix[2] * (cut ? 0.6 : 1), fast ? 0.004 : 0.03);
        set(exG.gain, (cut ? 0.3 : 1) * lw * E.ex * (1 + 0.6 * d) * (0.5 + 0.5 * thrS), fast ? 0.004 : 0.03); set(exBP.frequency, E.f2 * 0.8 + ff, 0.05);
        set(exDrv.gain, 0.5, 0.03); set(oscDrv.gain, 0, 0.03); set(engG.gain, 0, 0.03); set(inG.gain, 0, 0.03);
      } else {
        const lvl = title ? 0 : E.L * (1 + 0.45 * d) * ((0.35 + 0.65 * thrS) * (0.45 + 0.55 * rn) + 0.22 * (1 - rn) * (1 - rn) * (1 - rn)) * (drv ? 1 : 0.6);
        set(engOsc.frequency, rpm / 120, drv ? 0.012 : 0.2);
        set(jitG.gain, rpm / 120 * (0.022 - 0.014 * rn), 0.1);
        const drive = Math.min(1, E.drive * (1 + 0.7 * d) * (0.5 + 0.5 * thrS));
        set(engAm.gain, drive, 0.04); set(roughG.gain, drive * E.rough * (1.4 - rn), 0.1);
        set(engLP.frequency, 380 + ff * (2 + 3.5 * thrS) + E.bright * thrS, 0.04); set(engLP.Q, 0.7 + 0.9 * thrS, 0.1);
        set(f1.gain, 2 + 2.5 * thrS, 0.08); set(f2.gain, (drift ? 9 : 2.5) * thrS, 0.08);
        set(engG.gain, cut ? lvl * 0.12 : lvl, fast ? 0.004 : 0.03);
        set(exG.gain, (cut ? 0.12 : 1) * lvl * E.ex * (0.5 + 0.5 * thrS), fast ? 0.004 : 0.03); set(exBP.frequency, E.f1 * 1.3 + ff, 0.05);
        set(inG.gain, title ? 0 : (cut ? 0.25 : 1) * 0.5 * E.intake * thrS * (0.15 + rn) * (1 + 0.4 * d) * (drv ? 1 : 0.3), fast ? 0.004 : 0.05); set(inBP.frequency, 700 + rpm * 0.28, 0.05);
        set(exDrv.gain, 0, 0.03); set(oscDrv.gain, 1, 0.03); set(wIn.gain, 0, 0.03); set(wBlk.gain, 0, 0.03); set(wOut.gain, 0, 0.03);
      }
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
      // Squeal only on asphalt (surf 1). slip[] is each tyre's slip speed (m/s); slip / (0.13 * speed) approximates the tyre
      // model's normalised slip (1 = its grip peak: 11 % slip ratio or 8.5 deg), so the squeal sets in just short of the limit
      // (cornering at 0.85 g: faint; at the limit: clear; rolling straight or under traction control: nothing) and grows with slip
      // speed (s / (s + 8): level and pitch, so a held drift screeches steadily and follows the slip angle) and load (sqrt Fz). A
      // wheel turning far slower than the road (handbrake lock) howls a third lower with more hiss. Launch chirp: the driven
      // tyres when the torque comes back after the 1-2 shift with the pedal down. The worklet adds the grip-loss chirp itself.
      // ponytail: slip / (0.13 v) stands in for the tyre model's own rho (needs per-wheel velocities); expose rho from physics if the onset feels off
      const v = drv ? car.speed : 0, air = drv && car.air, sh = drv ? car.shiftT : 0;
      if (lastShiftT > 0 && sh <= 0 && car.gear === 2 && thr > 0.8 && v < 20) chirp = 1;
      lastShiftT = sh; chirp *= Math.exp(-dt / 0.08); if (chirp < 0.01) chirp = 0;
      let gv = 0, gr = 0, wt = 0, gvS = 0, grS = 0; axA[0] = axA[1] = 0;
      for (let i = 0; i < 4; i++) {
        let a = 0, f = 800, h = 0;
        const sf = drv ? car.surf[i] : 1, s = drv && !air ? car.slip[i] : 0;
        if (sf === 1) {
          const ch = chirp * (i < 2 ? drvF : drvR);
          if (s > 0.5) {
            const z = car.Fz ? clamp(car.Fz[i] / (spec.m * fz0), 0, 2.5) : 1, ld = Math.sqrt(Math.max(z, 0.15)), sp = s / (s + 8);
            const on = sstep(0.6, 1.3, s / (0.13 * Math.max(v, 3))) * sstep(0.6, 2.4, s);
            const lk = v > 2 && car.w ? sstep(0.3, 0.9, 1 - Math.abs(car.w[i]) * spec.R / v) : 0;
            a = 0.12 * on * (0.2 + 0.8 * sp) * ld * (1 - 0.3 * lk);
            f = 760 * (1 + 0.55 * sp) * (1 + 0.07 * (z - 1)) * (1 - 0.3 * lk);
            h = 0.075 * on * (0.15 + 0.85 * sp) * ld * (1 + 1.5 * lk);
          }
          if (ch > 0) { a += 0.055 * ch; h += 0.02 * ch; f *= 1 + 0.12 * ch; }
        } else if (drv) { const k = sstep(0.5, 6, s); if (sf === 2) { gv += 0.25; gvS = Math.max(gvS, k); } else if (sf === 0) { gr += 0.25; grS = Math.max(grS, k); } else wt += 0.25; }
        if (tw) { set(tyA[i], a, 0.02); set(tyF[i], f, 0.03); set(tyH[i], h, 0.03); }
        else if (a > axA[i >> 1]) { axA[i >> 1] = a; axF[i >> 1] = f; }
      }
      for (let k = 0; k < 2; k++) {      // synth stand-in (worklet not loaded): one voice per axle, the louder tyre
        const q = clamp(axA[k] / 0.12, 0, 1.3), f = (axF[k] || 800) * (1 + 0.02 * Math.sin(wob * (k ? 8.3 : 6.7)) + 0.014 * (Math.random() - 0.5)), o = sq[k];
        set(o.o.frequency, f, 0.03); set(o.bp.frequency, f * 1.02, 0.03); set(o.g.gain, 0.9 * q, 0.04);
      }
      // loose ground, by the share of tyres on it: gravel crunch, grass swish, a dull rumble (brighter and louder wading)
      const af = air ? 0.15 : 1, asph = drv ? 1 - gv - gr - wt : 1, sv = clamp(v / 22, 0, 1);
      set(grvG.gain, (gv * (0.6 * sv + 0.5 * gvS) + gr * (0.1 * sv + 0.2 * grS)) * af, 0.06); set(grvBP.frequency, gv >= gr ? 2000 : 900, 0.1);
      set(swG.gain, gr * (0.12 * sv + 0.2 * grS) * af, 0.08); set(swBP.frequency, 900 + 25 * v + 500 * grS, 0.1);
      const rk = Math.pow(clamp(v / 35, 0, 1.5), 1.2);
      set(roadLP.frequency, 170 * asph + 420 * gv + 300 * gr + 900 * wt + v * (6 + 6 * gr), 0.1);
      set(roadG.gain, rk * (0.3 * asph + 0.5 * gv + (0.35 + 0.4 * grS) * gr + 1.2 * wt) * af, 0.08);
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
    const beep = (f, len, v) => note(f, ac.currentTime + 0.01, len || 0.2, (v || 0.25) * 0.55, 1);
    let mutedG = false;
    const level = () => set(out.gain, mutedG ? 0 : vol.master, 0.08);
    const setMuted = (m) => { mutedG = !!m; level(); };
    const setVolume = () => { level(); set(engBus.gain, 0.5 * vol.engine / 0.8, 0.05); };      // engine 0.8 (the default) = the synth voice's old balance
    setVolume();
    return { update, event, beep, setMuted, setVolume, ready, get nodes() { return nodes; }, get voice() { return useW ? 'worklet' : 'synth'; }, get tyres() { return tw; } };
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
  // volume contract: values live here so sliders can be applied before the graph exists; master * music goes to the radio
  let radioSeen = null;
  function radioSync() { const r = B.radio; radioSeen = r; if (r && r.setVolume) try { r.setVolume(vol.master * vol.music); } catch (e) { console.warn('radio volume', e); } }
  function setVolume(v) {
    if (v) for (const k in vol) if (v[k] !== undefined && isFinite(+v[k])) vol[k] = clamp(+v[k], 0, 1);
    if (g) g.setVolume();
    radioSync();
  }
  const getVolume = () => ({ master: vol.master, engine: vol.engine, music: vol.music });
  function init(on) {
    if (!ac && on !== false) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { ac = new AC({ latencyHint: 'interactive' }); g = build(ac, ac.destination); } catch (e) { console.warn('audio unavailable', e); ac = g = null; return; }
    }
    if (g && muted !== (on === false)) setMuted(on === false);
    else if (g && !quiet() && ac.state === 'suspended') ac.resume();
  }
  B.audio = {
    init, setMuted, build, setVolume, getVolume,
    update(dt, s) { if (B.radio !== radioSeen) radioSync(); if (g && ac.state === 'running') g.update(dt, s); },
    event(n, a, b, c) { if (g && n !== 'frame' && !muted) g.event(n, a, b, c); },      // cues made while muted would all play at once on unmute
    beep(f, len, vol) { if (g && !muted) g.beep(f, len, vol); },
    get context() { return ac; },
    get nodes() { return g ? g.nodes : 0; },
    get voice() { return g ? g.voice : null; },
    get ready() { return g ? g.ready : null; },
  };
})();
