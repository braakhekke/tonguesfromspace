#!/usr/bin/env python3
"""Measures how rough the baked terrain files are (data/terrain/<id>.<hash>.bin); changes nothing in the repository.

A surface is a grid of heights; the file holds the base surface (the newest year) and then one surface per year (build_dem_arctic.py: packed()). For each surface this prints
  steep   share of cells whose steepest neighbour step is over 60 degrees (a wall: real glaciers have almost none)
  wall    share of cells with a jump over 8 m to a neighbour
  rough   mean absolute second difference in metres (noise and stair-steps raise it)
and, per file, how many grid points the strips left to the reference, from the header. Pure Python (no numpy); a file takes about a second.

Usage: python3 scripts/terrain_quality.py                     every file of the manifest, ranked by 'steep' of the base surface
       python3 scripts/terrain_quality.py <id> [<id> ...]     these files, every year
       python3 scripts/terrain_quality.py <id> --png DIR      also write a shaded relief of the base surface and of each year to DIR (needs Pillow)
       python3 scripts/terrain_quality.py --write [<id> ...]  measure these files (all without ids) and write data/terrain/quality.json, with relief pictures in scripts/.relief-cache (the wizard and the board read them)
       python3 scripts/terrain_quality.py <id> --strips       the raw strips of an ArcticDEM glacier (from scripts/.dem-cache, no download of strips; the reference tiles of Mapterhorn may be fetched):
                                                              per strip the share of ground OUTSIDE the glaciers that differs from the reference by more than BLUNDER_M after the builder's own
                                                              median offset (a blunder: cloud, matching error), and the share on the ice that lies more than BLUNDER_M above the newest strip
"""
import argparse, json, math, os, struct, sys, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain_lib as tl

STEEP_DEG, WALL_M, BLUNDER_M = 60, 8.0, 30.0


def surfaces(head, payload):
    """[(label, rows)]: the base surface, then every year of head['yearly'] (rows as terrain_lib.base_heights: far up the glacier first)"""
    nA, nB = head['nA'], head['nB']; w = nB + 1; n = (nA + 1) * w; raw = zlib.decompress(payload)
    labels = ['base'] + [str(y) for y in (head.get('yearly') or {}).get('years', [])]; out = []
    for k, lab in enumerate(labels):
        if (k + 1) * n * 2 > len(raw): break
        flat = struct.unpack_from('<%dh' % n, raw, k * n * 2); rows = []
        for j in range(nA + 1):
            acc, row = 0, []
            for v in flat[j * w:(j + 1) * w]: acc += v; row.append(acc / 10)
            rows.append(row)
        out.append((lab, rows))
    return out


def measure(rows, dx, dy):
    nA, nB = len(rows) - 1, len(rows[0]) - 1; steep = wall = cells = 0; lap = 0.0; tan = math.tan(math.radians(STEEP_DEG))
    for j in range(1, nA):
        r0, r1, r2 = rows[j - 1], rows[j], rows[j + 1]
        for i in range(1, nB):
            c = r1[i]; l, r, u, d = r1[i - 1], r1[i + 1], r0[i], r2[i]; cells += 1
            top = max(abs(c - l), abs(c - r), abs(c - u), abs(c - d))
            if top > WALL_M: wall += 1
            if max(abs(c - l), abs(c - r)) / dx > tan or max(abs(c - u), abs(c - d)) / dy > tan: steep += 1
            lap += abs(l + r - 2 * c) + abs(u + d - 2 * c)
    return steep / cells, wall / cells, lap / cells / 2


def relief(rows, dx, dy, path):
    from PIL import Image
    nA, nB = len(rows) - 1, len(rows[0]) - 1; im = Image.new('L', (nB + 1, nA + 1)); px = im.load(); az, al = math.radians(315), math.radians(40)
    for j in range(nA + 1):
        for i in range(nB + 1):
            zx = (rows[j][min(nB, i + 1)] - rows[j][max(0, i - 1)]) / (2 * dx); zy = (rows[max(0, j - 1)][i] - rows[min(nA, j + 1)][i]) / (2 * dy)      # north is up the picture
            s = math.atan(math.hypot(zx, zy)); a = math.atan2(zy, -zx)
            px[i, j] = max(0, min(255, int(255 * (math.cos(al) * math.cos(s) + math.sin(al) * math.sin(s) * math.cos(az - a)))))
    im.save(path)


SEAM_M, SEAM_SMOOTH_M = 25.0, 3.0


def seams(head, payload, ss=None):
    """Seams between the years: the share of cells where a year's surface jumps by more than SEAM_M from a neighbour although the base surface (the newest year) is smooth there (under SEAM_SMOOTH_M);
    terrain cancels out, what is left is one year stitched from strips that disagree. Looked at for a year near the start of the yearly surfaces and one in the middle, the worse of the two is returned
    as (share, year). Files with one surface only (swissALTI3D files, no yearly surfaces) have none."""
    ss = ss or surfaces(head, payload); lab = [l for l, _ in ss[1:]]
    if len(lab) < 4: return 0.0, None
    B = ss[0][1]; nA, nB = len(B) - 1, len(B[0]) - 1; best = (0.0, None)
    for y in (lab[len(lab) // 4], lab[len(lab) // 2]):
        Y = dict(ss)[y]; k = 0
        for j in range(1, nA):
            for i in range(1, nB):
                for jj, ii in ((j, i + 1), (j + 1, i)):
                    if abs(B[j][i] - B[jj][ii]) < SEAM_SMOOTH_M and abs(Y[j][i] - Y[jj][ii]) > SEAM_M: k += 1
        if k / (nA * nB) > best[0]: best = (k / (nA * nB), y)
    return best


SEAM_WARN, BLUNDER_WARN = 0.005, 0.30      # provisional: set on the 52 files of 2026-10-26 (most Icelandic files lie under 0.2 %, the ones with matching errors over 0.5 %); the gate only warns, nothing stops a build
QUALITY_FILE = os.path.join(tl.OUT, 'quality.json'); RELIEF_DIR = os.path.join(tl.ROOT, 'scripts', '.relief-cache')


def quality(gid):
    """The verdict on the terrain file of one glacier: {file, steep, rough, seams, seamsYear, strips [{date, blunders}], status 'ok' | 'warn', why [...], relief [file names]}.
    'warn' when more than SEAM_WARN of the cells of a year are seams (see seams()); strips with over BLUNDER_WARN of blunders on stable ground are listed in `why` (a build since 2026-10-26 stores them in the
    file's header; the builder leaves their wrong points out). Steepness and roughness are shown, not judged: alpine rock is steep."""
    man = tl.manifest(); head, payload = tl.read(man[gid]); ss = surfaces(head, payload); dx = 2 * head.get('half', 2000) / head['nB']; dy = (head['up'] + head['back']) / head['nA']
    steep, _, rough = measure(ss[0][1], dx, dy); sm, sy = seams(head, payload, ss); why = []
    strips = [{'date': x['date'], 'blunders': x['blunders']} for x in (head.get('yearly') or {}).get('strips', []) if 'blunders' in x]
    if sm > SEAM_WARN: why.append(f'{sm:.2%} of the cells of {sy} jump by more than {SEAM_M:.0f} m from a neighbour where the newest surface is smooth: that year is stitched together from strips that disagree')
    bad = [x for x in strips if x['blunders'] > BLUNDER_WARN]
    if bad: why.append('strips with over %.0f %% matching errors on stable ground (their wrong points are left out): %s' % (BLUNDER_WARN * 100, ', '.join(f"{x['date']} ({x['blunders']:.0%})" for x in bad)))
    os.makedirs(RELIEF_DIR, exist_ok=True); names = []
    for lab, rows in ss:
        if lab == 'base' or lab == sy:
            n = f'{gid}-{lab}.png'; relief(rows, dx, dy, os.path.join(RELIEF_DIR, n)); names.append(n)
    return {'file': man[gid], 'steep': round(steep, 4), 'rough': round(rough, 2), 'seams': round(sm, 5), 'seamsYear': sy, 'strips': strips, 'status': 'warn' if sm > SEAM_WARN else 'ok', 'why': why, 'relief': names}


def read_quality():
    return json.load(open(QUALITY_FILE)) if os.path.exists(QUALITY_FILE) else {}


def write_quality(ids):
    """measure the files of these glaciers and put the verdicts into data/terrain/quality.json (the other entries stay); returns {id: verdict}"""
    q = read_quality(); out = {}
    for gid in ids: out[gid] = q[gid] = quality(gid)
    json.dump(q, open(QUALITY_FILE, 'w'), indent=1, sort_keys=True); return out


def strips(gid):
    """per cached strip of an ArcticDEM glacier: its blunder share on stable ground (the builder's own stable set and median offset, see build_dem_arctic.build) and where the blunders lie"""
    import array, glob, hashlib, statistics
    import build_dem_arctic as b
    bd, lib = b.bd, b.lib; o, place, data = b.load(gid); rec = tl.records().get(gid); o = dict(o, tip=rec['tip'], strip3d=rec['strip3d'])
    st = bd.strip_for(o); bd.HALF, bd.NB = st['half'], st['nb']; nB = st['nb']; ln = st['up'] + st['back']; nA = 2 * round(ln / (2 * st['cell']))
    gkey = hashlib.sha1(repr((st, nA, nB, st['half'], 'v2')).encode()).hexdigest()[:8]; pts = bd.grid(st, nA); lats, lons = [p[6] for p in pts], [p[7] for p in pts]
    dem = lib.Dem(b.PLACE[place]['z']); refs = [dem.h(la, lo) for la, lo in zip(lats, lons)]
    bb = (min(lats), min(lons), max(lats), max(lons)); rings = []
    for src in [o] + [x for x in data['outlets'] if x['id'] != gid] + data['basins']:
        for r in src['outline']:
            if len(r) > 3 and not (max(p[0] for p in r) < bb[0] or min(p[0] for p in r) > bb[2] or max(p[1] for p in r) < bb[1] or min(p[1] for p in r) > bb[3]): rings.append(r)
    stable = [n for n in range(0, len(pts), 3) if refs[n] == refs[n] and refs[n] > 5 and not any(bd.inside(r, lats[n], lons[n]) for r in rings)]
    head, _ = tl.read(tl.manifest()[gid]); out = []
    for s in head['yearly']['strips']:
        f = os.path.join(bd.CACHE, f"{s['id']}.{gkey}.grid")
        if not os.path.exists(f): print(f"  {s['date']}: not in the cache for this strip"); continue
        a = array.array('f'); a.frombytes(open(f, 'rb').read()); d = [a[n] - refs[n] for n in stable if a[n] == a[n]]
        if len(d) < 400: print(f"  {s['date']}: too little stable ground ({len(d)})"); continue
        off = statistics.median(d); bad = sum(1 for v in d if abs(v - off) > BLUNDER_M) / len(d)
        print(f"  {s['date']}  offset {off:6.1f} m  stable ground {len(d):6d} cells  blunders (over {BLUNDER_M:.0f} m from the reference) {bad:6.2%}"); out.append((s['date'], bad))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('ids', nargs='*'); ap.add_argument('--png'); ap.add_argument('--strips', action='store_true'); ap.add_argument('--write', action='store_true'); a = ap.parse_args(); man = tl.manifest(); rank = []
    if a.write:
        for gid, v in write_quality(a.ids or sorted(man)).items(): print(f"{gid:22s} {v['status']:4s} seams {v['seams']:.3%} ({v['seamsYear']})" + ''.join(f'\n    {w}' for w in v['why']))
        return
    if a.strips:
        for gid in a.ids: print(f'{gid}:'); strips(gid)
        return
    for gid in a.ids or sorted(man):
        if gid not in man: print(f'{gid}: no terrain file'); continue
        head, payload = tl.read(man[gid]); dx = 2 * head.get('half', 2000) / head['nB']; dy = (head['up'] + head['back']) / head['nA']; ss = surfaces(head, payload)
        yr = head.get('yearly') or {}; kinds = ' '.join(f'{y}:{k[0]}' for y, k in zip(yr.get('years', []), yr.get('kind', [])))
        print(f'{gid}: grid {head["nB"] + 1} x {head["nA"] + 1}, cell {dx:.0f} x {dy:.0f} m, {len(yr.get("strips", []))} strips' + (f', years {kinds}' if a.ids else ''))
        for lab, rows in (ss if a.ids else ss[:1]):
            st, wl, ro = measure(rows, dx, dy); print(f'   {lab:>5}  steep {st:6.2%}  wall {wl:6.2%}  rough {ro:5.2f} m')
            if lab == 'base': rank.append((st, gid))
            if a.png: os.makedirs(a.png, exist_ok=True); relief(rows, dx, dy, os.path.join(a.png, f'{gid}-{lab}.png'))
    if not a.ids: print('\nranked by steep (base surface):'); [print(f'  {s:6.2%}  {g}') for s, g in sorted(rank, reverse=True)]


if __name__ == '__main__':
    main()
