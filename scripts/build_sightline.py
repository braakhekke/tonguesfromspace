#!/usr/bin/env python3
"""Where on the hiking trails can a person see the glacier tongue?

For every point of the hiking trails near a glacier it asks: from here, with the eyes EYE metres above the ground, is the glacier tongue in view?
The tongue is a set of target points on the surface of the glacier: every SAMPLE metres inside the 2023 outline, no further than TONGUE_M metres from the
tongue tip. A target counts as seen when the straight line from the eye to it stays above the ground all the way (swissALTI3D, 10 m cells made from the
2 m model of the newest edition; the glacier surface in it is the one of the survey, see build_dem_change.py). Earth curvature is taken into account
(with the usual refraction of 0.13). A trail point "sees the tongue" when it sees at least MIN_SHARE of the targets.

What it does not know: trees, buildings and the ice surface of other years (swissALTI3D is the bare ground), weather, and whether the walker looks up.
The result is where the line of sight is free, not a promise of a view.

Trails: swisstopo swissTLM3D hiking trails (layer ch.swisstopo.swisstlm3d-wanderwege), read as lines with the identify service of api3.geo.admin.ch.
Terrain: swissALTI3D tiles of data.geo.admin.ch (read from scripts/.dem-cache, downloaded when missing; see build_dem_change.py). Both © swisstopo, open data.

Writes sightline.js: window.GLACIER_SIGHT[<SGI id>] = { eye, tongue_m, min_share, km_trail, km_seen, lines: [[[lat, lng], ...], ...] }, the stretches that see the tongue.
The page draws them under the hiking trails of the map (and of the 3D view) and adds a line to the legend of the trails.

Standard library only. Needs glaciers.js (from build_outlines.py). Takes a few minutes per glacier; ground tiles that are not in scripts/.dem-cache are downloaded.
Usage: python3 scripts/build_sightline.py [--id A54e-24 ...] [--redo]      (glaciers already in sightline.js are kept unless --redo)
"""
import argparse, array, json, math, os, sys, time, urllib.error, urllib.parse, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache')
OUT = os.path.join(ROOT, 'data', 'sightline.js')
EYE = 1.7            # metres: eye height of the person
TONGUE_M = 1500      # the tongue: glacier surface within this distance of the tongue tip
SAMPLE = 150         # metres between the target points
MIN_SHARE = 0.25     # share of the targets that must be in view
RADIUS = 7000        # metres around the tongue tip: trails and ground
CELL = 10            # metres per cell of the ground model
STEP = 25            # metres between the trail points that are tested
K_REFRACTION = 0.13
R_EARTH = 6371000.0


def lv95(lat, lon):     # swisstopo approximate formulas, WGS84 to LV95 (error below 0.1 m)
    p = (lat * 3600 - 169028.66) / 10000; l = (lon * 3600 - 26782.5) / 10000
    return (2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
            1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)


def tile_zip(year, e, n):                  # path of the zip of one 1 km tile of an edition, or None when that edition has no such tile
    name = f'swissalti3d_{year}_{e}-{n}'
    path = os.path.join(CACHE, name + '_2.xyz.zip')
    if os.path.exists(path): return path
    os.makedirs(CACHE, exist_ok=True)
    for attempt in range(5):               # a long run meets dropped connections: try again a few times
        try:
            print('  download', name, file=sys.stderr)
            urllib.request.urlretrieve(f'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/{name}/{name}_2_2056_5728.xyz.zip', path + '.part'); os.replace(path + '.part', path)
            return path
        except urllib.error.HTTPError as ex:
            if ex.code in (403, 404): return None
            time.sleep(5)
        except (OSError, urllib.error.URLError):
            time.sleep(5)
    raise SystemExit(f'could not download {name}: run again, what is done is kept')


def newest_tile(e, n):                      # the newest edition of a tile: first what is in the cache, then the network
    for year in range(2026, 2019, -1):
        p = os.path.join(CACHE, f'swissalti3d_{year}_{e}-{n}_2.xyz.zip')
        if os.path.exists(p): return p
    for year in range(2026, 2019, -1):
        p = tile_zip(year, e, n)
        if p: return p
    return None


def ground(e0, n0, w, h, tiles):            # heights (m) of the cells of w x h, CELL m, lower left corner e0, n0: mean of the 2 m points
    s = array.array('f', [0.0]) * (w * h); c = array.array('H', [0]) * (w * h)
    for (e, n) in tiles:
        p = newest_tile(e, n)
        if not p: continue
        z = zipfile.ZipFile(p)
        for line in z.open([x for x in z.namelist() if x.endswith('.xyz')][0]):
            q = line.split()
            try: x, y, v = float(q[0]), float(q[1]), float(q[2])
            except (ValueError, IndexError): continue
            if v < -500: continue
            i, j = int((x - e0) // CELL), int((y - n0) // CELL)
            if 0 <= i < w and 0 <= j < h: s[j * w + i] += v; c[j * w + i] += 1
    return array.array('f', [s[k] / c[k] if c[k] else float('nan') for k in range(w * h)])


def trails(lat, lon):                      # the trail lines around a point: lists of (lat, lng)
    d = RADIUS * 1.05
    dlat, dlon = d / 110950.0, d / (111320.0 * math.cos(math.radians(lat)))
    found = {}

    def fetch(x0, y0, x1, y1, depth=0):     # the service returns at most 200 features: when it does, ask for the four quarters
        env = f'{x0},{y0},{x1},{y1}'
        q = urllib.parse.urlencode({'geometryType': 'esriGeometryEnvelope', 'geometry': env, 'imageDisplay': '1000,1000,96', 'mapExtent': env, 'tolerance': '0',
                                    'layers': 'all:ch.swisstopo.swisstlm3d-wanderwege', 'sr': '4326', 'returnGeometry': 'true', 'limit': '200', 'lang': 'en'})
        with urllib.request.urlopen('https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' + q, timeout=180) as r:
            res = json.load(r)['results']
        if len(res) >= 200 and depth < 4:
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            for a, b, c, e in ((x0, y0, mx, my), (mx, y0, x1, my), (x0, my, mx, y1), (mx, my, x1, y1)): fetch(a, b, c, e, depth + 1)
            return
        for f in res: found[f['featureId']] = f
    fetch(lon - dlon, lat - dlat, lon + dlon, lat + dlat)
    return [[(pt[1], pt[0]) for pt in path] for f in found.values() for path in f['geometry']['paths']]


def in_ring(x, y, ring):
    ins = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ins = not ins
    return ins


def build(g):
    tip = g['terminus']['tip']; te, tn = lv95(*tip)
    e0, n0 = int((te - RADIUS) // CELL * CELL), int((tn - RADIUS) // CELL * CELL); w = h = int(2 * RADIUS // CELL) + 1
    print(f'{g["name"]}: ground model {w} x {h} cells', file=sys.stderr)
    tiles = [(e, n) for e in range(int(e0 // 1000), int((e0 + w * CELL) // 1000) + 1) for n in range(int(n0 // 1000), int((n0 + h * CELL) // 1000) + 1)]
    H = ground(e0, n0, w, h, tiles)

    def height(x, y):                       # bilinear, NaN outside the model
        fx, fy = (x - e0) / CELL - 0.5, (y - n0) / CELL - 0.5; i, j = int(math.floor(fx)), int(math.floor(fy))
        if i < 0 or j < 0 or i + 1 >= w or j + 1 >= h: return float('nan')
        ax, ay = fx - i, fy - j; a, b, c, d = H[j * w + i], H[j * w + i + 1], H[(j + 1) * w + i], H[(j + 1) * w + i + 1]
        return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay

    # targets: the tongue surface
    polys = [[[lv95(lat, lng) for lng, lat in ring] for ring in poly] for poly in g['outline']['coordinates']]
    targets = []
    for k in range(int(-TONGUE_M // SAMPLE), int(TONGUE_M // SAMPLE) + 1):
        for m in range(int(-TONGUE_M // SAMPLE), int(TONGUE_M // SAMPLE) + 1):
            x, y = te + k * SAMPLE, tn + m * SAMPLE
            if math.hypot(x - te, y - tn) > TONGUE_M: continue
            if any(in_ring(x, y, poly[0]) and not any(in_ring(x, y, hole) for hole in poly[1:]) for poly in polys):
                z = height(x, y)
                if z == z: targets.append((x, y, z))
    print(f'  {len(targets)} target points on the tongue', file=sys.stderr)
    if not targets: print('  no target points: skipped', file=sys.stderr); return None

    def sees(x, y):                         # share of the targets in view from the eyes at (x, y)
        z0 = height(x, y)
        if z0 != z0: return 0.0
        z0 += EYE; n = 0
        for (tx, ty, tz) in targets:
            dx, dy = tx - x, ty - y; D = math.hypot(dx, dy)
            if D < 1: n += 1; continue
            steps = max(2, int(D // CELL)); free = True
            for s in range(1, steps - 1):
                f = s / steps; d1 = D * f
                hz = height(x + dx * f, y + dy * f)
                if hz != hz: continue
                if hz + d1 * (D - d1) / (2 * R_EARTH) * (1 - K_REFRACTION) > z0 + (tz - z0) * f - 0.0: free = False; break
            if free: n += 1
        return n / len(targets)

    lines, km_all, km_seen, done = [], 0.0, 0.0, set()
    for line in trails(*tip):
        pts = [lv95(lat, lng) for lat, lng in line]
        dense = []                          # points every STEP m along the line
        for (x1, y1), (x2, y2), (la1, lo1), (la2, lo2) in zip(pts, pts[1:], line, line[1:]):
            L = math.hypot(x2 - x1, y2 - y1); n = max(1, int(L // STEP))
            for k in range(n): f = k / n; dense.append((x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f))
        dense.append((*pts[-1], *line[-1]))
        run = []
        for (x, y, lat, lng) in dense:
            if math.hypot(x - te, y - tn) > RADIUS: seen = False
            else: seen = sees(x, y) >= MIN_SHARE
            key = (round(x / 15), round(y / 15))                       # the same stretch can be in the data twice (route and trail)
            if key not in done and math.hypot(x - te, y - tn) <= RADIUS: km_all += STEP / 1000; km_seen += STEP / 1000 if seen else 0; done.add(key)
            if seen: run.append([round(lat, 5), round(lng, 5)])
            elif run:
                if len(run) > 1: lines.append(run)
                run = []
        if len(run) > 1: lines.append(run)
    print(f'  trails within {RADIUS} m: {km_all:.1f} km, {km_seen:.1f} km see the tongue', file=sys.stderr)
    return {'eye': EYE, 'tongue_m': TONGUE_M, 'min_share': MIN_SHARE, 'km_trail': round(km_all, 1), 'km_seen': round(km_seen, 1), 'lines': lines}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', nargs='*')      # without --id: every glacier in glaciers.js that is not in sightline.js yet
    ap.add_argument('--redo', action='store_true', help='make the listed (or all) glaciers again even if they are in sightline.js')
    a = ap.parse_args()
    s = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read()
    out = {}
    if os.path.exists(OUT):                    # what was made before is kept
        t = open(OUT, encoding='utf-8').read(); out = json.loads(t[t.index('{'):t.rindex('}') + 1])
    for g in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers']:
        if (a.id and g['id'] not in a.id) or not (g.get('terminus') and g.get('outline')): continue
        if g['id'] in out and not a.redo: print(f'{g["name"]}: already in sightline.js', file=sys.stderr); continue
        r = build(g)
        if r: out[g['id']] = r
        with open(OUT, 'w', encoding='utf-8') as f:            # written after every glacier, so a long run that stops keeps what it has
            f.write('/* made by scripts/build_sightline.py - do not edit */\nwindow.GLACIER_SIGHT = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print('wrote', OUT, file=sys.stderr)


main()
