#!/usr/bin/env python3
"""Landsat pictures of an Icelandic outlet's picture box, one clear late-summer scene per year before Sentinel-2 -> data/landsat/<outlet>/<year>.jpg + data/landsat/<outlet>.json

Source: USGS Landsat Collection 2 Level-2 (surface reflectance; Landsat 4/5 TM 1984 to 2011, Landsat 7 ETM+ 1999 on; Landsat 8 is left out, see EXCLUDE; 30 m; public domain, "Landsat data courtesy of the
U.S. Geological Survey"), read through the Microsoft Planetary Computer: the STAC catalogue (collection landsat-c2-l2, open, no key) finds the scenes, its data API (titiler) cuts the picture
box out of the cloud-optimised files and resamples it onto the Web Mercator grid of the picture box (the same bbox as data/oldest/<outlet>.json, so the page lays the file on the map and on
the 3D terrain like any other picture). Needs Pillow (pip install pillow). Python 3.8 or newer, otherwise the standard library.

The scene of a year follows the Sentinel-2 rules of the page (js/00-regions.js, season of the region): the days 1 August to 15 October, only scenes that cover the whole picture, the clear
one closest to 30 September (at most 5 % cloud, cloud shadow or cirrus inside the picture box, from the scene's own quality band QA_PIXEL), else the least cloudy one up to 30 %. A year
without such a scene has no picture. The colours use the same curve as the Sentinel-2 natural colour pictures (TRUE_COLOR in js/03-imagery.js, without the Rayleigh term: surface reflectance is
already corrected), after each picture is matched per channel (gain and offset) to the average Landsat 5/7 colours of a patch of rock east of the tongue (LAND), so that the years look alike. Landsat 1 to 3 (MSS, 1972 to 1983) have no blue band and are not used; Collection 2 Level-2 starts in 1982 for Landsat 4 and 1984 for Landsat 5 over Iceland.

Usage: python3 scripts/build_landsat_iceland.py [--outlet breidamerkurjokull] [--from 1984] [--to 2015] [--list] [--years 1990 1991] [--width 1240]
  --list   only the table of candidate scenes (date, satellite, cloud, snow, cover) and the pick of each year, no pictures
The answers of the catalogue and the cut-outs are kept in scripts/.landsat-cache (git-ignored), so a second run needs no requests.
"""
import argparse, array, hashlib, io, io, json, math, os, sys, time, urllib.parse, urllib.request
try:
    from PIL import Image
except ImportError:
    sys.exit('This script needs Pillow: pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.landsat-cache')
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
DATA = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox'
R = 6378137.0
LEAVE_OUT_YEARS = (1986,)      # years with a picture that jumps against its neighbours (the scene lies badly on the others), left out by hand
EXCLUDE = ('landsat-8',)      # Landsat 8 Level-2 surface reflectance is over-corrected over Iceland's ice, shade and water (values at or below zero: green ice, purple ground, black sea); no top-of-atmosphere product is on the catalogue, so 2013 to 2015 have no Landsat picture
SEASON = ('08-01', '10-15', '09-30')      # find from, find to, target day: the Iceland season of js/00-regions.js
MAX_CLOUD, FALLBACK_CLOUD, MIN_COVER, MIN_PARTIAL = 0.05, 0.30, 0.999, 0.85      # Landsat 7 after May 2003 has stripes of no data (scan line corrector failed): where no full scene exists, one with at least 85 % is taken
TC = dict(maxR=3.0, midR=0.13, sat=1.3, gamma=2.3, gOff=0.01)      # TRUE_COLOR of js/03-imagery.js


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def fetch(url, body=None, tries=5):
    key = os.path.join(CACHE, hashlib.sha1((url + (body or '')).encode()).hexdigest())
    if os.path.exists(key):
        with open(key, 'rb') as f: return f.read()
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=body.encode() if body else None, headers={'User-Agent': 'tonguesfromspace/1.0', 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=180) as r: data = r.read()
            os.makedirs(CACHE, exist_ok=True)
            with open(key, 'wb') as f: f.write(data)
            return data
        except Exception as e:
            last = e; time.sleep(2 * (k + 1))
    raise RuntimeError(f'{url[:120]}: {last}')


def npy(data):
    """The array of a .npy file (little-endian uint16 only, C order): (shape, array('H'))"""
    assert data[:6] == b'\x93NUMPY'
    hl = int.from_bytes(data[8:10], 'little'); head = data[10:10 + hl].decode()
    assert "'<u2'" in head and "'fortran_order': False" in head, head
    shape = eval(head[head.index('(') : head.index(')') + 1])
    a = array.array('H'); a.frombytes(data[10 + hl:])
    if sys.byteorder == 'big': a.byteswap()
    return shape, a


def cut(item, assets, bbox, w, h, nearest):
    q = [('collection', 'landsat-c2-l2'), ('item', item), ('asset_as_band', 'true'), ('coord_crs', 'EPSG:3857'), ('dst_crs', 'EPSG:3857'), ('resampling', 'nearest' if nearest else 'bilinear')]
    q += [('assets', a) for a in assets]
    url = f'{DATA}/{",".join(str(v) for v in bbox)}/{w}x{h}.npy?{urllib.parse.urlencode(q)}'
    return npy(fetch(url))


def candidates(bounds, year):
    s, w, n, e = bounds
    body = json.dumps({'collections': ['landsat-c2-l2'], 'bbox': [w, s, e, n], 'datetime': f'{year}-{SEASON[0]}T00:00:00Z/{year}-{SEASON[1]}T23:59:59Z', 'limit': 100})
    return [f for f in json.loads(fetch(STAC, body))['features'] if f['properties']['platform'] not in EXCLUDE]


def score(item, bbox):
    """cloud (cloud, shadow, cirrus), snow and cover (valid pixels) of the picture box, from QA_PIXEL at 120 m"""
    n = 207      # about 120 m ground pixels
    shape, a = cut(item['id'], ['qa_pixel'], bbox, n, n, True)
    px, valid, cloud, snow = n * n, 0, 0, 0
    for i in range(px):
        v = a[i]
        if a[px + i] == 0 or v & 1: continue      # outside the scene, or fill
        valid += 1
        if v & 0b11100: cloud += 1                # bit 2 cirrus, 3 cloud, 4 cloud shadow
        if v & 0b100000: snow += 1                # bit 5 snow / ice
    return {'cover': valid / px, 'cloud': cloud / max(valid, 1), 'snow': snow / max(valid, 1)}


def pick(days, year):
    target = time.mktime(time.strptime(f'{year}-{SEASON[2]}', '%Y-%m-%d'))
    away = lambda d: abs(time.mktime(time.strptime(d['date'], '%Y-%m-%d')) - target)
    for floor in (MIN_COVER, MIN_PARTIAL):      # a scene that covers the whole picture first; only where there is none, one with gaps
        ok = [d for d in days if d['cover'] >= floor]
        clear = sorted([d for d in ok if d['cloud'] <= MAX_CLOUD], key=away)
        if clear: return dict(clear[0], clear=True, partial=floor < MIN_COVER and clear[0]['cover'] < MIN_COVER)
        rest = sorted([d for d in ok if d['cloud'] <= FALLBACK_CLOUD], key=lambda d: (d['cloud'], away(d)))
        if rest: return dict(rest[0], clear=False, partial=floor < MIN_COVER and rest[0]['cover'] < MIN_COVER)
    return None


def sadj(a):      # the Copernicus Browser true colour curve of the page (js/03-imagery.js evalscriptFor), per channel
    t = TC; c = min(max(a / t['maxR'], 0), 1)
    x = c * (c * (t['midR'] / t['maxR'] + 1 - 1) - 1) / (c * (2 * t['midR'] / t['maxR'] - 1) - t['midR'] / t['maxR'])
    off = t['gOff'] ** t['gamma']; return ((x + t['gOff']) ** t['gamma'] - off) / ((1 + t['gOff']) ** t['gamma'] - off)


def srgb(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** 0.41666666666 - 0.055


LAND = (0.65, 0.30, 0.85, 0.50)      # a patch of rock and gravel east of the tongue, as shares of the picture (west, north, east, south): the same ground in every year, used to match the colours of the years
QUANT = (0.15, 0.70)                 # the two levels of that ground the colours are matched at


def bands(item, bbox, w, h): return cut(item['id'], ['red', 'green', 'blue'], bbox, w, h, False)[1]


def land_levels(a, w, h):
    """per channel the QUANT quantiles of the surface reflectance of the LAND patch (valid pixels only)"""
    px = w * h; x0, y0, x1, y1 = int(LAND[0] * w), int(LAND[1] * h), int(LAND[2] * w), int(LAND[3] * h); out = []
    for c in range(3):
        v = sorted(a[c * px + y * w + x] * 0.0000275 - 0.2 for y in range(y0, y1) for x in range(x0, x1) if a[3 * px + y * w + x] and a[c * px + y * w + x])
        out.append([v[int(q * (len(v) - 1))] for q in QUANT])
    return out


REG = (0.50, 0.20, 0.98, 0.95)      # the ground the years are registered on: the coast, the hills and the sandur east and south of the tongue (shares of the picture: west, north, east, south); the ice itself moves and changes
EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'      # Sentinel-2 cloudless 2025, the same picture the page uses as its background: the pictures are registered onto it, so Landsat and Sentinel-2 years lie on each other


def sentinel_reference(bbox, w, h, z=12):
    """the Sentinel-2 cloudless mosaic cut to the picture box, as bands in the layout of a Landsat cut (red band as digital numbers, valid mask as band 3)"""
    span = 2 * math.pi * R / 2 ** z; org = math.pi * R; x0, y0, x1, y1 = bbox
    tx0, tx1, ty0, ty1 = int((x0 + org) // span), int((x1 + org) // span), int((org - y1) // span), int((org - y0) // span)
    mos = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mos.paste(Image.open(io.BytesIO(fetch(EOX.format(z=z, x=tx, y=ty)))).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
    k = 256 / span; l, t, r_, b_ = (x0 + org - tx0 * span) * k, (org - y1 - ty0 * span) * k, (x1 + org - tx0 * span) * k, (org - y0 - ty0 * span) * k
    red = mos.resize((w, h), Image.BILINEAR, box=(l, t, r_, b_)).getchannel('R'); px = w * h
    a = array.array('H', bytes(8 * px))
    for i, v in enumerate(red.getdata()): a[i] = int((((v / 255) ** 2.2) * 0.9 + 0.2) / 0.0000275); a[3 * px + i] = 1
    return a


def edge_image(a, w, h, f):
    """the red band averaged over f x f pixels and its gradient magnitude (|dx| + |dy|): the edges of coast, rock and channels, which stay where they are; invalid pixels count as zero"""
    px = w * h; w2, h2 = w // f, h // f; v = [0.0] * (w2 * h2)
    for y in range(h2):
        for x in range(w2):
            t = n = 0
            for j in range(f):
                row = (y * f + j) * w + x * f
                for i in range(f):
                    if a[3 * px + row + i] and a[row + i]: t += a[row + i]; n += 1
            r = t / n * 0.0000275 - 0.2 if n > f * f // 2 else 0.0
            v[y * w2 + x] = r if r < 0.40 else 0.0      # ice, snow and cloud are not ground that stays: only rock, gravel, water and shore
    g = [0.0] * (w2 * h2)
    for y in range(1, h2 - 1):
        for x in range(1, w2 - 1):
            i = y * w2 + x
            if v[i] and v[i - 1] and v[i + 1] and v[i - w2] and v[i + w2]: g[i] = abs(v[i + 1] - v[i - 1]) + abs(v[i + w2] - v[i - w2])
    return g, w2, h2


def correlate(ref, img, w2, h2, cx, cy, radius, win):
    """the shift (sx, sy) in pixels of this resolution, around (cx, cy), at which img[x + sx, y + sy] best matches ref[x, y] over the REG window (zero-mean normalised cross-correlation)"""
    x0, y0, x1, y1 = int(REG[0] * w2), int(REG[1] * h2), int(REG[2] * w2), int(REG[3] * h2); best = (-2.0, cx, cy)
    for sy in range(cy - radius, cy + radius + 1):
        for sx in range(cx - radius, cx + radius + 1):
            xa, xb, ya, yb = max(x0, -sx), min(x1, w2 - sx), max(y0, -sy), min(y1, h2 - sy)
            if xb - xa < win or yb - ya < win: continue
            sa = sb = saa = sbb = sab = n = 0
            for y in range(ya, yb):
                r, m = y * w2, (y + sy) * w2 + sx
                for x in range(xa, xb):
                    p, q = ref[r + x], img[m + x]
                    sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q; n += 1
            va, vb = saa - sa * sa / n, sbb - sb * sb / n
            if va > 0 and vb > 0:
                c = (sab - sa * sb / n) / math.sqrt(va * vb)
                if c > best[0]: best = (c, sx, sy)
    return best


def register(refs, a, w, h):
    """how far the picture a lies from the reference, in pixels of the picture (sx, sy; x to the east, y to the south), and the correlation: coarse (8 x 8 pixels) to fine (full resolution)"""
    cx = cy = 0; c = 0
    for k, (f, radius) in enumerate(((8, 6), (2, 4), (1, 1))):
        rg, w2, h2 = refs[f]; ig, _, _ = edge_image(a, w, h, f)
        c, sx, sy = correlate(rg, ig, w2, h2, cx, cy, radius, 20)
        if k < 2: nf = (8, 2, 1)[k + 1]; cx, cy = sx * f // nf, sy * f // nf      # on to the next finer resolution
        else: cx, cy = sx, sy
    return cx, cy, c, correlate(refs[1][0], ig, refs[1][1], refs[1][2], 0, 0, 0, 20)[0]      # the correlation at the best shift and with no shift at all


def shifted(a, w, h, sx, sy):
    """the bands with img[x + sx, y + sy] moved to [x, y] (what lies outside becomes no data)"""
    px = w * h; out = array.array('H', bytes(len(a) * 2))
    for c in range(4):
        for y in range(h):
            ys = y + sy
            if not 0 <= ys < h: continue
            x0, x1 = max(0, -sx), min(w, w - sx)
            if x1 > x0: out[c * px + y * w + x0:c * px + y * w + x1] = a[c * px + ys * w + x0 + sx:c * px + ys * w + x1 + sx]
    return out


def render(a, w, h, cal):
    """cal: per channel the QUANT levels the picture is matched to (the average of Landsat 5 and 7): a gain and an offset per channel, so that the years look alike"""
    px = w * h; sat = TC['sat']; lev = land_levels(a, w, h)
    gains = [((cal[c][1] - cal[c][0]) / (lev[c][1] - lev[c][0]), lev[c][0], cal[c][0]) for c in range(3)]
    lut = {}
    def ch(v, c):      # surface reflectance = DN * 0.0000275 - 0.2 (Collection 2 Level-2), matched to the reference ground
        if (v, c) not in lut: g, l0, r0 = gains[c]; lut[(v, c)] = sadj(max(r0 + (v * 0.0000275 - 0.2 - l0) * g, 0))
        return lut[(v, c)]
    out = bytearray(px * 3); hole = bytearray(px)
    for i in range(px):
        if a[3 * px + i] == 0 or a[i] == 0:
            hole[i] = 1; continue
        r, g, b = ch(a[i], 0), ch(a[px + i], 1), ch(a[2 * px + i], 2); avg = (r + g + b) / 3 * (1 - sat)
        out[3 * i:3 * i + 3] = bytes(int(round(255 * srgb(min(max(avg + c * sat, 0), 1)))) for c in (r, g, b))
    # Landsat 7 after May 2003: diagonal stripes of no data inside the scene. The ice flows along its streaks (medial moraines, flow lines, crevasse trains), so a hole is first filled by
    # interpolating along the local direction of those streaks: the orientation comes from the structure tensor of the picture's brightness (gradients only where the picture is whole),
    # summed over blocks of BLK pixels and their neighbours; the streaks run at right angles to the dominant gradient. Where there is no clear direction (coherence under 0.3: rock, sea) or no picture
    # within FLOW_REACH pixels on both sides along it, the holes are closed along the rows and columns below.
    BLK, FLOW_REACH = 40, 60; nbx, nby = (w + BLK - 1) // BLK, (h + BLK - 1) // BLK
    lum = [(out[3 * i] + out[3 * i + 1] + out[3 * i + 2]) / 3 for i in range(px)]
    jxx = [0.0] * (nbx * nby); jyy = [0.0] * (nbx * nby); jxy = [0.0] * (nbx * nby)
    for y in range(2, h - 2):
        row = y * w
        for x in range(2, w - 2):
            i = row + x
            if hole[i] or hole[i - 2] or hole[i + 2] or hole[i - 2 * w] or hole[i + 2 * w] or hole[i - 1] or hole[i + 1] or hole[i - w] or hole[i + w]: continue
            gx, gy = lum[i + 1] - lum[i - 1], lum[i + w] - lum[i - w]; b = (y // BLK) * nbx + x // BLK
            jxx[b] += gx * gx; jyy[b] += gy * gy; jxy[b] += gx * gy
    flow = {}      # block -> unit vector along the streaks
    for by in range(nby):
        for bx in range(nbx):
            a = bb = c = 0.0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    X, Y = bx + dx, by + dy
                    if 0 <= X < nbx and 0 <= Y < nby: k = Y * nbx + X; a += jxx[k]; bb += jyy[k]; c += jxy[k]
            tot = a + bb
            if tot < 1e-6: continue
            if math.hypot(a - bb, 2 * c) / tot < 0.3: continue      # no clear direction
            th = 0.5 * math.atan2(2 * c, a - bb) + math.pi / 2      # gradient direction + 90 degrees = along the streaks
            flow[by * nbx + bx] = (math.cos(th), math.sin(th))
    src = bytes(hole); fl = 0
    for i in range(px):
        if not src[i]: continue
        y, x = divmod(i, w); d = flow.get((y // BLK) * nbx + x // BLK)
        if not d: continue
        found = []
        for sgn in (1, -1):
            for t in range(1, FLOW_REACH + 1):
                X, Y = int(round(x + sgn * d[0] * t)), int(round(y + sgn * d[1] * t))
                if not (0 <= X < w and 0 <= Y < h): break
                if not src[Y * w + X]: found.append((t, Y * w + X)); break
        if len(found) == 2:
            (t1, p1), (t2, p2) = found; u = t1 / (t1 + t2)
            for c in range(3): out[3 * i + c] = int(round(out[3 * p1 + c] * (1 - u) + out[3 * p2 + c] * u))
            hole[i] = 0; fl += 1
    print(f'    gaps: {fl} pixels filled along the flow, {sum(1 for v in hole if v)} left for rows and columns')
    # Landsat 7 after May 2003: diagonal stripes of no data inside the scene. A hole with picture on both sides within REACH pixels (along its row, then along its column) is
    # filled by interpolating between the two; what is left (outside the scene, wide gaps) is the dark blue-grey of the Sentinel-2 pictures
    REACH = 24; filled = 0
    for axis in (0, 1):
        step, n_lines, n_along = (1, h, w) if axis == 0 else (w, w, h)
        for line in range(n_lines):
            base = line * w if axis == 0 else line
            k = 0
            while k < n_along:
                i = base + k * step
                if not hole[i]: k += 1; continue
                j = k
                while j < n_along and hole[base + j * step]: j += 1
                if k > 0 and j < n_along and j - k <= REACH:
                    L, Rr = base + (k - 1) * step, base + j * step
                    for m in range(k, j):
                        t = (m - k + 1) / (j - k + 1); q = base + m * step
                        for c in range(3): out[3 * q + c] = int(round(out[3 * L + c] * (1 - t) + out[3 * Rr + c] * t))
                        hole[q] = 2; filled += 1
                k = j
        for i in range(px):      # holes closed along the rows are picture now (2); the ones still open (1) get their chance along the columns
            if hole[i] == 2: hole[i] = 0
    for i in range(px):
        if hole[i]: out[3 * i:3 * i + 3] = bytes((28, 41, 48))      # no data
    return Image.frombytes('RGB', (w, h), bytes(out)), (filled + fl) / px


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--outlet', default='breidamerkurjokull'); ap.add_argument('--from', dest='y0', type=int, default=1984); ap.add_argument('--to', dest='y1', type=int, default=2015)
    ap.add_argument('--years', nargs='*', type=int); ap.add_argument('--list', action='store_true'); ap.add_argument('--width', type=int, default=1240); a = ap.parse_args()
    t = open(os.path.join(ROOT, 'data', 'vatnajokull.js'), encoding='utf-8').read()
    o = next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == a.outlet)
    dlat = o['half'] / 111.32; dlon = o['half'] / (111.32 * math.cos(math.radians(o['lat'])))
    s, w, n, e = o['lat'] - dlat, o['lon'] - dlon, o['lat'] + dlat, o['lon'] + dlon
    (x0, y0), (x1, y1) = merc(s, w), merc(n, e); bbox = [round(x0), round(y0), round(x1), round(y1)]
    W = H = a.width; out = os.path.join(ROOT, 'data', 'landsat'); os.makedirs(os.path.join(out, a.outlet), exist_ok=True)
    scenes = {}; chosen = {}
    for year in [y for y in (a.years or range(a.y0, a.y1 + 1)) if y not in LEAVE_OUT_YEARS]:
        days = []
        for f in candidates((s, w, n, e), year):
            p = f['properties']
            try: sc = score(f, bbox)
            except Exception as ex: print(f'  {f["id"]}: {ex}'); continue
            days.append({**sc, 'date': p['datetime'][:10], 'id': f['id'], 'sat': p['platform'], 'path': p['landsat:wrs_path'], 'row': p['landsat:wrs_row'], 'time': p['datetime'][11:16], 'sun': round(p.get('view:sun_elevation', 0), 1), 'item': f})
        best = pick(days, year)
        print(year, f'{len(days)} scenes', '->', best and f'{best["date"]} {best["sat"]} cloud {best["cloud"]:.0%} snow {best["snow"]:.0%} cover {best["cover"]:.0%}' or 'none')
        if a.list:
            for d in sorted(days, key=lambda d: d['date']): print(f'    {d["date"]} {d["sat"]:10} P{d["path"]}R{d["row"]} cloud {d["cloud"]:4.0%} snow {d["snow"]:4.0%} cover {d["cover"]:4.0%}')
        if best and not a.list: chosen[year] = best
    if a.list: return
    # the colours of the years are matched to one reference: the average levels of the LAND patch over all Landsat 5 and 7 pictures of every year (not only of the years asked for)
    levels = {}
    for year in range(a.y0, a.y1 + 1):
        try:
            b = chosen.get(year) or pick([{**score(f, bbox), 'date': f['properties']['datetime'][:10], 'sat': f['properties']['platform'], 'item': f} for f in candidates((s, w, n, e), year)], year)
            if b: arr = bands(b['item'], bbox, W, H); levels[year] = land_levels(arr, W, H)
        except Exception as ex: print('  reference', year, ex)
    cal = [[sorted(l[c][q] for l in levels.values())[len(levels) // 2] for q in range(2)] for c in range(3)]
    print('reference ground levels (Landsat 5/7, median of', len(levels), 'years):', [[round(v, 3) for v in c] for c in cal])
    # the pictures are registered onto the Sentinel-2 mosaic: a scene can lie tens of metres off, which makes a timelapse jump
    mpp = (bbox[2] - bbox[0]) / W * math.cos(math.radians(o['lat'])); shifts = {}
    refs = {f: edge_image(sentinel_reference(bbox, W, H), W, H, f) for f in (8, 2, 1)}
    for year, best in sorted(chosen.items()):
        arr = bands(best['item'], bbox, W, H)
        sx, sy, c, c0 = register(refs, arr, W, H)
        ok = (sx, sy) != (0, 0) and c - c0 >= 0.03 and math.hypot(sx, sy) * mpp <= 150      # a clear gain, and a shift a Landsat scene can really have (a weak match far away is noise)
        print(f'  {year}: lies {sx * mpp:+.0f} m east, {sy * mpp:+.0f} m south of the Sentinel-2 mosaic (correlation {c:.2f}, {c0:.2f} unshifted){"  -> shifted" if ok else ""}')
        if ok: shifts[year] = (sx, sy); arr = shifted(arr, W, H, sx, sy)
        img, filled = render(arr, W, H, cal); img.save(os.path.join(out, a.outlet, f'{year}.jpg'), quality=88, optimize=True, progressive=True)
        scenes[year] = {k: round(best[k], 3) if isinstance(best[k], float) else best[k] for k in ('date', 'id', 'sat', 'path', 'row', 'time', 'sun', 'cloud', 'snow', 'clear', 'cover')}
        if shifts.get(year) and shifts[year] != (0, 0): scenes[year]['shiftM'] = [round(shifts[year][0] * mpp), round(shifts[year][1] * mpp)]      # how far the scene lay east and south of the reference, in metres: corrected
        if filled > 0.002: scenes[year]['filled'] = round(filled, 3)      # the share of the picture interpolated across the stripes of Landsat 7
    if a.list: return
    mp = os.path.join(out, a.outlet + '.json'); old = {}
    if os.path.exists(mp) and a.years:
        with open(mp, encoding='utf-8') as f: old = json.load(f).get('scenes', {})
    old.update({str(k): v for k, v in scenes.items()})
    with open(mp, 'w', encoding='utf-8') as f:
        json.dump({'bbox': bbox, 'w': W, 'h': H, 'scenes': dict(sorted(old.items())),
                   'source': 'Landsat Collection 2 Level-2 surface reflectance, courtesy of the U.S. Geological Survey (public domain), via the Microsoft Planetary Computer', 'gsd': 30}, f, indent=1, ensure_ascii=False)
    print('wrote', mp, len(old), 'years')


if __name__ == '__main__':
    main()
