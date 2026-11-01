#!/usr/bin/env python3
"""Stage 1 of the per-glacier pipeline (docs/PIPELINE_SWISS.md): propose the placement (picture box, tip, 3D strip) of the Swiss glaciers from the rule
(icecap_lib.derive_view on the newest outline and the Mapterhorn terrain), render every proposal in the REAL site (map and 3D, Playwright) and write one
contact sheet with a card per glacier: scripts/.placement/index.html.

The proposals are NOT data. They are written to scripts/.placement/proposals.json and, only when the owner has looked, put into the walkthrough with
`npm run walkthrough -- ...` (propose-box) and confirmed there. This script never writes a record and never confirms anything.

  python3 scripts/placement_sheet.py [--ids B56-07 ...] [--no-render]      (needs: python3 scripts/serve.py on :8000, playwright + chromium)
"""
import argparse, json, os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import icecap_lib as L

OUT = os.path.join(HERE, '.placement')
SITE_ID = {'B36-26': 'aletsch', 'B56-07': 'gorner', 'B40-07': 'fiescher', 'A54g-11': 'unteraar', 'B83-03': 'corbassiere', 'B57-05': 'zmutt', 'B43-03': 'rhone',
           'B56-03': 'sgi-B56-03', 'B53-04': 'sgi-B53-04', 'A54e-24': 'trift'}      # the same as audit_glaciers.py SITE_ID
REF = 'B36-26'      # Aletsch is the finished one: the nine others are done like it


def load_js(path, prefix):
    s = open(os.path.join(ROOT, path)).read()
    return json.loads(s[s.index(prefix) + len(prefix):s.rindex('}') + 1])


def box_bounds(lat, lon, half_km):
    import math
    dl = half_km * 1000 / 111320.0; dn = half_km * 1000 / (111320.0 * math.cos(math.radians(lat)))
    return [[round(lat - dl, 6), round(lon - dn, 6)], [round(lat + dl, 6), round(lon + dn, 6)]]


def strip_corners(S, tip):
    import math
    k = 111320.0 * math.cos(math.radians(tip[0])); ue, un = math.sin(math.radians(S['azimuth'])), math.cos(math.radians(S['azimuth']))
    return [(tip[0] + (a * un - b * ue) / 111320.0, tip[1] + (a * ue + b * un) / k) for a, b in ((-S['back'], -S['half']), (-S['back'], S['half']), (S['up'], S['half']), (S['up'], -S['half']))]


def fit_strip(S, tip, bounds, margin_m=300):
    """the rule's strip, shortened (up first, then back, then half) until its four corners lie inside the existing picture box with a margin; returns (strip, what was cut)"""
    import math
    (s0, w0), (n0, e0) = bounds; ml = margin_m / 111320.0; mn = margin_m / (111320.0 * math.cos(math.radians(tip[0])))
    S = dict(S); cut = []
    def ok(): return all(s0 + ml <= la <= n0 - ml and w0 + mn <= lo <= e0 - mn for la, lo in strip_corners(S, tip))
    for key, lo_lim, step in (('up', 3500, 250), ('back', 500, 250), ('half', 1500, 250)):
        while not ok() and S[key] > lo_lim: S[key] -= step; cut.append(key)
    S['cell'] = max(14, int(math.ceil(math.sqrt(2 * S['half'] * (S['up'] + S['back']) / 150000.0))))
    return S, sorted(set(cut)) if ok() else sorted(set(cut)) + ['STILL OUTSIDE']


def propose(ids):
    data = load_js('data/glaciers.js', 'window.GLACIER_DATA = ')
    boxes = load_js('data/boxes.js', 'window.GLACIER_BOXES = ')['glaciers']
    dem = L.Dem(); out = {}
    for g in data['glaciers']:
        if g['id'] not in ids: continue
        rings = L.geom_rings(g['outline'])
        tip = g['terminus']['tip']      # the tip of the record; derive_view only decides the rest
        v = L.derive_view(rings, dem, tip=tip, label=g['id'])
        cur = boxes.get(g['id'], {})
        bounds = cur['box']['bounds']      # the picture box is NEVER proposed: the Sentinel-2 pictures of the site are cached for it (no new CDSE downloads)
        strip, fitted = fit_strip(v['strip3d'], tip, bounds)
        out[g['id']] = dict(name=g['name'], site=SITE_ID[g['id']], areaKm2=g['area_km2'], rank=g['rank'], tip=tip,
                            proposal=dict(tip=v['tip'], strip3d=strip, bounds=bounds, fitted=fitted, ruleStrip=v['strip3d']),
                            current=dict(tip=cur.get('tip'), strip3d=cur.get('strip3d'), bounds=cur.get('box', {}).get('bounds')))
    return out


def override_boxes(gid, p):
    boxes = load_js('data/boxes.js', 'window.GLACIER_BOXES = ')
    e = boxes['glaciers'][gid]; e['tip'] = p['proposal']['tip']; e['box']['bounds'] = p['proposal']['bounds']
    e['strip3d'] = dict(p['proposal']['strip3d']); e['strip3d'].pop('cell', None); e.pop('derived', None)
    return 'window.GLACIER_BOXES = ' + json.dumps(boxes) + ';'


def render(props, base='http://localhost:8000'):
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
        for gid, p in props.items():
            for which in ('proposal', 'current'):
                if which == 'current' and not p['current'].get('strip3d'): continue
                for mode, hashv in (('3d', f"g={p['site']}&m=single&one=2025&v=3d"),):
                    pg = b.new_page(viewport={'width': 1400, 'height': 800})      # a fresh page per view: the site reloads itself when only the hash changes
                    if which == 'proposal':
                        js = override_boxes(gid, p)
                        pg.route(re.compile(r'.*/data/boxes\.js(\?.*)?$'), lambda r, q, js=js: r.fulfill(status=200, content_type='application/javascript', body=js))
                    try:
                        pg.goto(f'{base}/index.html#{hashv}', wait_until='domcontentloaded')
                        pg.wait_for_timeout(25000)
                        pg.screenshot(path=os.path.join(OUT, f'{gid}-{which}-{mode}.png'), clip={'x': 300, 'y': 0, 'width': 1100, 'height': 780})
                    except Exception as e:
                        print('  render failed', gid, which, mode, e)
                    pg.close()
            print('rendered', gid)
        b.close()


def schematic(gid, p, which, rings, dem):
    """Plan view: Mapterhorn hillshade, newest outline (red), picture box (blue), 3D strip (white, dashed) and tip (yellow), in a frame a bit wider than the picture box."""
    import math
    from PIL import Image, ImageDraw
    q = p[which]; tip = q['tip']; S = q['strip3d']; (s0, w0), (n0, e0) = q['bounds']
    pad = 0.08; ds, dn = (n0 - s0) * pad, (e0 - w0) * pad; s0, n0, w0, e0 = s0 - ds, n0 + ds, w0 - dn, e0 + dn
    N = 160; Z = [[dem.h(n0 + (s0 - n0) * i / (N - 1), w0 + (e0 - w0) * j / (N - 1)) for j in range(N)] for i in range(N)]
    k = 111320.0 * math.cos(math.radians(tip[0])); dy = (n0 - s0) * 111320.0 / N; dx = (e0 - w0) * k / N
    W = 720; H = int(W * (n0 - s0) * 111320.0 / ((e0 - w0) * k)); im = Image.new('L', (N, N))
    for i in range(1, N - 1):
        for j in range(1, N - 1):
            gx = (Z[i][j + 1] - Z[i][j - 1]) / (2 * dx); gy = (Z[i - 1][j] - Z[i + 1][j]) / (2 * dy)
            im.putpixel((j, i), int(max(0, min(255, 150 + 220 * (-0.7 * gx + 0.7 * gy) / math.sqrt(1 + gx * gx + gy * gy)))))
    im = im.resize((W, H), Image.BICUBIC).convert('RGB'); d = ImageDraw.Draw(im)
    def xy(lat, lon): return (lon - w0) / (e0 - w0) * W, (n0 - lat) / (n0 - s0) * H
    for r in rings: d.line([xy(c[0], c[1]) for c in r] + [xy(r[0][0], r[0][1])], fill=(200, 50, 42), width=2)
    (bs, bw), (bn, be) = q['bounds']; d.line([xy(bs, bw), xy(bs, be), xy(bn, be), xy(bn, bw), xy(bs, bw)], fill=(31, 111, 178), width=4)
    ue, un = math.sin(math.radians(S['azimuth'])), math.cos(math.radians(S['azimuth']))
    def pt(a, b): return xy(tip[0] + (a * un - b * ue) / 111320.0, tip[1] + (a * ue + b * un) / k)      # a along (up the glacier), b to the right
    c = [pt(-S['back'], -S['half']), pt(-S['back'], S['half']), pt(S['up'], S['half']), pt(S['up'], -S['half']), pt(-S['back'], -S['half'])]
    for m in range(len(c) - 1): d.line([c[m], c[m + 1]], fill=(255, 255, 255), width=3)
    x, y = xy(*tip); d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 210, 63), outline=(0, 0, 0))
    kmpx = W / ((e0 - w0) * k / 1000.0); d.line([(10, H - 14), (10 + kmpx * 2, H - 14)], fill=(255, 255, 255), width=4); d.text((14, H - 30), '2 km', fill=(255, 255, 255))
    d.text((8, 6), f'{which}: box (blue), strip (white), outline (red), tip (yellow)', fill=(255, 255, 255))
    im.save(os.path.join(OUT, f'{gid}-{which}-plan.png'))


def schematics(props):
    data = load_js('data/glaciers.js', 'window.GLACIER_DATA = '); dem = L.Dem()
    for g in data['glaciers']:
        if g['id'] not in props: continue
        rings = L.geom_rings(g['outline'])
        for which in ('proposal', 'current'):
            if props[g['id']][which].get('strip3d') and props[g['id']][which].get('bounds'): schematic(g['id'], props[g['id']], which, rings, dem)
        print('plan', g['id'])


def sheet(props):
    def fmt(s): return 'n/a' if not s else ', '.join(f'{k} {round(v, 1) if isinstance(v, float) else v}' for k, v in s.items() if k != 'cam')
    cards = []
    for gid, p in props.items():
        img = lambda w, m: f'<img src="{gid}-{w}-{m}.png" loading="lazy" alt="{gid} {w} {m}">' if os.path.exists(os.path.join(OUT, f'{gid}-{w}-{m}.png')) else '<div class="none">not rendered</div>'
        cards.append(f'''<section><h2>{p["name"]} <small>{gid} · site id <code>{p["site"]}</code> · rank {p["rank"]} · {p["areaKm2"]} km²</small></h2>
<div class="row"><div><h3>Proposed 3D</h3>{img("proposal", "3d")}</div><div><h3>Proposed placement, plan view</h3>{img("proposal", "plan")}</div></div>
<p class="n"><b>Proposed strip</b> (rule: <code>derive_view</code>): {fmt(p["proposal"]["strip3d"])}; tip {p["proposal"]["tip"]}; the picture box is the site's own and stays as it is ({p["boxKm"][0]} × {p["boxKm"][1]} km, N-S × E-W); strip cut to fit the box: {", ".join(p["proposal"]["fitted"]) or "no"}; the rule alone gave {fmt(p["proposal"]["ruleStrip"])}</p>
<details><summary>What the site has now (the old default, not confirmed)</summary><p class="n">{fmt(p["current"].get("strip3d"))}</p>
<div class="row"><div>{img("current", "3d")}</div><div>{img("current", "plan")}</div></div></details>
<p class="n">Decision: <b>OK</b> in the walkthrough, or one line: "{gid}: box S W N E / strip azimuth, half, back, up / tip lat, lon". Box editor: <code>scripts/tools/box-editor.html</code></p></section>''')
    open(os.path.join(OUT, 'index.html'), 'w').write(f'''<!doctype html><meta charset="utf-8"><title>Placement proposals, 9 Swiss glaciers</title>
<style>body{{font:14px/1.4 "Schibsted Grotesk",system-ui,sans-serif;margin:16px;color:#1b2430;max-width:1500px}}h1{{color:#C8322A;font-size:20px}}section{{border:1px solid #dfe3e9;border-radius:6px;padding:10px 14px;margin:14px 0}}
h2{{font-size:16px;margin:0 0 6px}}h2 small{{font-weight:400;color:#667}}h3{{font-size:12px;margin:4px 0;color:#667;text-transform:uppercase}}.row{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}
img{{width:100%;border:1px solid #dfe3e9}}.n{{font-size:12px;color:#445}}.none{{padding:40px;background:#f6f7f9;color:#889;text-align:center}}</style>
<h1>Placement proposals: nine Swiss glaciers</h1><p class="n">Proposals from the rule, rendered in the real site with Mapterhorn terrain. Nothing here is data or confirmed. Aletsch (done) is the model. Check: the tongue fills the lower half of the 3D picture, nothing cut off, ridges do not hide the tip, the whole tongue and its lower end are inside the picture box.</p>{"".join(cards)}''')
    print('sheet:', os.path.join(OUT, 'index.html'))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--ids', nargs='*'); ap.add_argument('--no-render', action='store_true'); a = ap.parse_args()
    ids = a.ids or [k for k in SITE_ID if k != REF]
    props = propose(ids)
    for v in props.values():
        import math; (s_, w_), (n_, e_) = v['proposal']['bounds']; v['boxKm'] = [round((n_ - s_) * 111.32, 1), round((e_ - w_) * 111.32 * math.cos(math.radians((s_ + n_) / 2)), 1)]
    os.makedirs(OUT, exist_ok=True)
    json.dump(props, open(os.path.join(OUT, 'proposals.json'), 'w'), indent=1)
    schematics(props)
    if not a.no_render: render(props)
    sheet(props)
