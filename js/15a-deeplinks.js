import { HASH_AT_LOAD } from './04-state.js';
import { v3d, v3dCtx, v3dBusy } from './11-view3d.js';
/* =====================================================================
   15a. Deep links from the front page: #storytool=depth | history | share
   The "Pick a way in" cards of home.html open the studio with the tool of their clip already on:
   depth = the cross-section tool of the 3D view (the visitor draws the line), history = the old photographs on the 3D view, share = the Create and share step.
   ===================================================================== */
const tool = new URLSearchParams(HASH_AT_LOAD.slice(1)).get('storytool');
if (tool === 'depth' || tool === 'history') {
  const launch = setInterval(() => {
    if (!v3d || !v3dCtx || v3dBusy) return;
    if (tool === 'history' && !v3dCtx.photos) return;
    if (tool === 'depth' && (document.getElementById('v3mSect').hidden)) return;
    clearInterval(launch);
    if (tool === 'depth') { if (document.getElementById('v3mSect').getAttribute('aria-pressed') !== 'true') document.getElementById('v3mSect').click(); }
    else { const t = /** @type {HTMLInputElement} */ (document.getElementById('l3Photos')); t.checked = true; t.dispatchEvent(new Event('change')); }
  }, 500);
  setTimeout(() => clearInterval(launch), 60000);
}
if (tool === 'share') setTimeout(() => { const g = document.getElementById('shareGroup'); if (g) g.scrollIntoView({ block: 'start' }); }, 1500);
