/* 2. Goes into js/11-view3d.js next to placePhoto() (the "Historic photographs" section). Also needed there:
   - photoOn = {..., depth: false, d: 1200}; in enterPhoto();
   - `im.crossOrigin = 'anonymous';` before the photo is loaded (so it can be a WebGL texture);
   - at the end of placePhoto(): `if (o.depth) applyDepth();`;
   - `Object.assign(photoOn, {lvl: null, model, dem: c.dem, latest});` after the level is known, and `photoOn.lvl = rel;` before photoCaption();
   - leavePhoto(): `if (viewer) viewer.setBillboard(null); $('v3dPhoto').style.visibility = '';`;
   - hide the rod while photoOn.depth is true (markItems, marksOn, the rod button in photoCaption). */
/* Image depth (Aletsch): the photograph stands as a plane in the 3D scene at the distance of the slider; terrain nearer than that covers it, terrain behind is hidden by it. The line to drag and the rod rest meanwhile. */
const DEPTH_RANGE = [60, 9000], depthOf = v => DEPTH_RANGE[0] * Math.pow(DEPTH_RANGE[1] / DEPTH_RANGE[0], v), depthValue = d => Math.log(d / DEPTH_RANGE[0]) / Math.log(DEPTH_RANGE[1] / DEPTH_RANGE[0]);
function applyDepth(){
  const o = photoOn, cv = $('v3dCanvas'), cw = cv.clientWidth, ch = cv.clientHeight, L0 = o.lay, im = $('v3dPhoto'); if (!v3d || !im.complete || !im.naturalWidth) return;
  v3d.setBillboard(im, [L0.x / cw * 2 - 1, 1 - (L0.y + L0.h) / ch * 2, (L0.x + L0.w) / cw * 2 - 1, 1 - L0.y / ch * 2], o.d);
}
function setDepthMode(on){
  const o = photoOn; if (!o || !v3d) return; o.depth = on;
  $('v3dPhoto').style.visibility = on ? 'hidden' : '';
  if (on) { hideDivider3D(); v3d.setSplit(-1, false); applyDepth(); pinLoop(); } else { v3d.setBillboard(null); const d = $('v3dDiv'); d.classList.remove('hz'); d.hidden = false; $('v3d').classList.add('cmp-v'); $('v3dLabA').hidden = $('v3dLabB').hidden = false; clipPhoto(); }
  photoCaption(o.ph, o.lvl, o.model, o.dem, o.latest);
}
