/* Injected into the page by scripts/make_teaser.py while the teaser is recorded. Not part of the site.
   Draws what the film adds to the real page: captions, a cursor with click rings, a highlight ring, title and end cards.
   Everything is HTML in the page, so it uses the page's own font (Schibsted Grotesk) and is recorded with the rest. */
(() => {
  const go = () => {
  if (window.D) return;
  const css = `
  #dr{position:fixed;inset:0;z-index:99990;pointer-events:none;font-family:'Schibsted Grotesk',system-ui,sans-serif;color:#fff;overflow:hidden}
  #dr *{box-sizing:border-box}
  /* shades: short dark gradients instead of boxes, like the downloads of the site */
  #dr .shade-b{position:absolute;left:0;right:0;bottom:0;height:46%;background:linear-gradient(to top,rgba(6,12,24,.78),rgba(6,12,24,.42) 45%,rgba(6,12,24,0));opacity:0;transition:opacity .6s}
  #dr .shade-t{position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(to bottom,rgba(6,12,24,.6),rgba(6,12,24,0));opacity:0;transition:opacity .6s}
  #dr .on{opacity:1!important}
  /* caption */
  #dr .cap,#dr .card,#dr .big{zoom:var(--z,1)}
  #dr .cap{position:absolute;left:var(--cx,72px);bottom:var(--cb,76px);max-width:min(var(--cw,1000px),86%)}
  #dr .cap .k{display:inline-flex;align-items:center;gap:12px;font-size:25px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#fff;opacity:0;transform:translateY(12px);transition:opacity .5s .05s,transform .6s .05s cubic-bezier(.2,.8,.2,1)}
  #dr .cap .k:before{content:"";width:46px;height:5px;border-radius:3px;background:#E4453B}
  #dr .cap .h{margin-top:12px;font-size:76px;line-height:1.02;font-weight:800;letter-spacing:-.022em;text-shadow:0 2px 24px rgba(0,0,0,.45)}
  #dr .cap .h span{display:inline-block;opacity:0;transform:translateY(26px);transition:opacity .6s,transform .8s cubic-bezier(.2,.8,.2,1)}
  #dr .cap .s{margin-top:16px;font-size:30px;line-height:1.3;font-weight:500;color:rgba(255,255,255,.92);text-shadow:0 1px 14px rgba(0,0,0,.5);opacity:0;transform:translateY(14px);transition:opacity .6s .35s,transform .7s .35s cubic-bezier(.2,.8,.2,1)}
  #dr .cap.in .k,#dr .cap.in .s{opacity:1;transform:none}
  #dr .cap.in .h span{opacity:1;transform:none}
  #dr .cap.out .k,#dr .cap.out .s,#dr .cap.out .h span{opacity:0;transform:translateY(-10px);transition:opacity .35s,transform .45s}
  #dr .cap.right{left:auto;right:var(--cx,72px);text-align:right}
  #dr .cap.right .k{flex-direction:row-reverse}
  #dr .cap.top{bottom:auto;top:var(--ct,70px)}
  /* cursor */
  #dr .cur{position:absolute;left:0;top:0;width:44px;height:44px;margin:-6px 0 0 -6px;opacity:0;transition:opacity .3s,transform .12s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45));will-change:left,top}
  #dr .cur.show{opacity:1}
  #dr .cur.down{transform:scale(.86)}
  #dr .rip{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 2px rgba(200,50,42,.6);opacity:.95;animation:rip .7s ease-out forwards}
  @keyframes rip{to{transform:scale(4.4);opacity:0}}
  /* highlight ring around a control */
  #dr .ring{position:absolute;border-radius:14px;border:4px solid #E4453B;box-shadow:0 0 0 6px rgba(228,69,59,.28),0 0 30px rgba(228,69,59,.5);opacity:0;transition:opacity .3s}
  #dr .ring.on{opacity:1;animation:pulse 1.1s ease-in-out infinite}
  @keyframes pulse{50%{box-shadow:0 0 0 14px rgba(228,69,59,.08),0 0 38px rgba(228,69,59,.5)}}
  /* cards (title, end) */
  #dr .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0;transition:opacity .7s}
  #dr .card.on{opacity:1}
  #dr .card .logo{width:132px;height:auto;margin-bottom:26px;opacity:0;transform:scale(.9);transition:opacity .8s .1s,transform 1.1s .1s cubic-bezier(.2,.8,.2,1)}
  #dr .card.on .logo{opacity:1;transform:none}
  #dr .card .t1{font-size:112px;font-weight:800;letter-spacing:-.03em;line-height:1}
  #dr .card .t2{font-size:112px;font-weight:800;letter-spacing:-.03em;line-height:1.02;color:#FF6A5E}
  #dr .card .sub{margin-top:26px;font-size:34px;font-weight:500;color:rgba(255,255,255,.94);max-width:1100px;line-height:1.3}
  #dr .card .url{margin-top:34px;display:inline-flex;gap:14px;align-items:center;font-size:30px;font-weight:700;padding:16px 34px;border-radius:999px;background:#C8322A;color:#fff;box-shadow:0 10px 40px rgba(200,50,42,.5)}
  #dr .card .t1,#dr .card .t2,#dr .card .sub,#dr .card .url{opacity:0;transform:translateY(22px);transition:opacity .7s,transform .9s cubic-bezier(.2,.8,.2,1)}
  #dr .card.on .t1{opacity:1;transform:none;transition-delay:.2s}
  #dr .card.on .t2{opacity:1;transform:none;transition-delay:.34s}
  #dr .card.on .sub{opacity:1;transform:none;transition-delay:.6s}
  #dr .card.on .url{opacity:1;transform:none;transition-delay:.9s}
  #dr .card.veil{background:radial-gradient(ellipse at 50% 55%,rgba(8,16,32,.55),rgba(5,10,20,.88))}
  #dr .card.solid{background:#0A1322}
  /* stat numbers */
  #dr .big{position:absolute;opacity:0;transform:translateY(20px) scale(.98);transition:opacity .6s,transform .8s cubic-bezier(.2,.8,.2,1)}
  #dr .big.on{opacity:1;transform:none}
  #dr .big .n{font-size:190px;font-weight:800;letter-spacing:-.04em;line-height:.95;text-shadow:0 4px 40px rgba(0,0,0,.5);font-variant-numeric:tabular-nums}
  #dr .big .n small{font-size:.38em;font-weight:700;letter-spacing:0;margin-left:10px}
  #dr .big .l{margin-top:10px;font-size:32px;font-weight:600;color:rgba(255,255,255,.95);text-shadow:0 2px 16px rgba(0,0,0,.55)}
  #dr .fade{position:absolute;inset:0;background:#0A1322;opacity:0;transition:opacity .5s}
  #dr .fade.on{opacity:1}
  /* clean look for the film: only what the shot is about */
  body.cine .mapbar,body.cine .layerbox,body.cine .panel-toggle,body.cine .credits,body.cine .v3d-measure .v3d-photos .ph-note,body.cine .v3d-top .h-full,body.cine .v3d-top .h-short,body.cine .v3d-bottom,body.cine .handle-hint,body.cine .v3d-handle .hint,body.cine .notice,body.cine .pick-hint,body.cine .down-hint,body.cine .scroll-cue,body.cine .gesture-hint{display:none!important}
  body.cine .leaflet-control-attribution,body.cine .leaflet-control-zoom{display:none!important}
  body.cine .stage.is-full .full-exit{display:none!important}
  body.cine:not(.cine-photos) .v3d-measure{display:none!important}
  body.cine .v3d-measure>button:not(.ph-toggle){display:none!important}
  body.cine *{cursor:none!important}
  `;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  const root = document.createElement('div'); root.id = 'dr';
  root.innerHTML = '<div class="shade-t"></div><div class="shade-b"></div><div class="fade"></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const el = (cls, html = '', tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; root.appendChild(e); return e; };
  const D = window.D = {
    root,
    scale(z){ root.style.setProperty('--z', z); },      // the film is designed for 1920 x 1080; a page that is 1280 css px wide (drawn 1.5 times) uses 0.667
    cine(on = true){ document.body.classList.toggle('cine', on); },
    shade(b = true, t = false){ $('.shade-b').classList.toggle('on', b); $('.shade-t').classList.toggle('on', t); },
    /* caption: kicker (small, red bar), headline (words rise one by one), sub line; opts: {right, top, cx, cb, cw} */
    cap(k, h, s = '', o = {}){
      D.capOut(true);
      const c = el('cap' + (o.right ? ' right' : '') + (o.top ? ' top' : ''), `${k ? `<div class="k">${k}</div>` : ''}<div class="h">${h.split(' ').map((w, i) => `<span style="transition-delay:${0.15 + i * 0.08}s">${w}</span>`).join(' ')}</div>${s ? `<div class="s">${s}</div>` : ''}`);
      if (o.cx != null) c.style.setProperty('--cx', o.cx + 'px'); if (o.cb != null) c.style.setProperty('--cb', o.cb + 'px'); if (o.cw != null) c.style.setProperty('--cw', o.cw + 'px'); if (o.ct != null) c.style.setProperty('--ct', o.ct + 'px');
      c.dataset.cap = '1'; requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
      return c;
    },
    capOut(now){ root.querySelectorAll('.cap').forEach(c => { c.classList.remove('in'); c.classList.add('out'); setTimeout(() => c.remove(), now ? 0 : 600); if (now) c.remove(); }); },
    /* cursor: placed at (x, y) in pixels */
    cursor(x, y, show = true){
      let c = $('.cur'); if (!c) { c = el('cur', '<svg viewBox="0 0 44 44" width="44" height="44"><path d="M8 4l0 29 7.4-6.8 5 11.4 5.6-2.5-5-11.2 10-.6z" fill="#fff" stroke="#10213a" stroke-width="2.4" stroke-linejoin="round"/></svg>'); }
      c.style.left = x + 'px'; c.style.top = y + 'px'; c.classList.toggle('show', show);
    },
    down(on){ const c = $('.cur'); if (c) c.classList.toggle('down', on); },
    ripple(x, y){ const r = el('rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; setTimeout(() => r.remove(), 800); },
    ring(sel, pad = 8){
      D.unring(); const t = document.querySelector(sel); if (!t) return; const b = t.getBoundingClientRect(), r = el('ring');
      r.style.left = b.left - pad + 'px'; r.style.top = b.top - pad + 'px'; r.style.width = b.width + 2 * pad + 'px'; r.style.height = b.height + 2 * pad + 'px'; requestAnimationFrame(() => r.classList.add('on'));
    },
    unring(){ root.querySelectorAll('.ring').forEach(r => r.remove()); },
    card(cls, html){ D.uncard(true); const c = el('card ' + cls, html); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('on'))); return c; },
    uncard(now){ root.querySelectorAll('.card').forEach(c => { c.classList.remove('on'); if (now) c.remove(); else setTimeout(() => c.remove(), 800); }); },
    big(n, unit, label, x, y){ const b = el('big', `<div class="n">${n}<small>${unit}</small></div><div class="l">${label}</div>`); b.style.left = x + 'px'; b.style.top = y + 'px'; requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('on'))); return b; },
    unbig(){ root.querySelectorAll('.big').forEach(b => { b.classList.remove('on'); setTimeout(() => b.remove(), 700); }); },
    fade(on){ $('.fade').classList.toggle('on', on); },
    /* runs fn(u) for u from 0 to 1 over ms (eased); resolves at the end: the script waits for a camera move */
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
    notags(){ document.querySelectorAll('.year-tag').forEach(e => e.style.display = 'none'); },
    /* a slow push-in of an element (CSS scale on the compositor: smooth, and the map is not redrawn) */
    push(sel, to = 1.08, secs = 8){ const e = document.querySelector(sel); e.style.transition = `transform ${secs}s linear`; e.style.transformOrigin = '50% 55%'; requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transform = `scale(${to})`; })); },
    /* the map: the lower part of the glacier with its 1850 outline: tip at (fx, fy), zoom chosen so that the 1850 outline within r metres of the tip fits */
    frameLower(r = 3600, fx = 0.5, fy = 0.4){
      map.invalidateSize({pan: false}); const g = currentGlacier(), tip = L.latLng(g.inv.terminus.tip), o = g.inv.oldest && g.inv.oldest.outline, sz = map.getSize();
      const pts = []; (o ? o.coordinates : []).forEach(poly => poly[0].forEach(([x, y]) => { const q = L.latLng(y, x); if (q.distanceTo(tip) <= r) pts.push(q); }));
      let z = map.getZoom();
      if (pts.length) { const b = L.latLngBounds(pts); z = Math.min(15, map.getBoundsZoom(b, false, L.point(sz.x * 0.35, sz.y * 0.3))); }
      const t = map.project(tip, z); map.setView(map.unproject(L.point(t.x + (0.5 - fx) * sz.x, t.y + (0.5 - fy) * sz.y), z), z, {animate: false});
    },
    clear(){ root.querySelectorAll('.cap,.card,.big,.ring,.rip').forEach(e => e.remove()); D.shade(false, false); }
  };
  /* the cursor follows the real (scripted) mouse; a press makes a ring */
  addEventListener('pointermove', e => { if (D.follow) D.cursor(e.clientX, e.clientY); }, true);
  addEventListener('pointerdown', e => { if (D.follow) { D.down(true); D.ripple(e.clientX, e.clientY); } }, true);
  addEventListener('pointerup', () => D.down(false), true);
  };
  if (document.body) go(); else addEventListener('DOMContentLoaded', go);
})();
