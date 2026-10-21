#!/usr/bin/env python3
"""Health check of the PUBLIC site and its relay. Run weekly by .github/workflows/health.yml, or by hand:

    pip install -r tests/requirements.txt && python3 -m playwright install chromium
    python3 tests/health.py                                  # https://tonguesfromspace.org/
    TFS_LIVE_URL=http://localhost:8000/ python3 tests/health.py

It looks at the site the way a visitor's browser does and stops with exit code 1 (the workflow then opens an issue) if something is broken:

 1. the page and config.js are reachable, config.js names a relay and the hashed data files
 2. every file named there answers (glaciers core, 2023 outline files, data, scenes, masks, ice change) and the terrain manifest's files exist
 3. glaciers.js holds the ten glaciers; scenes.json has no empty glacier
 4. the relay answers its ping (/cdse/ping)
 5. in a real browser: a link to a glacier opens without a script error, the scene search finds the year, and the satellite picture of that year
    (relay -> cache or Copernicus) arrives and decodes. Past years are in the relay's cache, so this normally spends no Copernicus units.

Needs only the standard library for 1 to 4; Playwright for 5 (skipped with a warning if it is not installed and TFS_LIVE_SKIP_BROWSER=1).
"""
import json, os, re, sys, time, urllib.error, urllib.request

SITE = os.environ.get("TFS_LIVE_URL", "https://tonguesfromspace.org/").rstrip("/") + "/"
YEAR = int(os.environ.get("TFS_LIVE_YEAR", "2023"))
results = []


def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "tonguesfromspace-health-check"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


state = {}


def check(name, needs=()):
    """Registers and runs a check. `needs`: keys of `state` that earlier checks must have set; without them the check is skipped (its cause is reported once, by the earlier check)."""
    def wrap(fn):
        t0 = time.time()
        if any(k not in state for k in needs):
            results.append((name, None, "skipped (an earlier check failed)", 0.0))
            return fn
        try:
            note = fn()
            results.append((name, True, note or "", time.time() - t0))
        except Exception as e:      # any failure is a finding, with its reason
            results.append((name, False, f"{type(e).__name__}: {e}", time.time() - t0))
        return fn
    return wrap


@check("page is reachable")
def _():
    status, body = get(SITE)
    text = body.decode("utf-8", "replace")
    assert status == 200 and "Tongues from Space" in text, f"HTTP {status}, title missing"
    state["html"] = text
    return f"{len(body) // 1024} kB"


@check("config.js names the relay and the hashed data files")
def _():
    status, body = get(SITE + "config.js")
    m = re.search(r"window\.TFS_CONFIG\s*=\s*(\{.*\});?\s*$", body.decode(), re.S)
    assert m, "config.js has an unexpected shape"
    cfg = json.loads(m.group(1))
    assert cfg.get("relay", "").startswith("http"), "no relay address (CDSE_RELAY_URL was empty at the last deploy)"
    assert cfg.get("assets"), "no map of data files: the deploy ran without scripts/build_site.py"
    state["cfg"] = cfg
    return f"{len(cfg['assets'])} data files"


@check("every data file named in config.js answers", needs=["cfg", "html"])
def _():
    missing = []
    for plain, hashed in state["cfg"]["assets"].items():
        try:
            status, body = get(SITE + hashed)
            if status != 200 or not body:
                missing.append(hashed)
        except Exception:
            missing.append(hashed)
    assert not missing, "missing: " + ", ".join(missing)
    # the tag of the region's data file is written by js/00-regions.js, so the name is in the page or in one of its scripts
    text = state["html"] + "".join(get(SITE + m)[1].decode("utf-8", "replace") for m in dict.fromkeys(re.findall(r'js/00-regions[^"\']*\.js', state["html"])))
    assert state["cfg"]["assets"]["data/glaciers.js"] in text, "neither index.html nor js/00-regions.js loads the glaciers.js named in config.js (a stale page against a new config?)"
    return f"{len(state['cfg']['assets'])} files"


@check("glaciers.js holds ten glaciers with their outline files", needs=["cfg"])
def _():
    text = get(SITE + state["cfg"]["assets"]["data/glaciers.js"])[1].decode("utf-8")
    data = json.loads(text[text.index("{"):text.rindex("}") + 1])
    assert len(data["glaciers"]) == 10, f"{len(data['glaciers'])} glaciers"
    for g in data["glaciers"]:
        assert g.get("oldest", {}).get("outline"), f"{g['id']}: no 1850 outline"
        assert get(SITE + g["outline_file"])[0] == 200, f"{g['id']}: outline file missing"
    state["ids"] = [g["id"] for g in data["glaciers"]]
    return f"generated {data.get('generated')}"


@check("scenes.json has scenes for every glacier", needs=["cfg", "ids"])
def _():
    scenes = json.loads(get(SITE + state["cfg"]["assets"]["data/scenes.json"])[1])
    for gid in state["ids"]:
        picks = scenes["glaciers"].get(gid, {}).get("picks", {})
        assert picks, f"{gid}: no chosen scenes"
    return f"{sum(len(v['picks']) for v in scenes['glaciers'].values())} scenes"


@check("terrain files of the 3D view exist", needs=["ids"])
def _():
    manifest = json.loads(get(SITE + "data/terrain/manifest.json")[1])
    for gid in state["ids"]:
        assert gid in manifest, f"{gid}: not in the terrain manifest"
        assert get(SITE + "data/terrain/" + manifest[gid])[0] == 200, f"{gid}: terrain file missing"
    return f"{len(manifest)} files"


@check("relay answers its ping", needs=["cfg"])
def _():
    status, body = get(state["cfg"]["relay"].rstrip("/") + "/cdse/ping")
    assert status == 200 and json.loads(body).get("relay") is True, body[:200]
    return json.loads(body)


def browser_check():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 860})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(SITE, wait_until="load")
        gid = page.evaluate("GLACIERS[0].id")      # the id used in links (not the inventory id)
        page.goto(f"{SITE}#g={gid}&m=single&one={YEAR}", wait_until="load")
        page.wait_for_load_state("load")      # the page restarts itself when the hash changes (hashchange in 12-boot.js)
        page.wait_for_function("typeof state !== 'undefined' && state.checked === true", timeout=90000)      # the scene search is done
        found = page.evaluate("y => !!(state.available && state.available[y])", YEAR)
        assert found, f"the scene search found no scene for {YEAR}: " + page.inner_text("#status")
        page.wait_for_function("() => [...document.querySelectorAll('img.scene-img')].some(i => i.complete && i.naturalWidth > 100)", timeout=120000)      # the picture came through the relay
        status = page.inner_text("#status")
        browser.close()
        assert not errors, "script errors: " + "; ".join(errors)
        return status


if os.environ.get("TFS_LIVE_SKIP_BROWSER") != "1":
    check("a real browser opens a glacier and gets its satellite picture", needs=["ids", "cfg"])(browser_check)

width = max(len(n) for n, *_ in results)
for name, ok, note, secs in results:
    print(f"{'ok  ' if ok else 'skip' if ok is None else 'FAIL'} {name.ljust(width)}  {note}  ({secs:.1f} s)")
failed = [n for n, ok, *_ in results if ok is False]
print(("\nALL FINE" if not failed else f"\n{len(failed)} OF {len(results)} CHECKS FAILED: " + "; ".join(failed)) + f"  [{SITE}]")
sys.exit(1 if failed else 0)
