#!/usr/bin/env python3
"""Local server for the owner-facing onboarding flow (docs/ONBOARD_RUNBOOK.md).

    python3 scripts/onboard_server.py            # http://localhost:8010/<glacier-id>

Serves scripts/tools/onboard-viewer.html and, for a session folder experiments/onboard/<id>/ (local, gitignored), its files and its
session.json (step states and button presses, with times). It is the only thing the buttons write; Claude reads session.json when the
owner types the continue word. Nothing here is public: it listens on 127.0.0.1 only.
"""
import json, os, re, sys, time
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESS = os.path.join(ROOT, "experiments", "onboard")
VIEWER = os.path.join(ROOT, "scripts", "tools", "onboard-viewer.html")
SCENES = os.path.join(ROOT, "scripts", "tools", "onboard-scenes.html")
COVERAGE = os.path.join(ROOT, "scripts", "tools", "onboard-coverage.html")
DATA = os.path.join(ROOT, "scripts", "tools", "onboard-data.html")
ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
FILE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
TYPES = {".html": "text/html", ".json": "application/json", ".geojson": "application/json", ".png": "image/png", ".jpg": "image/jpeg"}


def validate_data(params, catalogue, session):
    if params.get("catalogueVersion") != catalogue.get("version"):
        raise ValueError("The source overview changed. Reload before saving.")
    scenes = session.get("steps", {}).get("scenes", {})
    if scenes.get("state") != "set" or params.get("scenesTime") != scenes.get("time"):
        raise ValueError("The selected images changed. Reload the source overview.")
    rows = params.get("sources")
    if not isinstance(rows, list) or not rows or len(rows) > 1000:
        raise ValueError("Invalid source list.")
    known = {r["id"] for r in catalogue["sources"]}
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or row["id"] in seen:
            raise ValueError("Invalid or duplicate source.")
        seen.add(row["id"])
        if row["id"] not in known and not row.get("ownerAdded"):
            raise ValueError("Unknown source.")
        if row.get("role") not in ("constraint", "validation", "context"):
            raise ValueError("Choose one role per source.")
        if not isinstance(row.get("include"), bool):
            raise ValueError("Invalid source selection.")
        url = urlsplit(row.get("url", ""))
        if url.scheme not in ("http", "https") or not url.netloc:
            raise ValueError("Source links must use HTTP or HTTPS.")
    if not known.issubset(seen):
        raise ValueError("Keep all catalogue entries; uncheck a source to exclude it.")


def validate_scenes(params, scenes):
    """Use the main orbit unless the owner explicitly records a per-year exception."""
    orbits = scenes.get("orbits", [])
    if not orbits:
        return
    orbit = params.get("primaryOrbit")
    if orbit not in orbits:
        raise ValueError("Choose one Sentinel orbit before setting all images.")
    if params.get("candidateVersion") != scenes.get("version"):
        raise ValueError("The candidates changed. Reload the picker before saving.")
    picks = params.get("picks", {})
    exceptions = params.get("orbitExceptions", {})
    if not isinstance(exceptions, dict):
        raise ValueError("Orbit exceptions must be recorded by year.")
    for year, exception in exceptions.items():
        row = scenes["years"].get(year)
        if not row or row["source"] != "sentinel-2" or not isinstance(exception, dict):
            raise ValueError(f"{year}: invalid Sentinel orbit exception.")
        if exception.get("orbit") not in orbits or exception.get("orbit") == orbit:
            raise ValueError(f"{year}: the exception must use another available orbit.")
        if not any(c.get("orbit") == exception["orbit"] for c in row["cands"]):
            raise ValueError(f"{year}: no full-image candidate is available from the exception orbit.")
        reason = exception.get("reason", "")
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 300:
            raise ValueError(f"{year}: record the reason for the orbit exception.")
    for year, row in scenes["years"].items():
        candidates = row["cands"]
        if row["source"] == "sentinel-2":
            year_orbit = exceptions.get(year, {}).get("orbit", orbit)
            candidates = [c for c in candidates if c.get("orbit") == year_orbit]
        pick = picks.get(year)
        if not candidates:
            if pick is not None:
                raise ValueError(f"{year}: no candidate is available for the selected orbit.")
            continue
        if pick == "none":
            continue
        candidate = next((c for c in candidates if c["id"] == pick), None)
        if candidate is None:
            raise ValueError(f"{year}: choose a scene from the selected orbit, or no usable image.")
        if row["source"] == "sentinel-2" and (candidate.get("preview_missing_pixels") != 0 or candidate.get("cover") != 1.0):
            raise ValueError(f"{year}: the Sentinel mosaic does not have verified full preview coverage.")
        if row["source"] == "sentinel-2" and scenes.get("image_level") == "L1C" and candidate.get("image_level") != "L1C":
            raise ValueError(f"{year}: reload the picker to select genuine L1C imagery.")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text") or "json" in ctype else ""))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _parts(self):
        return [p for p in self.path.split("?")[0].split("/") if p]

    def do_GET(self):
        p = self._parts()
        static = {"/css/tokens.css": ("css/tokens.css", "text/css"),
                  "/fonts/SchibstedGrotesk-Variable.woff2": ("fonts/SchibstedGrotesk-Variable.woff2", "font/woff2")}
        if self.path.split("?")[0] in static:
            name, ctype = static[self.path.split("?")[0]]
            return self._send(200, ctype, open(os.path.join(ROOT, name), "rb").read())
        if len(p) == 1 and ID.match(p[0]) and os.path.isdir(os.path.join(SESS, p[0])):
            return self._send(200, "text/html", open(VIEWER, "rb").read())
        if len(p) == 2 and p[1] == "scenes" and ID.match(p[0]) and os.path.isdir(os.path.join(SESS, p[0])):
            return self._send(200, "text/html", open(SCENES, "rb").read())
        if len(p) == 2 and p[1] == "coverage" and ID.match(p[0]) and os.path.isdir(os.path.join(SESS, p[0])):
            return self._send(200, "text/html", open(COVERAGE, "rb").read())
        if len(p) == 2 and p[1] == "data" and ID.match(p[0]) and os.path.isdir(os.path.join(SESS, p[0])):
            return self._send(200, "text/html", open(DATA, "rb").read())
        if len(p) == 4 and p[0] == "s" and ID.match(p[1]) and p[2] in ("sentinel", "landsat") and FILE.match(p[3]):
            f = os.path.join(SESS, p[1], p[2], p[3])
            if os.path.isfile(f):
                return self._send(200, TYPES.get(os.path.splitext(f)[1], "application/octet-stream"), open(f, "rb").read())
        if len(p) == 3 and p[0] == "s" and ID.match(p[1]) and FILE.match(p[2]):
            f = os.path.join(SESS, p[1], p[2])
            if os.path.isfile(f):
                return self._send(200, TYPES.get(os.path.splitext(f)[1], "application/octet-stream"), open(f, "rb").read())
        self._send(404, "text/plain", b"Not found")

    def do_POST(self):
        p = self._parts()
        if len(p) == 2 and p[0] == "press" and ID.match(p[1]):
            f = os.path.join(SESS, p[1], "session.json")
            try:
                j = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                step = j["step"]
                if not re.match(r"^[a-z0-9_-]{1,40}$", step):
                    raise ValueError("bad step")
                if step == "scenes":
                    scene_path = os.path.join(SESS, p[1], "scenes.json")
                    if os.path.isfile(scene_path):
                        validate_scenes(j.get("params", {}), json.load(open(scene_path)))
                s = json.load(open(f)) if os.path.isfile(f) else {}
                if step in ("data", "data_draft"):
                    with open(os.path.join(SESS, p[1], "sources.json")) as source_file:
                        validate_data(j.get("params", {}), json.load(source_file), s)
                s.setdefault("steps", {})[step] = {"state": "set", "time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "params": j.get("params", {})}
                s.setdefault("log", []).append({"time": s["steps"][step]["time"], "step": step})
                tmp = f + ".tmp"
                json.dump(s, open(tmp, "w"), indent=1)
                os.replace(tmp, f)
                return self._send(200, "application/json", json.dumps(s["steps"][step]).encode())
            except (ValueError, KeyError) as e:
                return self._send(400, "application/json", json.dumps({"error": str(e)}).encode())
        self._send(404, "text/plain", b"Not found")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    print("onboarding viewer: http://localhost:%d/<glacier-id>" % port)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
