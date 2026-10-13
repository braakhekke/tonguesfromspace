"""Helpers of make_teaser.py: a browser that drives the real site, a screencast recorder, a mouse that glides, and ffmpeg."""
import base64, math, os, shutil, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
DIRECTOR = open(os.path.join(HERE, "director.js"), encoding="utf-8").read()
BASE = "http://localhost:8000"       # the relay lets this origin in (worker ALLOWED_ORIGINS); python3 -m http.server 8000 in the repository folder


def ffmpeg_exe():
    for c in ("ffmpeg", "/opt/homebrew/bin/ffmpeg"):
        if shutil.which(c):
            return shutil.which(c)
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


class Rec:
    """Frames of the page as the browser draws them (CDP screencast), with their times."""
    def __init__(self, page, W=1920, H=1080, quality=93):
        self.page, self.q, self.frames, self.on, self.W, self.H = page, quality, [], False, W, H
        self.cdp = page.context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", self._frame)

    def _frame(self, ev):
        if self.on:
            self.frames.append((ev["metadata"]["timestamp"], base64.b64decode(ev["data"])))
        try:
            self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
        except Exception:
            pass

    def start(self):
        self.frames, self.on = [], True
        self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": self.q, "everyNthFrame": 1, "maxWidth": self.W, "maxHeight": self.H})

    def stop(self):
        self.on = False; self.t_stop = time.time()      # the screencast sends a frame only when the picture changes: a still end needs its time from here
        try:
            self.cdp.send("Page.stopScreencast")
        except Exception:
            pass

    def save(self, outdir, fps=30):
        """Writes the frames and an ffmpeg concat list with their real durations; returns (frames, seconds)."""
        shutil.rmtree(outdir, ignore_errors=True); os.makedirs(outdir)
        ts = [t for t, _ in self.frames]
        for i, (_, b) in enumerate(self.frames):
            with open(f"{outdir}/{i:05d}.jpg", "wb") as f:
                f.write(b)
        with open(f"{outdir}/list.txt", "w") as f:
            for i, t in enumerate(ts):
                f.write(f"file '{i:05d}.jpg'\nduration {(ts[i + 1] - t) if i + 1 < len(ts) else max(1 / fps, self.t_stop - t):.5f}\n")
            f.write(f"file '{len(ts) - 1:05d}.jpg'\n")
        return len(ts), (max(ts[-1], self.t_stop) - ts[0]) if ts else 0

    def encode(self, outdir, out, fps=30, crf=14, trim=0.0, vf=""):
        """frames -> one constant-rate mp4 (lossless-ish intermediate, the final encode is done once at the end)."""
        cmd = [ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{outdir}/list.txt",
               "-vf", (vf + "," if vf else "") + f"fps={fps},format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-crf", str(crf), out]
        subprocess.run(cmd, check=True)


class Mouse:
    """A mouse that glides: the real page gets pointer events, the film's cursor follows them."""
    def __init__(self, page):
        self.page, self.x, self.y = page, 960, 540

    def place(self, x, y):
        self.x, self.y = x, y; self.page.mouse.move(x, y)

    def glide(self, x, y, ms=700, ease=True):
        n = max(2, int(ms / 14)); x0, y0 = self.x, self.y; t0 = time.time()
        for i in range(1, n + 1):
            u = i / n; e = u * u * (3 - 2 * u) if ease else u
            self.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
            wait = t0 + ms / 1000 * u - time.time()
            if wait > 0.002:
                self.page.wait_for_timeout(wait * 1000)      # not time.sleep: the page's events (the screencast) are only handled inside Playwright calls
        self.x, self.y = x, y

    def to(self, sel, ms=700, dx=0, dy=0, nth=0):
        b = self.page.locator(sel).nth(nth).bounding_box()
        self.glide(b["x"] + b["width"] / 2 + dx, b["y"] + b["height"] / 2 + dy, ms)

    def click(self, sel=None, ms=700, hold=0.12, **kw):
        if sel:
            self.to(sel, ms, **kw)
        self.page.mouse.down(); self.page.wait_for_timeout(hold * 1000); self.page.mouse.up()

    def drag(self, x, y, ms=900, ease=True):
        self.page.mouse.down(); self.glide(x, y, ms, ease); self.page.mouse.up()


def wait_js(page, expr, timeout=60000, poll=250):
    page.wait_for_function(expr, timeout=timeout, polling=poll)


def open_page(ctx, hash_="", scale=1.0):
    page = ctx.new_page()
    page.add_init_script(DIRECTOR)
    page.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1'); localStorage.removeItem('glacierPrefs')}catch(e){}")      # every shot starts from the page's defaults (no 1850 outline kept from another shot)      # the film must not play inside itself
    page.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
    page.goto(f"{BASE}/index.html{hash_}", wait_until="load")
    wait_js(page, "typeof L !== 'undefined' && document.getElementById('story') && document.getElementById('story').dataset.glacier", 60000)
    page.evaluate(f"D.follow = true; D.scale({scale})")
    return page
