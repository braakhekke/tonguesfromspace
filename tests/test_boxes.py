"""data/boxes.js against what the page makes of it and what the baked terrain files hold (the picture caches key on the exact box, so a drift here would orphan them).

data/boxes.js holds per glacier the picture box (bounds), the tongue tip and the 3D strip; 'derived' (bbox, w, h) was frozen from the page's old run-time rules, so it also proves
that the move to stored boxes changed no picture. These tests keep three things equal: the file, the page (imageFootprint() and stripFor()) and the headers of data/terrain/*.bin.
"""
import json, math, os, struct, unittest
from test_site import SiteCase, ROOT

R = 6378137.0
js_round = lambda x: math.floor(x + 0.5)      # Math.round
merc = lambda lat, lon: (R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def image_box(bounds, ground=10, max_px=2500):      # imageBox() in js/03-imagery.js
    (s, w), (n, e) = bounds
    sw, ne = merc(s, w), merc(n, e); lat = (s + n) / 2; scale = 1 / math.cos(math.radians(lat))
    pw, ph = js_round((ne[0] - sw[0]) / (ground * scale)), js_round((ne[1] - sw[1]) / (ground * scale)); k = min(1, max_px / max(pw, ph))
    return [js_round(v) for v in (sw[0], sw[1], ne[0], ne[1])], js_round(pw * k), js_round(ph * k)


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f: t = f.read()
    return json.loads(t[t.index("{", t.index("window.GLACIER_BOXES") if "window.GLACIER_BOXES" in t else 0):t.rindex("}") + 1])


REGION_FILES = {"is-vatnajokull": "vatnajokull", "is-rest": "iceland", "no-mainland": "norway", "no-svalbard": "svalbard"}


def region_outlets():
    for region, f in REGION_FILES.items():
        with open(os.path.join(ROOT, "data", f + ".js"), encoding="utf-8") as fh: t = fh.read()
        for o in json.loads(t[t.index("window.REGION_ICE = ") + 20:].rstrip().rstrip(";"))["outlets"]: yield region, o


class TestBoxesFile(unittest.TestCase):
    def test_schema_and_derived_values(self):
        d = load("data/boxes.js"); self.assertEqual(d["version"], 1); g = d["glaciers"]
        self.assertEqual(sum(1 for v in g.values() if v["region"] == "ch"), 10)
        for gid, r in g.items():
            (s, w), (n, e) = r["box"]["bounds"]; self.assertTrue(s < n and w < e, gid)
            t = r["strip3d"]; self.assertTrue(0 <= t["azimuth"] < 360 and t["half"] > 0 and t["back"] >= 0 and t["up"] > 0, gid)
            self.assertTrue(s < r["tip"][0] < n and w < r["tip"][1] < e, f"{gid}: the tip lies inside the box")
            if r.get("imageFrom") == "cap": continue      # a whole ice cap is pictured from its own tiled area (data file: image), not from this box
            bbox, pw, ph = image_box(r["box"]["bounds"])
            self.assertEqual((r["derived"]["bbox"], r["derived"]["w"], r["derived"]["h"]), (bbox, pw, ph), f"{gid}: 'derived' is what the box makes")

    def test_every_outlet_of_every_region_has_a_record_equal_to_its_data_file(self):
        """the data files (made by the builders, read by the other scripts) carry the box as centre and half sides; they must be the stored bounds"""
        g = load("data/boxes.js")["glaciers"]; n = 0
        for region, o in region_outlets():
            r = g[o["id"]]; n += 1; (s, w), (nn, e) = r["box"]["bounds"]; lat = (s + nn) / 2
            self.assertEqual(r["region"], region, o["id"])
            self.assertAlmostEqual(o["lat"], lat, delta=2e-5, msg=o["id"]); self.assertAlmostEqual(o["lon"], (w + e) / 2, delta=2e-5, msg=o["id"])
            self.assertAlmostEqual(o["half"], (e - w) / 2 * 111.32 * math.cos(math.radians(lat)), delta=2e-3, msg=o["id"])
            self.assertAlmostEqual(o.get("halfH") or o["half"], (nn - s) / 2 * 111.32, delta=2e-3, msg=o["id"])
            self.assertEqual(o["tip"], r["tip"], o["id"]); self.assertEqual(o["strip3d"], r["strip3d"], o["id"])
        self.assertGreaterEqual(n, 40)
        for gid, r in g.items():      # a sub-outlet of an ice cap has its cap as parent
            if r.get("parent"): self.assertIn(r["parent"], g, gid)

    def test_terrain_files_hold_the_strip_of_the_file(self):
        d = load("data/boxes.js")["glaciers"]; manifest = load("data/terrain/manifest.json")
        for gid, g in d.items():
            if g["region"] != "ch": continue      # the Swiss files are made from the record; the ones of the other regions from the data files (equal, see above)
            with open(os.path.join(ROOT, "data", "terrain", manifest[gid]), "rb") as f: raw = f.read(8); h = json.loads(f.read(struct.unpack("<I", raw[4:8])[0]))
            px, py = merc(*g["tip"]); t = g["strip3d"]; az = math.radians(t["azimuth"])
            self.assertAlmostEqual(h["P"][0], px, delta=1e-3, msg=gid); self.assertAlmostEqual(h["P"][1], py, delta=1e-3, msg=gid)
            self.assertAlmostEqual(h["k"], 1 / math.cos(math.radians(g["tip"][0])), delta=1e-9, msg=gid)
            self.assertAlmostEqual(h["ue"], math.sin(az), delta=1e-9, msg=gid); self.assertAlmostEqual(h["un"], math.cos(az), delta=1e-9, msg=gid)
            self.assertAlmostEqual(h["up"], t["up"], delta=1e-6, msg=gid); self.assertEqual(h["back"], t["back"], gid)


class TestPageAgreesWithBoxes(SiteCase):
    def check_region(self, hash_, region):
        d = load("data/boxes.js")["glaciers"]; page = self.open(hash_)
        if page.evaluate("REGION.id") != region: self.skipTest(f"region {region} is not published on this build")      # a built site without PUBLISH_ICELAND / PUBLISH_NORWAY hides these regions
        rows = page.evaluate("""async () => { const out = [];
          for (const g of GLACIERS) { await loadOutline(g); const fp = imageFootprint(g), at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue, s = stripFor(g, at);
            out.push({id: bundleId(g), cap: !!g.cap, tip: at, bbox: fp.bbox, w: fp.w, h: fp.h, ue: s.ue, un: s.un, up: s.up, back: s.back, half: s.half}); }
          return out; }""")
        self.assertEqual(sorted(r["id"] for r in rows), sorted(k for k, v in d.items() if v["region"] == region and not v.get("parent")))
        for r in rows:
            g = d[r["id"]]; t = g["strip3d"]; az = math.radians(t["azimuth"])
            if not r["cap"]: self.assertEqual((r["bbox"], r["w"], r["h"]), (g["derived"]["bbox"], g["derived"]["w"], g["derived"]["h"]), r["id"] + ": image bbox")
            self.assertEqual(r["tip"], g["tip"], r["id"] + ": tip")
            self.assertAlmostEqual(r["ue"], math.sin(az), delta=1e-9, msg=r["id"]); self.assertAlmostEqual(r["un"], math.cos(az), delta=1e-9, msg=r["id"])
            self.assertAlmostEqual(r["up"], t["up"], delta=1e-6, msg=r["id"]); self.assertEqual((r["back"], r["half"]), (t["back"], t["half"]), r["id"] + ": back, half")
        self.assertClean()

    def test_swiss_page_boxes_and_strips_equal_the_file(self):
        self.check_region("", "ch")

    def test_icelandic_page_boxes_and_strips_equal_the_file(self):
        self.check_region("#r=is-rest", "is-rest"); self.check_region("#r=is-vatnajokull", "is-vatnajokull")

    def test_norwegian_page_boxes_and_strips_equal_the_file(self):
        self.check_region("#r=no-mainland", "no-mainland"); self.check_region("#r=no-svalbard", "no-svalbard")


if __name__ == "__main__":
    unittest.main()
