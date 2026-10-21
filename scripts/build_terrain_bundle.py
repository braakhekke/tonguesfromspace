#!/usr/bin/env python3
"""One small file per glacier with everything the 3D view needs, made once here instead of in every visitor's browser.

data/terrain/<SGI id>.<hash>.bin holds, for the strip the 3D view shows (a few km up the glacier from the tongue tip, 4 km wide, see V3D in index.html):
  - the heights of the newest swissALTI3D edition on a grid of about 14 m (the same data the Mapterhorn tiles carry, which the page used before),
  - the change of the ice surface between the 2019 edition and the newest one (from data/demchange/<id>.json, resampled to the same grid), if there is one,
  - the peak names to show (swisstopo swissNAMES3D, chosen as the page used to do it),
  - the radar pins to show (about ten, the thickest of each stretch of the strip),
  - the geometry of the strip itself (position of the tip, direction up the glacier, lengths), so the page and the file cannot disagree.
data/terrain/manifest.json maps each id to its current file; the page asks for the manifest fresh and keeps the files in the browser (a new hash = a new file).

File format: 'TFS1', uint32 length of the header, the header (JSON, utf-8), then a zlib stream with two int16 arrays (little endian) of (nA+1) x (nB+1)
values, rows from far up the glacier to below the tip, left to right: heights in decimetres above the tip, then the ice change in centimetres
(newest minus 2019 edition). Both are stored as differences along each row (cumulative sums undo it). nA and nB are even and nB is a multiple of 4, so
every second point makes the coarser 28 m grid that devices without 32-bit indices use.

Needs: glaciers.js (build_outlines.py), thickness.js, demchange/ (build_dem_change.py), all in data/ and the swissALTI3D tiles in scripts/.dem-cache (it downloads
what is missing: the strip reaches beyond the tiles of the ice-change work). Internet for swisstopo's names. Standard library only.
Usage: python3 scripts/build_terrain_bundle.py [--id B36-26 ...]
"""
import argparse, array, base64, datetime, hashlib, json, math, os, struct, sys, urllib.parse, urllib.request, zipfile, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dem_change as bd

ROOT = bd.ROOT
OUT = os.path.join(ROOT, 'data', 'terrain')
HALF = 2000                 # half width of the strip (m): V3D.HALF in index.html
def _boxes():                # data/boxes.js: window.GLACIER_BOXES = {...};
    t = open(os.path.join(ROOT, 'data', 'boxes.js'), encoding='utf-8').read()
    return json.loads(t[t.index('{', t.index('window.GLACIER_BOXES')):t.rindex('}') + 1])
BOXES = _boxes()
NB = 284                    # grid cells across (a multiple of 4: 2 * 2000 / 284 = 14.08 m); along: about the same size, an even number
NAME_KINDS = {'Hauptgipfel': 3, 'Alpiner Gipfel': 3, 'Gipfel': 2, 'Pass': 1}
R = 6378137.0


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def unmerc(x, y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


def strip_for(g):                          # the strip of data/boxes.js (the page reads the same: stripFor() in js/11-view3d.js): tip, azimuth up the glacier, metres below the tip and up
    e = BOXES['glaciers'][g['id']]; t = e['strip3d']; tip = e['tip']; px, py = merc(*tip); k = 1 / math.cos(math.radians(tip[0])); az = math.radians(t['azimuth'])
    if t['half'] != HALF: sys.exit(f"{g['id']}: strip half width {t['half']} m in data/boxes.js, but this script builds {HALF} m wide strips (HALF)")
    return {'P': (px, py), 'k': k, 'ue': math.sin(az), 'un': math.cos(az), 'up': t['up'], 'back': t['back']}


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


def relevant_pins(pins, up, back):         # as relevantPins() in index.html: about ten, the thickest of each stretch
    ln = up + back; n = max(6, min(12, round(ln / 700))); best = [None] * n
    for p in pins:
        k = min(n - 1, max(0, int((-p['z'] + back) / ln * n)))
        if best[k] is None or p['m'] > best[k]['m']: best[k] = p
    return [b for b in best if b]


def names_for(st, h, nA, h0, avoid):       # the peak names of the strip: swisstopo swissNAMES3D, chosen as pickNames() in index.html
    px, py, k, ue, un, up, back = st['P'][0], st['P'][1], st['k'], st['ue'], st['un'], st['up'], st['back']
    cs = [(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k) for a, b in ((-back, -HALF), (-back, HALF), (up, -HALF), (up, HALF))]
    env = ','.join(str(v) for v in (min(c[0] for c in cs), min(c[1] for c in cs), max(c[0] for c in cs), max(c[1] for c in cs)))
    url = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' + urllib.parse.urlencode({'geometryType': 'esriGeometryEnvelope', 'geometry': env, 'imageDisplay': '1000,1000,96', 'mapExtent': env,
          'tolerance': '0', 'layers': 'all:ch.swisstopo.swissnames3d', 'sr': '3857', 'returnGeometry': 'true', 'limit': '200', 'lang': 'en'})
    j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'tonguesfromspace-build'}), timeout=60))
    ln = up + back; nB = NB; seen = set(); cand = []
    for r in j.get('results', []):
        a_ = r['attributes']; kind = a_.get('objektart')
        if kind not in NAME_KINDS or not r.get('geometry') or not r['geometry'].get('points') or not a_.get('name'): continue
        mx, my = r['geometry']['points'][0]; dx, dy = (mx - px) / k, (my - py) / k; a, b = dx * ue + dy * un, dx * un - dy * ue
        if not (abs(b) <= HALF and -back <= a <= up and abs(b) < HALF - 200 and a > -back + 150 and a < up - 200) or a_['name'] in seen: continue
        seen.add(a_['name']); x, z = b, -a
        jj = min(nA, max(0, round((z + up) / ln * nA))); ii = min(nB, max(0, round((x + HALF) / (2 * HALF) * nB)))
        cand.append((h[jj][ii] / 10 + NAME_KINDS[kind] * 120, x, z, a_['name']))
    cand.sort(reverse=True); out = []
    for sc, x, z, name in cand:
        if len(out) >= 6: break
        if all(math.hypot(o['x'] - x, o['z'] - z) > 750 for o in out) and all(math.hypot(o[0] - x, o[1] - z) > 750 for o in avoid): out.append({'x': round(x, 1), 'z': round(z, 1), 'text': name})
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
            b = -HALF + i * 2 * HALF / nB; lat, lon = unmerc(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k); E, N = bd.lv95(lat, lon)
            fx, fy = (E - d['e0']) / d['cell'] - 0.5, (N - d['n0']) / d['cell'] - 0.5; ci, cj = math.floor(fx), math.floor(fy); ax, ay = fx - ci, fy - cj
            v = (at(ci, cj) * (1 - ax) + at(ci + 1, cj) * ax) * (1 - ay) + (at(ci, cj + 1) * (1 - ax) + at(ci + 1, cj + 1) * ax) * ay
            row.append(int(round(v)))
        out.append(row)
    return out, {'old': d['old'], 'new': d['new']}


def build(g, tiles):
    gid = g['id']; st = strip_for(g); up, back = st['up'], st['back']; ln = up + back
    nA = 2 * round(ln / 28); nB = NB; px, py, k, ue, un = st['P'][0], st['P'][1], st['k'], st['ue'], st['un']
    print(f'{g["name"]} ({gid}): strip {ln:.0f} m long, grid {nB + 1} x {nA + 1}', file=sys.stderr)
    hts = []; holes = 0
    for j in range(nA + 1):
        a = up - j * ln / nA; row = []
        for i in range(nB + 1):
            b = -HALF + i * 2 * HALF / nB; lat, lon = unmerc(px + (a * ue + b * un) * k, py + (a * un - b * ue) * k); E, N = bd.lv95(lat, lon)
            v = tiles.mean(E, N)
            if v is None: holes += 1
            row.append(v)
        hts.append(row)
    if holes: fill_holes(hts)
    jt = int(up / ln * nA + 0.5); h0 = hts[jt][nB // 2]
    print(f'  tip height {h0:.1f} m, points outside the swissALTI3D tiles: {holes} of {(nA + 1) * (nB + 1)}', file=sys.stderr)
    q = [[int(round((v - h0) * 10)) for v in row] for row in hts]
    delta, dem = delta_grid(g, st, nA, nB)
    # radar pins in the strip
    th = open(os.path.join(ROOT, 'data', 'thickness.js'), encoding='utf-8').read(); tj = json.loads(th[th.index('{'):th.rindex('}') + 1]); pins = []
    for lat, lng, m, y, *rest in tj.get(gid, []):
        mx, my = merc(lat, lng); dx, dy = (mx - px) / k, (my - py) / k; a, b = dx * ue + dy * un, dx * un - dy * ue
        if abs(b) <= HALF and -back <= a <= up: pins.append({'x': round(b, 1), 'z': round(-a, 1), 'm': m, 'y': y, **({'all': rest[0]} if rest and rest[0] else {})})
    pins = relevant_pins(pins, up, back)
    avoid = [(0.0, 0.0)]; R_ = g.get('radar')
    if R_ and R_.get('max_at'):
        mx, my = merc(*R_['max_at']); dx, dy = (mx - px) / k, (my - py) / k; a, b = dx * ue + dy * un, dx * un - dy * ue
        if abs(b) <= HALF and -back <= a <= up: avoid.append((b, -a))
    try: names = names_for(st, q, nA, h0, avoid)
    except Exception as e: print('  names failed:', e, file=sys.stderr); names = []
    head = {'v': 1, 'id': gid, 'P': [px, py], 'k': k, 'ue': ue, 'un': un, 'up': up, 'back': back, 'nA': nA, 'nB': nB, 'h0': h0, 'dem': dem, 'names': names, 'radar': pins, 'built': datetime.date.today().isoformat()}
    def packed(rows):                      # int16 differences along each row
        flat = []
        for row in rows: flat += [row[0]] + [row[i] - row[i - 1] for i in range(1, len(row))]
        return struct.pack('<%dh' % len(flat), *flat)
    payload = zlib.compress(packed(q) + (packed(delta) if delta else b''), 9)
    hb = json.dumps(head, separators=(',', ':')).encode(); data = b'TFS1' + struct.pack('<I', len(hb)) + hb + payload
    name = f'{gid}.{hashlib.sha1(data).hexdigest()[:8]}.bin'; os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith(gid + '.') and f.endswith('.bin') and f != name: os.remove(os.path.join(OUT, f))
    open(os.path.join(OUT, name), 'wb').write(data)
    mp = os.path.join(OUT, 'manifest.json'); man = json.load(open(mp)) if os.path.exists(mp) else {}; man[gid] = name
    json.dump(man, open(mp, 'w'), indent=1, sort_keys=True)
    print(f'  {len(pins)} radar pins, {len(names)} names ({", ".join(n["text"] for n in names)}), ice change: {"yes" if delta else "no"}; wrote {name}: {len(data) / 1024:.0f} KB', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', nargs='*'); a = ap.parse_args(); tiles = Tiles()
    s = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read()
    for g in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers']:
        if not a.id or g['id'] in a.id: build(g, tiles); tiles.t.clear()      # tiles of one glacier at a time: memory
    if tiles.missing: print('tiles without swissALTI3D:', sorted(tiles.missing), file=sys.stderr)


if __name__ == '__main__':
    main()
