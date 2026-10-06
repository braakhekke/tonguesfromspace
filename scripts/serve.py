#!/usr/bin/env python3
"""
serve.py  -  run the glacier dashboard locally, with a relay for the Copernicus API.

    python3 scripts/serve.py            then open http://localhost:8000
    python3 scripts/serve.py --port 8080

Why: browsers refuse to send the Copernicus login (and sometimes the API calls) straight
from a web page. This script serves the dashboard folder and forwards three kinds of
request to the Copernicus Data Space Ecosystem on your behalf:

    /cdse/token    -> identity.dataspace.copernicus.eu   (OAuth login)
    /cdse/catalog  -> sh.dataspace.copernicus.eu/catalog (which mosaics exist)
    /cdse/process  -> sh.dataspace.copernicus.eu/process (the images)

Your credentials go from the browser to this script and on to Copernicus only.
Nothing is stored here. The server listens on this computer only (127.0.0.1).
Standard library only; no installs needed.
"""
import argparse, json, os, ssl, sys, urllib.error, urllib.request, webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

IDENTITY = os.environ.get("CDSE_IDENTITY", "https://identity.dataspace.copernicus.eu")
SH = os.environ.get("CDSE_SH", "https://sh.dataspace.copernicus.eu")
ROUTES = {
    "/cdse/token":   IDENTITY + "/auth/realms/CDSE/protocol/openid-connect/token",
    "/cdse/catalog": SH + "/catalog/v1/search",
    "/cdse/process": SH + "/process/v1",
}
FORWARD_HEADERS = ("Content-Type", "Authorization", "Accept")

def ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()
CTX = ssl_context()
CERT_HELP = ("Python could not verify Copernicus' HTTPS certificate (common with python.org builds on macOS). "
             f'Fix once: run "/Applications/Python {sys.version_info.major}.{sys.version_info.minor}/Install Certificates.command" '
             "or: python3 -m pip install certifi - then restart serve.py.")

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        line = fmt % args
        if "/cdse/" in line:
            sys.stderr.write("  relay  " + line + "\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/cdse/ping":
            return self._send(200, "application/json", b'{"relay":true}')
        return super().do_GET()

    def do_POST(self):
        target = ROUTES.get(self.path.split("?")[0])
        if not target:
            return self._send(404, "text/plain", b"Unknown relay path")
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        headers = {h: self.headers[h] for h in FORWARD_HEADERS if self.headers.get(h)}
        headers["User-Agent"] = "swiss-glacier-dashboard/1.0"
        req = urllib.request.Request(target, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                return self._send(r.status, r.headers.get("Content-Type", "application/octet-stream"), r.read())
        except urllib.error.HTTPError as e:
            return self._send(e.code, e.headers.get("Content-Type", "text/plain"), e.read())
        except urllib.error.URLError as e:
            msg = CERT_HELP if "CERTIFICATE_VERIFY_FAILED" in str(e) else f"serve.py could not reach Copernicus: {e.reason}"
            sys.stderr.write("  relay  " + msg + "\n")
            return self._send(502, "application/json", json.dumps({"relayError": msg}).encode())

    def _send(self, code, ctype, data):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser automatically")
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here) if os.path.basename(here) == "scripts" else here   # repository root
    os.chdir(root)
    if not os.path.exists("index.html"):
        sys.exit(f"index.html not found in {root}. Keep serve.py in the scripts/ folder of the repository.")
    url = f"http://localhost:{a.port}/"
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    except OSError:
        sys.exit(f"Port {a.port} is in use. Try: python3 scripts/serve.py --port {a.port + 1}")
    print(f"Glacier dashboard running at {url}\nPress Ctrl+C to stop.")
    if not a.no_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
