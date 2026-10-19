#!/usr/bin/env python3
"""The terrain file of an Icelandic outlet for the 3D view: one ice surface per year from the dated 2 m ArcticDEM strips.

data/terrain/<outlet>.<hash>.bin (and data/terrain/manifest.json) holds, in the format of build_terrain_bundle.py (see there) with one addition, for the strip the 3D view shows
(from `back` metres below the tongue tip up the glacier, 4 km wide, 14 m grid): the surface of every year of the site (2011 to the current year) as heights in decimetres above the tip.

Where the heights come from
  ArcticDEM strips (scripts/arcticdem.py, PGC, CC BY 4.0): single dated 2 m surface models of WorldView stereo pairs, found through the PGC STAC catalogue. They are heights above the
  WGS84 ellipsoid with a vertical offset of their own, so every strip is moved onto ÍslandsDEM v1.0 (10 m, heights above sea level, the window made by fetch_dem_iceland.py) with the median
  difference on ground outside the glacier's outline (the 2000 RGI outline: the ice is inside it today). Each grid point (14 m) is the mean of 3 x 3 cells of 2 m.
  A strip is a snapshot of one day. Strips from mid July to mid November show bare ice and a surface comparable with the late-summer Sentinel-2 pictures; strips of the winter half carry
  snow (a metre or two on the lower tongue). So the series of a grid point uses the summer strips, and winter strips only after the last summer strip, where nothing else is known.
  The surface of a year (taken at 15 September, the middle of the season of the pictures) is then:
    measured       a strip of that season within 45 days of 15 September
    interpolated   between the strips before and after it in time (a straight line in time, at that grid point)
    held           after the last strip: the last surface unchanged (no later strips exist, nothing is invented about the melting since)
  A grid point no strip covers falls back on ÍslandsDEM. The file says for every year which of the three it is; the page shows it.

Needs Python 3.14 for scripts/fetch_dem_iceland.py (the ÍslandsDEM window) and internet. Downloads some hundred MB (a few thousand tiles) into scripts/.dem-cache/arcticdem
(gitignored), decodes them on all cores (a quarter of an hour the first time, then it is cached).
Usage: python3 scripts/build_dem_iceland.py [--outlet breidamerkurjokull]
"""
import argparse, array, bisect, datetime, hashlib, json, math, os, struct, sys, time, types, urllib.parse, urllib.request, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arcticdem as ad
import fetch_dem_iceland as fd
import build_vatnajokull as bv      # its Grid (a raster of the region) for 'inside the RGI outline'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache', 'arcticdem')
OUT = os.path.join(ROOT, 'data', 'terrain')
HALF, NB, UP = 2000, 284, (2500, 6500)      # as V3D in the page and build_terrain_bundle.py: half width, cells across, shortest and longest strip up the glacier (main() sets HALF and NB to those of the outlet's own strip)
FIRST_YEAR = 2011      # the first summer strip over Breiðamerkurjökull is from July 2011; the surface of earlier years (Landsat pictures) is that of 2011, held
CHANGE_FROM = 2016     # the measured change the Stats tab quotes starts with the Sentinel-2 series
R = 6378137.0
NAN = float('nan')


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def unmerc(x, y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


def strip_for(o):
    """The strip as stripFor() of the page finds it: direction up the glacier from the outline around the tip, length up the glacier; or the strip drawn by hand (`strip3d` in data/vatnajokull.js:
    azimuth, half width, back, up, grid cell), which also says how many cells there are across (a multiple of 4) and what size the texture is."""
    tip = o['tip']; px, py = merc(*tip); k = 1 / math.cos(math.radians(tip[0]))
    s3 = o.get('strip3d')
    if s3:
        az = math.radians(s3['azimuth']); cell = s3['cell']
        return {'P': (px, py), 'k': k, 'ue': math.sin(az), 'un': math.cos(az), 'up': s3['up'], 'back': s3['back'], 'half': s3['half'], 'cell': cell, 'nb': 4 * round(2 * s3['half'] / cell / 4), 'tex': [2048, 1024] if s3['half'] >= 6000 else [1024, 2048]}
    ring = max(o['outline'], key=len)
    rel = [((merc(la, lo)[0] - px) / k, (merc(la, lo)[1] - py) / k) for la, lo in ring]
    near = [p for p in rel if math.hypot(*p) <= 3000]; ue, un = 0.0, 1.0
    if near:
        mx, my = sum(p[0] for p in near) / len(near), sum(p[1] for p in near) / len(near); d = math.hypot(mx, my)
        if d > 1: ue, un = mx / d, my / d
    along = max([0] + [p[0] * ue + p[1] * un for p in rel])
    return {'P': (px, py), 'k': k, 'ue': ue, 'un': un, 'up': min(UP[1], max(UP[0], along + 800)), 'back': o.get('back', 1000), 'half': HALF, 'cell': 14, 'nb': NB, 'tex': [1024, 2048]}


def inside(ring, lat, lon):      # point in polygon (ring of [lat, lon])
    c = False; j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi, yj, xj = ring[i][0], ring[i][1], ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi: c = not c
        j = i
    return c


def grid(st, nA):
    """Centre of every grid point and the two local axes, in EPSG:3413 metres: [(x, y, ax, ay, bx, by)] row by row from far up the glacier; plus lat/lon."""
    px, py, k, ue, un, up, back = st['P'][0], st['P'][1], st['k'], st['ue'], st['un'], st['up'], st['back']; ln = up + back
    def xy(a, b):
        lat, lon = unmerc(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k)
        return ad.to3413(lon, lat), lat, lon
    pts = []
    for j in range(nA + 1):
        a = up - j * ln / nA
        for i in range(NB + 1):
            b = -HALF + i * 2 * HALF / NB
            (x, y), lat, lon = xy(a, b)
            (xa, ya), _, _ = xy(a + 5, b); (xb, yb), _, _ = xy(a, b + 5)      # 5 m up the glacier, 5 m to the right
            pts.append((x, y, (xa - x) / 5, (ya - y) / 5, (xb - x) / 5, (yb - y) / 5, lat, lon))
    return pts


GRID_KEY = ''      # names the grid in the cache files of the sampled strips (set in main)


class Window:
    """Heights of one strip over the area, cached on disk."""
    def __init__(self, item, box, pool):
        self.id, self.date = item['id'], item['properties']['datetime'][:10]
        path = os.path.join(CACHE, self.id + '.win'); meta = path + '.json'
        if not os.path.exists(path):
            s = ad.Strip(item['assets']['dem']['href']); r = s.window(*box, pool)
            if r is None: self.data = None; json.dump({'empty': True}, open(meta, 'w')); open(path, 'wb').close(); return
            a, cols, rows, west, north = r
            with open(path, 'wb') as fh: a.tofile(fh)
            json.dump({'cols': cols, 'rows': rows, 'west': west, 'north': north}, open(meta, 'w'))
        m = json.load(open(meta))
        if m.get('empty'): self.data = None; return
        self.cols, self.rows, self.west, self.north = m['cols'], m['rows'], m['west'], m['north']
        self.data = array.array('f'); self.data.frombytes(open(path, 'rb').read())

    def at(self, x, y):
        c, r = int((x - self.west) // 2), int((self.north - y) // 2)
        if 0 <= c < self.cols and 0 <= r < self.rows:
            v = self.data[r * self.cols + c]
            if v > -9000: return v
        return None


def sample(win, pts, cell=14):
    """The strip at every grid point: the mean of 3 x 3 cells of 2 m spread over the grid cell (a third of a cell apart: 4.7 m at 14 m), at least 5 of the 9 valid; else NaN."""
    off = [-cell / 3, 0, cell / 3]; out = array.array('f', [NAN]) * len(pts); at = win.at
    for n, (x, y, ax, ay, bx, by, *_ ) in enumerate(pts):
        s = c = 0
        for da in off:
            for db in off:
                v = at(x + da * ax + db * bx, y + da * ay + db * by)
                if v is not None: s += v; c += 1
        if c >= 5: out[n] = s / c
    return out


def series_of(byday):
    """The series of one grid point, cleaned: strips within 30 days of each other (one epoch) give their median, so a single strip with a failed match (cloud, a bad area) is outvoted;
    then a value that sticks out from the line between the epochs before and after it by more than 15 m (and lies beyond both of them) is a spike and goes. A real change is a
    step that stays: the epochs after it agree with it."""
    days = sorted(byday); eps = []
    for d in days:
        if eps and d - eps[-1][-1][0] <= 30: eps[-1].append((d, byday[d]))
        else: eps.append([(d, byday[d])])
    pairs = []
    for e in eps:
        vals = [v for _, vs in e for v in vs]
        pairs.append((sum(d for d, _ in e) / len(e), median(vals)))
    for _ in range(3):      # a spike can hide a second one: look again
        drop = []
        for i in range(1, len(pairs) - 1):
            (d0, v0), (d, v), (d1, v1) = pairs[i - 1], pairs[i], pairs[i + 1]
            line = v0 + (v1 - v0) * (d - d0) / (d1 - d0)
            if abs(v - line) > 15 and (v - v0) * (v - v1) > 0: drop.append(i)
        if len(pairs) >= 2:      # the ends again: a surface far above the next epoch than the ice can have lost in the time between (15 m + 12 m a year) is a matching error (the first strips of 2011 and 2012 have blobs of 100 to 300 m)
            yrs = (pairs[1][0] - pairs[0][0]) / 365.25
            if pairs[0][1] - pairs[1][1] > 15 + 12 * yrs: drop.append(0)
            yrs = (pairs[-1][0] - pairs[-2][0]) / 365.25
            if pairs[-2][1] - pairs[-1][1] < -(15 + 12 * yrs): drop.append(len(pairs) - 1)      # (the glacier does not rise either: the last epoch far above the one before)
        if len(pairs) >= 3:      # the ends: far from the next epoch while the next two agree with each other
            if abs(pairs[0][1] - pairs[1][1]) > 30 and abs(pairs[1][1] - pairs[2][1]) < 10: drop.append(0)
            if abs(pairs[-1][1] - pairs[-2][1]) > 30 and abs(pairs[-2][1] - pairs[-3][1]) < 10: drop.append(len(pairs) - 1)
        if not drop: break
        pairs = [p for i, p in enumerate(pairs) if i not in drop]
    return pairs


def flatten_lagoon(h, nB, wet=4.0, hole=500, level=None):
    """The lagoon in one year's surface: the largest connected area of points below `wet` metres is the water (ArcticDEM over water is noisy by several metres and has icebergs); it is set to one
    level (the median of its calmest points, about -0.7 m: the lagoon is tidal and flat), together with the patches it encloses that are no larger than `hole` points (icebergs) and the
    shore cells of at most 2 x `wet` that touch it (so no step stands at the edge). Returns the level."""
    W = nB + 1; n = len(h)
    low = [v == v and v < wet for v in h]
    def region(ok, start, nb4=True):      # flood fill
        seen = bytearray(n); seen[start] = 1; todo = [start]; out = [start]
        while todo:
            i = todo.pop(); r, c = divmod(i, W)
            for j in ((i - W) if r else -1, (i + W) if r < n // W - 1 else -1, (i - 1) if c else -1, (i + 1) if c < W - 1 else -1):
                if j >= 0 and not seen[j] and ok[j]: seen[j] = 1; todo.append(j); out.append(j)
        return out
    done = bytearray(n); best = []
    for i in range(n):
        if low[i] and not done[i]:
            comp = region(low, i)
            for j in comp: done[j] = 1
            if len(comp) > len(best): best = comp
    if len(best) < 2000: return None
    water = bytearray(n)
    for j in best: water[j] = 1
    # enclosed patches (icebergs): the points that are not water and cannot reach the edge of the grid without crossing water
    outside = bytearray(n); todo = []
    for i in range(n):
        r, c = divmod(i, W)
        if (r in (0, n // W - 1) or c in (0, W - 1)) and not water[i]: outside[i] = 1; todo.append(i)
    while todo:
        i = todo.pop(); r, c = divmod(i, W)
        for j in ((i - W) if r else -1, (i + W) if r < n // W - 1 else -1, (i - 1) if c else -1, (i + 1) if c < W - 1 else -1):
            if j >= 0 and not outside[j] and not water[j]: outside[j] = 1; todo.append(j)
    ok = [not water[i] and not outside[i] for i in range(n)]      # candidate hole points
    seen = bytearray(n)
    for i in range(n):
        if ok[i] and not seen[i]:
            comp = region(ok, i)
            for j in comp: seen[j] = 1
            if len(comp) <= hole:
                for j in comp: water[j] = 1
    calm = sorted(h[j] for j in best if h[j] < 2)
    lv = level if level is not None else calm[len(calm) // 2]
    shore = []
    for i in range(n):
        if water[i] or h[i] != h[i] or h[i] >= 2 * wet: continue
        r, c = divmod(i, W)
        if any(0 <= j < n and water[j] for j in ((i - W) if r else -1, (i + W) if r < n // W - 1 else -1, (i - 1) if c else -1, (i + 1) if c < W - 1 else -1)): shore.append(i)
    for i in range(n):
        if water[i]: h[i] = lv
    for i in shore: h[i] = lv + (h[i] - lv) * 0.5      # one cell of slope up from the shore
    return lv


LAKES = {'Breiðárlón': (64.0558, -16.3685)}      # lakes beside the lagoon, flat at a level of their own (found by their position: the newest surface has the calm water, its extent is the lake)


def lake_mask(h, nB, seed, tol=3.0):
    """The extent and level of a lake in a calm surface: the points connected to `seed` whose height stays within `tol` metres of the median of the seed's surroundings (the lake is flat, the shore rises)."""
    W = nB + 1; n = len(h); r0, c0 = divmod(seed, W)
    near = sorted(h[r * W + c] for r in range(r0 - 3, r0 + 4) for c in range(c0 - 3, c0 + 4) if 0 <= r < n // W and 0 <= c < W and h[r * W + c] == h[r * W + c])
    lv = near[len(near) // 2]; seen = {seed}; todo = [seed]
    while todo:
        i = todo.pop(); r, c = divmod(i, W)
        for j in ((i - W) if r else -1, (i + W) if r < n // W - 1 else -1, (i - 1) if c else -1, (i + 1) if c < W - 1 else -1):
            if j >= 0 and j not in seen and h[j] == h[j] and abs(h[j] - lv) <= tol: seen.add(j); todo.append(j)
    return lv, seen


def flatten_lake(h, mask, lv, low=1e9, high=45.0):
    """One year: the points of the lake's extent that lie below `lv + high` (water, single-cell pits of the strips, noise and the false bumps of the early strips on it, up to 45 m above it; ice is thicker there) are set to the lake's level; ice standing in the lake stays."""
    W = NB + 1; n = len(h); hi = lambda j: 0 <= j < n and h[j] == h[j] and h[j] > lv + high
    spikes = [i for i in mask if hi(i) and sum(hi(j) for j in (i - W - 1, i - W, i - W + 1, i - 1, i + 1, i + W - 1, i + W, i + W + 1)) < 3]      # a lone high point is a spike, a group of them is ice
    for i in mask:
        if h[i] == h[i] and lv - low <= h[i] <= lv + high: h[i] = lv
    for i in spikes: h[i] = lv


def despike_lone(h, nB, dev=8.0, k=2.5, radii=(1, 3), passes=2):
    """Lone points and small blobs of one surface that stick out of their surroundings (pits or bumps of a strip's matching, 10 to 45 m on ice that is smooth to a few metres): a point is replaced by the
    median of the ring of points at distance `radius` around it (8 points at 1, 24 at 3: the ring is outside a blob up to 5 points across) when it differs from that median by more than `dev` metres and
    by more than `k` times the spread of the ring (its range without the highest and the lowest few, so that a second blob on the ring does not hide it). On a slope or a cliff the ring spreads as much as
    the point does, so the terrain itself stays."""
    W = nB + 1; n = len(h); n_rows = n // W; fixed = 0
    for rad in radii:
        ring = [(dr, dc) for dr in range(-rad, rad + 1) for dc in range(-rad, rad + 1) if max(abs(dr), abs(dc)) == rad]; cut = max(1, len(ring) // 8); mid = len(ring) // 2
        for _ in range(passes):
            out = []
            for r in range(rad, n_rows - rad):
                for c in range(rad, W - rad):
                    i = r * W + c; v = h[i]
                    if v != v: continue
                    nb = [h[i + dr * W + dc] for dr, dc in ring]
                    if any(x != x for x in nb): continue
                    nb.sort(); med = (nb[mid - 1] + nb[mid]) / 2; d = abs(v - med)
                    if d > dev and d > k * max(nb[len(nb) - 1 - cut] - nb[cut], 0.5): out.append((i, med))
            for i, med in out: h[i] = med
            fixed += len(out)
            if not out: break
    return fixed


NAME_KINDS = {'peak': 3, 'volcano': 3, 'saddle': 1, 'water': 2}      # as pickNames() in the page: how much a kind counts besides its height


def overpass(query, tries=4):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'tonguesfromspace/1.0 (https://tonguesfromspace.org)'})
            with urllib.request.urlopen(req, timeout=180) as r: return json.load(r)
        except Exception as e:
            last = e; time.sleep(5 * (k + 1))
    raise last


def names_for(st, nA, latest, h0):
    """Peaks, saddles and the lagoon of the strip from OpenStreetMap (names in Icelandic): at most six, the highest first and 750 m apart; x, z in the scene of the strip as the page wants them."""
    px, py, k, ue, un, up, back = st['P'][0], st['P'][1], st['k'], st['ue'], st['un'], st['up'], st['back']; ln = up + back
    cs = [unmerc(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k) for a, b in ((-back, -HALF), (-back, HALF), (up, -HALF), (up, HALF))]
    box = f'{min(c[0] for c in cs)},{min(c[1] for c in cs)},{max(c[0] for c in cs)},{max(c[1] for c in cs)}'
    d = overpass(f'[out:json][timeout:90];(node["natural"~"^(peak|volcano|saddle)$"]["name"]({box});way["natural"="water"]["name"]({box});relation["natural"="water"]["name"]({box}););out tags center;')
    cand, seen = [], set()
    for e in d['elements']:
        tg = e['tags']; kind = tg['natural']; lat, lon = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon'])
        mx, my = merc(lat, lon); dx, dy = (mx - px) / k, (my - py) / k; a, b = dx * ue + dy * un, dx * un - dy * ue
        if not (abs(b) < HALF - 200 and -back + 150 < a < up - 200) or tg['name'] in seen: continue
        seen.add(tg['name'])
        jj, ii = min(nA, max(0, round((up - a) / ln * nA))), min(NB, max(0, round((b + HALF) / (2 * HALF) * NB)))
        cand.append((latest[jj * (NB + 1) + ii] + NAME_KINDS[kind] * 120, b, -a, tg['name']))
    cand.sort(reverse=True); out = []
    for sc, x, z, name in cand:
        if len(out) >= 6: break
        if all(math.hypot(o['x'] - x, o['z'] - z) > 750 for o in out) and math.hypot(x, z) > 300: out.append({'x': round(x, 1), 'z': round(z, 1), 'text': name})
    return out


def median(v):
    v = sorted(v); n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--outlet', default='breidamerkurjokull'); a = ap.parse_args()
    t = open(os.path.join(ROOT, 'data', 'vatnajokull.js'), encoding='utf-8').read()
    o = next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == a.outlet)
    global HALF, NB
    st = strip_for(o); HALF, NB = st['half'], st['nb']; up, back = st['up'], st['back']; ln = up + back; nA = 2 * round(ln / (2 * st['cell']))
    print(f"{o['name']}: strip {ln:.0f} m long, grid {NB + 1} x {nA + 1}")
    os.makedirs(CACHE, exist_ok=True)
    pts = grid(st, nA)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]; box = (min(xs) - 40, min(ys) - 40, max(xs) + 40, max(ys) + 40)
    lats, lons = [p[6] for p in pts], [p[7] for p in pts]
    # the base: ÍslandsDEM (the window of fetch_dem_iceland.py), heights above sea level, and the ground outside the outline for the vertical offset of every strip
    base = os.path.join(ROOT, 'scripts', '.dem-cache', f'islandsdem-{a.outlet}-10m'); meta = json.load(open(base + '.json'))
    islands = array.array('f'); islands.frombytes(open(base + '.f32', 'rb').read())
    def ref(lat, lon):
        x, y = fd.lcc(lon, lat); c, r = int((x - meta['x_west']) // 10), int((meta['y_north'] - y) // 10)
        return islands[r * meta['cols'] + c] if 0 <= c < meta['cols'] and 0 <= r < meta['rows'] else NAN
    refs = [ref(la, lo) for la, lo in zip(lats, lons)]
    rings = [r for r in o['outline'] if len(r) > 50]
    stable = [n for n in range(0, len(pts), 3) if refs[n] == refs[n] and refs[n] > 5 and not any(inside(r, lats[n], lons[n]) for r in rings)]
    print(f"{sum(1 for r in refs if r == r)} of {len(pts)} grid points in ÍslandsDEM; {len(stable)} ground points outside the 2000 outline for the vertical offset")
    # the strips
    west, south, east, north = min(lons), min(lats), max(lons), max(lats)
    items = ad.find_strips([west, south, east, north], '2010-01-01', datetime.date.today().isoformat())
    print(len(items), 'strips of ArcticDEM touch the strip')
    # only the strips the series can use are read: summer strips (mid July to mid November, bare ice), winter strips only after the last summer one, and nothing older than the
    # last summer strip before the first year of the site (it is where the series of 2016 starts)
    def day_of(f): return datetime.date.fromisoformat(f['properties']['datetime'][:10])
    def is_summer(d): return (7, 15) <= (d.month, d.day) <= (11, 15)
    summer = sorted(day_of(f) for f in items if is_summer(day_of(f)))
    first_use = max([d for d in summer if d < datetime.date(FIRST_YEAR, 1, 1)], default=datetime.date(2000, 1, 1)); last_summer = max(summer, default=datetime.date(2000, 1, 1))
    items = [f for f in items if day_of(f) >= first_use and (is_summer(day_of(f)) or day_of(f) > last_summer)]
    print(f'{len(items)} of them can be used (from {first_use}; summer strips, and winter ones after {last_summer})')
    gkey = hashlib.sha1(repr((st, nA, NB, HALF, 'v2')).encode()).hexdigest()[:8]      # another strip geometry makes another set of sampled strips
    arrs, used = [], []      # per strip: the heights at every grid point (moved onto ÍslandsDEM)
    with ad.pool() as pool:
        for item in sorted(items, key=lambda f: f['properties']['datetime']):
            sid, date = item['id'], item['properties']['datetime'][:10]
            gpath = os.path.join(CACHE, f'{sid}.{gkey}.grid')      # the strip at the grid points: 0.7 MB; the window it is made from (50 MB) is deleted after sampling
            if os.path.exists(gpath):
                h = array.array('f'); h.frombytes(open(gpath, 'rb').read())
            else:
                w = Window(item, box, pool)
                if w.data is None: continue
                h = sample(w, pts, st['cell'])
                with open(gpath, 'wb') as fh: h.tofile(fh)
                for ext in ('', '.json'):
                    try: os.remove(os.path.join(CACHE, sid + '.win' + ext))
                    except OSError: pass
            w = types.SimpleNamespace(id=sid, date=date)      # (the name the lines below use)
            diffs = [h[n] - refs[n] for n in stable if h[n] == h[n]]
            cover = sum(1 for v in h if v == v) / len(h)
            if cover < 0.05 or len(diffs) < 800:
                print(f'  {w.date} {w.id[:40]}: skipped (covers {cover:.0%}, {len(diffs)} ground points)'); continue
            off = median(diffs); spread = median([abs(d - off) for d in diffs])
            if spread > 4:
                print(f'  {w.date} {w.id[:40]}: skipped (the ground outside the glacier differs by {spread:.1f} m from ÍslandsDEM: a poor model)'); continue
            arrs.append(array.array('f', [v - off if v == v else NAN for v in h]))
            used.append({'date': w.date, 'id': w.id, 'cover': round(cover, 2), 'offset': round(off, 1), 'spread': round(spread, 1)})
            print(f'  {w.date} {w.id[:40]}: covers {cover:.0%}, offset {off:.1f} m (spread {spread:.1f} m)')
    # the surface of every year at 15 September
    cur = datetime.date.today().year
    years = list(range(FIRST_YEAR, cur + 1)); targets = [datetime.date(y, 9, 15).toordinal() for y in years]
    def snow_free(d): dt = datetime.date.fromordinal(d); return (7, 15) <= (dt.month, dt.day) <= (11, 15)      # mid July to mid November: bare ice, no snow cover on the lower tongue
    strip_day = [datetime.date.fromisoformat(u['date']).toordinal() for u in used]
    last_free = max((d for d in strip_day if snow_free(d)), default=0)
    eligible = [i for i, d in enumerate(strip_day) if snow_free(d) or d > last_free]      # summer strips, and winter strips only after the last summer one
    kinds = {y: {'measured': 0, 'interpolated': 0, 'held': 0} for y in years}
    surf = {y: [] for y in years}; holes = 0
    for n in range(len(pts)):
        byday = {}      # same day (several segments of one pass): the mean
        for i in eligible:
            v = arrs[i][n]
            if v == v: byday.setdefault(strip_day[i], []).append(v)
        pairs = series_of(byday)
        if not pairs:
            holes += 1
            for y in years: surf[y].append(refs[n])
            continue
        days = [p[0] for p in pairs]
        for y, tg in zip(years, targets):
            i = bisect.bisect_left(days, tg)
            if i == 0: v, k = pairs[0][1], 'held'      # before the first strip: its surface (the series starts in 2011: the years before it, Landsat pictures, hold the surface of 2011)
            elif i == len(days): v, k = pairs[-1][1], 'held'
            else:
                (d0, v0), (d1, v1) = pairs[i - 1], pairs[i]
                v = v0 + (v1 - v0) * (tg - d0) / (d1 - d0); k = 'measured' if min(tg - d0, d1 - tg) <= 45 else 'interpolated'
            surf[y].append(v); kinds[y][k] += 1
    fixed = {}
    for y in years: surf[y] = array.array('f', surf[y]); fixed[y] = despike_lone(surf[y], NB)
    print('lone spikes and pits removed by year:', fixed)
    levels = {}
    surf[years[-1]] = array.array('f', surf[years[-1]]); lv = flatten_lagoon(surf[years[-1]], NB); levels[years[-1]] = lv      # the lagoon is flat, at one level in every year (the newest surface sets it; the other years' own levels only show strip noise)
    for y in years[:-1]: surf[y] = array.array('f', surf[y]); levels[y] = flatten_lagoon(surf[y], NB, level=lv)
    for name, (la, lo) in LAKES.items():      # the lakes beside the lagoon
        seed = min(range(len(pts)), key=lambda n: (lats[n] - la) ** 2 + (lons[n] - lo) ** 2); mk = lake_mask(surf[years[-1]], NB, seed)
        if len(mk[1]) < 300: print(name, 'not found'); continue
        print(f'{name}: level {mk[0]:.1f} m, {len(mk[1])} points'); box = set(mk[1]); W = NB + 1
        for _ in range(2): box |= {j for i in box for j in (i - W, i + W, i - 1, i + 1) if 0 <= j < len(pts)}      # the rim too
        for y in years: flatten_lake(surf[y], box, mk[0])
    print('lagoon level by year (m):', {y: (round(v, 1) if v is not None else None) for y, v in levels.items()})
    print(f'{holes} grid points without any strip fall back on ÍslandsDEM')
    kind_of = {}
    for y in years:
        k = max(kinds[y], key=kinds[y].get); kind_of[y] = k
        print(f'  {y}: {k} ({", ".join(f"{a} {b / len(pts):.0%}" for a, b in kinds[y].items() if b)})')
    # the measured surface change 2016 to 2022 over the part of the strip inside the 2000 RGI outline (above the water of the lagoon): what the Stats tab says
    gridb = bv.Grid(o['lat'], o['lon'], (min(lats) - 0.01, min(lons) - 0.02, max(lats) + 0.01, max(lons) + 0.02)); basin = gridb.fill(o['outline'])
    sel = [n for n in range(len(pts)) if refs[n] == refs[n] and refs[n] > 5 and gridb.at(basin, lats[n], lons[n])]
    d1622 = [surf[2022][n] - surf[CHANGE_FROM][n] for n in sel]; cell_km2 = (2 * HALF / NB) * (ln / nA) / 1e6
    change = {'from': CHANGE_FROM, 'to': 2022, 'meanM': round(sum(d1622) / len(d1622), 1), 'areaKm2': round(len(sel) * cell_km2, 1), 'km3': round(sum(d1622) * cell_km2 / 1000, 2), 'kind': [kind_of[CHANGE_FROM], kind_of[2022]]}
    change['byYear'] = {str(y): round(sum(surf[y][n] - surf[CHANGE_FROM][n] for n in sel) / len(sel), 1) for y in years}      # mean surface change since 2016 of every year (the facts on pictures follow the year)
    print('surface change 2016 to 2022 inside the 2000 outline:', {k: v for k, v in change.items() if k != 'byYear'}, 'by year:', change['byYear'])
    try: names = names_for(st, nA, surf[years[-1]], 0); print('names:', [n['text'] for n in names])
    except Exception as e: names = []; print('names failed:', e)
    # the file
    jt = int(up / ln * nA + 0.5); h0 = refs[jt * (NB + 1) + NB // 2]
    if h0 != h0: h0 = median([r for r in refs if r == r])
    def packed(vals):      # decimetres above the tip, int16 differences along each row
        flat = []
        for j in range(nA + 1):
            row = [int(round((v - h0) * 10)) if v == v else 0 for v in vals[j * (NB + 1):(j + 1) * (NB + 1)]]
            flat += [row[0]] + [row[i] - row[i - 1] for i in range(1, len(row))]
        assert all(-32768 <= x <= 32767 for x in flat), 'height out of range'
        return struct.pack('<%dh' % len(flat), *flat)
    head = {'v': 1, 'id': o['id'], 'P': list(st['P']), 'k': st['k'], 'ue': st['ue'], 'un': st['un'], 'up': up, 'back': back, 'nA': nA, 'nB': NB, 'h0': h0, 'dem': None, 'names': names, 'radar': [], 'change': change, 'half': HALF, 'tex': st['tex'],
            'yearly': {'years': years, 'kind': [kind_of[y] for y in years], 'day': '09-15', 'strips': [{'date': u['date'], 'id': u['id']} for u in used]}, 'built': datetime.date.today().isoformat()}
    payload = zlib.compress(packed(surf[years[-1]]) + b''.join(packed(surf[y]) for y in years), 9)
    hb = json.dumps(head, separators=(',', ':')).encode(); data = b'TFS1' + struct.pack('<I', len(hb)) + hb + payload
    name = f"{o['id']}.{hashlib.sha1(data).hexdigest()[:8]}.bin"; os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith(o['id'] + '.') and f.endswith('.bin') and f != name: os.remove(os.path.join(OUT, f))
    open(os.path.join(OUT, name), 'wb').write(data)
    mp = os.path.join(OUT, 'manifest.json'); man = json.load(open(mp)) if os.path.exists(mp) else {}; man[o['id']] = name
    json.dump(man, open(mp, 'w'), indent=1, sort_keys=True)
    print(f'wrote {name}: {len(data) / 1024:.0f} KB, {len(used)} strips used')


if __name__ == '__main__':
    main()
