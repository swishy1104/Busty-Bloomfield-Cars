"""Build the drivable road corridors that leave the Bloomfield town map, and the band south of it -> window.BLOOMFIELD_CORRIDORS.
  north: North Washington Street / State Road 157 out to a private property (coordinates given by the owner, nothing else used)
  west:  West Main Street / State Road 54 out to the Taco Bell, 1459 NE A St, Linton (Overture place + footprint)
  south: an area corridor, half a mile (805 m) deep along the whole south edge: every road, building, tree, power line, mailbox, creek
         and pond in x -2050..2050, y -2855..-2050 (and its margin)
Same open sources and frame as build_map.py / fetch_lidar.py / build_detail.py: Overture Maps (S3), USGS 1 m DEM and the 3DEP
lidar EPT IN_Statewide_Opt2_B4_2017 (S3), ESA WorldCover 10 m (S3), Terrarium tiles (S3). x = metres east, y = metres north of
the Greene County Courthouse (WORLD X = x, Z = -y).
Usage: python3 build_corridors.py <cache_dir> <game_dir (map.js, detail.js, terrain.png)> <out_dir>
Writes <out_dir>/corridors.js + corridor_north.png, corridor_west.png, corridor_south.png, corridor_far.png; check plots go to <cache_dir>/plot_*.png
Each corridor: id, length, start, terrain {file, x0, y1, step, nx, ny} (PNG: R, G = height, B = WorldCover class, 0 outside the strip), trees
(base64 <HHBB per tree: x, y from treeOrigin in 0.5 m, height in 0.25 m, crown radius in 1/8 m + 128 if evergreen), treeCount, treeOrigin,
roads [{p, h, c, n, w, l, g, s, b; the route also r, spans, bridges}], buildings [{p, e, r, t, k, n, f}], dest, mailboxes [[x, y, yaw]], power,
poles [[x, y, 0 pole | 1 tower]], water, creeks, rails, places.
The area (south) also has kind: "area"; band {x0, y0, x1, y1}: the drivable rectangle, its three outer sides the fence line; margin: the terrain
runs that far past the fence line (its outer 40 m eased into the far terrain); scenery: roads, trees and buildings run that far past it.
roads[0] is the main road (US 231: 2.5 m samples, spans and bridges, as a route); a road that continues a town road starts on the edge exactly
where that one stops, with t = its index in map.js roads, its measured width and its graded level; dest is only {paved: [], buildings: []}.
Town data note: terrain.png's south rows and west columns wrap round (see THF); world.js needs rows N-1, N-2 = row N-3 and columns 0, 1 = column 2."""
import sys, os, json, math, base64, struct, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
import shapely
from shapely.geometry import shape, box, LineString, Point, Polygon
from shapely.ops import unary_union, substring
from shapely import affinity

CACHE, GAME, OUT = sys.argv[1:4]
os.makedirs(CACHE + "/nodes", exist_ok=True); os.makedirs(CACHE + "/tiles", exist_ok=True)
LAT0, LON0 = 39.026262, -86.937919
p_ = math.radians(LAT0)
MY = 111132.92 - 559.82 * math.cos(2 * p_) + 1.175 * math.cos(4 * p_)
MX = 111412.84 * math.cos(p_) - 93.5 * math.cos(3 * p_) + 0.118 * math.cos(5 * p_)
HALF = 2050; TOWN = box(-HALF, -HALF, HALF, HALF)
STRIP, SCEN, ST, ST2 = 300, 260, 4, 2          # terrain half-width, scenery half-width, terrain step, lidar cell (m)
BASE, Q = 100.0, 0.02                           # height PNGs: h = BASE + (R*256 + G) * Q
FAR_STEP, FAR_BOX = 50, (-26000, -7000, 9000, 13000)   # x0, y0, x1, y1: nodes line up with the town's far ring (-7000 + 50 i)
WIDTH = {"primary": 9.5, "secondary": 8.5, "tertiary": 7.2, "residential": 6.6, "unclassified": 6.0,
         "service": 4.6, "unknown": 4.6, "track": 3.4}
S3 = "https://s3-us-west-2.amazonaws.com"
EPT = S3 + "/usgs-lidar-public/IN_Statewide_Opt2_B4_2017"
DEM = "/vsicurl/https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/IN_Indiana_Statewide_LiDAR_2017_B17/TIFF/USGS_1M_16_%s_IN_Indiana_Statewide_LiDAR_2017_B17.tif"
WC = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N%02dW%03d_Map.tif"
CORR = [dict(id="north", ref="157", dest_ll=(39.0820086, -86.9154826)),      # owner-given coordinates: never looked up anywhere
        dict(id="west", ref="54", dest_place="Taco Bell")]
AREA = dict(id="south", band=(-HALF, -HALF - 805, HALF, -HALF))    # x0, y0, x1, y1: half a mile along the whole south edge, fenced on its outer sides
MARGIN, AMARG = 100, 60                         # terrain past the fence line (outer 40 m eased into the far terrain); scenery past it
lonlat = lambda x, y: (LON0 + np.asarray(x) / MX, LAT0 + np.asarray(y) / MY)
to_xy = lambda g: affinity.affine_transform(g, [MX, 0, 0, MY, -LON0 * MX, -LAT0 * MY])
sstep = lambda t: (lambda c: c * c * (3 - 2 * c))(np.clip(t, 0, 1))
log = lambda *a: print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except Exception:
            if k == tries - 1: raise
            time.sleep(2 ** k)


# ---------------------------------------------------------------- Overture (cached geojson, one bbox for both corridors)
def overture(typ):
    f = f"{CACHE}/{typ}.geojson"
    if not os.path.exists(f):
        import pyarrow.dataset as ds, pyarrow.fs as fs, pyarrow.compute as pc
        W, S, E, N = -87.20, 39.00, -86.90, 39.095
        theme, cols = {"segment": ("transportation", ["id", "geometry", "subtype", "class", "names", "road_surface", "road_flags", "subclass", "width_rules", "routes"]),
                       "building": ("buildings", ["id", "geometry", "subtype", "class", "names", "height", "num_floors", "roof_shape"]),
                       "water": ("base", ["id", "geometry", "subtype", "class", "names"]),
                       "infrastructure": ("base", ["id", "geometry", "subtype", "class", "names"]),
                       "place": ("places", ["id", "geometry", "names", "categories", "addresses"])}[typ]
        s3 = fs.S3FileSystem(anonymous=True, region="us-west-2", proxy_options=os.environ.get("HTTPS_PROXY"))
        d = ds.dataset(f"overturemaps-us-west-2/release/2026-10-21.0/theme={theme}/type={typ}/", filesystem=s3)
        flt = (pc.field("bbox", "xmin") < E) & (pc.field("bbox", "xmax") > W) & (pc.field("bbox", "ymin") < N) & (pc.field("bbox", "ymax") > S)
        feats = []
        for r in d.to_table(filter=flt, columns=[c for c in cols if c in d.schema.names]).to_pylist():
            g = shapely.from_wkb(r.pop("geometry"))
            feats.append({"type": "Feature", "geometry": json.loads(shapely.to_geojson(g)), "properties": r})
        json.dump({"type": "FeatureCollection", "features": feats}, open(f, "w"), default=str)
    return json.load(open(f))["features"]


nm = lambda pr: (pr.get("names") or {}).get("primary")
flat = lambda coords, d=1: [round(v, d) for pt in coords for v in pt[:2]]


def parts(g, kind="LineString"):
    if g.is_empty: return []
    return [g] if g.geom_type == kind else [q for q in getattr(g, "geoms", []) if q.geom_type == kind]


# ---------------------------------------------------------------- the town it continues (map.js, detail.js, terrain.png)
TM = json.loads(open(GAME + "/map.js").read()[len("window.BLOOMFIELD="):-1])
TD = json.loads(open(GAME + "/detail.js").read()[len("window.BLOOMFIELD_DETAIL="):-1])
_t = np.asarray(Image.open(GAME + "/terrain.png").convert("RGB"), np.float32)
TT = TD["terrain"]; TH0 = TT["base"] + (_t[..., 0] * 256 + _t[..., 1]) * TT["q"]; del _t


def blur2(a):                                      # world.js: road level = terrain blurred twice with [1 4 6 4 1]/16
    for _ in range(2):
        a = ndi.convolve1d(ndi.convolve1d(a, np.array([1, 4, 6, 4, 1]) / 16, axis=1, mode="nearest"), np.array([1, 4, 6, 4, 1]) / 16, axis=0, mode="nearest")
    return a


TH = blur2(TH0)
# terrain.png's two south rows (y = -2050, -2047.5) are 72 % / a little the north edge row: build_detail.py's 1 m np.roll wrapped round
# (median +12.6 m, up to +37 m on the last row; rows further in match the USGS DEM to 1 cm). The south band grades against the town's
# levels with those rows taken from the third (THF); world.js wants the same 2-line fix (and the west columns 0, 1 from column 2).
THF = blur2(np.concatenate([TH0[:-2], TH0[-3:-2], TH0[-3:-2]]))
TSHIFT = 1.0       # build_detail.py rolled every lidar raster (DEM included) 1 m east and 1 m north to fit the footprints: same here


def town_h(x, y, TH=TH):                           # the town's road level (blurred terrain), bilinear
    fx = np.clip((np.asarray(x) + HALF) / TT["step"], 0, TT["n"] - 1.001); fz = np.clip((-np.asarray(y) + HALF) / TT["step"], 0, TT["n"] - 1.001)
    i = fx.astype(int); j = fz.astype(int); u = fx - i; v = fz - j
    return (TH[j, i] * (1 - u) + TH[j, i + 1] * u) * (1 - v) + (TH[j + 1, i] * (1 - u) + TH[j + 1, i + 1] * u) * v


# ---------------------------------------------------------------- roads -> graph, route by shortest path that prefers the state road
segs, rails, bridges = [], [], []
for f in overture("segment"):
    pr = f["properties"]; g = to_xy(shape(f["geometry"]))
    if pr["subtype"] == "rail":
        rails.append(g); continue
    cls = pr["class"]
    if pr["subtype"] != "road" or cls not in WIDTH: continue
    sub = pr.get("subclass"); surf = (pr.get("road_surface") or [{}])[0].get("value")
    w = 3.4 if sub == "driveway" else 14 if sub == "parking_aisle" else WIDTH[cls]
    for fl in pr.get("road_flags") or []:
        if "is_bridge" in (fl.get("values") or []):
            bt = fl.get("between") or [0, 1]; bridges.append(substring(g, bt[0], bt[1], normalized=True))
    segs.append(dict(g=g, c=cls, n=nm(pr), sub=sub, w=w, refs={r.get("ref") for r in pr.get("routes") or []},
                     gravel=int(surf == "unpaved" or (cls == "track" and surf != "paved"))))
bridge_u = unary_union(bridges)
key = {}; ei, ej, ew, es = [], [], [], []
for si, s in enumerate(segs):
    c = list(shapely.segmentize(s["g"], 10).coords)
    ids = [key.setdefault((round(x, 2), round(y, 2)), len(key)) for x, y in c]
    for k in range(len(c) - 1):
        ei.append(ids[k]); ej.append(ids[k + 1]); es.append(si); ew.append(math.dist(c[k], c[k + 1]))
NODE = np.array(list(key.keys())); ei, ej, es, ew = map(np.array, (ei, ej, es, ew))
log("road segments", len(segs), "graph nodes", len(NODE))


def route_for(C):
    ref = C["ref"]; onref = np.array([ref in segs[s]["refs"] for s in es])
    G = coo_matrix((np.concatenate([ew * np.where(onref, 1, 4)] * 2), (np.concatenate([ei, ej]), np.concatenate([ej, ei]))), shape=(len(NODE),) * 2).tocsr()
    refnodes = np.unique(np.concatenate([ei[onref], ej[onref]]))
    inside = refnodes[np.abs(NODE[refnodes]).max(1) < HALF - 1]
    s0 = inside[np.argmin(np.hypot(*(NODE[inside] - C["dest"]).T))]  # the state road vertex just inside the town edge, destination side
    t0 = refnodes[np.argmin(np.hypot(*(NODE[refnodes] - C["dest"]).T))]
    _, pred = dijkstra(G, indices=s0, return_predecessors=True)
    path = [t0]
    while path[-1] != s0: path.append(pred[path[-1]])
    line = LineString(NODE[path[::-1]])
    out = max(parts(line.difference(TOWN)), key=lambda q: q.length)  # starts exactly on the town edge
    ps = set(path); used = {es[k] for k in range(len(es)) if ei[k] in ps and ej[k] in ps}
    return out, sorted(used)


def resample(line, step):
    n = max(1, int(math.ceil(line.length / step)))
    return np.array([line.interpolate(k / n, normalized=True).coords[0] for k in range(n + 1)])


# ---------------------------------------------------------------- terrain sources
from rasterio.warp import transform as rtransform


def utm_fit(x0, y0, x1, y1):
    """local -> UTM 16N (NAD83) as a quadratic in x, y (cm residuals over 20 km; the plate-carree frame is not affine)."""
    gx, gy = [a.ravel() for a in np.meshgrid(np.linspace(x0, x1, 25), np.linspace(y0, y1, 25))]
    lo, la = lonlat(gx, gy); E, N = rtransform("EPSG:4269", "EPSG:26916", lo.tolist(), la.tolist())
    B = lambda x, y: np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1)
    ce, *_ = np.linalg.lstsq(B(gx, gy), np.array(E), rcond=None); cn, *_ = np.linalg.lstsq(B(gx, gy), np.array(N), rcond=None)
    res = max(np.abs(B(gx, gy) @ ce - E).max(), np.abs(B(gx, gy) @ cn - N).max())
    assert res < 0.2, res
    return lambda x, y: (ce[0] + ce[1] * x + ce[2] * y + ce[3] * x * x + ce[4] * x * y + ce[5] * y * y,
                         cn[0] + cn[1] * x + cn[2] * y + cn[3] * x * x + cn[4] * x * y + cn[5] * y * y)


def dem_mosaic(cid, bb):
    """USGS 1 m bare-earth DEM read at its 2 m overview over the corridor box -> sampler(x, y, sigma_px)."""
    f = f"{CACHE}/dem_{cid}.npz"; fit = utm_fit(*bb)
    cx = np.array([bb[0], bb[2], bb[0], bb[2]]); cy = np.array([bb[1], bb[1], bb[3], bb[3]]); E, N = fit(cx, cy)
    E0, N0 = int(E.min() // 2 * 2) - 20, int(N.min() // 2 * 2) - 20; E1, N1 = int(E.max() // 2 * 2) + 22, int(N.max() // 2 * 2) + 22
    if not os.path.exists(f):
        import rasterio
        from rasterio.windows import from_bounds
        from rasterio.enums import Resampling
        mos = np.full(((N1 - N0) // 2, (E1 - E0) // 2), np.nan, np.float32)
        for tx in range(E0 // 10000, (E1 - 1) // 10000 + 1):
            for ty in range(N0 // 10000, (N1 - 1) // 10000 + 1):
                with rasterio.open(DEM % f"x{tx}y{ty + 1}") as ds:
                    b = ds.bounds; w0, s0, e0, n0 = max(E0, math.ceil(b.left)), max(N0, math.ceil(b.bottom)), min(E1, int(b.right)), min(N1, int(b.top))
                    w0 += w0 % 2; s0 += s0 % 2; e0 -= e0 % 2; n0 -= n0 % 2
                    a = ds.read(1, window=from_bounds(w0, s0, e0, n0, ds.transform), out_shape=((n0 - s0) // 2, (e0 - w0) // 2), resampling=Resampling.average).astype(np.float32)
                    a[a < -1000] = np.nan; r0 = (N1 - n0) // 2; c0 = (w0 - E0) // 2; old = mos[r0:r0 + a.shape[0], c0:c0 + a.shape[1]]
                    old[np.isnan(old)] = a[np.isnan(old)]
                    log("dem tile", tx, ty + 1, a.shape, float(np.nanmin(a)), float(np.nanmax(a)))
        np.savez_compressed(f, mos=mos)
    mos = np.load(f)["mos"]
    if np.isnan(mos).any():
        log("dem gaps", int(np.isnan(mos).sum())); idx = ndi.distance_transform_edt(np.isnan(mos), return_distances=False, return_indices=True); mos = mos[tuple(idx)]
    cache = {}

    def at(x, y, sig):
        if sig not in cache: cache[sig] = ndi.gaussian_filter(mos, sig) if sig else mos
        e, n = fit(np.asarray(x, np.float64) - TSHIFT, np.asarray(y, np.float64) - TSHIFT)
        return ndi.map_coordinates(cache[sig], [(N1 - n) / 2 - 0.5, (e - E0) / 2 - 0.5], order=1, mode="nearest").astype(np.float32)
    return at


def worldcover(lonW, latS, lonE, latN):
    f = f"{CACHE}/wc_{lonW:.3f}_{latS:.3f}.npz"; R = 1 / 12000
    c0, c1 = math.floor((lonW + 180) / R), math.ceil((lonE + 180) / R); r0, r1 = math.floor((90 - latN) / R), math.ceil((90 - latS) / R)
    if not os.path.exists(f):
        import rasterio
        from rasterio.windows import Window
        out = np.zeros((r1 - r0, c1 - c0), np.uint8)
        for tla in (36, 39):
            for tlo in (-90, -87):
                tc, tr = round((tlo + 180) / R), round((90 - tla - 3) / R)
                a0, a1, b0, b1 = max(r0, tr), min(r1, tr + 36000), max(c0, tc), min(c1, tc + 36000)
                if a0 >= a1 or b0 >= b1: continue
                with rasterio.open(WC % (tla, -tlo)) as ds:
                    out[a0 - r0:a1 - r0, b0 - c0:b1 - c0] = ds.read(1, window=Window(b0 - tc, a0 - tr, b1 - b0, a1 - a0))
        np.savez_compressed(f, wc=out)
    wc = np.load(f)["wc"]
    # ponytail: constant offset measured once (WorldCover built-up pixels best overlay the Overture roads when read 8 m east, 6 m south
    # in both corridors); a per-tile fit would be the upgrade if the cover is ever used at the 10 m scale
    sx, sy = 8.0, -6.0

    def at(x, y):
        lo, la = lonlat(np.asarray(x) + sx, np.asarray(y) + sy)
        return wc[np.clip(((90 - la) / R - r0).astype(int), 0, wc.shape[0] - 1), np.clip(((lo + 180) / R - c0).astype(int), 0, wc.shape[1] - 1)]
    return at


def terrarium(x, y, z=12):
    """Mapzen Terrarium tiles (same source and zoom as the town's far ring), bilinear."""
    lo, la = lonlat(x, y)
    px = (lo + 180) / 360 * 2 ** z * 256 - 0.5; py = (1 - np.arcsinh(np.tan(np.radians(la))) / math.pi) / 2 * 2 ** z * 256 - 0.5
    X0, Y0 = int(px.min() // 256), int(py.min() // 256); X1, Y1 = int(px.max() // 256) + 1, int(py.max() // 256) + 1
    big = np.zeros(((Y1 - Y0 + 1) * 256, (X1 - X0 + 1) * 256), np.float32)
    for tx in range(X0, X1 + 1):
        for ty in range(Y0, Y1 + 1):
            f = f"{CACHE}/tiles/{z}_{tx}_{ty}.png"
            if not os.path.exists(f): open(f, "wb").write(get(f"{S3.replace('-us-west-2', '')}/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"))
            a = np.asarray(Image.open(f).convert("RGB"), np.float32)
            big[(ty - Y0) * 256:(ty - Y0 + 1) * 256, (tx - X0) * 256:(tx - X0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return ndi.map_coordinates(big, [py - Y0 * 256, px - X0 * 256], order=1)


def png16(h, b, path):
    q = np.clip(np.round((h - BASE) / Q), 0, 65535).astype(np.uint16)
    Image.fromarray(np.stack([q >> 8, q & 255, b], -1).astype(np.uint8)).save(path, optimize=True)


# far horizon terrain for both corridors (Terrarium z12 at 50 m, B = WorldCover class)
fx0, fy0, fx1, fy1 = FAR_BOX
FGX, FGY = np.meshgrid(np.arange(fx0, fx1 + 1, FAR_STEP, dtype=np.float64), np.arange(fy1, fy0 - 1, -FAR_STEP, dtype=np.float64))   # row 0 = north
FAR = terrarium(FGX, FGY)
wcf = worldcover(*lonlat(fx0 - 100, fy0 - 100), *lonlat(fx1 + 100, fy1 + 100))
png16(FAR, wcf(FGX, FGY), OUT + "/corridor_far.png")
far_at = lambda x, y: ndi.map_coordinates(FAR, [(fy1 - np.asarray(y)) / FAR_STEP, (np.asarray(x) - fx0) / FAR_STEP], order=1, mode="nearest")
tf = TM["far"]; tfa = np.frombuffer(base64.b64decode(tf["d"]), "<u2").reshape(tf["n"], tf["n"]) * 0.02 + TM["base"]
r0_, c0_ = (fy1 - tf["half"]) // FAR_STEP, (tf["half"] * -1 - fx0) // FAR_STEP
log("far", FAR.shape, float(FAR.min()), float(FAR.max()), "| against the town far ring: mean abs diff",
    round(float(np.abs(FAR[r0_:r0_ + tf["n"], c0_:c0_ + tf["n"]] - tfa).mean()), 3), "m")


# ---------------------------------------------------------------- lidar (EPT, Web Mercator octree): coarse levels along the strip, all levels at the destinations
RE = 6378137.0
ept = json.loads(get(EPT + "/ept.json")); EB = ept["bounds"]; ESIZE = EB[3] - EB[0]
merc = lambda x, y: (RE * np.radians(lonlat(x, y)[0]), RE * np.log(np.tan(np.pi / 4 + np.radians(lonlat(x, y)[1]) / 2)))


def ept_nodes(strip_m, dest_m, maxd=9):
    from shapely.prepared import prep
    ps, pd = prep(strip_m), prep(dest_m)

    def want(d, x, y):
        s = ESIZE / 2 ** d; b = box(EB[0] + x * s, EB[1] + y * s, EB[0] + (x + 1) * s, EB[1] + (y + 1) * s)
        return pd.intersects(b) or (d <= maxd and ps.intersects(b))
    nodes, todo = [], [("0-0-0-0", json.loads(get(EPT + "/ept-hierarchy/0-0-0-0.json")))]
    pool = ThreadPoolExecutor(12)
    while todo:
        subs = []
        for root, h in todo:
            stack = [root]
            while stack:
                k = stack.pop(); d, x, y, z = map(int, k.split("-")); n = h.get(k)
                if n is None or not want(d, x, y): continue
                if n == -1 and k != root: subs.append(k); continue
                if n > 0: nodes.append(k)
                stack += [f"{d + 1}-{2 * x + (c & 1)}-{2 * y + (c >> 1 & 1)}-{2 * z + (c >> 2)}" for c in range(8)]
        todo = list(zip(subs, pool.map(lambda k: json.loads(get(f"{EPT}/ept-hierarchy/{k}.json")), subs)))
    return nodes


def ept_points(k):
    import laspy
    f = f"{CACHE}/nodes/{k}.laz"
    if not os.path.exists(f):
        open(f + ".part", "wb").write(get(f"{EPT}/ept-data/{k}.laz")); os.replace(f + ".part", f)
    las = laspy.read(f); cls = np.asarray(las.classification); ok = (cls != 7) & (cls != 18)
    X = np.asarray(las.x)[ok]; Y = np.asarray(las.y)[ok]
    lon = np.degrees(X / RE); lat = np.degrees(2 * np.arctan(np.exp(Y / RE)) - np.pi / 2)
    return ((lon - LON0) * MX + TSHIFT, (lat - LAT0) * MY + TSHIFT, np.asarray(las.z)[ok].astype(np.float32), cls[ok],
            np.asarray(las.intensity)[ok].astype(np.float32), np.asarray(las.number_of_returns)[ok] > 1)


class Grid:
    """cells of size c over [x0, x0 + nx*c) x (y1 - ny*c, y1], row 0 = north"""
    def __init__(s, x0, y1, nx, ny, c): s.x0, s.y1, s.nx, s.ny, s.c = x0, y1, nx, ny, c

    def idx(s, x, y):
        ci = np.floor((x - s.x0) / s.c).astype(np.int64); ri = np.floor((s.y1 - y) / s.c).astype(np.int64)
        ok = (ci >= 0) & (ci < s.nx) & (ri >= 0) & (ri < s.ny); return ri * s.nx + ci, ok

    def centres(s):
        return np.meshgrid(s.x0 + (np.arange(s.nx) + 0.5) * s.c, s.y1 - (np.arange(s.ny) + 0.5) * s.c)


def lidar_bin(cid, keys, g2, gds):
    f = f"{CACHE}/lidar_{cid}.npz"
    if os.path.exists(f): return dict(np.load(f))
    N2 = g2.nx * g2.ny; out = dict(dsm=np.full(N2, -1e9, np.float32), cnt=np.zeros(N2, np.uint16), gcnt=np.zeros(N2, np.uint16), wcnt=np.zeros(N2, np.uint16), mcnt=np.zeros(N2, np.uint16))
    for j, gd in enumerate(gds):
        n1 = gd.nx * gd.ny
        out.update({f"d{j}_dsm": np.full(n1, -1e9, np.float32), f"d{j}_cnt": np.zeros(n1, np.uint16), f"d{j}_gcnt": np.zeros(n1, np.uint16),
                    f"d{j}_isum1": np.zeros(n1, np.float32), f"d{j}_gcnt1": np.zeros(n1, np.uint16)})
    t0, tot = time.time(), 0
    with ThreadPoolExecutor(8) as pool:
        for i, (x, y, z, cls, inten, mr) in enumerate(pool.map(ept_points, keys)):
            tot += len(x); k, ok = g2.idx(x, y); k, zz, cc = k[ok], z[ok], cls[ok]
            np.maximum.at(out["dsm"], k, zz); np.add.at(out["cnt"], k, 1); np.add.at(out["gcnt"], k[cc == 2], 1); np.add.at(out["wcnt"], k[cc == 9], 1)
            np.add.at(out["mcnt"], k[mr[ok]], 1)
            for j, gd in enumerate(gds):
                k, ok = gd.idx(x, y); k, zz, cc, it, m1 = k[ok], z[ok], cls[ok], inten[ok], mr[ok]
                np.maximum.at(out[f"d{j}_dsm"], k, zz); np.add.at(out[f"d{j}_cnt"], k, 1); np.add.at(out[f"d{j}_gcnt"], k[cc == 2], 1)
                g1 = (cc == 2) & ~m1; np.add.at(out[f"d{j}_isum1"], k[g1], it[g1]); np.add.at(out[f"d{j}_gcnt1"], k[g1], 1)
            if i % 300 == 0: log(f"  lidar {cid}: {i}/{len(keys)} nodes, {tot / 1e6:.1f} M points, {time.time() - t0:.0f} s")
    log(f"  lidar {cid}: {tot / 1e6:.1f} M points")
    np.savez_compressed(f, **out)
    return out


# ---------------------------------------------------------------- roofs: eave, rise and type from the points on a footprint (build_detail.py's rule)
def roof_fit(P, nd, g):
    """P: footprint ring (n,2) in metres; nd: height-above-ground raster on grid g -> (eave, rise, type) or None"""
    c = g.c; c0 = int((P[:, 0].min() - g.x0) / c) - 1; c1 = int((P[:, 0].max() - g.x0) / c) + 2; r0 = int((g.y1 - P[:, 1].max()) / c) - 1; r1 = int((g.y1 - P[:, 1].min()) / c) + 2
    c0, r0, c1, r1 = max(c0, 0), max(r0, 0), min(c1, g.nx), min(r1, g.ny)
    if c1 - c0 < 1 or r1 - r0 < 1: return None
    im = Image.new("L", (c1 - c0, r1 - r0), 0); ImageDraw.Draw(im).polygon([((x - g.x0) / c - c0, (g.y1 - y) / c - r0) for x, y in P], fill=1)
    m = np.asarray(im) > 0
    if m.sum() * c * c > 60: m = ndi.binary_erosion(m)
    h = nd[r0:r1, c0:c1]; ok = m & (h > 1.2)
    if ok.sum() < max(3 if c > 1 else 6, 0.3 * m.sum()): return None
    hs = h[ok]; lo, med, hi = np.percentile(hs, [15, 50, 96]); best = None
    for k in range(len(P)):
        e = P[(k + 1) % len(P)] - P[k]; L = math.hypot(*e)
        if L < 1: continue
        ux = e / L; vx = np.array([-ux[1], ux[0]]); a = P @ ux; bb = P @ vx; ar = np.ptp(a) * np.ptp(bb)
        if best is None or ar < best[0]: best = (ar, ux, vx, (a.max() + a.min()) / 2, (bb.max() + bb.min()) / 2, np.ptp(a) / 2, np.ptp(bb) / 2)
    _, ux, vx, ca, cb, ha, hb = best
    if hb > ha: ux, vx, ca, cb, ha, hb = vx, ux, cb, ca, hb, ha
    ri, ci = np.nonzero(ok); X = g.x0 + (ci + c0 + 0.5) * c; Y = g.y1 - (ri + r0 + 0.5) * c
    u = np.abs(X * ux[0] + Y * ux[1] - ca); v = np.abs(X * vx[0] + Y * vx[1] - cb)

    def fit(t):
        A = np.stack([np.ones_like(t), -t], 1); co, *_ = np.linalg.lstsq(A, hs, rcond=None); res = hs - A @ co
        return co[1], 1 - res.var() / max(hs.var(), 1e-6)
    kv, r2v = fit(v); ku, r2u = fit(u)
    typ, eave, rise = 0, med, 0.0
    if hi - lo > 1.0 and max(kv, ku) > 0.08 and m.sum() * c * c < 1500:
        typ = 1 if r2v >= r2u and kv > 0.08 else 2
        if min(r2u, r2v) > 0.18 and min(ku, kv) > 0.12 and ha < 2.2 * hb: typ = 3
        eave, rise = lo, hi - lo
    eave = float(np.clip(eave, 2.2, 25)); rise = float(np.clip(rise, 0, min(6.5, 1.2 * (hb if typ != 2 else ha))))
    if typ and rise < 0.5: typ, eave, rise = 0, med, 0.0
    return round(eave, 1), round(rise, 1), typ


def poly_from_mask(mask, g, simp=0.8):
    """raster mask -> shapely polygons in metres (row runs merged)"""
    boxes = []
    for r in range(mask.shape[0]):
        row = np.concatenate([[0], mask[r].astype(np.int8), [0]]); d = np.diff(row); a = np.nonzero(d == 1)[0]; b = np.nonzero(d == -1)[0]
        boxes += [box(g.x0 + a_ * g.c, g.y1 - (r + 1) * g.c, g.x0 + b_ * g.c, g.y1 - r * g.c) for a_, b_ in zip(a, b)]
    return parts(unary_union(boxes).simplify(simp), "Polygon") if boxes else []


# ---------------------------------------------------------------- one corridor
places = [(to_xy(shape(f["geometry"])), f["properties"]) for f in overture("place")]
blds_all = [(to_xy(shape(f["geometry"])), f["properties"]) for f in overture("building")]
infra = [(to_xy(shape(f["geometry"])), f["properties"]) for f in overture("infrastructure")]
water_all = [(to_xy(shape(f["geometry"])), f["properties"]) for f in overture("water")]
for C in CORR:
    if "dest_ll" in C: C["dest"] = np.array([(C["dest_ll"][1] - LON0) * MX, (C["dest_ll"][0] - LAT0) * MY])
    else:
        g, pr = min(((g, pr) for g, pr in places if (nm(pr) or "").lower() == C["dest_place"].lower()), key=lambda q: abs(q[0].x + 18000))
        C["dest"] = np.array([g.x, g.y]); C["address"] = ((pr.get("addresses") or [{}])[0]).get("freeform")
OUTJS = {"frame": "x east, y north (m) of the courthouse; WORLD X = x, Z = -y", "base": BASE, "q": Q,
         "far": {"file": "corridor_far.png", "x0": fx0, "y1": fy1, "step": FAR_STEP, "nx": FGX.shape[1], "ny": FGX.shape[0]}, "corridors": []}

# ---------------------------------------------------------------- road levels on the current corridor's `dem`: smoothed bare earth (~3.6 m,
# like the town), bridges straight between abutments; cap: grade at most 12 %
def levels(P, bridge=None, close=6):
    h = dem(P[:, 0], P[:, 1], 1.8).astype(np.float64)
    h = ndi.grey_closing(h, size=2 * close + 1, mode="nearest")      # culverts: the hydro-flattened DEM cuts a notch through the road
    if bridge is not None and bridge.any():
        lab, n = ndi.label(bridge)
        for j in range(1, n + 1):
            ii = np.nonzero(lab == j)[0]; a, b = max(ii[0] - 2, 0), min(ii[-1] + 2, len(h) - 1)
            h[a:b + 1] = np.interp(np.arange(a, b + 1), [a, b], [h[a], h[b]])
    h = ndi.gaussian_filter1d(h, 2, mode="nearest")
    return h

def cap(h, P, g=0.12):
    d = np.r_[0, np.hypot(*np.diff(P, axis=0).T)] * g; f = h.copy()
    for k in range(1, len(f)): f[k] = max(f[k], f[k - 1] - d[k])
    for k in range(len(f) - 2, -1, -1): f[k] = max(f[k], f[k + 1] - d[k + 1])
    return f

for C in CORR:
    cid = C["id"]; log("=== corridor", cid, "dest", C["dest"].round(1))
    route, used = route_for(C)
    # --- the town road it continues: same Overture line, so the same edge point; width measured by build_detail.py
    p0 = np.array(route.coords[0]); best = (1e9, None)
    for i, r in enumerate(TM["roads"]):
        P = np.array(r["p"]).reshape(-1, 2)
        for q in (P[0], P[-1]):
            if math.dist(q, p0) < best[0]: best = (math.dist(q, p0), i)
    tr = TM["roads"][best[1]]; tw = TD["widths"][best[1]]
    log("route", round(route.length), "m; town road", best[1], tr["n"], tr["c"], "width", tw, "edge gap", round(best[0], 2), "m")
    R = resample(route, 2.5)
    # attributes along the route from the Overture segments it uses
    usedg = [segs[s] for s in used]
    near = [min(range(len(usedg)), key=lambda k: usedg[k]["g"].distance(Point(*q))) for q in R]
    isbr = np.array([bridge_u.distance(Point(*q)) < 0.8 for q in R]) if not bridge_u.is_empty else np.zeros(len(R), bool)
    spans, k0 = [], 0
    for k in range(1, len(R) + 1):
        if k == len(R) or (usedg[near[k]]["n"], usedg[near[k]]["c"]) != (usedg[near[k0]]["n"], usedg[near[k0]]["c"]):
            s = usedg[near[k0]]; spans.append([k0, k - 1, s["c"], s["n"] or "", "/".join(sorted(r for r in s["refs"] if r))]); k0 = k
    # merge 1-sample flickers at segment joints
    spans = [sp for sp in spans if sp[1] - sp[0] > 2 or len(spans) == 1]
    for a, b in zip(spans, spans[1:]): a[1] = b[0] - 1
    spans[0][0] = 0; spans[-1][1] = len(R) - 1

    # --- strip geometry and grids
    dest_disc = Point(*C["dest"]).buffer(130)
    scen = (route.buffer(SCEN) | dest_disc.buffer(-20)).difference(TOWN)
    strip = route.buffer(STRIP) | dest_disc.buffer(STRIP - 130)
    bx0, by0, bx1, by1 = strip.bounds
    gx0 = -HALF + ST * math.floor((bx0 + HALF) / ST); gy1 = HALF + ST * math.ceil((by1 - HALF) / ST)       # nodes line up with the town edge
    nx = int(math.ceil((bx1 - gx0) / ST)) + 1; ny = int(math.ceil((gy1 - by0) / ST)) + 1
    GX, GY = np.meshgrid(gx0 + np.arange(nx) * ST, gy1 - np.arange(ny) * ST)
    dem = dem_mosaic(cid, (gx0 - 60, gy1 - ny * ST - 60, gx0 + nx * ST + 60, gy1 + 60))
    wcov = worldcover(*lonlat(gx0 - 100, gy1 - ny * ST - 100), *lonlat(gx0 + nx * ST + 100, gy1 + 100))

    # --- side roads, driveways, stubs: every other road inside the scenery strip (so cross roads become ~260 m stubs)
    rbuf = route.buffer(0.6)
    roads = []
    for si, s in enumerate(segs):
        if not s["g"].intersects(scen): continue
        for q in parts(s["g"].difference(rbuf).intersection(scen)):
            if q.length >= 12: roads.append(dict(s, g=q, w=tw if C["ref"] in s["refs"] else s["w"]))
    log("side roads", len(roads), "km", round(sum(r["g"].length for r in roads) / 1000, 1))

    RH = cap(levels(R, isbr, 10), R)
    th = float(town_h(*p0)); log("route start level", round(RH[0], 2), "town road level there", round(th, 2))
    RH += (th - RH[0]) * np.clip(1 - np.arange(len(R)) * 2.5 / 40, 0, 1)        # meet the town road's own level at the edge
    rhw = tw / 2; rtree = cKDTree(R)
    for r in roads:
        P = resample(r["g"], 2.5); h = levels(P); d, k = rtree.query(P)
        wgt = sstep(1 - (d - rhw - 2) / 20); h = h + (RH[k] - h) * wgt
        r["P"], r["H"] = P, (cap(h, P) if r["c"] != "track" else h)

    # --- terrain: DEM at 4 m, roads pressed in (flat to 3.6 m past the edge, eased over 6 m), outer 40 m eased into the far terrain
    dR, _ = rtree.query(np.stack([GX.ravel(), GY.ravel()], 1), distance_upper_bound=STRIP + 20)
    dR = dR.reshape(GX.shape)
    inside = np.maximum(np.abs(GX), np.abs(GY)) < HALF - 8                      # keep an 8 m overlap with the town grid
    mask = (dR <= STRIP) & ~inside
    T = np.zeros(GX.shape, np.float32); T[mask] = dem(GX[mask], GY[mask], 0.75)
    smp = [(R, RH, np.full(len(R), rhw), ~isbr | (np.abs(dem(*R.T, 0) - RH) < 3))]
    smp += [(r["P"], r["H"], np.full(len(r["P"]), r["w"] / 2), np.ones(len(r["P"]), bool)) for r in roads]
    SP = np.concatenate([s[0] for s in smp]); SH = np.concatenate([s[1] for s in smp]); SW = np.concatenate([s[2] for s in smp]); SK = np.concatenate([s[3] for s in smp])
    SP, SH, SW = SP[SK], SH[SK], SW[SK]
    dd, kk = cKDTree(SP).query(np.stack([GX[mask], GY[mask]], 1), k=6, distance_upper_bound=30)
    ok = np.isfinite(dd); e = np.where(ok, dd - SW[np.minimum(kk, len(SW) - 1)], 99); j = e.argmin(1); e = e[np.arange(len(j)), j]
    rh = SH[np.minimum(kk[np.arange(len(j)), j], len(SH) - 1)]
    t = T[mask]; wgt = np.where(e <= 3.6, 1, 1 - sstep((e - 3.6) / 6)) * (e < 9.6); t = t + (rh - t) * wgt
    edgew = sstep((dR[mask] - (STRIP - 40)) / 40) * sstep((np.maximum(np.abs(GX[mask]), np.abs(GY[mask])) - HALF) / 60)
    t = t + (far_at(GX[mask], GY[mask]) - t) * edgew; T[mask] = t
    cov = np.where(mask, wcov(GX, GY), 0).astype(np.uint8); cov[mask & (cov == 0)] = 30
    png16(np.where(mask, T, BASE), cov, f"{OUT}/corridor_{cid}.png")
    log("terrain", T.shape, "cells in strip", int(mask.sum()), "h", float(T[mask].min()), float(T[mask].max()))
    hAt = lambda x, y: float(ndi.map_coordinates(T, [[(gy1 - y) / ST], [(x - gx0) / ST]], order=1, mode="nearest")[0])

    # --- lidar: 2 m grid along the strip (coarse octree levels), 1 m grid at the destination (every level)
    g2 = Grid(gx0, gy1, int(nx * ST / ST2), int(ny * ST / ST2), ST2)
    gd = Grid(math.floor(C["dest"][0] - 130), math.ceil(C["dest"][1] + 130), 260, 260, 1)
    mpoly = lambda geom: shapely.transform(geom.simplify(5), lambda a: np.stack(merc(a[:, 0], a[:, 1]), 1))
    fkeys = f"{CACHE}/keys_{cid}.json"
    if not os.path.exists(fkeys): json.dump(ept_nodes(mpoly(route.buffer(SCEN + 15) | dest_disc), mpoly(dest_disc)), open(fkeys, "w"))
    keys = json.load(open(fkeys)); log("lidar nodes", len(keys))
    L = lidar_bin(cid, keys, g2, [gd])
    CX, CY = g2.centres()
    dsm = L["dsm"].reshape(g2.ny, g2.nx); cnt = L["cnt"].reshape(dsm.shape).astype(np.float32); gcnt = L["gcnt"].reshape(dsm.shape).astype(np.float32)
    nd = np.where(dsm > -1e8, dsm - dem(CX, CY, 0), 0).clip(0, 60)

    # --- buildings (Overture footprints in the scenery strip) with roofs from the lidar
    bl = []
    for g, pr in blds_all:
        for poly in parts(g, "Polygon"):
            if poly.area < 12 or not scen.contains(poly.centroid): continue
            bl.append((poly, pr))
    bmask = np.zeros(dsm.shape, bool)
    if bl:
        im = Image.new("L", (g2.nx, g2.ny), 0); dr = ImageDraw.Draw(im)
        for poly, _ in bl: dr.polygon([((x - g2.x0) / ST2, (g2.y1 - y) / ST2) for x, y in poly.exterior.coords], fill=1)
        bmask = np.asarray(im) > 0
    sh = max(((np.roll(np.roll((nd > 2.2), dy, 0), dx, 1) & bmask).sum(), dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    log("lidar/footprint shift (2 m cells)", sh[1:]); nd = np.roll(np.roll(nd, sh[2], 0), sh[1], 1)
    dsmd = L["d0_dsm"].reshape(gd.ny, gd.nx); DX, DY = gd.centres(); ndd = np.where(dsmd > -1e8, dsmd - dem(DX, DY, 0), 0).clip(0, 60)
    im = Image.new("L", (gd.nx, gd.ny), 0); dr = ImageDraw.Draw(im)
    for poly, _ in bl: dr.polygon([((x - gd.x0), (gd.y1 - y)) for x, y in poly.exterior.coords], fill=1)
    bm_d = np.asarray(im) > 0
    shd = max(((np.roll(np.roll((ndd > 2.2), dy, 0), dx, 1) & bm_d).sum(), dx, dy) for dy in range(-3, 4) for dx in range(-3, 4))
    log("destination lidar shift (1 m)", shd[1:]); ndd = np.roll(np.roll(ndd, shd[2], 0), shd[1], 1)
    buildings, stats = [], [0, 0, 0, 0, 0]
    for poly, pr in bl:
        P = np.array(poly.simplify(0.4).exterior.coords)[:-1]
        if len(P) < 3: continue
        indest = gd.x0 + 5 < P[:, 0].min() and P[:, 0].max() < gd.x0 + gd.nx - 5 and gd.y1 - gd.ny + 5 < P[:, 1].min() and P[:, 1].max() < gd.y1 - 5
        rf = roof_fit(P, ndd, gd) if indest else roof_fit(P, nd, g2)
        if rf is None: stats[4] += 1; rf = (0, 0, 0)
        else: stats[rf[2]] += 1
        buildings.append({"p": flat(P), "e": rf[0], "r": rf[1], "t": rf[2], "k": pr.get("class") or "", "n": nm(pr) or "",
                          "f": round(hAt(*poly.centroid.coords[0]), 2)})
    log("buildings", len(buildings), "flat/gable/cross/hip/none", stats)

    # --- trees: crown tops in the canopy height model (leaf-off scan; evergreens are the crowns the laser cannot see through)
    road_d, _ = cKDTree(SP).query(np.stack([CX.ravel(), CY.ravel()], 1), distance_upper_bound=15); road_d = road_d.reshape(CX.shape)
    rdist, _ = rtree.query(np.stack([CX.ravel(), CY.ravel()], 1), distance_upper_bound=SCEN + 50); rdist = rdist.reshape(CX.shape)
    cov2 = wcov(CX, CY); wat = (L["wcnt"].reshape(dsm.shape) > 0) | (cov2 == 80)
    chm = nd.copy(); chm[ndi.binary_dilation(bmask, iterations=1) | wat | (road_d < 5)] = 0
    chm = ndi.gaussian_filter(np.where(ndi.binary_opening(chm > 2.5, np.ones((2, 2))), chm, 0), 0.5)
    deep = (cov2 == 10) & (rdist > 80)
    top = (chm > 3) & ((chm == ndi.maximum_filter(chm, 4)) & ~deep | (chm == ndi.maximum_filter(chm, 7)) & deep) & (rdist <= SCEN) & \
          (np.maximum(np.abs(CX), np.abs(CY)) > HALF + 4)
    gfrac = ndi.uniform_filter(gcnt, 3) / np.maximum(ndi.uniform_filter(cnt, 3), 0.01)
    mfrac = ndi.uniform_filter(L["mcnt"].reshape(dsm.shape).astype(np.float32), 3) / np.maximum(ndi.uniform_filter(cnt, 3), 0.01)
    solid = top & (mfrac < 0.1); top &= ~solid          # trucks, light poles, signs: the laser gets one clean echo, a bare crown gives several
    log("tree tops dropped as solid objects", int(solid.sum()))
    ri, ci = np.nonzero(top); tb = bytearray(); ne = 0
    oy = gy1 - ny * ST
    for r, c in zip(ri, ci):
        if not (6 <= r < g2.ny - 6 and 6 <= c < g2.nx - 6): continue
        H = float(chm[r, c]); rad = []
        for a in np.arange(8) * math.pi / 4:
            j = 1
            while j < 5:
                hh = chm[int(round(r - math.sin(a) * j)), int(round(c + math.cos(a) * j))]
                if hh < 0.45 * H or hh > H * 1.02: break
                j += 1
            rad.append((j - 0.5) * ST2)
        cr = float(np.clip(np.median(rad), 1.5, 9)); ev = gfrac[r, c] < 0.06 and H > 4; ne += ev
        tb += struct.pack("<HHBB", int(round((CX[r, c] - gx0) * 2)), int(round((CY[r, c] - oy) * 2)), int(min(255, round(H * 4))), int(min(127, round(cr * 8))) | (128 if ev else 0))
    log("trees", len(tb) // 6, "evergreen", ne)

    # --- destination lot: footprint(s), paved ground from the laser reflectance at 1 m, sign
    D = C["dest"]; gc1 = L["d0_gcnt1"].reshape(ndd.shape); I = np.where(gc1 > 0, L["d0_isum1"].reshape(ndd.shape) / np.maximum(gc1, 1), np.nan)
    I = np.roll(np.roll(I, shd[2], 0), shd[1], 1)
    for _ in range(6):
        hole = np.isnan(I)
        if not hole.any(): break
        f_ = np.nan_to_num(I); w_ = (~hole).astype(np.float32); s_ = ndi.uniform_filter(f_, 3); ws = ndi.uniform_filter(w_, 3)
        I = np.where(hole & (ws > 0), s_ / np.maximum(ws, 1e-6), I)
    I = ndi.median_filter(np.nan_to_num(I, nan=np.nanmedian(I)), 3)
    _, rk = rtree.query(np.stack([DX.ravel(), DY.ravel()], 1)); dRd = np.hypot(DX.ravel() - R[rk, 0], DY.ravel() - R[rk, 1]).reshape(DX.shape)
    asphalt = np.median(I[dRd < rhw - 1.5]) if (dRd < rhw - 1.5).any() else 20000
    gm = (ndi.distance_transform_edt(~bm_d) > 8) & (dRd > 30) & (ndd < 0.3) & (wcov(DX, DY) != 50)
    grass = np.median(I[gm]) if gm.any() else asphalt * 1.6
    thr = (asphalt + grass) / 2
    paved = (I < thr) & (ndd < 0.6) & ~ndi.binary_dilation(bm_d, iterations=1) & (dRd > rhw + 0.5) & (np.hypot(DX - D[0], DY - D[1]) < 110)
    paved = ndi.binary_opening(paved, np.ones((2, 2)))
    lab, n = ndi.label(paved); sizes = ndi.sum(paved, lab, np.arange(1, n + 1)); paved = np.isin(lab, np.nonzero(sizes >= 25)[0] + 1)
    pav = [q for q in poly_from_mask(paved, gd) if q.area >= 25]
    dark = (I < thr) & (ndd < 0.6); wm = []                  # check: pavement width across the route near the destination
    for k in range(len(R) - 80, len(R) - 4, 4):
        t_ = R[k + 1] - R[k - 1]; n_ = np.array([-t_[1], t_[0]]) / np.linalg.norm(t_); run = []
        for sg in (1, -1):
            j_, miss, last = 0, 0, 0
            while j_ < 30 and miss < 3:
                j_ += 1; x_, y_ = R[k] + n_ * sg * j_ * 0.5; ci_, ri_ = int(x_ - gd.x0), int(gd.y1 - y_)
                if not (0 <= ci_ < gd.nx and 0 <= ri_ < gd.ny): break
                if dark[ri_, ci_]: last, miss = j_, 0
                else: miss += 1
            run.append(last * 0.5)
        wm.append(sum(run))
    log("pavement width measured across the route at the destination: median", round(float(np.median(wm)), 1) if wm else None, "m; route width", tw)
    log("destination reflectance asphalt", round(asphalt), "grass", round(grass), "-> paved polygons", len(pav), "m2", round(sum(q.area for q in pav)))
    dbl = [b for b in buildings if Polygon(np.array(b["p"]).reshape(-1, 2)).distance(Point(*D)) < 40]
    dest = {"x": round(float(D[0]), 1), "y": round(float(D[1]), 1), "h": round(hAt(*D), 2), "buildings": [buildings.index(b) for b in dbl],
            "paved": [flat(q.exterior.coords[:-1]) for q in pav]}
    if "address" in C: dest["name"] = C["dest_place"]; dest["address"] = C["address"]
    if "dest_place" in C and dbl:
        # pole sign: a small, tall, solid object near the frontage that is not the building
        bpoly = Polygon(np.array(dbl[0]["p"]).reshape(-1, 2))
        lab, n = ndi.label((ndd > 2.5) & ~ndi.binary_dilation(bm_d, iterations=2))
        sh_ = lambda a: np.roll(np.roll(a.reshape(ndd.shape).astype(np.float32), shd[2], 0), shd[1], 1)
        gcd, cnd = sh_(L["d0_gcnt"]), sh_(L["d0_cnt"])
        cands = []
        for j, sl in enumerate(ndi.find_objects(lab), 1):
            m_ = lab[sl] == j; a_ = int(m_.sum()); hmax = float(ndd[sl][m_].max())
            if not (1 <= a_ <= 14 and 4.5 <= hmax <= 16): continue
            rr_, cc_ = np.nonzero(m_); x_ = gd.x0 + sl[1].start + cc_.mean() + 0.5; y_ = gd.y1 - sl[0].start - rr_.mean() - 0.5
            dfront = float(np.hypot(*(R[rtree.query([x_, y_])[1]] - (x_, y_)))); db = bpoly.distance(Point(x_, y_))
            gf = float(gcd[sl][m_].sum() / max(cnd[sl][m_].sum(), 1))      # ground seen through it: high for bare trees, low for a sign
            if dfront < 30 and db < 60 and a_ >= 3 and gf < 0.35: cands.append((round(dfront + 0.3 * db - 0.5 * hmax, 1), round(x_, 1), round(y_, 1), round(hmax, 1), a_, round(gf, 2)))
        if cands:
            c_ = min(cands); dest["sign"] = {"x": c_[1], "y": c_[2], "h": c_[3], "src": "lidar"}
        log("sign candidates", sorted(cands)[:4])
        dest["parking"] = [flat(g.exterior.coords[:-1]) for g, pr in infra if pr["class"] == "parking" and g.geom_type == "Polygon" and g.distance(bpoly) < 30]
    if "dest_ll" in C:
        # the drive from the highway to the given point: Overture driveway if one ends near it, else straight in from the nearest route point
        dw = [r for r in roads if r["sub"] in ("driveway", None) and r["c"] in ("service", "track", "unknown") and r["g"].distance(Point(*D)) < 40]
        if dw: dest["driveway"] = [roads.index(r) + 1 for r in dw]                 # index into the output roads (0 = route)
        else:
            k = int(rtree.query(D)[1]); a = R[k]; v = (D - a) / max(np.linalg.norm(D - a), 1)
            Pd = np.array([a + v * (rhw - 0.5), D - v * 8]); g_ = LineString(Pd); P = resample(g_, 2.5); h = levels(P); d_, k_ = rtree.query(P)
            h = h + (RH[k_] - h) * sstep(1 - (d_ - rhw - 2) / 20)
            roads.append(dict(g=g_, c="service", n="", sub="driveway", w=3.4, refs=set(), gravel=0, P=P, H=h, synth=1)); dest["driveway"] = [len(roads)]
    log("destination", dest | {"paved": len(dest["paved"])})

    # --- mailboxes at driveway mouths on the route, Overture power lines / poles, water, rails, named places in the strip
    mb = []
    for r in roads:
        if r["c"] in ("service", "track", "unknown") and r["sub"] != "parking_aisle":
            for P in (r["P"][0], r["P"][-1]):
                d, k = rtree.query(P)
                if d < rhw + 3:
                    t_ = R[min(k + 1, len(R) - 1)] - R[max(k - 1, 0)]; t_ = t_ / np.linalg.norm(t_); n_ = np.array([-t_[1], t_[0]])
                    side = 1 if np.dot(P - R[k], n_) >= 0 else -1; q = R[k] + n_ * side * (rhw + 1.2) - t_ * 3 * side
                    mb.append([round(float(q[0]), 1), round(float(q[1]), 1), round(math.atan2(-n_[1] * side, -n_[0] * side), 2)])   # door faces the road
    power = [flat(q.coords) for g, pr in infra if pr["class"] in ("power_line", "minor_line") for q in parts(g.intersection(scen))]
    poles = [[round(g.x, 1), round(g.y, 1), {"power_pole": 0, "power_tower": 1}[pr["class"]]] for g, pr in infra
             if pr["class"] in ("power_pole", "power_tower") and g.geom_type == "Point" and scen.contains(g)]
    water, creeks = [], []
    for g, pr in water_all:
        g2_ = g.intersection(strip.difference(TOWN))
        if g2_.is_empty or pr.get("class") == "swimming_pool": continue
        for poly in parts(g2_, "Polygon"):
            poly = poly.simplify(1.5)
            if poly.area > 60: water.append({"p": flat(poly.exterior.coords[:-1]), "n": nm(pr) or ""})
        if pr.get("subtype") in ("river", "stream", "canal") or pr.get("class") in ("river", "stream", "canal", "ditch", "drain"):
            for ln in parts(g2_): creeks.append({"n": nm(pr) or "", "p": flat(ln.simplify(1).coords)})
    rl = [flat(q.simplify(0.5).coords) for g in rails for q in parts(g.intersection(scen)) if q.length > 10]
    pl = []
    for g, pr in places:
        n_ = nm(pr)
        if n_ and scen.contains(g) and rtree.query([g.x, g.y])[0] < 150:
            pl.append([round(g.x, 1), round(g.y, 1), n_])
    log("mailboxes", len(mb), "power lines", len(power), "poles", len(poles), "water", len(water), "creeks", len(creeks), "rails", len(rl), "places", len(pl))

    def road_out(P, H, **kw):
        return dict(kw, p=flat(P), h=[round(float(v), 2) for v in H])
    rj = [road_out(R, RH, c=spans[0][2], n=spans[0][3], w=tw, l=2, g=0, r=1, spans=spans,
                   bridges=[[int(a[0]), int(a[-1])] for a in np.split(np.nonzero(isbr)[0], np.nonzero(np.diff(np.nonzero(isbr)[0]) > 1)[0] + 1) if len(a)])]
    rj += [road_out(r["P"][::2] if len(r["P"]) > 4 else r["P"], r["H"][::2] if len(r["P"]) > 4 else r["H"], c=r["c"], n=r["n"] or "", w=r["w"], l=1 if r["c"] in ("service", "track", "unknown") else 2, g=r["gravel"],
                    s=r["sub"] or "", **({"b": 1} if bridge_u.distance(r["g"]) < 0.5 and bridge_u.intersection(r["g"].buffer(0.5)).length > 3 else {}),
                    **({"synth": 1} if r.get("synth") else {})) for r in roads]
    OUTJS["corridors"].append({
        "id": cid, "length": round(route.length), "start": {"x": round(float(p0[0]), 1), "y": round(float(p0[1]), 1), "h": round(float(RH[0]), 2),
                                                           "townRoad": best[1], "townName": tr["n"] or "", "w": tw},
        "terrain": {"file": f"corridor_{cid}.png", "x0": gx0, "y1": gy1, "step": ST, "nx": nx, "ny": ny},
        "trees": base64.b64encode(bytes(tb)).decode(), "treeCount": len(tb) // 6, "treeOrigin": [gx0, oy],
        "roads": rj, "buildings": buildings, "dest": dest, "mailboxes": mb, "power": power, "poles": poles,
        "water": water, "creeks": creeks, "rails": rl, "places": pl})
    C.update(R=R, RH=RH, roads=roads, buildings=buildings, T=T, mask=mask, grid=(gx0, gy1, nx, ny), tb=bytes(tb), oy=oy, dest_out=dest, rhw=rhw)

# ---------------------------------------------------------------- the band south of town, an area corridor: every road, building, tree, line,
# creek and pond in it. Roads that cross the old south edge start on it where the town's stop, at the town road's measured width and graded
# level; the others meet the roads graded before them (class order) at their junctions. Terrain and scenery run on past the fence line.
aid = AREA["id"]; bx0, by0, bx1, by1 = AREA["band"]; log("=== area", aid, AREA["band"])
ascen = box(bx0 - AMARG, by0 - AMARG, bx1 + AMARG, by1)
gx0, gy1 = bx0 - MARGIN, by1 + 8                       # nodes line up with the town edge; 8 m overlap into town, as the corridors'
nx = int((bx1 - bx0 + 2 * MARGIN) / ST) + 1; ny = int(math.ceil((gy1 - by0 + MARGIN) / ST)) + 1; oy = gy1 - ny * ST
GX, GY = np.meshgrid(gx0 + np.arange(nx) * ST, gy1 - np.arange(ny) * ST)
dem = dem_mosaic(aid, (gx0 - 60, oy - 60, gx0 + nx * ST + 60, gy1 + 60))       # levels() and cap() read this `dem`
TW = TD["widths"]
tends = [(q[0], q[1], i, e) for i, r in enumerate(TM["roads"]) for e, q in ((0, r["p"][:2]), (-1, r["p"][-2:])) if abs(q[1] - by1) < 0.05]


def town_end(q):                                         # (town road, which end) stopping at this point of the edge, or None
    d = [math.dist(q, t[:2]) for t in tends]
    return tends[int(np.argmin(d))][2:] if d and min(d) < 1.5 else None


def town_level(i, e, TH=THF):
    """the town road's level at that end as world.js grades it: 2.5 m samples of the blurred terrain, bridge dips closed, 12 % cap sourced in PLAY"""
    r = TM["roads"][i]; p = np.array(r["p"], np.float64).reshape(-1, 2); X, Y = [], []
    for a, b in zip(p[:-1], p[1:]):
        u = np.arange(max(1, math.ceil(math.dist(a, b) / 2.5))) / max(1, math.ceil(math.dist(a, b) / 2.5))
        X += list(a[0] + (b[0] - a[0]) * u); Y += list(a[1] + (b[1] - a[1]) * u)
    X = np.array(X + [p[-1, 0]]); Y = np.array(Y + [p[-1, 1]]); h = town_h(X, Y, TH)
    if r["b"]: h = ndi.grey_closing(h, size=29, mode="nearest")
    if r["c"] != "track":
        g = np.where(np.maximum(np.abs(X), np.abs(Y)) < HALF - 55, h, -1e9); d = np.r_[0, np.hypot(np.diff(X), np.diff(Y))] * 0.12
        for k in range(1, len(g)): g[k] = max(g[k], g[k - 1] - d[k])
        for k in range(len(g) - 2, -1, -1): g[k] = max(g[k], g[k + 1] - d[k + 1])
        h = np.maximum(h, g)
    return float(h[e])


pieces = []
for s in segs:
    for q in parts(s["g"].intersection(ascen)) if s["g"].intersects(ascen) else []:
        ta, tb = town_end(q.coords[0]), town_end(q.coords[-1])
        if tb and not ta: q, ta, tb = q.reverse(), tb, ta
        if ta and tb:          # out of town and back (a 18 m service loop): one half continues each town road
            pieces += [(dict(s, g=substring(q, 0, q.length / 2)), ta), (dict(s, g=substring(q, q.length, q.length / 2)), tb)]
        elif q.length >= 12 or ta: pieces.append((dict(s, g=q), ta))
pieces.sort(key=lambda p: (list(WIDTH).index(p[0]["c"]), p[1] is None, -p[0]["g"].length))
aroads, gP, gH, gW = [], [], [], []
for s, ta in pieces:
    P = resample(s["g"], 2.5); w = TW[ta[0]] if ta else s["w"]
    br = np.array([bridge_u.distance(Point(*q)) < 0.8 for q in P]) if not bridge_u.is_empty else np.zeros(len(P), bool)
    h = levels(P, br, 6 if aroads else 10)
    if gP:         # meet the roads graded before it: their level within 2 m of their edge, eased over 20 m
        d, k = cKDTree(np.concatenate(gP)).query(P); HH, WW = np.concatenate(gH), np.concatenate(gW); h = h + (HH[k] - h) * sstep(1 - (d - WW[k] - 2) / 20)
    if s["c"] != "track": h = cap(h, P)
    if ta:     # the town road's level at the edge, eased in over 40 m or more (at most 4 % added grade)
        dh = town_level(*ta) - h[0]; h += dh * np.clip(1 - np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))] / max(40, abs(dh) / 0.04), 0, 1)
    aroads.append(dict(s, P=P, H=h, w=w, br=br, t=ta)); gP.append(P); gH.append(h); gW.append(np.full(len(P), w / 2))
main = aroads[0]; assert main["t"], "no road crosses the south edge"
log("area roads", len(aroads), "km", round(sum(r["g"].length for r in aroads) / 1000, 2), "continuing town roads", [r["t"][0] for r in aroads if r["t"]])

# --- terrain: DEM at 4 m, roads pressed in as the corridors', the outer 40 m past the fence line eased into the far terrain
dout = np.maximum(np.maximum(bx0 - GX, GX - bx1), np.maximum(by0 - GY, 0))           # metres past the fence line
mask = (dout <= MARGIN) & ~(np.maximum(np.abs(GX), np.abs(GY)) < HALF - 8)
T = np.zeros(GX.shape, np.float32); T[mask] = dem(GX[mask], GY[mask], 0.75)
AP = np.concatenate([r["P"] for r in aroads]); SK = np.concatenate([~r["br"] | (np.abs(dem(*r["P"].T, 0) - r["H"]) < 3) for r in aroads])
SP, SH, SW = AP[SK], np.concatenate([r["H"] for r in aroads])[SK], np.concatenate([np.full(len(r["P"]), r["w"] / 2) for r in aroads])[SK]
dd, kk = cKDTree(SP).query(np.stack([GX[mask], GY[mask]], 1), k=6, distance_upper_bound=30)
ok = np.isfinite(dd); e = np.where(ok, dd - SW[np.minimum(kk, len(SW) - 1)], 99); j = e.argmin(1); e = e[np.arange(len(j)), j]
rh = SH[np.minimum(kk[np.arange(len(j)), j], len(SH) - 1)]
t = T[mask]; wgt = np.where(e <= 3.6, 1, 1 - sstep((e - 3.6) / 6)) * (e < 9.6); t = t + (rh - t) * wgt
edgew = sstep((dout[mask] - (MARGIN - 40)) / 40) * sstep((np.maximum(np.abs(GX[mask]), np.abs(GY[mask])) - HALF) / 60)
T[mask] = t + (far_at(GX[mask], GY[mask]) - t) * edgew
cov = np.where(mask, wcf(GX, GY), 0).astype(np.uint8); cov[mask & (cov == 0)] = 30
png16(np.where(mask, T, BASE), cov, f"{OUT}/corridor_{aid}.png")
log("terrain", T.shape, "cells", int(mask.sum()), "h", float(T[mask].min()), float(T[mask].max()))
hAt = lambda x, y: float(ndi.map_coordinates(T, [[(gy1 - y) / ST], [(x - gx0) / ST]], order=1, mode="nearest")[0])

# --- lidar, every octree level: 2 m grid over the terrain (trees), 1 m grid over the scenery (roofs at the town's resolution)
g2 = Grid(gx0, gy1, nx * ST // ST2, ny * ST // ST2, ST2)
sx0, sy0, sx1, sy1 = map(int, ascen.bounds); g1 = Grid(sx0, sy1, sx1 - sx0, sy1 - sy0, 1)
fkeys = f"{CACHE}/keys_{aid}.json"; lb = box(sx0 - 15, sy0 - 15, sx1 + 15, sy1)
if not os.path.exists(fkeys): json.dump(ept_nodes(mpoly(lb), mpoly(lb)), open(fkeys, "w"))
keys = json.load(open(fkeys)); log("lidar nodes", len(keys))
L = lidar_bin(aid, keys, g2, [g1])
CX, CY = g2.centres()
dsm = L["dsm"].reshape(g2.ny, g2.nx); cnt = L["cnt"].reshape(dsm.shape).astype(np.float32); gcnt = L["gcnt"].reshape(dsm.shape).astype(np.float32)
nd = np.where(dsm > -1e8, dsm - dem(CX, CY, 0), 0).clip(0, 60)
D1X, D1Y = g1.centres(); dsm1 = L["d0_dsm"].reshape(g1.ny, g1.nx); nd1 = np.where(dsm1 > -1e8, dsm1 - dem(D1X, D1Y, 0), 0).clip(0, 60)

# --- buildings: Overture footprints in the scenery, roofs from the 1 m lidar (build_detail.py's rule)
bl = [(poly, pr) for g, pr in blds_all for poly in parts(g, "Polygon") if poly.area >= 12 and ascen.contains(poly.centroid)]


def fp_mask(g):
    im = Image.new("L", (g.nx, g.ny), 0); dr = ImageDraw.Draw(im)
    for poly, _ in bl: dr.polygon([((x - g.x0) / g.c, (g.y1 - y) / g.c) for x, y in poly.exterior.coords], fill=1)
    return np.asarray(im) > 0


bmask, bm1 = fp_mask(g2), fp_mask(g1)
sh = max(((np.roll(np.roll((nd > 2.2), dy, 0), dx, 1) & bmask).sum(), dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)); nd = np.roll(np.roll(nd, sh[2], 0), sh[1], 1)
sh1 = max(((np.roll(np.roll((nd1 > 2.2), dy, 0), dx, 1) & bm1).sum(), dx, dy) for dy in range(-3, 4) for dx in range(-3, 4)); nd1 = np.roll(np.roll(nd1, sh1[2], 0), sh1[1], 1)
log("lidar/footprint shift (2 m cells)", sh[1:], "(1 m cells)", sh1[1:])
buildings, stats = [], [0, 0, 0, 0, 0]
for poly, pr in bl:
    P = np.array(poly.simplify(0.4).exterior.coords)[:-1]
    if len(P) < 3: continue
    rf = roof_fit(P, nd1, g1) or (0, 0, 0)
    stats[rf[2] if rf[0] else 4] += 1
    buildings.append({"p": flat(P), "e": rf[0], "r": rf[1], "t": rf[2], "k": pr.get("class") or "", "n": nm(pr) or "", "f": round(hAt(*poly.centroid.coords[0]), 2)})
log("buildings", len(buildings), "flat/gable/cross/hip/none", stats)

# --- trees: crown tops in the canopy height model, as the corridors' (all at the near spacing: the whole band is drivable)
road_d, _ = cKDTree(AP).query(np.stack([CX.ravel(), CY.ravel()], 1), distance_upper_bound=15); road_d = road_d.reshape(CX.shape)
cov2 = wcf(CX, CY); wat = (L["wcnt"].reshape(dsm.shape) > 0) | (cov2 == 80)
chm = nd.copy(); chm[ndi.binary_dilation(bmask, iterations=1) | wat | (road_d < 5)] = 0
chm = ndi.gaussian_filter(np.where(ndi.binary_opening(chm > 2.5, np.ones((2, 2))), chm, 0), 0.5)
top = (chm > 3) & (chm == ndi.maximum_filter(chm, 4)) & (np.maximum(np.maximum(bx0 - AMARG - CX, CX - bx1 - AMARG), by0 - AMARG - CY) <= 0) & (CY < by1 - 4)
gfrac = ndi.uniform_filter(gcnt, 3) / np.maximum(ndi.uniform_filter(cnt, 3), 0.01)
mfrac = ndi.uniform_filter(L["mcnt"].reshape(dsm.shape).astype(np.float32), 3) / np.maximum(ndi.uniform_filter(cnt, 3), 0.01)
solid = top & (mfrac < 0.1); top &= ~solid
ri, ci = np.nonzero(top); tb = bytearray(); ne = 0
for r, c in zip(ri, ci):
    if not (6 <= r < g2.ny - 6 and 6 <= c < g2.nx - 6): continue
    H = float(chm[r, c]); rad = []
    for a in np.arange(8) * math.pi / 4:
        j = 1
        while j < 5:
            hh = chm[int(round(r - math.sin(a) * j)), int(round(c + math.cos(a) * j))]
            if hh < 0.45 * H or hh > H * 1.02: break
            j += 1
        rad.append((j - 0.5) * ST2)
    cr = float(np.clip(np.median(rad), 1.5, 9)); ev = gfrac[r, c] < 0.06 and H > 4; ne += ev
    tb += struct.pack("<HHBB", int(round((CX[r, c] - gx0) * 2)), int(round((CY[r, c] - oy) * 2)), int(min(255, round(H * 4))), int(min(127, round(cr * 8))) | (128 if ev else 0))
log("trees", len(tb) // 6, "evergreen", ne, "dropped as solid objects", int(solid.sum()))

# --- mailboxes at driveway mouths on the public roads, power lines and poles, water, creeks, rails, named places
pub = [r for r in aroads if r["c"] in ("primary", "secondary", "tertiary", "residential", "unclassified")]
pk = cKDTree(np.concatenate([r["P"] for r in pub])); pix = [(r, k) for r in pub for k in range(len(r["P"]))]
mb = []
for r in aroads:
    if r["c"] in ("service", "track", "unknown") and r["sub"] != "parking_aisle":
        for P in (r["P"][0], r["P"][-1]):
            d, jj = pk.query(P); R_, k = pix[jj][0]["P"], pix[jj][1]; rw = pix[jj][0]["w"] / 2
            if d < rw + 3:
                t_ = R_[min(k + 1, len(R_) - 1)] - R_[max(k - 1, 0)]; t_ = t_ / np.linalg.norm(t_); n_ = np.array([-t_[1], t_[0]])
                side = 1 if np.dot(P - R_[k], n_) >= 0 else -1; q = R_[k] + n_ * side * (rw + 1.2) - t_ * 3 * side
                mb.append([round(float(q[0]), 1), round(float(q[1]), 1), round(math.atan2(-n_[1] * side, -n_[0] * side), 2)])
power = [flat(q.coords) for g, pr in infra if pr["class"] in ("power_line", "minor_line") for q in parts(g.intersection(ascen))]
poles = [[round(g.x, 1), round(g.y, 1), {"power_pole": 0, "power_tower": 1}[pr["class"]]] for g, pr in infra
         if pr["class"] in ("power_pole", "power_tower") and g.geom_type == "Point" and ascen.contains(g)]
aterr = box(gx0, oy, gx0 + (nx - 1) * ST, gy1).difference(TOWN); water, creeks = [], []
for g, pr in water_all:
    g2_ = g.intersection(aterr)
    if g2_.is_empty or pr.get("class") == "swimming_pool": continue
    water += [{"p": flat(q.exterior.coords[:-1]), "n": nm(pr) or ""} for q in map(lambda q: q.simplify(1.5), parts(g2_, "Polygon")) if q.area > 60]
    if pr.get("subtype") in ("river", "stream", "canal") or pr.get("class") in ("river", "stream", "canal", "ditch", "drain"):
        creeks += [{"n": nm(pr) or "", "p": flat(ln.simplify(1).coords)} for ln in parts(g2_)]
rl = [flat(q.simplify(0.5).coords) for g in rails for q in parts(g.intersection(ascen)) if q.length > 10]
pl = [[round(g.x, 1), round(g.y, 1), nm(pr)] for g, pr in places if nm(pr) and ascen.contains(g)]
log("mailboxes", len(mb), "power lines", len(power), "poles", len(poles), "water", len(water), "creeks", len(creeks), "rails", len(rl), "places", len(pl))

rj = []
for r in aroads:
    kw = dict(c=r["c"], n=r["n"] or "", w=r["w"], l=1 if r["c"] in ("service", "track", "unknown") else 2, g=r["gravel"])
    if r is main:        # the main road keeps its 2.5 m samples, spans and bridge decks, as a corridor's route
        kw.update(r=1, spans=[[0, len(r["P"]) - 1, r["c"], r["n"] or "", "/".join(sorted(x for x in r["refs"] if x))]],
                  bridges=[[int(a[0]), int(a[-1])] for a in np.split(np.nonzero(r["br"])[0], np.nonzero(np.diff(np.nonzero(r["br"])[0]) > 1)[0] + 1) if len(a)])
        ix = np.arange(len(r["P"]))
    else:
        kw.update(s=r["sub"] or "", **({"b": 1} if bridge_u.distance(r["g"]) < 0.5 and bridge_u.intersection(r["g"].buffer(0.5)).length > 3 else {}))
        ix = np.unique(np.r_[np.arange(0, len(r["P"]), 2), len(r["P"]) - 1])        # every 5 m, keeping both ends
    if r["t"]: kw["t"] = r["t"][0]
    rj.append(road_out(r["P"][ix], r["H"][ix], **kw))
p0 = main["P"][0]
OUTJS["corridors"].append({
    "id": aid, "kind": "area", "band": {"x0": bx0, "y0": by0, "x1": bx1, "y1": by1}, "margin": MARGIN, "scenery": AMARG,
    "length": round(main["g"].length), "start": {"x": round(float(p0[0]), 1), "y": round(float(p0[1]), 1), "h": round(float(main["H"][0]), 2),
                                                 "townRoad": main["t"][0], "townName": TM["roads"][main["t"][0]]["n"] or "", "w": main["w"]},
    "terrain": {"file": f"corridor_{aid}.png", "x0": gx0, "y1": gy1, "step": ST, "nx": nx, "ny": ny},
    "trees": base64.b64encode(bytes(tb)).decode(), "treeCount": len(tb) // 6, "treeOrigin": [gx0, oy],
    "roads": rj, "buildings": buildings, "dest": {"paved": [], "buildings": []}, "mailboxes": mb, "power": power, "poles": poles,
    "water": water, "creeks": creeks, "rails": rl, "places": pl})
AREA.update(grid=(gx0, gy1, nx, ny), T=T, mask=mask, tb=bytes(tb), oy=oy, buildings=buildings, roads=aroads, R=main["P"], rhw=main["w"] / 2, dest_out={"paved": []},
            water=water, creeks=creeks, rails=rl, power=power, poles=poles, mailboxes=mb)

js = "window.BLOOMFIELD_CORRIDORS=" + json.dumps(OUTJS, separators=(",", ":")) + ";"
open(OUT + "/corridors.js", "w").write(js)
log("sizes MB", {f: round(os.path.getsize(f"{OUT}/{f}") / 1e6, 2) for f in ("corridors.js", "corridor_north.png", "corridor_west.png", "corridor_south.png", "corridor_far.png")})


# ---------------------------------------------------------------- check plots: hill shade + cover tint, roads, buildings, trees
COL = {10: (40, 90, 40), 20: (90, 110, 50), 30: (140, 170, 90), 40: (190, 175, 110), 50: (150, 140, 140), 60: (170, 160, 140), 80: (60, 90, 170), 90: (70, 130, 120)}


def plot(C, path, win=None, px=None):
    gx0, gy1, nx, ny = C["grid"]; T, mask = C["T"], C["mask"]
    x0, y0, x1, y1 = win or (gx0, gy1 - ny * ST, gx0 + nx * ST, gy1)
    s = px or max((x1 - x0) / 2400, 0.5)
    W_, H_ = int((x1 - x0) / s), int((y1 - y0) / s)
    XX, YY = np.meshgrid(x0 + (np.arange(W_) + 0.5) * s, y1 - (np.arange(H_) + 0.5) * s)
    fi = (gy1 - YY) / ST; fj = (XX - gx0) / ST
    h = ndi.map_coordinates(T, [fi, fj], order=1, mode="nearest"); m = ndi.map_coordinates(mask.astype(np.float32), [fi, fj], order=0) > 0.5
    gy_, gx_ = np.gradient(h, s); shade = np.clip(0.75 + (gx_ * -0.7 + gy_ * 0.7) * 1.5, 0.35, 1.3)
    wc = np.asarray(Image.open(f"{OUT}/corridor_{C['id']}.png").convert("RGB"))[..., 2]
    cv = wc[np.clip(fi.round().astype(int), 0, ny - 1), np.clip(fj.round().astype(int), 0, nx - 1)]
    base = np.zeros(h.shape + (3,), np.float32) + 235
    for k, c in COL.items(): base[cv == k] = c
    img = np.where(m[..., None], base * shade[..., None], 40)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); dr = ImageDraw.Draw(im)
    P = lambda a: [((x - x0) / s, (y1 - y) / s) for x, y in a]
    dr.rectangle([P([(-HALF, HALF)])[0], P([(HALF, -HALF)])[0]], outline=(255, 0, 255), width=2)
    for k in range(0, len(C["tb"]), 6):
        u, v, hq, rq = struct.unpack("<HHBB", C["tb"][k:k + 6]); x = gx0 + u / 2; y = C["oy"] + v / 2
        if x0 < x < x1 and y0 < y < y1:
            rr = max(1, (rq & 127) / 8 / s); cx, cy = P([(x, y)])[0]; dr.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(10, 60, 10) if rq & 128 else (200, 110, 30))
    for b in C["buildings"]:
        dr.polygon(P(np.array(b["p"]).reshape(-1, 2)), fill=[(120, 120, 255), (255, 60, 60), (255, 60, 255), (255, 200, 0)][b["t"]] if b["e"] else (90, 90, 90), outline=(0, 0, 0))
    for q in C["dest_out"]["paved"]: dr.polygon(P(np.array(q).reshape(-1, 2)), outline=(0, 255, 255))
    for w in C.get("water", []): dr.polygon(P(np.array(w["p"]).reshape(-1, 2)), outline=(0, 220, 255))
    for c in C.get("creeks", []): dr.line(P(np.array(c["p"]).reshape(-1, 2)), fill=(0, 120, 255), width=2)
    for q in C.get("rails", []): dr.line(P(np.array(q).reshape(-1, 2)), fill=(120, 60, 160), width=3)
    for q in C.get("power", []): dr.line(P(np.array(q).reshape(-1, 2)), fill=(255, 255, 255), width=1)
    for x, y, k in C.get("poles", []): cx, cy = P([(x, y)])[0]; dr.rectangle([cx - 2 - 2 * k, cy - 2 - 2 * k, cx + 2 + 2 * k, cy + 2 + 2 * k], outline=(255, 255, 255))
    for x, y, a in C.get("mailboxes", []): cx, cy = P([(x, y)])[0]; dr.rectangle([cx - 3, cy - 3, cx + 3, cy + 3], fill=(255, 255, 0))
    for r in C["roads"]: dr.line(P(r["P"]), fill=(250, 250, 250) if r["c"] != "track" else (200, 180, 120), width=max(1, int(r["w"] / s)))
    dr.line(P(C["R"]), fill=(30, 30, 30), width=max(2, int(C["rhw"] * 2 / s)))
    if "sign" in C["dest_out"]: x, y = P([(C["dest_out"]["sign"]["x"], C["dest_out"]["sign"]["y"])])[0]; dr.rectangle([x - 4, y - 4, x + 4, y + 4], fill=(255, 0, 0))
    if "dest" in C: x, y = P([C["dest"]])[0]; dr.ellipse([x - 6, y - 6, x + 6, y + 6], outline=(255, 0, 0), width=3)
    if "band" in C: dr.rectangle([P([C["band"][::3]])[0], P([C["band"][2:0:-1]])[0]], outline=(255, 255, 0), width=2)      # the fence line
    im.save(path)


for C in CORR:
    plot(C, f"{CACHE}/plot_{C['id']}.png")
    plot(C, f"{CACHE}/plot_{C['id']}_dest.png", win=(C["dest"][0] - 160, C["dest"][1] - 110, C["dest"][0] + 160, C["dest"][1] + 110), px=0.4)
    p0 = C["R"][0]; plot(C, f"{CACHE}/plot_{C['id']}_edge.png", win=(p0[0] - 320, p0[1] - 180, p0[0] + 320, p0[1] + 180), px=0.5)
    # continuity at the town edge: position, level and width against the town road
    k = 8; log(C["id"], "edge h", round(C["RH"][0], 2), "town terrain", round(float(town_h(*p0)), 2), "route grade first 50 m %", round(100 * (C["RH"][20] - C["RH"][0]) / 50, 1))
plot(AREA, f"{CACHE}/plot_{aid}.png")
plot(AREA, f"{CACHE}/plot_{aid}_us231.png", win=(main["P"][0][0] - 320, -2780, main["P"][0][0] + 320, -2420), px=0.5)
# continuity at the old south edge, every road crossing it: position, level and width against the town road it continues
log("edge continuity: road, town road, name, class, position gap m, level step m (band - town road with the edge rows fixed | as world.js grades it now), width band / town m")
for ri, r in enumerate(AREA["roads"]):
    if not r["t"]: continue
    i, e = r["t"]; q = TM["roads"][i]["p"][:2] if e == 0 else TM["roads"][i]["p"][-2:]
    log(f"  road {ri:2d}  town {i:3d}  {TM['roads'][i]['n'] or '-':14s} {r['c']:12s} gap {math.dist(q, r['P'][0]):5.2f}  step {round(float(r['H'][0]), 2) - town_level(i, e):+6.3f} | {round(float(r['H'][0]), 2) - town_level(i, e, TH):+6.2f}"
        f"  width {r['w']} / {TW[i]}  at x {q[0]}")
    plot(AREA, f"{CACHE}/plot_{aid}_edge{ri}.png", win=(q[0] - 160, q[1] - 140, q[0] + 160, q[1] + 40), px=0.5)
log("plots in", CACHE)
