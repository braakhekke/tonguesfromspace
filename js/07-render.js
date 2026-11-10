import { wire } from './wire.js';
import { FIRST_YEAR, YEARS, iceVolume, EIFFEL_M, PITCH_M2, BUS_M, LAKE_ZURICH_KM3, POOL_L, SWISS_SUPPLY_KM3, HOUSEHOLD_L_DAY, SWISS_POP, VOLUME_LOSS, TRAILS, GLACIER_INFO, lv95, $, PHONE } from './01-data.js';
import { DATA, norm, rankArea, CURRENT_LENGTH, areaText, rankLabel, GLACIERS } from './02-glaciers.js';
import { prefs, savePrefs, STYLE_BANDS, STYLE_NAME, styleName, isLandsat, landsatName, LANDSAT_BANDS, landsatBands, idb, imageFootprint, LATEST, restoreLatest, showLatest, sceneProducts, fmtDM, fmtDate, latestBusy } from './03-imagery.js';
import { state, writeHash, okYears, currentGlacier, viewMode, HASH_TAB, glacierPicked } from './04-state.js';
import { map, osm, topo, updateMapYears, alti, BG_YEAR, oldestAerial, oldestWhat, ensureOldest, showOldest, restoreOldest, oldestPair, oldestOn, setCompareLayers, tlFrames, buildTimelapse, syncFullPlay, THICK_LAYER, thickestSpot, tlLayers, loadSpeedFile, speedArray, speedId, speedMask, speedPeak, speedYearOk, SPEED_MIN, drawArcs } from './05-map.js';
import { statusLine, updateTags } from './06-scene-search.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'cbButtonsHtml', { get: () => cbButtonsHtml, configurable: true });
Object.defineProperty(wire, 'glacierVolume', { get: () => glacierVolume, configurable: true });
Object.defineProperty(wire, 'refreshAll', { get: () => refreshAll, configurable: true });
Object.defineProperty(wire, 'renderMeta', { get: () => renderMeta, configurable: true });
Object.defineProperty(wire, 'renderStory', { get: () => renderStory, configurable: true });
Object.defineProperty(wire, 'renderYears', { get: () => renderYears, configurable: true });
Object.defineProperty(wire, 'setSubFocus', { get: () => setSubFocus, configurable: true });
Object.defineProperty(wire, 'setTag', { get: () => setTag, configurable: true });
Object.defineProperty(wire, 'showImage', { get: () => showImage, configurable: true });
Object.defineProperty(wire, 'subFocus', { get: () => subFocus, configurable: true });
Object.defineProperty(wire, 'syncOutsideUi', { get: () => syncOutsideUi, configurable: true });
Object.defineProperty(wire, 'syncPane', { get: () => syncPane, configurable: true });
/* =====================================================================
   7. Rendering
   ===================================================================== */
/* mouse devices: the glacier list rests as one row (see css/style.css); put the chosen glacier, or the top of the list, in it. True when that applied. */
const restGlacierList = (ul, row) => {
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches || ul.matches(':hover') || ul.querySelector(':focus-visible')) return false;
  ul.scrollTop = row ? Math.max(0, row.offsetTop - 3) : 0; return true;
};
document.addEventListener('pointerleave', e => { const ul = /** @type {HTMLElement | null} */ (e.target); if (ul && ul.id === 'glacierList') setTimeout(() => restGlacierList(ul, ul.querySelector('button[aria-pressed="true"]')), 200); }, true);
export function renderGlacierList(){
  const ul = document.getElementById('glacierList'); ul.innerHTML = '';
  const box = document.getElementById('glacierSearch'), q = box ? box.value.trim() : '';
  if (box) box.hidden = GLACIERS.length <= 10;      // a short list needs no search
  const GS = /** @type {any} */ (window).GlacierSearch, shown = new Set(q && GS ? GS.search(q, GLACIERS.map(g => ({label: g.name, id: g.id})), {limit: GLACIERS.length}).map(r => r.item.id) : GLACIERS.map(g => g.id));
  GLACIERS.forEach((g, i) => {
    if (!shown.has(g.id)) return;
    const area = rankArea(g);
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-pressed', glacierPicked && g.id === state.glacier);      // nothing is highlighted before the first choice
    b.innerHTML = `<span class="rank">${i+1}</span><span class="name">${g.name}</span><span class="area">${areaText(g, 2)} km²</span>`;
    b.onclick = () => wire.chooseGlacier(g.id);
    li.appendChild(b); ul.appendChild(li);
    if (g.subs && glacierPicked && g.id === state.glacier) g.subs.forEach((sb, k) => {      // the outlets of the chosen ice cap, as sub-items: a click zooms to the outlet
      const sl = document.createElement('li'), sbtn = document.createElement('button');
      sl.className = 'sub'; sbtn.type = 'button'; sbtn.setAttribute('aria-pressed', 'false'); sbtn.title = subTitle(sb);
      sbtn.innerHTML = `<span class="rank"></span><span class="name">${sb.name}${sb.approx ? '<sup>≈</sup>' : ''}</span><span class="area">${sb.areaKm2.toLocaleString('en-US', {maximumFractionDigits: 1})} km²</span>`;
      sbtn.onclick = () => focusSub(g, k);
      sl.appendChild(sbtn); ul.appendChild(sl);
    });
  });
  const keepChosenInView = () => { const row = ul.querySelector('button[aria-pressed="true"]'); if (restGlacierList(ul, row)) return; if (!row) return; const top = row.offsetTop, bottom = top + row.offsetHeight; if (top < ul.scrollTop) ul.scrollTop = top; else if (bottom > ul.scrollTop + ul.clientHeight) ul.scrollTop = bottom - ul.clientHeight; };      // only the list scrolls, not the page; again on the next frame, because a click on the map changes the layout first
  keepChosenInView(); requestAnimationFrame(keepChosenInView);
  document.getElementById('rankNote').innerHTML = REGION.rgi ? REGION.rankNote : '';      // (Switzerland: the "Ranked by area" line is gone)
  renderLayerTitles();
  if (typeof wire.updateLandsatRow === 'function') wire.updateLandsatRow();
  if (typeof wire.refreshStreetView === 'function') wire.refreshStreetView();      // js/14-streetview.js: the panoramas of the chosen glacier
}
document.addEventListener('input', e => { if (/** @type {HTMLElement} */ (e.target).id === 'glacierSearch') renderGlacierList(); });
/* The outlets of an ice cap (g.subs, scripts/build_cap_images.py): the name rests on the RGI 6.0 or on the sources in `basis`; a name marked approx is inferred, and said so */
export const subTitle = sb => `${sb.approx ? 'Name inferred, not certain. ' : ''}${sb.basis}`;
export let subFocus = null;      // {gid, k}: the outlet of the chosen ice cap that was clicked last; the 3D view then shows a strip along that outlet (v3dGlacier); the Tongue and Whole glacier buttons clear it
export function focusSub(g, k){
  const sb = g.subs[k]; if (!sb) return;
  subFocus = {gid: g.id, k};
  if (viewMode === '3d' && typeof wire.open3D === 'function') return wire.open3D();      // the 3D view moves to the outlet's own strip
  map.fitBounds(L.latLngBounds(sb.bounds), {paddingTopLeft: PHONE.matches ? [24, 64] : [40, 80], paddingBottomRight: PHONE.matches ? [24, 100] : [40, 110], maxZoom: 14});
}
/* the title of the layer segment that belongs to the chosen glacier, in the map menu and in the 3D menu */
export function renderLayerTitles(){
  const g = glacierPicked ? currentGlacier() : null, t = g ? `For ${g.name}` : 'For this glacier';
  ['lbTitle', 'l3Title'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = t; });
}

/* Timelapse: one slider with two handles, the chosen first and last year at its ends. A handle only stops on years that have a picture. */
export function renderYearRange(){
  const box = document.getElementById('yearsRange'), n = YEARS.length - 1;
  const lo = Math.min(state.from, state.to), hi = Math.max(state.from, state.to), i = y => YEARS.indexOf(y);
  box.innerHTML = `<div class="yr-vals"><b id="yrLo">${lo}</b><span>to</span><b id="yrHi">${hi}</b></div>
    <div class="yr-track"><div class="yr-fill" id="yrFill"></div>
      <input type="range" id="yrA" min="0" max="${n}" step="1" value="${i(lo)}" aria-label="First year">
      <input type="range" id="yrB" min="0" max="${n}" step="1" value="${i(hi)}" aria-label="Last year"></div>
    <div class="yr-ticks">${YEARS.map(y => `<i class="${state.available[y] ? '' : 'off'}" title="${y}${state.available[y] ? '' : ': no picture'}"></i>`).join('')}</div>${REGION.landsat ? '<div class="yr-landsat"></div>' : ''}`;
  if (REGION.landsat) box.querySelector('.yr-landsat').appendChild(landsatChip(true));
  const A = box.querySelector('#yrA'), B = box.querySelector('#yrB'), fill = box.querySelector('#yrFill');
  const paint = () => { const a = +A.value, b = +B.value; fill.style.left = (Math.min(a, b) / n * 100) + '%'; fill.style.width = (Math.abs(b - a) / n * 100) + '%'; box.querySelector('#yrLo').textContent = YEARS[Math.min(a, b)]; box.querySelector('#yrHi').textContent = YEARS[Math.max(a, b)]; };
  const snap = (inp, other) => {            // the nearest year with a picture, in the direction the handle moved
    let v = +inp.value; const dir = v >= +inp.dataset.last ? 1 : -1;
    if (state.checked) { const ok = k => !!state.available[YEARS[k]]; let k = v; while (k >= 0 && k <= n && !ok(k)) k += dir; if (k < 0 || k > n) { k = v; while (k >= 0 && k <= n && !ok(k)) k -= dir; } if (k >= 0 && k <= n) v = k; }
    inp.value = v; inp.dataset.last = v;
  };
  [A, B].forEach(inp => { inp.dataset.last = inp.value;
    inp.oninput = () => { snap(inp, null); paint(); };
    inp.onchange = () => { const a = YEARS[+A.value], b = YEARS[+B.value]; state.from = Math.min(a, b); state.to = Math.max(a, b); refreshAll(); };
  });
  paint();
}
/* The older-imagery switch as a chip at the front of a year row, where 2015 would stand: "+ Landsat" adds the years before 2016, "− Landsat" takes them away again. It drives the hidden checkbox of the old switch (setLandsat, js/08-controls.js), which also holds the greyed-out and "not recommended" states. */
let ccAltChecked = false;      // the fold of the second picture's colour composition is opened by a share link at most once (renderMode)
export function landsatChip(asSwitch = false){
  const sw = document.getElementById('landsatToggle'), row = document.getElementById('landsatRow'), b = document.createElement('button'), on = YEARS[0] < FIRST_YEAR;
  b.type = 'button'; b.className = 'landsat-chip'; b.setAttribute('aria-pressed', on);
  if (asSwitch) { b.classList.add('as-switch'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on); b.innerHTML = '<span class="ls-label">Older imagery <small>before 2016</small></span><span class="ls-track"><span class="ls-knob"></span></span>'; }      // timelapse: a switch row instead of the "+ Older" chip
  else b.textContent = on ? '\u2212 Older' : '+ Older';
  b.title = on ? 'Take the older years (before 2016) away again' : (row && row.classList.contains('not-recommended') ? 'These pictures have 30 m pixels. This glacier is so small that they look very blurry.' : 'Add older pictures (30 m pixels) for the years before 2016. They stay on in every view and mode until you switch them off.');
  b.disabled = !!(sw && sw.disabled); if (b.disabled) b.title = 'No older pictures found for this glacier';
  if (row && row.classList.contains('not-recommended')) b.classList.add('weak');
  b.onclick = () => { if (sw) sw.click(); };
  const info = document.getElementById('landsatInfo'), i = document.createElement('button'), wrap = document.createElement('span');      // the "i" in the box of the chip opens the note on 30 m pixels
  i.type = 'button'; i.className = 'info-btn'; i.textContent = 'i'; i.setAttribute('aria-label', 'About the older imagery'); i.setAttribute('aria-expanded', landsatInfoOpen && !b.disabled);
  i.onclick = () => { landsatInfoOpen = !landsatInfoOpen; document.querySelectorAll('.landsat-wrap .info-btn').forEach(x => x.setAttribute('aria-expanded', landsatInfoOpen)); if (info) { info.hidden = !landsatInfoOpen; if (landsatInfoOpen) wrap.parentElement.after(info); } };      // the note opens right under the row whose "i" was clicked
  if (info) info.hidden = !landsatInfoOpen || b.disabled;
  i.hidden = b.disabled; wrap.className = 'landsat-wrap'; wrap.append(b, i);
  queueMicrotask(() => { if (info && landsatInfoOpen && !b.disabled && wrap.parentElement && wrap.parentElement.offsetParent && !info.offsetParent) wrap.parentElement.after(info); });      // another mode: an open note follows to the row that is on show
  return wrap;
}
let landsatInfoOpen = false;
export function yearChips(boxId, key, opts = {}){
  const box = document.getElementById(boxId); box.innerHTML = '';
  YEARS.forEach(y => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = y;
    const ok = !!state.available[y];
    b.disabled = !ok;                                       // not clickable until confirmed available
    if (state.checked && !ok) { b.classList.add('missing'); b.title = `No ${y} imagery from this source`; }
    if (!state.checked) b.title = 'Checking…';
    const sc = state.available[y];
    if (sc) { b.title = `${fmtDate(sc.date)}${sc.orbit ? ', orbit ' + sc.orbit : ''}${sc.clear ? '' : ' (some clouds)'}${isLandsat(sc) ? ', ' + landsatName(sc) : ''}`; if (!sc.clear) b.classList.add('some'); }      // hover: the day and the orbit of the scene; a year with some clouds has a dashed border
    b.setAttribute('aria-pressed', state[key] === y && !(key === 'one' && (state.latest || state.oldestAerial)) && !((key === 'a' || key === 'b') && key === state.latestSide && state.latest && state.latest.year === y) && !((key === 'a' || key === 'b') && key === state.oldestSide && oldestPair()));
    if (opts.range && ok && y > Math.min(state.from, state.to) && y < Math.max(state.from, state.to)) b.classList.add('in-range');
    b.onclick = () => {
      if (key === 'one' || key === 'b') restoreLatest();      // the slider: Latest belongs to the second side, Oldest to the first
      if (key === 'one' || key === 'a') restoreOldest();
      state[key] = y;
      if (opts.range && state.from > state.to) [state.from, state.to] = [state.to, state.from];
      refreshAll();
    };
    box.appendChild(b);
  });
}
/* The specials row of One year: the oldest aerial image of the glacier's box, the newest scene of the last weeks */
export function specialChips(){
  const box = document.getElementById('yearsSpecial'); box.innerHTML = '';      // One year: Oldest and Latest; Slider: the same two under each picture (below)
  if (!FEATURES.oldest && !FEATURES.latest) return;      // the chips need data of the region (the oldest aerial picture, the cloud masks of the Latest scene); without both the rows are hidden (applyRegionUi)
  const og = currentGlacier(); if (FEATURES.oldest) ensureOldest(og); if (FEATURES.swisstopo) updateMapYears(); const oldest = FEATURES.oldest ? oldestAerial.get(og.id) : null;      // {ed, flown}, null: no aerial image, undefined: still asked
  const chip = (text, title, on, disabled, click, cls, into = box) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.title = title; b.disabled = disabled; b.setAttribute('aria-pressed', on); if (cls) b.className = cls;
    b.onclick = click; into.appendChild(b); return b;
  };
  const NA3D = 'Not available in 3D: the oldest aerial image is shown on the map only. Switch to Map to see it.', in3d = viewMode === '3d';      // 3D has no Oldest: the chip is greyed, the tip and a click say why
  const naOldest = b => { if (in3d) { b.classList.add('is-na'); b.setAttribute('aria-disabled', 'true'); b.title = NA3D; b.onclick = () => wire.showNotice(NA3D); } };
  naOldest(chip('Oldest', oldest === undefined ? 'Looking for the oldest aerial image…' : oldest === null ? 'No aerial image of this area' : `The oldest aerial image of this area: ${oldestWhat(oldest)}`,
    !!state.oldestAerial, !oldest && !in3d, () => { if (state.oldestAerial) { restoreOldest(); refreshAll(); } else showOldest(); }));
  const l = chip('Latest', `The newest clear-ish scene of the last ${LATEST.days} days, with at most ${Math.round(LATEST.maxCloudOutline * 100)} % cloud over the 1850 outline and a clear tongue`,
    !!state.latest, !state.checked || latestBusy, () => { if (state.latest) { restoreLatest(); refreshAll(); } else { restoreOldest(); showLatest(); } }, 'latest-chip');
  for (const side of ['a', 'b']) {      // the slider: each picture has its own Oldest and Latest (one picture per side; the same special is on one side at a time)
    const into = document.getElementById(side === 'a' ? 'yearsSpecialA' : 'yearsSpecialB'), where = side === 'a' ? 'the left or top picture' : 'the right or bottom picture';
    into.innerHTML = '';
    naOldest(chip('Oldest', oldest === undefined ? 'Looking for the oldest aerial image…' : oldest === null ? 'No aerial image of this area' : `The oldest aerial image of this area (${oldestWhat(oldest)}) as ${where}`,
      oldestOn(side), !oldest && !in3d, () => { if (oldestOn(side)) { restoreOldest(); refreshAll(); } else showOldest(side); }, '', into));
    const on = !!state.latest && state.latestSide === side && state[side] === state.latest.year;
    const lc = chip('Latest', l.title, on, l.disabled, () => { if (on) { restoreLatest(); refreshAll(); } else showLatest(side); }, 'latest-chip', into);
    { const ls = state.latest && state.available[state.latest.year]; if (on && ls) { const sm = document.createElement('small'); sm.className = 'chip-date'; sm.textContent = fmtDM(ls.date); lc.appendChild(sm); } }      // Latest on: the day of that picture, small on the chip
    if (!state.oldestAerial) lc.classList.add('sat-need');      // Oldest runs without the Sentinel-2 picture on its side: the chips must stay usable then, to leave it
  }
  if (!state.oldestAerial) l.classList.add('sat-need');
}
/* The download pane shows the years it will use: refresh it whenever the selection or the frame on the map changes */
export function syncPane(){
  try {
    if (!$('videoSheet').hidden && !wire.vstate.busy && !wire.v3dBusy) {            // the pane follows the mode buttons: a timelapse is an animation, one year is a picture
      if (state.mode === 'timelapse' && wire.vstate.kind === 'image') return wire.openVideo('video', true);
      if (state.mode === 'single' && wire.vstate.kind === 'video' && viewMode !== '3d') return wire.openVideo('image', true);      // in 3D one year can still be a camera flight
    }
    if (!$('videoSheet').hidden && viewMode !== '3d' && wire.vstate.kind === 'video' && state.mode !== 'single') { const t = state.mode === 'compare' ? 'swipe' : 'timelapse'; if (wire.vstate.type !== t) wire.setType(t); }   // the pane follows the mode buttons
    wire.updateFrame();
  } catch {}
}
/* Image metadata (the Metadata button in Save and share): the scene behind every year, the pictures on show marked, and what the pictures are made of */
export function renderMeta(){
  const box = document.getElementById('metaBody'); if (!box) return;
  const g = currentGlacier(), ys = okYears();
  if (!g || !state.checked || !ys.length) { box.innerHTML = '<p class="meta-note">Shown when the scenes have been found.</p>'; return; }
  const shown = state.mode === 'compare' ? [state.a, state.b] : tlFrames();
  const open = !document.getElementById('metaBox').hidden;      // the catalogue is asked only while the table is on show
  metaCsv = [['year', 'date', 'orbit', 'selection', 'satellite', 'tile', 'time_utc', 'sun_elevation_deg', 'product_ids']];
  let lastPs;
  const prod = sc => { const ps = lastPs = open && sc ? sceneProducts(g, sc) : undefined;      // image id: satellite and tile, the whole id on hover and copied by a click
    if (ps === undefined) return ['…', '…']; if (!ps || !ps.length) return ['–', '–'];
    return [`<span class="copy" title="${ps.map(p => p.id).join('\n')} (click to copy)" data-copy="${ps.map(p => p.id).join(' ')}">${ps.map(p => `${p.sat} ${p.tile}`).join(', ')}</span>`,
      `${ps[0].time} UTC · sun ${Math.round(ps[0].sun)}°`]; };
  const lt = state.latest, row = (label, sc, on) => { const [id, when] = prod(sc), ps = lastPs || []; 
    if (sc) metaCsv.push([label === 'Latest' ? 'latest' : label, sc.date, sc.orbit || '', sc.latest ? 'latest' : sc.curated ? 'hand-picked' : 'automatic', [...new Set(ps.map(p => p.sat))].join(' '), ps.map(p => p.tile).join(' '), ps.length ? ps[0].time : '', ps.length ? Math.round(ps[0].sun * 10) / 10 : '', ps.map(p => p.id).join(' ')]);
    return `<tr${on ? ' class="on"' : ''}><th scope="row">${label}</th><td data-l="Date">${sc ? fmtDM(sc.date) : ''}</td><td data-l="Orbit">${(sc && sc.orbit) || '–'}</td><td data-l="Image">${id}</td><td data-l="Time and sun">${when}</td></tr>`; };
  const one = state.mode === 'single', onLatest = !!(lt && lt.year === state.one), onOldest = !!state.oldestAerial;      // One year: only the row of the picture on show
  const oa = oldestAerial.get(g.id), top = oa && (!one || onOldest) ? `<tr${state.oldestAerial ? ' class="on"' : ''}><th scope="row">${oa.flown}</th><td data-l="Date">${FEATURES.swisstopo ? `Aerial, edition ${oa.ed}` : 'Aerial mosaic'}</td><td data-l="Orbit">–</td><td data-l="Image">–</td><td data-l="Time and sun">–</td></tr>` : '';      // before 2016: the oldest swisstopo aerial image
  const rows = ys.filter(y => !one || (!onOldest && !onLatest && y === state.one)).map(y => { const sc = lt && lt.year === y ? lt.saved : state.available[y]; return sc ? row(y, sc, shown.includes(y) && !(lt && lt.year === y)) : ''; }).join('');
  const bottom = one && !onLatest ? '' : lt && state.available[lt.year] ? row('Latest', state.available[lt.year], shown.includes(lt.year)) : '<tr><th scope="row">Latest</th><td colspan="4">Press Latest to look for it</td></tr>';      // after the last year: the latest scene, once it has been picked
  const bands = (STYLE_BANDS[state.style] || []).join(' · '), old = oldestAerial.get(g.id);
  const noteYs = one ? [lt && lt.year === state.one ? lt.year : state.one] : ys, noteLs = noteYs.some(y => isLandsat(state.available[y])), noteS2 = !noteYs.length || noteYs.some(y => !isLandsat(state.available[y]));      // labels Before / Since 2016 only when both kinds are on show
  box.innerHTML = `<div class="meta-scroll"><table class="meta-table"><thead><tr><th>Year</th><th>Date</th><th>Orbit</th><th>Image</th><th>Time and sun</th></tr></thead><tbody>${top}${rows}${bottom}</tbody></table></div>
    <p class="meta-note">${noteLs ? `${noteS2 ? '<b>Before 2016:</b> ' : ''}Landsat Collection 2 Level-2 (surface reflectance), ${styleName(state.style, {sensor: 'landsat'})} (${LANDSAT_BANDS[state.style] || LANDSAT_BANDS.natural}; ${landsatBands(state.style, {sat: 'landsat-5'})}), smoothed when enlarged. The scene is named by its path and row (e.g. P216R015). Gaps in Landsat 7 pictures (2003 to 2012) are filled along the ice flow. ${noteS2 ? '<br><b>Since 2016:</b> ' : ''}` : ''}${noteS2 ? `Sentinel-2 L1C, bands ${bands}${state.style === 'false3' ? ' (Hot: ratio picture)' : ''}, ${state.style === 'false2' || state.style === 'false3' ? '20 m pixels, shown at 10 m' : '10 m pixels'}. Image: satellite and tile of the Sentinel-2 product (hover for its id, click to copy), from the Copernicus Data Space Ecosystem catalogue (STAC); a picture of an area on two tiles lists both. Sun: elevation at the time of the pass. The pictures on show are marked.` : ''}${old ? ` Oldest aerial image: flown ${old.flown}, swisstopo SWISSIMAGE edition ${old.ed}.` : ''}</p>
    <button type="button" class="meta-dl" id="metaDl">Download as CSV</button>`;
}
export let metaCsv = [];      // the rows of the table as shown, with the figures and whole ids the table leaves out
export function downloadMetaCsv(){
  const g = currentGlacier(); if (!g || metaCsv.length < 2) return;
  const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([metaCsv.map(r => r.map(q).join(',')).join('\n') + '\n'], {type: 'text/csv'}));
  a.href = url; a.download = `tonguesfromspace-${g.id}-image-metadata.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
document.getElementById('tuneSwitch').onclick = e => { const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', on); document.getElementById('tuneBody').hidden = !on; };      // Adjust image: the switch shows the sliders
/* The panes under Save and share (the metadata table, the embed code, the elevation-model download) are one at a time: opening one closes the others */
export function closeOtherSharePanes(keepBox) {
  for (const [btn, box] of [['metaBtn', 'metaBox'], ['embedBtn', 'embedBox'], ['demBtn', 'demBox']]) {
    if (box === keepBox) continue;
    document.getElementById(box).hidden = true; document.getElementById(btn).setAttribute('aria-expanded', 'false');
  }
}
document.getElementById('metaBtn').onclick = () => { const b = document.getElementById('metaBox'), on = b.hidden; if (on) closeOtherSharePanes('metaBox'); b.hidden = !on; document.getElementById('metaBtn').setAttribute('aria-expanded', on); renderMeta(); };      // the catalogue is asked when the table opens
document.getElementById('metaBody').addEventListener('click', e => { if (e.target.id === 'metaDl') return downloadMetaCsv(); const c = e.target.closest('.copy'); if (!c || !navigator.clipboard) return;
  navigator.clipboard.writeText(c.dataset.copy.replace(/ /g, '\n')).then(() => { const t = c.textContent; c.textContent = 'Copied'; setTimeout(() => { c.textContent = t; }, 1200); }, () => {}); });
export function renderYears(){
  yearChips('yearsA', 'a'); yearChips('yearsB', 'b');
  ['lsA', 'lsOne'].forEach(id => { const slot = document.getElementById(id); slot.innerHTML = ''; if (REGION.landsat) slot.appendChild(landsatChip(true)); });      // the older-imagery switch: under the colour thumbnails of the first slider picture, under the year row of one year (timelapse: under its slider)
  renderYearRange(); yearChips('yearsOne', 'one'); specialChips(); renderMeta();
  if (typeof wire.renderMobileBar === 'function') wire.renderMobileBar();
  syncPane();
}
export function setTag(id, yr){ document.getElementById(id).firstChild.nodeValue = yr ?? '–'; }

export function renderMode(){
  const tl = state.mode !== 'compare';          // timelapse and one year both show on the single image pane
  document.getElementById('app').classList.toggle('is-timelapse', tl);
  document.getElementById('app').classList.toggle('photos-ok', state.mode === 'single'); syncFullPlay();      // the old photographs are for one year only
  document.getElementById('modeCompare').classList.remove('sat-need');      // Oldest has one picture only: the slider is greyed out like the timelapse, a click says why
  document.getElementById('modeTimelapse').classList.toggle('sat-need', !!state.oldestAerial);      // only Oldest (one picture) greys the timelapse; with the Sentinel-2 picture switched off it still plays the aerial years
  document.getElementById('modeCompare').setAttribute('aria-pressed', state.mode === 'compare');
  turnHint();
  document.getElementById('modeTimelapse').setAttribute('aria-pressed', state.mode === 'timelapse');
  document.getElementById('modeSingle').setAttribute('aria-pressed', state.mode === 'single');
  document.getElementById('compareControls').hidden = state.mode !== 'compare';
  document.getElementById('singleControls').hidden = state.mode !== 'single';
  document.getElementById('timelapseControls').hidden = state.mode !== 'timelapse';
  { const row = document.getElementById('landsatRow'), info = document.getElementById('landsatInfo'), label = document.querySelector(state.mode === 'single' ? '#singleControls .side-label' : state.mode === 'timelapse' ? '#timelapseControls .side-label' : null);      // the older-imagery switch hangs directly under the Year (Years) heading; in Compare it stays at the bottom
    if (row) { if (label) label.after(row); else document.getElementById('status').before(row); } }
  ['paneA','paneB'].forEach(p => map.getPane(p).style.display = tl || (p === (state.oldestSide === 'b' ? 'paneB' : 'paneA') && oldestPair()) ? 'none' : '');
  map.getPane('paneT').style.display = tl ? '' : 'none';
  updateTags(); wire.syncSatUi();
  document.getElementById('styleNatural').setAttribute('aria-pressed', state.style === 'natural');
  document.getElementById('styleFalse1').setAttribute('aria-pressed', state.style === 'false1');
  document.getElementById('styleFalse2').setAttribute('aria-pressed', state.style === 'false2');
  document.getElementById('styleFalse3').setAttribute('aria-pressed', state.style === 'false3');
  { const cmpOn = state.mode === 'compare', sB = state.styleB || state.style;      // the slider: each picture has its year chips and its own colour composition, so the shared row and note give way
    document.getElementById('colourGroup').hidden = cmpOn; document.getElementById('styleNote').hidden = cmpOn || !('open' in document.getElementById('styleNote').dataset);      // (the note is behind the small i)
    document.querySelectorAll('#swatchesA .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.style === state.style));
    document.querySelectorAll('#swatchesB .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.style === sB));
    if (!ccAltChecked && state.styleB) { ccAltChecked = true; if (state.styleB !== state.style) document.getElementById('ccAltB').open = true; } }      // a different composition from a share link: open the fold once; after that only the visitor opens or closes it
  { const ns = document.getElementById('navSize'), g = currentGlacier(); if (ns && g && FEATURES.sizeTool) ns.href = sizeHref(g, '3d'); }      // the Size link in the panel header opens the size page on this glacier in 3D
  applyBrightness();
  document.getElementById('styleNoteA').textContent = document.getElementById('styleNote').textContent = {
    natural: 'As the eye sees it: snow white, rock grey, plants green.',
    false1: 'Plants look red, snow white, bare ice grey, water dark/blue.',
    false2: 'Snow and ice look red, clouds white, rock pale, water black.',
    false3: 'Ice and snow yellow to orange, rock blue. Red is the red/SWIR ratio, green the blue band, blue the SWIR (shortwave infrared).'
  }[state.style];
}
export function setStyleB(st){            // the second picture of the slider gets its own colour composition
  state.styleB = st;
  renderMode(); renderMeta();
  if (state.checked) setCompareLayers();
  renderStory(); wire.sync3D();
}
export function setStyle(st){
  state.style = prefs.style = st; savePrefs();
  renderMode(); renderMeta();      // the image metadata names the bands and pixel size of the style
  if (state.checked) { setCompareLayers(); buildTimelapse(); }
  renderStory(); wire.sync3D();
}
/* Brightness: gamma curve on the imagery panes (exponent = 1 / brightness). Remembered. */
export const BRIGHT_DEFAULT = 1.0;      // the colour process above is already balanced
export const brightness = () => typeof prefs.bright === 'number' ? prefs.bright : BRIGHT_DEFAULT;
/* Brightness is applied to the image pixels in a canvas (same gamma curve, white stays white).
   CSS/SVG filters on page elements do not work in Safari on iPhone, so no filters are used. */
export const liveImages = new Set();
export const adjCache = new Map();
/* Outside the 1850 outline: the image gets this opacity there (1 = untouched), so the background map shows through. Needs the glacier's outline. */
export const outsideAlpha = () => typeof prefs.outside === 'number' ? prefs.outside : 1;
export const stampOf = (b, o) => b.toFixed(2) + '|' + (o < 0.99 ? o.toFixed(2) : '');
export const outlineGeom = g => g && g.inv && g.inv.oldest ? g.inv.oldest.outline : null;
export function adjustedUrl(orig, b, o, g){
  const geom = o < 0.99 ? outlineGeom(g) : null;
  if (Math.abs(b - 1) < 0.01 && !geom) return Promise.resolve(orig);
  const key = orig + '|' + stampOf(b, o);
  if (!adjCache.has(key)) adjCache.set(key, (async () => {
    const bmp = await createImageBitmap(await (await fetch(orig)).blob());
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0); if (bmp.close) bmp.close();
    if (Math.abs(b - 1) >= 0.01) {
      const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data, lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, 1 / b);
      for (let i = 0; i < px.length; i += 4) { px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]]; }
      ctx.putImageData(d, 0, 0);
    }
    if (geom) {
      const bb = imageFootprint(g).bbox, m = document.createElement('canvas'); m.width = c.width; m.height = c.height;
      const mc = m.getContext('2d'); mc.fillStyle = `rgba(0,0,0,${o})`; mc.fillRect(0, 0, m.width, m.height);
      mc.fillStyle = '#000'; mc.beginPath();
      geom.coordinates.forEach(poly => poly.forEach(ring => {
        ring.forEach((pt, i) => { const p = L.CRS.EPSG3857.project(L.latLng(pt[1], pt[0])), x = (p.x - bb[0]) / (bb[2] - bb[0]) * m.width, y = (bb[3] - p.y) / (bb[3] - bb[1]) * m.height; i ? mc.lineTo(x, y) : mc.moveTo(x, y); });
        mc.closePath();
      }));
      mc.fill('evenodd');
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0); ctx.globalCompositeOperation = 'source-over';
    }
    const blob = await new Promise(res => c.toBlob(res, geom ? 'image/png' : 'image/jpeg', 0.92));      // transparency needs PNG
    return URL.createObjectURL(blob);
  })());
  return adjCache.get(key);
}
export function showImage(ov, orig){
  ov._orig = orig; liveImages.add(ov);
  const b = brightness(), o = outsideAlpha(), stamp = stampOf(b, o);
  /* a picture counts as ready when its final image is loaded and decoded (a timelapse waits for this, otherwise the first run flashes blank frames) */
  const put = u => {
    ov._ready = false;
    const done = () => { const el = ov.getElement && ov.getElement(); (el && el.decode ? el.decode() : Promise.resolve()).catch(() => {}).then(() => { ov._ready = true; ov.fire('tfsready'); }); };
    if (ov._url === u && ov.getElement && ov.getElement() && ov.getElement().complete) done(); else { ov.once('load', done); ov.setUrl(u); }
  };
  adjustedUrl(orig, b, o, ov._g).then(u => { if (ov._orig === orig && stampOf(brightness(), outsideAlpha()) === stamp) { ov._hiStamp = stamp; put(u); } }).catch(() => put(orig));
}
export let brightTimer = null, refreshGen = 0;
export const visibleOv = ov => ov.options.opacity > 0 && ov.getPane && ov.getPane().style.display !== 'none';
export function refreshImages(){            // after a change of brightness or of the outside opacity: drop old results, redo the pictures on the map (the ones on show first)
  clearTimeout(brightTimer);
  brightTimer = setTimeout(() => {
    const gen = ++refreshGen, keep = '|' + stampOf(brightness(), outsideAlpha());
    for (const [k, p] of adjCache) if (!k.endsWith(keep)) { adjCache.delete(k); p.then(u => setTimeout(() => URL.revokeObjectURL(u), 5000)).catch(() => {}); }
    const list = [...liveImages].filter(ov => { if (!map.hasLayer(ov)) { liveImages.delete(ov); return false; } return !!ov._orig; });
    list.sort((a, b) => visibleOv(b) - visibleOv(a));
    list.forEach((ov, i) => i === 0 ? showImage(ov, ov._orig) : setTimeout(() => { if (gen === refreshGen && map.hasLayer(ov) && ov._orig) showImage(ov, ov._orig); }, 60 * i));      // one after the other: the pictures not on show must not hold up the one that is
  }, 220);
}
/* While the brightness slider moves, the full pictures (up to 2,500 px, a timelapse holds a dozen) are far too much work for every step: each step is shown on small copies of
   the pictures (one pass per screen frame, every frame of a timelapse too), and the full pictures follow when the slider rests (refreshImages). */
export const PREVIEW_PX = 640, smallCache = new Map();      // original url -> small canvas
export function smallOf(orig){
  if (!smallCache.has(orig)) {
    if (smallCache.size >= 40) smallCache.delete(smallCache.keys().next().value);
    smallCache.set(orig, (async () => {
      const bmp = await createImageBitmap(await (await fetch(orig)).blob());
      const k = Math.min(1, PREVIEW_PX / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      return c;
    })().catch(() => { smallCache.delete(orig); return null; }));
  }
  return smallCache.get(orig);
}
export let previewQueued = false;
export function previewBrightness(){
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    if (outsideAlpha() < 0.99) return;      // the pictures are cut at the 1850 outline then: only the full pictures show that
    const stamp = stampOf(brightness(), outsideAlpha());
    liveImages.forEach(ov => {
      if (!ov._orig || !map.hasLayer(ov)) return;
      const stale = () => stampOf(brightness(), outsideAlpha()) !== stamp || ov._hiStamp === stamp;
      smallOf(ov._orig).then(c => {
        if (!c || stale()) return;
        const b = brightness(), w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
        const ctx = w.getContext('2d'); ctx.drawImage(c, 0, 0);
        const d = ctx.getImageData(0, 0, w.width, w.height), px = d.data, lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, 1 / b);
        for (let i = 0; i < px.length; i += 4) { px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]]; }
        ctx.putImageData(d, 0, 0);
        w.toBlob(blob => {
          if (!blob || stale()) return;
          const u = URL.createObjectURL(blob), old = ov._previewUrl; ov._previewUrl = u; ov._hiStamp = null; ov.setUrl(u);
          if (old) setTimeout(() => URL.revokeObjectURL(old), 3000);
        }, 'image/jpeg', 0.85);
      });
    });
  });
}
export function applyBrightness(){
  const b = brightness();
  document.getElementById('brightness').value = b;
  document.getElementById('brightnessOut').textContent = `${Math.round(b * 100)} %`;
  refreshImages();
}
export function syncOutsideUi(){            // the slider on the map panel and the one in the download pane are one setting
  const o = outsideAlpha(), has = !!outlineGeom(typeof currentGlacier === 'function' ? currentGlacier() : null);
  [['outside', 'outsideOut'], ['vOutside', 'vOutsideOut']].forEach(([id, out]) => {
    const el = document.getElementById(id); if (!el) return;
    el.value = o; el.disabled = !has; document.getElementById(out).textContent = `${Math.round(o * 100)} %`;
  });
  const bgOn = ['mosaicToggle', 'osmToggle', 'topoToggle', 'oldMapToggle', 'altiToggle', 'aerialToggle', 'labelsToggle'].some(id => document.getElementById(id).checked);
  const note = document.getElementById('outsideNote');      // the download pane switches the background layers off itself
  note.hidden = true;      // (the long note on surroundings opacity is gone)
}
['mosaicToggle', 'osmToggle', 'topoToggle', 'oldMapToggle', 'altiToggle', 'aerialToggle', 'labelsToggle'].forEach(id => document.getElementById(id).addEventListener('change', () => syncOutsideUi()));
/* While the download pane is open and the picture outside the outline is made transparent, the background layers are switched off: a download has no map underneath, so the preview must not show one.
   They come back when the opacity returns to 100 % or the pane closes (a layer you switched on again yourself stays on). The saved layer settings are not touched. */
export let bgOff = null, labelsAuto = false, trailsAuto = false;
export function syncBackgrounds(){
  const open = !document.getElementById('videoSheet').hidden, labelsEl = document.getElementById('labelsToggle');
  const flipLabels = on => { labelsEl.checked = on; labelsEl.dispatchEvent(new Event('change')); };
  const keepOverlays = wire.exportLayersOn();      // map layers are part of the download: place labels and trails stay
  if (open && labelsEl.checked && !labelsAuto && !keepOverlays) { labelsAuto = true; flipLabels(false); }              // place labels stay off while a download pane is open
  else if (!open && labelsAuto) { labelsAuto = false; if (!labelsEl.checked) flipLabels(true); }      // and come back when it closes
  const trailsEl = document.getElementById('trailsToggle'), flipTrails = on => { const keepPref = prefs.trails; trailsEl.checked = on; trailsEl.dispatchEvent(new Event('change')); prefs.trails = keepPref; savePrefs(); };      // your saved choice is not touched
  if (open && trailsEl.checked && !trailsAuto && !keepOverlays) { trailsAuto = true; flipTrails(false); }                 // the hiking trails are not in the downloads either
  else if (!open && trailsAuto) { trailsAuto = false; if (!trailsEl.checked) flipTrails(true); }
  const low = open && !wire.exportLayersOn() && ((outsideAlpha() < 0.99 && !!outlineGeom(currentGlacier())) || wire.frameExceedsImage());      // reaching beyond the picture: space, no map and no other glaciers (unless map layers are part of the download: then the maps stay, and the download prints them)
  const ids = ['mosaicToggle', 'osmToggle', 'topoToggle', 'oldMapToggle', 'altiToggle', 'aerialToggle', 'labelsToggle'], keep = { mosaic: prefs.mosaic, osm: prefs.osm, topo: prefs.topo, alti: prefs.alti };
  const flip = (id, on) => { const el = document.getElementById(id); el.checked = on; el.dispatchEvent(new Event('change')); };
  if (low && !bgOff) { bgOff = ids.filter(id => document.getElementById(id).checked); bgOff.forEach(id => flip(id, false)); }
  else if (!low && bgOff) { bgOff.forEach(id => { if (!document.getElementById(id).checked) flip(id, true); }); bgOff = null; }
  else return;
  prefs.mosaic = keep.mosaic; prefs.osm = keep.osm; prefs.topo = keep.topo; prefs.alti = keep.alti; savePrefs();
}
/* Opacity of the whole satellite image (all years, compare and timelapse): the background layers show through. Remembered. */
export const imgOpacity = () => typeof prefs.imgOpacity === 'number' ? prefs.imgOpacity : 1;
export function applyImgOpacity(){
  const o = imgOpacity();
  ['paneA', 'paneB', 'paneT'].forEach(n => { map.getPane(n).style.opacity = o; });
  ['imgOpacity', 'mapOp'].forEach(id => { document.getElementById(id).value = o; document.getElementById(id + 'Out').textContent = `${Math.round(o * 100)} %`; });
}
['imgOpacity', 'mapOp'].forEach(id => document.getElementById(id).oninput = e => { prefs.imgOpacity = +e.target.value; savePrefs(); applyImgOpacity(); if (viewMode === '3d') { wire.sync3DMenu(); wire.refresh3D(); } });
applyImgOpacity();
export const setOutside = v => { prefs.outside = v; savePrefs(); syncOutsideUi(); refreshImages(); syncBackgrounds(); if (viewMode === '3d') wire.refresh3D(); };      // the 3D picture is made again too
['outside', 'vOutside'].forEach(id => { const el = document.getElementById(id); if (el) el.oninput = e => setOutside(+e.target.value); });      // (the download pane has no such slider any more)
syncOutsideUi();
document.getElementById('brightness').oninput = e => {
  prefs.bright = +e.target.value; savePrefs(); applyBrightness(); previewBrightness(); if (viewMode === '3d') wire.refresh3D();      // the 3D picture is made again too (it waits until the slider rests)
};
document.getElementById('styleNatural').onclick = () => setStyle('natural');
document.getElementById('styleFalse1').onclick = () => setStyle('false1');
document.getElementById('styleFalse2').onclick = () => setStyle('false2');
document.getElementById('styleFalse3').onclick = () => setStyle('false3');
document.querySelectorAll('#swatchesA .sw').forEach(b => b.onclick = () => setStyle(b.dataset.style));
document.querySelectorAll('#swatchesB .sw').forEach(b => b.onclick = () => setStyleB(b.dataset.style));

export let storyTab = HASH_TAB || (REGION.rgi ? 'look' : 'figures');     // tab in the right panel: Stats on start, then kept when switching glacier
/* The cards of the Switzerland tab: the same stack as in Discover; one open at a time, the choice remembered */
export const scard = (key, icon, title, html, sum = '') => `<details class="card dcard coll" name="swiss" data-card="${key}"${cardOpen(key) ? ' open' : ''}><summary><div class="card-h"><span class="ico">${ICONS[icon]}</span>${title}</div>${sum}</summary><div class="dbody">${html}</div></details>`;
/* The selected glacier against all of Switzerland: its share of the ice (filled in when the volume is known), of the area, and its place among the glaciers of the inventory */
export function shareBody(g){
  const inv = DATA && DATA.inventory, count = inv && inv.count, area = g.inv ? g.inv.area_km2 : null, rank = g.inv ? g.inv.rank : null;
  const areaPct = inv && area ? area / inv.area_km2 * 100 : null;
  const place = rank === 1 ? 'the largest' : rank ? `no. ${rank} by area` : '';
  return `<div class="stat-row" id="shareRow">
      <div class="stat hero wide"><span class="v" id="shIce">…</span><span class="k" id="shLab">of all Swiss glacier ice</span><span class="d" id="shNote"></span></div>
      ${areaPct !== null ? `<div class="stat"><span class="v">${areaPct < 10 ? areaPct.toFixed(1) : Math.round(areaPct)} %</span><span class="k">Area</span><span class="d">of the total glaciated area of Switzerland${fn('sgi')}</span></div>` : ''}
      ${count && rank ? `<div class="stat"><span class="v">${rank} <small>of all ${count.toLocaleString('en')}</small></span><span class="k">Rank by area</span><span class="d">Swiss glaciers${fn('sgi')}</span></div>` : ''}
    </div>
`;
}
/* The cards of the Discover tab lie in a stack, each over the foot of the one before, so only the titles show. A click opens one card (name= makes them exclusive). */
export const dcard = (icon, title, html) => `<details class="card dcard coll" name="discover"><summary><div class="card-h"><span class="ico">${ICONS[icon]}</span>${title}</div></summary><div class="dbody">${html}</div></details>`;
/* The identity of a chapter across redraws: its title, not the whole summary (that also holds the headline figure, which changes with the years) */
export const cardKey = d => { const t = d.querySelector('summary h4, summary .card-h'); return (t || d.firstElementChild).textContent.trim(); };
/* The About block at the foot of the right panel, the same for every region: its chapters (a list of <details>) between the heading and the social links with the invitation to GitHub.
   Switzerland's chapters are aboutChaptersCh(), Iceland's aboutChaptersIc() (js/07a-region-icecaps.js). */
/* The paragraph on the Landsat pictures before 2016 that every region's chapter The satellite images has (the switch under the years): what they are and how they differ from Sentinel-2 */
export const landsatAbout = rule => `<h4>Before 2016: Landsat</h4>
        <p>Sentinel-2 starts in 2016. A switch under the years adds real Landsat 5 and 7 pictures (Collection 2 Level-2, USGS) for ${REGION.landsat ? REGION.landsat.first : 1985} to 2013. Their pixels are 30 m, not 10 m: less detail.</p>
        <ul>
          <li>One scene per year, by the same rules (${rule}), the whole picture covered where there is such a scene. No usable scene, no picture.</li>
          <li>Three colour styles: natural, and two false colours from the near and shortwave infrared bands Landsat also has (1: near infrared, red, green; 2: near infrared and the two shortwave infrared bands, the counterparts of Sentinel-2 B8A, B11 and B12).</li>
          <li><em>Colour matching:</em> the years are matched to each other on ground without ice, so sensors and seasons look alike. Each picture is shifted onto the Sentinel-2 mosaic where it lies off.</li>
          <li><em>Landsat 7 stripes</em> (after 2003) are filled by interpolating along the ice flow, read from streaks in the picture (medial moraines, flow lines): a repair, not data.</li>
          <li>Landsat 8 (2013 to 2015) is not used: its surface reflectance is not usable over ice, shade and water.</li>
          <li>Real 30 m pixels, unsmoothed (one picture pixel = one Landsat pixel, nearest neighbour): no detail is invented. No slope-shading correction.</li>
          <li>In 3D, draped over the ice surface of their year where the glacier has a terrain file with a surface for each year (before 2011, the surface of 2011), otherwise over the one elevation model.</li>
          <li>Under 400 Landsat pixels across, the switch says "not recommended".</li>
        </ul>`;
/* The social links and the GitHub invitation: at the foot of the About block; on phones they sit below the For Your Ice box (js/09-phones.js fills #fyiSlot with them; css hides the other copy) */
export const inviteHtml = () => `<div class="social" aria-label="Follow Tongues from Space"><a href="https://www.instagram.com/tonguesfromspace/" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.8" cy="7.2" r="1.2"/></svg></a><a href="https://www.tiktok.com/@tonguesfromspace" target="_blank" rel="noopener" aria-label="TikTok" title="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v10.5a3 3 0 1 1-3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 4c.4 2.4 1.8 3.8 4.2 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></a><button type="button" class="social-share" aria-label="Share this view" title="Share this view: link, or the share sheet of your device"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.1 10.9l7.8-3.8M8.1 13.1l7.8 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>
      <div class="gh-invite"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg><span>For questions, remarks, bugs, find me here.<em><a href="https://github.com/braakhekke/tonguesfromspace" target="_blank" rel="noopener">github.com/braakhekke/<wbr>tonguesfromspace</a></em></span></div>`;
/* Sources: a folded block of its own at the foot of the story, above About (as on the size page); the small numbers in the text jump to its entries. */
export const sourcesBlock = () => `<details class="sec sources coll" id="sources"><summary><div class="card-h">Sources</div></summary><div class="landsat-info" id="creditsLive">${document.getElementById('credits')?.innerHTML || ''}</div><ol class="src-list">${SOURCE_LIST.map(k => `<li id="fn-${k}" title="Click to go back to the text">${SOURCES[k]()}</li>`).join('')}${dynSources.map((h, i) => `<li id="fn-g${i + 1}" title="Click to go back to the text">${h}</li>`).join('')}</ol></details>`;
export const aboutFrame = chapters => `    ${sourcesBlock()}
    <div class="about-wrap">
    <details class="about">
      <summary>About Tongues from Space</summary>
${chapters}
    </details>
    ${inviteHtml()}
    </div>`;
/* Chapters of About that every region shares (Sentinel-2, the colours); extra: a region's own sentence at the end of the Temporal paragraph */
export const aboutSentinel = extra => `<details class="about-ch" name="aboutch" id="ch-3"><summary>Sentinel-2</summary><div class="about-sec">
        <p>Two European satellites of the Copernicus programme (2A since 2015, 2B since 2017), looking straight down on a strip 290 km wide.</p>
        <p><em>Detail (spatial):</em> pixels of 10 m (blue, green, red, near infrared), 20 m (six bands) or 60 m (three). Detail under about 10 m is invisible. Natural and False 1 use 10 m bands; False 2 uses 20 m bands and looks softer; False 3 uses one 20 m band (B11).</p>
        <p><em>Colour bands (spectral):</em> 13, from visible light (about 443 nm) to shortwave infrared (about 2190 nm).</p>
        <p><em>Revisit (temporal):</em> each satellite returns every 10 days; both together every 5 days at the equator, more often at higher latitudes. ${extra}</p>
      
      </div></details>`;
export const aboutColours = () => `<details class="about-ch" name="aboutch" id="ch-4"><summary>The colours</summary><div class="about-sec">
        <p>Each picture combines three bands (slices of the light the satellite records) as red, green and blue. The four buttons in step 2 carry nicknames: Natural, Infra (False 1), Bloody (False 2), Hot? (False 3). False colours are a code, not what an eye would see.</p>
        <ul>
          <li><em>Natural</em> (B04, B03, B02): as the eye sees it. Snow white, rock grey, plants green.</li>
          <li><em>False 1</em> (B08, B04, B03), infrared: near infrared shown as red. Plants red, snow white, bare ice grey, water dark or blue. Sets bare ice, snow and vegetation apart.</li>
          <li><em>False 2</em> (B8A, B11, B12): snow and ice red, clouds white, rock pale, water black. Experimental; handy for telling ice from cloud.</li>
          <li><em>False 3</em> (B04, B11, B02, as a ratio picture): ice and snow yellow to orange, rock blue. Red is the red/SWIR ratio, green the blue band, blue the SWIR (shortwave infrared).</li>
        </ul>
      
      </div></details>`;
export function aboutChaptersCh(){
  return `
      <p class="about-group">Using the site</p>
      <details class="about-ch" name="aboutch" id="ch-22"><summary>For teachers and journalists</summary><div class="about-sec">
        <p><strong>In short.</strong> A satellite photographs each glacier every late summer. Flip through the years and watch the tongue pull back.</p>
        <h4>What you can say</h4>
        <ul>
          <li>The pictures are real Sentinel-2 satellite images: one clear late-summer scene per glacier and year, 2016 to now, with 10 m pixels.</li>
          <li>Length, area and ice-volume change come from GLAMOS, the Swiss glacier monitoring network. The source sits next to each figure.</li>
          <li>The ten glaciers are the ten largest in Switzerland by area in the newest inventory.</li>
          <li>A label says how sure a number is: measured, computed here, or estimated (see How to read this).</li>
        </ul>
        <h4>Try this in class</h4>
        <ul>
          <li>Open a glacier, press Timelapse. Where does the tongue end each year?</li>
          <li>Switch to Slider and drag between 2016 and now.</li>
          <li>Open the Size visualizer. How big is the ice beside your own city?</li>
        </ul>
        <h4>What it cannot tell you</h4>
        <ul>
          <li>One picture is one clear day, not the whole summer.</li>
          <li>Ice volumes and the 3D surfaces between surveys are models.</li>
          <li>The newest figures are provisional.</li>
        </ul>
        <p>The details are under Limits and Method.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-1"><summary>Why Tongues from Space</summary><div class="about-sec">
        <p>A glacier ends in its <em>tongue</em>: the lowest stretch of ice, thin and fast-melting. Change shows here first. Each summer the tip pulls back and leaves bare rock, a lake or a new valley floor. A 10 m satellite pixel is fine enough to see it.</p>
        <p>Pictures come first, figures beside them. A before-and-after is understood at once and stays in memory.</p>
        <p>Every picture is a real satellite image of the day shown, not a rendering. One optional exception, the Super-resolution layer in 3D, is labelled.</p>
        <p>The aim: awareness of glaciers and why they matter, for instance for the water they store. That is why the ice also appears in litres, swimming pools and Lake Zurich. — Jochem Braakhekke</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-14"><summary>How to use it</summary><div class="about-sec">
        <h4>Left panel: three steps</h4>
        <ul>
          <li><em>1 Choose</em> a glacier from the list or on the map: the ten largest in Switzerland.</li>
          <li><em>2 Compare.</em> View: Map or 3D (the camera flies between them; switch "Fly between map and 3D" off to jump). Mode: <em>One year</em>, <em>Slider</em> (drag the line to compare two years) or <em>Timelapse</em> (one picture per year, with speed and loop). Colours: four choices (see The colours). <em>Adjust image</em> changes brightness and opacity; <em>Metadata</em> (under Save and share) names the bands and pixel size.</li>
          <li><em>3 Save and share:</em> image, animation, link and more (see Save and share).</li>
        </ul>
        <h4>Right panel: three tabs</h4>
        <ul>
          <li><em>Discover:</em> what to look for, news, a fun fact, the origin of the name, a hike and a bike route, links to the scenes in the Copernicus Browser.</li>
          <li><em>Stats:</em> Area, Length, Thickness and volume, Ice speed, Water storage. The tiles follow your selected years.</li>
          <li><em>Switzerland:</em> the glacier in perspective; the ice lost over your years, turned into water.</li>
        </ul>
        <p>One click opens a card and closes the last. Small numbers jump to Sources; a dash or a note says a figure does not exist for a glacier.</p>
        <h4>On a phone</h4>
        <p>Map first, then the left panel, then the story. Two fingers move the map. The same switch opens 3D.</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-23"><summary>How to read this</summary><div class="about-sec">
        <ul>
          <li><em>Colour.</em> Red marks loss. Blue marks ice and water.</li>
          <li><em>Time.</em> Years are glaciological years: 1 October to 30 September, named after the year they end in. 2017 is October 2016 to September 2017. A summer picture and the value of its year belong together (see Years and periods).</li>
          <li><em>Pictures.</em> One scene per year, the clearest late-summer day, not the whole season. Natural colour is what an eye sees; false colours are a code (see The colours).</li>
          <li><em>Charts.</em> Every year has a bar; a red line under the label marks the years you selected. Sums include both ends of your selection.</li>
          <li><em>How sure.</em> Measured, computed here, or estimated (see Measured, computed or estimated). The page says so next to an estimate.</li>
          <li><em>Gaps.</em> A dash means no figure exists. A small raised number points to its source.</li>
        </ul>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-17"><summary>Save and share</summary><div class="about-sec">
        <h4>Image</h4>
        <p>The view as shown, map or 3D, as one JPEG.</p>
        <h4>Animation</h4>
        <p>A short MP4 made in your browser from the slider, the timelapse or the 3D view. Choose the format (16:9 landscape, 9:16 portrait, 4:5 for the Instagram feed), the framing (the tongue, the whole glacier or the whole image box) and an end card (Glacier facts, Ice, Retreat or Size).</p>
        <p>Also: a moving viewpoint in 3D, minimal text, the 1850 outline, loops (with going back in time between loops) and, for 9:16, text kept clear of the Reels and TikTok buttons. Card figures follow the right panel: ice and water are the estimates under Ice and water; outline, length and area are GLAMOS values.</p>
        <h4>Share, elevation model, gallery, size</h4>
        <ul>
          <li><em>Share:</em> your device's share sheet, or a copied link that reopens this glacier with the same mode, years and colours.</li>
          <li><em>Elevation model</em> (3D, glaciers with yearly surfaces): the ice surface of a year for GIS software, as GeoTIFF, ESRI ASCII grid or XYZ points, in the Swiss grid LV95 (EPSG:2056). A model, not a measurement; for non-commercial use.</li>
          <li><em>Gallery</em> (button under the title): pictures and videos shared by visitors. Sending one confirms you made it and agree it is shown. It waits for approval.</li>
          <li><em>Size visualizer</em> (above the tabs, right panel): the glacier's ice as a block beside your city (Volume 3D), or its outline dragged onto the city (Area 2D).</li>
        </ul>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-19"><summary>Size visualizer</summary><div class="about-sec">
        <p>A separate page, the <a href="size.html">Size visualizer</a>, answers one question: how big is a glacier? Open it from the button above the tabs in the right panel. It covers the ten glaciers of this site.</p>
        <h4>Two views</h4>
        <ul>
          <li><em>Area (2D):</em> drag a glacier's outline onto a city. The outlines are those of the Swiss Glacier Inventory.${fn('sgi')}</li>
          <li><em>Volume (3D):</em> the glacier's ice as a block, or a ball, dropped onto the terrain next to a city or landmark. Volumes: the estimates under Ice and water.</li>
        </ul>
        <h4>Choosing</h4>
        <ul>
          <li>Pick a glacier from the list or on the map; the last two you pick are compared. <em>All ten</em> shows all at once.</li>
          <li>Pick a city, or type your own. In 3D there are landmarks too.</li>
        </ul>
        <h4>Saving and sharing</h4>
        <p><em>Your visual</em> saves a picture, <em>Share</em> copies a link to exactly this view, <em>Embed</em> gives code for your own page.</p>
        <p>The block and the ball are drawings that help you judge size.</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-20"><summary>Other pages</summary><div class="about-sec">
        <ul>
          <li><em>Start page</em> (<a href="home.html">home.html</a>): regions and glaciers on a map, and the way into the explorer and the Size visualizer.</li>
          <li><em>Gallery</em> (<a href="gallery.html">gallery.html</a>): pictures and videos shared by visitors (see Save and share).</li>
          <li><em>Field notes</em> (<a href="provenance.html">provenance.html</a>): for each glacier with yearly ice surfaces, how each year's surface was found, how uncertain it is, how it was checked (see The 3D view).</li>
          <li><em>Other regions:</em> the ice cap Vatnajökull in Iceland is in the making, others are planned. Only Switzerland is complete.</li>
        </ul>
      
      </div></details>
      <p class="about-group">The pictures</p>
      <details class="about-ch" name="aboutch" id="ch-2"><summary>The satellite images</summary><div class="about-sec">
        <h4>Choosing the scene</h4>
        <p>One real Sentinel-2 scene per glacier and year: the clearest view between 1 July and 20 September. Each acquisition is scored for cloud and snow. The best September scene wins, then August, then July.</p>
        <p>Pictures are rendered from Level-1C data with the Copernicus Browser true colour process, which keeps shaded slopes natural.</p>
        <h4>The picking tool</h4>
        <p>For some glaciers a separate picking tool chose each year's scene. It scores every acquisition from 1 August to the middle of October for cloud, cloud shadow, mountain shadow, snow and haze, in the bottom 3 km of the tongue and over the whole image. It prefers days near 30 September and keeps one satellite orbit (one fixed flight path) for all years.</p>
        <ul>
          <li>No cloud, cloud shadow or big mountain shadow in the bottom 3 km (loosened only for a year that would otherwise have no scene).</li>
          <li>At most 10 % cloud anywhere in the image.</li>
        </ul>
        <h4>Why not after the 20th</h4>
        <p>That is the rule for the automatic choice. Swiss glacier monitoring counts in glaciological years (1 October to 30 September), and GLAMOS measures at the end of the melt season. So September images match the annual figures: the picture of summer 2017 shows the ice at the end of the glaciological year 2017 (see Years and periods).</p>
        <p>After about 20 September, fresh snow often hides the tongue. In 2024 the limit is 14 September: heavy snow fell on the 15th.</p>
        ${REGION.landsat ? landsatAbout('1 July to 20 September, the clear scene closest to 1 September') : ''}
      </div></details>
      ${aboutSentinel('Over Aletsch: about 3 acquisitions a week, up to 4 (32, 33 and 41 days between 1 July and 20 September in 2023 to 2025). Clouds, shadow and fresh snow remove many of them.')}
      ${aboutColours()}
      <details class="about-ch" name="aboutch" id="ch-5"><summary>Why only these ten glaciers</summary><div class="about-sec">
        <p>${DATA && DATA.inventory ? `The Swiss Glacier Inventory ${DATA.latest_label} lists ${DATA.inventory.count.toLocaleString('en')} glaciers with a total area of ${Math.round(DATA.inventory.area_km2)} km². The ten largest hold ${DATA.inventory.top_share_pct} % of it; ${DATA.inventory.n_under_0_5km2.toLocaleString('en')} are smaller than 0.5 km² and ${DATA.inventory.n_under_0_1km2.toLocaleString('en')} smaller than 0.1 km².` : 'Switzerland has about 1,400 glaciers (GLAMOS), most of them small.'}</p>
        <p>At 10 m per pixel, a glacier of 0.1 km² is only about 1,000 pixels: its tongue is a few pixels wide, and a retreat of a few metres a year is less than one pixel. The ten largest have tongues many pixels wide that retreat by tens of metres, and that shows.</p>
      </div></details>
      <p class="about-group">The numbers</p>
      <details class="about-ch" name="aboutch" id="ch-13"><summary>Years and periods</summary><div class="about-sec">
        <p>Swiss glacier monitoring counts in glaciological years, 1 October to 30 September. A yearly value is named after the year it ends in: 2017 is October 2016 to September 2017; the year ending in September 2026 is the 2026 value (the 2025/2026 measurement period).</p>
        <p>That melt season ends where the summer-2017 satellite picture is taken, so a picture and its year's value belong together. Each chart bar is one such year.</p>
        <h4>Selecting years</h4>
        <p>Years you select in step 2 count with both ends. A sum over 2017–2019 adds 2017, 2018 and 2019: the change from autumn 2016 to autumn 2019. One picture of 2017 gives the values of 2017 alone.</p>
        <p>Charts show every year and mark the chosen ones with a red line under the label. Sums sit under the chart and in the tiles. Ice volumes (Swiss ice, a glacier's ice) are stocks at the end of a year, read at the end of September.</p>
        <h4>Estimates</h4>
        <p>Anything derived from yearly values for a chosen period (thickness, volume and balance of a glacier, the Swiss loss, the melted water) is an estimate from GLAMOS's yearly mass balance, calibrated on measured volume surveys. It is not a new measurement of the period.</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-6"><summary>Glacier figures</summary><div class="about-sec">
        <h4>Area</h4>
        <p>All figures are from GLAMOS; a dash means no value. Area: Swiss Glacier Inventories ${DATA ? `${DATA.oldest_label} and ${DATA.latest_label}` : '1850 and 2016'}. When tributaries separate, part of an area drop is a change of definition, not only melt.${DATA ? '' : ' <em>The GLAMOS data file is not loaded yet.</em>'} The card compares 1850, 1973 and the newest inventory.</p>
        <h4>Length</h4>
        <p><em>Length change</em> is measured at the tongue; negative means retreat. GLAMOS publishes only the change between surveys, never the length, so lengths are derived:</p>
        <ul>
          <li>Latest length: read from a GLAMOS overview figure with one length per glacier, for the year where the glacier's last bar ends (2025 for most; 2023 for Corbassière and Zmutt, surveyed every few years).</li>
          <li>"Length in 1870" (or the year of the first survey): that length plus all retreat recorded since. Aletsch: 22.11 km + 3.387 km = about 25.5 km.</li>
          <li>Exact only if the surveys follow each other without gaps and reach the figure's year. Otherwise the tile shows "≈", and the real value may differ by the retreat of the missing years.</li>
        </ul>
        <h4>The Change tile and the yearly bars</h4>
        <ul>
          <li><em>Change</em> adds the length surveys that end in the chosen years (the survey starting the autumn before the first chosen year counts, as it ends in that year). It says when surveys cover a shorter period: one survey can span several years, and the newest data end before the newest images.</li>
          <li><em>Retreat per year</em> shows every year from 2016 on and marks the chosen ones.</li>
          <li>Where GLAMOS measured length only over several years (for example 2017 to 2020 at Corbassière), the change is spread evenly and the bars are dashed. Years with no survey stay empty.</li>
        </ul>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-8"><summary>Thickness and volume</summary><div class="about-sec">
        <h4>Volume change from surveys</h4>
        <p><em>Mean ice thickness change</em>, <em>volume change</em> and <em>mass balance</em> (ice gained or lost, in metres of water per year) come from this glacier's GLAMOS volume-change survey. Aerial surveys give elevation models of the surface; the difference between two shows the ice lost in between.</p>
        <ul>
          <li>The newest survey starting closest to 2016 sets the headline loss and period. It is not your selected years.</li>
          <li>Mass balance: the volume change as metres of water per year, with a density of 850 kg/m³; the ± is GLAMOS's uncertainty.</li>
          <li>Only surveys covering at least 90 % of the glacier count.</li>
        </ul>
        <p>The three tiles follow your selected years. They add up (volume; thickness, the volume over the survey's mean area) or average (balance, as GLAMOS measured it, not scaled) the yearly mass balance of those years, scaled to the glacier's volume survey. So they are estimates. Without yearly values for your years, they show the survey period.</p>
        <h4>Radar ice thickness</h4>
        <p>Ground-penetrating-radar measurements along lines on the surface, between 1958 and 2017 depending on the glacier. The map shows the mean of every 50 m cell: the thickness when measured. Today the ice is thinner.</p>
        <p><em>Thickest ice</em> is one number with its year and source: the maximum of the ice thickness map of Grab et al.${fn('grab')} in that map's reference year (2017 for Aletsch). The pin marks its cell. The card gives the map's uncertainty there, towards thicker (+) and thinner (−) ice, as the data collection states it.</p>
        <p>A model result, not a measurement: radar lines calibrate an ice-flow model that fills the gaps. Only a radar or seismic maximum measured after the map's reference year would replace it, and the card and pin would say so. The layer "Ice thickness 2016 (modelled)" shows the whole map.</p>
        <h4>Ice thickness change per year</h4>
        <p>GLAMOS's yearly mass balance for the image years, as metres of ice (the balance in water divided by 0.85). Aletsch, Rhone, Corbassière and Findel are measured directly each year; the other six show the line of all Swiss glaciers. Switch between <em>Per year</em> and <em>Cumulative</em> (bars added from autumn 2015); your selected years are marked and summed.</p>
        <p>A mass balance and a surface-height change are different measurements, but over decades they add up to nearly the same. The headline above the tiles comes from elevation-model surveys, which span several years each.</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-15"><summary>Ice speed</summary><div class="about-sec">
        <h4>Where it comes from</h4>
        <p>The layer <em>Ice speed</em> and the Stats card use the ITS_LIVE annual mosaics of image pair velocities, version 2.1 (120 m, one mosaic per RGI region, 2013 to 2024).${fn('itslive')} The product tracks features on the ice surface between pairs of satellite images (Landsat 8/9, Sentinel-2 and Sentinel-1).</p>
        <p>Values are copied and only cut to the glacier's picture box. Under 5 m/yr the product cannot tell ice from rock (rock beside the glaciers reads 1 to 2 m/yr): nothing is drawn there, and only ice inside the oldest outline is shown.</p>
        <h4>On the map</h4>
        <ul>
          <li>The layer shows the picture's year (slider: the right-hand year; timelapse: the frame). Years outside the file have no speed map, and a note says so.</li>
          <li>A pin marks the year's fastest ice: the highest value along a line from the tongue up the glacier, after a running median (a smoothing that ignores outliers) over about 400 m. Other branches can be faster.</li>
          <li>Click the glacier with the layer on: the speed there in every year (the mean of the 3 × 3 cells around the click).</li>
          <li>Pin, click values and card are computed here from the product, and say so. Not shown in 3D or in the downloads.</li>
        </ul>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-7"><summary>Ice and water</summary><div class="about-sec">
        <h4>Ice in Switzerland</h4>
        <p>Swiss glaciers held about 45.1 km³ of ice at the end of 2025 (GLAMOS, Swiss-wide series, which gives the volume of every year since 1915). The explorer uses the years from 2016. 1 km³ of ice gives about 0.9 trillion litres of water.</p>
        <h4>Ice of one glacier</h4>
        <p>Grab et al.${fn('grab')} modelled the ice around 2016 (each glacier has its own reference year in the map, 2017 for Aletsch). From there the explorer uses what GLAMOS measured for this glacier:</p>
        <ul>
          <li>its volume survey: how much ice one metre of yearly mass balance is worth for it;</li>
          <li>its yearly balance (its own where measured, else that of all Swiss glaciers): spreads the loss over the years;</li>
          <li>for the newest autumn, with no yearly balance yet: the Swiss loss of that year, turned into a balance (same ratio of ice volume to balance as in the survey years) and spread the same way.</li>
        </ul>
        <p>Big glaciers lose a smaller share than the Swiss average, which small glaciers dominate, so this gives more ice than a plain national percentage. A best estimate, not a measurement.</p>
        <h4>Water and comparisons</h4>
        <p>The Switzerland tab turns the ice lost over your chosen years (from the end of the year before the first to the end of the last) into litres and four comparisons: Olympic swimming pools, Lake Zurich, the yearly Swiss tap water, and household water use per resident (9 million residents, 142 litres a day, SVGW). The text chips on the cards use the same sizes:</p>
        <ul>
          <li>Eiffel Tower: 330 m high (with antennas, toureiffel.paris)</li>
          <li>Football pitch: 105 × 68 m = 7,140 m² (usual international size)</li>
          <li>City bus: about 12 m long (standard bus, an articulated one is 18 m)</li>
          <li>Olympic swimming pool: 50 × 25 × 2 m = 2.5 million litres</li>
          <li>Lake Zurich: 3.9 km³</li>
          <li>Swiss water supply: 931 million m³ in 2022 (SVGW)</li>
        </ul>
      
      </div></details>
      <p class="about-group">Layers and 3D</p>
      <details class="about-ch" name="aboutch" id="ch-16"><summary>Map layers</summary><div class="about-sec">
        <p>Open <em>Layers</em> at the top right of the map. The same menu works in 3D, with a few layers of its own (see The 3D view).</p>
        <p><em>Pictures</em></p>
        <ul>
          <li><em>Sentinel-2 image:</em> the chosen year, with its own opacity.</li>
          <li><em>swisstopo aerial:</em> SWISSIMAGE (see Aerial images, trails and panoramas).</li>
          <li><em>Surroundings opacity</em> (left panel) fades the picture outside the 1850 outline.</li>
        </ul>
        <p><em>The glacier</em></p>
        <ul>
          <li><em>Outline 1850</em> and <em>Outline 2023:</em> the Swiss Glacier Inventory.${fn('sgi')}</li>
          <li><em>Tongue tip 2023:</em> the lowest point of the 2023 outline.</li>
          <li><em>Thickest ice:</em> where the ice is thickest by the thickness map of Grab et al.${fn('grab')} (or by a newer radar survey, if there is one). <em>Radar points:</em> the radar measurements (the mean of every 50 m cell).${fn('radar')}</li>
          <li><em>Glacier thickness 2016:</em> the modelled thickness map of Grab et al.${fn('grab')} (the menu says 2016; the map's reference year differs by glacier, 2017 for Aletsch).</li>
          <li><em>Ice speed:</em> see Ice speed.</li>
        </ul>
        <p><em>Around the glacier</em></p>
        <ul>
          <li><em>Hiking trails</em>, with the band where the tongue can be seen. <em>Panoramas</em> (Street View, Aletsch only).</li>
          <li><em>Other glacier names:</em> the chosen glacier and the others inside its picture (names from Wikidata and the Randolph Glacier Inventory${fn('names')}).</li>
          <li><em>Selectable glaciers:</em> the ten glaciers as red outlines you can click; off once you choose one.</li>
        </ul>
        <p><em>Backgrounds</em> behind and around the picture: the Sentinel-2 mosaic (cloudless, by EOX), OpenStreetMap, the swisstopo map, a hillshade (shaded relief) and place labels.${fn('bg')}</p>
        <p><em>Tools:</em> Tongue fits the view to the picture box and Whole glacier to the whole glacier. Measure length and Measure area draw on the map and give the value. Clear removes them.</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-10"><summary>The 3D view</summary><div class="about-sec">
        <p>A strip along the glacier: from 1 km below the tongue tip to about 6.5 km up the glacier, 4 km wide, with the real satellite picture of the chosen year draped over the terrain. Heights: the newest edition of swisstopo's swissALTI3D elevation model (a height map of the ground), served as tiles by Mapterhorn and stored with the page on a 14 m grid.${fn('terrain')}</p>
        <p>Drag to orbit and tilt. Shift-drag or right-drag (two fingers on a phone) to move. Scroll or pinch to zoom. The layers menu, measuring tools and downloads work as on the map.</p>
        <p>3D layers: Historical images, Space (a night sky behind the terrain), Peak names and, where the data exists, Bedrock and Super-resolution (below).</p>
        <h4>Ice surface of each year</h4>
        <p>Each year's surface is the ice on the day of that year's satellite picture. It is a physical model fitted to every dated elevation model of the glacier (swisstopo flights since 2017, the 2021 and 2022 lidar, the two swissALTI3D editions), with the GLAMOS mass balance and a fitted rate of ice flow between and beyond them. Where a flight or the lidar was flown, that day's surface is reproduced. Elsewhere it is a model, and the page says so under the picture.</p>
        <p>Ten glaciers have a surface for each year, 2016 to 2026. Grosser Aletsch comes first; the nine others follow the same method, and only the differences are listed.</p>
        <p><em>Grosser Aletsch</em>${fn('yearly')}</p>
        <ul>
          <li>Fitted to all dated elevation models of the glacier: 13 swisstopo flights (2017 to 2025), the 2021 lidar and the two swissALTI3D editions.</li>
          <li>Between and beyond the surveys: the GLAMOS mass balance per elevation band, the melt timing and a fitted rate of ice flow. The tip lake is flat.</li>
          <li>2018 to 2025 are measured on most of the strip; 2016 is extrapolated, 2017 is measured on part of the ice, 2026 is a provisional estimate. Older pictures use the surface of 2016.</li>
          <li>ICESat-2 laser heights check the years that have shots.</li>
        </ul>
        <p>A model, not a measurement, except on the days and cells a survey covers. <em>Science mode</em> (the Scientific field notes button at the top of this panel) shows for each year how the surface was found, its uncertainty and its checks. The full account is in the <a href="provenance.html?id=B36-26" target="_blank" rel="noopener">field notes</a>.</p>
        <p><em>The nine others.</em> Between and beyond the surveys the surface follows the balance and a fitted rate of ice flow. For each glacier the field notes list the survey dates and the ICESat-2 check (not in the fit: shots, model minus shot median, NMAD, computed).</p>
        <ul>
          <li><em>Gornergletscher</em> (<a href="provenance.html?id=B56-07" target="_blank" rel="noopener">field notes</a>). GLAMOS has no balance of any kind for it, so a straight line in elevation fitted to the balances of five other glaciers drives the melt (computed; see the field notes). Measured: 2017, 2019, 2020, 2021, 2022, 2023, 2024, 2025 (partly: 2018). Extrapolated or estimated: 2016, 2026.</li>
          <li><em>Rhonegletscher</em> (<a href="provenance.html?id=B43-03" target="_blank" rel="noopener">field notes</a>). Uses GLAMOS's own elevation-band balance of the glacier (2026 estimated). Measured: 2016, 2017, 2019, 2020, 2021, 2022, 2023, 2024, 2025. Extrapolated or estimated: 2026. Left out of the fit: 1 flight (2018-09-11), see the field notes.</li>
          <li><em>Fieschergletscher</em> (<a href="provenance.html?id=B40-07" target="_blank" rel="noopener">field notes</a>). GLAMOS has no balance of any kind for it, so the elevation-band balance of Aletsch drives the melt (computed; see the field notes). Measured: 2017, 2021 (partly: 2022, 2023, 2024, 2025). Extrapolated or estimated: 2016, 2026.</li>
          <li><em>Unteraargletscher</em> (<a href="provenance.html?id=A54g-11" target="_blank" rel="noopener">field notes</a>). GLAMOS has no balance of any kind for it, so the elevation-band balance of the Rhone drives the melt (computed; see the field notes). Measured: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025. Extrapolated or estimated: 2016, 2017, 2026.</li>
          <li><em>Corbassière</em> (<a href="provenance.html?id=B83-03" target="_blank" rel="noopener">field notes</a>). Uses GLAMOS's own elevation-band balance of the glacier (2026 estimated). Measured: 2021, 2022, 2024; anchored on an edition: 2016, 2023. Extrapolated or estimated: 2017, 2018, 2019, 2020, 2025, 2026.</li>
          <li><em>Zmuttgletscher</em> (<a href="provenance.html?id=B57-05" target="_blank" rel="noopener">field notes</a>). GLAMOS has no balance of any kind for it, so the elevation-band balance of Corbassière drives the melt (computed; see the field notes). Measured: none (partly: 2021, 2022); anchored on an edition: 2023. Extrapolated or estimated: 2016, 2017, 2018, 2019, 2020, 2024, 2025, 2026. Reduced data: see the field notes.</li>
          <li><em>Findelgletscher</em> (<a href="provenance.html?id=B56-03" target="_blank" rel="noopener">field notes</a>). Uses GLAMOS's own elevation-band balance of the glacier (2026 estimated). Measured: 2019, 2020, 2021, 2022, 2023, 2024, 2025. Extrapolated or estimated: 2016, 2017, 2018, 2026.</li>
          <li><em>Feegletscher</em> (<a href="provenance.html?id=B53-04" target="_blank" rel="noopener">field notes</a>). GLAMOS has no balance of any kind for it, so the elevation-band balance of Corbassière drives the melt (computed; see the field notes). Measured: 2018, 2019, 2021, 2022; anchored on an edition: 2023. Extrapolated or estimated: 2016, 2017, 2024, 2025, 2026.</li>
          <li><em>Triftgletscher (BE)</em> (<a href="provenance.html?id=A54e-24" target="_blank" rel="noopener">field notes</a>). GLAMOS has no balance of any kind for it, so a straight line in elevation fitted to the balances of five other glaciers drives the melt (computed; see the field notes). Measured: 2021, 2022, 2023, 2024, 2025 (partly: 2017, 2019, 2020); anchored on an edition: 2016. Extrapolated or estimated: 2026.</li>
        </ul>
        <h4>Bedrock</h4>
        <p>Where the terrain file has a bed, the layer Bedrock cuts the strip open like a block diagram: ice above, bedrock below. The bed is swissBEDROCK, a model: under glaciers it is swissALTI3D minus a modelled ice thickness.${fn('bedrock')}</p>
        <p>With the ice switched off you see the bed with a rock look painted from the ice-free ground around it; hollows get a small lake. The colours and the lakes are modelled, not measured.</p>
        <p>Where GLAMOS has radar for the glacier, <em>Thickness cross-section</em> draws a line across it and charts its surface and bed (downloads as SVG, PNG and CSV).</p>
        <h4>Super-resolution</h4>
        <p>Optional, for the ten glaciers, 2016 to 2026: the Sentinel-2 picture of the year run through a super-resolution model (SEN2SR, 10 m to 2.5 m).${fn('sr')}</p>
        <p>The extra detail is the model's estimate, not something the satellite saw. The layer is off until you switch it on. No other picture on the site is sharpened this way.</p>
        <h4>Lakes</h4>
        <p>In front of the Rhone, Findel and Zmutt glaciers a lake can have grown over ground the model holds as a slope. Where a year's picture shows water (found from its colour), the terrain there is set to the level of the lake the model already holds, so the water lies flat. A lake with no such level in the model is left as it is.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-11"><summary>Old photographs</summary><div class="about-sec">
        <p>"Historical images" (3D view, one year) shows historic photographs of the lower tongue for eight glaciers: Aletsch, Gorner, Fiescher, Unteraar, Zmutt, Rhone, Findel and Fee. Source: the ETH Library's Bildarchiv; volunteers on Smapshot (HEIG-VD) worked out where each camera stood and looked.</p>
        <p>Click a photograph, or a camera symbol on the terrain (switch it on in the dropdown): the 3D view flies there, same direction, same field of view. Drag the line to compare with today.</p>
        <p>Kept: photographs dated to about a year, with the tongue in the picture; each shows its own licence. A rod on today's ice marks the estimated ice height then: from the whole glacier's thinning in the GLAMOS volume surveys, and before the first survey from the 1850 area with area-volume scaling (Bahr et al. 1997). The range is wide; the figure is an estimate.</p>
      
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-12"><summary>Aerial images, trails and panoramas</summary><div class="about-sec">
        <p><em>swisstopo aerial</em> (SWISSIMAGE): switch it on in the layers menu. It shows only inside the image box of the chosen glacier, for the year you picked. The year it names is when the photographs were taken, which can be earlier than the edition (the 2025 edition shows photographs from 2023 at Aletsch). Switch the Sentinel-2 image off to see it alone.</p>
        <p><em>Hiking trails</em> come from swisstopo. The white outline marks where a person 1.7 m tall can see the tongue from the trail (computed here from the elevation model; trees and buildings are not counted). The distances in the hike and bike cards (how far a route passes from the tongue) are computed here too.</p>
        <p><em>Panoramas</em> (Grosser Aletsch only): the best Street View panoramas of the glacier, from the upper glacier down to the tongue. They open in Google's own viewer; only their ids are stored here.${fn('streetview')}</p>
      
      </div></details>
      <p class="about-group">What to trust</p>
      <details class="about-ch" name="aboutch" id="ch-24"><summary>Method</summary><div class="about-sec">
        <h4>A picture, in four steps</h4>
        <ol>
          <li>Every Sentinel-2 pass from 1 July to 20 September is scored for cloud and snow.</li>
          <li>The clearest day wins: September first, then August, then July.</li>
          <li>The picture is rendered from that day's Level-1C data with the Copernicus Browser true colour process. Pixels are never sharpened, except in the labelled Super-resolution layer.</li>
          <li>For some glaciers a picking tool chose the scene with stricter rules and one satellite orbit for all years.</li>
        </ol>
        <h4>A number</h4>
        <ul>
          <li>Measured figures are copied as the source states them, with the source beside them.</li>
          <li>What the page adds (sums, averages, comparisons) is computed here, and labelled.</li>
          <li>Where nobody measured (the ice of a glacier in a given year, a surface between surveys) a model fills in, and the page says estimated.</li>
        </ul>
        <h4>A surface in 3D</h4>
        <p>A physical model, fitted to every dated elevation model of the glacier, to the GLAMOS mass balance and to a fitted rate of ice flow. Details: The 3D view and the field notes.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-25"><summary>Limits</summary><div class="about-sec">
        <ul>
          <li><em>Cloud and snow.</em> A clear day may not exist. Clouds, shadow and fresh snow remove many acquisitions; after about 20 September snow often hides the tongue. The picture is then the best of a poor set.</li>
          <li><em>Scene choice.</em> A picture is one day. The day differs between years, so snow and shade differ too. Compare with care.</li>
          <li><em>Sharpness.</em> At 10 m per pixel, detail under about 10 m is invisible. A retreat of a few metres a year is under one pixel, which is why only the ten largest glaciers are shown.</li>
          ${REGION.landsat ? `<li><em>Landsat colour matching.</em> Years are matched on ice-free ground so they look alike. That makes them comparable, not identical. The pixels are 30 m, and filled Landsat 7 stripes are a repair, not data.</li>` : ''}
          <li><em>Measured or modelled.</em> The ice thickness map, the bed, a glacier's ice in a given year, and 3D surfaces between surveys are models. A surface is measured only on the days and cells a survey covers.</li>
          <li><em>Timing.</em> Surveys have their own periods, and the newest data end before the newest images. Figures for 2026 are provisional.</li>
        </ul>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-18"><summary>Measured, computed or estimated</summary><div class="about-sec">
        <h4>Measured</h4>
        <p>Copied from the source: the ${REGION.landsat ? 'Sentinel-2 and Landsat pictures' : 'Sentinel-2 pictures'} (real satellite images), the outlines of the Swiss Glacier Inventory, the GLAMOS length changes, volume changes between surveys, yearly mass balance of Aletsch, Rhone, Corbassière and Findel, radar ice thickness, ITS_LIVE speeds and, on the Aletsch strip, the surfaces of 2017, 2021 and 2023.</p>
        <h4>Computed here</h4>
        <p>From measured values, and labelled so: sums and averages over your selected years, lengths in 1870 and today, the football pitches, buses and Eiffel Towers, the pin and click values of the ice speed, the distances of the hikes, and the band where the tongue can be seen from a trail.</p>
        <h4>Modelled or estimated</h4>
        <ul>
          <li>the ice of a glacier in a given year and everything derived from it: the thickness, volume and water tiles of chosen years, the water storage, the Switzerland tab;</li>
          <li>the ice thickness map of Grab et al. and the bed of swissBEDROCK;</li>
          <li>the ice surface of the years that are not measured, and the figures of 2026 (the newest autumn has no yearly measurement yet);</li>
          <li>the rock look and the lakes of the bed;</li>
          <li>the super-resolved picture${REGION.landsat ? ' and the stripes filled in Landsat 7 pictures (a repair of the picture, not data)' : ''}.</li>
        </ul>
        <p>Where a figure is an estimate, the page says so next to it.</p>
      
      </div></details>
      <p class="about-group">Behind the site</p>
      <details class="about-ch" name="aboutch" id="ch-21"><summary>About me</summary><div class="about-sec">
        <p>I am Jochem Braakhekke, from the Netherlands. The mountains became my home ground. I have worked on glaciers around the globe and guided polar expeditions in both the Arctic and the Antarctic.</p>
        <p>I hold a bachelor's degree in Earth Sciences from the University of Amsterdam and a master's degree in Earth Science from ETH Zürich, with glaciology and geology as my main fields. Today I am an academic associate at the remote sensing lab at UZH and a scientific consultant at the Swiss NPOC.</p>
        <p>I made Tongues from Space on my own and keep it up to date: the pictures, the numbers, the texts and the code.</p>
        <p>I use an AI assistant (Claude) to write code, find and read sources and draft texts. I decide what goes in, and I check what it produces before it is published.</p>
        <p>The code is open on <a href="https://github.com/braakhekke/tonguesfromspace" target="_blank" rel="noopener">GitHub</a>, where you can also write to me with questions, remarks and bugs. The site is non-commercial; the licences of the code, the texts and the data are in the README and under Sources. Follow along on <a href="https://www.instagram.com/tonguesfromspace/" target="_blank" rel="noopener">Instagram</a> and <a href="https://www.tiktok.com/@tonguesfromspace" target="_blank" rel="noopener">TikTok</a>. See also <a href="https://recognice.org/" target="_blank" rel="noopener">Recogn.ice</a> and <a href="https://foryourice.org/" target="_blank" rel="noopener">For Your Ice</a>.</p>
      
      </div></details>
`;
}
document.getElementById('story').addEventListener('click', e => {      // the tool buttons above the tabs of the right panel start the cross-section on the map or in the 3D view
  const b = e.target.closest && e.target.closest('[data-tool="sect"]'); if (!b) return;
  const sb = document.getElementById(viewMode === '3d' ? 'v3mSect' : 'measureSect'); if (!sb || sb.hidden) return;
  if (matchMedia('(max-width:720px)').matches) document.getElementById('stage').scrollIntoView({block: 'start', behavior: 'smooth'});      // on a phone the map is above the panel
  sb.click();
});
const FIELD_NOTES = ['B36-26', 'B56-07', 'B43-03', 'B40-07', 'A54g-11', 'B83-03', 'B57-05', 'B56-03', 'B53-04', 'A54e-24'];      // the glaciers with yearly surfaces and so a provenance.html page (data/yearly/<id>.json)
document.getElementById('story').addEventListener('click', e => {      // the field notes page gets the year on screen and the way back to this view
  const a = e.target.closest && e.target.closest('.notes-btn'); if (!a) return;
  const y = state.mode === 'single' ? state.one : state.mode === 'compare' ? state.b : state.to;
  a.href = `/provenance.html?id=${a.dataset.notes}&${y ? `year=${y}&` : ''}back=${encodeURIComponent(location.href)}`;
});
export function renderStory(){
  if (REGION.rgi) return wire.renderStoryIcecap();      // js/07a-region-icecaps.js
  const g = currentGlacier(); if (typeof wire.updateRightTab === 'function') wire.updateRightTab();
  const [lo, hi] = state.mode === 'single' ? [state.one, state.one]
    : state.mode === 'timelapse' ? [Math.min(state.from, state.to), Math.max(state.from, state.to)]
    : [Math.min(state.a, state.b), Math.max(state.a, state.b)];
  const known = lo && hi;
  const inRange = VOLUME_LOSS.filter(n => n.y >= lo && n.y <= hi);      // the year of an image counts: 2017 is the glaciological year Oct 2016 to Sep 2017


  dynSources = [];
  const statsHtml = renderStats(g, lo, hi);

  const info = GLACIER_INFO[g.id] || GLACIER_INFO[wire.shortSlug(g.name)];
  const tab = t => `role="tab" data-tab="${t}" aria-selected="${storyTab === t}"`;
  const storyEl = document.getElementById('story'), aboutOpen = !!(document.querySelector('details.about') || {}).open, keepScroll = storyEl.scrollTop, sameGlacier = storyEl.dataset.glacier === g.id;
  storyEl.dataset.glacier = g.id; storyEl.classList.toggle('empty', !glacierPicked);
  const openCards = sameGlacier ? [...storyEl.querySelectorAll('details.coll[open]')].map(cardKey) : [];      // the cards you had open stay open when the panel is redrawn
  storyEl.innerHTML = `
    <div class="story-empty"><h2>Nothing selected yet</h2><p>Click a glacier on the map, or pick one from the list. Its story, figures and sources show up here.</p></div>
    <h2>${g.name}</h2>
    <p class="sub">${[g.local, g.canton, g.range].filter(Boolean).join(', ')}</p>
    <p class="lede">${g.lede.replace('by area,', `by area${fn('sgi')},`)}</p>

    <div class="tool-btns">
      ${FEATURES.sizeTool ? `<a class="tool-btn size-btn" href="${sizeHref(g, '3d')}" title="See how big the ice of this glacier is next to a city (3D), or drag its outline onto the city (2D)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h6v10M14 20V4h6v16M2 20h20"/></svg><span>Size visualizer</span></a>` : ''}
      ${FIELD_NOTES.includes(g.inv && g.inv.id) ? `<a class="tool-btn notes-btn" href="/provenance.html?id=${g.inv.id}" data-notes="${g.inv.id}" target="_blank" rel="noopener" title="How the 3D view of this glacier was made: pictures, terrain, ice surface of each year, checks and licences"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4M3 7h3M3 12h3M3 17h3"/></svg><span>Scientific field notes</span></a>` : ''}
    </div>
    <div class="tabs" role="tablist" aria-label="About this glacier">
      <button type="button" ${tab('look')}>Discover</button>
      <button type="button" ${tab('figures')}>Stats</button>
      <button type="button" ${tab('swiss')}>Switzerland</button>
    </div>

    <div class="tab-panel" data-panel="look" ${storyTab === 'look' ? '' : 'hidden'}>
      ${[
        g.look ? dcard('eye', 'What to look for', `<p>${g.look}</p>`) : '',
        g.note ? dcard('news', 'In the news', `<p>${g.note.replace(/<small class="srcline">Source:\s*(.*?)<\/small>/, (m, src) => gfn(src))}</p>`) : '',      // a "Source:" line in the note becomes a numbered source like the others
        info && info.fact ? dcard('bulb', 'Did you know?', `<p>${info.fact}${info.factSrc ? gfn(info.factSrc) : ''}</p>`) : '',
        info && info.name ? dcard('tag', 'The name', `<p>${info.name}${info.src ? gfn(info.src) : ''}</p>`) : '',
        (() => { const h = trailsHtml(g, TRAILS[g.id] ? g.id : wire.shortSlug(g.name)); return h ? dcard('route', 'Hike and bike', h) : ''; })(),      // made once: it adds its sources to the list

        cbYears().length ? dcard('scene', 'Copernicus Browser', `<p>These are the satellite scenes on the map${fn('s2')}. Open one in the Copernicus Browser, the free viewer of the Copernicus Data Space Ecosystem, to zoom in, try other band combinations or look at neighbouring dates.</p><div class="cb-links">${cbButtonsHtml()}</div>`) : ''
      ].join('')}
    </div>

    <div class="tab-panel" data-panel="figures" ${storyTab === 'figures' ? '' : 'hidden'}>
      ${statsHtml}
      <div id="gSpeed"></div>
      <div id="gWater"></div>
    </div>

    <div class="tab-panel" data-panel="swiss" ${storyTab === 'swiss' ? '' : 'hidden'}>
      ${scard('sw-share', 'flag', `${g.name} in perspective`, shareBody(g), '<span class="sum-v" id="shSum"></span>')}
      ${scard('sw-left', 'area', 'How much ice is left?', cumulativeChart(lo, hi), `<span class="sum-v">${Math.round(iceShareLeft() * 100)} %<small>left</small></span>`)}
      ${scard('sw-water', 'drop', 'How much water is that?', waterSection(lo, hi), (() => { const last = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, to = Math.min(hi || 0, last); return lo && hi && to >= lo ? sumValue(fmtN(iceVolume(to) * 0.9 * 1e12, 1) + ' L') : ''; })())}
    </div>

${aboutFrame(aboutChaptersCh())}`;
  document.querySelectorAll('#story .tabs button').forEach(bt => bt.onclick = () => {
    storyTab = bt.dataset.tab;
    document.querySelectorAll('#story .tabs button').forEach(x => x.setAttribute('aria-selected', x === bt));
    document.querySelectorAll('#story .tab-panel').forEach(pn => pn.hidden = pn.dataset.panel !== storyTab);
    if (storyTab === 'swiss') { wireWater(); }
  });
  wireWater();
  renderGlacierWater(); renderGlacierSpeed(lo, hi); renderShare();
  restoringCards = true;
  storyEl.querySelectorAll('details.coll').forEach(d => { if (openCards.includes(cardKey(d))) d.open = true; else if (sameGlacier && d.open) d.open = false; });
  setTimeout(() => { restoringCards = false; }, 100);
  if (aboutOpen) { const ab = storyEl.querySelector('details.about') || document.querySelector('details.about'); if (ab) ab.open = true; }      // a year click must not close it or move the panel
  storyEl.scrollTop = sameGlacier ? keepScroll : 0;      // another glacier starts at the top
}

/* ---------- Copernicus Browser deep link ---------- */
export function cbYears(){
  const ys = state.mode !== 'compare'
    ? [tlLayers[state.frame] ? tlLayers[state.frame].yr : state.to]
    : [state.a, state.b];
  return [...new Set(ys.filter(y => y && state.available[y]))].sort();
}
export function copernicusBrowserUrl(year){
  const c = map.getCenter(), z = Math.round(map.getZoom()), d = state.available[year].date;
  const q = new URLSearchParams({
    zoom: z, lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), themeId: 'DEFAULT-THEME',
    datasetId: 'S2_L2A_CDAS', layerId: '1_TRUE_COLOR',
    fromTime: `${d}T00:00:00.000Z`, toTime: `${d}T23:59:59.999Z`
  });
  return 'https://browser.dataspace.copernicus.eu/?' + q.toString();
}
/* the buttons of the Copernicus Browser card: one per scene on show */
export function cbButtonsHtml(){ return cbYears().map(y => `<button type="button" class="cb" data-year="${y}">Open ${fmtDate(state.available[y].date)} in Copernicus Browser</button>`).join(''); }
/* About closes when another tab or card of the right panel is clicked (a click inside About itself, or on a source number that opens it, leaves it open) */
document.getElementById('story').addEventListener('click', e => {
  const about = document.querySelector('details.about'); if (!about || !about.open) return;
  if (e.target.closest('details.about') || e.target.closest('a[data-fn]')) return;
  if (e.target.closest('.tabs button, details.dcard > summary, .blist li.go')) about.open = false;
});
document.getElementById('story').addEventListener('click', e => {
  const b = e.target.closest('.cb');
  if (b) window.open(copernicusBrowserUrl(+b.dataset.year), '_blank', 'noopener');
});

/* ---------- 8 key figures, the same for every glacier ---------- */
export const ICONS = {
  area:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l6-3 9 3 1 9-7 4-9-4z"/></svg>',
  length: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M3 8v8M21 8v8M8 12v-2.5M12 12v-3.5M16 12v-2.5"/></svg>',
  change: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l7 7 4-4 7 8M21 11v6h-6"/></svg>',
  past:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg>',
  now:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19a9 9 0 0 1 0-14M19 5a9 9 0 0 1 0 14M8.5 15.5a4 4 0 0 1 0-7M15.5 8.5a4 4 0 0 1 0 7"/><circle cx="12" cy="12" r="1.5"/></svg>',
  speed:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18a8.5 8.5 0 1 1 16 0M12 18l4-6"/><circle cx="12" cy="18" r="1.4"/></svg>',
  down:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M5 13l7 7 7-7"/></svg>'
};
/* Eight figures for every glacier, all from one source: GLAMOS.
   Area           about 1850 | latest inventory | change since 1850   (Swiss Glacier Inventories)
   Length change  first measurement | total since then | change inside the chosen years   (GLAMOS length-change series)
   Nothing is filled in from other sources: a value GLAMOS does not have is shown as a dash. */
ICONS.drop = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-3.2 4.4-5.6 7.7-5.6 10.6a5.6 5.6 0 0 0 11.2 0C17.6 10.7 15.2 7.4 12 3z"/></svg>';
ICONS.volume = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5"/></svg>';
ICONS.eye   = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
ICONS.news  = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>';
ICONS.bulb  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>';
ICONS.tag   = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>';
ICONS.route = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/></svg>';
ICONS.scene = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>';
ICONS.flag = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
ICONS.sum  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5H6l6 7-6 7h12"/></svg>';
ICONS.cal  = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
/* ---------- Sources: one numbered list (About, chapter Sources); the text carries small numbers that jump to the entry ---------- */
export const lnk = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t || u}</a>`;
export const SOURCES = {
  sgi:    () => `GLAMOS: Swiss Glacier Inventory, editions SGI1850, SGI1973, SGI2016 and SGI2023 (areas, outlines, ranking by area). CC BY 4.0. ${lnk('https://www.glamos.ch', 'glamos.ch')}${DATA ? `. Downloaded for this site on ${DATA.generated}` : ''}.`,
  lc:     () => `GLAMOS: Glacier length change, release 2025. ${lnk('https://doi.org/10.18750/lengthchange.2025.r2025', 'doi:10.18750/lengthchange.2025.r2025')}. Non-commercial use. Rows of the file that overlap in time are counted once (computed): a shorter row counts only for the days that no longer row covers, its change scaled by that share. Length today: GLAMOS, ${lnk('https://doi.glamos.ch/figures/lc_stat_frequency.pdf', 'figure lc_stat_frequency')}.`,
  vc:     () => `GLAMOS: Glacier volume change (comparison of aerial elevation models), release 2025. ${lnk('https://doi.org/10.18750/volumechange.2025.r2025', 'doi:10.18750/volumechange.2025.r2025')}. Non-commercial use. The period of each survey is its own (for example 2015–2023) and is not the period of the image series.`,
  itslive: () => `ITS_LIVE: annual mosaics of image pair velocities, version 2.1 (120 m, one mosaic per RGI region, 2013 to 2024), NASA MEaSUREs ITS_LIVE project, Gardner et al. ${lnk('https://its-live.jpl.nasa.gov', 'its-live.jpl.nasa.gov')}. CC BY 4.0. Surface speed of the ice, copied from the product; the maps are made from image pairs of Landsat 8/9, Sentinel-2 and Sentinel-1.`,
  swiss:  () => `GLAMOS: Swiss-wide glacier volume and mass balance, release 2025. ${lnk('https://doi.org/10.18750/massbalance.swisswide.2025.r2025', 'doi:10.18750/massbalance.swisswide.2025.r2025')}. Non-commercial use. Years after the last release: GLAMOS and SCNAT annual reports.`,
  mb:     () => `GLAMOS: Glaciological mass balance of single glaciers (Aletsch, Rhone, Corbassière, Findel), release 2025. ${lnk('https://doi.org/10.18750/massbalance.2025.r2025', 'doi:10.18750/massbalance.2025.r2025')}. Non-commercial use.`,
  radar:  () => `GLAMOS: Glacier ice thickness from ground-penetrating radar, release 2020. ${lnk('https://doi.org/10.18750/icethickness.2020.r2020', 'doi:10.18750/icethickness.2020.r2020')}. CC BY 4.0. Measured between 1958 and 2017, depending on the glacier.`,
  bedrock:() => `swissBEDROCK © ${lnk('https://www.swisstopo.admin.ch/en/3d-swissbedrock-en', 'Federal Office of Topography swisstopo')} (free geodata, terms of use: ${lnk('https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices', 'swisstopo OGD')}), release 1, August 2025. The bed under the ice in the 3D thickness cross-section. Under glaciers it is swissALTI3D 10 m minus a modelled ice thickness (GLAMOS 2020): "a maximum estimate of the bedrock surface" according to the release notes, a model and not a measurement.`,
  yearly: () => `Yearly ice surfaces of the ten Swiss glaciers of this site (3D view, 2016 to 2026): swissALTI3D (2019, 2024 and 2025 editions), swissSURFACE3D raster and the Spezialbefliegungen flight DSMs, © ${lnk('https://www.swisstopo.admin.ch', 'Federal Office of Topography swisstopo')} (open government data, source reference mandatory; terms read on 2026-11-06); Grab et al. 2021 ice thickness (CC BY 4.0, doi:10.3929/ethz-b-000434697); MeteoSwiss daily temperature; GLAMOS mass balance per elevation band (release 2025, ${lnk('https://doi.org/10.18750/massbalance.2025.r2025', 'doi:10.18750/massbalance.2025.r2025')}, non-commercial use); ICESat-2 ATL06 laser heights, for checking only. A model, not a measurement, except on the days and cells a survey covers (which years are measured for each glacier is listed under it above and in its field notes). The full account: ${lnk('provenance.html?id=B36-26', 'Aletsch')}, ${lnk('provenance.html?id=B56-07', 'Gornergletscher')}, ${lnk('provenance.html?id=B40-07', 'Fieschergletscher')}, ${lnk('provenance.html?id=B43-03', 'Rhonegletscher')}, ${lnk('provenance.html?id=A54g-11', 'Unteraargletscher')}, ${lnk('provenance.html?id=B83-03', 'Corbassière')}, ${lnk('provenance.html?id=B57-05', 'Zmuttgletscher')}, ${lnk('provenance.html?id=B56-03', 'Findelgletscher')}, ${lnk('provenance.html?id=B53-04', 'Feegletscher')}, ${lnk('provenance.html?id=A54e-24', 'Triftgletscher')}.`,
  sr:     () => `Super-resolved picture (optional 3D layer, the ten Swiss glaciers of this site): SEN2SR (tacofoundation, model card licence cc0-1.0) applied to Sentinel-2 scenes (contains modified Copernicus Sentinel data). The extra detail is the model's estimate.`,
  grab:   () => `Grab, M. et al. (2021), ${lnk('https://www.cambridge.org/core/journals/journal-of-glaciology/article/ice-thickness-distribution-of-all-swiss-glaciers-based-on-extended-groundpenetrating-radar-data-and-glaciological-modeling/CB6685222A664FD3FCE1367E2B5245D8', 'Ice thickness distribution of all Swiss glaciers based on extended ground-penetrating radar data and glaciological modeling')}, Journal of Glaciology 67(266). Modelled ice thickness and ice volume of Swiss glaciers around 2016, read from the ice thickness layer of ${lnk('https://map.geo.admin.ch', 'swisstopo')}. The thickest ice of each glacier (number, year of the map and place) is read from the data collection ${lnk('https://doi.org/10.3929/ethz-b-000434697', 'SwissGlacierThickness-R2020')}, ETH Research Collection, doi:10.3929/ethz-b-000434697, CC BY 4.0. A model result, not a measurement.`,
  landsat:() => `Landsat 5 and 7, Collection 2 Level-2 surface reflectance (30 m), courtesy of the ${lnk('https://www.usgs.gov/landsat-missions', 'U.S. Geological Survey')} (public domain), read through the ${lnk('https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2', 'Microsoft Planetary Computer')}. One scene per year before 2016, chosen by the Sentinel-2 rules of the region (clear, closest to its target day: the end of the melt season); natural colour and the two false colour styles, made from the red, green, blue, near infrared and two shortwave infrared bands; stripes of no data in Landsat 7 are filled along the ice flow (own processing).`,
  s2:     () => `Copernicus Sentinel-2, Level-1C (pictures) and Level-2A (scene choice), contains modified Copernicus Sentinel data, via the ${lnk('https://dataspace.copernicus.eu', 'Copernicus Data Space Ecosystem')}. Product ids, tiles, times and sun elevation in the image metadata: its ${lnk('https://stac.dataspace.copernicus.eu/v1', 'STAC catalogue')}.`,
  terrain:() => `swissALTI3D © ${lnk('https://www.swisstopo.admin.ch', 'swisstopo')} (open government data), served as terrain tiles by ${lnk('https://mapterhorn.com/attribution', 'Mapterhorn')}. Peak names: swissNAMES3D © swisstopo.`,
  routes: () => `SchweizMobil route data of the Federal Roads Office (ASTRA), via ${lnk('https://map.geo.admin.ch', 'swisstopo geo.admin.ch')}; hiking trails: swissTLM3D © swisstopo.`,
  photos: () => `Historic photographs in the 3D view (eight glaciers: Aletsch, Gorner, Fiescher, Unteraar, Zmutt, Rhone, Findel, Fee): ETH Library, Bildarchiv (${lnk('https://ba.e-pics.ethz.ch', 'e-pics')}), CC BY-SA 4.0 (each photo shows its own licence), the place and angles of the camera by volunteers on ${lnk('https://smapshot.heig-vd.ch', 'Smapshot')} (HEIG-VD).`,
  streetview: () => `Street View panoramas (${REGION.streetviewIn || REGION.name}, map layer "Panoramas"): © ${lnk('https://www.google.com/maps', 'Google')}, shown in Google's own viewer (Maps Embed API), photographed by the contributor named in each panel. Nothing of them is stored here but the panorama ids. Google's ${lnk('https://policies.google.com/terms', 'terms')} and ${lnk('https://policies.google.com/privacy', 'privacy policy')} apply when a panorama is opened.`,
  names:  () => `Glacier names on the map (layer "Other glacier names"): Wikidata and the Randolph Glacier Inventory.`,
  bg:     () => `Background maps: Sentinel-2 cloudless ${BG_YEAR} by EOX (CC BY-NC-SA 4.0); map and place labels © OpenStreetMap contributors, labels rendered by EOX${FEATURES.swisstopo ? '; colour topographic map and swissALTI3D hillshade © swisstopo' : ''}.`,
  /* Iceland (Vatnajökull): the sources of the right panel and the 3D view; the keys start with is_ */
  is_rgi:    () => `Randolph Glacier Inventory 6.0 (RGI Consortium 2017), region 06 Iceland, via GLIMS: the drainage basin of the outlet, its length and heights, outlines from about 2000. ${lnk('https://doi.org/10.7265/N5-RGI-60', 'doi:10.7265/N5-RGI-60')}. Terms to be checked for anything beyond non-commercial use.`,
  is_imo:    () => `Icelandic Met Office (Veðurstofa Íslands): glacier outlines of Iceland, about 1890 (the Little Ice Age maximum) and 17 September 2025 (Sentinel-2), CC BY 4.0. Hannesdóttir, H. et al. (2020), A national glacier inventory and variations in glacier extent in Iceland from the Little Ice Age maximum to 2019, ${lnk('https://www.vedur.is/gogn/joklar/J70-1-34-minniupplausn.pdf', 'Jökull 70, 1–34')}. Data: ${lnk('https://islenskirjoklar.is', 'islenskirjoklar.is')} and the WFS of the Icelandic Met Office. The 2025 area is the ice inside the RGI basin, counted on a 100 m grid here.`,
  is_gudm:   () => `Guðmundsson, S., Björnsson, H. and Pálsson, F. (2017), Changes of Breiðamerkurjökull glacier, SE-Iceland, from its late nineteenth century maximum to the present, Geografiska Annaler: Series A 99(4), 338–352, ${lnk('https://doi.org/10.1080/04353676.2017.1355216', 'doi:10.1080/04353676.2017.1355216')}: retreat, exposed land, mass loss and mass balance since about 1890.`,
  is_arctic: () => `ArcticDEM strips (2 m), © Polar Geospatial Center, University of Minnesota, CC BY 4.0, made from Maxar WorldView stereo images; found through the ${lnk('https://stac.pgc.umn.edu/api/v1', 'PGC STAC catalogue')}, ${lnk('https://www.pgc.umn.edu/data/arcticdem/', 'pgc.umn.edu/data/arcticdem')}. Used for the 3D view: the surface of each year (the dated strips are listed in About, The 3D view).`,
  is_dem:    () => `ÍslandsDEM v1.0 (10 m, composite of ArcticDEM and lidar), © Náttúrufræðistofnun Íslands and Landmælingar Íslands, CC BY 4.0: the ground the strips are fitted to. ${lnk('https://ftp.natt.is/gisdata/raster/', 'ftp.natt.is')}, catalogue ${lnk('https://gatt.lmi.is', 'gatt.lmi.is')}.`,
  is_osm:    () => `OpenStreetMap contributors (ODbL): footpaths and tracks, peak and place names, via the ${lnk('https://overpass-api.de', 'Overpass API')}. ${lnk('https://www.openstreetmap.org/copyright', 'openstreetmap.org/copyright')}.`,
  is_wiki:   () => `Wikipedia, ${lnk('https://en.wikipedia.org/wiki/Brei%C3%B0amerkurj%C3%B6kull', 'Breiðamerkurjökull')} and ${lnk('https://en.wikipedia.org/wiki/J%C3%B6kuls%C3%A1rl%C3%B3n', 'Jökulsárlón')} (CC BY-SA 4.0): the name, the lagoon, the history and the news item, with the sources named there (Iceland on the web, Guðmundsson et al., BBC, Vísir, RÚV).`,
  /* Norway and Svalbard, and the terrain of the regions that have no terrain file of their own */
  no_nve:    () => `NVE, the Norwegian Water Resources and Energy Directorate: glacier inventory of mainland Norway 2018–2019 (outlines made from Sentinel-2 images, areas, lengths and heights of the glacier units; a glacier is the units that hang together). Andreassen, L. M. (2022), Breer og fonner i Norge, NVE Rapport 3-2022; Andreassen, L. M. et al. (2022), An inventory of Norway's glaciers and ice-marginal lakes from 2018–19 Sentinel-2 data, Journal of Glaciology 68(272), 1085–1106, ${lnk('https://doi.org/10.1017/jog.2022.20', 'doi:10.1017/jog.2022.20')}. Data: the map service Bre of NVE (${lnk('https://www.nve.no/hydrology/glaciers/', 'nve.no/hydrology/glaciers')}); NVE asks to cite these two publications. Terms to be checked for anything beyond non-commercial use. The area of Norway, 2,328 km², and the list of the ten largest glaciers are from NVE's glacier page.`,
  no_old:    () => `NVE, glacier inventory of 1947–1985 (outlines from topographic maps and aerial photographs; the year of the outline differs by glacier), the layer Breflate_Historisk of the same map service. Used for the older outline and area.`,
  sj_npi:    () => `Norwegian Polar Institute: glacier outlines of Svalbard, 1936–1972 (aerial photographs, mainly 1936, 1966 and 1971), 1990, 2001–2010 (SPOT-5, Landsat and ASTER images) and 2020 (Sentinel-2 mosaic): one polygon per glacier unit with the same ident in every epoch, the map service Isbreer – overflatetyper og utstrekning of ${lnk('https://geodata.npolar.no', 'geodata.npolar.no')}. Length and heights are of the 2001–2010 outlines. Terms to be checked for anything beyond non-commercial use.`,
  mapterhorn:() => `Terrain tiles by ${lnk('https://mapterhorn.com/attribution', 'Mapterhorn')}, made from open elevation data: ÍslandsDEM v1.0 (10 m; Náttúrufræðistofnun Íslands, CC BY 4.0) over Iceland, the terrain models (DTM, 1 m) of Kartverket (CC BY 4.0) over Norway, and the S0 terrain model of Svalbard (20 m; Norwegian Polar Institute, CC BY 4.0) over Svalbard. The elevation model is older than the pictures.`,
  water:  () => `Swiss water supply of 931 million m³ in 2022: SVGW (Swiss Gas and Water Industry Association). Other comparisons: Eiffel Tower 330 m with antennas (${lnk('https://www.toureiffel.paris', 'toureiffel.paris')}), football pitch 105 × 68 m, city bus about 12 m, Olympic pool 50 × 25 × 2 m, Lake Zurich 3.9 km³.`,
  me:     () => `This project: code under the MIT licence, own texts under CC BY 4.0, open on ${lnk('https://github.com/braakhekke/tonguesfromspace', 'GitHub')}.`
};
export const SOURCE_LIST = REGION.rgi ? REGION.sources : Object.keys(SOURCES).filter(k => !/^(is|no|sj)_/.test(k));      // the sources of the region, in the order of the list in About
/* a small raised number in the text; the click opens the Sources block and shows the entry (a back-link returns to the text) */
export let fnSeq = 0;
/* Sources that belong to one glacier (the fact, the name, the hikes) are numbered after the general ones and listed with them in About; the list is made again with every redraw of the panel */
export let dynSources = [];
export const TRAIL_LAYERS = { wander: 'Wanderland', velo: 'Veloland', mtb: 'Mountainbikeland' };
export function trailMaps(g, kind){       // the SchweizMobil map around the tongue, with the route layer on
  const at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue; if (!at) return '';
  const [E, N] = lv95(at[1], at[0]);
  return `<span class="tr-maps"><a href="https://map.schweizmobil.ch/?lang=en&amp;E=${E}&amp;N=${N}&amp;resolution=25&amp;layers=${TRAIL_LAYERS[kind]}" target="_blank" rel="noopener">SchweizMobil map</a></span>`;
}
export function trailsHtml(g, key){
  const t = TRAILS[key]; if (!t) return '';
  const row = (label, r, kindFallback) => r
    ? `<div class="tr-row"><b>${label}</b> ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.title}</a>` : r.title}${typeof gfn === 'function' ? (r.url ? gfn(`${label} route: <a href="${r.url}" target="_blank" rel="noopener">${new URL(r.url).hostname.replace(/^www\./, '')}</a> (${r.title}); route data of SchweizMobil / swisstopo`) : fn('routes')) : ''}<span class="tr-t">${r.text.replace(/(Passes [\d.]+ km from the tongue)/, '$1 (distance computed here)')}</span>${trailMaps(g, r.kind)}</div>`
    : `<div class="tr-row"><b>${label}</b><span class="tr-t">No marked bike route within about 3 km of the tongue.</span>${trailMaps(g, kindFallback)}</div>`;
  return `${row('Hike', t.hike, 'wander')}${row('Bike', t.bike, 'velo')}`;
}
export const gfn = html => { dynSources.push(html); const n = SOURCE_LIST.length + dynSources.length; return `<sup class="fn"><a href="#fn-g${dynSources.length}" id="fnr-g${dynSources.length}-${++fnSeq}" data-fn="g${dynSources.length}" aria-label="Source ${n}">${n}</a></sup>`; };
export const fn = k => `<sup class="fn"><a href="#fn-${k}" id="fnr-${k}-${++fnSeq}" data-fn="${k}" aria-label="Source ${SOURCE_LIST.indexOf(k) + 1}">${SOURCE_LIST.indexOf(k) + 1}</a></sup>`;
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[data-fn]'); if (!a) return;
  e.preventDefault();
  const box = document.getElementById('sources'), li = document.getElementById('fn-' + a.dataset.fn);
  if (!box || !li) return;
  box.open = true;
  document.querySelectorAll('#story .src-list li.hit').forEach(x => x.classList.remove('hit'));
  li.classList.add('hit'); li.dataset.back = a.id;
  li.scrollIntoView({block: 'center', behavior: 'smooth'});
});
document.addEventListener('click', e => {
  const li = e.target.closest && e.target.closest('.src-list li[data-back]'); if (!li || e.target.closest('a')) return;
  const back = document.getElementById(li.dataset.back); if (back) back.scrollIntoView({block: 'center', behavior: 'smooth'});
});
export const ok = v => v != null && !isNaN(v);
export const fmtM = m => ok(m) ? `${m < 0 ? '−' : m > 0 ? '+' : ''}${Math.abs(m).toLocaleString('en').replace(/,/g, '\u202f')} m` : null;
export function stats(g, lo, hi){
  const inv = g.inv;
  const a1850 = inv ? (inv.oldest && inv.oldest.area_km2) : g.a1850;
  const aRef = rankArea(g), refY = inv ? (inv.year || rankLabel()) : 2016;
  const L = inv && inv.length;
  const km2 = v => ok(v) ? `${v.toFixed(1)} km²` : null;
  const lcHint = inv ? 'not measured by GLAMOS' : 'glacier data not loaded yet';
  // length at the first survey = length today minus the recorded changes; exact only when the surveys follow each other without gaps
  const cur = CURRENT_LENGTH[norm(g.name)], nowKm = cur && cur.km, nowYear = cur && cur.year, firstKm = L && nowKm != null ? nowKm - L.total_m / 1000 : null;
  const ordered = L && L.series ? L.series.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]) : [];
  const clean = ordered.length > 0 && ordered.every((r, i) => i === 0 || r[0] === ordered[i - 1][1]);
  const late = L && nowYear ? nowYear - L.last_year : 0;           // years between the length in the figure and the last survey in the series
  const exact = clean && late < 2;
  // change in the chosen range: the surveys that lie completely inside it (start year >= from, end year <= to)
  let range = null, rangeHint = lcHint, cover = '';
  if (L && L.series) {
    if (!(lo && hi)) rangeHint = 'pick a year';
    else {
      const inside = L.series.filter(r => r[0] >= lo - 1 && r[1] <= hi);      // a yearly value is named after the year it ends in: 2017 = autumn 2016 to autumn 2017
      if (!inside.length) rangeHint = 'no survey lies inside this range';
      else {
        range = inside.reduce((t, r) => t + r[2], 0);
        const c0 = inside[0][0], c1 = inside[inside.length - 1][1];
        if (c0 !== lo - 1 || c1 !== hi) cover = `Surveys cover ${c0 + 1}–${c1}`;
      }
    }
  } else if (L) rangeHint = 'glacier data needs a rebuild';
  // ice volume: the newest GLAMOS volume survey of this glacier (comparison of two elevation models) and the radar thickness measurements
  const V = inv && inv.volume, T = thickestSpot(g), volHint = inv ? 'no volume survey by GLAMOS' : 'glacier data not loaded yet';
  const per = V ? `${V.from}–${V.to}` : '';
  const m1 = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}`;
  // everything since the first elevation model of this glacier: the longest survey that ends with the newest one
  const okS = V && V.series ? V.series.filter(r => r[6] >= 90 && r[1] > r[0]) : [], endS = okS.length ? Math.max(...okS.map(r => r[1])) : 0;
  const all = okS.filter(r => r[1] === endS).sort((a, b) => a[0] - b[0])[0];
  const lostArea = ok(a1850) && ok(aRef) && a1850 > aRef ? a1850 - aRef : null;
  /* With two different years chosen the three tiles of the volume card follow them: the yearly mass balance of the years that end inside the selection (the same bars as the chart; this glacier's own series, else the Swiss one), as metres of ice (balance / 0.85) and, calibrated on the volume survey, as km³. Otherwise they show the survey period. */
  const ownB = inv && inv.balance && inv.balance.length ? inv.balance : null, annB = ownB || (DATA && DATA.swiss_balance) || [], MB = V ? balanceModel(g) : null;
  const selRows = lo && hi ? annB.filter(r => r[0] >= Math.max(lo, FIRST_YEAR) && r[0] <= hi) : [];
  const selOn = selRows.length > 0, selPer = selOn ? `${selRows[0][0] === selRows[selRows.length - 1][0] ? selRows[0][0] : `${selRows[0][0]}–${selRows[selRows.length - 1][0]}`} · from the yearly mass balance` : '';
  const selDhRaw = selRows.reduce((t, r) => t + r[1] / 1000 / 0.85, 0), selBal = selOn ? selRows.reduce((t, r) => t + r[1] / 1000, 0) / selRows.length : 0;
  const selDv = selOn && MB ? selRows.reduce((t, r) => { const b = MB.bal(r[0]); return b === undefined ? t : t + MB.c * b; }, 0) : null;
  /* The thickness tile is the volume tile over the mean area of the survey (V.dV_km3 / V.dh_m), so the two always fit; without a volume survey it is the plain balance / 0.85. */
  const selDh = selDv !== null && V.dh_m && V.dV_km3 ? selDv * V.dh_m / V.dV_km3 : selDhRaw;
  const cubeV = selOn && selDv !== null ? selDv : V ? V.dV_km3 : null, cubeKm3 = cubeV < 0 ? -cubeV : null;      // the lost volume drawn as a cube (computed here)
  const sgn = (v, d) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(d)}`;
  /* Every card starts with one hero tile: the big red number that is also shown when the card is closed. */
  return {
    volume: [
      ...(all ? [{hero:true, ico:'down', k:`Ice thickness lost since ${all[0]}`, fn:'vc', loss:true, wide:true, v:`${all[3] < 0 ? '−' : '+'}${Math.abs(all[3]).toFixed(1)} m`,
        sym:{kind:'tower', frac: Math.abs(all[3]) / EIFFEL_M, big:'', small:`${Math.round(Math.abs(all[3]) / EIFFEL_M * 100)} % of the height of the Eiffel Tower`}}] : []),
      {ico:'down', k:'Thickness', kk:'Thickness change', per: selOn ? selPer : per, fn:'vc', loss:true, v: selOn ? `${m1(selDh)} m` : V ? `${m1(V.dh_m)} m` : null, hint:volHint},
      {ico:'sum',  k:'Volume', kk:'Volume change', per: selOn && selDv !== null ? selPer : per, fn:'vc', loss:true, v: selOn && selDv !== null ? `${sgn(selDv, Math.abs(selDv) < 0.1 ? 3 : 2)} km³` : V ? `${V.dV_km3 < 0 ? '−' : '+'}${Math.abs(V.dV_km3).toFixed(Math.abs(V.dV_km3) < 0.1 ? 3 : 2)} km³` : null, hint:volHint},
      {ico:'drop', k:'Balance', kk:'Mass balance per year', per: selOn ? selPer : per, fn:'vc', loss:true, v: selOn ? `${sgn(selBal, 2)} m w.e.` : V ? `${V.bal_mwe_a < 0 ? '−' : '+'}${Math.abs(V.bal_mwe_a).toFixed(2)} m w.e.` : null, sub: !selOn && V ? `± ${V.sigma.toFixed(2)}` : '', hint:volHint},
      ...(cubeKm3 ? [{cube:true, vol:cubeKm3, per: selOn && selDv !== null ? selPer : per}] : []),
      {ico:'flag', k:'Thickest ice', per: T ? `${T.kind === 'model' ? 'Model result' : 'Radar measurement'} ${T.year || ''}`.trim() + (T.kind === 'model' && T.plus != null ? `, uncertainty +${Math.round(T.plus)} / −${Math.round(-T.minus)} m` : '') : '', fn: T ? (T.kind === 'model' ? 'grab' : 'radar') : '', v: T ? `${Math.round(T.m)} m` : null, hint:'no thickness data for this glacier', slot:'thick', wide:true, act: T ? 'radar-max' : '', actText: T ? 'thickest ice' : ''}
    ],
    area: [
      ...(lostArea ? [{hero:true, ico:'down', k:`${((aRef - a1850) / a1850 * 100).toFixed(0).replace('-', '−')} % since 1850`, fn:'sgi', loss:true, wide:true, v:`−${(a1850 - aRef).toFixed(2)} km²`,
        sub:`${((aRef - a1850) / a1850 * 100).toFixed(0).replace('-', '−')} %`, sym:{kind:'pitch', big:`× ${fmtCount(lostArea * 1e6 / PITCH_M2)}`, small:'football pitches'}}]
        : [{hero:true, ico:'down', k:'Area change since 1850', loss:true, wide:true, v:null, hint:'glacier data not loaded yet'}]),
    ],
    length: [
      ...(L ? [{hero:true, ico:'sum', k:`Length lost since ${L.first_year}`, fn:'lc', loss:true, wide:true, v: fmtM(L.total_m),
        sym: L.total_m < 0 ? {kind:'bus', big:`× ${fmtCount(-L.total_m / BUS_M)}`, small:'city buses, end to end'} : null}]
        : [{hero:true, ico:'sum', k:'Length change', loss:true, wide:true, v:null, hint:lcHint}]),
      ...(nowKm != null && firstKm != null ? [
        {ico:'flag', k:`Length in ${L.first_year}`, tip: exact ? 'Derived from the GLAMOS length changes' : 'Approximate: derived from the GLAMOS length changes', v:`${exact ? '' : '≈ '}${firstKm.toFixed(1)} km`, hint:lcHint},
        {ico:'now',  k:`Length in ${nowYear}`, tip:'Latest length, read from a GLAMOS overview figure', v:`${nowKm.toFixed(2)} km`, hint:lcHint}
      ] : []),
      {ico:'now',  k: lo && hi ? (hi > lo ? `Change ${lo}–${hi}` : `Change ${lo}`) : 'Change in your selection', tip:'GLAMOS length change', loss:true, wide:true,
       v: range !== null ? fmtM(Math.round(range)) : null, hint:rangeHint, cover}
    ]
  };
}
/* Mean ice thickness change per year of one glacier, from the GLAMOS volume surveys (volume.series: [from, to, dV, dh, balance, sigma, covered %]).
   One bar per survey period, as wide as the period. Surveys overlap (the same glacier is compared from several older surveys), so the chain starts at the
   newest survey and goes back, each time taking the shortest survey that ends where the previous one starts. Gaps end the chain. */
export function thinningChain(g){
  const V = g.inv && g.inv.volume, all = V && V.series ? V.series.filter(r => r[6] >= 90 && r[1] > r[0]) : [];
  if (!all.length) return [];
  const chain = [];
  let end = Math.max(...all.map(r => r[1]));
  for (;;) {
    const c = all.filter(r => r[1] === end);
    if (!c.length) break;
    const r = c.reduce((a, b) => b[0] > a[0] ? b : a);
    chain.unshift(r); end = r[0];
  }
  return chain.map(r => ({from: r[0], to: r[1], dh: r[3], rate: r[3] / (r[1] - r[0]), bal: r[4], sigma: r[5]}));
}
export const fmtRate = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}`;
/* The chart covers the years of the images, FIRST_YEAR to the last year with data. Every year is one slot, centred on its number: the bar of 2019 is the
   hydrological year Oct 2018 - Sep 2019, which ends in the autumn of the 2019 image. The elevation-model surveys (the tiles above the chart) are not drawn here: a survey spans many years and its mean says nothing about single years.
   The years you select in step 2 are marked, and the line below the chart gives their yearly mean (from the yearly values, not from the survey periods). */
/* Bars as in "Retreat per year": one bar per year, loss red, gain blue, a readout in the corner of the title on hover. items: [{lab, v, t}] */
export const r_in = (y, lo, hi) => y >= Math.min(lo, hi) && y <= Math.max(lo, hi);      // is the year inside the selected years (both ends count)
export function barChart(title, unit, items, aria, extra = ''){
  const W = 300, H = 120, T = 6, B = 22, mx = Math.max(0, ...items.map(r => r.v ?? 0)), mn = Math.min(0, ...items.map(r => r.v ?? 0)), span = (mx - mn) || 1;
  const Y = v => T + (mx - v) / span * (H - T - B), step = W / items.length, bw = step * 0.62, anySel = items.some(r => r.sel);
  const bars = items.map((r, i) => { const x = i * step + (step - bw) / 2, y0 = Y(0), y1 = Y(r.v ?? 0), dim = anySel && !r.sel, col = r.v < 0 ? 'var(--accent)' : 'var(--crevasse)'; return `<g class="rb${r.sel ? ' sel' : ''}${r.avg ? ' avg' : ''}" data-t="${r.t}"><rect class="hit" x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"/>${r.v == null ? '' : `<rect class="bar-r" x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, Math.abs(y1 - y0)).toFixed(1)}" fill="${col}"${r.avg ? ` stroke="${col}" stroke-dasharray="2 2"` : ''} fill-opacity="${dim ? (r.avg ? '.18' : '.32') : (r.avg ? '.5' : '1')}"/>`}<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle"${r.sel ? ' class="sel"' : ''}>${r.lab}</text>${r.sel ? `<rect x="${x.toFixed(1)}" y="${H - 4}" width="${bw.toFixed(1)}" height="2.5" fill="var(--accent)"/>` : ''}</g>`; }).join('');
  return `<div class="chart-t"><span class="ct">${title}</span></div>${extra}<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}"><line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--rule)"/>${bars}</svg><div class="rb-read" data-def="Hover a bar for its value.">Hover a bar for its value.</div>`;
}
/* Ice thickness change of the years in your selection (all years when no range is chosen), per year or added up since the start of the selection. The yearly values are the mass balance as metres of ice. */
export let thinMode = 'year';
export function thinningChart(g, lo, hi){
  const own = g.inv && g.inv.balance && g.inv.balance.length ? g.inv.balance : null, ann = own || (DATA && DATA.swiss_balance) || [];
  const annLabel = own ? 'this glacier' : 'all Swiss glaciers';
  const last = Math.max(FIRST_YEAR, ...ann.map(r => r[0]));
  const yrs = ann.filter(r => r[0] >= FIRST_YEAR && r[0] <= last).map(([y, mm]) => ({y, mm, ice: mm / 1000 / 0.85, sel: !!(lo && hi && r_in(y, lo, hi))}));
  if (!yrs.length) return '';
  const y2 = y => String(y).slice(2), start = yrs[0].y - 1, selRows = yrs.filter(r => r.sel);
  let run = 0;
  const items = yrs.map(r => { run += r.ice; return thinMode === 'cum'
    ? {lab: y2(r.y), sel: r.sel, v: run, t: `autumn ${start} to autumn ${r.y}: ${fmtRate(run)} m of ice (${fmtRate(r.ice)} in ${r.y - 1}/${y2(r.y)}), ${annLabel}`}
    : {lab: y2(r.y), sel: r.sel, v: r.ice, t: `${r.y} (${r.y - 1}/${y2(r.y)}): ${fmtRate(r.ice)} m of ice (${fmtRate(r.mm / 1000)} m w.e.), ${annLabel}`}; });
  const selTot = selRows.reduce((t, r) => t + r.ice, 0), selLab = selRows.length ? (selRows.length === 1 ? `${selRows[0].y}` : `${selRows[0].y}–${selRows[selRows.length - 1].y}`) : '';
  const mode = `<div class="ch-mode" role="group" aria-label="Chart type"><button type="button" data-mode="year" aria-pressed="${thinMode === 'year'}">Per year</button><button type="button" data-mode="cum" aria-pressed="${thinMode === 'cum'}">Cumulative</button></div>`;
  return `<figure class="cum dh-chart">${barChart('Ice thickness change', 'm of ice', items, `Ice thickness change of ${g.local || g.name}, ${thinMode === 'cum' ? 'added up' : 'per year'}, ${yrs[0].y} to ${yrs[yrs.length - 1].y}: ${items.map(r => `${r.lab} ${r.v.toFixed(2)} m`).join(', ')}`, mode)}
    <figcaption>${selRows.length ? `Selected ${selLab}${selRows.length > 1 ? ` (${selRows.length} years)` : ''}: <b>${fmtRate(selTot)} m</b> of ice. ` : ''}${thinMode === 'cum' ? `The bars add up from autumn ${start}. ` : ''}Values are the mass balance (GLAMOS)${fn('mb')} as metres of ice, balance ÷ 0.85, not scaled (the thickness tile above is scaled to the volume survey); not the same measurement as a height change, but they add up to nearly the same over decades.${own ? '' : ' This glacier is not measured directly, so the line of all Swiss glaciers is shown instead.'}</figcaption>
  </figure>`;
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.ch-mode button[data-mode]'); if (!b || b.dataset.mode === thinMode) return; thinMode = b.dataset.mode; renderStory(); });
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.ch-mode button[data-lmode]'); if (!b || b.dataset.lmode === leftMode) return; leftMode = b.dataset.lmode; renderStory(); });
document.addEventListener('click', e => {          // "Show speed on the map" in the Ice speed card: the layer and its pin on or off, the same switch as in the Layers menu
  if (!e.target.closest || !e.target.closest('[data-act="speed-toggle"]')) return;
  const t = document.getElementById('speedToggle'); t.checked = !t.checked; t.dispatchEvent(new Event('change'));
  if (t.checked) document.getElementById('map').scrollIntoView({block: 'center', behavior: 'smooth'});
});
document.addEventListener('click', e => {          // "Show on map" in the stats: layer on, fly to the thickest ice, open its label
  if (!e.target.closest || !e.target.closest('[data-act="radar-max"]')) return;
  const g = currentGlacier(), T = thickestSpot(g), t = document.getElementById('maxToggle');
  if (!T) return;
  if (t.checked) { t.checked = false; t.dispatchEvent(new Event('change')); return; }      // second click closes it again
  t.checked = true; t.dispatchEvent(new Event('change'));
  document.getElementById('map').scrollIntoView({block:'center', behavior:'smooth'});
  map.flyTo(T.at, Math.max(map.getZoom(), 15), {duration:1.2});
});
/* Symbols that make a loss easy to grasp. Thickness: the Eiffel Tower (330 m) whose top, as many metres as the glacier lost in thickness, is melting away.
   Area: football pitches. Length: city buses end to end. Water: Olympic swimming pools. Sizes: pitch 105 x 68 m, bus 12 m, pool 50 x 25 x 2 m = 2.5 million litres. */
export const TOWER_SHAPE = '<path d="M30 0 C31 55 34 100 41 126 C45 138 52 150 58 160 L46 160 C42 146 36 138 30 138 C24 138 18 146 14 160 L2 160 C8 150 15 138 19 126 C26 100 29 55 30 0 Z"/><rect x="15" y="130.5" width="30" height="3"/><rect x="22" y="101.5" width="16" height="3"/><rect x="26.5" y="24.5" width="7" height="2.5"/>';
export function towerSvg(frac){
  const cut = (160 * Math.max(0.05, Math.min(0.9, frac))).toFixed(1);
  return `<svg class="sym sym-tower" viewBox="-2 -2 84 166" aria-hidden="true"><defs>
    <linearGradient id="melt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8322A" stop-opacity=".08"/><stop offset="1" stop-color="#C8322A" stop-opacity=".55"/></linearGradient>
    <clipPath id="tw-top"><rect x="-4" y="-4" width="100" height="${(+cut + 4).toFixed(1)}"/></clipPath><clipPath id="tw-bot"><rect x="-4" y="${cut}" width="100" height="200"/></clipPath></defs>
    <g fill="#6E818B" clip-path="url(#tw-bot)">${TOWER_SHAPE}</g>
    <g fill="url(#melt)" stroke="#C8322A" stroke-width="1.6" stroke-dasharray="3 2.2" clip-path="url(#tw-top)">${TOWER_SHAPE}</g>
    <path d="M68 .5 H74 V${cut} H68" fill="none" stroke="#C8322A" stroke-width="1.4"/></svg>`;
}
/* The lost volume as a block of ice next to the Eiffel Tower, both at the same scale. Side = cube root of the volume (computed here, not a source figure). */
export function cubeTile(vol, per){
  const side = Math.cbrt(vol) * 1000, px = 84 / Math.max(side * 1.14, EIFFEL_M), c = side * px, dx = c * 0.3, dy = c * 0.14, th = EIFFEL_M * px, tk = th / 160, tw = 60 * tk, gy = 94, tx = 8, cx = tx + tw + 14, L = c * 0.42, W = cx + c + dx + L + 6;
  const sideTxt = side >= 100 ? `${(side / 1000).toFixed(2)} km` : `${Math.round(side)} m`, ratio = side / EIFFEL_M, f = n => n.toFixed(1);
  const x0 = cx, x1 = cx + c, y0 = gy - c, y1 = gy;                    // front face; the top and right face lean back by (dx, dy): a flat oblique view
  const front = `M${f(x0)} ${f(y0)}H${f(x1)}V${f(y1)}H${f(x0)}Z`, top = `M${f(x0)} ${f(y0)}L${f(x0 + dx)} ${f(y0 - dy)}H${f(x1 + dx)}L${f(x1)} ${f(y0)}Z`, right = `M${f(x1)} ${f(y0)}L${f(x1 + dx)} ${f(y0 - dy)}V${f(y1 - dy)}L${f(x1)} ${f(y1)}Z`;
  // light from the upper left: both objects throw a flat shadow to the right on the ground
  const shCube = `M${f(x0 + 3)} ${f(gy)}H${f(x1)}L${f(x1 + dx)} ${f(gy - dy)}H${f(x1 + dx + L)}L${f(x1 + L)} ${f(gy)}Z`;
  const shTower = `M${f(tx + tw * .3)} ${f(gy)}H${f(tx + tw * .7)}L${f(tx + tw * .7 + Math.min(th * .5, cx - tx - tw - 4))} ${f(gy - 1.6)}H${f(tx + tw * .5)}Z`;
  const ice = `<defs><linearGradient id="ic-f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4F3FA"/><stop offset=".55" stop-color="#B9DDEE"/><stop offset="1" stop-color="#8CC1DC"/></linearGradient>
    <linearGradient id="ic-t" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#D6EDF8"/><stop offset="1" stop-color="#F7FCFF"/></linearGradient>
    <linearGradient id="ic-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB4D0"/><stop offset="1" stop-color="#5D96B8"/></linearGradient></defs>
    <rect x="0" y="${f(gy - dy - 2)}" width="${W.toFixed(0)}" height="${f(dy + 6)}" fill="#E4EAED"/>
    <path d="${shTower}" fill="#2B3A42" opacity=".22"/><path d="${shCube}" fill="#2B3A42" opacity=".2"/>
    <g transform="translate(${tx} ${f(gy - th)}) scale(${tk.toFixed(4)})" fill="#6E818B">${TOWER_SHAPE}</g>
    <g stroke="#5D96B8" stroke-width="1" stroke-linejoin="round"><path d="${front}" fill="url(#ic-f)"/><path d="${top}" fill="url(#ic-t)"/><path d="${right}" fill="url(#ic-r)"/></g>
    <g fill="none" stroke="#fff" stroke-linecap="round" opacity=".85"><path d="M${f(x0 + c * .14)} ${f(y0 + c * .62)}L${f(x0 + c * .14)} ${f(y0 + c * .2)}L${f(x0 + c * .5)} ${f(y0 + c * .14)}" stroke-width="2.2"/><path d="M${f(x0 + c * .24)} ${f(y0 + c * .78)}V${f(y0 + c * .72)}" stroke-width="2.2"/></g>
    <g fill="none" stroke="#fff" stroke-width=".8" opacity=".6"><path d="M${f(x0 + c * .55)} ${f(y1)}L${f(x0 + c * .66)} ${f(y0 + c * .62)}L${f(x0 + c * .6)} ${f(y0 + c * .45)}L${f(x0 + c * .8)} ${f(y0 + c * .3)}"/><path d="M${f(x0 + c * .66)} ${f(y0 + c * .62)}L${f(x1)} ${f(y0 + c * .7)}"/></g>
    <g fill="#fff" opacity=".7"><circle cx="${f(x0 + c * .36)}" cy="${f(y0 + c * .52)}" r="1.4"/><circle cx="${f(x0 + c * .42)}" cy="${f(y0 + c * .66)}" r=".9"/><circle cx="${f(x0 + c * .82)}" cy="${f(y0 + c * .82)}" r="1.1"/></g>`;
  return `<div class="stat cube-tile"><span class="k">Lost ice as a cube</span>${per ? `<span class="d per-y">${per}</span>` : ''}
    <svg class="sym-cube" viewBox="0 0 ${W.toFixed(0)} 102" role="img" aria-label="A cube of ${vol.toFixed(2)} cubic kilometres of ice, ${sideTxt} on each side, next to the Eiffel Tower">${ice}</svg>
    <span class="d">${sideTxt} on each side · ${ratio >= 1 ? `${ratio.toFixed(1)} × the height of the Eiffel Tower` : `${Math.round(ratio * 100)} % of the height of the Eiffel Tower`} (computed here from the volume change, Eiffel Tower 330 m)</span></div>`;
}
export const SYM_SVG = {
  pitch: '<svg class="sym sym-pitch" viewBox="0 0 105 68" aria-hidden="true"><rect width="105" height="68" rx="3" fill="#5E9A5B"/><g fill="none" stroke="#fff" stroke-width="1" opacity=".9"><rect x="2.5" y="2.5" width="100" height="63"/><path d="M52.5 2.5v63"/><circle cx="52.5" cy="34" r="9"/><rect x="2.5" y="13.8" width="16.5" height="40.4"/><rect x="86" y="13.8" width="16.5" height="40.4"/><rect x="2.5" y="24.8" width="5.5" height="18.4"/><rect x="97" y="24.8" width="5.5" height="18.4"/></g></svg>',
  bus: '<svg class="sym sym-bus" viewBox="0 0 120 44" aria-hidden="true"><rect x="2" y="4" width="116" height="30" rx="7" fill="#F2C230"/><g fill="#34505E"><rect x="9" y="9" width="14" height="12" rx="2"/><rect x="26" y="9" width="14" height="12" rx="2"/><rect x="43" y="9" width="14" height="12" rx="2"/><rect x="60" y="9" width="14" height="12" rx="2"/><rect x="77" y="9" width="14" height="12" rx="2"/><rect x="96" y="9" width="17" height="14" rx="3"/></g><rect x="2" y="26" width="116" height="3" fill="#C8322A"/><circle cx="28" cy="35" r="7" fill="#2B3A42"/><circle cx="28" cy="35" r="3" fill="#9AA6AC"/><circle cx="92" cy="35" r="7" fill="#2B3A42"/><circle cx="92" cy="35" r="3" fill="#9AA6AC"/></svg>',
  pool: '<svg class="sym sym-pool" viewBox="0 0 100 52" aria-hidden="true"><rect x="1" y="1" width="98" height="50" rx="4" fill="#5FB8D9" stroke="#9AA6AC" stroke-width="2"/><path d="M1 7.25H99M1 13.5H99M1 19.75H99M1 26H99M1 32.25H99M1 38.5H99M1 44.75H99" stroke="#fff" stroke-width="1.2" opacity=".85"/></svg>'
};
/* one line under a figure: the symbol, a big "x N" (or text for the tower) and what it counts */
export const symHtml = (y, note) => `<span class="sym-chip">≈ ${y.big ? y.big.replace(/^×\s*/, '') + ' ' : ''}${y.small}${note ? ' · ' + note : ''}</span>`;      /* a plain text chip instead of the drawings */
export const fmtCount = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n >= 1000 ? (Math.round(n / 10) * 10).toLocaleString('en') : n >= 10 ? String(Math.round(n)) : n.toFixed(1);
/* The four stat cards (Area, Length, Ice thickness and volume, Ice and water) open and close; closed, each shows its headline figure. The choice is remembered. */
export const maxLinkText = () => document.getElementById('maxToggle').checked ? 'Close thickest ice' : 'Show the thickest ice on the map';
/* A card that opens closes the one above (name="..."), which shifts the page up: put the title of the new card back in view */
export let restoringCards = false;
export function keepTitleVisible(d){
  const sum = d.firstElementChild, story = $('story'), scr = story.scrollHeight > story.clientHeight + 2 && getComputedStyle(story).overflowY !== 'visible' ? story : null;
  const fix = () => {
    const top = scr ? scr.getBoundingClientRect().top : 0, r = sum.getBoundingClientRect().top - top - 8;
    if (r < 0) (scr || window).scrollBy({top: r, behavior: 'smooth'});
  };
  requestAnimationFrame(() => requestAnimationFrame(fix));
}
export const cardOpen = k => !!(prefs.cards && prefs.cards[k]);
document.addEventListener('toggle', e => {
  const d = e.target;
  if (restoringCards) return;
  if (d.matches && d.matches('details.coll') && d.open) keepTitleVisible(d);
  if (!d.matches || !d.matches('details.coll[data-card]')) return;
  prefs.cards = {...(prefs.cards || {}), [d.dataset.card]: d.open}; savePrefs();
}, true);
/* The headline figure of a closed chapter: the number big, its unit small (-40 %, -3060 m, -0.15 km³). */
export const sumInner = text => { const m = String(text).match(/^([−+≈\s]*[\d.,\u202f]*\d(?:\s*%)?)\s*(.*)$/); return m ? `${m[1].trim()}${m[2] ? `<small>${m[2]}</small>` : ''}` : ''; };
export const sumValue = (text, cls, id) => { const h = sumInner(text); return h ? `<span class="sum-v ${cls || ''}"${id ? ` id="${id}"` : ''}>${h}</span>` : ''; };
/* Area of the glacier in the three inventories (1850, 1973, newest), as bars against the 1850 area. */
export function areaBars(g){
  const inv = g.inv, a1850 = inv ? (inv.oldest && inv.oldest.area_km2) : g.a1850, a73 = inv && inv.mid && inv.mid.area_km2, aRef = rankArea(g), refY = inv ? (inv.year || rankLabel()) : 2016;
  const rows = [['1850', a1850], ['1973', a73], [String(refY), aRef]].filter(r => ok(r[1]));
  if (rows.length < 2 || !ok(a1850)) return '';
  return `<div class="area">${rows.map((r, i) => `<div><span>${r[0]}</span><i class="a${i}" style="width:${r[1] / a1850 * 100}%"></i><b>${r[1].toFixed(2)} km²</b></div>`).join('')}</div>`;
}
/* Length change of every year up to the chosen years (the GLAMOS series), as bars labelled by the year they end in: the bar of the first year (2015-2016) is what the summer picture of that year shows. Loss red, advance blue. */
export function retreatChart(g, lo, hi){
  const L = g.inv && g.inv.length, ser = L && L.series ? L.series.filter(r => r[1] > r[0] && r[1] >= FIRST_YEAR) : [];
  if (!ser.length) return '';
  const first = FIRST_YEAR, last = Math.max(...ser.map(r => r[1])), items = [];
  for (let y = first; y <= last; y++) {
    const r = ser.find(e => e[0] < y && y <= e[1]), n = r ? r[1] - r[0] : 0, sel = !!(lo && hi && r_in(y, lo, hi));
    items.push(!r ? {lab: String(y).slice(2), sel, v: null, t: `${y}: no length survey`}
      : n === 1 ? {lab: String(y).slice(2), sel, v: r[2], t: `${y} (${r[0]}–${r[1]}): ${fmtM(r[2])}`}
      : {lab: String(y).slice(2), sel, avg: true, v: r[2] / n, t: `${y}: ${fmtM(Math.round(r[2] / n))} on average. GLAMOS measured ${r[0]}–${r[1]} only as a whole, ${fmtM(r[2])} in ${n} years, so the years are drawn evenly (dashed)`});
  }
  if (items.filter(i => i.v != null).length < 2) return '';
  return barChart('Retreat per year', 'm', items, `Length change per year, ${first} to ${last}`) + (items.some(i => i.avg) ? '<p class="chart-note">Dashed bars: GLAMOS measured these years only together, so the change is spread evenly over them.</p>' : '') + (items.some(i => i.v == null) ? '<p class="chart-note">Empty years have no length survey.</p>' : '');
}
/* The size comparison page (size.html): the glacier is passed by its inventory id (the SGI code, glaciers.js `inv.id`). */
export const sizeHref = (g, mode) => '/size.html' + (g && g.inv && g.inv.id ? '#g=' + g.inv.id + (mode ? '&mode=' + mode : '') : (mode ? '#mode=' + mode : ''));      // mode '3d': the page opens on Volume 3D
export function renderStats(g, lo, hi){
  const S = stats(g, lo, hi);
  const group = (key, title) => { return `
    <details class="stat-group dcard coll" name="stats" data-card="${key}"${cardOpen(key) ? ' open' : ''}>
      <summary><h4><span class="ico">${ICONS[key]}</span>${title}</h4>${(() => { const hero = S[key].find(t => t.hero && t.v), vol = key === 'volume' && S.volume.find(t => t.k === 'Volume' && t.v); const sv = key === 'area' ? hero && hero.sub : key === 'volume' ? vol && vol.v : hero && hero.v; return sv ? sumValue(sv, 'loss') : ''; })()}</summary><div class="dbody">
      <div class="stat-row ${key}">${S[key].map(t => t.cube ? cubeTile(t.vol, t.per) : `
        <div class="stat${t.hero ? ' hero' : ''}${t.loss && t.v ? ' loss' : ''}${t.wide ? ' wide' : ''}"${t.slot ? ` data-slot="${t.slot}"` : ''}>
          <span class="v">${t.v ?? '—'}${t.v && t.sub && !t.hero && (!t.per || t.wide) ? ` <small>${t.sub}</small>` : ''}</span>
          <span class="k">${t.hero ? t.k : (t.kk || t.k)}${t.fn ? fn(t.fn) : ''}</span>
          ${!t.hero && (t.per || t.tip) ? `<span class="d">${t.per || t.tip}${t.per && t.v && t.sub ? ` · ${t.sub}` : ''}</span>` : ''}
          ${t.v && t.sym ? symHtml(t.sym) : ''}
          ${!t.v && t.hint ? `<span class="k note">${t.hint}</span>` : ''}
          ${t.v && t.cover ? `<span class="k note">${t.cover}</span>` : ''}
          ${t.v && t.act ? `<button type="button" class="tile-link" data-act="${t.act}" data-text="${t.actText}"><span class="tl-t">${maxLinkText()}</span></button>` : ''}
        </div>`).join('')}
      </div>
      ${key === 'volume' ? thinningChart(g, lo, hi) : key === 'area' ? areaBars(g) + (FEATURES.sizeTool ? `<a class="size-link" href="${sizeHref(g)}">How big is that? Drag it onto your city →</a>` : '') : key === 'length' ? retreatChart(g, lo, hi) : ''}
    </div></details>`; };
  return `<div class="stats">${group('area','Area')}${group('length','Length')}${group('volume','Thickness and volume')}</div>`;
}
/* ---------- ice volume of the selected glacier: Grab et al. (2021), from the swisstopo map service ----------
   map.geo.admin.ch shows area, volume and maximum / mean ice thickness per glacier for the thickness layer.
   The page asks that service for the glacier at its tongue and keeps a value only if
   - the returned glacier name matches the selected glacier,
   - the volume, read as km³ / million m³ / m³ by its size, gives a mean thickness of 10-500 m for the area. */
export const glacierVolume = (() => {
  const cache = new Map();
  const pickNum = (attrs, re) => { for (const [k, v] of Object.entries(attrs)) if (re.test(k) && Number.isFinite(+v) && +v > 0) return +v; return null; };
  const toKm3 = v => v < 100 ? v : v < 1e6 ? v / 1000 : v / 1e9;
  const toM = v => v;                                     // thickness is reported in metres
  return g => {
    if (cache.has(g.id)) return cache.get(g.id);
    const p = (async () => {
      const hit = await idb.get(`vol2|${g.id}`);
      if (hit && hit.km3) return hit;
      const pts = [g.tongue, g.center].filter(Boolean);
      for (const [lat, lng] of pts) {
        const d = 0.002, url = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify?' + new URLSearchParams({
          geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', sr: '4326', tolerance: '10', returnGeometry: 'false', lang: 'en',
          layers: `all:${THICK_LAYER}`, imageDisplay: '400,400,96', mapExtent: `${lng - d},${lat - d},${lng + d},${lat + d}` });
        let j; try { j = await (await fetch(url)).json(); } catch { continue; }
        for (const r of (j.results || [])) {
          const a = r.attributes || r.properties || {};
          const name = Object.entries(a).find(([k]) => /name/i.test(k)), sgi = Object.entries(a).find(([k]) => /sgi/i.test(k));
          // strict match: same inventory id, or the same full name without words for "glacier" (Oberaletsch is not Aletsch)
          const core = t => norm(t).replace(/\(.*?\)/g, '').replace(/gletscher|glacier|ghiacciaio|vadret|glatscher|\b(da|de|du|des|del|la|le|vs|be|gr)\b|[^a-z]/g, '');
          const sameId = sgi && g.inv && g.inv.id && String(sgi[1]).replace(/[^A-Za-z0-9]/g, '') === String(g.inv.id).replace(/[^A-Za-z0-9]/g, '');
          const ok = sameId || (name && core(String(name[1])) && core(String(name[1])) === core(g.local || g.name));
          const vol = pickNum(a, /vol/i), area = pickNum(a, /area|flaech|surf/i);
          if (!ok || !vol) { console.info('Ice volume: no usable match in', a); continue; }
          const km3 = toKm3(vol), areaKm2 = area || rankArea(g), mean = km3 * 1e9 / (areaKm2 * 1e6);
          if (mean < 10 || mean > 500) { console.info('Ice volume rejected (implausible mean thickness)', a); continue; }
          const yr = pickNum(a, /year/i), res = { km3, max: toM(pickNum(a, /max/i)), mean: Math.round(mean), name: name ? name[1] : g.name, yr: yr >= 2010 && yr <= 2020 ? Math.round(yr) : null };
          idb.set(`vol2|${g.id}`, res);
          return res;
        }
      }
      return null;
    })();
    cache.set(g.id, p);
    return p;
  };
})();
/* Grab et al. (2021) give the ice of each glacier around 2016. The national yearly losses (GLAMOS) tell how much of the Swiss ice is left
   since then. Applied to one glacier this is an estimate: single glaciers lose more or less than the average. */
export const iceShareLeft = () => iceVolume(VOLUME_LOSS[VOLUME_LOSS.length - 1].y) / iceVolume(2016);
/* The ice of one glacier in autumn `year`, in km³. v is its volume from the Grab et al. (2021) map (glacierVolume), the state of year R (v.yr, 2016 if unknown).
   Three measurements are combined:
   - the GLAMOS volume survey of this glacier (g.inv.volume: from, to, dV_km3): how much ice it really lost in that period;
   - the yearly mass balance (m w.e.): this glacier's own where GLAMOS measures it every year (Aletsch, Rhone, Corbassière, Findel), else that of all Swiss glaciers;
   - the Grab volume as the starting point.
   The survey says how much ice one metre of balance is worth for this glacier: c = dV / (sum of the balances in the survey period), in km³ per m w.e. Every
   other year is then loss = c x balance of that year, counted from R forwards or backwards. After the last year with a balance (the newest autumn) the Swiss
   loss of that year, turned into a balance (`eq` in balanceModel), continues it. Without a survey the 2016 volume is scaled with the Swiss ice of that year, as before. Either way an estimate. */
export const volumeSurvey = g => { const V = g && g.inv && g.inv.volume; return V && V.covered_pct >= 90 && V.dV_km3 < 0 ? V : null; };
export function balanceModel(g){          // {bal(year) in m w.e. or undefined, own: this glacier's own series is used, c: km³ ice per m w.e.} or null
  const V = volumeSurvey(g), swiss = DATA && DATA.swiss_balance;
  if (!V || !swiss || !swiss.length) return null;
  const sm = new Map(swiss), own = g.inv.balance ? new Map(g.inv.balance) : null;
  let useOwn = !!own;
  for (let y = V.from + 1; y <= V.to && useOwn; y++) if (!own.has(y)) useOwn = false;
  const bal = y => { const b = useOwn && own.has(y) ? own.get(y) : sm.get(y); return b === undefined ? undefined : b / 1000; };
  let S = 0;
  for (let y = V.from + 1; y <= V.to; y++) { const b = bal(y); if (b === undefined) return null; S -= b; }
  if (!(S > 0)) return null;
  /* A year without a balance (the newest autumn): the Swiss loss of that year (km³) is turned into a Swiss balance with the km³ per m w.e. of the survey years (the same years
     as c), and this glacier loses c x that balance, not the Swiss percentage: a big glacier loses a smaller share than the Swiss average. */
  let swissKm3 = 0, swissBal = 0;
  for (let y = V.from + 1; y <= V.to; y++) { const b = sm.get(y); if (b === undefined) { swissKm3 = 0; break; } swissKm3 += iceVolume(y - 1) - iceVolume(y); swissBal -= b / 1000; }
  const kS = swissBal > 0 && swissKm3 > 0 ? swissKm3 / swissBal : 0;
  const eq = kS ? (y => -(iceVolume(y - 1) - iceVolume(y)) / kS) : null;      // m w.e. (negative = loss)
  return { bal, eq, own: useOwn, c: -V.dV_km3 / S };
}
export function glacierIceAt(g, v, year){
  const R = v.yr || 2016, M = balanceModel(g);
  if (!M) return v.km3 * iceVolume(year) / iceVolume(R);
  let vol = v.km3;
  if (year > R) for (let t = R + 1; t <= year; t++) { const b = M.bal(t); vol = b !== undefined ? vol + M.c * b : M.eq ? vol + M.c * M.eq(t) : vol * iceVolume(t) / iceVolume(t - 1); }
  else for (let t = year + 1; t <= R; t++) { const b = M.bal(t); if (b !== undefined) vol -= M.c * b; }
  return Math.max(0, vol);
}
export const iceSource = g => { const V = volumeSurvey(g), M = balanceModel(g);
  return M ? `Estimate: Grab et al. 2021, the GLAMOS volume survey ${V.from}–${V.to} and the yearly mass balance of ${M.own ? 'this glacier' : 'all Swiss glaciers'} (GLAMOS)`
           : 'Estimate: Grab et al. 2021 (ice around 2016), scaled with the yearly Swiss loss (GLAMOS)'; };
/* The selected glacier's part of the Swiss ice, as a line above the figures of the Switzerland tab: its measured volume around 2016
   (Grab et al. 2021, via swisstopo), the latest volume survey, against the national ice of that year. */
export const shareText = sh => `${sh * 100 < 10 ? (sh * 100).toFixed(1) : Math.round(sh * 100)} %`;
export function renderShare(){
  const g = currentGlacier(), big = document.getElementById('shIce');
  if (!big) return;
  glacierVolume(g).then(v => {
    if (!v || currentGlacier() !== g || !document.getElementById('shIce')) return;
    const total = iceVolume(v.yr || 2016);
    document.getElementById('shIce').textContent = shareText(v.km3 / total);
    const shSum = document.getElementById('shSum'); if (shSum) shSum.innerHTML = sumInner(shareText(v.km3 / total));
    document.getElementById('shLab').textContent = `of all Swiss glacier ice in ${v.yr || 2016}`;
    document.getElementById('shNote').innerHTML = `${v.km3.toFixed(1)} of ${total.toFixed(1)} km³${fn('grab')}${fn('swiss')}`;
  }).catch(() => {});
}
export function renderGlacierWater(){
  const g = currentGlacier(), slot = document.getElementById('gWater');
  if (!slot) return;
  glacierVolume(g).then(v => {
    if (!v || currentGlacier() !== g) return;
    const lastY = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, estKm3 = glacierIceAt(g, v, lastY), litres = estKm3 * 0.9 * 1e12;
    const N = wire.waterNumbers(estKm3), V = volumeSurvey(g), M = balanceModel(g), R0 = v.yr || 2016;
    const nationalLossPct = Math.round((1 - iceShareLeft()) * 100);
    slot.innerHTML = `<details class="card gwater dcard coll" name="stats" data-card="water"${cardOpen('water') ? ' open' : ''}><summary><div class="card-h"><span class="ico">${ICONS.drop}</span>Water storage</div>${sumValue(N.litresText + ' L')}</summary><div class="dbody">
      <div class="stat-row">
        <div class="stat hero wide">
          <span class="v">${N.litresText} litres</span>
          <span class="k">Water stored in this glacier, autumn ${lastY}</span>
          ${symHtml({big:`× ${N.poolsLong}`, small:'Olympic swimming pools'}, 'estimate, not a measurement')}
        </div>
        <div class="stat"><span class="v">${N.lakes.toFixed(1)} <small>×</small></span><span class="k">Lake Zurich</span><span class="d">The water of this glacier as a number of Lake Zurichs</span></div>
        <div class="stat"><span class="v">${N.tap.toFixed(1)} <small>years</small></span><span class="k">Swiss tap water</span><span class="d">How long all of Switzerland’s tap water use would take to use this much</span></div>
      </div>
    </div></details>`;
  });
}
export const speedLinkText = () => document.getElementById('speedToggle').checked ? 'Hide speed and its fastest point on the map' : 'Show speed and its fastest point on the map';
/* Ice speed card: the fastest ice of the ITS_LIVE annual surface speed (data/itslive, copied from the product), per year: the highest value along the flowline of the glacier
   after a running median (`speedPeak`), computed here and labelled so; under SPEED_MIN m/yr the product does not tell ice from rock. */
export async function renderGlacierSpeed(lo, hi){
  const g = currentGlacier(), slot = document.getElementById('gSpeed');
  if (!slot) return;
  slot.innerHTML = '';
  if (!FEATURES.speed || !speedId(g)) return;
  if ('IntersectionObserver' in window) await new Promise(res => { const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { o.disconnect(); res(); } }, { rootMargin: '300px' }); o.observe(slot); });      // the speed file is fetched when the card is about to be seen
  if (currentGlacier() !== g || !slot.isConnected) return;
  const id = speedId(g), f = await loadSpeedFile(id);
  if (!f || currentGlacier() !== g) return;
  const mask = speedMask(f, g), peaks = await Promise.all(f.years.map(async y => { const k = await speedYearOk(f, y) ? speedPeak(f, await speedArray(f, y), mask) : null; return k ? k.v : null; }));
  if (currentGlacier() !== g || !document.getElementById('gSpeed')) return;
  const y0 = f.years[0], y1 = f.years[f.years.length - 1], shown = hi ? Math.min(Math.max(hi, y0), y1) : y1, k = f.years.indexOf(shown), pk = peaks[k];
  const items = f.years.map((y, i) => ({lab: String(y).slice(2), sel: !!(lo && hi && r_in(y, lo, hi)), v: peaks[i], t: `${y}: fastest point ${peaks[i] == null ? 'not given: under ' + SPEED_MIN + ' m/yr, or too many gaps on the flowline in this map' : Math.round(peaks[i]) + ' m/yr (computed here from ITS_LIVE, along the flowline)'}`}));
  const have = peaks.filter(v => v != null); if (!have.length) return;
  slot.innerHTML = `<details class="card gspeed dcard coll" name="stats" data-card="speed"${cardOpen('speed') ? ' open' : ''}><summary><div class="card-h"><span class="ico">${ICONS.speed}</span>Ice speed</div>${pk != null ? sumValue(Math.round(pk) + ' m/yr') : ''}</summary><div class="dbody">
    <div class="stat-row">
      <div class="stat hero wide">
        <span class="v">${pk != null ? Math.round(pk) + ' <small>m/yr</small>' : '—'}</span>
        <span class="k">Fastest ice on the main flowline, ${shown}${fn('itslive')}</span>
        <span class="d">Computed here: the highest speed along one line from the tongue up the glacier (other branches can be faster), smoothed over about 400 m</span>
        <button type="button" class="tile-link" data-act="speed-toggle"><span class="tl-t">${speedLinkText()}</span>${fn('itslive')}</button>
      </div>
      <div class="stat"><span class="v">${Math.round(Math.max(...have))} <small>m/yr</small></span><span class="k">Fastest year</span><span class="d">${f.years[peaks.indexOf(Math.max(...have))]}, of ${y0} to ${y1}</span></div>
      <div class="stat"><span class="v">${Math.round(Math.min(...have))} <small>m/yr</small></span><span class="k">Slowest year</span><span class="d">${f.years[peaks.indexOf(Math.min(...have))]}, of ${y0} to ${y1}</span></div>
    </div>
    <figure class="cum dh-chart">${barChart('Fastest ice per year', 'm/yr', items, `Fastest ice on the main flowline of ${g.local || g.name} per year, ${y0} to ${y1}: ${items.map(r => `${r.lab} ${r.v == null ? 'none' : Math.round(r.v) + ' m/yr'}`).join(', ')}`)}
      <figcaption>${lo && hi && (Math.min(lo, hi) < y0 || Math.max(lo, hi) > y1) ? `<b>Speed maps are available for ${y0} to ${y1} only.</b> ` : ''}Yearly mean surface speed from satellite image pairs (ITS_LIVE).${peaks.some(v => v == null) ? ' A year is left empty when its map has too many gaps along the flowline.' : ''} Switch it on in the Layers menu or with the link above.</figcaption>
    </figure>
  </div></details>`;
}

/* ---------- "How much water?" ---------- */
export const fmtN = (n, d = 1) => n >= 1e12 ? `${(n / 1e12).toFixed(d)} trillion` : n >= 1e9 ? `${(n / 1e9).toFixed(d)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(d)} million` : Math.round(n).toLocaleString('en');
/* Ice left in all Swiss glaciers since autumn 2016.
   Base: autumn 2016, the first year of the images. Counting back from GLAMOS (46.4 km³ at the end of 2024)
   gives 58.8 km³; an independent radar survey (Grab et al. 2021) measured 58.7 ± 2.5 km³ for 2016.
   The axis starts at 0 so the decline is shown at its true size. */
export const CUM_BASE_YEAR = 2016;
/* "How much ice is left?": what remains of the Swiss glacier ice, first as a share and in km³, then year by year (the ice left at the end of each year, or the share lost in each year), with your selected years marked. */
export let leftMode = 'left';
export function cumulativeChart(lo, hi){
  const last = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, years = [];
  for (let y = CUM_BASE_YEAR; y <= last; y++) years.push(y);
  const vols = years.map(iceVolume), base = vols[0], end = vols[vols.length - 1];
  const lostPct = Math.round((1 - end / base) * 100), leftPct = 100 - lostPct, lostKm3 = base - end;
  const sel = y => !!(lo && hi && r_in(y, lo, hi));
  const items = leftMode === 'lost'
    ? years.map(y => { const n = VOLUME_LOSS.find(d => d.y === y); return {lab: String(y).slice(2), sel: sel(y), v: n ? -n.v : null, t: n ? `${y} (${y - 1}/${String(y).slice(2)}): Swiss glaciers lost ${n.approx ? 'about ' : ''}${n.v.toFixed(1)} % of their ice, ${n.approx ? 'about ' : ''}${(iceVolume(y - 1) - iceVolume(y)).toFixed(1)} km³` : `${y}: no value`}; })
    : years.map((y, i) => ({lab: String(y).slice(2), sel: sel(y), v: vols[i], t: `autumn ${y}: ${vols[i].toFixed(1)} km³ of ice, ${Math.round(vols[i] / base * 100)} % of autumn ${CUM_BASE_YEAR}`}));
  const selYears = years.filter(sel), selLost = selYears.length ? iceVolume(selYears[0] - 1) - iceVolume(selYears[selYears.length - 1]) : 0;
  const selPct = selYears.length ? (1 - selYears.reduce((q, y) => { const n = VOLUME_LOSS.find(d => d.y === y); return q * (1 - (n ? n.v : 0) / 100); }, 1)) * 100 : 0;
  const selLab = selYears.length ? (selYears.length === 1 ? `${selYears[0]}` : `${selYears[0]}–${selYears[selYears.length - 1]}`) : '';
  const mode = `<div class="ch-mode" role="group" aria-label="Chart type"><button type="button" data-lmode="left" aria-pressed="${leftMode === 'left'}">Ice left</button><button type="button" data-lmode="lost" aria-pressed="${leftMode === 'lost'}">Lost per year</button></div>`;
  return `<figure class="ice-left">
    <div class="stat-row">
      <div class="stat hero wide"><span class="v">${leftPct} %</span><span class="k">of the Swiss glacier ice of ${CUM_BASE_YEAR} is left in ${last}</span></div>
      <div class="stat"><span class="v">${base.toFixed(1)} <small>km³</small></span><span class="k">Autumn ${CUM_BASE_YEAR}</span></div>
      <div class="stat"><span class="v">${end.toFixed(1)} <small>km³</small></span><span class="k">Autumn ${last}</span></div>
      <div class="stat wide loss"><span class="v">−${lostKm3.toFixed(1)} <small>km³ gone</small></span><span class="k">Lost since ${CUM_BASE_YEAR}</span><span class="d">${lostPct} % of the ice of ${CUM_BASE_YEAR}</span></div>
    </div>
    ${barChart(leftMode === 'lost' ? 'Ice lost per year' : 'Ice left per year', leftMode === 'lost' ? '%' : 'km³', items, leftMode === 'lost' ? `Share of the Swiss glacier ice lost per year, ${CUM_BASE_YEAR} to ${last}` : `Ice in all Swiss glaciers per year, ${CUM_BASE_YEAR} to ${last}, in km³: ${items.map(r => `${r.lab} ${r.v.toFixed(1)}`).join(', ')}`, mode)}
    <figcaption>${selYears.length ? `Selected ${selLab}: Swiss glaciers lost <b>${selPct.toFixed(1)} %</b> of their ice, <b>${selLost.toFixed(1)} km³</b>, from autumn ${selYears[0] - 1} to autumn ${selYears[selYears.length - 1]}. ` : ''}</figcaption>
  </figure>`;
}
export function waterSection(lo, hi){
  const last = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, to = Math.min(hi || 0, last);
  if (!(lo && hi) || to < lo) return '<p class="sub-note">Choose a year or two in step 2 to see how much water melted from all Swiss glaciers.</p>';
  const litres = (iceVolume(lo - 1) - iceVolume(to)) * 0.9 * 1e12, km3 = litres / 1e12;
  const leftL = iceVolume(to) * 0.9 * 1e12;
  const leftKm3 = leftL / 1e12, pools = leftL / POOL_L, lakes = leftKm3 / LAKE_ZURICH_KM3, tap = leftKm3 / SWISS_SUPPLY_KM3, each = leftL / SWISS_POP, yrs = each / (HOUSEHOLD_L_DAY * 365);
  const tile = (k, v, small, d) => `<div class="stat"><span class="v">${v}${small ? ` <small>${small}</small>` : ''}</span><span class="k">${k}</span><span class="d">${d}</span></div>`;
  return `<div class="water" id="waterBox" data-litres="${litres}"><div class="stat-row">
    <div class="stat hero wide"><span class="v">${fmtN(leftL, 1)} litres</span><span class="k">of water still stored as ice in autumn ${to}</span></div>
    ${tile('Olympic pools', fmtN(pools), '', `Lined up, these 50-metre pools would stretch ${fmtN(pools * 50 / 1000, 0)} km, or ${(pools * 50 / 1000 / 40075).toFixed(1)} times around the Earth.`)}
    ${tile('Lake Zurich', lakes.toFixed(1), '×', `Lake Zurich holds about ${LAKE_ZURICH_KM3} km³ of water, so the ice still left would fill it ${lakes >= 1 ? `${lakes.toFixed(1)} times` : `to ${Math.round(lakes * 100)} %`}.`)}
    ${tile('Swiss tap water', tap.toFixed(1), 'years', `Swiss water suppliers delivered ${Math.round(SWISS_SUPPLY_KM3 * 1000)} million m³ of drinking and process water in 2022 (SVGW; its text gives the yearly supply as 900–950 million m³). At that rate this much water would last ${tap.toFixed(1)} years (computed here).`)}
    ${tile('Litres per resident', fmtN(each, 2), '', `Shared among ${SWISS_POP / 1e6} million Swiss residents, this would cover each person's household water use for about ${Math.round(yrs)} years (${HOUSEHOLD_L_DAY} L/day).`)}
    <div class="stat hero wide"><span class="v"><span id="wCount">0</span> litres</span><span class="k">melted from Swiss glaciers</span><span class="d">between autumn ${lo - 1} and autumn ${to}</span></div>
  </div>
  <div class="w-live" id="wLive"></div></div>`;
}
/* after each story render: count up the headline figure, start the live counter */
export let liveStart = Date.now(), liveTimer = null, lastCounted = null;
export function wireWater(){
  const box = document.getElementById('waterBox');
  clearInterval(liveTimer);
  if (!box) return;
  const litres = +box.dataset.litres, out = document.getElementById('wCount'), t0 = performance.now(), dur = 1400;
  const again = lastCounted !== null && Math.abs(lastCounted - litres) < 1;       // same number as before: no count-up from zero
  lastCounted = litres;
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    out.textContent = fmtN(litres * e, 1); if (k < 1) requestAnimationFrame(step); };
  matchMedia('(prefers-reduced-motion:reduce)').matches || again ? (out.textContent = fmtN(litres, 1)) : requestAnimationFrame(step);
  // live counter: average melt rate of the latest year, spread over the whole year
  const lastY = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, perYear = (iceVolume(lastY - 1) - iceVolume(lastY)) * 0.9 * 1e12;
  const perSec = perYear / (365.25 * 86400), live = document.getElementById('wLive');
  const tick = () => { const sec = (Date.now() - liveStart) / 1000;
    live.innerHTML = `While you have been on this page, Swiss glaciers lost about <b>${Math.round(sec * perSec).toLocaleString('en')} litres</b>. In ${lastY} they lost on average ${Math.round(perSec).toLocaleString('en')} litres every second, or one Olympic pool every ${Math.round(POOL_L / perSec)} seconds.`; };
  tick(); liveTimer = setInterval(tick, 1000);
}


export function renderOutlineControls(){
  if (REGION.rgi) {      // the outlines of the region's institute, cut to the glacier: the old one and the newest
    document.getElementById('oldLabel').textContent = `Outline ${REGION.outlines.old}`; document.getElementById('newLabel').textContent = `Outline ${REGION.outlines.new}`;
    document.getElementById('outlineNote').textContent = '';      // the sources and limits of the outlines are in About, not in the menu
    return;
  }
  const has = !!DATA, yr = l => (l || '').replace(/\D/g, '') || l;
  ['oldToggle','newToggle'].forEach(id => document.getElementById(id).disabled = !has);
  document.getElementById('oldLabel').textContent = `Outline ${has ? yr(DATA.oldest_label) : '1850'}`;
  document.getElementById('newLabel').textContent = `Outline ${has ? yr(DATA.latest_label) : '2023'}`;
  document.getElementById('pinLabel').textContent = `Tongue tip ${has ? yr(DATA.latest_label) : '2023'}`;
  document.getElementById('outlineNote').textContent = has ? '' : 'Outlines appear once the glacier data (glaciers.js) has been built.';
}

export function refreshAll(){
  if (state.oldestAerial && state.oldestMode !== state.mode) {      // Oldest was picked in another mode: the pictures differ (one aerial image alone, or the slider's first side)
    if (state.mode === 'timelapse') restoreOldest(); else { restoreOldest(); if (state.mode === 'compare') { const ys = YEARS.filter(y => state.available[y]); if (ys.length && state.b === ys[0]) state.b = ys[ys.length - 1]; } return showOldest(); }
  }
  if (state.latest && (state.mode === 'timelapse' || (state.mode === 'compare' && state.a !== state.latest.year && state.b !== state.latest.year))) restoreLatest();        // the latest image belongs to One year, or to a side of the slider
  renderMode(); renderYears();
  if (state.checked) { setCompareLayers(); buildTimelapse(); }
  renderStory(); writeHash(); wire.sync3D(); wire.syncPin(); drawArcs(false);      // syncPin: the pin card follows the year and the glacier (js/11b-pin.js)
  if (state.checked && !latestBusy) wire.setStatus(statusLine());      // the status box follows the choice: a year after Latest drops its "Latest clear-ish scene" line
}


/* hovering (or tabbing to) a bar of "Retreat per year" reads out its period and value in the corner of the chart title */
document.addEventListener('mouseover', e => { const g = e.target.closest && e.target.closest('.rb'); if (!g) return; const c = g.closest('.stat-row') ? null : g.closest('.dbody'); const em = c && c.querySelector('.rb-read'); if (!em) return; em.textContent = g.dataset.t; g.parentNode.querySelectorAll('.rb').forEach(x => x.classList.toggle('on', x === g)); });
document.addEventListener('mouseout', e => { const g = e.target.closest && e.target.closest('.rb'); if (!g || (e.relatedTarget && g.contains(e.relatedTarget))) return; const c = g.closest('.dbody'), em = c && c.querySelector('.rb-read'); if (em) em.textContent = em.dataset.def || ''; g.parentNode.querySelectorAll('.rb.on').forEach(x => x.classList.remove('on')); });
export function setSubFocus(v){ return subFocus = v; }      // the other files may not assign to an imported variable
export function setRestoringCards(v){ return restoringCards = v; }      // the other files may not assign to an imported variable
export function setStoryTab(v){ return storyTab = v; }      // the other files may not assign to an imported variable
export function setDynSources(v){ return dynSources = v; }      // the other files may not assign to an imported variable

/* A scrollable year list always shows its chosen year: after the list is drawn or the choice changes, and again when the visitor has scrolled it and let go or left it */
{
  const showChosen = box => {
    const b = box.querySelector('button[aria-pressed="true"]'); if (box.scrollHeight <= box.clientHeight + 1) return;
    if (!b) { if (matchMedia('(hover:hover) and (pointer:fine)').matches && !box.matches(':hover')) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); return; }      // nothing chosen, list at rest on a mouse device: the newest years (the list runs oldest to newest)
    const top = b.offsetTop - box.offsetTop, want = top - (box.clientHeight - b.offsetHeight) / 2;      // (offsetTop is from the page's offset parent: measured against the box's own)
    if (top < box.scrollTop || top + b.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTo({ top: Math.max(0, want), behavior: 'smooth' });
  };
  const watched = new WeakSet(), timers = new WeakMap();
  const later = (box, ms) => { clearTimeout(timers.get(box)); timers.set(box, setTimeout(() => showChosen(box), ms)); };
  const watch = box => {
    if (watched.has(box)) return; watched.add(box);
    new MutationObserver(() => later(box, 60)).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    box.addEventListener('scroll', () => later(box, 1500), { passive: true });      // scrolled away and left alone: back to the chosen year
    box.addEventListener('pointerleave', () => later(box, 600));
    later(box, 60);
  };
  const scan = () => document.querySelectorAll('.years:not(.specials)').forEach(watch);
  scan(); setInterval(scan, 1000);      // (the lists are filled by several sections, some after load)
}

/* The panes under Save and share (elevation model, embed, metadata) open below their button: scroll just far enough that the whole pane is on screen (again after a moment, when the metadata table has been filled in) */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#metaBtn, #embedBtn, #demBtn'); if (!b) return;
  const box = document.getElementById(b.getAttribute('aria-controls'));
  const show = () => { if (box && !box.hidden) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  requestAnimationFrame(show); setTimeout(show, 450);
});

/* The glacier list always shows the chosen glacier: when the visitor has scrolled it and let go or left it (the list itself already scrolls to it when it is drawn) */
{
  const ul = document.getElementById('glacierList'); let t = 0;
  const back = () => { const r = ul.querySelector('button[aria-pressed="true"]'); if (!r || ul.scrollHeight <= ul.clientHeight + 1) return;
    const top = r.offsetTop, bottom = top + r.offsetHeight;
    if (top < ul.scrollTop || bottom > ul.scrollTop + ul.clientHeight) ul.scrollTo({ top: Math.max(0, top - (ul.clientHeight - r.offsetHeight) / 2), behavior: 'smooth' }); };
  const later = ms => { clearTimeout(t); t = setTimeout(back, ms); };
  ul.addEventListener('scroll', () => later(1500), { passive: true });
  ul.addEventListener('pointerleave', () => later(600));
}

/* The first time the slider is on show: a short note under the Slider button says that tapping it again turns the slider. Once only (remembered), gone after a few seconds or at the first tap on the button. */
let turnHintDone = false;
function turnHint(){
  if (turnHintDone || state.mode !== 'compare') return;
  try { if (localStorage.getItem('tsf-turn-hint')) { turnHintDone = true; return; } } catch {}
  const btn = document.getElementById('modeCompare'), grp = document.getElementById('modeGroup'); if (!btn || !grp || !btn.offsetWidth) return;      // not laid out yet: the next render tries again
  turnHintDone = true;
  const el = document.createElement('div'); el.className = 'turn-hint'; el.setAttribute('role', 'status'); el.textContent = 'Tap again to turn';
  el.style.left = (btn.offsetLeft + btn.offsetWidth / 2) + 'px'; el.style.top = (btn.offsetTop + btn.offsetHeight + 8) + 'px'; grp.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const end = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 500); try { localStorage.setItem('tsf-turn-hint', '1'); } catch {} };
  setTimeout(end, 5500); btn.addEventListener('click', end, {once: true});
}
