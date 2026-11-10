/* Elevation-model export (classic script, window.DEM; used by provenance.html, the field notes).
   The ice surface of one year as GeoTIFF, ESRI ASCII grid or XYZ, made in the browser from the terrain file the 3D view uses (data/terrain/<id>.<hash>.bin).
   The file holds the surface on a grid that follows the strip (turned to lie along the glacier); GeoTIFF and ASCII grid are the same heights resampled (bilinear) onto a north-up LV95 grid
   of the same cell size, XYZ lists the original nodes unchanged. Heights are stored in decimetres in the file. */
window.DEM = (() => {
  const R = 6378137, NODATA = -9999;
  const lv95 = (lat, lon) => { const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;      // swisstopo approximate formulas, WGS84 to LV95 (error below 0.1 m), as scripts/build_dem_change.py
    return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3, 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3]; };
  async function inflateLayers(buf, hl, head){      // the layers as int16; head.enc 2 (terrain_lib.pack): low bytes then high bytes, surfaces and bed stored as the difference to the heights
    const raw = new Uint8Array(await new Response(new Blob([new Uint8Array(buf, 8 + hl)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    if (head.enc !== 2) return new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
    const N = raw.length >> 1, all = new Int16Array(N); for (let i = 0; i < N; i++) all[i] = raw[i] | raw[N + i] << 8;
    const n = (head.nA + 1) * (head.nB + 1), first = head.dem ? 2 : 1, cnt = (head.yearly ? head.yearly.years.length : 0) + (head.bed ? 1 : 0);
    for (let k = first; k < first + cnt && (k + 1) * n <= N; k++) for (let i = 0; i < n; i++) all[k * n + i] += all[i];
    return all;
  }
  async function parse(buf){      // as parseBundle() in js/11-view3d.js: heights and the surface of every year
    const dv = new DataView(buf); if (dv.getUint32(0, false) !== 0x54465331) throw new Error('not a terrain file');
    const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
    const all = await inflateLayers(buf, hl, head);
    const W = head.nB + 1, n = (head.nA + 1) * W, undo = (off, add) => { const out = new Float32Array(n); for (let j = 0; j <= head.nA; j++) { let acc = 0; for (let i = 0; i < W; i++) { acc = (acc + all[off + j * W + i]) << 16 >> 16; out[j * W + i] = acc * 0.1 + add; } } return out; };
    let off = n; if (head.dem) off += n;
    return {head, surf: new Map(head.yearly.years.map((y, i) => [y, undo(off + i * n, head.h0)]))};
  }
  function nodes(h){      // LV95 position of every node
    const W = h.nB + 1, H = h.nA + 1, half = h.half || 2000, ln = h.up + h.back, E = new Float64Array(W * H), N = new Float64Array(W * H);
    for (let j = 0; j < H; j++) { const a = h.up - j * ln / h.nA; for (let i = 0; i < W; i++) { const b = -half + i * 2 * half / h.nB, x = h.P[0] + (a * h.ue + b * h.un) * h.k, y = h.P[1] + (a * h.un - b * h.ue) * h.k;
      const [e, n] = lv95((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI, x / R * 180 / Math.PI); E[j * W + i] = e; N[j * W + i] = n; } }
    return {W, H, E, N, cell: 2 * half / h.nB};
  }
  function grid(z, nd){      // north-up grid: for each output cell the strip position is found by Newton steps on the bilinear map of the nodes
    const {W, H, E, N} = nd, cell = Math.round(nd.cell);
    let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity; for (let k = 0; k < E.length; k++) { e0 = Math.min(e0, E[k]); e1 = Math.max(e1, E[k]); n0 = Math.min(n0, N[k]); n1 = Math.max(n1, N[k]); }
    const x0 = Math.ceil(e0 / cell) * cell, y1 = Math.floor(n1 / cell) * cell, cols = Math.floor((e1 - x0) / cell), rows = Math.floor((y1 - n0) / cell), out = new Float32Array(cols * rows).fill(NODATA);
    const A = [E[W - 1] - E[0], N[W - 1] - N[0]], B = [E[(H - 1) * W] - E[0], N[(H - 1) * W] - N[0]], det = A[0] * B[1] - A[1] * B[0];      // first guess: the plane through three corners
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = x0 + (c + .5) * cell, py = y1 - (r + .5) * cell; let fi = ((px - E[0]) * B[1] - (py - N[0]) * B[0]) / det * (W - 1), fj = (A[0] * (py - N[0]) - A[1] * (px - E[0])) / det * (H - 1), ok = false;
      for (let it = 0; it < 4; it++) {
        const i = Math.min(W - 2, Math.max(0, Math.floor(fi))), j = Math.min(H - 2, Math.max(0, Math.floor(fj))), k = j * W + i, u = fi - i, v = fj - j;
        const at = (A_) => A_[k] * (1 - u) * (1 - v) + A_[k + 1] * u * (1 - v) + A_[k + W] * (1 - u) * v + A_[k + W + 1] * u * v;
        const rx = px - at(E), ry = py - at(N);
        const dxu = (E[k + 1] - E[k]) * (1 - v) + (E[k + W + 1] - E[k + W]) * v, dyu = (N[k + 1] - N[k]) * (1 - v) + (N[k + W + 1] - N[k + W]) * v;
        const dxv = (E[k + W] - E[k]) * (1 - u) + (E[k + W + 1] - E[k + 1]) * u, dyv = (N[k + W] - N[k]) * (1 - u) + (N[k + W + 1] - N[k + 1]) * u, d = dxu * dyv - dyu * dxv;
        fi += (rx * dyv - ry * dxv) / d; fj += (dxu * ry - dyu * rx) / d;
        if (Math.abs(rx) < .01 && Math.abs(ry) < .01) { ok = true; break; }
      }
      if (!(fi >= 0 && fi <= W - 1 && fj >= 0 && fj <= H - 1)) continue;
      const i = Math.min(W - 2, Math.floor(fi)), j = Math.min(H - 2, Math.floor(fj)), k = j * W + i, u = fi - i, v = fj - j;
      out[r * cols + c] = z[k] * (1 - u) * (1 - v) + z[k + 1] * u * (1 - v) + z[k + W] * (1 - u) * v + z[k + W + 1] * u * v;
    }
    return {data: out, cols, rows, x0, y1, cell};
  }
  function geotiff(g, text){
    const enc = new TextEncoder(), desc = enc.encode(text + '\0'), nod = enc.encode(String(NODATA) + '\0'), nt = 15, ifd = 8, ext = ifd + 2 + nt * 12 + 4;
    const oDesc = ext, oScale = oDesc + desc.length + (desc.length & 1), oTie = oScale + 24, oKeys = oTie + 48, oNod = oKeys + 40, pix = (oNod + nod.length + 3) & ~3, size = pix + g.data.length * 4;
    const buf = new ArrayBuffer(size), dv = new DataView(buf), u8 = new Uint8Array(buf); u8[0] = 0x49; u8[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifd, true); dv.setUint16(ifd, nt, true);
    let p = ifd + 2; const tag = (t, ty, cnt, val) => { dv.setUint16(p, t, true); dv.setUint16(p + 2, ty, true); dv.setUint32(p + 4, cnt, true); if (ty === 3 && cnt === 1) dv.setUint16(p + 8, val, true); else dv.setUint32(p + 8, val, true); p += 12; };
    tag(256, 4, 1, g.cols); tag(257, 4, 1, g.rows); tag(258, 3, 1, 32); tag(259, 3, 1, 1); tag(262, 3, 1, 1); tag(270, 2, desc.length, oDesc); tag(273, 4, 1, pix); tag(277, 3, 1, 1); tag(278, 4, 1, g.rows); tag(279, 4, 1, g.data.length * 4);
    tag(339, 3, 1, 3); tag(33550, 12, 3, oScale); tag(33922, 12, 6, oTie); tag(34735, 3, 20, oKeys); tag(42113, 2, nod.length, oNod); dv.setUint32(p, 0, true);
    u8.set(desc, oDesc); [g.cell, g.cell, 0].forEach((v, i) => dv.setFloat64(oScale + 8 * i, v, true)); [0, 0, 0, g.x0, g.y1, 0].forEach((v, i) => dv.setFloat64(oTie + 8 * i, v, true));
    [1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 2056, 4096, 0, 1, 5728].forEach((v, i) => dv.setUint16(oKeys + 2 * i, v, true)); u8.set(nod, oNod);      // projected, pixel is area, EPSG:2056, vertical EPSG:5728
    new Float32Array(buf, pix, g.data.length).set(g.data); return buf;
  }
  function asc(g){
    const f = v => v === NODATA ? '-9999' : v.toFixed(2), out = [`ncols ${g.cols}`, `nrows ${g.rows}`, `xllcorner ${g.x0}`, `yllcorner ${g.y1 - g.rows * g.cell}`, `cellsize ${g.cell}`, 'NODATA_value -9999'];
    for (let r = 0; r < g.rows; r++) { const row = new Array(g.cols); for (let c = 0; c < g.cols; c++) row[c] = f(g.data[r * g.cols + c]); out.push(row.join(' ')); }
    return out.join('\n') + '\n';
  }
  function xyz(z, nd, text){
    const out = ['# ' + text, 'E_LV95_m,N_LV95_m,height_m']; for (let k = 0; k < z.length; k++) out.push(nd.E[k].toFixed(2) + ',' + nd.N[k].toFixed(2) + ',' + z[k].toFixed(1)); return out.join('\n') + '\n';
  }
  function make(b, year, fmt, text){
    const z = b.surf.get(year); if (!z) throw new Error('no surface for ' + year);
    if (fmt === 'xyz') return {blob: new Blob([xyz(z, b.nd, text)], {type: 'text/csv'}), ext: 'xyz.csv'};
    const g = grid(z, b.nd);
    return fmt === 'asc' ? {blob: new Blob([asc(g)], {type: 'text/plain'}), ext: 'asc'} : {blob: new Blob([geotiff(g, text)], {type: 'image/tiff'}), ext: 'tif'};
  }
  function credit(name, y, kind, date, id){      // the line inside every file (GeoTIFF description, first line of the XYZ)
    return `Tongues from Space (tonguesfromspace.org), ${name}, ice surface ${y} (${kind || 'model'}${date ? ', ' + date : ''}). Model from swisstopo data (swissALTI3D, swissSURFACE3D, flight DSMs; (c) swisstopo) and the GLAMOS mass balance; for non-commercial use. LV95 EPSG:2056, heights as swissALTI3D (EPSG:5728). Field notes: provenance.html?id=${id}`;
  }
  const fileName = (id, y, ext) => `tonguesfromspace_${id}_${y}_surface_lv95.${ext}`;
  const FORMATS = {tif: 'GeoTIFF (.tif)', asc: 'ESRI ASCII grid (.asc)', xyz: 'XYZ points (.xyz.csv)'};
  const FORMAT_TEXT = {tif: 'GeoTIFF, one band, 32-bit float, north-up: the heights of the strip resampled bilinearly from the grid that follows the strip. No-data -9999.', asc: 'ESRI ASCII grid, north-up: the heights of the strip resampled bilinearly from the grid that follows the strip. No-data -9999. The file has no projection line: it is EPSG:2056.', xyz: 'Text, one line per node of the strip grid (about 14 m apart, the grid turned along the glacier), the heights as stored, no resampling.'};
  function save(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  return {make, parse, nodes, grid, geotiff, asc, xyz, credit, fileName, save, FORMATS, FORMAT_TEXT};
})();
