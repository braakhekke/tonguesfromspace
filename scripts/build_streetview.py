#!/usr/bin/env python3
"""Candidate Street View panoramas of a glacier (prototype: Aletsch), found with the free Street View metadata service, filtered, ranked and looked at by hand.

Source: Google Street View Static API, *metadata* requests only (https://developers.google.com/maps/documentation/streetview/metadata): they are free, use no quota and return
the panorama id, the position, the month and the copyright of the nearest panorama within a radius. Google's policy forbids storing or caching Street View content except
panorama ids, so the scan results stay local (scripts/.streetview-scan.json, git-ignored) and only the few chosen panoramas go into data/streetview.json.

Steps (each is run on its own: python3 scripts/build_streetview.py scan | rank | review):
  scan    asks the metadata service on a 140 m grid over the glacier and a margin around it (points on the ice are skipped), then on a fine grid around every hit, so that the
          official panorama next to a visitor's one is found too. The key is read from scripts/.google-key (or the env GOOGLE_API_KEY).
  rank    keeps the official captures (copyright "Google", not visitors' photospheres) from June to October, one per 50 m, and tests from each camera how much of the glacier
          can be seen: target points on the 2023 outline every 300 m, ground heights of swissALTI3D (scripts/.dem-cache, see build_sightline.py), the line from the camera
          (2.5 m above the ground) to each target against the ground (with the curvature of the earth and refraction). The score is the glacier area in view within MAX_KM;
          the best are spread out (at least SPREAD m apart). Writes scripts/.streetview-ranked.json.
  review  fetches a few Static Street View images of the best candidates into a temporary folder, only to look at them (these are billable, the first 10,000 a month are free),
          and says where they are. They are not kept: delete the folder afterwards.

Standard library only.
"""
import argparse, array, collections, concurrent.futures, json, math, os, sys, time, urllib.error, urllib.parse, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache')
KEY_FILE = os.path.join(ROOT, 'scripts', '.google-key')
SCAN = os.path.join(ROOT, 'scripts', '.streetview-scan.json')
RANKED = os.path.join(ROOT, 'scripts', '.streetview-ranked.json')
META = 'https://maps.googleapis.com/maps/api/streetview/metadata?'
GRID_M, RADIUS_M = 140, 100          # coarse grid: the cell diagonal is about 200 m, so every point lies within 100 m of a node
FINE_M, FINE_R, NEAR_M = 30, 20, 100  # fine grid around every hit
MARGIN_M = 3000                      # around the outline of the glacier
MONTHS = range(6, 11)                # June to October: little snow on the ground
CELL = 20                            # metres per cell of the ground model
TARGET_M = 300                       # metres between the target points on the glacier
CAMERA_H = 2.5
MAX_KM = 8.0                         # a glacier further away is a thin strip in the picture: it does not count
SPREAD = 600                         # metres between the chosen viewpoints
K_REFRACTION, R_EARTH = 0.13, 6371000.0


def lv95(lat, lon):
    p = (lat * 3600 - 169028.66) / 10000; l = (lon * 3600 - 26782.5) / 10000
    return (2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
            1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)


def in_ring(x, y, ring):
    ins = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ins = not ins
    return ins


def inside(x, y, polys):                    # polys: [[outer ring, hole, ...], ...]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def glacier(gid):
    s = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read()
    for g in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers']:
        if g['id'] == gid: return g
    raise SystemExit(f'{gid} is not in glaciers.js')


def api_key():
    k = os.environ.get('GOOGLE_API_KEY') or (open(KEY_FILE).read().strip() if os.path.exists(KEY_FILE) else '')
    if not k: raise SystemExit('no key: put it in scripts/.google-key or in the env GOOGLE_API_KEY')
    return k


def meta(key, lat, lng, radius):
    url = META + urllib.parse.urlencode({'location': f'{lat:.6f},{lng:.6f}', 'radius': radius, 'source': 'outdoor', 'key': key})
    for k in range(6):
        try:
            with urllib.request.urlopen(url, timeout=30) as r: j = json.load(r)
        except Exception:
            time.sleep(1 + k); continue
        if j.get('status') == 'OK': return j
        if j.get('status') in ('ZERO_RESULTS', 'NOT_FOUND'): return None
        if j.get('status') in ('OVER_QUERY_LIMIT', 'UNKNOWN_ERROR'): time.sleep(2 + 2 * k); continue      # both pass: try again after a while
        raise SystemExit(f'the metadata service says {j.get("status")}: {j.get("error_message", "")}')
    return None


def outline_polys(g):                       # [[ring of (lng, lat), ...], ...] per polygon
    return [[[(lng, lat) for lng, lat in ring] for ring in poly] for poly in g['outline']['coordinates']]


def scan(a):
    key, g = api_key(), glacier(a.id)
    polys = outline_polys(g)
    lats = [p[1] for poly in polys for p in poly[0]]; lons = [p[0] for poly in polys for p in poly[0]]
    dlat = MARGIN_M / 111000.0; dlon = MARGIN_M / (111320.0 * math.cos(math.radians(sum(lats) / len(lats))))
    s, n, w, e = min(lats) - dlat, max(lats) + dlat, min(lons) - dlon, max(lons) + dlon

    def lattice(step):
        out, lat = [], s
        while lat <= n:
            d = step / (111320.0 * math.cos(math.radians(lat))); lon = w
            while lon <= e: out.append((round(lat, 6), round(lon, 6))); lon += d
            lat += step / 111000.0
        return out
    found = {}

    def run(points, radius, label):
        done = 0; t0 = time.time()
        with concurrent.futures.ThreadPoolExecutor(a.workers) as ex:
            for r in ex.map(lambda p: meta(key, p[0], p[1], radius), points):
                done += 1
                if r: found[r['pano_id']] = {'lat': r['location']['lat'], 'lng': r['location']['lng'], 'date': r.get('date', ''), 'copyright': r.get('copyright', '')}
                if done % 1000 == 0: print(f'  {label}: {done}/{len(points)}, {len(found)} panoramas, {time.time() - t0:.0f} s', file=sys.stderr)
        print(f'{label}: {len(points)} requests, {len(found)} panoramas', file=sys.stderr)

    coarse = [p for p in lattice(GRID_M) if not inside(p[1], p[0], polys)]      # nothing to find on the ice
    print(f'area {s:.3f}..{n:.3f} N, {w:.3f}..{e:.3f} E: {len(coarse)} points on the coarse grid', file=sys.stderr)
    if a.limit: coarse = coarse[::max(1, len(coarse) // a.limit)]
    run(coarse, RADIUS_M, 'coarse')
    hits = [(v['lat'], v['lng']) for v in found.values()]
    fine, dla, dlo = set(), FINE_M / 111000.0, FINE_M / 77000.0                 # the fine grid, only where a panorama lies near: snapped to one lattice so that neighbours share points
    for la, lo in hits:
        for i in range(-(NEAR_M // FINE_M), NEAR_M // FINE_M + 1):
            for j in range(-(NEAR_M // FINE_M), NEAR_M // FINE_M + 1):
                fine.add((round(round(la / dla) * dla + i * dla, 6), round(round(lo / dlo) * dlo + j * dlo, 6)))
    print(f'{len(fine)} points on the fine grid around {len(hits)} hits', file=sys.stderr)
    run(sorted(fine), FINE_R, 'fine')
    with open(SCAN, 'w', encoding='utf-8') as f: json.dump({'id': a.id, 'panos': found}, f)
    official = sum('Google' in v['copyright'] for v in found.values())
    print(f'{len(found)} panoramas in all, {official} official (copyright Google), {len(found) - official} from visitors; wrote {SCAN}', file=sys.stderr)


def newest_tile(e, n):
    for year in range(2026, 2019, -1):
        p = os.path.join(CACHE, f'swissalti3d_{year}_{e}-{n}_2.xyz.zip')
        if os.path.exists(p): return p
    for year in range(2026, 2019, -1):
        name = f'swissalti3d_{year}_{e}-{n}'; p = os.path.join(CACHE, name + '_2.xyz.zip')
        try: urllib.request.urlretrieve(f'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/{name}/{name}_2_2056_5728.xyz.zip', p + '.part'); os.replace(p + '.part', p); print('  download', name, file=sys.stderr); return p
        except urllib.error.HTTPError as ex:
            if ex.code not in (403, 404): raise
    return None


def ground_model(e0, n0, w, h):             # one sample per CELL x CELL: the 2 m points of the tiles come in rows from the north, 500 per row
    H = array.array('f', [float('nan')]) * (w * h); step = CELL // 2; missing = 0
    for e in range(int(e0 // 1000), int((e0 + w * CELL) // 1000) + 1):
        for n in range(int(n0 // 1000), int((n0 + h * CELL) // 1000) + 1):
            p = newest_tile(e, n)
            if not p: missing += 1; continue
            z = zipfile.ZipFile(p); lines = z.read([x for x in z.namelist() if x.endswith('.xyz')][0]).split(b'\n')[1:]
            for row in range(step // 2, 500, step):
                for line in lines[row * 500 + step // 2: (row + 1) * 500: step]:
                    q = line.split()
                    if len(q) < 3: continue
                    x, y, v = float(q[0]), float(q[1]), float(q[2])
                    i, j = int((x - e0) // CELL), int((y - n0) // CELL)
                    if 0 <= i < w and 0 <= j < h and v > -500: H[j * w + i] = v
    print(f'ground model {w} x {h} cells, {missing} tiles missing', file=sys.stderr)
    return H


def rank(a):
    g = glacier(a.id); polys = [[[lv95(lat, lng) for lng, lat in ring] for ring in poly] for poly in outline_polys(g)]
    scanned = json.load(open(SCAN, encoding='utf-8'))['panos']
    stats = collections.Counter()
    keep = {}                                # one panorama per 50 m, the newest
    for pid, v in scanned.items():
        stats['all'] += 1
        if 'Google' not in v['copyright'] and not a.visitors: stats['visitors'] += 1; continue
        try: month = int(v['date'][5:7]); year = int(v['date'][:4])
        except ValueError: stats['no date'] += 1; continue
        if month not in MONTHS and not a.all_months: stats['out of season'] += 1; continue
        x, y = lv95(v['lat'], v['lng']); cell = (round(x / 50), round(y / 50))
        if cell not in keep or v['date'] > keep[cell][1]['date']: keep[cell] = (pid, v, x, y)
    cams = list(keep.values())
    print(dict(stats), f'-> {len(cams)} official, in season, one per 50 m', file=sys.stderr)
    xs = [p[0] for poly in polys for p in poly[0]]; ys = [p[1] for poly in polys for p in poly[0]]
    pad = MARGIN_M + 500                     # the cameras lie within MARGIN_M of the glacier, so do all the rays
    e0, n0 = int((min(xs) - pad) // CELL * CELL), int((min(ys) - pad) // CELL * CELL)
    w, h = int((max(xs) + pad - e0) // CELL) + 1, int((max(ys) + pad - n0) // CELL) + 1
    H = ground_model(e0, n0, w, h)

    def height(x, y):
        i, j = int((x - e0) // CELL), int((y - n0) // CELL)
        return H[j * w + i] if 0 <= i < w and 0 <= j < h else float('nan')
    targets = []
    for k in range(int((max(xs) - min(xs)) // TARGET_M) + 2):
        for m in range(int((max(ys) - min(ys)) // TARGET_M) + 2):
            x, y = min(xs) + k * TARGET_M, min(ys) + m * TARGET_M
            if inside(x, y, polys):
                z = height(x, y)
                if z == z: targets.append((x, y, z))
    print(f'{len(targets)} target points on the glacier ({len(targets) * TARGET_M * TARGET_M / 1e6:.0f} km2)', file=sys.stderr)
    area = TARGET_M * TARGET_M / 1e6
    out = []
    for n_done, (pid, v, x, y) in enumerate(cams, 1):
        z0 = height(x, y)
        if z0 != z0: continue
        z0 += CAMERA_H; seen = []
        for (tx, ty, tz) in targets:
            dx, dy = tx - x, ty - y; D = math.hypot(dx, dy)
            if D > MAX_KM * 1000: continue
            steps = max(2, int(D // (CELL * 2))); free = True
            for s in range(1, steps):
                f = s / steps; d1 = D * f; hz = height(x + dx * f, y + dy * f)
                if hz != hz: continue
                if hz + d1 * (D - d1) / (2 * R_EARTH) * (1 - K_REFRACTION) > z0 + (tz - z0) * f: free = False; break
            if free: seen.append((math.degrees(math.atan2(dx, dy)) % 360, D))
        if not seen: continue
        sx = sum(math.sin(math.radians(b)) for b, _ in seen); sy = sum(math.cos(math.radians(b)) for b, _ in seen)
        heading = round(math.degrees(math.atan2(sx, sy)) % 360)
        spread = sorted(((b - heading + 180) % 360 - 180) for b, _ in seen)
        span = round(spread[int(len(spread) * .95)] - spread[int(len(spread) * .05)])      # degrees that hold 90 % of the visible glacier
        ds = sorted(d for _, d in seen)
        out.append({'pano': pid, 'lat': v['lat'], 'lng': v['lng'], 'date': v['date'], 'copyright': v['copyright'], 'km2_in_view': round(len(seen) * area, 1),
                    'share': round(len(seen) / len(targets), 3), 'nearest_km': round(ds[0] / 1000, 2), 'median_km': round(ds[len(ds) // 2] / 1000, 2), 'heading': heading, 'span_deg': span,
                    'ground_m': round(z0 - CAMERA_H)})
        if n_done % 100 == 0: print(f'  {n_done}/{len(cams)}', file=sys.stderr)
    out.sort(key=lambda c: -c['km2_in_view'])
    chosen = []
    for c in out:                            # spread the viewpoints out
        cx, cy = lv95(c['lat'], c['lng'])
        if all(math.hypot(cx - px, cy - py) >= SPREAD for px, py in chosen_xy(chosen)): chosen.append(c)
        if len(chosen) >= a.top: break
    with open(RANKED, 'w', encoding='utf-8') as f: json.dump({'id': a.id, 'all': len(out), 'top': chosen}, f, indent=1)
    print(f'{len(out)} cameras see the glacier; the {len(chosen)} best, spread out:', file=sys.stderr)
    print(f'{"#":>2} {"km2":>5} {"share":>5} {"near":>5} {"med":>5} {"head":>4} {"span":>4} {"date":8} {"alt":>5}  {"lat":>9} {"lng":>8}  copyright / pano')
    for i, c in enumerate(chosen, 1):
        print(f'{i:>2} {c["km2_in_view"]:>5} {c["share"]:>5} {c["nearest_km"]:>5} {c["median_km"]:>5} {c["heading"]:>4} {c["span_deg"]:>4} {c["date"]:8} {c["ground_m"]:>5}  {c["lat"]:9.5f} {c["lng"]:8.5f}  {c["copyright"]} {c["pano"]}')


def chosen_xy(chosen):
    return [lv95(c['lat'], c['lng']) for c in chosen]


def review(a):
    key = api_key(); top = json.load(open(RANKED, encoding='utf-8'))['top'][a.start:a.n]
    os.makedirs(a.dir, exist_ok=True)
    for i, c in enumerate(top, a.start + 1):
        for k, (dh, fov) in enumerate(((0, 100),) if not a.around else ((0, 100), (-70, 100), (70, 100))):
            q = urllib.parse.urlencode({'size': '640x400', 'pano': c['pano'], 'heading': (c['heading'] + dh) % 360, 'pitch': a.pitch, 'fov': fov, 'key': key})
            path = os.path.join(a.dir, f'{i:02d}{"abc"[k]}_{c["date"]}_{c["heading"]}.jpg')
            with urllib.request.urlopen('https://maps.googleapis.com/maps/api/streetview?' + q, timeout=60) as r, open(path, 'wb') as f: f.write(r.read())
            print(path)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('step', choices=['scan', 'rank', 'review']); ap.add_argument('--id', default='B36-26')
    ap.add_argument('--workers', type=int, default=16); ap.add_argument('--limit', type=int, default=0, help='scan: only about this many coarse points (a test run)')
    ap.add_argument('--top', type=int, default=25, help='rank: how many to keep'); ap.add_argument('--n', type=int, default=10, help='review: how many of the best')
    ap.add_argument('--dir', default='/tmp/tfs-streetview-review'); ap.add_argument('--around', action='store_true', help='review: also look 70 degrees to either side')
    ap.add_argument('--pitch', type=int, default=5); ap.add_argument('--start', type=int, default=0, help='review: skip this many of the best')
    ap.add_argument('--visitors', action='store_true', help='rank: also the panoramas of visitors (photospheres), not only the official captures')
    ap.add_argument('--all-months', action='store_true', help='rank: also the months outside June to October')
    a = ap.parse_args()
    {'scan': scan, 'rank': rank, 'review': review}[a.step](a)


main()
