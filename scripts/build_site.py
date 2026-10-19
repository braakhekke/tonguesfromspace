#!/usr/bin/env python3
"""Collects the files of the site into one folder (the deploy workflow publishes it) and makes them cache well.

    python3 scripts/build_site.py _site            # relay address from the environment variable CDSE_RELAY_URL

What it does, besides copying:

1. Content hashes. The data files get the first 10 characters of their SHA-256 in the name
   (data/glaciers.js -> data/glaciers.3fa9c1d07b.js; the site keeps the folder data/ of the repository), so a browser can keep a file as long as its name is the same and a data update
   renames only the files that changed. The map from the plain name to the hashed name goes into config.js
   (window.TFS_CONFIG.assets); index.html asks for it with asset('<plain name>') and the <script src> and <link href>
   in the HTML files are rewritten here. Without the map (local use with serve.py) the plain names work as before.
   Hashed: css/style.css, js/*.js (the page's code, one file per section), data/glaciers.js, thickness.js, sightline.js, scenes.json, cloudmasks.json, photos.json, demchange/*.json, teaser/*.mp4|webm|jpg (the film of the first visit, made by scripts/make_teaser.py).
   A one-line change in the code therefore renames, and re-downloads, only the file it is in.
   Not hashed: index.html, gallery.html, size.html, config.js, data/terrain/manifest.json (the entry points that name the hashed files;
   the terrain files themselves are hashed by build_terrain_bundle.py).
2. glaciers.js is split. The repository keeps the complete file (the build scripts for terrain, ice change and cloud masks read
   it), the site gets a core file (statistics, 1850 outlines for the overview, a pointer to each glacier's 2023 outline)
   and one small file per glacier with its 2023 outline, which the page loads when that glacier is chosen (loadOutline in index.html).
   The region data files (data/glaciers.js for Switzerland, data/vatnajokull.js for Iceland) are named in js/00-regions.js, which writes the tag of the chosen region's file into the
   page; there the plain names (in quotes) are replaced by the hashed ones before that file is hashed itself.
3. A page for each region that has an address of its own (js/00-regions.js, `path`): /iceland/vatnajokull/ and /iceland/ are copies of index.html with the title, description, link-preview
   texts and image, address and canonical link of that region, and every relative file name made absolute (the copies sit two folders deeper; the code adds the same prefix to the
   names it fetches, SITE_BASE in js/00-regions.js). Search engines and link previews do not see a #r= in a link, so this is what gives Iceland its own result and its own preview.
4. config.js with the relay address and the map of hashed names. <!--relay-preconnect--> in index.html becomes
   a preconnect link to the relay (or nothing if no address is set).

Standard library only. Every replacement in the HTML must find its target, otherwise the script stops: a deploy with
a broken page is worse than no deploy.
"""
import hashlib, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HASH_LEN = 10

HTML_FILES = ["index.html", "gallery.html", "size.html"]
PUBLISH_ICELAND = os.environ.get("PUBLISH_ICELAND", "").strip() == "1"      # repository variable PUBLISH_ICELAND=1 shows Iceland on the public site; otherwise no Iceland pages, sitemap line or menu entry
PLAIN_FILES = ["css/pages.css", "preview.jpg", "sitemap.xml"]                 # copied as they are (missing ones are skipped)
PLAIN_IMAGES = ["images/foryourice.jpg", "images/preview-social.jpg", "images/preview-iceland.jpg"]
HASHED_FILES = ["css/style.css", "data/thickness.js", "data/sightline.js", "data/scenes.json", "data/cloudmasks.json", "data/photos.json", "data/streetview.json", "data/vatnajokull.js", "data/trails-is.js"]      # plus js/*.js, data/demchange/*.json and data/glaciers.js (split)


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
    if not exists("data/glaciers.js"):
        print("data/glaciers.js not available yet: the page uses its built-in list")
        return False
    text = read("data/glaciers.js").decode("utf-8")
    start, end = text.index("{"), text.rindex("}") + 1
    head, data = text[:start], json.loads(text[start:end])
    for g in data["glaciers"]:
        outline = g.pop("outline", None)
        if outline is None:
            continue
        body = json.dumps(outline, separators=(",", ":"), ensure_ascii=False)
        gid = g["id"]
        payload = f'(window.GLACIER_OUTLINES=window.GLACIER_OUTLINES||{{}})[{json.dumps(gid)}]={body};\n'.encode("utf-8")
        rel = hashed_name(f"data/outlines/{gid}.js", payload)
        write(out, rel, payload)
        g["outline_file"] = rel
    core = (head + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n").encode("utf-8")
    rel = hashed_name("data/glaciers.js", core)
    write(out, rel, core)
    assets["data/glaciers.js"] = rel
    print(f"glaciers.js: {len(text) / 1024:.0f} kB -> core {len(core) / 1024:.0f} kB + {sum(1 for g in data['glaciers'] if 'outline_file' in g)} outline files")
    return True


SITE = "https://tonguesfromspace.org"
# What differs on the page of a region with its own address. Keys are the texts of index.html that are replaced (each must be found).
REGION_PAGES = [
    {"path": "iceland/vatnajokull", "canonical": "iceland/vatnajokull/",
     "title": "Tongues from Space | Vatnajökull, Iceland",
     "description": "Explore the outlet glaciers of Vatnajökull, Iceland’s largest ice cap, through Sentinel-2 satellite imagery since 2016, 3D terrain and visualizations of glacier change. Compare, create and share your visuals.",
     "og_title": "Tongues from Space - Vatnajökull, Iceland",
     "og_description": "Watch the outlet glaciers of Vatnajökull retreat: satellite images since 2016, 3D terrain from ArcticDEM strips and outlines from the Little Ice Age maximum to today.",
     "image": "images/preview-iceland.jpg", "image_w": "1200", "image_h": "630",
     "image_alt": "Tongues from Space - Vatnajökull: Breiðamerkurjökull and its lagoon Jökulsárlón in a Sentinel-2 satellite picture, with the glacier outline of about 1890"},
    {"path": "iceland", "canonical": "iceland/vatnajokull/", "same_as": "iceland/vatnajokull"},      # /iceland/ shows the same page; search engines are told the long address is the real one
]


def region_page(html, page):
    """index.html (already hashed) -> the page of one region: its own texts, and root-absolute file names."""
    def swap(old, new):
        nonlocal html
        if html.count(old) != 1:
            sys.exit(f"index.html: {old[:60]!r} found {html.count(old)} times, expected once (region page {page['path']})")
        html = html.replace(old, new)
    src = next(p for p in REGION_PAGES if p["path"] == page.get("same_as", page["path"]))
    url = f"{SITE}/{page['canonical']}"
    swap("<title>Tongues from Space | Interactive Glaciers</title>", f"<title>{src['title']}</title>")
    swap('<meta name="description" content="Explore glaciers through satellite imagery, interactive 3D maps and visualizations of glacier change: the ten largest Swiss glaciers and Iceland’s Vatnajökull. Compare, create and share your visuals.">',
         f'<meta name="description" content="{src["description"]}">')
    swap('<meta property="og:title" content="Tongues from Space - Interactive Glaciers">', f'<meta property="og:title" content="{src["og_title"]}">')
    swap('<meta property="og:description" content="Watch glacier tongues retreat: Sentinel-2 satellite images since 2016 and 3D terrain for the ten largest Swiss glaciers and Iceland’s Vatnajökull.">',
         f'<meta property="og:description" content="{src["og_description"]}">')
    swap('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="589">',
         f'<meta property="og:image:width" content="{src["image_w"]}">\n<meta property="og:image:height" content="{src["image_h"]}">')
    swap('content="Tongues from Space: the dashboard with a satellite comparison slider of the Grosser Aletsch glacier, 2016 and 2024, and glacier figures"', f'content="{src["image_alt"]}"')
    swap('<meta property="og:url" content="https://tonguesfromspace.org/">', f'<meta property="og:url" content="{url}">')
    swap('<link rel="canonical" href="https://tonguesfromspace.org/">', f'<link rel="canonical" href="{url}">')
    swap('<meta property="og:image" content="https://tonguesfromspace.org/images/preview-social.jpg">', f'<meta property="og:image" content="{SITE}/{src["image"]}">')
    swap('<meta name="twitter:image" content="https://tonguesfromspace.org/images/preview-social.jpg">', f'<meta name="twitter:image" content="{SITE}/{src["image"]}">')
    # relative file names in attributes -> from the root (not #fragments, not full addresses, not data: URLs)
    html, n = re.subn(r'((?:src|href)=")(?!https?:|data:|mailto:|#|/)([^"]+)(")', r"\g<1>/\g<2>\g<3>", html)
    print(f"{page['path']}/index.html: {n} relative names made absolute")
    return html


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
        write(out, name, html.encode("utf-8"))
        if name == "index.html":
            for page in (REGION_PAGES if PUBLISH_ICELAND else []):
                write(out, f"{page['path']}/index.html", region_page(html, page).encode("utf-8"))


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
            data = read(name)
            if name == "sitemap.xml" and not PUBLISH_ICELAND:
                data = re.sub(rb"\s*<url>\s*<loc>[^<]*/iceland/[^<]*</loc>\s*</url>", b"", data)
            write(out, name, data)
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
            if f == "00-regions.js":      # the data files of the regions: their hashed names go into the file that loads them
                text = data.decode("utf-8")
                for plain in ("data/glaciers.js", "data/vatnajokull.js"):
                    if plain in assets:
                        if f"'{plain}'" not in text:
                            sys.exit(f"js/00-regions.js does not name '{plain}' any more: nothing was rewritten")
                        text = text.replace(f"'{plain}'", f"'{assets[plain]}'")
                if not PUBLISH_ICELAND:      # Iceland stays off the public site: no menu entry, no address (its data files are copied, but nothing links to them)
                    if "/*hidden-regions*/" not in text:
                        sys.exit("js/00-regions.js lost the marker /*hidden-regions*/")
                    text = text.replace("/*hidden-regions*/", "'is-vatnajokull'")
                data = text.encode("utf-8")
            rel = hashed_name(f"js/{f}", data)
            write(out, rel, data)
            assets[f"js/{f}"] = rel
    dem = os.path.join(ROOT, "data", "demchange")
    if os.path.isdir(dem):
        for f in sorted(os.listdir(dem)):
            if f.endswith(".json"):
                data = read(f"data/demchange/{f}")
                rel = hashed_name(f"data/demchange/{f}", data)
                write(out, rel, data)
                assets[f"data/demchange/{f}"] = rel
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
    old = os.path.join(ROOT, "data", "oldest")      # the oldest aerial pictures (Iceland): picture and meta file, hashed
    if os.path.isdir(old):
        for f in sorted(os.listdir(old)):
            data = read(f"data/oldest/{f}")
            rel = hashed_name(f"data/oldest/{f}", data)
            write(out, rel, data)
            assets[f"data/oldest/{f}"] = rel
    ls = os.path.join(ROOT, "data", "landsat")      # Landsat pictures before 2016 (Iceland): one meta file per outlet and one folder of yearly pictures, hashed
    if os.path.isdir(ls):
        for dirpath, _, files in os.walk(ls):
            for f in sorted(files):
                if not f.endswith((".json", ".jpg")): continue
                relp = os.path.relpath(os.path.join(dirpath, f), ROOT).replace(os.sep, "/")
                data = read(relp)
                rel = hashed_name(relp, data)
                write(out, rel, data)
                assets[relp] = rel
    terrain = os.path.join(ROOT, "data", "terrain")
    if os.path.isdir(terrain):
        shutil.copytree(terrain, os.path.join(out, "data", "terrain"))
    else:
        print("no terrain folder: the 3D view builds the terrain from the terrain tiles, which is slower")

    rewrite_html(out, assets, relay)
    config = "window.TFS_CONFIG = " + json.dumps({"relay": relay, "streetViewKey": os.environ.get("STREETVIEW_EMBED_KEY", "").strip(), "assets": assets}, separators=(",", ":")) + ";\n"
    write(out, "config.js", config.encode("utf-8"))
    write(out, ".nojekyll", b"")
    print(f"{len(assets)} hashed files; relay: {relay or '(none)'}")


if __name__ == "__main__":
    main()
