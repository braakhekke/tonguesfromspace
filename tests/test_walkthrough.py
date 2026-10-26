"""The walkthrough (walkthrough/): the real server on temporary folders, and the wizard in a real browser. Unit tests of the engine, steps, season rule and sources are in walkthrough/**/*.test.ts (npm run test:walkthrough)."""
import json, os, shutil, socket, subprocess, tempfile, time, unittest
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAVE_TSX = os.path.exists(os.path.join(ROOT, "node_modules", ".bin", "tsx"))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@unittest.skipUnless(HAVE_TSX, "npm ci has not been run")
class TestWalkthrough(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="tfs-wt-")
        cls.port = free_port()
        env = dict(os.environ, TFS_DATA=os.path.join(cls.tmp, "data"), TFS_CACHE=os.path.join(cls.tmp, "cache"), TFS_WALKTHROUGH_PORT=str(cls.port))
        cls.srv = subprocess.Popen([os.path.join(ROOT, "node_modules", ".bin", "tsx"), "walkthrough/server.ts"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.base = f"http://localhost:{cls.port}"
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.base + "/__onboard/overview", timeout=1).read()
                break
            except Exception:
                time.sleep(0.2)
        else:
            cls.srv.kill()
            raise RuntimeError("the walkthrough server did not start")
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.kill(); cls.srv.wait()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def call(self, path, body=None):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", "X-Onboard": "1"})
        try:
            return json.load(urllib.request.urlopen(req, timeout=20))
        except urllib.error.HTTPError as e:
            return {"httpError": e.code, **json.load(e)}

    def test_a_write_without_the_header_is_refused_and_a_foreign_host_too(self):
        req = urllib.request.Request(self.base + "/__onboard/new-region", data=b"{}", headers={"Content-Type": "text/plain"})
        with self.assertRaises(urllib.error.HTTPError) as c:
            urllib.request.urlopen(req)
        self.assertEqual(c.exception.code, 403)
        req = urllib.request.Request(self.base + "/__onboard/overview", headers={"Host": "evil.example"})
        with self.assertRaises(urllib.error.HTTPError) as c:
            urllib.request.urlopen(req)
        self.assertEqual(c.exception.code, 403)

    def test_a_region_and_a_glacier_can_be_made_and_the_wizard_shows_the_first_step(self):
        self.assertEqual(self.call("/__onboard/new-region", {"id": "testland", "name": "Testland", "centre": [46.5, 8.2]}), {"ok": True})
        self.assertEqual(self.call("/__onboard/new-glacier", {"region": "testland", "id": "ice-one", "name": "Ice One", "centre": [46.5, 8.2]}), {"ok": True})
        st = self.call("/__onboard/state?region=testland&glacier=ice-one")
        self.assertEqual(st["next"], "region.unit", "the walk starts at the region and nothing is done yet")
        self.assertEqual([s["id"] for s in st["steps"]][:3], ["region.unit", "glacier.record", "glacier.outline"])
        self.assertEqual(st["done"], 0)
        # confirming without a reason, or a unit rule too short to be a rule, is refused by the engine
        r = self.call("/__onboard/confirm", {"region": "testland", "glacier": None, "step": "region.unit", "patch": {"unitRule": "x", "sources": []}, "reason": "ok"})
        self.assertIn("error", r)
        ctx = self.browser.new_context(viewport={"width": 1360, "height": 860})
        self.addCleanup(ctx.close)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.base + "/onboard/testland/-/region.unit")
        page.wait_for_selector("text=Region, unit rule and sources", timeout=15000)
        self.assertTrue(page.locator("text=What counts as").first.is_visible())
        page.goto(self.base + "/onboard")
        page.wait_for_selector("text=Testland", timeout=15000)
        self.assertEqual(errors, [])

    def test_the_stale_cascade_is_derived_not_stored(self):
        self.call("/__onboard/new-region", {"id": "cascade", "name": "Cascade", "centre": [46.5, 8.2]})
        src = {"id": "inv", "name": "National inventory", "url": "https://example.org/inv", "licence": "CC BY 4.0", "commercialUse": True}
        rule = "The ten largest glaciers by area in the national inventory, named units only."
        r = self.call("/__onboard/confirm", {"region": "cascade", "glacier": None, "step": "region.unit", "patch": {"unitRule": rule, "count": 10, "sources": [src]}, "reason": "read the inventory page"})
        self.assertEqual(r.get("ok"), True, r)
        st = self.call("/__onboard/state?region=cascade&glacier=-") if False else self.call("/__onboard/state?region=cascade")
        self.assertEqual([s["status"] for s in st["steps"] if s["id"] == "region.unit"], ["done"])
        # changing the rule makes the confirmation stale on the next read, with no bookkeeping in between
        path = os.path.join(self.tmp, "data", "cascade", "region.json")
        j = json.load(open(path)); j["unitRule"] = rule + " (changed)"; json.dump(j, open(path, "w"))
        st = self.call("/__onboard/state?region=cascade")
        self.assertEqual([s["status"] for s in st["steps"] if s["id"] == "region.unit"], ["stale"])


if __name__ == "__main__":
    unittest.main()
