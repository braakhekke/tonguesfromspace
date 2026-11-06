/* Map layers in a download (picture or animation).
   The Layers box decides: a layer that is ticked there and that this file can draw is printed into the picture, as its own pass over the
   Sentinel-2 / Landsat pixels (the satellite image itself is never touched). The same drawing runs for the frame preview and for the finished file.
   Layers that are not drawn yet are greyed in the box while a download pane is open; a layer that cannot change with the year is greyed for an animation. */
import { $ } from './01-data.js';
import { eachPiece, newOutlineGeom, hasOldOutline } from './02-glaciers.js';
import { currentGlacier, viewMode, state } from './04-state.js';
import { imageFootprint } from './03-imagery.js';
import { thickestSpot, spotText, getVar, strokeEdgeFade, osm, topo, alti, bgTiles, BG_YEAR, mapYears, siYear, flownYear, thicknessClipped, THICK_LAYER, loadSpeedFile, speedArray, speedYear, speedId, speedMask, speedCanvas, speedPeak, speedYearOk, SPEED_LUT, SPEED_MIN, SPEED_MAX, labels, trails, namesData, loadRadar, radarColor, arcsFor, arcStroke, arcEdgeFade, arcLabel, flightsShown, flightHas, liveTile, flightStreamZ } from './05-map.js';
import { wire } from './wire.js';

/* The layers the download can draw. `image` / `video`: where it makes sense (a layer that differs by year cannot be one fixed pass over an animation). */
const tipOf = g => g && (g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue);      // [lat, lng]
export const EXPORT_LAYERS = [
  { id: 'newToggle', image: true, video: true, has: g => !!newOutlineGeom(g) },
  { id: 'pinToggle', image: true, video: true, has: g => !!tipOf(g) },
  { id: 'maxToggle', image: true, video: true, has: g => !!thickestSpot(g), credit: () => 'Thickest ice: ' + (thickestSpot(currentGlacier()).kind === 'model' ? 'Grab et al. 2021, SwissGlacierThickness-R2020 (CC BY 4.0)' : 'GLAMOS radar (CC BY 4.0)') },
  /* background maps: tiles drawn into the picture under the satellite image (the picture itself is not touched); the same for every year, so they can go in an animation.
     `credit` is what the picture must say (the wording of the credits line of the site). */
  { id: 'osmToggle', bg: true, image: true, video: true, has: () => true, url: () => osm._url, maxNative: 19, credit: () => 'Map © OpenStreetMap contributors' },
  { id: 'topoToggle', bg: true, image: true, video: true, has: () => !!FEATURES.swisstopo, url: () => topo._url, maxNative: 18, credit: () => 'Map © swisstopo' },
  { id: 'oldMapToggle', bg: true, image: true, video: true, has: () => !!FEATURES.swisstopo && !!(mapYears() && mapYears().oldest),
    url: () => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.zeitreihen/default/${mapYears().oldest}1231/3857/{z}/{x}/{y}.png`, maxNative: 18, credit: () => `Map ${mapYears().oldest} © swisstopo (Journey through time)` },
  { id: 'altiToggle', bg: true, image: true, video: true, has: () => !!FEATURES.swisstopo, url: () => alti._url, maxNative: 18, credit: () => 'Hillshade: swissALTI3D © swisstopo' },
  /* swisstopo special flights of the year (pictures of one year only): tiles cut live from the flights' own files (0.1 m), over the satellite image. `native`: the preview shows the live map's own. */
  { id: 'flightsToggle', raster: true, native: true, image: true, video: false, has: g => !!flightsShown(g), prepare: prepareFlights,
    credit: () => { const l = flightsShown(currentGlacier()) || []; return `Special flights imagery ${[...new Set(l.map(f => f.date))].join(' and ')}: © swisstopo (Spezialbefliegungen)`; } },
  /* colour layers: a picture on top of the satellite image (under the outlines), with a legend card in the header. Thickness is one picture for every year; speed is the year of the picture
     (the right-hand year of a slider, as on the map), so it is for pictures only. */
  { id: 'thickToggle', raster: true, image: true, video: true, has: g => !!FEATURES.swisstopo && !!(g && g.inv), prepare: prepareThickness,
    credit: () => 'Ice thickness (modelled, state around 2016): Grab et al. 2021, GLAMOS, via swisstopo' },
  { id: 'speedToggle', raster: true, image: true, video: false, has: g => !!FEATURES.speed && !!g && !!speedId(g), prepare: prepareSpeed,
    credit: () => 'Ice speed: ITS_LIVE annual mosaics of image pair velocities v2.1, NASA MEaSUREs (CC BY 4.0)' },
  /* the experimental outline of the year (own model, GlaViTU), drawn like on the map: one year; a slider's two years; in an animation the area lost since the first year, up to each year */
  { id: 'arcsToggle', image: true, video: true, has: g => !!arcsFor(g), credit: () => 'Experimental outline: own experiment, outlines of the lowest 2 km modelled from Sentinel-2 pictures (GlaViTU), smoothed by 20 m; not official outlines' },
  /* overlays over the satellite image: tiles of place labels and hiking trails (the trails inside the picture box, as on the map), then the names of the glaciers and the radar dots as drawing */
  { id: 'labelsToggle', bg: true, over: true, alpha: 0.9, image: true, video: true, has: () => true, url: () => labels._url, maxNative: 16, credit: () => 'Labels © OpenStreetMap contributors, rendering EOX' },
  { id: 'trailsToggle', bg: true, over: true, alpha: 0.9, clipFp: true, image: true, video: true, has: () => !!FEATURES.swisstopo, url: () => trails._url, maxNative: 17, credit: () => 'Hiking trails © swisstopo',
    card: { title: 'Hiking trails', rows: [['#FDC200', 'Hiking trail'], ['#FF0000', 'Mountain trail'], ['#0000FF', 'Alpine trail']] } },
  { id: 'namesToggle', raster: true, image: true, video: true, has: g => !!g, prepare: prepareNames, credit: () => 'Other glacier names: Wikidata (CC0), Randolph Glacier Inventory 6.0 via GLIMS' },
  { id: 'radarToggle', raster: true, image: true, video: true, has: g => !!(g && g.inv && g.inv.radar), prepare: prepareRadar, credit: () => 'Radar ice thickness: GLAMOS (CC BY 4.0)' },
  /* swisstopo aerial photographs of the year of the picture, under the satellite image, inside the picture box: they differ by year, so they are for pictures (one year, or the two of a slider), not animations */
  { id: 'aerialToggle', bg: true, aerial: true, image: true, video: false, has: () => !!FEATURES.swisstopo && !state.oldestAerial,
    url: yr => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage-product/default/${siYear(yr)}/3857/{z}/{x}/{y}.jpeg`, maxNative: 18,
    credit: ys => `Aerial images: SWISSIMAGE ${[...new Set(ys.map(siYear))].map(ed => ed + (flownYear(currentGlacier(), ed) ? ` (flown ${flownYear(currentGlacier(), ed)})` : '')).join(' and ')} © swisstopo` },
  { id: 'mosaicToggle', bg: true, image: true, video: true, has: () => true, url: () => bgTiles._url, maxNative: 14, bright: 1.12,      // as on the map (the background pane is a little brighter)
    credit: () => `Background: Sentinel-2 cloudless ${BG_YEAR} by EOX IT Services (CC BY-NC-SA 4.0, contains modified Copernicus Sentinel data)` },
];
wire.exportLayersOn = () => layersOn();
/* Rows of the Layers box that are not part of a download, and so are not greyed: the picture itself and the 1850 outline (its own switch in the pane) */
const NOT_GREYED = new Set(['satToggle', 'oldToggle']);
const HAS_SUPPORT = id => EXPORT_LAYERS.some(l => l.id === id);

const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function prepareFlights(g, view){
  const lays = flightsShown(g); if (!lays || !view) return null;      // (no view: the frame preview, which shows the live map's flights)
  const { crop, W, H } = view, s = W / (crop.x1 - crop.x0), y0 = crop.y1 - H / s, res = 1 / s, out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const tm = z => 2 * ORIGIN / 2 ** z, rng = z => { const t = tm(z); return [Math.floor((crop.x0 + ORIGIN) / t), Math.floor((crop.x1 + ORIGIN) / t), Math.floor((ORIGIN - crop.y1) / t), Math.floor((ORIGIN - y0) / t)]; };
  for (const l of lays) {
    let z = Math.min(flightStreamZ(l), Math.max(l.minz, Math.ceil(Math.log2(TILE_M0 / res)))), [tx0, tx1, ty0, ty1] = rng(z);
    while (z > l.minz && (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 150) { z--; [tx0, tx1, ty0, ty1] = rng(z); }
    const t = tm(z), jobs = []; for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (flightHas(l, z, tx, ty)) jobs.push([tx, ty]);
    for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(async ([tx, ty]) => {
      const tile = await liveTile(l, z, tx, ty, { trim: 12 }).catch(() => null); if (!tile) return;
      ctx.drawImage(tile, Math.floor((tx * t - ORIGIN - crop.x0) * s), Math.floor((crop.y1 - (ORIGIN - ty * t)) * s), Math.ceil(t * s) + 1, Math.ceil(t * s) + 1);
    }));
  }
  const sw = L.CRS.EPSG3857.unproject(L.point(crop.x0, y0)), ne = L.CRS.EPSG3857.unproject(L.point(crop.x1, crop.y1));
  return { img: out, bounds: [[sw.lat, sw.lng], [ne.lat, ne.lng]], alpha: 1 };
}
async function prepareNames(g){
  const all = await namesData(), list = all[g.inv ? g.inv.id : g.id] || []; return list.length ? { names: list } : null;
}
async function prepareRadar(g){
  try { await loadRadar(); } catch { return null; }
  const pts = (window.GLACIER_THICKNESS || {})[g.inv.id] || []; if (!pts.length) return null;
  const ramp = Array.from({ length: 256 }, (_, i) => radarColor(i / 255 * 600).match(/\d+/g).map(Number));
  return { dots: pts, card: { title: 'Radar ice thickness', ramp, ticks: ['0 m', '200', '400', '600+'] } };
}
const rcache = new Map();      // what was prepared: key -> promise (a picture made once per glacier / year)
const once = (key, f) => rcache.get(key) || (rcache.set(key, f()), rcache.get(key));
async function prepareThickness(g){
  const img = await once('thick|' + g.id, async () => loadImg(await thicknessClipped(g))), leg = await once('thickleg', () => loadImg(`https://api3.geo.admin.ch/static/images/legends/${THICK_LAYER}_en.png`));
  if (!img) return null;
  return { img, bounds: imageFootprint(g).bounds, alpha: 0.8, card: { title: 'Ice thickness 2016 (model)', img: leg } };
}
async function prepareSpeed(g){
  const id = speedId(g), yr = speedYear(), f = id && await loadSpeedFile(id); if (!f || !f.years.includes(yr)) return null;
  const a = await speedArray(f, yr), [x0, y0, x1, y1] = f.bbox, sw = L.CRS.EPSG3857.unproject(L.point(x0, y0)), ne = L.CRS.EPSG3857.unproject(L.point(x1, y1)), mask = speedMask(f, g);
  const pk = await speedYearOk(f, yr) ? speedPeak(f, a, mask) : null, at = pk && L.CRS.EPSG3857.unproject(L.point(pk.xy[0], pk.xy[1]));
  return { img: await once(`speed|${id}|${yr}`, async () => speedCanvas(f, a, mask)), bounds: [[sw.lat, sw.lng], [ne.lat, ne.lng]], alpha: 0.9,
    pin: pk ? { at: [at.lat, at.lng], text: `${Math.round(pk.v)} m/yr (${yr})` } : null, card: { title: `Ice speed ${yr} (ITS_LIVE)`, ramp: SPEED_LUT, ticks: [`${SPEED_MIN} m/yr`, '50', '100', `${SPEED_MAX}+`] } };
}
/* The colour layers of this picture, prepared (async). The frame preview takes them from a cache and asks again when they have arrived. */
export async function prepareRasters(kind = 'image', view = null){
  const g = currentGlacier(), out = /** @type {any[]} */ ([]);
  for (const l of exportLayers(kind)) if (l.raster) { const it = await l.prepare(g, view); if (it) out.push({ ...it, id: l.id }); }
  return out;
}
let rnow = { key: '', items: [], cbs: new Set() };
export function cachedRasters(kind, redraw){
  const g = currentGlacier(), key = [g && g.id, kind, speedYear(), ...exportLayers(kind).filter(l => l.raster).map(l => l.id)].join('|');
  if (rnow.key !== key) { const me = rnow = { key, items: [], cbs: new Set() }; prepareRasters(kind).then(items => { if (rnow === me) { me.items = items; [...me.cbs].forEach(f => f()); } }); }
  if (redraw) rnow.cbs.add(redraw);      // every caller is told when the pictures have arrived
  return rnow.items;
}
export function drawExportRasters(ctx, P, items){
  (items || []).forEach(r => { if (!r.img) return; const [[s, w], [n, e]] = r.bounds, [x0, y0] = P([w, n]), [x1, y1] = P([e, s]); ctx.save(); ctx.globalAlpha = r.alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(r.img, x0, y0, x1 - x0, y1 - y0); ctx.restore(); });
}
/* A legend card (white, like the one in the Layers box): title, then the picture of the legend or a colour ramp with its ticks. Returns the y under it. */
export function drawLegendCard(ctx, x, y, c){
  const pad = 10, W = c.img ? 104 * 0.85 : c.rows ? 190 : 220;
  ctx.save(); ctx.font = '600 20px "Schibsted Grotesk", sans-serif'; const tw = ctx.measureText(c.title).width, cw = Math.max(W, tw) + 2 * pad, ch = 20 + 8 + (c.img ? 165 * 0.85 : c.rows ? c.rows.length * 24 : 34) + 2 * pad;
  ctx.fillStyle = 'rgba(255,255,255,.93)'; box(ctx, x, y, cw, ch, 10); ctx.fill();
  ctx.fillStyle = '#16232b'; ctx.textBaseline = 'top'; ctx.fillText(c.title, x + pad, y + pad);
  const by = y + pad + 28;
  if (c.img) ctx.drawImage(c.img, x + pad, by, 104 * 0.85, 165 * 0.85);
  else if (c.rows) c.rows.forEach(([col, t], i) => { ctx.fillStyle = col; ctx.fillRect(x + pad, by + i * 24 + 8, 30, 4); ctx.fillStyle = '#3b4a52'; ctx.font = '500 17px "Schibsted Grotesk", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(t, x + pad + 42, by + i * 24 + 2); });
  else {
    const g = ctx.createLinearGradient(x + pad, 0, x + pad + W, 0); c.ramp.forEach((col, i) => { if (i % 16 === 0 || i === c.ramp.length - 1) g.addColorStop(i / (c.ramp.length - 1), `rgb(${col[0]},${col[1]},${col[2]})`); });
    ctx.fillStyle = g; box(ctx, x + pad, by, W, 12, 6); ctx.fill();
    ctx.font = '500 16px "Schibsted Grotesk", sans-serif'; ctx.fillStyle = '#3b4a52';
    c.ticks.forEach((t, i) => { ctx.textAlign = i === 0 ? 'left' : i === c.ticks.length - 1 ? 'right' : 'center'; ctx.fillText(t, x + pad + W * i / (c.ticks.length - 1), by + 18); });
  }
  ctx.restore(); return y + ch;
}
export const layersOn = () => !!$('vLayers') && $('vLayers').checked;
const rowText = row => { const c = row.cloneNode(true); c.querySelectorAll('svg, input, small, .lb-i').forEach(e => e.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };      // the words of a row (the symbol drawings carry letters of their own)
const labelOf = id => { const row = $(id) && $(id).closest('label'); return row ? rowText(row) : id; };
/* The layers that will be printed now */
export function exportLayers(kind = 'image'){
  const g = currentGlacier();
  if (!g || !layersOn() || viewMode === '3d') return [];
  return EXPORT_LAYERS.filter(l => l[kind === 'video' ? 'video' : 'image'] && $(l.id) && $(l.id).checked && l.has(g));
}

/* The credits the picture owes to the background maps in it */
export const layerCredits = (kind = 'image', ys = [], rasters = null) => exportLayers(kind).filter(l => l.credit && (!l.raster || !rasters || l.native || rasters.some(r => r.id === l.id))).map(l => l.credit(ys));      // a colour layer with no picture for this year is not credited
export const hasBackground = (kind = 'image') => exportLayers(kind).some(l => l.bg);
export const overlayCards = (kind = 'image') => exportLayers(kind).filter(l => l.over && l.card).map(l => l.card);      // legend cards of the overlay tiles (trails)
export const perYearBackground = (kind = 'image') => exportLayers(kind).some(l => l.aerial);      // the background differs from picture to picture

/* Background maps: the tiles of every ticked map layer, drawn into one canvas in the picture's own Mercator frame (crop: x0, x1 and the top y1 in metres).
   The tile zoom is the one whose tiles are about as sharp as the picture (not above the layer's own finest zoom). Returns the canvas and how many tiles could not be loaded. */
const ORIGIN = 20037508.342789244, TILE_M0 = 2 * ORIGIN / 256;      // metres per pixel at zoom 0 (256 px tiles)
const tileImg = url => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => { const j = new Image(); j.crossOrigin = 'anonymous'; j.onload = () => res(j); j.onerror = () => res(null); j.src = url + (url.includes('?') ? '&' : '?') + 'r=1'; }; i.src = url; });
export async function buildBackground(crop, W, H, kind = 'image', year = null, fp = null, over = false){      // over: the overlay tiles (labels, trails) that go above the satellite image
  const layers = exportLayers(kind).filter(l => l.bg && !!l.over === over && !!l.aerial === (year != null)); if (!layers.length) return null;
  const s = W / (crop.x1 - crop.x0), y0 = crop.y1 - H / s, res = 1 / s;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  let failed = 0, total = 0;
  for (const l of layers) {
    const tpl = l.url(year); if (!tpl) continue;
    let z = Math.min(l.maxNative, Math.max(0, Math.ceil(Math.log2(TILE_M0 / res))));
    const tm = z => TILE_M0 * 256 / 2 ** z, rng = z => { const t = tm(z); return [Math.floor((crop.x0 + ORIGIN) / t), Math.floor((crop.x1 + ORIGIN) / t), Math.floor((ORIGIN - crop.y1) / t), Math.floor((ORIGIN - y0) / t)]; };
    let [tx0, tx1, ty0, ty1] = rng(z);
    while (z > 0 && (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 120) { z--; [tx0, tx1, ty0, ty1] = rng(z); }
    const t = tm(z), jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H; const lc = layer.getContext('2d'); lc.imageSmoothingEnabled = true; lc.imageSmoothingQuality = 'high';
    for (let i = 0; i < jobs.length; i += 12) await Promise.all(jobs.slice(i, i + 12).map(async ([tx, ty]) => {
      total++; const url = tpl.replace('{z}', z).replace('{x}', tx).replace('{y}', ty), img = await tileImg(url);
      if (!img) return void failed++;
      const px = (tx * t - ORIGIN - crop.x0) * s, py = (crop.y1 - (ORIGIN - ty * t)) * s, sz = t * s;
      lc.drawImage(img, Math.floor(px), Math.floor(py), Math.ceil(sz) + 1, Math.ceil(sz) + 1);
    }));
    if (l.bright) {      // same brightness as on the map, worked out on the pixels
      const d = lc.getImageData(0, 0, W, H), px = d.data;
      for (let i = 0; i < px.length; i += 4) { px[i] = Math.min(255, px[i] * l.bright); px[i + 1] = Math.min(255, px[i + 1] * l.bright); px[i + 2] = Math.min(255, px[i + 2] * l.bright); }
      lc.putImageData(d, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = l.alpha ?? 1;
    if ((l.aerial || l.clipFp) && fp) { const x = (fp.bbox[0] - crop.x0) * s, y = (crop.y1 - fp.bbox[3]) * s; ctx.beginPath(); ctx.rect(x, y, (fp.bbox[2] - fp.bbox[0]) * s, (fp.bbox[3] - fp.bbox[1]) * s); ctx.clip(); }      // only inside the picture box, as on the map
    ctx.drawImage(layer, 0, 0); ctx.restore();
  }
  return { canvas: out, failed, total };
}

/* Drawing. P maps [lng, lat] to canvas pixels, u is the size of one screen pixel in the picture (W / 1080 * 1.6). */
const box = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
function pin(ctx, x, y, u, color, text, upper){      // the ring with a label to its right, as on the map
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 15 * u, 0, 7); ctx.fillStyle = color + '40'; ctx.fill();
  ctx.lineWidth = 3 * u; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 13.5 * u, 0, 7); ctx.stroke();
  ctx.lineWidth = 2 * u; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, 16.5 * u, 0, 7); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3 * u, 0, 7); ctx.fill();
  if (text) {
    ctx.font = `700 ${(upper ? 11.5 : 12.5) * u}px "Schibsted Grotesk", sans-serif`; ctx.textBaseline = 'middle';
    const t = upper ? text.toUpperCase() : text, tw = ctx.measureText(t).width + (upper ? 0.04 * 11.5 * u * t.length : 0), w = tw + 14 * u, h = 19 * u, x0 = x + 38 * u;
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = u; ctx.fillStyle = color; box(ctx, x0, y - h / 2, w, h, 5 * u); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff'; if ('letterSpacing' in ctx) ctx.letterSpacing = upper ? `${0.04 * 11.5 * u}px` : '0px';
    ctx.fillText(t, x0 + 7 * u, y + u * 0.5); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  ctx.restore();
}
/* o: {mode 'single' | 'compare' | 'timelapse', year (the one on show), ys (the years of a slider), first (first year of an animation)}. Drawn in map-sized units, scaled up to the picture. */
export function drawExportArcs(ctx, P, W, o, kind = 'image'){
  if (!o || !exportLayers(kind).some(l => l.id === 'arcsToggle')) return;
  const g = currentGlacier(), A = arcsFor(g); if (!A) return;
  const f = W / 1080, has = y => !!A.arcs[y], RED = '#C8322A', BLUE = '#7FA6F0', PALE = '#EEF3FF', cache = {};
  const px = y => cache[y] || (cache[y] = A.arcs[y].line.map(p => { const q = P(p); return [q[0] / f, q[1] / f]; }));
  ctx.save(); ctx.scale(f, f); ctx.lineJoin = ctx.lineCap = 'round';
  if (o.mode === 'timelapse') {
    const yr = o.year, first = o.first, ys = Object.keys(A.arcs).map(Number).filter(y => y >= first && y <= yr).sort((a, b) => a - b);
    if (ys.length) {
      const sc = document.createElement('canvas'); sc.width = Math.ceil(W / f) + 1; sc.height = Math.ceil(ctx.canvas.height / f) + 1; const sx = sc.getContext('2d'); sx.fillStyle = RED;      // the bands overlap where arcs cross: drawn solid on a scratch canvas, put on the picture once
      ys.forEach(y => { if (y === first || !A.arcs[y - 1]) return; const lo = px(y - 1), up = px(y); sx.beginPath(); [...lo, ...up.slice().reverse()].forEach(([x, z], i) => i ? sx.lineTo(x, z) : sx.moveTo(x, z)); sx.closePath(); sx.fill('evenodd'); });
      ctx.save(); ctx.globalAlpha = .16; ctx.drawImage(sc, 0, 0); ctx.restore();
      ys.forEach(y => { if (y !== yr) arcStroke(ctx, px(y), PALE, y === first ? .65 : yr - y === 1 ? .6 : .3, 2.4 * .7); });
      if (has(yr)) arcEdgeFade(ctx, px(yr), RED);
      if (yr > first && has(first)) arcLabel(ctx, px(first), ys.filter(y => y !== first).flatMap(px), String(first), PALE);
    }
  } else if (o.mode === 'compare') {
    const ys = [...new Set(o.ys)].filter(has).sort((a, b) => a - b), yr = ys[ys.length - 1], others = y => ys.filter(v => v !== y).flatMap(px);
    ys.forEach(y => arcEdgeFade(ctx, px(y), y === yr ? RED : BLUE));
    ys.forEach(y => arcLabel(ctx, px(y), others(y), String(y), y === yr ? RED : BLUE));
  } else if (has(o.year)) arcEdgeFade(ctx, px(o.year), RED);
  ctx.restore();
}
export function drawExportLayers(ctx, P, u, kind = 'image', rasters = [], preview = false){
  const g = currentGlacier(), on = new Set(exportLayers(kind).map(l => l.id));
  if (on.has('newToggle')) { ctx.save(); strokeEdgeFade(ctx, newOutlineGeom(g), P, getVar('--new') || '#E5443B', u / 1.6 * 1.2); ctx.restore(); }
  if (on.has('maxToggle')) { const T = thickestSpot(g), [x, y] = P([T.at[1], T.at[0]]); pin(ctx, x, y, u, getVar('--crevasse') || '#2D6E8E', spotText(T), false); }
  rasters.forEach(r => {
    if (r.dots) r.dots.forEach(([lat, lng, m, , all]) => { const [x, y] = P([lng, lat]); ctx.beginPath(); ctx.arc(x, y, 1.5 * u, 0, 7); ctx.fillStyle = radarColor(m); ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = .85; ctx.lineWidth = (all ? 1.4 : .6) * u; ctx.strokeStyle = all ? '#C8322A' : '#fff'; ctx.stroke(); ctx.globalAlpha = 1; });
    if (r.names && !preview) {      // the labels of other glaciers, the chosen one first; one that would overlap a placed label stays out, as on the map
      const placed = []; ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      r.names.forEach(n => { const [x, y] = P([n.lo, n.la]), px = (n.self ? 9.5 : 8) * u; ctx.font = `${n.self ? 700 : 600} ${px}px "Schibsted Grotesk", sans-serif`;
        const w = ctx.measureText(n.n).width + 8 * u, h = px * 1.3, b = { x: x - w / 2, y: y - h / 2, w, h };
        if (placed.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y)) return; placed.push(b);
        ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(10,18,22,.6)'; ctx.strokeText(n.n, x, y); ctx.fillStyle = '#fff'; ctx.fillText(n.n, x, y); });
      ctx.restore();
    }
  });
  rasters.forEach(r => { if (r.pin) { const [x, y] = P([r.pin.at[1], r.pin.at[0]]); pin(ctx, x, y, u, getVar('--crevasse') || '#2D6E8E', r.pin.text, false); } });      // the fastest ice, marked like the thickest
  if (on.has('pinToggle')) { const at = tipOf(g), [x, y] = P([at[1], at[0]]); pin(ctx, x, y, u, getVar('--accent') || '#C8322A', 'Tongue', true); }
}
/* A legend line for the new outline in the header of the picture (the 1850 outline adds its own) */
export const layerLegend = (kind = 'image') => [...(exportLayers(kind).some(l => l.id === 'newToggle') ? [[getVar('--new') || '#E5443B', null, REGION.outlines.newLegend]] : []), ...(exportLayers(kind).some(l => l.id === 'arcsToggle') ? [['#C8322A', null, 'Experimental outline']] : [])];
export const hasNewOutline = (kind = 'image') => exportLayers(kind).some(l => l.id === 'newToggle');

/* The line on the frame: what the file contains, and a link to the Layers box */
const refreshSummary = () => { const t = $('vfLayersText'); if (t) t.textContent = summaryText(); };
export function summaryText(){
  if (viewMode === '3d') {      // the 3D picture draws the layers of the 3D menu as they are ticked there
    const names = [...document.querySelectorAll('#v3dLayers label.toggle')].filter(l => { const i = l.querySelector('input[type=checkbox]'); return i && i.checked && !i.disabled && l.style.display !== 'none' && !l.hidden && i.id !== 'l3Sat'; }).map(rowText);
    return names.length ? `Layers: ${names.join(', ')}` : 'No map layers';
  }
  if (!layersOn()) return 'Map layers: not included';
  const kind = videoKind(), ra = cachedRasters(kind, refreshSummary);      // a colour layer with no picture for this year (speed) is not listed
  const names = [...($('oldToggle').checked && hasOldOutline(currentGlacier()) ? [labelOf('oldToggle')] : []), ...exportLayers(kind).filter(l => !l.raster || l.native || ra.some(r => r.id === l.id)).map(l => labelOf(l.id))];
  return names.length ? `Layers: ${names.join(', ')}` : 'No map layers';
}
const videoKind = () => $('videoSheet').classList.contains('is-image') ? 'image' : 'video';

/* Greying in the Layers box while a download pane is open */
export function syncExportRows(){
  const open = !$('videoSheet').hidden && viewMode !== '3d', kind = videoKind();      // (the 3D menu is not greyed: the 3D picture draws what is ticked there)
  document.querySelectorAll('#layerbox label.toggle').forEach(row => {
    const inp = row.querySelector('input[type=checkbox]'); if (!inp || NOT_GREYED.has(inp.id) || inp.disabled && !HAS_SUPPORT(inp.id)) return;
    const l = EXPORT_LAYERS.find(x => x.id === inp.id), why = !open ? '' : !l ? 'Not in downloads yet: this layer shows on the map only.' : !l[kind] ? 'Changes with the year, so it cannot be part of an animation.' : '';
    row.classList.toggle('x-off', !!why);
    if (why) { if (row.dataset.xt === undefined) row.dataset.xt = row.title; row.title = why; }
    else if (row.dataset.xt !== undefined) { row.title = row.dataset.xt; delete row.dataset.xt; }
  });
  const line = $('vfLayersText'); if (line) line.textContent = summaryText();
}
