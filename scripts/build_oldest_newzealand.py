#!/usr/bin/env python3
"""The oldest aerial picture of a New Zealand glacier's picture box -> data/oldest/<glacier>.webp (+ .json)

Source: the scanned aerial photographs of 1986-1987 in the LINZ imagery catalogue (Toitū Te Whenua Land Information New Zealand, open STAC catalogue
https://nz-imagery.s3.ap-southeast-2.amazonaws.com/catalog.json, licence CC-BY-4.0): "West Coast / Canterbury 0.75m SN8585 (1986-1987)" (West Coast side of the Main Divide) and
"Canterbury / West Coast 0.96m SN8595 (1986-1987)". The collections state only an interval (1986-01-05 to 1987-04-11 and 1986-01-31 to 1987-02-14), no day per photograph, so the
page says "1986/87". The tiles are cloud-optimised GeoTIFFs in NZTM (EPSG:2193); they are read through their overviews, laid together and turned into Web Mercator (the map's own
projection) on the grid of the picture box, like build_oldest_iceland.py does for Iceland, so that the page lays the file on the map and on the 3D terrain like any other picture.
Ice and snow in scans of this age saturate: the picture is shown as it is (grey scale), not altered.

Needs rasterio, numpy, pyproj and Pillow. Usage: python3 scripts/build_oldest_newzealand.py [--glacier franz-josef]
"""
import argparse, concurrent.futures, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from rasterio.crs import CRS
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOGUE = 'https://nz-imagery.s3.ap-southeast-2.amazonaws.com/'
COLLECTIONS = ['west-coast/west-coast_canterbury_sn8585_1986-1987_0.75m/rgb/2193/', 'canterbury/canterbury_west-coast_sn8595_1986-1987_0.96m/rgb/2193/']
R = 6378137.0
MAX_SIDE = 3200
DARK = 8


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def get_json(url, tries=6):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'tonguesfromspace/1.0'}), timeout=60) as r: return json.load(r)
        except Exception:
            if k == tries - 1: raise
            time.sleep(2 * (k + 1))


def items_over(base, w, s, e, n):
    c = get_json(base + 'collection.json'); links = [l['href'] for l in c['links'] if l['rel'] == 'item']
    def one(h):
        it = get_json(urllib.parse.urljoin(base, h)); b = it['bbox']
        return it if b[0] < e and b[2] > w and b[1] < n and b[3] > s else None
    with concurrent.futures.ThreadPoolExecutor(6) as ex: hit = [x for x in ex.map(one, links) if x]
    return c, hit


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--glacier', default='franz-josef'); a = ap.parse_args()
    t = open(os.path.join(ROOT, 'data', 'newzealand.js'), encoding='utf-8').read()
    o = next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == a.glacier)
    (s, w), (n, e) = o['box']
    x0, y0 = merc(s, w); x1, y1 = merc(n, e); res = max(x1 - x0, y1 - y0) / MAX_SIDE; W, H = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
    dst_t = from_origin(x0, y1, res, res); out = np.zeros((H, W), np.uint8); have = np.zeros((H, W), bool)
    used = []
    for rel in COLLECTIONS:
        base = CATALOGUE + rel; c, hit = items_over(base, w, s, e, n)
        print(f"{c['title']}: {len(hit)} photographs over the box", file=sys.stderr)
        for it in hit:
            href = urllib.parse.urljoin(base, it['assets']['visual']['href'])
            with rasterio.open(href) as src:
                bands = min(src.count, 3); arr = np.zeros((H, W), np.float32)
                reproject(rasterio.band(src, 1), arr, src_transform=src.transform, src_crs=src.crs, dst_transform=dst_t, dst_crs=CRS.from_epsg(3857), resampling=Resampling.bilinear, src_nodata=src.nodata)
                ok = arr > DARK      # the black frame border of a scan and the blend with nothing at its edge are not picture: cut 1 pixel around them, another photograph fills the gap
                bad = ~ok
                for _ in range(1): bad = bad | np.roll(bad, 1, 0) | np.roll(bad, -1, 0) | np.roll(bad, 1, 1) | np.roll(bad, -1, 1)
                ok = ~bad
                put = ok & ~have; out[put] = np.clip(arr[put], 0, 255).astype(np.uint8); have |= put
            used.append(it['id'])
        if have.mean() > 0.95: break
    share = float(have.mean()); print(f'{len(used)} photographs, picture box covered to {share:.1%}', file=sys.stderr)
    if share < 0.05: sys.exit('nothing covers the picture box')
    os.makedirs(os.path.join(ROOT, 'data', 'oldest'), exist_ok=True)
    rgba = np.dstack([out, out, out, np.where(have, 255, 0).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(ROOT, 'data', 'oldest', a.glacier + '.webp'), quality=82, method=6)
    json.dump({'years': [1986, 1987], 'label': '1986/87', 'bbox': [round(x0), round(y0), round(x1), round(y1)], 'w': W, 'h': H, 'share': round(share, 3),
               'source': 'Toitū Te Whenua Land Information New Zealand (LINZ), scanned aerial photographs of 1986-1987, CC BY 4.0', 'catalogue': CATALOGUE + 'catalog.json'},
              open(os.path.join(ROOT, 'data', 'oldest', a.glacier + '.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
