#!/usr/bin/env python3
"""Fills the data blocks of size.html (the glacier size comparison page).

Reads data/glaciers.js (the ten Swiss glaciers, SGI2023 and SGI1850 outlines), projects each
glacier to metres around the centre of its box (equirectangular at that latitude, good to
well under 1 % over 20 km), thins the rings (Douglas-Peucker, 15 m) and drops ice patches
under 0.01 km2. `--region nz` writes data/size-nz.js instead (glaciers of data/newzealand.js, six NZ cities from the Stats NZ major urban areas, see REGION_SIZE). The same for nine city boundaries (current municipalities, swissBOUNDARIES3D from the
swisstopo identify service, cached in scripts/.size-demo-cities.json so a rerun works offline). The
logo and the small map pictures are copied from index.html, so the page looks like the site. The page rebuilds the position on any map from those metres, so the size stays
true wherever the outline is dragged. Standard library only. Run it again when glaciers.js changes.
"""
import json, math, pathlib, re, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / 'size.html'
CITY_CACHE = ROOT / 'scripts' / '.size-demo-cities.json'
CITIES = [('zurich', 'Zürich', 47.3769, 8.5417), ('bern', 'Bern', 46.9480, 7.4474), ('basel', 'Basel', 47.5596, 7.5886),
          ('geneva', 'Geneva', 46.2044, 6.1432), ('lausanne', 'Lausanne', 46.5197, 6.6323), ('lucerne', 'Lucerne', 47.0502, 8.3093),
          ('lugano', 'Lugano', 46.0037, 8.9511), ('stgallen', 'St. Gallen', 47.4245, 9.3767), ('zermatt', 'Zermatt', 46.0207, 7.7491)]
M_LAT = 111320.0
# other regions: data/size-<id>.js replaces the Swiss data of size.html (it is loaded when the address says #r=<id>, see the loader before the page script).
# Cities: Stats NZ urban areas (see REGION_SIZE), cached in scripts/.size-demo-cities-<id>.json so a rerun works offline.
REGION_SIZE = {'nz': {'data': 'data/newzealand.js', 'old': 'lia', 'new': 'latest',
               # Stats NZ "Major urban area" names of Urban Rural Areas 2023 (CC BY 4.0): the built-up city, not the whole council district
               'cities': [('auckland', 'Auckland', 'Auckland'), ('wellington', 'Wellington', 'Wellington'), ('christchurch', 'Christchurch', 'Christchurch'),
                          ('hamilton', 'Hamilton', 'Hamilton'), ('tauranga', 'Tauranga', 'Tauranga'), ('dunedin', 'Dunedin', 'Dunedin')],
               'urban_service': 'https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/Urban_Rural_Areas_2023/FeatureServer/0/query',
               'country': 'New Zealand'}}


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


def ice_history(d, vols):
    """The ice through the years, for the time slider of Volume 3D (ICE_HISTORY).

    Swiss total: [year, km3, kind]. 'g' GLAMOS Swiss-wide series as stated (every tenth year before 2016 from 1916 on, every year from 2010 to 2025);
    'e' ESTIMATE for the newest year (2026), the explorer's typed Swiss loss (VOLUME_LOSS in js/01-data.js).
    Each glacier: [year, km3, kind]. Kinds:
      's'  Grab & Melchior 2020 V_year, the volume in its own reference year (year_mode), as stored;
      'h'  Grab & Melchior 2020 V_2016, homogenised for 2016, as stored (left out where the reference year is 2016: the same value);
      'c'  COMPUTED: V_year plus one GLAMOS volume change that starts or ends in the reference year (glaciers.js volume.series);
      'c2' COMPUTED: chained through two GLAMOS changes, only for a glacier with fewer than four 'c' years (Unteraar), never within two years of the reference year;
      'm'  COMPUTED, every year 2016 to 2025 that has no value above: the explorer's own model (js/07-render.js, glacierIceAt): the stated volume moved year by year with
           the yearly mass balance (the glacier's own where GLAMOS measures it for the whole survey period, else all Swiss glaciers), scaled with the GLAMOS volume survey
           (km3 per m w.e.); without a usable survey the stated volume scaled with the Swiss ice of that year;
      'i'  COMPUTED, every tenth year before 2016 (2006, 1996 ...) from the glacier's first survey on: between the two surveys around it, the volume change shared out
           by the yearly mass balance (own, else Swiss-wide; before 1916 linear in time);
      'e'  ESTIMATE, 2026: as 'm', with the Swiss loss of 2026 turned into a balance (as the explorer does).
    Computed values are rounded to 4 decimals here; the page says they are computed. Tick years of the slider: every tenth year before 2016, every year from 2016.
    """
    gl = {g['id']: g for g in d['glaciers']}
    sv = {y: v for y, v, *_ in d.get('swiss_volume', [])}
    sb = {y: b for y, b in d.get('swiss_balance', [])}
    LOSS26 = 5.5      # VOLUME_LOSS 2026 in js/01-data.js (the explorer's typed loss, per cent)
    sv[2026] = sv[2025] * (1 - LOSS26 / 100)
    ice = lambda y: sv[y]
    out = {'swiss': [], 'glaciers': {}}
    # Swiss total: GLAMOS states the volume of every year since 1915; the slider uses its tick years and the page lists them with 2010 to 2015
    out['swiss'] = [[y, v, 'g'] for y, v in sorted(sv.items()) if y <= 2025 and (y >= 2010 or y % 10 == 6)]
    out['swiss'].append([2026, round(sv[2026], 3), 'e'])
    for v in vols:
        g = gl.get(v['id'])
        if not g or not g.get('volume'):
            continue
        A, VA, ser = v['year'], v['Vyear'], g['volume'].get('series') or []
        pts = {A: [A, VA, 's']}
        for f, t, dv, *_ in ser:
            if t == A and f not in pts: pts[f] = [f, round(VA - dv, 4), 'c']
            if f == A and t not in pts: pts[t] = [t, round(VA + dv, 4), 'c']
        if len(pts) < 5:
            for hub in [y for y, p in pts.items() if p[2] == 'c']:
                for f, t, dv, *_ in ser:
                    o, val = (t, pts[hub][1] + dv) if f == hub else (f, pts[hub][1] - dv) if t == hub else (None, None)
                    if o is not None and o not in pts and abs(o - A) > 2:
                        pts[o] = [o, round(val, 4), 'c2']
        if A != 2016 and 2016 not in pts:
            pts[2016] = [2016, v['V2016'], 'h']
        anchors = {y: p[1] for y, p in pts.items()}
        own = {y: b for y, b in (g.get('balance') or [])}
        V = g['volume']
        # the explorer's balance model (js/07-render.js balanceModel)
        M = None
        if V.get('covered_pct', 0) >= 90 and V.get('dV_km3', 0) < 0 and all(y in sb for y in range(V['from'] + 1, V['to'] + 1)):
            use_own = bool(own) and all(y in own for y in range(V['from'] + 1, V['to'] + 1))
            bal = lambda y, use_own=use_own, own=own: (own[y] if use_own and y in own else sb[y]) / 1000 if (y in own and use_own) or y in sb else None
            S = -sum(bal(y) for y in range(V['from'] + 1, V['to'] + 1))
            if S > 0:
                swk = sum(ice(y - 1) - ice(y) for y in range(V['from'] + 1, V['to'] + 1))
                swb = -sum(sb[y] / 1000 for y in range(V['from'] + 1, V['to'] + 1))
                M = {'bal': bal, 'c': -V['dV_km3'] / S, 'eq': (lambda y, k=swk / swb: -(ice(y - 1) - ice(y)) / k) if swb > 0 and swk > 0 else None}
        def at(y):      # the model's volume in year y: [km3, kind]
            kind = 'm'
            if not M: return VA * ice(y) / ice(A), kind
            vol = VA
            if y > A:
                for t in range(A + 1, y + 1):
                    b = M['bal'](t)
                    if b is not None: vol += M['c'] * b
                    elif M['eq']: vol += M['c'] * M['eq'](t); kind = 'e'
                    else: vol = vol * ice(t) / ice(t - 1); kind = 'e'
            else:
                for t in range(y + 1, A + 1):
                    b = M['bal'](t)
                    if b is not None: vol -= M['c'] * b
            return max(0, vol), kind
        for y in range(2016, 2027):
            if y not in pts:
                val, kind = at(y)
                pts[y] = [y, round(val, 4), kind if y == 2026 else 'm']
        ys = sorted(anchors)
        for y in range(2006, 1850, -10):
            if y < ys[0] or y in pts: continue
            a = max(q for q in ys if q < y); b = min(q for q in ys if q > y)
            use = None
            for src in (own, sb):
                if all(t in src for t in range(a + 1, b + 1)): use = src; break
            val = None
            if use:
                tot = -sum(use[t] for t in range(a + 1, b + 1))
                if tot > 0: val = anchors[a] + (anchors[b] - anchors[a]) * (-sum(use[t] for t in range(a + 1, y + 1))) / tot
            if val is None: val = anchors[a] + (anchors[b] - anchors[a]) * (y - a) / (b - a)
            pts[y] = [y, round(val, 4), 'i']
        out['glaciers'][v['id']] = [pts[y] for y in sorted(pts)]
    return out


def in_ring(pt, ring):
    x, y = pt
    r = False
    for i in range(-1, len(ring) - 1):
        (xa, ya), (xb, yb) = ring[i], ring[i + 1]
        if (ya > y) != (yb > y) and x < (xb - xa) * (y - ya) / (yb - ya) + xa:
            r = not r
    return r


def rings_to_geom(rings):
    """Rings of [lat, lon] (an outline of data/<region>.js) to a MultiPolygon: a ring that lies inside a bigger one is its hole, the others are polygons of their own."""
    rs = sorted(([(lo, la) for la, lo in r] for r in rings if len(r) >= 4), key=lambda r: -abs(ring_area(r)))
    polys = []
    for r in rs:
        for p in polys:
            if in_ring(r[0], p[0]) and not any(in_ring(r[0], h) for h in p[1:]):
                p.append(r)
                break
        else:
            polys.append([r])
    return {'coordinates': polys}


def fetch_region_cities(rid):
    cache = ROOT / 'scripts' / f'.size-demo-cities-{rid}.json'
    if cache.exists():
        return json.loads(cache.read_text())
    out = []
    for k, name, query in REGION_SIZE[rid]['cities']:
        u = REGION_SIZE[rid]['urban_service'] + '?' + urllib.parse.urlencode({'where': f"UR2023_V1_00_NAME_ASCII='{query}' AND IUR2023_V1_00_NAME='Major urban area'", 'outFields': 'UR2023_V1_00_NAME', 'outSR': 4326, 'maxAllowableOffset': 0.00005, 'f': 'geojson'})
        feats = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'tonguesfromspace-size-build/1.0 (static site build)'}), timeout=60))['features']
        assert len(feats) == 1, name
        g = feats[0]['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        polys = [[[c[:2] for c in ring] for ring in poly] for poly in polys]
        lons = [c[0] for p in polys for c in p[0]]
        lats = [c[1] for p in polys for c in p[0]]
        lat, lon = (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
        out.append({'id': k, 'name': name, 'clat': lat, 'clon': lon, 'official': f'{name}, Major urban area, Stats NZ Urban Rural Areas 2023', 'lat': lat, 'lon': lon, 'geom': {'coordinates': polys}})
    cache.write_text(json.dumps(out))
    return out


def main_region(rid):
    cfg = REGION_SIZE[rid]
    s = (ROOT / cfg['data']).read_text()
    d = json.loads(s[s.index('window.REGION_ICE =') + len('window.REGION_ICE ='):s.rindex('}') + 1])
    out = []
    for o in d['outlets']:
        old, new = o['outlines'][cfg['old']], o['outlines'][cfg['new']]
        area = {a['year']: a['km2'] for a in o['areas']}      # the stated areas of the record (not recomputed from the outlines)
        (la0, lo0), (la1, lo1) = o['box']
        lat0, lon0 = (la0 + la1) / 2, (lo0 + lo1) / 2
        newp = project(rings_to_geom(new['lines']), lat0, lon0)
        oldp = project(rings_to_geom(old['lines']), lat0, lon0, tol=25)
        out.append({'id': o['id'], 'name': o['name'].replace(' Glacier', ''), 'full': o['name'], 'lat': lat0, 'lon': lon0,
                    'year': new['year'], 'area': area[new['year']], 'year0': old['year'], 'area0': area[old['year']],
                    'span': span_km(newp), 'new': newp, 'old': oldp})
    cities = []
    for c in fetch_region_cities(rid):
        polys = project(c['geom'], c['lat'], c['lon'], tol=8, min_km2=0.05)
        cities.append({'id': c['id'], 'name': c['name'], 'clat': c['clat'], 'clon': c['clon'], 'lat': round(c['lat'], 5), 'lon': round(c['lon'], 5),
                       'area': round(area_km2(polys), 1), 'span': span_km(polys), 'polys': polys})
    blob = json.dumps({'region': rid, 'glaciers': out, 'cities': cities}, separators=(',', ':'))
    # no ice volumes yet (no stated volume is read): Volume 3D stays hidden; the empty blocks keep the Swiss ones out
    (ROOT / 'data' / f'size-{rid}.js').write_text(f'// generated by scripts/build_size_demo.py --region {rid} - do not edit by hand\nwindow.SIZE_DATA={blob};window.ICE_VOLUMES=[];window.ICE_HISTORY={{"swiss":[],"glaciers":{{}}}};window.DEBRIS_SHARE={{}};\n')
    print(f'{len(out)} glaciers, {len(cities)} cities, {len(blob) / 1024:.0f} KB of data')
    for o in out:
        print(f"  {o['name']:<14} {o['area']:>6} km2 in {o['year']}, {o['area0']} in {o['year0']}, span {o['span']} km")
    for c in cities:
        print(f"  {c['name']:<16} {c['area']:>7} km2  span {c['span']} km")


def main():
    if '--region' in sys.argv:
        return main_region(sys.argv[sys.argv.index('--region') + 1])
    s = (ROOT / 'data' / 'glaciers.js').read_text()
    d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    vols = ROOT / 'data' / 'ice-volumes.json'
    if '--history-only' in sys.argv:      # only the ICEHIST block (the time slider); the rest of the page stays as it is
        html = inject(PAGE.read_text(), 'ICEHIST', '<script>window.ICE_HISTORY=' + json.dumps(ice_history(d, json.loads(vols.read_text())), separators=(',', ':')) + ';</script>')
        PAGE.write_text(html)
        for k, h in ice_history(d, json.loads(vols.read_text()))['glaciers'].items():
            print(f"  {k:8} " + ' '.join(f"{y}:{v}{'' if c in ('s', 'h') else '*'}" for y, v, c in h))
        return
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
    if vols.exists():      # the 3D ice cubes (scripts/build_ice_volumes.py); the page works without them, 3D then has no volumes
        html = inject(html, 'ICEVOL', '<script>window.ICE_VOLUMES=' + json.dumps(json.loads(vols.read_text()), separators=(',', ':')) + ';</script>')
        html = inject(html, 'ICEHIST', '<script>window.ICE_HISTORY=' + json.dumps(ice_history(d, json.loads(vols.read_text())), separators=(',', ':')) + ';</script>')
    deb = ROOT / 'data' / 'debris-share.json'      # share of non-ice pixels inside the SGI2023 outline (scripts/build_debris_share.py): how much grit the ice ball carries
    if deb.exists():
        html = inject(html, 'DEBRIS', '<script>window.DEBRIS_SHARE=' + json.dumps({k: v['share'] for k, v in json.loads(deb.read_text())['glaciers'].items()}, separators=(',', ':')) + ';</script>')
    idx = (ROOT / 'index.html').read_text()
    html = inject(html, 'SPRITE', re.search(r'<svg width="0" height="0".*?</defs></svg>', idx, re.S).group(0))
    html = inject(html, 'LOGO', re.search(r'<img class="brand-logo"[^>]*>', idx).group(0))
    PAGE.write_text(html)
    print(f'{len(out)} glaciers, {len(cities)} cities, {len(blob) / 1024:.0f} KB of data')
    for o in out:
        print(f"  {o['name']:<12} {o['area']:>6} km2  span {o['span']} km")
    for c in cities:
        print(f"  {c['name']:<12} {c['area']:>6} km2  span {c['span']} km")


if __name__ == '__main__':
    main()
