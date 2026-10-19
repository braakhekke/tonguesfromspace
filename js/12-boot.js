/* =====================================================================
   9. Boot
   ===================================================================== */
function boot(){
  document.querySelectorAll('[data-fn-slot]').forEach(e => { e.outerHTML = fn(e.dataset.fnSlot); });
  renderGlacierList();
  renderOutlineControls();
  drawOutlines();
  renderMode(); renderYears();
  if (OPEN_ON_GLACIER) focusTongue(false); else showOverview(false);
  updateBoxes(); updateTrailClip(); updateSight();
  renderStory();
  updateCredits();
  if (glacierPicked || REGION.landing !== 'overview') checkYears(); else setStatus('Choose an outlet to compare years.');      // a region that opens on its overview searches scenes only for the outlet that is chosen
  updatePickHint();
  if (PLAIN_START) document.getElementById('loopToggle').checked = true;      // the landing timelapse repeats
  if (OPEN_3D) setView('3d');      // a shared link to the 3D view
}
const bootGlacier = OPEN_ON_GLACIER ? currentGlacier() : null;
if (needsOutline(bootGlacier)) loadOutline(bootGlacier).then(boot); else boot();      // a link to a glacier waits for the file of its 2023 outline (about 20 to 200 kB)
/* A link pasted into a tab where the page is already open changes only the part after the #: the browser does not reload, so the page starts again from the new link itself.
   (The page's own updates of the address use history.replaceState, which raises no such event.) */
addEventListener('hashchange', () => location.reload());
