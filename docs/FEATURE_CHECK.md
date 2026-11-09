# Feature check of the live site, 2026-11-09

Every feature below was driven in real Google Chrome (headless) against https://tonguesfromspace.org/ after the deploy of commit `dd544a99` (compact terrain files), with the real relay. The script is `tests/live_features.py`; run it again after a change that touches the page, the Worker or the data files. The upload checks that sit behind the person check are tested with fakes in `tests/test_worker.py` (`TestGallery`).

## Results: 15 checks passed, 0 failed

| Feature | What was done | Result |
|---|---|---|
| Deep links `#g=` | Opened all ten glaciers by id (`aletsch`, `gorner`, `fiescher`, `unteraar`, `corbassiere`, `zmutt`, `rhone`, `sgi-B56-03`, `sgi-B53-04`, `trift`); a compare link with both years; a timelapse link with its range | glacier, mode and years in the page state match the link; no script error |
| Old-link redirect | `/#g=aletsch&m=compare&a=2016&b=2026` | ends on `/switzerland/#g=aletsch&m=compare…`, state kept |
| GLAMOS stats | Stats tab (its id is `figures`; `t=stats` in a link opens it) | tiles AREA −28 %, LENGTH −3 387 m, THICKNESS AND VOLUME, ICE SPEED, WATER STORAGE; the area change matches 75.79 km² against 105.62 km² in 1850 and the length matches the page's own GLAMOS total (−3387 m) |
| Compare slider | Dragged the divider | split moved from 0.50 to 0.63 |
| Timelapse | Play, pause on a frame, play to the end | all 11 frames 2016–2026 seen; pause holds the frame |
| Colour modes | Natural, Infra, Bloody, Hot? | four different pictures, switching back to Natural leaves the false-colour ones (the styles are computed in the browser from the downloaded picture: no new relay request per style) |
| 3D view | Opened it on Aletsch; then the viewer on each of the ten Swiss glaciers | terrain file `B36-26.63b1b37f.bin` loaded (HTTP 200), picture drawn; all ten compact terrain files decode and start the viewer |
| Single-image export | "Your visual", Image, Download image | 1920 × 1080 JPEG, 370 KB |
| Animation export | Timelapse 2022–2025, Animation, Download video | H.264 MP4 (`avc1`), 1920 × 1080, 7.8 s, 3.4 MB |
| Gallery (live) | `/gallery/config`, `/gallery/list`, three refused uploads | config open; list public (17 items); no person check 400; failed check 403; 16 MB file 413; nothing stored |
| Size page | `/size`: list, About block, Volume 3D | ten glaciers listed; About block loads (it was stuck on "Loading…" before `c3a88ea5`); 3D mode draws; `data/tall-buildings.json` and `data/lake-depth/index.json` answer 200 |

## Gallery checks behind the person check (tested with fakes)

`tests/test_worker.py`, class `TestGallery` (8 tests), run against the real `worker/worker.js` with a fake R2 bucket and a fake Turnstile: a good picture is kept under `pending/` and is neither served nor listed; no token, no file or a failed Turnstile stores nothing; size limits (Content-Length 413; image over 4 MB, video over 15 MB and files that are too small 400); real file type and exact pixel size for all three formats (PNG as JPEG, JPEG as video, wrong or swapped size, MP4 without H.264); only the fixed list of details, unknown fields dropped; queue of 200 refuses more (503) and a file is kept once (409); four uploads an hour per address (then 429) and only allowed origins (403); moderation needs the admin token and approval publishes. Each check was switched off in turn in `worker.js` and a test failed every time (Turnstile result ignored, queue cap, file check, Content-Length limit, admin token).

## Findings

1. **"Your visual" opens on Animation, also for one year in map view.** The button calls `openVideo('video')` (`js/10-animation.js`, line 419), and the rule "one year is a picture" in `syncPane()` (`js/07-render.js`, line 173) only runs on later changes. A visitor who wants a picture must press Image first. The pane stays on "Download video" for at least 3 s. Not changed; one line would fix it: open on `image` when `state.mode === 'single'` and the view is not 3D.
2. **The compare divider is a horizontal bar** on this layout (Aletsch, desktop), dragged up and down; the check handles both orientations.
3. **`/size.html`, `/gallery.html` and `data/about-static.html` answer with a redirect** to the address without `.html` (Cloudflare). They work; each costs one extra round trip (the size page's About block loads after a 307).
4. **Not published, as intended:** `/iceland/`, `/iceland/vatnajokull/` and `/norway/` answer 404; `/home.html` answers 404 (the front page is `/`).
5. **Not checked live:** a successful gallery upload (it needs a Turnstile token from a person and would put an item into the moderation queue), phones (touch, two-finger map, share sheet; see CLAUDE.md, "Not yet verified on the live services"), the video export in Safari, and the data of Iceland, Norway and Svalbard (not public).
