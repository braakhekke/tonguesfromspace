/* =====================================================================
   7. Rendering
   ===================================================================== */
function renderGlacierList(){
  const ul = document.getElementById('glacierList'); ul.innerHTML = '';
  GLACIERS.forEach((g, i) => {
    const area = rankArea(g);
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-pressed', glacierPicked && g.id === state.glacier);      // nothing is highlighted before the first choice
    b.innerHTML = `<span class="rank">${i+1}</span><span class="name">${g.name}</span><span class="area">${area.toFixed(2)} km²</span>`;
    b.onclick = () => chooseGlacier(g.id);
    li.appendChild(b); ul.appendChild(li);
  });
  document.getElementById('rankNote').innerHTML = `Ranked by area${fn('sgi')}`;
}

/* Timelapse: one slider with two handles, the chosen first and last year at its ends. A handle only stops on years that have a picture. */
function renderYearRange(){
  const box = document.getElementById('yearsRange'), n = YEARS.length - 1;
  const lo = Math.min(state.from, state.to), hi = Math.max(state.from, state.to), i = y => YEARS.indexOf(y);
  box.innerHTML = `<div class="yr-vals"><b id="yrLo">${lo}</b><span>to</span><b id="yrHi">${hi}</b></div>
    <div class="yr-track"><div class="yr-fill" id="yrFill"></div>
      <input type="range" id="yrA" min="0" max="${n}" step="1" value="${i(lo)}" aria-label="First year">
      <input type="range" id="yrB" min="0" max="${n}" step="1" value="${i(hi)}" aria-label="Last year"></div>
    <div class="yr-ticks">${YEARS.map(y => `<i class="${state.available[y] ? '' : 'off'}" title="${y}${state.available[y] ? '' : ': no picture'}"></i>`).join('')}</div>
    <div class="yr-ends"><span>${YEARS[0]}</span><span>${YEARS[n]}</span></div>`;
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
function yearChips(boxId, key, opts = {}){
  const box = document.getElementById(boxId); box.innerHTML = '';
  YEARS.forEach(y => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = y;
    const ok = !!state.available[y];
    b.disabled = !ok;                                       // not clickable until confirmed available
    if (state.checked && !ok) { b.classList.add('missing'); b.title = `No ${y} imagery from this source`; }
    if (!state.checked) b.title = 'Checking…';
    b.setAttribute('aria-pressed', state[key] === y && !(key === 'one' && state.latest));
    if (opts.range && ok && y > Math.min(state.from, state.to) && y < Math.max(state.from, state.to)) b.classList.add('in-range');
    b.onclick = () => {
      if (key === 'one') restoreLatest();
      state[key] = y;
      if (opts.range && state.from > state.to) [state.from, state.to] = [state.to, state.from];
      refreshAll();
    };
    box.appendChild(b);
  });
  if (opts.latest) {          // the newest clear scene of the last weeks, in any month
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Latest'; b.className = 'latest-chip';
    b.disabled = !state.checked || latestBusy;
    b.title = `The newest clear-ish scene of the last ${LATEST.days} days, with at most ${Math.round(LATEST.maxCloudOutline * 100)} % cloud over the 1850 outline and a clear tongue`;
    b.classList.add('sat-need'); b.setAttribute('aria-pressed', !!state.latest);
    b.onclick = () => { if (state.latest) { restoreLatest(); refreshAll(); } else showLatest(); };
    box.appendChild(b);
  }
}
/* The download pane shows the years it will use: refresh it whenever the selection or the frame on the map changes */
function syncPane(){
  try {
    if (!$('videoSheet').hidden && !vstate.busy && !v3dBusy) {            // the pane follows the mode buttons: a timelapse is an animation, one year is a picture
      if (state.mode === 'timelapse' && vstate.kind === 'image') return openVideo('video', true);
      if (state.mode === 'single' && vstate.kind === 'video' && viewMode !== '3d') return openVideo('image', true);      // in 3D one year can still be a camera flight
    }
    if (!$('videoSheet').hidden && viewMode !== '3d' && vstate.kind === 'video' && state.mode !== 'single') { const t = state.mode === 'compare' ? 'swipe' : 'timelapse'; if (vstate.type !== t) setType(t); }   // the pane follows the mode buttons
    updateFrame();
  } catch {}
}
function renderYears(){
  yearChips('yearsA', 'a'); yearChips('yearsB', 'b');
  renderYearRange(); yearChips('yearsOne', 'one', {latest:true});
  if (typeof renderMobileBar === 'function') renderMobileBar();
  syncPane();
}
function setTag(id, yr){ document.getElementById(id).firstChild.nodeValue = yr ?? '–'; }

function renderMode(){
  const tl = state.mode !== 'compare';          // timelapse and one year both show on the single image pane
  document.getElementById('app').classList.toggle('is-timelapse', tl);
  document.getElementById('app').classList.toggle('photos-ok', state.mode === 'single'); syncFullPlay();      // the old photographs are for one year only
  document.getElementById('modeCompare').setAttribute('aria-pressed', state.mode === 'compare');
  document.getElementById('modeTimelapse').setAttribute('aria-pressed', state.mode === 'timelapse');
  document.getElementById('modeSingle').setAttribute('aria-pressed', state.mode === 'single');
  document.getElementById('compareControls').hidden = state.mode !== 'compare';
  document.getElementById('orientSub').hidden = state.mode !== 'compare'; document.getElementById('modeGroup').classList.toggle('has-sub', state.mode === 'compare');      // the slider direction hangs under the Compare button
  document.getElementById('singleControls').hidden = state.mode !== 'single';
  document.getElementById('timelapseControls').hidden = state.mode !== 'timelapse';
  ['paneA','paneB'].forEach(p => map.getPane(p).style.display = tl ? 'none' : '');
  map.getPane('paneT').style.display = tl ? '' : 'none';
  updateTags();
  document.getElementById('styleNatural').setAttribute('aria-pressed', state.style === 'natural');
  document.getElementById('styleFalse1').setAttribute('aria-pressed', state.style === 'false1');
  document.getElementById('styleFalse2').setAttribute('aria-pressed', state.style === 'false2');
  applyBrightness();
  document.getElementById('styleNote').textContent = {
    natural: 'As our eyes see it: snow white, rock grey, plants green.',
    false1: 'Plants look red, snow white, bare ice grey, water dark/blue.',
    false2: 'Snow and ice look red, clouds white, rock pale, water black.'
  }[state.style];
}
function setStyle(st){
  state.style = prefs.style = st; savePrefs();
  renderMode();
  if (state.checked) { setCompareLayers(); buildTimelapse(); }
  renderStory(); sync3D();
}
/* Brightness: gamma curve on the imagery panes (exponent = 1 / brightness). Remembered. */
const BRIGHT_DEFAULT = 1.0;      // the colour process above is already balanced
const brightness = () => typeof prefs.bright === 'number' ? prefs.bright : BRIGHT_DEFAULT;
/* Brightness is applied to the image pixels in a canvas (same gamma curve, white stays white).
   CSS/SVG filters on page elements do not work in Safari on iPhone, so no filters are used. */
const liveImages = new Set();
const adjCache = new Map();
/* Outside the 1850 outline: the image gets this opacity there (1 = untouched), so the background map shows through. Needs the glacier's outline. */
const outsideAlpha = () => typeof prefs.outside === 'number' ? prefs.outside : 1;
const stampOf = (b, o) => b.toFixed(2) + '|' + (o < 0.99 ? o.toFixed(2) : '');
const outlineGeom = g => g && g.inv && g.inv.oldest ? g.inv.oldest.outline : null;
function adjustedUrl(orig, b, o, g){
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
function showImage(ov, orig){
  ov._orig = orig; liveImages.add(ov);
  const b = brightness(), o = outsideAlpha(), stamp = stampOf(b, o);
  /* a picture counts as ready when its final image is loaded and decoded (a timelapse waits for this, otherwise the first run flashes blank frames) */
  const put = u => {
    ov._ready = false;
    const done = () => { const el = ov.getElement && ov.getElement(); (el && el.decode ? el.decode() : Promise.resolve()).catch(() => {}).then(() => { ov._ready = true; ov.fire('tfsready'); }); };
    if (ov._url === u && ov.getElement && ov.getElement() && ov.getElement().complete) done(); else { ov.once('load', done); ov.setUrl(u); }
  };
  adjustedUrl(orig, b, o, ov._g).then(u => { if (ov._orig === orig && stampOf(brightness(), outsideAlpha()) === stamp) put(u); }).catch(() => put(orig));
}
let brightTimer = null;
function refreshImages(){            // after a change of brightness or of the outside opacity: drop old results, redo the pictures on the map
  clearTimeout(brightTimer);
  brightTimer = setTimeout(() => {
    const keep = '|' + stampOf(brightness(), outsideAlpha());
    for (const [k, p] of adjCache) if (!k.endsWith(keep)) { adjCache.delete(k); p.then(u => setTimeout(() => URL.revokeObjectURL(u), 5000)).catch(() => {}); }
    liveImages.forEach(ov => { if (!map.hasLayer(ov)) { liveImages.delete(ov); return; } if (ov._orig) showImage(ov, ov._orig); });
  }, 120);
}
function applyBrightness(){
  const b = brightness();
  document.getElementById('brightness').value = b;
  document.getElementById('brightnessOut').textContent = `${Math.round(b * 100)} %`;
  refreshImages();
}
function syncOutsideUi(){            // the slider on the map panel and the one in the download pane are one setting
  const o = outsideAlpha(), has = !!outlineGeom(typeof currentGlacier === 'function' ? currentGlacier() : null);
  [['outside', 'outsideOut'], ['vOutside', 'vOutsideOut']].forEach(([id, out]) => {
    const el = document.getElementById(id); if (!el) return;
    el.value = o; el.disabled = !has; document.getElementById(out).textContent = `${Math.round(o * 100)} %`;
  });
  const bgOn = ['mosaicToggle', 'osmToggle', 'topoToggle', 'altiToggle', 'aerialToggle', 'labelsToggle'].some(id => document.getElementById(id).checked);
  const note = document.getElementById('outsideNote');      // the download pane switches the background layers off itself
  note.hidden = !(has && o < 0.99);
  note.textContent = bgOn ? 'Surroundings opacity is below 100 %, so the background layers show through. Turn them all off and set it to 0 to see this tongue floating in space.' : o < 0.05 ? 'Background layers off and surroundings at 0: the tongue floats in space.' : 'Set surroundings opacity to 0 to see this tongue floating in space.';
}
['mosaicToggle', 'osmToggle', 'topoToggle', 'altiToggle', 'aerialToggle', 'labelsToggle'].forEach(id => document.getElementById(id).addEventListener('change', () => syncOutsideUi()));
/* While the download pane is open and the picture outside the outline is made transparent, the background layers are switched off: a download has no map underneath, so the preview must not show one.
   They come back when the opacity returns to 100 % or the pane closes (a layer you switched on again yourself stays on). The saved layer settings are not touched. */
let bgOff = null, labelsAuto = false, trailsAuto = false;
function syncBackgrounds(){
  const open = !document.getElementById('videoSheet').hidden, labelsEl = document.getElementById('labelsToggle');
  const flipLabels = on => { labelsEl.checked = on; labelsEl.dispatchEvent(new Event('change')); };
  if (open && labelsEl.checked && !labelsAuto) { labelsAuto = true; flipLabels(false); }              // place labels stay off while a download pane is open
  else if (!open && labelsAuto) { labelsAuto = false; if (!labelsEl.checked) flipLabels(true); }      // and come back when it closes
  const trailsEl = document.getElementById('trailsToggle'), flipTrails = on => { const keepPref = prefs.trails; trailsEl.checked = on; trailsEl.dispatchEvent(new Event('change')); prefs.trails = keepPref; savePrefs(); };      // your saved choice is not touched
  if (open && trailsEl.checked && !trailsAuto) { trailsAuto = true; flipTrails(false); }                 // the hiking trails are not in the downloads either
  else if (!open && trailsAuto) { trailsAuto = false; if (!trailsEl.checked) flipTrails(true); }
  const low = open && ((outsideAlpha() < 0.99 && !!outlineGeom(currentGlacier())) || frameExceedsImage());      // reaching beyond the picture: space, no map and no other glaciers
  const ids = ['mosaicToggle', 'osmToggle', 'topoToggle', 'altiToggle', 'aerialToggle', 'labelsToggle'], keep = { mosaic: prefs.mosaic, osm: prefs.osm, topo: prefs.topo, alti: prefs.alti };
  const flip = (id, on) => { const el = document.getElementById(id); el.checked = on; el.dispatchEvent(new Event('change')); };
  if (low && !bgOff) { bgOff = ids.filter(id => document.getElementById(id).checked); bgOff.forEach(id => flip(id, false)); }
  else if (!low && bgOff) { bgOff.forEach(id => { if (!document.getElementById(id).checked) flip(id, true); }); bgOff = null; }
  else return;
  prefs.mosaic = keep.mosaic; prefs.osm = keep.osm; prefs.topo = keep.topo; prefs.alti = keep.alti; savePrefs();
}
/* Opacity of the whole satellite image (all years, compare and timelapse): the background layers show through. Remembered. */
const imgOpacity = () => typeof prefs.imgOpacity === 'number' ? prefs.imgOpacity : 1;
function applyImgOpacity(){
  const o = imgOpacity();
  ['paneA', 'paneB', 'paneT'].forEach(n => { map.getPane(n).style.opacity = o; });
  ['imgOpacity', 'mapOp'].forEach(id => { document.getElementById(id).value = o; document.getElementById(id + 'Out').textContent = `${Math.round(o * 100)} %`; });
}
['imgOpacity', 'mapOp'].forEach(id => document.getElementById(id).oninput = e => { prefs.imgOpacity = +e.target.value; savePrefs(); applyImgOpacity(); if (viewMode === '3d') { sync3DMenu(); refresh3D(); } });
applyImgOpacity();
const setOutside = v => { prefs.outside = v; savePrefs(); syncOutsideUi(); refreshImages(); syncBackgrounds(); if (viewMode === '3d') refresh3D(); };      // the 3D picture is made again too
['outside', 'vOutside'].forEach(id => document.getElementById(id).oninput = e => setOutside(+e.target.value));
syncOutsideUi();
document.getElementById('brightness').oninput = e => {
  prefs.bright = +e.target.value; savePrefs(); applyBrightness();
};
document.getElementById('styleNatural').onclick = () => setStyle('natural');
document.getElementById('styleFalse1').onclick = () => setStyle('false1');
document.getElementById('styleFalse2').onclick = () => setStyle('false2');

let storyTab = HASH_TAB || 'figures';     // tab in the right panel: Stats on start, then kept when switching glacier
/* The cards of the Switzerland tab: the same stack as in Discover; one open at a time, the choice remembered */
const scard = (key, icon, title, html) => `<details class="card dcard coll" name="swiss" data-card="${key}"${cardOpen(key) ? ' open' : ''}><summary><div class="card-h"><span class="ico">${ICONS[icon]}</span>${title}</div></summary><div class="dbody">${html}</div></details>`;
/* The selected glacier against all of Switzerland: its share of the ice (filled in when the volume is known), of the area, and its place among the glaciers of the inventory */
function shareBody(g){
  const inv = DATA && DATA.inventory, count = inv && inv.count, area = g.inv ? g.inv.area_km2 : null, rank = g.inv ? g.inv.rank : null;
  const areaPct = inv && area ? area / inv.area_km2 * 100 : null;
  const place = rank === 1 ? 'the largest' : rank ? `no. ${rank} by area` : '';
  return `<div class="stat-row" id="shareRow">
      <div class="stat hero wide has-per" tabindex="0"><span class="v" id="shIce">…</span><span class="k" id="shLab">of all Swiss glacier ice</span><span class="per" id="shNote"></span></div>
      ${areaPct !== null ? `<div class="stat has-per" tabindex="0"><span class="v">${areaPct < 10 ? areaPct.toFixed(1) : Math.round(areaPct)} %</span><span class="k">of glacier area</span><span class="per">${areaPct < 10 ? areaPct.toFixed(1) : Math.round(areaPct)} % of the total glaciated area of Switzerland${fn('sgi')}</span></div>` : ''}
      ${count ? `<div class="stat has-per" tabindex="0"><span class="v">1 of ${count.toLocaleString('en')}</span><span class="k">${place ? place.charAt(0).toUpperCase() + place.slice(1) : 'Swiss glaciers'}</span><span class="per">Of ${count.toLocaleString('en')} Swiss glaciers${place ? `, ${place}` : ''}${fn('sgi')}${inv.n_under_0_5km2 ? `. ${inv.n_under_0_5km2.toLocaleString('en')} of them are smaller than 0.5 km²` : ''}</span></div>` : ''}
    </div>
`;
}
/* The cards of the Discover tab lie in a stack, each over the foot of the one before, so only the titles show. A click opens one card (name= makes them exclusive). */
const dcard = (icon, title, html) => `<details class="card dcard coll" name="discover"><summary><div class="card-h"><span class="ico">${ICONS[icon]}</span>${title}</div></summary><div class="dbody">${html}</div></details>`;
function renderStory(){
  const g = currentGlacier();
  const [lo, hi] = state.mode === 'single' ? [state.one, state.one]
    : state.mode === 'timelapse' ? [Math.min(state.from, state.to), Math.max(state.from, state.to)]
    : [Math.min(state.a, state.b), Math.max(state.a, state.b)];
  const known = lo && hi;
  const inRange = VOLUME_LOSS.filter(n => n.y > lo && n.y <= hi);
  const lost = 1 - inRange.reduce((r, n) => r * (1 - n.v / 100), 1);
  const max = Math.max(...VOLUME_LOSS.map(n => n.v));

  let spanText = 'The melt seasons you select are shown in red. Pick two years to see what changed in between.';
  if (known && lo === hi) spanText = state.mode === 'single' ? `You are looking at ${lo}. Choose Compare or Timelapse to see the melt seasons between two years.` : `You selected only ${lo}. Pick two different years to see the melt seasons in between.`;
  else if (known) spanText = `In the <b>${hi - lo} melt season${hi - lo > 1 ? 's' : ''}</b> you selected (in red), Swiss glaciers lost <strong>${(lost * 100).toFixed(1)} %</strong> of their ice; ca. ${(iceVolume(lo) - iceVolume(Math.min(hi, VOLUME_LOSS[VOLUME_LOSS.length - 1].y))).toFixed(1)} km³.` +
    (inRange.length ? '' : '') +
    '';

  dynSources = [];
  const statsHtml = renderStats(g, lo, hi);

  const info = GLACIER_INFO[g.id] || GLACIER_INFO[shortSlug(g.name)];
  const tab = t => `role="tab" data-tab="${t}" aria-selected="${storyTab === t}"`;
  const storyEl = document.getElementById('story'), aboutOpen = !!(storyEl.querySelector('details.about') || {}).open, keepScroll = storyEl.scrollTop, sameGlacier = storyEl.dataset.glacier === g.id;
  storyEl.dataset.glacier = g.id; storyEl.classList.toggle('empty', !glacierPicked);
  const openCards = sameGlacier ? [...storyEl.querySelectorAll('details.coll[open]')].map(d => d.firstElementChild.textContent.trim()) : [];      // the cards you had open stay open when the panel is redrawn
  storyEl.innerHTML = `
    <div class="story-empty"><h2>Nothing selected yet</h2><p>Click a glacier on the map, or pick one from the list. Its story, figures and sources show up here.</p></div>
    <h2>${g.name} Glacier</h2>
    <p class="sub">${[g.local, g.canton, g.range].filter(Boolean).join(', ')}</p>
    <p class="lede">${g.lede.replace('by area,', `by area${fn('sgi')},`)}</p>

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
        (() => { const h = trailsHtml(g, TRAILS[g.id] ? g.id : shortSlug(g.name)); return h ? dcard('route', 'Hike and bike', h) : ''; })(),      // made once: it adds its sources to the list

        cbYears().length ? dcard('scene', 'Copernicus Browser', `<p>These are the satellite scenes on the map${fn('s2')}. Open one in the Copernicus Browser, the free viewer of the Copernicus Data Space Ecosystem, to zoom in, try other band combinations or look at neighbouring dates.</p><div class="cb-links">${cbButtonsHtml()}</div>`) : ''
      ].join('')}
    </div>

    <div class="tab-panel" data-panel="figures" ${storyTab === 'figures' ? '' : 'hidden'}>
      ${statsHtml}
      <div id="gWater"></div>
    </div>

    <div class="tab-panel" data-panel="swiss" ${storyTab === 'swiss' ? '' : 'hidden'}>
      ${scard('sw-share', 'flag', `${g.name} in perspective`, shareBody(g))}
      ${scard('sw-loss', 'change', 'Ice lost per year', `<div class="bars">
        ${VOLUME_LOSS.map(n => `
          <div class="bar ${n.y > lo && n.y <= hi ? 'in-range' : ''}">
            <span>${n.y}</span>
            <span class="track"><span class="fill" style="width:${n.v / max * 100}%"></span></span>
            <span class="v">${n.approx ? '≈' : ''}${n.v.toFixed(1)} %</span>
          </div>`).join('')}
      </div>
      <p class="span-note">${spanText}</p>`)}
      ${scard('sw-water', 'drop', 'How much water?', waterSection(lo, hi))}
      ${scard('sw-left', 'area', 'How much is left?', cumulativeChart(lo, hi))}
    </div>

    <div class="about-wrap">
      <div class="gh-invite"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg><span><b>Support the tongues!</b> The code is open: join in, build a dashboard for your own region, or <a href="https://github.com/braakhekke/tonguesfromspace/issues/new" target="_blank" rel="noopener">open an issue</a> to ask for a glacier, a question or your own text on a visual.<em><a href="https://github.com/braakhekke/tonguesfromspace" target="_blank" rel="noopener">github.com/braakhekke/<wbr>tonguesfromspace</a></em></span></div>
    <details class="about">
      <summary><span class="info-btn" aria-hidden="true">i</span> About Tongues from Space</summary>
      <details class="about-ch" name="aboutch" id="ch-1"><summary>Why Tongues from Space</summary><div class="about-sec">
        <p>A glacier ends in its tongue: the lowest stretch of ice, where the glacier is thinnest and melts the most. It is also where change is easiest to see. Every summer the tip pulls back and leaves bare rock, a lake or a new valley floor behind, and a satellite pixel of 10 m is fine enough to show it.</p>
        <p>I believe in pictures. A number can be read a hundred times without it staying with you, but a before-and-after image is understood at once and remembered. That is why the pictures come first here, and the figures sit next to them.</p>
        <p>I hope this dashboard sparks awareness of glaciers and of why they matter to society, for instance because of the water they store. That is why the ice is also shown in litres, swimming pools and Lake Zurich. — Jochem Braakhekke</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-2"><summary>The satellite images</summary><div class="about-sec">
        <p>One Sentinel-2 scene per glacier and year: the clearest view between 1 July and 20 September. Every acquisition is scored for cloud and snow cover; the best September scene wins, otherwise August, otherwise July. The pictures are rendered from Level-1C data with the Copernicus Browser true colour process, which keeps shaded slopes natural.</p>
        <p>For some glaciers the scene of each year was chosen with a separate picking tool instead (<code>tools/pick-scenes.html</code>). It scores every acquisition from 1 August to the middle of October for cloud, cloud shadow, mountain shadow, snow and haze, in the bottom 3 km of the tongue and over the whole image, prefers days near 30 September, and keeps one satellite orbit for all years. No cloud, cloud shadow or big mountain shadow is allowed in the bottom 3 km (the limits are loosened only for a year that would otherwise have no scene) and not more than 10 % cloud anywhere in the image.</p>
        <p>Why not after the 20th (for the automatic choice): Swiss glacier monitoring counts in glaciological years (1 October to 30 September) and GLAMOS measures at the end of the melt season, so September images match the annual figures. After about 20 September fresh snow often hides the tongue; in 2024 the limit is 14 September, because heavy snow fell on the 15th.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-3"><summary>Sentinel-2</summary><div class="about-sec">
        <p>Two European satellites of the Copernicus programme (2A since 2015, 2B since 2017), looking straight down on a strip 290 km wide.</p>
        <p><em>Spatial:</em> pixels of 10 m (blue, green, red and near infrared), 20 m (six bands) or 60 m (three). Details under about 10 m are invisible. Natural and False 1 use 10 m bands; False 2 uses 20 m bands and looks softer.</p>
        <p><em>Spectral:</em> 13 bands, from visible light (about 443 nm) to shortwave infrared (about 2190 nm).</p>
        <p><em>Temporal:</em> each satellite returns every 10 days, both together every 5 days at the equator and more often at higher latitudes. Over Aletsch we counted about 3 acquisitions a week and up to 4 (32, 33 and 41 days between 1 July and 20 September in 2023 to 2025). Clouds, shadow and fresh snow remove many of them.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-4"><summary>The colours</summary><div class="about-sec">
        <p>Each picture combines three bands as red, green and blue. False 1 and False 2 are false colours: the colours are a code, not what you would see.</p>
        <p><em>Natural</em> (B04, B03, B02): as our eyes see it. Snow white, rock grey, plants green.</p>
        <p><em>False 1</em> (B08, B04, B03), infrared: near infrared shown as red. Plants red, snow white, bare ice grey, water dark/blue; this sets bare ice, snow and vegetation apart.</p>
        <p><em>False 2</em> (B8A, B11, B12): snow and ice red, clouds white, rock pale, water black. Experimental, handy to tell ice from cloud.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-5"><summary>Why only these ten glaciers</summary><div class="about-sec">
        <p>${DATA && DATA.inventory ? `The Swiss Glacier Inventory ${DATA.latest_label} lists ${DATA.inventory.count.toLocaleString('en')} glaciers with a total area of ${Math.round(DATA.inventory.area_km2)} km². The ten largest hold ${DATA.inventory.top_share_pct} % of it; ${DATA.inventory.n_under_0_5km2.toLocaleString('en')} are smaller than 0.5 km² and ${DATA.inventory.n_under_0_1km2.toLocaleString('en')} smaller than 0.1 km².` : 'Switzerland has about 1,400 glaciers (GLAMOS), most of them small.'} With 10 m pixels a glacier of 0.1 km² is only about 1,000 pixels: its tongue is a few pixels wide, and a retreat of a few metres a year is less than one pixel. The ten largest have tongues many pixels wide that retreat by tens of metres, which shows clearly.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-6"><summary>Glacier figures</summary><div class="about-sec">
        <p>All from GLAMOS; a dash means no value. <em>Area:</em> Swiss Glacier Inventories ${DATA ? `${DATA.oldest_label} and ${DATA.latest_label}` : '1850 and 2016'}. When tributaries separate, part of an area drop is a change of definition, not only melt.${DATA ? '' : ' <em>The GLAMOS data file is not loaded yet.</em>'}</p>
        <p><em>Length change</em> is measured at the tongue; negative means retreat. GLAMOS publishes only the change between surveys, never the length, so the lengths are derived. The latest length is read from a GLAMOS overview figure, which prints one length per glacier; the year shown with it is where the last bar of that glacier ends in the figure (2025 for most, 2023 for Corbassière and Zmutt, which are surveyed every few years). "Length in 1870" (or the year of the first survey) is that length plus all the retreat recorded since then: for Aletsch 22.1 km + 3.4 km = about 25.5 km. It is exact only when the surveys follow each other without gaps and the survey data reach the year of the figure; otherwise the tile shows "≈" and the real value may differ by the retreat of the missing years.</p>
        <p>"Change between" adds up the surveys that lie completely inside the chosen years. The tile says when they cover a shorter period, because one survey can span several years and the newest data end before the newest images.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-7"><summary>Ice and water</summary><div class="about-sec">
        <p>Swiss glaciers held about 45.1 km³ of ice at the end of 2025 (GLAMOS, Swiss-wide series, which gives the volume of every year since 1915); the dashboard uses the years from 2016. 1 km³ of ice gives about 0.9 trillion litres of water. For one glacier, Grab et al.${fn('grab')} measured the ice around 2016. From there the dashboard uses what GLAMOS measured for this glacier: its volume survey (how much ice it lost between two elevation models) says how much ice one metre of yearly mass balance is worth for it, and the yearly balance (this glacier's own where it is measured, else the balance of all Swiss glaciers) spreads the loss over the years. Only the newest autumn follows the Swiss average. Big glaciers lose a smaller share than the Swiss average, which is dominated by small glaciers, so this gives more ice than a plain national percentage. That is a best estimate and not a measurement. Comparisons: Eiffel Tower 330 m high (with antennas, toureiffel.paris); football pitch 105 × 68 m = 7,140 m² (usual international size); city bus about 12 m long (standard bus, an articulated one is 18 m); Olympic swimming pool 50 × 25 × 2 m = 2.5 million litres; Lake Zurich 3.9 km³; Swiss water supply about 930 million m³ a year (SVGW).</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-8"><summary>Thickness and volume</summary><div class="about-sec">
        <p><em>Mean ice thickness change</em>, <em>volume change</em> and <em>mass balance</em> come from the GLAMOS volume-change survey of this glacier: aerial surveys give elevation models of the glacier surface, and the difference between two of them shows how much ice was lost in between. The period is the newest survey that starts closest to 2016; it is not your selected years. Mass balance is the volume change turned into metres of water per year with a density of 850 kg/m³; the ± is the uncertainty GLAMOS gives. Only surveys that cover at least 90 % of the glacier are used.</p>
        <p><em>Radar ice thickness</em> are single measurements from ground-penetrating radar, taken from the surface along lines, between 1958 and 2017 depending on the glacier. The map shows the mean of every 50 m cell. They tell how thick the ice was when it was measured; today it is thinner. <em>Latest thickest ice number, modelled around 2016</em> is the maximum of the ice thickness map of Grab et al.${fn('grab')} for this glacier, read from swisstopo. It is a model result and not a measurement: the radar lines are used to calibrate an ice-flow model that fills the gaps. The radar maximum is older and only a point on a line, so it stays in the note. The map layer "Ice thickness 2016 (modelled)" shows the whole map. The radar data are only a part of what is needed for the glacier ice volume of Grab et al.${fn('grab')}, which also uses models.</p>
        <p>The chart <em>Ice thickness change per year</em> shows the yearly mass balance from GLAMOS for the years of the images, as metres of ice (the balance in water divided by 0.85). Aletsch, Rhone, Corbassière and Findel are measured directly every year; for the other six glaciers the line of all Swiss glaciers is shown. The years you select in step 2 are marked and averaged. A mass balance is not the same measurement as a change of the surface height, but over decades the two add up to nearly the same. The tiles above the chart come from the elevation-model surveys, which cover several years each.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-10"><summary>The 3D view</summary><div class="about-sec">
        <p>A strip along the glacier, from 1 km below the tongue tip up to about 6.5 km up the glacier and 4 km wide, with the satellite picture of the chosen year draped over the terrain. The heights are the newest edition of swisstopo's swissALTI3D elevation model (served as tiles by Mapterhorn and stored with the page on a 14 m grid). Drag to turn and tilt, scroll or pinch to zoom; the layers menu, the measuring tools and the downloads work here as on the map.</p>
        <p><em>Ice surface of each year.</em> The elevation model shows the ice as it was when it was flown. For the years between and around the two editions swisstopo made of each area, the surface is an estimate: the change between the older edition (2019) and the newest one (2023 for the Valais, 2024 for the southern Bernese Alps) is shared over the years by the yearly mass balance of GLAMOS, and extended in the same way before and after. It is an estimate, not a measurement, and the page says so under the picture.</p>
        <p><em>Lakes.</em> In front of the Rhone, Findel and Zmutt glaciers a lake can have grown over ground that the model holds as a slope. Where the picture of a year shows water (found from its colour), the terrain there is set to the level of the lake that the model already holds, so the water lies flat. A lake without such a level in the model is left as it is.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-11"><summary>Old photographs</summary><div class="about-sec">
        <p>"Then and now" (3D view, one year) shows historic photographs of the lower tongue for eight glaciers: Aletsch, Gorner, Fiescher, Unteraar, Zmutt, Rhone, Findel and Fee. They come from the ETH Library's Bildarchiv; where the camera stood and looked was worked out by volunteers on Smapshot (HEIG-VD). Click a photograph, or a camera symbol on the terrain (switch it on in the dropdown), and the 3D view flies to that spot and looks the same way, with the same field of view. Drag the line to compare the photograph with the terrain of today.</p>
        <p>Only photographs whose date is known to about a year, and where the tongue is in the picture, were kept. Each photograph shows its own licence. A rod on the ice of today marks the estimated height of the ice surface then: from the thinning of the whole glacier in the GLAMOS volume surveys, and before the first survey from the 1850 area with area-volume scaling (Bahr et al. 1997). The range is wide and the figure is an estimate.</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-12"><summary>Aerial images and hiking trails</summary><div class="about-sec">
        <p><em>swisstopo aerial</em> (SWISSIMAGE) can be switched on in the layers menu; it shows only inside the image boxes of the ten glaciers, in the year you picked. The layer is a series of editions; the year it names is the year the photographs were taken, which can be earlier than the edition (the 2025 edition shows photographs from 2023 at Aletsch). Switch the Sentinel-2 picture off to see it alone.</p>
        <p><em>Hiking trails</em> come from swisstopo. The violet band marks where a person 1.7 m tall can see the glacier tongue from the trail (our own calculation from the elevation model; trees and buildings are not counted).</p>
      </div></details>
      <details class="about-ch" name="aboutch" id="ch-9"><summary>Sources</summary><div class="about-sec">
        <ol class="src-list">${SOURCE_LIST.map(k => `<li id="fn-${k}" title="Click to go back to the text">${SOURCES[k]()}</li>`).join('')}${dynSources.map((h, i) => `<li id="fn-g${i + 1}" title="Click to go back to the text">${h}</li>`).join('')}</ol>
      </div></details>
    </details>
    <!-- TODO: replace the placeholder profile URLs -->
    <div class="social" aria-label="Follow Tongues from Space"><a href="https://x.com/" target="_blank" rel="noopener" aria-label="X" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg></a><a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 21v-8h2.6l.4-3H14V8.3c0-.9.3-1.5 1.6-1.5H17V4.1C16.7 4.1 15.8 4 14.8 4 12.6 4 11 5.3 11 7.8V10H8.5v3H11v8z"/></svg></a><a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.8" cy="7.2" r="1.2"/></svg></a><a href="https://www.tiktok.com/" target="_blank" rel="noopener" aria-label="TikTok" title="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v10.5a3 3 0 1 1-3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 4c.4 2.4 1.8 3.8 4.2 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></a></div>
    </div>`;
  document.querySelectorAll('#story .tabs button').forEach(bt => bt.onclick = () => {
    storyTab = bt.dataset.tab;
    document.querySelectorAll('#story .tabs button').forEach(x => x.setAttribute('aria-selected', x === bt));
    document.querySelectorAll('#story .tab-panel').forEach(pn => pn.hidden = pn.dataset.panel !== storyTab);
    if (storyTab === 'swiss') { wireWater(); wireCum(); }
  });
  wireWater(); wireCum();
  renderGlacierWater(); renderShare(); fillThickness();
  restoringCards = true;
  storyEl.querySelectorAll('details.coll').forEach(d => { if (openCards.includes(d.firstElementChild.textContent.trim())) d.open = true; else if (sameGlacier && d.open) d.open = false; });
  setTimeout(() => { restoringCards = false; }, 100);
  if (aboutOpen) storyEl.querySelector('details.about').open = true;      // a year click must not close it or move the panel
  storyEl.scrollTop = sameGlacier ? keepScroll : 0;      // another glacier starts at the top
}

/* ---------- Copernicus Browser deep link ---------- */
function cbYears(){
  const ys = state.mode !== 'compare'
    ? [tlLayers[state.frame] ? tlLayers[state.frame].yr : state.to]
    : [state.a, state.b];
  return [...new Set(ys.filter(y => y && state.available[y]))].sort();
}
function copernicusBrowserUrl(year){
  const c = map.getCenter(), z = Math.round(map.getZoom()), d = state.available[year].date;
  const q = new URLSearchParams({
    zoom: z, lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), themeId: 'DEFAULT-THEME',
    datasetId: 'S2_L2A_CDAS', layerId: '1_TRUE_COLOR',
    fromTime: `${d}T00:00:00.000Z`, toTime: `${d}T23:59:59.999Z`
  });
  return 'https://browser.dataspace.copernicus.eu/?' + q.toString();
}
/* the buttons of the Copernicus Browser card: one per scene on show */
function cbButtonsHtml(){ return cbYears().map(y => `<button type="button" class="cb" data-year="${y}">Open ${fmtDate(state.available[y].date)} in Copernicus Browser</button>`).join(''); }
document.getElementById('story').addEventListener('click', e => {
  const b = e.target.closest('.cb');
  if (b) window.open(copernicusBrowserUrl(+b.dataset.year), '_blank', 'noopener');
});

/* ---------- 8 key figures, the same for every glacier ---------- */
const ICONS = {
  area:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l6-3 9 3 1 9-7 4-9-4z"/></svg>',
  length: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M3 8v8M21 8v8M8 12v-2.5M12 12v-3.5M16 12v-2.5"/></svg>',
  change: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l7 7 4-4 7 8M21 11v6h-6"/></svg>',
  past:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg>',
  now:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19a9 9 0 0 1 0-14M19 5a9 9 0 0 1 0 14M8.5 15.5a4 4 0 0 1 0-7M15.5 8.5a4 4 0 0 1 0 7"/><circle cx="12" cy="12" r="1.5"/></svg>',
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
const lnk = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t || u}</a>`;
const SOURCES = {
  sgi:    () => `GLAMOS: Swiss Glacier Inventory, editions SGI1850, SGI1973, SGI2016 and SGI2023 (areas, outlines, ranking by area). CC BY 4.0. ${lnk('https://www.glamos.ch', 'glamos.ch')}${DATA ? `. Downloaded for this site on ${DATA.generated}` : ''}.`,
  lc:     () => `GLAMOS: Glacier length change, release 2025. ${lnk('https://doi.org/10.18750/lengthchange.2025.r2025', 'doi:10.18750/lengthchange.2025.r2025')}. Non-commercial use. Length today: GLAMOS, ${lnk('https://doi.glamos.ch/figures/lc_stat_frequency.pdf', 'figure lc_stat_frequency')}.`,
  vc:     () => `GLAMOS: Glacier volume change (comparison of aerial elevation models), release 2025. ${lnk('https://doi.org/10.18750/volumechange.2025.r2025', 'doi:10.18750/volumechange.2025.r2025')}. Non-commercial use. The period of each survey is its own (for example 2015–2023) and is not the period of the image series.`,
  swiss:  () => `GLAMOS: Swiss-wide glacier volume and mass balance, release 2025. ${lnk('https://doi.org/10.18750/massbalance.swisswide.2025.r2025', 'doi:10.18750/massbalance.swisswide.2025.r2025')}. Non-commercial use. Years after the last release: GLAMOS and SCNAT annual reports.`,
  mb:     () => `GLAMOS: Glaciological mass balance of single glaciers (Aletsch, Rhone, Corbassière, Findel), release 2025. ${lnk('https://doi.org/10.18750/massbalance.2025.r2025', 'doi:10.18750/massbalance.2025.r2025')}. Non-commercial use.`,
  radar:  () => `GLAMOS: Glacier ice thickness from ground-penetrating radar, release 2020. ${lnk('https://doi.org/10.18750/icethickness.2020.r2020', 'doi:10.18750/icethickness.2020.r2020')}. CC BY 4.0. Measured between 1958 and 2017, depending on the glacier.`,
  grab:   () => `Grab, M. et al. (2021), ${lnk('https://www.cambridge.org/core/journals/journal-of-glaciology/article/ice-thickness-distribution-of-all-swiss-glaciers-based-on-extended-groundpenetrating-radar-data-and-glaciological-modeling/CB6685222A664FD3FCE1367E2B5245D8', 'Ice thickness distribution of all Swiss glaciers based on extended ground-penetrating radar data and glaciological modeling')}, Journal of Glaciology 67(266). Modelled ice thickness and ice volume of Swiss glaciers around 2016, read from the ice thickness layer of ${lnk('https://map.geo.admin.ch', 'swisstopo')}. A model result, not a measurement.`,
  s2:     () => `Copernicus Sentinel-2, Level-1C (pictures) and Level-2A (scene choice), contains modified Copernicus Sentinel data, via the ${lnk('https://dataspace.copernicus.eu', 'Copernicus Data Space Ecosystem')}.`,
  terrain:() => `swissALTI3D © ${lnk('https://www.swisstopo.admin.ch', 'swisstopo')} (open government data), served as terrain tiles by ${lnk('https://mapterhorn.com/attribution', 'Mapterhorn')}. Peak names: swissNAMES3D © swisstopo.`,
  routes: () => `SchweizMobil route data of the Federal Roads Office (ASTRA), via ${lnk('https://map.geo.admin.ch', 'swisstopo geo.admin.ch')}; hiking trails: swissTLM3D © swisstopo.`,
  photos: () => `Historic photographs in the 3D view (eight glaciers: Aletsch, Gorner, Fiescher, Unteraar, Zmutt, Rhone, Findel, Fee): ETH Library, Bildarchiv (${lnk('https://ba.e-pics.ethz.ch', 'e-pics')}), CC BY-SA 4.0 (each photo shows its own licence), the place and angles of the camera by volunteers on ${lnk('https://smapshot.heig-vd.ch', 'Smapshot')} (HEIG-VD).`,
  bg:     () => `Background maps: Sentinel-2 cloudless ${BG_YEAR} by EOX (CC BY-NC-SA 4.0); map and place labels © OpenStreetMap contributors, labels rendered by EOX; colour topographic map and swissALTI3D hillshade © swisstopo.`,
  water:  () => `Swiss water supply of about 930 million m³ a year: SVGW (Swiss Gas and Water Industry Association). Other comparisons: Eiffel Tower 330 m with antennas (${lnk('https://www.toureiffel.paris', 'toureiffel.paris')}), football pitch 105 × 68 m, city bus about 12 m, Olympic pool 50 × 25 × 2 m, Lake Zurich 3.9 km³.`,
  me:     () => `This project: code under the MIT licence, own texts under CC BY 4.0, open on ${lnk('https://github.com/braakhekke/tonguesfromspace', 'GitHub')}.`
};
const SOURCE_LIST = Object.keys(SOURCES);
/* a small raised number in the text; the click opens About, the chapter Sources and shows the entry (a back-link returns to the text) */
let fnSeq = 0;
/* Sources that belong to one glacier (the fact, the name, the hikes) are numbered after the general ones and listed with them in About; the list is made again with every redraw of the panel */
let dynSources = [];
const gfn = html => { dynSources.push(html); const n = SOURCE_LIST.length + dynSources.length; return `<sup class="fn"><a href="#fn-g${dynSources.length}" id="fnr-g${dynSources.length}-${++fnSeq}" data-fn="g${dynSources.length}" aria-label="Source ${n}">${n}</a></sup>`; };
const fn = k => `<sup class="fn"><a href="#fn-${k}" id="fnr-${k}-${++fnSeq}" data-fn="${k}" aria-label="Source ${SOURCE_LIST.indexOf(k) + 1}">${SOURCE_LIST.indexOf(k) + 1}</a></sup>`;
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[data-fn]'); if (!a) return;
  e.preventDefault();
  const about = document.querySelector('#story details.about'), ch = document.getElementById('ch-9'), li = document.getElementById('fn-' + a.dataset.fn);
  if (!about || !ch || !li) return;
  about.open = true; ch.open = true;
  document.querySelectorAll('#story .src-list li.hit').forEach(x => x.classList.remove('hit'));
  li.classList.add('hit'); li.dataset.back = a.id;
  li.scrollIntoView({block: 'center', behavior: 'smooth'});
});
document.addEventListener('click', e => {
  const li = e.target.closest && e.target.closest('.src-list li[data-back]'); if (!li || e.target.closest('a')) return;
  const back = document.getElementById(li.dataset.back); if (back) back.scrollIntoView({block: 'center', behavior: 'smooth'});
});
const ok = v => v != null && !isNaN(v);
const fmtM = m => ok(m) ? `${m < 0 ? '−' : m > 0 ? '+' : ''}${Math.abs(m).toLocaleString('en').replace(/,/g, '\u202f')} m` : null;
function stats(g, lo, hi){
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
    if (!(lo && hi && hi > lo)) rangeHint = 'pick two different years';
    else {
      const inside = L.series.filter(r => r[0] >= lo && r[1] <= hi);
      if (!inside.length) rangeHint = 'no survey lies inside this range';
      else {
        range = inside.reduce((t, r) => t + r[2], 0);
        const c0 = inside[0][0], c1 = inside[inside.length - 1][1];
        if (c0 !== lo || c1 !== hi) cover = `Surveys cover ${c0}–${c1}`;
      }
    }
  } else if (L) rangeHint = 'glacier data needs a rebuild';
  // ice volume: the newest GLAMOS volume survey of this glacier (comparison of two elevation models) and the radar thickness measurements
  const V = inv && inv.volume, R = inv && inv.radar, volHint = inv ? 'no volume survey by GLAMOS' : 'glacier data not loaded yet';
  const per = V ? `${V.from}–${V.to}` : '';
  const m1 = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}`;
  // everything since the first elevation model of this glacier: the longest survey that ends with the newest one
  const okS = V && V.series ? V.series.filter(r => r[6] >= 90 && r[1] > r[0]) : [], endS = okS.length ? Math.max(...okS.map(r => r[1])) : 0;
  const all = okS.filter(r => r[1] === endS).sort((a, b) => a[0] - b[0])[0];
  const lostArea = ok(a1850) && ok(aRef) && a1850 > aRef ? a1850 - aRef : null;
  /* Every card starts with one hero tile: the big red number that is also shown when the card is closed. */
  return {
    volume: [
      ...(all ? [{hero:true, ico:'down', k:`Ice thickness lost since ${all[0]}`, fn:'vc', loss:true, wide:true, v:`${all[3] < 0 ? '−' : '+'}${Math.round(Math.abs(all[3]))} m`,
        sym:{kind:'tower', frac: Math.abs(all[3]) / EIFFEL_M, big:'', small:`${Math.round(Math.abs(all[3]) / EIFFEL_M * 100)} % of the height of the Eiffel Tower`}}] : []),
      {ico:'down', k:'Thickness', kk:'Thickness change', per, fn:'vc', loss:true, v: V ? `${m1(V.dh_m)} m` : null, hint:volHint},
      {ico:'sum',  k:'Volume', kk:'Volume change', per, fn:'vc', loss:true, v: V ? `${V.dV_km3 < 0 ? '−' : '+'}${Math.abs(V.dV_km3).toFixed(Math.abs(V.dV_km3) < 0.1 ? 3 : 2)} km³` : null, hint:volHint},
      {ico:'drop', k:'Balance', kk:'Mass balance per year', per, fn:'vc', loss:true, v: V ? `${V.bal_mwe_a < 0 ? '−' : '+'}${Math.abs(V.bal_mwe_a).toFixed(2)} m w.e.` : null, sub: V ? `± ${V.sigma.toFixed(2)}` : '', hint:volHint},
      {ico:'flag', k:'Thickest ice', per:'around 2016', v: R ? `${R.max_m} m` : null, hint:'not measured directly by radar', slot:'thick', wide:true, act: R && R.max_at ? 'radar-max' : '', actText: R && R.max_at ? `${R.max_m} m in ${R.max_year || 'the survey'} (radar)` : ''}
    ],
    area: [
      ...(lostArea ? [{hero:true, ico:'down', k:'Area lost since 1850', fn:'sgi', loss:true, wide:true, v:`${(aRef - a1850).toFixed(1).replace('-', '−')} km²`,
        sub:`${((aRef - a1850) / a1850 * 100).toFixed(0).replace('-', '−')} %`, sym:{kind:'pitch', big:`× ${fmtCount(lostArea * 1e6 / PITCH_M2)}`, small:'football pitches'}}]
        : [{hero:true, ico:'down', k:'Area change since 1850', loss:true, wide:true, v:null, hint:'glacier data not loaded yet'}]),
      {ico:'past', k:'About 1850', tip:'Area around 1850, Swiss Glacier Inventory', fn:'sgi', v:km2(a1850)},
      {ico:'now',  k:`${refY}`, tip:`Area in ${refY}, Swiss Glacier Inventory`, v:km2(aRef)}
    ],
    length: [
      ...(L ? [{hero:true, ico:'sum', k:`Length lost since ${L.first_year}`, fn:'lc', loss:true, wide:true, v: fmtM(L.total_m),
        sym: L.total_m < 0 ? {kind:'bus', big:`× ${fmtCount(-L.total_m / BUS_M)}`, small:'city buses, end to end'} : null}]
        : [{hero:true, ico:'sum', k:'Length change', loss:true, wide:true, v:null, hint:lcHint}]),
      ...(nowKm != null && firstKm != null ? [
        {ico:'flag', k:`Length in ${L.first_year}`, tip: exact ? 'Derived from the GLAMOS length changes' : 'Approximate: derived from the GLAMOS length changes', v:`${exact ? '' : '≈ '}${firstKm.toFixed(1)} km`, hint:lcHint},
        {ico:'now',  k:`Length in ${nowYear}`, tip:'Latest length, read from a GLAMOS overview figure', v:`${nowKm.toFixed(1)} km`, hint:lcHint}
      ] : []),
      {ico:'now',  k: lo && hi && hi > lo ? `Change ${lo}–${hi} (your selection)` : 'Change in your selection', loss:true, wide:true,
       v: range !== null ? fmtM(Math.round(range)) : null, hint:rangeHint, cover}
    ]
  };
}
/* Mean ice thickness change per year of one glacier, from the GLAMOS volume surveys (volume.series: [from, to, dV, dh, balance, sigma, covered %]).
   One bar per survey period, as wide as the period. Surveys overlap (the same glacier is compared from several older surveys), so the chain starts at the
   newest survey and goes back, each time taking the shortest survey that ends where the previous one starts. Gaps end the chain. */
function thinningChain(g){
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
const fmtRate = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}`;
/* The chart covers the years of the images, FIRST_YEAR to the last year with data. Every year is one slot, centred on its number: the bar of 2019 is the
   hydrological year Oct 2018 - Sep 2019, which ends in the autumn of the 2019 image. The elevation-model surveys (the tiles above the chart) are not drawn here: a survey spans many years and its mean says nothing about single years.
   The years you select in step 2 are marked, and the line below the chart gives their yearly mean (from the yearly values, not from the survey periods). */
/* One year chosen: the user can pick two bars on the chart for a range (first and last bar, both inside the marked range). {g, bar} after the first tap, {g, lo, hi} after the second. */
let chartPick = null;
function thinningChart(g, lo, hi){
  if (chartPick && (chartPick.g !== g.id || state.mode !== 'single')) chartPick = null;
  const pending = chartPick && !chartPick.hi, picked = chartPick && chartPick.hi;
  if (pending) { lo = chartPick.bar - 1; hi = chartPick.bar; }            // the tapped bar is in the marked area from the first tap
  if (picked) { lo = chartPick.lo; hi = chartPick.hi; }
  const own = g.inv && g.inv.balance && g.inv.balance.length ? g.inv.balance : null, ann = own || (DATA && DATA.swiss_balance) || [];
  const annLabel = own ? 'this glacier' : 'all Swiss glaciers';
  const first = FIRST_YEAR, last = Math.max(first, ...ann.map(r => r[0]));
  const yrs = ann.filter(r => r[0] >= first && r[0] <= last).map(([y, mm]) => ({y, mm, ice: mm / 1000 / 0.85}));
  if (!yrs.length) return '';
  const x0 = first - 0.5, x1 = last + 0.5;
  const W = 340, H = 180, L = 38, R = 12, T = 16, B = 28;
  const worst = Math.min(...yrs.map(r => r.ice), -0.5), best = Math.max(0, ...yrs.map(r => r.ice));
  const step = worst > -1.5 ? 0.5 : 1, floor = Math.floor(worst / step) * step, ceil = Math.ceil(best / step) * step;
  const X = y => L + (y - x0) / (x1 - x0) * (W - L - R), Y = v => T + (ceil - v) / (ceil - floor || 1) * (H - T - B);
  const ticks = []; for (let v = ceil; v >= floor - 1e-9; v -= step) ticks.push(v);
  const yt = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? 'var(--rock)' : 'var(--rule)'}"/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v === 0 ? '0' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(step < 1 ? 1 : 0)}</text>`).join('');
  const xt = Array.from({length: last - first + 1}, (_, i) => first + i).map(y => `<text x="${X(y)}" y="${H - 9}" text-anchor="middle">${y}</text>`).join('');
  // the selection: a band over the slots of the melt seasons between the two years, or the one slot of a single year
  const sa = lo && hi ? (hi > lo ? lo + 0.5 : lo - 0.5) : null, sb = lo && hi ? (hi > lo ? hi + 0.5 : lo + 0.5) : null;
  const band = sa !== null && sb > x0 && sa < x1 ? (() => { const a = Math.max(sa, x0), b = Math.min(sb, x1);
    return `<rect x="${X(a)}" y="${T}" width="${X(b) - X(a)}" height="${H - T - B}" fill="var(--accent)" opacity=".13"/><rect x="${X(a)}" y="${H - B - 4}" width="${X(b) - X(a)}" height="4" fill="var(--accent)"/>`; })() : '';
  const bw = (W - L - R) / (x1 - x0) - 1;
  const yearBars = yrs.map(r => {
    const y = Y(r.ice), inSel = sa !== null && r.y - 0.5 >= sa - 1e-9 && r.y + 0.5 <= sb + 1e-9;
    return `<rect class="dh-bar" tabindex="0" data-y="${r.y}" data-t="${r.y - 1}/${String(r.y).slice(2)} (until autumn ${r.y}), ${annLabel}: ${fmtRate(r.ice)} m of ice (${(r.mm / 1000).toFixed(2).replace('-', '−')} m w.e.)" x="${X(r.y) - bw / 2}" y="${Math.min(Y(0), y)}" width="${bw}" height="${Math.max(0.8, Math.abs(y - Y(0)))}" fill="${inSel ? 'var(--accent)' : own ? 'var(--crevasse)' : '#7C8A91'}"/>`;
  }).join('');
  // yearly mean in the selection
  const sel = lo && hi ? yrs.filter(r => hi > lo ? r.y > lo && r.y <= hi : r.y === lo) : [];
  let intro = 'Tap or hover a bar.';
  if (lo && hi) {
    const want = hi > lo ? hi - lo : 1;
    if (!sel.length) intro = `${hi > lo ? `${lo}–${hi}` : lo}: no yearly values yet. Tap or hover a bar.`;
    else {
      const tot = sel.reduce((t, r) => t + r.ice, 0), part = sel.length < want;
      intro = hi > lo
        ? `Selected ${lo}–${hi}${part ? ` (only ${sel.length} of ${want} years have values)` : ''}: ${fmtRate(tot / sel.length)} m of ice a year, ${tot < 0 ? '−' : '+'}${Math.abs(tot).toFixed(1)} m in ${sel.length} year${sel.length > 1 ? 's' : ''} (${annLabel}).`
        : `${lo}: ${fmtRate(tot)} m of ice (${annLabel}). ${state.mode === 'single' ? 'Tap a bar as start year and another as end year to see the mean in between.' : 'Pick two different years to see the mean in between.'}`;
    }
  }
  if (pending) intro = `Start: ${chartPick.bar - 1}/${String(chartPick.bar).slice(2)}. Tap another bar for the end, or the same bar again for just that year.`;
  return `<figure class="cum dh-chart" data-intro="${intro}">
    <figcaption class="dh-title">Ice thickness change per year, ${first} to ${last}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ice thickness change per year of ${g.local || g.name}, ${first} to ${last}: ${yrs.map(r => `${r.y} ${fmtRate(r.ice)} m`).join(', ')}">
      ${band}${yt}${yearBars}${xt}${pending || picked ? (pending ? [lo + 0.5] : [lo + 0.5, hi + 0.5]).map(x => `<path d="M${X(x)} ${T - 2}V${H - B + 3}" stroke="var(--accent)" stroke-width="2"/><circle cx="${X(x)}" cy="${T - 2}" r="3.5" fill="var(--accent)"/>`).join('') : ''}
      <text x="2" y="${T - 6}" text-anchor="start">m of ice a year</text>
    </svg>
    <div class="cum-read dh-read">${intro}</div>
    <figcaption class="dh-key"><span class="dh-key-i"><span class="k ${own ? 'k-own' : 'k-swiss'}"></span>Every year, ${annLabel}${own ? ' (direct measurements)' : ''}</span>
      ${sa !== null ? '<span class="dh-key-i"><span class="k k-sel"></span>Your selection</span>' : ''}${state.mode === 'single' ? `<button type="button" class="tile-link dh-reset"${chartPick ? '' : ' hidden'}>Reset the range</button>` : ''}</figcaption>
    <figcaption>Yearly bars are the mass balance (GLAMOS)${fn('mb')} as metres of ice, balance ÷ 0.85; they are not the same measurement as a height change, but add up to nearly the same over decades.${own ? '' : ' This glacier is not measured directly, so the line of all Swiss glaciers is shown instead.'}</figcaption>
  </figure>`;
}
document.addEventListener('click', e => {          // "Show on map" in the stats: layer on, fly to the thickest ice measurement, open its label
  if (!e.target.closest || !e.target.closest('[data-act="radar-max"]')) return;
  const g = currentGlacier(), R = g && g.inv && g.inv.radar, t = document.getElementById('maxToggle');
  if (!R || !R.max_at) return;
  if (t.checked) { t.checked = false; t.dispatchEvent(new Event('change')); return; }      // second click closes it again
  t.checked = true; t.dispatchEvent(new Event('change'));
  document.getElementById('map').scrollIntoView({block:'center', behavior:'smooth'});
  map.flyTo(R.max_at, Math.max(map.getZoom(), 15), {duration:1.2});
});
document.addEventListener('click', e => {          // one year shown: two taps on the bars choose a range
  if (state.mode !== 'single' || !e.target.closest) return;
  if (e.target.closest('.dh-reset')) { chartPick = null; renderStory(); return; }
  const bar = e.target.closest('.dh-bar'); if (!bar) return;
  const y = +bar.dataset.y, g = currentGlacier();
  if (!chartPick || chartPick.hi) chartPick = {g: g.id, bar: y};      // the first tap marks the start of that bar
  else { chartPick.lo = Math.min(chartPick.bar, y) - 1; chartPick.hi = Math.max(chartPick.bar, y); }      // both tapped bars are inside the range
  renderStory();
});
document.addEventListener('pointerover', e => {
  const bar = e.target.closest && e.target.closest('.dh-bar');
  if (!bar) return;
  const fig = bar.closest('.dh-chart');
  fig.querySelector('.dh-read').textContent = bar.dataset.t;
  fig.querySelectorAll('.dh-bar').forEach(b => b.style.outline = b === bar ? '1px solid var(--rock)' : '');
});
document.addEventListener('pointerout', e => {          // back to the line about your selection
  const bar = e.target.closest && e.target.closest('.dh-bar');
  if (!bar || (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.dh-bar'))) return;
  const fig = bar.closest('.dh-chart');
  fig.querySelector('.dh-read').textContent = fig.dataset.intro;
  fig.querySelectorAll('.dh-bar').forEach(b => b.style.outline = '');
});
document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('dh-bar')) e.target.dispatchEvent(new PointerEvent('pointerover', {bubbles:true})); });
/* Symbols that make a loss easy to grasp. Thickness: the Eiffel Tower (330 m) whose top, as many metres as the glacier lost in thickness, is melting away.
   Area: football pitches. Length: city buses end to end. Water: Olympic swimming pools. Sizes: pitch 105 x 68 m, bus 12 m, pool 50 x 25 x 2 m = 2.5 million litres. */
const TOWER_SHAPE = '<path d="M30 0 C31 55 34 100 41 126 C45 138 52 150 58 160 L46 160 C42 146 36 138 30 138 C24 138 18 146 14 160 L2 160 C8 150 15 138 19 126 C26 100 29 55 30 0 Z"/><rect x="15" y="130.5" width="30" height="3"/><rect x="22" y="101.5" width="16" height="3"/><rect x="26.5" y="24.5" width="7" height="2.5"/>';
function towerSvg(frac){
  const cut = (160 * Math.max(0.05, Math.min(0.9, frac))).toFixed(1);
  return `<svg class="sym sym-tower" viewBox="-2 -2 84 166" aria-hidden="true"><defs>
    <linearGradient id="melt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8322A" stop-opacity=".08"/><stop offset="1" stop-color="#C8322A" stop-opacity=".55"/></linearGradient>
    <clipPath id="tw-top"><rect x="-4" y="-4" width="100" height="${(+cut + 4).toFixed(1)}"/></clipPath><clipPath id="tw-bot"><rect x="-4" y="${cut}" width="100" height="200"/></clipPath></defs>
    <g fill="#6E818B" clip-path="url(#tw-bot)">${TOWER_SHAPE}</g>
    <g fill="url(#melt)" stroke="#C8322A" stroke-width="1.6" stroke-dasharray="3 2.2" clip-path="url(#tw-top)">${TOWER_SHAPE}</g>
    <path d="M68 .5 H74 V${cut} H68" fill="none" stroke="#C8322A" stroke-width="1.4"/></svg>`;
}
const SYM_SVG = {
  pitch: '<svg class="sym sym-pitch" viewBox="0 0 105 68" aria-hidden="true"><rect width="105" height="68" rx="3" fill="#5E9A5B"/><g fill="none" stroke="#fff" stroke-width="1" opacity=".9"><rect x="2.5" y="2.5" width="100" height="63"/><path d="M52.5 2.5v63"/><circle cx="52.5" cy="34" r="9"/><rect x="2.5" y="13.8" width="16.5" height="40.4"/><rect x="86" y="13.8" width="16.5" height="40.4"/><rect x="2.5" y="24.8" width="5.5" height="18.4"/><rect x="97" y="24.8" width="5.5" height="18.4"/></g></svg>',
  bus: '<svg class="sym sym-bus" viewBox="0 0 120 44" aria-hidden="true"><rect x="2" y="4" width="116" height="30" rx="7" fill="#F2C230"/><g fill="#34505E"><rect x="9" y="9" width="14" height="12" rx="2"/><rect x="26" y="9" width="14" height="12" rx="2"/><rect x="43" y="9" width="14" height="12" rx="2"/><rect x="60" y="9" width="14" height="12" rx="2"/><rect x="77" y="9" width="14" height="12" rx="2"/><rect x="96" y="9" width="17" height="14" rx="3"/></g><rect x="2" y="26" width="116" height="3" fill="#C8322A"/><circle cx="28" cy="35" r="7" fill="#2B3A42"/><circle cx="28" cy="35" r="3" fill="#9AA6AC"/><circle cx="92" cy="35" r="7" fill="#2B3A42"/><circle cx="92" cy="35" r="3" fill="#9AA6AC"/></svg>',
  pool: '<svg class="sym sym-pool" viewBox="0 0 100 52" aria-hidden="true"><rect x="1" y="1" width="98" height="50" rx="4" fill="#5FB8D9" stroke="#9AA6AC" stroke-width="2"/><path d="M1 7.25H99M1 13.5H99M1 19.75H99M1 26H99M1 32.25H99M1 38.5H99M1 44.75H99" stroke="#fff" stroke-width="1.2" opacity=".85"/></svg>'
};
/* one line under a figure: the symbol, a big "x N" (or text for the tower) and what it counts */
const symHtml = y => `<div class="sym-row">${y.kind === 'tower' ? towerSvg(y.frac) : SYM_SVG[y.kind]}<div class="sym-txt">${y.big ? `<b>${y.big}</b>` : ''}<small>${y.small}</small></div></div>`;
const fmtCount = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n >= 1000 ? (Math.round(n / 10) * 10).toLocaleString('en') : n >= 10 ? String(Math.round(n)) : n.toFixed(1);
/* The four stat cards (Area, Length, Ice thickness and volume, Ice and water) open and close; closed, each shows its headline figure. The choice is remembered. */
const maxLinkText = txt => document.getElementById('maxToggle').checked ? 'Close thickest measurement' : `Show thickest measurement on the map: ${txt}`;
/* A card that opens closes the one above (name="..."), which shifts the page up: put the title of the new card back in view */
let restoringCards = false;
function keepTitleVisible(d){
  const sum = d.firstElementChild, story = $('story'), scr = story.scrollHeight > story.clientHeight + 2 && getComputedStyle(story).overflowY !== 'visible' ? story : null;
  const fix = () => {
    const top = scr ? scr.getBoundingClientRect().top : 0, r = sum.getBoundingClientRect().top - top - 8;
    if (r < 0) (scr || window).scrollBy({top: r, behavior: 'smooth'});
  };
  requestAnimationFrame(() => requestAnimationFrame(fix));
}
const cardOpen = k => !!(prefs.cards && prefs.cards[k]);
document.addEventListener('toggle', e => {
  const d = e.target;
  if (restoringCards) return;
  if (d.matches && d.matches('details.coll') && d.open) keepTitleVisible(d);
  if (!d.matches || !d.matches('details.coll[data-card]')) return;
  prefs.cards = {...(prefs.cards || {}), [d.dataset.card]: d.open}; savePrefs();
}, true);
function renderStats(g, lo, hi){
  const S = stats(g, lo, hi);
  const group = (key, title) => { return `
    <details class="stat-group dcard coll" name="stats" data-card="${key}"${cardOpen(key) ? ' open' : ''}>
      <summary><h4><span class="ico">${ICONS[key]}</span>${title}</h4></summary><div class="dbody">
      <div class="stat-row ${key}">${S[key].map(t => `
        <div class="stat${t.hero ? ' hero' : ''}${t.loss && t.v ? ' loss' : ''}${t.wide ? ' wide' : ''}${(t.per || t.tip) && !t.hero && !t.wide ? ' has-per' : ''}"${t.slot ? ` data-slot="${t.slot}"` : ''}${(t.per || t.tip) && !t.hero && !t.wide ? ' tabindex="0"' : ''}>
          <span class="v">${t.v ?? '—'}${t.v && t.sub && (!t.per || t.wide) ? ` <small>${t.sub}</small>` : ''}</span>
          <span class="k"><i class="mini">${ICONS[t.ico]}</i>${t.k}${t.fn ? fn(t.fn) : ''}</span>
          ${t.per ? `<span class="per">${t.per}${t.v && t.sub && !t.wide ? ` · ${t.sub}` : ''}</span>` : t.tip && !t.wide ? `<span class="per">${t.tip}</span>` : ''}
          ${t.v && t.sym ? symHtml(t.sym) : ''}
          ${!t.v && t.hint ? `<span class="k note">${t.hint}</span>` : ''}
          ${t.v && t.cover ? `<span class="k note">${t.cover}</span>` : ''}
          ${t.v && t.act ? `<button type="button" class="tile-link" data-act="${t.act}" data-text="${t.actText}"><span class="tl-t">${maxLinkText(t.actText)}</span>${fn('radar')}</button>` : ''}
        </div>`).join('')}
      </div>
      ${key === 'volume' ? thinningChart(g, lo, hi) : ''}
    </div></details>`; };
  return `<div class="stats">${group('area','Area')}${group('length','Length')}${group('volume','Thickness and volume')}</div>`;
}
/* ---------- ice volume of the selected glacier: Grab et al. (2021), from the swisstopo map service ----------
   map.geo.admin.ch shows area, volume and maximum / mean ice thickness per glacier for the thickness layer.
   The page asks that service for the glacier at its tongue and keeps a value only if
   - the returned glacier name matches the selected glacier,
   - the volume, read as km³ / million m³ / m³ by its size, gives a mean thickness of 10-500 m for the area. */
const glacierVolume = (() => {
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
const iceShareLeft = () => iceVolume(VOLUME_LOSS[VOLUME_LOSS.length - 1].y) / iceVolume(2016);
/* The ice of one glacier in autumn `year`, in km³. v is its volume from the Grab et al. (2021) map (glacierVolume), the state of year R (v.yr, 2016 if unknown).
   Three measurements are combined:
   - the GLAMOS volume survey of this glacier (g.inv.volume: from, to, dV_km3): how much ice it really lost in that period;
   - the yearly mass balance (m w.e.): this glacier's own where GLAMOS measures it every year (Aletsch, Rhone, Corbassière, Findel), else that of all Swiss glaciers;
   - the Grab volume as the starting point.
   The survey says how much ice one metre of balance is worth for this glacier: c = dV / (sum of the balances in the survey period), in km³ per m w.e. Every
   other year is then loss = c x balance of that year, counted from R forwards or backwards. After the last year with a balance (the newest autumn) the Swiss
   volume curve continues. Without a survey the 2016 volume is scaled with the Swiss ice of that year, as before. Either way an estimate. */
const volumeSurvey = g => { const V = g && g.inv && g.inv.volume; return V && V.covered_pct >= 90 && V.dV_km3 < 0 ? V : null; };
function balanceModel(g){          // {bal(year) in m w.e. or undefined, own: this glacier's own series is used, c: km³ ice per m w.e.} or null
  const V = volumeSurvey(g), swiss = DATA && DATA.swiss_balance;
  if (!V || !swiss || !swiss.length) return null;
  const sm = new Map(swiss), own = g.inv.balance ? new Map(g.inv.balance) : null;
  let useOwn = !!own;
  for (let y = V.from + 1; y <= V.to && useOwn; y++) if (!own.has(y)) useOwn = false;
  const bal = y => { const b = useOwn && own.has(y) ? own.get(y) : sm.get(y); return b === undefined ? undefined : b / 1000; };
  let S = 0;
  for (let y = V.from + 1; y <= V.to; y++) { const b = bal(y); if (b === undefined) return null; S -= b; }
  if (!(S > 0)) return null;
  return { bal, own: useOwn, c: -V.dV_km3 / S };
}
function glacierIceAt(g, v, year){
  const R = v.yr || 2016, M = balanceModel(g);
  if (!M) return v.km3 * iceVolume(year) / iceVolume(R);
  let vol = v.km3;
  if (year > R) for (let t = R + 1; t <= year; t++) { const b = M.bal(t); vol = b === undefined ? vol * iceVolume(t) / iceVolume(t - 1) : vol + M.c * b; }
  else for (let t = year + 1; t <= R; t++) { const b = M.bal(t); if (b !== undefined) vol -= M.c * b; }
  return Math.max(0, vol);
}
const iceSource = g => { const V = volumeSurvey(g), M = balanceModel(g);
  return M ? `Estimate: Grab et al. 2021, the GLAMOS volume survey ${V.from}–${V.to} and the yearly mass balance of ${M.own ? 'this glacier' : 'all Swiss glaciers'} (GLAMOS)`
           : 'Estimate: Grab et al. 2021 (ice around 2016), scaled with the yearly Swiss loss (GLAMOS)'; };
/* The selected glacier's part of the Swiss ice, as a line above the figures of the Switzerland tab: its measured volume around 2016
   (Grab et al. 2021, via swisstopo), the latest volume survey, against the national ice of that year. */
const shareText = sh => `${sh * 100 < 10 ? (sh * 100).toFixed(1) : Math.round(sh * 100)} %`;
/* "Thickest ice": the map of Grab et al. (2021), around 2016, replaces the radar maximum once swisstopo has answered; the radar value (older, often 1958-2012) moves to the note */
function fillThickness(){
  const g = currentGlacier(), tile = document.querySelector('.stat[data-slot="thick"]');
  if (!tile) return;
  glacierVolume(g).then(v => {
    if (!v || !v.max || currentGlacier() !== g || !tile.isConnected) return;
    const R = g.inv && g.inv.radar, yrs = R && R.years ? (R.years[0] === R.years[1] ? R.years[0] : R.years.join('–')) : '';
    tile.querySelector('.v').textContent = `${Math.round(v.max)} m`;
    tile.querySelector('.k').innerHTML = `<i class="mini">${ICONS.flag}</i>Thickest ice`;
    tile.querySelectorAll('.note, .per').forEach(n => n.remove());
    tile.querySelector('.k').insertAdjacentHTML('afterend', `<span class="per">Model result${fn('grab')}</span>`);
    if (R && R.max_at && !tile.querySelector('.tile-link')) tile.insertAdjacentHTML('beforeend', `<button type="button" class="tile-link" data-act="radar-max" data-text="${R.max_m} m in ${R.max_year || 'the survey'} (radar)"><span class="tl-t">${maxLinkText(`${R.max_m} m in ${R.max_year || 'the survey'} (radar)`)}</span>${fn('radar')}</button>`);
  }).catch(() => {});
}
function renderShare(){
  const g = currentGlacier(), big = document.getElementById('shIce');
  if (!big) return;
  glacierVolume(g).then(v => {
    if (!v || currentGlacier() !== g || !document.getElementById('shIce')) return;
    const total = iceVolume(v.yr || 2016);
    document.getElementById('shIce').textContent = shareText(v.km3 / total);
    document.getElementById('shLab').textContent = `of all Swiss glacier ice in ${v.yr || 2016}`;
    document.getElementById('shNote').innerHTML = `${v.km3.toFixed(1)} of ${total.toFixed(1)} km³${fn('grab')} (Swiss total${fn('swiss')})`;
  }).catch(() => {});
}
function renderGlacierWater(){
  const g = currentGlacier(), slot = document.getElementById('gWater');
  if (!slot) return;
  glacierVolume(g).then(v => {
    if (!v || currentGlacier() !== g) return;
    const lastY = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, estKm3 = glacierIceAt(g, v, lastY), litres = estKm3 * 0.9 * 1e12;
    const N = waterNumbers(estKm3), V = volumeSurvey(g), M = balanceModel(g), R0 = v.yr || 2016;
    const nationalLossPct = Math.round((1 - iceShareLeft()) * 100);
    slot.innerHTML = `<details class="card gwater dcard coll" name="stats" data-card="water"${cardOpen('water') ? ' open' : ''}><summary><div class="card-h"><span class="ico">${ICONS.drop}</span>Water storage</div></summary><div class="dbody">
      <div class="stat-row">
        <div class="stat hero wide">
          <span class="v">${N.litresText} litres</span>
          <span class="k"><i class="mini">${ICONS.drop}</i>Water stored in this glacier, autumn ${lastY}</span>
          ${symHtml({kind:'pool', big:`× ${N.poolsLong}`, small:'Olympic swimming pools'})}
          <span class="k note">Estimate, not a measurement.</span>
        </div>
        <div class="wbox has-per" tabindex="0"><i class="wi">${W_ICONS.lake}</i><div><span class="v">${N.lakes.toFixed(1)} <small>×</small></span><span class="k">Lake Zurich</span></div><span class="per">The water of this glacier as a number of Lake Zurichs</span></div>
        <div class="wbox has-per" tabindex="0"><i class="wi">${W_ICONS.tap}</i><div><span class="v">${N.tap.toFixed(1)} <small>years</small></span><span class="k">of Swiss tap water</span></div><span class="per">How long all of Switzerland\u2019s tap water use would take to use this much water</span></div>
      </div>
    </div></details>`;
  });
}

/* ---------- "How much water?" ---------- */
const W_ICONS = {
  pool: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="11" rx="2" fill="#5FB8D9"/><path d="M4 12c2-1.5 4 1.5 6 0s4 1.5 6 0 4 1.5 4 0" stroke="#fff" stroke-width="1.4" fill="none"/></svg>',
  lake: '<svg class="lake" viewBox="0 0 33 20"><path d="M3 11.5c0-3.6 3.4-6.2 7.6-6.4 2.6-.1 3.8 1.2 6.2 1 3-.2 4.4-2.1 7.5-1.6 3.4.5 5.7 2.6 5.7 5.6 0 3.5-3 5.4-6.6 5.8-2.6.3-3.9-.9-6.5-.6-2.8.3-4.4 2-7.5 1.6C5.4 16.6 3 14.6 3 11.5z" fill="#2D6E8E"/><path d="M9 11.5c2-1 3.5 1 5.5 0s3.5 1 5.5 0" stroke="#9CD3E6" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
  tap: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="#fff" stroke="#22313A" stroke-width="1.4"/><path d="M3 9h18" stroke="#C8322A" stroke-width="2.4"/><path d="M12 12.5c-1.6 2-2.4 3.2-2.4 4.1a2.4 2.4 0 0 0 4.8 0c0-.9-.8-2.1-2.4-4.1z" fill="#2D6E8E"/></svg>',
  person: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="#fff" stroke="#22313A" stroke-width="1.5"/><path d="M3.5 9.5h17" stroke="#C8322A" stroke-width="3"/><path d="M8 3.5v3M16 3.5v3" stroke="#22313A" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" stroke="#9AA6AC" stroke-width="1.5" stroke-linecap="round"/></svg>'
};
const fmtN = (n, d = 1) => n >= 1e12 ? `${(n / 1e12).toFixed(d)} trillion` : n >= 1e9 ? `${(n / 1e9).toFixed(d)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(d)} million` : Math.round(n).toLocaleString('en');
/* Ice left in all Swiss glaciers since autumn 2016.
   Base: autumn 2016, the first year of the images. Counting back from GLAMOS (46.4 km³ at the end of 2024)
   gives 58.8 km³; an independent radar survey (Grab et al. 2021) measured 58.7 ± 2.5 km³ for 2016.
   The axis starts at 0 so the decline is shown at its true size. */
const CUM_BASE_YEAR = 2016;
let cumData = null;
/* tap or hover: show the ice left in the chosen autumn and what has melted since the first year, in litres of water */
function wireCum(){
  const svg = document.getElementById('cumSvg'), read = document.getElementById('cumRead'), cur = document.getElementById('cumCursor');
  if (!svg || !cumData) return;
  const c = cumData;
  const pick = e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.W;
    let k = 0; c.X.forEach((px, i) => { if (Math.abs(px - x) < Math.abs(c.X[k] - x)) k = i; });
    cur.removeAttribute('hidden'); cur.setAttribute('transform', `translate(${c.X[k]} 0)`);
    cur.querySelector('circle').setAttribute('cy', c.Y[k]);
    const lost = c.base - c.vols[k];
    read.innerHTML = k === 0 ? `<b>Autumn ${c.years[k]}</b>: about ${c.vols[k].toFixed(1)} km³ of ice, the start of the images.`
      : `<b>Autumn ${c.years[k]}</b>: about ${c.vols[k].toFixed(1)} km³ of ice. Since autumn ${c.years[0]} ${lost.toFixed(1)} km³ melted, about ${fmtN(lost * 0.9e12, 1)} litres of water.`;
  };
  svg.onpointermove = pick; svg.onpointerdown = pick;
  svg.onpointerleave = e => { if (e.pointerType === 'mouse') { cur.setAttribute('hidden', ''); read.textContent = 'Tap or hover the chart to see a year.'; } };
}
/* A smooth curve through the points (Catmull-Rom turned into cubic Beziers) */
const smoothPath = pts => {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
function cumulativeChart(lo, hi){
  const last = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, years = [];
  for (let y = CUM_BASE_YEAR; y <= last; y++) years.push(y);
  const vols = years.map(iceVolume), base = vols[0], end = vols[vols.length - 1];
  const W = 340, H = 205, L = 30, R = 14, T = 24, B = 26, top = Math.ceil(base / 20) * 20;
  const X = y => L + (y - CUM_BASE_YEAR) / (last - CUM_BASE_YEAR) * (W - L - R), Y = v => T + (1 - v / top) * (H - T - B);
  const pts = years.map((y, i) => [X(y), Y(vols[i])]), curve = smoothPath(pts);
  const rev = smoothPath(pts.slice().reverse()).replace(/^M/, 'L');
  const iceArea = `${curve} L${X(last)},${Y(0)} L${X(CUM_BASE_YEAR)},${Y(0)} Z`;
  const lostArea = `M${X(CUM_BASE_YEAR)},${Y(base)} L${X(last)},${Y(base)} L${X(last)},${Y(end)} ${rev.replace(/^L[^C]*C/, 'C')} Z`;
  const ticks = Array.from({length: top / 20 + 1}, (_, i) => i * 20).map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? 'var(--rock)' : 'var(--rule)'}" stroke-width="${v === 0 ? 1 : .8}" ${v === 0 ? '' : 'stroke-dasharray="2 3"'}/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`).join('');
  const xt = years.filter(y => (y - CUM_BASE_YEAR) % 3 === 0 || y === last).map(y => `<text x="${X(y)}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('');
  const lostPct = Math.round((1 - end / base) * 100), lostKm3 = base - end;
  cumData = { W, L, R, T, H, B, years, vols, base, X: years.map(X), Y: years.map((y, i) => Y(vols[i])) };
  return `<figure class="cum cum2">
    <div class="cum-head">
      <div class="cum-n"><b>${base.toFixed(1)}</b><small>km³ in ${CUM_BASE_YEAR}</small></div>
      <span class="cum-arrow" aria-hidden="true">→</span>
      <div class="cum-n"><b>${end.toFixed(1)}</b><small>km³ in ${last}</small></div>
      <div class="cum-loss"><b>−${lostPct} %</b><small>${lostKm3.toFixed(1)} km³ gone</small></div>
    </div>
    <svg id="cumSvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ice in all Swiss glaciers fell from ${base.toFixed(1)} km³ in ${CUM_BASE_YEAR} to ${end.toFixed(1)} km³ in ${last}, a loss of ${lostPct} percent">
      <defs>
        <linearGradient id="iceG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CC9DB"/><stop offset="1" stop-color="#E4F0F5"/></linearGradient>
        <linearGradient id="lostG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8322A" stop-opacity=".12"/><stop offset="1" stop-color="#C8322A" stop-opacity=".42"/></linearGradient>
      </defs>
      ${ticks}
      <path d="${iceArea}" fill="url(#iceG)"/>
      <path d="${lostArea}" fill="url(#lostG)"/>
      <path d="${curve}" fill="none" stroke="var(--crevasse)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${X(CUM_BASE_YEAR)}" cy="${Y(base)}" r="4.2" fill="#fff" stroke="var(--crevasse)" stroke-width="2.4"/>
      <circle cx="${X(last)}" cy="${Y(end)}" r="4.2" fill="#fff" stroke="var(--crevasse)" stroke-width="2.4"/>
      <text x="${L - 6}" y="${T - 4}" text-anchor="end" class="unit">km³</text>
      <text x="${L + 8}" y="${H - B - 22}" class="cum-left-n">${end.toFixed(1)} km³</text>
      <text x="${L + 8}" y="${H - B - 9}" class="cum-left-s">ice remaining in ${last} (${100 - lostPct} %)</text>
      ${xt}
      <g id="cumCursor" hidden><line y1="${T}" y2="${H - B}" stroke="var(--rock)" stroke-width="1" stroke-dasharray="2 2"/><circle r="5" fill="#fff" stroke="var(--rock)" stroke-width="2"/></g>
    </svg>
    <div class="cum-read" id="cumRead">Tap or hover the chart to see a year.</div>
    <figcaption class="dh-key"><span class="dh-key-i"><span class="k k-ice"></span>Ice remaining</span><span class="dh-key-i"><span class="k k-lost"></span>Lost since ${CUM_BASE_YEAR}</span></figcaption>
  </figure>`;
}
function waterCompare(kind, litres){
  const km3 = litres / 1e12;
  const icons = (icon, n, unit) => {          // up to 40 icons; the last one partly filled
    const full = Math.min(40, Math.floor(n)), part = n < 40 ? n - full : 0;
    // the last icon is filled only as far as the remaining fraction, the rest is a faint outline
    const partial = part > 0.05 ? `<span class="w-part"><span class="ghost">${W_ICONS[icon]}</span><span class="fill" style="width:${(part * 100).toFixed(0)}%">${W_ICONS[icon]}</span></span>` : '';
    return `<div class="w-icons">${W_ICONS[icon].repeat(full)}${partial}</div><div class="w-key">${unit}</div>`;
  };
  if (kind === 'pool') { const n = litres / POOL_L, per = n > 40 ? Math.pow(10, Math.ceil(Math.log10(n / 40))) : 1;
    return `<div class="w-big">${fmtN(n)} Olympic pools</div><p class="w-text">Lined up, these 50-metre pools would stretch ${fmtN(n * 50 / 1000, 0)} km, ${(n * 50 / 1000 / 40075).toFixed(1)} times around the Earth.</p>${icons('pool', n / per, `1 icon = ${fmtN(per, 0)} pool${per > 1 ? 's' : ''}`)}`; }
  if (kind === 'lake') { const n = km3 / LAKE_ZURICH_KM3;
    return `<div class="w-big">${n.toFixed(1)} × Lake Zurich</div><p class="w-text">Lake Zurich holds about 3.9 km³ of water. The melted ice would fill it ${n >= 1 ? `${n.toFixed(1)} times` : `to ${Math.round(n * 100)} %`}.</p>${icons('lake', n, '1 icon = Lake Zurich (3.9 km³)')}`; }
  if (kind === 'tap') { const n = km3 / SWISS_SUPPLY_KM3;
    return `<div class="w-big">${n.toFixed(1)} years of tap water</div><p class="w-text">That is how long it would supply all of Switzerland's homes, businesses and industry, which together use about 930 million m³ a year.</p>${icons('tap', n, '1 icon = one year of water supply for all of Switzerland')}`; }
  const each = litres / SWISS_POP, yrs = each / (HOUSEHOLD_L_DAY * 365);
  return `<div class="w-big">${fmtN(each, 2)} litres per resident</div><p class="w-text">Shared among Switzerland's 9 million residents, each person's share would cover their household water use (142 litres a day) for about <b>${Math.round(yrs)} years</b>.</p>${icons('person', Math.min(40, yrs), '1 icon = one year of one person\'s household water')}`;
}
const waterCompareRaw = waterCompare;
function waterCompareChip(kind, litres){ return waterCompareRaw(kind, litres).replace(/<p class="w-text">([\s\S]*?)<\/p>/, (m, t) => `<span class="per">${t}</span>`); }      // the explaining sentence goes into the hover chip
let waterKind = 'pool';
function waterSection(lo, hi){
  const last = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, to = Math.min(hi || 0, last);
  if (!(lo && hi && hi > lo) || to <= lo) return '<p class="sub-note">Choose two different years in step 2 to see how much water melted from all Swiss glaciers in between.</p>';
  const litres = (iceVolume(lo) - iceVolume(to)) * 0.9 * 1e12;
  return `<div class="water" id="waterBox" data-litres="${litres}">
    <div class="stat wide w-hero-tile has-per" tabindex="0"><span class="v"><span id="wCount">0</span> litres</span><span class="k">melted from Swiss glaciers</span><span class="per">Fresh water, from autumn ${lo} to autumn ${to}</span></div>
    <div id="wCompare" class="w-box has-per" tabindex="0">${waterCompareChip(waterKind, litres)}</div>
    <div class="w-chips" role="group" aria-label="Compare with">
      ${[['pool', 'Swimming pools'], ['lake', 'Lake Zurich'], ['tap', 'Swiss tap water'], ['person', 'Per resident']].map(([k, t]) =>
        `<button type="button" data-kind="${k}" aria-pressed="${k === waterKind}">${t}</button>`).join('')}
    </div>
    <div class="w-live" id="wLive"></div>
  </div>`;
}
/* after each story render: count up, wire the chips, start the live counter */
let liveStart = Date.now(), liveTimer = null, lastCounted = null;
function wireWater(){
  const box = document.getElementById('waterBox');
  clearInterval(liveTimer);
  if (!box) return;
  const litres = +box.dataset.litres, out = document.getElementById('wCount'), t0 = performance.now(), dur = 1400;
  const again = lastCounted !== null && Math.abs(lastCounted - litres) < 1;       // same number as before: no count-up from zero
  lastCounted = litres;
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    out.textContent = fmtN(litres * e, 1); if (k < 1) requestAnimationFrame(step); };
  matchMedia('(prefers-reduced-motion:reduce)').matches || again ? (out.textContent = fmtN(litres, 1)) : requestAnimationFrame(step);
  box.querySelectorAll('.w-chips button').forEach(b => b.onclick = () => {
    waterKind = b.dataset.kind;
    box.querySelectorAll('.w-chips button').forEach(x => x.setAttribute('aria-pressed', x === b));
    document.getElementById('wCompare').innerHTML = waterCompareChip(waterKind, litres);
  });
  // live counter: average melt rate of the latest year, spread over the whole year
  const lastY = VOLUME_LOSS[VOLUME_LOSS.length - 1].y, perYear = (iceVolume(lastY - 1) - iceVolume(lastY)) * 0.9 * 1e12;
  const perSec = perYear / (365.25 * 86400), live = document.getElementById('wLive');
  const tick = () => { const sec = (Date.now() - liveStart) / 1000;
    live.innerHTML = `While you have been on this page, Swiss glaciers lost about <b>${Math.round(sec * perSec).toLocaleString('en')} litres</b>. In ${lastY} they lost on average ${Math.round(perSec).toLocaleString('en')} litres every second, one Olympic pool every ${Math.round(POOL_L / perSec)} seconds.`; };
  tick(); liveTimer = setInterval(tick, 1000);
}


function renderOutlineControls(){
  const has = !!DATA, yr = l => (l || '').replace(/\D/g, '') || l;
  ['oldToggle','newToggle'].forEach(id => document.getElementById(id).disabled = !has);
  document.getElementById('oldLabel').textContent = `Outline ${has ? yr(DATA.oldest_label) : '1850'}`;
  document.getElementById('newLabel').textContent = `Outline ${has ? yr(DATA.latest_label) : '2023'}`;
  document.getElementById('pinLabel').textContent = 'Tongue tip';
  document.getElementById('outlineNote').textContent = has ? '' : 'Outlines appear once the glacier data (glaciers.js) has been built.';
}

function refreshAll(){
  if (state.latest && state.mode !== 'single') restoreLatest();        // the latest image belongs to the One year mode
  renderMode(); renderYears();
  setTag('tagA', state.a); setTag('tagB', state.b);
  if (state.checked) { setCompareLayers(); buildTimelapse(); }
  renderStory(); writeHash(); sync3D();
}

