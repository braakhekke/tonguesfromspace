"""css/tokens.css is the one place for the colours and the typeface. This fails when a stylesheet defines tokens of its own again."""
import os, re, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def root_block(path):
    css = open(os.path.join(ROOT, "css", path), encoding="utf-8").read()
    m = re.search(r":root\s*\{(.*?)\}", css, re.S)
    return dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(1))) if m else {}


class TestTokens(unittest.TestCase):
    def test_the_token_file_is_complete(self):
        self.assertGreaterEqual(len(root_block("tokens.css")), 15)

    def test_the_page_stylesheets_define_no_tokens(self):
        for f in ("style.css", "pages.css", "home.css"):
            own = root_block(f)
            self.assertFalse([n for n in own if n in root_block("tokens.css")], f"css/{f} defines tokens that belong in css/tokens.css")

    def test_every_page_links_the_token_file(self):
        for page in ("index.html", "home.html", "gallery.html", "size.html"):
            self.assertIn('href="css/tokens.css"', open(os.path.join(ROOT, page), encoding="utf-8").read(), page)


if __name__ == "__main__":
    unittest.main()
