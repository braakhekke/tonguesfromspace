#!/usr/bin/env python3
"""Heights of Iceland for the 3D view: a window of ÍslandsDEM v1.0 around one outlet of Vatnajökull.

Source: ÍslandsDEM v1.0, Náttúrufræðistofnun Íslands (Icelandic Institute of Natural History) and Landmælingar Íslands, CC BY 4.0
(catalogue record "Hæðarlíkan útgáfa 1.0 -- DEM 1.0", https://gatt.lmi.is/geonetwork, files at https://ftp.natt.is/gisdata/raster/). A composite of the ArcticDEM
strips (median of all of them, 2 m source pixels, mostly 2012 and later, the oldest 2008; Polar Geospatial Center) and lidar where there is some. So it is NOT one date:
on a glacier it is a mix of the ice surface of those years. The finest raster the Institute publishes is 10 m (ISN2016, float32 metres above sea level, 3 GB);
2 m exists only as Cesium quantized-mesh tiles (stm/marco/dem/cesium_terrain_2m), no 1 m model was found in the catalogue.

The 10 m GeoTIFF is tiled (512 x 512), ZSTD compressed with horizontal differencing (predictor 2) and the server accepts range requests, so only the tiles that
cover the window are downloaded (about 40 tiles, some MB). They are decoded here (Python 3.14: `compression.zstd`; otherwise standard library only) and written to
scripts/.dem-cache/islandsdem-<outlet>-10m.f32 (little-endian float32, row by row from the north-west corner) with a .json beside it (grid, projection, size).
The grid is ISN2016 / Lambert 2016 (EPSG:8088: Lambert conformal conic, parallels 64.25 and 65.75, origin 65 N 19 W, false easting 2,700,000, false northing 300,000, GRS80).

Usage: python3 scripts/fetch_dem_iceland.py [--outlet breidamerkurjokull] [--half 15]       (half: half side of the window in km around the outlet's picture centre)
"""
import argparse, json, math, os, struct, sys, urllib.request
try:
    from compression import zstd
except ImportError:
    sys.exit("This script needs Python 3.14 (compression.zstd) to read the ZSTD tiles of the GeoTIFF.")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://ftp.natt.is/gisdata/raster/IslandsDEMv1.0_10x10m_isn2016_zmasl.tif"
CACHE = os.path.join(ROOT, "scripts", ".dem-cache")
UA = {"User-Agent": "tonguesfromspace/1.0 (https://tonguesfromspace.org)"}

# ISN2016 / Lambert 2016, GRS80
A, F = 6378137.0, 1 / 298.257222101
E = math.sqrt(2 * F - F * F)
LAT0, LON0, LAT1, LAT2, FE, FN = 65.0, -19.0, 64.25, 65.75, 2700000.0, 300000.0


def lcc(lon, lat):
    def m(p): return math.cos(p) / math.sqrt(1 - (E * math.sin(p)) ** 2)
    def t(p): return math.tan(math.pi / 4 - p / 2) / ((1 - E * math.sin(p)) / (1 + E * math.sin(p))) ** (E / 2)
    r = math.radians
    n = (math.log(m(r(LAT1))) - math.log(m(r(LAT2)))) / (math.log(t(r(LAT1))) - math.log(t(r(LAT2))))
    g = m(r(LAT1)) / (n * t(r(LAT1)) ** n)
    rho0, rho = A * g * t(r(LAT0)) ** n, A * g * t(r(lat)) ** n
    th = n * r(lon - LON0)
    return FE + rho * math.sin(th), FN + rho0 - rho * math.cos(th)


def rng(a, b):
    req = urllib.request.Request(URL, headers={**UA, "Range": f"bytes={a}-{b}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def read_header():
    h = rng(0, 262143)
    assert h[:4] == b"II*\x00", "not a classic little-endian TIFF"
    off = struct.unpack("<I", h[4:8])[0]
    n = struct.unpack("<H", h[off:off + 2])[0]
    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8}
    fm = {3: "H", 4: "I", 12: "d"}
    tags = {}
    for i in range(n):
        e = h[off + 2 + i * 12: off + 14 + i * 12]
        tag, typ, cnt = struct.unpack("<HHI", e[:8])
        tot = sizes[typ] * cnt
        raw = e[8:8 + tot] if tot <= 4 else h[struct.unpack("<I", e[8:12])[0]:][:tot]
        tags[tag] = struct.unpack("<" + fm[typ] * cnt, raw) if typ in fm else raw
    return tags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outlet", default="breidamerkurjokull")
    ap.add_argument("--half", type=float, default=15.0)
    a = ap.parse_args()
    text = open(os.path.join(ROOT, "data", "vatnajokull.js"), encoding="utf-8").read()
    data = json.loads(text[text.index("{"):text.rindex("}") + 1])
    o = next(x for x in data["outlets"] if x["id"] == a.outlet)
    tg = read_header()
    W, H, tw, th = tg[256][0], tg[257][0], tg[322][0], tg[323][0]
    assert tg[259][0] == 50000 and tg[258][0] == 32 and tg[339][0] == 3 and tg[317][0] == 2, "unexpected layout of the GeoTIFF"
    px, (ox, oy) = tg[33550][0], tg[33922][3:5]
    offs, cnts = tg[324], tg[325]
    tiles_x = (W + tw - 1) // tw
    # window: a square around the picture centre, in grid coordinates (ISN2016, metres), snapped to the 10 m grid
    cx, cy = lcc(o["lon"], o["lat"])
    x0, x1, y1, y0 = cx - a.half * 1000, cx + a.half * 1000, cy + a.half * 1000, cy - a.half * 1000
    c0, c1 = max(0, int((x0 - ox) // px)), min(W - 1, int((x1 - ox) // px))
    r0, r1 = max(0, int((oy - y1) // px)), min(H - 1, int((oy - y0) // px))
    w, hh = c1 - c0 + 1, r1 - r0 + 1
    print(f"window {w} x {hh} cells of {px:.0f} m around {o['name']} (grid x {ox + c0 * px:.0f}, y {oy - r0 * px:.0f})")
    out = [[float("nan")] * w for _ in range(hh)]
    os.makedirs(CACHE, exist_ok=True)
    got = 0
    for ty in range(r0 // th, r1 // th + 1):
        for tx in range(c0 // tw, c1 // tw + 1):
            k = ty * tiles_x + tx
            raw = rng(offs[k], offs[k] + cnts[k] - 1)
            body = zstd.decompress(raw)
            tile_w = min(tw, W - tx * tw)
            for ry in range(th):
                row = struct.unpack(f"<{tile_w}I", body[ry * tw * 4: ry * tw * 4 + tile_w * 4]) if len(body) >= (ry + 1) * tw * 4 else None
                if row is None: break
                acc, vals = 0, []
                for v in row:
                    acc = (acc + v) & 0xFFFFFFFF      # predictor 2: running sum of the 32-bit words, then read as float32
                    vals.append(acc)
                fl = struct.unpack(f"<{tile_w}f", struct.pack(f"<{tile_w}I", *vals))
                y = ty * th + ry
                if not (r0 <= y <= r1): continue
                for rx in range(tile_w):
                    x = tx * tw + rx
                    if c0 <= x <= c1: out[y - r0][x - c0] = fl[rx]
            got += len(raw)
    flat = [v for row in out for v in row if v == v and v > -1e30]
    for row in out:
        for i, v in enumerate(row):
            if not (v == v and v > -1e30): row[i] = float("nan")
    print(f"downloaded {got / 1e6:.1f} MB; {len(flat)} of {w * hh} cells have a height; min {min(flat):.1f} m, max {max(flat):.1f} m")
    base = os.path.join(CACHE, f"islandsdem-{a.outlet}-10m")
    with open(base + ".f32", "wb") as fh:
        for row in out: fh.write(struct.pack(f"<{w}f", *row))
    json.dump({"source": URL, "crs": "EPSG:8088 ISN2016 / Lambert 2016", "cell_m": px, "cols": w, "rows": hh, "x_west": ox + c0 * px, "y_north": oy - r0 * px,
               "nodata": "NaN", "licence": "CC BY 4.0, Náttúrufræðistofnun Íslands / Landmælingar Íslands"}, open(base + ".json", "w"), indent=1)
    print("wrote", base + ".f32")


if __name__ == "__main__":
    main()
