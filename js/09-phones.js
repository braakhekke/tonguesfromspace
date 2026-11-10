import { wire } from './wire.js';
import { $, COARSE, PHONE } from './01-data.js';
import { needsOutline, loadOutline, rankArea, areaText, GLACIERS } from './02-glaciers.js';
import { prefs, savePrefs, imagesToFetch } from './03-imagery.js';
import { state, writeHash, currentGlacier, viewMode, glacierPicked, setGlacierPicked, EMBED } from './04-state.js';
import { map, updateSight, updateTrailClip, updateAerial, updateMapYears, oldestAerial, ensureOldest, showOldest, setCompareLayers, clip, tlFrames, buildTimelapse, stopPlay, drawOutlines, M, drawTonguePin, focusTongue } from './05-map.js';
import { showLatest } from './03-imagery.js';
import { checkYears, checkGen } from './06-scene-search.js';
import { renderGlacierList, subTitle, focusSub, subFocus, renderStory, inviteHtml, closeOtherSharePanes } from './07-render.js';
import { showNotice, drawBoxes, updateBoxes, glaciersExtent, syncSatUi } from './08-controls.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'chooseGlacier', { get: () => chooseGlacier, configurable: true });
Object.defineProperty(wire, 'mobileDataNote', { get: () => mobileDataNote, configurable: true });
Object.defineProperty(wire, 'renderMobileBar', { get: () => renderMobileBar, configurable: true });
Object.defineProperty(wire, 'updateRightTab', { get: () => updateRightTab, configurable: true });
/* =====================================================================
   10. Phones: control bar under the map, map tools, two-finger map, sharing
   ===================================================================== */
/** @type {(id: string) => any} */

/* Pick-a-glacier message: at the start until a glacier is chosen, and again whenever the map is zoomed out beyond the first view */
/** @type {() => number} */
export const START_ZOOM = () => map.getBoundsZoom(glaciersExtent(), false, L.point(80, 80));
export function scrollCompareTop(){            // the left panel scrolls until "2 Compare" is its first line
  if (PHONE.matches) return;
  const box = document.querySelector('.controls'), v = $('vizGroup'), top = box.scrollTop + v.getBoundingClientRect().top - box.getBoundingClientRect().top - 14;
  box.scrollTo({top: Math.max(0, top), behavior: 'smooth'});
}
export function updatePickHint(){
  const far = map.getZoom() < START_ZOOM() - 0.5, el = $('pickHint'), show = !glacierPicked || far;
  el.classList.toggle('show', show);
  const wasLocked = $('app').classList.contains('no-glacier');
  $('app').classList.toggle('no-glacier', !glacierPicked); syncSatUi(); $('story').classList.toggle('empty', !glacierPicked);
  $('downHint').hidden = !glacierPicked;
  if (wasLocked && glacierPicked) {          // step 2 pops up as soon as a glacier is chosen
    const v = $('vizGroup'); v.classList.add('pop'); setTimeout(() => v.classList.remove('pop'), 1000);
    scrollCompareTop();
  }
  if (!show) return;
  $('pickNote').innerHTML = far ? '<span>Zoom in to see the glacier tongues</span>' : '<span>Choose a red outlined glacier on the map</span>';
}
map.on('zoomend moveend resize', updatePickHint);

/* Hide or show the side panels (desktop and tablet); the map gets the room */
export function setPanel(side, hidden, save = true){
  $('app').classList.toggle(side === 'left' ? 'no-left' : 'no-right', hidden);
  $(side === 'left' ? 'toggleLeft' : 'toggleRight').setAttribute('aria-expanded', !hidden);
  if (side === 'right' && !hidden) $('toggleRight').classList.remove('halo');      // opened once: the halo on the tab stops for the rest of the session
  if (save) { prefs[side === 'left' ? 'hideL' : 'hideR'] = hidden; savePrefs(); }
  map.invalidateSize({pan:false});
  setTimeout(() => { if (typeof wire.v3d !== 'undefined' && wire.v3d && wire.v3d.resize) try { wire.v3d.resize(); } catch {} }, 380);      // the 3D view follows the new width once the panel has slid
}
/* The panels slide for 0.35 s, so the map's box changes size over several frames. Leaflet only learns of it when told: follow every change of the box, keeping the centre in the middle of
   the visible map (the glacier stays centred while a panel closes or opens), and load the tiles of the area that comes into view. */
if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize({animate: false})).observe($('map'));
$('toggleLeft').onclick = () => setPanel('left', !$('app').classList.contains('no-left'));
$('toggleRight').onclick = () => setPanel('right', !$('app').classList.contains('no-right'));
if (prefs.hideL) setPanel('left', true, false);
if (prefs.hideR === undefined ? matchMedia('(min-width:1101px) and (min-height:521px)').matches : prefs.hideR) setPanel('right', true, false);      // collapsed at the first visit (wide screens): the tab on the edge invites to open it
if ($('app').classList.contains('no-right')) $('toggleRight').classList.add('halo');      // moving halo on the collapsed tab until it was opened once (every page load is a new session)
/* the tab of the collapsed right panel names the glacier in full */
export function updateRightTab(){
  const l = $('toggleRightLabel'); if (!l) return;
  const t = typeof glacierPicked !== 'undefined' && glacierPicked ? `Discover ${currentGlacier().name} facts and figures` : 'Discover glacier facts and figures';
  l.textContent = t; $('toggleRight').title = t;
}


/* ---------- Full screen (visual only) and the small floating window (phones) ---------- */
export const fullState = {saved: null, phone: false};
export function setFull(on){
  const stage = $('stage'), app = $('app');
  const phone = on ? PHONE.matches : fullState.phone;      // leaving takes the branch it was entered by: the phone may have been turned sideways meanwhile
  fullState.phone = on && phone;
  if (phone) {
    const c0 = map.getCenter(), z0 = map.getZoom();            // the middle of what is on show stays the middle (the small window's centre becomes the centre of the full screen)
    stage.classList.toggle('is-full', on); document.body.classList.toggle('has-full', on);
    if (on) [$('layerbox'), $('v3dLayers')].forEach(x => stage.appendChild(x)); else placeLayers();      // the browser's own full screen shows only the visual and what is inside it: the layer menus go in for the time being
    if (on) { stage.classList.remove('mini'); try { stage.requestFullscreen && stage.requestFullscreen().catch(() => {}); } catch {} }
    else { if (document.fullscreenElement) try { document.exitFullscreen(); } catch {} }
    map.invalidateSize({pan: false}); map.setView(c0, z0, {animate: false});
    [150, 400, 800].forEach(t => setTimeout(() => { map.invalidateSize({pan: false}); map.setView(c0, z0, {animate: false}); }, t));      // the browser's full screen changes the size a moment later
  } else {                                   // bigger screens: both panels slide away, and back on leaving
    if (on) { fullState.saved = {l: app.classList.contains('no-left'), r: app.classList.contains('no-right')}; setPanel('left', true, false); setPanel('right', true, false); }
    else if (fullState.saved) { setPanel('left', fullState.saved.l, false); setPanel('right', fullState.saved.r, false); fullState.saved = null; }
    app.classList.toggle('visual-only', on);
  }
  immSync(); fadeSync(); orientSync();
  ['fsBtn', 'v3dFs'].forEach(id => { const b = $(id); if (b) { const t = on ? 'Exit full screen (Esc)' : 'Full screen, visual only'; b.setAttribute('aria-label', t); b.title = t; } });      // the buttons show only an icon: the words are in the tooltip and for screen readers
  setTimeout(() => { map.invalidateSize({pan: false}); if (typeof wire.v3d !== 'undefined' && wire.v3d && wire.v3d.resize) try { wire.v3d.resize(); } catch {} }, 380);
}
/* ---------- Phones stay upright, except in full screen ----------
   A phone held sideways shows a "turn upright" sheet, in full screen too (browsers cannot lock the orientation outside full screen, iOS never).
   Where the browser allows it (Android) the orientation is also locked to portrait, in full screen as well. */
const TURN = document.createElement('div'); TURN.className = 'turn-upright'; TURN.hidden = true; TURN.setAttribute('role', 'status');
TURN.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg><div>Turn your phone upright</div><small>Landscape is not used.</small>';
document.body.appendChild(TURN);
const SIDEWAYS = matchMedia('(pointer:coarse) and (orientation:landscape) and (max-height:520px)');
export function orientSync(){
  const host = document.fullscreenElement || document.body; if (TURN.parentNode !== host) host.appendChild(TURN);      // the browser's full screen shows only that element and what is inside it
  TURN.hidden = !SIDEWAYS.matches || EMBED;      // an embed has no panel to rearrange: it fills the frame in any orientation
  document.body.classList.toggle('turn-upright-on', !TURN.hidden);
  try {
    const so = /** @type {any} */ (screen.orientation);
    if (so && so.lock && PHONE_DEVICE()) { so.lock('portrait').catch(() => {}); }
  } catch {}
}
const PHONE_DEVICE = () => matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) <= 520;
SIDEWAYS.addEventListener('change', orientSync);
addEventListener('orientationchange', () => setTimeout(orientSync, 100));
export const isFull = () => $('stage').classList.contains('is-full') || $('app').classList.contains('visual-only');
orientSync();      // after isFull is defined
$('downHint').onclick = () => $('story').scrollIntoView({behavior: 'smooth', block: 'start'});
$('fsBtn').onclick = $('v3dFs').onclick = () => setFull(!isFull());
$('fullExit').onclick = () => setFull(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFull()) { setFull(false); e.preventDefault(); } });      // the key press is used up: leaving full screen is all it does (the 3D view's own Esc handler checks defaultPrevented)
document.addEventListener('fullscreenchange', () => { orientSync(); if (!document.fullscreenElement && $('stage').classList.contains('is-full')) setFull(false); });
/* ---------- Immersive full screen (touch screens): the controls fade away and the picture gets the whole screen ----------
   Dragging the picture clears the controls at once; they also fade after a few idle seconds; a tap on the bare picture brings them back (or clears them again).
   They stay while something needs them: an open layer menu or tools row, measuring, a cross-section, a historic photograph, keyboard focus. The round exit button never goes away. */
const IMM_DELAY = 3500, IMM_BUSY = '.layerbox.open, .v3d-photos.open, .v3d-sect:not([hidden]), .v3d.photo-on, .v3d.measuring, .v3d-mhint.show, .tools-open, #credits.open, #stage :focus-visible';
const IMM_CONTROL = 'button, a, input, label, .layerbox, .v3d-measure, .mapbar, .v3d-top, .v3d-sect, .v3d-photos, .v3d-mhint, .credits, .full-exit';
let immTimer = 0, immDrag = null;
const immOn = () => COARSE && isFull();
const immBusy = () => [...document.querySelectorAll(IMM_BUSY)].some(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');      // only what is on screen counts: the hidden photo strip of the map view carries the class `open` too
function immHide(){ clearTimeout(immTimer); if (immOn() && !immBusy()) document.body.classList.add('imm-idle'); }
function immShow(){ clearTimeout(immTimer); document.body.classList.remove('imm-idle'); if (immOn()) immTimer = setTimeout(function again(){ if (!immOn()) return; if (immBusy()) immTimer = setTimeout(again, 1500); else document.body.classList.add('imm-idle'); }, IMM_DELAY); }
export function immSync(){
  const on = immOn(); document.body.classList.toggle('imm', on);
  if (on) immShow(); else { clearTimeout(immTimer); document.body.classList.remove('imm-idle'); }
}
/* ---------- Full screen with a mouse: the same fade, on the pointer ----------
   After a few seconds without mouse movement the docks and menus fade out and the pointer hides; any movement, key or click brings them back. They stay while the pointer is over them or something is open (immBusy). */
const FADE_DELAY = 3500;
let fadeTimer = 0;
const fadeOn = () => !COARSE && isFull();
function fadeShow(){
  clearTimeout(fadeTimer); document.body.classList.remove('fade-idle'); if (!fadeOn()) return;
  fadeTimer = setTimeout(function again(){
    if (!fadeOn()) return;
    if (immBusy() || document.querySelector('.stage .mapbar:hover, .stage .v3d-measure:hover, .stage .layerbox:hover, .stage .v3d-top:hover')) fadeTimer = setTimeout(again, 1500);
    else document.body.classList.add('fade-idle');
  }, FADE_DELAY);
}
export function fadeSync(){
  const on = fadeOn(); document.body.classList.toggle('fade', on);
  if (on) fadeShow(); else { clearTimeout(fadeTimer); document.body.classList.remove('fade-idle'); }
}
['pointermove', 'pointerdown', 'wheel', 'keydown'].forEach(t => $('stage').addEventListener(t, () => { if (fadeOn()) fadeShow(); }, {passive: true, capture: true}));
(function(){
  const st = $('stage');
  st.addEventListener('pointerdown', e => { immDrag = e.pointerType === 'mouse' ? null : {x: e.clientX, y: e.clientY, moved: false}; }, true);
  st.addEventListener('pointermove', e => { if (immDrag && !immDrag.moved && immOn() && Math.hypot(e.clientX - immDrag.x, e.clientY - immDrag.y) > 8) { immDrag.moved = true; immHide(); } }, true);
  st.addEventListener('pointercancel', () => { immDrag = null; }, true);
  st.addEventListener('pointerup', e => {
    const d = immDrag; immDrag = null; if (!d || !immOn()) return;
    if (d.moved) return;                                                      // a drag ends with the picture clear
    if (e.target.closest && e.target.closest(IMM_CONTROL)) { immShow(); return; }      // a control was used: the timer starts again
    if (document.body.classList.contains('imm-idle')) immShow(); else immHide();
  }, true);
  st.addEventListener('focusin', () => { if (immOn()) immShow(); });
})();
/* the left panel scrolls: a cue at its bottom points to "Create and share" until that step is in view (not on phones, where the page scrolls) */
(function(){
  const box = document.querySelector('.controls'), cue = $('scrollCue'), target = $('shareGroup');
  let used = false;            // once something in "Create and share" has been clicked, the cue has done its job
  target.addEventListener('click', () => { used = true; upd(); }, true);
  const upd = () => {
    const scrollable = box.scrollHeight - box.clientHeight > 8 && getComputedStyle(box).overflowY !== 'visible' && !PHONE.matches;
    const inView = target.getBoundingClientRect().top < box.getBoundingClientRect().bottom - 80;
    const hide = used || !(scrollable && !inView); if (cue.hidden !== hide) cue.hidden = hide;      // only on change: the observer below watches this element too
  };
  box.addEventListener('scroll', upd, {passive: true}); addEventListener('resize', upd);
  if (window.ResizeObserver) new ResizeObserver(upd).observe(box);
  new MutationObserver(upd).observe(box, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden']});
  $('scrollCueBtn').onclick = () => target.scrollIntoView({behavior: 'smooth', block: 'start'});
  upd();
})();
/* phones: the visual is pinned at the top (css/style.css); the chevron in it makes it a short strip and back. The page keeps its place while the height changes. */
export function setMini(on){
  const stage = $('stage'); if (stage.classList.contains('mini') === on) return;
  const c = map.getCenter(), z = map.getZoom(), h0 = stage.getBoundingClientRect().height;
  stage.classList.toggle('mini', on); $('miniToggle').setAttribute('aria-expanded', !on); $('miniToggle').setAttribute('aria-label', on ? 'Make the visual larger' : 'Make the visual smaller');
  const dh = stage.getBoundingClientRect().height - h0; if (PHONE.matches && scrollY > 0 && dh) scrollBy(0, dh);
  map.invalidateSize({pan: false}); map.setView(c, z, {animate: false}); clip && clip();
}
{ const st = $('stage'), upd = () => { const sc = PHONE.matches && (scrollY > 4 || st.classList.contains('mini'));      // a strip at the top of the page also needs its handle, to open it again
    document.body.classList.toggle('scrolled', sc); if (sc) { const r = st.getBoundingClientRect(); document.documentElement.style.setProperty('--stage-bottom', Math.round(r.bottom) + 'px'); document.documentElement.style.setProperty('--stage-top', Math.round(r.top) + 'px'); } };      // --stage-top: where the pinned picture really starts (a phone's status bar and Dynamic Island make it higher than the env() guess), so the cover above it always reaches it
  addEventListener('scroll', upd, {passive: true}); addEventListener('resize', upd); new ResizeObserver(upd).observe(st); upd(); }
{ const st = $('stage'); let down = null, swallow = 0;      // tap anywhere on the strip opens it large: judged on pointer up (the map and the 3D view can swallow the click), the click that follows is stopped
  const skip = e => e.target.closest('button, a, input, label, select, .handle, .v3d-div');
  st.addEventListener('pointerdown', e => { down = (PHONE.matches && st.classList.contains('mini') && e.isPrimary && !skip(e)) ? {x: e.clientX, y: e.clientY, t: Date.now()} : null; }, true);
  st.addEventListener('pointercancel', () => { down = null; }, true);
  st.addEventListener('pointerup', e => { const d = down; down = null; if (!d || !e.isPrimary || !st.classList.contains('mini')) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.t > 600) return;      // a drag or a long press is the map's
    swallow = Date.now(); setMini(false); }, true);
  st.addEventListener('click', e => { if (Date.now() - swallow < 500) { e.stopPropagation(); e.preventDefault(); return; }
    if (!PHONE.matches || !st.classList.contains('mini') || skip(e)) return; e.stopPropagation(); setMini(false); }, true); }
{ const h = $('miniToggle'); let y0 = null, moved = false;
  h.addEventListener('pointerdown', e => { y0 = e.clientY; moved = false; try { h.setPointerCapture(e.pointerId); } catch (_) {} });
  h.addEventListener('pointerup', e => { if (y0 === null) return; const d = e.clientY - y0; y0 = null;
    if (Math.abs(d) > 14) { moved = true; setMini(d < 0); }      // swipe up: strip, down: large
    else setMini(!$('stage').classList.contains('mini')); });
  h.addEventListener('pointercancel', () => { y0 = null; });
  h.onclick = null; }
PHONE.addEventListener('change', () => setMini(false));


/* Colour composition buttons: a small drawn glacier in the colours each band combination gives (rock, ice, snow, lake, plants), as in the About chapter "The colours" */
export const SW_PALETTE = {
  natural: {rock: '#8f8679', rock2: '#6e675c', ice: '#d9e5ea', snow: '#fbfdfe', crev: '#aebfca', lake: '#5d8f9f', veg: '#5c8c3a'},
  false1:  {rock: '#857d72', rock2: '#625c53', ice: '#b6c3cc', snow: '#f7fafb', crev: '#8f9fab', lake: '#1d2b3b', veg: '#c22f3f'},
  false2:  {rock: '#d6cfbf', rock2: '#b9b2a2', ice: '#c9473d', snow: '#f06a5c', crev: '#a53630', lake: '#0b0f14', veg: '#aab59a'},
  false3:  {rock: '#2a2fc4', rock2: '#1c1f96', ice: '#f08a2a', snow: '#fff04a', crev: '#e8501f', lake: '#e8601a', veg: '#3a40d8'}      /* Hot: rock blue, ice orange, snow yellow, as the picture (see hotEvalscript) */
};
export function swatchSvg(k){
  const c = SW_PALETTE[k];
  return `<svg viewBox="0 0 90 44" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="90" height="44" fill="${c.rock}"/>
    <path d="M0 44V30L12 22 20 28 30 18 40 26V44Z" fill="${c.rock2}"/>
    <path d="M0 44V27c6-4 10 1 16-2 4-2 8 2 12 6l4 13z" fill="${c.veg}"/><path d="M58 44c3-6 8-8 13-11s12-4 19-6v17z" fill="${c.veg}"/><path d="M0 22c4-3 8-2 10 2s-4 4-10 3z" fill="${c.veg}"/>
    <path d="M28 0H70L78 6 60 12 66 22 56 34 44 38 40 28 34 16 18 8Z" fill="${c.snow}" opacity=".95"/>
    <path d="M34 16 40 28 44 38 56 34 66 22 60 12 46 12Z" fill="${c.ice}"/>
    <path d="M40 18l9 3M43 26l11 1M47 33l8-3" stroke="${c.crev}" stroke-width="1.2" fill="none"/>
    <ellipse cx="52" cy="40" rx="9" ry="3.6" fill="${c.lake}"/></svg>`;
}
document.querySelectorAll('.swatches .sw').forEach(b => { const k = b.dataset.style || (b.id === 'styleNatural' ? 'natural' : b.id === 'styleFalse1' ? 'false1' : b.id === 'styleFalse2' ? 'false2' : 'false3'); b.querySelector('i').innerHTML = swatchSvg(k); });

export let pendingChoice = null;
export function chooseGlacier(id){
  const next = GLACIERS.find(x => x.id === id);
  if (needsOutline(next)) { pendingChoice = id; loadOutline(next).then(() => { if (pendingChoice === id) chooseGlacier(id); }); return; }      // the 2023 outline comes first (a file per glacier); then the choice is made as usual. A later click on another glacier wins
  pendingChoice = null;
  const first = !glacierPicked;
  setGlacierPicked(true); updatePickHint();
  const sat = $('satToggle'); if (!sat.checked) { sat.checked = true; sat.dispatchEvent(new Event('change')); }      // choosing a glacier switches the Sentinel-2 picture on (it may have been switched off in the layer menu)
  if (state.glacier === id) {                           // the glacier that was already selected: the first click still has to show its outlines
    stopPlay(); if (first) { if (state.checked) { setCompareLayers(); buildTimelapse(); } drawOutlines(); writeHash(); updateTrailClip(); updateAerial(); updateMapYears(); updateSight(); drawBoxes(); updateBoxes(); renderMobileBar(); renderGlacierList(); }      // the first click on the glacier that was preselected also has to set the trail area and the line of sight
    if (first && checkGen === 0) checkYears();      // a region that opens on its overview has not searched yet
    return focusTongue();
  }
  stopPlay();
  const special = state.oldestAerial ? 'oldest' : state.latest ? 'latest' : null;      // Oldest or Latest stays chosen when the next glacier is clicked
  state.glacier = id; renderGlacierList(); renderStory(); drawOutlines(); drawBoxes(); updateBoxes(); updateTrailClip(); updateAerial(); updateMapYears(); updateSight(); drawTonguePin(); focusTongue(); writeHash();
  checkYears().then(() => keepSpecial(id, special));                 // each glacier has its own clearest scenes
}
/* the new glacier gets the same special picture as the old one had (its search has finished: the scenes of every year are known) */
function keepSpecial(id, special, tries = 0){
  if (!special || state.glacier !== id || viewMode === '3d' || !state.checked) return;
  if (special === 'latest') { showLatest(state.latestSide); return; }
  const g = currentGlacier(); ensureOldest(g);
  if (oldestAerial.get(id) === undefined && tries < 50) { setTimeout(() => keepSpecial(id, special, tries + 1), 200); return; }      // the oldest picture of this glacier is still being looked up
  if (oldestAerial.get(id)) showOldest(state.oldestSide);
}
export function swipeToClose(head, panel, close, enabled = () => true){      // dragging a sheet's header down closes it; a short drag springs back (the sheets of phones: glaciers, create and share, full-screen layers)
  let y0 = null, dy = 0, moved = false;
  head.addEventListener('pointerdown', e => {
    if (!enabled() || (e.target.closest && e.target.closest('input, select, a, .g-close, .vs-close'))) return;
    y0 = e.clientY; dy = 0; moved = false; head.setPointerCapture(e.pointerId); panel.style.transition = 'none';
  });
  head.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); if (dy > 6) moved = true; panel.style.transform = `translateY(${dy}px)`; });
  const end = () => {
    if (y0 === null) return;
    y0 = null; panel.style.transition = 'transform .15s ease-out'; panel.style.transform = '';
    if (dy > 80) close();
  };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  head.addEventListener('click', e => { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);      // a drag is not a tap on the header button
}
export const MP_CHEV = '<svg class="mp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
export let gSheet = null;
export function glacierSheet(){                 // the sheet with the ten glaciers, made the first time it is needed
  if (gSheet) return gSheet;
  gSheet = document.createElement('div'); gSheet.className = 'g-sheet'; gSheet.setAttribute('role', 'dialog'); gSheet.setAttribute('aria-modal', 'true'); gSheet.setAttribute('aria-label', 'Choose a glacier');
  gSheet.innerHTML = '<div class="g-back"></div><div class="g-panel"><div class="g-head"><span class="g-grip" aria-hidden="true"></span><h2 class="step-h"><span class="num">01</span>Choose a glacier</h2><button type="button" class="g-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><ul class="g-list"></ul></div>';
  document.body.appendChild(gSheet);
  gSheet.querySelector('.g-back').onclick = gSheet.querySelector('.g-close').onclick = () => setGlacierSheet(false);
  gSheet.querySelector('.g-list').onclick = e => { const b = e.target.closest('button[data-id]'), sb = e.target.closest('button[data-sub]'); if (b) { setGlacierSheet(false); chooseGlacier(b.dataset.id); } else if (sb) { setGlacierSheet(false); focusSub(currentGlacier(), +sb.dataset.sub); } };
  document.addEventListener('keydown', e => {
    if (!gSheet.classList.contains('open')) return;
    if (e.key === 'Escape') { setGlacierSheet(false); return; }
    if (e.key !== 'Tab') return;      // keep the focus inside the sheet (the page behind is inert, this covers browsers without it)
    const f = [...gSheet.querySelectorAll('button:not([disabled])')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!gSheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  swipeToClose(gSheet.querySelector('.g-head'), gSheet.querySelector('.g-panel'), () => setGlacierSheet(false));
  return gSheet;
}
export function setGlacierSheet(open){
  const s = glacierSheet(), btn = $('mGlacier');
  s.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); document.body.classList.toggle('sheet-open', open);
  for (const el of document.body.children) if (el !== s && el.tagName !== 'SCRIPT') el.toggleAttribute('inert', open);      // the page behind cannot be tabbed into or read while the sheet is open
  if (open) { const cur = s.querySelector('button[aria-pressed="true"]') || s.querySelector('.g-list button'); cur.focus(); cur.scrollIntoView({block: 'center'}); }
  else btn.focus({preventScroll: true});
}
export function renderMobileBar(){                 // phones: the glacier list becomes one card, and a tap opens the sheet with the glaciers
  const btn = $('mGlacier'), g = glacierPicked ? currentGlacier() : null;      // before the first choice nothing is selected: the card asks for one
  const card = g ? `<span class="mp-rank">${GLACIERS.indexOf(g) + 1}</span><span class="mp-name">${g.name}</span><span class="mp-area">${areaText(g, 2)} km²</span>${MP_CHEV}` : `<span class="mp-name">Tap to choose a glacier</span>${MP_CHEV}`;
  if (btn._card !== card) { btn._card = card; btn.innerHTML = card; }
  btn.classList.toggle('placeholder', !g);
  btn.onclick = () => setGlacierSheet(true);
  const max = Math.max(...GLACIERS.map(rankArea)), list = glacierSheet().querySelector('.g-list');
  const html = GLACIERS.map((x, i) => `<li><button type="button" data-id="${x.id}" aria-pressed="${!!g && x.id === g.id}"><span class="rank">${i + 1}</span><span class="name">${x.name}</span><span class="area">${areaText(x, 2)} km²</span><i class="g-bar"><b style="width:${(rankArea(x) / max * 100).toFixed(1)}%"></b></i></button></li>${x.subs && g && x.id === g.id ? x.subs.map((sb, k) => `<li class="sub"><button type="button" data-sub="${k}" title="${subTitle(sb).replace(/"/g, '&quot;')}"><span class="rank"></span><span class="name">${sb.name}${sb.approx ? '<sup>≈</sup>' : ''}</span><span class="area">${sb.areaKm2.toLocaleString('en-US', {maximumFractionDigits: 1})} km²</span></button></li>`).join('') : ''}`).join('');
  if (list._html !== html) { list._html = html; list.innerHTML = html; }      // this runs with every redraw of the page: the rows must stay put under a finger that is about to tap one
}

/* Map tools on phones: layers and measuring live behind two small buttons */
export function setMore(open){
  setTimeout(() => clip(), 0);
  document.querySelector('.mapbar').classList.toggle('more-open', open); $('app').classList.toggle('more-open', open);
  $('moreBtn').setAttribute('aria-expanded', open); $('moreBtn').setAttribute('aria-pressed', open);
}
export const layerBoxNow = () => viewMode === '3d' && PHONE.matches ? $('v3dLayers') : $('layerbox');      // phones: one bar under the visual opens the menu of the view that is shown
export function setLayers(open){
  const box = layerBoxNow();
  if (open) $('layerbox').querySelector('.lb-tip button')?.click();      // opening the menu (the phone button, not the desktop header) ends the first-visit cue: its pulsing red frame must not stay around the open menu
  [$('layerbox'), $('v3dLayers')].forEach(x => x.classList.toggle('open', x === box && open));
  updateLayerMore();
  $('layersBtn').setAttribute('aria-expanded', open); $('layersBtn').setAttribute('aria-pressed', open);
}
/* Layer box on phones: show the fade and chevron at the bottom while more items can be scrolled to */
export function updateLayerMore(){
  const b = $('layerbox'); b.classList.toggle('more', b.classList.contains('open') && b.scrollHeight - b.scrollTop - b.clientHeight > 6);
}
$('layerbox').addEventListener('scroll', updateLayerMore, {passive: true});
addEventListener('resize', updateLayerMore);
if (window.ResizeObserver) new ResizeObserver(updateLayerMore).observe(document.querySelector('#layerbox .lb-body'));
/* On phones the For Your Ice box sits at the very bottom of the page; elsewhere it stays in the settings panel */
export const FYI = document.querySelector('a.fyi'), FYI_HOME = FYI.parentNode, FYI_PHONE = matchMedia('(max-width:720px), (max-width:950px) and (orientation:landscape) and (max-height:520px)');
export const FYI_BY = document.querySelector('.fyi-by');      // the byline stays under the box, wherever the box is
/* phones: About Tongues from Space is not part of the white glacier card, it sits loose under it (the story is redrawn often, so the new copy is moved out each time; wide screens put it back) */
export function placeAbout(){
  const slot = $('fyiSlot'), story = $('story');
  if (FYI_PHONE.matches) { const fresh = story.querySelector('.about-wrap > details.about'); if (fresh) { slot.querySelectorAll(':scope > details.about').forEach(x => x.remove()); slot.insertBefore(fresh, slot.firstChild); } }
  else { const d = slot.querySelector(':scope > details.about'), w = story.querySelector('.about-wrap'); if (d && w) { w.querySelectorAll(':scope > details.about').forEach(x => x.remove()); w.insertBefore(d, w.firstChild); } }
}
export function placeFyi(){ if (FYI_PHONE.matches) { const slot = $('fyiSlot'), inv = slot.querySelector('.phone-invite'); slot.appendChild(FYI); if (inv) slot.appendChild(inv); slot.appendChild(FYI_BY); } else { FYI_HOME.appendChild(FYI); $('story').appendChild(FYI_BY); } placeAbout(); }      // phones: For Your Ice, the social links and GitHub note, then the byline last, loose under the About card
/* The byline ("Glacier visuals, done your way / By J. Braakhekke") sits at the bottom of the right panel; the panel is redrawn often, so it is put back last each time */
{
  const story = $('story'), keep = () => { if (!FYI_PHONE.matches && story.lastElementChild !== FYI_BY) story.appendChild(FYI_BY); placeAbout(); };
  keep(); new MutationObserver(keep).observe(story, { childList: true });
}
FYI_PHONE.addEventListener('change', placeFyi); placeFyi();
/* on phones the social links and the GitHub note sit below the For Your Ice box (css hides the copy in the About block there) */
{ const d = document.createElement('div'); d.className = 'phone-invite'; d.innerHTML = inviteHtml(); $('fyiSlot').appendChild(d); placeFyi(); }

/* phones in portrait: the map's layer box moves out of the visual, to a panel below it; the dock button opens it */
export function placeLayers(){
  const lbx = $('layerbox'), l3 = $('v3dLayers'), inflow = PHONE.matches;
  [lbx, l3].forEach(x => x.classList.toggle('in-flow', inflow));
  if (inflow) $('stageSlot').after(lbx, l3); else { $('stage').appendChild(lbx); $('v3d').appendChild(l3); }
}
PHONE.addEventListener('change', placeLayers); placeLayers();
export const LAND = matchMedia('(max-width:950px) and (orientation:landscape) and (max-height:520px)');      // phone held sideways: the menu slides in from the right edge of the map; its chevron (pointing right) and a press on the map close it
swipeToClose($('layerbox').querySelector('.lb-head'), $('layerbox'), () => setLayers(false), () => document.body.classList.contains('has-full') && $('layerbox').classList.contains('in-flow') && $('layerbox').classList.contains('open'));      // full screen: the layer menu is a sheet from the bottom edge
swipeToClose($('v3dLayers').querySelector('.lb-head'), $('v3dLayers'), () => setLayers(false), () => document.body.classList.contains('has-full') && $('v3dLayers').classList.contains('in-flow') && $('v3dLayers').classList.contains('open'));
$('lbToggle').addEventListener('click', e => { if (LAND.matches) { e.stopImmediatePropagation(); setLayers(false); } }, true);
$('v3dLbToggle').addEventListener('click', e => { if (LAND.matches) { e.stopImmediatePropagation(); setLayers(false); } }, true);
$('lbToggle').addEventListener('click', e => { if ($('layerbox').classList.contains('in-flow')) { e.stopImmediatePropagation(); setLayers(false); document.body.classList.remove('x-layers'); } }, true);
$('v3dLbToggle').addEventListener('click', e => { if ($('v3dLayers').classList.contains('in-flow')) { e.stopImmediatePropagation(); setLayers(false); document.body.classList.remove('x-layers'); } }, true);
$('layersBtn').onclick = () => { const open = !layerBoxNow().classList.contains('open'); setLayers(open); if (open) setMore(false); };   // one panel at a time
/* A press on the viewer (map or 3D picture) closes an open layer menu; presses inside the menus and on their buttons do not */
document.addEventListener('pointerdown', e => {
  const t = e.target; if (!t.closest || !t.closest('#stage') || t.closest('#layerbox, #v3dLayers, #layersBtn, #v3mLayers, .tl-row, .tl-dots')) return;      // the dock's year steps and timeline change the year: the layer menu stays open
  if ($('layerbox').classList.contains('in-flow')) { if ($('layerbox').classList.contains('open') || $('v3dLayers').classList.contains('open')) setLayers(false); return; }
  if (LAND.matches) { if ($('layerbox').classList.contains('open') || $('v3dLayers').classList.contains('open')) setLayers(false); return; }
  [[$('layerbox'), $('lbToggle')], [$('v3dLayers'), $('v3dLbToggle')]].forEach(([box, btn]) => { if (!box.classList.contains('min')) btn.click(); });
}, true);
$('moreBtn').onclick = () => { const open = !document.querySelector('.mapbar').classList.contains('more-open'); setMore(open); if (open) setLayers(false); };

/* Phones: each dock (map, 3D) has a small tab on its top edge. Tap it, or swipe the dock down, and the dock folds away to one round button in the corner; tap that, or swipe it up, and it unfolds. The choice is remembered. */
{
  const KEY = 'tsf-dock-min', docks = [document.querySelector('.mapbar'), $('v3dMeasure')].filter(Boolean);
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  let folded = false; try { folded = localStorage.getItem(KEY) === '1'; } catch (e) {}
  const apply = () => {
    docks.forEach(d => { d.classList.toggle('dock-min', folded); const b = d.querySelector('.dock-fold'); b.setAttribute('aria-expanded', !folded); b.setAttribute('aria-label', folded ? 'Show the tools' : 'Hide the tools'); });
    document.body.classList.toggle('docks-folded', folded);
  };
  const set = v => { folded = v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} if (v) { setLayers(false); setMore(false); } apply(); };
  docks.forEach(d => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dock-fold'; b.innerHTML = CHEV; d.prepend(b);
    b.addEventListener('click', () => set(!folded));
    let y0 = null;      // a swipe on the dock (down: fold) or on the folded button (up: unfold)
    d.addEventListener('touchstart', e => { y0 = e.touches.length === 1 ? e.touches[0].clientY : null; }, {passive: true});
    d.addEventListener('touchend', e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (!folded && dy > 28 && !e.target.closest('.tl-track, .tl2-track, input')) set(true); else if (folded && dy < -20) set(false); }, {passive: true});
  });
  apply();
}

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
/* The link of the view on screen: the address (glacier, mode, years, 3D view) plus what it does not keep: colour style(s), the 1850 outline, the trails and, on an ice cap, the outlet that is in focus. Opened again, it shows the same. */
export function shareLink(){
  const p = new URLSearchParams(location.hash.slice(1)), g = currentGlacier();
  if (state.style !== 'natural') p.set('s', state.style);
  if (state.mode === 'compare' && state.styleB && state.styleB !== state.style) p.set('s2', state.styleB);
  if (prefs.old) p.set('ol', '1');
  if (prefs.trails === true) p.set('tr', '1');
  if (g && g.subs && subFocus && subFocus.gid === g.id) p.set('sub', subFocus.k);
  return location.href.split('#')[0] + '#' + p.toString().replace(/%2C/g, ',');
}
export async function shareView(){
  const g = currentGlacier(), only = false, url = only ? embedLink() : shareLink();      // the tick: the link opens the picture or animation only (embed=1)
  const text = state.mode === 'single' ? `${g.name}, ${state.one}` : state.mode === 'timelapse' ? `${g.name}, ${state.from} to ${state.to}` : `${g.name}, ${state.a} and ${state.b}`;
  if (navigator.share) {
    try { await navigator.share({title: REGION.shareTitle, text, url}); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); showNotice(only ? 'Link copied. It opens the picture only, with a link to the full page.' : 'Link copied. Paste it anywhere to share this view.'); }
  catch { prompt('Copy this link:', url); }
}
$('shareBtn').onclick = shareView;
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.social-share')) shareView(); });      // the share symbol beside the social links shares the view on screen, as the Share button in step 3 does

/* Embed: the iframe code of the view on screen. The link is the shared link plus embed=1 (the page then shows the picture only); the colour style and the 1850 outline,
   which the address does not keep, are added to it. */
export function embedLink(){
  const p = new URLSearchParams(location.hash.slice(1));
  if (state.style !== 'natural') p.set('s', state.style);
  if (state.mode === 'compare' && state.styleB && state.styleB !== state.style) p.set('s2', state.styleB);
  if (prefs.old) p.set('ol', '1');
  p.set('embed', '1');
  return location.href.split('#')[0] + '#' + p.toString().replace(/%2C/g, ',');
}
export function embedCode(){
  const g = currentGlacier();
  const title = `${g.name} from space - Tongues from Space`.replace(/"/g, '&quot;');
  return `<iframe src="${embedLink()}" title="${title}" width="100%" height="520" style="border:0;max-width:100%" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`;
}
/* inside an embed, the pill leads to the same view on the full page (embed=1 left out); the address is read at the click, so it follows what the visitor did since */
if (EMBED) {
  const open = () => { const p = new URLSearchParams(location.hash.slice(1)); p.delete('embed'); $('embedOpen').href = location.href.split('#')[0] + '#' + p.toString().replace(/%2C/g, ','); };
  open(); $('embedOpen').addEventListener('click', open);
}
$('embedBtn').onclick = () => {
  const box = $('embedBox'), open = box.hidden;
  if (open) closeOtherSharePanes('embedBox');
  box.hidden = !open; $('embedBtn').setAttribute('aria-expanded', open);
  if (open) { $('embedCode').value = embedCode(); $('embedPreview').href = embedLink(); $('embedCopy').textContent = 'Copy code'; }
};
/* a click or tap anywhere outside the embed button and its box closes the box */
document.addEventListener('pointerdown', e => { const box = $('embedBox'); if (box.hidden || e.target.closest('#embedBox, #embedBtn')) return; box.hidden = true; $('embedBtn').setAttribute('aria-expanded', 'false'); });
$('embedCopy').onclick = async () => {
  $('embedCode').value = embedCode(); $('embedPreview').href = embedLink();      // the view may have changed since the box opened
  try { await navigator.clipboard.writeText($('embedCode').value); $('embedCopy').textContent = 'Copied'; }
  catch { $('embedCode').select(); $('embedCopy').textContent = 'Press Ctrl/Cmd+C'; }
};

/* Mobile data: a timelapse loads one image per year the first time; only the years not stored on this phone yet are counted */
export let dataNoteShown = false;
export async function mobileDataNote(){
  if (!COARSE || dataNoteShown) return;
  const g = currentGlacier(), n = await imagesToFetch(g, tlFrames());
  if (n <= 2 || dataNoteShown) return;
  dataNoteShown = true;
  showNotice(`The first time, a timelapse loads about ${Math.round(n * 1.2)} MB of images (${n} years not yet on your phone). On mobile data you may prefer Wi-Fi. After that they are stored on your phone.`);
}
