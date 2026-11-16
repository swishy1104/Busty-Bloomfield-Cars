/*
 * Bloomfield Drift — engine voice: the AudioWorkletProcessor 'bd-engine', a physical model of a four-stroke engine
 * (cylinders firing into intake / exhaust waveguides, a header, a straight pipe, a parallel-element muffler and a tailpipe),
 * adapted from engine-sound-generator by Antonio-R1 (https://github.com/Antonio-R1/engine-sound-generator), after
 * Baldan, Lachambre, Delle Monache, Boussard (2015), "Physically informed car engine sound synthesis for virtual and
 * augmented environments".
 * The same module also registers 'bd-tyres', the tyre squeal and scrub model (Bloomfield Drift's own code, not part of the
 * licensed work; described above its class at the end of this file).
 *
 * Copyright (c) 2021-2022 Antonio-R1
 * License: https://github.com/Antonio-R1/engine-sound-generator/blob/main/LICENSE | MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
 * modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Changes for Bloomfield Drift (audio.js loads this file with ac.audioWorklet.addModule): trimmed to the engine processor;
 * the filters use the context's sampleRate and the waveguide lengths (tuned in samples at 44.1 kHz) are scaled to it; the
 * 'throttle' parameter, unused upstream, is the combustion charge (scales the ignition pulse and the intake air noise:
 * audio.js sends about 0.3 at idle, 1 at full throttle and 0 during the rev-limiter cut); the cylinders fire evenly with a
 * slow wobble of the crank phase sized by 'crank' and a fixed +-6% spread in pulse strength (upstream shifted every cylinder
 * by about an eighth of a cycle, which doubled up the pulses of a V8); the wave returning from the straight pipe is split between the runners (upstream fed all of it to every
 * runner, so a V8 with a reflective muffler ran away) and the sums are normalised to four cylinders; the pumping swing follows
 * the charge; the delay lines are inlined. Nothing is allocated per sample.
 * Outputs (mono each): 0 intake, 1 engine block (cylinder pressure, low-passed at 125 Hz), 2 exhaust outlet.
 * AudioParams (a-rate): rpm, throttle 0..1.
 * processorOptions, and the same object again through port.postMessage() to rebuild for another car:
 *   cylinders, intakeWaveguideLength, exhaustWaveguideLength, extractorWaveguideLength (samples at 44.1 kHz; 100 = 0.78 m),
 *   intakeOpenReflectionFactor, intakeClosedReflectionFactor, exhaustOpenReflectionFactor, exhaustClosedReflectionFactor,
 *   ignitionTime (pulse width, fraction of a cycle), straightPipeWaveguideLength, straightPipeReflectionFactor,
 *   mufflerElementsLength [samples...], action (muffler back-reflection), outletWaveguideLength, outletReflectionFactor,
 *   crank (crank phase wobble, standard deviation as a fraction of a cycle; 0.001 smooth .. 0.003 lumpy idle).
 */
'use strict';
const K = sampleRate / 44100;
const len = (n) => Math.max(1, Math.round(n * K));

class Lowpass {
  constructor(f) { const w = 2 * Math.PI * f / sampleRate; this.a = w / (w + 1); this.y = 0; }
  run(x) { return (this.y += this.a * (x - this.y)); }
}

// two delay lines of L samples: up carries waves left -> right, lo right -> left; rL / rR reflect at the ends
class Waveguide {
  constructor(L, rL, rR) { this.L = L; this.up = new Float32Array(L); this.lo = new Float32Array(L); this.iu = 0; this.il = 0; this.rL = rL; this.rR = rR; this.outL = 0; this.outR = 0; }
  add(vL, vR) {
    const up = this.up, lo = this.lo, l = lo[this.il], u = up[this.iu];
    this.outL = l * (1 - this.rL); this.outR = u * (1 - this.rR);
    up[this.iu] = vL + l * this.rL; if (--this.iu < 0) this.iu = this.L - 1;
    lo[this.il] = vR + u * this.rR; if (++this.il >= this.L) this.il = 0;
  }
}

class Cylinder {
  constructor(p, index) {
    this.kc = 1 + 0.06 * Math.sin(2.4 * index + 0.7);      // no two cylinders pull exactly alike
    this.cyl = new Waveguide(len(10), 0.75, 0.75);
    this.intake = new Waveguide(len(p.intakeWaveguideLength), 0.01, p.intakeOpenReflectionFactor);
    this.exhaust = new Waveguide(len(p.exhaustWaveguideLength), p.exhaustClosedReflectionFactor, 0.01);
    this.extractor = new Waveguide(len(p.extractorWaveguideLength), 0.01, 0.01);
    this.iO = p.intakeOpenReflectionFactor; this.iC = p.intakeClosedReflectionFactor;
    this.eO = p.exhaustOpenReflectionFactor; this.eC = p.exhaustClosedReflectionFactor;
    this.ign = p.ignitionTime;
  }
  // x = this cylinder's position in the four-stroke cycle [0,1): intake valve open in the first quarter, exhaust in the
  // last, the charge fires at the top; noise = intake air noise, pipeL = what comes back from the straight pipe
  update(noise, pipeL, x, charge) {
    const s = Math.sin(4 * Math.PI * x), iv = x < 0.25 ? s : 0, ev = x > 0.75 ? -s : 0;
    const ign = x < 0.5 * this.ign ? Math.sin(2 * Math.PI * x / this.ign) : 0;
    const ri = this.iO * iv + this.iC * (1 - iv), re = this.eO * ev + this.eC * (1 - ev);
    this.intake.rR = ri; this.cyl.rL = ri; this.exhaust.rL = re; this.cyl.rR = re;
    // charge scales the pumping swing too: off the throttle the cylinder barely fills, so the blow-down pulse is weak
    const amp = (Math.cos(4 * Math.PI * x) * 1.5 * (0.35 + 0.65 * charge) + ign * 6 * charge) * this.kc;
    const exR = this.exhaust.outR, xtL = this.extractor.outL, cylL = this.cyl.outL, cylR = this.cyl.outR, inR = this.intake.outR;
    this.extractor.add(exR, pipeL);
    this.exhaust.add(cylR, xtL);
    this.cyl.add(amp + inR * (1 - ri), xtL * (1 - re));
    this.intake.add(noise * iv, cylL * (1 - ri));
  }
}

// parallel chambers of different lengths: their outputs cancel each other's high frequencies
class Muffler {
  constructor(lengths, action) { this.el = []; for (let i = 0; i < lengths.length; i++) this.el.push(new Waveguide(len(lengths[i]), 0, action)); this.k = 1 / lengths.length; this.outL = 0; this.outR = 0; }
  update(inp, outlet) {
    inp *= this.k; outlet *= this.k; let l = 0, r = 0;
    for (let i = 0; i < this.el.length; i++) { const e = this.el[i]; l += e.outL; r += e.outR; e.add(inp, outlet); }
    this.outL = l; this.outR = r;
  }
}

class Engine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'rpm', defaultValue: 0, minValue: 0, maxValue: 20000, automationRate: 'a-rate' }];
  }
  constructor(o) {
    super();
    this.rev = 0; this.lpNoise = new Lowpass(11000); this.lpCrank = new Lowpass(75); this.lpBlock = new Lowpass(125);
    this.set(o.processorOptions || {});
    this.port.onmessage = (e) => { this.set(e.data); };
  }
  set(p) {
    const n = (p.cylinders | 0) || 4;
    this.n = n; this.cyl = []; for (let i = 0; i < n; i++) this.cyl.push(new Cylinder(p, i));
    this.pipe = new Waveguide(len(p.straightPipeWaveguideLength), p.straightPipeReflectionFactor, p.straightPipeReflectionFactor);
    this.muf = new Muffler(p.mufflerElementsLength, p.action);
    this.outlet = new Waveguide(len(p.outletWaveguideLength), p.outletReflectionFactor, p.outletReflectionFactor);
    // the crank low-pass of uniform noise has standard deviation sqrt(a / (12 (2 - a))): scale so that crank is the std
    const a = this.lpCrank.a; this.jitK = (p.crank === undefined ? 0.0015 : p.crank) * Math.sqrt(12 * (2 - a) / a);
    // the wave coming back from the pipe splits between the n runners (upstream gave every runner the whole of it, so the
    // loop gain grew with the cylinder count and a V8 with a reflective muffler ran away); levels are normalised to 4 cylinders
    this.kIn = 1 / n; this.kN = 4 / n;
  }
  process(inputs, outputs, params) {
    const oI = outputs[0][0], oB = outputs[1][0], oO = outputs[2][0], T = params.throttle, R = params.rpm;
    const cyl = this.cyl, n = this.n, k = 1 / (120 * sampleRate), pipe = this.pipe, muf = this.muf, outlet = this.outlet;
    for (let i = 0; i < oI.length; i++) {
      const charge = T.length > 1 ? T[i] : T[0], rpm = R.length > 1 ? R[i] : R[0];
      const noise = rpm < 25 ? 0 : this.lpNoise.run(2 * Math.random() - 1) * (0.25 + 0.75 * charge);
      const jit = this.lpCrank.run(Math.random() - 0.5) * this.jitK, pipeL = pipe.outL * this.kIn, kN = this.kN;   // crank phase wobble
      let block = 0, intake = 0, pipeIn = 0;
      for (let c = 0; c < n; c++) {
        let x = this.rev + c / n + jit; x -= Math.floor(x);
        const C = cyl[c]; C.update(noise, pipeL, x, charge);
        block += C.cyl.outL; intake += C.intake.outL; pipeIn += C.extractor.outR;
      }
      this.rev += rpm * k; if (this.rev >= 1) this.rev -= 1;
      pipe.add(pipeIn * kN, muf.outL);
      outlet.add(muf.outR, 0);
      oO[i] = outlet.outR;
      muf.update(pipe.outR, outlet.outL);
      oI[i] = intake * kN; oB[i] = this.lpBlock.run(block * kN);
    }
    return true;
  }
}
registerProcessor('bd-engine', Engine);

/* 'bd-tyres' (Bloomfield Drift's own code, not from engine-sound-generator): the four tyres' squeal and scrub. Tyre squeal is a
 * stick-slip oscillation of the tread: each element sticks to the road and is dragged (deflection ramps up), then lets go and
 * snaps back; so one voice per tyre runs an asymmetric-triangle relaxation cycle (stick 66-86 % of the cycle, sharper when
 * louder) whose partials fall about 10 dB per harmonic. Every cycle draws a new period (AR(1) jitter, about 1.5 % rms) and gain
 * (shimmer, +-30 %); on top run a 25 Hz random flutter of the amplitude, a slow wander of the pitch (+-3 %, new target about
 * every 0.35 s) and now and then a hop to a neighbouring tread mode (x0.93 .. x1.08 for 0.1-0.5 s). Each tyre is detuned a
 * little (-1.8 .. +2.3 %) so two or four sliding tyres beat and chorus. A sudden rise of the level overshoots (the stored
 * tread deflection lets go at once): the chirp of a grip loss, with up to +18 % pitch. Scrub hiss: white noise through a
 * 2.6 kHz band-pass (Q 0.5, about 1.3-5 kHz), per tyre level with its own flutter. Left tyres (0, 2) lean left, right
 * tyres (1, 3) right. audio.js computes the levels and pitch from the physics.
 * Output: one, stereo. AudioParams (k-rate, smoothed here per sample): a0..a3 squeal level, f0..f3 squeal pitch (Hz),
 * h0..h3 hiss level. Nothing is allocated in process(). */
class Tyres extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const d = [];
    for (let i = 0; i < 4; i++) d.push({ name: 'a' + i, defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'f' + i, defaultValue: 800, minValue: 100, maxValue: 4000, automationRate: 'k-rate' },
      { name: 'h' + i, defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' });
    return d;
  }
  constructor() {
    super();
    const sr = sampleRate, c = (s) => 1 - Math.exp(-1 / (s * sr));
    this.x = ((Math.random() * 4294967295) >>> 0) || 1;
    this.v = [0.982, 1.011, 0.994, 1.023].map((det) => ({ det, ph: Math.random(), jr: 0, gr: 1, a: 0, aSlow: 0, f: 800, h: 0, wv: 0, wvt: 0, fl: 0, hop: 1, hopT: 1, hopN: sr }));
    this.kA = c(0.006); this.kSlow = c(0.15); this.kF = c(0.02); this.kW = c(0.15); this.kHop = c(0.012); this.pW = 1 / (0.35 * sr);
    // 25 Hz one-pole of uniform noise in [-1, 1]: std sqrt(k / (3 (2 - k))); flN scales it to unit std
    this.kFl = 1 - Math.exp(-2 * Math.PI * 25 / sr); this.flN = Math.sqrt(3 * (2 - this.kFl) / this.kFl);
    const w = 2 * Math.PI * 2600 / sr, al = Math.sin(w) / (2 * 0.5), a0 = 1 + al;      // RBJ band-pass, 0 dB peak
    this.b0 = al / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - al) / a0;
    this.z = new Float64Array(8); this.A = new Float64Array(4); this.F = new Float64Array(4); this.H = new Float64Array(4);
  }
  rnd() { let x = this.x; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.x = x >>> 0; return this.x / 4294967296; }
  process(inputs, outputs, P) {
    const o = outputs[0], L = o[0], R = o[1] || o[0], V = this.v, sr = sampleRate, z = this.z, b0 = this.b0, a1 = this.a1, a2 = this.a2;
    const A = this.A, F = this.F, H = this.H;
    A[0] = P.a0[0]; A[1] = P.a1[0]; A[2] = P.a2[0]; A[3] = P.a3[0]; F[0] = P.f0[0]; F[1] = P.f1[0]; F[2] = P.f2[0]; F[3] = P.f3[0]; H[0] = P.h0[0]; H[1] = P.h1[0]; H[2] = P.h2[0]; H[3] = P.h3[0];
    for (let n = 0; n < L.length; n++) {
      let sl = 0, sr_ = 0, hl = 0, hr = 0;
      for (let i = 0; i < 4; i++) {
        const t = V[i];
        t.a += (A[i] - t.a) * this.kA; t.aSlow += (t.a - t.aSlow) * this.kSlow; t.f += (F[i] - t.f) * this.kF; t.h += (H[i] - t.h) * this.kA;
        if (t.a < 1e-6 && t.h < 1e-6) continue;
        t.fl += (this.rnd() * 2 - 1 - t.fl) * this.kFl;
        const fl = t.fl * this.flN;
        if (t.h > 1e-6) { const hh = t.h * Math.max(0, 1 + 0.5 * fl); if (i & 1) { hr += hh; hl += 0.55 * hh; } else { hl += hh; hr += 0.55 * hh; } }
        if (t.a < 1e-6) continue;
        if (this.rnd() < this.pW) t.wvt = this.rnd() * 2 - 1;
        t.wv += (t.wvt - t.wv) * this.kW;
        if (--t.hopN <= 0) {      // tread mode hops: away for 0.1-0.5 s, back for 0.6-2.5 s
          if (t.hopT !== 1) { t.hopT = 1; t.hopN = (0.6 + 1.9 * this.rnd()) * sr; } else { const r = this.rnd(); t.hopT = r < 0.4 ? 1.08 : r < 0.7 ? 0.93 : 1.05; t.hopN = (0.1 + 0.4 * this.rnd()) * sr; }
        }
        t.hop += (t.hopT - t.hop) * this.kHop;
        // overshoot only on a fast rise: ovr ~1 for a jump, ~0.3 for a half-second ramp (squared: 0.09)
        const ovr = Math.max(0, t.a - t.aSlow) / (t.a + 0.002), ov = t.a * ovr * ovr;
        t.ph += t.f * t.det * t.hop * (1 + 0.03 * t.wv + 0.03 * t.jr + 0.18 * ovr * ovr) / sr;
        if (t.ph >= 1) { t.ph -= Math.floor(t.ph); t.jr = 0.6 * t.jr + 0.4 * (this.rnd() * 2 - 1) * 1.732; t.gr = 0.7 + 0.6 * this.rnd(); }
        const S = 0.66 + 0.2 * Math.min(1, t.a / 0.08), p = t.ph, y = p < S ? 2 * p / S - 1 : 1 - 2 * (p - S) / (1 - S);
        const s = (t.a + 1.5 * ov) * t.gr * Math.max(0, 1 + 0.4 * fl) * y;
        if (i & 1) { sr_ += s; sl += 0.55 * s; } else { sl += s; sr_ += 0.55 * s; }
      }
      let nl = 0, nr = 0;
      if (hl > 0 || hr > 0) {
        const xl = this.rnd() * 2 - 1, xr = this.rnd() * 2 - 1;
        nl = b0 * xl - b0 * z[1] - a1 * z[2] - a2 * z[3]; z[1] = z[0]; z[0] = xl; z[3] = z[2]; z[2] = nl;
        nr = b0 * xr - b0 * z[5] - a1 * z[6] - a2 * z[7]; z[5] = z[4]; z[4] = xr; z[7] = z[6]; z[6] = nr;
      }
      L[n] = sl + hl * nl * 1.7; R[n] = sr_ + hr * nr * 1.7;      // 1.7: the band-pass keeps about a third of white noise's power
    }
    return true;
  }
}
registerProcessor('bd-tyres', Tyres);
