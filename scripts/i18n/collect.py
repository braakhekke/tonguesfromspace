#!/usr/bin/env python3
"""Collects the English texts of the site that have no German entry yet (docs/I18N.md).

Opens the pages in German (or French, --lang fr) with the debug switch on (localStorage tfs-i18n-debug) and records `tfsI18n.miss()` after the
page has loaded and after pressing the controls that show other texts. Needs scripts/serve.py running on :8000 and Playwright.

    python3 scripts/i18n/collect.py OUT.json [--lang de|fr] [--phone] [--only explorer|size|home|prov|gallery]
    python3 scripts/i18n/tool.py add OUT.json
"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TFS_I18N_BASE", "http://localhost:8000/")      # another port when :8000 is taken
GLACIERS = ["aletsch", "gorner", "fiescher", "unteraar", "corbassiere", "zmutt", "rhone", "sgi-B56-03", "sgi-B53-04", "trift"]
CLICKS = ["#view3dBtn", "#viewMap", "#modeCompare", "#modeTimelapse", "#modeSingle", "#styleI", "#styleFalse1", "#styleFalse2", "#styleFalse3", "#styleNatural", "#landsatI", "#tuneSwitch",
          "#layersBtn", "#moreBtn", "#measureDist", "#measureArea", "#measureSect", "#pinBtn", "#measureClear", "#embedBtn", "#videoBtn", "#shareBtn", "#metaBtn", "#v3mLayers", "#v3mSect",
          "#v3mPin", "#v3dCutYears", "#v3mSect2d", "#svFull", "#toggleRight", "#toggleLeft", "#vfLayers", "#vfWide", "#vfReel", "#vfFeed", "#vfCustom", "#vkVideo", "#vkImage", "#playBtn", "#vsClose", ".gd-launch", ".gd-card", ".gd-chip", ".gd-next", ".gd-skip", ".gd-x", ".teaser-btn", ".tongla", "#tonglaBtn"]

def collect(pg):
    return pg.evaluate("tfsI18n.miss()")

def main():
    out = sys.argv[1]
    phone = "--phone" in sys.argv
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "de"
    miss = {}
    def grab(pg, where):
        for k in collect(pg): miss.setdefault(k, where)
    with sync_playwright() as p:
        b = p.chromium.launch()
        c = b.new_context(viewport={"width": 390, "height": 800} if phone else {"width": 1300, "height": 900}, has_touch=phone)
        c.add_init_script("try{localStorage.setItem('tfs-guide',JSON.stringify({seen:true}));localStorage.setItem('tfs-teaser','1');localStorage.setItem('tfs-i18n-debug','1')}catch(e){}")
        def page(url):
            pg = c.new_page(); pg.goto(BASE + lang + "/" + url); pg.wait_for_timeout(4500); return pg
        def press(pg, sels, where):
            for s in sels:
                try:
                    el = pg.locator(s).first
                    if el.count() and el.is_visible():
                        try: el.click(timeout=800, force=True)
                        except Exception: pg.evaluate("s => { const e = document.querySelector(s); if (e) e.click(); }", s)      # covered by a card: click it in the page
                        pg.wait_for_timeout(500); grab(pg, where + s)
                except Exception: pass
        if only in (None, "home"):
            pg = page("home.html"); grab(pg, "home"); pg.close()
        if only in (None, "gallery"):
            pg = page("gallery.html"); grab(pg, "gallery"); pg.close()
        if only in (None, "prov"):
            pg = page("provenance.html"); grab(pg, "prov"); pg.close()
            for pid in ["B36-26", "B56-07", "B40-07", "A54g-11", "B83-03", "B57-05", "B43-03", "B56-03", "B53-04", "A54e-24"]:
                pg = page("provenance.html?id=" + pid); grab(pg, "prov-id:" + pid)
                try:
                    for el in pg.locator("details > summary, .yr, [data-year]").all()[:40]: el.click(timeout=200, force=True)
                except Exception: pass
                pg.wait_for_timeout(500); grab(pg, "prov-id:" + pid + ":open"); pg.close()
        if only in (None, "size"):
            pg = page("size.html"); grab(pg, "size")
            press(pg, ["[data-mode=\"3d\"]", "[data-shape]", "#totalSw", ".lay-btn", ".dock-dl", "#embedBtn", "#videoBtn", "#lbToggle", "#s3OnGl", "[data-mode=\"2d\"]", "#glacierList li:nth-child(2) button", "#glacierList li:nth-child(3) button", "#playBtn", "#s3GuessBtn", "#s3Guess button", "#s3Play", ".s3yr"], "size")
            pg.close()
        if only in (None, "explorer"):
            for g in GLACIERS:
                pg = page(f"index.html#g={g}&m=single"); grab(pg, "ex:" + g)
                if g in ("aletsch", "rhone"):
                    press(pg, CLICKS, "ex:" + g + ":")
                    for sel in ["details > summary", ".story summary", ".about summary"]:
                        try:
                            for el in pg.locator(sel).all()[:30]:
                                el.click(timeout=300, force=True)
                        except Exception: pass
                    pg.wait_for_timeout(800); grab(pg, "ex:" + g + ":details")
                pg.close()
        b.close()
    json.dump(miss, open(out, "w"), ensure_ascii=False, indent=0)
    print(len(miss), "strings")

main()
