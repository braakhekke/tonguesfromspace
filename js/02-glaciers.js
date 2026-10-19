/* =====================================================================
   2. Glacier list: built-in, or ranked from glaciers.js when present
   ===================================================================== */
const DATA = window.GLACIER_DATA || null;
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/* canton and mountain range of glaciers that are not in the built-in list (Wikipedia: Findel Glacier, Fee Glacier) */
const PLACE = { findel: ['Valais', 'Pennine Alps'], fee: ['Valais', 'Pennine Alps'] };
/* bounding box [[south, west], [north, east]] of a bbox and, if given, a GeoJSON MultiPolygon (lng, lat) */
function unionBbox(bbox, geom){
  let [[s, w], [n, e]] = bbox;
  if (geom) geom.coordinates.forEach(poly => poly[0].forEach(([x, y]) => { if (y < s) s = y; if (y > n) n = y; if (x < w) w = x; if (x > e) e = x; }));
  return [[s, w], [n, e]];
}
/* The 2023 outline of a glacier is 80 % of the weight of the glacier data. On the public site glaciers.js leaves it out and names a file per glacier (outline_file,
   scripts/build_site.py); it is loaded when the glacier is chosen. Locally glaciers.js holds the outlines itself and nothing is loaded. The 1850 outlines are in glaciers.js:
   the overview draws all ten. */
const outlineLoads = new Map();
const needsOutline = g => !!(g && g.inv && !g.inv.outline && g.inv.outline_file);
function loadOutline(g){      // g: an entry of GLACIERS; resolves when g.inv.outline is there (or the file is not available: the outline is then left out)
  if (!needsOutline(g)) return Promise.resolve();
  const inv = g.inv;
  if (!outlineLoads.has(inv.id)) outlineLoads.set(inv.id, new Promise(res => {
    const sc = document.createElement('script'); sc.src = siteFile(inv.outline_file);
    const done = () => { const o = window.GLACIER_OUTLINES && window.GLACIER_OUTLINES[inv.id]; if (o) inv.outline = o; else outlineLoads.delete(inv.id); res(); };
    sc.onload = done; sc.onerror = () => { outlineLoads.delete(inv.id); res(); };      // a failed load is tried again at the next choice
    document.head.appendChild(sc);
  }));
  return outlineLoads.get(inv.id);
}
/* Vatnajökull (Iceland): the outlets of the ice cap that can be chosen (data/vatnajokull.js, scripts/build_vatnajokull.py). An outlet has no inventory record `inv` (that is the
   Swiss GLAMOS data) but its RGI 6.0 outline and figures in `rgi`, and its picture is a square of 2 x half km around its centre (`half`, see imageFootprint). */
const ICECAP = window.VATNAJOKULL || null;
const ringsBounds = rings => { const pts = rings.flat(); return [[Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))], [Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]]; };
const squareBounds = (lat, lon, halfKm) => { const dLat = halfKm / 111.32, dLon = halfKm / (111.32 * Math.cos(lat * Math.PI / 180)); return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]]; };
let GLACIERS;
if (REGION.id === 'is-vatnajokull') {
  GLACIERS = ((ICECAP && ICECAP.outlets) || []).map(o => ({
    id: o.id, name: o.name, local: o.name, canton: 'Vatnajökull ice cap', range: 'Iceland', lede: o.note, look: '', note: '',
    center: [o.lat, o.lon], half: o.half, box: squareBounds(o.lat, o.lon, o.half), bounds: padBounds(ringsBounds(o.outline), 0.04), tongue: o.tip, view3d: {...o.strip3d, tex: o.strip3d.half >= 6000 ? [2048, 1024] : [1024, 2048]},      // box: the picture (the tongue, 2 x half km); bounds: the whole glacier (its RGI outline), which the Whole glacier button shows      // tip: where the 3D strip starts (build_vatnajokull.py)
    rgi: {id: o.rgi, areaKm2: o.areaKm2, lengthKm: o.lengthKm, zmin: o.zmin, zmax: o.zmax, year: o.outlineYear, outline: o.outline}, outlines: o.outlines
  }));
} else if (DATA && Array.isArray(DATA.glaciers) && DATA.glaciers.length) {
  GLACIERS = DATA.glaciers.map(g => {
    const d = DEFAULTS.find(d => d.keys.some(k => norm(g.name).includes(k)) && L.latLng(d.center).distanceTo(g.center) < 12000);
    const base = d ? {...d} : {
      id: 'sgi-' + g.id, name: shortName(g.name), local: g.name, canton: (PLACE[norm(shortName(g.name))] || [])[0] || '', range: (PLACE[norm(shortName(g.name))] || [])[1] || '',
      lede: `${g.name} is one of the ten largest glaciers in the newest Swiss Glacier Inventory.`,
      look: '', note: ''
    };
    const extent = unionBbox(g.bbox, g.oldest && g.oldest.outline);      // the 1850 outline is the largest extent: pictures and boxes must contain it with room around
    return {...base, inv: g, center: g.center, extent, bounds: padBounds(extent, 0.08)};
  });
} else {
  GLACIERS = DEFAULTS.map(d => ({...d}));
}
/* One naming rule for every glacier: the local name without the word for glacier.
   "Grosser Aletschgletscher" -> "Grosser Aletsch", "Glacier de Corbassière" -> "Corbassière",
   "Vadret da Morteratsch" -> "Morteratsch", "Fieschergletscher VS" -> "Fiescher". */
function shortName(n){
  let t = (n || '').trim()
    .replace(/^(Glacier|Ghiacciaio|Vadret|Vadrec|Glatscher)\s+(de la |de l'|des |du |de |d'|da |dal |del |dla )?/i, '')
    .replace(/\s+\((.*)\)$/, '')
    .replace(/\s+(VS|BE|GR|UR|TI|GL|OW|NW|SZ)$/, '')
    .replace(/-?gletscher$/i, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : n;
}
function padBounds(b, f){ const dy=(b[1][0]-b[0][0])*f, dx=(b[1][1]-b[0][1])*f; return [[b[0][0]-dy,b[0][1]-dx],[b[1][0]+dy,b[1][1]+dx]]; }
/* One inventory for every glacier, so ranking and displayed areas are comparable:
   SGI2016 built in (newest inventory with published areas for all ten), or the inventory in glaciers.js. */
const rankArea = g => g.inv ? g.inv.area_km2 : g.rgi ? g.rgi.areaKm2 : g.a2016;
/* Length in km and the year of the last survey, read from the GLAMOS figure "lc_stat_frequency": https://doi.glamos.ch/figures/lc_stat_frequency.pdf
   km = the number printed at the right end of the glacier's row; year = where the last bar of that row ends (the figure's last column is 2024 to 2025).
   Corbassière and Zmutt are surveyed every few years: their last bars end in 2023. Keyed by the short name of the glacier (the figure calls Findel "Findelen"). */
const CURRENT_LENGTH = { 'grosser aletsch': {km: 22.11, year: 2025}, 'fiescher': {km: 14.18, year: 2025}, 'gorner': {km: 11.90, year: 2025}, 'unteraar': {km: 11.46, year: 2025},
  'corbassiere': {km: 9.20, year: 2023}, 'rhone': {km: 7.16, year: 2025}, 'findel': {km: 5.99, year: 2025}, 'zmutt': {km: 5.93, year: 2023}, 'fee': {km: 4.12, year: 2025}, 'trift': {km: 3.64, year: 2025} };
const areaText = (g, d = 1) => g.rgi ? Math.round(g.rgi.areaKm2).toLocaleString('en') : rankArea(g).toFixed(d);      // an area in km² for the lists: Iceland's basins are over 1,000 km², whole numbers
/* The two outlines of a glacier, as the map, the 3D view and the downloads draw them: the old one (Switzerland 1850, Iceland about 1890) and the newest (2023, 2025). Swiss outlines are GeoJSON polygons;
   the Icelandic ones are lines (the Icelandic Met Office outlines of the whole ice cap cut to the outlet's region, so they are open at its edge): a MultiLineString. */
const lineGeom = lines => ({type: 'MultiLineString', coordinates: lines.map(l => l.map(([la, lo]) => [lo, la]))});
const hasOldOutline = g => !!(g && (g.inv ? g.inv.oldest : g.outlines && g.outlines.lia));
const oldOutlineGeom = g => !g ? null : g.inv ? (g.inv.oldest && g.inv.oldest.outline) || null : g.outlines && g.outlines.lia ? (g.outlines.lia.geom || (g.outlines.lia.geom = lineGeom(g.outlines.lia.lines))) : null;
const newOutlineGeom = g => !g ? null : g.inv ? g.inv.outline || null : g.outlines && g.outlines.latest ? (g.outlines.latest.geom || (g.outlines.latest.geom = lineGeom(g.outlines.latest.lines))) : null;
function eachPiece(geom, fn){            // fn(points, closed): the closed rings of polygons, or the open lines of a line geometry
  if (geom.type === 'MultiLineString') geom.coordinates.forEach(l => fn(l, false)); else geom.coordinates.forEach(poly => poly.forEach(r => fn(r, true)));
}
const rankLabel = () => DATA ? DATA.latest_label : 'SGI2016';
GLACIERS.sort((x, y) => rankArea(y) - rankArea(x));

