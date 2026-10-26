#!/usr/bin/env python3
"""Records two more clips of the landing page (home.html, "What you can do") from the real pages, 1280 x 720, no sound:
  size   = size.html, the Aletsch outline dragged onto Zurich and Bern (the size comparison)
  trails = index.html, Aletsch with the hiking trails and the stretches where the tongue is in view, then the Discover tab
Needs `python3 -m http.server 8000` in the repository and the relay of config.js (the satellite picture). Playwright + ffmpeg (PATH or imageio-ffmpeg).
Writes images/home/clips/<name>.mp4 and <name>.jpg."""
import glob, os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'images', 'home', 'clips')
BASE = 'http://localhost:8000/'

def ffmpeg():
    exe = shutil.which('ffmpeg')
    if exe: return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def record(name, steps, poster):
    from playwright.sync_api import sync_playwright
    tmp = tempfile.mkdtemp()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=tmp, record_video_size={'width': 1280, 'height': 720})
        pg = ctx.new_page(); t0 = time.time()
        start = steps(pg, lambda: time.time() - t0)       # returns (start, end) in seconds of the recording to keep
        ctx.close(); b.close()
    src = glob.glob(os.path.join(tmp, '*.webm'))[0]; a, z = start
    exe = ffmpeg(); os.makedirs(OUT, exist_ok=True)
    subprocess.run([exe, '-y', '-loglevel', 'error', '-ss', str(a), '-t', str(z - a), '-i', src, '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', os.path.join(OUT, name + '.mp4')], check=True)
    subprocess.run([exe, '-y', '-loglevel', 'error', '-ss', str(a + poster), '-i', src, '-frames:v', '1', '-q:v', '3', os.path.join(OUT, name + '.jpg')], check=True)
    shutil.rmtree(tmp); print(name, os.path.getsize(os.path.join(OUT, name + '.mp4')) // 1024, 'KB')

def size(pg, now):
    pg.goto(BASE + 'size.html#g=B36-26'); pg.wait_for_timeout(5000); a = now()
    pg.mouse.move(640, 360); pg.wait_for_timeout(1200)
    pg.click('#cities button:has-text("Z")'); pg.wait_for_timeout(3200)       # Zurich: the outline jumps onto the city
    pg.mouse.move(620, 300); pg.mouse.down(); pg.wait_for_timeout(200)
    for i in range(1, 21): pg.mouse.move(620 + 5 * i, 300 + 3 * i); pg.wait_for_timeout(45)      # drag the outline across the city
    pg.mouse.up(); pg.wait_for_timeout(1300)
    pg.click('#cities button:has-text("Bern")'); pg.wait_for_timeout(3500)
    return a, now()

def trails(pg, now):
    pg.goto(BASE + 'index.html#g=aletsch&m=single&one=2026', wait_until='load'); pg.reload()
    pg.wait_for_function("typeof state !== 'undefined' && state.checked && Object.keys(state.available).length > 0", timeout=240000)
    pg.wait_for_timeout(6000); a = now()
    pg.click('#lbToggle'); pg.wait_for_timeout(900)
    pg.click('label:has(#trailsToggle)'); pg.wait_for_timeout(4500)       # the trails and the violet stretches where the tongue is in view
    pg.click('#lbToggle'); pg.wait_for_timeout(1200)
    pg.click('text=Discover Grosser Aletsch'); pg.wait_for_timeout(1800)       # the right panel opens
    pg.click('.tabs >> text=Discover'); pg.wait_for_timeout(800)
    pg.click('summary:has-text("Hike and bike")'); pg.wait_for_timeout(5000)
    return a, now()

STEPS = {'size': (size, 3.0), 'trails': (trails, 7.0)}

if __name__ == '__main__':
    for n in (sys.argv[1:] or STEPS): record(n, STEPS[n][0], STEPS[n][1])
