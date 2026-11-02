#!/usr/bin/env python3
"""The oldest swisstopo map that covers a picture box, and the year of the map the site shows now -> data/swisstopo-maps.json, keyed by the site id (2026-11-02, owner request).

  * oldest: swisstopo's "Journey through time" layer ch.swisstopo.zeitreihen (WMTS, time dimension = the year of the map, 1844 to 2021). A year without a map at a place comes as a flat transparent
    tile (334 bytes), so for every year from the oldest the tiles of a 9 x 9 grid over the picture box (data/boxes.js, zoom 14) are fetched; `oldest` = the first year at which every grid point has a map
    (`oldestAny` = the first year with a map at any point), `cover` = share of the grid points with a map in `oldest`;
  * current: the map the site shows (ch.swisstopo.pixelkarte-farbe, "current") has no year of its own. swisstopo's sheet metadata layer ch.swisstopo.pixelkarte-pk25.metadata lists, at a place, the
    sheets of the 1:25,000 map by journey-through-time `year`, with `datenstand` (data state) and `releasekey` (last partial revision); `current` = the largest `year` at the middle of the box, with its
    `datenstand` and `releasekey` as the service states them.
Usage: python3 scripts/build_oldest_map.py [site ids ...]    (network; about 100 tile requests per glacier per year tried)"""
import io, json, os, sys, time, math, urllib.request, concurrent.futures as cf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
TILE = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.zeitreihen/default/%d1231/3857/%d/%d/%d.png'
META = ('https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=%s,%s&geometryType=esriGeometryPoint&layers=all:ch.swisstopo.pixelkarte-pk25.metadata'
        '&mapExtent=%s,%s,%s,%s&imageDisplay=500,500,96&tolerance=0&sr=4326&returnGeometry=false')
CAP = 'https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml'
NB, Z = 9, 14
def get(u, tries=4):
    for k in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'tfs-oldest-map/1.0'}), timeout=60).read()
        except Exception as e:
            if getattr(e, 'code', None) in (400, 404): return b''
            time.sleep(2 * (k + 1))
    raise RuntimeError(u)
def years():
    import re
    x = get(CAP).decode(); i = x.index('<ows:Identifier>ch.swisstopo.zeitreihen</ows:Identifier>'); b = x[i:x.index('</Layer>', i)]
    return sorted({int(v[:4]) for v in re.findall(r'<Value>(\d{8})</Value>', b)})
def has_map(year, x, y):
    return len(get(TILE % (year, Z, x, y))) > 400      # a year without a map is a flat 334-byte tile
def main():
    t = open(os.path.join(ROOT, 'data', 'boxes.js'), encoding='utf-8').read(); boxes = json.loads(t[t.index('{'):t.rindex('}') + 1])['glaciers']
    from build_oldest_aerial import SITE
    ids = sys.argv[1:] or list(SITE); ys = years()
    path = os.path.join(ROOT, 'data', 'swisstopo-maps.json'); out = json.load(open(path)) if os.path.exists(path) else {}
    for gid in ids:
        (s, w), (n, e) = boxes[gid]['box']['bounds']; nt = 2 ** Z
        tiles = set()      # the grid points -> their tiles
        for i in range(NB):
            for j in range(NB):
                lon, lat = w + (e - w) * (i + .5) / NB, s + (n - s) * (j + .5) / NB
                tiles.add((int((lon + 180) / 360 * nt), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * nt)))
        tiles = sorted(tiles); first_any = None; first_all = None; cover = None
        for yr in ys:
            with cf.ThreadPoolExecutor(8) as ex: ok = list(ex.map(lambda t: has_map(yr, *t), tiles))
            if any(ok) and first_any is None: first_any = yr
            if all(ok): first_all = yr; cover = 1.0; break
            if first_any is not None and yr >= first_any + 60: break      # no complete cover within 60 years of the first map: give up
        lon, lat = (w + e) / 2, (s + n) / 2
        rows = [r['attributes'] for r in json.loads(get(META % (lon, lat, lon - .0005, lat - .0005, lon + .0005, lat + .0005)))['results']]
        cur = max(rows, key=lambda a: int(a['year'])) if rows else None
        site = SITE.get(gid, gid)
        out[site] = {'oldest': first_all, 'oldestAny': first_any, 'tiles': len(tiles), 'asked': time.strftime('%Y-%m-%d'),
                     'current': int(cur['year']) if cur else None, 'datenstand': cur and cur['datenstand'], 'releasekey': cur and cur['releasekey'], 'sheet': cur and cur['lk_name']}
        print(gid, site, out[site], flush=True)
    json.dump(out, open(path, 'w'), indent=1, sort_keys=True)
if __name__ == '__main__': main()
