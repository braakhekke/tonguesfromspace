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

    def test_ping(self):
        r = self.run_js("return await info(await W.fetch(req('/cdse/ping', 'GET', '', 'http://t.test'), env, {}));")
        self.assertEqual(r["status"], 200)
        self.assertIn('"relay":true', r["text"])


if __name__ == "__main__":
    unittest.main()
