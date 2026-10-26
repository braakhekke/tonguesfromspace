#!/usr/bin/env python3
"""The one entry point for the baked 3D terrain file of any glacier of any region (data/terrain/<id>.<hash>.bin + manifest.json).

The strip comes from the glacier's record (data/boxes.js, generated from data/regions/) for every glacier; the source of the heights differs by region and nothing else does:
  ch                      build_terrain_bundle.py  swissALTI3D (newest edition), ice change, radar pins, peak names
  everything else         build_dem_arctic.py      dated ArcticDEM strips (one surface per year) on a Mapterhorn reference
After each build the file is checked against the record (terrain_lib.strip_problems); a mismatch is an error.

Usage: python3 scripts/build_terrain.py <id> [<id> ...]     build these
       python3 scripts/build_terrain.py --missing           build every record that has no file
       python3 scripts/build_terrain.py --names [<id> ...]  put the peak names into existing files from their own heights (no heights are rebuilt); only files with no names unless --force
       python3 scripts/build_terrain.py --check             list missing files and files whose strip differs from the record (changes nothing)
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain_lib as tl
import terrain_names as tn


def check():
    recs, man, bad = tl.records(), tl.manifest(), 0
    for i in tl.missing(): print(f'{i}: no terrain file'); bad += 1
    for i, r in recs.items():
        if r.get('parent') or i not in man or not os.path.exists(os.path.join(tl.OUT, man[i])): continue
        for p in tl.strip_problems(i): print(f'{i}: strip differs from the record: {p}'); bad += 1
    print('all terrain files match their records' if not bad else f'{bad} problem(s)'); return bad


def refresh_names(ids, force):
    recs, man = tl.records(), tl.manifest()
    for gid in ids or [i for i in recs if i in man]:
        head, payload = tl.read(man[gid])
        if head.get('names') and not force: continue
        rows = tl.base_heights(head, payload); nA, nB, half = head['nA'], head['nB'], head.get('half', 2000); up, back = head['up'], head['back']; ln = up + back
        at_ = lambda a, b: rows[min(nA, max(0, round((up - a) / ln * nA)))][min(nB, max(0, round((b + half) / (2 * half) * nB)))]
        try: names = tn.names_for(recs[gid]['region'], dict(head, half=half), at_)
        except Exception as e: print(f'{gid}: names failed ({e}); file unchanged'); continue
        head['names'] = names; head['namesSource'] = tn.source(recs[gid]['region'])[0]; name, size = tl.write_bundle(gid, head, payload)
        print(f'{gid}: {len(names)} names from {tn.source(recs[gid]["region"])[0]} ({", ".join(n["text"] for n in names)}); {name}')


def build_one(gid):
    r = tl.records().get(gid)
    if not r: sys.exit(f'{gid}: no record in data/boxes.js (place it first: walkthrough)')
    if r['region'] == 'ch':
        import build_terrain_bundle as b
        s = open(os.path.join(tl.ROOT, 'data', 'glaciers.js'), encoding='utf-8').read(); import json
        g = next(x for x in json.loads(s[s.index('{'):s.rindex('}') + 1])['glaciers'] if x['id'] == gid); b.build(g, b.Tiles())
    else:
        import build_dem_arctic as a
        if not a.build(gid): sys.exit(f'{gid}: no terrain file made')
    bad = tl.strip_problems(gid)
    if bad: sys.exit(f'{gid}: the new file differs from the record: {bad}')
    import terrain_quality as tq      # the gate only warns: the verdict goes into data/terrain/quality.json and is printed, the build is never stopped by it
    v = tq.write_quality([gid])[gid]; print(f"terrain quality: {v['status'].upper()}, seams {v['seams']:.2%} of the cells ({v['seamsYear']}), steep {v['steep']:.2%}, roughness {v['rough']} m" + ''.join(f'\n  {w}' for w in v['why']))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('ids', nargs='*'); ap.add_argument('--missing', action='store_true'); ap.add_argument('--check', action='store_true'); ap.add_argument('--names', action='store_true'); ap.add_argument('--force', action='store_true'); a = ap.parse_args()
    if a.names: return refresh_names(a.ids, a.force)
    if a.check: sys.exit(1 if check() else 0)
    for gid in (tl.missing() if a.missing else a.ids): build_one(gid)


if __name__ == '__main__':
    main()
