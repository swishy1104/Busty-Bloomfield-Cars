/* Bloomfield Drift — buildings (BD.buildBuildings). Every real footprint as an accurate shell from the lidar survey: roofs.js
   (window.BLOOMFIELD_ROOFS, written by tools/build_roofs.py) gives each building its roof facets (planes with plan outlines that tile
   the footprint: wings, hips, valleys, lean-tos, stepped flat roofs). Walls follow the footprint up to the roof edge above them, with
   whole facade tiles up to the local eave and the plain tile of the same style above it (gable ends, lean-to sides); windows set back
   in the wall with reveals and sills, eaves with fascia (doubling as the gutter), soffit and downspouts at the outside corners, corner
   boards, a foundation band, shingled or standing-seam roofs with ridge and hip caps, louvred vents in the gable ends, parapets,
   membrane or gravel colours and air-handling units on the flat commercial roofs, baked occlusion, lights-on windows at dusk.
   Storeys: downtown a 3.8-4.6 m shop floor under tall upper floors (arched or lintelled windows under limestone hoods); a long downtown
   street front is cut into 2-3 tile bays, each its own brick shade or painted / limestone front, window style, raised parapet and
   bracketed cornice, hung from the bay's lowest parapet point; churches (M.places) one tall arched storey; schools brick with windows; low ranch
   walls show the tiles cut at true scale (plain wall under a sill 0.8 m up); each run sits on its own grade (storeys below the floor where the ground falls away, not a tall foundation); tall steps between
   roof levels get windows too; sloped facets that disagree by under 1 m are welded (no siding wedges in the roofs).
   One 4096 px facade atlas (2048 on phones). Drawn as 13 x 13 chunks x (walls, roofs) of full detail near the camera and 6 x 6 meshes of
   cheap shells beyond 150 m.
   Called by world.js as BD.buildBuildings({ scene, W, M, DT, hAt }) while the world is built. It must:
     - push one record per footprint onto W.buildings: { pts: [[X,Z],...], cx, cz, area, floorY, top (eave / flat-roof level; a flat-roofed
       block: the parapet line of its street front), ridge (roof peak), roof (0 flat, 1|2 gable, 3 hip), wallH, cornice (true when a cornice
       is drawn here: landmarks.js then adds none; its single-height cornice cannot follow a stepped front), name, fp (index into M.buildings), kind ('court'|'house'|'downtown'|'shed'|'block'), wall (THREE.Color) }
       plus roofAt(X, Z) -> height of the roof surface at a world point, or null outside the footprint (for chimneys, steeples, signs)
     - push every wall segment onto W.walls as X1, Z1, X2, Z2 (collision)
     - skip DRAWING the footprints in BD.heroSkip (a Set of M.buildings indices that heroes.js plug-ins model by hand; their records,
       collision walls, minimap and inBuilding stay)
     - set W.windowGlow(level) (0 = windows dark, 1+ = lights on; world.js calls it from W.setTime)
   M = window.BLOOMFIELD (footprints in map coords, y north; places and areas name churches, schools and industry), DT = window.BLOOMFIELD_DETAIL
   (DT.roofs: per footprint eave x10, rise x10, type; only used for the record's roof type and, when roofs.js is missing, a flat cap at the eave);
   W.maskAt finds the walls that face a street. */
(function () {
  'use strict';
  const T = THREE, B = (window.BD = window.BD || {});
  B.buildBuildings = function ({ scene, W, M, DT, hAt }) {
    const { lin, clamp, mulberry, hash2, canvasTex, Buf, bufGeo, b64u8 } = B.util, HALF = W.HALF, segs = W.walls, tc = new T.Color();
    const small = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // phones get a quarter of the texture memory (game.js's own test for opts.small, which world.js does not pass on)
    const r = mulberry(21), TS = 256, S = small ? 2 : 4, GS = small ? 512 : 1024, cut = [], lit = []; let tox = 0, toy = 0;
    // Window openings per facade tile (tile units: 256 = 3.3 m of wall; x, y from the tile's top-left). a = arch height, sill = stone or wood sill, s = default sash.
    const DH = { rail: 1 }, WN = { 0: { x: 86, y: 60, w: 84, h: 124, sill: 1, s: DH }, 3: { x: 50, y: 66, w: 156, h: 118, sill: 1, pair: 1, s: DH }, 4: { x: 82, y: 34, w: 92, h: 170, a: 46, sill: 1, s: { rail: 1, cols: 2, arch: 0.27 } },
      5: { x: 84, y: 60, w: 88, h: 124, sill: 1, s: DH }, 7: { x: 22, y: 56, w: 212, h: 150, s: { cols: 3, fx: 0.022, fy: 0.032 } }, 10: { x: 80, y: 62, w: 96, h: 110, sill: 1, s: { cols: 3, rows: 3, dark: 1, fx: 0.04, fy: 0.04 } } }; WN[1] = WN[0]; WN[13] = WN[4];
    // Sash sheet (tile 15): 5 x 2 cells that the recessed window quads show. Row 0 double-hung: plain, blinds half down, six over six, curtains, blinds down;
    // row 1: arched, arched with curtains, plate glass, plate glass with the lights on, steel sash. LITC = the cells with lights on at dusk.
    const CELLS = [DH, { rail: 1, blind: 0.5 }, { rail: 1, cols: 3, rows: 2 }, { rail: 1, curt: 1 }, { rail: 1, blind: 0.93 }, WN[4].s, { rail: 1, cols: 2, arch: 0.27, curt: 1 }, WN[7].s, WN[7].s, WN[10].s], LITC = [1, 3, 4, 6, 8], CW = 51.2, CH = 112;
    // a window sash seen from outside, in the rect x, y, w, h: frame, glass (dark inside, a band of sky at the top, the shadow of the head), meeting rail,
    // muntins, blinds or curtains; on = the same by lamplight, for the emissive map
    const sash = (g, x, y, w, h, o, on) => {
      const fx = w * (o.fx || 0.06), fy = h * (o.fy || 0.037), gx = x + fx, gy = y + fy, gw = w - 2 * fx, gh = h - 2 * fy, fr = on ? '#000' : o.dark ? '#33373a' : '#f3f1ea', gr = g.createLinearGradient(0, gy, 0, gy + gh);
      g.fillStyle = fr; g.fillRect(x, y, w, h);
      if (on) { gr.addColorStop(0, '#ffdf9c'); gr.addColorStop(1, '#f5a23e'); } else { gr.addColorStop(0, '#8ea6ba'); gr.addColorStop(0.3, '#42566a'); gr.addColorStop(1, '#10161c'); }
      g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
      if (o.curt) for (const k of [1, -1]) { const xa = k > 0 ? gx : gx + gw; g.fillStyle = on ? '#ffd28c' : '#cdc4b2'; g.beginPath(); g.moveTo(xa, gy); g.lineTo(xa + k * gw * 0.44, gy); g.quadraticCurveTo(xa + k * gw * 0.38, gy + gh * 0.5, xa + k * gw * 0.1, gy + gh * 0.68); g.lineTo(xa + k * gw * 0.15, gy + gh); g.lineTo(xa, gy + gh); g.fill(); }
      if (o.blind) { const bh = gh * o.blind; g.fillStyle = on ? '#ffe9b8' : '#d8d2c2'; g.fillRect(gx, gy, gw, bh); g.fillStyle = on ? 'rgba(120,60,0,0.22)' : 'rgba(0,0,0,0.15)'; for (let yy = gy + gh * 0.012; yy < gy + bh; yy += gh * 0.024) g.fillRect(gx, yy, gw, gh * 0.007); }
      if (!on) {
        g.fillStyle = 'rgba(205,225,245,0.1)'; g.beginPath(); g.moveTo(gx + gw * 0.1, gy + gh); g.lineTo(gx + gw * 0.55, gy); g.lineTo(gx + gw * 0.85, gy); g.lineTo(gx + gw * 0.4, gy + gh); g.fill();
        const sh = g.createLinearGradient(0, gy, 0, gy + gh * 0.1); sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(gx, gy, gw, gh * 0.1);
      }
      g.fillStyle = fr; const n = (o.rows || 1) * (o.rail ? 2 : 1);
      for (let c = 1; c < (o.cols || 1); c++) g.fillRect(gx + gw * c / o.cols - fx * 0.2, gy, fx * 0.4, gh);
      for (let q = 1; q < n; q++) { const rail = o.rail && q * 2 === n, t = fy * (rail ? 0.9 : 0.4); g.fillRect(gx, gy + gh * q / n - t / 2, gw, t); }
      if (o.arch) {      // the sash frame following the curve; the glass runs on into the corners (seen through the arched opening from below), unlit at night
        const ry = h * o.arch; if (on) { g.fillStyle = '#000'; g.beginPath(); g.rect(x, y, w, ry); g.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, 0); g.fill('evenodd'); }
        g.strokeStyle = fr; g.lineWidth = fx; g.beginPath(); g.ellipse(x + w / 2, y + ry, w / 2 - fx / 2, ry - fx / 2, 0, Math.PI, 0); g.stroke();
      }
    };
    const noiseOf = (n, seed) => canvasTex(n, n, (g) => { const q = mulberry(seed); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = q() * 255 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1); } }).image;
    const N128 = noiseOf(128, 5), N16 = noiseOf(16, 6);
    // Facade atlas: 4 x 4 tiles of 3.3 m of wall at 1024 px (512 on phones). Siding, metal, block and stone are light neutrals that the wall colour (vertex colour)
    // multiplies; brick carries its own red (the vertex colour only shifts it), so the mortar stays grey. Rows: 0 clapboard (window with shutters, window, plain,
    // paired window), 1 brick (arched window, window under a stone lintel, plain, shop front), 2 ribbed metal, plain block, block with a steel window, roll-up door,
    // 3 concrete, cut stone with an arched window, plain stone, the sash sheet (with a white patch for untextured faces).
    const atlas = canvasTex(1024 * S, 1024 * S, (g) => {
      const rn = mulberry(77), R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); }, V = (y, h, a) => { const q = g.createLinearGradient(0, y, 0, y + h); q.addColorStop(0, `rgba(0,0,0,${a})`); q.addColorStop(1, 'rgba(0,0,0,0)'); return q; };
      const tile = (c, rw, fn) => { tox = c * TS; toy = rw * TS; g.save(); g.setTransform(S, 0, 0, S, tox * S, toy * S); g.beginPath(); g.rect(0, 0, TS, TS); g.clip(); fn(); g.restore(); };
      const siding = () => {      // lap siding, 32 courses: the shadow of the board above at the top of each, its own lit butt edge at the bottom
        for (let y = 0; y < TS; y += 8) { const v = 219 + rn() * 9 | 0; R(0, y, TS, 8, `rgb(${v},${v},${v})`); R(0, y, TS, 2.4, V(y, 2.4, 0.42)); R(0, y + 7.3, TS, 0.7, 'rgba(255,255,255,0.4)'); R(rn() * TS, y + 1, 0.3, 6.6, 'rgba(0,0,0,0.22)'); }
      };
      const brick = () => {       // running bond, 16 x 48 bricks; joints struck back so each course throws a line of shadow
        R(0, 0, TS, TS, '#b3ab9d');
        for (let k = 0; k < 48; k++) for (let i = -1; i < 16; i++) {
          const x = i * 16 + (k % 2 ? 8 : 0), y = k * 16 / 3, v = rn() - 0.5, d = rn() < 0.07 ? 0.74 : 0.92 + 0.16 * rn();
          R(x + 0.4, y + 0.4, 15.2, 4.5, `rgb(${(146 + 26 * v) * d | 0},${(86 + 20 * v) * d | 0},${(68 + 12 * v) * d | 0})`); R(x + 0.4, y + 0.4, 15.2, 0.3, 'rgba(255,255,255,0.13)'); R(x + 0.4, y + 4.9, 15.2, 0.4, 'rgba(0,0,0,0.3)');
        }
      };
      const metal = () => {       // ribbed panel: a major rib every 0.275 m, two minor ribs between, screw rows
        R(0, 0, TS, TS, '#d8d8d6');
        for (let x = 0; x < TS; x += 64 / 3) { R(x, 0, 1.1, TS, 'rgba(255,255,255,0.45)'); R(x + 1.1, 0, 2.2, TS, 'rgba(255,255,255,0.14)'); R(x + 3.3, 0, 1.4, TS, 'rgba(0,0,0,0.3)'); for (const m of [9.6, 15.4]) { R(x + m, 0, 0.5, TS, 'rgba(255,255,255,0.2)'); R(x + m + 0.5, 0, 0.5, TS, 'rgba(0,0,0,0.13)'); } for (const y of [30, 158]) R(x + 1.7, y, 0.9, 0.9, 'rgba(0,0,0,0.3)'); }
        R(0, 0, TS, 0.6, 'rgba(0,0,0,0.16)');
      };
      const block = () => {       // concrete block, 8 x 16
        for (let k = 0; k < 16; k++) for (let i = -1; i < 8; i++) { const x = i * 32 + (k % 2 ? 16 : 0), y = k * 16, v = 208 + rn() * 14 | 0; R(x, y, 32, 16, `rgb(${v},${v},${v - 2})`); R(x, y, 32, 0.8, 'rgba(0,0,0,0.25)'); R(x, y + 0.8, 32, 0.4, 'rgba(255,255,255,0.2)'); R(x, y, 0.8, 16, 'rgba(0,0,0,0.2)'); }
      };
      const stone = () => {       // coursed limestone ashlar, 8 courses of blocks of uneven length
        for (let k = 0; k < 8; k++) { const y = k * 32; for (let x = -rn() * 60; x < TS;) { const w = 44 + rn() * 46, v = 216 + rn() * 16 | 0; R(x, y, w, 32, `rgb(${v},${v - 2},${v - 8})`); R(x, y, 0.7, 32, 'rgba(0,0,0,0.22)'); x += w; } R(0, y, TS, 0.7, 'rgba(0,0,0,0.26)'); R(0, y + 0.7, TS, 0.5, 'rgba(255,255,255,0.25)'); }
      };
      const streak = (x, y) => R(x, y, 2.6, 46, V(y, 46, 0.13));      // rain stain running down from the end of a sill
      // an opening in the wall: records the hole for the alpha map, paints the window flat inside it (what the far shells and the mip levels show)
      const hole = (wn, on) => { cut.push([tox + wn.x, toy + wn.y, wn.w, wn.h, wn.a || 0]); if (on) lit.push([tox + wn.x, toy + wn.y, wn.w, wn.h, wn.s, wn.pair]); if (wn.pair) { sash(g, wn.x, wn.y, wn.w / 2, wn.h, wn.s); sash(g, wn.x + wn.w / 2, wn.y, wn.w / 2, wn.h, wn.s); } else sash(g, wn.x, wn.y, wn.w, wn.h, wn.s); };
      const sillP = (wn, c) => { R(wn.x - 8, wn.y + wn.h, wn.w + 16, 4, c); R(wn.x - 8, wn.y + wn.h + 4, wn.w + 16, 7, V(wn.y + wn.h + 4, 7, 0.36)); streak(wn.x - 7, wn.y + wn.h + 4); streak(wn.x + wn.w + 4.4, wn.y + wn.h + 4); };
      const cased = (wn, shut) => {      // wood casing with a drip cap; louvred shutters
        if (shut) for (const sx of [wn.x - 34, wn.x + wn.w + 8]) { R(sx, wn.y - 5, 26, wn.h + 10, '#565b5f'); for (let yy = wn.y - 2; yy < wn.y + wn.h + 2; yy += 3.2) { R(sx + 3, yy, 20, 1.5, 'rgba(0,0,0,0.34)'); R(sx + 3, yy + 1.5, 20, 0.6, 'rgba(255,255,255,0.16)'); } R(sx + 26, wn.y - 5, 1, wn.h + 10, 'rgba(0,0,0,0.25)'); }
        R(wn.x - 7, wn.y - 8, wn.w + 14, wn.h + 8, '#f6f4ee'); R(wn.x - 8.5, wn.y - 9.6, wn.w + 17, 1.6, '#ffffff'); R(wn.x - 7, wn.y - 8, wn.w + 14, 1, 'rgba(0,0,0,0.25)'); R(wn.x + wn.w + 7, wn.y - 8, 0.8, wn.h + 8, 'rgba(0,0,0,0.22)'); sillP(wn, '#fbfaf6'); hole(wn, shut);
      };
      const arched = (wn, c, joint) => {      // ring of voussoirs (or cut stones with a keystone) over an arched opening
        const cx = wn.x + wn.w / 2, cy = wn.y + wn.a, r0 = wn.w / 2, r1 = r0 + 13;
        g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy, r1, r1, 0, Math.PI, 0); g.fill(); R(wn.x - 13, cy, wn.w + 26, 5, c);
        g.strokeStyle = joint; g.lineWidth = 0.7; g.beginPath(); for (let k = 1; k < 13; k++) { const a = Math.PI * (1 + k / 13); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); } g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(cx, cy, r1 + 0.4, r1 + 0.4, 0, Math.PI, 0); g.stroke(); sillP(wn, '#d8d2c4'); hole(wn, true);
      };
      const big = (n, c, r0, r1) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'overlay'; g.beginPath(); g.rect(0, r0 * 256 * S, 1024 * S, (r1 - r0) * 256 * S); g.clip(); g.globalAlpha = c; g.scale(n === N16 ? 16 * S : 1, n === N16 ? 16 * S : 1); g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, 1024 * S, 1024 * S); g.restore(); };
      tile(0, 0, () => { siding(); cased(WN[0], true); });
      tile(1, 0, () => { siding(); cased(WN[1]); });
      tile(2, 0, siding);
      tile(3, 0, () => { siding(); cased(WN[3]); });
      tile(0, 1, () => { brick(); const wn = WN[4]; arched(wn, '#e4dccb', 'rgba(0,0,0,0.3)'); R(wn.x + wn.w / 2 - 5, wn.y - 16, 10, 17, '#efe9dc'); R(wn.x + wn.w / 2 + 5, wn.y - 16, 0.7, 17, 'rgba(0,0,0,0.3)'); });
      tile(1, 1, () => { brick(); const wn = WN[5]; R(wn.x - 9, wn.y - 14, wn.w + 18, 14, '#d8d2c4'); R(wn.x - 9, wn.y - 14, wn.w + 18, 0.8, 'rgba(255,255,255,0.4)'); R(wn.x - 9, wn.y - 0.8, wn.w + 18, 0.8, 'rgba(0,0,0,0.25)'); sillP(wn, '#d8d2c4'); hole(wn); });
      tile(2, 1, brick);
      tile(3, 1, () => {       // shop front: pilasters, a sign frieze over the glass, a panelled bulkhead under it
        const wn = WN[7]; R(0, 0, TS, TS, '#dedad0'); R(0, 0, TS, 22, '#cfcabd'); R(0, 22, TS, 1.2, 'rgba(0,0,0,0.3)'); R(0, 40, TS, 10, '#e8e4da'); R(0, 50, TS, 1, 'rgba(0,0,0,0.3)'); R(0, 206, TS, 50, '#c9c4b7');
        for (let x = 30; x < 226; x += 50) { R(x, 214, 44, 34, 'rgba(0,0,0,0.1)'); R(x, 214, 44, 1, 'rgba(0,0,0,0.3)'); R(x, 247, 44, 1, 'rgba(255,255,255,0.35)'); } for (const x of [0, 242]) { R(x, 22, 14, 234, '#d5d0c3'); R(x ? x : 13.2, 22, 0.8, 234, 'rgba(0,0,0,0.25)'); } hole(wn, true);
      });
      tile(0, 2, metal);
      tile(1, 2, block);
      tile(2, 2, () => { block(); const wn = WN[10]; R(wn.x - 10, wn.y - 12, wn.w + 20, 12, '#bdbdbb'); R(wn.x - 10, wn.y - 0.8, wn.w + 20, 0.8, 'rgba(0,0,0,0.3)'); sillP(wn, '#c9c9c6'); hole(wn); });
      tile(3, 2, () => {       // sectional overhead door in a steel frame
        metal(); R(12, 44, 232, 212, '#8f9294'); R(18, 50, 220, 206, '#eeeeec'); for (let y = 50; y < 256; y += 41.2) { R(18, y, 220, 2.2, V(y, 2.2, 0.45)); R(18, y + 39.6, 220, 1.6, 'rgba(255,255,255,0.5)'); for (let x = 22; x < 230; x += 54) { R(x, y + 8, 50, 26, 'rgba(0,0,0,0.045)'); R(x, y + 8, 50, 0.8, 'rgba(0,0,0,0.18)'); } }
        for (let x = 32; x < 220; x += 52) sash(g, x, 98, 40, 22, { dark: 1, fx: 0.05, fy: 0.09 }); R(18, 50, 220, 5, V(50, 5, 0.4)); R(18, 252, 220, 4, '#2a2c2e');
      });
      tile(0, 3, () => {       // concrete (foundations: below px 70); its top 48 px the frieze of a bracketed cornice: crown moulding, a modillion every 64 px (0.8 m), bed moulding
        R(0, 0, TS, TS, '#c6c5c0'); R(0, 0, TS, 48, '#e9e6de'); R(0, 0, TS, 9, '#f8f6f0'); R(0, 9, TS, 2.5, 'rgba(0,0,0,0.45)'); R(0, 11.5, TS, 26.5, 'rgba(0,0,0,0.14)');
        for (let x = 6; x < TS; x += 64) { R(x, 11.5, 20, 26.5, '#f4f1ea'); R(x, 11.5, 20, 1.2, 'rgba(255,255,255,0.7)'); R(x + 20, 11.5, 7, 26.5, 'rgba(0,0,0,0.32)'); R(x, 36, 20, 2, 'rgba(0,0,0,0.25)'); }
        R(0, 38, TS, 3.5, '#f8f6f0'); R(0, 41.5, TS, 6.5, V(41.5, 6.5, 0.3));
      });
      tile(1, 3, () => { stone(); arched(WN[13], '#eae6da', 'rgba(0,0,0,0.3)'); const wn = WN[13]; R(wn.x + wn.w / 2 - 5, wn.y - 16, 10, 17, '#f1ede2'); R(wn.x + wn.w / 2 + 5, wn.y - 16, 0.7, 17, 'rgba(0,0,0,0.3)'); });
      tile(2, 3, stone);
      big(N16, 0.3, 0, 1); big(N16, 0.11, 1, 2); big(N16, 0.3, 2, 4); big(N128, 0.17, 0, 4);       // weathering: soft blotches (one tile wide, so plain tiles still repeat; much weaker on brick, where overlay bites hardest) and fine grain
      tile(3, 3, () => { R(0, 0, TS, TS, '#ffffff'); CELLS.forEach((o, k) => { const x = (k % 5) * CW, y = (k / 5 | 0) * CH; sash(g, x, y, CW, CH, o); if (k === 8) { g.globalAlpha = 0.12; sash(g, x, y, CW, CH, o, true); g.globalAlpha = 1; } });
        R(0, 225, 24, 30, '#f1efe8'); R(2.4, 227.4, 19.2, 25.2, '#3a3d3f'); for (let y = 227.4; y < 252; y += 2.8) { R(2.4, y + 1.2, 19.2, 1.6, '#dcd9d0'); R(2.4, y + 2.5, 19.2, 0.3, '#ffffff'); }      // louvred vent (gable ends, rooftop units)
      });
    });
    // holes in the walls (alpha map) and lamplight (emissive map): the lit window styles of the tiles, for the far shells, and the lit cells of the sash sheet
    const holeTex = canvasTex(GS, GS, (g) => { g.scale(GS / 1024, GS / 1024); g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 1024); g.fillStyle = '#000'; for (const [x, y, w, h, a] of cut) { g.fillRect(x, y + a, w, h - a); if (a) { g.beginPath(); g.ellipse(x + w / 2, y + a, w / 2, a, 0, Math.PI, 0); g.fill(); } } });
    const glowTex = canvasTex(GS, GS, (g) => { g.scale(GS / 1024, GS / 1024); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024); for (const [x, y, w, h, o, pair] of lit) { if (pair) { sash(g, x, y, w / 2, h, o, true); sash(g, x + w / 2, y, w / 2, h, o, true); } else sash(g, x, y, w, h, o, true); } for (const k of LITC) sash(g, 768 + (k % 5) * CW, 768 + (k / 5 | 0) * CH, CW, CH, CELLS[k], true); });
    // Roof texture, 4 m a repeat: 32 courses of three-tab shingles. Metal roofs read one column of it across the slope: each course becomes a panel, its shadow line a standing seam.
    const RT = small ? 512 : 1024, roofTex = canvasTex(RT, RT, (g) => {
      const rn = mulberry(31); g.scale(RT / 1024, RT / 1024); g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, 1024, 1024);
      for (let k = 0; k < 32; k++) { const y = k * 32; for (let x = (k % 2 ? -128 / 3 : 0); x < 1024; x += 256 / 3) { const v = 176 + rn() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1, y, 256 / 3 - 2, 32); } g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, y + 25, 1024, 2); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + 27, 1024, 5); }
      g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.3; g.fillStyle = g.createPattern(N128, 'repeat'); g.fillRect(0, 0, 1024, 1024); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#d2d2d2'; g.fillRect(0, 1016, 8, 8);
    }, true);
    const TUV = []; for (let k = 0; k < 16; k++) { const c = k & 3, rw = k >> 2, e = 3 / 1024; TUV.push([c / 4 + e, 1 - (rw + 1) / 4 + e, (c + 1) / 4 - e, 1 - rw / 4 - e]); }   // per tile [u0, v0 (bottom), u1, v1 (top)]
    const tuv = (c, rw) => TUV[c + 4 * rw], V2 = []; let v2n = 0; const T12 = TUV[12], FUV = [T12[0], T12[1], T12[2], T12[3] - (T12[3] - T12[1]) * 67 / 250], CORUV = [[T12[0], T12[3] - (T12[3] - T12[1]) * 45 / 250], [T12[2], T12[3] - (T12[3] - T12[1]) * 45 / 250], [T12[2], T12[3]], [T12[0], T12[3]]];
    const FLATUV = [0.875, 1 - 1008 / 1024], RFLAT = [3 / 1024, 3 / 1024], MSEAM = 64 / 3 / 1024;
    // house paint (white most often), brick as shifts of the red in the texture, stone, sheet metal, painted block; shingle and metal roof colours
    const SIDING = [0xf3f1e8, 0xf3f1e8, 0xf3f1e8, 0xece4c9, 0xece4c9, 0xe8d88e, 0xb5c0a0, 0xa9b8c6, 0xceb68d, 0x9a4a3a, 0xd0d1cc, 0xbba993, 0x8196a8].map(lin);
    const BRICK0 = lin(0x96604d), BRICK = [[1, 1, 1], [0.8, 0.78, 0.8], [1.14, 1.02, 0.94], [0.9, 0.76, 0.7], [0.74, 0.8, 0.86], [1.06, 0.9, 0.82]].map((c) => new T.Color(c[0], c[1], c[2]));
    const STONE = [0xd9d2c0, 0xcbbf9f, 0xbcb6a8].map(lin), METAL = [0xb5ada0, 0x9aa3a8, 0xc2b59b, 0x8b8f92, 0xd4d7d6, 0x7c8f7e, 0x8a4338].map(lin), BLOCK = [0xd8d4c8, 0xc4c6c4, 0xe6e2d6, 0xb8ad98].map(lin);
    const ROOF = [0x4a4744, 0x5b4636, 0x6b6e70, 0x4f2f29, 0x3e4a44, 0x55504a, 0x3a3836].map(lin), MROOF = [0xb4b8b9, 0xb4b8b9, 0x7a3229, 0x2f4a3a, 0x4a4d50, 0x5a4636, 0x8f999e].map(lin), FLATS = [0x77797a, 0x77797a, 0x8a8577, 0x565859, 0x9b9d9a, 0x6f6a62].map(lin), UNIT = lin(0x9fa5a7), FOUND = lin(0xa3a199);
    const pick = (a) => a[r() * a.length | 0];
    // downtown fronts, building by building and bay by bay along the long street walls: red, dark, purple-brown, tan or brown brick (shifts of the brick texture),
    // or a painted or limestone front on the stone tiles; arched or lintelled upper windows; a parapet raised 0-1 m; the cornice paint
    const DTB = [[1, 1, 1], [0.8, 0.78, 0.8], [0.74, 0.8, 0.86], [1.22, 1.3, 1.2], [0.9, 0.76, 0.7]].map((c) => new T.Color(c[0], c[1], c[2])), DTS = [0xd9d2c0, 0xcbbf9f, 0xeeece6, 0xe6dcc4, 0x6e8a74, 0x8e8e88, 0x93473c, 0x7d8e9a].map(lin);
    const CORN = [0xe2dccc, 0x2f4a3a, 0x4a3426, 0x8a8a84, 0xeeece6, 0x2a3540, 0x6b2a24].map(lin), H8 = (a, b, c) => hash2(a * 8 + c, b);
    const dtStyle = (s1, s2) => { const st = H8(s1, s2, 1) < 0.35, h = H8(s1, s2, 2), c = st ? tc.copy(DTS[h * DTS.length | 0]).multiplyScalar(1.14).clone() : DTB[h * DTB.length | 0], wf = st ? tc.copy(c).multiplyScalar(0.86).clone() : BRICK0.clone().multiply(c);
      return { st, wc: c, wf, trim: wf.clone().multiplyScalar(0.8), up: st ? 13 : H8(s1, s2, 3) < 0.6 ? 4 : 5, blank: st ? 14 : 6, ext: [0, 0, 0.5, 1][H8(s1, s2, 4) * 4 | 0], corn: CORN[H8(s1, s2, 5) * CORN.length | 0] }; };
    // 13 x 13 chunks of full detail (walls + roofs), shown within about 150 m; beyond that each building is a cheap shell in one of 6 x 6 far meshes
    const NC = 13, NS = 6, CS = 2 * HALF / NC, wallB = Array.from({ length: NC * NC }, Buf), roofB = Array.from({ length: NC * NC }, Buf), farB = Array.from({ length: NS * NS }, Buf), farI = Array.from({ length: NC * NC }, () => []); let b, rb, fb, fx;
    const FARP = [4.5 / 256, 1 - 4.5 / 1024];         // a plain texel of the far texture
    // far shell wall: from (x0, z0) to (x1, z1), flat bottom yb, top ya .. yc; u1 repeats of the two-window pattern in row `row` of the far texture, or plain when u1 is 0
    const fwall = (x0, z0, x1, z1, yb, ya, yc, col, u1, row) => {
      const v = fb.pos.length / 3, L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (z1 - z0) / L, nz = -(x1 - x0) / L, tri = ya - yb < 0.02 ? 1 : yc - yb < 0.02 ? 2 : 0, n = tri ? 3 : 4, v0 = 1 - (row + 1) / 8 + 0.004, v1 = 1 - row / 8 - 0.004;
      fb.pos.push(x0, yb, z0, x1, yb, z1); if (tri !== 2) fb.pos.push(x1, yc, z1); if (tri !== 1) fb.pos.push(x0, ya, z0);
      for (let k = 0; k < n; k++) { fb.nor.push(nx, 0, nz); fb.col.push(col.r, col.g, col.b); if (!u1) fb.uv.push(FARP[0], FARP[1]); }
      if (u1) fb.uv.push(0, v0, u1, v0, u1, v1, 0, v1);
      fx.push(v, v + 2, v + 1); if (!tri) fx.push(v, v + 3, v + 2);
    };
    // Wall piece in the vertical plane through (ax, az) along (ux, uz), outward normal (uz, 0, -ux): from t0 to t1, from height y0 up to ya (at t0)
    // .. yb (at t1). Atlas tile t, across its width fractions f0..f1, one tile per vh of height (taller pieces are cut into rows so no tile is stretched).
    const P2 = new Float64Array(12); let pn = 0, sY0 = 0, sY1 = 1, sB = 1, sT = 1, cL = 0, cA = 0, cB = 0;   // baked occlusion: shade sB at height sY0 .. sT at sY1, and cA / cB darker at the ends (t = 0, cL) of a wall in an inside corner
    const put = (t, y) => { if (pn && Math.abs(P2[2 * pn - 2] - t) < 1e-4 && Math.abs(P2[2 * pn - 1] - y) < 1e-4) return; P2[2 * pn] = t; P2[2 * pn + 1] = y; pn++; };
    const wallPiece = (ax, az, ux, uz, t0, t1, y0, ya, yb, col, t, f0, f1, vh) => {
      const top = Math.max(ya, yb), dt = t1 - t0;
      for (let yr = y0; yr < top - 0.015; yr += vh) {
        const yt = yr + vh; let tL = t0, tR = t1;
        if (ya < yr) tL = t0 + dt * (yr - ya) / (yb - ya); else if (yb < yr) tR = t0 + dt * (yr - ya) / (yb - ya);
        const hL = ya + (yb - ya) * (tL - t0) / dt, hR = ya + (yb - ya) * (tR - t0) / dt;
        pn = 0; put(tL, yr); put(tR, yr); put(tR, Math.min(hR, yt)); if ((hL - yt) * (hR - yt) < 0) put(tL + (tR - tL) * (yt - hL) / (hR - hL), yt); put(tL, Math.min(hL, yt));
        if (pn > 2 && Math.abs(P2[0] - P2[2 * pn - 2]) < 1e-4 && Math.abs(P2[1] - P2[2 * pn - 1]) < 1e-4) pn--;
        if (pn < 3) continue;
        const v = b.pos.length / 3;
        for (let k = 0; k < pn; k++) { const tt = P2[2 * k], y = P2[2 * k + 1], f = f0 + (f1 - f0) * (tt - t0) / dt; b.pos.push(ax + ux * tt, y, az + uz * tt); const s = (sB + (sT - sB) * clamp((y - sY0) / (sY1 - sY0), 0, 1)) * (1 - (tt < 0.02 ? cA : tt > cL - 0.02 ? cB : 0)); b.nor.push(uz, 0, -ux); b.col.push(col.r * s, col.g * s, col.b * s); b.uv.push(t[0] + (t[2] - t[0]) * f, t[1] + (t[3] - t[1]) * (y - yr) / vh); }
        for (let k = 1; k < pn - 1; k++) b.idx.push(v, v + k + 1, v + k);
      }
    };
    // the same between tA and tB, cut at every tile width tw so the plain tile repeats instead of stretching
    const fillCols = (ax, az, ux, uz, tA, tB, y0, hA, hB, col, t, tw) => {
      if (tB - tA < 0.01 || Math.max(hA, hB) - y0 < 0.03) return;
      for (let i = Math.floor(tA / tw + 1e-6); i * tw < tB - 1e-6; i++) {
        const s0 = Math.max(tA, i * tw), s1 = Math.min(tB, (i + 1) * tw); if (s1 - s0 < 0.005) continue;
        wallPiece(ax, az, ux, uz, s0, s1, y0, hA + (hB - hA) * (s0 - tA) / (tB - tA), hA + (hB - hA) * (s1 - tA) / (tB - tA), col, t, s0 / tw - i, s1 / tw - i, 3.3);
      }
    };
    // flat polygon P ([x, y, z] corners) into buffer o, wound to face (wx, wy, wz); uv = one [u, v] for all corners or one per corner
    const face = (o, P, wx, wy, wz, col, uv) => {
      const v = o.pos.length / 3, p = P[0], q = P[1], s = P[P.length - 1], ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = s[0] - p[0], by = s[1] - p[1], bz = s[2] - p[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const flip = nx * wx + ny * wy + nz * wz < 0, il = (flip ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1); nx *= il; ny *= il; nz *= il;
      for (let k = 0; k < P.length; k++) { const u = uv.length === 2 ? uv : uv[k]; o.pos.push(P[k][0], P[k][1], P[k][2]); o.nor.push(nx, ny, nz); o.col.push(col.r, col.g, col.b); o.uv.push(u[0], u[1]); }
      for (let k = 1; k < P.length - 1; k++) o.idx.push(v, v + (flip ? k + 1 : k), v + (flip ? k : k + 1));
    };
    // A window in the opening of facade tile tl, whose wall piece starts at t0 along the wall through (ax, az) and is tw wide: the sash (cell
    // c of the sash sheet; a pair shows two cells) set DEPTH back, the reveals, and the bottom one run out into a sill SILL proud of the wall (landmarks.js
    // lays door casings 4 cm and shop fronts 5 cm in front of the wall, over whatever window is there: nothing here may stand further out).
    const DEPTH = 0.13, SILL = 0.035, WHITE = new T.Color(0.95, 0.95, 0.93), CUV = [];
    for (let k = 0; k < 10; k++) { const x = 768 + (k % 5) * CW, y = 768 + (k / 5 | 0) * CH; CUV.push([(x + 1) / 1024, 1 - (y + CH - 1) / 1024, (x + CW - 1) / 1024, 1 - (y + 1) / 1024]); }
    const win = (ax, az, ux, uz, t0, tw, yT, p0, sv, tl, c, trim, sillC, ylo = -1e9) => {      // the tile's pixel row p0 is at height yT, sv metres a pixel down from there; sill no lower than ylo
      const wn = WN[tl], ta = t0 + tw * (wn.x - 3) / 250, tb = t0 + tw * (wn.x + wn.w - 3) / 250, yb = yT - (wn.y - p0) * sv, ya = Math.max(ylo, yT - (wn.y + wn.h - p0) * sv), u = CUV[c], u1 = wn.pair ? CUV[c + 1][2] : u[2];
      const P = (t, y, o) => [ax + ux * t + uz * o, y, az + uz * t - ux * o], D = -DEPTH, so = wn.sill ? SILL : 0, sw = wn.sill ? 0.045 : 0;
      face(b, [P(ta, ya, D), P(tb, ya, D), P(tb, yb, D), P(ta, yb, D)], uz, 0, -ux, WHITE, [[u[0], u[1]], [u1, u[1]], [u1, u[3]], [u[0], u[3]]]);
      face(b, [P(ta, ya, D), P(ta, ya, 0), P(ta, yb, 0), P(ta, yb, D)], ux, 0, uz, trim, FLATUV); face(b, [P(tb, ya, D), P(tb, ya, 0), P(tb, yb, 0), P(tb, yb, D)], -ux, 0, -uz, trim, FLATUV);
      face(b, [P(ta, yb, D), P(tb, yb, D), P(tb, yb, 0), P(ta, yb, 0)], 0, -1, 0, tc.copy(trim).multiplyScalar(0.55), FLATUV);
      face(b, [P(ta - sw, ya, D), P(tb + sw, ya, D), P(tb + sw, ya, so), P(ta - sw, ya, so)], 0, 1, 0, sillC, FLATUV);
      if (so) face(b, [P(ta - sw, ya - 0.055, so), P(tb + sw, ya - 0.055, so), P(tb + sw, ya, so), P(ta - sw, ya, so)], uz, 0, -ux, sillC, FLATUV);
    };
    const VENTUV = [[768.5 / 1024, 1 - 1022.5 / 1024], [791.5 / 1024, 1 - 1022.5 / 1024], [791.5 / 1024, 1 - 993.5 / 1024], [768.5 / 1024, 1 - 993.5 / 1024]], CAPW = 0.15, UP = [];   // the louvred vent cell; half width of a ridge cap; rooftop unit positions
    // box into the wall buffer: centre (x, z), half sizes hx along (dx, dz) and hz across, from y0 to y1 (no bottom)
    const box = (x, z, dx, dz, hx, hz, y0, y1, col) => {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [x + dx * hx * i - dz * hz * j, z + dz * hx * i + dx * hz * j]);
      face(b, c.map((p) => [p[0], y1, p[1]]), 0, 1, 0, col, FLATUV);
      for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; face(b, [[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], (p[0] + q[0]) / 2 - x, 0, (p[1] + q[1]) / 2 - z, col, FLATUV); }
    };
    // a bracketed cornice along a wall from tA to tB: the frieze of tile 12 on its face PRJ out, top at y, 0.5 m deep; soffit, top and ends plain
    const cornice = (ax, az, ux, uz, tA, tB, y, col) => {
      const P = (t, yy, o) => [ax + ux * t + uz * o, yy, az + uz * t - ux * o], o = 0.3, y0 = y - 0.5, n = Math.max(1, Math.round((tB - tA) / 1.6));
      for (let q = 0; q < n; q++) { const s0 = tA + (tB - tA) * q / n, s1 = tA + (tB - tA) * (q + 1) / n; face(b, [P(s0, y0, o), P(s1, y0, o), P(s1, y, o), P(s0, y, o)], uz, 0, -ux, col, CORUV); }
      face(b, [P(tA, y, 0), P(tB, y, 0), P(tB, y, o), P(tA, y, o)], 0, 1, 0, col, FLATUV); face(b, [P(tA, y0, 0), P(tB, y0, 0), P(tB, y0, o), P(tA, y0, o)], 0, -1, 0, tc.copy(col).multiplyScalar(0.6), FLATUV);
      face(b, [P(tA, y0, 0), P(tA, y0, o), P(tA, y, o), P(tA, y, 0)], -ux, 0, -uz, col, FLATUV); face(b, [P(tB, y0, 0), P(tB, y0, o), P(tB, y, o), P(tB, y, 0)], ux, 0, uz, col, FLATUV);
    };
    const TRIM = lin(0xe6e2d6), SOFFIT = lin(0xb9b5aa), CURB = lin(0x5e6061), OV = 0.35, FASCIA = 0.16, PARW = 0.28;   // eave overhang, fascia depth, parapet thickness (m)
    const pip = (R, X, Z) => { let c = false; for (let i = 0, n = R.length, j = n - 2; i < n; j = i, i += 2) if ((R[i + 1] > Z) !== (R[j + 1] > Z) && X < (R[j] - R[i]) * (Z - R[i + 1]) / (R[j + 1] - R[i + 1]) + R[i]) c = !c; return c; };
    const roofY = (F, X, Z) => { for (let i = 0; i < F.length; i++) { const f = F[i], R = f.R; if (!pip(R[0], X, Z)) continue; let hole = false; for (let k = 1; k < R.length; k++) if (pip(R[k], X, Z)) { hole = true; break; } if (!hole) return f.c + f.a * X + f.b * Z; } return null; };
    const roofData = b64u8(DT.roofs);   // per footprint, from lidar: eave height x10, roof rise x10, type (0 flat, 1 ridge along the long side, 2 ridge across it, 3 hip)
    // roofs.js, per footprint: u16 facet count, i16 origin x, y (0.1 m, map frame), then per facet i16 slope dz/dx, dz/dy (x 4096), i16 height above the
    // footprint's ground level at the origin (cm), u8 ring count, per ring u16 n and n x (i16 x, i16 y) cm from the origin (ring 0 outline, others holes)
    const RD = window.BLOOMFIELD_ROOFS, dv = RD && RD.data ? new DataView(b64u8(RD.data).buffer) : null, vmap = new Map(), twin = new Map(), own = new Set(), VX = [], VZ = []; let off = 0;
    // churches and schools by their real names (M.places): the place goes to the nearest footprint within 30 m, as landmarks.js signs it
    const civ = new Map(), ringD = (P, x, y) => { if (pip(P, x, y)) return 0; let d = 1e9; for (let i = 0, n = P.length, j = n - 2; i < n; j = i, i += 2) { const ax = P[j], ay = P[j + 1], dx = P[i] - ax, dy = P[i + 1] - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); d = Math.min(d, Math.hypot(ax + dx * t - x, ay + dy * t - y)); } return d; };
    for (const [x, y, n] of M.places) { const k = /church|chapel|baptist/i.test(n) ? 'church' : /school/i.test(n) ? 'school' : ''; let bi = -1, bd = 30; if (k) M.buildings.forEach((q, i) => { const d = ringD(q.p, x, y); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) civ.set(bi, k); }
    const junk = Buf();
    for (let bi = 0; bi < M.buildings.length; bi++) {
      const bd = M.buildings[bi];
      let pts = []; for (let k = 0; k < bd.p.length; k += 2) pts.push([bd.p[k], -bd.p[k + 1]]);
      let A = 0; for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
      if (A < 0) pts.reverse(); A = Math.abs(A) / 2;
      let lo = 1e9, hi = -1e9, cx = 0, cz = 0, hm = 0; for (const p of pts) { const h = hAt(p[0], p[1]); lo = Math.min(lo, h); hi = Math.max(hi, h); hm += h / pts.length; cx += p[0] / pts.length; cz += p[1] / pts.length; }
      // facets: plane y = c + a X + b Z (world), rings of indices into this building's vertex table VX, VZ (shared between neighbouring facets)
      const F = [], nf = dv ? dv.getUint16(off, true) : 0; off += 2; VX.length = VZ.length = 0; vmap.clear(); twin.clear();
      if (nf) {
        const ox = dv.getInt16(off, true) / 10, oy = dv.getInt16(off + 2, true) / 10; off += 4;
        for (let f = 0; f < nf; f++) {
          const a = dv.getInt16(off, true) / 4096, bb = dv.getInt16(off + 2, true) / 4096, c = dv.getInt16(off + 4, true) / 100, nr = dv.getUint8(off + 6), rings = []; off += 7;
          for (let q = 0; q < nr; q++) {
            const n = dv.getUint16(off, true), ring = []; off += 2;
            for (let k = 0; k < n; k++, off += 4) { const px = dv.getInt16(off, true), py = dv.getInt16(off + 2, true), key = (px + 32768) * 65536 + py + 32768; let id = vmap.get(key); if (id === undefined) { id = VX.length; vmap.set(key, id); VX.push(ox + px / 100); VZ.push(-oy - py / 100); } ring.push(id); }
            rings.push(ring);
          }
          F.push({ a, b: -bb, c: hm + c - a * ox - bb * oy, s: Math.hypot(a, bb), rings, R: null, r0: [] });
        }
      }
      // tightest bounding rectangle (only its area is used now: how box-like the footprint is)
      let best = 0, bdx = 1, bdz = 0; for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1) continue; const dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const s of pts) { const u = s[0] * dx + s[1] * dz, v = -s[0] * dz + s[1] * dx; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); } const ar = (a1 - a0) * (b1 - b0); if (!best || ar < best) { best = ar; bdx = dx; bdz = dz; } }
      if (!best) continue;
      const ci = clamp((cx + HALF) / CS | 0, 0, NC - 1), cj = clamp((cz + HALF) / CS | 0, 0, NC - 1), ch = cj * NC + ci; b = wallB[ch]; rb = roofB[ch]; fb = farB[(cj * NS / NC | 0) * NS + (ci * NS / NC | 0)]; fx = farI[ch];
      if (B.heroSkip && B.heroSkip.has(bi)) { b = junk; rb = junk; fb = junk; fx = junk.idx; }   // a hero (heroes.js) draws this footprint: the shell is built as usual (same random sequence, record, walls) into a buffer that is thrown away
      const ia = (k) => M.areas.some((a) => a.k === k && pip(a.p, cx, -cz)), school = civ.get(bi) === 'school' || (A > 300 && ia('school')), church = civ.get(bi) === 'church', ind = ia('industrial') || ia('commercial');
      const court = bd.n.indexOf('Courthouse') >= 0, downtown = Math.hypot(cx, cz) < 200 && A > 110;      // L- and T-plan houses are houses too (no boxiness test under 300 m2)
      const house = !court && !downtown && !school && !church && !ind && A < 430 && A > 45 && (A < 300 || A / best > 0.7), shed = !court && !house && !downtown && A < 45;
      const eave = roofData[3 * bi] / 10, rt0 = eave ? roofData[3 * bi + 2] : 0;      // eave 0 = the lidar saw no building here (newer than the 2017 scan)
      const guessH = eave || (house ? Math.max(bd.h, 3) : downtown ? Math.max(bd.h, 6.8 + r() * 2.2) : shed ? 2.6 : Math.max(bd.h, 4.4));
      const metalB = !court && !house && !downtown && !shed && !school && !church && (A > 900 || ind || r() < 0.5);
      // material family: 0 lap siding, 1 brick, 2 ribbed metal, 3 cut stone, 4 painted block
      const dts = downtown && !church && !court ? dtStyle(bi, 0) : null, fam = dts ? (dts.st ? 3 : 1) : court || school ? 1 : church ? (hash2(bi, 3) < 0.35 ? 3 : 1) : house ? (hash2(bi, 3) < 0.13 ? 1 : 0) : shed ? (hash2(bi, 3) < 0.5 ? 2 : 0) : downtown ? (hash2(bi, 3) < 0.22 ? 3 : 1) : metalB ? 2 : hash2(bi, 3) < 0.4 ? 4 : 1;
      const paint = court ? BRICK[0] : dts ? (dts.st ? tc.copy(dts.wc).multiplyScalar(1 / 1.14).clone() : dts.wc) : pick(fam === 0 ? SIDING : fam === 1 ? BRICK : fam === 2 ? METAL : fam === 3 ? STONE : BLOCK), wall = fam === 1 ? BRICK0.clone().multiply(paint) : paint;
      const hadRoof = house || (eave && rt0 && roofData[3 * bi + 1] >= 5);      // the old one-roof model drew a pitched roof here: keeps the random sequence, so wall colours stay as they were
      // wc multiplies the facade tiles, wf is the same wall seen plain (far shells without a texture), trim the window reveals, sill the sills
      const wc = fam === 1 ? paint : tc.copy(wall).multiplyScalar(1.14).clone(), wf = fam === 1 ? wall : tc.copy(wc).multiplyScalar(0.86).clone(), trim = fam ? tc.copy(wf).multiplyScalar(0.8).clone() : TRIM, sillC = fam === 1 || fam === 3 ? STONE[0] : fam ? wf : WHITE;
      const metalR = !court && (shed ? hash2(bi, 7) < 0.7 : metalB ? true : hash2(bi, 7) < (house ? 0.12 : 0.3));      // standing-seam metal roof
      let rc = court ? lin(0x6d7478) : tc.copy(hadRoof || shed ? pick(ROOF) : ROOF[hash2(bi, 9) * ROOF.length | 0]).multiplyScalar(1.15).clone(); if (metalR) rc = tc.copy(MROOF[hash2(bi, 8) * MROOF.length | 0]).multiplyScalar(1.1).clone();
      let floorY = Math.max(hm + 0.2, hi - 0.6);   // ground floor near the average ground level: on a slope the uphill side sits a little into the bank
      if (!F.length) { const ring = pts.map((p, k) => { VX.push(p[0]); VZ.push(p[1]); return k; }).reverse(); F.push({ a: 0, b: 0, c: floorY + guessH, s: 0, rings: [ring], R: null, r0: [] }); }   // no roofs.js: flat cap
      const par = house || shed ? 0 : 0.45, blankT = [2, 6, 8, 14, 9][fam], blank = TUV[blankT], storey = court ? 4.4 : church ? 6.5 : school ? 3.6 : 3.1;
      // heights: each facet's plane at its corners, welded where neighbours agree within 0.2 m (1 m between two sloped facets), so ridges, hips and valleys are shared lines and only real level changes get a step wall
      const HY = twin, hs = []; HY.clear();
      for (let fi = 0; fi < F.length; fi++) for (const ring of F[fi].rings) for (const id of ring) (hs[id] || (hs[id] = [])).push([F[fi].c + F[fi].a * VX[id] + F[fi].b * VZ[id], fi]);
      for (let id = 0; id < hs.length; id++) { const l = hs[id]; if (!l) continue; l.sort((p, q) => p[0] - q[0]); for (let i = 0, j; i < l.length; i = j) { let sum = l[i][0]; for (j = i + 1; j < l.length && l[j][0] - l[j - 1][0] < (F[l[j][1]].s >= 0.09 && F[l[j - 1][1]].s >= 0.09 ? 1 : 0.2); j++) sum += l[j][0]; for (let k = i; k < j; k++) HY.set(l[k][1] * 8192 + id, sum / (j - i)); } }
      const hy = (fi, id) => HY.get(fi * 8192 + id), edge = vmap; edge.clear();
      for (let fi = 0; fi < F.length; fi++) for (const ring of F[fi].rings) for (let k = 0; k < ring.length; k++) edge.set(ring[k] * 8192 + ring[(k + 1) % ring.length], fi);
      // roofs; outline edges (no twin) are collected for the walls, edges between facets of different height get a step wall
      const outl = [], caps = [], units = [], stepW = [], flatC = FLATS[hash2(bi, 13) * FLATS.length | 0]; let ridge = -1e9, slopedA = 0;   // flat roofs: grey or black membrane, gravel ballast. ponytail: one colour per flat facet, no gravel or seam texture; a tile of their own in the roof texture if the camera ever looks down on them for long
      for (let fi = 0; fi < F.length; fi++) {
        v2n = 0; const f = F[fi], flat = f.s < 0.03, low = f.s < 0.09, pf = flat || (downtown && !church && !court && f.s < 0.2) ? par : 0, v0 = rb.pos.length / 3, fv0 = fb.pos.length / 3, il = 1 / Math.hypot(f.a, 1, f.b), sh = [], holes = [];
        const col = low ? tc.copy(shed || house ? rc : flatC).multiplyScalar(0.93 + 0.14 * hash2(bi, fi)).clone() : rc, ex = low ? 0 : -f.b / f.s, ez = low ? 0 : f.a / f.s, vs = Math.sqrt(1 + f.s * f.s) / (f.s || 1);
        f.col = col; f.uv = (X, Z, o, i) => { const e = (X - cx) * ex + (Z - cz) * ez; o[i] = low ? RFLAT[0] : metalR ? MSEAM : e / 4; o[i + 1] = low ? RFLAT[1] : metalR ? e / 12.8 : ((X - cx) * f.a + (Z - cz) * f.b) * vs / 4; };   // shingle courses run along the eave, 4 m per repeat; metal: a seam every 0.4 m, running up the slope
        f.R = f.rings.map((ring, q) => {
          const o = [], cont = q ? (holes.push([]), holes[q - 1]) : sh, r0 = rb.pos.length / 3, n = ring.length; f.r0.push(r0);
          for (let k = 0; k < n; k++) {
            const a = ring[k], bq = ring[(k + 1) % n], pv = ring[(k + n - 1) % n], X = VX[a], Z = VZ[a], Y = hy(fi, a), g = edge.get(bq * 8192 + a); o.push(X, Z); ridge = Math.max(ridge, Y);
            // a corner that sits on a straight edge is nudged 0.2 mm into the facet for the triangulation only, so earcut keeps it and neighbours meet vertex to vertex (no pinholes)
            const dX = VX[bq] - VX[pv], dZ = VZ[bq] - VZ[pv], dl = Math.hypot(dX, dZ) || 1, co = Math.abs((X - VX[pv]) * dZ - (Z - VZ[pv]) * dX) < 0.002 * dl ? 2e-4 / dl : 0; cont.push((V2[v2n] || (V2[v2n] = new T.Vector2())).set(X + dZ * co, Z - dX * co)); v2n++;
            rb.pos.push(X, Y, Z); rb.nor.push(-f.a * il, il, -f.b * il); rb.col.push(col.r, col.g, col.b); f.uv(X, Z, rb.uv, rb.uv.length);
            fb.pos.push(X, Y, Z); fb.nor.push(-f.a * il, il, -f.b * il); fb.col.push(col.r, col.g, col.b); fb.uv.push(FARP[0], FARP[1]);
            const X1 = VX[bq], Z1 = VZ[bq], L = Math.hypot(X - X1, Z - Z1); if (L < 0.005) continue;
            // the wall under this edge runs from bq to a (outward normal on the right-hand side of the facet's counter-clockwise outline)
            if (g === undefined) outl.push({ s: bq, e: a, x: X1, z: Z1, x1: X, z1: Z, ux: (X - X1) / L, uz: (Z - Z1) / L, L, h0: hy(fi, bq), h1: Y, pf, f, i0: r0 + (k + 1) % n, i1: r0 + k, ov: !pf, ax: 0, az: 0, ya: 0, bx: 0, bz: 0, yb: 0 });
            else {                                     // a step up from the neighbour: a wall in the plain tile, or just a grey curb where a flat roof changes level by less than a metre
              const g0 = hy(g, bq), g1 = hy(g, a), t0 = hy(fi, bq), d = Math.max(t0 - g0, Y - g1);
              if (d < 0.02) { if (g > fi && !low && F[g].s >= 0.09 && L > 0.5 && g0 - t0 < 0.02 && g1 - Y < 0.02 && (f.a - F[g].a) * (Z - Z1) + (f.b - F[g].b) * (X1 - X) > 0.15 * L) caps.push(r0 + (k + 1) % n, r0 + k, fi, g); continue; }   // a ridge or hip (the roof falls away on both sides): gets a cap
              const lo2 = Math.min(g0, g1), ta = Math.max(t0, g0), tb = Math.max(Y, g1), curb = low && d < 1;
              if (curb) face(b, [[X1, g0, Z1], [X, g1, Z], [X, tb, Z], [X1, ta, Z1]], (Z - Z1) / L, 0, (X1 - X) / L, CURB, FLATUV); else if (Math.min(ta, tb) - lo2 > 2.5 && L >= 3 && Math.abs(g0 - g1) < 0.3) stepW.push(X1, Z1, (X - X1) / L, (Z - Z1) / L, L, lo2, ta, tb); else fillCols(X1, Z1, (X - X1) / L, (Z - Z1) / L, 0, L, lo2, ta, tb, wc, blank, 3.3);
              if (d > 0.4) fwall(X1, Z1, X, Z, lo2, ta, tb, curb ? CURB : wf, 0, 0);
            }
          }
          return o;
        });
        const tris = T.ShapeUtils.triangulateShape(sh, holes), all = holes.length ? sh.concat(...holes) : sh; let ar = 0;
        for (const t of tris) { const p = all[t[0]], q = all[t[1]], s = all[t[2]], cr = (q.y - p.y) * (s.x - p.x) - (q.x - p.x) * (s.y - p.y), i1 = cr > 0 ? t[1] : t[2], i2 = cr > 0 ? t[2] : t[1]; ar += Math.abs(cr); rb.idx.push(v0 + t[0], v0 + i1, v0 + i2); fx.push(fv0 + t[0], fv0 + i1, fv0 + i2); }
        if (!low) slopedA += ar / 2; else if (!house && !shed && ar > 180) units.push(fi, ar / 2);
      }
      // chain the outline edges into loops and cut them into straight runs with a continuous top
      const runs = [], next = vmap, moved = twin; next.clear(); moved.clear(); own.clear(); outl.forEach((e, i) => { next.set(e.s, i); own.add(e.i0); own.add(e.i1); });
      const brk = (e, f) => e.ux * f.ux + e.uz * f.uz < 0.9985 || Math.abs(e.h1 + e.pf - f.h0 - f.pf) > 0.3;
      for (let i0 = 0; i0 < outl.length; i0++) {
        if (outl[i0].done) continue; const loop = [];
        for (let i = i0; i !== undefined && !outl[i].done; i = next.get(outl[i].e)) { outl[i].done = 1; loop.push(outl[i]); }
        const n = loop.length; let s = 0; for (let k = 0; k < n; k++) if (brk(loop[(k + n - 1) % n], loop[k])) { s = k; break; }
        let run = null; const rs0 = runs.length; for (let k = 0; k < n; k++) { const e = loop[(s + k) % n]; if (!run || brk(run[run.length - 1], e)) runs.push(run = []); run.push(e); }
        for (let q = rs0; q < runs.length; q++) { runs[q].pv = runs[q > rs0 ? q - 1 : runs.length - 1]; runs[q].nx = runs[q + 1 < runs.length ? q + 1 : rs0]; }   // neighbours round the outline: inside and outside corners
        // Eaves: roofs without a parapet reach OV beyond the wall (their outline corners are moved out along the mitre, in the roof's own plane) with a fascia
        // board and a soffit; flat roofs get a parapet with a cap and an inner face, mitred the same way. One strip per straight stretch of a facet.
        for (let k = 0; k < n; k++) {
          const e = loop[k], ep = loop[(k + n - 1) % n], en = loop[(k + 1) % n], f = e.f, w = e.ov ? (shed ? 0.2 : OV) : -PARW;
          for (let side = 0; side < 2; side++) {
            const o = side ? en : ep, d = 1 + e.ux * o.ux + e.uz * o.uz, join = (e.ov ? o.ov : !o.ov) && Math.abs(side ? o.h0 - e.h1 : o.h1 - e.h0) < 0.3 && d > 0.3;
            const mx = join ? (e.uz + o.uz) * w / d : e.uz * w, mz = join ? -(e.ux + o.ux) * w / d : -e.ux * w, X = (side ? e.x1 : e.x) + mx, Z = (side ? e.z1 : e.z) + mz, Y = (side ? e.h1 : e.h0) + (e.ov ? f.a * mx + f.b * mz : e.pf);
            if (side) { e.bx = X; e.bz = Z; e.yb = Y; } else { e.ax = X; e.az = Z; e.ya = Y; }
            if (e.ov) { const i = side ? e.i1 : e.i0; rb.pos[3 * i] = X; rb.pos[3 * i + 1] = Y; rb.pos[3 * i + 2] = Z; f.uv(X, Z, rb.uv, 2 * i); if (!side) moved.set(e.s, e); }
          }
        }
        for (let k = 0, m; k < n; k += m) {
          const e = loop[(s + k) % n]; m = 1; while (k + m < n && loop[(s + k + m) % n].f === e.f && loop[(s + k + m) % n].ux * e.ux + loop[(s + k + m) % n].uz * e.uz > 0.9995) m++;
          const l = loop[(s + k + m - 1) % n];
          if (e.ov) {
            const sa = Math.min(e.ya, e.h0) - FASCIA, sb = Math.min(l.yb, l.h1) - FASCIA;
            face(rb, [[e.ax, e.ya, e.az], [l.bx, l.yb, l.bz], [l.bx, sb, l.bz], [e.ax, sa, e.az]], e.uz, 0, -e.ux, TRIM, RFLAT);
            face(rb, [[e.x, sa, e.z], [l.x1, sb, l.z1], [l.bx, sb, l.bz], [e.ax, sa, e.az]], 0, -1, 0, SOFFIT, RFLAT);
            const en = loop[(s + k + m) % n], D = (d, o, y) => [l.x1 + l.ux * d + l.uz * o, y, l.z1 + l.uz * d - l.ux * o];      // the fascia doubles as the gutter; a downspout runs down the outside corner at the end of a level eave
            if (!shed && !metalB && Math.abs(e.h0 - l.h1) < 0.15 && l.ux * en.uz - l.uz * en.ux > 0.5 && Math.hypot(l.x1 - e.x, l.z1 - e.z) > 3) {
              const g = hAt(l.x1, l.z1) - 0.1; face(b, [D(-0.2, 0.11, g), D(-0.12, 0.11, g), D(-0.12, 0.11, sb), D(-0.2, 0.11, sb)], l.uz, 0, -l.ux, TRIM, FLATUV);
              face(b, [D(-0.2, 0.03, g), D(-0.2, 0.11, g), D(-0.2, 0.11, sb), D(-0.2, 0.03, sb)], -l.ux, 0, -l.uz, TRIM, FLATUV); face(b, [D(-0.12, 0.03, g), D(-0.12, 0.11, g), D(-0.12, 0.11, sb), D(-0.12, 0.03, sb)], l.ux, 0, l.uz, TRIM, FLATUV);
            }
          } else {
            face(b, [[e.x, e.ya, e.z], [l.x1, l.yb, l.z1], [l.bx, l.yb, l.bz], [e.ax, e.ya, e.az]], 0, 1, 0, TRIM, FLATUV);
            face(b, [[e.ax, e.ya, e.az], [l.bx, l.yb, l.bz], [l.bx, l.h1, l.bz], [e.ax, e.h0, e.az]], -e.uz, 0, e.ux, CURB, FLATUV);
            fillCols(e.x, e.z, e.ux, e.uz, 0, Math.hypot(l.x1 - e.x, l.z1 - e.z), Math.min(e.h0, l.h1), e.ya, l.yb, wc, blank, 3.3);
          }
        }
      }
      // a facet that only touches the outline with a corner follows the eave there, or a sliver would open next to it
      if (moved.size) for (const f of F) f.rings.forEach((ring, q) => ring.forEach((id, k) => {
        const e = moved.get(id), i = f.r0[q] + k; if (!e || own.has(i)) return;
        rb.pos[3 * i] = e.ax; rb.pos[3 * i + 1] += f.a * (e.ax - VX[id]) + f.b * (e.az - VZ[id]); rb.pos[3 * i + 2] = e.az; f.uv(e.ax, e.az, rb.uv, 2 * i);
      }));
      // ridge and hip caps: a strip of cap shingles (courses across the ridge) or folded metal lying 3 cm proud on both slopes, out to the rake edges
      for (let q = 0; q < caps.length; q += 4) {
        const i0 = 3 * caps[q], i1 = 3 * caps[q + 1], f = F[caps[q + 2]], G = F[caps[q + 3]], p = rb.pos, X0 = p[i0], Y0 = p[i0 + 1] + 0.03, Z0 = p[i0 + 2], X1 = p[i1], Y1 = p[i1 + 1] + 0.03, Z1 = p[i1 + 2];
        const L = Math.hypot(X1 - X0, Z1 - Z0) || 1, ox = (Z1 - Z0) / L * CAPW, oz = (X0 - X1) / L * CAPW, df = f.a * ox + f.b * oz, dg = G.a * ox + G.b * oz, cc = tc.copy(rc).multiplyScalar(metalR ? 1.12 : 0.8).clone(), uv = metalR ? RFLAT : [[0.052, 0], [0.052, L / 4], [0.074, L / 4], [0.074, 0]];
        face(rb, [[X0, Y0, Z0], [X1, Y1, Z1], [X1 - ox, Y1 - df, Z1 - oz], [X0 - ox, Y0 - df, Z0 - oz]], 0, 1, 0, cc, uv);
        face(rb, [[X0, Y0, Z0], [X1, Y1, Z1], [X1 + ox, Y1 + dg, Z1 + oz], [X0 + ox, Y0 + dg, Z0 + oz]], 0, 1, 0, cc, uv);
      }
      // the larger flat commercial roofs: packaged air-handling units with louvred sides, and a couple of exhaust vents, set back from the parapet
      // ponytail: scattered by hash inside the facet (the lidar roofs.js keeps no rooftop objects), near detail only; read them from the point cloud in build_roofs.py if they must be the real ones
      for (let q = 0, m = 0; q < units.length; q += 2, m = 0) {
        const fi = units[q], f = F[fi], R0 = f.R[0], n = Math.min(4, 1 + (units[q + 1] / 300 | 0)), ins = (X, Z) => { if (!pip(R0, X, Z)) return false; for (let k = 1; k < f.R.length; k++) if (pip(f.R[k], X, Z)) return false; return true; };
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < R0.length; k += 2) { x0 = Math.min(x0, R0[k]); x1 = Math.max(x1, R0[k]); z0 = Math.min(z0, R0[k + 1]); z1 = Math.max(z1, R0[k + 1]); }
        for (let t = 0; t < 24 && m < n + 2; t++) {
          const X = x0 + (x1 - x0) * hash2(bi * 31 + fi, 2 * t + 1), Z = z0 + (z1 - z0) * hash2(bi * 31 + fi, 2 * t + 2), y = f.c + f.a * X + f.b * Z; let free = ins(X + 2.2, Z + 2.2) && ins(X - 2.2, Z + 2.2) && ins(X + 2.2, Z - 2.2) && ins(X - 2.2, Z - 2.2);
          for (let k = 0; free && k < m; k++) if (Math.hypot(X - UP[2 * k], Z - UP[2 * k + 1]) < 4.5) free = false;
          if (!free) continue; UP[2 * m] = X; UP[2 * m + 1] = Z;
          if (m++ < n) { box(X, Z, bdx, bdz, 1.25, 0.8, y, y + 1.3, UNIT); for (const o of [0.81, -0.81]) face(b, [-0.75, 0.75, 0.75, -0.75].map((u, k) => [X + bdx * u - bdz * o, y + (k < 2 ? 0.3 : 1.05), Z + bdz * u + bdx * o]), -bdz * o, 0, bdx * o, WHITE, VENTUV); }
          else box(X, Z, bdx, bdz, 0.32, 0.32, y, y + 0.55, tc.copy(UNIT).multiplyScalar(0.7).clone());
        }
      }
      const shut = hash2(bi, 5) < 0.5, six = hash2(bi, 11) < 0.3, door = shed || metalB ? runs.reduce((m, run, k) => { const L = run.reduce((s, e) => s + e.L, 0); return L > m[1] ? [k, L] : m; }, [-1, 0])[0] : -1;
      const farRow = court || (church && fam === 1) ? 2 : fam === 3 ? 4 : house ? (fam ? 3 : 0) : downtown ? 1 : shed || metalB || fam === 4 ? -1 : 3;   // far texture row: house windows, shop fronts (arched windows above), arched brick, brick block, arched stone
      const tileAt = (k, i, j, nt, ok) => {      // which facade tile goes where: column + 4 * row in the atlas
        const h = hash2(bi * 131 + k * 17 + i, j * 7 + 3);
        if (shed) return k === door && A > 18 && i === (nt >> 1) ? 11 : blankT;
        if (metalB) return k === door && j === 0 && i === (nt >> 1) && A > 250 ? 11 : 8;
        if (!ok) return blankT;                        // a window would come out squashed or stretched here
        if (court) return 4;
        if (church) return j < 0 ? (fam === 3 ? 14 : 5) : fam === 3 ? 13 : 4;           // one tall arched window a bay, plain windows in a basement storey
        if (school) return h < 0.15 ? 6 : 5;
        if (dts) return h < 0.12 ? blankT : j === 0 ? 7 : j < 0 ? blankT : dts.up;
        const fr = (eaves[k] || 0)[4] > 0.7, pb = !house ? 0.3 : fr ? 0.1 : (eaves[k] || 0)[4] < -0.7 ? 0.65 : 0.45;      // houses: most windows on the street front, fewest on the back
        if (fam === 1) return h < pb ? 6 : 5;
        if (fam === 4) return h < 0.4 ? 9 : 10;
        return h < pb ? 2 : !fr && h > 0.93 && h < 1 ? 3 : shut ? 0 : 1;
      };
      // which sash a window shows: a house keeps one muntin pattern, blinds and curtains vary from window to window
      const cellAt = (tl, h) => tl === 4 || tl === 13 ? (h < 0.35 ? 6 : 5) : tl === 7 ? (h < 0.4 ? 8 : 7) : tl === 10 ? 9 : tl === 3 ? h * 4 | 0 : h < 0.2 ? 1 : h < 0.35 ? 3 : h < 0.5 ? 4 : six ? 2 : 0;
      // each run: its eave (the lowest roof edge over it), its length, and how far out its face looks onto a street (the 2 m mask: roadway or gravel road)
      let corn = false; const eaves = runs.map((run) => {
        const e0 = run[0], e1 = run[run.length - 1], L = Math.hypot(e1.x1 - e0.x, e1.z1 - e0.z); let He = 1e9, st = 99; for (const e of run) He = Math.min(He, e.h0, e.h1);
        if (L > 3) { const nx = (e1.z1 - e0.z) / L, nz = (e0.x - e1.x1) / L, mx = (e0.x + e1.x1) / 2, mz = (e0.z + e1.z1) / 2; for (let d = 2; d < 40; d += 2) { const m = W.maskAt(mx + nx * d, mz + nz * d); if (m === 4 && d < 4) break; if (m === 1 || m === 2) { st = d - Math.min(L, 14) * 0.5; break; } } }
        return [He, L, st, L > 0.03 ? Math.atan2(e0.x - e1.x1, e1.z1 - e0.z) : 0, 0];
      });
      { let fN = null, bs = 25; for (const e of eaves) if (e[2] < bs) { bs = e[2]; fN = e[3]; } if (fN !== null) for (const e of eaves) e[4] = Math.cos(e[3] - fN); }      // [4]: 1 facing the same way as the street front, -1 its back
      // the record's eave: the level half the outline (by length) reaches; a flat-roofed block publishes the parapet line of its street front instead (landmarks.js hangs its cornice there)
      let acc = 0, top = floorY + guessH; const half = eaves.reduce((s, e) => s + e[1], 0) / 2, roof = slopedA > 0.3 * A ? rt0 || 1 : 0;
      for (const e of eaves.slice().sort((p, q) => p[0] - q[0])) { acc += e[1]; if (acc >= half) { top = e[0]; break; } }
      if (!roof && !house && !shed) { let bs = 99; for (const e of eaves) if (e[2] < bs) { bs = e[2]; top = e[0]; } }
      if (house) floorY = Math.max(lo + 0.1, Math.min(floorY, top - 2.45));   // the lidar eave is the drip edge: lower the floor so a ranch house still gets a whole storey
      // walls: whole facade tiles up to the lowest roof edge over each run, the plain tile of the same style above that (gable ends, lean-to sides)
      runs.forEach((run, k) => {
        const e0 = run[0], e1 = run[run.length - 1], dx = e1.x1 - e0.x, dz = e1.z1 - e0.z, L = Math.hypot(dx, dz); if (L < 0.03) return;
        const ux = dx / L, uz = dz / L; let He = 1e9, Hx = -1e9, gr = 1e9; for (const e of run) { He = Math.min(He, e.h0, e.h1); Hx = Math.max(Hx, e.h0, e.h1); }
        for (let s = 0, ds = L / Math.ceil(L / 4); s <= L + 0.01; s += ds) gr = Math.min(gr, hAt(e0.x + ux * s, e0.z + uz * s));      // lowest ground under the run
        const fl = Math.min(floorY, Math.max(gr + 0.15, He - 2.6)), under = e0.ov && Hx - He < 0.4; He = Math.max(He - fl, 0.3);      // fl: this run's own floor, lowered (never below its ground) where a low wing or the slope would leave it no storey; under: a level eave shades the top of this wall
        const nt = L < 2.2 || He < 1.7 ? 0 : Math.max(1, Math.round(L / 3.3)), tw = nt ? L / nt : 3.3, rows = []; let crop = -1;
        // storeys as [bottom above the floor, height]: downtown a tall shop floor under tall upper floors, churches one tall storey, others ~storey m each;
        // a low single storey shows its tiles cut at their true 3.3 m scale from tile pixel `crop` down (window heads ~0.3 m under the eave) instead of squashed
        if (downtown && !church) { if (He < 5.6) rows.push([0, Math.min(He, 4.6)]); else { const g0 = Math.min(clamp(0.5 * He, 3.8, 4.6), He - 2.35), n = Math.ceil((He - g0) / 4.4), fu = (He - g0) / n; rows.push([0, g0]); for (let q = 0; q < n; q++) rows.push([g0 + q * fu, fu]); } }
        else { const n = Math.max(1, Math.round(He / storey)), fmax = church ? 6.5 : court ? 99 : 4.1, fh = He / n <= fmax ? He / n : church ? 6.5 : 3.1; for (let q = 0; q < n; q++) rows.push([q * fh, fh]); }
        if (rows.length === 1 && He >= 2.2 && He < 3.3 && !downtown && !church) { const pb = 253 - 8 * Math.ceil((250 - (Math.min(0.45, 3.3 - He) + He) * 250 / 3.3) / 8 - 1e-6); crop = pb - He * 250 / 3.3; }   // the floor on a siding course: courses line up from run to run
        const f0 = clamp(rows[0][1], 2.6, 3.3), lowN = nt && rows[0][1] >= 2.3 ? Math.max(0, Math.ceil((fl - gr - 1.8) / f0)) : 0; for (let q = 1; q <= lowN; q++) rows.unshift([-q * f0, f0]);   // ground falling away under the run: storeys below the floor (a walk-out or lower level) instead of a tall foundation
        if (lowN) crop = -1;
        const base = fl + rows[0][0], rt = rows[rows.length - 1][0] + rows[rows.length - 1][1], ok = tw >= 2.5 && tw <= 4.4 && (crop >= 0 || rows[rows.length - 1][1] >= 2.3);
        const front = eaves[k][2] < 25, bays = dts && front && !e0.ov && nt >= 3 ? [] : null;      // a long downtown street front: a row of narrow fronts, 2-3 tiles each
        if (bays) for (let i = 0, q = 0; i < nt; q++) { const rem = nt - i, n = rem <= 3 ? rem : rem === 4 ? 2 : H8(bi * 64 + k, q, 6) < 0.5 ? 2 : 3, o = dtStyle(bi * 64 + k, q + 1); for (let m = 0; m < n; m++) bays.push(o); i += n; }
        const pv = run.pv[run.pv.length - 1], nx = run.nx[0], vexA = pv.ux * uz - pv.uz * ux, vexB = ux * nx.uz - uz * nx.ux, P = (t, y, o) => [e0.x + ux * t + uz * o, y, e0.z + uz * t - ux * o];
        cL = L; cA = vexA < -0.5 ? 0.24 : 0; cB = vexB < -0.5 ? 0.24 : 0; sY0 = lo - 0.6; sY1 = base; sB = 0.6; sT = 1;
        if (base > lo - 0.6) wallPiece(e0.x, e0.z, ux, uz, 0, L, lo - 0.6, base, base, FOUND, FUV, 0, 1, base - lo + 0.6);
        sY0 = base; sY1 = fl + He; sB = 0.9; sT = under ? 0.72 : 0.95;
        if (!nt) fillCols(e0.x, e0.z, ux, uz, 0, L, base, fl + He, fl + He, wc, blank, 3.3);
        else for (let i = 0; i < nt; i++) rows.forEach(([yo, fh], jj) => {
          const bay = bays && bays[i], j = jj - lowN, tl = bay && ok ? (j === 0 ? 7 : j < 0 ? bay.blank : bay.up) : tileAt(k, i, j, nt, ok), y0 = fl + yo, h = hash2(bi * 57 + k * 13 + i, j + 91), T0 = TUV[tl], cv = T0[3] - T0[1];
          // a cut tile whose window would come down near the ground: plain wall below a sill 0.8 m up, the opening shortened to match
          const vAt = (U, y) => U[3] - (U[3] - U[1]) * (crop - 3 + (y0 + fh - y) * 250 / 3.3) / 250, wn = crop >= 0 && WN[tl], yS = wn && fh - (wn.y + wn.h - crop) * 3.3 / 250 < 0.8 ? Math.min(y0 + 0.8, y0 + fh - (wn.y - crop) * 3.3 / 250 - 0.7) : y0;
          if (yS > y0 + 0.01) wallPiece(e0.x, e0.z, ux, uz, i * tw, (i + 1) * tw, y0, yS, yS, wc, [TUV[blankT][0], vAt(TUV[blankT], y0), TUV[blankT][2], vAt(TUV[blankT], yS)], 0, 1, yS - y0);
          wallPiece(e0.x, e0.z, ux, uz, i * tw, (i + 1) * tw, yS, y0 + fh, y0 + fh, bay ? bay.wc : wc, crop < 0 ? T0 : [T0[0], vAt(T0, yS), T0[2], vAt(T0, y0 + fh)], 0, 1, y0 + fh - yS);
          if (WN[tl]) win(e0.x, e0.z, ux, uz, i * tw, tw, y0 + fh, crop < 0 ? 3 : crop, (crop < 0 ? fh : 3.3) / 250, tl, cellAt(tl, h), bay ? bay.trim : trim, sillC, yS);
          else if (metalB && tl === 8 && !j && ok && h < 0.25) { const u = CUV[9], ta = (i + 0.36) * tw, tb = (i + 0.64) * tw; face(b, [P(ta, y0 + 1.95, 0.015), P(tb, y0 + 1.95, 0.015), P(tb, y0 + 2.55, 0.015), P(ta, y0 + 2.55, 0.015)], uz, 0, -ux, WHITE, [[u[0], u[1]], [u[2], u[1]], [u[2], u[3]], [u[0], u[3]]]); }   // small high window, flush in the sheeting
        });
        if (nt && He - rt > 0.01) for (let i = 0; i < nt; i++) fillCols(e0.x, e0.z, ux, uz, i * tw, (i + 1) * tw, fl + rt, fl + He, fl + He, bays ? bays[i].wc : wc, bays ? TUV[bays[i].blank] : blank, tw);
        if (dts && front && !e0.ov && L > 2.5) {      // a cornice along the street front's parapet; a bay may raise its parapet first
          // the parapet top between ta and tb (the run steps and slopes): the cornice hangs from the lowest point, so it never floats
          const ptop = (ta, tb) => { let lo = 1e9, hi = -1e9; for (const e of run) { const tA = (e.x - e0.x) * ux + (e.z - e0.z) * uz, s0 = Math.max(ta, tA), s1 = Math.min(tb, tA + e.L); if (s1 - s0 < 0.01) continue; for (const s of [s0, s1]) { const y = e.h0 + (e.h1 - e.h0) * (s - tA) / e.L + e.pf; lo = Math.min(lo, y); hi = Math.max(hi, y); } } return [lo, hi]; };
          corn = true;
          if (!bays) cornice(e0.x, e0.z, ux, uz, 0, L, ptop(0, L)[0] + 0.04, dts.corn);
          else for (let i = 0, m; i < nt; i = m) {
            const o = bays[i]; for (m = i; m < nt && bays[m] === o; m++); const ta = i * tw, tb = m * tw, [lo, hi] = ptop(ta, tb), y1 = o.ext ? hi + o.ext : lo, Q = (t, y, q) => P(t, y, q > 0 ? 0.015 : q);
            if (o.ext) { fillCols(e0.x + uz * 0.015, e0.z - ux * 0.015, ux, uz, ta, tb, fl + He, y1, y1, o.wc, TUV[o.blank], 3.3); face(b, [Q(ta, y1, -PARW), Q(tb, y1, -PARW), Q(tb, y1, 1), Q(ta, y1, 1)], 0, 1, 0, TRIM, FLATUV); face(b, [Q(ta, lo, -PARW), Q(tb, lo, -PARW), Q(tb, y1, -PARW), Q(ta, y1, -PARW)], -uz, 0, ux, CURB, FLATUV); face(b, [Q(ta, lo, -PARW), Q(ta, lo, 1), Q(ta, y1, 1), Q(ta, y1, -PARW)], -ux, 0, -uz, o.wf, FLATUV); face(b, [Q(tb, lo, -PARW), Q(tb, lo, 1), Q(tb, y1, 1), Q(tb, y1, -PARW)], ux, 0, uz, o.wf, FLATUV); }   // raised from the wall top up, 15 mm proud of the parapet behind it
            cornice(e0.x, e0.z, ux, uz, ta, tb, y1 + 0.04, o.corn);
          }
        }
        sY0 = fl + He; sY1 = Math.max(Hx, sY0 + 0.5); sB = sT; sT = e0.ov ? 0.74 : 0.95;
        for (const e of run) if (Math.max(e.h0, e.h1) - fl - He > 0.08) { const tA = (e.x - e0.x) * ux + (e.z - e0.z) * uz; fillCols(e0.x, e0.z, ux, uz, tA, tA + e.L, fl + He, e.h0, e.h1, wc, blank, tw); if (Math.max(e.h0, e.h1) + e.pf - fl - He > 0.3) fwall(e.x, e.z, e.x1, e.z1, fl + He, e.h0 + e.pf, e.h1 + e.pf, wf, 0, 0); }
        sB = sT = 1; cA = cB = 0;
        if (!shed && !metalB && !court) for (let q = 0; q + 1 < run.length; q++) {      // louvred vent under the peak of a gable end
          const e = run[q], o = run[q + 1], sl = Math.max((e.h1 - e.h0) / e.L, (o.h0 - o.h1) / o.L), yt = e.h1 - Math.max(0.5, 0.33 * sl + 0.12), tP = (e.x1 - e0.x) * ux + (e.z1 - e0.z) * uz;
          if (e.ov && o.ov && e.h1 > Hx - 0.05 && e.h1 - e.h0 > 0.3 && o.h0 - o.h1 > 0.3 && yt - 0.56 > fl + He + 0.15) face(b, [P(tP - 0.21, yt - 0.56, 0.02), P(tP + 0.21, yt - 0.56, 0.02), P(tP + 0.21, yt, 0.02), P(tP - 0.21, yt, 0.02)], uz, 0, -ux, WHITE, VENTUV);
        }
        if (!nt || farRow < 0 || !ok) fwall(e0.x, e0.z, e1.x1, e1.z1, lo - 0.6, fl + He, fl + He, wf, 0, 0);
        else { rows.forEach(([yo, fh], jj) => fwall(e0.x, e0.z, e1.x1, e1.z1, jj ? fl + yo : lo - 0.6, fl + yo + fh, fl + yo + fh, wc, nt / 2, farRow === 1 && jj > lowN ? (fam === 3 ? 4 : 2) : farRow)); if (He - rt > 0.01) fwall(e0.x, e0.z, e1.x1, e1.z1, fl + rt, fl + He, fl + He, wf, 0, 0); }
        if (house && !fam) {                             // corner boards on sided houses
          if (vexA > 0.5) face(b, [P(-0.02, base, 0.02), P(0.11, base, 0.02), P(0.11, e0.h0, 0.02), P(-0.02, e0.h0, 0.02)], uz, 0, -ux, TRIM, FLATUV);
          if (vexB > 0.5) face(b, [P(L - 0.11, base, 0.02), P(L + 0.02, base, 0.02), P(L + 0.02, e1.h1, 0.02), P(L - 0.11, e1.h1, 0.02)], uz, 0, -ux, TRIM, FLATUV);
        }
      });
      // a tall step between roof levels is laid out like an outside wall: whole window tiles from the lower roof up, the plain tile above
      for (let q = 0; q < stepW.length; q += 8) {
        const [ax, az, ux, uz, L, y0, ya, yb] = stepW.slice(q, q + 8), H = Math.min(ya, yb) - y0, nt = Math.max(1, Math.round(L / 3.3)), tw = L / nt, n = Math.max(1, Math.round(H / storey)), fh = H / n, ok = tw >= 2.5 && tw <= 4.4 && fh >= 2.3 && fh <= 4.4 && !shed && !metalB;
        if (ok) for (let i = 0; i < nt; i++) for (let j = 0; j < n; j++) { const tl = tileAt(-1, i, j + 1, nt, true), y = y0 + fh * j; wallPiece(ax, az, ux, uz, i * tw, (i + 1) * tw, y, y + fh, y + fh, wc, TUV[tl], 0, 1, fh); if (WN[tl]) win(ax, az, ux, uz, i * tw, tw, y + fh, 3, fh / 250, tl, cellAt(tl, hash2(bi * 59 + q, i * 7 + j)), trim, sillC); }
        fillCols(ax, az, ux, uz, 0, L, ok ? y0 + H : y0, ya, yb, wc, blank, ok ? tw : 3.3);
      }
      for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 0.05) segs.push(p[0], p[1], q[0], q[1]); }
      top = Math.max(top, floorY + 1);
      W.buildings.push({ pts, cx, cz, area: A, floorY, top, wallH: top - floorY, ridge: Math.max(ridge, top), roof, cornice: corn, name: bd.n, fp: bi, kind: court ? 'court' : house ? 'house' : downtown ? 'downtown' : shed ? 'shed' : 'block', wall, roofAt: (X, Z) => roofY(F, X, Z) });
    }
    const wallMat = new T.MeshLambertMaterial({ vertexColors: true, map: atlas, alphaMap: holeTex, alphaTest: 0.5, emissiveMap: glowTex, emissive: new T.Color(0, 0, 0) }), roofMat = new T.MeshLambertMaterial({ vertexColors: true, map: roofTex });
    // far shells: a strip of window pairs per wall style (rows: house, shop front, arched brick, brick block, courthouse) that repeats along the wall; the rest is vertex colour
    const far8 = (src) => canvasTex(256, 1024, (g) => { const n = src.width / 4; [[0, 1], [7, 7], [4, 4], [5, 6], [13, 13]].forEach((row, r) => row.forEach((t, c) => g.drawImage(src, (t & 3) * n, (t >> 2) * n, n, n, c * 128, r * 128, 128, 128))); }, true);
    const farMat = new T.MeshLambertMaterial({ vertexColors: true, map: far8(atlas.image), emissiveMap: far8(glowTex.image), emissive: new T.Color(0, 0, 0) });
    W.windowGlow = (v) => { wallMat.emissive.setScalar(v); farMat.emissive.setScalar(v); };
    const near = [], state = new Uint8Array(NC * NC), fars = [], dirty = new Uint8Array(NS * NS);
    for (let c = 0; c < NC * NC; c++) { near.push([]); for (const [buf, mat] of [[wallB[c], wallMat], [roofB[c], roofMat]]) if (buf.idx.length) { const m = new T.Mesh(bufGeo(buf), mat); m.castShadow = m.receiveShadow = true; m.visible = false; m.name = 'buildings'; scene.add(m); near[c].push(m); } }
    for (let q = 0; q < NS * NS; q++) {              // a far mesh keeps its indices grouped by chunk, so the chunks shown in detail can be left out
      const chunks = [], start = [], buf = farB[q]; for (let c = 0; c < NC * NC; c++) if (((c / NC | 0) * NS / NC | 0) * NS + (c % NC * NS / NC | 0) === q && farI[c].length) { chunks.push(c); start.push(buf.idx.length); for (const i of farI[c]) buf.idx.push(i); }
      if (!chunks.length) { fars.push(null); continue; }
      const geo = bufGeo(buf), m = new T.Mesh(geo, farMat); m.name = 'buildings-far'; scene.add(m); fars.push({ m, geo, chunks, start, all: geo.index.array.slice() });
    }
    const R0 = 150, R1 = 175;                        // a chunk gets its detail when the camera is within R0 of it and keeps it out to R1
    W.animated.push((t, dt, cam) => {
      const px = cam.position.x, pz = cam.position.z; let any = 0;
      for (let c = 0; c < NC * NC; c++) {
        if (!near[c].length) continue;
        const x0 = (c % NC) * CS - HALF, z0 = (c / NC | 0) * CS - HALF, dx = Math.max(x0 - px, 0, px - x0 - CS), dz = Math.max(z0 - pz, 0, pz - z0 - CS), r = state[c] ? R1 : R0, on = dx * dx + dz * dz < r * r ? 1 : 0;
        if (on !== state[c]) { state[c] = on; for (let k = 0; k < near[c].length; k++) near[c][k].visible = !!on; any = dirty[((c / NC | 0) * NS / NC | 0) * NS + (c % NC * NS / NC | 0)] = 1; }
      }
      for (let q = 0; any && q < NS * NS; q++) {
        const F = fars[q]; if (!dirty[q]) continue; dirty[q] = 0; if (!F) continue; const idx = F.geo.index; let n = 0;
        for (let k = 0; k < F.chunks.length; k++) if (!state[F.chunks[k]]) { const a = F.start[k], e = k + 1 < F.start.length ? F.start[k + 1] : F.all.length; idx.array.set(F.all.subarray(a, e), n); n += e - a; }
        idx.needsUpdate = true; F.geo.setDrawRange(0, n); F.m.visible = n > 0;
      }
    });
  };
})();
