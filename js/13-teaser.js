/* =====================================================================
   13. Teaser film: plays over the page at the first visit
   ===================================================================== */
/* A film of about a minute (teaser/, made by scripts/make_teaser.py from the page itself): timelapse, compare, 3D, old photographs, the downloads and the figures.
   It plays once, on the first visit to the plain address (no link to a glacier, no hash), muted, over the page while the page loads behind it. Skip, Esc or the end leave it.
   Not for people who asked for less motion or less data, On portrait screens the film is shown in the middle, just under full width. "Watch the teaser" in the left panel and the link #teaser play it again. */
const TEASER_KEY = 'tfs-teaser-seen';
const teaserSeen = () => { try { return !!localStorage.getItem(TEASER_KEY); } catch { return false; } };
const teaserMarkSeen = () => { try { localStorage.setItem(TEASER_KEY, '1'); } catch {} };
function teaserWanted(){
  const c = navigator.connection || {};
  if (location.hash === '#teaser') return true;
  return !location.hash && !teaserSeen() && !matchMedia('(prefers-reduced-motion: reduce)').matches && !c.saveData && !/(^|-)2g$/.test(c.effectiveType || '');
}
let teaserOpen = false;
function openTeaser(auto){
  if (teaserOpen) return;
  const base = 'teaser/teaser-wide', before = document.activeElement;
  teaserOpen = true;
  const box = document.createElement('div'); box.className = 'teaser'; box.id = 'teaser'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Teaser film: Tongues from Space');
  box.innerHTML = `<video muted playsinline preload="auto" poster="${asset(base + '-poster.jpg')}" aria-label="Satellite timelapses, a before and after slider, 3D terrain, historic photographs, downloads and glacier figures of the ten largest Swiss glaciers">
      <source src="${asset(base + '.mp4')}" type="video/mp4"><source src="${asset(base + '.webm')}" type="video/webm"></video>
    <button type="button" class="teaser-skip">Skip</button><div class="teaser-bar" aria-hidden="true"><i></i></div>
    <div class="teaser-end" hidden><button type="button" class="teaser-go">Start exploring</button><button type="button" class="teaser-again">Watch again</button></div>`;
  const v = box.querySelector('video'), bar = box.querySelector('.teaser-bar i'), end = box.querySelector('.teaser-end'), skip = box.querySelector('.teaser-skip');
  let gone = false, stall = 0;
  const close = () => {
    if (gone) return; gone = true; teaserOpen = false; clearTimeout(stall); teaserMarkSeen(); v.pause();
    document.removeEventListener('keydown', key, true); box.classList.remove('on'); document.body.classList.remove('teaser-on');
    setTimeout(() => box.remove(), 500); if (before && before.focus) try { before.focus({preventScroll: true}); } catch {}
  };
  const abort = () => { gone = true; teaserOpen = false; clearTimeout(stall); document.removeEventListener('keydown', key, true); document.body.classList.remove('teaser-on'); box.remove(); };      // could not play (autoplay refused, no codec, slow): the page is simply there, and the film is offered again next time
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === ' ' && document.activeElement === document.body) { e.preventDefault(); v.paused ? v.play() : v.pause(); } };
  document.addEventListener('keydown', key, true);
  v.addEventListener('timeupdate', () => { if (v.duration) bar.style.width = (v.currentTime / v.duration * 100) + '%'; });
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
const teaserBtn = $('teaserBtn'); if (teaserBtn) teaserBtn.onclick = () => openTeaser(false);
if (teaserWanted()) openTeaser(location.hash !== '#teaser');
