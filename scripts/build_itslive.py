#!/usr/bin/env python3
"""Ice speed of every glacier of the site, for the map layer "Ice speed", the click history and the "Ice speed" card.

Source: ITS_LIVE annual mosaics of image pair velocities, version 2.1 (the product's own title and version; 120 m; one mosaic per RGI region of the world; NASA MEaSUREs
ITS_LIVE; https://its-live.jpl.nasa.gov; licence as the catalogue https://stac.itslive.cloud states it, CC-BY-4.0). The speed `v` of the product is copied, not recomputed:
the script cuts the picture box of each glacier out of its region's mosaic, puts it on a Web Mercator grid (nearest cell, cells of CELL Mercator metres) and stores it as
0.1 m/yr steps in 16 bits (65535 = no value), zlib + base64, one array per year. A year is the product's year, not a balance year.
(Version 2 of the same product, the one the site used before, differs: for Aletsch 2020 the cells differ by 0.45 m/yr on average and by up to 60 m/yr.)

Download: the yearly region mosaics are Cloud Optimized GeoTIFFs (https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2.1/annual/cog/). Reading small windows of them over
HTTP needs very many round trips (hours for the ice caps), so each file is downloaded once into scripts/.itslive-cache (gitignored; 50 to 500 MB a file; delete the folder
when all glaciers of the region are built) and every glacier of the region is cut out of the local copy. Which mosaic holds a glacier is not hard-coded: the candidates are the
RGI regions of the STAC catalogue whose bounding box contains the picture box, smallest first, and the first one that has speeds in the box is used (written into the file
as `rgi`). The grid of each mosaic (UTM zone, polar stereographic) is read from the file. RGI regions without annual mosaics (13, 15, 16) leave their glaciers without a file:
say so in data/audit-exceptions.json. Years: 2013 to 2024 unless --from / --to say otherwise (the mosaics of Iceland, Svalbard, Norway and others reach back to the 1980s;
the files grow with every year).

Only the glacier: of the box, cells are kept that have at least SPEED_MIN m/yr in some year AND are joined (8 neighbours) to the flowline; everything else is stored as no
value, and the stored grid is cropped to what is left (plus a margin). So a neighbouring glacier or ice cap in the same picture box is not in the file, and the file stays small.

Flowline: the "fastest ice" figure of the page is the highest speed along a flowline, not the highest single cell (a single cell can be a bad match at an icefall or in shadow).
The flowline starts at the tongue tip of the record and follows the direction of the ice upstream, step by step (FLOW_STEP m), in the mean of the product's own `vx` and `vy` of
three of the years built (smoothed over 3 x 3 cells); where the ice is not measured it keeps its direction (the first one is the azimuth of the 3D strip); it ends when the speed
has been under SPEED_MIN for FLOW_SLOW steps in a row after having been above it, when the data end, or at FLOW_MAX steps. It is stored as `flow`, Web Mercator metres, one point
every FLOW_STEP m (on the ground); the page takes the running median of FLOW_MED points of each year's speed along it and shows the highest.

Output: data/itslive/<box key>.json  {id, source, rgi, version, bbox [x0, y0, x1, y1] (EPSG:3857 m), w, h, cell, years, step, nodata, flow [[x, y], ...], data: {year: base64}}.
Needs numpy, rasterio and pyproj (pip install numpy rasterio pyproj).
Usage: python3 scripts/build_itslive.py [--id B36-26 breidamerkurjokull ...] [--region ch] [--from 2013] [--to 2024] [--out DIR] [--list]
  --list    print which glaciers have a file and which do not, change nothing
"""
import argparse, base64, collections, functools, json, math, os, sys, urllib.error, urllib.request, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'itslive')
CACHE = os.path.join(ROOT, 'scripts', '.itslive-cache')
STAC = 'https://stac.itslive.cloud/collections/velocity-mosaics/items?limit=1000'
COG = 'https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2.1/annual/cog/ITS_LIVE_velocity_120m_{rgi}_{y}_V02.1_{var}.tif'
VERSION = '2.1'
CELL = 170.0
STEP = 0.1
NODATA = 65535
R = 6378137.0
FROM, TO = 2013, 2024
FLOW_STEP, FLOW_SLOW, FLOW_MAX, FLOW_MED, SPEED_MIN = 60.0, 25, 700, 7, 5      # metres between flowline points; steps under SPEED_MIN that end it; longest line (42 km); points of the running median (the page); the page's noise floor
MARGIN = 3                                                                          # cells kept around the glacier's moving ice


def boxes():
    """{key: (region, [x0, y0, x1, y1] in EPSG:3857 m, tip [lat, lon], azimuth of the 3D strip or None)} of every glacier of data/boxes.js (generated from the records)."""
    t = open(os.path.join(ROOT, 'data', 'boxes.js'), encoding='utf-8').read()
    j = json.loads(t[t.index('{', t.index('GLACIER_BOXES')):t.rindex('}') + 1])
    return {k: (v['region'], v['derived']['bbox'], v['tip'], v['strip3d']['azimuth'] if v.get('strip3d') else None) for k, v in j['glaciers'].items()}


@functools.lru_cache(maxsize=1)
def catalogue():
    with urllib.request.urlopen(STAC, timeout=120) as r:
        return json.load(r)['features']


def candidates(lon, lat):
    """RGI regions of the ITS_LIVE catalogue whose bounding box holds the point, smallest box first."""
    seen = {}
    for f in catalogue():
        p = f['properties']
        if p.get('temporal_coverage_type') != 'annual' or p['rgi'] in seen: continue
        w, s, e, n = f['bbox']
        if w <= lon <= e and s <= lat <= n: seen[p['rgi']] = (e - w) * (n - s)
    return sorted(seen, key=seen.get)


def local(rgi, year, var='v'):
    """The path of one region mosaic file in the cache, downloaded first if it is not there; None when the product has no such file."""
    url = COG.format(rgi=rgi, y=year, var=var); path = os.path.join(CACHE, os.path.basename(url))
    if os.path.exists(path): return path
    os.makedirs(CACHE, exist_ok=True)
    try:
        print(f'  downloading {os.path.basename(url)}', flush=True)
        urllib.request.urlretrieve(url, path + '.part'); os.replace(path + '.part', path); return path
    except urllib.error.HTTPError as e:
        if e.code in (403, 404): return None
        raise


def merc_to_lonlat(x, y):
    import numpy as np
    return np.degrees(x / R), np.degrees(2 * np.arctan(np.exp(y / R)) - np.pi / 2)


def window(src, tr, bbox, w, h):
    """The cells of the Web Mercator grid of one glacier as (row, column) in the mosaic `src`, and the window that holds them."""
    import numpy as np
    from rasterio.windows import Window
    x0, _, _, y1 = bbox
    mx = x0 + (np.arange(w) + .5) * CELL; my = y1 - (np.arange(h) + .5) * CELL          # rows run north to south
    ux, uy = tr.transform(*np.meshgrid(mx, my))
    a = src.transform
    col = np.floor((ux - a.c) / a.a).astype(int); row = np.floor((uy - a.f) / a.e).astype(int)
    ok = (col >= 0) & (col < src.width) & (row >= 0) & (row < src.height)
    if not ok.any(): return None
    c0, c1, r0, r1 = col[ok].min(), col[ok].max() + 1, row[ok].min(), row[ok].max() + 1
    return row, col, ok, Window(c0, r0, c1 - c0, r1 - r0)


def read_year(rgi, year, grid, var='v'):
    """The values (nan = no value) of one glacier in one year, or None when the mosaic has no such year."""
    import numpy as np, rasterio
    from pyproj import Transformer
    path = local(rgi, year, var)
    if not path: return None
    with rasterio.open(path) as src:
        tr = Transformer.from_crs(3857, src.crs, always_xy=True)
        win = window(src, tr, grid['bbox'], grid['w'], grid['h'])
        if win is None: return np.full((grid['h'], grid['w']), np.nan)
        row, col, ok, wd = win
        block = src.read(1, window=wd, masked=True).astype('float64').filled(np.nan)
        vv = np.full(row.shape, np.nan)
        vv[ok] = block[row[ok] - int(wd.row_off), col[ok] - int(wd.col_off)]
        return vv


def smooth3(a):
    """3 x 3 mean of the cells that have a value (nan where none has)."""
    import numpy as np
    p = np.pad(a, 1, constant_values=np.nan); st = np.stack([p[i:i + a.shape[0], j:j + a.shape[1]] for i in range(3) for j in range(3)])
    n = np.isfinite(st).sum(0)
    return np.where(n > 0, np.where(np.isfinite(st), st, 0).sum(0) / np.maximum(n, 1), np.nan)


def flowline(rgi, years, grid, tip, azimuth):
    """[[x, y]] in EPSG:3857 m from the tip upstream along the mean flow direction of three of the years (see the header); [] when there is no flow field."""
    import numpy as np, rasterio
    from pyproj import Transformer
    pick = sorted({years[len(years) // 4], years[len(years) // 2], years[3 * len(years) // 4]})
    sums = {'vx': 0, 'vy': 0}; cnt = {'vx': 0, 'vy': 0}; info = None
    for y in pick:
        px, py = local(rgi, y, 'vx'), local(rgi, y, 'vy')
        if not px or not py: continue
        with rasterio.open(px) as src:
            tr = Transformer.from_crs(3857, src.crs, always_xy=True)
            win = window(src, tr, grid['bbox'], grid['w'], grid['h'])
            if win is None: continue
            info = (win[3], src.transform, src.crs)
        for c, path in (('vx', px), ('vy', py)):
            with rasterio.open(path) as q:
                b = q.read(1, window=info[0], masked=True).astype('float64').filled(np.nan)
            sums[c] = sums[c] + np.where(np.isfinite(b), b, 0); cnt[c] = cnt[c] + np.isfinite(b)
    if info is None: return []
    wd, a, crs = info
    with np.errstate(invalid='ignore', divide='ignore'):
        VX = smooth3(np.where(cnt['vx'] > 0, sums['vx'] / cnt['vx'], np.nan)); VY = smooth3(np.where(cnt['vy'] > 0, sums['vy'] / cnt['vy'], np.nan))
    sp = np.hypot(VX, VY)
    fwd = Transformer.from_crs(4326, crs, always_xy=True); back = Transformer.from_crs(crs, 3857, always_xy=True)
    lat, lon = tip; x, y = fwd.transform(lon, lat)
    d = np.array([0.0, 1.0])
    if azimuth is not None:                                    # the direction up the glacier, from the 3D strip: only the first guess
        az = math.radians(azimuth); x1, y1 = fwd.transform(lon + math.sin(az) * 100 / (111320 * math.cos(math.radians(lat))), lat + math.cos(az) * 100 / 111320)
        d = np.array([x1 - x, y1 - y]); d /= np.hypot(*d)
    pts, seen, slow, bad = [], False, 0, 0
    for _ in range(FLOW_MAX):
        pts.append((x, y))
        col = int(math.floor((x - a.c) / a.a)) - int(wd.col_off); row = int(math.floor((y - a.f) / a.e)) - int(wd.row_off)
        if not (0 <= row < VX.shape[0] and 0 <= col < VX.shape[1]): break
        s_ = sp[row, col]
        if np.isfinite(s_) and s_ > 0:
            bad = 0; seen = seen or s_ >= SPEED_MIN; slow = slow + 1 if s_ < SPEED_MIN else 0
            u = -np.array([VX[row, col], VY[row, col]]) / s_      # upstream
            if s_ >= SPEED_MIN and u @ d > 0: d = u / np.hypot(*u)      # under SPEED_MIN the direction is noise (stagnant tongue end), and a turn of more than 90 degrees in one step is noise: keep it
        else:
            bad += 1
            if bad > FLOW_SLOW: break
        if seen and slow >= FLOW_SLOW: break
        x += d[0] * FLOW_STEP; y += d[1] * FLOW_STEP
    mx, my = back.transform(np.array([p[0] for p in pts]), np.array([p[1] for p in pts]))
    return [[int(round(u)), int(round(v))] for u, v in zip(mx, my)]


def pack(vv):
    import numpy as np
    return np.where(np.isfinite(vv) & (vv >= 0), np.minimum(np.round(vv / STEP), NODATA - 1), NODATA).astype('<u2')


def glacier_only(stack, flow, grid):
    """The cells of the glacier: fast enough in some year and joined to the flowline. Returns (boolean mask of the grid, the cropped window (r0, r1, c0, c1)) or None."""
    import numpy as np
    with np.errstate(invalid='ignore'):
        fast = np.nanmax(np.where(np.isfinite(stack), stack, -1), axis=0) >= SPEED_MIN
    x0, _, _, y1 = grid['bbox']; h, w = fast.shape
    seeds = {(int((y1 - Y) // CELL), int((X - x0) // CELL)) for X, Y in flow}
    todo = collections.deque(s for s in seeds if 0 <= s[0] < h and 0 <= s[1] < w and fast[s]); keep = np.zeros_like(fast)
    for s in todo: keep[s] = True
    while todo:
        r, c = todo.popleft()
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if 0 <= rr < h and 0 <= cc < w and fast[rr, cc] and not keep[rr, cc]: keep[rr, cc] = True; todo.append((rr, cc))
    if not keep.any(): return None
    rows, cols = np.where(keep)
    return keep, (max(0, rows.min() - MARGIN), min(h, rows.max() + 1 + MARGIN), max(0, cols.min() - MARGIN), min(w, cols.max() + 1 + MARGIN))


def build(key, bbox, tip, azimuth, years, out):
    import numpy as np
    x0, y0, x1, y1 = bbox
    w, h = math.ceil((x1 - x0) / CELL), math.ceil((y1 - y0) / CELL)
    grid = dict(bbox=[x0, y1 - h * CELL, x0 + w * CELL, y1], w=w, h=h)
    lon, lat = merc_to_lonlat((x0 + x1) / 2, (y0 + y1) / 2)
    rgi = None
    for cand in candidates(float(lon), float(lat)):          # the first region that has speeds in the box
        for y in (2020, 2019, 2021, 2018, 2022, 2017):
            vv = read_year(cand, y, grid)
            if vv is not None and np.isfinite(vv).any(): rgi = cand; break
        if rgi: break
    if not rgi:
        print(f'{key}: no ITS_LIVE annual mosaic has speeds in its picture box ({lon:.3f}, {lat:.3f}): excuse it in data/audit-exceptions.json'); return False
    got = {y: read_year(rgi, y, grid) for y in years}
    got = {y: v for y, v in got.items() if v is not None}       # the mosaic has no such year otherwise
    if not got:
        print(f'{key}: {rgi} has none of the years {years[0]} to {years[-1]}'); return False
    ys = sorted(got)
    flow = flowline(rgi, ys, grid, tip, azimuth)
    sel = glacier_only(np.stack([got[y] for y in ys]), flow, grid)
    if sel is None:
        print(f'{key}: {rgi}: no ice of {SPEED_MIN} m/yr or more is joined to the flowline ({len(flow)} points): check the tip in the record'); return False
    keep, (r0, r1, c0, c1) = sel
    data = {}
    for y in ys:
        v = np.where(keep, got[y], np.nan)[r0:r1, c0:c1]
        data[str(y)] = base64.b64encode(zlib.compress(pack(v).tobytes(), 9)).decode()
    cw, ch = c1 - c0, r1 - r0; gx0, gy1 = grid['bbox'][0] + c0 * CELL, grid['bbox'][3] - r0 * CELL
    doc = {'id': key, 'source': f'ITS_LIVE annual mosaics of image pair velocities v{VERSION} ({rgi}, 120 m), NASA MEaSUREs ITS_LIVE', 'rgi': rgi, 'version': VERSION,
           'bbox': [gx0, gy1 - ch * CELL, gx0 + cw * CELL, gy1], 'w': cw, 'h': ch, 'cell': CELL, 'years': ys, 'step': STEP, 'nodata': NODATA, 'flow': flow, 'data': data}
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f'{key}.json')
    with open(path, 'w') as f: json.dump(doc, f, separators=(',', ':'))
    print(f'{key}: {rgi} {ys[0]}-{ys[-1]} ({len(ys)} years), {cw} x {ch} cells of {w} x {h}, {round(os.path.getsize(path) / 1024)} kB, flowline {len(flow)} points ({len(flow) * FLOW_STEP / 1000:.1f} km)', flush=True)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', nargs='*'); ap.add_argument('--region'); ap.add_argument('--from', dest='y0', type=int, default=FROM); ap.add_argument('--to', dest='y1', type=int, default=TO)
    ap.add_argument('--out', default=OUT); ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    todo = {k: b for k, b in boxes().items() if (not a.id or k in a.id) and (not a.region or b[0] == a.region)}
    if a.list:
        for k in todo: print(f'{k}: {"file" if os.path.exists(os.path.join(a.out, k + ".json")) else "NO FILE"}')
        return
    missing = [k for k in (a.id or []) if k not in todo]
    if missing: sys.exit(f'not in data/boxes.js: {", ".join(missing)}')
    years = list(range(a.y0, a.y1 + 1))
    bad = [k for k, b in todo.items() if not build(k, b[1], b[2], b[3], years, a.out)]
    if bad: print(f'\nno file for: {", ".join(bad)}')


if __name__ == '__main__':
    main()
