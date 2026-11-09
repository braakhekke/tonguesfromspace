"""scripts/backup.py on a scratch repository: what goes in, what never does, that the git bundle and the archive verify, and that old backups are removed."""
import json, os, subprocess, sys, tarfile, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import backup  # noqa: E402


def write(base, rel, text="x" * 50):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(text)


class TestSelect(unittest.TestCase):
    def test_secrets_and_caches_never_go_in_and_the_records_do(self):
        paths = ["data/regions/ch/aletsch/record.json", "data/landsat/aletsch/2001.jpg", "walkthrough/credentials.ts", "docs/sources/ch-swissbedrock.md", "scripts/tools/review.html",
                 ".dev.vars", "scripts/.cdse-credentials", "scripts/.google-key", "config/prod.env", "id_rsa", "rclone.conf", "server.pem", "my_secret_notes.txt",
                 "node_modules/x/index.js", "_site/index.html", "scripts/.landsat-cache/a.tif", ".cache/rgi7/z", "teaser/work/frame.png", "scripts/__pycache__/x.pyc", "experiments/big/a.npz", ".DS_Store"]
        kept, out = backup.select(paths)
        for p in ("data/regions/ch/aletsch/record.json", "data/landsat/aletsch/2001.jpg", "walkthrough/credentials.ts", "docs/sources/ch-swissbedrock.md", "scripts/tools/review.html"):
            self.assertIn(p, kept, p + " must be saved")
        for p in (".dev.vars", "scripts/.cdse-credentials", "scripts/.google-key", "config/prod.env", "id_rsa", "rclone.conf", "server.pem", "my_secret_notes.txt"):
            self.assertNotIn(p, kept, p + " is a secret and must never be copied")
        for p in ("node_modules/x/index.js", "_site/index.html", "scripts/.landsat-cache/a.tif", ".cache/rgi7/z", "teaser/work/frame.png", "scripts/__pycache__/x.pyc", ".DS_Store"):
            self.assertNotIn(p, kept, p + " is made again by a script")
        self.assertIn("experiments/big/a.npz", out["experiments"])
        self.assertIn("experiments/big/a.npz", backup.select(paths, with_experiments=True)[0])
        self.assertIn("data/landsat/aletsch/2001.jpg", backup.select(paths, extra_exclude=["data/landsat/"])[1]["excluded"])


class TestBackup(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.repo = os.path.join(self.tmp, "repo"); self.dest = os.path.join(self.tmp, "dest")
        os.makedirs(self.repo)
        run = lambda *a: subprocess.run(["git", "-C", self.repo, *a], check=True, capture_output=True)
        run("init", "-q", "-b", "main"); run("config", "user.email", "t@t"); run("config", "user.name", "t")
        write(self.repo, ".gitignore", "data/regions/\ndata/landsat/\n.dev.vars\nnode_modules/\nscripts/.cdse-credentials\n")
        write(self.repo, "index.html", "<html>"); run("add", "-A"); run("commit", "-q", "-m", "one")
        run("tag", "known-good-test")
        write(self.repo, "data/regions/ch/aletsch.json", '{"id": "aletsch"}'); write(self.repo, "data/landsat/a.jpg", "jpeg" * 100)
        write(self.repo, ".dev.vars", "TOKEN=hunter2"); write(self.repo, "scripts/.cdse-credentials", "id=1 secret=2"); write(self.repo, "node_modules/x/i.js", "1")

    def run_backup(self, *args):
        return backup.main([self.dest, "--repo", self.repo, *args])

    def snaps(self):
        return sorted(d for d in os.listdir(self.dest) if d.startswith("tfs-")) if os.path.isdir(self.dest) else []

    def test_dry_run_writes_nothing(self):
        self.assertEqual(self.run_backup("--dry-run"), 0)
        self.assertEqual(self.snaps(), [])

    def test_a_backup_holds_the_history_and_the_local_files_and_no_secret(self):
        self.assertEqual(self.run_backup(), 0)
        (snap,) = self.snaps(); d = os.path.join(self.dest, snap)
        self.assertEqual(subprocess.run(["git", "bundle", "verify", os.path.join(d, "repo.bundle")], cwd=self.repo, capture_output=True).returncode, 0)
        clone = subprocess.run(["git", "clone", "-q", os.path.join(d, "repo.bundle"), os.path.join(self.tmp, "restored")], capture_output=True)
        self.assertEqual(clone.returncode, 0, clone.stderr)
        self.assertTrue(os.path.isfile(os.path.join(self.tmp, "restored", "index.html")))
        tags = subprocess.run(["git", "-C", os.path.join(self.tmp, "restored"), "tag"], capture_output=True, text=True).stdout.split()
        self.assertIn("known-good-test", tags, "the tags (rollback points) are in the bundle")
        with tarfile.open(os.path.join(d, "local-only.tar.gz")) as t:
            names = t.getnames()
        self.assertEqual(sorted(names), ["data/landsat/a.jpg", "data/regions/ch/aletsch.json"], "the ignored files that nothing makes again, and nothing else")
        listing = open(os.path.join(d, "local-only.txt")).read()
        blob = json.dumps(json.load(open(os.path.join(d, "manifest.json")))) + listing
        for secret in ("hunter2", ".dev.vars", "cdse-credentials"):
            self.assertNotIn(secret, blob, secret)
        m = json.load(open(os.path.join(d, "manifest.json")))
        self.assertTrue(m["ok"])
        for part, info in m["parts"].items():
            self.assertEqual(backup.sha256(os.path.join(d, part)), info["sha256"], part)
        self.assertEqual(m["git"]["uncommitted_files"], [], "nothing but ignored files changed")

    def test_uncommitted_work_is_reported_and_only_the_newest_backups_stay(self):
        write(self.repo, "index.html", "<html>changed")
        for i in range(3):
            os.makedirs(os.path.join(self.dest, f"tfs-2020010{i}-000000"), exist_ok=True)
            write(os.path.join(self.dest, f"tfs-2020010{i}-000000"), "manifest.json", "{}")
        os.makedirs(os.path.join(self.dest, "tfs-notes-folder"), exist_ok=True); write(os.path.join(self.dest, "tfs-notes-folder"), "mine.txt")      # no manifest: not ours, never deleted
        self.assertEqual(self.run_backup("--keep", "2"), 0)
        snaps = self.snaps()
        self.assertEqual(len([s for s in snaps if os.path.isfile(os.path.join(self.dest, s, "manifest.json"))]), 2)
        self.assertIn("tfs-notes-folder", snaps)
        newest = [s for s in snaps if s != "tfs-notes-folder"][-1]
        m = json.load(open(os.path.join(self.dest, newest, "manifest.json")))
        self.assertEqual(len(m["git"]["uncommitted_files"]), 1, "the changed file is named: it is not in the bundle")


if __name__ == "__main__":
    unittest.main()
