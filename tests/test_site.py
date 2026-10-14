"""Tests of the page in a real (headless) Chromium. Python and Playwright only, no Node.

    pip install -r tests/requirements.txt && python3 -m playwright install chromium
    python3 -m unittest discover -s tests -v                       # the files of the repository, as scripts/serve.py serves them
    TFS_SITE_DIR=_site python3 -m unittest discover -s tests -v    # the built site (python3 scripts/build_site.py _site): split outlines, hashed names

Everything outside the page's own folder is blocked except the Leaflet library from cdnjs, so the tests do not depend on tile servers or on Copernicus
(there is no relay: the page shows its "no connection" note, and maps, outlines and figures work as without a relay). The pure functions of the page are called
through page.evaluate: the same code as in the browser, without a copy.

What is checked: no uncaught error while loading, choosing each of the ten glaciers, the tabs, a link that names a glacier, a phone-size window; the pure
functions (naming rule, scene choice, bounding box, ice estimate, MP4 packer); with the built site, that the 2023 outline is loaded when a glacier is chosen and not before.
"""
import functools, http.server, os, socketserver, threading, unittest
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.abspath(os.environ.get("TFS_SITE_DIR", ROOT))
ALLOWED_EXTERNAL = ("https://cdnjs.cloudflare.com/",)
IGNORED_CONSOLE = ("Failed to load resource", "net::ERR")      # blocked tiles, a missing config.js


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start_server():
    handler = functools.partial(Quiet, directory=SITE)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


class SiteCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv, cls.base = start_server()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.srv.shutdown()

    def open(self, hash="", viewport=None, fresh=False, **ctx_args):      # fresh: a first visit (the film plays); otherwise the film counts as seen
        ctx = self.browser.new_context(viewport=viewport or {"width": 1280, "height": 860}, **ctx_args)
        self.addCleanup(ctx.close)
        ctx.route("**/*", lambda route: route.continue_() if route.request.url.startswith((self.base, *ALLOWED_EXTERNAL)) or route.request.url.startswith("data:") else route.abort())
        ctx.add_init_script("try{if(!localStorage.getItem('glacierPrefs'))localStorage.setItem('glacierPrefs','{\"hideR\":false}')}catch(e){}")      # the right panel starts collapsed on a first visit; the tests need it open
        if not fresh:
            ctx.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1')}catch(e){}")      # the film of the first visit would cover the page
        page = ctx.new_page()
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORED_CONSOLE) and self.errors.append(f"console: {m.text}"))
        page.goto(self.base + "/index.html" + hash, wait_until="load")
        page.wait_for_function("typeof L !== 'undefined' && document.getElementById('story') && document.getElementById('story').dataset.glacier", timeout=30000)      # Leaflet is there and the page has booted
        return page

    def assertClean(self):
        self.assertEqual(self.errors, [], "errors in the page:\n" + "\n".join(self.errors))


class TestLoading(SiteCase):
    def test_overview_loads_without_errors(self):
        page = self.open()
        self.assertEqual(page.evaluate("GLACIERS.length"), 10)
        self.assertTrue(page.evaluate("glacierPicked"), "without a glacier in the link the page opens on the biggest one")
        self.assertEqual(page.evaluate("state.glacier"), page.evaluate("GLACIERS[0].id"))
        self.assertEqual(page.evaluate("state.mode"), "timelapse")
        self.assertClean()

    def test_every_glacier_can_be_chosen(self):
        page = self.open()
        ids = page.evaluate("GLACIERS.map(g => g.id)")
        for gid in ids:
            page.evaluate("id => chooseGlacier(id)", gid)
            page.wait_for_function("id => state.glacier === id && glacierPicked && currentGlacier().inv.outline", arg=gid, timeout=15000)
            self.assertTrue(page.evaluate("!!outlineLayers.new || !document.getElementById('newToggle').checked"), f"2023 outline not drawn for {gid}")
            self.assertTrue(page.evaluate("!!document.querySelector('#story h2')"))
        self.assertClean()

    def test_tabs_switch(self):
        page = self.open()
        page.evaluate("chooseGlacier(GLACIERS[0].id)")
        page.wait_for_function("glacierPicked")
        tabs = page.evaluate("[...document.querySelectorAll('#story [role=tab]')].map(t => t.dataset.tab)")
        self.assertGreaterEqual(len(tabs), 3)
        for t in tabs:
            page.click(f'#story [role=tab][data-tab="{t}"]')
            self.assertEqual(page.locator(f'#story [data-panel="{t}"]:not([hidden])').count(), 1, f"tab {t} shows no panel")
        self.assertClean()

    def test_link_with_glacier_opens_on_it(self):
        page0 = self.open()
        gid = page0.evaluate("GLACIERS[2].id")
        page = self.open(f"#g={gid}&m=single&one=2023")
        self.assertEqual(page.evaluate("state.glacier"), gid)
        self.assertTrue(page.evaluate("glacierPicked"))
        self.assertTrue(page.evaluate("!!currentGlacier().inv.outline"), "a link to a glacier must wait for its outline")
        self.assertClean()

    def test_phone_window_does_not_scroll_sideways(self):
        page = self.open(viewport={"width": 390, "height": 844})
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), 390 + 1)
        self.assertEqual(page.locator("#mGlacier").count(), 1)
        self.assertClean()

    def test_phone_glacier_card_opens_a_sheet_with_the_ten_glaciers(self):
        page = self.open(viewport={"width": 390, "height": 844})
        page.click("#mGlacier")
        self.assertEqual(page.locator(".g-sheet.open .g-list button").count(), 10)
        page.locator(".g-sheet.open .g-list button").nth(3).click()
        page.wait_for_function("state.glacier === GLACIERS[3].id", timeout=15000)
        self.assertEqual(page.locator(".g-sheet.open").count(), 0, "the sheet closes with the choice")
        page.wait_for_function("document.getElementById('mGlacier').textContent.includes(GLACIERS[3].name)")
        self.assertClean()

    def test_outline_is_loaded_when_the_glacier_is_chosen(self):      # only in the built site, where glaciers.js leaves the 2023 outlines out
        page = self.open()
        if not page.evaluate("GLACIERS.some(g => g.inv.outline_file)"):
            self.skipTest("the page holds the outlines itself (not the built site)")
        page.wait_for_function("currentGlacier().inv.outline", timeout=15000)      # the page opens on the biggest glacier: only its outline is loaded
        self.assertEqual(page.evaluate("GLACIERS.filter(g => g.inv.outline).length"), 1, "only the opening glacier's 2023 outline should be loaded")
        self.assertTrue(page.evaluate("GLACIERS.every(g => g.inv.oldest && g.inv.oldest.outline)"), "the overview needs the 1850 outlines of all ten")
        page.evaluate("chooseGlacier(GLACIERS[4].id)")
        page.wait_for_function("GLACIERS[4].inv.outline", timeout=15000)
        self.assertEqual(page.evaluate("GLACIERS.filter(g => g.inv.outline).length"), 2)
        self.assertClean()


    def test_sightline_file_is_loaded_when_the_trails_go_on(self):
        page = self.open()
        self.assertFalse(page.evaluate("!!window.GLACIER_SIGHT"), "sightline.js (135 kB) must not load at the start")
        page.evaluate("chooseGlacier(GLACIERS[0].id)")
        page.wait_for_function("glacierPicked")
        page.evaluate("() => { const t = document.getElementById('trailsToggle'); t.checked = true; t.dispatchEvent(new Event('change')); }")
        page.wait_for_function("sightTried", timeout=15000)
        if any(f.startswith("sightline") for f in os.listdir(os.path.join(SITE, "data"))):
            page.wait_for_function("!!window.GLACIER_SIGHT", timeout=15000)
        self.assertClean()


class TestRelayCalls(SiteCase):
    def test_a_busy_relay_is_retried_and_the_visitor_is_told(self):
        page = self.open()
        page.wait_for_timeout(1500)      # the page starts its own scene search at once (no relay here); let its failure message come first
        r = page.evaluate("""async () => {
          document.getElementById('notice').textContent = '';
          relayCheck = Promise.resolve({relay: true});      // as if the relay had answered its ping
          let n = 0;
          const real = window.fetch;
          window.fetch = async (url, init) => init && init.body === '{}' ? (++n === 1 ? new Response('busy', {status: 503}) : new Response('{"ok":true}', {status: 200})) : real(url, init);      // only this test's own request is answered
          const answer = await (await cdse('statistics', {}, 'application/json', 'test')).json();
          return {answer, calls: n, notice: document.getElementById('notice').textContent};
        }""")
        self.assertEqual(r["answer"], {"ok": True})
        self.assertEqual(r["calls"], 2)
        self.assertIn("trying again", r["notice"])

    def test_a_missing_relay_gives_a_readable_message(self):
        page = self.open()
        msg = page.evaluate("""async () => { relayCheck = Promise.resolve({relay: false}); try { await cdse('statistics', {}, 'application/json'); return 'no error'; } catch (e) { return e.message; } }""")
        self.assertNotEqual(msg, "no error")
        self.assertTrue(msg.startswith(("To load the satellite images", "This site has no connection", "The connection to Copernicus")), msg)


class TestFunctions(SiteCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.page_ctx = None

    def setUp(self):
        self.page = self.open()

    def test_short_name(self):
        for full, short in [("Grosser Aletschgletscher", "Grosser Aletsch"), ("Glacier de Corbassière", "Corbassière"), ("Vadret da Morteratsch", "Morteratsch"),
                            ("Fieschergletscher VS", "Fiescher"), ("Triftgletscher (BE)", "Trift")]:
            self.assertEqual(self.page.evaluate("n => shortName(n)", full), short)

    def test_union_bbox(self):
        r = self.page.evaluate("unionBbox([[46, 8], [47, 9]], {coordinates: [[[[7.5, 45.5], [9.5, 47.5], [8, 46]]]]})")
        self.assertEqual(r, [[45.5, 7.5], [47.5, 9.5]])
        self.assertEqual(self.page.evaluate("unionBbox([[46, 8], [47, 9]], null)"), [[46, 8], [47, 9]])

    def test_scene_choice_prefers_september_then_august_then_cloudy(self):
        day = lambda d, cloud, snow=0: {"date": d, "orbit": "R108", "cloud": cloud, "snow": snow}
        pick = lambda days: self.page.evaluate("d => pickScene(d)", days)
        self.assertEqual(pick([day("2023-08-10", 0.0), day("2023-09-05", 0.04)])["date"], "2023-09-05")      # clear September beats a clearer August
        self.assertEqual(pick([day("2023-09-05", 0.04, 0.5), day("2023-09-12", 0.04, 0.1)])["date"], "2023-09-12")      # least snow first
        self.assertEqual(pick([day("2023-08-10", 0.02), day("2023-09-05", 0.20)])["date"], "2023-08-10")      # September too cloudy: August
        some = pick([day("2023-08-10", 0.20), day("2023-09-05", 0.10)])
        self.assertEqual((some["date"], some["clear"]), ("2023-09-05", False))      # nothing clear: the least cloudy, marked "some clouds"
        self.assertIsNone(pick([day("2023-08-10", 0.5)]))

    def test_ice_estimate_runs_backwards_and_forwards(self):
        v = {"km3": 10, "yr": 2016}
        est = lambda y: self.page.evaluate("y => glacierIceAt(GLACIERS[0], {km3: 10, yr: 2016}, y)", y)
        self.assertAlmostEqual(est(2016), 10)
        self.assertLess(est(2024), est(2020))
        self.assertGreater(est(2010), est(2016))
        self.assertGreaterEqual(est(2100), 0)

    def test_photo_pose_points_the_camera_the_way_the_photo_looks(self):      # the 3D view's "then and now": heading, tilt and roll of a Smapshot photo in the scene of the strip
        pose = lambda **ph: self.page.evaluate("""ph => {
          const at = [46.5, 8.0], P = L.CRS.EPSG3857.project(L.latLng(at[0], at[1])), k = 1 / Math.cos(at[0] * Math.PI / 180);
          const S = {P, k, ue: 0, un: 1, up: 6000, back: 1000};      // the glacier runs north: up the glacier is north, to the right is east
          const east = L.CRS.EPSG3857.unproject(L.point(P.x + 1000 * k, P.y));
          return photoPose({lat: ph.east ? east.lat : at[0], lon: ph.east ? east.lng : at[1], alt: 2000, az: ph.az, tilt: ph.tilt, roll: ph.roll}, S, {fovY: 0.5, view: {cx: 0, cy: 0}});
        }""", ph)
        n = pose(az=0, tilt=0, roll=0)
        self.assertAlmostEqual(n["yaw"], 0, places=6)      # looking north = up the glacier
        self.assertAlmostEqual(pose(az=90, tilt=0, roll=0)["yaw"], 3.14159265 / 2, places=5)      # east = to the right
        self.assertAlmostEqual(abs(pose(az=180, tilt=0, roll=0)["yaw"]), 3.14159265, places=5)
        d = pose(az=1.16, tilt=355.97, roll=358.0)      # the Aletsch photo of 1956: a little down, a little rolled
        self.assertAlmostEqual(d["pitch"], -4.03 * 3.14159265 / 180, places=4)
        self.assertAlmostEqual(d["roll"], -2.0 * 3.14159265 / 180, places=4)
        self.assertAlmostEqual(pose(az=0, tilt=10, roll=0)["pitch"], 10 * 3.14159265 / 180, places=5)
        e = pose(az=0, tilt=0, roll=0, east=True)
        self.assertAlmostEqual(e["x"], 1000, delta=2); self.assertAlmostEqual(e["z"], 0, delta=2)      # 1 km east of the tip: x = 1000

    def test_old_ice_level_follows_the_volume_surveys(self):      # the rod of an old photo: thinning of the whole glacier since then, from the GLAMOS surveys, joined in a straight line
        level = lambda y: self.page.evaluate("""y => iceLevel({inv: {volume: {from: 2017, to: 2023, series: [[1927, 2023, 0, -66.3, 0, 0, 97], [1957, 2023, 0, -52.0, 0, 0, 98], [2017, 2023, 0, -11.2, 0, 0, 100]]}}}, y, {dem: null, grid: {}, S: {}}, null)""", y)
        self.assertAlmostEqual(level(1957)["low"], 52.0, places=6)
        self.assertAlmostEqual(level(1942)["low"], 59.15, places=6)      # half way between the 1927 and the 1957 survey
        a = level(1957)
        self.assertEqual((a["low"], a["mid"], a["high"]), (52.0, 52.0, 52.0))      # without a measured tongue the range closes: the glacier-wide value
        self.assertGreater(level(1930)["low"], level(1990)["low"])      # the older, the more ice

    def test_lakes_are_set_to_the_flat_level_the_model_already_has(self):      # the 3D terrain: a lake that grew over lower ground is levelled, a lake without a flat level and a stream are left alone
        r = self.page.evaluate("""() => {
          const nA = 30, nB = 30, n = nB + 1, H = new Float32Array((nA + 1) * n).fill(120), M = new Uint8Array((nA + 1) * n);
          for (let j = 5; j <= 14; j++) for (let i = 5; i <= 14; i++) { M[j * n + i] = 1; H[j * n + i] = i <= 9 ? 100 : 90; }      // the old lake: flat at 100 m (half of it); the new part: a bowl at 90 m
          for (let j = 22; j <= 26; j++) for (let i = 4; i <= 24; i++) { M[j * n + i] = 1; H[j * n + i] = 60 + (i - 4) * 1.5; }      // a lake on a slope: no flat level
          for (let j = 2; j <= 28; j++) { M[j * n + 28] = 1; H[j * n + 28] = 70; }      // a one-vertex stream
          const out = flattenLakes(H, M, nA, nB), at = (j, i) => out[j * n + i];
          return {bowl: at(10, 12), plateau: at(10, 7), slope: [at(24, 4), at(24, 24)], stream: at(10, 28), land: at(0, 0), same: flattenLakes(new Float32Array(H.length).fill(5), new Uint8Array(H.length), nA, nB)[3],
                  rgb: [isWaterRGB(106, 141, 134), isWaterRGB(153, 176, 172), isWaterRGB(21, 37, 53), isWaterRGB(141, 131, 121), isWaterRGB(230, 226, 225)]};
        }""")
        self.assertAlmostEqual(r["bowl"], 100, places=3)      # the new part is raised to the level of the old lake
        self.assertAlmostEqual(r["plateau"], 100, places=3)
        self.assertEqual(r["slope"], [60, 60 + 20 * 1.5])      # no flat level: untouched
        self.assertEqual(r["stream"], 70); self.assertEqual(r["land"], 120)
        self.assertEqual(r["rgb"], [True, True, False, False, False])      # the Rhone lake and the pale Zmutt lake are water; shade, rock and snow are not

    def test_mp4_packer_makes_well_formed_boxes(self):
        data = self.page.evaluate("""() => {
          const samples = [0, 1, 2].map(i => ({pts: i * 33333, key: i === 0, data: new Uint8Array([1, 2, 3, 4, 5 + i])}));
          return Array.from(muxMp4({width: 64, height: 64, fps: 30, avcC: new Uint8Array([1, 66, 0, 30, 255, 225, 0, 0]), samples}));
        }""")
        b, pos, top = bytes(data), 0, []
        while pos < len(b):
            size = int.from_bytes(b[pos:pos + 4], "big")
            top.append(b[pos + 4:pos + 8].decode())
            self.assertGreaterEqual(size, 8)
            pos += size
        self.assertEqual(pos, len(b), "box sizes must add up to the file")
        self.assertEqual(top, ["ftyp", "moov", "mdat"])
        self.assertTrue(b.endswith(bytes([1, 2, 3, 4, 5, 1, 2, 3, 4, 6, 1, 2, 3, 4, 7])))


class TestTeaser(SiteCase):
    """The film of the first visit (js/13-teaser.js): plays on the plain address once, never for links, never for people who asked for less motion."""
    def test_first_visit_shows_film_and_skip_ends_it(self):
        page = self.open(fresh=True)
        page.wait_for_selector("#teaser .teaser-skip", timeout=5000)
        self.assertTrue(page.evaluate("document.querySelectorAll('#teaser video source').length >= 1"))
        page.click("#teaser .teaser-skip")
        page.wait_for_selector("#teaser", state="detached", timeout=5000)
        self.assertEqual(page.evaluate("localStorage.getItem('tfs-teaser-seen')"), "1")
        self.assertClean()

    def test_escape_leaves_the_film(self):
        page = self.open(fresh=True)
        page.wait_for_selector("#teaser", timeout=5000)
        page.keyboard.press("Escape")
        page.wait_for_selector("#teaser", state="detached", timeout=5000)

    def test_seen_a_link_or_reduced_motion_show_no_film(self):
        self.assertEqual(self.open().locator("#teaser").count(), 0)      # seen
        self.assertEqual(self.open("#g=aletsch&m=single", fresh=True).locator("#teaser").count(), 0)      # a link to a glacier
        self.assertEqual(self.open(fresh=True, reduced_motion="reduce").locator("#teaser").count(), 0)

    def test_replay_button_and_link(self):
        page = self.open()
        page.click("#teaserBtn")
        page.wait_for_selector("#teaser", timeout=5000)
        page.keyboard.press("Escape")
        page.wait_for_selector("#teaser", state="detached", timeout=5000)
        self.assertEqual(self.open("#teaser").locator("#teaser").count(), 1)      # the link plays it even when seen


if __name__ == "__main__":
    unittest.main()


class TestPhotoData(unittest.TestCase):
    """photos.json (scripts/build_photos.py): every photograph has what the 3D view needs to place it."""
    def test_photos_have_pose_image_and_licence(self):
        import json
        path = os.path.join(SITE, "data", "photos.json")
        if not os.path.exists(path):
            path = os.path.join(ROOT, "data", "photos.json")
        if not os.path.exists(path):
            self.skipTest("no photos.json")
        data = json.load(open(path, encoding="utf-8"))
        self.assertTrue(data)
        for gid, photos in data.items():
            ids = [p["id"] for p in photos]
            self.assertEqual(len(ids), len(set(ids)), gid)
            for p in photos:
                self.assertTrue(p["date"].startswith(str(p["year"])), p["id"])
                self.assertTrue(p["w"] > 0 and p["h"] > 0 and p["focal"] > 0, p["id"])
                self.assertTrue(0 <= p["az"] < 360 and 0 <= p["tilt"] < 360 and 0 <= p["roll"] < 360, p["id"])
                self.assertTrue(45 < p["lat"] < 48 and 5 < p["lon"] < 11, p["id"])
                self.assertTrue(p["src"].startswith("https://") and p["thumb"].startswith("https://"), p["id"])
                self.assertTrue(p["link"].startswith("https://smapshot.heig-vd.ch/visit/"), p["id"])
                self.assertTrue(p.get("licence") or p.get("owner"), f"photo {p['id']} has no licence or owner: it cannot be credited")
