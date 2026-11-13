"""The guide (js/guide-core.js, js/15-guide.js, js/guide-size.js): things to try, finished by using the real controls.

Run like the other site tests. They block every host but the site's own and cdnjs, so there are no satellite pictures and no 3D library:
the tests check the guide itself (first visit, the menu, the Guide button, a step that ends by doing it, Skip, Esc, the film, the embed,
the hand-over to the size page, a phone) with things that need no imagery: the Layers menu, the tabs of the right panel, the size page's lists.
The whole guide with real imagery is walked through by outputs/explorer-onboarding-2/test_prototype.py (local, needs scripts/serve.py).
"""
import json, unittest
from test_site import SiteCase

PHASE = "document.querySelector('.gd-bar').dataset.phase === %s"
SAYS = "(document.querySelector('.gd-msg p') || {textContent: ''}).textContent.includes(%s)"
DONE = "Object.keys((JSON.parse(localStorage.getItem('tfs-guide') || '{}').done) || {})"


class TestGuide(SiteCase):
    def first(self, hash="#g=aletsch&m=single", **kw):      # a first visit through a link to a glacier: no film, the guide's card opens
        page = self.open(hash, guide=True, **kw)
        page.wait_for_selector(".gd-bar[data-view='menu'] .gd-card", timeout=10000)
        return page

    def start(self, page, chapter, track):
        page.locator(".gd-chip").nth(chapter).click()
        page.click(f".gd-card[data-t='{track}']")
        page.wait_for_function(PHASE % json.dumps("beat"), timeout=20000)

    def test_first_visit_opens_the_card_and_it_stays_away_afterwards(self):
        page = self.first()
        self.assertEqual(page.locator(".gd-card").count(), 3, "three things to start with")
        self.assertGreaterEqual(page.locator(".gd-chip").count(), 3, "the chapters")
        self.assertIn("Aletsch", page.inner_text(".gd-bar h2"))
        self.assertEqual(page.locator("#teaserBtn").count(), 0, "the film has no button of its own any more")
        self.assertEqual(page.evaluate("document.querySelector('.brand-btns').firstElementChild.className"), "teaser-btn gd-launch", "Guide comes first in the row")
        page.click(".gd-bar .gd-x")
        self.assertFalse(page.is_visible(".gd-bar"), "put away: on a desktop only the button in the panel remains")
        self.assertTrue(page.evaluate("JSON.parse(localStorage.getItem('tfs-guide')).seen"))
        page.click(".gd-launch"); self.assertEqual(page.locator(".gd-card").count(), 3, "the button opens it again")
        self.assertEqual(self.open("#g=aletsch&m=single").locator(".gd-card").count(), 0, "seen: no card by itself")
        self.assertClean()

    def test_a_step_ends_by_doing_it(self):
        page = self.first()
        self.start(page, 1, "layers")
        self.assertTrue(page.is_visible(".gd-ring"), "the real control is ringed")
        box = page.evaluate("document.getElementById('app').classList.contains('is-3d') ? 'v3dLayers' : 'layerbox'")
        if page.evaluate(f"document.getElementById('{box}').classList.contains('min')"):
            page.click(f"#{box} .lb-head")      # the visitor opens Layers: the guide notices by itself
        page.wait_for_function(SAYS % json.dumps("Switch one"), timeout=10000)
        page.locator(f"#{box} input[type=checkbox]").locator("visible=true").last.click(force=True)
        page.wait_for_function(PHASE % json.dumps("end"), timeout=10000)
        self.assertIn("layers", page.evaluate(DONE))
        self.assertIn("1/", page.inner_text(".gd-launch"), "the button counts what has been tried")
        self.assertTrue(page.locator(".gd-bar [data-next], .gd-bar [data-more]").count(), "the end offers the next thing")
        self.assertClean()

    def test_tabs_of_the_right_panel_skip_and_escape(self):
        page = self.first()
        self.start(page, 1, "story")
        for tab in ("look", "figures", "swiss"):
            if page.get_attribute(f"#story [data-tab='{tab}']", "aria-selected") != "true":
                page.click(f"#story [data-tab='{tab}']"); page.wait_for_timeout(1200)
        page.wait_for_function(PHASE % json.dumps("end"), timeout=10000)
        self.assertIn("story", page.evaluate(DONE))
        page.click(".gd-menu"); self.start(page, 1, "colours")
        page.click(".gd-skip"); page.click(".gd-skip")      # skipped steps finish the thing too: nobody is held back
        page.wait_for_function(PHASE % json.dumps("end"), timeout=5000)
        page.keyboard.press("Escape")
        self.assertFalse(page.is_visible(".gd-bar"))
        self.assertClean()

    def test_no_guide_in_an_embed(self):
        page = self.open("#g=aletsch&m=single&embed=1", guide=True)
        page.wait_for_timeout(1500)
        self.assertEqual(page.locator(".gd-bar, .gd-launch, .gd-inset").count(), 0)

    def test_the_card_waits_for_the_film(self):
        page = self.open(fresh=True, guide=True)      # the plain address: the film plays first
        page.wait_for_selector("#teaser .teaser-skip", timeout=5000)
        self.assertFalse(page.is_visible(".gd-bar"), "nothing of the guide under the film")
        page.click("#teaser .teaser-skip")
        page.wait_for_selector(".gd-bar[data-view='menu'] .gd-card", timeout=5000)
        page.click(".gd-bar [data-extra]")      # and the guide's menu plays the film again
        page.wait_for_selector("#teaser", timeout=5000)

    def test_phone(self):
        page = self.first(viewport={"width": 390, "height": 844})
        self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "the card does not widen the page")
        self.assertTrue(page.evaluate("(() => { const b = document.querySelector('.gd-bar').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return b.left >= s.left && b.right <= s.right + 1; })()"), "the card stays inside the picture")
        self.assertClean()

    def test_size_page_and_the_way_there(self):
        page = self.first()
        if not page.locator(".gd-chip", has_text="Compare sizes").count():
            self.skipTest("this page does not link to the size page")
        page.locator(".gd-chip", has_text="Compare sizes").click()
        with page.expect_navigation():
            page.click(".gd-bar a.gd-wide")
        page.wait_for_selector(".gd-bar[data-view='menu'] .gd-card[data-t='size-area']", timeout=20000)      # sent over by the guide: it opens there
        page.wait_for_selector(".controls .brand-btns .gd-launch", timeout=5000)      # the Guide button under the page links
        page.click(".gd-card[data-t='size-area']"); page.wait_for_function(PHASE % json.dumps("beat"), timeout=20000)
        page.locator("#gList button").nth(2).click()
        page.wait_for_function(SAYS % json.dumps("city"), timeout=10000)
        page.locator("#cities button").first.click()
        page.wait_for_function(SAYS % json.dumps("Drag the outline"), timeout=10000)
        page.click(".gd-skip")
        if page.locator(".gd-skip").count(): page.click(".gd-skip")
        page.wait_for_function(PHASE % json.dumps("end"), timeout=10000)
        self.assertIn("size-area", page.evaluate(DONE), "progress is shared by the two pages")
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 860}); self.addCleanup(ctx.close)
        plain = ctx.new_page(); plain.goto(page.url.split("#")[0], wait_until="load"); plain.wait_for_selector(".gd-launch", timeout=20000)
        self.assertEqual(plain.locator(".gd-card").count(), 0, "the size page never opens the guide by itself")


if __name__ == "__main__":
    unittest.main()
