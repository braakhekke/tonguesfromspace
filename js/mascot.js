/* Tongla, the tongue mascot (a classic script, like track.js). A game layer of the explorer, off until the visitor presses the Tongla button next to
   "Guide" (under the page links) (or opens the viewer from the game sheets, play.html, with play=1 in the address). The choice is kept in this browser
   (localStorage, key tfs-tonga: on, found, done; the game sheets show the counts).
   While on, Tongla peeks out from behind one of the controls at once and keeps coming back. Tap Tongla: a multiple-choice question about that tool or about
   what the viewer shows right now. Tongla hides again only after the question is answered correctly (a wrong choice greys out and you try again).
   Where a question is about the live picture, the right answer is READ FROM THE PAGE when the question is asked (years in the tags, the selected glacier,
   the pressed colour mode, the areas in the list as the site shows them), so nothing here is a glacier fact written from memory. The fixed questions ask
   about the viewer's own buttons, using the site's own wording. */
(() => {
  'use strict';
  const KEY = 'tfs-tonga';      /* (the key keeps its first spelling so saved finds survive the rename) */
  /* no Tongla on phones: the same query the site's phone layout uses (css/pages.css), plus small touch screens */
  const PHONE = matchMedia('(max-width:640px), (max-width:950px) and (orientation:landscape) and (max-height:520px), (pointer:coarse) and (max-width:820px)');
  let st = { on: false, found: {}, done: {} };
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && typeof r === 'object') st = Object.assign(st, r); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  st.on = false;      /* off by default on every visit: only the button or #play=1 switches Tongla on (saved finds and quests stay) */
  if (/[#&]play=1(&|$)/.test(location.hash)) { st.on = true; save(); }

  /* ---------- reading the page ---------- */
  const $ = (id) => document.getElementById(id);
  const shown = (e) => !!e && !e.hidden && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
  const pressed = (id) => { const e = $(id); return !!e && e.getAttribute('aria-pressed') === 'true'; };
  const glacierNames = () => [...document.querySelectorAll('#glacierList .name')].map((n) => n.textContent.trim()).filter(Boolean);
  const glacierNow = () => { const n = document.querySelector('#glacierList button[aria-pressed="true"] .name'); return n ? n.textContent.trim() : ''; };
  const tagYear = (id) => { const m = /\d{4}/.exec(($(id) || {}).innerText || ''); return m ? +m[0] : 0; };
  const pickYears = () => { const g = [...document.querySelectorAll('.years')].find(shown); return g ? [...g.querySelectorAll('button')].map((b) => +b.textContent.trim()).filter((y) => y > 1900) : []; };
  const labelText = (id) => { const e = $(id); const l = e && e.closest('label'); return l ? l.innerText.trim().replace(/\s+/g, ' ') : ''; };
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /* a question with one right answer and up to three wrong ones */
  const mc = (q, right, wrongs) => { wrongs = [...new Set(wrongs.filter((w) => w && w !== right))]; const opts = shuffle([right, ...shuffle(wrongs).slice(0, 3)]); return opts.length < 2 ? null : { q, opts, ans: opts.indexOf(right) }; };
  const NO = (msg) => ({ wait: msg });

  /* ---------- the hiding places: element id, name of the place, "do this first" (optional), question builder ---------- */
  const ON_SIZE = !!$('modeSwitch') && !!$('gList');      /* the size pages (size.html: Area 2D and Volume 3D) have their own hiding places */
  const BUILT = [...document.scripts].some((s) => /(home-link|mascot)\.[0-9a-f]{10}\.js/.test(s.src));
  const SIZE_URL = (BUILT ? '/size.html' : 'size.html') + '#mode=3d', DASH_URL = BUILT ? '/switzerland/' : 'index.html';
  const DASH_SPOTS = [
    ['modeCompare', 'Behind the mode buttons', 'Switch to Slider.', () => {
      if (!pressed('modeCompare')) return NO('I can\'t see the slider yet. Press "Slider", then tap me again.');
      const a = tagYear('tagA'), b = tagYear('tagB'); if (!a || !b) return NO('The two years are not there yet. Wait a moment, then tap me again.');
      const ys = pickYears().filter((y) => y !== a && y !== b);
      const pair = (x, y) => `${x} and ${y}`;
      const w = [pair(a, ys[0] || a - 1), pair(ys[1] || b + 1, b), pair(ys[2] || a + 2, ys[3] || b - 2), pair(b, a === b ? a - 1 : a)];
      return mc('Which two years can you see on the picture now? Look at the big numbers.', pair(a, b), w.filter((x) => x !== pair(a, b) && x !== pair(b, a)));
    }],
    ['modeTimelapse', 'Behind Timelapse', '', () => mc('What does Timelapse do?', 'Plays the years one after another, like a film', ['Lets you slide between two years', 'Measures how long the glacier is', 'Shows just one year in 3D'])],
    ['view3dBtn', 'Behind the 3D button', 'Press 3D.', () => {
      if (!pressed('view3dBtn')) return NO('I can\'t see 3D yet. Press "3D", then tap me again.');
      const g = glacierNow(); return g ? mc('Which glacier are you looking at in 3D?', g, glacierNames()) : NO('I can\'t read the glacier\'s name. Try again.');
    }],
    ['styleFalse1', 'Behind the colour pictures', 'Choose any colour mode.', () => colourQ()],
    ['styleFalse2', 'Behind the colour pictures', 'Choose any colour mode.', () => colourQ()],
    ['landsatToggle', 'Behind Older imagery', 'Look at the year buttons. You can switch "Older imagery" on or off.', () => {
      const ys = pickYears(); if (!ys.length) return NO('I can\'t see the year buttons. Try again.');
      const m = Math.min(...ys); return mc('What is the oldest year you can pick right now?', String(m), [m + 1, m + 3, m - 1].map(String));
    }],
    ['radarToggle', 'Behind the layers', 'Open the Layers box at the top right.', () => mc('Which layer shows how thick the ice is, measured with radar (a machine that looks into the ice)?', labelText('radarToggle') || 'Radar points', [labelText('thickToggle'), labelText('trailsToggle'), labelText('oldToggle')])],
    ['thickToggle', 'Behind the layers', 'Open the Layers box at the top right.', () => mc('Which layer is a computer\'s guess (a model), not something people measured?', labelText('thickToggle') || 'Glacier thickness 2016', [labelText('radarToggle'), labelText('trailsToggle'), labelText('oldToggle')])],
    ['trailsToggle', 'Behind the layers', 'Open the Layers box at the top right.', () => mc('Which layer shows paths for walking in the mountains?', labelText('trailsToggle') || 'Trails', [labelText('radarToggle'), labelText('thickToggle'), labelText('oldToggle')])],
    ['measureDist', 'Behind the measuring tools', 'Look at the tools at the bottom of the map.', () => mc('Which tool measures how long something is on the map?', 'Measure length', ['Measure area', 'Cross-section', 'Clear'])],
    ['videoBtn', 'Behind the share tools', '', () => mc('Which button lets you make your own picture or film?', 'Create and share', ['Restore defaults', 'Guide', 'Gallery'])],
    ['glacierList', 'Behind the glacier list', '', () => {
      const rows = [...document.querySelectorAll('#glacierList li')].map((li) => ({ n: (li.querySelector('.name') || {}).textContent, a: parseFloat(((li.querySelector('.area') || {}).textContent || '').replace(',', '.')) })).filter((r) => r.n && isFinite(r.a));
      if (rows.length < 3) return NO('The list is not ready yet. Try again.');
      const top = rows.reduce((p, r) => (r.a > p.a ? r : p));
      return mc('Which glacier in the list is the biggest? Look at the numbers next to the names.', top.n.trim(), rows.map((r) => r.n.trim()));
    }],
    ['playBtn', 'Behind Play', '', () => mc('When the glacier numbers say "2017", which months do they mean?', 'October 2016 to September 2017', ['January 2017 to December 2017', 'October 2017 to September 2018', 'The summer of 2017 only'])]
  ];
  /* the size page: the lists show each glacier's area (2D) or volume (3D) in the unit the page states; the right answer is the largest number on screen */
  const sizeRows = () => [...document.querySelectorAll('#gList li')].map((li) => ({ n: ((li.querySelector('.name') || {}).textContent || '').trim(), t: ((li.querySelector('.area') || {}).textContent || '').trim(), v: parseFloat(((li.querySelector('.area') || {}).textContent || '').replace(',', '.')) })).filter((r) => r.n && isFinite(r.v));
  const sizeBiggest = (what, unit) => { const rows = sizeRows().filter((r) => r.t.includes(unit)); if (rows.length < 3) return NO('The list does not show ' + what + ' yet. Try again.'); const top = rows.reduce((p, r) => (r.v > p.v ? r : p)); return mc(`Which glacier ${what === 'volume' ? 'has the most ice (its volume)' : 'covers the most ground (its area)'}? Look at the numbers in the list.`, top.n, rows.map((r) => r.n)); };
  const SIZE_SPOTS = [
    ['sz-vol', 'Behind Volume 3D', 'Press Volume 3D. The list then shows ice volume.', () => { const b = document.querySelector('#modeSwitch [data-mode="3d"]'); return b && b.getAttribute('aria-pressed') === 'true' ? sizeBiggest('volume', 'km³') : NO('I can\'t see Volume 3D yet. Press it, then tap me again.'); }, '#modeSwitch [data-mode="3d"]'],
    ['sz-area', 'Behind Area 2D', 'Press Area 2D. The list then shows area.', () => { const b = document.querySelector('#modeSwitch [data-mode="2d"]'); return b && b.getAttribute('aria-pressed') === 'true' ? sizeBiggest('area', 'km²') : NO('I can\'t see Area 2D yet. Press it, then tap me again.'); }, '#modeSwitch [data-mode="2d"]'],
    ['sz-glacier', 'Behind the glacier list', 'Pick a glacier in the list.', () => { const b = document.querySelector('#gList button[aria-pressed="true"] .name'); return b ? mc('Which glacier did you pick?', b.textContent.trim(), sizeRows().map((r) => r.n)) : NO('You have not picked a glacier yet. Pick one, then tap me again.'); }, '#gList'],
    ['sz-city', 'Behind the cities', 'Pick a glacier and a city to put it on.', () => { const c = document.querySelector('#cities button[aria-pressed="true"]'); return c ? mc('Which city did you put the glacier on?', c.textContent.trim(), [...document.querySelectorAll('#cities button')].map((x) => x.textContent.trim())) : NO('You have not picked a city yet. Pick one, then tap me again.'); }, '#cities']
  ];
  const SPOTS = ON_SIZE ? SIZE_SPOTS : DASH_SPOTS;
  function colourQ() {
    const ids = ['styleNatural', 'styleFalse1', 'styleFalse2', 'styleFalse3'], name = (id) => (($(id) || {}).innerText || '').trim();
    const on = ids.find(pressed); if (!on) return NO('I can\'t see which colour button is on. Try again.');
    return mc('Which colour button is switched on now?', name(on), ids.filter((i) => i !== on).map(name));
  }
  const total = SPOTS.length;

  /* ---------- look: a smooth, round-topped tongue ---------- */
  const FACE = '<svg viewBox="0 18 46 52" aria-hidden="true">' +
    '<path d="M5 69 C2 47 6 22 23 22 C40 22 44 47 41 69 Z" fill="#F08F89" stroke="var(--loss,#C8322A)" stroke-width="2.4" stroke-linejoin="round"/>' +      /* the tongue */
    '<path d="M23 28 C24.5 40 22.5 52 23.5 64" fill="none" stroke="var(--loss,#C8322A)" stroke-width="1.7" stroke-linecap="round" opacity=".55"/>' +      /* its groove */
    '<path d="M11 52 C9 58 9.5 63 10.5 67 M35 52 C37 58 36.5 63 35.5 67" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>' +
    '<ellipse cx="15.5" cy="40" rx="5" ry="5.8" fill="#fff" stroke="var(--ink,#0E1A22)" stroke-width="1.2"/><ellipse cx="30.5" cy="40" rx="5" ry="5.8" fill="#fff" stroke="var(--ink,#0E1A22)" stroke-width="1.2"/>' +
    '<circle cx="16.5" cy="41" r="2.5" fill="var(--ink,#0E1A22)"/><circle cx="29.5" cy="41" r="2.5" fill="var(--ink,#0E1A22)"/><circle cx="17.3" cy="40" r=".9" fill="#fff"/><circle cx="30.3" cy="40" r=".9" fill="#fff"/>' +
    '<path d="M18 52 Q23 57.5 28 52" fill="none" stroke="var(--ink,#0E1A22)" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="9.5" cy="49" r="2.6" fill="var(--loss,#C8322A)" opacity=".28"/><circle cx="36.5" cy="49" r="2.6" fill="var(--loss,#C8322A)" opacity=".28"/>' +
    '</svg>';
  const W = 46, H = 52;

  const css = document.createElement('style');
  css.textContent = `
  .tonga[hidden]{display:none}
  .tonga{position:fixed;z-index:9000;width:${W}px;height:${H}px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .4s cubic-bezier(.3,1.5,.5,1),opacity .25s;opacity:0}
  .tonga.show{opacity:1}
  .tonga svg{display:block;width:100%;height:100%;overflow:visible}
  .tonga.wiggle svg{animation:tongaw 1.1s ease-in-out infinite;transform-origin:50% 100%}
  @keyframes tongaw{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}
  .tonga-chip{position:fixed;z-index:9000;right:12px;bottom:12px;background:var(--sheet,#fff);color:var(--rock,#1C2A33);border:2px solid var(--accent,#C8322A);border-radius:var(--r-pill,999px);padding:5px 14px 5px 9px;font:700 12.5px var(--sans,sans-serif);display:flex;gap:7px;align-items:center;cursor:pointer;box-shadow:var(--lift,0 2px 8px rgba(0,0,0,.2));transition:transform .2s cubic-bezier(.3,1.6,.5,1)}
  .tonga-chip:hover{transform:translateY(-2px) rotate(-1.5deg)}
  .tonga-chip svg{width:19px;height:21px}
  .tonga-card{position:fixed;z-index:9001;right:12px;bottom:60px;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 84px);overflow:auto;background:var(--sheet,#fff);color:var(--rock,#1C2A33);border:2px solid var(--accent,#C8322A);border-radius:var(--r-lg,20px);box-shadow:0 0 0 4px var(--ice,#CFE3EA),var(--lift,0 6px 24px rgba(0,0,0,.3));padding:14px 16px;font:13.5px/1.45 var(--sans,sans-serif);animation:tongap .35s cubic-bezier(.3,1.5,.5,1)}
  @keyframes tongap{from{transform:scale(.88) translateY(10px);opacity:0}}
  .tonga-card .hd{display:flex;gap:10px;align-items:center}
  .tonga-card .hd svg{width:36px;height:42px;flex:none;animation:tongaw 1.6s ease-in-out infinite;transform-origin:50% 100%}
  .tonga-card h4{margin:0 0 2px;font-size:15.5px;letter-spacing:-.01em;color:var(--accent,#C8322A)}
  .tonga-card .prep{background:var(--ice,#CFE3EA);border-radius:var(--r-md,14px);padding:8px 11px;margin:10px 0;font-size:12.5px}
  .tonga-card .opt{display:block;width:100%;text-align:left;margin:7px 0 0;border:2px solid var(--rule,#ddd);border-radius:var(--r-md,14px);background:var(--sheet,#fff);padding:9px 13px;font:600 13px var(--sans,sans-serif);color:inherit;cursor:pointer;transition:transform .15s cubic-bezier(.3,1.6,.5,1),border-color .15s}
  .tonga-card .opt:hover:not(:disabled){border-color:var(--crevasse,#2D6E8E);transform:translateX(3px)}
  .tonga-card .opt.bad{background:var(--rule-2,#EDF0F2);border-color:var(--rule-2,#EDF0F2);color:var(--faint,#93A0A7);text-decoration:line-through;cursor:default}
  .tonga-card .opt.good{background:var(--crevasse,#2D6E8E);border-color:var(--crevasse,#2D6E8E);color:#fff}
  .tonga-card .opt.good::before{content:"\\2713  "}
  .tonga-card .msg{margin:9px 0 0;font-weight:700;font-size:13px}
  .tonga-card .msg.bad{color:var(--accent,#C8322A)}
  .tonga-card .row{display:flex;gap:8px;margin:12px 0 0;flex-wrap:wrap;align-items:center}
  .tonga-card .btn2{border:2px solid var(--rule,#ddd);border-radius:var(--r-pill,999px);background:var(--sheet,#fff);padding:7px 14px;font:700 12.5px var(--sans,sans-serif);cursor:pointer;color:inherit;transition:transform .15s cubic-bezier(.3,1.6,.5,1)}
  .tonga-card .btn2:hover{transform:translateY(-1px);border-color:var(--crevasse,#2D6E8E)}
  .tonga-card .btn2.p{background:var(--accent,#C8322A);border-color:var(--accent,#C8322A);color:#fff}
  .tonga-card .off{margin-left:auto;border:0;background:none;color:var(--moraine,#66757E);font:11.5px var(--sans,sans-serif);cursor:pointer;padding:4px 0}
  .tonga-card small{color:var(--moraine,#66757E);font-size:11.5px}
  .tonga-card.shake{animation:tongas .3s}
  @keyframes tongas{20%{transform:translateX(-5px)}60%{transform:translateX(5px)}}
  .tonga-hit{outline:3px solid var(--measure,#FFD84D)!important;outline-offset:2px}
  #tongaBtn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  .brand-btns{gap:5px;flex-wrap:wrap}.brand-btns .teaser-btn{white-space:nowrap;padding:5px 7px 5px 6px;gap:4px;font-size:12px}
  #tongaBtn svg{width:13px;height:15px;fill:currentColor;stroke:none}
  #tongaBtn svg .g{fill:none;stroke:var(--sheet,#fff);stroke-width:5;stroke-linecap:round}
  #tongaBtn[aria-pressed="false"] svg .g{stroke:var(--sheet,#fff)}
  @media (prefers-reduced-motion:reduce){.tonga{transition:none}.tonga.wiggle svg,.tonga-card.shake,.tonga-card,.tonga-card .hd svg{animation:none}}`;
  document.head.appendChild(css);

  /* ---------- state of the game ---------- */
  const el = document.createElement('div'); el.className = 'tonga'; el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Tongla is hiding here. Tap to catch Tongla and get a question.'); el.innerHTML = FACE; el.hidden = true;
  const chip = document.createElement('button'); chip.className = 'tonga-chip'; chip.type = 'button'; chip.setAttribute('aria-label', 'Tongla: your score'); chip.innerHTML = FACE + '<span></span>';
  let card = null, spot = null, hideT = 0, nextT = 0, hitEl = null, running = false;
  const solved = () => SPOTS.filter((s) => st.done[s[0]]).length;
  const updUI = () => {
    chip.querySelector('span').textContent = `Tongla ${solved()}/${total}`;
    const b = $('tongaBtn'); if (b) b.setAttribute('aria-pressed', st.on ? 'true' : 'false');
  };
  const target = (s) => { const e = s[4] ? document.querySelector(s[4]) : $(s[0]); return e && (e.closest('label') || e); };
  const inView = (e) => { if (!shown(e)) return false; const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };

  function hide(quick) { clearTimeout(hideT); el.classList.remove('show', 'wiggle'); setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 300); spot = null; later(quick ? 600 : 1500); }
  function later(ms) { clearTimeout(nextT); if (running) nextT = setTimeout(peek, ms); }
  function peek() {
    if (!running || card) return;
    const open = SPOTS.filter((s) => !st.done[s[0]] && inView(target(s)));
    if (!open.length) { if (solved() >= total) return; return later(2000); }      /* nothing unsolved is on screen: look again in a moment (a panel may be closed) */
    const pick = open[rnd(open.length)], r = target(pick).getBoundingClientRect(), up = r.top > H + 8;
    /* Tongla stands behind the control: only what is outside the control's box is shown (clip-path); the rest is "hidden" by it */
    const x = Math.min(innerWidth - W - 4, Math.max(4, r.left + r.width / 2 - W / 2 + (Math.random() - .5) * Math.min(40, r.width)));
    el.style.left = x + 'px'; el.style.top = (up ? r.top - H + 10 : r.bottom - 10) + 'px';
    el.style.clipPath = up ? 'inset(0 -20px 10px -20px)' : 'inset(10px -20px 0 -20px)';
    el.style.transform = `translateY(${up ? 26 : -26}px)`; el.hidden = false; spot = pick; st.found[pick[0]] = 1; save();
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('show'); el.style.transform = 'translateY(0)'; setTimeout(() => el.classList.add('wiggle'), 420); }));
    hideT = setTimeout(() => hide(false), 12000);
  }

  /* ---------- the question card ---------- */
  function closeCard() { if (card) { card.remove(); card = null; } if (hitEl) { hitEl.classList.remove('tonga-hit'); hitEl = null; } }
  function offNow() { setOn(false); }
  /* the trip: from the explorer to the size page on Volume 3D, and back. Offered after every third solved place and in the card of the chip. */
  const tripNow = () => (ON_SIZE ? solved() >= 2 : solved() > 0 && solved() % 3 === 0);
  const tripBtn = (strong) => ON_SIZE
    ? `<button type="button" class="btn2${strong ? ' p' : ''}" data-a="trip">Back to the explorer</button>`
    : `<button type="button" class="btn2${strong ? ' p' : ''}" data-a="trip">Follow Tongla to Volume 3D</button>`;
  function renderCard(s, q, note) {
    if (!card) { card = document.createElement('div'); card.className = 'tonga-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Tongla asks'); document.body.appendChild(card); }
    const right = q && q.right;
    let h = `<div class="hd">${FACE}<div><h4>${s ? 'You found Tongla! ' + s[1] + '.' : 'Tongla'}</h4><small>${solved()} of ${total} hiding places solved</small></div></div>`;
    if (!s) h += `<div class="msg">Tongla peeks out from behind the buttons. Tap Tongla to get a question. Get it right and Tongla hides somewhere new.</div><div class="row">${tripBtn(true)}</div>`;
    else if (q && q.opts) {
      h += `<div class="msg" style="margin-top:10px">${q.q}</div>` + q.opts.map((o, i) => `<button type="button" class="opt${q.bad.includes(i) ? ' bad' : ''}${right && i === q.ans ? ' good' : ''}" data-i="${i}"${q.bad.includes(i) || right ? ' disabled' : ''}>${o.replace(/</g, '&lt;')}</button>`).join('');
      if (note) h += `<div class="msg ${right ? '' : 'bad'}">${note}</div>`;
      if (right) h += `<div class="row"><button type="button" class="btn2${tripNow() ? '' : ' p'}" data-a="next">Next hiding place</button>${tripBtn(tripNow())}</div>`;
      else h += `<div class="row"><button type="button" class="btn2" data-a="again">Ask again</button><small>Look at the screen again. The answer is there!</small></div>`;
    } else {
      h += (s[2] ? `<div class="prep"><b>First:</b> ${s[2]}</div>` : '') + (note ? `<div class="msg bad">${note}</div>` : '') + `<div class="row"><button type="button" class="btn2 p" data-a="ask">Ask me</button></div>`;
    }
    h += `<div class="row"><button type="button" class="off" data-a="off">Switch Tongla off</button></div>`;
    card.innerHTML = h; card.__s = s; card.__q = q;
  }
  function ask(s) {
    const b = s[3](); if (!b || b.wait) return renderCard(s, null, (b && b.wait) || 'I can\'t ask that yet. Try again.');
    b.bad = []; renderCard(s, b, '');
  }
  function onCatch() {
    if (!spot) return; const s = spot; clearTimeout(hideT); el.classList.remove('show', 'wiggle'); el.hidden = true; spot = null;
    closeCard(); hitEl = target(s); if (hitEl) hitEl.classList.add('tonga-hit');
    if (s[2]) renderCard(s, null, ''); else { ask(s); }
  }
  document.addEventListener('click', (e) => {
    if (!card || !card.contains(e.target)) return;
    const a = e.target.getAttribute && e.target.getAttribute('data-a'), oi = e.target.getAttribute && e.target.getAttribute('data-i'), s = card.__s, q = card.__q;
    if (a === 'off') return offNow();
    if (a === 'trip') { location.href = ON_SIZE ? DASH_URL : SIZE_URL; return; }
    if (a === 'ask' || a === 'again') return ask(s);
    if (a === 'next') { closeCard(); updUI(); return later(1200); }
    if (oi !== null && q && q.opts) {
      const i = +oi;
      if (i === q.ans) { st.done[s[0]] = 1; save(); updUI(); q.right = true; renderCard(s, q, solved() >= total ? 'Right! You solved every hiding place. Ice master!' : 'Right!'); }
      else { q.bad.push(i); renderCard(s, q, 'Not quite. Try another answer.'); card.classList.add('shake'); }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card && !card.__q) { closeCard(); later(1500); } });
  el.addEventListener('click', onCatch);
  chip.addEventListener('click', () => { if (card) { if (!card.__s) { closeCard(); } return; } renderCard(null, null, ''); });

  /* ---------- on and off ---------- */
  function setOn(on) {
    if (on && PHONE.matches) return;      /* never on a phone */
    st.on = !!on; save(); updUI();
    if (on) { if (running) return; running = true; document.body.appendChild(el); document.body.appendChild(chip); updUI(); later(500); }
    else { running = false; clearTimeout(hideT); clearTimeout(nextT); closeCard(); el.hidden = true; el.classList.remove('show', 'wiggle'); spot = null; el.remove(); chip.remove(); }
  }
  const start = () => {
    const bar = ON_SIZE || PHONE.matches ? null : document.querySelector('.brand-btns');
    if (bar && !$('tongaBtn')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'teaser-btn'; b.id = 'tongaBtn'; b.setAttribute('aria-pressed', 'false'); b.title = 'Play: Tongla the tongue hides behind the controls and asks questions';
      b.innerHTML = '<svg viewBox="0 18 46 52" aria-hidden="true"><path d="M5 69 C2 47 6 22 23 22 C40 22 44 47 41 69 Z"/><path class="g" d="M23 32 L23 60"/></svg>Tongla Quiz';
      b.addEventListener('click', () => setOn(!st.on)); bar.appendChild(b);
    }
    updUI(); if (st.on && !PHONE.matches) setOn(true);
    /* turning the phone sideways or resizing the window: leave when it becomes a phone, come back when it stops being one */
    if (!window.TONGA_LISTENING) PHONE.addEventListener('change', () => { if (PHONE.matches) { const was = st.on; setOn(false); st.on = was; save(); const b = $('tongaBtn'); if (b) b.hidden = true; } else { const b = $('tongaBtn'); if (b) b.hidden = false; else start(); if (st.on) setOn(true); } });
    window.TONGA_LISTENING = true;
    window.TONGA = { peek, solved, spots: SPOTS.map((s) => s[0]), on: setOn };      /* for the tests */
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
