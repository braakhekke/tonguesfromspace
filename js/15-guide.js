import { state, currentGlacier, viewMode, okYears, EMBED } from './04-state.js';
import { stopPlay, clip } from './05-map.js';
import { refreshAll } from './07-render.js';
import { setPanel } from './09-phones.js';
import { loadCountries } from './10-animation.js';
import { setView, v3d, v3dCtx, v3dBusy, v3dSplit, M3, photoOn, leavePhoto, loadPhotos } from './11-view3d.js';
import { openTeaser, teaserOpen } from './13-teaser.js';
import { $, phone, calm, sleep, shown, ICON, input, did, createGuide } from './guide-core.js';
/* =====================================================================
   15. The guide: things to try, done on the page itself
   ===================================================================== */
/* The engine is js/guide-core.js (shared with the size page); this section holds what belongs to the Explorer:
   its chapters (Start here, Look closer, Create and share, and the link to the size page), the demo of the slider line and the locator inset.
   A step is finished by using the real control: each beat reads the page's state (state, the 3D camera, M3, the buttons).
   First visit: the card opens by itself, after the demo film if that plays. Not in an embed. "Guide" in the left panel opens it again. */
const stage = $('stage');
/** @param {Element|null} el */
const press = el => !!el && el.getAttribute('aria-pressed') === 'true';
const q = s => /** @type {HTMLElement} */ (document.querySelector(s));

let PHOTOS = null; if (FEATURES.photos) loadPhotos().then(j => { PHOTOS = j; });      // which glaciers have historical photographs (the 3D view's own file)
const photoKey = g => g && (g.inv ? g.inv.id : g.id);

/* ---------- helpers for the set-up of a track ---------- */
const toMap = async api => { if (viewMode === '3d') { await api.until(() => !v3dBusy); setView('map'); await sleep(350); } };
const to3D = async api => { if (viewMode !== '3d') { await api.until(() => !v3dBusy); setView('3d'); } await api.until(() => !!v3d && !!v3dCtx && !v3dBusy); await sleep(600); };
const firstLast = () => { const ys = okYears(); if (ys.length < 2) throw Error('This glacier has fewer than two clear years, so there is nothing to compare yet.'); return [ys[0], ys[ys.length - 1]]; };
const oneYear = () => { if (state.mode !== 'single') { state.mode = 'single'; state.one = firstLast()[1]; refreshAll(); } };
const playTarget = () => [...stage.querySelectorAll('.tl-play')].find(shown) || $('playBtn');
const sectOpen = () => M3.shapes.some(s => s.mode === 'sect');
const paneOpen = () => !$('videoSheet').hidden;
const openPane = async (api, kind) => { stopPlay(); if (shown($('pinCard')) && $('pinClose')) { $('pinClose').click(); await sleep(300); }      // a standing pin keeps the download pane shut: the pin goes first
  if (photoOn) { leavePhoto(true); await sleep(300); } await api.until(() => !v3dBusy); if (!paneOpen()) $('videoBtn').click();
  try { await api.until(() => paneOpen() && shown($('videoFrame')), 8000); } catch (e) { if (e.message === 'cancelled') throw e; const n = q('.notice,#notice'); throw Error(n && shown(n) && n.textContent.trim() ? n.textContent.trim() : 'The download pane did not open. Try again in a moment.'); }      // the Explorer says why it will not make a picture (for example: the satellite layer is off)
  if (!press($(kind))) $(kind).click(); await sleep(400); };
const fmtOn = () => (['vfWide', 'vfReel', 'vfFeed', 'vfCustom'].find(id => press($(id))) || '');
const layerBox = () => viewMode === '3d' ? $('v3dLayers') : $('layerbox');
const pinBtn = () => viewMode === '3d' ? $('v3mPin') : $('pinBtn');
const swatches = () => shown($('imageGroup')) ? $('imageGroup') : $('swatchesA');
const olderOn = () => /** @type {HTMLInputElement} */ ($('landsatToggle')).checked;
const olderSwitch = () => [...document.querySelectorAll('.yr-landsat button')].find(shown) || null;
const olderLimit = () => { const m = (olderSwitch() || {textContent: ''}).textContent.match(/\d{4}/); return m ? +m[0] : 0; };      // the year in the switch's own label ("before ...")
const yearsBox = () => [$('yearsOne'), $('yearsA'), $('yearsRange')].find(shown) || null;
const tab = k => q('#story [data-tab="' + k + '"]');
let limit = 0;

/* ---------- the things to try ---------- */
const START = [
  { id: 'compare', icon: 'modeCompare', title: 'Two summers', line: 'Drag one year over another', where: 'Mode › Slider', used: 'modeCompare',
    async setup(api){
      stopPlay(); await toMap(api); const [lo, hi] = firstLast();
      if (state.mode !== 'compare' || !state.available[state.a] || !state.available[state.b] || state.a === state.b) { state.a = lo; state.b = hi; state.mode = 'compare'; refreshAll(); }
      await api.until(() => shown($('handle')), 15000);
    },
    beats: [
      { say: 'Drag the line across the tongue.', target: () => $('handle'),
        demo: (api, c) => { if (demoSeen) return; picturesWait(api).then(async () => { if (api.ctx !== c || api.phase !== 'beat') return; await sweep(api); if (api.ctx === c) c.base = state.split; }); },
        init: c => { c.base = state.split; }, done: c => did('down', 'handle', c.t0) && Math.abs(state.split - c.base) > .04,
        praise: 'That is the Slider: two years, one view.' },
      { say: 'Now pick another year for one side.', target: () => $('yearsA'),
        init: c => { c.base = state.a + '|' + state.b; }, done: c => c.base !== state.a + '|' + state.b,
        praise: 'Any two years, side by side.' }
    ] },
  { id: 'timelapse', icon: 'modeTimelapse', title: 'Every summer', line: 'Play the years in order', where: 'Mode › Timelapse', used: 'modeTimelapse',
    async setup(api){
      stopPlay(); await toMap(api); const [lo, hi] = firstLast();
      state.from = lo; state.to = hi; state.frame = 0; state.mode = 'timelapse'; refreshAll();
      await api.until(() => shown(playTarget()), 15000);
    },
    beats: [
      { say: 'Press play.', target: playTarget, done: () => state.playing, praise: 'One picture per year, in order.', quick: true },
      { say: 'Pause on a summer that catches your eye.', target: playTarget, init: c => { c.ran = false; },
        done: c => { if (state.playing && !$('playBtn').querySelector('.spin-s')) c.ran = true; return c.ran && !state.playing; },
        praise: 'Drag along the years to step through them yourself.' }
    ] },
  { id: 'depth', icon: 'view3dBtn', title: 'Into the valley', line: 'Turn it in 3D, cut through the ice', where: 'View › 3D', used: 'view3dBtn',
    async setup(api){ stopPlay(); oneYear(); await to3D(api); },      // one picture: nothing but the valley to turn (the slider's line would catch the drag)
    beats: [
      { say: () => phone() ? 'Drag with one finger to turn the valley.' : 'Drag the picture to turn the valley.', drag: () => $('v3dCanvas'),
        init: c => { c.base = v3d && v3d.getCam(); },
        done: c => { const k = v3d && v3d.getCam(); return !!k && !!c.base && did('down', 'v3d', c.t0) && (Math.abs(k.az - c.base.az) > .1 || Math.abs(k.el - c.base.el) > .05); },
        praise: 'The satellite picture, laid over the terrain.' },
      { say: () => sectOpen() ? '' : M3.mode === 'sect' ? 'Now click on one side of the ice, then on the other.' : 'Look under the ice: press this tool.', target: () => M3.mode === 'sect' ? null : $('v3mSect'),
        skipIf: () => !shown($('v3mSect')), done: sectOpen,
        praise: 'A cut through the glacier. Its note says where the depth comes from.' }
    ] }
];
const CLOSER = [
  { id: 'colours', icon: ICON.colours, title: 'Other colours', line: 'The same picture in another light', where: 'Compare › Colour composition', used: swatches,
    beats: [
      { say: 'Pick another colour composition.', target: swatches, init: c => { c.base = state.style + '|' + state.styleB; }, done: c => c.base !== state.style + '|' + state.styleB, praise: 'Same scene, other bands of the satellite.' },
      { say: 'The “i” says what these colours show.', target: () => [$('styleI'), $('styleIA')].find(shown) || null, done: () => [$('styleI'), $('styleIA')].some(b => b && b.getAttribute('aria-expanded') === 'true'), praise: 'Every composition has its own note.' }
    ] },
  { id: 'layers', icon: 'lbToggle', title: 'Layers', line: 'Outlines, trails, other maps', where: 'Picture › Layers', used: () => layerBox().querySelector('.lb-head'),
    beats: [
      { say: 'Open Layers.', target: () => layerBox().querySelector('.lb-head'), skipIf: () => !layerBox().classList.contains('min'), done: () => !layerBox().classList.contains('min'), praise: 'Everything that can lie on the picture.', quick: true },
      { say: 'Switch one on or off.', target: layerBox, done: c => did('change', layerBox().id, c.t0), praise: 'Layers stay on in the pictures you make.' }
    ] },
  { id: 'pin', icon: 'pinBtn', title: 'Drop a pin', line: 'One place, year by year', where: 'Toolbar › Pin', used: pinBtn,
    beats: [
      { say: () => press(pinBtn()) ? 'Now click a place on the ice.' : 'Press the pin.', target: () => press(pinBtn()) ? null : pinBtn(), done: () => pinBtn().classList.contains('placed'), praise: 'The pin keeps that place while you change the year.' }
    ] },
  { id: 'history', icon: ICON.photo, title: 'Then and now', line: 'An old photograph, from where it was taken', where: '3D › Historical images', used: () => $('l3PhotosRow'),
    avail: () => { const g = currentGlacier(); return !!(PHOTOS && g && (PHOTOS[photoKey(g)] || []).length); },
    async setup(api){
      stopPlay(); oneYear(); await to3D(api);
      await api.until(() => !!(v3dCtx && v3dCtx.photos && v3dCtx.photos.length), 20000);
      const t = /** @type {HTMLInputElement} */ ($('l3Photos')); if (!t.checked) { t.checked = true; t.dispatchEvent(new Event('change')); }
      await api.until(() => !!document.querySelector('#v3dPhotos .ph'), 15000);
    },
    leave(){ if (photoOn) leavePhoto(true); },
    beats: [
      { say: 'Pick an old photograph.', target: () => $('v3dPhotos'), done: () => !!photoOn, praise: 'The camera flies to where the photographer stood.' },
      { say: 'Drag the line between then and now.', target: () => shown($('v3dDiv')) ? $('v3dDiv').querySelector('.v3d-handle') || $('v3dDiv') : null, init: c => { c.base = v3dSplit; },
        done: c => did('down', 'v3dDiv', c.t0) && Math.abs(v3dSplit - c.base) > .04, praise: 'Its caption names the photograph and its archive.' }
    ] },
  { id: 'older', icon: ICON.older, title: 'Older imagery', line: 'Pictures from before Sentinel-2', where: 'Compare › Older imagery', used: olderSwitch,
    avail: () => !!olderSwitch() || olderOn(),
    async setup(api){ await toMap(api); },
    beats: [
      { say: 'Switch on older imagery.', target: olderSwitch, skipIf: olderOn, init: () => { limit = olderLimit(); }, done: olderOn, praise: 'More years appear in the list.', quick: true },
      { say: 'Pick one of the early years.', target: yearsBox, skipIf: () => !limit && !olderLimit(), done: () => [state.one, state.a, state.b, state.from].some(y => y && y < (limit || olderLimit())), praise: 'Landsat pictures: older, and less sharp.' }
    ] },
  { id: 'story', icon: ICON.story, title: 'The glacier’s story', line: 'Discover, Stats, Switzerland', where: 'Right panel', used: () => $('story'),
    async setup(api){ setPanel('right', false, false); await api.until(() => shown(tab('figures')), 15000); },
    beats: ['look', 'figures', 'swiss'].map((k, i) => ({
      say: () => (i ? 'Now the ' : 'Open the ') + (tab(k) ? tab(k).textContent.trim() : '') + ' tab.', target: () => tab(k), skipIf: () => !tab(k) || tab(k).getAttribute('aria-selected') === 'true',
      done: () => tab(k).getAttribute('aria-selected') === 'true', quick: i < 2,
      praise: ['What there is to discover at this glacier.', 'Its numbers follow the years you picked.', 'Figures, charts and their sources live in these tabs.'][i] }))
  }
];
const MAKE = [
  { id: 'picture', icon: ICON.image, title: 'Your picture', line: 'Shape, frame, text, layers, download', where: 'Create and share › Your visual › Image', used: () => $('vkImage'),
    async setup(api){ await openPane(api, 'vkImage'); },
    beats: [
      { say: 'Choose a shape: 16:9, 9:16, 4:5 or free.', target: () => $('vfWide') && $('vfWide').parentElement, init: c => { c.base = fmtOn(); }, done: c => fmtOn() !== c.base, praise: 'The frame shows exactly what you get.' },
      { say: 'Drag the picture under the frame, or the frame’s edges.', target: () => $('videoFrame'), done: c => (did('down', 'videoFrame', c.t0) || did('down', 'map', c.t0) || did('down', 'v3d', c.t0)) && Date.now() - input.down > 700, praise: 'You decide what is in it.' },
      { say: 'Decide what is written on it.', target: () => q('#videoSheet .vs-opts'), done: c => did('change', 'videoSheet', c.t0), praise: 'The frame shows the text as it will be.' },
      { say: 'Layers of the picture are behind this button.', target: () => $('vfLayers'), done: c => did('click', 'vfLayers', c.t0), praise: 'Outlines, trails and labels, for this picture.' },
      { say: 'Happy with it? Download.', target: () => $('vsGo'), done: c => did('click', 'vsGo', c.t0), praise: 'Yours. The button under it sends it to the gallery.' }
    ] },
  { id: 'animation', icon: ICON.film, title: 'Your animation', line: 'Preview, speed, ending, 9:16, download', where: 'Create and share › Your visual › Animation', used: () => $('vkVideo'),
    async setup(api){ await openPane(api, 'vkVideo'); },
    beats: [
      { say: 'Play the preview.', target: () => $('vsPlay'), done: c => did('click', 'vsPlay', c.t0) || did('click', 'vfPlay', c.t0), praise: 'What you see is what the video will be.' },
      { say: 'Set the speed, or the ending.', target: () => q('#videoSheet .vs-opts'), done: c => did('change', 'videoSheet', c.t0) || did('down', 'vSpeed', c.t0), praise: 'The line under the options says how long it runs.' },
      { say: 'For Reels and TikTok, choose 9:16.', target: () => $('vfReel'), skipIf: () => press($('vfReel')), done: () => press($('vfReel')), praise: 'Upright, with the text clear of their buttons.' },
      { say: 'Download the video.', target: () => $('vsGo'), done: c => did('click', 'vsGo', c.t0), praise: 'An MP4, ready to post.' }
    ] },
  { id: 'share', icon: ICON.share, title: 'Share the view', line: 'A link, or code for your own page', where: 'Create and share', used: () => $('shareBtn'),
    async setup(){ if (paneOpen()) $('vsClose').click(); await sleep(300); },
    beats: [
      { say: 'Share: a link to exactly this view.', target: () => $('shareBtn'), done: c => did('click', 'shareBtn', c.t0), praise: 'Glacier, years and mode travel with the link.' },
      { say: 'Embed: code that shows it on your own page.', target: () => $('embedBtn'), done: () => $('embedBtn').getAttribute('aria-expanded') === 'true', praise: 'Copy the code, or open the preview.' }
    ] }
];
const CHAPTERS = [
  { id: 'start', title: 'Start here', kicker: 'Start here', head: 'Three things to try', tracks: START },
  { id: 'closer', title: 'Look closer', kicker: 'Look closer', head: 'More in the picture', tracks: CLOSER },
  { id: 'make', title: 'Create and share', kicker: 'Create and share', head: 'Now make it yours', tracks: MAKE },
  ...($('navSize') && shown($('navSize')) ? [{ id: 'size', title: 'Compare sizes', kicker: 'Another page', head: 'How big is that?', foot: 'The guide continues there.',
    link: { href: $('navSize').getAttribute('href'), open: 'size', icon: ICON.cube, title: 'Open the size page', line: 'A glacier laid over your city, or all its ice as one block' } }] : [])      // only where the page links to the size page
];

/* ---------- demo: the slider line moves once by itself, a "finger" on its handle; any touch ends it ---------- */
let demoSeen = false, demoRun = 0;
const picturesReady = () => [...document.querySelectorAll('img.scene-img')].filter(i => /** @type {HTMLImageElement} */ (i).complete && /** @type {HTMLImageElement} */ (i).naturalWidth > 10).length >= 2;
const picturesWait = async api => { try { await api.until(picturesReady, 20000); } catch {} await sleep(500); };
async function sweep(api){
  if (calm() || state.mode !== 'compare' || viewMode !== 'map' || !shown($('handle'))) return;
  const run = ++demoRun, base = state.split, t0 = performance.now(), T = 2600, began = Date.now(), dot = api.dot;
  dot.hidden = false; dot.className = 'gd-dot press';
  await new Promise(res => {
    const step = now => {
      const u = Math.min(1, (now - t0) / T);
      if (run !== demoRun || dot.hidden || input.down > began || state.mode !== 'compare' || viewMode !== 'map') return res(null);
      state.split = base - .17 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u); clip();
      const r = $('handle').getBoundingClientRect(); dot.style.left = (r.left + r.width / 2) + 'px'; dot.style.top = (r.top + r.height / 2) + 'px';
      if (u < 1) requestAnimationFrame(step); else { state.split = base; clip(); res(null); }
    };
    requestAnimationFrame(step);
  });
  if (run === demoRun) api.stopDot();
  demoSeen = true;
}

/* ---------- locator: where in the country this is, and in 3D which way you are looking ---------- */
const inset = document.createElement('div'); inset.className = 'gd-inset'; inset.hidden = true; inset.innerHTML = '<canvas width="264" height="176" role="img"></canvas><b></b>'; stage.appendChild(inset);
let insetKey = '', outline = null, outlineFor = '';
loadCountries();      // the country outlines (data/country-outlines.js, Natural Earth), the file the downloads' inset uses
function bearing(){      // compass bearing of the 3D view in degrees, read from the Explorer's own north arrow; null on the flat map (north is up, there is no direction to show)
  if (viewMode !== '3d' || !v3d || !shown($('v3dNorth'))) return null;
  const rot = parseFloat(getComputedStyle($('v3dNorth')).getPropertyValue('--rot')); return isFinite(rot) ? -rot : null;
}
function drawInset(st, dockRect){
  const g = currentGlacier(), rings = /** @type {any} */ (window).COUNTRY_OUTLINES && /** @type {any} */ (window).COUNTRY_OUTLINES[REGION.id], at = g && (g.tongue || [g.lat, g.lon]);
  const framing = document.body.classList.contains('pane-open');
  const room = !phone() && !framing && !photoOn && st.width >= 640      // not over a download frame, and not over an old photograph and its caption
    && (!dockRect || dockRect.left - st.left > 150 || dockRect.top - st.top < st.height * .55);
  inset.hidden = !g || !rings || !at || !room;
  if (inset.hidden) return;
  const b = bearing(), key = REGION.id + ':' + g.id + ':' + (b === null ? 'flat' : Math.round(b / 2));
  if (key === insetKey) return; insetKey = key;
  const cv = inset.querySelector('canvas'), c = cv.getContext('2d'), W = cv.width, H = cv.height, flat = rings.flat();
  const w = Math.min(...flat.map(p => p[1])), e = Math.max(...flat.map(p => p[1])), s = Math.min(...flat.map(p => p[0])), n = Math.max(...flat.map(p => p[0]));
  const k = Math.cos((n + s) / 2 * Math.PI / 180), sc = Math.min((W - 24) / ((e - w) * k), (H - 24) / (n - s));
  const x = lo => W / 2 + (lo - (w + e) / 2) * k * sc, y = la => H / 2 - (la - (n + s) / 2) * sc;
  if (outlineFor !== REGION.id) { outline = new Path2D(); rings.forEach(r => { r.forEach(([la, lo], i) => i ? outline.lineTo(x(lo), y(la)) : outline.moveTo(x(lo), y(la))); outline.closePath(); }); outlineFor = REGION.id; }
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,.2)'; c.fill(outline); c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke(outline);
  const px = x(at[1]), py = y(at[0]), red = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C8322A';
  if (b !== null) {      // the beam: it opens from the dot in the direction the 3D view looks, as the beam of a phone's map does
    const a = (b - 90) * Math.PI / 180, half = 32 * Math.PI / 180, R = 52;
    const grad = c.createRadialGradient(px, py, 4, px, py, R); grad.addColorStop(0, 'rgba(255,255,255,.95)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath(); c.moveTo(px, py); c.arc(px, py, R, a - half, a + half); c.closePath(); c.fillStyle = grad; c.fill();
  } else { c.beginPath(); c.arc(px, py, 13, 0, 2 * Math.PI); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.5; c.stroke(); }
  c.beginPath(); c.arc(px, py, 6, 0, 2 * Math.PI); c.fillStyle = red; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
  const name = g.local || g.name;
  inset.querySelector('b').textContent = name; cv.setAttribute('aria-label', 'Where ' + name + ' lies' + (b === null ? '' : ', and the direction of the 3D view'));
}

/* ---------- the guide ---------- */
const dock = () => viewMode === '3d' ? $('v3dMeasure') : stage.querySelector('.mapbar');
let wBase = null, wT0 = 0, lastGlacier = null;
if (EMBED) inset.remove();      // a page shown inside another site: no guide, no inset
else {
  const api = createGuide({
    stage, chapters: CHAPTERS,
    firstHead: () => { const g = currentGlacier(); return 'Three things to try' + (g ? ' on ' + g.name : ''); },
    obstacles: () => [dock(), $('v3dCutCap'), $('v3dPhotoCap'), $('pinCard'), stage.querySelector('.tfs-scale')],
    launcherHost: () => document.querySelector('.brand-btns'),
    hold: () => teaserOpen,      // the demo film of the first visit plays over the page: the card waits for its end
    extra: FEATURES.teaser ? { label: 'Watch the demo film', run: () => openTeaser(false) } : undefined,
    reveal(el){ if (phone()) return; if (el.closest('.controls')) setPanel('left', false, false); if (el.closest('#story')) setPanel('right', false, false); },
    onTick(api){
      const st = stage.getBoundingClientRect(), d = dock(); drawInset(st, shown(d) ? d.getBoundingClientRect() : null);
      const g = currentGlacier(); if (g && g.id !== lastGlacier) { lastGlacier = g.id; if (api.view === 'menu') api.render(); }
      if (api.view !== 'menu') { wBase = null; return; }
      if (wBase === null) wT0 = Date.now();      // dragging the line before choosing anything already counts as the first thing
      if (wBase === null || !did('down', 'handle', wT0)) wBase = state.split;
      if (state.mode === 'compare' && viewMode === 'map' && did('down', 'handle', wT0) && Math.abs(state.split - wBase) > .04) { demoSeen = true; demoRun++; api.completeFirst('compare', wBase); }
    }
  });
  /* a first visit that lands on the slider (a shared link): the line moves once by itself */
  (async () => {
    try {
      await api.until(() => state.checked && !teaserOpen, 120000);
      api.render();
      if (api.view !== 'menu' || state.mode !== 'compare' || viewMode !== 'map') return;
      await picturesWait(api);
      if (api.view === 'menu') { await sweep(api); wBase = state.split; }
    } catch {}
  })();
}
