import { wire } from './wire.js';
import { $, COARSE, lv95 } from './01-data.js';
import { oldOutlineGeom, newOutlineGeom, eachPiece, loadOutline } from './02-glaciers.js';
import { currentGlacier, viewMode, glacierPicked } from './04-state.js';
import { map, loadSpeedFile, speedArray, speedId, SPEED_MIN, speedPopup } from './05-map.js';
import { showNotice } from './08-controls.js';
import { setMore, setLayers } from './09-phones.js';
import { stillYear } from './10-animation.js';
import { v3d, v3dCtx, currentBundle, stripOf, stripXZ, bundleId, pinLoop, LAKE_FILL } from './11-view3d.js';
// registered for the files below it in the load order (see wire.js); 11-view3d.js and 07-render.js call them through wire
Object.defineProperty(wire, 'syncPin', { get: () => syncPin, configurable: true });
Object.defineProperty(wire, 'pinArmed', { get: () => () => armed, configurable: true });
Object.defineProperty(wire, 'pinOn3', { get: () => pinOn3, configurable: true });
Object.defineProperty(wire, 'drawPin3D', { get: () => drawPin3D, configurable: true });
/* =====================================================================
   11b. Pin: one place of the glacier, its story in numbers (map dock and 3D dock)
        The visitor arms the pin button and taps the map or the terrain: the map flies to the place (3D: the camera), then a card shows what the site holds for it:
        - the ice surface of every year, read from the 3D terrain file (`surfaces` of the yearly build, bilinear at the place; only inside the 3D strip),
        - the ice left above the swissBEDROCK bed (a model) in the first and the last year,
        - the yearly surface speed of ITS_LIVE (the mean of the 3 x 3 cells around the place, as the speed popup does),
        - whether the place lies inside the oldest and the newest outline.
        Differences, thicknesses and means are computed here and labelled so; nothing is copied from a source that does not state it.
        One pin at a time, kept for the glacier it was set on; the same pin is drawn on the map and in 3D.
   ===================================================================== */
let pin = null, gen = 0, armed = false, shownYear = null, marker = null;      // pin: {lat, lng, gid, data}; armed: the next tap sets the pin
const TAP = COARSE ? 'Tap' : 'Click', LIFT = 0.75;
const f1 = v => v.toFixed(1), fm = v => Math.round(v).toLocaleString('en'), sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const yrOf = el => { const m = /(\d{4})/.exec((el && el.textContent) || ''); return m ? m[1] : ''; };

/* ---------- the data of a place ---------- */
function insideGeom(geom, lng, lat){            // even-odd over the closed rings; null for a line geometry (ice-cap outlets): it cannot say
  if (!geom || geom.type === 'MultiLineString') return null;
  let k = false; eachPiece(geom, pts => { for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) k = !k; } });
  return k;
}
async function placeData(g, lat, lng){
  await loadOutline(g);
  const P = L.CRS.EPSG3857.project(L.latLng(lat, lng)), out = {elev: null, speed: null, inOld: insideGeom(oldOutlineGeom(g), lng, lat), inNew: insideGeom(newOutlineGeom(g), lng, lat)};
  const at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue, b = at ? await currentBundle(g, at).catch(() => null) : null;
  if (b) {
    const S = stripOf(b, g), q = stripXZ(S, P.x, P.y);
    if (q.inside) {
      const W = b.nB + 1, len = S.up + S.back, fx = Math.min(b.nB, Math.max(0, (q.x + S.half) / (2 * S.half) * b.nB)), fz = Math.min(b.nA, Math.max(0, (q.z + S.up) / len * b.nA));
      const i = Math.min(b.nB - 1, Math.floor(fx)), j = Math.min(b.nA - 1, Math.floor(fz)), ax = fx - i, az = fz - j, node = Math.round(fz) * W + Math.round(fx);
      const at2 = a => (a[j * W + i] * (1 - ax) + a[j * W + i + 1] * ax) * (1 - az) + (a[(j + 1) * W + i] * (1 - ax) + a[(j + 1) * W + i + 1] * ax) * az;      // bilinear, as gridAt() in 11-view3d.js
      const yl = b.yearly, rows = b.surfaces ? yl.years.map((y, k) => ({y, s: at2(b.surfaces.get(y)), date: (yl.dates || [])[k] || '', kind: (yl.kind || [])[k] || '', lake: !!(b.lake && b.lake.get(y)[node] === 1)}))
        : [{y: b.dem && b.dem.new ? b.dem.new.year : null, s: at2(b.heights), date: '', kind: '', lake: false}];
      out.elev = {rows, bed: b.bed ? at2(b.bed) : null, swiss: !!(yl && yl.swiss), clean: !!(yl && yl.clean), id: bundleId(g)};
    }
  }
  const f = FEATURES.speed !== false ? await loadSpeedFile(speedId(g)) : null;
  if (f) {
    const [x0, , , y1] = f.bbox, c0 = Math.floor((P.x - x0) / f.cell), r0 = Math.floor((y1 - P.y) / f.cell);
    if (c0 >= 0 && c0 < f.w && r0 >= 0 && r0 < f.h) {
      const arrs = await Promise.all(f.years.map(y => speedArray(f, y)));
      const vals = arrs.map(a => { let n = 0, t = 0; for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) if (r >= 0 && r < f.h && c >= 0 && c < f.w && a[r * f.w + c] !== f.nodata) { n++; t += a[r * f.w + c] * f.step; } return n ? t / n : null; });      // as speedClick() in 05-map.js
      if (vals.some(v => v !== null && v >= SPEED_MIN)) out.speed = {years: f.years, vals};
    }
  }
  return out;
}

/* ---------- setting and clearing ---------- */
const PIN_SVG = '<svg viewBox="0 0 28 38" aria-hidden="true"><path d="M14 37C14 37 2 22.5 2 13.5a12 12 0 0 1 24 0C26 22.5 14 37 14 37z" fill="#C8322A" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="4.6" fill="#fff"/></svg>';
function placeMarker(){
  if (marker) { map.removeLayer(marker); marker = null; }
  if (!pin) return;
  marker = L.marker([pin.lat, pin.lng], {icon: L.divIcon({className: '', html: `<div class="pin-mark"><i class="pin-pulse"></i>${PIN_SVG}</div>`, iconSize: [28, 38], iconAnchor: [14, 37]}), interactive: false, keyboard: false, zIndexOffset: 900}).addTo(map);
}
export async function setPin(lat, lng, from3d){
  const g = currentGlacier(); if (!g) return;
  const run = ++gen; disarm();
  if (innerWidth <= 720) { setMore(false); setLayers(false); }      // phones: the pin was armed from the opened tools; fold them, so the dock is low and the card has room under the pin
  pin = {lat, lng, gid: g.id, data: null}; placeMarker(); syncButtons(); hideCard(); map.closePopup(speedPopup); pinLoop();
  const dataP = placeData(g, lat, lng).catch(e => { console.error('pin', e); return {elev: null, speed: null, inOld: null, inNew: null}; });
  const flight = new Promise(res => {      // the auto-zoom (map) or the camera flight (3D); the card comes when it is over
    if (viewMode === '3d' && v3d && v3dCtx) {
      const c = v3dCtx, P = L.CRS.EPSG3857.project(L.latLng(lat, lng)), q = stripXZ(c.S, P.x, P.y);
      if (!q.inside) return res();
      v3d.focusPoint(q.x, q.z, {dist: Math.min(v3d.getCam().dist, 2200), ms: 1100, lift: innerWidth <= 720 ? LIFT : 0}); setTimeout(res, 1100);      // phones: the card covers the lower half, so the pin is lifted into the upper half
    } else {
      const z = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), 15)), done = () => { clearTimeout(t); map.off('moveend', done); res(); }, t = setTimeout(done, 1600);
      const off = innerWidth <= 720 ? map.getSize().y * .24 : 0, ctr = off ? map.unproject(map.project([lat, lng], z).add([0, off]), z) : L.latLng(lat, lng);      // phones: the card covers the lower part, so the pin stands in the upper part
      map.once('moveend', done); map.flyTo(ctr, z, {duration: 1.1});
    }
  });
  const [data] = await Promise.all([dataP, flight]); if (run !== gen || !pin) return;
  pin.data = data; renderCard(true);
}
export function clearPin(){ gen++; pin = null; placeMarker(); syncButtons(); hideCard(); pinLoop(); }
function arm(){
  if (!glacierPicked || !currentGlacier()) return showNotice('Choose a glacier first.');
  armed = true; syncButtons(); $('app').classList.add('pinning');
  const h = $('pinHint'), host = viewMode === '3d' ? $('v3d') : $('stage'); if (h.parentNode !== host) host.appendChild(h);      // the hint bar of the measuring tools, on the face on show
  $('pinHintText').textContent = viewMode === '3d' ? `${TAP} the terrain to drop a pin.` : `${TAP} the map to drop a pin.`; h.classList.add('show');
}
function disarm(){ armed = false; syncButtons(); $('app').classList.remove('pinning'); $('pinHint').classList.remove('show'); }
$('pinCancel').onclick = () => disarm();
function syncButtons(){ ['pinBtn', 'v3mPin'].forEach(id => { const b = $(id); if (b) { b.setAttribute('aria-pressed', armed); b.classList.toggle('placed', !!pin); } }); }      // .placed: a pin stands, the button shows it
$('pinBtn').onclick = () => armed ? disarm() : arm();
$('v3mPin').onclick = () => armed ? disarm() : arm();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && armed) disarm(); });
map.on('click', e => { if (armed && viewMode !== '3d') setPin(e.latlng.lat, e.latlng.lng, false); });
{ let down = null;      // 3D: a tap (not a drag) on the terrain sets the pin, as the measuring tools do
  const skip = e => e.target.closest && e.target.closest('button, a, input, .layerbox, .v3d-measure, .v3d-sect, .pin-card, .pin-hint, .v3d-div');
  $('v3d').addEventListener('pointerdown', e => { down = armed && !skip(e) ? {x: e.clientX, y: e.clientY, t: performance.now()} : null; });
  $('v3d').addEventListener('pointerup', e => {
    const d0 = down; down = null; if (!d0 || !armed || !v3d || !v3dCtx) return;
    if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 8 || performance.now() - d0.t > 600) return;
    const r = $('v3dCanvas').getBoundingClientRect(), p = v3d.pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (!p) return showNotice('Tap on the terrain, inside the picture.');
    const [mx, my] = v3dCtx.S.merc(-p[1], p[0]), ll = L.CRS.EPSG3857.unproject(L.point(mx, my));      // the scene's x is across (b), z is -along (a)
    setPin(ll.lat, ll.lng, true);
  });
}

/* ---------- the card ---------- */
function hideCard(){ const c = $('pinCard'); c.hidden = true; c.classList.remove('in'); $('pinTip').hidden = true; }
function hostCard(){            // the card lives on the face of the stage on show: the map, or the 3D view lying over it
  const c = $('pinCard'), host = viewMode === '3d' ? $('v3d') : $('stage'); if (c.parentNode !== host) host.appendChild(c);
  placeCard();
}
export function placeCard(){            // above the dock of the face on show, never taller than the room above it
  const c = $('pinCard'); if (c.hidden) return;
  const host = c.parentNode, dock = viewMode === '3d' ? $('v3dMeasure') : document.querySelector('.mapbar'); if (!host || !dock) return;
  const hr = host.getBoundingClientRect(), dr = dock.getBoundingClientRect(), bottom = Math.max(12, hr.bottom - dr.top + 10);
  const room = hr.height - bottom - 64, phone = innerWidth <= 720;      // phones: about two fifths of the picture, so the pin stays in sight and the top of the graph shows, hinting at more below (the card scrolls)
  c.style.bottom = bottom + 'px'; c.style.maxHeight = Math.max(160, phone ? Math.min(room, hr.height * .42) : room) + 'px';
}
addEventListener('resize', () => placeCard());
export function syncPin(viewChanged){            // the view, the glacier or the year changed
  if (pin && (!currentGlacier() || pin.gid !== currentGlacier().id)) return clearPin();      // a pin belongs to the glacier it was set on
  if (armed && viewChanged) disarm();
  if (!pin || !pin.data) return;
  hostCard();
  if (stillYear() !== shownYear) renderCard(false);
}
export const pinOn3 = () => !!(pin || armed);

function lineChart(rows, W, now){            // the ice surface of every year: line over a soft area, the loss since the first year shaded red under its level
  const n = rows.length, ml = 44, mr = 64, mt = 16, mb = 20, H = 156, pw = W - ml - mr, ph = H - mt - mb;
  const s = rows.map(r => r.s), lo0 = Math.min(...s), hi0 = Math.max(...s), span = Math.max(8, hi0 - lo0), lo = lo0 - span * .12, hi = hi0 + span * .18;
  const X = i => ml + (n > 1 ? i / (n - 1) : .5) * pw, Y = v => mt + (hi - v) / (hi - lo) * ph;
  const step = [1, 2, 5, 10, 20, 50, 100].find(st => (hi - lo) / st <= 4) || 200, ticks = []; for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) ticks.push(e);
  const pts = rows.map((r, i) => `${f1(X(i))},${f1(Y(r.s))}`).join(' '), base = mt + ph, s0 = rows[0].s, d = rows[n - 1].s - s0;
  let svg = `<defs><linearGradient id="pinIceG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--crevasse)" stop-opacity=".26"/><stop offset="1" stop-color="var(--crevasse)" stop-opacity="0"/></linearGradient>
    <clipPath id="pinBelow"><rect x="${ml}" y="${f1(Y(s0))}" width="${pw}" height="${f1(Math.max(0, base - Y(s0)))}"/></clipPath></defs>`;
  svg += ticks.map(e => `<line x1="${ml}" x2="${ml + pw}" y1="${f1(Y(e))}" y2="${f1(Y(e))}" stroke="var(--rule-2)"/><text x="${ml - 6}" y="${f1(Y(e) + 3.5)}" text-anchor="end" class="pc-ax">${fm(e)}</text>`).join('');
  const every = n > 9 && pw / n < 30 ? 2 : 1;
  svg += rows.map((r, i) => (i % every && i !== n - 1) ? '' : `<text x="${f1(X(i))}" y="${H - 5}" text-anchor="middle" class="pc-ax${r.y === now ? ' now' : ''}">${pw / n < 34 ? "'" + String(r.y).slice(2) : r.y}</text>`).join('');
  if (n > 1) {
    svg += `<polygon class="pc-area" points="${f1(X(0))},${base} ${pts} ${f1(X(n - 1))},${base}" fill="url(#pinIceG)"/>`;
    svg += `<polygon class="pc-loss" clip-path="url(#pinBelow)" points="${f1(X(0))},${f1(Y(s0))} ${pts} ${f1(X(n - 1))},${f1(Y(s0))}" fill="var(--loss)" fill-opacity=".16"/>`;
    svg += `<line x1="${ml}" x2="${ml + pw}" y1="${f1(Y(s0))}" y2="${f1(Y(s0))}" stroke="var(--moraine)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/><text x="${ml + 4}" y="${f1(Y(s0) - 4)}" class="pc-ax">${rows[0].y} level</text>`;
    svg += `<polyline class="pc-line" pathLength="1" points="${pts}" fill="none" stroke="var(--crevasse)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  svg += rows.map((r, i) => `<circle class="pc-dot" style="animation-delay:${(300 + i * 55)}ms" cx="${f1(X(i))}" cy="${f1(Y(r.s))}" r="${r.y === now ? 5 : 3}" fill="${r.lake ? LAKE_FILL : r.y === now ? 'var(--crevasse)' : '#fff'}" stroke="${r.y === now ? '#fff' : 'var(--crevasse)'}" stroke-width="${r.y === now ? 2 : 1.6}"/>`).join('');
  if (n > 1) svg += `<text x="${f1(X(n - 1) + 9)}" y="${f1(Y(rows[n - 1].s) + 1)}" class="pc-end${d < 0 ? ' loss' : ''}">${sgn(d)} m</text><text x="${f1(X(n - 1) + 9)}" y="${f1(Y(rows[n - 1].s) + 13)}" class="pc-ax">since ${rows[0].y}</text>`;
  svg += `<g class="pc-hv" pointer-events="none"></g><rect class="pc-hit" x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent"/>`;
  return {svg, W, H, X, Y, n, mt, ph};
}
function columnChart(t0, t1, y0, y1){            // the ice column at the place: what is left above the model bed, what went since the first year
  const H = 156, W = 74, mt = 16, mb = 30, ph = H - mt - mb, top = Math.max(t0, t1, 1), Yc = v => mt + ph - v / top * ph, x = 18, w = 38, lost = t0 - t1;
  const id = 'pinHatch';
  let svg = `<defs><pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--loss)" fill-opacity=".12"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--loss)" stroke-width="1.6" stroke-opacity=".7"/></pattern></defs>`;
  svg += `<rect x="${x - 6}" y="${mt + ph}" width="${w + 12}" height="7" rx="2" fill="#A39F96"/>`;      // the bed
  if (t1 > 0.5) svg += `<rect class="pc-col" x="${x}" y="${f1(Yc(t1))}" width="${w}" height="${f1(mt + ph - Yc(t1))}" rx="3" fill="#CFE5F0" stroke="var(--crevasse)" stroke-width="1.4"/>`;
  if (lost > 0.5) svg += `<rect class="pc-col lost" x="${x}" y="${f1(Yc(t0))}" width="${w}" height="${f1(Yc(Math.max(0, t1)) - Yc(t0))}" rx="3" fill="url(#${id})" stroke="var(--loss)" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  svg += `<text x="${x + w / 2}" y="${H - 15}" text-anchor="middle" class="pc-ax">bed</text><text x="${x + w / 2}" y="${H - 3}" text-anchor="middle" class="pc-ax">(model)</text>`;
  if (lost > 0.5) svg += `<text x="${x + w / 2}" y="${f1(Yc(t0) - 4)}" text-anchor="middle" class="pc-end loss sm">−${fm(lost)} m</text>`;
  if (t1 > 0.5) { const hIce = mt + ph - Yc(t1), yl = hIce > 22 ? Yc(t1) + hIce / 2 + 4 : Yc(t1) - (lost > 0.5 ? 18 : 4); svg += `<text x="${x + w / 2}" y="${f1(yl)}" text-anchor="middle" class="pc-end sm ice">${fm(t1)} m</text>`; }      // inside the ice when it is tall enough
  return `<svg class="pc-colsvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ice above the model bed: ${fm(t0)} m in ${y0}, ${fm(Math.max(0, t1))} m in ${y1} (computed)"><title>Ice above the swissBEDROCK bed (a model): ${fm(t0)} m in ${y0}, ${fm(Math.max(0, t1))} m in ${y1}. Computed here.</title>${svg}</svg>`;
}
function speedChart(sp, W, now){
  const H = 62, mb = 14, n = sp.years.length, step = W / n, bw = Math.min(14, Math.max(3, step * .5)), mx = Math.max(...sp.vals.filter(v => v !== null));
  return `<svg class="pc-speed" viewBox="0 0 ${W} ${H}" role="img" aria-label="Surface speed at the pin per year: ${sp.years.map((y, i) => `${y} ${sp.vals[i] === null ? 'no value' : Math.round(sp.vals[i]) + ' m/yr'}`).join(', ')}">` + sp.years.map((y, i) => {
    const v = sp.vals[i], h = v === null ? 0 : Math.max(1.5, v / mx * (H - mb - 6)), x = i * step + (step - bw) / 2;
    return `<g class="pc-bar${y === now ? ' now' : ''}"><title>${y}: ${v === null ? 'no value' : Math.round(v) + ' m/yr'}</title><rect x="${f1(i * step)}" y="0" width="${f1(step)}" height="${H}" fill="transparent"/>${v === null ? '' : `<rect class="b" style="animation-delay:${200 + i * 35}ms" x="${f1(x)}" y="${f1(H - mb - h)}" width="${f1(bw)}" height="${f1(h)}" rx="2"/>`}<text x="${f1(i * step + step / 2)}" y="${H - 2}" text-anchor="middle" class="pc-ax${y === now ? ' now' : ''}">${n > 10 && i % 2 && y !== now ? '' : "'" + String(y).slice(2)}</text></g>`;
  }).join('') + '</svg>';
}
function renderCard(fresh){
  const c = $('pinCard'), g = currentGlacier(); if (!pin || !pin.data || !g) return;
  const D = pin.data, E = D.elev, rows = E && E.rows.filter(r => Number.isFinite(r.s)), now = stillYear(); shownYear = now;
  const flat = !!(rows && rows.length > 1 && Math.max(...rows.map(r => r.s)) - Math.min(...rows.map(r => r.s)) < 0.05);      // the yearly surfaces only move on ice: the same height in every year is rock or ground
  const wasHidden = c.hidden; c.hidden = false; hostCard();
  const W = Math.max(260, Math.min(520, c.clientWidth - 24)), first = rows && rows[0], last = rows && rows[rows.length - 1];
  const t = r => E && E.bed !== null && r ? r.s - E.bed : null, t0 = t(first), t1 = t(last), hasCol = t0 !== null && (t0 > 0.5 || t1 > 0.5);
  const gone = hasCol && t0 > 0.5 && t1 <= 0.5 ? rows.find(r => t(r) <= 0.5) : null;
  const spNow = D.speed ? (() => { let k = D.speed.years.indexOf(now); if (k < 0 || D.speed.vals[k] === null) { for (k = D.speed.vals.length - 1; k >= 0 && D.speed.vals[k] === null; k--); } return k >= 0 ? {y: D.speed.years[k], v: D.speed.vals[k]} : null; })() : null;
  /* tiles */
  const tiles = [];
  if (rows && rows.length > 1 && !flat) { const d = last.s - first.s; tiles.push(`<div class="pc-tile"><span>Since ${first.y}</span><b class="${d < 0 ? 'loss' : ''}">${sgn(d)} m</b><small>computed, ${f1(Math.abs(d) / (last.y - first.y))} m/yr on average</small></div>`); }
  if (rows && rows.length) tiles.push(`<div class="pc-tile"><span>Elevation${last.y ? ' ' + last.y : ''}</span><b>${fm(last.s)} m</b><small>ice surface, m a.s.l.</small></div>`);
  if (gone) tiles.push(`<div class="pc-tile"><span>Ice here</span><b class="loss">gone by ${gone.y}</b><small>surface at the model bed (computed)</small></div>`);
  else if (hasCol) tiles.push(`<div class="pc-tile"><span>Ice left ${last.y}</span><b class="ice">${fm(Math.max(0, t1))} m</b><small>above the model bed (computed)</small></div>`);
  if (spNow) tiles.push(`<div class="pc-tile"><span>Ice speed ${spNow.y}</span><b class="ice">${Math.round(spNow.v)} m/yr</b><small>ITS_LIVE, mean of 3 × 3 cells</small></div>`);
  /* place line */
  const ch = E && E.swiss ? lv95(pin.lng, pin.lat) : null, where = ch ? `LV95 ${ch[0].toLocaleString('en').replace(/,/g, ' ')} / ${ch[1].toLocaleString('en').replace(/,/g, ' ')}` : `${pin.lat.toFixed(4)}° N, ${pin.lng.toFixed(4)}° E`;
  const ol = [D.inOld === null ? '' : `${D.inOld ? 'inside' : 'outside'} the ${yrOf($('oldLabel')) || 'oldest'} outline`, D.inNew === null ? '' : `${D.inNew ? 'inside' : 'outside'} the ${yrOf($('newLabel')) || 'newest'} outline`].filter(Boolean).join(', ');
  /* charts */
  let body = '';
  const cW = hasCol && W > 330 ? W - 82 : W, lc = rows && rows.length > 1 && !flat ? lineChart(rows, cW, now) : null;
  if (lc) body += `<div class="pc-sec"><div class="pc-h">Ice surface, m a.s.l.</div><div class="pc-row"><svg class="pc-line-svg" viewBox="0 0 ${lc.W} ${lc.H}" role="img" aria-label="Ice surface at the pin per year: ${rows.map(r => `${r.y} ${fm(r.s)} m`).join(', ')}">${lc.svg}</svg>${hasCol && W > 330 ? columnChart(Math.max(0, t0), t1, first.y, last.y) : ''}</div></div>`;
  else if (flat) body += `<p class="pc-msg">No ice here in ${first.y}–${last.y}: the yearly surfaces change only on the glacier, and this place keeps the same height in every year.</p>`;
  else if (rows && rows.length) body += `<p class="pc-msg">One elevation model for this glacier: ${fm(rows[0].s)} m a.s.l. here. No yearly surfaces.</p>`;
  else body += `<p class="pc-msg">${E === null ? 'Outside the 3D strip of this glacier: the yearly ice surfaces cover the strip along the tongue (switch to 3D to see it).' : ''}</p>`;
  if (D.speed) body += `<div class="pc-sec"><div class="pc-h">Ice speed, m/yr <small>ITS_LIVE, ${D.speed.years[0]}–${D.speed.years[D.speed.years.length - 1]}</small></div>${speedChart(D.speed, W, spNow ? spNow.y : now)}</div>`;      // the year of the speed tile is the one marked
  if (!lc && !D.speed && !(rows && rows.length)) body += `<p class="pc-msg">No yearly elevation or speed here.</p>`;
  const src = E && rows && rows.length > 1 ? (E.clean ? `Ice surface of each year on the day of the picture: a model fitted to the dated elevation models of the glacier (swisstopo flights and lidar, swissALTI3D) with the GLAMOS mass balance; exact only on the days and cells a survey covers. <a href="provenance.html?id=${encodeURIComponent(E.id)}" target="_blank" rel="noopener">Field notes</a>.` : E.swiss ? 'Ice surface of each year from the yearly surfaces of the 3D terrain file (swissALTI3D-based model).' : 'Ice surface of each year from ArcticDEM strips (PGC), as in the 3D view.') : '';
  const about = [src, hasCol ? 'Ice left: the surface minus the swissBEDROCK bed (swisstopo; swissALTI3D minus a modelled ice thickness, GLAMOS 2020), computed here. A model, not a measurement.' : '', D.speed ? 'Speed: yearly mean surface speed of ITS_LIVE (NASA MEaSUREs, version 2.1), the mean of the 3 × 3 cells of 120 m around the pin, computed here.' : '', rows && rows.some(r => r.lake) ? 'Teal dots: a lake at the pin in that year.' : '', 'Differences and averages are computed here from these data.'].filter(Boolean).map(s => `<li>${s}</li>`).join('');
  const open = !!(c.querySelector('details') || {}).open;
  $('pinBody').innerHTML = `<div class="pc-hd"><span class="pc-ico">${PIN_SVG}</span><b>Pin</b><span class="pc-where">${where}</span><span class="pc-ex">${E && E.clean ? `<a class="pc-fn" href="provenance.html?id=${encodeURIComponent(E.id)}#area" target="_blank" rel="noopener" title="How the ice surface of this glacier was made: the scientific field notes">Field notes ↗</a>` : ''}<button type="button" id="pinCsv" title="Download the numbers of this place as a CSV table">CSV</button></span><button type="button" class="pc-x" id="pinClose" aria-label="Remove the pin" title="Remove the pin">×</button></div>
    ${tiles.length ? `<div class="pc-tiles">${tiles.join('')}</div>` : ''}${body}
    <div class="pc-ft">${ol ? `<div>${ol[0].toUpperCase() + ol.slice(1)}.</div>` : ''}<details${open ? ' open' : ''}><summary>About these numbers</summary><ul>${about}</ul></details></div>`;
  if (fresh || wasHidden) { c.classList.remove('in', 'still'); void c.offsetWidth; c.classList.add('in'); } else c.classList.add('still');      // the entrance plays once; a new year only moves the highlight
  $('pinClose').onclick = clearPin;
  $('pinCsv').onclick = () => saveCsv(g, D);
  placeCard();
  if (lc) bindHover(c.querySelector('.pc-line-svg'), rows, lc);
}
function bindHover(svg, rows, lc){            // crosshair and a small table at the nearest year
  const tip = $('pinTip'), hv = svg.querySelector('.pc-hv'), hit = svg.querySelector('.pc-hit');
  const off = () => { hv.innerHTML = ''; tip.hidden = true; };
  const move = e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * lc.W, i = Math.max(0, Math.min(lc.n - 1, Math.round((x - lc.X(0)) / ((lc.X(lc.n - 1) - lc.X(0)) || 1) * (lc.n - 1)))), q = rows[i];
    hv.innerHTML = `<line x1="${f1(lc.X(i))}" x2="${f1(lc.X(i))}" y1="${lc.mt}" y2="${lc.mt + lc.ph}" stroke="var(--rock)" stroke-width="1" opacity=".35"/><circle cx="${f1(lc.X(i))}" cy="${f1(lc.Y(q.s))}" r="5.5" fill="var(--crevasse)" stroke="#fff" stroke-width="2"/>`;
    const dPrev = i ? q.s - rows[i - 1].s : null, d0 = q.s - rows[0].s;
    tip.innerHTML = `<b>${q.y}</b>${q.date ? `<small>${q.date}</small>` : ''}<span>Surface <em>${fm(q.s)} m</em></span>${dPrev !== null ? `<span>vs ${rows[i - 1].y} <em class="${dPrev < 0 ? 'loss' : ''}">${sgn(dPrev)} m</em></span>` : ''}${i ? `<span>vs ${rows[0].y} <em class="${d0 < 0 ? 'loss' : ''}">${sgn(d0)} m</em></span>` : ''}${q.lake ? '<span>Lake at the pin</span>' : ''}${q.kind ? `<small>${q.kind}</small>` : ''}`;
    tip.hidden = false;
    const card = $('pinCard').getBoundingClientRect(), px = r.left - card.left + lc.X(i) / lc.W * r.width, py = r.top - card.top + lc.Y(q.s) / lc.H * r.height;
    tip.style.left = Math.max(4, Math.min(card.width - tip.offsetWidth - 4, px - tip.offsetWidth / 2)) + 'px'; tip.style.top = Math.max(4, py - tip.offsetHeight - 12) + 'px';
  };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move); hit.addEventListener('pointerleave', off);
}
function saveCsv(g, D){
  const E = D.elev, rows = E ? E.rows : [], sp = D.speed, years = [...new Set([...rows.map(r => r.y), ...(sp ? sp.years : [])].filter(y => y !== null))].sort((a, b) => a - b);
  const ch = E && E.swiss ? lv95(pin.lng, pin.lat) : null;
  const out = [`# ${g.name || g.id}: pin at ${pin.lat.toFixed(6)} N, ${pin.lng.toFixed(6)} E${ch ? `, LV95 ${ch[0]} / ${ch[1]}` : ''}`, '# surface_m: ice surface of the year from the 3D terrain file; bed_model_m: swissBEDROCK (model); change and thickness columns are computed here; speed_m_yr: ITS_LIVE v2.1, mean of 3 x 3 cells (computed here)', '# tonguesfromspace.org, non-commercial use (see the Sources list)',
    'year,surface_m,change_since_first_m,bed_model_m,ice_above_bed_m,lake,speed_m_yr'];
  years.forEach(y => { const r = rows.find(q => q.y === y), k = sp ? sp.years.indexOf(y) : -1, v = k >= 0 ? sp.vals[k] : null;
    out.push([y, r ? r.s.toFixed(1) : '', r && rows[0] ? (r.s - rows[0].s).toFixed(1) : '', E && E.bed !== null ? E.bed.toFixed(1) : '', r && E && E.bed !== null ? Math.max(0, r.s - E.bed).toFixed(1) : '', r ? (r.lake ? 1 : 0) : '', v === null ? '' : v.toFixed(1)].join(',')); });
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([out.join('\n') + '\n'], {type: 'text/csv'}));
  a.href = url; a.download = `tonguesfromspace-${g.id}-pin.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- 3D: the pin on the terrain (called every frame by pinLoop in 11-view3d.js) ---------- */
let placedAt = 0;
export function drawPin3D(ctx, c, viewer, w, h, u){
  if (performance.now() - placedAt > 300) { placedAt = performance.now(); placeCard(); }      // the 3D dock settles after the view opens (timeline row, folding): the card follows it
  if (!pin || pin.gid !== c.g.id) return;
  const P = L.CRS.EPSG3857.project(L.latLng(pin.lat, pin.lng)), q = stripXZ(c.S, P.x, P.y); if (!q.inside) return;
  const [p] = viewer.projectAt([[q.x, viewer.groundY(q.x, q.z) + 2, q.z, true]], w, h, null, null); if (!p || !p[2]) return;
  const [x, y] = p, t = performance.now() / 1000;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, 7 * u, 2.6 * u, 0, 0, 2 * Math.PI); ctx.fill();      // shadow
  const k = (t % 1.8) / 1.8; ctx.strokeStyle = `rgba(200,50,42,${(1 - k) * .7})`; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.ellipse(x, y, (6 + 22 * k) * u, (2.2 + 8 * k) * u, 0, 0, 2 * Math.PI); ctx.stroke();      // the pulse on the ground
  const k2 = 1.15 * u;      // the location pin of the map (PIN_SVG: teardrop, white edge, white dot), its point on the ground
  ctx.save(); ctx.translate(x - 14 * k2, y - 37 * k2); ctx.scale(k2, k2);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 5 * u; ctx.fillStyle = '#C8322A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  const tear = new Path2D('M14 37C14 37 2 22.5 2 13.5a12 12 0 0 1 24 0C26 22.5 14 37 14 37z'); ctx.fill(tear); ctx.shadowBlur = 0; ctx.stroke(tear);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(14, 13.5, 4.6, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  const E = pin.data && pin.data.elev, rows = E && E.rows.filter(rr => Number.isFinite(rr.s));
  if (rows && rows.length > 1 && Math.max(...rows.map(rr => rr.s)) - Math.min(...rows.map(rr => rr.s)) >= 0.05) {      // no label off the ice (the same height every year)
    const d = rows[rows.length - 1].s - rows[0].s, text = `${sgn(d)} m since ${rows[0].y}`;
    ctx.font = `600 ${12 * u}px "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif`; const tw = ctx.measureText(text).width, px = 7 * u, hh = 21 * u, ty = y - 39 * k2 - 6 * u - hh;
    ctx.fillStyle = '#1C2A33'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - tw / 2 - px, ty, tw + 2 * px, hh, 5 * u) : ctx.rect(x - tw / 2 - px, ty, tw + 2 * px, hh); ctx.fill();
    ctx.fillStyle = d < 0 ? '#FF8A80' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, ty + hh / 2 + 0.5 * u);
  }
  ctx.restore();
}
