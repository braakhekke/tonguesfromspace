#!/usr/bin/env python3
"""GLAMOS repeat photographs of a glacier, checked against the 3D data (prototype: Aletsch).

Source: https://doi.glamos.ch/repeatphoto/index.html, one HTML table: picture name, camera position (CH1903/LV95 east, north, height), view direction (azimuth in
degrees), date, glaciers in the picture (with SGI id), copyright (swisstopo for the old photographs, VAW ETH Zürich for the new ones), file. There is no tilt, roll or
focal length, and no licence text (credits only): ask GLAMOS (VAW, ETH Zürich) before the pictures are shown on the site.

For every photograph that shows the glacier the script prints what can be checked without the picture:
  - distance from the camera to the tongue tip, and the bearing to the tip against the stated azimuth (the tip should be inside the field of view);
  - camera height minus the swissALTI3D ground under it (same height system? a tripod stands about 1.5 m above the ground);
  - the share of today's tongue (2023 outline within 3 km of the tip, as in build_photos.py) that lies within +-FOV/2 of the azimuth and in view over the ground.
Old and new photographs of one site share the camera position and azimuth in the table (the new one was taken from the old spot); they are paired by site number.

Standard library only; the ground comes from the swissALTI3D tiles in scripts/.dem-cache (see build_sightline.py).
Usage: python3 scripts/build_glamos_photos.py [--id B36-26] [--fov 60] [--all]
"""
import argparse, html, json, math, os, re, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_photos as bp

URL = 'https://doi.glamos.ch/repeatphoto/index.html'
PICS = 'https://doi.glamos.ch/repeatphoto/pictures/'


def table(text):
    rows = []
    for r in re.findall(r'<tr>(.*?)</tr>', text, re.S):
        c = [html.unescape(re.sub(r'<.*?>', '', x)).strip() for x in re.findall(r'<td>(.*?)</td>', r, re.S)]
        m = re.search(r'(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)', c[1]) if len(c) >= 7 else None
        f = re.search(r'href=(\S+?)>', r)
        if not m or not f: continue
        d = c[3].split('.')
        rows.append({'name': c[0], 'e': float(m[1]), 'n': float(m[2]), 'z': float(m[3]), 'az': float(c[2]), 'date': f'{d[2]}-{d[1]}-{d[0]}' if len(d) == 3 else None,
                     'year': int(c[4]), 'glaciers': c[5], 'copyright': c[6], 'file': PICS + f[1].split('/')[-1]})
    return rows


def site(name):            # "1518_Moosfluh_L_1927" -> "1518_Moosfluh_L"; the fixed cameras of VAW ("005-fix1_aletsch_20200529") -> "005-fix1_aletsch"
    return re.sub(r'_(\d{4}(-\d\d)?|\d{8})$', '', name)


def lv95_to_wgs(e, n):            # swisstopo's approximate formulas
    y, x = (e - 2600000) / 1e6, (n - 1200000) / 1e6
    lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return lat * 100 / 36, lon * 100 / 36


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--id', default='B36-26'); ap.add_argument('--fov', type=float, default=60, help='horizontal field of view assumed for the share (degrees)'); ap.add_argument('--all', action='store_true', help='also the photographs that do not show the tongue')
    ap.add_argument('--dump', help='write the pairs as JSON to this file')
    a = ap.parse_args()
    rows = [r for r in table(urllib.request.urlopen(URL, timeout=90).read().decode('utf-8', 'replace')) if f'({a.id})' in r['glaciers']]
    s = open(os.path.join(bp.ROOT, 'glaciers.js'), encoding='utf-8').read()
    g = next(g for g in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers'] if g['id'] == a.id)
    lat, lon = g['terminus']['tip']; te, tn = bp.lv95(lat, lon); R = bp.GROUND_R
    e0, n0 = int((te - R) // bp.CELL * bp.CELL), int((tn - R) // bp.CELL * bp.CELL); w = h = int(2 * R // bp.CELL) + 1
    H = bp.ground(e0, n0, w, h)

    def height(x, y):
        fx, fy = (x - e0) / bp.CELL - 0.5, (y - n0) / bp.CELL - 0.5; i, j = int(math.floor(fx)), int(math.floor(fy))
        if i < 0 or j < 0 or i + 1 >= w or j + 1 >= h: return float('nan')
        ax, ay = fx - i, fy - j; p, q, r, t = H[j * w + i], H[j * w + i + 1], H[(j + 1) * w + i], H[(j + 1) * w + i + 1]
        return (p * (1 - ax) + q * ax) * (1 - ay) + (r * (1 - ax) + t * ax) * ay

    polys = [[[bp.lv95(la, lo) for lo, la in ring] for ring in poly] for poly in g['outline']['coordinates']]
    targets = []
    for k in range(-15, 16):
        for m in range(-15, 16):
            x, y = te + k * bp.SAMPLE, tn + m * bp.SAMPLE
            if math.hypot(x - te, y - tn) <= bp.TONGUE_M and any(bp.in_ring(x, y, p[0]) and not any(bp.in_ring(x, y, hole) for hole in p[1:]) for p in polys):
                z = height(x, y)
                if z == z: targets.append((x, y, z))
    print(f'{g["name"]}: tip LV95 {te:.0f} {tn:.0f}, {len(targets)} target points, {len(rows)} photographs in the table\n', file=sys.stderr)
    bearing = lambda dx, dy: math.degrees(math.atan2(dx, dy)) % 360
    sig = lambda d: (d + 180) % 360 - 180
    out = []
    for r in sorted(rows, key=lambda r: (site(r['name']), r['year'])):
        dx, dy = te - r['e'], tn - r['n']; dist = math.hypot(dx, dy); off = sig(bearing(dx, dy) - r['az']); gz = height(r['e'], r['n'])
        seen = 0
        for (x, y, z) in targets:
            d = (x - r['e'], y - r['n'], z - r['z'])
            if abs(sig(bearing(d[0], d[1]) - r['az'])) > a.fov / 2: continue
            D = math.hypot(d[0], d[1]); free = True
            for k in range(1, max(2, int(D // 20)) - 1):
                t = k / max(2, int(D // 20)); hz = height(r['e'] + d[0] * t, r['n'] + d[1] * t)
                if hz == hz and hz > r['z'] + d[2] * t + 2: free = False; break
            seen += free
        r.update(dist_tip_m=round(dist), tip_offset_deg=round(off), cam_minus_ground_m=round(r['z'] - gz, 1) if gz == gz else None, share=round(seen / len(targets), 2), site=site(r['name']))
        out.append(r)
    for r in out:
        if r['share'] == 0 and not a.all: continue
        print(f"{r['name']:34} {r['date']}  tip {r['dist_tip_m']:6} m  tip at {r['tip_offset_deg']:+4}° from view dir  cam-ground {r['cam_minus_ground_m']!s:6} m  tongue in {a.fov:.0f}° view: {r['share']:.2f}  {r['copyright']}", file=sys.stderr)
    if a.dump: json.dump(out, open(a.dump, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
