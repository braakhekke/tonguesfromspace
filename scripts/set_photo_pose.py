#!/usr/bin/env python3
"""Write a corrected camera pose into photos.json for one photograph (by its Smapshot id).

    python3 scripts/set_photo_pose.py 266199 --az 163.2 --tilt 5.9 --roll 355.9 --focal 4400 --lat 46.682 --lon 8.3616 --alt 2012

Only the fields you give are changed. The 3D view has a tool that finds the numbers: open the page with tune=1 in the address (for example
http://localhost:8000/index.html#g=trift&v=3d&tune=1), open the photograph under "Then and now", move the sliders until ridge lines of the photograph and the terrain
agree (the "Overlay" box shows the photograph half transparent over the whole view), then press "Copy command" and paste it in a terminal in the project folder.
Angles in degrees as Smapshot stores them (tilt 0 is level, 360 - x is x degrees down; roll 0 is level), focal length in pixels of the full-size photograph, altitude in metres.
Standard library only. --dry-run shows what would change.
"""
import argparse, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, 'data', 'photos.json')
FIELDS = {'lat': 6, 'lon': 6, 'alt': 1, 'az': 2, 'tilt': 2, 'roll': 2, 'focal': 1}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id', type=int, help='Smapshot id of the photograph (the "id" in photos.json, the number in its Smapshot link)')
    for k in FIELDS: ap.add_argument('--' + k, type=float)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    data = json.load(open(PATH, encoding='utf-8'))
    hits = [(g, p) for g, lst in data.items() for p in lst if p.get('id') == a.id]
    if not hits: sys.exit(f'No photograph with id {a.id} in photos.json.')
    g, p = hits[0]
    changed = 0
    for k, nd in FIELDS.items():
        v = getattr(a, k)
        if v is None: continue
        v = round(v, nd)
        if p.get(k) != v: print(f'  {k}: {p.get(k)} -> {v}'); p[k] = v; changed += 1
    print(f'{p.get("title")} {p.get("date")} (glacier {g}, id {a.id}): {changed} value(s) changed' + (' (dry run, nothing written)' if a.dry_run else ''))
    if changed and not a.dry_run:
        json.dump(data, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('wrote', PATH, '- reload the page (the 3D view reads photos.json fresh; the public site needs a deploy)')


if __name__ == '__main__':
    main()
