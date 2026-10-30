#!/usr/bin/env python3
"""One small file per glacier with everything the 3D view needs, made once here instead of in every visitor's browser.

data/terrain/<SGI id>.<hash>.bin holds, for the strip the 3D view shows (a few km up the glacier from the tongue tip, 4 km wide, see V3D in index.html):
  - the heights of the newest swissALTI3D edition on a grid of about 14 m (the same data the Mapterhorn tiles carry, which the page used before),
  - the change of the ice surface between the 2019 edition and the newest one (from data/demchange/<id>.json, resampled to the same grid), if there is one,
  - the peak names to show (swisstopo swissNAMES3D, chosen as the page used to do it),
  - the bedrock surface under the ice (swissBEDROCK, swisstopo, band BEM, 10 m, bilinear onto the same grid; where it has no value the surface, so no ice) as a third array, if the header has `bed`,
  - the radar pins to show (about ten, a representative cell near the middle of each stretch of the strip; the page picks its own, js relevantPins),
  - the geometry of the strip itself (position of the tip, direction up the glacier, lengths), so the page and the file cannot disagree.
data/terrain/manifest.json maps each id to its current file; the page asks for the manifest fresh and keeps the files in the browser (a new hash = a new file).

File format: 'TFS1', uint32 length of the header, the header (JSON, utf-8), then a zlib stream with two int16 arrays (little endian) of (nA+1) x (nB+1)
values, rows from far up the glacier to below the tip, left to right: heights in decimetres above the tip, then the ice change in centimetres
(newest minus 2019 edition), then (header `bed`) the bedrock elevation in decimetres above the tip like the heights. All are stored as differences along each row (cumulative sums undo it). nA and nB are even and nB is a multiple of 4, so
every second point makes the coarser 28 m grid that devices without 32-bit indices use.

Needs: glaciers.js (build_outlines.py), thickness.js, demchange/ (build_dem_change.py), all in data/ and the swissALTI3D tiles in scripts/.dem-cache (it downloads
what is missing: the strip reaches beyond the tiles of the ice-change work). Internet for swisstopo's names. Standard library only.
Usage: python3 scripts/build_terrain_bundle.py [--id B36-26 ...]
"""
import numpy as np, argparse, array, base64, datetime, hashlib, json, math, os, struct, sys, urllib.parse, urllib.request, zipfile, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dem_change as bd
import terrain_lib as tl
import terrain_names as tn
import swissbedrock as sbr

ROOT = bd.ROOT
OUT = os.path.join(ROOT, 'data', 'terrain')
HALF = 2000                 # half width of the strip (m): V3D.HALF in index.html
NB = 284                    # grid cells across (a multiple of 4: 2 * 2000 / 284 = 14.08 m); along: about the same size, an even number
NAME_KINDS = {'Hauptgipfel': 3, 'Alpiner Gipfel': 3, 'Gipfel': 2, 'Pass': 1}
merc, unmerc = tl.merc, tl.unmerc


def strip_for(g):                          # the strip of data/boxes.js (the page reads the same: stripFor() in js/11-view3d.js): tip, azimuth up the glacier, metres below the tip and up
    e = tl.records()[g['id']]; t = e['strip3d']; tip = e['tip']; px, py = merc(*tip); k = 1 / math.cos(math.radians(tip[0])); az = math.radians(t['azimuth']); sh = t.get('shift', 0); px, py = px + sh * math.cos(az) * k, py - sh * math.sin(az) * k      # shift: the strip's centre line lies sideways of the tip line
    return {'P': (px, py), 'k': k, 'ue': math.sin(az), 'un': math.cos(az), 'up': t['up'], 'back': t['back'], 'shift': sh, 'half': t['half']}


class Tiles:                               # the 2 m grids of the newest swissALTI3D edition, read when first needed
    def __init__(self): self.t = {}; self.missing = set()
    def tile(self, e, n):
        if (e, n) not in self.t:
            ed, path = bd.newest_tile(e, n)
            if not path: self.t[(e, n)] = None; self.missing.add((e, n))
            else:
                arr = array.array('f', [float('nan')]) * 250000
                z = zipfile.ZipFile(path)
                for line in z.open([x for x in z.namelist() if x.endswith('.xyz')][0]):
                    p = line.split()
                    try: E, N, Z = float(p[0]), float(p[1]), float(p[2])
                    except (ValueError, IndexError): continue
                    ix, iy = int((E - e * 1000) // 2), int((N - n * 1000) // 2)
                    if 0 <= ix < 500 and 0 <= iy < 500 and Z > -500: arr[iy * 500 + ix] = Z
                self.t[(e, n)] = arr
        return self.t[(e, n)]
    def at(self, E, N):
        e, n = int(E // 1000), int(N // 1000); a = self.tile(e, n)
        if a is None: return None
        v = a[int((N - n * 1000) // 2) * 500 + int((E - e * 1000) // 2)]
        return None if v != v else v
    def mean(self, E, N):                  # the mean of 5 x 5 points of 2 m around a place, so the 14 m grid does not alias the fine detail
        s = c = 0
        for dy in (-4, -2, 0, 2, 4):
            for dx in (-4, -2, 0, 2, 4):
                v = self.at(E + dx, N + dy)
                if v is not None: s += v; c += 1
        return s / c if c else None


def fill_holes(h):                         # places beyond the swissALTI3D tiles (over the border, at the far end of the strip, where the picture fades out anyway): smooth, from what surrounds them
    rows, cols = len(h), len(h[0]); holes = [(j, i) for j in range(rows) for i in range(cols) if h[j][i] is None]
    for j, i in holes:                     # a first guess: the nearest known height in the same row
        for d in range(1, cols):
            near = [h[j][x] for x in (i - d, i + d) if 0 <= x < cols and h[j][x] is not None]
            if near: h[j][i] = sum(near) / len(near); break
        else: h[j][i] = next((h[y][i] for y in range(rows) if h[y][i] is not None), 2000.0)
    mask = set(holes)
    for _ in range(200):                   # then the guesses are smoothed against each other and the known neighbours
        for j, i in holes:
            nb = [h[y][x] for y, x in ((j - 1, i), (j + 1, i), (j, i - 1), (j, i + 1)) if 0 <= y < rows and 0 <= x < cols]
            h[j][i] = sum(nb) / len(nb)


def relevant_pins(pins, up, back):         # as relevantPins() in js/11-view3d.js: about ten, one per stretch: of the 40 % of cells nearest the middle of the strip, the one of median thickness
    ln = up + back; n = max(6, min(12, round(ln / 700))); groups = [[] for _ in range(n)]
    for p in pins: groups[min(n - 1, max(0, int((-p['z'] + back) / ln * n)))].append(p)
    out = []
    for g in groups:
        if not g: continue
        mid = sorted(g, key=lambda p: abs(p['x']))[:max(1, -(-len(g) * 4 // 10))]; out.append(sorted(mid, key=lambda p: (p['m'], abs(p['x'])))[(len(mid) - 1) // 2])
    return out


def delta_grid(g, st, nA, nB):             # the ice change (cm) at every grid point, resampled from demchange/<id>.json as iceChangeGrid() in index.html
    path = os.path.join(ROOT, 'data', 'demchange', g['id'] + '.json')
    if not os.path.exists(path): return None, None
    d = json.load(open(path)); z = struct.unpack('<%dh' % (d['w'] * d['h']), zlib.decompress(base64.b64decode(d['z'])))
    at = lambda ci, cj: 0 if ci < 0 or cj < 0 or ci >= d['w'] or cj >= d['h'] else z[cj * d['w'] + ci]
    px, py, k, ue, un, up, back = st['P'][0], st['P'][1], st['k'], st['ue'], st['un'], st['up'], st['back']; ln = up + back; out = []
    for j in range(nA + 1):
        a = up - j * ln / nA; row = []
        for i in range(nB + 1):
            b = -st['half'] + i * 2 * st['half'] / nB; lat, lon = unmerc(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k); E, N = bd.lv95(lat, lon)
            fx, fy = (E - d['e0']) / d['cell'] - 0.5, (N - d['n0']) / d['cell'] - 0.5; ci, cj = math.floor(fx), math.floor(fy); ax, ay = fx - ci, fy - cj
            v = (at(ci, cj) * (1 - ax) + at(ci + 1, cj) * ax) * (1 - ay) + (at(ci, cj + 1) * (1 - ax) + at(ci + 1, cj + 1) * ax) * ay
            row.append(int(round(v)))
        out.append(row)
    return out, {'old': d['old'], 'new': d['new']}


def bilinear(a, fj, fi):                   # a[row, col] at fractional (row, col), the edge value beyond the edge
    h, w = a.shape; fj = np.clip(fj, 0, h - 1); fi = np.clip(fi, 0, w - 1); j0 = np.minimum(fj.astype(int), h - 2); i0 = np.minimum(fi.astype(int), w - 2); dj = fj - j0; di = fi - i0
    return (a[j0, i0] * (1 - di) + a[j0, i0 + 1] * di) * (1 - dj) + (a[j0 + 1, i0] * (1 - di) + a[j0 + 1, i0 + 1] * di) * dj


LAKE_WALL = 3.0      # m: ground this far above the lake level still counts as lake shore
TAPER_CELLS = 4      # 20 m cells over which the ice change grows from a quarter to its full size at the glacier outline


def taper(d):
    """The change of a year with its edge softened: the model change is 0 outside the glacier and jumps to the ice change at the outline, which stands as a cliff in 3D. Inside the outline the
    change is scaled by (cells in from the edge + 1) / TAPER_CELLS, at most 1, so the ice surface meets the rim of the valley on a slope."""
    cur = d != 0; k = cur.astype(float)
    for _ in range(TAPER_CELLS - 1):
        n = cur.copy(); n[1:] &= cur[:-1]; n[:-1] &= cur[1:]; n[:, 1:] &= cur[:, :-1]; n[:, :-1] &= cur[:, 1:]; n[0] = n[-1] = False; n[:, 0] = n[:, -1] = False
        cur = n; k += cur
    return d * np.minimum(k, TAPER_CELLS) / TAPER_CELLS


def yearly_surfaces(gid, EN, hts, bedv, h0):
    """(header entry, [surface of each year as rows of decimetres above the tip]) from data/yearly/<id>.npz, or None. The file holds the change of each year against the newest swissALTI3D
    edition (cm, 20 m cells, made by experiments/aletsch-yearly-dem/strip_model.py); it is resampled bilinearly onto the grid of the strip and added to the 14 m heights (lake cells, `flat`, are set to their water level), so the detail
    of the 2 m model stays and the ice change is as smooth as its 20 m cells. A surface never lies below the bedrock (swissBEDROCK) where there is one."""
    p = os.path.join(ROOT, 'data', 'yearly', gid + '.npz')
    if not os.path.exists(p): return None
    z = np.load(p); E = np.array([[e for e, n in r] for r in EN]); N = np.array([[n for e, n in r] for r in EN])
    fi = (E - int(z['e0'])) / 20 - 0.5; fj = (N - int(z['n0'])) / 20 - 0.5; H = np.array(hts, float); out = []
    B = np.array([[np.nan if v is None else v for v in r] for r in bedv], float)
    for k in range(len(z['years'])):
        d = bilinear(taper(z['D'][k].astype(float) / 100), fj, fi)
        s = H + d; low = d < 0; s = np.where(low & np.isfinite(B), np.maximum(s, B), s)
        if 'flat' in z.files and z['flat'][k].any():      # a lake held flat in the model (the tip lake of Aletsch, 2024 to 2026): the cells of its 20 m mask, rim included, lie exactly at the water level here too
            fl = z['flat'][k][np.clip(np.rint(fj).astype(int), 0, z['flat'].shape[1] - 1), np.clip(np.rint(fi).astype(int), 0, z['flat'].shape[2] - 1)]
            fl &= H <= float(z['flat_level'][k]) + LAKE_WALL      # rim cells whose 2023 ground stands higher than the water are wall, not lake: left as they were (no notch cut into the valley side)
            s = np.where(fl, float(z['flat_level'][k]), s)
        out.append([[int(round((v - h0) * 10)) for v in r] for r in s.tolist()])
    years = [int(y) for y in z['years']]; kinds = json.load(open(os.path.join(ROOT, 'data', 'yearly', gid + '.json')))['kind']
    return {'years': years, 'kind': [kinds[str(y)] for y in years], 'day': '09-30', 'swiss': 1, 'provenance': f'data/yearly/{gid}.json'}, out


def build(g, tiles, bed):
    gid = g['id']; st = strip_for(g); up, back = st['up'], st['back']; ln = up + back; HALF = st['half']
    nA = 2 * round(ln / 28); nB = 4 * round(2 * HALF / 14.08 / 4); px, py, k, ue, un = st['P'][0], st['P'][1], st['k'], st['ue'], st['un']
    print(f'{g["name"]} ({gid}): strip {ln:.0f} m long, grid {nB + 1} x {nA + 1}', file=sys.stderr)
    hts = []; bedv = []; holes = 0; EN = []
    for j in range(nA + 1):
        a = up - j * ln / nA; row = []; brow = []; enrow = []
        for i in range(nB + 1):
            b = -HALF + i * 2 * HALF / nB; lat, lon = unmerc(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k); E, N = bd.lv95(lat, lon); enrow.append((E, N))
            v = tiles.mean(E, N)
            if v is None: holes += 1
            row.append(v); brow.append(bed.at(E, N))
        hts.append(row); bedv.append(brow); EN.append(enrow)
    if holes: fill_holes(hts)
    jt = int(up / ln * nA + 0.5); h0 = hts[jt][nB // 2]
    print(f'  tip height {h0:.1f} m, points outside the swissALTI3D tiles: {holes} of {(nA + 1) * (nB + 1)}', file=sys.stderr)
    q = [[int(round((v - h0) * 10)) for v in row] for row in hts]
    nobed = sum(v is None for row in bedv for v in row)      # outside the model: the surface, so the ice is nothing there
    bq = [[int(round(((hts[j][i] if v is None else v) - h0) * 10)) for i, v in enumerate(row)] for j, row in enumerate(bedv)]
    yearly = yearly_surfaces(gid, EN, hts, bedv, h0)      # the yearly ice surfaces of the glacier, where there are any (data/yearly/<id>.npz)
    delta, dem = (None, None) if yearly else delta_grid(g, st, nA, nB)
    # radar pins in the strip
    th = open(os.path.join(ROOT, 'data', 'thickness.js'), encoding='utf-8').read(); tj = json.loads(th[th.index('{'):th.rindex('}') + 1]); pins = []
    for lat, lng, m, y, *rest in tj.get(gid, []):
        mx, my = merc(lat, lng); dx, dy = (mx - px) / k, (my - py) / k; a, b = dx * ue + dy * un, dx * un - dy * ue
        if abs(b) <= HALF and -back <= a <= up: pins.append({'x': round(b, 1), 'z': round(-a, 1), 'm': m, 'y': y, **({'all': rest[0]} if rest and rest[0] else {}), **({'seis': 1} if len(rest) > 2 and rest[2] else {})})
    pins = relevant_pins(pins, up, back)
    avoid = [(0.0, 0.0)]; R_ = g.get('radar')
    if R_ and R_.get('max_at'):
        mx, my = merc(*R_['max_at']); dx, dy = (mx - px) / k, (my - py) / k; a, b = dx * ue + dy * un, dx * un - dy * ue
        if abs(b) <= HALF and -back <= a <= up: avoid.append((b, -a))
    sj = dict(st, half=HALF); at_ = lambda a, b: q[min(nA, max(0, round((up - a) / ln * nA)))][min(nB, max(0, round((b + HALF) / (2 * HALF) * nB)))] / 10
    try: names = tn.names_for('ch', sj, at_, avoid)
    except Exception as e: print('  names failed:', e, file=sys.stderr); names = []
    head = {'v': 1, 'id': gid, 'P': [px, py], 'k': k, 'ue': ue, 'un': un, 'up': up, 'back': back, **({'shift': st['shift']} if st.get('shift') else {}), 'nA': nA, 'nB': nB, 'h0': h0, 'dem': dem, **({'half': HALF} if HALF != 2000 else {}), **({'yearly': yearly[0]} if yearly else {}), 'names': names, 'namesSource': tn.source('ch')[0], 'radar': pins, 'bed': {'source': 'swissBEDROCK', 'band': 'BEM', 'none': nobed}, 'built': datetime.date.today().isoformat()}
    def packed(rows):                      # int16 differences along each row
        flat = []
        for row in rows: flat += [row[0]] + [row[i] - row[i - 1] for i in range(1, len(row))]
        return struct.pack('<%dh' % len(flat), *flat)
    payload = zlib.compress(packed(q) + (packed(delta) if delta else b'') + (b''.join(packed(s) for s in yearly[1]) if yearly else b'') + packed(bq), 9)
    name, size = tl.write_bundle(gid, head, payload)
    print(f'  {len(pins)} radar pins, {len(names)} names ({", ".join(n["text"] for n in names)}), ice change: {"yes" if delta else "no"}, bed: {nobed} of {len(bq) * len(bq[0])} points without swissBEDROCK; wrote {name}: {size / 1024:.0f} KB', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', nargs='*'); a = ap.parse_args(); tiles = Tiles(); bed = sbr.Bed()
    s = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read()
    for g in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers']:
        if not a.id or g['id'] in a.id: build(g, tiles, bed); tiles.t.clear()      # tiles of one glacier at a time: memory
    if tiles.missing: print('tiles without swissALTI3D:', sorted(tiles.missing), file=sys.stderr)


if __name__ == '__main__':
    main()
