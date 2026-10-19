/* =====================================================================
   5. Map
   ===================================================================== */
const TWO_FINGER = matchMedia('(pointer:coarse)').matches;   // touch screens: one finger scrolls the page, two move the map
const map = L.map('map', {zoomControl:false, attributionControl:false, minZoom:8, maxZoom:17, zoomSnap:0.25, zoomDelta:0.5, wheelPxPerZoomLevel:120, dragging: !TWO_FINGER});      // fine zoom steps: quarter levels, half a level per button press
[['bgPane',205],['siA',207],['siB',208],['siT',209],['thickPane',300],['paneA',210],['paneB',220],['paneT',230],['outlines',430],['sightPane',440],['labels',450],['measure',620]].forEach(([n,z]) => {
  map.createPane(n); map.getPane(n).style.zIndex = z;
});
map.getPane('bgPane').style.filter = 'brightness(1.12) saturate(1)';   // background a little brighter than the plain tiles
map.getPane('labels').style.pointerEvents = 'none';
/* The scale bar: a white bar with a tick at each end and its length written centred above, the same as the scale bar of the map key on the downloads. It sits where Leaflet's own scale sat (same class, so the
   margins of the toolbar rules still apply). */
const NiceScale = L.Control.extend({
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
const scaleCtl = new NiceScale().addTo(map);
/* On bigger screens the scale bar sits beside the LAYERS button (to its left, level with it, wherever that button is for the mode); on phones it stays at the bottom right. */
function placeScale(){
  const el = scaleCtl._el, lb = document.getElementById('layerbox'), st = document.getElementById('stage'); if (!el || !lb || !st) return;
  const desk = matchMedia('(min-width:721px) and (min-height:521px)').matches && lb.offsetWidth > 0;
  if (!desk) { if (el.parentNode === st) { map._controlCorners.bottomright.appendChild(el); el.classList.remove('at-layers'); el.style.top = el.style.right = ''; } return; }
  if (el.parentNode !== st) st.appendChild(el);
  el.classList.add('at-layers');
  el.style.top = (lb.offsetTop + 12) + 'px'; el.style.right = (st.clientWidth - lb.offsetLeft + 38) + 'px';      // room for the last label, which is centred on the end of the bar, and a clear gap to the button
}
{ const lb = document.getElementById('layerbox'), st = document.getElementById('stage'), re = new ResizeObserver(() => placeScale()); re.observe(lb); re.observe(st);
  new MutationObserver(() => placeScale()).observe(document.getElementById('app'), {attributes: true, attributeFilter: ['class']}); addEventListener('resize', placeScale); placeScale(); }

function updateCredits(){
  if (typeof viewMode !== 'undefined' && viewMode === '3d' && typeof updateCredits3D === 'function') return updateCredits3D();      // the 3D view names its sources in the same bar
  const yrs = state.mode !== 'compare'
    ? (tlLayers[state.frame] ? [tlLayers[state.frame].yr] : [])
    : [...new Set([state.a, state.b].filter(y => state.available[y]))].sort();
  const sat = document.getElementById('satToggle').checked;
  const s2Yrs = yrs.filter(y => !isLandsat(state.available[y])), lsYrs = yrs.filter(y => isLandsat(state.available[y]));      // Landsat years (Iceland, before 2016) are credited to the USGS
  const parts = s2Yrs.length && sat ? [`Contains modified Copernicus Sentinel data ${s2Yrs.join(' and ')}, processed via the <a href="https://dataspace.copernicus.eu" target="_blank" rel="noopener">Copernicus Data Space Ecosystem</a>`] : [];
  if (lsYrs.length && sat) parts.push(`${lsYrs.join(' and ')}: ${LANDSAT_CREDIT}`);
  if (REGION.id !== 'ch' && document.getElementById('aerialToggle').checked && state.oldestAerial) parts.push(`Aerial image ${flownYear(currentGlacier(), state.oldestAerial) || state.oldestAerial}: <a href="https://gatt.lmi.is" target="_blank" rel="noopener">Náttúrufræðistofnun Íslands</a> and Landmælingar Íslands (CC BY 4.0)`);
  else if (document.getElementById('aerialToggle').checked && aerialYears().length) parts.push(`Aerial images: SWISSIMAGE ${[...new Set(aerialYears().map(siYear))].map(ed => ed + (flownYear(glacierPicked ? currentGlacier() : null, ed) ? ` (flown ${flownYear(currentGlacier(), ed)})` : '')).join(' and ')} © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>`);
  if (document.getElementById('mosaicToggle').checked) parts.push(`Background: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless ${BG_YEAR}</a> by EOX IT Services (CC BY-NC-SA 4.0, contains modified Copernicus Sentinel data)`);
  if (document.getElementById('osmToggle').checked) parts.push('Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
  if (document.getElementById('topoToggle').checked) parts.push('Map © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>');
  if (document.getElementById('trailsToggle').checked) parts.push((REGION.id === 'ch' ? 'Hiking trails © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>' : 'Paths © OpenStreetMap contributors') + (sightLayer ? ` (line of sight: own calculation from ${REGION.id === 'ch' ? 'swissALTI3D' : 'ÍslandsDEM'})` : ''));
  if (REGION.id === 'ch' && document.getElementById('altiToggle').checked) parts.push('Hillshade: swissALTI3D © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>');
  if (document.getElementById('labelsToggle').checked) parts.push('Labels © OpenStreetMap contributors, EOX');
  if (outlineLayers.old || outlineLayers.new) parts.push(REGION.id === 'is-vatnajokull' ? `Outlines: <a href="https://doi.org/10.7265/N5-RGI-60" target="_blank" rel="noopener">Randolph Glacier Inventory 6.0</a> (RGI Consortium 2017, via GLIMS), about 2000` : 'Outlines GLAMOS (CC BY 4.0)');
  if (document.getElementById('thickToggle').checked) parts.push('Ice thickness (modelled, state around 2016): Grab et al. 2021, GLAMOS, via <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>');
  if (maxMarker && !radarLayer) parts.push('Thickest ice measurement: <a href="https://doi.org/10.18750/icethickness.2020.r2020" target="_blank" rel="noopener">GLAMOS</a> (CC BY 4.0)');
  if (radarLayer) parts.push('Radar ice thickness: <a href="https://doi.org/10.18750/icethickness.2020.r2020" target="_blank" rel="noopener">GLAMOS</a> (CC BY 4.0)');
  if (typeof svActive === 'function' && svActive()) parts.push('Street View © <a href="https://www.google.com/maps" target="_blank" rel="noopener">Google</a>');
  document.getElementById('credits').innerHTML = parts.join(' · ');
}
(function(){ const c = document.getElementById('credits');
  const t = () => c.classList.toggle('open'); c.onclick = e => { if (e.target.tagName !== 'A') t(); };
  c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } }; })();
/* Deep space: the calm backdrop where no base map shows. A dark blue gradient, many small faint stars, a soft Milky Way band and nebula glows.
   Everything comes from a fixed seed, so every frame, picture and visit looks the same. */
const spaceCache = new Map();
function spaceCanvas(w, h, perStar = 20000, scale = 1){
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
const mapEl = document.getElementById('map');
mapEl.style.backgroundImage = `url(${spaceCanvas(1600, 1000, 1000).toDataURL('image/png')})`;
mapEl.style.backgroundSize = 'cover'; mapEl.style.backgroundPosition = 'center'; mapEl.style.backgroundRepeat = 'no-repeat';
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:17, maxNativeZoom:19, attribution:'© OpenStreetMap contributors'});
if (prefs.osm === true) osm.addTo(map);
/* swisstopo's colour topographic map (Pixelkarte farbe), free to use with a source reference */
const topo = L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
  {maxZoom:17, maxNativeZoom:18, attribution:'© swisstopo'});
if (prefs.topo === true) topo.addTo(map);
/* swisstopo's relief shading of the swissALTI3D elevation model */
const alti = L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissalti3d-reliefschattierung/default/current/3857/{z}/{x}/{y}.png',
  {maxZoom:17, maxNativeZoom:18, attribution:'© swisstopo (swissALTI3D)'});
if (prefs.alti === true) alti.addTo(map);
/* swisstopo's hiking trails (swissTLM3D), just the trails, as a transparent overlay on the imagery. They are drawn only inside the image area of the glacier (the red box);
   tiles that lie wholly outside it are not even fetched. The tiles come one zoom level finer and are shown at half size, so the lines are half as thick. */
const TrailsLayer = L.TileLayer.extend({
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
const TrailsVector = L.LayerGroup.extend({
  setClip(){ if (this._map) this.draw(); },            // the lines are cut to the picture area already; another glacier: its lines
  onAdd(m){ L.LayerGroup.prototype.onAdd.call(this, m); this.draw(); },
  draw(){
    this.clearLayers(); if (!glacierPicked) return;
    ensureSight().then(() => { const d = trailsFor(currentGlacier()); if (!d || !this._map) return; this.clearLayers();
      const mk = (list, color, w) => list.forEach(l => L.polyline(l, {pane: 'labels', color, weight: w, opacity: .95, interactive: false, lineJoin: 'round'}).addTo(this));
      mk(d.tracks, '#FF0000', 2); mk(d.paths, '#FDC200', 3); });
  }
});
const trails = REGION.id === 'ch' ? new TrailsLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png',
  {pane:'labels', tileSize:128, zoomOffset:1, maxZoom:17, maxNativeZoom:17, opacity:.9, attribution:'Hiking trails © swisstopo'}) : new TrailsVector();
const trailsFor = g => { const d = (window.GLACIER_TRAILS || {})[g && bundleId(g)]; return d && (d.paths.length || d.tracks.length) ? d : null; };      // Iceland: the footpaths and tracks of an outlet
/* Where on the hiking trails the glacier tongue is in view of a person 1.7 m tall (sightline.js, made by scripts/build_sightline.py): a wide violet band with a white edge under the trail lines */
let sightTried = false, sightLoad = null;
const ensureSight = () => sightLoad || (sightLoad = new Promise(res => {      // the file (Switzerland: sightline.js, all glaciers, 135 kB; Iceland: trails-is.js) is fetched when the trails are on, not at the start; everyone who asks waits for the same load
  if (window.GLACIER_SIGHT) { sightTried = true; return res(); }
  sightTried = true;
  const sc = document.createElement('script'); sc.src = asset(REGION.trailsFile); sc.onload = sc.onerror = () => res(); document.head.appendChild(sc);
}));
const sightFor = g => { const d = (window.GLACIER_SIGHT || {})[g && bundleId(g)]; return d && d.lines && d.lines.length ? d : null; };      // violet with a white edge: the trails are yellow, red and blue, and the pictures hold hardly any violet
let sightLayer = null;
function updateSight(){
  if (sightLayer) { map.removeLayer(sightLayer); sightLayer = null; }
  if (!window.GLACIER_SIGHT && document.getElementById('trailsToggle').checked) { ensureSight().then(() => { updateSight(); if (viewMode === '3d') { sync3DMenu(); refresh3D(); } }); return; }      // the file is on its way: the layer is drawn when it arrives
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked, d = picked ? sightFor(currentGlacier()) : null, on = document.getElementById('trailsToggle').checked && !!d;
  document.getElementById('sightLegend').hidden = !on;
  if (on) sightLayer = L.layerGroup([['#fff', 12, .85], ['#7B2CFF', 7, .9]].flatMap(([color, weight, opacity]) => d.lines.map(l => L.polyline(l, {pane: 'sightPane', color, weight, opacity, lineCap: 'round', lineJoin: 'round', interactive: false})))).addTo(map);      // all the white edges first, then the violet cores
}
let trailClipKey = '';
function updateTrailClip(){          // the selected glacier's image area; before one is chosen, the ten image areas of the overview
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked, list = picked ? [currentGlacier()] : GLACIERS, key = picked ? state.glacier : '*';
  if (key === trailClipKey) return; trailClipKey = key;
  trails.setClip(list.map(g => L.latLngBounds(imageFootprint(g).bounds)));
}
if (prefs.trails === true) trails.addTo(map);
/* The map's place labels are raster tiles, so one label cannot be switched off. The blue glacier names that EOX writes along the Aletsch glacier lie over its tongue: inside the Aletsch picture
   box, the tiles are redrawn with the area of every blue (glacier name) label wiped. Other tiles are plain. If the tile cannot be read pixel by pixel (no CORS), it is shown as it is. */
const HIDE_LABELS = ['B36-26', 'aletsch'];
const LabelsLayer = L.TileLayer.extend({
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
const labels = new LabelsLayer('https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png',
  {pane:'labels', maxNativeZoom:16, maxZoom:17, opacity:.9, attribution:'Labels © OpenStreetMap contributors, rendering EOX'}).addTo(map);

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/* ---------- background: one static Sentinel-2 mosaic for the whole region (EOX Sentinel-2 cloudless; Switzerland 2024) ---------- */
const BG_YEAR = (REGION.background && REGION.background.mosaicYear) || 2024;      // the mosaic year of the region (Iceland: 2025)
const bgTiles = L.tileLayer(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${BG_YEAR}_3857/default/g/{z}/{y}/{x}.jpg`,
  {pane:'bgPane', maxNativeZoom:14, maxZoom:17, attribution:`Sentinel-2 cloudless ${BG_YEAR} by EOX`});
function setBackground(){
  const on = document.getElementById('mosaicToggle').checked;
  if (on && !map.hasLayer(bgTiles)) bgTiles.addTo(map);
  if (!on && map.hasLayer(bgTiles)) map.removeLayer(bgTiles);
  updateCredits();
}
/* ---------- swisstopo aerial images (SWISSIMAGE), by year ----------
   Shown only inside the image box of the chosen glacier (the TrailsLayer clip), under the Sentinel-2 pictures. One layer per picture slot: compare uses the years of the left and right
   side (panes siA and siB, clipped by the slider like the satellite panes), a timelapse the newest year of its range, one year its year. The time dimension of
   ch.swisstopo.swissimage-product is the edition year; 2025 is the newest, later years show 2025. */
const SI_LAST = 2025;
const aerial = {A: null, B: null, T: null};      // slot -> {yr, layer}
const siYear = y => Math.min(y, SI_LAST);
function aerialWanted(){          // slot -> year
  return document.getElementById('aerialToggle').checked ? aerialSlots() : {};
}
function aerialSlots(){          // slot -> year, whether the layer is on or not
  if (state.mode === 'compare') return state.oldestAerial ? {A: state.oldestAerial} : {A: state.a, B: state.b};
  if (state.mode === 'single') return {T: state.oldestAerial || state.one};
  const f = tlFrames(); return {T: f.length ? f[f.length - 1] : state.to};      // timelapse: the newest year of the range
}
/* SWISSIMAGE editions are mosaics: the edition year (the time dimension of the layer) is not the year the photographs were taken. swisstopo's metadata layer says which year was flown
   at a place (edition 2025 here: flown 2023, 2022: 2020, 2019: 2017, 2016: 2014). It is asked once per glacier and edition, and the viewer names that year. */
const aerialFlown = new Map();      // "<glacier>|<edition>" -> "2023" (empty while unknown)
const flownYear = (g, ed) => (g && aerialFlown.get(g.id + '|' + ed)) || '';
function ensureFlown(g, ed){
  const key = g.id + '|' + ed; if (aerialFlown.has(key)) return; aerialFlown.set(key, '');
  const [[s, w], [n, e]] = imageFootprint(g).bounds, lat = (s + n) / 2, lon = (w + e) / 2;
  fetch(`https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&layers=all:ch.swisstopo.swissimage-product.metadata&mapExtent=${lon - .01},${lat - .01},${lon + .01},${lat + .01}&imageDisplay=500,500,96&tolerance=1&sr=4326&timeInstant=${ed}&returnGeometry=false`)
    .then(r => r.json()).then(j => {
      const ys = [...new Set((j.results || []).map(r => r.attributes && r.attributes.flightyear).filter(Boolean))].sort();
      if (!ys.length) return; aerialFlown.set(key, ys.join(' / '));
      updateAerial(); updateTags(); if (tlLayers.length) showFrame(state.frame);
    }).catch(() => {});
}
/* "Oldest" in the specials row: the oldest SWISSIMAGE edition that covers the glacier's image box. The identify service lists, without a time, every aerial survey at a place
   (flightyear = the year flown, bgdi_flugjahr = the edition that first shows it); the oldest edition is asked once per glacier, at the middle of the box. */
const oldestAerial = new Map();      // glacier id -> {ed, flown} | null (none) ; absent while not asked
/* Iceland: the oldest picture is one static file (data/oldest/<outlet>.webp, scripts/build_oldest_iceland.py): the historic aerial mosaics of 1980 and 1982 of Náttúrufræðistofnun Íslands, in Web Mercator over the picture box */
function ensureOldestIs(g){
  fetch(asset(`data/oldest/${g.id}.json`)).then(r => r.ok ? r.json() : null).then(m => {
    if (!m) { oldestAerial.set(g.id, null); return; }
    aerialFlown.set(`${g.id}|${m.years[0]}`, m.label);      // the name of the year in the tags and the menu: 1980/82
    oldestAerial.set(g.id, {ed: m.years[0], flown: m.label, img: asset(`data/oldest/${g.id}.webp`), bbox: m.bbox, source: m.source});
  }).catch(() => oldestAerial.delete(g.id)).then(() => { if (typeof renderYears === 'function') renderYears(); if (state.checked && !latestBusy && g.id === state.glacier && typeof statusLine === 'function') setStatus(statusLine()); });
}
const oldestWhat = o => REGION.id === 'ch' ? `swisstopo SWISSIMAGE edition ${o.ed}, flown ${o.flown}` : `aerial mosaic of ${o.flown} (Náttúrufræðistofnun Íslands)`;      // the words for the oldest picture of a region
function ensureOldest(g){
  if (!g || oldestAerial.has(g.id)) return; oldestAerial.set(g.id, undefined);
  if (REGION.id !== 'ch') return ensureOldestIs(g);
  const [[s, w], [n, e]] = imageFootprint(g).bounds, lat = (s + n) / 2, lon = (w + e) / 2;
  fetch(`https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&layers=all:ch.swisstopo.swissimage-product.metadata&mapExtent=${lon - .01},${lat - .01},${lon + .01},${lat + .01}&imageDisplay=500,500,96&tolerance=1&sr=4326&returnGeometry=false`)
    .then(r => r.json()).then(j => {
      const rows = (j.results || []).map(r => r.attributes).filter(a => a && a.bgdi_flugjahr && a.flightyear);
      if (!rows.length) { oldestAerial.set(g.id, null); return; }
      const first = rows.reduce((a, b) => (b.bgdi_flugjahr < a.bgdi_flugjahr ? b : a));
      oldestAerial.set(g.id, {ed: +first.bgdi_flugjahr, flown: +first.flightyear});
    }).catch(() => oldestAerial.delete(g.id)).then(() => { if (typeof renderYears === 'function') renderYears(); if (state.checked && !latestBusy && g.id === state.glacier && typeof statusLine === 'function') setStatus(statusLine()); });
}
function showOldest(){            // the oldest aerial image alone on the map (and as the picture of the 3D view): the Sentinel-2 picture goes off for the time being
  const o = oldestAerial.get(state.glacier); if (!o) return;
  restoreLatest();
  if (!state.oldestAerial) state.oldestSaved = {sat: $('satToggle').checked, aerial: $('aerialToggle').checked};
  state.oldestAerial = o.ed; state.oldestMode = state.mode;
  if (state.mode === 'compare') { $('aerialToggle').checked = true; $('aerialToggle').dispatchEvent(new Event('change')); refreshAll(); setStatus(statusLine()); return; }      // the slider keeps the Sentinel-2 picture for its other side
  if (!state.available[state.one]) { const ys = YEARS.filter(y => state.available[y]); if (ys.length) state.one = ys[ys.length - 1]; }      // the 3D view needs a year with a scene under it
  $('satToggle').checked = false; applySatVisibility(); updateCredits();      // not through the checkbox's handler: that would be remembered as a choice
  $('aerialToggle').checked = true; $('aerialToggle').dispatchEvent(new Event('change'));
  refreshAll(); setStatus(statusLine());
}
function restoreOldest(){
  if (!state.oldestAerial) return;
  const s = state.oldestSaved || {sat: true, aerial: false}; state.oldestAerial = null; state.oldestSaved = null;
  $('satToggle').checked = s.sat; $('aerialToggle').checked = s.aerial; applySatVisibility(); $('aerialToggle').dispatchEvent(new Event('change')); updateCredits(); setStatus(statusLine());
}
const aerialYears = () => [...new Set(Object.values(aerialWanted()).filter(Boolean))].sort();
function updateAerial(){
  const eds = [...new Set(Object.values(aerialSlots()).filter(Boolean).map(siYear))].sort(), cg = glacierPicked ? currentGlacier() : null;
  if (cg && REGION.id === 'ch') eds.forEach(ed => ensureFlown(cg, ed));
  const ys = eds.map(ed => flownYear(cg, ed) || ed);      // the menu item names the year(s) the photographs were taken (the edition until that is known)
  document.getElementById('aerialLabel').textContent = (REGION.id === 'ch' ? 'swisstopo aerial' : 'Historic aerial') + (ys.length ? ' ' + [...new Set(ys)].join(' / ') : '');
  const want = aerialWanted(), boxes = (cg ? [cg] : GLACIERS).map(g => L.latLngBounds(imageFootprint(g).bounds)), key = cg ? cg.id : '*';      // only the box of the chosen glacier
  ['A', 'B', 'T'].forEach(k => {
    const yr = want[k] || null;
    if (aerial[k] && aerial[k].yr !== yr) { map.removeLayer(aerial[k].layer); aerial[k] = null; }
    if (yr && !aerial[k]) {
      let layer;
      if (REGION.id === 'ch') layer = new TrailsLayer(`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage-product/default/${siYear(yr)}/3857/{z}/{x}/{y}.jpeg`,
        {pane: 'si' + k, maxZoom: 17, maxNativeZoom: 18, attribution: '© swisstopo (SWISSIMAGE)'});
      else { const o = cg && oldestAerial.get(cg.id); if (!o || !o.img) return; const [x0, y0, x1, y1] = o.bbox, sw = L.CRS.EPSG3857.unproject(L.point(x0, y0)), ne = L.CRS.EPSG3857.unproject(L.point(x1, y1));
        layer = L.imageOverlay(o.img, [[sw.lat, sw.lng], [ne.lat, ne.lng]], {pane: 'si' + k, interactive: false, className: 'scene-img'}); layer._clip = boxes; layer._key = key; layer.setClip = () => {}; }
      layer._clip = boxes; layer._key = key; layer.addTo(map); aerial[k] = {yr, layer};
    }
    else if (yr && aerial[k].layer._key !== key) { aerial[k].layer._key = key; aerial[k].layer.setClip(boxes); }      // another glacier was chosen
  });
  clip(); updateCredits();
}
const satOn = () => document.getElementById('satToggle').checked;
/* Is a picture of the glacier on show? The Sentinel-2 picture of a chosen glacier (map and 3D view). The controls and downloads that only make sense for it follow this. */
const oldestPair = () => !!state.oldestAerial && state.mode === 'compare';      // the slider with the oldest aerial image as its first picture and a Sentinel-2 year as the other
const satShown = () => glacierPicked && satOn() && !oldestPair();
const SAT_MSG = 'Pick a glacier or turn on the Sentinel-2 image layer in the layer menu.';
const OLDEST_MSG = 'The oldest aerial image has no Sentinel-2 picture, so this is not available. Pick a year to go back to the satellite pictures.';
const satMsg = () => glacierPicked && state.oldestAerial ? OLDEST_MSG : SAT_MSG;
function aerialDesc(yr){          // the line under the year when the Sentinel-2 picture is off: what the map really shows
  if (!document.getElementById('aerialToggle').checked || !yr) return '<span class="nw">No glacier picture on show</span>';
  const ed = siYear(yr), fy = flownYear(glacierPicked ? currentGlacier() : null, ed);      // the year the photographs were taken, then the edition of the layer
  if (REGION.id !== 'ch') return `<span class="nw">Aerial image ${fy || yr}</span> · <span class="nw">Náttúrufræðistofnun Íslands</span>`;
  return `<span class="nw">Aerial image ${fy || ed}</span> · <span class="nw">swisstopo SWISSIMAGE ${ed}</span>${yr > SI_LAST ? ` · <span class="nw">newest edition for ${yr}</span>` : ''}`;
}
function applySatVisibility(){          // the Sentinel-2 pictures can be switched off, so the aerial images or a base map show alone
  const on = document.getElementById('satToggle').checked;
  document.getElementById('map').classList.toggle('sat-off', !on);      // a class, not the panes' own display: syncPane sets that on every year change
  document.getElementById('mapOp').disabled = !on;
  syncSatUi(); updateTags(); if (tlLayers.length) showFrame(state.frame);
  if (!satShown() && !document.getElementById('videoSheet').hidden) closeVideo();      // a download pane needs the picture
}
function imageryLayer(yr, pane, opacity=1){
  const g = currentGlacier(), ov = L.imageOverlay(BLANK, imageFootprint(g).bounds, {pane, opacity, interactive:false, className:'scene-img'});
  ov._g = g;
  const load = () => loadImage(g, yr).then(url => showImage(ov, url)).catch(e => { setStatus(e.message); showNotice(e.message); });
  if (viewMode === '3d') deferredLoads.push([ov, load]); else load();      // the map is not on show in the 3D view: its pictures wait (that view asks for its own, much smaller ones)
  return ov;
}
const deferredLoads = [];
function loadDeferred(){ deferredLoads.splice(0).forEach(([ov, load]) => { if (ov._map) load(); }); }      // back on the map: the layers that are still on it get their pictures

/* ---------- compare (swipe) ---------- */
let layerA = null, layerB = null;
function setCompareLayers(){
  [layerA, layerB].forEach(l => l && map.removeLayer(l));
  layerA = layerB = null;
  if (!glacierPicked) return;      // the start shows only the background, no glacier picture yet
  if (state.mode !== 'compare' || !state.available[state.b] || (!oldestPair() && !state.available[state.a])) return;
  if (!oldestPair()) layerA = imageryLayer(state.a, 'paneA').addTo(map);      // no Sentinel-2 picture on that side with the oldest aerial image
  layerB = imageryLayer(state.b, 'paneB').addTo(map);
  clip(); updateCredits();
}
/* The slider: split is 0..1 of the map width (vertical divider) or height (horizontal divider). The horizontal one keeps
   the year label of the upper image fully visible and the handle clear of the toolbar. */
const horiz = () => prefs.orient !== 'v';        // stacked images (top and bottom) unless the visitor chose side by side
function splitRange(){
  if (!horiz()) return [.02, .98];
  const size = map.getSize(), tag = document.getElementById('tagA');
  const st = document.getElementById('stage').getBoundingClientRect(), bar = document.querySelector('.mapbar').getBoundingClientRect();
  const free = bar.height ? (bar.top - st.top - 34) / size.y : 1 - 104 / size.y;           // the handle stops above the toolbar, also when it has two rows
  return [Math.min(.4, ((tag ? tag.offsetHeight : 90) + 22) / size.y), Math.max(.5, Math.min(.92, free))];
}
function clip(){
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
  try { if (!document.getElementById('videoSheet').hidden && vstate.kind === 'image') drawPreview(); } catch {}      // the picture pane shows where the slider is (not yet defined during start-up: ignored)
}
map.on('move zoom resize', clip);

let sliderHintDone = false;      // the hint beside the handle shows until the slider has been used once (on the map or in the 3D view)
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
let tlLayers = [];   // [{yr, layer}]
const tlFrames = () => state.mode === 'single' ? okYears().filter(y => y === state.one) : okYears().filter(y => y >= state.from && y <= state.to);
function buildTimelapse(){
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
function tagLine(el, first, sc){ el.innerHTML = (first && first !== 'Sentinel-2' ? `<span class="nw">${first}</span> · ` : '') + `<span class="nw">${styleLine(state.style, sc)}</span>`; }
function showFrame(i){
  if (!tlLayers.length) { setTag('tagT', '–'); return; }
  state.frame = i;
  tlLayers.forEach((t, k) => t.layer.setOpacity(k === i ? 1 : 0));
  const off = !satOn(), yShown = off && (state.mode === 'timelapse' || state.oldestAerial) && aerialWanted().T ? aerialWanted().T : tlLayers[i].yr;      // no Sentinel-2 picture: a timelapse shows its newest aerial year, not the frames
  setTag('tagT', yShown);
  const sc = state.available[tlLayers[i].yr];
  if (off) document.getElementById('tagTsub').innerHTML = aerialDesc(yShown);
  else tagLine(document.getElementById('tagTsub'), state.mode === 'single' ? `${sc && sc.latest ? 'Latest clear-ish: ' : ''}${sc ? fmtDM(sc.date) : ''}${sc && !sc.clear ? ', some clouds' : ''}` : `${sc ? fmtDM(sc.date) : ''}, frame ${i+1} of ${tlLayers.length}`, sc);
  /* the timeline as in the Timelapse download: first and last year above a line, a tick for every year, the line filled up to the year on show, a round marker */
  const dockOpen = !!state.dockOpen, nTl = tlLayers.length, pct = k => nTl > 1 ? k / (nTl - 1) * 100 : 0;
  const tlHtml = state.mode === 'single' || nTl < 2 || off ? '' : `<div class="tl-row"><button type="button" class="tl-play" aria-label="${state.playing ? 'Pause' : 'Play'}">${state.playing ? FULL_ICONS.pause : FULL_ICONS.play}</button><div class="tl2"><span class="tl2-ends"><b>${tlLayers[0].yr}</b><b>${tlLayers[nTl - 1].yr}</b></span><div class="tl2-track"><i class="tl2-fill" style="width:${pct(i)}%"></i>${tlLayers.map((_, k) => `<i class="tl2-tick${k <= i ? ' on' : ''}" style="left:${pct(k)}%"></i>`).join('')}<i class="tl2-dot" style="left:${pct(i)}%"></i></div></div><button type="button" class="tl-tools" aria-label="Show tools" aria-expanded="${dockOpen}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div>`;
  document.getElementById('tlDots').innerHTML = tlHtml; document.getElementById('v3dTlLine').innerHTML = tlHtml;      // the same timeline on the map and in the 3D view; in full screen its play button is the way to start and stop
  document.getElementById('frameSlider').value = i;
  updateCredits();
  if (viewMode === '3d' && v3dCtx && v3dCtx.follow && v3dCtx.years.includes(tlLayers[i].yr)) v3dCtx.follow(tlLayers[i].yr);      // the 3D view shows the frame too
  syncPane();
  const cb = document.querySelector('.cb-links');
  if (cb) cb.innerHTML = cbButtonsHtml();
}
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>Play';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>Pause';
document.getElementById('playBtn').innerHTML = PLAY_ICON;
const SPEED_MS = [2200, 1200, 600, 300, 150], SPEED_FPS = ['0.5', '1', '2', '4', '8'];      // the slider steps: delay per frame, and the label
const speedMs = () => typeof vPrev !== 'undefined' && vPrev.on && vstate.type !== 'swipe' ? perSec(tlLayers.length) * 1000 : SPEED_MS[+document.getElementById('speedSel').value];      // the preview in the animation pane runs at the pane's "Seconds per year"
function updateSpeedIcon(){                 // the needle of the little gauge and the label follow the chosen speed
  const i = +document.getElementById('speedSel').value;
  document.getElementById('speedNeedle').setAttribute('transform', `rotate(${-60 + i * 30} 12 18)`);
  document.getElementById('speedOut').textContent = `${SPEED_FPS[i]} fps`;
}
document.getElementById('speedSel').oninput = updateSpeedIcon; updateSpeedIcon();
const FULL_ICONS = {play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.500v14H7zM13.500 5H17v14h-3.500z"/></svg>'};
function syncDock(){          // phones: while a timelapse plays, the dock keeps only the timeline and the play button; the "…" button in the timeline brings the tools back (style.css, .tl-live)
  [document.querySelector('.mapbar'), document.getElementById('v3dMeasure')].forEach(d => { if (!d) return; d.classList.toggle('tl-live', !!state.playing); d.classList.toggle('tools-open', !!state.dockOpen); });
  document.querySelectorAll('.tl-tools').forEach(b => b.setAttribute('aria-expanded', !!state.dockOpen));
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tl-tools'); if (b) { state.dockOpen = !state.dockOpen; syncDock(); } });
function syncFullPlay(){          // the round play / pause button of the full screen (timelapse only, see style.css) follows the real state
  if (!state.playing) state.dockOpen = false;
  syncDock();
  document.querySelectorAll('.tl-play').forEach(b => { b.innerHTML = state.playing ? FULL_ICONS.pause : FULL_ICONS.play; b.setAttribute('aria-label', state.playing ? 'Pause' : 'Play'); });
}
function play(){
  if (tlLayers.length < 2) return;
  state.playing = true; document.getElementById('playBtn').innerHTML = PAUSE_ICON; syncFullPlay();
  const begun = Date.now();
  /* In the 3D view the map's own pictures are not loaded (they wait), the strip pictures are what plays: those are fetched here, all years together, so that every frame is quick */
  let n3 = 0, pre3 = false;
  if (viewMode === '3d' && v3dCtx && v3dCtx.S) {
    pre3 = true; const c3 = v3dCtx;
    tlLayers.forEach(t => { const spec = !stripPicturesOff && !imageHere(c3.g, t.yr) ? stripImageSpec(c3.S) : null; (spec ? loadImage(c3.g, t.yr, spec) : loadImage(c3.g, t.yr)).catch(() => {}).then(() => { n3++; }); });
  }
  const wait = () => {            // the first run: every picture has to be loaded before the years change, else the frames flash
    const ready = pre3 ? n3 : tlLayers.filter(t => t.layer._ready).length;
    if (ready < tlLayers.length && Date.now() - begun < (pre3 ? 45000 : 20000)) {
      document.getElementById('playBtn').innerHTML = `<span class="spin-s"></span>${ready}/${tlLayers.length}`;
      state.timer = setTimeout(wait, 250); return;
    }
    document.getElementById('playBtn').innerHTML = PAUSE_ICON;
    go();
  };
  const go = () => {
  if (state.frame >= tlLayers.length - 1) showFrame(0);
  const tick = () => {
    let next = state.frame + 1;
    if (next >= tlLayers.length) {
      if (!document.getElementById('loopToggle').checked) return stopPlay();
      next = 0;
    }
    showFrame(next);
    state.timer = setTimeout(tick, speedMs());
  };
  state.timer = setTimeout(tick, speedMs());
  };
  wait();
}
function stopPlay(){
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
    if (k !== state.frame) showFrame(k);
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
document.getElementById('frameSlider').oninput = e => { stopPlay(); showFrame(+e.target.value); };

/* ---------- outlines ---------- */
const outlineLayers = {old: null, new: null};
function geodesicArea(ring){ // ring: [[lng,lat],...] -> m²
  const R = 6378137, rad = d => d * Math.PI / 180; let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % ring.length];
    a += rad(p2[0] - p1[0]) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(a * R * R / 2);
}
const multiArea = geom => geom.coordinates.reduce((s, poly) => s + geodesicArea(poly[0]) - poly.slice(1).reduce((h, r) => h + geodesicArea(r), 0), 0);
function drawOutlines(){
  Object.values(outlineLayers).forEach(l => l && map.removeLayer(l));
  outlineLayers.old = outlineLayers.new = null;
  drawRadar();
  drawMax();
  if (typeof setThickness === 'function' && document.getElementById('thickToggle')) setThickness();
  syncOutsideUi();
  if (typeof glacierPicked !== 'undefined' && !glacierPicked) return updateCredits();     // the overview shows no outlines until a glacier is chosen
  const g = currentGlacier();
  if (g.rgi) {      // an outlet of the Vatnajökull ice cap: the Icelandic Met Office outlines (lines, cut to the outlet's region)
    const O = REGION.outlines, line = (geom, color, dash, title) => L.geoJSON(geom, {pane:'outlines', style:{color, weight:2.5, dashArray:dash, fill:false}}).bindPopup(`<strong>${title}</strong>`);
    if (document.getElementById('oldToggle').checked && hasOldOutline(g)) outlineLayers.old = line(oldOutlineGeom(g), getVar('--old'), '7 6', `${g.name}, outline ${g.outlines.lia.label}`).addTo(map);
    if (document.getElementById('newToggle').checked && newOutlineGeom(g)) outlineLayers.new = line(newOutlineGeom(g), getVar('--new'), null, `${g.name}, outline ${g.outlines.latest.label}`).addTo(map);
    return updateCredits();
  }
  if (!g.inv) {
    if (document.getElementById('oldToggle').checked || document.getElementById('newToggle').checked)
      showNotice(DATA ? `No inventory outline for ${g.name} in glaciers.js.` : 'Outlines need data/glaciers.js. See the note under "On the map".');
    return;
  }
  if (document.getElementById('oldToggle').checked && !g.inv.oldest)
    showNotice(`No ${DATA.oldest_label} outline was matched for ${g.name}.`);
  const mk = (geom, color, dash, title, invArea) => L.geoJSON(geom, {
    pane:'outlines', style:{color, weight:2.5, dashArray:dash, fill:true, fillOpacity:.06, fillColor:color}
  }).bindPopup(`<strong>${title}</strong><br>Inventory area: ${invArea.toFixed(2)} km²<br>Area on this map: ${(multiArea(geom)/1e6).toFixed(2)} km²`);
  if (document.getElementById('oldToggle').checked && g.inv.oldest)
    outlineLayers.old = mk(g.inv.oldest.outline, getVar('--old'), '7 6', `${g.name}, ${DATA.oldest_label}`, g.inv.oldest.area_km2).addTo(map);
  if (document.getElementById('newToggle').checked)
    outlineLayers.new = mk(g.inv.outline, getVar('--new'), null, `${g.name}, ${DATA.latest_label}${g.inv.year ? ' ('+g.inv.year+')' : ''}`, g.inv.area_km2).addTo(map);
  updateCredits();
}
const getVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- modelled ice thickness 2016 (Grab et al. 2021), swisstopo WMS ----------
   One WMS picture per image box (the area of the satellite scene), so the layer shows only inside the boxes: the selected glacier's box, or all ten
   before a glacier is chosen. Transparent where there is no glacier. Not a measurement: radar lines plus an ice-flow model. */
const THICK_LAYER = 'ch.swisstopo.geologie-gletschermaechtigkeit';
let thickImgs = [], thickKey = '';
function thicknessUrl(fp){
  const k = Math.min(1, 2000 / Math.max(fp.w, fp.h));
  return 'https://wms.geo.admin.ch/?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: THICK_LAYER, STYLES: '',
    CRS: 'EPSG:3857', BBOX: fp.bbox.join(','), WIDTH: Math.round(fp.w * k), HEIGHT: Math.round(fp.h * k), FORMAT: 'image/png', TRANSPARENT: 'TRUE' });
}
function setThickness(){
  const on = document.getElementById('thickToggle').checked, box = document.getElementById('thickLegendBox'), img = document.getElementById('thickLegendImg');
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked, key = on ? (picked ? state.glacier : '*') : '';
  if (key !== thickKey) {
    thickImgs.forEach(l => map.removeLayer(l)); thickImgs = []; thickKey = key;
    if (on) thickImgs = (picked ? [currentGlacier()] : GLACIERS).map(g => L.imageOverlay(thicknessUrl(imageFootprint(g)), imageFootprint(g).bounds, {pane:'thickPane', opacity:.8, interactive:false}).addTo(map));
  }
  box.hidden = !on;
  if (on && !img.src) { img.onerror = () => { img.hidden = true; }; img.src = `https://api3.geo.admin.ch/static/images/legends/${THICK_LAYER}_en.png`; }
  updateCredits();
}

/* ---------- radar ice thickness (GLAMOS, ground-penetrating radar) ----------
   thickness.js (made by build_outlines.py) holds one mean value per 50 m cell for each of the ten glaciers; it is loaded only when the layer is switched on.
   The surveys are old (see glaciers.js, radar.years), so the dots show the ice as it was then, not today. */
/** @type {[number, number[]][]} */
const RADAR_STOPS = [[0,[191,227,242]],[200,[63,155,196]],[400,[42,42,107]],[600,[90,31,99]]];
function radarColor(m){
  const t = Math.max(0, Math.min(600, m));
  for (let i = 1; i < RADAR_STOPS.length; i++) if (t <= RADAR_STOPS[i][0]) {
    const [t0, c0] = RADAR_STOPS[i - 1], [t1, c1] = RADAR_STOPS[i], f = (t - t0) / (t1 - t0);
    return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`;
  }
  return 'rgb(90,31,99)';
}
const radarPopup = (m, y, all) => all      // the text of a radar point, on the map and on the pins of the 3D view
  ? `<strong>Measured ${all.length} times by radar</strong><br>${all.slice().reverse().map(([yy, mm]) => `${yy || 'year unknown'}: <b>${mm} m</b>`).join('<br>')}`
  : `<strong>${m} m</strong> of ice<br>measured by radar${y ? ` in ${y}` : ''}`;
let radarLayer = null, radarLoad = null, radarGen = 0, maxMarker = null;
const radarRenderer = L.canvas({pane:'outlines', padding:0.3});
function loadRadar(){
  if (window.GLACIER_THICKNESS) return Promise.resolve();
  return radarLoad || (radarLoad = new Promise((ok, fail) => {
    const sc = document.createElement('script'); sc.src = asset('data/thickness.js') + (!ASSETS['data/thickness.js'] && DATA && DATA.thickness_id ? `?v=${DATA.thickness_id}` : '');
    sc.onload = ok; sc.onerror = () => { radarLoad = null; fail(new Error('thickness.js')); };
    document.head.appendChild(sc);
  }));
}
async function drawRadar(){
  if (viewMode === '3d') return;      // the map is not on show: the layer is drawn when it comes back (the 3D view has its own pins from the baked file)
  const gen = ++radarGen, on = document.getElementById('radarToggle').checked, legend = document.getElementById('radarLegend'), note = document.getElementById('radarNote');
  if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
  legend.hidden = !on;
  if (!on) return updateCredits();
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
  radarLayer = L.layerGroup(pts.map(([lat, lng, m, y, all]) => L.circleMarker([lat, lng], {renderer:radarRenderer, radius:r, stroke:true, color: all ? '#C8322A' : '#fff', weight: all ? 1.4 : .6, opacity:.85, fillColor:radarColor(m), fillOpacity:.9})
    .bindTooltip(popup(m, y, all), {sticky:true, direction:'top', offset:[0, -6], opacity:.96, className:'radar-tip'})        // on hover; a tap or click opens the same text as a popup
    .bindPopup(popup(m, y, all)).on('popupopen', e => e.target.closeTooltip()))).addTo(map);
  updateCredits();
}
map.on('zoomend', () => { if (radarLayer) drawRadar(); });
/* the place of the thickest ice measurement (radar) of the selected glacier: a layer of its own, one label on the map */
function drawMax(){
  if (maxMarker) { map.removeLayer(maxMarker); maxMarker = null; }
  const on = document.getElementById('maxToggle').checked, g = typeof glacierPicked !== 'undefined' && !glacierPicked ? null : currentGlacier(), R = g && g.inv && g.inv.radar;
  if (on && R && R.max_at) {
    // the same look as the tongue indication: ring with a red label, here "850 m (1958)"; the label keeps the case it is written in
    maxMarker = L.marker(R.max_at, {icon: L.divIcon({className: '', html: `<div class="tongue-pin max-pin"><span>${R.max_m} m${R.max_year ? ` (${R.max_year})` : ''}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15]}), interactive: false, keyboard: false, zIndexOffset: 500}).addTo(map);
  }
  document.getElementById('maxNote').hidden = !on || !!(R && R.max_at);
  updateCredits();
}

/* ---------- measuring ---------- */
const M = {mode:null, pts:[], temp:null, group:L.layerGroup().addTo(map)};
const fmtLen = m => m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(m < 10000 ? 2 : 1)} km`;
const fmtArea = m2 => m2 < 1e5 ? `${Math.round(m2).toLocaleString('en')} m²` : `${(m2/1e6).toFixed(2)} km²`;
const pathLen = pts => pts.reduce((s, p, i) => i ? s + map.distance(pts[i-1], p) : 0, 0);
const ringOf = pts => pts.map(p => [p.lng, p.lat]);
const updateClear = () => { document.getElementById('measureClear').hidden = !M.group.getLayers().length; };   // hide the eraser until something is drawn
function startMeasure(mode){
  cancelMeasure();
  M.mode = mode; map.doubleClickZoom.disable();
  document.getElementById('app').classList.add('measuring');
  document.getElementById(mode === 'dist' ? 'measureDist' : 'measureArea').setAttribute('aria-pressed', 'true');
  document.getElementById('measureHint').classList.add('show');
  updateMeasureText();
}
function updateMeasureText(cursor){
  const pts = cursor ? [...M.pts, cursor] : M.pts, el = document.getElementById('measureText');
  const phone = COARSE, tap = phone ? 'Tap' : 'Click';          // on phones the hint stays short: it sits on the picture
  if (!pts.length) el.textContent = M.mode === 'dist' ? `${tap} the map to start a line.` : `${tap} the map to start an area.`;
  else if (M.mode === 'dist') el.textContent = `Length ${fmtLen(pathLen(pts))}.${phone ? '' : ' Double-click or press Finish.'}`;
  else el.textContent = pts.length < 3 ? (phone ? 'Add 3 points.' : 'Add at least three points.') : `Area ${fmtArea(geodesicArea(ringOf(pts)))}.${phone ? '' : ' Double-click or press Finish.'}`;
}
function drawTemp(cursor){
  if (M.temp) M.group.removeLayer(M.temp);
  const pts = cursor ? [...M.pts, cursor] : M.pts;
  const style = {pane:'measure', color:getVar('--measure'), weight:3, dashArray:'6 5', fillOpacity:.15, interactive:false};
  M.temp = (M.mode === 'area' && pts.length > 2 ? L.polygon(pts, style) : L.polyline(pts, style)).addTo(M.group);
  updateMeasureText(cursor); updateClear();
}
map.on('click', e => { if (!M.mode) return; M.pts.push(e.latlng); drawTemp(); });
map.on('mousemove', e => { if (M.mode && M.pts.length) drawTemp(e.latlng); });
map.on('dblclick', () => M.mode && finishMeasure());
function finishMeasure(){
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
function cancelMeasure(){ if (M.temp) M.group.removeLayer(M.temp); M.temp = null; endMeasure(); }
function endMeasure(){
  M.mode = null; M.pts = []; map.doubleClickZoom.enable();
  document.getElementById('app').classList.remove('measuring');
  ['measureDist','measureArea'].forEach(id => document.getElementById(id).setAttribute('aria-pressed','false'));
  document.getElementById('measureHint').classList.remove('show');
  updateClear();
}
document.getElementById('measureDist').onclick = () => M.mode === 'dist' ? cancelMeasure() : startMeasure('dist');
document.getElementById('measureArea').onclick = () => M.mode === 'area' ? cancelMeasure() : startMeasure('area');
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
document.getElementById('zoomOut').onclick = () => { if (!$('videoSheet').hidden && map.getZoom() <= map.getMinZoom() + 0.01) showNotice('Zoomed out as far as the download frame allows: it has to stay near the picture of this glacier.'); map.zoomOut(); };
document.getElementById('fitBtn').onclick = () => fitGlacier();
document.getElementById('labelsToggle').onchange = e => { e.target.checked ? labels.addTo(map) : map.removeLayer(labels); updateCredits(); };
document.getElementById('oldToggle').checked = prefs.old === true;      // the 1850 outline is off until it is switched on
document.getElementById('oldToggle').onchange = () => { prefs.old = document.getElementById('oldToggle').checked; savePrefs(); drawOutlines(); };
document.getElementById('newToggle').onchange = drawOutlines;
function fitGlacier(animate = true){ map.fitBounds(currentGlacier().bounds, {animate, padding:[20,20]}); }
const TONGUE_ZOOM = 13.75;  // default; a glacier can set its own with tz (higher = closer)
/* The tip of the tongue is the lowest point of the newest outline (found by build_outlines.py with the swisstopo height service).
   The view is centred a little up the glacier from the tip and fitted around the last 2 km of the outline,
   so the tip sits near the middle of the screen with room around it, whatever the window size. */
const TONGUE_REACH = 2000, TONGUE_SHIFT = 0.4;     // metres; share of the way from the tip to the middle of that stretch
const TONGUE_VIEW = {aletsch: {reach: 3000, north: 2000, west: 200}, gorner: {west: -1507, north: -707}, fiescher: {north: 2407, west: -707}, corbassiere: {out: 0, north: -1500, west: 200}, unteraar: {west: 2000, north: 500}, rhone: {north: 1000, west: 200}, zmutt: {out: 0.25}, fee: {out: 0.75, north: -1100}};      // a start view of its own: Aletsch shows 3 km of the tongue instead of 2, moved 2 km north and 0.2 km west; the Gorner view is moved 1.5 km east and 0.7 km south (west: metres, negative = east); Fiescher is moved 2.4 km north and 0.7 km east, Fee 1.1 km south, Rhone 1 km north and 0.2 km west, Corbassière 1.5 km south and 0.2 km west at the default zoom, Unteraar 2 km west and 0.5 km north (north: metres, negative = south); Zmutt starts a quarter and Fee three quarters of a zoom level further out (out)
const TONGUE_ZOOM_OUT = 1;                          // zoom levels left out of the closest fit, for more surroundings
function tongueBounds(g){
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
let tonguePin = null;
function drawTonguePin(){
  if (tonguePin) map.removeLayer(tonguePin);
  tonguePin = null;
  const g = currentGlacier(), at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue;
  if (!document.getElementById('pinToggle').checked || !at) return;
  tonguePin = L.marker(at, {icon: L.divIcon({className: '', html: '<div class="tongue-pin"><span>Tongue</span></div>', iconSize: [30, 30], iconAnchor: [15, 15]}), interactive: false, keyboard: false}).addTo(map);
}
/* The tongue view is always closer than the whole-glacier view: at least TONGUE_CLOSER zoom levels more. */
const TONGUE_CLOSER = 1;
function wholeGlacierZoom(g){ return map.getBoundsZoom(g.bounds, false, L.point(40, 40)); }
function tongueView(){          // {center, zoom} the Tongue button goes to, or null
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
function focusTongue(animate = true){
  const v = tongueView();
  if (v) map.setView(v.center, v.zoom, {animate});
  else fitGlacier(animate);
}
function wholeView(){ return map._getBoundsCenterZoom(currentGlacier().bounds, {padding: [20, 20]}); }
/* the Tongue and Whole glacier buttons grey out while the map already shows their view (within 3 px) */
function syncViewButtons(){
  if (!map || !currentGlacier()) return;
  const here = (v) => v && Math.abs(map.getZoom() - v.zoom) < 0.02 && map.project(map.getCenter(), v.zoom).distanceTo(map.project(v.center, v.zoom)) < 3;
  const t = document.getElementById('tongueBtn'), f = document.getElementById('fitBtn');
  t.disabled = !!here(tongueView());
  f.disabled = !!here(wholeView());
}
map.on('moveend zoomend resize', syncViewButtons);
document.getElementById('tongueBtn').onclick = () => focusTongue();

