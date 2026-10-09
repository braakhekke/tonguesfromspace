#!/usr/bin/env python3
"""
build_outlines.py  -  GLAMOS glacier data for Swiss Glacier Tongues from Space (index.html)

Downloads the Swiss Glacier Inventories 1850, 1973 and 2023 (CC BY 4.0) and the GLAMOS
length-change series from GLAMOS, ranks glaciers by area in the newest inventory, matches
each to its 1850 outline and 1973 area, adds its length-change figures, and writes
glaciers.js to the repository root, next to index.html. The dashboard picks it up automatically.
It also adds the GLAMOS volume-change survey of each glacier, the Swiss-wide glacier volume per
year, and the radar ice thickness (thinned to one mean per 50 m cell, written to thickness.js).

    python3 scripts/build_outlines.py              # SGI2023 (newest) vs SGI1850 (oldest)
    python3 scripts/build_outlines.py --top 10 --simplify 8
    python3 scripts/build_outlines.py --latest path/to/inventory_sgi2023_r2026.zip

Pure Python standard library: no GDAL, geopandas or pyproj needed.
Reads shapefiles (.shp/.dbf) or GeoPackages (.gpkg) inside the zip.
LV95 / LV03 -> WGS84 uses swisstopo's approximate formulas (about 1 m accuracy),
which is far below the 10 m pixel size of Sentinel-2.

When GLAMOS publishes a newer inventory, pass its zip URL with --latest and
--latest-label (e.g. "SGI2029") and re-run.
"""
import argparse, csv, hashlib, io, json, math, os, sqlite3, struct, sys, tempfile, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date

LATEST_URL = "https://doi.glamos.ch/data/inventory/inventory_sgi2023_r2026.zip"
OLDEST_URL = "https://doi.glamos.ch/data/inventory/inventory_sgi1850_r1992.zip"
MID_URL    = "https://doi.glamos.ch/data/inventory/inventory_sgi1973_r1976.zip"
LENGTH_URL = "https://doi.glamos.ch/data/lengthchange/lengthchange.csv"
VOLUME_URL = "https://doi.glamos.ch/data/volumechange/volumechange.csv"
SWISS_URL  = "https://doi.glamos.ch/data/massbalance_swisswide/massbalance_swisswide_2025_r2025.zip"
THICK_URL  = "https://doi.glamos.ch/data/icethickness/icethickness_2020_r2020.zip"
BALANCE_URL = "https://doi.glamos.ch/data/massbalance/massbalance_2025_r2025.zip"

SKIP_WORDS = ("debris", "divide", "location", "centre", "center", "line", "point", "surface")

# ---------------------------------------------------------------- loading
def _ssl_context():
    """Use certifi's CA bundle when available (fixes python.org builds on macOS)."""
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

def fetch_bytes(src):
    if not src.startswith("http"):
        with open(os.path.expanduser(src), "rb") as f:
            return f.read()
    print(f"  downloading {src}")
    req = urllib.request.Request(src, headers={"User-Agent": "glacier-dashboard/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=180, context=_ssl_context()) as r:
            return r.read()
    except urllib.error.URLError as e:
        if "CERTIFICATE_VERIFY_FAILED" not in str(e):
            raise
        ver = f"{sys.version_info.major}.{sys.version_info.minor}"
        sys.exit(
            "\nPython could not verify the HTTPS certificate (common with python.org builds on macOS).\n"
            "Fix it once with ONE of these, then run this script again:\n"
            f'  1. "/Applications/Python {ver}/Install Certificates.command"\n'
            "  2. python3 -m pip install certifi\n"
            "Or download the file in your browser and pass the local path instead.\n")

def load_zip(src):
    return zipfile.ZipFile(io.BytesIO(fetch_bytes(src)))

def read_dbf(data, encoding):
    n, hlen, rlen = struct.unpack("<xxxxIHH", data[:12])
    fields, pos = [], 32
    while data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b"\0")[0].decode("ascii", "replace")
        fields.append((name, chr(data[pos + 11]), data[pos + 16]))
        pos += 32
    rows = []
    for i in range(n):
        rec = data[hlen + i * rlen: hlen + (i + 1) * rlen]
        off, row = 1, {}
        for name, typ, size in fields:
            raw = rec[off:off + size]; off += size
            val = raw.decode(encoding, "replace").strip()
            if typ in "NF" and val:
                try: val = float(val)
                except ValueError: pass
            row[name] = val
        rows.append(row)
    return rows

def read_shp_polygons(data):
    """Returns list of features; each feature is a list of rings [(x, y), ...]."""
    shape_type = struct.unpack("<i", data[32:36])[0]
    if shape_type % 10 != 5:
        return None
    pos, feats = 100, []
    while pos + 8 <= len(data):
        clen = struct.unpack(">i", data[pos + 4:pos + 8])[0] * 2
        rec = data[pos + 8: pos + 8 + clen]; pos += 8 + clen
        st = struct.unpack("<i", rec[:4])[0]
        if st == 0:
            feats.append([]); continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44:44 + 4 * nparts])) + [npts]
        p0 = 44 + 4 * nparts
        pts = [struct.unpack("<dd", rec[p0 + 16 * k: p0 + 16 * k + 16]) for k in range(npts)]
        feats.append([pts[parts[k]:parts[k + 1]] for k in range(nparts)])
    return feats

def read_wkb(b, off=0):
    """Minimal WKB reader for (Multi)Polygon, 2D/Z/M/ZM. Returns (list_of_rings, new_offset)."""
    bo = "<" if b[off] == 1 else ">"
    t = struct.unpack(bo + "I", b[off + 1:off + 5])[0]; off += 5
    if t & 0x80000000 or t & 0x40000000:            # EWKB flags
        hasz, hasm = bool(t & 0x80000000), bool(t & 0x40000000)
        if t & 0x20000000: off += 4
        t &= 0xFFFF
    else:
        hasz, hasm = t // 1000 in (1, 3), t // 1000 in (2, 3)
        t %= 1000
    dim = 2 + hasz + hasm
    rings = []
    if t == 3:
        nr = struct.unpack(bo + "I", b[off:off + 4])[0]; off += 4
        for _ in range(nr):
            npts = struct.unpack(bo + "I", b[off:off + 4])[0]; off += 4
            ring = []
            for _ in range(npts):
                xy = struct.unpack(bo + "d" * dim, b[off:off + 8 * dim]); off += 8 * dim
                ring.append((xy[0], xy[1]))
            rings.append(ring)
    elif t == 6:
        n = struct.unpack(bo + "I", b[off:off + 4])[0]; off += 4
        for _ in range(n):
            r, off = read_wkb(b, off); rings += r
    else:
        raise ValueError(f"unsupported geometry type {t}")
    return rings, off

def read_gpkg(path):
    con = sqlite3.connect(path)
    layers = []
    for (table,) in con.execute("select table_name from gpkg_contents where data_type='features'"):
        geomcol = con.execute("select column_name from gpkg_geometry_columns where table_name=?", (table,)).fetchone()[0]
        cur = con.execute(f'select * from "{table}"')
        cols = [c[0] for c in cur.description]
        feats, rows = [], []
        for rec in cur:
            row = dict(zip(cols, rec)); blob = row.pop(geomcol)
            if blob is None: continue
            flags = blob[3]; env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
            try:
                rings, _ = read_wkb(blob, 8 + env)
            except ValueError:
                feats = None; break
            feats.append(rings); rows.append(row)
        if feats:
            layers.append((table, feats, rows))
    return layers

def layers_in_zip(zf):
    """Yield (name, features, rows) for every polygon layer in the zip."""
    names = zf.namelist()
    for n in names:
        if n.lower().endswith(".shp"):
            base = n[:-4]
            feats = read_shp_polygons(zf.read(n))
            if feats is None: continue
            enc = "utf-8"
            for ext in (".cpg", ".CPG"):
                if base + ext in names:
                    enc = zf.read(base + ext).decode().strip() or enc
            dbf = next((base + e for e in (".dbf", ".DBF") if base + e in names), None)
            rows = read_dbf(zf.read(dbf), enc) if dbf else [{} for _ in feats]
            yield os.path.basename(n), feats, rows
    for n in names:
        if n.lower().endswith(".gpkg"):
            with tempfile.NamedTemporaryFile(suffix=".gpkg", delete=False) as tmp:
                tmp.write(zf.read(n))
            try:
                for table, feats, rows in read_gpkg(tmp.name):
                    yield f"{os.path.basename(n)}:{table}", feats, rows
            finally:
                os.unlink(tmp.name)

def pick_layer(zf, label):
    layers = list(layers_in_zip(zf))
    if not layers:
        sys.exit(f"No polygon layer found in the {label} archive.")
    def score(l):
        name = l[0].lower()
        return (("glacier" in name or "sgi" in name) and not any(w in name for w in SKIP_WORDS), len(l[1]))
    name, feats, rows = max(layers, key=score)
    # Normalise LV03 (E ~600 000) to LV95 (E ~2 600 000); the ~1 m difference is irrelevant here.
    sample = next((r[0] for f in feats for r in f if r), (2.6e6, 1.2e6))
    if sample[0] < 1e6:
        feats = [[[(x + 2e6, y + 1e6) for x, y in r] for r in f] for f in feats]
        print(f"  {label}: LV03 coordinates converted to LV95")
    print(f"  {label}: using layer '{name}' ({len(feats)} polygons)")
    return name, feats, rows

# ---------------------------------------------------------------- fields
def find_field(rows, candidates):
    keys = {k.lower().replace("-", "_"): k for k in (rows[0].keys() if rows else [])}
    for c in candidates:
        if c in keys: return keys[c]
    for c in candidates:
        for lk, k in keys.items():
            if c in lk: return k
    return None

# ---------------------------------------------------------------- geometry
def shoelace(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2

def point_in_ring(x, y, r):
    inside = False
    for i in range(len(r) - 1):
        (x1, y1), (x2, y2) = r[i], r[i + 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside

def assemble(rings):
    """Group a flat ring list into polygons [outer, hole, ...] using containment."""
    rings = [r if r[0] == r[-1] else r + [r[0]] for r in rings if len(r) >= 3]
    rings.sort(key=lambda r: -abs(shoelace(r)))
    polys = []
    for r in rings:
        host = None
        for p in polys:
            if point_in_ring(r[0][0], r[0][1], p[0]) and not any(point_in_ring(r[0][0], r[0][1], h) for h in p[1:]):
                host = p; break
        if host: host.append(r)
        else: polys.append([r])
    return polys

def simplify(pts, tol):
    if tol <= 0 or len(pts) < 5: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-9
        best, idx = 0, None
        for i in range(a + 1, b):
            d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L
            if d > best: best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True; stack += [(a, idx), (idx, b)]
    out = [p for p, k in zip(pts, keep) if k]
    return out if len(out) >= 4 else pts

def to_wgs84(e, n):
    """swisstopo approximate formulas, LV95 or LV03 -> WGS84 (lon, lat)."""
    if e > 1e6: e, n = e - 2600000, n - 1200000
    else:       e, n = e - 600000, n - 200000
    y, x = e / 1e6, n / 1e6
    lam = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    phi = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return round(lam * 100 / 36, 5), round(phi * 100 / 36, 5)       # 5 decimals = about 1 m, far below the 10 m pixels, and about 25 % smaller

def group(feats, rows, id_field):
    groups = {}
    for i, (rings, row) in enumerate(zip(feats, rows)):
        if not rings: continue
        key = str(row.get(id_field) or f"f{i}") if id_field else f"f{i}"
        g = groups.setdefault(key, {"rings": [], "rows": []})
        g["rings"] += rings; g["rows"].append(row)
    for g in groups.values():
        g["polys"] = assemble(g["rings"])
        g["area"] = sum(abs(shoelace(p[0])) - sum(abs(shoelace(h)) for h in p[1:]) for p in g["polys"]) / 1e6
        xs = [x for p in g["polys"] for x, _ in p[0]]; ys = [y for p in g["polys"] for _, y in p[0]]
        g["bbox"] = (min(xs), min(ys), max(xs), max(ys))
    return groups

def geojson(polys, tol):
    out = []
    for p in polys:
        rings = [[list(to_wgs84(x, y)) for x, y in simplify(r, tol)] for r in p]
        if len(rings[0]) >= 4: out.append(rings)
    return {"type": "MultiPolygon", "coordinates": out}

def bbox_wgs(b):
    w, s = to_wgs84(b[0], b[1]); e, n = to_wgs84(b[2], b[3])
    return [[s, w], [n, e]]

def first_text(rows, field):
    if not field: return None
    for r in rows:
        v = r.get(field)
        if isinstance(v, str) and v.strip(): return v.strip()
    return None

def common_year(rows, field):
    if not field: return None
    years = [int(r[field]) for r in rows if isinstance(r.get(field), (int, float)) and r[field] > 1800]
    return max(set(years), key=years.count) if years else None

# ---------------------------------------------------------------- main
def best_match(g, groups):
    """Inventory entity in another inventory that covers most of g's outline vertices."""
    samples = [pt for p in g["polys"] for pt in p[0]]
    samples = samples[:: max(1, len(samples) // 300)]
    best, best_hits = None, 0
    bx0, by0, bx1, by1 = g["bbox"]
    for key, og in groups.items():
        ox0, oy0, ox1, oy1 = og["bbox"]
        if ox1 < bx0 or ox0 > bx1 or oy1 < by0 or oy0 > by1: continue
        hits = sum(1 for x, y in samples
                   if any(point_in_ring(x, y, p[0]) and not any(point_in_ring(x, y, h) for h in p[1:]) for p in og["polys"]))
        if hits > best_hits: best, best_hits = (key, og), hits
    return best

HEIGHT_URL = "https://api3.geo.admin.ch/rest/services/height"

def terrain_height(x, y):
    """Terrain height in m (swisstopo height service) at an inventory coordinate, or None."""
    q = f"?easting={x:.1f}&northing={y:.1f}&sr={2056 if x > 2e6 else 21781}"
    for _ in range(2):
        try:
            req = urllib.request.Request(HEIGHT_URL + q, headers={"User-Agent": "glacier-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=20, context=_ssl_context()) as r:
                return float(json.loads(r.read())["height"])
        except Exception:
            pass
    return None

def terminus(polys):
    """Where the tongue ends: the lowest point of the outline of the main body, found with the swisstopo
    height service (every ~100th vertex first, then all vertices around the lowest one).
    Returns {"tip": [lat, lng], "tip_m": height} or None when the service does not answer."""
    ring = max((p[0] for p in polys), key=len)
    step = max(1, len(ring) // 100)
    with ThreadPoolExecutor(8) as ex:
        rough = list(zip(range(0, len(ring), step), ex.map(lambda i: terrain_height(*ring[i][:2]), range(0, len(ring), step))))
        rough = [(i, h) for i, h in rough if h is not None]
        if len(rough) < 20: return None
        i0 = min(rough, key=lambda t: t[1])[0]
        idx = [(i0 + k) % len(ring) for k in range(-step, step + 1)]
        fine = [(i, h) for i, h in zip(idx, ex.map(lambda i: terrain_height(*ring[i][:2]), idx)) if h is not None]
    i, h = min(fine or rough, key=lambda t: t[1])
    lng, lat = to_wgs84(*ring[i][:2])
    return {"tip": [lat, lng], "tip_m": round(h)}

def norm_name(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())

def read_length_change(src):
    """GLAMOS length-change CSV -> {glacier id: [rows]}, also indexed by normalised name."""
    text = fetch_bytes(src).decode("utf-8-sig", "replace").splitlines()
    start = next(i for i, l in enumerate(text) if l.lower().startswith("glacier name"))
    rows = [r for r in csv.reader(text[start + 3:]) if len(r) >= 7 and r[0].strip()]
    by_id, by_name = {}, {}
    for r in rows:
        try: dl = float(r[6])
        except ValueError: continue
        rec = {"start": r[2], "end": r[4], "dl": dl, "h": r[7].strip() if len(r) > 7 else ""}
        by_id.setdefault(r[1].strip(), []).append(rec)
        by_name.setdefault(norm_name(r[0]), []).append(rec)
    for d in (by_id, by_name):
        for v in d.values(): v.sort(key=lambda x: x["end"])
    return by_id, by_name

def length_stats(series, since="2016"):
    """Four figures from one glacier's series, all from the same measurements."""
    if not series: return None
    recent = [r for r in series if r["start"][:4] >= since]
    last = series[-1]
    return {
        "first_year": int(series[0]["start"][:4]),
        "last_year": int(last["end"][:4]),
        "total_m": round(sum(r["dl"] for r in series)),
        "recent_m": round(sum(r["dl"] for r in recent)) if recent else None,
        "recent_from": int(recent[0]["start"][:4]) if recent else None,
        "latest_m": round(last["dl"], 1),
        "latest_period": [last["start"][:4], last["end"][:4]],
        "observations": len(series),
        # every survey as [start year, end year, change in m], so the page can add up any range of years
        "series": [[int(r["start"][:4]), int(r["end"][:4]), round(r["dl"], 1)] for r in series],
    }

# ---------------------------------------------------------------- volume change, Swiss-wide volume, radar thickness
def read_volume_change(src):
    """GLAMOS volume-change CSV (geodetic, from DEM comparisons) -> {SGI id: [interval, ...]}.
    Interval = [start year, end year, dV km3, mean thickness change m, geodetic balance m w.e./a, sigma m w.e./a, covered %].
    The same period can appear with different DEM sources; the one with the larger coverage is kept.
    All intervals are kept, back to the first elevation model (for Aletsch 1927); the page draws the whole history and picks the newest for its tiles."""
    text = fetch_bytes(src).decode("utf-8-sig", "replace").splitlines()
    start = next(i for i, l in enumerate(text) if l.startswith("SGI-ID"))
    best = {}
    for r in csv.reader(text[start + 2:]):
        if len(r) < 14 or not r[0].strip(): continue
        try:
            sy, ey = int(r[3][:4]), int(r[4][:4])
            rec = [sy, ey, round(float(r[9]), 4), round(float(r[10]), 1), round(float(r[11]), 2), round(float(r[12]), 2), round(float(r[13]))]
        except ValueError: continue
        if ey <= sy: continue
        k = (r[0].strip(), sy, ey)
        if k not in best or rec[6] > best[k][6]: best[k] = rec
    out = {}
    for (gid, _, _), rec in best.items(): out.setdefault(gid, []).append(rec)
    for v in out.values(): v.sort(key=lambda x: (x[1], x[0]))
    return out

def volume_stats(intervals, ref=2016):
    """The interval to show for one glacier: the one that ends last (and covers at least 90 %), starting closest to the first satellite year."""
    ok = [r for r in (intervals or []) if r[6] >= 90 and r[0] >= ref - 2]
    if not ok: return None
    last = max(r[1] for r in ok)
    b = min((r for r in ok if r[1] == last), key=lambda r: (abs(r[0] - ref), -r[6]))
    return {"from": b[0], "to": b[1], "dV_km3": b[2], "dh_m": b[3], "bal_mwe_a": b[4], "sigma": b[5], "covered_pct": b[6],
            "series": intervals}

def read_balance(src):
    """GLAMOS glacier mass balance zip (direct measurements on about 40 glaciers, hydrological year) -> {SGI id: [[year, annual balance mm w.e.], ...]}.
    The year is the one the hydrological year ends in (autumn of that year)."""
    zf = load_zip(src)
    name = next(n for n in zf.namelist() if "fixdate" in n and "elevationbins" not in n and n.endswith(".csv"))
    text = zf.read(name).decode("utf-8-sig", "replace").splitlines()
    start = next(i for i, l in enumerate(text) if l.startswith("glacier name"))
    out = {}
    for r in csv.reader(text[start + 3:]):
        if len(r) < 8 or not r[1].strip(): continue
        try: y, ba = int(r[4][:4]), float(r[7])
        except ValueError: continue
        out.setdefault(r[1].strip(), []).append([y, round(ba)])
    for v in out.values(): v.sort()
    return out

def read_swisswide(src):
    """GLAMOS Swiss-wide mass balance zip -> (total Swiss glacier volume per year [[year, km3, change in % against the year before], ...] from 2010,
    mass balance of all Swiss glaciers per year [[year, mm w.e.], ...] from 1915)."""
    zf = load_zip(src)
    name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
    text = zf.read(name).decode("utf-8-sig", "replace").splitlines()
    start = next(i for i, l in enumerate(text) if l.startswith("catchment"))
    out, bal = [], []
    for r in csv.reader(text[start + 2:]):
        if len(r) < 6 or r[0].strip() != "Switzerland": continue
        try: y, v = int(r[1]), float(r[4])
        except ValueError: continue
        try: pct = round(float(r[5]), 2)
        except ValueError: pct = None
        try: bal.append([y, round(float(r[3]) * 1000)])       # m w.e. -> mm w.e., like the glacier series
        except ValueError: pass
        if y >= 2010: out.append([y, round(v, 3), pct])
    return out, bal

def read_thickness(src, ids, cell=50):
    """GLAMOS radar ice thickness zip (ASCII, one file per glacier and source) -> ({id: summary}, {id: [[lat, lng, thickness m, survey year], ...]}).
    The points of all files of a glacier are thinned to one mean per cell x cell metres so the page can draw them.
    Every profile has its own survey date (first column, yyyymmdd). A cell keeps the mean thickness of each survey year that touched it:
    [lat, lng, thickness of the newest year, that year, [[year, thickness], ...] only when the cell was measured in more than one year]."""
    zf = load_zip(src)
    wanted = {i: [n for n in zf.namelist() if n.startswith(i + "_") and n.endswith(".txt")] for i in ids}
    summary, points = {}, {}
    for gid, names in wanted.items():
        cells, raw, mx, mx_year, mx_at, years = {}, 0, 0.0, None, None, set()
        for n in names:
            for line in zf.read(n).decode("utf-8", "replace").splitlines():
                if not line or line[0] == "#": continue
                f = line.split("\t")
                if len(f) < 9: continue
                try: e, nn, th = float(f[3]), float(f[4]), float(f[8])
                except ValueError: continue
                if th <= 0: continue
                y = int(f[0][:4]) if f[0][:4].isdigit() and f[0][:4] != "0000" else None
                raw += 1
                if th > mx: mx, mx_year, mx_at = th, y, (e, nn)
                if y: years.add(y)
                c = cells.setdefault((int(e // cell), int(nn // cell)), [0.0, 0.0, 0.0, 0, {}])
                c[0] += e; c[1] += nn; c[2] += th; c[3] += 1
                t = c[4].setdefault(y or 0, [0.0, 0]); t[0] += th; t[1] += 1
        if not cells: continue
        pts = []
        for c in cells.values():
            lng, lat = to_wgs84(c[0] / c[3], c[1] / c[3])
            per = sorted((y, round(t[0] / t[1])) for y, t in c[4].items())
            ny, nm = per[-1]
            pt = [lat, lng, nm, ny or None]
            if len(per) > 1: pt.append([[y or None, m] for y, m in per])
            pts.append(pt)
        pts.sort()
        points[gid] = pts
        lng, lat = to_wgs84(*mx_at)
        summary[gid] = {"max_m": round(mx), "max_year": mx_year, "max_at": [lat, lng], "n_points": raw, "n_cells": len(pts), "files": len(names),
                        "years": [min(years), max(years)] if years else None}
    return summary, points

def inventory_stats(groups, top):
    """How many glaciers the newest inventory lists, how big they are, and the share of the ten largest."""
    areas = [g["area"] for g in groups.values()]
    total = sum(areas)
    return {"count": len(areas), "area_km2": round(total, 1),
            "top_share_pct": round(100 * sum(g["area"] for _, g in top) / total),
            "n_over_1km2": sum(1 for a in areas if a >= 1), "n_under_0_1km2": sum(1 for a in areas if a < 0.1),
            "n_under_0_5km2": sum(1 for a in areas if a < 0.5)}

def previous_terminus(path):
    """{glacier id: (area, terminus)} from the glaciers.js built last time, so the swisstopo height service is asked only for new or changed glaciers."""
    try:
        with open(path, encoding="utf-8") as f:
            old = json.loads(f.read().split("window.GLACIER_DATA = ", 1)[1].rstrip().rstrip(";"))
        return {g["id"]: (g.get("area_km2"), g.get("terminus")) for g in old.get("glaciers", []) if g.get("terminus")}
    except (OSError, IndexError, ValueError, KeyError):
        return {}

def thickness_text(pts):
    return "/* generated by build_outlines.py - do not edit */\nwindow.GLACIER_THICKNESS = " + json.dumps(pts, separators=(",", ":")) + ";\n"

def write_thickness(path, pts):
    """thickness.js: radar thickness cells per glacier, loaded by the page only when the layer is switched on."""
    if not pts: return
    text = thickness_text(pts)
    try:
        with open(path, encoding="utf-8") as f:
            if f.read() == text: return
    except OSError: pass
    with open(path, "w", encoding="utf-8") as f: f.write(text)
    print(f"Wrote {path} ({os.path.getsize(path) / 1024:.0f} kB)")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--latest", default=LATEST_URL, help="zip (URL or path) of the newest inventory")
    ap.add_argument("--latest-label", default="SGI2023")
    ap.add_argument("--oldest", default=OLDEST_URL, help="zip (URL or path) of the oldest inventory")
    ap.add_argument("--oldest-label", default="SGI1850")
    ap.add_argument("--mid", default=MID_URL, help="zip (URL or path) of a middle inventory, for its area only")
    ap.add_argument("--mid-label", default="SGI1973")
    ap.add_argument("--lengthchange", default=LENGTH_URL, help="GLAMOS length-change CSV (URL or path); 'none' to skip")
    ap.add_argument("--volumechange", default=VOLUME_URL, help="GLAMOS volume-change CSV (URL or path); 'none' to skip")
    ap.add_argument("--balance", default=BALANCE_URL, help="GLAMOS glacier mass balance zip (URL or path); 'none' to skip")
    ap.add_argument("--swisswide", default=SWISS_URL, help="GLAMOS Swiss-wide mass balance zip (URL or path); 'none' to skip")
    ap.add_argument("--thickness", default=THICK_URL, help="GLAMOS radar ice thickness zip (URL or path); 'none' to skip")
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--simplify", type=float, default=8, help="outline simplification tolerance in metres")
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here) if os.path.basename(here) == "scripts" else here
    ap.add_argument("--out", default=os.path.join(root, "glaciers.js"), help="output file (default: repository root)")
    a = ap.parse_args()

    print("Reading newest inventory")
    _, feats, rows = pick_layer(load_zip(a.latest), a.latest_label)
    idf = find_field(rows, ["sgi_id", "sgiid", "sgi", "id_sgi", "gl_id", "id"])
    namef = find_field(rows, ["name", "glacier_na", "gl_name", "name_de", "gletscher"])
    yearf = find_field(rows, ["year_acq", "acq_year", "year", "jahr", "date"])
    print(f"  fields: id={idf} name={namef} year={yearf}")
    latest = group(feats, rows, idf)
    top = sorted(latest.items(), key=lambda kv: -kv[1]["area"])[:a.top]

    print("Reading oldest inventory")
    _, ofeats, orows = pick_layer(load_zip(a.oldest), a.oldest_label)
    oidf = find_field(orows, ["sgi_id", "sgiid", "sgi", "id_sgi", "gl_id", "id"])
    onamef = find_field(orows, ["name", "glacier_na", "gl_name", "name_de", "gletscher"])
    oldest = group(ofeats, orows, oidf)

    print("Reading middle inventory")
    _, mfeats, mrows = pick_layer(load_zip(a.mid), a.mid_label)
    mid = group(mfeats, mrows, find_field(mrows, ["sgi_id", "sgiid", "sgi", "id_sgi", "gl_id", "id"]))

    lc_id, lc_name = ({}, {})
    if a.lengthchange.lower() != "none":
        print("Reading length-change series")
        lc_id, lc_name = read_length_change(a.lengthchange)
        print(f"  {len(lc_id)} glaciers with length-change measurements")

    vc = {}
    if a.volumechange.lower() != "none":
        print("Reading volume change")
        vc = read_volume_change(a.volumechange)
        print(f"  {len(vc)} glaciers with volume-change surveys")
    mb = {}
    if a.balance.lower() != "none":
        print("Reading annual mass balance")
        mb = read_balance(a.balance)
        print(f"  {len(mb)} glaciers with direct mass-balance series")
    swiss, swiss_bal = [], []
    if a.swisswide.lower() != "none":
        print("Reading Swiss-wide glacier volume")
        swiss, swiss_bal = read_swisswide(a.swisswide)
        print(f"  {len(swiss)} years, {swiss[0][0]}-{swiss[-1][0]}, last {swiss[-1][1]} km3")
    th_sum, th_pts = {}, {}
    if a.thickness.lower() != "none":
        print("Reading radar ice thickness")
        th_sum, th_pts = read_thickness(a.thickness, [gid for gid, _ in top])
        print(f"  {sum(len(v) for v in th_pts.values())} cells for {len(th_pts)} glaciers")

    prev = previous_terminus(a.out)
    out = []
    for rank, (gid, g) in enumerate(top, 1):
        best = best_match(g, oldest)
        bmid = best_match(g, mid)
        name = first_text(g["rows"], namef) or gid
        series = lc_id.get(gid) or lc_name.get(norm_name(name))
        entry = {
            "rank": rank, "id": gid, "name": name, "year": common_year(g["rows"], yearf),
            "area_km2": round(g["area"], 2), "bbox": bbox_wgs(g["bbox"]),
            "center": None, "outline": geojson(g["polys"], a.simplify), "oldest": None,
            "mid": {"area_km2": round(bmid[1]["area"], 2)} if bmid else None,
            "length": length_stats(series),
            "volume": volume_stats(vc.get(gid)),
            "radar": th_sum.get(gid),
            "balance": mb.get(gid),
            "terminus": prev[gid][1] if gid in prev and prev[gid][0] == round(g["area"], 2) else terminus(g["polys"]),
        }
        (s, w), (n, e) = entry["bbox"]; entry["center"] = [round((s + n) / 2, 5), round((w + e) / 2, 5)]
        if best:
            ok, og = best
            entry["oldest"] = {"id": ok, "name": first_text(og["rows"], onamef) or ok,
                               "area_km2": round(og["area"], 2), "outline": geojson(og["polys"], a.simplify)}
        out.append(entry)
        L = entry["length"]
        lc = f"{L['total_m']} m since {L['first_year']}" if L else "not measured"
        T = entry["terminus"]; lc += f" | tip {T['tip_m']} m asl" if T else " | tip not found"
        V = entry["volume"]
        lc += f" | dV {V['dV_km3']} km3 {V['from']}-{V['to']}" if V else " | no volume survey"
        print(f"  {rank:2d}. {name:<30} {g['area']:7.2f} km² | {a.oldest_label} "
              f"{entry['oldest']['area_km2'] if entry['oldest'] else '-'} | {a.mid_label} "
              f"{entry['mid']['area_km2'] if entry['mid'] else '-'} | length change {lc}")

    payload = {
        "generated": date.today().isoformat(),
        "latest_label": a.latest_label, "oldest_label": a.oldest_label, "mid_label": a.mid_label,
        "sources": [a.latest, a.oldest, a.mid, a.lengthchange, a.volumechange, a.swisswide, a.thickness, a.balance],
        "licence": "GLAMOS Swiss Glacier Inventories, Ice Thickness (CC BY 4.0); GLAMOS Swiss Glacier Length Change, Volume Change, Mass Balance and Swisswide Mass Balance (scientific and non-commercial use, cite GLAMOS)",
        "swiss_volume": swiss,
        "swiss_balance": swiss_bal,
        # the page asks for thickness.js?v=<this>, so a rebuilt file is never served from the browser cache
        "thickness_id": hashlib.md5(thickness_text(th_pts).encode()).hexdigest()[:8] if th_pts else None,
        "inventory": inventory_stats(latest, top),
        "glaciers": out,
    }
    write_thickness(os.path.join(os.path.dirname(os.path.abspath(a.out)), "thickness.js"), th_pts)
    # Leave the file alone when nothing but the date would change (keeps the git history clean).
    if os.path.exists(a.out):
        try:
            with open(a.out, encoding="utf-8") as f:
                old = json.loads(f.read().split("window.GLACIER_DATA = ", 1)[1].rstrip().rstrip(";"))
            if {k: v for k, v in old.items() if k != "generated"} == {k: v for k, v in payload.items() if k != "generated"}:
                print(f"No changes in the GLAMOS data; {a.out} left as it is.")
                return
        except (IndexError, ValueError):
            pass
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("/* generated by build_outlines.py - do not edit */\nwindow.GLACIER_DATA = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {a.out} ({os.path.getsize(a.out) / 1024:.0f} kB)")

if __name__ == "__main__":
    main()
