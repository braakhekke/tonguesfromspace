"""Finds the `kry-*` items of the swisstopo Spezialbefliegungen whose STAC bbox does not match their files, and writes the files' true extents (WGS84) to data/stac-bbox-fix.json.
Why: on 2026-11-10 57 items (flown 2016 to 2018, ingested in autumn 2026) carried a bbox that covered only a few percent of the DSM / orthophoto file (e.g. kry-2016-07-29t10220000: STAC bbox 7.958-7.971 E, file 7.958-8.118 E),
so a STAC search by bbox (build_special_flights.py, clean-yearly s02_flights.py) did not return them over the glaciers they cover. The extent is read from the COG headers (the DSM raster or the RGB mosaic), nothing is downloaded.
Run: experiments/aletsch-yearly-dem/.venv/bin/python scripts/fix_stac_bboxes.py   (reads every kry item once; ~300 header reads). A bbox counts as wrong when it holds under 80 % of the file's extent or is under half its size."""
import json, os, urllib.request
import rasterio
from pyproj import Transformer
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); OUT = os.path.join(ROOT, 'data', 'stac-bbox-fix.json')
STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.spezialbefliegungen'; t = Transformer.from_crs(2056, 4326, always_xy=True)
def items():
    seen = {}; url = STAC + '/items?limit=100'      # a bbox query would miss exactly the wrong-bbox items: page the whole collection and keep the kry-* items
    while url:
        d = json.load(urllib.request.urlopen(url))
        for f in d['features']:
            if f['id'].startswith('kry-'): seen[f['id']] = f
        url = next((l['href'] for l in d['links'] if l['rel'] == 'next'), None)
    return seen
def check(f):
    hs = [v['href'] for k, v in f['assets'].items() if k.endswith('dsm-raster.tif') or k.endswith('rgb-mosaic.tif')]; box = None
    for h in hs:
        b = rasterio.open(h).bounds; r = (*t.transform(b.left, b.bottom), *t.transform(b.right, b.top))
        box = r if box is None else (min(box[0], r[0]), min(box[1], r[1]), max(box[2], r[2]), max(box[3], r[3]))
    if box is None: return f['id'], None
    s = f['bbox']; ix = max(0, min(box[2], s[2]) - max(box[0], s[0])) * max(0, min(box[3], s[3]) - max(box[1], s[1])); ar = (box[2] - box[0]) * (box[3] - box[1]); sa = (s[2] - s[0]) * (s[3] - s[1])
    return f['id'], (None if ix / ar >= 0.8 and sa / ar >= 0.5 else [round(x, 5) for x in box])
if __name__ == '__main__':
    its = items(); print(len(its), 'kry items'); fix = {}
    with ThreadPoolExecutor(6) as ex:
        for i, b in ex.map(check, list(its.values())):
            if b: fix[i] = b
    json.dump(dict(note='True extent (west, south, east, north, WGS84) of the files of kry-* items whose STAC bbox does not match them; made by scripts/fix_stac_bboxes.py on %s.' % __import__('datetime').date.today(), items=dict(sorted(fix.items()))), open(OUT, 'w'), indent=1)
    print(len(fix), 'items with a wrong STAC bbox ->', OUT)
