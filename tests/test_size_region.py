"""The size page of another region (New Zealand): size.html#r=nz brings data/size-nz.js (scripts/build_size_demo.py --region nz), Area only,
and the explorer of that region links to it. Run like the other site tests."""
import json, os, re, unittest
from test_site import SiteCase, ROOT


class TestSizeRegion(SiteCase):
    def size(self, hash):
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 860})
        self.addCleanup(ctx.close)
        ctx.route("**/*", lambda route: route.continue_() if route.request.url.startswith((self.base, "https://cdnjs.cloudflare.com/")) or route.request.url.startswith("data:") else route.abort())
        page = ctx.new_page()
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        page.goto(self.base + "/size.html" + hash, wait_until="load")
        page.wait_for_function("typeof SIZE_DATA !== 'undefined' && document.querySelectorAll('#gList button').length > 0", timeout=30000)
        return page

    def test_the_data_file_holds_the_stated_areas_and_the_outline_matches_them(self):
        s = open(os.path.join(ROOT, "data", "size-nz.js")).read()
        d = json.loads(s[s.index("SIZE_DATA=") + 10:s.index(";window.ICE_VOLUMES")])
        g = d["glaciers"][0]
        self.assertEqual((g["id"], g["area"], g["year"], g["area0"], g["year0"]), ("franz-josef", 31.0, 2019, 33.11, 1978))
        self.assertEqual([c["id"] for c in d["cities"]], ["auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin"])
        # urban areas, not whole council districts (Christchurch City alone is 1600 km2, Dunedin City 3300 km2)
        self.assertTrue(all(c["area"] < 700 for c in d["cities"]), [(c["id"], c["area"]) for c in d["cities"]])

    def test_new_zealand_shows_franz_josef_and_nz_cities_without_volume_or_swiss_layers(self):
        page = self.size("#r=nz&g=franz-josef")
        self.assertEqual(page.evaluate("[REG, GL.map(g => g.id), CITIES.some(c => c.id === 'wellington')]"), ["nz", ["franz-josef"], True])
        self.assertIn("Franz", page.evaluate("[...document.querySelectorAll('#gList button')].map(b => b.textContent)")[0])
        self.assertTrue(page.evaluate("$('modeSwitch').hidden"))      # no stated ice volume yet: no Volume 3D
        for i in ("airToggle", "topoToggle", "oldmapToggle"):
            self.assertTrue(page.evaluate(f"$('{i}').closest('label').hidden"), i)
        self.assertEqual(page.text_content("#oldToggle + span").strip(), "Outline 1978")
        page.click("#cities button[data-k=wellington]")
        page.wait_for_function("state.city && state.city.id === 'wellington'")
        self.assertIn("r=nz", page.evaluate("location.hash")); self.assertIn("c=wellington", page.evaluate("location.hash"))
        self.assertIn("33.1km²", page.evaluate("(() => { $('oldToggle').click(); return $('story').textContent; })()"))
        self.assertIn("2019", page.text_content("#story"))
        self.assertIn("GLIMS", page.text_content("#story"))
        self.assertEqual(page.evaluate("mainPage(GL[0], false)"), "index.html#r=nz&g=franz-josef")
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])

    def test_a_link_asking_for_volume_opens_area_while_there_is_no_volume(self):
        page = self.size("#r=nz&g=franz-josef&mode=3d")
        self.assertFalse(page.evaluate("document.body.classList.contains('is-3d')"))
        self.assertEqual([e for e in self.errors if e.startswith("pageerror")], [])

    def test_switzerland_is_unchanged(self):
        page = self.size("")
        self.assertEqual(page.evaluate("[REG, GL.length, OLDY]"), ["ch", 10, 1850])
        self.assertEqual(page.evaluate("mainPage(GL[0], false)"), "index.html#g=aletsch")
        self.assertEqual(page.text_content("#oldToggle + span").strip(), "Outline 1850")


if __name__ == "__main__":
    unittest.main()
