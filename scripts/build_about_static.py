#!/usr/bin/env python3
"""build_about_static.py - writes data/about-static.html: the About block of the explorer (js/07-render.js,
aboutChaptersCh) exactly as the page renders it, so size.html shows the same text. Run it after any change to
the About chapters:  python3 scripts/build_about_static.py   (needs playwright + chromium, like the tests).

The text is rendered as the PUBLIC site renders it: the build takes the Landsat entries out of every region unless PUBLISH_LANDSAT=1 (scripts/build_site.py), and the About
then leaves the Landsat texts out. Run with PUBLISH_LANDSAT=1 to render them (when the Landsat switch is published)."""
import os, re, subprocess, sys, time, pathlib, urllib.request
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8123
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try: urllib.request.urlopen(f'http://localhost:{PORT}/index.html'); break
        except Exception: time.sleep(.1)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 900})
        if os.environ.get('PUBLISH_LANDSAT', '').strip() != '1':      # the same cut as build_site.py
            def no_landsat(route):
                body = route.fetch().text()
                route.fulfill(body=re.sub(r"^[ \t]*landsat: \{ from: 1984, first: 1985 \},.*\n", "", body, flags=re.M), content_type='application/javascript')
            pg.route('**/js/regions.js', no_landsat)
        pg.goto(f'http://localhost:{PORT}/index.html#g=aletsch'); pg.wait_for_selector('#story details.about', state='attached', timeout=60000)
        html = pg.evaluate("""() => { const d = document.querySelector('#story details.about').cloneNode(true); d.removeAttribute('open');
          d.querySelectorAll('[open]').forEach(e => e.removeAttribute('open')); return d.outerHTML; }""")
        b.close()
finally:
    srv.terminate()
(ROOT / 'data' / 'about-static.html').write_text(html + '\n', encoding='utf-8')
print('data/about-static.html', len(html), 'bytes')
