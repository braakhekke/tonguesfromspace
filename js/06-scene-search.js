/* =====================================================================
   6. Scene search: for the selected glacier, the clearest summer scene of every year.
      Years without a usable scene cannot be picked.
   ===================================================================== */
let checkGen = 0;              // a newer search (e.g. another glacier) makes older results stale
async function checkYears(){
  const gen = ++checkGen, g = currentGlacier();
  if (g && g.inv && g.inv.id) setTimeout(() => loadBundle(g.inv.id), 1500);      // the terrain of this glacier comes along while the scenes are searched
  state.checked = false; state.available = {}; state.latest = null;
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
  state.available = avail;
  state.checked = true;
  const ok = okYears();
  if (!ok.length) {
    const msg = firstError ? firstError.message : 'Copernicus found no usable summer scene for this glacier.';
    setStatus(msg); showNotice(msg); renderYears(); updateTags(); updateCredits(); renderStory(); if (viewMode === '3d') open3D(); return;
  }
  if (firstError) showNotice('Some years could not be checked: ' + firstError.message);
  const fix = (k, fallback) => { if (!state.available[state[k]]) state[k] = fallback; };
  fix('a', ok[0]); fix('b', ok[ok.length - 1]); fix('from', ok[0]); fix('to', ok[ok.length - 1]); fix('one', ok[ok.length - 1]);
  if (state.a === state.b && ok.length > 1) { state.a = ok[0]; state.b = ok[ok.length - 1]; }
  setStatus(statusLine());
  refreshAll();
}
function statusLine(){
  const ok = okYears(), missing = YEARS.filter(y => !state.available[y] && summerStarted(y));       // the current year is not reported as missing before its summer
  if (!ok.length) return 'No satellite images available.';
  const cloudy = ok.filter(y => !state.available[y].clear);
  const parts = [];            // nothing to report when every year has a clear scene
  if (missing.length) parts.push(`No usable scene for ${missing.join(', ')}.`);
  if (cloudy.length) parts.push(`No fully clear scene in ${cloudy.join(', ')}: the least cloudy one is shown.`);
  if (state.latest && state.available[state.latest.year]) parts.push(`Latest clear-ish scene: ${fmtDate(state.available[state.latest.year].date)}.`);
  const g = currentGlacier(); if (g && g.sceneNote) parts.push(g.sceneNote);
  return parts.join(' ');
}
/* Year labels on the map: year plus the date of the scene */
function updateTags(){
  const sub = y => { const sc = state.available[y]; return sc ? `${fmtDM(sc.date)}${sc.clear ? '' : ', some clouds'}` : 'Sentinel-2'; };
  setTag('tagA', state.a); setTag('tagB', state.b);
  if (!satOn()) { document.querySelector('#tagA small').innerHTML = aerialDesc(state.a); document.querySelector('#tagB small').innerHTML = aerialDesc(state.b); return; }
  tagLine(document.querySelector('#tagA small'), sub(state.a)); tagLine(document.querySelector('#tagB small'), sub(state.b));
}

