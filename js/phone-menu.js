/* The phone menu: ONE menu for every page (front page, explorer, size page, gallery, field notes, game sheets). On phones the pill "Menu" opens a list with the same look and the same order everywhere:
   the pages (real links), the regions (pages that have a region menu: explorer, size page), the language (js/i18n.js adds its switch to every ".phone-menu").
   Rules that keep it tappable on an iPhone: every entry is a real <a> or <button> (no click handlers on bare <li>), each is at least 44 px high, the list is fixed under the pill and scrolls when the window is low (landscape),
   it closes on pointerdown outside (iOS sends no click for taps on plain page areas), and a tap on the page you are already on closes the list and goes to the top, so no tap ever looks dead.
   The pages' addresses come from the page's own links (the explorer's and the size page's links carry the chosen glacier; js/home-link.js sets the others), the regions are the page's own region menu: the items press the real ones. */
(() => {
  if (document.documentElement.classList.contains('embed')) return;
  const mhead = document.getElementById('mhead'), strong = mhead && mhead.querySelector('strong');
  const bar = document.querySelector('header.bar'), nav = bar && bar.querySelector('nav');
  if (!strong && !nav) return;
  const built = [...document.scripts].some(s => /home-link\.[0-9a-f]{10}\.js/.test(s.src));
  const sizePage = /size(\.html)?$/.test(location.pathname);
  /* when the menu replaces the page's own links: the explorer's phone layout (style.css) and the bar's phone layout */
  const PHONE = strong ? '(max-width:720px) and (orientation:portrait), (max-width:950px) and (orientation:landscape) and (max-height:520px)'
    : '(max-width:640px), (max-width:950px) and (orientation:landscape) and (max-height:520px)';
  const st = document.createElement('style');
  st.textContent = '.pm-btn,.phone-menu{display:none}'
    + '@media ' + PHONE + '{'
    + 'header.bar nav > a{display:none}header.bar .lang-dd{display:none}'      /* the language switch is in the list */
    + '.pm-btn{display:inline-flex;align-items:center;gap:6px;min-height:40px;margin:0 0 0 auto;padding:0 13px 0 16px;border:0;border-radius:999px;background:#F4F6F7;color:#1C2A33;font:600 14px/1 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:0;white-space:nowrap;cursor:pointer;position:relative;touch-action:manipulation;-webkit-tap-highlight-color:transparent}'
    + '.pm-btn.pm-dark{background:rgba(255,255,255,.14);color:#fff;margin:0}'
    + '.pm-btn::after{content:"";position:absolute;inset:-6px -8px}'      /* the tap area reaches past the pill */
    + '.pm-btn svg{width:14px;height:14px;min-width:0;max-width:14px;flex:none;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}'
    + '.pm-btn[aria-expanded="true"] svg{transform:rotate(180deg)}'
    + '.phone-menu{display:block;box-sizing:border-box;position:fixed;z-index:100000;right:12px;top:60px;margin:0;padding:6px;list-style:none;min-width:220px;max-width:calc(100vw - 24px);max-height:calc(100vh - 72px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#fff;color:#0A1B33;border:1px solid rgba(10,27,51,.12);border-radius:14px;box-shadow:0 8px 28px rgba(10,27,51,.24);text-align:left;font-family:"Schibsted Grotesk",system-ui,sans-serif}'
    + '.phone-menu[hidden]{display:none}'
    + '.phone-menu li{margin:0;padding:0}'
    + '.phone-menu .pm-i{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:9px;background:none;font:600 14.5px/1.2 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:0;color:#0A1B33;text-align:left;text-decoration:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}'
    + '.phone-menu .pm-i:active{background:rgba(10,27,51,.07)}'
    + '.phone-menu .pm-i:focus-visible{outline:2px solid #C8322A;outline-offset:-2px}'
    + '.phone-menu .pm-i[aria-current]{color:#C8322A}'
    + '.phone-menu .pm-i svg{width:15px;height:15px;min-width:0;max-width:15px;flex:none;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}'
    + '.phone-menu .pm-sub .pm-i{padding-left:26px}'
    + '.phone-menu .pm-off .pm-i{color:#A9B1B5;font-weight:500;cursor:default}.phone-menu .pm-off .pm-i:active{background:none}'
    + '.phone-menu .pm-i small{font-size:11px;font-weight:500;color:#A9B1B5}'
    + '.phone-menu li.group{margin-top:6px;padding:12px 12px 4px;border-top:1px solid rgba(10,27,51,.12);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#66757E}'
    + '.phone-menu li.group.pm-first{margin-top:0;border-top:0}'
    + '.phone-menu li.group.sub{margin-top:0;padding:8px 12px 2px;border-top:0;font-size:13px;letter-spacing:0;text-transform:none;color:#0A1B33}'
    + '.phone-menu .lang-li{padding:4px 6px 6px}.phone-menu .lang-li .lang-sw{margin:0;color:inherit}.phone-menu .lang-li .lang-sw a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;min-width:44px;box-sizing:border-box}'
    + '}';
  document.head.append(st);

  const btn = document.createElement('button'), ul = document.createElement('ul');
  btn.type = 'button'; btn.className = 'pm-btn' + (nav ? ' pm-dark' : ''); btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = '<span>Menu</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  ul.className = 'phone-menu'; ul.hidden = true; ul.setAttribute('aria-label', 'Menu');
  if (strong) strong.append(btn); else nav.prepend(btn);
  document.body.append(ul);

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  /* the pages: [key, label, how to recognise the page's own link, address if the page has no such link] */
  const PAGES = [['home', 'Home', /home(\.html)?$|^\/$|#top$/, built ? '/' : 'home.html'], ['studio', 'Studio', /index\.html|switzerland|^\/$/, built ? '/switzerland/' : 'index.html'],
    ['size', 'Size', /size(\.html)?([#?]|$)/, 'size.html'], ['notes', 'Field notes', /provenance/, 'provenance.html'], ['gallery', 'Gallery', /gallery/, 'gallery.html']]
    .map(p => built && !['home', 'studio'].includes(p[0]) ? [p[0], p[1], p[2], '/' + p[3]] : p);      // built: these pages sit at the root, the explorer in a folder (/switzerland/aletsch/)
  const pool = () => [...document.querySelectorAll('header.bar nav > a, .site-nav a, .pageswitch a, a[data-home], a[data-dash], #navSize, #navExplorer')].filter(a => !a.closest('.phone-menu'));
  const kindOf = a => { const h = a.getAttribute('href') || '', k = a.hasAttribute('data-home') ? 'home' : a.hasAttribute('data-dash') || a.id === 'navExplorer' ? 'studio' : a.id === 'navSize' ? 'size' : null; if (k) return k; const p = PAGES.find(p => p[0] !== 'home' && p[2].test(h)); return p ? p[0] : (a.classList.contains('nav-home') ? 'home' : null); };
  const here = () => {
    if (strong) return sizePage ? 'size' : 'studio';
    const cur = nav.querySelector(':scope > a[aria-current]');
    return cur ? (kindOf(cur) || 'other') : 'other';
  };
  const extra = () => { const cur = nav && nav.querySelector(':scope > a[aria-current]'); return cur && kindOf(cur) === null ? cur.textContent.trim() : ''; };      // a page that is none of the five (the game sheets)
  const regionSrc = () => document.getElementById('regionMenuM') || document.getElementById('regionMenu');

  const render = () => {
    const now = here(), links = pool(), x = extra();
    const items = PAGES.map(([k, t, , dflt]) => {
      const a = links.find(l => kindOf(l) === k), href = (a && a.getAttribute('href') && a.getAttribute('href') !== '#top' ? a.getAttribute('href') : dflt);
      const cur = k === now;
      return `<li><a class="pm-i" href="${esc(href)}" data-page="${k}"${cur ? ' aria-current="page"' : ''}><span>${t}</span>${cur ? CHECK : ''}</a></li>`;
    });
    if (x) items.push(`<li><a class="pm-i" href="${esc(location.pathname.split('/').pop() || '')}" data-page="other" aria-current="page"><span>${esc(x)}</span>${CHECK}</a></li>`);
    const src = regionSrc(), regs = src ? [...src.children].filter(li => li.tagName === 'LI') : [];
    if (regs.length) {
      items.push('<li class="group" role="presentation">Region</li>');
      regs.forEach(li => {
        if (li.classList.contains('group')) { items.push(`<li class="group sub" role="presentation">${li.innerHTML}</li>`); return; }
        const sel = li.getAttribute('aria-selected') === 'true', off = li.getAttribute('aria-disabled') === 'true', sub = li.classList.contains('sub') ? ' pm-sub' : '';
        items.push(off ? `<li class="pm-off${sub}"><span class="pm-i" aria-disabled="true">${li.innerHTML}</span></li>`
          : `<li class="${sub.trim()}"><button type="button" class="pm-i" data-region="${esc(li.dataset.id)}"${sel ? ' aria-current="true"' : ''}><span>${li.innerHTML}</span>${sel ? CHECK : ''}</button></li>`);
      });
    }
    [...ul.children].forEach(li => { if (!li.classList.contains('lang-li') && !li.classList.contains('lang-li-g')) li.remove(); });      // the language row (js/i18n.js) stays
    const tmp = document.createElement('ul'); tmp.innerHTML = items.join('');
    ul.prepend(...tmp.children);
  };
  const place = () => {
    const r = btn.getBoundingClientRect(), top = Math.round(r.bottom + 6);
    ul.style.top = top + 'px'; ul.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px'; ul.style.maxHeight = Math.max(160, innerHeight - top - 12) + 'px';
  };
  const open = on => {
    if (on) { render(); place(); }
    ul.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (on) { const a = ul.querySelector('[aria-current]'); if (a && ul.scrollHeight > ul.clientHeight) a.scrollIntoView({ block: 'nearest' }); }
  };
  render();      // once at the start: js/i18n.js adds the language row to a list that has entries
  btn.addEventListener('click', e => { e.stopPropagation(); open(ul.hidden); });
  ul.addEventListener('click', e => {
    const a = e.target.closest('a.pm-i, button.pm-i'); if (!a) return;
    e.stopPropagation();
    if (a.matches('a[aria-current]')) { e.preventDefault(); open(false); scrollTo({ top: 0, behavior: 'smooth' }); return; }      // the page you are on: the tap still answers
    open(false);
    if (a.dataset.region) {
      if (a.hasAttribute('aria-current')) return;
      const src = regionSrc(), real = src && [...src.querySelectorAll('li')].find(li => li.dataset.id === a.dataset.region); if (real) real.click();
    }
  });
  /* pointerdown, not click: iOS sends no click for a tap on a plain area of the page */
  document.addEventListener('pointerdown', e => { if (!ul.hidden && !e.target.closest('.phone-menu, .pm-btn')) open(false); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ul.hidden) { open(false); btn.focus(); } });
  window.addEventListener('resize', () => { if (!ul.hidden) place(); });
  window.addEventListener('orientationchange', () => open(false));
  window.addEventListener('scroll', () => { if (!ul.hidden) place(); }, { passive: true });      // the list stays under the pill; a scroll never closes it (a tap in flight would be lost)
})();
