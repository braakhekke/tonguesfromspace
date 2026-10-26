/**
 * Landsat search for a picture box: USGS Landsat Collection 2 through the Microsoft Planetary Computer (public, no key).
 *  - the scenes come from the STAC search (Level-2 surface reflectance; Level-1 only where Level-2 does not exist),
 *  - cloud, snow and coverage are measured over the BOX from the QA_PIXEL band (a 256 x 256 sample of the box), not taken
 *    from the scene-level figure, which covers a 185 km frame. If the QA band cannot be read, the scene figure is used and says so.
 * Scenes never change, so every answer is cached on disk.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bounds } from '../shared/schema';
import { simplifyRing } from '../shared/geo';
import { ROOT } from '../data';

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const DATA = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox';
/** QA_PIXEL is read as a SAMPLE x SAMPLE picture of the box (about 100 m a pixel for a 25 km box): fine enough to see a stripe or an edge. */
const SAMPLE = 256;

export type LandsatCandidate = {
  sensor: string; date: string; id: string; path: string; row: string; level: 'L2' | 'L1';
  usable: boolean; why?: string;
  /** Landsat 7 after the scan-line failure: stripes of no data inside the frame. Allowed below 100 %, because they are filled. */
  gaps?: 'slc-off' | 'outside-glacier';
  cloud: number; shadow: number; snow: number; coverage: number; basis: 'box' | 'scene';
};

/**
 * Bits of QA_PIXEL (Collection 2): 0 fill, 1 dilated cloud, 2 cirrus (Landsat 8 and 9), 3 cloud, 4 cloud shadow, 5 snow.
 * CLOUD is bit 3 (and cirrus on Landsat 8 and 9), as the previous site counted it (8.2 % here against its 7.8 % for Aletsch 1984).
 * Dilated cloud (a margin round every cloud) and cloud shadow are not counted as cloud: over mountains the shadow bit mostly marks
 * terrain shadow (24 to 28 % of every Aletsch scene), so counting it would call nearly every scene cloudy. Shadow is reported on its own.
 */
export function qaStats(qa: Uint16Array, mask: Uint16Array, sensor: string) {
  let valid = 0, cloud = 0, shadow = 0, snow = 0;
  const cirrus = sensor === 'landsat-8' || sensor === 'landsat-9' ? 4 : 0;
  for (let i = 0; i < qa.length; i++) {
    if (mask[i] === 0 || (qa[i]! & 1)) continue;
    valid++;
    if (qa[i]! & (8 | cirrus)) cloud++;
    if (qa[i]! & 16) shadow++;
    if (qa[i]! & 32) snow++;
  }
  return { cloud: valid ? cloud / valid : 1, shadow: valid ? shadow / valid : 0, snow: valid ? snow / valid : 0, coverage: qa.length ? valid / qa.length : 0 };
}

/** Indices of the pixels with no data (outside the scene, or fill). */
export function noDataPixels(qa: Uint16Array, mask: Uint16Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < qa.length; i++) if (mask[i] === 0 || (qa[i]! & 1)) out.push(i);
  return out;
}

/** A titiler .npy answer: shape (bands + 1, h, w) of uint16, the data bands and then the mask. */
export function readNpyBands(b: Uint8Array): { bands: Uint16Array[]; mask: Uint16Array; w: number; h: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] !== 0x93 || String.fromCharCode(...b.subarray(1, 6)) !== 'NUMPY') throw new Error('not a .npy answer');
  const hl = dv.getUint16(8, true), header = new TextDecoder().decode(b.subarray(10, 10 + hl));
  if (!/'<u2'/.test(header)) throw new Error(`unexpected dtype in ${header}`);
  const shape = /\((\d+),\s*(\d+),\s*(\d+)\)/.exec(header);
  if (!shape || Number(shape[1]) < 2) throw new Error(`unexpected shape in ${header}`);
  const nb = Number(shape[1]), h = Number(shape[2]), w = Number(shape[3]), n = w * h, off = 10 + hl;
  const all: Uint16Array[] = [];
  for (let k = 0; k < nb; k++) { const a = new Uint16Array(n); for (let i = 0; i < n; i++) a[i] = dv.getUint16(off + 2 * (k * n + i), true); all.push(a); }
  return { bands: all.slice(0, nb - 1), mask: all[nb - 1]!, w, h };
}
/** The QA band of a .npy answer (the first data band) and its mask. */
export function readNpy(b: Uint8Array): { data: Uint16Array; mask: Uint16Array } {
  const r = readNpyBands(b);
  return { data: r.bands[0]!, mask: r.mask };
}

const inRing = (x: number, y: number, ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!; if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) c = !c; } return c; };

/**
 * Share of the box inside the scene's footprint. It is 1 ONLY when the whole box is inside: all four corners and every
 * point of a 100 x 100 grid. (A Landsat footprint is convex, so a box with its four corners inside is entirely inside.)
 * Anything less is reported as less than 1, even if only a sliver is missing.
 */
export function footprintCoverage(box: Bounds, geom: { type: string; coordinates: any }): number {
  const polys: number[][][] = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map((p: number[][][]) => p[0]!);
  const [[s, w], [n, e]] = box;
  const inside = (x: number, y: number) => polys.some((r) => inRing(x, y, r));
  const corners = [[w, s], [e, s], [e, n], [w, n]] as const;
  let hit = 0;
  const N = 100;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (inside(w + ((i + 0.5) / N) * (e - w), s + ((j + 0.5) / N) * (n - s))) hit++;
  const all = hit === N * N && corners.every(([x, y]) => inside(x!, y!));
  return all ? 1 : Math.min(hit / (N * N), 0.9999);
}

const cacheDir = () => { const d = join(process.env.TFS_CACHE ?? join(ROOT, '.cache'), 'landsat-qa'); mkdirSync(d, { recursive: true }); return d; };
const boxKey = (box: Bounds) => createHash('sha1').update(JSON.stringify(box)).digest('hex').slice(0, 8);

async function postJson(f: typeof fetch, url: string, body: unknown) {
  for (let a = 0; a < 3; a++) {
    try { const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) return r.json() as Promise<any>; } catch { /* retry */ }
    await new Promise((ok) => setTimeout(ok, 400 * (a + 1)));
  }
  throw new Error('The Planetary Computer did not answer the scene search.');
}

async function boxStats(f: typeof fetch, box: Bounds, id: string, sensor: string) {
  const file = join(cacheDir(), `${id}.${boxKey(box)}.${SAMPLE}.v3.json`); // v3: with the positions of the no-data pixels
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as { cloud: number; shadow: number; snow: number; coverage: number; gapIdx: number[] };
  const [[s, w], [n, e]] = box;
  const url = `${DATA}/${w},${s},${e},${n}/${SAMPLE}x${SAMPLE}.npy?collection=landsat-c2-l2&item=${id}&assets=qa_pixel`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await f(url);
      if (!r.ok) throw new Error(String(r.status));
      const { data, mask } = readNpy(new Uint8Array(await r.arrayBuffer()));
      const st = { ...qaStats(data, mask, sensor), gapIdx: noDataPixels(data, mask) };
      writeFileSync(file, JSON.stringify(st));
      return st;
    } catch { await new Promise((ok) => setTimeout(ok, 400 * (a + 1))); }
  }
  return null;
}

async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); } }));
  return out;
}

/**
 * The pixels of the SAMPLE x SAMPLE picture of the box that lie within `marginM` metres of the glacier outline (the outline itself
 * included). A missing pixel here would cut into the glacier or its immediate surroundings. Distance is a chamfer transform, good to a few
 * percent; a pixel is about 95 m.
 */
export function protectedMask(box: Bounds, outline: { type: string; coordinates: any }[], marginM: number): Uint8Array {
  const [[s, w], [n, e]] = box, N = SAMPLE, mx = ((e - w) * 111_200 * Math.cos((((s + n) / 2) * Math.PI) / 180)) / N, my = ((n - s) * 111_200) / N, px = (mx + my) / 2;
  const rings: number[][][] = outline.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p: number[][][]) => p[0]!)));
  const inside = new Uint8Array(N * N);
  // a ring of a 45,000-vertex outline is thinned to about 10 m before the per-pixel test
  const thin = rings.map((r) => simplifyRing(r, 0.0001));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const lon = w + ((x + 0.5) / N) * (e - w), lat = n - ((y + 0.5) / N) * (n - s); if (thin.some((r) => inRing(lon, lat, r))) inside[y * N + x] = 1; }
  // distance (in pixels) to the nearest inside pixel: two chamfer passes with weights 1 and sqrt 2
  const INF = 1e9, d = new Float32Array(N * N).map((_, i) => (inside[i] ? 0 : INF)), r2 = Math.SQRT2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; let v = d[i]!; if (x > 0) v = Math.min(v, d[i - 1]! + 1); if (y > 0) { v = Math.min(v, d[i - N]! + 1); if (x > 0) v = Math.min(v, d[i - N - 1]! + r2); if (x < N - 1) v = Math.min(v, d[i - N + 1]! + r2); } d[i] = v; }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) { const i = y * N + x; let v = d[i]!; if (x < N - 1) v = Math.min(v, d[i + 1]! + 1); if (y < N - 1) { v = Math.min(v, d[i + N]! + 1); if (x < N - 1) v = Math.min(v, d[i + N + 1]! + r2); if (x > 0) v = Math.min(v, d[i + N - 1]! + r2); } d[i] = v; }
  const out = new Uint8Array(N * N), reach = marginM / px;
  for (let i = 0; i < N * N; i++) out[i] = d[i]! <= reach ? 1 : 0;
  return out;
}

export async function searchLandsat(box: Bounds, from: string, to: string, f: typeof fetch = fetch, opts: { maxSceneCloud?: number; outline?: { type: string; coordinates: any }[]; marginM?: number } = {}): Promise<LandsatCandidate[]> {
  const [[s, w], [n, e]] = box;
  const range = `${from}T00:00:00Z/${to}T23:59:59Z`;
  const search = async (collection: string) => ((await postJson(f, STAC, { collections: [collection], bbox: [w, s, e, n], datetime: range, limit: 200 })).features ?? []) as any[];
  const [l2, l1] = await Promise.all([search('landsat-c2-l2'), search('landsat-c2-l1')]);
  const key = (it: any) => `${it.properties.platform}|${it.properties['landsat:wrs_path']}|${it.properties['landsat:wrs_row']}|${it.properties.datetime.slice(0, 10)}`;
  const have = new Set(l2.map(key));
  const items = [...l2.map((it) => ({ it, level: 'L2' as const })), ...l1.filter((it) => !have.has(key(it)) && /landsat-[1-4]$/.test(it.properties.platform)).map((it) => ({ it, level: 'L1' as const }))];
  const maxCloud = (opts.maxSceneCloud ?? 80);
  let prot: Uint8Array | undefined; // made once, when the first scene needs it
  // STAC returns every scene whose footprint touches the box, including ones that only graze its edge
  const touching = items.filter(({ it }) => footprintCoverage(box, it.geometry) >= 0.05);
  return pool(touching, 6, async ({ it, level }) => {
    const p = it.properties, sensor = p.platform as string, date = (p.datetime as string).slice(0, 10);
    const geomCover = footprintCoverage(box, it.geometry);
    const base = { sensor, date, id: it.id as string, path: String(p['landsat:wrs_path']), row: String(p['landsat:wrs_row']), level };
    const scene = (p['eo:cloud_cover'] ?? 100) / 100;
    if (level === 'L1') {
      const mss = /landsat-[1-3]$/.test(sensor);
      return { ...base, usable: false, why: mss ? 'MSS: 60 m pixels and no blue band' : 'Level-1 only: no surface reflectance for this scene', cloud: scene, shadow: 0, snow: 0, coverage: geomCover, basis: 'scene' as const } satisfies LandsatCandidate;
    }
    const st = scene * 100 <= maxCloud && geomCover >= 0.3 ? await boxStats(f, box, base.id, sensor) : null;
    const coverage = st ? Math.min(st.coverage, geomCover) : geomCover;
    const footprintFull = geomCover >= 1 - 1e-9, full = coverage >= 1 - 1e-9;
    // 100 % of the picture box is required. The one exception: Landsat 7 after the scan-line failure (31 May 2003) has stripes of
    // no data inside the frame; they are allowed because they are filled (along the flow of the ice), but only while the scene's
    // footprint still covers the whole box.
    const slcOff = sensor === 'landsat-7' && date >= '2003-06-01';
    if (!full && slcOff && footprintFull) return { ...base, usable: true, gaps: 'slc-off' as const, why: `Landsat 7 stripe gaps: ${(coverage * 100).toFixed(0)} % of the box has data, the rest is filled along the flow`, cloud: st ? st.cloud : scene, shadow: st ? st.shadow : 0, snow: st ? st.snow : 0, coverage, basis: st ? ('box' as const) : ('scene' as const) } satisfies LandsatCandidate;
    // the allowance: all the missing data lies farther than the margin from the glacier outline (only measurable with the QA band)
    if (!full && st && opts.outline?.length && (opts.marginM ?? 0) > 0 && st.gapIdx.length) {
      prot ??= protectedMask(box, opts.outline, opts.marginM!);
      if (st.gapIdx.every((i) => !prot![i])) return { ...base, usable: true, gaps: 'outside-glacier' as const, why: `${((1 - coverage) * 100).toFixed(1)} % of the box has no data, all of it more than ${opts.marginM} m from the glacier outline`, cloud: st.cloud, shadow: st.shadow, snow: st.snow, coverage, basis: 'box' as const } satisfies LandsatCandidate;
    }
    const why = full ? undefined : `covers ${(coverage * 100).toFixed(1)} % of the picture box; 100 % is required${st && opts.outline?.length && (opts.marginM ?? 0) > 0 ? `, and some of the missing data lies within ${opts.marginM} m of the glacier` : ''}`;
    return { ...base, usable: full, why, cloud: st ? st.cloud : scene, shadow: st ? st.shadow : 0, snow: st ? st.snow : 0, coverage, basis: st ? ('box' as const) : ('scene' as const) } satisfies LandsatCandidate;
  }).then((all) => all.sort((a, b) => a.date.localeCompare(b.date)));
}
