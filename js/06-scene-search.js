/* =====================================================================
   6. Scene search: for the selected glacier, the clearest summer scene of every year.
      Years without a usable scene cannot be picked.
   ===================================================================== */
let checkGen = 0;              // a newer search (e.g. another glacier) makes older results stale
async function checkYears(){
  const gen = ++checkGen, g = currentGlacier();
  if (g && FEATURES.view3d) setTimeout(() => loadBundle(bundleId(g)), 1500);      // the terrain of this glacier comes along while the scenes are searched
  state.checked = false; state.available = {}; state.latest = null; restoreOldest();
  if (viewMode === '3d') open3D();      // the 3D view of the old glacier goes and waits for the search
  [layerA, layerB].forEach(l => l && map.removeLayer(l)); layerA = layerB = null;
  renderYears(); updateTags();
  /** @type {any} */
  let firstError = null;      // the first error of the year searches; assigned inside callbacks
  let done = 0;
  setStatus(`Finding the clearest summer scene of each year (0 of ${YEARS.length})…`);
  const avail = {};
  await Promise.all(YEARS.map(y => queued(() => findScene(g, y))
    .then(sc => { avail[y] = sc; }, e => { avail[y] = null; firstError = firstError || e; })
    .finally(() => { if (gen === checkGen) setStatus(`Finding the clearest summer scene of each year (${++done} of ${YEARS.length})…`); })));
  if (gen !== checkGen) return;
  if (SEASON.oneOrbit) unifyOrbit(g, avail);      // Iceland: the same orbit for all years where it can be
  state.available = avail;
  state.checked = true;
  const ok = okYears();
  if (!ok.length) {
    const msg = firstError ? firstError.message : 'Copernicus found no usable summer scene for this glacier.';
    setStatus(msg); showNotice(msg); renderYears(); updateTags(); updateCredits(); renderStory(); if (viewMode === '3d') open3D(); return;
  }
  if (firstError) showNotice('Some years could not be checked: ' + firstError.message);
  const fix = (k, fallback) => { if (!state.available[state[k]]) state[k] = fallback;  };
  const start = ok.find(y => y >= FIRST_YEAR) || ok[0];      // the pictures open on the Sentinel-2 years; the Landsat years before them are one click away
  fix('a', start); fix('b', ok[ok.length - 1]); fix('from', start); fix('to', ok[ok.length - 1]); fix('one', ok[ok.length - 1]);
  if (state.a === state.b && ok.length > 1) { state.a = start; state.b = ok[ok.length - 1]; }
  setStatus(statusLine());
  refreshAll();
  if (AUTOPLAY) { AUTOPLAY = false; if (state.mode === 'timelapse' && !state.playing && !teaserOpen) {
    if (viewMode === '3d' && !(v3dCtx && v3dCtx.S)) {      // the 3D view is still being built: its strip pictures are what plays, so wait until it is there
      const t0 = Date.now(), start = () => { if (state.playing || viewMode !== '3d') return; if (v3dCtx && v3dCtx.S) play(); else if (Date.now() - t0 < 60000) setTimeout(start, 300); };
      start();
    } else play();
  } }      // the opening timelapse starts by itself (not under the teaser film, not after a click)
}
function statusLine(){
  const lt = state.latest, latestLine = lt && state.available[lt.year] && state.mode !== 'timelapse' && viewMode !== '3d' ? `Latest clear-ish scene: ${fmtDate(state.available[lt.year].date)}.` : '';      // the chosen Latest is named, except in a timelapse and in 3D (neither has it)
  const oa = state.oldestAerial && oldestAerial.get(state.glacier);
  if (oa && state.mode === 'compare') return `First image: the oldest aerial image, ${oldestWhat(oa)}. No Sentinel-2 picture on that side.` + (latestLine ? ' ' + latestLine : '');
  if (oa) return `Oldest aerial image: ${oldestWhat(oa)}. No Sentinel-2 picture.`;
  const normal = y => lt && lt.year === y ? lt.saved : state.available[y];      // the Latest scene stands in for its year's scene: the counts below use the year's own
  const ok = okYears().filter(normal), expected = YEARS.filter(summerStarted), missing = expected.filter(y => !normal(y));       // the current year is not counted before its summer
  if (!ok.length) return 'No satellite images available.';
  const cloudy = ok.filter(y => !normal(y).clear), parts = [];
  parts.push(`Scenes found for ${ok.length} of ${expected.length} years${cloudy.length ? `, ${cloudy.length} with some clouds (dashed)` : ''}.`);
  if (missing.length) parts.push(`No usable scene for ${missing.join(', ')}.`);
  const ls = ok.filter(y => isLandsat(normal(y))), s2 = ok.filter(y => !isLandsat(normal(y)));      // Landsat years (Iceland, before 2016) have no orbit
  if (ls.length) parts.push(`${ls.length} Landsat picture${ls.length > 1 ? 's' : ''} (${ls[0]}–${ls[ls.length - 1]}, 30 m).`);
  const byOrbit = {}; s2.forEach(y => { const o = normal(y).orbit; if (o) (byOrbit[o] = byOrbit[o] || []).push(y); });
  const orbits = Object.keys(byOrbit).sort();
  if (orbits.length === 1 && byOrbit[orbits[0]].length === s2.length) parts.push(`Orbit ${orbits[0]} for all Sentinel-2 years.`);
  else if (orbits.length) parts.push('Orbits: ' + orbits.map(o => `${o} (${byOrbit[o].join(', ')})`).join('; ') + '.');
  if (latestLine) parts.push(latestLine);
  const g = currentGlacier(); if (g && g.sceneNote) parts.push(g.sceneNote);
  return parts.join(' ');
}
/* Year labels on the map: year plus the date of the scene */
function updateTags(){
  const sub = y => { const sc = state.available[y]; return sc ? `${fmtDM(sc.date)}${sc.clear ? '' : ', some clouds'}` : 'Sentinel-2'; };
  const scA = state.available[state.a], scB = state.available[state.b];      // the line under a year names its satellite (Landsat before 2016)
  setTag('tagA', state.a); setTag('tagB', state.b);
  if (!satOn()) { document.querySelector('#tagA small').innerHTML = aerialDesc(state.a); document.querySelector('#tagB small').innerHTML = aerialDesc(state.b); return; }
  tagLine(document.querySelector('#tagA small'), sub(state.a), scA); tagLine(document.querySelector('#tagB small'), sub(state.b), scB);
  if (oldestPair()) { setTag('tagA', flownYear(currentGlacier(), state.oldestAerial) || state.oldestAerial); document.querySelector('#tagA small').innerHTML = aerialDesc(state.oldestAerial); }
}

