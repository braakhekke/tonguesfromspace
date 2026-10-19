#!/usr/bin/env python3
"""Fills the data blocks of size.html (the glacier size comparison page).

Reads data/glaciers.js (the ten Swiss glaciers, SGI2023 and SGI1850 outlines), projects each
glacier to metres around the centre of its box (equirectangular at that latitude, good to
well under 1 % over 20 km), thins the rings (Douglas-Peucker, 15 m) and drops ice patches
under 0.01 km2. The same for nine city boundaries (current municipalities, swissBOUNDARIES3D from the
swisstopo identify service, cached in scripts/.size-demo-cities.json so a rerun works offline). The
logo and the small map pictures are copied from index.html, so the page looks like the site. The page rebuilds the position on any map from those metres, so the size stays
true wherever the outline is dragged. Standard library only. Run it again when glaciers.js changes.
"""
import json, math, pathlib, re, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / 'size.html'
CITY_CACHE = ROOT / 'scripts' / '.size-demo-cities.json'
CITIES = [('zurich', 'Zürich', 47.3769, 8.5417), ('bern', 'Bern', 46.9480, 7.4474), ('basel', 'Basel', 47.5596, 7.5886),
          ('geneva', 'Geneva', 46.2044, 6.1432), ('lausanne', 'Lausanne', 46.5197, 6.6323), ('lucerne', 'Lucerne', 47.0502, 8.3093),
          ('lugano', 'Lugano', 46.0037, 8.9511), ('stgallen', 'St. Gallen', 47.4245, 9.3767), ('zermatt', 'Zermatt', 46.0207, 7.7491)]
M_LAT = 111320.0


def dp(pts, tol):
    if len(pts) < 5:
        return pts
    if pts[0] == pts[-1]:   # closed ring: split at the point farthest from the start
        k = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        return dp(pts[:k + 1], tol)[:-1] + dp(pts[k:], tol)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / n
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring_area(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(-1, len(r) - 1)) / 2


def project(geom, lat0, lon0, tol=15, min_km2=0.01):
    kx = M_LAT * math.cos(math.radians(lat0))
    polys = []
    for poly in geom['coordinates']:
        rings = []
        for k, ring in enumerate(poly):
            pts = [((lo - lon0) * kx, (la - lat0) * M_LAT) for lo, la in ring]
            pts = dp(pts, tol)
            if len(pts) < 4:
                continue
            if k == 0 and abs(ring_area(pts)) / 1e6 < min_km2:
                rings = []
                break
            rings.append([round(v) for p in pts[:-1] for v in p])
        if rings:
            polys.append(rings)
    return polys


def span_km(polys):
    pts = [(r[i], r[i + 1]) for p in polys for r in p[:1] for i in range(0, len(r), 2)]
    best = 0
    for i, a in enumerate(pts):
        for b in pts[i + 1:]:
            d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
            if d > best:
                best = d
    return round(math.sqrt(best) / 1000, 1)


def short(n):
    t = re.sub(r'^(Glacier|Ghiacciaio)\s+(de la |de l\'|des |du |de |d\')?', '', n.strip())
    t = re.sub(r'\s+\(.*\)$', '', t)
    t = re.sub(r'^Grosser\s+', '', t)
    t = re.sub(r'-?gletscher$', '', t, flags=re.I)
    return t[:1].upper() + t[1:]


def area_km2(polys):
    t = 0
    for p in polys:
        t += abs(ring_area([(r[i], r[i + 1]) for r in p[:1] for i in range(0, len(r), 2)]))
        t -= sum(abs(ring_area([(h[i], h[i + 1]) for i in range(0, len(h), 2)])) for h in p[1:])
    return t / 1e6


def fetch_cities():
    if CITY_CACHE.exists():
        return json.loads(CITY_CACHE.read_text())
    out = []
    for k, name, la, lo in CITIES:
        u = ('https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=%s,%s&geometryType=esriGeometryPoint'
             '&layers=all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill&mapExtent=%s,%s,%s,%s&imageDisplay=500,500,96'
             '&tolerance=0&sr=4326&returnGeometry=true&geometryFormat=geojson') % (lo, la, lo - .1, la - .1, lo + .1, la + .1)
        res = json.load(urllib.request.urlopen(u, timeout=90))['results']
        cur = [r for r in res if r['properties'].get('is_current_jahr')]
        assert len(cur) == 1, (name, len(cur))
        g = cur[0]['geometry']
        g = {'coordinates': [[[c[:2] for c in ring] for ring in poly] for poly in g['coordinates']]}
        lons = [c[0] for p in g['coordinates'] for c in p[0]]
        lats = [c[1] for p in g['coordinates'] for c in p[0]]
        out.append({'id': k, 'name': name, 'clat': la, 'clon': lo, 'official': cur[0]['properties']['gemname'],
                    'lat': (min(lats) + max(lats)) / 2, 'lon': (min(lons) + max(lons)) / 2, 'geom': g})
    CITY_CACHE.write_text(json.dumps(out))
    return out


def inject(html, tag, content):
    pat = re.compile(r'(<!--%s-->).*?(<!--/%s-->)' % (tag, tag), re.S)
    assert pat.search(html), tag
    return pat.sub(lambda m: m.group(1) + content + m.group(2), html)


def main():
    s = (ROOT / 'data' / 'glaciers.js').read_text()
    d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    out = []
    for g in d['glaciers']:
        (la0, lo0), (la1, lo1) = g['bbox']
        # the box of the 1850 outline is larger; the origin is the middle of the 2023 box
        lat0, lon0 = (la0 + la1) / 2, (lo0 + lo1) / 2
        new = project(g['outline'], lat0, lon0)
        old = project(g['oldest']['outline'], lat0, lon0, tol=25)
        out.append({'id': g['id'], 'name': short(g['name']), 'full': g['name'], 'lat': lat0, 'lon': lon0,
                    'year': g['year'], 'area': g['area_km2'], 'area1850': g['oldest']['area_km2'],
                    'span': span_km(new), 'new': new, 'old': old})
    cities = []
    for c in fetch_cities():
        polys = project(c['geom'], c['lat'], c['lon'], tol=8, min_km2=0.05)
        cities.append({'id': c['id'], 'name': c['name'], 'clat': c['clat'], 'clon': c['clon'], 'lat': round(c['lat'], 5), 'lon': round(c['lon'], 5),
                       'area': round(area_km2(polys), 1), 'span': span_km(polys), 'polys': polys})
    blob = json.dumps({'glaciers': out, 'cities': cities}, separators=(',', ':'))
    html = PAGE.read_text()
    html = inject(html, 'DATA', '<script>window.SIZE_DATA=' + blob + ';</script>')
    idx = (ROOT / 'index.html').read_text()
    html = inject(html, 'SPRITE', re.search(r'<svg width="0" height="0".*?</defs></svg>', idx, re.S).group(0))
    html = inject(html, 'LOGO', re.search(r'<img class="brand-logo"[^>]*>', idx).group(0))
    html = inject(html, 'MLOGO', re.search(r'<img class="mhead-logo"[^>]*>', idx).group(0))
    PAGE.write_text(html)
    print(f'{len(out)} glaciers, {len(cities)} cities, {len(blob) / 1024:.0f} KB of data')
    for o in out:
        print(f"  {o['name']:<12} {o['area']:>6} km2  span {o['span']} km")
    for c in cities:
        print(f"  {c['name']:<12} {c['area']:>6} km2  span {c['span']} km")


if __name__ == '__main__':
    main()
