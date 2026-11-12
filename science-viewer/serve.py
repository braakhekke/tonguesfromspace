#!/usr/bin/env python3
"""Local-only science prototype. No upload endpoint; imagery requests use scripts/serve.py on IPv4 port 8000."""
import argparse
import json
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
import urllib.error
import ssl

ROOT = Path(__file__).resolve().parents[1]
try:
    import certifi
    TLS = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    TLS = ssl.create_default_context()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_bytes(self, status, kind, body):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def hidden(self):
        from urllib.parse import unquote, urlsplit
        parts = unquote(urlsplit(self.path).path).split('/')
        return any(p.startswith('.') or p == 'node_modules' for p in parts if p)

    def do_GET(self):
        path = self.path.split('?')[0]
        if self.hidden():
            return self.send_error(404)
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/playground-gabriele')
            self.end_headers()
            return
        if path in ('/playground-gabriele', '/playground-gabriele/'):
            return self.send_bytes(200, 'text/html; charset=utf-8', (ROOT / 'science-viewer/index.html').read_bytes())
        if path == '/config.js':
            return self.send_bytes(200, 'text/javascript', b'window.TFS_CONFIG={relay:""};')
        if path == '/cdse/ping':
            return self.forward(None)
        return super().do_GET()

    def do_POST(self):
        if self.path not in ('/cdse/process', '/cdse/statistics'):
            return self.send_error(404, 'No upload endpoint')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 512 * 1024:
                return self.send_error(413)
            body = self.rfile.read(size)
            json.loads(body)
        except (ValueError, json.JSONDecodeError):
            return self.send_error(400)
        return self.forward(body)

    def forward(self, body):
        # Only the explorer's three existing imagery request types. Field data never use this path.
        req = urllib.request.Request('http://127.0.0.1:8000' + self.path, data=body,
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=90, context=TLS) as response:
                return self.send_bytes(response.status, response.headers.get('Content-Type', 'application/octet-stream'), response.read())
        except urllib.error.HTTPError as error:
            return self.send_bytes(error.code, 'application/json', error.read())
        except (OSError, urllib.error.URLError):
            return self.send_bytes(502, 'application/json', b'{"relayError":"Start python3 scripts/serve.py on port 8000. Local data remain on this computer."}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8003)
    args = parser.parse_args()
    print(f'Zmutt science viewer: http://127.0.0.1:{args.port}/playground-gabriele', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
