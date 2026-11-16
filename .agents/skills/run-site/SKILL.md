---
name: run-site
description: Launch the Tongues from Space site locally and look at it, to see that a change really works in the page. Use whenever asked to run, open, try, screenshot or check the site or a change on it (explorer, size page, home, gallery, a language, a phone-size window, a colour style, compare, timelapse, 3D, an export), after changing js/, css/, html pages, i18n or data the page shows, and before saying a visible change is done. Gives the server, a screenshot-and-state helper, what to click in the manual check list, and the live feature check.
---

# Run the site and look at it

Tests prove functions; this proves what a visitor sees. Do both for a visible change (`npm run check`, `npm test`, and this).

## The server

- The owner often has `python3 scripts/serve.py` running already. Check first: `curl -s -m 5 http://localhost:8000/cdse/ping` answers `{"relay":true,"managed":true}`. Reuse it; do not start a second one on the same port or stop theirs.
- Otherwise: `python3 scripts/serve.py --no-browser` (background; `--port N` for another port, then pass `--base http://localhost:N` to the helper). It serves the repository files, the Copernicus relay with the credentials of `scripts/.cdse-credentials` (never print or open that file) and the language prefixes.
- Local addresses: `/` is the region picker (`home.html`), the explorer is `/index.html#g=<id>&m=single|compare|timelapse…`, `/switzerland/` redirects to it, `/de/…` and `/fr/…` are the same files in another language. Link parameters are read in `js/04-state.js` (`g`, `m`, `a`, `b`, `from`, `to`, `one`, `s` = natural/false1/false2/false3, `t=stats`, `v=3d`, `r=` region).
- The built site (what is deployed) differs: `python3 scripts/build_site.py _site`, then `TFS_SITE_DIR=_site` for the tests.

## See it: the helper

`python3 .Codex/skills/run-site/scripts/shot.py '<page>' --out <scratchpad>/x.png [options]` opens the page in headless Chromium, with the film and guide marked as seen, and prints what actually opened plus every page error. Options and examples are in its header (`--phone`, `--lang de|fr`, `--click SEL` (repeatable), `--eval JS`, `--scenes N`, `--chrome`, `--full`).

**Then Read the PNG.** A blank or half-drawn frame is a failure even when the exit code is 0. Check what the helper prints, not only the picture: `explorer {"glacier": …}` must be the glacier you asked for (an unknown `#g=` silently opens Aletsch), `years_with_scene` should reach the number of years, and the `status` line says why a year is missing.

- `--scenes N` waits for the scene search. A glacier nobody opened before costs about 100 Copernicus requests and the relay's cache writes, the quota the public site lives on: do it for the glaciers you need, not for all of them. Without it the map and texts are fine to look at.
- For a change in another language add `--lang de`, then `--lang fr`.
- For a phone: `--phone` (390 x 844, touch). The helper notes when the page scrolls sideways.
- A control it could only press "in the page" was covered or off-screen; a visitor could not have clicked it. That is a finding, not noise.

## Manual check list (what to cover for a change)

Pick what the change touches; for something shared (layout, tokens, i18n) do all of it.

1. Status line under the years: "Scenes found…" (`#status`), no red error.
2. Modes: single, compare (`#modeCompare`, drag the divider), timelapse (`#modeTimelapse`, `#playBtn`).
3. The colour styles `#styleNatural`, `#styleFalse1`, `#styleFalse2`, `#styleFalse3`: four different pictures, back to natural restores it. Never a CSS or SVG filter (Safari on iPhone ignores them); pixels are processed in a canvas.
4. Tabs and the Stats card; 3D view (`#view3dBtn`, back with `#viewMap`).
5. A phone-size window: map first, then the panel, then the story; two fingers move the map.
6. Another language when any text changed (skill `i18n-sync`).
7. Exports: `#videoBtn` opens the pane. Image: `#vkImage` then `#vsGo` gives a JPEG. Animation: `#vkVideo` then `#vsGo` gives an MP4; check with `ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate <file>` (H.264, 1920 x 1080 by default; 1080 x 1920 for 9:16; 30 fps). The bundled Chromium cannot encode H.264: use `--chrome` or the live script below.

## The live feature check

`python3 tests/live_features.py <outdir> [only]` drives real Chrome through deep links, stats, compare, timelapse, colour modes, 3D, both exports and the gallery probes. It is not part of `unittest` and defaults to the **public** site; `TFS_LIVE_URL=http://localhost:8000` points it at the local one. It uses the real relay (cached pictures, or Copernicus requests) and sends three refused gallery uploads, never a stored one. `only` is a substring of a check name: `deep links`, `GLAMOS`, `compare`, `timelapse`, `colour`, `3D`, `image export`, `animation export`, `size page`, `gallery`, `old-link`. Run the checks that match the change, not everything each time.

## What cannot be checked here

Real iPhone behaviour (two-finger map, share sheet, animation panel size) and the video export in Safari are unverified (AGENTS.md, "Not yet verified"). Say so when a change touches them instead of reporting the desktop result as covering them.

## After the look

Report what you saw (which pages, sizes, languages, what you pressed), what you did not cover, and any page error. If the change touched glacier data, also run the board refresh (skill `board-sync`).
