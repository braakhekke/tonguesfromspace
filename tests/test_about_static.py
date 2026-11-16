"""The About block of size.html (data/about-static.html) is generated from aboutChaptersCh() in js/07-render.js.
scripts/build_about_static.py stores a hash of that function in data/about-static.sha1; if the function changed and the script was not run again, this fails."""
import hashlib, os, re, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestAboutStatic(unittest.TestCase):
    def test_static_copy_matches_source(self):
        src = open(os.path.join(ROOT, "js", "07-render.js"), encoding="utf-8").read()
        m = re.search(r"export function aboutChaptersCh\(\)\{.*?\n\}\n", src, re.S)
        self.assertIsNotNone(m, "aboutChaptersCh() not found in js/07-render.js")
        want = hashlib.sha1(m.group(0).encode("utf-8")).hexdigest()
        have = open(os.path.join(ROOT, "data", "about-static.sha1")).read().strip()
        self.assertEqual(have, want, "aboutChaptersCh() changed: run python3 scripts/build_about_static.py")


if __name__ == "__main__":
    unittest.main()
