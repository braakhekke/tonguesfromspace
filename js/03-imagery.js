/* =====================================================================
   3. Imagery: the clearest summer scene of each year
      Copernicus Sentinel-2 L2A via the Copernicus Data Space Ecosystem.
      For every glacier and year one Statistical API request scores all
      acquisitions from July to September by cloud and snow cover (scene
      classification, SCL). The page then takes the best September scene;
      if September has no clear scene, August; then July. The chosen day
      is rendered with the Process API.
   ===================================================================== */
const prefs = (() => { try { return JSON.parse(localStorage.getItem('glacierPrefs') || '{}'); } catch { return {}; } })();
prefs.mosaic = true; prefs.osm = prefs.topo = prefs.alti = false;      // every visit starts on Sentinel-2 cloudless as the one base map
const savePrefs = () => { try { localStorage.setItem('glacierPrefs', JSON.stringify(prefs)); } catch {} };

const CDSE = {
  collection: 'sentinel-2-l2a',
  months:     [9, 8, 7],       // September (until the 20th) first, then August, then July
  maxCloud:   0.05,            // a scene counts as clear when at most 5 % of the area is cloud or cloud shadow
  minCover:   0.95,            // the scene must cover at least 95 % of the image area
  fallbackCloud: 0.30,         // if no month has a clear scene: least cloudy one up to 30 %
  statsRes:   60,              // metres per pixel for scoring scenes (cheap, plenty for cloud cover)
  groundRes:  10,              // metres per pixel of the images
  maxPx:      2500,            // Process API output limit per side
  version:    'l1c-v6'         // bump when scoring or rendering changes, to invalidate cached results
};
/* latest allowed day per year (MM-DD); default 20 September. 2024: heavy snowfall on 15 September. */
const LAST_DAY = { default: '09-20', 2024: '09-14' };
const lastDay = yr => LAST_DAY[yr] || LAST_DAY.default;

/* Scene scoring: SCL 3 = cloud shadow, 8/9 = cloud, 10 = thin cirrus, 11 = snow or ice. */
/* One acquisition only. A day can hold two passes over the same place (two orbits, e.g. S2A on R108 and S2B on R065 on 7 September 2025), which sit a few pixels apart.
   The scene search scores each orbit of a day separately over the glacier itself (slots A and B: the orbit of the first scene, and of the first scene of another orbit; the mean of
   orbA / orbB is the orbit number), and a picture is made from the scenes of the chosen orbit only, so it is never a patchwork. */
const ONE_ORBIT = `function preProcessScenes(c){ var t = c.scenes.tiles, m = t.length > 1 ? /_R\\d{3}_/.exec(JSON.stringify(t[0])) : null; if (m) c.scenes.tiles = t.filter(function(x){ return JSON.stringify(x).indexOf(m[0]) >= 0; }); return c; }`;
const orbitFilter = orbit => !orbit ? ONE_ORBIT : `function preProcessScenes(c){ c.scenes.tiles = c.scenes.tiles.filter(function(x){ return JSON.stringify(x).indexOf("_${orbit}_") >= 0; }); return c; }`;
const SCENE_EVALSCRIPT = `//VERSION=3
function setup(){ return { input:[{ bands:["SCL","dataMask"] }], mosaicking:"TILE",
  output:[{ id:"cloudA", bands:1, sampleType:"FLOAT32" }, { id:"snowA", bands:1, sampleType:"FLOAT32" }, { id:"validA", bands:1, sampleType:"FLOAT32" }, { id:"orbA", bands:1, sampleType:"FLOAT32" },
          { id:"cloudB", bands:1, sampleType:"FLOAT32" }, { id:"snowB", bands:1, sampleType:"FLOAT32" }, { id:"validB", bands:1, sampleType:"FLOAT32" }, { id:"orbB", bands:1, sampleType:"FLOAT32" }, { id:"dataMask", bands:1 }] }; }
var ORB = [], OA = 0, OB = 0;
function preProcessScenes(c){ ORB = c.scenes.tiles.map(function(t){ var m = /_R(\\d{3})_/.exec(JSON.stringify(t)); return m ? +m[1] : 0; }); OA = ORB[0] || 0; OB = 0; for (var i = 1; i < ORB.length; i++) if (ORB[i] && ORB[i] !== OA) { OB = ORB[i]; break; } return c; }
function evaluatePixel(ss){
  var a = { c:0, s:0, v:0 }, b = { c:0, s:0, v:0 };
  for (var i = 0; i < ss.length; i++) { var x = ss[i]; if (x.dataMask != 1 || x.SCL == 0) continue; var t = ORB[i] === OA ? a : ORB[i] === OB ? b : null;
    if (t && !t.v) { t.v = 1; t.c = (x.SCL == 3 || x.SCL == 8 || x.SCL == 9 || x.SCL == 10) ? 1 : 0; t.s = x.SCL == 11 ? 1 : 0; } }
  return { cloudA:[a.c], snowA:[a.s], validA:[a.v], orbA:[OA], cloudB:[b.c], snowB:[b.s], validB:[b.v], orbB:[OB], dataMask:[1] };
}`;

/* Same stretch for every year and glacier, so brightness differences are real.
   L2A reflectance 0..1, gain 2.5 as in the Copernicus Browser, soft roll-off above 0.8
   so bright ice and snow keep their detail.
   true colour:  B04, B03, B02      false colour: B08 (near infrared), B04, B03 */
/* Images come from Sentinel-2 Level-1C (top of atmosphere): L2A fills in shaded slopes, which looks
   unnatural in the mountains. Colours: the Copernicus Browser "true color" process with these settings
   (Rayleigh correction, soft contrast curve around midR, gamma with offset, saturation boost, sRGB):
   maxR 3, midR 0.13, sat 1.3, gamma 2.3, gOff 0.01, ray 0.013 / 0.024 / 0.041 for red / green / blue. */
const TRUE_COLOR = { maxR: 3, midR: 0.13, sat: 1.3, gamma: 2.3, gOff: 0.01, ray: { B04: 0.013, B03: 0.024, B02: 0.041, B08: 0, B8A: 0, B11: 0, B12: 0 } };
/* band combinations as red, green, blue */
const STYLE_BANDS = { natural: ['B04','B03','B02'], false1: ['B08','B04','B03'], false2: ['B8A','B11','B12'] };
const STYLE_NAME = { natural: 'natural color', false1: 'false color 1', false2: 'false color 2' };
const styleLine = style => { const [a, b, c] = STYLE_BANDS[style] || STYLE_BANDS.natural; return `Sentinel-2 · ${STYLE_NAME[style] || STYLE_NAME.natural} · bands ${a}, ${b} and ${c}`; };   // under every date: what the picture is
const IMAGE_COLLECTION = 'sentinel-2-l1c';
function evalscriptFor(style, orbit){
  const [r, g, b] = STYLE_BANDS[style] || STYLE_BANDS.natural;
  const T = TRUE_COLOR;
  return `//VERSION=3
var maxR = ${T.maxR}, midR = ${T.midR}, sat = ${T.sat}, gamma = ${T.gamma}, gOff = ${T.gOff};
var gOffPow = Math.pow(gOff, gamma), gOffRange = Math.pow(1 + gOff, gamma) - gOffPow;
function setup(){ return { input:["${r}","${g}","${b}","dataMask"], mosaicking:"TILE", output:{ bands:3 } }; }
${orbitFilter(orbit)}
function clip(s){ return s < 0 ? 0 : s > 1 ? 1 : s; }
function adj(a, tx, ty, maxC){ var ar = clip(a / maxC); return ar * (ar * (tx / maxC + ty - 1) - ty) / (ar * (2 * tx / maxC - 1) - tx / maxC); }
function adjGamma(b){ return (Math.pow(b + gOff, gamma) - gOffPow) / gOffRange; }
function sAdj(a){ return adjGamma(adj(a, midR, 1, maxR)); }
function sRGB(c){ return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 0.41666666666) - 0.055; }
function evaluatePixel(ss){
  var p = ss[0] || { dataMask:0 }; for (var i = 0; i < ss.length; i++) if (ss[i].dataMask == 1) { p = ss[i]; break; }
  if (!p.dataMask) return [0.11, 0.16, 0.19];
  var lr = sAdj(p.${r} - ${T.ray[r]}), lg = sAdj(p.${g} - ${T.ray[g]}), lb = sAdj(p.${b} - ${T.ray[b]});
  var avg = (lr + lg + lb) / 3 * (1 - sat);
  return [sRGB(clip(avg + lr * sat)), sRGB(clip(avg + lg * sat)), sRGB(clip(avg + lb * sat))];
}`;
}

/* ---------- connection: a relay holds the Copernicus credentials ----------
   On the public site: the Cloudflare Worker set in config.js. Locally: scripts/serve.py. */
const RELAY_BASE = ((window.TFS_CONFIG && window.TFS_CONFIG.relay) || '').trim().replace(/\/+$/, '');
/* Data files on the public site have a hash in their name (scripts/build_site.py): config.js maps the plain name to it. Locally the plain name is used. */
const ASSETS = (window.TFS_CONFIG && window.TFS_CONFIG.assets) || {};
const asset = name => ASSETS[name] || name;
const relayRoot = () => RELAY_BASE ? RELAY_BASE + '/cdse' : '/cdse';
let relayCheck = null;
const relayInfo = () => relayCheck || (relayCheck = (RELAY_BASE || location.protocol.startsWith('http'))
  ? fetch(relayRoot() + '/ping', {cache:'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined})
      .then(r => r.ok ? r.json() : null).then(j => ({relay: !!(j && j.relay === true)})).catch(() => ({relay:false}))
      .then(v => { if (!v.relay) relayCheck = null; return v; })      // a failed check is not remembered: the next request tries again
  : Promise.resolve({relay:false}));
relayInfo();      // the check of the relay starts now (connection, TLS), so the first scene search does not wait for it
const LOCAL = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
const NO_RELAY = RELAY_BASE
  ? 'The connection to Copernicus (' + RELAY_BASE + ') did not answer. Check your internet connection and the Worker, then try again.'
  : LOCAL
  ? 'To load the satellite images, start the dashboard with "python3 scripts/serve.py" and use the page it opens at http://localhost:8000.'
  : 'This site has no connection to Copernicus configured yet, so no satellite images can be shown. The maps, outlines and figures still work.';
/* Copernicus reports errors as {"error": {"status", "reason", "message", "code"}}; the relays as
   {"relayError": "..."} or {"error": "..."}. Turn any of these into readable text. */
async function errorText(r){
  try {
    const j = await r.clone().json();
    const e = j.relayError || j.error || j;
    if (typeof e === 'string') return e;
    return [e.message, e.reason, e.code].filter(Boolean).join(' / ') || JSON.stringify(e).slice(0, 300);
  } catch {
    try { return (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300); } catch { return ''; }
  }
}
async function cdse(route, body, accept, label = ''){
  if (!(await relayInfo()).relay) throw new Error(NO_RELAY);
  const what = route === 'statistics' ? 'scene search' : 'image request';
  // Copernicus server errors (5xx) and rate limits (429) are usually temporary: retry twice
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(relayRoot() + '/' + route, {method:'POST', body:JSON.stringify(body), headers:{'Content-Type':'application/json', 'Accept':accept}});
    } catch {
      if (attempt < 2) { if (!attempt) showNotice('Copernicus is not answering, trying again…'); await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
      throw new Error('The connection to Copernicus is not responding. Try again later.');
    }
    if (r.ok) return r;
    const msg = await errorText(r);
    console.error(`Copernicus ${what} ${label} failed: HTTP ${r.status}`, msg, body);
    if ((r.status >= 500 || r.status === 429) && attempt < 2) { if (!attempt) showNotice('Copernicus is busy, trying again…'); await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue; }
    if (r.status === 429) throw new Error('Too many requests in a short time, or Copernicus is busy. Wait a minute and try again.');
    throw new Error(`Copernicus ${what}${label ? ' for ' + label : ''} failed (HTTP ${r.status})${msg ? ': ' + msg : ''}.`);
  }
}

/* ---------- caches: memory first, then IndexedDB so repeat visits cost nothing ---------- */
const memCache = new Map();
/* Browser cache (IndexedDB "tfs-cache"): what the page has already fetched from Copernicus and swisstopo, so that coming back, or switching
   between glaciers and years, needs no new requests.  Three kinds of entries:
     scene|...  the clearest scene of a glacier and year (a few hundred bytes)
     img|...    the satellite image of one scene and colour mode (a JPEG of about 0.3 to 0.7 MB)
     vol|...    the ice volume of a glacier from swisstopo
   Only the images are large. They are capped (IMG_CAP): when the total is over the cap, the images used longest ago are deleted until it is
   down to IMG_KEEP. Images made by an older CDSE.version are deleted at start. Everything else is tiny and kept. */
const IMG_CAP = 150 * 1024 * 1024, IMG_KEEP = 110 * 1024 * 1024;       // all ten glaciers in Natural colours are about 60 to 70 MB
const idb = (() => {
  let dbp = null, trimTimer = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('tfs-cache', 2);
      r.onupgradeneeded = () => { const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('use')) db.createObjectStore('use'); };      // use: key -> {t: last used, s: size in bytes}
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbp = null; }; res(db); };    // let a newer page upgrade the database
      r.onerror = () => rej(r.error);
      r.onblocked = () => setTimeout(() => rej(new Error('cache blocked by another tab')), 2500);   // an old tab holds the old version: go on without the cache instead of waiting for ever
    } catch (e) { rej(e); }
  }));
  const wait = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const run = fn => open().then(db => fn(db)).catch(() => null);
  const touch = (k, v) => run(db => wait(db.transaction('use', 'readwrite').objectStore('use').put({t: Date.now(), s: v.size}, k)));
  async function trim(){
    await run(async db => {
      const tx = db.transaction(['kv', 'use'], 'readwrite'), kv = tx.objectStore('kv'), use = tx.objectStore('use');   // one transaction: it stays open while we only wait for database requests
      const keys = await wait(kv.getAllKeys()), uk = await wait(use.getAllKeys()), uv = await wait(use.getAll());
      const uses = new Map(uk.map((k, i) => [k, uv[i]]));
      const imgs = [];
      for (const k of keys) {
        if (!/^[^|]+\|img\|/.test(String(k))) continue;
        if (!String(k).startsWith(CDSE.version + '|')) { kv.delete(k); use.delete(k); continue; }          // older rendering: gone
        let u = uses.get(k);
        if (!u) { const v = await wait(kv.get(k)); u = {t: 0, s: v && v.size || 0}; use.put(u, k); }      // saved before the cap existed
        imgs.push([k, u]);
      }
      let total = imgs.reduce((n, [, u]) => n + u.s, 0);
      if (total <= IMG_CAP) return;
      imgs.sort((a, b) => a[1].t - b[1].t);
      for (const [k, u] of imgs) { if (total <= IMG_KEEP) break; kv.delete(k); use.delete(k); total -= u.s; }
    });
  }
  setTimeout(trim, 4000);                                                  // once, a few seconds after the page starts
  return {
    get: k => run(async db => { const v = await wait(db.transaction('kv').objectStore('kv').get(k)); if (v instanceof Blob) touch(k, v); return v; }),
    set: (k, v) => run(async db => { await wait(db.transaction('kv', 'readwrite').objectStore('kv').put(v, k)); if (v instanceof Blob) { await touch(k, v); clearTimeout(trimTimer); trimTimer = setTimeout(trim, 3000); } })
  };
})();

/* Image footprint per glacier: its bounds plus a margin, in Web Mercator so it lines up exactly. */
const IMAGE_MARGIN = 0.33;      // share of the 1850 extent added on every side (this gives Aletsch about 24 x 35 km, which looked right)
/* Glaciers with their own margins along the length of the picture, as a share of the picture height: Aletsch is long and its image needs little space beyond the 1850 outline at both ends */
const NS_MARGIN = [['aletsch', 0.08, 0.07]];      // [name part, north, south]; 8 % + 7 % keeps the picture under 2500 px, i.e. 10 m pixels
const EXTRA_NORTH = [['findel', 0.15]];        // glaciers whose image reaches further north (share of the image height)
const EXTRA_EW = [['rhone', 2000]];            // glaciers whose image is wider on both the west and the east side (metres)
function imageFootprint(g){
  const b = g.extent ? padBounds(g.extent, IMAGE_MARGIN) : padBounds(g.bounds, 0.35);   // margin around the 1850 extent, for panning and video crops
  const ns = g.extent && NS_MARGIN.find(([k]) => norm(g.local || g.name).includes(k));
  if (ns) {                                          // north and south margins as a share of the finished picture height
    const [[s0], [n0]] = g.extent, eh = n0 - s0, H = eh / (1 - ns[1] - ns[2]);
    b[0][0] = s0 - ns[2] * H; b[1][0] = n0 + ns[1] * H;
  }
  const extra = EXTRA_NORTH.find(([k]) => norm(g.local || g.name).includes(k));
  if (extra) b[1][0] += (b[1][0] - b[0][0]) * extra[1];
  const ew = EXTRA_EW.find(([k]) => norm(g.local || g.name).includes(k));
  if (ew) { const d = ew[1] / (111320 * Math.cos((b[0][0] + b[1][0]) / 2 * Math.PI / 180)); b[0][1] -= d; b[1][1] += d; }
  const sw = L.CRS.EPSG3857.project(L.latLng(b[0])), ne = L.CRS.EPSG3857.project(L.latLng(b[1]));
  const lat = (b[0][0] + b[1][0]) / 2, scale = 1 / Math.cos(lat * Math.PI / 180);   // Mercator metres per ground metre
  let w = Math.round((ne.x - sw.x) / (CDSE.groundRes * scale)), h = Math.round((ne.y - sw.y) / (CDSE.groundRes * scale));
  const k = Math.min(1, CDSE.maxPx / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
  return {bounds:b, bbox:[sw.x, sw.y, ne.x, ne.y].map(v => Math.round(v)), w, h, statsRes: Math.round(CDSE.statsRes * scale)};
}
const CRS3857 = 'http://www.opengis.net/def/crs/EPSG/0/3857';

/* ---------- scene choice ---------- */
function pickScene(days){
  const best = list => list.slice().sort((a, b) => (a.snow - b.snow) || (a.cloud - b.cloud) || b.date.localeCompare(a.date))[0];
  for (const m of CDSE.months) {
    const clear = days.filter(d => +d.date.slice(5, 7) === m && d.cloud <= CDSE.maxCloud);
    if (clear.length) return {...best(clear), clear:true};
  }
  const rest = days.filter(d => d.cloud <= CDSE.fallbackCloud)
    .sort((a, b) => (a.cloud - b.cloud) || b.date.localeCompare(a.date));
  return rest.length ? {...rest[0], clear:false} : null;
}
/* Scenes chosen with tools/pick-scenes.html: scenes.json in the repository root holds, per glacier (inventory id) and year, the day and orbit. They replace the automatic choice;
   years that are not in the file still use it. A missing or broken file means the automatic choice everywhere. */
const SCENES_FILE = fetch(asset('scenes.json'), ASSETS['scenes.json'] ? undefined : {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null);
async function curatedScene(g, yr){
  const file = await SCENES_FILE, entry = file && file.glaciers && g.inv && file.glaciers[g.inv.id], p = entry && entry.picks && entry.picks[yr];
  return p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && /^R\d{3}$/.test(p.orbit || '') ? {date: p.date, orbit: p.orbit, cloud: 0, snow: 0, clear: true, curated: true} : null;
}
const summerStarted = yr => yr < CURRENT_YEAR || new Date() >= new Date(`${yr}-07-01T00:00:00Z`);      // the search window of a year opens on 1 July
async function findScene(g, yr){
  if (!summerStarted(yr)) return null;   // no search for the current year before 1 July
  const chosen = await curatedScene(g, yr); if (chosen) return chosen;
  const fp = imageFootprint(g), key = `${CDSE.version}|scene|${g.id}|${yr}|${fp.bbox.join(',')}`;
  if (memCache.has(key)) return memCache.get(key);
  const p = (async () => {
    const hit = await idb.get(key);
    // past summers never change; the current summer is re-checked twice a day
    if (hit && (yr < CURRENT_YEAR || Date.now() - hit.savedAt < 12 * 3600e3)) return hit.scene;
    const j = await (await cdse('statistics', {
      input: { bounds: { bbox: fp.bbox, properties: { crs: CRS3857 } },
               data: [{ type: CDSE.collection, dataFilter: { mosaickingOrder: 'leastCC' } }] },
      aggregation: { timeRange: { from: `${yr}-07-01T00:00:00Z`, to: `${yr}-09-21T00:00:00Z` },   // up to and including 20 September
                     aggregationInterval: { of: 'P1D' }, evalscript: SCENE_EVALSCRIPT, resx: fp.statsRes, resy: fp.statsRes }
    }, 'application/json', `${g.name}, summer ${yr}`)).json();
    const days = (j.data || []).flatMap(d => {          // per day up to two scenes, one for each orbit, each scored over the whole image area
      try {
        const o = d.outputs, m = k => o[k].bands.B0.stats.mean, date = d.interval.from.slice(0, 10);
        return ['A', 'B'].map(k => { const valid = m('valid' + k), orb = Math.round(m('orb' + k));
          return valid > 0 && orb ? { date, orbit: 'R' + String(orb).padStart(3, '0'), cloud: m('cloud' + k) / valid, snow: m('snow' + k) / valid, cover: valid } : null; }).filter(Boolean);
      } catch { return []; }
    }).filter(d => d.date.slice(5) <= lastDay(yr) && Number.isFinite(d.cloud) && Number.isFinite(d.snow) && d.cover >= CDSE.minCover);
    const scene = pickScene(days);
    idb.set(key, {scene, savedAt: Date.now()});
    return scene;
  })();
  memCache.set(key, p);
  p.catch(() => memCache.delete(key));
  return p;
}

/* ---------- the latest image ---------- */
/* "Latest": the newest scene of the last 60 days with at most 30 % cloud (cloud, cloud shadow, thin cirrus) over the 1850 outline and a clear tongue
   (the bottom 3 km window, at most 1 %). Two statistics requests per glacier and day, which the relay keeps for one day. The two areas come from
   cloudmasks.json (made by scripts/make_cloud_masks.py). Chosen, the scene replaces the scene of its year until the visitor picks a year, leaves
   the One year mode or changes glacier; so everything that works with years (download, glacier facts, credits) keeps working. */
const LATEST = { days: 60, maxCloudOutline: 0.30, maxCloudTongue: 0.01, minCover: 0.97 };
let masksFile = null;
const MASKS = () => masksFile || (masksFile = fetch(asset('cloudmasks.json'), ASSETS['cloudmasks.json'] ? undefined : {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null));      // 120 kB, fetched when "Latest" is first used
async function cloudByDay(area, from, to, label){
  const pts = area.flat(2), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const j = await (await cdse('statistics', {
    input: { bounds: { bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], properties: { crs: CRS3857 }, geometry: { type: 'MultiPolygon', coordinates: area } },
             data: [{ type: CDSE.collection, dataFilter: { mosaickingOrder: 'leastCC' } }] },
    aggregation: { timeRange: { from, to }, aggregationInterval: { of: 'P1D' }, evalscript: SCENE_EVALSCRIPT, resx: 40, resy: 40 }
  }, 'application/json', label)).json();
  const rows = (j.data || []).flatMap(d => {          // per day up to two scenes, one for each orbit; cover = the share of the area that this orbit's scene covers
    try {
      const o = d.outputs, m = k => o[k].bands.B0.stats.mean, date = d.interval.from.slice(0, 10);
      return ['A', 'B'].map(k => { const valid = m('valid' + k), orb = Math.round(m('orb' + k));
        return valid > 0 && orb ? { date, orbit: 'R' + String(orb).padStart(3, '0'), cover: valid, cloud: m('cloud' + k) / valid } : null; }).filter(Boolean);
    } catch { return []; }
  });
  const full = Math.max(0, ...rows.map(r => r.cover));    // 'valid' is a share of the bounding box, not of the shape: the best scene in the window is the full area
  return rows.map(r => ({...r, cover: full ? r.cover / full : 0}));
}
async function findLatest(g){
  const masks = await MASKS(), m = masks && masks.glaciers && g.inv && masks.glaciers[g.inv.id];
  if (!m) throw new Error('The areas for the latest image (cloudmasks.json) are not available.');
  const now = new Date(), end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const iso = t => new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z', from = iso(end - LATEST.days * 864e5), to = iso(end);
  const key = `${CDSE.version}|latest2|${g.id}|${to}`;
  if (memCache.has(key)) return memCache.get(key);
  const p = (async () => {
    const hit = await idb.get(key);
    if (hit) return hit.scene;
    const [outline, tongue] = await Promise.all([cloudByDay(m.outline, from, to, `${g.name}, latest scene`), cloudByDay(m.tongue, from, to, `${g.name}, tongue`)]);
    const tg = new Map(tongue.map(c => [c.date + '|' + c.orbit, c]));
    const ok = outline.filter(o => { const c = tg.get(o.date + '|' + o.orbit);
      return c && o.cover >= LATEST.minCover && o.cloud <= LATEST.maxCloudOutline && c.cover >= LATEST.minCover && c.cloud <= LATEST.maxCloudTongue; })
      .sort((a, b) => b.date.localeCompare(a.date) || a.cloud - b.cloud);
    const scene = ok.length ? { date: ok[0].date, orbit: ok[0].orbit, cloud: ok[0].cloud, snow: 0, clear: true, latest: true } : null;
    idb.set(key, {scene, savedAt: Date.now()});
    return scene;
  })();
  memCache.set(key, p);
  p.catch(() => memCache.delete(key));
  return p;
}
function restoreLatest(){            // back to the normal scene of that year
  const l = state.latest; if (!l) return;
  state.latest = null;
  if (l.saved) state.available[l.year] = l.saved; else delete state.available[l.year];
}
let latestBusy = false;
async function showLatest(){
  if (latestBusy || !state.checked) return;
  const g = currentGlacier(), gen = checkGen; latestBusy = true;
  setStatus('Looking for the latest clear-ish scene…'); renderYears();
  let sc = null, err = null;
  try { sc = await findLatest(g); } catch (e) { err = e; }
  latestBusy = false;
  if (gen !== checkGen || g.id !== state.glacier) return;
  if (err || !sc) {
    setStatus(statusLine()); renderYears();
    showNotice(err ? err.message : `No clear-ish scene in the last ${LATEST.days} days: none has at most ${Math.round(LATEST.maxCloudOutline * 100)} % cloud over the 1850 outline and a clear tongue.`);
    return;
  }
  restoreLatest();
  const year = +sc.date.slice(0, 4);
  state.latest = {year, saved: state.available[year] || null};
  state.available[year] = sc; state.one = year; state.mode = 'single'; state.frame = 0;
  setStatus(statusLine()); refreshAll();
}

/* ---------- images ---------- */
let pending = 0, active = 0; const queue = [];
const runQueue = () => { while (active < 3 && queue.length) { active++; const job = queue.shift(); job().finally(() => { active--; runQueue(); }); } };
const queued = fn => new Promise((res, rej) => { queue.push(() => fn().then(res, rej)); runQueue(); });
const imageKey = (g, yr, fp, strip) => { const sc = state.available[yr]; return `${CDSE.version}|img|${(STYLE_BANDS[state.style] || []).join('')}|${g.id}${strip ? '-strip' : ''}|${sc.date}${sc.orbit ? '|' + sc.orbit : ''}|${fp.bbox.join(',')}`; };
const footprintRes = g => { const fp = imageFootprint(g), bb = fp.bbox; return Math.max((bb[2] - bb[0]), (bb[3] - bb[1]) * fp.w / fp.h) / fp.w * Math.cos(Math.atan(Math.sinh((bb[1] + bb[3]) / 2 / 6378137))); };      // ground metres per pixel of the picture of the whole glacier area (10 unless it was cut down to the 2,500 px limit)
const imageHere = (g, yr) => footprintRes(g) <= CDSE.groundRes * 1.02 && memCache.has(imageKey(g, yr, imageFootprint(g), false));      // the whole picture is already on its way or here, and has the full resolution
function loadImage(g, yr, strip){            // strip: {bbox, w, h} of a strip picture for the 3D view (stripImageSpec); without it the picture of the whole glacier area, as the map shows it
  const sc = state.available[yr], style = state.style, fp = strip || imageFootprint(g);
  const key = imageKey(g, yr, fp, !!strip);
  if (memCache.has(key)) return memCache.get(key);
  const p = (async () => {
    const hit = await idb.get(key);
    if (hit instanceof Blob) return URL.createObjectURL(hit);
    pending++; setLoading();
    try {
      const blob = await queued(() => cdse('process', {
        input: { bounds: { bbox: fp.bbox, properties: { crs: CRS3857 } },
                 data: [{ type: IMAGE_COLLECTION, dataFilter: { timeRange: { from:`${sc.date}T00:00:00Z`, to:`${sc.date}T23:59:59Z` }, mosaickingOrder: 'leastCC' }, processing: { upsampling: 'BILINEAR' } }] },   // bilinear: smooth 20 and 60 m bands
        output: { width: fp.w, height: fp.h, responses: [{ identifier:'default', format:{ type:'image/jpeg' } }] },
        evalscript: evalscriptFor(style, sc.orbit)
      }, 'image/jpeg', `${g.name}${strip ? ' (3D strip)' : ''}, ${fmtDate(sc.date)}`).then(r => r.blob()));
      idb.set(key, blob);
      return URL.createObjectURL(blob);
    } finally { pending--; setLoading(); }
  })();
  memCache.set(key, p);
  p.catch(() => memCache.delete(key));
  return p;
}
function setLoading(){
  if (!state.checked) return;
  setStatus(pending ? `Loading ${pending} satellite image${pending > 1 ? 's' : ''} from Copernicus…` : statusLine());
}
const fmtDM = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric', month:'long', timeZone:'UTC'});      // the day and month: the year is already shown big next to it
const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});

