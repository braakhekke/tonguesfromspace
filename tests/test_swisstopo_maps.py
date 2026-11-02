"""data/swisstopo-maps.json (scripts/build_oldest_map.py): every Swiss glacier has an oldest map year (journey through time starts in 1844) and the year of the current map."""
import json, os, unittest
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class SwisstopoMaps(unittest.TestCase):
    def test_years(self):
        d = json.load(open(os.path.join(ROOT, 'data', 'swisstopo-maps.json')))
        oa = json.load(open(os.path.join(ROOT, 'data', 'oldest-aerial.json')))
        for site in oa:
            m = d.get(site); self.assertIsNotNone(m, site)
            self.assertTrue(1844 <= m['oldest'] <= 1900, (site, m['oldest']))
            self.assertGreaterEqual(m['current'], 2020, site)

if __name__ == '__main__': unittest.main()
