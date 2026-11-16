#!/usr/bin/env python3
"""The terrain file of Franz Josef Glacier for the 3D view (data/terrain/franz-josef.<hash>.bin and data/terrain/manifest.json), in the format of build_terrain_bundle.py (TFS1; no ice change, no bed,
no yearly surfaces: ONE measured surface, the same for every year).

Where the heights come from (the surface of the owner's "best single year", see docs/sources/nz-franz-josef.md):
  - the LINZ / Aerial Surveys West Coast LiDAR 1 m DEM (CC BY 4.0, the 4 m mosaic of the strip made in the onboarding session, elevation/linz-lidar-strip-4m.npz), bare-earth heights NZVD2016, everywhere;
  - on the glacier the newest flight day per cell of the lidar point clouds (decoded from the anonymous OpenTopography copy of the same survey, elevation/lidar-by-day-5m.npz: flights of 2022-04 to 2025-03,
    the glacier part of the strip 2024-05-22 to 2025-03-12), blended into the DEM with a 150 m feather at the 1978 outline; GLO-30 minus 5.8 m only where the DEM has no data;
  - a light Gaussian smoothing (sigma 0.7 grid cell) against lidar speckle.
Peak names from OpenStreetMap (Overpass, ODbL). Needs experiments/onboard/franz-josef/ (local) and the project venv (numpy, scipy, shapely, pyproj, rasterio).
Usage (repo root): experiments/aletsch-yearly-dem/.venv/bin/python -W ignore scripts/build_dem_newzealand.py
"""
import json, math, os, sys, struct, zlib, datetime
import numpy as np
from scipy.ndimage import map_coordinates, distance_transform_edt, gaussian_filter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain_lib as tl
import terrain_names as tn
from shapely.geometry import shape
from shapely.ops import transform as T
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
import rasterio
from rasterio.windows import from_bounds

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); S = os.path.join(ROOT, 'experiments', 'onboard', 'franz-josef')
st0 = json.load(open(os.path.join(S, 'session.json')))['steps']['strip']['params']
tip, az0, UP, BACK, HALF = st0['tip'], st0['azimuth'], st0['up'], st0['back'], st0['half']
merc, unmerc = tl.merc, tl.unmerc
px, py = merc(*tip); k = 1 / math.cos(math.radians(tip[0])); ue, un = math.sin(math.radians(az0)), math.cos(math.radians(az0))
ln = UP + BACK; nA = 2 * round(ln / 28); nB = 4 * round(2 * HALF / 14.08 / 4)
print(f'strip {ln} m long, grid {nB + 1} x {nA + 1}')
rows = np.arange(nA + 1); cols = np.arange(nB + 1)
a = UP - rows * ln / nA; b = -HALF + cols * 2 * HALF / nB
A_, B_ = np.meshgrid(a, b, indexing='ij')
lat, lon = np.vectorize(unmerc)(px + (A_ * ue + B_ * un) * k, py + (A_ * un - B_ * ue) * k)
E, N = Transformer.from_crs(4326, 2193, always_xy=True).transform(lon, lat)
# DEM
w = np.load(os.path.join(S, 'elevation', 'linz-lidar-strip-4m.npz')); WC = w['wc'].astype('float64'); wx0, wy1, wr = float(w['x0']), float(w['y1']), float(w['res'])
dem = map_coordinates(WC, [(wy1 - N) / wr - .5, (E - wx0) / wr - .5], order=1, mode='constant', cval=np.nan)
# glacier composite of the newest flight day per 5 m cell
d = np.load(os.path.join(S, 'elevation', 'lidar-by-day-5m.npz')); days = list(d['days']); Zd = d['zsum'] / np.maximum(d['n'], 1); ok = d['n'] >= 3
Am = np.full(ok.shape[1:], np.nan); AD = np.full(ok.shape[1:], -1)
for kk in range(len(days)): Am[ok[kk]] = Zd[kk][ok[kk]]; AD[ok[kk]] = kk
x0, y1, res = float(d['x0']), float(d['y1']), float(d['res'])
at = lambda arr, order=1, cval=0.0: map_coordinates(arr, [(y1 - N) / res - .5, (E - x0) / res - .5], order=order, mode='constant', cval=cval)
comp = at(np.where(np.isfinite(Am), Am, 0)); val = at(np.isfinite(Am).astype('float64')); comp = np.where(val > 0.99, comp / np.maximum(val, 1e-9), np.nan)
inv = Transformer.from_crs(4326, 2193, always_xy=True).transform
g78 = T(inv, shape([f for f in json.load(open(os.path.join(S, 'outlines.geojson')))['features'] if f['properties']['key'] == 'glims-1978'][0]['geometry']))
mk = rasterize([(g78.buffer(0), 1)], out_shape=Am.shape, transform=from_origin(x0, y1, res, res), dtype='uint8').astype(bool)
wgt = at(np.clip(1 - distance_transform_edt(~mk) * res / 150, 0, 1))
z = np.where(np.isfinite(dem), dem, np.nan); both = np.isfinite(comp) & np.isfinite(dem)
z = np.where(both, wgt * comp + (1 - wgt) * dem, np.where(np.isfinite(comp) & (wgt > 0.5), comp, z))
miss = ~np.isfinite(z)
if miss.any():
    with rasterio.open('/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S44_00_E170_00_DEM/Copernicus_DSM_COG_10_S44_00_E170_00_DEM.tif') as g:
        wd = from_bounds(lon.min() - .01, lat.min() - .01, lon.max() + .01, lat.max() + .01, g.transform); arr = g.read(1, window=wd, boundless=True, fill_value=np.nan).astype('float64'); wt = g.window_transform(wd)
    glo = map_coordinates(arr, [(lat - wt.f) / wt.e - .5, (lon - wt.c) / wt.a - .5], order=1, mode='nearest') - 5.8; z = np.where(miss, glo, z)
z = gaussian_filter(z, 0.7)
dd = np.round(at(AD.astype('float64'), order=0, cval=-1)).astype(int); gl = (wgt > 0.99) & (dd >= 0); flights = sorted({days[i] for i in dd[gl]})
print('nodes', z.size, 'GLO-30 fill', int(miss.sum()), 'flights in the glacier surface', flights, 'height range', float(z.min()), float(z.max()))
jt = int(UP / ln * nA + 0.5); h0 = float(z[jt, nB // 2])
q = np.rint((z - h0) * 10).astype(np.int64); assert q.min() > -32768 and q.max() < 32767
def packed(arr):
    flat = np.concatenate([arr[:, :1], np.diff(arr, axis=1)], axis=1).astype('<i2'); return flat.tobytes()
st = {'P': (px, py), 'k': k, 'ue': ue, 'un': un, 'up': UP, 'back': BACK, 'half': HALF}
at_ = lambda aa, bb: float(z[min(nA, max(0, round((UP - aa) / ln * nA))), min(nB, max(0, round((bb + HALF) / (2 * HALF) * nB)))]) - h0 / 1.0 + 0
try: names = tn.names_for('nz', st, lambda aa, bb: float(z[min(nA, max(0, round((UP - aa) / ln * nA))), min(nB, max(0, round((bb + HALF) / (2 * HALF) * nB)))]), [(0.0, 0.0)]); print('names:', [n['text'] for n in names])
except Exception as e: names = []; print('names failed:', e)
head = {'v': 1, 'id': 'franz-josef', 'P': [px, py], 'k': k, 'ue': ue, 'un': un, 'up': UP, 'back': BACK, 'nA': nA, 'nB': nB, 'h0': h0, 'dem': None, 'half': HALF, 'tex': [1024, 2048], 'names': names, 'namesSource': 'OpenStreetMap', 'radar': [],
        'lidar': {'flights': flights, 'source': 'LINZ / Aerial Surveys West Coast LiDAR 1 m DEM and point clouds'}, 'built': datetime.date.today().isoformat()}
payload = zlib.compress(packed(q), 9)
name, size = tl.write_bundle('franz-josef', head, payload); print('wrote', name, size // 1024, 'KB')
