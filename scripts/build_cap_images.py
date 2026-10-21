#!/usr/bin/env python3
"""The picture area of a whole ice cap, its tiles, and its outlets as sub-items: written into the cap's entry of data/iceland.js (run after build_regions.py).

  python3 scripts/build_cap_images.py            # all caps listed in CAPS (now: hofsjokull)
  python3 scripts/build_cap_images.py hofsjokull

What it adds to the outlet `<cap>` of data/iceland.js:
  image  {bounds, bbox, w, h, pix, tiles, lakes}
         bounds   [[south, west], [north, east]] in WGS84: the old outline (Icelandic Met Office, about 1890) and the newest outline together, plus MARGIN_M on every side, then
                  made bigger where a lake would be cut by the edge (OpenStreetMap natural=water, not rivers; every lake added is listed in `lakes` and printed);
                  a lake never moves an edge by more than LAKE_MAX_M.
         bbox     the same in Web Mercator metres, whole numbers; w x h pixels at 10 m of ground (pix = Mercator metres per pixel)
         tiles    [[west, south, east, north, w, h], ...] Web Mercator, equal size, each at most 2,490 px (the Process API takes 2,500): the page asks for these, the relay's cache
                  serves the same request to every visitor, and the page stitches them. The area is padded to a whole number of tiles at the east and north.
  subs   the outlets of the cap as sub-items of the menu: name, the RGI 6.0 basins it consists of, area, tip (lowest point of its outline by the Mapterhorn tiles), bounds, and
         `approx` + `basis` for what each name rests on. Only documented names: a name that rests on a nearby peak or on the order of a list is marked approx.
  lat, lon, half  the centre of the picture area and half its longer side in km (the relay checks that a picture box has its centre near a centre in CENTRES: run
         sync_worker_centres.py afterwards and paste worker/worker.js into Cloudflare).
Standard library only (plus what icecap_lib needs: Pillow for the terrain tiles).
"""
import json, math, os, sys, time, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import icecap_lib as lib
import build_regions as br

OUT = os.path.join(os.path.dirname(HERE), 'data', 'iceland.js')
MARGIN_M = 2000.0         # around the old and the new outline
LAKE_MAX_M = 6000.0       # a lake moves an edge by this much at most
MIN_LAKE_KM2 = 0.05       # smaller ponds are left alone
TILE_PX = 2490            # at most (the Process API: 2,500)
GROUND_RES = 10.0         # metres of ground per pixel

# What each name rests on (see the docstring). rgi = the last digits of the RGI 6.0 ids of the basins (06.00xxx).
CAPS = {
    'hofsjokull': dict(subs=[
        dict(name='Þjórsárjökull', rgi=['234'], approx=False, basis='Name in the RGI 6.0 (Thjorsarjoekull); Rótarjökull and Klakksjökull (OpenStreetMap) are lobes inside it.'),
        dict(name='Blöndujökull / Kvíslajökull', rgi=['235'], approx=False, basis='Name in the RGI 6.0; the OpenStreetMap points of both glaciers lie inside the basin.'),
        dict(name='Blágnípujökull', rgi=['236'], approx=False, basis='Name in the RGI 6.0; the OpenStreetMap point lies inside the basin; Jökull 1998 (SW).'),
        dict(name='Múlajökull', rgi=['237'], approx=False, basis='Name in the RGI 6.0; Nauthagajökull is a branch inside the basin (OpenStreetMap).'),
        dict(name='Blautukvíslarjökull', rgi=['232'], approx=False, basis='The OpenStreetMap point of Blautukvíslarjökull lies inside the basin; listed as an outlet of Hofsjökull (Wikipedia, Jökull 1998).'),
        dict(name='Sátujökull', rgi=['238'], approx=False, basis='The broad outlet on the north side (Jökull 1998); the OpenStreetMap point lies 3.8 km from the basin, at its northern end.'),
        dict(name='Illviðrajökull', rgi=['233'], approx=True, basis='Inferred: Illviðrahnjúkar (peaks) lie just north of this basin and the USGS atlas places Illviðrajökull on the northern margin of Hofsjökull.'),
        dict(name='Miklafellsjökull', rgi=['229', '230', '231'], approx=True, basis='Inferred: the peak Miklafell (OpenStreetMap) lies in the basin of 8 km2; the two small basins of 1.7 km2 beside it are taken with it.'),
        dict(name='Austari-Jökulsárjökull', rgi=['228'], approx=True, basis='Inferred: the only basin that faces due north; the Wikipedia list of the outlets of Hofsjökull (clockwise from north) begins with this name.'),
    ])}


def overpass(query, name):
    p = os.path.join(lib.CACHE, name)
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f: return json.load(f)
    last = None
    for host in ('https://overpass-api.de', 'https://overpass.kumi.systems', 'https://overpass-api.de', 'https://overpass.kumi.systems'):
        try:
            d = json.loads(lib.http(host + '/api/interpreter', urllib.parse.urlencode({'data': query}).encode(), timeout=200, tries=1)); break
        except Exception as e: last = e; time.sleep(5)
    else: raise RuntimeError(f'Overpass: {last}')
    os.makedirs(lib.CACHE, exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: json.dump(d, f)
    return d


def points_of(o):
    pts = [tuple(p) for r in o['outline'] for p in r]
    for k in ('lia', 'latest'):
        pts += [tuple(p) for line in o['outlines'][k]['lines'] for p in line]
    return pts


def ground_box(pts, margin):
    """south, west, north, east in degrees: the points plus `margin` metres"""
    la = [p[0] for p in pts]; lo = [p[1] for p in pts]
    s, n, w, e = min(la), max(la), min(lo), max(lo)
    mid = (s + n) / 2
    return [s - margin / 111320.0, w - margin / (111320.0 * math.cos(math.radians(mid))), n + margin / 111320.0, e + margin / (111320.0 * math.cos(math.radians(mid)))]


def lakes_in(box, cap_id):
    s, w, n, e = box
    q = f'[out:json][timeout:120];(way["natural"="water"]({s - .1},{w - .3},{n + .1},{e + .3});relation["natural"="water"]({s - .1},{w - .3},{n + .1},{e + .3}););out tags bb;'
    d = overpass(q, f'lakes-{cap_id}.json')
    out = []
    for el in d.get('elements', []):
        t = el.get('tags', {}); b = el.get('bounds')
        if not b or t.get('water') in ('river', 'stream', 'canal', 'oxbow', 'ditch', 'drain'): continue
        k = 111.32
        area = (b['maxlat'] - b['minlat']) * k * (b['maxlon'] - b['minlon']) * k * math.cos(math.radians(b['minlat']))
        if area < MIN_LAKE_KM2: continue
        out.append(dict(name=t.get('name', ''), bbox=[b['minlat'], b['minlon'], b['maxlat'], b['maxlon']], id=f"{el['type'][0]}{el['id']}"))
    return out


def grow_over_lakes(box, lakes, log):
    """enlarge `box` so no lake that crosses an edge is cut (each edge by LAKE_MAX_M at most); returns the box and the lakes that moved an edge"""
    s0, w0, n0, e0 = box; s, w, n, e = box; moved = []
    dlat = LAKE_MAX_M / 111320.0; dlon = LAKE_MAX_M / (111320.0 * math.cos(math.radians((s + n) / 2)))
    for _ in range(8):
        changed = False
        for lk in lakes:
            ls, lw, ln, le = lk['bbox']
            if ln < s or ls > n or le < w or lw > e: continue      # does not touch the picture area
            ns, nw, nn, ne = min(s, ls), min(w, lw), max(n, ln), max(e, le)
            ns, nw = max(ns, s0 - dlat) if ns < s else s, max(nw, w0 - dlon) if nw < w else w
            nn, ne = min(nn, n0 + dlat) if nn > n else n, min(ne, e0 + dlon) if ne > e else e
            if (ns, nw, nn, ne) != (s, w, n, e):
                s, w, n, e = ns, nw, nn, ne; changed = True
                if lk not in moved: moved.append(lk)
        if not changed: break
    for lk in lakes:      # report the ones that still reach out (cut by the limit)
        ls, lw, ln, le = lk['bbox']
        if not (ln < s or ls > n or le < w or lw > e) and (ls < s - 1e-9 or lw < w - 1e-9 or ln > n + 1e-9 or le > e + 1e-9): log(f'  lake still cut (limit {LAKE_MAX_M:.0f} m): {lk["name"] or lk["id"]}')
    return [s, w, n, e], moved


def tile_grid(box):
    """Web Mercator bbox, pixel size and the equal tiles of the area (padded to a whole number of tiles at east and north)"""
    s, w, n, e = box
    x0, y0 = lib.merc(s, w); x1, y1 = lib.merc(n, e)
    pix = GROUND_RES / math.cos(math.radians((s + n) / 2))
    W, H = math.ceil((x1 - x0) / pix), math.ceil((y1 - y0) / pix)
    nx, ny = math.ceil(W / TILE_PX), math.ceil(H / TILE_PX)
    tw, th = math.ceil(W / nx), math.ceil(H / ny)
    x0 = round(x0); y0 = round(y0)
    tiles = []
    for j in range(ny):
        for i in range(nx):
            tiles.append([round(x0 + i * tw * pix), round(y0 + j * th * pix), round(x0 + (i + 1) * tw * pix), round(y0 + (j + 1) * th * pix), tw, th])
    return dict(bbox=[x0, y0, tiles[-1][2], tiles[-1][3]], w=tw * nx, h=th * ny, pix=round(pix, 4), tiles=tiles)


def build_subs(cap, o, feats, caps, dem):
    ents = {f['properties']['RGIID'][-3:]: f for c in caps for i in c['idx'] for f in [feats[i]]}
    subs = []
    for sp in cap['subs']:
        fs = [ents[r] for r in sp['rgi']]
        pts = []
        for f in fs:
            g = f['geometry']
            for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]): pts += [lib.unmerc(x, y) for x, y in poly[0]]
        hs = [dem.h(la, lo) for la, lo in pts]; hmin = min(hs)
        low = [p for p, h in zip(pts, hs) if h <= hmin + 4]
        cx, cy = sum(p[0] for p in low) / len(low), sum(p[1] for p in low) / len(low)
        tip = min(low, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        la = [p[0] for p in pts]; lo = [p[1] for p in pts]
        outline = [[[round(a, 5), round(b, 5)] for a, b in lib.thin_ll([lib.unmerc(x, y) for x, y in poly[0]], 25)]      # the RGI outlines of its basins, outer rings, for the borders on the map
                   for f in fs for poly in (f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon' else [f['geometry']['coordinates']])]
        subs.append(dict(name=sp['name'], rgi=['RGI60-06.00' + r for r in sp['rgi']], approx=sp['approx'], basis=sp['basis'],
                         areaKm2=round(sum(f['properties']['AREA'] for f in fs), 1), zmin=min(f['properties']['ZMIN'] for f in fs), zmax=max(f['properties']['ZMAX'] for f in fs),
                         tip=[round(tip[0], 5), round(tip[1], 5)], outline=outline, bounds=[[round(min(la), 4), round(min(lo), 4)], [round(max(la), 4), round(max(lo), 4)]]))
    return subs


def main(ids):
    with open(OUT, encoding='utf-8') as f: txt = f.read()
    note = txt.split('\n')[1][3:]
    data = json.loads(txt[txt.index('window.REGION_ICE = ') + 20:].rstrip().rstrip(';'))
    feats, caps = br.iceland_caps(); dem = lib.Dem(12)
    for cid in ids:
        o = next(x for x in data['outlets'] if x['id'] == cid); cap = CAPS[cid]
        print(cid)
        box0 = ground_box(points_of(o), MARGIN_M)
        lakes = lakes_in(box0, cid)
        box, moved = grow_over_lakes(box0, lakes, print)
        for lk in moved: print(f'  lake moved an edge: {lk["name"] or lk["id"]} {lk["bbox"]}')
        grid = tile_grid(box)
        s, w = lib.unmerc(grid['bbox'][0], grid['bbox'][1]); n, e = lib.unmerc(grid['bbox'][2], grid['bbox'][3])
        km = lambda a, b, c, d: ((d - b) * 111.32 * math.cos(math.radians((a + c) / 2)), (c - a) * 111.32)
        print(f"  area {km(s, w, n, e)[0]:.1f} x {km(s, w, n, e)[1]:.1f} km, {grid['w']} x {grid['h']} px, {len(grid['tiles'])} tiles of {grid['tiles'][0][4]} x {grid['tiles'][0][5]}")
        o['image'] = dict(bounds=[[round(s, 5), round(w, 5)], [round(n, 5), round(e, 5)]], **grid,
                          lakes=[dict(name=lk['name'], id=lk['id'], bbox=[round(v, 4) for v in lk['bbox']]) for lk in moved])
        o['lat'], o['lon'] = round((s + n) / 2, 4), round((w + e) / 2, 4)
        o['half'] = round(max(km(s, w, n, e)) / 2, 1)
        o['subs'] = build_subs(cap, o, feats, caps, dem)
        for sb in o['subs']: print(f"  {sb['name']:30s} {sb['areaKm2']:6.1f} km2  tip {sb['tip']}  {'approx' if sb['approx'] else ''}")
    br.write_js(OUT, data, note)


if __name__ == '__main__':
    main(sys.argv[1:] or list(CAPS))
