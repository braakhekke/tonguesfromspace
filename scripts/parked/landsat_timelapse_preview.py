#!/usr/bin/env python3
"""A preview of the Landsat years of one glacier as the REAL site shows them in map view (single-year mode, one capture per year, Playwright), put together as an animated GIF and a contact sheet
in scripts/.placement/timelapse-<site id>/ (git-ignored). For the review of a Landsat selection; nothing here is published and no data is written.

  python3 scripts/parked/landsat_timelapse_preview.py gorner [--site-id gorner] [--years 1984 1985 ...]      (needs: python3 scripts/serve.py on :8000, playwright + chromium)
"""
import argparse, json, os, sys
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(HERE)      # HERE = scripts/ (parked one folder down)


def shoot(args):
    from playwright.sync_api import sync_playwright
    site, years, out, base = args
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for y in years:
            pg = b.new_page(viewport={'width': 1400, 'height': 800})
            try:
                pg.goto(f'{base}/index.html#g={site}&m=single&one={y}', wait_until='domcontentloaded')
                pg.wait_for_timeout(14000)
                pg.screenshot(path=os.path.join(out, f'{y}.png'), clip={'x': 300, 'y': 0, 'width': 1100, 'height': 780})
                print('shot', y, flush=True)
            except Exception as e:
                print('failed', y, e, flush=True)
            pg.close()
        b.close()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('outlet'); ap.add_argument('--site-id'); ap.add_argument('--years', nargs='*', type=int); ap.add_argument('--base', default='http://localhost:8000'); a = ap.parse_args()
    site = a.site_id or a.outlet
    years = a.years or sorted(int(y) for y in json.load(open(os.path.join(ROOT, 'data', 'landsat', f'{a.outlet}.json')))['scenes'])
    out = os.path.join(HERE, '.placement', f'timelapse-{site}'); os.makedirs(out, exist_ok=True)
    n = 3; chunks = [years[i::n] for i in range(n)]
    with ThreadPoolExecutor(n) as ex: list(ex.map(shoot, [(site, c, out, a.base) for c in chunks if c]))
    from PIL import Image, ImageDraw
    frames = []
    for y in years:
        f = os.path.join(out, f'{y}.png')
        if not os.path.exists(f): continue
        im = Image.open(f).convert('RGB').resize((825, 585)); d = ImageDraw.Draw(im); d.rectangle([0, 0, 70, 22], fill=(0, 0, 0)); d.text((6, 5), str(y), fill=(255, 255, 255)); frames.append(im)
    if frames:
        frames[0].save(os.path.join(out, 'timelapse.gif'), save_all=True, append_images=frames[1:], duration=700, loop=0, optimize=True)
        cols = 6; W, H = 412, 292; R = (len(frames) + cols - 1) // cols; sheet = Image.new('RGB', (cols * W, R * H), 'white')
        for i, im in enumerate(frames): sheet.paste(im.resize((W, H)), ((i % cols) * W, (i // cols) * H))
        sheet.save(os.path.join(out, 'sheet.png'))
    print('written', out, len(frames), 'frames')


if __name__ == '__main__':
    main()
