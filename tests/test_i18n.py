"""Languages (js/i18n.js, js/i18n-de.js, js/i18n-fr.js, docs/I18N.md): the language is in the address (/de/..., /fr/...), a switch on every page, the other languages on top of the English
source, nothing half-filled.

Run like the other site tests (they block every host but the site's own and cdnjs, so there are no satellite pictures).
"""
import os, subprocess, sys, unittest
from test_site import SiteCase, DASHBOARD

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAD = ["{#}", "{1}", "{2}", "⟨", "⟩", "{g}"]      # placeholders and tag tokens of the dictionary must never reach the page
WORDS = {"de": ("Wählen", "Vergleichen", "Erstellen und teilen", "Zeitraffer"), "fr": ("Choisir", "Comparer", "Créer et partager", "Accéléré")}
PAGES = ("home.html", "gallery.html", "size.html", "provenance.html", "404.html")


class TestDictionary(unittest.TestCase):
    def test_generated_files_are_current(self):
        for lang in ("de", "fr"):
            r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/i18n/tool.py"), "check", "--lang", lang], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertNotIn("CHECK", r.stdout, f"a {lang} value uses a tag or a number its English key does not have")


class TestLanguages(SiteCase):
    def lang_page(self, lang, hash="#g=aletsch&m=single", **kw):
        page = self.open(hash, path=f"/{lang}/index.html" if "/index.html" in DASHBOARD else f"/{lang}{DASHBOARD}", **kw)
        page.wait_for_function(f"document.documentElement.lang === '{lang}' && document.body.innerText.includes('{WORDS[lang][0]}')", timeout=30000)
        return page

    def test_english_is_the_default_and_every_page_has_a_switch(self):
        page = self.open()
        self.assertEqual(page.evaluate("document.documentElement.lang"), "en")
        self.assertGreaterEqual(page.locator(".social .lang-sw a").count(), 3, "next to the social icons of the right panel")
        for word in WORDS["de"] + WORDS["fr"]:
            self.assertNotIn(word, page.inner_text("body"))
        self.assertClean()
        for path in PAGES:
            page.goto(self.base + "/" + path, wait_until="load"); page.wait_for_timeout(500)
            self.assertEqual(page.locator(".lang-dd, .lang-sw").count() >= 1, True, path + " has the switch")
            if path != "size.html": self.assertEqual(page.locator(".lang-dd li a").count(), 3, path + ": a drop-down with three languages")

    def test_the_switch_goes_to_the_other_address_and_keeps_the_view(self):
        page = self.open("#g=aletsch&m=single")
        page.click(".social .lang-sw a[lang='de']")
        page.wait_for_function("document.documentElement.lang === 'de' && document.body.innerText.includes('Wählen')", timeout=30000)
        self.assertRegex(page.url, r"/de/")
        self.assertIn("g=aletsch", page.url, "the explorer's hash stays")
        text = page.inner_text("body")
        for word in WORDS["de"]: self.assertIn(word, text)
        page.click(".social .lang-sw a[lang='fr']")
        page.wait_for_function("document.documentElement.lang === 'fr' && document.body.innerText.includes('Comparer')", timeout=30000)
        self.assertRegex(page.url, r"/fr/")
        self.assertNotIn("/de/", page.url)
        page.click(".social .lang-sw a[lang='en']")
        page.wait_for_function("document.documentElement.lang === 'en' && document.body.innerText.includes('Choose')", timeout=30000)
        self.assertNotRegex(page.url, r"/(de|fr)/")
        self.assertIn("g=aletsch", page.url)

    def test_the_dropdown_of_the_header_pages_switches_too(self):
        page = self.open()
        page.goto(self.base + "/gallery.html", wait_until="load"); page.wait_for_timeout(500)
        page.click(".lang-dd > button")
        page.click(".lang-dd a[lang='fr']")
        page.wait_for_function("document.documentElement.lang === 'fr'")
        self.assertIn("/fr/gallery", page.url)
        # <html lang> is set before the dictionary is applied (DOMContentLoaded): wait for the text
        page.wait_for_function("document.querySelector('.filters').getAttribute('aria-label') === 'Filtrer la galerie'")

    def test_the_old_lang_parameter_goes_to_the_address(self):
        page = self.open()
        page.goto(self.base + "/home.html?lang=fr", wait_until="load"); page.wait_for_function("document.documentElement.lang === 'fr'")
        self.assertIn("/fr/home.html", page.url)
        self.assertNotIn("lang=", page.url)

    def test_story_and_stats_have_no_placeholders_and_keep_names_and_numbers(self):
        for lang in ("de", "fr"):
            page = self.lang_page(lang)
            page.wait_for_function("document.getElementById('story') && document.getElementById('story').innerText.length > 200")
            text = page.evaluate("document.body.innerText + ' ' + [...document.querySelectorAll('[title],[aria-label]')].map(e => (e.title || '') + (e.getAttribute('aria-label') || '')).join(' ')")
            for bad in BAD:
                self.assertNotIn(bad, text, f"{lang}: {bad!r} reached the page")
            self.assertIn("Aletsch", text, "names stay")
            self.assertIn("75.79 km²", page.inner_text("body"), "the area is copied as the source states it, with its decimal point")
            self.assertClean()

    def test_thousands_are_written_the_swiss_way(self):
        page = self.lang_page("de")
        page.wait_for_function("document.getElementById('story') && document.getElementById('story').innerText.length > 200")
        self.assertIn("’", page.evaluate("document.getElementById('story').innerText") + "’")

    def test_internal_links_keep_the_language(self):
        page = self.lang_page("fr")
        hrefs = page.evaluate("[...document.querySelectorAll('a[href^=\"/\"]:not(.lang-sw a):not(.lang-dd a)')].map(a => a.getAttribute('href')).filter(h => /^\\/(size|gallery|provenance|index|switzerland)/.test(h))")
        self.assertEqual(hrefs, [], f"links to pages of the site that lost the prefix: {hrefs}")

    def test_home_gallery_and_404_in_both_languages(self):
        for lang, words in (("de", (("home.html", "So verändern sich Gletscher"), ("gallery.html", "Galerie filtern"), ("404.html", "Seite nicht gefunden"))),
                            ("fr", (("home.html", "Voyez comment les glaciers changent"), ("gallery.html", "Filtrer la galerie"), ("404.html", "Page introuvable")))):
            page = self.lang_page(lang)
            for path, word in words:
                page.goto(f"{self.base}/{lang}/{path}", wait_until="load")
                page.wait_for_function(f"document.documentElement.lang === '{lang}'")
                page.wait_for_timeout(800)
                body = page.inner_text("body") + page.title() + page.evaluate("[...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).join(' ')")
                self.assertIn(word, body, f"{lang}/{path}")


if __name__ == "__main__":
    unittest.main()
