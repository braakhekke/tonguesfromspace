#!/usr/bin/env python3
"""Share of non-ice pixels inside each glacier's SGI2023 outline, from swisstopo SWISSIMAGE.

Computed here (not a source figure): for every glacier of the size page the SGI2023 outline is laid over the
SWISSIMAGE aerial (WMTS, the latest edition) and every pixel inside it is called "ice or snow" or "debris/rock".
The share of debris pixels goes to data/debris-share.json and drives how much grit the ice ball of the 3D view
carries. SWISSIMAGE is a mosaic of flights of different years, so this is a rough measure, not a survey.

    python3 scripts/build_debris_share.py            # all glaciers
    python3 scripts/build_debris_share.py Zmutt Rhone  # some, and write overlays to the cache folder
"""
import json, math, re, sys, concurrent.futures as cf, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache' / 'swissimage'
Z = 15                       # about 3.3 m per pixel at 47 N
M_LAT = 111320               # as in size.html
URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'


def load_glaciers():
    s = (ROOT / 'size.html').read_text()
    m = re.search(r'window.SIZE_DATA=(\{.*?\});</script>', s, re.S)
    return json.loads(m.group(1))['glaciers']


def place(g, x, y):         # metres east/north of the glacier's origin -> lat, lon (rot 0), as in size.html
    return g['lat'] + y / M_LAT, g['lon'] + x / (M_LAT * math.cos(math.radians(g['lat'])))


def gpix(lat, lon):          # global pixel at zoom Z (Web Mercator, 256 px tiles)
    n = 256 * 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile(x, y):
    f = CACHE / f'{Z}_{x}_{y}.jpg'
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(4):
            try:
                with urllib.request.urlopen(URL.format(z=Z, x=x, y=y), timeout=30) as r:
                    f.write_bytes(r.read())
                break
            except Exception:
                pass
        else:
            return None
    return Image.open(f).convert('RGB')


def classify(rgb):
    """True where the pixel is debris/rock, False for ice and snow. rgb: (h, w, 3) float 0..255.
    Ice and snow: bright, or tinted towards blue (shaded snow and ice stay blue). Debris and rock: grey or brown, not bright."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = .299 * r + .587 * g + .114 * b
    blueish = (b - r) > 10
    bright = lum > 165
    return ~(bright | blueish)


def measure(g, save=None):
    polys = g['new']
    pts = [gpix(*place(g, polys[i][0][k], polys[i][0][k + 1])) for i in range(len(polys)) for k in range(0, len(polys[i][0]), 2)]
    x0, x1 = int(min(p[0] for p in pts)) - 2, int(max(p[0] for p in pts)) + 3
    y0, y1 = int(min(p[1] for p in pts)) - 2, int(max(p[1] for p in pts)) + 3
    tx0, tx1, ty0, ty1 = x0 // 256, x1 // 256, y0 // 256, y1 // 256
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mos = Image.new('RGB', (W, H), (0, 0, 0))
    jobs = [(a, b) for b in range(ty0, ty1 + 1) for a in range(tx0, tx1 + 1)]
    missing = 0
    with cf.ThreadPoolExecutor(16) as ex:
        for (a, b), im in zip(jobs, ex.map(lambda ab: tile(*ab), jobs)):
            if im is None: missing += 1
            else: mos.paste(im, ((a - tx0) * 256, (b - ty0) * 256))
    mask = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(mask)
    for poly in polys:
        for ri, ring in enumerate(poly):
            xy = [(p[0] - tx0 * 256, p[1] - ty0 * 256) for p in (gpix(*place(g, ring[k], ring[k + 1])) for k in range(0, len(ring), 2))]
            d.polygon(xy, fill=255 if ri == 0 else 0)      # outer ring in, holes out
    m = np.array(mask) > 0
    rgb = np.array(mos).astype(np.float32)
    deb = classify(rgb) & m
    n, nd = int(m.sum()), int(deb.sum())
    if save:
        ov = rgb.copy()
        ov[deb] = ov[deb] * .35 + np.array([255, 40, 40]) * .65
        edge = m & ~(np.array(mask.filter(ImageFilter.MinFilter(5))) > 0)      # a thin yellow line along the outline
        ov[edge] = [255, 255, 0]
        ys, xs = np.where(m)
        Image.fromarray(ov.astype(np.uint8)).crop((xs.min() - 10, ys.min() - 10, xs.max() + 10, ys.max() + 10)).save(save)
    return {'pixels': n, 'debris': nd, 'share': round(nd / n, 4) if n else None, 'missingTiles': missing,
            'pixelAreaKm2': round(n * (156543.03392 * math.cos(math.radians(g['lat'])) / 2 ** Z) ** 2 / 1e6, 2)}


def main():
    want = [a for a in sys.argv[1:]]
    gl = [g for g in load_glaciers() if not want or g['name'] in want]
    out = {}
    for g in gl:
        sv = (CACHE / f"overlay_{g['name']}.png") if want else None
        r = measure(g, sv)
        out[g['id']] = {'name': g['name'], **r}
        print(f"{g['name']:11s} outline {g['area']:6.2f} km2 (pixels {r['pixelAreaKm2']:6.2f})  debris share {r['share']}  missing tiles {r['missingTiles']}", flush=True)
    if not want:
        (ROOT / 'data' / 'debris-share.json').write_text(json.dumps({
            'what': 'COMPUTED: share of pixels inside the SGI2023 outline that are not ice or snow (grey or brown, not bright, not blue-tinted), from swisstopo SWISSIMAGE (latest edition, zoom %d). A mosaic of flights of different years: a rough measure.' % Z,
            'glaciers': out}, indent=1))
        print('wrote data/debris-share.json')


if __name__ == '__main__':
    main()
