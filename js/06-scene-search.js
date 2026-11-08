import { wire } from './wire.js';
import { FIRST_YEAR, YEARS } from './01-data.js';
import { SEASON, isLandsat, unifyOrbit, summerStarted, findScene, queued, fmtDM, fmtDate, capWaiting, sideStyle } from './03-imagery.js';
import { state, okYears, currentGlacier, viewMode, AUTOPLAY, setAUTOPLAY } from './04-state.js';
import { map, updateCredits, flownYear, oldestAerial, oldestWhat, restoreOldest, satOn, oldestPair, aerialDesc, tagLine, play, layerA, setLayerA, setLayerB, layerB } from './05-map.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'checkGen', { get: () => checkGen, configurable: true });
Object.defineProperty(wire, 'statusLine', { get: () => statusLine, configurable: true });
Object.defineProperty(wire, 'updateTags', { get: () => updateTags, configurable: true });
/* =====================================================================
   6. Scene search: for the selected glacier, the clearest summer scene of every year.
      Years without a usable scene cannot be picked.
   ===================================================================== */
export let checkGen = 0;              // a newer search (e.g. another glacier) makes older results stale
export async function checkYears(){
  const gen = ++checkGen, g = currentGlacier();
  state.checked = false; state.available = {}; state.latest = null; restoreOldest();
  if (viewMode === '3d') wire.open3D();      // the 3D view of the old glacier goes and waits for the search
  [layerA, layerB].forEach(l => l && map.removeLayer(l)); setLayerA(setLayerB(null));
  wire.renderYears(); updateTags();
  /** @type {any} */
  let firstError = null;      // the first error of the year searches; assigned inside callbacks
  let done = 0;
  wire.setStatus(`Finding the clearest summer scene of each year (0 of ${YEARS.length})…`);
  const avail = {};
  await Promise.all(YEARS.map(y => queued(() => findScene(g, y))
    .then(sc => { avail[y] = sc; }, e => { avail[y] = null; firstError = firstError || e; })
    .finally(() => { if (gen === checkGen) wire.setStatus(`Finding the clearest summer scene of each year (${++done} of ${YEARS.length})…`); })));
  if (gen !== checkGen) return;
  if (SEASON.oneOrbit) unifyOrbit(g, avail);      // Iceland: the same orbit for all years where it can be
  state.available = avail;
  state.checked = true;
  const ok = okYears();
  if (!ok.length) {
    const msg = firstError ? firstError.message : 'Copernicus found no usable summer scene for this glacier.';
    wire.setStatus(msg); wire.showNotice(msg); wire.renderYears(); updateTags(); updateCredits(); wire.renderStory(); if (viewMode === '3d') wire.open3D(); return;
  }
  if (firstError) wire.showNotice('Some years could not be checked: ' + firstError.message);
  const fix = (k, fallback) => { if (!state.available[state[k]]) state[k] = fallback;  };
  const start = ok.find(y => y >= FIRST_YEAR) || ok[0];      // the pictures open on the Sentinel-2 years; the Landsat years before them are one click away
  fix('a', start); fix('b', ok[ok.length - 1]); fix('from', start); fix('to', ok[ok.length - 1]); fix('one', ok[ok.length - 1]);
  if (state.a === state.b && ok.length > 1) { state.a = start; state.b = ok[ok.length - 1]; }
  wire.setStatus(statusLine());
  wire.refreshAll();
  if (AUTOPLAY) { setAUTOPLAY(false); if (state.mode === 'timelapse' && !state.playing && !wire.teaserOpen) {
    if (viewMode === '3d' && !(wire.v3dCtx && wire.v3dCtx.S)) {      // the 3D view is still being built: its strip pictures are what plays, so wait until it is there
      const t0 = Date.now(), start = () => { if (state.playing || viewMode !== '3d') return; if (wire.v3dCtx && wire.v3dCtx.S) play(); else if (Date.now() - t0 < 60000) setTimeout(start, 300); };
      start();
    } else play();
  } }      // the opening timelapse starts by itself (not under the teaser film, not after a click)
}
export function statusLine(){
  const lt = state.latest, latestLine = lt && state.available[lt.year] && state.mode !== 'timelapse' ? `Latest clear-ish scene: ${fmtDate(state.available[lt.year].date)}.` : '';      // the chosen Latest is named, except in a timelapse (it has none)
  const oa = state.oldestAerial && oldestAerial.get(state.glacier);
  if (oa && state.mode === 'compare') return `${state.oldestSide === 'b' ? 'Second' : 'First'} image: the oldest aerial image, ${oldestWhat(oa)}. No Sentinel-2 picture on that side.` + (latestLine ? ' ' + latestLine : '');
  if (oa) return `Oldest aerial image: ${oldestWhat(oa)}. No Sentinel-2 picture.`;
  const normal = y => lt && lt.year === y ? lt.saved : state.available[y];      // the Latest scene stands in for its year's scene: the counts below use the year's own
  const ok = okYears().filter(normal), expected = YEARS.filter(summerStarted), missing = expected.filter(y => !normal(y));       // the current year is not counted before its summer
  if (!ok.length) return 'No satellite images available.';
  const parts = [];
  parts.push(`Status: scenes for ${ok.length}/${expected.length} years.`);
  if (missing.length) parts.push(`No usable scene for ${missing.join(', ')}.`);
  const ls = ok.filter(y => isLandsat(normal(y)));
  if (ls.length) parts.push(`${ls.length} Landsat picture${ls.length > 1 ? 's' : ''} (${ls[0]}–${ls[ls.length - 1]}, 30 m).`);
  if (latestLine) parts.push(latestLine);
  const g = currentGlacier(); if (g && g.sceneNote) parts.push(g.sceneNote);
  if ([...capWaiting].some(ov => ov._map)) parts.push('Showing a 40 m preview of the ice cap; zoom in for the 10 m picture.');      // a whole ice cap on a computer: the 10 m tiles load when the map is zoomed in (capCheckFine)
  return parts.join(' ');
}
/* Year labels on the map: year plus the date of the scene */
export function updateTags(){
  const sub = y => { const sc = state.available[y]; return sc ? `${sc.latest ? 'Latest, ' : ''}${fmtDM(sc.date)}${sc.clear ? '' : ', some clouds'}` : 'Sentinel-2'; };
  const scA = state.available[state.a], scB = state.available[state.b];      // the line under a year names its satellite (Landsat before 2016)
  wire.setTag('tagA', state.a); wire.setTag('tagB', state.b);
  if (!satOn()) { document.querySelector('#tagA small').innerHTML = aerialDesc(state.a); document.querySelector('#tagB small').innerHTML = aerialDesc(state.b); return; }
  tagLine(document.querySelector('#tagA small'), sub(state.a), scA); tagLine(document.querySelector('#tagB small'), sub(state.b), scB, sideStyle(1));
  if (oldestPair()) { const T = state.oldestSide === 'b' ? 'tagB' : 'tagA'; wire.setTag(T, flownYear(currentGlacier(), state.oldestAerial) || state.oldestAerial); document.querySelector('#' + T + ' small').innerHTML = aerialDesc(state.oldestAerial); }
}
