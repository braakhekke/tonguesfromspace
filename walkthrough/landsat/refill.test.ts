import { describe, expect, it } from 'vitest';
import { refillPicture } from './refill';

describe('refilling a finished picture', () => {
  const w = 60, h = 60;
  /** a picture of streaks across, with a stripe of 6 rows without data */
  const make = () => {
    const rgba = new Uint8Array(w * h * 4), valid = new Uint8Array(w * h).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, v = 120 + 80 * Math.sin((2 * Math.PI * x) / 12); rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = Math.round(v); rgba[i * 4 + 3] = 255; if (y >= 27 && y < 33) valid[i] = 0; }
    return { rgba, valid };
  };
  it('leaves every real pixel exactly as it was', () => {
    const { rgba, valid } = make(), out = refillPicture(rgba, w, h, valid).data;
    for (let i = 0; i < w * h; i++) if (valid[i]) for (let c = 0; c < 3; c++) expect(out[i * 4 + c]).toBe(rgba[i * 4 + c]);
  });
  it('replaces what the stripe held (here wrong values) by the streaks that run through it', () => {
    const { rgba, valid } = make(), truth = Uint8Array.from(rgba);
    for (let i = 0; i < w * h; i++) if (!valid[i]) rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255; // the old fill was wrong
    const out = refillPicture(rgba, w, h, valid), err = (d: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < w * h; i++) if (!valid[i]) { s += Math.abs(d[i * 4]! - truth[i * 4]!); n++; } return s / n; };
    expect(out.gapPixels).toBe(w * 6); expect(err(out.data)).toBeLessThan(12); expect(err(rgba)).toBeGreaterThan(60);
  });
  it('always gives an opaque, finite picture', () => { const { rgba, valid } = make(); const out = refillPicture(rgba, w, h, valid).data; expect(out.every((v, i) => (i % 4 === 3 ? v === 255 : Number.isFinite(v)))).toBe(true); });
});
