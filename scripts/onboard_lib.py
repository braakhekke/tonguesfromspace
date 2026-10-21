"""Local back end of the onboarding page (scripts/tools/onboard.html), served by scripts/serve.py.

The page keeps the list of steps and the glacier to add in data/onboarding.json (committed, so the steps are yours to edit and drag) and runs
the commands of the steps here. Only repository scripts run: a command is `[VAR=value ...] python3 scripts/<name>.py [args]` or
`python3 -m unittest ...`, split without a shell (shlex), so nothing else can be started from the page. {id} and {sgi} in a command are
replaced by the id of the glacier on the site and its inventory id. The built-in `@lookup` looks the glacier up in the data and texts.
Standard library only. Localhost only: serve.py checks the Host header and the X-Onboard header on every call.
"""
import json, os, re, shlex, subprocess, sys, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "data", "onboarding.json")
ENV_OK = re.compile(r"^(PUBLISH_[A-Z]+|TFS_SITE_DIR)=[\w./\-]*$")
SLUG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._~\-]*$")
MAX_LINES = 4000
JOBS = {}                      # id -> job dict (kept until the server stops)
LOCK = threading.Lock()
_next = [1]


# ------------------------------------------------------------------ the plan
def load_plan():
    try:
        with open(PLAN, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get("items"), list):
        raise ValueError("plan needs an items list")
    tmp = PLAN + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, PLAN)
    return {"ok": True}


# ------------------------------------------------------------------ commands
def build_argv(cmd, target):
    """Turn the text of a command into (argv, env), or raise ValueError saying why it is refused."""
    t = target or {}
    for key, ph in (("id", "{id}"), ("sgi", "{sgi}")):
        if ph in cmd:
            v = str(t.get(key, "")).strip()
            if not v or not SLUG.match(v):
                raise ValueError("fill in the %s of the glacier first (letters, digits, - . _ only)" % ("site id" if key == "id" else "inventory id"))
            cmd = cmd.replace(ph, v)
    try:
        tok = shlex.split(cmd)
    except ValueError as e:
        raise ValueError("cannot read the command: %s" % e)
    env = {}
    while tok and "=" in tok[0] and not tok[0].startswith("-"):
        if not ENV_OK.match(tok[0]):
            raise ValueError("only PUBLISH_* and TFS_SITE_DIR may be set before a command")
        k, v = tok.pop(0).split("=", 1)
        env[k] = v
    if len(tok) < 2 or tok[0] != "python3":
        raise ValueError("a command starts with python3")
    if tok[1] == "-m":
        if len(tok) < 3 or tok[2] != "unittest":
            raise ValueError("only python3 -m unittest is allowed with -m")
    else:
        p = tok[1]
        if p.startswith("-") or ".." in p or not re.match(r"^scripts/[\w\-]+\.py$", p) or p == "scripts/serve.py":
            raise ValueError("only scripts/<name>.py of this repository can run (not serve.py)")
        if not os.path.exists(os.path.join(ROOT, p)):
            raise ValueError("%s does not exist" % p)
    return tok, env


# ------------------------------------------------------------------ jobs
def _add(job, line):
    with LOCK:
        job["lines"].append(line.rstrip("\n"))
        if len(job["lines"]) > MAX_LINES:
            del job["lines"][:500]
            job["dropped"] += 500


def _run(job, argv, env):
    try:
        e = dict(os.environ, **env, PYTHONUNBUFFERED="1")
        p = subprocess.Popen(argv, cwd=ROOT, env=e, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
                             stdin=subprocess.DEVNULL, start_new_session=True)
        job["proc"] = p
        for line in p.stdout:
            _add(job, line)
        p.wait()
        job["rc"] = p.returncode
    except Exception as ex:                      # noqa: BLE001: shown to the user
        _add(job, "could not start: %s" % ex)
        job["rc"] = -1
    job["status"] = "stopped" if job.get("stopped") else ("done" if job["rc"] == 0 else "failed")
    job["ended"] = time.time()


def lookup(job, target):
    """@lookup: where the glacier is already on the site, and which region notes exist."""
    name = (target.get("name") or "").strip()
    keys = [k for k in {name, str(target.get("id", "")).strip(), str(target.get("sgi", "")).strip()} if len(k) >= 3]
    if not keys:
        _add(job, "Fill in the name (or the ids) of the glacier first.")
        job["rc"] = 1
        return
    rd = os.path.join(ROOT, "docs", "regions")
    notes = sorted(os.listdir(rd)) if os.path.isdir(rd) else []
    _add(job, "Region notes (docs/regions/): %s" % (", ".join(notes) if notes else "none yet"))
    try:
        with open(os.path.join(ROOT, "js", "00-regions.js"), encoding="utf-8") as f:
            ids = re.findall(r"\bid:\s*'([\w\-]+)'", f.read())
        _add(job, "Regions on the site: %s" % ", ".join(ids))
    except OSError:
        pass
    files = [os.path.join("data", n) for n in ("glaciers.js", "boxes.js", "vatnajokull.js", "iceland.js", "svalbard.js", "norway.js", "scenes.json", "cloudmasks.json")]
    files += [os.path.join("js", "01-data.js"), os.path.join("js", "07b-icecap-texts.js")] + [os.path.join("docs", "regions", n) for n in notes]
    hits = 0
    for rel in files:
        try:
            with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    if any(k.lower() in line.lower() for k in keys):
                        hits += 1
                        if hits <= 40:
                            s = line.strip()
                            _add(job, "%s:%d  %s" % (rel, i, s[:170] + ("..." if len(s) > 170 else "")))
        except OSError:
            continue
    _add(job, "%d line(s) mention %s." % (hits, " / ".join(keys)))
    job["rc"] = 0


def start(cmd, label, target):
    cmd = (cmd or "").strip()
    with LOCK:
        jid = _next[0]
        _next[0] += 1
    job = {"id": jid, "label": label or cmd, "cmd": cmd, "status": "running", "lines": [], "dropped": 0, "rc": None, "started": time.time()}
    if cmd == "@lookup":
        JOBS[jid] = job
        lookup(job, target or {})
        job["status"] = "done" if job["rc"] == 0 else "failed"
        return {"job": jid}
    argv, env = build_argv(cmd, target)
    JOBS[jid] = job
    _add(job, "$ %s%s" % ("".join("%s=%s " % kv for kv in env.items()), " ".join(argv)))
    threading.Thread(target=_run, args=(job, argv, env), daemon=True).start()
    return {"job": jid}


def poll(jid, since=0):
    job = JOBS.get(jid)
    if not job:
        return None
    with LOCK:
        base = job["dropped"]
        lines = job["lines"][max(0, since - base):]
        return {"id": jid, "label": job["label"], "status": job["status"], "rc": job["rc"], "lines": lines, "next": base + len(job["lines"])}


def stop(jid):
    job = JOBS.get(jid)
    if job and job["status"] == "running" and job.get("proc"):
        job["stopped"] = True
        try:
            os.killpg(job["proc"].pid, 15)
        except OSError:
            job["proc"].terminate()
    return {"ok": True}


def state():
    return {"plan": load_plan(), "jobs": [{"id": j["id"], "label": j["label"], "status": j["status"], "rc": j["rc"]} for j in JOBS.values()][-20:]}
