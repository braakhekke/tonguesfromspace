#!/usr/bin/env python3
"""Collects the files of the site into one folder (the deploy workflow publishes it) and makes them cache well.

    python3 scripts/build_site.py _site            # relay address from the environment variable CDSE_RELAY_URL

What it does, besides copying:

1. Content hashes. The data files get the first 10 characters of their SHA-256 in the name
   (glaciers.js -> glaciers.3fa9c1d07b.js), so a browser can keep a file as long as its name is the same and a data update
   renames only the files that changed. The map from the plain name to the hashed name goes into config.js
   (window.TFS_CONFIG.assets); index.html asks for it with asset('<plain name>') and the <script src> and <link href>
   in the HTML files are rewritten here. Without the map (local use with serve.py) the plain names work as before.
   Hashed: glaciers.js, style.css, js/*.js (the page's code, one file per section), thickness.js, sightline.js, scenes.json, cloudmasks.json, photos.json, demchange/*.json, teaser/*.mp4|webm|jpg (the film of the first visit, made by scripts/make_teaser.py).
   A one-line change in the code therefore renames, and re-downloads, only the file it is in.
   Not hashed: index.html, gallery.html, config.js, terrain/manifest.json (the entry points that name the hashed files;
   the terrain files themselves are hashed by build_terrain_bundle.py).
2. glaciers.js is split. The repository keeps the complete file (the build scripts for terrain, ice change and cloud masks read
   it), the site gets a core file (statistics, 1850 outlines for the overview, a pointer to each glacier's 2023 outline)
   and one small file per glacier with its 2023 outline, which the page loads when that glacier is chosen (loadOutline in index.html).
3. config.js with the relay address and the map of hashed names. <!--relay-preconnect--> in index.html becomes
   a preconnect link to the relay (or nothing if no address is set).

Standard library only. Every replacement in the HTML must find its target, otherwise the script stops: a deploy with
a broken page is worse than no deploy.
"""
import hashlib, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HASH_LEN = 10

HTML_FILES = ["index.html", "gallery.html"]
PLAIN_FILES = ["pages.css", "preview.jpg"]                 # copied as they are (missing ones are skipped)
PLAIN_IMAGES = ["images/foryourice.jpg", "images/preview-social.jpg"]
HASHED_FILES = ["style.css", "thickness.js", "sightline.js", "scenes.json", "cloudmasks.json", "photos.json"]      # plus js/*.js, demchange/*.json and glaciers.js (split)


def digest(data):
    return hashlib.sha256(data).hexdigest()[:HASH_LEN]


def hashed_name(path, data):
    stem, ext = os.path.splitext(path)
    return f"{stem}.{digest(data)}{ext}"


def write(out, rel, data):
    dest = os.path.join(out, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)


def read(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return f.read()


def exists(rel):
    return os.path.isfile(os.path.join(ROOT, rel))


def split_glaciers(out, assets):
    """glaciers.js -> core file + one 2023 outline file per glacier. Returns False if there is no glaciers.js."""
    if not exists("glaciers.js"):
        print("glaciers.js not available yet: the page uses its built-in list")
        return False
    text = read("glaciers.js").decode("utf-8")
    start, end = text.index("{"), text.rindex("}") + 1
    head, data = text[:start], json.loads(text[start:end])
    for g in data["glaciers"]:
        outline = g.pop("outline", None)
        if outline is None:
            continue
        body = json.dumps(outline, separators=(",", ":"), ensure_ascii=False)
        gid = g["id"]
        payload = f'(window.GLACIER_OUTLINES=window.GLACIER_OUTLINES||{{}})[{json.dumps(gid)}]={body};\n'.encode("utf-8")
        rel = hashed_name(f"outlines/{gid}.js", payload)
        write(out, rel, payload)
        g["outline_file"] = rel
    core = (head + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n").encode("utf-8")
    rel = hashed_name("glaciers.js", core)
    write(out, rel, core)
    assets["glaciers.js"] = rel
    print(f"glaciers.js: {len(text) / 1024:.0f} kB -> core {len(core) / 1024:.0f} kB + {sum(1 for g in data['glaciers'] if 'outline_file' in g)} outline files")
    return True


def rewrite_html(out, assets, relay):
    for name in HTML_FILES:
        if not exists(name):
            continue
        html = read(name).decode("utf-8")
        for plain, hashed in assets.items():
            pattern = re.compile(r'((?:src|href)=")' + re.escape(plain) + r'(")')
            html, n = pattern.subn(r"\g<1>" + hashed + r"\g<2>", html)
            if n:
                print(f"{name}: {plain} -> {hashed} ({n}x)")
        if name == "index.html":
            marker = "<!--relay-preconnect-->"
            if marker not in html:
                sys.exit("index.html lost the marker <!--relay-preconnect-->")
            tag = f'<link rel="preconnect" href="{relay}" crossorigin>' if relay.startswith("http") else ""
            html = html.replace(marker, tag)
            if "glaciers.js" in assets and assets["glaciers.js"] not in html:
                sys.exit("index.html does not load glaciers.js any more: nothing was rewritten")
        write(out, name, html.encode("utf-8"))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = os.path.abspath(sys.argv[1])
    relay = os.environ.get("CDSE_RELAY_URL", "").strip()
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    assets = {}

    for name in PLAIN_FILES + PLAIN_IMAGES:
        if exists(name):
            write(out, name, read(name))
    fonts = os.path.join(ROOT, "fonts")
    for f in sorted(os.listdir(fonts)):
        if f.endswith(".woff2") or f == "OFL.txt":
            write(out, f"fonts/{f}", read(f"fonts/{f}"))

    split_glaciers(out, assets)

    for name in HASHED_FILES:
        if exists(name):
            data = read(name)
            rel = hashed_name(name, data)
            write(out, rel, data)
            assets[name] = rel
        else:
            print(f"no {name}: the matching feature shows nothing")
    code = os.path.join(ROOT, "js")
    for f in sorted(os.listdir(code)):
        if f.endswith(".js"):
            data = read(f"js/{f}")
            rel = hashed_name(f"js/{f}", data)
            write(out, rel, data)
            assets[f"js/{f}"] = rel
    dem = os.path.join(ROOT, "demchange")
    if os.path.isdir(dem):
        for f in sorted(os.listdir(dem)):
            if f.endswith(".json"):
                data = read(f"demchange/{f}")
                rel = hashed_name(f"demchange/{f}", data)
                write(out, rel, data)
                assets[f"demchange/{f}"] = rel
    else:
        print("no demchange folder: the 3D view keeps the ice surface of the terrain tiles for every year")
    film = os.path.join(ROOT, "teaser")      # the teaser film and its posters (not teaser/work, the recording's scratch folder)
    if os.path.isdir(film):
        for f in sorted(os.listdir(film)):
            if f.endswith((".mp4", ".webm", ".jpg")):
                data = read(f"teaser/{f}")
                rel = hashed_name(f"teaser/{f}", data)
                write(out, rel, data)
                assets[f"teaser/{f}"] = rel
    else:
        print("no teaser folder: the first visit starts without the film")
    terrain = os.path.join(ROOT, "terrain")
    if os.path.isdir(terrain):
        shutil.copytree(terrain, os.path.join(out, "terrain"))
    else:
        print("no terrain folder: the 3D view builds the terrain from the terrain tiles, which is slower")

    rewrite_html(out, assets, relay)
    config = "window.TFS_CONFIG = " + json.dumps({"relay": relay, "assets": assets}, separators=(",", ":")) + ";\n"
    write(out, "config.js", config.encode("utf-8"))
    write(out, ".nojekyll", b"")
    print(f"{len(assets)} hashed files; relay: {relay or '(none)'}")


if __name__ == "__main__":
    main()
