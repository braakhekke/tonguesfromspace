/* =====================================================================
   12. 3D view of the tongue
   A restricted view: a strip along the glacier, 1 km below the tongue tip and several km up the glacier, about 4 km wide. The camera starts below the tip and looks up the glacier
   (the direction is taken from the 2023 outline around the tip), it can turn and tilt within limits, no panning.
   Heights: swissALTI3D (swisstopo), read from the open Mapterhorn terrain tiles (Terrarium encoding, CORS open). The picture is the satellite image of the year on the map.
   Local frame of the strip: a = metres up the glacier from the tip (negative = below it), b = metres to the right when looking up the glacier; in the 3D scene x = b, z = -a.
   ===================================================================== */
const V3D = {HALF: 2000, BACK: 1000, UP: [2500, 6500], CELL: [14, 28], TEX: [1024, 2048], Z: 13, EL: [0.12, 1.35], DIST: [600, 7500], AZ: 1.3, WM: 20037508.342789244};      // HALF: half width (m); BACK: strip below the tip (m); UP: shortest and longest strip up the glacier (m); CELL: grid spacing (m), the fine one needs 32-bit indices (about 150,000 points), the coarse one is the fallback; TEX: texture width and height; Z: tile zoom; EL / DIST / AZ: tilt, distance and turn limits
const V3D_VIEW = {'A54e-24': {back: 2000, dist: 1.3}};      // Trift: the strip reaches further below the tongue tip and the camera starts further back, away from the glacier (back: metres below the tip; dist: times the usual distance)
const terrainTile = (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;
function stripFor(g, at){            // direction up the glacier and length of the strip
  const P = L.CRS.EPSG3857.project(L.latLng(at[0], at[1])), k = 1 / Math.cos(at[0] * Math.PI / 180), geom = g.inv && g.inv.outline;
  const ring = geom && geom.coordinates.map(poly => poly[0]).sort((a, b) => b.length - a.length)[0];
  const rel = (ring || []).map(([lng, lat]) => { const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)); return [(q.x - P.x) / k, (q.y - P.y) / k]; });      // outline points in ground metres east and north of the tip
  const near = rel.filter(p => Math.hypot(p[0], p[1]) <= 3000);
  let ue = 0, un = 1;
  if (near.length) { const mx = near.reduce((s, p) => s + p[0], 0) / near.length, my = near.reduce((s, p) => s + p[1], 0) / near.length, d = Math.hypot(mx, my); if (d > 1) { ue = mx / d; un = my / d; } }
  else if (g.center) { const c = Array.isArray(g.center) ? g.center : [g.center.lat, g.center.lng], q = L.CRS.EPSG3857.project(L.latLng(c[0], c[1])), d = Math.hypot(q.x - P.x, q.y - P.y); if (d > 1) { ue = (q.x - P.x) / d; un = (q.y - P.y) / d; } }
  const along = Math.max(0, ...rel.map(p => p[0] * ue + p[1] * un)), up = Math.min(V3D.UP[1], Math.max(V3D.UP[0], along + 800));
  const view = V3D_VIEW[g.inv && g.inv.id] || {};
  return {P, k, ue, un, up, back: view.back || V3D.BACK, dist: view.dist || 1, merc: (a, b) => [P.x + (a * ue + b * un) * k, P.y + (a * un - b * ue) * k]};      // right of the looking direction is (un, -ue)
}
async function loadHeights(S, nA, nB){            // heights (m) on a grid of nA+1 rows (top row = far up the glacier) by nB+1 columns (left to right)
  const {Z, WM, HALF} = V3D, BACK = S.back, n = 2 ** Z, tx = x => (x + WM) / (2 * WM) * n, ty = y => (WM - y) / (2 * WM) * n;
  const corners = [[-BACK, -HALF], [-BACK, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b));
  const xs = corners.map(c => tx(c[0])), ys = corners.map(c => ty(c[1])), x0 = Math.floor(Math.min(...xs)), x1 = Math.floor(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.floor(Math.max(...ys));
  const W = (x1 - x0 + 1) * 512, Hh = (y1 - y0 + 1) * 512, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const ctx = c.getContext('2d', {willReadFrequently: true}), jobs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push((async () => {
    const r = await fetch(terrainTile(Z, x, y)); if (!r.ok) throw new Error('terrain tile ' + r.status);
    const bmp = await createImageBitmap(await r.blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
    ctx.drawImage(bmp, (x - x0) * 512, (y - y0) * 512); if (bmp.close) bmp.close();
  })());
  await Promise.all(jobs);
  const px = ctx.getImageData(0, 0, W, Hh).data, el = (ix, iy) => { const i = (iy * W + ix) * 4; return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768; };
  const out = new Float32Array((nA + 1) * (nB + 1));
  for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) {
    const [mx, my] = S.merc(S.up - j * (S.up + BACK) / nA, -HALF + i * 2 * HALF / nB);
    const fx = Math.min(W - 1.001, Math.max(0, (tx(mx) - x0) * 512 - 0.5)), fy = Math.min(Hh - 1.001, Math.max(0, (ty(my) - y0) * 512 - 0.5)), ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    out[j * (nB + 1) + i] = (el(ix, iy) * (1 - ax) + el(ix + 1, iy) * ax) * (1 - ay) + (el(ix, iy + 1) * (1 - ax) + el(ix + 1, iy + 1) * ax) * ay;
  }
  return out;
}
const m4 = {
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
const V3D_VS = `attribute vec2 aXZ; attribute float aH; attribute vec2 aG; attribute vec2 aUV; attribute float aH2; attribute vec2 aG2;
uniform mat4 uM; uniform float uX, uHzV; uniform vec3 uBox, uSplitV; varying vec2 vUV;      /* uSplitV and uHzV: the fragment shader has its own copies, a uniform must have the same precision in both */ varying vec3 vN; varying float vD;
void main(){
  bool second = false;      /* compare: the part of the screen that shows the second year also gets the ice surface of that year */
  if (uSplitV.x >= 0.0) { vec4 q = uM * vec4(aXZ.x, aH * uX, aXZ.y, 1.0); vec2 n = q.xy / q.w; second = (uHzV > 0.5 ? 0.5 - 0.5 * n.y : 0.5 + 0.5 * n.x) > uSplitV.x; }
  float h = second ? aH2 : aH; vec2 g = second ? aG2 : aG;
  vUV = aUV; vN = normalize(vec3(-g.x * uX, 1.0, -g.y * uX)); vD = max(abs(aXZ.x) / uBox.x, abs(aXZ.y - uBox.z) / uBox.y); gl_Position = uM * vec4(aXZ.x, h * uX, aXZ.y, 1.0); }`;
const V3D_FS = `precision mediump float; uniform sampler2D uTex; uniform sampler2D uTex2; uniform vec3 uSplit; uniform float uHz; varying vec2 vUV; varying vec3 vN; varying float vD;
void main(){ float pos = uHz > 0.5 ? uSplit.z - gl_FragCoord.y : gl_FragCoord.x, at = uSplit.x * (uHz > 0.5 ? uSplit.z : uSplit.y); bool right = uSplit.x >= 0.0 && pos > at;      /* stacked: first year on top, second below; else first on the left */ vec3 c = right ? texture2D(uTex2, vUV).rgb : texture2D(uTex, vUV).rgb; float lam = max(dot(normalize(vN), normalize(vec3(0.41, 0.57, 0.71))), 0.0);
  c *= clamp(0.72 + 0.6 * (lam - 0.57), 0.45, 1.15);      /* light from the south-east, like the satellite's morning sun, only a light touch because the picture has its own shadows */
  c = mix(vec3(0.043, 0.071, 0.125), c, smoothstep(1.0, 0.8, vD));
  if (uSplit.x >= 0.0 && abs(pos - at) < 1.5) c = vec3(1.0);      /* the line between the two years */
  gl_FragColor = vec4(c, 1.0); }`;
let v3d = null;
let meshWideOk;
const meshWide = () => meshWideOk !== undefined ? meshWideOk : (meshWideOk = (() => { try { return !!document.createElement('canvas').getContext('webgl').getExtension('OES_element_index_uint'); } catch { return false; } })());      // 32-bit indices: the fine mesh
function startViewer(canvas, heights, texCanvas, nA, nB, up, BACK = V3D.BACK, distMul = 1){
  const {HALF} = V3D, gl = canvas.getContext('webgl', {antialias: true});
  if (!gl) throw new Error('WebGL is not available');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, V3D_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, V3D_FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const len = up + BACK, sx = 2 * HALF / nB, sz = len / nA, W = nB + 1, jt = Math.round(up / len * nA), h0 = heights[jt * W + nB / 2];      // nB is even      // h0: height of the tongue tip, the camera looks near it
  let cur = heights;      // the heights on show (the ice surface of the year)
  const at0 = (a, i, j) => a[Math.min(nA, Math.max(0, j)) * W + Math.min(nB, Math.max(0, i))] - h0;
  const hh = (i, j) => at0(heights, i, j);      // the terrain as loaded: the camera uses this one, so that the picture stays still when the ice surface changes with the year
  const hc = (i, j) => at0(cur, i, j);      // the terrain on show (the ice surface of the year): for marks standing on it
  const wide = !!gl.getExtension('OES_element_index_uint'), vd = new Float32Array(W * (nA + 1) * 10), idx = new (wide ? Uint32Array : Uint16Array)(nA * nB * 6);
  if (!wide && W * (nA + 1) > 65535) throw new Error('this device cannot draw the fine terrain');
  const fill = (h1, h2) => {            // vertex data: x, z, height, slope x, slope z, u, v, then height and slopes of the second year
    cur = h1; const at = (a, i, j) => a[Math.min(nA, Math.max(0, j)) * W + Math.min(nB, Math.max(0, i))] - h0;
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
  const uSplit = gl.getUniformLocation(pr, 'uSplit'), uHz = gl.getUniformLocation(pr, 'uHz'), uSplitV = gl.getUniformLocation(pr, 'uSplitV'), uHzV = gl.getUniformLocation(pr, 'uHzV'); let split = -1, hz = 0;      // share of the screen width where the second year starts; -1 = one year only
  const uM = gl.getUniformLocation(pr, 'uM'), uX = gl.getUniformLocation(pr, 'uX');
  gl.enable(gl.DEPTH_TEST); gl.uniform3f(gl.getUniformLocation(pr, 'uBox'), HALF, len / 2, (BACK - up) / 2);      // half width, half length, z of the middle: the soft edge
  const cam = {az: 0, el: 0.35, dist: 3400 * distMul, exag: 1}, [E0, E1] = V3D.EL, [D0, D1] = V3D.DIST, A = V3D.AZ;
  const ground = (x, z) => hh(Math.round((x + HALF) / (2 * HALF) * nB), Math.round((z + up) / len * nA)) * cam.exag;
  const groundNow = (x, z) => hc(Math.round((x + HALF) / (2 * HALF) * nB), Math.round((z + up) / len * nA)) * cam.exag;
  let dirty = true, dead = false, held = false;      // held: an export is drawing at its own size, the screen is left alone
  let pose = null, flightId = 0;      // pose: the camera of a historic photograph (position in the scene, yaw, pitch, roll, vertical field of view, view = where the picture's centre sits on the screen); null: the orbiting camera
  const rigOrbit = () => {            // where the camera is and what it looks at
    const ce = Math.cos(cam.el), tgt = [0, ground(0, -1200), -1200], eye = [tgt[0] + cam.dist * ce * Math.sin(cam.az), tgt[1] + cam.dist * Math.sin(cam.el), tgt[2] + cam.dist * ce * Math.cos(cam.az)];      // the camera turns around a point 1.2 km up the glacier, so the tongue sits in the middle of the picture
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
  const viewM = (w, h, view) => {            // projection and camera of the picture (view: the part of the screen a download frame covers)
    if (pose) return m4.mul(m4.persp(pose.fovY, w / h, 10, 30000, view || (pose.view ? {a: w / h, sx: 1, sy: 1, cx: pose.view.cx, cy: pose.view.cy} : null)), poseView(pose));
    const {eye, tgt} = rig();
    return m4.mul(m4.persp(0.75, w / h, 50, 30000, view), m4.look(eye, tgt));
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
    gl.uniformMatrix4fv(uM, false, viewM(w, h, view)); gl.uniform1f(uX, cam.exag); gl.uniform3f(uSplit, split, w, h); gl.uniform1f(uHz, hz); gl.uniform3f(uSplitV, split, w, h); gl.uniform1f(uHzV, hz);
    gl.drawElements(gl.TRIANGLES, idx.length, wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  };
  const draw = () => {
    if (dead) return; dirty = false; if (held) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    paint(w, h);
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
    const ce = Math.cos(cam.el), tgt = [0, ground(0, -1200), -1200], eye = [tgt[0] + cam.dist * ce * Math.sin(cam.az), tgt[1] + cam.dist * Math.sin(cam.el), tgt[2] + cam.dist * ce * Math.cos(cam.az)];
    eye[1] = Math.max(eye[1], ground(eye[0], eye[2]) + 40); Object.assign(cam, keep); return eye;
  };
  const groundIn = (x, z) => Math.abs(x) <= HALF && z >= -up && z <= BACK ? groundNow(x, z) : -Infinity;      // -Infinity: not on the strip
  const pick = (px, py, w, h) => {            // the place on the terrain under a pixel of a picture w x h: [x, z] of the scene, or null (the sky, or off the strip)
    if (pose) return null;
    const {eye, tgt} = rig(), nz = [eye[0] - tgt[0], eye[1] - tgt[1], eye[2] - tgt[2]], lz = Math.hypot(...nz), z = nz.map(v => v / lz);
    const xr = [z[2], 0, -z[0]], lx = Math.hypot(...xr), x = xr.map(v => v / lx), y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const th = Math.tan(0.75 / 2), nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2, d = [0, 1, 2].map(i => x[i] * nx * th * (w / h) + y[i] * ny * th - z[i]), ld = Math.hypot(...d);
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
  canvas.onpointerdown = e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; };
  canvas.onpointermove = e => {
    const p = ptrs.get(e.pointerId); if (!p || pose) return;
    if (ptrs.size === 1) { cam.az -= (e.clientX - p[0]) * 0.006; cam.el += (e.clientY - p[1]) * 0.005; }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist *= pinch / d; pinch = d; }
    clampCam();
  };
  canvas.onpointerup = canvas.onpointercancel = e => { ptrs.delete(e.pointerId); pinch = 0; };
  canvas.onwheel = e => { e.preventDefault(); if (pose) return; cam.dist *= Math.exp(e.deltaY * 0.0012); clampCam(); };
  const ro = new ResizeObserver(redraw); ro.observe(canvas);
  draw();
  const setTexture = (c, unit = 0) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D); redraw(); };
  const setSplit = (f, horizontal) => { split = f; hz = horizontal ? 1 : 0; redraw(); };
  const setHeights = (h1, h2 = h1) => { fill(h1, h2); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, vd, gl.STATIC_DRAW); redraw(); };      // another year's ice surface
  return {setPose, hasPose: () => !!pose, pick, setExag: v => { cam.exag = v; redraw(); }, getCam: () => ({az: cam.az, el: cam.el, dist: cam.dist}), setOnCam: f => { onCam = f; }, projectAt, groundY: (x, z) => groundNow(x, z), groundIn, getEye: eyeOf, exag: () => cam.exag, setCam: c => { Object.assign(cam, c); clampCam(); }, frame, hold, getSplit: () => ({split, hz}), setTexture, setSplit, setHeights, destroy: () => { dead = true; ro.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onwheel = null;
    gl.deleteBuffer(vb); gl.deleteBuffer(ib); texs.forEach(t => gl.deleteTexture(t)); gl.deleteProgram(pr); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }};
}
let v3dCtx = null, v3dBusy = false;      // v3dCtx: what the download buttons need from the open 3D view
let v3dSplit = 0.5;      // v3dSplit: where the line between the two years sits (share of the width, or of the height when the images are stacked)
function setSplit3D(f){
  v3dSplit = Math.min(0.97, Math.max(0.03, f));
  $('v3d').style.setProperty('--s', v3dSplit); $('v3dDiv').setAttribute('aria-valuenow', Math.round(v3dSplit * 100));
  if (v3d && v3dCtx && v3dCtx.cmp && !photoOn) v3d.setSplit(v3dSplit, v3dCtx.hz);
  if (photoOn) clipPhoto();
}
function showDivider3D(cmp, hz){            // compare mode: a line on the picture with a handle to drag, and the two years beside it
  const d = $('v3dDiv'); d.classList.toggle('hz', hz); d.classList.toggle('used', sliderHintDone); d.hidden = false;
  $('v3d').classList.toggle('cmp-h', hz); $('v3d').classList.toggle('cmp-v', !hz);
  $('v3dLabA').textContent = cmp[0]; $('v3dLabB').textContent = cmp[1]; $('v3dLabA').hidden = $('v3dLabB').hidden = false;
  setSplit3D(v3dSplit);
}
function hideDivider3D(){ $('v3dDiv').hidden = $('v3dLabA').hidden = $('v3dLabB').hidden = true; $('v3d').classList.remove('cmp-h', 'cmp-v'); }
(() => {
  const d = $('v3dDiv'), at = e => { const r = $('v3dCanvas').getBoundingClientRect(); setSplit3D(v3dCtx && v3dCtx.hz && !photoOn ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width); };
  d.addEventListener('pointerdown', e => { d.setPointerCapture(e.pointerId); d.classList.add('used'); sliderHintDone = true; $('handle').classList.add('used'); at(e); e.preventDefault(); });
  d.addEventListener('pointermove', e => { if (d.hasPointerCapture(e.pointerId)) at(e); });
  d.addEventListener('keydown', e => { const k = {ArrowLeft: -.03, ArrowUp: -.03, ArrowRight: .03, ArrowDown: .03}[e.key]; if (k) { setSplit3D(v3dSplit + k); d.classList.add('used'); sliderHintDone = true; $('handle').classList.add('used'); e.preventDefault(); } });
})();
let v3dRun = 0, v3dTerrain = null, v3dCamId = null;      // v3dTerrain: heights of the last glacier, kept so that switching mode or year does not fetch them again
function sync3D(){            // the 3D view follows the left panel: another mode, year or colour style opens it again with the new choice
  if (document.getElementById('v3d').hidden) return;      // not $(): this runs during start-up, before $ exists
  clearTimeout(sync3D.t); sync3D.t = setTimeout(() => { if (!$('v3d').hidden) open3D(); }, 150);
}
function close3D(){ v3dRun++; resetPhotos(); v3dCtx = null; hideDivider3D(); pinLoop(); if (v3d) { v3d.destroy(); v3d = null; } $('v3d').hidden = true; $('v3dCanvas').replaceWith($('v3dCanvas').cloneNode(false)); }      // a fresh canvas each time: a lost WebGL context cannot be reused
/* Base maps and the hiking trails on the picture of the strip: the tiles of the same servers as on the map, drawn one by one into the picture (kept, so another year or layer does not fetch them again) */
const tileCache = new Map();
const tileBitmap = url => {
  if (!tileCache.has(url)) { if (tileCache.size > 500) tileCache.clear(); tileCache.set(url, fetch(url).then(r => r.ok ? r.blob() : null).then(b => b ? createImageBitmap(b) : null).catch(() => null)); }
  return tileCache.get(url);
};
const V3D_BASES = {
  osmToggle: {max: 19, credit: '© OpenStreetMap contributors', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`},
  topoToggle: {max: 18, credit: '© swisstopo', url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`},
  altiToggle: {max: 18, credit: '© swisstopo (swissALTI3D)', url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissalti3d-reliefschattierung/default/current/3857/${z}/${x}/${y}.png`}
};
const V3D_TRAILS = {max: 17, url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/${z}/${x}/${y}.png`};
const baseKey = () => Object.keys(V3D_BASES).find(k => $(k).checked);
async function drawTiles(ctx, S, toTexM, def, wantZ){
  const {WM, HALF} = V3D, corners = [[-S.back, -HALF], [-S.back, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b));
  const range = z => { const T = 2 * WM / 2 ** z, xs = corners.map(c => (c[0] + WM) / T), ys = corners.map(c => (WM - c[1]) / T); return {z, T, x0: Math.floor(Math.min(...xs)), x1: Math.floor(Math.max(...xs)), y0: Math.floor(Math.min(...ys)), y1: Math.floor(Math.max(...ys))}; };
  let R = range(Math.min(def.max, wantZ)); if ((R.x1 - R.x0 + 1) * (R.y1 - R.y0 + 1) > 90 && R.z > 13) R = range(R.z - 1);      // not too many tiles
  const jobs = []; for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) jobs.push(tileBitmap(def.url(R.z, x, y)).then(bmp => ({x, y, bmp})));
  const tiles = await Promise.all(jobs);
  ctx.save(); ctx.imageSmoothingQuality = 'high';
  tiles.forEach(({x, y, bmp}) => {
    if (!bmp) return;
    const mx = x * R.T - WM, my = WM - y * R.T, p0 = toTexM(mx, my), p1 = toTexM(mx + R.T, my), p2 = toTexM(mx, my - R.T), k = 256 / bmp.width;
    ctx.setTransform((p1[0] - p0[0]) / 256 * k, (p1[1] - p0[1]) / 256 * k, (p2[0] - p0[0]) / 256 * k, (p2[1] - p0[1]) / 256 * k, p0[0], p0[1]); ctx.drawImage(bmp, 0, 0, bmp.width + 0.6, bmp.height + 0.6);
  });
  ctx.restore();
}
const outline3D = g => !!(g.inv && g.inv.oldest) && $('oldToggle').checked;      // the layers of the map, drawn on the picture of the 3D view
const outlineNew3D = g => !!(g.inv && g.inv.outline) && $('newToggle').checked;
const radar3D = g => !!(g.inv && g.inv.radar) && $('radarToggle').checked;
const layerCreditNames = g => [baseKey() && ({osmToggle: 'OpenStreetMap', topoToggle: 'swisstopo', altiToggle: 'swisstopo'}[baseKey()] || null), $('trailsToggle').checked && 'swisstopo', (outline3D(g) || outlineNew3D(g) || radar3D(g)) && 'GLAMOS', $('l3Names').checked && 'swisstopo'].filter(Boolean);
const layersCredit = g => layerCreditNames(g).join(' · ');
const layersCreditText = g => { const t = layersCredit(g); return t ? ` Layers: ${t}.` : ''; };      // the sentence in the full note under the 3D view
/* The 3D view needs only the strip, which is a small part of the glacier area (Aletsch: about a twelfth): it asks the relay for a picture of just the box around the strip, at the same 10 m pixels.
   The box is cut in whole 10 m steps from the geometry of the strip (the baked file), so every visitor asks for exactly the same picture and the relay's cache serves it. If the whole-glacier
   picture is already here (the map shows it) it is used instead; if a strip picture cannot be had, the whole one is used and no more strips are tried in this visit. */
function stripImageSpec(S){
  const {HALF} = V3D, cs = [[-S.back, -HALF], [-S.back, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b)), pad = 60, step = 10;
  const x0 = Math.floor((Math.min(...cs.map(c => c[0])) - pad) / step) * step, x1 = Math.ceil((Math.max(...cs.map(c => c[0])) + pad) / step) * step;
  const y0 = Math.floor((Math.min(...cs.map(c => c[1])) - pad) / step) * step, y1 = Math.ceil((Math.max(...cs.map(c => c[1])) + pad) / step) * step, scale = 1 / Math.cos(Math.atan(Math.sinh(S.P.y / 6378137)));      // Mercator metres per ground metre
  return {bbox: [x0, y0, x1, y1], w: Math.min(CDSE.maxPx, Math.round((x1 - x0) / (CDSE.groundRes * scale))), h: Math.min(CDSE.maxPx, Math.round((y1 - y0) / (CDSE.groundRes * scale)))};
}
async function stripSpecFor(g){ const b = await loadBundle(g.inv && g.inv.id), at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue; return stripImageSpec(b ? stripOf(b, g) : stripFor(g, at)); }
const loadStripPicture = async (g, yr) => loadImage(g, yr, await stripSpecFor(g));      // used by tools/warm-up.html to fill the relay's cache
let stripPicturesOff = false;
async function strip3DTexture(g, S, yr, nA){            // the satellite picture of a year, turned so that up the glacier is up, as the texture of the strip
  if ($('trailsToggle').checked) await ensureSight();
  const {HALF, TEX} = V3D, len = S.up + S.back; let bb = imageFootprint(g).bbox, u = null;
  if (!stripPicturesOff && !imageHere(g, yr)) { try { const sp = stripImageSpec(S); u = await loadImage(g, yr, sp); bb = sp.bbox; } catch (e) { stripPicturesOff = true; console.warn('The strip picture could not be had, the whole one is used:', e); } }
  if (!u) u = await loadImage(g, yr);
  const url = await adjustedUrl(u, brightness(), 1, g), bmp = await createImageBitmap(await (await fetch(url)).blob());
  const tc = document.createElement('canvas'); tc.width = TEX[0]; tc.height = TEX[1];
  const kx = bmp.width / (bb[2] - bb[0]), ky = bmp.height / (bb[3] - bb[1]), ctx = tc.getContext('2d');
  const toTexM = (mx, my) => { const dx = (mx - S.P.x) / S.k, dy = (my - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue; return [(b + HALF) / (2 * HALF) * TEX[0], (S.up - a) / len * TEX[1]]; };
  const toTex = (ix, iy) => toTexM(bb[0] + ix / kx, bb[3] - iy / ky);
  const p0 = toTex(0, 0), p1 = toTex(1, 0), p2 = toTex(0, 1);
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, TEX[0], TEX[1]); ctx.imageSmoothingQuality = 'high';
  if (baseKey()) await drawTiles(ctx, S, toTexM, V3D_BASES[baseKey()], 15);      // under the satellite picture, which shows it through where it is not opaque
  const imgM = [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]], oa = outsideAlpha(), og = outlineGeom(g);
  if (og && oa < 0.99) {            // surroundings opacity: the picture outside the 1850 outline is made fainter (the base map or empty space shows), inside it stays as it is
    ctx.globalAlpha = imgOpacity() * oa; ctx.setTransform(...imgM); ctx.drawImage(bmp, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.save(); ctx.beginPath();
    og.coordinates.forEach(poly => poly.forEach(ring => { ring.forEach((pt, i) => { const q = L.CRS.EPSG3857.project(L.latLng(pt[1], pt[0])), [x, y] = toTexM(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }));
    ctx.clip(); ctx.globalAlpha = imgOpacity(); ctx.setTransform(...imgM); ctx.drawImage(bmp, 0, 0); ctx.restore();
  } else { ctx.globalAlpha = imgOpacity(); ctx.setTransform(...imgM); ctx.drawImage(bmp, 0, 0); }
  if (bmp.close) bmp.close(); ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sight = $('trailsToggle').checked && sightFor(g);
  if (sight) {            // where the tongue is in view from the trail, under the trail lines
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [['rgba(255,255,255,.85)', 14], ['rgba(123,44,255,.9)', 8]].forEach(([color, w]) => { ctx.strokeStyle = color; ctx.lineWidth = w; sight.lines.forEach(l => { ctx.beginPath(); l.forEach(([lat, lng], i) => { const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), [x, y] = toTexM(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }); });
    ctx.restore();
  }
  if ($('trailsToggle').checked) await drawTiles(ctx, S, toTexM, V3D_TRAILS, 15);
  const toXY = ll => { const q = L.CRS.EPSG3857.project(L.latLng(ll[1], ll[0])); return toTexM(q.x, q.y); };
  const rings = (geom, color, dash) => {            // an outline, drawn on the picture so that it follows the terrain
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 3.5; ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
    geom.coordinates.forEach(poly => poly.forEach(ring => { ctx.beginPath(); ring.forEach((pt, i) => { const [x, y] = toXY(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); }));
    ctx.restore();
  };
  if (outlineNew3D(g)) rings(g.inv.outline, getVar('--new'), []);
  if (outline3D(g)) rings(g.inv.oldest.outline, '#F2A93B', [14, 9]);
  return tc;
}
/* Ice surface of the year: demchange.js (made by scripts/build_dem_change.py) holds the change between two editions of swissALTI3D inside the glacier outline.
   The surface of a year is the newer edition (what the terrain tiles show) minus that change times a share f: 0 at the survey year of the newer edition, 1 at that of the
   older one, in between and beyond following the yearly mass balance (own series where GLAMOS measures it, else the Swiss-wide one). The survey years are assumptions, stored in the file. */
let v3dDem = null; const demFiles = new Map();
const loadDemChange = id => { if (!demFiles.has(id)) demFiles.set(id, fetch(asset(`demchange/${id}.json`)).then(r => r.ok ? r.json() : null).catch(() => null)); return demFiles.get(id); };      // one small file per glacier, if there is one
async function iceChangeGrid(g, S, nA, nB){            // the change (m) at every vertex of the strip, or null when this glacier has no data
  const d = g.inv && g.inv.id ? await loadDemChange(g.inv.id) : null; if (!d) return null;
  if (!v3dDem || v3dDem.id !== g.inv.id) {
    const bin = Uint8Array.from(atob(d.z), c => c.charCodeAt(0));
    v3dDem = {id: g.inv.id, z: new Int16Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())};
  }
  const z = v3dDem.z, at = (ci, cj) => ci < 0 || cj < 0 || ci >= d.w || cj >= d.h ? 0 : z[cj * d.w + ci] / 100, R = 6378137, out = new Float32Array((nA + 1) * (nB + 1)), {HALF} = V3D, BACK = S.back;
  for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) {
    const [mx, my] = S.merc(S.up - j * (S.up + BACK) / nA, -HALF + i * 2 * HALF / nB), [E, N] = lv95(mx / R * 180 / Math.PI, (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI);      // lv95 (section 1) takes longitude first
    const fx = (E - d.e0) / d.cell - 0.5, fy = (N - d.n0) / d.cell - 0.5, ci = Math.floor(fx), cj = Math.floor(fy), ax = fx - ci, ay = fy - cj;
    out[j * (nB + 1) + i] = (at(ci, cj) * (1 - ax) + at(ci + 1, cj) * ax) * (1 - ay) + (at(ci, cj + 1) * (1 - ax) + at(ci + 1, cj + 1) * ax) * ay;
  }
  return {delta: out, old: d.old, new: d.new};
}
function iceShare(g, dem, y){            // f for a year, see above; null when no balance series covers the survey period
  const t0 = dem.old.year, t1 = dem.new.year, swiss = new Map((DATA && DATA.swiss_balance) || []), own = g.inv && g.inv.balance ? new Map(g.inv.balance) : null;
  let useOwn = !!own; for (let t = t0 + 1; t <= t1 && useOwn; t++) if (!own.has(t)) useOwn = false;
  const loss = t => { const b = useOwn && own.has(t) ? own.get(t) : swiss.get(t); return b === undefined ? 0 : -b / 1000; };      // m w.e.; a year without a balance counts as 0
  let den = 0; for (let t = t0 + 1; t <= t1; t++) den += loss(t);
  if (!(den > 0)) return null;
  let num = 0; if (y <= t1) for (let t = y + 1; t <= t1; t++) num += loss(t); else for (let t = t1 + 1; t <= y; t++) num -= loss(t);
  return num / den;
}
const surfaceFor = (g, heights, dem, y) => { const f = dem && iceShare(g, dem, y); if (!f && f !== 0) return heights; const h = new Float32Array(heights.length); for (let k = 0; k < h.length; k++) h[k] = heights[k] - dem.delta[k] * f; return h; };
/* The baked file of a glacier (terrain/<id>.<hash>.bin, made by scripts/build_terrain_bundle.py): the heights, the ice change, the peak names and the radar pins of the strip in one small
   file, instead of nine or so terrain tiles, a change file and two more requests for every visitor. The manifest says which file is current (asked for fresh, it is tiny); the file
   itself stays in the browser until the manifest names another. Without a file the page builds all of it from the terrain tiles, as before. */
let terrainManifest = null; const bundles = new Map();
const loadManifest = () => terrainManifest || (terrainManifest = fetch('terrain/manifest.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : {}).catch(() => ({})));
async function parseBundle(buf){
  const dv = new DataView(buf); if (dv.getUint32(0, false) !== 0x54465331) throw new Error('not a terrain file');      // "TFS1"
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const all = new Int16Array(await new Response(new Blob([new Uint8Array(buf, 8 + hl)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const W = head.nB + 1, n = (head.nA + 1) * W, undo = (off, scale, add) => {            // rows are stored as differences: add them up again
    const out = new Float32Array(n); for (let j = 0; j <= head.nA; j++) { let acc = 0; for (let i = 0; i < W; i++) { acc = (acc + all[off + j * W + i]) << 16 >> 16; out[j * W + i] = acc * scale + add; } } return out; };
  return {...head, heights: undo(0, 0.1, head.h0), delta: head.dem ? undo(n, 0.01, 0) : null};
}
function loadBundle(id){            // the parsed file of a glacier, or null (no file, no network, a broken file): the caller then falls back to the terrain tiles
  if (!id) return Promise.resolve(null);
  if (!bundles.has(id)) bundles.set(id, (async () => {
    const name = (await loadManifest())[id]; if (!name) return null;
    const rec = await idb.get('terrain|' + id);
    if (rec && rec.name === name && rec.buf) { try { return await parseBundle(rec.buf); } catch (e) { console.error('terrain file in the cache is broken, loading it again', e); } }
    const r = await fetch('terrain/' + name); if (!r.ok) return null;
    const buf = await r.arrayBuffer(), b = await parseBundle(buf); idb.set('terrain|' + id, {name, buf}); return b;
  })().catch(e => { console.error('terrain file', e); bundles.delete(id); return null; }));
  return bundles.get(id);
}
const stripOf = (b, g) => ({P: {x: b.P[0], y: b.P[1]}, k: b.k, ue: b.ue, un: b.un, up: b.up, back: b.back, dist: (V3D_VIEW[g.inv && g.inv.id] || {}).dist || 1,
  merc: (a, c) => [b.P[0] + (a * b.ue + c * b.un) * b.k, b.P[1] + (a * b.un - c * b.ue) * b.k]});      // the strip as the file was made: the same as stripFor() finds
function coarseBundle(b){            // every second point: the 28 m grid for devices that cannot draw the fine one
  const nA = b.nA / 2, nB = b.nB / 2, W = b.nB + 1, W2 = nB + 1, pick = a => { if (!a) return null; const o = new Float32Array((nA + 1) * W2); for (let j = 0; j <= nA; j++) for (let i = 0; i <= nB; i++) o[j * W2 + i] = a[2 * j * W + 2 * i]; return o; };
  return {...b, nA, nB, heights: pick(b.heights), delta: pick(b.delta)};
}
/* The note at the bottom of the 3D view: in full on bigger screens; on phones one short line (what the picture is made of) with "Details" for the rest */
const shortLayerNames = g => layerCreditNames(g).filter(n => n !== 'swisstopo').map(n => ' · ' + n).join('');
function note3DHtml(g, picture, when, usesDem, terrainNote){
  const full = `Terrain: swissALTI3D © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a> via <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>. ${picture}${terrainNote}<span id="v3dLc">${layersCreditText(g)}</span> <button type="button" class="n-more n-less">Less</button>`;
  const short = `Sentinel-2 ${when} · swisstopo · Mapterhorn<span id="v3dLcS">${shortLayerNames(g)}</span>${usesDem ? ' · ice surface: estimate' : ''} <button type="button" class="n-more">Details</button>`;
  return `<span class="n-short">${short}</span><span class="n-full">${full}</span>`;
}
$('v3dNote').addEventListener('click', e => { const b = e.target.closest && e.target.closest('.n-more'); if (b) $('v3dNote').classList.toggle('open'); });
async function open3D(){
  const run = ++v3dRun, g = currentGlacier(), at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue, msg = $('v3dMsg');
  const cmp = state.mode === 'compare' && state.a !== state.b && state.available[state.a] && state.available[state.b] ? [state.a, state.b] : null;      // compare: both years side by side with a slider
  const years = cmp || (state.mode === 'timelapse' ? tlFrames() : [stillYear()].filter(y => state.available[y])), first = years.includes(stillYear()) ? stillYear() : years[years.length - 1];
  if (M3.gid && M3.gid !== g.id) clear3Measure();      // measurements belong to the glacier they were made on
  resetPhotos(); sync3DMenu(); v3dCtx = null; hideDivider3D(); radarHover = radarSel = -1; $('v3dNote').textContent = ''; $('v3d').hidden = false; $('v3dTitle').textContent = `${g.name} in 3D`; msg.hidden = false;
  const keepCam = v3d && v3dCamId === g.id ? v3d.getCam() : null; v3dCamId = g.id;      // opening again for another year, mode or outline keeps the view the visitor chose
  if (v3d) { v3d.destroy(); v3d = null; $('v3dCanvas').replaceWith($('v3dCanvas').cloneNode(false)); }      // a lost WebGL context cannot be reused: new canvas
  try {
    if (!state.checked) { msg.textContent = $('status').textContent; return; }      // still looking for scenes: the search opens the view again when it is done (refreshAll)
    if (!years.length || !at) throw new Error('There is no satellite image for this year.');
    msg.textContent = 'Loading terrain and picture…';
    await loadOutline(g);      // stripFor() and the 2023 outline layer need it
    const bundle = await loadBundle(g.inv && g.inv.id), bb = bundle && (meshWide() ? bundle : coarseBundle(bundle));      // the baked file of this glacier, if there is one
    if (run !== v3dRun) return;
    const S = bundle ? stripOf(bundle, g) : stripFor(g, at), {HALF} = V3D, BACK = S.back, cell = V3D.CELL[meshWide() ? 0 : 1], nA = bb ? bb.nA : Math.round((S.up + BACK) / cell), nB = bb ? bb.nB : 2 * Math.round(HALF / cell);
    if (!bb && (!v3dTerrain || v3dTerrain.id !== g.id)) { const hp = loadHeights(S, nA, nB); v3dTerrain = {id: g.id, hp}; hp.catch(() => { if (v3dTerrain && v3dTerrain.hp === hp) v3dTerrain = null; }); }
    const [heights, tc, tc2, dem] = await Promise.all([bb ? bb.heights : v3dTerrain.hp, strip3DTexture(g, S, cmp ? cmp[0] : first, nA), cmp ? strip3DTexture(g, S, cmp[1], nA) : null,
      bb ? (bb.delta && bb.dem ? {delta: bb.delta, old: bb.dem.old, new: bb.dem.new} : null) : iceChangeGrid(g, S, nA, nB).catch(() => null)]);
    if (run !== v3dRun) return;
    v3d = startViewer($('v3dCanvas'), heights, tc, nA, nB, S.up, S.back, S.dist);
    v3d.setExag(+$('v3dExag').value); msg.hidden = true; if (keepCam) v3d.setCam(keepCam);
    v3d.setOnCam(() => { if (!$('videoSheet').hidden) hint3D(); });      // the sharpness hint follows the zoom
    bindRadarPicking($('v3dCanvas'));
    const hy = y => surfaceFor(g, heights, dem, y), usesDem = !!dem && iceShare(g, dem, first) !== null;      // the ice surface follows the year when the glacier has data for it
    const terrainNote = usesDem ? ` Ice surface of each year: estimate from the swissALTI3D editions ${dem.old.edition} and ${dem.new.edition} (surveys ${dem.old.year}${dem.old.assumed ? ', assumed,' : ''} and ${dem.new.year}; the years before ${dem.old.year} and after ${dem.new.year} are extrapolated) and the yearly mass balance (GLAMOS); after the last measured year it stays as it was.` : ' The terrain model is older than the picture, so the ice sits a little lower today.';
    if (usesDem) { if (cmp) v3d.setHeights(hy(cmp[0]), hy(cmp[1])); else v3d.setHeights(hy(first)); }
    let current = first;      // declared before the context: the download pane reads it as soon as the context exists
    v3dCtx = {g, S, bundle: bb, latest: heights, dem, grid: {nA, nB}, cmp, years, pin: pinData(g, S), tip: tipData(g, S), names: null, namesP: null, hz: horiz(), tex: y => strip3DTexture(g, S, y, nA), surface: hy, usesDem, follow: null, current: () => cmp ? null : current, restore: () => cmp ? null : showYear(current)};
    if (viewMode === '3d' && !$('videoSheet').hidden) update3DInfo();
    pinLoop(); setupPhotos(g, v3dCtx);
    if (cmp) {
      v3d.setTexture(tc2, 1); showDivider3D(cmp, v3dCtx.hz);      // same direction as chosen for the map: stacked or side by side
      $('v3dTitle').textContent = `${g.name} ${cmp[0]} and ${cmp[1]} in 3D`;
      $('v3dNote').innerHTML = note3DHtml(g, `Pictures: Sentinel-2, ${fmtDate(state.available[cmp[0]].date)} and ${fmtDate(state.available[cmp[1]].date)}.`, `${state.available[cmp[0]].date.slice(0, 4)} and ${state.available[cmp[1]].date.slice(0, 4)}`, usesDem, terrainNote);
      return;
    }
    const note = yr => { $('v3dTitle').textContent = `${g.name} ${yr} in 3D`; $('v3dNote').innerHTML = note3DHtml(g, `Picture: Sentinel-2, ${fmtDate(state.available[yr].date)}.`, fmtDM(state.available[yr].date) + ' ' + yr, usesDem, terrainNote); };
    note(first);
    const showYear = async y => {      // the year follows the left panel (the frame of the timelapse); the terrain stays and only the picture changes
      current = y;
      const c = await strip3DTexture(g, S, y, nA); if (run !== v3dRun || current !== y) return;
      v3d.setTexture(c); if (usesDem) v3d.setHeights(hy(y)); note(y);
      if (!$('videoSheet').hidden) update3DInfo();      // the labels in the frame show the year
    };
    v3dCtx.follow = y => { if (y !== current && !v3dBusy) showYear(y); };
  } catch (err) { if (run === v3dRun) { msg.hidden = false; msg.textContent = '3D view failed: ' + (err && err.message || err); } }
}

/* ---- Historic photographs (prototype: Aletsch) ----
   photos.json (made by scripts/build_photos.py from Smapshot, HEIG-VD) holds, per glacier, a few historic photographs with the place and angles of the camera. The rail on the left lists them;
   a click flies the 3D camera to the photographer's place and looks the way the photograph looks, with the same field of view. The photograph lies over the picture, a line to drag
   shows it on one side and the 3D view on the other, so the change of the ice is seen from exactly the same spot. The ice surface of the 3D side is the estimate for the year of the photograph. */
let photosFile = null, photoOn = null, photoRun = 0;      // photoOn: the photograph on show
const loadPhotos = () => photosFile || (photosFile = fetch(asset('photos.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})));
/* The ice level of an old photograph is not reconstructed as a surface (the interpolation did not fit): the terrain stays the latest measured one, and a rod on the glacier 1.6 km above the tip marks how much higher the ice stood then, as an estimate with a range.
   Years inside the measured period (2016 on): the change between the two swissALTI3D surfaces on the glacier 1.6 km above the tip, by the yearly mass balance (middle) and by time (the other end of the range).
   Years before 2016: the thinning of the whole glacier since then from the GLAMOS volume surveys (the low end; from 1927 for Aletsch); before the first survey from the area of the SGI1850 outline against today's with the usual area-volume scaling
   (V proportional to A^1.375, Bahr et al. 1997), joined to the surveys in a straight line. The tongue thins faster than the glacier as a whole: the high end is that thinning times how much faster the tongue thinned in the measured period (the ratio is capped at 6);
   the middle is the geometric mean of the two. */
function tongueCentres(g, S, list){            // the middle of the widest piece of ice inside the strip at several distances up from the tip (2023 outline): x, z in the scene, half of the width to draw
  const rings = []; g.inv.outline.coordinates.forEach(poly => poly.forEach(r => rings.push(r.map(([lng, lat]) => { const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), p = stripXZ(S, q.x, q.y); return [p.a, p.b]; }))));
  const out = [], lim = V3D.HALF - 200;
  list.forEach(a0 => {
    const bs = []; rings.forEach(ring => ring.forEach((pt, i) => { const q = ring[(i + 1) % ring.length]; if ((pt[0] > a0) !== (q[0] > a0)) bs.push(pt[1] + (q[1] - pt[1]) * (a0 - pt[0]) / (q[0] - pt[0])); }));
    bs.sort((x, y) => x - y); let best = null;
    for (let i = 0; i + 1 < bs.length; i += 2) { const lo = Math.max(bs[i], -lim), hi = Math.min(bs[i + 1], lim); if (hi - lo > 250 && (!best || hi - lo > best[1] - best[0])) best = [lo, hi]; }      // not a sliver or a side arm
    if (best) out.push({x: (best[0] + best[1]) / 2, z: -a0, a: a0, half: Math.min(600, (best[1] - best[0]) * 0.4)});
  });
  return out;
}
const tongueCentre = (g, S) => tongueCentres(g, S, [1600, 1400, 1800, 1200, 2000, 1000])[0] || null;      // the default: 1.6 km up
function rodSpot(c, viewer, lay, pose){            // the place for the rod in a photograph: of the candidates 1.0 to 4.4 km above the tip, the one that is in the frame, not behind a ridge and nearest the middle of the photograph (a little preferring 1.6 km)
  const cand = tongueCentres(c.g, c.S, [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2800, 3200, 3600, 4000, 4400].filter(a => a < c.S.up - 200)); if (!cand.length) return null;
  const cw = $('v3dCanvas').clientWidth, ch = $('v3dCanvas').clientHeight, pts = [];
  cand.forEach(k => { const gy = viewer.groundY(k.x, k.z); pts.push([k.x, gy + 50, k.z, true]); });      // tested at an old-ice height: today's ice lies lower, so a ridge that hides it today may not have hidden the ice of the photograph
  const pr = viewer.projectAt(pts, cw, ch, null, null); let best = null;
  cand.forEach((k, i) => {
    const q = pr[i]; if (!q || !q[2] || q[0] < lay.x + 20 || q[0] > lay.x + lay.w - 20 || q[1] < lay.y + 60 || q[1] > lay.y + lay.h - 20) return;
    const score = Math.hypot(q[0] - (lay.x + lay.w / 2), q[1] - (lay.y + lay.h * 0.55)) + Math.abs(k.a - 1600) * 0.05;
    if (!best || score < best.score) best = {k, score};
  });
  return best ? best.k : null;
}
function tongueLowering(c, ctr){            // mean lowering (m, positive) of the ice around the middle of the tongue between the two swissALTI3D surfaces, or null
  if (!c.dem || !c.dem.delta || !ctr) return null;
  const {nA, nB} = c.grid, sx = 2 * V3D.HALF / nB, sz = (c.S.up + c.S.back) / nA, W = nB + 1; let sum = 0, n = 0;
  for (let j = Math.max(0, Math.floor((ctr.z + c.S.up - 400) / sz)); j <= Math.min(nA, Math.ceil((ctr.z + c.S.up + 400) / sz)); j++) for (let i = Math.max(0, Math.floor((ctr.x + V3D.HALF - 400) / sx)); i <= Math.min(nB, Math.ceil((ctr.x + V3D.HALF + 400) / sx)); i++) {
    if (Math.hypot(-V3D.HALF + i * sx - ctr.x, -c.S.up + j * sz - ctr.z) <= 400) { sum += -c.dem.delta[j * W + i]; n++; }
  }
  return n >= 10 ? sum / n : null;
}
function latestOffset(g, c, ctr, y){            // how far below the last measured surface the estimate for a later year stands at that spot (negative: the surface is lower)
  const T = tongueLowering(c, ctr), f = c.dem ? iceShare(g, c.dem, y) : null; return T === null || f === null ? 0 : T * f;      // the same rule as surfaceFor()
}
async function iceLevel(g, y, c, ctr){            // {low, mid, high (m above today's ice on the glacier 1.6 km above the tip), how, ratio, from} or null when it cannot be estimated
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
function resetPhotos(){ photoOn = null; photoRun++; $('v3d').classList.remove('photo-on'); $('v3dPhoto').hidden = true; $('v3dPhotoCap').hidden = true; $('v3dPhotos').hidden = true; $('v3dPhotos').textContent = ''; }
async function setupPhotos(g, ctx){            // the rail of thumbnails, when this glacier has photographs
  const all = await loadPhotos(), list = all[g.inv && g.inv.id]; if (!list || !list.length || ctx !== v3dCtx) return;
  ctx.photos = list;
  const box = $('v3dPhotos'); box.textContent = '';
  const head = document.createElement('div'); head.className = 'ph-head'; head.textContent = 'Then and now'; box.appendChild(head);
  list.forEach((ph, i) => {
    const b = document.createElement('button'), im = document.createElement('img'), sp = document.createElement('span');
    b.type = 'button'; b.className = 'ph'; b.dataset.i = i; b.title = `${ph.date}: ${ph.title}`; im.src = ph.thumb; im.alt = ''; im.loading = 'lazy'; sp.textContent = ph.year; b.append(im, sp); b.onclick = () => enterPhoto(i); box.appendChild(b);
  });
  box.hidden = false;
}
function photoLayout(ph){            // where the photograph sits on the screen, and the matching camera: the same field of view as the photograph, its centre where the photograph's centre is
  const cv = $('v3dCanvas'), cw = cv.clientWidth, ch = cv.clientHeight, phone = cw <= 720, left = phone ? 8 : 96, top = phone ? 118 : 56, bottom = phone ? 112 : 104, aw = cw - left - (phone ? 8 : 14), ah = ch - top - bottom;
  const hr = Math.max(60, Math.min(ah, aw / (ph.w / ph.h))), wr = hr * ph.w / ph.h, x = left + (aw - wr) / 2, y = top + (ah - hr) / 2;
  const fpx = hr * ph.focal / ph.h, fovY = 2 * Math.atan((ch / 2) / fpx), cx = (x + wr / 2 - cw / 2) / (cw / 2), cy = -((y + hr / 2) - ch / 2) / (ch / 2);
  return {x, y, w: wr, h: hr, fovY, view: {cx: -cx, cy: -cy}};
}
function photoPose(ph, S, lay){            // the camera of the photograph in the scene of the strip
  const q = L.CRS.EPSG3857.project(L.latLng(ph.lat, ph.lon)), p = stripXZ(S, q.x, q.y), th = ph.az * Math.PI / 180;
  const a = Math.sin(th) * S.ue + Math.cos(th) * S.un, b = Math.sin(th) * S.un - Math.cos(th) * S.ue, ang = d => (d >= 180 ? d - 360 : d) * Math.PI / 180;      // heading in the strip's frame; tilt and roll: 0 is level, 360 - x is x degrees down / the other way
  return {alt: ph.alt, x: p.x, z: p.z, yaw: Math.atan2(b, a), pitch: ang(ph.tilt), roll: ang(ph.roll), fovY: lay.fovY, view: lay.view};
}
function clipPhoto(){            // the photograph shows left of the line, the 3D view right of it
  if (!photoOn) return;
  const lay = photoOn.lay, cw = $('v3dCanvas').clientWidth, share = Math.min(1, Math.max(0, (v3dSplit * cw - lay.x) / lay.w));
  $('v3dPhoto').style.clipPath = `inset(0 ${((1 - share) * 100).toFixed(2)}% 0 0)`;
}
function placePhoto(){
  const o = photoOn, im = $('v3dPhoto'); o.lay = photoLayout(o.ph);
  Object.assign(im.style, {left: o.lay.x + 'px', top: o.lay.y + 'px', width: o.lay.w + 'px', height: o.lay.h + 'px'}); clipPhoto();
}
const licShort = ph => { const m = /CC[ -](?:BY|0)[A-Za-z-]*\s*[0-9.]*/.exec(ph.licence || ''); return `${ph.owner || 'Archive'}${m ? ', ' + m[0].trim() : ''}`; };      // "ETH Library, CC BY-SA 4.0": the full text of the licence is in the tooltip
const round10 = v => v < 100 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
function rodText(ph, lvl){
  const lo = round10(lvl.low), mid = round10(lvl.mid), hi = round10(lvl.high);
  return `The ice surface in ${ph.date.slice(0, 4)} was about ${mid} m higher here${hi - lo >= 10 ? ` (${lo}–${hi} m)` : ''}`;
}
function photoCaption(ph, lvl, model, dem, latest){
  const cap = $('v3dPhotoCap'); cap.textContent = ''; cap.classList.remove('open');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const a = (txt, href) => { const e = el('a', '', txt); e.href = href; e.target = '_blank'; e.rel = 'noopener'; return e; }, t = el('span', 'pc-t'), l = el('span', 'pc-l'), x = el('button', '', 'Back to 3D'), btns = el('span', 'pc-btns');
  const how = model ? '' : !lvl ? 'No estimate of the old ice level for this year.' : lvl.how === 'surveys' ? `The bar marks the estimated ice level then on the glacier 1.6 km above the tip, between the two measured surfaces (${lvl.t0} and ${lvl.t1}); the range is mass balance against time.`
    : `The bar marks a rough estimate of the ice level then on the glacier 1.6 km above the tip: ${lvl.how === 'scaling' ? 'area–volume scaling (Bahr et al. 1997) between the 1850 and 2023 outlines' : 'the thinning of the whole glacier since then (GLAMOS volume surveys)'}, up to ${lvl.ratio.toFixed(1)} times that, because the ice here thins faster than the glacier as a whole.`;
  const short = ph.year >= 2016 ? '3D: the surface of that year' : '3D: today’s surface';      // one short line; "Details" opens the rest
  t.append(el('b', '', ph.date.replace(/-01-01$/, '')), ' · ' + (ph.title || '').slice(0, 60));
  l.title = ph.licence || ''; l.append(licShort(ph) + ' · ', a('Smapshot', ph.link), el('span', 'pc-short', ' · ' + short + ' · '));
  const more = el('button', 'n-more', 'Details'); more.type = 'button'; more.onclick = () => cap.classList.toggle('open'); l.append(more);
  const full = el('span', 'pc-full'); full.append('Photo: ETH Library, via ', a('Smapshot', ph.link), ' (HEIG-VD); camera position worked out by volunteers. 3D side: ' + `${model ? (dem && (ph.year === dem.old.year || ph.year === dem.new.year) ? `the measured surface of ${ph.year}` : dem ? `the ice surface for ${ph.year}, an estimate between the measured surfaces of ${dem.old.year} and ${dem.new.year}` : 'the latest elevation model') : latest && latest.estimate ? `the latest surface, the estimate for ${latest.year} (after the last measured surface of ${dem.new.year}); the older ice is not reconstructed` : `the latest measured surface${dem ? ' (' + dem.new.year + ')' : ''}; the older ice is not reconstructed`}` + '. ' + how); l.append(full);
  x.type = 'button'; x.onclick = () => leavePhoto();
  if (photoOn && photoOn.rod) {            // the rod can be switched off (the choice is remembered)
    const r = el('button', '', photoOn.rodOn ? 'Hide ice level' : 'Show ice level'); r.type = 'button';
    r.onclick = () => { if (!photoOn) return; photoOn.rodOn = !photoOn.rodOn; prefs.photoRod = photoOn.rodOn; savePrefs(); r.textContent = photoOn.rodOn ? 'Hide ice level' : 'Show ice level'; pinLoop(); };
    btns.append(r);
  }
  btns.append(x); cap.append(t, l, btns); cap.hidden = false;
}
async function enterPhoto(i){
  const c = v3dCtx, viewer = v3d; if (!c || !viewer || !c.photos || v3dBusy || document.body.classList.contains('pane-open')) return;
  if (photoOn && photoOn.i === i) return leavePhoto();
  const ph = c.photos[i], run = ++photoRun, im = $('v3dPhoto');
  photoOn = {i, ph, lay: null, rod: null, rodOn: prefs.photoRod !== false}; $('v3d').classList.add('photo-on'); $('v3dPhotos').querySelectorAll('.ph').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  hideDivider3D(); viewer.setSplit(-1, false); im.hidden = true; $('v3dPhotoCap').hidden = true; pinLoop(); viewer.setExag(1);
  const model = ph.year >= 2016, newest = Math.max(...okYears()), latest = {year: c.dem && newest > c.dem.new.year ? newest : (c.dem ? c.dem.new.year : null), estimate: !!c.dem && newest > c.dem.new.year};      // from 2016 on there is a precalculated surface (measured in 2017 and 2023, the estimate between): that year's is used; for an older photograph the latest one, whichever is newest (the last measured surface, or the estimate for a later year), and the rod marks the old ice level above it
  viewer.setHeights(model ? c.surface(ph.year) : latest.estimate ? c.surface(latest.year) : c.latest);
  const texYear = model ? ph.year : latest.year, texP = texYear && state.available[texYear] ? c.tex(texYear).catch(() => null) : Promise.resolve(null);      // the satellite picture of the year the surface stands for (the latest survey year for an older photograph); without one the picture stays
  const lay = photoLayout(ph); photoOn.lay = lay; im.src = ph.src;
  const loaded = new Promise(res => { im.onload = res; im.onerror = res; });
  await viewer.setPose(photoPose(ph, c.S, lay), 1500);
  await loaded; if (run !== photoRun || !photoOn) return;
  const ctr = !model && c.g.inv && c.g.inv.outline ? (rodSpot(c, viewer, lay) || tongueCentre(c.g, c.S)) : null, levelP = ctr ? iceLevel(c.g, ph.year, c, ctr).catch(e => { console.error(e); return null; }) : Promise.resolve(null);
  placePhoto(); im.hidden = false;
  texP.then(t => { if (t && run === photoRun && photoOn && v3d === viewer) viewer.setTexture(t, 0); });
  const d = $('v3dDiv'); d.classList.remove('hz'); d.classList.add('used'); d.hidden = false; $('v3d').classList.remove('cmp-h'); $('v3d').classList.add('cmp-v');
  $('v3dLabA').textContent = ph.date.slice(0, 4); $('v3dLabB').textContent = '3D today'; $('v3dLabA').hidden = $('v3dLabB').hidden = false; setSplit3D(0.5);
  const lvl = await levelP; if (run !== photoRun || !photoOn) return;
  const off = lvl && latest.estimate ? latestOffset(c.g, c, ctr, latest.year) : 0, rel = lvl && {...lvl, low: lvl.low - off, mid: lvl.mid - off, high: lvl.high - off};      // the estimate is against the last measured surface: against a later estimate the ice stood higher still
  if (rel && rel.mid >= 1) { photoOn.rod = {x: ctr.x, z: ctr.z, half: ctr.half, low: rel.low, mid: rel.mid, high: rel.high, text: rodText(ph, rel)}; pinLoop(); }
  photoCaption(ph, rel, model, c.dem, latest);
}
function leavePhoto(quick){
  if (!photoOn) return;
  const c = v3dCtx, viewer = v3d; photoOn = null; photoRun++; $('v3d').classList.remove('photo-on');
  $('v3dPhoto').hidden = true; $('v3dPhotoCap').hidden = true; hideDivider3D(); $('v3dPhotos').querySelectorAll('.ph.on').forEach(b => b.classList.remove('on'));
  if (viewer && c) {
    viewer.setPose(null, quick ? 0 : 1000); viewer.setExag(+$('v3dExag').value);      // back to the camera the visitor had
    if (c.cmp) { if (c.usesDem) viewer.setHeights(c.surface(c.cmp[0]), c.surface(c.cmp[1])); viewer.setSplit(v3dSplit, c.hz); showDivider3D(c.cmp, c.hz); c.cmp.forEach((y, k) => c.tex(y).then(t => { if (!photoOn && v3d === viewer) viewer.setTexture(t, k); }).catch(() => {})); }
    else { if (c.usesDem) viewer.setHeights(c.surface(c.current())); c.tex(c.current()).then(t => { if (!photoOn && v3d === viewer) viewer.setTexture(t, 0); }).catch(() => {}); }      // and the picture of the year in the panel
  }
  pinLoop();
}
addEventListener('resize', () => { if (photoOn && photoOn.lay && !$('v3dPhoto').hidden && v3d) { placePhoto(); v3d.setPose(photoPose(photoOn.ph, v3dCtx.S, photoOn.lay), 0); } });

function setView(v){            // the stage shows the map or the 3D view; the panel and the download pane stay the same
  if (v === viewMode) return;
  if (v === '3d' && !currentGlacier()) return showNotice('Choose a glacier first.');
  if (vstate.busy || v3dBusy) return;
  if (!$('videoSheet').hidden) closeVideo();
  viewMode = v; $('app').classList.toggle('is-3d', v === '3d'); syncSatUi(); writeHash();
  $('viewMap').setAttribute('aria-pressed', v === 'map'); $('view3dBtn').setAttribute('aria-pressed', v === '3d');
  setLayers(false); if (v === '3d') cancelMeasure(); else cancel3Measure();      // one measuring tool at a time
  if (v === '3d') { stopPlay(); open3D(); } else { close3D(); drawRadar(); loadDeferred(); }      // back on the map: its radar layer, if it was switched on or off meanwhile
}
$('viewMap').onclick = () => setView('map'); $('view3dBtn').onclick = () => setView('3d');
/* The layer menu of the 3D view: the same switches as on the map (an outline or the radar dots), drawn on the picture that covers the terrain */
const L3 = [['l3Osm', 'osmToggle'], ['l3Topo', 'topoToggle'], ['l3Alti', 'altiToggle'], ['l3Trails', 'trailsToggle'], ['l3Old', 'oldToggle'], ['l3New', 'newToggle'], ['l3Radar', 'radarToggle'], ['l3Pin', 'pinToggle'], ['l3Max', 'maxToggle']];
function sync3DMenu(){
  const g = currentGlacier(), R = g && g.inv && g.inv.radar;
  L3.forEach(([a, b]) => { $(a).checked = $(b).checked; $(a).disabled = b === 'radarToggle' ? !R : b === 'maxToggle' ? !(R && R.max_at) : $(b).disabled; });
  $('l3OldLabel').textContent = $('oldLabel').textContent; $('l3NewLabel').textContent = $('newLabel').textContent;
  $('l3TrailLegend').hidden = !$('trailsToggle').checked; $('l3SightLegend').hidden = !sightFor(g);
  $('l3RadarLegend').hidden = !$('radarToggle').checked;
  $('l3RadarNote').textContent = !R ? 'No radar measurements for this glacier.' : `Surveys ${R.years ? (R.years[0] === R.years[1] ? R.years[0] : R.years.join(' and ')) : ''}. The ice has thinned since. The 3D view shows only about ten pins, the thickest of each stretch of the glacier, to keep loading and moving fast. Hover a pin for the thickness, click to keep it.`;
  $('l3Names').checked = prefs.names3d === true;
  { const lc = $('v3dLc'); if (lc && v3dCtx) lc.textContent = layersCreditText(v3dCtx.g); const ls = $('v3dLcS'); if (ls && v3dCtx) ls.textContent = shortLayerNames(v3dCtx.g); }
  $('l3MaxNote').hidden = !$('maxToggle').checked || !!(R && R.max_at);
  $('l3Op').value = imgOpacity(); $('l3OpOut').textContent = `${Math.round(imgOpacity() * 100)} %`;
  if ($('vOutline')) $('vOutline').checked = $('oldToggle').checked && !$('vOutline').disabled;
  pinLoop();
}
/* The thickest ice measurement as a mark standing on the terrain: a ring that pulses on the ground, a stem and a head that bobs above it. It is placed in the scene (so it follows the camera, with perspective)
   and drawn in 2D over the picture, on screen and in the downloads with the same function. */
const PIN_LIFT = 160, NAME_KINDS = {Hauptgipfel: 3, 'Alpiner Gipfel': 3, Gipfel: 2, Pass: 1};
function stripXZ(S, mx, my){            // a place in Web Mercator -> the scene of the strip (x to the right, z away from the camera's start)
  const dx = (mx - S.P.x) / S.k, dy = (my - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue;
  return {x: b, z: -a, a, b, inside: Math.abs(b) <= V3D.HALF && a >= -S.back && a <= S.up};
}
function pinData(g, S){            // the place of the thickest radar ice in the strip: x, z of the scene and the text
  const R = g.inv && g.inv.radar; if (!R || !R.max_at) return null;
  const q = L.CRS.EPSG3857.project(L.latLng(R.max_at[0], R.max_at[1])), p = stripXZ(S, q.x, q.y); if (!p.inside) return null;
  return {x: p.x, z: p.z, text: `${R.max_m} m${R.max_year ? ` (${R.max_year})` : ''}`};
}
function tipData(g, S){            // the tip of the tongue
  const at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue; if (!at) return null;
  const q = L.CRS.EPSG3857.project(L.latLng(at[0], at[1])), p = stripXZ(S, q.x, q.y);
  return {x: p.x, z: p.z, text: 'Tongue'};
}
/* Names of peaks and passes from swisstopo (swissNAMES3D, the identify service of api3.geo.admin.ch, open data): only a few, the highest ones with some room between them */
const namesCache = new Map();
function namesFor(g, S){
  if (!namesCache.has(g.id)) {
    const {HALF} = V3D, cs = [[-S.back, -HALF], [-S.back, HALF], [S.up, -HALF], [S.up, HALF]].map(([a, b]) => S.merc(a, b)), env = [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))].join(',');
    const url = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' + new URLSearchParams({geometryType: 'esriGeometryEnvelope', geometry: env, imageDisplay: '1000,1000,96', mapExtent: env, tolerance: '0', layers: 'all:ch.swisstopo.swissnames3d', sr: '3857', returnGeometry: 'true', limit: '200', lang: 'en'});
    const pr = fetch(url).then(r => { if (!r.ok) throw new Error('swisstopo names ' + r.status); return r.json(); })
      .then(j => (j.results || []).filter(r => NAME_KINDS[r.attributes.objektart] && r.geometry && r.geometry.points && r.attributes.name).map(r => ({name: r.attributes.name, kind: r.attributes.objektart, m: r.geometry.points[0]})));
    pr.catch(() => namesCache.delete(g.id)); namesCache.set(g.id, pr);
  }
  return namesCache.get(g.id);
}
function pickNames(list, S, viewer, avoid){
  const seen = new Set(), c = list.map(n => ({...n, ...stripXZ(S, n.m[0], n.m[1])})).filter(n => n.inside && Math.abs(n.x) < V3D.HALF - 200 && n.a > -S.back + 150 && n.a < S.up - 200 && !seen.has(n.name) && seen.add(n.name))
    .map(n => ({...n, score: viewer.groundY(n.x, n.z) / Math.max(0.5, viewer.exag()) + NAME_KINDS[n.kind] * 120})).sort((a, b) => b.score - a.score), out = [];
  for (const n of c) { if (out.length >= 6) break; if ([...out, ...avoid].every(o => Math.hypot(o.x - n.x, o.z - n.z) > 750)) out.push({x: n.x, z: n.z, text: n.name}); }      // few and far apart
  return out;
}
function ensureNames(c){            // loads the names once for the open view; the promise lets an export wait for them
  if (c.namesP) return c.namesP;
  if (!$('l3Names').checked) return Promise.resolve();
  if (c.bundle) { c.names = c.bundle.names || []; return c.namesP = Promise.resolve(); }      // chosen when the file was made
  return c.namesP = (async () => {
    try { const list = await namesFor(c.g, c.S); if (c !== v3dCtx || !v3d) return; c.names = pickNames(list, c.S, v3d, [c.tip, c.pin].filter(Boolean)); }
    catch (e) { console.error(e); c.names = []; }
  })();
}
function markItems(c){
  const m = [];
  if ($('l3Names').checked && c.names) c.names.forEach(n => m.push({type: 'name', ...n}));
  if ($('pinToggle').checked && c.tip) m.push({type: 'tip', ...c.tip});
  if ($('maxToggle').checked && c.pin) m.push({type: 'max', ...c.pin});
  if (photoOn && photoOn.rod && photoOn.rodOn) m.push({type: 'rod', ...photoOn.rod});      // the ice level of an old photograph, estimated
  return m;
}
function projectMarks(c, viewer, W, H, cam, view){            // the marks in the pixels of a picture W x H: ground point g and head h; a name is left out when a ridge hides it
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
function drawMarks3D(ctx, list, t, u){            // t: seconds (the movement), u: size of one design pixel; names first, the pins over them
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
function drawRod3D(ctx, m, u){            // a slim rod on today's ice that fades up to the old ice level, a level line across the glacier at its top, and a card with the estimate
  const [gx, gy] = m.g, [hx, hy] = m.h, [x1, y1] = m.l, [x2, y2] = m.r, amber = '#F2A93B', box = photoOn && photoOn.lay, sc = box ? ctx.canvas.width / $('v3dCanvas').clientWidth : 1;
  ctx.save(); ctx.lineCap = 'round';
  const gr = ctx.createLinearGradient(gx, gy, hx, hy); gr.addColorStop(0, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,.95)');
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6 * u; ctx.strokeStyle = gr; ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.ellipse(gx, gy, 7 * u, 3 * u, 0, 0, 2 * Math.PI); ctx.stroke();      // a ring where the rod stands
  ctx.strokeStyle = amber; ctx.lineWidth = 3.4 * u; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();      // the old ice level, across the glacier
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.strokeStyle = amber; ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(hx, hy, 5.5 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.font = `600 ${14 * u}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const maxW = Math.min(300 * u, box ? box.w * sc - 28 * u : 300 * u), words = m.text.split(' '), lines = []; let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW - 24 * u && line) { lines.push(line); line = w; } else line = t; }); if (line) lines.push(line);
  const lh = 19 * u, cw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24 * u, ch = lines.length * lh + 14 * u;
  let cx = hx - cw / 2, cy = hy - 22 * u - ch;
  if (box) { cx = Math.min(Math.max(cx, box.x * sc + 4), (box.x + box.w) * sc - cw - 4); cy = Math.min(Math.max(cy, box.y * sc + 4), (box.y + box.h) * sc - ch - 4); } else cx = Math.max(4, cx);
  ctx.fillStyle = 'rgba(10,16,20,.8)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx, cy, cw, ch, 10 * u) : ctx.rect(cx, cy, cw, ch); ctx.fill();
  ctx.fillStyle = amber; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx + 7 * u, cy + 8 * u, 3 * u, ch - 16 * u, 1.5 * u) : ctx.rect(cx + 7 * u, cy + 8 * u, 3 * u, ch - 16 * u); ctx.fill();      // an amber bar at the left of the card
  ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, cx + 17 * u, cy + 7 * u + lh * (i + 0.5)));
  ctx.restore();
}
function drawPin3D(ctx, P, t, u, color){            // a ring that pulses on the ground, a stem and a head that bobs above it, with its label
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
const RADAR_LIFT = 55;
let radarHover = -1, radarSel = -1, radarHits = [];      // radarHits: the heads on screen (pixels of the overlay), for hovering and clicking
function relevantPins(list, S){            // about ten pins, not hundreds (loading and moving would be slow): the thickest radar point of each stretch of the strip, so they give a profile along the glacier
  const len = S.up + S.back, n = Math.max(6, Math.min(12, Math.round(len / 700))), best = new Array(n).fill(null);      // a short strip gets fewer, a long one more
  list.forEach(p => { const k = Math.min(n - 1, Math.max(0, Math.floor((-p.z + S.back) / len * n))); if (!best[k] || p.m > best[k].m) best[k] = p; });
  return best.filter(Boolean);
}
function radarPinsFor(c){            // the radar cells of the strip: place in the scene, thickness, year, other surveys
  if (c.bundle && !c.radarPins) { c.radarList = c.bundle.radar || []; return c.radarPins = Promise.resolve(c.radarList); }      // the pins are in the file
  if (!c.radarPins) c.radarPins = loadRadar().then(() => ((window.GLACIER_THICKNESS || {})[c.g.inv.id] || []).map(([lat, lng, m, y, all]) => {
    const q = L.CRS.EPSG3857.project(L.latLng(lat, lng)), S = c.S, dx = (q.x - S.P.x) / S.k, dy = (q.y - S.P.y) / S.k, a = dx * S.ue + dy * S.un, b = dx * S.un - dy * S.ue;
    return Math.abs(b) > V3D.HALF || a < -S.back || a > S.up ? null : {x: b, z: -a, m, y, all};
  }).filter(Boolean)).then(l => (c.radarList = relevantPins(l, c.S))).catch(() => (c.radarList = []));
  return c.radarPins;
}
function drawRadarPin(ctx, h, g, color, multi, u, state){            // state: 0 as it is, 1 under the pointer, 2 chosen
  const r = (state ? 6.5 : 4.4) * u;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3 * u;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], 3 * u, 1.3 * u, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(h[0], h[1] + r); ctx.stroke();
  ctx.fillStyle = color; ctx.strokeStyle = multi ? '#E0483F' : '#fff'; ctx.lineWidth = (state ? 2.4 : 1.6) * u; ctx.beginPath(); ctx.arc(h[0], h[1], r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  if (state) { ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(h[0], h[1], r + 4.5 * u, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.restore();
}
function drawRadarPins(ctx, c, viewer, W, H, cam, view, u, hover, sel){            // draws the pins that no ridge hides; returns their heads in pixels of the picture
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
function placeRadarTip(dpr){            // the text of the chosen pin, or of the one under the pointer, beside its head
  const tip = $('v3dTip'), i = radarSel >= 0 ? radarSel : radarHover, hit = i >= 0 ? radarHits.find(it => it.i === i) : null, c = v3dCtx;
  if (!hit || !c || !c.radarList || !c.radarList[i]) { tip.hidden = true; return; }
  const p = c.radarList[i]; if (tip.dataset.i !== String(i)) { tip.innerHTML = radarPopup(p.m, p.y, p.all); tip.dataset.i = i; }
  tip.hidden = false; const cw = $('v3dCanvas').clientWidth, x = hit.h[0] / dpr + 14, flip = x + tip.offsetWidth > cw - 8;
  tip.style.left = Math.max(6, flip ? hit.h[0] / dpr - 14 - tip.offsetWidth : x) + 'px'; tip.style.top = Math.max(6, hit.h[1] / dpr - tip.offsetHeight / 2) + 'px';
}
function bindRadarPicking(cv){            // hovering, clicking and tapping on the pins; a drag still turns the camera
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
let pinRun = 0;
const marksOn = () => photoOn ? !!(photoOn.rod && photoOn.rodOn) : $('pinToggle').checked || $('maxToggle').checked || $('l3Names').checked || !!(v3dCtx && radar3D(v3dCtx.g));
/* ---------- measuring in the 3D view: length of a line and area of a shape on the terrain (ground distances, as on the map) ----------
   A tap puts a point on the terrain (viewer.pick), the lines follow the ground and are drawn on the overlay with the other marks. Drags still turn the camera. */
const M3 = {mode: null, pts: [], shapes: [], gid: null};      // points are [x, z] of the strip scene, in ground metres
const measureOn3 = () => !!(M3.mode || M3.shapes.length);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const len3 = pts => pts.reduce((t, p, i) => i ? t + dist3(pts[i - 1], p) : 0, 0);
const area3 = pts => Math.abs(pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function update3Measure(){
  $('v3mDist').setAttribute('aria-pressed', M3.mode === 'dist'); $('v3mArea').setAttribute('aria-pressed', M3.mode === 'area');
  $('v3mClear').hidden = !M3.shapes.length && !M3.pts.length;
  $('v3dMHint').classList.toggle('show', !!M3.mode); $('v3d').classList.toggle('measuring', !!M3.mode);
  const el = $('v3dMText'), tap = COARSE ? 'Tap' : 'Click', n = M3.pts.length;
  if (!M3.mode) return;
  if (!n) el.textContent = M3.mode === 'dist' ? `${tap} the terrain to start a line.` : `${tap} the terrain to start an area.`;
  else if (M3.mode === 'dist') el.textContent = `Length ${fmtLen(len3(M3.pts))}.${COARSE ? '' : ' Double-click or press Finish.'}`;
  else el.textContent = n < 3 ? (COARSE ? 'Add 3 points.' : 'Add at least three points.') : `Area ${fmtArea(area3(M3.pts))}.${COARSE ? '' : ' Double-click or press Finish.'}`;
}
function start3Measure(mode){
  if (viewMode !== '3d' || !v3dCtx) return;
  if (M3.gid !== v3dCtx.g.id) { M3.shapes = []; M3.gid = v3dCtx.g.id; }
  M3.mode = mode; M3.pts = []; update3Measure(); pinLoop();
}
function cancel3Measure(){ M3.mode = null; M3.pts = []; update3Measure(); }
function finish3Measure(){
  const pts = M3.pts.filter((p, i) => i === 0 || dist3(p, M3.pts[i - 1]) > 3), mode = M3.mode;      // a double-click adds the same point twice
  if (pts.length < (mode === 'area' ? 3 : 2)) return cancel3Measure();
  M3.shapes.push({mode, pts}); M3.pts = []; update3Measure(); pinLoop();      // stay in the tool for the next shape
}
function clear3Measure(){ M3.mode = null; M3.pts = []; M3.shapes = []; update3Measure(); }
$('v3mDist').onclick = () => M3.mode === 'dist' ? cancel3Measure() : start3Measure('dist');
$('v3mArea').onclick = () => M3.mode === 'area' ? cancel3Measure() : start3Measure('area');
$('v3mClear').onclick = clear3Measure; $('v3mFinish').onclick = finish3Measure; $('v3mCancel').onclick = cancel3Measure;
let m3Down = null;
$('v3d').addEventListener('pointerdown', e => { m3Down = M3.mode && !(e.target.closest && e.target.closest('button, .layerbox, input, .v3d-div, .v3d-measure, .v3d-mhint, a')) ? {x: e.clientX, y: e.clientY, t: performance.now()} : null; });
$('v3d').addEventListener('pointerup', e => {
  const d0 = m3Down; m3Down = null; if (!d0 || !M3.mode || !v3d) return;
  if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 8 || performance.now() - d0.t > 600) return;      // a drag turns the camera, only a tap places a point
  const r = $('v3dCanvas').getBoundingClientRect(), p = v3d.pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  if (!p) return showNotice('Tap on the terrain, inside the picture.');
  M3.pts.push(p); update3Measure(); pinLoop();
});
$('v3d').addEventListener('dblclick', () => { if (M3.mode) finish3Measure(); });
function drawMeasure3D(ctx, viewer, w, h, u){            // the shapes on the terrain, over the picture
  const list = M3.shapes.map(sh => ({...sh, done: true})); if (M3.mode && M3.pts.length) list.push({mode: M3.mode, pts: M3.pts, done: false});
  if (!list.length) return;
  const col = getVar('--measure') || '#FFD84D', up = (x, z) => viewer.groundY(x, z) + 6;
  list.forEach(sh => {
    const ring = sh.mode === 'area' && sh.pts.length > 2 ? [...sh.pts, sh.pts[0]] : sh.pts, poly = [];
    ring.forEach((p, i) => { if (!i) return poly.push(p); const q = ring[i - 1], n = Math.max(1, Math.ceil(dist3(p, q) / 40)); for (let k = 1; k <= n; k++) poly.push([q[0] + (p[0] - q[0]) * k / n, q[1] + (p[1] - q[1]) * k / n]); });      // a leg is cut in short pieces: it follows the ground
    const P = viewer.projectAt(poly.map(([x, z]) => [x, up(x, z), z, true]), w, h, null, null);
    ctx.save(); ctx.lineWidth = 3 * u; ctx.strokeStyle = col; ctx.lineJoin = ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 4 * u;
    if (!sh.done) ctx.setLineDash([8 * u, 6 * u]);
    ctx.beginPath(); let pen = false; P.forEach(q => { if (!q || !q[2]) { pen = false; return; } pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; }); ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    const V = viewer.projectAt(sh.pts.map(([x, z]) => [x, up(x, z), z, true]), w, h, null, null);
    V.forEach(q => { if (!q || !q[2]) return; ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(q[0], q[1], 4.2 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); });
    if (sh.done) {            // the result on a small label at the middle of the shape
      const text = sh.mode === 'dist' ? fmtLen(len3(sh.pts)) : `${fmtArea(area3(sh.pts))}, perimeter ${fmtLen(len3([...sh.pts, sh.pts[0]]))}`;
      const mid = sh.mode === 'dist' ? poly[Math.floor(poly.length / 2)] : [sh.pts.reduce((t, p) => t + p[0], 0) / sh.pts.length, sh.pts.reduce((t, p) => t + p[1], 0) / sh.pts.length];
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
function pinLoop(){            // while the 3D view shows marks: draw them over the picture, again and again, so that they move
  const cv = $('v3dOver'), run = ++pinRun, clear = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); radarHits = []; $('v3dTip').hidden = true; };
  if (viewMode !== '3d' || (!marksOn() && !measureOn3()) || !v3dCtx || !v3d) return clear();
  ensureNames(v3dCtx); if (radar3D(v3dCtx.g) && !v3dCtx.radarList) radarPinsFor(v3dCtx);
  const tick = now => {
    if (run !== pinRun) return;
    const c = v3dCtx, viewer = v3d, kc = $('v3dCanvas'); if (!c || !viewer || viewMode !== '3d' || (!marksOn() && !measureOn3())) return clear();
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(kc.clientWidth * dpr), h = Math.round(kc.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, w, h);
    const u = Math.max(0.7, Math.min(1.4, h / 900));
    if (!v3dBusy) {
      if (radar3D(c.g)) { radarHits = drawRadarPins(ctx, c, viewer, w, h, null, null, u, radarHover, radarSel); placeRadarTip(w / kc.clientWidth); } else { radarHits = []; $('v3dTip').hidden = true; }
      drawMarks3D(ctx, projectMarks(c, viewer, w, h, null, null), now / 1000, u);
      if (!document.body.classList.contains('pane-open')) drawMeasure3D(ctx, viewer, w, h, u);      // measurements are not part of a download
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
let refresh3DTimer = null;
function refresh3D(){            // a layer was switched: make the pictures again, the terrain and the camera stay
  clearTimeout(refresh3DTimer);
  refresh3DTimer = setTimeout(async () => {
    const c = v3dCtx, viewer = v3d, run = v3dRun; if (!c || !viewer || v3dBusy) return;
    try {
      if (c.cmp) { const [a, b] = await Promise.all(c.cmp.map(y => c.tex(y))); if (run !== v3dRun) return; viewer.setTexture(a, 0); viewer.setTexture(b, 1); }
      else { const y = c.current(), t = await c.tex(y); if (run !== v3dRun || c.current() !== y) return; viewer.setTexture(t); }
    } catch (e) { console.error(e); }
    const lc = $('v3dLc'); if (lc) lc.textContent = layersCreditText(c.g); const ls = $('v3dLcS'); if (ls) ls.textContent = shortLayerNames(c.g);
    if (!$('videoSheet').hidden) update3DInfo();
  }, 80);
}
L3.forEach(([a, b]) => $(a).onchange = () => {
  $(b).checked = $(a).checked; $(b).dispatchEvent(new Event('change'));      // the map's own handlers keep the setting (and switch the other base maps off)
  if ($(a).checked && V3D_BASES[b] && imgOpacity() > 0.99) { prefs.imgOpacity = 0.5; savePrefs(); applyImgOpacity(); }      // a base map shows through the picture only when that is a little transparent
  sync3DMenu(); refresh3D();
});
$('l3Names').onchange = e => { prefs.names3d = e.target.checked; savePrefs(); sync3DMenu(); };      // 3D only: the map's own labels are pictures
$('l3Op').oninput = e => { prefs.imgOpacity = +e.target.value; savePrefs(); applyImgOpacity(); sync3DMenu(); refresh3D(); };      // the map's own handlers keep the setting
if (prefs.lb3Min === true || (prefs.lb3Min === undefined && matchMedia('(max-width:720px)').matches)) { $('v3dLayers').classList.add('min'); $('v3dLbToggle').setAttribute('aria-expanded', 'false'); }
$('v3dLbToggle').onclick = () => { const min = $('v3dLayers').classList.toggle('min'); prefs.lb3Min = min; savePrefs(); $('v3dLbToggle').setAttribute('aria-expanded', !min); };
$('v3dExag').oninput = e => { if (v3d) v3d.setExag(+e.target.value); $('v3dExagOut').textContent = `${(+e.target.value).toFixed(1)}×`; };
addEventListener('keydown', e => { if (e.key === 'Escape' && viewMode === '3d') { if (photoOn) leavePhoto(); else setView('map'); } });

/* ---- download of the 3D view: the picture as it is on screen, or a video in which the camera swings over the terrain (timelapse: the years follow one another, compare: the slider moves) ---- */
function draw3DLabels(ctx, W, H, S, L){
  const g = L.g;
  shade(ctx, W, H, S);
  ctx.textBaseline = 'alphabetic';
  const legend = [[L.outline, '#F2A93B', [14, 9], 'Glacier outline about 1850'], [L.outlineNew, getVar('--new'), [], 'Glacier outline 2023']].filter(r => r[0]).map(r => r.slice(1));      // the legend of the outlines, as in the map downloads
  drawTop(ctx, W, S, stillName(g), placeOf(g, '3D view'), L.hA ?? 1, legend, 0);
  const sa = L.cmp && state.available[L.cmp[0]], sb = L.cmp && state.available[L.cmp[1]], sc = !L.cmp && state.available[L.year];
  drawBottom(ctx, W, H, S, {
    credit: L.credit,
    date: L.cmp ? [`${fmtDM(sa.date)}  ·  ${fmtDM(sb.date)}`, '', ''] : [fmtDM(sc.date), ` · ${styleLine(state.style)}`, ` · Sentinel-2 · ${STYLE_NAME[state.style] || STYLE_NAME.natural}`],
    year: L.cmp ? (L.hz ? `${L.cmp[0]} top, ${L.cmp[1]} bottom` : `${L.cmp[0]} left, ${L.cmp[1]} right`) : String(L.year),
    tiles: L.facts && !L.cmp ? factTiles(g, L.year, L.facts.set, L.facts.base) : [],
    tl: L.years && L.years.length > 1 && !L.cmp ? { years: L.years, pos: Math.max(0, L.years.indexOf(L.year)) } : null
  });
}
/* A small solid logo in the top right corner of the 3D videos: white face, red sides. It turns and tilts a little with the camera, so it seems to sit in the same space as the terrain. */
let logoSide = null;
function drawLogo3D(ctx, W, H, S, cam, cam0){
  if (!logoImg) return;
  if (!logoSide) { const t = document.createElement('canvas'); t.width = 400; t.height = 380; const q = t.getContext('2d'); q.drawImage(logoImg, 0, 0, 400, 380); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#A82A23'; q.fillRect(0, 0, 400, 380); logoSide = t; }
  const h = Math.round(Math.min(W, H) * 0.09), w = h * 200 / 190, th = 0.35 + (cam.az - cam0.az) * 1.2, sx = Math.max(0.3, Math.abs(Math.cos(th))), dep = Math.sin(th) * h * 0.16, dy = h * 0.05 + (cam.el - cam0.el) * h * 0.8, N = 10;
  const cx = W - S.right - w / 2 - Math.abs(dep) / 2, cy = S.top + 8 + h / 2;
  ctx.save();
  for (let k = N; k >= 1; k--) { const f = k / N; ctx.save(); ctx.translate(cx + dep * f, cy + dy * f); ctx.scale(sx, 1); ctx.drawImage(logoSide, -w / 2, -h / 2, w, h); ctx.restore(); }
  ctx.translate(cx, cy); ctx.scale(sx, 1); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8; ctx.drawImage(logoImg, -w / 2, -h / 2, w, h);
  ctx.restore();
}
const credit3D = (c, yrs) => shortCredit(yrs, ['swisstopo', 'Mapterhorn', ...layerCreditNames(c.g)]);
function labels3D(c, facts){            // what the labels of the picture show now (the timelapse: the year on screen); facts: {set, base} or null
  const year = c.cmp ? null : c.current();
  return {g: c.g, cmp: c.cmp, hz: c.hz, year, outline: outline3D(c.g), outlineNew: outlineNew3D(c.g), facts, years: c.cmp ? null : vstate.kind === 'image' ? [] : c.years, credit: credit3D(c, c.cmp ? c.cmp.join(' and ') : vstate.kind !== 'image' && c.years.length > 1 ? `${c.years[0]}–${c.years[c.years.length - 1]}` : year)};
}
function drawPreview3D(){            // placeholder labels over the frame, drawn by the same function as the finished picture
  const cv = $('vfPreview'), c = v3dCtx, F = VIDEO.formats[vstate.fmt], W = F.w, H = F.h, q = 0.5;
  cv.width = Math.round(W * q); cv.height = Math.round(H * q);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!c) return;
  const S = marginsFor(vstate.kind, vstate.fmt), facts = !c.cmp && $('vFacts').checked ? {set: $('vFactSet').value, base: vstate.kind === 'image' || !c.years.length ? FIRST_YEAR : Math.min(...c.years)} : null;
  if (facts) loadFacts(c.g);
  ctx.save(); ctx.scale(q, q); draw3DLabels(ctx, W, H, S, labels3D(c, facts)); if (vstate.kind !== 'image') drawLogo3D(ctx, W, H, S, {az: 0, el: 0}, {az: 0, el: 0}); ctx.restore();
}
const info3D = (c, ys, outline) => {            // the facts the fact card of the map videos needs
  const lo = Math.min(...ys), hi = Math.max(...ys), inRange = VOLUME_LOSS.filter(n => n.y > lo && n.y <= hi);
  return {glacier: c.g, years: ys, scenes: ys.map(y => state.available[y]), outline, res: 10, style: state.style, compare: !!c.cmp, horiz: c.hz,
    lost: inRange.length ? Math.round((1 - inRange.reduce((q, n) => q * (1 - n.v / 100), 1)) * 100) : 0, site: (location.host + location.pathname).replace(/\/(index\.html)?$/, '')};
};
const plan3D = c => {            // seconds: the camera swing, then the fact card (no title slide)
  const tl = !c.cmp && c.years.length > 1, n = tl ? loopSeq(c.years.length).length : 0, per = perSec(n);
  const main = c.cmp ? swipeLength(per / 1.2) : tl ? n * per + VIDEO.hold : 8, tail = tailLength();
  return {per, tl, intro: 0, main, tail, total: main + tail};
};
let info3DBase = '';
function hint3D(){            // the line in the pane, and the note on the frame when the picture would look soft: the satellite pixels are 10 m, and this close each one covers many pixels of the download
  const c = v3dCtx, viewer = v3d, what = vstate.kind === 'image' ? 'picture' : 'video';
  let soft = false, canOut = false;
  if (c && viewer && !$('videoSheet').hidden) {
    const kc = $('v3dCanvas'), R = frameRect(), cam = viewer.getCam(), res = 2 * cam.dist * Math.tan(0.375) * (R.h / kc.clientHeight) / VIDEO.formats[vstate.fmt].h;      // metres of terrain per pixel of the download, at the point the camera looks at
    soft = res < 1.5; canOut = cam.dist < V3D.DIST[1] * 0.98;
  }
  $('videoFrameNote').textContent = soft && canOut ? `Zoom out for a sharper ${what}` : '';
  $('vsInfo').textContent = info3DBase + (soft ? ` Images have 10 m pixels: this close, the ${what} looks soft.` : '');
}
function update3DInfo(){            // the line in the download pane, the frame on the 3D view and the options that fit it
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
  hint3D();
  $('vsGuide').textContent = guideText();
  $('vFactsRow').style.display = c && c.cmp ? 'none' : '';      // the facts belong to a single year
  placeFrame(); drawPreview3D();
}
async function download3D(kind){
  const c = v3dCtx, viewer = v3d; if (!c || !viewer || v3dBusy) return;
  const run = v3dRun, fmt = vstate.fmt, F = VIDEO.formats[fmt], W = F.w, H = F.h, S = marginsFor(kind, fmt), g = c.g, msg = $('v3dMsg'), cv = $('v3dCanvas');
  const ok = () => run === v3dRun && viewer === v3d;
  const cw = cv.clientWidth, ch = cv.clientHeight, R = frameRect(), view = {a: cw / ch, sx: R.w / cw, sy: R.h / ch, cx: (R.x + R.w / 2 - cw / 2) / (cw / 2), cy: -(R.y + R.h / 2 - ch / 2) / (ch / 2)};      // the part of the screen inside the frame
  const sl = v3dSplit, shownSplit = Math.min(1, Math.max(0, c.hz ? (ch * sl - R.y) / R.h : (cw * sl - R.x) / R.w));      // where the slider sits inside the frame
  const out = document.createElement('canvas'); out.width = W; out.height = H; const ctx = out.getContext('2d');
  const buttons = [$('vsGo')], say = t => { msg.hidden = false; msg.textContent = t; progress(Math.min(1, +(t.match(/\d+(?= %)/) || [0])[0] / 100), t); };
  v3dBusy = true; stopPlay(); buttons.forEach(b => b.disabled = true);
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
        } else { draw3DLabels(ctx, W, H, S, {...labels3D(c, facts), year: c.cmp ? null : year, hA: easeIO(t / 0.5)}); drawLogo3D(ctx, W, H, S, camAt, cam0); }
        const vf = new VideoFrame(out, {timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps)});
        enc.encode(vf, {keyFrame: i % (fps * 2) === 0}); vf.close();
        while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
        if (i % 10 === 0) { say(`Creating video ${Math.round(100 * i / n)} %…`); await new Promise(r => setTimeout(r, 0)); }
      }
      await enc.flush(); enc.close(); if (encErr) throw encErr; if (!desc) throw new Error('the encoder did not report its H.264 settings');
      file = new File([muxMp4({width: W, height: H, fps, avcC: desc, samples: chunks})], `tonguesfromspace-${shortSlug(g.name)}-3d-${c.cmp ? 'slider' : tl ? 'timelapse' : 'orbit'}-${ys[0]}${ys.length > 1 ? '-' + ys[ys.length - 1] : ''}-${FMT_SUFFIX[fmt]}.mp4`, {type: 'video/mp4'});
    }
    if (!ok()) return;
    lastExport = {file, sig: exportSignature(), meta: {type: kind === 'image' ? 'still' : c.cmp ? 'slider' : 'timelapse', view: '3d', years, fmt, style: state.style, glacier: g.id, name: g.name}};
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

