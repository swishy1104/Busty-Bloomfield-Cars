"""Download the USGS 3DEP aerial lidar scan of Bloomfield (public Entwine point tiles on AWS, Indiana Statewide 2017)
plus the matching USGS 1 m bare-earth DEM, and bin them into 1 m rasters in the game's local frame.
Usage: python3 fetch_lidar.py <cache_dir>          -> writes <cache_dir>/lidar_1m.npz
Local frame: x = metres east, y = metres north of the Greene County Courthouse; rasters are [row 0 = north, col 0 = west]."""
import sys, os, json, math, io, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import laspy

CACHE = sys.argv[1]
EPT = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/IN_Statewide_Opt2_B4_2017"
DEM = "/vsicurl/https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/IN_Indiana_Statewide_LiDAR_2017_B17/TIFF/USGS_1M_16_%s_IN_Indiana_Statewide_LiDAR_2017_B17.tif"
LAT0, LON0 = 39.026262, -86.937919
p = math.radians(LAT0)
MY = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
MX = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p)
HALF = 2050; N = 2 * HALF                      # 4100 x 4100 cells of 1 m
RE = 6378137.0
os.makedirs(CACHE + "/nodes", exist_ok=True)


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except Exception as e:                 # network hiccups: back off and retry
            if k == tries - 1:
                raise
            time.sleep(2 ** k)


def merc(lon, lat):
    return RE * math.radians(lon), RE * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


# query box in Web Mercator (the tiles' CRS), with a 30 m margin
m = (HALF + 30)
x0, y0 = merc(LON0 - m / MX, LAT0 - m / MY); x1, y1 = merc(LON0 + m / MX, LAT0 + m / MY)
ept = json.loads(get(EPT + "/ept.json")); B = ept["bounds"]; SIZE = B[3] - B[0]


def hits(d, x, y):
    s = SIZE / 2 ** d
    return B[0] + x * s < x1 and B[0] + (x + 1) * s > x0 and B[1] + y * s < y1 and B[1] + (y + 1) * s > y0


def walk():
    """All octree nodes that overlap the box (every depth holds a share of the points)."""
    nodes, todo = [], [("0-0-0-0", json.loads(get(EPT + "/ept-hierarchy/0-0-0-0.json")))]
    pool = ThreadPoolExecutor(12)
    while todo:
        subs = []
        for root, h in todo:
            stack = [root]
            while stack:
                key = stack.pop(); d, x, y, z = map(int, key.split("-"))
                n = h.get(key)
                if n is None or not hits(d, x, y):
                    continue
                if n == -1 and key != root:
                    subs.append(key); continue
                if n > 0:
                    nodes.append(key)
                for c in range(8):
                    stack.append(f"{d + 1}-{2 * x + (c & 1)}-{2 * y + (c >> 1 & 1)}-{2 * z + (c >> 2)}")
        todo = list(zip(subs, pool.map(lambda k: json.loads(get(f"{EPT}/ept-hierarchy/{k}.json")), subs)))
        print("hierarchy: nodes", len(nodes), "sub-files next", len(subs), flush=True)
    return nodes


def node(key):
    f = f"{CACHE}/nodes/{key}.laz"
    if not os.path.exists(f):
        data = get(f"{EPT}/ept-data/{key}.laz")
        with open(f + ".part", "wb") as o:
            o.write(data)
        os.replace(f + ".part", f)
    las = laspy.read(f)
    X = np.asarray(las.x); Y = np.asarray(las.y)
    lon = np.degrees(X / RE); lat = np.degrees(2 * np.arctan(np.exp(Y / RE)) - np.pi / 2)
    col = np.floor((lon - LON0) * MX + HALF).astype(np.int32); row = np.floor(HALF - (lat - LAT0) * MY).astype(np.int32)
    cls = np.asarray(las.classification)
    ok = (col >= 0) & (col < N) & (row >= 0) & (row < N) & (cls != 7) & (cls != 18)
    return ((row[ok] * N + col[ok]).astype(np.int64), np.asarray(las.z)[ok].astype(np.float32), cls[ok].astype(np.uint8),
            np.asarray(las.intensity)[ok].astype(np.float32), np.asarray(las.number_of_returns)[ok] > 1)   # multi-return = foliage


keys = walk()
print("nodes to read:", len(keys), flush=True)
dsm = np.full(N * N, -1e9, np.float32); gsum = np.zeros(N * N, np.float64); gcnt = np.zeros(N * N, np.uint16)
cnt = np.zeros(N * N, np.uint16); multi = np.zeros(N * N, np.uint16); isum = np.zeros(N * N, np.float64)
isum1 = np.zeros(N * N, np.float64); gcnt1 = np.zeros(N * N, np.uint16)      # single-return ground hits only: clean reflectance, not weakened by branches
ccount = {c: np.zeros(N * N, np.uint16) for c in (6, 9, 17)}
classes, total, t0 = {}, 0, time.time()
with ThreadPoolExecutor(8) as pool:
    for i, (idx, z, cls, inten, mr) in enumerate(pool.map(node, keys)):
        total += len(idx)
        np.maximum.at(dsm, idx, z); np.add.at(cnt, idx, 1); np.add.at(multi, idx[mr], 1)
        g = cls == 2
        np.add.at(gsum, idx[g], z[g]); np.add.at(gcnt, idx[g], 1); np.add.at(isum, idx[g], inten[g])
        g1 = g & ~mr
        np.add.at(isum1, idx[g1], inten[g1]); np.add.at(gcnt1, idx[g1], 1)
        for c, a in ccount.items():
            np.add.at(a, idx[cls == c], 1)
        for c, k in zip(*np.unique(cls, return_counts=True)):
            classes[int(c)] = classes.get(int(c), 0) + int(k)
        if i % 250 == 0:
            print(f"{i}/{len(keys)} nodes, {total / 1e6:.1f} M points, {time.time() - t0:.0f} s", flush=True)
print("points in box:", total, "per m2:", round(total / N / N, 2), "classes:", classes, flush=True)

# official 1 m bare-earth DEM (UTM 16N, two 10 km tiles), resampled bilinearly to the same grid
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform
gx = (np.arange(N) + 0.5 - HALF) / MX + LON0; gy = (HALF - (np.arange(N) + 0.5)) / MY + LAT0
E0, N0, E1, N1 = 503200, 4317500, 507600, 4321900            # UTM window around the town, whole metres
mos = np.full((N1 - N0, E1 - E0), np.nan, np.float32)
for t in ("x50y432", "x50y433"):
    with rasterio.open(DEM % t) as ds:
        b = ds.bounds; w0, s0, e0, n0 = max(E0, b.left), max(N0, b.bottom), min(E1, b.right), min(N1, b.top)
        a = ds.read(1, window=from_bounds(w0, s0, e0, n0, ds.transform).round_offsets().round_lengths()).astype(np.float32)
        a[a < -1000] = np.nan
        r0 = int(round(N1 - n0)); c0 = int(round(w0 - E0)); old = mos[r0:r0 + a.shape[0], c0:c0 + a.shape[1]]
        mos[r0:r0 + a.shape[0], c0:c0 + a.shape[1]] = np.where(np.isnan(old), a, old)
        print("dem tile", t, a.shape, float(np.nanmin(a)), float(np.nanmax(a)), flush=True)
dtm = np.zeros((N, N), np.float32)
for r in range(N):
    ex, ny = transform("EPSG:4269", "EPSG:26916", gx.tolist(), [float(gy[r])] * N)
    fx = np.asarray(ex) - E0 - 0.5; fy = N1 - np.asarray(ny) - 0.5
    ix = np.floor(fx).astype(int); iy = np.floor(fy).astype(int); u = fx - ix; v = fy - iy
    dtm[r] = (mos[iy, ix] * (1 - u) + mos[iy, ix + 1] * u) * (1 - v) + (mos[iy + 1, ix] * (1 - u) + mos[iy + 1, ix + 1] * u) * v
print("dtm", float(np.nanmin(dtm)), float(np.nanmax(dtm)), "nan", int(np.isnan(dtm).sum()), flush=True)

sh = (N, N)
np.savez_compressed(CACHE + "/lidar_1m.npz", dsm=dsm.reshape(sh), gsum=gsum.astype(np.float32).reshape(sh), gcnt=gcnt.reshape(sh),
                    cnt=cnt.reshape(sh), multi=multi.reshape(sh), isum=isum.astype(np.float32).reshape(sh), dtm=dtm,
                    isum1=isum1.astype(np.float32).reshape(sh), gcnt1=gcnt1.reshape(sh),
                    c6=ccount[6].reshape(sh), c9=ccount[9].reshape(sh), c17=ccount[17].reshape(sh))
print("saved", CACHE + "/lidar_1m.npz", flush=True)
