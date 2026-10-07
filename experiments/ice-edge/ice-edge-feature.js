/* Ice edge lines: the code block that sat in index.html, section 5 (before 'measuring'). See README.md for the other places it was wired in. */
/* ---------- ice edge lines: the margin of the bare ice (ablation zone), from a spectral index ----------
   For the scene of each year the Process API classifies every 10 m pixel from Sentinel-2 L2A:
     snow or ice  = NDSI (B03 - B11) / (B03 + B11) above 0.4 and near infrared (B08) above 0.11   (the usual snow-index thresholds)
     bare ice     = of those, red (B04) up to 0.45;  snow = brighter than that   (this last threshold is our own, set by eye, not validated)
     clouds and shadows (SCL 3, 8, 9, 10) and missing data are left out.
   Lines are drawn only where bare ice borders ground that is not snow or ice, inside the 1850 outline of the glacier. They stay open where the
   bare ice turns into snow (the snow line), under cloud and at the edge of the area. Debris-covered ice has the spectrum of rock and is not found. */
const ICE_VERSION = 'ice-v2';
const ICE_EVALSCRIPT = `//VERSION=3
function setup(){return{input:[{bands:["B03","B04","B08","B11","SCL","dataMask"]}],output:{bands:1,sampleType:"UINT8"}};}
function evaluatePixel(s){
 if(s.dataMask==0||s.SCL==0)return[0];
 if(s.SCL==3||s.SCL==8||s.SCL==9||s.SCL==10)return[240];
 var n=(s.B03-s.B11)/(s.B03+s.B11);
 if(n>0.4&&s.B08>0.11)return[s.B04>0.45?180:120];
 return[60];
}`;                      // 0 no data, 60 other ground, 120 bare ice, 180 snow, 240 cloud (codes far apart, so a JPEG would survive as well)
const ICE_MIN_EDGES = 30;       // shorter pieces (about 300 m) are noise
const iceReady = new Map();     // key -> lines, once loaded
const icePromises = new Map();
const iceKey = (g, yr) => { const sc = state.available[yr]; return sc ? `${CDSE.version}|${ICE_VERSION}|${g.id}|${sc.date}|${imageFootprint(g).bbox.join(',')}` : null; };
async function iceLinesFor(g, yr){
  const key = iceKey(g, yr);
  if (!key) return null;
  if (iceReady.has(key)) return iceReady.get(key);
  if (!icePromises.has(key)) {
    const p = (async () => {
      const hit = await idb.get(key);
      if (hit && hit.lines) return hit.lines;
      const fp = imageFootprint(g), sc = state.available[yr];
      const blob = await queued(() => cdse('process', {
        input: { bounds: { bbox: fp.bbox, properties: { crs: CRS3857 } },
                 data: [{ type: CDSE.collection, dataFilter: { timeRange: { from:`${sc.date}T00:00:00Z`, to:`${sc.date}T23:59:59Z` } } }] },
        output: { width: fp.w, height: fp.h, responses: [{ identifier:'default', format:{ type:'image/png' } }] },
        evalscript: ICE_EVALSCRIPT
      }, 'image/png', `${g.name}, ice edge ${fmtDate(sc.date)}`).then(r => r.blob()));
      const lines = await iceLinesFromMask(g, blob, fp);
      idb.set(key, {lines});
      return lines;
    })();
    icePromises.set(key, p);
    p.catch(() => icePromises.delete(key));
  }
  const lines = await icePromises.get(key);
  iceReady.set(key, lines);
  return lines;
}
async function iceLinesFromMask(g, blob, fp){
  const w = fp.w, h = fp.h, bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(bmp, 0, 0, w, h); if (bmp.close) bmp.close();
  const px = ctx.getImageData(0, 0, w, h).data, cls = new Uint8Array(w * h);
  for (let i = 0; i < cls.length; i++) cls[i] = Math.round(px[4 * i] / 60);
  // the area in which lines are kept: the 1850 outline (else the newest one), a little widened
  const P = ll => { const q = L.CRS.EPSG3857.project(L.latLng(ll[1], ll[0])); return [(q.x - fp.bbox[0]) / (fp.bbox[2] - fp.bbox[0]) * w, (fp.bbox[3] - q.y) / (fp.bbox[3] - fp.bbox[1]) * h]; };
  const geom = g.inv && (g.inv.oldest ? g.inv.oldest.outline : g.inv.outline);
  if (!geom) return [];
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
  ctx.beginPath();
  geom.coordinates.forEach(poly => poly.forEach(ring => { ring.forEach((pt, i) => { const [x, y] = P(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }));
  ctx.fill('evenodd'); ctx.stroke();
  const area = ctx.getImageData(0, 0, w, h).data;
  // thin stripes of rock inside the ice (moraines) are not the margin: close gaps up to 6 px (60 m) in snow and ice together
  const hit = new Uint8Array(w * h), tmp = new Uint8Array(w * h), R = 3;
  const sweep = (src, dst, grow, horizontal) => {            // square window of 2R+1 pixels, in one direction
    const n1 = horizontal ? h : w, n2 = horizontal ? w : h;
    for (let a = 0; a < n1; a++) {
      let cnt = 0;                                         // pixels in the window that count as 'on' (grow) or 'off' (shrink)
      const at = b => horizontal ? a * w + b : b * w + a, on = b => grow ? src[at(b)] === 1 : src[at(b)] === 0;
      for (let b = 0; b < Math.min(R, n2); b++) if (on(b)) cnt++;
      for (let b = 0; b < n2; b++) {
        if (b + R < n2 && on(b + R)) cnt++;
        if (b - R - 1 >= 0 && on(b - R - 1)) cnt--;
        dst[at(b)] = grow ? (cnt > 0 ? 1 : 0) : (cnt > 0 ? 0 : 1);
      }
    }
  };
  for (let i = 0; i < cls.length; i++) hit[i] = cls[i] === 2 || cls[i] === 3 ? 1 : 0;
  sweep(hit, tmp, true, true); sweep(tmp, hit, true, false);             // grow
  sweep(hit, tmp, false, true); sweep(tmp, hit, false, false);           // shrink: a closing
  for (let i = 0; i < cls.length; i++) if (hit[i] && cls[i] === 1) cls[i] = 2;
  // pixel edges between bare ice (2) and other ground (1), as a graph on the pixel corners
  const W1 = w + 1, adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (cls[i] !== 2 || !area[4 * i + 3]) continue;
    if (y === 0 || cls[i - w] === 1) link(y * W1 + x, y * W1 + x + 1);
    if (y === h - 1 || cls[i + w] === 1) link((y + 1) * W1 + x, (y + 1) * W1 + x + 1);
    if (x === 0 || cls[i - 1] === 1) link(y * W1 + x, (y + 1) * W1 + x);
    if (x === w - 1 || cls[i + 1] === 1) link(y * W1 + x + 1, (y + 1) * W1 + x + 1);
  }
  // walk the graph from every corner that is an end or a junction: only open pieces are kept, closed rings (islands) are dropped
  const used = new Set(), N = W1 * (h + 1), ek = (a, b) => a < b ? a * N + b : b * N + a, chains = [];
  for (const [v, nb] of adj) {
    if (nb.length === 2) continue;
    for (const n0 of nb) {
      if (used.has(ek(v, n0))) continue;
      const path = [v]; let prev = v, cur = n0; used.add(ek(v, n0));
      for (;;) {
        path.push(cur);
        const nx = adj.get(cur);
        if (nx.length !== 2) break;
        const next = nx[0] === prev ? nx[1] : nx[0];
        if (used.has(ek(cur, next))) break;
        used.add(ek(cur, next)); prev = cur; cur = next;
      }
      if (path.length - 1 >= ICE_MIN_EDGES) chains.push(path);
    }
  }
  // smooth the pixel staircase (moving average), then back to latitude and longitude
  return chains.map(path => {
    const pts = path.map(v => [v % W1, Math.floor(v / W1)]), k = 4, sm = pts.map((p, i) => {
      let sx = 0, sy = 0, n = 0;
      for (let j = Math.max(0, i - k); j <= Math.min(pts.length - 1, i + k); j++) { sx += pts[j][0]; sy += pts[j][1]; n++; }
      return i === 0 || i === pts.length - 1 ? p : [sx / n, sy / n];
    });
    return sm.filter((_, i) => i % 2 === 0 || i === sm.length - 1).map(([x, y]) => {
      const ll = L.CRS.EPSG3857.unproject(L.point(fp.bbox[0] + x / w * (fp.bbox[2] - fp.bbox[0]), fp.bbox[3] - y / h * (fp.bbox[3] - fp.bbox[1])));
      return [+ll.lat.toFixed(5), +ll.lng.toFixed(5)];
    });
  });
}
const iceLayers = {};
let iceGen = 0;
function clearIceLines(){ Object.values(iceLayers).forEach(l => map.removeLayer(l)); Object.keys(iceLayers).forEach(k => delete iceLayers[k]); }
function showIceLines(slot, lines, color){
  const pane = {A: 'iceA', B: 'iceB'}[slot] || 'outlines';
  if (iceLayers[slot]) map.removeLayer(iceLayers[slot]);
  delete iceLayers[slot];
  if (lines && lines.length) iceLayers[slot] = L.polyline(lines, {pane, color, weight:3, opacity:.95, lineJoin:'round', interactive:false}).addTo(map);
}
/* draws the lines of the years on show; a newer call makes older ones stale */
async function updateIceLines(){
  const gen = ++iceGen, note = document.getElementById('iceNote');
  clearIceLines();
  if (!document.getElementById('iceToggle').checked) { note.textContent = ''; return; }
  const g = currentGlacier();
  if (!g.inv) { note.textContent = 'Needs the glacier data (glaciers.js).'; return; }
  if (!state.checked) return;
  const chip = (c, y) => `<i class="ice-chip" style="background:${c}"></i>${y}`;
  const jobs = state.mode === 'timelapse'
    ? [['T', tlLayers[state.frame] && tlLayers[state.frame].yr, getVar('--ice-a')]]
    : [['A', state.a, getVar('--ice-a')], ['B', state.b, getVar('--ice-b')]].filter((j, i, a) => i === 0 || j[1] !== a[0][1]);
  note.innerHTML = 'Loading…';
  try {
    for (const [slot, yr, color] of jobs) {
      if (!yr || !state.available[yr]) continue;
      const lines = await iceLinesFor(g, yr);
      if (gen !== iceGen) return;
      showIceLines(slot, lines, color);
    }
    note.innerHTML = jobs.map(([, yr, c]) => chip(c, yr)).join('') + ' · bare ice only, debris-covered ice is not detected';
    if (state.mode === 'timelapse') preloadIce(g, gen);
  } catch (e) {
    if (gen === iceGen) note.textContent = 'Not available: ' + (e.message || e);
  }
}
function preloadIce(g, gen){            // timelapse: load the other years in the background, so playing does not wait
  tlFrames().forEach(y => { if (iceKey(g, y) && !iceReady.has(iceKey(g, y))) iceLinesFor(g, y).catch(() => {}); });
}
function drawIceFrame(){                // timelapse: the lines of the frame on show, if loaded
  if (state.mode !== 'timelapse' || !document.getElementById('iceToggle').checked) return;
  const g = currentGlacier(), t = tlLayers[state.frame], key = t && iceKey(g, t.yr);
  if (key && iceReady.has(key)) showIceLines('T', iceReady.get(key), getVar('--ice-a'));
  else { clearIceLines(); if (key) iceLinesFor(g, t.yr).then(() => state.playing || drawIceFrame()).catch(() => {}); }
  document.getElementById('iceNote').innerHTML = t ? `<i class="ice-chip" style="background:${getVar('--ice-a')}"></i>${t.yr} · bare ice only, debris-covered ice is not detected` : '';
}
document.getElementById('iceToggle').checked = prefs.ice === true;
document.getElementById('iceToggle').onchange = e => { prefs.ice = e.target.checked; savePrefs(); updateIceLines(); updateCredits(); };

