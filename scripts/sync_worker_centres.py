#!/usr/bin/env python3
"""Writes the centres of the picture boxes of all glaciers of the ice-cap regions into worker/worker.js (the block between /*centres:begin*/ and /*centres:end*/).

The Worker only serves requests whose box lies near a glacier of one of the regions (Iceland: Vatnajokull and the rest of Iceland, mainland Norway, Svalbard). Run it after build_vatnajokull.py or
build_regions.py changed a data file, then paste worker/worker.js into the Cloudflare dashboard (Worker -> Edit code -> Deploy). Standard library only.
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {"is": ["vatnajokull.js", "iceland.js"], "no": ["norway.js"], "sj": ["svalbard.js"]}


def outlets(name):
    t = open(os.path.join(ROOT, "data", name), encoding="utf-8").read()
    return json.loads(t[t.index("{"):t.rindex("}") + 1])["outlets"]


def main():
    lines = []
    for region, names in FILES.items():
        cs = []
        for n in names:
            if not os.path.exists(os.path.join(ROOT, "data", n)): continue
            for o in outlets(n):
                cs.append(f"[{o['lon']}, {o['lat']}]")
                cs += [f"[{sb['tip'][1]}, {sb['tip'][0]}]" for sb in (o.get("subs") or []) if sb.get("tip")]      # the outlets of an ice cap have a 3D strip of their own, with pictures asked for around their tips
        lines.append(f"{region}: [{', '.join(cs)}]")
    block = "/*centres:begin*/\nconst CENTRES = {" + ",\n  ".join(lines) + "};          // [lon, lat] of the picture boxes of the glaciers of each region (scripts/sync_worker_centres.py)\n/*centres:end*/"
    p = os.path.join(ROOT, "worker", "worker.js")
    s = open(p, encoding="utf-8").read()
    s2, n = re.subn(r"/\*centres:begin\*/.*?/\*centres:end\*/", lambda m: block, s, flags=re.S)
    if n != 1:
        raise SystemExit("worker.js lost the markers /*centres:begin*/ and /*centres:end*/")
    open(p, "w", encoding="utf-8").write(s2)
    print("worker/worker.js: " + ", ".join(f"{r} {l.count('[') - 1}" for r, l in zip(FILES, lines)) + " centres")


if __name__ == "__main__":
    main()
