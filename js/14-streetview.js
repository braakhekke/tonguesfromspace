/* =====================================================================
   14. Street View: the best panoramas of a glacier (Google)
   ===================================================================== */
/* data/streetview.json (made with scripts/build_streetview.py, chosen by hand) holds, per glacier (inventory id), a few panoramas with the place, the view to open and a title.
   Google allows nothing of Street View to be stored but the panorama ids, so no picture is kept here: the layer puts small blue glass dots on the map, a click opens Google's own
   viewer (the Maps Embed API, free of charge) in a panel on the stage. The public key of that API is TFS_CONFIG.streetViewKey, written by the deploy workflow from the repository
   variable STREETVIEW_EMBED_KEY and restricted to the site's address in the Google Cloud console; without it the layer is not offered. */
const SV_KEY = (window.TFS_CONFIG && window.TFS_CONFIG.streetViewKey) || '';
let svFile = null, svList = [], svMarkers = [], svIndex = -1, svGen = 0;
const loadStreetViewFile = () => svFile || (svFile = fetch(asset('data/streetview.json'), ASSETS['data/streetview.json'] ? undefined : {cache: 'no-cache'}).then(r => r.ok ? r.json() : {}).catch(() => ({})));
const svEmbedUrl = p => 'https://www.google.com/maps/embed/v1/streetview?' + new URLSearchParams({key: SV_KEY, pano: p.pano, heading: p.heading ?? 0, pitch: p.pitch ?? 0, fov: p.fov ?? 90});
const svMapsUrl = p => 'https://www.google.com/maps/@?' + new URLSearchParams({api: 1, map_action: 'pano', pano: p.pano, heading: p.heading ?? 0, pitch: p.pitch ?? 0, fov: p.fov ?? 90});
const svActive = () => !!SV_KEY && !$('svRow').hidden && $('svToggle').checked && viewMode !== '3d';

function drawStreetView(){
  svMarkers.forEach(m => map.removeLayer(m)); svMarkers = [];
  if (!svActive()) return;
  svMarkers = svList.map((p, i) => L.marker([p.lat, p.lng], {
    icon: L.divIcon({className: '', html: `<div class="sv-pin${i === svIndex ? ' sel' : ''}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6]}),
    title: p.title, keyboard: true, zIndexOffset: 400
  }).on('click', () => openStreetView(i)).addTo(map));
}
function openStreetView(i){
  const p = svList[i]; if (!p || !SV_KEY) return;
  svIndex = i;
  $('svTitle').textContent = p.title;
  $('svMeta').textContent = `Street View · ${p.date ? fmtMonth(p.date) : ''}${p.credit ? ' · photo ' + p.credit : ''} · Google`;
  $('svOpen').href = svMapsUrl(p);
  const f = $('svFrame'), url = svEmbedUrl(p); if (f.getAttribute('src') !== url) f.src = url;
  $('svPanel').hidden = false; drawStreetView();
}
const fmtMonth = d => { const [y, m] = d.split('-'); return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}` : y; };
function closeStreetView(){
  svIndex = -1; $('svPanel').hidden = true; $('svFrame').removeAttribute('src'); if (svMarkers.length) drawStreetView();
}
async function refreshStreetView(){          // a glacier was chosen: its panoramas, if it has any
  const gen = ++svGen, g = glacierPicked ? currentGlacier() : null;
  closeStreetView(); svList = [];
  if (SV_KEY && g && g.inv) { const f = await loadStreetViewFile(); if (gen !== svGen) return; svList = (f && f[g.inv.id]) || []; }
  $('svRow').hidden = !svList.length;
  drawStreetView(); updateCredits();
}
$('svToggle').onchange = () => { if (!$('svToggle').checked) closeStreetView(); drawStreetView(); updateCredits(); };
$('svClose').onclick = closeStreetView;
$('svPrev').onclick = () => openStreetView((svIndex + svList.length - 1) % svList.length);
$('svNext').onclick = () => openStreetView((svIndex + 1) % svList.length);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('svPanel').hidden) closeStreetView(); });
refreshStreetView();
