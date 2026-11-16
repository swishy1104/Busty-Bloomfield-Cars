"""Rebuild every building's roof from the USGS lidar point cloud (tools/fetch_lidar.py cache) for buildings.js.
Usage: python3 build_roofs.py <lidar_dir> <map.js> <detail.js> <out_dir> [cache_dir] [--only i,j,..] [--debug dir]
  writes <out_dir>/roofs.js  (window.BLOOMFIELD_ROOFS = { n, fallback, data: base64 })  and prints the accuracy report
  (cache_dir keeps pts.npz, the points near the footprints pulled once from the raw tiles, and roof_report.json; --debug draws one picture per building).
Per footprint:
  1. register the scan to the footprint (a shift of at most 2 m: the footprints were traced from aerial photos),
  2. take the roof points (inside, > 1.8 m above the bare earth, single or last returns: first-of-many returns are foliage and edges),
  3. grow planar facets from the flattest seeds, merge coplanar ones, sharpen the borders (chimneys, vents and twigs never reach the minimum size),
  4. regularise: level near-flat planes, snap the slope direction to the building's axes, equalise matching pitches and levels
     (each only when it costs less than 3.5 cm of fit),
  5. cut the footprint with the planes' intersection lines (ridges, hips, valleys) and with straight step lines where roofs of different
     height meet, all noded once on a 5 cm grid; give every cell the plane that owns most of it (never one that runs away over it); merge
     cells of one plane by cancelling shared edges, so every facet edge has an exact twin in a neighbour or lies on the footprint outline,
  6. check it (no open edges, heights within what the scan saw) and measure it against the scan: single returns inside the footprint
     without foliage and clutter (foliage_free: tests that never look at the model).
  Where the data are too thin or tree-covered (or a check fails) the previous one-roof description (detail.js: eave, rise, type) is
  written as facets instead, so buildings.js has one code path; the header counts them (fallback).
Binary layout (little endian), per footprint in map.js order:  u16 facet count (0 = nothing, buildings.js makes a flat cap);  then i16 ox, oy (origin, 0.1 m);
  per facet: i16 a, b (slope dz/dx, dz/dy x 4096, x east / y north), i16 c (height above the footprint's ground level at the origin, cm),
  u8 ring count, per ring: u16 n, n x (i16 x, i16 y) cm from the origin (ring 0 = outline, counter-clockwise; others = holes).
Facets tile the footprint exactly; neighbours share vertices, so an edge without a twin is on the footprint outline. The ground level is the
mean bare-earth height at the footprint's corners (buildings.js uses the mean of its terrain at the same corners)."""
import sys, os, json, math, base64, struct, time, glob
import numpy as np
from scipy.spatial import cKDTree
from scipy import ndimage as ndi
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
import shapely
from shapely.geometry import Polygon, LineString
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, polygonize

N, HALF = 4100, 2050
SHIFT = (1.0, 1.0)      # lidar -> footprint frame, metres east / north (build_detail.py: +1 column, -1 row)
MINH = 1.8              # roof points are at least this far above the bare earth
TOL = 0.14              # distance from its plane for a point to belong to a facet
SNAP = 0.035            # a regularisation is accepted when it costs less than this much extra RMS (m)
RES = 0.25              # label raster cell (m)
QS = 4096.0             # slope quantum
GRID = 0.05             # facet outlines are noded on this grid (m): corners shared by neighbours agree exactly, no feature is smaller


# ---------------------------------------------------------------- data
def extract(LD, M, out):
    """Points on and around the footprints, pulled from the raw tiles once."""
    import laspy
    from PIL import Image, ImageDraw
    from concurrent.futures import ThreadPoolExecutor
    RE = 6378137.0; LAT0, LON0 = M["lat0"], M["lon0"]; p = math.radians(LAT0)
    MY = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    MX = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p)
    im = Image.new("L", (N, N), 0); dr = ImageDraw.Draw(im)
    for b in M["buildings"]: dr.polygon([(x + HALF, HALF - y) for x, y in zip(b["p"][::2], b["p"][1::2])], fill=255)
    near = ndi.binary_dilation(np.asarray(im) > 0, iterations=5).ravel()

    def node(f):
        las = laspy.read(f); X = np.asarray(las.x); Y = np.asarray(las.y)
        x = (np.degrees(X / RE) - LON0) * MX + SHIFT[0]; y = (np.degrees(2 * np.arctan(np.exp(Y / RE)) - np.pi / 2) - LAT0) * MY + SHIFT[1]
        col = np.floor(x + HALF).astype(np.int64); row = np.floor(HALF - y).astype(np.int64); cls = np.asarray(las.classification)
        ok = (col >= 0) & (col < N) & (row >= 0) & (row < N) & (cls != 7) & (cls != 18); ok[ok] = near[row[ok] * N + col[ok]]
        return (x[ok].astype(np.float32), y[ok].astype(np.float32), np.asarray(las.z)[ok].astype(np.float32),
                np.asarray(las.number_of_returns)[ok].astype(np.uint8), np.asarray(las.return_number)[ok].astype(np.uint8))
    with ThreadPoolExecutor(4) as pool: parts = list(pool.map(node, sorted(glob.glob(LD + "/nodes/*.laz"))))
    o = [np.concatenate([q[k] for q in parts]) for k in range(5)]
    np.savez(out, x=o[0], y=o[1], z=o[2], nret=o[3], rnum=o[4])


G = {}


def load(LD, MAPJS, DETJS, CACHE):
    M = json.loads(open(MAPJS).read()[len("window.BLOOMFIELD="):-1])
    f = CACHE + "/pts.npz"
    if not os.path.exists(f): extract(LD, M, f)
    d = np.load(f); x, y, z = d["x"].astype(np.float64), d["y"].astype(np.float64), d["z"].astype(np.float64)
    dtm = np.load(LD + "/lidar_1m.npz")["dtm"]
    hag = z - dtm[np.floor(HALF - (y - SHIFT[1])).astype(int), np.floor(x - SHIFT[0] + HALF).astype(int)]
    DT = json.loads(open(DETJS).read()[len("window.BLOOMFIELD_DETAIL="):-1])
    G.update(M=M, x=x, y=y, z=z, hag=hag, single=d["nret"] == 1, last=d["rnum"] == d["nret"], tree=cKDTree(np.c_[x, y]),
             dtm=ndi.gaussian_filter(dtm, 0.8), old=np.frombuffer(base64.b64decode(DT["roofs"]), np.uint8).reshape(-1, 3))


def ground(px, py):
    """Bare-earth height the way the game's terrain has it (smoothed 1 m model), at footprint-frame points."""
    return ndi.map_coordinates(G["dtm"], [HALF - (py - SHIFT[1]) - 0.5, px - SHIFT[0] + HALF - 0.5], order=1, mode="nearest")


# ---------------------------------------------------------------- planes
def lsq(P):
    """z = a x + b y + c by least squares -> (a, b, c), rms."""
    A = np.c_[P[:, 0], P[:, 1], np.ones(len(P))]; co = np.linalg.lstsq(A, P[:, 2], rcond=None)[0]
    return co, float(np.sqrt(np.mean((A @ co - P[:, 2]) ** 2)))


def pca(P):
    mu = P.mean(0); w, v = np.linalg.eigh(np.cov((P - mu).T)); n = v[:, 0]
    return mu, n * (1 if n[2] >= 0 else -1)


def segment(P, minpts):
    """Region growing from the flattest seeds. Returns labels (-1 = none) and the number of regions."""
    n = len(P); lab = np.full(n, -1)
    if n < 6: return lab, 0
    tree = cKDTree(P[:, :2]); k = min(12, n); d, nb = tree.query(P[:, :2], k=k); w = d < 1.6; cnt = w.sum(1)
    Q = P[nb]; mu = (Q * w[..., None]).sum(1) / cnt[:, None]; D = (Q - mu[:, None]) * w[..., None]
    ev, evec = np.linalg.eigh(np.einsum("nki,nkj->nij", D, D) / cnt[:, None, None])
    nrm = evec[:, :, 0]; nrm = nrm * np.where(nrm[:, 2:3] < 0, -1, 1); sig = np.sqrt(np.maximum(ev[:, 0], 0)); sig[cnt < 5] = 9
    pr = tree.query_pairs(1.25, output_type="ndarray"); pa, pb = pr[:, 0], pr[:, 1]
    avail = np.ones(n, bool); seed = (sig < 0.07) & (nrm[:, 2] > 0.17); order = np.argsort(sig, kind="stable"); nreg = 0

    def grow(s):
        p0, nv, comp = mu[s], nrm[s], None
        for _ in range(4):
            inl = avail & (np.abs((P - p0) @ nv) < TOL) & ((nrm @ nv > 0.9) | (sig > 0.05)); inl[s] = True
            m = inl[pa] & inl[pb]; cl = connected_components(csr_matrix((np.ones(m.sum(), bool), (pa[m], pb[m])), shape=(n, n)), directed=False)[1]
            c2 = (cl == cl[s]) & inl
            if comp is not None and (c2 == comp).all(): break
            comp = c2
            if comp.sum() < 4: break
            p0, nv = pca(P[comp])
            if nv[2] < 0.12: break
        return comp
    while True:
        cand = order[(avail & seed)[order]][:4]
        if not len(cand): break
        comps = [grow(s) for s in cand]; best = max(comps, key=lambda c: c.sum())
        if best.sum() >= minpts: lab[best] = nreg; nreg += 1; avail[best] = False
        else:
            for c in comps: seed[c] = False
            seed[cand] = False

    def planes():
        return {i: lsq(P[lab == i])[0] for i in range(nreg) if (lab == i).sum() >= 3}
    # merge coplanar neighbours
    while True:
        pl = planes(); x = (lab[pa] >= 0) & (lab[pb] >= 0) & (lab[pa] != lab[pb])
        if not x.any(): break
        key = np.unique(np.c_[np.minimum(lab[pa[x]], lab[pb[x]]), np.maximum(lab[pa[x]], lab[pb[x]])], axis=0, return_counts=True); done = False
        for (i, j), c in zip(*key):
            if c < 3 or i not in pl or j not in pl: continue
            ni = np.array([-pl[i][0], -pl[i][1], 1]); nj = np.array([-pl[j][0], -pl[j][1], 1])
            if ni @ nj / np.linalg.norm(ni) / np.linalg.norm(nj) < 0.9976: continue                 # 4 degrees
            if lsq(P[(lab == i) | (lab == j)])[1] < 0.065: lab[lab == j] = i; done = True; break
        if not done: break
    # sharpen the borders: every point goes to the best-fitting plane among its neighbours' planes
    for _ in range(3):
        pl = planes()
        if not pl: break
        co = np.zeros((nreg, 3)); 
        for i, c in pl.items(): co[i] = c
        cp = np.r_[pa, pb]; cl = np.r_[lab[pb], lab[pa]]; ok = cl >= 0; cp, cl = cp[ok], cl[ok]
        dist = np.abs(P[cp, 0] * co[cl, 0] + P[cp, 1] * co[cl, 1] + co[cl, 2] - P[cp, 2]) / np.sqrt(1 + co[cl, 0] ** 2 + co[cl, 1] ** 2)
        o = np.lexsort((dist, cp)); cp, cl, dist = cp[o], cl[o], dist[o]; first = np.r_[True, cp[1:] != cp[:-1]]; cp, cl, dist = cp[first], cl[first], dist[first]
        cur = lab[cp]; dcur = np.where(cur >= 0, np.abs(P[cp, 0] * co[cur, 0] + P[cp, 1] * co[cur, 1] + co[cur, 2] - P[cp, 2]) / np.sqrt(1 + co[cur, 0] ** 2 + co[cur, 1] ** 2), 9)
        sw = (dist < TOL * 1.4) & (dist < dcur - 0.02) & (cl != cur)
        if not sw.any(): break
        lab[cp[sw]] = cl[sw]
    for i in range(nreg):
        if 0 < (lab == i).sum() < minpts: lab[lab == i] = -1
    ids = [i for i in range(nreg) if (lab == i).any()]; re = np.full(nreg + 1, -1); re[ids] = np.arange(len(ids)); lab = np.where(lab >= 0, re[lab], -1)
    return lab, len(ids)


def ang4(v, w):
    """Dominant direction modulo 90 degrees of vectors v (n, 2) with weights w -> angle, consistency 0..1."""
    a = np.arctan2(v[:, 1], v[:, 0]) * 4; c, s = (w * np.cos(a)).sum(), (w * np.sin(a)).sum()
    return math.atan2(s, c) / 4, math.hypot(c, s) / max(w.sum(), 1e-9)


def regularise(P, lab, nreg, ring):
    """Fit and tidy the planes. Returns array (nreg, 3) of (a, b, c), quantised the way roofs.js stores them."""
    e = np.roll(ring, -1, 0) - ring; thf, _ = ang4(e, np.hypot(e[:, 0], e[:, 1]) ** 2)
    fits = [lsq(P[lab == i]) for i in range(nreg)]; cnt = np.array([(lab == i).sum() for i in range(nreg)])
    gr = np.array([f[0][:2] for f in fits]); sl = np.hypot(gr[:, 0], gr[:, 1]); st = sl > 0.15
    thr, cons = ang4(gr[st], cnt[st] * np.minimum(sl[st], 1)) if st.any() else (thf, 0)
    frames = [thf] + ([thr] if cons > 0.8 and cnt[st].sum() >= 30 and abs((thr - thf + math.pi / 4) % (math.pi / 2) - math.pi / 4) > math.radians(2) else [])
    out = np.zeros((nreg, 3)); kind = np.zeros(nreg, int); dirs = np.zeros((nreg, 2))      # kind 0 free, 1 flat, 2 snapped
    for i in range(nreg):
        Q = P[lab == i]; co, rms = fits[i]; out[i] = co
        if sl[i] < 0.02 or np.sqrt(np.mean((Q[:, 2] - Q[:, 2].mean()) ** 2)) - rms < SNAP: out[i] = (0, 0, Q[:, 2].mean()); kind[i] = 1; continue
        for th in frames:
            k = round((math.atan2(co[1], co[0]) - th) / (math.pi / 2)); dv = np.array([math.cos(th + k * math.pi / 2), math.sin(th + k * math.pi / 2)])
            t = Q[:, :2] @ dv; A = np.c_[t, np.ones(len(Q))]; c2 = np.linalg.lstsq(A, Q[:, 2], rcond=None)[0]
            if np.sqrt(np.mean((A @ c2 - Q[:, 2]) ** 2)) - rms < SNAP: out[i] = (c2[0] * dv[0], c2[0] * dv[1], c2[1]); kind[i] = 2; dirs[i] = dv; break

    def group(idx, val, tol, apply):       # cluster values that agree within tol and give them their weighted mean when the fit allows it
        idx = sorted(idx, key=lambda i: val[i]); k = 0
        while k < len(idx):
            j = k + 1
            while j < len(idx) and tol(val[idx[j]], val[idx[k]]): j += 1
            g = idx[k:j]
            if len(g) > 1:
                m = float(np.average([val[i] for i in g], weights=cnt[g]))
                for i in g:
                    new = apply(i, m); Q = P[lab == i]
                    if np.sqrt(np.mean((Q[:, 0] * new[0] + Q[:, 1] * new[1] + new[2] - Q[:, 2]) ** 2)) - fits[i][1] < 1.5 * SNAP: out[i] = new
            k = j
    def pitch(i, m):
        Q = P[lab == i]; return (m * dirs[i][0], m * dirs[i][1], float(np.mean(Q[:, 2] - m * (Q[:, :2] @ dirs[i]))))
    group([i for i in range(nreg) if kind[i] == 2], np.hypot(out[:, 0], out[:, 1]), lambda a, b: a < b * 1.14 + 0.01, pitch)
    group([i for i in range(nreg) if kind[i] == 1], out[:, 2].copy(), lambda a, b: a < b + 0.12, lambda i, m: (0, 0, m))
    out[:, :2] = np.clip(np.round(out[:, :2] * QS), -32767, 32767) / QS; out[:, 2] = np.round(out[:, 2] * 100) / 100
    return out


# ---------------------------------------------------------------- partition
def canon(nx, ny, d):
    return (nx, ny, d) if nx > 1e-9 or (abs(nx) <= 1e-9 and ny > 0) else (-nx, -ny, -d)


def step_lines(S, axes):
    """Straight lines through boundary samples S: runs along the building's axes first, then one free line through what is left."""
    out = []; left = np.ones(len(S), bool)
    if len(S) >= 10:                                   # one oblique line through all of them (a hip or valley the planes missed) beats a staircase of axis runs
        mu = S.mean(0); w, vec = np.linalg.eigh(np.cov((S - mu).T)); n = vec[:, 0]
        if w[0] < 0.09 and w[1] > 1.0 and min(abs(n @ axes[0]), abs(n @ axes[1])) > 0.12: return [(*canon(n[0], n[1], float(n @ mu)), len(S))]
    for k in (0, 1):
        v = S @ axes[1 - k]; b = np.floor(v / RES).astype(int); b0 = b.min(); h = np.bincount(b - b0, minlength=b.max() - b0 + 3).astype(float)
        h3 = np.convolve(h, [1, 1, 1], "same")
        for j in np.argsort(-h3):
            if h3[j] < 6: break
            if h3[j] < h3[max(j - 1, 0):j + 2].max(): continue
            m = np.abs(b - b0 - j) <= 1
            if np.ptp(S[m] @ axes[k]) < 1.2: continue
            out.append((*canon(axes[1 - k][0], axes[1 - k][1], float(np.median(v[m]))), int(m.sum()))); left &= np.abs(v - np.median(v[m])) > 0.6
    if left.sum() >= 10:
        Q = S[left]; mu = Q.mean(0); w, vec = np.linalg.eigh(np.cov((Q - mu).T))
        if w[0] < 0.16 and w[1] > 0.5: out.append((*canon(vec[0, 0], vec[1, 0], float(vec[:, 0] @ mu)), int(left.sum())))
    return out


def partition(poly, P, lab, pl, axes, zr):
    """Facets [(plane index, shapely polygon)] that tile the footprint."""
    x0, y0, x1, y1 = poly.bounds; gx = np.arange(x0 + RES / 2, x1, RES); gy = np.arange(y0 + RES / 2, y1, RES)
    if len(gx) < 2 or len(gy) < 2: return None
    GX, GY = np.meshgrid(gx, gy); ins = shapely.contains_xy(poly, GX, GY); ok = lab >= 0
    if ins.sum() < 8: return None
    dd, ii = cKDTree(P[ok, :2]).query(np.c_[GX[ins], GY[ins]]); L = np.full(GX.shape, -1); L[ins] = lab[ok][ii]
    DD = np.full(GX.shape, 9.0); DD[ins] = dd
    if len(pl) == 1: return assemble(cut(poly, []), [0])
    # boundary samples between different labels (only where both sides are backed by points)
    S = {}
    for a, b, sx, sy, near in ((L[:, :-1], L[:, 1:], (GX[:, :-1] + GX[:, 1:]) / 2, GY[:, :-1], np.maximum(DD[:, :-1], DD[:, 1:])),
                               (L[:-1], L[1:], GX[:-1], (GY[:-1] + GY[1:]) / 2, np.maximum(DD[:-1], DD[1:]))):
        m = (a >= 0) & (b >= 0) & (a != b)
        for i, j, x, y, dn in zip(np.minimum(a[m], b[m]), np.maximum(a[m], b[m]), sx[m], sy[m], near[m]): S.setdefault((int(i), int(j)), []).append((x, y, dn))
    lines = []                                         # (nx, ny, d, weight, crease)
    for (i, j), s in S.items():
        s = np.array(s)
        if len(s) < 4: continue
        nearm = s[:, 2] < 1.2; s = s[nearm, :2] if nearm.sum() >= 4 else s[:, :2]
        dl = pl[i] - pl[j]; g = math.hypot(dl[0], dl[1]); rest = s
        if g > 0.04:
            dist = (s @ dl[:2] + dl[2]) / g
            if np.percentile(np.abs(dist), 60) < 0.7 or np.median(np.abs(dist)) * g < 0.12:
                lines.append((*canon(dl[0] / g, dl[1] / g, -dl[2] / g), len(s) + 1000, 1)); rest = s[np.abs(dist) > 1.0]
        if len(rest) >= 6: lines += [(*l, 0) for l in step_lines(rest, axes)]
    # snap step lines onto parallel walls, drop near-duplicates (creases win, then the better supported)
    ring = np.array(poly.exterior.coords)[:-1]; c0 = np.array(poly.centroid.coords[0]); keep = []
    for nx, ny, d, wgt, cr in sorted(lines, key=lambda l: -l[3]):
        if not cr:
            for p, q in zip(ring, np.roll(ring, -1, 0)):
                e = q - p; le = math.hypot(*e)
                if le < 1.5: continue
                if abs(e[0] * nx + e[1] * ny) / le < 0.1 and abs(nx * p[0] + ny * p[1] - d) < 0.6 and abs(nx * q[0] + ny * q[1] - d) < 0.6:
                    nx, ny, d = canon(-e[1] / le, e[0] / le, (-e[1] * p[0] + e[0] * p[1]) / le); break
        if any(abs(nx * k[0] + ny * k[1]) > 0.9976 and abs((d - nx * c0[0] - ny * c0[1]) - (k[2] - k[0] * c0[0] - k[1] * c0[1]) * (1 if nx * k[0] + ny * k[1] > 0 else -1)) < 0.5 for k in keep): continue
        keep.append((nx, ny, d))
    cells = cut(poly, keep)
    if not cells: return None
    pts = shapely.points(GX[ins], GY[ins]); qi, ci = shapely.STRtree(cells).query(pts, predicate="within")
    votes = np.zeros((len(cells), len(pl))); np.add.at(votes, (ci, L[ins][qi]), 1)
    tr = cKDTree(np.c_[GX[ins], GY[ins]]); Li = L[ins]; tp = cKDTree(P[:, :2])
    cl = [int(votes[k].argmax()) if votes[k].sum() > 0 else int(Li[tr.query(cells[k].representative_point().coords[0])[1]]) for k in range(len(cells))]
    # a plane must not run away over a cell it has little say in: such a cell takes the plane that stays in range and is nearest to the points there
    for k, c in enumerate(cells):
        V = np.array(c.exterior.coords); Z = V @ pl[:, :2].T + pl[:, 2]; fine = (Z.min(0) > zr[0]) & (Z.max(0) < zr[1])
        if fine[cl[k]] or not fine.any(): continue
        q = np.array(c.representative_point().coords[0]); zc = np.median(P[tp.query(q, k=min(5, len(P)))[1], 2]); cl[k] = int(np.argmin(np.where(fine, np.abs(pl[:, :2] @ q + pl[:, 2] - zc), 1e9)))
    return assemble(cells, cl, votes)


def cut(poly, lines):
    """The footprint cut by straight lines (nx, ny, d): the cells of one arrangement, noded on the grid so that neighbours share their vertices exactly."""
    x0, y0, x1, y1 = poly.bounds; R = math.hypot(x1 - x0, y1 - y0) + 5; c0 = np.array(poly.centroid.coords[0]); segs = [poly.exterior] + list(poly.interiors)
    for nx, ny, d in lines:
        t = d - nx * c0[0] - ny * c0[1]; px, py = c0[0] + nx * t, c0[1] + ny * t; segs.append(LineString([(px - ny * R, py + nx * R), (px + ny * R, py - nx * R)]))
    return [orient(c, 1.0) for c in polygonize(shapely.union_all(segs, grid_size=GRID)) if c.area > 1e-6 and poly.contains(c.representative_point())]


def assemble(cells, cl, votes=None):
    """Facets from the cells: cells of one plane that touch along an edge are merged by cancelling the shared edges (no geometry is recomputed, so
    nothing can drift apart), specks and slivers join the neighbour they share most outline with, vertices that only sit on a straight line go.
    Returns [(plane index, [outline, holes...])], rings in integer centimetres, outline counter-clockwise; None when a ring degenerates."""
    n = len(cells); cl = list(cl); ar = [c.area for c in cells]; E = {}
    for k, c in enumerate(cells):
        for r in [c.exterior] + list(c.interiors):
            q = [(int(round(x * 100)), int(round(y * 100))) for x, y in r.coords[:-1]]
            for e in zip(q, q[1:] + q[:1]): E[e] = k
    ln = {e: math.hypot(e[0][0] - e[1][0], e[0][1] - e[1][1]) / 100 for e in E}; tw = {e: E.get((e[1], e[0])) for e in E}
    # straighten the borders: a small cell that sticks out of its own facet into another (most of its outline borders that one) and that the
    # other plane also had a real say in goes over; a small facet of its own, which no other plane voted for, stays
    for _ in range(3 if votes is not None else 0):
        ce = {}; flip = {}
        for e, k in E.items(): ce.setdefault(k, []).append(e)
        for k, es in ce.items():
            if ar[k] > 6: continue
            sh = {}; tot = sum(ln[e] for e in es)
            for e in es:
                if tw[e] is not None: sh[cl[tw[e]]] = sh.get(cl[tw[e]], 0) + ln[e]
            l2 = max(sh, key=sh.get) if sh else cl[k]
            if l2 != cl[k] and sh[l2] > 0.6 * tot and sh.get(cl[k], 0) < 0.3 * tot and votes[k, l2] >= 0.25 * max(votes[k].sum(), 1): flip[k] = l2
        if not flip: break
        for k, l2 in flip.items(): cl[k] = l2

    def comps():
        par = list(range(n))
        def find(i):
            while par[i] != i: par[i] = par[par[i]]; i = par[i]
            return i
        for e, k in E.items():
            if tw[e] is not None and cl[tw[e]] == cl[k]: par[find(k)] = find(tw[e])
        return [find(i) for i in range(n)]
    stuck = set()
    while True:
        cp = comps(); A = {}; per = {}; sh = {}
        for k in range(n): A[cp[k]] = A.get(cp[k], 0) + ar[k]
        for e, k in E.items():
            m = tw[e]
            if m is None or cp[m] != cp[k]:
                per[cp[k]] = per.get(cp[k], 0) + ln[e]
                if m is not None: d = sh.setdefault(cp[k], {}); d[cp[m]] = d.get(cp[m], 0) + ln[e]
        small = [c for c in A if (A[c] < 1.5 or 2 * A[c] / per[c] < 0.4) and c not in stuck]
        if len(A) < 2 or not small: break
        c = min(small, key=lambda c: A[c])
        if c not in sh: stuck.add(c); continue
        m = max(sh[c], key=sh[c].get)
        for k in range(n):
            if cp[k] == c: cl[k] = cl[m]
    out = []
    for c in sorted(set(cp)):
        nxt = {}
        for e, k in E.items():
            if cp[k] == c and (tw[e] is None or cp[tw[e]] != c): nxt.setdefault(e[0], []).append(e[1])
        rings = []
        while nxt:                                     # walk the boundary with the facet on the left; where it pinches, turn as far left as possible
            a0 = next(iter(nxt)); ring = [a0]; prev, v = a0, nxt[a0].pop()
            if not nxt[a0]: del nxt[a0]
            while v != a0:
                ring.append(v); cand = nxt[v]; back = math.atan2(prev[1] - v[1], prev[0] - v[0])
                w = cand[0] if len(cand) == 1 else min(cand, key=lambda w: (back - math.atan2(w[1] - v[1], w[0] - v[0])) % (2 * math.pi) or 9)
                cand.remove(w)
                if not cand: del nxt[v]
                prev, v = v, w
            rings.append(ring)
        sa = [sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(r, r[1:] + r[:1])) for r in rings]; o = int(np.argmax(sa))
        out.append((cl[c], [rings[o]] + [r for k, r in enumerate(rings) if k != o and sa[k] < 0])); out += [(cl[c], [r]) for k, r in enumerate(rings) if k != o and sa[k] > 0]
    nb = {}
    for _, rs in out:
        for r in rs:
            for p, q in zip(r, r[1:] + r[:1]): nb.setdefault(p, set()).add(q); nb.setdefault(q, set()).add(p)
    drop = set()
    for v in list(nb):
        if len(nb[v]) != 2: continue
        u, w = nb[v]; cr = (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]); dot = (v[0] - u[0]) * (w[0] - v[0]) + (v[1] - u[1]) * (w[1] - v[1])
        if dot > 0 and abs(cr) <= 1.2 * math.hypot(w[0] - u[0], w[1] - u[1]) and w not in nb[u]:
            drop.add(v); del nb[v]; nb[u].discard(v); nb[u].add(w); nb[w].discard(v); nb[w].add(u)
    out = [(l, [[p for p in r if p not in drop] for r in rs]) for l, rs in out]
    return None if any(len(r) < 3 for _, rs in out for r in rs) else out


def simple(bi, poly, ring, O):
    """The previous one-roof description (detail.js: eave, rise, type over the tightest bounding rectangle) as facets: the lower envelope of its
    two (gable) or four (hip) planes over the footprint. Heights relative to the ground level; a building the scan never saw gets a guess."""
    ev, rise, rt = G["old"][bi] / np.array([10.0, 10.0, 1]); best = None
    for k in range(len(ring)):
        e = ring[(k + 1) % len(ring)] - ring[k]; L = math.hypot(*e)
        if L < 1: continue
        u = e / L; v = np.array([-u[1], u[0]]); a = ring @ u; b = ring @ v; ar = np.ptp(a) * np.ptp(b)
        if best is None or ar < best[0]: best = (ar, u, v, (a.max() + a.min()) / 2, (b.max() + b.min()) / 2, np.ptp(a) / 2, np.ptp(b) / 2)
    pl = [(0.0, 0.0, 0.0)]
    if best:
        rar, u, v, ca, cb, ha, hb = best; A = poly.area; c = ring.mean(0); down = math.hypot(*c) < 200 and A > 110; house = not down and 45 < A < 430 and A / rar > 0.7; h = G["M"]["buildings"][bi]["h"]
        if hb > ha: u, v, ca, cb, ha, hb = v, u, cb, ca, hb, ha
        if not ev: ev = max(h, 3) if house else max(h, 7.5) if down else 2.6 if A < 45 else max(h, 4.4); rt, rise = (1, min(3.6, hb * 0.72)) if house else (0, 0)
        if house and (not rt or rise < 0.5): rt, rise = 1, 0.6
        if rt == 2: u, v, ca, cb, ha, hb = v, u, cb, ca, hb, ha
        if rt and rise >= 0.5:
            pl = [(*(-s * rise / (hb + 0.4) * v), rise * (1 - s * (v @ O - cb) / (hb + 0.4))) for s in (1, -1)]
            if rt == 3: hw = min(hb, ha * 0.85); pl += [(*(-s * rise / hw * u), rise * (ha + 0.4 - s * (u @ O - ca)) / hw) for s in (1, -1)]
    pl = np.array(pl); pl[:, 2] += ev + 0.2; pl[:, :2] = np.round(pl[:, :2] * QS) / QS; pl[:, 2] = np.round(pl[:, 2] * 100) / 100
    lines = [canon(d[0] / g, d[1] / g, -d[2] / g) for i in range(len(pl)) for j in range(i) for d in [pl[i] - pl[j]] for g in [math.hypot(d[0], d[1])] if g > 1e-6]
    cells = cut(poly, lines); fac = assemble(cells, [int(np.argmin(pl[:, :2] @ np.array(c.representative_point().coords[0]) + pl[:, 2])) for c in cells]) if cells else None
    return fac, pl


def model_z(fac, pl, O, X, Y):
    """Roof height of the facet model at points relative to its origin O (nan outside)."""
    z = np.full(len(X), np.nan)
    for l, rs in fac:
        g = Polygon(np.array(rs[0]) / 100.0, [np.array(r) / 100.0 for r in rs[1:]])
        m = shapely.contains_xy(g.buffer(0.011), X, Y) & np.isnan(z); z[m] = pl[l][0] * X[m] + pl[l][1] * Y[m] + pl[l][2]
    return z


def old_z(bi, ring, X, Y):
    """The previous one-roof description (detail.js: eave, rise, type over the tightest bounding rectangle), relative to the ground level."""
    ev, rise, rt = G["old"][bi] / np.array([10.0, 10.0, 1]); best = None
    for k in range(len(ring)):
        e = ring[(k + 1) % len(ring)] - ring[k]; L = math.hypot(*e)
        if L < 1: continue
        u = e / L; v = np.array([-u[1], u[0]]); a = ring @ u; b = ring @ v; ar = np.ptp(a) * np.ptp(b)
        if best is None or ar < best[0]: best = (ar, u, v, (a.max() + a.min()) / 2, (b.max() + b.min()) / 2, np.ptp(a) / 2, np.ptp(b) / 2)
    _, u, v, ca, cb, ha, hb = best
    if hb > ha: u, v, ca, cb, ha, hb = v, u, cb, ca, hb, ha
    if rt == 2: u, v, ca, cb, ha, hb = v, u, cb, ca, hb, ha
    if not rt or rise < 0.5: return np.full(len(X), ev + 0.2)
    pu = np.abs(X * u[0] + Y * u[1] - ca); pv = np.abs(X * v[0] + Y * v[1] - cb); f = 1 - pv / (hb + 0.4)
    if rt == 3: f = np.minimum(f, (ha + 0.4 - pu) / min(hb, ha * 0.85))
    return ev + 0.2 + rise * np.clip(f, 0, 1)


# ---------------------------------------------------------------- one building
def solve(bi, debug=None):
    b = G["M"]["buildings"][bi]; ring = np.array(b["p"], float).reshape(-1, 2); poly = Polygon(ring)
    if not poly.is_valid:
        poly = poly.buffer(0); poly = max(poly.geoms, key=lambda g: g.area) if poly.geom_type == "MultiPolygon" else poly
    poly = orient(poly, 1.0); res = {"bi": bi, "area": poly.area, "why": "", "fb": True}
    c = np.array(poly.centroid.coords[0]); O = np.round(c, 1); rad = max(np.hypot(*(ring - c).T)) + 4; polyO = shapely.affinity.translate(poly, -O[0], -O[1])
    P = E = np.zeros((0, 3)); lab = np.zeros(0, int)

    def done(why):                                     # fall back to the one-roof description, as facets
        res["why"] = why; fac, pl = simple(bi, polyO, ring, O); res.update(fac=fac or [], pl=pl, O=O, nfac=len(fac or []))
        if fac and len(E): res["new"] = stats(model_z(fac, pl, O, E[:, 0], E[:, 1]) - E[:, 2])
        if debug and fac: draw(debug, bi, poly, O, P, lab, fac, pl, E)
        return res
    idx = np.array(G["tree"].query_ball_point(c, rad))
    if len(idx) < 10: return done("no points")
    x, y, z, hag, single, last = (G[k][idx] for k in ("x", "y", "z", "hag", "single", "last"))
    # 1. register: the shift that puts most roof and least ground inside the footprint
    hi, lo = single & (hag > MINH), single & (hag < 0.5)
    def score(dx, dy): return int(shapely.contains_xy(poly, x[hi] + dx, y[hi] + dy).sum()) - int(shapely.contains_xy(poly, x[lo] + dx, y[lo] + dy).sum()) - 0.004 * hi.sum() * math.hypot(dx, dy)
    s0 = score(0, 0); best = (s0, 0.0, 0.0)
    for dx in np.arange(-2, 2.01, 0.5):
        for dy in np.arange(-2, 2.01, 0.5): best = max(best, (score(dx, dy), dx, dy))
    for dx in (-0.25, 0, 0.25):
        for dy in (-0.25, 0, 0.25): best = max(best, (score(best[1] + dx, best[2] + dy), best[1] + dx, best[2] + dy))
    sh = (best[1], best[2]) if best[0] > s0 + 0.03 * max(hi.sum(), 30) else (0.0, 0.0)
    x = x + sh[0]; y = y + sh[1]; res["shift"] = sh
    # 2. roof points (single or last returns) and the ones the result is checked against (single returns away from the wall line)
    gz = float(np.mean(ground(ring[:, 0], ring[:, 1]))); inside = shapely.contains_xy(poly, x, y)
    use = inside & (hag > MINH) & (single | last); P = np.c_[x[use] - O[0], y[use] - O[1], z[use] - gz]
    ev = single[use] & shapely.contains_xy(poly.buffer(-0.3), x[use], y[use])
    res["npts"] = len(P); res["cover"] = len(P) * 0.22 / max(poly.area, 1); lab = np.full(len(P), -1)
    E = foliage_free(P, lab, ev)
    if poly.area < 6 or len(P) < 14 or res["cover"] < 0.35: return done("thin data (%d points, %.0f%% cover)" % (len(P), 100 * res["cover"]))
    # 3-5. facets
    lab, nreg = segment(P, 6 if poly.area < 25 else 9 if poly.area < 60 else 12); E = foliage_free(P, lab, ev)
    if not nreg or (lab >= 0).sum() < 0.4 * len(P): return done("no planes (%d of %d points planar)" % ((lab >= 0).sum(), len(P)))
    pl = regularise(P, lab, nreg, ring); e = np.roll(ring, -1, 0) - ring; th, _ = ang4(e, np.hypot(e[:, 0], e[:, 1]) ** 2)
    axes = np.array([[math.cos(th), math.sin(th)], [-math.sin(th), math.cos(th)]]); zlo, zhi = np.percentile(P[lab >= 0, 2], [1, 99]); zr = (min(zlo - 1.0, 1.2), zhi + 1.0)
    fac = partition(polyO, P, lab, pl, axes, zr)
    if not fac: return done("partition failed")
    # 6. check: every edge has a twin or lies on the outline; heights stay within the range the scan saw
    edges = {(p, q) for l, rs in fac for r in rs for p, q in zip(r, r[1:] + r[:1])}; outline = polyO.boundary
    bad = sum(1 for p, q in edges if (q, p) not in edges and outline.distance(shapely.Point((p[0] + q[0]) / 200, (p[1] + q[1]) / 200)) > GRID + 0.01)
    zs = np.array([pl[l][0] * p[0] / 100 + pl[l][1] * p[1] / 100 + pl[l][2] for l, rs in fac for p in rs[0]])
    if bad: return done("open edges (%d)" % bad)
    if zs.min() < zr[0] or zs.max() > zr[1]: return done("runaway plane (%.1f..%.1f vs %.1f..%.1f)" % (zs.min(), zs.max(), zlo, zhi))
    res.update(fac=fac, pl=pl, O=O, nfac=len(fac), nplanes=nreg, fb=False)
    res["old"] = stats(old_z(bi, ring - O, E[:, 0], E[:, 1]) - E[:, 2]) if len(E) and G["old"][bi][0] else None
    if len(E): res["new"] = stats(model_z(fac, pl, O, E[:, 0], E[:, 1]) - E[:, 2])
    if debug: draw(debug, bi, poly, O, P, lab, fac, pl, E)
    return res


def foliage_free(P, lab, ev):
    """The points a roof model is checked against: candidates ev of P without foliage and clutter, by tests that do not look at the model:
    a point is dropped when it stands more than 1 m above the median of its neighbours within 1.5 m (chimneys, aerials, twigs), or when it
    belongs to no planar patch and is more than 0.5 m above every planar point within 2 m, or above all planar points + 0.75 m (canopy over the roof)."""
    E = P[ev]
    if len(E) < 9: return E
    nb = cKDTree(E[:, :2]).query_ball_point(E[:, :2], 1.5); keep = E[:, 2] < np.array([np.median(E[n_, 2]) for n_ in nb]) + 1.0; pm = lab >= 0
    if pm.sum() >= 6:
        Q = P[pm]; d, i = cKDTree(Q[:, :2]).query(E[:, :2], k=min(8, len(Q)), distance_upper_bound=2.0); zq = np.where(np.isfinite(d), Q[np.minimum(i, len(Q) - 1), 2], -1e9).max(1)
        keep &= pm[ev] | ((E[:, 2] < np.maximum(zq, -1e8) + 0.5) & (zq > -1e8)) | ((zq < -1e8) & (E[:, 2] < np.percentile(Q[:, 2], 99) + 0.75))
    return E[keep]


def stats(dz):
    dz = np.abs(dz[~np.isnan(dz)])
    return (float(np.sqrt(np.mean(dz ** 2))), float(np.percentile(dz, 95)), float(np.median(dz))) if len(dz) else None


def draw(out, bi, poly, O, P, lab, fac, pl, E):
    from PIL import Image, ImageDraw
    x0, y0, x1, y1 = poly.bounds; sc = min(40, 1100 / max(x1 - x0, y1 - y0)); m = 1.5
    X = lambda x: (x - x0 + m) * sc; Y = lambda y: (y1 + m - y) * sc
    im = Image.new("RGB", (int((x1 - x0 + 2 * m) * sc), int((y1 - y0 + 2 * m) * sc)), (16, 16, 16)); dr = ImageDraw.Draw(im); rng = np.random.RandomState(3)
    cols = [tuple(int(v) for v in rng.randint(70, 255, 3)) for _ in range(len(pl) + 1)]
    for l, rs in fac:
        q = [(X(p[0] / 100 + O[0]), Y(p[1] / 100 + O[1])) for p in rs[0]]; dr.polygon(q, fill=tuple(v // 3 for v in cols[l])); dr.line(q + [q[0]], fill=(255, 255, 255), width=1)
        g = Polygon(np.array(rs[0]) / 100); c = g.representative_point(); s = math.hypot(pl[l][0], pl[l][1])
        dr.text((X(c.x + O[0]) - 14, Y(c.y + O[1]) - 5), "%.1f" % (pl[l] @ [c.x, c.y, 1]) + ("" if s < 0.02 else "/%d" % round(math.degrees(math.atan(s)))), fill=(255, 255, 255))
    for p, l in zip(P, lab):
        c = cols[l] if l >= 0 else (255, 0, 0); px, py = X(p[0] + O[0]), Y(p[1] + O[1]); dr.rectangle([px - 1, py - 1, px + 1, py + 1], fill=c)
    if len(E):                                         # white rings: check points more than 0.5 m off the model
        dz = model_z(fac, pl, O, E[:, 0], E[:, 1]) - E[:, 2]
        for p in E[np.abs(dz) > 0.5]: px, py = X(p[0] + O[0]), Y(p[1] + O[1]); dr.ellipse([px - 4, py - 4, px + 4, py + 4], outline=(255, 255, 255))
    im.save("%s/b%04d.png" % (out, bi))


# ---------------------------------------------------------------- all buildings
def main():
    a = [v for v in sys.argv[1:] if not v.startswith("--")]; LD, MAPJS, DETJS, OUT = a[:4]; CACHE = a[4] if len(a) > 4 else LD
    opt = dict(zip(sys.argv, sys.argv[1:])); t0 = time.time(); load(LD, MAPJS, DETJS, CACHE); nb = len(G["M"]["buildings"])
    only = [int(v) for v in opt["--only"].split(",")] if "--only" in opt else range(nb); dbg = opt.get("--debug")
    if dbg or len(only) < 40: R = [solve(i, dbg) for i in only]
    else:
        from multiprocessing import Pool
        with Pool(3) as pool: R = pool.map(solve, only, chunksize=8)
    report(R, time.time() - t0)
    if len(only) == nb:
        blob = bytearray()
        for r in R:
            blob += struct.pack("<Hhh", len(r["fac"]), int(round(r["O"][0] * 10)), int(round(r["O"][1] * 10))) if r["fac"] else struct.pack("<H", 0)
            for l, rs in r["fac"]:
                p = r["pl"][l]; blob += struct.pack("<hhhB", int(round(p[0] * QS)), int(round(p[1] * QS)), int(round(p[2] * 100)), len(rs))
                for ring in rs: blob += struct.pack("<H", len(ring)) + b"".join(struct.pack("<hh", *v) for v in ring)
        js = "/* lidar roof facets for buildings.js, written by tools/build_roofs.py (layout: see its header) */\nwindow.BLOOMFIELD_ROOFS=" + json.dumps(
            {"n": nb, "fallback": sum(1 for r in R if r["fb"]), "data": base64.b64encode(bytes(blob)).decode()}, separators=(",", ":")) + ";\n"
        open(OUT + "/roofs.js", "w").write(js); print("roofs.js %.2f MB, %d facets, %d outline points" % (len(js) / 1e6, sum(len(r["fac"]) for r in R), sum(len(q) for r in R for _, rs in r["fac"] for q in rs)))
        json.dump([{k: (v if not isinstance(v, np.ndarray) else v.tolist()) for k, v in r.items() if k not in ("fac", "pl", "O")} for r in R], open(CACHE + "/roof_report.json", "w"))


def report(R, secs):
    ok = [r for r in R if not r["fb"]]; fb = [r for r in R if r["fb"]]; names = G["M"]["buildings"]
    print("buildings %d, rebuilt from the scan %d, fallback to the one-roof description %d, %.0f s" % (len(R), len(ok), len(fb), secs))
    why = {}
    for r in fb: why[r["why"].split(" (")[0]] = why.get(r["why"].split(" (")[0], 0) + 1
    print("fallback reasons:", why)
    for name, rs in (("rebuilt", ok), ("all incl. fallbacks", R)):
        new = np.array([r["new"] for r in rs if r.get("new")])
        if not len(new): continue
        print("accuracy, %s, %d buildings with check points (vertical distance model - roof points): RMS median %.3f, 75%% %.3f, 90%% %.3f, 95%% %.3f; share under 0.3 m %.1f%%, under 0.6 m %.1f%%" % (
            name, len(new), *np.percentile(new[:, 0], [50, 75, 90, 95]), 100 * np.mean(new[:, 0] < 0.3), 100 * np.mean(new[:, 0] < 0.6)))
        print("  95th percentile per building: median %.3f, 90%% %.3f;  median abs error per building: median %.3f" % (*np.percentile(new[:, 1], [50, 90]), np.median(new[:, 2])))
    both = [(r["old"][0], r["new"][0]) for r in ok if r.get("new") and r.get("old")]
    if both: b = np.array(both); print("  the rebuilt ones with the old one-roof model: RMS median %.3f, 90%% %.3f" % tuple(np.percentile(b[:, 0], [50, 90])))
    sh = np.array([np.hypot(*r["shift"]) for r in R if "shift" in r]); print("registration shift: median %.2f m, moved %d, over 1 m %d" % (np.median(sh), (sh > 0).sum(), (sh > 1).sum()))
    if ok: print("facets per building: median %d, max %d, total %d (+ %d on fallbacks)" % (np.median([r["nfac"] for r in ok]), max(r["nfac"] for r in ok), sum(r["nfac"] for r in ok), sum(r["nfac"] for r in fb)))
    for r in sorted([r for r in R if r.get("new")], key=lambda r: -r["new"][0])[:20]:
        print("  worst #%d %s area %.0f rms %.2f p95 %.2f facets %d points %d %s" % (r["bi"], names[r["bi"]]["n"], r["area"], r["new"][0], r["new"][1], r["nfac"], r["npts"], r["why"]))


def selftest():
    """Two planes over an L-shaped footprint: the facets must tile it, twin every inner edge, and keep the lower envelope."""
    poly = orient(Polygon([(0, 0), (10, 0), (10, 6), (4, 6), (4, 12), (0, 12)]), 1.0); pl = np.array([[0.5, 0, 3.0], [-0.5, 0, 5.0]])
    cells = cut(poly, [canon(1.0, 0.0, 2.0)]); fac = assemble(cells, [int(np.argmin(pl[:, :2] @ np.array(c.representative_point().coords[0]) + pl[:, 2])) for c in cells])
    edges = {(p, q) for l, rs in fac for r in rs for p, q in zip(r, r[1:] + r[:1])}; area = sum(Polygon(np.array(rs[0]) / 100).area for l, rs in fac)
    assert len(fac) == 2 and abs(area - poly.area) < 1e-6, (len(fac), area)
    assert all((q, p) in edges or poly.exterior.distance(shapely.Point((p[0] + q[0]) / 200, (p[1] + q[1]) / 200)) < 1e-9 for p, q in edges)
    z = model_z(fac, pl, np.zeros(2), np.array([1.0, 3.0]), np.array([1.0, 1.0])); assert np.allclose(z, [3.5, 3.5]), z
    print("selftest ok")


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else main()
