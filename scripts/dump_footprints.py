#!/usr/bin/env python3
"""Writes scripts/.footprints-ch.json: the picture box (Web Mercator bbox) of every Swiss glacier exactly as the page computes it (imageFootprint in js/03-imagery.js, which adds margins around the
1850 extent), so that scripts/build_landsat.py lays its Landsat pictures on the same box. Needs Playwright (the page is opened in headless Chromium from the source tree).
Usage: python3 scripts/dump_footprints.py
"""
import functools, http.server, json, os, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT); H.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_context().new_page()
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/index.html#m=single&v=map', wait_until='load'); pg.wait_for_function("typeof GLACIERS !== 'undefined' && typeof imageFootprint === 'function'", timeout=30000)
        d = pg.evaluate("GLACIERS.map(g => { const fp = imageFootprint(g); return {id: g.id, name: g.name, lat: (fp.bounds[0][0] + fp.bounds[1][0]) / 2, lon: (fp.bounds[0][1] + fp.bounds[1][1]) / 2, bbox: fp.bbox, w: fp.w, h: fp.h, tip: g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue}; })")
        b.close()
    out = os.path.join(ROOT, 'scripts', '.footprints-ch.json')
    json.dump({x['id']: x for x in d}, open(out, 'w'), indent=1, ensure_ascii=False); print('wrote', out, [x['id'] for x in d])


if __name__ == '__main__':
    main()
