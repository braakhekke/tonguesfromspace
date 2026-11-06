"""swisstopo special-flights imagery for the Swiss glaciers of the site: map tiles, an index, and the field-notes chapter.
For every glacier of data/glaciers.js (or those named on the command line) it writes
  data/special-flights/<SGI id>.json                 the flights per year (dates, areas, coverage), where each has data (tile lists of zoom 16), the COG addresses of swisstopo's files (natural colour and near infrared), and `fieldNotes` (the chapter of the field-notes page, HTML)
  data/special-flights/index.json                     the glaciers that have a file (the site reads it once)
Source: swisstopo "Spezialbefliegungen" (https://data.geo.admin.ch/browser/index.html#/collections/ch.swisstopo.spezialbefliegungen): the orthophoto assets DOP-RGB-MOSAIC (natural colour) and DOP-NRGB-16BIT
(near infrared) of the kry-* items, read from the Cloud Optimized GeoTIFFs by range requests (no download of the whole files). Terms of use read 2026-11-06 (open data, free use, source reference mandatory; ledger
docs/sources/switzerland-spezialbefliegungen.md). The map and the 3D view read the natural-colour flights live from swisstopo's own files (js/cog.js): a quick coarse picture first, then the sharpness the zoom needs, up to 0.1 m.
Selection rules (owner, 2026-11-05): only RGB and near-infrared orthophotos of a flight whose valid pixels touch the glacier outline of SGI 2023 (at least MIN_SHARE of its area); the rapid-mapping items (ram-*: quick
orthos on swissALTI3D, stripy near-infrared mosaics) are not flight blocks of the glacier and are not used; a natural-colour item that is false colour in disguise (e.g. the red 2024-08-20 Bitsch mosaic) is dropped by
FALSE_COLOUR_RG. Every flight of a year is its own layer (the best coverage painted last, on top); near-infrared lines (shown as N-R-G false colour, one stretch for the flight) of the same day become that flight's extra layer.
Run: experiments/aletsch-yearly-dem/.venv/bin/python scripts/build_special_flights.py [SGI id ...] [--force]   (needs numpy, pillow, scipy, pyproj, matplotlib, rasterio; a glacier whose file exists is skipped without --force;
`--notes-only` rewrites the field-notes chapter from the existing file). Moderate use of swisstopo's servers: glaciers one after the other."""
import argparse, glob, html, json, os, re, shutil, struct, urllib.request
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import map_coordinates, binary_erosion
from matplotlib.path import Path as MPath
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); OUT = os.path.join(ROOT, 'data', 'special-flights'); CACHE = os.path.join(ROOT, '.cache', 'special-flights')
MIN_SHARE = 0.01; EDGE = 3      # EDGE: pixels (4 m) trimmed from the border of every orthophoto: the border carries dark no-data fringes
FALSE_COLOUR_RG = 1.4      # a natural-colour mosaic whose mean red / mean green is above this is false colour in disguise and is not used
FP = 4.0      # metres per pixel of the footprint picture (coverage and edges), read from the COG overview
WM = 20037508.342789244; ZMIN = 12
INDEX_Z = 16      # the zoom of the tile lists in the file: where a flight has data (the site tests a finer tile against its parent)
STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.spezialbefliegungen'
ORTHO = {'DOP-RGB-MOSAIC': 'rgb', 'DOP-NRGB-16BIT': 'nirrg'}
m2l = Transformer.from_crs(3857, 2056, always_xy=True); l2m = Transformer.from_crs(2056, 3857, always_xy=True); w2l = Transformer.from_crs(4326, 2056, always_xy=True)

# ------------------------------------------------------------------ glaciers, outline, strip
def glaciers():
    t = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read(); return json.loads(t[t.index('{'):t.rindex('}') + 1])['glaciers']
def strip_corners(gid):      # the 3D strip of the glacier (the baked terrain file) as four LV95 points
    man = json.load(open(os.path.join(ROOT, 'data', 'terrain', 'manifest.json'))); fn = man[gid] if isinstance(man[gid], str) else man[gid]['file']
    b = open(os.path.join(ROOT, 'data', 'terrain', fn), 'rb').read(); hl = struct.unpack('<I', b[4:8])[0]; h = json.loads(b[8:8 + hl]); half = h.get('half', 2000); pts = []
    for aa in (h['up'], -h['back']):
        for bb in (-half, half): pts.append(((h['P'][0] + (aa * h['ue'] + bb * h['un']) * h['k']), (h['P'][1] + (aa * h['un'] - bb * h['ue']) * h['k'])))
    return [m2l.transform(x, y) for x, y in pts]
def outline_points(g, step=20.0):      # centres of a 20 m grid inside the SGI 2023 outline (holes ignored): the places the coverage is counted at
    polys = g['outline']['coordinates'] if g['outline']['type'] == 'MultiPolygon' else [g['outline']['coordinates']]; rings = []
    for poly in polys: rings.append(np.array([w2l.transform(lon, lat) for lon, lat in poly[0]]))
    allp = np.concatenate(rings); x0, y0, x1, y1 = allp[:, 0].min(), allp[:, 1].min(), allp[:, 0].max(), allp[:, 1].max()
    gx, gy = np.meshgrid(np.arange(x0, x1, step) + step / 2, np.arange(y0, y1, step) + step / 2); pts = np.c_[gx.ravel(), gy.ravel()]; inside = np.zeros(len(pts), bool)
    for r in rings: inside |= MPath(r).contains_points(pts)
    return pts[inside, 0], pts[inside, 1], (x0, y0, x1, y1)

# ------------------------------------------------------------------ STAC and footprints
def stac_items(bbox_ll):
    url = STAC + '/items?limit=100&bbox=%f,%f,%f,%f' % bbox_ll; out = []
    while url:
        d = json.load(urllib.request.urlopen(url)); out += d['features']; url = next((l['href'] for l in d['links'] if l['rel'] == 'next'), None)
    return out
def footprint(f, a, ext, cdir):
    """The orthophoto asset a of item f read at FP m from the COG overview over the extent: an RGBA picture (alpha = valid, trimmed by EDGE pixels) and its rectangle in LV95, cached in cdir."""
    kind = ORTHO[a['title']]; fn = os.path.join(cdir, '%s__%s' % (f['id'], a['title']))
    if os.path.exists(fn + '.json'):
        r = json.load(open(fn + '.json'))
        if r['status'] == 'ok': r['im'] = np.array(Image.open(fn + '.webp'))
        return r
    r = dict(item=f['id'], product=a['title'], kind=kind, href=a['href'], gsd=a.get('gsd'), status='ok')
    with rasterio.open(a['href']) as ds:
        b = ds.bounds; X0, Y0, X1, Y1 = max(ext[0], b.left), max(ext[1], b.bottom), min(ext[2], b.right), min(ext[3], b.top)
        if X1 <= X0 or Y1 <= Y0: r['status'] = 'outside'; json.dump(r, open(fn + '.json', 'w')); return r
        X0 = ext[0] + np.floor((X0 - ext[0]) / FP) * FP; Y0 = ext[1] + np.floor((Y0 - ext[1]) / FP) * FP; X1 = ext[0] + np.ceil((X1 - ext[0]) / FP) * FP; Y1 = ext[1] + np.ceil((Y1 - ext[1]) / FP) * FP
        nx, ny = int(round((X1 - X0) / FP)), int(round((Y1 - Y0) / FP))
        arr = ds.read(window=from_bounds(X0, Y0, X1, Y1, ds.transform), out_shape=(ds.count, ny, nx), resampling=Resampling.nearest, boundless=True, fill_value=0)
    valid = (arr != 0).any(axis=0)
    if kind == 'rgb': valid &= ~(arr == 255).all(axis=0)
    if valid.sum() * FP * FP / 1e6 < 0.05: r['status'] = 'no data'; json.dump(r, open(fn + '.json', 'w')); return r
    rr, cc = np.where(valid); r0, r1, c0, c1 = rr.min(), rr.max() + 1, cc.min(), cc.max() + 1
    if kind == 'nirrg':      # bands N, R, G, B (16 bit): N-R-G false colour, stretched 2 to 98 percent over the valid pixels (computed)
        rgb = arr[:3].astype('float32'); lo = [float(np.percentile(rgb[i][valid], 2)) for i in range(3)]; hi = [float(np.percentile(rgb[i][valid], 98)) for i in range(3)]; r['stretch'] = [lo, hi]
        img = np.stack([np.clip((rgb[i] - lo[i]) / max(1, hi[i] - lo[i]), 0, 1) * 255 for i in range(3)]).astype('uint8')
    else: img = arr[:3].astype('uint8')
    v = binary_erosion(valid, iterations=EDGE); im = np.dstack([img.transpose(1, 2, 0), (v * 255).astype('uint8')])[r0:r1, c0:c1]
    Image.fromarray(im, 'RGBA').save(fn + '.webp', quality=78, method=4); r['rect'] = [X0 + c0 * FP, Y1 - r1 * FP, X0 + c1 * FP, Y1 - r0 * FP]; r['rg'] = float(img[0][valid].mean() / max(1.0, img[1][valid].mean())) if kind == 'rgb' else None
    json.dump(r, open(fn + '.json', 'w')); r['im'] = im; return r

def safe_footprint(f, a, ext, cdir):      # a file that cannot be read (swisstopo answers HTTP 400 for two near-infrared files of 2025-09-19) is left out and said
    try: return footprint(f, a, ext, cdir)
    except Exception as ex: print('  unreadable, left out:', f['id'], a['title'], repr(ex), flush=True); return dict(item=f['id'], product=a['title'], status='unreadable')
# ------------------------------------------------------------------ tiles
def tile_box(z, x, y): T = 2 * WM / 2 ** z; return -WM + x * T, WM - (y + 1) * T, -WM + (x + 1) * T, WM - y * T
def tiles_of(rect, z):      # the tiles of zoom z that the LV95 rectangle touches
    xs, ys = l2m.transform([rect[0], rect[2], rect[0], rect[2]], [rect[1], rect[1], rect[3], rect[3]]); T = 2 * WM / 2 ** z
    return [(x, y) for y in range(int((WM - max(ys)) // T), int((WM - min(ys)) // T) + 1) for x in range(int((min(xs) + WM) // T), int((max(xs) + WM) // T) + 1)]
def tile_list(c, z=INDEX_Z):      # the tiles of zoom z that hold valid pixels of the footprint picture (the natural-colour flights are not stored; this is where they have data)
    r = c['rec']; mask = c['im'][..., 3] > 0; mx0, my0, mx1, my1 = r['rect']; mh, mw = mask.shape; out = set(); u = (np.arange(48) + .5) / 48
    for (x, y) in tiles_of(r['rect'], z):
        X0, Y0, X1, Y1 = tile_box(z, x, y); GX, GY = np.meshgrid(X0 + u * (X1 - X0), Y1 - u * (Y1 - Y0)); E, N = m2l.transform(GX, GY)
        ci = ((E - mx0) / FP).astype(int); ri = ((my1 - N) / FP).astype(int); ok = (ci >= 0) & (ci < mw) & (ri >= 0) & (ri < mh)
        if ok.any() and mask[ri[ok], ci[ok]].any(): out.add((x, y))
    return out
def merc_bbox(tiles, z=INDEX_Z):
    xs = [t[0] for t in tiles]; ys = [t[1] for t in tiles]; a = tile_box(z, min(xs), max(ys)); b = tile_box(z, max(xs), min(ys)); return [a[0], a[1], b[2], b[3]]

# ------------------------------------------------------------------ the field-notes chapter
def desc_of(item, title):
    a = next((a for a in item['assets'].values() if a.get('title') == title), None); return a.get('description', '') if a else ''
def meta_of(item):      # area, camera and acquisition times as the item's description states them
    d = next((a.get('description', '') for a in item['assets'].values() if a.get('description')), ''); ar = re.search(r'Area: ([^,]+)', d); cam = re.search(r'CameraSystem: ([^,]+)', d); tm = re.search(r'Acquisition time: (.*?)(?:, LineI[Dd]|, Commentary)', d)
    return dict(area=ar.group(1) if ar else '', camera=cam.group(1) if cam else '', times=tm.group(1) if tm else '')
def pct(v): return ('%.1f' % v).rstrip('0').rstrip('.') + ' %'
def field_notes(meta, g):
    e = html.escape; ys = meta['years']; rows = []; nfl = sum(len(y['flights']) for y in ys.values()); nir = sum(1 for y in ys.values() for f in y['flights'] if f.get('nir'))
    for yr in sorted(ys):
        for f in sorted(ys[yr]['flights'], key=lambda f: f['date'] + f['time']):
            link = '<a href="%s" target="_blank" rel="noopener">%s</a>' % (e(f['stac']), e(f['id'])) if f.get('stac') else e(f['id'])
            gsd = f['cog']['gsd'] if f.get('cog') and f['cog'].get('gsd') is not None else None
            rows.append('<tr><td>%s</td><td>%s %s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (yr, f['date'], f['time'], e(f['area']), e(f.get('camera') or '–'), '–' if gsd is None else gsd, pct(f['share_of_outline_2023']),
                         link + (' + near infrared (%d line%s)' % (len(f['nir']['lines']), '' if len(f['nir']['lines']) == 1 else 's') if f.get('nir') else '')))
    first, last = min(ys), max(ys); best = max(y['outline_covered_pct'] for y in ys.values() if 'outline_covered_pct' in y) if any('outline_covered_pct' in y for y in ys.values()) else None
    return ('<p><b>What this is.</b> Besides the pictures from space, the site can show the <b>aerial photographs of swisstopo\'s special flights</b> (Spezialbefliegungen) for a year: orthophotos made from images of an airborne camera, flown on the dates in the table. '
            'They are not satellite pictures and not the yearly SWISSIMAGE mosaic: each is one flight on one day, in summer or early autumn, and they cover only the part of the glacier the flight reached. The layer is the switch <i>swisstopo special flight</i> in the layer menu of the map and of the 3D view (One year only); '
            'a small dock under the year lists the flights of that year, each with its own switch, and a second switch for the near-infrared lines where the same flight has them.</p>'
            '<h3>What exists for %s</h3><p>%d flight%s with natural-colour orthophotos touching the glacier outline of SGI 2023 (%s km²), from %s to %s. The column <i>Outline covered</i> is computed here: the share of the 2023 outline (counted on a 20 m grid) where that flight has valid pixels%s. '
            'The other columns are as the swisstopo catalogue states them (the camera and the pixel size of the orthophoto, in metres).</p>'
            '<table class="stab"><tr><th>Year</th><th>Flight (time as stated)</th><th>Area (as stated)</th><th>Camera (as stated)</th><th>Pixel (m, catalogue or file)</th><th>Outline covered</th><th>Catalogue item</th></tr>%s</table>'
            '<h3>Which flights, how they are drawn</h3><ul class="fnl">'
            '<li><b>Selection.</b> Only RGB and near-infrared orthophotos of a flight whose valid pixels touch the 2023 outline (at least 1 %% of its area). Rapid-mapping mosaics (ram-*) are not used; a mosaic labelled RGB that is false colour in disguise is dropped. A year without a flight has no picture.</li>'
            '<li><b>Resolution.</b> Nothing of the flights is stored with the site: the map and the 3D view cut their tiles live from swisstopo\'s own files, natural colour and near infrared alike (range requests for the blocks they need, decoded by the browser). When a flight is switched on a quick coarse picture (the 3.2 m overview) comes first; it is replaced by the sharpness the zoom needs: 0.8 m at zoom 17, 0.4 m at zoom 18, and at zoom 19 and 20 as sharp as the file itself (pixel size in the table). While a flight is on the map may go to zoom 20; the 3D view draws it on a texture twice as wide and as high as normal.</li>'
            '<li><b>Edges and colour.</b> The border of every orthophoto is trimmed by 12 m (dark no-data fringes); pixels that are black are no data. Flights of one year are not colour-matched: seams show where two flights meet, as do changes in light and snow between days. '
            'Near infrared is shown as near infrared, red, green (false colour) with one stretch (2 to 98 percent of the values, computed) for the flight.</li>'
            '<li><b>Position.</b> The map places the live tiles with swisstopo\'s approximate WGS84 to LV95 formula, which swisstopo states as accurate to about 1 m; on the Aletsch area it agrees with PROJ to about 0.1 m (computed). The accuracy statement of swisstopo for these orthophotos was not read.</li></ul>'
            '<h3>What it is not</h3><ul class="fnl"><li>It is not the yearly ice surface of this page: the 3D ice surface of a year is the surface of the Sentinel-2 picture day (see the chapters above); an aerial photograph shows the glacier on its flight day, which can be weeks away from that.</li>'
            '<li>It is not complete: a flight reaches only part of the glacier, so most of the glacier has no special-flight picture in any year (see the column <i>Outline covered</i>).</li></ul>'
            '<h3>Source and terms</h3><p>swisstopo, <i>Spezialbefliegungen</i> (collection ch.swisstopo.spezialbefliegungen), %d catalogue item%s used here (%d flight%s with near-infrared lines). Terms of use read on 2026-11-06 at <a href="https://www.swisstopo.admin.ch/ogd-conditions" target="_blank" rel="noopener">swisstopo.admin.ch/ogd-conditions</a>: '
            'the free geodata may be used, distributed and made accessible, also commercially, and a reference to the source is mandatory. The collection\'s metadata record states: \u201cOpendata BY: Freie Nutzung. Quellenangabe ist Pflicht.\u201d Credit on the site: \u00a9 swisstopo (Spezialbefliegungen), with the dates of the flights shown.</p>'
            % (e(g['name']), nfl, '' if nfl == 1 else 's', ('%.2f' % g['area_km2']).rstrip('0').rstrip('.'), first, last, '' if best is None else '; the flights of one year together cover at most %s' % pct(best), ''.join(rows), nfl, '' if nfl == 1 else 's', nir, '' if nir == 1 else 's'))

# ------------------------------------------------------------------ one glacier
def build(g, force, notes_only):
    gid = g['id']; jf = os.path.join(OUT, gid + '.json')
    if notes_only:
        meta = json.load(open(jf)); meta['fieldNotes'] = field_notes(meta, g); json.dump(meta, open(jf, 'w')); print(gid, 'field notes rewritten'); return
    if os.path.exists(jf) and not force: print(gid, 'exists, skipped (--force to rebuild)'); return
    cdir = os.path.join(CACHE, gid); os.makedirs(cdir, exist_ok=True); OE, ON, (ox0, oy0, ox1, oy1) = outline_points(g); sc = strip_corners(gid)
    ext = (min(ox0, min(p[0] for p in sc)) - 500, min(oy0, min(p[1] for p in sc)) - 500, max(ox1, max(p[0] for p in sc)) + 500, max(oy1, max(p[1] for p in sc)) + 500)
    lo = Transformer.from_crs(2056, 4326, always_xy=True).transform_bounds(*ext); items = [f for f in stac_items(lo) if f['id'].startswith('kry-')]
    print(gid, g['name'], '| outline %.1f km2 | extent %.1f x %.1f km | %d kry items in the box' % (len(OE) * 4e-4, (ext[2] - ext[0]) / 1000, (ext[3] - ext[1]) / 1000, len(items)), flush=True)
    jobs = [(f, a) for f in items for a in f['assets'].values() if a.get('title') in ORTHO]; cands = []
    with ThreadPoolExecutor(3) as ex:
        for (f, a), r in zip(jobs, ex.map(lambda j: safe_footprint(j[0], j[1], ext, cdir), jobs)):
            if r['status'] != 'ok': continue
            im = r['im']; x0, y0, x1, y1 = r['rect']; h, w = im.shape[:2]; ci = ((OE - x0) / FP).astype(int); ri = ((y1 - ON) / FP).astype(int); ok = (ci >= 0) & (ci < w) & (ri >= 0) & (ri < h); hit = np.zeros(len(OE), bool); hit[ok] = im[ri[ok], ci[ok], 3] > 0
            share = float(hit.mean())
            if r['kind'] == 'rgb' and r.get('rg') and r['rg'] > FALSE_COLOUR_RG: print('  skip (false colour, red/green %.2f):' % r['rg'], r['item']); continue
            if share < MIN_SHARE: continue
            if r.get('gsd') is None:      # the catalogue does not state the pixel size of this asset: read it from the file itself
                with rasterio.open(r['href']) as ds: r['gsd'] = round(float(ds.res[0]), 4)
            dt = f['properties']['datetime']; cands.append(dict(rec=r, im=im, share=share, hit=hit, year=int(dt[:4]), date=dt[:10], item=f))
    print('  %d orthophoto assets touch the outline' % len(cands), flush=True)
    meta = dict(glacier=gid, name=g['name'], source='swisstopo, Spezialbefliegungen (ch.swisstopo.spezialbefliegungen)', licence_note='STAC licence field "proprietary" (the generic value); terms of use read 2026-11-06: open data, free use, source reference mandatory (docs/sources/switzerland-spezialbefliegungen.md)',
                min_share_of_outline_2023=MIN_SHARE, outline_km2=round(len(OE) * 4e-4, 2), minzoom=ZMIN, maxzoom=INDEX_Z, years={})
    gdir = os.path.join(OUT, gid); shutil.rmtree(gdir, ignore_errors=True)
    for y in sorted({c['year'] for c in cands}):
        C = [c for c in cands if c['year'] == y]; rgb = sorted([c for c in C if c['rec']['kind'] == 'rgb'], key=lambda c: c['share']); nirs = [c for c in C if c['rec']['kind'] == 'nirrg']; flights = []; union = np.zeros(len(OE), bool)
        for c in rgb:
            iid = c['rec']['item']; name = iid[4:]; tiles16 = tile_list(c); union |= c['hit']; mt = meta_of(c['item'])
            m = re.search(r'Acquisition time: \d{4}-\d\d-\d\dT(\d\d:\d\d)', desc_of(c['item'], 'DOP-RGB-MOSAIC'))
            f = dict(id=iid, date=c['date'], time=m.group(1) if m else '', area=mt['area'].replace('_', ' ').title(), camera=mt['camera'], acquisition=mt['times'], product='RGB', dir=name,
                     cogs=[dict(href=c['rec']['href'], gsd=c['rec'].get('gsd'))], bbox=merc_bbox(tiles16), tiles=sorted(tiles16), share_of_outline_2023=round(100 * c['share'], 1),
                     stac='https://data.geo.admin.ch/browser/index.html#/collections/ch.swisstopo.spezialbefliegungen/items/' + iid)
            same = [n for n in nirs if n['date'] == c['date']]      # near-infrared lines of the same flight day: their own files at swisstopo, drawn live with one stretch
            if same:
                st = [[float(np.median([n['rec']['stretch'][k][b] for n in same])) for b in range(3)] for k in (0, 1)]; t16 = set()
                for n in same: t16 |= tile_list(n)
                f['nir'] = dict(product='NIR-R-G', bbox=merc_bbox(t16), tiles=sorted(t16), stretch=st, lines=[n['rec']['item'] for n in same], cogs=[dict(href=n['rec']['href'], gsd=n['rec'].get('gsd')) for n in same])
            flights.append(f); print('  %d %s: %d tiles of zoom %d with data%s' % (y, name, len(tiles16), INDEX_Z, ' +nir (%d lines)' % len(same) if same else ''), flush=True)
        for n in nirs:
            if not any(n['date'] == c['date'] for c in rgb): print('  near infrared without a natural-colour flight of the same day, not used:', n['rec']['item'])
        if flights: meta['years'][str(y)] = dict(product='RGB', dates=sorted({c['date'] for c in rgb}), outline_covered_pct=round(100 * float(union.mean()), 1), flights=flights)
    if not meta['years']: print(gid, 'no flight touches the outline: no file'); shutil.rmtree(gdir, ignore_errors=True); return
    meta['fieldNotes'] = field_notes(meta, g); json.dump(meta, open(jf, 'w')); print(gid, 'done:', len(meta['years']), 'years', sum(len(y['flights']) for y in meta['years'].values()), 'flights', flush=True)

def write_index():
    ids = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(OUT, '*.json')) if not f.endswith('index.json')); json.dump(ids, open(os.path.join(OUT, 'index.json'), 'w')); print('index:', ids)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('ids', nargs='*'); ap.add_argument('--force', action='store_true'); ap.add_argument('--notes-only', action='store_true'); a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
    for g in glaciers():
        if a.ids and g['id'] not in a.ids: continue
        try: build(g, a.force, a.notes_only)
        except Exception as ex: print(g['id'], 'FAILED:', repr(ex), flush=True)
    write_index()
