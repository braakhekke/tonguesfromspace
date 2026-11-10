/* The way back to the front page (the region picker). Every page has a link marked data-home; this sets where it goes:
   "/" on the public site, home.html from the source tree. The public build gives this file a hashed name (home-link.1a2b3c4d5e.js), which is how it knows. */
(() => {
  const built = /home-link\.[0-9a-f]{10}\.js/.test(document.currentScript ? document.currentScript.src : '');
  document.querySelectorAll('a[data-home]').forEach(a => { a.setAttribute('href', built ? '/' : 'home.html'); });
  if (built) document.querySelectorAll('a[data-dash]').forEach(a => { a.setAttribute('href', '/switzerland/'); });      // index.html of the public build is the front page; the explorer is at the address of its region
})();

/* The phone menu (explorer and size page): the pill at the right of the title row opens a list of the pages and of the regions. The items click the real links (the side panel's page links, hidden on phones)
   and the real region items (the region menu of the page), so every address, the region switch and the page's own handlers stay in one place. */
(() => {
  const head = document.getElementById('mhead'), strong = head && head.querySelector('strong');
  if (!strong) return;
  const size = /size(\.html)?$/.test(location.pathname), here = size ? 'size' : 'explorer';
  const btn = document.createElement('button'), ul = document.createElement('ul');
  btn.type = 'button'; btn.className = 'menu-btn'; btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Menu: pages and regions');
  btn.innerHTML = '<span>Menu</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  ul.className = 'phone-menu'; ul.hidden = true; ul.setAttribute('aria-label', 'Menu');
  strong.append(btn); head.append(ul);
  const nav = () => document.querySelector('.controls .site-nav');
  const link = sel => nav() && nav().querySelector(sel);
  const pages = [['home', 'Home', () => link('a[data-home]')], ['explorer', 'Explorer', () => size ? link('#navExplorer') : null], ['size', 'Glacier size', () => size ? null : link('#navSize')], ['notes', 'Field notes', () => ({ click: () => { location.href = 'provenance.html'; } })], ['gallery', 'Gallery', () => link('a[href="gallery.html"]')]];
  const regionList = () => document.getElementById('regionMenuM') || document.getElementById('regionMenu');
  const open = on => { if (on) { render(); } ul.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
  const render = () => {
    const src = regionList(), regs = src ? [...src.children].filter(li => li.tagName === 'LI') : [];
    ul.innerHTML = pages.map(([k, t]) => `<li data-page="${k}"${k === here ? ' aria-current="page"' : ''}>${t}</li>`).join('')
      + (regs.length ? '<li class="group" role="presentation">Region</li>' + regs.map(li => li.classList.contains('group') ? `<li class="group sub" role="presentation">${li.innerHTML}</li>` : `<li data-region="${li.dataset.id}"${li.classList.contains('sub') ? ' class="sub"' : ''}${li.getAttribute('aria-selected') === 'true' ? ' aria-current="true"' : ''}${li.getAttribute('aria-disabled') === 'true' ? ' aria-disabled="true"' : ''}>${li.innerHTML}</li>`).join('') : '');
  };
  btn.addEventListener('click', e => { e.stopPropagation(); open(ul.hidden); });
  ul.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li || li.classList.contains('group') || li.getAttribute('aria-disabled') === 'true') return;
    e.stopPropagation(); open(false);
    if (li.dataset.page) { if (li.dataset.page === here) return; const p = pages.find(x => x[0] === li.dataset.page), a = p && p[2](); if (a) a.click(); return; }
    const src = regionList(), r = src && [...src.querySelectorAll('li')].find(x => x.dataset.id === li.dataset.region); if (r) r.click();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.phone-menu, .menu-btn')) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ul.hidden) { open(false); btn.focus(); } });
})();
