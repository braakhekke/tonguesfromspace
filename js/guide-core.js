/* =====================================================================
   The guide's engine, shared by the Explorer (js/15-guide.js) and the size page (js/guide-size.js)
   ===================================================================== */
/* It knows nothing about either page. A page hands it chapters of "tracks"; a track is a short list of "beats":
   one sentence, one real control to ring, and a test that says the visitor has done it.
   Idea: nobody reads a tutorial. A step is finished by doing it, never by pressing "Next".
   One dark bar sits on the picture just above the page's toolbar; a ring (outline, ripples, a short spotlight) marks the real control;
   where a picture has to be dragged a "finger" shows the gesture once. Progress is kept in localStorage (tfs-guide), shared by both pages.
   Styles: css/guide.css. Tests: tests/test_guide.py. */

export const $ = id => document.getElementById(id);
export const phone = () => matchMedia('(max-width:900px)').matches;
export const calm = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const shown = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
export const iconOf = id => { const s = $(id) && $(id).querySelector('svg'); return s ? '<svg viewBox="' + s.getAttribute('viewBox') + '" aria-hidden="true">' + s.innerHTML + '</svg>' : ''; };      // the page's own symbols, so they are recognised later
export const ICON = {      // symbols for things that have no button symbol of their own on the page
  colours: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9.5" r="5.5"/><circle cx="15" cy="9.5" r="5.5"/><circle cx="12" cy="14.5" r="5.5"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.3"/></svg>',
  older: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5M12 8v4.5l3 1.8"/></svg>',
  story: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10l4 4v11H5z"/><path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.7 10.8l6.1-3.6M8.7 13.2l6.1 3.6"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>',
  film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
  area: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5z"/><path d="M9 3.5V18M15 6v14.5"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
  ten: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>'
};
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const COMPASS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.2 5.4-5.4 2.2 2.2-5.4z"/></svg>';
const MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
const KEY = 'tfs-guide', OPEN = 'tfs-guide-open';      // KEY: what has been tried, kept for later visits; OPEN: set for one page change, so the guide opens on the other page

/* what the visitor does: trusted input only, so the guide's own demos and clicks never count */
export const input = {down: 0, downEl: null, at: {}};      // at[kind + ':' + id]: last time a pointerdown / click / change happened on or inside the element with that id
const stamp = kind => e => {
  if (!e.isTrusted) return;
  const now = Date.now(); if (kind === 'down') { input.down = now; input.downEl = e.target; }
  for (let n = /** @type {Element|null} */ (e.target); n && n.nodeType === 1; n = n.parentElement) if (n.id) input.at[kind + ':' + n.id] = now;
};
addEventListener('pointerdown', stamp('down'), true); addEventListener('click', stamp('click'), true); addEventListener('change', stamp('change'), true); addEventListener('submit', stamp('click'), true);
export const did = (kind, id, since) => (input.at[kind + ':' + id] || 0) > since;

/**
 * @param {{stage: HTMLElement, chapters: any[], obstacles: () => (Element|null)[], launcherHost: () => (Element|null),
 *          reveal?: (el: Element) => void, onTick?: (api: any) => void, firstHead?: () => string,
 *          autoOpen?: boolean, hold?: () => boolean, extra?: {label: string, run: () => void}}} cfg
 *   obstacles: what the page shows low in the picture (toolbars, captions): the bar sits above them; launcherHost: the row that gets the Guide button;
 *   reveal: open the panel a control is in; autoOpen: false = never open by itself on a first visit; hold: true while something else covers the page (the demo film);
 *   extra: one more link in the menu's last line.
 */
export function createGuide(cfg){
  const stage = cfg.stage;
  let saved = {seen: false, done: {}, chapter: 0};
  try { saved = Object.assign(saved, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };

  const chapters = cfg.chapters;
  const avail = t => !t.avail || t.avail();
  const tracksOf = ch => (ch.tracks || []).filter(avail);
  const all = () => chapters.flatMap(tracksOf);
  const byId = id => chapters.flatMap(c => c.tracks || []).find(t => t.id === id);
  const chapterOf = t => chapters.findIndex(c => (c.tracks || []).includes(t));
  const doneIn = ch => tracksOf(ch).filter(t => saved.done[t.id]).length;
  const icon = t => t.icon && t.icon.startsWith('<') ? t.icon : iconOf(t.icon);

  /* the pieces on the page */
  const bar = document.createElement('div'); bar.className = 'gd-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Guide'); stage.appendChild(bar);
  const ring = document.createElement('div'); ring.className = 'gd-ring'; ring.hidden = true; ring.innerHTML = '<i></i><i></i>'; document.body.appendChild(ring);
  const dim = document.createElement('div'); dim.className = 'gd-dim'; dim.hidden = true; document.body.appendChild(dim);      // a short spotlight: everything but the control goes a little darker
  const dot = document.createElement('div'); dot.className = 'gd-dot'; dot.hidden = true; document.body.appendChild(dot);      // the "finger" of a demo
  const launch = document.createElement('button'); launch.type = 'button'; launch.className = 'teaser-btn gd-launch'; launch.onclick = () => view === 'pill' ? openMenu() : minimise();

  let openAt = null; try { openAt = sessionStorage.getItem(OPEN); sessionStorage.removeItem(OPEN); } catch {}
  const framed = (() => { try { return window.top !== window; } catch { return true; } })();      // inside a frame (the review tools, a preview): never open by itself
  let view = !phone() && (openAt || (!saved.seen && cfg.autoOpen !== false && !framed)) ? 'menu' : 'pill';      // menu | run | pill; on a phone always 'pill' (hidden by CSS: too small for the guide)
  let chapter = Math.max(0, chapters.findIndex(c => c.id === openAt)); if (!openAt) chapter = 0;
  let track = null, beatIx = 0, phase = 'idle', ctx = {t0: 0}, gen = 0, note = '', hoverTarget = null, lastSay = '';
  const beat = () => track && track.beats[beatIx];
  const sayOf = b => typeof b.say === 'function' ? b.say(ctx) : b.say;
  const skipped = b => !!(b.skipIf && b.skipIf());

  const api = {
    input, did, dot, bar, ring,
    get gen(){ return gen; }, get view(){ return view; }, get phase(){ return phase; }, get track(){ return track; }, get ctx(){ return ctx; }, get beat(){ return beat(); },
    until: async (test, ms = 45000) => { const g = gen, t0 = Date.now(); while (!test()) { if (g !== gen) throw Error('cancelled'); if (Date.now() - t0 > ms) throw Error('This view is taking long to load. Try again in a moment.'); await sleep(120); } if (g !== gen) throw Error('cancelled'); },
    flash, stopDot, render, start, minimise,
    completeFirst(id, base){      // the visitor did a track's first step before choosing anything: it counts
      stopDot(); gen++; track = byId(id); chapter = chapterOf(track); view = 'run'; beatIx = 0; phase = 'beat'; ctx = {t0: 0, base}; saved.seen = true; save(); advance(false);
    }
  };

  /* ---------- drawing the bar ---------- */
  function head(ch){
    const first = !Object.keys(saved.done).length && chapter === 0;
    if (first) return ['First time here?', cfg.firstHead ? cfg.firstHead() : ch.head];
    const n = doneIn(ch), m = tracksOf(ch).length;
    return [ch.kicker || 'Guide', ch.head + (m && n === m ? ' <span class="gd-alld">all done</span>' : '')];
  }
  function render(){
    bar.dataset.view = view; bar.dataset.phase = phase;
    const total = all().length, nDone = all().filter(t => saved.done[t.id]).length;
    launch.innerHTML = COMPASS + 'Guide' + (nDone ? '<em>' + nDone + '/' + total + '</em>' : '') + '<i class="gd-prog" style="width:' + (total ? 100 * nDone / total : 0) + '%"></i>';      // the site's own outline button; what has been tried runs as a thin red line along its lower edge
    launch.title = nDone ? nDone + ' of ' + total + ' things tried' : 'A short guide: ' + total + ' things to try'; launch.setAttribute('aria-pressed', String(view !== 'pill'));
    if (view === 'pill') {
      bar.innerHTML = '';      // put away: nothing on the picture; the Guide button under the page links opens it again
    } else if (view === 'menu') {
      const ch = chapters[chapter], [kicker, h2] = head(ch);
      const chips = '<div class="gd-chips" role="tablist" aria-label="Chapters of the guide">' + chapters.map((c, i) => { const m = tracksOf(c).length; return '<button type="button" role="tab" class="gd-chip" data-ch="' + i + '" aria-selected="' + (i === chapter) + '">' + c.title + (c.link ? ' ↗' : '<em>' + doneIn(c) + '/' + m + '</em>') + '</button>'; }).join('') + '</div>';
      const body = ch.link
        ? '<a class="gd-card gd-wide" href="' + ch.link.href + '" data-open="' + (ch.link.open || '') + '"><span class="gd-ico">' + ch.link.icon + '</span><span class="gd-wt"><b>' + ch.link.title + '</b><span class="gd-line">' + ch.link.line + '</span></span><span class="gd-arrow">' + ICON.go + '</span></a>'
        : '<div class="gd-cards' + (tracksOf(ch).length > 3 ? ' many' : '') + '">' + tracksOf(ch).map(t => '<button type="button" class="gd-card' + (saved.done[t.id] ? ' done' : '') + '" data-t="' + t.id + '"><span class="gd-ico">' + icon(t) + '<i>' + TICK + '</i></span><b>' + t.title + '</b><span class="gd-line">' + t.line + '</span></button>').join('') + '</div>';
      bar.innerHTML = '<button type="button" class="gd-x" aria-label="Close the guide">×</button><p class="gd-kicker">' + kicker + '</p><h2>' + h2 + '</h2>' + chips + body + '<p class="gd-foot">' + (ch.foot || 'Each takes a few seconds. You do them on the page itself.') + (cfg.extra ? ' <button type="button" class="gd-link" data-extra>' + cfg.extra.label + '</button>' : '') + '</p>';
      const ex = /** @type {HTMLElement} */ (bar.querySelector('[data-extra]')); if (ex) ex.onclick = () => { minimise(); cfg.extra.run(); };
      bar.querySelectorAll('[data-ch]').forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => { chapter = +/** @type {HTMLElement} */ (b).dataset.ch; saved.chapter = chapter; render(); }; });
      const a = /** @type {HTMLElement} */ (bar.querySelector('a.gd-wide')); if (a) a.onclick = () => { try { sessionStorage.setItem(OPEN, a.dataset.open || ''); } catch {} saved.seen = true; save(); };
    } else {
      const b = beat(), nextT = tracksOf(chapters[chapter]).find(t => t !== track && !saved.done[t.id]);
      let msg = '', side = '<button type="button" class="gd-link gd-skip">Skip</button>';
      if (phase === 'setup') { msg = '<p class="gd-wait">Opening ' + track.where.split('› ').pop() + '</p>'; side = ''; }
      else if (phase === 'error') { msg = '<p>' + note + '</p>'; side = '<button type="button" class="gd-btn" data-retry>Try again</button>'; }
      else if (phase === 'praise') { msg = '<p class="gd-ok"><span class="gd-check">' + TICK + '</span>' + b.praise + '</p>'; side = ''; }
      else if (phase === 'end') {
        msg = '<p class="gd-ok"><span class="gd-check">' + TICK + '</span>' + (b.praise || track.praise || 'Done.') + '</p>';
        side = nextT ? '<button type="button" class="gd-btn" data-next="' + nextT.id + '">' + icon(nextT) + nextT.title + ' →</button>' : '<button type="button" class="gd-btn" data-more>More to try →</button>';
      }
      else msg = '<p>' + sayOf(b) + '</p>';
      const live = track.beats.filter(x => !skipped(x)), at = live.indexOf(b), over = phase === 'praise' || phase === 'end';
      bar.innerHTML = '<button type="button" class="gd-menu" title="All things to try" aria-label="All things to try">' + MENU + '</button><span class="gd-now">' + icon(track) + '</span><div class="gd-msg" aria-live="polite"><small><b>' + track.title + '</b> · <button type="button" class="gd-where" title="Show where this is">' + track.where + '</button>'
        + (live.length > 1 && phase !== 'setup' ? '<span class="gd-steps">' + live.map((_, i) => '<i class="' + (i < at || (i === at && over) ? 'past' : i === at ? 'now' : '') + '"></i>').join('') + '</span>' : '') + '</small>' + msg + '</div><div class="gd-side">' + side + '</div><button type="button" class="gd-x" aria-label="Close the guide">×</button>';
      const q = s => /** @type {HTMLElement} */ (bar.querySelector(s));
      q('.gd-menu').onclick = openMenu;
      if (q('.gd-skip')) q('.gd-skip').onclick = () => advance(true);
      if (q('[data-retry]')) q('[data-retry]').onclick = () => start(track.id);
      if (q('[data-next]')) q('[data-next]').onclick = () => start(q('[data-next]').dataset.next);
      if (q('[data-more]')) q('[data-more]').onclick = () => { const i = chapters.findIndex((c, k) => k > chapter && (c.link || doneIn(c) < tracksOf(c).length)); openMenu(i < 0 ? chapter : i); };
      q('.gd-where').onclick = () => { const u = usedEl(); if (u) flash(u, 2200); };
    }
    bar.querySelectorAll('[data-t]').forEach(b => { /** @type {HTMLElement} */ (b).onclick = () => start(/** @type {HTMLElement} */ (b).dataset.t); });
    const x = /** @type {HTMLElement} */ (bar.querySelector('.gd-x')); if (x) x.onclick = minimise;
    place();
  }
  const usedEl = () => track && (typeof track.used === 'function' ? track.used() : $(track.used));
  function openMenu(i){ gen++; stopDot(); if (track && track.leave) track.leave(); track = null; phase = 'idle'; view = 'menu'; if (typeof i === 'number') chapter = i; render(); }
  function minimise(){ gen++; stopDot(); if (track && track.leave) track.leave(); track = null; phase = 'idle'; view = 'pill'; saved.seen = true; save(); hoverTarget = null; render(); }
  addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && view !== 'pill' && !document.body.classList.contains('pane-open')) minimise(); });      // Esc puts the guide away, unless something above it took the key (the demo film) or a download is being framed

  /* ---------- ring: marks one real control, without touching its styles ---------- */
  let flashEl = null, flashUntil = 0, dimUntil = 0;
  function reveal(el){      // bring a control into view: open its panel on a desktop, scroll the page to it on a phone (the bar then floats at the bottom of the screen)
    if (!el) return;
    if (cfg.reveal) cfg.reveal(el);
    if (stage.contains(el)) return;
    if (!phone()) { deskPass(el); setTimeout(() => deskPass(el), 450); return; }      // twice: once the panel has slid open and the scroll has settled
    const pass = () => {      // on a phone the picture pins itself to the top once the page scrolls and the panels pass under it: the control must land below the picture, above the floating bar
      const r = el.getBoundingClientRect(), st = stage.getBoundingClientRect(), top = st.top <= 24 && st.bottom < innerHeight * .7 ? st.bottom + 14 : 70;
      if (r.top < top || r.bottom > innerHeight - 90) scrollBy({top: r.top - top, behavior: calm() ? 'auto' : 'smooth'});
    };
    pass(); setTimeout(pass, 700); setTimeout(pass, 1400);      // again once the picture has pinned and the scroll has settled
  }
  /* the part of a panel the visitor can actually see: its own box, less the sticky "Create and share" card that covers the lower end of the left panel */
  function visibleBand(el){
    const box = el.closest('.controls, .story'); if (!box) return null;
    const b = box.getBoundingClientRect(); let top = Math.max(b.top, 0) + 8, bottom = Math.min(b.bottom, innerHeight) - 8;
    const cue = $('scrollCue'); if (cue && !cue.hidden && box.contains(cue)) { const card = cue.firstElementChild || cue, c = card.getBoundingClientRect(); if (c.height && c.top < bottom) bottom = c.top - 8; }
    return {box, top, bottom};
  }
  function deskPass(el){      // desktop: bring the control into the visible band of its panel, to the middle of it
    const v = visibleBand(el); if (!v) return;
    const r = el.getBoundingClientRect(); if (r.top >= v.top && r.bottom <= v.bottom) return;
    const want = v.top + Math.max(0, (v.bottom - v.top - r.height) / 2);      // centred, but never below the band's top edge for a tall control
    v.box.scrollBy({top: r.top - Math.min(want, v.top + Math.max(0, v.bottom - v.top - r.height)), behavior: calm() ? 'auto' : 'smooth'});
  }
  function covered(el, r){      // is the control's middle hidden behind something that is not part of it (the sticky card, a panel edge)?
    const v = visibleBand(el); if (v && (r.top + r.height / 2 < v.top - 8 || r.top + r.height / 2 > v.bottom + 8)) return true;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(x, y);
    return !!top && !el.contains(top) && !top.contains(el) && !top.closest('.gd-bar, .gd-ring, .gd-dim, .gd-dot');
  }
  function flash(el, ms = 1800){ if (!el) return; reveal(el); flashEl = el; flashUntil = Date.now() + ms; dimUntil = Date.now() + Math.min(ms, 1500); ring.classList.remove('tap'); void ring.offsetWidth; ring.classList.add('tap'); }
  function ringTarget(){
    if (flashEl && Date.now() < flashUntil) return flashEl;
    if (hoverTarget) return hoverTarget();
    if (view !== 'run' || phase !== 'beat') return null;
    const b = beat(); return b && b.target ? b.target(ctx) : null;
  }
  function placeRing(){
    const el = ringTarget();
    if (!shown(el)) { ring.hidden = dim.hidden = true; return; }
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) { ring.hidden = dim.hidden = true; return; }
    if (!stage.contains(el) && !phone() && covered(el, r)) { ring.hidden = dim.hidden = true; return; }      // never ring a place the visitor cannot see
    const pad = 6, round = Math.abs(r.width - r.height) < 6 && r.width < 80, onPic = stage.contains(el) && !el.closest('.mapbar,.v3d-measure,.layerbox,.vf-btns,.gd-bar');
    const box = {left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + 2 * pad) + 'px', height: (r.height + 2 * pad) + 'px'};
    ring.hidden = false; ring.classList.toggle('on-pic', onPic); ring.classList.toggle('round', round); Object.assign(ring.style, box);
    dim.hidden = !(Date.now() < dimUntil) || onPic; dim.classList.toggle('round', round); Object.assign(dim.style, box);
  }
  function stopDot(){ dot.hidden = true; dot.className = 'gd-dot'; }
  function slideDot(el){      // a finger sliding sideways over a picture: "drag here"
    if (calm() || !shown(el)) return; const r = el.getBoundingClientRect();
    dot.hidden = false; dot.className = 'gd-dot orbit'; dot.style.left = (r.left + r.width / 2) + 'px'; dot.style.top = (r.top + r.height * .46) + 'px';
  }

  /* ---------- running a track ---------- */
  async function start(id){
    const g = ++gen; stopDot(); if (track && track.leave && track.id !== id) track.leave();
    track = byId(id); chapter = chapterOf(track); beatIx = 0; view = 'run'; phase = 'setup'; saved.seen = true; saved.chapter = chapter; save(); render();
    const began = Date.now();
    try {
      const u0 = usedEl(), before = u0 && (u0.getAttribute('aria-pressed') || u0.getAttribute('aria-selected') || u0.getAttribute('aria-expanded'));
      if (track.setup) await track.setup(api);
      const u = usedEl();
      if (u && shown(u) && before !== 'true') { flash(u, 1500); await sleep(Math.max(0, 1400 - (Date.now() - began))); }      // "this is the button I just used for you"
      if (g !== gen) return;
      enter(0);
    } catch (e) { if (e.message === 'cancelled' || g !== gen) return; phase = 'error'; note = e.message; render(); }
  }
  function enter(i){
    const b = track.beats[i];
    if (!b) return finish();
    if (skipped(b)) return enter(i + 1);
    beatIx = i; phase = 'beat'; ctx = {t0: Date.now()}; if (b.init) b.init(ctx); lastSay = sayOf(b); render();
    const t = b.target ? b.target(ctx) : null; if (t) { reveal(t); if (!stage.contains(t) || t.closest('.mapbar,.v3d-measure,.layerbox,.vf-btns')) dimUntil = Date.now() + 1100; ring.classList.remove('tap'); void ring.offsetWidth; ring.classList.add('tap'); }
    if (b.demo) b.demo(api, ctx);
    if (b.drag) slideDot(b.drag());
  }
  function advance(skip){
    if (!track || phase !== 'beat') return;
    const b = beat(), g = gen; stopDot();
    if (skip) return enter(beatIx + 1);
    if (!track.beats.slice(beatIx + 1).some(n => !skipped(n))) return finish();
    phase = 'praise'; render();
    setTimeout(() => { if (g === gen && phase === 'praise') enter(beatIx + 1); }, b.quick ? 900 : 1700);
  }
  function finish(){
    stopDot(); saved.done[track.id] = true; save();
    if (!track.beats[beatIx] || skipped(track.beats[beatIx])) beatIx = Math.max(0, track.beats.length - 1);
    phase = 'end'; render();
  }

  /* ---------- where the bar sits ---------- */
  function place(){
    const st = stage.getBoundingClientRect(), framing = document.body.classList.contains('pane-open');
    const t = view === 'run' && phase === 'beat' && beat() && beat().target ? beat().target(ctx) : null;
    const float = phone() && view === 'run' && !!t && shown(t) && !stage.contains(t);      // phone, control below the picture: the bar floats at the bottom of the screen and the page scrolls to the control
    bar.classList.toggle('gd-float', float && !framing); bar.classList.toggle('gd-top', framing);      // while a download is framed the bar moves to the top of the picture, clear of the frame's buttons
    if (float || framing) { bar.style.bottom = ''; return; }
    let top = st.bottom - 6;      // otherwise it clears whatever the page shows low in the picture: the toolbar, a cross-section's caption, the scale bar on phones
    cfg.obstacles().forEach(el => { if (!shown(el)) return; const r = el.getBoundingClientRect(); if (r.height && r.top > st.top + st.height * .55 && r.top < top) top = r.top; });
    bar.style.bottom = (st.bottom - top + 10) + 'px';
  }
  function placeLauncher(){
    const host = cfg.launcherHost(); if (host && host.firstElementChild !== launch) host.insertBefore(launch, host.firstChild);      // first in the row: Guide, then the page's other buttons
    const r = launch.getBoundingClientRect(), seen = shown(launch) && r.bottom > 0 && r.top < innerHeight && r.right > 0 && !phone();
    bar.classList.toggle('gd-has-launch', seen);      // the pill on the picture is only needed where the button in the panel is out of sight
  }

  setInterval(() => {
    const held = !!(cfg.hold && cfg.hold()); bar.classList.toggle('gd-held', held); if (held) { ring.hidden = dim.hidden = true; return; }      // under the demo film: nothing of the guide shows
    placeLauncher(); place(); placeRing();
    if (cfg.onTick) cfg.onTick(api);
    if (view !== 'run' || phase !== 'beat') return;
    const b = beat();
    if (b.drag && !dot.hidden && input.down > ctx.t0 + 200) stopDot();
    let done = false; try { done = b.done(ctx); } catch {}
    if (done) return advance(false);
    const s = sayOf(b); if (s !== lastSay) { lastSay = s; const p = bar.querySelector('.gd-msg p'); if (p && s) p.textContent = s; }
  }, 140);
  addEventListener('resize', () => { place(); placeRing(); });
  addEventListener('scroll', placeRing, {passive: true, capture: true});

  render();
  return api;
}
