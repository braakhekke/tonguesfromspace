/* The hero of the landing page (home.html): Grosser Aletsch in 3D, the years 2016 to 2026 in a loop, drag or swipe to turn the view.
   It has nothing to do with the explorer: it uses the renderer alone (viewer3d-core.js) and the data that scripts/build_home_hero.py baked from the explorer's own
   3D view (data/home-hero/: the strip, the ice surface and the satellite picture of every year, stored as the explorer drew them).
   Not started with reduced motion (the poster stays); on a slow connection, "save data" or without WebGL the flight video plays instead. */
import { startViewer } from './viewer3d-core.js';

const $ = id => document.getElementById(id);
const DIR = 'data/home-hero/', HOLD = 1100, HOLD_LAST = 2400;      // milliseconds per year; the last year stays a little longer before the loop starts again
const fig = $('flight'), vid = $('flightVideo'), cv = $('flightCanvas'), fb = $('flPlay'), yearEl = $('flYear'), dateEl = $('flDate');
if (fig && cv && !matchMedia('(prefers-reduced-motion:reduce)').matches) main().catch(e => { console.error('hero', e); fallback(); });

function fallback() {      // the flight video instead of the live view
  fig.classList.remove('loading'); cv.hidden = true; if (yearEl) yearEl.hidden = true;
  vid.loop = true; vid.preload = 'auto'; vid.play().catch(() => {});
  fb.hidden = false; let paused = false;
  const sync = () => { fb.classList.toggle('paused', paused); fb.setAttribute('aria-label', paused ? 'Play the timelapse' : 'Pause the timelapse'); };
  fb.onclick = () => { paused = !paused; if (paused) vid.pause(); else vid.play().catch(() => {}); sync(); }; sync();
}

async function main() {
  const c = navigator.connection || {};
  fig.classList.add('loading');      // until the first picture is on the screen
  if (c.saveData || /(^|-)[23]g$/.test(c.effectiveType || '')) return fallback();
  const [meta, buf] = await Promise.all([fetch(DIR + 'meta.json').then(r => r.json()), fetch(DIR + 'heights.bin').then(r => r.arrayBuffer())]);
  const years = Object.keys(meta.years).map(Number).sort((a, b) => a - b), heights = await parseHeights(buf, years);
  const bitmap = y => fetch(`${DIR}${y}.webp`).then(r => r.blob()).then(createImageBitmap);
  const tex = new Map([[years[0], await bitmap(years[0])]]);
  const {S, nA, nB} = meta, v = startViewer(cv, heights.get(years[0]), tex.get(years[0]), nA, nB, S.up, S.back, S.dist, S.half);
  v.setCam(meta.cam); cv.onwheel = null;      // the wheel scrolls the page, it does not zoom the picture
  cv.style.opacity = 1; fig.classList.remove('loading'); vid.classList.add('off'); $('dragHint').classList.add('on');
  const touched = () => $('dragHint').classList.remove('on');
  cv.addEventListener('pointerdown', touched, {once: true});

  let wantPaused = false, loaded = false, shown = years[0], timer = 0, visible = true;
  const show = y => {
    shown = y; v.setHeights(heights.get(y)); v.setTexture(tex.get(y));
    yearEl.textContent = y; const d = meta.years[y].date; dateEl.textContent = d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}) : '';
  };
  const run = () => {      // one step of the loop: the next year, after its time on the screen
    clearTimeout(timer); if (wantPaused || !loaded || !visible) return;
    const i = years.indexOf(shown), next = years[(i + 1) % years.length];
    timer = setTimeout(() => { show(next); run(); }, shown === years[years.length - 1] ? HOLD_LAST : HOLD);
  };
  const sync = () => { fb.classList.toggle('paused', wantPaused); fb.setAttribute('aria-label', wantPaused ? 'Play the timelapse' : 'Pause the timelapse'); };
  fb.hidden = false; fb.onclick = () => { wantPaused = !wantPaused; sync(); run(); }; sync();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; run(); }).observe(fig);      // nothing runs while the picture is off the screen
  show(years[0]);
  // the other years arrive one after the other; the loop starts when all are there (the button shows "Pause" meanwhile: it will play)
  fig.classList.add('loading');
  for (const y of years.slice(1)) tex.set(y, await bitmap(y));
  fig.classList.remove('loading'); loaded = true; run();
}

async function parseHeights(buf, years) {      // as parseBundle() in js/11-view3d.js: rows are stored as differences, 0.1 m steps
  const dv = new DataView(buf); if (dv.getUint32(0, false) !== 0x54484831) throw new Error('not a hero file');      // "THH1"
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const all = new Int16Array(await new Response(new Blob([new Uint8Array(buf, 8 + hl)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const W = head.nB + 1, n = (head.nA + 1) * W, out = new Map();
  years.forEach((y, k) => {
    const h = new Float32Array(n);
    for (let j = 0; j <= head.nA; j++) { let acc = 0; for (let i = 0; i < W; i++) { acc = (acc + all[k * n + j * W + i]) << 16 >> 16; h[j * W + i] = acc * 0.1 + head.h0; } }
    out.set(y, h);
  });
  return out;
}
