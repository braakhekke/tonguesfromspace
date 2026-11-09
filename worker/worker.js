/**
 * Swiss Glacier Tongues from Space - Copernicus relay (Cloudflare Worker)
 *
 * Lets visitors of the public site see Copernicus Sentinel-2 images without an account: the
 * Worker logs in to the Copernicus Data Space Ecosystem with YOUR credentials (stored as
 * encrypted Worker secrets), forwards the explorer's requests and caches the answers.
 *
 * It serves two regions (see REGIONS-style constants below): Switzerland, and the Vatnajökull ice cap in Iceland. Only the two requests the explorer makes are accepted, so the
 * relay cannot be used to spend your quota on anything else:
 *   statistics  scoring of all Sentinel-2 L2A scenes of one season over a glacier, daily, at coarse resolution: Switzerland 1 July to 1 October-ish (see checkStatistics),
 *               Iceland 1 August to 15 October; or of the last 75 days at most (the "Latest" image, Switzerland), optionally over a polygon that lies inside the checked box
 *   process     the image of one chosen day between July and October (or in the last 130 days), over a glacier, or (Switzerland) the July-September quarterly
 *               mosaic around it (background)
 *
 * Settings (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets):
 *   CDSE_CLIENT_ID      secret   OAuth client ID from the CDSE dashboard
 *   CDSE_CLIENT_SECRET  secret   OAuth client secret
 *   CDSE_CLIENT_ID_2 / CDSE_CLIENT_SECRET_2   optional second account (and _3 up to _15): used when the first has no processing units left
 *   ALLOWED_ORIGINS     text     e.g. "https://tonguesfromspace.org,https://www.tonguesfromspace.org,http://localhost:8000"
 *   CACHE               KV namespace binding (optional but recommended): image cache
 *   Gallery (all optional; without them the gallery stays closed for uploads):
 *   LANDSAT             R2 bucket binding: the Landsat pictures (data/landsat/..., uploaded from the working copy, see wrangler.toml); served at /data/landsat/*
 *   GALLERY             R2 bucket binding: the shared pictures and videos (pending/ and approved/)
 *   TURNSTILE_SECRET    secret: Cloudflare Turnstile secret key (checks that an upload comes from a person)
 *   TURNSTILE_SITEKEY   text: Turnstile site key (public, handed to the page)
 *   GALLERY_ADMIN_TOKEN secret: at least 20 random characters; lets tools/gallery-admin.html approve or remove items
 *   GALLERY_NOTIFY_TOKEN secret (optional): an ntfy access token (a free ntfy.sh account), sent as the sender; without it ntfy.sh may answer 429 to a shared Workers address
 *   GALLERY_NOTIFY_URL  secret (optional): an ntfy.sh topic URL, e.g. https://ntfy.sh/<long-random-name>; every accepted upload sends a push message to it
 *
 * Endpoints (same paths as scripts/serve.py):
 *   GET  /cdse/ping        -> {"relay":true,"managed":true}
 *   POST /cdse/statistics  -> Statistical API (which summer scene is clearest)
 *   POST /cdse/process     -> Process API image
 *   GET  /gallery/config, /gallery/list, /gallery/file/<id>   public gallery (approved items only)
 *   POST /gallery/submit   upload of a finished picture or video (waits for approval)
 *   /gallery/admin/*       moderation, needs the admin token
 *   GET  /ask/config, POST /ask/glacier   "please add this glacier" (only glaciers on Wikidata's list; see the section below); GET /ask/admin/list, DELETE /ask/admin/<Q-id> need the admin token
 */

const COLLECTION = 'sentinel-2-l2a';                              // scene scoring (scene classification)
const IMAGES = 'sentinel-2-l1c';                                  // the images themselves (no shadow infill)
const MOSAIC = 'byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca';     // Sentinel-2 quarterly cloudless mosaics (background)
/* The regions this relay serves (js/00-regions.js of the page names the same ones). A request must lie inside one of them:
   ch               Switzerland, a box with a margin; scene search from 1 July (see checkStatistics)
   is               Iceland: the pictures of the glaciers (a square of up to 25 km around the centre of each), within NEAR_KM of a centre in CENTRES.is;
                    scene search from 1 August to 15 October of a year
   no               Norway, centres in CENTRES.no; scene search from 20 July to 30 September
   sj               Svalbard, centres in CENTRES.sj; scene search from 20 July to 15 September
   Add a glacier: its centre goes into CENTRES (scripts/sync_worker_centres.py rewrites the block from the data files of the regions). */
const SWISS = { west: 5.8, east: 10.6, south: 45.7, north: 47.9 }; // WGS84, with a margin
/*centres:begin*/
const CENTRES = {is: [[-16.305, 64.095], [-17.2692, 64.04367], [-15.9551, 64.7174], [-16.7523, 64.7885], [-17.8352, 64.1189], [-17.8858, 64.5391], [-18.0847, 64.2824], [-15.7546, 64.286], [-15.5011, 64.4603], [-16.7927, 64.0086], [-17.9539, 64.4234], [-15.626, 64.3458], [-19.9665, 64.6602], [-18.8128, 64.8066], [-18.57765, 64.70779], [-19.16095, 64.78865], [-19.14791, 64.72088], [-18.68032, 64.6432], [-18.87029, 64.65479], [-19.00264, 64.9442], [-18.58177, 64.95442], [-18.5011, 64.91821], [-18.75551, 64.96806], [-19.2979, 63.5523], [-22.2284, 66.1443], [-19.6245, 63.6397], [-17.9255, 64.7576], [-20.7035, 64.548], [-20.384, 64.7838], [-14.922, 64.7058], [-19.5591, 63.7972]],
  no: [[7.012, 61.6268], [13.8208, 66.6556], [6.3512, 60.0407], [14.1148, 66.5559], [16.0328, 67.2777], [7.3779, 60.5386], [6.6955, 61.6699], [14.2625, 66.013], [22.0389, 70.1838], [6.4638, 60.2009]],
  sj: [[25.5039, 79.4026], [23.0066, 79.2887], [19.0331, 78.5869], [19.0797, 79.0808], [31.8117, 80.095], [22.0243, 79.7483], [24.0524, 77.7381], [20.2653, 78.9043], [24.9426, 80.2024], [12.5089, 79.4851]]};          // [lon, lat] of the picture boxes of the glaciers of each region (scripts/sync_worker_centres.py)
/*centres:end*/
const SEASONS = {is: {from: '-08-01', last: '-10-16'}, no: {from: '-07-20', last: '-10-01'}, sj: {from: '-07-20', last: '-09-16'}};      // the scene search of a year: its first day, and the day after its last (statistics requests end there)
const NEAR_KM = 25;                                                 // a picture box must have its centre this close to a glacier's centre (the box is up to 25 km a side)
const MAX_PX = 2500;
const MAX_BODY = 20000;                                             // characters; the explorer's own requests are under 5,000
const FIRST_YEAR = 2016, lastYear = () => new Date().getUTCFullYear();   // Sentinel-2 images in the explorer start in 2016
const yearOk = y => Number.isInteger(+y) && +y >= FIRST_YEAR && +y <= lastYear();
const MIN_STATS_RES = 40;                                           // metres (CRS units); keeps scene scoring cheap
const DAY = 86400;

/* Copernicus accounts: CDSE_CLIENT_ID / CDSE_CLIENT_SECRET, then the same names with _2 up to _15. They are used in this order; an account that answers
   "insufficient processing units" is put last for an hour, so the next one takes over. */
const clients = env => { const out = []; for (let i = 1; i <= 15; i++) { const x = i === 1 ? '' : '_' + i, id = env['CDSE_CLIENT_ID' + x], secret = env['CDSE_CLIENT_SECRET' + x]; if (id && secret) out.push({ n: i, id, secret }); } return out; };
const tokens = new Map();                                            // account number -> { token, until }, reused while the isolate lives
const spent = new Map();                                             // account number -> time (ms) until which it counts as out of units
const inflight = new Map();
/* Fair-use limit per visitor (IP address) for requests that go on to Copernicus (cache hits are free and not counted).
   Kept in the memory of the running Worker instance: no KV writes. It is a brake, not a wall: Cloudflare may run several
   instances. The strict limit is the Cloudflare rate-limiting rule described in the README. */
const UPSTREAM_PER_MIN = 90, UPSTREAM_PER_HOUR = 600;
const usage = new Map();                                             // ip -> [timestamps in ms]
function overLimit(ip) {
  const now = Date.now(), list = (usage.get(ip) || []).filter(t => now - t < 3600e3);
  const minute = list.filter(t => now - t < 60e3).length;
  if (minute >= UPSTREAM_PER_MIN || list.length >= UPSTREAM_PER_HOUR) { usage.set(ip, list); return true; }
  list.push(now); usage.set(ip, list);
  if (usage.size > 5000) for (const [k, v] of usage) if (!v.length || now - v[v.length - 1] > 3600e3) usage.delete(k);
  return false;
}                                          // identical requests at the same moment share one fetch and one KV write

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/cdse/ping') return json({ relay: true, managed: true }, 200, cors);

    if (url.pathname === '/ev') return countEvent(request, env);
    if (url.pathname.startsWith('/gallery/')) return gallery(request, env, url, cors, ctx);
    if (url.pathname.startsWith('/ask/')) return ask(request, env, url, cors);
    if (url.pathname.startsWith('/data/landsat/')) return landsat(request, env, url);
    if (url.pathname.startsWith('/data/home-bg/')) return homeBackground(request, env, url);
    if (url.pathname.endsWith('.mp4')) return videoFile(request, env);

    const route = { '/cdse/statistics': 'statistics', '/cdse/process': 'process' }[url.pathname];
    if (!route) return json({ error: 'Not found' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    if (!clients(env).length) {
      logError('relay_no_credentials', { route });
      return json({ relayError: 'The relay has no Copernicus credentials yet (set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET).' }, 502, cors);
    }

    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'Request too large' }, 413, cors);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
    const problem = route === 'process' ? checkProcess(body) : checkStatistics(body);
    if (problem) return json({ error: `Request not allowed: ${problem}` }, 400, cors);

    // cache lookup
    const key = `${route}:${await sha256(text)}`;
    const found = await cacheGet(env, key), hit = found && !found.stale ? found : null, stale = found && found.stale ? found : null;
    if (hit) return new Response(hit.body, { headers: { ...cors, 'Content-Type': hit.type, 'X-Cache': 'HIT' } });

    // forward to Copernicus (shared with identical requests already on their way)
    let job = inflight.get(key);
    if (!job && overLimit(request.headers.get('CF-Connecting-IP') || 'unknown'))
      return json({ error: 'Too many requests. Please wait a minute and try again.' }, 429, { ...cors, 'Retry-After': '60' });
    if (!job) {
      job = (async () => {
        const accept = route === 'process' ? body.output.responses[0].format.type : 'application/json';   // checkProcess allows image/jpeg and image/png
        const r = await callCdse(env, upstream(env)[route], text, accept);
        const out = { status: r.status, type: r.headers.get('Content-Type') || 'application/octet-stream', data: await r.arrayBuffer() };
        if (r.ok) await cachePut(env, key, out.data, out.type, ttlFor(route, body));
        return out;
      })();
      inflight.set(key, job);
      job.finally(() => inflight.delete(key)).catch(() => {});
    }
    let out;
    try { out = await job; } catch (e) { logError('relay_failed', { route, message: String(e.message).slice(0, 120), stale: !!stale }); if (stale) return staleResponse(stale, cors); return json({ relayError: e.message }, 502, cors); }
    if (out.status >= 500 || out.status === 429 || out.status === 403 || out.status === 401) logError('upstream_status', { route, status: out.status, stale: !!stale });      // Copernicus is down, busy, out of units or refusing the login
    if (stale && (out.status >= 500 || out.status === 429 || out.status === 403)) return staleResponse(stale, cors);      // Copernicus is down, busy or out of units: the older answer is better than none
    return new Response(out.data.slice(0), { status: out.status, headers: { ...cors, 'Content-Type': out.type, 'X-Cache': 'MISS' } });
  }
};

/* ---------- Video files (the clips on the home page, the teaser): the static assets answer a Range request with the whole file (200), and Safari on iPhone then shows no video.
   The Worker runs first for these paths (wrangler.toml run_worker_first), takes the file from the assets and answers Range requests itself with 206. ---------- */
async function videoFile(request, env) {
  const r = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (!r.ok || !range || (range[1] === '' && range[2] === '')) {
    const h = new Headers(r.headers); h.set('Accept-Ranges', 'bytes');
    return new Response(request.method === 'HEAD' ? null : r.body, { status: r.status, headers: h });
  }
  const buf = await r.arrayBuffer(), size = buf.byteLength;
  let start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  const h = new Headers(r.headers); h.set('Accept-Ranges', 'bytes');
  if (start >= size || start > end) { h.set('Content-Range', `bytes */${size}`); return new Response(null, { status: 416, headers: h }); }
  h.set('Content-Range', `bytes ${start}-${end}/${size}`); h.set('Content-Length', String(end - start + 1));
  return new Response(request.method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers: h });
}

/* ---------- Landsat pictures (R2 bucket LANDSAT, same paths as data/landsat/ in the working copy; not in the repository) ---------- */
/* Only the glaciers of regions that are public are served. The bucket also holds the Landsat pictures of Iceland and Norway; add a glacier here when its region goes public. */
const LANDSAT_PUBLIC = new Set(['aletsch', 'corbassiere', 'fiescher', 'gorner', 'rhone', 'trift', 'unteraar', 'zmutt', 'sgi-B53-04', 'sgi-B56-03']);
async function landsat(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Use GET', { status: 405 });
  if (!env.LANDSAT) return new Response('Not found', { status: 404 });
  const key = decodeURIComponent(url.pathname.slice(1));
  if (key.includes('..') || !/\.(jpg|json)$/.test(key)) return new Response('Not found', { status: 404 });
  const glacier = key.replace(/^data\/landsat\//, '').split('/')[0].replace(/\.json$/, '');
  if (!LANDSAT_PUBLIC.has(glacier)) return new Response('Not found', { status: 404 });
  const obj = request.method === 'HEAD' ? await env.LANDSAT.head(key) : await env.LANDSAT.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const h = new Headers({ 'Content-Type': key.endsWith('.json') ? 'application/json' : 'image/jpeg', 'ETag': obj.httpEtag, 'Cache-Control': 'public, max-age=86400' });
  if (request.headers.get('If-None-Match') === obj.httpEtag) return new Response(null, { status: 304, headers: h });
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: h });
}

/* ---------- Front page background (R2 bucket LANDSAT, data/home-bg/{z}/{x}/{y}.webp: Sentinel-2 summer mosaic tiles, scripts/build_home_background.py) ---------- */
async function homeBackground(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Use GET', { status: 405 });
  const key = decodeURIComponent(url.pathname.slice(1));
  if (!env.LANDSAT || !/^data\/home-bg\/\d{1,2}\/\d+\/\d+\.webp$/.test(key)) return new Response('Not found', { status: 404 });
  const obj = request.method === 'HEAD' ? await env.LANDSAT.head(key) : await env.LANDSAT.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } });
  const h = new Headers({ 'Content-Type': 'image/webp', 'ETag': obj.httpEtag, 'Cache-Control': 'public, max-age=86400' });
  if (request.headers.get('If-None-Match') === obj.httpEtag) return new Response(null, { status: 304, headers: h });
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: h });
}

/* ---------- Copernicus ---------- */
function upstream(env) {
  const id = env.CDSE_IDENTITY || 'https://identity.dataspace.copernicus.eu';
  const sh = env.CDSE_SH || 'https://sh.dataspace.copernicus.eu';
  return {
    token: `${id}/auth/realms/CDSE/protocol/openid-connect/token`,
    statistics: `${sh}/statistics/v1`,
    process: `${sh}/process/v1`
  };
}
async function getToken(env, c, force = false) {
  const have = tokens.get(c.n);
  if (!force && have && Date.now() < have.until) return have.token;
  const r = await fetch(upstream(env).token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.id, client_secret: c.secret })
  });
  if (!r.ok) throw new Error(`The relay could not log in to Copernicus with account ${c.n} (HTTP ${r.status}). Check the Worker secrets.`);
  const j = await r.json();
  tokens.set(c.n, { token: j.access_token, until: Date.now() + Math.max(30, (j.expires_in || 300) - 60) * 1000 });
  return j.access_token;
}
async function callCdse(env, target, text, accept) {
  const now = Date.now(), list = clients(env), fresh = list.filter(c => !(spent.get(c.n) > now)), used = list.filter(c => spent.get(c.n) > now);
  let last = null, failure = null;
  for (const c of [...fresh, ...used]) {
    try {
      const go = async force => fetch(target, {
        method: 'POST', body: text,
        headers: { 'Authorization': `Bearer ${await getToken(env, c, force)}`, 'Content-Type': 'application/json', 'Accept': accept }
      });
      let r = await go(false);
      if (r.status === 401) r = await go(true);   // token expired early: log in again once
      if (r.status === 403 && /INSUFFICIENT_PROCESSING_UNITS/.test(await r.clone().text())) { spent.set(c.n, now + 3600e3); last = r; continue; }   // this account is out of units: try the next one
      return r;
    } catch (e) { failure = e; }                 // a login problem with this account: try the next one
  }
  if (last) return last;
  throw failure || new Error('No Copernicus account available.');
}

/* ---------- request checks: only what the explorer needs ---------- */
function insideSwitzerland([w, s, e, n]) {
  return [w, s, e, n].every(Number.isFinite) && w < e && s < n &&
    w >= SWISS.west && e <= SWISS.east && s >= SWISS.south && n <= SWISS.north;
}
function km(lon1, lat1, lon2, lat2) {                                // distance on the globe (haversine)
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
function nearOutlet([w, s, e, n]) {      // the region (is, no, sj) whose glacier centre lies near the box, or null
  if (![w, s, e, n].every(Number.isFinite) || !(w < e && s < n)) return null;
  const lon = (w + e) / 2, lat = (s + n) / 2;
  if ((e - w) * 111.32 * Math.cos(lat * Math.PI / 180) > 110 || (n - s) * 111.32 > 110) return null;   // under about 110 km across (a degree of longitude is short in Svalbard)
  return Object.keys(CENTRES).find(r => CENTRES[r].some(([x, y]) => km(lon, lat, x, y) <= NEAR_KM)) || null;
}
const regionOf = bb => insideSwitzerland(bb) ? 'ch' : nearOutlet(bb);
const regionOfInput = inp => {      // the region of a request's box (checkBounds has already accepted it)
  let bb = inp.bounds.bbox.map(Number);
  if (/3857/.test((inp.bounds.properties && inp.bounds.properties.crs) || '')) { const [w, s] = mercToLonLat(bb[0], bb[1]), [e, n] = mercToLonLat(bb[2], bb[3]); bb = [w, s, e, n]; }
  return regionOf(bb);
};
function mercToLonLat(x, y) {
  const R = 6378137;
  return [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];
}
function checkBounds(inp, collections = [COLLECTION]) {
  if (!inp || !inp.bounds || !Array.isArray(inp.bounds.bbox) || inp.bounds.bbox.length !== 4) return 'bounds';
  const crs = (inp.bounds.properties && inp.bounds.properties.crs) || '';
  let bb = inp.bounds.bbox.map(Number);
  if (/3857/.test(crs)) { const [w, s] = mercToLonLat(bb[0], bb[1]), [e, n] = mercToLonLat(bb[2], bb[3]); bb = [w, s, e, n]; }
  else if (crs && !/4326|CRS84/.test(crs)) return 'coordinate system';
  if (!regionOf(bb)) return 'area outside Switzerland and the glaciers of the other regions';
  if (!geometryInside(inp.bounds.geometry, inp.bounds.bbox.map(Number))) return 'polygon outside its box';
  if (!Array.isArray(inp.data) || inp.data.length !== 1 || !collections.includes(inp.data[0].type)) return 'data collection';
  return null;
}
const DAY_MS = 864e5;
/* "Latest image": the newest clear scene of the last weeks, any month. A statistics window that ends today (or tomorrow) and is at most 75 days long,
   and a picture of a day in the last 130 days. These requests change every day, so they are cached for one day only (see ttlFor). */
const rollingWindow = tr => {
  const re = /^\d{4}-\d{2}-\d{2}T00:00:00Z$/;
  if (!tr || !re.test(tr.from) || !re.test(tr.to)) return false;
  const f = Date.parse(tr.from), e = Date.parse(tr.to), now = Date.now();
  return e > f && e - f <= 75 * DAY_MS && e <= now + 2 * DAY_MS && f >= now - 130 * DAY_MS;
};
const recentDay = d => { const t = Date.parse(d + 'T00:00:00Z'); return Number.isFinite(t) && t <= Date.now() + DAY_MS && t >= Date.now() - 130 * DAY_MS; };
const geometryInside = (g, bb) => {          // every coordinate of an optional polygon lies inside the checked box (so the box check covers the polygon)
  if (!g) return true;
  const walk = c => Array.isArray(c[0]) ? c.every(walk) : (c[0] >= bb[0] - 1 && c[0] <= bb[2] + 1 && c[1] >= bb[1] - 1 && c[1] <= bb[3] + 1);
  return ['Polygon', 'MultiPolygon'].includes(g.type) && Array.isArray(g.coordinates) && walk(g.coordinates);
};
const summerDay = d => /^\d{4}-(0[789]|10)-\d{2}$/.test(d) && yearOk(d.slice(0, 4));   // July to October (the late-season experiment)
function checkProcess(b) {
  const inp = b && b.input, out = b && b.output;
  const bad = checkBounds(inp, [COLLECTION, IMAGES, MOSAIC]); if (bad) return bad;
  const tr = inp.data[0].dataFilter && inp.data[0].dataFilter.timeRange;
  if (!tr || typeof tr.from !== 'string' || !(summerDay(tr.from.slice(0, 10)) || recentDay(tr.from.slice(0, 10))) || tr.from.slice(10) !== 'T00:00:00Z' ||
      tr.to !== tr.from.slice(0, 10) + 'T23:59:59Z') return 'date (one day between July and October, or in the last 130 days)';
  if (inp.data[0].type === MOSAIC && (tr.from.slice(4, 10) !== '-07-01' || regionOfInput(inp) !== 'ch')) return 'mosaic date (the July to September quarter, Switzerland)';
  if (!out || !(out.width > 0 && out.width <= MAX_PX) || !(out.height > 0 && out.height <= MAX_PX)) return 'image size';
  if (!Array.isArray(out.responses) || out.responses.length !== 1 ||
      !['image/jpeg', 'image/png'].includes(out.responses[0].format && out.responses[0].format.type)) return 'output format';
  if (typeof b.evalscript !== 'string' || b.evalscript.length > 2000) return 'evalscript';
  return null;
}
function checkStatistics(b) {
  const bad = checkBounds(b && b.input); if (bad) return bad;
  const ag = b.aggregation;
  const reg = regionOfInput(b.input);
  if (reg !== 'ch') {      // the season of a year (Iceland 1 August to 15 October, Norway 20 July to 30 September, Svalbard 20 July to 15 September; a season that is still running ends today)
    const S = SEASONS[reg], tr = ag && ag.timeRange, re = /^\d{4}-\d{2}-\d{2}T00:00:00Z$/;
    if (!tr || !re.test(tr.from) || !re.test(tr.to) || !yearOk(tr.from.slice(0, 4)) || tr.from.slice(4) !== S.from + 'T00:00:00Z' || tr.to.slice(0, 4) !== tr.from.slice(0, 4) ||
        tr.to <= tr.from || tr.to > tr.from.slice(0, 4) + S.last + 'T00:00:00Z' || Date.parse(tr.to) > Date.now() + 2 * DAY_MS) {
      if (!rollingWindow(tr)) return 'period (the season of a year in this region, or the last 75 days)';      // the "Latest" image: the last weeks, any month
    }
    return statisticsRest(b);
  }
  const summer = ag && ag.timeRange && /^\d{4}-07-01T00:00:00Z$/.test(ag.timeRange.from) && yearOk(ag.timeRange.from.slice(0, 4)) &&
    [ '-09-21T00:00:00Z', '-10-01T00:00:00Z', '-10-11T00:00:00Z', '-11-01T00:00:00Z' ].map(e => ag.timeRange.from.slice(0, 4) + e).includes(ag.timeRange.to);
  if (!ag || !ag.timeRange || !(summer || rollingWindow(ag.timeRange))) return 'period (July 1 to the end of October of one year, or the last 75 days)';
  return statisticsRest(b);
}
function statisticsRest(b) {      // the checks of a scene search that do not depend on the region
  const ag = b.aggregation;
  if (!ag.aggregationInterval || ag.aggregationInterval.of !== 'P1D') return 'interval';
  if (!(ag.resx >= MIN_STATS_RES && ag.resy >= MIN_STATS_RES)) return 'resolution';
  if (typeof ag.evalscript !== 'string' || ag.evalscript.length > 2000) return 'evalscript';
  if (b.calculations && JSON.stringify(b.calculations).length > 500) return 'calculations';
  return null;
}
/* Images of a fixed day never change: keep them long. Scene scores of a past summer are final;
   for the current summer new acquisitions arrive, so they are refreshed once a day
   (fewer KV writes; the free plan allows 1,000 a day). */
function ttlFor(route, body) {
  if (route === 'process') return 180 * DAY;
  const tr = body.aggregation.timeRange;
  if (!/^\d{4}-(0[78]-01|07-20)T00:00:00Z$/.test(tr.from)) return DAY;       // a rolling window ("latest image") changes every day
  const year = +tr.from.slice(0, 4);
  return year < new Date().getUTCFullYear() ? 180 * DAY : DAY;
}

/* ---------- cache: KV if bound, otherwise the edge cache ----------
   Entries that are only fresh for a day (the current summer, the latest image) stay in KV for STALE_KEEP, marked stale after their day: they are used again
   only when Copernicus cannot answer (see fetch). Long-lived entries are never stale. The edge cache (no KV) has no stale copies. */
const STALE_KEEP = 7 * DAY;
const staleResponse = (hit, cors) => new Response(hit.body, { headers: { ...cors, 'Content-Type': hit.type, 'X-Cache': 'STALE' } });
async function cacheGet(env, key) {
  try {
    if (env.CACHE) {
      const v = await env.CACHE.getWithMetadata(key, 'arrayBuffer');
      if (v && v.value) return { body: v.value, type: (v.metadata && v.metadata.type) || 'application/octet-stream', stale: !!(v.metadata && v.metadata.fresh && Date.now() > v.metadata.fresh) };
    } else if (typeof caches !== 'undefined') {
      const r = await caches.default.match(cacheUrl(key));
      if (r) return { body: await r.arrayBuffer(), type: r.headers.get('Content-Type') };
    }
  } catch {}
  return null;
}
async function cachePut(env, key, data, type, ttl) {
  try {
    if (env.CACHE) return await env.CACHE.put(key, data, { expirationTtl: Math.max(ttl, STALE_KEEP), metadata: { type, fresh: Date.now() + ttl * 1000 } });
    if (typeof caches !== 'undefined')
      await caches.default.put(cacheUrl(key), new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${ttl}` } }));
  } catch {}
}
const cacheUrl = key => `https://tonguesfromspace-cache.internal/${encodeURIComponent(key)}`;

/* ---------- helpers ---------- */
// Which controls are used (js/track.js). One data point per click in Workers Analytics Engine: blobs = event, glacier, page, device, country, and for the event error-js a short note
// of what went wrong in the page (80 characters, conservative alphabet); no IP address, cookie or user id.
// Same origin only; the name and glacier must look like names, the body is capped, and the answer is always 204 so nothing can be probed.
async function countEvent(request, env) {
  const ok = new Response(null, { status: 204 });
  if (request.method !== 'POST' || !env.EVENTS) return ok;
  const origin = request.headers.get('Origin') || '';
  if (!(env.ALLOWED_ORIGINS || '').split(',').includes(origin)) return ok;
  let b;
  try { const text = await request.text(); if (text.length > 400) return ok; b = JSON.parse(text); } catch (e) { return ok; }
  const name = /^[a-z0-9-]{1,40}$/, e = String(b.e || ''), g = String(b.g || ''), p = String(b.p || '');
  if (!name.test(e) || (g && !name.test(g)) || !/^[a-z0-9\/._-]{0,60}$/i.test(p)) return ok;
  const m = String(b.m || '').replace(/[^A-Za-z0-9 ._:\/()'-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);      // only for error-js: what went wrong in the page, in a conservative alphabet
  env.EVENTS.writeDataPoint({ blobs: [e, g, p, b.d === 'm' ? 'm' : 'd', request.cf?.country || '', e === 'error-js' ? m : ''], indexes: [e] });
  return ok;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://tonguesfromspace.org,https://www.tonguesfromspace.org,http://localhost:8000')
    .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
              'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (allowed.includes(origin) || origin === new URL(request.url).origin) h['Access-Control-Allow-Origin'] = origin;      // the site's own address always counts (the Worker serves the page too)
  return h;
}
/* Failures of the relay, one JSON line each in Workers Logs (dashboard: Workers -> this Worker -> Logs, or `npx wrangler tail`): what failed and for which request type.
   No IP address, no body of a request, nothing a visitor typed. */
const logError = (evt, data = {}) => console.error(JSON.stringify({ evt, ...data }));
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}


/* ---------- "please add this glacier" ----------
   The front page offers it when a search finds nothing. A person (Cloudflare Turnstile, the same keys as the gallery) sends the name they looked for, and it
   is accepted only when it is a glacier we can find on a list: Wikidata (CC0; the name is searched in a few languages and the hit must be an item whose class is
   glacier, wdt:P31/wdt:P279* wd:Q35666, the class walkthrough/build-aliases.ts uses), or else the Randolph Glacier Inventory 6.0's own names, asked from GLIMS'
   public service like walkthrough/sources/glims.ts findByName. The request is kept in KV under ask/<Wikidata id or GLIMS id>, so every spelling of one
   glacier counts together, with the names people typed, a counter and the dates; the owner reads them with GET /ask/admin/list
   (GALLERY_ADMIN_TOKEN) and removes one with DELETE /ask/admin/<id>. Only a short name is accepted, per address a few an hour, and at most ASK.max different
   glaciers are kept, so a flood cannot grow storage without limit. Records expire after a year. Closed (no button on the page) without CACHE,
   TURNSTILE_SECRET and TURNSTILE_SITEKEY. */
const ASK = { max: 1000, perHour: 5, keep: 365 * 86400, adminFails: 10, langs: ['en', 'de', 'fr', 'it'] };
const askSends = new Map();                                          // ip -> [timestamps in ms]
const askName = /^[\p{L}\p{N}][\p{L}\p{N} .,'’()\/-]{1,79}$/u;
const WD_UA = { 'User-Agent': 'tonguesfromspace-worker/1.0 (https://tonguesfromspace.org)' };
async function wikidataGlacier(name, lang) {                         // the Wikidata glacier the name means, or null
  const langs = [...new Set([...ASK.langs, ...(/^[a-z]{2,3}$/.test(lang) ? [lang] : [])])];
  const hits = await Promise.all(langs.map(l => fetch('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbsearchentities', search: name, language: l, type: 'item', limit: '10', format: 'json' }), { headers: WD_UA })
    .then(r => r.ok ? r.json() : { search: [] }).then(j => j.search || []).catch(() => [])));
  const found = new Map();
  for (const h of hits.flat()) if (/^Q\d+$/.test(h.id) && !found.has(h.id)) found.set(h.id, h.label || name);
  if (!found.size) return null;
  const query = `SELECT ?i WHERE { VALUES ?i { ${[...found.keys()].slice(0, 40).map(q => 'wd:' + q).join(' ')} } ?i wdt:P31/wdt:P279* wd:Q35666 }`;
  const r = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({ query }), { headers: { ...WD_UA, Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error('Wikidata answered ' + r.status);
  const j = await r.json(), q = (j.results.bindings[0] || { i: { value: '' } }).i.value.split('/').pop();
  return q ? { q, label: found.get(q) } : null;
}
const RGI_LAYERS = ['Alaska', 'WesternCanadaUS', 'ArcticCanadaNorth', 'ArcticCanadaSouth', 'GreenlandPeriphery', 'Iceland', 'Svalbard', 'Scandinavia', 'RussianArctic', 'NorthAsia',
  'CentralEurope', 'CaucasusMiddleEast', 'CentralAsia', 'SouthAsiaWest', 'SouthAsiaEast', 'LowLatitudes', 'SouthernAndes', 'NewZealand', 'AntarcticSubantarctic'];   // GLIMS:RGI_<name>, as in walkthrough/sources/glims.ts
const foldName = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
async function rgiGlacier(name) {                                    // a glacier the Randolph Glacier Inventory names like this, or null
  const safe = name.replace(/[^\p{L}\p{N} .-]/gu, '').trim();       // no quote can get into the filter
  if (safe.length < 3) return null;
  const want = ' ' + foldName(safe) + ' ';
  const layers = await Promise.all(RGI_LAYERS.map(l => fetch('https://www.glims.org/geoserver/ows?' + new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: 'GLIMS:RGI_' + l,
    outputFormat: 'application/json', maxFeatures: '10', cql_filter: `NAME ILIKE '%${safe}%'` }), { headers: WD_UA }).then(r => r.ok ? r.json() : { features: [] }).then(j => j.features || []).catch(() => [])));
  for (const x of layers.flat()) {
    const n = String((x.properties || {}).NAME || '').trim(), id = String((x.properties || {}).GLIMSID || '');
    if (n && /^G\d{6}E\d{5}[NS]$/.test(id) && (' ' + foldName(n) + ' ').includes(want)) return { q: id, label: n };      // the name as a whole word (or words) of the inventory's name
  }
  return null;
}
async function ask(request, env, url, cors) {
  const path = url.pathname.slice('/ask/'.length), m = request.method, ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const open = !!(env.CACHE && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY);
  if (path === 'config' && m === 'GET') return json({ open, siteKey: open ? env.TURNSTILE_SITEKEY : '' }, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
  if (path === 'glacier' && m === 'POST') {
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    if (!open) return json({ error: 'Requests are not open yet.' }, 503, cors);
    if (overHourly(askSends, ip, ASK.perHour)) return json({ error: 'Too many requests from this address. Please try again later.' }, 429, { ...cors, 'Retry-After': '3600' });
    let body;
    try { if ((+request.headers.get('Content-Length') || 0) > 3000) throw 0; body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400, cors); }
    const name = typeof body.name === 'string' ? body.name.normalize('NFC').replace(/\s+/g, ' ').trim() : '', token = body.token;
    if (!askName.test(name) || typeof token !== 'string' || token.length > 2100) return json({ error: 'Invalid request' }, 400, cors);
    const t = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) }).then(r => r.json()).catch(() => null);
    if (!t || !t.success) return json({ error: 'The check "are you a person" failed. Please try again.' }, 403, cors);
    let g;
    try { g = await wikidataGlacier(name, typeof body.lang === 'string' ? body.lang : '').catch(() => null) || await rgiGlacier(name); } catch { return json({ error: 'The glacier list could not be reached. Please try again later.' }, 502, cors); }
    if (!g) return json({ error: 'unknown', message: `“${name}” is not a glacier I can find in Wikidata or in the Randolph Glacier Inventory. Please check the spelling.` }, 404, cors);
    const key = 'ask/' + g.q, old = await env.CACHE.get(key, 'json'), now = new Date().toISOString();
    if (!old && (await env.CACHE.list({ prefix: 'ask/', limit: ASK.max })).keys.length >= ASK.max) return json({ error: 'Too many requests are waiting. Please try again later.' }, 503, cors);
    const typed = old ? [...new Set([...old.typed, name])].slice(0, 8) : [name];
    await env.CACHE.put(key, JSON.stringify({ q: g.q, label: g.label, typed, count: (old ? old.count : 0) + 1, first: old ? old.first : now, last: now }), { expirationTtl: ASK.keep });
    return json({ ok: true, label: g.label }, 200, cors);
  }
  if (path.startsWith('admin/')) {
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    const want = env.GALLERY_ADMIN_TOKEN || '', got = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if ((galFails.get(ip) || []).filter(x => Date.now() - x < 3600e3).length >= ASK.adminFails) return json({ error: 'Too many attempts' }, 429, cors);
    if (want.length < 20 || !(await sameText(got, want))) { overHourly(galFails, ip, Infinity); return json({ error: 'Not allowed' }, 401, cors); }
    if (!env.CACHE) return json({ error: 'No storage' }, 503, cors);
    const a = path.slice('admin/'.length);
    if (a === 'list' && m === 'GET') {
      const l = await env.CACHE.list({ prefix: 'ask/', limit: ASK.max }), items = [];
      for (const k of l.keys) { const v = await env.CACHE.get(k.name, 'json'); if (v) items.push(v); }
      return json({ items: items.sort((x, y) => y.count - x.count || (y.last > x.last ? 1 : -1)) }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }
    if (/^(Q\d+|G\d{6}E\d{5}[NS])$/.test(a) && m === 'DELETE') { await env.CACHE.delete('ask/' + a); return json({ ok: true }, 200, cors); }
  }
  return json({ error: 'Not found' }, 404, cors);
}

/* ---------- gallery ----------
   Visitors share a finished picture or video. Everything the browser sends is checked here: size, the real file type
   (first bytes), the pixel size (must be one of the three export formats) and a fixed list of metadata fields. A person is
   checked with Cloudflare Turnstile. New items land in pending/ and are never served; they are published by moving them to
   approved/ (tools/gallery-admin.html). The queue has a fixed size, so a flood of uploads cannot grow storage without limit.
   Set an R2 lifecycle rule on the prefix pending/ (delete after 14 days) so unapproved items disappear by themselves. */
const GAL = { maxVideo: 15e6, maxImage: 4e6, maxPending: 200, perHour: 4, adminFails: 10 };
const GAL_FORMATS = { reel: [1080, 1920], feed: [1080, 1350], wide: [1920, 1080] };
const GAL_TYPES = { still: 'image', timelapse: 'video', slider: 'video', area: 'image', areafly: 'video', volume: 'image', volumefilm: 'video' };
/* size.html ("How big are glaciers?"): Area 2D (outlines laid onto a city or each other; the video is the fly-in) and Volume 3D (ice cubes; the video is the film). They have no colour composition
   and one reference year, and are made in the same three formats. */
const GAL_SIZE_VIEW = { area: 'area', areafly: 'area', volume: 'volume', volumefilm: 'volume' };
const GAL_STYLES = ['natural', 'false1', 'false2', 'false3'];
const galUploads = new Map();                                        // ip -> [timestamps in ms]
const galFails = new Map();                                          // ip -> [timestamps of wrong admin tokens]
const overHourly = (map, ip, limit) => {                                    // true if the visitor is over the limit; otherwise counts this one
  const now = Date.now(), list = (map.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= limit) { map.set(ip, list); return true; }
  list.push(now); map.set(ip, list);
  if (map.size > 5000) for (const [k, v] of map) if (!v.length || now - v[v.length - 1] > 3600e3) map.delete(k);
  return false;
};
const GAL_LIST_KEY = 'https://tonguesfromspace-cache.internal/gallery-list';
const ctxPut = (cache, key, body) => cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } })).catch(() => {});
const ID = /^[a-f0-9]{24}$/;
const noSniff = { 'X-Content-Type-Options': 'nosniff' };

async function gallery(request, env, url, cors, ctx) {
  const path = url.pathname.slice('/gallery/'.length), m = request.method, ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const open = !!(env.GALLERY && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY);
  if (path === 'config' && m === 'GET') return json({ open, siteKey: open ? env.TURNSTILE_SITEKEY : '', listing: !!env.GALLERY }, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
  if (!env.GALLERY) return json({ error: 'The gallery is not set up yet.' }, 503, cors);

  if (path === 'list' && m === 'GET') {
    const cache = typeof caches !== 'undefined' ? caches.default : null, ckey = GAL_LIST_KEY;   // the list is kept 2 minutes at the edge: one page view must not cost one R2 list operation
    const hot = cache && await cache.match(ckey).catch(() => null);
    if (hot) return new Response(hot.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'X-Cache': 'HIT' } });
    const items = [];
    let cursor;
    for (let page = 0; page < 5; page++) {
      const l = await env.GALLERY.list({ prefix: 'approved/', include: ['customMetadata'], cursor });
      for (const o of l.objects) { const it = itemOf(o, 'approved/'); if (it) items.push(it); }
      if (!l.truncated) break;
      cursor = l.cursor;
    }
    items.sort((a, b) => b.ts - a.ts);
    const body = JSON.stringify({ items });
    if (cache) await ctxPut(cache, ckey, body);
    return new Response(body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'X-Cache': 'MISS' } });
  }
  const file = path.match(/^file\/([a-f0-9]{24})$/);
  if (file && (m === 'GET' || m === 'HEAD')) return galleryFile(request, env, 'approved/' + file[1], cors, 'public, max-age=86400', url.searchParams.get('download') === '1');

  if (path === 'submit' && m === 'POST') return gallerySubmit(request, env, cors, ip, ctx);

  if (path.startsWith('admin/')) {
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    const want = env.GALLERY_ADMIN_TOKEN || '', got = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const failed = (galFails.get(ip) || []).filter(t => Date.now() - t < 3600e3).length >= GAL.adminFails;
    if (failed) return json({ error: 'Too many attempts' }, 429, cors);
    if (want.length < 20 || !(await sameText(got, want))) { overHourly(galFails, ip, Infinity); return json({ error: 'Not allowed' }, 401, cors); }
    const a = path.slice('admin/'.length);
    if (a === 'pending' && m === 'GET') {
      const l = await env.GALLERY.list({ prefix: 'pending/', include: ['customMetadata'], limit: GAL.maxPending });
      return json({ items: l.objects.map(o => itemOf(o, 'pending/')).filter(Boolean).sort((x, y) => y.ts - x.ts) }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }
    const pf = a.match(/^file\/(pending|approved)\/([a-f0-9]{24})$/);
    if (pf && m === 'GET') return galleryFile(request, env, pf[1] + '/' + pf[2], cors, 'no-store');
    if (m === 'POST' && ['approve', 'reject', 'remove'].includes(a)) {
      let id; try { id = (await request.json()).id; } catch {}
      if (!ID.test(id || '')) return json({ error: 'Bad id' }, 400, cors);
      if (a === 'approve') {
        const o = await env.GALLERY.get('pending/' + id);
        if (!o) return json({ error: 'Not found' }, 404, cors);
        await env.GALLERY.put('approved/' + id, await o.arrayBuffer(), { httpMetadata: { contentType: o.httpMetadata.contentType }, customMetadata: o.customMetadata });
        await env.GALLERY.delete('pending/' + id);
      } else await env.GALLERY.delete((a === 'remove' ? 'approved/' : 'pending/') + id);
      if (typeof caches !== 'undefined') await caches.default.delete(GAL_LIST_KEY).catch(() => {});   // the public list changes now
      return json({ ok: true }, 200, cors);
    }
  }
  return json({ error: 'Not found' }, 404, cors);
}

function itemOf(o, prefix) {
  try {
    const meta = JSON.parse(o.customMetadata && o.customMetadata.meta);
    return { id: o.key.slice(prefix.length), ...meta, ts: +o.customMetadata.ts || 0, bytes: o.size };
  } catch { return null; }
}

async function galleryFile(request, env, key, cors, cache, download = false) {
  const o = await env.GALLERY.get(key, { range: request.headers });
  if (!o) return json({ error: 'Not found' }, 404, cors);
  const h = new Headers({ ...cors, ...noSniff, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin',
    'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'Content-Type': o.httpMetadata.contentType, 'ETag': o.httpEtag });
  if (download) {                                                    // a link to another site cannot use the download attribute: the server asks the browser to save the file
    let m = {}; try { m = JSON.parse(o.customMetadata.meta); } catch {}
    const slug = String(m.name || 'glacier').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'glacier';
    const yrs = Array.isArray(m.years) ? [m.years[0], m.years[m.years.length - 1]].filter((y, i, a) => a.indexOf(y) === i).join('-') : '';
    h.set('Content-Disposition', `attachment; filename="tonguesfromspace-${slug}-${yrs}-${m.type || 'item'}-${{ reel: '9x16', feed: '4x5', wide: '16x9' }[m.fmt] || ''}.${m.kind === 'video' ? 'mp4' : 'jpg'}"`);
  }
  let status = 200;
  if (o.range && o.range.offset !== undefined) {
    const start = o.range.offset, len = o.range.length !== undefined ? o.range.length : o.size - start;
    h.set('Content-Range', `bytes ${start}-${start + len - 1}/${o.size}`); h.set('Content-Length', String(len)); status = 206;
  } else h.set('Content-Length', String(o.size));
  return new Response(request.method === 'HEAD' ? null : o.body, { status, headers: h });
}

async function gallerySubmit(request, env, cors, ip, ctx) {
  if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
  if (!(env.GALLERY && env.TURNSTILE_SECRET)) return json({ error: 'The gallery is not open for uploads yet.' }, 503, cors);
  const len = +request.headers.get('Content-Length') || 0;
  if (!len || len > GAL.maxVideo + 20000) return json({ error: 'File too large' }, 413, cors);
  if (overHourly(galUploads, ip, GAL.perHour)) return json({ error: 'Too many uploads from this address. Please try again later.' }, 429, { ...cors, 'Retry-After': '3600' });
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid upload' }, 400, cors); }
  const file = form.get('file'), rawMeta = form.get('meta'), token = form.get('token');
  if (!file || typeof file === 'string' || typeof rawMeta !== 'string' || rawMeta.length > 1500 || typeof token !== 'string' || token.length > 2100)
    return json({ error: 'Invalid upload' }, 400, cors);

  let meta; try { meta = JSON.parse(rawMeta); } catch { return json({ error: 'Invalid details' }, 400, cors); }
  const clean = cleanMeta(meta);
  if (typeof clean === 'string') return json({ error: 'Invalid details: ' + clean }, 400, cors);

  const t = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) }).then(r => r.json()).catch(() => null);
  if (!t || !t.success) return json({ error: 'The check "are you a person" failed. Please try again.' }, 403, cors);

  const buf = new Uint8Array(await file.arrayBuffer());
  const bad = checkFile(buf, clean);
  if (bad) return json({ error: 'Invalid file: ' + bad }, 400, cors);

  const id = (await sha256hex(buf)).slice(0, 24);
  if (await env.GALLERY.head('pending/' + id) || await env.GALLERY.head('approved/' + id)) return json({ error: 'This file was already shared.' }, 409, cors);
  const queue = await env.GALLERY.list({ prefix: 'pending/', limit: GAL.maxPending });
  if (queue.objects.length >= GAL.maxPending) return json({ error: 'The gallery is waiting for review of earlier pictures. Please try again in a few days.' }, 503, cors);
  await env.GALLERY.put('pending/' + id, buf, { httpMetadata: { contentType: clean.kind === 'video' ? 'video/mp4' : 'image/jpeg' },
    customMetadata: { meta: JSON.stringify(clean), ts: String(Date.now()) } });
  if (!env.GALLERY_NOTIFY_URL) console.log('gallery ping: GALLERY_NOTIFY_URL is not set on this Worker');
  else {                                              // a push message to the owner (an ntfy.sh topic URL); a failure never fails the upload
    const what = clean.kind === 'video' ? 'animation' : 'picture', who = clean.nick ? ' from ' + clean.nick : '';
    const ping = fetch(env.GALLERY_NOTIFY_URL, { method: 'POST', body: `New ${what} of ${clean.name} (${clean.years.join(', ')})${who} is waiting for approval in the gallery (${queue.objects.length + 1} in the queue).`,
      headers: { Title: 'Tongues from Space: gallery upload', Tags: 'mountain_snow', Click: 'https://tonguesfromspace.org/mod-e36f805dfe9d.html', ...(env.GALLERY_NOTIFY_TOKEN ? { Authorization: 'Bearer ' + env.GALLERY_NOTIFY_TOKEN } : {}) } })
      .then(async r => { if (!r.ok) console.log('gallery ping refused', r.status, env.GALLERY_NOTIFY_TOKEN ? '(token sent)' : '(NO token set on this Worker)', (await r.text().catch(() => '')).slice(0, 300)); }).catch(e => console.log('gallery ping failed', String(e)));
    if (ctx && ctx.waitUntil) ctx.waitUntil(ping);
  }
  return json({ ok: true }, 200, cors);
}

/* Only these fields, only these values. Nothing the visitor types is kept except a short nickname. */
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return 'details';
  const type = m.type, fmt = m.fmt, style = m.style;
  if (!(type in GAL_TYPES)) return 'type';
  if (!(fmt in GAL_FORMATS)) return 'format';
  if (!GAL_STYLES.includes(style)) return 'colours';
  if (typeof m.glacier !== 'string' || !/^[A-Za-z0-9_.-]{1,30}$/.test(m.glacier)) return 'glacier';
  if (typeof m.name !== 'string' || !/^[\p{L}\p{N} .'’-]{1,40}$/u.test(m.name)) return 'glacier name';
  if (!Array.isArray(m.years) || m.years.length < 1 || m.years.length > 15 || !m.years.every(yearOk)) return 'years';
  const size = GAL_SIZE_VIEW[type];                                           // a size-page item: its view follows from its type, one reference year
  if (size && (m.view !== size || m.years.length !== 1 || style !== 'natural')) return 'size view';
  const view = size || (m.view === '3d' ? '3d' : 'map');                    // the 3D view of a tongue; its camera video may show a single year
  if (!size && (GAL_TYPES[type] === 'image' ? m.years.length > 2 : m.years.length < (view === '3d' ? 1 : 2))) return 'years';      // a picture shows one year, or two (Compare)
  let nick = '';
  if (m.nick !== undefined && m.nick !== '') {
    if (typeof m.nick !== 'string' || !/^[\p{L}\p{N} ._'’@-]{1,30}$/u.test(m.nick.trim())) return 'nickname';
    nick = m.nick.trim();
  }
  return { glacier: m.glacier, name: m.name, years: m.years.map(Number), kind: GAL_TYPES[type], type, view, fmt, style, nick };
}

/* The file must really be a JPEG (still) or an MP4 (video) with the exact pixel size of its format. */
function checkFile(b, meta) {
  const [w, h] = GAL_FORMATS[meta.fmt];
  if (meta.kind === 'image') {
    if (b.length > GAL.maxImage || b.length < 1000) return 'size';
    if (b[0] !== 0xFF || b[1] !== 0xD8 || b[2] !== 0xFF) return 'not a JPEG';
    for (let i = 2; i + 9 < b.length;) {                              // walk the JPEG segments to the frame header
      if (b[i] !== 0xFF) return 'not a JPEG';
      const mk = b[i + 1], seg = (b[i + 2] << 8) | b[i + 3];
      if (mk >= 0xC0 && mk <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(mk)) return ((b[i + 7] << 8) | b[i + 8]) === w && ((b[i + 5] << 8) | b[i + 6]) === h ? null : 'picture size';
      if (mk === 0xDA) break;
      i += 2 + seg;
    }
    return 'not a JPEG';
  }
  if (b.length > GAL.maxVideo || b.length < 5000) return 'size';
  if (String.fromCharCode(b[4], b[5], b[6], b[7]) !== 'ftyp') return 'not an MP4';
  const head = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 200000))), at = head.indexOf('avc1', head.indexOf('stsd') + 1);   // 'avc1' also appears in the ftyp brands: look from the sample description on
  if (head.indexOf('stsd') < 0 || at < 0) return 'not H.264';
  const o = at + 4 + 24;                                              // after the sample entry header: width, height
  return ((b[o] << 8) | b[o + 1]) === w && ((b[o + 2] << 8) | b[o + 3]) === h ? null : 'video size';
}
async function sha256hex(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function sameText(a, b) {                                       // compares hashes, so the time taken does not reveal how much matched
  const [x, y] = await Promise.all([sha256hex(new TextEncoder().encode(a)), sha256hex(new TextEncoder().encode(b))]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
