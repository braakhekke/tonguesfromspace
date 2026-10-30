import { wire } from './wire.js';
import { FIRST_YEAR, YEARS, LANDSAT_YEARS } from './01-data.js';
import { GLACIERS } from './02-glaciers.js';
import { prefs } from './03-imagery.js';
// registered for the files below it in the load order (see wire.js)
Object.defineProperty(wire, 'currentGlacier', { get: () => currentGlacier, configurable: true });
Object.defineProperty(wire, 'state', { get: () => state, configurable: true });
/* =====================================================================
   4. State
   ===================================================================== */
export let viewMode = 'map';      // 'map' or '3d': what the stage shows. The panel (mode, years, colours) and the download pane serve both
export const state = {
  glacier: (GLACIERS.find(g => g.id === REGION.landingGlacier) || GLACIERS[0]).id, mode: 'single',          // new visitors start with one image, the newest year
  a: null, b: null, from: null, to: null, one: null,
  split: 0.5, available: {}, latest: null, oldestAerial: null, oldestSaved: null, checked: false,   // available[year] = chosen scene {date, cloud, snow, clear} or null
  frame: 0, playing: false, timer: null,
  style: ({ false: 'false1', parece: 'false2' }[prefs.style]) || (['false1', 'false2', 'false3'].includes(prefs.style) ? prefs.style : 'natural')     // old saved names: false, parece
};
export let HASH_TAB = null;            // a shared link can name the tab of the right panel: discover (or fun), stats or switzerland
export let OPEN_ON_GLACIER = false;    // a shared link names a glacier: open there instead of the Switzerland overview
export let AUTOPLAY = false;           // the plain address opens on a timelapse that starts by itself, once the scenes are found
export const HASH_AT_LOAD = location.hash;      // the address as the visitor opened it: the landing page writes its own state into the hash while it boots
export let PLAIN_START = false;        // the plain address: the landing page is the 3D timelapse of the biggest glacier
export let OPEN_3D = false;            // a shared link asks for the 3D view
export let glacierPicked = false;      // set from OPEN_ON_GLACIER after the hash is read; false until a glacier is chosen
(function readHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  if (GLACIERS.some(g => g.id === p.get('g'))) { state.glacier = p.get('g'); OPEN_ON_GLACIER = true; }
  if (!OPEN_ON_GLACIER && REGION.landing === 'glacier3d') { OPEN_ON_GLACIER = true; state.mode = 'timelapse'; AUTOPLAY = !matchMedia('(prefers-reduced-motion: reduce)').matches; PLAIN_START = true;
    if (FEATURES.swisstopo) { prefs.mosaic = false; prefs.alti = true; }      // the landing view: swisstopo hillshade as the base map (the base maps start afresh at every visit) ...
    if (typeof prefs.imgOpacity !== 'number' && FEATURES.swisstopo) prefs.imgOpacity = 0.8;      // ... showing through the satellite picture a little, and the peak names on, unless the visitor chose otherwise before
    if (typeof prefs.names3d !== 'boolean') prefs.names3d = true;
    if (typeof prefs.space3d !== 'boolean') prefs.space3d = true;      // the night sky behind the terrain, as on the landing page's first look
  }      // no glacier in the link: open on the biggest one as a 3D timelapse that loops, the Switzerland button leads to the overview
  if (['compare', 'timelapse', 'single'].includes(p.get('m'))) { state.mode = p.get('m'); AUTOPLAY = false; }
  ['a','b','from','to','one'].forEach(k => { if (+p.get(k)) state[k] = +p.get(k); });
  if (['natural', 'false1', 'false2', 'false3'].includes(p.get('s'))) state.style = p.get('s');           // s: colour style
  if (p.get('ol') === '1') prefs.old = true;                                                      // ol=1: show the 1850 outline
  if (REGION.landsat && (prefs.landsat || ['a', 'b', 'from', 'to', 'one'].some(k => +p.get(k) && +p.get(k) < FIRST_YEAR))) { YEARS.unshift(...LANDSAT_YEARS); prefs.landsat = true; }      // Landsat on: saved in an earlier visit, or the link names a year before Sentinel-2
  glacierPicked = OPEN_ON_GLACIER; OPEN_3D = FEATURES.view3d && OPEN_ON_GLACIER && (p.get('v') === '3d' || (PLAIN_START && !p.get('m')));
  HASH_TAB = { discover: 'look', fun: 'look', stats: 'figures', switzerland: 'swiss' }[p.get('t')] || null;
})();
export const writeHash = () => history.replaceState(null, '', 
  `#${REGION.id === 'ch' || PATH_REGION ? '' : `r=${REGION.id}&`}${typeof glacierPicked !== 'undefined' && !glacierPicked ? '' : `g=${state.glacier}&`}m=${state.mode}&a=${state.a}&b=${state.b}&from=${state.from}&to=${state.to}&one=${state.one}${typeof viewMode !== 'undefined' && viewMode === '3d' ? '&v=3d' : ''}`);      // v=3d: the link opens the 3D view
export const okYears = () => YEARS.filter(y => state.available[y]);
export const currentGlacier = () => GLACIERS.find(g => g.id === state.glacier);
export function setAUTOPLAY(v){ return AUTOPLAY = v; }      // the other files may not assign to an imported variable
export function setGlacierPicked(v){ return glacierPicked = v; }      // the other files may not assign to an imported variable
export function setViewMode(v){ return viewMode = v; }      // the other files may not assign to an imported variable
