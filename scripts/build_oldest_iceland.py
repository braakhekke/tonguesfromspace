#!/usr/bin/env python3
"""The oldest aerial picture of an Icelandic outlet's picture box -> data/oldest/<outlet>.webp (+ .json)

Source: the historical aerial image orthomosaics of Náttúrufræðistofnun Íslands (Icelandic Institute of Natural History) and Landmælingar Íslands, made from the institute's aerial photo
archive (catalogue records "Uppréttar sögulegar loftmyndir frá 1974 - 2000" and "... 1945 - 1970", CC BY 4.0), the WMS https://gis.lmi.is/mapcache/loftmyndasafn/isn93/wms, one layer per
year (aerial_photography_gallery_<year>), tiles in ISN93 (EPSG:3057, Lambert conformal conic). The mosaics are published as the photographs are placed; over Breiðamerkurjökull the oldest ones
that exist (October 2026) are 1980 (partly) and 1982; the 1945 to 1970 layers hold nothing there yet. So "Oldest" is 1980/1982: the 1980 mosaic where it has pictures, the 1982 one elsewhere.

The tiles are fetched at 8 m (512 px, tile-aligned), joined, and turned into Web Mercator (the map's own projection) on the grid of the picture box, so that the page lays the file on the map and on
the 3D terrain like any other picture. Needs Pillow (pip install pillow) for the pictures; otherwise the standard library. Python 3.8 or newer.
Usage: python3 scripts/build_oldest_iceland.py [--outlet breidamerkurjokull] [--years 1980 1982]
"""
import argparse, io, json, math, os, sys, urllib.parse, urllib.request
try:
    from PIL import Image
except ImportError:
    sys.exit('This script needs Pillow: pip install pillow')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_dem_iceland as fd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WMS = 'https://gis.lmi.is/mapcache/loftmyndasafn/isn93/wms'
RES, SIZE = 8, 512          # metres per pixel, pixels per tile: the 8 m level of the tile grid (origin 0, 0)
R = 6378137.0


def isn93(lon, lat):      # same projection as ISN2016, other false easting and northing
    x, y = fd.lcc(lon, lat)
    return x - 2700000 + 500000, y - 300000 + 500000


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def unmerc(x, y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


def tile(layer, x, y):
    span = RES * SIZE
    q = urllib.parse.urlencode(dict(service='WMS', version='1.1.1', request='GetMap', layers=layer, styles='', srs='EPSG:3057', bbox=f'{x},{y},{x + span},{y + span}', width=SIZE, height=SIZE, format='image/png', transparent='true'))
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(WMS + '?' + q, headers={'User-Agent': 'tonguesfromspace/1.0'}), timeout=120) as r: return Image.open(io.BytesIO(r.read())).convert('RGBA')
        except Exception as e: last = e
    raise last


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--outlet', default='breidamerkurjokull'); ap.add_argument('--years', nargs='*', type=int, default=[1980, 1982]); a = ap.parse_args()
    t = open(os.path.join(ROOT, 'data', 'vatnajokull.js'), encoding='utf-8').read()
    o = next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == a.outlet)
    dlat = o['half'] / 111.32; dlon = o['half'] / (111.32 * math.cos(math.radians(o['lat'])))
    s, w, n, e = o['lat'] - dlat, o['lon'] - dlon, o['lat'] + dlat, o['lon'] + dlon
    (mx0, my0), (mx1, my1) = merc(s, w), merc(n, e)
    corners = [isn93(lo, la) for la in (s, n) for lo in (w, e)]
    ex = [c[0] for c in corners]; ey = [c[1] for c in corners]; pad = 400
    gx0, gy0 = int((min(ex) - pad) // (RES * SIZE)), int((min(ey) - pad) // (RES * SIZE)); gx1, gy1 = int((max(ex) + pad) // (RES * SIZE)), int((max(ey) + pad) // (RES * SIZE))
    W, H = (gx1 - gx0 + 1) * SIZE, (gy1 - gy0 + 1) * SIZE; print(f'{(gx1 - gx0 + 1) * (gy1 - gy0 + 1)} tiles per year, source {W} x {H} px')
    src = Image.new('RGBA', (W, H), (0, 0, 0, 0)); covered = {}
    for year in sorted(a.years, reverse=True):      # the newer year first, the older one over it where it has pictures
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                tl = tile(f'aerial_photography_gallery_{year}', gx * RES * SIZE, gy * RES * SIZE)
                layer.paste(tl, ((gx - gx0) * SIZE, (gy1 - gy) * SIZE))      # north up: the largest y is the top row
        covered[year] = round(sum(1 for v in layer.getchannel('A').get_flattened_data() if v > 10) / (W * H), 3)
        print(year, 'share of the source with pictures:', covered[year])
        src = Image.alpha_composite(src, layer)
    # onto Web Mercator: the output grid of the picture box at about 10 m, by a mesh of small quads
    ow = oh = int(round(2 * o['half'] * 1000 / 10)); out_x0, out_x1, out_y0, out_y1 = mx0, mx1, my0, my1
    cells = 48; mesh = []
    def srcxy(px, py):      # output pixel -> pixel of the joined source
        mx, my = out_x0 + px / ow * (out_x1 - out_x0), out_y1 - py / oh * (out_y1 - out_y0); la, lo = unmerc(mx, my); x, y = isn93(lo, la)
        return (x - gx0 * RES * SIZE) / RES, (gy1 + 1) * RES * SIZE / RES - y / RES
    for j in range(cells):
        for i in range(cells):
            x0, x1, y0, y1 = i * ow // cells, (i + 1) * ow // cells, j * oh // cells, (j + 1) * oh // cells
            mesh.append(((x0, y0, x1, y1), (*srcxy(x0, y0), *srcxy(x0, y1), *srcxy(x1, y1), *srcxy(x1, y0))))
    img = src.transform((ow, oh), Image.MESH, mesh, Image.BILINEAR)
    share = round(sum(1 for v in img.getchannel('A').get_flattened_data() if v > 10) / (ow * oh), 3); print(f'output {ow} x {oh} px, {share:.0%} with pictures')
    os.makedirs(os.path.join(ROOT, 'data', 'oldest'), exist_ok=True)
    path = os.path.join(ROOT, 'data', 'oldest', a.outlet + '.webp'); img.save(path, 'WEBP', quality=80, method=6)      # with transparency: where no photograph exists the map shows through
    json.dump({'years': sorted(a.years), 'label': '/'.join(str(y)[-2:] if i else str(y) for i, y in enumerate(sorted(a.years))), 'bbox': [round(mx0), round(my0), round(mx1), round(my1)], 'w': ow, 'h': oh, 'share': share,
               'source': 'Náttúrufræðistofnun Íslands and Landmælingar Íslands, historical aerial image orthomosaics (CC BY 4.0)', 'wms': WMS}, open(os.path.join(ROOT, 'data', 'oldest', a.outlet + '.json'), 'w'), indent=1)
    print(f'wrote {path} ({os.path.getsize(path) / 1024:.0f} kB)')


if __name__ == '__main__':
    main()
