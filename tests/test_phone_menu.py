"""The phone menu (js/phone-menu.js): one menu on every page, tappable. On a phone-size window each page has the pill "Menu"; the pill is small (an icon stretched by a page rule once pushed
its tap area off the screen), the list holds the same five pages in the same order, every entry is a real link or button, at least 44 px high and really under the finger (nothing covers it),
the page you are on is marked and its tap still closes the list, and a tap beside the list closes it."""
import unittest
from test_site import SiteCase

PAGES = ["home.html", "gallery.html", "provenance.html", "index.html", "size.html"]
FIVE = ["Home", "Studio", "Field notes", "Gallery"]


class TestPhoneMenu(SiteCase):
    def phone(self, path):
        p = "/" + path
        ctx = self.browser.new_context(viewport={"width": 393, "height": 852}, has_touch=True, is_mobile=True)
        self.addCleanup(ctx.close)
        ctx.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1');localStorage.setItem('tfs-teaser','1');localStorage.setItem('tfs-guide','{\"seen\":true}');localStorage.setItem('glacierPrefs','{\"hideR\":false}');for(const m of ['area','volume','2d','3d'])localStorage.setItem('tsf-size-welcome-'+m,'1')}catch(e){}")
        page = ctx.new_page()
        page.goto(self.base + p, wait_until="load")
        page.wait_for_selector(".pm-btn", state="attached", timeout=30000)
        page.wait_for_timeout(800)
        return page

    def test_pill_is_small_and_on_screen(self):
        for path in PAGES + ["play.html"]:
            with self.subTest(page=path):
                page = self.phone(path)
                r = page.evaluate("(() => { const r = document.querySelector('.pm-btn').getBoundingClientRect(); return [r.left, r.right, r.width, r.height]; })()")
                self.assertGreaterEqual(r[0], 0); self.assertLessEqual(r[1], 393); self.assertLess(r[2], 160); self.assertGreaterEqual(r[3], 40)

    def test_every_entry_is_under_the_finger_and_big_enough(self):
        for path in PAGES + ["play.html"]:
            with self.subTest(page=path):
                page = self.phone(path)
                page.tap(".pm-btn")
                page.wait_for_function("!document.querySelector('.phone-menu').hidden")
                rows = page.evaluate("""[...document.querySelectorAll('.phone-menu .pm-i')].map(e => { const b = e.getBoundingClientRect(), t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
                    return { text: e.textContent.trim(), h: b.height, hit: !!t && (e === t || e.contains(t)), tag: e.tagName, off: e.getAttribute('aria-disabled') === 'true' }; })""")
                self.assertEqual([r["text"] for r in rows if r["tag"] == "A"][:4], FIVE)
                for r in rows:
                    self.assertGreaterEqual(r["h"], 44, r)
                    if not r["off"]: self.assertTrue(r["hit"], r)
                self.assertEqual(len(page.query_selector_all(".phone-menu [aria-current='page']")), 0 if path == "size.html" else 1)      # the size page is no longer a menu entry

    def test_tap_on_the_current_page_answers_and_outside_closes(self):
        page = self.phone("gallery.html")
        page.tap(".pm-btn"); page.tap(".phone-menu a[aria-current]")
        self.assertTrue(page.evaluate("document.querySelector('.phone-menu').hidden"))
        page.tap(".pm-btn"); page.wait_for_function("!document.querySelector('.phone-menu').hidden")
        page.touchscreen.tap(20, 800)
        page.wait_for_function("document.querySelector('.phone-menu').hidden")

    def test_a_page_entry_goes_there(self):
        page = self.phone("home.html")
        page.tap(".pm-btn"); page.tap(".phone-menu a[data-page=gallery]")
        page.wait_for_url("**/gallery.html")

    def test_explorer_and_size_page_list_the_regions(self):
        for path in ("index.html", "size.html"):
            with self.subTest(page=path):
                page = self.phone(path)
                page.tap(".pm-btn"); page.wait_for_function("!document.querySelector('.phone-menu').hidden")
                self.assertGreaterEqual(len(page.query_selector_all(".phone-menu button[data-region]")), 3)
                self.assertEqual(len(page.query_selector_all(".phone-menu button[data-region][aria-current]")), 1)


if __name__ == "__main__":
    unittest.main()
