#!/usr/bin/env python3
"""Ice speed of the ten Swiss glaciers, for the map layer "Ice speed".

Source: ITS_LIVE annual velocity mosaics, version 2, 120 m, region RGI11A (Central Europe), 2013 to 2022 (NASA MEaSUREs ITS_LIVE; Gardner et al.;
https://its-live.jpl.nasa.gov; CC BY 4.0). The speed `v` of the product is copied, not recomputed: the script only cuts the picture box of each glacier
out of the Alps mosaic, puts it on a Web Mercator grid (nearest cell, cells of CELL Mercator metres, about 118 m on the ground at 46.5 degrees north)
and stores it as 0.1 m/yr steps in 16 bits (65535 = no value), zlib + base64, one array per year. The page draws it as an image on the map.
The mosaics are of image pairs of Landsat 8/9, Sentinel-2 and Sentinel-1 (the product's own description), a year is the product's year, not a balance year.

Output: data/itslive/<SGI id>.json  {id, source, bbox [x0, y0, x1, y1] (EPSG:3857 m), w, h, cell, years, step, nodata, data: {year: base64}}.
Needs numpy and netCDF4 (pip install numpy netCDF4). Downloads 70 MB per year into scripts/.itslive-cache (gitignored, 700 MB; delete it afterwards if you like).
Usage: python3 scripts/build_itslive.py [--id B36-26 ...]
"""
import argparse, base64, json, math, os, re, urllib.request, zlib
import numpy as np
from netCDF4 import Dataset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.itslive-cache')
OUT = os.path.join(ROOT, 'data', 'itslive')
URL = 'https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2/annual/ITS_LIVE_velocity_120m_RGI11A_{y}_v02.nc'
YEARS = range(2013, 2023)
CELL = 170.0
STEP = 0.1
NODATA = 65535
R = 6378137.0

def merc_to_lonlat(x, y):
    return np.degrees(x / R), np.degrees(2 * np.arctan(np.exp(y / R)) - np.pi / 2)

def utm32(lon, lat):      # WGS84, zone 32 (central meridian 9 degrees E), the grid of the mosaics (EPSG:32632)
    a = 6378137.0; f = 1 / 298.257223563; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    p = np.radians(lat); l = np.radians(lon) - np.radians(9)
    N = a / np.sqrt(1 - e2 * np.sin(p) ** 2); T = np.tan(p) ** 2; C = ep2 * np.cos(p) ** 2; A = np.cos(p) * l
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * np.sin(2 * p)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * np.sin(4 * p) - (35 * e2 ** 3 / 3072) * np.sin(6 * p))
    x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    y = k0 * (M + N * np.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return x, y

def mosaic(year):
    path = os.path.join(CACHE, f'RGI11A_{year}.nc')
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True); print('downloading', year, flush=True)
        urllib.request.urlretrieve(URL.format(y=year), path + '.part'); os.replace(path + '.part', path)
    return Dataset(path)

def boxes():
    t = open(os.path.join(ROOT, 'data', 'boxes.js'), encoding='utf-8').read()
    j = json.loads(t[t.index('{', t.index('GLACIER_BOXES')):t.rindex('}') + 1])
    return {k: v['derived']['bbox'] for k, v in j['glaciers'].items() if v['region'] == 'ch'}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', nargs='*'); a = ap.parse_args()
    todo = {k: b for k, b in boxes().items() if not a.id or k in a.id}
    grids = {}
    for k, (x0, y0, x1, y1) in todo.items():
        w, h = math.ceil((x1 - x0) / CELL), math.ceil((y1 - y0) / CELL)
        mx = x0 + (np.arange(w) + .5) * CELL; my = y1 - (np.arange(h) + .5) * CELL          # rows run north to south
        lon, lat = merc_to_lonlat(*np.meshgrid(mx, my)); ux, uy = utm32(lon, lat)
        grids[k] = dict(bbox=[x0, y1 - h * CELL, x0 + w * CELL, y1], w=w, h=h, ux=ux, uy=uy, data={})
    for year in YEARS:
        ds = mosaic(year); X = ds['x'][:]; Y = ds['y'][:]; V = ds['v']
        for k, g in grids.items():
            ix = np.round((g['ux'] - X[0]) / (X[1] - X[0])).astype(int); iy = np.round((g['uy'] - Y[0]) / (Y[1] - Y[0])).astype(int)
            i0, i1, j0, j1 = ix.min(), ix.max() + 1, iy.min(), iy.max() + 1      # only the window of the glacier is read from the 1 GB grid
            block = np.ma.filled(V[j0:j1, i0:i1].astype(np.float64), np.nan)
            vv = block[iy - j0, ix - i0]
            q = np.where(np.isfinite(vv) & (vv >= 0), np.minimum(np.round(vv / STEP), NODATA - 1), NODATA).astype('<u2')
            g['data'][year] = base64.b64encode(zlib.compress(q.tobytes(), 9)).decode()
        ds.close(); print(year, 'done', flush=True)
    os.makedirs(OUT, exist_ok=True)
    for k, g in grids.items():
        doc = {'id': k, 'source': 'ITS_LIVE annual velocity mosaics v2 (RGI11A, 120 m), NASA MEaSUREs ITS_LIVE, CC BY 4.0', 'bbox': g['bbox'], 'w': g['w'], 'h': g['h'], 'cell': CELL,
               'years': list(YEARS), 'step': STEP, 'nodata': NODATA, 'data': {str(y): d for y, d in g['data'].items()}}
        with open(os.path.join(OUT, f'{k}.json'), 'w') as f: json.dump(doc, f, separators=(',', ':'))
        print(k, g['w'], 'x', g['h'], round(os.path.getsize(os.path.join(OUT, f'{k}.json')) / 1024), 'kB')

if __name__ == '__main__':
    main()
