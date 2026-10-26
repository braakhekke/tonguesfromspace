import { describe, expect, it } from 'vitest';
import { fillGaps, type Raster } from './gapfill';
import { pngBytes } from './png';

/** Ice striped along a direction (middle moraines): the value depends on the distance ACROSS the stripes, plus a slow change along them. */
function ice(w: number, h: number, flowDeg: number) {
  const a = (flowDeg * Math.PI) / 180, fx = Math.cos(a), fy = Math.sin(a);
  const band = new Float32Array(w * h), band2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const along = x * fx + y * fy, across = -x * fy + y * fx;
    const v = 0.5 + 0.25 * Math.sin((2 * Math.PI * across) / 9) + 0.15 * Math.sin((2 * Math.PI * across) / 23) + 0.0008 * along;
    band[y * w + x] = v; band2[y * w + x] = v * 0.9 + 0.03;
  }
  return [band, band2, band.map((v) => v * 0.8)];
}
/** Vertical stripes of no data, 5 px wide every 38 px, slightly slanted (as in a scan-line gap). */
function stripes(w: number, h: number) {
  const valid = new Uint8Array(w * h).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((((x + Math.round(y * 0.12)) % 38) + 38) % 38 < 5) valid[y * w + x] = 0;
  return valid;
}
const rmse = (a: Float32Array, truth: Float32Array, valid: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (!valid[i]) { s += (a[i]! - truth[i]!) ** 2; n++; } return Math.sqrt(s / n); };

/** the plain way: along each row, between the nearest valid pixels on the left and the right */
function rowwise(band: Float32Array, valid: Uint8Array, w: number, h: number) {
  const o = Float32Array.from(band);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!valid[y * w + x]) {
    let l = x, r = x; while (l >= 0 && !valid[y * w + l]) l--; while (r < w && !valid[y * w + r]) r++;
    if (l >= 0 && r < w) o[y * w + x] = (band[y * w + l]! * (r - x) + band[y * w + r]! * (x - l)) / (r - l);
  }
  return o;
}

describe('gap filling along the flow', () => {
  const w = 160, h = 160;
  for (const flow of [35, 80, 120]) {
    it(`a moraine running at ${flow} degrees continues through the stripe: far less error than interpolating along the rows`, () => {
      const truth = ice(w, h, flow), valid = stripes(w, h);
      const holed = truth.map((b) => b.map((v, i) => (valid[i] ? v : 0)));
      const res = fillGaps({ w, h, bands: holed, valid });
      const mine = rmse(res.bands[0]!, truth[0]!, valid), plain = rmse(rowwise(holed[0]!, valid, w, h), truth[0]!, valid);
      expect(mine).toBeLessThan(0.5 * plain);
      // where the flow runs parallel to the stripes (here 80 degrees against stripes at 83) nothing valid lies along it inside the gap: the honest limit
      expect(mine).toBeLessThan(flow === 80 ? 0.1 : 0.08);
    });
  }
  it('leaves every valid pixel exactly as it was, and marks exactly the gap pixels', () => {
    const truth = ice(w, h, 35), valid = stripes(w, h), holed = truth.map((b) => b.map((v, i) => (valid[i] ? v : 0)));
    const res = fillGaps({ w, h, bands: holed, valid });
    for (let i = 0; i < w * h; i++) { if (valid[i]) expect(res.bands[0]![i]).toBe(holed[0]![i]); expect(res.filled[i]).toBe(valid[i] ? 0 : 1); }
  });
  it('fills all bands, and the bands stay consistent with each other', () => {
    const truth = ice(w, h, 60), valid = stripes(w, h), holed = truth.map((b) => b.map((v, i) => (valid[i] ? v : 0)));
    const res = fillGaps({ w, h, bands: holed, valid });
    for (let b = 1; b < 3; b++) expect(rmse(res.bands[b]!, truth[b]!, valid)).toBeLessThan(0.09);
  });
  it('a hole with no valid pixel in line still gets a value (and never NaN)', () => {
    const valid = new Uint8Array(30 * 30).fill(1); for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) valid[y * 30 + x] = 0;
    const res = fillGaps({ w: 30, h: 30, bands: [new Float32Array(900).fill(0.4)], valid }, { maxRun: 3 });
    expect(res.bands[0]!.every((v) => Number.isFinite(v))).toBe(true);
    expect(res.bands[0]![15 * 30 + 15]).toBeCloseTo(0.4, 1);
  });
  it('a picture with no gaps is returned unchanged', () => {
    const valid = new Uint8Array(400).fill(1), b = new Float32Array(400).map((_, i) => i / 400);
    const res = fillGaps({ w: 20, h: 20, bands: [b], valid });
    expect(res.stats.gapPixels).toBe(0); expect([...res.bands[0]!]).toEqual([...b]);
  });
});

describe('the png writer', () => {
  it('writes a file that starts with the PNG signature and ends with IEND', () => {
    const b = pngBytes(4, 3, new Uint8Array(4 * 3 * 3));
    expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(String.fromCharCode(...b.subarray(b.length - 8, b.length - 4))).toBe('IEND');
  });
});
