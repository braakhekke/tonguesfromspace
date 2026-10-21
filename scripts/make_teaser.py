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


def set_speed(p, v):
    p.evaluate("v => { document.getElementById('speedSel').value = v; updateSpeedIcon(); }", v)


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
    wait_js(p, "state.available[2016] && state.available[2026]", 60000)
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
    p.evaluate("() => { setOrient('v'); D.tipAt(0.5, 0.62); state.split = 0.5; clip(); D.cap('', 'Compare it', 'Drag through time', 'Any two years, side by side.'); }")
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
    p.evaluate("() => v3d.setCam({az: -0.5, el: 0.28, dist: 4800})")
    p.wait_for_timeout(700)
    m = T.mouse
    m.place(520, 470)
    T.go()
    p.evaluate("() => D.cap('', 'Fly over it', 'Fly over the ice', 'Satellite pictures on the real terrain. The ice sinks with the years.')")
    m.click(".tl-play", 450)
    p.evaluate("() => D.tween(7600, u => v3d.setCam({az: -0.5 + 1.1 * u, el: 0.28 + 0.26 * Math.sin(u * Math.PI * 0.85), dist: 4800 - 1500 * u}), false)")
    p.evaluate("() => { v3d.setCam({az: 0.35, el: 0.32, dist: 4200}); }")
    m.click("#modeSingle", 800)
    p.evaluate("() => D.cap('', 'Step inside it', 'Step into old photographs', 'Photographs placed on today\u2019s terrain.', {top: 70, cr: 56})")
    wait_js(p, "typeof v3dCtx !== 'undefined' && v3dCtx && v3dCtx.photos", 90000)
    p.evaluate("() => { v3d.setCam({az: 0.35, el: 0.32, dist: 4200}); }")
    T.sleep(0.5)
    m.click(".ph-toggle", 700)
    T.sleep(0.3)
    m.click(".ph[data-i='7']", 600)
    wait_js(p, "!!photoOn", 30000)
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
    ready = "state.checked && state.available[2026]"
    wait_js(p, ready, 90000)
    p.evaluate("() => { D.cine(true); }")
    p.wait_for_timeout(1500)
    m = T.mouse
    m.place(700, 420)
    T.go()
    p.evaluate("() => D.cap('', 'Back it with facts', 'Know the ice', 'Figures from GLAMOS, with their sources.', {left: 312, cb: 96})")
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
    """The real files of the page, made by its own export: a 9:16 animation with facts and a picture of the compare view, saved for the product shot."""
    page = open_page(ctx, "#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(page)
    page.evaluate("() => { D.frameLower(3600, 0.5, 0.42); openVideo('video'); setFmt('reel'); }")
    page.wait_for_timeout(1500)
    page.evaluate("() => D.tipInFrame(0.5, 0.42)")      # the tongue tip in the lower part of the frame, the ice running in from above
    page.wait_for_timeout(800)
    page.evaluate("$('vFacts').click()")
    page.wait_for_timeout(600)
    with page.expect_download(timeout=300000) as dl:
        page.evaluate("$('vsGo').click()")
    dl.value.save_as(f"{WORK}/export-916.mp4")
    page.close()
    page = open_page(ctx, "#g=aletsch&m=compare&a=2016&b=2026")
    wait_js(page, "state.checked && state.available[2016] && state.available[2026]", 90000)
    page.evaluate("() => { setOrient('v'); state.split = 0.5; clip(); D.frameLower(3600, 0.5, 0.42); openVideo('image'); setFmt('feed'); }")
    page.wait_for_timeout(1500)
    page.evaluate("() => D.tipInFrame(0.5, 0.42)")
    page.evaluate("() => { const f = $('videoFrame').getBoundingClientRect(), m = $('map').getBoundingClientRect(); state.split = (f.left + f.width * 0.5 - m.left) / m.width; clip(); }")      # the line in the middle of the frame, not of the map
    page.wait_for_timeout(800)
    with page.expect_download(timeout=120000) as dl:
        page.evaluate("$('vsGo').click()")
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
    """The closing text over the playing timelapse, darkened, slowly pushing in."""
    p = T.open("#g=aletsch&m=timelapse&from=2016&to=2026")
    ready_map(p)
    set_speed(p, 3); loop_on(p)
    p.evaluate("() => { D.cine(true); D.frameLower(3600, 0.5, 0.42); }")
    warm_play(p)
    T.go()
    p.evaluate("""() => { play(); D.push('#map', 1.12, 5); D.card('Make your own picture or animation of the ten largest Swiss glaciers.', 'tonguesfromspace.org'); }""")
    T.sleep(4.0)
    T.done(0.2)


TAKES = {"map": take_map, "3d": take_3d, "stats": take_stats, "export": take_export, "product": take_product, "end": take_end}
ORDER = ["map", "3d", "stats", "export", "product", "end"]


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
        assemble([f"{a.format}-{n}" for n in ORDER if (not a.takes or n in names) or a.assemble_only], fmt, f"{OUT}/{fmt['name']}")


if __name__ == "__main__":
    main()
