/**
 * Filling the stripe gaps of Landsat 7 (scan-line corrector off, after 31 May 2003) over a glacier.
 *
 * Ice is striped ALONG its flow: middle moraines, flow lines, ogives' edges. A gap is therefore filled by interpolating between
 * the nearest valid pixels along that direction, so a moraine that runs through a stripe continues through it instead of being
 * smeared across it (which is what row-by-row interpolation does).
 *
 *  1. Direction: the structure tensor of the picture (gradient products, smoothed with a Gaussian over VALID pixels only, so it
 *     reaches into the gaps). The streaks run perpendicular to the dominant gradient. Coherence says how sure that is.
 *  2. Along the streak: from a gap pixel walk both ways to the nearest valid pixel, on three parallel rays (offset -1, 0, +1 px
 *     across the streak, to average out noise), and interpolate linearly by distance.
 *  3. Where the streaks are weak (low coherence), one side is missing, or the ray runs along the gap and so is much longer than the
 *     shortest way across it: interpolate along rows and columns instead (the short crossing weighs most), blended with the along-flow
 *     result by coherence.
 *  Only original valid pixels are ever used as sources, so errors cannot spread from one filled pixel to the next.
 *
 * The limit: where the ice flows PARALLEL to the stripes, no valid pixel lies along the flow inside the gap, so the streaks can only be
 * continued from across it, which is less exact. (The stripes move from one acquisition to the next: a neighbouring date would fill
 * those places from real pixels. Not built.)
 */
export type Raster = { w: number; h: number; bands: Float32Array[]; valid: Uint8Array };
export type FillOptions = { sigma?: number; maxRun?: number; minCoherence?: number; /** an along-flow estimate is trusted only if its span is at most this many times the shortest way straight across the gap */ maxStretch?: number };
export type FillResult = { bands: Float32Array[]; filled: Uint8Array; stats: { gapPixels: number; alongFlow: number; blended: number; axis: number; nearest: number } };

function gaussianKernel(sigma: number) {
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]!; }
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum;
  return { k, r };
}

/** Separable Gaussian blur. */
function blur(a: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const { k, r } = gaussianKernel(sigma), t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) s += a[y * w + xx]! * k[i + r]!; } t[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < h) s += t[yy * w + x]! * k[i + r]!; } o[y * w + x] = s; }
  return o;
}

export function fillGaps(r: Raster, opt: FillOptions = {}): FillResult {
  const { w, h, bands, valid } = r, n = w * h, nb = bands.length;
  const sigma = opt.sigma ?? 4, maxRun = opt.maxRun ?? 30, minCoh = opt.minCoherence ?? 0.05, stretch = opt.maxStretch ?? 3;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let b = 0; b < nb; b++) s += bands[b]![i]!; lum[i] = s / nb; }

  // structure tensor from gradients that lie fully on valid pixels, smoothed by normalised convolution
  const jxx = new Float32Array(n), jxy = new Float32Array(n), jyy = new Float32Array(n), wt = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!valid[i] || !valid[i - 1] || !valid[i + 1] || !valid[i - w] || !valid[i + w]) continue;
    const gx = (lum[i + 1]! - lum[i - 1]!) / 2, gy = (lum[i + w]! - lum[i - w]!) / 2;
    jxx[i] = gx * gx; jxy[i] = gx * gy; jyy[i] = gy * gy; wt[i] = 1;
  }
  const den = blur(wt, w, h, sigma), sxx = blur(jxx, w, h, sigma), sxy = blur(jxy, w, h, sigma), syy = blur(jyy, w, h, sigma);
  let gxx = 0, gxy = 0, gyy = 0, gw = 0;
  for (let i = 0; i < n; i++) { gxx += jxx[i]!; gxy += jxy[i]!; gyy += jyy[i]!; gw += wt[i]!; }
  if (gw) { gxx /= gw; gxy /= gw; gyy /= gw; }

  const out = bands.map((b) => Float32Array.from(b)), filled = new Uint8Array(n);
  const stats = { gapPixels: 0, alongFlow: 0, blended: 0, axis: 0, nearest: 0 };

  /** nearest valid pixel from (x, y) along (dx, dy), up to maxRun steps: its values and distance */
  const ray = (x: number, y: number, dx: number, dy: number) => {
    for (let t = 1; t <= maxRun; t++) {
      const px = Math.round(x + dx * t), py = Math.round(y + dy * t);
      if (px < 0 || py < 0 || px >= w || py >= h) return null;
      const j = py * w + px;
      if (valid[j]) return { j, t };
    }
    return null;
  };
  /** interpolation between the two sides along a direction, averaged over parallel rays; null if a side is missing */
  const along = (x: number, y: number, dx: number, dy: number, offsets: number[]) => {
    const acc = new Float32Array(nb); let m = 0, tsum = 0;
    for (const o of offsets) {
      const ox = x - dy * o, oy = y + dx * o; // shifted across the direction
      const a = ray(ox, oy, dx, dy), b = ray(ox, oy, -dx, -dy);
      if (!a || !b) continue;
      for (let k = 0; k < nb; k++) acc[k] = acc[k]! + (b.t * bands[k]![a.j]! + a.t * bands[k]![b.j]!) / (a.t + b.t);
      tsum += a.t + b.t; m++;
    }
    return m ? { v: acc.map((q) => q / m), span: tsum / m } : null;
  };

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (valid[i]) continue;
    stats.gapPixels++;
    // local direction of the streaks (perpendicular to the dominant gradient), and how coherent it is
    const ok = den[i]! > 1e-3;
    const a = ok ? sxx[i]! / den[i]! : gxx, b = ok ? sxy[i]! / den[i]! : gxy, c = ok ? syy[i]! / den[i]! : gyy;
    const theta = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2, coh = Math.sqrt((a - c) ** 2 + 4 * b * b) / (a + c + 1e-12);
    let fl = coh >= minCoh ? along(x, y, Math.cos(theta), Math.sin(theta), [-1, 0, 1]) : null;
    // rows and columns
    const hz = along(x, y, 1, 0, [0]), vt = along(x, y, 0, 1, [0]);
    // a ray that runs ALONG a stripe (flow parallel to it) reaches pixels far away and makes streaks: trust it only if it is not much longer than the shortest way across
    const across = Math.min(hz?.span ?? Infinity, vt?.span ?? Infinity);
    if (fl && Number.isFinite(across) && fl.span > stretch * across) fl = null;
    let axis: Float32Array | null = null;
    // the short crossing counts far more than the long one
    if (hz && vt) { const wh = 1 / hz.span ** 2, wv = 1 / vt.span ** 2; axis = hz.v.map((q, k) => (q * wh + vt.v[k]! * wv) / (wh + wv)); } else if (hz) axis = hz.v; else if (vt) axis = vt.v;

    let res: Float32Array | null = null;
    if (fl && axis) { const s = Math.min(1, Math.max(0, (coh - minCoh) / 0.35)); const ax: Float32Array = axis; res = fl.v.map((q, k) => s * q + (1 - s) * ax[k]!); stats.blended++; }
    else if (fl) { res = fl.v; stats.alongFlow++; }
    else if (axis) { res = axis; stats.axis++; }
    else {
      // an enclosed hole with no valid pixel in line: the mean of the nearest valid pixels in growing squares
      for (let rad = 1; rad <= maxRun && !res; rad++) {
        const acc = new Float32Array(nb); let m = 0;
        for (let yy = Math.max(0, y - rad); yy <= Math.min(h - 1, y + rad); yy++) for (let xx = Math.max(0, x - rad); xx <= Math.min(w - 1, x + rad); xx++) { const j = yy * w + xx; if (valid[j]) { for (let k = 0; k < nb; k++) acc[k] = acc[k]! + bands[k]![j]!; m++; } }
        if (m) res = acc.map((q) => q / m);
      }
      stats.nearest++;
    }
    if (res) { for (let k = 0; k < nb; k++) out[k]![i] = res[k]!; filled[i] = 1; }
  }
  return { bands: out, filled, stats };
}
