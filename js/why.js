/* A greyed-out control that is pressed says why, in a small popup beside it (all pages, one script).
   What counts as greyed out: a disabled button / input / select, aria-disabled="true", and the classes .is-na and .is-unavail (a row or chip greyed but still clickable).
   The reason is the element's data-why, else its title (or the title of its row / label), else a short general line. Controls that already show the big notice
   themselves (#notice) are left alone. No filters, no libraries; a classic script, so every page can load it. */
(function () {
  if (window.__why) return; window.__why = true;
  const SEL = ':disabled, [aria-disabled="true"], .is-na, .is-unavail, [disabled]';
  const FALLBACK = 'Not available right now.';
  const css = document.createElement('style');
  css.textContent = '.why-pop{position:fixed;z-index:100000;max-width:min(260px,calc(100vw - 24px));padding:7px 10px;border-radius:8px;background:rgba(14,26,34,.92);color:#fff;font:500 12px/1.35 "Schibsted Grotesk",system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .15s,transform .15s}'
    + '.why-pop.show{opacity:1;transform:none}'
    + '.why-pop::after{content:"";position:absolute;left:var(--ax,50%);bottom:-4px;width:8px;height:8px;margin-left:-4px;background:inherit;transform:rotate(45deg)}'
    + '.why-pop.below::after{bottom:auto;top:-4px}';
  document.head.appendChild(css);
  let pop = null, hideT = 0, lastAt = 0;

  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); };
  // Why a control is greyed, by id (of the control, or of the input inside a row). Only controls whose own title tells what they DO, not why they are off, need an entry here;
  // a data-why on the element wins over this table, and a title that already reads as a reason (REASON_TITLE) is used as it is.
  const WHY = {
    tongueBtn: 'The map already shows the tongue.', fitBtn: 'The map already shows the whole glacier.',
    playBtn: 'Pick at least two years to play a timelapse.',
    mapOp: 'Opacity works once a glacier is chosen and its picture is on.', outside: 'This glacier has no outline to fade the surroundings around.', vOutside: 'This glacier has no outline to fade the surroundings around.',
    oldToggle: 'No oldest outline for this glacier.', newToggle: 'No newest outline for this glacier.', l3Old: 'No oldest outline for this glacier.', l3New: 'No newest outline for this glacier.',
    radarToggle: 'No radar thickness data for this glacier.', l3Radar: 'No radar thickness data for this glacier.',
    maxToggle: 'Needs thickness data, with the thickest ice inside the 3D picture.', l3Max: 'Needs thickness data, with the thickest ice inside the 3D picture.',
    l3Sr: 'No sharpened picture for the years shown.', mapSr: 'Super-resolution is shown in the 3D view only.',
    flightsToggle: 'Shown in One year, for years that have a swisstopo special flight.', l3Flights: 'Shown in One year, for years that have a swisstopo special flight.',
    vFactSet: 'Switch on Facts first.', vBounce: 'Needs two or more loops.',
    vSwing: 'With one year only the viewpoint moves, so it stays on.',
    demBtn: 'Available in the 3D view of a glacier with yearly surfaces.',
    vsGo: 'Please wait, the file is being made.', vsSend: 'Please wait, the file is being made.', demGo: 'Please wait, the file is being prepared.',
    reset: 'Nothing to put back yet: move or add something first.',
    l3Photos: 'Historical images work in the 3D view of one year.'
  };
  const WHY_CLASS = [['tl-prev', 'This is the first year with a picture.'], ['tl-next', 'This is the last year with a picture.'], ['like', 'One moment, saving your like.']];
  const REASON_TITLE = /\b(not|no|only|needs?|available|unavailable|cannot|can't|until|already|first choose|soon)\b/i;
  const reasonOf = el => {
    if (el.matches('[aria-disabled="true"]') && el.closest('.region-menu, .phone-menu, .pk-menu')) return 'Not published yet: coming soon.';
    const own = (el.dataset && el.dataset.why) || (el.closest('[data-why]') || {}).dataset && el.closest('[data-why]').dataset.why;
    if (own) return own;
    const inp = el.matches('input,button,select') ? el : el.querySelector('input,button,select');
    if (inp && inp.id && WHY[inp.id]) return WHY[inp.id];
    if (el.id && WHY[el.id]) return WHY[el.id];
    for (const [c, m] of WHY_CLASS) if (el.classList.contains(c)) return m;
    let n = el;
    for (let i = 0; n && n !== document.body && i < 4; i++, n = n.parentElement) {
      const w = n.getAttribute('title');
      if (w && w.trim() && REASON_TITLE.test(w)) return w.trim();
    }
    if (el.matches('.years button, .chip, .landsat-chip')) return 'No picture for this year.';
    return FALLBACK;
  };
  // the greyed element under the finger: disabled controls get no events of their own in some browsers, so they are found by position
  const hit = (x, y) => {
    let best = null, area = Infinity;
    const list = [...document.querySelectorAll(SEL), ...document.querySelectorAll('label:has(input:disabled)')];
    for (const el of list) {
      if (el.matches('fieldset, form, option, optgroup, #notice, .why-pop')) continue;
      if (el.matches('input[type=hidden]') || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const top = document.elementFromPoint(x, y); if (top && !(top === el || el.contains(top) || top.contains(el))) continue;      // something else lies on top of it
      const a = r.width * r.height; if (a < area) { best = el; area = a; }
    }
    return best;
  };
  const show = (el, x, y) => {
    const msg = reasonOf(el);
    if (!pop) { pop = document.createElement('div'); pop.className = 'why-pop'; pop.setAttribute('role', 'status'); document.body.appendChild(pop); }
    pop.textContent = msg; pop.classList.remove('show', 'below'); pop.style.left = '0'; pop.style.top = '0';
    const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, vw = innerWidth, vh = innerHeight;
    const cx = Math.min(Math.max(r.left + r.width / 2, 12), vw - 12);
    let left = Math.min(Math.max(cx - w / 2, 8), vw - w - 8), top = r.top - h - 9, below = false;
    if (top < 8) { top = Math.min(r.bottom + 9, vh - h - 8); below = true; }
    pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.setProperty('--ax', (cx - left) + 'px'); pop.classList.toggle('below', below);
    requestAnimationFrame(() => pop.classList.add('show'));
    clearTimeout(hideT); hideT = setTimeout(() => pop && pop.classList.remove('show'), Math.min(5000, 2200 + msg.length * 25));
  };
  const onPress = e => {
    if (e.type === 'click' && e.timeStamp - lastAt < 400) return;      // pointerdown and click of one press: one popup
    if (e.button > 0) return;
    const x = e.clientX, y = e.clientY; if (x == null || (x === 0 && y === 0 && e.type === 'click')) return;
    const el = hit(x, y); if (!el) return;
    // a greyed control with a live handler of its own (the big notice) keeps it; give that a moment to show
    const note = document.getElementById('notice'), before = note && note.classList.contains('show') ? note.textContent : null;
    lastAt = e.timeStamp;
    setTimeout(() => {
      const now = note && note.classList.contains('show') ? note.textContent : null;
      if (now && now !== before) return;      // the page already explained itself
      if (now && now === reasonOf(el)) return;
      show(el, x, y);
    }, 0);
  };
  document.addEventListener('pointerdown', onPress, true);
  document.addEventListener('click', onPress, true);
  addEventListener('scroll', () => pop && pop.classList.remove('show'), true);
})();
