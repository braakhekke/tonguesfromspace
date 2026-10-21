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
const otherLayer = L.layerGroup();               // a glacier is chosen and the map is zoomed out beyond its picture: the outlines of the others, clickable
const subLayer = L.layerGroup();                // the outlets of the chosen ice cap (g.subs): a ring and the name at each tip, a click zooms to the outlet
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
const hasOutline = g => !!(outlineGeom(g) || g.rgi);      // the glacier has an outline to draw in the overview (Swiss: the 1850 outline, Iceland: the RGI outline)
const badgeLatLng = g => g.center ? L.latLng(g.center) : L.latLngBounds(glacierBounds(g)).getCenter();
/* One glacier of the overview: its outline (or box) and its numbered label. flat: no fill, for the other glaciers seen from a zoomed-out chosen glacier. */
function boxParts(g, i, sel, flat){
  const fp = imageFootprint(g).bounds, geom = outlineGeom(g), has = hasOutline(g);
    const W = sel ? 1.6 : 1.1, F = has && !flat ? 0.16 : 0, style = {color: getVar('--accent'), weight: W, opacity: .9, fillColor: getVar('--accent'), fillOpacity: F, className: 'gbox'};      // thin line and a faint fill so the ice stays visible; stronger under the pointer
    const shape = geom ? L.geoJSON({type: 'Feature', geometry: geom}, {style: () => style}) : g.rgi ? L.polygon(g.rgi.outline.map(r => [r]), {...style}) : L.polygon(roundedBox(fp), {...style});
    const tip = `${i + 1}. ${g.name}, ${areaText(g, 1)} km²`;
    const light = on => { const st = {fillOpacity: flat ? 0 : on ? 0.4 : F, weight: on ? 2.2 : W}; shape.setStyle ? shape.setStyle(st) : shape.eachLayer(l => l.setStyle(st)); };      // the polygon lights up under the pointer, also when the pointer is on its number
    shape.bindTooltip(tip, {direction: 'top', sticky: true, className: 'gbox-tip'}).on('click', () => chooseGlacier(g.id)).on('mouseover', () => light(true)).on('mouseout', () => light(false));
    const tip0 = g.inv && g.inv.terminus && g.inv.terminus.tip || g.tongue;      // the badge sits at the tongue tip, off the ice, with the name beside it
    const num = L.marker(tip0 ? L.latLng(tip0) : has ? badgeLatLng(g) : [fp[1][0], (fp[0][1] + fp[1][1]) / 2], {
      icon: L.divIcon({className: '', html: `<div class="gbox-num${sel ? ' sel' : ''}"><span class="lab"><i>${i + 1}</i>${g.name}</span></div>`, iconSize: [10, 10], iconAnchor: [5, 5]}),
      keyboard: true}).on('click', () => chooseGlacier(g.id)).on('mouseover', () => light(true)).on('mouseout', () => light(false)).bindTooltip(tip, {direction: 'top', offset: [0, -12], className: 'gbox-tip'});      // the same tooltip over the number
    return [shape, num];
}
function drawBoxes(){
  boxLayer.clearLayers(); frameLayer.clearLayers(); otherLayer.clearLayers(); subLayer.clearLayers();
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked;
  const cur = picked && GLACIERS.find(x => x.id === state.glacier);
  if (cur && cur.subs) cur.subs.forEach((sb, k) => {      // thin catchment borders (the RGI 6.0 basins in sb.outline) of every outlet, under the markers; a click zooms to the outlet
    {
      const poly = L.polygon(sb.outline.map(r => [r]), {color: '#fff', weight: 1, opacity: .75, dashArray: '4 3', fillColor: '#fff', fillOpacity: .03, className: 'basin sub-basin'}).addTo(subLayer);
      poly.bindTooltip(`${sb.name}, ${sb.areaKm2.toLocaleString('en-US', {maximumFractionDigits: 1})} km²`, {direction: 'top', sticky: true, className: 'gbox-tip'});
      poly.on('click', () => focusSub(cur, k)).on('mouseover', () => poly.setStyle({fillOpacity: .16})).on('mouseout', () => poly.setStyle({fillOpacity: .03}));
    }
  });
  if (cur && cur.subs) cur.subs.forEach((sb, k) => {
    const at = sb.tip || L.latLngBounds(sb.bounds).getCenter();
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    L.marker(at, {keyboard: true, title: `${sb.name}, ${sb.areaKm2.toLocaleString('en-US', {maximumFractionDigits: 1})} km²`, icon: L.divIcon({className: '', iconSize: [10, 10], iconAnchor: [5, 5],
      html: `<div class="sub-pin"><span class="lab">${esc(sb.name)}${sb.approx ? '<sup>≈</sup>' : ''}</span></div>`})})
      .on('click', () => focusSub(cur, k)).addTo(subLayer);
  });
  GLACIERS.forEach((g, i) => {
    const sel = picked && g.id === state.glacier, fp = imageFootprint(g).bounds, geom = outlineGeom(g);
    if (sel) {            // the picture area of the chosen glacier: a thin white frame, always (also in the download panes), with a small label written along its top edge
      const far = map.getZoom() < wholeGlacierZoom(g);      // zoomed out beyond the glacier: a click inside the square flies back to the tongue
      frameLayer.addLayer(L.polygon(roundedBox(fp), {color: '#fff', weight: 1.5, opacity: .95, fill: far, fillOpacity: 0, interactive: far, className: far ? 'gframe far' : 'gframe'}).on('click', () => focusTongue()));
      frameLayer.addLayer(L.marker([fp[1][0], fp[0][1]], {interactive: false, keyboard: false, icon: L.divIcon({className: 'frame-label', html: `<span>Current selection: ${g.name}</span>`, iconSize: [220, 12], iconAnchor: [-15, 13]})}));
    }
    const [shape, num] = boxParts(g, i, sel, false);
    boxLayer.addLayer(shape).addLayer(num);
    if (picked) { const [s2, n2] = boxParts(g, i, sel, true); otherLayer.addLayer(s2).addLayer(n2); }      // the same, without fill, for the zoomed-out look at a chosen glacier (the chosen one included)
  });
}
function updateBoxes(){
  const picked = typeof glacierPicked !== 'undefined' && glacierPicked;
  const sel = picked && GLACIERS.find(g => g.id === state.glacier), fpb = sel && imageFootprint(sel).bounds;
  const small = !!fpb && map.getZoom() !== undefined && (map.project(L.latLng(fpb[0][0], fpb[0][1])).y - map.project(L.latLng(fpb[1][0], fpb[1][1])).y) * 2 <= map.getSize().y;      // the map is at least twice as high as the picture area of the chosen glacier
  const show = document.getElementById('boxToggle').checked && (fpb ? small : map.getZoom() <= BOX_MAX_ZOOM) && !$('app').classList.contains('is-framing');      // the layer switch decides: on at the start, off with the first choice. Not in a download frame
  if (show && !map.hasLayer(basinLayer)) basinLayer.addTo(map);
  if (!show && map.hasLayer(basinLayer)) map.removeLayer(basinLayer);
  if (show && !map.hasLayer(boxLayer)) boxLayer.addTo(map);
  if (!show && map.hasLayer(boxLayer)) map.removeLayer(boxLayer);
  $('app').classList.toggle('overview', show);      // the overview look: dimmed background, no tongue or whole-glacier buttons
  const others = small && !$('boxToggle').checked && !show && !$('app').classList.contains('is-framing');
  if (others && !map.hasLayer(otherLayer)) otherLayer.addTo(map);
  if (!others && map.hasLayer(otherLayer)) map.removeLayer(otherLayer);
  const subs = picked && sel.subs && !$('app').classList.contains('is-framing');      // the outlets of an ice cap stay on the map at every zoom
  if (subs && !map.hasLayer(subLayer)) subLayer.addTo(map);
  if (!subs && map.hasLayer(subLayer)) map.removeLayer(subLayer);
  const frame = typeof glacierPicked !== 'undefined' && glacierPicked;      // the frame of the chosen glacier's picture shows at every zoom
  if (frame && !map.hasLayer(frameLayer)) frameLayer.addTo(map);
  if (!frame && map.hasLayer(frameLayer)) map.removeLayer(frameLayer);
}
/* Iceland: the drainage basins of the whole ice cap (RGI 6.0) lie under the outlets that can be chosen, as thin white outlines with their name and area on hover */
const basinLayer = L.layerGroup();
if (REGION.rgi && ICECAP) ICECAP.basins.forEach(b => {
  const poly = L.polygon(b.outline.map(r => [r]), {color: '#fff', weight: 1.1, opacity: .8, fillColor: '#fff', fillOpacity: .04, className: 'basin'}).addTo(basinLayer);
  poly.bindTooltip(`${b.name || REGION.unnamed}, ${b.areaKm2.toLocaleString('en')} km²`, {direction: 'top', sticky: true, className: 'gbox-tip'});
  poly.on('mouseover', () => poly.setStyle({fillOpacity: .18})).on('mouseout', () => poly.setStyle({fillOpacity: .04}));
});
const iceCapBounds = () => L.latLngBounds(ICECAP.basins.concat(ICECAP.outlets).flatMap(b => b.outline.flat()));
function glaciersExtent(){
  if (REGION.rgi && ICECAP) { const b = iceCapBounds(); return [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; }      // the whole ice cap
  const b = GLACIERS.map(g => imageFootprint(g).bounds);
  return [[Math.min(...b.map(x => x[0][0])), Math.min(...b.map(x => x[0][1]))], [Math.max(...b.map(x => x[1][0])), Math.max(...b.map(x => x[1][1]))]];
}
/* the overview of the region: the ten Swiss glaciers, or the whole Vatnajökull ice cap */
function showOverview(animate = true){ stopPlay(); map.fitBounds(glaciersExtent(), {animate, padding: [40, 40]}); }
map.on('zoomend', () => { drawBoxes(); updateBoxes(); });
map.on('resize', updateBoxes);   // the rounded corners are a fixed number of pixels
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
  if (REGION.id === 'ch') e.target.checked ? alti.addTo(map) : map.removeLayer(alti);      // elsewhere the hillshade is drawn in 3D from the heights (the switch is the 3D menu's)
  updateCredits();
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
  if (satShown()) { const n = document.getElementById('notice'); if (n.textContent === SAT_MSG || n.textContent === OLDEST_MSG) { n.classList.remove('show'); clearTimeout(showNotice.t); } }      // the message is gone as soon as it no longer applies: the picture is on, or a glacier is picked
}
document.addEventListener('click', e => {
  const noGlacier = !glacierPicked, t = e.target.closest ? e.target.closest(noGlacier ? '#vizGroup > :not(.step-h), #shareGroup > :not(.step-h):not(.act-link):not(.fyi):not(.fyi-by)' : '.sat-need') : null;
  if (!t || (!noGlacier && satShown())) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); showNotice(satMsg());
}, true);
syncSatUi();

/* ---------- region picker: the second line of the title ---------- */
/* The regions are listed in js/00-regions.js. A country with several areas (Iceland) is a heading with its areas below it; a region without data is listed as "soon" so the menu shows where the
   site is going. Choosing one opens its link (#r=...) and reloads: every region starts clean and loads only its own data. */
function applyRegionUi(){
  document.querySelectorAll('.region-name').forEach(e => { e.textContent = REGION.name; });
  document.getElementById('regionBtn').setAttribute('aria-label', `Region: ${REGION.name}. Change region`);
  document.getElementById('brandLede').textContent = REGION.brandLede;
  document.querySelectorAll('#mhead > span').forEach(e => { e.textContent = REGION.brandLede; });
  document.title = REGION.docTitle;
  /* what the region has no data for is taken off the page: each switch of `features` hides its controls */
  const off = (feature, ...ids) => { if (!FEATURES[feature]) ids.forEach(id => { const el = document.getElementById(id), box = el && (el.closest('label') || el); if (box) box.style.display = 'none'; }); };
  off('view3d', 'viewGroup'); off('trails', 'trailsToggle', 'trailLegend', 'l3Trails', 'l3TrailLegend'); off('aerial', 'aerialToggle', 'l3Aerial'); off('swissBase', 'topoToggle', 'altiToggle', 'l3Topo'); if (!FEATURES.swissBase) { const a = document.getElementById('altiToggle'); if (a) a.closest('label').style.display = 'none'; }      // the hillshade stays in the 3D menu: drawn from the heights
  off('radar', 'maxToggle', 'thickToggle', 'radarToggle', 'l3Max', 'l3Radar'); off('glamos', 'pinToggle', 'outside', 'l3Pin'); if (!GLACIERS[0].outlines) off('glamos', 'oldToggle', 'l3Old'); off('teaser', 'teaserBtn'); off('sizeTool', 'sizeLink');
  if (!FEATURES.glamos && !GLACIERS[0].tongue) off('glamos', 'tongueBtn');      // the Tongue button needs a tongue tip (Iceland has one from the outlet data)
  if (!FEATURES.oldest && !FEATURES.latest) document.querySelectorAll('.spec-row').forEach(e => { e.style.display = 'none'; });
  if (!FEATURES.glamos) document.querySelectorAll('label[for="outside"]').forEach(e => { e.style.display = 'none'; });
  if (REGION.id !== 'ch' && FEATURES.trails) {      // the legend of the paths: footpaths and tracks, and the stretches from where the ice front is in view
    const sight = id => `<span id="${id}" hidden title="Where the line of sight from eye height 1.7 m to the ice front is free (trees and buildings not counted)"><i class="sight-sw"></i>Ice front in view (1.7 m)</span>`;
    document.getElementById('trailLegend').innerHTML = `<span><i style="--c:#FDC200"></i>Footpath</span><span><i style="--c:#FF0000"></i>Track</span>${sight('sightLegend')}`;
    document.getElementById('l3TrailLegend').innerHTML = `<span><i style="--c:#FDC200"></i>Footpath</span><span><i style="--c:#FF0000"></i>Track</span>${sight('l3SightLegend')}`;
    document.querySelectorAll('#trailsToggle, #l3Trails').forEach(el => { const lab = el.closest('label'); lab.title = 'Footpaths and tracks (OpenStreetMap)'; lab.lastElementChild.lastChild.textContent = 'Footpaths and tracks'; });
  }
  if (!FEATURES.glamos) {      // the download panes: no tongue tip, no 1850 outline, no glacier facts and no fact card (their figures are GLAMOS's)
    if (!GLACIERS[0].tongue) document.getElementById('vaTongue').style.display = 'none';
    document.querySelectorAll('.vo-outside').forEach(e => { e.style.display = 'none'; }); if (!GLACIERS[0].outlines) document.querySelectorAll('.vo-outline').forEach(e => { e.style.display = 'none'; });
    if (GLACIERS[0].rgi) { const ice = document.querySelector('#vFactSet option[value="ice"]'); if (ice) ice.remove(); document.getElementById('vFactSet').value = 'retreat'; }      // Iceland: facts of Retreat and Size (no ice volume)
    else document.getElementById('vFacts').checked = false;
    const end = document.getElementById('vEnd'); end.value = 'loop'; end.closest('label').style.display = 'none';
  }
  if (!FEATURES.swissBase) { prefs.topo = prefs.alti = false; }
  if (REGION.id !== 'ch') {
    if (GLACIERS[0].half) { document.getElementById('tongueBtn').title = 'Zoom to the picture area (the tongue)'; document.getElementById('fitBtn').title = 'Fit the whole glacier'; }
    document.getElementById('boxToggle').closest('label').title = `The ${REGION.units} you can choose, as red outlines you can click. Switched off when you choose one.`;
    document.getElementById('boxToggle').parentElement.lastElementChild.lastChild.textContent = `Selectable ${REGION.units}`;
  }
}
function regionItem(r, sub){ return `<li role="option" data-id="${r.id}"${sub ? ' class="sub"' : ''} aria-selected="${r.id === REGION.id}"${r.ready ? '' : ' aria-disabled="true"'}>${r.name}${r.ready ? '' : '<small>soon</small>'}</li>`; }
function renderRegionMenu(){
  document.getElementById('regionMenu').innerHTML = REGIONS.map(r => r.children
    ? `<li class="group" role="presentation">${r.name}</li>` + r.children.map(c => regionItem(c, true)).join('') : regionItem(r)).join('');
}
function toggleRegionMenu(open = document.getElementById('regionMenu').hidden){
  document.getElementById('regionMenu').hidden = !open; document.getElementById('regionBtn').setAttribute('aria-expanded', open);
}
document.getElementById('regionBtn').onclick = e => { e.stopPropagation(); toggleRegionMenu(); };
document.getElementById('regionMenu').onclick = e => {
  const li = e.target.closest('li'); if (!li || li.classList.contains('group') || li.getAttribute('aria-disabled') === 'true') return;
  if (li.dataset.id === REGION.id) return toggleRegionMenu(false);
  history.replaceState(null, '', regionLink(li.dataset.id)); location.reload();
};
document.addEventListener('click', e => { if (!e.target.closest('#regionMenu')) toggleRegionMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('regionMenu').hidden) { toggleRegionMenu(false); document.getElementById('regionBtn').focus(); } });
renderRegionMenu(); applyRegionUi();

/* Landsat years (Iceland): the switch under the years puts the Landsat years in front of the Sentinel-2 years and takes them out again; it stays on across views, modes and glaciers (prefs.landsat) */
async function setLandsat(on){
  if (!REGION.landsat || on === YEARS[0] < FIRST_YEAR) return;
  prefs.landsat = on; savePrefs();
  if (on) YEARS.unshift(...LANDSAT_YEARS); else YEARS.splice(0, LANDSAT_YEARS.length);
  if (!state.checked) { checkYears(); return; }      // a search is running: it starts again with the years now wanted (its answers are kept)
  const g = currentGlacier(), gen = checkGen;
  if (on) {
    const found = await Promise.all(LANDSAT_YEARS.map(y => landsatScene(g, y)));
    if (gen !== checkGen || g.id !== state.glacier || YEARS[0] >= FIRST_YEAR) return;
    LANDSAT_YEARS.forEach((y, i) => { state.available[y] = found[i]; });
  } else {
    restoreLatestIfOld();
    LANDSAT_YEARS.forEach(y => { delete state.available[y]; });
    const ok = okYears(), last = ok[ok.length - 1];      // a side that showed a Landsat year goes back to the Sentinel-2 years
    if (state.a < FIRST_YEAR) state.a = ok[0]; if (state.b < FIRST_YEAR) state.b = last; if (state.from < FIRST_YEAR) state.from = ok[0]; if (state.to < FIRST_YEAR) state.to = last; if (state.one < FIRST_YEAR) state.one = last;
    if (state.a === state.b && ok.length > 1) { state.a = ok[0]; state.b = last; }
  }
  state.frame = 0; setStatus(statusLine()); refreshAll();
}
const restoreLatestIfOld = () => { if (state.latest && state.latest.year < FIRST_YEAR) restoreLatest(); };
{ const row = document.getElementById('landsatRow'), box = document.getElementById('landsatToggle');
  if (REGION.landsat) { row.dataset.title = row.title; row.style.display = ''; box.checked = YEARS[0] < FIRST_YEAR; box.addEventListener('change', () => setLandsat(box.checked)); updateLandsatRow(); } }
/* The text of the Landsat switch; for a glacier whose picture is so small that 30 m pixels make it blurry (under 400 Landsat pixels across, a picture box under 12 km) it says "not recommended" */
async function updateLandsatRow(){
  const t = document.getElementById('landsatText'), row = document.getElementById('landsatRow'); if (!t || !REGION.landsat) return;
  const g = glacierPicked ? currentGlacier() : null, fp = g ? imageFootprint(g) : null, px = fp ? Math.round(Math.max(fp.w, fp.h) * CDSE.groundRes / 30) : 1e9, small = px < 400;
  const note = small ? ` · not recommended here: 30 m pixels, the picture is only ${px} pixels across` : '';
  t.textContent = `Include older imagery${note}`;      // until the file of the glacier says which year is its first
  row.classList.toggle('not-recommended', small); row.title = small ? 'Landsat pictures have 30 m pixels. This glacier is so small that they look very blurry.' : row.dataset.title;
  if (!g) return;
  const f = await landsatFile(g); if (g.id !== (glacierPicked ? currentGlacier().id : null)) return;      // another glacier was chosen meanwhile
  const years = f && f.scenes ? Object.keys(f.scenes).map(Number).sort((x, y) => x - y) : [];
  if (!small) { const sats = [...new Set(Object.values(f && f.scenes || {}).map(sc => String(sc.sat || '').replace(/\D/g, '')).filter(Boolean))].sort(), names = sats.length ? 'Landsat ' + (sats.length > 1 ? sats.slice(0, -1).join(', ') + ' and ' + sats[sats.length - 1] : sats[0]) : 'Landsat';
    row.title = `${names} pictures (30 m) for the years before 2016. They stay on in every view and mode until you switch them off.`; }
  t.textContent = years.length ? `Include older imagery${note}` : `Include older imagery: none found for this glacier`;
  const box = document.getElementById('landsatToggle'), none = !years.length && !box.checked;      // a glacier without Landsat pictures: the switch stays, greyed out and off (if it is on, it can still be switched off)
  box.disabled = none; row.style.opacity = none ? '.5' : ''; row.style.cursor = none ? 'default' : '';
  const ln = row.querySelector('.landsat-note'); if (ln) ln.style.display = none ? 'none' : '';      // the note on 30 m pixels is about pictures that are not there
}
