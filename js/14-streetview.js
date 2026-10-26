import { ASSETS, asset } from './03-imagery.js';
import { currentGlacier, viewMode, glacierPicked } from './04-state.js';
import { map, updateCredits } from './05-map.js';
import { $ } from './09-phones.js';
import { bundleId } from './11-view3d.js';
// Bridge while other scripts are still classic scripts (delete when none is left): lazy accessors, so a name is readable as soon as the module runs, like a classic script's.
Object.defineProperty(window, 'SV_KEY', { get: () => SV_KEY, configurable: true });
Object.defineProperty(window, 'svFile', { get: () => svFile, set: v => { svFile = v; }, configurable: true });
Object.defineProperty(window, 'svList', { get: () => svList, set: v => { svList = v; }, configurable: true });
Object.defineProperty(window, 'svMarkers', { get: () => svMarkers, set: v => { svMarkers = v; }, configurable: true });
Object.defineProperty(window, 'svIndex', { get: () => svIndex, set: v => { svIndex = v; }, configurable: true });
Object.defineProperty(window, 'svGen', { get: () => svGen, set: v => { svGen = v; }, configurable: true });
Object.defineProperty(window, 'loadStreetViewFile', { get: () => loadStreetViewFile, configurable: true });
Object.defineProperty(window, 'svEmbedUrl', { get: () => svEmbedUrl, configurable: true });
Object.defineProperty(window, 'svMapsUrl', { get: () => svMapsUrl, configurable: true });
Object.defineProperty(window, 'svActive', { get: () => svActive, configurable: true });
Object.defineProperty(window, 'drawStreetView', { get: () => drawStreetView, configurable: true });
Object.defineProperty(window, 'openStreetView', { get: () => openStreetView, configurable: true });
Object.defineProperty(window, 'fmtMonth', { get: () => fmtMonth, configurable: true });
Object.defineProperty(window, 'svFullScreen', { get: () => svFullScreen, configurable: true });
Object.defineProperty(window, 'closeStreetView', { get: () => closeStreetView, configurable: true });
Object.defineProperty(window, 'refreshStreetView', { get: () => refreshStreetView, configurable: true });
// end of bridge
/* =====================================================================
   14. Street View: the best panoramas of a glacier (Google)
   ===================================================================== */
/* data/streetview.json (made with scripts/build_streetview.py, chosen by hand) holds, per glacier (inventory id), a few panoramas with the place, the view to open and a title.
   Google allows nothing of Street View to be stored but the panorama ids, so no picture is kept here: the layer puts small blue camera symbols on the map, a click opens Google's own
   viewer (the Maps Embed API, free of charge) in a panel on the stage. The public key of that API is TFS_CONFIG.streetViewKey, written by the deploy workflow from the repository
   variable STREETVIEW_EMBED_KEY and restricted to the site's address in the Google Cloud console; without it the layer is not offered. */
export const SV_KEY = (window.TFS_CONFIG && window.TFS_CONFIG.streetViewKey) || '';
export let svFile = null, svList = [], svMarkers = [], svIndex = -1, svGen = 0;
export const loadStreetViewFile = () => svFile || (svFile = fetch(asset('data/streetview.json'), ASSETS['data/streetview.json'] ? undefined : {cache: 'no-cache'}).then(r => r.ok ? r.json() : {}).catch(() => ({})));
export const svEmbedUrl = p => 'https://www.google.com/maps/embed/v1/streetview?' + new URLSearchParams({key: SV_KEY, pano: p.pano, heading: p.heading ?? 0, pitch: p.pitch ?? 0, fov: p.fov ?? 90});
export const svMapsUrl = p => 'https://www.google.com/maps/@?' + new URLSearchParams({api: 1, map_action: 'pano', pano: p.pano, heading: p.heading ?? 0, pitch: p.pitch ?? 0, fov: p.fov ?? 90});
export const svActive = () => !!SV_KEY && !$('svRow').hidden && $('svToggle').checked && viewMode !== '3d';

export function drawStreetView(){
  svMarkers.forEach(m => map.removeLayer(m)); svMarkers = [];
  if (!svActive()) return;
  svMarkers = svList.map((p, i) => L.marker([p.lat, p.lng], {
    icon: L.divIcon({className: '', html: `<div class="sv-pin${i === svIndex ? ' sel' : ''}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10]}),
    title: p.title, keyboard: true, zIndexOffset: 400
  }).on('click', () => openStreetView(i)).addTo(map));
}
export function openStreetView(i){
  const p = svList[i]; if (!p || !SV_KEY) return;
  svIndex = i;
  $('svTitle').textContent = p.title;
  $('svMeta').textContent = `Street View · ${p.date ? fmtMonth(p.date) : ''}${p.credit ? ' · photo ' + p.credit : ''} · Google`;
  $('svOpen').href = svMapsUrl(p);
  const f = $('svFrame'), url = svEmbedUrl(p); if (f.getAttribute('src') !== url) f.src = url;
  $('svPanel').hidden = false; $('app').classList.add('sv-on'); drawStreetView();
}
export const fmtMonth = d => { const [y, m] = d.split('-'); return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}` : y; };
export const svFullScreen = on => { $('svPanel').classList.toggle('full', on); $('svFull').setAttribute('aria-pressed', on); $('svFull').setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen'); };
export function closeStreetView(){
  svFullScreen(false); svIndex = -1; $('svPanel').hidden = true; $('app').classList.remove('sv-on'); $('svFrame').removeAttribute('src'); if (svMarkers.length) drawStreetView();
}
export async function refreshStreetView(){          // a glacier was chosen: its panoramas, if it has any
  const gen = ++svGen, g = glacierPicked ? currentGlacier() : null;
  closeStreetView(); svList = [];
  if (SV_KEY && g && FEATURES.streetview) { const f = await loadStreetViewFile(); if (gen !== svGen) return; svList = (f && f[bundleId(g)]) || []; }
  $('svRow').hidden = !svList.length;
  drawStreetView(); updateCredits();
}
$('svToggle').onchange = () => { if (!$('svToggle').checked) closeStreetView(); drawStreetView(); updateCredits(); };
$('svClose').onclick = closeStreetView;
$('svFull').onclick = () => svFullScreen(!$('svPanel').classList.contains('full'));
$('svPrev').onclick = () => openStreetView((svIndex + svList.length - 1) % svList.length);
$('svNext').onclick = () => openStreetView((svIndex + 1) % svList.length);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('svPanel').hidden) { if ($('svPanel').classList.contains('full')) svFullScreen(false); else closeStreetView(); } });
refreshStreetView();
