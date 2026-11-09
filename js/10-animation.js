import { wire } from './wire.js';
import { makeAudio, tickTimes, previewTick } from './export-sound.js';
import { IC_INFO } from './07b-icecap-texts.js';
import { IS_CHANGE } from './07a-region-icecaps.js';
import { FIRST_YEAR, iceVolume, LAKE_ZURICH_KM3, POOL_L, SWISS_SUPPLY_KM3, VOLUME_LOSS, $, COARSE, PHONE } from './01-data.js';
import { rankArea, hasOldOutline, oldOutlineGeom, eachPiece, areaSeries, rankLabel } from './02-glaciers.js';
import { asset, styleName, isLandsat, sensorName, styleLine, RELAY_BASE, imageFootprint, loadImage, sideStyle, fmtDM } from './03-imagery.js';
import { state, currentGlacier, viewMode } from './04-state.js';
import { satOn, map, thickestSpot, spaceCanvas, horiz, clip, tlFrames, updateSpeedIcon, play, stopPlay, drawOutlines, strokeEdgeFade, M, cancelMeasure, tongueBounds, tlLayers, SPEED_FPS, speedAngle } from './05-map.js';
import { brightness, outsideAlpha, outlineGeom, syncBackgrounds, imgOpacity, ok, glacierVolume, glacierIceAt, fmtN, closeOtherSharePanes } from './07-render.js';
import { showNotice } from './08-controls.js';
import { setFull, setMini, evalMini, setLayers, scrollCompareTop } from './09-phones.js';
import { drawExportLayers, drawExportArcs, drawExportRasters, drawLegendCard, prepareRasters, cachedRasters, layerLegend, hasNewOutline, layerCredits, previewSeen, bgSeenOf, buildBackground, perYearBackground, overlayCards, exportLayers, layersOn, syncExportRows } from './09a-export-layers.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'closeVideo', { get: () => closeVideo, configurable: true });
Object.defineProperty(wire, 'drawPreview', { get: () => drawPreview, configurable: true });
Object.defineProperty(wire, 'frameRect', { get: () => frameRect, configurable: true });
Object.defineProperty(wire, 'frameExceedsImage', { get: () => frameExceedsImage, configurable: true });
Object.defineProperty(wire, 'openVideo', { get: () => openVideo, configurable: true });
Object.defineProperty(wire, 'perSec', { get: () => perSec, configurable: true });
Object.defineProperty(wire, 'setType', { get: () => setType, configurable: true });
Object.defineProperty(wire, 'shortSlug', { get: () => shortSlug, configurable: true });
Object.defineProperty(wire, 'updateFrame', { get: () => updateFrame, configurable: true });
Object.defineProperty(wire, 'vPrev', { get: () => vPrev, configurable: true });
Object.defineProperty(wire, 'vstate', { get: () => vstate, configurable: true });
Object.defineProperty(wire, 'waterNumbers', { get: () => waterNumbers, configurable: true });
/* =====================================================================
   11. Create animation (video for Instagram, TikTok and others)
       Frames are drawn on a canvas from the images already loaded, encoded to H.264 with the
       browser's WebCodecs encoder and packed into an MP4 (small packer below, no library).
   ===================================================================== */
export const VIDEO = {
  fps: 30,
  formats: {   // safe zones keep text clear of the apps' own buttons and captions
    reel: { w:1080, h:1920, safe:{ top:270, bottom:670, left:65, right:140 } },   // Meta: keep clear of the top 14 %, bottom 35 %, sides 6 % (and the button rail at the bottom right)
    feed: { w:1080, h:1350, safe:{ top:84,  bottom:96,  left:72, right:72 } },
    wide: { w:1920, h:1080, safe:{ top:56,  bottom:56,  left:90, right:90 } }       // 16:9: text high and low, the image stays free
  },
  fade: 0.4, hold: 0.8,          // no title slide (the header fades in over the first picture); the fact card closes a video (endLen)
  codecs: ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']   // H.264 High, Main, Baseline (level 4.0)
};
/* "Custom": the frame on the map is dragged to any ratio (handles on its edges and corners); it starts as the glacier's image box (extent and ratio). The export has the ratio of the frame, its long side 1920 px (a picture 2500 px; a video stays inside H.264 level 4.0). */
export const cust = { l: .08, t: .08, r: .92, b: .92 };      // the frame as fractions of the free area of the map
Object.defineProperty(VIDEO.formats, 'custom', { enumerable: true, get(){
  const r = frameRect(), long = vstate.kind === 'image' ? 2500 : 1920, k = long / Math.max(r.w, r.h);
  let w = r.w * k, h = r.h * k; if (vstate.kind !== 'image') { const f = Math.min(1, Math.sqrt(2.0e6 / (w * h))); w *= f; h *= f; }
  return { w: Math.max(2, Math.round(w / 2) * 2), h: Math.max(2, Math.round(h / 2) * 2), safe: { top: 56, bottom: 56, left: 64, right: 64 } };
} });
/* Where text may sit. Animations in 9:16 follow Instagram Reels and TikTok (clear of the app's buttons and captions); every picture, and 16:9 and 4:5,
   keep the text at the very top and bottom. */
export const STILL_MARGINS = { custom: { top: 56, bottom: 56, left: 64, right: 64 }, reel: { top: 74, bottom: 66, left: 64, right: 64 }, feed: { top: 74, bottom: 66, left: 64, right: 64 }, wide: { top: 56, bottom: 56, left: 90, right: 90 } };
export const marginsFor = (kind, fmt) => kind === 'image' || (fmt === 'reel' && !$('vSafe').checked) ? STILL_MARGINS[fmt] : VIDEO.formats[fmt].safe;      // 9:16 video: text clear of the apps' buttons, or (box unticked) plain, at the very top and bottom
export const FMT_SUFFIX = { reel: '9x16', feed: '4x5', wide: '16x9', custom: 'custom' };
export const vstate = { fmt: 'wide', type: 'timelapse', kind: 'video', busy: false };      // kind: 'video' (animation) or 'image' (one picture)
/* swipe: [position, seconds]. Position = where the later year starts: 1 = only the first year, 0 = only the later one.
   It starts in the middle, goes back and forth twice and settles in the middle again. A move eases from the previous position. */
export const SWIPE_KEYS = [[0.5, 0.8], [1, 1.2], [1, 0.5], [0, 1.7], [0, 0.7], [1, 1.5], [1, 0.4], [0, 1.5], [0, 0.7], [0.5, 1.2], [0.5, 1.4]];
export const swipeLength = k => SWIPE_KEYS.reduce((a, [, d]) => a + d * k, 0);
/* the picture shows the year on screen: One year, the frame of the Timelapse, or the right-hand year of Compare */
export const stillYear = () => state.mode === 'single' ? state.one : state.mode === 'timelapse' && tlLayers[state.frame] ? tlLayers[state.frame].yr : state.b;
export const imgCompare = () => vstate.kind === 'image' && viewMode !== '3d' && state.mode === 'compare' && state.a !== state.b && !!state.available[state.a] && !!state.available[state.b];      // a picture of Compare: both years either side of the slider
export const videoYears = () => vstate.kind === 'image' ? (imgCompare() ? [state.a, state.b] : [stillYear()].filter(y => state.available[y]))
  : vstate.type === 'swipe' ? [state.a, state.b].filter(y => state.available[y]).filter((y, i, a) => a.indexOf(y) === i)
  : tlFrames();
export const FONT = '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif';

/* ---- framing on the map ---- */
export let sheetOverlap = 0;                 // how far the panel covers the bottom of the map (phones): the frame stays above it
export function measureSheetOverlap(){
  const sh = $('videoSheet');
  if (sh.hidden) return 0;
  const st = $('stage').getBoundingClientRect(), sr = sh.getBoundingClientRect();
  const across = Math.min(st.right, sr.right) - Math.max(st.left, sr.left);
  return across > 40 ? Math.max(0, st.bottom - sr.top) : 0;
}
export const stageSize = () => viewMode === '3d' && $('v3dCanvas').clientWidth ? {x: $('v3dCanvas').clientWidth, y: $('v3dCanvas').clientHeight} : map.getSize();
export function visibleBox(){            // the part of the picture area the visitor can see, in its own pixels: cut to the browser window, and clear of the download pane where that stands at the side
  const size = stageSize(), el = viewMode === '3d' && $('v3dCanvas').clientWidth ? $('v3dCanvas') : $('stage'), r = el.getBoundingClientRect();
  let side = false, x0 = Math.max(0, -r.left), x1 = Math.min(size.x, innerWidth - r.left), y0 = Math.max(0, -r.top), y1 = Math.min(size.y, innerHeight - r.top);
  const sh = $('videoSheet');
  if (!sh.hidden) {
    const s = sh.getBoundingClientRect();
    if (s.right > r.left + 8 && s.right < r.left + size.x * 0.4 && s.top < r.bottom - 120) x0 = Math.max(x0, s.right - r.left + 12), side = true;      // the pane covers the left of the picture area: the frame starts to the right of it
    else if (s.left < r.left + size.x - 8 && s.left > r.left + size.x * 0.4 && s.top < r.bottom - 120) x1 = Math.min(x1, s.left - r.left), side = true;      // the pane (at the right edge, over the story or over the map where the story is folded away) covers the right of the picture area: the frame ends left of it, so it sits between the left panel and the pane
  }
  return {side, x0, x1: Math.max(x0 + 100, x1), y0, y1: Math.max(y0 + 100, y1)};
}
export function frameAvail(){            // the free area of the map the frame may use: left, top, width, height
  const vb = visibleBox(), m = 20, top = 44 + vb.y0, bottom = Math.max(62, vb.side ? 0 : sheetOverlap + 12, stageSize().y - vb.y1 + 62);      // a pane at the side is cleared sideways, one below the picture from below
  return { x: vb.x0 + m, y: top, w: vb.x1 - vb.x0 - 2 * m, h: stageSize().y - top - m - bottom };
}
let custBase = null;      // the free area the custom fractions were last valid for
export function keepCustRatio(A){            // the free area changed (full screen on or off, a panel folds away, the window is resized): the custom frame keeps its ratio (what the download is cut at) and is scaled by the mean change of the area (so going back restores it) to fit, instead of its fractions stretching it
  const o = custBase; custBase = A;
  if (!o || (o.w === A.w && o.h === A.h)) return;
  const fw0 = o.w * (cust.r - cust.l), fh0 = o.h * (cust.b - cust.t), k = Math.min(Math.sqrt(A.w / o.w * A.h / o.h), A.w / fw0, A.h / fh0), fw = fw0 * k / A.w, fh = fh0 * k / A.h, cx = (cust.l + cust.r) / 2, cy = (cust.t + cust.b) / 2;
  const l = Math.min(1 - fw, Math.max(0, cx - fw / 2)), t = Math.min(1 - fh, Math.max(0, cy - fh / 2));
  Object.assign(cust, { l, r: l + fw, t, b: t + fh });
}
export function frameRect(){
  const A = frameAvail(); keepCustRatio(A);
  if (vstate.fmt === 'custom') return { x: A.x + A.w * cust.l, y: A.y + A.h * cust.t, w: A.w * (cust.r - cust.l), h: A.h * (cust.b - cust.t) };
  const F = VIDEO.formats[vstate.fmt];
  let h = A.h, w = h * F.w / F.h;
  if (w > A.w) { w = A.w; h = w * F.h / F.w; }
  return { x: A.x + (A.w - w) / 2, y: A.y + (A.h - h) / 2, w, h };
}
export function frameSplit(){            // where the slider sits inside the frame (0 to 1, along the slider's direction)
  const r = frameRect(), size = map.getSize();
  return Math.min(1, Math.max(0, horiz() ? (size.y * state.split - r.y) / r.h : (size.x * state.split - r.x) / r.w));
}
export function frameGroundRes(){            // metres of terrain per video pixel
  const r = frameRect(), F = VIDEO.formats[vstate.fmt];
  const a = map.containerPointToLatLng([r.x, r.y + r.h / 2]), b = map.containerPointToLatLng([r.x + r.w, r.y + r.h / 2]);
  return map.distance(a, b) / F.w;
}
/* The text on the map frame: drawn with the same functions as the finished picture or video (timelapse, slider or single picture), over the live map.
   The end card is left out. */
export const previewScale = (cv, W) => Math.min(1, Math.max(0.5, (cv.clientWidth || 0) * Math.min(2, devicePixelRatio || 1) / W));      // the preview canvas has the pixels the screen shows (not half the download size, which looked soft)
export let logoAsked = false;
export function drawPreview(){
  if (viewMode === '3d') return wire.drawPreview3D();
  if (!logoImg && !logoAsked) { logoAsked = true; loadLogo().then(() => drawPreview()); }      // the logo is part of every picture: the preview shows it as soon as it is decoded
  const cv = $('vfPreview'), F = VIDEO.formats[vstate.fmt], W = F.w, H = F.h, q = previewScale(cv, W), ys = videoYears();
  cv.width = Math.round(W * q); cv.height = Math.round(H * q);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!ys.length) return;
  const g = currentGlacier(), S = marginsFor(vstate.kind, vstate.fmt), swipe = vstate.kind === 'image' ? imgCompare() : vstate.type === 'swipe', image = vstate.kind === 'image';
  const info = { glacier: g, years: ys, scenes: ys.map(y => state.available[y]), outline: oldOutlineOn(g), xLegend: layerLegend(vstate.kind), xNew: hasNewOutline(vstate.kind), xCredit: layerCredits(vstate.kind, ys, null, previewSeen(vstate.kind, drawPreview)), res: frameGroundRes(), style: state.style, styleB: sideStyle(1), compare: swipe, horiz: swipe && horiz(), noDivider: image,      // a picture: the slider of the map itself stays visible and can be moved
    tlYears: image ? [] : ys };      // a single picture has no timeline bar
  if (!swipe && $('vFacts').checked) { loadFacts(g); info.factSet = $('vFactSet').value; info.factBase = image ? FIRST_YEAR : ys[0]; }
  ctx.save(); ctx.scale(q, q);
  if (vPrev.on && vPrev.endT0 != null && vPrev.endInfo) { drawEndSlide(ctx, W, H, S, vPrev.endInfo, (performance.now() - vPrev.endT0) / 1000); ctx.restore(); return; }      // the ending of the animation
  { const r = frameRect(), P = ll => { const p = map.latLngToContainerPoint([ll[1], ll[0]]); return [(p.x - r.x) * W / r.w, (p.y - r.y) * H / r.h]; }, ra = cachedRasters(vstate.kind, drawPreview);
    drawExportRasters(ctx, P, ra); drawExportArcs(ctx, P, W, arcOptFor(ys, vPrev.on && state.mode === 'timelapse' && tlLayers[state.frame] && ys.includes(tlLayers[state.frame].yr) ? ys.indexOf(tlLayers[state.frame].yr) : Math.floor((ys.length - 1) / 2)), vstate.kind); drawExportLayers(ctx, P, W / 1080 * 1.6, vstate.kind, ra, true); info.xCards = [...ra.map(r => r.card), ...overlayCards(vstate.kind)].filter(Boolean); info.xCredit = layerCredits(vstate.kind, ys, ra); }      // the ticked map layers under the labels, from the frame on the live map
  if (image && !swipe) drawStill(ctx, W, H, info, S);
  else if (swipe) drawSwipeLabels(ctx, W, H, S, info, image || vPrev.on ? frameSplit() * (info.horiz ? H : W) : (info.horiz ? H : W) / 2);
  else drawLabels(ctx, W, H, S, info, vPrev.on && state.mode === 'timelapse' && tlLayers[state.frame] && ys.includes(tlLayers[state.frame].yr) ? ys.indexOf(tlLayers[state.frame].yr) : Math.floor((ys.length - 1) / 2));
  ctx.restore();
}
/* A preview of the animation in the frame: the timelapse plays on the map (the labels follow its frame), the slider sweeps across; everything outside the frame is darker meanwhile. Stops with the pane, a new format or a click. */
export const vPrev = {on: false, raf: 0};
export const frameTick = i => { if (!vPrev.on || vstate.type === 'swipe' || viewMode === '3d') return; if (vPrev.lastFrame != null && vPrev.lastFrame !== i) previewTick(); vPrev.lastFrame = i; };      // the map's timelapse: a tick at every new frame of the preview
Object.defineProperty(wire, 'previewFrameTick', { get: () => frameTick, configurable: true });
export const PV_ICON = {play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>'};
export function stopPreview(){
  if (!vPrev.on) return; vPrev.on = false; cancelAnimationFrame(vPrev.raf); vPrev.endT0 = null;
  if (state.playing) stopPlay();
  if (viewMode === '3d' && wire.v3d && vPrev.cam0) { wire.v3d.setCam(vPrev.cam0); vPrev.cam = null; if (wire.v3dCtx && wire.v3dCtx.cmp) wire.setSplit3D(vPrev.split0); else if (vPrev.year0 && wire.v3dCtx && wire.v3dCtx.follow) wire.v3dCtx.follow(vPrev.year0); wire.drawPreview3D(); }      // the view, the line and the year come back
  $('videoFrame').classList.remove('playing'); $('vfPlay').innerHTML = PV_ICON.play; $('vfPlay').setAttribute('aria-label', 'Play a preview'); syncPlayBtn();
  if (vstate.kind !== 'image' && vstate.type === 'swipe') clip();
  if (viewMode !== '3d') drawPreview();      // back to the plain labels (the end card is gone)
}
export function startPreview3D(){            // the camera swings as in the video, the years change (timelapse) or the line moves (slider); everything is put back when it stops
  const c = wire.v3dCtx, viewer = wire.v3d; if (!c || !viewer) return;
  vPrev.applied = null; vPrev.off = {az: 0, el: 0, k: 1}; vPrev.cam0 = viewer.getCam(); vPrev.year0 = c.cmp ? null : c.current(); vPrev.split0 = wire.v3dSplit; vPrev.cam = vPrev.cam0;
  let last = performance.now(), yPh = 0, sPh = 0; const t0 = last, ys = !c.cmp && c.years && c.years.length > 1 ? c.years : null;
  const tick = now => {
    if (!vPrev.on) return; const t = (now - t0) / 1000, dt = (now - last) / 1000; last = now; const u = (t / 7) % 1, sw = Math.sin(2 * Math.PI * u), bob = (1 - Math.cos(2 * Math.PI * u)) / 2;
    const cur = viewer.getCam(), ap = vPrev.applied;
    if (ap && (Math.abs(cur.az - ap.az) > 1e-4 || Math.abs(cur.el - ap.el) > 1e-4 || Math.abs(cur.dist - ap.dist) > 1e-4 * ap.dist)) {      // the visitor turned, tilted or zoomed: the swing goes on around the new view, which is also what comes back when the preview stops
      const o = vPrev.off; vPrev.cam0 = {...vPrev.cam0, az: cur.az - o.az, el: cur.el - o.el, dist: cur.dist / o.k};
    }
    const swing = $('vSwing') && $('vSwing').checked, cam0 = vPrev.cam0, off = swing ? {az: 0.5 * sw, el: 0.07 * bob, k: 1 - 0.1 * bob} : {az: 0, el: 0, k: 1};
    vPrev.off = off; vPrev.cam = {az: cam0.az + off.az, el: cam0.el + off.el, dist: cam0.dist * off.k}; viewer.setCam(vPrev.cam); vPrev.applied = viewer.getCam();
    if (c.cmp) { sPh += dt * 1.2 / perSec(0); if (sPh >= 6) return stopPreview(); wire.setSplit3D(0.5 + 0.4 * Math.sin(2 * Math.PI * sPh / 6)); }
    else if (ys && c.follow) {
      yPh += dt / perSec(ys.length); const sq = loopSeq(ys.length), per = perSec(ys.length), cyc = sq.length + (vPrev.endInfo ? endLen(vstate.fmt) / per : 0), ph = yPh % cyc;
      if (yPh >= cyc) return stopPreview();      // one run, like the video
      if (ph >= sq.length) vPrev.endT0 = performance.now() - (ph - sq.length) * per * 1000;      // after the last year: the fact card, as in the video
      else { vPrev.endT0 = null; const y = ys[sq[Math.floor(ph)]]; if (y !== c.current()) { c.follow(y); previewTick(); } }
    }      // the order of the video: loops, and back in time between them
    if (!c.cmp && !ys && t >= 7) return stopPreview();      // one swing
    wire.drawPreview3D(); vPrev.raf = requestAnimationFrame(tick);
  };
  vPrev.raf = requestAnimationFrame(tick);
}
/* The ending in the preview: after the last year the fact card shows as long as in the video (when "Fact card" is chosen), then the preview starts over. endT0: when the card began (null = not showing). */
vPrev.endInfo = null; vPrev.endT0 = null;
async function prepareEnd(){
  vPrev.endInfo = null;
  const ys = videoYears(); if ($('vEnd').value !== 'facts' || ys.length < 2) return;
  const g = currentGlacier(), lo = Math.min(...ys), hi = Math.max(...ys), inRange = VOLUME_LOSS.filter(n => n.y >= lo && n.y <= hi);
  const info = { glacier: g, years: ys, tlYears: ys, scenes: ys.map(y => state.available[y]), style: state.style, lost: inRange.length ? Math.round((1 - inRange.reduce((q, n) => q * (1 - n.v / 100), 1)) * 100) : 0 };
  if (await endInfo(g, info, lo, hi)) vPrev.endInfo = info;
}
function endCardHold(){            // the map timelapse reached its end: with the fact card, show it (redrawn every frame) for as long as the video holds it; then the preview stops, as the video does
  if (!vPrev.endInfo) { stopPreview(); return -1; }
  const ms = endLen(vstate.fmt) * 1000; vPrev.endT0 = performance.now();
  setTimeout(stopPreview, ms);
  const f = () => { if (!vPrev.on || vPrev.endT0 == null) return; drawPreview(); requestAnimationFrame(f); }; f();
  return ms;
}
export function startPreview(){
  if (vstate.kind === 'image' || vPrev.on) return;
  if (state.playing) stopPlay();      // a timelapse that is already playing (map or 3D) would run beside the preview
  const ys = videoYears();
  if (vstate.type !== 'swipe') prepareEnd();      // the card's numbers are fetched while the preview starts
  if (viewMode === '3d') { vPrev.on = true; $('videoFrame').classList.add('playing'); $('vfPlay').innerHTML = PV_ICON.stop; $('vfPlay').setAttribute('aria-label', 'Stop the preview'); syncPlayBtn(); return startPreview3D(); }
  vPrev.on = true; vPrev.lastFrame = null; $('videoFrame').classList.add('playing'); $('vfPlay').innerHTML = PV_ICON.stop; $('vfPlay').setAttribute('aria-label', 'Stop the preview'); syncPlayBtn();
  if (vstate.type === 'swipe') {            // the slider goes to and fro across the frame
    const t0 = performance.now(), r = frameRect(), a = horiz() ? (r.y + 0.05 * r.h) / map.getSize().y : (r.x + 0.05 * r.w) / map.getSize().x, b = horiz() ? (r.y + 0.95 * r.h) / map.getSize().y : (r.x + 0.95 * r.w) / map.getSize().x;
    const tick = now => { if (!vPrev.on) return; const uu = (now - t0) / (2600 * Math.max(0.3, perSec(0) / 1.2)); if (uu >= 2) return stopPreview(); const u = uu % 2, e = u < 1 ? u : 2 - u, s = e * e * (3 - 2 * e); state.split = a + (b - a) * s; clip(); drawPreview(); vPrev.raf = requestAnimationFrame(tick); };
    vPrev.raf = requestAnimationFrame(tick);
  } else { document.getElementById('loopToggle').checked = true; if (state.playing) stopPlay(); play(tlLayers.length === ys.length ? loopSeq(tlLayers.length) : null, endCardHold); }      // the map's timelapse plays; showFrame redraws the labels at every frame
}
export function syncPlayBtn(){ $('vsPlay').lastElementChild.textContent = vPrev.on ? 'Stop animation' : 'Play animation'; $('vsPlay').firstElementChild.innerHTML = vPrev.on ? '<path d="M7 7h10v10H7z"/>' : '<path d="M8 5v14l11-7z"/>'; }
$('vfPlay').onclick = $('vsPlay').onclick = () => vPrev.on ? stopPreview() : startPreview();
$('vfClose').onclick = () => closeVideo();      // the cross above the top right corner of the preview
$('vfFs').onclick = () => $('fsBtn').click();      // full screen from the preview, beside the ratios: the same as the dock's button (hidden while a pane is open)
export function guideText(){            // only the choices that need a word: the Reels / TikTok text zone and the custom frame
  const video = vstate.kind !== 'image';
  $('vSafeRow').hidden = !(video && vstate.fmt === 'reel');      // the Reels / TikTok choice only exists for a 9:16 video
  if (vstate.fmt === 'reel' && video && $('vSafe').checked) return 'Text stays clear of the Reels and TikTok buttons and captions.';
  if (vstate.fmt === 'custom') return 'Drag the edges and corners of the frame to any shape.';
  return '';
}
export function placeFrame(){
  sheetOverlap = measureSheetOverlap();               // the info line can change the panel height
  const r = frameRect();
  Object.assign($('videoFrame').style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  $('videoFrame').classList.toggle('custom', vstate.fmt === 'custom');
  const bt = $('videoFrame').querySelector('.vf-btns'), vb = visibleBox(), sr = $('stage').getBoundingClientRect(), ar = document.querySelector('aside.controls').getBoundingClientRect(), beside = ar.bottom > sr.top && ar.top < sr.bottom, lo = Math.max(vb.x0, beside ? ar.right - sr.left : 0);      // (phones: the controls are below the picture, not beside it) the buttons under the frame are centred on it, but a narrow custom frame near the edge would push them off the screen: they slide back
  if (bt) { const bw = bt.offsetWidth; bt.style.left = bw ? Math.min(Math.max(r.x + r.w / 2 - bw / 2, lo + 8), Math.max(lo + 8, vb.x1 - bw - 8)) - r.x + 'px' : ''; bt.style.transform = bw ? 'none' : ''; }
}
/* While a download pane is open the map may not be zoomed out far, or moved far: the frame has to stay around the satellite picture of the glacier (a bit of space around it is fine).
   The limit is on the middle of the frame, not on the map view (Leaflet's maxBounds limits the whole view, which is far bigger than the frame, so it kept pulling the map back to the side). */
export let zoomLimitKey = '', frameLimit = null;
export function limitFrameView(){
  const on = !$('videoSheet').hidden && viewMode !== '3d';
  if (!on) { if (zoomLimitKey) { zoomLimitKey = ''; frameLimit = null; map.setMinZoom(8); } return; }
  const g = currentGlacier(), r = frameRect(), fp = imageFootprint(g).bounds, key = g.id + '|' + Math.round(r.w) + 'x' + Math.round(r.h);
  if (key === zoomLimitKey) return; zoomLimitKey = key;
  const a = map.project([fp[1][0], fp[0][1]], 0), c = map.project([fp[0][0], fp[1][1]], 0);
  const zIn = Math.log2(Math.max(r.w / (c.x - a.x), r.h / (c.y - a.y)));            // the zoom at which the frame just fits the picture
  map.setMinZoom(Math.max(8, Math.floor((zIn - 0.7) * 4) / 4));                       // the frame may reach about 1.6 times beyond the picture, no more
  frameLimit = L.latLngBounds(fp).pad(0.3);                                           // the middle of the frame stays inside the picture plus a margin
}
export function clampFrameToLimit(){
  if (!frameLimit || $('videoSheet').hidden || viewMode === '3d') return;
  const r = frameRect(), mid = map.containerPointToLatLng(L.point(r.x + r.w / 2, r.y + r.h / 2));
  if (frameLimit.contains(mid)) return;
  const want = L.latLng(Math.min(Math.max(mid.lat, frameLimit.getSouth()), frameLimit.getNorth()), Math.min(Math.max(mid.lng, frameLimit.getWest()), frameLimit.getEast()));
  const d = map.latLngToContainerPoint(want).subtract(map.latLngToContainerPoint(mid));
  map.panBy(d.multiplyBy(-1), {animate: true, duration: 0.25});
}
map.on('moveend', clampFrameToLimit);
/* Frame areas: the frame on the map fitted to the tongue or to the whole glacier */
/* The map is fitted to the frame (the image box, for Custom); the fit is forgotten as soon as the frame is changed: another ratio, or moving or zooming the map */
export let areaSel = null;
export function markArea(which){ areaSel = which ? {which, z: map.getZoom(), c: map.getCenter(), fmt: vstate.fmt} : null }
export function checkAreaSel(){
  if (!areaSel) return;
  if (areaSel.fmt !== vstate.fmt || Math.abs(map.getZoom() - areaSel.z) > 0.01 || map.latLngToContainerPoint(areaSel.c).distanceTo(map.getSize().divideBy(2)) > 3) markArea(null);
}
export function frameTo(whole){
  const g = currentGlacier(), r = frameRect(), size = map.getSize();
  if (whole === 'image') {            // the frame is exactly the image box (its ratio is the frame's ratio)
    const fp = imageFootprint(g).bounds, a = map.project([fp[1][0], fp[0][1]], 0), c = map.project([fp[0][0], fp[1][1]], 0);
    const z = Math.log2(r.w / (c.x - a.x)), mid = L.point((a.x + c.x) / 2 * 2 ** z + (size.x / 2 - (r.x + r.w / 2)), (a.y + c.y) / 2 * 2 ** z + (size.y / 2 - (r.y + r.h / 2)));
    const snap = map.options.zoomSnap; map.options.zoomSnap = 0; map.setView(map.unproject(mid, z), z, {animate: false}); map.options.zoomSnap = snap;      // no rounding to quarter zooms: the frame must be exactly the box
    return markArea('image');
  }
  if (!whole) {
    const b = tongueBounds(g) || g.bounds;
    map.fitBounds(b, {animate: false, paddingTopLeft: [r.x + 12, r.y + 12], paddingBottomRight: [size.x - (r.x + r.w) + 12, size.y - (r.y + r.h) + 12]});
    return markArea('tongue');
  }
  /* The whole glacier in the frame. The centre is moved so that no edge of the frame leaves the satellite picture where the frame's shape allows it; where the picture is not wide or tall enough for the frame (a tall frame on a wide picture), the frame may reach beyond it */
  const fp = imageFootprint(g).bounds, gb = g.bounds, P = (ll, z) => map.project(L.latLng(ll), z);
  const ext = (b, z) => { const a = P([b[1][0], b[0][1]], z), c = P([b[0][0], b[1][1]], z); return {x0: a.x, y0: a.y, x1: c.x, y1: c.y}; };
  const g0 = ext(gb, 0);
  const zFit = Math.log2(Math.min((r.w - 24) / (g0.x1 - g0.x0), (r.h - 24) / (g0.y1 - g0.y0)));       // the glacier just fits the frame
  const z = Math.min(map.getMaxZoom(), Math.floor(zFit * 4) / 4);
  const F = ext(fp, z), G = ext(gb, z), clamp = (v, lo, hi) => lo > hi ? v : Math.min(hi, Math.max(lo, v));      // a frame larger than the picture in that direction: the glacier stays in the middle
  const cx = clamp((G.x0 + G.x1) / 2, F.x0 + r.w / 2, F.x1 - r.w / 2), cy = clamp((G.y0 + G.y1) / 2, F.y0 + r.h / 2, F.y1 - r.h / 2);      // where the middle of the frame goes
  const mid = L.point(cx + (size.x / 2 - (r.x + r.w / 2)), cy + (size.y / 2 - (r.y + r.h / 2)));      // the frame sits off the middle of the map: so does the map's centre
  map.setView(map.unproject(mid, z), z, {animate: false});
  markArea('whole');
}
export function frameExceedsImage(){            // the frame reaches beyond the satellite picture of the glacier
  const g = currentGlacier(), r = frameRect(), fp = imageFootprint(g).bounds, ll = p => map.containerPointToLatLng(p);
  const nw = ll([r.x, r.y]), se = ll([r.x + r.w, r.y + r.h]);
  return nw.lat > fp[1][0] || se.lat < fp[0][0] || nw.lng < fp[0][1] || se.lng > fp[1][1];
}
export function earlyNote(years){            // years before the Sentinel-2 series (Landsat pictures): the facts and statistics start at FIRST_YEAR
  const e = $('vsEarly'), early = (years || []).some(y => +y < FIRST_YEAR);
  e.hidden = !early; e.textContent = early ? `Pictures from before ${FIRST_YEAR} are Landsat. Facts and statistics only run from ${FIRST_YEAR} onwards.` : '';
}
export function updateFrame(){
  if ($('videoSheet').hidden) return;
  syncExportRows(); document.body.classList.toggle('x-bg', layersOn());  document.body.classList.toggle('x-aerial', exportLayers(vstate.kind).some(l => l.aerial));
  $('vFactSet').disabled = !$('vFacts').checked;      // the choice of facts only matters while facts are on
  if (viewMode === '3d') return wire.update3DInfo();
  sheetOverlap = measureSheetOverlap();
  syncBackgrounds(); limitFrameView(); checkAreaSel();
  const res = frameGroundRes();
  $('videoFrameNote').textContent = res < 4 ? `Zoom out for a sharper ${vstate.kind === 'image' ? 'picture' : 'video'}` : '';
  const ys = videoYears();
  $('vsSource').textContent = vstate.kind === 'image' ? '' : vstate.type === 'swipe' ? `Years from Compare (${horiz() ? 'top and bottom' : 'left and right'}).` : 'Years from the timelapse range.';
  if (vstate.kind === 'image') {
    $('vsInfo').textContent = imgCompare() ? `One picture, ${ys[0]} and ${ys[1]} either side of the slider. Move the slider to choose the split.` : ys.length ? `One picture, ${ys[0]}.` : 'No picture for this year.';
    if (res < 4) $('vsInfo').textContent += ' Images have 10 m pixels: this close, the picture looks soft.';
  } else $('vsInfo').textContent = ys.length < 2
    ? (vstate.type === 'swipe' ? 'Pick two years in Compare first.' : 'Pick at least two years first.')
    : (vstate.type === 'swipe' ? `Slider, ${ys[0]} and ${ys[1]}, about ${Math.round(videoDuration(2))} s.`
                               : `${ys.length} years, ${ys[0]}–${ys[ys.length - 1]}, about ${Math.round(videoDuration(loopSeq(ys.length).length))} s.`) +
      (res < 4 ? ' Images have 10 m pixels: this close, the video looks soft.' : '');
  earlyNote(ys);
  $('vSnap').hidden = vstate.fmt !== 'custom';
  placeFrame(); $('vfPlay').style.display = $('vsPlay').style.display = vstate.kind === 'image' ? 'none' : '';      // the preview is for animations
  $('vsGuide').textContent = guideText();
  drawPreview();
  $('vFactsRow').style.display = !FEATURES.facts || (vstate.kind === 'image' ? imgCompare() : vstate.type === 'swipe') ? 'none' : '';      // the facts belong to a single year
  $('app').classList.toggle('is-cmp-image', imgCompare());
}
export const endLen = fmt => fmt === 'wide' ? 5 : 3.5;            // seconds of the fact card at the end of a video
export const tailLength = () => $('vEnd').value === 'facts' ? endLen(vstate.fmt) : 0;
export function perSec(n){            // seconds per year: the chosen speed, or the one that fits the video into 15 s (Reels, TikTok)
  return 1 / +SPEED_FPS[+$('vSpeed').value];      // the speed setter of the panel: frames (years) per second, so one year lasts 1 / fps seconds
}
/* The order of the years in a timelapse of n years: once, or several loops. Between two loops it can run back through the years (the turning years are not shown twice). */
export function loopSeq(n){
  const loops = Math.max(1, +$('vLoops').value || 1), bounce = $('vBounce').checked && loops > 1, fwd = [...Array(n).keys()], back = [...fwd].reverse(), seq = [...fwd];
  for (let l = 1; l < loops; l++) { if (bounce) seq.push(...back.slice(1), ...fwd.slice(1)); else seq.push(...fwd); }
  return seq;
}
export const videoDuration = n => (vstate.type === 'swipe'
  ? swipeLength(perSec(0) / 1.2) + tailLength()
  : n * perSec(n) + VIDEO.hold + tailLength());
map.on('move zoom resize', updateFrame);
/* Phones: opening a pane scrolls the visual into view after the frame was placed, and the page can be scrolled while it is open: the frame follows what is visible */
export let frameScrollRaf = 0;
addEventListener('scroll', () => { if ($('videoSheet').hidden || frameScrollRaf) return; frameScrollRaf = requestAnimationFrame(() => { frameScrollRaf = 0; updateFrame(); }); }, {passive: true});
Promise.all(['700 24px', '800 120px', '600 28px', '500 20px'].map(f => document.fonts.load(`${f} "Schibsted Grotesk"`).catch(() => {}))).then(updateFrame);   // the preview uses the real font

export function openVideo(kind = 'video', stay = false){            // stay: the pane changes where it is, the page does not scroll
  const wasOpen = !$('videoSheet').hidden;
  if (kind === 'video' && typeof VideoEncoder === 'undefined') {
    return showNotice('Making videos needs a recent browser: Chrome, Edge, Firefox, or Safari on iPhone, iPad or Mac (iOS 16.4 or newer).');
  }
  stopPreview();      // switching between image and animation ends a running preview
  if (state.playing) stopPlay();      // the page's own timelapse may be running: it stops when the pane opens, the preview is the only thing that plays
  vstate.kind = kind; $('vfPlay').style.display = kind === 'image' ? 'none' : '';
  document.body.classList.add('pane-open'); drawOutlines(); setLayers(false); if (typeof cancelMeasure === 'function') cancelMeasure(); map.removeLayer(M.group);      // no layer menu (it would open out of sight, behind the pane) and no measurements: neither is part of a download
  const image = kind === 'image', in3D = viewMode === '3d';
  $('videoSheet').classList.toggle('is-image', image); $('videoSheet').classList.toggle('is-3d', in3D);
  $('vkImage').setAttribute('aria-pressed', image); $('vkVideo').setAttribute('aria-pressed', !image);
  $('vsTitle').textContent = 'Save and share';      // the same name as step 3 in the left panel
  if (in3D) {            // the frame shows what the picture will contain: the 3D view as it is
    if (typeof wire.leavePhoto === 'function') wire.leavePhoto(true);      // a download shows the orbiting camera, not the view of a historic photograph
    $('videoSheet').hidden = false; $('videoFrame').hidden = false;
    $('vsProgress').hidden = true; $('vsGo').disabled = false; $('vsGo').textContent = image ? 'Download image' : 'Download video';
    lastExport = null; $('vsShareBox').hidden = true; $('vsShareForm').hidden = true; offerShare();
    if (image && state.mode === 'timelapse') { const y = stillYear(); if (state.available[y]) state.one = y; $('modeSingle').click(); }      // a picture is of one year: the panel goes to One year, at the year on screen, as in Map view
    bringVisualIntoView(stay);
    wire.update3DInfo(); if (!wasOpen) centre3D();
    return;
  }
  setType(!image && state.mode === 'compare' ? 'swipe' : 'timelapse');
  stopPlay();
  $('videoSheet').hidden = false; $('videoFrame').hidden = false;
  $('app').classList.add('is-framing');
  $('vsProgress').hidden = true; $('vsGo').disabled = false; $('vsGo').textContent = image ? 'Download image' : 'Download video';
  lastExport = null; $('vsShareBox').hidden = true; $('vsShareForm').hidden = true; offerShare();
  syncBackgrounds();
  updateFrame();
  if (!wasOpen) centreInFrame();
  bringVisualIntoView(stay);
}
/* The pane at the side takes room from the map, so the frame sits off the middle of the stage: the map moves with it, and what was in the middle of the map (the glacier at the landing view) is now in the middle of the frame. Closing the pane moves it back. */
export function centre3D(){            // 3D: the picture on screen moves so that its middle is the middle of the frame (the pane takes room from the stage); the export crops with the difference
  if (typeof wire.v3d === 'undefined' || !wire.v3d || !wire.v3d.setShift) return;
  if (!visibleBox().side) return wire.v3d.setShift(0, 0);
  const cv = $('v3dCanvas'), cw = cv.clientWidth, ch = cv.clientHeight, r = frameRect();
  wire.v3d.setShift((r.x + r.w / 2 - cw / 2) / (cw / 2), -(r.y + r.h / 2 - ch / 2) / (ch / 2));
}
export let paneCentred = false, paneAnchor = null, reanchoring = false;      // paneAnchor: the place on the map that sits in the middle of the frame
export const frameCentre = () => { const r = frameRect(); return L.point(r.x + r.w / 2, r.y + r.h / 2); };
export function centreInFrame(){
  if (!visibleBox().side) return;
  const c = frameCentre(), m = map.getSize().divideBy(2);
  paneCentred = true; paneAnchor = map.getCenter();
  if (c.x !== m.x || c.y !== m.y) map.panBy([Math.round(m.x - c.x), Math.round(m.y - c.y)], {animate: false});      // panBy moves the view: by (middle - frame centre) the map's content slides from the middle of the stage to the middle of the frame
}
map.on('moveend zoomend', () => { if (paneCentred && !reanchoring && !$('videoSheet').hidden && viewMode !== '3d') paneAnchor = map.containerPointToLatLng(frameCentre()); });      // the visitor moves the map: the frame's middle is the new anchor
map.on('resize', () => {            // a side panel folds away or comes back while the pane is open: the frame moves, and the map's content moves with it
  if (!paneCentred || $('videoSheet').hidden || viewMode === '3d' || !paneAnchor) return;
  const c = frameCentre(), p = map.latLngToContainerPoint(paneAnchor);
  reanchoring = true; map.panBy([Math.round(p.x - c.x), Math.round(p.y - c.y)], {animate: false}); reanchoring = false;
});
if (window.ResizeObserver) new ResizeObserver(() => { if (viewMode === '3d' && !$('videoSheet').hidden) { centre3D(); wire.update3DInfo(); } }).observe($('v3dCanvas'));      // 3D: the same, as the stage changes size
export function bringVisualIntoView(stay){            // phones: the visual has to be on screen when a download pane opens (the small window gives way to it), in the map and in 3D
  if (stay || !matchMedia('(max-width:720px)').matches) return;
  if ($('stage').classList.contains('is-full')) setFull(false);
  setMini(false);
  if (PHONE.matches) { if (paneScrollY == null) paneScrollY = scrollY; scrollTo(0, 0); syncPaneStage(); }      // portrait phone: the page is locked (css) and the viewer is pinned above the pane; the page scroll comes back on closing
  else $('stageSlot').scrollIntoView({behavior:'smooth', block:'start'});
}
let paneScrollY = null;
/* Portrait phone, pane open: the viewer is fixed above the pane (css: body.pane-open .stage); --vs-h is the pane's height, kept up to date while it changes */
function syncPaneStage(){
  const sh = $('videoSheet'); if (sh.hidden || !PHONE.matches) return;
  document.documentElement.style.setProperty('--vs-h', Math.ceil(sh.getBoundingClientRect().height) + 'px');
  map.invalidateSize({pan: false}); if (typeof wire.v3d !== 'undefined' && wire.v3d && wire.v3d.resize) try { wire.v3d.resize(); } catch {}
  updateFrame();
}
if (window.ResizeObserver) new ResizeObserver(syncPaneStage).observe($('videoSheet'));
PHONE.addEventListener('change', () => { document.documentElement.style.removeProperty('--vs-h'); setTimeout(syncPaneStage, 50); });
export function closeVideo(){
  if (vstate.busy) return; stopPreview();
  let shiftBack = null; if (paneCentred && viewMode !== '3d' && !$('videoSheet').hidden) { const c = frameCentre(), m = map.getSize().divideBy(2); shiftBack = {x: Math.round(c.x - m.x), y: Math.round(c.y - m.y)}; }
  document.body.classList.remove('pane-open', 'x-layers', 'x-bg', 'x-aerial'); placeLayerBox(false); drawOutlines(); M.group.addTo(map);
  $('videoSheet').hidden = true; $('videoFrame').hidden = true; syncExportRows(); $('app').classList.remove('is-framing'); sheetOverlap = 0; limitFrameView(); markArea(null);
  if (typeof wire.v3d !== 'undefined' && wire.v3d && wire.v3d.setShift) wire.v3d.setShift(0, 0);
  if (paneCentred) { paneCentred = false; if (viewMode !== '3d' && shiftBack) map.panBy([shiftBack.x, shiftBack.y], {animate: false}); }      // back to the middle of the whole stage
  document.documentElement.style.removeProperty('--vs-h'); map.invalidateSize({pan: false});
  if (paneScrollY != null) { scrollTo(0, paneScrollY); paneScrollY = null; }      // phone: back to where the page was
  syncBackgrounds(); setTimeout(evalMini, 400);      // after the page has settled, the small window returns if the visual is out of view
}
$('vkImage').onclick = () => { if (!vstate.busy && !wire.v3dBusy) openVideo('image'); }; $('vkVideo').onclick = () => { if (!vstate.busy && !wire.v3dBusy) openVideo('video'); };      // switch between the two panes without closing
/* the pane gives a short bounce when a button opens or switches it, so the visitor notices where it appeared (not with reduced motion) */
function pumpPane(){
  const sh = $('videoSheet');
  if (!sh.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = PHONE.matches ? 'translateY' : 'translateX';
  sh.animate([{transform: a + '(0)'}, {transform: a + '(14px)', offset: .3}, {transform: a + '(0)', offset: .55}, {transform: a + '(6px)', offset: .75}, {transform: a + '(0)'}], {duration: 520, easing: 'ease-out'});      // pushes toward its own screen edge and back: no gap opens
}
$('videoBtn').onclick = () => { closeOtherSharePanes(); openVideo(state.mode === 'single' && viewMode !== '3d' ? 'image' : 'video'); pumpPane(); scrollCompareTop(); };      // one year on the map is a picture (as syncPane says); a timelapse, a slider and the 3D view open on the animation $('vsClose').onclick = () => { closeVideo(); if (PHONE.matches) setTimeout(() => $('shareGroup').scrollIntoView({behavior: 'smooth', block: 'center'}), 60); };      // phones: back to the Create and share step, not to the top
export const FMT_BTN = { reel: 'vfReel', feed: 'vfFeed', wide: 'vfWide', custom: 'vfCustom' };
/* Custom frame: drag a handle; the frame stays inside the free area and at least 80 px wide and high */
$('videoFrame').addEventListener('pointerdown', e => {
  const h = /** @type {HTMLElement} */ (e.target).dataset && /** @type {HTMLElement} */ (e.target).dataset.h; if (!h || vstate.fmt !== 'custom') return;
  e.preventDefault(); const el = /** @type {HTMLElement} */ (e.target), host = $('videoFrame').offsetParent.getBoundingClientRect(); el.setPointerCapture(e.pointerId);
  const move = ev => {
    const A = frameAvail(), x = Math.min(1, Math.max(0, (ev.clientX - host.left - A.x) / A.w)), y = Math.min(1, Math.max(0, (ev.clientY - host.top - A.y) / A.h)), mw = 80 / A.w, mh = 80 / A.h;
    if (h.includes('w')) cust.l = Math.min(x, cust.r - mw); if (h.includes('e')) cust.r = Math.max(x, cust.l + mw);
    if (h.includes('n')) cust.t = Math.min(y, cust.b - mh); if (h.includes('s')) cust.b = Math.max(y, cust.t + mh);
    if (viewMode !== '3d') markArea(null);
    updateFrame();
  };
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
/* The custom frame as the glacier's image box: the frame takes its ratio (as large as fits) and the map is fitted to it */
export function snapToImageBox(){
  const fp = imageFootprint(currentGlacier()), A = frameAvail(), ratio = fp.w / fp.h;
  let w = A.w, h = w / ratio; if (h > A.h) { h = A.h; w = h * ratio; }
  const fw = w / A.w, fh = h / A.h; Object.assign(cust, { l: (1 - fw) / 2, r: (1 + fw) / 2, t: (1 - fh) / 2, b: (1 + fh) / 2 }); custBase = A;
  updateFrame(); frameTo('image'); updateFrame();
}
$('vSnap').onclick = snapToImageBox;
export const setFmt = f => {
  stopPreview();
  if (viewMode !== '3d' && !$('videoSheet').hidden) checkAreaSel();
  const keep = viewMode !== '3d' && areaSel && areaSel.which !== 'image' ? areaSel.which : null;      // Tongue or Whole glacier was pressed and the map not moved since: fit it again to the new frame
  const wasCustom = vstate.fmt === 'custom';
  vstate.fmt = f; Object.entries(FMT_BTN).forEach(([k, id]) => $(id).setAttribute('aria-pressed', k === f));
  updateFrame();
  if (f === 'custom' && viewMode !== '3d' && !wasCustom) { snapToImageBox(); }
  else if (keep) { frameTo(keep === 'whole'); updateFrame(); }
};
Object.entries(FMT_BTN).forEach(([k, id]) => $(id).onclick = () => setFmt(k));
/* the speed setter of the animation pane and the one under Compare / Timelapse are one setting */
export function syncSpeed(from){ const v = +$(from).value; ['speedSel', 'vSpeed'].forEach(id => { $(id).value = v; }); updateSpeedIcon(); const o = $('vSpeedOut'); if (o) o.textContent = `${SPEED_FPS[v]} fps`; const nd = $('vSpeedNeedle'); if (nd) nd.setAttribute('transform', `rotate(${speedAngle(v)} 12 18)`); }
$('vSpeed').oninput = () => { syncSpeed('vSpeed'); updateFrame(); };
$('speedSel').addEventListener('input', () => { syncSpeed('speedSel'); if (!$('videoSheet').hidden) updateFrame(); });
syncSpeed('speedSel');
$('vSafe').onchange = updateFrame;
$('vInset').onchange = () => { loadCountries(); updateFrame(); }; $('vMinimal').onchange = updateFrame; $('vEnd').onchange = () => { updateFrame(); restartPreview(); }; $('vFacts').onchange = $('vFactSet').onchange = updateFrame;
const restartPreview = () => { if (vPrev.on) { stopPreview(); startPreview(); } };      // the running preview takes the new order of the years
export const syncLoops = () => { $('vBounce').disabled = +$('vLoops').value < 2; updateFrame(); restartPreview(); };
$('vLoops').onchange = syncLoops; $('vBounce').onchange = () => { updateFrame(); restartPreview(); }; syncLoops();
$('vSwing').onchange = () => { if (viewMode === '3d') wire.update3DInfo(); };
/* The map behind the pane shows what the pane will make: Timelapse, Compare (the slider) or One year (a single image) */
export function syncModeToPane(){
  const want = vstate.kind === 'image' ? (state.mode === 'compare' ? 'modeCompare' : 'modeSingle') : vstate.type === 'swipe' ? 'modeCompare' : 'modeTimelapse';
  if (!$(want).getAttribute('aria-pressed') || $(want).getAttribute('aria-pressed') === 'false') $(want).click();
}
export function setType(t){ vstate.type = t; $('videoSheet').classList.toggle('is-swipe', t === 'swipe'); syncModeToPane(); updateFrame(); }

export function progress(frac, label){
  $('vsProgress').hidden = false; $('vsBar').style.width = Math.round(frac * 100) + '%';
  $('vsGo').textContent = label;
}

/* ---- drawing ---- */
export function niceScale(maxMetres){
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  return steps.filter(s => s <= maxMetres).pop() || 100;
}
export function fitText(ctx, text, weight, size, maxW){
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > 18);
  return s;
}
export function shadowText(ctx, text, x, y, opts = {}){
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = opts.blur ?? 14; ctx.shadowOffsetY = 2;
  ctx.fillStyle = opts.color || '#fff'; ctx.textAlign = opts.align || 'left'; ctx.fillText(text, x, y);
  ctx.restore();
}
/* One base picture per year: crop from the Copernicus image, brightness curve, optional 1850 outline */
/* The 1850 outline is a layer of the Layers box like the others: printed when it is ticked there, the glacier has one, and map layers are on */
export const oldOutlineOn = g => layersOn() && $('oldToggle').checked && hasOldOutline(g);
/* What the experimental outline shows in the picture of year ys[i]: one year, the two years of a slider, or (animation) the area lost since the first year up to it */
export const arcOptFor = (ys, i) => vstate.kind === 'image' ? (imgCompare() ? { mode: 'compare', ys } : { mode: 'single', year: ys[0] }) : vstate.type === 'swipe' ? { mode: 'compare', ys } : { mode: 'timelapse', year: ys[i], first: ys[0] };
export async function buildBase(img, crop, W, H, outline, maskGeom = null, o = 1, smooth = true, kind = 'image', bg = null, rasters = [], over = null, arcs = null){
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(spaceCanvas(W, H, 8000, W / 1080 * 1.2), 0, 0);
  const fp = crop.fp, s = W / (crop.x1 - crop.x0);
  if (bg) {      // background maps under the picture: the picture goes on its own canvas (brightness, fade outside the outline, opacity), then over the maps
    const t = document.createElement('canvas'); t.width = W; t.height = H; const tc = t.getContext('2d', {willReadFrequently: true});
    tc.imageSmoothingEnabled = smooth; tc.imageSmoothingQuality = 'high';
    tc.drawImage(img, (fp.bbox[0] - crop.x0) * s, (crop.y1 - fp.bbox[3]) * s, (fp.bbox[2] - fp.bbox[0]) * s, (fp.bbox[3] - fp.bbox[1]) * s);
    const b = brightness();
    if (Math.abs(b - 1) > 0.01) {
      const lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, 1 / b);
      const d = tc.getImageData(0, 0, W, H), px = d.data;
      for (let i = 0; i < px.length; i += 4) { px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]]; }
      tc.putImageData(d, 0, 0);
    }
    const P0 = ll => { const p = L.CRS.EPSG3857.project(L.latLng(ll[1], ll[0])); return [(p.x - crop.x0) * s, (crop.y1 - p.y) * s]; };
    if (maskGeom && o < 0.99) {      // outside the outline the picture becomes transparent: the maps show through
      tc.save(); tc.beginPath(); tc.rect(0, 0, W, H);
      maskGeom.coordinates.forEach(poly => poly.forEach(ring => { ring.forEach((pt, i) => { const [x, y] = P0(pt); i ? tc.lineTo(x, y) : tc.moveTo(x, y); }); tc.closePath(); }));
      tc.clip('evenodd'); tc.globalCompositeOperation = 'destination-out'; tc.globalAlpha = 1 - o; tc.fillRect(0, 0, W, H); tc.restore();
    }
    ctx.drawImage(bg, 0, 0); ctx.save(); ctx.globalAlpha = satOn() ? imgOpacity() : 0; ctx.drawImage(t, 0, 0); ctx.restore();      // the picture switched off: the download shows the map layers alone, as the frame does
    drawExportRasters(ctx, P0, rasters);
    drawExportArcs(ctx, P0, W, arcs, kind);
    if (outline) { ctx.save(); strokeEdgeFade(ctx, outline, P0, '#F2A93B', W / 1080 * 1.2); ctx.restore(); }
    if (over) ctx.drawImage(over, 0, 0);      // place labels and trails above the picture and its outlines
    drawExportLayers(ctx, P0, W / 1080 * 1.6, kind, rasters);
    return c;
  }
  ctx.imageSmoothingEnabled = smooth; ctx.imageSmoothingQuality = 'high';      // Landsat is smoothed like Sentinel-2
  ctx.drawImage(img, (fp.bbox[0] - crop.x0) * s, (crop.y1 - fp.bbox[3]) * s, (fp.bbox[2] - fp.bbox[0]) * s, (fp.bbox[3] - fp.bbox[1]) * s);
  const b = brightness();
  if (Math.abs(b - 1) > 0.01) {                         // same curve as the brightness slider
    const lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, 1 / b);
    const d = ctx.getImageData(0, 0, W, H), px = d.data;
    for (let i = 0; i < px.length; i += 4) { px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]]; }
    ctx.putImageData(d, 0, 0);
  }
  const P = ll => { const p = L.CRS.EPSG3857.project(L.latLng(ll[1], ll[0])); return [(p.x - crop.x0) * s, (crop.y1 - p.y) * s]; };
  if (maskGeom && o < 0.99) {                           // outside the outline the picture fades into deep space (a download has no map underneath)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H);
    maskGeom.coordinates.forEach(poly => poly.forEach(ring => { ring.forEach((pt, i) => { const [x, y] = P(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }));
    ctx.clip('evenodd'); ctx.globalAlpha = 1 - o; ctx.drawImage(spaceCanvas(W, H, 8000, W / 1080 * 1.2), 0, 0); ctx.restore();
  }
  drawExportRasters(ctx, P, rasters);
  drawExportArcs(ctx, P, W, arcs, kind);
  if (outline) {
    ctx.save();
    strokeEdgeFade(ctx, outline, P, '#F2A93B', W / 1080 * 1.2);
    ctx.restore();
  }
  if (over) ctx.drawImage(over, 0, 0);
  drawExportLayers(ctx, P, W / 1080 * 1.6, kind, rasters);      // the ticked map layers: their own pass over the picture
  return c;
}
/* Short dark gradients keep the text readable on bright ice and snow, instead of boxes: one at the top, one behind the bottom block (text, facts, year). */
export function shade(ctx, W, H, S, blockH = 420){
  let g = ctx.createLinearGradient(0, 0, 0, S.top + 340);
  g.addColorStop(0, 'rgba(8,14,18,.58)'); g.addColorStop(.6, 'rgba(8,14,18,.24)'); g.addColorStop(1, 'rgba(8,14,18,0)');      // the one soft gradient behind the header, as on screen
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, S.top + 340);
  const base = H - S.bottom, top = Math.max(0, base - blockH), t1 = Math.min(1, (base + 50 - top) / (H - top));
  g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, 'rgba(8,14,18,0)'); g.addColorStop(t1, 'rgba(8,14,18,.58)'); g.addColorStop(1, 'rgba(8,14,18,.7)');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
}
/* The white logo in front of the label "TONGUES FROM SPACE" on pictures and videos; loaded once, drawn as a picture (not text) */
export const LOGO_URL = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 200 190%27%3E%3Cdefs%3E%3Cmask id=%27mouthcut%27 maskUnits=%27userSpaceOnUse%27 x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27%3E%3Crect x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27 fill=%27%23fff%27/%3E%3Cellipse cx=%27100%27 cy=%2788%27 rx=%2748%27 ry=%2724%27 fill=%27%23000%27/%3E%3C/mask%3E%3Cmask id=%27groovecut%27 maskUnits=%27userSpaceOnUse%27 x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27%3E%3Crect x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27 fill=%27%23fff%27/%3E%3Cpath d=%27M92 90 C112 108 126 136 126 166%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%274%27 stroke-linecap=%27round%27/%3E%3C/mask%3E%3C/defs%3E%3Cg fill=%27%23FFFFFF%27%3E%3Cpath d=%27M4 100 L62 20 L90 56 L102 44 L120 60 L144 44 L188 100 Z%27 mask=%27url%28%23mouthcut%29%27/%3E%3Cpath d=%27M74 86 C92 104 82 136 82 158 A44 24 0 0 0 170 158 C170 134 134 108 110 86 Q92 78 74 86 Z%27 mask=%27url%28%23groovecut%29%27/%3E%3Cpath d=%27M172 8 Q173 21 186 22 Q173 23 172 36 Q171 23 158 22 Q171 21 172 8 Z%27/%3E%3C/g%3E%3C/svg%3E';   // embedded: the logo folder is not published
export let logoImg = null;
export async function loadLogo(){
  if (logoImg) return;
  try { const im = new Image(); im.src = LOGO_URL; await im.decode(); logoImg = im; } catch {}
}
export const FACT_BLUE = '#8FDDF3', FACT_RED = '#FF7A6E', MINUS_SIGN = '−';
export const easeIO = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
export const placeOf = (g, ...first) => [...first, g.canton, g.range].filter(Boolean).join(' · ');
/* The credit line on pictures and videos: short, the full list of sources is in About on the site */
export const shortCredit = (years, extras = []) => {
  const ys = String(years).match(/\d{4}/g) || [], ls = ys.filter(y => isLandsat(state.available[+y])), s2 = ys.filter(y => !ls.includes(y));      // Landsat years (Iceland, before 2016) are credited to the USGS, the others to Copernicus
  const sat = [s2.length || !ls.length ? `Modified Copernicus Sentinel data ${s2.length ? [...new Set(s2)].join(' and ') : years}` : '', ls.length ? `Landsat ${[...new Set(ls)].join(' and ')} courtesy of the U.S. Geological Survey` : ''].filter(Boolean).join(' · ');
  return `${sat}${[...new Set(extras.filter(Boolean))].map(x => ' · ' + x).join('')}`;      // the data credit; "Created on <site>" is its own line in the bottom right corner (siteLine)
};
export const SITE_LOGO_H = 30, siteLogoW = () => SITE_LOGO_H * 200 / 190 + 12;
export const siteLine = (ctx, xRight, y) => {            // "Created on tonguesfromspace.org" with the small logo behind it, right aligned; in 3D videos the logo turns with the camera
  const lw = logoImg ? siteLogoW() : 0;
  ctx.font = `600 22px ${FONT}`; shadowText(ctx, `Created on ${SITE_NAME}`, xRight - lw, y, {blur:6, color:'rgba(255,255,255,.9)', align:'right'});
  if (!logoImg) return;
  const lx = xRight - SITE_LOGO_H * 200 / 190, ly = y - SITE_LOGO_H * 0.8;
  if (brandMotion) wire.drawLogo3DAt(ctx, lx, ly, SITE_LOGO_H, brandMotion.cam, brandMotion.cam0);
  else { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 8; ctx.drawImage(logoImg, lx, ly, SITE_LOGO_H * 200 / 190, SITE_LOGO_H); ctx.restore(); }
};
export const siteLineW = ctx => { ctx.save(); ctx.font = `600 22px ${FONT}`; const w = ctx.measureText(`Created on ${SITE_NAME}`).width + (logoImg ? siteLogoW() : 0); ctx.restore(); return w; };
export const creditYears = info => info.compare ? `${info.years[0]} and ${info.years[1]}` : info.years[0] === info.years[info.years.length - 1] ? String(info.years[0]) : `${info.years[0]}–${info.years[info.years.length - 1]}`;
/* One brand corner: the logo and the red label on one line (22 px, nothing smaller than 22 px anywhere: it must stay readable on a phone) */
export let brandMotion = null;      // 3D videos: {cam, cam0}, the camera now and at the start; the small logo of the brand corner then turns and tilts with it (set around draw3DLabels in js/11-view3d.js)
export function brandCorner(ctx, x, y){
  let tx = x; const h = 36;
  if (logoImg && brandMotion) { wire.drawLogo3DAt(ctx, x, y - h * .8, h, brandMotion.cam, brandMotion.cam0); tx = x + h * 200 / 190 + 12; }
  else if (logoImg) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 8; ctx.drawImage(logoImg, x, y - h * .8, h * 200 / 190, h); ctx.restore(); tx = x + h * 200 / 190 + 12; }
  ctx.font = `700 22px ${FONT}`; shadowText(ctx, 'TONGUES FROM SPACE', tx, y, {blur:8, color:'#FF5A4E'});
}
/* "Minimize text": no header, timeline, map key or legend; one small white line up the left edge, inside the picture: where it was made, glacier and year, the data credit.
   The glacier facts, when ticked, still sit at the bottom. */
export const minimalOn = () => !!$('vMinimal') && $('vMinimal').checked;
export function minimalLabels(ctx, W, H, S, name, yearText, credit, hA = 1, tiles = []){
  const px = Math.max(11, Math.round(Math.min(W, H) / 1080 * 14)), edge = Math.round(px * 1.4);
  ctx.save(); ctx.globalAlpha *= hA; ctx.textBaseline = 'alphabetic';
  if (tiles.length) {
    const wide = W > H, gap = 10, th = 92, maxW = W - S.left - S.right, base = H - S.bottom;
    if (wide) { const tw = 260; drawFactTiles(ctx, tiles, W - S.right - tiles.length * tw - (tiles.length - 1) * gap, base - th, tw, th, gap); }
    else { const tw = (maxW - (tiles.length - 1) * gap) / tiles.length; drawFactTiles(ctx, tiles, S.left, base - th, tw, th, gap); }
  }
  ctx.translate(edge, H - edge); ctx.rotate(-Math.PI / 2);      // reads upwards, from the bottom left corner
  const line = `Created on ${SITE_NAME} · ${name} ${yearText} · ${credit}`, maxLen = H - 2 * edge;      // the line must stay inside the picture: smaller type until it fits
  let fs = px; ctx.font = `500 ${fs}px ${FONT}`;
  while (fs > 6 && ctx.measureText(line).width > maxLen) { fs -= 0.5; ctx.font = `500 ${fs}px ${FONT}`; }
  shadowText(ctx, line, 0, 0, {blur: 5, color: 'rgba(255,255,255,.92)'});
  ctx.restore();
}
/* The map key: north arrow and scale bar side by side at the top right, on two shared lines (the labels on the brand label's baseline, the arrow's foot and the bar below) */
export const mapKeySize = res => { const m = niceScale(300 * res), px = m / res; return { m, px, w: 22 + 18 + px }; };
export function mapKey(ctx, res, rightX, top){
  const k = mapKeySize(res), x0 = rightX - k.w, ax = x0 + 11, labelY = top + 24, foot = top + 58, bx = rightX - k.px;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(ax, labelY + 10); ctx.lineTo(ax + 10, foot); ctx.lineTo(ax, foot - 8); ctx.lineTo(ax - 10, foot); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 6; ctx.fillRect(bx, foot - 4, k.px, 4); ctx.fillRect(bx, foot - 13, 3, 13); ctx.fillRect(rightX - 3, foot - 13, 3, 13); ctx.restore();
  ctx.font = `700 22px ${FONT}`; shadowText(ctx, 'N', ax, labelY, {align:'center', blur:6});
  ctx.font = `600 22px ${FONT}`; shadowText(ctx, k.m >= 1000 ? `${k.m / 1000} km` : `${k.m} m`, bx + k.px / 2, labelY, {align:'center', blur:8});
}
/* The location inset: the country as a simple outline with a red dot at the glacier, under the map key (top right). Outlines: data/country-outlines.js (Natural Earth, public domain), loaded when the switch is on. */
const COUNTRIES = () => /** @type {any} */ (window).COUNTRY_OUTLINES;
export const insetOn = () => !!$('vInset') && $('vInset').checked;
let countryLoad = null;
export function loadCountries(){
  if (COUNTRIES() || countryLoad) return;
  countryLoad = new Promise(res => { const sc = document.createElement('script'); sc.src = asset('data/country-outlines.js'); sc.onload = res; sc.onerror = () => res(); document.head.appendChild(sc); }).then(() => { try { drawPreview(); } catch {} });
}
function insetGeo(W, g){            // the country's box and scale at this picture width; null when the inset is off or has no outline
  if (!insetOn()) return null;
  loadCountries();
  const rings = COUNTRIES() && COUNTRIES()[REGION.id], ll = g && (g.tongue || (g.lat != null && [g.lat, g.lon]));
  if (!rings || !ll) return null;
  let a = 90, b = -90, c = 180, d = -180;
  rings.forEach(r => r.forEach(([la, lo]) => { a = Math.min(a, la); b = Math.max(b, la); c = Math.min(c, lo); d = Math.max(d, lo); }));
  const kx = Math.cos((a + b) / 2 * Math.PI / 180), u = W >= 1500 ? 1.3 : 1, ww = (d - c) * kx, hh = b - a, sc = Math.min(150 * u / ww, 100 * u / hh);
  return { rings, ll, a, b, c, kx, u, sc, w: ww * sc };
}
export const insetWidth = (W, g) => { const m = insetGeo(W, g); return m ? m.w : 0; };      // the 3D view moves its north arrow aside by this much
export function drawInset(ctx, W, S, g, top, hA = 1){
  const m = insetGeo(W, g); if (!m) return;
  const { rings, ll, a, b, c, kx, u, sc, w } = m, rightX = W - S.right, X = lo => rightX - w + (lo - c) * kx * sc, Y = la => top + (b - la) * sc;
  ctx.save(); ctx.globalAlpha *= hA; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8; ctx.lineJoin = 'round';
  ctx.beginPath(); rings.forEach(r => r.forEach(([la, lo], i) => i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))) || ctx.closePath());
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2 * u; ctx.stroke();
  const x = X(ll[1]), y = Y(ll[0]);
  ctx.beginPath(); ctx.arc(x, y, 13 * u, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2 * u; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 6.5 * u, 0, Math.PI * 2); ctx.fillStyle = '#C8322A'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * u; ctx.stroke();
  ctx.restore();
}
/* The top block, built like the year tag on screen: the brand, then the year as the big line, under it the glacier and its place, then the date and what the picture is, then the legend of the outlines.
   o: year (text), name, place, date [bold, long rest, short rest] or null, legend, keyW (width of the map key to keep clear), hA (opacity of everything but the brand and the year: the header fades in at the start of a video),
   yearAlpha / yearClip (the first year of a slider picture fades and is cut with its image), shortDate (only the short rest of the date line). Returns the baseline of the last line. */
export const YEAR_PX = 88, NAME_PX = 34, SUB_PX = 24;
export const heroBase = S => S.top + 24 + 46 + Math.round(0.72 * YEAR_PX);      // the later year of a vertical slider sits under the map key on the right      // where the baseline of a year at full size lies
export const noPicture = () => !satOn() || imgOpacity() <= 0;      // the Sentinel-2 picture is off or fully transparent: its year, date and description are left out of the frame
export function drawHeader(ctx, W, S, o){
  const x = S.left, textW = W - S.left - S.right - (o.keyW ? o.keyW + 36 : 0);
  ctx.save(); ctx.textBaseline = 'alphabetic';
  let y = S.top - 38;      // the top of the big year lines up with the top of the north arrow and scale bar (their labels start at S.top + 8)
  if (o.year) {
    const ys = fitText(ctx, o.year, 800, YEAR_PX, textW); y += 46 + Math.round(0.72 * ys);
    ctx.save(); if (o.yearClip) { ctx.beginPath(); ctx.rect(...o.yearClip); ctx.clip(); } ctx.globalAlpha *= o.yearAlpha ?? 1; shadowText(ctx, o.year, x - 4, y, {blur:14});
    if (o.date) { const yw = ctx.measureText(o.year).width; ctx.font = `700 ${SUB_PX + 4}px ${FONT}`; if (yw + 20 + ctx.measureText(o.date[0]).width <= textW) shadowText(ctx, o.date[0], x - 4 + yw + 20, y, {blur:8}); }      // the date of the picture: small, behind the year, on its baseline
    ctx.restore();
  } else y += 14;
  ctx.globalAlpha *= o.hA ?? 1;
  y += 46;
  const ns = fitText(ctx, o.name, 700, NAME_PX, textW); shadowText(ctx, o.name, x, y, {blur:8}); const nw = ctx.measureText(o.name).width;
  if (o.place) {
    ctx.font = `500 ${SUB_PX}px ${FONT}`; const pt = ` · ${o.place}`;      // canton and range in the size of the line under them
    if (nw + ctx.measureText(pt).width <= textW) shadowText(ctx, pt, x + nw, y, {blur:8, color:'rgba(255,255,255,.9)'});
    else { y += 32; ctx.font = `500 ${SUB_PX}px ${FONT}`; shadowText(ctx, o.place, x, y, {blur:8, color:'rgba(255,255,255,.9)'}); }
  }
  if (o.date) {            // what the picture is, under the place: the long text when it fits, else the short one
    y += 34; ctx.font = `500 ${SUB_PX}px ${FONT}`;
    const rest = (!o.shortDate && ctx.measureText(o.date[1]).width <= textW ? o.date[1] : o.date[2]).replace(/^\s*·\s*/, ''); shadowText(ctx, rest, x, y, {blur:8, color:'rgba(255,255,255,.9)'});
  }
  (o.legend || []).forEach(([color, dash, text], i) => {
    y += i ? 34 : 42;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 50, y - 8); ctx.stroke(); ctx.restore();
    ctx.font = `500 22px ${FONT}`; shadowText(ctx, text, x + 66, y, {blur:8});
  });
  (o.cards || []).forEach(c => { y = drawLegendCard(ctx, x, y + 22, c) - 22; });      // legend cards of the colour layers (thickness, speed)
  ctx.restore(); return y;
}
/* Facts: flat dark tiles with a hairline edge (no blur: Safari ignores filters) */
export function drawFactTiles(ctx, tiles, x, y, tw, th, gap){
  tiles.forEach((t, i) => {
    const tx = x + i * (tw + gap);
    ctx.save(); ctx.fillStyle = 'rgba(8,14,18,.4)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, y, tw, th, 14) : ctx.rect(tx, y, tw, th); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx + .75, y + .75, tw - 1.5, th - 1.5, 13) : ctx.rect(tx, y, tw, th); ctx.stroke(); ctx.restore();
    const ls = fitText(ctx, t.label, 700, 22, tw - 32); ctx.font = `700 ${ls}px ${FONT}`; shadowText(ctx, t.label, tx + 16, y + 30, {color:'rgba(255,255,255,.72)', shadow:false});
    let vs = 42; const us = 22;
    for (; vs > 30; vs -= 2) { ctx.font = `800 ${vs}px ${FONT}`; const vw = ctx.measureText(t.value).width; ctx.font = `600 ${us}px ${FONT}`; if (vw + 6 + ctx.measureText(t.unit).width <= tw - 32) break; }
    ctx.font = `800 ${vs}px ${FONT}`; const vw = ctx.measureText(t.value).width;
    shadowText(ctx, t.value, tx + 16, y + th - 16, {color:t.color, blur:6});
    ctx.font = `600 ${us}px ${FONT}`; shadowText(ctx, t.unit, tx + 16 + vw + 6, y + th - 16, {color:'rgba(255,255,255,.9)', blur:6});
  });
}
/* The years as a line with a tick for each; replaces the progress dots. pos: index (fractions while the picture changes). */
export function drawTimeline(ctx, x0, x1, y, years, pos){
  const n = years.length; if (n < 2 || x1 - x0 < 120) return;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  const xp = x0 + (x1 - x0) * pos / (n - 1);
  ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xp, y); ctx.stroke();
  years.forEach((_, i) => { ctx.fillStyle = i <= pos + .01 ? '#fff' : 'rgba(255,255,255,.4)'; ctx.fillRect(x0 + (x1 - x0) * i / (n - 1) - 1, y - 6, 2, 12); });
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(xp, y, 8, 0, 7); ctx.fill(); ctx.restore();
  ctx.font = `500 22px ${FONT}`; shadowText(ctx, String(years[0]), x0, y - 16, {color:'rgba(255,255,255,.8)', blur:6, align:'center'});      // each year is centred over its tick
  shadowText(ctx, String(years[n - 1]), x1, y - 16, {color:'rgba(255,255,255,.8)', blur:6, align:'center'});
}
/* The bottom block, from the bottom edge up: the credit line, the timeline of the years, and above it the fact tiles. (The year itself is in the header.)
   o: credit (text), tiles, tl {years, pos}. */
export function drawBottom(ctx, W, H, S, o){
  const wide = W > H, x = S.left, maxW = W - S.left - S.right, lh = 28;
  ctx.textBaseline = 'alphabetic'; ctx.font = `500 22px ${FONT}`;
  const sw = siteLineW(ctx) + 30, lines = wrap(ctx, o.credit, 0, 0, maxW - sw, lh).map(l => l.t), base0 = H - S.bottom - (lines.length - 1) * lh;
  lines.forEach((t, i) => shadowText(ctx, t, x, base0 + i * lh, {blur:6, color:'rgba(255,255,255,.78)'}));
  siteLine(ctx, W - S.right, H - S.bottom);      // "Created on tonguesfromspace.org": the bottom right corner, level with the last line of the credit
  let top = base0 - 40;
  if (o.tl) { const yTL = base0 - 64; drawTimeline(ctx, x, W - S.right - 6, yTL, o.tl.years, o.tl.pos); top = yTL - 54; }
  const tiles = o.tiles || [], gap = 10, th = 92;
  if (tiles.length) {
    if (wide) { const tw = 260, left = W - S.right - tiles.length * tw - (tiles.length - 1) * gap; drawFactTiles(ctx, tiles, left, top - th, tw, th, gap); }
    else { const tw = (maxW - (tiles.length - 1) * gap) / tiles.length; drawFactTiles(ctx, tiles, x, top - th, tw, th, gap); }
  }
}
export function drawSwipeLabels(ctx, W, H, S, info, split){
  if (minimalOn()) return drawInset(ctx, W, S, info.glacier, S.top, info.hA ?? 1), minimalLabels(ctx, W, H, S, stillName(info.glacier), `${info.years[0]} | ${info.years[1]}`, shortCredit(`${Math.min(...info.years)} and ${Math.max(...info.years)}`, [(info.outline || info.xNew) && REGION.outlines.credit, ...(info.xCredit || [])]), info.hA ?? 1);
  shade(ctx, W, H, S, 300);
  const base = H - S.bottom, hz = info.horiz, hA = info.hA ?? 1, g = info.glacier, sc = info.scenes || [];
  const dateOf = k => sc[k] ? [fmtDM(sc[k].date), ` · ${styleLine(k === 1 && info.styleB || info.style, sc[k])}`, ` · ${sensorName(sc[k])} · ${styleName(k === 1 && info.styleB || info.style, sc[k])}`] : null;
  const al = Math.min(1, split / (W * 0.25)), ar = Math.min(1, (W - split) / (W * 0.25));      // a year fades when its image is almost hidden
  const np = noPicture();
  drawHeader(ctx, W, S, {year: np ? '' : String(info.years[0]), name: stillName(g), place: placeOf(g), date: np ? null : dateOf(0), shortDate: !hz, hA, keyW: mapKeySize(info.res).w,
    yearAlpha: hz ? 1 : al, yearClip: hz ? [0, 0, W, split] : null, legend: [...(info.outline ? [['#F2A93B', [14, 9], REGION.outlines.oldLegend]] : []), ...(info.xLegend || [])], cards: info.xCards});
  ctx.save(); ctx.globalAlpha *= hA; mapKey(ctx, info.res, W - S.right, S.top); ctx.restore();
  drawInset(ctx, W, S, g, hz ? S.top + 80 : heroBase(S) + 80, hA);
  // divider with a round handle
  const along = hz ? H : W;
  if (!info.noDivider && split > 2 && split < along - 2) {
    ctx.save(); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10;
    if (hz) ctx.fillRect(0, split - 2, W, 4); else ctx.fillRect(split - 2, 0, 4, H);
    const cx = hz ? W * 0.5 : split, cy = hz ? split : H * 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#22313A'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.translate(cx, cy); if (hz) ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-16, 0); ctx.lineTo(-6, 10); ctx.moveTo(6, -10); ctx.lineTo(16, 0); ctx.lineTo(6, 10); ctx.stroke(); ctx.restore();
  }
  // the later year, in the same type: top right over the right image, or at the bottom left over the lower image
  const db = dateOf(1), dateLine = (x, y, align) => { if (!db) return; ctx.font = `600 ${SUB_PX}px ${FONT}`; const bw = ctx.measureText(db[0]).width; ctx.font = `500 ${SUB_PX}px ${FONT}`; const rw = ctx.measureText(db[2]).width;
    if (align === 'right') { shadowText(ctx, db[2], x, y, {blur:8, color:'rgba(255,255,255,.9)', align:'right'}); ctx.font = `600 ${SUB_PX}px ${FONT}`; shadowText(ctx, db[0], x - rw, y, {blur:8, align:'right'}); }
    else { ctx.font = `600 ${SUB_PX}px ${FONT}`; shadowText(ctx, db[0], x, y, {blur:8}); ctx.font = `500 ${SUB_PX}px ${FONT}`; shadowText(ctx, db[2], x + bw, y, {blur:8, color:'rgba(255,255,255,.9)'}); } };
  ctx.font = `800 ${YEAR_PX}px ${FONT}`;
  if (np) { /* no picture: no second year either */ } else if (hz) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, split, W, H - split); ctx.clip();
    shadowText(ctx, String(info.years[1]), S.left - 4, base - 112, {blur:14}); dateLine(S.left, base - 72, 'left'); ctx.restore();
  } else {
    ctx.save(); ctx.globalAlpha = ar; const y = heroBase(S);
    shadowText(ctx, String(info.years[1]), W - S.right, y, {blur:14, align:'right'}); dateLine(W - S.right, y + 46, 'right'); ctx.restore();
  }
  ctx.font = `500 22px ${FONT}`; shadowText(ctx, shortCredit(`${Math.min(...info.years)} and ${Math.max(...info.years)}`, [(info.outline || info.xNew) && REGION.outlines.credit, ...(info.xCredit || [])]), S.left, base, {blur:6, color:'rgba(255,255,255,.78)'});
  siteLine(ctx, W - S.right, base);
}
/* The frame of a single year (a picture, or one frame of a timelapse): top block, map key, bottom block with facts and timeline */
export function drawYearFrame(ctx, W, H, S, info, yr, scene, tlYears){
  const g = info.glacier, hA = info.hA ?? 1;
  if (minimalOn()) return drawInset(ctx, W, S, g, S.top, hA), minimalLabels(ctx, W, H, S, stillName(g), String(yr), shortCredit(creditYears(info), [(info.outline || info.xNew) && REGION.outlines.credit, ...(info.xCredit || [])]), hA, info.factSet ? factTiles(g, yr, info.factSet, info.factBase) : []);
  shade(ctx, W, H, S);
  const np = noPicture();
  drawHeader(ctx, W, S, {year: np ? '' : String(yr), name: stillName(g), place: placeOf(g), hA, keyW: mapKeySize(info.res).w, legend: [...(info.outline ? [['#F2A93B', [14, 9], REGION.outlines.oldLegend]] : []), ...(info.xLegend || [])], cards: info.xCards,
    date: np ? null : [fmtDM(scene.date), ` · ${styleLine(info.style, scene)}`, ` · ${sensorName(scene)} · ${styleName(info.style, scene)}`]});
  ctx.save(); ctx.globalAlpha *= hA; mapKey(ctx, info.res, W - S.right, S.top); ctx.restore();
  drawInset(ctx, W, S, g, S.top + 80, hA);
  drawBottom(ctx, W, H, S, {
    credit: shortCredit(creditYears(info), [(info.outline || info.xNew) && REGION.outlines.credit, ...(info.xCredit || [])]),
    tiles: info.factSet ? factTiles(g, yr, info.factSet, info.factBase) : [],
    tl: tlYears.length > 1 ? { years: tlYears, pos: Math.max(0, tlYears.indexOf(yr)) } : null
  });
}
export function drawLabels(ctx, W, H, S, info, k){ drawYearFrame(ctx, W, H, S, info, info.years[k], info.scenes[k], info.years); }
export function drawStill(ctx, W, H, info, S){ drawYearFrame(ctx, W, H, S, info, info.years[0], info.scenes[0], info.tlYears || info.years); }
/* The end card: what melted in the chosen period. One big number (the glacier's share of ice, else all Swiss glaciers), one comparison, the Swiss context, the site.
   te: seconds since the card began (it fades in over 0.4 s, the number counts up); without te the finished card. */
export function drawEndSlide(ctx, W, H, S, info, te){
  const e = info.end, g = info.glacier, wide = W > H, x = S.left, maxW = Math.min(W - S.left - S.right, wide ? 760 : 820), fin = te == null;
  const A = (t0, d = .35) => fin ? 1 : easeIO((te - t0) / d);
  ctx.save(); ctx.globalAlpha *= fin ? 1 : easeIO(te / .4);
  if (wide) { const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(8,14,18,.92)'); gr.addColorStop(.55, 'rgba(8,14,18,.84)'); gr.addColorStop(1, 'rgba(8,14,18,.35)'); ctx.fillStyle = gr; }
  else ctx.fillStyle = 'rgba(8,14,18,.8)';
  ctx.fillRect(0, 0, W, H);
  const hero = e.glacier || e.swiss, label = `${e.glacier ? stillName(g).toUpperCase() : 'ALL SWISS GLACIERS'} · ${e.from === e.to ? e.from - 1 : e.from}–${e.to}`, sub = e.glacier ? 'of its ice (estimate)' : 'of their ice';
  ctx.textBaseline = 'alphabetic'; ctx.font = `600 32px ${FONT}`;
  const comp = wrap(ctx, `about ${hero.N.poolsLong} Olympic pools of water`, 0, 0, maxW, 42).map(l => l.t), rows = e.glacier ? 1 : 0;
  const blockH = 190 + 46 + 66 + comp.length * 42 + (rows ? 44 + 52 : 0) + 90;
  const availH = H - S.top - S.bottom - 70, y0 = S.top + Math.max(0, (availH - blockH) / 2);
  let y = y0 + 26;
  ctx.save(); ctx.globalAlpha *= A(0); ctx.font = `700 24px ${FONT}`; shadowText(ctx, label, x, y, {color:'#FF5A4E', shadow:false}); ctx.restore();
  const p = fin ? 1 : easeIO((te - .25) / 1.2), hy = y + 54 + 106, shown = hero.pct * p, txt = `${MINUS_SIGN}${hero.pct < 10 ? shown.toFixed(1) : Math.round(shown)} %`;
  ctx.save(); ctx.globalAlpha *= A(.1);
  ctx.font = `800 150px ${FONT}`; shadowText(ctx, txt, x - 8, hy, {color:FACT_BLUE, blur:16});
  ctx.font = `600 30px ${FONT}`; shadowText(ctx, sub, x, hy + 46, {shadow:false}); ctx.restore();
  let cy = hy + 46 + 66;
  ctx.save(); ctx.globalAlpha *= A(1.0); ctx.font = `600 32px ${FONT}`; comp.forEach((l, i) => shadowText(ctx, l, x, cy + i * 42, {shadow:false})); ctx.restore();
  cy += (comp.length - 1) * 42;
  let ty = cy + 28 + 76;
  if (rows) {
    const dy = cy + 44;
    ctx.save(); ctx.globalAlpha *= A(1.4); ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.fillRect(x, dy - 24, maxW, 2);
    ctx.font = `600 28px ${FONT}`; shadowText(ctx, 'All Swiss glaciers', x, dy + 28, {shadow:false});
    ctx.font = `800 36px ${FONT}`; shadowText(ctx, `${MINUS_SIGN}${e.swiss.pct} %`, x + maxW, dy + 30, {align:'right', color:FACT_RED, shadow:false}); ctx.restore();
    ty = dy + 28 + 76;
  }
  ctx.save(); ctx.globalAlpha *= A(1.8);
  let tx = x; if (logoImg) { ctx.drawImage(logoImg, x, ty - 34, 44 * 200 / 190, 44); tx = x + 44 * 200 / 190 + 14; }
  ctx.font = `700 28px ${FONT}`; shadowText(ctx, SITE_NAME, tx, ty, {shadow:false}); ctx.restore();
  const base = H - S.bottom; ctx.font = `500 22px ${FONT}`;
  const lines = wrap(ctx, shortCredit(creditYears(info), ['GLAMOS', e.glacier && 'Grab et al. 2021']), 0, 0, W - S.left - S.right - siteLineW(ctx) - 30, 30).map(l => l.t);
  ctx.save(); ctx.globalAlpha *= A(.2);
  lines.forEach((l, i) => shadowText(ctx, l, x, base - (lines.length - 1 - i) * 30, {color:'rgba(255,255,255,.7)', shadow:false}));
  ctx.save(); ctx.globalAlpha *= 1; siteLine(ctx, W - S.right, base); ctx.restore();
  ctx.restore(); ctx.restore();
}
export function wrap(ctx, text, x, y, maxW, lh){
  const words = text.split(' '), out = []; let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
  if (line) out.push(line);
  return out.map((t, i) => ({t, y: y + i * lh}));
}

/* ---- encoding ---- */
export async function pickCodec(W, H, bitrate = 8e6){
  for (const codec of VIDEO.codecs) {
    const cfg = { codec, width:W, height:H, bitrate, framerate:VIDEO.fps, avc:{format:'avc'} };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
  }
  return null;
}
/* The pictures of the given years, cropped to the frame on the map, with the optional 1850 outline, and the facts the labels need */
export async function frameBases(ys, W, H){
  const g = currentGlacier(), fp = imageFootprint(g), r = frameRect();
  const nw = L.CRS.EPSG3857.project(map.containerPointToLatLng([r.x, r.y]));
  const se = L.CRS.EPSG3857.project(map.containerPointToLatLng([r.x + r.w, r.y + r.h]));
  const crop = { x0: nw.x, x1: se.x, y1: nw.y, fp };
  const outline = oldOutlineOn(g) ? oldOutlineGeom(g) : null;
  await Promise.all([loadLogo(), ...['600 30px', '800 120px', '500 30px', '700 40px'].map(f => document.fonts.load(`${f} "Schibsted Grotesk"`).catch(() => {}))]);

  // images of all years (most are cached already), decoded one after the other with createImageBitmap: robust also on phones
  let done = 0;
  const urls = await Promise.all(ys.map((y, i) => loadImage(g, y, null, undefined, sideStyle(i)).then(url => { progress(0.2 * (++done) / ys.length, `Loading images ${done} of ${ys.length}…`); return url; })));
  const rasters = await prepareRasters(vstate.kind, { crop, W, H }), bgr = await buildBackground(crop, W, H, vstate.kind, null, fp), ovr = await buildBackground(crop, W, H, vstate.kind, null, fp, true), bases = [];      // the background maps, made once for all years
  let lost = (bgr ? bgr.failed : 0) + (ovr ? ovr.failed : 0), all = (bgr ? bgr.total : 0) + (ovr ? ovr.total : 0);
  for (const [i, url] of urls.entries()) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    let bgc = bgr && bgr.canvas;
    if (perYearBackground(vstate.kind)) {      // aerial photographs of this picture's year, on top of the maps
      const ar = await buildBackground(crop, W, H, vstate.kind, ys[i], fp); lost += ar.failed; all += ar.total;
      const m = document.createElement('canvas'); m.width = W; m.height = H; const mc = m.getContext('2d'); if (bgc) mc.drawImage(bgc, 0, 0); mc.drawImage(ar.canvas, 0, 0); bgc = m;
    }
    bases.push(await buildBase(bmp, crop, W, H, outline, outlineGeom(g), outsideAlpha(), true, vstate.kind, bgc, rasters, ovr && ovr.canvas, arcOptFor(ys, i))); bmp.close();
    progress(0.2 + 0.1 * (i + 1) / urls.length, 'Preparing frames…');
  }
  if (lost) showNotice(`${lost} of ${all} map tiles could not be loaded: the background has gaps.`);
  const lo = Math.min(...ys), hi = Math.max(...ys), inRange = VOLUME_LOSS.filter(n => n.y >= lo && n.y <= hi);
  const info = { glacier: g, years: ys, tlYears: ys, scenes: ys.map(y => state.available[y]), outline: !!outline, xLegend: layerLegend(vstate.kind), xNew: hasNewOutline(vstate.kind), xCredit: layerCredits(vstate.kind, ys, rasters, bgSeenOf(bgr, ovr)), xCards: [...rasters.map(r => r.card), ...overlayCards(vstate.kind)].filter(Boolean), res: frameGroundRes(), style: state.style, styleB: sideStyle(1),
    lost: inRange.length ? Math.round((1 - inRange.reduce((q, n) => q * (1 - n.v / 100), 1)) * 100) : 0,
    site: (location.host + location.pathname).replace(/\/(index\.html)?$/, '') };
  return { g, bases, outline, info };
}
/* One set of water numbers for a glacier, used on the card, in the chapter and on the picture: one digit after the comma */
export const fmtPools = (n, long) => n >= 1e6 ? (n / 1e6).toFixed(1) + (long ? ' million' : ' M') : n >= 1e3 ? (n / 1e3).toFixed(1) + (long ? ' thousand' : ' k') : n.toFixed(1);
export function waterNumbers(km3){
  const litres = km3 * 0.9e12, pools = litres / POOL_L;
  return { km3, km3Text: km3.toFixed(1), litres, litresText: fmtN(litres, 1), pools, poolsText: fmtPools(pools, false), poolsLong: fmtPools(pools, true),
           lakes: km3 * 0.9 / LAKE_ZURICH_KM3, tap: km3 * 0.9 / SWISS_SUPPLY_KM3 };
}
/* ---- the still picture: title and glacier at the very top, year, facts and credit at the very bottom ---- */
export const SITE_NAME = 'tonguesfromspace.org';
export const stillName = g => (g.local || g.name).replace(/\s*\(.*?\)\s*/g, ' ').trim();       // the full local name, "Grosser Aletschgletscher", "Glacier de Corbassière"
/* ---- glacier facts: three flat tiles on pictures and videos, in sets (Ice, Retreat, Size). Only documented values; a tile whose data is missing is left out.
   In a video the tiles follow the year on screen; "since" counts from the first year of the video (a picture: from 2016). ---- */
export const factCache = {};            // glacier id -> { done, v: the ice volume of the glacier (Grab et al. 2021) or null, p: the promise }
export function loadFacts(g){
  let c = factCache[g.id];
  if (!c) {
    c = factCache[g.id] = { done: false, v: null };
    c.p = (g.rgi ? wire.loadBundle(wire.bundleId(g)).then(b => { if (b && b.change) IS_CHANGE[g.id] = b.change; return null; }) : glacierVolume(g)).catch(() => null).then(v => { c.v = v; c.done = true; if (!$('videoSheet').hidden) { if (viewMode === '3d') wire.update3DInfo(); else drawPreview(); } return c; });
  }
  return c.p || Promise.resolve(c);
}
export const factSetOn = () => $('vFacts').checked ? $('vFactSet').value : null;
export const poolsShort = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : n.toFixed(0);
export const metres = m => (m < 0 ? MINUS_SIGN : m > 0 ? '+' : '') + Math.abs(Math.round(m)).toLocaleString('en').replace(/,/g, ' ');
export const lengthSince = (g, from, to) => { const L = g.inv && g.inv.length; if (!L || !L.series) return null; const r = L.series.filter(s => s[0] >= from && s[1] <= to); return r.length ? r.reduce((t, s) => t + s[2], 0) : null; };
export function thinning(g){            // the ice thickness lost since the first GLAMOS elevation model of the glacier (the longest survey that ends with the newest one)
  const V = g.inv && g.inv.volume, okS = V && V.series ? V.series.filter(r => r[6] >= 90 && r[1] > r[0]) : [];
  if (!okS.length) return null;
  const endS = Math.max(...okS.map(r => r[1])), r = okS.filter(q => q[1] === endS).sort((a, b) => a[0] - b[0])[0];
  return r[3] < 0 ? { from: r[0], dh: r[3] } : null;
}
/* Ice-cap regions: documented values only. Retreat: the front since about 1890 where a source says it (Breiðamerkurjökull, Guðmundsson et al. 2017), the surface change since the first year where the
   terrain file has one (ArcticDEM strips), the area now against the oldest area the region's inventories hold. Size: the area now, the length and the highest point of the inventory. */
export function factTilesIs(g, year, set, base){
  const t = [], W3 = '#fff', ch = IS_CHANGE[g.id], ser = areaSeries(g), now = ser[ser.length - 1], then = ser.length > 1 ? ser[0] : null, info = typeof IC_INFO !== 'undefined' && IC_INFO[g.id];
  if (set === 'retreat') {
    if (info && info.front) t.push({ label: info.front.label, value: MINUS_SIGN + info.front.value, unit: info.front.unit, color: FACT_RED });
    if (ch && ch.byYear && ch.byYear[year] !== undefined && ch.byYear[base] !== undefined) { const d = ch.byYear[year] - ch.byYear[base]; t.push({ label: `SURFACE SINCE ${base}`, value: d === 0 ? '0' : (d < 0 ? MINUS_SIGN : '+') + Math.abs(d).toFixed(1), unit: 'm', color: d < 0 ? FACT_RED : W3 }); }
    if (then && ok(now.km2) && ok(then.km2) && then.km2 > 0) { const pc = Math.round(100 * (now.km2 - then.km2) / then.km2); t.push({ label: `AREA VS ${then.label.replace(/^about /, '~').toUpperCase()}`, value: (pc < 0 ? MINUS_SIGN : '+') + Math.abs(pc), unit: '%', color: pc < 0 ? FACT_RED : W3 }); }
  } else if (set === 'size') {
    if (now && ok(now.km2)) t.push({ label: `AREA ${now.label.replace(/^about /, '~').toUpperCase()}`, value: Math.round(now.km2).toLocaleString('en').replace(/,/g, ' '), unit: 'km²', color: FACT_BLUE });
    if (g.rgi.lengthKm) t.push({ label: `LENGTH · ${g.rgi.year > 0 ? '~' + g.rgi.year : ''}`.replace(/ · $/, ''), value: g.rgi.lengthKm.toFixed(1), unit: 'km', color: W3 });
    if (g.rgi.zmax) t.push({ label: 'HIGHEST POINT', value: Math.round(g.rgi.zmax).toLocaleString('en').replace(/,/g, ' '), unit: 'm a.s.l.', color: W3 });
  }
  return t;
}
export function factTiles(g, year, set, base){
  if (g.rgi) return factTilesIs(g, year, set, base);
  const c = factCache[g.id], v = c && c.v, inv = g.inv, t = [], later = year > base, W3 = '#fff';
  if (set === 'ice') {
    if (!v) return t;
    const ice = glacierIceAt(g, v, year), ice0 = glacierIceAt(g, v, base), lost = Math.max(0, ice0 - ice);
    t.push({ label: 'ICE · EST.', value: ice < 1 ? ice.toFixed(2) : ice < 10 ? ice.toFixed(1) : String(Math.round(ice)), unit: 'km³', color: FACT_BLUE });
    t.push({ label: `LOST SINCE ${base}`, value: later ? MINUS_SIGN + Math.round(100 * lost / ice0) : '0', unit: '%', color: later ? FACT_RED : W3 });
    t.push({ label: 'LOST AS WATER', value: later ? poolsShort(lost * 0.9e12 / POOL_L) : '0', unit: 'pools', color: W3 });
  } else if (set === 'retreat') {
    if (inv && lengthSince(g, base, 9999) !== null) {
      const len = later ? lengthSince(g, base, year) : 0;
      t.push({ label: `LENGTH SINCE ${base}`, value: len === null ? '–' : len === 0 ? '0' : metres(len), unit: len === null ? '' : 'm', color: len < 0 ? FACT_RED : W3 });
    }
    const a1850 = inv && inv.oldest && inv.oldest.area_km2, aRef = rankArea(g);
    if (ok(a1850) && ok(aRef) && a1850 > 0) t.push({ label: 'AREA VS 1850', value: MINUS_SIGN + Math.abs(Math.round(100 * (aRef - a1850) / a1850)), unit: '%', color: FACT_RED });
    const th = thinning(g);
    if (th) t.push({ label: `THINNING SINCE ${th.from}`, value: MINUS_SIGN + Math.round(Math.abs(th.dh)), unit: 'm', color: FACT_RED });
  } else if (set === 'size') {
    const aRef = rankArea(g), T = thickestSpot(g), max = T ? T.m : null;
    if (ok(aRef)) t.push({ label: `AREA ${inv ? (inv.year || rankLabel()) : 2016}`, value: aRef.toFixed(1), unit: 'km²', color: FACT_BLUE });
    if (ok(max)) t.push({ label: 'MAX. THICKNESS', value: String(Math.round(max)), unit: 'm', color: W3 });
    const tip = inv && inv.terminus && inv.terminus.tip_m;
    if (ok(tip)) t.push({ label: 'TONGUE TIP', value: Math.round(tip).toLocaleString('en').replace(/,/g, ' '), unit: 'm a.s.l.', color: W3 });
  }
  return t;
}
export const imageFile = () => !shareOnly && $('vImgFmt').value === 'png' ? { type: 'image/png', ext: 'png', q: undefined } : { type: 'image/jpeg', ext: 'jpg', q: 0.92 };      // the gallery takes JPEG only
export async function makeImage(){
  const ys = videoYears();
  if (!ys.length) return showNotice('No picture available for this year.');
  const F = VIDEO.formats[vstate.fmt], W = F.w, H = F.h, S = marginsFor('image', vstate.fmt);
  vstate.busy = true; $('vsGo').disabled = true;
  try {
    const cmpImg = imgCompare(), { g, bases, info } = await frameBases(ys, W, H);
    info.still = true; info.tlYears = [];
    if (cmpImg) { info.compare = true; info.horiz = horiz(); }
    else if (factSetOn()) {
      await loadFacts(g); info.factSet = factSetOn(); info.factBase = FIRST_YEAR;
      if (!factTiles(g, ys[0], info.factSet, FIRST_YEAR).length) showNotice('This glacier has no facts of this kind, so the picture is made without them.');
    }
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bases[0], 0, 0);
    if (cmpImg) {            // both years either side of the slider, where it stands on the map
      const split = frameSplit() * (info.horiz ? H : W);
      ctx.save(); ctx.beginPath(); if (info.horiz) ctx.rect(0, split, W, H - split); else ctx.rect(split, 0, W - split, H); ctx.clip(); ctx.drawImage(bases[1], 0, 0); ctx.restore();
      drawSwipeLabels(ctx, W, H, S, info, split);
    } else drawStill(ctx, W, H, info, S);               // a picture is not a Reel: text sits at the very top and bottom
    const IF = imageFile(), blob = await new Promise(res => canvas.toBlob(res, IF.type, IF.q));
    const name = `tonguesfromspace-${shortSlug(g.name)}-${ys.join('-')}${cmpImg ? '-slider' : ''}-${FMT_SUFFIX[vstate.fmt]}.${IF.ext}`;
    const file = new File([blob], name, { type: IF.type });
    progress(1, 'Image ready');
    lastExport = { file, sig: exportSignature(), meta: { type: 'still', years: ys, fmt: vstate.fmt, style: state.style, glacier: g.id, name: g.name } };
    if (shareOnly) { /* for the gallery: no download */ }
    else if (COARSE && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${g.name}, ${ys.join(' and ')}` }); }
      catch (e) { if (e.name !== 'AbortError') downloadFile(file); }
    } else downloadFile(file);
    if (!shareOnly) $('vsGo').textContent = 'Download again';
    offerShare();
  } catch (e) {
    console.error(e); showNotice('The image could not be made: ' + (e.message || e)); $('vsGo').textContent = 'Download image';
  } finally { vstate.busy = false; $('vsGo').disabled = false; }
}
export async function endInfo(g, info, lo, hi){            // the facts for the end card: what melted in the chosen period, all of Switzerland and this glacier (estimate) if its ice is known; false when there is no loss data for it
  const to = Math.min(hi, VOLUME_LOSS[VOLUME_LOSS.length - 1].y), melt = iceVolume(lo - 1) - iceVolume(to);      // the year of the first picture counts too (a glaciological year ends in September)
  if (!(to >= lo && melt > 0)) return false;
  const gv = await glacierVolume(g).catch(() => null), ice0 = gv ? glacierIceAt(g, gv, lo - 1) : 0, gMelt = gv ? ice0 - glacierIceAt(g, gv, to) : 0;
  info.end = { from: lo, to, swiss: { N: waterNumbers(melt), pct: info.lost },
    glacier: gv && gMelt > 0 && ice0 > 0 ? { N: waterNumbers(gMelt), pct: 100 * gMelt / ice0 } : null };
  return true;
}
export async function makeVideo(){
  const ys = videoYears();
  if (ys.length < 2) return showNotice(vstate.type === 'swipe' ? 'Pick two different years in Compare first.' : 'Pick a timelapse range of at least two years first.');
  const F = VIDEO.formats[vstate.fmt], W = F.w, H = F.h, S = marginsFor('video', vstate.fmt), fps = VIDEO.fps;
  const long = vstate.type === 'swipe' ? 0 : videoDuration(loopSeq(ys.length).length);      // a very long video gets a lower bitrate, so that it stays small enough for the gallery (15 MB)
  const cfg = await pickCodec(W, H, long > 40 ? Math.round(Math.max(2.5e6, 11e6 * 8 / long)) : 8e6);
  if (!cfg) return showNotice('This browser cannot create MP4 (H.264) videos. Try Chrome, Edge, or Safari on iPhone, iPad or Mac.');
  vstate.busy = true; $('vsGo').disabled = true;
  try {
    const { g, bases, info } = await frameBases(ys, W, H), lo = Math.min(...ys), hi = Math.max(...ys);
    info.compare = vstate.type === 'swipe'; info.horiz = info.compare && horiz();       // the slider runs the way it does on screen

    // 2. timeline
    const seq = loopSeq(ys.length), per = perSec(vstate.type === 'swipe' ? 0 : seq.length), fade = Math.min(VIDEO.fade, per * 0.45), k = per / 1.2;   // seq: the year shown at every step; k: speed factor for the swipe
    const useEnd = $('vEnd').value === 'facts' && await endInfo(g, info, lo, hi);
    const tailLen = useEnd ? endLen(vstate.fmt) : 0, factSet = vstate.type === 'swipe' ? null : factSetOn();
    if (factSet) { await loadFacts(g); info.factSet = factSet; info.factBase = lo; }
    const total = vstate.type === 'swipe'
      ? swipeLength(k) + tailLen
      : seq.length * per + VIDEO.hold + tailLen;
    const n = Math.round(total * fps);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const ease = easeIO;
    const renderSwipe = t => {
      info.hA = ease(t / 0.5);
      let u = t, from = 0.5, split = null;          // split: where the later year starts, along the width (vertical divider) or the height (horizontal); the full length = only the first year
      const along = info.horiz ? H : W;
      for (const [to, d] of SWIPE_KEYS) {
        const dur = d * k;
        if (u < dur) { split = along * (from + (to - from) * ease(u / dur)); break; }
        u -= dur; from = to;
      }
      if (split === null) {          // the fact card, built on the last picture: the last frame fades out under it
        const mid = along * 0.5;
        ctx.drawImage(bases[0], 0, 0);
        ctx.save(); ctx.beginPath(); if (info.horiz) ctx.rect(0, mid, W, H - mid); else ctx.rect(mid, 0, W - mid, H); ctx.clip(); ctx.drawImage(bases[1], 0, 0); ctx.restore();
        if (u < 0.4) { ctx.save(); ctx.globalAlpha = 1 - ease(u / 0.4); drawSwipeLabels(ctx, W, H, S, info, mid); ctx.restore(); }
        drawEndSlide(ctx, W, H, S, info, u); return;
      }
      ctx.drawImage(bases[0], 0, 0);
      ctx.save(); ctx.beginPath(); if (info.horiz) ctx.rect(0, split, W, H - split); else ctx.rect(split, 0, W - split, H); ctx.clip(); ctx.drawImage(bases[1], 0, 0); ctx.restore();
      drawSwipeLabels(ctx, W, H, S, info, split);
    };
    const render = vstate.type === 'swipe' ? renderSwipe : t => {
      ctx.globalAlpha = 1; info.hA = ease(t / 0.5);
      const last = ys.length - 1;
      if (t >= seq.length * per + VIDEO.hold) {                 // the fact card over the last year: the last frame fades out under it
        const u = t - seq.length * per - VIDEO.hold;
        ctx.drawImage(bases[last], 0, 0);
        if (u < 0.4) { ctx.save(); ctx.globalAlpha = 1 - ease(u / 0.4); drawLabels(ctx, W, H, S, info, last); ctx.restore(); }
        drawEndSlide(ctx, W, H, S, info, u); return;
      }
      const q = Math.min(seq.length - 1, Math.floor(t / per)), into = t - q * per, k = seq[q];
      ctx.drawImage(bases[k], 0, 0);
      if (q > 0 && into < fade) { ctx.globalAlpha = 1 - into / fade; ctx.drawImage(bases[seq[q - 1]], 0, 0); ctx.globalAlpha = 1; }
      drawLabels(ctx, W, H, S, info, k);
    };

    // 3. encode
    const chunks = []; let desc = null, encErr = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        if (!desc && meta && meta.decoderConfig && meta.decoderConfig.description) desc = new Uint8Array(meta.decoderConfig.description);
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        chunks.push({ data, key: chunk.type === 'key', pts: chunk.timestamp });
      },
      error: e => { encErr = e; }
    });
    enc.configure(cfg);
    for (let i = 0; i < n; i++) {
      if (encErr) throw encErr;
      render(i / fps);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
      while (enc.encodeQueueSize > 6) await new Promise(res => setTimeout(res, 4));
      if (i % 15 === 0) { progress(0.3 + 0.68 * i / n, `Creating video ${Math.round(100 * i / n)} %…`); await new Promise(res => setTimeout(res, 0)); }
    }
    await enc.flush(); enc.close();
    if (encErr) throw encErr;
    if (!desc) throw new Error('the encoder did not report its H.264 settings');

    // 4. MP4 file, then share (phones) or download
    const audio = vstate.type === 'swipe' ? null : await makeAudio(tickTimes(seq.length, per), n / fps);      // the year-change ticks of a timelapse; nothing for a slider
    const mp4 = muxMp4({ width: W, height: H, fps, avcC: desc, samples: chunks, audio });
    const name = `tonguesfromspace-${shortSlug(g.name)}-${vstate.type === 'swipe' ? 'slider' : 'timelapse'}-${ys[0]}-${ys[ys.length - 1]}-${FMT_SUFFIX[vstate.fmt]}.mp4`;
    const file = new File([mp4], name, { type: 'video/mp4' });
    progress(1, 'Video ready');
    lastExport = { file, sig: exportSignature(), meta: { type: vstate.type === 'swipe' ? 'slider' : 'timelapse', years: ys, fmt: vstate.fmt, style: state.style, glacier: g.id, name: g.name } };
    if (shareOnly) { /* for the gallery: no download */ }
    else if (COARSE && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${g.name}, ${ys[0]} to ${ys[ys.length - 1]}` }); }
      catch (e) { if (e.name !== 'AbortError') downloadFile(file); }
    } else downloadFile(file);
    window.__lastVideo = file;           // for testing
    if (!shareOnly) $('vsGo').textContent = 'Download again';
    offerShare();
  } catch (e) {
    console.error(e); showNotice('The video could not be made: ' + (e.message || e)); $('vsGo').textContent = 'Download video';
  } finally { vstate.busy = false; $('vsGo').disabled = false; }
}
export const shortSlug = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function downloadFile(file){
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$('vsGo').onclick = () => viewMode === '3d' ? wire.download3D(vstate.kind === 'image' ? 'image' : 'video') : vstate.kind === 'image' ? makeImage() : makeVideo();

/* ---- share the finished file in the public gallery (the Worker checks and holds it until it is approved) ---- */
export let lastExport = null;              // { file, meta: { type, years } } of the picture or video just made
export let galleryConfig = null, turnstileToken = '', turnstileId = null;
export const galleryInfo = () => galleryConfig || (galleryConfig = RELAY_BASE
  ? fetch(RELAY_BASE + '/gallery/config').then(r => r.ok ? r.json() : { open: false }).catch(() => ({ open: false })) : Promise.resolve({ open: false }));
export async function offerShare(){            // shown as soon as the download pane opens; the file is made when it is sent (or the one just made is used)
  const cfg = await galleryInfo();
  if (!cfg.open || $('videoSheet').hidden) return;
  if ($('vsShareBox').hidden) {
    $('vsShare').hidden = false; $('vsShare').setAttribute('aria-expanded', 'false'); $('vsShareForm').hidden = true; $('vsShareMsg').textContent = '';   // a fresh form when the box appears
    $('vsShareForm').querySelectorAll('input,button').forEach(e => e.disabled = false); $('vsConsent').checked = false;
    if (turnstileId !== null) { turnstile.reset(turnstileId); turnstileToken = ''; }
  }
  $('vsShareBox').hidden = false;
}
export let shareOnly = false;              // the file is made for the gallery only: no download
export const exportSignature = () => { try { return JSON.stringify([viewMode, state.glacier, state.mode, state.a, state.b, state.from, state.to, state.one, state.latest && state.latest.year, state.style, state.styleB, state.frame, vstate.kind, vstate.type, vstate.fmt, minimalOn(),
  [...document.querySelectorAll('#videoSheet input, #videoSheet select')].filter(e => !e.closest('#vsShareBox')).map(e => e.type === 'checkbox' ? +e.checked : e.value).join('|'),
  viewMode === '3d' ? [wire.v3d && wire.v3d.getCam(), wire.v3dSplit, wire.v3dCtx && wire.v3dCtx.current && wire.v3dCtx.current()] : [map.getCenter().lat.toFixed(5), map.getCenter().lng.toFixed(5), map.getZoom(), state.split],
  [...document.querySelectorAll('.layerbox input[type=checkbox]')].map(e => +e.checked).join(''), brightness(), outsideAlpha(), imgOpacity(), typeof frameRect === 'function' ? frameRect() : null]); } catch { return String(Math.random()); } };      // what the file shows: a file made earlier is reused only when nothing of this has changed
export async function makeForShare(){
  shareOnly = true;
  try { if (viewMode === '3d') await wire.download3D(vstate.kind === 'image' ? 'image' : 'video'); else if (vstate.kind === 'image') await makeImage(); else await makeVideo(); }
  finally { shareOnly = false; }
}
export function fitTurnstile(){            // the check is 300 px wide: scale it down to the width of the pane
  const el = $('vsTurnstile'), room = el.parentElement.clientWidth, k = room > 0 ? Math.min(1, room / 300) : 1;
  Object.assign(el.style, { width: '300px', height: Math.round(65 * k) + 'px', transform: k < 1 ? `scale(${k})` : '', transformOrigin: '0 0' });
}
addEventListener('resize', () => { if (turnstileId !== null) fitTurnstile(); });
export function loadTurnstile(){
  return window.turnstile ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('The person check could not be loaded.')); document.head.appendChild(s);
  });
}
$('vsShareClose').onclick = () => { $('vsShareForm').hidden = true; $('vsShare').setAttribute('aria-expanded', 'false'); };
$('vsShare').onclick = async () => {
  const form = $('vsShareForm'); form.hidden = !form.hidden; $('vsShare').setAttribute('aria-expanded', !form.hidden);
  if (form.hidden || turnstileId !== null) return;
  try {
    const cfg = await galleryInfo(); await loadTurnstile();
    turnstileId = turnstile.render('#vsTurnstile', { sitekey: cfg.siteKey, theme: 'light', callback: t => { turnstileToken = t; }, 'expired-callback': () => { turnstileToken = ''; } });
    fitTurnstile();
  } catch (e) { $('vsShareMsg').textContent = e.message; }
};
$('vsShareForm').onsubmit = async ev => {
  ev.preventDefault();
  const msg = t => { $('vsShareMsg').textContent = t; };
  if (!$('vsConsent').checked) return msg('Please tick the box to confirm.');
  if (!turnstileToken) return msg('Please complete the check above.');
  if (!lastExport || lastExport.sig !== exportSignature()) {            // nothing made yet, or the view changed since: make the file now, just for the gallery
    $('vsSend').disabled = true; msg(vstate.kind === 'image' ? 'Making the picture…' : 'Making the video, this takes a little while…'); lastExport = null;
    try { await makeForShare(); } catch (e) { console.error(e); }
    $('vsSend').disabled = false;
    if (!lastExport) return msg('The file could not be made. Please try again.');
    if (!turnstileToken) return msg('The check ran out while the file was made: please complete it again.');
  }
  const m = lastExport.meta, meta = { ...m, name: m.name.replace(/[^\p{L}\p{N} .'’-]/gu, '').slice(0, 40), nick: $('vsNick').value.trim() };
  const body = new FormData(); body.append('file', lastExport.file); body.append('meta', JSON.stringify(meta)); body.append('token', turnstileToken);
  $('vsSend').disabled = true; msg('Sending…');
  try {
    const r = await fetch(RELAY_BASE + '/gallery/submit', { method: 'POST', body }), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The upload failed (' + r.status + ').');
    msg('Thank you! It will appear in the gallery once it has been looked at.'); $('vsShare').hidden = true; $('vsShareForm').querySelectorAll('input,button').forEach(e => e.disabled = true);
    setTimeout(() => { $('vsShareBox').hidden = true; }, 2000);              // close the gallery part after the thanks has been read
  } catch (e) { msg(e.message); turnstile.reset(turnstileId); turnstileToken = ''; $('vsSend').disabled = false; }
};

/* ---- minimal MP4 packer: one H.264 video track, all metadata before the video data ---- */
export function muxMp4({ width, height, fps, avcC, samples, audio = null }){      // audio (optional): { sampleRate, channels, asc (AudioSpecificConfig), samples: [{ data }] } of AAC-LC, 1024 samples per sample
  const TS = fps * 1000, DUR = 1000;                       // timescale and ticks per frame
  const u8 = (...a) => Uint8Array.from(a), u16 = v => u8(v >> 8 & 255, v & 255);
  const u32 = v => u8(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
  const str = s => Uint8Array.from([...s].map(c => c.charCodeAt(0)));
  const cat = parts => { const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let i = 0; parts.forEach(p => { o.set(p, i); i += p.length; }); return o; };
  const box = (type, ...parts) => { const body = cat(parts); return cat([u32(body.length + 8), str(type), body]); };
  const full = (type, ver, flags, ...parts) => box(type, u8(ver, flags >> 16 & 255, flags >> 8 & 255, flags & 255), ...parts);
  const zeros = n => new Uint8Array(n);
  const matrix = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
  const n = samples.length, durTS = n * DUR, durMs = Math.round(n * 1000 / fps);
  // decode order = output order; composition offsets cover encoders that reorder frames
  const offsets = samples.map((s, i) => Math.round(s.pts * TS / 1e6) - i * DUR);
  const needCtts = offsets.some(o => o !== 0);
  const shift = needCtts ? -Math.min(0, ...offsets) : 0;
  const stbl = (chunkOffset) => box('stbl',
    full('stsd', 0, 0, u32(1), box('avc1', zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), box('avcC', avcC))),
    full('stts', 0, 0, u32(1), u32(n), u32(DUR)),
    ...(needCtts ? [full('ctts', 0, 0, u32(n), ...offsets.flatMap(o => [u32(1), u32(o + shift)]))] : []),
    full('stss', 0, 0, u32(samples.filter(s => s.key).length), ...samples.map((s, i) => s.key ? u32(i + 1) : null).filter(Boolean)),
    full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
    full('stsz', 0, 0, u32(0), u32(n), ...samples.map(s => u32(s.data.length))),
    full('stco', 0, 0, u32(1), u32(chunkOffset)));
  const audioTrak = aOff => {            // one AAC track (mp4a + esds), all samples in one chunk
    const A = audio, aN = A.samples.length, aDur = aN * 1024, esds = full('esds', 0, 0,
      u8(0x03, 23 + A.asc.length, 0, 0, 0), u8(0x04, 15 + A.asc.length, 0x40, 0x15, 0, 0, 0), u32(0), u32(0), u8(0x05, A.asc.length), A.asc, u8(0x06, 1, 2));
    return box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(2), u32(0), u32(Math.round(aDur * 1000 / A.sampleRate)), zeros(8), u16(0), u16(0), u16(0x0100), u16(0), matrix, u32(0), u32(0)),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(A.sampleRate), u32(aDur), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str('soun'), zeros(12), str('SoundHandler'), u8(0)),
        box('minf',
          full('smhd', 0, 0, zeros(4)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, u32(1), box('mp4a', zeros(6), u16(1), zeros(8), u16(A.channels), u16(16), u16(0), u16(0), u32(A.sampleRate * 65536), esds)),
            full('stts', 0, 0, u32(1), u32(aN), u32(1024)),
            full('stsc', 0, 0, u32(1), u32(1), u32(aN), u32(1)),
            full('stsz', 0, 0, u32(0), u32(aN), ...A.samples.map(x => u32(x.data.length))),
            full('stco', 0, 0, u32(1), u32(aOff))))));
  };
  const moov = (off, aOff) => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x00010000), u16(0x0100), zeros(10), matrix, zeros(24), u32(audio ? 3 : 2)),
    box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durMs), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width << 16), u32(height << 16)),
      ...(shift ? [box('edts', full('elst', 0, 0, u32(1), u32(durMs), u32(shift), u32(0x00010000)))] : []),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(durTS), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), u8(0)),
        box('minf',
          full('vmhd', 0, 1, zeros(8)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          stbl(off)))),
    ...(audio ? [audioTrak(aOff)] : []));
  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const moovLen = moov(0, 0).length;                       // offsets do not change the size
  const dataStart = ftyp.length + moovLen + 8;
  const videoBody = cat(samples.map(s => s.data)), mdatBody = audio ? cat([videoBody, ...audio.samples.map(x => x.data)]) : videoBody;
  return cat([ftyp, moov(dataStart, dataStart + videoBody.length), u32(mdatBody.length + 8), str('mdat'), mdatBody]);
}


/* The credits on the preview follow the layers: a switch changed while a download pane is open redraws the frame (outlines, radar, trails, aerial images change the source list) */
document.addEventListener('change', e => { if (!$('videoSheet').hidden && e.target.closest && e.target.closest('.layerbox, #v3dLayers')) setTimeout(updateFrame, 0); });
document.addEventListener('input', e => { if (!$('videoSheet').hidden && viewMode !== '3d' && /** @type {HTMLElement} */ (e.target).id === 'imgOpacity' || /** @type {HTMLElement} */ (e.target).id === 'mapOp') setTimeout(() => { if (!$('videoSheet').hidden && viewMode !== '3d') drawPreview(); }, 0); });      // the year and date leave the frame as the picture fades out
export function setLastExport(v){ return lastExport = v; }      // the other files may not assign to an imported variable
export function setBrandMotion(v){ return brandMotion = v; }      // the other files may not assign to an imported variable
export function setLogoAsked(v){ return logoAsked = v; }      // the other files may not assign to an imported variable

/* The line on the frame opens the Layers box (phones: the menu is closed while a pane is open, so it is opened here) */
const layerHome = new Map();      // box -> where it lives (parent, next sibling) while it is moved into the pane
const placeLayerBox = on => {      // a pane at the side: the Layers box opens inside the pane, under its last button (the pane scrolls); a pane at the bottom (phones) keeps the box where it is
  const st = $('stage').getBoundingClientRect(), sh = $('videoSheet'), sr = sh.getBoundingClientRect(), side = on && sr.width < st.width * 0.9 && sr.height > innerHeight * 0.9, mineBox = viewMode === '3d' ? $('v3dLayers') : $('layerbox');
  [$('layerbox'), $('v3dLayers')].forEach(b => {
    if (layerHome.has(b) && !(side && b === mineBox)) { const h = layerHome.get(b); h.parent.insertBefore(b, h.next); layerHome.delete(b); b.classList.remove('in-sheet'); }
    if (side && b === mineBox && !layerHome.has(b)) { layerHome.set(b, { parent: b.parentNode, next: b.nextSibling }); b.classList.add('in-sheet'); sh.appendChild(b); setTimeout(() => b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50); }
  });
};
$('vfLayers').onclick = () => {
  const on = document.body.classList.toggle('x-layers'), d3 = viewMode === '3d', b = d3 ? $('v3dLayers') : $('layerbox'); setLayers(on); placeLayerBox(on);
  if (d3) b.classList.toggle('open', on);      // (the phone's own menu button opens the 3D box through setLayers)
  if (on && b.classList.contains('min') && !b.classList.contains('in-flow')) (d3 ? $('v3dLbToggle') : $('lbToggle')).click();      // (the phone's panel has no minimised state: its toggle would close it again)
};
