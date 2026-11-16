"""Turn raw downloads (Overture geojson, Terrarium elevation tiles, ESA WorldCover) into map.js for the game.
Usage: python3 build_map.py <data_dir> <out_map.js>
Local coords: x = metres east, y = metres north of the Greene County Courthouse."""
import sys, json, math, base64, glob, os, re
import numpy as np
from PIL import Image
from shapely.geometry import shape, box, LineString
from shapely import affinity

D, OUT = sys.argv[1], sys.argv[2]
LAT0, LON0 = 39.026262, -86.937919
p = math.radians(LAT0)
MY = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)      # metres per degree latitude
MX = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p)  # per degree longitude
HALF = 2050          # inner (playable + margin) half-size, metres
FAR = 7000           # horizon terrain half-size
BOX = box(-HALF, -HALF, HALF, HALF)


def to_xy(geom):
    return affinity.affine_transform(geom, [MX, 0, 0, MY, -LON0 * MX, -LAT0 * MY])


def load(name):
    return json.load(open(f"{D}/{name}.geojson"))["features"]


def nm(props):
    return (props.get("names") or {}).get("primary")


def flat(coords):
    return [round(v, 1) for pt in coords for v in pt[:2]]


# ---------- elevation ----------
def mosaic(z):
    files = glob.glob(f"{D}/tiles/{z}_*.png")
    xs = sorted({int(f.split("_")[-2]) for f in files}); ys = sorted({int(f.split("_")[-1][:-4]) for f in files})
    big = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
    for f in files:
        x, y = int(f.split("_")[-2]), int(f.split("_")[-1][:-4])
        a = np.asarray(Image.open(f).convert("RGB"), np.float32)
        big[(y - ys[0]) * 256:(y - ys[0] + 1) * 256, (x - xs[0]) * 256:(x - xs[0] + 1) * 256] = \
            a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return big, xs[0], ys[0]


def sample_dem(z, half, step):
    big, x0, y0 = mosaic(z)
    n = int(2 * half / step) + 1
    gx = np.linspace(-half, half, n); gy = np.linspace(half, -half, n)       # row 0 = north
    lon = LON0 + gx / MX; lat = LAT0 + gy / MY
    px = (lon + 180) / 360 * 2 ** z * 256 - x0 * 256 - 0.5
    py = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * 2 ** z * 256 - y0 * 256 - 0.5
    PX, PY = np.meshgrid(px, py)
    ix = np.floor(PX).astype(int); iy = np.floor(PY).astype(int); fx = PX - ix; fy = PY - iy
    g = lambda dy, dx: big[iy + dy, ix + dx]
    return (g(0, 0) * (1 - fx) + g(0, 1) * fx) * (1 - fy) + (g(1, 0) * (1 - fx) + g(1, 1) * fx) * fy


def pack16(a, base):
    q = np.clip(np.round((a - base) * 50), 0, 65535).astype("<u2")           # 2 cm steps
    return base64.b64encode(q.tobytes()).decode()


dem = sample_dem(14, HALF, 10)
far = sample_dem(12, FAR, 50)
base = float(math.floor(min(dem.min(), far.min())))
print("dem", dem.shape, dem.min(), dem.max(), "far", far.shape, far.min(), far.max())

# ---------- land cover (ESA WorldCover: 10 tree, 30 grass, 40 crop, 50 built, 60 bare, 80 water, 90 wetland) ----------
wc = np.vstack([np.load(f"{D}/wc_N39W087.npy"), np.load(f"{D}/wc_N36W087.npy")])
WC_TOP, WC_LEFT, WC_RES = 39.0 + 1176 / 12000, -87.0, 1 / 12000


def sample_cover(half, step):
    n = int(2 * half / step) + 1
    gx = np.linspace(-half, half, n); gy = np.linspace(half, -half, n)
    c = np.clip(((LON0 + gx / MX - WC_LEFT) / WC_RES).astype(int), 0, wc.shape[1] - 1)
    r = np.clip(((WC_TOP - (LAT0 + gy / MY)) / WC_RES).astype(int), 0, wc.shape[0] - 1)
    return wc[np.ix_(r, c)]


cover = sample_cover(HALF, 10); farcover = sample_cover(FAR, 50)
b64 = lambda a: base64.b64encode(a.astype(np.uint8).tobytes()).decode()

# ---------- roads ----------
WIDTH = {"primary": 9.5, "secondary": 8.5, "tertiary": 7.2, "residential": 6.6, "unclassified": 6.0,
         "service": 4.6, "unknown": 4.6, "track": 3.4}
roads, rails = [], []
for f in load("segment"):
    pr = f["properties"]
    g = to_xy(shape(f["geometry"])).intersection(BOX)
    if g.is_empty:
        continue
    parts = [g] if g.geom_type == "LineString" else [q for q in getattr(g, "geoms", []) if q.geom_type == "LineString"]
    for ln in parts:
        if ln.length < 4:
            continue
        if pr["subtype"] == "rail":
            rails.append(flat(ln.coords)); continue
        cls = pr["class"]
        if pr["subtype"] != "road" or cls not in WIDTH:
            continue
        sub = pr.get("subclass")
        surf = (pr.get("road_surface") or [{}])[0].get("value")
        gravel = surf == "unpaved" or (cls == "track" and surf != "paved")
        w = WIDTH[cls]
        if sub == "driveway": w = 3.4
        if sub == "parking_aisle": w = 14
        bridge = any("is_bridge" in (fl.get("values") or []) for fl in (pr.get("road_flags") or []))
        roads.append({"c": cls, "n": nm(pr), "w": w, "g": int(gravel), "b": int(bridge), "p": flat(ln.coords)})
print("roads", len(roads), "km", sum(LineString(list(zip(r["p"][::2], r["p"][1::2]))).length for r in roads) / 1000)

# ---------- buildings ----------
blds = []
for f in load("building"):
    pr = f["properties"]
    g = to_xy(shape(f["geometry"]))
    for poly in ([g] if g.geom_type == "Polygon" else list(g.geoms)):
        c = poly.centroid
        if abs(c.x) > HALF - 15 or abs(c.y) > HALF - 15 or poly.area < 12:
            continue
        ring = list(poly.simplify(0.4).exterior.coords)[:-1]
        blds.append({"p": flat(ring), "h": round(pr["height"], 1) if pr.get("height") else 0,
                     "k": pr.get("class") or pr.get("subtype") or "", "n": nm(pr) or ""})
print("buildings", len(blds))

# ---------- water ----------
water, creeks = [], []
for f in load("water"):
    pr = f["properties"]
    g = to_xy(shape(f["geometry"])).intersection(BOX)
    if g.is_empty:
        continue
    if g.geom_type in ("Polygon", "MultiPolygon"):
        if pr["class"] == "swimming_pool":
            continue
        for poly in ([g] if g.geom_type == "Polygon" else g.geoms):
            poly = poly.simplify(1.5)
            if poly.area > 60:
                water.append({"p": flat(list(poly.exterior.coords)[:-1]),
                              "holes": [flat(list(h.coords)[:-1]) for h in poly.interiors if LineString(h.coords).length > 40]})
    elif pr["subtype"] == "river" and g.geom_type in ("LineString", "MultiLineString"):
        for ln in ([g] if g.geom_type == "LineString" else g.geoms):
            creeks.append({"n": nm(pr) or "", "p": flat(ln.simplify(1).coords)})
print("water", len(water), "creeks", len(creeks))

# ---------- areas (parks, pitches, parking, school, cemetery) ----------
areas = []
for src in ("land_use", "infrastructure"):
    for f in load(src):
        pr = f["properties"]
        if f["geometry"]["type"] != "Polygon":
            continue
        kind = pr["class"]
        if kind not in ("park", "pitch", "school", "cemetery", "grave_yard", "parking", "industrial", "commercial", "silo", "storage_tank", "substation"):
            continue
        g = to_xy(shape(f["geometry"])).intersection(BOX)
        if g.is_empty or g.geom_type != "Polygon":
            continue
        areas.append({"k": kind, "n": nm(pr) or "", "p": flat(list(g.simplify(0.5).exterior.coords)[:-1])})
print("areas", [(a["k"], a["n"]) for a in areas])

# ---------- point features ----------
poles, signals = [], []
for f in load("infrastructure"):
    pr = f["properties"]
    if f["geometry"]["type"] != "Point":
        continue
    x = (f["geometry"]["coordinates"][0] - LON0) * MX; y = (f["geometry"]["coordinates"][1] - LAT0) * MY
    if abs(x) > HALF - 20 or abs(y) > HALF - 20:
        continue
    if pr["class"] in ("power_pole", "power_tower", "mobile_phone_tower"):
        poles.append([round(x, 1), round(y, 1), {"power_pole": 0, "power_tower": 1, "mobile_phone_tower": 2}[pr["class"]]])
    elif pr["class"] == "traffic_signals":
        signals.append([round(x, 1), round(y, 1)])

# ---------- named places (for roadside signs) ----------
KEEP = re.compile(r"school|church|chapel|baptist|dairy queen|huck|cvs|pizza|subway|dollar general|ruler foods|"
                  r"courthouse|library|fire dep|police|park$|pool|theatre|cafe|drive-in|napa|bank$|hardware|"
                  r"marathon|casa sevilla|ribeyes|laundromat|car wash|post|legion|feed store|liquors|china house|bakery|motors", re.I)
SKIP = re.compile(r"atm|hot stuff|godfather|hunt brothers|shivaay|apparel|preschool|outreach|redbox|annex", re.I)
places = []
for f in load("place"):
    n = nm(f["properties"])
    if not n or not KEEP.search(n) or SKIP.search(n):
        continue
    n = re.sub(r"\s+", " ", re.sub(r"\s*[-,] Bloomfield.*$|, in$| in Bloomfield in$| - Toy's.*$", "", n, flags=re.I)).strip()
    x = (f["geometry"]["coordinates"][0] - LON0) * MX; y = (f["geometry"]["coordinates"][1] - LAT0) * MY
    if abs(x) > HALF - 60 or abs(y) > HALF - 60 or len(n) > 34:
        continue
    key = re.sub(r"[^a-z]", "", n.lower())
    if any(k == key or (k[:5] == key[:5] and math.hypot(px - x, py - y) < 60) for px, py, _, k in places):
        continue
    places.append([round(x, 1), round(y, 1), n, key])
places = [q[:3] for q in places]
print("places", len(places), [q[2] for q in places])

m = {"lat0": LAT0, "lon0": LON0, "half": HALF, "base": base,
     "dem": {"n": dem.shape[0], "step": 10, "d": pack16(dem, base)},
     "far": {"n": far.shape[0], "step": 50, "half": FAR, "d": pack16(far, base)},
     "cover": b64(cover), "farcover": b64(farcover),
     "roads": roads, "rails": rails, "buildings": blds, "water": water, "creeks": creeks,
     "areas": areas, "poles": poles, "signals": signals, "places": places}
js = "window.BLOOMFIELD=" + json.dumps(m, separators=(",", ":")) + ";"
open(OUT, "w").write(js)
print("map.js", round(len(js) / 1e6, 2), "MB")
