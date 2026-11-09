# Operations: watching, errors, backups, rollback

Checked against the workflows, `worker/wrangler.toml`, `worker/worker.js` and the scripts on 2026-11-09. What is automatic is marked **automatic**; what needs you or an account that is not set up here is marked **to do**.

## 1. Is the site up?

- **Every 15 minutes, automatic:** the workflow *Uptime* (`.github/workflows/uptime.yml`) asks `https://tonguesfromspace.org/cdse/ping` (must answer `{"relay":true,"managed":true}`, from the Worker itself, no Copernicus units) and the front page (must answer 200). Three tries, 20 seconds apart. If both do not answer, it opens one issue "Site is down" (label `uptime`, GitHub emails you), comments on it for every failed run and closes it when the site answers again.
- **Every Monday, automatic:** *Health check* (`tests/health.py`) goes further: the hashed data files, the terrain manifest and a real browser that opens a glacier and gets its picture through the relay.
- **Limits:** GitHub may start a scheduled run a few minutes late and stops scheduled workflows of a public repository after 60 days without any activity (any push wakes it: Actions tab, *Uptime*, *Enable workflow*). It watches from GitHub's network, so it cannot tell a Cloudflare outage from a regional problem.
- **To do (optional, needs an account):** a second opinion from outside GitHub: a Cloudflare notification or health check on the same address, or any external monitor that requests a URL every few minutes. Not set up.

## 2. Errors

- **Worker (automatic).** Workers Logs are on (`[observability]` in `worker/wrangler.toml`, every line kept). The relay writes one JSON line per failure with `console.error`, no address and no request body:
  - `{"evt":"relay_no_credentials","route":"statistics"}`: the Worker has no Copernicus login;
  - `{"evt":"upstream_status","route":"process","status":503,"stale":true}`: Copernicus answered 5xx, 429 (busy or out of units), 403 or 401 (`stale` says an older cached picture was served instead);
  - `{"evt":"relay_failed","route":"process","message":"…","stale":false}`: the call to Copernicus threw.
  Read them in the Cloudflare dashboard (*Workers & Pages*, this Worker, *Logs*) or live with `cd worker && npx wrangler tail --format json`. Uncaught exceptions are logged too.
- **Pages (automatic).** `js/track.js` sends a script error as the event `error-js` (the same cookie-free channel as the click counts: no cookie, no storage, no IP address, no user id; nothing is sent when the browser says Do Not Track or Global Privacy Control; only on tonguesfromspace.org). The note is at most 80 characters in a conservative alphabet (what went wrong, in which file), at most 3 per page view, the same note once. The Worker stores it as the sixth field (`blob6`) of the dataset `tsf_events`, and only for this event.
- **Reading the page errors:** `CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… python3 scripts/errors_report.py --days 7` (token with *Account Analytics: Read*; the same as for `scripts/parked/clicks_report.py`). It lists the notes by page, the glacier that was open and the device. **To do:** it has not been run against Cloudflare (needs your token); the SQL is built by tested code (`tests/test_errors_report.py`).
- **Page views without cookies:** the Cloudflare Web Analytics beacon, if the repository variable `CF_WEB_ANALYTICS_TOKEN` is set (see `docs/SETUP.md`).

## 3. Backups

What lives where, and what a loss would cost:

| What | Where it lives | Backup |
|---|---|---|
| Code, texts, the ten Swiss glaciers' data and terrain, tests, workflows | git, GitHub | `repo.bundle` of every run of `scripts/backup.py` (all branches and tags) |
| Glacier records (`data/regions/`), sign-offs, the walkthrough, the source ledgers (`docs/sources/`), the local tools and notes, the Landsat pictures, the terrain files of the other regions, the teaser films, design studies | **this computer only** | `local-only.tar.gz` |
| Gallery pictures and videos (pending and approved) | Cloudflare R2, bucket `GALLERY` | `r2/<bucket>/` with `--r2` |
| Landsat pictures served to visitors | R2, bucket `LANDSAT` (uploaded from `data/landsat/` with `scripts/upload_landsat.sh`) | `data/landsat/` is in `local-only.tar.gz`; `--r2` copies the bucket too |
| Image cache of the relay | Cloudflare KV | none: it fills again (one Copernicus request per picture) |
| Passwords and keys | see "What no backup holds" | none, on purpose |

**Make a backup** (a folder on another disk or a synced folder):

```bash
python3 scripts/backup.py /Volumes/Backup/tfs              # git history + local-only files
python3 scripts/backup.py /Volumes/Backup/tfs --dry-run    # what would go in, how big; writes nothing
python3 scripts/backup.py /Volumes/Backup/tfs --r2 --r2-bucket <gallery bucket> --r2-bucket <landsat bucket>
```

Each run makes `tfs-<date>-<time>/` with `repo.bundle`, `local-only.tar.gz` (about 414 MB on 2026-11-09), `local-only.txt` (every file with its size), `manifest.json` (the commit, the files that were changed but **not committed** and so are not in the bundle, and a SHA-256 of every part) and, with `--r2`, `r2/`. The script checks the bundle and the archive and exits with 1 if something is wrong; it keeps the newest 4 (`--keep`). Never copied: secrets and keys (named like `.dev.vars`, `*credentials*`, `.google-key`, `*.pem`, `*.env`) and the caches that scripts fill again (`scripts/.landsat-cache`, `.dem-cache`, `.itslive-cache`, `.rgi-cache`, `.cache`, `node_modules`, `_site`, `teaser/work`). `experiments/` (about 39 GB) only with `--with-experiments`; leave out more with `--exclude data/landsat/`.

**R2 needs rclone, once:** `brew install rclone`, then `rclone config`: a new remote called `r2`, storage *s3*, provider *Cloudflare*, an R2 API token (*Object Read only* is enough for a backup) with its access key ID and secret, the endpoint `https://<account id>.r2.cloudflarestorage.com`. Another remote name: `R2_REMOTE=name`. The Worker's bucket names are the repository variables `CF_R2_GALLERY_BUCKET` and `CF_R2_LANDSAT_BUCKET`. Do not run this in GitHub Actions and keep the result off public places: pending gallery uploads are not public and an Actions artifact of a public repository is.

**Restore:**
- git: `git clone tfs-…/repo.bundle tonguesfromspace`, then `git remote set-url origin <the GitHub address>`;
- local-only files: from the folder of the working copy `tar -xzf tfs-…/local-only.tar.gz` (the paths in it are relative to the repository);
- R2: `rclone copy tfs-…/r2/<bucket> r2:<bucket>`.
Try a restore into an empty folder once; a backup that has never been restored is a hope.

**When:** after anything that took long to make (a yearly surface, a Landsat run, onboarding glaciers) and at least weekly. **To do:** nothing runs it by itself; `launchd` or `cron` on this computer can call the first command, or do it by hand.

**What no backup holds.** Passwords and keys must be in a password manager, with a note of where each one is used:
- on this computer: `.dev.vars` (Worker secrets for `wrangler dev`), `scripts/.cdse-credentials` (Copernicus OAuth client), `scripts/.google-key` (Street View key);
- GitHub, *Settings → Secrets and variables → Actions*: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the variables listed in `docs/SETUP.md`;
- Cloudflare, the Worker: `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` (and `_2` to `_15`), `TURNSTILE_SECRET`, `GALLERY_ADMIN_TOKEN`, and the dashboard variables kept by `keep_vars`.
**To do:** check that every secret above also exists in the password manager.

## 4. Rollback

Every deploy from `main` is tagged (the last step of `deploy.yml`, *Tag what is live*):
- `deploy-<UTC date>-<UTC time>-<commit>`: never moves; one per deploy;
- `live`: moves to the newest deploy, and moves back when you roll back;
- `known-good-<date>`: set by hand on a commit that was checked on the live site (the first one is `known-good-2026-11-09`).

**Go back to a tag:** GitHub, *Actions*, *Build data and deploy*, *Run workflow*, **Use workflow from: the tag** (the *Tags* tab of the list), *Run workflow*. The run builds, tests and deploys exactly what the tag holds (no new GLAMOS data, nothing committed) and moves `live` to it. Then check `https://tonguesfromspace.org/cdse/ping` and a glacier page.
- **Fix forward afterwards:** the next push to `main` deploys `main` again, with whatever caused the problem. Revert the commit on `main` first, or the rollback is undone by the next push.
- **A rollback does not undo:** the Worker's secrets and dashboard variables (kept by `keep_vars`), what is in R2 and KV, and the refreshed data file already committed to `main` by the monthly run (revert that commit if it is the cause).
- **Without GitHub:** `git clone repo.bundle`, `git checkout <tag>`, `npm ci`, `python3 scripts/build_site.py _site`, then `cd worker && npx wrangler deploy` with the variables of `.github/workflows/deploy.yml` filled into `wrangler.toml` in place of the `__…__` placeholders.

## 5. After an incident

1. What did the *Uptime* issue, the Worker logs (`wrangler tail`) and `scripts/errors_report.py` say, and since when?
2. Roll back if a deploy caused it (section 4), then fix on `main`.
3. Add a test for what broke (the repository's habit: a bug found by hand becomes a test).
4. Write down what you learned here.
