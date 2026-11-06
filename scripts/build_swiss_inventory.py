#!/usr/bin/env python3
"""Writes data/swiss-glaciers.json for the layer "All Swiss glaciers" (map and 3D): every glacier of the Swiss Glacier Inventory SGI2023 as a simplified outline
with the attributes the hover shows. Source: GLAMOS, doi:10.18750/inventory.sgi2023.r2026 (CC BY 4.0); the attribute values are copied as the file states them
(area_km2, length_km, masl_min, masl_max); the outlines are simplified to about 25 m for the screen.

    python3 scripts/build_swiss_inventory.py [path/to/inventory_sgi2023_r2026[.zip]]      (default: the zip of GLAMOS, downloaded)

Record: [sgi-id, name, area_km2, length_km, masl_min, masl_max, [[ring, ring, ...] per polygon]], a ring a flat list [lng, lat, lng, lat, ...] with 5 decimals."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_outlines as bo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else bo.LATEST_URL
if os.path.isdir(src):                                    # the unpacked folder: read the shapefile and its dbf directly
    shp = os.path.join(src, "SGI_2023_glaciers.shp")
    feats = bo.read_shp_polygons(open(shp, "rb").read()); rows = bo.read_dbf(open(shp[:-4] + ".dbf", "rb").read(), "utf-8")
else:
    name, feats, rows = bo.pick_layer(bo.load_zip(src), "SGI2023")
TOL = 25
out = []
for rings, row in zip(feats, rows):
    if not rings: continue
    polys = bo.assemble(rings); parts = []
    for p in polys:
        rs = []
        for r in p:
            h = len(r) // 2                                   # a closed ring has the same first and last point, which the simplifier cannot handle: two halves
            q = bo.simplify(r[:h + 1], TOL)[:-1] + bo.simplify(r[h:], TOL)
            pts = [bo.to_wgs84(x, y) for x, y in q]
            if len(pts) >= 4: rs.append([c for pt in pts for c in pt])
        if rs: parts.append(rs)
    num = lambda k: row.get(k) if isinstance(row.get(k), (int, float)) else None
    out.append([row.get("sgi-id"), (row.get("name") or "").strip() or None, num("area_km2"), num("length_km"), num("masl_min"), num("masl_max"), parts])
path = os.path.join(ROOT, "data", "swiss-glaciers.json")
json.dump({"source": "GLAMOS (2026). Swiss Glacier Inventory 2023, release 2026, doi:10.18750/inventory.sgi2023.r2026", "glaciers": out}, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "glaciers,", round(os.path.getsize(path) / 1e6, 2), "MB ->", path)
