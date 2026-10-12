/* =====================================================================
   9. Boot
   ===================================================================== */
function boot(){
  document.querySelectorAll('[data-fn-slot]').forEach(e => { e.outerHTML = fn(e.dataset.fnSlot); });
  renderGlacierList();
  renderOutlineControls();
  drawOutlines();
  renderMode(); renderYears();
  if (OPEN_ON_GLACIER) focusTongue(false); else showSwitzerland(false);
  updateBoxes(); updateTrailClip(); updateSight();
  renderStory();
  updateCredits();
  checkYears();
  updatePickHint();
  if (OPEN_3D) setView('3d');      // a shared link to the 3D view
}
const bootGlacier = OPEN_ON_GLACIER ? currentGlacier() : null;
if (needsOutline(bootGlacier)) loadOutline(bootGlacier).then(boot); else boot();      // a link to a glacier waits for the file of its 2023 outline (about 20 to 200 kB)
