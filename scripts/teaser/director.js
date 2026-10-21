/* Injected into the page by scripts/make_teaser.py while the teaser is recorded. Not part of the site.
   Draws what the film adds to the real page: a caption card, a cursor with click rings and an end card.
   It borrows the look of the site itself: white sheets with a thin rule, grey capital step labels with a red number ("01 TIMELAPSE"),
   ink-blue headlines in Schibsted Grotesk, the red accent #C8322A, square corners. Sizes are css px of the 1280 x 720 page (drawn 1.5 times in the film). */
(() => {
  const go = () => {
  if (window.D) return;
  const css = `
  #dr{position:fixed;inset:0;z-index:99990;pointer-events:none;font-family:'Schibsted Grotesk','Helvetica Neue',Arial,sans-serif;color:#0E1A22;overflow:hidden}
  #dr *{box-sizing:border-box}
  /* caption: a sheet like the panels of the site */
  #dr .cap{position:absolute;bottom:var(--cb,30px);right:var(--cr,24px);width:var(--cw,255px);background:#fff;border:1px solid #DDE3E6;box-shadow:0 2px 12px rgba(0,0,0,.22);padding:13px 16px 14px;opacity:0;transform:translateY(8px);transition:opacity .4s,transform .5s cubic-bezier(.2,.8,.2,1)}
  #dr .cap.in{opacity:1;transform:none}
  #dr .cap.out{opacity:0;transform:translateY(6px);transition:opacity .3s,transform .35s}
  #dr .cap .k{display:flex;align-items:center;gap:10px;font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#C8322A}
  #dr .cap .k .num{color:#C8322A;font-weight:700;font-variant-numeric:tabular-nums}
  #dr .cap .h{margin-top:6px;font-size:21px;line-height:1.15;font-weight:600;letter-spacing:-.01em;color:#0A1B33}
  #dr .cap .s{margin-top:5px;font-size:13.5px;line-height:1.4;font-weight:400;color:#66757E}
  /* cursor */
  #dr .cur{position:absolute;left:0;top:0;width:22px;height:22px;margin:-2px 0 0 -2px;opacity:0;transition:opacity .3s,transform .12s;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45));will-change:left,top}
  #dr .cur.show{opacity:1}
  #dr .cur.down{transform:scale(.88)}
  #dr .rip{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(14,26,34,.35);opacity:.95;animation:rip .6s ease-out forwards}
  @keyframes rip{to{transform:scale(3.2);opacity:0}}
  /* end card: no sheet, white text straight on the darkened page, the header of the site large; it drifts up slowly while it is on */
  #dr .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at 50% 50%,rgba(4,9,16,.74),rgba(3,6,12,.9));opacity:0;transition:opacity .9s}
  #dr .card.on{opacity:1}
  #dr .card .in{display:flex;flex-direction:column;align-items:center;animation:drift 6s linear forwards}
  @keyframes drift{from{transform:translateY(14px) scale(.98)}to{transform:translateY(-10px) scale(1.03)}}
  #dr .card .brand{display:flex;align-items:center;justify-content:center;gap:28px;text-align:left}
  #dr .card .brand img{width:132px;height:auto;display:block}
  #dr .card .t1{font-size:64px;font-weight:600;letter-spacing:-.015em;line-height:1.05;color:#fff;white-space:nowrap}
  #dr .card .t2{font-size:64px;font-weight:600;letter-spacing:-.015em;line-height:1.05;color:#E5443B}
  #dr .card .sub{margin:34px 0 0;font-size:23px;line-height:1.4;color:rgba(255,255,255,.94);max-width:760px}
  #dr .card .src{margin:10px 0 0;font-size:16.5px;color:rgba(255,255,255,.66);letter-spacing:.02em}
  #dr .card .url{margin-top:30px;padding-bottom:6px;border-bottom:2px solid #E5443B;color:#fff;font-size:26px;font-weight:600;letter-spacing:.01em}
  #dr .card .brand,#dr .card .sub,#dr .card .src,#dr .card .url{opacity:0;transform:translateY(12px);transition:opacity .9s,transform 1.1s cubic-bezier(.2,.8,.2,1)}
  #dr .card.on .brand{opacity:1;transform:none;transition-delay:.15s}
  #dr .card.on .sub{opacity:1;transform:none;transition-delay:.6s}
  #dr .card.on .src{opacity:1;transform:none;transition-delay:.9s}
  #dr .card.on .url{opacity:1;transform:none;transition-delay:1.3s}
  /* clean look for the film: the real page, without the small print and hints */
  body.cine .credits,body.cine .leaflet-control-attribution,body.cine .leaflet-control-zoom,body.cine .leaflet-control-scale,body.cine .notice,body.cine .pick-hint,body.cine .down-hint,body.cine .scroll-cue,body.cine .gesture-hint,body.cine .handle-hint,body.cine .v3d-handle .hint,body.cine .gframe,body.cine .frame-label,body.cine .teaser-btn,body.cine .v3d-top .h-full,body.cine .v3d-top .h-short{display:none!important}
  body.cine *{cursor:none!important}
  `;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  const root = document.createElement('div'); root.id = 'dr';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const el = (cls, html = '', tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; root.appendChild(e); return e; };
  const D = window.D = {
    root,
    scale(){},      // the film layer is drawn in css px of the page: nothing to scale
    cine(on = true){
      document.body.classList.toggle('cine', on);
      const b = document.getElementById('boxToggle');      // the white edge of the picture box is not part of the film
      if (on && b && b.checked) { b.checked = false; b.dispatchEvent(new Event('change')); }
    },
    /* caption: label in red capitals (an optional step number before it), headline, sub line; was: step number, label, headline, sub line; opts {cr (px from the right), cb (px from the bottom) or top (px from the top), cw (width), left (px from the left, instead of cr)} */
    cap(num, label, h, s = '', o = {}){
      D.capOut(true);
      const c = el('cap', `<div class="k">${num ? `<span class="num">${num}</span>` : ''}<span>${label}</span></div><div class="h">${h}</div>${s ? `<div class="s">${s}</div>` : ''}`);
      if (o.cr != null) c.style.setProperty('--cr', o.cr + 'px'); if (o.cb != null) c.style.setProperty('--cb', o.cb + 'px'); if (o.cw != null) c.style.setProperty('--cw', o.cw + 'px');
      if (o.top != null) { c.style.top = o.top + 'px'; c.style.bottom = 'auto'; }
      if (o.left != null) { c.style.left = o.left + 'px'; c.style.right = 'auto'; }
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
      return c;
    },
    capOut(now){ root.querySelectorAll('.cap').forEach(c => { c.classList.remove('in'); c.classList.add('out'); if (now) c.remove(); else setTimeout(() => c.remove(), 500); }); },
    /* cursor: placed at (x, y) in pixels */
    cursor(x, y, show = true){
      let c = $('.cur'); if (!c) { c = el('cur', '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M4 2l0 15 3.8-3.5 2.6 5.9 2.9-1.3-2.6-5.8 5.2-.3z" fill="#fff" stroke="#0E1A22" stroke-width="1.3" stroke-linejoin="round"/></svg>'); }
      c.style.left = x + 'px'; c.style.top = y + 'px'; c.classList.toggle('show', show);
    },
    down(on){ const c = $('.cur'); if (c) c.classList.toggle('down', on); },
    ripple(x, y){ const r = el('rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; setTimeout(() => r.remove(), 700); },
    /* end card: the logo and name of the site as in the left panel, a line, the address */
    card(sub, url){
      D.uncard(true);
      const c = el('card', `<div class="in"><div class="brand"><img src="logo/tongues-from-space-logo-plain-white.svg" alt=""><div><div class="t1">Tongues from Space</div><div class="t2">Switzerland</div></div></div><p class="sub">${sub}</p><div class="url">${url}</div></div>`);
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('on'))); return c;
    },
    uncard(now){ root.querySelectorAll('.card').forEach(c => { c.classList.remove('on'); if (now) c.remove(); else setTimeout(() => c.remove(), 700); }); },
    /* a slow push-in of an element (CSS scale on the compositor: smooth, and the map is not redrawn) */
    push(sel, to = 1.08, secs = 8){ const e = document.querySelector(sel); e.style.transition = `transform ${secs}s linear`; e.style.transformOrigin = '50% 55%'; requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transform = `scale(${to})`; })); },
    /* runs fn(u) for u from 0 to 1 over ms; resolves at the end: the script waits for a camera move */
    tween(ms, fn, ease = true){ return new Promise(res => { const t0 = performance.now(); const tick = now => { const u = Math.min(1, (now - t0) / ms); fn(ease ? u * u * (3 - 2 * u) : u); if (u < 1) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); }); },
    /* the map: the tongue tip at (fx, fy) of the screen, dz zoom levels closer than the start view, kept inside the picture box of the glacier so that its edge does not show */
    frameTongue(dz = 0, fx = 0.5, fy = 0.5, animate = false){
      map.invalidateSize({pan: false}); focusTongue(false);
      const g = currentGlacier(), z = map.getZoom() + dz, sz = map.getSize(), tip = map.project(L.latLng(g.inv.terminus.tip), z);
      let c = L.point(tip.x + (0.5 - fx) * sz.x, tip.y + (0.5 - fy) * sz.y);
      const a = map.project(L.latLng(g.bounds[0]), z), b = map.project(L.latLng(g.bounds[1]), z), x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      c.x = x1 - x0 >= sz.x ? Math.min(x1 - sz.x / 2, Math.max(x0 + sz.x / 2, c.x)) : (x0 + x1) / 2;
      c.y = y1 - y0 >= sz.y ? Math.min(y1 - sz.y / 2, Math.max(y0 + sz.y / 2, c.y)) : (y0 + y1) / 2;
      map.setView(map.unproject(c, z), z, {animate});
    },
    /* the map: the lower part of the glacier with its 1850 outline: tip at (fx, fy), zoom chosen so that the 1850 outline within r metres of the tip fits */
    frameLower(r = 3600, fx = 0.5, fy = 0.4){
      map.invalidateSize({pan: false}); const g = currentGlacier(), tip = L.latLng(g.inv.terminus.tip), o = g.inv.oldest && g.inv.oldest.outline, sz = map.getSize();
      const pts = []; (o ? o.coordinates : []).forEach(poly => poly[0].forEach(([x, y]) => { const q = L.latLng(y, x); if (q.distanceTo(tip) <= r) pts.push(q); }));
      let z = map.getZoom();
      if (pts.length) { const b = L.latLngBounds(pts); z = Math.min(15, map.getBoundsZoom(b, false, L.point(sz.x * 0.35, sz.y * 0.3))); }
      const t = map.project(tip, z); map.setView(map.unproject(L.point(t.x + (0.5 - fx) * sz.x, t.y + (0.5 - fy) * sz.y), z), z, {animate: false});
    },
    /* pans the map so that the tongue tip is at (fx, fy) of the screen, whatever the zoom and the size of the map are now */
    tipAt(fx = 0.5, fy = 0.6){
      map.invalidateSize({pan: false}); const g = currentGlacier(), sz = map.getSize(), pt = map.latLngToContainerPoint(L.latLng(g.inv.terminus.tip));
      map.panBy([pt.x - fx * sz.x, pt.y - fy * sz.y], {animate: false});
    },
    /* the download pane: pans the map so that the tongue tip is at (fx, fy) of the frame that the picture or video is cut from */
    tipInFrame(fx = 0.5, fy = 0.62){
      const f = document.getElementById('videoFrame').getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect(), g = currentGlacier(), pt = map.latLngToContainerPoint(L.latLng(g.inv.terminus.tip));
      map.panBy([pt.x + m.left - (f.left + fx * f.width), pt.y + m.top - (f.top + fy * f.height)], {animate: false});
    },
    clear(){ root.querySelectorAll('.cap,.card,.rip').forEach(e => e.remove()); }
  };
  /* the cursor follows the real (scripted) mouse; a press makes a ring */
  addEventListener('pointermove', e => { if (D.follow) D.cursor(e.clientX, e.clientY); }, true);
  addEventListener('pointerdown', e => { if (D.follow) { D.down(true); D.ripple(e.clientX, e.clientY); } }, true);
  addEventListener('pointerup', () => D.down(false), true);
  };
  if (document.body) go(); else addEventListener('DOMContentLoaded', go);
})();
