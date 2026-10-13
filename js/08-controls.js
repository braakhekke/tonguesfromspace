/* =====================================================================
   8. Controls
   ===================================================================== */
function setOrient(o){
  prefs.orient = o; savePrefs();
  document.getElementById('orientV').setAttribute('aria-pressed', o !== 'h'); document.getElementById('orientH').setAttribute('aria-pressed', o === 'h');
  document.getElementById('labelA').textContent = o === 'h' ? 'Top' : 'Left'; document.getElementById('labelB').textContent = o === 'h' ? 'Bottom' : 'Right';
  document.getElementById('yearsA').setAttribute('aria-label', o === 'h' ? 'Year for top image' : 'Year for left image');
  document.getElementById('yearsB').setAttribute('aria-label', o === 'h' ? 'Year for bottom image' : 'Year for right image');
  state.split = .5;
  clip();
  syncPane(); if (typeof sync3D === 'function') sync3D();           // (the 3D file loads later than this one: not yet there at the first call)
  // an open download pane shows the new direction
}
document.getElementById('orientV').onclick = () => setOrient('v'); document.getElementById('orientH').onclick = () => setOrient('h');
setOrient(prefs.orient === 'v' ? 'v' : 'h');
document.getElementById('modeCompare').onclick = () => { state.mode = 'compare'; refreshAll(); };
document.getElementById('modeTimelapse').onclick = () => { state.mode = 'timelapse'; state.frame = 0; refreshAll(); mobileDataNote(); };
document.getElementById('modeSingle').onclick = () => { state.mode = 'single'; state.frame = 0; refreshAll(); };



function setStatus(t){             // a message ending in "…" means work in progress: show the spinner
  const el = document.getElementById('status');
  el.textContent = t; el.classList.toggle('busy', /…$/.test(t));
  if (viewMode === '3d' && !state.checked) document.getElementById('v3dMsg').textContent = t;      // the 3D view shows the progress of the search too
}
function showNotice(msg){
  const n = document.getElementById('notice');
  n.textContent = msg; n.classList.add('show');
  clearTimeout(showNotice.t); showNotice.t = setTimeout(() => n.classList.remove('show'), 7000);
}

/* ---------- Switzerland overview: the ten glaciers as red boxes, clickable ---------- */
const BOX_MAX_ZOOM = 11.25;                      // boxes show when zoomed out; at a glacier they would clutter the image
const boxLayer = L.layerGroup();
const frameLayer = L.layerGroup();               // zoomed in: the red line stays as the outline of the selected glacier's image
/* The red boxes have exactly the size of the satellite image of each glacier, with the same rounded corners (14 px, as on .scene-img). */
function roundedBox(b, maxR = 14){
  const z = map.getZoom();
  if (z === undefined) return [[b[1][0], b[0][1]], [b[1][0], b[1][1]], [b[0][0], b[1][1]], [b[0][0], b[0][1]]];   // before the first view is set
  const nw = map.project(L.latLng(b[1][0], b[0][1]), z), se = map.project(L.latLng(b[0][0], b[1][1]), z);
  const r = Math.min(maxR, (se.x - nw.x) / 4, (se.y - nw.y) / 4), pts = [];
  const arc = (cx, cy, from) => { for (let i = 0; i <= 6; i++) { const t = from + i * Math.PI / 12; pts.push(map.unproject(L.point(cx + r * Math.cos(t), cy + r * Math.sin(t)), z)); } };
  arc(se.x - r, nw.y + r, -Math.PI / 2); arc(se.x - r, se.y - r, 0); arc(nw.x + r, se.y - r, Math.PI / 2); arc(nw.x + r, nw.y + r, Math.PI);
  return pts;
}
/* The overview: every glacier as its 1850 outline, clickable, with its number. Once a glacier is chosen, the outline of its satellite picture shows in red. */
const glacierBounds = g => g.extent || g.bounds;
const badgeLatLng = g => g.center ? L.latLng(g.center) : L.latLngBounds(glacierBounds(g)).getCenter();
function drawBoxes(){
  boxLayer.clearLayers(); frameLayer.clearLayers();
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked;
  GLACIERS.forEach((g, i) => {
    const sel = picked && g.id === state.glacier, fp = imageFootprint(g).bounds, geom = outlineGeom(g);
    if (sel) {            // the picture area of the chosen glacier: a thin white frame, always (also in the download panes), with a small label written along its top edge
      const far = map.getZoom() < wholeGlacierZoom(g);      // zoomed out beyond the glacier: a click inside the square flies back to the tongue
      frameLayer.addLayer(L.polygon(roundedBox(fp), {color: '#fff', weight: 1.5, opacity: .95, fill: far, fillOpacity: 0, interactive: far, className: far ? 'gframe far' : 'gframe'}).on('click', () => focusTongue()));
      frameLayer.addLayer(L.marker([fp[1][0], fp[0][1]], {interactive: false, keyboard: false, icon: L.divIcon({className: 'frame-label', html: `<span>Current selection: ${g.name}</span>`, iconSize: [220, 12], iconAnchor: [-15, 13]})}));
    }
    const W = sel ? 1.6 : 1.1, F = geom ? 0.16 : 0, style = {color: getVar('--accent'), weight: W, opacity: .9, fillColor: getVar('--accent'), fillOpacity: F, className: 'gbox'};      // thin line and a faint fill so the ice stays visible; stronger under the pointer
    const shape = geom ? L.geoJSON({type: 'Feature', geometry: geom}, {style: () => style}) : L.polygon(roundedBox(fp), {...style});
    const tip = `${i + 1}. ${g.name}, ${rankArea(g).toFixed(1)} km²`;
    const light = on => { const st = {fillOpacity: on ? 0.4 : F, weight: on ? 2.2 : W}; shape.setStyle ? shape.setStyle(st) : shape.eachLayer(l => l.setStyle(st)); };      // the polygon lights up under the pointer, also when the pointer is on its number
    shape.bindTooltip(tip, {direction: 'top', sticky: true, className: 'gbox-tip'}).on('click', () => chooseGlacier(g.id)).on('mouseover', () => light(true)).on('mouseout', () => light(false));
    const tip0 = g.inv && g.inv.terminus && g.inv.terminus.tip || g.tongue;      // the badge sits at the tongue tip, off the ice, with the name beside it
    const num = L.marker(tip0 ? L.latLng(tip0) : geom ? badgeLatLng(g) : [fp[1][0], (fp[0][1] + fp[1][1]) / 2], {
      icon: L.divIcon({className: '', html: `<div class="gbox-num${sel ? ' sel' : ''}"><span class="lab"><i>${i + 1}</i>${g.name}</span></div>`, iconSize: [10, 10], iconAnchor: [5, 5]}),
      keyboard: true}).on('click', () => chooseGlacier(g.id)).on('mouseover', () => light(true)).on('mouseout', () => light(false)).bindTooltip(tip, {direction: 'top', offset: [0, -12], className: 'gbox-tip'});      // the same tooltip over the number
    boxLayer.addLayer(shape).addLayer(num);
  });
}
function updateBoxes(){
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked;
  const show = document.getElementById('boxToggle').checked && map.getZoom() <= BOX_MAX_ZOOM && !$('app').classList.contains('is-framing');      // the layer switch decides: on at the start, off with the first choice. Not in a download frame
  if (show && !map.hasLayer(boxLayer)) boxLayer.addTo(map);
  if (!show && map.hasLayer(boxLayer)) map.removeLayer(boxLayer);
  $('app').classList.toggle('overview', show);      // the overview look: dimmed background, no tongue or whole-glacier buttons
  const frame = typeof glacierPicked !== 'undefined' && glacierPicked;      // the frame of the chosen glacier's picture shows at every zoom
  if (frame && !map.hasLayer(frameLayer)) frameLayer.addTo(map);
  if (!frame && map.hasLayer(frameLayer)) map.removeLayer(frameLayer);
}
function glaciersExtent(){
  const b = GLACIERS.map(g => imageFootprint(g).bounds);
  return [[Math.min(...b.map(x => x[0][0])), Math.min(...b.map(x => x[0][1]))], [Math.max(...b.map(x => x[1][0])), Math.max(...b.map(x => x[1][1]))]];
}
function showSwitzerland(animate = true){ stopPlay(); map.fitBounds(glaciersExtent(), {animate, padding: [40, 40]}); }
map.on('zoomend', () => { drawBoxes(); updateBoxes(); });   // the rounded corners are a fixed number of pixels
document.getElementById('pinToggle').checked = prefs.pin === true;
document.getElementById('pinToggle').onchange = e => { prefs.pin = e.target.checked; savePrefs(); drawTonguePin(); };
document.getElementById('thickToggle').checked = prefs.thick === true;
document.getElementById('thickToggle').onchange = e => { prefs.thick = e.target.checked; savePrefs(); setThickness(); };      // drawOutlines() at the end of the boot applies a saved choice
document.getElementById('maxToggle').checked = prefs.maxspot === true;
document.getElementById('maxToggle').onchange = e => { prefs.maxspot = e.target.checked; savePrefs(); drawMax(); document.querySelectorAll('[data-act="radar-max"]').forEach(b => { b.firstChild.textContent = maxLinkText(b.dataset.text); }); };
document.getElementById('radarToggle').checked = prefs.radar === true;
document.getElementById('radarToggle').onchange = e => { prefs.radar = e.target.checked; savePrefs(); drawRadar(); };
document.getElementById('boxToggle').checked = !OPEN_ON_GLACIER;      // on at the start; off as soon as a glacier is chosen (or the link opens on one)
document.getElementById('boxToggle').onchange = e => { prefs.boxes = e.target.checked; savePrefs(); updateBoxes(); };
drawBoxes(); drawTonguePin();


/* Map layer box: minimize, mosaic background, OpenStreetMap */
const lb = document.getElementById('layerbox');
lb.classList.add('min'); document.getElementById('lbToggle').setAttribute('aria-expanded', 'false');      // the layer menu starts closed at every visit; opening it is not remembered
document.getElementById('lbToggle').onclick = () => {
  const min = lb.classList.toggle('min'); prefs.lbMin = min; savePrefs();
  document.getElementById('lbToggle').setAttribute('aria-expanded', !min);
};
document.getElementById('mosaicToggle').checked = prefs.mosaic !== false;      // Sentinel-2 background on at the start (switch off to see the tongue in space)
/* the three base maps replace each other: switching one on switches the others off */
const BASE_TOGGLES = ['mosaicToggle', 'osmToggle', 'topoToggle', 'altiToggle'];
function onlyBase(id){ BASE_TOGGLES.forEach(o => { const el = document.getElementById(o); if (o !== id && el.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } }); }
document.getElementById('mosaicToggle').onchange = e => { if (e.target.checked) onlyBase('mosaicToggle'); prefs.mosaic = e.target.checked; savePrefs(); setBackground(); };
setBackground();
document.getElementById('osmToggle').checked = prefs.osm === true;
document.getElementById('osmToggle').onchange = e => {
  if (e.target.checked) onlyBase('osmToggle');
  prefs.osm = e.target.checked; savePrefs();
  e.target.checked ? osm.addTo(map) : map.removeLayer(osm); updateCredits();
};
document.getElementById('topoToggle').checked = prefs.topo === true;
document.getElementById('topoToggle').onchange = e => {
  if (e.target.checked) onlyBase('topoToggle');
  prefs.topo = e.target.checked; savePrefs();
  e.target.checked ? topo.addTo(map) : map.removeLayer(topo); updateCredits();
};
document.getElementById('trailsToggle').checked = prefs.trails === true;
document.getElementById('trailsToggle').onchange = e => {
  prefs.trails = e.target.checked; savePrefs();
  if (e.target.checked) { trailClipKey = ''; updateTrailClip(); trails.addTo(map); } else map.removeLayer(trails); document.getElementById('trailLegend').hidden = !e.target.checked; updateSight(); updateCredits();
};
document.getElementById('trailLegend').hidden = !document.getElementById('trailsToggle').checked;
document.getElementById('altiToggle').checked = prefs.alti === true;
document.getElementById('altiToggle').onchange = e => {
  if (e.target.checked) onlyBase('altiToggle');
  prefs.alti = e.target.checked; savePrefs();
  e.target.checked ? alti.addTo(map) : map.removeLayer(alti); updateCredits();
};
/* swisstopo aerial images of the picked year(s): a background that, unlike the other base maps, can be on beside them (it only shows inside the ten image boxes, over the base map) */
document.getElementById('aerialToggle').checked = false;      // always off at the start: the choice is not remembered
document.getElementById('aerialToggle').onchange = e => { updateAerial(); updateTags(); if (tlLayers.length) showFrame(state.frame); };
document.getElementById('satToggle').checked = prefs.sat !== false;
document.getElementById('satToggle').onchange = e => { prefs.sat = e.target.checked; savePrefs(); applySatVisibility(); updateCredits(); };
applySatVisibility(); updateAerial();

/* Controls that need a picture of the glacier (colours, brightness, downloads...) are greyed out while none is on show: no glacier chosen, or the Sentinel-2 picture
   switched off in the layer menu. Pressing one says why instead of doing it. Before a glacier is chosen, all of steps 2 and 3 do the same (they are greyed by .no-glacier). */
function syncSatUi(){
  document.getElementById('app').classList.toggle('sat-off', !satShown());
  if (satShown()) { const n = document.getElementById('notice'); if (n.textContent === SAT_MSG) { n.classList.remove('show'); clearTimeout(showNotice.t); } }      // the message is gone as soon as it no longer applies: the picture is on, or a glacier is picked
}
document.addEventListener('click', e => {
  const noGlacier = !glacierPicked, t = e.target.closest ? e.target.closest(noGlacier ? '#vizGroup > :not(.step-h), #shareGroup > :not(.step-h):not(.act-link):not(.fyi):not(.fyi-by)' : '.sat-need') : null;
  if (!t || (!noGlacier && satShown())) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); showNotice(SAT_MSG);
}, true);
syncSatUi();
