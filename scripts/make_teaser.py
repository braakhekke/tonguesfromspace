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

def ready_map(p, timeout=90000):
    """Every picture of the timelapse is there."""
    wait_js(p, "typeof tlLayers !== 'undefined' && tlLayers.length > 1 && tlLayers.every(t => t.layer._ready)", timeout)


def ready_3d(p, timeout=120000):
    wait_js(p, "typeof v3dCtx !== 'undefined' && v3dCtx && typeof v3d !== 'undefined' && v3d", timeout)


def warm_play(p):
    """Plays the timelapse once, unseen, so that every picture of the years is loaded (the first run waits for them), then goes back to the first frame."""
    p.evaluate("play()")
    wait_js(p, "state.playing && !document.getElementById('playBtn').querySelector('.spin-s')", 120000)
    p.evaluate("stopPlay(); showFrame(0)")
    p.wait_for_timeout(600)


def cine_full(p):
    p.evaluate("() => { D.cine(true); setFull(true); }")
    p.wait_for_timeout(1400)


def take_open(T):
    """The overview: all ten glaciers from orbit, a title, and a flight down to the Great Aletsch tongue."""
    p = T.open("#m=single")
    p.wait_for_timeout(9000)
    cine_full(p)
    p.evaluate("""() => { D.notags(); map.invalidateSize(); map.setView([46.33, 7.9], 8.2, {animate: false}); }""")
    p.wait_for_timeout(1500)
    T.go()
    p.evaluate("""() => { D.shade(true); D.cap('Tongues from Space', 'Switzerland\u2019s glaciers, seen from space', 'The ten largest, in Sentinel-2 pictures since 2016.', {cw: 1150}); map.setView([46.33, 7.85], 9.5, {animate: true, duration: 3.4, easeLinearity: 0.3}); }""")
    T.sleep(3.2)
    p.evaluate("D.capOut()")
    T.sleep(0.3)
    p.evaluate("""() => { document.getElementById('boxToggle').checked = false; document.getElementById('boxToggle').dispatchEvent(new Event('change')); const g = GLACIERS.find(x => x.id === 'aletsch'); map.flyTo(L.latLng(g.inv.terminus.tip), 12.8, {duration: 2.8, easeLinearity: 0.25}); D.shade(false); }""")
    T.sleep(2.9)
    T.done(0.2)


def take_timelapse(T):
    """Aletsch, 2016 to 2026, in the map, with the 1850 outline: the dashed line is where the ice reached."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026&ol=1")
    ready_map(p)
    p.evaluate("() => { document.getElementById('speedSel').value = 2; updateSpeedIcon(); }")
    cine_full(p)
    p.evaluate("() => { D.frameLower(3600, 0.46, 0.4); showFrame(0); }")
    p.wait_for_timeout(1200)
    T.go()
    p.evaluate("() => { D.shade(true); D.cap('Timelapse', 'Every summer since 2016', 'One clear Sentinel-2 picture a year. Dashed: the ice in 1850.', {cw: 1100, cx: 72}); D.push('#map', 1.1, 6.2); }")
    T.sleep(1.0)
    p.evaluate("() => { play(); }")
    T.sleep(6.4)
    p.evaluate("D.capOut()")
    T.done(0.5)


def take_compare(T):
    """Rhone: the slider between 2016 and 2026, dragged by a cursor."""
    p = T.open("#g=rhone&m=compare&a=2016&b=2026")
    wait_js(p, "state.checked && state.available[2016] && state.available[2026]", 90000)
    p.evaluate("() => { setOrient('v'); }")
    cine_full(p)
    p.evaluate("() => { D.frameTongue(0.8, 0.5, 0.6); state.split = 0.5; clip(); }")
    p.wait_for_timeout(2500)
    m = T.mouse
    p.evaluate("D.follow = true")
    m.place(1100, 660)
    T.go()
    p.evaluate("() => { D.shade(true); D.cap('Compare', 'Drag through time', 'Rhone glacier, 2016 and 2026.', {cw: 1000}); }")
    T.sleep(0.8)
    h = p.locator("#handle").bounding_box()
    m.glide(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2, 900)
    m.page.mouse.down(); T.sleep(0.15)
    y = h["y"] + h["height"] / 2
    m.glide(1280 * 0.25, y, 900)
    T.sleep(0.15)
    m.glide(1280 * 0.75, y, 2400)
    T.sleep(0.15)
    m.glide(1280 * 0.50, y, 900)
    m.page.mouse.up()
    T.sleep(0.5)
    m.glide(1100, 640, 500)
    p.evaluate("D.capOut()")
    T.done(0.5)


def take_3d(T):
    """Gorner in 3D: the camera flies, the years run, the ice surface sinks."""
    p = T.open("#g=gorner&m=timelapse&from=2016&to=2026&v=3d")
    ready_3d(p)
    p.evaluate("() => { document.getElementById('speedSel').value = 3; updateSpeedIcon(); }")
    cine_full(p)
    p.wait_for_timeout(600)
    warm_play(p)
    p.evaluate("() => v3d.setCam({az: -0.7, el: 0.26, dist: 3500})")
    p.wait_for_timeout(700)
    T.go()
    p.evaluate("() => { D.shade(true); D.cap('3D', 'Fly over the ice', 'Satellite pictures on the real terrain. The ice follows the years.', {cw: 1150}); }")
    T.sleep(1.2)
    p.evaluate("() => { play(); return D.tween(6400, u => v3d.setCam({az: -0.7 + 1.1 * u, el: 0.26 + 0.3 * Math.sin(u * Math.PI * 0.85), dist: 3500 - 1300 * u})); }")
    p.evaluate("D.capOut()")
    T.done(0.5)


def take_photo(T):
    """Aletsch: a click on an old photograph, the camera flies to where it was taken, the line shows 1954 against today."""
    p = T.open("#g=aletsch&m=single&v=3d")
    wait_js(p, "typeof v3dCtx !== 'undefined' && v3dCtx && v3dCtx.photos", 150000)
    p.evaluate("() => { D.cine(true); document.body.classList.add('cine-photos'); setFull(true); v3d.setCam({az: 0.35, el: 0.32, dist: 4200}); }")
    p.wait_for_timeout(1500)
    m = T.mouse
    p.evaluate("D.follow = true")
    m.place(1000, 300)
    T.go()
    p.evaluate("() => { D.shade(true); D.cap('Then and now', 'Step into old photographs', 'Historic photos, placed on today\u2019s terrain.', {right: true, top: true, ct: 60, cw: 640, cx: 50}); }")
    T.sleep(1.0)
    m.click(".ph-toggle", 900)
    T.sleep(0.7)
    m.click(".ph[data-i='0']", 700)
    wait_js(p, "!!photoOn", 30000)
    wait_js(p, "!document.getElementById('v3dDiv').hidden", 30000)
    T.sleep(0.6)
    h = p.locator("#v3dDiv").bounding_box()
    y = h["y"] + h["height"] * 0.5
    m.glide(h["x"] + h["width"] / 2, y, 900)
    m.page.mouse.down(); T.sleep(0.1)
    m.glide(1280 * 0.85, y, 1100)
    T.sleep(0.15)
    m.glide(1280 * 0.2, y, 1300)
    T.sleep(0.15)
    m.glide(1280 * 0.5, y, 700)
    m.page.mouse.up()
    T.sleep(0.8)
    p.evaluate("D.capOut()")
    T.done(0.5)


def take_export(T):
    """The export pane: a 9:16 animation, previewed."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(p)
    p.evaluate("() => { setPanel('right', true, false); showFrame(3); document.getElementById('videoBtn').scrollIntoView({block: 'center'}); }")
    p.wait_for_timeout(1500)
    m = T.mouse
    p.evaluate("D.follow = true")
    m.place(700, 420)
    T.go()
    p.evaluate("() => { D.shade(true); D.cap('Create and share', 'Make it yours', 'A picture or an animation: 16:9, 9:16 or 4:5.', {right: true, cb: 70, cw: 700, cx: 50}); }")
    T.sleep(0.8)
    m.click("#videoBtn", 1000)
    T.sleep(1.0)
    m.click("#vfReel", 700)
    T.sleep(0.6)
    m.click("#vFacts", 700)
    T.sleep(0.4)
    m.click("#vfPlay", 700)
    T.sleep(2.6)
    p.evaluate("D.capOut()")
    T.done(0.4)


def make_exports(ctx):
    """The real files of the page: an animation (9:16, with facts) and a picture (4:5), made by its own export, saved for the product shot."""
    page = open_page(ctx, "#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(page)
    page.evaluate("openVideo('video'); setFmt('reel')")
    page.wait_for_timeout(1500)
    page.evaluate("$('vFacts').click()")
    page.wait_for_timeout(600)
    with page.expect_download(timeout=300000) as dl:
        page.evaluate("$('vsGo').click()")
    dl.value.save_as(f"{WORK}/export-916.mp4")
    page.close()
    page = open_page(ctx, "#g=rhone&m=compare&a=2016&b=2026")
    wait_js(page, "state.checked && state.available[2016] && state.available[2026]", 90000)
    page.evaluate("() => { setOrient('v'); D.frameTongue(0.8, 0.5, 0.6); openVideo('image'); setFmt('feed'); }")
    page.wait_for_timeout(1500)
    with page.expect_download(timeout=120000) as dl:
        page.evaluate("$('vsGo').click()")
    dl.value.save_as(f"{WORK}/export-image.jpg")
    page.close()


def take_product(T):
    """The files the export made: the animation on a phone, the picture beside it."""
    p = T.ctx.new_page()
    T.page = p
    p.add_init_script(DIRECTOR_SRC)
    p.goto(f"{BASE}/scripts/teaser/product.html")
    wait_js(p, "typeof D !== 'undefined' && window.ready", 30000)
    p.evaluate("D.scale(%s)" % T.fmt["z"])
    p.evaluate("window.ready()")
    T.rec = Rec(p, *T.fmt["out"])
    T.go()
    p.evaluate("""() => { window.go(); D.cap('Export', 'Your picture. Your animation.', 'Made in the page: MP4 for Instagram and TikTok, JPEG for everything else.', {cw: 900, cx: 72, cb: 120}); }""")
    T.sleep(5.6)
    p.evaluate("D.capOut()")
    T.done(0.4)


def take_stats(T):
    """The right panel: the figures of Switzerland, then what to look for at the Rhone."""
    p = T.open("#g=rhone&m=compare&a=2016&b=2026&t=stats")
    wait_js(p, "state.checked && state.available[2016] && state.available[2026]", 90000)
    p.evaluate("() => { D.cine(true); setPanel('left', true, false); setOrient('v'); D.frameTongue(0.5, 0.5, 0.55); state.split = 0.5; clip(); }")
    p.wait_for_timeout(2500)
    m = T.mouse
    p.evaluate("D.follow = true")
    m.place(600, 500)
    T.go()
    p.evaluate("() => { D.shade(true); D.cap('Discover', 'Know the ice', 'Figures from GLAMOS, stories, hikes and what to look for.', {cx: 56, cb: 60, cw: 760}); }")
    T.sleep(0.8)
    m.click("#story .tabs button[data-tab='swiss']", 900)
    T.sleep(0.3)
    m.click("#story details[data-card='sw-left'] summary", 900)
    p.evaluate("() => { const d = document.querySelector(\"#story details[data-card='sw-left']\"); d.open = true; }")
    T.sleep(2.3)
    m.click("#story .tabs button[data-tab='look']", 700)
    T.sleep(0.2)
    m.click("#story details.dcard summary", 700)
    p.evaluate("() => { const d = document.querySelector('#story details.dcard'); d.open = true; }")
    T.sleep(1.5)
    p.evaluate("D.capOut()")
    T.done(0.4)


def take_end(T):
    """The closing card over the overview."""
    p = T.open("#m=single")
    p.wait_for_timeout(9000)
    cine_full(p)
    p.evaluate("() => { map.invalidateSize(); const c = map.getCenter(); map.setView(c, map.getZoom() - 0.3, {animate: false}); }")
    p.wait_for_timeout(1000)
    T.go()
    p.evaluate("""() => { D.card('veil', '<img class="logo" src="logo/tongues-from-space-logo-ring-bold-white.svg" alt=""><div class="t1">Tongues from Space</div><div class="t2">Switzerland</div><div class="sub">Compare, create and share the ten largest Swiss glaciers.</div><div class="url">tonguesfromspace.org</div>'); }""")
    T.sleep(3.6)
    T.done(0.2)


TAKES = {"open": take_open, "timelapse": take_timelapse, "compare": take_compare, "3d": take_3d, "photo": take_photo, "export": take_export, "product": take_product, "stats": take_stats, "end": take_end}
ORDER = ["open", "timelapse", "compare", "3d", "photo", "product", "stats", "end"]      # "export" (the pane itself, 10 s) is left out of the film to keep it short; python3 scripts/make_teaser.py --takes export records it


# ----------------------------------------------------------------------------------------------------------------------------------------------------
def assemble(names, fmt, out):
    """Joins the clips of the takes with cross-fades and encodes the film."""
    exe = ffmpeg_exe()
    clips = [f"{WORK}/{n}.mp4" for n in names if os.path.exists(f"{WORK}/{n}.mp4")]
    if not clips:
        raise SystemExit("no clips")
    durs = [float(subprocess.run([exe, "-i", c], capture_output=True, text=True).stderr.split("Duration: ")[1].split(",")[0].split(":")[2]) for c in clips]
    cmd = [exe, "-y", "-loglevel", "error"]
    for c in clips:
        cmd += ["-i", c]
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
    subprocess.run([exe, "-y", "-loglevel", "error", "-ss", "0.6", "-i", f"{out}.mp4", "-frames:v", "1", "-q:v", "3", f"{out}-poster.jpg"], check=True)
    print("film:", out, f"{sum(durs) - XFADE * (len(clips) - 1):.1f} s")


FORMATS = {"wide": {"size": (1280, 720), "out": (1920, 1080), "dsf": 1.5, "z": 2 / 3, "mobile": False, "name": "teaser-wide"},
           "tall": {"size": (360, 640), "out": (1080, 1920), "dsf": 3, "z": 1 / 3, "mobile": True, "name": "teaser-tall"}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--format", default="wide", choices=list(FORMATS))
    ap.add_argument("--takes", help="comma list; default all")
    ap.add_argument("--exports", action="store_true", help="make the export files again (the product shot uses them)")
    ap.add_argument("--no-assemble", action="store_true")
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
            if a.exports or (("product" in names) and not os.path.exists(f"{WORK}/export-916.mp4")):
                print("exports"); make_exports(ctx)
            for n in names:
                print("take", n)
                TAKES[n](Take(ctx, f"{a.format}-{n}", fmt))
            ctx.close()
    if not a.no_assemble:
        assemble([f"{a.format}-{n}" for n in ORDER if (not a.takes or n in names) or a.assemble_only], fmt, f"{OUT}/{fmt['name']}")


if __name__ == "__main__":
    main()
