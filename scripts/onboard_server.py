#!/usr/bin/env python3
"""Local server for the owner-facing onboarding flow (docs/ONBOARD_RUNBOOK.md).

    python3 scripts/onboard_server.py            # http://localhost:8010/<glacier-id>

Serves scripts/tools/onboard-viewer.html and, for a session folder experiments/onboard/<id>/ (local, gitignored), its files and its
session.json (step states and button presses, with times). It is the only thing the buttons write; Claude reads session.json when the
owner types the continue word. Nothing here is public: it listens on 127.0.0.1 only.
"""
import json, os, re, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESS = os.path.join(ROOT, "experiments", "onboard")
VIEWER = os.path.join(ROOT, "scripts", "tools", "onboard-viewer.html")
ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
FILE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
TYPES = {".html": "text/html", ".json": "application/json", ".geojson": "application/json", ".png": "image/png", ".jpg": "image/jpeg"}


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
        if len(p) == 1 and ID.match(p[0]) and os.path.isdir(os.path.join(SESS, p[0])):
            return self._send(200, "text/html", open(VIEWER, "rb").read())
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
                s = json.load(open(f)) if os.path.isfile(f) else {}
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
