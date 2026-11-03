#!/usr/bin/env python3
"""Records the takes of the new teaser "Where the ice was" (concept: the storyboard; shot numbers below are the storyboard's).
Like make_teaser.py it drives the real page in headless Chromium and records it with the CDP screencast, but with the film layer of scripts/teaser/film.js
(one quiet line, a year ticker, slider labels, an end card) and the page's panels hidden. Work files are in teaser/work/film (gitignored).
    python3 -m http.server 8000                       # in the repository folder (the relay lets this origin in)
    python3 scripts/make_film.py --probe              # pictures of the cleaned 3D view and the cameras, no film
    python3 scripts/make_film.py --takes open,years   # record some takes (clips in teaser/work/film)
Takes so far: open (shots 1-2: orbit, then the low flight and the line), years (shot 3: 2016 to 2026), slider (shot 4)."""
import argparse, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "teaser")); sys.path.insert(0, HERE)
from lib import Rec, Mouse, wait_js, ffmpeg_exe, BASE            # noqa: E402
from record_home_hero import CLEAN, ARGS                            # noqa: E402

WORK = os.path.join(ROOT, "teaser", "work", "film")
FILM = open(os.path.join(HERE, "teaser", "film.js"), encoding="utf-8").read()
W, H, DSF, FPS = 1280, 720, 1.5, 30
HIDE = """() => { const hide = e => e.style.setProperty('display', 'none', 'important');
  document.querySelectorAll('#v3dTlLine,.v3d-tl,.mapbar,.v3d-year').forEach(hide);
  for (const e of document.querySelectorAll('body *')) if (e.children.length === 0 && /^Drag to turn/.test(e.textContent.trim())) hide(e);
  let b = document.getElementById('v3mOut'); while (b && b.parentElement && b.parentElement.getBoundingClientRect().height < 130 && b.parentElement.id !== 'stage') b = b.parentElement; if (b) hide(b); }"""


def open_film(ctx, hash_):
    p = ctx.new_page(); p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
    p.add_init_script(FILM)
    p.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1'); localStorage.removeItem('glacierPrefs')}catch(e){}")
    p.goto(f"{BASE}/index.html{hash_}", wait_until="load")
    return p


def ready_3d(p):
    wait_js(p, "document.querySelector('#v3dCanvas') && document.querySelector('#v3dCanvas').offsetWidth > 0 && true", 150000)


def clean(p):
    p.evaluate("() => { const b = document.getElementById('toggleLeft'); if (b && document.querySelector('.controls') && document.querySelector('.controls').getBoundingClientRect().width > 100) b.click(); }")      # the stage takes the whole window
    p.wait_for_timeout(900)
    p.add_style_tag(content=CLEAN + " html body #stage :is(#v3dSci,.v3d-sci){display:none!important}"); p.evaluate(HIDE); p.evaluate("F.cine(true)")
    p.evaluate("() => { W.v3d.resize && W.v3d.resize(); window.dispatchEvent(new Event('resize')); }") if False else None


def warm_play(p, speed=2):
    """Plays the timelapse once, unseen, so that every year's picture is loaded."""
    p.evaluate("v => { const s = document.getElementById('speedSel'); s.value = v; s.dispatchEvent(new Event('input', {bubbles: true})); }", speed)
    p.click("#playBtn")
    wait_js(p, "!document.querySelector('#playBtn .spin-s') && /pause/i.test(document.getElementById('playBtn').innerText)", 240000)
    p.wait_for_timeout(2500)


def wire(p):
    """The page's modules keep their names to themselves; js/wire.js is the one shared object (v3d, v3dCtx ...). Imported once, kept as window.W."""
    p.evaluate("async () => { if (!window.W) window.W = (await import('/js/wire.js')).wire; }")


def cam(p, az, el, dist):
    wire(p); p.evaluate("([a, e, d]) => W.v3d.setCam({az: a, el: e, dist: d})", [az, el, dist])


def save_clip(rec, name):
    d = os.path.join(WORK, name); n, secs = rec.save(d, FPS)
    rec.encode(d, os.path.join(WORK, name + ".mp4"), FPS); shutil.rmtree(d, ignore_errors=True)
    print(f"  {name}: {n} frames, {secs:.1f} s")


def probe(ctx):
    p = open_film(ctx, "#g=aletsch&m=single&v=3d"); ready_3d(p); p.wait_for_timeout(6000); clean(p)
    for i, c in enumerate([(-0.5, 1.45, 30000), (-0.5, 1.2, 14000), (-0.5, 0.6, 8000), (-0.3, 0.28, 3800)]):
        cam(p, *c); p.wait_for_timeout(3500)
        p.screenshot(path=os.path.join(WORK, f"probe{i}.png")); print("probe", i, c, p.evaluate("W.v3d.getCam()"))
    p.close()


def take_open(ctx):
    """Shots 1-2: from far above the tongue down into a low flight; the line comes in when the flight is low."""
    p = open_film(ctx, "#g=aletsch&m=single&v=3d"); ready_3d(p); p.wait_for_timeout(6000); clean(p)
    cam(p, -0.5, 1.12, 9500); p.wait_for_timeout(3000)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.wait_for_timeout(2500)
    p.evaluate("""() => F.tween(9000, u => W.v3d.setCam({az: -0.5 + 0.35 * u, el: 1.12 - 0.84 * u, dist: 9500 - 5700 * u}))""")
    p.evaluate("F.say('every glacier ends<br>in a tongue.')")
    p.wait_for_timeout(3500)
    rec.stop(); save_clip(rec, "open"); p.close()


TAKES = {"open": take_open}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--probe", action="store_true"); ap.add_argument("--takes", default="open"); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(WORK, exist_ok=True)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(os.path.join(WORK, "profile"), args=ARGS, viewport={"width": W, "height": H}, device_scale_factor=DSF)
        if a.probe:
            probe(ctx)
        else:
            for n in a.takes.split(","):
                print("take", n); TAKES[n](ctx)
        ctx.close()


if __name__ == "__main__":
    main()
