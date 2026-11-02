"""The 'Oldest' aerial image must cover the whole glacier (scripts/build_oldest_aerial.py, owner 2026-11-03)."""
import importlib.util, json, os, unittest
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('boa', os.path.join(ROOT, 'scripts', 'build_oldest_aerial.py')); boa = importlib.util.module_from_spec(spec); spec.loader.exec_module(boa)

class TestOldestAerial(unittest.TestCase):
    def test_an_edition_covers_a_set_of_points_only_when_every_point_has_it(self):
        pts = {(0, 0): [(1947, 1947), (1977, 1977)], (1, 0): [(1964, 1947), (1977, 1977)], (0, 1): [(1950, 1950)]}
        ed, flown = boa.cover(pts)
        self.assertEqual(ed, 1964)      # the corner (1, 0) shows imagery only from the 1964 edition on: 1947 would leave it blank
        self.assertEqual(flown, [1947, 1950])
    def test_a_point_without_any_survey_means_no_edition(self):
        self.assertEqual(boa.cover({(0, 0): [(1950, 1950)], (1, 1): []})[0], None)
        self.assertEqual(boa.cover({(0, 0): [(1950, 1950)], (1, 1): None})[0], None)
    def test_point_in_polygon_with_a_hole(self):
        outer = [(0, 0), (4, 0), (4, 4), (0, 4)]; hole = [(1, 1), (3, 1), (3, 3), (1, 3)]
        self.assertTrue(boa.inside((0.5, 0.5), [outer, hole])); self.assertFalse(boa.inside((2, 2), [outer, hole])); self.assertFalse(boa.inside((5, 5), [outer, hole]))
    def test_the_data_file_holds_the_ten_swiss_glaciers_with_an_edition_and_a_coverage(self):
        d = json.load(open(os.path.join(ROOT, 'data', 'oldest-aerial.json')))
        for k in ('aletsch', 'gorner', 'fiescher', 'unteraar', 'corbassiere', 'zmutt', 'rhone', 'sgi-B56-03', 'sgi-B53-04', 'trift'):
            self.assertIn(k, d); self.assertTrue(d[k]['ed']); self.assertIn(d[k]['coverage'], ('box', 'glacier')); self.assertLessEqual(d[k]['edGlacier'], d[k]['edBox'] or 9999)
if __name__ == '__main__': unittest.main()
