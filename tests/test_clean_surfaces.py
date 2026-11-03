"""The clean-build yearly surfaces (data/yearly/<id>.npz with the `clean` flag, made by experiments/clean-yearly/s09_site_files.py): shapes agree with the field notes, heights are sane, and a lake is a flat water surface (docs/CLEAN_BUILD_RUNBOOK.md, section 6)."""
import glob, json, os, unittest

try:
    import numpy as np
except ImportError:      # the page tests do not need numpy
    np = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@unittest.skipIf(np is None, "numpy not installed")
class TestCleanSurfaces(unittest.TestCase):
    def files(self):
        out = []
        for p in sorted(glob.glob(os.path.join(ROOT, "data", "yearly", "*.npz"))):
            z = np.load(p)
            if "clean" in z.files:
                out.append((p, z))
        return out

    def test_there_is_at_least_one_clean_glacier(self):
        self.assertTrue(self.files())

    def test_years_and_notes_agree(self):
        for p, z in self.files():
            j = json.load(open(p[:-4] + ".json", encoding="utf-8"))
            self.assertEqual([int(y) for y in z["years"]], j["years"], p)
            self.assertEqual(z["surf"].shape[0], len(j["years"]), p)
            self.assertEqual(sorted(j["clean"]["perYear"]), sorted(str(y) for y in j["years"]), p)

    def test_heights_are_sane(self):
        for p, z in self.files():
            h = float(z["base"]) + z["surf"].astype(float) / 10
            self.assertGreater(h.min(), 500, p)
            self.assertLess(h.max(), 4700, p)

    def test_a_lake_is_flat(self):      # class 5 = lake: one water level per year, to the decimetre the file stores
        for p, z in self.files():
            h = float(z["base"]) + z["surf"].astype(float) / 10
            for k in range(h.shape[0]):
                m = z["cls"][k] == 5
                if m.sum() < 20:
                    continue
                self.assertLessEqual(float(h[k][m].max() - h[k][m].min()), 0.21, f"{os.path.basename(p)} year index {k}: lake nodes are not at one level")


if __name__ == "__main__":
    unittest.main()
