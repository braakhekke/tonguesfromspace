/* The 3D renderer of the explorer and of the landing page's hero: WebGL, the shaders, the camera. It knows nothing of the page (no DOM ids, no state): the caller gives it a canvas,
   the heights of the strip and the picture to drape. js/11-view3d.js imports it (and re-exports what other files use); home-hero.js uses it alone. */
export const V3D = {HALF: 2000, BACK: 1000, UP: [2500, 6500], CELL: [14, 28], TEX: [1024, 2048], Z: 13, EL: [0.02, 1.35], DIST: [600, 11000], AZ: 1.3, WM: 20037508.342789244};      // HALF: half width (m); BACK: strip below the tip (m); UP: shortest and longest strip up the glacier (m); CELL: grid spacing (m), the fine one needs 32-bit indices (about 150,000 points), the coarse one is the fallback; TEX: texture width and height; Z: tile zoom; EL / DIST / AZ: tilt, distance and turn limits

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
uniform sampler2D uMask; uniform vec2 uSz; uniform float uBuild, uMesh; uniform vec2 uGrid; uniform sampler2D uTex; uniform sampler2D uTex2; uniform vec3 uSplit; uniform float uHz; varying vec2 vUV; varying vec3 vN; varying float vD, vH;
void main(){
  if (uCutN.z > 0.5) {      /* uCutN: the side (x, y) and how deep the cut reaches towards the camera (z, metres; 0 = no cut) */ HP vec2 cd = vXZ - uCutA; if (dot(cd, uCutU.xy) >= 0.0 && dot(cd, uCutU.xy) <= uCutU.z && dot(cd, uCutN.xy) > 0.0 && dot(cd, uCutN.xy) < uCutN.z) discard; }
  float pos = uHz > 0.5 ? uSplit.z - gl_FragCoord.y : gl_FragCoord.x, at = uSplit.x * (uHz > 0.5 ? uSplit.z : uSplit.y); bool right = uSplit.x >= 0.0 && pos > at;      /* stacked: first year on top, second below; else first on the left */ vec3 c = right ? texture2D(uTex2, vUV).rgb : texture2D(uTex, vUV).rgb; float lam = max(dot(normalize(vN), normalize(vec3(0.41, 0.57, 0.71))), 0.0);
  c *= clamp(0.72 + 0.6 * (lam - 0.57), 0.45, 1.15);      /* light from the south-east, like the satellite's morning sun, only a light touch because the picture has its own shadows */
  c = mix(vec3(0.043, 0.071, 0.125), c, smoothstep(1.0, 0.8, vD));
  if (uBuild < 0.999 && texture2D(uMask, vUV).r > 0.5) {      /* the tongue rebuilt: the surface ahead of the front is rough and smooths out behind it (see the vertex shader); a soft light edge marks the front */
    float ahead = clamp((0.9 - vUV.y) / 0.9, 0.0, 1.0) - (uBuild * 1.25 - 0.1);
    /* ahead of the front (the part of the tongue not rolled out yet, from the start of the flight on) the glacier is not shown: bare, shaded ground instead; the front rolls out from the tip up the glacier with the light flare below.
       The triangle edges and the see-through hatch that were drawn here before are gone (2026-11-02). */
    float hid = smoothstep(-0.02, 0.1, ahead);
    c = mix(c, vec3(0.30, 0.27, 0.24) * clamp(0.72 + 0.6 * (lam - 0.57), 0.45, 1.15), hid * 0.94);
    c += vec3(1.0) * (1.0 - smoothstep(0.0, 0.03, abs(ahead))) * 0.2;      /* a soft edge at the front */
  }
  if (uMesh > 0.001) {      /* the mesh of the flight from the map into 3D (the style of the plane tool of the back-cast: light blue lines, 55 % opaque, over a dimmed surface): the edges of every fourth cell and their diagonals, thinner and fainter where the cells are too small to see */
    vec2 gm = vUV * uGrid * 0.25, fm = fract(gm);
#ifdef GL_OES_standard_derivatives
    float wm = max(fwidth(gm.x), fwidth(gm.y));
#else
    float wm = 0.05;
#endif
    float em = min(min(min(fm.x, 1.0 - fm.x), min(fm.y, 1.0 - fm.y)), abs(fm.x + fm.y - 1.0) * 0.7071), ln = (1.0 - smoothstep(0.0, wm * 1.2 + 0.002, em)) * (1.0 - smoothstep(0.25, 0.5, wm));
    c = mix(c, c * 0.45, uMesh); c = mix(c, vec3(0.624, 0.816, 1.0), ln * 0.55 * uMesh);
  }
  if (uSplit.x >= 0.0 && abs(pos - at) < 1.5) c = vec3(1.0);      /* the line between the two years */
  gl_FragColor = vec4(c, 1.0); }`;
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
  const uB = gl.getUniformLocation(pr, 'uBuild'), uBV = gl.getUniformLocation(pr, 'uBuildV'), uMeshL = gl.getUniformLocation(pr, 'uMesh'), uGridL = gl.getUniformLocation(pr, 'uGrid'); let build = 1, mesh = 0;      // mesh: 0..1, the share of the mesh look (the flight from the map)      // build: 1 = the finished tongue, less = the tongue being rebuilt
  const uSplit = gl.getUniformLocation(pr, 'uSplit'), uHz = gl.getUniformLocation(pr, 'uHz'), uSplitV = gl.getUniformLocation(pr, 'uSplitV'), uHzV = gl.getUniformLocation(pr, 'uHzV'); let split = -1, hz = 0;      // share of the screen width where the second year starts; -1 = one year only
  const uM = gl.getUniformLocation(pr, 'uM'), uX = gl.getUniformLocation(pr, 'uX');
  const uCutA = gl.getUniformLocation(pr, 'uCutA'), uCutU = gl.getUniformLocation(pr, 'uCutU'), uCutN = gl.getUniformLocation(pr, 'uCutN'); let cut = null, cutKey = '', cutLive = false;      // cut: {ax, az, ux, uz, L}, the section line; the ground in front of it (the camera's side) is left out of the screen picture, never of a download
  gl.enable(gl.DEPTH_TEST); const uBoxL = gl.getUniformLocation(pr, 'uBox'); gl.uniform3f(uBoxL, HALF, len / 2, (BACK - up) / 2); gl.uniform2f(gl.getUniformLocation(pr, 'uSz'), 2 * HALF, len);      // half width, half length, z of the middle: the soft edge
  const cam = {az: 0, el: SC > 2 ? 0.55 : 0.35, dist: 3400 * distMul * SC * (SC > 2 ? 1.15 : 1), exag: 1, tx: 0, tz: 0}, [E0, E1] = V3D.EL, [D0, D1] = [V3D.DIST[0], V3D.DIST[1] * SC], A = Infinity;      // a wide area (Iceland) is seen from a little higher
  const cam0 = {az: cam.az, el: cam.el, dist: cam.dist, tx: 0, tz: 0};      // the camera the view opened with, for the reset button
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
    gl.uniformMatrix4fv(uM, false, viewM(w, h, view)); gl.uniform1f(uX, cam.exag); gl.uniform1f(uB, build); gl.uniform1f(uBV, build); gl.uniform1f(uMeshL, mesh); gl.uniform2f(uGridL, nB, nA); gl.uniform3f(uSplit, split, w, h); gl.uniform1f(uHz, hz); gl.uniform3f(uSplitV, split, w, h); gl.uniform1f(uHzV, hz);
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
    if (onDraw) onDraw();
  };
  const frame = (w, h, c, view) => {            // one picture of w x h with the camera c (az, el, dist; default: the one on screen); the canvas must be copied before the next await
    held = true; if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const keep = {...cam}; Object.assign(cam, c || {}); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az));
    paint(w, h, view); Object.assign(cam, keep); return canvas;
  };
  const projectAt = (pts, w, h, c, view) => {            // places in the scene [x, height, z] -> pixels of a picture w x h (null: behind the camera), the camera c (default: the one on screen)
    const keep = {...cam}; Object.assign(cam, c || {}); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az));
    const M = viewM(w, h, view), {eye} = rig(); Object.assign(cam, keep);
    const hidden = (x, y, z) => {      // a ridge between the camera and the place: the line of sight to the ground under the label (a name stands on its summit; if that is hidden, so is the name), dense along the line, the last stretch on the summit's own flank left out
      const ty = groundNow(x, z) + 8, dist = Math.hypot(x - eye[0], ty - eye[1], z - eye[2]), n = Math.min(500, Math.max(46, Math.round(dist / 25)));
      for (let k = 1; k < n; k++) { const t = k / n; if (t * dist < 150 || (1 - t) * dist < 70) continue; if (groundNow(eye[0] + (x - eye[0]) * t, eye[2] + (z - eye[2]) * t) > eye[1] + (ty - eye[1]) * t + 4) return true; }
      return false;
    };
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
  let onCam = null, onDraw = null;      // onCam: told when the visitor moves the camera; onDraw: after every picture (the north arrow follows the heading)
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
    const pan = (px, py) => {      // move the point the camera turns around over the ground
      const s = cam.dist * 0.0012, dx = px * s, dy = py * s, sa = Math.sin(cam.az), ca = Math.cos(cam.az);
      cam.tx = Math.min(HALF, Math.max(-HALF, cam.tx - dx * ca - dy * sa)); cam.tz = Math.min(BACK + 1200 * Math.min(SC, 2.5), Math.max(-up + 1200 * Math.min(SC, 2.5), cam.tz + dx * sa - dy * ca));
    };
    if (ptrs.size === 1 && ((e.buttons & 6) || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) pan(e.clientX - p[0], e.clientY - p[1]);      // Shift, Ctrl, Alt or Cmd + drag, or the right or middle mouse button
    else if (ptrs.size === 1) { cam.az -= (e.clientX - p[0]) * 0.006; cam.el += (e.clientY - p[1]) * 0.005; }
    else if (ptrs.size === 2) pan((e.clientX - p[0]) / 2, (e.clientY - p[1]) / 2);      // two fingers: the middle between them moves the view, the distance between them zooms
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist *= pinch / d; pinch = d; }
    clampCam();
  };
  canvas.oncontextmenu = e => e.preventDefault();      // the right mouse button pans
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
  return {setCut: c => { const k = c ? [c.ax, c.az, c.ux, c.uz, c.L].map(v => v.toFixed(2)).join() : ''; if (k === cutKey) return; cutKey = k; cut = c; redraw(); }, setSpace, setSocket, clearSocket: () => { socketArgs = null; setHeights(cur); }, setBuild: v => { build = v; redraw(); }, setMesh: v => { if (v === mesh) return; mesh = v; redraw(); }, setMask: c => { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.activeTexture(gl.TEXTURE0); redraw(); }, poseOf: c => { const keep = {...cam}; Object.assign(cam, c); cam.el = Math.min(E1, Math.max(E0, cam.el)); cam.dist = Math.min(D1, Math.max(D0, cam.dist)); cam.az = Math.min(A, Math.max(-A, cam.az)); const q = orbitPose(); Object.assign(cam, keep); return q; }, flyMix: (a, b, ep, eo) => { const dy = (((b.yaw - a.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, mp = (u, w) => u + (w - u) * ep, mo = (u, w) => u + (w - u) * eo; pose = {x: mp(a.x, b.x), y: mp(a.y, b.y), z: mp(a.z, b.z), yaw: a.yaw + dy * eo, pitch: mo(a.pitch, b.pitch), roll: 0, fovY: mo(a.fovY, b.fovY), view: null}; redraw(); }, endFlight: () => { pose = null; redraw(); }, setShift: (cx, cy) => { shift = {cx, cy}; redraw(); }, getShift: () => shift, setPose, hasPose: () => !!pose, zoomBy: f => { if (pose) return; cam.dist *= f; clampCam(); }, pick, setExag: v => { cam.exag = v; redraw(); }, getCam: () => ({az: cam.az, el: cam.el, dist: cam.dist, ...(cam.tx || cam.tz ? {tx: Math.round(cam.tx), tz: Math.round(cam.tz)} : {})}), setOnCam: f => { onCam = f; }, setOnDraw: f => { onDraw = f; }, getYaw: () => (pose || orbitPose()).yaw, projectAt, groundY: (x, z) => groundNow(x, z), elev: (x, z) => groundNow(x, z) / cam.exag + h0, groundIn, getEye: eyeOf, exag: () => cam.exag, setCam: c => { Object.assign(cam, {tx: 0, tz: 0}, c); clampCam(); },
    focusLine: (f, ms = 1000) => {            // fly the camera to a section line: looking straight at it (from the side the camera is on, as far as the turn is allowed), the whole line across the picture
      if (pose) return;
      const k = 1200 * Math.min(SC, 2.5), a1 = Math.atan2(f.nx, f.nz), wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), a2 = a1 + Math.PI, near = Math.abs(wrap(a1 - cam.az)) <= Math.abs(wrap(a2 - cam.az)) ? a1 : a2;
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight), th = 2 * Math.tan(0.375), to = {az: Math.min(A, Math.max(-A, wrap(near))), el: Math.min(E1, Math.max(E0, 0.3)), dist: Math.min(D1, Math.max(D0, Math.max(f.L * 1.25 / (th * aspect), f.relief * cam.exag * 1.9 / th))), tx: f.x, tz: f.z + k};
      flyCam(to, ms);
    },
    homeCam: () => ({...cam0}), flyCam: (c, ms = 1000) => flyCam({tx: 0, tz: 0, ...c}, ms), frame, hold, getSplit: () => ({split, hz}), setTexture, setSplit, setHeights, setIce, setBlock, destroy: () => { dead = true; ro.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onwheel = null;
    gl.deleteBuffer(vb); gl.deleteBuffer(ib); texs.forEach(t => gl.deleteTexture(t)); gl.deleteProgram(pr); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }};
}
