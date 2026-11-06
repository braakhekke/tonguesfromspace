#!/usr/bin/env python3
"""Lake floors for the 3D view of the size page (size.html): swissBATHY3D, Federal Office of Topography swisstopo, 1 m, 2 m or 3 m grids of the big Swiss lakes
(https://data.geo.admin.ch/ch.swisstopo.swissbathy3d/, STAC collection ch.swisstopo.swissbathy3d). Each lake is one zip of 1 km ESRI ASCII tiles, heights in m a.s.l. (LN02),
EPSG:2056, no data -9999.

This script averages the 1 m cells to 20 m (the mean of the valid cells of a block weighted by their area, at least a quarter of the block valid; the tiles of a lake are 1 m, 2 m or 3 m grids) and writes one file per lake:
  data/lake-depth/<lake>.bin   'LKD1', uint32 length of the JSON header, the JSON {E0, N0 (upper left corner, LV95), step, nx, ny, unit: 0.1, nodata: -32768, name, year},
                               then the zlib-compressed int16 grid, row by row from the north, floor height in tenths of a metre a.s.l.
  data/lake-depth/index.json   the lakes with their LV95 box, for the page to choose the files
The page takes the water level from the terrain (the lake is flat there) and the depth is the water level minus this floor; where a lake has no value it floats.
Licence: NOT READ. The terms of swissBATHY3D could not be opened from here (the swisstopo pages need JavaScript, the opendata.swiss API answered 403). Do not add data/lake-depth/ to
the public build (scripts/build_site.py) before the owner has read the terms and written the result into docs/sources/ch-swissbathy3d.md.

Usage: python3 scripts/build_lake_depth.py [lake ...]   (default: the big lakes below)   Downloads go to scripts/.dem-cache/swissbathy3d (not in git).
"""
import io, json, math, os, re, struct, sys, urllib.request, zipfile, zlib
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache', 'swissbathy3d')
OUT = os.path.join(ROOT, 'data', 'lake-depth')
URL = 'https://data.geo.admin.ch/ch.swisstopo.swissbathy3d/swissbathy3d_{l}/swissbathy3d_{l}_2056_5728.esriasciigrid.zip'
ITEM = 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbathy3d/items/swissbathy3d_{l}'
UA = {'User-Agent': 'tonguesfromspace/1.0 (https://tonguesfromspace.org)'}
BIG = ['zuerichsee', 'zugersee', 'vierwaldstaettersee', 'sempachersee', 'lacleman', 'lacneuchatel', 'bielersee', 'murtensee', 'thunersee', 'brienzersee', 'lagomaggiore', 'walensee', 'bodensee']
STEP = 20


def fetch(lake):
    os.makedirs(CACHE, exist_ok=True); path = os.path.join(CACHE, f'{lake}.zip')
    if not os.path.exists(path):
        print(f'  downloading {lake} ...', flush=True)
        with urllib.request.urlopen(urllib.request.Request(URL.format(l=lake), headers=UA), timeout=300) as r, open(path + '.part', 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
        os.replace(path + '.part', path)
    return path


def read_asc(f):
    h = {}
    for _ in range(6):
        k, v = f.readline().decode().split(); h[k.lower()] = float(v)
    a = np.array(f.read().split(), dtype=np.float32)
    return h, a.reshape(int(h['nrows']), int(h['ncols']))


def build(lake):
    z = zipfile.ZipFile(fetch(lake)); tiles = []
    for info in z.infolist():
        if not info.filename.endswith('.asc'): continue
        with z.open(info) as f: h, a = read_asc(f)
        tiles.append((h, a))
    E0 = int(min(h['xllcorner'] for h, _ in tiles) // STEP * STEP); N1 = int(math.ceil(max(h['yllcorner'] + h['nrows'] * h['cellsize'] for h, _ in tiles) / STEP) * STEP)
    E1 = int(math.ceil(max(h['xllcorner'] + h['ncols'] * h['cellsize'] for h, _ in tiles) / STEP) * STEP); N0 = int(min(h['yllcorner'] for h, _ in tiles) // STEP * STEP)
    nx, ny = (E1 - E0) // STEP, (N1 - N0) // STEP
    s = np.zeros((ny, nx), np.float64); n = np.zeros((ny, nx), np.float64)      # sums weighted by the area of a cell, m²
    for h, a in tiles:
        c = int(h['cellsize']); x0, ytop = int(h['xllcorner']), int(h['yllcorner'] + a.shape[0] * c)      # the upper left corner of the tile, whole metres
        valid = a != h['nodata_value']; ys, xs = np.nonzero(valid)
        cx = (x0 + (xs + .5) * c - E0).astype(int) // STEP; cy = (N1 - ytop + (ys + .5) * c).astype(int) // STEP      # each cell goes to the block that holds its middle      # row 0 of the grid is the northernmost
        np.add.at(s, (cy, cx), a[ys, xs] * c * c); np.add.at(n, (cy, cx), c * c)
    ok = n >= STEP * STEP / 4
    g = np.full((ny, nx), -32768, np.int16); g[ok] = np.rint(s[ok] / n[ok] * 10).astype(np.int16)
    item = json.load(urllib.request.urlopen(urllib.request.Request(ITEM.format(l=lake), headers=UA), timeout=60))
    year = item['properties']['datetime'][:4]
    head = json.dumps({'E0': E0, 'N0': N1, 'step': STEP, 'nx': nx, 'ny': ny, 'unit': .1, 'nodata': -32768, 'name': lake, 'year': int(year)}, separators=(',', ':')).encode()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, lake + '.bin'), 'wb') as f: f.write(b'LKD1' + struct.pack('<I', len(head)) + head + zlib.compress(g.tobytes(), 9))
    lo = g[ok].min() / 10 if ok.any() else None
    print(f'  {lake}: {nx} x {ny} cells of {STEP} m, {int(ok.sum())} with a floor, lowest floor {lo} m a.s.l., survey {year}, file {os.path.getsize(os.path.join(OUT, lake + ".bin")) // 1024} kB')
    return {'id': lake, 'E0': E0, 'N1': N1, 'E1': E1, 'N0': N0, 'year': int(year)}


if __name__ == '__main__':
    lakes = sys.argv[1:] or BIG; idx = {}
    p = os.path.join(OUT, 'index.json')
    if os.path.exists(p): idx = {x['id']: x for x in json.load(open(p))}
    for l in lakes:
        idx[l] = build(l)
        os.makedirs(OUT, exist_ok=True); json.dump(sorted(idx.values(), key=lambda x: x['id']), open(p, 'w'), separators=(',', ':'))
