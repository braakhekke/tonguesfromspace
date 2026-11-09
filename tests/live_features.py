#!/usr/bin/env python3
"""Live feature check of the public site in real Chrome (the bundled Chromium cannot encode H.264, which the animation export needs).

    python3 tests/live_features.py [outdir] [only-substring]        # outdir for the downloads and screenshots; default: a temporary folder
    TFS_LIVE_URL=http://localhost:8000 python3 tests/live_features.py

Not part of `unittest discover` (the name does not start with test_): it uses the real relay, so the pictures come from the relay's cache or Copernicus. It exports one image
and one video, loads the 3D view ten times and sends three REJECTED gallery uploads (no person check, a failed one, a file too large); it never stores anything.
The upload checks behind the person check (file type, pixel size, queue, duplicates, rate limit, moderation) are tested with fakes in tests/test_worker.py (TestGallery)."""
import io, json, os, re, struct, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TFS_LIVE_URL", "https://tonguesfromspace.org").rstrip("/")
import tempfile
OUT = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else tempfile.mkdtemp(prefix="tfs-live-"); ONLY = sys.argv[2] if len(sys.argv) > 2 else ""
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
res = []


def rec(name, ok, detail=""):
    res.append({"feature": name, "ok": bool(ok), "detail": str(detail)[:400]})
    print(("PASS " if ok else "FAIL ") + name + " | " + str(detail)[:400], flush=True)


def info(name, detail):
    res.append({"feature": name, "ok": None, "detail": str(detail)[:400]})
    print("INFO " + name + " | " + str(detail)[:400], flush=True)


def want(name):
    return not ONLY or ONLY in name


def new_page(ctx):
    errs, resp = [], []
    page = ctx.new_page()
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "net::ERR" not in m.text and errs.append("console: " + m.text[:200]))
    page.on("response", lambda r: resp.append((r.url, r.status, r.headers.get("content-type", ""), r.request.method)))
    return page, errs, resp


def boot(page, url, wait_story=True):
    page.goto(url, wait_until="load", timeout=60000)
    if wait_story:
        page.wait_for_function("typeof L !== 'undefined' && document.getElementById('story') && document.getElementById('story').dataset.glacier", timeout=60000)


def scenes(page, n=5, timeout=90000):
    page.wait_for_function(f"Object.keys(state.available).filter(k => state.available[k]).length >= {n}", timeout=timeout)


with sync_playwright() as p:
    br = p.chromium.launch(channel="chrome", headless=True)
    ctx = br.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
    ctx.add_init_script("window.TFS_EXPOSE = true")
    ctx.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1'); if(!localStorage.getItem('glacierPrefs'))localStorage.setItem('glacierPrefs','{\"hideR\":false}')}catch(e){}")

    # 1 deep links -------------------------------------------------------------------------------------------------
    if want("deep links"):
        try:
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023")
            ids = page.evaluate("GLACIERS.map(g => g.id)"); page.close()
            bad = []
            for gid in ids:
                page, errs, _ = new_page(ctx); boot(page, f"{BASE}/switzerland/#g={gid}&m=single&one=2023")
                ok = page.evaluate("g => state.glacier === g && glacierPicked && !!currentGlacier().inv.outline", gid)
                if not ok or errs: bad.append((gid, errs[:1]))
                page.close()
            rec("deep links: #g=<id> opens each of the ten glaciers", not bad and len(ids) == 10, f"{len(ids)} ids {ids}; bad={bad}")
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=compare&a=2016&b=2026")
            rec("deep links: compare link keeps mode and both years", page.evaluate("state.mode === 'compare' && +state.a === 2016 && +state.b === 2026"), page.evaluate("JSON.stringify({m: state.mode, a: state.a, b: state.b})")); page.close()
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=timelapse&from=2018&to=2022")
            rec("deep links: timelapse link keeps its range", page.evaluate("state.mode === 'timelapse' && +state.from === 2018 && +state.to === 2022"), page.evaluate("JSON.stringify({m: state.mode, f: state.from, t: state.to})")); page.close()
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=gorner&m=single&one=2020&s=false1&t=stats")
            info("deep links: style and tab in the link", page.evaluate("JSON.stringify({g: state.glacier, one: state.one, style: state.style, tab: document.querySelector('#story [role=tab][aria-selected=true]') && document.querySelector('#story [role=tab][aria-selected=true]').dataset.tab})")); page.close()
        except Exception as e:
            rec("deep links", False, repr(e))

    # 2 old-link redirects -----------------------------------------------------------------------------------------
    if want("old-link"):
        try:
            page, errs, _ = new_page(ctx)
            page.goto(BASE + "/#g=aletsch&m=compare&a=2016&b=2026", wait_until="load")
            try: page.wait_for_url("**/switzerland/**", timeout=30000)
            except Exception: pass
            page.wait_for_function("typeof state !== 'undefined' && document.getElementById('story') && document.getElementById('story').dataset.glacier", timeout=60000)
            u = page.url
            rec("old-link redirect: /#g=aletsch&m=compare goes to /switzerland/ with the state", "/switzerland/" in u and page.evaluate("state.mode === 'compare' && state.glacier === 'aletsch'"), u); page.close()
            for old in ("/index.html#g=trift&m=single&one=2023", "/#t=stats&g=zmutt"):
                page, errs, _ = new_page(ctx)
                try:
                    page.goto(BASE + old, wait_until="load", timeout=60000); time.sleep(3)
                    info("old link " + old, f"-> {page.url} | glacier={page.evaluate('typeof state !== \"undefined\" && state.glacier')}")
                except Exception as e:
                    info("old link " + old, repr(e)[:200])
                page.close()
            for path in ("/iceland/", "/iceland/vatnajokull/", "/norway/", "/size.html", "/gallery.html", "/home.html"):
                page, errs, resp = new_page(ctx)
                r = page.goto(BASE + path, wait_until="load", timeout=60000)
                info("address " + path, f"HTTP {r.status} -> {page.url}"); page.close()
        except Exception as e:
            rec("old-link redirect", False, repr(e))

    # 3 GLAMOS stats -----------------------------------------------------------------------------------------------
    if want("GLAMOS"):
        try:
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023")
            page.click('#story [role=tab][data-tab="figures"]')
            page.wait_for_selector('#story [data-panel="figures"]:not([hidden])', timeout=20000)
            time.sleep(1.5)
            txt = page.inner_text('#story [data-panel="figures"]')
            d = page.evaluate("(() => { const i = currentGlacier().inv; return {a: i.area_km2, a0: i.oldest.area_km2, len: i.length.total_m}; })()")
            area_pct = round((d["a"] / d["a0"] - 1) * 100); digits = re.sub(r"[^0-9]", "", re.search(r"LENGTH\s*([^\n]*)", txt).group(1))
            tiles = all(h in txt for h in ("AREA", "LENGTH", "THICKNESS AND VOLUME", "ICE SPEED", "WATER STORAGE"))
            rec("GLAMOS stats: Stats tab tiles match the inventory data (area change since 1850, length change)", tiles and f"{area_pct}".lstrip("-") in re.sub(r"[^0-9]", " ", txt.split("LENGTH")[0]) and digits == str(abs(d["len"])) and not errs, f"data: area {d['a']} vs {d['a0']} km2 in 1850 = {area_pct} %, GLAMOS length total {d['len']} m; tiles: {txt.replace(chr(10), ' | ')[:150]!r}; errors={errs[:1]}")
            info("GLAMOS stats: card headings", re.findall(r"\n?([A-Z][A-Za-z ]{3,28})\n", txt)[:12])
            page.close()
        except Exception as e:
            rec("GLAMOS stats", False, repr(e))

    # 4 compare slider ---------------------------------------------------------------------------------------------
    if want("compare"):
        try:
            page, errs, resp = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=compare&a=2016&b=2026"); scenes(page, 8)
            d = page.locator("#divider"); d.wait_for(state="visible", timeout=30000); bb = d.bounding_box()
            s0 = page.evaluate("state.split")
            horiz = bb["width"] > bb["height"]; cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2; dx, dy = (0, 120) if horiz else (-220, 0)
            time.sleep(4); page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + dx, cy + dy, steps=12); page.mouse.up()
            time.sleep(0.5); s1 = page.evaluate("state.split")
            rec("compare slider: dragging the divider moves the split", abs(s1 - s0) > 0.05 and not errs, f"divider {'horizontal' if horiz else 'vertical'} bar; split {s0:.2f} -> {s1:.2f}; errors={errs[:1]}")
            imgs = [r for r in resp if "/cdse/process" in r[0] or "/api/" in r[0]]
            info("compare: relay picture responses", f"{len(imgs)} responses, statuses {sorted(set(r[1] for r in imgs))}"); page.close()
        except Exception as e:
            rec("compare slider", False, repr(e))

    # 5 timelapse --------------------------------------------------------------------------------------------------
    if want("timelapse"):
        try:
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=timelapse&from=2016&to=2026"); scenes(page, 8)
            page.wait_for_function("/scenes for \\d+\\/\\d+ years/.test(document.getElementById('status').innerText) && !/Loading/.test(document.getElementById('status').innerText)", timeout=90000); time.sleep(1)
            page.click("#playBtn"); frames = set(); t0 = time.time(); playing = False
            while time.time() - t0 < 3.5:
                frames.add(page.evaluate("state.frame")); playing = playing or page.evaluate("state.playing"); time.sleep(0.4)
            page.click("#playBtn"); time.sleep(0.6); f0 = page.evaluate("state.frame"); time.sleep(1.5); stopped = (not page.evaluate("state.playing")) and page.evaluate("state.frame") == f0
            page.click("#playBtn"); t1 = time.time()
            while time.time() - t1 < 14 and page.evaluate("state.playing"): frames.add(page.evaluate("state.frame")); time.sleep(0.4)
            rec("timelapse: play steps through the years, pauses on a frame, and runs to the last year", playing and len(frames) >= 8 and stopped and not errs, f"distinct frames seen={sorted(frames)}; paused={stopped}; errors={errs[:1]}"); page.close()
        except Exception as e:
            rec("timelapse", False, repr(e))

    # 6 three colour modes -----------------------------------------------------------------------------------------
    if want("colour"):
        try:
            page, errs, resp = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023"); scenes(page, 5)
            import hashlib
            def sig():
                page.screenshot(path=OUT + "/_c.png", clip={"x": 300, "y": 150, "width": 700, "height": 500}); return hashlib.md5(open(OUT + "/_c.png", "rb").read()).hexdigest()[:8]
            time.sleep(5); seen = {"natural": dict(style=page.evaluate("state.style"), pressed="true", sig=sig())}
            for st in ("false1", "false2", "false3", "natural"):
                page.click('#styleNatural' if st == 'natural' else '#styleFalse' + st[-1])
                page.wait_for_function("s => state.style === s", arg=st, timeout=10000)
                time.sleep(5)
                seen[st if st != "natural" else "natural-again"] = dict(style=page.evaluate("state.style"), pressed=page.evaluate("s => document.getElementById(s === 'natural' ? 'styleNatural' : 'styleFalse' + s.slice(-1)).getAttribute('aria-pressed')", st), sig=sig())
            sigs = [v["sig"] for k, v in seen.items() if k != "natural-again"]
            ok = all(v["pressed"] == "true" for v in seen.values()) and len(set(sigs)) == 4 and seen["natural-again"]["sig"] not in sigs[1:] and not errs
            rec("colour modes: natural and the three false-colour styles each show a different picture, and switching back to natural leaves the false-colour pictures", ok, f"picture signatures {seen}; errors={errs[:1]}"); 
        except Exception as e:
            rec("colour modes", False, repr(e))

    # 7 3D view ----------------------------------------------------------------------------------------------------
    if want("3D"):
        try:
            page, errs, resp = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023"); scenes(page, 5)
            page.click("#view3dBtn")
            page.wait_for_function("!document.getElementById('v3d').hidden", timeout=60000); time.sleep(8)
            body = page.inner_text("body"); failed = "3D view failed" in body
            ter = [r for r in resp if "/data/terrain/B36-26" in r[0]]
            shot = page.locator("#v3d").screenshot(path=OUT + "/3d-aletsch.png")
            from PIL import Image, ImageStat
            im = Image.open(OUT + "/3d-aletsch.png").convert("L"); sd = ImageStat.Stat(im).stddev[0]
            rec("3D view: Aletsch opens, terrain file loads, canvas is not blank", (not failed) and ter and ter[0][1] == 200 and sd > 12 and not errs, f"terrain {ter[0][0].split('/')[-1] if ter else None} HTTP {ter[0][1] if ter else None}; canvas stddev {sd:.1f}; failed-message={failed}; errors={errs[:1]}"); page.close()
            src = open(ROOT + "/tests/test_site.py", encoding="utf-8").read()
            m = re.search(r'VIEWER_JS = """(.*?)"""', src, re.S).group(1)
            m = m.replace("async () => { const g = GLACIERS.find(g => g.id === 'breidamerkurjokull') || GLACIERS[0],", "async (gid) => { const g = GLACIERS.find(g => g.id === gid) || GLACIERS[0],")
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023")
            ids = page.evaluate("GLACIERS.map(g => g.id)"); out = {}
            for gid in ids:
                r = page.evaluate(m, gid); out[gid] = r if isinstance(r, str) else {"dist": round(r["dist"])}
            bad = {k: v for k, v in out.items() if isinstance(v, str)}
            rec("3D view: the compact terrain file of every Swiss glacier decodes and starts the viewer", not bad and len(out) == 10 and not errs, f"{len(out)} glaciers; failures={bad}; errors={errs[:1]}"); page.close()
        except Exception as e:
            rec("3D view", False, repr(e))

    # 8 single-image export ----------------------------------------------------------------------------------------
    if want("image export"):
        try:
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023"); scenes(page, 5); time.sleep(4)
            page.click("#videoBtn"); page.wait_for_function("document.body.classList.contains('pane-open')", timeout=15000)
            default = page.inner_text("#vsGo").strip(); page.click("#vkImage"); time.sleep(0.5)
            with page.expect_download(timeout=120000) as dl:
                page.click("#vsGo")
            path = OUT + "/export-image.jpg"; dl.value.save_as(path); b = open(path, "rb").read()
            from PIL import Image
            im = Image.open(io.BytesIO(b))
            rec("image export: Download image gives a JPEG of the chosen format", b[:3] == b"\xff\xd8\xff" and len(b) > 30000 and im.size in ((1920, 1080), (1080, 1920), (1080, 1350)) and not errs, f"{dl.value.suggested_filename}, {len(b)//1024} KB, {im.size}; the pane first offered {default!r}; errors={errs[:1]}"); page.close()
        except Exception as e:
            rec("image export", False, repr(e))

    # 9 animation export -------------------------------------------------------------------------------------------
    if want("animation export"):
        try:
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=timelapse&from=2022&to=2025"); scenes(page, 4); time.sleep(4)
            page.click("#videoBtn"); page.wait_for_function("document.body.classList.contains('pane-open')", timeout=15000)
            vk = page.locator("#vkVideo")
            if vk.is_disabled():
                rec("animation export: Animation is offered", False, "the Animation button is disabled in this browser")
            else:
                vk.click(); time.sleep(0.5)
                with page.expect_download(timeout=300000) as dl:
                    page.click("#vsGo")
                path = OUT + "/export-animation.mp4"; dl.value.save_as(path); b = open(path, "rb").read()
                ftyp = b[4:8] == b"ftyp"; i = b.find(b"stsd"); at = b.find(b"avc1", i + 1) if i > 0 else -1
                w = h = None
                if at > 0: o = at + 4 + 24; w, h = struct.unpack(">HH", b[o:o + 4])
                m = b.find(b"mvhd"); dur = None
                if m > 0:
                    ts, du = struct.unpack(">II", b[m + 16:m + 24]); dur = du / ts
                rec("animation export: Download video gives an H.264 MP4", ftyp and at > 0 and len(b) > 20000 and not errs, f"{dl.value.suggested_filename}, {len(b)//1024} KB, avc1 {w}x{h}, {dur and round(dur, 1)} s; errors={errs[:1]}")
            page.close()
        except Exception as e:
            rec("animation export", False, repr(e))

    # 10 gallery upload (live probes only) -------------------------------------------------------------------------
    if want("gallery"):
        try:
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023")
            r = page.evaluate("""async () => {
              const cfg = await (await fetch('/gallery/config')).json(), list = await fetch('/gallery/list'), lj = await list.json();
              const meta = JSON.stringify({type: 'still', fmt: 'wide', style: 'natural', glacier: 'aletsch', name: 'Grosser Aletsch', years: [2023], view: 'map'});
              const post = async (fields, size) => { const f = new FormData(); f.append('file', new Blob([new Uint8Array(size || 2000)], {type: 'image/jpeg'}), 'x.jpg'); for (const k in fields) f.append(k, fields[k]); const x = await fetch('/gallery/submit', {method: 'POST', body: f}); return {status: x.status, body: (await x.text()).slice(0, 120)}; };
              return {cfg, listStatus: list.status, listItems: (lj.items || []).length,
                      noToken: await post({meta}), badToken: await post({meta, token: 'not-a-real-token'}), tooBig: await post({meta, token: 't'}, 16 * 1000 * 1000)}; }""")
            ok = r["cfg"].get("open") is True and r["listStatus"] == 200 and r["noToken"]["status"] == 400 and r["badToken"]["status"] == 403 and r["tooBig"]["status"] == 413
            rec("gallery: config open, list public, uploads refused without a person check or when too big", ok, json.dumps({k: r[k] for k in ("cfg", "listStatus", "listItems", "noToken", "badToken", "tooBig")})); page.close()
            page, errs, _ = new_page(ctx); boot(page, BASE + "/switzerland/#g=aletsch&m=single&one=2023"); scenes(page, 5)
            page.click("#videoBtn"); page.wait_for_function("document.body.classList.contains('pane-open')", timeout=15000)
            info("gallery: share button in the export pane", f"#vsShare present={page.locator('#vsShare').count() == 1}, visible={page.locator('#vsShare').is_visible()}"); page.close()
        except Exception as e:
            rec("gallery", False, repr(e))

    # 11 size page -------------------------------------------------------------------------------------------------
    if want("size page"):
        try:
            page, errs, resp = new_page(ctx)
            page.goto(BASE + "/size", wait_until="load", timeout=60000)
            page.wait_for_selector("#gList", timeout=30000); time.sleep(4)
            rows = page.evaluate("document.querySelectorAll('#gList > *').length")
            about = page.evaluate("(() => { const d = document.querySelector('details.about'); return d ? d.innerText.slice(0, 60) : null; })()")
            ab = [r for r in resp if "about-static" in r[0]]
            page.click("#modeSwitch button[data-mode='3d']")
            page.wait_for_function("document.body.classList.contains('is-3d')", timeout=30000); time.sleep(10)
            fetched = page.evaluate("""async () => ({tall: (await fetch('data/tall-buildings.json')).status, lakes: (await fetch('data/lake-depth/index.json')).status})""")
            ok = rows >= 10 and about and "Loading" not in about and not errs
            rec("size page: ten glaciers listed, About block loads, 3D mode switches on", ok, f"list rows={rows}; about starts {about!r}; about-static requests={[(r[1]) for r in ab]}; data files={fetched}; errors={errs[:2]}")
            page.screenshot(path=OUT + "/size-3d.png")
            from PIL import Image, ImageStat
            sd = ImageStat.Stat(Image.open(OUT + "/size-3d.png").convert("L")).stddev[0]
            rec("size page: 3D canvas is not blank", sd > 10, f"stddev {sd:.1f}"); page.close()
        except Exception as e:
            rec("size page", False, repr(e))

    br.close()

json.dump(res, open(OUT + "/results.json", "w"), indent=1)
print("\nresults in " + OUT + "/results.json\nSUMMARY: %d pass, %d fail, %d info" % (sum(1 for r in res if r["ok"] is True), sum(1 for r in res if r["ok"] is False), sum(1 for r in res if r["ok"] is None)))
sys.exit(1 if any(r["ok"] is False for r in res) else 0)
