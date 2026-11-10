"""The glacier size page's second face: Area (2D) | Volume (3D), the ice of a glacier as one block.

Run like the other site tests. The tests block every host but the site's own and cdnjs, so the 3D library (three.js, loaded only when 3D is switched on)
is not there: they check what does not need WebGL, that is the stated volumes, the switch, which controls go and which stay, the figures in the right panel and the link.
"""
import json, os, unittest
from test_site import SiteCase, ROOT

DATA = os.path.join(ROOT, "data", "ice-volumes.json")


class TestSizeVolume(SiteCase):
    def size(self, hash):
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 860})
        self.addCleanup(ctx.close)
        ctx.route("**/*", lambda route: route.continue_() if route.request.url.startswith((self.base, "https://cdnjs.cloudflare.com/")) or route.request.url.startswith("data:") else route.abort())
        page = ctx.new_page()
        page.goto(self.base + "/size.html" + hash, wait_until="load")
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        page.wait_for_function("typeof SIZE_DATA !== 'undefined' && document.querySelectorAll('#gList button').length === 10", timeout=30000)
        return page

    def test_the_volumes_are_those_of_the_data_file_and_cover_every_glacier(self):
        page = self.size("#g=B36-26&mode=2d")
        want = {v["id"]: v for v in json.load(open(DATA))}
        have = {v["id"]: v for v in page.evaluate("ICE_VOLUMES")}
        self.assertEqual(set(have), set(page.evaluate("SIZE_DATA.glaciers.map(g => g.id)")), "a volume for each of the ten glaciers")
        for gid, v in want.items():
            self.assertEqual(have[gid]["V2016"], v["V2016"], f"{gid}: the stated volume is copied, not changed")
            self.assertLess(have[gid]["dV"], 0, f"{gid}: GLAMOS volume change is a loss")
            self.assertGreater(have[gid]["to"], have[gid]["from"])

    def test_switching_to_volume_changes_only_what_it_must(self):
        page = self.size("#g=B36-26&b=B56-07&c=zurich&mode=2d")
        self.assertTrue(page.is_visible("#modeSwitch"))
        self.assertTrue(page.is_visible("#layerbox") or page.is_visible("#map"), "2D shows the map")
        self.assertFalse(page.is_visible("#shapeSw"), "block or ball is a 3D choice")
        self.assertFalse(page.is_visible("#allTen"))
        page.click("#modeSwitch button[data-mode='3d']")
        page.wait_for_function("document.body.classList.contains('is-3d')")
        self.assertEqual(page.get_attribute("#modeSwitch", "data-on"), "3d")
        self.assertIn("mode=3d", page.evaluate("location.hash"))
        self.assertTrue(page.is_visible("#shapeSw") and page.is_visible("#allTen"), "block or ball and all ten appear with the volume view")
        self.assertEqual(page.evaluate("document.querySelector('#modeSwitch').nextElementSibling.id"), "shapeSw", "block or ball sits right under the 2D | 3D slider")
        self.assertTrue(page.is_visible("#layerbox"), "the layers box stays in 3D (it lists the 3D layers)")
        for kept in ("#gList", "#cities", "#cityForm", "#linkBtn", "#embedBtn", "#videoBtn"):      # the city choice, the link, the embed and Your visual stay
            self.assertTrue(page.is_visible(kept), kept + " stays")
        self.assertEqual(page.evaluate("document.querySelector('#gList .area').textContent"), "11.72 km³", "the list shows the stated volume")
        story = page.text_content("#story")
        for part in ("11.72 km³", "3.706 km³", "(computed)", "Zürich", "Mean loss 2017–2023"):
            self.assertIn(part, story)
        self.assertNotIn("Football pitches", story)
        self.assertEqual(page.evaluate("[...document.querySelectorAll('#story .cmp-bars b')].map(b => b.textContent)"), ["11.72 km³", "3.706 km³"])
        page.click("#cities button[data-k='bern']")
        self.assertIn("Bern", page.text_content("#story"), "the city choice works in 3D too")
        page.click("#modeSwitch button[data-mode='2d']")
        page.wait_for_function("!document.body.classList.contains('is-3d')")
        self.assertNotIn("mode=3d", page.evaluate("location.hash"))
        self.assertEqual(page.evaluate("document.querySelector('#gList .area').textContent"), "75.8 km²")
        self.assertIn("Areas side by side", page.text_content("#story"))
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])

    def test_the_all_ten_toggle_and_the_ball_work_without_webgl(self):
        page = self.size("#g=B36-26&c=zurich&mode=3d")
        page.wait_for_function("document.body.classList.contains('is-3d')")
        page.click("#allTen button:not(#totalSw)")
        page.wait_for_function("S3.all === true")
        self.assertEqual(page.evaluate("[...document.querySelectorAll('#gList button')].filter(b => b.getAttribute('aria-pressed') === 'true').length"), 10)
        story = page.text_content("#story")
        for name in ("Aletsch", "Fee", "Rhone", "Together", "Edge*"):
            self.assertIn(name, story)
        self.assertIn("all=1", page.evaluate("location.hash"))
        page.click("#modeSwitch button[data-mode='3d']")      # Volume pressed again: cube to ball
        page.wait_for_function("S3.shape === 'ball'")
        self.assertIn("Diameter*", page.text_content("#story"))
        self.assertIn("shape=ball", page.evaluate("location.hash"))
        self.assertIn("one ice ball", page.text_content("#introText"))
        page.click("#gList button[data-id='B53-04']")      # a click in the list goes back to the picked glacier
        page.wait_for_function("S3.all === false")
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])

    def test_the_dock_looks_like_the_dashboards(self):
        dash = self.open("#g=aletsch").evaluate("""() => { const bar = document.querySelector('.stage .mapbar'), z = document.getElementById('zoomIn'), st = bar.closest('.stage').getBoundingClientRect(), r = bar.getBoundingClientRect(), c = getComputedStyle(z), b = getComputedStyle(bar);
            return {bottom: Math.round(st.bottom - r.bottom), font: c.fontSize, padding: c.padding, radius: c.borderRadius, w: Math.round(z.getBoundingClientRect().width), h: Math.round(z.getBoundingClientRect().height), bg: b.backgroundColor, barRadius: b.borderRadius, z: b.zIndex}; }""")
        for mode in ("", "&mode=3d"):
            page = self.size("#g=B36-26&c=zurich" + (mode or "&mode=2d"))
            if mode: page.wait_for_function("document.body.classList.contains('is-3d')")
            mine = page.evaluate("""() => { const bar = [...document.querySelectorAll('.mapbar')].find(b => b.getBoundingClientRect().width > 0), z = bar.querySelector('#zoomIn, #s3ZoomIn'), st = bar.closest('.stage').getBoundingClientRect(), r = bar.getBoundingClientRect(), c = getComputedStyle(z), b = getComputedStyle(bar);
                return {bottom: Math.round(st.bottom - r.bottom), font: c.fontSize, padding: c.padding, radius: c.borderRadius, w: Math.round(z.getBoundingClientRect().width), h: Math.round(z.getBoundingClientRect().height), bg: b.backgroundColor, barRadius: b.borderRadius, z: b.zIndex}; }""")
            self.assertEqual(mine, dash, "the dock of the size page" + (" in 3D" if mode else "") + " is the explorer's dock: position, size, font, glass")


    def test_save_and_share_works_like_the_dashboards(self):
        page = self.size("#g=B36-26&b=B56-07&c=zurich&mode=2d")
        self.assertEqual(page.evaluate("[...document.querySelectorAll('#shareGroup .dl b')].map(b => b.textContent)"), ["Your visual", "Embed"], "the same two tiles as the explorer")
        self.assertTrue(page.evaluate("document.getElementById('videoSheet').hidden && document.getElementById('videoFrame').hidden"), "nothing of the pane before Your visual is clicked")
        self.assertFalse(page.evaluate("[...document.querySelectorAll('.vf-fmt')].some(b => b.offsetParent !== null)"), "the formats are not there yet")
        page.click("#videoBtn")
        page.wait_for_function("document.body.classList.contains('pane-open')")
        r = page.evaluate("""() => { const f = document.getElementById('videoFrame').getBoundingClientRect(), b = [...document.querySelectorAll('.vf-fmt')].filter(x => x.offsetParent !== null), sh = document.getElementById('videoSheet').getBoundingClientRect(), st = document.querySelector('.story').getBoundingClientRect();
            return {fmts: b.filter(x => x.dataset.fmt).map(x => x.dataset.fmt), tools: b.filter(x => !x.dataset.fmt).map(x => x.id), under: b.every(x => x.getBoundingClientRect().top >= f.bottom), sheetOverStory: sh.left <= st.left + 24 && sh.right >= st.right - 1, kind: vs.kind, imageFirst: document.getElementById('vkImage').getAttribute('aria-pressed') === 'true', go: document.getElementById('vsGo').textContent}; }""")
        self.assertEqual(r["fmts"], ["16:9", "9:16", "4:5", "custom"], "three fixed ratios and a custom one")
        self.assertEqual(r["tools"], ["vfLayers"], "the layers button sits with the formats (no full-screen button in the preview)")
        self.assertTrue(r["under"], "the formats sit under the outline of the picture")
        self.assertTrue(r["sheetOverStory"], "the pane covers the right panel")
        self.assertEqual((r["kind"], r["go"]), ("image", "Download image"))
        self.assertTrue(r["imageFirst"], "the pane opens on Image; Animation (the glaciers fly) is a choice next to it")
        page.click("#vfReel")
        self.assertEqual(page.get_attribute("#vfReel", "aria-pressed"), "true", "the clicked ratio shows as pressed")
        self.assertEqual(page.evaluate("fmtChoice"), "9:16")
        page.keyboard.press("Escape")
        page.wait_for_function("!document.body.classList.contains('pane-open')")
        self.assertTrue(page.evaluate("document.getElementById('videoFrame').hidden"))
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])

    def test_volume_3d_is_the_default_and_total_swiss_is_there(self):
        page = self.size("#g=B53-04&c=zermatt")
        page.wait_for_function("document.body.classList.contains('is-3d')")
        self.assertEqual(page.evaluate("[...document.querySelectorAll('#allTen button')].map(b => b.textContent.trim())"), ["Ten", "Total Swiss"])
        page.click("#totalSw")
        page.wait_for_function("S3.total === true && S3.all === false")
        self.assertIn("58.646", page.text_content("#story"))
        page.click("#allTen button:not(#totalSw)")
        page.wait_for_function("S3.all === true && S3.total === false")
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])

    def test_a_link_with_mode_opens_in_3d(self):
        page = self.size("#g=B53-04&c=zermatt&mode=3d")
        page.wait_for_function("document.body.classList.contains('is-3d')")
        self.assertEqual(page.get_attribute("#modeSwitch", "data-on"), "3d")
        self.assertIn("Fee", page.text_content("#story"))
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])


if __name__ == "__main__":
    unittest.main()
