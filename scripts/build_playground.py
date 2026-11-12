#!/usr/bin/env python3
"""Adds the unlisted Gabriele playground (science-viewer/) to a built site: python3 scripts/build_playground.py _site
Run after scripts/build_site.py and `npm ci --prefix science-viewer`. Writes
  _site/playground-gabriele/        the page (index.html), app.js, explorer.js, style.css, dist/ (raster worker, gdal3.js)
  _site/playground-gabriele-explorer/index.html   the Swiss explorer page with its bundle swapped for explorer.js (explorer + bridge in one bundle)
Unlisted: no link, no sitemap line, noindex on both pages, Disallow in robots.txt. Field data never leave the browser."""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "_site")
NOINDEX = '<meta name="robots" content="noindex,nofollow">'

def sub_once(html, old, new, what):
    if html.count(old) != 1:
        sys.exit(f"build_playground: {what}: {old[:70]!r} found {html.count(old)} times, expected once")
    return html.replace(old, new)

sv = os.path.join(ROOT, "science-viewer")
if not os.path.isdir(os.path.join(sv, "node_modules")):
    sys.exit("science-viewer/node_modules is missing: run `npm ci --prefix science-viewer`")
subprocess.run(["node", "build-live.mjs", os.path.join(out, "playground-gabriele")], cwd=sv, check=True)

# the explorer frame: the built Swiss page (root-absolute names), bundle swapped
src = open(os.path.join(out, "switzerland", "index.html"), encoding="utf-8").read()
tokens = re.search(r'/css/tokens\.[0-9a-f]+\.css', src)
if not tokens:
    sys.exit("build_playground: hashed css/tokens not found in the Swiss page")

# the page around the explorer frame
page = open(os.path.join(sv, "index.html"), encoding="utf-8").read()
page = sub_once(page, 'href="../css/tokens.css"', f'href="{tokens.group(0)}"', "tokens")
page = sub_once(page, '<base href="/science-viewer/">', '<base href="/playground-gabriele/">' + NOINDEX, "base")
page = sub_once(page, 'src="../index.html#', 'src="/playground-gabriele-explorer/#', "iframe")
open(os.path.join(out, "playground-gabriele", "index.html"), "w", encoding="utf-8").write(page)

src, n = re.subn(r'<script type="module" src="/js/app\.[0-9a-f]+\.js"></script>', '<script type="module" src="/playground-gabriele/explorer.js"></script>', src)
if n != 1:
    sys.exit(f"build_playground: the explorer bundle tag was found {n} times, expected once")
src = re.sub(r'<link rel="canonical"[^>]*>', '', src)
src = sub_once(src, "<head>", "<head>" + '<base href="/">' + NOINDEX + '<meta name="science-bundled" content="1">', "head")
os.makedirs(os.path.join(out, "playground-gabriele-explorer"), exist_ok=True)
open(os.path.join(out, "playground-gabriele-explorer", "index.html"), "w", encoding="utf-8").write(src)

# robots.txt: ask crawlers to stay out (the pages also say noindex)
rp = os.path.join(out, "robots.txt")
txt = open(rp).read() if os.path.exists(rp) else "User-agent: *\n"
if "/playground-gabriele" not in txt:
    txt = txt.replace("Disallow: /ask/\n", "Disallow: /ask/\nDisallow: /playground-gabriele\n")
    open(rp, "w").write(txt)
print("playground written to", os.path.join(out, "playground-gabriele"))
