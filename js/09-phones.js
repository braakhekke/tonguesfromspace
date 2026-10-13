/* =====================================================================
   10. Phones: control bar under the map, map tools, two-finger map, sharing
   ===================================================================== */
const COARSE = matchMedia('(pointer:coarse)').matches;
/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

/* Pick-a-glacier message: at the start until a glacier is chosen, and again whenever the map is zoomed out beyond the first view */
const START_ZOOM = () => map.getBoundsZoom(glaciersExtent(), false, L.point(80, 80));
function updatePickHint(){
  const far = map.getZoom() < START_ZOOM() - 0.5, el = $('pickHint'), show = !glacierPicked || far;
  el.classList.toggle('show', show);
  const wasLocked = $('app').classList.contains('no-glacier');
  $('app').classList.toggle('no-glacier', !glacierPicked); syncSatUi(); $('story').classList.toggle('empty', !glacierPicked);
  $('downHint').hidden = !glacierPicked;
  if (wasLocked && glacierPicked) {          // step 2 pops up as soon as a glacier is chosen
    const v = $('vizGroup'); v.classList.add('pop'); setTimeout(() => v.classList.remove('pop'), 1000);
    if (!PHONE.matches) {            // the left panel scrolls until "2 Compare" is its first line
      const box = document.querySelector('.controls'), top = box.scrollTop + v.getBoundingClientRect().top - box.getBoundingClientRect().top - 14;
      box.scrollTo({top: Math.max(0, top), behavior: 'smooth'});
    }
  }
  if (!show) return;
  $('pickNote').innerHTML = far ? '<span class="pn-num">1</span><span>Too far out. Zoom in on a <b>red glacier</b>.</span>' : '<span class="pn-num">1</span><span>Choose a red outlined glacier on the map</span>';
}
map.on('zoomend moveend resize', updatePickHint);

/* Hide or show the side panels (desktop and tablet); the map gets the room */
function setPanel(side, hidden, save = true){
  $('app').classList.toggle(side === 'left' ? 'no-left' : 'no-right', hidden);
  $(side === 'left' ? 'toggleLeft' : 'toggleRight').setAttribute('aria-expanded', !hidden);
  if (save) { prefs[side === 'left' ? 'hideL' : 'hideR'] = hidden; savePrefs(); }
  map.invalidateSize({pan:false});
  setTimeout(() => { if (typeof v3d !== 'undefined' && v3d && v3d.resize) try { v3d.resize(); } catch {} }, 380);      // the 3D view follows the new width once the panel has slid
}
$('toggleLeft').onclick = () => setPanel('left', !$('app').classList.contains('no-left'));
$('toggleRight').onclick = () => setPanel('right', !$('app').classList.contains('no-right'));
if (prefs.hideL) setPanel('left', true, false);
if (prefs.hideR) setPanel('right', true, false);


/* ---------- Full screen (visual only) and the small floating window (phones) ---------- */
const PHONE = matchMedia('(max-width:720px) and (orientation:portrait)');
const fullState = {saved: null};
function setFull(on){
  const stage = $('stage'), app = $('app');
  if (PHONE.matches) {
    const c0 = map.getCenter(), z0 = map.getZoom();            // the middle of what is on show stays the middle (the small window's centre becomes the centre of the full screen)
    stage.classList.toggle('is-full', on); document.body.classList.toggle('has-full', on);
    if (on) [$('layerbox'), $('v3dLayers')].forEach(x => stage.appendChild(x)); else placeLayers();      // the browser's own full screen shows only the visual and what is inside it: the layer menus go in for the time being
    if (on) { stage.classList.remove('mini'); try { stage.requestFullscreen && stage.requestFullscreen().catch(() => {}); } catch {} }
    else { if (document.fullscreenElement) try { document.exitFullscreen(); } catch {} setTimeout(evalMini, 50); }      // back from full screen: the small window returns if the visual is still scrolled out of view
    map.invalidateSize({pan: false}); map.setView(c0, z0, {animate: false});
    [150, 400, 800].forEach(t => setTimeout(() => { map.invalidateSize({pan: false}); map.setView(c0, z0, {animate: false}); }, t));      // the browser's full screen changes the size a moment later
  } else {                                   // bigger screens: both panels slide away, and back on leaving
    if (on) { fullState.saved = {l: app.classList.contains('no-left'), r: app.classList.contains('no-right')}; setPanel('left', true, false); setPanel('right', true, false); }
    else if (fullState.saved) { setPanel('left', fullState.saved.l, false); setPanel('right', fullState.saved.r, false); fullState.saved = null; }
    app.classList.toggle('visual-only', on);
  }
  ['fsBtn', 'v3dFs'].forEach(id => { const b = $(id); if (b) { const t = on ? 'Exit full screen (Esc)' : 'Full screen, visual only'; b.setAttribute('aria-label', t); b.title = t; } });      // the buttons show only an icon: the words are in the tooltip and for screen readers
  setTimeout(() => { map.invalidateSize({pan: false}); if (typeof v3d !== 'undefined' && v3d && v3d.resize) try { v3d.resize(); } catch {} }, 380);
}
const isFull = () => $('stage').classList.contains('is-full') || $('app').classList.contains('visual-only');
document.querySelectorAll('.home-link').forEach(a => a.addEventListener('click', e => {      // the title leads back to the start: no glacier chosen, the overview of Switzerland
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); location.reload();
}));
$('downHint').onclick = () => $('story').scrollIntoView({behavior: 'smooth', block: 'start'});
$('fsBtn').onclick = $('v3dFs').onclick = () => setFull(!isFull());
$('fullExit').onclick = () => setFull(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFull()) { setFull(false); e.preventDefault(); } });      // the key press is used up: leaving full screen is all it does (the 3D view's own Esc handler checks defaultPrevented)
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && $('stage').classList.contains('is-full')) setFull(false); });
/* the left panel scrolls: a cue at its bottom points to "Create and share" until that step is in view (not on phones, where the page scrolls) */
(function(){
  const box = document.querySelector('.controls'), cue = $('scrollCue'), target = $('shareGroup');
  const upd = () => {
    const scrollable = box.scrollHeight - box.clientHeight > 8 && getComputedStyle(box).overflowY !== 'visible' && !PHONE.matches;
    const inView = target.getBoundingClientRect().top < box.getBoundingClientRect().bottom - 80;
    const hide = !(scrollable && !inView); if (cue.hidden !== hide) cue.hidden = hide;      // only on change: the observer below watches this element too
  };
  box.addEventListener('scroll', upd, {passive: true}); addEventListener('resize', upd);
  if (window.ResizeObserver) new ResizeObserver(upd).observe(box);
  new MutationObserver(upd).observe(box, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden']});
  $('scrollCueBtn').onclick = () => target.scrollIntoView({behavior: 'smooth', block: 'start'});
  upd();
})();
/* phones: scrolled below the visual, it stays as a small window in the corner (enlarge, full screen, close) */
let miniClosed = false;
function setMini(on){
  const stage = $('stage'); if (stage.classList.contains('mini') === on) return;
  const c = map.getCenter(), z = map.getZoom();            // the small window shows the middle of what the big one showed, at the same scale
  stage.classList.toggle('mini', on); map.invalidateSize({pan: false}); map.setView(c, z, {animate: false}); clip && clip();
}
function evalMini(){            // the small window shows while the visual is scrolled out above the screen
  const below = $('stageSlot').getBoundingClientRect().bottom < 0;
  if (!below) miniClosed = false;
  setMini(PHONE.matches && below && !miniClosed && glacierPicked && $('videoSheet').hidden && !$('stage').classList.contains('is-full'));
}
if ('IntersectionObserver' in window) new IntersectionObserver(evalMini).observe($('stageSlot'));
$('miniBig').onclick = () => { setMini(false); $('stageSlot').scrollIntoView({behavior: 'smooth', block: 'start'}); };
$('miniFull').onclick = () => setFull(true);
$('miniClose').onclick = () => { miniClosed = true; setMini(false); };


/* Colour composition buttons: a small drawn glacier in the colours each band combination gives (rock, ice, snow, lake, plants), as in the About chapter "The colours" */
const SW_PALETTE = {
  natural: {rock: '#8f8679', rock2: '#6e675c', ice: '#d9e5ea', snow: '#fbfdfe', crev: '#aebfca', lake: '#5d8f9f', veg: '#5c8c3a'},
  false1:  {rock: '#857d72', rock2: '#625c53', ice: '#b6c3cc', snow: '#f7fafb', crev: '#8f9fab', lake: '#1d2b3b', veg: '#c22f3f'},
  false2:  {rock: '#d6cfbf', rock2: '#b9b2a2', ice: '#c9473d', snow: '#f06a5c', crev: '#a53630', lake: '#0b0f14', veg: '#aab59a'}
};
function swatchSvg(k){
  const c = SW_PALETTE[k];
  return `<svg viewBox="0 0 90 44" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="90" height="44" fill="${c.rock}"/>
    <path d="M0 44V30L12 22 20 28 30 18 40 26V44Z" fill="${c.rock2}"/>
    <path d="M0 44V27c6-4 10 1 16-2 4-2 8 2 12 6l4 13z" fill="${c.veg}"/><path d="M58 44c3-6 8-8 13-11s12-4 19-6v17z" fill="${c.veg}"/><path d="M0 22c4-3 8-2 10 2s-4 4-10 3z" fill="${c.veg}"/>
    <path d="M28 0H70L78 6 60 12 66 22 56 34 44 38 40 28 34 16 18 8Z" fill="${c.snow}" opacity=".95"/>
    <path d="M34 16 40 28 44 38 56 34 66 22 60 12 46 12Z" fill="${c.ice}"/>
    <path d="M40 18l9 3M43 26l11 1M47 33l8-3" stroke="${c.crev}" stroke-width="1.2" fill="none"/>
    <ellipse cx="52" cy="40" rx="9" ry="3.6" fill="${c.lake}"/></svg>`;
}
document.querySelectorAll('.sw').forEach(b => { const k = b.id === 'styleNatural' ? 'natural' : b.id === 'styleFalse1' ? 'false1' : 'false2'; b.querySelector('i').innerHTML = swatchSvg(k); });

let pendingChoice = null;
function chooseGlacier(id){
  const next = GLACIERS.find(x => x.id === id);
  if (needsOutline(next)) { pendingChoice = id; loadOutline(next).then(() => { if (pendingChoice === id) chooseGlacier(id); }); return; }      // the 2023 outline comes first (a file per glacier); then the choice is made as usual. A later click on another glacier wins
  pendingChoice = null;
  const first = !glacierPicked;
  glacierPicked = true; updatePickHint();
  const sat = $('satToggle'); if (!sat.checked) { sat.checked = true; sat.dispatchEvent(new Event('change')); }      // choosing a glacier switches the Sentinel-2 picture on (it may have been switched off in the layer menu)
  if (first) { const bt = $('boxToggle'); if (bt.checked) { bt.checked = false; bt.dispatchEvent(new Event('change')); } }      // the selectable-glacier layer goes off with the first choice
  if (state.glacier === id) {                           // the glacier that was already selected: the first click still has to show its outlines
    stopPlay(); if (first) { if (state.checked) { setCompareLayers(); buildTimelapse(); } drawOutlines(); writeHash(); updateTrailClip(); updateSight(); drawBoxes(); updateBoxes(); renderMobileBar(); renderGlacierList(); }      // the first click on the glacier that was preselected also has to set the trail area and the line of sight
    return focusTongue();
  }
  stopPlay();
  state.glacier = id; renderGlacierList(); renderStory(); drawOutlines(); drawBoxes(); updateBoxes(); updateTrailClip(); updateSight(); drawTonguePin(); focusTongue(); writeHash();
  checkYears();                 // each glacier has its own clearest scenes
}
function renderMobileBar(){                 // phones: the glacier list becomes a dropdown
  const gs = $('mGlacier');
  const none = !glacierPicked;      // before the first choice nothing is selected: the box asks for one
  gs.innerHTML = (none ? '<option value="" disabled selected>Tap to choose a glacier</option>' : '') + GLACIERS.map((g, i) => `<option value="${g.id}" ${!none && g.id === state.glacier ? 'selected' : ''}>${i + 1}. ${g.name}, ${rankArea(g).toFixed(1)} km²</option>`).join('');
  gs.classList.toggle('placeholder', none);
  gs.onchange = () => chooseGlacier(gs.value);
}

/* Map tools on phones: layers and measuring live behind two small buttons */
function setMore(open){
  setTimeout(() => clip(), 0);
  document.querySelector('.mapbar').classList.toggle('more-open', open); $('app').classList.toggle('more-open', open);
  $('moreBtn').setAttribute('aria-expanded', open); $('moreBtn').setAttribute('aria-pressed', open);
}
const layerBoxNow = () => viewMode === '3d' && PHONE.matches ? $('v3dLayers') : $('layerbox');      // phones: one bar under the visual opens the menu of the view that is shown
function setLayers(open){
  const box = layerBoxNow();
  [$('layerbox'), $('v3dLayers')].forEach(x => x.classList.toggle('open', x === box && open));
  updateLayerMore();
  $('layersBtn').setAttribute('aria-expanded', open); $('layersBtn').setAttribute('aria-pressed', open);
  layersBar.setAttribute('aria-expanded', open);
}
/* Layer box on phones: show the fade and chevron at the bottom while more items can be scrolled to */
function updateLayerMore(){
  const b = $('layerbox'); b.classList.toggle('more', b.classList.contains('open') && b.scrollHeight - b.scrollTop - b.clientHeight > 6);
}
$('layerbox').addEventListener('scroll', updateLayerMore, {passive: true});
addEventListener('resize', updateLayerMore);
if (window.ResizeObserver) new ResizeObserver(updateLayerMore).observe(document.querySelector('#layerbox .lb-body'));
/* On phones the For Your Ice box sits at the very bottom of the page; elsewhere it stays in the settings panel */
const FYI = document.querySelector('a.fyi'), FYI_HOME = FYI.parentNode, FYI_PHONE = matchMedia('(max-width:720px), (max-width:950px) and (orientation:landscape) and (max-height:520px)');
const FYI_BY = document.querySelector('.fyi-by');      // the byline stays under the box, wherever the box is
function placeFyi(){ const home = FYI_PHONE.matches ? $('fyiSlot') : FYI_HOME; home.appendChild(FYI); home.appendChild(FYI_BY); }
FYI_PHONE.addEventListener('change', placeFyi); placeFyi();

/* phones in portrait: the map's layer box moves out of the visual, to a bar and panel below it */
const layersBar = document.createElement('button');
layersBar.type = 'button'; layersBar.id = 'layersBar'; layersBar.className = 'layers-bar'; layersBar.setAttribute('aria-expanded', 'false');
layersBar.innerHTML = '<span>Layers</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
function placeLayers(){
  const lbx = $('layerbox'), l3 = $('v3dLayers'), inflow = PHONE.matches;
  [lbx, l3].forEach(x => x.classList.toggle('in-flow', inflow));
  if (inflow) $('stageSlot').after(layersBar, lbx, l3); else { $('stage').appendChild(lbx); $('v3d').appendChild(l3); layersBar.remove(); }
}
PHONE.addEventListener('change', placeLayers); placeLayers();
layersBar.onclick = () => { const open = !layerBoxNow().classList.contains('open'); setLayers(open); if (open) setMore(false); };
$('lbToggle').addEventListener('click', e => { if ($('layerbox').classList.contains('in-flow')) { e.stopImmediatePropagation(); setLayers(false); } }, true);
$('v3dLbToggle').addEventListener('click', e => { if ($('v3dLayers').classList.contains('in-flow')) { e.stopImmediatePropagation(); setLayers(false); } }, true);
$('layersBtn').onclick = () => { const open = !layerBoxNow().classList.contains('open'); setLayers(open); if (open) setMore(false); };   // one panel at a time
$('moreBtn').onclick = () => { const open = !document.querySelector('.mapbar').classList.contains('more-open'); setMore(open); if (open) setLayers(false); };

/* Two fingers move the map on touch screens; one finger scrolls the page.
   Leaflet's pinch handler zooms and pans with two fingers; single-finger dragging is switched off. */
if (COARSE) {
  map.dragging.disable();
  document.getElementById('app').classList.add('two-finger');
  const el = $('map'), hint = $('gestureHint'); let timer = null;
  el.addEventListener('touchmove', e => {
    if (e.touches.length !== 1 || M.mode) return;
    hint.classList.add('show'); clearTimeout(timer);
    timer = setTimeout(() => hint.classList.remove('show'), 1300);
  }, {passive:true});
  el.addEventListener('touchstart', e => { if (e.touches.length > 1) hint.classList.remove('show'); }, {passive:true});
}

/* Sharing: the address already contains glacier, mode and years */
async function shareView(){
  const g = currentGlacier(), url = location.href;
  const text = state.mode === 'single' ? `${g.name}, ${state.one}` : state.mode === 'timelapse' ? `${g.name}, ${state.from} to ${state.to}` : `${g.name}, ${state.a} and ${state.b}`;
  if (navigator.share) {
    try { await navigator.share({title:'Tongues from Space - Switzerland', text, url}); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); showNotice('Link copied. Paste it anywhere to share this view.'); }
  catch { prompt('Copy this link:', url); }
}
$('shareBtn').onclick = shareView;

/* Mobile data: a timelapse loads one image per year the first time */
let dataNoteShown = false;
function mobileDataNote(){
  if (!COARSE || dataNoteShown) return;
  dataNoteShown = true;
  const n = tlFrames().length;
  if (n > 2) showNotice(`The first time, a timelapse of ${n} years loads about ${Math.round(n * 1.2)} MB of images. On mobile data you may prefer Wi-Fi. After that they are stored on your phone.`);
}

