#!/usr/bin/env python3
"""Records the teaser film that plays when a visitor first opens the site (teaser/teaser-wide.mp4, teaser/teaser-tall.mp4, posters).

The film is not animated by hand: it is the real page, driven by a script in headless Chromium (Playwright) with real Sentinel-2 pictures from the public relay,
real swisstopo terrain, real photographs. What the script adds is the film's own layer (scripts/teaser/director.js: captions, a cursor, rings, title and end card).
Each shot (a "take") is recorded as frames with their true times (CDP screencast), turned into a clip, and the clips are joined with short cross-fades and
encoded once (H.264, plus a WebM for browsers without it).

    pip install playwright imageio-ffmpeg && python3 -m playwright install chromium     # ffmpeg from the PATH is used when there is one
    python3 -m http.server 8000                     # in the repository folder: the relay lets http://localhost:8000 in
    python3 scripts/make_teaser.py                  # all takes + assemble (wide, 1920x1080)
    python3 scripts/make_teaser.py --takes open,timelapse --no-assemble
    python3 scripts/make_teaser.py --assemble-only
    python3 scripts/make_teaser.py --format tall    # 1080x1920: the phone layout of the page

Work files are in teaser/work (gitignored); the result is in teaser/. Rerun it when the look of the page changes. Nothing here is part of the site itself.
"""
import argparse, json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "teaser"))
from lib import Rec, Mouse, open_page, wait_js, ffmpeg_exe, BASE, DIRECTOR as DIRECTOR_SRC            # noqa: E402

WORK = os.path.join(ROOT, "teaser", "work")
OUT = os.path.join(ROOT, "teaser")
CHROME_ARGS = ["--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-color-profile=srgb"]
FPS = 30
XFADE = 0.45            # seconds of cross-fade between takes


class Take:
    """One shot: opens the page in a state, waits until it is loaded, records while the take's function plays the action, saves the clip."""
    def __init__(self, ctx, name, fmt):
        self.ctx, self.name, self.fmt = ctx, name, fmt
        self.page = self.rec = self.mouse = None

    def open(self, hash_):
        self.page = open_page(self.ctx, hash_, self.fmt["z"])
        self.mouse = Mouse(self.page)
        self.rec = Rec(self.page, *self.fmt["out"])
        return self.page

    def sleep(self, s):
        self.page.wait_for_timeout(s * 1000)      # Playwright's own wait: it keeps the screencast frames coming

    def go(self):
        self.rec.start()

    def done(self, tail=0.25):
        self.sleep(tail)
        self.rec.stop()
        d = f"{WORK}/{self.name}"
        n, secs = self.rec.save(d, FPS)
        self.rec.encode(d, f"{WORK}/{self.name}.mp4", FPS)
        shutil.rmtree(d, ignore_errors=True)      # the frames are big; the clip is what is kept
        self.page.close()
        print(f"  {self.name}: {n} frames, {secs:.1f} s")
        return secs

    def cursor_start(self, x, y):
        """The film's cursor appears at a place (css px) and stays there until it is moved."""
        self.mouse.place(x, y)
        self.page.evaluate("D.follow = true")
        self.page.mouse.move(x + 1, y + 1)


# ----------------------------------------------------------------------------------------------------------------------------------------------------
# The takes. Each returns when its shot is complete. T is the Take; p = T.page, m = T.mouse; D(...) is the film layer in the page (director.js).
# Sizes in CSS px of a 1280 x 720 page that is drawn 1.5 times (1920 x 1080 in the film).
# ----------------------------------------------------------------------------------------------------------------------------------------------------

def mods(p):
    """The page is ES modules: M.map (05-map.js), M.st (04-state.js), M.ctl (08-controls.js), M.v3 (11-view3d.js), M.an (10-animation.js) are the page's own module objects (live bindings), W is js/wire.js."""
    wait_js(p, "typeof L !== 'undefined' && document.querySelector('.leaflet-tile-loaded')", 150000)
    p.evaluate("""async () => { if (window.M) return; window.W = (await import('/js/wire.js')).wire;
        window.M = {map: await import('/js/05-map.js'), st: await import('/js/04-state.js'), ctl: await import('/js/08-controls.js'), v3: await import('/js/11-view3d.js'), an: await import('/js/10-animation.js')}; }""")


def ready_map(p, timeout=90000):
    """Every picture of the timelapse is there."""
    mods(p)
    wait_js(p, "M.map.tlLayers.length > 1 && M.map.tlLayers.every(t => t.layer._ready)", timeout)


def ready_3d(p, timeout=120000):
    mods(p)
    wait_js(p, "M.v3.v3dCtx && M.v3.v3d", timeout)


def warm_play(p):
    """Plays the timelapse once, unseen, so that every picture of the years is loaded (the first run waits for them), then goes back to the first frame."""
    p.evaluate("M.map.play()")
    wait_js(p, "M.st.state.playing && !document.getElementById('playBtn').querySelector('.spin-s')", 120000)
    p.evaluate("M.map.stopPlay(); M.map.showFrame(0)")
    p.wait_for_timeout(600)


def set_speed(p, v):
    p.evaluate("v => { const s = document.getElementById('speedSel'); s.value = v; s.dispatchEvent(new Event('input', {bubbles: true})); }", v)


def loop_on(p):
    p.evaluate("() => { document.getElementById('loopToggle').checked = true; }")      # the timelapse repeats for as long as the take runs


def stage_box(p):
    return p.locator("#stage").bounding_box()


def to_modes(p):
    """The left panel scrolled to View and Mode, so that the clicks on them are on screen."""
    p.evaluate("() => document.getElementById('viewGroup').scrollIntoView({block: 'start'})")


def take_map(T):
    """Map: Aletsch, 2016 to 2026. The cursor presses play (the years run in a loop), opens the Layers menu, then clicks Slider and drags through time."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(p)
    set_speed(p, 3); loop_on(p)
    p.evaluate("() => { D.cine(true); D.frameLower(2600, 0.5, 0.5); }")
    warm_play(p)
    to_modes(p)
    p.evaluate("() => D.tipAt(0.5, 0.62)")
    wait_js(p, "M.st.state.available[2016] && M.st.state.available[2026]", 60000)
    m = T.mouse
    m.place(520, 470)
    T.go()
    p.evaluate("() => D.cap('', 'See it', 'Welcome to a new way to talk glaciers.', 'One clear Sentinel-2 picture a year. Landsat goes back to 1984.', {cw: 290})")
    m.click(".tl-play", 450)
    T.sleep(2.6)
    m.click("#lbToggle", 700)      # the Layers menu opens and shows what the map can draw
    T.sleep(2.0)
    m.click("#lbToggle", 500)
    T.sleep(0.6)
    m.click("#modeCompare", 800)
    p.evaluate("() => { M.ctl.setOrient('v'); D.tipAt(0.5, 0.62); M.st.state.split = 0.5; M.map.clip(); D.cap('', 'Compare it', 'Drag through time', 'Any two years, side by side.'); }")
    T.sleep(0.6)
    sb = stage_box(p)
    x0, w = sb["x"], sb["width"]
    h = p.locator("#handle").bounding_box()
    y = h["y"] + h["height"] / 2
    m.glide(h["x"] + h["width"] / 2, y, 700)
    m.page.mouse.down(); T.sleep(0.1)
    m.glide(x0 + w * 0.9, y, 1200)      # the tongue is in the right half of the picture: the drag stays over it
    T.sleep(0.1)
    m.glide(x0 + w * 0.42, y, 1800)
    T.sleep(0.1)
    m.glide(x0 + w * 0.62, y, 700)
    m.page.mouse.up()
    T.sleep(0.4)
    p.evaluate("D.capOut()")
    T.done(0.3)


def take_3d(T):
    """3D: the camera flies over the Aletsch tongue while the timelapse keeps looping, then One year and an old photograph with the line between then and now."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026&v=3d")
    ready_3d(p)
    set_speed(p, 3); loop_on(p)
    p.evaluate("() => D.cine(true)")
    warm_play(p)
    to_modes(p)
    cam_(p, -0.5, 0.28, 4800)
    p.wait_for_timeout(700)
    m = T.mouse
    m.place(520, 470)
    T.go()
    p.evaluate("() => D.cap('', 'Fly over it', 'Fly over the ice', 'Satellite pictures on the real terrain. The ice sinks with the years.')")
    m.click(".tl-play", 450)
    p.evaluate("() => D.tween(7600, u => W.v3d.setCam({az: -0.5 + 1.1 * u, el: 0.28 + 0.26 * Math.sin(u * Math.PI * 0.85), dist: 4800 - 1500 * u}), false)")
    cam_(p, 0.35, 0.32, 4200)
    m.click("#modeSingle", 800)
    p.evaluate("() => D.cap('', 'Step inside it', 'Step into old photographs', 'Photographs placed on today\u2019s terrain.', {top: 70, cr: 56})")
    wait_js(p, "M.v3.v3dCtx && M.v3.v3dCtx.photos", 90000)
    cam_(p, 0.35, 0.32, 4200)
    T.sleep(0.5)
    p.evaluate("() => { const c = document.getElementById('l3Photos'); c.checked = true; c.dispatchEvent(new Event('change', {bubbles: true})); }")      # the layer "Then and now": the dock opens with the thumbnails
    wait_js(p, "document.querySelector(\"#v3dPhotos .ph[data-i='7']\") && document.querySelector(\"#v3dPhotos .ph[data-i='7']\").offsetWidth > 0", 30000)
    T.sleep(0.6)
    m.click(".ph[data-i='7']", 600)
    wait_js(p, "!!M.v3.photoOn", 30000)
    wait_js(p, "!document.getElementById('v3dDiv').hidden", 30000)
    T.sleep(0.5)
    sb = stage_box(p)
    h = p.locator("#v3dDiv").bounding_box()
    y = h["y"] + h["height"] * 0.5
    m.glide(h["x"] + h["width"] / 2, y, 700)
    m.page.mouse.down(); T.sleep(0.1)
    m.glide(sb["x"] + sb["width"] * 0.85, y, 900)
    T.sleep(0.1)
    m.glide(sb["x"] + sb["width"] * 0.2, y, 1100)
    T.sleep(0.1)
    m.glide(sb["x"] + sb["width"] * 0.5, y, 600)
    m.page.mouse.up()
    T.sleep(0.5)
    p.evaluate("D.capOut()")
    T.done(0.3)


def take_stats(T):
    """The right panel: the cursor opens it, Stats (area, length, thickness and volume), Switzerland (how much ice is left), Discover (what to look for)."""
    p = T.open("#g=aletsch&m=single")
    wait_js(p, "typeof L !== 'undefined' && document.querySelector('.leaflet-tile-loaded')", 150000); wire_(p); p.wait_for_timeout(7000)
    p.evaluate("() => { D.cine(true); }")
    p.wait_for_timeout(1500)
    m = T.mouse
    m.place(700, 420)
    T.go()
    p.evaluate("() => D.cap('', 'Backed by facts', 'Know the ice', 'Figures from many sources, each one named.', {left: 312, cb: 96})")
    m.click("#toggleRight", 800)
    T.sleep(0.5)
    m.click("#story .tabs button[data-tab='figures']", 700)
    T.sleep(0.2)
    for card in ("length", "volume"):
        m.click(f"#story details[data-card='{card}'] summary", 650)
        p.evaluate("c => { const d = document.querySelector(`#story details[data-card='${c}']`); d.open = true; }", card)
        T.sleep(1.1)
    m.click("#story .tabs button[data-tab='swiss']", 750)
    T.sleep(0.2)
    m.click("#story details[data-card='sw-left'] summary", 650)
    p.evaluate("() => { document.querySelector(\"#story details[data-card='sw-left']\").open = true; }")
    T.sleep(1.5)
    m.click("#story .tabs button[data-tab='look']", 750)
    T.sleep(0.2)
    m.click("#story details.dcard summary", 650)
    p.evaluate("() => { document.querySelector('#story details.dcard').open = true; }")
    T.sleep(1.5)
    p.evaluate("D.capOut()")
    T.done(0.3)


def take_export(T):
    """The download pane: a 9:16 animation with glacier facts, previewed."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(p)
    p.evaluate("() => { D.cine(true); D.frameLower(3600, 0.5, 0.42); document.getElementById('videoBtn').scrollIntoView({block: 'center'}); }")
    p.wait_for_timeout(1000)
    m = T.mouse
    m.place(160, 300)
    T.go()
    p.evaluate("() => D.cap('', 'Say it your way', 'Make it yours', 'A picture or an animation: 16:9, 9:16 or 4:5.', {left: 312})")
    m.click("#videoBtn", 700)
    T.sleep(0.6)
    m.click("#vfReel", 700)
    T.sleep(0.3)
    m.click("#vFacts", 700)
    T.sleep(0.4)
    m.click("#vfPlay", 600)
    T.sleep(1.0)
    p.evaluate("D.capOut()")
    T.done(0.3)


def make_exports(ctx):
    """The real files of the page, made by its own export (driven through its panes, the page is ES modules now): a 9:16 animation with facts and a picture of the compare view, saved for the product shot."""
    page = open_page(ctx, "#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(page)
    page.evaluate("() => { D.frameLower(3600, 0.5, 0.42); }")
    page.click("#videoBtn"); page.wait_for_timeout(800)
    page.click("#vkVideo"); page.click("#vfReel"); page.wait_for_timeout(1500)
    page.evaluate("() => D.tipInFrame(0.5, 0.42)")      # the tongue tip in the lower part of the frame, the ice running in from above
    page.wait_for_timeout(800)
    if not page.evaluate("document.getElementById('vFacts').checked"):
        page.click("#vFacts")
    page.wait_for_timeout(600)
    with page.expect_download(timeout=300000) as dl:
        page.click("#vsGo")
    dl.value.save_as(f"{WORK}/export-916.mp4")
    page.close()
    page = open_page(ctx, "#g=aletsch&m=compare&a=2016&b=2026")
    mods(page); wait_js(page, "M.st.state.checked && M.st.state.available[2016] && M.st.state.available[2026]", 90000)
    page.evaluate("() => { M.ctl.setOrient('v'); M.st.state.split = 0.5; M.map.clip(); D.frameLower(3600, 0.5, 0.42); }")
    page.click("#videoBtn"); page.wait_for_timeout(800)
    page.click("#vkImage"); page.click("#vfFeed"); page.wait_for_timeout(1500)
    page.evaluate("() => D.tipInFrame(0.5, 0.42)")
    page.evaluate("() => { const f = document.getElementById('videoFrame').getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect(); M.st.state.split = (f.left + f.width * 0.5 - m.left) / m.width; M.map.clip(); }")      # the line in the middle of the frame, not of the map
    page.wait_for_timeout(800)
    with page.expect_download(timeout=120000) as dl:
        page.click("#vsGo")
    dl.value.save_as(f"{WORK}/export-image.jpg")
    page.close()


def take_product(T):
    """What the export made: the animation on a phone, the picture beside it."""
    p = T.ctx.new_page()
    T.page = p
    p.add_init_script(DIRECTOR_SRC)
    p.goto(f"{BASE}/scripts/tools/teaser-product.html")
    wait_js(p, "typeof D !== 'undefined' && window.ready", 30000)
    p.evaluate("window.ready()")
    T.rec = Rec(p, *T.fmt["out"])
    T.go()
    p.evaluate("""() => { window.go(); D.cap('', 'Share it', 'Yours to post', 'MP4 for Instagram and TikTok, JPEG for everything else.', {left: 72, cb: 160, cw: 300}); }""")
    T.sleep(4.2)
    p.evaluate("D.capOut()")
    T.done(0.3)


def take_end(T):
    """The closing text over the playing timelapse, darkened, slowly pushing in. The card says what the site is for, without naming a country."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026")
    wait_js(p, "typeof L !== 'undefined' && document.querySelector('.leaflet-tile-loaded')", 150000); wire_(p); p.wait_for_timeout(5000)
    p.evaluate("""async () => { const m = await import('/js/05-map.js'); m.map.invalidateSize({pan: false}); m.focusTongue(false); }""")
    set_speed(p, 3); loop_on(p)
    p.evaluate("() => { D.cine(true); }")
    p.click(".tl-play"); wait_js(p, "!document.getElementById('playBtn').querySelector('.spin-s')", 240000)      # the years run once, unseen, so that every picture is loaded
    T.go()
    p.evaluate("""() => { D.push('#map', 1.12, 5); D.card('Glacier visuals, done your way.<br>For everyone who loves glaciers, from scientist to alpinist.', 'tonguesfromspace.org', ''); }""")
    T.sleep(4.6)
    T.done(0.2)


# ----------------------------------------------------------------------------------------------------------------------------------------------------
# New takes (2026-11): the page is ES modules now, so the old globals (state, play(), v3d ...) are gone; these takes reach what they need through js/wire.js
# (W) and the modules (mods() below). The first takes (map, 3d, export) were ported to the same access on 2026-11-03 and record again.
# ----------------------------------------------------------------------------------------------------------------------------------------------------

def wire_(p):
    p.evaluate("async () => { if (!window.W) window.W = (await import('/js/wire.js')).wire; }")


def ready_3d_(p):
    wait_js(p, "document.querySelector('#v3dCanvas') && document.querySelector('#v3dCanvas').offsetWidth > 0", 150000)
    wire_(p)


def cam_(p, az, el, dist):
    p.evaluate("([a, e, d]) => W.v3d.setCam({az: a, el: e, dist: d})", [az, el, dist])


def take_cross(T):
    """3D: the thickness cross-section: the tool, a line across the tongue, the profile with the bed under the ice."""
    p = T.open("#g=aletsch&m=single&v=3d")
    ready_3d_(p); p.wait_for_timeout(5000)
    p.evaluate("() => D.cine(true)")
    cam_(p, -0.35, 0.62, 5200); p.wait_for_timeout(2500)
    m = T.mouse
    m.place(900, 640)
    T.go()
    p.evaluate("() => D.cap('', 'Look inside', 'Cut through the ice', 'A cross-section: the ice on top, the rock under it.', {top: 70, cr: 24, cw: 270})")
    T.sleep(0.8)
    m.click("#v3mSect", 800)
    T.sleep(0.5)
    m.glide(640, 330, 800); p.mouse.click(640, 330); T.sleep(0.5)
    m.glide(930, 400, 900); p.mouse.click(930, 400)
    T.sleep(3.2)
    p.evaluate("D.capOut()")
    T.done(0.3)


def take_notes(T):
    """The field-notes pill in the 3D view, then the field-notes page: what is measured, what is modelled, how it was checked."""
    p = T.open("#g=aletsch&m=single&v=3d")
    ready_3d_(p); p.wait_for_timeout(5000)
    p.evaluate("() => D.cine(true)")
    cam_(p, -0.35, 0.4, 4600); p.wait_for_timeout(1500)
    m = T.mouse
    m.place(700, 300)
    T.go()
    p.evaluate("() => D.cap('', 'Know how it is made', 'Scientific field notes', 'What is measured, what is modelled and how it was checked.', {cb: 40, cr: 24, cw: 290})")
    T.sleep(0.6)
    m.click(".notes-btn", 900)
    T.sleep(0.4)
    p.goto(f"{BASE}/provenance.html?id=B36-26&", wait_until="load")      # the button in the right panel is a link to the field notes of the glacier
    p.wait_for_timeout(900)
    p.evaluate("() => window.scrollTo({top: 0})")
    for y in (700, 1500, 2400):      # a slow scroll past the figures
        p.evaluate("y => window.scrollTo({top: y, behavior: 'smooth'})", y); p.wait_for_timeout(1500)
    T.done(0.2)


CHIPS = [      # words and small visuals that are thrown onto the page: (label, a tiny picture as html, x, y of the chip in css px of the 1280 x 720 page)
    ("Ice speed", "<i class='sw' style='background:linear-gradient(90deg,#3b5bdb,#22b8cf,#fab005,#f76707)'></i>", 330, 120),
    ("Radar thickness", "<i class='dots'><b style='background:#4dabf7'></b><b style='background:#1c7ed6'></b><b style='background:#0b3d91'></b></i>", 700, 560),
    ("Hiking and alpine trails", "<i class='dash'><b style='background:#fcc419'></b><b style='background:#fa5252'></b><b style='background:#4263eb'></b></i>", 800, 130),
    ("Street View", "<i class='sv'>360</i>", 330, 330),
    ("Photographs where they were taken", "<i class='cam'></i>", 640, 628),
    ("Outline 1850", "<i class='sw' style='background:repeating-linear-gradient(90deg,#f59f00 0 7px,transparent 7px 11px);height:3px'></i>", 340, 520),
    ("Modelled thickness", "<i class='sw' style='background:linear-gradient(90deg,#d0ebff,#74c0fc,#1c7ed6,#0b2a66)'></i>", 1000, 330),
    ("Names and places", "<i class='tt'>Aa</i>", 960, 560),
]
CHIP_CSS = """#dr .chip{position:absolute;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #DDE3E6;box-shadow:0 2px 12px rgba(0,0,0,.25);padding:9px 14px 9px 11px;font-size:14px;font-weight:600;color:#0A1B33;white-space:nowrap;opacity:0;transform:translate(var(--dx,0),var(--dy,0)) scale(.92);transition:opacity .35s,transform .55s cubic-bezier(.2,.9,.25,1)}
#dr .chip.in{opacity:1;transform:none}
#dr .chip i{display:inline-block;font-style:normal}
#dr .chip .sw{width:46px;height:9px}
#dr .chip .dots{display:flex;gap:4px} #dr .chip .dots b{width:10px;height:10px;border-radius:50%}
#dr .chip .dash{display:flex;flex-direction:column;gap:3px} #dr .chip .dash b{width:40px;height:3px}
#dr .chip .sv{width:26px;height:26px;border-radius:50%;background:#228be6;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}
#dr .chip .cam{width:24px;height:17px;border-radius:3px;background:#1971c2;position:relative} #dr .chip .cam:after{content:'';position:absolute;left:8px;top:4px;width:8px;height:8px;border-radius:50%;background:#fff}
#dr .chip .tt{font-size:15px;font-weight:700;color:#0A1B33}"""


def take_data(T):
    """The map at the tongue: layers of spatial data are switched on one after another, and a word with a small picture of each is thrown onto the page."""
    p = T.open("#g=aletsch&m=single")
    wait_js(p, "typeof L !== 'undefined' && document.querySelector('.leaflet-tile-loaded')", 150000); wire_(p); p.wait_for_timeout(6000)
    p.evaluate("""async () => { const m = await import('/js/05-map.js'); m.map.invalidateSize({pan: false}); m.focusTongue(false); m.map.setZoom(m.map.getZoom(), {animate: false}); }""")
    p.add_style_tag(content=CHIP_CSS); p.evaluate("() => D.cine(true)")
    p.evaluate("() => { for (const e of document.querySelectorAll('body *')) if (/reached the tongue/.test(e.textContent) && e.textContent.length < 120) e.style.setProperty('display', 'none', 'important'); }"); p.wait_for_timeout(1500)
    p.evaluate("() => { const b = document.getElementById('lbToggle'); if (b.getAttribute('aria-expanded') !== 'true') b.click(); }")
    m = T.mouse
    m.place(1000, 420)
    T.go()
    p.evaluate("() => D.cap('', 'And much more', 'Much more spatial data', 'Ice speed, radar, trails, photographs, Street View and more, each in its place.', {left: 312, cb: 30, cw: 300})")
    T.sleep(1.0)
    toggles = {"Outline 1850": "oldToggle", "Radar thickness": "radarToggle", "Ice speed": "speedToggle", "Hiking and alpine trails": "trailsToggle", "Street View": "svToggle", "Modelled thickness": "thickToggle", "Names and places": "namesToggle"}
    for label, html, x, y in CHIPS:
        cid = toggles.get(label)
        if cid:
            p.evaluate("id => { const c = document.getElementById(id); if (c && !c.checked) c.click(); }", cid)
        dx, dy = ("-60px", "0") if x < 640 else ("60px", "0")
        p.evaluate("""([label, html, x, y, dx, dy]) => { const c = document.createElement('div'); c.className = 'chip'; c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.setProperty('--dx', dx); c.style.setProperty('--dy', dy);
            c.innerHTML = html + '<span>' + label + '</span>'; D.root.appendChild(c); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in'))); }""", [label, html, x, y, dx, dy])
        T.sleep(0.95)
    T.sleep(1.6)
    p.evaluate("D.capOut()")
    T.done(0.3)


def size_page(T, hash_, wait=9000):
    """size.html in a state, the film layer added, a recorder and a mouse ready (the page is not index.html, so open_page is not used)."""
    p = T.ctx.new_page(); T.page = p
    p.add_init_script(DIRECTOR_SRC); p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
    p.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1')}catch(e){}")
    p.goto(f"{BASE}/size.html{hash_}", wait_until="load"); p.wait_for_timeout(wait)
    p.add_style_tag(content="body{user-select:none!important;-webkit-user-select:none!important}")
    p.evaluate("D.follow = true; D.cine(true); D.scale(%s)" % T.fmt["z"])
    return p


def take_size(T):
    """size.html, Area (2D): the outline of Aletsch is dragged onto Z\u00fcrich; the page tells how many times it fits."""
    p = size_page(T, "#g=B36-26&c=zurich")
    p.evaluate("() => { const b = document.querySelector('#modeSwitch button[data-mode=\"2d\"]'); if (b) b.click(); }"); p.wait_for_timeout(3000)
    p.mouse.move(620, 335); p.mouse.down(); p.mouse.move(880, 260, steps=20); p.mouse.up(); p.wait_for_timeout(1200)      # off the city, unseen
    T.rec = Rec(p, *T.fmt["out"]); T.mouse = Mouse(p); T.mouse.place(880, 260)
    T.go()
    p.evaluate("() => D.cap('', 'Size it up', 'Glaciers on your city', 'Drag a glacier onto Z\u00fcrich, Bern or a city of your choice.', {left: 312, cb: 40, cw: 260})")
    T.sleep(1.0)
    p.mouse.move(880, 260, steps=6); p.mouse.down(); T.sleep(0.15)
    for i in range(1, 61):
        u = i / 60; e = u * u * (3 - 2 * u); p.mouse.move(880 + (620 - 880) * e, 260 + (335 - 260) * e); p.wait_for_timeout(45)
    p.mouse.up(); T.sleep(2.4)
    p.evaluate("D.capOut()")
    T.done(0.3)


def take_size3d(T):
    """size.html, Volume (3D): all the ice of the glacier as one ice cube on the real terrain of the city; it drops, is thrown, and the shape is switched to a ball."""
    p = size_page(T, "#g=B36-26&c=zurich&mode=3d", 6000)
    wait_js(p, "document.getElementById('s3Busy').hidden && document.querySelector('#s3d')", 150000); p.wait_for_timeout(4000)
    T.rec = Rec(p, *T.fmt["out"]); T.mouse = Mouse(p); m = T.mouse; m.place(640, 420)
    T.go()
    p.evaluate("() => D.cap('', 'Feel the volume', 'All the ice as one cube', 'Drop it on your city, drag it, throw it.', {left: 312, cb: 96, cw: 270})")
    m.click("#s3Again", 700)      # drop again: the cube falls onto the city
    T.sleep(2.6)
    m.glide(630, 330, 600)      # the cube is picked up, dragged across the city and let go
    p.mouse.down(); T.sleep(0.2)
    m.glide(540, 300, 500); m.glide(760, 360, 450)
    p.mouse.up(); T.sleep(2.2)
    m.click("#modeSwitch button[data-mode='3d']", 700)      # Volume pressed again: cube to ball
    T.sleep(2.8)
    p.evaluate("D.capOut()")
    T.done(0.3)


TAKES = {"map": take_map, "3d": take_3d, "stats": take_stats, "export": take_export, "product": take_product, "end": take_end,
         "cross": take_cross, "notes": take_notes, "data": take_data, "size": take_size, "size3d": take_size3d}
ORDER = ["map", "3d", "cross", "notes", "data", "size", "size3d", "stats", "export", "product", "end"]      # the older takes keep their clips; --takes cross,notes,data,size records only the new ones


# ----------------------------------------------------------------------------------------------------------------------------------------------------
TRIM = {"cross": 7.0, "notes": 7.5, "size": 6.0, "size3d": 8.0, "stats": 9.0}      # seconds kept of these takes in the film (the new takes and the stats take are cut short to keep the film near a minute and a half)


def assemble(names, fmt, out):
    """Joins the clips of the takes with cross-fades and encodes the film."""
    exe = ffmpeg_exe(); fmt_name = names[0].split("-")[0]
    clips = [f"{WORK}/{n}.mp4" for n in names if os.path.exists(f"{WORK}/{n}.mp4")]
    if not clips:
        raise SystemExit("no clips")
    durs = [float(subprocess.run([exe, "-i", c], capture_output=True, text=True).stderr.split("Duration: ")[1].split(",")[0].split(":")[2]) for c in clips]
    durs = [min(d, TRIM.get(os.path.basename(c)[len(fmt_name) + 1:-4], d)) for c, d in zip(clips, durs)]      # a clip can be cut short (TRIM), never extended
    cmd = [exe, "-y", "-loglevel", "error"]
    for c, d in zip(clips, durs):
        cmd += ["-t", f"{d:.3f}", "-i", c]
    if len(clips) == 1:
        graph, last = "", "0:v"
    else:
        parts, last, acc = [], "0:v", durs[0]
        for i in range(1, len(clips)):
            parts.append(f"[{last}][{i}:v]xfade=transition=fade:duration={XFADE}:offset={acc - XFADE:.3f}[v{i}]")
            last, acc = f"v{i}", acc + durs[i] - XFADE
        graph = ";".join(parts)
    base = [*cmd] + (["-filter_complex", graph, "-map", f"[{last}]"] if graph else [])
    subprocess.run(base + ["-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", str(FPS), f"{out}.mp4"], check=True)
    subprocess.run(base + ["-c:v", "libvpx-vp9", "-crf", "37", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", "-r", str(FPS), f"{out}.webm"], check=True)
    subprocess.run([exe, "-y", "-loglevel", "error", "-i", f"{out}.mp4", "-vf", "select=eq(n\\,0)", "-frames:v", "1", "-q:v", "3", f"{out}-poster.jpg"], check=True)
    print("film:", out, f"{sum(durs) - XFADE * (len(clips) - 1):.1f} s")


FORMATS = {"wide": {"size": (1280, 720), "out": (1920, 1080), "dsf": 1.5, "z": 2 / 3, "mobile": False, "name": "teaser-wide"},
           "tall": {"size": (360, 640), "out": (1080, 1920), "dsf": 3, "z": 1 / 3, "mobile": True, "name": "teaser-tall"}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--format", default="wide", choices=list(FORMATS))
    ap.add_argument("--takes", help="comma list; default all")
    ap.add_argument("--exports", action="store_true", help="make the export files again (the product shot uses them)")
    ap.add_argument("--no-assemble", action="store_true")
    ap.add_argument("--out-name", help="film file name without extension (default: the format's own, which replaces the published teaser)")
    ap.add_argument("--assemble-only", action="store_true")
    a = ap.parse_args()
    fmt = FORMATS[a.format]
    names = a.takes.split(",") if a.takes else ORDER
    os.makedirs(WORK, exist_ok=True)
    if not a.assemble_only:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            ctx = pw.chromium.launch_persistent_context(f"{WORK}/profile-{a.format}", args=CHROME_ARGS, viewport={"width": fmt["size"][0], "height": fmt["size"][1]},
                                                        device_scale_factor=fmt["dsf"], accept_downloads=True, is_mobile=fmt["mobile"], has_touch=fmt["mobile"])
            if a.exports or ("product" in names and not os.path.exists(f"{WORK}/export-916.mp4")):
                print("exports"); make_exports(ctx)
            for n in names:
                print("take", n)
                TAKES[n](Take(ctx, f"{a.format}-{n}", fmt))
            ctx.close()
    if not a.no_assemble:
        assemble([f"{a.format}-{n}" for n in ORDER if (not a.takes or n in names) or a.assemble_only], fmt, f"{OUT}/{a.out_name or fmt['name']}")


if __name__ == "__main__":
    main()
