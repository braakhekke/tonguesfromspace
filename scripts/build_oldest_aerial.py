#!/usr/bin/env python3
"""The oldest SWISSIMAGE edition that covers a whole glacier (and, where it exists, the whole picture box) -> data/oldest-aerial.json, keyed by the site id (2026-11-03, owner: "Oldest" must only show footage that covers the whole image box or at least the whole glacier).

Before, the page asked the swisstopo identify service for the surveys at ONE point (the middle of the box) and took the oldest edition there: at the edges of the box that edition could be blank. Now:
  * a grid of points over the picture box (data/boxes.js) and a grid of points inside the glacier's SGI2023 outline (data/glaciers.js) are asked one by one (layer ch.swisstopo.swissimage-product.metadata:
    every aerial survey at a place, `flightyear` = the year flown, `bgdi_flugjahr` = the edition of SWISSIMAGE in which that survey first appears);
  * at every point the first edition is the smallest bgdi_flugjahr there; an edition covers a set of points when it is at least the first edition of each of them (the mosaic of an edition shows, at a place,
    the newest survey that edition holds);
  * the metadata alone is not enough (owner, 2026-11-03: the Rhone's 1959 edition showed a blank band over the glacier although the service lists surveys there), so every candidate edition is checked on the
    TILES the page shows (wmts.geo.admin.ch, zoom 14): a point is covered when the 24 x 24 pixels around it are not a flat white patch (no data comes as pure white); the oldest edition whose tiles cover every
    point is `edBox` / `edGlacier`;
  * `edBox` = the oldest edition covering every point of the box, `edGlacier` = the oldest covering every point of the glacier; the page shows `ed` = edBox, and only where no edition covers the whole box, edGlacier
    (`coverage` = 'glacier', with a `clip`); `coverage` is 'box' otherwise;
  * `zoom` = the finest zoom level at which the edition's tiles show a picture over the whole glacier (the page uses it as the native zoom of the layer);
  * `clip` = [[south, west], [north, east]]: where the page shows the picture (the glacier's points plus 300 m, only when the whole of it shows a picture), so the picture is one block of one resolution and not patches of other pictures, white tiles and base map;
  * `flown` = the years the surveys were flown that the mosaic of `ed` shows at the sample points (of the box, or of the glacier when coverage is 'glacier').
Usage: python3 scripts/build_oldest_aerial.py [site ids ...]    (default: the ten Swiss glaciers of data/glaciers.js; network; about 150 requests per glacier)"""
import io, json, math, os, sys, time, urllib.request, concurrent.futures as cf
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = ('https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=%s,%s&geometryType=esriGeometryPoint&layers=all:ch.swisstopo.swissimage-product.metadata'
       '&mapExtent=%s,%s,%s,%s&imageDisplay=500,500,96&tolerance=0&sr=4326&returnGeometry=false')
NB, NG = 9, 160
SITE = {'B36-26': 'aletsch', 'B56-07': 'gorner', 'B40-07': 'fiescher', 'A54g-11': 'unteraar', 'B83-03': 'corbassiere', 'B57-05': 'zmutt', 'B43-03': 'rhone', 'B56-03': 'sgi-B56-03', 'B53-04': 'sgi-B53-04', 'A54e-24': 'trift'}      # the site's `#g=` ids (the page keys the result by them)      # points per side over the box; about this many points inside the glacier outline

def load_js(path):
    t = open(path, encoding='utf-8').read(); return json.loads(t[t.index('{'):t.rindex('}') + 1])
def inside(pt, rings):
    x, y = pt; c = False
    for ring in rings:      # even-odd over all rings of the polygon (holes count)
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
            j = i
    return c
def ask(lon, lat):
    for k in range(4):
        try:
            j = json.load(urllib.request.urlopen(urllib.request.Request(API % (lon, lat, lon - .0005, lat - .0005, lon + .0005, lat + .0005), headers={'User-Agent': 'tfs-oldest/1.0'}), timeout=60))
            return [(int(a['bgdi_flugjahr']), int(a['flightyear'])) for a in (r.get('attributes') for r in j.get('results', [])) if a and a.get('bgdi_flugjahr') and a.get('flightyear')]
        except Exception: time.sleep(3 * (k + 1))
    return None
TILE = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage-product/default/%d/3857/%d/%d/%d.jpeg'
_tiles = {}
def tile_img(ed, z, x, y):
    k = (ed, z, x, y)
    if k not in _tiles:
        img = None
        for t in range(3):
            try: img = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(TILE % (ed, z, x, y), headers={'User-Agent': 'tfs-oldest/1.0'}), timeout=60).read())).convert('L'); break
            except Exception as e:
                if getattr(e, 'code', None) in (400, 404): break      # no such tile in that edition: no picture
                time.sleep(2 * (t + 1))
        _tiles[k] = img
    return _tiles[k]
def shows(ed, lon, lat, z=14):
    """does the tile of edition `ed` show a picture at this place? (a flat white patch of 24 x 24 px, or no tile, means no data)"""
    n = 2 ** z; fx = (lon + 180) / 360 * n; fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n; x, y = int(fx), int(fy)
    img = tile_img(ed, z, x, y)
    if img is None: return False
    px, py = int((fx - x) * img.width), int((fy - y) * img.height); box = img.crop((max(0, px - 12), max(0, py - 12), min(img.width, px + 12), min(img.height, py + 12)))
    v = list(box.get_flattened_data()) if hasattr(box, 'get_flattened_data') else list(box.getdata()); mean = sum(v) / len(v)
    return not (mean >= 253 and max(v) - min(v) <= 3)
def top_zoom(points, ed):
    """the highest zoom level (at most 17, what the page can show) at which the tiles of edition `ed` show a picture at every point: above it the tiles are missing over part of the area (the 1960 edition over the
    Rhone glacier is blank at the zoom levels the page uses on the tongue although the coarser tiles are there), so the page stops asking for finer tiles and enlarges the last good level"""
    for z in range(17, 9, -1):
        with cf.ThreadPoolExecutor(8) as ex: ok = list(ex.map(lambda p: shows(ed, p[0], p[1], z), points))
        if all(ok): return z
    return None
def oldest_showing(points, editions):
    """the first of `editions` (ascending) whose tiles show a picture at every point"""
    for ed in editions:
        with cf.ThreadPoolExecutor(8) as ex: ok = list(ex.map(lambda p: shows(ed, *p), points))
        if all(ok): return ed
    return None
def cover(points):
    """points -> {(lon, lat): [(edition, flown), ...]}; returns (the oldest edition covering all of them, the flown years shown at the sample points)"""
    if any(v is None or not v for v in points.values()): return None, []
    first = {p: min(e for e, f in v) for p, v in points.items()}; ed = max(first.values())
    flown = sorted({max((s for s in v if s[0] <= ed), key=lambda s: (s[1], s[0]))[1] for v in points.values()})      # at each point the newest survey of that edition
    return ed, flown

def main():
    boxes = load_js(os.path.join(ROOT, 'data', 'boxes.js'))['glaciers']; gl = {g['id']: g for g in load_js(os.path.join(ROOT, 'data', 'glaciers.js'))['glaciers']}
    ids = sys.argv[1:] or list(gl)
    out_path = os.path.join(ROOT, 'data', 'oldest-aerial.json'); out = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for gid in ids:
        (s, w), (n, e) = boxes[gid]['box']['bounds']
        box_pts = [(w + (e - w) * (i + .5) / NB, s + (n - s) * (j + .5) / NB) for i in range(NB) for j in range(NB)]
        g_pts = []
        for o in (gl[gid]['outline'], (gl[gid].get('oldest') or {}).get('outline')):      # the current outline AND the oldest one (the 1850 extent; 2026-11-04, owner: the oldest picture of the Gorner covered the 2023 outline but not the 1850 one)
            if not o: continue
            polys = o['coordinates']; xs = [p[0] for pl in polys for r in pl for p in r]; ys = [p[1] for pl in polys for r in pl for p in r]
            step = math.sqrt((max(xs) - min(xs)) * (max(ys) - min(ys)) / NG * 1.0) or .001
            x = min(xs)
            while x <= max(xs):
                y = min(ys)
                while y <= max(ys):
                    if any(inside((x, y), pl) for pl in polys): g_pts.append((round(x, 6), round(y, 6)))
                    y += step
                x += step
            ring = [q for pl in polys for r in pl for q in r]; stride = max(1, len(ring) // 60)      # the edge of the outline and the tongue tip too (the grid inside the outline steps over a narrow tongue)
            g_pts += [(round(q[0], 6), round(q[1], 6)) for q in ring[::stride]]
        if boxes[gid].get('tip'): g_pts.append((boxes[gid]['tip'][1], boxes[gid]['tip'][0]))
        g_pts = list(dict.fromkeys(g_pts))
        pts = {p: None for p in box_pts + g_pts}
        with cf.ThreadPoolExecutor(8) as ex:
            for p, r in zip(list(pts), ex.map(lambda q: ask(*q), list(pts))): pts[p] = r
        edB0, _ = cover({p: pts[p] for p in box_pts}); edG0, _ = cover({p: pts[p] for p in g_pts})      # the lower bounds the metadata gives
        eds = sorted({e for v in pts.values() if v for e, f in v})
        edG = oldest_showing(g_pts, [e for e in eds if edG0 and e >= edG0]) if edG0 else None
        edB = oldest_showing(box_pts, [e for e in eds if edB0 and e >= edB0]) if edB0 else None
        ed = edB if edB else edG      # the oldest edition that covers the WHOLE picture box; only where none ever does (the box reaches beyond Switzerland), the oldest that covers the whole glacier (owner, 2026-11-03: "the oldest imagery does not cover the whole image box for many glaciers!")
        zG = top_zoom(box_pts if edB else g_pts, ed) if ed else None
        clip = None
        if ed and not edB and zG:      # the area the page shows of the oldest picture: the box of the glacier's points plus 300 m, inside the picture box, kept only when every point of a 12 x 12 grid over it shows a picture at that zoom
            pad_lat, pad_lon = 300 / 111320, 300 / (111320 * math.cos(math.radians((s + n) / 2)))
            c = [max(s, min(p[1] for p in g_pts) - pad_lat), max(w, min(p[0] for p in g_pts) - pad_lon), min(n, max(p[1] for p in g_pts) + pad_lat), min(e, max(p[0] for p in g_pts) + pad_lon)]
            grid = [(c[1] + (c[3] - c[1]) * (i + .5) / 12, c[0] + (c[2] - c[0]) * (j + .5) / 12) for i in range(12) for j in range(12)]
            with cf.ThreadPoolExecutor(8) as ex: okc = list(ex.map(lambda p: shows(edG, p[0], p[1], zG), grid))
            clip = [[round(c[0], 5), round(c[1], 5)], [round(c[2], 5), round(c[3], 5)]] if all(okc) else None
            if not all(okc): print('   the clip around %s is not fully covered (%d of %d grid points show a picture): no clip' % (gid, sum(okc), len(okc)))
        flB = cover({p: pts[p] for p in box_pts})[1] if edB else []
        flG = sorted({max((s for s in pts[p] if s[0] <= ed), key=lambda s: (s[1], s[0]))[1] for p in (box_pts if edB else g_pts)}) if ed else []
        res = {'ed': ed, 'zoom': zG, 'clip': clip, 'flown': ' / '.join(map(str, flG)) if flG else None, 'coverage': ('box' if edB else 'glacier') if ed else None,
               'edBox': edB, 'edGlacier': edG, 'flownBox': flB, 'points': {'box': len(box_pts), 'glacier': len(g_pts)}, 'asked': time.strftime('%Y-%m-%d')}
        out[SITE.get(gid, gid)] = res; print(gid, {k: res[k] for k in ('ed', 'zoom', 'flown', 'coverage', 'edBox', 'edGlacier')}, res['points'], flush=True)
    json.dump(out, open(out_path, 'w'), indent=1, sort_keys=True)

if __name__ == '__main__': main()
