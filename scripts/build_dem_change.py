#!/usr/bin/env python3
"""Ice surface change from two editions of swissALTI3D, for the 3D view.

For each glacier it takes the 2 m swissALTI3D tiles (swisstopo, data.geo.admin.ch) of the 2019 edition and of the newest edition on every tile,
for the glacier within RADIUS metres of its tongue tip, averages both to 20 m cells, subtracts (new - old) and keeps the difference only inside
the glacier's area: the 2023 outline plus the connected ground where the surface dropped by more than 2.5 m (up to 500 m away, where the tongue stood
in earlier years), fading to zero over 160 m so that there is no wall where it ends. The result goes to demchange/<SGI id>.json, which the page loads when the 3D view opens.

The edition year is not the survey year. The years the two surfaces stand for (balance years, autumn to autumn) come from documents:
  old surface = 2019 edition: the GLAMOS volume change table (doi:10.18750/volumechange.2025.r2025) names the swissALTI3D edition it used and the
    year of the survey: "sa3d-2019" (Aletsch 2017, Fiescher 2017, Corbassière, Rhone and Trift 2016). Where GLAMOS lists only "sa3d-2018" (Gorner,
    Zmutt, Findel, Fee 2015) the 2019 edition is taken to hold the same data (flag assumed = true in the file). For these four the change agrees with
    GLAMOS' glacier-wide loss of the period (ratio 0.9 to 1.2). Unteraar is an exception, see OLD_OVERRIDE.
  new surface = newest edition: the release notes (swisstopo, swissALTI3D Ausgabebericht) say that every update used lidar of an earlier year and
    was brought up to date with aerial images of the year given, wherever the surface had changed (glaciers always have):
      2022 edition (Lucerne, Obwalden, Nidwalden, Uri, Ticino): aerial images 2021
      2023 edition (Graubünden): 2022
      2024 edition 2 (Valais): 2023
      2025 edition 2 (southern Bern): 2024
    The year of a glacier is that of the edition on most of its cells.
Check: for Aletsch the change inside the area, 0.325 km3 in the lower 12.6 km2, is 37 % of the 0.878 km3 that GLAMOS gives for the whole of
Aletsch 2017-2023. Above 2,000 m swisstopo derives heights from stereo images (1 to 3 m accuracy), so differences there are noisier.

Standard library only. Needs glaciers.js (from build_outlines.py). Downloads about 1.4 MB per tile and edition into scripts/.dem-cache (gitignored,
a full run is several hundred MB and a few minutes; delete the folder afterwards if you like).
Usage: python3 scripts/build_dem_change.py [--id B36-26 ...]      (without --id: all glaciers in glaciers.js)
"""
import argparse, base64, collections, json, math, os, struct, sys, urllib.error, urllib.request, zipfile, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache')
OUT = os.path.join(ROOT, 'demchange')
CELL = 20           # metres per output cell (10 x 10 cells of the 2 m model)
RADIUS = 8000       # metres around the tongue tip
BUFFER = 3          # cells added around the outline
GROW_M = 5.0        # metres: next to the outline, cells that dropped by more than this and touch the area belong to the glacier's change
GROW_CELLS = 25     # but not further than this from the outline (500 m): the tongue stood there in earlier years (retreat, lakes)
FEATHER = 8         # cells (160 m) over which the change fades to zero outside that area: no wall where it ends
CLAMP = (-80.0, 10.0)   # metres; rock falls and building work outside this range are not ice change
OLD_EDITION = 2019
NEW_SURVEY = {2022: 2021, 2023: 2022, 2024: 2023, 2025: 2024, 2026: 2025}      # edition -> year of the aerial images (release notes, see above)
OLD_OVERRIDE = {      # glaciers where the table is not enough: year of the 2019 edition and why
    'A54g-11': (2017, 'GLAMOS lists only sa3d-2018 (2012) for Unteraar, but the change fits 2017: our -14.2 m (2017 to 2024) against GLAMOS -12.0 m for 2017-09-21 to 2023-08-23 (-20.7 m for 2012 to 2023)'),
}
GLAMOS_CSV = 'https://doi.glamos.ch/data/volumechange/volumechange.csv'


def lv95(lat, lon):     # swisstopo approximate formulas, WGS84 to LV95 (error below 0.1 m)
    p = (lat * 3600 - 169028.66) / 10000; l = (lon * 3600 - 26782.5) / 10000
    return (2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
            1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)


def tile_url(year, e, n):
    name = f'swissalti3d_{year}_{e}-{n}'
    return name, f'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/{name}/{name}_2_2056_5728.xyz.zip'


def tile_zip(year, e, n):                  # path of the cached zip, or None when this edition has no such tile
    name, url = tile_url(year, e, n)
    path = os.path.join(CACHE, name + '_2.xyz.zip')
    if os.path.exists(path): return path
    os.makedirs(CACHE, exist_ok=True)
    try:
        print('  download', name, file=sys.stderr)
        urllib.request.urlretrieve(url, path + '.part'); os.replace(path + '.part', path)
        return path
    except urllib.error.HTTPError as ex:
        if ex.code in (403, 404): return None
        raise


_newest = {}


def newest_tile(e, n):                      # (edition, path) of the newest edition of a tile
    if (e, n) not in _newest:
        _newest[(e, n)] = (None, None)
        for year in range(2026, OLD_EDITION, -1):
            p = tile_zip(year, e, n)
            if p: _newest[(e, n)] = (year, p); break
    return _newest[(e, n)]


def add_tile(path, e0, n0, w, h, acc):        # average the 2 m points into the 20 m cells: acc[cell] = [sum, count]
    z = zipfile.ZipFile(path)
    for line in z.open([x for x in z.namelist() if x.endswith('.xyz')][0]):
        p = line.split()
        try: e, n, v = float(p[0]), float(p[1]), float(p[2])
        except (ValueError, IndexError): continue
        if v < -500: continue
        i, j = int((e - e0) // CELL), int((n - n0) // CELL)
        if 0 <= i < w and 0 <= j < h:
            a = acc.get(j * w + i)
            if a is None: acc[j * w + i] = [v, 1]
            else: a[0] += v; a[1] += 1


def old_survey(gid):                        # (year, assumed) of the 2019 edition at this glacier, from the GLAMOS table
    path = os.path.join(CACHE, 'volumechange.csv')
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True); urllib.request.urlretrieve(GLAMOS_CSV, path)
    found = {}
    for line in open(path, encoding='utf-8', errors='replace'):
        c = line.rstrip('\n').split(',')
        if len(c) > 4 and c[0] == gid:
            for src, date in ((c[1], c[3]), (c[2], c[4])):
                if src in ('sa3d-2018', 'sa3d-2019'): found[src] = int(date[:4])
    if gid in OLD_OVERRIDE: return OLD_OVERRIDE[gid][0], True
    if 'sa3d-2019' in found: return found['sa3d-2019'], False
    if 'sa3d-2018' in found: return found['sa3d-2018'], True
    return None, True


def build(g):
    gid = g['id']
    tip = lv95(*g['terminus']['tip'])
    polys = [[[lv95(lat, lon) for lon, lat in ring] for ring in poly] for poly in g['outline']['coordinates']]
    near = [p for poly in polys for ring in poly for p in ring if math.hypot(p[0] - tip[0], p[1] - tip[1]) <= RADIUS]
    PAD = (GROW_CELLS + FEATHER + 2) * CELL
    e0 = int((min(p[0] for p in near) - PAD) // CELL) * CELL; n0 = int((min(p[1] for p in near) - PAD) // CELL) * CELL
    w = int((max(p[0] for p in near) + PAD - e0) // CELL) + 1; h = int((max(p[1] for p in near) + PAD - n0) // CELL) + 1
    print(f'{g["name"]} ({gid}): grid {w} x {h} cells of {CELL} m', file=sys.stderr)
    mask = bytearray(w * h)                      # scanline fill, even-odd over all rings of a polygon
    for poly in polys:
        edges = [(r[k], r[(k + 1) % len(r)]) for r in poly for k in range(len(r))]
        for j in range(h):
            y = n0 + (j + .5) * CELL; xs = []
            for (x1, y1), (x2, y2) in edges:
                if (y1 <= y) != (y2 <= y): xs.append(x1 + (y - y1) / (y2 - y1) * (x2 - x1))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                for i in range(max(0, int((xs[k] - e0) // CELL)), min(w - 1, int((xs[k + 1] - e0) // CELL)) + 1):
                    if xs[k] <= e0 + (i + .5) * CELL <= xs[k + 1]: mask[j * w + i] ^= 1
    seed = bytearray(w * h)                      # the outline and BUFFER cells around it
    for j in range(h):
        for i in range(w):
            if mask[j * w + i]:
                for dj in range(-BUFFER, BUFFER + 1):
                    for di in range(-BUFFER, BUFFER + 1):
                        if 0 <= i + di < w and 0 <= j + dj < h: seed[(j + dj) * w + i + di] = 1
    need = set()                                 # tiles needed: those of the outline and of everything within GROW_CELLS + FEATHER of it
    reach = (GROW_CELLS + FEATHER) * CELL
    for k in range(w * h):
        if seed[k]:
            e, n = e0 + (k % w) * CELL, n0 + (k // w) * CELL
            for de in (-reach, 0, reach):
                for dn in (-reach, 0, reach): need.add((int((e + de) // 1000), int((n + dn) // 1000)))
    print(f'  {len(need)} tiles of 1 km', file=sys.stderr)
    old, new, edition_cells = {}, {}, collections.Counter()
    for (e, n) in sorted(need):
        ed, newp = newest_tile(e, n); oldp = tile_zip(OLD_EDITION, e, n)
        if not newp or not oldp or ed <= OLD_EDITION:
            print(f'  tile {e}-{n}: no newer edition, left out', file=sys.stderr); continue
        add_tile(oldp, e0, n0, w, h, old); add_tile(newp, e0, n0, w, h, new)
    if not old or not new: raise SystemExit(f'{gid}: no tile with two editions')
    raw = {k: new[k][0] / new[k][1] - old[k][0] / old[k][1] for k in old if k in new}
    ed_count = collections.Counter()            # which edition carries the cells of the outline: gives the survey year of the new surface
    for k in range(w * h):
        if mask[k] and k in raw:
            ed_count[newest_tile(int((e0 + (k % w) * CELL) // 1000), int((n0 + (k // w) * CELL) // 1000))[0]] += 1
    new_ed = ed_count.most_common(1)[0][0]; edition_cells = ed_count
    # the glacier's area: the seed plus connected cells that dropped by more than GROW_M, up to GROW_CELLS away
    inside = bytearray(seed); front = [k for k in range(w * h) if seed[k]]
    for _ in range(GROW_CELLS):
        nxt = []
        for k in front:
            i, j = k % w, k // w
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= i + di < w and 0 <= j + dj < h:
                    q = (j + dj) * w + i + di
                    if not inside[q] and raw.get(q, 0) < -GROW_M: inside[q] = 1; nxt.append(q)
        front = nxt
    weight = {k: 1.0 for k in range(w * h) if inside[k]}      # then fade out over FEATHER cells
    front = [k for k in weight]
    for step in range(1, FEATHER + 1):
        nxt = []; wt = 0.5 * (1 + math.cos(math.pi * step / (FEATHER + 1)))
        for k in front:
            i, j = k % w, k // w
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= i + di < w and 0 <= j + dj < h:
                    q = (j + dj) * w + i + di
                    if q not in weight: weight[q] = wt; nxt.append(q)
        front = nxt
    d = [0] * (w * h); vals = []
    for k, wt in weight.items():
        if k in raw:
            v = max(CLAMP[0], min(CLAMP[1], raw[k])) * wt; d[k] = int(round(v * 100))
            if wt == 1.0: vals.append(v)
    vals.sort()
    old_year, assumed = old_survey(gid)
    print(f'  newest editions (cells): {dict(edition_cells)}; surveys: old {old_year}{" (assumed from the 2018 edition)" if assumed else ""}, new {NEW_SURVEY.get(new_ed)}', file=sys.stderr)
    print(f'  {len(vals)} cells; change (m): median {vals[len(vals)//2]:.2f}, 10th pct {vals[len(vals)//10]:.2f}, 90th pct {vals[len(vals)*9//10]:.2f}; volume {sum(d)/100*CELL*CELL/1e9:.3f} km3', file=sys.stderr)
    entry = {'e0': e0, 'n0': n0, 'cell': CELL, 'w': w, 'h': h, 'rows': 'south to north', 'unit': 'cm, newest minus 2019 edition, inside the glacier area, fading to 0 outside it',
             'old': dict({'edition': OLD_EDITION, 'year': old_year, 'assumed': assumed}, **({'basis': OLD_OVERRIDE[gid][1]} if gid in OLD_OVERRIDE else {})), 'new': {'edition': new_ed, 'year': NEW_SURVEY.get(new_ed), 'cells_by_edition': dict(edition_cells)},
             'z': base64.b64encode(zlib.compress(struct.pack('<%dh' % (w * h), *d), 9)).decode()}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, gid + '.json')
    open(path, 'w', encoding='utf-8').write(json.dumps(entry, separators=(',', ':')))
    print('  wrote', path, os.path.getsize(path), 'bytes', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', nargs='*')
    a = ap.parse_args()
    s = open(os.path.join(ROOT, 'glaciers.js'), encoding='utf-8').read()
    for g in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers']:
        if not a.id or g['id'] in a.id: build(g)


if __name__ == '__main__':
    main()
