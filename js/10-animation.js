/* =====================================================================
   11. Create animation (video for Instagram, TikTok and others)
       Frames are drawn on a canvas from the images already loaded, encoded to H.264 with the
       browser's WebCodecs encoder and packed into an MP4 (small packer below, no library).
   ===================================================================== */
const VIDEO = {
  fps: 30,
  formats: {   // safe zones keep text clear of the apps' own buttons and captions
    reel: { w:1080, h:1920, safe:{ top:270, bottom:670, left:65, right:140 } },   // Meta: keep clear of the top 14 %, bottom 35 %, sides 6 % (and the button rail at the bottom right)
    feed: { w:1080, h:1350, safe:{ top:84,  bottom:96,  left:72, right:72 } },
    wide: { w:1920, h:1080, safe:{ top:56,  bottom:56,  left:90, right:90 } }       // 16:9: text high and low, the image stays free
  },
  fade: 0.4, hold: 0.8,          // no title slide (the header fades in over the first picture); the fact card closes a video (endLen)
  codecs: ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']   // H.264 High, Main, Baseline (level 4.0)
};
/* Where text may sit. Animations in 9:16 follow Instagram Reels and TikTok (clear of the app's buttons and captions); every picture, and 16:9 and 4:5,
   keep the text at the very top and bottom. */
const STILL_MARGINS = { reel: { top: 74, bottom: 66, left: 64, right: 64 }, feed: { top: 74, bottom: 66, left: 64, right: 64 }, wide: { top: 56, bottom: 56, left: 90, right: 90 } };
const marginsFor = (kind, fmt) => kind === 'image' || (fmt === 'reel' && !$('vSafe').checked) ? STILL_MARGINS[fmt] : VIDEO.formats[fmt].safe;      // 9:16 video: text clear of the apps' buttons, or (box unticked) plain, at the very top and bottom
const FMT_SUFFIX = { reel: '9x16', feed: '4x5', wide: '16x9' };
const vstate = { fmt: 'wide', type: 'timelapse', kind: 'video', busy: false };      // kind: 'video' (animation) or 'image' (one picture)
/* swipe: [position, seconds]. Position = where the later year starts: 1 = only the first year, 0 = only the later one.
   It starts in the middle, goes back and forth twice and settles in the middle again. A move eases from the previous position. */
const SWIPE_KEYS = [[0.5, 0.8], [1, 1.2], [1, 0.5], [0, 1.7], [0, 0.7], [1, 1.5], [1, 0.4], [0, 1.5], [0, 0.7], [0.5, 1.2], [0.5, 1.4]];
const swipeLength = k => SWIPE_KEYS.reduce((a, [, d]) => a + d * k, 0);
/* the picture shows the year on screen: One year, the frame of the Timelapse, or the right-hand year of Compare */
const stillYear = () => state.mode === 'single' ? state.one : state.mode === 'timelapse' && tlLayers[state.frame] ? tlLayers[state.frame].yr : state.b;
const imgCompare = () => vstate.kind === 'image' && viewMode !== '3d' && state.mode === 'compare' && state.a !== state.b && !!state.available[state.a] && !!state.available[state.b];      // a picture of Compare: both years either side of the slider
const videoYears = () => vstate.kind === 'image' ? (imgCompare() ? [state.a, state.b] : [stillYear()].filter(y => state.available[y]))
  : vstate.type === 'swipe' ? [state.a, state.b].filter(y => state.available[y]).filter((y, i, a) => a.indexOf(y) === i)
  : tlFrames();
const FONT = '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif';

/* ---- framing on the map ---- */
let sheetOverlap = 0;                 // how far the panel covers the bottom of the map (phones): the frame stays above it
function measureSheetOverlap(){
  const sh = $('videoSheet');
  if (sh.hidden) return 0;
  const st = $('stage').getBoundingClientRect(), sr = sh.getBoundingClientRect();
  const across = Math.min(st.right, sr.right) - Math.max(st.left, sr.left);
  return across > 40 ? Math.max(0, st.bottom - sr.top) : 0;
}
const stageSize = () => viewMode === '3d' && $('v3dCanvas').clientWidth ? {x: $('v3dCanvas').clientWidth, y: $('v3dCanvas').clientHeight} : map.getSize();
function visibleBox(){            // the part of the picture area the visitor can see, in its own pixels: cut to the browser window, and clear of the download pane where that stands at the side
  const size = stageSize(), el = viewMode === '3d' && $('v3dCanvas').clientWidth ? $('v3dCanvas') : $('stage'), r = el.getBoundingClientRect();
  let side = false, x0 = Math.max(0, -r.left), x1 = Math.min(size.x, innerWidth - r.left), y0 = Math.max(0, -r.top), y1 = Math.min(size.y, innerHeight - r.top);
  const sh = $('videoSheet'); if (!sh.hidden) { const s = sh.getBoundingClientRect(); if (s.right > r.left + 8 && s.right < r.left + size.x * 0.4 && s.top < r.bottom - 120) x0 = Math.max(x0, s.right - r.left + 12), side = true; }      // the pane covers the left of the picture area: the frame starts to the right of it
  return {side, x0, x1: Math.max(x0 + 100, x1), y0, y1: Math.max(y0 + 100, y1)};
}
function frameRect(){
  const F = VIDEO.formats[vstate.fmt], vb = visibleBox(), m = 20, top = 44 + vb.y0, bottom = Math.max(70, vb.side ? 0 : sheetOverlap + 12, stageSize().y - vb.y1 + 62);      // a pane at the side is cleared sideways, one below the picture from below
  const availW = vb.x1 - vb.x0 - 2 * m, availH = stageSize().y - top - m - bottom;
  let h = availH, w = h * F.w / F.h;
  if (w > availW) { w = availW; h = w * F.h / F.w; }
  return { x: vb.x0 + m + (availW - w) / 2, y: top + (availH - h) / 2, w, h };
}
function frameSplit(){            // where the slider sits inside the frame (0 to 1, along the slider's direction)
  const r = frameRect(), size = map.getSize();
  return Math.min(1, Math.max(0, horiz() ? (size.y * state.split - r.y) / r.h : (size.x * state.split - r.x) / r.w));
}
function frameGroundRes(){            // metres of terrain per video pixel
  const r = frameRect(), F = VIDEO.formats[vstate.fmt];
  const a = map.containerPointToLatLng([r.x, r.y + r.h / 2]), b = map.containerPointToLatLng([r.x + r.w, r.y + r.h / 2]);
  return map.distance(a, b) / F.w;
}
/* The text on the map frame: drawn with the same functions as the finished picture or video (timelapse, slider or single picture), over the live map.
   The end card is left out. */
let logoAsked = false;
function drawPreview(){
  if (viewMode === '3d') return drawPreview3D();
  if (!logoImg && !logoAsked) { logoAsked = true; loadLogo().then(() => drawPreview()); }      // the logo is part of every picture: the preview shows it as soon as it is decoded
  const cv = $('vfPreview'), F = VIDEO.formats[vstate.fmt], W = F.w, H = F.h, q = 0.5, ys = videoYears();
  cv.width = Math.round(W * q); cv.height = Math.round(H * q);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!ys.length) return;
  const g = currentGlacier(), S = marginsFor(vstate.kind, vstate.fmt), swipe = vstate.kind === 'image' ? imgCompare() : vstate.type === 'swipe', image = vstate.kind === 'image';
  const info = { glacier: g, years: ys, scenes: ys.map(y => state.available[y]), outline: !!($('vOutline').checked && hasOldOutline(g)), res: frameGroundRes(), style: state.style, compare: swipe, horiz: swipe && horiz(), noDivider: image,      // a picture: the slider of the map itself stays visible and can be moved
    tlYears: image ? [] : ys };      // a single picture has no timeline bar
  if (!swipe && $('vFacts').checked) { loadFacts(g); info.factSet = $('vFactSet').value; info.factBase = image ? FIRST_YEAR : ys[0]; }
  ctx.save(); ctx.scale(q, q);
  if (image && !swipe) drawStill(ctx, W, H, info, S);
  else if (swipe) drawSwipeLabels(ctx, W, H, S, info, image || vPrev.on ? frameSplit() * (info.horiz ? H : W) : (info.horiz ? H : W) / 2);
  else drawLabels(ctx, W, H, S, info, vPrev.on && state.mode === 'timelapse' && tlLayers[state.frame] && ys.includes(tlLayers[state.frame].yr) ? ys.indexOf(tlLayers[state.frame].yr) : Math.floor((ys.length - 1) / 2));
  ctx.restore();
}
/* A preview of the animation in the frame: the timelapse plays on the map (the labels follow its frame), the slider sweeps across; everything outside the frame is darker meanwhile. Stops with the pane, a new format or a click. */
const vPrev = {on: false, raf: 0};
const PV_ICON = {play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>'};
function stopPreview(){
  if (!vPrev.on) return; vPrev.on = false; cancelAnimationFrame(vPrev.raf);
  if (state.playing) stopPlay();
  if (viewMode === '3d' && v3d && vPrev.cam0) { v3d.setCam(vPrev.cam0); vPrev.cam = null; if (v3dCtx && v3dCtx.cmp) setSplit3D(vPrev.split0); else if (vPrev.year0 && v3dCtx && v3dCtx.follow) v3dCtx.follow(vPrev.year0); drawPreview3D(); }      // the view, the line and the year come back
  $('videoFrame').classList.remove('playing'); $('vfPlay').innerHTML = PV_ICON.play; $('vfPlay').setAttribute('aria-label', 'Play a preview');
  if (vstate.kind !== 'image' && vstate.type === 'swipe') { clip(); drawPreview(); }
}
function startPreview3D(){            // the camera swings as in the video, the years change (timelapse) or the line moves (slider); everything is put back when it stops
  const c = v3dCtx, viewer = v3d; if (!c || !viewer) return;
  vPrev.applied = null; vPrev.off = {az: 0, el: 0, k: 1}; vPrev.cam0 = viewer.getCam(); vPrev.year0 = c.cmp ? null : c.current(); vPrev.split0 = v3dSplit; vPrev.cam = vPrev.cam0;
  const t0 = performance.now(), swing = $('vSwing') && $('vSwing').checked, ys = !c.cmp && c.years && c.years.length > 1 ? c.years : null;
  const tick = now => {
    if (!vPrev.on) return; const t = (now - t0) / 1000, u = (t / 7) % 1, sw = Math.sin(2 * Math.PI * u), bob = (1 - Math.cos(2 * Math.PI * u)) / 2;
    const cur = viewer.getCam(), ap = vPrev.applied;
    if (ap && (Math.abs(cur.az - ap.az) > 1e-4 || Math.abs(cur.el - ap.el) > 1e-4 || Math.abs(cur.dist - ap.dist) > 1e-4 * ap.dist)) {      // the visitor turned, tilted or zoomed: the swing goes on around the new view, which is also what comes back when the preview stops
      const o = vPrev.off; vPrev.cam0 = {...vPrev.cam0, az: cur.az - o.az, el: cur.el - o.el, dist: cur.dist / o.k};
    }
    const cam0 = vPrev.cam0, off = swing ? {az: 0.5 * sw, el: 0.07 * bob, k: 1 - 0.1 * bob} : {az: 0, el: 0, k: 1};
    vPrev.off = off; vPrev.cam = {az: cam0.az + off.az, el: cam0.el + off.el, dist: cam0.dist * off.k}; viewer.setCam(vPrev.cam); vPrev.applied = viewer.getCam();
    if (c.cmp) setSplit3D(0.5 + 0.4 * Math.sin(2 * Math.PI * t / 6));
    else if (ys && c.follow) { const y = ys[Math.floor(t / 1.2) % ys.length]; if (y !== c.current()) c.follow(y); }
    drawPreview3D(); vPrev.raf = requestAnimationFrame(tick);
  };
  vPrev.raf = requestAnimationFrame(tick);
}
function startPreview(){
  if (vstate.kind === 'image' || vPrev.on) return;
  if (viewMode === '3d') { vPrev.on = true; $('videoFrame').classList.add('playing'); $('vfPlay').innerHTML = PV_ICON.stop; $('vfPlay').setAttribute('aria-label', 'Stop the preview'); return startPreview3D(); }
  vPrev.on = true; $('videoFrame').classList.add('playing'); $('vfPlay').innerHTML = PV_ICON.stop; $('vfPlay').setAttribute('aria-label', 'Stop the preview');
  if (vstate.type === 'swipe') {            // the slider goes to and fro across the frame
    const t0 = performance.now(), r = frameRect(), a = horiz() ? (r.y + 0.05 * r.h) / map.getSize().y : (r.x + 0.05 * r.w) / map.getSize().x, b = horiz() ? (r.y + 0.95 * r.h) / map.getSize().y : (r.x + 0.95 * r.w) / map.getSize().x;
    const tick = now => { if (!vPrev.on) return; const u = ((now - t0) / (2600 * Math.max(0.3, perSec(0) / 1.2))) % 2, e = u < 1 ? u : 2 - u, s = e * e * (3 - 2 * e); state.split = a + (b - a) * s; clip(); drawPreview(); vPrev.raf = requestAnimationFrame(tick); };
    vPrev.raf = requestAnimationFrame(tick);
  } else { document.getElementById('loopToggle').checked = true; if (!state.playing) play(); }      // the map's timelapse plays; showFrame redraws the labels at every frame
}
$('vfPlay').onclick = () => vPrev.on ? stopPreview() : startPreview();
function guideText(){
  const video = vstate.kind !== 'image';
  $('vSafeRow').hidden = !(video && vstate.fmt === 'reel');      // the Reels / TikTok choice only exists for a 9:16 video
  if (vstate.fmt === 'reel') return video && $('vSafe').checked ? 'Text stays clear of the Reels and TikTok buttons and captions.'
                                          : 'Text sits at the top and bottom edge, so the picture stays free.';
  if (vstate.fmt === 'feed') return 'Text sits at the top and bottom.';
  return 'Text sits high and low, so the image stays free.';
}
function placeFrame(){
  sheetOverlap = measureSheetOverlap();               // the info line can change the panel height
  const r = frameRect();
  Object.assign($('videoFrame').style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
/* While a download pane is open the map may not be zoomed out far, or moved far: the frame has to stay around the satellite picture of the glacier (a bit of space around it is fine) */
let zoomLimitKey = '';
function limitFrameView(){
  const on = !$('videoSheet').hidden && viewMode !== '3d';
  if (!on) { if (zoomLimitKey) { zoomLimitKey = ''; map.setMinZoom(8); map.setMaxBounds(null); } return; }
  const g = currentGlacier(), r = frameRect(), fp = imageFootprint(g).bounds, key = g.id + '|' + Math.round(r.w) + 'x' + Math.round(r.h);
  if (key === zoomLimitKey) return; zoomLimitKey = key;
  const a = map.project([fp[1][0], fp[0][1]], 0), c = map.project([fp[0][0], fp[1][1]], 0);
  const zIn = Math.log2(Math.max(r.w / (c.x - a.x), r.h / (c.y - a.y)));            // the zoom at which the frame just fits the picture
  map.setMinZoom(Math.max(8, Math.floor((zIn - 0.7) * 4) / 4));                       // the frame may reach about 1.6 times beyond the picture, no more
  map.options.maxBoundsViscosity = 1; map.setMaxBounds(L.latLngBounds(fp).pad(0.6));
}
/* Frame areas: the frame on the map fitted to the tongue or to the whole glacier */
/* "Tongue" and "Whole glacier" light up when pressed and go out again as soon as the frame is changed: another ratio, or moving or zooming the map */
let areaSel = null;
function syncAreaButtons(){
  $('vaTongue').setAttribute('aria-pressed', !!areaSel && areaSel.which === 'tongue');
  $('vaWhole').setAttribute('aria-pressed', !!areaSel && areaSel.which === 'whole');
}
function markArea(which){ areaSel = which ? {which, z: map.getZoom(), c: map.getCenter(), fmt: vstate.fmt} : null; syncAreaButtons(); }
function checkAreaSel(){
  if (!areaSel) return;
  if (areaSel.fmt !== vstate.fmt || Math.abs(map.getZoom() - areaSel.z) > 0.01 || map.latLngToContainerPoint(areaSel.c).distanceTo(map.getSize().divideBy(2)) > 3) markArea(null);
}
function frameTo(whole){
  const g = currentGlacier(), r = frameRect(), size = map.getSize();
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
function frameExceedsImage(){            // the frame reaches beyond the satellite picture of the glacier
  const g = currentGlacier(), r = frameRect(), fp = imageFootprint(g).bounds, ll = p => map.containerPointToLatLng(p);
  const nw = ll([r.x, r.y]), se = ll([r.x + r.w, r.y + r.h]);
  return nw.lat > fp[1][0] || se.lat < fp[0][0] || nw.lng < fp[0][1] || se.lng > fp[1][1];
}
$('vaTongue').onclick = () => frameTo(false);
$('vaWhole').onclick = () => frameTo(true);
function updateFrame(){
  if ($('videoSheet').hidden) return;
  if (viewMode === '3d') return update3DInfo();
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
  placeFrame(); $('vfPlay').style.display = vstate.kind === 'image' ? 'none' : '';      // the preview is for animations
  $('vsGuide').textContent = guideText();
  drawPreview();
  $('vFactsRow').style.display = !FEATURES.facts || (vstate.kind === 'image' ? imgCompare() : vstate.type === 'swipe') ? 'none' : '';      // the facts belong to a single year
  $('app').classList.toggle('is-cmp-image', imgCompare());
}
const endLen = fmt => fmt === 'wide' ? 5 : 3.5;            // seconds of the fact card at the end of a video
const tailLength = () => $('vEnd').value === 'facts' ? endLen(vstate.fmt) : 0;
function perSec(n){            // seconds per year: the chosen speed, or the one that fits the video into 15 s (Reels, TikTok)
  return 1 / +SPEED_FPS[+$('vSpeed').value];      // the speed setter of the panel: frames (years) per second, so one year lasts 1 / fps seconds
}
/* The order of the years in a timelapse of n years: once, or several loops. Between two loops it can run back through the years (the turning years are not shown twice). */
function loopSeq(n){
  const loops = Math.max(1, +$('vLoops').value || 1), bounce = $('vBounce').checked && loops > 1, fwd = [...Array(n).keys()], back = [...fwd].reverse(), seq = [...fwd];
  for (let l = 1; l < loops; l++) { if (bounce) seq.push(...back.slice(1), ...fwd.slice(1)); else seq.push(...fwd); }
  return seq;
}
const videoDuration = n => (vstate.type === 'swipe'
  ? swipeLength(perSec(0) / 1.2) + tailLength()
  : n * perSec(n) + VIDEO.hold + tailLength());
map.on('move zoom resize', updateFrame);
/* Phones: opening a pane scrolls the visual into view after the frame was placed, and the page can be scrolled while it is open: the frame follows what is visible */
let frameScrollRaf = 0;
addEventListener('scroll', () => { if ($('videoSheet').hidden || frameScrollRaf) return; frameScrollRaf = requestAnimationFrame(() => { frameScrollRaf = 0; updateFrame(); }); }, {passive: true});
Promise.all(['700 24px', '800 120px', '600 28px', '500 20px'].map(f => document.fonts.load(`${f} "Schibsted Grotesk"`).catch(() => {}))).then(updateFrame);   // the preview uses the real font

function openVideo(kind = 'video', stay = false){            // stay: the pane changes where it is, the page does not scroll
  if (kind === 'video' && typeof VideoEncoder === 'undefined') {
    return showNotice('Making videos needs a recent browser: Chrome, Edge, Firefox, or Safari on iPhone, iPad or Mac (iOS 16.4 or newer).');
  }
  stopPreview();      // switching between image and animation ends a running preview
  vstate.kind = kind; $('vfPlay').style.display = kind === 'image' ? 'none' : '';
  document.body.classList.add('pane-open'); setLayers(false); if (typeof cancelMeasure === 'function') cancelMeasure(); map.removeLayer(M.group);      // no layer menu (it would open out of sight, behind the pane) and no measurements: neither is part of a download
  const image = kind === 'image', in3D = viewMode === '3d';
  $('videoSheet').classList.toggle('is-image', image); $('videoSheet').classList.toggle('is-3d', in3D);
  $('vkImage').setAttribute('aria-pressed', image); $('vkVideo').setAttribute('aria-pressed', !image);
  $('vsTitle').textContent = 'Create and share';      // the same name as step 3 in the left panel
  document.querySelector('.vs-move').textContent = in3D ? 'Turn, tilt and zoom until the tongue fits the frame.' : 'Or move and zoom the map yourself, until the frame shows what you want.';
  if (in3D) {            // the frame shows what the picture will contain: the 3D view as it is
    if (typeof leavePhoto === 'function') leavePhoto(true);      // a download shows the orbiting camera, not the view of a historic photograph
    $('videoSheet').hidden = false; $('videoFrame').hidden = false;
    $('vsProgress').hidden = true; $('vsGo').disabled = false; $('vsGo').textContent = image ? 'Download image' : 'Download video';
    lastExport = null; $('vsShareBox').hidden = true; $('vsShareForm').hidden = true; offerShare();
    if (image && state.mode === 'timelapse') { const y = stillYear(); if (state.available[y]) state.one = y; $('modeSingle').click(); }      // a picture is of one year: the panel goes to One year, at the year on screen, as in Map view
    const g3 = currentGlacier(), has3 = hasOldOutline(g3); $('vOutline').disabled = !has3;      // a download shows the 1850 outline when the glacier has one
    if (!stay && $('oldToggle').checked) { $('oldToggle').checked = false; drawOutlines(); sync3DMenu(); refresh3D(); }      // the 1850 outline starts off in a download pane (tick it to add it)
    $('vOutline').checked = has3 && $('oldToggle').checked;
    bringVisualIntoView(stay);
    return update3DInfo();
  }
  setType(!image && state.mode === 'compare' ? 'swipe' : 'timelapse');
  stopPlay();
  const g = currentGlacier(), hasOld = hasOldOutline(g);
  if (!stay && $('oldToggle').checked) { $('oldToggle').checked = false; drawOutlines(); }      // the 1850 outline starts off in a download pane (tick it to add it)
  $('vOutline').disabled = !hasOld; $('vOutline').checked = hasOld && $('oldToggle').checked;   // the same switch as the layer on the map
  $('videoSheet').hidden = false; $('videoFrame').hidden = false;
  $('app').classList.add('is-framing');
  $('vsProgress').hidden = true; $('vsGo').disabled = false; $('vsGo').textContent = image ? 'Download image' : 'Download video';
  lastExport = null; $('vsShareBox').hidden = true; $('vsShareForm').hidden = true; offerShare();
  syncBackgrounds();
  updateFrame();
  bringVisualIntoView(stay);
}
function bringVisualIntoView(stay){            // phones: the visual has to be on screen when a download pane opens (the small window gives way to it), in the map and in 3D
  if (stay || !matchMedia('(max-width:720px)').matches) return;
  if ($('stage').classList.contains('is-full')) setFull(false);
  setMini(false);
  $('stageSlot').scrollIntoView({behavior:'smooth', block:'start'});
}
function closeVideo(){
  if (vstate.busy) return; stopPreview();
  document.body.classList.remove('pane-open'); M.group.addTo(map);
  $('videoSheet').hidden = true; $('videoFrame').hidden = true; $('app').classList.remove('is-framing'); sheetOverlap = 0; limitFrameView(); markArea(null);
  syncBackgrounds(); setTimeout(evalMini, 400);      // after the page has settled, the small window returns if the visual is out of view
}
$('vkImage').onclick = () => { if (!vstate.busy && !v3dBusy) openVideo('image'); }; $('vkVideo').onclick = () => { if (!vstate.busy && !v3dBusy) openVideo('video'); };      // switch between the two panes without closing
$('videoBtn').onclick = () => openVideo('video'); $('imageBtn').onclick = () => openVideo('image'); $('vsClose').onclick = () => { closeVideo(); if (PHONE.matches) setTimeout(() => $('shareGroup').scrollIntoView({behavior: 'smooth', block: 'center'}), 60); };      // phones: back to the Create and share step, not to the top
const FMT_BTN = { reel: 'vfReel', feed: 'vfFeed', wide: 'vfWide' };
const setFmt = f => {
  stopPreview();
  if (viewMode !== '3d' && !$('videoSheet').hidden) checkAreaSel();
  const keep = viewMode !== '3d' && areaSel ? areaSel.which : null;      // Tongue or Whole glacier was pressed and the map not moved since: fit it again to the new frame
  vstate.fmt = f; Object.entries(FMT_BTN).forEach(([k, id]) => $(id).setAttribute('aria-pressed', k === f));
  updateFrame();
  if (keep) { frameTo(keep === 'whole'); updateFrame(); }
};
Object.entries(FMT_BTN).forEach(([k, id]) => $(id).onclick = () => setFmt(k));
/* the speed setter of the animation pane and the one under Compare / Timelapse are one setting */
function syncSpeed(from){ const v = +$(from).value; ['speedSel', 'vSpeed'].forEach(id => { $(id).value = v; }); updateSpeedIcon(); const o = $('vSpeedOut'); if (o) o.textContent = `${SPEED_FPS[v]} fps`; const nd = $('vSpeedNeedle'); if (nd) nd.setAttribute('transform', `rotate(${-60 + v * 30} 12 18)`); }
$('vSpeed').oninput = () => { syncSpeed('vSpeed'); updateFrame(); };
$('speedSel').addEventListener('input', () => { syncSpeed('speedSel'); if (!$('videoSheet').hidden) updateFrame(); });
syncSpeed('speedSel');
$('vSafe').onchange = updateFrame;
$('vEnd').onchange = updateFrame; $('vFacts').onchange = $('vFactSet').onchange = updateFrame;
const syncLoops = () => { $('vBounce').disabled = +$('vLoops').value < 2; updateFrame(); };
$('vLoops').onchange = syncLoops; $('vBounce').onchange = updateFrame; syncLoops();
$('vSwing').onchange = () => { if (viewMode === '3d') update3DInfo(); };
$('vOutline').onchange = () => { $('oldToggle').checked = $('vOutline').checked; drawOutlines(); if (viewMode === '3d') { sync3DMenu(); refresh3D(); } };   // show the 1850 outline on the map as well
/* The map behind the pane shows what the pane will make: Timelapse, Compare (the slider) or One year (a single image) */
function syncModeToPane(){
  const want = vstate.kind === 'image' ? (state.mode === 'compare' ? 'modeCompare' : 'modeSingle') : vstate.type === 'swipe' ? 'modeCompare' : 'modeTimelapse';
  if (!$(want).getAttribute('aria-pressed') || $(want).getAttribute('aria-pressed') === 'false') $(want).click();
}
function setType(t){ vstate.type = t; $('videoSheet').classList.toggle('is-swipe', t === 'swipe'); syncModeToPane(); updateFrame(); }

function progress(frac, label){
  $('vsProgress').hidden = false; $('vsBar').style.width = Math.round(frac * 100) + '%';
  $('vsGo').textContent = label;
}

/* ---- drawing ---- */
function niceScale(maxMetres){
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  return steps.filter(s => s <= maxMetres).pop() || 100;
}
function fitText(ctx, text, weight, size, maxW){
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > 18);
  return s;
}
function shadowText(ctx, text, x, y, opts = {}){
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = opts.blur ?? 14; ctx.shadowOffsetY = 2;
  ctx.fillStyle = opts.color || '#fff'; ctx.textAlign = opts.align || 'left'; ctx.fillText(text, x, y);
  ctx.restore();
}
/* One base picture per year: crop from the Copernicus image, brightness curve, optional 1850 outline */
async function buildBase(img, crop, W, H, outline, maskGeom = null, o = 1){
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(spaceCanvas(W, H, 8000, W / 1080 * 1.2), 0, 0);
  const fp = crop.fp, s = W / (crop.x1 - crop.x0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
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
  if (outline) {
    ctx.save();
    ctx.lineWidth = 5; ctx.strokeStyle = '#F2A93B'; ctx.setLineDash([22, 14]); ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
    eachPiece(outline, (ring, closed) => {
      ctx.beginPath(); ring.forEach((pt, i) => { const [x, y] = P(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (closed) ctx.closePath(); ctx.stroke();
    });
    ctx.restore();
  }
  return c;
}
/* Short dark gradients keep the text readable on bright ice and snow, instead of boxes: one at the top, one behind the bottom block (text, facts, year). */
function shade(ctx, W, H, S, blockH = 420){
  let g = ctx.createLinearGradient(0, 0, 0, S.top + 340);
  g.addColorStop(0, 'rgba(8,14,18,.58)'); g.addColorStop(.6, 'rgba(8,14,18,.24)'); g.addColorStop(1, 'rgba(8,14,18,0)');      // the one soft gradient behind the header, as on screen
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, S.top + 340);
  const base = H - S.bottom, top = Math.max(0, base - blockH), t1 = Math.min(1, (base + 50 - top) / (H - top));
  g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, 'rgba(8,14,18,0)'); g.addColorStop(t1, 'rgba(8,14,18,.58)'); g.addColorStop(1, 'rgba(8,14,18,.7)');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
}
/* The white logo in front of the label "TONGUES FROM SPACE" on pictures and videos; loaded once, drawn as a picture (not text) */
const LOGO_URL = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 200 190%27%3E%3Cdefs%3E%3Cmask id=%27mouthcut%27 maskUnits=%27userSpaceOnUse%27 x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27%3E%3Crect x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27 fill=%27%23fff%27/%3E%3Cellipse cx=%27100%27 cy=%2788%27 rx=%2748%27 ry=%2724%27 fill=%27%23000%27/%3E%3C/mask%3E%3Cmask id=%27groovecut%27 maskUnits=%27userSpaceOnUse%27 x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27%3E%3Crect x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27 fill=%27%23fff%27/%3E%3Cpath d=%27M92 90 C112 108 126 136 126 166%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%274%27 stroke-linecap=%27round%27/%3E%3C/mask%3E%3C/defs%3E%3Cg fill=%27%23FFFFFF%27%3E%3Cpath d=%27M4 100 L62 20 L90 56 L102 44 L120 60 L144 44 L188 100 Z%27 mask=%27url%28%23mouthcut%29%27/%3E%3Cpath d=%27M74 86 C92 104 82 136 82 158 A44 24 0 0 0 170 158 C170 134 134 108 110 86 Q92 78 74 86 Z%27 mask=%27url%28%23groovecut%29%27/%3E%3Cpath d=%27M172 8 Q173 21 186 22 Q173 23 172 36 Q171 23 158 22 Q171 21 172 8 Z%27/%3E%3C/g%3E%3C/svg%3E';   // embedded: the logo folder is not published
let logoImg = null;
async function loadLogo(){
  if (logoImg) return;
  try { const im = new Image(); im.src = LOGO_URL; await im.decode(); logoImg = im; } catch {}
}
const FACT_BLUE = '#8FDDF3', FACT_RED = '#FF7A6E', MINUS_SIGN = '−';
const easeIO = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
const placeOf = (g, ...first) => [...first, g.canton, g.range].filter(Boolean).join(' · ');
/* The credit line on pictures and videos: short, the full list of sources is in About on the site */
const shortCredit = (years, extras = []) => {
  const ys = String(years).match(/\d{4}/g) || [], ls = ys.filter(y => isLandsat(state.available[+y])), s2 = ys.filter(y => !ls.includes(y));      // Landsat years (Iceland, before 2016) are credited to the USGS, the others to Copernicus
  const sat = [s2.length || !ls.length ? `Modified Copernicus Sentinel data ${s2.length ? [...new Set(s2)].join(' and ') : years}` : '', ls.length ? `Landsat ${[...new Set(ls)].join(' and ')} courtesy of the U.S. Geological Survey` : ''].filter(Boolean).join(' · ');
  return `${sat}${[...new Set(extras.filter(Boolean))].map(x => ' · ' + x).join('')}`;      // the data credit; "Created on <site>" is its own line in the bottom right corner (siteLine)
};
const SITE_LOGO_H = 30, siteLogoW = () => SITE_LOGO_H * 200 / 190 + 12;
const siteLine = (ctx, xRight, y) => {            // "Created on tonguesfromspace.org" with the small logo behind it, right aligned; in 3D videos the logo turns with the camera
  const lw = logoImg ? siteLogoW() : 0;
  ctx.font = `600 22px ${FONT}`; shadowText(ctx, `Created on ${SITE_NAME}`, xRight - lw, y, {blur:6, color:'rgba(255,255,255,.9)', align:'right'});
  if (!logoImg) return;
  const lx = xRight - SITE_LOGO_H * 200 / 190, ly = y - SITE_LOGO_H * 0.8;
  if (brandMotion) drawLogo3DAt(ctx, lx, ly, SITE_LOGO_H, brandMotion.cam, brandMotion.cam0);
  else { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 8; ctx.drawImage(logoImg, lx, ly, SITE_LOGO_H * 200 / 190, SITE_LOGO_H); ctx.restore(); }
};
const siteLineW = ctx => { ctx.save(); ctx.font = `600 22px ${FONT}`; const w = ctx.measureText(`Created on ${SITE_NAME}`).width + (logoImg ? siteLogoW() : 0); ctx.restore(); return w; };
const creditYears = info => info.compare ? `${info.years[0]} and ${info.years[1]}` : info.years[0] === info.years[info.years.length - 1] ? String(info.years[0]) : `${info.years[0]}–${info.years[info.years.length - 1]}`;
/* One brand corner: the logo and the red label on one line (22 px, nothing smaller than 22 px anywhere: it must stay readable on a phone) */
let brandMotion = null;      // 3D videos: {cam, cam0}, the camera now and at the start; the small logo of the brand corner then turns and tilts with it (set around draw3DLabels in js/11-view3d.js)
function brandCorner(ctx, x, y){
  let tx = x; const h = 36;
  if (logoImg && brandMotion) { drawLogo3DAt(ctx, x, y - h * .8, h, brandMotion.cam, brandMotion.cam0); tx = x + h * 200 / 190 + 12; }
  else if (logoImg) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 8; ctx.drawImage(logoImg, x, y - h * .8, h * 200 / 190, h); ctx.restore(); tx = x + h * 200 / 190 + 12; }
  ctx.font = `700 22px ${FONT}`; shadowText(ctx, 'TONGUES FROM SPACE', tx, y, {blur:8, color:'#FF5A4E'});
}
/* The map key: north arrow and scale bar side by side at the top right, on two shared lines (the labels on the brand label's baseline, the arrow's foot and the bar below) */
const mapKeySize = res => { const m = niceScale(300 * res), px = m / res; return { m, px, w: 22 + 18 + px }; };
function mapKey(ctx, res, rightX, top){
  const k = mapKeySize(res), x0 = rightX - k.w, ax = x0 + 11, labelY = top + 24, foot = top + 58, bx = rightX - k.px;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(ax, labelY + 10); ctx.lineTo(ax + 10, foot); ctx.lineTo(ax, foot - 8); ctx.lineTo(ax - 10, foot); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 6; ctx.fillRect(bx, foot - 4, k.px, 4); ctx.fillRect(bx, foot - 13, 3, 13); ctx.fillRect(rightX - 3, foot - 13, 3, 13); ctx.restore();
  ctx.font = `700 22px ${FONT}`; shadowText(ctx, 'N', ax, labelY, {align:'center', blur:6});
  ctx.font = `600 22px ${FONT}`; shadowText(ctx, k.m >= 1000 ? `${k.m / 1000} km` : `${k.m} m`, bx + k.px / 2, labelY, {align:'center', blur:8});
}
/* The top block, built like the year tag on screen: the brand, then the year as the big line, under it the glacier and its place, then the date and what the picture is, then the legend of the outlines.
   o: year (text), name, place, date [bold, long rest, short rest] or null, legend, keyW (width of the map key to keep clear), hA (opacity of everything but the brand and the year: the header fades in at the start of a video),
   yearAlpha / yearClip (the first year of a slider picture fades and is cut with its image), shortDate (only the short rest of the date line). Returns the baseline of the last line. */
const YEAR_PX = 88, NAME_PX = 34, SUB_PX = 24;
const heroBase = S => S.top + 24 + 46 + Math.round(0.72 * YEAR_PX);      // the later year of a vertical slider sits under the map key on the right      // where the baseline of a year at full size lies
function drawHeader(ctx, W, S, o){
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
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 50, y - 8); ctx.stroke(); ctx.restore();
    ctx.font = `500 22px ${FONT}`; shadowText(ctx, text, x + 66, y, {blur:8});
  });
  ctx.restore(); return y;
}
/* Facts: flat dark tiles with a hairline edge (no blur: Safari ignores filters) */
function drawFactTiles(ctx, tiles, x, y, tw, th, gap){
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
function drawTimeline(ctx, x0, x1, y, years, pos){
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
function drawBottom(ctx, W, H, S, o){
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
function drawSwipeLabels(ctx, W, H, S, info, split){
  shade(ctx, W, H, S, 300);
  const base = H - S.bottom, hz = info.horiz, hA = info.hA ?? 1, g = info.glacier, sc = info.scenes || [];
  const dateOf = k => sc[k] ? [fmtDM(sc[k].date), ` · ${styleLine(info.style, sc[k])}`, ` · ${sensorName(sc[k])} · ${isLandsat(sc[k]) ? 'natural color' : STYLE_NAME[info.style] || STYLE_NAME.natural}`] : null;
  const al = Math.min(1, split / (W * 0.25)), ar = Math.min(1, (W - split) / (W * 0.25));      // a year fades when its image is almost hidden
  drawHeader(ctx, W, S, {year: String(info.years[0]), name: stillName(g), place: placeOf(g), date: dateOf(0), shortDate: !hz, hA, keyW: mapKeySize(info.res).w,
    yearAlpha: hz ? 1 : al, yearClip: hz ? [0, 0, W, split] : null, legend: info.outline ? [['#F2A93B', [14, 9], REGION.outlines.oldLegend]] : []});
  ctx.save(); ctx.globalAlpha *= hA; mapKey(ctx, info.res, W - S.right, S.top); ctx.restore();
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
  if (hz) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, split, W, H - split); ctx.clip();
    shadowText(ctx, String(info.years[1]), S.left - 4, base - 112, {blur:14}); dateLine(S.left, base - 72, 'left'); ctx.restore();
  } else {
    ctx.save(); ctx.globalAlpha = ar; const y = heroBase(S);
    shadowText(ctx, String(info.years[1]), W - S.right, y, {blur:14, align:'right'}); dateLine(W - S.right, y + 46, 'right'); ctx.restore();
  }
  ctx.font = `500 22px ${FONT}`; shadowText(ctx, shortCredit(`${Math.min(...info.years)} and ${Math.max(...info.years)}`, [info.outline && REGION.outlines.credit]), S.left, base, {blur:6, color:'rgba(255,255,255,.78)'});
  siteLine(ctx, W - S.right, base);
}
/* The frame of a single year (a picture, or one frame of a timelapse): top block, map key, bottom block with facts and timeline */
function drawYearFrame(ctx, W, H, S, info, yr, scene, tlYears){
  const g = info.glacier, hA = info.hA ?? 1;
  shade(ctx, W, H, S);
  drawHeader(ctx, W, S, {year: String(yr), name: stillName(g), place: placeOf(g), hA, keyW: mapKeySize(info.res).w, legend: info.outline ? [['#F2A93B', [14, 9], REGION.outlines.oldLegend]] : [],
    date: [fmtDM(scene.date), ` · ${styleLine(info.style, scene)}`, ` · ${sensorName(scene)} · ${isLandsat(scene) ? 'natural color' : STYLE_NAME[info.style] || STYLE_NAME.natural}`]});
  ctx.save(); ctx.globalAlpha *= hA; mapKey(ctx, info.res, W - S.right, S.top); ctx.restore();
  drawBottom(ctx, W, H, S, {
    credit: shortCredit(creditYears(info), [info.outline && REGION.outlines.credit]),
    tiles: info.factSet ? factTiles(g, yr, info.factSet, info.factBase) : [],
    tl: tlYears.length > 1 ? { years: tlYears, pos: Math.max(0, tlYears.indexOf(yr)) } : null
  });
}
function drawLabels(ctx, W, H, S, info, k){ drawYearFrame(ctx, W, H, S, info, info.years[k], info.scenes[k], info.years); }
function drawStill(ctx, W, H, info, S){ drawYearFrame(ctx, W, H, S, info, info.years[0], info.scenes[0], info.tlYears || info.years); }
/* The end card: what melted in the chosen period. One big number (the glacier's share of ice, else all Swiss glaciers), one comparison, the Swiss context, the site.
   te: seconds since the card began (it fades in over 0.4 s, the number counts up); without te the finished card. */
function drawEndSlide(ctx, W, H, S, info, te){
  const e = info.end, g = info.glacier, wide = W > H, x = S.left, maxW = Math.min(W - S.left - S.right, wide ? 760 : 820), fin = te == null;
  const A = (t0, d = .35) => fin ? 1 : easeIO((te - t0) / d);
  ctx.save(); ctx.globalAlpha *= fin ? 1 : easeIO(te / .4);
  if (wide) { const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(8,14,18,.92)'); gr.addColorStop(.55, 'rgba(8,14,18,.84)'); gr.addColorStop(1, 'rgba(8,14,18,.35)'); ctx.fillStyle = gr; }
  else ctx.fillStyle = 'rgba(8,14,18,.8)';
  ctx.fillRect(0, 0, W, H);
  const hero = e.glacier || e.swiss, label = `${e.glacier ? stillName(g).toUpperCase() : 'ALL SWISS GLACIERS'} · ${e.from}–${e.to}`, sub = e.glacier ? 'of its ice (estimate)' : 'of their ice';
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
function wrap(ctx, text, x, y, maxW, lh){
  const words = text.split(' '), out = []; let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
  if (line) out.push(line);
  return out.map((t, i) => ({t, y: y + i * lh}));
}

/* ---- encoding ---- */
async function pickCodec(W, H, bitrate = 8e6){
  for (const codec of VIDEO.codecs) {
    const cfg = { codec, width:W, height:H, bitrate, framerate:VIDEO.fps, avc:{format:'avc'} };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
  }
  return null;
}
/* The pictures of the given years, cropped to the frame on the map, with the optional 1850 outline, and the facts the labels need */
async function frameBases(ys, W, H){
  const g = currentGlacier(), fp = imageFootprint(g), r = frameRect();
  const nw = L.CRS.EPSG3857.project(map.containerPointToLatLng([r.x, r.y]));
  const se = L.CRS.EPSG3857.project(map.containerPointToLatLng([r.x + r.w, r.y + r.h]));
  const crop = { x0: nw.x, x1: se.x, y1: nw.y, fp };
  const outline = $('vOutline').checked && hasOldOutline(g) ? oldOutlineGeom(g) : null;
  await Promise.all([loadLogo(), ...['600 30px', '800 120px', '500 30px', '700 40px'].map(f => document.fonts.load(`${f} "Schibsted Grotesk"`).catch(() => {}))]);

  // images of all years (most are cached already), decoded one after the other with createImageBitmap: robust also on phones
  let done = 0;
  const urls = await Promise.all(ys.map(y => loadImage(g, y).then(url => { progress(0.2 * (++done) / ys.length, `Loading images ${done} of ${ys.length}…`); return url; })));
  const bases = [];
  for (const [i, url] of urls.entries()) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    bases.push(await buildBase(bmp, crop, W, H, outline, outlineGeom(g), outsideAlpha())); bmp.close();
    progress(0.2 + 0.1 * (i + 1) / urls.length, 'Preparing frames…');
  }
  const lo = Math.min(...ys), hi = Math.max(...ys), inRange = VOLUME_LOSS.filter(n => n.y >= lo && n.y <= hi);
  const info = { glacier: g, years: ys, tlYears: ys, scenes: ys.map(y => state.available[y]), outline: !!outline, res: frameGroundRes(), style: state.style,
    lost: inRange.length ? Math.round((1 - inRange.reduce((q, n) => q * (1 - n.v / 100), 1)) * 100) : 0,
    site: (location.host + location.pathname).replace(/\/(index\.html)?$/, '') };
  return { g, bases, outline, info };
}
/* One set of water numbers for a glacier, used on the card, in the chapter and on the picture: one digit after the comma */
const fmtPools = (n, long) => n >= 1e6 ? (n / 1e6).toFixed(1) + (long ? ' million' : ' M') : n >= 1e3 ? (n / 1e3).toFixed(1) + (long ? ' thousand' : ' k') : n.toFixed(1);
function waterNumbers(km3){
  const litres = km3 * 0.9e12, pools = litres / POOL_L;
  return { km3, km3Text: km3.toFixed(1), litres, litresText: fmtN(litres, 1), pools, poolsText: fmtPools(pools, false), poolsLong: fmtPools(pools, true),
           lakes: km3 * 0.9 / LAKE_ZURICH_KM3, tap: km3 * 0.9 / SWISS_SUPPLY_KM3 };
}
/* ---- the still picture: title and glacier at the very top, year, facts and credit at the very bottom ---- */
const SITE_NAME = 'tonguesfromspace.org';
const stillName = g => (g.local || g.name).replace(/\s*\(.*?\)\s*/g, ' ').trim();       // the full local name, "Grosser Aletschgletscher", "Glacier de Corbassière"
/* ---- glacier facts: three flat tiles on pictures and videos, in sets (Ice, Retreat, Size). Only documented values; a tile whose data is missing is left out.
   In a video the tiles follow the year on screen; "since" counts from the first year of the video (a picture: from 2016). ---- */
const factCache = {};            // glacier id -> { done, v: the ice volume of the glacier (Grab et al. 2021) or null, p: the promise }
function loadFacts(g){
  let c = factCache[g.id];
  if (!c) {
    c = factCache[g.id] = { done: false, v: null };
    c.p = (g.rgi ? loadBundle(bundleId(g)).then(b => { if (b && b.change) IS_CHANGE[g.id] = b.change; return null; }) : glacierVolume(g)).catch(() => null).then(v => { c.v = v; c.done = true; if (!$('videoSheet').hidden) { if (viewMode === '3d') update3DInfo(); else drawPreview(); } return c; });
  }
  return c.p || Promise.resolve(c);
}
const factSetOn = () => $('vFacts').checked ? $('vFactSet').value : null;
const poolsShort = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : n.toFixed(0);
const metres = m => (m < 0 ? MINUS_SIGN : m > 0 ? '+' : '') + Math.abs(Math.round(m)).toLocaleString('en').replace(/,/g, ' ');
const lengthSince = (g, from, to) => { const L = g.inv && g.inv.length; if (!L || !L.series) return null; const r = L.series.filter(s => s[0] >= from && s[1] <= to); return r.length ? r.reduce((t, s) => t + s[2], 0) : null; };
function thinning(g){            // the ice thickness lost since the first GLAMOS elevation model of the glacier (the longest survey that ends with the newest one)
  const V = g.inv && g.inv.volume, okS = V && V.series ? V.series.filter(r => r[6] >= 90 && r[1] > r[0]) : [];
  if (!okS.length) return null;
  const endS = Math.max(...okS.map(r => r[1])), r = okS.filter(q => q[1] === endS).sort((a, b) => a[0] - b[0])[0];
  return r[3] < 0 ? { from: r[0], dh: r[3] } : null;
}
/* Iceland: documented values only. Retreat: the front since about 1890 (Guðmundsson et al. 2017), the area of the 2025 outline against the RGI of about 2000, and the surface change since the first year,
   measured from the ArcticDEM strips (it follows the year). Size: the area of 2025, the length and the highest point. */
function factTilesIs(g, year, set, base){
  const t = [], W3 = '#fff', ch = IS_CHANGE[g.id], a25 = g.outlines && g.outlines.latest ? g.outlines.latest.areaInBasinKm2 : null, a00 = g.rgi.areaKm2;
  if (set === 'retreat') {
    t.push({ label: 'FRONT SINCE ~1890', value: MINUS_SIGN + '4–7', unit: 'km', color: FACT_RED });
    if (ch && ch.byYear && ch.byYear[year] !== undefined && ch.byYear[base] !== undefined) { const d = ch.byYear[year] - ch.byYear[base]; t.push({ label: `SURFACE SINCE ${base}`, value: d === 0 ? '0' : (d < 0 ? MINUS_SIGN : '+') + Math.abs(d).toFixed(1), unit: 'm', color: d < 0 ? FACT_RED : W3 }); }
    if (ok(a25) && ok(a00)) t.push({ label: 'AREA VS 2000', value: MINUS_SIGN + Math.abs(Math.round(100 * (a00 - a25) / a00)), unit: '%', color: FACT_RED });
  } else if (set === 'size') {
    if (ok(a25)) t.push({ label: 'AREA 2025', value: Math.round(a25).toLocaleString('en').replace(/,/g, ' '), unit: 'km²', color: FACT_BLUE });
    t.push({ label: 'LENGTH · ~2000', value: g.rgi.lengthKm.toFixed(1), unit: 'km', color: W3 });
    t.push({ label: 'HIGHEST POINT', value: Math.round(g.rgi.zmax).toLocaleString('en').replace(/,/g, ' '), unit: 'm a.s.l.', color: W3 });
  }
  return t;
}
function factTiles(g, year, set, base){
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
    const aRef = rankArea(g), R = inv && inv.radar, max = v && v.max ? v.max : R ? R.max_m : null;
    if (ok(aRef)) t.push({ label: `AREA ${inv ? (inv.year || rankLabel()) : 2016}`, value: aRef.toFixed(1), unit: 'km²', color: FACT_BLUE });
    if (ok(max)) t.push({ label: 'MAX. THICKNESS', value: String(Math.round(max)), unit: 'm', color: W3 });
    const tip = inv && inv.terminus && inv.terminus.tip_m;
    if (ok(tip)) t.push({ label: 'TONGUE TIP', value: Math.round(tip).toLocaleString('en').replace(/,/g, ' '), unit: 'm a.s.l.', color: W3 });
  }
  return t;
}
async function makeImage(){
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
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    const name = `tonguesfromspace-${shortSlug(g.name)}-${ys.join('-')}${cmpImg ? '-slider' : ''}-${FMT_SUFFIX[vstate.fmt]}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
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
async function endInfo(g, info, lo, hi){            // the facts for the end card: what melted in the chosen period, all of Switzerland and this glacier (estimate) if its ice is known; false when there is no loss data for it
  const to = Math.min(hi, VOLUME_LOSS[VOLUME_LOSS.length - 1].y), melt = iceVolume(lo - 1) - iceVolume(to);      // the year of the first picture counts too (a glaciological year ends in September)
  if (!(to >= lo && melt > 0)) return false;
  const gv = await glacierVolume(g).catch(() => null), ice0 = gv ? glacierIceAt(g, gv, lo - 1) : 0, gMelt = gv ? ice0 - glacierIceAt(g, gv, to) : 0;
  info.end = { from: lo, to, swiss: { N: waterNumbers(melt), pct: info.lost },
    glacier: gv && gMelt > 0 && ice0 > 0 ? { N: waterNumbers(gMelt), pct: 100 * gMelt / ice0 } : null };
  return true;
}
async function makeVideo(){
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
    const mp4 = muxMp4({ width: W, height: H, fps, avcC: desc, samples: chunks });
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
const shortSlug = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function downloadFile(file){
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$('vsGo').onclick = () => viewMode === '3d' ? download3D(vstate.kind === 'image' ? 'image' : 'video') : vstate.kind === 'image' ? makeImage() : makeVideo();

/* ---- share the finished file in the public gallery (the Worker checks and holds it until it is approved) ---- */
let lastExport = null;              // { file, meta: { type, years } } of the picture or video just made
let galleryConfig = null, turnstileToken = '', turnstileId = null;
const galleryInfo = () => galleryConfig || (galleryConfig = RELAY_BASE
  ? fetch(RELAY_BASE + '/gallery/config').then(r => r.ok ? r.json() : { open: false }).catch(() => ({ open: false })) : Promise.resolve({ open: false }));
async function offerShare(){            // shown as soon as the download pane opens; the file is made when it is sent (or the one just made is used)
  const cfg = await galleryInfo();
  if (!cfg.open || $('videoSheet').hidden) return;
  if ($('vsShareBox').hidden) {
    $('vsShare').hidden = false; $('vsShare').setAttribute('aria-expanded', 'false'); $('vsShareForm').hidden = true; $('vsShareMsg').textContent = '';   // a fresh form when the box appears
    $('vsShareForm').querySelectorAll('input,button').forEach(e => e.disabled = false); $('vsConsent').checked = false;
    if (turnstileId !== null) { turnstile.reset(turnstileId); turnstileToken = ''; }
  }
  $('vsShareBox').hidden = false;
}
let shareOnly = false;              // the file is made for the gallery only: no download
const exportSignature = () => { try { return JSON.stringify([viewMode, state.glacier, state.mode, state.a, state.b, state.from, state.to, state.one, state.latest && state.latest.year, state.style, state.frame, vstate.kind, vstate.type, vstate.fmt,
  [...document.querySelectorAll('#videoSheet input, #videoSheet select')].filter(e => !e.closest('#vsShareBox')).map(e => e.type === 'checkbox' ? +e.checked : e.value).join('|'),
  viewMode === '3d' ? [v3d && v3d.getCam(), v3dSplit, v3dCtx && v3dCtx.current && v3dCtx.current()] : [map.getCenter().lat.toFixed(5), map.getCenter().lng.toFixed(5), map.getZoom(), state.split],
  [...document.querySelectorAll('.layerbox input[type=checkbox]')].map(e => +e.checked).join(''), brightness(), outsideAlpha(), imgOpacity(), typeof frameRect === 'function' ? frameRect() : null]); } catch { return String(Math.random()); } };      // what the file shows: a file made earlier is reused only when nothing of this has changed
async function makeForShare(){
  shareOnly = true;
  try { if (viewMode === '3d') await download3D(vstate.kind === 'image' ? 'image' : 'video'); else if (vstate.kind === 'image') await makeImage(); else await makeVideo(); }
  finally { shareOnly = false; }
}
function fitTurnstile(){            // the check is 300 px wide: scale it down to the width of the pane
  const el = $('vsTurnstile'), room = el.parentElement.clientWidth, k = room > 0 ? Math.min(1, room / 300) : 1;
  Object.assign(el.style, { width: '300px', height: Math.round(65 * k) + 'px', transform: k < 1 ? `scale(${k})` : '', transformOrigin: '0 0' });
}
addEventListener('resize', () => { if (turnstileId !== null) fitTurnstile(); });
function loadTurnstile(){
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
function muxMp4({ width, height, fps, avcC, samples }){
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
  const moov = off => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x00010000), u16(0x0100), zeros(10), matrix, zeros(24), u32(2)),
    box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durMs), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width << 16), u32(height << 16)),
      ...(shift ? [box('edts', full('elst', 0, 0, u32(1), u32(durMs), u32(shift), u32(0x00010000)))] : []),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(durTS), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), u8(0)),
        box('minf',
          full('vmhd', 0, 1, zeros(8)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          stbl(off)))));
  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const moovLen = moov(0).length;                          // offsets do not change the size
  const dataStart = ftyp.length + moovLen + 8;
  const mdatBody = cat(samples.map(s => s.data));
  return cat([ftyp, moov(dataStart), u32(mdatBody.length + 8), str('mdat'), mdatBody]);
}

