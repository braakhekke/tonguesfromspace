#!/usr/bin/env python3
"""Buildings taller than 25 m from swisstopo's swissBUILDINGS3D 3.0 (Beta) for the size page.

Source: https://data.geo.admin.ch/ch.swisstopo.swissbuildings3d_3_0 (STAC collection
ch.swisstopo.swissbuildings3d_3_0, file geodatabase tiles, LV95). Terms: swisstopo open
data, source reference "©swisstopo" required (docs/SOURCES.md).

Only the tiles under the nine cities of size.html are fetched (newest edition per tile),
each is read once and deleted. Kept: layer Building_solid, attribute GESAMTHOEHE > 25
(the source's total height, copied as it is). Footprint = the roof/wall faces of the
solid projected to the ground and merged (a roof overhang is part of it), simplified
to 0.5 m, in WGS84 to 6 decimals. Output: data/tall-buildings.json.

Needs fiona + shapely + pyproj (GDAL wheel), e.g. a Python 3.12 venv:
  uv venv --python 3.12 v312 && uv pip install --python v312/bin/python fiona shapely pyproj
  v312/bin/python scripts/build_tall_buildings.py [--cache DIR]
"""
import json, math, pickle, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fiona
from pyproj import Transformer
from shapely.geometry import shape, Polygon, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
MIN_H = 25.0
MAX_COMPUTED = 200.0
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0/items"
TO_WGS = Transformer.from_crs(2056, 4326, always_xy=True)


def cities():
    s = (ROOT / "size.html").read_text()
    j = s.index('"cities"')
    return [(m[0], float(m[1]), float(m[2]), float(m[3])) for m in re.findall(
        r'"id":"([a-z]+)","name":"[^"]+","clat":([\d.]+),"clon":([\d.]+),"lat":[\d.]+,"lon":[\d.]+,"area":[\d.]+,"span":([\d.]+)', s[j:])]


def tiles():
    best = {}
    for cid, la, lo, sp in cities():
        h = sp / 2 + 1
        dl = h / 111.2
        dn = h / (111.2 * math.cos(math.radians(la)))
        u = f"{STAC}?bbox={lo-dn},{la-dl},{lo+dn},{la+dl}&limit=100"
        while u:
            r = json.load(urllib.request.urlopen(u))
            for f in r["features"]:
                m = re.match(r"swissbuildings3d_3_0_(\d{4})_(\d{4}-\d{2})$", f["id"])
                if not m:
                    continue
                a = [v["href"] for n, v in f["assets"].items() if n.endswith(".gdb.zip")]
                if a and (m[2] not in best or best[m[2]][0] < int(m[1])):
                    best[m[2]] = (int(m[1]), a[0])
            u = next((l["href"] for l in r["links"] if l["rel"] == "next"), None)
    return best


CACHE = None  # --cache DIR: one pickle per finished tile, so a stopped run resumes


def one(args):
    tid, (yr, url), work = args
    cf = Path(CACHE) / f"{tid}-{yr}.pkl" if CACHE else None
    if cf and cf.exists():
        return pickle.loads(cf.read_bytes())
    out = one_tile(tid, url, work)
    if cf:
        cf.write_bytes(pickle.dumps(out))
    return out


def one_tile(tid, url, work):
    d = Path(work) / tid
    d.mkdir(parents=True, exist_ok=True)
    z = d / "t.zip"
    subprocess.run(["curl", "-s", "-f", "--retry", "3", "-o", str(z), url], check=True)
    with zipfile.ZipFile(z) as zf:
        zf.extractall(d)
    z.unlink()
    out = []
    gdb = next(d.glob("*.gdb"))
    try:
        c = fiona.open(gdb, layer="Building_solid")
    except Exception as e:  # a tile without buildings (for example in a lake) has an empty layer
        print("tile", tid, "skipped:", e, file=sys.stderr)
        shutil.rmtree(d)
        return out
    with c:
        for f in c:
            p = f["properties"]
            g = shape(f["geometry"])
            polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
            h, how = p.get("GESAMTHOEHE"), "stated"
            if h is None:  # tiles without the stated height (no EGID, e.g. Geneva, Lausanne, Lugano, Zermatt): computed from the solid
                zs = [c[2] for q in polys for c in q.exterior.coords]  # (DACH_MAX is not used: in the Lausanne tiles it lies about 48 m above the solid's top)
                if not zs:
                    continue
                h, how = max(zs) - min(zs), "computed"
            if h <= MIN_H or (how == "computed" and h > MAX_COMPUTED):  # a computed height over 200 m is a geometry error (one such "Hochhaus" in Geneva)
                continue
            flat = [Polygon([(x, y) for x, y, *_ in q.exterior.coords]).buffer(0) for q in polys if q.area > 0]
            fp = unary_union([q for q in flat if not q.is_empty]).simplify(0.5)
            if fp.is_empty:
                continue
            out.append(dict(uuid=p["UUID"], egid=p["EGID"], name=p["NAME_KOMPLETT"], use=p["GEBAEUDE_NUTZUNG"],
                            kind=p["OBJEKTART"], h=h, roofMax=p["DACH_MAX"], ground=p["GELAENDEPUNKT"],
                            year=p["HERKUNFT_JAHR"], how=how, tile=tid, fp=fp))
    shutil.rmtree(d)
    return out


def main():
    global CACHE
    if "--cache" in sys.argv:
        CACHE = sys.argv[sys.argv.index("--cache") + 1]
        Path(CACHE).mkdir(parents=True, exist_ok=True)
    ts = tiles()
    print(len(ts), "tiles", file=sys.stderr)
    work = tempfile.mkdtemp(prefix="sb3d-")
    seen, rows = {}, []
    with ThreadPoolExecutor(6) as ex:
        for i, res in enumerate(ex.map(one, [(t, v, work) for t, v in sorted(ts.items())])):
            for b in res:
                if b["how"] == "computed" and b["h"] > MAX_COMPUTED:
                    continue
                k = b["uuid"]
                if k in seen:  # tiles overlap at the edges: keep one
                    continue
                seen[k] = 1
                rows.append(b)
            print(i + 1, "/", len(ts), len(rows), file=sys.stderr)
    shutil.rmtree(work, ignore_errors=True)

    def ring(r):
        return [[round(x, 6), round(y, 6)] for x, y in (TO_WGS.transform(*c) for c in r)]

    items = []
    for b in sorted(rows, key=lambda b: -b["h"]):
        g = b["fp"]
        parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
        items.append(dict(
            egid=b["egid"], name=b["name"], use=b["use"], kind=b["kind"],
            h=round(b["h"], 2), how=b["how"], ground=b["ground"], roofMax=b["roofMax"], year=b["year"],
            polys=[[ring(p.exterior.coords)] + [ring(i.coords) for i in p.interiors] for p in parts if p.area > 1]))
    doc = dict(
        source="swissBUILDINGS3D 3.0 Beta, ©swisstopo (Federal Office of Topography swisstopo)",
        url="https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta",
        field="h = GESAMTHOEHE of the source (m) where how=stated; where how=computed the source states none and h = highest minus lowest point of the 3D solid (computed; in the Zürich tile where both exist the computed height is about 3.4 m more than the stated one, median). Footprint = faces of the solid projected and merged (computed)",
        minHeight=MIN_H, tiles=len(ts), buildings=items)
    (ROOT / "data" / "tall-buildings.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(len(items), "buildings taller than", MIN_H, "m", file=sys.stderr)


if __name__ == "__main__":
    main()
