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


HIDE_TOOLS = """() => { const hide = e => e.style.setProperty('display', 'none', 'important');
  document.querySelectorAll('#v3dTlLine,.v3d-year').forEach(hide);
  for (const e of document.querySelectorAll('body *')) if (e.children.length === 0 && /^Drag to turn/.test(e.textContent.trim())) hide(e); }"""


def open_film(ctx, hash_):
    p = ctx.new_page(); p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
    p.add_init_script(FILM)
    p.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1'); localStorage.removeItem('glacierPrefs')}catch(e){}")
    p.goto(f"{BASE}/index.html{hash_}", wait_until="load")
    return p


def ready_3d(p):
    wait_js(p, "document.querySelector('#v3dCanvas') && document.querySelector('#v3dCanvas').offsetWidth > 0 && true", 150000)


def clean(p, tools=False):
    """Panels away. With tools=True the page's own tool bar (measure, cross-section, old photographs) stays, for the shots that use it."""
    p.evaluate("() => { const b = document.getElementById('toggleLeft'); if (b && document.querySelector('.controls') && document.querySelector('.controls').getBoundingClientRect().width > 100) b.click(); }")      # the stage takes the whole window
    p.wait_for_timeout(900)
    base = "#v3dLbToggle,#v3dLayers,#toggleRight,#toggleLeft,#credits,#gestureHint,.notice,.v3d-year small,.v3d-year .sub,.v3d-year .hint,.v3d-year p,.v3d-year div,.v3d-year span,#v3dSci,.v3d-sci"
    css = "html body #stage :is(" + base + (")" if tools else ",.mapbar)") + "{display:none!important} html body #toggleRight,html body #toggleLeft,html body #credits,html body #v3dLayers{display:none!important} html body *{cursor:none!important}"
    p.add_style_tag(content=css)
    p.evaluate(HIDE_TOOLS if tools else HIDE); p.evaluate("F.cine(true)")
    if tools: p.evaluate("() => document.querySelectorAll('#stage .tl-prev,#stage .tl-next,#stage #v3mHome,#stage #v3dFs').forEach(e => e.style.setProperty('display', 'none', 'important'))")
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
    p = open_film(ctx, "#g=aletsch&m=single&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(6000); clean(p)
    cam(p, -0.5, 1.05, 8200); p.wait_for_timeout(3000)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.wait_for_timeout(1500)
    p.evaluate("""() => { window._t = F.tween(9000, u => W.v3d.setCam({az: -0.5 + 0.35 * u, el: 1.05 - 0.77 * u, dist: 8200 - 4400 * u})); }""")      # not awaited: the line comes in while the camera moves
    p.wait_for_timeout(3800); p.evaluate("F.say('every glacier ends<br>in a tongue.')")
    p.wait_for_timeout(6200)
    rec.stop(); save_clip(rec, "open"); p.close()

TICKER = """() => { if (window._tk) clearInterval(window._tk); window._tk = setInterval(() => { try { const c = W.v3dCtx, y = c && c.current && c.current(); if (y) F.year(String(y)); } catch (e) {} }, 80); }"""


def take_years(ctx):
    """Shot 3: the summers pass, 2016 to 2026 in the low 3D flight, one quiet camera drift; the ticker follows the year on screen."""
    p = open_film(ctx, "#g=aletsch&m=timelapse&from=2016&to=2026&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(4000)
    p.evaluate("() => { document.getElementById('loopToggle').checked = true; }")
    warm_play(p, speed=1)
    clean(p); cam(p, -0.3, 0.3, 4000); p.evaluate(TICKER); p.wait_for_timeout(500)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.evaluate("() => F.tween(14000, u => W.v3d.setCam({az: -0.3 + 0.22 * u, el: 0.3 + 0.03 * u, dist: 4000 - 300 * u}), false)")      # evaluate waits for the tween
    rec.stop(); save_clip(rec, "years"); p.close()


def take_slider(ctx):
    """Shot 4: 2016 against 2026 in 3D, the line drawn slowly from the left to the right edge and back to the middle."""
    p = open_film(ctx, "#g=aletsch&m=compare&a=2016&b=2026&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(9000)
    p.evaluate("async () => (await import('/js/08-controls.js')).setOrient('v')"); p.wait_for_timeout(1500)      # side by side, the line vertical
    clean(p); p.add_style_tag(content="#v3dLabA,#v3dLabB,#v3dDiv>span:not(.v3d-handle){display:none!important}")
    cam(p, -0.3, 0.32, 4000); p.evaluate("() => W.setSplit3D(0.05)"); p.wait_for_timeout(1500)
    p.evaluate("F.labels('2016', '2026')")
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.wait_for_timeout(1200)
    p.evaluate("() => F.tween(6500, u => W.setSplit3D(0.05 + 0.9 * u))")
    p.wait_for_timeout(600)
    p.evaluate("() => F.tween(1800, u => W.setSplit3D(0.95 - 0.45 * u))")
    p.wait_for_timeout(1200)
    rec.stop(); save_clip(rec, "slider"); p.close()


MAPCLEAN = "#tagA,#tagB,#tagT,.mapbar,.leaflet-control,#toggleRight,#toggleLeft,#credits,.handle-hint,.notice,.layerbox,.scroll-cue,.pick-hint,.down-hint,.gesture-hint{display:none!important}"


def open_map(ctx, hash_, dz=1, layers=False):
    """The map view of the page, panels away, framed on the tongue."""
    p = open_film(ctx, hash_); p.wait_for_timeout(2000)
    wait_js(p, "typeof L !== 'undefined' && document.querySelector('.leaflet-tile-loaded')", 150000); wire(p)
    p.evaluate("() => { const b = document.getElementById('toggleLeft'); if (b && document.querySelector('.controls').getBoundingClientRect().width > 100) b.click(); }")
    p.evaluate("async dz => { const m = await import('/js/05-map.js'); m.map.invalidateSize({pan:false}); m.focusTongue(false); m.map.setZoom(m.map.getZoom() + dz, {animate: false}); }", dz)
    p.add_style_tag(content=MAPCLEAN.replace(",.layerbox", "") if layers else MAPCLEAN); p.evaluate("F.cine(true)")
    p.evaluate("() => { for (const e of document.querySelectorAll('body *')) if (/reached the tongue/.test(e.textContent) && e.textContent.length < 120) e.style.setProperty('display', 'none', 'important'); }")
    return p


def drag(p, sel, to_x, ms, y=None):
    """The real mouse drags a handle to x (css px) in ms; the film's cursor shows it."""
    b = p.locator(sel).bounding_box(); x0, y0 = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    if y is None: y = y0
    p.evaluate("F.follow = true"); p.mouse.move(x0 + 60, y0 + 40); p.wait_for_timeout(300)
    p.mouse.move(x0, y0, steps=8); p.mouse.down(); p.wait_for_timeout(120)
    n = max(8, int(ms / 33))
    for i in range(1, n + 1):
        u = i / n; e = u * u * (3 - 2 * u)
        p.mouse.move(x0 + (to_x - x0) * e, y0 + (y - y0) * e); p.wait_for_timeout(ms / n)
    p.mouse.up()


def take_slider_map(ctx):
    """Shot 4 (the version that shows the ice edge): the map at the tongue, 2016 against 2026, the line dragged across."""
    p = open_map(ctx, "#g=aletsch&m=compare&a=2016&b=2026", dz=1)
    p.evaluate("async () => (await import('/js/08-controls.js')).setOrient('v')"); p.wait_for_timeout(2500)
    p.evaluate("async () => { const m = await import('/js/05-map.js'); m.map.invalidateSize({pan:false}); }"); p.wait_for_timeout(1000)
    p.evaluate("F.labels('2016', '2026')"); p.wait_for_timeout(500)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.wait_for_timeout(900)
    drag(p, "#handle", W * 0.9, 3200); p.wait_for_timeout(500)
    drag(p, "#handle", W * 0.3, 3000); p.wait_for_timeout(1000)
    rec.stop(); save_clip(rec, "slider_map"); p.close()


def take_cross(ctx):
    """Shot 7: the thickness cross-section in 3D: the tool, a line across the tongue, the profile."""
    p = open_film(ctx, "#g=aletsch&m=single&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(7000)
    clean(p, tools=True)
    cam(p, -0.35, 0.62, 5200); p.wait_for_timeout(2500)
    p.screenshot(path=os.path.join(WORK, "cross0.png"))
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start(); p.evaluate("F.follow = true")
    p.mouse.move(640, 650); p.wait_for_timeout(800)
    b = p.locator("#v3mSect").bounding_box(); p.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=25); p.wait_for_timeout(400); p.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
    p.wait_for_timeout(700)
    p.mouse.move(520, 330, steps=25); p.wait_for_timeout(300); p.mouse.click(520, 330); p.wait_for_timeout(500)
    p.mouse.move(790, 400, steps=30); p.wait_for_timeout(300); p.mouse.click(790, 400)
    p.wait_for_timeout(3500)
    p.screenshot(path=os.path.join(WORK, "cross1.png"))
    rec.stop(); save_clip(rec, "cross"); p.close()


def take_photo(ctx):
    """Shot 8: an old photograph placed in the 3D view where it was taken, then slid into today."""
    p = open_film(ctx, "#g=aletsch&m=single&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(7000)
    clean(p, tools=True)
    cam(p, 0.35, 0.32, 4200)
    p.evaluate("() => { const c = document.getElementById('l3Photos'); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', {bubbles: true})); } }")      # the Photos layer
    wait_js(p, "!document.getElementById('v3dPhotos').hidden", 90000); p.wait_for_timeout(1500)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start(); p.evaluate("F.follow = true")
    p.mouse.move(640, 640); p.wait_for_timeout(500)
    p.screenshot(path=os.path.join(WORK, "photo_pre.png"))
    for sel in (".ph[data-i='2']",):
        p.wait_for_selector(sel, state="visible", timeout=20000)
        b = p.locator(sel).first.bounding_box(); p.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=25); p.wait_for_timeout(300)
        p.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2); p.wait_for_timeout(900)
    wait_js(p, "!document.getElementById('v3dDiv').hidden", 30000); p.wait_for_timeout(1500)
    p.screenshot(path=os.path.join(WORK, "photo0.png"))
    drag(p, "#v3dDiv", W * 0.85, 2200); p.wait_for_timeout(300); drag(p, "#v3dDiv", W * 0.25, 2200); p.wait_for_timeout(900)
    rec.stop(); save_clip(rec, "photo"); p.close()


def take_size(ctx):
    """Shot 9: the outline of Aletsch is dragged onto Zurich (size.html): the map alone, the panels away."""
    p = ctx.new_page(); p.add_init_script(FILM); p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
    p.goto(f"{BASE}/size.html#g=B36-26&c=zurich", wait_until="load"); p.wait_for_timeout(9000)
    p.add_style_tag(content="#stage{position:fixed!important;inset:0!important;z-index:5!important} #stage>*:not(#map){display:none!important} .leaflet-control{display:none!important} *{cursor:none!important}")
    p.evaluate("() => window.dispatchEvent(new Event('resize'))"); p.wait_for_timeout(2500); p.evaluate("F.cine(true); F.follow = true")
    p.screenshot(path=os.path.join(WORK, "size1.png"))
    # off the city, unseen: the outline starts to the east of Zurich
    p.mouse.move(640, 360); p.mouse.down(); p.mouse.move(1000, 300, steps=20); p.mouse.up(); p.wait_for_timeout(1200)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start(); p.wait_for_timeout(900)
    p.mouse.move(1000, 300, steps=6); p.mouse.down(); p.wait_for_timeout(150)
    for i in range(1, 61):
        u = i / 60; e = u * u * (3 - 2 * u); p.mouse.move(1000 + (640 - 1000) * e, 300 + (360 - 300) * e); p.wait_for_timeout(45)
    p.mouse.up(); p.wait_for_timeout(2200)
    rec.stop(); save_clip(rec, "size"); p.close()


def take_layers(ctx):
    """Shot 10 (material for the burst): the Layers menu on the map, layers switched on one after another."""
    p = open_map(ctx, "#g=aletsch&m=single", dz=0, layers=True)
    p.evaluate("() => { const b = document.getElementById('lbToggle'); if (b.getAttribute('aria-expanded') !== 'true') b.click(); }"); p.wait_for_timeout(2500)
    p.screenshot(path=os.path.join(WORK, "layers0.png"))
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start(); p.wait_for_timeout(800)
    for i in ("oldToggle", "newToggle", "pinToggle", "thickToggle", "speedToggle", "trailsToggle", "svToggle", "namesToggle"):
        p.evaluate("id => { const c = document.getElementById(id); if (c && !c.checked) c.click(); }", i); p.wait_for_timeout(1100)
    p.wait_for_timeout(1500)
    p.screenshot(path=os.path.join(WORK, "layers1.png"))
    rec.stop(); save_clip(rec, "layers"); p.close()


def take_export(ctx):
    """Shot 11, the desktop half: the download pane of the page, a 9:16 animation with facts, previewed. The page as it is (panel open), recorded at 16:10."""
    p = open_film(ctx, "#g=aletsch&m=timelapse&from=2016&to=2026"); wait_js(p, "typeof L !== 'undefined' && document.querySelector('.leaflet-tile-loaded')", 150000); wire(p); p.wait_for_timeout(6000)
    p.add_style_tag(content=".scroll-cue,.notice,.credits,.leaflet-control-attribution{display:none!important}"); p.evaluate("F.cine(true); F.follow = true")
    p.evaluate("() => document.getElementById('videoBtn').scrollIntoView({block: 'center'})"); p.wait_for_timeout(1000)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    for sel in ("#videoBtn", "#vfReel", "#vFacts", "#vfPlay"):
        p.wait_for_selector(sel, state="visible", timeout=20000)
        b = p.locator(sel).bounding_box(); p.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=22); p.wait_for_timeout(350)
        p.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2); p.wait_for_timeout(1000)
    p.wait_for_timeout(2500); p.screenshot(path=os.path.join(WORK, "export0.png"))
    rec.stop(); save_clip(rec, "export"); p.close()


def take_devices(ctx):
    """Shot 11: the export panel on a desktop frame, the finished 9:16 animation on a phone (scripts/tools/film-devices.html)."""
    p = ctx.new_page(); p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
    p.goto(f"{BASE}/scripts/tools/film-devices.html"); wait_js(p, "window.ready", 30000); p.evaluate("window.ready()"); p.wait_for_timeout(500)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start(); p.evaluate("window.go()"); p.wait_for_timeout(6000)
    p.screenshot(path=os.path.join(WORK, "devices0.png")); rec.stop(); save_clip(rec, "devices"); p.close()


def take_end(ctx):
    """Shot 12: back to the opening landscape, the glacier still, the invitation fades in."""
    p = open_film(ctx, "#g=aletsch&m=single&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(7000)
    clean(p); cam(p, -0.2, 0.3, 4200); p.wait_for_timeout(1500)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.evaluate("() => { F.tween(7000, u => W.v3d.setCam({az: -0.2 - 0.06 * u, el: 0.3 + 0.02 * u, dist: 4200 + 500 * u}), false); }") if False else None
    p.evaluate("() => { window._t = F.tween(7000, u => W.v3d.setCam({az: -0.2 - 0.06 * u, el: 0.3 + 0.02 * u, dist: 4200 + 500 * u}), false); }")
    p.wait_for_timeout(1500); p.evaluate("F.end('find your glacier.', 'pick your year.', 'tonguesfromspace.org')")
    p.wait_for_timeout(5800)
    rec.stop(); save_clip(rec, "end"); p.close()


def take_orbit(ctx):
    """Shot 6: a slow orbit around the tongue while the ice surfaces of the years change; no ticker, the landscape alone."""
    p = open_film(ctx, "#g=aletsch&m=timelapse&from=2016&to=2026&v=3d"); ready_3d(p); wire(p); p.wait_for_timeout(4000)
    p.evaluate("() => { document.getElementById('loopToggle').checked = true; }")
    warm_play(p, speed=1)
    clean(p); cam(p, -0.9, 0.34, 4600); p.wait_for_timeout(500)
    rec = Rec(p, int(W * DSF), int(H * DSF), 92); rec.start()
    p.evaluate("() => F.tween(14000, u => W.v3d.setCam({az: -0.9 + 0.75 * u, el: 0.34 + 0.06 * Math.sin(u * 3.1), dist: 4600 - 500 * u}), false)")
    rec.stop(); save_clip(rec, "orbit"); p.close()


# The cut: (clip, start s, length s of the source, speed). Shots 1-2 (open), 3 (years), 4 (slider_map), 6 (orbit), 7 (cross), 8 (photo), 9 (size), 10 (layers), 11 (devices), 12 (end).
# Shot 5 (one figure) is left out of the first cut. Each cut is joined to the next with a short cross-fade.
CUT = [("open", 0.3, 9.5, 1.0), ("years", 0.0, 14.0, 2.0), ("slider_map", 0.3, 8.0, 1.0), ("orbit", 1.0, 9.0, 1.5), ("cross", 0.4, 5.5, 1.0),
       ("photo", 1.0, 5.5, 1.0), ("size", 0.2, 4.2, 1.0), ("layers", 0.5, 11.0, 2.0), ("devices", 0.3, 5.0, 1.0), ("end", 0.3, 5.8, 1.0)]
XF = 0.45


def assemble(out_name="where-the-ice-was", audio=None):
    """Joins the cut with cross-fades (a fade in from black at the start, a fade out at the end), 1920x1080, 30 fps, H.264 (+ the sound if given)."""
    import subprocess
    exe = ffmpeg_exe(); cmd = [exe, "-y", "-loglevel", "error"]; parts = []; durs = []
    for i, (n, ss, d, sp) in enumerate(CUT):
        cmd += ["-ss", str(ss), "-t", str(d), "-i", os.path.join(WORK, n + ".mp4")]
        parts.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps={FPS},scale=1920:1080:flags=lanczos,format=yuv420p,setsar=1[c{i}]"); durs.append(d / sp)
    if audio: cmd += ["-i", audio]
    last, acc = "c0", durs[0]
    for i in range(1, len(CUT)):
        parts.append(f"[{last}][c{i}]xfade=transition=fade:duration={XF}:offset={acc - XF:.3f}[x{i}]"); last, acc = f"x{i}", acc + durs[i] - XF
    parts.append(f"[{last}]fade=t=in:st=0:d=1.0,fade=t=out:st={acc - 1.2:.3f}:d=1.2[v]")
    cmd += ["-filter_complex", ";".join(parts), "-map", "[v]"]
    if audio: cmd += ["-map", f"{len(CUT)}:a", "-c:a", "aac", "-b:a", "160k", "-shortest"]
    out = os.path.join(ROOT, "teaser", out_name + ".mp4")
    subprocess.run(cmd + ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
    print("film:", out, f"{acc:.1f} s"); return acc


TAKES = {"open": take_open, "years": take_years, "slider": take_slider, "slider_map": take_slider_map, "cross": take_cross, "photo": take_photo, "size": take_size, "layers": take_layers, "export": take_export, "devices": take_devices, "end": take_end, "orbit": take_orbit}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--probe", action="store_true"); ap.add_argument("--takes", default="open"); ap.add_argument("--assemble", action="store_true"); ap.add_argument("--audio"); a = ap.parse_args()
    if a.assemble: return assemble(audio=a.audio)
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
