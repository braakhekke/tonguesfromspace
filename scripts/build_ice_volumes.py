#!/usr/bin/env python3
"""Ice volume of each Swiss glacier of the size page (the 3D ice cube): data/ice-volumes.json.

Volume: Summary.shp of Grab & Melchior (2020), SwissGlacierThickness-R2020 (DOI 10.3929/ethz-b-000434697, CC BY 4.0),
field V_2016 ("Ice volume (km3) homogenised for the year 2016"), copied as stored (km3); V_year and year_mode likewise.
Volume change: data/glaciers.js `volume` (GLAMOS Swiss Glacier Volume Change, non-commercial): dV_km3 between the two
surveys `from` and `to`. `at`: lat, lon of the middle of the glacier: the point of the 2023 outline (SGI2023, data/glaciers.js) farthest from the
edge of the outline, in its biggest piece (computed here, 20 m grid). A block of ice is put there, clear of the neighbouring glaciers.

Usage: python3 scripts/build_ice_volumes.py <folder with 01_Summary/Summary.shp>   (needs `pip install pyshp`)
Then python3 scripts/build_size_demo.py writes it into size.html.
"""
import json, math, pathlib, sys
import numpy as np
import shapefile
from scipy.spatial import cKDTree

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHORT = {'B36-26': 'Aletsch', 'B56-07': 'Gorner', 'B40-07': 'Fiescher', 'A54g-11': 'Unteraar', 'B83-03': 'Corbassière',
         'B57-05': 'Zmutt', 'B43-03': 'Rhone', 'B56-03': 'Findel', 'B53-04': 'Fee', 'A54e-24': 'Trift'}


def middle(outline):
    """The point of the biggest piece of the outline that is farthest from its edge (pole of inaccessibility), lat, lon. Computed on a 20 m grid in metres."""
    polys = outline['coordinates'] if outline['type'] == 'MultiPolygon' else [outline['coordinates']]
    lat0 = sum(p[0][0][1] for p in polys) / len(polys); lon0 = sum(p[0][0][0] for p in polys) / len(polys); kx = 111320 * math.cos(math.radians(lat0))
    proj = lambda ring: np.array([[(x - lon0) * kx, (y - lat0) * 111320] for x, y in ring])
    area = lambda r: abs(np.sum(r[:, 0] * np.roll(r[:, 1], -1) - np.roll(r[:, 0], -1) * r[:, 1])) / 2
    best = max(polys, key=lambda p: area(proj(p[0]))); rings = [proj(r) for r in best]
    def inside(pts, ring):
        x, y = pts[:, 0], pts[:, 1]; ins = np.zeros(len(pts), bool); j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]; c = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi); ins ^= c; j = i
        return ins
    edge = []                                   # the outline densified to 10 m, so the nearest point on it is the nearest edge point
    for r in rings:
        for a, b in zip(r, np.roll(r, -1, axis=0)):
            n = max(1, int(np.hypot(*(b - a)) / 10)); edge.append(a + (b - a) * (np.arange(n)[:, None] / n))
    tree = cKDTree(np.vstack(edge)); r0 = rings[0]
    xs = np.arange(r0[:, 0].min(), r0[:, 0].max(), 20); ys = np.arange(r0[:, 1].min(), r0[:, 1].max(), 20)
    pts = np.array([[x, y] for x in xs for y in ys]); ok = inside(pts, r0)
    for h in rings[1:]: ok &= ~inside(pts, h)
    pts = pts[ok]; d, _ = tree.query(pts); k = int(np.argmax(d)); x, y = pts[k]
    return [round(lat0 + y / 111320, 5), round(lon0 + x / kx, 5)]


def main(folder):
    g = (ROOT / 'data' / 'glaciers.js').read_text()
    gl = {x['id']: x for x in json.loads(g[g.index('{'):g.rindex('}') + 1])['glaciers']}
    r = shapefile.Reader(str(pathlib.Path(folder) / '01_Summary' / 'Summary.shp'))
    f = [x[0] for x in r.fields[1:]]
    out = []
    for rec in r.records():
        d = dict(zip(f, rec)); i = d['pk_sgi'].replace('/', '-')
        if i in gl:
            v = gl[i]['volume']
            out.append({'id': i, 'V2016': d['V_2016'], 'Vyear': d['V_year'], 'year': d['year_mode'],
                        'dV': v['dV_km3'], 'from': v['from'], 'to': v['to'], 'at': middle(gl[i]['outline'])})
    missing = set(gl) - {o['id'] for o in out}
    if missing:
        sys.exit('not in Summary.shp: ' + ', '.join(sorted(missing)))
    out.sort(key=lambda o: -o['V2016'])
    (ROOT / 'data' / 'ice-volumes.json').write_text(json.dumps(out, indent=0))
    for o in out:
        print(f"{o['id']:8} {SHORT.get(o['id'], ''):12} {o['V2016']} km3 (as stored)  dV {o['dV']} km3 {o['from']}-{o['to']}")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
