"""Titles, descriptions, Open Graph and social pictures, the sitemap, robots.txt and the 404 page of the BUILT site.

Link previews and search engines read the head of a page, and do not see the #g= part of an address: that is why every Swiss glacier has a page of its own
(/switzerland/<slug>/, scripts/build_site.py) with its own title and picture (scripts/build_og_images.py). Builds the site into a temporary folder."""
import io, json, os, re, subprocess, sys, tempfile, unittest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://tonguesfromspace.org"


def head(path):
    t = open(path, encoding="utf-8").read()
    h = t[:t.index("</head>")]
    one = lambda p: (re.search(p, h, re.S) or [None, None])[1]
    return {"title": one(r"<title>(.*?)</title>"), "description": one(r'<meta name="description" content="([^"]*)"'), "canonical": one(r'<link rel="canonical" href="([^"]*)"'),
            "robots": one(r'<meta name="robots" content="([^"]*)"'), **{k: one(r'<meta property="%s" content="([^"]*)"' % k) for k in ("og:title", "og:description", "og:image", "og:url", "og:type")},
            "twitter:card": one(r'<meta name="twitter:card" content="([^"]*)"'), "twitter:image": one(r'<meta name="twitter:image" content="([^"]*)"')}


class TestMeta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp()
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build_site.py"), cls.out], cwd=ROOT, capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stdout + r.stderr)
        t = open(os.path.join(cls.out, "sitemap.xml"), encoding="utf-8").read()
        cls.urls = re.findall(r"<loc>([^<]+)</loc>", t)
        og = json.load(open(os.path.join(ROOT, "images", "og", "index.json"), encoding="utf-8"))
        cls.slugs = sorted(og)

    def file_of(self, url):
        """the file that answers an address of the sitemap (Cloudflare serves /size from size.html)"""
        p = url[len(SITE):].strip("/")
        if not p:
            return os.path.join(self.out, "index.html")
        if os.path.isfile(os.path.join(self.out, p, "index.html")):
            return os.path.join(self.out, p, "index.html")
        return os.path.join(self.out, p + ".html")

    def test_every_page_of_the_sitemap_exists_is_indexable_and_is_its_own_canonical(self):
        self.assertEqual(len(self.urls), len(set(self.urls)), "an address twice in the sitemap")
        for u in self.urls:
            f = self.file_of(u)
            self.assertTrue(os.path.isfile(f), u + " is in the sitemap but not in the site")
            h = head(f)
            self.assertNotIn("noindex", h["robots"] or "", u)
            self.assertEqual(h["canonical"], u, u + ": the canonical address is not the address of the sitemap")

    def test_every_page_has_a_title_a_description_and_a_link_preview(self):
        for u in self.urls:
            h = head(self.file_of(u))
            self.assertTrue(10 <= len(h["title"] or "") <= 70, (u, h["title"]))
            self.assertTrue(50 <= len(h["description"] or "") <= 200, (u, len(h["description"] or ""), "the description of a page"))
            for k in ("og:title", "og:description", "og:image", "og:url", "og:type", "twitter:card", "twitter:image"):
                self.assertTrue(h[k], f"{u}: {k} is missing")
            self.assertEqual(h["og:url"], h["canonical"], u)
            self.assertTrue(h["og:image"].startswith(SITE + "/images/"), u)
            img = os.path.join(self.out, h["og:image"][len(SITE) + 1:].split("?")[0])
            self.assertTrue(os.path.isfile(img), f"{u}: the link-preview picture {h['og:image']} is not in the site")

    def test_every_glacier_has_a_page_with_its_own_title_and_picture(self):
        self.assertEqual(len(self.slugs), 10, "the ten Swiss glaciers")
        titles, images = set(), set()
        for s in self.slugs:
            u = f"{SITE}/switzerland/{s}/"
            self.assertIn(u, self.urls, "the page of a glacier is in the sitemap")
            h = head(os.path.join(self.out, "switzerland", s, "index.html"))
            self.assertIn("from space", h["title"])
            self.assertTrue(len(h["description"]) <= 165, (s, len(h["description"])))
            self.assertIn(f"/images/og/{s}.jpg", h["og:image"])
            titles.add(h["title"]); images.add(h["og:image"])
            im = Image.open(os.path.join(self.out, "images", "og", s + ".jpg"))
            self.assertEqual(im.size, (1200, 630), s)
            self.assertLess(os.path.getsize(os.path.join(self.out, "images", "og", s + ".jpg")), 400 * 1024, s + ": a link-preview picture should stay small")
        self.assertEqual((len(titles), len(images)), (10, 10), "every glacier has its own title and its own picture")

    def test_robots_names_the_sitemap_and_keeps_crawlers_off_the_worker_endpoints(self):
        t = open(os.path.join(self.out, "robots.txt"), encoding="utf-8").read()
        self.assertIn(f"Sitemap: {SITE}/sitemap.xml", t)
        for path in ("/cdse/", "/api/", "/gallery/"):
            self.assertIn("Disallow: " + path, t)
        self.assertNotRegex(t, r"(?m)^Disallow:\s*/\s*$", "the whole site must not be disallowed")
        self.assertNotIn("Disallow: /gallery\n", t, "the gallery page itself is open")

    def test_the_404_page_is_not_indexed_and_leads_back(self):
        p = os.path.join(self.out, "404.html")
        h = head(p)
        self.assertIn("noindex", h["robots"])
        t = open(p, encoding="utf-8").read()
        self.assertIn('href="/"', t)
        self.assertIn('href="/switzerland/"', t)
        with open(os.path.join(self.out, "sitemap.xml"), encoding="utf-8") as f:
            self.assertNotIn("404.html", f.read())


if __name__ == "__main__":
    unittest.main()
