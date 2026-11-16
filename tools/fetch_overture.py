"""Download Overture Maps features (roads, buildings, water, land use, places) for the Bloomfield, IN bbox.
Usage: python3 fetch_overture.py <out_dir>"""
import os, sys, json
import pyarrow.dataset as ds, pyarrow.fs as fs, pyarrow.compute as pc
import shapely

OUT = sys.argv[1]
REL = "2026-10-21.0"
W, S, E, N = -86.975, 39.000, -86.900, 39.055
s3 = fs.S3FileSystem(anonymous=True, region="us-west-2",
                     proxy_options=os.environ.get("HTTPS_PROXY"))
TYPES = {
    "segment": ("transportation", ["id", "geometry", "subtype", "class", "names", "road_surface", "road_flags", "subclass"]),
    "building": ("buildings", ["id", "geometry", "subtype", "class", "names", "height", "num_floors", "roof_shape"]),
    "water": ("base", ["id", "geometry", "subtype", "class", "names"]),
    "land_use": ("base", ["id", "geometry", "subtype", "class", "names"]),
    "infrastructure": ("base", ["id", "geometry", "subtype", "class", "names"]),
    "place": ("places", ["id", "geometry", "names", "categories"]),
}
only = sys.argv[2:] or list(TYPES)
for typ in only:
    theme, cols = TYPES[typ]
    d = ds.dataset(f"overturemaps-us-west-2/release/{REL}/theme={theme}/type={typ}/", filesystem=s3)
    cols = [c for c in cols if c in d.schema.names]
    b = pc.field("bbox")
    flt = (pc.field("bbox", "xmin") < E) & (pc.field("bbox", "xmax") > W) & \
          (pc.field("bbox", "ymin") < N) & (pc.field("bbox", "ymax") > S)
    t = d.to_table(filter=flt, columns=cols)
    rows = t.to_pylist()
    feats = []
    for r in rows:
        g = shapely.from_wkb(r.pop("geometry"))
        feats.append({"type": "Feature", "geometry": json.loads(shapely.to_geojson(g)), "properties": r})
    with open(f"{OUT}/{typ}.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, default=str)
    print(typ, len(feats), flush=True)
