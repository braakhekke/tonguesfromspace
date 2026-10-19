#!/usr/bin/env python3
"""Reading ArcticDEM (Polar Geospatial Center, University of Minnesota) 2 m strips with the standard library only.

ArcticDEM (https://www.pgc.umn.edu/data/arcticdem/, CC BY 4.0) are digital surface models made from WorldView stereo images with SETSM. The strips are single dated
models (about 17 x 18 km), 2 m cells, float32 metres above the WGS84 ellipsoid (not above sea level: in Iceland the geoid is about 65 m lower), in EPSG:3413
(NSIDC polar stereographic north, true scale at 70 N, central meridian 45 W). They sit as Cloud Optimized GeoTIFFs on AWS S3 (public, range requests), and the STAC catalogue
https://stac.pgc.umn.edu/api/v1 (collection arcticdem-strips-s2s041-2m) finds them by place and date.

The files are BigTIFF, tiled 512 x 512, LZW compressed with the floating point predictor (TIFF predictor 3). This module finds strips, reads the tiles that cover a window and
returns the heights of the window as a float32 array. Used by scripts/build_dem_iceland.py. Python 3.8 or newer, no packages.
"""
import array, concurrent.futures, itertools, json, math, os, struct, urllib.request

STAC = "https://stac.pgc.umn.edu/api/v1/search"
COLLECTION = "arcticdem-strips-s2s041-2m"
UA = {"User-Agent": "tonguesfromspace/1.0 (https://tonguesfromspace.org)"}
NODATA = -9999.0

# EPSG:3413: polar stereographic north, latitude of true scale 70, central meridian -45, WGS84
_A, _F = 6378137.0, 1 / 298.257223563
_E = math.sqrt(2 * _F - _F * _F)
_T = lambda p: math.tan(math.pi / 4 - p / 2) / ((1 - _E * math.sin(p)) / (1 + _E * math.sin(p))) ** (_E / 2)
_PC = math.radians(70)
_K = _A * (math.cos(_PC) / math.sqrt(1 - (_E * math.sin(_PC)) ** 2)) / _T(_PC)


def to3413(lon, lat):
    rho = _K * _T(math.radians(lat))
    th = math.radians(lon + 45)
    return rho * math.sin(th), -rho * math.cos(th)


def _get(url, headers=None, data=None, timeout=120, tries=4):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:      # a dropped connection or a busy server: try again
            last = e
    raise last


def find_strips(bbox, date_from, date_to):
    """STAC items (dicts) of the 2 m strips that touch bbox = [west, south, east, north] (WGS84) between two dates (YYYY-MM-DD)."""
    out, body = [], {"collections": [COLLECTION], "bbox": bbox, "datetime": f"{date_from}T00:00:00Z/{date_to}T23:59:59Z", "limit": 200}
    while True:
        j = json.loads(_get(STAC, {"Content-Type": "application/json"}, json.dumps(body).encode()))
        out += j.get("features", [])
        nxt = [l for l in j.get("links", []) if l.get("rel") == "next"]
        if not nxt or not j.get("features"):
            return out
        body = {**body, **(nxt[0].get("body") or {})}


class Strip:
    """One strip GeoTIFF read by range requests."""
    def __init__(self, url):
        self.url = url
        head = self._range(0, 65535)
        assert head[:4] == b"II+\x00", "not a little-endian BigTIFF"
        off = struct.unpack("<Q", head[8:16])[0]
        ifd = self._range(off, off + 20000)
        n = struct.unpack("<Q", ifd[:8])[0]
        sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}
        fm = {3: "H", 4: "I", 12: "d", 16: "Q"}
        tags = {}
        for i in range(n):
            e = ifd[8 + i * 20: 28 + i * 20]
            tag, typ, cnt = struct.unpack("<HHQ", e[:12])
            tot = sizes[typ] * cnt
            raw = e[12:12 + tot] if tot <= 8 else self._range(struct.unpack("<Q", e[12:20])[0], struct.unpack("<Q", e[12:20])[0] + tot - 1)
            tags[tag] = struct.unpack("<" + fm[typ] * cnt, raw) if typ in fm else raw
        self.w, self.h, self.tw, self.th = tags[256][0], tags[257][0], tags[322][0], tags[323][0]
        assert tags[259][0] == 5 and tags[317][0] == 3 and tags[258][0] == 32, "unexpected layout of the GeoTIFF"
        self.px = tags[33550][0]
        self.x0, self.y0 = tags[33922][3], tags[33922][4]      # the north-west corner
        self.offsets, self.counts = tags[324], tags[325]
        self.tx = (self.w + self.tw - 1) // self.tw

    def _range(self, a, b):
        return _get(self.url, {"Range": f"bytes={a}-{b}"})

    def tile(self, k):
        """Heights of tile k as an array('f') of tw x th (cells outside the image are NODATA)."""
        raw = self._range(self.offsets[k], self.offsets[k] + self.counts[k] - 1)
        return decode_tile(raw, self.tw, self.th)

    def window(self, x0, y0, x1, y1, pool=None):
        """The heights in the box x0..x1, y0..y1 (EPSG:3413 metres, y0 south) as (array('f'), cols, rows, west, north); None when the strip does not reach it."""
        c0, c1 = max(0, int((x0 - self.x0) // self.px)), min(self.w - 1, int((x1 - self.x0) // self.px))
        r0, r1 = max(0, int((self.y0 - y1) // self.px)), min(self.h - 1, int((self.y0 - y0) // self.px))
        if c0 > c1 or r0 > r1:
            return None
        cols, rows = c1 - c0 + 1, r1 - r0 + 1
        out = array.array("f", [NODATA]) * (cols * rows)
        ks = [(ty, tx) for ty in range(r0 // self.th, r1 // self.th + 1) for tx in range(c0 // self.tw, c1 // self.tw + 1)]
        jobs = [(self.url, self.offsets[ty * self.tx + tx], self.counts[ty * self.tx + tx], self.tw, self.th) for ty, tx in ks]
        results = pool.map(_fetch_tile, jobs) if pool else map(_fetch_tile, jobs)
        for (ty, tx), tile in zip(ks, results):
            ya, xa = ty * self.th, tx * self.tw
            for ry in range(max(r0, ya), min(r1, ya + self.th - 1) + 1):
                xs0, xs1 = max(c0, xa), min(c1, xa + self.tw - 1)
                out[(ry - r0) * cols + (xs0 - c0):(ry - r0) * cols + (xs1 - c0) + 1] = tile[(ry - ya) * self.tw + (xs0 - xa):(ry - ya) * self.tw + (xs1 - xa) + 1]
        return out, cols, rows, self.x0 + c0 * self.px, self.y0 - r0 * self.px


def _fetch_tile(job):      # runs in a worker process: download one tile and decode it
    url, off, cnt, tw, th = job
    return decode_tile(_get(url, {"Range": f"bytes={off}-{off + cnt - 1}"}), tw, th)


def lzw(data):
    """TIFF LZW (most significant bit first, codes of 9 to 12 bits, early change)."""
    table = {i: bytes([i]) for i in range(256)}
    out, nxt, width, prev = [], 258, 9, None
    acc, nbits, pos, n = 0, 0, 0, len(data)
    while True:
        while nbits < width:
            if pos >= n:
                return b"".join(out)
            acc = (acc << 8) | data[pos]; pos += 1; nbits += 8
        code = (acc >> (nbits - width)) & ((1 << width) - 1); nbits -= width; acc &= (1 << nbits) - 1
        if code == 257:
            return b"".join(out)
        if code == 256:
            table = {i: bytes([i]) for i in range(256)}; nxt, width, prev = 258, 9, None
            continue
        if prev is None:
            s = table[code]
        else:
            s = table[code] if code in table else prev + prev[:1]
            table[nxt] = prev + s[:1]; nxt += 1
            width = 9 if nxt < 511 else 10 if nxt < 1023 else 11 if nxt < 2047 else 12      # early change: one code sooner than the table is full
        out.append(s); prev = s


def decode_tile(raw, tw, th):
    """One tile -> array('f'): LZW, then the floating point predictor (bytes differenced along the row, then stored one byte plane after the other, most significant first)."""
    body = lzw(raw)
    rowlen = tw * 4
    out = bytearray(tw * th * 4)
    for y in range(th):
        row = body[y * rowlen:(y + 1) * rowlen]
        if len(row) < rowlen:
            break
        row = bytes(a & 255 for a in itertools.accumulate(row))
        base = y * rowlen
        out[base + 3:base + rowlen:4] = row[0:tw]          # most significant byte (the file is little endian, the planes run from the high byte down)
        out[base + 2:base + rowlen:4] = row[tw:2 * tw]
        out[base + 1:base + rowlen:4] = row[2 * tw:3 * tw]
        out[base + 0:base + rowlen:4] = row[3 * tw:4 * tw]
    a = array.array("f")
    a.frombytes(bytes(out))
    return a


def pool(workers=None):
    return concurrent.futures.ProcessPoolExecutor(max_workers=workers or max(2, (os.cpu_count() or 4) - 1))
