/* Bloomfield Drift — challenges: things to find, to beat and to complete in the open world.
   Adds  40 golden apples (collectibles, placed deterministically on the first frame, once collision exists),
         8 drift zones on real streets (entry / exit gates, three star thresholds each),
         5 speed traps on real straights (60 / 80 / 100 mph, 15 lower on the hilly road),
         a HUD tracker, a zone banner, a Goals panel (menu button and the J key), minimap dots.
   Progress persists through game.store: 'ch.apples' (string of 0/1), 'ch.zones' { id: best points },
   'ch.traps' { id: best mph }, 'ch.done' (the completion message was shown).
   Public surface: BD.buildChallenges({ scene, W, M, game }) and, for other modules and tools, the read-only
   BD.challenges = { apples: [{ X, Z, found }], zones, traps, stars(), found() }.
   Events emitted: 'apple' (found, total) | 'zone' (name, points, stars) | 'trap' (name, mph, stars).
   Draws 4 calls: apples (instanced), glow + sparkle points, gate posts, painted bands. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});

  // Drift zones: [id, what it is, 1-star, 2-star, 3-star points, ...waypoints X,Z (world metres)].
  // Two waypoints follow one road between them; more are straight legs between street corners.
  // Thresholds were set by driving each zone with the drift-build Mazda3 (see the report): points are degrees of slip x metres slid.
  const ZONES = [
    ['sqw', 'Courthouse square, west side', 500, 1500, 3000, -12, 43.5, -50.5, 43, -50.4, -56.6, -12, -56.1],
    ['sqe', 'Courthouse square, east side', 500, 1500, 3000, 12, -55.7, 49.7, -55.3, 50.2, 44.2, 12, 43.7],
    ['semi', 'Downtown junction', 500, 1500, 3000, -165, -57.8, -247.6, -58, -248, 35],
    ['hwy', 'Highway sweeper', 500, 1500, 3000, 1292, -276, 1484, -287],
    ['spring', 'Hill hairpin', 500, 1500, 3000, 1514, 928, 1560, 798],
    ['cold', 'Right-angle bend', 500, 1500, 3000, 1245, -878, 1346, -960],
    ['north', 'Hillside bend', 500, 1500, 3000, 621, 915, 554, 772],
    ['david', 'Hilltop loop', 500, 1500, 3000, -531, -708, -427, -716],
  ];
  // Speed traps: [id, X, Z, hilly]
  const TRAPS = [['west', -1420, -82.5, 0], ['north', 96, -995, 0], ['se', 150, 752, 0], ['east', 770, -139, 0], ['hill', 440, -873, 1]];
  const NAPPLE = 40, MPH = 2.23694, GOLD = '#f2c230';

  B.buildChallenges = function ({ scene, W, M, game }) {
    const U = B.util, lin = U.lin, clamp = U.clamp, store = game.store, HUD = document.getElementById('stage2');
    const rgb = (hex) => { const c = lin(hex); return [c.r, c.g, c.b]; };
    const main = (s) => s.cls !== 'service' && s.cls !== 'unknown' && s.cls !== 'track';
    /** Nearest sample of a real street (or of one given road): { s: road, k: sample index }. */
    function snap(X, Z, only) {
      let best = null, bd = 1e18;
      for (const s of only ? [only] : W.roads) { if (!main(s)) continue; for (let k = 0; k < s.X.length; k++) { const d = (s.X[k] - X) ** 2 + (s.Z[k] - Z) ** 2; if (d < bd) { bd = d; best = { s, k }; } } }
      return best;
    }
    /** Exact distance from a point to the nearest road edge (negative on the road). */
    function edgeDist(X, Z) {
      let best = 1e9;
      for (const s of W.roads) for (let k = 1; k < s.X.length; k++) {
        const ax = s.X[k - 1], az = s.Z[k - 1], ex = s.X[k] - ax, ez = s.Z[k] - az; if (Math.abs(ax - X) > 40 || Math.abs(az - Z) > 40) continue;
        const t = clamp(((X - ax) * ex + (Z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), d = Math.hypot(X - ax - ex * t, Z - az - ez * t) - s.hw; if (d < best) best = d;
      }
      return best;
    }
    const placeName = (X, Z) => { let n = 'Highway bend', bd = 400; for (const p of M.places) { const d = Math.hypot(p[0] - X, -p[1] - Z); if (d < bd) { bd = d; n = p[2]; } } return n; };

    // ------------------------------------------------------------------ gates: striped posts + a painted band across the road
    const postGeos = [], bandBuf = U.Buf();
    const INK = rgb(0x1b1a1c), GOLDC = rgb(0xf2c230), RED = rgb(0xc8202b), CREAM = rgb(0xf6ead3);
    function post(X, Z, c0, c1) {
      const y = W.heightXZ(X, Z);
      for (let i = 0; i < 5; i++) postGeos.push(U.paint(new T.CylinderGeometry(0.08, 0.08, 0.44, 5, 1, true).translate(X, y + 0.22 + i * 0.44, Z), () => (i & 1 ? c1 : c0)));
      postGeos.push(U.paint(new T.CylinderGeometry(0.02, 0.13, 0.18, 5).translate(X, y + 2.29, Z), () => c0));
      W.obstacles.push(X, Z, 0.2);
    }
    /** A checkered band across road s near sample k and a pair of posts each side (at the band's two edges), at least
        0.8 m off every road edge. Slides a few samples along the road if a pair has nowhere to stand; returns the sample used. */
    function gate(s, k0, c0, c1) {
      let k, lx, lz, spots;
      const clear = (X, Z) => { const m = W.maskAt(X, Z), r = W.nearestRoad(X, Z, 60); return m !== 3 && m !== 4 && (!r || r.d - r.hw > 0.8) && edgeDist(X, Z) > 0.8; };
      for (const d of [0, 1, -1, 2, -2, 3, -3, 0]) {
        k = clamp(k0 + d, 1, s.X.length - 2); spots = [];
        const fx = s.X[k + 1] - s.X[k - 1], fz = s.Z[k + 1] - s.Z[k - 1], fl = Math.hypot(fx, fz), ux = fx / fl, uz = fz / fl; lx = uz; lz = -ux;
        for (const side of [-1, 1]) for (let o = 1.5; o < 4.6; o += 0.5) {
          const X = s.X[k] + lx * side * (s.hw + o), Z = s.Z[k] + lz * side * (s.hw + o);
          if (clear(X + ux, Z + uz) && clear(X - ux, Z - uz)) { spots.push(X + ux, Z + uz, X - ux, Z - uz); break; }
        }
        if (spots.length === 8) break;
      }
      for (let q = 0; q < spots.length; q += 2) post(spots[q], spots[q + 1], c0, c1);
      const N = Math.round(s.hw * 2 / 0.8), b = bandBuf;
      const vert = (u, lat) => { const q = u < 0 ? k - 1 : k + 1, a = Math.abs(u) / Math.hypot(s.X[q] - s.X[k], s.Z[q] - s.Z[k]); b.pos.push(s.X[k] + (s.X[q] - s.X[k]) * a + lx * lat, s.H[k] + (s.H[q] - s.H[k]) * a + s.lift + 0.03, s.Z[k] + (s.Z[q] - s.Z[k]) * a + lz * lat); b.nor.push(0, 1, 0); };
      for (let r = 0; r < 2; r++) for (let c = 0; c < N; c++) {
        const v = b.pos.length / 3, l0 = -s.hw + 2 * s.hw * c / N, l1 = l0 + 2 * s.hw / N, col = (r + c) & 1 ? c1 : c0;
        vert(r - 1, l0); vert(r, l0); vert(r - 1, l1); vert(r, l1); for (let q = 0; q < 4; q++) b.col.push(col[0], col[1], col[2]); b.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
      return k;
    }

    // ------------------------------------------------------------------ drift zones and speed traps (built now: posts must be in before collision)
    const zBest = store.get('ch.zones', {}), tBest = store.get('ch.traps', {});
    const zones = ZONES.map((def) => {
      const w = def.slice(5), px = [], pz = [];
      if (w.length === 4) { const a = snap(w[0], w[1]), b = snap(w[2], w[3], a.s), d = b.k > a.k ? 1 : -1; for (let k = a.k; k !== b.k + d; k += d) { px.push(a.s.X[k]); pz.push(a.s.Z[k]); } }
      else for (let i = 0; i + 3 < w.length; i += 2) { const n = Math.round(Math.hypot(w[i + 2] - w[i], w[i + 3] - w[i + 1]) / 2.5); for (let q = i ? 1 : 0; q <= n; q++) { px.push(w[i] + (w[i + 2] - w[i]) * q / n); pz.push(w[i + 1] + (w[i + 3] - w[i + 1]) * q / n); } }
      const n = px.length, z = { id: def[0], kind: def[1], th: def.slice(2, 5), n, X: Float32Array.from(px), Z: Float32Array.from(pz), ex: [0, 0], ez: [0, 0], tx: [0, 0], tz: [0, 0], pd: [NaN, NaN], hw: 0, len: 0 };
      for (let e = 0; e < 2; e++) {       // the two gate lines sit on a road sample so line, band and posts agree
        const i = e ? n - 1 : 0, j = e ? n - 2 : 1, g = snap(z.X[i], z.Z[i]), k = gate(g.s, g.k, GOLDC, INK); z.X[i] = z.ex[e] = g.s.X[k]; z.Z[i] = z.ez[e] = g.s.Z[k];
        const l = Math.hypot(z.X[j] - z.X[i], z.Z[j] - z.Z[i]); z.tx[e] = (z.X[j] - z.X[i]) / l; z.tz[e] = (z.Z[j] - z.Z[i]) / l;   // points into the zone
        z.hw = Math.max(z.hw, g.s.hw);
      }
      for (let k = 1; k < n; k++) z.len += Math.hypot(z.X[k] - z.X[k - 1], z.Z[k] - z.Z[k - 1]);
      const m = Math.floor(n * 0.6), mid = snap(z.X[m], z.Z[m]); z.name = mid.s.name || placeName(z.X[m], z.Z[m]);
      z.cx = z.X[n >> 1]; z.cz = z.Z[n >> 1]; z.r2 = 0; for (let k = 0; k < n; k++) z.r2 = Math.max(z.r2, (z.X[k] - z.cx) ** 2 + (z.Z[k] - z.cz) ** 2); z.r2 = (Math.sqrt(z.r2) + 30) ** 2;
      return z;
    });
    const traps = TRAPS.map((def) => {
      const g = snap(def[1], def[2]), s = g.s, k = gate(s, g.k, CREAM, RED), fx = s.X[k + 1] - s.X[k - 1], fz = s.Z[k + 1] - s.Z[k - 1], fl = Math.hypot(fx, fz);
      return { id: def[0], name: s.name || placeName(s.X[k], s.Z[k]), th: def[3] ? [45, 65, 85] : [60, 80, 100], x: s.X[k], z: s.Z[k], tx: fx / fl, tz: fz / fl, hw: s.hw, pd: NaN, cool: 0 };
    });
    {
      const posts = new T.Mesh(U.mergeGeos(postGeos), new T.MeshLambertMaterial({ vertexColors: true })); posts.castShadow = true; scene.add(posts);
      const bands = new T.Mesh(U.bufGeo(bandBuf), new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); bands.receiveShadow = true; scene.add(bands);
    }

    // ------------------------------------------------------------------ golden apples: meshes now, positions on the first frame
    const apples = [];                                   // { X, Z, Y, found, pop, mark, dot }
    let saved = String(store.get('ch.apples', ''));
    const appleMesh = (() => {
      const body = new T.LatheGeometry([[0.001, -0.3], [0.11, -0.36], [0.25, -0.37], [0.38, -0.27], [0.46, -0.07], [0.47, 0.12], [0.4, 0.3], [0.27, 0.39], [0.13, 0.38], [0.035, 0.3]].map((p) => new T.Vector2(p[0], p[1])), 12);
      const stem = new T.CylinderGeometry(0.025, 0.035, 0.26, 4, 1, true).translate(0, 0.41, 0), leaf = new T.BufferGeometry();
      leaf.setAttribute('position', new T.BufferAttribute(new Float32Array([0.02, 0.48, 0, 0.2, 0.56, 0.1, 0.38, 0.52, 0, 0.02, 0.48, 0, 0.38, 0.52, 0, 0.2, 0.56, -0.1, 0.02, 0.48, 0, 0.38, 0.52, 0, 0.2, 0.56, 0.1, 0.02, 0.48, 0, 0.2, 0.56, -0.1, 0.38, 0.52, 0]), 3)); leaf.computeVertexNormals();
      const gold = rgb(0xffc93a), geo = U.mergeGeos([U.paint(body, (x, y) => { const v = 0.72 + y * 0.7; return [gold[0] * v, gold[1] * v, gold[2] * v]; }), U.paint(stem, () => rgb(0x5a3a22)), U.paint(leaf, () => rgb(0x5d9a2e))]).rotateZ(0.2);
      const m = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.28, emissive: lin(0x6e4706) }), NAPPLE);
      m.frustumCulled = false; m.count = 0; scene.add(m); return m;
    })();
    // one Points object: a soft halo per apple (never smaller than 7 px, so it reads from far away) + the sparkle burst
    const NSPK = 18, NP = NAPPLE + NSPK, gPos = new Float32Array(NP * 3), gDat = new Float32Array(NP * 2), sVel = new Float32Array(NSPK * 3);
    let sparkT = 0;
    const glowGeo = new T.BufferGeometry(); glowGeo.setAttribute('position', new T.BufferAttribute(gPos, 3)); glowGeo.setAttribute('aData', new T.BufferAttribute(gDat, 2));
    const glowMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uH: { value: 720 }, uT: { value: 0 } },
      vertexShader: 'attribute vec2 aData; uniform float uH, uT; varying vec2 vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z, far = smoothstep(12.0, 70.0, d) * step(1.0, aData.x); vA = vec2(aData.y * (0.8 + 0.2 * sin(uT * 3.1 + position.x * 0.37)) * (1.0 - smoothstep(450.0, 750.0, d)), far); gl_PointSize = aData.y > 0.0 ? max(aData.x * uH * 0.5 * projectionMatrix[1][1] / max(d, 0.5), far * uH * 0.13 + 6.0) : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec2 vA; void main(){ vec2 p = abs(gl_PointCoord * 2.0 - 1.0); float g = max(0.0, 1.0 - length(p) * mix(1.0, 2.4, vA.y)), c = g * g * g, beam = max(0.0, 1.0 - p.x * 18.0) * (1.0 - p.y) + 0.7 * max(0.0, 1.0 - p.y * 18.0) * max(0.0, 1.0 - p.x * 2.0); gl_FragColor = vec4(vec3(1.0, 0.72, 0.2) + vec3(0.0, 0.22, 0.6) * c, min(1.0, (g * g * 0.8 + c * c + beam * beam * vA.y) * vA.x)); }' });
    { const p = new T.Points(glowGeo, glowMat); p.frustumCulled = false; p.renderOrder = 2; scene.add(p); }

    function placeApples() {
      const LIM = W.PLAY - 60, cand = [], h2 = U.hash2;
      const free = (X, Z, c) => { const m = W.maskAt(X, Z); return Math.abs(X) < LIM && Math.abs(Z) < LIM && m !== 3 && m !== 4 && !W.collide(X, Z, c); };
      const soft = (X, Z) => { const m = W.maskAt(X, Z); return m === 0 || m === 5; };          // off the roadway
      // a car can drive there: a straight, clear, not-too-steep line from the nearest street
      const reach = (X, Z) => {
        const r = W.nearestRoad(X, Z, 200); if (!r) return false; const n = Math.ceil(Math.hypot(X - r.x, Z - r.z)) || 1; let h0 = W.heightXZ(r.x, r.z);
        for (let i = 1; i <= n; i++) { const x = r.x + (X - r.x) * i / n, z = r.z + (Z - r.z) * i / n, h = W.heightXZ(x, z), m = W.maskAt(x, z); if (m === 3 || m === 4 || Math.abs(h - h0) > 0.13 || W.collide(x, z, 1.4)) return false; h0 = h; }   // 13 %: about what a rear-driven car climbs on grass
        for (let a = 0; a < 6.2; a += 0.785) if (Math.abs(W.heightXZ(X + Math.cos(a) * 5, Z + Math.sin(a) * 5) - h0) > 0.7) return false;
        return true;
      };
      const gentle = (s, k) => { for (let q = Math.max(2, k - 10); q <= Math.min(s.X.length - 1, k + 10); q++) if (Math.abs(s.H[q] - s.H[q - 2]) > 0.9) return false; return true; };   // no ramps steeper than 18 % within 25 m
      const around = (X, Z, r0, r1, ok, cat) => { for (let r = r0; r <= r1; r += 4) for (let a = 0; a < 8; a++) { const x = X + Math.cos(a * 0.785 + r) * r, z = Z + Math.sin(a * 0.785 + r) * r; if (ok(x, z) && free(x, z, 3) && reach(x, z)) { cand.push([x, z, cat]); return; } } };
      around(0, -30, 0, 28, (x, z) => Math.abs(x) < 36 && z > -44 && z < 30 && soft(x, z), 'lawn');
      for (const p of M.places) around(p[0], -p[1], 8, 40, soft, 'place');
      for (const a of M.areas) if (a.k === 'park' || a.k === 'pitch') { let cx = 0, cz = 0; for (let k = 0; k < a.p.length; k += 2) { cx += a.p[k]; cz -= a.p[k + 1]; } around(cx * 2 / a.p.length, cz * 2 / a.p.length, 0, 40, soft, 'park'); }
      for (const w of M.water) for (let k = 0; k < w.p.length; k += 6) if (w.p[k] < -1000) around(w.p[k], -w.p[k + 1], 8, 44, (x, z) => W.maskAt(x, z) === 0, 'river');
      // dead ends (a street end no other road touches) and crests (the highest point of a street for 60 m either way)
      const cells = new Map(), key = (X, Z) => Math.floor(X / 16) * 4096 + Math.floor(Z / 16);
      W.roads.forEach((s, ri) => { for (let k = 0; k < s.X.length; k++) { const q = key(s.X[k], s.Z[k]); let a = cells.get(q); if (!a) cells.set(q, a = []); a.push(ri, k); } });
      const lonely = (ri, X, Z) => { for (let i = -16; i <= 16; i += 16) for (let j = -16; j <= 16; j += 16) { const a = cells.get(key(X + i, Z + j)); if (a) for (let q = 0; q < a.length; q += 2) if (a[q] !== ri && (W.roads[a[q]].X[a[q + 1]] - X) ** 2 + (W.roads[a[q]].Z[a[q + 1]] - Z) ** 2 < 144) return false; } return true; };
      W.roads.forEach((s, ri) => {
        const n = s.X.length; if (!main(s) || n < 16) return;
        for (const e of [0, n - 1]) if (lonely(ri, s.X[e], s.Z[e])) { const k = e ? n - 3 : 2; if (free(s.X[k], s.Z[k], 3) && gentle(s, k)) cand.push([s.X[k], s.Z[k], 'dead']); }
        for (let k = 24; k < n - 24; k += 2) {
          let top = true, lo = s.H[k]; for (let q = k - 24; q <= k + 24 && top; q += 2) { if (s.H[q] > s.H[k]) top = false; lo = Math.min(lo, s.H[q]); }
          if (!top || s.H[k] - lo < 2.5 || !gentle(s, k)) continue;
          const hwy = s.cls === 'primary' || s.cls === 'secondary', o = hwy ? s.hw + 2.5 : 0, fx = s.X[k + 1] - s.X[k - 1], fz = s.Z[k + 1] - s.Z[k - 1], fl = Math.hypot(fx, fz), X = s.X[k] + fz / fl * o, Z = s.Z[k] - fx / fl * o;   // highways: on the shoulder, never in the lane
          if (free(X, Z, 3) && (!hwy || soft(X, Z))) { cand.push([X, Z, 'hill']); k += 40; }
        }
      });
      // open grass well off the pavement
      for (let i = 0; i < 2 * LIM / 100; i++) for (let j = 0; j < 2 * LIM / 100; j++) {
        const X = -LIM + (i + h2(i, j)) * 100, Z = -LIM + (j + h2(j + 77, i)) * 100; if (W.maskAt(X, Z) !== 0 || !free(X, Z, 5)) continue;
        const r = W.nearestRoad(X, Z, 130); if (r && r.d - r.hw > 12 && reach(X, Z)) cand.push([X, Z, 'grass']);
      }
      // farthest-point picks per kind keep them 150 m apart and spread over the whole map
      const pick = (cat, count) => {
        for (let q = 0; q < count && apples.length < NAPPLE; q++) {
          let best = null, bd = 150;
          for (const c of cand) { if (cat && c[2] !== cat) continue; let d = 1e9; for (const a of apples) d = Math.min(d, Math.hypot(a.X - c[0], a.Z - c[1])); if (d > bd) { bd = d; best = c; } }
          if (!best) return; apples.push({ X: best[0], Z: best[1], Y: W.heightXZ(best[0], best[1]) + 1.2, kind: best[2], found: false, pop: 0, dot: { x: best[0], y: -best[1], c: GOLD, r: 5 }, on: false });
        }
      };
      pick('lawn', 1); pick('place', 10); pick('park', 3); pick('river', 3); pick('dead', 6); pick('hill', 7); pick('grass', 10); pick(null, NAPPLE);
      const m4 = new T.Matrix4();
      apples.forEach((a, i) => { a.found = saved[i] === '1'; m4.makeTranslation(a.X, a.Y, a.Z); if (a.found) m4.elements[0] = m4.elements[5] = m4.elements[10] = 0; appleMesh.setMatrixAt(i, m4); gPos[3 * i] = a.X; gPos[3 * i + 1] = a.Y; gPos[3 * i + 2] = a.Z; gDat[2 * i] = 3.6; gDat[2 * i + 1] = a.found ? 0 : 1; });
      appleMesh.count = apples.length; appleMesh.instanceMatrix.needsUpdate = true; glowGeo.attributes.position.needsUpdate = glowGeo.attributes.aData.needsUpdate = true;
      track();
    }

    // ------------------------------------------------------------------ DOM: tracker, banner, flash, Goals panel
    const add = (parent, tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent.appendChild(e); return e; };
    add(document.head, 'style').textContent = `
      #chTrack{position:absolute;left:166px;bottom:27px;margin:0;padding:0;border:0;background:none;min-height:0;color:var(--cream);font:15px var(--text);letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 4px #000;white-space:nowrap}
      #chTrack b{font-size:20px;color:var(--gold);font-variant-numeric:tabular-nums}
      .touch #chTrack{left:0;bottom:auto;top:198px}
      #chBanner{position:absolute;left:50%;bottom:0;transform:translateX(-50%);background:var(--panel);border-radius:4px;padding:6px 16px 7px;text-align:center;box-shadow:inset 0 0 0 1.5px var(--line);white-space:nowrap;max-width:100%}
      #chBanner[hidden],#pGoals[hidden]{display:none}
      #chBanner .k{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
      #chBanner .k b{color:var(--cream)}
      #chBanner .v{display:flex;gap:10px;align-items:baseline;justify-content:center;font-size:16px;color:var(--dim)}
      #chBanner .v b{font:30px/1.05 var(--display);color:var(--gold);font-variant-numeric:tabular-nums}
      .chS{color:rgba(246,234,211,.28);font-size:20px;letter-spacing:.06em;white-space:nowrap;font-style:normal}
      .chS b{display:inline;color:var(--gold);font-size:inherit;font-weight:400}
      #chFlash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none}
      #chFlash.on{animation:chFlash .34s ease-out}
      @keyframes chFlash{from{opacity:.7}to{opacity:0}}
      #chBar{height:8px;border-radius:2px;background:rgba(246,234,211,.16);overflow:hidden;flex:none}
      #chBar i{display:block;height:100%;background:var(--gold)}
      #chList .item{flex-wrap:wrap;gap:6px 12px}
      #chList .chS{font-size:22px}
      .chH{font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-top:6px}
      @media (max-width:520px){#chTrack{left:124px}.touch #chTrack{left:0}}
      /* the centred banner (up to ~404 px wide) fits between the tracker row and the tach only above ~1260 px: lift it over
         the 50 px tracker row, then, once it would reach the 128 px tach, over the 150 px minimap (touch keeps both at the top) */
      @media (max-width:1260px){body:not(.touch) #chBanner{bottom:56px}}
      @media (max-width:920px){body:not(.touch) #chBanner{bottom:158px}}
      @media (max-width:600px){#chBanner{bottom:186px}}
      @media (prefers-reduced-motion:reduce){#chFlash.on{animation:none}}`;
    const starsText = (n) => '★★★'.slice(0, n) + '☆☆☆'.slice(n);
    const setStars = (el, n) => { el.n = n; el.textContent = ''; add(el, 'b', '', '★★★'.slice(0, n)); el.append('★★★'.slice(n)); };
    const starOf = (v, th) => (v >= th[2] ? 3 : v >= th[1] ? 2 : v >= th[0] ? 1 : 0), num = (v) => Math.round(v).toLocaleString();
    const totalStars = () => { let n = 0; for (const z of zones) n += starOf(zBest[z.id] || 0, z.th); for (const t of traps) n += starOf(tBest[t.id] || 0, t.th); return n; };
    const found = () => { let n = 0; for (const a of apples) if (a.found) n++; return n; }, MAXSTARS = (zones.length + traps.length) * 3;

    const tracker = add(HUD, 'button'); tracker.id = 'chTrack'; tracker.title = 'Goals'; tracker.append('Stars ');
    const trStars = add(tracker, 'b', '', '0'); tracker.append('/' + MAXSTARS + ' · Apples '); const trApples = add(tracker, 'b', '', '0'); tracker.append('/' + NAPPLE);
    let done = !!store.get('ch.done', 0);
    /** Refreshes the tracker; announces 100 % once. */
    function track() {
      const s = totalStars(), f = found(); trStars.textContent = s; trApples.textContent = f; tracker.lastChild.nodeValue = '/' + (apples.length || NAPPLE);
      if (!done && apples.length && s === MAXSTARS && f === apples.length) { done = true; store.set('ch.done', 1); game.toast('Every star and every golden apple. Bloomfield is yours.'); }
    }
    const banner = add(HUD, 'div'); banner.id = 'chBanner'; banner.hidden = true;
    const bnKind = add(banner, 'div', 'k'), bnRow = add(banner, 'div', 'v'), bnPts = add(bnRow, 'b', '', '0'), bnStars = add(bnRow, 'i', 'chS'), bnBest = add(bnRow, 'span');
    let bannerT = 0, bnShown = -1;
    function showBanner(kind, name, pts, stars, note, secs) {
      bnKind.textContent = kind + ' · '; add(bnKind, 'b', '', name); bnPts.textContent = num(pts); bnShown = -1; setStars(bnStars, stars); bnBest.textContent = note; banner.hidden = false; bannerT = secs;
    }
    const flash = add(HUD, 'div'); flash.id = 'chFlash';

    const panel = add(document.getElementById('stage'), 'div', 'panel'); panel.id = 'pGoals'; panel.hidden = true;
    { const head = add(panel, 'div', 'head'); add(head, 'h2', '', 'Goals'); add(head, 'button', 'btn small', 'Close').onclick = () => game.closePanel(); }
    const sum = add(panel, 'p'), bar = add(add(panel, 'div'), 'i'), list = add(panel, 'div', 'list'); bar.parentNode.id = 'chBar'; list.id = 'chList';
    const target = { x: 0, y: 0, c: '#c8202b', r: 10 }; let tgt = null;                     // "Show on map": a red dot held on the minimap rim until you get there
    function clearTarget() { const i = game.markers.indexOf(target); if (i >= 0) game.markers.splice(i, 1); tgt = null; }
    function showOnMap(o, X, Z) {
      clearTarget(); tgt = { o, x: X, y: -Z }; game.markers.push(target); game.closePanel();
      const dx = X - game.car.x, dy = -Z - game.car.y, d = Math.hypot(dx, dy), dir = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7];
      game.toast(o.name + ' · ' + (d < 320 ? Math.round(d * 3.281 / 50) * 50 + ' ft ' : (d / 1609.34).toFixed(1) + ' mi ') + dir);
    }
    function row(o, best, unit, X, Z) {
      const st = starOf(best, o.th), it = add(list, 'div', 'item'), g = add(it, 'div', 'grow'); add(g, 'b', '', o.name);
      add(g, 'span', '', (o.kind ? o.kind + ' · ' : '') + (best ? 'Best ' + num(best) + unit : 'Not driven yet') + ' · Stars at ' + o.th.map(num).join(' / ') + unit);
      setStars(add(it, 'i', 'chS'), st); if (st < 3) add(it, 'button', 'btn small ghost', 'Show on map').onclick = () => showOnMap(o, X, Z);
    }
    function openGoals() {
      const s = totalStars(), f = found(), n = apples.length || NAPPLE, pct = Math.floor((s + f) / (MAXSTARS + n) * 100);
      sum.textContent = pct === 100 ? '100% complete. Every star earned and every golden apple found.' : pct + '% complete · ' + s + ' of ' + MAXSTARS + ' stars · ' + f + ' of ' + n + ' golden apples';
      bar.style.width = pct + '%'; list.textContent = '';
      add(list, 'div', 'chH', 'Drift zones'); for (const z of zones) row(z, zBest[z.id] || 0, '', z.X[z.n >> 1], z.Z[z.n >> 1]);
      add(list, 'div', 'chH', 'Speed traps'); for (const t of traps) row(t, tBest[t.id] || 0, ' mph', t.x, t.z);
      add(list, 'div', 'chH', 'Golden apples');
      const it = add(list, 'div', 'item'), g = add(it, 'div', 'grow'); add(g, 'b', '', f + ' of ' + n + ' found'); add(g, 'span', '', f < n ? 'Look for the gold glow. Apples within 350 m show as gold dots on the minimap.' : 'The whole orchard is in.');
      game.openPanel('pGoals');
    }
    tracker.onclick = () => { tracker.blur(); openGoals(); };
    game.addMenuButton('Goals', openGoals);
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyJ' || e.repeat || (e.target && e.target.tagName === 'INPUT') || game.mode !== 'drive') return;
      if (game.panel === 'pGoals') game.closePanel(); else if (!game.panel && !document.getElementById('hud').hidden) openGoals();
    });
    const beep = (f, len, vol) => { if (B.audio) B.audio.beep(f, len, vol); };

    // ------------------------------------------------------------------ run time
    let act = null, actE = 0, pts = 0, far = 0, idx = 0, dotT = 0;
    function endZone(kind, note, p, st) { if (act) { showBanner(kind, act.name, p, st, note, 3.5); act.pd[0] = act.pd[1] = NaN; act = null; } }
    function enterZone(z, e) {
      act = z; actE = e; pts = 0; far = -1; idx = e ? z.n - 1 : 0; const best = zBest[z.id] || 0;
      showBanner('Drift zone', z.name, 0, starOf(best, z.th), best ? 'Best ' + num(best) : 'Next star ' + num(z.th[0]), 1e9);
    }
    function zoneFrame(dt, car, X, Z) {
      if (!act) {
        for (const z of zones) {
          const dx = X - z.cx, dz = Z - z.cz; if (dx * dx + dz * dz > z.r2) { z.pd[0] = z.pd[1] = NaN; continue; }
          for (let e = 0; e < 2; e++) { const ax = X - z.ex[e], az = Z - z.ez[e], d = ax * z.tx[e] + az * z.tz[e], l = az * z.tx[e] - ax * z.tz[e], p = z.pd[e]; z.pd[e] = d; if (p < 0 && d >= 0 && d < 6 && Math.abs(l) < z.hw + 3) { enterZone(z, e); return; } }
        }
        return;
      }
      const z = act, n = z.n, o = 1 - actE; let bd = 1e9, bi = idx;
      for (let j = Math.max(0, idx - 8), j1 = Math.min(n - 1, idx + 8); j <= j1; j++) { const d = (z.X[j] - X) ** 2 + (z.Z[j] - Z) ** 2; if (d < bd) { bd = d; bi = j; } }
      idx = bi;
      if (bd > (z.hw + 12) ** 2) return endZone('Zone lost', 'Left the road', pts, 0);
      if ((X - z.ex[o]) * z.tx[o] + (Z - z.ez[o]) * z.tz[o] < 0 && (o ? idx > n - 4 : idx < 3)) {          // out through the far gate: bank it
        const p = Math.round(pts), st = starOf(p, z.th), old = zBest[z.id] || 0;
        if (p > old) { zBest[z.id] = p; store.set('ch.zones', zBest); }
        endZone('Zone banked', p > old && old ? 'New best' : p > old ? (st < 3 ? 'Next star ' + num(z.th[st]) : 'All three stars') : 'Best ' + num(old), p, st);
        beep(st > 1 ? 880 : 660, 0.16, 0.2); if (st) setTimeout(beep, 110, st > 2 ? 1320 : 990, 0.3, 0.2);
        game.emit('zone', z.name, p, st); if (tgt && tgt.o === z) clearTarget(); track(); return;
      }
      if ((X - z.ex[actE]) * z.tx[actE] + (Z - z.ez[actE]) * z.tz[actE] < -1 && (actE ? idx > n - 4 : idx < 3)) return endZone('Zone lost', 'Turned back', pts, 0);
      // slip angle (deg) x speed x dt while the tail is out, counted only on fresh ground so circling on the spot earns nothing
      const j0 = Math.max(0, idx - 1), j1 = Math.min(n - 1, idx + 1), tx = z.X[j1] - z.X[j0], tz = z.Z[j1] - z.Z[j0];
      let s = idx * 2.5 + ((X - z.X[idx]) * tx + (Z - z.Z[idx]) * tz) / Math.hypot(tx, tz); if (actE) s = (n - 1) * 2.5 - s;
      if (s > far) { far = s; const ang = Math.abs(car.beta) * 57.3; if (ang > 10 && car.u > 6 && !car.air) pts += Math.min(ang, 70) * car.speed * dt; }
      const q = Math.round(pts / 10); if (q !== bnShown) { bnShown = q; bnPts.textContent = num(q * 10); const st = Math.max(starOf(pts, z.th), starOf(zBest[z.id] || 0, z.th)); if (st !== bnStars.n) { bnStars.n = st; setStars(bnStars, st); } }
    }
    function trapFrame(car, X, Z, time) {
      for (const t of traps) {
        const ax = X - t.x, az = Z - t.z; if (ax * ax + az * az > 900) { t.pd = NaN; continue; }
        const d = ax * t.tx + az * t.tz, p = t.pd; t.pd = d;
        if (p === p && (p < 0) !== (d < 0) && Math.abs(az * t.tx - ax * t.tz) < t.hw + 2 && car.speed > 13.4 && time > t.cool) {
          const mph = Math.round(car.speed * MPH), st = starOf(mph, t.th); t.cool = time + 3;
          if (mph > (tBest[t.id] || 0)) { tBest[t.id] = mph; store.set('ch.traps', tBest); }
          flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); beep(1568, 0.07, 0.2);
          game.toast('Speed trap: ' + mph + ' mph ' + starsText(st)); game.emit('trap', t.name, mph, st); if (tgt && tgt.o === t) clearTarget(); track();
        }
      }
    }
    function collect(i) {
      const a = apples[i]; a.found = true; a.pop = 0.3; gDat[2 * i + 1] = 0; saved = apples.map((q) => (q.found ? 1 : 0)).join(''); store.set('ch.apples', saved);
      for (let k = 0; k < NSPK; k++) { const p = NAPPLE + k, an = Math.random() * 6.283, v = 2 + Math.random() * 3; gPos[3 * p] = a.X; gPos[3 * p + 1] = a.Y; gPos[3 * p + 2] = a.Z; sVel[3 * k] = Math.cos(an) * v; sVel[3 * k + 1] = 1.5 + Math.random() * 4; sVel[3 * k + 2] = Math.sin(an) * v; gDat[2 * p] = 0.35 + Math.random() * 0.3; }
      sparkT = 0.7; const n = found(); game.toast('Golden apple ' + n + ' of ' + apples.length); beep(880, 0.12, 0.22); setTimeout(beep, 95, 1320, 0.3, 0.22);
      game.emit('apple', n, apples.length); track();
    }

    let ready = false;
    game.on('raceStart', () => { act = null; banner.hidden = true; });
    game.on('crash', () => { if (act) endZone('Zone lost', 'Crashed', pts, 0); });
    game.on('frame', (dt, driving, time) => {
      if (!ready) { if (!W.collide) return; ready = true; placeApples(); }
      const car = game.car, X = car.x, Z = -car.y, im = appleMesh.instanceMatrix.array; let dirty = false;
      glowMat.uniforms.uT.value = time; glowMat.uniforms.uH.value = game.renderer.domElement.height;
      for (let i = 0; i < apples.length; i++) {
        const a = apples[i], dx = a.X - X, dz = a.Z - Z, d2 = dx * dx + dz * dz;
        if (a.found && a.pop <= 0) continue;
        if (!a.found && driving && d2 < 6.76) collect(i);
        if (d2 > 90000) continue;                           // spin, bob and pop only matter up close
        let sc = 1; if (a.found) { a.pop -= dt; sc = a.pop > 0 ? 1 + (0.3 - a.pop) * 5 : 0; }
        const an = time * 1.5 + i, c = Math.cos(an) * sc, s = Math.sin(an) * sc, o = i * 16;
        im[o] = c; im[o + 2] = -s; im[o + 5] = sc; im[o + 8] = s; im[o + 10] = c; im[o + 13] = a.Y + Math.sin(time * 2 + i) * 0.12; dirty = true;
      }
      if (dirty) appleMesh.instanceMatrix.needsUpdate = true;
      if (sparkT > 0) {
        sparkT -= dt; const u = Math.max(0, sparkT / 0.7);
        for (let k = 0; k < NSPK; k++) { const p = NAPPLE + k; sVel[3 * k + 1] -= 7 * dt; gPos[3 * p] += sVel[3 * k] * dt; gPos[3 * p + 1] += sVel[3 * k + 1] * dt; gPos[3 * p + 2] += sVel[3 * k + 2] * dt; gDat[2 * p + 1] = u * 1.4; }
        glowGeo.attributes.position.needsUpdate = glowGeo.attributes.aData.needsUpdate = true;
      }
      if (bannerT > 0 && !act && (bannerT -= dt) <= 0) banner.hidden = true;
      if (!driving) return;
      if ((dotT -= dt) <= 0) {                               // minimap: gold dots for apples still out there within 350 m
        dotT = 0.5;
        for (const a of apples) { const want = !a.found && (a.X - X) ** 2 + (a.Z - Z) ** 2 < 122500; if (want !== a.on) { a.on = want; if (want) game.markers.push(a.dot); else { const m = game.markers, i = m.indexOf(a.dot); if (i >= 0) { m[i] = m[m.length - 1]; m.length--; } } } }
      }
      if (tgt) { const dx = tgt.x - car.x, dy = tgt.y - car.y, d = Math.hypot(dx, dy), k = Math.min(1, 222 / d); target.x = car.x + dx * k; target.y = car.y + dy * k; if (d < 25) clearTarget(); }
      if (game.race) { if (act) { act = null; banner.hidden = true; } return; }
      zoneFrame(dt, car, X, Z); trapFrame(car, X, Z, time);
    });

    B.challenges = { apples, zones, traps, stars: totalStars, found };
  };
})();
