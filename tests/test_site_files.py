"""Every data file that size.html asks for by name is in the built site.

size.html fetches some files by their plain name (`fetch('data/tall-buildings.json')`, `data/lake-depth/...`): the build must copy them, because a missing file is
only a 404 that the page swallows, and the feature (a switch, the lake floors) quietly does nothing in production. Found by hand twice (2026-11-09)."""
import os, re, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestFilesTheSizePageFetches(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp()
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build_site.py"), cls.out], cwd=ROOT, capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stdout + r.stderr)
        cls.page = open(os.path.join(ROOT, "size.html"), encoding="utf-8").read()

    def test_plain_names_fetched_by_the_page_exist_in_the_site(self):
        names = sorted(set(re.findall(r"fetch\(\s*['\"](data/[A-Za-z0-9_./-]+)['\"]", self.page)))
        self.assertTrue(names, "the page fetches no data file by name any more: update this test")
        for name in names:
            if not os.path.exists(os.path.join(ROOT, name)):
                continue      # a file that only exists on the owner's computer (nothing to ship)
            self.assertTrue(os.path.exists(os.path.join(self.out, name)), name + " is fetched by size.html but is not in the built site")

    def test_lake_floor_files_exist_as_the_page_builds_the_names(self):
        d = os.path.join(ROOT, "data", "lake-depth")
        if os.path.isdir(d):
            self.assertEqual(sorted(os.listdir(os.path.join(self.out, "data", "lake-depth"))), sorted(os.listdir(d)))


if __name__ == "__main__":
    unittest.main()
