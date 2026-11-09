"""The files of unpublished regions stay out of the site, also on a build without data/regions/ (the CI checkout: the records are local only).

The group prefix of Iceland is "is-", but the front-page list names the site region "is": the ids of Iceland were once missing from the list, and its ice-speed files
(about 14 MB) were deployed although Iceland is switched off."""
import importlib.util, json, os, shutil, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_build_site():
    spec = importlib.util.spec_from_file_location("build_site_under_test", os.path.join(ROOT, "scripts", "build_site.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


class TestHiddenPrune(unittest.TestCase):
    def setUp(self):
        self.m = load_build_site()
        self.tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.tmp, "data"))        # no data/regions here, like the CI checkout
        shutil.copy(os.path.join(ROOT, "data", "home-glaciers.js"), os.path.join(self.tmp, "data", "home-glaciers.js"))
        self.m.ROOT = self.tmp
        self.m.GROUP_ON.update({"switzerland": True, "iceland": False, "norway": False})

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ids_of_every_unpublished_group_without_the_records(self):
        ids = self.m.hidden_glacier_ids()
        for gid in ("breidamerkurjokull", "hofsjokull", "jostedalsbreen", "etonbreen"):
            self.assertIn(gid, ids, gid + " belongs to an unpublished region")
        self.assertNotIn("aletsch", ids)
        self.assertFalse(any(i.startswith(("B", "A")) and i[1:3].isdigit() for i in ids), "no Swiss id in the list")

    def test_prune_removes_their_files_and_keeps_the_swiss_ones(self):
        out = os.path.join(self.tmp, "out")
        folder = os.path.join(out, "data", "itslive"); os.makedirs(folder)
        for name in ("breidamerkurjokull.0123456789.json", "hofsjokull~Þjórsárjökull.0123456789.json", "B36-26.0123456789.json"):
            open(os.path.join(folder, name), "w").write("{}")
        self.m.prune_hidden_glaciers(out)
        self.assertEqual(sorted(os.listdir(folder)), ["B36-26.0123456789.json"])

    def test_nothing_is_pruned_when_the_group_is_published(self):
        self.m.GROUP_ON.update({"iceland": True, "norway": True})
        self.assertEqual(self.m.hidden_glacier_ids(), set())


if __name__ == "__main__":
    unittest.main()
