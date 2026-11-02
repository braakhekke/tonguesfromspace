"""GLAMOS length-change rows that overlap in time are counted once (scripts/build_outlines.py non_overlapping, owner 2026-11-03)."""
import importlib.util, json, os, unittest
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('bo', os.path.join(ROOT, 'scripts', 'build_outlines.py')); bo = importlib.util.module_from_spec(spec); spec.loader.exec_module(bo)
R = lambda a, b, dl: {'start': a, 'end': b, 'dl': dl, 'h': ''}

class TestLengthOverlap(unittest.TestCase):
    def test_a_row_inside_a_longer_row_is_left_out(self):
        rows, info = bo.non_overlapping([R('1959-08-26', '1970-08-18', -55.1), R('1960-08-20', '1961-09-27', -14.0)])
        self.assertEqual([r['dl'] for r in rows], [-55.1]); self.assertEqual(info['dropped'], 1)
    def test_a_partly_overlapping_shorter_row_keeps_only_its_own_days(self):
        rows, info = bo.non_overlapping([R('2016-09-29', '2017-10-05', -16.7), R('2017-09-21', '2020-09-04', -106.5)])
        self.assertEqual(rows[1]['dl'], -106.5); self.assertEqual(rows[0]['end'], '2017-09-21'); self.assertAlmostEqual(rows[0]['dl'], -16.7 * 357 / 371, places=1); self.assertEqual(info['trimmed'], 1)
    def test_rows_that_follow_each_other_are_not_changed(self):
        rows, info = bo.non_overlapping([R('2000-01-01', '2001-01-01', -5.0), R('2001-01-01', '2002-01-01', -6.0)])
        self.assertIsNone(info); self.assertEqual([r['dl'] for r in rows], [-5.0, -6.0])
    def test_the_totals_of_the_data_file(self):
        t = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read(); d = json.loads(t[t.index('{'):t.rindex('}') + 1]); g = {x['name']: x['length'] for x in d['glaciers']}
        self.assertEqual(g['Gornergletscher']['total_m'], -2973); self.assertEqual(g['Triftgletscher (BE)']['total_m'], -3956); self.assertNotIn('overlap', g['Grosser Aletschgletscher'])
        for L in g.values():      # no two rows of a series overlap any more by more than a day
            ser = sorted(L['series'], key=lambda r: (r[0], r[1]))
            for a, b in zip(ser, ser[1:]): self.assertLessEqual(a[1], b[0] + 1)
if __name__ == '__main__': unittest.main()
