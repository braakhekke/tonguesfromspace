#!/usr/bin/env python3
"""Shared tools of the scripts that make the data of the ice-cap regions (Vatnajökull, Iceland, Svalbard, Norway): data/vatnajokull.js, iceland.js, svalbard.js, norway.js.

  * Mapterhorn terrain tiles (the same worldwide terrain tiles the 3D view draws, Terrarium encoding) sampled for heights: where a glacier ends (its tip) and which way the 3D strip runs
  * the 3D strip and the picture box of a glacier, found by rule (derive_view): tip = the lowest point of the outline, direction = from the tip to the ice around it, width = the ice across
    the first kilometres, length = the ice up the glacier. The strips of Breiðamerkurjökull were drawn by hand; the others use this rule and the numbers are written into the data files.
  * ArcGIS REST queries (NVE for Norway, Norwegian Polar Institute for Svalbard), cached in scripts/.rgi-cache (gitignored), and the RGI 6.0 from GLIMS

Standard library plus Pillow (for the tiles). No numpy: the grids here are small.
"""
import io, json, math, os, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def stored_boxes():
    """data/boxes.js as {glacier id: record}: the picture box (bounds), tip and 3D strip of every glacier, moved by scripts/tools/box-editor.html"""
    t = open(os.path.join(ROOT, 'data', 'boxes.js'), encoding='utf-8').read()
    return json.loads(t[t.index('{', t.index('window.GLACIER_BOXES')):t.rindex('}') + 1])['glaciers']


def box_fields(oid, **found):
    """lat, lon, half (+ halfH for a rectangle), tip and strip3d of an outlet for its data file. data/boxes.js wins over what the rule found (found: lat, lon, half, tip, strip3d), so a
    rebuild of a data file keeps the boxes that were placed by hand; lat/lon/half/halfH are the centre and half sides (km) of the stored bounds (a square of 2 x half km has no halfH)."""
    e = stored_boxes().get(oid)
    if not e: return found
    (s, w), (n, east) = e['box']['bounds']; lat = (s + n) / 2; lon = (w + east) / 2
    half = round((east - w) / 2 * 111.32 * math.cos(math.radians(lat)), 3); halfh = round((n - s) / 2 * 111.32, 3)
    out = dict(lat=round(lat, 5), lon=round(lon, 5), half=half)
    if abs(halfh - half) > 0.0005: out['halfH'] = halfh
    return {**out, 'tip': e['tip'], 'strip3d': e['strip3d']}
CACHE = os.path.join(HERE, '.rgi-cache')
TILES = os.path.join(HERE, '.dem-cache', 'mapterhorn')
UA = {'User-Agent': 'tonguesfromspace/1.0 (https://tonguesfromspace.org)'}
R = 6378137.0


def http(url, data=None, timeout=240, tries=4):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:      # a busy server: wait and ask again
            last = e; time.sleep(2 + 3 * i)
    raise RuntimeError(f'{url[:120]}: {last}')


def cached_json(name, url, data=None):
    os.makedirs(CACHE, exist_ok=True); p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        with open(p, 'wb') as f: f.write(http(url, data))
    with open(p, encoding='utf-8') as f: return json.load(f)


def arcgis_all(base, layer, where='1=1', fields='*', name=None, page=1000, extra=None):
    """All features of an ArcGIS REST layer as GeoJSON features in WGS84 (paged), cached under `name`."""
    p = os.path.join(CACHE, name) if name else None
    if p and os.path.exists(p):
        with open(p, encoding='utf-8') as f: return json.load(f)
    out, off = [], 0
    while True:
        q = dict(where=where, outFields=fields, outSR=4326, f='geojson', resultOffset=off, resultRecordCount=page, returnGeometry='true', orderByFields='OBJECTID' if 'npolar' in base else 'objectid')
        if extra: q.update(extra)
        d = json.loads(http(f'{base}/{layer}/query?' + urllib.parse.urlencode(q)))
        if 'error' in d: raise RuntimeError(str(d['error'])[:300])
        out += d.get('features', [])
        if len(d.get('features', [])) < page and not d.get('exceededTransferLimit'): break
        off += len(d['features'])
    if p:
        os.makedirs(CACHE, exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f: json.dump(out, f)
    return out


def rgi_features(name):
    """RGI 6.0 features of a GLIMS layer (RGI_Iceland, RGI_Scandinavia, RGI_Svalbard), Web Mercator geometry."""
    q = urllib.parse.urlencode(dict(service='WFS', version='1.0.0', request='GetFeature', typeName='GLIMS:RGI_' + name, outputFormat='application/json'))
    return cached_json(f'rgi_{name}.json', 'https://www.glims.org/geoserver/ows?' + q)['features']


# ---------- geometry ----------
def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def unmerc(x, y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


def km2(ring_ll):
    """Area (km²) of a [lat, lon] ring, equirectangular around its middle (good to a fraction of a percent over tens of km)."""
    la0 = sum(p[0] for p in ring_ll) / len(ring_ll); k = 111320.0 * math.cos(math.radians(la0))
    pts = [(p[1] * k, p[0] * 111320.0) for p in ring_ll]
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2e6


def inside(x, y, ring):
    """point in polygon (ring of (x, y)), even-odd"""
    c = False; n = len(ring); j = n - 1
    for i in range(n):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c


def dp(pts, tol):
    """Douglas-Peucker on (x, y) in metres; iterative; a closed ring is split at the point farthest from the start"""
    if len(pts) < 5: return pts
    if pts[0] == pts[-1]:
        far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        return dp(pts[:far + 1], tol)[:-1] + dp(pts[far:], tol)
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (ax, ay), (bx, by) = pts[a], pts[b]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9; best, idx = -1, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L
            if d > best: best, idx = d, i
        if best > tol: keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def thin_ll(ring_ll, tol_m):
    """thin a [lat, lon] list with Douglas-Peucker (tolerance in metres), rounded to 5 decimals"""
    if len(ring_ll) < 5: return [[round(a, 5), round(b, 5)] for a, b in ring_ll]
    la0 = ring_ll[0][0]; k = 111320.0 * math.cos(math.radians(la0))
    xy = [(p[1] * k, p[0] * 111320.0) for p in ring_ll]
    return [[round(y / 111320.0, 5), round(x / k, 5)] for x, y in dp(xy, tol_m)]


def geom_rings(g):
    """outer rings of a GeoJSON (Multi)Polygon as lists of [lat, lon]; holes are left out"""
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    return [[[lat, lon] for lon, lat in poly[0]] for poly in polys if poly]


def geom_all_rings(g):
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    return [[[lat, lon] for lon, lat in ring] for poly in polys for ring in poly]


def merc_ring_to_ll(ring):
    return [list(unmerc(x, y)) for x, y in ring]


# ---------- terrain: Mapterhorn tiles ----------
class Dem:
    """Heights (m) from the Mapterhorn terrain tiles, bilinear, tiles cached on disk."""
    def __init__(self, z=13):
        self.z = z; self.t = {}
        os.makedirs(TILES, exist_ok=True)

    def tile(self, x, y):
        k = (x, y)
        if k not in self.t:
            from PIL import Image
            p = os.path.join(TILES, f'{self.z}-{x}-{y}.webp')
            if not os.path.exists(p):
                with open(p, 'wb') as f: f.write(http(f'https://tiles.mapterhorn.com/{self.z}/{x}/{y}.webp', timeout=60))
            im = Image.open(p).convert('RGB'); self.t[k] = (im.size[0], im.load())
        return self.t[k]

    def h(self, lat, lon):
        n = 2 ** self.z; fx = (lon + 180) / 360 * n; fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        x, y = int(fx), int(fy); S, px = self.tile(x, y)
        u, v = (fx - x) * S - 0.5, (fy - y) * S - 0.5; i, j = int(math.floor(u)), int(math.floor(v)); a, b = u - i, v - j
        def at(ii, jj):
            if 0 <= ii < S and 0 <= jj < S: r, g, bl = px[ii, jj]
            else:      # over the edge of the tile: the neighbour
                t2 = self.tile(x + (ii >= S) - (ii < 0), y + (jj >= S) - (jj < 0)); r, g, bl = t2[1][ii % S, jj % S]
            return r * 256 + g + bl / 256 - 32768
        return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b


# ---------- where the tongue is, and how the 3D strip and the picture lie ----------
def derive_view(rings, dem, tidewater=None, tip=None, azimuth=None, log=print, label=''):
    """The tip, the 3D strip (azimuth, half width, back, up, grid cell) and the picture box (centre, half side in km) of a glacier from its outline rings ([lat, lon] lists).

    tip       the lowest point of the outline by the terrain tiles; where many points are about as low (a calving front in the sea) the one nearest their middle
    azimuth   degrees clockwise from north, from the tip to the ice around it (ice cells within 5 km, or less for a small glacier)
    half      the ice across the first kilometres above the tip, 2 to 9 km each side; up: the ice up the glacier, 3.5 to 10 km; back: 1.5 km below the tip
    The picture is a square centred on the strip, big enough to hold it, between 3 and 12.4 km a side half (10 m pixels: 2,500 px at most)."""
    pts = [(p[0], p[1]) for ring in rings for p in ring]
    hs = [dem.h(la, lo) for la, lo in pts]
    hmin = min(hs)
    cand = [p for p, h in zip(pts, hs) if h <= hmin + 4]
    if tip is None:
        cx, cy = sum(p[0] for p in cand) / len(cand), sum(p[1] for p in cand) / len(cand)
        tip = list(min(cand, key=lambda p: (p[0] - cx) ** 2 + ((p[1] - cy) * math.cos(math.radians(cx))) ** 2))
        log(f'  {label}: lowest outline point {hmin:.0f} m ({len(cand)} points within 4 m), tip {tip[0]:.5f}, {tip[1]:.5f}')
    k = 111320.0 * math.cos(math.radians(tip[0]))
    rel = [[((p[1] - tip[1]) * k, (p[0] - tip[0]) * 111320.0) for p in ring] for ring in rings]
    area = sum(km2(r) for r in rings)
    reach = max(2500.0, min(5000.0, 400 * math.sqrt(area)))      # how far around the tip the ice is looked at
    # ice cells on a 200 m grid around the tip (a cell counts when it lies inside one of the rings)
    step = 200.0; n = int(15000 / step); cells = []
    boxes = [(min(p[0] for p in r), max(p[0] for p in r), min(p[1] for p in r), max(p[1] for p in r)) for r in rel]
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, y = i * step, j * step
            for r, b in zip(rel, boxes):
                if b[0] <= x <= b[1] and b[2] <= y <= b[3] and inside(x, y, r): cells.append((x, y)); break
    near = [c for c in cells if math.hypot(*c) <= reach]
    if azimuth is None:
        if near:
            mx, my = sum(c[0] for c in near) / len(near), sum(c[1] for c in near) / len(near)
        else:
            mx, my = sum(c[0] for c in cells) / max(1, len(cells)), sum(c[1] for c in cells) / max(1, len(cells))
        azimuth = (math.degrees(math.atan2(mx, my)) + 360) % 360
    ue, un = math.sin(math.radians(azimuth)), math.cos(math.radians(azimuth))
    uv = [(c[0] * ue + c[1] * un, c[0] * un - c[1] * ue) for c in cells]      # (up, right)
    # the width of the tongue: the ice across the first kilometres above the tip, walking out from the tip sideways in bins of 200 m until two empty bins in a row (so the edge of an ice cap
    # that runs past the tongue is not counted as tongue)
    bins = {int(round(w / 200.0)) for u, w in uv if -300 <= u <= 2000}
    right = left = 0
    while any(b in bins for b in (right + 1, right + 2)): right += 1 if right + 1 in bins else 2
    while any(-b in bins for b in (left + 1, left + 2)): left += 1 if left + 1 in bins else 2
    half = max(2000.0, min(9000.0, max(right, left) * 200.0 + 500))
    corridor = [u for u, w in uv if u >= 0 and abs(w) <= max(1500.0, half * 0.6)]
    up = max(3500.0, min(10000.0, (max(corridor) if corridor else 3000) + 500))
    back = 1500.0
    # the grid: at most about 150,000 points (the page makes a 32-bit index mesh of it)
    cell = max(14, int(math.ceil(math.sqrt(2 * half * (up + back) / 150000.0))))
    # the picture box: a square around the strip rectangle
    corners = [(-back, -half), (-back, half), (up, -half), (up, half)]
    mid_a, mid_b = (up - back) / 2, 0.0
    def xy(a, b): return a * ue + b * un, a * un - b * ue      # ground metres east, north of the tip (a along, b right)
    cx, cy = xy(mid_a, mid_b)
    ext = max(max(abs(xy(a, b)[0] - cx), abs(xy(a, b)[1] - cy)) for a, b in corners)
    hk = min(12.4, max(3.0, math.ceil((ext + 600) / 100.0) / 10.0))
    clipped = ext + 600 > 12400
    if clipped:      # the strip does not fit the biggest picture: shorten it until it does
        while ext + 600 > 12400 and up > 3500:
            up -= 250; mid_a = (up - back) / 2; cx, cy = xy(mid_a, mid_b)
            ext = max(max(abs(xy(a, b)[0] - cx), abs(xy(a, b)[1] - cy)) for a, b in [(-back, -half), (-back, half), (up, -half), (up, half)])
        cell = max(14, int(math.ceil(math.sqrt(2 * half * (up + back) / 150000.0))))
    lat0, lon0 = tip[0] + cy / 111320.0, tip[1] + cx / k
    return dict(tip=[round(tip[0], 5), round(tip[1], 5)], lat=round(lat0, 4), lon=round(lon0, 4), half=hk,
                strip3d=dict(azimuth=int(round(azimuth)) % 360, half=int(round(half, -2)), back=int(back), up=int(round(up, -2)), cell=cell))


# ---------- clustering of inventory polygons into ice caps ----------
def clusters(features, geom_of, thr=150.0):
    """Group polygons that touch (a vertex of one within `thr` metres of a vertex of another): the drainage basins of an ice cap form one group.
    features: list; geom_of(f) -> GeoJSON geometry in Web Mercator metres. Returns a list of lists of indexes."""
    parent = list(range(len(features)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    cells = {}
    for i, f in enumerate(features):
        g = geom_of(f)
        for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
            for ring in poly:
                for x, y in ring: cells.setdefault((int(x // thr), int(y // thr)), set()).add(i)
    for s in cells.values():
        s = list(s)
        for j in s[1:]:
            a, b = find(s[0]), find(j)
            if a != b: parent[a] = b
    out = {}
    for i in range(len(features)): out.setdefault(find(i), []).append(i)
    return list(out.values())
