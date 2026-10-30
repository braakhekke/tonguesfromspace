#!/usr/bin/env python3
"""Reading swissBEDROCK (Federal Office of Topography swisstopo) with the standard library only: the bedrock elevation model BEM (band 1) at any LV95 place.

swissBEDROCK is a 10 m multi-band raster (release 1, August 2025: BEM, TMUD, Uncertainty, Version, VersionAuthor, ...), one Cloud Optimized GeoTIFF per 10 x 10 km at
https://data.geo.admin.ch/ch.swisstopo.geologie-swissbedrock/geologie-swissbedrock_<E>-<N>/geologie-swissbedrock_<E>-<N>_10_2056.tif (E, N: lower left corner of the tile in km, see tile_name),
float32, 11 bands interleaved per pixel, uncompressed, tiled 256 x 256, EPSG:2056, no data -9999. Used by scripts/build_terrain_bundle.py.
Terms: swisstopo's free geodata (OGD) terms, which the product page links: use, processing and commercial use allowed, credit "Federal Office of Topography swisstopo" is mandatory
(docs/sources/ch-swissbedrock.md). Under glaciers the BEM is swissALTI3D 10 m minus a modelled ice thickness (GLAMOS 2020), a "maximum estimate" without unconsolidated deposits (release notes).
Reads only the 256 x 256 pixel blocks that are asked for (range requests) and keeps band 1 of each in scripts/.dem-cache/swissbedrock.
"""
import array, math, os, struct, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.dem-cache', 'swissbedrock')
BASE = 'https://data.geo.admin.ch/ch.swisstopo.geologie-swissbedrock/geologie-swissbedrock_{n}/geologie-swissbedrock_{n}_10_2056.tif'
UA = {'User-Agent': 'tonguesfromspace/1.0 (https://tonguesfromspace.org)'}
NODATA = -9999.0
CELL = 10.0
SIDE = 10000                # a tile is 10 km


def tile_name(E, N): return f'{int(E // SIDE) * 10}-{int(N // SIDE) * 10}'      # lower left corner in km: 2640-1130 covers E 2640000-2650000, N 1130000-1140000


def _get(url, rng=None, tries=4):
    last = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **({'Range': f'bytes={rng[0]}-{rng[1]}'} if rng else {})}), timeout=120) as r: return r.read()
        except Exception as e: last = e
    raise last


class Tile:
    def __init__(self, name):
        self.name = name; self.url = BASE.format(n=name); head = _get(self.url, (0, 131071)); bo = '<' if head[:2] == b'II' else '>'
        if head[:2] not in (b'II', b'MM'): raise ValueError(f'{self.url}: not a TIFF')
        big = struct.unpack(bo + 'H', head[2:4])[0] == 43; tags = {}
        if big: off = struct.unpack(bo + 'Q', head[8:16])[0]; n = struct.unpack(bo + 'Q', head[off:off + 8])[0]; es, hs = 20, 8
        else: off = struct.unpack(bo + 'I', head[4:8])[0]; n = struct.unpack(bo + 'H', head[off:off + 2])[0]; es, hs = 12, 2
        sizes = {1: 1, 3: 2, 4: 4, 16: 8}; fmts = {1: 'B', 3: 'H', 4: 'I', 16: 'Q'}
        for k in range(n):
            e = head[off + hs + k * es: off + hs + (k + 1) * es]
            if big: tag, typ, cnt = struct.unpack(bo + 'HHQ', e[:12]); raw = e[12:20]
            else: tag, typ, cnt = struct.unpack(bo + 'HHI', e[:8]); raw = e[8:12]
            if typ not in sizes: continue
            nbytes = sizes[typ] * cnt
            if nbytes > len(raw):
                p = struct.unpack(bo + ('Q' if big else 'I'), raw[:8 if big else 4])[0]; raw = head[p:p + nbytes] if p + nbytes <= len(head) else _get(self.url, (p, p + nbytes - 1))
            tags[tag] = struct.unpack(bo + str(cnt) + fmts[typ], raw[:nbytes])
        g = lambda t: tags[t][0]
        if g(259) != 1 or g(284) != 1 or g(258) != 32 or g(339) != 3: raise ValueError(f'{name}: expects an uncompressed, pixel interleaved float32 TIFF, got compression {g(259)}, planar {g(284)}')
        self.w, self.h, self.spp, self.tw, self.th = g(256), g(257), g(277), g(322), g(323); self.offs, self.cnts = tags[324], tags[325]; self.across = math.ceil(self.w / self.tw)
        self.E0, self.N0 = int(name.split('-')[0]) * 1000, int(name.split('-')[1]) * 1000 + SIDE      # upper left corner

    def block(self, bx, by):               # band 1 of one block as a float array of tw x th
        path = os.path.join(CACHE, f'{self.name}_{bx}_{by}.f32')
        if os.path.exists(path): a = array.array('f'); a.frombytes(open(path, 'rb').read()); return a
        k = by * self.across + bx; raw = _get(self.url, (self.offs[k], self.offs[k] + self.cnts[k] - 1)); a = array.array('f'); a.frombytes(raw); a = a[0::self.spp]
        os.makedirs(CACHE, exist_ok=True); open(path, 'wb').write(a.tobytes()); return a


class Bed:
    def __init__(self): self.tiles = {}; self.missing = set()
    def _tile(self, E, N):
        n = tile_name(E, N)
        if n not in self.tiles:
            try: self.tiles[n] = Tile(n)
            except Exception as e: self.tiles[n] = None; self.missing.add(n); print(f'  swissBEDROCK tile {n}: {e}')
        return self.tiles[n]
    def cell(self, E, N):                  # the value of the 10 m cell that holds the place, or None
        t = self._tile(E, N)
        if t is None: return None
        x, y = int((E - t.E0) // CELL), int((t.N0 - N) // CELL)
        if not (0 <= x < t.w and 0 <= y < t.h): return None
        v = t.block(x // t.tw, y // t.th)[(y % t.th) * t.tw + x % t.tw]
        return None if v == NODATA or v != v else v
    def at(self, E, N):                    # bilinear between the four nearest cell centres; with a no-data neighbour the nearest valid one
        fx, fy = (E - CELL / 2) / CELL, (N - CELL / 2) / CELL; x0, y0 = math.floor(fx), math.floor(fy); ax, ay = fx - x0, fy - y0
        vs = [(self.cell((x0 + dx) * CELL + CELL / 2, (y0 + dy) * CELL + CELL / 2), (ax if dx else 1 - ax) * (ay if dy else 1 - ay)) for dy in (0, 1) for dx in (0, 1)]
        ok = [(v, w) for v, w in vs if v is not None]
        if len(ok) == 4: return sum(v * w for v, w in ok)
        return max(ok, key=lambda p: p[1])[0] if ok else None
