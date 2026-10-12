#!/usr/bin/env python3
"""Syntax check of everything that can break the site without anyone noticing until a visitor does.

    python3 scripts/check_syntax.py

- the inline <script> blocks of every HTML file (gallery.html, tools/*.html, ...; index.html has none since the split)
- the JavaScript files: js/*.js (the page), the generated data files (sightline.js, thickness.js, glaciers.js, ...) and worker/worker.js as a module
- the Python scripts (compiled, not run)
- the JSON files (scenes.json, cloudmasks.json, terrain/manifest.json, demchange/*.json)

JavaScript is checked with `node --check` (the GitHub runners have Node). Without Node (a Mac that has none) the JavaScript engine that ships with macOS is used,
`jsc`; it cannot check the Worker (ES module). Exit code 1 if anything is wrong. Standard library only.
"""
import glob, json, os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
SCRIPT = re.compile(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", re.S | re.I)


def js_engine():
    if shutil.which("node"):
        return "node"
    if os.path.exists(JSC):
        return "jsc"
    return None


def check_js(engine, path, label, module=False):
    """Returns an error text or None."""
    if engine == "node":
        if module:       # a .js file with `export` is a script to Node unless it is named .mjs
            tmp = tempfile.NamedTemporaryFile(suffix=".mjs", delete=False, mode="wb")
            tmp.write(open(path, "rb").read()); tmp.close(); path = tmp.name
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if module:
            os.unlink(path)
        return None if r.returncode == 0 else (r.stderr or r.stdout).strip()[:1500]
    if module:
        return None      # jsc as used here parses scripts only
    wrapper = tempfile.NamedTemporaryFile(suffix=".js", delete=False, mode="w")
    wrapper.write(f'var src = readFile({json.dumps(path)}); try {{ new Function(src); print("OK"); }} catch (e) {{ print("ERR " + e); }}')
    wrapper.close()
    r = subprocess.run([JSC, wrapper.name], capture_output=True, text=True)
    os.unlink(wrapper.name)
    return None if r.stdout.strip() == "OK" else (r.stdout or r.stderr).strip()[:1500]


def main():
    problems, checked = [], 0
    engine = js_engine()
    if not engine:
        print("note: neither node nor jsc found, JavaScript not checked")
    tmpdir = tempfile.mkdtemp()

    for html in sorted(glob.glob(os.path.join(ROOT, "*.html")) + glob.glob(os.path.join(ROOT, "tools", "*.html"))):
        text = open(html, encoding="utf-8").read()
        for i, m in enumerate(SCRIPT.finditer(text)):
            attrs, body = m.group("attrs"), m.group("body")
            if "src=" in attrs or not body.strip() or re.search(r'type\s*=\s*["\'](?!module|text/javascript)', attrs):
                continue
            label = f"{os.path.relpath(html, ROOT)} (inline script {i + 1})"
            if engine:
                part = os.path.join(tmpdir, f"part{checked}.js")
                open(part, "w", encoding="utf-8").write(body)
                err = check_js(engine, part, label, module='type="module"' in attrs)
                if err: problems.append(f"{label}: {err}")
            checked += 1

    for js in sorted(glob.glob(os.path.join(ROOT, "*.js")) + glob.glob(os.path.join(ROOT, "js", "*.js")) + glob.glob(os.path.join(ROOT, "worker", "*.js"))):
        rel = os.path.relpath(js, ROOT)
        if engine:
            err = check_js(engine, js, rel, module=rel.startswith("worker"))
            if err: problems.append(f"{rel}: {err}")
        checked += 1

    for py in sorted(glob.glob(os.path.join(ROOT, "scripts", "*.py")) + glob.glob(os.path.join(ROOT, "tests", "*.py"))):
        try:
            py_compile.compile(py, cfile=os.path.join(tmpdir, "x.pyc"), doraise=True)
        except py_compile.PyCompileError as e:
            problems.append(f"{os.path.relpath(py, ROOT)}: {e.msg.strip()}")
        checked += 1

    for pattern in ("scenes.json", "cloudmasks.json", "terrain/manifest.json", "demchange/*.json"):
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            try:
                json.load(open(path, encoding="utf-8"))
            except ValueError as e:
                problems.append(f"{os.path.relpath(path, ROOT)}: {e}")
            checked += 1

    shutil.rmtree(tmpdir, ignore_errors=True)
    if problems:
        print("\n".join(["SYNTAX PROBLEMS:"] + problems))
        sys.exit(1)
    print(f"syntax ok: {checked} blocks and files ({engine or 'no JavaScript engine'})")


if __name__ == "__main__":
    main()
