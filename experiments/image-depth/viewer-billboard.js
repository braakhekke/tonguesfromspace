/* 1. Goes into startViewer() in js/11-view3d.js, just before `const draw = () => {`. Needs these two more edits there:
   - at the end of paint(): `drawBillboard();` after the gl.drawElements(...) call;
   - in the object that startViewer returns: `setBillboard,` (and `getEyeDistance`). */
  /* The photograph as a plane in the scene ("image depth"): a quad that covers the photo's rectangle on screen, at the depth of a chosen distance in front of the camera. It is depth-tested like
     the terrain: terrain nearer than the plane covers the photograph, terrain behind it is hidden by it. */
  let bb = null, bbProg = null;
  const bbInit = () => {
    const mk = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const q = gl.createProgram(); gl.attachShader(q, mk(gl.VERTEX_SHADER, 'attribute vec2 aP; attribute vec2 aT; uniform float uZ; varying vec2 vT; void main(){ vT = aT; gl_Position = vec4(aP, uZ, 1.0); }'));
    gl.attachShader(q, mk(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D uImg; uniform float uA; varying vec2 vT; void main(){ gl_FragColor = vec4(texture2D(uImg, vT).rgb, uA); }')); gl.linkProgram(q);
    if (!gl.getProgramParameter(q, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(q));
    bbProg = {q, buf: gl.createBuffer(), tex: gl.createTexture(), aP: gl.getAttribLocation(q, 'aP'), aT: gl.getAttribLocation(q, 'aT'), uZ: gl.getUniformLocation(q, 'uZ'), uImg: gl.getUniformLocation(q, 'uImg'), uA: gl.getUniformLocation(q, 'uA')};
  };
  const drawBillboard = () => {
    if (!bb || !pose) return;
    const n = 10, f = 30000, zc = (f + n) / (n - f) * -bb.d + 2 * f * n / (n - f), [x0, y0, x1, y1] = bb.rect, P = bbProg;
    gl.useProgram(P.q); gl.bindBuffer(gl.ARRAY_BUFFER, P.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, 0, 1, x1, y0, 1, 1, x0, y1, 0, 0, x1, y1, 1, 0]), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(P.aP); gl.vertexAttribPointer(P.aP, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(P.aT); gl.vertexAttribPointer(P.aT, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, P.tex); gl.uniform1i(P.uImg, 2); gl.uniform1f(P.uZ, zc / bb.d); gl.uniform1f(P.uA, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(P.aP); gl.disableVertexAttribArray(P.aT); gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    [['aXZ', 2, 0], ['aH', 1, 2], ['aG', 2, 3], ['aUV', 2, 5], ['aH2', 1, 7], ['aG2', 2, 8]].forEach(([nm, size, off]) => { const l = gl.getAttribLocation(pr, nm); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 40, off * 4); });
  };
  const setBillboard = (img, rect, d) => {            // img: the loaded photograph (null: remove it), rect: its place on the screen in -1..1, d: distance in front of the camera (m)
    if (!img) { bb = null; redraw(); return; }
    if (!bbProg) bbInit();
    if (!bb || bb.img !== img) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bbProg.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    bb = {img, rect, d}; redraw();
  };
