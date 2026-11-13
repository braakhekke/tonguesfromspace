import { wire } from './wire.js';
import { YEARS, $, COARSE, lv95f } from './01-data.js';
import { Cog, renderMapTile } from './cog.js';
import { DATA, hasOldOutline, oldOutlineGeom, newOutlineGeom, eachPiece, GLACIERS } from './02-glaciers.js';
import { prefs, savePrefs, isLandsat, landsatName, LANDSAT_CREDIT, styleLine, ASSETS, asset, imageFootprint, restoreLatest, imageHere, capLevel, capWaiting, capWantsFine, capCheckFine, loadImage, sideStyle, setLoading, fmtDM, latestBusy } from './03-imagery.js';
import { state, okYears, currentGlacier, viewMode, glacierPicked } from './04-state.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'map', { get: () => map, configurable: true });
Object.defineProperty(wire, 'oldestPair', { get: () => oldestPair, configurable: true });
Object.defineProperty(wire, 'restoreOldest', { get: () => restoreOldest, configurable: true });
/* =====================================================================
   5. Map
   ===================================================================== */
export const TWO_FINGER = matchMedia('(pointer:coarse)').matches;   // touch screens: one finger scrolls the page, two move the map
export const map = L.map('map', {zoomControl:false, attributionControl:false, minZoom:8, maxZoom:17, zoomSnap:0.25, zoomDelta:0.5, wheelPxPerZoomLevel:120, dragging: !TWO_FINGER});      // fine zoom steps: quarter levels, half a level per button press
[['bgPane',205],['siA',207],['siB',208],['siT',209],['flightsPane',235],['thickPane',300],['speedPane',310],['paneA',210],['paneB',220],['paneT',230],['outlines',430],['sightPane',440],['labels',450],['measure',620]].forEach(([n,z]) => {
  map.createPane(n); map.getPane(n).style.zIndex = z;
});
export let arcLayer = null;      // the experimental tongue arcs (canvas layer), null when off
map.getPane('bgPane').style.filter = 'brightness(1.12) saturate(1)';   // background a little brighter than the plain tiles
map.getPane('labels').style.pointerEvents = 'none';
/* The scale bar: a white bar with a tick at each end and its length written centred above, the same as the scale bar of the map key on the downloads. It sits where Leaflet's own scale sat (same class, so the
   margins of the toolbar rules still apply). */
export const NiceScale = L.Control.extend({
  options: {position: 'bottomright', maxPx: 150},
  onAdd(map){
    const el = L.DomUtil.create('div', 'leaflet-control-scale tfs-scale'); this._el = el;
    el.innerHTML = '<div class="ts-labels"><span class="ts-l1"></span></div><div class="ts-bar"></div>';
    L.DomEvent.disableClickPropagation(el); this._map = map; map.on('move zoom resize', this._update, this); map.whenReady(this._update, this); return el;      // the map has no view yet while the page loads
  },
  onRemove(map){ map.off('move zoom resize', this._update, this); },
  _update(){
    const map = this._map; if (!map._loaded) return;
    const y = map.getSize().y, a = map.containerPointToLatLng([0, y - 1]), b = map.containerPointToLatLng([this.options.maxPx, y - 1]), maxM = a.distanceTo(b);
    if (!(maxM > 0)) return;
    const pow = 10 ** Math.floor(Math.log10(maxM)), r = maxM / pow, m = (r >= 5 ? 5 : r >= 2 ? 2 : 1) * pow, px = Math.round(m / maxM * this.options.maxPx);      // 1, 2 or 5 times a power of ten
    const fmt = v => v >= 1000 ? `${+(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`, el = this._el;
    el.querySelector('.ts-bar').style.width = px + 'px'; el.querySelector('.ts-labels').style.width = px + 'px';
    el.querySelector('.ts-l1').textContent = fmt(m);
  }
});
export const scaleCtl = new NiceScale().addTo(map);
/* On bigger screens the scale bar sits beside the LAYERS button (to its left, level with it, wherever that button is for the mode); on phones it stays at the bottom right. */
export function placeScale(){
  const el = scaleCtl._el, lb = document.getElementById('layerbox'), st = document.getElementById('stage'); if (!el || !lb || !st) return;
  const desk = matchMedia('(min-width:721px) and (min-height:521px)').matches && lb.offsetWidth > 0;
  if (!desk) { if (el.parentNode === st) { map._controlCorners.bottomright.appendChild(el); el.classList.remove('at-layers'); el.style.top = el.style.right = ''; } return; }
  if (el.parentNode !== st) st.appendChild(el);
  el.classList.add('at-layers');
  el.style.top = (lb.offsetTop + 12) + 'px'; el.style.right = (st.clientWidth - lb.offsetLeft + 38) + 'px';      // room for the last label, which is centred on the end of the bar, and a clear gap to the button
}
{ const lb = document.getElementById('layerbox'), st = document.getElementById('stage'), re = new ResizeObserver(() => placeScale()); re.observe(lb); re.observe(st);
  new MutationObserver(() => placeScale()).observe(document.getElementById('app'), {attributes: true, attributeFilter: ['class']}); addEventListener('resize', placeScale); placeScale(); }

export function syncSatLabel(yrs){      // the satellite row of the layer menus names the sensor that is on show: Landsat for a Landsat year
  const ys = (yrs || (state.mode === 'compare' ? [state.a, state.b] : [tlLayers[state.frame] ? tlLayers[state.frame].yr : state.one])).filter(Boolean), n = ys.filter(y => isLandsat(state.available[y])).length;
  const names = [...new Set(ys.filter(y => isLandsat(state.available[y])).map(y => landsatName(state.available[y])))].join(' / ');      // e.g. Landsat 5
  const txt = !n ? 'Sentinel-2 image' : n === ys.length ? `${names} image` : `Sentinel-2 / ${names} image`;
  ['satLabel', 'l3SatLabel'].forEach(id => { const e = document.getElementById(id); if (e && e.textContent !== txt) e.textContent = txt; });
}
export function updateCredits(){
  syncSatLabel();
  if (typeof viewMode !== 'undefined' && viewMode === '3d' && typeof wire.updateCredits3D === 'function') return wire.updateCredits3D();      // the 3D view names its sources in the same bar
  const yrs = state.mode !== 'compare'
    ? (tlLayers[state.frame] ? [tlLayers[state.frame].yr] : [])
    : [...new Set([state.a, state.b].filter(y => state.available[y]))].sort();
  const sat = document.getElementById('satToggle').checked;
  const s2Yrs = yrs.filter(y => !isLandsat(state.available[y])), lsYrs = yrs.filter(y => isLandsat(state.available[y]));      // Landsat years (Iceland, before 2016) are credited to the USGS
  const parts = s2Yrs.length && sat ? [`Contains modified Copernicus Sentinel data ${s2Yrs.join(' and ')}, processed via the <a href="https://dataspace.copernicus.eu" target="_blank" rel="noopener">Copernicus Data Space Ecosystem</a>`] : [];
  if (lsYrs.length && sat) parts.push(`${lsYrs.join(' and ')}: ${LANDSAT_CREDIT}`);
  if (!FEATURES.swisstopo && document.getElementById('aerialToggle').checked && state.oldestAerial) parts.push(`Aerial image ${flownYear(currentGlacier(), state.oldestAerial) || state.oldestAerial}: <a href="https://gatt.lmi.is" target="_blank" rel="noopener">Náttúrufræðistofnun Íslands</a> and Landmælingar Íslands (CC BY 4.0)`);
  else if (document.getElementById('aerialToggle').checked && aerialYears().length) parts.push(`Aerial images: SWISSIMAGE ${[...new Set(aerialYears().map(siYear))].map(ed => ed + (flownYear(glacierPicked ? currentGlacier() : null, ed) ? ` (flown ${flownYear(currentGlacier(), ed)})` : '')).join(' and ')} © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>`);
  { const fe = flightsShown(); if (fe) parts.push(flightsCredit(fe)); }
  if (document.getElementById('mosaicToggle').checked) parts.push(`Background: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless ${BG_YEAR}</a> by EOX IT Services (CC BY-NC-SA 4.0, contains modified Copernicus Sentinel data)`);
  if (document.getElementById('osmToggle').checked) parts.push('Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
  if (document.getElementById('topoToggle').checked) parts.push('Map © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>');
  if (document.getElementById('oldMapToggle').checked && mapYears() && mapYears().oldest) parts.push('Map ' + mapYears().oldest + ' © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a> (Journey through time)');
  if (document.getElementById('trailsToggle').checked) parts.push((FEATURES.swisstopo ? 'Hiking trails © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>' : 'Paths © OpenStreetMap contributors') + (sightLayer ? ` (line of sight: own calculation from ${REGION.sightDem || 'swissALTI3D'})` : ''));
  if (FEATURES.swisstopo && document.getElementById('altiToggle').checked) parts.push('Hillshade: swissALTI3D © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>');
  if (document.getElementById('labelsToggle').checked) parts.push('Labels © OpenStreetMap contributors, EOX');
  if (document.getElementById('namesToggle').checked && map.hasLayer(namesLayer)) parts.push('Other glacier names: <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (CC0), Randolph Glacier Inventory 6.0 via <a href="https://www.glims.org/RGI/" target="_blank" rel="noopener">GLIMS</a>');
  if (document.getElementById('swissAllToggle').checked && map.hasLayer(swissAllLayer)) parts.push('All Swiss glaciers: Swiss Glacier Inventory SGI2023, GLAMOS (CC BY 4.0), outlines simplified');
  if (arcLayer) parts.push('Experimental outline: own experiment, outlines of the lowest 2 km modelled from Sentinel-2 pictures (GlaViTU), smoothed by 20 m; not official outlines');
  if (outlineLayers.old || outlineLayers.new) parts.push(REGION.outlines.html || 'Outlines GLAMOS (CC BY 4.0)');
  if (document.getElementById('thickToggle').checked) parts.push('Ice thickness (modelled, state around 2016): Grab et al. 2021, GLAMOS, via <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>');
  if (maxMarker) parts.push('Thickest ice: ' + (thickestSpot(currentGlacier()).kind === 'model' ? 'Grab et al. 2021, <a href="https://doi.org/10.3929/ethz-b-000434697" target="_blank" rel="noopener">SwissGlacierThickness-R2020</a> (CC BY 4.0)' : '<a href="https://doi.org/10.18750/icethickness.2020.r2020" target="_blank" rel="noopener">GLAMOS</a> radar (CC BY 4.0)'));
  if (speedLayer) parts.push('Ice speed: <a href="https://its-live.jpl.nasa.gov" target="_blank" rel="noopener">ITS_LIVE</a> annual mosaics of image pair velocities v2.1, NASA MEaSUREs (CC BY 4.0)');
  if (radarLayer) parts.push('Radar ice thickness: <a href="https://doi.org/10.18750/icethickness.2020.r2020" target="_blank" rel="noopener">GLAMOS</a> (CC BY 4.0)');
  if (typeof wire.svActive === 'function' && wire.svActive()) parts.push('Street View © <a href="https://www.google.com/maps" target="_blank" rel="noopener">Google</a>');
  document.getElementById('credits').innerHTML = parts.join(' · ');
}
(function(){ const c = document.getElementById('credits');
  new MutationObserver(() => { const l = document.getElementById('creditsLive'); if (l) l.innerHTML = c.innerHTML; }).observe(c, {childList: true, subtree: true, characterData: true});      // the credits of the picture are listed in the Sources block, not in a bar on the picture
  const t = () => c.classList.toggle('open'); c.onclick = e => { if (e.target.tagName !== 'A') t(); };
  c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } }; })();
/* Deep space: the calm backdrop where no base map shows. A dark blue gradient, many small faint stars, a soft Milky Way band and nebula glows.
   Everything comes from a fixed seed, so every frame, picture and visit looks the same. */
export const spaceCache = new Map();
export function spaceCanvas(w, h, perStar = 20000, scale = 1){
  const key = `${w}x${h}|${perStar}|${scale}`; if (spaceCache.has(key)) return spaceCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), m = Math.min(w, h);
  let seed = 20261009; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04070d'); g.addColorStop(1, '#0a1426'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const glow = (cx, cy, r, rgb, a) => { const q = x.createRadialGradient(cx, cy, 0, cx, cy, r); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = q; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
  glow(w * .22, h * .28, w * .55, '84,72,170', .11); glow(w * .84, h * .72, w * .5, '38,110,170', .10); glow(w * .5, h * .5, w * .4, '60,70,120', .05);
  // the Milky Way: a soft diagonal band with many tiny stars
  x.save(); x.translate(w / 2, h / 2); x.rotate(-0.38);
  const band = x.createLinearGradient(0, -h * .22, 0, h * .22); band.addColorStop(0, 'rgba(150,170,230,0)'); band.addColorStop(.5, 'rgba(150,170,230,.055)'); band.addColorStop(1, 'rgba(150,170,230,0)');
  x.fillStyle = band; x.fillRect(-w, -h * .22, 2 * w, h * .44);
  for (let i = 0, n = Math.round(w * h / perStar * 1.6); i < n; i++) {
    const px = (rnd() - .5) * w * 1.5, py = (rnd() + rnd() + rnd() - 1.5) * h * .2, a = 0.12 + rnd() * 0.35;
    x.fillStyle = `rgba(215,226,255,${a.toFixed(2)})`; x.fillRect(px, py, .9 * scale, .9 * scale);
  }
  x.restore();
  for (let i = 0, n = Math.round(w * h / perStar); i < n; i++) {         // the stars
    const px = rnd() * w, py = rnd() * h, k = rnd(), bright = k > .975, big = k > .88, r = (0.4 + Math.pow(rnd(), 4) * 1.0) * scale * (bright ? 2.8 : big ? 1.7 : 1), a = bright ? 0.9 : 0.2 + rnd() * 0.5;
    if (big) glow(px, py, r * (bright ? 7 : 5), '190,210,255', bright ? .3 : .18);
    if (bright) { x.strokeStyle = 'rgba(225,235,255,.45)'; x.lineWidth = .8 * scale; x.beginPath(); x.moveTo(px - r * 4, py); x.lineTo(px + r * 4, py); x.moveTo(px, py - r * 4); x.lineTo(px, py + r * 4); x.stroke(); }      // the brightest few get a little cross
    x.fillStyle = `rgba(215,226,255,${a.toFixed(2)})`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  spaceCache.set(key, c); return c;
}
export const mapEl = document.getElementById('map');
mapEl.style.backgroundImage = `url(${spaceCanvas(1600, 1000, 1000).toDataURL('image/png')})`;
mapEl.style.backgroundSize = 'cover'; mapEl.style.backgroundPosition = 'center'; mapEl.style.backgroundRepeat = 'no-repeat';
export const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:17, maxNativeZoom:19, attribution:'© OpenStreetMap contributors'});
if (prefs.osm === true) osm.addTo(map);
/* swisstopo's colour topographic map (Pixelkarte farbe), free to use with a source reference */
export const topo = L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
  {maxZoom:17, maxNativeZoom:18, attribution:'© swisstopo'});
if (prefs.topo === true) topo.addTo(map);
/* swisstopo's oldest map at the chosen glacier: the "Journey through time" layer (ch.swisstopo.zeitreihen, time = the year of the map) in the oldest year that has a map over the whole picture box, and the year of
   the map the site shows now (the newest sheet of the 1:25,000 map there, ch.swisstopo.pixelkarte-pk25.metadata), both from data/swisstopo-maps.json (scripts/build_oldest_map.py). The years are the service's. */
export const swisstopoMaps = {};      // site id -> {oldest, current, datenstand, releasekey, sheet}
export const swisstopoMapsFile = fetch(asset('data/swisstopo-maps.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => { Object.assign(swisstopoMaps, j); return j; });
export const mapYears = () => (glacierPicked && swisstopoMaps[currentGlacier().id]) || null;
export let oldMap = null;
export function updateMapYears(){      // the year(s) into the labels of both menus, and the layer in the year of the chosen glacier
  const y = mapYears(), old = y && y.oldest;
  const tl = 'swisstopo map', ol = old ? 'swisstopo map ' + old : 'swisstopo map';
  [['topoLabel', tl], ['l3TopoLabel', tl], ['oldMapLabel', ol], ['l3OldMapLabel', ol]].forEach(([id, s]) => { const el = document.getElementById(id); if (el) el.textContent = s; });
  const on = document.getElementById('oldMapToggle'); if (!on) return;
  on.title = old ? '' : 'Choose a glacier to see its oldest swisstopo map';
  if (oldMap && (!old || !on.checked || oldMap._year !== old)) { map.removeLayer(oldMap); oldMap = null; }
  if (on.checked && old && !oldMap) { oldMap = L.tileLayer(`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.zeitreihen/default/${old}1231/3857/{z}/{x}/{y}.png`, {maxZoom: 17, maxNativeZoom: 18, attribution: '© swisstopo'}); oldMap._year = old; oldMap.addTo(map); }
}
/* swisstopo's relief shading of the swissALTI3D elevation model */
export const alti = L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissalti3d-reliefschattierung/default/current/3857/{z}/{x}/{y}.png',
  {maxZoom:17, maxNativeZoom:18, attribution:'© swisstopo (swissALTI3D)'});
if (prefs.alti === true) alti.addTo(map);
/* swisstopo's hiking trails (swissTLM3D), just the trails, as a transparent overlay on the imagery. They are drawn only inside the image area of the glacier (the red box);
   tiles that lie wholly outside it are not even fetched. The tiles come one zoom level finer and are shown at half size, so the lines are half as thick. */
export const TrailsLayer = L.TileLayer.extend({
  _clip: null,            // null until the first glacier choice: the whole tile is drawn, then the layer is redrawn clipped
  setClip(list){ this._clip = list; if (this._map) this.redraw(); },
  createTile(coords, done){
    const size = this.getTileSize(), tile = document.createElement('canvas'), k = 256 / size.x;
    tile.width = tile.height = 256; tile.style.width = size.x + 'px'; tile.style.height = size.y + 'px';
    const origin = coords.scaleBy(size), rects = (this._clip || [L.latLngBounds([-90, -180], [90, 180])]).map(b => { const a = this._map.project(b.getNorthWest(), coords.z).subtract(origin), c = this._map.project(b.getSouthEast(), coords.z).subtract(origin);
      return { x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(size.x, c.x), y1: Math.min(size.y, c.y) }; }).filter(r => r.x1 > r.x0 && r.y1 > r.y0);
    if (!rects.length) { setTimeout(() => done(null, tile)); return tile; }
    const img = new Image();
    img.onload = () => { const ctx = tile.getContext('2d'); ctx.beginPath(); rects.forEach(r => ctx.rect(r.x0 * k, r.y0 * k, (r.x1 - r.x0) * k, (r.y1 - r.y0) * k)); ctx.clip(); ctx.drawImage(img, 0, 0, 256, 256); done(null, tile); };
    let tries = 0;
    img.onerror = () => { if (++tries <= 3) setTimeout(() => { img.src = this.getTileUrl(coords) + (tries ? '?r=' + tries : ''); }, 600 * tries); else done(null, tile); };      // a phone on a weak connection: ask again a few times before leaving the tile empty
    img.src = this.getTileUrl(coords);
    return tile;
  }
});
/* Iceland has no trail tiles: its footpaths and tracks are lines (OpenStreetMap, data/trails-is.js), drawn by this layer with the same switch and legend: footpaths yellow, tracks red */
export const TrailsVector = L.LayerGroup.extend({
  setClip(){ if (this._map) this.draw(); },            // the lines are cut to the picture area already; another glacier: its lines
  onAdd(m){ L.LayerGroup.prototype.onAdd.call(this, m); this.draw(); },
  draw(){
    this.clearLayers(); if (!glacierPicked) return;
    ensureSight().then(() => { const d = trailsFor(currentGlacier()); if (!d || !this._map) return; this.clearLayers();
      const mk = (list, color, w) => list.forEach(l => L.polyline(l, {pane: 'labels', color, weight: w, opacity: .95, interactive: false, lineJoin: 'round'}).addTo(this));
      mk(d.tracks, '#FF0000', 2); mk(d.paths, '#FDC200', 3); });
  }
});
export const trails = FEATURES.swisstopo ? new TrailsLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png',
  {pane:'labels', tileSize:128, zoomOffset:1, maxZoom:17, maxNativeZoom:17, opacity:.9, attribution:'Hiking trails © swisstopo'}) : new TrailsVector();
export const trailsFor = g => { const d = (window.GLACIER_TRAILS || {})[g && wire.bundleId(g)]; return d && (d.paths.length || d.tracks.length) ? d : null; };      // Iceland: the footpaths and tracks of an outlet
/* Where on the hiking trails the glacier tongue is in view of a person 1.7 m tall (sightline.js, made by scripts/build_sightline.py): a white outline under the trail lines */
export let sightTried = false, sightLoad = null;
export const ensureSight = () => sightLoad || (sightLoad = new Promise(res => {      // the file (Switzerland: sightline.js, all glaciers, 135 kB; Iceland: trails-is.js) is fetched when the trails are on, not at the start; everyone who asks waits for the same load
  if (window.GLACIER_SIGHT) { sightTried = true; return res(); }
  sightTried = true;
  const files = [].concat(REGION.trailsFile); let left = files.length;      // one file, or several (Vatnajökull: Breiðamerkurjökull has its own)
  files.forEach(f => { const sc = document.createElement('script'); sc.src = asset(f); sc.onload = sc.onerror = () => { if (--left === 0) res(); }; document.head.appendChild(sc); });
}));
export const sightFor = g => { const d = (window.GLACIER_SIGHT || {})[g && wire.bundleId(g)]; return d && d.lines && d.lines.length ? d : null; };      // violet with a white edge: the trails are yellow, red and blue, and the pictures hold hardly any violet
export let sightLayer = null;
export function updateSight(){
  if (sightLayer) { map.removeLayer(sightLayer); sightLayer = null; }
  if (!window.GLACIER_SIGHT && document.getElementById('trailsToggle').checked) { ensureSight().then(() => { updateSight(); if (viewMode === '3d') { wire.sync3DMenu(); wire.refresh3D(); } }); return; }      // the file is on its way: the layer is drawn when it arrives
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked, d = picked ? sightFor(currentGlacier()) : null, on = document.getElementById('trailsToggle').checked && !!d;
  document.getElementById('sightLegend').hidden = !on;
  if (!on) { const w = document.getElementById('trailsWhy'); w.hidden = true; const b = document.querySelector('#sightLegend .lb-i'); if (b) b.setAttribute('aria-expanded', 'false'); }      // the explanation goes with the band
  if (on) sightLayer = L.layerGroup([['#fff', 8, .95]].flatMap(([color, weight, opacity]) => d.lines.map(l => L.polyline(l, {pane: 'sightPane', color, weight, opacity, lineCap: 'round', lineJoin: 'round', interactive: false})))).addTo(map);      // a white outline around the trail line
}
export let trailClipKey = '';
export function updateTrailClip(){          // the selected glacier's image area; before one is chosen, the ten image areas of the overview
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked, list = picked ? [currentGlacier()] : GLACIERS, key = picked ? state.glacier : '*';
  if (key === trailClipKey) return; trailClipKey = key;
  trails.setClip(list.map(g => L.latLngBounds(imageFootprint(g).bounds)));
}
if (prefs.trails === true) trails.addTo(map);
/* The map's place labels are raster tiles, so one label cannot be switched off. The blue glacier names that EOX writes along the Aletsch glacier lie over its tongue: inside the Aletsch picture
   box, the tiles are redrawn with the area of every blue (glacier name) label wiped. Other tiles are plain. If the tile cannot be read pixel by pixel (no CORS), it is shown as it is. */
export const HIDE_LABELS = ['B36-26', 'aletsch'];
export const LabelsLayer = L.TileLayer.extend({
  createTile(coords, done){
    const size = this.getTileSize(), origin = coords.scaleBy(size), boxes = GLACIERS.filter(g => HIDE_LABELS.includes(g.id)).map(g => L.latLngBounds(imageFootprint(g).bounds));
    const rects = boxes.map(b => { const a = this._map.project(b.getNorthWest(), coords.z).subtract(origin), c = this._map.project(b.getSouthEast(), coords.z).subtract(origin);
      return {x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(size.x, c.x), y1: Math.min(size.y, c.y)}; }).filter(r => r.x1 > r.x0 && r.y1 > r.y0);
    if (!rects.length) return L.TileLayer.prototype.createTile.call(this, coords, done);
    const tile = document.createElement('canvas'), k = 256 / size.x, img = new Image(); tile.width = tile.height = 256; tile.style.width = size.x + 'px'; tile.style.height = size.y + 'px';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = tile.getContext('2d'); ctx.drawImage(img, 0, 0, 256, 256);
      try {
        rects.forEach(r => {
          const x = Math.floor(r.x0 * k), y = Math.floor(r.y0 * k), w = Math.ceil((r.x1 - r.x0) * k), h = Math.ceil((r.y1 - r.y0) * k), d = ctx.getImageData(x, y, w, h).data;
          let x0 = w, y0 = h, x1 = -1, y1 = -1;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60 && d[i + 2] > d[i] + 50 && d[i + 2] > d[i + 1] + 10) { const px = (i / 4) % w, py = Math.floor(i / 4 / w); if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
          if (x1 >= 0) ctx.clearRect(x + x0 - 4, y + y0 - 4, x1 - x0 + 9, y1 - y0 + 9);
        });
      } catch {}      // a tile that cannot be read stays as it is
      done(null, tile);
    };
    img.onerror = () => { const plain = new Image(); plain.onload = () => { tile.getContext('2d').drawImage(plain, 0, 0, 256, 256); done(null, tile); }; plain.onerror = () => done(null, tile); plain.src = this.getTileUrl(coords); };      // no CORS: the plain picture
    img.src = this.getTileUrl(coords);
    return tile;
  }
});
export const labels = new LabelsLayer('https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png',
  {pane:'labels', maxNativeZoom:16, maxZoom:17, opacity:.9, attribution:'Labels © OpenStreetMap contributors, rendering EOX'}).addTo(map);

export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/* ---------- background: one static Sentinel-2 mosaic for the whole region (EOX Sentinel-2 cloudless; Switzerland 2024) ---------- */
export const BG_YEAR = (REGION.background && REGION.background.mosaicYear) || 2024;      // the mosaic year of the region (Iceland: 2025)
export const bgTiles = L.tileLayer(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${BG_YEAR}_3857/default/g/{z}/{y}/{x}.jpg`,
  {pane:'bgPane', maxNativeZoom:14, maxZoom:17, attribution:`Sentinel-2 cloudless ${BG_YEAR} by EOX`});
export function setBackground(){
  const on = document.getElementById('mosaicToggle').checked;
  if (on && !map.hasLayer(bgTiles)) bgTiles.addTo(map);
  if (!on && map.hasLayer(bgTiles)) map.removeLayer(bgTiles);
  updateCredits();
}
/* ---------- swisstopo aerial images (SWISSIMAGE), by year ----------
   Shown only inside the image box of the chosen glacier (the TrailsLayer clip), under the Sentinel-2 pictures. One layer per picture slot: compare uses the years of the left and right
   side (panes siA and siB, clipped by the slider like the satellite panes), a timelapse the newest year of its range, one year its year. The time dimension of
   ch.swisstopo.swissimage-product is the edition year; 2025 is the newest, later years show 2025. */
export const SI_LAST = 2025;
export const aerial = {A: null, B: null, T: null};      // slot -> {yr, layer}
export const siYear = y => Math.min(y, SI_LAST);
export function aerialWanted(){          // slot -> year
  return document.getElementById('aerialToggle').checked ? aerialSlots() : {};
}
export function aerialSlots(){          // slot -> year, whether the layer is on or not
  if (state.mode === 'compare') return state.oldestAerial ? {[state.oldestSide === 'b' ? 'B' : 'A']: state.oldestAerial} : {A: state.a, B: state.b};
  if (state.mode === 'single') return {T: state.oldestAerial || state.one};
  const f = tlFrames(); return {T: f.length ? f[f.length - 1] : state.to};      // timelapse: the newest year of the range
}
/* SWISSIMAGE editions are mosaics: the edition year (the time dimension of the layer) is not the year the photographs were taken. swisstopo's metadata layer says which year was flown
   at a place (edition 2025 here: flown 2023, 2022: 2020, 2019: 2017, 2016: 2014). It is asked once per glacier and edition, and the viewer names that year. */
export const aerialFlown = new Map();      // "<glacier>|<edition>" -> "2023" (empty while unknown)
export const flownYear = (g, ed) => (g && aerialFlown.get(g.id + '|' + ed)) || '';
export function ensureFlown(g, ed){
  const key = g.id + '|' + ed; if (aerialFlown.has(key)) return; aerialFlown.set(key, '');
  const [[s, w], [n, e]] = imageFootprint(g).bounds, lat = (s + n) / 2, lon = (w + e) / 2;
  fetch(`https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&layers=all:ch.swisstopo.swissimage-product.metadata&mapExtent=${lon - .01},${lat - .01},${lon + .01},${lat + .01}&imageDisplay=500,500,96&tolerance=1&sr=4326&timeInstant=${ed}&returnGeometry=false`)
    .then(r => r.json()).then(j => {
      const ys = [...new Set((j.results || []).map(r => r.attributes && r.attributes.flightyear).filter(Boolean))].sort();
      if (!ys.length) return; aerialFlown.set(key, ys.join(' / '));
      updateAerial(); wire.updateTags(); if (tlLayers.length) showFrame(state.frame); wire.retitle3D();
    }).catch(() => {});
}
/* "Oldest" in the specials row: the oldest SWISSIMAGE edition that covers the glacier's image box. The identify service lists, without a time, every aerial survey at a place
   (flightyear = the year flown, bgdi_flugjahr = the edition that first shows it); the oldest edition is asked once per glacier, at the middle of the box. */
export const oldestAerial = new Map();      // glacier id -> {ed, flown} | null (none) ; absent while not asked
/* Iceland: the oldest picture is one static file (data/oldest/<outlet>.webp, scripts/build_oldest_iceland.py): the historic aerial mosaics of 1980 and 1982 of Náttúrufræðistofnun Íslands, in Web Mercator over the picture box */
export function ensureOldestIs(g){
  fetch(asset(`data/oldest/${g.id}.json`)).then(r => r.ok ? r.json() : null).then(m => {
    if (!m) { oldestAerial.set(g.id, null); return; }
    aerialFlown.set(`${g.id}|${m.years[0]}`, m.label);      // the name of the year in the tags and the menu: 1980/82
    oldestAerial.set(g.id, {ed: m.years[0], flown: m.label, img: asset(`data/oldest/${g.id}.webp`), bbox: m.bbox, source: m.source});
  }).catch(() => oldestAerial.delete(g.id)).then(() => { if (typeof wire.renderYears === 'function') wire.renderYears(); if (state.checked && !latestBusy && g.id === state.glacier && typeof wire.statusLine === 'function') wire.setStatus(wire.statusLine()); });
}
export const oldestWhat = o => FEATURES.swisstopo ? `swisstopo SWISSIMAGE edition ${o.ed}, flown ${o.flown}${o.coverage === 'glacier' ? ' (covers the whole glacier, not the whole picture box)' : ''}` : `aerial mosaic of ${o.flown} (Náttúrufræðistofnun Íslands)`;      // the words for the oldest picture of a region
/* Switzerland: the oldest SWISSIMAGE edition that covers the WHOLE glacier (and the whole picture box where it does), found by scripts/build_oldest_aerial.py from a grid of points over the box and over the
   outline (data/oldest-aerial.json, keyed by the site id). Only a glacier that file does not hold is asked live, at the middle of its box (that edition can leave the edges of the box blank). */
let oldestAerialFile = null;
const oldestFile = () => oldestAerialFile || (oldestAerialFile = fetch(asset('data/oldest-aerial.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})));
export function ensureOldest(g){
  if (!g || oldestAerial.has(g.id)) return; oldestAerial.set(g.id, undefined);
  if (!FEATURES.swisstopo) return ensureOldestIs(g);
  oldestFile().then(f => {
    const o = f[g.id];
    if (!o || !o.ed) return ensureOldestLive(g);
    aerialFlown.set(`${g.id}|${o.ed}`, o.flown);      // the year(s) flown, as the tags and the menu name the edition
    oldestAerial.set(g.id, {ed: +o.ed, flown: o.flown, coverage: o.coverage, zoom: o.zoom, clip: o.clip});      // zoom: the finest tile level that has a picture over the whole glacier; clip: where the picture is shown
    if (typeof wire.renderYears === 'function') wire.renderYears(); if (state.checked && !latestBusy && g.id === state.glacier && typeof wire.statusLine === 'function') wire.setStatus(wire.statusLine());
  });
}
function ensureOldestLive(g){
  const [[s, w], [n, e]] = imageFootprint(g).bounds, lat = (s + n) / 2, lon = (w + e) / 2;
  fetch(`https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&layers=all:ch.swisstopo.swissimage-product.metadata&mapExtent=${lon - .01},${lat - .01},${lon + .01},${lat + .01}&imageDisplay=500,500,96&tolerance=1&sr=4326&returnGeometry=false`)
    .then(r => r.json()).then(j => {
      const rows = (j.results || []).map(r => r.attributes).filter(a => a && a.bgdi_flugjahr && a.flightyear);
      if (!rows.length) { oldestAerial.set(g.id, null); return; }
      const first = rows.reduce((a, b) => (b.bgdi_flugjahr < a.bgdi_flugjahr ? b : a));
      oldestAerial.set(g.id, {ed: +first.bgdi_flugjahr, flown: +first.flightyear});
    }).catch(() => oldestAerial.delete(g.id)).then(() => { if (typeof wire.renderYears === 'function') wire.renderYears(); if (state.checked && !latestBusy && g.id === state.glacier && typeof wire.statusLine === 'function') wire.setStatus(wire.statusLine()); });
}
export function showOldest(side = state.oldestSide){            // the oldest aerial image alone on the map (and as the picture of the 3D view): the Sentinel-2 picture goes off for the time being; in the slider it is the picture of the chosen side ('a' left/top, 'b' right/bottom)
  const o = oldestAerial.get(state.glacier); if (!o) return;
  if (state.mode !== 'compare' || state.latestSide === side) restoreLatest();      // in the slider the latest scene stays on the other side
  state.oldestSide = side;
  if (!state.oldestAerial) state.oldestSaved = {sat: $('satToggle').checked, aerial: $('aerialToggle').checked};
  state.oldestAerial = o.ed; state.oldestMode = state.mode;
  if (state.mode === 'compare') { $('aerialToggle').checked = true; $('aerialToggle').dispatchEvent(new Event('change')); wire.refreshAll(); wire.setStatus(wire.statusLine()); return; }      // the slider keeps the Sentinel-2 picture for its other side
  if (!state.available[state.one]) { const ys = YEARS.filter(y => state.available[y]); if (ys.length) state.one = ys[ys.length - 1]; }      // the 3D view needs a year with a scene under it
  $('satToggle').checked = false; applySatVisibility(); updateCredits();      // not through the checkbox's handler: that would be remembered as a choice
  $('aerialToggle').checked = true; $('aerialToggle').dispatchEvent(new Event('change'));
  wire.refreshAll(); wire.setStatus(wire.statusLine());
}
export function restoreOldest(){
  if (!state.oldestAerial) return;
  const s = state.oldestSaved || {sat: true, aerial: false}; state.oldestAerial = null; state.oldestSaved = null;
  $('satToggle').checked = s.sat; $('aerialToggle').checked = s.aerial; applySatVisibility(); $('aerialToggle').dispatchEvent(new Event('change')); updateCredits(); wire.setStatus(wire.statusLine());
}
export const aerialYears = () => [...new Set(Object.values(aerialWanted()).filter(Boolean))].sort();
/* ---------- Special flights imagery (swisstopo Spezialbefliegungen), one year at a time ----------
   One picture per year and glacier (data/special-flights/<id>.json + .webp in Web Mercator, scripts/build_special_flights.py): RGB (or, for a year without RGB, near-infrared) orthophotos of the flights that touch
   the SGI 2023 outline, no rapid-mapping mosaics. The switch "Special flights" is in the layer menu of the map and of the 3D view, in One year only. LOCAL TRIAL, nine of the ten Swiss glaciers (Zmutt has no file: no flight meets the selection rule, see the ledger): the terms of use of the collection were read on 2026-11-06 (source reference mandatory; ledger docs/sources/switzerland-spezialbefliegungen.md). */
let flightsIndex = null;      // the glaciers that have a data/special-flights file (written by scripts/build_special_flights.py), read once
const flightIds = () => flightsIndex || (flightsIndex = fetch(asset('data/special-flights/index.json')).then(r => r.ok ? r.json() : []).catch(() => []));
export const flightsData = new Map();      // glacier id -> {years: {...}} | null (none, or not loaded yet)
export function ensureFlights(g){
  const id = g && g.inv && g.inv.id; if (!id || flightsData.has(g.id)) return; flightsData.set(g.id, null);
  flightIds().then(ids => ids.includes(id) ? fetch(asset(`data/special-flights/${id}.json`)).then(r => r.ok ? r.json() : null) : null).then(m => { if (m && m.years) { flightsData.set(g.id, m); updateFlights(); if (typeof wire.sync3DMenu === 'function') wire.sync3DMenu(); } }).catch(() => {});
}
export const flightsEntry = (g, yr) => { const m = g && flightsData.get(g.id); return m && m.years[yr] ? m.years[yr] : null; };
export const flightsOn = () => document.getElementById('flightsToggle').checked && state.mode === 'single';
export const flightsOff = new Set();      // ids of the flights switched off in the dock (not remembered)
export const flightsNir = new Set();      // ids of the flights whose near-infrared layer is switched on in the dock
const flightIdx = (o, minz, maxz) => o._idx || (o._idx = (() => { const m = new Map(); for (let z = minz; z <= maxz; z++) { const sh = maxz - z, set = new Set(); o.tiles.forEach(([x, y]) => set.add((x >> sh) + ',' + (y >> sh))); m.set(z, set); } return m; })());
export const flightHas = (l, z, x, y) => { if (z > l.maxz) { const sh = z - l.maxz; z = l.maxz; x >>= sh; y >>= sh; } const set = l.idx.get(z); return !!set && set.has(x + ',' + y); };      // above the zoom of the list a tile belongs to its parent      // does the layer have this tile (the files only exist where the flight has data)?
export function flightsShown(g = glacierPicked ? currentGlacier() : null){      // the layers on show (map and 3D), in the order they are painted (natural colour first, near infrared over it), or null
  const m = g && flightsOn() ? flightsData.get(g.id) : null, e = m && flightsEntry(g, state.one); if (!e) return null;
  const mk = (f, o, nir) => ({key: f.id + (nir ? ':nir' : ''), id: f.id, dir: o.dir, date: f.date, nir, tiles: o.tiles, bbox: o.bbox, idx: flightIdx(o, m.minzoom, m.maxzoom), minz: m.minzoom, maxz: m.maxzoom, sgi: g.inv.id, cogs: nir ? o.cogs : f.cogs, stretch: nir ? o.stretch : null});
  const l = e.flights.filter(f => !flightsOff.has(f.id)).map(f => mk(f, f, false)).concat(e.flights.filter(f => f.nir && flightsNir.has(f.id)).map(f => mk(f, f.nir, true)));
  return l.length ? l : null;
}
export const flightsCredit = l => `Special flights imagery ${[...new Set(l.map(f => f.date))].join(' and ')}: © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a> (Spezialbefliegungen)`;
const flightName = f => `${fmtDM(f.date)}${f.time ? ' ' + f.time : ''}`;
const cogs = new Map();      // href (and stretch) -> Cog (read through range requests)
const cogFor = (l, c) => { const k = c.href + (l.stretch ? '|nir' : ''); if (!cogs.has(k)) cogs.set(k, new Cog(c.href, {stretch: l.stretch})); return cogs.get(k); };
export const flightStreamZ = l => l.cogs && l.cogs[0] && l.cogs[0].gsd ? Math.min(21, Math.round(Math.log2(107950 / l.cogs[0].gsd))) : 20;      // the zoom whose ground pixel matches the picture (107950 = metres per pixel at zoom 0 times cos 46.4 degrees)
let flightFailT = 0;
function flightLoadFailed(){      // a tile of the flights could not be read from swisstopo: say so on the viewer (at most once in 30 s, whether the map, the 3D view or a picture asks)
  const now = Date.now(); if (now - flightFailT < 30000) return; flightFailT = now;
  wire.showNotice('Special flights imagery could not be loaded completely (swisstopo did not answer). Some of it may be missing; try again in a moment.');
}
export async function liveTile(l, z, x, y, opt){      // one 256 px tile of a layer, cut live from its file(s) at swisstopo (a near-infrared layer has one file per flight line, drawn in turn); null where there is nothing
  const parts = await Promise.all(l.cogs.map(c => renderMapTile(cogFor(l, c), z, x, y, lv95f, opt).catch(() => { flightLoadFailed(); return null; }))), got = parts.filter(Boolean); if (!got.length) return null;
  if (got.length === 1) return got[0]; const out = document.createElement('canvas'); out.width = out.height = 256; const ctx = out.getContext('2d'); got.forEach(p => ctx.drawImage(p, 0, 0)); return out;
}
const FlightStream = L.GridLayer.extend({      // first a quick coarse picture (3.2 m, the smallest overview, soon in the cache), then the one the zoom needs, up to the file's own 0.1 m (0.25 m in 2020-08-08)
  createTile(coords, done){
    const c = document.createElement('canvas'), l = this.options.lay; c.width = c.height = 256; const z = coords.z;
    if (!flightHas(l, z, coords.x, coords.y)) { setTimeout(() => done(null, c), 0); return c; }
    const ctx = c.getContext('2d'), paint = src => { if (src) { ctx.clearRect(0, 0, 256, 256); ctx.drawImage(src, 0, 0); } };
    liveTile(l, z, coords.x, coords.y, {minScale: 3.2, trim: 12}).then(src => { paint(src); done(null, c); return liveTile(l, z, coords.x, coords.y, {trim: 12}); }).then(src => { if (src) paint(src); }).catch(err => done(err, c));
    return c;
  }
});
let flightsLayers = [];      // [{key, layer}] on the map, in painting order
/* One zoom level closer while special flights are on (their tiles reach 0.4 m): the map and every tile layer (base maps, aerial, hillshade) may go to 18, otherwise they would vanish beyond 17. The map clamps the view back to 17 when the flights go off. */
let zoomCap = 17;
// a layer without a native limit (the labels) has no tiles beyond its own zoom, so it keeps its cap
const capLayer = l => { if (!(l instanceof L.GridLayer) || l instanceof FlightStream || l.options.maxNativeZoom === undefined) return; if (l._mz0 === undefined) l._mz0 = l.options.maxZoom; l.options.maxZoom = Math.max(l._mz0, zoomCap); };
map.on('layeradd', e => capLayer(e.layer));
function setZoomCap(z){ zoomCap = z; map.setMaxZoom(z); map.eachLayer(capLayer); }
export function placeLeftStack(){      // under the year and its lines (and the tilt hint in the map), in the map and in the 3D view: "Then and now" and the special flights
  const d = document.getElementById('leftStack'); d.hidden = ![...d.children].some(c => !c.hidden); if (d.hidden) return;
  const is3 = viewMode === '3d', host = document.getElementById(is3 ? 'v3d' : 'stage'); if (d.parentNode !== host) host.appendChild(d);      // the 3D view lies over the stage: the dock moves into it
  const refs = is3 ? [document.querySelector('.v3d-top')] : [document.getElementById('tagT'), document.querySelector('.tilt-hint')], hr = host.getBoundingClientRect();
  let bottom = 0, left = 12; refs.forEach(ref => { if (!ref || ref.hidden) return; const r = ref.getBoundingClientRect(); if (r.height) { bottom = Math.max(bottom, r.bottom - hr.top); left = r.left - hr.left; } });
  d.style.top = Math.round(bottom + 10) + 'px'; d.style.left = Math.round(left + 2) + 'px';
}
{ const ro = new ResizeObserver(() => placeLeftStack()); ['tagT', 'v3d'].forEach(id => ro.observe(document.getElementById(id))); const v = document.querySelector('.v3d-top'); if (v) ro.observe(v); addEventListener('resize', placeLeftStack);
  new MutationObserver(() => placeLeftStack()).observe(document.getElementById('stage'), {childList: true, attributes: true, attributeFilter: ['hidden', 'class']}); }
export function updateFlights(){
  const g = glacierPicked ? currentGlacier() : null; ensureFlights(g);
  const vis = !!(g && flightsData.get(g.id)), one = vis && state.mode === 'single', e = one ? flightsEntry(g, state.one) : null;      // the row is in every mode and view of a glacier with flights; greyed unless One year has a flight
  [['flightsRow', 'flightsToggle', 'flightsLabel'], ['l3FlightsRow', 'l3Flights', 'l3FlightsLabel']].forEach(([row, inp, lab]) => {
    const r = document.getElementById(row), i = document.getElementById(inp); r.hidden = !vis; r.classList.toggle('is-unavail', !e); i.disabled = !e; if (document.getElementById('flightsToggle')) i.checked = document.getElementById('flightsToggle').checked;
    document.getElementById(lab).textContent = 'swisstopo special';      // the dates are in the dock; a year without a flight greys the row (the tooltip says why)
    r.title = e ? `Project the swisstopo special-flights imagery of ${state.one} (${e.product}) on the ${row === 'flightsRow' ? 'map' : 'terrain'}. Only where a flight touched the glacier: ${e.share_of_outline_2023} % of the 2023 outline.` : !vis ? '' : !one ? 'swisstopo special-flights imagery: can only be used in One year (map or 3D view), not in the Slider or Timelapse.' : 'swisstopo special-flights imagery: no flight touched this glacier in this year.';
  });
  const on = !!e && document.getElementById('flightsToggle').checked, dock = document.getElementById('flightsDock'), key = on ? e.flights.map(f => f.id).join() + '|' + state.one : '';
  dock.hidden = !on;
  if (on && dock.dataset.key !== key) {      // the list of the flights of this year: a switch each, oldest first; a flight with near-infrared lines gets a second, smaller switch
    dock.dataset.key = key;
    dock.innerHTML = `<div class="fd-h"><span class="fd-t"><svg class="plane-sw" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>Special flights ${state.one}</span><button type="button" class="fd-x" aria-label="Close" title="Close">\u00d7</button></div>` + [...e.flights].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(f =>
      `<label class="toggle optsw" title="${f.area}: ${f.share_of_outline_2023} % of the 2023 outline, ${f.product}"><input type="checkbox" data-f="${f.id}"${flightsOff.has(f.id) ? '' : ' checked'}> <span>${flightName(f)}<small>${f.area}</small></span></label>`
      + (f.nir ? `<label class="toggle optsw fd-sub" title="The near-infrared lines of the same flight, shown as near infrared, red, green (false colour: plants and ice stand out)"><input type="checkbox" data-n="${f.id}"${flightsNir.has(f.id) ? ' checked' : ''}> <span>Near infrared<small>false colour</small></span></label>` : '')).join('');
  }
  dock.querySelectorAll('input[data-f]').forEach(i => { i.checked = !flightsOff.has(i.dataset.f); });
  dock.querySelectorAll('input[data-n]').forEach(i => { i.checked = flightsNir.has(i.dataset.n) && !flightsOff.has(i.dataset.n); });
  const want = on ? (flightsShown(g) || []) : [], have = flightsLayers.map(x => x.key).join(), need = want.map(f => f.key).join();
  if (have !== need) {
    flightsLayers.forEach(x => map.removeLayer(x.layer)); flightsLayers = [];
    want.forEach(f => { const [x0, y0, x1, y1] = f.bbox, sw = L.CRS.EPSG3857.unproject(L.point(x0, y0)), ne = L.CRS.EPSG3857.unproject(L.point(x1, y1)), bnd = L.latLngBounds([sw.lat, sw.lng], [ne.lat, ne.lng]);
      flightsLayers.push({key: f.key, layer: new FlightStream({pane: 'flightsPane', lay: f, bounds: bnd, minZoom: f.minz, maxZoom: 23, maxNativeZoom: flightStreamZ(f), tileSize: 256, keepBuffer: 1, updateWhenZooming: false}).addTo(map)}); });
  }
  setZoomCap(want.length ? 20 : 17);
  placeLeftStack(); updateCredits(); if (typeof wire.syncThenNowChip === 'function') wire.syncThenNowChip();
}
document.getElementById('flightsDock').addEventListener('click', ev => {      // the cross beside the title closes the dock: the layer goes off
  if (!ev.target.closest('.fd-x')) return;
  document.getElementById('flightsToggle').checked = false; updateFlights(); if (viewMode === '3d') { wire.sync3DMenu(); wire.refresh3D(); }
});
document.getElementById('flightsDock').addEventListener('change', ev => {      // a switch of the dock
  const i = ev.target.closest('input[data-f], input[data-n]'); if (!i) return;
  if (i.dataset.n) { if (i.checked) { flightsNir.add(i.dataset.n); flightsOff.delete(i.dataset.n); } else flightsNir.delete(i.dataset.n); }      // near infrared belongs to its flight: switching it on switches the flight on
  else if (i.checked) flightsOff.delete(i.dataset.f); else { flightsOff.add(i.dataset.f); flightsNir.delete(i.dataset.f); }      // and switching the flight off switches its near infrared off
  updateFlights(); if (viewMode === '3d') { wire.sync3DMenu(); wire.refresh3D(); }
});
export function updateAerial(){
  updateMapYears();      // every change of glacier comes through here: the oldest map follows it
  const eds = [...new Set(Object.values(aerialSlots()).filter(Boolean).map(siYear))].sort(), cg = glacierPicked ? currentGlacier() : null;
  if (cg && FEATURES.swisstopo) eds.forEach(ed => ensureFlown(cg, ed));
  const ys = eds.map(ed => flownYear(cg, ed) || ed);      // the menu item names the year(s) the photographs were taken (the edition until that is known)
  document.getElementById('aerialLabel').textContent = (FEATURES.swisstopo ? 'swisstopo aerial' : 'Historic aerial') + (ys.length ? ' ' + [...new Set(ys)].join(' / ') : '');
  const want = aerialWanted(), boxes = (cg ? [cg] : GLACIERS).map(g => L.latLngBounds(imageFootprint(g).bounds)), key = cg ? cg.id : '*';      // only the box of the chosen glacier
  ['A', 'B', 'T'].forEach(k => {
    const yr = want[k] || null;
    if (aerial[k] && aerial[k].yr !== yr) { map.removeLayer(aerial[k].layer); aerial[k] = null; }
    const oz = cg && state.oldestAerial && oldestAerial.get(cg.id), mine = oz && siYear(yr) === oz.ed ? oz : null;      // the oldest picture: one block of one resolution (see data/oldest-aerial.json)
    const myBoxes = mine && mine.clip ? [L.latLngBounds(mine.clip)] : boxes;
    if (yr && !aerial[k]) {
      let layer;
      if (FEATURES.swisstopo) layer = new TrailsLayer(`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage-product/default/${siYear(yr)}/3857/{z}/{x}/{y}.jpeg`,
        {pane: 'si' + k, maxZoom: 17, maxNativeZoom: mine && mine.zoom ? Math.min(18, mine.zoom) : 18, attribution: '© swisstopo (SWISSIMAGE)'});
      else { const o = cg && oldestAerial.get(cg.id); if (!o || !o.img) return; const [x0, y0, x1, y1] = o.bbox, sw = L.CRS.EPSG3857.unproject(L.point(x0, y0)), ne = L.CRS.EPSG3857.unproject(L.point(x1, y1));
        layer = L.imageOverlay(o.img, [[sw.lat, sw.lng], [ne.lat, ne.lng]], {pane: 'si' + k, interactive: false, className: 'scene-img'}); layer._clip = boxes; layer._key = key; layer.setClip = () => {}; }
      layer._clip = myBoxes; layer._key = key; layer.addTo(map); aerial[k] = {yr, layer};
    }
    else if (yr && aerial[k].layer._key !== key) { aerial[k].layer._key = key; aerial[k].layer.setClip(myBoxes); }      // another glacier was chosen
  });
  clip(); updateCredits(); updateSpeed(); updateNames(); updateFlights();
}
export const satOn = () => document.getElementById('satToggle').checked;
/* Is a picture of the glacier on show? The Sentinel-2 picture of a chosen glacier (map and 3D view). The controls and downloads that only make sense for it follow this. */
export const oldestPair = () => !!state.oldestAerial && state.mode === 'compare';      // the slider with the oldest aerial image as one picture (state.oldestSide) and a Sentinel-2 year as the other
export const oldestOn = side => oldestPair() && state.oldestSide === side;
export const satShown = () => glacierPicked && satOn() && !oldestPair();
export const SAT_MSG = 'Pick a glacier or turn on the Sentinel-2 image layer in the layer menu.';
export const OLDEST_MSG = 'The oldest aerial image has no Sentinel-2 picture, so this is not available. Pick a year to go back to the satellite pictures.';
export const satMsg = () => glacierPicked && state.oldestAerial ? OLDEST_MSG : SAT_MSG;
export function aerialDesc(yr){          // the line under the year when the Sentinel-2 picture is off: what the map really shows
  if (!document.getElementById('aerialToggle').checked || !yr) return '<span class="nw">No glacier picture on show</span>';
  const ed = siYear(yr), fy = flownYear(glacierPicked ? currentGlacier() : null, ed);      // the year the photographs were taken, then the edition of the layer
  if (!FEATURES.swisstopo) return `<span class="nw">Aerial image ${fy || yr}</span> · <span class="nw">Náttúrufræðistofnun Íslands</span>`;
  return `<span class="nw">Aerial image ${fy || ed}</span> · <span class="nw">swisstopo SWISSIMAGE ${ed}</span>${yr > SI_LAST ? ` · <span class="nw">newest edition for ${yr}</span>` : ''}`;
}
export function applySatVisibility(){          // the Sentinel-2 pictures can be switched off, so the aerial images or a base map show alone
  const on = document.getElementById('satToggle').checked;
  document.getElementById('map').classList.toggle('sat-off', !on);      // a class, not the panes' own display: syncPane sets that on every year change
  document.getElementById('mapOp').disabled = !on;
  wire.syncSatUi(); wire.updateTags(); if (tlLayers.length) showFrame(state.frame);
  if ((!glacierPicked || oldestPair()) && !document.getElementById('videoSheet').hidden) wire.closeVideo();      // a download pane needs a glacier (the picture itself may be off: the frame then shows the other layers, without the year and date)
  else if (!document.getElementById('videoSheet').hidden) wire.updateFrame();
}
export function imageryLayer(yr, pane, opacity=1, style){
  const g = currentGlacier(), ov = L.imageOverlay(BLANK, imageFootprint(g).bounds, {pane, opacity, interactive:false, className: 'scene-img'});
  ov._g = g;
  const fail = e => { wire.setStatus(e.message); wire.showNotice(e.message); };
  const load = () => {
    const fine = () => loadImage(g, yr, null, undefined, style).then(url => wire.showImage(ov, url)).catch(fail);
    if (!(g.cap && capLevel() === 1)) return fine();
    ov._loadFine = fine;      // a cap's picture is big: a small copy (40 m) shows first; the 10 m one replaces it at once if the map is zoomed in, else when it is (capCheckFine)
    loadImage(g, yr, null, 0.25, style).then(url => { if (!ov._orig) wire.showImage(ov, url); if (capWantsFine()) fine(); else { capWaiting.add(ov); setLoading(); } }).catch(() => fine());
  };
  if (viewMode === '3d') deferredLoads.push([ov, load]); else load();      // the map is not on show in the 3D view: its pictures wait (that view asks for its own, much smaller ones)
  return ov;
}
export const deferredLoads = [];
export function loadDeferred(){ deferredLoads.splice(0).forEach(([ov, load]) => { if (ov._map) load(); }); }      // back on the map: the layers that are still on it get their pictures


/* ---------- compare (swipe) ---------- */
export let layerA = null, layerB = null;
export function setCompareLayers(){
  [layerA, layerB].forEach(l => l && map.removeLayer(l));
  layerA = layerB = null;
  if (!glacierPicked) return;      // the start shows only the background, no glacier picture yet
  if (state.mode !== 'compare' || (!oldestOn('b') && !state.available[state.b]) || (!oldestOn('a') && !state.available[state.a])) return;
  if (!oldestOn('a')) layerA = imageryLayer(state.a, 'paneA').addTo(map);      // no Sentinel-2 picture on the side with the oldest aerial image
  if (!oldestOn('b')) layerB = imageryLayer(state.b, 'paneB', 1, sideStyle(1)).addTo(map);      // the second picture may have its own colour composition
  clip(); updateCredits();
}
/* The slider: split is 0..1 of the map width (vertical divider) or height (horizontal divider). The horizontal one keeps
   the year label of the upper image fully visible and the handle clear of the toolbar. */
export const horiz = () => prefs.orient !== 'v';        // stacked images (top and bottom) unless the visitor chose side by side
export function splitRange(){
  if (!horiz()) return [.02, .98];
  const size = map.getSize(), tag = document.getElementById('tagA');
  const st = document.getElementById('stage').getBoundingClientRect(), bar = document.querySelector('.mapbar').getBoundingClientRect();
  const free = bar.height ? (bar.top - st.top - 34) / size.y : 1 - 104 / size.y;           // the handle stops above the toolbar, also when it has two rows
  return [Math.min(.4, ((tag ? tag.offsetHeight : 90) + 22) / size.y), Math.max(.5, Math.min(.92, free))];
}
export function clip(){
  const size = map.getSize(), [lo, hi] = splitRange();
  state.split = Math.min(hi, Math.max(lo, state.split));
  const nw = map.containerPointToLayerPoint([0,0]), se = map.containerPointToLayerPoint(size);
  const dv = document.getElementById('divider'), h = document.getElementById('handle'), tagB = document.getElementById('tagB');
  document.getElementById('app').classList.toggle('is-horiz', horiz());
  if (horiz()) {
    const cy = nw.y + size.y * state.split, py = size.y * state.split;
    ['paneA', 'siA'].forEach(n => { map.getPane(n).style.clip = `rect(${nw.y}px, ${se.x}px, ${cy}px, ${nw.x}px)`; });
    ['paneB', 'siB'].forEach(n => { map.getPane(n).style.clip = `rect(${cy}px, ${se.x}px, ${se.y}px, ${nw.x}px)`; });
    dv.style.top = py + 'px'; dv.style.left = '';
    h.style.left = '50%'; h.style.top = py + 'px'; tagB.style.top = (py + 12) + 'px';
  } else {
    const cx = nw.x + size.x * state.split, px = size.x * state.split;
    ['paneA', 'siA'].forEach(n => { map.getPane(n).style.clip = `rect(${nw.y}px, ${cx}px, ${se.y}px, ${nw.x}px)`; });
    ['paneB', 'siB'].forEach(n => { map.getPane(n).style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${cx}px)`; });
    dv.style.left = px + 'px'; dv.style.top = '';
    h.style.left = px + 'px'; h.style.top = ''; tagB.style.top = '';
  }
  h.setAttribute('aria-valuenow', Math.round(state.split * 100)); h.setAttribute('aria-orientation', horiz() ? 'vertical' : 'horizontal');
  if (arcLayer && state.mode === 'compare') arcLayer.draw();      // the arcs are dimmed by the side of the divider they are on
  try { if (!document.getElementById('videoSheet').hidden && wire.vstate.kind === 'image') wire.drawPreview(); } catch {}      // the picture pane shows where the slider is (not yet defined during start-up: ignored)
}
map.on('move zoom resize', clip);

export let sliderHintDone = false;      // the hint beside the handle shows until the slider has been used once (on the map or in the 3D view)
(function swipe(){
  const handle = document.getElementById('handle'), stage = document.getElementById('stage');
  let dragging = false; const used = () => { sliderHintDone = true; handle.classList.add('used'); };
  const setPos = e => { const r = stage.getBoundingClientRect(); state.split = horiz() ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; clip(); };
  handle.addEventListener('pointerdown', e => { used(); dragging = true; handle.setPointerCapture(e.pointerId); map.dragging.disable(); e.preventDefault(); });
  handle.addEventListener('pointermove', e => dragging && setPos(e));
  const end = () => { dragging = false; if (!TWO_FINGER) map.dragging.enable(); };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', e => {
    const step = e.shiftKey ? .1 : .02, less = ['ArrowLeft', 'ArrowUp'].includes(e.key), more = ['ArrowRight', 'ArrowDown'].includes(e.key);
    if (less) state.split -= step; else if (more) state.split += step;
    else if (e.key === 'Home') state.split = 0; else if (e.key === 'End') state.split = 1;
    else return;
    used(); e.preventDefault(); clip();
  });
})();

/* ---------- timelapse ---------- */
export let tlLayers = [];   // [{yr, layer}]
export const tlFrames = () => state.mode === 'single' ? okYears().filter(y => y === state.one) : okYears().filter(y => y >= state.from && y <= state.to);
export function buildTimelapse(){
  stopPlay(); updateAerial();
  tlLayers.forEach(t => map.removeLayer(t.layer)); tlLayers = [];
  if (state.mode === 'compare' || !glacierPicked) { document.getElementById('tlDots').innerHTML = ''; document.getElementById('v3dTlLine').innerHTML = ''; return; }      // no timeline left over on the map or in the 3D view when the mode leaves Timelapse      // before a glacier is chosen no picture is drawn
  // every frame stays loaded at opacity 0 so switching is instant
  tlLayers = tlFrames().map(yr => ({yr, layer: imageryLayer(yr, 'paneT', 0).addTo(map)}));
  state.frame = Math.min(state.frame, Math.max(0, tlLayers.length - 1));
  const s = document.getElementById('frameSlider');
  s.max = Math.max(0, tlLayers.length - 1); s.value = state.frame;
  document.getElementById('playBtn').disabled = tlLayers.length < 2; syncFullPlay();
  showFrame(state.frame);
}
/* the line under a year on the map: the date, then what the picture is, on one row; it only breaks between the two parts */
export function tagLine(el, first, sc, style = state.style){ el.innerHTML = (first && first !== 'Sentinel-2' ? `<span class="nw">${first}</span> · ` : '') + `<span class="nw">${styleLine(style, sc)}</span>`; }
export function showFrame(i){
  if (!tlLayers.length) { wire.setTag('tagT', '–'); return; }
  state.frame = i; if (wire.previewFrameTick) wire.previewFrameTick(i);
  tlLayers.forEach((t, k) => t.layer.setOpacity(k === i ? 1 : 0)); updateSpeed(); updateFlights();
  const off = !satOn(), yShown = off && (state.mode === 'timelapse' || state.oldestAerial) && aerialWanted().T ? aerialWanted().T : tlLayers[i].yr;      // no Sentinel-2 picture: a timelapse shows its newest aerial year, not the frames
  wire.setTag('tagT', yShown);
  const sc = state.available[tlLayers[i].yr];
  if (off) document.getElementById('tagTsub').innerHTML = aerialDesc(yShown);
  else tagLine(document.getElementById('tagTsub'), state.mode === 'single' ? `${sc && sc.latest ? 'Latest clear-ish: ' : ''}${sc ? fmtDM(sc.date) : ''}${sc && !sc.clear ? ', some clouds' : ''}` : `${sc ? fmtDM(sc.date) : ''}, frame ${i+1} of ${tlLayers.length}`, sc);
  /* the timeline as in the Timelapse download: first and last year above a line, a tick for every year, the line filled up to the year on show, a round marker */
  const dockOpen = !!state.dockOpen, nTl = tlLayers.length, pct = k => nTl > 1 ? k / (nTl - 1) * 100 : 0;
  const ys1 = okYears(), at1 = ys1.indexOf(state.one), stepHtml = state.mode !== 'single' || off || ys1.length < 2 ? '' : `<div class="tl-row tl-step"><button type="button" class="tl-prev" aria-label="Previous year" title="Previous year"${at1 <= 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><div class="tl-years" role="group" aria-label="Years with a picture">${[-2, -1, 0, 1, 2].map(d => { const y = ys1[at1 + d]; return at1 < 0 || y === undefined ? `<i class="tl-yr tl-gap d${Math.abs(d)}"></i>` : d === 0 ? `<b class="tl-step-year tl-yr d0">${yShown}</b>` : `<button type="button" class="tl-yr d${Math.abs(d)}" data-year="${y}" aria-label="Go to ${y}">${y}</button>`; }).join('')}</div><button type="button" class="tl-next" aria-label="Next year" title="Next year"${at1 < 0 || at1 >= ys1.length - 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>`;      // One year: previous / next year with a scene, in the dock
  const tlHtml = stepHtml || (state.mode === 'single' || nTl < 2 || off ? '' : `<div class="tl-row"><button type="button" class="tl-play" aria-label="${state.playing ? 'Pause' : 'Play'}">${state.playing ? FULL_ICONS.pause : FULL_ICONS.play}</button><div class="tl2"><span class="tl2-ends"><b>${tlLayers[0].yr}</b><b>${tlLayers[nTl - 1].yr}</b></span><div class="tl2-track"><i class="tl2-fill" style="width:${pct(i)}%"></i>${tlLayers.map((_, k) => `<i class="tl2-tick${k <= i ? ' on' : ''}" style="left:${pct(k)}%"></i>`).join('')}<i class="tl2-dot" style="left:${pct(i)}%"></i></div></div><button type="button" class="tl-tools" aria-label="Show tools" aria-expanded="${dockOpen}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div>`);
  document.getElementById('tlDots').innerHTML = tlHtml; document.getElementById('v3dTlLine').innerHTML = tlHtml;      // the same timeline on the map and in the 3D view; in full screen its play button is the way to start and stop
  document.getElementById('frameSlider').value = i;
  updateCredits();
  if (viewMode === '3d' && wire.v3dCtx && wire.v3dCtx.follow && wire.v3dCtx.years.includes(tlLayers[i].yr)) wire.v3dCtx.follow(tlLayers[i].yr);      // the 3D view shows the frame too
  wire.syncPane();
  drawArcs(true);
  const cb = document.querySelector('.cb-links');
  if (cb) cb.innerHTML = wire.cbButtonsHtml();
}
export const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>Play';
export const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>Pause';
document.getElementById('playBtn').innerHTML = PLAY_ICON;
export const SPEED_FPS = ['0.5', '1', '1.5', '2', '3', '4', '5', '6', '7', '8'], SPEED_MS = SPEED_FPS.map(f => Math.round(1000 / +f));      // the slider steps (frames per second, max 8): the label, and the delay per frame
export const speedAngle = i => -60 + i * 120 / (SPEED_FPS.length - 1);      // the needle of the little gauge, from -60 to 60 degrees
export const speedMs = () => typeof wire.vPrev !== 'undefined' && wire.vPrev.on && wire.vstate.type !== 'swipe' ? wire.perSec(tlLayers.length) * 1000 : SPEED_MS[+document.getElementById('speedSel').value];      // the preview in the animation pane runs at the pane's "Seconds per year"
export function updateSpeedIcon(){                 // the needle of the little gauge and the label follow the chosen speed
  const i = +document.getElementById('speedSel').value;
  document.getElementById('speedNeedle').setAttribute('transform', `rotate(${speedAngle(i)} 12 18)`);
  document.getElementById('speedOut').textContent = `${SPEED_FPS[i]} fps`;
}
document.getElementById('speedSel').oninput = updateSpeedIcon; updateSpeedIcon();
export const FULL_ICONS = {play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.500v14H7zM13.500 5H17v14h-3.500z"/></svg>'};
export function syncDock(){          // phones: while a timelapse plays, the dock keeps only the timeline and the play button; the "…" button in the timeline brings the tools back (style.css, .tl-live)
  [document.querySelector('.mapbar'), document.getElementById('v3dMeasure')].forEach(d => { if (!d) return; d.classList.toggle('tl-live', !!state.playing); d.classList.toggle('tools-open', !!state.dockOpen); });
  document.querySelectorAll('.tl-tools').forEach(b => b.setAttribute('aria-expanded', !!state.dockOpen));
}
function goYear(to){ if (!to || to === state.one) return; restoreLatest(); restoreOldest(); state.one = to; wire.refreshAll(); }
document.addEventListener('click', e => {      // One year: the dock's previous / next buttons and the small years beside the big one go to a year with a scene
  if (Date.now() < swipedAt + 400) return;
  const y = e.target.closest && e.target.closest('.tl-yr[data-year]'); if (y) { goYear(+y.dataset.year); return; }
  const b = e.target.closest && e.target.closest('.tl-prev, .tl-next'); if (!b || b.disabled) return;
  const ys = okYears(), at = ys.indexOf(state.one); goYear(ys[at + (b.classList.contains('tl-next') ? 1 : -1)]);
});
let swipedAt = 0;      // a swipe along the years steps one year (left = later, right = earlier); the click that ends it is ignored
(() => {
  let x0 = null, y0 = 0;
  document.addEventListener('pointerdown', e => { const r = e.target.closest && e.target.closest('.tl-step'); x0 = r && e.button <= 0 ? e.clientX : null; y0 = e.clientY; });
  document.addEventListener('pointerup', e => {
    if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const ys = okYears(), at = ys.indexOf(state.one); swipedAt = Date.now(); goYear(ys[at + (dx < 0 ? 1 : -1)]);
  });
  document.addEventListener('pointercancel', () => { x0 = null; });
})();
/* Desktop: scrolling sideways over the years (two fingers on a trackpad, a tilt wheel, or Shift + wheel) steps through the years with a scene; right = later, left = earlier.
   The distance is added up, so a long scroll runs through several years; a plain up / down scroll is left alone (the page and the map keep it). */
(() => {
  const STEP = 50, PAUSE = 110;      // pixels of scroll per year; the shortest time between two steps (ms)
  let sum = 0, lastAt = 0, steppedAt = 0;
  const onWheel = e => {
    if (!e.target.closest || !e.target.closest('.tl-step') || e.ctrlKey) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;      // lines and pages to pixels
    const side = Math.abs(e.deltaX) > Math.abs(e.deltaY), d = (side ? e.deltaX : e.shiftKey ? e.deltaY : 0) * k;
    if (!d) return;
    e.preventDefault();      // also keeps the browser from going back a page on a sideways swipe
    const now = Date.now(); if (now - lastAt > 250 || d * sum < 0) sum = 0; lastAt = now; sum += d;
    if (Math.abs(sum) < STEP || now - steppedAt < PAUSE) return;
    const ys = okYears(), at = ys.indexOf(state.one), to = ys[at + (sum > 0 ? 1 : -1)]; sum = 0;
    if (at < 0 || to === undefined) return;
    steppedAt = now; goYear(to);
  };
  ['tlDots', 'v3dTlLine'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('wheel', onWheel, { passive: false }); });
})();
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tl-tools'); if (b) { state.dockOpen = !state.dockOpen; syncDock(); } });
export function syncFullPlay(){          // the round play / pause button of the full screen (timelapse only, see style.css) follows the real state
  if (!state.playing) state.dockOpen = false;
  syncDock();
  document.querySelectorAll('.tl-play').forEach(b => { b.innerHTML = state.playing ? FULL_ICONS.pause : FULL_ICONS.play; b.setAttribute('aria-label', state.playing ? 'Pause' : 'Play'); });
}
export function play(seq = null, onWrap = null){            // seq: the frames in the order to show them (a preview of loops and going back in time); without it the years run 0..n-1
  if (tlLayers.length < 2) return;
  state.playing = true; document.getElementById('playBtn').innerHTML = PAUSE_ICON; syncFullPlay();
  const begun = Date.now();
  /* In the 3D view the map's own pictures are not loaded (they wait), the strip pictures are what plays: those are fetched here, all years together, so that every frame is quick */
  let n3 = 0, pre3 = false;
  if (viewMode === '3d' && wire.v3dCtx && wire.v3dCtx.S) {
    pre3 = true; const c3 = wire.v3dCtx;
    tlLayers.forEach(t => { const spec = !wire.stripPicturesOff && !imageHere(c3.g, t.yr) ? wire.stripImageSpec(c3.S) : null; (spec ? loadImage(c3.g, t.yr, spec) : loadImage(c3.g, t.yr)).catch(() => {}).then(() => { n3++; }); });
  }
  const wait = () => {            // the first run: every picture has to be loaded before the years change, else the frames flash
    const ready = pre3 ? n3 : tlLayers.filter(t => t.layer._ready).length;
    if (ready < tlLayers.length && Date.now() - begun < (pre3 ? 45000 : 20000)) {
      const pb = document.getElementById('playBtn');      // keep the spinner element: rebuilding it every 250 ms restarts its turn, so it only jitters
      if (!pb.querySelector('.spin-s')) pb.innerHTML = '<span class="spin-s"></span><span class="spin-n"></span>';
      pb.querySelector('.spin-n').textContent = `${ready}/${tlLayers.length}`;
      state.timer = setTimeout(wait, 250); return;
    }
    document.getElementById('playBtn').innerHTML = PAUSE_ICON;
    go();
  };
  const go = () => {
  let pos = 0;
  if (seq) showFrame(seq[0]); else if (state.frame >= tlLayers.length - 1) showFrame(0);
  const tick = () => {
    let next;
    if (seq) {
      if (++pos >= seq.length) {
        pos = 0; const hold = onWrap ? onWrap() : 0;      // the preview shows its ending here: wait, then start over (negative: it has stopped)
        if (hold < 0) return;
        if (hold) { state.timer = setTimeout(() => { showFrame(seq[0]); state.timer = setTimeout(tick, speedMs()); }, hold); return; }
      }
      next = seq[pos];
    }
    else {
      next = state.frame + 1;
      if (next >= tlLayers.length) {
        if (!document.getElementById('loopToggle').checked) return stopPlay();
        next = 0;
      }
    }
    showFrame(next);
    state.timer = setTimeout(tick, speedMs());
  };
  state.timer = setTimeout(tick, speedMs());
  };
  wait();
}
export function stopPlay(){
  clearTimeout(state.timer); state.playing = false;
  document.getElementById('playBtn').innerHTML = PLAY_ICON; syncFullPlay();
}
document.getElementById('playBtn').onclick = () => state.playing ? stopPlay() : play();
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tl-play')) state.playing ? stopPlay() : play(); });      // the play button beside the timeline (the timeline is drawn again at every frame: one listener for all)
/* drag on the timeline (map dock and 3D dock) to scrub through the years; the timeline is drawn again at every frame, so the box is kept and its track looked up at each move */
(() => {
  let box = null;
  const scrub = e => {
    const tr = box && box.querySelector('.tl2-track'); if (!tr || tlLayers.length < 2) return;
    const r = tr.getBoundingClientRect(), k = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (tlLayers.length - 1));
    if (k !== state.frame) { if (wire.vPrev) wire.vPrev.scrubbed = true; showFrame(k); }
  };
  document.addEventListener('pointerdown', e => {
    const tl = e.target.closest && e.target.closest('.tl2'); if (!tl || e.button > 0) return;
    box = tl.closest('#tlDots, #v3dTlLine'); if (!box) return;
    stopPlay(); scrub(e); e.preventDefault();
  });
  document.addEventListener('pointermove', e => { if (box) scrub(e); });
  const end = () => { box = null; };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
})();
document.getElementById('frameSlider').oninput = e => { stopPlay(); if (wire.vPrev) wire.vPrev.scrubbed = true; showFrame(+e.target.value); };      // scrubbed: the preview's labels in the open pane follow the frame, not the middle year

/* ---------- outlines ---------- */
export const outlineLayers = {old: null, new: null};
export function geodesicArea(ring){ // ring: [[lng,lat],...] -> m²
  const R = 6378137, rad = d => d * Math.PI / 180; let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % ring.length];
    a += rad(p2[0] - p1[0]) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(a * R * R / 2);
}
export const multiArea = geom => geom.coordinates.reduce((s, poly) => s + geodesicArea(poly[0]) - poly.slice(1).reduce((h, r) => h + geodesicArea(r), 0), 0);
/* An outline as in the reference picture: a hard line on the edge and a colour that fades towards the inside of the polygon (open lines only get the hard line).
   Canvas, not CSS/SVG filters (Safari on iPhone ignores them). toPt maps a [lng, lat] to canvas pixels; k scales widths for bigger canvases. */
export function strokeEdgeFade(ctx, geom, toPt, color, k = 1){
  const path = onlyClosed => { ctx.beginPath(); eachPiece(geom, (ring, closed) => {
    if (onlyClosed && !closed) return;
    ring.forEach((pt, i) => { const [x, y] = toPt(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (closed) ctx.closePath(); }); };
  /* the fade is no wider than 5 % of the outline's shorter side as drawn: zoomed out, a fixed width would fill the whole glacier with the colour (the hard line keeps its width) */
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; eachPiece(geom, (ring, closed) => { if (closed) ring.forEach(pt => { const [x, y] = toPt(pt); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }); });
  const kf = Math.max(.02, Math.min(k, .05 * Math.min(x1 - x0, y1 - y0) / 34));
  ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  ctx.save(); path(true); ctx.clip('evenodd');                 // only the inside: stacked strokes of shrinking width add up to a fade
  ctx.globalAlpha = .07;
  for (let i = 0; i < 9; i++) { ctx.lineWidth = 2 * kf * (34 - i * 3.6); path(true); ctx.stroke(); }
  ctx.restore();
  ctx.lineWidth = 2.2 * k; path(false); ctx.stroke(); ctx.restore();
}
/* The same on the Leaflet map: a canvas layer under the hard line (a normal, clickable GeoJSON line) */
const EdgeFade = L.Layer.extend({
  initialize(geom, color){ this._geom = geom; this._color = color; },
  onAdd(m){
    this._c = L.DomUtil.create('canvas', 'leaflet-zoom-hide'); this._c.style.pointerEvents = 'none'; m.getPane('outlines').appendChild(this._c);
    m.on('move zoom viewreset resize', this._draw, this); this._draw();
  },
  onRemove(m){ m.off('move zoom viewreset resize', this._draw, this); this._c.remove(); },
  _draw(){
    const m = this._map, sz = m.getSize(), c = this._c, dpr = window.devicePixelRatio || 1;
    c.width = sz.x * dpr; c.height = sz.y * dpr; c.style.width = sz.x + 'px'; c.style.height = sz.y + 'px';
    L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    strokeEdgeFade(ctx, this._geom, ([lng, lat]) => { const q = m.latLngToContainerPoint([lat, lng]); return [q.x, q.y]; }, this._color, .45);
  }
});
export const glowLines = (geom, color) => L.featureGroup([new EdgeFade(geom, color),
  L.geoJSON(geom, {pane:'outlines', style:{color, weight:2, opacity:1, lineJoin:'round', fill:false}})]);
export function drawOutlines(){
  Object.values(outlineLayers).forEach(l => l && map.removeLayer(l));
  outlineLayers.old = outlineLayers.new = null;
  drawRadar();
  drawMax();
  drawArcs(false);
  if (typeof setThickness === 'function' && document.getElementById('thickToggle')) setThickness();
  wire.syncOutsideUi();
  if (typeof glacierPicked !== 'undefined' && !glacierPicked) return updateCredits();     // the overview shows no outlines until a glacier is chosen
  const g = currentGlacier();
  if (g.rgi) {      // a glacier of an ice-cap region: the outlines of the region's institute (lines, cut to the glacier's region)
    const O = REGION.outlines, line = (geom, color, dash, title) => glowLines(geom, color).bindPopup(`<strong>${title}</strong>`);
    if (document.getElementById('oldToggle').checked && hasOldOutline(g)) outlineLayers.old = line(oldOutlineGeom(g), getVar('--old'), '7 6', `${g.name}, outline ${g.outlines.lia.label}`).addTo(map);
    if (document.getElementById('newToggle').checked && newOutlineGeom(g) && !document.body.classList.contains('pane-open')) outlineLayers.new = line(newOutlineGeom(g), getVar('--new'), null, `${g.name}, outline ${g.outlines.latest.label}`).addTo(map);
    return updateCredits();
  }
  if (!g.inv) {
    if (document.getElementById('oldToggle').checked || document.getElementById('newToggle').checked)
      wire.showNotice(DATA ? `No inventory outline for ${g.name} in glaciers.js.` : 'Outlines need data/glaciers.js. See the note under "On the map".');
    return;
  }
  if (document.getElementById('oldToggle').checked && !g.inv.oldest)
    wire.showNotice(`No ${DATA.oldest_label} outline was matched for ${g.name}.`);
  const mk = (geom, color, dash, title, invArea) => glowLines(geom, color).bindPopup(`<strong>${title}</strong><br>Inventory area: ${invArea.toFixed(2)} km²<br>Area on this map: ${(multiArea(geom)/1e6).toFixed(2)} km²`);
  if (document.getElementById('oldToggle').checked && g.inv.oldest)
    outlineLayers.old = mk(g.inv.oldest.outline, getVar('--old'), '7 6', `${g.name}, ${DATA.oldest_label}`, g.inv.oldest.area_km2).addTo(map);
  if (document.getElementById('newToggle').checked && !document.body.classList.contains('pane-open'))      // a download prints only the oldest outline (if ticked), not the newest
    outlineLayers.new = mk(g.inv.outline, getVar('--new'), null, `${g.name}, ${DATA.latest_label}${g.inv.year ? ' ('+g.inv.year+')' : ''}`, g.inv.area_km2).addTo(map);
  updateCredits();
}
export const getVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- modelled ice thickness 2016 (Grab et al. 2021), swisstopo WMS ----------
   One WMS picture per image box (the area of the satellite scene), so the layer shows only inside the boxes: the selected glacier's box, or all ten
   before a glacier is chosen. Transparent where there is no glacier. Not a measurement: radar lines plus an ice-flow model. */
export const THICK_LAYER = 'ch.swisstopo.geologie-gletschermaechtigkeit';
export let thickImgs = [], thickKey = '';
export function thicknessUrl(fp){
  const k = Math.min(1, 2000 / Math.max(fp.w, fp.h));
  return 'https://wms.geo.admin.ch/?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: THICK_LAYER, STYLES: '',
    CRS: 'EPSG:3857', BBOX: fp.bbox.join(','), WIDTH: Math.round(fp.w * k), HEIGHT: Math.round(fp.h * k), FORMAT: 'image/png', TRANSPARENT: 'TRUE' });
}
/* The WMS picture covers the whole image box, so it would also paint the neighbouring glaciers inside it. The pixels are masked in a canvas with the outline of the chosen glacier
   (the latest inventory outline, Mercator pixels of the same bbox); if the picture cannot be read back (no CORS) or the glacier has no polygon outline, the plain picture is shown. */
export async function thicknessClipped(g){
  const fp = imageFootprint(g), url = thicknessUrl(fp), geom = g.inv && g.inv.outline;
  if (!geom || geom.type === 'MultiLineString') return url;
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), [x0, y0, x1, y1] = fp.bbox, R = 6378137;
    x.beginPath();
    eachPiece(geom, ring => ring.forEach(([lng, lat], i) => {
      const mx = lng * Math.PI / 180 * R, my = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R, px = (mx - x0) / (x1 - x0) * W, py = (y1 - my) / (y1 - y0) * H;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }));
    x.clip('evenodd'); x.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch { return url; }
}
export function setThickness(){
  const on = document.getElementById('thickToggle').checked, box = document.getElementById('thickLegendBox'), img = document.getElementById('thickLegendImg');
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked, key = on ? (picked ? state.glacier : '*') : '';
  if (key !== thickKey) {
    thickImgs.forEach(l => map.removeLayer(l)); thickImgs = []; thickKey = key;
    if (on) (picked ? [currentGlacier()] : GLACIERS).forEach(g => thicknessClipped(g).then(src => {
      if (thickKey !== key) return;                                  // switched off or another glacier chosen meanwhile
      thickImgs.push(L.imageOverlay(src, imageFootprint(g).bounds, {pane:'thickPane', opacity:.8, interactive:false}).addTo(map));
    }));
  }
  box.hidden = !on;
  if (on && !img.src) { img.onerror = () => { img.hidden = true; }; img.src = `https://api3.geo.admin.ch/static/images/legends/${THICK_LAYER}_en.png`; }
  updateCredits();
}

/* ---------- radar ice thickness (GLAMOS, ground-penetrating radar) ----------
   thickness.js (made by build_outlines.py) holds one mean value per 50 m cell for each of the ten glaciers; it is loaded only when the layer is switched on.
   The surveys are old (see glaciers.js, radar.years), so the dots show the ice as it was then, not today. */
/** @type {[number, number[]][]} */
export const RADAR_STOPS = [[0,[191,227,242]],[200,[63,155,196]],[400,[42,42,107]],[600,[90,31,99]]];
export function radarColor(m){
  const t = Math.max(0, Math.min(600, m));
  for (let i = 1; i < RADAR_STOPS.length; i++) if (t <= RADAR_STOPS[i][0]) {
    const [t0, c0] = RADAR_STOPS[i - 1], [t1, c1] = RADAR_STOPS[i], f = (t - t0) / (t1 - t0);
    return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`;
  }
  return 'rgb(90,31,99)';
}
export const radarPopup = (m, y, all, seis) => all      // the text of a radar point, on the map and on the pins of the 3D view; seis: a seismic survey, not radar (Aletsch 1958)
  ? `<strong>Measured ${all.length} times${all.some(e => e[2]) ? ' (radar and seismic)' : ' by radar'}</strong><br>${all.slice().reverse().map(([yy, mm, sq]) => `${yy || 'year unknown'}: <b>${mm} m</b>${sq ? ' (seismic)' : ''}`).join('<br>')}`
  : `<strong>${m} m</strong> of ice<br>measured by ${seis ? 'a seismic survey' : 'radar'}${y ? ` in ${y}` : ''}`;
export let radarLayer = null, radarLoad = null, radarGen = 0, maxMarker = null;
export const radarRenderer = L.canvas({pane:'outlines', padding:0.3});
export function loadRadar(){
  if (window.GLACIER_THICKNESS) return Promise.resolve();
  return radarLoad || (radarLoad = new Promise((ok, fail) => {
    const sc = document.createElement('script'); sc.src = asset('data/thickness.js') + (!ASSETS['data/thickness.js'] && DATA && DATA.thickness_id ? `?v=${DATA.thickness_id}` : '');
    sc.onload = ok; sc.onerror = () => { radarLoad = null; fail(new Error('thickness.js')); };
    document.head.appendChild(sc);
  }));
}
export async function drawRadar(){
  if (viewMode === '3d') return;      // the map is not on show: the layer is drawn when it comes back (the 3D view has its own pins from the baked file)
  const gen = ++radarGen, on = document.getElementById('radarToggle').checked, legend = document.getElementById('radarLegend'), note = document.getElementById('radarNote');
  if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
  legend.hidden = !on;
  if (!on || document.body.classList.contains('pane-open')) return updateCredits();      // the radar dots are not part of a download: not in its preview either
  const g = typeof glacierPicked !== 'undefined' && !glacierPicked ? null : currentGlacier();
  const R = g && g.inv && g.inv.radar;
  note.textContent = !g ? 'Choose a glacier to see its radar profiles.' : R ? `Surveys between ${R.years ? (R.years[0] === R.years[1] ? R.years[0] : R.years.join(' and ')) : '?'}; click a dot for its year. The ice has thinned since.` : 'No radar measurements for this glacier in the GLAMOS data.';
  if (!R) return updateCredits();
  try { await loadRadar(); } catch { note.textContent = 'The radar data (thickness.js) could not be loaded.'; return; }
  if (gen !== radarGen) return;
  const pts = (window.GLACIER_THICKNESS || {})[g.inv.id] || [];
  const r = Math.max(2.5, Math.min(7, (map.getZoom() - 9) * 0.9));
  // [lat, lng, thickness of the newest survey, its year, [[year, thickness], ...] if the spot was measured in several years]
  const popup = radarPopup;
  radarLayer = L.layerGroup(pts.map(([lat, lng, m, y, all, , seis]) => L.circleMarker([lat, lng], {renderer:radarRenderer, radius:r, stroke:true, color: all ? '#C8322A' : '#fff', weight: all ? 1.4 : .6, opacity:.85, fillColor:radarColor(m), fillOpacity:.9})
    .bindTooltip(popup(m, y, all, seis), {sticky:true, direction:'top', offset:[0, -6], opacity:.96, className:'radar-tip'})        // on hover; a tap or click opens the same text as a popup
    .bindPopup(popup(m, y, all, seis)).on('popupopen', e => e.target.closeTooltip()))).addTo(map);
  updateCredits();
}
map.on('zoomend', () => { if (radarLayer) drawRadar(); capCheckFine(); });
/* ---------- ice speed (ITS_LIVE annual mosaics of image pair velocities, version 2.1) ----------
   data/itslive/<glacier key>.json (made by scripts/build_itslive.py) holds, per year of `years` (2013 to 2024), the speed of the surface in 0.1 m/yr steps on a Web Mercator grid over the picture box
   of the glacier. The values are ITS_LIVE's `v`, copied. The layer shows the year of the picture on the map (one year: that year; Compare: the right-hand year; Timelapse: the frame).
   Years without data (2023 on) show nothing and say so. Values under SPEED_MIN m/yr are the noise floor of the product (rock beside the glaciers reads 1 to 2 m/yr) and stay clear. */
export const SPEED_MIN = 5, SPEED_MAX = 150;
/** @type {[number, number[]][]} */
export const SPEED_STOPS = [[0,[70,98,215]],[.2,[54,170,249]],[.38,[26,228,182]],[.55,[114,254,94]],[.68,[199,239,52]],[.8,[250,187,57]],[.9,[245,105,24]],[1,[203,42,4]]];
export const SPEED_LUT = Array.from({length: 256}, (_, i) => {
  const t = i / 255; let k = 1; while (k < SPEED_STOPS.length - 1 && t > SPEED_STOPS[k][0]) k++;
  const [t0, c0] = SPEED_STOPS[k - 1], [t1, c1] = SPEED_STOPS[k], f = (t - t0) / (t1 - t0); return c0.map((c, j) => Math.round(c + (c1[j] - c) * f));
});
/* ---------- glacier names: the glaciers named in the picture of the chosen glacier, drawn on the map. data/glacier-names.js is made by `npm run walkthrough -- names` (Wikidata and the
   Randolph Glacier Inventory); the chosen glacier first, then the others nearest first. Labels that would overlap one already placed are hidden, so zooming in shows more. ---------- */
export const namesLayer = L.layerGroup();
let namesFile = null, namesGen = 0;
export const namesData = () => namesFile || (namesFile = new Promise(res => { const sc = document.createElement('script'); sc.src = asset('data/glacier-names.js'); sc.onload = () => res(window.GLACIER_NAMES || {}); sc.onerror = () => res({}); document.head.appendChild(sc); }));
const escName = t => String(t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export function declutterNames(){
  const placed = [];
  namesLayer.eachLayer(m => {
    const el = m.getElement(); if (!el) return;
    const p = map.latLngToContainerPoint(m.getLatLng()), w = el.textContent.length * (el.classList.contains('self') ? 8 : 6.6) + 12, h = el.classList.contains('self') ? 20 : 16, b = {x: p.x - w / 2, y: p.y - h / 2, w, h};
    const clash = placed.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    el.style.visibility = clash ? 'hidden' : 'visible'; if (!clash) placed.push(b);
  });
}
export async function updateNames(){
  const gen = ++namesGen, on = document.getElementById('namesToggle').checked && glacierPicked && viewMode !== '3d';
  namesLayer.clearLayers();
  if (!on) { map.removeLayer(namesLayer); updateCredits(); return; }
  const g = currentGlacier(), all = await namesData(); if (gen !== namesGen) return;
  (all[g.inv ? g.inv.id : g.id] || []).forEach(n => L.marker([n.la, n.lo], {pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({className: 'gname' + (n.self ? ' self' : ''), html: '<span>' + escName(n.n) + '</span>', iconSize: [0, 0]})}).addTo(namesLayer));
  namesLayer.addTo(map); declutterNames(); updateCredits();
}
map.on('zoomend moveend', () => { if (map.hasLayer(namesLayer)) declutterNames(); });
/* ---------- All Swiss glaciers: every glacier of the Swiss Glacier Inventory SGI2023 (GLAMOS, CC BY 4.0) as an outline, with name, area, length and elevation range on hover. data/swiss-glaciers.json is made by
   scripts/build_swiss_inventory.py (outlines simplified to about 25 m; the values are the inventory's, rounded to 2 decimals). Loaded when the layer is first switched on. ---------- */
export let swissAllFile = null;
export const loadSwissAll = () => swissAllFile || (swissAllFile = fetch(asset('data/swiss-glaciers.json')).then(r => r.ok ? r.json() : null).catch(() => null));
export const swissAllLayer = L.layerGroup();
let swissAllGen = 0;
map.createPane('swissAll'); map.getPane('swissAll').style.zIndex = 425;
const swissRenderer = L.canvas({pane: 'swissAll'});
const swissTip = r => {
  const f = (v, u) => v == null ? '' : `${(+v).toFixed(2).replace(/\.?0+$/, '')} ${u}`, rows = [];
  if (r[2] != null) rows.push(`Area ${f(r[2], 'km²')}`); if (r[3] != null) rows.push(`Length ${f(r[3], 'km')}`); if (r[4] != null && r[5] != null) rows.push(`Elevation ${Math.round(r[4])} to ${Math.round(r[5])} m`);
  return `<b>${escName(r[1] || 'Unnamed glacier')}</b><br>${rows.join('<br>')}<br><small>SGI2023 ${escName(r[0])}</small>`;
};
export async function updateSwissAll(){
  const gen = ++swissAllGen, on = document.getElementById('swissAllToggle').checked && viewMode !== '3d';
  if (!on) { map.removeLayer(swissAllLayer); updateCredits(); return; }
  const f = await loadSwissAll(); if (gen !== swissAllGen) return;
  if (!f) { document.getElementById('swissAllToggle').checked = false; return; }
  if (!swissAllLayer.getLayers().length) f.glaciers.forEach(r => {
    const rings = r[6].map(poly => poly.map(c => { const o = []; for (let i = 0; i < c.length; i += 2) o.push([c[i + 1], c[i]]); return o; }));
    const style = {renderer: swissRenderer, color: getVar('--crevasse'), weight: 1.2, opacity: .9, fillColor: getVar('--crevasse'), fillOpacity: .12};
    const pg = L.polygon(rings, style).bindTooltip(swissTip(r), {sticky: true, direction: 'top', className: 'swiss-tip'});
    pg.on('mouseover', () => pg.setStyle({weight: 2.4, fillOpacity: .3})); pg.on('mouseout', () => pg.setStyle({weight: 1.2, fillOpacity: .12}));
    swissAllLayer.addLayer(pg);
  });
  swissAllLayer.addTo(map); updateCredits();
}
export let speedLayer = null, speedPin = null, speedFile = null, speedKey = '', speedGen = 0;
export const speedFiles = new Map(), speedArrays = new Map();      // glacier id -> the file; "id|year" -> Float of m/yr
export const loadSpeedFile = id => { if (!speedFiles.has(id)) speedFiles.set(id, fetch(asset(`data/itslive/${id}.json`)).then(r => r.ok ? r.json() : null).catch(() => null)); return speedFiles.get(id); };
export async function speedArray(f, year){
  const key = f.id + '|' + year; if (speedArrays.has(key)) return speedArrays.get(key);
  const bin = Uint8Array.from(atob(f.data[year]), c => c.charCodeAt(0));
  const a = new Uint16Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  speedArrays.set(key, a); return a;
}
export function speedYear(){
  if (state.mode === 'compare') return state.b;
  return tlLayers[state.frame] ? tlLayers[state.frame].yr : (state.one || state.to);
}
/* only the glacier itself: the cells inside its oldest outline (the outer limit, the largest extent), found by drawing the outline on the grid of the file; a cell the outline touches counts.
   Without an old outline the newest one is used, without either nothing is shown. */
export const speedMasks = new Map();
export const speedId = g => g.inv ? g.inv.id : g.id;      // the key of the glacier in data/itslive: the SGI id of a Swiss glacier, the record id elsewhere (as in data/boxes.js)
export function speedMask(f, g){
  if (speedMasks.has(f.id)) return speedMasks.get(f.id);
  const geom = oldOutlineGeom(g) || newOutlineGeom(g), m = new Uint8Array(f.w * f.h), pieces = [];
  if (g.rgi) g.rgi.outline.forEach(r => pieces.push(r.map(([la, lo]) => [lo, la])));      // an ice-cap outlet has open lines for its old outlines: its RGI basin polygon is the limit
  else if (geom && geom.type !== 'MultiLineString') eachPiece(geom, pts => pieces.push(pts));
  if (pieces.length) {
    const c = document.createElement('canvas'); c.width = f.w; c.height = f.h; const x = c.getContext('2d', {willReadFrequently: true}), [x0, y0, x1, y1] = f.bbox;
    x.beginPath();
    pieces.forEach(pts => pts.forEach(([lo, la], i) => { const P = L.CRS.EPSG3857.project(L.latLng(la, lo)), X = (P.x - x0) / (x1 - x0) * f.w, Y = (y1 - P.y) / (y1 - y0) * f.h; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }));
    x.fillStyle = x.strokeStyle = '#000'; x.lineWidth = 1; x.fill('evenodd'); x.stroke();
    const d = x.getImageData(0, 0, f.w, f.h).data; for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  }
  speedMasks.set(f.id, m); return m;
}
/* The fastest ice of a year: the highest value along the flowline of the file (`flow`, from the tongue tip up the glacier, made by build_itslive.py) after a running median
   of FLOW_MED points (about 400 m), so that a single bad cell cannot set it; {v in m/yr, xy the Web Mercator place of that point}, or null under SPEED_MIN. A file without
   a flowline falls back to the fastest single cell inside the mask. */
export const FLOW_MED = 7;
export function speedPeak(f, a, mask){
  const [x0, , , y1] = f.bbox, cellOf = (X, Y) => { const c = Math.floor((X - x0) / f.cell), r = Math.floor((y1 - Y) / f.cell); return c >= 0 && c < f.w && r >= 0 && r < f.h ? r * f.w + c : -1; };
  if (f.flow && f.flow.length) {
    const v = f.flow.map(([X, Y]) => { const i = cellOf(X, Y); return i >= 0 && a[i] !== f.nodata ? a[i] * f.step : NaN; });
    let top = 0, at = -1;
    for (let i = 0; i < v.length; i++) {
      const w = v.slice(Math.max(0, i - (FLOW_MED >> 1)), i + (FLOW_MED >> 1) + 1).filter(Number.isFinite).sort((p, q) => p - q);
      if (w.length >= (FLOW_MED >> 1) + 1) { const m = w.length % 2 ? w[w.length >> 1] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2; if (m > top) { top = m; at = i; } }
    }
    return at >= 0 && top >= SPEED_MIN ? {v: top, xy: f.flow[at]} : null;
  }
  let at = -1, top = 0; for (let i = 0; i < a.length; i++) if (mask[i] && a[i] !== f.nodata && a[i] * f.step > top) { top = a[i] * f.step; at = i; }
  return at >= 0 && top >= SPEED_MIN ? {v: top, xy: [x0 + (at % f.w + .5) * f.cell, y1 - (Math.floor(at / f.w) + .5) * f.cell]} : null;
}
/* A year whose map has many gaps along the flowline cannot say where the fastest ice is: ITS_LIVE's first years (2013, 2014) miss the icefall of some glaciers, and the "fastest ice" then comes out far too low.
   A year counts only when at least 90 % as many flowline points have a value as in the best year of the file (computed here). Without a flowline every year counts. */
export async function speedYearOk(f, y){
  if (!f.flow || !f.flow.length) return true;
  if (!f._cov) {
    const [x0, , , y1] = f.bbox, arrs = await Promise.all(f.years.map(yy => speedArray(f, yy)));
    const cov = arrs.map(a => f.flow.reduce((n, [X, Y]) => { const c = Math.floor((X - x0) / f.cell), r = Math.floor((y1 - Y) / f.cell); return n + (c >= 0 && c < f.w && r >= 0 && r < f.h && a[r * f.w + c] !== f.nodata ? 1 : 0); }, 0)), best = Math.max(...cov);
    f._cov = {}; f.years.forEach((yy, i) => { f._cov[yy] = cov[i] >= 0.9 * best; });
  }
  return f._cov[y] !== false;
}
export function speedCanvas(f, a, mask){
  const c = document.createElement('canvas'); c.width = f.w; c.height = f.h; const x = c.getContext('2d'), im = x.createImageData(f.w, f.h);
  for (let i = 0; i < a.length; i++) {
    if (!mask[i] || a[i] === f.nodata) continue; const v = a[i] * f.step; if (v < SPEED_MIN) continue;
    const col = SPEED_LUT[Math.min(255, Math.round((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN) * 255))], o = i * 4;
    im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = Math.round(Math.min(1, (v - SPEED_MIN) / 20) * 230);      // fades in over 20 m/yr: no hard edge at the noise floor
  }
  x.putImageData(im, 0, 0);
  const big = document.createElement('canvas'); big.width = f.w * 4; big.height = f.h * 4;      // the 120 m cells, smoothed (the browser blends premultiplied colours, so no dark rim where the layer fades out)
  const bx = big.getContext('2d'); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.drawImage(c, 0, 0, big.width, big.height); return big;
}
/* Click on the glacier with the speed layer on: the speed of that place in every year of the file, as small bars in a popup. The value of a year is the mean of the cells with a value
   among the 3 x 3 around the click (about 500 m): one 120 m cell is noisy. It is computed here from the product, and the popup says so. Years without a value are empty. */
export const speedPopup = L.popup({maxWidth: 300, className: 'speed-pop'});
export async function speedClick(e){
  const f = speedFile; if (!f || !speedLayer || M.mode || (wire.pinArmed && wire.pinArmed())) return;      // a click that drops a pin is the pin's: its card shows the speed
  const [x0, , , y1] = f.bbox, P = L.CRS.EPSG3857.project(e.latlng), c0 = Math.floor((P.x - x0) / f.cell), r0 = Math.floor((y1 - P.y) / f.cell);
  if (c0 < 0 || c0 >= f.w || r0 < 0 || r0 >= f.h) return;
  const arrs = await Promise.all(f.years.map(y => speedArray(f, y))); if (f !== speedFile || (wire.pinOn3 && wire.pinOn3())) return;      // no speed popup while a pin is placed: it would sit on the pin and its card
  const vals = arrs.map(a => { let n = 0, t = 0; for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) if (r >= 0 && r < f.h && c >= 0 && c < f.w && a[r * f.w + c] !== f.nodata) { n++; t += a[r * f.w + c] * f.step; } return n ? t / n : null; });
  if (!vals.some(v => v != null && v >= SPEED_MIN)) return;      // not on the moving ice
  const W = 260, H = 84, B = 14, mx = Math.max(...vals.filter(v => v != null)), step = W / f.years.length, bw = step * .66, shown = speedYear();
  const bars = f.years.map((y, i) => { const v = vals[i], h = v == null ? 0 : Math.max(1, v / mx * (H - B - 4)), x = i * step + (step - bw) / 2;
    return `<g><title>${y}: ${v == null ? 'no value' : Math.round(v) + ' m/yr'}</title><rect x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"/>${v == null ? '' : `<rect x="${x.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--crevasse)" opacity="${y === shown ? 1 : .4}"/>`}<text x="${(i * step + step / 2).toFixed(1)}" y="${H - 2}" font-size="8" text-anchor="middle" fill="var(--moraine)">${f.years.length > 14 && i % 2 ? '' : String(y).slice(2)}</text></g>`; }).join('');
  const k = f.years.indexOf(shown), now = k >= 0 && vals[k] != null ? `${shown}: <b>${Math.round(vals[k])} m/yr</b>. ` : '';
  speedPopup.setLatLng(e.latlng).setContent(`<div class="speed-hist"><b>Speed here, ${f.years[0]} to ${f.years[f.years.length - 1]}</b><svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Surface speed at this place per year: ${f.years.map((y, i) => `${y} ${vals[i] == null ? 'no value' : Math.round(vals[i]) + ' m/yr'}`).join(', ')}">${bars}</svg><small>${now}Yearly mean surface speed, ITS_LIVE; mean of the 3 × 3 cells around the click, computed here.</small></div>`).openOn(map);
}
map.on('click', speedClick);
export async function updateSpeed(){
  const gen = ++speedGen, on = document.getElementById('speedToggle').checked && glacierPicked && viewMode !== '3d' && FEATURES.speed, legend = document.getElementById('speedLegend'), note = document.getElementById('speedNote');
  legend.hidden = !document.getElementById('speedToggle').checked || !FEATURES.speed;
  const drop = () => { map.closePopup(speedPopup); if (speedPin) { map.removeLayer(speedPin); speedPin = null; } speedFile = null; if (speedLayer) { map.removeLayer(speedLayer); speedLayer = null; speedKey = ''; updateCredits(); } };
  if (!on) return drop();
  const g = currentGlacier(), id = speedId(g), yr = speedYear();
  const f = id && await loadSpeedFile(id); if (gen !== speedGen) return;
  if (!f) { note.textContent = 'No ice speed data for this glacier.'; return drop(); }
  if (!f.years.includes(yr)) { note.textContent = `${yr ? `No ice speed for ${yr}: ` : ''}the ITS_LIVE annual maps cover ${f.years[0]} to ${f.years[f.years.length - 1]}.`; return drop(); }
  note.textContent = `Mean surface speed in ${yr}${state.mode === 'compare' ? ' (right-hand picture)' : ''}, ITS_LIVE. Under 5 m/yr is not told apart from rock, so it stays clear.`;
  const key = id + '|' + yr; if (speedLayer && speedKey === key) return;
  const a = await speedArray(f, yr); if (gen !== speedGen) return;
  const [x0, y0, x1, y1] = f.bbox, sw = L.CRS.EPSG3857.unproject(L.point(x0, y0)), ne = L.CRS.EPSG3857.unproject(L.point(x1, y1));
  const layer = L.imageOverlay(speedCanvas(f, a, speedMask(f, g)).toDataURL(), [[sw.lat, sw.lng], [ne.lat, ne.lng]], {pane: 'speedPane', opacity: .9, interactive: false, className: 'speed-img'});
  if (speedLayer) map.removeLayer(speedLayer); speedLayer = layer.addTo(map); speedKey = key; speedFile = f;
  if (speedPin) { map.removeLayer(speedPin); speedPin = null; }
  const pk = await speedYearOk(f, yr) ? speedPeak(f, a, speedMask(f, g)) : null;      // the fastest ice of the year along the flowline, marked like the thickest ice
  if (pk) {
    const top = pk.v, p = L.CRS.EPSG3857.unproject(L.point(pk.xy[0], pk.xy[1]));
    speedPin = L.marker(p, {icon: L.divIcon({className: '', html: `<div class="tongue-pin max-pin"><span>${Math.round(top)} m/yr (${yr})</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15]}), interactive: false, keyboard: false, zIndexOffset: 500}).addTo(map);
  }
  updateCredits();
}
/* The thickest ice of a glacier, as one value: the maximum of the ice thickness map of Grab et al. (2021), SwissGlacierThickness-R2020, in the year of that map (`inv.model`: the Summary.shp
   `h_max` and `year_mode`, and the place of that cell), or the radar maximum when its survey is newer than the map. `kind` names the source, `at` is the place. */
export function thickestSpot(g){
  const inv = g && g.inv, M = inv && inv.model, R = inv && inv.radar;
  if (R && R.max_at && R.max_year && (!M || R.max_year > M.year)) return {m: R.max_m, year: R.max_year, kind: 'radar', at: R.max_at};
  return M ? {m: M.max_m, year: M.year, kind: 'model', at: M.at, plus: M.plus, minus: M.minus} : null;
}
export const spotText = s => `${Math.round(s.m)} m (${s.year ? `${s.year}, ` : ''}${s.kind})`;
/* the place of the thickest ice of the selected glacier: a layer of its own, one label on the map, "794 m (2017, model)" */
export function drawMax(){
  if (maxMarker) { map.removeLayer(maxMarker); maxMarker = null; }
  const on = document.getElementById('maxToggle').checked, g = typeof glacierPicked !== 'undefined' && !glacierPicked ? null : currentGlacier(), T = thickestSpot(g);
  if (on && T) {
    // the same look as the tongue indication: ring with a red label; the label keeps the case it is written in
    maxMarker = L.marker(T.at, {icon: L.divIcon({className: '', html: `<div class="tongue-pin max-pin"><span>${spotText(T)}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15]}), interactive: false, keyboard: false, zIndexOffset: 500}).addTo(map);
  }
  document.getElementById('maxNote').hidden = !on || !!T;
  updateCredits();
}

/* ---------- measuring ---------- */
export const M = {mode:null, pts:[], temp:null, group:L.layerGroup().addTo(map)};
export const fmtLen = m => m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(m < 10000 ? 2 : 1)} km`;
export const fmtArea = m2 => m2 < 1e5 ? `${Math.round(m2).toLocaleString('en')} m²` : `${(m2/1e6).toFixed(2)} km²`;
export const pathLen = pts => pts.reduce((s, p, i) => i ? s + map.distance(pts[i-1], p) : 0, 0);
export const ringOf = pts => pts.map(p => [p.lng, p.lat]);
export const updateClear = () => { document.getElementById('measureClear').hidden = !M.group.getLayers().length; };   // hide the eraser until something is drawn
export function startMeasure(mode){
  cancelMeasure(); if (wire.disarmPin) wire.disarmPin();      // one tool at a time
  M.mode = mode; map.doubleClickZoom.disable();
  document.getElementById('app').classList.add('measuring');
  document.getElementById({dist:'measureDist', area:'measureArea', sect:'measureSect'}[mode]).setAttribute('aria-pressed', 'true');
  document.getElementById('measureHint').classList.add('show');
  updateMeasureText();
}
export function updateMeasureText(cursor){
  const pts = cursor ? [...M.pts, cursor] : M.pts, el = document.getElementById('measureText');
  const phone = COARSE, tap = phone ? 'Tap' : 'Click';          // on phones the hint stays short: it sits on the picture
  if (M.mode === 'sect') el.textContent = pts.length ? `Cross-section, step 2 of 2: ${tap.toLowerCase()} the other side of the glacier.` : `Cross-section, step 1 of 2: ${tap.toLowerCase()} the map on one side of the glacier.`;
  else if (!pts.length) el.textContent = M.mode === 'dist' ? `${tap} the map to start a line.` : `${tap} the map to start an area.`;
  else if (M.mode === 'dist') el.textContent = `Length ${fmtLen(pathLen(pts))}.${phone ? '' : ' Double-click or press Finish.'}`;
  else el.textContent = pts.length < 3 ? (phone ? 'Add 3 points.' : 'Add at least three points.') : `Area ${fmtArea(geodesicArea(ringOf(pts)))}.${phone ? '' : ' Double-click or press Finish.'}`;
}
export function drawTemp(cursor){
  if (M.temp) M.group.removeLayer(M.temp);
  const pts = cursor ? [...M.pts, cursor] : M.pts;
  const style = {pane:'measure', color:getVar('--measure'), weight:3, dashArray:'6 5', fillOpacity:.15, interactive:false};
  M.temp = (M.mode === 'area' && pts.length > 2 ? L.polygon(pts, style) : L.polyline(pts, style)).addTo(M.group);
  updateMeasureText(cursor); updateClear();
}
map.on('click', e => {
  if (!M.mode) return; M.pts.push(e.latlng); drawTemp();
  if (M.mode === 'sect' && M.pts.length === 2) finishSection();      // a cross-section is just two points
});
map.on('mousemove', e => { if (M.mode && M.pts.length) drawTemp(e.latlng); });
map.on('dblclick', () => M.mode && finishMeasure());
export function finishMeasure(){
  // a double-click adds the same point twice; drop near-duplicates
  M.pts = M.pts.filter((p, i) => i === 0 || map.distance(p, M.pts[i-1]) > 0.5);
  const need = M.mode === 'dist' ? 2 : 3;
  if (M.pts.length < need) return cancelMeasure();
  if (M.temp) M.group.removeLayer(M.temp);
  const style = {pane:'measure', color:getVar('--measure'), weight:3, fillOpacity:.18};
  let shape, label;
  if (M.mode === 'dist') { shape = L.polyline(M.pts, style); label = fmtLen(pathLen(M.pts)); }
  else { shape = L.polygon(M.pts, style); label = `${fmtArea(geodesicArea(ringOf(M.pts)))}, perimeter ${fmtLen(pathLen([...M.pts, M.pts[0]]))}`; }
  shape.addTo(M.group).bindTooltip(label, {permanent:true, direction:'center', className:'m-label'});
  const mode = M.mode; M.temp = null; endMeasure(); startMeasure(mode);   // stay in the tool for the next shape
}
function finishSection(){            // the line is kept on the map and the view flies into 3D, where the cut and its chart are drawn
  const ll = M.pts.map(p => [p.lat, p.lng]);
  if (M.temp) M.group.removeLayer(M.temp);
  M.temp = null; endMeasure();
  M.group.addLayer(L.polyline(ll, {pane:'measure', color:getVar('--measure'), weight:3, interactive:false})); updateClear();
  wire.sectFromMap(ll);
}
export function cancelMeasure(){ if (M.temp) M.group.removeLayer(M.temp); M.temp = null; endMeasure(); }
export function endMeasure(){
  M.mode = null; M.pts = []; map.doubleClickZoom.enable();
  document.getElementById('app').classList.remove('measuring');
  ['measureDist','measureArea','measureSect'].forEach(id => document.getElementById(id).setAttribute('aria-pressed','false'));
  document.getElementById('measureHint').classList.remove('show');
  updateClear();
}
document.getElementById('measureDist').onclick = () => M.mode === 'dist' ? cancelMeasure() : startMeasure('dist');
document.getElementById('measureArea').onclick = () => M.mode === 'area' ? cancelMeasure() : startMeasure('area');
document.getElementById('measureSect').onclick = () => {
  if (M.mode === 'sect') return cancelMeasure();
  const g = currentGlacier();
  if (!g || !(g.inv && g.inv.radar)) return wire.showNotice('The thickness cross-section needs GLAMOS radar data, which this glacier does not have.');
  startMeasure('sect');
};
document.getElementById('measureFinish').onclick = finishMeasure;
document.getElementById('measureCancel').onclick = cancelMeasure;
document.getElementById('measureClear').onclick = () => { cancelMeasure(); M.group.clearLayers(); updateClear(); };
updateClear();
document.addEventListener('keydown', e => {
  if (!M.mode) return;
  if (e.key === 'Escape') cancelMeasure();
  if (e.key === 'Enter') finishMeasure();
  if (e.key === 'Backspace' && M.pts.length && document.activeElement === document.body) { M.pts.pop(); drawTemp(); }
});

/* ---------- toolbar ---------- */
document.getElementById('zoomIn').onclick = () => map.zoomIn();
document.getElementById('zoomOut').onclick = () => { if (!$('videoSheet').hidden && map.getZoom() <= map.getMinZoom() + 0.01) wire.showNotice('Zoomed out as far as the download frame allows: it has to stay near the picture of this glacier.'); map.zoomOut(); };
document.getElementById('fitBtn').onclick = () => fitGlacier();
document.getElementById('labelsToggle').onchange = e => { e.target.checked ? labels.addTo(map) : map.removeLayer(labels); updateCredits(); };
document.getElementById('oldToggle').checked = prefs.old === true;      // the 1850 outline is off until it is switched on
document.getElementById('oldToggle').onchange = () => { prefs.old = document.getElementById('oldToggle').checked; savePrefs(); drawOutlines(); };
document.getElementById('newToggle').onchange = drawOutlines;
export function fitGlacier(animate = true){ if (typeof wire.subFocus !== 'undefined') wire.setSubFocus(null); const v = wholeView(); map.setView(v.center, v.zoom, {animate}); }      // the Whole glacier button (and its symbol on phones): the same view everywhere, centred on the image box
export const TONGUE_ZOOM = 13.75;  // default; a glacier can set its own with tz (higher = closer)
/* The tip of the tongue is the lowest point of the newest outline (found by build_outlines.py with the swisstopo height service).
   The view is centred a little up the glacier from the tip and fitted around the last 2 km of the outline,
   so the tip sits near the middle of the screen with room around it, whatever the window size. */
export const TONGUE_REACH = 2000, TONGUE_SHIFT = 0.4;     // metres; share of the way from the tip to the middle of that stretch
export const TONGUE_VIEW = {aletsch: {reach: 3000, north: 2000, west: -800}, gorner: {west: -1507, north: -707}, fiescher: {north: 2407, west: -707}, corbassiere: {out: 0, north: -1500, west: 200}, unteraar: {west: 2000, north: 500}, rhone: {north: 1000, west: 200}, zmutt: {out: 0.25}, fee: {out: 0.75, north: -1100}};      // a start view of its own: Aletsch shows 3 km of the tongue instead of 2, moved 2 km north and 0.8 km east; the Gorner view is moved 1.5 km east and 0.7 km south (west: metres, negative = east); Fiescher is moved 2.4 km north and 0.7 km east, Fee 1.1 km south, Rhone 1 km north and 0.2 km west, Corbassière 1.5 km south and 0.2 km west at the default zoom, Unteraar 2 km west and 0.5 km north (north: metres, negative = south); Zmutt starts a quarter and Fee three quarters of a zoom level further out (out)
export const TONGUE_ZOOM_OUT = 1;                          // zoom levels left out of the closest fit, for more surroundings
export function tongueBounds(g){
  if (g.half) return L.latLngBounds(g.box);      // Iceland: the tongue view shows the picture box (the big glaciers are pictured only where the tongue is)
  const geom = g.inv && g.inv.outline, T = g.inv && g.inv.terminus;
  if (!geom || !T) return null;
  const ring = geom.coordinates.map(poly => poly[0]).sort((a, b) => b.length - a.length)[0];    // the main body
  if (!ring) return null;
  const tip = L.latLng(T.tip), gb = L.latLngBounds(g.bounds), size = Math.max(gb.getSouthWest().distanceTo(gb.getSouthEast()), gb.getSouthWest().distanceTo(gb.getNorthWest())),
    ov = TONGUE_VIEW[g.id] || {}, reach = Math.min(ov.reach || TONGUE_REACH, size * 0.35), near = ring.map(([x, y]) => L.latLng(y, x)).filter(p => p.distanceTo(tip) <= reach);   // a small glacier gets a smaller window
  if (near.length < 3) return null;
  const mid = L.latLngBounds(near).getCenter();
  const c = L.latLng(tip.lat + (mid.lat - tip.lat) * TONGUE_SHIFT, tip.lng + (mid.lng - tip.lng) * TONGUE_SHIFT);
  const dLat = Math.max(...near.map(p => Math.abs(p.lat - c.lat))), dLng = Math.max(...near.map(p => Math.abs(p.lng - c.lng)));
  const dW = ov.west ? ov.west / (111320 * Math.cos(c.lat * Math.PI / 180)) : 0;      // moved west as it is: the same window, not a bigger one
  const dN = (ov.north || 0) / 111320;      // moved north in the same way
  return L.latLngBounds([c.lat - dLat + dN, c.lng - dLng - dW], [c.lat + dLat + dN, c.lng + dLng - dW]);    // symmetric around c
}
/* Tongue indication: a ring with a label at the tip (lowest point of the outline), switched on in the layer box */
export let tonguePin = null;
export function drawTonguePin(){
  if (tonguePin) map.removeLayer(tonguePin);
  tonguePin = null;
  const g = currentGlacier(), at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue;
  if (!document.getElementById('pinToggle').checked || !at) return;
  tonguePin = L.marker(at, {icon: L.divIcon({className: '', html: '<div class="tongue-pin"><span>Tongue</span></div>', iconSize: [30, 30], iconAnchor: [15, 15]}), interactive: false, keyboard: false}).addTo(map);
}
/* ---------- tongue arcs (experiment, local only) ----------
   The yearly arcs of the lowest ~2 km of the outline of a glacier (data/tongue-arcs.js, made by scripts/build_tongue_arcs.py from the GlaViTU experiment).
   Timelapse: the year on show is a red line that fades into the tongue (like the 1850 outline), the area lost since the first year of the range is one even tint outside it
   (nothing before that first year is drawn), the newest band lights up for a moment, and the first year carries a small label. Slider: only the two chosen years. One image
   (and Latest): that year. Canvas, one layer under the outlines. */
let arcFile = null, arcAnim = null, arcShown = '';
export const arcsFor = g => g && window.TONGUE_ARCS && window.TONGUE_ARCS[g.id];
export const loadArcs = () => window.TONGUE_ARCS ? Promise.resolve() : arcFile || (arcFile = new Promise(res => { const sc = document.createElement('script'); sc.src = asset('data/tongue-arcs.js'); sc.onload = () => res(); sc.onerror = () => res(); document.head.appendChild(sc); }));
function arcSet(A){      // which years are drawn: {mode, ys (ascending, only those with an arc), yr (the one on show), first}
  const has = y => !!(A.arcs[y]), m = state.mode;
  if (m === 'compare') { const ys = [...new Set([state.a, state.b])].filter(has).sort(); return {mode: m, ys, yr: ys[ys.length - 1], first: ys[0]}; }
  if (m === 'timelapse') { const yr = tlLayers[state.frame] ? tlLayers[state.frame].yr : state.to, f = tlLayers[0] ? tlLayers[0].yr : yr; return {mode: m, ys: Object.keys(A.arcs).map(Number).filter(y => y >= f && y <= yr).sort(), yr, first: f}; }
  const yr = state.latest ? state.latest.year : state.one; return {mode: m, ys: has(yr) ? [yr] : [], yr, first: yr};
}
function strokeUpTo(ctx, pts, frac){
  if (frac <= 0) return;
  let tot = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const lim = tot * Math.min(1, frac); ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= lim) { ctx.lineTo(...pts[i]); continue; }
    const k = (lim - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k); break;
  }
  ctx.stroke();
}
/* An arc is an open line: it fades out towards its two loose ends. It is cut into short pieces whose opacity follows a smooth ramp over the first and last fifth of its length. */
function arcPieces(pts){
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], F = .2, N = 8, ramp = x => x * x * (3 - 2 * x);
  if (!(L > 0)) return [{pts, w: 1}];
  const cut = (a, b) => {      // the points of the line between the lengths a and b
    const at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const k = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; };
    const out = [at(a)]; for (let i = 1; i < pts.length - 1; i++) if (cum[i] > a && cum[i] < b) out.push(pts[i]); out.push(at(b)); return out;
  };
  const out = [{pts: cut(F * L, (1 - F) * L), w: 1}];
  for (let j = 0; j < N; j++) {
    const w = ramp((j + .5) / N);
    out.push({pts: cut(F * L * j / N, F * L * (j + 1) / N), w}, {pts: cut(L - F * L * (j + 1) / N, L - F * L * j / N), w});
  }
  return out;
}
export function arcStroke(ctx, pts, color, alpha, width){      // a plain line that fades out to its loose ends
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';      // butt caps: round ones overlap at the joins and show as beads
  arcPieces(pts).forEach(c => { ctx.globalAlpha = alpha * c.w; strokeUpTo(ctx, c.pts, 1); }); ctx.restore();
}
/* a line as the 1850 outline is drawn: hard on the edge, a colour that fades towards the inside of the tongue (the arc closed by a straight line across its top), and both fade out to the loose ends */
export function arcEdgeFade(ctx, pts, color, alpha = 1, k = .3, w = 2){
  const pieces = arcPieces(pts);
  /* like strokeEdgeFade, but thinner (5 % instead of 12 %): the fade is no wider than 5 % of the shorter side of the closed shape as drawn, so zoomed out it never fills the tongue */
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  k = Math.max(.01, Math.min(k, .05 * Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 34));
  ctx.save(); ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip('evenodd');
  pieces.forEach(c => { ctx.globalAlpha = .07 * alpha * c.w; for (let i = 0; i < 9; i++) { ctx.lineWidth = 2 * k * (34 - i * 3.6); strokeUpTo(ctx, c.pts, 1); } });
  ctx.restore(); arcStroke(ctx, pts, color, alpha, w);
}
/* the year, small, at the tongue tip of its line (the point furthest from the arc's two ends), just outside; with a thin line to the tip when the label has to stand further out to be clear of the other lines */
export function arcLabel(ctx, pts, others, text, color, alpha = 1){
  const a = pts[0], z = pts[pts.length - 1], mx = (a[0] + z[0]) / 2, my = (a[1] + z[1]) / 2;
  let tip = a, dd = -1; pts.forEach(p => { const d = Math.hypot(p[0] - mx, p[1] - my); if (d > dd) { dd = d; tip = p; } });
  const ux = (tip[0] - mx) / (dd || 1), uy = (tip[1] - my) / (dd || 1), clear = (x, y) => others.every(o => Math.hypot(o[0] - x, o[1] - y) > 12);
  let off = 11; for (const o of [11, 20, 30]) { off = o; if (clear(tip[0] + ux * o, tip[1] + uy * o)) break; }
  const lx = tip[0] + ux * off, ly = tip[1] + uy * off;
  ctx.save(); ctx.globalAlpha = alpha;
  if (off > 11) { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(tip[0] + ux * (off - 7), tip[1] + uy * (off - 7)); ctx.stroke(); }
  ctx.font = '600 9px "Schibsted Grotesk", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(10,20,38,.8)'; ctx.fillStyle = color;
  ctx.strokeText(text, lx, ly); ctx.fillText(text, lx, ly); ctx.restore();
}
const arcFront = (A, y) => A.arcs[y] ? A.arcs[y].front_behind_sgi_front_m : null;      // as the experiment states it: the larger, the further back the front, the smaller the glacier
const ArcCanvas = L.Layer.extend({
  onAdd(m){
    this._c = L.DomUtil.create('canvas', 'leaflet-zoom-hide'); this._c.style.pointerEvents = 'none'; m.getPane('outlines').appendChild(this._c);
    m.on('move zoom viewreset resize', this.draw, this); m.on('mousemove', this._hoverAt, this); m.on('mouseout', this._unhover, this); m.on('click', this._click, this); this.draw();
  },
  onRemove(m){ m.off('move zoom viewreset resize', this.draw, this); m.off('mousemove', this._hoverAt, this); m.off('mouseout', this._unhover, this); m.off('click', this._click, this); this._unhover(); this._c.remove(); },
  _near(p){      // the drawn arc nearest to a container point, within a few pixels
    /** @type {{y: any, d: number} | null} */
    let best = null;
    (this._hit || []).forEach(({y, pts}) => { for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i], dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, k = l ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / l)) : 0;
      const d = Math.hypot(p.x - (x1 + k * dx), p.y - (y1 + k * dy)); if (d < 7 && (!best || d < best.d)) best = {y, d};
    } });
    return best ? best.y : null;
  },
  _hoverAt(e){      // the nearest drawn arc: highlighted, with year, scene, source and model in a small tooltip; a click opens the field notes
    const A = arcsFor(currentGlacier()), y = this._near(e.containerPoint);
    if (y === this._hover) { if (this._tip && y) this._tip.setLatLng(e.latlng); return; }
    this._hover = y; this._map.getContainer().style.cursor = y ? 'pointer' : ''; this.draw();
    if (!y || !A) return this._unhover();
    const html = `<b>${y}</b> · experimental outline<br><small>Click for more info</small>`;
    this._tip = (this._tip || L.tooltip({direction: 'top', offset: [0, -6], opacity: .96})).setLatLng(e.latlng).setContent(html); this._map.openTooltip(this._tip);
  },
  _click(e){ const g = currentGlacier(); if (g && g.inv && this._near(e.containerPoint)) window.open(`provenance.html?id=${g.inv.id}#arcsnote`, '_blank', 'noopener'); },
  _unhover(){ if (this._tip && this._map) this._map.closeTooltip(this._tip); this._tip = null; if (this._map) this._map.getContainer().style.cursor = ''; if (this._hover) { this._hover = null; if (this._map) this.draw(); } },
  draw(){
    const m = this._map, g = currentGlacier(), A = arcsFor(g); if (!m || !A) return;
    const sz = m.getSize(), c = this._c, dpr = window.devicePixelRatio || 1;
    c.width = sz.x * dpr; c.height = sz.y * dpr; c.style.width = sz.x + 'px'; c.style.height = sz.y + 'px'; L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineJoin = ctx.lineCap = 'round';
    const S = arcSet(A), {ys, yr, first} = S; this._hit = []; if (!ys.length) return;
    const cache = {}, px = y => cache[y] || (cache[y] = A.arcs[y].line.map(([lng, lat]) => { const q = m.latLngToContainerPoint([lat, lng]); return [q.x, q.y]; }));
    ys.forEach(y => this._hit.push({y, pts: px(y)}));
    const t = arcAnim && arcAnim.yr === yr ? Math.min(1, (performance.now() - arcAnim.t0) / arcAnim.dur) : 1, e = 1 - Math.pow(1 - t, 3);
    const kz = Math.max(.45, Math.min(1.1, Math.pow(2, m.getZoom() - 15) * .5)), RED = '#C8322A', BLUE = '#7FA6F0', PALE = '#EEF3FF';
    const band = (y, cx = ctx) => { const lo = px(y - 1), up = px(y); cx.beginPath(); [...lo, ...up.slice().reverse()].forEach(([x, z], i) => i ? cx.lineTo(x, z) : cx.moveTo(x, z)); cx.closePath(); };      // the area between two years' arcs
    const others = y => ys.filter(o => o !== y).flatMap(px);
    if (S.mode === 'timelapse') {
      const sc = this._s || (this._s = document.createElement('canvas')); sc.width = c.width; sc.height = c.height;      // the bands overlap where the arcs cross: they are drawn solid on a scratch canvas and put on the map once, so the tint is the same everywhere
      const sx = sc.getContext('2d'); sx.scale(dpr, dpr); sx.fillStyle = RED;
      ys.forEach(y => { if (y === first || !A.arcs[y - 1]) return; band(y, sx); sx.fill('evenodd'); });
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .16; ctx.drawImage(sc, 0, 0); ctx.restore();      // one even tint for all the area lost since the first year
      if (t < 1 && yr > first && A.arcs[yr - 1]) {      // the newest band: a warm flash and a glow towards the new line, both gone when the animation ends
        ctx.save(); band(yr); ctx.clip('evenodd'); const pts = px(yr);
        ctx.strokeStyle = RED; ctx.globalAlpha = .075 * Math.sin(Math.PI * t); for (let i = 0; i < 9; i++) { ctx.lineWidth = 2 * kz * (30 - i * 3.2); strokeUpTo(ctx, pts, 1); }
        ctx.fillStyle = '#FFC98A'; ctx.globalAlpha = .5 * Math.sin(Math.PI * Math.min(1, t * 1.15)); ctx.fillRect(0, 0, sz.x, sz.y); ctx.restore();
      }
      ys.forEach(y => { if (y !== yr) arcStroke(ctx, px(y), PALE, y === first ? .65 : yr - y === 1 ? .6 : .3, 2.4 * kz); });      // earlier years: thin pale lines
      arcEdgeFade(ctx, px(yr), RED);
    } else if (S.mode === 'compare') {      // the slider: each side of the divider shows one year's picture; an outline of a smaller glacier is dimmed where the picture shows the bigger one
      const horizontal = horiz(), cut = (horizontal ? sz.y : sz.x) * state.split, imgYear = {A: state.a, B: state.b};
      const rect = side => horizontal ? (side === 'A' ? [0, 0, sz.x, cut] : [0, cut, sz.x, sz.y - cut]) : (side === 'A' ? [0, 0, cut, sz.y] : [cut, 0, sz.x - cut, sz.y]);
      const dim = (y, r) => { const f = arcFront(A, y), fr = arcFront(A, r); return f !== null && fr !== null && f > fr ? .3 : 1; };
      ['A', 'B'].forEach(side => { ctx.save(); ctx.beginPath(); ctx.rect(...rect(side)); ctx.clip(); ys.forEach(y => arcEdgeFade(ctx, px(y), y === yr ? RED : BLUE, dim(y, imgYear[side]))); ctx.restore(); });
      ys.forEach(y => { const tip = px(y).reduce((a, b) => b[1] > a[1] ? b : a), side = (horizontal ? tip[1] : tip[0]) < cut ? 'A' : 'B'; arcLabel(ctx, px(y), others(y), String(y), y === yr ? RED : BLUE, dim(y, imgYear[side])); });
    } else arcEdgeFade(ctx, px(yr), RED);
    if (S.mode === 'timelapse' && yr > first && A.arcs[first]) arcLabel(ctx, px(first), others(first), String(first), PALE);      // the first year's line carries its year
    if (this._hover && cache[this._hover]) arcStroke(ctx, cache[this._hover], '#fff', .95, 3.2);
    ctx.globalAlpha = 1;
  },
});
let arcIdle = false;
export function drawArcs(animate){
  const g = typeof glacierPicked !== 'undefined' && !glacierPicked ? null : currentGlacier(), A = arcsFor(g), row = document.getElementById('arcsRow');
  if (!window.TONGUE_ARCS && !arcFile) {      // the row appears once the file is there: at once when the layer is on, else when the browser is idle (not in the first view)
    const go = () => loadArcs().then(() => drawArcs(false));
    if (document.getElementById('arcsToggle').checked) go(); else if (!arcIdle) { arcIdle = true; (window.requestIdleCallback || (f => setTimeout(f, 4000)))(go, { timeout: 8000 }); }
  }
  if (row) row.hidden = !A;
  const on = !!(A && document.getElementById('arcsToggle').checked && !document.body.classList.contains('pane-open') && viewMode !== '3d');
  if (!on) { if (arcLayer) { map.removeLayer(arcLayer); arcLayer = null; arcAnim = null; arcShown = ''; updateCredits(); } return; }
  const S = arcSet(A), yr = S.yr, key = `${g.id}:${S.mode}:${S.first}:${yr}`;
  if (!arcLayer) { arcLayer = new ArcCanvas().addTo(map); animate = true; updateCredits(); }
  if (animate && key !== arcShown && S.mode === 'timelapse' && !matchMedia('(prefers-reduced-motion: reduce)').matches && A.arcs[yr]) {
    arcAnim = {yr, t0: performance.now(), dur: 1500};
    const step = () => { if (!arcLayer || !arcAnim || arcAnim.yr !== yr) return; arcLayer.draw(); if (performance.now() - arcAnim.t0 < arcAnim.dur) requestAnimationFrame(step); else { arcAnim = null; arcLayer.draw(); } };
    requestAnimationFrame(step);
  } else if (!arcAnim) arcLayer.draw();
  arcShown = key;
}
/* The tongue view is always closer than the whole-glacier view: at least TONGUE_CLOSER zoom levels more. */
export const TONGUE_CLOSER = 1;
export function wholeGlacierZoom(g){ return map.getBoundsZoom(g.bounds, false, L.point(40, 40)); }
export function tongueView(){          // {center, zoom} the Tongue button goes to, or null
  const g = currentGlacier(), b = tongueBounds(g), small = matchMedia('(max-width:720px)').matches;
  if (g.half) { const pad = small ? [24, 64] : [40, 80]; return map._getBoundsCenterZoom(b, {paddingTopLeft: pad, paddingBottomRight: small ? [24, 100] : [40, 110]}); }      // exactly the picture box
  if (b) {
    const tl = L.point(small ? 24 : 40, small ? 64 : 80), br = L.point(small ? 24 : 40, small ? 100 : 110);
    const fit = map.getBoundsZoom(b, false, tl.add(br));
    const zoom = Math.min(map.getMaxZoom(), Math.max(Math.min(15, fit - TONGUE_ZOOM_OUT), wholeGlacierZoom(g) + TONGUE_CLOSER)) - ((TONGUE_VIEW[g.id] || {}).out || 0);
    // centre like fitBounds with padding, at that zoom
    const mid = map.project(b.getSouthWest(), zoom).add(map.project(b.getNorthEast(), zoom)).divideBy(2).add(br.subtract(tl).divideBy(2));
    return {center: map.unproject(mid, zoom), zoom};
  }
  return g.tongue ? {center: L.latLng(g.tongue), zoom: g.tz || TONGUE_ZOOM} : null;
}
export function focusTongue(animate = true){
  if (typeof wire.subFocus !== 'undefined') wire.setSubFocus(null);
  const v = tongueView();
  if (v) map.setView(v.center, v.zoom, {animate});
  else fitGlacier(animate);
}
export function wholeView(){      // the whole glacier with the image box in the middle of the viewer: the area is the glacier and the box, mirrored about the centre of the box
  const g = currentGlacier(), gb = L.latLngBounds(g.bounds), pad = {padding: [20, 20]};
  const fp = imageFootprint(g); if (!fp || !fp.bounds) return map._getBoundsCenterZoom(gb, pad);
  const bx = L.latLngBounds(fp.bounds), all = L.latLngBounds(gb.getSouthWest(), gb.getNorthEast()).extend(bx), c = bx.getCenter();
  const n = Math.max(all.getNorth() - c.lat, c.lat - all.getSouth()), e = Math.max(all.getEast() - c.lng, c.lng - all.getWest());
  return map._getBoundsCenterZoom(L.latLngBounds([c.lat - n, c.lng - e], [c.lat + n, c.lng + e]), pad);
}
/* the Tongue and Whole glacier buttons grey out while the map already shows their view (within 3 px) */
export function syncViewButtons(){
  if (!map || !currentGlacier()) return;
  const here = (v) => v && Math.abs(map.getZoom() - v.zoom) < 0.02 && map.project(map.getCenter(), v.zoom).distanceTo(map.project(v.center, v.zoom)) < 3;
  const t = document.getElementById('tongueBtn'), f = document.getElementById('fitBtn');
  t.disabled = !!here(tongueView());
  f.disabled = !!here(wholeView());
}
map.on('moveend zoomend resize', syncViewButtons);
document.getElementById('tongueBtn').onclick = () => focusTongue();
export function setLayerB(v){ return layerB = v; }      // the other files may not assign to an imported variable
export function setLayerA(v){ return layerA = v; }      // the other files may not assign to an imported variable
export function setTrailClipKey(v){ return trailClipKey = v; }      // the other files may not assign to an imported variable
export function setSliderHintDone(v){ return sliderHintDone = v; }      // the other files may not assign to an imported variable
