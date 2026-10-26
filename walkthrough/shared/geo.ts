/**
 * Picture geometry. A glacier's picture box becomes a Web Mercator box whose size gives
 * native 10 m GROUND pixels (Mercator metres are stretched by 1/cos(lat), so a pixel is 10/cos(lat) wide in
 * the projection). A box wider than the Process API limit is cut into equal tiles.
 */
import type { Bounds } from './schema';

export const GROUND_RES_M = 10;
/** The Process API's own limit: 2,500 px per side. A box up to that size is one request; above it, equal tiles. */
export const MAX_TILE_PX = 2500;
const R = 6378137;

export const toMercator = (lat: number, lon: number): [number, number] => [
  (R * lon * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

export type Tile = { bbox: [number, number, number, number]; w: number; h: number };
export type Grid = { bbox: [number, number, number, number]; w: number; h: number; tiles: Tile[] };

export function imageGrid(box: Bounds): Grid {
  const [[s, w], [n, e]] = box;
  const [x0, y0] = toMercator(s, w);
  const [x1, y1] = toMercator(n, e);
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180) / GROUND_RES_M; // projection metres -> pixels
  const W = Math.max(1, Math.ceil((x1 - x0) * k));
  const H = Math.max(1, Math.ceil((y1 - y0) * k));
  const cols = Math.ceil(W / MAX_TILE_PX);
  const rows = Math.ceil(H / MAX_TILE_PX);
  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const tw = Math.ceil(W / cols), th = Math.ceil(H / rows);
      const px0 = c * tw, py0 = r * th; // from the north-west corner
      const w2 = Math.min(tw, W - px0), h2 = Math.min(th, H - py0);
      tiles.push({
        bbox: [
          x0 + (px0 / W) * (x1 - x0),
          y1 - ((py0 + h2) / H) * (y1 - y0),
          x0 + ((px0 + w2) / W) * (x1 - x0),
          y1 - (py0 / H) * (y1 - y0),
        ],
        w: w2,
        h: h2,
      });
    }
  return { bbox: [x0, y0, x1, y1], w: W, h: H, tiles };
}

/** Great-circle distance in km. */
export function km(a: [number, number], b: [number, number]): number {
  const t = Math.PI / 180;
  const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Rough area of a box in km², for guard rails. */
export function boxAreaKm2(box: Bounds): number {
  const [[s, w], [n, e]] = box;
  return km([s, w], [s, e]) * km([s, w], [n, w]);
}

export const fromMercator = (x: number, y: number): [number, number] => [
  (((2 * Math.atan(Math.exp(y / R))) - Math.PI / 2) * 180) / Math.PI,
  (x / R) * (180 / Math.PI),
];

/** Leaflet bounds [[south, west], [north, east]] of a Web Mercator bbox. */
export const bboxToBounds = (b: [number, number, number, number]): [[number, number], [number, number]] => {
  const [s, w] = fromMercator(b[0], b[1]);
  const [n, e] = fromMercator(b[2], b[3]);
  return [[s, w], [n, e]];
};

type Ring = number[][]; // [lon, lat] pairs, GeoJSON order

/** Area of a ring on the sphere, km² (Chamberlain-Duquette). Good to a fraction of a percent at glacier sizes. */
function ringKm2(ring: Ring): number {
  let t = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!, [x2, y2] = ring[i + 1]!;
    t += ((x2! - x1!) * Math.PI / 180) * (2 + Math.sin((y1! * Math.PI) / 180) + Math.sin((y2! * Math.PI) / 180));
  }
  return Math.abs((t * 6371 * 6371) / 2);
}

/** Area of a Polygon or MultiPolygon: outer ring minus holes. */
export function areaKm2(geom: { type: string; coordinates: any[] }): number {
  const poly = (rings: Ring[]) => ringKm2(rings[0]!) - rings.slice(1).reduce((a, r) => a + ringKm2(r), 0);
  return geom.type === 'Polygon' ? poly(geom.coordinates as Ring[]) : (geom.coordinates as Ring[][]).reduce((a, p) => a + poly(p), 0);
}

/** [[south, west], [north, east]] of GeoJSON features, or null if empty. */
export function featuresBounds(features: { geometry: { type: string; coordinates: any[] } }[]): Bounds | null {
  let s = 90, w = 180, n = -90, e = -180;
  const walk = (c: any): void => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  features.forEach((f) => walk(f.geometry.coordinates));
  return s <= n ? [[s, w], [n, e]] : null;
}

/** The outline vertex furthest south: only a first guess for the tongue tip, which is the LOWEST point of the ice front. */
export function southernmost(features: { geometry: { type: string; coordinates: any[] } }[]): [number, number] | null {
  let best: [number, number] | null = null;
  const walk = (c: any): void => { if (typeof c[0] === 'number') { if (!best || c[1] < best[0]) best = [c[1], c[0]]; } else c.forEach(walk); };
  features.forEach((f) => walk(f.geometry.coordinates));
  return best;
}

/** Douglas-Peucker on an open line of [lon, lat], tolerance in degrees. */
function simplifyLine(line: number[][], tol: number): number[][] {
  if (line.length <= 2) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, at = -1;
    const [ax, ay] = line[a]!, [bx, by] = line[b]!, dx = bx! - ax!, dy = by! - ay!, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (line[i]![0]! - ax!) - dx * (line[i]![1]! - ay!)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

/**
 * Douglas-Peucker on a CLOSED ring. The chord of a closed ring has zero length, which makes the plain algorithm return
 * the ring unchanged, so the ring is split at its farthest vertex and each half is simplified on its own.
 */
export function simplifyRing(ring: number[][], tol: number): number[][] {
  if (ring.length <= 4) return ring;
  const [x0, y0] = ring[0]!;
  let far = 1, best = -1;
  ring.forEach(([x, y], i) => { const d = Math.hypot(x! - x0!, y! - y0!); if (d > best) { best = d; far = i; } });
  const a = simplifyLine(ring.slice(0, far + 1), tol), b = simplifyLine(ring.slice(far), tol);
  const out = [...a, ...b.slice(1)];
  return out.length >= 4 ? out : ring;
}
