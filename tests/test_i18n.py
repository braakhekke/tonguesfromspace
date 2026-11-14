"""English / German (js/i18n.js, js/i18n-de.js, docs/I18N.md): the switch on every page, German on top of the English source, nothing half-filled.

Run like the other site tests (they block every host but the site's own and cdnjs, so there are no satellite pictures).
"""
import os, subprocess, sys, unittest
from test_site import SiteCase

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAD = ["{#}", "{1}", "{2}", "⟨", "⟩", "{g}"]      # placeholders and tag tokens of the dictionary must never reach the page


class TestDictionary(unittest.TestCase):
    def test_generated_file_is_current(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/i18n/tool.py"), "check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("CHECK", r.stdout, "a German value uses a tag or a number its English key does not have")


class TestSwitch(SiteCase):
    def german(self, hash="#g=aletsch&m=single", **kw):
        page = self.open(hash, **kw)
        page.evaluate("localStorage.setItem('tfs-lang', 'de')")
        page.reload(wait_until="load")
        page.wait_for_function("document.documentElement.lang === 'de' && document.body.innerText.includes('Wählen')", timeout=30000)
        return page

    def test_english_is_the_default_and_every_page_has_the_switch(self):
        page = self.open()
        self.assertEqual(page.evaluate("document.documentElement.lang"), "en")
        self.assertGreaterEqual(page.locator(".lang-sw button").count(), 2)
        self.assertNotIn("Wählen", page.inner_text("body"))
        self.assertClean()
        for path in ("home.html", "gallery.html", "size.html", "provenance.html", "404.html"):
            page.goto(self.base + "/" + path, wait_until="load"); page.wait_for_timeout(500)
            self.assertGreaterEqual(page.locator(".lang-sw button").count(), 1, path + " has the switch")

    def test_switching_to_german_and_back_keeps_the_view(self):
        page = self.open("#g=aletsch&m=single")
        page.click(".controls .lang-sw button[lang='de']")
        page.wait_for_function("document.documentElement.lang === 'de' && document.body.innerText.includes('Wählen')", timeout=30000)
        self.assertIn("g=aletsch", page.url, "the explorer's hash stays")
        text = page.inner_text("body")
        for word in ("Vergleichen", "Erstellen und teilen", "Zeitraffer"):
            self.assertIn(word, text)
        page.click(".controls .lang-sw button[lang='en']")
        page.wait_for_function("document.documentElement.lang === 'en' && document.body.innerText.includes('Choose')", timeout=30000)
        self.assertNotIn("Wählen", page.inner_text("body"))

    def test_german_story_and_stats_have_no_placeholders(self):
        page = self.german()
        page.wait_for_function("document.getElementById('story') && document.getElementById('story').innerText.length > 200")
        text = page.evaluate("document.body.innerText + ' ' + [...document.querySelectorAll('[title],[aria-label]')].map(e => (e.title || '') + (e.getAttribute('aria-label') || '')).join(' ')")
        for bad in BAD:
            self.assertNotIn(bad, text, f"{bad!r} reached the page")
        self.assertIn("Grosser Aletsch", text, "names stay")
        self.assertIn("’", page.evaluate("document.getElementById('story').innerText") + "’", "thousands are written the Swiss way")
        self.assertClean()

    def test_german_numbers_keep_the_decimal_point(self):
        page = self.german()
        self.assertIn("75.79 km²", page.inner_text("body"), "the area is copied as the source states it")

    def test_home_gallery_and_404_in_german(self):
        page = self.german()
        for path, word in (("home.html", "Gletscher sprechen nicht"), ("gallery.html", "Galerie filtern"), ("404.html", "Seite nicht gefunden")):
            page.goto(self.base + "/" + path, wait_until="load")
            page.wait_for_function("document.documentElement.lang === 'de'")
            page.wait_for_timeout(800)
            body = page.inner_text("body") + page.title()
            self.assertIn(word, body if path != "gallery.html" else page.evaluate("document.querySelector('.filters').getAttribute('aria-label') + document.body.innerText"), path)


if __name__ == "__main__":
    unittest.main()
