"""Tests of worker/worker.js (the Copernicus relay), run in headless Chromium: the real file is imported as a module, with a fake KV store and a fake Copernicus.
No Cloudflare, no network, no credentials.

    python3 -m unittest discover -s tests -v

Checked: cache miss then hit, one upstream call for identical requests, stale copies of the one-day entries when Copernicus fails (and not for entries that are
fresh or long-lived), pass-through of upstream errors that are not cached, the request checks and the origin check.
"""
import functools, http.server, os, socketserver, threading, unittest
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SETUP = """
async () => {
  const W = (await import('/worker/worker.js')).default;
  const calls = {token: 0, upstream: 0}, kvLog = [];
  const store = new Map();
  const CACHE = {
    async getWithMetadata(key) { const v = store.get(key); return v ? {value: v.value, metadata: v.metadata} : {value: null, metadata: null}; },
    async put(key, value, opts) { store.set(key, {value, metadata: opts.metadata}); kvLog.push({key, ttl: opts.expirationTtl, metadata: opts.metadata}); },
  };
  const up = {mode: 'ok', body: 'NEW'};
  window.fetch = async (url) => {
    url = String(url);
    if (url.includes('openid-connect/token')) { calls.token++; return new Response(JSON.stringify({access_token: 't', expires_in: 300}), {status: 200}); }
    calls.upstream++;
    if (up.mode === 'throw') throw new Error('network down');
    if (up.mode === 'ok') return new Response(up.body, {status: 200, headers: {'Content-Type': 'application/json'}});
    return new Response('upstream error', {status: up.mode, headers: {'Content-Type': 'text/plain'}});
  };
  const env = {ALLOWED_ORIGINS: 'http://t.test', CDSE_CLIENT_ID: 'id', CDSE_CLIENT_SECRET: 'secret', CACHE};
  const year = new Date().getUTCFullYear();
  const stats = (y, bbox = [885000, 5900000, 900000, 5915000]) => JSON.stringify({
    input: {bounds: {bbox, properties: {crs: 'http://www.opengis.net/def/crs/EPSG/0/3857'}}, data: [{type: 'sentinel-2-l2a'}]},
    aggregation: {timeRange: {from: `${y}-07-01T00:00:00Z`, to: `${y}-09-21T00:00:00Z`}, aggregationInterval: {of: 'P1D'}, evalscript: 'x', resx: 60, resy: 60}});
  const req = (path, method, body, origin) => ({url: 'https://relay.test' + path, method, headers: new Headers({Origin: origin}), text: async () => body});      // a Request would drop the Origin header: browsers forbid setting it
  const post = (body, origin = 'http://t.test') => W.fetch(req('/cdse/statistics', 'POST', body, origin), env, {});
  const info = async r => ({status: r.status, cache: r.headers.get('X-Cache'), text: await r.text()});
  return {W, calls, kvLog, store, up, env, year, stats, post, info, req};
}
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class WorkerCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
        cls.srv.daemon_threads = True
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.srv.shutdown()

    def setUp(self):
        self.page = self.browser.new_page()
        self.addCleanup(self.page.close)
        self.page.goto(self.base + "/tests/blank.html")

    def run_js(self, body):
        """body: JavaScript using the helpers of SETUP (W, calls, kvLog, store, up, env, year, stats, post, info); the value it returns comes back."""
        return self.page.evaluate("async () => { const {W, calls, kvLog, store, up, env, year, stats, post, info, req} = await (" + SETUP + ")(); " + body + " }")


class TestRelay(WorkerCase):
    def test_miss_then_hit_calls_copernicus_once(self):
        r = self.run_js("up.body = 'A'; const a = await info(await post(stats(year))), b = await info(await post(stats(year))); return {a, b, calls};")
        self.assertEqual((r["a"]["status"], r["a"]["cache"], r["a"]["text"]), (200, "MISS", "A"))
        self.assertEqual((r["b"]["status"], r["b"]["cache"], r["b"]["text"]), (200, "HIT", "A"))
        self.assertEqual(r["calls"]["upstream"], 1)

    def test_one_day_entries_are_kept_for_a_week_and_marked(self):
        r = self.run_js("await post(stats(year)); return kvLog[0];")
        self.assertGreaterEqual(r["ttl"], 7 * 86400)
        self.assertGreater(r["metadata"]["fresh"], 0)
        self.assertLess(r["metadata"]["fresh"] - __import__("time").time() * 1000, 86400e3 + 60e3)      # fresh for one day

    def test_past_summers_stay_for_half_a_year_and_are_never_stale(self):
        r = self.run_js("await post(stats(year - 1)); return kvLog[0];")
        self.assertGreaterEqual(r["ttl"], 170 * 86400)

    def test_stale_copy_is_served_when_copernicus_is_down(self):
        r = self.run_js("""
          up.body = 'OLD'; await post(stats(year));
          for (const v of store.values()) v.metadata.fresh = Date.now() - 1000;      // its day is over
          up.mode = 503; const a = await info(await post(stats(year)));
          up.mode = 'throw'; const b = await info(await post(stats(year)));
          up.mode = 429; const c = await info(await post(stats(year)));
          return {a, b, c};""")
        for k in "abc":
            self.assertEqual((r[k]["status"], r[k]["cache"], r[k]["text"]), (200, "STALE", "OLD"), k)

    def test_stale_copy_is_replaced_when_copernicus_answers(self):
        r = self.run_js("""
          up.body = 'OLD'; await post(stats(year));
          for (const v of store.values()) v.metadata.fresh = Date.now() - 1000;
          up.body = 'NEW'; const a = await info(await post(stats(year))), b = await info(await post(stats(year)));
          return {a, b};""")
        self.assertEqual((r["a"]["cache"], r["a"]["text"]), ("MISS", "NEW"))
        self.assertEqual((r["b"]["cache"], r["b"]["text"]), ("HIT", "NEW"))

    def test_fresh_copy_is_not_replaced_by_an_upstream_error(self):
        r = self.run_js("up.body = 'OLD'; await post(stats(year)); up.mode = 503; return await info(await post(stats(year)));")
        self.assertEqual((r["cache"], r["text"]), ("HIT", "OLD"))

    def test_errors_without_a_copy_pass_through_and_are_not_cached(self):
        r = self.run_js("""
          up.mode = 503; const a = await info(await post(stats(year))); const kv = kvLog.length;
          up.mode = 'throw'; const b = await info(await post(stats(year)));
          return {a, b, kv, kvAfter: kvLog.length};""")
        self.assertEqual(r["a"]["status"], 503)
        self.assertEqual(r["b"]["status"], 502)
        self.assertIn("network down", r["b"]["text"])
        self.assertEqual((r["kv"], r["kvAfter"]), (0, 0))

    def test_requests_outside_the_rules_are_refused(self):
        r = self.run_js("""
          const out = await info(await post(stats(year, [0, 0, 1000, 1000])));      // not in Switzerland
          const bad = await info(await post('not json'));
          const origin = await info(await post(stats(year), 'http://evil.test'));
          return {out, bad, origin, upstream: calls.upstream};""")
        self.assertEqual(r["out"]["status"], 400)
        self.assertIn("not allowed", r["out"]["text"])
        self.assertEqual(r["bad"]["status"], 400)
        self.assertEqual(r["origin"]["status"], 403)
        self.assertEqual(r["upstream"], 0)

    def test_vatnajokull_season_and_area(self):
        # Iceland: the picture box of Breidamerkurjokull (centre 64.13 N, 16.32 W; Mercator -1816735, 9382907), a season of 1 August to 15 October, nothing else
        r = self.run_js("""
          const box = [-1829000, 9370000, -1804000, 9395000];
          const ice = (from, to, bbox = box) => JSON.stringify({
            input: {bounds: {bbox, properties: {crs: 'http://www.opengis.net/def/crs/EPSG/0/3857'}}, data: [{type: 'sentinel-2-l2a'}]},
            aggregation: {timeRange: {from, to}, aggregationInterval: {of: 'P1D'}, evalscript: 'x', resx: 60, resy: 60}});
          const y = year - 1, ok = await info(await post(ice(`${y}-08-01T00:00:00Z`, `${y}-10-16T00:00:00Z`)));
          const early = await info(await post(ice(`${y}-07-01T00:00:00Z`, `${y}-09-21T00:00:00Z`)));        // the Swiss window is not an Icelandic one
          const late = await info(await post(ice(`${y}-08-01T00:00:00Z`, `${y}-11-01T00:00:00Z`)));
          const away = await info(await post(ice(`${y}-08-01T00:00:00Z`, `${y}-10-16T00:00:00Z`, [-1329000, 9370000, -1304000, 9395000])));    // 500 km east of the outlet, in the sea
          const image = await info(await W.fetch(req('/cdse/process', 'POST', JSON.stringify({
            input: {bounds: {bbox: box, properties: {crs: 'http://www.opengis.net/def/crs/EPSG/0/3857'}}, data: [{type: 'sentinel-2-l1c', dataFilter: {timeRange: {from: `${y}-09-15T00:00:00Z`, to: `${y}-09-15T23:59:59Z`}}}]},
            output: {width: 2400, height: 2400, responses: [{identifier: 'default', format: {type: 'image/jpeg'}}]}, evalscript: 'x'}), 'http://t.test'), env, {}));
          const day = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z';
          const latest = await info(await post(ice(day(-60), day(1))));        // "Latest": the last 60 days, any month
          const tooLong = await info(await post(ice(day(-90), day(1))));       // more than 75 days is refused
          const swissOk = await info(await post(stats(year - 1)));      // Switzerland keeps its own rules
          return {ok, early, late, away, image, swissOk, latest, tooLong};""")
        self.assertEqual(r["ok"]["status"], 200)
        for k in ("early", "late", "away"):
            self.assertEqual(r[k]["status"], 400, k)
        self.assertEqual(r["image"]["status"], 200)
        self.assertEqual(r["swissOk"]["status"], 200)
        self.assertEqual(r["latest"]["status"], 200, r["latest"]["text"])
        self.assertEqual(r["tooLong"]["status"], 400)

    def test_norway_and_svalbard_have_their_own_seasons(self):
        # mainland Norway: Jostedalsbreen (centre 7.012 E, 61.627 N), 20 July to 30 September; Svalbard: Negribreen (19.03 E, 78.59 N), 20 July to 15 September
        r = self.run_js("""
          const merc = (lon, lat) => [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180];
          const boxAt = (lon, lat) => { const [x, y] = merc(lon, lat); return [x - 12000, y - 12000, x + 12000, y + 12000]; };
          const ice = (from, to, bbox) => JSON.stringify({
            input: {bounds: {bbox, properties: {crs: 'http://www.opengis.net/def/crs/EPSG/0/3857'}}, data: [{type: 'sentinel-2-l2a'}]},
            aggregation: {timeRange: {from, to}, aggregationInterval: {of: 'P1D'}, evalscript: 'x', resx: 60, resy: 60}});
          const y = year - 1, no = boxAt(7.012, 61.627), sj = boxAt(19.03, 78.59), far = boxAt(10, 64);
          return {
            noOk: (await info(await post(ice(`${y}-07-20T00:00:00Z`, `${y}-10-01T00:00:00Z`, no)))).status,
            noIceland: (await info(await post(ice(`${y}-08-01T00:00:00Z`, `${y}-10-16T00:00:00Z`, no)))).status,
            sjOk: (await info(await post(ice(`${y}-07-20T00:00:00Z`, `${y}-09-16T00:00:00Z`, sj)))).status,
            sjLong: (await info(await post(ice(`${y}-07-20T00:00:00Z`, `${y}-10-01T00:00:00Z`, sj)))).status,
            far: (await info(await post(ice(`${y}-07-20T00:00:00Z`, `${y}-10-01T00:00:00Z`, far)))).status};""")
        self.assertEqual((r["noOk"], r["sjOk"]), (200, 200))
        for k in ("noIceland", "sjLong", "far"):
            self.assertEqual(r[k], 400, k)

    def test_video_range_requests_get_206(self):
        r = self.run_js("""const bytes = new Uint8Array(100).map((_, i) => i);
          env.ASSETS = {fetch: async () => new Response(bytes, {status: 200, headers: {'Content-Type': 'video/mp4'}})};
          const get = async (range, method = 'GET') => { const x = await W.fetch({url: 'https://relay.test/images/home/clips/a.mp4', method, headers: new Headers(range ? {Range: range} : {})}, env, {});
            return {status: x.status, cr: x.headers.get('Content-Range'), len: x.headers.get('Content-Length'), ar: x.headers.get('Accept-Ranges'), n: (await x.arrayBuffer()).byteLength}; };
          return {all: await get(null), part: await get('bytes=10-19'), open: await get('bytes=90-'), tail: await get('bytes=-5'), bad: await get('bytes=200-')};""")
        self.assertEqual((r["all"]["status"], r["all"]["ar"], r["all"]["n"]), (200, "bytes", 100))
        self.assertEqual((r["part"]["status"], r["part"]["cr"], r["part"]["n"]), (206, "bytes 10-19/100", 10))
        self.assertEqual((r["open"]["cr"], r["open"]["n"]), ("bytes 90-99/100", 10))
        self.assertEqual((r["tail"]["cr"], r["tail"]["n"]), ("bytes 95-99/100", 5))
        self.assertEqual(r["bad"]["status"], 416)

    def test_ping(self):
        r = self.run_js("return await info(await W.fetch(req('/cdse/ping', 'GET', '', 'http://t.test'), env, {}));")
        self.assertEqual(r["status"], 200)
        self.assertIn('"relay":true', r["text"])

    def test_landsat_pictures_are_served_for_swiss_glaciers_only(self):
        r = self.run_js("""
          const hits = [];
          const LANDSAT = { async get(k) { hits.push(k); return { body: 'x', httpEtag: 'e' }; }, async head(k) { hits.push(k); return { httpEtag: 'e' }; } };
          const get = async p => (await W.fetch(req(p, 'GET', '', 'http://t.test'), {...env, LANDSAT}, {})).status;
          return { swiss: await get('/data/landsat/aletsch/1984.jpg'), swissJson: await get('/data/landsat/aletsch.json'),
                   iceland: await get('/data/landsat/hofsjokull/1985.jpg'), icelandJson: await get('/data/landsat/hofsjokull.json'), hits };
        """)
        self.assertEqual((r["swiss"], r["swissJson"]), (200, 200))
        self.assertEqual((r["iceland"], r["icelandJson"]), (404, 404))
        self.assertNotIn("data/landsat/hofsjokull/1985.jpg", r["hits"], "the bucket is not even asked")


GALLERY_SETUP = """
  // a fake R2 bucket and a fake "are you a person" check; helpers to make files and uploads
  const objs = new Map(), turnstile = {ok: true, calls: 0};
  const GALLERY = {
    async head(k) { return objs.has(k) ? {key: k} : null; },
    async put(k, v, o) { objs.set(k, {v, o}); },
    async get(k) { const x = objs.get(k); return x ? {arrayBuffer: async () => x.v.slice().buffer, httpMetadata: x.o.httpMetadata, customMetadata: x.o.customMetadata, httpEtag: 'e', body: x.v} : null; },
    async list({prefix = '', limit = 1000} = {}) { const ks = [...objs.keys()].filter(k => k.startsWith(prefix)).slice(0, limit); return {objects: ks.map(k => ({key: k, size: objs.get(k).v.length, customMetadata: objs.get(k).o.customMetadata})), truncated: false}; },
    async delete(k) { objs.delete(k); },
  };
  try { caches.default = {async match() { return null; }, async put() {}, async delete() {}}; } catch (e) {}      // the Worker's edge cache does not exist in a page
  const realFetch = window.fetch;
  window.fetch = async (url, init) => String(url).includes('challenges.cloudflare.com') ? (turnstile.calls++, new Response(JSON.stringify({success: turnstile.ok}), {status: 200})) : realFetch(url, init);
  const genv = {...env, GALLERY, TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', GALLERY_ADMIN_TOKEN: 'a-very-long-admin-token-of-25-chars'};
  const jpeg = (w, h, n = 2000, nonce = 0) => { const b = new Uint8Array(n); b.set([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]); b[20] = 0xFF; b[21] = 0xC0; b[22] = 0; b[23] = 17; b[24] = 8; b[25] = h >> 8; b[26] = h & 255; b[27] = w >> 8; b[28] = w & 255; b[100] = nonce & 255; b[101] = nonce >> 8; return b; };
  const mp4 = (w, h, n = 6000, avc = true) => { const b = new Uint8Array(n); b.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]); b.set(new TextEncoder().encode('stsd'), 100); if (avc) b.set(new TextEncoder().encode('avc1'), 108); const o = 108 + 4 + 24; b[o] = w >> 8; b[o + 1] = w & 255; b[o + 2] = h >> 8; b[o + 3] = h & 255; return b; };
  const META = {type: 'still', fmt: 'wide', style: 'natural', glacier: 'aletsch', name: 'Grosser Aletsch', years: [2023], view: 'map'};
  const VMETA = {type: 'timelapse', fmt: 'wide', style: 'natural', glacier: 'aletsch', name: 'Grosser Aletsch', years: [2020, 2023], view: 'map'};
  let ipn = 0;
  const submit = async (bytes, meta = META, o = {}) => {
    const fd = new FormData();
    if (!o.noFile) fd.append('file', new File([bytes], 'x.bin'));
    fd.append('meta', typeof meta === 'string' ? meta : JSON.stringify(meta));
    if (o.token !== null) fd.append('token', o.token === undefined ? 'tok' : o.token);
    const headers = new Headers({Origin: o.origin || 'http://t.test', 'Content-Length': String(o.len !== undefined ? o.len : (bytes ? bytes.length : 0) + 500), 'CF-Connecting-IP': o.ip || ('10.0.0.' + (++ipn))});
    const x = await W.fetch({url: 'https://relay.test/gallery/submit', method: 'POST', headers, formData: async () => fd}, genv, {});
    return {status: x.status, body: await x.json().catch(() => ({}))};
  };
  const get = async (path, headers = {}, method = 'GET', body = null) => { const x = await W.fetch({url: 'https://relay.test' + path, method, headers: new Headers({Origin: 'http://t.test', ...headers}), json: async () => body}, genv, {}); return {status: x.status, body: await x.json().catch(() => ({}))}; };
  const sha24 = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
"""


class TestGallery(WorkerCase):
    """The only place where visitors write data: every check of an upload (worker.js, section "gallery"). A fake R2 bucket and a fake Turnstile; nothing leaves the page."""

    def gal(self, body):
        return self.run_js(GALLERY_SETUP + body)

    def test_a_good_picture_waits_in_the_queue_and_is_never_served_before_approval(self):
        r = self.gal("""
          const b = jpeg(1920, 1080), res = await submit(b), id = await sha24(b);
          const pend = objs.get('pending/' + id);
          return {res, stored: !!pend, meta: pend && JSON.parse(pend.o.customMetadata.meta), ctype: pend && pend.o.httpMetadata.contentType,
                  file: (await get('/gallery/file/' + id)).status, list: (await get('/gallery/list')).body.items.length, turnstile: turnstile.calls};""")
        self.assertEqual(r["res"]["status"], 200)
        self.assertTrue(r["stored"], "kept under pending/")
        self.assertEqual((r["ctype"], r["meta"]["glacier"], r["meta"]["fmt"], r["meta"]["years"]), ("image/jpeg", "aletsch", "wide", [2023]))
        self.assertEqual(r["file"], 404, "a pending file is not served")
        self.assertEqual(r["list"], 0, "a pending file is not in the public list")
        self.assertEqual(r["turnstile"], 1)

    def test_no_person_check_no_file_or_a_failed_check_stores_nothing(self):
        r = self.gal("""
          const b = jpeg(1920, 1080), out = {};
          out.noToken = await submit(b, META, {token: null});
          out.noFile = await submit(null, META, {noFile: true});
          turnstile.ok = false; out.failed = await submit(b);
          out.stored = objs.size; out.calls = turnstile.calls; return out;""")
        self.assertEqual(r["noToken"]["status"], 400)
        self.assertEqual(r["noFile"]["status"], 400)
        self.assertEqual(r["failed"]["status"], 403)
        self.assertEqual(r["stored"], 0)

    def test_size_limits(self):
        r = self.gal("""
          const b = jpeg(1920, 1080);
          return {big: await submit(b, META, {len: 16 * 1000 * 1000}), zero: await submit(b, META, {len: 0}),
                  imageOver4MB: await submit(jpeg(1920, 1080, 4.1e6)), imageTiny: await submit(jpeg(1920, 1080, 900)),
                  videoOver15MB: await submit(mp4(1920, 1080, 15.01e6), VMETA), videoTiny: await submit(mp4(1920, 1080, 4000), VMETA), stored: objs.size};""")
        self.assertEqual(r["big"]["status"], 413, "more than the largest file plus its details: refused before the file is read")
        self.assertEqual(r["zero"]["status"], 413)
        for k in ("imageOver4MB", "imageTiny", "videoOver15MB", "videoTiny"):
            self.assertEqual(r[k]["status"], 400, k)
            self.assertIn("size", r[k]["body"]["error"], k)
        self.assertEqual(r["stored"], 0)

    def test_the_real_file_type_and_exact_pixel_size_are_checked(self):
        r = self.gal("""
          const png = new Uint8Array(2000); png.set([0x89, 0x50, 0x4E, 0x47]);
          const out = {
            png: await submit(png), jpegAsVideo: await submit(jpeg(1920, 1080), VMETA), mp4AsImage: await submit(mp4(1920, 1080), META),
            wrongSize: await submit(jpeg(1920, 1081)), swappedSize: await submit(jpeg(1080, 1920)),
            noH264: await submit(mp4(1920, 1080, 6000, false), VMETA), videoWrongSize: await submit(mp4(1920, 1081), VMETA),
            reel: await submit(jpeg(1080, 1920), {...META, fmt: 'reel'}), feed: await submit(jpeg(1080, 1350), {...META, fmt: 'feed'}), video: await submit(mp4(1920, 1080, 6000), VMETA)};
          out.stored = [...objs.keys()].sort(); return out;""")
        for k in ("png", "jpegAsVideo", "mp4AsImage", "wrongSize", "swappedSize", "noH264", "videoWrongSize"):
            self.assertEqual(r[k]["status"], 400, k)
            self.assertTrue(r[k]["body"]["error"].startswith("Invalid file"), (k, r[k]["body"]))
        self.assertIn("picture size", r["wrongSize"]["body"]["error"])
        self.assertIn("not a JPEG", r["png"]["body"]["error"])
        self.assertIn("not H.264", r["noH264"]["body"]["error"])
        for k in ("reel", "feed", "video"):
            self.assertEqual(r[k]["status"], 200, k + " in its exact format is accepted")
        self.assertEqual(len(r["stored"]), 3)

    def test_only_the_fixed_list_of_details_is_accepted(self):
        r = self.gal("""
          let n = 0; const t = async m => (await submit(jpeg(1920, 1080, 2000, ++n), m)).status, b = jpeg(1920, 1080, 2000, 999);
          return {type: await t({...META, type: 'x'}), fmt: await t({...META, fmt: 'square'}), style: await t({...META, style: 'neon'}), glacier: await t({...META, glacier: 'a b/<script>'}),
                  name: await t({...META, name: '<b>x</b>'}), yearEarly: await t({...META, years: [2010]}), yearsMany: await t({...META, years: [2020, 2021, 2022]}), noYears: await t({...META, years: []}),
                  nick: await t({...META, nick: '<img src=x>'}), extra: await t({...META, evil: 'x'}), notJson: (await submit(b, 'not json')).status, tooLong: (await submit(b, {...META, nick: 'x'.repeat(2000)})).status,
                  goodNick: await t({...META, nick: 'Ada'}), stored: objs.size, kept: JSON.parse([...objs.values()][0].o.customMetadata.meta)};""")
        for k in ("type", "fmt", "style", "glacier", "name", "yearEarly", "yearsMany", "noYears", "nick", "notJson", "tooLong"):
            self.assertEqual(r[k], 400, k)
        self.assertEqual((r["extra"], r["goodNick"]), (200, 200), "an unknown field is dropped, not stored")
        self.assertNotIn("evil", r["kept"])

    def test_the_queue_has_a_fixed_size_and_a_file_is_kept_once(self):
        r = self.gal("""
          const first = jpeg(1920, 1080, 2000, 1);
          const a = await submit(first), again = await submit(first);
          for (let i = 0; i < 200; i++) objs.set('pending/fill' + i, {v: new Uint8Array(1), o: {customMetadata: {}}});
          const full = await submit(jpeg(1920, 1080, 2000, 2));
          return {a, again, full, pending: [...objs.keys()].filter(k => k.startsWith('pending/')).length};""")
        self.assertEqual(r["a"]["status"], 200)
        self.assertEqual(r["again"]["status"], 409)
        self.assertEqual(r["full"]["status"], 503)
        self.assertEqual(r["pending"], 201, "the full queue took nothing more")

    def test_uploads_are_limited_per_address_and_only_from_allowed_origins(self):
        r = self.gal("""
          const codes = []; for (let i = 0; i < 6; i++) codes.push((await submit(jpeg(1920, 1080), META, {ip: '9.9.9.9', token: null})).status);
          const other = await submit(jpeg(1920, 1080, 2000, 7), META, {ip: '8.8.8.8', token: null});
          const bad = await submit(jpeg(1920, 1080), META, {origin: 'https://evil.example'});
          const x = await W.fetch({url: 'https://relay.test/gallery/submit', method: 'POST', headers: new Headers({Origin: 'https://evil.example', 'Content-Length': '2000'}), formData: async () => new FormData()}, genv, {});
          return {codes, other: other.status, bad: bad.status, noOriginHeader: x.status, closed: (await W.fetch({url: 'https://relay.test/gallery/submit', method: 'POST', headers: new Headers({Origin: 'http://t.test', 'Content-Length': '2000'}), formData: async () => new FormData()}, {...genv, TURNSTILE_SECRET: ''}, {})).status};""")
        self.assertEqual(r["codes"], [400, 400, 400, 400, 429, 429], "four uploads an hour per address, then refused")
        self.assertEqual(r["other"], 400, "another address is not affected")
        self.assertEqual((r["bad"], r["noOriginHeader"]), (403, 403))
        self.assertEqual(r["closed"], 503, "without the Turnstile secret the gallery is closed for uploads")

    def test_moderation_needs_the_admin_token_and_approval_publishes(self):
        r = self.gal("""
          const b = jpeg(1920, 1080), id = await sha24(b); await submit(b);
          const H = t => ({Authorization: 'Bearer ' + t});
          const none = await get('/gallery/admin/pending'), wrong = await get('/gallery/admin/pending', H('nope')), ok = await get('/gallery/admin/pending', H(genv.GALLERY_ADMIN_TOKEN));
          const approve = await get('/gallery/admin/approve', H(genv.GALLERY_ADMIN_TOKEN), 'POST', {id});
          const pub = await get('/gallery/list'), served = await get('/gallery/file/' + id);
          const remove = await get('/gallery/admin/remove', H(genv.GALLERY_ADMIN_TOKEN), 'POST', {id});
          const short = await get('/gallery/admin/pending', H('short'), 'GET');
          return {none: none.status, wrong: wrong.status, ok: ok.status, pending: ok.body.items.length, approve: approve.status, public: pub.body.items.length, served: served.status,
                  afterRemove: (await get('/gallery/list')).body.items.length, remove: remove.status, short: short.status};""")
        self.assertEqual((r["none"], r["wrong"], r["short"]), (401, 401, 401))
        self.assertEqual((r["ok"], r["pending"]), (200, 1))
        self.assertEqual((r["approve"], r["public"], r["served"]), (200, 1, 200))
        self.assertEqual((r["remove"], r["afterRemove"]), (200, 0))


class TestOps(WorkerCase):
    """What the Worker records about its own health: failures of the relay (one JSON line each in Workers Logs, no address, no request body) and the script errors of the page
    (the event error-js, a short note in a conservative alphabet). Nothing here may carry an IP address, a cookie or a typed text."""

    def test_relay_failures_are_logged_as_one_json_line_without_personal_data(self):
        r = self.run_js("""
          const logs = []; const real = console.error; console.error = (...a) => logs.push(a.join(' '));
          try {
            const noCreds = await W.fetch(req('/cdse/statistics', 'POST', stats(year), 'http://t.test'), {...env, CDSE_CLIENT_ID: '', CDSE_CLIENT_SECRET: ''}, {});
            up.mode = 503; const busy = await post(stats(year, [885000, 5900000, 900000, 5915000]));
            up.mode = 'throw'; const down = await post(stats(year, [886000, 5901000, 901000, 5916000]));
            up.mode = 'ok'; const fine = await post(stats(year, [887000, 5902000, 902000, 5917000]));
            return {codes: [noCreds.status, busy.status, down.status, fine.status], logs};
          } finally { console.error = real; }""")
        self.assertEqual(r["codes"], [502, 503, 502, 200])
        lines = [__import__("json").loads(x) for x in r["logs"]]
        evts = [x["evt"] for x in lines]
        self.assertEqual(evts, ["relay_no_credentials", "upstream_status", "relay_failed"], "one line per failure, none for the request that worked")
        self.assertEqual((lines[1]["status"], lines[1]["route"]), (503, "statistics"))
        for x in lines:
            self.assertLessEqual(set(x), {"evt", "route", "status", "stale", "message"}, "only these fields")
            self.assertNotRegex(" ".join(r["logs"]), r"\d+\.\d+\.\d+\.\d+|bbox|evalscript|Authorization", "no address, no request body, no secret")

    def test_a_script_error_of_the_page_is_counted_with_a_short_safe_note(self):
        r = self.run_js("""
          const points = []; const EVENTS = {writeDataPoint: d => points.push(d)};
          const send = async (obj, o = {}) => (await W.fetch({url: 'https://relay.test/ev', method: 'POST', headers: new Headers({Origin: o.origin || 'http://t.test'}), text: async () => typeof obj === 'string' ? obj : JSON.stringify(obj)}, {...env, EVENTS}, {})).status;
          const codes = [
            await send({e: 'mode-compare', g: 'aletsch', p: '/switzerland/aletsch/', d: 'd'}),
            await send({e: 'error-js', g: 'gorner', p: '/switzerland/', d: 'm', m: "Cannot read properties of undefined (reading 'inv') @ app.9f2c1.js <img src=x onerror=alert(1)> " + 'x'.repeat(200)}),
            await send({e: 'mode-compare', g: '', p: '/', d: 'd', m: 'a note only error-js may carry'}),
            await send({e: 'Not A Name!', g: '', p: '/'}), await send({e: 'error-js', g: '', p: '/'}, {origin: 'https://evil.example'}),
            await send({e: 'error-js', g: '', p: '/', m: 'y'.repeat(500)}), await send('not json')];
          return {codes, points: points.map(d => d.blobs)};""")
        self.assertEqual(r["codes"], [204] * 7, "always 204: nothing can be probed")
        self.assertEqual(len(r["points"]), 3, "the bad name, the foreign origin, the oversize body and the broken body store nothing")
        click, err, other = r["points"]
        self.assertEqual(click, ["mode-compare", "aletsch", "/switzerland/aletsch/", "d", "", ""])
        self.assertEqual(err[:4], ["error-js", "gorner", "/switzerland/", "m"])
        self.assertLessEqual(len(err[5]), 80)
        self.assertNotRegex(err[5], r"[<>=]", "a conservative alphabet")
        self.assertIn("Cannot read properties of undefined", err[5])
        self.assertEqual(other[5], "", "only error-js keeps a note")


if __name__ == "__main__":
    unittest.main()
