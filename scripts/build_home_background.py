#!/usr/bin/env python3
"""
build_home_background.py - the background of the front page's map (home.html): a Sentinel-2 summer mosaic made
from Copernicus (CDSE Process API), cut into web-map tiles in data/home-bg/{z}/{x}/{y}.webp (not in the repository;
copied to the R2 bucket with scripts/upload_landsat.sh-style rclone, see below). Where a tile is missing the page
shows the EOX background underneath.

    python3 scripts/build_home_background.py --dry-run            counts the tiles (= Copernicus requests)
    python3 scripts/build_home_background.py --zmax 8             builds; stops and resumes (existing tiles are skipped)
    rclone sync data/home-bg r2:<bucket>/data/home-bg --include "*.webp" --transfers 16 --progress

Summer of YEAR = 1 July to 15 September; per pixel the least cloudy valid observation (SCL cloud, shadow, cirrus, water
and no-data fall through to the next one). Credentials as for serve.py (CDSE_CLIENT_ID / CDSE_CLIENT_SECRET or scripts/.cdse-credentials).
"""
import argparse, io, json, math, os, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve

OUT = os.path.join(os.path.dirname(serve.HERE), "data", "home-bg")
# lon/lat boxes of the regions on the front page (west, south, east, north), with the deepest zoom of each
AREAS = {"alps": ((5.6, 45.6, 11.0, 47.9), 10), "iceland": ((-25.0, 63.0, -12.5, 66.7), 9),
         "norway": ((4.5, 58.0, 31.5, 71.3), 8), "svalbard": ((9.0, 76.3, 28.0, 80.9), 8)}
EVAL = """//VERSION=3
function setup(){return{input:["B02","B03","B04","SCL","dataMask"],output:{bands:4}};}
function evaluatePixel(s){var bad=[0,1,3,6,8,9,10].indexOf(s.SCL)>=0;var m=s.dataMask&&!bad?1:0;function c(v){return Math.min(1,Math.pow(Math.max(0,3.4*v),0.85));}
 return[c(s.B04),c(s.B03),c(s.B02),m];}"""

def tile_box(z, x, y):
    w = 20037508.342789244; n = 2 ** z; s = 2 * w / n
    return [-w + x * s, w - (y + 1) * s, -w + (x + 1) * s, w - y * s]

def tiles(z):
    out = set(); n = 2 ** z
    for (w, s, e, nn), zmax in AREAS.values():
        if z > zmax: continue
        tx = lambda lon: int((lon + 180) / 360 * n)
        ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
        for x in range(tx(w), tx(e) + 1):
            for y in range(ty(nn), ty(s) + 1): out.add((x, y))
    return sorted(out)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--year", type=int, default=2026); ap.add_argument("--zmin", type=int, default=3)
    ap.add_argument("--zmax", type=int, default=10); ap.add_argument("--dry-run", action="store_true"); a = ap.parse_args()
    plan = [(z, x, y) for z in range(a.zmin, a.zmax + 1) for x, y in tiles(z)]
    todo = [t for t in plan if not os.path.exists(os.path.join(OUT, str(t[0]), str(t[1]), f"{t[2]}.webp"))]
    print(f"{len(plan)} tiles, {len(todo)} still to make")
    if a.dry_run: return
    cid, secret = serve.load_credentials(); serve.TOKEN = serve.Token(cid, secret)
    from PIL import Image
    for i, (z, x, y) in enumerate(todo):
        body = {"input": {"bounds": {"bbox": tile_box(z, x, y), "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/3857"}},
                          "data": [{"type": "sentinel-2-l2a", "dataFilter": {"timeRange": {"from": f"{a.year}-07-01T00:00:00Z", "to": f"{a.year}-09-15T23:59:59Z"},
                                    "mosaickingOrder": "leastCC", "maxCloudCoverage": 60}, "processing": {"upsampling": "BILINEAR", "downsampling": "BILINEAR"}}]},
                "output": {"width": 256, "height": 256, "responses": [{"identifier": "default", "format": {"type": "image/png"}}]}, "evalscript": EVAL}
        for attempt in range(4):
            req = urllib.request.Request(serve.SH + "/process/v1", json.dumps(body).encode(), {"Content-Type": "application/json", "Authorization": "Bearer " + serve.TOKEN.get(), "Accept": "image/png"})
            try:
                png = urllib.request.urlopen(req, timeout=120, context=serve.CTX).read(); break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 3: time.sleep(5 * (attempt + 1)); continue
                print(f"  {z}/{x}/{y}: HTTP {e.code} {e.read()[:200]!r}"); png = None; break
        if png is None: continue
        im = Image.open(io.BytesIO(png)).convert("RGBA")
        if not any(im.getchannel("A").getdata()): continue      # no valid pixel: no tile, EOX shows
        p = os.path.join(OUT, str(z), str(x)); os.makedirs(p, exist_ok=True); im.save(os.path.join(p, f"{y}.webp"), quality=80)
        if i % 50 == 0: print(f"  {i}/{len(todo)}")
main()
