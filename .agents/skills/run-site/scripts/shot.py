#!/usr/bin/env python3
"""Open a page of the local site in a headless browser, as a visitor would see it, press what you name, and save a screenshot.

    python3 .claude/skills/run-site/scripts/shot.py '/index.html#g=aletsch&m=compare&a=2016&b=2026' --out DIR/compare.png
        --phone                     a phone-size window (390 x 844, touch)
        --size 1440x900             another window size
        --lang de                   the same page under /de/ (or fr)
        --scenes 5                  explorer: wait until 5 years have a scene (the relay answers; an uncached search costs Copernicus requests)
        --click '#styleFalse1'      press a control; repeat for several, in order
        --eval 'state.mode'         print a value of the page (the sections' names are on window); repeat for several
        --wait 4000                 milliseconds to wait before the picture is taken (default 1500)
        --full                      the whole page, not only the window
        --chrome                    real Google Chrome instead of the bundled Chromium (the video export needs it: H.264)
        --first-visit               a first visit: the film and the guide are not marked as seen
        --base http://localhost:8011   a server on another port

Prints the address, title, language, the explorer's state (which glacier really opened, mode, years with a scene, the status line) and every
error of the page. Exit 1 when the page did not start or had errors. Needs a running server (python3 scripts/serve.py --no-browser) and Playwright.
"""
import argparse, json, os, sys, tempfile, urllib.error, urllib.request

IGNORED = ("Failed to load resource", "net::ERR")      # blocked or missing tiles: the same two the tests ignore
BOOTED = "typeof L !== 'undefined' && document.getElementById('story') && document.getElementById('story').dataset.glacier"
STATE = """() => { try { const av = Object.keys(state.available || {}).filter(k => state.available[k]), g = currentGlacier();
  return { glacier: g && g.id, mode: state.mode, style: state.style, searched: !!state.checked, years_with_scene: av.length, first: av[0] || null, last: av[av.length - 1] || null,
           status: ((document.getElementById('status') || {}).textContent || '').trim().slice(0, 140) }; } catch (e) { return { error: String(e) }; } }"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page"); ap.add_argument("--out"); ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--phone", action="store_true"); ap.add_argument("--size"); ap.add_argument("--lang", choices=["de", "fr"])
    ap.add_argument("--scenes", type=int, default=0); ap.add_argument("--click", action="append", default=[]); ap.add_argument("--eval", action="append", default=[], dest="evals")
    ap.add_argument("--wait", type=int, default=1500); ap.add_argument("--full", action="store_true"); ap.add_argument("--chrome", action="store_true")
    ap.add_argument("--first-visit", action="store_true"); ap.add_argument("--timeout", type=int, default=60, help="seconds for the page to start")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    try:
        urllib.request.urlopen(base + "/cdse/ping", timeout=6).read()
    except urllib.error.HTTPError:
        print("note: the server at %s is not scripts/serve.py (no /cdse/ping): /de/ and /fr/ addresses and /switzerland/ will not work" % base)
    except Exception as e:
        sys.exit("no server at %s (%s). Start it:  python3 scripts/serve.py --no-browser" % (base, e))
    url = a.page if a.page.startswith("http") else base + ("/" + a.lang if a.lang else "") + "/" + a.page.lstrip("/")
    w, h = (390, 844) if a.phone else (1280, 860)
    if a.size: w, h = (int(x) for x in a.size.lower().split("x"))
    out = a.out or os.path.join(tempfile.mkdtemp(prefix="tfs-shot-"), "shot.png")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright is missing: pip install -r tests/requirements.txt && python3 -m playwright install chromium")
    errors, bad, notes = [], [], []
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome", headless=True) if a.chrome else p.chromium.launch()
        ctx = br.new_context(viewport={"width": w, "height": h}, has_touch=a.phone, accept_downloads=True)
        ctx.add_init_script("window.TFS_EXPOSE = true")      # js/devtools.js: state, currentGlacier() ... readable on window
        ctx.add_init_script("try{if(!localStorage.getItem('glacierPrefs'))localStorage.setItem('glacierPrefs','{\"hideR\":false}')}catch(e){}")      # the right panel open, as in the tests
        if not a.first_visit:      # the film and the guide's card of a first visit would cover the page
            ctx.add_init_script("try{localStorage.setItem('tfs-teaser-seen','1');localStorage.setItem('tfs-teaser','1');if(!localStorage.getItem('tfs-guide'))localStorage.setItem('tfs-guide','{\"seen\":true}')}catch(e){}")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:300]))
        page.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORED) and errors.append("console: " + m.text[:300]))
        page.on("response", lambda r: r.status >= 400 and r.url.startswith(base) and bad.append("%d %s" % (r.status, r.url[len(base):][:120])))
        try:
            page.goto(url, wait_until="load", timeout=a.timeout * 1000)
        except Exception as e:
            br.close(); sys.exit("the page did not load: %s" % str(e)[:300])
        explorer = page.evaluate("!!document.getElementById('modeCompare')")      # only the explorer has the mode buttons (size.html has a #story too)
        if explorer:
            try: page.wait_for_function(BOOTED, timeout=a.timeout * 1000)
            except Exception: errors.append("the explorer did not start within %d s (no glacier in #story)" % a.timeout)
            if a.scenes:
                try: page.wait_for_function("n => Object.keys(state.available).filter(k => state.available[k]).length >= n", arg=a.scenes, timeout=120000)
                except Exception: errors.append("fewer than %d years got a scene within 120 s (see the status line)" % a.scenes)
        for sel in a.click:
            try:
                page.locator(sel).first.click(timeout=5000)
            except Exception:
                try:      # covered by a card or off-screen: press it in the page, and say so
                    if page.evaluate("s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }", sel): notes.append("%s was covered or off-screen: pressed in the page, a visitor could not have clicked it there" % sel)
                    else: errors.append("nothing matches %s" % sel)
                except Exception as e: errors.append("click %s failed: %s" % (sel, str(e)[:160]))
            page.wait_for_timeout(700)
        page.wait_for_timeout(a.wait)
        info = page.evaluate("() => ({ url: location.href, title: document.title, lang: document.documentElement.lang, wide: document.documentElement.scrollWidth, win: innerWidth })")
        print("address  %s\ntitle    %s\nlanguage %s   window %d x %d" % (info["url"], info["title"], info["lang"] or "-", w, h))
        if info["wide"] > info["win"] + 1: notes.append("the page is %d px wide in a %d px window: it scrolls sideways" % (info["wide"], info["win"]))
        if explorer: print("explorer " + json.dumps(page.evaluate(STATE), ensure_ascii=False))
        for ex in a.evals:
            try: print("eval     %s -> %s" % (ex, json.dumps(page.evaluate(ex), ensure_ascii=False, default=str)[:600]))
            except Exception as e: errors.append("eval %s failed: %s" % (ex, str(e)[:200]))
        page.screenshot(path=out, full_page=a.full)
        br.close()
    print("picture  %s" % out)
    for n in notes: print("note     " + n)
    for b in sorted(set(bad))[:12]: print("answered " + b)
    for e in errors: print("ERROR    " + e)
    print("errors: %d" % len(errors))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
