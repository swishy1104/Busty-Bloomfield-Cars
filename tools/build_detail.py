"""Derive measured town detail from the lidar rasters (tools/fetch_lidar.py) for the game:
  terrain.png  2.5 m bare-earth heights (16 bit packed in R,G)
  ground.png   1 m ground map from laser reflectance: R = paved amount, G = shade (asphalt..concrete, or lawn brightness)
  detail.js    per-building roof shape, every tree (position, height, crown, evergreen), measured street widths
Usage: python3 build_detail.py <lidar_dir> <map.js> <out_dir>
Rasters are [row 0 = north, col 0 = west], 1 m cells, local frame x east / y north of the courthouse."""
import sys, json, math, base64, struct
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

LD, MAPJS, OUT = sys.argv[1:4]
N, HALF = 4100, 2050
d = np.load(LD + "/lidar_1m.npz")
M = json.loads(open(MAPJS).read()[len("window.BLOOMFIELD="):-1])
cover = np.kron(np.frombuffer(base64.b64decode(M["cover"]), np.uint8).reshape(411, 411)[:410, :410], np.ones((10, 10), np.uint8))


def raster(polys, value=255, lines=False, widths=None):
    im = Image.new("L", (N, N), 0); dr = ImageDraw.Draw(im)
    for k, p in enumerate(polys):
        pts = [(x + HALF, HALF - y) for x, y in zip(p[::2], p[1::2])]
        if lines: dr.line(pts, fill=value, width=max(1, int(round(widths[k]))))
        else: dr.polygon(pts, fill=value)
    return np.asarray(im) > 0


bmask = raster([b["p"] for b in M["buildings"]])
wmask = raster([w["p"] for w in M["water"]]) | (d["c9"] > 0)
paved_roads = [r for r in M["roads"] if not r["g"]]
rmask = raster([r["p"] for r in paved_roads], lines=True, widths=[r["w"] for r in paved_roads])

# ---- align lidar to the OpenStreetMap frame (a metre or so of datum/digitising offset): best overlap of roofs and footprints
nd0 = np.clip(np.where(d["dsm"] > -1e8, d["dsm"] - d["dtm"], 0), 0, 60)
roofs = (nd0 > 2.2) & (d["multi"] <= 1)
best = max(((np.roll(np.roll(roofs, dy, 0), dx, 1) & bmask).sum(), dx, dy) for dy in range(-4, 5) for dx in range(-4, 5))
SX, SY = best[1], best[2]
print("lidar shift to match footprints: cols", SX, "rows", SY)
sh = lambda a: np.roll(np.roll(a, SY, 0), SX, 1)
dtm = sh(d["dtm"]); nd = sh(nd0); cnt = sh(d["cnt"]); gcnt = sh(d["gcnt"]); gcnt1 = sh(d["gcnt1"]); isum1 = sh(d["isum1"]); multi = sh(d["multi"])
wmask |= sh(d["c9"] > 0)

# ---- terrain: 2.5 m nodes from the 1 m bare-earth model
TS = 2.5; TN = int(2 * HALF / TS) + 1
sm = ndi.gaussian_filter(dtm, 0.8)
node = np.arange(TN) * TS - 0.5                                   # node x = -HALF + i*TS  ->  raster index x + HALF - 0.5
rr, cc = np.meshgrid(node, node, indexing="ij")
terr = ndi.map_coordinates(sm, [rr, cc], order=1, mode="nearest")
BASE = 140.0; q = np.clip(np.round((terr - BASE) / 0.02), 0, 65535).astype(np.uint16)
Image.fromarray(np.stack([q >> 8, q & 255, np.zeros_like(q)], -1).astype(np.uint8)).save(OUT + "/terrain.png", optimize=True)
print("terrain", TN, float(terr.min()), float(terr.max()))

# ---- ground map from single-return ground reflectance (near-infrared: asphalt dark, concrete mid, grass bright)
I = np.where(gcnt1 > 0, isum1 / np.maximum(gcnt1, 1), np.nan)
valid = ~np.isnan(I)
for _ in range(8):                                                # grow values into small holes (under eaves, cars, dense crowns)
    hole = np.isnan(I)
    if not hole.any(): break
    f = np.nan_to_num(I); w = (~hole).astype(np.float32)
    s = ndi.uniform_filter(f, 3) ; ws = ndi.uniform_filter(w, 3)
    I = np.where(hole & (ws > 0), s / np.maximum(ws, 1e-6), I)
I = np.nan_to_num(I, nan=38000.0)
I = ndi.median_filter(I, 3)
near_road = ndi.binary_dilation(rmask, iterations=14); near_bld = ndi.binary_dilation(bmask, iterations=30)
allowed = (nd < 0.5) & ~wmask & ~bmask & ((cover == 50) | (cover == 30) & (near_road | near_bld) | near_road | near_bld & (cover != 40))
p = np.clip((34000 - I) / 3000, 0, 1) * allowed
p = ndi.gaussian_filter(p.astype(np.float32), 0.6)
lab, n = ndi.label(p > 0.5)                                       # drop specks smaller than a parking space
sizes = ndi.sum(np.ones_like(lab), lab, np.arange(1, n + 1)); small = np.isin(lab, np.nonzero(sizes < 14)[0] + 1)
p[small] = 0
p = np.maximum(p, ndi.gaussian_filter(rmask.astype(np.float32), 0.8) * 0)   # vector roads draw their own ribbons
shade_p = np.clip((I - 9000) / 24000, 0, 1); shade_n = np.clip((I - 30000) / 15000, 0, 1)
# pavement keeps its fine shade; open ground only needs broad light/dark patches (keeps the PNG small)
shade = np.where(p > 0.5, ndi.gaussian_filter(shade_p.astype(np.float32), 0.7), np.round(ndi.gaussian_filter(shade_n.astype(np.float32), 2.5) * 7) / 7)
G0 = 2                                                            # ground.png covers +-2048 m at 1 m per pixel
R8 = (np.round(p[G0:G0 + 4096, G0:G0 + 4096] * 5) * 51).astype(np.uint8)
G8 = (np.round(shade[G0:G0 + 4096, G0:G0 + 4096] * 15) * 17).astype(np.uint8)
Image.fromarray(np.stack([R8, G8, np.zeros_like(R8)], -1)).save(OUT + "/ground.png", optimize=True)
paved = p > 0.5
print("paved fraction", float(paved.mean()), "of which outside vector roads", float((paved & ~rmask).sum() / max(1, paved.sum())))

# ---- measured street widths: scan across each road in the pavement map
widths = []
for r in M["roads"]:
    pts = np.array(r["p"], np.float64).reshape(-1, 2); seg = np.diff(pts, axis=0); L = np.hypot(seg[:, 0], seg[:, 1]); tot = L.sum()
    meas = []
    if not r["g"] and r["c"] != "track" and tot > 40:
        s = 15.0
        while s < tot - 15:
            k = int(np.searchsorted(np.cumsum(L), s)); t = (s - (np.cumsum(L)[k] - L[k])) / L[k]
            c = pts[k] + seg[k] * t; nrm = np.array([-seg[k][1], seg[k][0]]) / L[k]; side = []
            for sg in (1, -1):
                run, miss = 0, 0
                for j in range(1, 15):
                    x, y = c + nrm * sg * j; ci, ri = int(x + HALF), int(HALF - y)
                    if not (0 <= ci < N and 0 <= ri < N): break
                    if paved[ri, ci] or rmask[ri, ci] and j <= 2: run, miss = j, 0
                    else:
                        miss += 1
                        if miss >= 2: break
                side.append(run)
            meas.append(side[0] + side[1] + 1); s += 5
    w = r["w"]
    if len(meas) >= 6:
        mw = float(np.median(meas)); lo = 2.6 if r["c"] in ("service", "unknown") else 0.8 * w
        cap = {"primary": 16, "secondary": 14, "tertiary": 12, "residential": 11, "unclassified": 10}.get(r["c"], 8)
        if mw >= lo: w = round(min(mw, cap), 1)
    widths.append(w)
ch = [(r["n"], r["c"], r["w"], w) for r, w in zip(M["roads"], widths) if abs(w - r["w"]) > 0.05]
print("street widths measured:", len(ch), "of", len(widths), "e.g.", [c for c in ch if c[0] in ("West Main Street", "East Main Street", "South Washington Street", "South Franklin Street", "West Spring Street")][:8])

# ---- buildings: eave height, roof rise and roof type from the points on each footprint
roofs_out = bytearray(); stats = {"flat": 0, "gable": 0, "cross": 0, "hip": 0, "none": 0}
for b in M["buildings"]:
    P = np.array(b["p"], np.float64).reshape(-1, 2)
    c0, c1 = int(P[:, 0].min() + HALF) - 1, int(P[:, 0].max() + HALF) + 2; r0, r1 = int(HALF - P[:, 1].max()) - 1, int(HALF - P[:, 1].min()) + 2
    c0, r0, c1, r1 = max(c0, 0), max(r0, 0), min(c1, N), min(r1, N)
    im = Image.new("L", (c1 - c0, r1 - r0), 0); ImageDraw.Draw(im).polygon([(x + HALF - c0, HALF - y - r0) for x, y in P], fill=1)
    m = np.asarray(im) > 0
    if m.sum() > 60: m = ndi.binary_erosion(m)
    h = nd[r0:r1, c0:c1]; ok = m & (h > 1.2)
    if ok.sum() < max(6, 0.3 * m.sum()):
        roofs_out += bytes([0, 0, 0]); stats["none"] += 1; continue
    hs = h[ok]; lo, med, hi = np.percentile(hs, [15, 50, 96])
    # tightest bounding rectangle, same rule as the game: long axis u, short axis v
    bestr = None
    for k in range(len(P)):
        e = P[(k + 1) % len(P)] - P[k]; Lk = math.hypot(*e)
        if Lk < 1: continue
        ux = e / Lk; vx = np.array([-ux[1], ux[0]]); a = P @ ux; bb = P @ vx; ar = (a.max() - a.min()) * (bb.max() - bb.min())
        if bestr is None or ar < bestr[0]: bestr = (ar, ux, vx, (a.max() + a.min()) / 2, (bb.max() + bb.min()) / 2, (a.max() - a.min()) / 2, (bb.max() - bb.min()) / 2)
    _, ux, vx, ca, cb, ha, hb = bestr
    if hb > ha: ux, vx, ca, cb, ha, hb = vx, ux, cb, ca, hb, ha
    ri, ci = np.nonzero(ok); X = ci + c0 - HALF + 0.5; Y = HALF - (ri + r0) - 0.5
    u = np.abs(X * ux[0] + Y * ux[1] - ca); v = np.abs(X * vx[0] + Y * vx[1] - cb)

    def fit(t):                                                   # h ~ a - k*t  -> slope, r squared
        A = np.stack([np.ones_like(t), -t], 1); co, *_ = np.linalg.lstsq(A, hs, rcond=None); res = hs - A @ co
        return co[1], 1 - res.var() / max(hs.var(), 1e-6), co[0]
    kv, r2v, av = fit(v); ku, r2u, au = fit(u)
    typ, eave, rise = 0, med, 0.0
    span = hi - lo
    if span > 1.0 and max(kv, ku) > 0.08 and m.sum() < 1500:      # big sheds and stores stay flat
        typ = 1 if r2v >= r2u and kv > 0.08 else 2                # 1: ridge along the long axis, 2: across it
        if min(r2u, r2v) > 0.18 and min(ku, kv) > 0.12 and ha < 2.2 * hb: typ = 3                        # slopes both ways: hip
        eave, rise = lo, span
    eave = float(np.clip(eave, 2.2, 25)); rise = float(np.clip(rise, 0, min(6.5, 1.2 * (hb if typ != 2 else ha))))
    if typ and rise < 0.5: typ, eave, rise = 0, med, 0.0
    stats[["flat", "gable", "cross", "hip"][typ]] += 1
    roofs_out += bytes([int(round(eave * 10)), int(round(rise * 10)), typ])
print("roofs", stats)
ra = np.frombuffer(bytes(roofs_out), np.uint8).reshape(-1, 3); ar_ = np.array([abs(sum(b['p'][i] * b['p'][(i + 3) % len(b['p'])] - b['p'][(i + 2) % len(b['p'])] * b['p'][i + 1] for i in range(0, len(b['p']), 2))) / 2 for b in M['buildings']])
for a0, a1 in ((0, 45), (45, 120), (120, 430), (430, 1e9)):
    s_ = (ar_ >= a0) & (ar_ < a1); print('  area', a0, a1, 'n', int(s_.sum()), 'types', np.bincount(ra[s_, 2], minlength=4).tolist(), 'eave med', np.median(ra[s_ & (ra[:, 0] > 0), 0]) / 10, 'rise med', np.median(ra[s_ & (ra[:, 2] > 0), 1]) / 10)

# ---- trees: crown tops in the canopy height model (leaf-off scan: evergreens stand out as crowns the laser cannot see through)
chm = nd.copy(); chm[ndi.binary_dilation(bmask, iterations=2) | wmask] = 0
can = ndi.binary_opening(chm > 2.5, np.ones((3, 3)))              # opening removes wires, poles, cars
chm = ndi.gaussian_filter(np.where(can, chm, 0), 1.0)
deep = (cover == 10) & ~ndi.binary_dilation(rmask, iterations=60)   # deep woods: fewer, bigger crowns (they are only seen from afar)
top = (chm > 3) & ((chm == ndi.maximum_filter(chm, 7)) & ~deep | (chm == ndi.maximum_filter(chm, 13)) & deep)
ri, ci = np.nonzero(top)
gfrac = ndi.uniform_filter(gcnt.astype(np.float32), 5) / np.maximum(ndi.uniform_filter(cnt.astype(np.float32), 5), 0.01)
trees = bytearray(); nt = ne = 0
dirs = [(math.cos(a), math.sin(a)) for a in np.arange(8) * math.pi / 4]
for r, c in zip(ri, ci):
    if not (12 <= r < N - 12 and 12 <= c < N - 12): continue
    H = float(chm[r, c]); rad = []
    for dx, dy in dirs:                                           # crown radius: walk out until the canopy drops to 45 % or rises again
        j = 1
        while j < 10:
            hh = chm[int(round(r + dy * j)), int(round(c + dx * j))]
            if hh < 0.45 * H or hh > H * 1.02: break
            j += 1
        rad.append(j - 0.5)
    cr = float(np.clip(np.median(rad), 1.5, 9)); x = c - HALF + 0.5; y = HALF - r - 0.5
    ev = gfrac[r, c] < 0.06 and H > 4
    trees += struct.pack("<hhBB", int(round(x * 2)), int(round(y * 2)), int(min(255, round(H * 4))), int(min(127, round(cr * 8))) | (128 if ev else 0))
    nt += 1; ne += ev
print("trees", nt, "evergreen", ne, "median height", float(np.median(chm[ri, ci])))

js = "window.BLOOMFIELD_DETAIL=" + json.dumps({
    "terrain": {"file": "terrain.png", "n": TN, "step": TS, "base": BASE, "q": 0.02},
    "ground": {"file": "ground.png", "half": 2048},
    "widths": widths, "roofs": base64.b64encode(bytes(roofs_out)).decode(),
    "trees": base64.b64encode(bytes(trees)).decode(), "treeCount": nt}, separators=(",", ":")) + ";"
open(OUT + "/detail.js", "w").write(js)
import os
print({f: round(os.path.getsize(OUT + "/" + f) / 1e6, 2) for f in ("detail.js", "terrain.png", "ground.png")}, "MB")

# quick-look pictures for checking by eye
r = 350; sl = (slice(HALF - r, HALF + r), slice(HALF - r, HALF + r))
vis = np.stack([np.where(paved[sl], 60 + 150 * shade[sl], 70 + 90 * shade[sl]), np.where(paved[sl], 60 + 150 * shade[sl], 120 + 100 * shade[sl]), np.where(paved[sl], 60 + 150 * shade[sl], 50 + 60 * shade[sl])], -1).astype(np.uint8)
im = Image.fromarray(vis).resize((1400, 1400), Image.NEAREST); dr = ImageDraw.Draw(im)
for k in range(0, len(trees), 6):
    x, y, hq, rq = struct.unpack("<hhBB", trees[k:k + 6]); x /= 2; y /= 2
    if abs(x) < r and abs(y) < r:
        rr_ = (rq & 127) / 8 * 2; dr.ellipse([(x + r) * 2 - rr_, (r - y) * 2 - rr_, (x + r) * 2 + rr_, (r - y) * 2 + rr_], outline=(20, 90, 20) if rq & 128 else (230, 120, 20))
for b, k in zip(M["buildings"], range(0, len(roofs_out), 3)):
    pts = [((x + r) * 2, (r - y) * 2) for x, y in zip(b["p"][::2], b["p"][1::2])]
    if all(0 < q_[0] < 1400 and 0 < q_[1] < 1400 for q_ in pts): dr.polygon(pts, outline=[(120, 120, 255), (255, 60, 60), (255, 60, 255), (255, 200, 0)][roofs_out[k + 2]])
im.save(LD + "/detail_check.png")
