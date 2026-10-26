"""css/tokens.css is the one place for the colours and the typeface. css/style.css is copied to the sister sites by the style sync and still carries the same
values so that it works on its own: this fails when the two disagree, or when a page stylesheet defines tokens of its own again."""
import os, re, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def root_block(path):
    css = open(os.path.join(ROOT, "css", path), encoding="utf-8").read()
    m = re.search(r":root\s*\{(.*?)\}", css, re.S)
    return dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(1))) if m else {}


class TestTokens(unittest.TestCase):
    def test_style_css_agrees_with_the_token_file(self):
        tokens, style = root_block("tokens.css"), root_block("style.css")
        self.assertGreaterEqual(len(tokens), 15)
        for name, value in tokens.items():
            self.assertEqual(style.get(name), value, f"{name}: css/style.css and css/tokens.css differ")

    def test_the_page_stylesheets_define_no_tokens(self):
        for f in ("pages.css", "home.css"):
            own = root_block(f)
            self.assertFalse([n for n in own if n in root_block("tokens.css")], f"css/{f} defines tokens that belong in css/tokens.css")

    def test_every_page_links_the_token_file(self):
        for page in ("index.html", "home.html", "gallery.html", "size.html"):
            self.assertIn('href="css/tokens.css"', open(os.path.join(ROOT, page), encoding="utf-8").read(), page)


if __name__ == "__main__":
    unittest.main()
