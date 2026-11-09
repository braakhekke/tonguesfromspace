/* A minimal reader for Cloud Optimized GeoTIFFs of swisstopo's special flights: the natural-colour orthophotos (JPEG, 8 bit, 0.1 m) and the near-infrared lines (LZW, 16 bit, four bands, shown as bands 1 to 3 stretched). the file is read by HTTP range requests, only the 512 px blocks a map tile needs, and decoded by the browser's own
   JPEG decoder. `renderMapTile` makes one 256 px Web Mercator map tile from the right overview level. No dependencies; the coordinate formula is passed in. */
const WM = 20037508.342789244;
const TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 7: 1, 12: 8, 16: 8};
const getRange = async (url, a, b) => { const r = await fetch(url, {headers: {Range: `bytes=${a}-${b}`}}); if (r.status !== 206 && r.status !== 200) throw new Error(`range ${r.status}`); const buf = await r.arrayBuffer(); return r.status === 200 ? buf.slice(a, b + 1) : buf; };
const u64 = (dv, o) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296;
/* TIFF LZW (most significant bit first, early change), 16 bit samples, four bands in a pixel, the horizontal predictor if the file has it; the bands N, R, G are stretched to 8 bit into an ImageData (no data is 0 = black) */
function lzwBytes(src, expected){
  const out = new Uint8Array(expected), prefix = new Int32Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Int32Array(4096); let op = 0;
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; len[i] = 1; }
  let next = 258, bl = 9, buf = 0, nb = 0, ip = 0, prev = -1;
  const put = code => { const l = len[code]; let p = op + l - 1, c = code; while (c >= 0 && p >= op) { if (p < expected) out[p] = suffix[c]; p--; c = prefix[c]; } op += l; };
  while (op < expected) {
    while (nb < bl && ip < src.length) { buf = (buf << 8) | src[ip++]; nb += 8; }
    if (nb < bl) break; const code = (buf >> (nb - bl)) & ((1 << bl) - 1); nb -= bl; buf &= (1 << nb) - 1;
    if (code === 257) break;
    if (code === 256) { next = 258; bl = 9; prev = -1; continue; }
    if (prev === -1) { put(code); prev = code; continue; }
    const f = code < next ? first[code] : first[prev]; prefix[next] = prev; suffix[next] = f; first[next] = first[prev]; len[next] = len[prev] + 1; next++;
    put(code); prev = code; if (next === (1 << bl) - 1 && bl < 12) bl++;
  }
  return out;
}
function decodeLzw16(data, lv, stretch){
  const w = lv.tw, h = lv.th, n = lv.spp, raw = lzwBytes(data, w * h * n * 2), s16 = new Uint16Array(raw.buffer, 0, w * h * n);      // little-endian files on little-endian machines
  if (lv.pred === 2) for (let r = 0; r < h; r++) for (let c = 1; c < w; c++) for (let k = 0; k < n; k++) s16[(r * w + c) * n + k] = (s16[(r * w + c) * n + k] + s16[(r * w + c - 1) * n + k]) & 65535;
  const lo = stretch ? stretch[0] : [0, 0, 0], hi = stretch ? stretch[1] : [65535, 65535, 65535], rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, m = w * h; i < m; i++) { const a = s16[i * n], b = s16[i * n + 1], c = s16[i * n + 2]; if (!(a | b | c)) continue;
    rgba[i * 4] = (a - lo[0]) / Math.max(1, hi[0] - lo[0]) * 255; rgba[i * 4 + 1] = (b - lo[1]) / Math.max(1, hi[1] - lo[1]) * 255; rgba[i * 4 + 2] = (c - lo[2]) / Math.max(1, hi[2] - lo[2]) * 255; rgba[i * 4 + 3] = 255; }
  return new ImageData(rgba, w, h);
}
export class Cog {
  constructor(url, opt = {}){ this.url = url; this.stretch = opt.stretch || null;      // stretch [[lo x3], [hi x3]]: the 16-bit file is shown as near infrared, red, green with it
    this.bitmaps = new Map(); this.levels = null; this.pending = new Map(); this.opening = null; }
  open(){ return this.opening || (this.opening = this._open()); }
  async _open(){      // BigTIFF header and the chain of image directories (full size first, then the overviews)
    const head = await getRange(this.url, 0, 262143), dv = new DataView(head); if (dv.getUint16(2, true) !== 43) throw new Error('not a BigTIFF'); let ifd = u64(dv, 8); const levels = [];
    while (ifd && ifd + 8 < head.byteLength) {
      const n = u64(dv, ifd), tags = {}; let o = ifd + 8;
      for (let i = 0; i < n; i++, o += 20) { const tag = dv.getUint16(o, true), type = dv.getUint16(o + 2, true), count = u64(dv, o + 4), size = (TYPE_SIZE[type] || 1) * count; tags[tag] = {type, count, at: size <= 8 ? o + 12 : u64(dv, o + 12), inline: size <= 8}; }
      const val = t => { const x = tags[t]; if (!x) return null; const d = x.inline ? dv : null; return d ? (x.type === 3 ? d.getUint16(x.at, true) : x.type === 4 ? d.getUint32(x.at, true) : u64(d, x.at)) : null; };
      const lv = {w: val(256), h: val(257), tw: val(322), th: val(323), comp: val(259), spp: val(277) || 3, pred: val(317) || 1, tags};
      if (tags[33550] && tags[33922]) { const sc = [0, 1, 2].map(k => dv.getFloat64(tags[33550].at + 8 * k, true)), tp = [0, 1, 2, 3, 4, 5].map(k => dv.getFloat64(tags[33922].at + 8 * k, true)); lv.scale = sc[0]; lv.ox = tp[3]; lv.oy = tp[4]; }
      levels.push(lv); ifd = u64(dv, o);
    }
    for (let i = levels.length - 1; i >= 0; i--) if (levels[i].spp < 3) levels.splice(i, 1);      // a mask directory (one sample) is not a picture
    if (!levels.length || levels.some(l => l.comp !== 7 && l.comp !== 5)) throw new Error('not a JPEG or LZW COG');
    const l0 = levels[0]; levels.forEach(l => { if (l.scale === undefined) { l.scale = l0.scale * l0.w / l.w; l.ox = l0.ox; l.oy = l0.oy; } });
    this.levels = levels; this.tables = new Map();
  }
  async _arrays(lv){      // the tile offsets and byte counts of one level, read once
    if (lv.offsets) return; if (lv._p) return lv._p;
    lv._p = (async () => {
      const t = lv.tags, rd = async x => { const sz = TYPE_SIZE[x.type], buf = await getRange(this.url, x.at, x.at + x.count * sz - 1), d = new DataView(buf), a = new Float64Array(x.count); for (let i = 0; i < x.count; i++) a[i] = sz === 8 ? u64(d, i * 8) : sz === 4 ? d.getUint32(i * 4, true) : d.getUint16(i * 2, true); return a; };      // the byte counts may be 4 or 8 bytes each
      [lv.offsets, lv.counts] = await Promise.all([rd(t[324]), rd(t[325])]);
      const jt = t[347]; if (jt) lv.jtab = new Uint8Array(await getRange(this.url, jt.at, jt.at + jt.count - 1));
    })(); return lv._p;
  }
  async block(li, col, row){      // one decoded block (an ImageBitmap), or null outside the picture
    const lv = this.levels[li], nx = Math.ceil(lv.w / lv.tw), ny = Math.ceil(lv.h / lv.th); if (col < 0 || row < 0 || col >= nx || row >= ny) return null;
    const key = li + '|' + col + '|' + row; if (this.bitmaps.has(key)) { const b = this.bitmaps.get(key); this.bitmaps.delete(key); this.bitmaps.set(key, b); return b; }      // most recently used last
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      await this._arrays(lv); const i = row * nx + col, off = lv.offsets[i], cnt = lv.counts[i]; if (!cnt) return null;
      const data = new Uint8Array(await getRange(this.url, off, off + cnt - 1)); let bmp;
      if (lv.comp === 7) { const tab = lv.jtab, jpeg = new Uint8Array(tab.length - 2 + data.length - 2); jpeg.set(tab.subarray(0, tab.length - 2), 0); jpeg.set(data.subarray(2), tab.length - 2); bmp = await createImageBitmap(new Blob([jpeg], {type: 'image/jpeg'})); }      // the tables, then the block without its start marker
      else bmp = await createImageBitmap(decodeLzw16(data, lv, this.stretch));
      this.bitmaps.set(key, bmp);
      while (this.bitmaps.size > 160) { const k = this.bitmaps.keys().next().value; const old = this.bitmaps.get(k); this.bitmaps.delete(k); if (old.close) old.close(); }
      return bmp;
    })().catch(() => null).finally(() => this.pending.delete(key));
    this.pending.set(key, p); return p;
  }
}
/* One map tile (256 px, Web Mercator XYZ) from the file: `toLV95(lon, lat)` -> [E, N] in metres (not rounded). A pixel that is black (no data) or outside the picture stays transparent. Returns a canvas or null. */
export async function renderMapTile(cog, z, x, y, toLV95, opt = {}){      // opt.minScale: do not use a level finer than this (metres per pixel): the quick, coarse first picture; opt.trim: metres of the edge of the picture that are left out (the dark no-data fringe)
  await cog.open(); const T = 2 * WM / 2 ** z, mx0 = -WM + x * T, my1 = WM - y * T, N = 16, G = N + 1, E = new Float64Array(G * G), No = new Float64Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const mx = mx0 + i / N * T, my = my1 - j / N * T, lon = mx / WM * 180, lat = (2 * Math.atan(Math.exp(my / WM * Math.PI)) - Math.PI / 2) * 180 / Math.PI, [e, n] = toLV95(lon, lat); E[j * G + i] = e; No[j * G + i] = n;
  }
  const res = Math.hypot(E[N] - E[0], No[N] - No[0]) / 256;      // metres per output pixel
  let li = 0; cog.levels.forEach((l, k) => { if (l.scale <= res * 1.05 && l.scale > cog.levels[li].scale) li = k; });
  if (opt.minScale && cog.levels[li].scale < opt.minScale * 0.95) { const cand = cog.levels.map((l, k) => [l.scale, k]).filter(([q]) => q >= opt.minScale * 0.95).sort((a, b) => a[0] - b[0])[0]; if (cand) li = cand[1]; }
  const lv = cog.levels[li], sc = lv.scale, minE = Math.min(...E), maxE = Math.max(...E), minN = Math.min(...No), maxN = Math.max(...No);
  const tp = Math.ceil((opt.trim || 0) / sc), c0 = Math.floor((minE - lv.ox) / sc) - 1 - tp, c1 = Math.ceil((maxE - lv.ox) / sc) + 1 + tp, r0 = Math.floor((lv.oy - maxN) / sc) - 1 - tp, r1 = Math.ceil((lv.oy - minN) / sc) + 1 + tp, W = c1 - c0, H = r1 - r0;      // tp: a margin, so that cutting the edge does not cut at the tile's own border
  if (W < 2 || H < 2 || W > 1600 || H > 1600) return null;
  const jobs = []; for (let r = Math.floor(r0 / lv.th); r <= Math.floor((r1 - 1) / lv.th); r++) for (let c = Math.floor(c0 / lv.tw); c <= Math.floor((c1 - 1) / lv.tw); c++) jobs.push(cog.block(li, c, r).then(b => ({b, c, r})));
  const got = await Promise.all(jobs); if (!got.some(g => g.b)) return null;
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H; const mctx = mc.getContext('2d', {willReadFrequently: true}); got.forEach(({b, c, r}) => { if (b) mctx.drawImage(b, c * lv.tw - c0, r * lv.th - r0); });
  const src = mctx.getImageData(0, 0, W, H).data, out = document.createElement('canvas'); out.width = out.height = 256; const octx = out.getContext('2d'), im = octx.createImageData(256, 256), px = im.data;
  let ok = null;      // valid pixels, with the edge of the picture cut back by tp pixels (a square window, by an integral image)
  if (tp > 0) {
    const v = new Uint8Array(W * H), I = new Int32Array((W + 1) * (H + 1)); for (let i = 0; i < W * H; i++) v[i] = src[i * 4 + 3] > 0 && src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2] > 12 ? 1 : 0;
    for (let yy = 0; yy < H; yy++) { let row = 0; for (let xx = 0; xx < W; xx++) { row += v[yy * W + xx]; I[(yy + 1) * (W + 1) + xx + 1] = I[yy * (W + 1) + xx + 1] + row; } }
    ok = new Uint8Array(W * H); const n = (2 * tp + 1) ** 2;
    for (let yy = tp; yy < H - tp; yy++) for (let xx = tp; xx < W - tp; xx++) { const a = (yy - tp) * (W + 1) + xx - tp, b = (yy + tp + 1) * (W + 1) + xx - tp, c = (yy - tp) * (W + 1) + xx + tp + 1, d = (yy + tp + 1) * (W + 1) + xx + tp + 1; if (I[d] - I[b] - I[c] + I[a] === n) ok[yy * W + xx] = 1; }
  }
  const valid = k => ok ? ok[k >> 2] === 1 : src[k + 3] > 0 && src[k] + src[k + 1] + src[k + 2] > 12;      // the picture's no-data is black
  for (let py = 0; py < 256; py++) for (let pxl = 0; pxl < 256; pxl++) {
    const gi = (pxl + .5) / 256 * N, gj = (py + .5) / 256 * N, i = Math.min(N - 1, Math.floor(gi)), j = Math.min(N - 1, Math.floor(gj)), fi = gi - i, fj = gj - j, a = j * G + i;
    const e = (E[a] * (1 - fi) + E[a + 1] * fi) * (1 - fj) + (E[a + G] * (1 - fi) + E[a + G + 1] * fi) * fj, n = (No[a] * (1 - fi) + No[a + 1] * fi) * (1 - fj) + (No[a + G] * (1 - fi) + No[a + G + 1] * fi) * fj;
    const sx = (e - lv.ox) / sc - c0 - .5, sy = (lv.oy - n) / sc - r0 - .5, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0; if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
    let R = 0, Gc = 0, B = 0, A = 0;
    for (let q = 0; q < 4; q++) { const xx = x0 + (q & 1), yy = y0 + (q >> 1), w = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy), k = (yy * W + xx) * 4; if (valid(k)) { R += src[k] * w; Gc += src[k + 1] * w; B += src[k + 2] * w; A += w; } }
    if (A < 0.5) continue; const o = (py * 256 + pxl) * 4; px[o] = R / A; px[o + 1] = Gc / A; px[o + 2] = B / A; px[o + 3] = 255;
  }
  octx.putImageData(im, 0, 0); return out;
}
