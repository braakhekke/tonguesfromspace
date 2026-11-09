# Performance baseline, 2026-11-09

What the public site costs a first-time visitor on a phone, before any size work. Measured with Lighthouse; WebPageTest was not run (see the end).

## Version measured

The live site at https://tonguesfromspace.org/ after the deploy of commit `c3a88ea5` (main, 2026-11-09): terrain files in the old format (Aletsch `B36-26.f285ae5b.bin`, 8.39 MB), the lake floors, tall buildings and About block shipped. Runs started at 01:58 local time, right after a terrain repack on the same computer had finished (01:57).

## Method

- Lighthouse 12.8.2, performance category only, `--form-factor=mobile`: the default mobile profile (Moto G Power emulation, simulated slow 4G throttling, 4x CPU slowdown).
- Cold cache: every run starts in a new Chrome profile (no cache, no storage, no service worker).
- Chrome: Google Chrome (headless new) on macOS; three runs per page, one after another; the median is reported.
- Transfer size is the sum of `transferSize` over all requests Lighthouse recorded (compressed bytes on the wire, redirects and third-party requests included). Request counts were the same in all three runs of each page.
- The explorer was opened at `/switzerland/` with no link state: it lands on Aletsch as a 3D timelapse (`landing: 'glacier3d'`) and fetches real Sentinel-2 pictures through the relay.

## Results (median of 3)

| Page | Score | LCP | LCP range | FCP | TBT | CLS | Transfer | Requests |
|---|---|---|---|---|---|---|---|---|
| Home `/` | 86 | 3.8 s | 3.8–3.9 s | 2.2 s | 95 ms | 0.00 | 5.91 MB | 31 |
| Explorer `/switzerland/` | 50 | 5.9 s | 2.9–6.0 s | 2.4 s | 813 ms | 0.06 | 18.49 MB | 157 |
| Size `/size.html` (redirects to `/size`) | 71 | 5.0 s | 5.0–5.3 s | 3.4 s | 18 ms | 0.12 | 0.90 MB | 45 |

The explorer's LCP varied between runs (6.0, 2.9, 5.9 s); the other pages did not.

## Where the bytes are

- **Home, 5.90 MB:** `data/home-hero/heights.bin` 2.00 MB and five hero pictures `data/home-hero/<year>.webp` of 0.33 MB each. The LCP element is the hero section whose background is a `blob:` image.
- **Explorer, 18.49 MB (tonguesfromspace.org 13.64 MB, wmts.geo.admin.ch 4.78 MB):** `data/terrain/B36-26.f285ae5b.bin` 8.40 MB; the teaser video `teaser/teaser-wide-new.<hash>.mp4` 3.66 MB (type Media, one request); swisstopo map tiles 4.78 MB; 114 fetch requests in all, among them the Copernicus relay (`/cdse/process`, 0.29 MB for one picture). Scripts 0.81 MB over 14 requests. The LCP element is `#map`.
- **Size, 0.90 MB:** the page itself 0.19 MB, 27 images (0.48 MB, mostly map tiles from swisstopo and EOX), scripts 0.10 MB. The LCP element is an EOX overlay tile (`overlay_bright_3...`).

## Notes

- Lighthouse reported that `/size.html` is redirected to `/size`; the measured URL was the redirect target. Cloudflare also answers `data/about-static.html` with a 307 to `data/about-static` (one extra round trip for the size page's About block).
- The measurement used Lighthouse's simulated throttling, so LCP is an estimate from the recorded trace, not a lab-applied delay.
- The explorer spends relay requests (cached by the Worker in KV); three runs were made.

## Not measured: WebPageTest

No WebPageTest API key was available in the session (none set in the environment), so no WebPageTest run was made. To add it: run the same three URLs on webpagetest.org with a mobile profile (for example Moto G4, 4G), first view only, and record LCP, bytes in and requests.

## Explorer after the terrain repack (2026-11-09)

Live site after the deploy of `dd544a99` (compact terrain files, `enc = 2`); same method, same page, three cold mobile runs, measured about 20 minutes after the deploy finished, on an idle machine.

| Explorer `/switzerland/` | Score | LCP | LCP range | FCP | TBT | CLS | Transfer | Requests |
|---|---|---|---|---|---|---|---|---|
| Before (`c3a88ea5`) | 50 | 5.9 s | 2.9–6.0 s | 2.4 s | 813 ms | 0.06 | 18.49 MB | 157 |
| After (`dd544a99`) | 51 | 5.8 s | 5.8–6.0 s | 2.3 s | 964 ms | 0.06 | 11.94 MB | 157 |

- **Transfer fell by 6.55 MB (35 %)**, which is the Aletsch terrain file: 8.40 MB (`B36-26.f285ae5b.bin`) became 1.82 MB (`B36-26.63b1b37f.bin`, 1.90 MB on the wire in the check). The biggest item on the page is now the teaser video (3.69 MB).
- **LCP did not move.** The median is 5.8 s against 5.9 s, and the "before" median came from runs of 6.0, 2.9 and 5.9 s, so the one fast run is noise, not a baseline. The LCP element is `#map`, and under Lighthouse's simulated throttling it is not waiting for the terrain file.
- **TBT rose from 813 to 964 ms** (median of three, not tested for significance). The compact format is decoded in the page (`inflateLayers` in `js/11-view3d.js`, a loop over every cell of the layers); that is a plausible cause, not a measured one.
- Request counts are unchanged at 157.

## What to look at next (from the numbers above)

- The teaser video is now the largest download of the explorer on a first visit (3.69 MB, type Media).
- swisstopo map tiles were 4.78 MB of the baseline explorer and are not ours to shrink.
- If decode time matters, the loop in `inflateLayers` could move to a worker or run on a typed array in one pass; measure TBT again before and after.

## For comparison later

The repack was committed and deployed later the same day; see the section above. Home and size were not measured again (they do not load terrain files).
