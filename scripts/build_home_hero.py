#!/usr/bin/env python3
"""Bakes the data of the landing page's own 3D hero (home.html, js/home-hero.js): Grosser Aletsch, 2016 to 2026, no explorer behind it.
It opens the real explorer in its 3D view, lets it load every year, and writes down what the renderer was given, unchanged:
  data/home-hero/meta.json        strip (half width, up, back, distance), grid, start camera, per year the scene date and sensor, the credit line
  data/home-hero/heights.bin      "THH1" + header length (u32 LE) + header JSON + deflate(int16): per year the ice surface on the grid, 0.1 m steps, rows as differences
  data/home-hero/<year>.webp      the picture of that year draped on the strip (the page's own picture, only stored)
    python3 -m http.server 8000      # in the repository folder (the relay lets this origin in); or python3 scripts/serve.py
    python3 scripts/build_home_hero.py
Needs: pip install playwright numpy && python3 -m playwright install chromium; the live relay for the pictures (cached ones cost no Copernicus requests).
Raise nothing else: the pictures come from the explorer's cache, so CDSE.version is not touched."""
import base64, json, os, re, struct, sys, zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
BASE = "http://localhost:8000"
OUT = os.path.join(ROOT, "data", "home-hero")
ARGS = ["--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-color-profile=srgb"]
YEARS = list(range(2016, 2027))

JS = """async (years) => {
  const c = v3dCtx; if (!c) throw new Error('no 3D view');
  const out = {nA: c.grid.nA, nB: c.grid.nB, S: {half: c.S.half, up: c.S.up, back: c.S.back, dist: c.S.dist, cam: c.S.cam || null}, cam: v3d.getCam(), years: {}, heights: {}};
  for (const y of years) {
    const cv = await c.tex(y), h = c.surface(y);
    const a = state.available[y];
    out.years[y] = {webp: cv.toDataURL('image/webp', 0.92), w: cv.width, h: cv.height, date: a ? a.date : null, sensor: a ? sensorName(a) : null};
    { const u = new Uint8Array(h.buffer, h.byteOffset, h.byteLength); let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); out.heights[y] = btoa(t); }
  }
  out.credit = document.getElementById('credits').innerText;
  return out;
}"""


def main():
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=ARGS)
        p = br.new_page(viewport={"width": 1280, "height": 720})
        p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
        p.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1')}catch(e){}")
        p.goto(f"{BASE}/index.html?expose#g=aletsch&m=timelapse&from=2016&to=2026&v=3d", wait_until="load")
        p.wait_for_function("document.querySelector('#v3dCanvas') && document.querySelector('#v3dCanvas').offsetWidth > 0 && document.querySelector('.tl-play')", timeout=120000)
        p.wait_for_function("typeof v3dCtx !== 'undefined' && !!(v3dCtx && v3dCtx.tex)", timeout=120000)
        d = p.evaluate(JS, YEARS)
        br.close()
    arrs = {int(y): np.frombuffer(base64.b64decode(b), dtype="<f4") for y, b in d["heights"].items()}
    nA, nB = d["nA"], d["nB"]; W = nB + 1; n = (nA + 1) * W
    assert all(a.size == n for a in arrs.values()), "grid size differs"
    assert nA % 2 == 0 and nB % 2 == 0
    arrs = {y: a.reshape(nA + 1, W)[::2, ::2].ravel() for y, a in arrs.items()}      # every second point (the 28 m grid the explorer uses on small devices): the hero is small on the page
    nA, nB = nA // 2, nB // 2; W = nB + 1
    h0 = float(min(a.min() for a in arrs.values()))
    cols = []
    for y in YEARS:
        q = np.rint((arrs[y] - h0) / 0.1).astype(np.int64).reshape(nA + 1, W)
        assert q.max() < 32768, "heights do not fit 16 bits"
        diff = np.diff(q, axis=1, prepend=0).astype("<i2")      # rows as differences, as in the terrain files; the browser adds them up again
        cols.append(diff.ravel())
    head = json.dumps({"nA": nA, "nB": nB, "h0": h0, "years": YEARS}).encode()
    blob = zlib.compress(np.concatenate(cols).tobytes(), 9)
    with open(os.path.join(OUT, "heights.bin"), "wb") as f:
        f.write(b"THH1" + struct.pack("<I", len(head)) + head + blob)
    for y in YEARS:
        with open(os.path.join(OUT, f"{y}.webp"), "wb") as f:
            f.write(base64.b64decode(d["years"][str(y)]["webp"].split(",", 1)[1]))
    meta = {"nA": nA, "nB": nB, "S": d["S"], "cam": d["cam"], "credit": re.sub(r"\s+", " ", d["credit"]).strip(),
            "years": {y: {k: d["years"][str(y)][k] for k in ("date", "sensor", "w", "h")} for y in YEARS}}
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
    sz = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print("grid", nA + 1, "x", W, "| files", len(os.listdir(OUT)), "|", sz // 1024, "KB | credit:", meta["credit"])


if __name__ == "__main__":
    main()
