#!/usr/bin/env python3
"""A contact sheet of the Landsat pictures of some glaciers -> scripts/.landsat-overview.html (one page, thumbnails embedded, opens in any browser).

Per glacier a row of years (1984 to 2015): the thumbnail of the natural colour picture with its year, date, satellite, cloud and snow share (QA_PIXEL), and a grey box for a year without a picture.
Usage: python3 scripts/landsat_overview.py [id id ...]       (default: the ten Swiss glaciers)   [--style natural|false1|false2]
"""
import argparse, base64, html, io, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SWISS = ['aletsch', 'gorner', 'fiescher', 'unteraar', 'corbassiere', 'zmutt', 'rhone', 'sgi-B56-03', 'sgi-B53-04', 'trift']


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('ids', nargs='*'); ap.add_argument('--style', default='natural'); a = ap.parse_args()
    ids = a.ids or SWISS; suffix = {'natural': '', 'false1': '.false1', 'false2': '.false2'}[a.style]
    out = ['<!doctype html><meta charset="utf-8"><title>Landsat pictures</title><style>body{font:13px system-ui;margin:16px;background:#111;color:#ddd}h2{margin:28px 0 6px}.row{display:flex;flex-wrap:wrap;gap:6px}'
           '.c{width:150px}.c img{width:150px;display:block}.c.no{height:150px;background:#2a2a2a;color:#777;display:flex;align-items:center;justify-content:center}.c small{display:block;color:#999;line-height:1.3}'
           '.c b{color:#fff}.warn{color:#e8a33d}</style>']
    names = {}
    for gid in ids:
        mp = os.path.join(ROOT, 'data', 'landsat', gid + '.json')
        if not os.path.exists(mp): out.append(f'<h2>{html.escape(gid)}</h2><p>no Landsat pictures yet</p>'); continue
        d = json.load(open(mp)); sc = d['scenes']; n = len(sc)
        out.append(f'<h2>{html.escape(gid)} <small>{n} of 32 years have a picture</small></h2><div class="row">')
        for y in range(1984, 2016):
            s = sc.get(str(y))
            if not s: out.append(f'<div class="c"><div class="c no">{y}<br>none</div></div>'); continue
            im = Image.open(os.path.join(ROOT, 'data', 'landsat', gid, f'{y}{suffix}.jpg')).convert('RGB'); im.thumbnail((300, 300))
            buf = io.BytesIO(); im.save(buf, 'JPEG', quality=70); src = base64.b64encode(buf.getvalue()).decode()
            warn = ' warn' if s['cloud'] > 0.2 else ''
            out.append(f'<div class="c"><img src="data:image/jpeg;base64,{src}" alt=""><small><b>{y}</b> {s["date"][5:]} L{str(s["sat"]).replace("landsat-", "")}<br class="x"><span class="{warn.strip()}">cloud {s["cloud"]:.0%}</span> · snow {s["snow"]:.0%}{" · gaps" if s.get("filled") else ""}</small></div>')
        out.append('</div>')
    path = os.path.join(ROOT, 'scripts', '.landsat-overview.html'); open(path, 'w', encoding='utf-8').write('\n'.join(out)); print('wrote', path)


if __name__ == '__main__':
    main()
