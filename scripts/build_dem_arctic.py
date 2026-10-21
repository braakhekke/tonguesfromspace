#!/usr/bin/env python3
"""The terrain file of a glacier of Iceland, Svalbard or mainland Norway for the 3D view: one ice surface per year from the dated 2 m ArcticDEM strips.

The method of build_dem_iceland.py (read its docstring: strips found through the PGC STAC catalogue, every strip moved onto a reference with the median difference on ground outside the ice,
the surface of a year at a fixed day by measuring / interpolating / holding, spikes and the flat sea removed), for any glacier of data/vatnajokull.js, iceland.js, svalbard.js and norway.js.
What differs:
  Reference  the terrain tiles of Mapterhorn (icecap_lib.Dem: zoom 12 over Iceland and Svalbard, 13 over Norway) in place of the ÍslandsDEM window. They are heights above sea level made from
             ÍslandsDEM (Iceland), the Kartverket terrain models (Norway) and the NPI S0 terrain model (Svalbard); only the median offset on stable ground is taken from them, so their
             older date and coarser cells hardly matter. Stable ground = outside the outlines of this glacier and of every other glacier of the region that reaches into the strip, above 5 m.
  Season     Iceland: summer strips mid July to mid November, the year at 15 September; Norway: 20 July to 10 October, 1 September; Svalbard: 10 July to 10 September, 25 August (the end of the
             melt season of each place: the same day as the scene of the satellite picture is looked for).
  Sea        where the strip holds the sea (Svalbard, calving fronts) the largest area of points below 4 m is set to one flat level in every year (flatten_lagoon).
Nothing is invented: a grid point that no strip covers falls back on the reference; the file says for each year whether it is measured, interpolated or held.

Needs Python 3.8+ (Pillow for the Mapterhorn tiles) and internet; downloads the strips of the glacier into scripts/.dem-cache/arcticdem (gitignored; the windows are deleted after sampling).
Usage: python3 scripts/build_dem_arctic.py <outlet id> [<outlet id> ...]       (the region is found in the data files)
"""
import argparse, array, bisect, datetime, hashlib, json, math, os, struct, sys, types, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arcticdem as ad
import build_dem_iceland as bd
import icecap_lib as lib
import build_vatnajokull as bv
import build_regions as br

ROOT = lib.ROOT
OUT = os.path.join(ROOT, 'data', 'terrain')
NAN = float('nan')
FILES = [('vatnajokull.js', 'iceland'), ('iceland.js', 'iceland'), ('norway.js', 'norway'), ('svalbard.js', 'svalbard')]
# per region: the zoom of the reference tiles, the bare-ice season of the strips (first and last (month, day)), the day of the year's surface, the largest spread of the stable ground
PLACE = {'iceland': dict(z=12, season=((7, 15), (11, 15)), day=(9, 15), spread=6.0), 'norway': dict(z=13, season=((7, 20), (10, 10)), day=(9, 1), spread=7.0),
         'svalbard': dict(z=12, season=((7, 10), (9, 10)), day=(8, 25), spread=7.0)}
FIRST_YEAR, CHANGE_FROM = bd.FIRST_YEAR, bd.CHANGE_FROM


def sub_strip(sb):
    """The 3D strip of an outlet of an ice cap, by the rule of subGlacier() in js/11-view3d.js: from the tip towards the middle of the catchment, as wide as the catchment is across the first 2 km, as long as
    it reaches up the glacier (3.5 to 9 km)."""
    tip = sb['tip']; k = 111320.0 * math.cos(math.radians(tip[0]))
    pts = [((p[1] - tip[1]) * k, (p[0] - tip[0]) * 111320.0) for ring in sb['outline'] for p in ring]
    cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts); az = (math.degrees(math.atan2(cx, cy)) + 360) % 360
    ue, un = math.sin(math.radians(az)), math.cos(math.radians(az)); along = lambda p: p[0] * ue + p[1] * un; across = lambda p: p[0] * un - p[1] * ue
    up = min(9000.0, max(3500.0, max(along(p) for p in pts) + 600)); near = [p for p in pts if -400 < along(p) < 2000]
    half = min(4500.0, max(2000.0, max([0] + [abs(across(p)) for p in near]) + 400))
    cell = max(14, int(math.ceil(math.sqrt(2 * half * (up + 1500) / 150000.0))))
    return dict(azimuth=int(round(az)), half=int(round(half)), back=1500, up=int(round(up)), cell=cell)


def load(oid):
    if '~' in oid:      # an outlet of an ice cap (the `subs` of the cap in the data file): <cap id>~<number>
        cap, k = oid.split('~'); o, place, data = load(cap); sb = o['subs'][int(k)]
        sub = dict(id=oid, name=sb['name'], tip=sb['tip'], lat=sb['tip'][0], lon=sb['tip'][1], half=o['half'], outline=sb['outline'], strip3d=sub_strip(sb))
        # the rest of the ice cap is ice too: its outline and the other outlets are not stable ground
        data = dict(data, outlets=[x for x in data['outlets'] if x['id'] != cap] + [dict(o, id=cap + '~cap')] + [dict(id=f'{cap}~{j}', outline=b['outline']) for j, b in enumerate(o['subs']) if j != int(k)])
        return sub, place, data
    for fn, place in FILES:
        t = open(os.path.join(ROOT, 'data', fn), encoding='utf-8').read(); d = json.loads(t[t.index('{'):t.rindex('}') + 1])
        for o in d['outlets']:
            if o['id'] == oid: return o, place, d
    sys.exit(f'{oid}: not in the data files')


STALE_DAYS, DONOR_STEP, DONOR_R, MIN_DONORS, MAX_DELTA = 45, 8, 8, 6, 80.0


def estimate_stale(surf, series, years, targets, eligible, strip_day, kinds, nA, NB, on_ice):
    """Ice that no recent strip covers (the swath of the newest strip is a rectangle, the rest of the front was last seen years earlier) stays at the height of its last strip in the
    plain series ('held'), so a straight cliff appears where the newest strip stops. Here such a point (on the glacier's ice, last strip more than 45 days before the day of the year,
    but not later than the newest strip of the area) gets the thinning that the ice around it measured between the same two days: the donors are the points on a coarse lattice
    (every DONOR_STEP cells) whose own series has a strip before the point's last day and one on or after the target day; the change of each donor between the two days (its series interpolated)
    is averaged over a window of DONOR_R lattice cells (about 2 km), and added to the point's last value. At least MIN_DONORS donors must lie in the window and a change is capped at
    MAX_DELTA metres, otherwise the point stays held. Nothing is invented where no ice nearby was measured. Returns {year: share of the grid points estimated}."""
    W = NB + 1; G = max(strip_day[i] for i in eligible); S = DONOR_STEP
    at = lambda pairs, d: None if d < pairs[0][0] or d > pairs[-1][0] else (lambda i: pairs[i][1] if i == 0 else pairs[i - 1][1] + (pairs[i][1] - pairs[i - 1][1]) * (d - pairs[i - 1][0]) / (pairs[i][0] - pairs[i - 1][0]) if pairs[i][0] > pairs[i - 1][0] else pairs[i][1])(bisect.bisect_left([p[0] for p in pairs], d))
    donors = [(j // S, i // S, series[j * W + i]) for j in range(0, nA + 1, S) for i in range(0, NB + 1, S) if series[j * W + i] and on_ice[j * W + i]]
    rows, cols = nA // S + 1, NB // S + 1; field_cache = {}
    def field(d, t):      # the average change between the days d and t of the donors, as sums over the lattice (summed-area tables of the change and of the count)
        key = (round(d), round(t))
        if key in field_cache: return field_cache[key]
        sv = [[0.0] * (cols + 1) for _ in range(rows + 1)]; sc = [[0] * (cols + 1) for _ in range(rows + 1)]; val = {}
        for r, c, pairs in donors:
            if pairs[0][0] <= d and pairs[-1][0] >= t - 30:      # a series whose last epoch (the mean day of strips within 30 days) is just before the target day counts as reaching it
                a, b = at(pairs, d), at(pairs, min(t, pairs[-1][0]))
                if a is not None and b is not None and abs(b - a) <= MAX_DELTA: val[(r, c)] = b - a
        for r in range(rows):
            for c in range(cols):
                v = val.get((r, c)); sv[r + 1][c + 1] = sv[r][c + 1] + sv[r + 1][c] - sv[r][c] + (v or 0.0); sc[r + 1][c + 1] = sc[r][c + 1] + sc[r + 1][c] - sc[r][c] + (v is not None)
        field_cache[key] = (sv, sc); return field_cache[key]
    def delta(n, d, t):
        sv, sc = field(d, t); r, c = (n // W) // S, (n % W) // S; r0, r1, c0, c1 = max(0, r - DONOR_R), min(rows, r + DONOR_R + 1), max(0, c - DONOR_R), min(cols, c + DONOR_R + 1)
        cnt = sc[r1][c1] - sc[r0][c1] - sc[r1][c0] + sc[r0][c0]
        return None if cnt < MIN_DONORS else (sv[r1][c1] - sv[r0][c1] - sv[r1][c0] + sv[r0][c0]) / cnt
    done = {y: 0 for y in years}
    for n, pairs in enumerate(series):
        if not pairs or not on_ice[n]: continue
        last = pairs[-1][0]
        for y, tg in zip(years, targets):
            t = min(tg, G)      # nothing is known after the newest strip: later years stay at its day
            if t - last <= STALE_DAYS: continue
            dl = delta(n, last, t)
            if dl is None: continue
            surf[y][n] = pairs[-1][1] + dl; kinds[y]['held'] -= 1; kinds[y]['estimated'] += 1; done[y] += 1
    total = len(series)
    for y in years:
        if done[y]: print(f'  {y}: {done[y]} grid points on ice estimated from the thinning around them ({done[y] / total:.1%} of the strip)')
    return {y: round(done[y] / total, 4) for y in years if done[y]}


def build(oid):
    o, place, data = load(oid); P = PLACE[place]
    st = bd.strip_for(o); bd.HALF, bd.NB = st['half'], st['nb']; HALF, NB = st['half'], st['nb']; up, back = st['up'], st['back']; ln = up + back; nA = 2 * round(ln / (2 * st['cell']))
    print(f"{o['name']} ({place}): strip {ln:.0f} m long, {2 * HALF:.0f} m wide, grid {NB + 1} x {nA + 1}")
    os.makedirs(bd.CACHE, exist_ok=True)
    pts = bd.grid(st, nA); lats, lons = [p[6] for p in pts], [p[7] for p in pts]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]; box = (min(xs) - 40, min(ys) - 40, max(xs) + 40, max(ys) + 40)
    dem = lib.Dem(P['z']); refs = [dem.h(la, lo) for la, lo in zip(lats, lons)]
    # ice of this glacier and of its neighbours that reaches into the strip: not stable ground
    bb = (min(lats), min(lons), max(lats), max(lons)); rings = []
    for src in [o] + [x for x in data['outlets'] if x['id'] != oid] + data['basins']:
        for r in src['outline']:
            if len(r) > 3 and not (max(p[0] for p in r) < bb[0] or min(p[0] for p in r) > bb[2] or max(p[1] for p in r) < bb[1] or min(p[1] for p in r) > bb[3]): rings.append(r)
    stable = [n for n in range(0, len(pts), 3) if refs[n] == refs[n] and refs[n] > 5 and not any(bd.inside(r, lats[n], lons[n]) for r in rings)]
    print(f'{len(stable)} stable ground points of {len(pts)}; {len(rings)} outlines near')
    if len(stable) < 600: print('too little stable ground: skipped'); return None
    items = ad.find_strips([min(lons), min(lats), max(lons), max(lats)], '2010-01-01', datetime.date.today().isoformat())
    day_of = lambda f: datetime.date.fromisoformat(f['properties']['datetime'][:10])
    is_summer = lambda d: P['season'][0] <= (d.month, d.day) <= P['season'][1]
    summer = sorted(day_of(f) for f in items if is_summer(day_of(f)))
    first_use = max([d for d in summer if d < datetime.date(FIRST_YEAR, 1, 1)], default=datetime.date(2000, 1, 1)); last_summer = max(summer, default=datetime.date(2000, 1, 1))
    items = [f for f in items if day_of(f) >= first_use and (is_summer(day_of(f)) or day_of(f) > last_summer)]
    print(f'{len(items)} strips can be used (from {first_use}; summer strips, winter ones after {last_summer})')
    gkey = hashlib.sha1(repr((st, nA, NB, HALF, 'v2')).encode()).hexdigest()[:8]
    arrs, used = [], []
    with ad.pool() as pool:
        for item in sorted(items, key=lambda f: f['properties']['datetime']):
            sid, date = item['id'], item['properties']['datetime'][:10]
            gpath = os.path.join(bd.CACHE, f'{sid}.{gkey}.grid')
            if os.path.exists(gpath):
                h = array.array('f'); h.frombytes(open(gpath, 'rb').read())
            else:
                try: w = bd.Window(item, box, pool)
                except Exception as e: print(f'  {date} {sid[:40]}: not read ({e})'); continue
                if w.data is None: continue
                h = bd.sample(w, pts, st['cell'])
                with open(gpath, 'wb') as fh: h.tofile(fh)
                for ext in ('', '.json'):
                    try: os.remove(os.path.join(bd.CACHE, sid + '.win' + ext))
                    except OSError: pass
            diffs = [h[n] - refs[n] for n in stable if h[n] == h[n]]; cover = sum(1 for v in h if v == v) / len(h)
            if cover < 0.05 or len(diffs) < 400: print(f'  {date} {sid[:40]}: skipped (covers {cover:.0%}, {len(diffs)} ground points)'); continue
            off = bd.median(diffs); spread = bd.median([abs(d - off) for d in diffs])
            if spread > P['spread']: print(f'  {date} {sid[:40]}: skipped (the ground outside the glacier differs by {spread:.1f} m from the reference: a poor model)'); continue
            arrs.append(array.array('f', [v - off if v == v else NAN for v in h])); used.append({'date': date, 'id': sid, 'cover': round(cover, 2), 'offset': round(off, 1), 'spread': round(spread, 1)})
            print(f'  {date} {sid[:40]}: covers {cover:.0%}, offset {off:.1f} m (spread {spread:.1f} m)')
    if len(used) < 2: print('fewer than two usable strips: no terrain file'); return None
    cur = datetime.date.today().year; years = list(range(FIRST_YEAR, cur + 1)); targets = [datetime.date(y, *P['day']).toordinal() for y in years]
    snow_free = lambda d: is_summer(datetime.date.fromordinal(d))
    strip_day = [datetime.date.fromisoformat(u['date']).toordinal() for u in used]
    last_free = max((d for d in strip_day if snow_free(d)), default=0)
    eligible = [i for i, d in enumerate(strip_day) if snow_free(d) or d > last_free]
    kinds = {y: {'measured': 0, 'interpolated': 0, 'held': 0, 'estimated': 0} for y in years}; surf = {y: [] for y in years}; holes = 0; series = [None] * len(pts)
    for n in range(len(pts)):
        byday = {}
        for i in eligible:
            v = arrs[i][n]
            if v == v: byday.setdefault(strip_day[i], []).append(v)
        pairs = bd.series_of(byday)
        if not pairs:
            holes += 1
            for y in years: surf[y].append(refs[n])
            continue
        days = [p[0] for p in pairs]; series[n] = pairs
        for y, tg in zip(years, targets):
            i = bisect.bisect_left(days, tg)
            if i == 0: v, k = pairs[0][1], 'held'
            elif i == len(days): v, k = pairs[-1][1], 'held'
            else:
                (d0, v0), (d1, v1) = pairs[i - 1], pairs[i]; v = v0 + (v1 - v0) * (tg - d0) / (d1 - d0); k = 'measured' if min(tg - d0, d1 - tg) <= 45 else 'interpolated'
            surf[y].append(v); kinds[y][k] += 1
    gridb = bv.Grid(o['lat'], o['lon'], (min(lats) - 0.01, min(lons) - 0.02, max(lats) + 0.01, max(lons) + 0.02)); basin = br.fill_rings(gridb, o['outline'])
    estimated = estimate_stale(surf, series, years, targets, eligible, strip_day, kinds, nA, NB, [gridb.at(basin, lats[n], lons[n]) for n in range(len(pts))])
    for y in years: surf[y] = array.array('f', surf[y]); bd.despike_lone(surf[y], NB)
    lv = bd.flatten_lagoon(surf[years[-1]], NB)      # the sea (or a lagoon) in front of the glacier is flat, at one level in every year
    if lv is not None:
        for y in years[:-1]: bd.flatten_lagoon(surf[y], NB, level=lv)
        print(f'sea/lagoon level {lv:.1f} m')
    print(f'{holes} grid points without any strip fall back on the reference')
    kind_of = {}
    for y in years:
        k = max(kinds[y], key=kinds[y].get); kind_of[y] = k
    print('kinds:', ' '.join(f'{y}:{kind_of[y][0]}' for y in years))
    sel = [n for n in range(len(pts)) if refs[n] == refs[n] and refs[n] > 5 and gridb.at(basin, lats[n], lons[n])]
    change = None
    if len(sel) > 100 and CHANGE_FROM in surf and 2022 in surf:
        d1622 = [surf[2022][n] - surf[CHANGE_FROM][n] for n in sel]; cell_km2 = (2 * HALF / NB) * (ln / nA) / 1e6
        change = {'from': CHANGE_FROM, 'to': 2022, 'meanM': round(sum(d1622) / len(d1622), 1), 'areaKm2': round(len(sel) * cell_km2, 1), 'km3': round(sum(d1622) * cell_km2 / 1000, 2), 'kind': [kind_of[CHANGE_FROM], kind_of[2022]]}
        change['byYear'] = {str(y): round(sum(surf[y][n] - surf[CHANGE_FROM][n] for n in sel) / len(sel), 1) for y in years}
        print('surface change 2016 to 2022 inside the outline:', {k: v for k, v in change.items() if k != 'byYear'})
    try: names = bd.names_for(st, nA, surf[years[-1]], 0); print('names:', [n['text'] for n in names])
    except Exception as e: names = []; print('names failed:', e)
    jt = int(up / ln * nA + 0.5); h0 = refs[jt * (NB + 1) + NB // 2]
    if h0 != h0: h0 = bd.median([r for r in refs if r == r])
    def packed(vals):
        flat = []
        for j in range(nA + 1):
            row = [int(round((v - h0) * 10)) if v == v else 0 for v in vals[j * (NB + 1):(j + 1) * (NB + 1)]]
            flat += [row[0]] + [row[i] - row[i - 1] for i in range(1, len(row))]
        assert all(-32768 <= x <= 32767 for x in flat), 'height out of range'
        return struct.pack('<%dh' % len(flat), *flat)
    head = {'v': 1, 'id': o['id'], 'P': list(st['P']), 'k': st['k'], 'ue': st['ue'], 'un': st['un'], 'up': up, 'back': back, 'nA': nA, 'nB': NB, 'h0': h0, 'dem': None, 'names': names, 'radar': [], 'change': change, 'half': HALF, 'tex': st['tex'],
            'yearly': {'years': years, 'kind': [kind_of[y] for y in years], 'estimated': {str(y): estimated.get(y, 0) for y in years}, 'day': '%02d-%02d' % P['day'], 'strips': [{'date': u['date'], 'id': u['id']} for u in used],
                       'reference': {'iceland': 'ÍslandsDEM (via Mapterhorn)', 'norway': 'the Kartverket terrain model (via Mapterhorn)', 'svalbard': 'the S0 terrain model of the Norwegian Polar Institute (via Mapterhorn)'}[place]},
            'built': datetime.date.today().isoformat()}
    payload = zlib.compress(packed(surf[years[-1]]) + b''.join(packed(surf[y]) for y in years), 9)
    hb = json.dumps(head, separators=(',', ':')).encode(); blob = b'TFS1' + struct.pack('<I', len(hb)) + hb + payload
    name = f"{o['id']}.{hashlib.sha1(blob).hexdigest()[:8]}.bin"; os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith(o['id'] + '.') and f.endswith('.bin') and f != name: os.remove(os.path.join(OUT, f))
    open(os.path.join(OUT, name), 'wb').write(blob)
    mp = os.path.join(OUT, 'manifest.json'); man = json.load(open(mp)) if os.path.exists(mp) else {}; man[o['id']] = name
    json.dump(man, open(mp, 'w'), indent=1, sort_keys=True)
    print(f'wrote {name}: {len(blob) / 1024:.0f} KB, {len(used)} strips used')
    return name


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('outlets', nargs='+'); a = ap.parse_args()
    for oid in a.outlets: build(oid)


if __name__ == '__main__':
    main()
