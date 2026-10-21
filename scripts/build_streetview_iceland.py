#!/usr/bin/env python3
"""Street View panoramas that see an Icelandic outlet (Breiðamerkurjökull): found with the free Street View metadata service, ranked by how much of the glacier they see, looked at by hand.

The same method and the same rules as scripts/build_streetview.py (read its docstring: only panorama ids may be stored, the scan stays local in scripts/.streetview-scan-is.json), with the
data of Iceland: the roads and tracks of OpenStreetMap give the places to ask (every 60 m along them, a Street View panorama lies on a road), the ice of the Icelandic Met Office outline of
17 September 2025 gives the targets (every 300 m), the ground is ÍslandsDEM (10 m, scripts/fetch_dem_iceland.py).

Steps (each on its own):
  scan    asks the metadata service every 60 m along the roads and tracks in the picture box of the outlet and 3 km around it, then on a fine grid around every hit.
  rank    keeps the official captures (copyright Google) from June to October, one per 50 m, tests from each camera (2.5 m above the ground) how much of the glacier it sees within 12 km, and
          spreads the best out (at least 600 m apart). Writes scripts/.streetview-ranked-is.json. --visitors: the photospheres of visitors too.
  review  fetches a few Static Street View images of the best into a folder, only to look at them (billable, the first 10,000 a month are free); delete the folder afterwards.
Standard library only; the key is in scripts/.google-key.
"""
import argparse, array, collections, concurrent.futures, json, math, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_vatnajokull as bv
import build_dem_iceland as bd
import build_streetview as sv      # the key and the metadata request
import fetch_dem_iceland as fd

ROOT = bd.ROOT
SCAN = os.path.join(ROOT, 'scripts', '.streetview-scan-is.json')
RANKED = os.path.join(ROOT, 'scripts', '.streetview-ranked-is.json')
MARGIN_M, ROAD_STEP, RADIUS, MONTHS = 3000, 60.0, 40, range(6, 11)
TARGET_M, CAMERA_H, MAX_KM, SPREAD, K_REF, R_EARTH = 300, 2.5, 12.0, 600, 0.13, 6371000.0


def outlet(oid):
    t = open(os.path.join(ROOT, 'data', 'vatnajokull.js'), encoding='utf-8').read()
    return next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == oid)


def box(o, margin):
    dlat = ((o.get('halfH') or o['half']) * 1000 + margin) / 111320.0; dlon = (o['half'] * 1000 + margin) / (111320.0 * math.cos(math.radians(o['lat'])))
    return o['lat'] - dlat, o['lon'] - dlon, o['lat'] + dlat, o['lon'] + dlon


def scan(a):
    key = sv.api_key(); o = outlet(a.id); s, w, n, e = box(o, MARGIN_M); k = 111320.0 * math.cos(math.radians(o['lat']))
    d = bd.overpass(f'[out:json][timeout:180];(way["highway"]["highway"!~"^(footway|steps|corridor|proposed|construction)$"]({s},{w},{n},{e}););out geom;')
    pts = []
    for el in d['elements']:
        g = el['geometry']
        for p, q in zip(g, g[1:]):
            L = math.hypot((q['lon'] - p['lon']) * k, (q['lat'] - p['lat']) * 111320.0); m = max(1, int(L / ROAD_STEP))
            pts += [(round(p['lat'] + (q['lat'] - p['lat']) * i / m, 6), round(p['lon'] + (q['lon'] - p['lon']) * i / m, 6)) for i in range(m)]
    pts = sorted(set(pts)); print(f'{len(d["elements"])} roads and tracks, {len(pts)} points', file=sys.stderr)
    found = {}
    def run(points, radius, label):
        done = 0
        with concurrent.futures.ThreadPoolExecutor(a.workers) as ex:
            for r in ex.map(lambda p: sv.meta(key, p[0], p[1], radius), points):
                done += 1
                if r: found[r['pano_id']] = {'lat': r['location']['lat'], 'lng': r['location']['lng'], 'date': r.get('date', ''), 'copyright': r.get('copyright', '')}
                if done % 500 == 0: print(f'  {label}: {done}/{len(points)}, {len(found)} panoramas', file=sys.stderr)
        print(f'{label}: {len(points)} requests, {len(found)} panoramas', file=sys.stderr)
    run(pts, RADIUS, 'along the roads')
    fine, step = set(), 25.0
    for v in list(found.values()):      # a fine grid around every hit: the official panorama next to a visitor's one
        for i in range(-2, 3):
            for j in range(-2, 3): fine.add((round(v['lat'] + i * step / 111320.0, 6), round(v['lng'] + j * step / k, 6)))
    run(sorted(fine), 20, 'fine grid')
    json.dump({'id': a.id, 'panos': found}, open(SCAN, 'w', encoding='utf-8'))
    official = sum('Google' in v['copyright'] for v in found.values()); print(f'{len(found)} panoramas, {official} official, {len(found) - official} from visitors; wrote {SCAN}', file=sys.stderr)


def rank(a):
    o = outlet(a.id); panos = json.load(open(SCAN, encoding='utf-8'))['panos']; k = 111320.0 * math.cos(math.radians(o['lat']))
    base = os.path.join(ROOT, 'scripts', '.dem-cache', f'islandsdem-{a.id}-10m'); meta = json.load(open(base + '.json'))
    dem = array.array('f'); dem.frombytes(open(base + '.f32', 'rb').read()); cols, rows = meta['cols'], meta['rows']
    def ground(lat, lon):
        x, y = fd.lcc(lon, lat); c, r = int((x - meta['x_west']) // 10), int((meta['y_north'] - y) // 10)
        if 0 <= c < cols and 0 <= r < rows:
            v = dem[r * cols + c]
            if v == v and v > -1e30: return v
        return None
    xy = lambda lat, lon: ((lon - o['lon']) * k, (lat - o['lat']) * 111320.0)
    # the targets: ice of 2025 inside the RGI basin, every 300 m
    pts = [p for r in o['outline'] for p in r]; lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    g = bv.Grid(o['lat'], o['lon'], (min(lats) - 0.01, min(lons) - 0.02, max(lats) + 0.01, max(lons) + 0.02))
    rings, _ = bv.imo_polygons('glaciology:glacierpolygon_sent2_2025', [min(lons) - 0.02, min(lats) - 0.01, max(lons) + 0.02, max(lats) + 0.01])
    ice = g.fill(rings); basin = g.fill(o['outline']); stp = int(TARGET_M / bv.CELL); targets = []
    s, w, n, e = box(o, MARGIN_M)
    for r in range(0, g.h, stp):
        for c in range(0, g.w, stp):
            if ice[r * g.w + c] and basin[r * g.w + c]:
                lat, lon = g.lat0 + (g.y0 + (r + .5) * bv.CELL) / 111320.0, g.lon0 + (g.x0 + (c + .5) * bv.CELL) / g.k
                z = ground(lat, lon)
                if z is not None and s <= lat <= n and w <= lon <= e: targets.append((xy(lat, lon), z))
    print(f'{len(targets)} target points on the ice inside the picture area', file=sys.stderr)
    area = TARGET_M * TARGET_M / 1e6
    keep, stats = {}, collections.Counter()
    for pid, v in panos.items():
        stats['all'] += 1
        if 'Google' not in v['copyright'] and not a.visitors: stats['visitors'] += 1; continue
        try: month = int(v['date'][5:7])
        except ValueError: stats['no date'] += 1; continue
        if month not in MONTHS and not a.all_months: stats['out of season'] += 1; continue
        x, y = xy(v['lat'], v['lng']); cell = (round(x / 50), round(y / 50))
        if cell not in keep or v['date'] > keep[cell][1]['date']: keep[cell] = (pid, v, x, y)
    cams = list(keep.values()); print(dict(stats), f'-> {len(cams)} cameras (one per 50 m)', file=sys.stderr)
    out = []
    for pid, v, x, y in cams:
        zg = ground(v['lat'], v['lng'])
        if zg is None: continue
        z0 = zg + CAMERA_H; seen = []
        for (tx, ty), tz in targets:
            dx, dy = tx - x, ty - y; D = math.hypot(dx, dy)
            if D > MAX_KM * 1000 or D < 50: continue
            steps = max(2, int(D // 30)); free = True
            for i in range(1, steps):
                f = i / steps; d1 = D * f; hz = ground(o['lat'] + (y + dy * f) / 111320.0, o['lon'] + (x + dx * f) / k)
                if hz is None: continue
                if hz + d1 * (D - d1) / (2 * R_EARTH) * (1 - K_REF) > z0 + (tz - z0) * f: free = False; break
            if free: seen.append((math.degrees(math.atan2(dx, dy)) % 360, D))
        if not seen: continue
        sx = sum(math.sin(math.radians(b)) for b, _ in seen); sy = sum(math.cos(math.radians(b)) for b, _ in seen); heading = round(math.degrees(math.atan2(sx, sy)) % 360)
        sp = sorted(((b - heading + 180) % 360 - 180) for b, _ in seen); ds = sorted(d for _, d in seen)
        out.append({'pano': pid, 'lat': v['lat'], 'lng': v['lng'], 'date': v['date'], 'copyright': v['copyright'], 'km2_in_view': round(len(seen) * area, 1), 'share': round(len(seen) / len(targets), 3),
                    'nearest_km': round(ds[0] / 1000, 2), 'median_km': round(ds[len(ds) // 2] / 1000, 2), 'heading': heading, 'span_deg': round(sp[int(len(sp) * .95)] - sp[int(len(sp) * .05)]), 'ground_m': round(zg)})
    out.sort(key=lambda c: -c['km2_in_view']); chosen = []
    for c in out:
        cx, cy = xy(c['lat'], c['lng'])
        if all(math.hypot(cx - px, cy - py) >= SPREAD for px, py in (xy(q['lat'], q['lng']) for q in chosen)): chosen.append(c)
        if len(chosen) >= a.top: break
    json.dump({'id': a.id, 'all': len(out), 'top': chosen}, open(RANKED, 'w', encoding='utf-8'), indent=1)
    print(f'{len(out)} cameras see the ice; the {len(chosen)} best, spread out:')
    for i, c in enumerate(chosen, 1): print(f'{i:>2} {c["km2_in_view"]:>6} km2 {c["share"]:>5} near {c["nearest_km"]:>5} med {c["median_km"]:>5} head {c["heading"]:>3} span {c["span_deg"]:>3} {c["date"]:8} {c["lat"]:.5f},{c["lng"]:.5f}  {c["copyright"][:24]} {c["pano"]}')


def review(a):
    key = sv.api_key(); top = json.load(open(RANKED, encoding='utf-8'))['top'][a.start:a.n]; os.makedirs(a.dir, exist_ok=True)
    for i, c in enumerate(top, a.start + 1):
        for kk, dh in enumerate((0,) if not a.around else (0, -70, 70)):
            q = urllib.parse.urlencode({'size': '640x400', 'pano': c['pano'], 'heading': (c['heading'] + dh) % 360, 'pitch': a.pitch, 'fov': 100, 'key': key})
            path = os.path.join(a.dir, f'{i:02d}{"abc"[kk]}_{c["date"]}_{c["heading"]}.jpg')
            with urllib.request.urlopen('https://maps.googleapis.com/maps/api/streetview?' + q, timeout=60) as r, open(path, 'wb') as f: f.write(r.read())
            print(path)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('step', choices=['scan', 'rank', 'review']); ap.add_argument('--id', default='breidamerkurjokull')
    ap.add_argument('--workers', type=int, default=16); ap.add_argument('--top', type=int, default=25); ap.add_argument('--n', type=int, default=10); ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--dir', default='/tmp/tfs-streetview-review-is'); ap.add_argument('--around', action='store_true'); ap.add_argument('--pitch', type=int, default=5)
    ap.add_argument('--visitors', action='store_true'); ap.add_argument('--all-months', action='store_true')
    a = ap.parse_args(); {'scan': scan, 'rank': rank, 'review': review}[a.step](a)


if __name__ == '__main__':
    main()
