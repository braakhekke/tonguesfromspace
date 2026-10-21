#!/usr/bin/env python3
"""Footpaths and tracks of an Icelandic outlet, and where on them the ice front is in view -> data/trails-is.js

Paths: OpenStreetMap (ODbL), ways with highway = path, footway, steps (footpaths) and track, bridleway (tracks: mostly roads for four-wheel-drive vehicles) inside the picture box of the
outlet, through the Overpass API. They are cut to the box and thinned (3 m).

In view: as scripts/build_sightline.py does for the Swiss glaciers. 79 target points on the ice front: the ice of the Icelandic Met Office outline of 17 September 2025 (a 100 m grid),
the cells of the lowest 1.5 km of the tongue (measured up the glacier from the lowest ice), taken evenly; their height is the ground of ÍslandsDEM (10 m, scripts/fetch_dem_iceland.py).
Every 20 m along a path a person 1.7 m tall looks at the 79 points (the line against the ground, with the curvature of the earth and refraction, 0.13); a stretch counts when it sees at least
25 % of them. Trees and buildings are not counted (there are hardly any). The ice has moved since ÍslandsDEM was made; the ground of the lagoon is its water. The result is a set of lines,
the stretches of the paths from where the front is in view, drawn by the page as a violet band under the paths.

Needs data/vatnajokull.js (build_vatnajokull.py) and the ÍslandsDEM window of fetch_dem_iceland.py. Standard library only (Python 3.14 for the DEM script).
Usage: python3 scripts/build_trails_iceland.py [--outlet breidamerkurjokull]
"""
import argparse, array, datetime, json, math, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_vatnajokull as bv
import build_dem_iceland as bd
import fetch_dem_iceland as fd

ROOT = bd.ROOT
EYE, STEP, N_TARGETS, MIN_SHARE, FRONT_KM, K_REF, R_EARTH, MAX_KM = 1.7, 20.0, 79, 0.25, 1.5, 0.13, 6371000.0, 12.0


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--outlet', default='breidamerkurjokull'); a = ap.parse_args()
    t = open(os.path.join(ROOT, 'data', 'vatnajokull.js'), encoding='utf-8').read()
    o = next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == a.outlet)
    (s, w), (n, e) = bv_square(o['lat'], o['lon'], o['half'], o.get('halfH'))
    inbox = lambda la, lo: s <= la <= n and w <= lo <= e
    print(f"{o['name']}: picture box {s:.3f},{w:.3f} to {n:.3f},{e:.3f}")
    # the paths
    d = bd.overpass(f'[out:json][timeout:120];(way["highway"~"^(path|footway|steps|track|bridleway)$"]({s},{w},{n},{e}););out tags geom;')
    paths, tracks = [], []
    for el in d['elements']:
        kind = 'track' if el['tags']['highway'] in ('track', 'bridleway') else 'path'
        run = []
        for p in el['geometry'] + [None]:
            if p is not None and inbox(p['lat'], p['lon']): run.append((p['lat'], p['lon']))
            else:
                if len(run) > 1: (tracks if kind == 'track' else paths).append(run)
                run = []
    k = 111320.0 * math.cos(math.radians(o['lat']))
    paths = [[[round(a_, 5), round(b_, 5)] for a_, b_ in bv.dp_ll(r, 3, k)] for r in paths]; tracks = [[[round(a_, 5), round(b_, 5)] for a_, b_ in bv.dp_ll(r, 3, k)] for r in tracks]
    print(f'{len(paths)} footpaths ({sum(len(r) for r in paths)} points), {len(tracks)} tracks ({sum(len(r) for r in tracks)} points)')
    # the ground
    base = os.path.join(ROOT, 'scripts', '.dem-cache', f'islandsdem-{a.outlet}-10m'); meta = json.load(open(base + '.json'))
    dem = array.array('f'); dem.frombytes(open(base + '.f32', 'rb').read()); cols, rows = meta['cols'], meta['rows']
    def ground(lat, lon):
        x, y = fd.lcc(lon, lat); c, r = int((x - meta['x_west']) // 10), int((meta['y_north'] - y) // 10)
        if 0 <= c < cols and 0 <= r < rows:
            v = dem[r * cols + c]
            if v == v and v > -1e30: return v
        return 0.0
    # the targets: ice cells of the lowest 1.5 km of the tongue in the 2025 outline
    st = bd.strip_for(o); px, py, kk, ue, un = st['P'][0], st['P'][1], st['k'], st['ue'], st['un']
    pts = [p for r in o['outline'] for p in r]; lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    g = bv.Grid(o['lat'], o['lon'], (min(lats) - 0.01, min(lons) - 0.02, max(lats) + 0.01, max(lons) + 0.02))
    rings, _ = bv.imo_polygons('glaciology:glacierpolygon_sent2_2025', [min(lons) - 0.02, min(lats) - 0.01, max(lons) + 0.02, max(lats) + 0.01])
    ice = g.fill(rings); basin = g.fill(o['outline'])
    cells = []
    for r in range(g.h):
        for c in range(g.w):
            if ice[r * g.w + c] and basin[r * g.w + c]:
                lat, lon = g.lat0 + (g.y0 + (r + 0.5) * bv.CELL) / 111320.0, g.lon0 + (g.x0 + (c + 0.5) * bv.CELL) / g.k
                mx, my = bd.merc(lat, lon); dx, dy = (mx - px) / kk, (my - py) / kk
                a_, b_ = dx * ue + dy * un, dx * un - dy * ue      # a: metres up the glacier from the tip, b: to the right
                if abs(b_) < st['half'] and -st['back'] < a_ < st['up']: cells.append((a_, lat, lon))      # the ice in the strip of the 3D view
    cells.sort(); a0 = cells[0][0]
    front = [c for c in cells if c[0] <= a0 + FRONT_KM * 1000]; step = max(1, len(front) // N_TARGETS); targets = front[::step][:N_TARGETS]
    print(f'{len(cells)} ice cells in the strip; the lowest ice is {a0:.0f} m up from the tip; {len(front)} cells in the front 1.5 km; {len(targets)} targets')
    tg = [(la, lo, ground(la, lo)) for _, la, lo in targets]
    def xy(lat, lon): return (lon - o['lon']) * k, (lat - o['lat']) * 111320.0      # metres
    tx = [(xy(la, lo), h) for la, lo, h in tg]
    def sees(lat, lon):
        ox, oy = xy(lat, lon); h0 = ground(lat, lon) + EYE; seen = 0
        for (x, y), h in tx:
            dist = math.hypot(x - ox, y - oy)
            if dist > MAX_KM * 1000: continue
            n_ = max(2, int(dist / 25)); ok = True
            for i in range(1, n_):
                f = i / n_; sx, sy = ox + (x - ox) * f, oy + (y - oy) * f
                dd = dist * f; line = h0 + (h + 0.0 - h0) * f - dd * (dist - dd) * (1 - K_REF) / (2 * R_EARTH)      # the earth's curve, less refraction, lifts the ground towards the middle
                if ground(o['lat'] + sy / 111320.0, o['lon'] + sx / k) > line: ok = False; break
            seen += ok
        return seen / len(tx)
    # along every path
    lines = []; total = vis = 0
    for r in paths + tracks:
        run = []
        for (a1, b1), (a2, b2) in zip(r, r[1:]):
            x1, y1 = xy(a1, b1); x2, y2 = xy(a2, b2); L = math.hypot(x2 - x1, y2 - y1); m = max(1, int(L / STEP))
            for i in range(m + 1):
                f = i / m; la, lo = a1 + (a2 - a1) * f, b1 + (b2 - b1) * f
                total += 1
                if sees(la, lo) >= MIN_SHARE: run.append([round(la, 5), round(lo, 5)]); vis += 1
                else:
                    if len(run) > 1: lines.append(run)
                    run = []
        if len(run) > 1: lines.append(run)
    print(f'{vis} of {total} points (every {STEP:.0f} m) see at least {MIN_SHARE:.0%} of the {len(tx)} targets; {len(lines)} stretches')
    out = os.path.join(ROOT, 'data', 'trails-is.js')
    body = (f"// generated by scripts/build_trails_iceland.py - do not edit by hand\nwindow.GLACIER_TRAILS = window.GLACIER_TRAILS || {{}}; window.GLACIER_SIGHT = window.GLACIER_SIGHT || {{}};\n"
            f"window.GLACIER_TRAILS[{json.dumps(a.outlet)}] = " + json.dumps({'paths': paths, 'tracks': tracks, 'source': 'OpenStreetMap contributors (ODbL), Overpass API', 'date': datetime.date.today().isoformat()}, separators=(',', ':')) + ";\n"
            f"window.GLACIER_SIGHT[{json.dumps(a.outlet)}] = " + json.dumps({'lines': lines, 'eye': EYE, 'minShare': MIN_SHARE, 'targets': len(tx), 'front': 'ice of the outline of 17 September 2025, the lowest 1.5 km', 'ground': 'ÍslandsDEM v1.0, 10 m'}, separators=(',', ':')) + ";\n")
    open(out, 'w', encoding='utf-8').write(body); print(f'wrote {out} ({len(body) / 1024:.0f} kB)')


def bv_square(lat, lon, half, half_h=None):
    dlat = (half_h or half) / 111.32; dlon = half / (111.32 * math.cos(math.radians(lat)))
    return (lat - dlat, lon - dlon), (lat + dlat, lon + dlon)


if __name__ == '__main__':
    main()
