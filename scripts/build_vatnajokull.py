#!/usr/bin/env python3
"""
build_outlines.py - outlines of the Vatnajökull ice cap and its outlets -> data/vatnajokull.js

Source: Randolph Glacier Inventory 6.0, region 06 (Iceland), through the GLIMS web feature service
(https://www.glims.org/geoserver, layer GLIMS:RGI_Iceland). RGI 6.0 outlines of Iceland are from about 2000
(field BGNDATE 2000), so they show where the ice stood then, not today. Each RGI entity of the ice cap is one drainage
basin ("outlet"); together they cover the ice cap.

    python3 scripts/build_vatnajokull.py            writes data/vatnajokull.js
    python3 scripts/build_vatnajokull.py --list     only lists the entities found

Standard library only. Coordinates arrive in Web Mercator, are converted to latitude/longitude and thinned
(Douglas-Peucker) so that the file stays small.

OUTLETS below is the hand-made list of outlets that can be chosen on the site: the RGI id, a display name, and
the image footprint (centre of the lower tongue and half the side in km). Add an outlet here, then add its centre
to CENTRES in worker/worker.js.
"""
import argparse, json, math, os, sys, urllib.parse, urllib.request

WFS = "https://www.glims.org/geoserver/ows"
LAYER = "GLIMS:RGI_Iceland"
# Vatnajökull ice cap: centroids of its RGI entities lie in this box (Hofsjökull and Mýrdalsjökull lie outside it).
BOX = dict(lon=(-18.25, -15.0), lat=(63.85, 64.85))
MIN_AREA_KM2 = 2.0                      # smaller entities are left out of the overview

# Outlets that can be chosen. lat/lon: centre of the satellite picture; half: half the side of the square picture in km.
# tip: where the 3D area starts: the arrow of the hand drawing, on the west shore of the lagoon, at the front of the tongue; strip3d: the 3D area around it (azimuth: the direction up the glacier in
#   degrees clockwise from north; half: half the width across, metres; back / up: metres below the tip and up the glacier; cell: the grid in metres).
# lat, lon, half: the picture (a square of 2 x half km) is centred on that area, so that the area lies inside it.
# Breiðamerkurjökull: the outlet whose snout calves into the glacier lagoon Jökulsárlón.
OUTLETS = [
    dict(id="breidamerkurjokull", rgi="RGI60-06.00483", name="Breiðamerkurjökull",
         lat=64.095, lon=-16.305, half=12.4, tip=[64.06564, -16.24333],
         strip3d=dict(azimuth=318, half=9000, back=1500, up=10200, cell=36),      # the 3D area, as drawn by hand on a screenshot: the whole lobe of the tongue, 18 km along the lagoon shore and 10 km up the glacier
         note="Its snout ends in the glacier lagoon Jökulsárlón."),
]
# Display names for RGI entities (RGI writes Icelandic letters in ASCII). Only entities with an RGI name are listed.
NAMES = {
    "Skeidararjoekull": "Skeiðarárjökull", "Bruarjoekull": "Brúarjökull", "Breidamerkurjoekull": "Breiðamerkurjökull",
    "Dyngjujoekull": "Dyngjujökull", "Sidujoekull/Skaftarjoekull": "Síðujökull / Skaftárjökull",
    "Koeldukvislarjoekull": "Köldukvíslarjökull", "Tungnaarjoekull": "Tungnaárjökull", "Sylgjujoekull": "Sylgjujökull",
    "Eyjabakkajoekull": "Eyjabakkajökull",
}
R = 6378137.0

def to_lonlat(x, y):
    return (x / R * 180 / math.pi, (2 * math.atan(math.exp(y / R)) - math.pi / 2) * 180 / math.pi)

def dp(pts, tol):
    """Douglas-Peucker on a list of (x, y) in metres; iterative."""
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, idx = -1, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L
            if d > best: best, idx = d, i
        if best > tol:
            keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

def ring_out(ring, tol):
    pts = [tuple(p) for p in ring]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)   # a closed ring has no chord: split it at the point farthest from the start
    pts = dp(pts[:far + 1], tol)[:-1] + dp(pts[far:], tol)
    if len(pts) < 4: return None
    out = []
    for x, y in pts:
        lon, lat = to_lonlat(x, y)
        out.append([round(lat, 5), round(lon, 5)])
    return out

def area_km2(ring):
    return abs(sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))) / 2e6

def fetch():
    cql = f"CENLON BETWEEN {BOX['lon'][0]} AND {BOX['lon'][1]} AND CENLAT BETWEEN {BOX['lat'][0]} AND {BOX['lat'][1]}"
    q = urllib.parse.urlencode(dict(service="WFS", version="1.0.0", request="GetFeature", typeName=LAYER,
                                    outputFormat="application/json", cql_filter=cql))
    with urllib.request.urlopen(urllib.request.Request(WFS + "?" + q, headers={"User-Agent": "vatnajokullfromspace/1.0"}), timeout=180) as r:
        return json.load(r)["features"]

def outline(geom, tol, min_km2):
    """Outer rings and holes as [lat, lon] lists; outer rings smaller than min_km2 are left out (with their holes)."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        if area_km2(poly[0]) < min_km2: continue
        for ring in poly:
            r = ring_out(ring, tol)
            if r: out.append(r)
    return out

# ---- the outlines of other dates (Icelandic Met Office) ----
# The Icelandic Met Office (Veðurstofa Íslands) publishes the outlines of the glaciers of Iceland for many dates (Hannesdóttir et al. 2020, Jökull 70, 1-34; CC BY 4.0), the Little Ice
# Age maximum (about 1890) to Sentinel-2 outlines of every September since 2017: WFS https://geo.vedur.is/geoserver/wfs, layers glaciology:glacierpolygon_<epoch>. They are outlines of the
# whole of Vatnajokull (one big polygon with its rings), not of single outlets. For an outlet the lines inside its region are kept: its RGI basin and 6 km around it, without the basins of
# the other RGI entities (a drainage divide is not an ice edge). Lines, not polygons, because the clipped shape is open at the edge of the region. The 2025 area is the ice inside the RGI basin.
IMO_WFS = "https://geo.vedur.is/geoserver/wfs"
IMO_EPOCHS = dict(lia=("glaciology:glacierpolygon_lia", 1890, "about 1890"), latest=("glaciology:glacierpolygon_sent2_2025", 2025, "17 September 2025, Sentinel-2"))
CELL, MARGIN = 100.0, 6000.0      # metres: the grid of the region masks, and how far around the RGI basin the lines are kept

def imo_polygons(layer, bbox):
    q = urllib.parse.urlencode(dict(service="WFS", version="1.0.0", request="GetFeature", typeName=layer, outputFormat="application/json",
                                    bbox=",".join(map(str, bbox)) + ",EPSG:4326", maxFeatures=2000))
    with urllib.request.urlopen(urllib.request.Request(IMO_WFS + "?" + q, headers={"User-Agent": "tonguesfromspace/1.0"}), timeout=180) as r:
        feats = json.load(r)["features"]
    rings = []
    for f in feats:
        g = f["geometry"]
        for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]):
            rings += [[(lat, lon) for lon, lat in ring] for ring in poly]
    return rings, (feats[0]["properties"].get("acq_date") or "")[:10] if feats else ""

class Grid:
    """A raster of the region in metres around a centre (equirectangular, good to a few metres over 100 km)."""
    def __init__(self, lat0, lon0, bbox):      # bbox: south, west, north, east
        self.lat0, self.lon0, self.k = lat0, lon0, 111320.0 * math.cos(math.radians(lat0))
        self.x0, self.y0 = (bbox[1] - lon0) * self.k, (bbox[0] - lat0) * 111320.0
        self.w, self.h = int(((bbox[3] - lon0) * self.k - self.x0) / CELL) + 2, int(((bbox[2] - lat0) * 111320.0 - self.y0) / CELL) + 2
    def xy(self, lat, lon): return ((lon - self.lon0) * self.k - self.x0) / CELL, ((lat - self.lat0) * 111320.0 - self.y0) / CELL
    def fill(self, rings):
        """even-odd fill of rings of (lat, lon): a bytearray, row by row from the south"""
        out = bytearray(self.w * self.h); edges = []
        for ring in rings:
            pts = [self.xy(la, lo) for la, lo in ring]
            for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
                if y1 != y2: edges.append((min(y1, y2), max(y1, y2), x1, (x2 - x1) / (y2 - y1), y1))
        edges.sort()
        active = []; ei = 0
        for row in range(self.h):
            y = row + 0.5
            while ei < len(edges) and edges[ei][0] <= y: active.append(edges[ei]); ei += 1
            active = [e for e in active if e[1] > y]
            xs = sorted(e[2] + (y - e[4]) * e[3] for e in active)
            for a, b in zip(xs[0::2], xs[1::2]):
                for c in range(max(0, int(a + 0.5)), min(self.w, int(b + 0.5))): out[row * self.w + c] = 1
        return out
    def dilate(self, m, r):
        """square dilation by r cells (two passes of a sliding window)"""
        w, h = self.w, self.h; tmp = bytearray(w * h); out = bytearray(w * h)
        for y in range(h):
            row = m[y * w:(y + 1) * w]; pre = [0]
            for v in row: pre.append(pre[-1] + v)
            for x in range(w): tmp[y * w + x] = 1 if pre[min(w, x + r + 1)] - pre[max(0, x - r)] else 0
        for x in range(w):
            pre = [0]
            for y in range(h): pre.append(pre[-1] + tmp[y * w + x])
            for y in range(h): out[y * w + x] = 1 if pre[min(h, y + r + 1)] - pre[max(0, y - r)] else 0
        return out
    def at(self, m, lat, lon):
        x, y = self.xy(lat, lon); c, r = int(x), int(y)
        return 0 <= c < self.w and 0 <= r < self.h and m[r * self.w + c] == 1

def dp_ll(pts, tol_m, k):
    """Douglas-Peucker on (lat, lon); tol in metres"""
    if len(pts) < 4: return pts
    if pts[0] == pts[-1]:      # a closed ring has no chord: split it at the point farthest from the start
        far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + ((pts[i][1] - pts[0][1]) * k / 111320.0) ** 2)
        return dp_ll(pts[:far + 1], tol_m, k)[:-1] + dp_ll(pts[far:], tol_m, k)
    xy = [((lo) * k, la * 111320.0) for la, lo in pts]; keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (ax, ay), (bx, by) = xy[a], xy[b]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9; best, idx = -1, -1
        for i in range(a + 1, b):
            d = abs(dy * (xy[i][0] - ax) - dx * (xy[i][1] - ay)) / L
            if d > best: best, idx = d, i
        if best > tol_m: keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, kp in zip(pts, keep) if kp]

def outlines_for(o, other_basins):
    """{lia: {...}, latest: {...}} for one outlet: lines inside its region, and the 2025 area inside its RGI basin"""
    pts = [p for ring in o["outline"] for p in ring]; lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    dlat, dlon = MARGIN / 111320.0 + 0.02, MARGIN / (111320.0 * math.cos(math.radians(o["lat"]))) + 0.03
    bbox = (min(lats) - dlat, min(lons) - dlon, max(lats) + dlat, max(lons) + dlon)
    g = Grid(o["lat"], o["lon"], bbox)
    basin = g.fill(o["outline"]); near = g.dilate(basin, int(MARGIN / CELL))
    others = g.fill([r for b in other_basins for r in b["outline"]])
    region = bytearray(1 if n and not x else 0 for n, x in zip(near, others))      # near the basin, not in another RGI basin
    for i in range(len(basin)):
        if basin[i]: region[i] = 1
    out = {}
    for key, (layer, year, label) in IMO_EPOCHS.items():
        rings, date = imo_polygons(layer, [bbox[1], bbox[0], bbox[3], bbox[2]])
        runs = []
        for ring in rings:
            run = []
            for la, lo in ring + ring[:1]:
                if g.at(region, la, lo): run.append((la, lo))
                else:
                    if len(run) > 2: runs.append(run)
                    run = []
            if len(run) > 2: runs.append(run)
        lines = [[[round(a, 5), round(b, 5)] for a, b in dp_ll(r, 15, g.k)] for r in runs]
        ice = g.fill(rings); area = sum(1 for a, b in zip(ice, basin) if a and b) * CELL * CELL / 1e6
        out[key] = dict(year=year, label=label, date=date, lines=[l for l in lines if len(l) > 2], areaInBasinKm2=round(area, 1))
        print(f"  {o['name']} {label}: {len(rings)} rings, {len(out[key]['lines'])} lines, {sum(len(l) for l in out[key]['lines'])} points, {area:.0f} km2 inside the RGI basin")
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "vatnajokull.js"))
    a = ap.parse_args()
    feats = fetch()
    rows = sorted((f for f in feats if f["properties"]["AREA"] >= MIN_AREA_KM2), key=lambda f: -f["properties"]["AREA"])
    print(f"{len(feats)} RGI entities in the box, {len(rows)} of at least {MIN_AREA_KM2} km2, "
          f"{sum(f['properties']['AREA'] for f in rows):.0f} km2 in total")
    for f in rows[:14]:
        p = f["properties"]; print(f"  {p['RGIID']}  {p['AREA']:8.1f} km2  {p['NAME'] or '-':28} outline date {p['BGNDATE'][:4]}")
    if a.list: return
    chosen = {o["rgi"]: o for o in OUTLETS}
    missing = [r for r in chosen if not any(f["properties"]["RGIID"] == r for f in rows)]
    if missing: sys.exit(f"Outlet not found in the inventory: {missing}")
    outlets, basins = [], []
    for f in rows:
        p = f["properties"]
        if p["RGIID"] in chosen:
            o = chosen[p["RGIID"]]
            outlets.append(dict(id=o["id"], rgi=p["RGIID"], name=o["name"], note=o["note"],
                                areaKm2=round(p["AREA"], 1), lengthKm=round(p["LMAX"] / 1000, 1), zmin=p["ZMIN"], zmax=p["ZMAX"],
                                outlineYear=int(p["BGNDATE"][:4]), lat=o["lat"], lon=o["lon"], half=o["half"], tip=o["tip"], strip3d=o["strip3d"],
                                outline=outline(f["geometry"], 25, 0)))
        else:
            basins.append(dict(rgi=p["RGIID"], name=NAMES.get(p["NAME"], p["NAME"] or ""), areaKm2=round(p["AREA"], 1),
                               outline=outline(f["geometry"], 120, 0.5)))
    for o in outlets:
        o["outlines"] = outlines_for(o, basins)      # the Icelandic Met Office outlines of about 1890 and of 2025
    data = dict(
        source="Randolph Glacier Inventory 6.0, region 06 Iceland (RGI Consortium 2017), via GLIMS; outlines from about 2000",
        icecap=dict(name="Vatnajökull", areaKm2=round(sum(f["properties"]["AREA"] for f in rows)), entities=len(rows)),
        outlets=outlets, basins=basins)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fh:
        fh.write("// generated by scripts/build_vatnajokull.py - do not edit by hand\nwindow.VATNAJOKULL = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"wrote {a.out} ({os.path.getsize(a.out) / 1024:.0f} kB)")

if __name__ == "__main__":
    main()
