"""The terrain quality gate (scripts/terrain_quality.py): a smooth year passes, a year stitched from strips that disagree is a seam, and the verdict belongs to the file it was made on."""
import os, struct, sys, unittest, zlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
import terrain_quality as tq


def bundle(nA, nB, years, year_fn):
    """a payload of the base surface (a gentle slope) and one surface per year; year_fn(y, j, i) -> height of that year at that cell"""
    def packed(fn):
        flat = []
        for j in range(nA + 1):
            row = [int(round(fn(j, i) * 10)) for i in range(nB + 1)]
            flat += [row[0]] + [row[i] - row[i - 1] for i in range(1, nB + 1)]
        return struct.pack('<%dh' % len(flat), *flat)
    base = lambda j, i: 100 + 0.2 * j + 0.1 * i
    head = {'nA': nA, 'nB': nB, 'half': 500, 'up': 1000, 'back': 100, 'yearly': {'years': years, 'kind': ['measured'] * len(years)}}
    return head, zlib.compress(packed(base) + b''.join(packed(lambda j, i, y=y: year_fn(y, j, i)) for y in years))


class TestSeams(unittest.TestCase):
    years = list(range(2011, 2019))

    def test_smooth_years_have_no_seams(self):
        head, payload = bundle(60, 60, self.years, lambda y, j, i: 100 + 0.2 * j + 0.1 * i + (2018 - y) * 2)
        share, year = tq.seams(head, payload)
        self.assertEqual(share, 0.0)

    def test_a_patch_that_one_year_has_and_the_newest_does_not_is_a_seam(self):
        patch = lambda y, j, i: 100 + 0.2 * j + 0.1 * i + (120 if y in (2013, 2015) and 20 <= j < 40 and 20 <= i < 40 else 0)      # a 20 x 20 patch 120 m too high: matching error
        head, payload = bundle(60, 60, self.years, patch)
        share, year = tq.seams(head, payload)
        self.assertGreater(share, tq.SEAM_WARN)
        self.assertIn(year, ('2013', '2015'))

    def test_files_with_one_surface_have_no_seams(self):
        head, payload = bundle(30, 30, [2020], lambda y, j, i: 100 + 0.2 * j + 0.1 * i)
        self.assertEqual(tq.seams(head, payload), (0.0, None))


if __name__ == '__main__':
    unittest.main()
