# Ice edge lines (ablation zone): parked experiment

Open lines that follow the margin of the bare ice at the lower end of each glacier, for every year, computed in the browser
from Sentinel-2 L2A with a spectral index. Removed from the live page because debris-covered tongues are not detected
(the line ends about 1 km above the real tip on Aletsch, and Trift/Unteraar/Zmutt are poor). Kept here so the work is not lost.

## Files
| File | What |
|---|---|
| `index.with-ice-edge.html` | The complete `index.html` as it was with the feature working (state of 7 Oct 2026). Easiest way to bring it back or to diff against. |
| `ice-edge-feature.js` | The extracted code block (evalscript, mask download, line tracing, layers, timelapse handling). |
| `about-chapter.html` | The "Ice edge lines (experimental)" chapter of the About section. |
| `prototype/` | Python used to develop and test the method through the Worker: `lib.py` (helpers), `t2.py` (mask + crop with the SGI2023 outline), `eval.py` (share of each SGI2023 polygon found as snow/ice, all ten glaciers). They need the Worker URL in `lib.py` and a browser User-Agent. |

## Method
1. Per glacier-year one Process API request on the chosen scene (Sentinel-2 L2A, PNG class mask, same footprint as the picture).
   Classes: 0 no data, 60 other ground, 120 bare ice, 180 snow, 240 cloud/shadow (SCL 3, 8, 9, 10).
2. Snow or ice: NDSI = (B03 - B11) / (B03 + B11) > 0.4 and B08 > 0.11. Bare ice: of those, B04 <= 0.45 (own threshold, set by eye, not validated).
3. Gaps up to 60 m (3 px each side) in snow plus ice are closed, so moraine stripes do not split the ice.
4. Pixel edges between bare ice and other ground, inside the 1850 outline (a little widened), become a graph; open chains of at least 30 edges are kept, closed rings dropped, then smoothed.
5. Cached in IndexedDB by scene and `ICE_VERSION`. Compare mode draws the left year's line (yellow) and the right year's (red) in panes clipped to their own side; timelapse draws the current frame and preloads the others.

## Results (2023 scenes, share of the SGI2023 polygon found as snow or ice, strict thresholds)
Aletsch 88 %, Gorner 87, Fiescher 87, Unteraar 54, Corbassiere 82, Zmutt 53, Rhone 91, Findel 95, Fee 91, Trift 94.
Looser thresholds (NDSI 0.3, B08 0.06) added only 2 to 4 points and more noise.

## Why parked, ideas
- Debris-covered ice looks like rock. Ideas: use a thermal or texture cue (not in Sentinel-2), use the SGI outline plus the line only where the ice is clean, or combine with a DEM (slope and elevation near the tip), or the lowest-point terminus from `glaciers.js` (`terminus`).
- Cost: one extra Copernicus request per glacier-year (about 110 for all).

## Wired into index.html (what to restore, see the full copy for exact code)
- CSS: `--ice-a`, `--ice-b`, `.ice-chip`; layer-box entry (`#iceToggle`, `#iceNote`).
- Map panes `iceA` (z 431) and `iceB` (z 432), clipped in `clip()` like `paneA` and `paneB`.
- `updateCredits()` line for the layer; `drawIceFrame()` call in `showFrame()`; `updateIceLines()` at the end of `refreshAll()`; `clearIceLines()` in `chooseGlacier()`.
- About chapter (`about-chapter.html`) and the note in `CLAUDE.md`.
- `worker/worker.js` now passes the requested image format (PNG or JPEG) to Copernicus; that change is harmless and was kept.
