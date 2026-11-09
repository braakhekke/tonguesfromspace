#!/usr/bin/env python3
"""The social pictures of the glacier pages: images/og/<slug>.jpg (1200 x 630) and images/og/index.json.

    python3 scripts/build_og_images.py [--base https://tonguesfromspace.org] [--only aletsch,gorner]

For each glacier of Switzerland it opens the real explorer (embed view, map, newest year), hides the controls, adds the name, the date of the scene and the page's own credit line
(Copernicus, the EOX background, OpenStreetMap labels: the picture shows all three; drawn by the page itself, in its own typeface) and saves the picture. So the picture is the real Sentinel-2 scene, never a rendering, and shows the glacier of the link.
build_site.py uses images/og/<slug>.jpg for the page /switzerland/<slug>/ (og:image) and images/og/index.json for the text of the picture.

Needs: Playwright with Google Chrome (python3 -m playwright install chrome), Pillow, and a relay with a cache: the public site by default (the scenes of past summers are cached,
so this normally spends no Copernicus units). Run it again when a new summer's scene has been chosen, then commit images/og/.
"""
import argparse, io, json, os, re, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "images", "og")

HIDE = "#tagT, .mapbar, #gestureHint, #credits, #embedOpen, .tilt-hint, .leaflet-control-container { display: none !important; }"
OVERLAY = """(info) => {
  const d = document.createElement('div');
  d.id = 'ogOverlay';
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:"Schibsted Grotesk",system-ui,sans-serif;color:#fff;'
    + 'background:linear-gradient(to top,rgba(7,11,20,.88) 0,rgba(7,11,20,.55) 22%,rgba(7,11,20,0) 46%),linear-gradient(to bottom,rgba(7,11,20,.55) 0,rgba(7,11,20,0) 18%)';
  d.innerHTML = '<div style="position:absolute;left:44px;top:34px;font-size:24px;font-weight:600;letter-spacing:.01em;text-shadow:0 1px 8px rgba(0,0,0,.5)">Tongues from Space</div>'
    + '<div style="position:absolute;left:44px;bottom:78px;font-size:68px;line-height:1;font-weight:700;letter-spacing:-.02em;text-shadow:0 2px 14px rgba(0,0,0,.55)"></div>'
    + '<div style="position:absolute;left:46px;bottom:42px;font-size:24px;font-weight:500;opacity:.92"></div>'
    + '<div style="position:absolute;right:44px;bottom:18px;width:540px;font-size:12.5px;line-height:1.35;font-weight:500;opacity:.85;text-align:right"></div>';
  const [, name, sub, credit] = d.children;
  name.textContent = info.title; sub.textContent = info.sub; credit.textContent = info.credit;
  document.body.appendChild(d);
}"""


def slugs():
    """the id -> slug map of Switzerland (js/regions.js, glacierSlugs) """
    t = open(os.path.join(ROOT, "js", "regions.js"), encoding="utf-8").read()
    m = re.search(r"glacierSlugs:\s*\{([^}]*)\}", t)
    return dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", m.group(1))) if m else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://tonguesfromspace.org")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    sl = slugs()
    only = {x for x in a.only.split(",") if x}
    index_path = os.path.join(OUT, "index.json")
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome", headless=True)
        ctx = br.new_context(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        ctx.add_init_script("window.TFS_EXPOSE = true; try { localStorage.setItem('tfs-teaser-seen', '1'); } catch (e) {}")
        probe = ctx.new_page()
        probe.goto(f"{a.base}/switzerland/#g=aletsch&m=single", wait_until="load")
        probe.wait_for_function("typeof GLACIERS !== 'undefined' && GLACIERS.length", timeout=60000)
        ids = probe.evaluate("GLACIERS.map(g => g.id)")
        probe.close()
        for gid in ids:
            slug = sl.get(gid, gid)
            if only and slug not in only and gid not in only:
                continue
            pg = ctx.new_page()
            pg.goto(f"{a.base}/switzerland/#g={gid}&m=single&embed=1&v=map", wait_until="load")
            pg.wait_for_function("typeof state !== 'undefined' && glacierPicked && Object.keys(state.available).filter(k => state.available[k]).length >= 4", timeout=90000)
            pg.wait_for_function("/scenes for \\d+\\/\\d+ years/.test(document.getElementById('status').innerText)", timeout=90000)
            time.sleep(8)      # the picture of the year arrives and fades in
            info = pg.evaluate("""() => { const y = state.one, sc = state.available[y] || {}, g = currentGlacier();
              const d = sc.date ? new Date(sc.date + 'T12:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}) : String(y);
              const full = g.local || g.name; return {year: y, date: sc.date || null, name: g.name, local: full, title: full.replace(/\\s*\\(.*?\\)/g, ''), sub: d + ' \\u00b7 Sentinel-2 satellite picture', credit: ((document.getElementById('credits') || {}).innerText || 'Contains modified Copernicus Sentinel data ' + y).replace(/\\s+/g, ' ').trim()}; }""")
            pg.add_style_tag(content=HIDE)
            pg.evaluate(OVERLAY, info)
            time.sleep(0.8)
            png = pg.screenshot(type="png")
            Image.open(io.BytesIO(png)).convert("RGB").save(os.path.join(OUT, f"{slug}.jpg"), quality=84, optimize=True, progressive=True)
            index[slug] = {"id": gid, "name": info["name"], "local": info["local"], "title": info["title"], "year": info["year"], "date": info["date"]}
            print(f"{slug}: {info['name']}, {info['date']} -> images/og/{slug}.jpg {os.path.getsize(os.path.join(OUT, slug + '.jpg')) // 1024} KB", flush=True)
            pg.close()
        br.close()
    json.dump(index, open(index_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False, sort_keys=True)
    print("images/og/index.json:", len(index), "glaciers")


if __name__ == "__main__":
    main()
