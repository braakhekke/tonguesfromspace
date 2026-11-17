#!/usr/bin/env python3
"""The terrain file of Mer de Glace for the 3D view (data/terrain/mer-de-glace.<hash>.bin and data/terrain/manifest.json), in the format of build_terrain_bundle.py (TFS1): the heights of the strip,
a MODELLED ice surface for every year (header `yearly`, `modelled: 1`) and a MODEL bed (header `bed`: the data-assimilated ice-flow model of Cook et al. 2023, CC BY 4.0: bed = its surface minus its ice thickness, 100 m cells, bilinear
onto the 14 m grid; clamped so that no surface lies below it), no ice change, no radar.

Where the heights come from (the onboarding session, docs/sources/fr-mer-de-glace.md, experiments/onboard/mer-de-glace/elevation/yearly/):
  - the yearly surfaces 2013 to 2026 of build_yearly.py: the IGN LiDAR HD surface model of 2022 (anchor day 2022-07-18) moved to the day of each year's picture with the Pleiades change grids and the glacier-wide
    balance; MODELLED, not measured, see summary.json (grade A to D, sigma);
  - where the lidar grid has no height (beyond its edge): Copernicus GLO-30 shifted by the median offset on non-ice nodes (static).
Peak names from OpenStreetMap (Overpass, ODbL). Needs experiments/onboard/mer-de-glace/ (local) and the project venv (numpy, scipy, rasterio, pyproj).
Usage (repo root): experiments/aletsch-yearly-dem/.venv/bin/python -W ignore scripts/build_dem_france.py
"""
import json, math, os, sys, zlib, datetime
import numpy as np
from scipy.ndimage import map_coordinates
from pyproj import Transformer
import rasterio
from rasterio.windows import from_bounds
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain_lib as tl
import terrain_names as tn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); S = os.path.join(ROOT, 'experiments', 'onboard', 'mer-de-glace'); Y = os.path.join(S, 'elevation', 'yearly')
st0 = json.load(open(os.path.join(S, 'session.json')))['steps']['strip']['params']
tip, az0, UP, BACK, HALF = st0['tip'], st0['azimuth'], st0['up'], st0['back'], st0['half']
merc, unmerc = tl.merc, tl.unmerc
px, py = merc(*tip); k = 1 / math.cos(math.radians(tip[0])); ue, un = math.sin(math.radians(az0)), math.cos(math.radians(az0))
ln = UP + BACK; nA = 2 * round(ln / 28); nB = 4 * round(2 * HALF / 14.08 / 4)
print(f'strip {ln} m long, grid {nB + 1} x {nA + 1}')
a = UP - np.arange(nA + 1) * ln / nA; b = -HALF + np.arange(nB + 1) * 2 * HALF / nB
A_, B_ = np.meshgrid(a, b, indexing='ij')
lat, lon = np.vectorize(unmerc)(px + (A_ * ue + B_ * un) * k, py + (A_ * un - B_ * ue) * k)
E, N = Transformer.from_crs(4326, 2154, always_xy=True).transform(lon, lat)
d = np.load(os.path.join(Y, 'yearly-surfaces-10m.npz')); x0, y1, res = float(d['x0']), float(d['y1']), float(d['res'])
samp = lambda arr, order=1: map_coordinates(arr.astype('float64'), [(y1 - N) / res - .5, (E - x0) / res - .5], order=order, mode='constant', cval=np.nan)
with rasterio.open(os.path.join(S, 'research', 'Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif')) as g:
    w = from_bounds(lon.min() - .01, lat.min() - .01, lon.max() + .01, lat.max() + .01, g.transform); arr = g.read(1, window=w, boundless=True, fill_value=np.nan).astype('float64'); wt = g.window_transform(w)
GLO = map_coordinates(arr, [(lat - wt.f) / wt.e - .5, (lon - wt.c) / wt.a - .5], order=1, mode='nearest')
anchor = samp(d['anchor']); icen = samp(d['ice'].astype('float32')) > .5; ok = np.isfinite(anchor) & ~icen & np.isfinite(GLO); off = float(np.median((GLO - anchor)[ok]))
print('GLO-30 offset on non-ice nodes: %.2f m' % off)
summ = json.load(open(os.path.join(Y, 'summary.json'))); sess = json.load(open(os.path.join(S, 'session.json')))
picks = sess['steps']['scenes']['params']['picks']
years = [int(y) for y in d['years'] if int(y) != 2012]      # 2012 (the Pleiades stereo date) has no picked image
fill = lambda z: np.where(np.isfinite(z), z, GLO - off)
heights = fill(anchor); surf = [fill(samp(d['z%d' % y])) for y in years]
def kind(m):
    t = m['kind']
    for key, v in (('Pleiades stereo', 'tied'), ('inside the Pleiades', 'scaled'), ('interpolated', 'interpolated'), ('tied to the 2022', 'tied'), ('extrapolated', 'extrapolated'), ('estimate', 'estimate')):
        if t.startswith(key) or key in t[:30]: return v
    raise SystemExit('unknown kind: ' + t)
kinds = [kind(summ['years'][str(y)]) for y in years]; dates = [summ['years'][str(y)]['image_date'] for y in years]
allz = np.stack([heights] + surf); print('height range', float(allz.min()), float(allz.max()), 'kinds', dict(zip(years, kinds)))
# the model bed: Cook et al. (2023), Zenodo 8037002, initial optimised state of cluster C3 (the OGGM server copy geology-optimizedC3DF.nc, 100 m, UTM 32N): bed = usurf - thk where the model has ice, else the surface
import xarray as xr
cd = xr.open_dataset(os.path.join(S, 'research', 'cook23', 'geology-optimizedC3DF.nc'), engine='h5netcdf'); cx, cy = cd.x.values.astype(float), cd.y.values.astype(float)
ux, uy = Transformer.from_crs(4326, 32632, always_xy=True).transform(lon, lat)
cs = lambda arr: map_coordinates(np.nan_to_num(arr.astype('float64')), [(uy - cy[0]) / (cy[1] - cy[0]), (ux - cx[0]) / (cx[1] - cx[0])], order=1, mode='constant', cval=0.0)
thk_c, us_c = cs(cd.thk.values), cs(cd.usurf.values); has_ice = thk_c > 1.0
bed = np.where(has_ice, us_c - thk_c, heights); bed = np.minimum(bed, np.minimum.reduce([heights] + surf))
print('bed: nodes with model ice %d of %d, max model thickness %.0f m' % (has_ice.sum(), has_ice.size, thk_c.max()))
jt = int(UP / ln * nA + 0.5); h0 = float(heights[jt, nB // 2])
q = lambda z: np.rint((z - h0) * 10).astype(np.int64)
for z in list(allz) + [bed]: assert q(z).min() > -32768 and q(z).max() < 32767
def packed(arr):
    flat = np.concatenate([arr[:, :1], np.diff(arr, axis=1)], axis=1).astype('<i2'); return flat.tobytes()
st = {'P': (px, py), 'k': k, 'ue': ue, 'un': un, 'up': UP, 'back': BACK, 'half': HALF}
H = q(heights); at_ = lambda aa, bb: float(H[min(nA, max(0, round((UP - aa) / ln * nA))), min(nB, max(0, round((bb + HALF) / (2 * HALF) * nB)))]) / 10
try: names = tn.names_for('fr', st, at_, [(0.0, 0.0)]); print('names:', [n['text'] for n in names])
except Exception as e: names = []; print('names failed:', e)
yearly = {'years': years, 'kind': kinds, 'dates': dates, 'modelled': 1, 'grade': [summ['years'][str(y)]['grade'] for y in years], 'sigma': [summ['years'][str(y)]['sigma_m'] for y in years], 'provenance': 'data/yearly/mer-de-glace.json'}
bedmeta = {'name': 'Cook et al. 2023', 'how': 'the surface minus the ice thickness of the data-assimilated ice-flow model of Cook et al. (2023), 100 m cells, CC BY 4.0', 'credit': 'Cook et al. (2023), ice-flow model bed (CC BY 4.0)', 'source': 'Zenodo 8037002, cluster C3', 'none': int((~has_ice).sum())}
head = {'v': 1, 'id': 'mer-de-glace', 'P': [px, py], 'k': k, 'ue': ue, 'un': un, 'up': UP, 'back': BACK, 'nA': nA, 'nB': nB, 'h0': h0, 'dem': None, 'half': HALF, 'tex': [1024, 2048], 'yearly': yearly, 'bed': bedmeta, 'names': names, 'namesSource': 'OpenStreetMap', 'radar': [],
        'built': datetime.date.today().isoformat()}
payload = zlib.compress(packed(H) + b''.join(packed(q(z)) for z in surf) + packed(q(bed)), 9)
name, size = tl.write_bundle('mer-de-glace', head, payload); print('wrote', name, size // 1024, 'KB')
