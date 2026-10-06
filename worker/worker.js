/**
 * Swiss Glacier Tongues from Space - Copernicus relay (Cloudflare Worker)
 *
 * Lets visitors of the public site see Copernicus Sentinel-2 images without an account: the
 * Worker logs in to the Copernicus Data Space Ecosystem with YOUR credentials (stored as
 * encrypted Worker secrets), forwards the dashboard's requests and caches the answers.
 *
 * Only the two requests this dashboard makes are accepted, so the relay cannot be used to spend
 * your quota on anything else:
 *   statistics  scoring of all Sentinel-2 L2A scenes of one summer (July 1 - October 1) over a
 *               Swiss glacier, daily, at coarse resolution
 *   process     the image of one chosen day between July and September, over a Swiss glacier,
 *               or the July-September quarterly mosaic around it (background)
 *
 * Settings (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets):
 *   CDSE_CLIENT_ID      secret   OAuth client ID from the CDSE dashboard
 *   CDSE_CLIENT_SECRET  secret   OAuth client secret
 *   ALLOWED_ORIGINS     text     e.g. "https://braakhekke.github.io,http://localhost:8000"
 *   CACHE               KV namespace binding (optional but recommended): image cache
 *
 * Endpoints (same paths as scripts/serve.py):
 *   GET  /cdse/ping        -> {"relay":true,"managed":true}
 *   POST /cdse/statistics  -> Statistical API (which summer scene is clearest)
 *   POST /cdse/process     -> Process API image
 */

const COLLECTION = 'sentinel-2-l2a';                              // scene scoring (scene classification)
const IMAGES = 'sentinel-2-l1c';                                  // the images themselves (no shadow infill)
const MOSAIC = 'byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca';     // Sentinel-2 quarterly cloudless mosaics (background)
const SWISS = { west: 5.8, east: 10.6, south: 45.7, north: 47.9 }; // WGS84, with a margin
const MAX_PX = 2500;
const MIN_STATS_RES = 40;                                           // metres (CRS units); keeps scene scoring cheap
const DAY = 86400;

let token = null, tokenUntil = 0;                                    // reused while the isolate lives

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/cdse/ping') return json({ relay: true, managed: true }, 200, cors);

    const route = { '/cdse/statistics': 'statistics', '/cdse/process': 'process' }[url.pathname];
    if (!route) return json({ error: 'Not found' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    if (!env.CDSE_CLIENT_ID || !env.CDSE_CLIENT_SECRET)
      return json({ relayError: 'The relay has no Copernicus credentials yet (set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET).' }, 502, cors);

    const text = await request.text();
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
    const problem = route === 'process' ? checkProcess(body) : checkStatistics(body);
    if (problem) return json({ error: `Request not allowed: ${problem}` }, 400, cors);

    // cache lookup
    const key = `${route}:${await sha256(text)}`;
    const hit = await cacheGet(env, key);
    if (hit) return new Response(hit.body, { headers: { ...cors, 'Content-Type': hit.type, 'X-Cache': 'HIT' } });

    // forward to Copernicus
    const up = upstream(env);
    let r;
    try {
      r = await callCdse(env, up[route], text, route === 'process' ? 'image/jpeg' : 'application/json');
    } catch (e) {
      return json({ relayError: e.message }, 502, cors);
    }
    const type = r.headers.get('Content-Type') || 'application/octet-stream';
    const data = await r.arrayBuffer();
    if (r.ok) ctx.waitUntil(cachePut(env, key, data, type, ttlFor(route, body)));
    return new Response(data, { status: r.status, headers: { ...cors, 'Content-Type': type, 'X-Cache': 'MISS' } });
  }
};

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
async function getToken(env, force = false) {
  if (!force && token && Date.now() < tokenUntil) return token;
  const r = await fetch(upstream(env).token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.CDSE_CLIENT_ID, client_secret: env.CDSE_CLIENT_SECRET })
  });
  if (!r.ok) throw new Error(`The relay could not log in to Copernicus (HTTP ${r.status}). Check the Worker secrets.`);
  const j = await r.json();
  token = j.access_token;
  tokenUntil = Date.now() + Math.max(30, (j.expires_in || 300) - 60) * 1000;
  return token;
}
async function callCdse(env, target, text, accept) {
  const go = async force => fetch(target, {
    method: 'POST', body: text,
    headers: { 'Authorization': `Bearer ${await getToken(env, force)}`, 'Content-Type': 'application/json', 'Accept': accept }
  });
  let r = await go(false);
  if (r.status === 401) r = await go(true);   // token expired early: log in again once
  return r;
}

/* ---------- request checks: only what the dashboard needs ---------- */
function insideSwitzerland([w, s, e, n]) {
  return [w, s, e, n].every(Number.isFinite) && w < e && s < n &&
    w >= SWISS.west && e <= SWISS.east && s >= SWISS.south && n <= SWISS.north;
}
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
  if (!insideSwitzerland(bb)) return 'area outside Switzerland';
  if (!Array.isArray(inp.data) || inp.data.length !== 1 || !collections.includes(inp.data[0].type)) return 'data collection';
  return null;
}
const summerDay = d => /^\d{4}-0[789]-\d{2}$/.test(d);
function checkProcess(b) {
  const inp = b && b.input, out = b && b.output;
  const bad = checkBounds(inp, [COLLECTION, IMAGES, MOSAIC]); if (bad) return bad;
  const tr = inp.data[0].dataFilter && inp.data[0].dataFilter.timeRange;
  if (!tr || typeof tr.from !== 'string' || !summerDay(tr.from.slice(0, 10)) || tr.from.slice(10) !== 'T00:00:00Z' ||
      tr.to !== tr.from.slice(0, 10) + 'T23:59:59Z') return 'date (one day between July and September)';
  if (inp.data[0].type === MOSAIC && tr.from.slice(4, 10) !== '-07-01') return 'mosaic date (the July to September quarter)';
  if (!out || !(out.width > 0 && out.width <= MAX_PX) || !(out.height > 0 && out.height <= MAX_PX)) return 'image size';
  if (!Array.isArray(out.responses) || out.responses.length !== 1 ||
      !['image/jpeg', 'image/png'].includes(out.responses[0].format && out.responses[0].format.type)) return 'output format';
  if (typeof b.evalscript !== 'string' || b.evalscript.length > 2000) return 'evalscript';
  return null;
}
function checkStatistics(b) {
  const bad = checkBounds(b && b.input); if (bad) return bad;
  const ag = b.aggregation;
  if (!ag || !ag.timeRange || !/^\d{4}-07-01T00:00:00Z$/.test(ag.timeRange.from) ||
      ![ '-09-21T00:00:00Z', '-10-01T00:00:00Z' ].map(e => ag.timeRange.from.slice(0, 4) + e).includes(ag.timeRange.to)) return 'period (July 1 to September 20 of one year)';
  if (!ag.aggregationInterval || ag.aggregationInterval.of !== 'P1D') return 'interval';
  if (!(ag.resx >= MIN_STATS_RES && ag.resy >= MIN_STATS_RES)) return 'resolution';
  if (typeof ag.evalscript !== 'string' || ag.evalscript.length > 2000) return 'evalscript';
  if (b.calculations && JSON.stringify(b.calculations).length > 500) return 'calculations';
  return null;
}
/* Images of a fixed day never change: keep them long. Scene scores of a past summer are final;
   for the current summer new acquisitions arrive, so they are refreshed every 6 hours. */
function ttlFor(route, body) {
  if (route === 'process') return 180 * DAY;
  const year = +body.aggregation.timeRange.from.slice(0, 4);
  return year < new Date().getUTCFullYear() ? 180 * DAY : 6 * 3600;
}

/* ---------- cache: KV if bound, otherwise the edge cache ---------- */
async function cacheGet(env, key) {
  try {
    if (env.CACHE) {
      const v = await env.CACHE.getWithMetadata(key, 'arrayBuffer');
      if (v && v.value) return { body: v.value, type: (v.metadata && v.metadata.type) || 'application/octet-stream' };
    } else if (typeof caches !== 'undefined') {
      const r = await caches.default.match(cacheUrl(key));
      if (r) return { body: await r.arrayBuffer(), type: r.headers.get('Content-Type') };
    }
  } catch {}
  return null;
}
async function cachePut(env, key, data, type, ttl) {
  try {
    if (env.CACHE) return await env.CACHE.put(key, data, { expirationTtl: ttl, metadata: { type } });
    if (typeof caches !== 'undefined')
      await caches.default.put(cacheUrl(key), new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${ttl}` } }));
  } catch {}
}
const cacheUrl = key => `https://tonguesfromspace-cache.internal/${encodeURIComponent(key)}`;

/* ---------- helpers ---------- */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://braakhekke.github.io,http://localhost:8000')
    .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept',
              'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
