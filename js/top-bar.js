/* The top bar of the front page and the gallery, as a pull-down bar on the explorer and the size page (desktop with a mouse only; phones have the Menu pill in the title row).
   It comes down when the mouse moves up towards the top edge and slides away when the mouse leaves it. The links get their addresses from js/home-link.js (data-home, data-dash), so this file loads before it;
   the starry backdrop is the gallery's (js/space-bg.js). The region pill next to the name lists the regions of the page's own region menu (#regionMenu) and presses the real item, so the region switch stays in one place (js/08-controls.js). */
(() => {
  if (document.documentElement.classList.contains('embed')) return;
  if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  const size = /size(\.html)?$/.test(location.pathname);
  const bar = document.createElement('header');
  bar.className = 'bar tbar'; bar.setAttribute('aria-label', 'Pages of Tongues from Space');      // "bar nav": js/i18n.js puts the language button there, as on the front page
  bar.innerHTML = '<div class="wrap"><div class="tleft"><a class="brand" data-home href="home.html"><img src="images/home/logo-white.png" alt="" width="32" height="30"><b>Tongues from Space</b></a>'
    + '<div class="treg"><button type="button" class="treg-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Region"><svg class="pin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg><span class="treg-name">Switzerland</span><svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4"/></svg></button><ul class="treg-menu" role="listbox" aria-label="Region" hidden></ul></div></div>'
    + '<nav><a data-home href="home.html">Home</a><a data-dash href="index.html"' + (size ? '' : ' aria-current="page"') + '>Studio</a><a href="provenance.html">Field notes</a><a href="gallery.html">Gallery</a></nav></div>';
  const st = document.createElement('style');
  /* the same measures as the bar of the gallery and the front page (css/home.css ".bar"): 72 px high, 1180 px wide, 24 px at the sides */
  st.textContent = 'header.tbar{position:fixed;z-index:99990;left:0;right:0;top:0;display:block;font-size:16px;background:#0E1A22 center top/cover no-repeat;transform:translateY(-100%);transition:transform .16s ease;box-shadow:0 4px 18px rgba(0,0,0,.3);pointer-events:none}'
    + 'header.tbar.on{transform:none;pointer-events:auto}'
    + '.tbar .wrap{max-width:1180px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;height:72px}'
    + '.tbar .tleft{display:flex;align-items:center;gap:18px;min-width:0}'
    + '.tbar .brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff}.tbar .brand img{height:25px;width:auto}'
    + '.tbar .brand b{font-size:22px;line-height:30px;font-weight:700;letter-spacing:-.018em;white-space:nowrap}'
    + '.tbar nav{display:flex;gap:26px;align-items:center}.tbar nav>a{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:13px;font-weight:600;color:rgba(255,255,255,.82);text-decoration:none}'
    + '.tbar nav>a:hover{color:#fff}.tbar nav>a[aria-current]{color:#C8322A;font-weight:700}'      /* the page you are on: red */
    + '.treg{position:relative}'
    + '.treg-btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;cursor:pointer;padding:6px 11px 6px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.07);color:#fff;font:600 12.5px/1 "Schibsted Grotesk",system-ui,sans-serif;white-space:nowrap}'
    + '.treg-btn:hover,.treg-btn[aria-expanded="true"]{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.55)}.treg-btn:focus-visible{outline:2px solid #C8322A;outline-offset:2px}'
    + '.treg-btn .pin{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;opacity:.9}.treg-btn .chev{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}'
    + '.treg-btn[aria-expanded="true"] .chev{transform:rotate(180deg)}'
    + '.treg-menu{box-sizing:border-box;position:absolute;left:0;top:calc(100% + 10px);z-index:100002;margin:0;padding:4px;list-style:none;min-width:200px;background:#fff;color:#14222b;border-radius:11px;box-shadow:0 6px 22px rgba(0,0,0,.35)}.treg-menu[hidden]{display:none}'
    + '.treg-menu li{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}.treg-menu li:hover{background:rgba(20,34,43,.07)}'
    + '.treg-menu li.group{cursor:default;background:none;margin-top:3px;padding:8px 10px 3px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#6B7378}.treg-menu li.sub:not(.group){padding-left:20px}'
    + '.treg-menu li[aria-selected="true"]{background:rgba(200,50,42,.1);color:#C8322A;cursor:default}.treg-menu li[aria-disabled="true"]{color:#A9B1B5;cursor:default;font-weight:500;background:none}.treg-menu li small{font-size:11px;font-weight:500;color:#A9B1B5}'
    + '.tbar-tab{all:unset;box-sizing:border-box;position:fixed;z-index:99989;top:0;left:50%;width:54px;height:18px;margin-left:-27px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(14,26,34,.86);border-radius:0 0 11px 11px;box-shadow:0 2px 8px rgba(0,0,0,.28);color:#fff;opacity:.8;transition:opacity .15s,height .15s,transform .16s ease}'      /* the hint: a small tab hangs from the top edge and points down */
    + '.tbar-tab svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    + '.tbar-tab:hover,.tbar-tab:focus-visible{opacity:1;height:22px}.tbar-tab:focus-visible{outline:2px solid #C8322A;outline-offset:1px}'
    + 'html.tbar-on .tbar-tab{transform:translateY(-100%);pointer-events:none}'
    + '@keyframes tbar-nudge{0%,100%{transform:none}40%{transform:translateY(5px)}}.tbar-tab.nudge{animation:tbar-nudge .7s ease-in-out 1.2s 3}'      /* three small nods after the page has loaded, then still */
    + '@media (prefers-reduced-motion:reduce){.tbar-tab.nudge{animation:none}}'
    + '@media (max-width:720px){.tbar-tab{display:none}}'
    + 'html.tbar-on body{margin-top:72px!important;height:calc(100% - 72px)!important;transition:margin-top .16s ease,height .16s ease}'      /* the whole page moves down with the bar, nothing is covered */
    + '.video-sheet{transition:top .16s ease}html.tbar-on .video-sheet{top:72px}'      /* the fixed Create and share panel moves down with the bar, too */
    + '@media (max-width:720px){header.tbar{display:none}html.tbar-on .video-sheet{top:0}html.tbar-on body{margin-top:0!important;height:100%!important}}';
  const tab = document.createElement('button');
  tab.type = 'button'; tab.className = 'tbar-tab nudge'; tab.title = 'Menu'; tab.setAttribute('aria-label', 'Menu');
  tab.innerHTML = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5.5l4 4 4-4"/></svg>';
  tab.addEventListener('animationend', () => tab.classList.remove('nudge'));
  document.head.append(st); document.body.append(bar, tab);
  if (window.tfsSpace) window.tfsSpace.then(u => { bar.style.backgroundImage = u; });

  /* the region pill */
  const rb = bar.querySelector('.treg-btn'), rm = bar.querySelector('.treg-menu'), rname = bar.querySelector('.treg-name');
  const src = () => document.getElementById('regionMenu');
  const sync = () => { const n = document.querySelector('#regionBtn .region-name'); if (n && n.textContent.trim()) rname.textContent = n.textContent.trim(); };
  const regOpen = on => {
    if (on) {
      sync(); const s = src(), items = s ? [...s.children].filter(li => li.tagName === 'LI') : [];
      rm.innerHTML = items.map(li => li.classList.contains('group') ? `<li class="group" role="presentation">${li.innerHTML}</li>`
        : `<li role="option" data-id="${li.dataset.id}"${li.classList.contains('sub') ? ' class="sub"' : ''} aria-selected="${li.getAttribute('aria-selected') === 'true'}"${li.getAttribute('aria-disabled') === 'true' ? ' aria-disabled="true"' : ''}>${li.innerHTML}</li>`).join('');
    }
    rm.hidden = !on; rb.setAttribute('aria-expanded', String(on));
  };
  rb.addEventListener('click', e => { e.stopPropagation(); regOpen(rm.hidden); });
  rm.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li || li.classList.contains('group') || li.getAttribute('aria-disabled') === 'true') return;
    e.stopPropagation(); regOpen(false);
    const s = src(), real = s && [...s.querySelectorAll('li')].find(x => x.dataset.id === li.dataset.id); if (real) real.click();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.treg')) regOpen(false); });

  /* coming and going */
  let t = 0;
  let rz = 0;
  const lay = on => { document.documentElement.classList.toggle('tbar-on', on); clearTimeout(rz); rz = setTimeout(() => window.dispatchEvent(new Event('resize')), 200); };      /* maps and canvases measure again once the page has moved */
  const show = () => { clearTimeout(t); sync(); if (!bar.classList.contains('on')) { bar.classList.add('on'); lay(true); } };
  const hide = () => { clearTimeout(t); t = setTimeout(() => { if (!bar.contains(document.activeElement) && rm.hidden && !bar.querySelector('.lang-dd ul:not([hidden])')) { bar.classList.remove('on'); lay(false); } }, 250); };
  /* it comes down only when the mouse is in the last few mm of the top edge (12 px) */
  document.addEventListener('mousemove', e => {
    if (bar.contains(e.target)) { show(); return; }
    if (e.clientY <= 12) show(); else if (bar.classList.contains('on')) hide();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !rm.hidden) { regOpen(false); rb.focus(); } });
  tab.addEventListener('mouseenter', show); tab.addEventListener('click', show);
  bar.addEventListener('focusin', show); bar.addEventListener('focusout', hide);
  document.addEventListener('mouseleave', hide);
})();
