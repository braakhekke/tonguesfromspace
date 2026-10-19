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

    def open(self, hash="", viewport=None, fresh=False, path="/index.html", **ctx_args):      # fresh: a first visit (the film plays); otherwise the film counts as seen
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
        page.goto(self.base + path + hash, wait_until="load")
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

    def test_street_view_layer_is_hidden_without_a_key_and_builds_embed_links(self):
        page = self.open()
        self.assertEqual(page.evaluate("$('svRow').hidden"), not page.evaluate("!!SV_KEY"), "the Street View layer is offered only with a key (config.js)")
        url = page.evaluate("svEmbedUrl({pano: 'abc', heading: 10, fov: 80})")
        for part in ("maps/embed/v1/streetview", "pano=abc", "heading=10", "fov=80"):
            self.assertIn(part, url)
        self.assertIn("map_action=pano", page.evaluate("svMapsUrl({pano: 'abc'})"))
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


ICELAND_HIDDEN = os.path.isfile(os.path.join(SITE, "config.js")) and not os.path.isfile(os.path.join(SITE, "iceland", "vatnajokull", "index.html"))      # a built site made without PUBLISH_ICELAND=1


@unittest.skipIf(ICELAND_HIDDEN, "built site without Iceland (PUBLISH_ICELAND is not 1)")
class TestRegions(SiteCase):
    """Switzerland is the plain address; Iceland > Vatnajökull is #r=is-vatnajokull. Each loads only its own data file; features without data are off."""
    def requested(self, page_hash):
        seen = []
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 860})
        self.addCleanup(ctx.close)
        ctx.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1')}catch(e){}")
        ctx.route("**/*", lambda route: (seen.append(route.request.url), route.continue_())[1] if route.request.url.startswith((self.base, *ALLOWED_EXTERNAL)) or route.request.url.startswith("data:") else route.abort())
        page = ctx.new_page()
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        page.goto(self.base + "/index.html" + page_hash, wait_until="load")
        page.wait_for_function("typeof L !== 'undefined' && document.getElementById('story') && document.getElementById('story').dataset.glacier", timeout=30000)
        return page, seen

    def test_switzerland_is_the_plain_address_and_loads_no_icelandic_data(self):
        page, seen = self.requested("")
        self.assertEqual(page.evaluate("REGION.id"), "ch")
        self.assertFalse([u for u in seen if "/data/vatnajokull" in u], "the Swiss page must not fetch the Icelandic data")
        self.assertTrue([u for u in seen if "/data/glaciers" in u])
        self.assertClean()

    def test_vatnajokull_link_loads_only_its_own_data_and_opens_on_its_outlet(self):
        page, seen = self.requested("#r=is-vatnajokull")
        self.assertEqual(page.evaluate("REGION.id"), "is-vatnajokull")
        self.assertEqual(page.evaluate("GLACIERS.map(g => g.id)"), ["breidamerkurjokull"])
        self.assertFalse([u for u in seen if "/data/glaciers" in u], "the Icelandic page must not fetch the Swiss data")
        self.assertTrue([u for u in seen if "/data/vatnajokull" in u])
        self.assertTrue(page.evaluate("glacierPicked"), "Vatnajökull opens on Breiðamerkurjökull, like Switzerland on its biggest glacier")
        self.assertEqual(page.evaluate("state.glacier"), "breidamerkurjokull")
        self.assertEqual(page.evaluate("viewMode"), "3d")
        self.assertClean()

    def test_vatnajokull_outlines_whole_glacier_and_tongue(self):
        page = self.open("#r=is-vatnajokull&g=breidamerkurjokull&m=single&v=map")
        r = page.evaluate("""() => { const g = GLACIERS[0], fp = imageFootprint(g).bounds, tb = tongueBounds(g);
          return {lia: g.outlines.lia.lines.length, latest: g.outlines.latest.lines.length, year: [g.outlines.lia.year, g.outlines.latest.year], same: JSON.stringify(tb.toBBoxString().split(',').map(Number).map(v => +v.toFixed(3))) === JSON.stringify([fp[0][1], fp[0][0], fp[1][1], fp[1][0]].map(v => +v.toFixed(3))),
                  wholeBigger: wholeGlacierZoom(g) < map.getBoundsZoom(tb), outlineGeom: !!oldOutlineGeom(g) && !!newOutlineGeom(g)}; }""")
        self.assertGreater(r["lia"], 20); self.assertGreater(r["latest"], 20)
        self.assertEqual(r["year"], [1890, 2025])
        self.assertTrue(r["same"], "Tongue shows exactly the picture box")
        self.assertTrue(r["wholeBigger"], "Whole glacier shows much more than the picture box")
        self.assertTrue(r["outlineGeom"])
        self.assertClean()

    def test_vatnajokull_panel_has_the_about_block_and_no_extra_cards(self):
        page = self.open("#r=is-vatnajokull&g=breidamerkurjokull&m=single")
        self.assertEqual(page.locator("#story details.about").count(), 1)
        self.assertEqual(page.locator("#story .gh-invite").count(), 1)
        self.assertGreaterEqual(page.locator("#story details.about-ch").count(), 8)
        text = page.evaluate("document.getElementById('story').innerText")
        self.assertNotIn("About Tongues from Space Vatnaj", text)
        figures = page.evaluate("[...document.querySelectorAll('#story [data-panel=figures] .card-h')].map(e => e.textContent.trim())")
        self.assertNotIn("Source", figures, "no Source card in Stats")
        self.assertIn("/data/vatnajokull", "".join(page.evaluate("[...document.scripts].map(s => s.src)")))
        self.assertClean()

    def test_region_menu_items_share_font_and_size(self):
        page = self.open()
        page.click("#regionBtn")
        fonts = page.evaluate("[...document.querySelectorAll('#regionMenu li')].map(li => { const s = getComputedStyle(li); return s.fontSize + '|' + s.fontWeight + '|' + s.fontFamily; })")
        self.assertEqual(len(set(fonts)), 1, fonts)

    # setCam clamps the camera with the limits defined next to the camera: a missing definition shows only here
    VIEWER_JS = """async () => { const g = GLACIERS[0], b = await loadBundle(bundleId(g)); if (!b) return 'no terrain file'; const S = stripOf(b, g), tc = document.createElement('canvas'); tc.width = S.tex[0]; tc.height = S.tex[1];
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; document.body.appendChild(cv);
      const v = startViewer(cv, b.heights, tc, b.nA, b.nB, S.up, S.back, S.dist, S.half); const cam = v.getCam(); v.setCam(cam); v.destroy(); cv.remove(); return {half: S.half, el: cam.el, dist: cam.dist}; }"""

    def test_3d_viewer_starts_on_the_terrain_file_of_each_region(self):      # a plain script error in the viewer (a comment that swallowed a definition once) would show as "3D view failed"
        for h in ("#r=is-vatnajokull&g=breidamerkurjokull&m=single&v=map", "#g=gorner&m=single&v=map"):
            page = self.open(h)
            r = page.evaluate(self.VIEWER_JS)
            self.assertIsInstance(r, dict, f"{h}: {r}")
            self.assertGreater(r["dist"], 0)
            self.assertClean()
        self.assertEqual(self.open("#r=is-vatnajokull&g=breidamerkurjokull&m=single&v=map").evaluate(self.VIEWER_JS)["half"], 9000)

    def test_landsat_switch_adds_and_removes_the_years_before_sentinel2(self):      # Iceland: the checkbox under the years; the Landsat pictures are static files (no relay), 30 m, natural colour
        page = self.open("#r=is-vatnajokull&g=breidamerkurjokull&m=single&v=map")
        page.wait_for_function("state.checked", timeout=30000)
        self.assertEqual(page.evaluate("YEARS[0]"), 2016, "off at first: the years start with Sentinel-2")
        self.assertEqual(page.evaluate("document.getElementById('landsatToggle').checked"), False)
        self.assertIn("30 m", page.evaluate("document.getElementById('landsatRow').innerText"))
        page.click("#landsatToggle")
        page.wait_for_function("okYears().includes(1990)", timeout=10000)
        self.assertEqual(page.evaluate("YEARS[0]"), 1984)
        sc = page.evaluate("state.available[1990]")
        self.assertEqual((sc["sensor"], sc["sat"]), ("landsat", "landsat-5"))
        self.assertIsNone(page.evaluate("state.available[2014]"), "Landsat 8 is not used")
        page.click("#yearsOne button >> text=1990")
        page.wait_for_function("tlLayers.length === 1", timeout=15000)
        self.assertIn("Landsat 5", page.evaluate("document.querySelector('#tagTsub').innerText"))
        self.assertIn("U.S. Geological Survey", page.evaluate("document.getElementById('credits').innerText"))
        page.click("#modeCompare")      # the switch stays on across modes
        self.assertEqual(page.evaluate("YEARS[0]"), 1984)
        page.click("#landsatToggle")
        self.assertEqual(page.evaluate("[YEARS[0], okYears().filter(y => y < 2016).length, state.one >= 2016 || state.one == null]"), [2016, 0, True])
        self.assertClean()

    def test_vatnajokull_has_oldest_and_latest(self):      # Oldest: the historic aerial mosaic of 1980/82 (one file), Latest: the newest scene of the last weeks
        page = self.open("#r=is-vatnajokull&g=breidamerkurjokull&m=single&one=1990&v=map")      # a year before Sentinel-2 in the link switches the Landsat pictures on, which need no relay (the tests have none)
        page.wait_for_function("oldestAerial.get('breidamerkurjokull') !== undefined", timeout=15000)
        self.assertEqual(page.evaluate("[...document.querySelectorAll('#yearsSpecial button')].map(b => b.textContent)"), ["Oldest", "Latest"])
        page.click("#yearsSpecial button >> text=Oldest")
        page.wait_for_function("!!aerial.T", timeout=10000)
        self.assertEqual(page.evaluate("state.oldestAerial"), 1980)
        self.assertIn("1980/82", page.evaluate("document.querySelector('#tagT small').innerText"))
        self.assertIn("Náttúrufræðistofnun", page.evaluate("document.getElementById('credits').innerText"))
        page.click("#yearsSpecial button >> text=Oldest")      # a second click leaves it
        self.assertIsNone(page.evaluate("state.oldestAerial"))
        self.assertClean()

    def test_vatnajokull_trails_are_lines_and_the_ice_front_in_view_is_drawn(self):
        page = self.open("#r=is-vatnajokull&g=breidamerkurjokull&m=single&v=map")
        page.click("#lbToggle"); page.click("#trailsToggle")
        page.wait_for_function("!!window.GLACIER_SIGHT && !!sightLayer", timeout=15000)
        self.assertGreater(page.evaluate("trailsFor(GLACIERS[0]).paths.length"), 10)
        self.assertGreater(page.evaluate("sightFor(GLACIERS[0]).lines.length"), 5)
        self.assertClean()

    def test_region_menu_has_iceland_with_vatnajokull_below_it_and_switches(self):
        page = self.open()
        page.click("#regionBtn")
        self.assertEqual(page.locator("#regionMenu li.group").text_content(), "Iceland")
        self.assertEqual(page.locator("#regionMenu li.sub").text_content(), "Vatnajökull")
        with page.expect_navigation():
            page.click("#regionMenu li.sub")
        page.wait_for_function("typeof REGION !== 'undefined' && REGION.id === 'is-vatnajokull'")
        self.assertTrue("r=is-vatnajokull" in page.evaluate("location.hash") or page.evaluate("location.pathname") == "/iceland/vatnajokull/")      # the built site has an address for it, the source tree the hash
        self.assertClean()

    def test_iceland_has_its_own_address_on_the_built_site(self):      # /iceland/vatnajokull/ and /iceland/ are written by build_site.py: TFS_SITE_DIR=_site
        if not os.path.isfile(os.path.join(SITE, "iceland", "vatnajokull", "index.html")):
            self.skipTest("not the built site")
        for path in ("/iceland/vatnajokull/", "/iceland/"):
            page = self.open(path=path)
            self.assertEqual(page.evaluate("REGION.id"), "is-vatnajokull", path)
            self.assertEqual(page.evaluate("document.title"), "Tongues from Space | Vatnajökull, Iceland")
            self.assertNotIn("r=", page.evaluate("location.hash"), "the address names the region, not the hash")
            self.assertEqual(page.evaluate("document.querySelector('link[rel=canonical]').href"), "https://tonguesfromspace.org/iceland/vatnajokull/")
            self.assertIn("preview-iceland", page.evaluate("document.querySelector('meta[property=\"og:image\"]').content"))
            self.assertEqual(page.evaluate("[regionLink('ch'), regionLink('is-vatnajokull')]"), ["/", "/iceland/vatnajokull/"])
            self.assertClean()
        page.click("#regionBtn")
        with page.expect_navigation():
            page.click("#regionMenu li[data-id=ch]")
        page.wait_for_function("typeof REGION !== 'undefined' && REGION.id === 'ch'")
        self.assertEqual(page.evaluate("location.pathname"), "/")
        page = self.open()
        self.assertIn("Interactive Glaciers", page.evaluate("document.title"))
        self.assertEqual(page.evaluate("document.querySelector('link[rel=canonical]').href"), "https://tonguesfromspace.org/")

    def test_vatnajokull_hides_what_has_no_data_and_choosing_the_outlet_works(self):
        page = self.open("#r=is-vatnajokull")
        self.assertTrue(page.is_visible("#viewGroup"), "the 3D view is offered (terrain from the ArcticDEM file)")
        for sel in ("#aerialToggle", "#topoToggle", "#altiToggle", "#radarToggle", "#teaserBtn"):
            self.assertFalse(page.locator(sel).evaluate("e => (e.closest('label') || e).offsetParent !== null"), sel + " should be hidden")
        self.assertTrue(page.evaluate("glacierPicked"))
        self.assertGreaterEqual(page.evaluate("checkGen"), 1, "the scene search starts at once")
        for t in ("look", "figures", "swiss"):
            page.click(f'#story [role=tab][data-tab="{t}"]')
            self.assertEqual(page.locator(f'#story [data-panel="{t}"]:not([hidden])').count(), 1)
        self.assertClean()

    def test_vatnajokull_scene_rules(self):      # the clear scene closest to 30 September; one orbit for all years
        page = self.open("#r=is-vatnajokull")
        r = page.evaluate("""() => {
          const day = (date, orbit, cloud) => ({date, orbit, cloud, snow: 0, cover: 1});
          const pick = pickScene([day('2024-09-10', 'R095', 0.01), day('2024-10-02', 'R095', 0.02), day('2024-08-05', 'R052', 0)], 2024);
          const cloudy = pickScene([day('2024-09-10', 'R095', 0.2), day('2024-09-30', 'R095', 0.1)], 2024);
          const g = GLACIERS[0]; sceneDays.clear();
          const set = (yr, days) => sceneDays.set(g.id + '|' + yr, days);
          set(2020, [day('2020-09-01', 'R095', 0.01), day('2020-09-29', 'R052', 0.01)]);
          set(2021, [day('2021-09-05', 'R095', 0.02)]);
          set(2022, [day('2022-09-28', 'R052', 0.01), day('2022-09-12', 'R095', 0.2)]);
          const avail = {2020: pickScene(sceneDays.get(g.id + '|2020'), 2020), 2021: pickScene(sceneDays.get(g.id + '|2021'), 2021), 2022: pickScene(sceneDays.get(g.id + '|2022'), 2022)};
          const u = unifyOrbit(g, avail);
          return {pick: pick.date, cloudy: [cloudy.date, cloudy.clear], u, orbits: [2020, 2021, 2022].map(y => avail[y] && avail[y].orbit)};
        }""")
        self.assertEqual(r["pick"], "2024-10-02")      # 2 days from 30 Sep beats 20 days
        self.assertEqual(r["cloudy"], ["2024-09-30", False])
        self.assertEqual(r["u"]["orbit"], "R095")      # R095 has a usable scene in all three years (2022 only a cloudy one), R052 in two
        self.assertEqual(r["orbits"][:2], ["R095", "R095"])
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

    def test_3d_layers_under_the_satellite_picture(self):      # one base map, then the aerial images; "Oldest" shows the aerial image alone
        js = "() => { const set = (id, on) => { $(id).checked = on; }; ['osmToggle','topoToggle','altiToggle','aerialToggle'].forEach(id => set(id, false)); %s; const r = baseKeys(); state.oldestAerial = null; return r; }"
        self.assertEqual(self.page.evaluate(js % ""), [])
        self.assertEqual(self.page.evaluate(js % "set('aerialToggle', true)"), ["aerialToggle"])
        self.assertEqual(self.page.evaluate(js % "set('osmToggle', true); set('aerialToggle', true)"), ["osmToggle", "aerialToggle"])
        self.assertEqual(self.page.evaluate(js % "set('osmToggle', true); state.oldestAerial = 2017"), ["aerialToggle"])
        self.assertIn("swissimage-product/default/2023/", self.page.evaluate("V3D_BASES.aerialToggle.url(15, 1, 2, 2023)"))

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


class TestIcelandTerrainData(unittest.TestCase):
    """data/terrain/<outlet>: the terrain file of Breiðamerkurjökull holds one surface per year (scripts/build_dem_iceland.py)."""
    def test_terrain_file_has_a_surface_for_every_year(self):
        import json, struct, zlib
        man = json.load(open(os.path.join(ROOT, "data", "terrain", "manifest.json")))
        raw = open(os.path.join(ROOT, "data", "terrain", man["breidamerkurjokull"]), "rb").read()
        self.assertEqual(raw[:4], b"TFS1")
        hl = struct.unpack("<I", raw[4:8])[0]
        head = json.loads(raw[8:8 + hl])
        n = (head["nA"] + 1) * (head["nB"] + 1)
        body = zlib.decompress(raw[8 + hl:])
        y = head["yearly"]
        self.assertEqual(y["years"][0], 2011)      # the first summer strip over the outlet is from July 2011
        self.assertEqual(len(y["kind"]), len(y["years"]))
        self.assertTrue(set(y["kind"]) <= {"measured", "interpolated", "held"})
        self.assertEqual(len(body), 2 * n * (1 + len(y["years"])), "the latest surface, then one surface per year")
        self.assertEqual(head["nB"] % 4, 0)
        self.assertGreater(len(y["strips"]), 5)


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


class TestStreetViewData(unittest.TestCase):
    """streetview.json (scripts/build_streetview.py): only ids and the view to open, never pictures; every entry can be opened and credited."""
    def test_panoramas_have_what_the_viewer_needs(self):
        import json
        path = os.path.join(ROOT, "data", "streetview.json")
        if not os.path.exists(path):
            self.skipTest("no streetview.json")
        data = json.load(open(path, encoding="utf-8"))
        self.assertEqual(len(data["B36-26"]), 7)
        for gid, items in data.items():
            ids = [p["pano"] for p in items]
            self.assertEqual(len(ids), len(set(ids)), gid)
            for p in items:
                self.assertTrue(p["pano"] and p["title"] and p["credit"], p)
                self.assertRegex(p["date"], r"^\d{4}-\d{2}$")
                self.assertTrue((45 < p["lat"] < 48 and 5 < p["lng"] < 11) or (gid == "breidamerkurjokull" and 63.9 < p["lat"] < 64.3 and -16.6 < p["lng"] < -16.0), p["pano"])      # Switzerland, or Iceland (Breiðamerkurjökull)
                self.assertTrue(0 <= p["heading"] < 360 and -90 <= p["pitch"] <= 90 and 10 <= p["fov"] <= 100, p["pano"])
                self.assertFalse({"url", "src", "image", "thumb"} & set(p), "Google's pictures must not be stored")
