import { needsOutline, loadOutline } from './02-glaciers.js';
import { currentGlacier, OPEN_ON_GLACIER, PLAIN_START, OPEN_3D, glacierPicked, HASH_AT_LOAD } from './04-state.js';
import { updateCredits, updateSight, updateTrailClip, drawOutlines, focusTongue } from './05-map.js';
import { checkYears } from './06-scene-search.js';
import { renderGlacierList, renderYears, renderMode, renderStory, fn, renderOutlineControls, focusSub } from './07-render.js';
import { setStatus, updateBoxes, showOverview } from './08-controls.js';
import { updatePickHint } from './09-phones.js';
import { setView } from './11-view3d.js';
/* =====================================================================
   9. Boot
   ===================================================================== */
export function boot(){
  document.querySelectorAll('[data-fn-slot]').forEach(e => { e.outerHTML = fn(e.dataset.fnSlot); });
  renderGlacierList();
  renderOutlineControls();
  drawOutlines();
  renderMode(); renderYears();
  if (OPEN_ON_GLACIER) {
    focusTongue(false);
    const g = currentGlacier(), k = Number(new URLSearchParams(HASH_AT_LOAD.slice(1)).get('sub'));      // #g=<cap>&sub=<k>: an outlet of the ice cap, as picked on the front page
    if (g.subs && Number.isInteger(k) && g.subs[k]) focusSub(g, k);
  } else showOverview(false);
  updateBoxes(); updateTrailClip(); updateSight();
  renderStory();
  updateCredits();
  if (glacierPicked || REGION.landing !== 'overview') checkYears(); else setStatus('Choose an outlet to compare years.');      // a region that opens on its overview searches scenes only for the outlet that is chosen
  updatePickHint();
  if (PLAIN_START) document.getElementById('loopToggle').checked = true;      // the landing timelapse repeats
  if (OPEN_3D) setView('3d');      // a shared link to the 3D view
}
export const bootGlacier = OPEN_ON_GLACIER ? currentGlacier() : null;
if (needsOutline(bootGlacier)) loadOutline(bootGlacier).then(boot); else boot();      // a link to a glacier waits for the file of its 2023 outline (about 20 to 200 kB)
/* A link pasted into a tab where the page is already open changes only the part after the #: the browser does not reload, so the page starts again from the new link itself.
   (The page's own updates of the address use history.replaceState, which raises no such event.) */
addEventListener('hashchange', () => location.reload());
