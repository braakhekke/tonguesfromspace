#!/usr/bin/env python3
"""Makes cloudmasks.json: for every glacier in glaciers.js two small areas in Web Mercator (EPSG:3857, whole metres) that the
"Latest" option of the site sends to the Copernicus Statistical API to count cloud:

  outline  the 1850 outline (largest extent), outer rings only, simplified
  tongue   a circle of 3 km radius around the tongue tip (the bottom 3 km window of scripts/tools/pick-scenes.html)

The relay accepts at most 20,000 characters per request and Copernicus refuses polygons whose rings cross, so the outline is
thinned by removing the least important vertex one at a time, and a vertex is only removed if the new segment crosses or touches
no other segment. The result never has crossing rings. Rock islands (inner rings) are dropped: the cloud share is counted over
the whole outline including them.

Standard library only. Run by hand when glaciers.js has new outlines:  python3 scripts/make_cloud_masks.py
"""
import heapq, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6378137.0
TARGET_VERTICES = 650            # per glacier, over all rings: about 11,000 characters of JSON
MIN_RING_M2 = 20000              # smaller pieces of the outline are left out
CELL = 400                       # metres, cell of the segment index


def merc(lon, lat):
    return (round(R * math.radians(lon)), round(R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))))


def ring_area(r):
    return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2


def orient(a, b, c):
    v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return (v > 0) - (v < 0)


def on_seg(a, b, c):             # c lies on segment ab, given that a, b, c are collinear
    return min(a[0], b[0]) <= c[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= c[1] <= max(a[1], b[1])


def touch_or_cross(p1, p2, p3, p4):
    o1, o2, o3, o4 = orient(p3, p4, p1), orient(p3, p4, p2), orient(p1, p2, p3), orient(p1, p2, p4)
    if o1 != o2 and o3 != o4:
        return True
    return (o1 == 0 and on_seg(p3, p4, p1)) or (o2 == 0 and on_seg(p3, p4, p2)) or (o3 == 0 and on_seg(p1, p2, p3)) or (o4 == 0 and on_seg(p1, p2, p4))


def simplify(rings, target):
    """rings: lists of integer points (open rings). Returns the thinned rings."""
    pts, ring_of, nxt, prv, alive = [], [], [], [], []
    for ri, r in enumerate(rings):
        base = len(pts)
        for i, p in enumerate(r):
            pts.append(p); ring_of.append(ri); nxt.append(base + (i + 1) % len(r)); prv.append(base + (i - 1) % len(r)); alive.append(True)
    count = [len(r) for r in rings]
    grid = {}

    def cells(a, b):
        x0, x1 = sorted((a[0] // CELL, b[0] // CELL)); y0, y1 = sorted((a[1] // CELL, b[1] // CELL))
        return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

    def add_seg(i):                  # segment from vertex i to nxt[i]
        for c in cells(pts[i], pts[nxt[i]]):
            grid.setdefault(c, set()).add(i)

    def del_seg(i):
        for c in cells(pts[i], pts[nxt[i]]):
            grid[c].discard(i)

    for i in range(len(pts)):
        add_seg(i)

    def tri(v):
        a, b, c = pts[prv[v]], pts[v], pts[nxt[v]]
        return abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2

    version = [0] * len(pts)
    heap = [(tri(v), 0, v) for v in range(len(pts))]
    heapq.heapify(heap)
    total = len(pts)

    def can_remove(v):
        p, n = prv[v], nxt[v]
        a, b = pts[p], pts[n]
        seen = set()
        for c in cells(a, b):
            for s in grid.get(c, ()):
                if s in seen or s == p or s == v:      # the two segments that disappear
                    continue
                seen.add(s)
                t = nxt[s]
                if s == prv[p] or t == n or s == n or t == p:    # neighbours that share an end point with the new segment
                    # sharing one end point is fine unless the segments lie on top of each other
                    shared = pts[s] if pts[s] in (a, b) else pts[t]
                    other_new = b if shared == a else a
                    other_old = pts[t] if shared == pts[s] else pts[s]
                    if orient(shared, other_new, other_old) == 0 and on_seg(shared, other_new, other_old) or \
                       orient(shared, other_new, other_old) == 0 and on_seg(shared, other_old, other_new):
                        return False
                    continue
                if touch_or_cross(a, b, pts[s], pts[t]):
                    return False
        return True

    while total > target and heap:
        area, ver, v = heapq.heappop(heap)
        if not alive[v] or ver != version[v]:
            continue
        if count[ring_of[v]] <= 3:
            continue
        if not can_remove(v):
            continue
        p, n = prv[v], nxt[v]
        del_seg(p); del_seg(v)
        alive[v] = False; nxt[p] = n; prv[n] = p; count[ring_of[v]] -= 1; total -= 1
        add_seg(p)
        for u in (p, n):
            version[u] += 1
            heapq.heappush(heap, (tri(u), version[u], u))
    out = []
    for ri, r in enumerate(rings):
        start = next(i for i in range(len(pts)) if alive[i] and ring_of[i] == ri)
        ring, v = [], start
        while True:
            ring.append(list(pts[v])); v = nxt[v]
            if v == start:
                break
        ring.append(ring[0])
        out.append(ring)
    return out


def bbox(r):
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def drop_touching(rings):
    """Copernicus refuses a MultiPolygon whose pieces touch or overlap. Where a smaller piece does that to a larger one in the inventory
    itself, the smaller piece is left out (the larger one is kept)."""
    keep = []
    for r in sorted(rings, key=ring_area, reverse=True):
        bb = bbox(r); bad = False
        for k in keep:
            kb = bbox(k)
            if bb[2] < kb[0] or kb[2] < bb[0] or bb[3] < kb[1] or kb[3] < bb[1]:
                continue
            if any(touch_or_cross(r[i], r[(i + 1) % len(r)], k[j], k[(j + 1) % len(k)]) for i in range(len(r)) for j in range(len(k))):
                bad = True; break
        if bad:
            print(f'   left out a piece of {ring_area(r) / 1e6:.2f} km2 (Web Mercator) that touches a larger piece')
        else:
            keep.append(r)
    return keep


def outline_mask(multipoly):
    rings = []
    for poly in multipoly['coordinates']:
        r = [merc(x, y) for x, y in poly[0]]
        if r[0] == r[-1]:
            r = r[:-1]
        r = [p for i, p in enumerate(r) if i == 0 or p != r[i - 1]]
        if len(r) >= 4 and ring_area(r) >= MIN_RING_M2:
            rings.append(r)
    full = sum(ring_area(r) for r in rings) / 1e6
    rings = drop_touching(rings)
    total = sum(len(r) for r in rings)
    thin = simplify(rings, min(TARGET_VERTICES, total))
    return [[ring] for ring in thin], sum(ring_area(r[:-1]) for r in thin) / 1e6, full


def merge_overlapping(polys):
    """polygons ([ring] each) that overlap become one: the convex hull of the group (a MultiPolygon with overlapping parts is refused by Copernicus: COMMON_BAD_PAYLOAD)"""
    info = []
    for pg in polys:
        r = pg[0]; xs = [q[0] for q in r]; ys = [q[1] for q in r]; info.append(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(xs) - min(xs)) / 2))
    parent = list(range(len(polys)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i in range(len(polys)):
        for j in range(i + 1, len(polys)):
            if math.hypot(info[i][0] - info[j][0], info[i][1] - info[j][1]) < info[i][2] + info[j][2]: parent[find(i)] = find(j)
    groups = {}
    for i in range(len(polys)): groups.setdefault(find(i), []).append(i)
    def hull(pts):
        pts = sorted(set(map(tuple, pts)))
        cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        lo, up = [], []
        for q in pts:
            while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
            lo.append(q)
        for q in reversed(pts):
            while len(up) >= 2 and cross(up[-2], up[-1], q) <= 0: up.pop()
            up.append(q)
        h = lo[:-1] + up[:-1]; return [list(q) for q in h] + [list(h[0])]
    return [polys[g[0]] if len(g) == 1 else [hull([q for i in g for q in polys[i][0]])] for g in groups.values()]


def tongue_circle(lat, lon, km=3, steps=48):
    cx, cy = merc(lon, lat)
    rad = km * 1000 / math.cos(math.radians(lat))
    ring = [[round(cx + rad * math.cos(2 * math.pi * i / steps)), round(cy + rad * math.sin(2 * math.pi * i / steps))] for i in range(steps)]
    ring.append(ring[0])
    return [[ring]]


def main():
    src = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read()
    data = json.loads(src[src.index('{'):src.rindex('}') + 1])
    out = {'version': 1, 'crs': 'EPSG:3857', 'note': 'made by scripts/make_cloud_masks.py', 'glaciers': {}}
    for g in data['glaciers']:
        old = (g.get('oldest') or {}).get('outline')
        tip = (g.get('terminus') or {}).get('tip') or g['center']
        if not old:
            print('no 1850 outline for', g['name'], file=sys.stderr); continue
        mask, a_simple, a_full = outline_mask(old)
        out['glaciers'][g['id']] = {'name': g['name'], 'outline': mask, 'tongue': tongue_circle(tip[0], tip[1])}
        n = sum(len(p[0]) for p in mask)
        print(f"{g['id']:8} {g['name']:28} {n:4} vertices, area {a_simple:7.2f} km2 of {a_full:7.2f} km2 (outer rings), {len(json.dumps(mask))} characters")
    # The regions of ice caps (Vatnajökull, the rest of Iceland, Svalbard, mainland Norway): the outlet's picture box (a square of 2 x half km) stands for the outline, the circle is around the
    # tongue tip; both from the region's data file (made by build_vatnajokull.py / build_regions.py)
    for fname in ('vatnajokull.js', 'iceland.js', 'svalbard.js', 'norway.js'):
        vj = os.path.join(ROOT, 'data', fname)
        if not os.path.exists(vj): continue
        s2 = open(vj, encoding='utf-8').read()
        for o in json.loads(s2[s2.index('{'):s2.rindex('}') + 1])['outlets']:
            if o.get('image'):      # a whole ice cap (build_cap_images.py): its picture area is the outline, and the circles are around the tip of every outlet
                (s0, w0), (n0, e0) = o['image']['bounds']
                ring = [list(merc(lo, la)) for la, lo in ((s0, w0), (s0, e0), (n0, e0), (n0, w0))]; ring.append(ring[0])
                out['glaciers'][o['id']] = {'name': o['name'], 'outline': [[ring]], 'tongue': merge_overlapping([c[0] for c in (tongue_circle(sb['tip'][0], sb['tip'][1], steps=24) for sb in o['subs'])])}
                print(f"{o['id']:20} {o['name']:28} picture area and {len(o['subs'])} tongue circles ({fname})")
                continue
            dlat = (o.get('halfH') or o['half']) / 111.32; dlon = o['half'] / (111.32 * math.cos(math.radians(o['lat'])))
            ring = [list(merc(o['lon'] + sx * dlon, o['lat'] + sy * dlat)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]; ring.append(ring[0])
            out['glaciers'][o['id']] = {'name': o['name'], 'outline': [[ring]], 'tongue': tongue_circle(o['tip'][0], o['tip'][1])}
            print(f"{o['id']:20} {o['name']:28} picture box and tongue circle ({fname})")
    with open(os.path.join(ROOT, 'data', 'cloudmasks.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote cloudmasks.json')


if __name__ == '__main__':
    main()
