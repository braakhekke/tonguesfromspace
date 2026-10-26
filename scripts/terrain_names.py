"""The peak, volcano and pass names baked into a glacier's terrain file, one rule for every region.

Source (the only thing that differs by region): Switzerland swisstopo swissNAMES3D (identify service of api3.geo.admin.ch, open data); everywhere else OpenStreetMap (Overpass API: natural=peak, volcano, saddle
with a name; ODbL). The name is the source's `name` tag / `name` attribute, unchanged.
Choice (the rule of pickNames() in js/11-view3d.js): inside the strip, not at its edges, highest first (height above the tip + 120 m for a peak, 120 m less for a pass), at most six, 750 m apart from each
other and from the marks (the tip, the thickest radar ice). x, z are in the scene of the strip (x to the right, z away from the camera's start)."""
import json, math, sys, time, urllib.parse, urllib.request

import terrain_lib as tl

KIND = {'Hauptgipfel': 3, 'Alpiner Gipfel': 3, 'Gipfel': 2, 'Pass': 1}      # the page's kinds; OSM peak and volcano are 'Gipfel', saddle 'Pass'
UA = {'User-Agent': 'tonguesfromspace-build/1.0 (https://tonguesfromspace.org)'}
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']


def corners(st, half):
    return [(st['P'][0] + (a * st['ue'] + b * st['un']) * st['k'], st['P'][1] + (a * st['un'] - b * st['ue']) * st['k']) for a, b in ((-st['back'], -half), (-st['back'], half), (st['up'], -half), (st['up'], half))]


def overpass(query, tries=4):
    last = None
    for k in range(tries):
        for url in OVERPASS:
            try:
                with urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode({'data': query}).encode(), headers=UA), timeout=120) as r: return json.load(r)
            except Exception as e: last = e
        time.sleep(5 * (k + 1))
    raise last


def osm(st, half):
    cs = [tl.unmerc(x, y) for x, y in corners(st, half)]
    box = f'{min(c[0] for c in cs)},{min(c[1] for c in cs)},{max(c[0] for c in cs)},{max(c[1] for c in cs)}'
    d = overpass(f'[out:json][timeout:90];node["natural"~"^(peak|volcano|saddle)$"]["name"]({box});out;')
    return [(e['tags']['name'], 'Pass' if e['tags']['natural'] == 'saddle' else 'Gipfel', tl.merc(e['lat'], e['lon'])) for e in d.get('elements', []) if e.get('tags', {}).get('name')]


def swisstopo(st, half):
    cs = corners(st, half); env = ','.join(str(v) for v in (min(c[0] for c in cs), min(c[1] for c in cs), max(c[0] for c in cs), max(c[1] for c in cs)))
    url = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' + urllib.parse.urlencode({'geometryType': 'esriGeometryEnvelope', 'geometry': env, 'imageDisplay': '1000,1000,96', 'mapExtent': env,
          'tolerance': '0', 'layers': 'all:ch.swisstopo.swissnames3d', 'sr': '3857', 'returnGeometry': 'true', 'limit': '200', 'lang': 'en'})
    j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60)); out = []
    for r in j.get('results', []):
        a = r['attributes']
        if a.get('objektart') in KIND and r.get('geometry') and r['geometry'].get('points') and a.get('name'): out.append((a['name'], a['objektart'], tuple(r['geometry']['points'][0])))
    return out


def source(region): return ('swisstopo swissNAMES3D', swisstopo) if region == 'ch' else ('OpenStreetMap', osm)


def names_for(region, st, height_at, avoid=((0.0, 0.0),)):
    """st: the strip {P, k, ue, un, up, back, half}; height_at(a, b) = height (m, any common zero) at a metres up the glacier from the tip and b to the right; avoid: marks as (x, z) in the scene."""
    half = st['half']; _, fetch = source(region); seen, cand = set(), []
    for name, kind, (mx, my) in fetch(st, half):
        dx, dy = (mx - st['P'][0]) / st['k'], (my - st['P'][1]) / st['k']; a, b = dx * st['ue'] + dy * st['un'], dx * st['un'] - dy * st['ue']
        if not (abs(b) < half - 200 and -st['back'] + 150 < a < st['up'] - 200) or name in seen: continue
        seen.add(name); cand.append((height_at(a, b) + KIND[kind] * 120, b, -a, name))
    cand.sort(reverse=True); out = []
    for sc, x, z, name in cand:
        if len(out) >= 6: break
        if all(math.hypot(o['x'] - x, o['z'] - z) > 750 for o in out) and all(math.hypot(o[0] - x, o[1] - z) > 750 for o in avoid): out.append({'x': round(x, 1), 'z': round(z, 1), 'text': name})
    return out
