/** Heights from the swisstopo height service (swissALTI3D, public, no key). Used to find the lowest point of an ice front. */
import proj4 from 'proj4';
import { simplifyRing } from '../../shared/geo';

const LV95 = '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346 +units=m +no_defs';
export const toLv95 = (lon: number, lat: number): [number, number] => proj4('WGS84', LV95, [lon, lat]) as [number, number];
const URL = 'https://api3.geo.admin.ch/rest/services/height';

export async function heightAt(lon: number, lat: number, f: typeof fetch = fetch): Promise<number | null> {
  const [e, n] = toLv95(lon, lat);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await f(`${URL}?easting=${e.toFixed(1)}&northing=${n.toFixed(1)}&sr=2056`);
      if (r.ok) { const h = Number(((await r.json()) as { height?: string }).height); return Number.isFinite(h) ? h : null; }
    } catch { /* retry */ }
    await new Promise((ok) => setTimeout(ok, 300 * (attempt + 1)));
  }
  return null;
}

async function many(points: [number, number][], f: typeof fetch, limit = 8): Promise<(number | null)[]> {
  const out: (number | null)[] = new Array(points.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < points.length) { const i = next++; out[i] = await heightAt(points[i]![0], points[i]![1], f); } }));
  return out;
}

/** All outline vertices of a (Multi)Polygon's outer rings, [lon, lat]. */
const outerVertices = (g: { type: string; coordinates: any[] }): number[][] =>
  (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p: number[][][]) => p[0]!)).flatMap((r: number[][]) => r);

/**
 * The lowest point of an outline: the tongue tip is the lowest point of the ice front. A coarse pass over a simplified outline,
 * then a fine pass over the original vertices within `refineM` of the best coarse point.
 */
export async function lowestPoint(g: { type: string; coordinates: any[] }, f: typeof fetch = fetch, opts: { refineM?: number; coarse?: number } = {}): Promise<{ lat: number; lon: number; height: number; queried: number } | null> {
  const refineM = opts.refineM ?? 300, maxCoarse = opts.coarse ?? 600;
  const rings = g.type === 'Polygon' ? [g.coordinates[0] as number[][]] : g.coordinates.map((p: number[][][]) => p[0]!);
  // an even sample of the outline, never a truncation: the tongue end can be anywhere in the vertex list
  const all = rings.flatMap((r) => simplifyRing(r, 0.0002)) as [number, number][];
  const stride = Math.max(1, Math.ceil(all.length / maxCoarse));
  const coarse = all.filter((_, i) => i % stride === 0);
  const h1 = await many(coarse, f);
  let best = -1;
  h1.forEach((h, i) => { if (h !== null && (best < 0 || h < h1[best]!)) best = i; });
  if (best < 0) return null;
  const [bx, by] = coarse[best]!;
  const near = outerVertices(g).filter(([x, y]) => Math.hypot((x! - bx) * 111_200 * Math.cos((by * Math.PI) / 180), (y! - by) * 111_200) <= refineM).slice(0, 600) as [number, number][]; // every vertex of the window: the tongue end is nearly flat, so the answer must not depend on a stride
  const h2 = await many(near, f);
  let lo = { lon: bx, lat: by, height: h1[best]! };
  h2.forEach((h, i) => { if (h !== null && h < lo.height) lo = { lon: near[i]![0], lat: near[i]![1], height: h }; });
  return { ...lo, queried: coarse.length + near.length };
}
