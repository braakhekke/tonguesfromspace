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
 *   CDSE_CLIENT_ID_2 / CDSE_CLIENT_SECRET_2   optional second account (and _3, _4, _5): used when the first has no processing units left
 *   ALLOWED_ORIGINS     text     e.g. "https://braakhekke.github.io,http://localhost:8000"
 *   CACHE               KV namespace binding (optional but recommended): image cache
 *   Gallery (all optional; without them the gallery stays closed for uploads):
 *   GALLERY             R2 bucket binding: the shared pictures and videos (pending/ and approved/)
 *   TURNSTILE_SECRET    secret: Cloudflare Turnstile secret key (checks that an upload comes from a person)
 *   TURNSTILE_SITEKEY   text: Turnstile site key (public, handed to the page)
 *   GALLERY_ADMIN_TOKEN secret: at least 20 random characters; lets tools/gallery-admin.html approve or remove items
 *
 * Endpoints (same paths as scripts/serve.py):
 *   GET  /cdse/ping        -> {"relay":true,"managed":true}
 *   POST /cdse/statistics  -> Statistical API (which summer scene is clearest)
 *   POST /cdse/process     -> Process API image
 *   GET  /gallery/config, /gallery/list, /gallery/file/<id>   public gallery (approved items only)
 *   POST /gallery/submit   upload of a finished picture or video (waits for approval)
 *   /gallery/admin/*       moderation, needs the admin token
 */

const COLLECTION = 'sentinel-2-l2a';                              // scene scoring (scene classification)
const IMAGES = 'sentinel-2-l1c';                                  // the images themselves (no shadow infill)
const MOSAIC = 'byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca';     // Sentinel-2 quarterly cloudless mosaics (background)
const SWISS = { west: 5.8, east: 10.6, south: 45.7, north: 47.9 }; // WGS84, with a margin
const MAX_PX = 2500;
const MAX_BODY = 20000;                                             // characters; the dashboard's own requests are under 5,000
const FIRST_YEAR = 2016, lastYear = () => new Date().getUTCFullYear();   // Sentinel-2 images in the dashboard start in 2016
const yearOk = y => Number.isInteger(+y) && +y >= FIRST_YEAR && +y <= lastYear();
const MIN_STATS_RES = 40;                                           // metres (CRS units); keeps scene scoring cheap
const DAY = 86400;

/* Copernicus accounts: CDSE_CLIENT_ID / CDSE_CLIENT_SECRET, then the same names with _2, _3, _4, _5. They are used in this order; an account that answers
   "insufficient processing units" is put last for an hour, so the next one takes over. */
const clients = env => { const out = []; for (let i = 1; i <= 5; i++) { const x = i === 1 ? '' : '_' + i, id = env['CDSE_CLIENT_ID' + x], secret = env['CDSE_CLIENT_SECRET' + x]; if (id && secret) out.push({ n: i, id, secret }); } return out; };
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

    if (url.pathname.startsWith('/gallery/')) return gallery(request, env, url, cors);

    const route = { '/cdse/statistics': 'statistics', '/cdse/process': 'process' }[url.pathname];
    if (!route) return json({ error: 'Not found' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);
    if (!clients(env).length)
      return json({ relayError: 'The relay has no Copernicus credentials yet (set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET).' }, 502, cors);

    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'Request too large' }, 413, cors);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
    const problem = route === 'process' ? checkProcess(body) : checkStatistics(body);
    if (problem) return json({ error: `Request not allowed: ${problem}` }, 400, cors);

    // cache lookup
    const key = `${route}:${await sha256(text)}`;
    const hit = await cacheGet(env, key);
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
    try { out = await job; } catch (e) { return json({ relayError: e.message }, 502, cors); }
    return new Response(out.data.slice(0), { status: out.status, headers: { ...cors, 'Content-Type': out.type, 'X-Cache': 'MISS' } });
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
const summerDay = d => /^\d{4}-(0[789]|10)-\d{2}$/.test(d) && yearOk(d.slice(0, 4));   // July to October (the late-season experiment)
function checkProcess(b) {
  const inp = b && b.input, out = b && b.output;
  const bad = checkBounds(inp, [COLLECTION, IMAGES, MOSAIC]); if (bad) return bad;
  const tr = inp.data[0].dataFilter && inp.data[0].dataFilter.timeRange;
  if (!tr || typeof tr.from !== 'string' || !summerDay(tr.from.slice(0, 10)) || tr.from.slice(10) !== 'T00:00:00Z' ||
      tr.to !== tr.from.slice(0, 10) + 'T23:59:59Z') return 'date (one day between July and October)';
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
  if (!ag || !ag.timeRange || !/^\d{4}-07-01T00:00:00Z$/.test(ag.timeRange.from) || !yearOk(ag.timeRange.from.slice(0, 4)) ||
      ![ '-09-21T00:00:00Z', '-10-01T00:00:00Z', '-10-11T00:00:00Z', '-11-01T00:00:00Z' ].map(e => ag.timeRange.from.slice(0, 4) + e).includes(ag.timeRange.to)) return 'period (July 1 to the end of October of one year)';
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
  const year = +body.aggregation.timeRange.from.slice(0, 4);
  return year < new Date().getUTCFullYear() ? 180 * DAY : DAY;
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
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
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


/* ---------- gallery ----------
   Visitors share a finished picture or video. Everything the browser sends is checked here: size, the real file type
   (first bytes), the pixel size (must be one of the three export formats) and a fixed list of metadata fields. A person is
   checked with Cloudflare Turnstile. New items land in pending/ and are never served; they are published by moving them to
   approved/ (tools/gallery-admin.html). The queue has a fixed size, so a flood of uploads cannot grow storage without limit.
   Set an R2 lifecycle rule on the prefix pending/ (delete after 14 days) so unapproved items disappear by themselves. */
const GAL = { maxVideo: 15e6, maxImage: 4e6, maxPending: 200, perHour: 4, adminFails: 10 };
const GAL_FORMATS = { reel: [1080, 1920], feed: [1080, 1350], wide: [1920, 1080] };
const GAL_TYPES = { still: 'image', timelapse: 'video', slider: 'video' };
const GAL_STYLES = ['natural', 'false1', 'false2'];
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

async function gallery(request, env, url, cors) {
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

  if (path === 'submit' && m === 'POST') return gallerySubmit(request, env, cors, ip);

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

async function gallerySubmit(request, env, cors, ip) {
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
  if (GAL_TYPES[type] === 'image' ? m.years.length !== 1 : m.years.length < 2) return 'years';
  let nick = '';
  if (m.nick !== undefined && m.nick !== '') {
    if (typeof m.nick !== 'string' || !/^[\p{L}\p{N} ._'’@-]{1,30}$/u.test(m.nick.trim())) return 'nickname';
    nick = m.nick.trim();
  }
  return { glacier: m.glacier, name: m.name, years: m.years.map(Number), kind: GAL_TYPES[type], type, fmt, style, nick };
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
