/* 3. Goes into photoCaption() in js/11-view3d.js, before the rod button; at the end `if (cap.querySelector('.pc-depth')) cap.append(cap.querySelector('.pc-depth'));` moves the slider to its own row. Only for Aletsch (B36-26). */
  if (photoOn && v3dCtx && v3dCtx.g.inv && v3dCtx.g.inv.id === 'B36-26') {            // image depth: only for Aletsch so far
    const m = el('button', '', photoOn.depth ? 'Compare line' : 'Image depth'); m.type = 'button'; m.title = 'Place the photograph as a plane in the 3D scene: terrain nearer than the plane covers it';
    m.onclick = () => setDepthMode(!photoOn.depth); btns.append(m);
    if (photoOn.depth) {
      const w = el('label', 'pc-depth'), r = el('input'), o = el('output', '', ''); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.002; r.value = depthValue(photoOn.d); r.setAttribute('aria-label', 'Image depth');
      const say = () => { o.textContent = photoOn.d >= 1000 ? (photoOn.d / 1000).toFixed(1) + ' km' : Math.round(photoOn.d) + ' m'; }; say();
      r.oninput = () => { photoOn.d = depthOf(+r.value); say(); applyDepth(); };
      w.append('Image depth ', r, o); cap.append(w);
    }
  }
