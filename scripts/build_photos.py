#!/usr/bin/env python3
"""Historic photographs of a glacier tongue, with the camera position and angles, for the 3D view (prototype: Aletsch).

Source: Smapshot (HEIG-VD, https://smapshot.heig-vd.ch, API https://smapshot.heig-vd.ch/api/v1/docs/). Volunteers place a historic photograph in a 3D model of the
terrain; the result is its camera position (longitude, latitude, altitude) and angles (azimuth, tilt, roll) and the focal length in pixels. The photos belong to
archives (here mostly ETH Library, Bildarchiv, and swisstopo's LBS collection) and carry their own licence, which Smapshot returns with each photo.

What the script does for a glacier:
  1. asks Smapshot for every validated photo whose camera stands within RADIUS metres of the tongue tip, takes out the straight-down (nadir) ones;
  2. reads the pose of each one (one request per photo);
  3. keeps the photos that show the tongue: target points on today's tongue (the 2023 outline within TONGUE_M of the tip, every SAMPLE metres, with the ground height
     of swissALTI3D) are projected into the photo with its pose; a target counts when it lies inside the frame and the line from the camera to it is free
     (against today's ground, so a view of the old, higher ice may lose a few targets); at least MIN_SHARE of the targets must count;
  4. picks N photos spread over the decades (the best of each decade, the best of the rest to fill up) and writes photos.json.

Angles: azimuth is the heading in degrees clockwise from north; tilt 0 is horizontal, 360 - x is x degrees down (checked on the Aletsch photo of 1956, whose horizon sits
a third from the top); roll is a small turn about the viewing direction. Altitude is compared with the ground height under the camera and printed (a large difference would mean
another height system).

Standard library only. The ground comes from the swissALTI3D tiles in scripts/.dem-cache (see build_sightline.py), missing tiles are skipped.
Usage: python3 scripts/build_photos.py [--id B36-26] [--n 10]
"""
import argparse, array, collections, concurrent.futures, json, math, os, sys, urllib.parse, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache')
OUT = os.path.join(ROOT, 'photos.json')
API = 'https://smapshot.heig-vd.ch/api/v1/'
RADIUS = 5000        # metres: cameras within this distance of the tongue tip
TONGUE_M = 3000      # the tongue for the photos: today's glacier within this distance of the tip
SAMPLE = 200
MIN_SHARE = 0.15
CELL = 10
GROUND_R = 7000      # metres of ground around the tip


def lv95(lat, lon):
    p = (lat * 3600 - 169028.66) / 10000; l = (lon * 3600 - 26782.5) / 10000
    return (2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
            1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3)


def newest_tile(e, n):
    for year in range(2026, 2019, -1):
        p = os.path.join(CACHE, f'swissalti3d_{year}_{e}-{n}_2.xyz.zip')
        if os.path.exists(p): return p
    return None


def ground(e0, n0, w, h):
    s = array.array('f', [0.0]) * (w * h); c = array.array('H', [0]) * (w * h)
    for e in range(int(e0 // 1000), int((e0 + w * CELL) // 1000) + 1):
        for n in range(int(n0 // 1000), int((n0 + h * CELL) // 1000) + 1):
            p = newest_tile(e, n)
            if not p: continue
            z = zipfile.ZipFile(p)
            for line in z.open([x for x in z.namelist() if x.endswith('.xyz')][0]):
                q = line.split()
                try: x, y, v = float(q[0]), float(q[1]), float(q[2])
                except (ValueError, IndexError): continue
                if v < -500: continue
                i, j = int((x - e0) // CELL), int((y - n0) // CELL)
                if 0 <= i < w and 0 <= j < h: s[j * w + i] += v; c[j * w + i] += 1
    return array.array('f', [s[k] / c[k] if c[k] else float('nan') for k in range(w * h)])


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r: return json.load(r)
        except Exception:
            if k == tries - 1: return None


def candidates(lat, lon):
    dl = RADIUS / 110950.0; dn = RADIUS / (111320.0 * math.cos(math.radians(lat)))
    out, off = [], 0
    while True:
        q = [('limit', 200), ('offset', off), ('state[]', 'validated')] + [('bbox[]', v) for v in (lon - dn, lat - dl, lon + dn, lat + dl)]
        j = get(API + 'images?' + urllib.parse.urlencode(q))
        if not j: break
        out += j['rows']
        if len(out) >= j['count'] or not j['rows']: break
        off += 200
    return [r for r in out if r.get('view_type') != 'nadir']


def in_ring(x, y, ring):
    ins = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ins = not ins
    return ins


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', nargs='*', default=['B36-26']); ap.add_argument('--n', type=int, default=10)
    ap.add_argument('--min-share', type=float, default=MIN_SHARE, help='share of the tongue that must count'); ap.add_argument('--los-from', type=int, default=0, help='the free line of sight counts only for photos of this year on (older ones: the ice stood higher than today)'); ap.add_argument('--max-dist', type=int, default=4500, help='metres: mean distance to the tongue points that are in view'); ap.add_argument('--min-px', type=int, default=3000, help='width of the photo in pixels'); ap.add_argument('--no-los', action='store_true', help='count a target when it is inside the frame, without the free line of sight (old photos: the ice then stood higher than today)'); ap.add_argument('--dump', help='write every photo that shows the tongue (not only the pick) to this file'); ap.add_argument('--keep', type=int, nargs='*', default=[], help='photo ids that are always taken (a hand choice)')
    a = ap.parse_args()
    s = open(os.path.join(ROOT, 'glaciers.js'), encoding='utf-8').read()
    glaciers = json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers']
    out = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    for g in glaciers:
        if g['id'] not in a.id: continue
        lat, lon = g['terminus']['tip']; te, tn = lv95(lat, lon)
        e0, n0 = int((te - GROUND_R) // CELL * CELL), int((tn - GROUND_R) // CELL * CELL); w = h = int(2 * GROUND_R // CELL) + 1
        print(f'{g["name"]}: ground model', file=sys.stderr)
        H = ground(e0, n0, w, h)

        def height(x, y):
            fx, fy = (x - e0) / CELL - 0.5, (y - n0) / CELL - 0.5; i, j = int(math.floor(fx)), int(math.floor(fy))
            if i < 0 or j < 0 or i + 1 >= w or j + 1 >= h: return float('nan')
            ax, ay = fx - i, fy - j; p, q, r, t = H[j * w + i], H[j * w + i + 1], H[(j + 1) * w + i], H[(j + 1) * w + i + 1]
            return (p * (1 - ax) + q * ax) * (1 - ay) + (r * (1 - ax) + t * ax) * ay

        polys = [[[lv95(la, lo) for lo, la in ring] for ring in poly] for poly in g['outline']['coordinates']]
        targets = []
        for k in range(int(-TONGUE_M // SAMPLE), int(TONGUE_M // SAMPLE) + 1):
            for m in range(int(-TONGUE_M // SAMPLE), int(TONGUE_M // SAMPLE) + 1):
                x, y = te + k * SAMPLE, tn + m * SAMPLE
                if math.hypot(x - te, y - tn) <= TONGUE_M and any(in_ring(x, y, p[0]) and not any(in_ring(x, y, hole) for hole in p[1:]) for p in polys):
                    z = height(x, y)
                    if z == z: targets.append((x, y, z))
        print(f'  {len(targets)} target points on the tongue', file=sys.stderr)

        rows = candidates(lat, lon); print(f'  {len(rows)} candidate photos', file=sys.stderr)
        with concurrent.futures.ThreadPoolExecutor(8) as ex: attrs = list(ex.map(lambda r: get(API + f'images/{r["id"]}/attributes'), rows))
        scored, dalt = [], []
        for r, at in zip(rows, attrs):
            if not at or not at.get('poses'): continue
            p = at['poses'][0]
            if p.get('state') != 'validated' or not p.get('focal') or not (r.get('date_shot_min') or at.get('date_shot_min')): continue
            d0, d1 = at.get('date_shot_min'), at.get('date_shot_max') or at.get('date_shot_min')
            if not d0 or int(d1[:4]) - int(d0[:4]) > 1 or (int(d1[:4]) - int(d0[:4]) == 1 and d1[5:] != '01-01'): continue      # the date must be known to about a year: Smapshot stores "date unknown" as a wide range such as 1860 to 1999
            ce, cn = lv95(p['latitude'], p['longitude']); cz = p['altitude']; gz = height(ce, cn)
            if gz == gz: dalt.append(cz - gz)
            yaw = math.radians(p['azimuth']); tilt = p['tilt']; pitch = math.radians(tilt - 360 if tilt >= 180 else tilt); roll = math.radians(p['roll'] - 360 if p['roll'] >= 180 else p['roll'])
            f = (math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch))            # forward in (east, north, up)
            rt = (math.cos(yaw), -math.sin(yaw), 0.0)                                                         # right
            up = (f[1] * rt[2] - f[2] * rt[1], f[2] * rt[0] - f[0] * rt[2], f[0] * rt[1] - f[1] * rt[0])
            cr, sr = math.cos(roll), math.sin(roll)
            rt2 = tuple(rt[i] * cr + up[i] * sr for i in range(3)); up2 = tuple(-rt[i] * sr + up[i] * cr for i in range(3))
            W, Hh, F = at['width'], at['height'], p['focal']; n_in = n_seen = 0; dsum = 0.0; year = int(d0[:4])
            if W < a.min_px or max(W, Hh) > 7000: continue      # too small, or a scan of a whole print sheet (8000 x 10800 px) rather than a photograph
            for (x, y, z) in targets:
                d = (x - ce, y - cn, z - cz); zc = sum(d[i] * f[i] for i in range(3))
                if zc <= 50: continue
                px = W / 2 + F * sum(d[i] * rt2[i] for i in range(3)) / zc; py = Hh / 2 - F * sum(d[i] * up2[i] for i in range(3)) / zc
                if not (0 <= px <= W and 0 <= py <= Hh): continue
                n_in += 1
                D = math.hypot(d[0], d[1]); steps = max(2, int(D // 20)); free = True
                if a.no_los or year < a.los_from: n_seen += 1; dsum += D; continue
                for k in range(1, steps - 1):
                    t = k / steps; hz = height(ce + d[0] * t, cn + d[1] * t)
                    if hz == hz and hz > cz + d[2] * t + 2: free = False; break
                if free: n_seen += 1; dsum += math.hypot(d[0], d[1])
            share = n_seen / len(targets)
            if share < a.min_share or dsum / max(1, n_seen) > a.max_dist: continue
            m = at.get('media') or {}; tiles = (m.get('tiles') or {}).get('url')
            full = tiles[:-len('/info.json')] + '/full/1600,/0/default.jpg' if tiles and tiles.endswith('/info.json') else m.get('image_url')
            thumb = (tiles[:-len('/info.json')] + '/full/320,/0/default.jpg') if tiles and tiles.endswith('/info.json') else m.get('image_url')
            scored.append({'id': at['id'], 'title': at.get('title'), 'date': at.get('date_shot_min'), 'year': int(at['date_shot_min'][:4]), 'view': at.get('view_type'), 'lat': p['latitude'], 'lon': p['longitude'],
                           'alt': round(cz, 1), 'az': round(p['azimuth'], 2), 'tilt': round(tilt, 2), 'roll': round(p['roll'], 2), 'focal': round(F, 1), 'w': W, 'h': Hh, 'src': full, 'thumb': thumb,
                           'licence': at.get('license'), 'owner': (at.get('owner') or {}).get('name'), 'link': f'https://smapshot.heig-vd.ch/visit/{at["id"]}', 'original': at.get('link'),
                           'share': round(share, 2), 'dist_m': round(dsum / max(1, n_seen)), 'pixels': W * Hh})
        if dalt: dalt.sort(); print(f'  camera altitude minus ground at the camera: median {dalt[len(dalt)//2]:.1f} m, 10-90 %: {dalt[len(dalt)//10]:.0f} to {dalt[len(dalt)*9//10]:.0f} m ({len(dalt)} photos)', file=sys.stderr)
        print(f'  {len(scored)} photos show the tongue; by decade: {dict(sorted(collections.Counter(x["year"] // 10 * 10 for x in scored).items()))}', file=sys.stderr)
        # the pick: the best of each decade first (share of the tongue seen, then size), then the best of the rest
        if a.dump:
            dd = json.load(open(a.dump, encoding='utf-8')) if os.path.exists(a.dump) else {}; dd[g['id']] = scored; json.dump(dd, open(a.dump, 'w', encoding='utf-8'), ensure_ascii=False)
        key = lambda x: (x['share'] >= 0.4, min(x['pixels'], 8e6), x['share'], -x['dist_m'])
        picked, dec = [], collections.defaultdict(list)
        for x in scored: dec[x['year'] // 10 * 10].append(x)
        for d in sorted(dec): picked.append(max(dec[d], key=key))
        picked = [x for x in scored if x['id'] in a.keep] + [x for x in sorted(picked, key=key, reverse=True) if x['id'] not in a.keep]
        picked = picked[:a.n]
        picked.sort(key=lambda x: x['date'])
        out[g['id']] = picked
        for x in picked: print(f"  {x['date']} #{x['id']} {x['view']:12} share {x['share']:.2f} dist {x['dist_m']} m  {x['title'][:70]}  [{x['licence']}]", file=sys.stderr)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', OUT, file=sys.stderr)


if __name__ == '__main__':
    main()
