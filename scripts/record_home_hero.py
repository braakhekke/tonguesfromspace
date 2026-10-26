#!/usr/bin/env python3
"""Records the video of the landing page's hero (home.html): a 3D flight over Grosser Aletsch while the timelapse 2016 to 2026 runs in a loop.
The real dashboard is driven in its 3D view (the page's own controls: the play button, the speed, a mouse drag to turn the camera), everything around the
picture is hidden, and the picture is the 3D stage as it is (990 x 720). Output: images/home/hero-flight.mp4 (+ .webm) and hero-flight.jpg (poster), and the
credit line the page showed, in images/home/hero-flight.txt (home.html shows it under the video).
    python3 -m http.server 8000        # in the repository folder; the relay lets this origin in (worker ALLOWED_ORIGINS)
    python3 scripts/record_home_hero.py [--probe]       # --probe: only a picture of the cleaned view, no film
Needs: pip install playwright imageio-ffmpeg && python3 -m playwright install chromium; the live relay for the pictures (cached ones cost no Copernicus requests)."""
import argparse, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "teaser"))
from lib import Rec, Mouse, ffmpeg_exe, BASE            # noqa: E402

WORK = os.path.join(ROOT, "teaser", "work", "hero"); OUT = os.path.join(ROOT, "images", "home")
ARGS = ["--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-color-profile=srgb"]
W, H, DSF = 1280, 720, 2
SECONDS = 8                          # one turn of the camera there and back, ending where the live 3D viewer starts; the timelapse runs once and a bit in it
CLEAN = "html body #stage :is(#v3dLbToggle,#v3dLayers,.mapbar,#toggleRight,#toggleLeft,#credits,#gestureHint,.notice,.v3d-year small,.v3d-year .sub,.v3d-year .hint,.v3d-year p,.v3d-year div,.v3d-year span){display:none!important} html body #toggleRight,html body #toggleLeft,html body #credits,html body .mapbar,html body #v3dLayers{display:none!important} html body *{cursor:none!important}"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--probe", action="store_true"); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(WORK, exist_ok=True)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(os.path.join(WORK, "profile"), args=ARGS, viewport={"width": W, "height": H}, device_scale_factor=DSF)
        p = ctx.new_page(); p.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
        p.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1')}catch(e){}")
        p.goto(f"{BASE}/index.html#g=aletsch&m=timelapse&from=2016&to=2026&v=3d", wait_until="load")
        p.wait_for_function("document.querySelector('#v3dCanvas') && document.querySelector('#v3dCanvas').offsetWidth > 0 && document.querySelector('.tl-play')", timeout=120000)
        p.evaluate("() => { const s = document.getElementById('speedSel'); s.value = 2; s.dispatchEvent(new Event('input', {bubbles: true})); document.getElementById('loopToggle').checked = true; }")
        p.click("#playBtn")                                           # play once, unseen, until every year's picture is loaded
        p.wait_for_function("!document.querySelector('#playBtn .spin-s') && /pause/i.test(document.getElementById('playBtn').innerText)", timeout=180000)
        p.wait_for_timeout(2500)
        credit = re.sub(r"(Sentinel data) \d{4},", r"\1 2016–2026,", p.evaluate("document.getElementById('credits').innerText"))      # the viewer names the year it shows; the film shows all of them
        p.add_style_tag(content=CLEAN)
        p.evaluate("""() => { const hide = e => e.style.setProperty('display', 'none', 'important');
          document.querySelectorAll('#v3dTlLine,.v3d-tl,.mapbar').forEach(hide);
          for (const e of document.querySelectorAll('body *')) if (e.children.length === 0 && /^Drag to turn/.test(e.textContent.trim())) hide(e);
          let b = document.getElementById('v3mOut'); while (b && b.parentElement && b.parentElement.getBoundingClientRect().height < 130 && b.parentElement.id !== 'stage') b = b.parentElement; if (b) hide(b); }""")
        p.wait_for_timeout(400)
        box = p.locator("#v3dCanvas").bounding_box()
        w, h, x, y = round(box["width"]), round(box["height"]), round(box["x"]), round(box["y"])
        print("title:", p.evaluate("document.getElementById('v3dTitle').innerHTML"))
        print("canvas", box, "-> crop", w, h, "at", x, y)
        if a.probe:
            p.screenshot(path=os.path.join(WORK, "probe.png"), clip={"x": x, "y": y, "width": w, "height": h}); ctx.close(); return
        m = Mouse(p); cx, cy = x + w / 2, y + h * 0.5; m.place(cx, cy)
        rec = Rec(p, W * DSF, H * DSF, 92); rec.start()
        p.mouse.move(cx, cy); p.mouse.down()
        steps = 120
        for i in range(1, steps + 1):                                 # there and back: the camera turns right and tilts a little, then returns to where it began
            u = i / steps; s = (1 - abs(2 * u - 1)); e = s * s * (3 - 2 * s)      # 0 -> 1 -> 0, eased
            p.mouse.move(cx + 55 * e, cy + 12 * e)      # a small, slow turn: the page plays the film 1.75 times faster
            p.wait_for_timeout(SECONDS * 1000 / steps)
        p.mouse.up(); rec.stop()
        d = os.path.join(WORK, "frames"); n, secs = rec.save(d, 30); print("frames", n, "seconds", round(secs, 1))
        from PIL import Image
        k = Image.open(os.path.join(d, "00000.jpg")).size[0] / W              # the screencast's pixels per CSS pixel (it may be smaller than the device pixels)
        raw = os.path.join(WORK, "raw.mp4"); rec.encode(d, raw, 30, 14, vf=f"crop={round(w * k)}:{round(h * k)}:{round(x * k)}:{round(y * k)}")
        shutil.rmtree(d, ignore_errors=True); ctx.close()
    exe = ffmpeg_exe(); mp4 = os.path.join(OUT, "hero-flight.mp4")
    scale = "scale=1100:-2:flags=lanczos"
    subprocess.run([exe, "-y", "-loglevel", "error", "-i", raw, "-vf", scale, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
    subprocess.run([exe, "-y", "-loglevel", "error", "-i", raw, "-vf", scale, "-an", "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", os.path.join(OUT, "hero-flight.webm")], check=True)
    subprocess.run([exe, "-y", "-loglevel", "error", "-ss", "0.1", "-i", raw, "-vf", scale, "-frames:v", "1", "-q:v", "3", os.path.join(OUT, "hero-flight.jpg")], check=True)
    open(os.path.join(OUT, "hero-flight.txt"), "w", encoding="utf-8").write(credit.strip() + "\n")
    print("done:", mp4, os.path.getsize(mp4) // 1024, "KB;", "credit:", credit.strip())


if __name__ == "__main__":
    main()
