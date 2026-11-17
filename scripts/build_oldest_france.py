#!/usr/bin/env python3
"""The oldest aerial picture of a French glacier's picture box -> data/oldest/<glacier>.webp (+ .json), in Web Mercator over the picture box like build_oldest_newzealand.py.

Source: IGN, BD ORTHO Historique (the layer ORTHOIMAGERY.ORTHOPHOTOS.1950-1965 of the Géoplateforme WMTS https://data.geopf.fr/wmts, style BDORTHOHISTORIQUE: grey scale, black made transparent), digitised
and mosaicked IGN aerial photographs of the 1950s to 1960s; the catalogue record (IGNF_BD-ORTHO-HISTO) says "Licence Ouverte / Open License". The year of the flight is read from the mosaic graph of the
same layer (WFS layer ORTHOIMAGERY.ORTHOPHOTOS.GRAPHE.1950-1965:graphe_bdortho, field date_vol); every graph polygon over the box is listed in the json. Shown as delivered (not altered).

Needs numpy and Pillow. Usage: python3 scripts/build_oldest_france.py [--glacier mer-de-glace] [--zoom 15]
"""
import argparse, concurrent.futures, io, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6378137.0
WMTS = 'https://data.geopf.fr/wmts'
LAYER, STYLE = 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965', 'BDORTHOHISTORIQUE'
GRAPH = 'ORTHOIMAGERY.ORTHOPHOTOS.GRAPHE.1950-1965:graphe_bdortho'
MAX_SIDE = 3200


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def get(url, tries=6):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'tonguesfromspace/1.0'}), timeout=60) as r: return r.read()
        except Exception:
            if k == tries - 1: raise
            time.sleep(2 * (k + 1))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--glacier', default='mer-de-glace'); ap.add_argument('--zoom', type=int, default=15); a = ap.parse_args()
    t = open(os.path.join(ROOT, 'data', 'france.js'), encoding='utf-8').read()
    o = next(x for x in json.loads(t[t.index('{'):t.rindex('}') + 1])['outlets'] if x['id'] == a.glacier)
    (s, w), (n, e) = o['box']; x0, y0 = merc(s, w); x1, y1 = merc(n, e)
    z = a.zoom; world = 2 * math.pi * R; ts = world / 2 ** z; ox = -world / 2
    c0, c1 = int((x0 - ox) // ts), int((x1 - ox) // ts); r0, r1 = int((world / 2 - y1) // ts), int((world / 2 - y0) // ts)
    print(f'tiles {c1 - c0 + 1} x {r1 - r0 + 1} at zoom {z}', file=sys.stderr)
    def one(rc):
        r, c = rc
        u = WMTS + '?' + urllib.parse.urlencode({'SERVICE': 'WMTS', 'REQUEST': 'GetTile', 'VERSION': '1.0.0', 'LAYER': LAYER, 'STYLE': STYLE, 'TILEMATRIXSET': 'PM_0_18', 'TILEMATRIX': z, 'TILEROW': r, 'TILECOL': c, 'FORMAT': 'image/png'})
        return rc, Image.open(io.BytesIO(get(u))).convert('RGBA')
    mosaic = Image.new('RGBA', ((c1 - c0 + 1) * 256, (r1 - r0 + 1) * 256), (0, 0, 0, 0))
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for (r, c), im in ex.map(one, [(r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]): mosaic.paste(im, ((c - c0) * 256, (r - r0) * 256))
    px = ts / 256; mx0, my1 = ox + c0 * ts, world / 2 - r0 * ts      # the mosaic's top-left corner in Web Mercator
    box = (round((x0 - mx0) / px), round((my1 - y1) / px), round((x1 - mx0) / px), round((my1 - y0) / px))
    crop = mosaic.crop(box); k = MAX_SIDE / max(crop.size)
    if k < 1: crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    alpha = np.array(crop)[:, :, 3]; share = float((alpha > 0).mean()); print(f'picture box {crop.size}, covered to {share:.1%}', file=sys.stderr)
    if share < 0.05: sys.exit('nothing covers the picture box')
    # the flight dates of the mosaic graph over the box
    u = 'https://data.geopf.fr/wfs/ows?' + urllib.parse.urlencode({'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature', 'TYPENAMES': GRAPH, 'OUTPUTFORMAT': 'application/json', 'BBOX': f'{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326'})
    flights = sorted({f['properties']['date_vol'].rstrip('Z') for f in json.loads(get(u))['features']})
    years = sorted({int(d[:4]) for d in flights}); print('flights over the box:', flights, file=sys.stderr)
    os.makedirs(os.path.join(ROOT, 'data', 'oldest'), exist_ok=True)
    crop.save(os.path.join(ROOT, 'data', 'oldest', a.glacier + '.webp'), quality=82, method=6)
    json.dump({'years': years, 'label': ' / '.join(str(y) for y in years), 'flights': flights, 'bbox': [round(x0), round(y0), round(x1), round(y1)], 'w': crop.width, 'h': crop.height, 'share': round(share, 3),
               'source': "IGN, BD ORTHO Historique (orthophotographies of 1950-1965, grey scale), Licence Ouverte", 'catalogue': 'https://cartes.gouv.fr/catalogue/dataset/IGNF_BD-ORTHO-HISTO'},
              open(os.path.join(ROOT, 'data', 'oldest', a.glacier + '.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
