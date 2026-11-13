import { wire } from './wire.js';
import { asset } from './03-imagery.js';
import { HASH_AT_LOAD } from './04-state.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'teaserOpen', { get: () => teaserOpen, configurable: true });
/* =====================================================================
   13. Teaser film: plays over the page at the first visit
   ===================================================================== */
/* A film of about a minute and a half (teaser/, made by scripts/make_teaser.py from the page itself): timelapse, compare, 3D, old photographs, a cross-section, the field notes, more spatial data, glacier sizes, the downloads and the figures.
   It plays once, on the first visit to the plain address (no link to a glacier, no hash), muted, over the page while the page loads behind it. Skip, Esc or the end leave it.
   Not for people who asked for less motion or less data, On portrait screens the film is shown in the middle, just under full width. "Watch the demo film" in the guide's menu (js/15-guide.js) and the link #teaser play it again. */
export const TEASER_KEY = 'tfs-teaser-seen';
export const teaserSeen = () => { try { return !!localStorage.getItem(TEASER_KEY); } catch { return false; } };
export const teaserMarkSeen = () => { try { localStorage.setItem(TEASER_KEY, '1'); } catch {} };
export function teaserWanted(){
  /** @type {any} */
  const c = /** @type {any} */ (navigator).connection || {};
  if (HASH_AT_LOAD === '#teaser') return true;
  return !HASH_AT_LOAD && !teaserSeen() && !matchMedia('(prefers-reduced-motion: reduce)').matches && !c.saveData && !/(^|-)2g$/.test(c.effectiveType || '');
}
export let teaserOpen = false;
export function openTeaser(auto){
  if (teaserOpen) return;
  const base = 'teaser/teaser-wide-new', before = /** @type {any} */ (document.activeElement);
  teaserOpen = true;
  const box = document.createElement('div'); box.className = 'teaser'; box.id = 'teaser'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Demo film: Tongues from Space');
  box.innerHTML = `<div class="teaser-stage"><video muted playsinline preload="auto" poster="${asset(base + '-poster.jpg')}" aria-label="Satellite timelapses, a before and after slider, 3D terrain, historic photographs, a cross-section through the ice, field notes, more spatial data, glacier sizes on your city, downloads and glacier figures of the ten largest Swiss glaciers">
      <source src="${asset(base + '.mp4')}" type="video/mp4"><source src="${asset(base + '.webm')}" type="video/webm"></video>
      <div class="teaser-ctl"><button type="button" class="teaser-pp" aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="pp-play" d="M7 4.5v15l12-7.5z"/><path class="pp-pause" d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button><span class="teaser-time">0:00 / 0:00</span><div class="teaser-track" role="slider" tabindex="0" aria-label="Position in the film" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div></div>
    <button type="button" class="teaser-skip">Skip</button><div class="teaser-bar" aria-hidden="true"><i></i></div>
    <div class="teaser-end" hidden><button type="button" class="teaser-go">Start exploring</button><button type="button" class="teaser-again">Watch again</button></div>`;
  const v = box.querySelector('video'), pp = box.querySelector('.teaser-pp'), track = box.querySelector('.teaser-track'), fill = track.querySelector('i'), clock = box.querySelector('.teaser-time'), bar = box.querySelector('.teaser-bar i'), end = box.querySelector('.teaser-end'), skip = box.querySelector('.teaser-skip');
  let gone = false, stall = 0;
  const close = () => {
    if (gone) return; gone = true; teaserOpen = false; clearTimeout(stall); teaserMarkSeen(); v.pause();
    document.removeEventListener('keydown', key, true); box.classList.remove('on'); document.body.classList.remove('teaser-on');
    setTimeout(() => box.remove(), 500); if (before && before.focus) try { before.focus({preventScroll: true}); } catch {}
  };
  const abort = () => { gone = true; teaserOpen = false; clearTimeout(stall); document.removeEventListener('keydown', key, true); document.body.classList.remove('teaser-on'); box.remove(); };      // could not play (autoplay refused, no codec, slow): the page is simply there, and the film is offered again next time
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === ' ' && document.activeElement === document.body) { e.preventDefault(); v.paused ? v.play() : v.pause(); } };
  document.addEventListener('keydown', key, true);
  const mmss = t => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const seek = t => { if (v.duration) { v.currentTime = Math.min(Math.max(t, 0), v.duration); end.hidden = true; } };
  const shown = () => { const f = v.duration ? v.currentTime / v.duration * 100 : 0; bar.style.width = fill.style.width = f + '%'; clock.textContent = mmss(v.currentTime) + ' / ' + mmss(v.duration); track.setAttribute('aria-valuenow', String(Math.round(f))); };
  const state = () => { const playing = !v.paused && !v.ended; box.classList.toggle('paused', !playing); pp.setAttribute('aria-label', playing ? 'Pause' : 'Play'); };
  v.addEventListener('timeupdate', shown); v.addEventListener('loadedmetadata', shown); v.addEventListener('play', state); v.addEventListener('pause', state); v.addEventListener('ended', state);
  pp.onclick = () => { if (v.ended) { seek(0); v.play(); } else v.paused ? v.play() : v.pause(); };
  const scrub = e => { const r = track.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * v.duration); };
  track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); scrub(e); });
  track.addEventListener('pointermove', e => { if (track.hasPointerCapture(e.pointerId)) scrub(e); });
  track.addEventListener('keydown', e => { const d = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0; if (d) { e.preventDefault(); e.stopPropagation(); seek(v.currentTime + d); } });
  v.addEventListener('playing', () => { clearTimeout(stall); end.hidden = true; if (auto) teaserMarkSeen(); });
  v.addEventListener('ended', () => { end.hidden = false; end.querySelector('.teaser-go').focus({preventScroll: true}); });
  v.addEventListener('error', () => { if (auto) abort(); else { v.controls = true; } });
  v.addEventListener('click', () => { if (!v.ended) v.paused ? v.play() : v.pause(); });
  skip.onclick = close; box.querySelector('.teaser-go').onclick = close;
  box.querySelector('.teaser-again').onclick = () => { end.hidden = true; v.currentTime = 0; v.play(); };
  document.body.appendChild(box); document.body.classList.add('teaser-on'); skip.focus({preventScroll: true});
  requestAnimationFrame(() => box.classList.add('on'));
  const p = v.play(); if (p && p.catch) p.catch(() => { if (auto) abort(); else v.controls = true; });
  if (auto) stall = setTimeout(() => { if (v.paused || v.readyState < 3) abort(); }, 6000);      // a slow connection: no film is better than a wait
}
if (teaserWanted()) openTeaser(HASH_AT_LOAD !== '#teaser');
