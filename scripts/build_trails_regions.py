#!/usr/bin/env python3
"""Footpaths and tracks of the glaciers of the ice-cap regions, and where on them the ice front is in view -> data/trails-iceland.js, trails-norway.js, trails-svalbard.js, trails-vatnajokull.js

The method of build_trails_iceland.py (which did Breiðamerkurjökull with ÍslandsDEM) for every glacier of a region, with the terrain tiles of Mapterhorn as the ground (zoom 12 over Iceland and
Svalbard, 13 over Norway; icecap_lib.Dem), so that no big elevation model has to be downloaded:

  Paths    OpenStreetMap (ODbL, Overpass API): ways with highway = path, footway, steps (footpaths) and track, bridleway (tracks) inside the picture box, cut to the box, thinned (3 m).
  In view  79 target points on the ice front: the ice cells (100 m grid) of the newest outline of the glacier (Iceland: the Icelandic Met Office outline of 17 September 2025; Norway: NVE 2018-2019;
           Svalbard: NPI 2020) that lie in the strip of the 3D view, the lowest 1.5 km of the tongue. Every 20 m along a path a person 1.7 m tall looks at the targets (the line against the ground,
           with the curvature of the earth and refraction, 0.13); a stretch counts when it sees at least 25 % of them. Trees and buildings are not counted. The ice has moved since the terrain model
           was made, and over the sea the model shows sea level.
Glaciers without a path that sees the ice front are left out of the file (the page then shows the paths, if any, without the violet band).

Needs the data files of the regions (build_vatnajokull.py, build_regions.py) and internet. Standard library and Pillow.
Usage: python3 scripts/build_trails_regions.py iceland|norway|svalbard|vatnajokull [--only id,id]
"""
import argparse, array, datetime, json, math, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import icecap_lib as lib
import build_vatnajokull as bv
import build_regions as br

ROOT = lib.ROOT
EYE, STEP, N_TARGETS, MIN_SHARE, FRONT_KM, K_REF, R_EARTH, MAX_KM, GRID = 1.7, 20.0, 79, 0.25, 1.5, 0.13, 6371000.0, 12.0, 25.0
REGIONS = {'iceland': ('iceland.js', 12, 'trails-iceland.js', 'imo'), 'vatnajokull': ('vatnajokull.js', 12, 'trails-vatnajokull.js', 'imo'),
           'norway': ('norway.js', 13, 'trails-norway.js', 'outline'), 'svalbard': ('svalbard.js', 12, 'trails-svalbard.js', 'outline')}
SKIP = {'vatnajokull': ('breidamerkurjokull',)}      # done by build_trails_iceland.py (data/trails-is.js)


def overpass(query, tries=4):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'tonguesfromspace/1.0 (https://tonguesfromspace.org)'})
            with urllib.request.urlopen(req, timeout=180) as r: return json.load(r)
        except Exception as e:
            last = e; time.sleep(5 * (k + 1))
    raise last


def strip_axes(o):
    s3 = o['strip3d']; az = math.radians(s3['azimuth'])
    return math.sin(az), math.cos(az), s3


def one(o, dem, ice_kind):
    (s, w), (n, e) = br_square(o['lat'], o['lon'], o['half'], o.get('halfH'))
    inbox = lambda la, lo: s <= la <= n and w <= lo <= e
    d = overpass(f'[out:json][timeout:120];(way["highway"~"^(path|footway|steps|track|bridleway)$"]({s},{w},{n},{e}););out tags geom;')
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
    thin = lambda rs: [[[round(a_, 5), round(b_, 5)] for a_, b_ in bv.dp_ll(r, 3, k)] for r in rs]
    paths, tracks = thin(paths), thin(tracks)
    print(f"  {o['name']}: {len(paths)} footpaths ({sum(len(r) for r in paths)} points), {len(tracks)} tracks ({sum(len(r) for r in tracks)} points)")
    if not paths and not tracks: return None
    # the ground on a grid of 25 m over the picture box (the terrain tiles are sampled once)
    half_m = o['half'] * 1000.0; half_hm = (o.get('halfH') or o['half']) * 1000.0; nn = int(2 * half_m / GRID) + 1; nj = int(2 * half_hm / GRID) + 1; g0x, g0y = -half_m, -half_hm
    ground_a = array.array('f', [0.0]) * (nn * nj)
    for j in range(nj):
        la = o['lat'] + (g0y + j * GRID) / 111320.0
        for i in range(nn): ground_a[j * nn + i] = dem.h(la, o['lon'] + (g0x + i * GRID) / k)
    def ground(lat, lon):
        i = int(round(((lon - o['lon']) * k - g0x) / GRID)); j = int(round(((lat - o['lat']) * 111320.0 - g0y) / GRID))
        return ground_a[min(nj - 1, max(0, j)) * nn + min(nn - 1, max(0, i))]
    # the targets: ice cells of the newest outline in the strip of the 3D view, the lowest 1.5 km
    ue, un, s3 = strip_axes(o)
    if ice_kind == 'imo':
        pts = [p for r in o['outline'] for p in r]; lats, lons = [p[0] for p in pts], [p[1] for p in pts]
        g = bv.Grid(o['lat'], o['lon'], (min(lats) - 0.01, min(lons) - 0.02, max(lats) + 0.01, max(lons) + 0.02))
        rings, _ = bv.imo_polygons('glaciology:glacierpolygon_sent2_2025', [min(lons) - 0.02, min(lats) - 0.01, max(lons) + 0.02, max(lats) + 0.01])
        ice = g.fill(rings); basin = g.fill(o['outline']); ok_cell = lambda idx: ice[idx] and basin[idx]
    else:
        pts = [p for r in o['outline'] for p in r]; lats, lons = [p[0] for p in pts], [p[1] for p in pts]
        g = bv.Grid(o['lat'], o['lon'], (min(lats) - 0.01, min(lons) - 0.02, max(lats) + 0.01, max(lons) + 0.02))
        ice = br.fill_rings(g, o['outline']); ok_cell = lambda idx: ice[idx]
    tipx, tipy = lib.merc(*o['tip']); kk = 1 / math.cos(math.radians(o['tip'][0])); cells = []
    for r in range(g.h):
        for c in range(g.w):
            if ok_cell(r * g.w + c):
                lat, lon = g.lat0 + (g.y0 + (r + 0.5) * bv.CELL) / 111320.0, g.lon0 + (g.x0 + (c + 0.5) * bv.CELL) / g.k
                mx, my = lib.merc(lat, lon); dx, dy = (mx - tipx) / kk, (my - tipy) / kk
                a_, b_ = dx * ue + dy * un, dx * un - dy * ue
                if abs(b_) < s3['half'] and -s3['back'] < a_ < s3['up']: cells.append((a_, lat, lon))
    if not cells: return {'paths': paths, 'tracks': tracks, 'lines': []}
    cells.sort(); a0 = cells[0][0]
    front = [c for c in cells if c[0] <= a0 + FRONT_KM * 1000]; step = max(1, len(front) // N_TARGETS); targets = front[::step][:N_TARGETS]
    tx = [(((lo - o['lon']) * k, (la - o['lat']) * 111320.0), ground(la, lo)) for _, la, lo in targets]
    def sees(lat, lon):
        ox, oy = (lon - o['lon']) * k, (lat - o['lat']) * 111320.0; h0 = ground(lat, lon) + EYE; seen = 0
        for (x, y), h in tx:
            dist = math.hypot(x - ox, y - oy)
            if dist > MAX_KM * 1000: continue
            n_ = max(2, int(dist / 25)); ok = True
            for i in range(1, n_):
                f = i / n_; sx, sy = ox + (x - ox) * f, oy + (y - oy) * f; dd = dist * f
                line = h0 + (h - h0) * f - dd * (dist - dd) * (1 - K_REF) / (2 * R_EARTH)
                if ground(o['lat'] + sy / 111320.0, o['lon'] + sx / k) > line: ok = False; break
            seen += ok
        return seen / len(tx)
    lines = []; total = vis = 0
    for r in paths + tracks:
        run = []
        for (a1, b1), (a2, b2) in zip(r, r[1:]):
            x1, y1 = (b1 - o['lon']) * k, (a1 - o['lat']) * 111320.0; x2, y2 = (b2 - o['lon']) * k, (a2 - o['lat']) * 111320.0
            L = math.hypot(x2 - x1, y2 - y1); m = max(1, int(L / STEP))
            for i in range(m + 1):
                f = i / m; la, lo = a1 + (a2 - a1) * f, b1 + (b2 - b1) * f; total += 1
                if min((math.hypot((lo - o['lon']) * k - tx_[0][0], (la - o['lat']) * 111320.0 - tx_[0][1]) for tx_ in tx[:1]), default=0) > MAX_KM * 1000 + 3000: run = []; continue
                if sees(la, lo) >= MIN_SHARE: run.append([round(la, 5), round(lo, 5)]); vis += 1
                else:
                    if len(run) > 1: lines.append(run)
                    run = []
        if len(run) > 1: lines.append(run)
    print(f'    {vis} of {total} points see at least {MIN_SHARE:.0%} of the {len(tx)} targets; {len(lines)} stretches')
    return {'paths': paths, 'tracks': tracks, 'lines': lines, 'targets': len(tx)}


def br_square(lat, lon, half, half_h=None):
    dlat = (half_h or half) / 111.32; dlon = half / (111.32 * math.cos(math.radians(lat)))
    return (lat - dlat, lon - dlon), (lat + dlat, lon + dlon)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('region', choices=list(REGIONS)); ap.add_argument('--only', default=''); a = ap.parse_args()
    fname, z, out_name, ice_kind = REGIONS[a.region]
    t = open(os.path.join(ROOT, 'data', fname), encoding='utf-8').read()
    outlets = [x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] not in SKIP.get(a.region, ()) and (not a.only or x['id'] in a.only.split(','))]
    dem = lib.Dem(z); body = [f"// generated by scripts/build_trails_regions.py - do not edit by hand\nwindow.GLACIER_TRAILS = window.GLACIER_TRAILS || {{}}; window.GLACIER_SIGHT = window.GLACIER_SIGHT || {{}};\n"]
    n_paths = 0
    for o in outlets:
        r = one(o, dem, ice_kind)
        if not r: continue
        n_paths += 1
        body.append(f"window.GLACIER_TRAILS[{json.dumps(o['id'])}] = " + json.dumps({'paths': r['paths'], 'tracks': r['tracks'], 'source': 'OpenStreetMap contributors (ODbL), Overpass API', 'date': datetime.date.today().isoformat()}, separators=(',', ':')) + ";\n")
        if r['lines']:
            body.append(f"window.GLACIER_SIGHT[{json.dumps(o['id'])}] = " + json.dumps({'lines': r['lines'], 'eye': EYE, 'minShare': MIN_SHARE, 'targets': r['targets'], 'front': 'ice of the newest outline, the lowest 1.5 km of the tongue', 'ground': 'Mapterhorn terrain tiles'}, separators=(',', ':')) + ";\n")
    path = os.path.join(ROOT, 'data', out_name)
    if n_paths: open(path, 'w', encoding='utf-8').write(''.join(body)); print(f'wrote {path} ({os.path.getsize(path) / 1024:.0f} kB), {n_paths} glaciers with paths')
    else: print('no paths in any picture box: nothing written')


if __name__ == '__main__':
    main()
