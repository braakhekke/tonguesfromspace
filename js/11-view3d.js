import { wire } from './wire.js';
import { FIRST_YEAR, YEARS, VOLUME_LOSS, lv95, $, COARSE } from './01-data.js';
import { DATA, loadOutline, boxRecord, hasOldOutline, oldOutlineGeom, newOutlineGeom, eachPiece, GLACIERS } from './02-glaciers.js';
import { prefs, savePrefs, CDSE, STYLE_NAME, isLandsat, LANDSAT_CREDIT, sensorName, styleLine, asset, idb, imageFootprint, restoreLatest, imageHere, loadImage, fmtDM, fmtDate, latestBusy } from './03-imagery.js';
import { state, writeHash, currentGlacier, PLAIN_START, okYears, viewMode, setViewMode } from './04-state.js';
import { map, TWO_FINGER, updateCredits, trailsFor, ensureSight, sightFor, siYear, flownYear, oldestAerial, oldestWhat, restoreOldest, satOn, loadDeferred, horiz, tlFrames, stopPlay, getVar, radarColor, radarPopup, loadRadar, drawRadar, fmtLen, fmtArea, cancelMeasure, sliderHintDone, setSliderHintDone } from './05-map.js';
import { statusLine } from './06-scene-search.js';
import { renderLayerTitles, brightness, outsideAlpha, outlineGeom, adjustedUrl, imgOpacity, applyImgOpacity, glacierVolume, glacierIceAt, refreshAll, subFocus } from './07-render.js';
import { setStatus, showNotice, lb, syncSatUi } from './08-controls.js';
import { setLayers } from './09-phones.js';
import { VIDEO, marginsFor, FMT_SUFFIX, vstate, SWIPE_KEYS, swipeLength, stillYear, FONT, frameRect, vPrev, guideText, placeFrame, earlyNote, endLen, tailLength, perSec, loopSeq, centre3D, closeVideo, progress, shade, logoImg, loadLogo, easeIO, placeOf, shortCredit, minimalOn, minimalLabels, drawHeader, drawBottom, drawEndSlide, pickCodec, stillName, loadFacts, factSetOn, factTiles, endInfo, shortSlug, downloadFile, offerShare, shareOnly, exportSignature, muxMp4, brandMotion, stopPreview, lastExport, logoAsked, setBrandMotion, setLastExport, setLogoAsked } from './10-animation.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'bundleId', { get: () => bundleId, configurable: true });
Object.defineProperty(wire, 'download3D', { get: () => download3D, configurable: true });
Object.defineProperty(wire, 'drawLogo3DAt', { get: () => drawLogo3DAt, configurable: true });
Object.defineProperty(wire, 'drawPreview3D', { get: () => drawPreview3D, configurable: true });
Object.defineProperty(wire, 'leavePhoto', { get: () => leavePhoto, configurable: true });
Object.defineProperty(wire, 'loadBundle', { get: () => loadBundle, configurable: true });
Object.defineProperty(wire, 'open3D', { get: () => open3D, configurable: true });
Object.defineProperty(wire, 'refresh3D', { get: () => refresh3D, configurable: true });
Object.defineProperty(wire, 'setSplit3D', { get: () => setSplit3D, configurable: true });
Object.defineProperty(wire, 'stripImageSpec', { get: () => stripImageSpec, configurable: true });
Object.defineProperty(wire, 'stripPicturesOff', { get: () => stripPicturesOff, configurable: true });
Object.defineProperty(wire, 'sync3D', { get: () => sync3D, configurable: true });
Object.defineProperty(wire, 'sync3DMenu', { get: () => sync3DMenu, configurable: true });
Object.defineProperty(wire, 'update3DInfo', { get: () => update3DInfo, configurable: true });
Object.defineProperty(wire, 'updateCredits3D', { get: () => updateCredits3D, configurable: true });
Object.defineProperty(wire, 'v3d', { get: () => v3d, configurable: true });
Object.defineProperty(wire, 'v3dBusy', { get: () => v3dBusy, configurable: true });
Object.defineProperty(wire, 'v3dCtx', { get: () => v3dCtx, configurable: true });
Object.defineProperty(wire, 'v3dSplit', { get: () => v3dSplit, configurable: true });
/* =====================================================================
   12. 3D view of the tongue
   A restricted view: a strip along the glacier, 1 km below the tongue tip and several km up the glacier, about 4 km wide. The camera starts below the tip and looks up the glacier
   (the direction is taken from the 2023 outline around the tip), it can turn and tilt within limits, no panning.
   Heights: swissALTI3D (swisstopo), read from the open Mapterhorn terrain tiles (Terrarium encoding, CORS open). The picture is the satellite image of the year on the map.
   Local frame of the strip: a = metres up the glacier from the tip (negative = below it), b = metres to the right when looking up the glacier; in the 3D scene x = b, z = -a.
   ===================================================================== */
export const FREE_CAM = location.pathname.startsWith('/site/');      // the page inside the walkthrough (served under /site/): the camera turns all the way round and can be moved sideways (Shift, Ctrl, Alt or Cmd + drag, or the right or middle mouse button), only the height and the distance keep their limits
export const V3D = {HALF: 2000, BACK: 1000, UP: [2500, 6500], CELL: [14, 28], TEX: [1024, 2048], Z: 13, EL: [0.12, 1.35], DIST: [600, 7500], AZ: 1.3, WM: 20037508.342789244};      // HALF: half width (m); BACK: strip below the tip (m); UP: shortest and longest strip up the glacier (m); CELL: grid spacing (m), the fine one needs 32-bit indices (about 150,000 points), the coarse one is the fallback; TEX: texture width and height; Z: tile zoom; EL / DIST / AZ: tilt, distance and turn limits
export const LANDING_CAM = {az: 0.1565, el: 0.3228, dist: 3880};      // the camera of the landing page (plain address, first glacier): azimuth and elevation in radians, distance in metres; read it from a view you like with v3d.getCam() in the console
/* the credit of the terrain of the open view: the region's, and the ArcticDEM strips when the glacier's terrain file has a surface for every year */
export const ARCTIC_HTML = 'ArcticDEM strips © <a href="https://www.pgc.umn.edu/data/arcticdem/" target="_blank" rel="noopener">Polar Geospatial Center</a>, University of Minnesota (CC BY 4.0; Maxar WorldView images)';
export function terrainHtml(c){
  const y = c && c.bundle && c.bundle.yearly; if (!y || /ArcticDEM/.test(REGION.terrain.html)) return REGION.terrain.html;
  if (y.swiss) return `${REGION.terrain.html}; ice surface of each year: swissSURFACE3D and swissALTI3D © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a> (Federal Office of Topography swisstopo), mass balance <a href="https://doi.org/10.18750/massbalance.2025.r2025" target="_blank" rel="noopener">GLAMOS</a>`;
  return `${ARCTIC_HTML}, ground reference ${y.reference ? `${y.reference}: ${REGION.terrain.html}` : REGION.terrain.html}`;
}
export const bundleId = g => g.inv ? g.inv.id : g.id;      // the key of a glacier's terrain file and of its entries in the data files (the Swiss ones have an inventory id)
export const V3D_VIEW = {'A54e-24': {dist: 1.3}};      // Trift: the camera starts further back, away from the glacier (dist: times the usual distance); the strip itself (azimuth, half, back, up) is in data/boxes.js
export const terrainTile = (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;
export function stripFor(g, at){            // the strip of a glacier as stored: azimuth up the glacier from the tip, half width, metres below the tip and up (data/boxes.js)
  const P0 = L.CRS.EPSG3857.project(L.latLng(at[0], at[1])), k = 1 / Math.cos(at[0] * Math.PI / 180), st = boxRecord(bundleId(g), g.name).strip3d;
  const az = (st.azimuth || 0) * Math.PI / 180, ue = Math.sin(az), un = Math.cos(az), sh = st.shift || 0, P = {x: P0.x + sh * un * k, y: P0.y - sh * ue * k}, view = V3D_VIEW[bundleId(g)] || g.view3d || {};
  return {P, k, ue, un, up: st.up || V3D.UP[1], back: st.back === undefined ? V3D.BACK : st.back, dist: view.dist || 1, cam: view.cam || st.cam || null, half: st.half || V3D.HALF, tex: view.tex || V3D.TEX, merc: (a, b) => [P.x + (a * ue + b * un) * k, P.y + (a * un - b * ue) * k]};      // right of the looking direction is (un, -ue)
}
export async function loadHeights(S, nA, nB, zoom){            // heights (m) on a grid of nA+1 rows (top row = far up the glacier) by nB+1 columns (left to right)
  const Z = zoom || REGION.terrainZoom || V3D.Z, WM = V3D.WM, HALF = S.half, BACK = S.back, n = 2 ** Z, tx = x => (x + WM) / (2 * WM) * n, ty = y => (WM - y) / (2 * WM) * n;
  const corners = [[-BACK, -HALF], [-BACK, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b));
  const xs = corners.map(c => tx(c[0])), ys = corners.map(c => ty(c[1])), x0 = Math.floor(Math.min(...xs)), x1 = Math.floor(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.floor(Math.max(...ys));
  const W = (x1 - x0 + 1) * 512, Hh = (y1 - y0 + 1) * 512, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const ctx = c.getContext('2d', {willReadFrequently: true}), jobs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push((async () => {
    const r = await fetch(terrainTile(Z, x, y)); if (!r.ok) throw new Error('terrain tile ' + r.status);
    const bmp = await createImageBitmap(await r.blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
    ctx.drawImage(bmp, (x - x0) * 512, (y - y0) * 512); if (bmp.close) bmp.close();
  })());
  try { await Promise.all(jobs); } catch (e) { if (Z > 11) return loadHeights(S, nA, nB, Z - 1); throw e; }      // a zoom without tiles over this place (Mapterhorn's finest tiles end at 12 over Iceland and Svalbard): one level coarser
  const px = ctx.getImageData(0, 0, W, Hh).data, el = (ix, iy) => { const i = (iy * W + ix) * 4; return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768; };
  const out = new Float32Array((nA + 1) * (nB + 1));
  for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) {
    const [mx, my] = S.merc(S.up - j * (S.up + BACK) / nA, -HALF + i * 2 * HALF / nB);
    const fx = Math.min(W - 1.001, Math.max(0, (tx(mx) - x0) * 512 - 0.5)), fy = Math.min(Hh - 1.001, Math.max(0, (ty(my) - y0) * 512 - 0.5)), ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    out[j * (nB + 1) + i] = (el(ix, iy) * (1 - ax) + el(ix + 1, iy) * ax) * (1 - ay) + (el(ix, iy + 1) * (1 - ax) + el(ix + 1, iy + 1) * ax) * ay;
  }
  return out;
}
export const m4 = {
  persp: (fy, a, n, f, v) => {            // v: only the part of the screen that a download frame covers (sx, sy: its size, cx, cy: its centre, all in screen shares of -1..1; a: aspect of the screen)
    const t = 1 / Math.tan(fy / 2);
    return v ? [t / (v.a * v.sx), 0, 0, 0, 0, t / v.sy, 0, 0, v.cx / v.sx, v.cy / v.sy, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]
             : [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  },
  look: (e, t) => {
    const nz = [e[0] - t[0], e[1] - t[1], e[2] - t[2]], lz = Math.hypot(...nz), z = nz.map(v => v / lz);
    const xr = [z[2], 0, -z[0]], lx = Math.hypot(...xr), x = xr.map(v => v / lx), y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
  },
  mul: (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
};
export const V3D_VS = `attribute vec2 aXZ; attribute float aH; attribute vec2 aG; attribute vec2 aUV; attribute float aH2; attribute vec2 aG2;
uniform mat4 uM; uniform float uX, uHzV, uBuildV; uniform vec3 uBox, uSplitV; varying vec2 vUV; varying vec2 vXZ;      /* uSplitV and uHzV: the fragment shader has its own copies, a uniform must have the same precision in both */ varying vec3 vN; varying float vD, vH;
void main(){
  bool second = false;      /* compare: the part of the screen that shows the second year also gets the ice surface of that year */
  if (uSplitV.x >= 0.0) { vec4 q = uM * vec4(aXZ.x, aH * uX, aXZ.y, 1.0); vec2 n = q.xy / q.w; second = (uHzV > 0.5 ? 0.5 - 0.5 * n.y : 0.5 + 0.5 * n.x) > uSplitV.x; }
  float h = second ? aH2 : aH; vec2 g = second ? aG2 : aG;
  if (uBuildV < 0.999 && uSplitV.x < 0.0) {      /* the tongue being rebuilt: ahead of the front its surface is rough (the second height, made by setSocket) and smooths into its true height as the front passes */
    float ahead = clamp((0.9 - aUV.y) / 0.9, 0.0, 1.0) - (uBuildV * 1.25 - 0.1), gm = 1.0 - smoothstep(-0.3, 0.0, ahead);
    h = mix(aH2, aH, gm); g = mix(aG2, aG, gm);
  }
  vXZ = aXZ; vUV = aUV; vN = normalize(vec3(-g.x * uX, 1.0, -g.y * uX)); vH = h; vD = max(abs(aXZ.x) / uBox.x, abs(aXZ.y - uBox.z) / uBox.y); gl_Position = uM * vec4(aXZ.x, h * uX, aXZ.y, 1.0); }`;
export const V3D_FS = `#extension GL_OES_standard_derivatives : enable
precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define HP highp
#else
#define HP mediump
#endif
uniform HP vec2 uCutA; uniform HP vec3 uCutU, uCutN; varying HP vec2 vXZ;      /* the cut: the ground on the camera side of the section line (between A and B) is not drawn */
uniform sampler2D uMask; uniform vec2 uSz; uniform float uBuild; uniform sampler2D uTex; uniform sampler2D uTex2; uniform vec3 uSplit; uniform float uHz; varying vec2 vUV; varying vec3 vN; varying float vD, vH;
void main(){
  if (uCutN.z > 0.5) {      /* uCutN: the side (x, y) and how deep the cut reaches towards the camera (z, metres; 0 = no cut) */ HP vec2 cd = vXZ - uCutA; if (dot(cd, uCutU.xy) >= 0.0 && dot(cd, uCutU.xy) <= uCutU.z && dot(cd, uCutN.xy) > 0.0 && dot(cd, uCutN.xy) < uCutN.z) discard; }
  float pos = uHz > 0.5 ? uSplit.z - gl_FragCoord.y : gl_FragCoord.x, at = uSplit.x * (uHz > 0.5 ? uSplit.z : uSplit.y); bool right = uSplit.x >= 0.0 && pos > at;      /* stacked: first year on top, second below; else first on the left */ vec3 c = right ? texture2D(uTex2, vUV).rgb : texture2D(uTex, vUV).rgb; float lam = max(dot(normalize(vN), normalize(vec3(0.41, 0.57, 0.71))), 0.0);
  c *= clamp(0.72 + 0.6 * (lam - 0.57), 0.45, 1.15);      /* light from the south-east, like the satellite's morning sun, only a light touch because the picture has its own shadows */
  c = mix(vec3(0.043, 0.071, 0.125), c, smoothstep(1.0, 0.8, vD));
  if (uBuild < 0.999 && texture2D(uMask, vUV).r > 0.5) {      /* the tongue rebuilt: ahead of the front only the edges of the rough triangles (see-through, no fill, no picture); behind it the picture fills in, dissolving through the gaps, as the surface smooths out */
    float ahead = clamp((0.9 - vUV.y) / 0.9, 0.0, 1.0) - (uBuild * 1.25 - 0.1), lines = 1.0 - smoothstep(0.0, 0.3, -ahead);
    vec2 gp = vUV * vec2(64.0, 144.0), f = fract(gp);
#ifdef GL_OES_standard_derivatives
    float w = max(fwidth(gp.x), fwidth(gp.y));
#else
    float w = 0.05;
#endif
    float tri = 1.0 - smoothstep(0.0, 1.0 * w + 0.002, min(min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)), abs(f.x - f.y) * 0.7071));
    float rnd = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (tri < 0.2 && rnd > 1.0 - lines) discard;
    c = mix(c, vec3(0.8, 0.84, 0.88), step(0.2, tri) * lines);
    c += vec3(1.0) * (1.0 - smoothstep(0.0, 0.03, abs(ahead))) * 0.2;      /* a soft edge at the front */
  }
  if (uSplit.x >= 0.0 && abs(pos - at) < 1.5) c = vec3(1.0);      /* the line between the two years */
  gl_FragColor = vec4(c, 1.0); }`;
export let v3d = null;
export let meshWideOk;
export const meshWide = () => meshWideOk !== undefined ? meshWideOk : (meshWideOk = (() => { try { return !!document.createElement('canvas').getContext('webgl').getExtension('OES_element_index_uint'); } catch { return false; } })());      // 32-bit indices: the fine mesh
export function startViewer(canvas, heights, texCanvas, nA, nB, up, BACK = V3D.BACK, distMul = 1, half = V3D.HALF){
  const HALF = half, SC = HALF / V3D.HALF, gl = canvas.getContext('webgl', {antialias: true}); gl.getExtension('OES_standard_derivatives');      // thin contour lines of the tongue loading
  if (!gl) throw new Error('WebGL is not available');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, V3D_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, V3D_FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  /* The space background (Layers: Background > Space): a night sky with stars behind the terrain, drawn as one full-screen triangle before it. The stars turn with the camera; the grid is in units of the picture height, so a download shows the same sky. */
  const sp = gl.createProgram(); gl.attachShader(sp, sh(gl.VERTEX_SHADER, 'attribute vec2 aP; varying vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, 0.0, 1.0); }'));
  gl.attachShader(sp, sh(gl.FRAGMENT_SHADER, `precision highp float; varying vec2 vP; uniform vec3 uS;
    float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 q = vec2(vP.x * uS.x, vP.y) * 0.5 + vec2(uS.y, uS.z);
      vec3 c = vec3(0.027, 0.043, 0.078);      // #070b14, the dark of the map, with the same few small stars as the download frame of the map
      for (int L = 0; L < 2; L++) {
        float n = L == 0 ? 30.0 : 12.0; vec2 g = q * n + float(L) * 17.3, id = floor(g), f = fract(g) - 0.5;
        float on = step(L == 0 ? 0.92 : 0.88, hs(id));
        vec2 o = vec2(hs(id + 3.1), hs(id + 7.7)) - 0.5; float d = length(f - o * 0.7);
        float sz = L == 0 ? 0.045 : 0.07, a = on * smoothstep(sz, sz * 0.3, d) * (0.6 + 0.4 * hs(id + 1.9));
        c += a * mix(vec3(0.81, 0.89, 1.0), vec3(1.0, 0.91, 0.77), step(0.7, hs(id + 5.3)));
      }
      gl_FragColor = vec4(c, 1.0);
    }`));
  gl.bindAttribLocation(sp, 7, 'aP'); gl.linkProgram(sp);
  if (!gl.getProgramParameter(sp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(sp));
  const uSky = gl.getUniformLocation(sp, 'uS'), skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  let space = false;
  gl.useProgram(pr);
  const len = up + BACK, sx = 2 * HALF / nB, sz = len / nA, W = nB + 1, jt = Math.round(up / len * nA), h0 = heights[jt * W + nB / 2];      // nB is even      // h0: height of the tongue tip, the camera looks near it
  let cur = heights;      // the heights on show (the ice surface of the year)
  const at0 = (a, i, j) => a[Math.min(nA, Math.max(0, j)) * W + Math.min(nB, Math.max(0, i))] - h0;
  const hh = (i, j) => at0(heights, i, j);      // the terrain as loaded: the camera uses this one, so that the picture stays still when the ice surface changes with the year
  const hc = (i, j) => at0(cur, i, j);      // the terrain on show (the ice surface of the year): for marks standing on it
  const wide = !!gl.getExtension('OES_element_index_uint'), vd = new Float32Array(W * (nA + 1) * 10), idx = new (wide ? Uint32Array : Uint16Array)(nA * nB * 6);
  if (!wide && W * (nA + 1) > 65535) throw new Error('this device cannot draw the fine terrain');
  /* Bedrock under the ice (Layers: Bedrock): the "Ice shown" share scales the ice between the bed and the surface, and the cut sides of the strip show ice above and bedrock below. Needs the bed of the terrain file. */
  let bedA = null, iceF = 1, block = false, lastH = null, wallBuf = null, wallN = 0;
  const thin = a => { if (!(bedA && iceF < 1)) return a; const o = new Float32Array(a.length); for (let q = 0; q < a.length; q++) { const b = bedA[q]; o[q] = a[q] > b ? b + (a[q] - b) * iceF : a[q]; } return o; };
  const wp = gl.createProgram(); gl.attachShader(wp, sh(gl.VERTEX_SHADER, 'attribute vec3 aWP; attribute vec3 aWC; uniform mat4 uMw; uniform float uXw; varying vec3 vC; void main(){ vC = aWC; gl_Position = uMw * vec4(aWP.x, aWP.y * uXw, aWP.z, 1.0); }'));
  gl.attachShader(wp, sh(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }')); gl.bindAttribLocation(wp, 6, 'aWP'); gl.bindAttribLocation(wp, 7, 'aWC'); gl.linkProgram(wp);
  if (!gl.getProgramParameter(wp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(wp));
  const uMw = gl.getUniformLocation(wp, 'uMw'), uXw = gl.getUniformLocation(wp, 'uXw');
  const buildWalls = () => {      // the four sides of the strip: ice from the surface down to the bed, bedrock from the bed down to a flat base
    if (!(block && bedA)) { wallN = 0; return; }
    const ice = [0.83, 0.90, 0.95], rock = [0.42, 0.36, 0.31], at = (a, i, j) => a[j * W + i] - h0; let lo = Infinity;
    const edges = [[...Array(W).keys()].map(i => [i, 0, 0.88]), [...Array(W).keys()].map(i => [i, nA, 0.78]), [...Array(nA + 1).keys()].map(j => [0, j, 0.68]), [...Array(nA + 1).keys()].map(j => [nB, j, 1])];
    edges.forEach(e => e.forEach(([i, j]) => { lo = Math.min(lo, at(bedA, i, j)); })); const base = lo - 150, out = [];
    const quad = (p, q, y0p, y1p, y0q, y1q, c, s) => { const v = (pt, y) => out.push(pt[0], y, pt[1], c[0] * s, c[1] * s, c[2] * s); v(p, y0p); v(q, y0q); v(p, y1p); v(p, y1p); v(q, y0q); v(q, y1q); };
    edges.forEach(e => { for (let k = 0; k + 1 < e.length; k++) {
      const [i0, j0, s] = e[k], [i1, j1] = e[k + 1], P = [-HALF + i0 * sx, -up + j0 * sz], Q = [-HALF + i1 * sx, -up + j1 * sz];
      const tp = at(cur, i0, j0), tq = at(cur, i1, j1), bp = Math.min(tp, at(bedA, i0, j0)), bq = Math.min(tq, at(bedA, i1, j1));
      if (tp - bp > 0.01 || tq - bq > 0.01) quad(P, Q, tp, bp, tq, bq, ice, s);
      quad(P, Q, bp, base, bq, base, rock, s);
    } });
    if (!wallBuf) wallBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, wallBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, vb); wallN = out.length / 6;
  };
  const fill = (h1, h2) => {            // vertex data: x, z, height, slope x, slope z, u, v, then height and slopes of the second year
    lastH = [h1, h2]; h1 = thin(h1); h2 = thin(h2); cur = h1; const at = (a, i, j) => a[Math.min(nA, Math.max(0, j)) * W + Math.min(nB, Math.max(0, i))] - h0;
    for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) vd.set([-HALF + i * sx, -up + j * sz, at(h1, i, j), (at(h1, i + 1, j) - at(h1, i - 1, j)) / (2 * sx), (at(h1, i, j + 1) - at(h1, i, j - 1)) / (2 * sz), i / nB, j / nA,
      at(h2, i, j), (at(h2, i + 1, j) - at(h2, i - 1, j)) / (2 * sx), (at(h2, i, j + 1) - at(h2, i, j - 1)) / (2 * sz)], (j * W + i) * 10);
  };
  fill(heights, heights);
  let k = 0; for (let j = 0; j < nA; j++) for (let i = 0; i < nB; i++) { const a = j * W + i; idx.set([a, a + W, a + 1, a + 1, a + W, a + W + 1], k); k += 6; }
  const vb = gl.createBuffer(), ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, vd, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  [['aXZ', 2, 0], ['aH', 1, 2], ['aG', 2, 3], ['aUV', 2, 5], ['aH2', 1, 7], ['aG2', 2, 8]].forEach(([n, size, off]) => { const l = gl.getAttribLocation(pr, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 40, off * 4); });
  const texs = [0, 1].map(unit => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas);      // unit 1 is the second year of the comparison
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');      // the ground is seen at a low angle: without this the picture blurs with distance and the 10 m detail is lost
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t; });
  gl.uniform1i(gl.getUniformLocation(pr, 'uTex'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'uTex2'), 1);
  const maskTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));      // where the tongue is (unit 2); black until setMask
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(pr, 'uMask'), 2); gl.activeTexture(gl.TEXTURE0);
  const uB = gl.getUniformLocation(pr, 'uBuild'), uBV = gl.getUniformLocation(pr, 'uBuildV'); let build = 1;      // build: 1 = the finished tongue, less = the tongue being rebuilt
  const uSplit = gl.getUniformLocation(pr, 'uSplit'), uHz = gl.getUniformLocation(pr, 'uHz'), uSplitV = gl.getUniformLocation(pr, 'uSplitV'), uHzV = gl.getUniformLocation(pr, 'uHzV'); let split = -1, hz = 0;      // share of the screen width where the second year starts; -1 = one year only
  const uM = gl.getUniformLocation(pr, 'uM'), uX = gl.getUniformLocation(pr, 'uX');
  const uCutA = gl.getUniformLocation(pr, 'uCutA'), uCutU = gl.getUniformLocation(pr, 'uCutU'), uCutN = gl.getUniformLocation(pr, 'uCutN'); let cut = null, cutKey = '', cutLive = false;      // cut: {ax, az, ux, uz, L}, the section line; the ground in front of it (the camera's side) is left out of the screen picture, never of a download
  gl.enable(gl.DEPTH_TEST); const uBoxL = gl.getUniformLocation(pr, 'uBox'); gl.uniform3f(uBoxL, HALF, len / 2, (BACK - up) / 2); gl.uniform2f(gl.getUniformLocation(pr, 'uSz'), 2 * HALF, len);      // half width, half length, z of the middle: the soft edge
  const cam = {az: 0, el: SC > 2 ? 0.55 : 0.35, dist: 3400 * distMul * SC * (SC > 2 ? 1.15 : 1), exag: 1, tx: 0, tz: 0}, [E0, E1] = V3D.EL, [D0, D1] = [V3D.DIST[0], V3D.DIST[1] * SC], A = FREE_CAM ? Infinity : V3D.AZ;      // a wide area (Iceland) is seen from a little higher
  const ground = (x, z) => hh(Math.round((x + HALF) / (2 * HALF) * nB), Math.round((z + up) / len * nA)) * cam.exag;
  const groundNow = (x, z) => hc(Math.round((x + HALF) / (2 * HALF) * nB), Math.round((z + up) / len * nA)) * cam.exag;
  let dirty = true, dead = false, held = false;      // held: an export is drawing at its own size, the screen is left alone
  let pose = null, flightId = 0;      // pose: the camera of a historic photograph (position in the scene, yaw, pitch, roll, vertical field of view, view = where the picture's centre sits on the screen); null: the orbiting camera
  const orbitTgt = () => { const z = -1200 * Math.min(SC, 2.5) + cam.tz; return [cam.tx, ground(cam.tx, z), z]; };      // the point the camera turns around (moved sideways when the view was panned)
  const rigOrbit = () => {            // where the camera is and what it looks at
    const ce = Math.cos(cam.el), tgt = orbitTgt(), eye = [tgt[0] + cam.dist * ce * Math.sin(cam.az), tgt[1] + cam.dist * Math.sin(cam.el), tgt[2] + cam.dist * ce * Math.cos(cam.az)];      // the camera turns around a point 1.2 km up the glacier, so the tongue sits in the middle of the picture
    eye[1] = Math.max(eye[1], ground(eye[0], eye[2]) + 40);      // never below the ground
    return {eye, tgt};
  };
  const poseFwd = p => { const cp = Math.cos(p.pitch); return [cp * Math.sin(p.yaw), Math.sin(p.pitch), -cp * Math.cos(p.yaw)]; };      // the viewing direction: yaw 0 looks up the glacier (-z), turning towards +x
  const rig = () => { if (!pose) return rigOrbit(); const f = poseFwd(pose); return {eye: [pose.x, pose.y, pose.z], tgt: [pose.x + f[0] * 1000, pose.y + f[1] * 1000, pose.z + f[2] * 1000]}; };
  const poseView = p => {            // the view matrix of a pose, with the roll of the photograph
    const f = poseFwd(p), b = f.map(v => -v), xr = [b[2], 0, -b[0]], lx = Math.hypot(...xr), x = xr.map(v => v / lx), y = [b[1] * x[2] - b[2] * x[1], b[2] * x[0] - b[0] * x[2], b[0] * x[1] - b[1] * x[0]];
    const cr = Math.cos(p.roll), sr = Math.sin(p.roll), x2 = x.map((v, i) => v * cr + y[i] * sr), y2 = x.map((v, i) => -v * sr + y[i] * cr), e = [p.x, p.y, p.z];
    return [x2[0], y2[0], b[0], 0, x2[1], y2[1], b[1], 0, x2[2], y2[2], b[2], 0, -(x2[0] * e[0] + x2[1] * e[1] + x2[2] * e[2]), -(y2[0] * e[0] + y2[1] * e[1] + y2[2] * e[2]), -(b[0] * e[0] + b[1] * e[1] + b[2] * e[2]), 1];
  };
  let shift = {cx: 0, cy: 0};      // where the middle of the picture sits on the screen (shares of -1..1, up is +): moved to the middle of the download frame while a pane covers the side of the stage
  const viewM = (w, h, view) => {            // projection and camera of the picture (view: the part of the screen a download frame covers)
    if (pose) return m4.mul(m4.persp(pose.fovY, w / h, 10, 30000 * SC, view || (pose.view ? {a: w / h, sx: 1, sy: 1, cx: pose.view.cx, cy: pose.view.cy} : null)), poseView(pose));
    const {eye, tgt} = rig();
    return m4.mul(m4.persp(0.75, w / h, 50, 30000 * SC, view || (shift.cx || shift.cy ? {a: w / h, sx: 1, sy: 1, cx: -shift.cx, cy: -shift.cy} : null)), m4.look(eye, tgt));
  };
  const orbitPose = () => { const {eye, tgt} = rigOrbit(), f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]], l = Math.hypot(...f); return {x: eye[0], y: eye[1], z: eye[2], yaw: Math.atan2(f[0], -f[2]), pitch: Math.asin(f[1] / l), roll: 0, fovY: 0.75, view: null}; };
  const setPose = (p, ms = 0) => new Promise(res => {            // p: {alt (m), x, z, yaw, pitch, roll, fovY, view}: fly to the camera of a photograph; null: back to the orbiting camera
    const to = p ? {x: p.x, y: (p.alt - h0) * cam.exag, z: p.z, yaw: p.yaw, pitch: p.pitch, roll: p.roll, fovY: p.fovY, view: p.view} : orbitPose(), from = pose || orbitPose(), id = ++flightId;
    const done = () => { pose = p ? to : null; redraw(); res(); };
    if (!ms) return done();
    const t0 = performance.now(), dyaw = (((to.yaw - from.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, v0 = from.view || {cx: 0, cy: 0}, v1 = to.view || {cx: 0, cy: 0};      // the short way round
    const tick = now => {
      if (dead || id !== flightId) return res();
      const u = Math.min(1, (now - t0) / ms), e = u * u * (3 - 2 * u), mix = (a, b) => a + (b - a) * e;
      if (u >= 1) return done();
      pose = {x: mix(from.x, to.x), y: mix(from.y, to.y), z: mix(from.z, to.z), yaw: from.yaw + dyaw * e, pitch: mix(from.pitch, to.pitch), roll: mix(from.roll, to.roll), fovY: mix(from.fovY, to.fovY), view: {cx: mix(v0.cx, v1.cx), cy: mix(v0.cy, v1.cy)}};
      redraw(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const paint = (w, h, view) => {
    gl.viewport(0, 0, w, h); gl.clearColor(0.043, 0.071, 0.125, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (space) {
      const {eye, tgt} = rig(), fx = tgt[0] - eye[0], fy = tgt[1] - eye[1], fz = tgt[2] - eye[2], fl = Math.hypot(fx, fy, fz) || 1;
      gl.useProgram(sp); gl.uniform3f(uSky, w / h, Math.atan2(fx, -fz) * 0.9, Math.asin(fy / fl) * 0.9);
      gl.disable(gl.DEPTH_TEST); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(7); gl.enable(gl.DEPTH_TEST); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.useProgram(pr);
    }
    gl.uniformMatrix4fv(uM, false, viewM(w, h, view)); gl.uniform1f(uX, cam.exag); gl.uniform1f(uB, build); gl.uniform1f(uBV, build); gl.uniform3f(uSplit, split, w, h); gl.uniform1f(uHz, hz); gl.uniform3f(uSplitV, split, w, h); gl.uniform1f(uHzV, hz);
    if (cut && cutLive) {
      const {eye} = rig(); let nx = -cut.uz, nz = cut.ux; if ((eye[0] - (cut.ax + cut.ux * cut.L / 2)) * nx + (eye[2] - (cut.az + cut.uz * cut.L / 2)) * nz < 0) { nx = -nx; nz = -nz; }      // the camera's side: seen from the other side the cut turns round, so the wall is never seen from behind
      gl.uniform2f(uCutA, cut.ax, cut.az); gl.uniform3f(uCutU, cut.ux, cut.uz, cut.L); gl.uniform3f(uCutN, nx, nz, Math.max(300, cut.L * 0.5));
    } else gl.uniform3f(uCutN, 0, 0, 0);
    gl.drawElements(gl.TRIANGLES, idx.length, wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    if (block && wallN) {
      gl.useProgram(wp); gl.uniformMatrix4fv(uMw, false, viewM(w, h, view)); gl.uniform1f(uXw, cam.exag); gl.bindBuffer(gl.ARRAY_BUFFER, wallBuf);
      gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, wallN); gl.disableVertexAttribArray(6); gl.disableVertexAttribArray(7); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.useProgram(pr);
    }
  };
  const draw = () => {
    if (dead) return; dirty = false; if (held) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    cutLive = true; paint(w, h); cutLive = false;
  };
  const frame = (w, h, c, view) => {            // one picture of w x h with the camera c (az, el, dist; default: the one on screen); the canvas must be copied before the next await
    held = true; if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const keep = {...cam}; Object.assign(cam, c || {}); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az));
    paint(w, h, view); Object.assign(cam, keep); return canvas;
  };
  const projectAt = (pts, w, h, c, view) => {            // places in the scene [x, height, z] -> pixels of a picture w x h (null: behind the camera), the camera c (default: the one on screen)
    const keep = {...cam}; Object.assign(cam, c || {}); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az));
    const M = viewM(w, h, view), {eye} = rig(); Object.assign(cam, keep);
    const hidden = (x, y, z) => { const dist = Math.hypot(x - eye[0], y - eye[1], z - eye[2]); for (let k = 1; k < 46; k++) { const t = k / 48; if (t * dist < 150) continue; if (groundNow(eye[0] + (x - eye[0]) * t, eye[2] + (z - eye[2]) * t) > eye[1] + (y - eye[1]) * t + 10) return true; } return false; };      // a ridge between the camera and the place
    return pts.map(([x, y, z, occ]) => { const cw = M[3] * x + M[7] * y + M[11] * z + M[15]; if (cw <= 0) return null; return [((M[0] * x + M[4] * y + M[8] * z + M[12]) / cw * 0.5 + 0.5) * w, (1 - ((M[1] * x + M[5] * y + M[9] * z + M[13]) / cw * 0.5 + 0.5)) * h, !(occ && hidden(x, y, z))]; });
  };
  const eyeOf = c => {            // where the camera is (default: the one on screen), to see whether something stands behind a ridge
    if (pose) return rig().eye;
    const keep = {...cam}; Object.assign(cam, c || {}); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az));
    const ce = Math.cos(cam.el), tgt = orbitTgt(), eye = [tgt[0] + cam.dist * ce * Math.sin(cam.az), tgt[1] + cam.dist * Math.sin(cam.el), tgt[2] + cam.dist * ce * Math.cos(cam.az)];
    eye[1] = Math.max(eye[1], ground(eye[0], eye[2]) + 40); Object.assign(cam, keep); return eye;
  };
  const groundIn = (x, z) => Math.abs(x) <= HALF && z >= -up && z <= BACK ? groundNow(x, z) : -Infinity;      // -Infinity: not on the strip
  const pick = (px, py, w, h) => {            // the place on the terrain under a pixel of a picture w x h: [x, z] of the scene, or null (the sky, or off the strip)
    if (pose) return null;
    const {eye, tgt} = rig(), nz = [eye[0] - tgt[0], eye[1] - tgt[1], eye[2] - tgt[2]], lz = Math.hypot(...nz), z = nz.map(v => v / lz);
    const xr = [z[2], 0, -z[0]], lx = Math.hypot(...xr), x = xr.map(v => v / lx), y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const th = Math.tan(0.75 / 2), nx = (px / w) * 2 - 1 - shift.cx, ny = 1 - (py / h) * 2 - shift.cy, d = [0, 1, 2].map(i => x[i] * nx * th * (w / h) + y[i] * ny * th - z[i]), ld = Math.hypot(...d);
    for (let i = 0; i < 3; i++) d[i] /= ld;
    const at = t => [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t];
    let prev = 50;
    for (let t = 50; t < 30000; t += 25) {
      const [X, Y, Z] = at(t), g = groundIn(X, Z);
      if (g !== -Infinity && Y <= g) { let a = prev, b = t; for (let k = 0; k < 22; k++) { const m = (a + b) / 2, [mx, my, mz] = at(m); my <= groundIn(mx, mz) ? b = m : a = m; } const [rx, , rz] = at((a + b) / 2); return [rx, rz]; }
      prev = t;
    }
    return null;
  };
  const hold = on => { held = on; if (!on) redraw(); };
  const redraw = () => { if (!dirty) { dirty = true; requestAnimationFrame(draw); } };
  let onCam = null;      // told when the visitor moves the camera
  const clampCam = () => { cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az)); redraw(); if (onCam) onCam(); };
  const ptrs = new Map(); let pinch = 0;
  let camFly = 0;      // counts the camera flights: a touch of the picture ends the one running
  const flyCam = (to, ms) => {            // the camera to {az, el, dist, tx, tz} in ms milliseconds
    const from = {az: cam.az, el: cam.el, dist: cam.dist, tx: cam.tx, tz: cam.tz}, id = ++camFly, t0 = performance.now(), dAz = Math.atan2(Math.sin(to.az - from.az), Math.cos(to.az - from.az));
    const tick = now => { if (dead || id !== camFly) return; const u = Math.min(1, (now - t0) / ms), e = u * u * (3 - 2 * u), m = (p, q) => p + (q - p) * e;
      Object.assign(cam, {az: from.az + dAz * e, el: m(from.el, to.el), dist: m(from.dist, to.dist), tx: m(from.tx, to.tx), tz: m(from.tz, to.tz)}); clampCam(); if (u < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  canvas.onpointerdown = e => { camFly++; canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; };
  canvas.onpointermove = e => {
    const p = ptrs.get(e.pointerId); if (!p || pose) return;
    if (ptrs.size === 1 && FREE_CAM && ((e.buttons & 6) || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) {      // move the point the camera turns around over the ground
      const s = cam.dist * 0.0012, dx = (e.clientX - p[0]) * s, dy = (e.clientY - p[1]) * s, sa = Math.sin(cam.az), ca = Math.cos(cam.az);
      cam.tx = Math.min(HALF, Math.max(-HALF, cam.tx - dx * ca - dy * sa)); cam.tz = Math.min(BACK + 1200 * Math.min(SC, 2.5), Math.max(-up + 1200 * Math.min(SC, 2.5), cam.tz + dx * sa - dy * ca));
    } else if (ptrs.size === 1) { cam.az -= (e.clientX - p[0]) * 0.006; cam.el += (e.clientY - p[1]) * 0.005; }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist *= pinch / d; pinch = d; }
    clampCam();
  };
  canvas.oncontextmenu = e => { if (FREE_CAM) e.preventDefault(); };
  canvas.onpointerup = canvas.onpointercancel = e => { ptrs.delete(e.pointerId); pinch = 0; };
  canvas.onwheel = e => { e.preventDefault(); if (pose) return; cam.dist *= Math.exp(e.deltaY * 0.0012); clampCam(); };
  const ro = new ResizeObserver(redraw); ro.observe(canvas);
  draw();
  const setTexture = (c, unit = 0) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D); redraw(); };
  const setSpace = on => { space = !!on; redraw(); };
  const setSplit = (f, horizontal) => { split = f; hz = horizontal ? 1 : 0; redraw(); };
  let socketArgs = null;      // while the tongue is rebuilt a new year's surface (timelapse) is sunk the same way
  const setHeights = (h1, h2 = h1) => { if (socketArgs && h2 === h1) { cur = h1; return applySocket(); } fill(h1, h2); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, vd, gl.STATIC_DRAW); buildWalls(); redraw(); };      // another year's ice surface
  const setIce = f => { iceF = f; if (lastH) setHeights(lastH[0], lastH[1]); };
  const setBlock = (on, bed) => { if (bed !== undefined) bedA = bed || null; block = !!(on && bedA); gl.useProgram(pr); const k = block ? 1.3 : 1; gl.uniform3f(uBoxL, HALF * k, len / 2 * k, (BACK - up) / 2); if (lastH) setHeights(lastH[0], lastH[1]); else { buildWalls(); redraw(); } };      // the soft edge of the strip is stretched away while the sides are cut open
  const hash2 = (x, y) => { const q = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return q - Math.floor(q); };
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (hash2(xi, yi) * (1 - u) + hash2(xi + 1, yi) * u) * (1 - v) + (hash2(xi, yi + 1) * (1 - u) + hash2(xi + 1, yi + 1) * u) * v; };
  const setSocket = (mask, W2, H2, amp) => { socketArgs = [mask, W2, H2, amp]; applySocket(); };
  const LX = 64, LY = 144;      // the triangles of the rough surface: a lattice of about 60 m
  const applySocket = () => {      // the tongue's second heights while it is rebuilt: a rough surface of big flat triangles (the lattice corners lifted or dropped at random, a few metres to amp), softly at the edge of the tongue
    const [mask, W2, H2, amp] = socketArgs, w = new Float32Array((nA + 1) * W), tmp = new Float32Array((nA + 1) * W), hb = new Float32Array(cur.length), r = 2, node = new Float32Array((LX + 1) * (LY + 1));
    for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) w[j * W + i] = mask[(Math.min(H2 - 1, Math.round(j / nA * (H2 - 1))) * W2 + Math.min(W2 - 1, Math.round(i / nB * (W2 - 1)))) * 4] > 127 ? 1 : 0;
    for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) { let t = 0; for (let k = -r; k <= r; k++) t += w[j * W + Math.min(nB, Math.max(0, i + k))]; tmp[j * W + i] = t / (2 * r + 1); }
    for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) { let t = 0; for (let k = -r; k <= r; k++) t += tmp[Math.min(nA, Math.max(0, j + k)) * W + i]; w[j * W + i] = t / (2 * r + 1); }
    for (let y = 0; y <= LY; y++) for (let x = 0; x <= LX; x++) node[y * (LX + 1) + x] = cur[Math.round(y / LY * nA) * W + Math.round(x / LX * nB)] + amp * ((hash2(x, y) - 0.5) * 1.6 + (vnoise(x / 3, y / 3) - 0.5) * 1.2);
    for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) {
      const gx = i / nB * LX, gy = j / nA * LY, cx = Math.min(LX - 1, Math.floor(gx)), cy = Math.min(LY - 1, Math.floor(gy)), fx = gx - cx, fy = gy - cy, n = (x, y) => node[y * (LX + 1) + x], A = n(cx, cy), B = n(cx + 1, cy), C = n(cx, cy + 1), D = n(cx + 1, cy + 1);
      const q = j * W + i, rough = fx > fy ? A + (B - A) * fx + (D - B) * fy : A + (D - C) * fx + (C - A) * fy;      // the plane of the triangle the vertex lies in
      hb[q] = cur[q] + w[q] * (rough - cur[q]);
    }
    const h1 = cur; fill(h1, hb); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, vd, gl.STATIC_DRAW); redraw();
  };
  return {setCut: c => { const k = c ? [c.ax, c.az, c.ux, c.uz, c.L].map(v => v.toFixed(2)).join() : ''; if (k === cutKey) return; cutKey = k; cut = c; redraw(); }, setSpace, setSocket, clearSocket: () => { socketArgs = null; setHeights(cur); }, setBuild: v => { build = v; redraw(); }, setMask: c => { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.activeTexture(gl.TEXTURE0); redraw(); }, poseOf: c => { const keep = {...cam}; Object.assign(cam, c); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az)); const q = orbitPose(); Object.assign(cam, keep); return q; }, flyMix: (a, b, ep, eo) => { const dy = (((b.yaw - a.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, mp = (u, w) => u + (w - u) * ep, mo = (u, w) => u + (w - u) * eo; pose = {x: mp(a.x, b.x), y: mp(a.y, b.y), z: mp(a.z, b.z), yaw: a.yaw + dy * eo, pitch: mo(a.pitch, b.pitch), roll: 0, fovY: mo(a.fovY, b.fovY), view: null}; redraw(); }, endFlight: () => { pose = null; redraw(); }, setShift: (cx, cy) => { shift = {cx, cy}; redraw(); }, getShift: () => shift, setPose, hasPose: () => !!pose, zoomBy: f => { if (pose) return; cam.dist *= f; clampCam(); }, pick, setExag: v => { cam.exag = v; redraw(); }, getCam: () => ({az: cam.az, el: cam.el, dist: cam.dist, ...(cam.tx || cam.tz ? {tx: Math.round(cam.tx), tz: Math.round(cam.tz)} : {})}), setOnCam: f => { onCam = f; }, projectAt, groundY: (x, z) => groundNow(x, z), elev: (x, z) => groundNow(x, z) / cam.exag + h0, groundIn, getEye: eyeOf, exag: () => cam.exag, setCam: c => { Object.assign(cam, {tx: 0, tz: 0}, c); clampCam(); },
    focusLine: (f, ms = 1000) => {            // fly the camera to a section line: looking straight at it (from the side the camera is on, as far as the turn is allowed), the whole line across the picture
      if (pose) return;
      const k = 1200 * Math.min(SC, 2.5), a1 = Math.atan2(f.nx, f.nz), wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), a2 = a1 + Math.PI, near = Math.abs(wrap(a1 - cam.az)) <= Math.abs(wrap(a2 - cam.az)) ? a1 : a2;
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight), th = 2 * Math.tan(0.375), to = {az: Math.min(A, Math.max(-A, wrap(near))), el: Math.min(E1, Math.max(E0, 0.3)), dist: Math.min(D1, Math.max(D0, Math.max(f.L * 1.25 / (th * aspect), f.relief * cam.exag * 1.9 / th))), tx: f.x, tz: f.z + k};
      flyCam(to, ms);
    },
    flyCam: (c, ms = 1000) => flyCam({tx: 0, tz: 0, ...c}, ms), frame, hold, getSplit: () => ({split, hz}), setTexture, setSplit, setHeights, setIce, setBlock, destroy: () => { dead = true; ro.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onwheel = null;
    gl.deleteBuffer(vb); gl.deleteBuffer(ib); texs.forEach(t => gl.deleteTexture(t)); gl.deleteProgram(pr); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }};
}
export let v3dCtx = null, v3dBusy = false;      // v3dCtx: what the download buttons need from the open 3D view
export let v3dSplit = 0.5;      // v3dSplit: where the line between the two years sits (share of the width, or of the height when the images are stacked)
export function setSplit3D(f){
  v3dSplit = Math.min(0.97, Math.max(0.03, f));
  $('v3d').style.setProperty('--s', v3dSplit); $('v3dDiv').setAttribute('aria-valuenow', Math.round(v3dSplit * 100));
  if (v3d && v3dCtx && v3dCtx.cmp && !photoOn) v3d.setSplit(v3dSplit, v3dCtx.hz);
  if (photoOn) clipPhoto();
}
export function showDivider3D(cmp, hz){            // compare mode: a line on the picture with a handle to drag, and the two years beside it
  const d = $('v3dDiv'); d.classList.toggle('hz', hz); d.classList.toggle('used', sliderHintDone); d.hidden = false;
  $('v3d').classList.toggle('cmp-h', hz); $('v3d').classList.toggle('cmp-v', !hz);
  $('v3dLabA').textContent = cmp[0]; $('v3dLabB').textContent = cmp[1]; $('v3dLabA').hidden = $('v3dLabB').hidden = false;
  setSplit3D(v3dSplit);
}
export function hideDivider3D(){ clearPhotoLabels(); $('v3dDiv').hidden = $('v3dLabA').hidden = $('v3dLabB').hidden = true; $('v3d').classList.remove('cmp-h', 'cmp-v'); }
(() => {
  const d = $('v3dDiv'), at = e => { const r = $('v3dCanvas').getBoundingClientRect(); setSplit3D(v3dCtx && v3dCtx.hz && !photoOn ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width); };
  d.addEventListener('pointerdown', e => { d.setPointerCapture(e.pointerId); d.classList.add('used'); setSliderHintDone(true); $('handle').classList.add('used'); at(e); e.preventDefault(); });
  d.addEventListener('pointermove', e => { if (d.hasPointerCapture(e.pointerId)) at(e); });
  d.addEventListener('keydown', e => { const k = {ArrowLeft: -.03, ArrowUp: -.03, ArrowRight: .03, ArrowDown: .03}[e.key]; if (k) { setSplit3D(v3dSplit + k); d.classList.add('used'); setSliderHintDone(true); $('handle').classList.add('used'); e.preventDefault(); } });
})();
export let v3dRun = 0, v3dTerrain = null, v3dCamId = null;      // v3dTerrain: heights of the last glacier, kept so that switching mode or year does not fetch them again
export function setTitle3D(g, yearText, extra){            // the year tag of the 3D view, as on the map: the year(s) big, the glacier small under it (extra: what a special is, from the specials row)
  const t = $('v3dTitle'), sm = document.createElement('small'); t.textContent = yearText; sm.textContent = g.name; t.appendChild(sm);
  if (extra) { const ex = document.createElement('small'); ex.className = 'v3d-special'; ex.textContent = extra; t.appendChild(ex); }
}
export function sync3D(){            // the 3D view follows the left panel: another mode, year or colour style opens it again with the new choice
  if (document.getElementById('v3d').hidden) return;      // not $(): this runs during start-up, before $ exists
  clearTimeout(sync3D.t); sync3D.t = setTimeout(() => { if (!$('v3d').hidden) open3D(); }, 150);
}
export function close3D(){ v3dRun++; resetPhotos(); v3dCtx = null; hideDivider3D(); pinLoop(); if (v3d) { v3d.destroy(); v3d = null; } $('v3d').hidden = true; $('v3dCanvas').replaceWith($('v3dCanvas').cloneNode(false)); }      // a fresh canvas each time: a lost WebGL context cannot be reused
/* Base maps and the hiking trails on the picture of the strip: the tiles of the same servers as on the map, drawn one by one into the picture (kept, so another year or layer does not fetch them again) */
export const tileCache = new Map();
export const tileBitmap = url => {
  if (!tileCache.has(url)) { if (tileCache.size > 500) tileCache.clear(); tileCache.set(url, fetch(url).then(r => r.ok ? r.blob() : null).then(b => b ? createImageBitmap(b) : null).catch(() => null)); }
  return tileCache.get(url);
};
export const V3D_BASES = {
  aerialToggle: {max: 18, credit: '© swisstopo (SWISSIMAGE)', url: (z, x, y, yr) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage-product/default/${siYear(state.oldestAerial || yr)}/3857/${z}/${x}/${y}.jpeg`},      // the edition of the year the picture is made for, or the oldest one in the specials row's "Oldest"
  osmToggle: {max: 19, credit: '© OpenStreetMap contributors', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`},
  topoToggle: {max: 18, credit: '© swisstopo', url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`},
  altiToggle: {max: 18, credit: '© swisstopo (swissALTI3D)', url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissalti3d-reliefschattierung/default/current/3857/${z}/${x}/${y}.png`}
};
export const V3D_TRAILS = {max: 17, url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`};
/* what lies under the satellite picture, bottom first: one base map, then the aerial images (as on the map, where the aerial layer can be on beside a base map); "Oldest" shows the aerial image alone */
export const baseKeys = () => state.oldestAerial ? ['aerialToggle'] : [Object.keys(V3D_BASES).find(k => k !== 'aerialToggle' && $(k).checked), $('aerialToggle').checked && 'aerialToggle'].filter(Boolean);
export async function drawTiles(ctx, S, toTexM, def, wantZ, yr){
  const {WM} = V3D, HALF = S.half, corners = [[-S.back, -HALF], [-S.back, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b));
  const range = z => { const T = 2 * WM / 2 ** z, xs = corners.map(c => (c[0] + WM) / T), ys = corners.map(c => (WM - c[1]) / T); return {z, T, x0: Math.floor(Math.min(...xs)), x1: Math.floor(Math.max(...xs)), y0: Math.floor(Math.min(...ys)), y1: Math.floor(Math.max(...ys))}; };
  let R = range(Math.min(def.max, wantZ)); if ((R.x1 - R.x0 + 1) * (R.y1 - R.y0 + 1) > 90 && R.z > 13) R = range(R.z - 1);      // not too many tiles
  const jobs = []; for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) jobs.push(tileBitmap(def.url(R.z, x, y, yr)).then(bmp => ({x, y, bmp})));
  const tiles = await Promise.all(jobs);
  ctx.save(); ctx.imageSmoothingQuality = 'high';
  tiles.forEach(({x, y, bmp}) => {
    if (!bmp) return;
    const mx = x * R.T - WM, my = WM - y * R.T, p0 = toTexM(mx, my), p1 = toTexM(mx + R.T, my), p2 = toTexM(mx, my - R.T), k = 256 / bmp.width;
    ctx.setTransform((p1[0] - p0[0]) / 256 * k, (p1[1] - p0[1]) / 256 * k, (p2[0] - p0[0]) / 256 * k, (p2[1] - p0[1]) / 256 * k, p0[0], p0[1]); ctx.drawImage(bmp, 0, 0, bmp.width + 0.6, bmp.height + 0.6);
  });
  ctx.restore();
}
export async function detectTrails(c){            // is any hiking trail inside the strip? The trail tiles are drawn off screen over the strip and looked at: no trail, no menu item. Unknown (a tile did not load): the item stays.
  if (!FEATURES.swisstopo) { await ensureSight(); const d = trailsFor(c.g); c.hasTrails = !!d && [...d.paths, ...d.tracks].some(l => l.some(([la, lo]) => { const q = L.CRS.EPSG3857.project(L.latLng(la, lo)), [x, z] = (() => { const dx = (q.x - c.S.P.x) / c.S.k, dy = (q.y - c.S.P.y) / c.S.k; return [dx * c.S.un - dy * c.S.ue, dx * c.S.ue + dy * c.S.un]; })(); return Math.abs(x) < c.S.half && z > -c.S.back && z < c.S.up; })); if (c === v3dCtx) sync3DMenu(); return; }
  try {
    const HALF = c.S.half, TEX = c.S.tex, len = c.S.up + c.S.back, W = Math.round(TEX[0] / 2), H = Math.round(TEX[1] / 2), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const toTexM = (mx, my) => { const dx = (mx - c.S.P.x) / c.S.k, dy = (my - c.S.P.y) / c.S.k, a = dx * c.S.ue + dy * c.S.un, b = dx * c.S.un - dy * c.S.ue; return [(b + HALF) / (2 * HALF) * W, (c.S.up - a) / len * H]; };
    const ctx = cv.getContext('2d'); await drawTiles(ctx, c.S, toTexM, V3D_TRAILS, 15);
    const d = ctx.getImageData(0, 0, W, H).data; let seen = false; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { seen = true; break; }
    c.hasTrails = seen;
  } catch { c.hasTrails = undefined; }
  if (c === v3dCtx) sync3DMenu();
}
export const outline3D = g => hasOldOutline(g) && $('oldToggle').checked;      // the layers of the map, drawn on the picture of the 3D view
export const outlineNew3D = g => !!newOutlineGeom(g) && $('newToggle').checked;
export const radar3D = g => !!(g.inv && g.inv.radar) && $('radarToggle').checked;
export const layerCreditNames = g => [...baseKeys().map(k => ({osmToggle: 'OpenStreetMap', topoToggle: 'swisstopo', altiToggle: FEATURES.swisstopo ? 'swisstopo' : REGION.terrain.short.split(' · ')[0], aerialToggle: FEATURES.swisstopo ? 'swisstopo' : 'Náttúrufræðistofnun Íslands'}[k] || null)), $('trailsToggle').checked && (FEATURES.swisstopo ? 'swisstopo' : 'OpenStreetMap'), (outline3D(g) || outlineNew3D(g) || radar3D(g)) && (FEATURES.swisstopo ? 'GLAMOS' : REGION.outlines.credit), $('l3Names').checked && (FEATURES.swisstopo ? 'swisstopo' : 'OpenStreetMap'), sectBedOn() && 'swissBEDROCK, Federal Office of Topography swisstopo'].filter(Boolean);
export const layersCredit = g => layerCreditNames(g).join(' · ');
export const layersCreditText = g => { const t = layersCredit(g); return t ? ` Layers: ${t}.` : ''; };      // the sentence in the full note under the 3D view
/* The 3D view needs only the strip, which is a small part of the glacier area (Aletsch: about a twelfth): it asks the relay for a picture of just the box around the strip, at the same 10 m pixels.
   The box is cut in whole 10 m steps from the geometry of the strip (the baked file), so every visitor asks for exactly the same picture and the relay's cache serves it. If the whole-glacier
   picture is already here (the map shows it) it is used instead; if a strip picture cannot be had, the whole one is used and no more strips are tried in this visit. */
export function stripImageSpec(S){
  const HALF = S.half, cs = [[-S.back, -HALF], [-S.back, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b)), pad = 60, step = 10;
  const x0 = Math.floor((Math.min(...cs.map(c => c[0])) - pad) / step) * step, x1 = Math.ceil((Math.max(...cs.map(c => c[0])) + pad) / step) * step;
  const y0 = Math.floor((Math.min(...cs.map(c => c[1])) - pad) / step) * step, y1 = Math.ceil((Math.max(...cs.map(c => c[1])) + pad) / step) * step, scale = 1 / Math.cos(Math.atan(Math.sinh(S.P.y / 6378137)));      // Mercator metres per ground metre
  return {bbox: [x0, y0, x1, y1], w: Math.min(CDSE.maxPx, Math.round((x1 - x0) / (CDSE.groundRes * scale))), h: Math.min(CDSE.maxPx, Math.round((y1 - y0) / (CDSE.groundRes * scale)))};
}
export async function currentBundle(g, at){      // the baked file of a glacier only while it holds the strip of the record; a stale file (or a strip being drawn in the walkthrough) gives null, and the view is then drawn quickly from the terrain tiles
  const b = await loadBundle(bundleId(g)); if (!b) return null;
  const S = stripFor(g, at), same = (x, y, tol) => Math.abs(x - y) <= tol;
  return same(b.P[0], S.P.x, 1e-3) && same(b.P[1], S.P.y, 1e-3) && same(b.ue, S.ue, 1e-9) && same(b.un, S.un, 1e-9) && same(b.up, S.up, 1e-6) && b.back === S.back && (b.half || V3D.HALF) === S.half ? b : null;
}
export async function stripSpecFor(g){ const at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue, b = await currentBundle(g, at); return stripImageSpec(b ? stripOf(b, g) : stripFor(g, at)); }
export const loadStripPicture = async (g, yr) => loadImage(g, yr, await stripSpecFor(g));      // used by tools/warm-up.html to fill the relay's cache
export let stripPicturesOff = false;
export const oldestBitmaps = new Map();
export async function drawOldestImage(ctx, g, toTexM){            // Iceland: the oldest aerial picture (one file in Web Mercator) onto the texture of the strip
  const o = oldestAerial.get(g.id); if (!o || !o.img) return;
  if (!oldestBitmaps.has(o.img)) oldestBitmaps.set(o.img, fetch(o.img).then(r => r.blob()).then(b => createImageBitmap(b)));
  const bmp = await oldestBitmaps.get(o.img), [x0, y0, x1, y1] = o.bbox, p0 = toTexM(x0, y1), p1 = toTexM(x1, y1), p2 = toTexM(x0, y0);
  ctx.save(); ctx.setTransform((p1[0] - p0[0]) / bmp.width, (p1[1] - p0[1]) / bmp.width, (p2[0] - p0[0]) / bmp.height, (p2[1] - p0[1]) / bmp.height, p0[0], p0[1]); ctx.drawImage(bmp, 0, 0); ctx.restore();
}
export function drawHillshade(ctx, S, h, nA, nB, TEX){            // a base map made from the heights of the shown year: light from the upper left of the picture, flat ground mid grey
  const W = nB + 1, H = nA + 1, dx = 2 * S.half / nB, dy = (S.up + S.back) / nA, c = document.createElement('canvas'); c.width = W; c.height = H;
  const im = new ImageData(W, H), px = im.data, z = (i, j) => h[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const zx = (z(i + 1, j) - z(i - 1, j)) / (2 * dx), zy = (z(i, j + 1) - z(i, j - 1)) / (2 * dy), s = (0.5 * zx - 0.5 * zy + 0.7071) / Math.sqrt(1 + zx * zx + zy * zy), v = Math.max(0, Math.min(255, 255 * s * 0.8)), k = 4 * (j * W + i);
    px[k] = px[k + 1] = px[k + 2] = v; px[k + 3] = 255;
  }
  c.getContext('2d').putImageData(im, 0, 0); ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c, 0, 0, TEX[0], TEX[1]); ctx.restore();
}
export async function strip3DTexture(g, S, yr, nA, nB, hillH){            // the satellite picture of a year, turned so that up the glacier is up, as the texture of the strip
  if ($('trailsToggle').checked) await ensureSight();
  const HALF = S.half, TEX = S.tex, len = S.up + S.back; let bb = imageFootprint(g).bbox, u = null;
  const noSat = !satOn();      // the picture is switched off in the layer menu: no image is fetched, the terrain shows the base map (or the dark ground) alone
  if (!noSat && !stripPicturesOff && !imageHere(g, yr)) { try { const sp = stripImageSpec(S); u = await loadImage(g, yr, sp); bb = sp.bbox; } catch (e) { stripPicturesOff = true; console.warn('The strip picture could not be had, the whole one is used:', e); } }
  if (!u && !noSat) u = await loadImage(g, yr);
  const bmp = noSat ? await createImageBitmap(new ImageData(1, 1)) : await createImageBitmap(await (await fetch(await adjustedUrl(u, brightness(), 1, g))).blob());
  const tc = document.createElement('canvas'); tc.width = TEX[0]; tc.height = TEX[1];
  const kx = bmp.width / (bb[2] - bb[0]), ky = bmp.height / (bb[3] - bb[1]), ctx = tc.getContext('2d');
  const toTexM = (mx, my) => { const dx = (mx - S.P.x) / S.k, dy = (my - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue; return [(b + HALF) / (2 * HALF) * TEX[0], (S.up - a) / len * TEX[1]]; };
  const toTex = (ix, iy) => toTexM(bb[0] + ix / kx, bb[3] - iy / ky);
  const p0 = toTex(0, 0), p1 = toTex(1, 0), p2 = toTex(0, 1);
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, TEX[0], TEX[1]); ctx.imageSmoothingQuality = 'high';
  for (const k of baseKeys()) { if (!FEATURES.swisstopo && k === 'altiToggle') { const hh = hillH && hillH(yr); if (hh) drawHillshade(ctx, S, hh, nA, nB, TEX); } else if (!FEATURES.swisstopo && k === 'aerialToggle') await drawOldestImage(ctx, g, toTexM); else await drawTiles(ctx, S, toTexM, V3D_BASES[k], k === 'aerialToggle' ? 16 : 15, yr); }      // under the satellite picture, which shows it through where it is not opaque
  const imgM = [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]], oa = outsideAlpha(), ia = noSat ? 0 : imgOpacity(), og = outlineGeom(g);
  if (LAKE_GLACIERS.has(g.id) && !noSat && state.style === 'natural' && !lakeMasks.has(g.id + '|' + yr)) {      // the water of this year, from the plain picture (before layers and opacity change its colours)
    const mw = TEX[0] / 2, mh = TEX[1] / 2, mc = document.createElement('canvas'); mc.width = mw; mc.height = mh; const mx = mc.getContext('2d', {willReadFrequently: true});
    mx.setTransform(imgM[0] / 2, imgM[1] / 2, imgM[2] / 2, imgM[3] / 2, imgM[4] / 2, imgM[5] / 2); mx.drawImage(bmp, 0, 0);
    lakeMasks.set(g.id + '|' + yr, lakeMaskFrom(mx, mw, mh, nA, nB));
  }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (og && oa < 0.99) {            // surroundings opacity: the picture outside the 1850 outline is made fainter (the base map or empty space shows), inside it stays as it is
    ctx.globalAlpha = ia * oa; ctx.setTransform(...imgM); ctx.drawImage(bmp, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.save(); ctx.beginPath();
    og.coordinates.forEach(poly => poly.forEach(ring => { ring.forEach((pt, i) => { const q = L.CRS.EPSG3857.project(L.latLng(pt[1], pt[0])), [x, y] = toTexM(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }));
    ctx.clip(); ctx.globalAlpha = ia; ctx.setTransform(...imgM); ctx.drawImage(bmp, 0, 0); ctx.restore();
  } else { ctx.globalAlpha = ia; ctx.setTransform(...imgM); ctx.drawImage(bmp, 0, 0); }
  ctx.imageSmoothingEnabled = true; if (bmp.close) bmp.close(); ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sight = $('trailsToggle').checked && sightFor(g);
  if (sight) {            // where the tongue is in view from the trail, under the trail lines
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [['rgba(255,255,255,.85)', 14], ['rgba(123,44,255,.9)', 8]].forEach(([color, w]) => { ctx.strokeStyle = color; ctx.lineWidth = w; sight.lines.forEach(l => { ctx.beginPath(); l.forEach(([lat, lng], i) => { const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), [x, y] = toTexM(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }); });
    ctx.restore();
  }
  if ($('trailsToggle').checked) {
    if (FEATURES.swisstopo) await drawTiles(ctx, S, toTexM, V3D_TRAILS, 15);
    else { const d = trailsFor(g); if (d) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = ctx.lineCap = 'round';      // Iceland: the paths are lines, not tiles
      const draw = (list, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; list.forEach(l => { ctx.beginPath(); l.forEach(([lat, lng], i) => { const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), [x, y] = toTexM(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }); };
      draw(d.tracks, 'rgba(0,0,0,.55)', 6); draw(d.paths, 'rgba(0,0,0,.55)', 7); draw(d.tracks, '#FF3B30', 3.5); draw(d.paths, '#FDC200', 4.5); ctx.restore(); } }
  }
  const toXY = ll => { const q = L.CRS.EPSG3857.project(L.latLng(ll[1], ll[0])); return toTexM(q.x, q.y); };
  const rings = (geom, color, dash) => {            // an outline, drawn on the picture so that it follows the terrain
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 3.5; ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
    eachPiece(geom, (ring, closed) => { ctx.beginPath(); ring.forEach((pt, i) => { const [x, y] = toXY(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (closed) ctx.closePath(); ctx.stroke(); });
    ctx.restore();
  };
  if (outlineNew3D(g)) rings(newOutlineGeom(g), getVar('--new'), []);
  if (outline3D(g)) rings(oldOutlineGeom(g), '#F2A93B', [14, 9]);
  return tc;
}
/* Ice surface of the year: demchange.js (made by scripts/build_dem_change.py) holds the change between two editions of swissALTI3D inside the glacier outline.
   The surface of a year is the newer edition (what the terrain tiles show) minus that change times a share f: 0 at the survey year of the newer edition, 1 at that of the
   older one, in between and beyond following the yearly mass balance (own series where GLAMOS measures it, else the Swiss-wide one). The survey years are assumptions, stored in the file. */
export let v3dDem = null; const demFiles = new Map();
export const loadDemChange = id => { if (!demFiles.has(id)) demFiles.set(id, fetch(asset(`data/demchange/${id}.json`)).then(r => r.ok ? r.json() : null).catch(() => null)); return demFiles.get(id); };      // one small file per glacier, if there is one
export async function iceChangeGrid(g, S, nA, nB){            // the change (m) at every vertex of the strip, or null when this glacier has no data
  const d = g.inv && g.inv.id ? await loadDemChange(g.inv.id) : null; if (!d) return null;
  if (!v3dDem || v3dDem.id !== g.inv.id) {
    const bin = Uint8Array.from(atob(d.z), c => c.charCodeAt(0));
    v3dDem = {id: g.inv.id, z: new Int16Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())};
  }
  const z = v3dDem.z, at = (ci, cj) => ci < 0 || cj < 0 || ci >= d.w || cj >= d.h ? 0 : z[cj * d.w + ci] / 100, R = 6378137, out = new Float32Array((nA + 1) * (nB + 1)), HALF = S.half, BACK = S.back;
  for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) {
    const [mx, my] = S.merc(S.up - j * (S.up + BACK) / nA, -HALF + i * 2 * HALF / nB), [E, N] = lv95(mx / R * 180 / Math.PI, (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI);      // lv95 (section 1) takes longitude first
    const fx = (E - d.e0) / d.cell - 0.5, fy = (N - d.n0) / d.cell - 0.5, ci = Math.floor(fx), cj = Math.floor(fy), ax = fx - ci, ay = fy - cj;
    out[j * (nB + 1) + i] = (at(ci, cj) * (1 - ax) + at(ci + 1, cj) * ax) * (1 - ay) + (at(ci, cj + 1) * (1 - ax) + at(ci + 1, cj + 1) * ax) * ay;
  }
  return {delta: out, old: d.old, new: d.new};
}
export function iceShare(g, dem, y){            // f for a year, see above; null when no balance series covers the survey period
  const t0 = dem.old.year, t1 = dem.new.year, swiss = new Map((DATA && DATA.swiss_balance) || []), own = g.inv && g.inv.balance ? new Map(g.inv.balance) : null;
  let useOwn = !!own; for (let t = t0 + 1; t <= t1 && useOwn; t++) if (!own.has(t)) useOwn = false;
  const loss = t => { const b = useOwn && own.has(t) ? own.get(t) : swiss.get(t); return b === undefined ? 0 : -b / 1000; };      // m w.e.; a year without a balance counts as 0
  let den = 0; for (let t = t0 + 1; t <= t1; t++) den += loss(t);
  if (!(den > 0)) return null;
  let num = 0; if (y <= t1) for (let t = y + 1; t <= t1; t++) num += loss(t); else for (let t = t1 + 1; t <= y; t++) num -= loss(t);
  return num / den;
}
/* Lakes in front of the glacier. The terrain model often holds an older, smaller lake as a flat surface, while the lake has grown since: the new part lies over lower ground (a bowl) and the water would be draped over it.
   Where the satellite picture of the year shows water, the terrain is set to the level of the lake: the flat surface the model already has inside it (a plateau: at least a third of the water vertices within 0.4 m of each other).
   A lake without such a level (on the ice, against an ice front, where the water level is not known from the model) is left as it is. The water is found by its colour in the natural-colour picture (turquoise: green and
   blue clearly above red, bluer shadows and grey rock, ice and snow do not count) and has to be some width (not a stream or a line of shade). Only for the glaciers listed here (checked by eye); a lake that grows shows up
   year by year, because every year's picture gets its own mask. */
export const LAKE_GLACIERS = new Set(['rhone', 'sgi-B56-03', 'zmutt']);      // Rhone, Findel (sgi-B56-03), Zmutt
export const lakeMasks = new Map();      // "<glacier>|<year>" -> Uint8Array on the grid of the strip: 1 where the picture shows water
export const isWaterRGB = (r, g, b) => { const v = (r + g + b) / 3; return v >= 70 && v <= 200 && g - r >= 15 && b - r >= 12 && Math.abs(b - g) <= 12; };      // measured: the Rhone lake (106,141,134), the pale Zmutt lake (153,176,172); shadows are dark and bluer than green, rock, ice and snow have green at or below red
export function lakeMaskFrom(ctx, W, H, nA, nB){            // ctx holds the satellite picture in the frame of the texture (W x H); a vertex counts as water when most of the 3 x 3 pixels around it do
  const px = ctx.getImageData(0, 0, W, H).data, out = new Uint8Array((nA + 1) * (nB + 1));
  for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) {
    const cx = Math.round(i / nB * (W - 1)), cy = Math.round(j / nA * (H - 1)); let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = Math.min(W - 1, Math.max(0, cx + dx)), y = Math.min(H - 1, Math.max(0, cy + dy)), k = (y * W + x) * 4; if (px[k + 3] > 200 && isWaterRGB(px[k], px[k + 1], px[k + 2])) n++; }
    out[j * (nB + 1) + i] = n >= 5 ? 1 : 0;
  }
  return out;
}
export function flattenLakes(heights, mask, nA, nB, base){            // a copy of the heights with every lake set to its level; the same array when there is none. base: the terrain model without the ice change of a year, where the lake levels are read (the newest edition holds the lakes as they are)
  const n = nB + 1, N = (nA + 1) * n, core = new Uint8Array(N);      // core: water all round (a 3 x 3 block): a lake has some width, a stream or a line of shade does not
  for (let j = 1; j <= nA - 1; j++) for (let i = 1; i <= nB - 1; i++) { let all = 1; for (let dj = -1; dj <= 1 && all; dj++) for (let di = -1; di <= 1; di++) if (!mask[(j + dj) * n + i + di]) { all = 0; break; } core[j * n + i] = all; }
  const seen = new Uint8Array(N); let out = null;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp = [], stack = [s]; seen[s] = 1; let solid = 0;
    while (stack.length) {
      const k = stack.pop(); comp.push(k); solid += core[k]; const i = k % n, j = (k - i) / n;
      for (const [ok, nk] of [[i > 0, k - 1], [i < nB, k + 1], [j > 0, k - n], [j < nA, k + n]]) if (ok && mask[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
    }
    if (comp.length < 20 || solid < 3) continue;
    const lv = base || heights;      // the level comes from the model itself, not from a surface the ice change has moved
    const bins = new Map(); comp.forEach(k => { const b = Math.round(lv[k] / 0.4); bins.set(b, (bins.get(b) || 0) + 1); });
    let best = 0, bestN = 0; bins.forEach((c, b) => { const t = c + (bins.get(b - 1) || 0) + (bins.get(b + 1) || 0); if (t > bestN) { bestN = t; best = b; } });
    if (bestN < Math.max(20, comp.length / 3)) continue;      // no flat level in the model: not touched
    let sum = 0, cnt = 0; comp.forEach(k => { if (Math.abs(lv[k] / 0.4 - best) <= 1.5) { sum += lv[k]; cnt++; } });
    const level = sum / cnt;
    comp.forEach(k => { if (Math.abs(heights[k] - level) <= 40 && heights[k] !== level) { if (!out) out = Float32Array.from(heights); out[k] = level; } });
    let front = comp.slice(); for (let step = 0; step < 4 && front.length; step++) {      // water has no lower land beside it: a pocket next to the lake (a turbid shore, the ice front) is filled to the level, a few vertices deep at most
      const next = []; front.forEach(k => { const i = k % n, j = (k - i) / n; for (const [ok, nk] of [[i > 0, k - 1], [i < nB, k + 1], [j > 0, k - n], [j < nA, k + n]]) if (ok && !mask[nk] && !seen[nk] && heights[nk] < level && level - heights[nk] <= 25) { if (!out) out = Float32Array.from(heights); out[nk] = level; seen[nk] = 1; next.push(nk); } });
      front = next;
    }
  }
  return out || heights;
}
export const lakeFlat = (g, heights, y, nA, nB, base) => { const mk = LAKE_GLACIERS.has(g.id) && lakeMasks.get(g.id + '|' + y); return mk ? flattenLakes(heights, mk, nA, nB, base) : heights; };
export const surfaceFor = (g, heights, dem, y) => { const f = dem && iceShare(g, dem, y); if (!f && f !== 0) return heights; const h = new Float32Array(heights.length); for (let k = 0; k < h.length; k++) h[k] = heights[k] - dem.delta[k] * f; return h; };
/* The baked file of a glacier (data/terrain/<id>.<hash>.bin, made by scripts/build_terrain_bundle.py): the heights, the ice change, the peak names and the radar pins of the strip in one small
   file, instead of nine or so terrain tiles, a change file and two more requests for every visitor. The manifest says which file is current (asked for fresh, it is tiny); the file
   itself stays in the browser until the manifest names another. Without a file the page builds all of it from the terrain tiles, as before. */
export let terrainManifest = null; const bundles = new Map();
export const loadManifest = () => terrainManifest || (terrainManifest = fetch(siteFile('data/terrain/manifest.json'), {cache: 'no-cache'}).then(r => r.ok ? r.json() : {}).catch(() => ({})));
export async function parseBundle(buf){
  const dv = new DataView(buf); if (dv.getUint32(0, false) !== 0x54465331) throw new Error('not a terrain file');      // "TFS1"
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const all = new Int16Array(await new Response(new Blob([new Uint8Array(buf, 8 + hl)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const W = head.nB + 1, n = (head.nA + 1) * W, undo = (off, scale, add) => {            // rows are stored as differences: add them up again
    const out = new Float32Array(n); for (let j = 0; j <= head.nA; j++) { let acc = 0; for (let i = 0; i < W; i++) { acc = (acc + all[off + j * W + i]) << 16 >> 16; out[j * W + i] = acc * scale + add; } } return out; };
  let off = n; const delta = head.dem ? undo(off, 0.01, 0) : null; if (head.dem) off += n;
  const surfaces = head.yearly ? new Map(head.yearly.years.map((y, i) => [y, undo(off + i * n, 0.1, head.h0)])) : null;      // Iceland: the surface of every year (scripts/build_dem_iceland.py)
  if (head.yearly) off += n * head.yearly.years.length;
  const bed = head.bed ? undo(off, 0.1, head.h0) : null;      // Switzerland: the bedrock elevation (swissBEDROCK), m above sea level like the heights
  return {...head, heights: undo(0, 0.1, head.h0), delta, surfaces, bed};
}
export function loadBundle(id){            // the parsed file of a glacier, or null (no file, no network, a broken file): the caller then falls back to the terrain tiles
  if (!id) return Promise.resolve(null);
  if (!bundles.has(id)) bundles.set(id, (async () => {
    const name = (await loadManifest())[id]; if (!name) return null;
    const rec = await idb.get('terrain|' + id);
    if (rec && rec.name === name && rec.buf) { try { return await parseBundle(rec.buf); } catch (e) { console.error('terrain file in the cache is broken, loading it again', e); } }
    const r = await fetch(siteFile('data/terrain/' + name)); if (!r.ok) return null;
    const buf = await r.arrayBuffer(), b = await parseBundle(buf); idb.set('terrain|' + id, {name, buf}); return b;
  })().catch(e => { console.error('terrain file', e); bundles.delete(id); return null; }));
  return bundles.get(id);
}
export const stripOf = (b, g) => ({P: {x: b.P[0], y: b.P[1]}, k: b.k, ue: b.ue, un: b.un, up: b.up, back: b.back, dist: (V3D_VIEW[bundleId(g)] || {}).dist || 1, cam: (V3D_VIEW[bundleId(g)] || g.view3d || {}).cam || (boxRecord(bundleId(g), g.name).strip3d || {}).cam || null, half: b.half || V3D.HALF, tex: b.tex || V3D.TEX,
  merc: (a, c) => [b.P[0] + (a * b.ue + c * b.un) * b.k, b.P[1] + (a * b.un - c * b.ue) * b.k]});      // the strip as the file was made: the same as stripFor() finds
export function coarseBundle(b){            // every second point: the 28 m grid for devices that cannot draw the fine one
  const nA = b.nA / 2, nB = b.nB / 2, W = b.nB + 1, W2 = nB + 1, pick = a => { if (!a) return null; const o = new Float32Array((nA + 1) * W2); for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) o[j * W2 + i] = a[2 * j * W + 2 * i]; return o; };
  return {...b, nA, nB, heights: pick(b.heights), delta: pick(b.delta), bed: pick(b.bed), surfaces: b.surfaces ? new Map([...b.surfaces].map(([y, a]) => [y, pick(a)])) : null};
}
/* The note at the bottom of the 3D view: in full on bigger screens; on phones one short line (what the picture is made of) with "Details" for the rest */
export const shortLayerNames = g => layerCreditNames(g).filter(n => n !== 'swisstopo').map(n => ' · ' + n).join('');
export const KIND_TEXT_CH = {measured: 'a swisstopo survey of that year', interpolated: 'interpolated between two surveys with the GLAMOS mass balance', extrapolated: 'extrapolated beyond a survey with the GLAMOS mass balance', estimate: 'a provisional estimate (see science mode)'};
export const KIND_TEXT = {measured: 'measured (a summer strip within 45 days)', interpolated: 'interpolated between the strips before and after it', held: 'the surface of the nearest strip, unchanged (before the first or after the last)'};
export const yearNote = yr => { const b = v3dCtx && v3dCtx.bundle; if(!(b && b.yearly)) return ''; const y = Math.min(Math.max(yr, b.yearly.years[0]), b.yearly.years[b.yearly.years.length - 1]), est = (b.yearly.estimated || {})[y] || 0; return ` The ice surface of ${yr} is ${(b.yearly.swiss ? KIND_TEXT_CH : KIND_TEXT)[b.yearly.kind[b.yearly.years.indexOf(y)]] || 'estimated'}.${est >= 0.005 ? ' About ' + Math.round(100 * est) + ' % of the strip (ice no recent strip covers) is estimated from the thinning measured around it.' : ''}`; };      // Iceland: how this year's surface was found
/* ---- Ice off (Layers: Bedrock > Ice cover): the bed with a rock look ----
   Where the ice stood, the picture of the year shows ice; with the ice off the surface is the modelled bed, so those pixels are painted from the picture's own ice-free ground around them
   (colour: the local average of the rock and vegetation pixels, snow left out, smoothed over wide blocks so it has no patches) lit by the relief of the bed itself, with a little fine noise.
   Basins of the bed (a hollow with no way out over the strip, found by filling the bed like a bowl) get a small lake. A drawing on a COPY of the picture, never of the picture itself, shown only
   with the ice off; its colours and its lakes are modelled, not measured (the field notes say so). */
const rockHash = (x, y) => { const q = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return q - Math.floor(q); };
const rockNoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (rockHash(xi, yi) * (1 - u) + rockHash(xi + 1, yi) * u) * (1 - v) + (rockHash(xi, yi + 1) * (1 - u) + rockHash(xi + 1, yi + 1) * u) * v; };
const basinCache = new WeakMap();
function bedBasins(bed, nA, nB){      // depth of water in each hollow of the bed (m): fill from the edges of the strip upwards (priority flood), keep hollows of some size and depth
  if (basinCache.has(bed)) return basinCache.get(bed);
  const G = nB + 1, N = (nA + 1) * G, fill = new Float32Array(N).fill(Infinity), done = new Uint8Array(N), hp = [];
  const push = k => { hp.push(k); let i = hp.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (fill[hp[q]] <= fill[hp[i]]) break; [hp[q], hp[i]] = [hp[i], hp[q]]; i = q; } };
  const pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < hp.length && fill[hp[l]] < fill[hp[m]]) m = l; if (r < hp.length && fill[hp[r]] < fill[hp[m]]) m = r; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return top; };
  for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) if (j === 0 || i === 0 || j === nA || i === nB) { const k = j * G + i; fill[k] = bed[k]; done[k] = 1; push(k); }
  while (hp.length) { const k = pop(), j = (k / G) | 0, i = k - j * G; for (const [dj, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jj = j + dj, ii = i + di; if (jj < 0 || ii < 0 || jj > nA || ii > nB) continue; const q = jj * G + ii; if (done[q]) continue; done[q] = 1; fill[q] = Math.max(bed[q], fill[k]); push(q); } }
  const depth = new Float32Array(N), lab = new Uint8Array(N); for (let k = 0; k < N; k++) depth[k] = fill[k] - bed[k] > 1.5 ? fill[k] - bed[k] : 0;
  for (let k0 = 0; k0 < N; k0++) { if (!depth[k0] || lab[k0]) continue; const comp = [k0]; lab[k0] = 1; let mx = 0;      // drop pits of the model: a hollow needs a few cells and a depth of 3 m
    for (let n = 0; n < comp.length; n++) { const k = comp[n]; mx = Math.max(mx, depth[k]); const j = (k / G) | 0, i = k - j * G; for (const [dj, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jj = j + dj, ii = i + di; if (jj < 0 || ii < 0 || jj > nA || ii > nB) continue; const q = jj * G + ii; if (depth[q] && !lab[q]) { lab[q] = 1; comp.push(q); } } }
    if (comp.length < 10 || mx < 3) for (const k of comp) depth[k] = 0; }
  basinCache.set(bed, depth); return depth;
}
export function rockLook(src, surf, bed, nA, nB, cellM){
  const W = src.width, H = src.height, G = nB + 1, ctx = src.getContext('2d', {willReadFrequently: true}), img = ctx.getImageData(0, 0, W, H), d = img.data, BS = 48, bw = Math.ceil(W / BS), bh = Math.ceil(H / BS), cm = cellM || 10;
  const grid = (a, x, y) => { const fx = Math.min(nB - 1e-6, x / (W - 1) * nB), fy = Math.min(nA - 1e-6, y / (H - 1) * nA), i = fx | 0, j = fy | 0, ax = fx - i, ay = fy - j, k = j * G + i; return (a[k] * (1 - ax) + a[k + 1] * ax) * (1 - ay) + (a[k + G] * (1 - ax) + a[k + G + 1] * ax) * ay; };
  const thick = new Float32Array(surf.length); for (let k = 0; k < thick.length; k++) thick[k] = Math.max(0, surf[k] - bed[k]);
  const shade = new Float32Array(bed.length); for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) { const k = j * G + i, i0 = Math.max(0, i - 1), i1 = Math.min(nB, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nA, j + 1), gx = (bed[j * G + i1] - bed[j * G + i0]) / ((i1 - i0) * cm), gy = (bed[j1 * G + i] - bed[j0 * G + i]) / ((j1 - j0) * cm);
    shade[k] = Math.max(0, (0.55 * gx + 0.55 * gy + 0.63) / Math.sqrt(gx * gx + gy * gy + 1)); }      // light from the upper left, 45 degrees high
  const water = bedBasins(bed, nA, nB);
  const th = new Float32Array(W * H), sum = new Float64Array(bw * bh * 4);      // thickness per pixel; per block: r, g, b sums and the count of ground pixels
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, t = grid(thick, x, y); th[p] = t; if (t > 0.3) continue;
    const r = d[p * 4], g = d[p * 4 + 1], b = d[p * 4 + 2]; if (d[p * 4 + 3] < 250 || Math.min(r, g, b) > 185 || r + g + b < 60) continue;      // snow, bright ice, no data and deep shadow are not rock
    const k = ((y / BS | 0) * bw + (x / BS | 0)) * 4; sum[k] += r; sum[k + 1] += g; sum[k + 2] += b; sum[k + 3]++;
  }
  const col = new Float32Array(bw * bh * 3).fill(-1), def = [108, 95, 84];
  for (let k = 0; k < bw * bh; k++) if (sum[k * 4 + 3] >= 12) for (let c = 0; c < 3; c++) col[k * 3 + c] = sum[k * 4 + c] / sum[k * 4 + 3];
  for (let pass = 0; pass < 60; pass++) { let left = 0; const nx = col.slice(); for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { const k = by * bw + bx; if (col[k * 3] >= 0) continue;
    let a = [0, 0, 0], n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= bw || y >= bh) continue; const q = (y * bw + x) * 3; if (col[q] >= 0) { a[0] += col[q]; a[1] += col[q + 1]; a[2] += col[q + 2]; n++; } }
    if (n) for (let c = 0; c < 3; c++) nx[k * 3 + c] = a[c] / n; else left++; } col.set(nx); if (!left) break; }
  for (let k = 0; k < col.length; k++) if (col[k] < 0) col[k] = def[k % 3];
  for (let pass = 0; pass < 6; pass++) { const nx = col.slice(); for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) for (let c = 0; c < 3; c++) { let a = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= bw || y >= bh) continue; a += col[(y * bw + x) * 3 + c]; n++; } nx[(by * bw + bx) * 3 + c] = a / n; } col.set(nx); }      // wide smoothing: the colour changes slowly, no patches
  const at = (x, y, c) => { const fx = Math.min(bw - 1, Math.max(0, x / BS - 0.5)), fy = Math.min(bh - 1, Math.max(0, y / BS - 0.5)), i = Math.min(bw - 2, fx | 0), j = Math.min(bh - 2, fy | 0), ax = fx - i, ay = fy - j, q = (jj, ii) => col[(jj * bw + ii) * 3 + c];
    return (q(j, i) * (1 - ax) + q(j, i + 1) * ax) * (1 - ay) + (q(j + 1, i) * (1 - ax) + q(j + 1, i + 1) * ax) * ay; };
  const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, t = th[p]; if (t <= 0.3) continue; const w = sm(0.3, 6, t), n = rockNoise(x * 0.05, y * 0.05) * 0.6 + rockNoise(x * 0.4, y * 0.4) * 0.4, f = 0.55 + 0.9 * grid(shade, x, y) + 0.12 * (n - 0.5);
    const wd = grid(water, x, y), lk = sm(0.8, 2.5, wd) * w, dk = Math.min(1, wd / 12);      // lake: shallow green-grey to deep blue-grey
    for (let c = 0; c < 3; c++) { const rock = at(x, y, c) * f, lake = [118 - 62 * dk, 150 - 66 * dk, 150 - 40 * dk][c] * (0.9 + 0.2 * grid(shade, x, y)); d[p * 4 + c] = Math.max(0, Math.min(255, (d[p * 4 + c] * (1 - w) + rock * w) * (1 - lk) + lake * lk)); }
  }
  const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').putImageData(img, 0, 0); return out;
}

/* ---- Scientific field notes (the pill in the 3D top bar) ----
   The pill is a link to provenance.html, which holds everything about how the view was made (pictures, terrain, ice surface, measured surfaces, checks, licences). The link carries the page
   to come back to and the year on screen. */
export function updateSciPanel(yr){
  const c = v3dCtx, y = yr || (c && ((c.current && c.current()) || (c.cmp && c.cmp[1]))) || '';
  $('v3dSci').href = `/provenance.html?${y ? `year=${y}&` : ''}back=${encodeURIComponent(location.href)}`;
}
document.documentElement.classList.remove('science');

export function note3DHtml(g, picture, when, usesDem, terrainNote, oldNote){
  const noSat = !satOn(), old = state.oldestAerial && oldestAerial.get(g.id); if (noSat) picture = old ? `Picture: ${FEATURES.swisstopo ? `swisstopo aerial image flown ${old.flown} (SWISSIMAGE edition ${old.ed})` : oldestWhat(old)}. ` : 'No satellite picture is shown. ';
  const full = `Terrain: ${terrainHtml(v3dCtx)}. ${picture}${terrainNote}${oldNote ? ' ' + oldNote.full : ''}<span id="v3dLc">${layersCreditText(g)}</span> <button type="button" class="n-more n-less">Less</button>`;
  const short = `${old ? 'Aerial image ' + old.flown : noSat ? 'No satellite picture' : sensorName(state.available[v3dCtx ? v3dCtx.current() || v3dCtx.years[0] : 0]) + ' ' + when} · ${v3dCtx && v3dCtx.bundle && v3dCtx.bundle.yearly && !v3dCtx.bundle.yearly.swiss && !/ArcticDEM/.test(REGION.terrain.short) ? 'ArcticDEM · ' : ''}${REGION.terrain.short}<span id="v3dLcS">${shortLayerNames(g)}</span>${usesDem ? (v3dCtx && v3dCtx.bundle && v3dCtx.bundle.yearly && v3dCtx.bundle.yearly.swiss ? ' · ice surface: surveys and model' : FEATURES.swisstopo ? ' · ice surface: estimate' : ' · ice surface: ArcticDEM') : ''}${oldNote ? ' · ' + oldNote.short : ''} <button type="button" class="n-more">Details</button>`;
  return `<span class="n-short">${short}</span><span class="n-full">${full}</span>`;
}
$('v3dNote').addEventListener('click', e => { const b = e.target.closest && e.target.closest('.n-more'); if (b) $('v3dNote').classList.toggle('open'); });
/* The glacier the 3D view shows: the chosen one, or, when an outlet of an ice cap was clicked (subFocus, g.subs), a copy of the glacier that stands for that outlet: its tip, its name and a strip along it
   found from its catchment (the RGI basin): the direction from the tip to the middle of the basin, as wide as the basin is across the first 2 km above the tip, as long as it reaches up the glacier.
   Such a strip has no baked terrain file: the terrain tiles and the strip pictures of the relay are used. */
export const subGlaciers = new Map();
export function nearestSub(g){      // index of the outlet whose tip is nearest the middle of the map view
  const c = map.getCenter(); let best = -1, d0 = Infinity;
  g.subs.forEach((sb, k) => { const t = sb.tip; if (!t) return; const d = (t[0] - c.lat) ** 2 + ((t[1] - c.lng) * Math.cos(c.lat * Math.PI / 180)) ** 2; if (d < d0) { d0 = d; best = k; } });
  return best;
}
export function v3dGlacier(){
  const g = currentGlacier(); if (!g || !g.subs) return g;
  const k = subFocus && subFocus.gid === g.id && g.subs[subFocus.k] ? subFocus.k : nearestSub(g);      // no outlet clicked (the whole cap on the map): the outlet nearest the middle of the map, not the fixed strip of the cap
  if (k < 0) return g;
  const key = g.id + '~' + k; if (!subGlaciers.has(key)) subGlaciers.set(key, subGlacier(g, k, key)); return subGlaciers.get(key);
}
export function subGlacier(g, k, key){
  const sb = g.subs[k], tip = sb.tip || [(sb.bounds[0][0] + sb.bounds[1][0]) / 2, (sb.bounds[0][1] + sb.bounds[1][1]) / 2], P = L.CRS.EPSG3857.project(L.latLng(tip[0], tip[1])), kk = 1 / Math.cos(tip[0] * Math.PI / 180);
  const pts = sb.outline.flat().map(([la, lo]) => { const q = L.CRS.EPSG3857.project(L.latLng(la, lo)); return [(q.x - P.x) / kk, (q.y - P.y) / kk]; });      // ground metres east and north of the tip
  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length, az = (Math.atan2(cx, cy) * 180 / Math.PI + 360) % 360, ue = Math.sin(az * Math.PI / 180), un = Math.cos(az * Math.PI / 180);
  const along = p => p[0] * ue + p[1] * un, across = p => p[0] * un - p[1] * ue;
  const up = Math.min(9000, Math.max(3500, Math.max(...pts.map(along)) + 600)), near = pts.filter(p => along(p) > -400 && along(p) < 2000), half = Math.min(4500, Math.max(2000, Math.max(0, ...near.map(p => Math.abs(across(p)))) + 400));
  return {...g, id: key, name: sb.name, local: sb.name, tongue: tip, cap: null, subs: null, image: null, subOf: g.id, view3d: {azimuth: Math.round(az), half: Math.round(half), back: 1500, up: Math.round(up), tex: 2 * half >= up + 1500 ? [2048, 1024] : [1024, 2048]}};
}
export async function open3D(){
  const run = ++v3dRun, g = v3dGlacier(), at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue, msg = $('v3dMsg');
  const cmp = state.mode === 'compare' && state.a !== state.b && state.available[state.a] && state.available[state.b] ? [state.a, state.b] : null;      // compare: both years side by side with a slider
  const years = cmp || (state.mode === 'timelapse' ? tlFrames() : [stillYear()].filter(y => state.available[y])), first = years.includes(stillYear()) ? stillYear() : years[years.length - 1];
  if (M3.gid && M3.gid !== g.id) clear3Measure();      // measurements belong to the glacier they were made on
  resetPhotos(); sync3DMenu(); v3dCtx = null; hideDivider3D(); radarHover = radarSel = -1; $('v3dNote').textContent = ''; $('v3d').hidden = false; setTitle3D(g, '3D'); msg.hidden = false;
  const keepCam = v3d && v3dCamId === g.id ? v3d.getCam() : null; v3dCamId = g.id;      // opening again for another year, mode or outline keeps the view the visitor chose
  if (v3d) { v3d.destroy(); v3d = null; $('v3dCanvas').replaceWith($('v3dCanvas').cloneNode(false)); }      // a lost WebGL context cannot be reused: new canvas
  try {
    if (!state.checked) { msg.textContent = $('status').textContent; return; }      // still looking for scenes: the search opens the view again when it is done (refreshAll)
    if (!years.length || !at) throw new Error('There is no satellite image for this year.');
    msg.textContent = 'Loading terrain and picture…';
    await loadOutline(g);      // stripFor() and the 2023 outline layer need it
    const bundle = await currentBundle(g, at), bb = bundle && (meshWide() ? bundle : coarseBundle(bundle));      // the baked file of this glacier, if there is one
    if (run !== v3dRun) return;
    const S = bundle ? stripOf(bundle, g) : stripFor(g, at), HALF = S.half, BACK = S.back, cell = V3D.CELL[meshWide() ? 0 : 1], nA = bb ? bb.nA : Math.round((S.up + BACK) / cell), nB = bb ? bb.nB : 2 * Math.round(HALF / cell);
    if (!bb && (!v3dTerrain || v3dTerrain.id !== g.id)) { const hp = loadHeights(S, nA, nB); v3dTerrain = {id: g.id, hp}; hp.catch(() => { if (v3dTerrain && v3dTerrain.hp === hp) v3dTerrain = null; }); }
    const hillH = bb && bb.surfaces ? y => bb.surfaces.get(Math.min(Math.max(y, bb.yearly.years[0]), bb.yearly.years[bb.yearly.years.length - 1])) : null;      // Iceland: the surface of each year, for the hillshade base map
    const [heights, tc, tc2, dem] = await Promise.all([bb ? bb.heights : v3dTerrain.hp, strip3DTexture(g, S, cmp ? cmp[0] : first, nA, nB, hillH), cmp ? strip3DTexture(g, S, cmp[1], nA, nB, hillH) : null,
      bb ? (bb.delta && bb.dem ? {delta: bb.delta, old: bb.dem.old, new: bb.dem.new} : null) : iceChangeGrid(g, S, nA, nB).catch(() => null)]);
    if (run !== v3dRun) return;
    v3d = startViewer($('v3dCanvas'), heights, tc, nA, nB, S.up, S.back, S.dist, S.half); v3d.setSpace(prefs.space3d === true);
    const hasBed = !!(bb && bb.bed); $('l3BlockRow').hidden = !hasBed; $('l3Sr').checked = false; $('l3Block').checked = prefs.bedBlock !== false; if (hasBed) v3d.setBlock($('l3Block').checked, bb.bed);      // the bed of the terrain file: cut sides
    v3d.setExag(+$('v3dExag').value); msg.hidden = true; if (keepCam) v3d.setCam(keepCam); else if (S.cam) v3d.setCam(S.cam); else if (PLAIN_START && FEATURES.swisstopo && g.id === GLACIERS[0].id) v3d.setCam(LANDING_CAM);
    if (tiltEntry) { tiltEntry = false; tiltReady(v3d, v3d.getCam()); }
    v3d.setOnCam(() => { if (!$('videoSheet').hidden) hint3D(); });      // the sharpness hint follows the zoom
    bindRadarPicking($('v3dCanvas')); bindCamPicking($('v3dCanvas'));
    const special = state.oldestAerial ? 'oldest' : state.latest ? 'latest' : null, surfYear = y => !dem ? y : special === 'latest' ? dem.new.year : special === 'oldest' ? dem.old.year : Math.max(y, dem.old.year);      // the specials use the newest / the oldest elevation model as it is
    const yearly = bb && bb.surfaces ? bb : null, yearLo = yearly ? yearly.yearly.years[0] : 0, yearHi = yearly ? yearly.yearly.years[yearly.yearly.years.length - 1] : 0;      // Iceland: a surface for every year
    const hy = yearly ? y => lakeFlat(g, yearly.surfaces.get(Math.min(Math.max(y, yearLo), yearHi)), y, nA, nB, heights) : y => lakeFlat(g, surfaceFor(g, heights, dem, surfYear(y)), y, nA, nB, heights), usesDem = yearly ? true : !!dem && iceShare(g, dem, first) !== null;      // the ice surface follows the year when the glacier has data for it
    const swissYearly = !!(yearly && yearly.yearly.swiss), elevFirst = yearly ? yearLo : dem && usesDem ? dem.old.year : 0, elevName = yearly && !swissYearly ? 'ArcticDEM' : 'swissALTI3D';
    const oldNoteFor = ys => { if (!usesDem) return {short: 'one terrain model for all years', full: 'This glacier has a single elevation model, used for every year: the ice surface is not adjusted to the year, so pictures of other years are draped on the same terrain.'}; const early = elevFirst && ys.some(y => y < elevFirst || special === 'oldest'); return early ? {short: `terrain as of ${elevFirst}`, full: `The oldest ${elevName} elevation model for this glacier is from ${elevFirst}: pictures of earlier years are draped on the ${elevFirst} terrain and surface, which is not extrapolated further back.`} : null; };
    const lastStrip = yearly && !swissYearly ? yearly.yearly.strips[yearly.yearly.strips.length - 1].date : '';
    const fmtMD = md => { const [m, d] = md.split('-').map(Number); return `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]}`; };
    const terrainNote = swissYearly ? ` Ice surface of each year ${yearLo} to ${yearHi}, on 30 September: a model with three measured surfaces (swissALTI3D 2017, swissSURFACE3D lidar 2021, swissALTI3D 2023) and the GLAMOS mass balance per elevation band for the years between and after them. Pictures of years before ${yearLo} use the ${yearLo} surface. <a href="/provenance.html?back=${encodeURIComponent(location.href)}" target="_blank" rel="noopener">How each year was made</a>.` : yearly ? ` Ice surface of each year: ArcticDEM strips (2 m, ${yearly.yearly.strips.length} dated models since ${yearly.yearly.strips[0].date.slice(0, 4)}), set onto ${yearly.yearly.reference || 'ÍslandsDEM'} with the ground beside the glacier. Each year is the surface on ${fmtMD(yearly.yearly.day || '09-15')}: measured where a summer strip lies within 45 days, interpolated in time between strips otherwise, and after the last strip (${fmtDate(lastStrip)}) the surface of that strip, unchanged.${Math.max(0, ...Object.values(yearly.yearly.estimated || {})) >= 0.005 ? ' Where no recent strip covers the ice (up to ' + Math.round(100 * Math.max(...Object.values(yearly.yearly.estimated))) + ' % of the strip in a year) the surface is the last strip plus the thinning measured on the ice around it between the same days: an estimate.' : ''} Strips of the winter months carry some snow.` : usesDem ? ` Ice surface of each year: estimate from the swissALTI3D editions ${dem.old.edition} and ${dem.new.edition} (surveys ${dem.old.year}${dem.old.assumed ? ', assumed,' : ''} and ${dem.new.year}; the years after ${dem.new.year} are extrapolated; for the years before ${dem.old.year} the surface of ${dem.old.year} is used) and the yearly mass balance (GLAMOS); after the last measured year it stays as it was.` : ' The terrain model is older than the picture, so the ice sits a little lower today.';
    if (usesDem) { if (cmp) v3d.setHeights(hy(cmp[0]), hy(cmp[1])); else v3d.setHeights(hy(first)); }
    let current = first;      // declared before the context: the download pane reads it as soon as the context exists
    const rockCache = new Map(), srCache = new Map();      // year -> the picture with the rock look (ice off); year -> the super-resolved picture
    /* The super-resolved picture (Layers: Picture): data/sr/<id>/<year>.webp, the pinned Sentinel-2 scene of the year run through SEN2SR (10 m to 2.5 m) and turned into the strip frame by
       experiments/aletsch-sen2sr/run_strip.py. Offered only where the files exist and the scene is the one on the page; an estimate of detail, never a measurement. */
    const srP = fetch(siteFile(`data/sr/${bundleId(g)}/meta.json`)).then(r => r.ok ? r.json() : null).catch(() => null);
    srP.then(m => { if (run === v3dRun) { $('l3SrRow').hidden = !m; $('l3Sr').checked = false; const ys = m ? Object.keys(m.years).map(Number).sort() : []; $('l3SrYears').textContent = ys.length ? `${ys[0]}–${ys[ys.length - 1]} only` : ''; } });      // the years that have a super-resolved picture are said in the menu: other years show the normal picture
    const srTex = async y => { const m = await srP; if (!m || !m.years[y] || !state.available[y] || m.years[y].date !== state.available[y].date) return null;
      if (!srCache.has(y)) srCache.set(y, fetch(siteFile(`data/sr/${bundleId(g)}/${y}.webp`)).then(r => r.blob()).then(createImageBitmap).then(b => { const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; c.getContext('2d').drawImage(b, 0, 0); return c; }));
      return srCache.get(y); };
    /* The super-resolved file only brings sharpness: its colours are not used. The picture of the page (colour mode, stretch, brightness, layers) is kept and each pixel is multiplied by the
       brightness ratio of the super-resolved picture to its own 10 m-scale blur (the detail the model added), so colour and stretch are exactly those of the normal picture. */
    const sharpen = (base, srC) => {
      const W = srC.width, H = srC.height, mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const out = mk(W, H), o = out.getContext('2d', {willReadFrequently: true}); o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high'; o.drawImage(base, 0, 0, W, H);
      const small = mk(W >> 2, H >> 2), sc = small.getContext('2d'); sc.imageSmoothingQuality = 'high'; sc.drawImage(srC, 0, 0, small.width, small.height);
      const low = mk(W, H), lc = low.getContext('2d', {willReadFrequently: true}); lc.imageSmoothingQuality = 'high'; lc.drawImage(small, 0, 0, W, H);
      const sd = srC.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data, ld = lc.getImageData(0, 0, W, H).data, im = o.getImageData(0, 0, W, H), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = 0.2126 * sd[i] + 0.7152 * sd[i + 1] + 0.0722 * sd[i + 2] + 6, b = 0.2126 * ld[i] + 0.7152 * ld[i + 1] + 0.0722 * ld[i + 2] + 6, r = Math.min(2, Math.max(0.5, a / b));
        d[i] = Math.min(255, d[i] * r); d[i + 1] = Math.min(255, d[i + 1] * r); d[i + 2] = Math.min(255, d[i + 2] * r);
      }
      o.putImageData(im, 0, 0); return out;
    };
    const texOf = async y => { const base = await strip3DTexture(g, S, y, nA, nB, hillH), srC = v3dCtx && v3dCtx.sr ? await srTex(y).catch(() => null) : null, c = srC ? sharpen(base, srC) : base; if (!(v3dCtx && v3dCtx.iceOff && bb && bb.bed)) return c; if (!rockCache.has(c)) rockCache.set(c, rockLook(c, hy(y), bb.bed, nA, nB, 2 * S.half / nB)); return rockCache.get(c); };
    v3dCtx = {g, S, bundle: bb, latest: heights, dem, grid: {nA, nB}, cmp, years, pin: pinData(g, S), tip: tipData(g, S), names: null, namesP: null, hz: horiz(), tex: texOf, iceOff: false, sr: false, srMeta: srP, surface: hy, usesDem, elevFirst, follow: null, current: () => cmp ? null : current, restore: () => cmp ? null : showYear(current)};      sync3DMenu(); detectTrails(v3dCtx);
    if (viewMode === '3d' && !$('videoSheet').hidden) update3DInfo();
    update3Measure(); pinLoop(); setupPhotos(g, v3dCtx);
    if (cmp) {
      v3d.setTexture(tc2, 1); showDivider3D(cmp, v3dCtx.hz);      // same direction as chosen for the map: stacked or side by side
      setTitle3D(g, `${cmp[0]} – ${cmp[1]}`);
      updateSciPanel(cmp[1]); updateCredits(); $('v3dNote').innerHTML = note3DHtml(g, `Pictures: ${sensorName(state.available[cmp[0]])}${sensorName(state.available[cmp[1]]) !== sensorName(state.available[cmp[0]]) ? ' and ' + sensorName(state.available[cmp[1]]) : ''}, ${fmtDate(state.available[cmp[0]].date)} and ${fmtDate(state.available[cmp[1]].date)}.`, `${state.available[cmp[0]].date.slice(0, 4)} and ${state.available[cmp[1]].date.slice(0, 4)}`, usesDem, terrainNote, oldNoteFor(cmp));
      return;
    }
    const oldA = special === 'oldest' ? oldestAerial.get(g.id) : null, modelNote = !usesDem || !special ? '' : special === 'latest' ? `newest elevation model (swissALTI3D ${dem.new.year})` : `oldest elevation model (swissALTI3D ${dem.old.year})`;
    const specialTxt = yr => special === 'latest' ? `Latest scene · ${fmtDM(state.available[yr].date)} ${yr}${modelNote ? ' · ' + modelNote : ''}` : oldA ? `Oldest aerial image · ${FEATURES.swisstopo ? 'SWISSIMAGE ' + oldA.ed : oldA.flown}${modelNote ? ' · ' + modelNote : ''}` : '';
    const note = yr => { updateSciPanel(yr); setTitle3D(g, oldA ? String(oldA.flown) : String(yr), specialTxt(yr)); updateCredits(); $('v3dNote').innerHTML = note3DHtml(g, `Picture: ${sensorName(state.available[yr])}, ${fmtDate(state.available[yr].date)}${isLandsat(state.available[yr]) ? ' (30 m pixels)' : ''}.`, fmtDM(state.available[yr].date) + ' ' + yr, usesDem, terrainNote + yearNote(yr) + (modelNote ? ` The ice surface is the ${modelNote}, not an estimate for a year.` : ''), oldNoteFor([yr])); };
    note(first);
    const showYear = async y => {      // the year follows the left panel (the frame of the timelapse); the terrain stays and only the picture changes
      current = y;
      const c = await texOf(y); if (run !== v3dRun || current !== y) return;
      v3d.setTexture(c); if (usesDem) v3d.setHeights(hy(y)); note(y);
      if (!$('videoSheet').hidden) update3DInfo();      // the labels in the frame show the year
    };
    v3dCtx.follow = y => { if (photoOn) { photoOn.pending = y; return; } if (y !== current && !v3dBusy) showYear(y); };      // while a photograph is on show the timelapse waits: leaving it goes to the year the panel is at
  } catch (err) { if (run === v3dRun) { msg.hidden = false; msg.textContent = '3D view failed: ' + (err && err.message || err); } }
}

/* ---- Historic photographs (prototype: Aletsch) ----
   photos.json (made by scripts/build_photos.py from Smapshot, HEIG-VD) holds, per glacier, a few historic photographs with the place and angles of the camera. The rail on the left lists them;
   a click flies the 3D camera to the photographer's place and looks the way the photograph looks, with the same field of view. The photograph lies over the picture, a line to drag
   shows it on one side and the 3D view on the other, so the change of the ice is seen from exactly the same spot. The ice surface of the 3D side is the estimate for the year of the photograph. */
export let photosFile = null, photoOn = null, photoRun = 0;      // photoOn: the photograph on show
export const loadPhotos = () => photosFile || (photosFile = fetch(asset('data/photos.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})));
/* The ice level of an old photograph is not reconstructed as a surface (the interpolation did not fit): the terrain stays the latest measured one, and a rod on the glacier 1.6 km above the tip marks how much higher the ice stood then, as an estimate with a range.
   Years inside the measured period (2016 on): the change between the two swissALTI3D surfaces on the glacier 1.6 km above the tip, by the yearly mass balance (middle) and by time (the other end of the range).
   Years before 2016: the thinning of the whole glacier since then from the GLAMOS volume surveys (the low end; from 1927 for Aletsch); before the first survey from the area of the SGI1850 outline against today's with the usual area-volume scaling
   (V proportional to A^1.375, Bahr et al. 1997), joined to the surveys in a straight line. The tongue thins faster than the glacier as a whole: the high end is that thinning times how much faster the tongue thinned in the measured period (the ratio is capped at 6);
   the middle is the geometric mean of the two. */
export function tongueCentres(g, S, list){            // the middle of the widest piece of ice inside the strip at several distances up from the tip (2023 outline): x, z in the scene, half of the width to draw
  const rings = []; g.inv.outline.coordinates.forEach(poly => poly.forEach(r => rings.push(r.map(([lng, lat]) => { const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), p = stripXZ(S, q.x, q.y); return [p.a, p.b]; }))));
  const out = [], lim = S.half - 200;
  list.forEach(a0 => {
    const bs = []; rings.forEach(ring => ring.forEach((pt, i) => { const q = ring[(i + 1) % ring.length]; if ((pt[0] > a0) !== (q[0] > a0)) bs.push(pt[1] + (q[1] - pt[1]) * (a0 - pt[0]) / (q[0] - pt[0])); }));
    bs.sort((x, y) => x - y); let best = null;
    for (let i = 0; i + 1 < bs.length; i += 2) { const lo = Math.max(bs[i], -lim), hi = Math.min(bs[i + 1], lim); if (hi - lo > 250 && (!best || hi - lo > best[1] - best[0])) best = [lo, hi]; }      // not a sliver or a side arm
    if (best) out.push({x: (best[0] + best[1]) / 2, z: -a0, a: a0, half: Math.min(600, (best[1] - best[0]) * 0.4)});
  });
  return out;
}
export function rodAt(c, r){            // a rod place chosen by hand for one photograph (photos.json "rod": a = metres up from the tip, b = metres to the right of the strip's axis), width taken from the glacier there
  if (!r || !isFinite(r.a) || !isFinite(r.b)) return null;
  const base = tongueCentres(c.g, c.S, [r.a])[0]; return {x: r.b, z: -r.a, a: r.a, half: base ? base.half : 300};
}
export const tongueCentre = (g, S) => tongueCentres(g, S, [1600, 1400, 1800, 1200, 2000, 1000])[0] || null;      // the default: 1.6 km up
export function rodSpot(c, viewer, lay, pose){            // the place for the rod in a photograph: of the candidates 1.0 to 4.4 km above the tip, the one that is in the frame, not behind a ridge and nearest the middle of the photograph (a little preferring 1.6 km)
  const cand = tongueCentres(c.g, c.S, [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2800, 3200, 3600, 4000, 4400].filter(a => a < c.S.up - 200)); if (!cand.length) return null;
  const cw = $('v3dCanvas').clientWidth, ch = $('v3dCanvas').clientHeight, pts = [];
  cand.forEach(k => { const gy = viewer.groundY(k.x, k.z); pts.push([k.x, gy + 50, k.z, true]); });      // tested at an old-ice height: today's ice lies lower, so a ridge that hides it today may not have hidden the ice of the photograph
  const pr = viewer.projectAt(pts, cw, ch, null, null); let best = /** @type {any} */ (null);
  cand.forEach((k, i) => {
    const q = pr[i]; if (!q || !q[2] || q[0] < lay.x + 20 || q[0] > lay.x + lay.w - 20 || q[1] < lay.y + 60 || q[1] > lay.y + lay.h - 20) return;
    const score = Math.hypot(q[0] - (lay.x + lay.w / 2), q[1] - (lay.y + lay.h * 0.55)) + Math.abs(k.a - 1600) * 0.05;
    if (!best || score < best.score) best = {k, score};
  });
  return best ? best.k : null;
}
export function tongueLowering(c, ctr){            // mean lowering (m, positive) of the ice around the middle of the tongue between the two swissALTI3D surfaces, or null
  if (!c.dem || !c.dem.delta || !ctr) return null;
  const {nA, nB} = c.grid, sx = 2 * c.S.half / nB, sz = (c.S.up + c.S.back) / nA, W = nB + 1; let sum = 0, n = 0;
  for (let j = Math.max(0, Math.floor((ctr.z + c.S.up - 400) / sz)); j <= Math.min(nA, Math.ceil((ctr.z + c.S.up + 400) / sz)); j++) for (let i = Math.max(0, Math.floor((ctr.x + c.S.half - 400) / sx)); i <= Math.min(nB, Math.ceil((ctr.x + V3D.HALF + 400) / sx)); i++) {
    if (Math.hypot(-c.S.half + i * sx - ctr.x, -c.S.up + j * sz - ctr.z) <= 400) { sum += -c.dem.delta[j * W + i]; n++; }
  }
  return n >= 10 ? sum / n : null;
}
export function latestOffset(g, c, ctr, y){            // how far below the last measured surface the estimate for a later year stands at that spot (negative: the surface is lower)
  const T = tongueLowering(c, ctr), f = c.dem ? iceShare(g, c.dem, y) : null; return T === null || f === null ? 0 : T * f;      // the same rule as surfaceFor()
}
export async function iceLevel(g, y, c, ctr){            // {low, mid, high (m above today's ice on the glacier 1.6 km above the tip), how, ratio, from} or null when it cannot be estimated
  const dem = c.dem, T = tongueLowering(c, ctr), V = g.inv && g.inv.volume;
  if (y >= 2016) {
    if (!dem || T === null || y >= dem.new.year) return null;
    const t0 = dem.old.year, t1 = dem.new.year, fb = iceShare(g, dem, y), fl = (t1 - y) / (t1 - t0), f = fb === null ? fl : fb;
    return {low: T * Math.min(f, fl), mid: T * f, high: T * Math.max(f, fl), how: 'surveys', t0, t1};
  }
  if (!V || !V.series || !V.to) return null;
  const ser = V.series.filter(r => r[1] === V.to && r[6] >= 90 && r[0] < V.to).sort((a, b) => a[0] - b[0]).map(r => [r[0], -r[3]]);      // [survey year, mean thinning of the glacier from then to the latest survey, m]
  if (!ser.length) return null;
  let mean, how = 'surveys-glacier', first = ser[0][0];
  if (y >= first) { let k = 0; while (k < ser.length - 2 && ser[k + 1][0] <= y) k++; const [a, la] = ser[k], [b, lb] = ser[Math.min(k + 1, ser.length - 1)]; mean = b === a ? la : la + (lb - la) * Math.min(1, Math.max(0, (y - a) / (b - a))); }
  else {
    const A0 = g.inv.oldest && g.inv.oldest.area_km2, A1 = g.inv.area_km2, v = await glacierVolume(g).catch(() => null); if (!A0 || !A1 || !v) return null;
    const loss1850 = glacierIceAt(g, v, V.to) * (Math.pow(A0 / A1, 1.375) - 1) / A1 * 1000;      // km3 / km2 = km, times 1000: m
    mean = y <= 1850 ? loss1850 : loss1850 + (ser[0][1] - loss1850) * (y - 1850) / (first - 1850); how = 'scaling';
  }
  const M = V.series.find(r => r[0] === V.from && r[1] === V.to), ratio = T !== null && M && M[3] < 0 ? Math.min(6, Math.max(1, T / -M[3])) : 1;
  return {low: mean, mid: mean * Math.sqrt(ratio), high: mean * ratio, how, ratio, first};
}
export let thenNowOn = false;      // the layer "Then and now": the dock shows the old photographs, the list open
export let photosSeen = false;      // the pill pulses until the list has been opened once
export function placeDrop(){            // the drop-up strip is centred on the 3D picture (not on the button) and never wider than it
  const box = $('v3dPhotos'), d = box && box.querySelector('.ph-drop'); if (!d) return;
  const cr = $('v3dCanvas').getBoundingClientRect(), br = box.getBoundingClientRect();
  d.style.maxWidth = Math.max(160, cr.width - 20) + 'px';
  const w = d.offsetWidth, centre = Math.min(Math.max(cr.left + cr.width / 2, cr.left + w / 2 + 10), cr.right - w / 2 - 10);      // centred on the picture, and kept inside it whatever the width
  d.style.left = (centre - br.left) + 'px';
}
addEventListener('resize', placeDrop); new ResizeObserver(() => placeDrop()).observe(document.getElementById('v3d'));
export function syncPhotoToggle(){ const t = document.querySelector('#v3dPhotos .ph-toggle'); if (t) t.classList.toggle('on', !!photoOn); }
document.addEventListener('pointerdown', e => { const b = document.getElementById('v3dPhotos'); if (b && b.classList.contains('open') && !b.contains(e.target)) { b.classList.remove('open'); const t = b.querySelector('.ph-toggle'); if (t) t.setAttribute('aria-expanded', 'false'); } });
export function resetPhotos(){ $('l3PhotosRow').hidden = true; closeTune(); $('v3dPhotos').classList.remove('open'); camHover = camSel = listHover = -1; photoOn = null; photoRun++; $('v3d').classList.remove('photo-on'); $('v3dPhoto').hidden = true; $('v3dPhotoCap').hidden = true; $('v3dPhotos').hidden = true; $('v3dPhotos').textContent = ''; }
export async function setupPhotos(g, ctx){            // the rail of thumbnails, when this glacier has photographs
  const all = await loadPhotos(), list = all[g.inv && g.inv.id]; if (!list || !list.length || ctx !== v3dCtx) return;
  ctx.photos = list;
  const box = $('v3dPhotos'); box.textContent = '';
  const tg = document.createElement('button'), lst = document.createElement('div');
  tg.type = 'button'; tg.className = 'ph-toggle' + (photosSeen ? '' : ' fresh'); tg.setAttribute('aria-expanded', 'false'); tg.title = `${list.length} old photographs of this glacier`;
  tg.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2"/></svg><span class="ph-t">Then and now</span><svg class="ph-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  tg.onclick = () => { const o = !box.classList.contains('open'); box.classList.toggle('open', o); if (o) { placeDrop(); requestAnimationFrame(placeDrop); } tg.setAttribute('aria-expanded', o); photosSeen = true; tg.classList.remove('fresh'); };
  const cs = document.createElement('button'); cs.type = 'button'; cs.className = 'ph-cams'; cs.setAttribute('aria-pressed', prefs.camSymbols === true);
  cs.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.500h3l1.500-2.500h7L17 8.500h3v10H4z"/><circle cx="12" cy="13.500" r="3.200"/></svg><span>Camera symbols</span><i class="sw-track"><i></i></i>';
  cs.title = 'Show or hide the camera symbols of the old photographs'; cs.onclick = () => { prefs.camSymbols = prefs.camSymbols !== true; savePrefs(); cs.setAttribute('aria-pressed', prefs.camSymbols === true); camHover = camSel = listHover = -1; pinLoop(); };
  lst.className = 'ph-list'; const pb = document.createElement('div'); pb.className = 'ph-btns'; pb.id = 'v3dPhotoBtns'; const drop = document.createElement('div'), row = document.createElement('div'); drop.className = 'ph-drop'; row.className = 'ph-row'; row.append(cs, lst); drop.appendChild(row); box.append(tg, pb, drop);      // the drop-up strip above the bar: the camera switch and the thumbnails side by side, the footnote under them
  list.forEach((ph, i) => {
    const b = document.createElement('button'), im = document.createElement('img'), sp = document.createElement('span');
    b.type = 'button'; b.className = 'ph'; b.dataset.i = i; b.title = `${ph.date}: ${ph.title}`; im.src = ph.thumb; im.alt = ''; im.loading = 'lazy'; sp.textContent = ph.year; b.append(im, sp); b.onclick = () => enterPhoto(i); lst.appendChild(b);
    b.onpointerenter = b.onfocus = () => { listHover = i; pinLoop(); };      // lights its camera, even with the switch off b.onpointerleave = b.onblur = () => { if (listHover === i) listHover = -1; };
  });
  const inside = camGeo(ctx).filter(g => g.inside).length, note = document.createElement('p'); note.className = 'ph-note';
  note.textContent = inside < list.length ? `not all camera positions are visible in the 3D visual (here ${inside} out of ${list.length})` : list.length === 1 ? 'the camera position is visible in the 3D visual' : `all ${list.length} camera positions are visible in the 3D visual`; box.querySelector('.ph-drop').appendChild(note);
  $('l3PhotosRow').hidden = false; $('l3Photos').checked = thenNowOn; showThenNow(); syncPhotoToggle(); pinLoop();
}
export function showThenNow(){      // the dock's "Then and now" and its thumbnail list follow the layer switch
  const box = $('v3dPhotos'); if (!box.firstChild) return;
  box.hidden = !thenNowOn; box.classList.toggle('open', thenNowOn); const t = box.querySelector('.ph-toggle'); if (t) { t.setAttribute('aria-expanded', thenNowOn); if (thenNowOn) { photosSeen = true; t.classList.remove('fresh'); } }
  if (thenNowOn) { placeDrop(); requestAnimationFrame(placeDrop); } else if (photoOn) leavePhoto(true);
  camHover = camSel = listHover = -1; pinLoop();
}
$('l3Photos').onchange = e => { thenNowOn = e.target.checked; showThenNow(); };
export function photoLayout(ph){            // where the photograph sits on the screen, and the matching camera: the same field of view as the photograph, its centre where the photograph's centre is
  const cv = $('v3dCanvas'), cw = cv.clientWidth, ch = cv.clientHeight, phone = cw <= 720, left = phone ? 8 : 14, top = phone ? 10 : 56, bottom = phone ? 165 : 150, aw = cw - left - (phone ? 8 : 14), ah = ch - top - bottom;
  const hr = Math.max(60, Math.min(ah, aw / (ph.w / ph.h))), wr = hr * ph.w / ph.h, x = left + (aw - wr) / 2, y = top + (ah - hr) / 2;
  const fpx = hr * ph.focal / ph.h, fovY = 2 * Math.atan((ch / 2) / fpx), cx = (x + wr / 2 - cw / 2) / (cw / 2), cy = -((y + hr / 2) - ch / 2) / (ch / 2);
  return {x, y, w: wr, h: hr, fovY, view: {cx: -cx, cy: -cy}};
}
export function photoPose(ph, S, lay){            // the camera of the photograph in the scene of the strip
  const q = L.CRS.EPSG3857.project(L.latLng(ph.lat, ph.lon)), p = stripXZ(S, q.x, q.y), th = ph.az * Math.PI / 180;
  const a = Math.sin(th) * S.ue + Math.cos(th) * S.un, b = Math.sin(th) * S.un - Math.cos(th) * S.ue, ang = d => (d >= 180 ? d - 360 : d) * Math.PI / 180;      // heading in the strip's frame; tilt and roll: 0 is level, 360 - x is x degrees down / the other way
  return {alt: ph.alt, x: p.x, z: p.z, yaw: Math.atan2(b, a), pitch: ang(ph.tilt), roll: ang(ph.roll), fovY: lay.fovY, view: lay.view};
}
export function clipPhoto(){            // the photograph shows left of the line, the 3D view right of it
  if (!photoOn) return;
  const lay = photoOn.lay, cw = $('v3dCanvas').clientWidth, share = Math.min(1, Math.max(0, (v3dSplit * cw - lay.x) / lay.w));
  const imEl = $('v3dPhoto'); imEl.style.opacity = photoOn.overlay ? '0.5' : ''; imEl.style.clipPath = photoOn.overlay ? 'none' : `inset(0 ${((1 - share) * 100).toFixed(2)}% 0 0)`;
  placePhotoLabels();
}
export function placePhotoLabels(){            // the photo's year stays in the top left corner of the frame; the 3D year travels with the line, just right of it (each hides when the line would cover it)
  const o = photoOn; if (!o || !o.lay) return;
  const cw = $('v3dCanvas').clientWidth, a = $('v3dLabA'), b = $('v3dLabB'), gap = cw <= 720 ? 6 : 12, x = v3dSplit * cw, lay = o.lay;
  a.style.top = b.style.top = (lay.y + gap) + 'px'; a.style.left = (lay.x + gap) + 'px'; a.style.right = 'auto'; b.style.right = 'auto';
  const bx = Math.min(Math.max(x + 22, lay.x + gap), lay.x + lay.w - gap - b.offsetWidth);
  b.style.left = bx + 'px';
  a.style.visibility = x > lay.x + gap + a.offsetWidth + 6 ? '' : 'hidden';      // the photo side is too narrow for its label
  b.style.visibility = bx > x + 8 || x < lay.x + 4 ? '' : 'hidden';             // the 3D side is too narrow for its label
}
export function placePhoto(){
  const o = photoOn, im = $('v3dPhoto'); o.lay = photoLayout(o.ph);
  Object.assign(im.style, {left: o.lay.x + 'px', top: o.lay.y + 'px', width: o.lay.w + 'px', height: o.lay.h + 'px'}); clipPhoto();
  placePhotoLabels();
}
export function clearPhotoLabels(){ ['v3dLabA', 'v3dLabB'].forEach(id => { const s = $(id).style; s.top = s.left = s.right = s.visibility = ''; }); }      // back to the places the compare slider gives them
export const licShort = ph => { const m = /CC[ -](?:BY|0)[A-Za-z-]*\s*[0-9.]*/.exec(ph.licence || ''); return `${ph.owner || 'Archive'}${m ? ', ' + m[0].trim() : ''}`; };      // "ETH Library, CC BY-SA 4.0": the full text of the licence is in the tooltip
export const round10 = v => v < 100 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
export function rodText(ph, lvl){            // the two lines of the indicator: the difference, and that it is an estimate with its range
  const lo = round10(lvl.low), mid = round10(lvl.mid), hi = round10(lvl.high);
  return {main: `${ph.date.slice(0, 4)}: about ${mid} m higher`, sub: `estimated${hi - lo >= 10 ? ` · ${lo}–${hi} m` : ''}`, today: 'today’s ice surface', todaySub: `${mid} m lower than in ${ph.date.slice(0, 4)}`, year: ph.date.slice(0, 4)};
}
export function photoButtons(){            // "Hide ice level" and "Back to 3D" sit under the "Then and now" pill, only while a photograph is on show
  const box = $('v3dPhotoBtns'); if (!box) return; box.textContent = '';
  if (!photoOn) return;
  const mk = (txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.onclick = fn; box.appendChild(b); return b; };
  if (photoOn.rod) {            // the rod can be switched off (the choice is remembered)
    const r = mk(photoOn.rodOn ? 'Hide ice level' : 'Show ice level', () => { if (!photoOn) return; photoOn.rodOn = !photoOn.rodOn; prefs.photoRod = photoOn.rodOn; savePrefs(); r.textContent = photoOn.rodOn ? 'Hide ice level' : 'Show ice level'; pinLoop(); });
  }
  mk('Back to 3D', () => leavePhoto());
}
export function photoCaption(ph, lvl, model, dem, latest){
  const cap = $('v3dPhotoCap'); cap.textContent = ''; cap.classList.remove('open');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const a = (txt, href) => { const e = el('a', '', txt); e.href = href; e.target = '_blank'; e.rel = 'noopener'; return e; }, t = el('span', 'pc-t'), l = el('span', 'pc-l');
  const how = model ? '' : !lvl ? 'No estimate of the old ice level for this year.' : lvl.how === 'surveys' ? `The bar marks the estimated ice level then on the glacier 1.6 km above the tip, between the two measured surfaces (${lvl.t0} and ${lvl.t1}); the range is mass balance against time.`
    : `The bar marks a rough estimate of the ice level then on the glacier 1.6 km above the tip: ${lvl.how === 'scaling' ? 'area–volume scaling (Bahr et al. 1997) between the 1850 and 2023 outlines' : 'the thinning of the whole glacier since then (GLAMOS volume surveys)'}, up to ${lvl.ratio.toFixed(1)} times that, because the ice here thins faster than the glacier as a whole.`;
  const short = ph.year >= 2016 ? '3D: the surface of that year' : '3D: today’s surface';      // one short line; "Details" opens the rest
  t.append(el('b', '', ph.date.replace(/-01-01$/, '')), ' · ' + (ph.title || '').slice(0, 60));
  l.title = ph.licence || ''; l.append(licShort(ph) + ' · ', a('Smapshot', ph.link), el('span', 'pc-short', ' · ' + short + ' · '));
  const more = el('button', 'n-more', 'Details'); more.type = 'button'; more.onclick = () => cap.classList.toggle('open'); l.append(more);
  const full = el('span', 'pc-full'); full.append('Photo: ETH Library, via ', a('Smapshot', ph.link), ' (HEIG-VD); camera position worked out by volunteers. 3D side: ' + `${model ? (dem && (ph.year === dem.old.year || ph.year === dem.new.year) ? `the measured surface of ${ph.year}` : dem ? `the ice surface for ${ph.year}, an estimate between the measured surfaces of ${dem.old.year} and ${dem.new.year}` : 'the latest elevation model') : latest && latest.estimate ? `the latest surface, the estimate for ${latest.year} (after the last measured surface of ${dem.new.year}); the older ice is not reconstructed` : `the latest measured surface${dem ? ' (' + dem.new.year + ')' : ''}; the older ice is not reconstructed`}` + '. ' + how); l.append(full);
  cap.append(t, l); cap.hidden = false; photoButtons();
}
export async function enterPhoto(i){
  const c = v3dCtx, viewer = v3d; if (!c || !viewer || !c.photos || v3dBusy || document.body.classList.contains('pane-open')) return;
  if (photoOn && photoOn.i === i) return leavePhoto();
  const ph = c.photos[i], run = ++photoRun, im = $('v3dPhoto');
  cancel3Measure(); camHover = camSel = listHover = -1; photoOn = {i, ph, lay: null, rod: null, rodOn: prefs.photoRod !== false}; $('v3d').classList.add('photo-on'); $('v3dPhotos').classList.remove('open'); $('v3dPhotos').querySelector('.ph-toggle').setAttribute('aria-expanded', 'false'); syncPhotoToggle(); photoButtons(); $('v3dPhotos').querySelectorAll('.ph').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  hideDivider3D(); viewer.setSplit(-1, false); im.hidden = true; $('v3dPhotoCap').hidden = true; pinLoop(); viewer.setExag(1);
  const model = ph.year >= 2016, newest = Math.max(...okYears()), latest = {year: c.dem && newest > c.dem.new.year ? newest : (c.dem ? c.dem.new.year : null), estimate: !!c.dem && newest > c.dem.new.year};      // from 2016 on there is a precalculated surface (measured in 2017 and 2023, the estimate between): that year's is used; for an older photograph the latest one, whichever is newest (the last measured surface, or the estimate for a later year), and the rod marks the old ice level above it
  viewer.setHeights(model ? c.surface(ph.year) : latest.estimate ? c.surface(latest.year) : c.latest);
  const texYear = model ? ph.year : latest.year, texP = texYear && state.available[texYear] ? c.tex(texYear).catch(() => null) : Promise.resolve(null);      // the satellite picture of the year the surface stands for (the latest survey year for an older photograph); without one the picture stays
  const surfYear = model ? ph.year : latest.year; if (surfYear) setTitle3D(c.g, String(surfYear));      // the title names the elevation model that shows, not the year of the panel
  const lay = photoLayout(ph); photoOn.lay = lay; im.src = ph.src; openTune();
  const loaded = new Promise(res => { im.onload = res; im.onerror = res; });
  await viewer.setPose(photoPose(ph, c.S, lay), 1500);
  await loaded; if (run !== photoRun || !photoOn) return;
  const ctr = !model && c.g.inv && c.g.inv.outline ? ((ph.rod && rodAt(c, ph.rod)) || rodSpot(c, viewer, lay) || tongueCentre(c.g, c.S)) : null, levelP = ctr ? iceLevel(c.g, ph.year, c, ctr).catch(e => { console.error(e); return null; }) : Promise.resolve(null);
  placePhoto(); im.hidden = false;
  texP.then(t => { if (t && run === photoRun && photoOn && v3d === viewer) viewer.setTexture(t, 0); });
  const d = $('v3dDiv'); d.classList.remove('hz'); d.classList.add('used'); d.hidden = false; $('v3d').classList.remove('cmp-h'); $('v3d').classList.add('cmp-v');
  $('v3dLabA').textContent = ph.date.slice(0, 4); $('v3dLabB').textContent = `3D ${model ? ph.year : latest.year || 'today'}`; $('v3dLabA').hidden = $('v3dLabB').hidden = false; setSplit3D(0.5);
  const lvl = await levelP; if (run !== photoRun || !photoOn) return;
  const off = lvl && latest.estimate ? latestOffset(c.g, c, ctr, latest.year) : 0, rel = lvl && {...lvl, low: lvl.low - off, mid: lvl.mid - off, high: lvl.high - off};      // the estimate is against the last measured surface: against a later estimate the ice stood higher still
  if (rel && rel.mid >= 1) { photoOn.rod = {x: ctr.x, z: ctr.z, half: ctr.half, low: rel.low, mid: rel.mid, high: rel.high, text: rodText(ph, rel)}; pinLoop(); }
  photoCaption(ph, rel, model, c.dem, latest);
}
export function leavePhoto(quick){
  if (!photoOn) return;
  closeTune(); const c = v3dCtx, viewer = v3d, pending = photoOn.pending; photoOn = null; photoRun++; $('v3d').classList.remove('photo-on'); syncPhotoToggle(); photoButtons();
  if (c) setTitle3D(c.g, c.cmp ? `${c.cmp[0]} – ${c.cmp[1]}` : String(c.current()));      // the year of the panel again
  $('v3dPhoto').hidden = true; $('v3dPhotoCap').hidden = true; hideDivider3D(); $('v3dPhotos').querySelectorAll('.ph.on').forEach(b => b.classList.remove('on'));
  if (viewer && c) {
    viewer.setPose(null, quick ? 0 : 1000); viewer.setExag(+$('v3dExag').value);      // back to the camera the visitor had
    if (c.cmp) { if (c.usesDem) viewer.setHeights(c.surface(c.cmp[0]), c.surface(c.cmp[1])); viewer.setSplit(v3dSplit, c.hz); showDivider3D(c.cmp, c.hz); c.cmp.forEach((y, k) => c.tex(y).then(t => { if (!photoOn && v3d === viewer) viewer.setTexture(t, k); }).catch(() => {})); }
    else { if (c.usesDem) viewer.setHeights(c.surface(c.current())); c.tex(c.current()).then(t => { if (!photoOn && v3d === viewer) viewer.setTexture(t, 0); }).catch(() => {}); }      // and the picture of the year in the panel
  }
  if (c && pending && !c.cmp && pending !== c.current() && c.follow) c.follow(pending);      // the timelapse moved on meanwhile
  pinLoop();
}
export function relayoutPhoto(){            // the picture area changed size (window, full screen, panels): the photograph and the camera that matches it are fitted again
  if (photoOn && photoOn.lay && !$('v3dPhoto').hidden && v3d) { placePhoto(); v3d.setPose(photoPose(photoOn.ph, v3dCtx.S, photoOn.lay), 0); }
}
addEventListener('resize', relayoutPhoto);
{ let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(relayoutPhoto, 120); }).observe($('v3d')); }      // full screen and the sliding panels change the size without a window resize

/* Pose tuning for a photograph (a tool for the maintainer: open the page with tune=1 in the address, e.g. ...#g=trift&v=3d&tune=1, then open the photo). Sliders move the camera of the photograph (east, north, height),
   turn it (azimuth, tilt, roll) and change its zoom (focal length); the photograph and the 3D view follow at once, "Overlay" shows the photograph half transparent over the whole view so ridges can be lined up.
   "Copy command" puts the corrected numbers on the clipboard as a command for scripts/set_photo_pose.py, which writes them into photos.json. */
export const TUNE_POSE = /(^|[#&])tune=1/.test(location.hash);
export const TUNE_ROWS = [['de', 'East', 'm', -500, 500, 1], ['dn', 'North', 'm', -500, 500, 1], ['dalt', 'Height', 'm', -300, 300, 1], ['daz', 'Azimuth', '°', -20, 20, 0.05], ['dtilt', 'Tilt', '°', -12, 12, 0.05], ['droll', 'Roll', '°', -8, 8, 0.05], ['dzoom', 'Zoom', '%', -30, 30, 0.1]];
export function tunedPhoto(p0, t){            // the photograph with the corrections added (metres to degrees at this latitude)
  return {...p0, lat: p0.lat + t.dn / 110950, lon: p0.lon + t.de / (111320 * Math.cos(p0.lat * Math.PI / 180)), alt: p0.alt + t.dalt, az: (p0.az + t.daz + 360) % 360, tilt: p0.tilt + t.dtilt, roll: p0.roll + t.droll, focal: p0.focal * (1 + t.dzoom / 100)};
}
export function openTune(){
  if (!TUNE_POSE || !photoOn) return;
  const box = $('v3dTune'), o = photoOn; o.ph0 = o.ph; o.tune = {de: 0, dn: 0, dalt: 0, daz: 0, dtilt: 0, droll: 0, dzoom: 0}; o.overlay = false;
  box.textContent = ''; box.hidden = false;
  const h = document.createElement('b'); h.textContent = `Pose of photo ${o.ph0.id} (${o.ph0.date})`; box.appendChild(h);
  const outs = {}, apply = () => { o.ph = tunedPhoto(o.ph0, o.tune); relayoutPhoto(); fin(); };
  const fin = () => { const p = o.ph; box.querySelector('.tn-final').textContent = `az ${p.az.toFixed(2)}° · tilt ${p.tilt.toFixed(2)}° · roll ${p.roll.toFixed(2)}° · focal ${p.focal.toFixed(0)} px · alt ${p.alt.toFixed(1)} m`; };
  TUNE_ROWS.forEach(([k, name, unit, lo, hi, step]) => {
    const row = document.createElement('label'), r = document.createElement('input'), out = document.createElement('output'), nm = document.createElement('span');
    row.className = 'tn-row'; nm.textContent = name; r.type = 'range'; r.min = lo; r.max = hi; r.step = step; r.value = 0; out.textContent = `0 ${unit}`; outs[k] = out;
    r.oninput = () => { o.tune[k] = +r.value; out.textContent = `${(+r.value).toFixed(step < 1 ? 2 : 0)} ${unit}`; apply(); };
    r.ondblclick = () => { r.value = 0; r.dispatchEvent(new Event('input')); };      // a double click puts a slider back to zero
    row.append(nm, r, out); box.appendChild(row);
  });
  const ov = document.createElement('label'), cb = document.createElement('input'); ov.className = 'tn-ov'; cb.type = 'checkbox'; cb.onchange = () => { o.overlay = cb.checked; clipPhoto(); }; ov.append(cb, ' Overlay: the photograph half transparent over the whole view'); box.appendChild(ov);
  const fn = document.createElement('div'); fn.className = 'tn-final'; box.appendChild(fn);
  const bar = document.createElement('div'); bar.className = 'tn-bar';
  const reset = document.createElement('button'), copy = document.createElement('button'); reset.type = copy.type = 'button'; reset.textContent = 'Reset'; copy.textContent = 'Copy command';
  reset.onclick = () => { box.querySelectorAll('input[type=range]').forEach(r => { r.value = 0; }); Object.keys(o.tune).forEach(k => { o.tune[k] = 0; }); box.querySelectorAll('output').forEach((out, i) => { out.textContent = `0 ${TUNE_ROWS[i][2]}`; }); apply(); };
  copy.onclick = async () => { const p = o.ph, cmd = `python3 scripts/set_photo_pose.py ${p.id} --lat ${p.lat.toFixed(6)} --lon ${p.lon.toFixed(6)} --alt ${p.alt.toFixed(1)} --az ${p.az.toFixed(2)} --tilt ${p.tilt.toFixed(2)} --roll ${(((p.roll % 360) + 360) % 360).toFixed(2)} --focal ${p.focal.toFixed(1)}`;
    try { await navigator.clipboard.writeText(cmd); showNotice('Command copied. Paste it in a terminal in the project folder, then run build_site or reload.'); } catch { prompt('Copy this command:', cmd); } };
  bar.append(reset, copy); box.appendChild(bar); fin();
}
export function closeTune(){ const b = $('v3dTune'); if (b) { b.hidden = true; b.textContent = ''; } }

export function setView(v){            // the stage shows the map or the 3D view; the panel and the download pane stay the same
  if (v === viewMode) return;
  if (v === '3d' && !currentGlacier()) return showNotice('Choose a glacier first.');
  if (vstate.busy || v3dBusy) return;
  if (!$('videoSheet').hidden) closeVideo();
  if (v === '3d' && (state.oldestAerial || state.latest)) { restoreOldest(); restoreLatest(); refreshAll(); }      // the specials are for the map: 3D shows the normal year
  setViewMode(v); $('app').classList.toggle('is-3d', v === '3d'); syncSatUi(); if (state.checked && !latestBusy) setStatus(statusLine()); writeHash(); updateCredits();
  $('viewMap').setAttribute('aria-pressed', v === 'map'); $('view3dBtn').setAttribute('aria-pressed', v === '3d');
  setLayers(false); if (v === '3d') cancelMeasure(); else cancel3Measure();      // one measuring tool at a time
  if (v === '3d') { stopPlay(); open3D(); } else { close3D(); drawRadar(); loadDeferred(); }      // back on the map: its radar layer, if it was switched on or off meanwhile
}
$('viewMap').onclick = () => { flyOut(); syncTiltPill(); }; $('view3dBtn').onclick = () => flyIn();
/* The layer menu of the 3D view: the same switches as on the map (an outline or the radar dots), drawn on the picture that covers the terrain */
export const L3 = [['l3Osm', 'osmToggle'], ['l3Topo', 'topoToggle'], ['l3Alti', 'altiToggle'], ['l3Aerial', 'aerialToggle'], ['l3Sat', 'satToggle'], ['l3Trails', 'trailsToggle'], ['l3Old', 'oldToggle'], ['l3New', 'newToggle'], ['l3Radar', 'radarToggle'], ['l3Pin', 'pinToggle'], ['l3Max', 'maxToggle']];
export function sync3DMenu(){
  const g = currentGlacier(), R = g && g.inv && g.inv.radar;
  L3.forEach(([a, b]) => { $(a).checked = $(b).checked; $(a).disabled = b === 'radarToggle' ? !R : b === 'maxToggle' ? !(R && R.max_at) : $(b).disabled; });
  $('l3OldLabel').textContent = $('oldLabel').textContent; $('l3NewLabel').textContent = $('newLabel').textContent; $('l3PinLabel').textContent = $('pinLabel').textContent; $('l3AerialLabel').textContent = $('aerialLabel').textContent; renderLayerTitles();
  $('l3TrailLegend').hidden = !$('trailsToggle').checked; $('l3SightLegend').hidden = !sightFor(g);
  $('l3RadarLegend').hidden = !$('radarToggle').checked;
  $('l3RadarNote').textContent = !R ? 'No radar measurements for this glacier.' : `Surveys ${R.years ? (R.years[0] === R.years[1] ? R.years[0] : R.years.join(' and ')) : ''}. The ice has thinned since. The 3D view shows only about ten pins, a representative one on the middle line of the ice in each stretch of the glacier, to keep loading and moving fast. Hover a pin for the thickness, click to keep it.`;
  $('l3Names').checked = prefs.names3d === true;
  $('l3Space').checked = prefs.space3d === true; if (v3d) v3d.setSpace(prefs.space3d === true);
  { const lc = $('v3dLc'); if (lc && v3dCtx) lc.textContent = layersCreditText(v3dCtx.g); const ls = $('v3dLcS'); if (ls && v3dCtx) ls.textContent = shortLayerNames(v3dCtx.g); }
  $('l3MaxNote').hidden = !$('maxToggle').checked || !!(R && R.max_at);
  if (v3dCtx) { const seen = !!v3dCtx.pin; $('l3Max').closest('label').style.display = seen ? '' : 'none'; if (!seen) $('l3MaxNote').hidden = true; const tr = v3dCtx.hasTrails !== false; $('l3Trails').closest('label').style.display = tr ? '' : 'none'; if (!tr) { $('l3TrailLegend').hidden = true; $('l3SightLegend').hidden = true; } }      // the thickest ice only has a place in the menu when it lies inside the strip
  updateCredits();      // the sources follow the switches
  $('l3Op').value = imgOpacity(); $('l3OpOut').textContent = `${Math.round(imgOpacity() * 100)} %`;
  if ($('vOutline')) $('vOutline').checked = $('oldToggle').checked && !$('vOutline').disabled;
  pinLoop();
}
/* The thickest ice measurement as a mark standing on the terrain: a ring that pulses on the ground, a stem and a head that bobs above it. It is placed in the scene (so it follows the camera, with perspective)
   and drawn in 2D over the picture, on screen and in the downloads with the same function. */
export const PIN_LIFT = 160, NAME_KINDS = {Hauptgipfel: 3, 'Alpiner Gipfel': 3, Gipfel: 2, Pass: 1};
export function stripXZ(S, mx, my){            // a place in Web Mercator -> the scene of the strip (x to the right, z away from the camera's start)
  const dx = (mx - S.P.x) / S.k, dy = (my - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue;
  return {x: b, z: -a, a, b, inside: Math.abs(b) <= S.half && a >= -S.back && a <= S.up};
}
export function pinData(g, S){            // the place of the thickest radar ice in the strip: x, z of the scene and the text
  const R = g.inv && g.inv.radar; if (!R || !R.max_at) return null;
  const q = L.CRS.EPSG3857.project(L.latLng(R.max_at[0], R.max_at[1])), p = stripXZ(S, q.x, q.y); if (!p.inside) return null;
  return {x: p.x, z: p.z, text: `${R.max_m} m${R.max_year ? ` (${R.max_year})` : ''}`};
}
export function tipData(g, S){            // the tip of the tongue
  const at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue; if (!at) return null;
  const q = L.CRS.EPSG3857.project(L.latLng(at[0], at[1])), p = stripXZ(S, q.x, q.y);
  return {x: p.x, z: p.z, text: 'Tongue'};
}
/* Names of peaks and passes from swisstopo (swissNAMES3D, the identify service of api3.geo.admin.ch, open data): only a few, the highest ones with some room between them */
export const namesCache = new Map();
export function namesFor(g, S){
  if (!namesCache.has(g.id)) {
    const HALF = S.half, cs = [[-S.back, -HALF], [-S.back, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b)), env = [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))].join(',');
    if (!FEATURES.swisstopo) {      // outside Switzerland the peaks, volcanoes and passes of OpenStreetMap (Overpass API, open, CORS), looked up in the box around the strip
      const [w, s] = ((p) => [p.lng, p.lat])(L.CRS.EPSG3857.unproject(L.point(Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1]))))), [e, n] = ((p) => [p.lng, p.lat])(L.CRS.EPSG3857.unproject(L.point(Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))))),
        q = `[out:json][timeout:25];node["natural"~"^(peak|volcano|saddle)$"]["name"](${s},${w},${n},${e});out;`;
      const pr = fetch('https://overpass-api.de/api/interpreter', {method: 'POST', body: 'data=' + encodeURIComponent(q), headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).then(r => { if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
        .then(j => (j.elements || []).filter(el => el.tags && el.tags.name).map(el => { const m = L.CRS.EPSG3857.project(L.latLng(el.lat, el.lon)); return {name: el.tags.name, kind: el.tags.natural === 'saddle' ? 'Pass' : 'Gipfel', m: [m.x, m.y]}; }));
      pr.catch(() => namesCache.delete(g.id)); namesCache.set(g.id, pr); return pr;
    }
    const url = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' + new URLSearchParams({geometryType: 'esriGeometryEnvelope', geometry: env, imageDisplay: '1000,1000,96', mapExtent: env, tolerance: '0', layers: 'all:ch.swisstopo.swissnames3d', sr: '3857', returnGeometry: 'true', limit: '200', lang: 'en'});
    const pr = fetch(url).then(r => { if (!r.ok) throw new Error('swisstopo names ' + r.status); return r.json(); })
      .then(j => (j.results || []).filter(r => NAME_KINDS[r.attributes.objektart] && r.geometry && r.geometry.points && r.attributes.name).map(r => ({name: r.attributes.name, kind: r.attributes.objektart, m: r.geometry.points[0]})));
    pr.catch(() => namesCache.delete(g.id)); namesCache.set(g.id, pr);
  }
  return namesCache.get(g.id);
}
export function pickNames(list, S, viewer, avoid){
  const seen = new Set(), c = list.map(n => ({...n, ...stripXZ(S, n.m[0], n.m[1])})).filter(n => n.inside && Math.abs(n.x) < S.half - 200 && n.a > -S.back + 150 && n.a < S.up - 200 && !seen.has(n.name) && seen.add(n.name))
    .map(n => ({...n, score: viewer.groundY(n.x, n.z) / Math.max(0.5, viewer.exag()) + NAME_KINDS[n.kind] * 120})).sort((a, b) => b.score - a.score), out = [];
  for (const n of c) { if (out.length >= 6) break; if ([...out, ...avoid].every(o => Math.hypot(o.x - n.x, o.z - n.z) > 750)) out.push({x: n.x, z: n.z, text: n.name}); }      // few and far apart
  return out;
}
export function ensureNames(c){            // loads the names once for the open view; the promise lets an export wait for them
  if (c.namesP) return c.namesP;
  if (!$('l3Names').checked) return Promise.resolve();
  if (c.bundle) { c.names = c.bundle.names || []; return c.namesP = Promise.resolve(); }      // chosen when the file was made
  return c.namesP = (async () => {
    try { const list = await namesFor(c.g, c.S); if (c !== v3dCtx || !v3d) return; c.names = pickNames(list, c.S, v3d, [c.tip, c.pin].filter(Boolean)); }
    catch (e) { console.error(e); c.names = []; }
  })();
}
export function markItems(c){
  const m = [];
  if ($('l3Names').checked && c.names) c.names.forEach(n => m.push({type: 'name', ...n}));
  if ($('pinToggle').checked && c.tip) m.push({type: 'tip', ...c.tip});
  if ($('maxToggle').checked && c.pin) m.push({type: 'max', ...c.pin});
  if (photoOn && photoOn.rod && photoOn.rodOn) m.push({type: 'rod', ...photoOn.rod});      // the ice level of an old photograph, estimated
  return m;
}
export function projectMarks(c, viewer, W, H, cam, view){            // the marks in the pixels of a picture W x H: ground point g and head h; a name is left out when a ridge hides it
  const items = markItems(c), pts = [], at = [];
  items.forEach(it => {
    const gy = viewer.groundY(it.x, it.z); at.push(pts.length);
    if (it.type === 'rod') pts.push([it.x, gy, it.z, false], [it.x, gy + it.mid, it.z, false], [it.x - it.half, gy + it.mid, it.z, false], [it.x + it.half, gy + it.mid, it.z, false]);
    else { const lift = it.type === 'name' ? 60 : PIN_LIFT; pts.push([it.x, gy, it.z, false], [it.x, gy + lift, it.z, it.type === 'name']); }
  });
  const pr = viewer.projectAt(pts, W, H, cam, view);
  return items.map((it, i) => {
    const k = at[i];
    if (it.type === 'rod') { const q = pr.slice(k, k + 4); return q.every(Boolean) ? {...it, g: q[0], h: q[1], l: q[2], r: q[3]} : null; }
    const g = pr[k], h = pr[k + 1]; return g && h && h[2] ? {...it, g, h} : null;
  }).filter(Boolean);
}
export function drawMarks3D(ctx, list, t, u){            // t: seconds (the movement), u: size of one design pixel; names first, the pins over them
  ctx.save();
  list.filter(m => m.type === 'name').forEach(m => {
    const [gx, gy] = m.g, [hx, hy] = m.h;
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 5 * u; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.3 * u; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(gx, gy, 2.6 * u, 0, 2 * Math.PI); ctx.fill();
    ctx.font = `600 ${13.5 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(m.text, hx, hy - 3 * u);
  });
  ctx.restore();
  list.filter(m => m.type === 'rod').forEach(m => drawRod3D(ctx, m, u));
  list.filter(m => m.type !== 'name' && m.type !== 'rod').forEach(m => drawPin3D(ctx, m, t, u, m.type === 'tip' ? (getVar('--accent') || '#C8322A') : (getVar('--crevasse') || '#2D6E8E')));
}
export function drawRod3D(ctx, m, u){            // the rod on today's ice: its top is the old ice level (what the photograph shows), its foot is today's ice (what the 3D view shows). Whichever picture covers the rod lights up its end; moving the slider across the rod swaps them.
  const [gx, gy] = m.g, [hx, hy] = m.h, [x1, y1] = m.l, [x2, y2] = m.r, amber = '#F2A93B', box = photoOn && photoOn.lay, sc = box ? ctx.canvas.width / $('v3dCanvas').clientWidth : 1;
  const sx = v3dSplit * ctx.canvas.width, wp = Math.max(0, Math.min(1, (sx - (gx + hx) / 2) / (110 * u) + 0.5));      // wp: 1 where the photograph covers the rod (the slider is to the right of it), 0 where the 3D view does; it fades over the width of a hand
  ctx.save(); ctx.lineCap = 'round';
  const gr = ctx.createLinearGradient(gx, gy, hx, hy); gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,.7)');
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6 * u; ctx.strokeStyle = gr; ctx.lineWidth = 2.2 * u; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(hx, hy); ctx.stroke(); ctx.shadowBlur = 0;
  const pill = (cx0, cy0, main, sub, alpha, anchor) => {            // a small two-line label, clamped to the photograph's frame; anchor 'r': to the right of (cx0, cy0), else to the left
    ctx.save(); ctx.globalAlpha *= alpha; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${14 * u}px ${FONT}`; const w1 = ctx.measureText(main).width; ctx.font = `600 ${11.5 * u}px ${FONT}`; const w2 = ctx.measureText(sub).width, cw = Math.max(w1, w2) + 26 * u, ch = 40 * u;
    let cx = anchor === 'r' ? cx0 + 14 * u : cx0 - 14 * u - cw, cy = cy0 - ch / 2; const right = box ? (box.x + box.w) * sc : ctx.canvas.width;
    if (anchor === 'r' && cx + cw > right - 4) cx = cx0 - 14 * u - cw;
    if (box) { cx = Math.min(Math.max(cx, box.x * sc + 4), (box.x + box.w) * sc - cw - 4); cy = Math.min(Math.max(cy, box.y * sc + 4), (box.y + box.h) * sc - ch - 4); } else cx = Math.max(4, cx);
    ctx.fillStyle = 'rgba(10,16,20,.58)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx, cy, cw, ch, 9 * u) : ctx.rect(cx, cy, cw, ch); ctx.fill();
    ctx.fillStyle = amber; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx + 7 * u, cy + 8 * u, 3 * u, ch - 16 * u, 1.5 * u) : ctx.rect(cx + 7 * u, cy + 8 * u, 3 * u, ch - 16 * u); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${14 * u}px ${FONT}`; ctx.fillText(main, cx + 17 * u, cy + 13.5 * u);
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = `600 ${11.5 * u}px ${FONT}`; ctx.fillText(sub, cx + 17 * u, cy + 28.5 * u); ctx.restore();
  };
  const t = m.text;
  // the old ice level (the top): lit while the photograph covers the rod
  { const a = 0.25 + 0.75 * wp; ctx.save(); ctx.globalAlpha *= a;
    const dx = x2 - x1, dy = y2 - y1, dl = Math.hypot(dx, dy) || 1, half = Math.min(dl / 2, 30 * u), ux = dx / dl, uy = dy / dl;      // the level, across the glacier: only a short tick
    ctx.strokeStyle = amber; ctx.lineWidth = (2.6 + 1.6 * wp) * u; ctx.beginPath(); ctx.moveTo(hx - ux * half, hy - uy * half); ctx.lineTo(hx + ux * half, hy + uy * half); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = amber; ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(hx, hy, (4.5 + 2 * wp) * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    if (wp > 0.05) { ctx.restore(); pill(hx + half, hy, t.main, t.sub, wp, 'r'); } else ctx.restore(); }
  // today's ice (the foot): lit while the 3D view covers the rod
  { const a = 0.3 + 0.7 * (1 - wp); ctx.save(); ctx.globalAlpha *= a;
    ctx.strokeStyle = amber; ctx.lineWidth = (1.8 + 1.8 * (1 - wp)) * u; ctx.beginPath(); ctx.ellipse(gx, gy, (7 + 3 * (1 - wp)) * u, (3 + 1.2 * (1 - wp)) * u, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = amber; ctx.beginPath(); ctx.arc(gx, gy, (2 + 1.6 * (1 - wp)) * u, 0, 2 * Math.PI); ctx.fill();
    if (1 - wp > 0.05) { ctx.restore(); pill(gx, gy, t.today || 'today’s ice', t.todaySub || 'the old level was higher', 1 - wp, 'r'); } else ctx.restore(); }
  ctx.restore();
}
export function drawPin3D(ctx, P, t, u, color){            // a ring that pulses on the ground, a stem and a head that bobs above it, with its label
  const [gx, gy] = P.g, [hx, hy0] = P.h, bob = Math.sin(t * 3.2) * 4 * u, hy = hy0 + bob, r = Math.max(8, Math.min(16, Math.hypot(hx - gx, hy0 - gy) * 0.16)) * u / 0.9;
  ctx.save();
  const ph = (t * 0.9) % 1;
  ctx.strokeStyle = `rgba(255,255,255,${(0.85 * (1 - ph)).toFixed(2)})`; ctx.lineWidth = 2.5 * u; ctx.beginPath(); ctx.ellipse(gx, gy, (8 + 26 * ph) * u, (3.5 + 11 * ph) * u, 0, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.ellipse(gx, gy, 6 * u, 2.6 * u, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6 * u; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(hx, hy + r); ctx.stroke();
  ctx.fillStyle = color; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, r * 0.28, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `700 ${15 * u}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const w = ctx.measureText(P.text).width + 16 * u, x0 = hx + r + 8 * u;
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, hy - 12 * u, w, 24 * u, 6 * u) : ctx.rect(x0, hy - 12 * u, w, 24 * u); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(P.text, x0 + 8 * u, hy + 0.5 * u);
  ctx.restore();
}
/* Radar ice thickness as small pins that stand on the ice (the dots of the map, painted into the picture, were bent by the terrain): hovering a pin shows the thickness, a click or tap keeps it open.
   Like the other marks they are placed in the scene and drawn in 2D over the picture, on screen and in the downloads with the same function. */
export const RADAR_LIFT = 55;
export let radarHover = -1, radarSel = -1, radarHits = [];      // radarHits: the heads on screen (pixels of the overlay), for hovering and clicking
export function edgeDistances(list, c){            // per radar cell: the distance (m) to the nearest edge of the glacier outline, negative outside it; the cells far from both edges lie on the middle line of the ice, however the glacier bends in the strip
  const geom = newOutlineGeom(c.g) || oldOutlineGeom(c.g), segs = [], rings = [];
  if (!geom) return list.map(() => 0);
  eachPiece(geom, (ring, closed) => { const q = ring.map(([lng, lat]) => { const m = L.CRS.EPSG3857.project(L.latLng(lat, lng)), p = stripXZ(c.S, m.x, m.y); return [p.x, p.z]; }); rings.push(q); for (let i = 0; i + 1 < q.length; i++) segs.push([q[i], q[i + 1]]); if (closed && q.length > 2) segs.push([q[q.length - 1], q[0]]); });
  return list.map(p => {
    let d2 = Infinity, inside = false;
    for (const [a, b] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1))), ex = a[0] + t * dx - p.x, ez = a[1] + t * dz - p.z; d2 = Math.min(d2, ex * ex + ez * ez); }
    for (const q of rings) for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > p.z) !== (q[j][1] > p.z) && p.x < (q[j][0] - q[i][0]) * (p.z - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) inside = !inside;      // even-odd over all rings
    return inside ? Math.sqrt(d2) : -Math.sqrt(d2);
  });
}
export function relevantPins(list, S, edge){            // about ten pins, not hundreds (loading and moving would be slow): per stretch of the strip a representative radar cell on the middle line of the ice: of the cells at least 70 % as far from the edges as the best one of the stretch, the one of median thickness (not the thickest, which is the outlier)
  const len = S.up + S.back, n = Math.max(6, Math.min(12, Math.round(len / 700))), groups = Array.from({length: n}, () => []);      // a short strip gets fewer, a long one more
  list.forEach((p, i) => groups[Math.min(n - 1, Math.max(0, Math.floor((-p.z + S.back) / len * n)))].push({p, e: edge ? edge[i] : -Math.abs(p.x)}));
  return groups.filter(g => g.length).map(g => { const best = Math.max(...g.map(q => q.e)), mid = g.filter(q => best > 0 ? q.e >= 0.7 * best : q.e === best).map(q => q.p); return mid.sort((a, b) => a.m - b.m)[(mid.length - 1) >> 1]; });
}
export function radarPinsFor(c){            // the radar cells of the strip: place in the scene, thickness, year, other surveys
  if (!c.radarPins) c.radarPins = radarAllFor(c).then(l => (c.radarList = relevantPins(l, c.S, edgeDistances(l, c)))).catch(() => (c.radarList = []));
  return c.radarPins;
}
export function radarAllFor(c){            // every radar cell inside the strip (not only the pins), in the scene's metres: x across, z along (up the glacier is -z)
  if (!c.radarAll) c.radarAll = loadRadar().then(() => ((window.GLACIER_THICKNESS || {})[c.g.inv.id] || []).map(([lat, lng, m, y, all, bed, seis]) => {
    const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), S = c.S, dx = (q.x - S.P.x) / S.k, dy = (q.y - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue;
    return Math.abs(b) > S.half || a < -S.back || a > S.up ? null : {x: b, z: -a, m, y, all, bed, seis: !!seis};      // bed: the radar's own bed elevation (m a.s.l., surface at the survey minus thickness), null in older files
  }).filter(Boolean));
  return c.radarAll;
}
export function drawRadarPin(ctx, h, g, color, multi, u, state){            // state: 0 as it is, 1 under the pointer, 2 chosen
  const r = (state ? 6.5 : 4.4) * u;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3 * u;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], 3 * u, 1.3 * u, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(h[0], h[1] + r); ctx.stroke();
  ctx.fillStyle = color; ctx.strokeStyle = multi ? '#E0483F' : '#fff'; ctx.lineWidth = (state ? 2.4 : 1.6) * u; ctx.beginPath(); ctx.arc(h[0], h[1], r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  if (state) { ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(h[0], h[1], r + 4.5 * u, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.restore();
}
export function drawRadarPins(ctx, c, viewer, W, H, cam, view, u, hover, sel){            // draws the pins that no ridge hides; returns their heads in pixels of the picture
  const pins = c.radarList; if (!pins || !pins.length) return [];
  const eye = viewer.getEye(cam), gys = pins.map(p => viewer.groundY(p.x, p.z)), pts = [];
  pins.forEach((p, i) => pts.push([p.x, gys[i], p.z], [p.x, gys[i] + RADAR_LIFT, p.z]));
  const P = viewer.projectAt(pts, W, H, cam, view), items = [];
  pins.forEach((p, i) => {
    const g = P[2 * i], h = P[2 * i + 1]; if (!g || !h || h[0] < -20 || h[1] < -20 || h[0] > W + 20 || h[1] > H + 20) return;
    const top = [p.x, gys[i] + RADAR_LIFT, p.z]; let hidden = false;      // a ridge between the camera and the head: walk along the line of sight
    for (let k = 1; k < 16 && !hidden; k++) { const t = k / 16, x = eye[0] + (top[0] - eye[0]) * t, y = eye[1] + (top[1] - eye[1]) * t, z = eye[2] + (top[2] - eye[2]) * t; if (viewer.groundIn(x, z) > y - 4) hidden = true; }
    if (!hidden) items.push({i, g, h, d: Math.hypot(top[0] - eye[0], top[1] - eye[1], top[2] - eye[2])});
  });
  items.sort((a, b) => b.d - a.d);      // far ones first
  items.forEach(it => { if (it.i !== hover && it.i !== sel) drawRadarPin(ctx, it.h, it.g, radarColor(pins[it.i].m), !!pins[it.i].all, u, 0); });
  items.forEach(it => { if (it.i === hover || it.i === sel) drawRadarPin(ctx, it.h, it.g, radarColor(pins[it.i].m), !!pins[it.i].all, u, it.i === sel ? 2 : 1); });
  return items;
}
export function placeRadarTip(dpr){            // the text of the chosen pin, or of the one under the pointer, beside its head
  const tip = $('v3dTip'), i = radarSel >= 0 ? radarSel : radarHover, hit = i >= 0 ? radarHits.find(it => it.i === i) : null, c = v3dCtx;
  if (!hit || !c || !c.radarList || !c.radarList[i]) { tip.hidden = true; return; }
  const p = c.radarList[i]; if (tip.dataset.i !== String(i)) { tip.innerHTML = radarPopup(p.m, p.y, p.all, p.seis); tip.dataset.i = i; }
  tip.hidden = false; const cw = $('v3dCanvas').clientWidth, x = hit.h[0] / dpr + 14, flip = x + tip.offsetWidth > cw - 8;
  tip.style.left = Math.max(6, flip ? hit.h[0] / dpr - 14 - tip.offsetWidth : x) + 'px'; tip.style.top = Math.max(6, hit.h[1] / dpr - tip.offsetHeight / 2) + 'px';
}
export function bindRadarPicking(cv){            // hovering, clicking and tapping on the pins; a drag still turns the camera
  let down = null; const near = e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, dpr = Math.min(2, devicePixelRatio || 1), reach = e.pointerType === 'touch' ? 22 : 11; let best = -1, bd = reach * reach;
    radarHits.forEach(it => { const dx = it.h[0] / dpr - x, dy = it.h[1] / dpr - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = it.i; } });
    return best;
  };
  cv.addEventListener('pointerdown', e => { down = {x: e.clientX, y: e.clientY, t: performance.now()}; });
  cv.addEventListener('pointermove', e => { if (e.buttons) { radarHover = -1; return; } const i = near(e); if (i !== radarHover) { radarHover = i; cv.style.cursor = i >= 0 ? 'pointer' : ''; } });
  cv.addEventListener('pointerleave', () => { radarHover = -1; cv.style.cursor = ''; });
  cv.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 600) return;
    const i = near(e); radarSel = i < 0 || i === radarSel ? -1 : i; if (e.pointerType === 'touch') radarHover = -1;
  });
}
/* Camera symbols of the historic photographs: where each photographer stood, as a small camera on a stem in the scene. Hovering one draws what the photograph shows (the wedge of its field of view,
   on the ground of the strip) and a small card with the picture; a click (on a touch screen: a second tap) opens the photograph as in the rail. Only on screen, not in the downloads, and not while a photograph is open. */
export const CAM_LIFT = 70, CAM_LEN = 3200;
export let camHover = -1, camSel = -1, camHits = [], listHover = -1;      // listHover: the thumbnail under the pointer in the "Then and now" list, its camera symbol lights up
export const camsOn = () => !!(thenNowOn && v3dCtx && v3dCtx.photos && v3dCtx.photos.length && !photoOn && state.mode === 'single' && (prefs.camSymbols === true || listHover >= 0));      // the switch "Camera symbols" in the "Then and now" list (off at first); while a thumbnail is hovered its camera shows anyway
export function camGeo(c){            // per photograph: the place in the strip, and the ground directions across its field of view (cached for the glacier)
  if (c.camGeo) return c.camGeo;
  return c.camGeo = c.photos.map(ph => {
    const q = L.CRS.EPSG3857.project(L.latLng(ph.lat, ph.lon)), p = stripXZ(c.S, q.x, q.y), hd = 2 * Math.atan(ph.w / (2 * ph.focal)) * 180 / Math.PI;
    const dirAt = deg => { const th = deg * Math.PI / 180, r = stripXZ(c.S, q.x + Math.sin(th) * 100 * c.S.k, q.y + Math.cos(th) * 100 * c.S.k), dx = r.x - p.x, dz = r.z - p.z, n = Math.hypot(dx, dz) || 1; return [dx / n, dz / n]; };
    return {x: p.x, z: p.z, inside: p.inside, dirs: Array.from({length: 9}, (_, k) => dirAt(ph.az - hd / 2 + hd * k / 8))};
  });
}
export function drawCamWedge(ctx, c, viewer, W, H, g, u){            // the part of the strip the photograph looks at
  const {S} = c, inStrip = (x, z) => Math.abs(x) <= S.half && z >= -S.up && z <= S.back, step = 150, raw = [];
  if (g.inside) raw.push([g.x, g.z]);
  for (let d = step; d <= CAM_LEN; d += step) raw.push([g.x + g.dirs[0][0] * d, g.z + g.dirs[0][1] * d]);
  g.dirs.slice(1, 8).forEach(dir => raw.push([g.x + dir[0] * CAM_LEN, g.z + dir[1] * CAM_LEN]));
  for (let d = CAM_LEN; d >= step; d -= step) raw.push([g.x + g.dirs[8][0] * d, g.z + g.dirs[8][1] * d]);
  const keep = raw.filter(([x, z]) => inStrip(x, z)); if (keep.length < 3) return;
  const P = viewer.projectAt(keep.map(([x, z]) => [x, viewer.groundY(x, z) + 8, z, false]), W, H, null, null).filter(Boolean); if (P.length < 3) return;
  ctx.save(); ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = 'rgba(242,169,59,.24)'; ctx.fill(); ctx.strokeStyle = 'rgba(242,169,59,.95)'; ctx.lineWidth = 2 * u; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
}
export function drawCamSymbol(ctx, g, h, label, hot, u){            // ring on the ground, stem, a round head with a small camera, the year under it
  const [gx, gy] = g, [hx, hy] = h, r = (hot ? 15 : 12) * u, accent = getVar('--accent') || '#C8322A';
  ctx.save();
  if (hot) { ctx.fillStyle = 'rgba(242,169,59,.38)'; ctx.beginPath(); ctx.arc(hx, hy, r + 8 * u, 0, 2 * Math.PI); ctx.fill(); }      // lit: an amber glow round the head
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.8 * u; ctx.beginPath(); ctx.ellipse(gx, gy, 6 * u, 2.6 * u, 0, 0, 2 * Math.PI); ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6 * u; ctx.lineWidth = 1.8 * u; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(hx, hy + r); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = accent; ctx.lineWidth = (hot ? 3.6 : 3) * u; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  const k = r / 12; ctx.fillStyle = accent;      // the camera: a body with a small bump on top and a lens
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(hx - 6.5 * k, hy - 3.6 * k, 13 * k, 8.6 * k, 1.8 * k) : ctx.rect(hx - 6.5 * k, hy - 3.6 * k, 13 * k, 8.6 * k); ctx.fill();
  ctx.fillRect(hx - 2.6 * k, hy - 5.8 * k, 5.2 * k, 2.6 * k);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy + 0.7 * k, 2.5 * k, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `800 ${12.5 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 5 * u; ctx.fillStyle = '#fff'; ctx.fillText(label, hx, hy + r + 3 * u);
  ctx.restore();
}
export function drawPhotoCams(ctx, c, viewer, W, H, u){            // draws the symbols that no ridge hides; returns their heads in pixels of the overlay, for hovering and clicking
  const geo = camGeo(c), pts = [];
  geo.forEach((g, i) => { const base = g.inside ? viewer.groundY(g.x, g.z) : c.photos[i].alt - 40; pts.push([g.x, base, g.z, false], [g.x, base + CAM_LIFT, g.z, g.inside]); });      // outside the strip there is no ground: the camera's own height, and nothing can hide it
  const P = viewer.projectAt(pts, W, H, null, null), items = [], eye = viewer.getEye(null);
  geo.forEach((g, i) => {
    const gr = P[2 * i], h = P[2 * i + 1]; if (!gr || !h || !h[2] || h[0] < -30 || h[1] < -30 || h[0] > W + 30 || h[1] > H + 30) return;
    items.push({i, g: gr, h, d: Math.hypot(g.x - eye[0], g.z - eye[2])});
  });
  items.sort((a, b) => b.d - a.d);
  if (prefs.camSymbols !== true) { const only = items.filter(it => it.i === listHover); items.length = 0; items.push(...only); }      // switch off: just the camera of the thumbnail under the pointer
  const on = listHover >= 0 ? listHover : camSel >= 0 ? camSel : camHover; if (on >= 0 && geo[on]) drawCamWedge(ctx, c, viewer, W, H, geo[on], u);
  items.forEach(it => { if (it.i !== on) drawCamSymbol(ctx, it.g, it.h, c.photos[it.i].year, false, u); });
  items.forEach(it => { if (it.i === on) drawCamSymbol(ctx, it.g, it.h, c.photos[it.i].year, true, u); });
  return items;
}
export function placeCamTip(dpr){            // the card with the photograph of the symbol under the pointer (or the one tapped)
  const tip = $('v3dCamTip'), i = camSel >= 0 ? camSel : camHover, hit = i >= 0 ? camHits.find(it => it.i === i) : null, c = v3dCtx;
  if (!hit || !c || !c.photos || !c.photos[i] || photoOn) { tip.hidden = true; return; }
  const ph = c.photos[i];
  if (tip.dataset.i !== String(i)) { tip.dataset.i = i; tip.textContent = ''; const im = document.createElement('img'); im.src = ph.thumb; im.alt = ''; const b = document.createElement('b'); b.textContent = ph.date.slice(0, 4);
    const t = document.createElement('span'); t.textContent = ' · ' + (ph.title || '').slice(0, 48); const s = document.createElement('small'); s.textContent = 'The orange area is what this photograph shows. ' + (COARSE ? 'Tap here to fly to it in 3D.' : 'Click to open it in 3D.'); tip.append(im, b, t, s); }
  tip.hidden = false;
  /* The card stays inside what the visitor can see: the canvas, cut to the browser window (on a phone the 3D view may be partly scrolled out of sight). Beside the symbol on the right, on the left when there is no room,
     and moved up or down until it fits. */
  const cv = $('v3dCanvas'), r = cv.getBoundingClientRect(), left = Math.max(0, -r.left) + 6, right = Math.min(cv.clientWidth, innerWidth - r.left) - 6, top = Math.max(0, -r.top) + 6, bottom = Math.min(cv.clientHeight, innerHeight - r.top) - 6;
  const w = tip.offsetWidth, h = tip.offsetHeight, hx = hit.h[0] / dpr, hy = hit.h[1] / dpr;
  let x = hx + 18; if (x + w > right) x = hx - 18 - w;
  x = Math.max(left, Math.min(x, right - w));
  const y = Math.max(top, Math.min(hy - 20, bottom - h));
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
$('v3dCamTip').addEventListener('click', () => { const i = Number($('v3dCamTip').dataset.i); if (i >= 0 && v3dCtx && v3dCtx.photos && v3dCtx.photos[i]) { camSel = camHover = -1; $('v3dCamTip').dataset.i = ''; enterPhoto(i); } });      // on a touch screen the card itself is tapped (it takes taps only there, see style.css)
export function bindCamPicking(cv){            // hovering, clicking and tapping on the camera symbols; a drag still turns the camera
  let down = null; const near = e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, dpr = Math.min(2, devicePixelRatio || 1), reach = e.pointerType === 'touch' ? 26 : 16; let best = -1, bd = reach * reach;
    camHits.forEach(it => { const dx = it.h[0] / dpr - x, dy = it.h[1] / dpr - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = it.i; } });
    return best;
  };
  cv.addEventListener('pointerdown', e => { down = {x: e.clientX, y: e.clientY, t: performance.now()}; });
  cv.addEventListener('pointermove', e => { if (e.buttons) { camHover = -1; return; } const i = near(e); if (i !== camHover) camHover = i; if (i >= 0) cv.style.cursor = 'pointer'; });
  cv.addEventListener('pointerleave', () => { camHover = -1; });
  cv.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 600) return;
    const i = near(e);
    if (i < 0) { camSel = -1; return; }
    if (e.pointerType === 'touch' && camSel !== i) { camSel = i; return; }      // a touch screen has no hover: the first tap shows the view, the second opens the photograph
    camSel = camHover = -1; enterPhoto(i);
  });
}

export let pinRun = 0;
export const marksOn = () => photoOn ? !!(photoOn.rod && photoOn.rodOn) : $('pinToggle').checked || $('maxToggle').checked || $('l3Names').checked || !!(v3dCtx && radar3D(v3dCtx.g));
/* ---------- measuring in the 3D view: length of a line and area of a shape on the terrain (ground distances, as on the map) ----------
   A tap puts a point on the terrain (viewer.pick), the lines follow the ground and are drawn on the overlay with the other marks. Drags still turn the camera. */
export const M3 = {mode: null, pts: [], shapes: [], gid: null};      // points are [x, z] of the strip scene, in ground metres
export const measureOn3 = () => !!(M3.mode || M3.shapes.length);
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const len3 = pts => pts.reduce((t, p, i) => i ? t + dist3(pts[i - 1], p) : 0, 0);
export const area3 = pts => Math.abs(pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export function update3Measure(){
  $('v3mDist').setAttribute('aria-pressed', M3.mode === 'dist'); $('v3mArea').setAttribute('aria-pressed', M3.mode === 'area');
  $('v3mClear').hidden = !M3.shapes.length && !M3.pts.length;
  $('v3mSect').setAttribute('aria-pressed', M3.mode === 'sect'); $('v3mSect').hidden = !(v3dCtx && v3dCtx.g.inv && v3dCtx.g.inv.radar);      // only where GLAMOS has radar for the glacier
  $('v3dMHint').classList.toggle('show', !!M3.mode); $('v3d').classList.toggle('measuring', !!M3.mode);
  const el = $('v3dMText'), tap = COARSE ? 'Tap' : 'Click', n = M3.pts.length;
  if (!M3.mode) return;
  if (!n) el.textContent = M3.mode === 'sect' ? `${tap} the terrain on one side of the glacier, then on the other.` : M3.mode === 'dist' ? `${tap} the terrain to start a line.` : `${tap} the terrain to start an area.`;
  else if (M3.mode === 'sect') el.textContent = n === 1 ? `${tap} the other side of the glacier.` : '';
  else if (M3.mode === 'dist') el.textContent = `Length ${fmtLen(len3(M3.pts))}.${COARSE ? '' : ' Double-click or press Finish.'}`;
  else el.textContent = n < 3 ? (COARSE ? 'Add 3 points.' : 'Add at least three points.') : `Area ${fmtArea(area3(M3.pts))}.${COARSE ? '' : ' Double-click or press Finish.'}`;
}
export function start3Measure(mode){
  if (viewMode !== '3d' || !v3dCtx) return;
  if (M3.gid !== v3dCtx.g.id) { M3.shapes = []; M3.gid = v3dCtx.g.id; }
  M3.mode = mode; M3.pts = []; update3Measure(); pinLoop();
}
export function cancel3Measure(){ M3.mode = null; M3.pts = []; update3Measure(); }
export function finish3Measure(){
  const pts = M3.pts.filter((p, i) => i === 0 || dist3(p, M3.pts[i - 1]) > 3), mode = M3.mode;      // a double-click adds the same point twice
  if (pts.length < (mode === 'area' ? 3 : 2)) return cancel3Measure();
  if (mode === 'sect') { M3.shapes = M3.shapes.filter(sh => sh.mode !== 'sect'); M3.mode = null; }      // one cross-section at a time, and the tool is done after its second point
  M3.shapes.push({mode, pts}); M3.pts = []; update3Measure(); pinLoop(); const done = renderSection(); if (mode === 'sect') done.then(focusSection);      // stay in the tool for the next shape; a section: the camera flies to it
}
export let sectCamBack = null;
export function closeSection(){            // leave the cross-section: the line, the cut and the 2D chart go, the camera flies back to where it was
  M3.shapes = M3.shapes.filter(sh => sh.mode !== 'sect'); sect2d = false; update3Measure(); renderSection(); pinLoop();
  if (v3d && sectCamBack) v3d.flyCam(sectCamBack, 900); sectCamBack = null;
}
export function focusSection(){            // the camera flies to the section line, so that it sits big across the picture
  const h = sectHov, viewer = v3d; if (!h || !viewer || !sectLine() || h.sh !== sectLine()) return;
  const lo = Math.min(...h.surf.map(q => q[1]), ...h.mbed.filter(b => b !== null)), hi = Math.max(...h.surf.map(q => q[1]));
  if (!sectCamBack) sectCamBack = viewer.getCam();      // where the camera was before the first flight to a section: the close button flies back to it
  viewer.focusLine({x: h.A[0] + h.ux * h.L / 2, z: h.A[1] + h.uz * h.L / 2, nx: -h.uz, nz: h.ux, L: h.L, relief: hi - lo});
}
export function clear3Measure(){ if (sectLine() && v3d && sectCamBack) v3d.flyCam(sectCamBack, 900); sectCamBack = null; M3.mode = null; M3.pts = []; M3.shapes = []; update3Measure(); renderSection(); }
$('v3mOut').onclick = () => { if (v3d) v3d.zoomBy(1.3); };      // the same steps as the minus and plus of the map
$('v3mIn').onclick = () => { if (v3d) v3d.zoomBy(1 / 1.3); };
$('v3mDist').onclick = () => M3.mode === 'dist' ? cancel3Measure() : start3Measure('dist');
$('v3mArea').onclick = () => M3.mode === 'area' ? cancel3Measure() : start3Measure('area');
$('v3mSect').onclick = () => M3.mode === 'sect' ? cancel3Measure() : start3Measure('sect');
$('v3dSectX').onclick = () => { sect2d = false; renderSection(); };
$('v3dCutClose').onclick = closeSection;
$('v3dCutYears').onclick = () => { sectYearsOn = !sectYearsOn; renderSection(); };
$('v3mSect2d').onclick = () => { sect2d = !sect2d; renderSection(); };
$('v3mClear').onclick = clear3Measure; $('v3mFinish').onclick = finish3Measure; $('v3mCancel').onclick = cancel3Measure;

/* ---------- thickness cross-section: a line across the glacier; the surface comes from the 3D grid on screen (viewer.elev), the ice depth from the GLAMOS radar cells beside the line.
   The bed at a radar cell is computed here as surface minus radar depth, and said so. The radar was flown in the years named in the note; the ice has thinned since. ---------- */
export const DISAGREE_M = 30, DISAGREE_F = 0.25;      // a dot is drawn open when the model bed differs from the radar bed by more than 30 m or a quarter of the radar thickness
export const SECT_BUF = 50, SECT_GAP = 125;      // metres: how far from the line a radar cell still counts (owner: stay within 50 m), and the largest gap in the bed line that is drawn through
export let sectKey = '', sect2d = false;      // sect2d: the 2D chart of the section is open
export function bedAt(c, x, z){            // the swissBEDROCK bed (m a.s.l.) at a place of the strip, bilinear on the grid of the file, or null (no bed in the file)
  const b = c.bundle; if (!b || !b.bed) return null;
  const S = c.S, len = S.up + S.back, W = b.nB + 1, fx = Math.min(b.nB, Math.max(0, (x + S.half) / (2 * S.half) * b.nB)), fz = Math.min(b.nA, Math.max(0, (z + S.up) / len * b.nA)), i = Math.min(b.nB - 1, Math.floor(fx)), j = Math.min(b.nA - 1, Math.floor(fz)), ax = fx - i, az = fz - j, a = b.bed;
  return (a[j * W + i] * (1 - ax) + a[j * W + i + 1] * ax) * (1 - az) + (a[(j + 1) * W + i] * (1 - ax) + a[(j + 1) * W + i + 1] * ax) * az;
}
export const sectSurfYear = c => c.usesDem && c.elevFirst && !c.cmp && c.current() < c.elevFirst ? c.elevFirst : c.current();      // the year of the ice surface on screen: the elevation models start in elevFirst (2016 in Switzerland), older pictures are draped on that surface
export const sectEarly = c => !c.cmp && sectSurfYear(c) !== c.current();
export const sectEarlyText = c => `Elevation models start in ${c.elevFirst}: the surface is that of ${c.elevFirst}, and the picture of ${c.current()} is draped on it.`;
export let sectYearsOn = false;      // the ice surface of the other years is drawn on the section too
export function gridAt(c, arr, x, z){            // a height grid of the strip (nA+1 rows by nB+1 columns), bilinear at a place of the strip
  const S = c.S, nA = c.grid.nA, nB = c.grid.nB, W = nB + 1, len = S.up + S.back, fx = Math.min(nB, Math.max(0, (x + S.half) / (2 * S.half) * nB)), fz = Math.min(nA, Math.max(0, (z + S.up) / len * nA)), i = Math.min(nB - 1, Math.floor(fx)), j = Math.min(nA - 1, Math.floor(fz)), ax = fx - i, az = fz - j;
  return (arr[j * W + i] * (1 - ax) + arr[j * W + i + 1] * ax) * (1 - az) + (arr[(j + 1) * W + i] * (1 - ax) + arr[(j + 1) * W + i + 1] * ax) * az;
}
export const yearColour = (y, y0, y1) => { const t = y1 > y0 ? (y - y0) / (y1 - y0) : 1, a = [200, 50, 42], b = [63, 155, 196]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; };      // old: the red of loss, new: the blue of ice
export function sectOthers(c, A, ux, uz, surf){            // the other years: for each, its surface minus the surface shown, along the line (m): d > 0 means higher than the one shown
  if (!sectYearsOn || c.cmp || !c.usesDem || !c.surface) return [];
  const cur = sectSurfYear(c), cache = c.sectSurf || (c.sectSurf = new Map()), get = y => { let a = cache.get(y); if (!a) cache.set(y, a = c.surface(y)); return a; }, base = get(cur), at = (arr, q) => gridAt(c, arr, A[0] + ux * q[0], A[1] + uz * q[0]), b0 = surf.map(q => at(base, q));
  const out = []; [...new Set([...YEARS, ...c.years])].filter(y => y !== cur).sort().forEach(y => { const d = surf.map((q, i) => at(get(y), q) - b0[i]); if (!d.every(v => Math.abs(v) < 0.01) && !out.some(o => o.d.every((v, i) => Math.abs(v - d[i]) < 0.01))) out.push({y, d}); });      // a year the surface model does not tell apart from another one (before its first year, after its last) is left out
  return out;
}
export const sectBedOn = () => !!(sectLine() && v3dCtx && v3dCtx.bundle && v3dCtx.bundle.bed) && !document.body.classList.contains('pane-open');      // the model bed is on the section panel (not in downloads): its credit shows in the note
export function sectLine(){ return M3.shapes.find(sh => sh.mode === 'sect') || null; }
export async function renderSection(){
  const box = $('v3dSect'), sh = sectLine(), c = v3dCtx, viewer = v3d;
  if (!sh || !c || !viewer || M3.gid !== c.g.id || !(c.g.inv && c.g.inv.radar)) { box.hidden = true; sectKey = ''; if (!sh) sect2d = false; $('v3mSect2d').hidden = true; creditNote(); return; }
  const [A, B] = sh.pts, L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  sectKey = sectStamp(viewer, sh);      // before the wait: the loop in pinLoop compares it every frame
  const all = await radarAllFor(c).catch(() => []); if (sectLine() !== sh || v3dCtx !== c || v3d !== viewer) return;
  const pts = all.map(p => ({p, t: (p.x - A[0]) * ux + (p.z - A[1]) * uz, off: (p.x - A[0]) * uz - (p.z - A[1]) * ux})).filter(q => q.t >= 0 && q.t <= L && Math.abs(q.off) <= SECT_BUF).sort((a, b) => a.t - b.t);
  pts.forEach(q => { q.s = viewer.elev(q.p.x, q.p.z); q.own = q.p.bed !== null && q.p.bed !== undefined; q.bed = q.own ? q.p.bed : q.s - q.p.m; const mb = bedAt(c, q.p.x, q.p.z); q.far = q.own && mb !== null && Math.abs(mb - q.p.bed) > Math.max(DISAGREE_M, DISAGREE_F * q.p.m); });      // the radar's own bed, where the file has it (it does not move when the ice thins); far: the model bed is clearly elsewhere
  const n = Math.max(2, Math.ceil(L / 10) + 1), surf = Array.from({length: n}, (_, i) => { const t = L * i / (n - 1); return [t, viewer.elev(A[0] + ux * t, A[1] + uz * t)]; });
  const others = sectOthers(c, A, ux, uz, surf), W = 560, ml = 44, mr = 8, mt = 8, mb = 24, pw = W - ml - mr;
  const mbed = surf.map(q => { const b = bedAt(c, A[0] + ux * q[0], A[1] + uz * q[0]); return b === null ? null : Math.min(b, q[1]); });      // the model bed, never above the surface of the grid on screen
  const hasM = mbed.some((b, i) => b !== null && surf[i][1] - b > 0.5), lo0 = Math.min(...surf.map(q => q[1]), ...pts.map(q => q.bed), ...mbed.filter(b => b !== null)), hi0 = Math.max(...surf.map(q => q[1]), ...others.map(o => Math.max(...o.d.map((d, i) => surf[i][1] + d)))), pad = (hi0 - lo0) * 0.06 + 5, lo = lo0 - pad, hi = hi0 + pad, ph = Math.round(Math.max(80, Math.min(230, (hi - lo) * pw / L))), H = ph + mt + mb;      // true scale (1 : 1) where it fits, else squeezed or stretched to between 80 and 230 px
  const X = t => ml + t / L * pw, Y = e => mt + (hi - e) / (hi - lo) * ph, f1 = v => v.toFixed(1);
  const step = [10, 20, 50, 100, 200, 500].find(st => (hi - lo) / st <= 5) || 500, ticks = []; for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) ticks.push(e);
  let svg = ticks.map(e => `<line x1="${ml}" x2="${W - mr}" y1="${f1(Y(e))}" y2="${f1(Y(e))}" stroke="var(--rule)"/><text x="${ml - 5}" y="${f1(Y(e) + 3.5)}" text-anchor="end" font-size="10" fill="var(--moraine)">${e.toLocaleString('en')}</text>`).join('');
  const runs = []; pts.forEach(q => { const r = runs[runs.length - 1]; if (r && q.t - r[r.length - 1].t <= SECT_GAP) r.push(q); else runs.push([q]); });
  const ice = []; surf.forEach((q, i) => { if (mbed[i] !== null && q[1] - mbed[i] > 0.5) { const r = ice[ice.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else ice.push([i]); } });      // stretches where the model has ice
  if (hasM) ice.filter(r => r.length > 1).forEach(r => {
    svg += `<polygon points="${[...r.map(i => `${f1(X(surf[i][0]))},${f1(Y(surf[i][1]))}`), ...r.slice().reverse().map(i => `${f1(X(surf[i][0]))},${f1(Y(mbed[i]))}`)].join(' ')}" fill="var(--crevasse)" fill-opacity=".22"/>`;
    svg += `<polyline points="${r.map(i => `${f1(X(surf[i][0]))},${f1(Y(mbed[i]))}`).join(' ')}" fill="none" stroke="var(--rock)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
  });
  if (!hasM) runs.filter(r => r.length > 1).forEach(r => {      // without a model bed: the ice between the surface and the bed, where the radar cells follow each other
    const top = surf.filter(q => q[0] >= r[0].t && q[0] <= r[r.length - 1].t).map(q => `${f1(X(q[0]))},${f1(Y(q[1]))}`), bot = r.slice().reverse().map(q => `${f1(X(q.t))},${f1(Y(q.bed))}`);
    svg += `<polygon points="${[`${f1(X(r[0].t))},${f1(Y(r[0].s))}`, ...top, ...bot].join(' ')}" fill="var(--crevasse)" fill-opacity=".28"/>`;
    svg += `<polyline points="${r.map(q => `${f1(X(q.t))},${f1(Y(q.bed))}`).join(' ')}" fill="none" stroke="var(--rock)" stroke-width="1.6"/>`;
  });
  if (others.length) { const y0 = others[0].y, y1 = others[others.length - 1].y; others.forEach(o => { svg += `<polyline points="${surf.map((q, i) => `${f1(X(q[0]))},${f1(Y(q[1] + o.d[i]))}`).join(' ')}" fill="none" stroke="${yearColour(o.y, Math.min(y0, sectSurfYear(c)), Math.max(y1, sectSurfYear(c)))}" stroke-width="1.2" stroke-opacity=".85"><title>${o.y}</title></polyline>`; }); }
  svg += `<polyline points="${surf.map(q => `${f1(X(q[0]))},${f1(Y(q[1]))}`).join(' ')}" fill="none" stroke="var(--crevasse)" stroke-width="2.2" stroke-linejoin="round"/>`;
  pts.forEach(q => { svg += `<g><title>${q.p.m} m of ice${q.p.y ? ` (${q.p.seis ? 'seismic' : 'radar'} ${q.p.y})` : ''} · bed ${Math.round(q.bed).toLocaleString('en')} m a.s.l.${q.own ? ' (from the radar file)' : ' (computed)'}${q.far ? ' · the swissBEDROCK bed is far from it' : ''}</title><line x1="${f1(X(q.t))}" x2="${f1(X(q.t))}" y1="${f1(Y(q.s))}" y2="${f1(Y(q.bed))}" stroke="${radarColor(q.p.m)}" stroke-width="1.2" stroke-opacity=".7"/><circle cx="${f1(X(q.t))}" cy="${f1(Y(q.bed))}" r="3.6" fill="${q.far ? '#fff' : radarColor(q.p.m)}" stroke="${q.far ? radarColor(q.p.m) : '#fff'}" stroke-width="${q.far ? 1.8 : 1.2}"/></g>`; });
  svg += `<text x="${ml}" y="${H - 7}" font-size="11" font-weight="700" fill="var(--rock)" text-anchor="start">A</text><text x="${W - mr}" y="${H - 7}" font-size="11" font-weight="700" fill="var(--rock)" text-anchor="end">B</text><text x="${ml + pw / 2}" y="${H - 7}" font-size="10" fill="var(--moraine)" text-anchor="middle">${fmtLen(L)}</text>`;
  $('v3dSectSvg').setAttribute('viewBox', `0 0 ${W} ${H}`); $('v3dSectSvg').innerHTML = svg + '<g id="v3dSectHv" pointer-events="none"></g>';
  sectHov = {W, H, ml, mt, pw, ph, L, n, surf, mbed, pts, X, Y, sh, A, ux, uz, hasM, hasBed: pts.length > 0, others};
  const years = [...new Set(pts.map(q => q.p.y).filter(Boolean))].sort(), yr = c.cmp ? 'as on screen' : sectSurfYear(c), exag = (ph / (hi - lo)) / (pw / L);
  const sl = surf.reduce((t, q, i) => i ? t + Math.hypot(q[0] - surf[i - 1][0], q[1] - surf[i - 1][1]) : 0, 0);
  $('v3dSectInfo').textContent = `${fmtLen(L)} line · ${fmtLen(sl)} along the surface ${yr}`;
  const open = !!($('v3dSectNote').querySelector('details') || {}).open, cnt = pts.length, sw = (css, extra = '') => `<i class="sw" style="${css}${extra}"></i>`, anyFar = pts.some(q => q.far), anyOwn = pts.some(q => q.own);
  const lg = [`<span>${sw('width:20px;border-top:2.2px solid var(--crevasse)')}Ice surface (3D grid)</span>`,
    hasM ? `<span>${sw('width:20px;border-top:1.6px dashed var(--rock)')}Bed, swissBEDROCK (model)</span>` : '',
    others.length ? `<span>${sw('width:30px;height:3px;background:linear-gradient(90deg,#C8322A,#3F9BC4)')}Surface of the other years, ${others[0].y} to ${others[others.length - 1].y}</span>` : '',
    cnt ? `<span>${sw('width:8px;height:8px;border-radius:50%;background:#3F9BC4;border:1.5px solid #fff;box-shadow:0 0 0 .6px #8a979e')}Radar bed: ${cnt} cell${cnt === 1 ? '' : 's'} within ${SECT_BUF} m${years.length ? `, flown ${years.join(', ')}` : ''}</span>` : '',
    anyFar ? `<span>${sw('width:8px;height:8px;border-radius:50%;background:#fff;border:1.5px solid #3F9BC4')}Model bed far from it</span>` : ''].filter(Boolean).join('');
  const about = `<ul>
    <li><b>Surface:</b> the ice surface of the year shown, from the 3D grid, in m a.s.l.</li>
    ${hasM ? `<li><b>Model bed:</b> swissBEDROCK (Federal Office of Topography swisstopo): swissALTI3D minus a modelled ice thickness (GLAMOS 2020). A model, and a maximum estimate of the bed.</li>` : ''}
    ${cnt ? `<li><b>Dots:</b> picked points of the GLAMOS radar release, at ${anyOwn ? 'the bed elevation of the radar file (surface at the survey minus thickness)' : 'surface minus radar depth (computed)'}. The model used other surveys too, so a missing dot is not a missing measurement. Hover a dot for thickness, year and method.</li>` : ''}
    ${anyFar ? `<li><b>Open dots:</b> the model bed is more than ${DISAGREE_M} m or a quarter of the radar thickness away (computed).</li>` : ''}
    <li><b>Scale:</b> ${Math.abs(exag - 1) > 0.05 ? `vertical ${exag.toFixed(1)}× the horizontal (computed).` : 'both axes at the same scale.'}</li></ul>`;
  $('v3dSectNote').innerHTML = cnt
    ? `<div class="lg">${lg}</div>${sectEarly(c) ? `<div class="early">${sectEarlyText(c)}</div>` : ''}<details${open ? ' open' : ''}><summary>About this chart</summary>${about}</details>`
    : `<div class="lg">${lg}</div>${sectEarly(c) ? `<div class="early">${sectEarlyText(c)}</div>` : ''}No radar cell within ${SECT_BUF} m of this line: the surface is shown, the ice depth is not. Draw the line across a radar profile (switch on “Radar ice thickness” in Layers to see where they run).`;
  $('v3mSect2d').hidden = false; $('v3mSect2d').setAttribute('aria-pressed', sect2d); box.hidden = !sect2d; if (sect2d) placeSect(); creditNote();      // the 2D chart opens from its button in the dock; the values are always on the cut in the 3D picture (hover)
}
export let sectHov = null;
export function placeSect(){            // the panel sits above the dock (whatever its height: timeline row, wrapped buttons) and never taller than the room above it
  const box = $('v3dSect'), st = box.offsetParent, dock = $('v3dMeasure'); if (box.hidden || !st || !dock) return;
  const bottom = Math.max(12, st.clientHeight - dock.offsetTop + 10), want = bottom + 'px', room = Math.max(120, st.clientHeight - bottom - 70) + 'px';
  if (box.style.bottom !== want) box.style.bottom = want; if (box.style.maxHeight !== room) { box.style.maxHeight = room; box.style.overflowY = 'auto'; }
}
const sectM = v => v === null || v === undefined ? '–' : Math.round(v).toLocaleString('en'), sectD = (u, v) => u === null || v === null || u === undefined || v === undefined ? '–' : sectM(Math.abs(u - v));
export function sectAt(t){            // the values at distance t from A: surface and model bed from the grids, the nearest radar cell (within 12 m)
  const h = sectHov; if (!h) return null;
  const f = Math.min(h.n - 1, Math.max(0, t / h.L * (h.n - 1))), i = Math.min(h.n - 2, Math.floor(f)), a = f - i, lerp = (p, q) => p + (q - p) * a;
  const s = lerp(h.surf[i][1], h.surf[i + 1][1]), b0 = h.mbed[i], b1 = h.mbed[i + 1], mb = b0 !== null && b1 !== null ? lerp(b0, b1) : null;
  const near = h.pts.reduce((best, q) => { const d = Math.abs(q.t - t); return d <= 12 && (!best || d < best.d) ? {q, d} : best; }, null), rq = near && near.q;
  const mThk = mb !== null ? Math.max(0, s - mb) : null;
  return {t, s, mb, rq, mThk, ice: mThk !== null && mThk >= ICE_MIN, rBed: rq ? rq.bed : null, rThk: rq ? rq.p.m : null, rSurf: rq ? (rq.own ? rq.bed + rq.p.m : rq.s) : null,      // radar surface: the survey's own surface (bed + thickness, computed) where the file has the bed, else the grid on screen
    rows: null, note: rq ? `radar ${rq.p.y || ''} ${rq.p.seis ? 'seismic' : ''}${rq.own ? ' · surface = bed + thickness' : ''}`.replace(/\s+/g, ' ').trim() : ''};
}
const ICE_MIN = 5;      // metres: below this computed thickness (surface of the year minus model bed) there is no ice to speak of: the model 'bed' there is the ground (swissALTI3D), the few metres are the difference between two surfaces
const groundLine = v => !v.ice && v.mb !== null ? `Ground: ${REGION.terrain.html.replace(/<[^>]+>/g, '')}` : '';      // outside the ice the height is the terrain model of the region (the site's own credit text for the 3D terrain), not a bedrock model
const sectRows = v => [['Surface', v.s, v.rSurf], [v.ice || v.mb === null ? 'Bed' : 'Ground', v.mb, v.rBed], ['Thickness', v.ice ? v.mThk : null, v.rThk]];
export function showSectHover(t){            // on the chart: a line, dots and the table of values at t; null clears it
  const h = sectHov, g = $('v3dSectHv'); if (!g) return; if (!h || t === null) { g.innerHTML = ''; return; }
  const v = sectAt(t), rq = v.rq, X = h.ml + t / h.L * h.pw, rows = sectRows(v), cw = rq ? [54, 44, 44, 40] : [54, 44, 0, 0], gl = groundLine(v), bw = Math.max(cw.reduce((x, y) => x + y, 0) + 14, gl.length * 4.7 + 14), bh = 13 * (rows.length + 4) + 8 + (rq ? 11 : 0) + (gl ? 13 : 0), mYr = v3dCtx.cmp ? 'on screen' : sectSurfYear(v3dCtx), rYr = rq && rq.p.y ? rq.p.y : '–';      // the year of the elevation model (the surface shown) and the year of the radar survey, under the column names
  const right = X + 10 + bw > h.W - 2, bx = right ? X - 10 - bw : X + 10, by = h.mt + 2, cx = [bx + 7, bx + 7 + cw[0] + cw[1], bx + 7 + cw[0] + cw[1] + cw[2], bx + 7 + cw[0] + cw[1] + cw[2] + cw[3]];      // cx[1], cx[2], cx[3]: right edges of the Model, Radar and Diff columns
  const T = (x, k, str, o = '') => `<text x="${x.toFixed(1)}" y="${by + 11 + k * 13}" font-size="10.5" fill="var(--ink)"${o}>${str}</text>`, E = ' text-anchor="end"';
  g.innerHTML = `<line x1="${X.toFixed(1)}" x2="${X.toFixed(1)}" y1="${h.mt}" y2="${h.mt + h.ph}" stroke="var(--rock)" stroke-width="1" stroke-dasharray="3 3"/>`
    + `<circle cx="${X.toFixed(1)}" cy="${h.Y(v.s).toFixed(1)}" r="3.5" fill="var(--crevasse)" stroke="#fff" stroke-width="1.2"/>`
    + (v.mb !== null ? `<circle cx="${X.toFixed(1)}" cy="${h.Y(v.mb).toFixed(1)}" r="3.5" fill="var(--rock)" stroke="#fff" stroke-width="1.2"/>` : '')
    + (rq ? `<circle cx="${X.toFixed(1)}" cy="${h.Y(rq.bed).toFixed(1)}" r="4.5" fill="none" stroke="var(--accent)" stroke-width="1.8"/>` : '')
    + `<rect x="${bx.toFixed(1)}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="var(--sheet)" fill-opacity=".95" stroke="var(--rule)"/>`
    + T(cx[0], 0, 'm a.s.l. · m', ' fill-opacity=".55" font-size="9.5"') + T(cx[1], 0, 'Model', E + ' font-weight="700"') + (rq ? T(cx[2], 0, 'Radar', E + ' font-weight="700"') + T(cx[3], 0, 'Diff.', E + ' font-weight="700"') : '')
    + T(cx[1], 1, mYr, E + ' fill-opacity=".65" font-size="9"') + (rq ? T(cx[2], 1, rYr, E + ' fill-opacity=".65" font-size="9"') : '')
    + rows.map(([lab, mv, rv], k) => T(cx[0], k + 2, lab) + T(cx[1], k + 2, sectM(mv), E) + (rq ? T(cx[2], k + 2, sectM(rv), E) + T(cx[3], k + 2, sectD(mv, rv), E + ' font-weight="600"') : '')).join('')
    + T(cx[0], rows.length + 2, `${fmtLen(t)} from A`, ' fill-opacity=".6" font-size="9.5"') + (rq ? T(cx[0], rows.length + 3, v.note, ' fill-opacity=".6" font-size="9"') : '') + (gl ? T(cx[0], rows.length + 3 + (rq ? 1 : 0), gl, ' fill-opacity=".6" font-size="9"') : '');
}
{ const svgEl = $('v3dSectSvg');
  svgEl.addEventListener('pointerleave', () => showSectHover(null));
  svgEl.addEventListener('pointermove', e => {
    const h = sectHov; if (!h) return;
    const r = svgEl.getBoundingClientRect(), vx = (e.clientX - r.left) * h.W / r.width;
    showSectHover(vx < h.ml || vx > h.ml + h.pw ? null : (vx - h.ml) / h.pw * h.L);
  });
}
export let cutHit = null, cutMark = null;            // cutHit: the wall of the 3D cut as drawn last (pixels of the overlay), cutMark: the distance along the line under the pointer
{ const tip = $('v3dCutTip'), over = () => $('v3dOver');
  const off = () => { if (cutMark !== null) { cutMark = null; showSectHover(null); } tip.hidden = true; };
  $('v3d').addEventListener('pointerleave', off);
  $('v3d').addEventListener('pointermove', e => {            // hover on the wall of the cut: the same values as on the chart, beside the pointer
    if (!cutHit || M3.mode || e.buttons || (e.target.closest && e.target.closest('button, .layerbox, input, .v3d-sect, .v3d-measure, .v3d-mhint, .v3d-cutcap, a'))) return off();
    const cv = over(), r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height, {T, B, ts} = cutHit;
    let hit = null;
    for (let i = 0; i < T.length - 1 && !hit; i++) {            // the wall is a strip of small quadrangles: which one is under the pointer
      const q = [T[i], T[i + 1], B[i + 1], B[i]]; let ins = false;
      for (let a = 0, b = 3; a < 4; b = a++) if ((q[a][1] > py) !== (q[b][1] > py) && px < (q[b][0] - q[a][0]) * (py - q[a][1]) / (q[b][1] - q[a][1]) + q[a][0]) ins = !ins;
      if (ins) { const dx = T[i + 1][0] - T[i][0], a = Math.abs(dx) < 1e-6 ? .5 : Math.min(1, Math.max(0, (px - T[i][0]) / dx)); hit = ts[i] + (ts[i + 1] - ts[i]) * a; }
    }
    if (hit === null) return off();
    cutMark = hit; showSectHover(hit); pinLoop();
    const v = sectAt(hit), rq = v.rq, rows = sectRows(v), st = $('v3d').getBoundingClientRect();
    tip.innerHTML = `<table><thead><tr><th>m a.s.l. · m</th><th>Model<small>${v3dCtx.cmp ? 'on screen' : sectSurfYear(v3dCtx)}</small></th>${rq ? `<th>Radar<small>${rq.p.y || '–'}</small></th><th>Diff.</th>` : ''}</tr></thead><tbody>${rows.map(([lab, mv, rv]) => `<tr><td>${lab}</td><td>${sectM(mv)}</td>${rq ? `<td>${sectM(rv)}</td><td><b>${sectD(mv, rv)}</b></td>` : ''}</tr>`).join('')}</tbody></table><small>${fmtLen(hit)} from A${rq ? ` · ${v.note}` : ''}</small>${groundLine(v) ? `<small>${groundLine(v)}</small>` : ''}`;
    tip.hidden = false; const tw = tip.offsetWidth, th = tip.offsetHeight, sx = r.width / cv.width, sy = r.height / cv.height, ox = r.left - st.left, oy = r.top - st.top, cx = e.clientX - st.left, cy = e.clientY - st.top;
    const taken = cutLabels.map(l => [ox + l[0] * sx, oy + l[1] * sy, ox + l[2] * sx, oy + l[3] * sy]), dock = $('v3dMeasure'), dr = dock ? [dock.offsetLeft - 6, dock.offsetTop - 6, dock.offsetLeft + dock.offsetWidth + 6, dock.offsetTop + dock.offsetHeight + 6] : null;
    const blocked = [...taken, ...(dr ? [dr] : []), [cx - 14, cy - 14, cx + 14, cy + 14]], clampX = x => Math.max(6, Math.min(st.width - tw - 6, x)), clampY = y => Math.max(6, Math.min(st.height - th - 6, y));
    const overlap = ([x, y]) => blocked.reduce((t, b) => { const ox2 = Math.min(x + tw, b[2]) - Math.max(x, b[0]), oy2 = Math.min(y + th, b[3]) - Math.max(y, b[1]); return t + (ox2 > 0 && oy2 > 0 ? ox2 * oy2 : 0); }, 0);
    let at = null, best = Infinity;      // beside the pointer, where it covers neither a label of the cut, the dock nor the pointer: the nearest free place of a grid around it, else the one covering least
    for (let dy = -300; dy <= 300; dy += 20) for (let dx = -360; dx <= 360; dx += 20) { const c2 = [clampX(cx + dx - (dx < 0 ? tw : 0)), clampY(cy + dy - (dy < 0 ? th : 0))], o = overlap(c2), d = Math.hypot(dx, dy), score = o * 1000 + d; if (score < best) { best = score; at = c2; } }
    tip.style.left = at[0] + 'px'; tip.style.top = at[1] + 'px';
  });
}
/* ---------- export of the 2D chart: SVG (drawing), PNG (picture), CSV (the numbers) ---------- */
const sectName = ext => { const c = v3dCtx; return `tonguesfromspace-${c.g.id}-cross-section-${c.cmp ? 'compare' : c.current()}.${ext}`; };
const saveBlob = (blob, name) => { const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
export function sectSvgText(){            // the chart as a stand-alone SVG: white page, title and sources, colours written out (the page's variables do not exist in a file)
  const svg = $('v3dSectSvg'), c = v3dCtx; if (!sectHov || !c) return null;
  const cs = getComputedStyle(svg), col = n => cs.getPropertyValue(n).trim() || '#22313A', inner = svg.innerHTML.replace(/<g id="v3dSectHv"[^>]*>.*?<\/g>/s, '').replace(/var\((--[\w-]+)\)/g, (_, n) => col(n));
  const W = sectHov.W, H = sectHov.H, top = 40, esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const title = `${c.g.name || c.g.id} · thickness cross-section · ${c.cmp ? 'as on screen' : sectSurfYear(c)}`, info = $('v3dSectInfo').textContent;
  const lines = [`Surface: ice surface of ${sectSurfYear(c)}, from the 3D grid (m a.s.l.).`, ...(sectEarly(c) ? [sectEarlyText(c)] : []), 'Dashed line: model bed, swissBEDROCK © swisstopo (a model, a maximum estimate).', ...(sectHov.pts.length ? ['Dots: GLAMOS radar points; bed = surface minus radar thickness where the file has none (computed).'] : []), 'tonguesfromspace.org'], foot = lines.length * 13 + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + top + foot}" width="${W * 2}" height="${(H + top + foot) * 2}" font-family="Schibsted Grotesk, Helvetica, Arial, sans-serif"><rect width="${W}" height="${H + top + foot}" fill="#fff"/>`
    + `<text x="${sectHov.ml}" y="18" font-size="13" font-weight="700" fill="#C8322A">${esc(title)}</text><text x="${sectHov.ml}" y="33" font-size="10.5" fill="#5b6a73">${esc(info)}</text>`
    + `<g transform="translate(0 ${top})">${inner}</g>` + lines.map((l, i) => `<text x="${sectHov.ml}" y="${H + top + 16 + i * 13}" font-size="9" fill="#5b6a73">${esc(l)}</text>`).join('') + '</svg>';
}
export function sectCsvText(){
  const h = sectHov, c = v3dCtx; if (!h || !c) return null;
  const f = (v, d = 1) => v === null || v === undefined ? '' : v.toFixed(d), rows = [
    `# ${c.g.name || c.g.id}: thickness cross-section, surface of ${c.cmp ? 'the years on screen' : sectSurfYear(c)}${sectEarly(c) ? ` (${sectEarlyText(c)})` : ''}; line ${f(h.L, 0)} m long, from A to B`,
    '# distance_m: from A along the line. surface_m_asl: ice surface of the year shown, from the 3D grid.',
    '# model_bed_m_asl: swissBEDROCK (swisstopo), a model, a maximum estimate of the bed. model_thickness_m: computed here as surface minus model bed.',
    'distance_m,surface_m_asl,model_bed_m_asl,model_thickness_m'];
  h.surf.forEach((q, i) => rows.push([f(q[0]), f(q[1]), f(h.mbed[i]), h.mbed[i] === null ? '' : f(Math.max(0, q[1] - h.mbed[i]))].join(',')));
  if (h.pts.length) {
    rows.push('', '# GLAMOS radar cells within 50 m of the line. radar_bed_m_asl: the radar file\'s bed where it has one, else computed as surface (grid) minus thickness.', 'radar_distance_m,offset_from_line_m,radar_thickness_m,radar_bed_m_asl,bed_from,survey_year,method');
    h.pts.forEach(q => rows.push([f(q.t), f(q.off), q.p.m, f(q.bed), q.own ? 'radar file' : 'computed', q.p.y || '', q.p.seis ? 'seismic' : 'radar'].join(',')));
  }
  return rows.join('\n') + '\n';
}
$('v3dSectSvgDl').onclick = () => { const t = sectSvgText(); if (t) saveBlob(new Blob([t], {type: 'image/svg+xml'}), sectName('svg')); };
$('v3dSectCsvDl').onclick = () => { const t = sectCsvText(); if (t) saveBlob(new Blob([t], {type: 'text/csv'}), sectName('csv')); };
$('v3dSectPngDl').onclick = () => {
  const t = sectSvgText(); if (!t) return;
  const img = new Image(), url = URL.createObjectURL(new Blob([t], {type: 'image/svg+xml'}));
  img.onload = () => { const k = 3, cv = document.createElement('canvas'); cv.width = img.naturalWidth * k / 2; cv.height = img.naturalHeight * k / 2; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cv.toBlob(b => b && saveBlob(b, sectName('png')), 'image/png'); };
  img.onerror = () => { URL.revokeObjectURL(url); showNotice('The picture could not be made; the SVG download works.'); };
  img.src = url;
};
export const creditNote = () => { const c = v3dCtx; if (!c) return; const lc = $('v3dLc'); if (lc) lc.textContent = layersCreditText(c.g); const ls = $('v3dLcS'); if (ls) ls.textContent = shortLayerNames(c.g); };
export const sectStamp = (viewer, sh) => { const [A, B] = sh.pts; return `${v3dCtx.cmp ? v3dCtx.cmp.join('-') : v3dCtx.current()}|${viewer.elev((A[0] + B[0]) / 2, (A[1] + B[1]) / 2).toFixed(2)}|${viewer.elev(A[0], A[1]).toFixed(2)}`; };      // changes when another year's surface is set
export let m3Down = null;
$('v3d').addEventListener('pointerdown', e => { m3Down = M3.mode && !(e.target.closest && e.target.closest('button, .layerbox, input, .v3d-div, .v3d-measure, .v3d-mhint, a')) ? {x: e.clientX, y: e.clientY, t: performance.now()} : null; });
$('v3d').addEventListener('pointerup', e => {
  const d0 = m3Down; m3Down = null; if (!d0 || !M3.mode || !v3d) return;
  if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 8 || performance.now() - d0.t > 600) return;      // a drag turns the camera, only a tap places a point
  const r = $('v3dCanvas').getBoundingClientRect(), p = v3d.pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  if (!p) return showNotice('Tap on the terrain, inside the picture.');
  M3.pts.push(p); update3Measure(); pinLoop();
  if (M3.mode === 'sect' && M3.pts.length === 2) finish3Measure();      // a section is just two points
});
$('v3d').addEventListener('dblclick', () => { if (M3.mode) finish3Measure(); });
export function surfaceValue(sh, viewer){            // the shape on the ice surface of the year shown: length along it, or the area of the surface inside, from the 3D grid on screen; redone when another year's heights are set
  const c = v3dCtx, P = sh.pts, key = `${c.cmp ? c.cmp.join('-') : c.current()}|${viewer.elev(P[0][0], P[0][1]).toFixed(2)}|${viewer.elev(P[P.length - 1][0], P[P.length - 1][1]).toFixed(2)}|${viewer.elev(P[P.length >> 1][0], P[P.length >> 1][1]).toFixed(2)}`;
  if (sh.sv && sh.sv.key === key) return sh.sv.text;
  const e = (x, z) => { const v = viewer.elev(x, z); return Number.isFinite(v) ? v : null; };
  let text;
  if (sh.mode === 'area') {
    const xs = P.map(q => q[0]), zs = P.map(q => q[1]), STEP = 14, inside = (x, z) => { let k = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) k = !k; return k; };
    let A = 0; for (let x = Math.min(...xs) + STEP / 2; x < Math.max(...xs); x += STEP) for (let z = Math.min(...zs) + STEP / 2; z < Math.max(...zs); z += STEP) {
      if (!inside(x, z)) continue; const a = e(x + STEP, z), b = e(x - STEP, z), cc = e(x, z + STEP), d = e(x, z - STEP), gx = a !== null && b !== null ? (a - b) / (2 * STEP) : 0, gz = cc !== null && d !== null ? (cc - d) / (2 * STEP) : 0;
      A += STEP * STEP * Math.sqrt(1 + gx * gx + gz * gz); }
    text = `${fmtArea(A)} on the surface`;
  } else {
    let L = 0; for (let i = 1; i < P.length; i++) { const n = Math.max(1, Math.ceil(dist3(P[i], P[i - 1]) / 10)); let prev = null; for (let k = 0; k <= n; k++) { const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k / n, z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k / n, h = e(x, z); if (prev && h !== null && prev.h !== null) L += Math.hypot(x - prev.x, z - prev.z, h - prev.h); else if (prev) L += Math.hypot(x - prev.x, z - prev.z); prev = {x, z, h}; } }
    text = `${fmtLen(L)} along the surface`;
  }
  sh.sv = {key, text}; return text;
}
export function drawMeasure3D(ctx, viewer, w, h, u){            // the shapes on the terrain, over the picture
  if (!M3.shapes.some(sh => sh.mode === 'sect')) { cutHit = null; viewer.setCut(null); $('v3dCutCap').hidden = true; }
  const list = M3.shapes.map(sh => ({...sh, done: true})); if (M3.mode && M3.pts.length) list.push({mode: M3.mode, pts: M3.pts, done: false});
  if (!list.length) return;
  const col = getVar('--measure') || '#FFD84D', up = (x, z) => viewer.groundY(x, z) + 6;
  list.forEach(sh => {
    const ring = sh.mode === 'area' && sh.pts.length > 2 ? [...sh.pts, sh.pts[0]] : sh.pts, poly = [];
    ring.forEach((p, i) => { if (!i) return poly.push(p); const q = ring[i - 1], n = Math.max(1, Math.ceil(dist3(p, q) / 40)); for (let k = 1; k <= n; k++) poly.push([q[0] + (p[0] - q[0]) * k / n, q[1] + (p[1] - q[1]) * k / n]); });      // a leg is cut in short pieces: it follows the ground
    const P = viewer.projectAt(poly.map(([x, z]) => [x, up(x, z), z, true]), w, h, null, null);
    const cut = sh.mode === 'sect' && sh.done && drawCut3D(ctx, viewer, w, h, u, sh, `${fmtLen(len3(sh.pts))} line · ${surfaceValue(sh, viewer)}`);
    ctx.save(); ctx.lineWidth = 3 * u; ctx.strokeStyle = col; ctx.lineJoin = ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 4 * u;
    if (!sh.done) ctx.setLineDash([8 * u, 6 * u]);
    if (!cut) { ctx.beginPath(); let pen = false; P.forEach(q => { if (!q || !q[2]) { pen = false; return; } pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; }); ctx.stroke(); }      // a section with its cut has its line on the top edge of the wall (the same line, in the measure colour)
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    const V = viewer.projectAt(sh.pts.map(([x, z]) => [x, up(x, z), z, true]), w, h, null, null);
    V.forEach(q => { if (!q || !q[2]) return; ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(q[0], q[1], 4.2 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); });
    if (sh.mode === 'sect') V.forEach((q, i) => { if (!q || !q[2]) return; ctx.font = `700 ${13 * u}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = getVar('--rock') || '#22313A'; ctx.fillText(i ? 'B' : 'A', q[0], q[1] - 15 * u); });
    if (sh.done && !cut) {            // the result on a small label at the middle of the shape (a section with its cut carries it in the caption under the wall)
      const flat = sh.mode !== 'area' ? fmtLen(len3(sh.pts)) : `${fmtArea(area3(sh.pts))}, perimeter ${fmtLen(len3([...sh.pts, sh.pts[0]]))}`, text = `${flat} · ${surfaceValue(sh, viewer)}`;      // flat: ground distances as on the map; the second value follows the ice surface of the year shown
      const mid = sh.mode !== 'area' ? poly[Math.floor(poly.length / 2)] : [sh.pts.reduce((t, p) => t + p[0], 0) / sh.pts.length, sh.pts.reduce((t, p) => t + p[1], 0) / sh.pts.length];
      const q = viewer.projectAt([[mid[0], up(mid[0], mid[1]) + 10, mid[1], true]], w, h, null, null)[0];
      if (q && q[2]) {
        ctx.font = `600 ${12.5 * u}px ${FONT}`; const tw = ctx.measureText(text).width, px = 7 * u, hh = 22 * u;
        ctx.fillStyle = getVar('--rock') || '#22313A'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(q[0] - tw / 2 - px, q[1] - hh / 2, tw + 2 * px, hh, 5 * u) : ctx.rect(q[0] - tw / 2 - px, q[1] - hh / 2, tw + 2 * px, hh); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, q[0], q[1] + 0.5 * u);
      }
    }
    ctx.restore();
  });
}
export let cutLabels = [];            // rectangles (pixels of the overlay) taken by labels of the cut: the hover table keeps clear of them
const rectsHit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
export function drawCut3D(ctx, viewer, w, h, u, sh, caption){            // the glacier cut open along the section line: a wall from the surface down to the model bed (ice, light blue as in the chart) and a little rock below it; the ground in front of the wall fades into the background so that the cut stands clear
  const k = sectHov; cutLabels = []; if (!k || k.sh.pts !== sh.pts || !k.hasM) { cutHit = null; viewer.setCut(null); $('v3dCutCap').hidden = true; return false; }      // the list in drawMeasure3D holds copies of the shapes: compare their point lists
  const ex = viewer.exag(), A = k.A, ux = k.ux, uz = k.uz, n = k.surf.length, X = i => A[0] + ux * k.surf[i][0], Z = i => A[1] + uz * k.surf[i][0];
  const top = k.surf.map((q, i) => viewer.groundY(X(i), Z(i))), bed = k.surf.map((q, i) => k.mbed[i] === null ? null : top[i] - (q[1] - k.mbed[i]) * ex);
  const beds = bed.filter(b => b !== null), base = Math.min(...beds, ...top) - Math.max(25, (Math.max(...top) - Math.min(...beds)) * 0.12);      // the foot of the block: a little under the lowest bed
  const P = viewer.projectAt([...top.map((y, i) => [X(i), y + 1, Z(i), false]), ...top.map((y, i) => [X(i), base, Z(i), false]), ...bed.map((y, i) => [X(i), y === null ? top[i] : y, Z(i), false])], w, h, null, null);
  viewer.setCut({ax: A[0], az: A[1], ux, uz, L: k.L});      // the ground in front of the wall is taken away in the picture itself (the shader)
  if (P.some(q => !q)) { cutHit = null; $('v3dCutCap').hidden = true; return false; }
  const T = P.slice(0, n), B = P.slice(n, 2 * n), Dp = P.slice(2 * n), path = pts => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); };
  const ICE = '#CFE5F0', ICE_LINE = '#3F9BC4', ROCK = '#A39F96';      // ice: the light blue of the chart (the glacier blue at about a fifth over white)
  ctx.save(); ctx.lineJoin = 'round';
  path([...T, ...B.slice().reverse()]); ctx.fillStyle = ROCK; ctx.fill();      // rock
  let i = 0; while (i < n) {            // ice: stretches where the model bed lies under the surface
    if (bed[i] === null || top[i] - bed[i] < 0.5 * ex) { i++; continue; }
    let j = i; while (j + 1 < n && bed[j + 1] !== null && top[j + 1] - bed[j + 1] >= 0.5 * ex) j++;
    if (j > i) { path([...T.slice(i, j + 1), ...Dp.slice(i, j + 1).reverse()]); ctx.fillStyle = ICE; ctx.fill(); ctx.strokeStyle = '#22313A'; ctx.lineWidth = 1.4 * u; ctx.setLineDash([5 * u, 3 * u]); ctx.beginPath(); Dp.slice(i, j + 1).forEach((q, m) => m ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.setLineDash([]); }
    i = j + 1;
  }
  ctx.strokeStyle = getVar('--measure') || '#FFD84D'; ctx.lineWidth = 3 * u; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 4 * u; ctx.beginPath(); T.forEach((q, m) => m ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.shadowBlur = 0;      // the surface edge of the wall is the section line
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1 * u; path([...T, ...B.slice().reverse()]); ctx.stroke();
  if (k.others && k.others.length) {            // the ice surface of the other years: lines on the cut, where they differ from the surface shown
    const OP = viewer.projectAt(k.others.flatMap(o => o.d.map((d, i) => [X(i), top[i] + d * ex + 1, Z(i), false])), w, h, null, null), y0 = Math.min(k.others[0].y, sectSurfYear(v3dCtx)), y1 = Math.max(k.others[k.others.length - 1].y, sectSurfYear(v3dCtx));
    ctx.lineWidth = 1.8 * u; ctx.lineCap = 'round';
    k.others.forEach((o, m) => { ctx.strokeStyle = yearColour(o.y, y0, y1); let pen = false; ctx.beginPath(); o.d.forEach((d, i) => { const q = OP[m * n + i]; if (!q || Math.abs(d) < 0.5) { pen = false; return; } pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; }); ctx.stroke(); });
    ctx.lineCap = 'butt';
  }
  const rp = k.pts.map(q => { const ii = Math.min(n - 1, Math.max(0, Math.round(q.t / k.L * (n - 1)))), y = top[ii] - (q.s - q.bed) * ex; return {q, pt: viewer.projectAt([[X(ii), y, Z(ii), false]], w, h, null, null)[0], top: T[ii]}; }).filter(r => r.pt);
  rp.forEach(r => { ctx.strokeStyle = radarColor(r.q.p.m); ctx.globalAlpha = .6; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(r.top[0], r.top[1]); ctx.lineTo(r.pt[0], r.pt[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = radarColor(r.q.p.m); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(r.pt[0], r.pt[1], 3.6 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); });      // the radar cells beside the line, at their bed
  cutHit = {T, B, ts: k.surf.map(q => q[0])};
  if (cutMark !== null) {            // the place under the pointer: a line down the wall with a dot on the surface and on the model bed
    const f = Math.min(n - 1, Math.max(0, cutMark / k.L * (n - 1))), i0 = Math.min(n - 2, Math.floor(f)), a = f - i0, at = arr => [arr[i0][0] + (arr[i0 + 1][0] - arr[i0][0]) * a, arr[i0][1] + (arr[i0 + 1][1] - arr[i0][1]) * a], t0 = at(T), b0 = at(B), d0 = at(Dp);
    ctx.strokeStyle = '#22313A'; ctx.lineWidth = 1.6 * u; ctx.setLineDash([5 * u, 4 * u]); ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(b0[0], b0[1]); ctx.stroke(); ctx.setLineDash([]);
    [[t0, ICE_LINE], [d0, '#22313A']].forEach(([q, c]) => { ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8 * u; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); });
  }
  if (caption) {            // one caption under the wall (a box of the page, with the button of the 2D chart): length of the line, along the surface, and what the bed and the dots are
    const yrs = [...new Set(k.pts.map(q => q.p.y).filter(Boolean))].sort(), cap = $('v3dCutCap'), l2 = `Bed under the ice: swissBEDROCK model (dashed)${k.pts.length ? ` · ${k.pts.length} radar cell${k.pts.length === 1 ? '' : 's'}${yrs.length ? `, ${yrs.join(', ')}` : ''}` : ''}`;
    const yb = $('v3dCutYears'); yb.hidden = !(v3dCtx.usesDem && !v3dCtx.cmp); yb.setAttribute('aria-pressed', sectYearsOn); const l3 = sectYearsOn && k.others.length ? `<i class="grad"></i>Surface of the other years, ${k.others[0].y} to ${k.others[k.others.length - 1].y}` : ''; if ($('v3dCutCap3').innerHTML !== l3) $('v3dCutCap3').innerHTML = l3; $('v3dCutCap3').hidden = !l3; const l4 = sectEarly(v3dCtx) ? sectEarlyText(v3dCtx) : ''; if ($('v3dCutCap4').textContent !== l4) $('v3dCutCap4').textContent = l4; $('v3dCutCap4').hidden = !l4;
    if ($('v3dCutCap1').textContent !== caption) $('v3dCutCap1').textContent = caption; if ($('v3dCutCap2').textContent !== l2) $('v3dCutCap2').textContent = l2;
    cap.hidden = false;
    const cv = $('v3dOver'), cr = cv.getBoundingClientRect(), sr = $('v3d').getBoundingClientRect(), sx = cr.width / cv.width, sy = cr.height / cv.height, cw = cap.offsetWidth, ch = cap.offsetHeight, mid = B[n >> 1];
    const x = Math.min(sr.width - cw - 8, Math.max(8, cr.left - sr.left + mid[0] * sx - cw / 2)), y = Math.min(sr.height - ch - 8, Math.max(8, cr.top - sr.top + (B.reduce((t, q) => Math.max(t, q[1]), 0) + 10 * u) * sy));
    const pn = $('v3dSect'), y2 = pn.hidden ? y : Math.max(8, Math.min(y, pn.offsetTop - ch - 8));      // with the 2D chart open the box sits above it, not under it
    cap.style.left = x.toFixed(1) + 'px'; cap.style.top = y2.toFixed(1) + 'px';
    cutLabels.push([(x - cr.left + sr.left) / sx, (y2 - cr.top + sr.top) / sy, (x + cw - cr.left + sr.left) / sx, (y2 + ch - cr.top + sr.top) / sy]);      // taken: the hover table keeps clear of it
  } else $('v3dCutCap').hidden = true;
  [0, n - 1].forEach(m => { const q = T[m]; cutLabels.push([q[0] - 12 * u, q[1] - 30 * u, q[0] + 12 * u, q[1] - 2 * u]); });      // the letters A and B
  ctx.restore(); return true;
}
export function pinLoop(){            // while the 3D view shows marks: draw them over the picture, again and again, so that they move
  const cv = $('v3dOver'), run = ++pinRun, clear = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); radarHits = []; camHits = []; cutHit = null; if (v3d) v3d.setCut(null); $('v3dCutCap').hidden = true; $('v3dTip').hidden = true; $('v3dCamTip').hidden = true; };
  if (viewMode !== '3d' || (!marksOn() && !measureOn3() && !camsOn()) || !v3dCtx || !v3d) return clear();
  ensureNames(v3dCtx); if (radar3D(v3dCtx.g) && !v3dCtx.radarList) radarPinsFor(v3dCtx);
  const tick = now => {
    if (run !== pinRun) return;
    const c = v3dCtx, viewer = v3d, kc = $('v3dCanvas'); if (!c || !viewer || viewMode !== '3d' || (!marksOn() && !measureOn3() && !camsOn())) return clear();
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(kc.clientWidth * dpr), h = Math.round(kc.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, w, h);
    const u = Math.max(0.7, Math.min(1.4, h / 900));
    if (!v3dBusy) {
      { const sh = sectLine(); if (sh && sectKey && sectStamp(viewer, sh) !== sectKey) renderSection(); }
      placeSect();
      if (radar3D(c.g)) { radarHits = drawRadarPins(ctx, c, viewer, w, h, null, null, u, radarHover, radarSel); placeRadarTip(w / kc.clientWidth); } else { radarHits = []; $('v3dTip').hidden = true; }
      drawMarks3D(ctx, projectMarks(c, viewer, w, h, null, null), now / 1000, u);
      if (!document.body.classList.contains('pane-open')) {
        drawMeasure3D(ctx, viewer, w, h, u);      // measurements and camera symbols are not part of a download
        if (camsOn()) { camHits = drawPhotoCams(ctx, c, viewer, w, h, u); placeCamTip(w / kc.clientWidth); } else { camHits = []; $('v3dCamTip').hidden = true; }
      } else { camHits = []; $('v3dCamTip').hidden = true; }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
export let refresh3DTimer = null;
export function refresh3D(){            // a layer was switched: make the pictures again, the terrain and the camera stay
  clearTimeout(refresh3DTimer);
  refresh3DTimer = setTimeout(async () => {
    const c = v3dCtx, viewer = v3d, run = v3dRun; if (!c || !viewer || v3dBusy) return;
    try {
      if (c.cmp) { const [a, b] = await Promise.all(c.cmp.map(y => c.tex(y))); if (run !== v3dRun) return; viewer.setTexture(a, 0); viewer.setTexture(b, 1); }
      else { const y = c.current(), t = await c.tex(y); if (run !== v3dRun || c.current() !== y) return; viewer.setTexture(t); }
    } catch (e) { console.error(e); }
    const lc = $('v3dLc'); if (lc) lc.textContent = layersCreditText(c.g); const ls = $('v3dLcS'); if (ls) ls.textContent = shortLayerNames(c.g);
    if (!$('videoSheet').hidden) { centre3D(); update3DInfo(); }
  }, 80);
}
L3.forEach(([a, b]) => $(a).onchange = () => {
  $(b).checked = $(a).checked; $(b).dispatchEvent(new Event('change'));      // the map's own handlers keep the setting (and switch the other base maps off)
  if ($(a).checked && V3D_BASES[b] && imgOpacity() > 0.99) { prefs.imgOpacity = 0.5; savePrefs(); applyImgOpacity(); }      // a base map shows through the picture only when that is a little transparent
  sync3DMenu(); refresh3D();
});
$('l3Sat').addEventListener('change', () => sync3D());      // the caption and the pictures follow
$('l3Block').onchange = e => { prefs.bedBlock = e.target.checked; savePrefs(); if (v3d) v3d.setBlock(e.target.checked); };      // the sides of the strip cut open: ice above the bed, bedrock below
$('l3Sr').onchange = e => {      // the super-resolved picture on or off: the pictures are redrawn
  const c = v3dCtx; if (!c || !v3d) return; c.sr = e.target.checked;
  if (c.cmp) Promise.all(c.cmp.map(y => c.tex(y))).then(([a, b]) => { v3d.setTexture(a, 0); v3d.setTexture(b, 1); }); else c.tex(c.current()).then(t => v3d.setTexture(t));
  updateSciPanel();
};
$('l3Space').onchange = e => { prefs.space3d = e.target.checked; savePrefs(); sync3DMenu(); };      // the night sky behind the terrain, 3D only
$('l3Names').onchange = e => { prefs.names3d = e.target.checked; savePrefs(); sync3DMenu(); };      // 3D only: the map's own labels are pictures
$('l3Op').oninput = e => { prefs.imgOpacity = +e.target.value; savePrefs(); applyImgOpacity(); sync3DMenu(); refresh3D(); };      // the map's own handlers keep the setting
$('v3dLayers').classList.add('min'); $('v3dLbToggle').setAttribute('aria-expanded', 'false');      // closed at the start, like the map's
$('v3dLbToggle').onclick = () => { const min = $('v3dLayers').classList.toggle('min'); prefs.lb3Min = min; savePrefs(); $('v3dLbToggle').setAttribute('aria-expanded', !min); };
/* the height exaggeration slider was taken out of the page: v3dExag stays as a hidden input at 1 (no exaggeration), which the code above reads */
addEventListener('keydown', e => { if (e.key === 'Escape' && viewMode === '3d' && !e.defaultPrevented) { if (photoOn) leavePhoto(); else flyOut(); } });

/* ---- download of the 3D view: the picture as it is on screen, or a video in which the camera swings over the terrain (timelapse: the years follow one another, compare: the slider moves) ---- */
export function draw3DLabels(ctx, W, H, S, L){
  const g = L.g;
  if (minimalOn()) return minimalLabels(ctx, W, H, S, stillName(g), L.cmp ? `${L.cmp[0]} | ${L.cmp[1]}` : String(L.year), L.credit, L.hA ?? 1, L.facts && !L.cmp ? factTiles(g, L.year, L.facts.set, L.facts.base) : []);
  shade(ctx, W, H, S);
  ctx.textBaseline = 'alphabetic';
  const legend = [[L.outline, '#F2A93B', [14, 9], REGION.outlines.oldLegend], [L.outlineNew, getVar('--new'), [], REGION.outlines.newLegend]].filter(r => r[0]).map(r => r.slice(1));      // the legend of the outlines, as in the map downloads
  const sa = L.cmp && state.available[L.cmp[0]], sb = L.cmp && state.available[L.cmp[1]], sc = !L.cmp && state.available[L.year];
  drawHeader(ctx, W, S, {year: L.cmp ? `${L.cmp[0]} – ${L.cmp[1]}` : String(L.year), name: stillName(g), place: placeOf(g), hA: L.hA ?? 1, legend, keyW: 0,
    date: L.cmp ? [`${fmtDM(sa.date)}  ·  ${fmtDM(sb.date)}`, ` · ${L.hz ? 'top' : 'left'} ${L.cmp[0]}, ${L.hz ? 'bottom' : 'right'} ${L.cmp[1]} · 3D view`, ' · 3D view'] : [fmtDM(sc.date), ` · ${styleLine(state.style, sc)} · 3D view`, ` · ${sensorName(sc)} · ${STYLE_NAME[state.style] || STYLE_NAME.natural} · 3D view`]});
  drawBottom(ctx, W, H, S, {
    credit: L.credit,
    tiles: L.facts && !L.cmp ? factTiles(g, L.year, L.facts.set, L.facts.base) : [],
    tl: L.years && L.years.length > 1 && !L.cmp ? { years: L.years, pos: Math.max(0, L.years.indexOf(L.year)) } : null
  });
}
/* A small solid logo in the top right corner of the 3D videos: white face, red sides. It turns and tilts a little with the camera, so it seems to sit in the same space as the terrain. */
export let logoSide = null;
export function drawLogo3DAt(ctx, lx, ly, h, cam, cam0){            // the logo at (lx, ly) top left, h high: it turns and tilts a little with the camera, with a red solid side
  if (!logoImg) return;
  if (!logoSide) { const t = document.createElement('canvas'); t.width = 400; t.height = 380; const q = t.getContext('2d'); q.drawImage(logoImg, 0, 0, 400, 380); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#A82A23'; q.fillRect(0, 0, 400, 380); logoSide = t; }
  const w = h * 200 / 190, th = 0.35 - (cam.az - cam0.az) * 1.6, sx = Math.max(0.3, Math.abs(Math.cos(th))), dep = Math.sin(th) * h * 0.2, dy = h * 0.05 - (cam.el - cam0.el) * h * 0.9, N = 10;
  const cx = lx + w / 2, cy = ly + h / 2;
  ctx.save();
  for (let k = N; k >= 1; k--) { const f = k / N; ctx.save(); ctx.translate(cx + dep * f, cy + dy * f); ctx.scale(sx, 1); ctx.drawImage(logoSide, -w / 2, -h / 2, w, h); ctx.restore(); }
  ctx.translate(cx, cy); ctx.scale(sx, 1); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8; ctx.drawImage(logoImg, -w / 2, -h / 2, w, h);
  ctx.restore();
}
export const A_SWT = '<a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>';
export function updateCredits3D(){            // the sources of the 3D view, in the credits bar of the map (one line, a click opens all of it), with the same wording
  const c = v3dCtx, g = c && c.g, parts = [], yrs = c ? (c.cmp ? c.cmp : [c.current()]).filter(Boolean) : [];
  const s2Yrs = yrs.filter(y => !isLandsat(state.available[y])), lsYrs = yrs.filter(y => isLandsat(state.available[y]));
  if (satOn() && s2Yrs.length) parts.push(`Contains modified Copernicus Sentinel data ${[...new Set(s2Yrs)].join(' and ')}, processed via the <a href="https://dataspace.copernicus.eu" target="_blank" rel="noopener">Copernicus Data Space Ecosystem</a>`);
  if (satOn() && lsYrs.length) parts.push(`${[...new Set(lsYrs)].join(' and ')}: ${LANDSAT_CREDIT}`);
  parts.push(`Terrain: ${terrainHtml(c)}` + (c && c.usesDem ? (FEATURES.swisstopo ? (c.bundle && c.bundle.yearly && c.bundle.yearly.swiss ? ' (ice surface of each year: swisstopo surveys of 2017, 2021 and 2023 and the GLAMOS mass balance between and after them)' : ' (ice surface of each year: estimate from the swissALTI3D editions and the GLAMOS mass balance)') : ' (ice surface of each year: from the dated ArcticDEM strips)') : ''));
  for (const bk of baseKeys()) {
    if (bk === 'osmToggle') parts.push('Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
    else if (bk === 'topoToggle') parts.push(`Map © ${A_SWT}`);
    else if (bk === 'altiToggle') parts.push(FEATURES.swisstopo ? `Hillshade: swissALTI3D © ${A_SWT}` : 'Hillshade: calculated from the elevation model of each year');
    else if (bk === 'aerialToggle') parts.push(FEATURES.swisstopo ? `Aerial images: SWISSIMAGE ${state.oldestAerial || [...new Set(yrs.map(siYear))].join(' and ')} © ${A_SWT}` : `Aerial image ${flownYear(g, state.oldestAerial) || state.oldestAerial}: Náttúrufræðistofnun Íslands and Landmælingar Íslands (CC BY 4.0)`);
  }
  if ($('trailsToggle').checked && (!c || c.hasTrails !== false)) parts.push((FEATURES.swisstopo ? `Hiking trails © ${A_SWT}` : 'Paths © OpenStreetMap contributors') + (g && sightFor(g) ? ` (line of sight: own calculation from ${REGION.sightDem || 'swissALTI3D'})` : ''));
  if (g && (outline3D(g) || outlineNew3D(g))) parts.push(REGION.outlines.html || 'Outlines GLAMOS (CC BY 4.0)');
  if (g && radar3D(g)) parts.push('Radar ice thickness: <a href="https://doi.org/10.18750/icethickness.2020.r2020" target="_blank" rel="noopener">GLAMOS</a> (CC BY 4.0)');
  if ($('l3Names').checked) parts.push(FEATURES.swisstopo ? `Peak names: ${A_SWT} (swissNAMES3D)` : 'Place names © OpenStreetMap contributors');
  $('credits').innerHTML = parts.join(' · ');
}
export const credit3D = (c, yrs) => shortCredit(yrs, [...(c && c.bundle && c.bundle.yearly ? ['ArcticDEM'] : []), ...REGION.terrain.short.split(' · ').filter(n => !(c && c.bundle && c.bundle.yearly && n === 'ArcticDEM')), ...layerCreditNames(c.g)]);
export function labels3D(c, facts){            // what the labels of the picture show now (the timelapse: the year on screen); facts: {set, base} or null
  const year = c.cmp ? null : c.current();
  return {g: c.g, cmp: c.cmp, hz: c.hz, year, outline: outline3D(c.g), outlineNew: outlineNew3D(c.g), facts, years: c.cmp ? null : vstate.kind === 'image' ? [] : c.years, credit: credit3D(c, c.cmp ? c.cmp.join(' and ') : vstate.kind !== 'image' && c.years.length > 1 ? `${c.years[0]}–${c.years[c.years.length - 1]}` : year)};
}
export function drawPreview3D(){            // placeholder labels over the frame, drawn by the same function as the finished picture
  const cv = $('vfPreview'), c = v3dCtx, F = VIDEO.formats[vstate.fmt], W = F.w, H = F.h, q = 0.5;
  cv.width = Math.round(W * q); cv.height = Math.round(H * q);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!logoImg && !logoAsked) { setLogoAsked(true); loadLogo().then(() => drawPreview3D()); }      // the logo is part of every picture
  if (!c) return;
  const S = marginsFor(vstate.kind, vstate.fmt), facts = !c.cmp && $('vFacts').checked ? {set: $('vFactSet').value, base: vstate.kind === 'image' || !c.years.length ? FIRST_YEAR : Math.min(...c.years)} : null;
  if (facts) loadFacts(c.g);
  ctx.save(); ctx.scale(q, q); setBrandMotion(vstate.kind !== 'image' ? {cam: vPrev.on && vPrev.cam ? vPrev.cam : {az: 0, el: 0}, cam0: vPrev.on && vPrev.cam0 ? vPrev.cam0 : {az: 0, el: 0}} : null); try { draw3DLabels(ctx, W, H, S, labels3D(c, facts)); } finally { setBrandMotion(null); } ctx.restore();
}
export const info3D = (c, ys, outline) => {            // the facts the fact card of the map videos needs
  const lo = Math.min(...ys), hi = Math.max(...ys), inRange = VOLUME_LOSS.filter(n => n.y >= lo && n.y <= hi);
  return {glacier: c.g, years: ys, scenes: ys.map(y => state.available[y]), outline, res: 10, style: state.style, compare: !!c.cmp, horiz: c.hz,
    lost: inRange.length ? Math.round((1 - inRange.reduce((q, n) => q * (1 - n.v / 100), 1)) * 100) : 0, site: (location.host + location.pathname).replace(/\/(index\.html)?$/, '')};
};
export const plan3D = c => {            // seconds: the camera swing, then the fact card (no title slide)
  const tl = !c.cmp && c.years.length > 1, n = tl ? loopSeq(c.years.length).length : 0, per = perSec(n);
  const main = c.cmp ? swipeLength(per / 1.2) : tl ? n * per + VIDEO.hold : 8, tail = tailLength();
  return {per, tl, intro: 0, main, tail, total: main + tail};
};
export let info3DBase = '';
export function hint3D(){            // the line in the pane, and the note on the frame when the picture would look soft: the satellite pixels are 10 m, and this close each one covers many pixels of the download
  const c = v3dCtx, viewer = v3d, what = vstate.kind === 'image' ? 'picture' : 'video';
  let soft = false, canOut = false;
  if (c && viewer && !$('videoSheet').hidden) {
    const kc = $('v3dCanvas'), R = frameRect(), cam = viewer.getCam(), res = 2 * cam.dist * Math.tan(0.375) * (R.h / kc.clientHeight) / VIDEO.formats[vstate.fmt].h;      // metres of terrain per pixel of the download, at the point the camera looks at
    soft = res < 1.5; canOut = cam.dist < V3D.DIST[1] * (c.S.half / V3D.HALF) * 0.98;
  }
  $('videoFrameNote').textContent = soft && canOut ? `Zoom out for a sharper ${what}` : '';
  $('vsInfo').textContent = info3DBase + (soft ? ` Images have 10 m pixels: this close, the ${what} looks soft.` : '');
}
export function update3DInfo(){            // the line in the download pane, the frame on the 3D view and the options that fit it
  const c = v3dCtx, sec = n => Math.round(n), video = vstate.kind !== 'image';
  $('vsSource').textContent = ''; $('videoFrameNote').textContent = '';      // the zoom hint of the map frame does not apply here
  vstate.type = c && c.cmp ? 'swipe' : 'timelapse'; $('videoSheet').classList.toggle('is-swipe', vstate.type === 'swipe');
  $('vSpeed').closest('label').style.display = c && (c.cmp || c.years.length > 1) ? '' : 'none';
  document.querySelectorAll('.vo-loops').forEach(e => { e.style.display = c && !c.cmp && c.years.length > 1 ? '' : 'none'; });      // loops belong to a timelapse
  { const still = !c || (!c.cmp && c.years.length < 2); if (still) $('vSwing').checked = true; $('vSwing').disabled = still; }      // one year: the viewpoint is all that moves
  const P = c && plan3D(c);
  info3DBase = !c ? 'The 3D view is loading.' : !video ? `One picture of the 3D view${c.cmp ? ` (${c.cmp.join(' and ')}, slider as set)` : ''}, as framed.`
    : c.cmp ? `Slider, ${c.cmp.join(' and ')}, ${$('vSwing').checked ? 'the camera swings over the terrain' : 'the viewpoint stays fixed'}, about ${sec(P.total)} s.`
    : c.years.length > 1 ? `Timelapse ${c.years[0]}–${c.years[c.years.length - 1]}, ${$('vSwing').checked ? 'the camera swings over the terrain' : 'the viewpoint stays fixed'}, about ${sec(P.total)} s.`
    : `The camera swings over the terrain, about ${sec(P.total)} s.`;
  earlyNote(c ? (c.cmp || c.years) : []);
  hint3D();
  $('vsGuide').textContent = guideText();
  $('vFactsRow').style.display = c && c.cmp ? 'none' : '';      // the facts belong to a single year
  placeFrame(); drawPreview3D();
}
export async function download3D(kind){
  const c = v3dCtx, viewer = v3d; if (!c || !viewer || v3dBusy) return;
  const run = v3dRun, fmt = vstate.fmt, F = VIDEO.formats[fmt], W = F.w, H = F.h, S = marginsFor(kind, fmt), g = c.g, msg = $('v3dMsg'), cv = $('v3dCanvas');
  const ok = () => run === v3dRun && viewer === v3d;
  const cw = cv.clientWidth, ch = cv.clientHeight, R = frameRect(), view = {a: cw / ch, sx: R.w / cw, sy: R.h / ch, cx: (R.x + R.w / 2 - cw / 2) / (cw / 2) - viewer.getShift().cx, cy: -(R.y + R.h / 2 - ch / 2) / (ch / 2) - viewer.getShift().cy};      // the part of the screen inside the frame (the picture on screen is shifted by the same amount as it was moved into the frame: the difference is what the export crops)
  const sl = v3dSplit, shownSplit = Math.min(1, Math.max(0, c.hz ? (ch * sl - R.y) / R.h : (cw * sl - R.x) / R.w));      // where the slider sits inside the frame
  const out = document.createElement('canvas'); out.width = W; out.height = H; const ctx = out.getContext('2d');
  const buttons = [$('vsGo')], say = t => { msg.hidden = false; msg.textContent = t; progress(Math.min(1, +(t.match(/\d+(?= %)/) || [0])[0] / 100), t); };
  stopPreview(); v3dBusy = true; stopPlay(); buttons.forEach(b => b.disabled = true);      // a running preview would swing the camera under the export and hand it a swung start view
  let failed = false;
  try {
    await ensureNames(c);
    await Promise.all([loadLogo(), ...['600 30px', '800 120px', '500 30px', '700 40px'].map(f => document.fonts.load(`${f} "Schibsted Grotesk"`).catch(() => {}))]);
    const yr0 = c.cmp ? null : c.current(), cam0 = viewer.getCam(), outline = outline3D(g);
    let file, years;
    if (kind === 'image') {
      let facts = null;
      if (!c.cmp && factSetOn()) {
        await loadFacts(g); facts = {set: factSetOn(), base: FIRST_YEAR};
        if (!factTiles(g, yr0, facts.set, FIRST_YEAR).length) showNotice('This glacier has no facts of this kind, so the picture is made without them.');
      }
      cv.style.visibility = 'hidden'; viewer.hold(true);
      if (c.cmp) viewer.setSplit(shownSplit, c.hz);
      ctx.drawImage(viewer.frame(W, H, null, view), 0, 0);
      if (radar3D(g)) { await radarPinsFor(c); drawRadarPins(ctx, c, viewer, W, H, null, view, H / 1080, -1, -1); }
      drawMarks3D(ctx, projectMarks(c, viewer, W, H, null, view), 0.35, H / 1080);      // the marks, in a still moment of their movement
      draw3DLabels(ctx, W, H, S, labels3D(c, facts));
      const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.92));
      years = c.cmp || [yr0];
      file = new File([blob], `tonguesfromspace-${shortSlug(g.name)}-3d-${years.join('-')}${c.cmp ? '-slider' : ''}-${FMT_SUFFIX[fmt]}.jpg`, {type: 'image/jpeg'});
    } else {
      const P = plan3D(c), longest = P.main + endLen(fmt);      // the gallery takes files up to 15 MB: the bitrate follows the length, aiming at about 11 MB
      const cfg = await pickCodec(W, H, Math.round(Math.min(8e6, Math.max(2.5e6, 11e6 * 8 / longest)))); if (!cfg) throw new Error('This browser cannot create MP4 (H.264) videos. Try Chrome, Edge, or Safari on iPhone, iPad or Mac.');
      const fps = VIDEO.fps, ys = c.cmp || c.years, per = P.per, easeS = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
      years = ys;
      say('Loading pictures…');
      const texs = {}, heis = {}; for (const y of ys) { texs[y] = await c.tex(y); heis[y] = c.usesDem ? c.surface(y) : null; if (!ok()) return; }
      const info = info3D(c, ys, outline), useEnd = $('vEnd').value === 'facts' && await endInfo(g, info, Math.min(...ys), Math.max(...ys)), tailLen = useEnd ? endLen(fmt) : 0;
      const facts = !c.cmp && factSetOn() ? {set: factSetOn(), base: Math.min(...ys)} : null; if (facts) await loadFacts(g);
      const n = Math.round((P.intro + P.main + tailLen) * fps), tl = P.tl, seq3 = loopSeq(ys.length);
      let shown = null;
      const showFor = y => { if (shown === y) return; shown = y; viewer.setTexture(texs[y], 0); if (c.usesDem) viewer.setHeights(heis[y]); };
      if (c.cmp) { viewer.setTexture(texs[ys[0]], 0); viewer.setTexture(texs[ys[1]], 1); if (c.usesDem) viewer.setHeights(heis[ys[0]], heis[ys[1]]); }
      const splitAt = tt => { const k = per / 1.2; let uu = tt, from = 0.5; for (const [to, d] of SWIPE_KEYS) { const dur = d * k; if (uu < dur) return from + (to - from) * easeS(uu / dur); uu -= dur; from = to; } return from; };
      cv.style.visibility = 'hidden'; viewer.hold(true);
      const chunks = []; let desc = null, encErr = null;
      const enc = new VideoEncoder({
        output: (chunk, meta) => { if (!desc && meta && meta.decoderConfig && meta.decoderConfig.description) desc = new Uint8Array(meta.decoderConfig.description); const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); chunks.push({data: d, key: chunk.type === 'key', pts: chunk.timestamp}); },
        error: e => { encErr = e; }
      });
      enc.configure(cfg);
      for (let i = 0; i < n; i++) {
        if (encErr) throw encErr; if (!ok()) { enc.close(); return; }
        const t = i / fps, tt = Math.min(P.main, Math.max(0, t - P.intro)), u = tt / P.main, sw = Math.sin(2 * Math.PI * u), bob = (1 - Math.cos(2 * Math.PI * u)) / 2;      // one swing right, left and back: the video loops, and the title and closing slides see the starting view
        const camAt = $('vSwing').checked ? {az: cam0.az + 0.5 * sw, el: cam0.el + 0.07 * bob, dist: cam0.dist * (1 - 0.1 * bob)} : cam0;      // a fixed viewpoint stays where the camera is on screen
        let year = yr0;
        if (c.cmp) viewer.setSplit(splitAt(tt), c.hz);
        else if (tl) { year = ys[seq3[Math.min(seq3.length - 1, Math.floor(tt / per))]]; showFor(year); }
        ctx.drawImage(viewer.frame(W, H, camAt, view), 0, 0);
        if (t >= P.intro && t < P.intro + P.main) { if (radar3D(g) && c.radarList) drawRadarPins(ctx, c, viewer, W, H, camAt, view, H / 1080, -1, -1); drawMarks3D(ctx, projectMarks(c, viewer, W, H, camAt, view), t, H / 1080); }
        const te = t - P.main;
        if (te >= 0) {          // the fact card, on the last view: the last frame fades out under it
          if (te < 0.4) { ctx.save(); ctx.globalAlpha = 1 - easeIO(te / 0.4); draw3DLabels(ctx, W, H, S, {...labels3D(c, facts), year: c.cmp ? null : year}); ctx.restore(); }
          drawEndSlide(ctx, W, H, S, info, te);
        } else { setBrandMotion({cam: camAt, cam0}); try { draw3DLabels(ctx, W, H, S, {...labels3D(c, facts), year: c.cmp ? null : year, hA: easeIO(t / 0.5)}); } finally { setBrandMotion(null); } }
        const vf = new VideoFrame(out, {timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps)});
        enc.encode(vf, {keyFrame: i % (fps * 2) === 0}); vf.close();
        while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
        if (i % 10 === 0) { say(`Creating video ${Math.round(100 * i / n)} %…`); await new Promise(r => setTimeout(r, 0)); }
      }
      await enc.flush(); enc.close(); if (encErr) throw encErr; if (!desc) throw new Error('the encoder did not report its H.264 settings');
      file = new File([muxMp4({width: W, height: H, fps, avcC: desc, samples: chunks})], `tonguesfromspace-${shortSlug(g.name)}-3d-${c.cmp ? 'slider' : tl ? 'timelapse' : 'orbit'}-${ys[0]}${ys.length > 1 ? '-' + ys[ys.length - 1] : ''}-${FMT_SUFFIX[fmt]}.mp4`, {type: 'video/mp4'});
    }
    if (!ok()) return;
    setLastExport({file, sig: exportSignature(), meta: {type: kind === 'image' ? 'still' : c.cmp ? 'slider' : 'timelapse', view: '3d', years, fmt, style: state.style, glacier: g.id, name: g.name}});
    if (shareOnly) { /* for the gallery: no download */ }
    else if (COARSE && navigator.canShare && navigator.canShare({files: [file]})) {
      try { await navigator.share({files: [file], title: `${g.name} in 3D`}); } catch (e) { if (e.name !== 'AbortError') downloadFile(file); }
    } else downloadFile(file);
    offerShare();
  } catch (e) {
    console.error(e); failed = true; if (ok()) { cv.style.visibility = ''; say('The ' + (kind === 'image' ? 'image' : 'video') + ' could not be made: ' + (e.message || e)); setTimeout(() => { if (ok()) msg.hidden = true; }, 5000); }
  } finally {
    v3dBusy = false; buttons.forEach(b => b.disabled = false); if (!shareOnly || failed) $('vsGo').textContent = failed ? (kind === 'image' ? 'Download image' : 'Download video') : 'Download again';
    if (viewer === v3d && run === v3dRun) {
      cv.style.visibility = ''; if (!failed) msg.hidden = true;
      if (c.cmp) {            // back to what was on screen
        viewer.setSplit(v3dSplit, c.hz);
        if (kind === 'video') { if (c.usesDem) viewer.setHeights(c.surface(c.cmp[0]), c.surface(c.cmp[1])); viewer.setTexture(await c.tex(c.cmp[0]), 0); viewer.setTexture(await c.tex(c.cmp[1]), 1); }
      } else if (kind === 'video') await c.restore();
      viewer.hold(false);
    }
  }
}


/* From the map into 3D: the footprint of the 3D strip is drawn on the map (dashed) and, when the middle of the map is inside it and the map is zoomed in on the tongue, a "Tilt into 3D" pill offers the switch (click it, or drag it up) */
const TILT_SPAN = 3, OUTLINE_SPAN = 8;      // the pill shows when the map is at most this many strip lengths wide, the outline when at most OUTLINE_SPAN
const spanOf = poly => { const c = map.getCenter(), mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / (256 * 2 ** map.getZoom()); return map.getSize().x * mpp / (2 * poly[0].distanceTo(poly[3]) / 2); };      // map width in strip lengths (the strip runs from corner 0 to corner 3 along its length)
let tiltPill = null, tiltAz = 0, tiltEntry = false;
function stripPolygon(){
  const g = viewMode === 'map' ? v3dGlacier() : null, at = g && (g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue); if (!at) return null;
  const S = stripFor(g, at); tiltAz = Math.atan2(S.ue, S.un) * 180 / Math.PI;
  return [[-S.back, -S.half], [-S.back, S.half], [S.up, S.half], [S.up, -S.half]].map(([a, b]) => { const m = S.merc(a, b); return L.CRS.EPSG3857.unproject(L.point(m[0], m[1])); });
}
function inPolygon(p, poly){      // ray casting on lat/lng; the strip is far smaller than the distortion that would matter
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].lat > p.lat) !== (poly[j].lat > p.lat) && p.lng < (poly[j].lng - poly[i].lng) * (p.lat - poly[i].lat) / (poly[j].lat - poly[i].lat) + poly[i].lng) c = !c;
  return c;
}
export function syncTiltPill(){
  const poly = stripPolygon();
  if (!poly || spanOf(poly) > OUTLINE_SPAN) { tiltPoly = null; if (tiltPill) tiltPill.hidden = true; return; }
  if (!tiltPill) { tiltPill = document.createElement('div'); tiltPill.className = 'tilt-hint'; $('map').parentNode.appendChild(tiltPill); }
  tiltPoly = spanOf(poly) <= TILT_SPAN && inPolygon(map.getCenter(), poly) ? poly : null;
  tiltPill.hidden = !tiltPoly || TWO_FINGER || prefs.noTransition === true; tiltPill.textContent = 'You\u2019ve reached the tongue. Alt (Option) + drag up to see it in 3D.';      // a hint, not a button; phones use the 3D button (two fingers already move the map)
}
/* The gesture: Alt-, Shift- or right-button drag upwards while the middle of the map is inside the strip tilts the map like a table; letting go past the threshold opens the 3D view */
let tiltPoly = null;
/* From the map into 3D and back: the camera flies, in one smooth glide, between a view straight above what the map shows and the camera of the 3D view; the 3D picture fades over the map at the start (and away at the end). A short Alt-, Shift- or right-button drag up on the strip starts it. Nothing else changes on the way. */
let tilt = null;      // {t, v (the viewer, once loaded), from, to (free-flying camera poses), committed}
const smoother = x => x * x * x * (x * (6 * x - 15) + 10);      // zero speed and zero acceleration at both ends
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function applyTilt(){      // the eye leads and the view turns after it: a swoop that levels out; the 3D picture fades in over the map at the start
  if (!tilt) return; const t = tilt.t;
  if (!tilt.v) return;
  $('v3d').style.opacity = smooth(0, 0.25, t).toFixed(3);
  tilt.v.flyMix(tilt.from, tilt.to, smoother(t), smoother(Math.min(1, Math.max(0, (t - 0.1) / 0.9))));
}
function tiltPoses(v, cam){      // the pose straight above the middle of the map (at its scale) and the pose of the camera given
  const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (256 * 2 ** map.getZoom()), H = map.getSize().y * mpp / (2 * Math.tan(0.375)), c = tilt.centre;
  tilt.v = v; tilt.to = v.poseOf(cam); tilt.from = {x: c.x, y: v.groundY(c.x, c.z) + H, z: c.z, yaw: -tiltAz * Math.PI / 180, pitch: -1.5, roll: 0, fovY: 0.75};      // north up, like the map
}
function tongueMask(g, S){      // the ice of the glacier in the texture space of the strip, white on black
  const W = S.tex[0] / 2, H = S.tex[1] / 2, len = S.up + S.back, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), geom = newOutlineGeom(g) || outlineGeom(g); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff';
  if (geom) eachPiece(geom, ring => { x.beginPath(); ring.forEach((pt, i) => { const q = L.CRS.EPSG3857.project(L.latLng(pt[1], pt[0])), dx = (q.x - S.P.x) / S.k, dy = (q.y - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue; const X = (b + S.half) / (2 * S.half) * W, Y = (S.up - a) / len * H; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath(); x.fill(); });
  return c;
}
function tongueBuild(v, ms, mask, delay){      // the tongue rebuilt: starts when the flight is almost over (delay after now) and lasts ms, with a message
  const box = $('tongueLoading'), bar = box.querySelector('i'), t0 = performance.now() + 1 + delay, m = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height);
  box.classList.remove('out'); box.hidden = true; bar.style.width = '0'; v.setBuild(0);      // until then the tongue waits, sunken, under its contours
  setTimeout(() => { if (v === v3d) v.setSocket(m.data, mask.width, mask.height, 14); requestAnimationFrame(step); }, 0);      // after open3D has set the heights of the year
  const step = now => { if (v !== v3d) { box.hidden = true; return; } const k = Math.min(1, Math.max(0, (now - t0) / ms)); if (now >= t0) box.hidden = false; v.setBuild(k >= 1 ? 1 : k); bar.style.width = (k * 100).toFixed(0) + '%';
    if (k < 1) return requestAnimationFrame(step);
    v.clearSocket(); box.classList.add('out'); setTimeout(() => { box.hidden = true; }, 500); };
}
function tiltReady(v, cam){      // the viewer is loaded: the flight goes from above the map to the camera
  if (!tilt) return;
  tiltPoses(v, cam);
  try { const mk = tongueMask(v3dGlacier(), tiltS); v.setMask(mk); const rest = 3000 * (1 - tilt.t); tongueBuild(v, 0.4 * rest + 1400, mk, 0.6 * rest); } catch (e) { console.warn('tongue build effect:', e); }      // lands just after the flight
  if (tilt.auto) { tilt.t = 0; applyTilt(); tiltAnimate(1, 3000, tiltFinish); return; }      // the 3D button: the flight plays by itself
  applyTilt(); if (tilt.committed && tilt.t === 1) tiltFinish();
}
function tiltFinish(){      // the 3D view takes over fully, on the stored camera
  const el = $('v3d'); el.style.opacity = ''; el.style.pointerEvents = ''; tilt.v.endFlight(); tilt = null;
}
function tiltAnimate(to, ms, done){      // time runs straight; the easing is in the camera (smoother)
  const from = tilt.t, t0 = performance.now(), me = tilt, id = me.anim = (me.anim || 0) + 1;      // a newer animation of the same flight replaces the older
  const step = now => { if (tilt !== me || me.anim !== id) return; const k = Math.min(1, (now - t0) / ms), e = k; me.t = from + (to - from) * e; applyTilt(); if (k < 1) requestAnimationFrame(step); else done(); };
  requestAnimationFrame(step);
}
function tiltCancel(){ const el = $('v3d'); tilt = null; tiltEntry = false; setView('map'); el.style.opacity = ''; el.style.pointerEvents = ''; syncTiltPill(); }
let tiltS = null;
function centreOnStrip(){      // the middle of the map in the scene of the 3D view (x right, z towards the tip), kept on the strip
  const g = v3dGlacier(), S = tiltS = stripFor(g, g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue), m = L.CRS.EPSG3857.project(map.getCenter()), dx = (m.x - S.P.x) / S.k, dy = (m.y - S.P.y) / S.k;
  return {x: Math.max(-S.half, Math.min(S.half, dx * S.un - dy * S.ue)), z: Math.max(-S.up, Math.min(S.back, -(dx * S.ue + dy * S.un)))};
}
function startTilt(auto){      // the 3D view is loaded behind the map while the flight in is driven by the drag (or, with auto, plays by itself)
  if (tilt || viewMode !== 'map') return;
  tilt = {t: 0, v: null, from: null, to: null, committed: !!auto, auto: !!auto, centre: centreOnStrip()};
  tiltEntry = true; setView('3d');
  if (String(viewMode) !== '3d') { tilt = null; tiltEntry = false; return; }      // refused (no glacier, busy)
  $('v3d').style.opacity = '0'; $('v3d').style.pointerEvents = 'none';
}
function flyIn(){ if (viewMode !== 'map') return; if (prefs.noTransition === true || tilt || !currentGlacier() || vstate.busy || v3dBusy) return setView('3d'); startTilt(true); }      // the 3D button
function flyOut(){      // the map button and Esc: the flight runs backwards, from the camera as the visitor left it
  if (viewMode !== '3d') return;
  if (prefs.noTransition === true || tilt || !v3d || !v3dCtx || photoOn || v3d.hasPose() || vstate.busy || v3dBusy) return setView('map');
  tilt = {t: 1, v: null, from: null, to: null, committed: false, back: true, centre: centreOnStrip()};
  tiltPoses(v3d, v3d.getCam()); $('v3d').style.pointerEvents = 'none'; applyTilt(); tiltAnimate(0, 2000, tiltCancel);
}
$('map').addEventListener('pointerdown', e => {
  if (!tiltPoly || prefs.noTransition === true || tilt || viewMode !== 'map' || !(e.altKey || e.shiftKey || e.button === 2)) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const y0 = e.clientY, el = $('map'); el.setPointerCapture(e.pointerId); el.style.transition = '';
  startTilt(); const me = tilt; if (!me) return;
  const off = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  const move = ev => {      // a short drag up (50 px) sets the flight going; from then on it plays by itself, slowly
    if (tilt !== me) return; const dist = y0 - ev.clientY;
    me.t = Math.max(0, Math.min(1, dist / 50)) * 0.1; applyTilt();
    if (dist < 50) { tiltPill.hidden = false; tiltPill.textContent = 'Keep dragging up'; return; }
    off(); me.committed = true; tiltPill.hidden = true; tiltAnimate(1, 3000, () => { if (tilt.v) tiltFinish(); });      // if the view is still loading it finishes when ready
  };
  const up = () => { off(); tiltPill.hidden = true; if (!me.committed) tiltAnimate(0, 400, tiltCancel); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}, true);
$('map').addEventListener('contextmenu', e => { if (tiltPoly) e.preventDefault(); });
map.on('moveend zoomend', syncTiltPill);

$('noTransition').checked = prefs.noTransition !== true;      // ticked = the flight is on
$('noTransition').onchange = e => { prefs.noTransition = !e.target.checked; savePrefs(); syncTiltPill(); };
