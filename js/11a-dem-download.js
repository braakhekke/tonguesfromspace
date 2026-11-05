import { wire } from './wire.js';
import { $ } from './01-data.js';
import { state, currentGlacier, viewMode } from './04-state.js';
import { loadBundle, bundleId } from './11-view3d.js';
import { closeOtherSharePanes } from './07-render.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'syncDemTile', { get: () => syncDemTile, configurable: true });
/* =====================================================================
   11a. Elevation-model download (step 3, 3D view only)
        The ice surface of one year as GeoTIFF, ESRI ASCII grid or XYZ, from the terrain file the 3D view has loaded; the file formats are in js/dem-export.js (window.DEM, shared with the field notes).
        Only the glaciers with yearly Swiss surfaces (`yearly.swiss` in the terrain file) have it: heights are swissALTI3D-based and the coordinates are LV95.
   ===================================================================== */
const DEM = /** @type {any} */ (window).DEM;      // the classic script js/dem-export.js
let cur = null, gen = 0;      // cur: the parsed file with the LV95 position of every node; gen: keeps a slow answer for an old glacier from changing the tile
async function surfacesOf(g){
  const id = bundleId(g); if (cur && cur.id === id) return cur;
  const b = await loadBundle(id); if (!(b && b.surfaces && b.yearly && b.yearly.swiss)) return null;
  return (cur = {id, b, nd: DEM.nodes(b)});
}
const kindOf = (c, y) => (c.b.yearly.kind || [])[c.b.yearly.years.indexOf(y)], dateOf = (c, y) => (c.b.yearly.dates || [])[c.b.yearly.years.indexOf(y)];
function note(c){
  const y = +$('demYear').value, k = kindOf(c, y), dt = dateOf(c, y);
  $('demNote').innerHTML = `${y}: ${k || 'surface'}${dt ? ', the surface on ' + dt : ''}. ${DEM.FORMAT_TEXT[$('demFmt').value]} Heights in metres above sea level as in swissALTI3D, coordinates LV95 (EPSG:2056). A model, not a measurement, except on the days and cells a survey covers. For non-commercial use; how it was made and the licences: <a href="provenance.html?id=${c.id}" target="_blank" rel="noopener">field notes</a>.`;
}
export async function syncDemTile(){            // called when the 3D view opens or closes (open3D, close3D): the tile shows in 3D for a glacier that has yearly surfaces
  const btn = $('demBtn'), run = ++gen, g = viewMode === '3d' ? currentGlacier() : null, c = g ? await surfacesOf(g).catch(() => null) : null;
  if (run !== gen) return;
  const tip = 'The ice surface of a year as a file for GIS (GeoTIFF, ASCII grid or XYZ)';
  btn.disabled = !c; btn.title = c ? tip : tip + '. Available in the 3D view of a glacier with yearly surfaces.';      // always in place; it works where the surfaces exist
  if (!c) { $('demBox').hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
  const years = c.b.yearly.years, keep = +$('demYear').value;
  if (!years.includes(keep) || $('demYear').dataset.id !== c.id) {
    $('demYear').innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join(''); $('demYear').dataset.id = c.id;
    const want = state.mode === 'compare' ? state.b : state.mode === 'single' ? state.one : years[years.length - 2];
    $('demYear').value = years.includes(want) ? want : years[years.length - 2] || years[0];
  }
  if (!$('demFmt').options.length) $('demFmt').innerHTML = Object.entries(DEM.FORMATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  note(c);
}
$('demBtn').onclick = () => { const box = $('demBox'), open = box.hidden; if (open) closeOtherSharePanes('demBox'); box.hidden = !open; $('demBtn').setAttribute('aria-expanded', open); $('demMsg').textContent = ''; };
$('demYear').onchange = $('demFmt').onchange = () => { if (cur) note(cur); };
$('demGo').onclick = async () => {
  const g = currentGlacier(), btn = $('demGo'), msg = $('demMsg'); btn.disabled = true; msg.textContent = 'Preparing…';
  try {
    const c = await surfacesOf(g); if (!c) throw new Error('no yearly surfaces for this glacier');
    const y = +$('demYear').value, f = $('demFmt').value, o = DEM.make({surf: c.b.surfaces, nd: c.nd}, y, f, DEM.credit(g.name, y, kindOf(c, y), dateOf(c, y), c.id)), name = DEM.fileName(c.id, y, o.ext);
    DEM.save(o.blob, name); msg.textContent = `Saved ${name} (${(o.blob.size / 1048576).toFixed(1)} MB${f === 'xyz' ? '' : ', cells of ' + Math.round(c.nd.cell) + ' m'}).`;
  } catch (e) { console.error(e); msg.textContent = 'The file could not be made: ' + e.message; }
  btn.disabled = false;
};
