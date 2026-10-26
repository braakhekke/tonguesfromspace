/**
 * Re-filling the stripes of a Landsat 7 picture along the flow of the ice, in the colours of the finished picture.
 * The picture that exists already (the previous site's render) keeps every real pixel exactly as it is. Which pixels are real comes from the
 * raw bands (no data = a stripe). The stripe pixels are filled from the real pixels of the picture itself (gapfill.ts), so no colour
 * mapping is involved and there are no seams.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import type { Bounds } from '../../shared/schema';
import { readNpyBands } from '../sources/landsat';
import { fillGaps, type FillOptions } from './gapfill';

/** RGBA pixels in, RGBA out: pixels with valid = 1 are untouched, the others are filled. */
export function refillPicture(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, valid: Uint8Array, opt?: FillOptions): { data: Uint8Array; gapPixels: number } {
  const bands = [0, 1, 2].map((c) => Float32Array.from({ length: w * h }, (_, i) => rgba[i * 4 + c]!));
  const res = fillGaps({ w, h, bands, valid }, opt);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { for (let c = 0; c < 3; c++) out[i * 4 + c] = valid[i] ? rgba[i * 4 + c]! : Math.max(0, Math.min(255, Math.round(res.bands[c]![i]!))); out[i * 4 + 3] = 255; }
  return { data: out, gapPixels: res.stats.gapPixels };
}

export type RefillResult = { gapPixels: number; share: number; w: number; h: number; before: Uint8Array; after: Uint8Array };

/** `jpg` is the picture to improve in place; its first version is kept as <name>.old.jpg and is always the source, so running again does not compound. */
export async function refillScene(box: Bounds, itemId: string, jpg: string, f: typeof fetch = fetch): Promise<RefillResult> {
  const keep = jpg.replace(/\.jpg$/, '.old.jpg');
  if (!existsSync(keep)) copyFileSync(jpg, keep);
  const old = jpeg.decode(readFileSync(keep), { useTArray: true }), W = old.width, H = old.height;
  const [[s, w0], [n, e]] = box;
  const r = await f(`https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${w0},${s},${e},${n}/${W}x${H}.npy?collection=landsat-c2-l2&item=${itemId}&assets=red&assets=green&assets=blue`);
  if (!r.ok) throw new Error(`The Planetary Computer answered ${r.status} for ${itemId}`);
  const { bands, mask, w, h } = readNpyBands(new Uint8Array(await r.arrayBuffer()));
  if (w !== W || h !== H) throw new Error(`size mismatch: the picture is ${W} x ${H}, the bands ${w} x ${h}`);
  const valid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) valid[i] = mask[i] !== 0 && bands.every((b) => b[i]! > 0) ? 1 : 0;
  const { data, gapPixels } = refillPicture(old.data, W, H, valid);
  writeFileSync(jpg, jpeg.encode({ data, width: W, height: H }, 93).data);
  const rgb = (d: Uint8Array | Uint8ClampedArray) => { const o = new Uint8Array(W * H * 3); for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = d[i * 4 + c]!; return o; };
  return { gapPixels, share: gapPixels / (W * H), w: W, h: H, before: rgb(old.data), after: rgb(data) };
}
