"""The walkthrough (walkthrough/): the real server on temporary folders, and the wizard in a real browser. Unit tests of the engine, steps, season rule and sources are in walkthrough/**/*.test.ts (npm run test:walkthrough)."""
import json, os, shutil, signal, socket, subprocess, tempfile, time, unittest
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
        subprocess.run([os.path.join(ROOT, "node_modules", ".bin", "tsx"), "walkthrough/cli.ts", "import-site"], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)      # the records of the site, as the wizard shows them
        cls.srv = subprocess.Popen([os.path.join(ROOT, "node_modules", ".bin", "tsx"), "walkthrough/server.ts"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)      # its own process group: tsx starts node as a child, and both must go
        cls.base = f"http://localhost:{cls.port}"
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.base + "/__onboard/overview", timeout=1).read()
                break
            except Exception:
                time.sleep(0.2)
        else:
            os.killpg(os.getpgid(cls.srv.pid), signal.SIGTERM)
            raise RuntimeError("the walkthrough server did not start")
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop()
        try: os.killpg(os.getpgid(cls.srv.pid), signal.SIGTERM)
        except ProcessLookupError: pass
        cls.srv.wait()
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

    def boxes(self):
        text = urllib.request.urlopen(self.base + "/site/data/boxes.js", timeout=20).read().decode()
        return json.loads(text[text.index("{"):text.rindex("}") + 1])["glaciers"]

    def test_the_real_page_shows_the_draft_before_anything_is_saved(self):
        saved = self.boxes()["B36-26"]["box"]["bounds"]
        self.assertEqual(saved[0][0], 46.35728576470588, "unchanged: the record's own box")
        draft = {"region": "ch", "glacier": "aletsch", "step": "glacier.placement", "patch": {"tip": [46.40297, 8.03359], "pictureBox": [[46.30, 7.90], [46.60, 8.20]]}}
        self.assertEqual(self.call("/__onboard/draft", draft), {"ok": True})
        self.assertEqual(self.boxes()["B36-26"]["box"]["bounds"], [[46.30, 7.90], [46.60, 8.20]], "the page is handed the box that is only in the form")
        on_disk = json.load(open(os.path.join(self.tmp, "data", "ch", "aletsch", "glacier.json")))
        self.assertEqual(on_disk["placement"]["pictureBox"], saved, "nothing was saved")
        self.call("/__onboard/draft", {**draft, "step": None})
        self.assertEqual(self.boxes()["B36-26"]["box"]["bounds"], saved, "no draft: the saved box again")

    def test_the_real_dashboard_opens_in_the_wizard_for_an_imported_glacier(self):
        ctx = self.browser.new_context(viewport={"width": 1500, "height": 900})
        self.addCleanup(ctx.close)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.base + "/onboard/ch/aletsch/glacier.placement")
        page.wait_for_selector("role=tab[name='Real page']", timeout=15000)
        page.click("role=tab[name='Real page']")
        frame = page.frame_locator("iframe.wz-frame")
        frame.locator("#story[data-glacier]").wait_for(timeout=30000)      # the glacier is chosen and its panel drawn
        self.assertIn("Aletsch", frame.locator("#story").inner_text(timeout=30000))
        self.assertEqual(errors, [])

    def test_the_strip_screen_edits_the_numbers_and_saves_them_with_the_confirmation(self):
        def ok(step, patch, glacier="aletsch"):
            r = self.call("/__onboard/confirm", {"region": "ch", "glacier": glacier, "step": step, "patch": patch, "reason": "looked at it on the real page"})
            self.assertEqual(r.get("ok"), True, r)
        ok("region.unit", {}, None); ok("glacier.record", {})
        st = self.call("/__onboard/state?region=ch&glacier=aletsch")
        ok("glacier.outline", {"epochs": st["outlines"]["epochs"]}); ok("glacier.placement", {})
        ctx = self.browser.new_context(viewport={"width": 1500, "height": 900})
        self.addCleanup(ctx.close)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.base + "/onboard/ch/aletsch/glacier.strip")
        page.wait_for_selector("text=Azimuth up the glacier", timeout=15000)
        azimuth = page.locator("label:has(span:text-is('Azimuth up the glacier, degrees')) input")
        self.assertEqual(float(azimuth.input_value()), 46.980177754196404, "the strip of the record, as imported")
        azimuth.fill("50")
        page.fill("label:has(span:text-is('Up the glacier, m')) input", "7000")
        page.fill("textarea", "The strip follows the middle of the tongue; checked on the map.")
        page.keyboard.press("Tab")
        for box in page.locator("[role=checkbox]").all(): box.click()
        page.click("text=Looks good, confirm")
        for _ in range(60):      # the step is done when the engine says so
            st = self.call("/__onboard/state?region=ch&glacier=aletsch")
            if [x["status"] for x in st["steps"] if x["id"] == "glacier.strip"] == ["done"]:
                break
            time.sleep(0.25)
        saved = json.load(open(os.path.join(self.tmp, "data", "ch", "aletsch", "glacier.json")))
        self.assertEqual((saved["placement"]["strip3d"]["azimuth"], saved["placement"]["strip3d"]["up"]), (50, 7000))
        self.assertTrue(saved["stripConfirmation"]["basedOn"])
        self.assertEqual(errors, [])

    def test_every_dated_outline_is_listed_and_several_can_be_kept(self):
        self.call("/__onboard/confirm", {"region": "ch", "glacier": None, "step": "region.unit", "patch": {}, "reason": "read the inventory page"})      # (already confirmed by an earlier test is fine)
        r = self.call("/__onboard/confirm", {"region": "ch", "glacier": "gorner", "step": "glacier.record", "patch": {}, "reason": "name, area and marker are right"})
        self.assertTrue(r.get("ok") or "error" in r, r)
        poly = {"type": "Polygon", "coordinates": [[[7.75, 45.92], [7.80, 45.92], [7.80, 45.97], [7.75, 45.92]]]}
        dated = [{"type": "Feature", "properties": {"date": d, "by": by, "area_km2": a}, "geometry": poly} for d, by, a in (("1850-09-01", "University of Zurich", 90.5), ("1927-08-12", "GLAMOS", 80.25), ("2017-09-01", "GLAMOS", 67.1))]
        self.call("/__onboard/propose", {"region": "ch", "glacier": "gorner", "step": "glacier.outline", "note": "test", "data": {"dated": dated, "candidates": {"new": [], "old": []}, "preselect": {"new": [], "old": []}, "epochs": {}}})
        ctx = self.browser.new_context(viewport={"width": 1500, "height": 900})
        self.addCleanup(ctx.close)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.base + "/onboard/ch/gorner/glacier.outline")
        page.wait_for_selector("text=All dated outlines (3)", timeout=15000)
        self.assertEqual(page.locator(".drow").count(), 4, "three dates and the row 'No past outline'")
        self.assertIn("1850", page.locator(".dated-years").inner_text())
        page.locator("input[aria-label='Keep the outline of 1927-08-12']").check()
        page.locator("input[aria-label='Keep the outline of 2017-09-01']").check()
        self.assertEqual(page.locator(".drow.on").count(), 2)
        page.locator("input[aria-label='Use the outline of 1850-09-01 as the past outline']").check()
        self.assertEqual(page.locator(".drow.on").count(), 3, "the past outline counts as kept, and cannot also be an extra one")
        self.assertTrue(page.locator("input[aria-label='Keep the outline of 1850-09-01']").is_disabled())
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
