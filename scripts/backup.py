#!/usr/bin/env python3
"""Backup of everything that exists only on this computer, plus the whole git history, and (optionally) the R2 buckets.

    python3 scripts/backup.py DEST                      # DEST: a folder on another disk, or in iCloud / a synced folder
    python3 scripts/backup.py DEST --dry-run            # what would go in, and how big it is; writes nothing
    python3 scripts/backup.py DEST --r2 --r2-bucket GALLERY_BUCKET_NAME --r2-bucket LANDSAT_BUCKET_NAME
    python3 scripts/backup.py DEST --with-experiments --keep 3

Each run makes DEST/tfs-<date>-<time>/ with
  repo.bundle        the whole git history, every branch and tag (git bundle: restore with `git clone repo.bundle`); GitHub holds the same, this is the copy that does not depend on it
  local-only.tar.gz  the files git ignores but that are not made again by a script: the records of the glaciers (data/regions), sign-offs, the walkthrough, the ledgers in docs/sources,
                     the Landsat pictures and the terrain files of the other regions, the local tools, notes and design studies
  local-only.txt     the list of those files with their sizes
  r2/<bucket>/       with --r2: a copy of each bucket (needs rclone, see docs/OPERATIONS.md)
  manifest.json      what was saved, the commit, the files that were changed but not committed, and the SHA-256 of every part

Never in a backup: passwords and keys (.dev.vars, scripts/.cdse-credentials, scripts/.google-key, anything named like a secret) and the caches that scripts fill again
(scripts/.landsat-cache, .dem-cache, .itslive-cache, .rgi-cache, .cache, node_modules, _site). experiments/ (tens of gigabytes) only with --with-experiments.
Only the newest --keep backups (default 4) stay in DEST. A backup that fails to verify is reported and exits with 1.
"""
import argparse, datetime, fnmatch, hashlib, json, os, shutil, subprocess, sys, tarfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# a file matching one of these is never copied, wherever it lies (and the run says how many it left out)
SECRET_PATTERNS = [".dev.vars", ".env", ".env.*", "*.env", "*.pem", "*.p12", "*.key", "*credentials*", "*secret*", ".google-key", ".netrc", "id_rsa*", "id_ed25519*", "rclone.conf"]
# folders that scripts fill again (caches, builds): not worth the space
CACHE_PREFIXES = ["node_modules/", "_site/", ".cache/", "scripts/.landsat-cache/", "scripts/.dem-cache/", "scripts/.itslive-cache/", "scripts/.rgi-cache/", "scripts/.cache/",
                  "scripts/.board-cache/", "scripts/.placement/", "scripts/.relief-cache/", "scripts/__pycache__/", "tests/__pycache__/", "teaser/work/", ".git/"]
CACHE_PARTS = ["/__pycache__/", "/.DS_Store"]
OPT_IN = {"experiments/": "--with-experiments"}


SOURCE_EXTENSIONS = (".ts", ".py", ".js", ".md", ".html", ".css", ".sh")      # a file called credentials.ts is code that handles credentials, not a credential


def is_secret(path):
    base = os.path.basename(path)
    if base.lower().endswith(SOURCE_EXTENSIONS):
        return False
    return any(fnmatch.fnmatch(base.lower(), pat.lower()) for pat in SECRET_PATTERNS)


def select(paths, with_experiments=False, extra_exclude=()):
    """(kept, left_out): which of the ignored files go into the archive and which do not, with the reason"""
    kept, out = [], {"secret": [], "cache": [], "experiments": [], "excluded": []}
    for p in paths:
        if is_secret(p):
            out["secret"].append(p)
        elif p.startswith(tuple(CACHE_PREFIXES)) or any(x in "/" + p for x in CACHE_PARTS) or p == ".DS_Store":
            out["cache"].append(p)
        elif p.startswith("experiments/") and not with_experiments:
            out["experiments"].append(p)
        elif any(p.startswith(x) or fnmatch.fnmatch(p, x) for x in extra_exclude):
            out["excluded"].append(p)
        else:
            kept.append(p)
    return kept, out


def git(repo, *args, **kw):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, **kw)


def ignored_files(repo):
    r = git(repo, "ls-files", "-o", "-i", "--exclude-standard", "-z")
    if r.returncode:
        sys.exit("git ls-files failed: " + r.stderr.decode(errors="replace"))
    return [f for f in r.stdout.decode("utf-8", "surrogateescape").split("\0") if f]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def human(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.0f} {u}" if u == "B" else f"{n:.1f} {u}"
        n /= 1024


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dest")
    ap.add_argument("--repo", default=ROOT, help="the working copy (default: this repository)")
    ap.add_argument("--keep", type=int, default=4, help="how many backups stay in DEST (default 4)")
    ap.add_argument("--with-experiments", action="store_true")
    ap.add_argument("--exclude", action="append", default=[], help="a path prefix or pattern to leave out, for example data/landsat/ (repeatable)")
    ap.add_argument("--r2", action="store_true", help="also copy the R2 buckets named with --r2-bucket (rclone)")
    ap.add_argument("--r2-bucket", action="append", default=[])
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)

    kept, out = select(ignored_files(repo), a.with_experiments, a.exclude)
    sizes = {}
    for p in kept:
        try:
            sizes[p] = os.path.getsize(os.path.join(repo, p))
        except OSError:
            sizes[p] = 0
    groups = {}
    for p, n in sizes.items():
        key = "/".join(p.split("/")[:2]) if p.startswith(("data/", "scripts/", "docs/", "images/", "teaser/")) else p.split("/")[0]
        g = groups.setdefault(key, [0, 0]); g[0] += 1; g[1] += n
    total = sum(sizes.values())
    print(f"{len(kept)} files, {human(total)} go into local-only.tar.gz:")
    for k, (n, s) in sorted(groups.items(), key=lambda kv: -kv[1][1])[:14]:
        print(f"  {human(s):>9}  {n:5d} files  {k}")
    print(f"left out: {len(out['secret'])} secrets, {len(out['cache'])} cache files, {len(out['experiments'])} files of experiments/" + (" (use --with-experiments)" if out["experiments"] else "") + (f", {len(out['excluded'])} excluded by you" if out["excluded"] else ""))
    if a.dry_run:
        return 0

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.abspath(a.dest)
    snap = os.path.join(dest, f"tfs-{stamp}")
    os.makedirs(snap)
    manifest = {"made": datetime.datetime.now().astimezone().isoformat(timespec="seconds"), "repo": repo, "parts": {}}
    ok = True

    # 1 git: every branch and tag in one file, then checked
    head = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
    dirty = [l for l in git(repo, "status", "--porcelain").stdout.decode().splitlines()]
    r = git(repo, "bundle", "create", os.path.join(snap, "repo.bundle"), "--all")
    v = git(repo, "bundle", "verify", os.path.join(snap, "repo.bundle"))
    manifest["git"] = {"head": head, "branch": git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.decode().strip(), "uncommitted_files": dirty}
    if r.returncode or v.returncode:
        print("FAILED: git bundle:", (r.stderr + v.stderr).decode(errors="replace")[:300]); ok = False
    else:
        print(f"repo.bundle: ok ({human(os.path.getsize(os.path.join(snap, 'repo.bundle')))}, HEAD {head[:8]}" + (f", {len(dirty)} changed files are NOT in it: they are not committed)" if dirty else ")"))

    # 2 the files only this computer has
    arc = os.path.join(snap, "local-only.tar.gz")
    with open(os.path.join(snap, "local-only.txt"), "w", encoding="utf-8") as f:
        for p in sorted(kept):
            f.write(f"{sizes[p]:>12}  {p}\n")
    with tarfile.open(arc, "w:gz", compresslevel=6) as t:
        for p in sorted(kept):
            try:
                t.add(os.path.join(repo, p), arcname=p, recursive=False)
            except OSError as e:
                print("could not read", p, e); ok = False
    with tarfile.open(arc) as t:
        n_in = sum(1 for m in t if m.isfile())
    if n_in != len(kept):
        print(f"FAILED: the archive holds {n_in} files, expected {len(kept)}"); ok = False
    else:
        print(f"local-only.tar.gz: ok ({n_in} files, {human(os.path.getsize(arc))})")

    # 3 the R2 buckets
    if a.r2:
        if not shutil.which("rclone"):
            print("FAILED: --r2 needs rclone (brew install rclone), see docs/OPERATIONS.md"); ok = False
        else:
            remote = os.environ.get("R2_REMOTE", "r2")
            for b in a.r2_bucket:
                target = os.path.join(snap, "r2", b)
                os.makedirs(target)
                r = subprocess.run(["rclone", "sync", f"{remote}:{b}", target, "--fast-list", "--transfers", "8", "--checksum"], capture_output=True)
                n = sum(len(fs) for _, _, fs in os.walk(target))
                if r.returncode:
                    print(f"FAILED: rclone {remote}:{b}:", r.stderr.decode(errors="replace")[-300:]); ok = False
                else:
                    print(f"r2/{b}: ok ({n} files)")
                manifest.setdefault("r2", {})[b] = {"files": n, "rclone_exit": r.returncode}
        if not a.r2_bucket:
            print("FAILED: --r2 needs at least one --r2-bucket NAME"); ok = False

    # 4 the manifest, with a checksum of every part
    for name in sorted(os.listdir(snap)):
        p = os.path.join(snap, name)
        if os.path.isfile(p):
            manifest["parts"][name] = {"bytes": os.path.getsize(p), "sha256": sha256(p)}
    manifest["local_only"] = {"files": len(kept), "left_out": {k: len(v) for k, v in out.items()}}
    manifest["ok"] = ok
    with open(os.path.join(snap, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)

    # 5 keep the newest backups only (a folder counts only if it has a manifest: nothing else is ever deleted)
    if ok:
        old = sorted(d for d in os.listdir(dest) if d.startswith("tfs-") and os.path.isfile(os.path.join(dest, d, "manifest.json")))
        for d in old[:-max(a.keep, 1)]:
            shutil.rmtree(os.path.join(dest, d))
            print("removed the oldest backup", d)
    print(("backup ready: " if ok else "backup INCOMPLETE: ") + snap)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
