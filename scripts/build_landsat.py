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

Usage: python3 scripts/build_landsat.py [--outlet breidamerkurjokull] [--from 1984] [--to 2015] [--list] [--years 1990 1991] [--res 30]
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
LEAVE_OUT_BY_OUTLET = {'aletsch': (1985, 1991), 'breidamerkurjokull': (1997, 2001, 2009)}      # per glacier, with the reason: Aletsch 1985 (26 July, Landsat 5) lay 766 m off the Sentinel-2 mosaic and came out warped (owner's review note, 2026-10-20), 1991 slightly warped (owner, 2026-10-30); Breiðamerkurjökull 1997 (cloud on the tongue), 2001 (position off), 2009 (cloud on the tongue): no better scene exists under the rules, dropped on the owner's decision 2026-10-21
EXCLUDE = ('landsat-8',)      # Landsat 8 Level-2 surface reflectance is over-corrected over Iceland's ice, shade and water (values at or below zero: green ice, purple ground, black sea); no top-of-atmosphere product is on the catalogue, so 2013 to 2015 have no Landsat picture
SEASON = ('08-01', '10-15', '09-30')      # find from, find to, target day: set from the region in main() (SEASONS)
MAX_CLOUD, FALLBACK_CLOUD, MIN_COVER, MIN_PARTIAL = 0.15, 0.40, 0.999, 0.75      # a scene counts as clear up to 15 % cloud by the stricter score above (the Sentinel-2 rule has 5 %, from a different mask), else the least cloudy up to 40 %      # Landsat 7 after May 2003 has stripes of no data (scan line corrector failed): where no full scene exists, one with at least 85 % is taken
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


def score(item, bbox, masks=None):
    """cloud, tongue cloud (tcloud), snow and cover of the picture box, from QA_PIXEL at 120 m.
    Only a flag with HIGH confidence counts (the confidence bits 8-9 cloud, 14-15 cirrus equal 3) and never on a pixel that is flagged snow or ice: the cloud mask of Landsat is known to take the
    bright snow and ice of a glacier for cloud (over the Aletsch glacier it flagged 40 to 60 % of clear pictures as cloud). Cloud shadow is not counted (in the Alps the mask flags 20 to 30 % of a clear
    picture as shadow, which is the shade of the mountains). masks = (glacier, tongue): the sets of pixels (of the 207 x 207 grid) inside the outlines of the glaciers and within 3 km of the tongue tip;
    `cloud` is then the share over the glacier area and `tcloud` over the tongue: what matters for the picture. Without masks both are over the whole box."""
    n = 207      # about 120 m ground pixels
    shape, a = cut(item['id'], ['qa_pixel'], bbox, n, n, True)
    px, valid, cloud, snow = n * n, 0, 0, 0; gv = gc = tv = tc = 0; glac, tong = masks if masks else (None, None)
    for i in range(px):
        v = a[i]
        if a[px + i] == 0 or v & 1: continue      # outside the scene, or fill
        valid += 1
        c = False
        if v & 0b100000: snow += 1
        elif ((v & 0b1000) and ((v >> 8) & 3) == 3) or ((v & 0b100) and ((v >> 14) & 3) == 3): c = True; cloud += 1      # bit 3 cloud, 2 cirrus, each with high confidence
        if glac is not None:
            if i in glac: gv += 1; gc += c
            if i in tong: tv += 1; tc += c
    return {'cover': valid / px, 'cloud': (gc / gv if gv > 20 else cloud / max(valid, 1)) if glac is not None else cloud / max(valid, 1), 'tcloud': (tc / tv if tv > 5 else cloud / max(valid, 1)) if glac is not None else cloud / max(valid, 1), 'snow': snow / max(valid, 1)}


def masks_for(rings, tip, bbox, n=207, radius=3000.0):
    """the pixels of the 207 x 207 grid of the picture box inside any of the outlines `rings` ([lat, lon]) and within `radius` metres of the tip"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import icecap_lib as lib
    x0, y0, x1, y1 = bbox; glac, tong = set(), set(); rr = [r for r in rings if len(r) > 3]
    box = [(min(p[0] for p in r), max(p[0] for p in r), min(p[1] for p in r), max(p[1] for p in r)) for r in rr]; k = 111320.0 * math.cos(math.radians(tip[0]))
    for j in range(n):
        for i in range(n):
            lat, lon = unmerc(x0 + (i + 0.5) / n * (x1 - x0), y1 - (j + 0.5) / n * (y1 - y0))
            if math.hypot((lon - tip[1]) * k, (lat - tip[0]) * 111320.0) <= radius: tong.add(j * n + i)
            if any(b[0] <= lat <= b[1] and b[2] <= lon <= b[3] and lib.inside(lon, lat, [(p[1], p[0]) for p in r]) for r, b in zip(rr, box)): glac.add(j * n + i)
    return glac, tong


SLC_OFF = '2003-05-31'      # Landsat 7's scan line corrector failed: its scenes from this day on have stripes of no data
REJECT = set()      # dates of scenes not to use for this glacier (scripts/landsat-rejects.json: chosen by looking at the pictures)


def ranked(days, year):
    """the usable scenes of a year, best first: a scene that covers the whole picture before one with gaps; clear (cloud over the glacier at most MAX_CLOUD and over the tongue at most 5 %) before the
    rest (at most FALLBACK_CLOUD over the glacier and 20 % over the tongue), each nearest to the target day or least cloudy; scenes in REJECT are left out"""
    target = time.mktime(time.strptime(f'{year}-{SEASON[2]}', '%Y-%m-%d'))
    away = lambda d: abs(time.mktime(time.strptime(d['date'], '%Y-%m-%d')) - target)
    out = []; days = [d for d in days if d['date'] not in REJECT]
    for floor in (MIN_COVER, MIN_PARTIAL):
        ok = [d for d in days if d['cover'] >= floor and d['id'] not in {x['id'] for x in out}]      # (by id: `out` holds copies, a scene used to come up twice, once in each pass)
        clear = sorted([d for d in ok if d['cloud'] <= MAX_CLOUD and d.get('tcloud', d['cloud']) <= 0.05], key=away)
        rest = sorted([d for d in ok if d not in clear and d['cloud'] <= FALLBACK_CLOUD and d.get('tcloud', d['cloud']) <= 0.20], key=lambda d: (d.get('tcloud', d['cloud']), d['cloud'], away(d)))
        out += [dict(d, clear=True, partial=floor < MIN_COVER and d['cover'] < MIN_COVER) for d in clear] + [dict(d, clear=False, partial=floor < MIN_COVER and d['cover'] < MIN_COVER) for d in rest]
    return out


def pick(days, year):
    r = ranked(days, year); return r[0] if r else None


def sadj(a):      # the Copernicus Browser true colour curve of the page (js/03-imagery.js evalscriptFor), per channel
    t = TC; c = min(max(a / t['maxR'], 0), 1)
    x = c * (c * (t['midR'] / t['maxR'] + 1 - 1) - 1) / (c * (2 * t['midR'] / t['maxR'] - 1) - t['midR'] / t['maxR'])
    off = t['gOff'] ** t['gamma']; return ((x + t['gOff']) ** t['gamma'] - off) / ((1 + t['gOff']) ** t['gamma'] - off)


def srgb(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** 0.41666666666 - 0.055


LAND = (0.65, 0.30, 0.85, 0.50)      # a patch of rock and gravel east of the tongue, as shares of the picture (west, north, east, south): the same ground in every year, used to match the colours of the years
NOMATCH = False      # set in main(): a picture without any ice-free land keeps the plain surface reflectance (no matching of the years)
QUANT = (0.15, 0.70)                 # the two levels of that ground the colours are matched at


ASSETS = ['red', 'green', 'blue', 'nir08', 'swir16', 'swir22']      # the six surface reflectance bands: planes 0 to 5 of a cut, the valid mask is plane 6 (MASK)
MASK = len(ASSETS)
# the three colour styles of the page (STYLE_BANDS in js/03-imagery.js) as Landsat 5 / 7 bands (plane numbers): natural B04 B03 B02 = red, green, blue; false 1 B08 B04 B03 = near infrared, red, green;
# false 2 B8A B11 B12 = near infrared, shortwave infrared 1, shortwave infrared 2
STYLES = {'natural': (0, 1, 2), 'false1': (3, 0, 1), 'false2': (3, 4, 5)}
HOT = 'false3'      # false colour 3 "Hot?" (js/03-imagery.js hotEvalscript): not a band triple but a ratio picture; red = red / SWIR1 (0 to 2), green = blue band (0 to 0.4), blue = SWIR1 (0 to 0.35, gamma 1/2.2), made from the colour-matched surface reflectance. The ratio and the blue check are the quantities of the clean-ice rule of Paul et al. 2020 (ESSD 12, 1805); the composite and its settings are ours
RUN = [*STYLES, HOT]      # the styles painted in this run (`--styles false3` paints only that one, see restyle)
FILE_SUFFIX = {'natural': '', 'false1': '.false1', 'false2': '.false2', HOT: '.false3'}


def bands(item, bbox, w, h): return cut(item['id'], ASSETS, bbox, w, h, True)[1]      # nearest neighbour: the pixels of the picture are the 30 m pixels of Landsat, not smoothed


def land_levels(a, w, h):
    """per channel the QUANT quantiles of the surface reflectance of the LAND patch (valid pixels only)"""
    px = w * h; x0, y0, x1, y1 = int(LAND[0] * w), int(LAND[1] * h), int(LAND[2] * w), int(LAND[3] * h); out = []
    for c in range(MASK):
        v = sorted(a[c * px + y * w + x] * 0.0000275 - 0.2 for y in range(y0, y1) for x in range(x0, x1) if a[MASK * px + y * w + x] and a[c * px + y * w + x])
        out.append([v[int(q * (len(v) - 1))] for q in QUANT] if v else [0.0, 0.1])
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
    a = array.array('H', bytes(2 * (MASK + 1) * px))
    for i, v in enumerate(red.getdata()): a[i] = int((((v / 255) ** 2.2) * 0.9 + 0.2) / 0.0000275); a[MASK * px + i] = 1
    return a


def site_guide(o, bbox, w, h):
    """The red band (digital numbers, as list) of the glacier's pinned Sentinel-2 scene of 2016 (data/scenes.json: the picture the site shows for 2016), cut from the Planetary Computer's copy of that
    same scene (sentinel-2-l2a, same date and orbit), or None if it cannot be had. It is used only to read the direction of the ice streaks; none of its pixels is put into a picture."""
    try:
        sc = json.load(open(os.path.join(ROOT, 'data', 'scenes.json')))['glaciers']
        site = {'B36-26': 'aletsch', 'B56-07': 'gorner', 'B40-07': 'fiescher', 'A54g-11': 'unteraar', 'B83-03': 'corbassiere', 'B57-05': 'zmutt', 'B43-03': 'rhone', 'B56-03': 'sgi-B56-03', 'B53-04': 'sgi-B53-04', 'A54e-24': 'trift'}      # inventory id -> site id (audit_glaciers.py SITE_ID)
        rec = next((v for k, v in sc.items() if k == o.get('id') or site.get(k) == o.get('id')), None)
        pick = rec and (rec['picks'].get('2016') or rec['picks'][min(rec['picks'])])
        if not pick: return None
        s_, w_ = unmerc(bbox[0], bbox[1]); n_, e_ = unmerc(bbox[2], bbox[3]); d = pick['date']
        body = json.dumps({'collections': ['sentinel-2-l2a'], 'bbox': [w_, s_, e_, n_], 'datetime': f'{d}T00:00:00Z/{d}T23:59:59Z', 'limit': 20})
        items = json.loads(fetch('https://planetarycomputer.microsoft.com/api/stac/v1/search', body))['features']
        items = [f for f in items if f'R{int(f["properties"].get("sat:relative_orbit", 0)):03d}' == pick.get('orbit')] or items
        if not items: return None
        item = min(items, key=lambda f: f['properties'].get('eo:cloud_cover', 100))
        q = urllib.parse.urlencode([('collection', 'sentinel-2-l2a'), ('item', item['id']), ('asset_as_band', 'true'), ('coord_crs', 'EPSG:3857'), ('dst_crs', 'EPSG:3857'), ('resampling', 'bilinear'), ('assets', 'B04')])
        # the Sentinel-2 cut is a (1, h, w) array of uint16: the site's own picture of 2016 is this scene
        shape, a = npy(fetch(f'{DATA}/{",".join(str(v) for v in bbox)}/{w}x{h}.npy?{q}'))
        print(f'    streak direction from the Sentinel-2 scene of {d} ({item["id"]}), the pinned picture of the site')
        return list(a[:w * h])
    except Exception as ex:
        print('    no pinned Sentinel-2 scene for the guide:', ex); return None


def edge_image(a, w, h, f):
    """the red band averaged over f x f pixels and its gradient magnitude (|dx| + |dy|): the edges of coast, rock and channels, which stay where they are; invalid pixels count as zero"""
    px = w * h; w2, h2 = w // f, h // f; v = [0.0] * (w2 * h2)
    for y in range(h2):
        for x in range(w2):
            t = n = 0
            for j in range(f):
                row = (y * f + j) * w + x * f
                for i in range(f):
                    if a[MASK * px + row + i] and a[row + i]: t += a[row + i]; n += 1
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
    for c in range(MASK + 1):
        for y in range(h):
            ys = y + sy
            if not 0 <= ys < h: continue
            x0, x1 = max(0, -sx), min(w, w - sx)
            if x1 > x0: out[c * px + y * w + x0:c * px + y * w + x1] = a[c * px + ys * w + x0 + sx:c * px + ys * w + x1 + sx]
    return out


GQ = [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98]      # quantiles of the whole picture that Landsat 8 is matched at (ground_q): the ground alone left snow lilac and ice edges olive
GQ_REF = None      # per band, the GQ quantiles of the ice-free ground of the Landsat 5 / 7 pictures (median over the years): set in main()


def ground_q(a, w, h, glac):
    """per band the GQ quantiles of the surface reflectance of the whole picture (valid pixels, every third; `glac` is not used any more)"""
    px = w * h; idx = [y * w + x for y in range(0, h, 3) for x in range(0, w, 3) if a[MASK * px + y * w + x] and a[y * w + x]]
    out = []
    for c in range(MASK):
        v = sorted(a[c * px + i] * 0.0000275 - 0.2 for i in idx if a[c * px + i])
        out.append([v[int(q * (len(v) - 1))] for q in GQ] if len(v) > 500 else None)
    return out


def qmap_for(a, w, h, glac):
    """Landsat 8: per band the pairs (own quantile, reference quantile) of the ice-free ground, or None where it cannot be had. Its Level-2 surface reflectance has another atmospheric correction
    (LaSRC) than Landsat 5 / 7 (LEDAPS): over this ground it comes out too low in blue and too high in red, so rock looks yellow-brown, and a gain and offset on one patch does not repair that"""
    if GQ_REF is None: return None
    own = ground_q(a, w, h, glac)
    return [list(zip(o, r)) if o and r else None for o, r in zip(own, GQ_REF)]


def qapply(r, pairs):
    """piecewise linear through the pairs, with slope 1 beyond the ends"""
    if r <= pairs[0][0]: return r + pairs[0][1] - pairs[0][0]
    if r >= pairs[-1][0]: return r + pairs[-1][1] - pairs[-1][0]
    for (x0, y0), (x1, y1) in zip(pairs, pairs[1:]):
        if r <= x1: return y0 + (r - x0) / (x1 - x0) * (y1 - y0) if x1 > x0 else y0
    return r


def paint(a, w, h, cal, qmap=None):
    """the three colour styles of one scene (cal: the levels the scene is matched to) and the mask of its no-data pixels (1)"""
    px = w * h; sat = TC['sat']; lev = land_levels(a, w, h)
    gains = [((cal[c][1] - cal[c][0]) / (lev[c][1] - lev[c][0]) if lev[c][1] - lev[c][0] > 1e-4 else 1.0, lev[c][0], cal[c][0]) for c in range(MASK)] if not NOMATCH else [(1.0, 0.0, 0.0)] * MASK
    rlut = {}; lut = {}
    def lvl(v, c):      # surface reflectance = DN * 0.0000275 - 0.2 (Collection 2 Level-2), matched to the reference ground
        if (v, c) not in rlut:
            g, l0, r0 = gains[c]
            rlut[(v, c)] = max(qapply(v * 0.0000275 - 0.2, qmap[c]), 0) if qmap and qmap[c] else max(r0 + (v * 0.0000275 - 0.2 - l0) * g, 0)
        return rlut[(v, c)]
    def ch(v, c):      # and through the true colour curve
        if (v, c) not in lut: lut[(v, c)] = sadj(lvl(v, c))
        return lut[(v, c)]
    bufs = {k: bytearray(px * 3) for k in RUN}; hole = bytearray(px); colour = [k for k in STYLES if k in RUN]
    for i in range(px):
        if a[MASK * px + i] == 0 or a[i] == 0:
            hole[i] = 1; continue
        if colour:
            lv = [ch(a[b * px + i], b) for b in range(MASK)]
            for k in colour:
                r, g, b = (lv[j] for j in STYLES[k]); avg = (r + g + b) / 3 * (1 - sat)
                bufs[k][3 * i:3 * i + 3] = bytes(int(round(255 * srgb(min(max(avg + c * sat, 0), 1)))) for c in (r, g, b))
        if HOT in bufs:      # Hot?: the ratio of the matched reflectances of red (plane 0) and shortwave infrared 1 (plane 4), the blue band (plane 2) and the shortwave infrared 1 itself
            red, swir, blue = lvl(a[i], 0), lvl(a[4 * px + i], 4), lvl(a[2 * px + i], 2)
            bufs[HOT][3 * i:3 * i + 3] = bytes(int(round(255 * v)) for v in (min(1.0, red / swir / 2) if swir > 0 else (1.0 if red > 0 else 0.0), min(1.0, blue / 0.4), min(1.0, swir / 0.35) ** 0.4545))
    return bufs, hole


LOCAL_R, EDGE_PX = 10, 2


def local_match(bufs, dbufs, hole, dhole, w, h):
    """A donor patch in a stripe is moved, per channel, by the average difference (picture minus donor) over the pixels around it where both scenes have a picture (a window of 2 * LOCAL_R + 1 pixels,
    not within EDGE_PX of a stripe: the pixels beside a stripe are unreliable). The quantile match over the whole picture is dominated by snow, so on the grey ice of the tongue a patch from another
    day came out 13 to 15 levels (of 255) too bright and without colour, as white streaks across the tongue; the local difference follows the ground under the patch."""
    px = w * h; near = bytearray(hole)
    for _ in range(EDGE_PX):      # the stripes grown by EDGE_PX pixels
        t = bytearray(near)
        for i in range(px):
            if near[i]:
                x, y = i % w, i // w
                t[i - (x > 0)] = t[i + (x < w - 1)] = 1; t[i - w * (y > 0)] = t[i + w * (y < h - 1)] = 1
        near = t
    ok = [1 if not near[i] and not dhole[i] else 0 for i in range(px)]
    def integral(v):
        out = [0] * ((w + 1) * (h + 1))
        for y in range(h):
            run = 0; r, q = (y + 1) * (w + 1), y * (w + 1)
            for x in range(w): run += v[y * w + x]; out[r + x + 1] = out[q + x + 1] + run
        return out
    def box(I, x, y):
        x0, x1, y0, y1 = max(x - LOCAL_R, 0), min(x + LOCAL_R + 1, w), max(y - LOCAL_R, 0), min(y + LOCAL_R + 1, h)
        return I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]
    cnt = integral(ok); todo = [i for i in range(px) if hole[i] and not dhole[i]]
    for k in bufs:
        for c in range(3):
            I = integral([(bufs[k][3 * i + c] - dbufs[k][3 * i + c]) if ok[i] else 0 for i in range(px)])
            for i in todo:
                x, y = i % w, i // w; n = box(cnt, x, y)
                if n >= 30: dbufs[k][3 * i + c] = min(255, max(0, dbufs[k][3 * i + c] + round(box(I, x, y) / n)))


def render(a, w, h, cal, donors=(), guide=None, qmap=None):
    """cal: per band the QUANT levels the picture is matched to (the average of Landsat 5 and 7): a gain and an offset per band, so that the years look alike. donors: second scenes (same layout,
    registered, their cloud taken out) whose pixels fill the stripes of Landsat 7 first, the first where it is clear, the next ones what is left. Returns the pictures of the three colour styles (STYLES) and the share of the picture that was interpolated."""
    px = w * h
    bufs, hole = paint(a, w, h, cal, qmap); out = bufs.get('natural') or next(iter(bufs.values())); dn = 0
    for donor in donors:
        dbufs, dhole = paint(donor, w, h, cal)      # its own gain and offset: the colours of the two scenes meet without a seam
        # the land patch alone does not make the two sensors agree on bright snow and ice (Landsat 5 and 7, other day): every channel of the second scene is mapped, by quantiles, onto the
        # first one over the pixels where both have a picture, so that the patches that fill the stripes do not show as stripes on the snow
        both = [i for i in range(0, px, 3) if not hole[i] and not dhole[i]]
        if len(both) > 2000:
            QN = [q / 64 for q in range(65)]
            for k in bufs:
                for c in range(3):
                    b = sorted(bufs[k][3 * i + c] for i in both); d = sorted(dbufs[k][3 * i + c] for i in both)
                    xs = [d[int(q * (len(d) - 1))] for q in QN]; ys = [b[int(q * (len(b) - 1))] for q in QN]; lut = []
                    for v in range(256):
                        j = max(0, min(63, sum(1 for x in xs[1:-1] if x <= v)))
                        x0, x1 = xs[j], xs[j + 1]; lut.append(int(round(min(255, max(0, ys[j] + (v - x0) / (x1 - x0) * (ys[j + 1] - ys[j]) if x1 > x0 else ys[j])))))
                    for i in range(px):
                        if dhole[i] == 0: dbufs[k][3 * i + c] = lut[dbufs[k][3 * i + c]]
        local_match(bufs, dbufs, hole, dhole, w, h)
        for i in range(px):
            if hole[i] and not dhole[i]:
                for k in bufs: bufs[k][3 * i:3 * i + 3] = dbufs[k][3 * i:3 * i + 3]
                hole[i] = 0; dn += 1
        print(f'    gaps: {dn} pixels taken from the second scenes so far')
    # Landsat 7 after May 2003: diagonal stripes of no data inside the scene. Without a second scene, or where it has gaps too, the ice flows along its streaks (medial moraines, flow lines,
    # crevasse trains), so a hole is first filled by interpolating along the local direction of those streaks: the orientation comes from the structure tensor of the picture's brightness
    # (gradients only where the picture is whole), summed over blocks of BLK pixels and their neighbours; the streaks run at right angles to the dominant gradient. Where there is no clear
    # direction (coherence under 0.3: rock, sea) or no picture within FLOW_REACH pixels on both sides along it, the holes are closed along the rows and columns below.
    BLK, FLOW_REACH, COH_MIN = (16, 120, 0.12) if guide else (40, 120, 0.15); nbx, nby = (w + BLK - 1) // BLK, (h + BLK - 1) // BLK
    # guide: the Sentinel-2 cloudless mosaic (red band, no stripes), used ONLY to find the direction of the ice streaks (moraines, flow lines): the stripes of Landsat 7 cut the picture's own
    # structure to pieces, and a direction read from it bent the bridges across neighbouring moraines. The pixels that are filled in are always Landsat's own.
    lum = [(out[3 * i] + out[3 * i + 1] + out[3 * i + 2]) / 3 for i in range(px)] if not guide else [float(v) for v in guide]
    jxx = [0.0] * (nbx * nby); jyy = [0.0] * (nbx * nby); jxy = [0.0] * (nbx * nby)
    for y in range(2, h - 2):
        row = y * w
        for x in range(2, w - 2):
            i = row + x
            if not guide and (hole[i] or hole[i - 2] or hole[i + 2] or hole[i - 2 * w] or hole[i + 2 * w] or hole[i - 1] or hole[i + 1] or hole[i - w] or hole[i + w]): continue
            gx, gy = lum[i + 1] - lum[i - 1], lum[i + w] - lum[i - w]; b = (y // BLK) * nbx + x // BLK
            jxx[b] += gx * gx; jyy[b] += gy * gy; jxy[b] += gx * gy
    # The tensor sums sit at the block centres and are interpolated bilinearly, so the direction changes smoothly across the picture (one direction per block gave kinks where
    # neighbouring blocks disagreed), and a bridge is traced along the changing direction (it follows a bend of the glacier) instead of along one straight line, which landed on the wrong moraine.
    sm = {}
    for by in range(nby):
        for bx in range(nbx):
            a = bb = c = 0.0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    X, Y = bx + dx, by + dy
                    if 0 <= X < nbx and 0 <= Y < nby: k = Y * nbx + X; a += jxx[k]; bb += jyy[k]; c += jxy[k]
            sm[(bx, by)] = (a, bb, c)
    dcache = {}
    def flow_at(x, y):      # unit vector along the streaks at (x, y), or None where there is no clear direction
        key = (int(x) // 4, int(y) // 4)
        if key in dcache: return dcache[key]
        fx, fy = (key[0] * 4 + 2) / BLK - 0.5, (key[1] * 4 + 2) / BLK - 0.5
        x0, y0 = math.floor(fx), math.floor(fy); tx, ty = fx - x0, fy - y0; a = bb = c = 0.0
        for X, Y, wt in ((x0, y0, (1 - tx) * (1 - ty)), (x0 + 1, y0, tx * (1 - ty)), (x0, y0 + 1, (1 - tx) * ty), (x0 + 1, y0 + 1, tx * ty)):
            s = sm.get((min(max(X, 0), nbx - 1), min(max(Y, 0), nby - 1)))
            a += s[0] * wt; bb += s[1] * wt; c += s[2] * wt
        tot = a + bb; r = None
        if tot >= 1e-6 and math.hypot(a - bb, 2 * c) / tot >= COH_MIN:      # else no clear direction
            th = 0.5 * math.atan2(2 * c, a - bb) + math.pi / 2      # gradient direction + 90 degrees = along the streaks
            r = (math.cos(th), math.sin(th))
        dcache[key] = r
        return r
    src = bytes(hole); fl = 0
    for i in range(px):
        if not src[i]: continue
        y, x = divmod(i, w); d0 = flow_at(x, y)
        if not d0: continue
        found = []
        for sgn in (1, -1):
            d = (sgn * d0[0], sgn * d0[1]); fx, fy = float(x), float(y)
            for t in range(1, FLOW_REACH + 1):
                fx += d[0]; fy += d[1]; X, Y = int(round(fx)), int(round(fy))
                if not (0 <= X < w and 0 <= Y < h): break
                if not src[Y * w + X]: found.append((t, Y * w + X)); break
                nd = flow_at(fx, fy)
                if not nd: break
                if nd[0] * d[0] + nd[1] * d[1] < 0: nd = (-nd[0], -nd[1])      # keep going the same way
                d = nd
        if len(found) == 2:
            (t1, p1), (t2, p2) = found; u = t1 / (t1 + t2)
            for ob in bufs.values():
                for c in range(3): ob[3 * i + c] = int(round(ob[3 * p1 + c] * (1 - u) + ob[3 * p2 + c] * u))
            hole[i] = 0; fl += 1
    print(f'    gaps: {fl} pixels filled along the flow, {sum(1 for v in hole if v)} left for rows and columns')
    # Landsat 7 after May 2003: diagonal stripes of no data inside the scene. A hole with picture on both sides within REACH pixels (along its row, then along its column) is
    # filled by interpolating between the two; what is left (outside the scene, wide gaps) is the dark blue-grey of the Sentinel-2 pictures
    REACH = 8 if guide else 24; filled = 0
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
                        for ob in bufs.values():
                            for c in range(3): ob[3 * q + c] = int(round(ob[3 * L + c] * (1 - t) + ob[3 * Rr + c] * t))
                        hole[q] = 2; filled += 1
                k = j
        for i in range(px):      # holes closed along the rows are picture now (2); the ones still open (1) get their chance along the columns
            if hole[i] == 2: hole[i] = 0
    for i in range(px):
        if hole[i]:
            for ob in bufs.values(): ob[3 * i:3 * i + 3] = bytes((28, 41, 48))      # no data
    return {k: Image.frombytes('RGB', (w, h), bytes(ob)) for k, ob in bufs.items()}, (filled + fl + dn) / px


def auto_land(rings, bounds, z, size=0.2, min_h=30):
    """The patch of ground that matches the colours of the years: a square of 0.2 of the picture (west, north, east, south as shares) with no ice (not inside any of the outlines `rings`, [lat, lon] lists),
    no water (above 30 m by the terrain tiles of Mapterhorn at zoom z) and the flattest ground of all such squares: the same bare ground in every year. (Breiðamerkurjökull has a hand-chosen one.)"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import icecap_lib as lib
    s, w, n_, e = bounds; dem = lib.Dem(z); n = 40
    rings = [r for r in rings if len(r) > 3]; box = [(min(p[0] for p in r), max(p[0] for p in r), min(p[1] for p in r), max(p[1] for p in r)) for r in rings]
    ok = {}; hs = {}
    for j in range(n):
        for i in range(n):
            la = n_ - (j + 0.5) / n * (n_ - s); lo = w + (i + 0.5) / n * (e - w)
            ice = any(b[0] <= la <= b[1] and b[2] <= lo <= b[3] and lib.inside(lo, la, [(p[1], p[0]) for p in r]) for r, b in zip(rings, box))
            h = dem.h(la, lo); hs[(i, j)] = h; ok[(i, j)] = (not ice) and h > min_h
    m = int(size * n); best = None
    for j in range(0, n - m + 1):
        for i in range(0, n - m + 1):
            cells = [(i + a, j + b) for a in range(m) for b in range(m)]
            if not all(ok[c] for c in cells): continue
            v = [hs[c] for c in cells]; mean = sum(v) / len(v); sd = (sum((x - mean) ** 2 for x in v) / len(v)) ** 0.5
            if best is None or sd < best[0]: best = (sd, i, j)
    if best is None: return None
    return (best[1] / n, best[2] / n, (best[1] + m) / n, (best[2] + m) / n)


# the scene season of each region (as in js/00-regions.js): find from, find to, target day
SEASONS = {'iceland': ('08-01', '10-15', '09-30'), 'norway': ('07-20', '09-30', '09-01'), 'svalbard': ('07-20', '09-15', '08-25'), 'ch': ('07-01', '09-20', '09-01')}
REGION_FILES = [('vatnajokull.js', 'iceland', 12), ('iceland.js', 'iceland', 12), ('norway.js', 'norway', 13), ('svalbard.js', 'svalbard', 12)]
FOOTPRINTS = os.path.join(ROOT, 'scripts', '.footprints-ch.json')      # the picture boxes of the Swiss glaciers as the page makes them (scripts/dump_footprints.py): imageFootprint(g)


def unmerc(x, y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


DONOR_CLOUD = 0.25      # a donor may have up to this share of cloud over the glacier and over the tongue (the old gate was 10 % and 5 %, which left glaciers in cloudy valleys, like the Gorner, without any donor): its cloud is taken out pixel by pixel (clear_donor), and the score below prefers the clearer scene


def clear_donor(f, arr, bbox, W, H, grow=3):
    """takes the cloud, cirrus and cloud shadow of a donor scene out of its valid mask (plane MASK), from its own QA_PIXEL at the picture's resolution (cloud medium confidence or more, cirrus
    medium, the dilated-cloud flag; cloud shadow is not taken out: in the Alps its flag mostly marks the shade of the mountains, a quarter of the picture; never on a pixel flagged snow or ice, as in score()), grown by `grow` pixels (the thin edge of a cloud is not flagged): a cloud in the donor would
    otherwise be copied into the stripes of the Landsat 7 picture, where it shows as a bright patch. Returns the share of the picture taken out."""
    px = W * H; qa = cut(f['id'], ['qa_pixel'], bbox, W, H, True)[1]; bad = bytearray(px)
    for i in range(px):
        v = qa[i]
        if qa[px + i] == 0 or v & 1 or v & 0b100000: continue
        if v & 0b10 or ((v & 0b1000) and ((v >> 8) & 3) >= 2) or ((v & 0b100) and ((v >> 14) & 3) >= 2): bad[i] = 1
    for _ in range(grow):      # one pixel wider, grow times
        t = bytearray(bad)
        for y in range(H):
            r = y * W
            for x in range(W):
                if bad[r + x]: t[r + max(x - 1, 0)] = t[r + min(x + 1, W - 1)] = 1; t[max(y - 1, 0) * W + x] = t[min(y + 1, H - 1) * W + x] = 1
        bad = t
    n = 0
    for i in range(px):
        if bad[i] and arr[MASK * px + i]: arr[MASK * px + i] = 0; n += 1
    return n / px


def find_donor(best, year, bounds, bbox, masks, refs, W, H, count=3):
    """a scene without stripes to fill those of a Landsat 7 scene taken after its scan line corrector failed (31 May 2003): not Landsat 7 after that day, not Landsat 8, not more than DONOR_CLOUD cloud over the glacier and the tongue, whole picture,
    the closest to the date of `best` in the season (day of the year) and in years (at most 3 years apart); registered onto the Sentinel-2 mosaic like every scene, its own cloud taken out. Returns up to
    `count` of them, best first, as a list of (bands, info): the first fills the stripes where it is clear, the next ones what is left."""
    import datetime
    d0 = datetime.date.fromisoformat(best['date']); found = []
    for y in range(year - 3, year + 4):
        for f in candidates(bounds, y):
            p = f['properties']; day = p['datetime'][:10]
            if f['id'] == best['id'] or day in REJECT or p['platform'] in EXCLUDE or p['platform'] == 'landsat-8' or (p['platform'] == 'landsat-7' and day >= SLC_OFF): continue      # never Landsat 8: its surface reflectance has other colours (yellow, olive) that would show in the filled stripes
            try: sc = score(f, bbox, masks)
            except Exception: continue
            if sc['cover'] < 0.9 or sc['cloud'] > DONOR_CLOUD or sc['tcloud'] > DONOR_CLOUD or sc['snow'] > best['snow'] + 0.15: continue
            dd = datetime.date.fromisoformat(day); doy = abs((dd.replace(year=d0.year) - d0).days)
            if doy > 45: continue
            found.append((doy + 120 * abs(y - year) + 200 * sc['cloud'] + 100 * sc['snow'], day, p['platform'], f))
    donors = []
    for _, day, plat, f in sorted(found, key=lambda t: t[0]):
        arr = bands(f, bbox, W, H); gone = clear_donor(f, arr, bbox, W, H); sx, sy, c, c0 = register(refs, arr, W, H)
        if (sx, sy) != (0, 0) and c - c0 >= 0.03: arr = shifted(arr, W, H, sx, sy)
        elif c0 < 0.12: continue
        print(f'    donor {day} {plat} (correlation {max(c, c0):.2f}, cloud taken out {gone:.1%})'); donors.append((arr, {'date': day, 'id': f['id'], 'sat': plat}))
        if len(donors) == count: break
    return donors


def find_outlet(oid):
    """(outlet record, region, rings of all the ice around it ([lat, lon]), terrain zoom, bbox in Web Mercator)"""
    for fn, region, z in REGION_FILES:
        t = open(os.path.join(ROOT, 'data', fn), encoding='utf-8').read(); d = json.loads(t[t.index('{'):t.rindex('}') + 1])
        o = next((x for x in d['outlets'] if x['id'] == oid), None)
        if o:
            dlat = (o.get('halfH') or o['half']) / 111.32; dlon = o['half'] / (111.32 * math.cos(math.radians(o['lat'])))
            (x0, y0), (x1, y1) = merc(o['lat'] - dlat, o['lon'] - dlon), merc(o['lat'] + dlat, o['lon'] + dlon)
            rings = [r for src in [o] + [x for x in d['outlets'] if x['id'] != oid] + d['basins'] for r in src['outline']]
            return o, region, rings, z, [round(x0), round(y0), round(x1), round(y1)]
    if os.path.exists(FOOTPRINTS):
        fp = json.load(open(FOOTPRINTS)).get(oid)
        if fp:
            t = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read(); d = json.loads(t[t.index('{'):t.rindex('}') + 1])
            rings = [[[lat, lon] for lon, lat in poly[0]] for g in d['glaciers'] for poly in ((g.get('oldest') or {}).get('outline') or {}).get('coordinates', [])]
            return dict(id=oid, name=fp['name'], lat=fp['lat'], lon=fp['lon'], tip=fp.get('tip')), 'ch', rings, 13, fp['bbox']
    rec = find_record(oid)
    if rec: return rec
    sys.exit(f'{oid}: not in the data files of the regions, not in {FOOTPRINTS} (python3 scripts/dump_footprints.py), and no record data/regions/<region>/{oid}/glacier.json with a picture box')


def find_record(oid):
    """the same tuple from the record of the glacier (data/regions/<region>/<id>/glacier.json, outlines.json): for glaciers onboarded with the walkthrough, which are in no data file yet. The season is the record's own
    scene rule (days before and after the end of its balance year); region 'is*' leaves Landsat 8 out like Iceland. None when there is no record, no picture box or no outline written out in the record."""
    import datetime, glob
    hits = glob.glob(os.path.join(ROOT, 'data', 'regions', '*', oid, 'glacier.json'))
    if not hits: return None
    rec = json.load(open(hits[0], encoding='utf-8')); pl = rec.get('placement') or {}; pb = pl.get('pictureBox')
    if not pb: sys.exit(f'{oid}: the record has no picture box yet: place it in the walkthrough first (the Landsat picture follows the box)')
    (la0, lo0), (la1, lo1) = pb; (x0, y0), (x1, y1) = merc(la0, lo0), merc(la1, lo1)
    rings = []
    op = os.path.join(os.path.dirname(hits[0]), 'outlines.json')
    if os.path.exists(op):
        for ep in json.load(open(op, encoding='utf-8')).get('epochs', []):
            for ft in (ep.get('geojson') or {}).get('features', []):
                g = ft['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']] if g['type'] == 'Polygon' else []
                rings += [[[lat, lon] for lon, lat in ring] for poly in polys for ring in poly]
    if not rings: sys.exit(f'{oid}: no outline is written out in the record (outlines.json holds only references into data files): the ice-free reference patch needs it')
    by = rec.get('balanceYear') or {}; rule = rec.get('sceneRule') or {}; end = by.get('end') or '09-30'
    ref = datetime.date(2001, int(end[:2]), int(end[3:5]))      # a non-leap year: only month and day matter
    f = lambda d: (ref + datetime.timedelta(days=d)).strftime('%m-%d')
    global SEASONS
    SEASONS = {**SEASONS, rec['region']: (f(-rule.get('daysBeforeEnd', 60)), f(rule.get('daysAfterEnd', 15)), end)}
    c = rec.get('centre') or [(la0 + la1) / 2, (lo0 + lo1) / 2]
    o = dict(id=oid, name=rec['name'], lat=c[0], lon=c[1], tip=pl.get('tip'))
    return o, rec['region'], rings, 12 if rec['region'].startswith('is') else 13, [round(x0), round(y0), round(x1), round(y1)]


def write_alternatives(a, o, bbox, W, H, mpp, refs, cal, cands, chosen, masks):
    """the best a.alternatives scenes of every year, each registered on the Sentinel-2 mosaic like the real build and painted plainly (natural colours, the same colour matching; Landsat 7 stripes are
    left as no data, no fill: a preview to compare scenes, not the picture of the site) -> .cache/landsat-alts/<outlet>/<year>-<n>.jpg and .cache/landsat-alts/<outlet>.json"""
    d = os.path.join(ROOT, '.cache', 'landsat-alts'); os.makedirs(os.path.join(d, a.outlet), exist_ok=True)
    try: cur = json.load(open(os.path.join(ROOT, 'data', 'landsat', a.outlet + '.json')))['scenes']
    except Exception: cur = {}
    years = {}; tw = min(W, 640); th = round(H * tw / W)
    for year in sorted(cands):
        out = []
        for n, c in enumerate(cands[year][:a.alternatives]):
            arr = bands(c['item'], bbox, W, H); sx, sy, cc, c0 = register(refs, arr, W, H); dist = math.hypot(sx, sy) * mpp
            ok = (sx, sy) != (0, 0) and cc - c0 >= 0.03 and (dist <= 150 or (cc - c0 >= 0.08 and cc >= 0.2 and dist <= 1500)); good = (ok and cc >= 0.12) or (not ok and c0 >= 0.12)
            if ok: arr = shifted(arr, W, H, sx, sy)
            bufs, hole = paint(arr, W, H, cal, qmap_for(arr, W, H, masks[0]) if c['sat'] == 'landsat-8' else None)
            for i in range(W * H):
                if hole[i]: bufs['natural'][3 * i:3 * i + 3] = bytes((28, 41, 48))
            Image.frombytes('RGB', (W, H), bytes(bufs['natural'])).resize((tw, th), Image.LANCZOS).save(os.path.join(d, a.outlet, f'{year}-{n}.jpg'), quality=84, optimize=True)
            out.append({**{k: round(c[k], 3) if isinstance(c[k], float) else c[k] for k in ('date', 'id', 'sat', 'path', 'row', 'time', 'sun', 'cloud', 'tcloud', 'snow', 'clear', 'partial', 'cover')},
                        'shiftM': [round(sx * mpp), round(sy * mpp)] if ok else None, 'positionConfirmed': bool(good), 'current': cur.get(str(year), {}).get('id') == c['id'], 'img': f'{year}-{n}.jpg'})
            print(f'  {year} #{n + 1}: {c["date"]} {c["sat"]} cloud {c["cloud"]:.0%} tongue {c.get("tcloud", 0):.0%} cover {c["cover"]:.0%}{"  (current)" if out[-1]["current"] else ""}{"" if good else "  position not confirmed"}')
        years[str(year)] = out
    with open(os.path.join(d, a.outlet + '.json'), 'w', encoding='utf-8') as f: json.dump({'outlet': a.outlet, 'w': tw, 'h': th, 'years': years, 'rejected': sorted(REJECT), 'madeAt': time.strftime('%Y-%m-%d %H:%M')}, f, indent=1)
    print('wrote', os.path.join(d, a.outlet + '.json'))


def restyle(a, o, W, H, bbox, out):
    """Paints only the styles in a.styles again (false3 = HOT, for instance) for the scenes, shifts and donor scenes already written in data/landsat/<outlet>.json, with the same colour reference and
    stripe fill as the build, and adds the style to the json's `styles`; no pictures of other styles and no scene entries are touched. The flow direction of the fill reads the current guide, so a pixel
    interpolated along the flow can differ a little from the other styles where no donor covers it."""
    global GQ_REF, RUN
    unknown = [k for k in a.styles if k not in FILE_SUFFIX or k == 'natural']
    if unknown: sys.exit(f'--styles: {unknown} cannot be painted alone (one of {[k for k in FILE_SUFFIX if k != "natural"]})')
    RUN = list(a.styles)
    mp = os.path.join(out, a.outlet + '.json'); J = json.load(open(mp, encoding='utf-8')); S = J['scenes']
    if not S: print('no Landsat scenes in', mp, '- nothing to paint'); return
    levels = {}; gqs = []
    for y, sc in S.items():      # the reference of the build: Landsat 5 / 7 scenes of every year
        if sc['sat'] == 'landsat-8': continue
        arr = bands(sc, bbox, W, H); levels[y] = land_levels(arr, W, H); gqs.append(ground_q(arr, W, H, None))
    cal = [[sorted(l[c][q] for l in levels.values())[len(levels) // 2] for q in range(2)] for c in range(MASK)]
    GQ_REF = [[sorted(g[c][q] for g in gqs if g[c])[len([g for g in gqs if g[c]]) // 2] for q in range(len(GQ))] if any(g[c] for g in gqs) else None for c in range(MASK)]
    mpp = (bbox[2] - bbox[0]) / W * math.cos(math.radians(o['lat']))
    sref = sentinel_reference(bbox, W, H); guide = site_guide(o, bbox, W, H) or list(sref[:W * H]); refs = {f: edge_image(sref, W, H, f) for f in (8, 2, 1)}
    for y in sorted(S, key=int):
        if a.years and int(y) not in a.years: continue
        sc = S[y]; arr = bands(sc, bbox, W, H)
        if sc.get('shiftM') and tuple(sc['shiftM']) != (0, 0): arr = shifted(arr, W, H, round(sc['shiftM'][0] / mpp), round(sc['shiftM'][1] / mpp))
        donors = []
        for d in sc.get('fills', []):
            da = bands(d, bbox, W, H); clear_donor(d, da, bbox, W, H); sx, sy, c, c0 = register(refs, da, W, H)
            if (sx, sy) != (0, 0) and c - c0 >= 0.03: da = shifted(da, W, H, sx, sy)
            elif c0 < 0.12: continue
            donors.append(da)
        print(f'  {y} {sc["date"]} {sc["sat"]}: {len(donors)} donor scene(s)')
        imgs, _ = render(arr, W, H, cal, donors, guide, qmap_for(arr, W, H, None) if sc['sat'] == 'landsat-8' else None)
        for k, img in imgs.items(): img.save(os.path.join(out, a.outlet, f'{y}{FILE_SUFFIX[k]}.jpg'), quality=88, optimize=True, progressive=True)
    J['styles'] = list(dict.fromkeys([*J.get('styles', []), *a.styles]))
    with open(mp, 'w', encoding='utf-8') as f: json.dump(J, f, indent=1, ensure_ascii=False)
    print('wrote', mp, 'styles', J['styles'])


def main():
    global SEASON, LAND, REG, EXCLUDE, NOMATCH
    NOMATCH = False
    ap = argparse.ArgumentParser()
    ap.add_argument('--outlet', default='breidamerkurjokull'); ap.add_argument('--from', dest='y0', type=int, default=1984); ap.add_argument('--to', dest='y1', type=int, default=2015)
    ap.add_argument('--years', nargs='*', type=int); ap.add_argument('--styles', nargs='*', help='only paint these styles (e.g. false3) again, for the scenes already chosen in data/landsat/<outlet>.json: the other pictures and the json scenes are left as they are');  ap.add_argument('--list', action='store_true'); ap.add_argument('--alternatives', type=int, nargs='?', const=3, help='no pictures for the site: the best N scenes of each year (default 3) as plain previews + .cache/landsat-alts/<outlet>.json, for the walkthrough selector'); ap.add_argument('--res', type=float, default=30.0, help='ground metres per picture pixel (30: the real pixels of Landsat)'); a = ap.parse_args()
    o, region, rings, zdem, bbox = find_outlet(a.outlet); SEASON = SEASONS[region]
    EXCLUDE = ('landsat-8',) if region in ('iceland', 'svalbard') or region.startswith('is') else ()      # Landsat 8 surface reflectance is over-corrected over the ice and water of Iceland (and probably Svalbard); in the Alps and Norway it is used (2013 to 2015)
    rj = os.path.join(ROOT, 'scripts', 'landsat-rejects.json')
    if os.path.exists(rj): REJECT.update(json.load(open(rj)).get(a.outlet, []))
    pj = os.path.join(ROOT, 'scripts', 'landsat-picks.json'); PICKS = json.load(open(pj)).get(a.outlet, {}) if os.path.exists(pj) else {}      # year -> scene id chosen by the owner in the walkthrough selector: that scene goes first
    tip = o.get('tip') or [o['lat'], o['lon']]; masks = masks_for(rings, tip, bbox) if not a.list or True else None
    s, w = unmerc(bbox[0], bbox[1]); n, e = unmerc(bbox[2], bbox[3])
    k = math.cos(math.radians(o['lat'])); W, H = round((bbox[2] - bbox[0]) * k / a.res), round((bbox[3] - bbox[1]) * k / a.res)      # one picture pixel = one Landsat pixel (30 m on the ground)
    print(f"{o['name']} ({region}): picture box {W} x {H} px, season {SEASON}")
    if a.outlet == 'breidamerkurjokull': REG = (0.50, 0.20, 0.98, 0.95)      # hand-chosen ground to register on and to match the colours on (LAND)
    else:
        REG = (0.02, 0.02, 0.98, 0.98)      # the whole picture: only rock, gravel, water and shore count (edge_image leaves the bright ice, snow and cloud out)
        NOMATCH = False
        LAND = auto_land(rings, (s, w, n, e), zdem) or auto_land(rings, (s, w, n, e), zdem, size=0.1, min_h=5)      # a small patch of land if the picture has no big one (calving glaciers: the picture is ice and sea)
        if LAND: print('colour reference patch (west, north, east, south):', [round(v, 2) for v in LAND])
        else: NOMATCH = True; LAND = (0.0, 0.0, 0.1, 0.1); print('no ice-free land in the picture: the colours of the years are not matched to each other')
    out = os.path.join(ROOT, 'data', 'landsat'); os.makedirs(os.path.join(out, a.outlet), exist_ok=True)
    if a.styles: return restyle(a, o, W, H, bbox, out)
    scenes = {}; chosen = {}; cands = {}
    for year in [y for y in (a.years or range(a.y0, a.y1 + 1)) if y not in LEAVE_OUT_YEARS + LEAVE_OUT_BY_OUTLET.get(a.outlet, ())]:
        days = []
        for f in candidates((s, w, n, e), year):
            p = f['properties']
            try: sc = score(f, bbox, masks)
            except Exception as ex: print(f'  {f["id"]}: {ex}'); continue
            days.append({**sc, 'date': p['datetime'][:10], 'id': f['id'], 'sat': p['platform'], 'path': p['landsat:wrs_path'], 'row': p['landsat:wrs_row'], 'time': p['datetime'][11:16], 'sun': round(p.get('view:sun_elevation', 0), 1), 'item': f})
        cands[year] = ranked(days, year)
        if str(year) in PICKS: cands[year].sort(key=lambda d: d['id'] != PICKS[str(year)])      # stable: the owner's pick first, the rest in the order of the rule
        best = cands[year][0] if cands[year] else None
        print(year, f'{len(days)} scenes', '->', best and f'{best["date"]} {best["sat"]} cloud {best["cloud"]:.0%} tongue {best.get("tcloud", 0):.0%} snow {best["snow"]:.0%} cover {best["cover"]:.0%}' or 'none')
        if a.list:
            for d in sorted(days, key=lambda d: d['date']): print(f'    {d["date"]} {d["sat"]:10} P{d["path"]}R{d["row"]} cloud {d["cloud"]:4.0%} tongue {d.get("tcloud", 0):4.0%} snow {d["snow"]:4.0%} cover {d["cover"]:4.0%}')
        if best and not a.list: chosen[year] = best
    if a.list: return
    # the colours of the years are matched to one reference: the average levels of the LAND patch over all Landsat 5 and 7 pictures of every year (not only of the years asked for)
    levels = {}; gqs = []; global GQ_REF
    for year in range(a.y0, a.y1 + 1):
        try:
            b = chosen.get(year) or pick([{**score(f, bbox, masks), 'date': f['properties']['datetime'][:10], 'sat': f['properties']['platform'], 'item': f} for f in candidates((s, w, n, e), year)], year)
            if b and b['sat'] != 'landsat-8': arr = bands(b['item'], bbox, W, H); levels[year] = land_levels(arr, W, H); gqs.append(ground_q(arr, W, H, masks[0]))      # Landsat 8 is not part of the reference: it is matched to it
        except Exception as ex: print('  reference', year, ex)
    cal = [[sorted(l[c][q] for l in levels.values())[len(levels) // 2] for q in range(2)] for c in range(MASK)]
    GQ_REF = [[sorted(g[c][q] for g in gqs if g[c])[len([g for g in gqs if g[c]]) // 2] for q in range(len(GQ))] if any(g[c] for g in gqs) else None for c in range(MASK)]
    print('reference ground levels (Landsat 5/7, median of', len(levels), 'years):', [[round(v, 3) for v in c] for c in cal])
    # the pictures are registered onto the Sentinel-2 mosaic: a scene can lie tens of metres off, which makes a timelapse jump
    mpp = (bbox[2] - bbox[0]) / W * math.cos(math.radians(o['lat'])); shifts = {}
    sref = sentinel_reference(bbox, W, H); guide = site_guide(o, bbox, W, H) or list(sref[:W * H]); refs = {f: edge_image(sref, W, H, f) for f in (8, 2, 1)}
    if a.alternatives: return write_alternatives(a, o, bbox, W, H, mpp, refs, cal, cands, chosen, masks)
    for year in sorted(chosen):
        for best in cands[year]:      # the best scene first; one whose position cannot be checked (the picture matches the Sentinel-2 mosaic nowhere) or is far off is passed over for the next
            arr = bands(best['item'], bbox, W, H)
            sx, sy, c, c0 = register(refs, arr, W, H)
            dist = math.hypot(sx, sy) * mpp
            ok = (sx, sy) != (0, 0) and c - c0 >= 0.03 and (dist <= 150 or (c - c0 >= 0.08 and c >= 0.2 and dist <= 1500))      # a clear gain; a small shift is normal, a big one (some early Landsat 5 scenes lie 500 to 1,000 m off) needs a clear and strong match: a weak one far away is noise
            good = (ok and c >= 0.12) or (not ok and c0 >= 0.12)
            print(f'  {year} {best["date"]}: lies {sx * mpp:+.0f} m east, {sy * mpp:+.0f} m south of the Sentinel-2 mosaic (correlation {c:.2f}, {c0:.2f} unshifted){"  -> shifted" if ok else ""}{"" if good else "  -> position not confirmed: next scene"}')
            if good: break
        else: print(f'  {year}: no scene with a confirmed position'); continue
        if ok: shifts[year] = (sx, sy); arr = shifted(arr, W, H, sx, sy)
        donors, dinfo = [], None
        if (best['sat'] == 'landsat-7' and best['date'] >= SLC_OFF) or best['cover'] < 0.98:      # stripes of Landsat 7, or the picture runs off the edge of the scene (no data along one side): the same donors fill it
            found = find_donor(best, year, (s, w, n, e), bbox, masks, refs, W, H); donors = [d for d, _ in found]; dinfo = [i for _, i in found]
        imgs, filled = render(arr, W, H, cal, donors, guide, qmap_for(arr, W, H, masks[0]) if best['sat'] == 'landsat-8' else None)
        for k, img in imgs.items(): img.save(os.path.join(out, a.outlet, f'{year}{FILE_SUFFIX[k]}.jpg'), quality=88, optimize=True, progressive=True)
        scenes[year] = {k: round(best[k], 3) if isinstance(best[k], float) else best[k] for k in ('date', 'id', 'sat', 'path', 'row', 'time', 'sun', 'cloud', 'tcloud', 'snow', 'clear', 'cover')}
        if shifts.get(year) and shifts[year] != (0, 0): scenes[year]['shiftM'] = [round(shifts[year][0] * mpp), round(shifts[year][1] * mpp)]      # how far the scene lay east and south of the reference, in metres: corrected
        if dinfo: scenes[year]['fill'] = dinfo[0]; scenes[year]['fills'] = dinfo      # the second scenes whose pixels fill the stripes (`fill`: the first, which the page's cache key uses)
        if filled > 0.002: scenes[year]['filled'] = round(filled, 3)      # the share of the picture interpolated across the stripes of Landsat 7
    mp = os.path.join(out, a.outlet + '.json'); old = {}
    if os.path.exists(mp) and a.years:
        with open(mp, encoding='utf-8') as f: old = json.load(f).get('scenes', {})
    old.update({str(k): v for k, v in scenes.items()})
    with open(mp, 'w', encoding='utf-8') as f:
        json.dump({'bbox': bbox, 'w': W, 'h': H, 'scenes': dict(sorted(old.items())), 'styles': list(RUN),
                   'source': 'Landsat Collection 2 Level-2 surface reflectance, courtesy of the U.S. Geological Survey (public domain), via the Microsoft Planetary Computer', 'gsd': 30}, f, indent=1, ensure_ascii=False)
    print('wrote', mp, len(old), 'years')


if __name__ == '__main__':
    main()
