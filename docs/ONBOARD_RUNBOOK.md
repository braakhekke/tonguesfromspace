# Onboard runbook: any glacier in the world, owner-facing flow

Written 2026-11-11 from the owner's description. **This is the owner-facing flow for onboarding a glacier.** It replaces the walkthrough as the way the owner works: no guide, no stalling checkpoints, no old wizard screens. The scripts and algorithms behind it are the ones built for the Swiss glaciers (walkthrough/onboard code, box and view3d editors, Landsat build, SLC gap fill, `docs/DATA_SEARCH.md`, the yearly-surface package) and run **in the background only**. In the foreground the owner sees the viewers and buttons below, in this order, and nothing else.

Continue word: **`tongstep`**. When the owner types it, Claude reads the state of the current glacier session and carries out the next step (or reports what blocks it). Without it Claude does not move on after a button press.

## Trigger
The owner names a glacier (name, country; coordinates if the name is ambiguous). Claude resolves the place (web search if needed) and starts step 1 at once.

## Rules that stay (from CLAUDE.md, summarised)
- External numbers are copied as the source states them (rounding to at most 2 decimals allowed); unreadable sources are left out and listed as NOT READ.
- Preserve original source imagery. Colour corrections, masks and Landsat 7 stripe filling create derived display copies, with their provenance retained; stripe filling uses the existing `landsat-slc-gap-fill` method and is shown as filled.
- Every "set" button is the owner's. Claude never presses one, never writes a confirmation, sign-off or licence for the owner. A button stores `{step, time, parameters}` in the glacier's session record.
- Moving the box or strip after a later step has run makes everything downstream stale; the viewer says so before saving, and the downstream results are rebuilt only after the owner agrees.
- Minimum size 10 km² and the 26-per-region cap apply, unless the owner names the glacier explicitly: then the override is recorded ("owner request, date") and the run goes on.
- Same pipeline for every region; no region special cases in code (`features` flags only).
- Long jobs run in the background with a visible progress line in the viewer. Copernicus quota (about 250 images a day, shared with the public site) is respected: Sentinel-2 thumbnails are limited to the pick viewer's candidates.

## Step 1. Outlines and image box
**Claude (background):** intensive search for the best, the most recent and the oldest outline of the glacier (national, regional, global inventories; papers; historical maps). Each source's page is read for date, datum and licence; nothing from memory. Results go into the session record (and `walkthrough/outline-sources.json` when a verified national source is new).

**Viewer (foreground):** the outlines (newest, best, oldest, distinguishable) on an **EOX Sentinel-2 cloudless** background, with a **scale bar**. The image box is a draggable, resizable rectangle, default = the oldest outline plus a buffer. Live readout: box width and height in km, area, and whether Sentinel-2 needs **tiling** (threshold 24.9 km, the rule of `docs/ADD_A_GLACIER.md`).
**Button: `Image box set`.**

## Step 2. 3D strip
**Viewer:** the same viewer, the image box now fixed and visible. A strip (tip, azimuth, half width, back, up, the `strip3d` fields) can be dragged, rotated and placed. Button **`3D preview`**: a Mapterhorn terrain plus EOX overlay preview of exactly that strip extent (Claude checks Mapterhorn's coverage and terms for the place first and says so if a fallback is used).
**Button: `3D strip set`.**

## Step 3. Scene pick, 1984 to present

**This section is the current, reusable scene-picking procedure**, established with Perito Moreno on 2026-11-11. It supersedes single-tile Sentinel previews, L2A image display and automatic cross-orbit substitution. Swiss scripts run in the background; the owner uses the coverage viewer, scene picker and buttons described here.

### Inputs and season

- Read the saved **Image box set** and **3D strip set** parameters. Use that exact image box for every sensor and year; do not shrink it to make a scene eligible.
- Search from **1984 through the present year**, oldest row first. For southern-hemisphere sessions, the owner's fixed-date glaciological year is **1 April–31 March**, named by the ending year, with **31 March** as the target scene date. The current search window is **30 January–15 April**; retain the actual acquisition date even when it falls after the target. Northern sessions use their verified regional season. Store these settings in the session rather than hard-coding a hemisphere into the picker.
- **Sentinel first:** show only Sentinel candidates in years with available Sentinel scenes. Use Landsat 5/7/8/9 only in years without Sentinel availability. An incomplete or cloudy Sentinel pass, or an empty year in the main orbit, does not silently trigger a Landsat fallback. State what the searched catalogue/window actually provides; an empty search is not proof that no scene exists anywhere.

### Coverage and orbit viewer

Open `/<id>/coverage` from **Inspect coverage** in the scene picker. It shows the saved image box on **EOX Sentinel-2 cloudless**, with a scale bar, nominal MGRS tiles, acquisition-specific footprints and relative-orbit labels. Filter by year, orbit and pass; toggle constituent tiles, compare individual products with their same-pass union, and inspect cloud/shadow flags.

A fixed MGRS tile can be only partly imaged. Its nominal rectangle is not proof of observed coverage. Neighbouring tile names do not establish simultaneous acquisition: verify the **datatake, satellite, timestamp and relative orbit**. The inspector currently uses L2A catalogue geometry/SCL masks; these are useful for proposals and cloud scoring, not certification of final L1C pixels. It is not an orbital ground-track plot.

### Sentinel source and same-pass mosaics

1. Display **genuine Sentinel-2 L1C top-of-atmosphere imagery**. Request `sentinel-2-l1c` explicitly through the existing private local CDSE connection. Filter products to the intended satellite, acquisition timestamp and relative orbit, then verify actual response product names contain `MSIL1C` and match that identity. Appearance alone does not establish processing level.
2. A candidate is **one pass covering the whole image box**, assembled from as many neighbouring tiles as needed. Group by datatake/satellite/orbit, not calendar date alone. Reproject all pieces to the same saved box/grid. Never fill Sentinel gaps with another date, another orbit, interpolation or invented pixels.
3. Keep **product mosaicking** separate from **request tiling**. Large requests are split under the project's 24.9 km native-extent rule. Perito Moreno uses four equal preview request quadrants, assembled into one fixed-box image; that does not mean every glacier needs four requests or four MGRS products.
4. Keep per-pixel source-product index maps and source-ID legends beside the previews. Real black RGB is not automatically no-data. Require **zero missing pixels in the actual L1C alpha mask** before a preview is selectable; never round 99.x% to 100%. Preview certification is not native-resolution certification: repeat the source/coverage check on the final **10 m** render before downstream use.
5. **L2A SCL is scoring only**, not the displayed RGB. Record its own coverage separately from L1C coverage. The current proposal gate requires at least 98% scoring-mask coverage; passing it does not prove full L1C coverage. Conversely, small SCL gaps need not mean missing L1C image pixels. This gate can miss otherwise usable L1C acquisitions, so catalogue/season limitations remain explicit.

### Sentinel colour correction

Use the exact Swiss natural-colour evalscript, compiled from **`shared/copernicus.ts` → `imageEvalscript('natural')`**, including its **L1C Rayleigh treatment** and fixed display curve. CDSE handles source reflectance scaling/calibration. Do not introduce per-year ice/snow histogram matching, whitening or automatic scene-dependent colour fitting.

The picker offers **Swiss colour · L1C** and **Simple RGB · L1C**, both from the **same L1C samples and acquisition**. Simple RGB uses the current fixed gain-2.5 display; it is not an L2A or raw-DN comparison. Keep source identity, mosaic geometry and source maps unchanged between displays. Preserve original source data; corrections create display copies. Process pixel effects in the renderer/canvas, never CSS/SVG filters.

**Superseded:** provider `visual`/TCI thumbnails and the intermediate calibrated L2A B04/B03/B02 display. The legacy L2A recolour tool must refuse to overwrite L1C output. Its BOA offsets/no-Rayleigh procedure must not be carried over to L1C. Raise `CDSE.version` in `js/03-imagery.js` whenever scene scoring/rendering changes (current baseline: `l1c-v21`); changing this documentation needs no cache bump.

### Ranking and choosing an orbit

- Score the mosaic union over the saved box, glacier and tongue masks, rather than scoring one tile. Current ranking puts computed clear choices first: **glacier cloud ≤15% and tongue cloud ≤5%**. It then sorts by `glacier cloud + 2 × tongue cloud + 0.5 × glacier shadow`, rounded to two decimals for ranking, followed by distance from the target date and date. These are algorithm thresholds, not manually verified cloud assessments.
- Present **up to four distinct acquisition dates per year per orbit**, with large clickable thumbnails, sensor, date, cloud/snow information and coverage/provenance notes. Say why fewer choices exist. Cloudy complete passes may remain visible as the best available options; full coverage does not imply a clear glacier.
- Show orbit groups separately and offer an annual comparison preview for each. Summarise years with full-box choices, years with a clear choice and annual quality. Recommend an orbit from those computed metrics, but the owner selects the main orbit. Prefer a consistent relative orbit to reduce geometry changes; **same orbit does not guarantee registration, and no jitter improvement is claimed without measurement**.
- Preserve picks independently while switching orbit comparisons. Within an individual year, **Try another orbit** reveals alternatives. Selecting an alternative creates a **year-only exception**, visibly labelled with its orbit and editable reason; **Return to main orbit** removes it. Never switch other years automatically. Client and server require an explicit valid exception record for every off-main-orbit selection.

### Landsat preparation

Use `scripts/onboard_scenes.py` around the existing `scripts/build_landsat.py`. Join same-day, same-satellite adjacent-row scenes where necessary and verify actual coverage; joining alone does not establish correct alignment. Landsat 7 SLC-off candidates must be **gap-filled before selection**, using the existing donor/cloud-mask and donor colour-matching machinery (`landsat-slc-gap-fill` and `landsat-colour-reference` skills). Inspect seams, clouds copied into gaps and no-data blocks; retain provenance.

Check that the ice-free LAND colour-reference patch is actually land. At Perito Moreno, `auto_land` included neighbouring ice and caused severe casts. Its saved `landsat_colour_mode: surface-reflectance` therefore uses NOMATCH rendering, with the L8 quantile/blue corrections disabled; donor matching/gap filling remain active. **Do not silently restore automatic LAND matching or copy this glacier-specific fallback to every new glacier.** Residual colour differences remain visible and labelled.

### Selected-image timelapse and saving

**Timelapse selected (N)** plays only actual owner selections, in ascending year order, including Landsat and explicit orbit exceptions. Skip unpicked and “no usable image” years; never insert top-ranked substitutes. Preload before autoplay; provide pause, step, scrub, close/Escape and cancellation/cleanup. Label each frame with its actual date/sensor/orbit and any exception. The separate orbit-comparison preview may propose top-ranked images and must remain distinguishable from selected-only playback.

Fit every frame to **one fixed display rectangle derived from the saved image box's Web Mercator aspect**, irrespective of native thumbnail dimensions. Keep captions from changing stage size; resize for desktop/phone without cropping. The regression case is Landsat **640 × 689** versus Sentinel **960 × 1032**: Sentinel must not appear larger. This fixes display scale, not geometric coregistration.

Require one explicit decision for every year with candidates; offer **No usable image** and list years without candidates separately. Restore the latest valid draft. Rebuilds preserve acquisition identity through candidate aliases, not rank or filename alone; unavailable prior choices need review, never silent replacement. Candidate-version validation rejects stale saves.

**Button: `All images set`.** Only the owner presses it. Save `primaryOrbit`, `orbitExceptions` (`{orbit, reason}` by year), `exceptionsByPrimaryOrbit`, `picksByOrbit`, flattened `picks`, Landsat picks, unavailable years, season and `candidateVersion`. Draft saves do not set the completed scene step. Read the saved state on **tongstep** before starting data search.

### Background commands and verification

Use the existing environment with the build dependencies:

```sh
experiments/aletsch-yearly-dem/.venv/bin/python scripts/onboard_coverage.py <id>
experiments/aletsch-yearly-dem/.venv/bin/python scripts/onboard_scenes.py <id> sentinel --from 2015 --to <present-year>
experiments/aletsch-yearly-dem/.venv/bin/python scripts/onboard_scenes.py <id> landsat --from 1984 --to <last-needed-Landsat-year>
experiments/aletsch-yearly-dem/.venv/bin/python scripts/onboard_scenes.py <id> assemble
python3 scripts/onboard_server.py 8010
```

The Sentinel command delegates to **`scripts/onboard_sentinel_l1c.py`** and assembles automatically; the legacy mosaic entry point also delegates there. Inspect `sentinel-l1c-progress.json`, logs, source maps, exclusion reports and the assembled `scenes.json`. Commands use the configured session season; adjust year bounds to the actual archive/present. Credentials and short-lived signatures stay private, outside chat and saved public URLs. Requests use the existing local CDSE path rather than the public Worker/KV; still respect provider limits and cache reusable work.

Before handing over the picker, verify actual L1C identities, one-pass mosaics, zero preview holes, distinct dates, colour-mode consistency, preserved choices, explicit orbit exceptions and image paths. Inspect representative images and Landsat fills. **Exercise the actual bound buttons after full page bootstrap**: the earlier nonresponsive timelapse came from missing event bindings, despite working playback functions. Test selected-only playback, preload cancellation and equal display extent across sensors/viewport sizes. Relevant regressions: `tests/test_onboard_mosaic_choices.py`, `tests/test_onboard_sentinel_colour.py`, `tests/test_onboard_timelapse.py` and `tests/onboard_timelapse.cjs`. Report skipped optional-dependency checks and unmeasured registration/native-resolution coverage honestly.

## Step 4. Data search
**Claude (background):** rigorous search, using `docs/DATA_SEARCH.md` (skill `glacier-data-search`): papers, inventories; local, regional, national and international sources; ICESat and ICESat-2 points over the glacier, ASTER, stakes, ice cameras; mass balance, speed, radar, seismic, length change, surface change, outlines, every other data type. The experimental outline around the tip is computed as for the Swiss glaciers. Every data source used for the Swiss glaciers is checked for whether it applies to this glacier. Every link is opened and every file and licence read; ledger in `docs/sources/<region>-<glacier>.md` with read / NOT READ.

**Viewer:** a neat overview of everything found (type, source, dates, datum, licence as read, role, read / NOT READ). The owner can add and edit sources.
**Button: `Data input set`.**

## Step 5. Elevation models
**Claude (background):** search all elevation data that covers the 3D strip: regional, national, international, airborne, terrestrial, satellite; missions and campaigns, with real survey dates. Build the best possible **yearly elevation models for 2016 to the present** for the strip area, fitted to the date of the picked image of each year, with the yearly-surface package (`experiments/swiss-yearly-dem` / `experiments/clean-yearly`, made region-neutral where needed): mass balance of the glacier, or of nearby glaciers if it has none, stakes, fits on bedrock, ICESat-2 validation. Every yearly surface carries an uncertainty and a quality grade, and is labelled **modelled**.

**Viewer:** a 3D viewer with the yearly surfaces, the picked Sentinel-2 (or Landsat) images draped on top, and a **timelapse mode**.

## Later steps
Not defined yet (texts and `GLACIER_INFO`, Worker centres and cloud masks, terrain bundle and strip pictures, board and review sign-offs, About text). They are added here when the owner describes them.

## State and implementation notes
- One session record per glacier (`data/regions/<region>/…` record plus a session file with the step states and button times). The existing fingerprints keep downstream steps stale-aware.
- Current viewers are local routes served by `scripts/onboard_server.py` on port 8010. They reuse the placement, scene-scoring and Landsat building blocks. Background builders retain progress files/logs; do not claim viewer polling where it has not been implemented.
- Nothing is committed, pushed or published by Claude.
- Step 3 above is the authoritative scene-picking procedure; current local state is recorded below.

## Current implementation state (2026-11-11)

- Local server: `scripts/onboard_server.py`, port **8010**. Placement viewer: `scripts/tools/onboard-viewer.html`; coverage/orbit inspector: `scripts/tools/onboard-coverage.html`; picker: `scripts/tools/onboard-scenes.html`; data overview: `scripts/tools/onboard-data.html`.
- Sessions live in `experiments/onboard/<id>/`: `session.json`, outlines, coverage metadata, Sentinel/Landsat previews, per-pixel provenance, `scenes.json`, source catalogue and logs. Keep the owner's saved decisions intact when rebuilding proposals.
- Perito Moreno's box, strip and images have been set by the owner. Its selected main orbit is **R010**, with an explicit **R053 exception for 2016**, reason **Clouds / haze**. This is a session-specific choice, not the default for another glacier.
- Current verified-preview snapshot: **82 L1C candidate mosaics**; both orbits have candidates in the **11** Sentinel years 2016–2026. Computed clear-choice counts are **6** years for R010 and **2** for R053 under the stated thresholds. These describe the searched proposals, not the entire archive or measured geometric jitter.
- Historical approaches superseded by Step 3: single-product/TCI previews → same-pass mosaics → intermediate L2A colour correction → genuine L1C with the Swiss evalscript. Earlier strict-SCL candidate counts and “step 3 still building” tasks are obsolete. Do not resume those old rebuild instructions.
- Owner scene choices were saved on 2026-11-11 at **16:30:03 +0100**. Step 4 data input was set by the owner on 2026-11-11 at 21:36:28 +0100. Step 5 has started. Nothing has been committed, pushed or published by the agent.

### Perito Moreno data-input viewer (2026-11-11)

- Owner set scene choices at 16:30:03; `tongset` was treated as the continue signal. Scene selections are retained unchanged.
- Step 4 overview: http://localhost:8010/perito-moreno/data. Editable source notes, include/exclude, one constraint/validation/context role per source, extra-source form and **Data input set**. Drafts do not set the data-input step.
- Catalogue/evidence: `experiments/onboard/perito-moreno/sources.json`, `research/`; ledger `docs/sources/ar-perito-moreno.md`. Reading states and unresolved access/licence/datum issues stay visible.
- Experimental tip arc: `scripts/onboard_tip_outline.py`, existing Swiss GlaViTU inference wrapper with global weights, exact saved L1C pass and an inventory-based cross-line. Owner request applied on 2026-11-11: extend the window from 2 km to 6 km and smooth using the Swiss 5 m ring sampling / 20 m Gaussian method. All 11 selected Sentinel years (2016–2026) rebuilt and visually checked. Local only, unvalidated; model/output rights remain unresolved.
- Step 5 begins after the owner presses **Data input set** and continues. No data-input confirmation is written by the agent.

### Perito Moreno elevation assessment (2026-11-11)

- Data input is set; the owner’s extra note requested the 6 km smoothed arc above. Reply is retained separately in `session.json:agentReplies`; the owner’s selections, approval and note were preserved.
- Step 5 evidence: `experiments/onboard/perito-moreno/elevation/`, root `elevation-status.json`, logs, and ledger `docs/sources/ar-perito-moreno.md`. The existing data viewer shows the elevation assessment without another approval checkpoint.
- Computed screening snapshot: 103 dated AST14DEM v004 files from 2016 onward downloaded. Two adjacent scenes of 2021-10-30 passed a preliminary robust plane/gradient rock tie. The ten strongest candidates were then checked with the Swiss xdem Nuth–Kääb approach and withheld spatial rock blocks; none passed the provisional 8 m NMAD screen. This does not prove the entire ASTER archive is unusable, or certify the untested glacier pixels.
- A Copernicus GLO-30 tile is available as stable-terrain reference; its composite radar epoch cannot be relabelled as an annual optical ice surface. ASTER and ICESat-2 remain validation sources as saved by the owner.
- Repeat-track ATL06 files were read with original dates, height/geoid/quality fields. Summary and strip/outline intersections are stored locally. Quality flags and a 2016 outline alone do not exclude later retreat/water contamination.
- Published IGN aerial/UAV footprint layers returned zero features for the image box. High-resolution DEM WFS layer queries failed with unknown feature types, so no blanket absence of IGN elevation data is inferred.
- Missing inputs: accessible dated PGO DSMs/fact sheets or study DEMs (SPOT/Pléiades/TanDEM-X), plus an appropriate local balance/seasonal forcing series. PGO service access fails TLS; its published guide also requires an activated account. No account was created, TLS check bypassed, or message sent to investigators.
- **Do not export annual DEMs or an annual-height timelapse until acceptable dated anchors and a defensible fit are available.** Record the data limitation honestly; a static baseline or a dh/dt raster is not eleven measured surfaces. Continue the build when those inputs become accessible.

### Reference-guided arc corrections and terrain provenance (2026-11-11)

- If the owner accepts particular yearly arcs as references, retain their exact geometry and selected-acquisition identity. Redo the poor year using its own imagery within a bounded corridor around those references; preserve full-front topology and smoothing. Keep weak-evidence sections explicitly reference-constrained, not independently observed. Never silently copy a reference year as a measured target-year outline.
- Implementation: `scripts/onboard_refine_tip_arcs.py <id> --reference <target>:<accepted-year>`. Rules/snapshots live in `tip-arc-reference-rules.json`; the normal arc builder reapplies compatible refinements and rejects stale accepted references after a grid/acquisition change. The viewer can overlay the reference line. Perito Moreno: 2016 uses 2017, 2018 uses 2019; all nine other arcs remain unchanged.
- **Mapterhorn source tracing belongs in the elevation search**, not just preview setup: inspect the actual source catalogue/file list, coverage where accessible, date, datum and terms. Trace source dependencies so a delivery service and its source DEM are not counted as independent anchors. Perito Moreno's catalogue indicates GLO-30 base; the cached-tile/source-tile numeric comparison supports that inference. This adds terrain context, not a new annual survey series. Evidence and limitations are in the glacier ledger.

### First-model fallback from bed, thickness and change rate (2026-11-11)

The owner correctly identified that Koch's bed + 2023 thickness + 2019–2023 change-rate maps support an initial reconstruction. Do not make acquisition of a separate independent DEM a blanket prerequisite for **any** prototype. A deliberately coarse model can be shown while the stronger yearly-surface reconstruction remains in progress.

- `scripts/onboard_koch_surface.py` builds `S(t) = max(B, B + H_ref + rate × Δt)` on verified overlapping source support. Reconcile CRS, transforms, pixel orientation, nodata, reference epoch and units first. Require an explicit assumption for a missing source CRS; do not silently flip a south-up raster.
- Keep the source fields' shared model lineage visible: this is a reconstructed reference surface, not an independent measured DEM. Declare a nominal reference day if only a year is supplied; keep it separate from the actual source survey dates and the chosen image date.
- Label the published rate period, extrapolation years, static context outside the source fields, experimental margin masks and assumed lake levels. Do not invent calibrated uncertainty or imply that constant-rate projection resolves annual/seasonal variability.
- Foreground: the same selected-image 3D strip/timelapse, with a simple support view and model notes. Perito Moreno local prototype: `/s/perito-moreno/koch-prototype.html`, approximately 100 m mesh, nominal reference 2023-03-31 explicitly assumed, source checks and outputs under the session folder.
- This supersedes the earlier step-5 no-export blocker **for the labelled exploratory prototype**. Dated independent anchors, local forcing and validation are still required to improve it to the intended full yearly product.


### Dated forcing and hard glacier edge (owner instruction, 2026-11-11)

Implemented in `scripts/onboard_surface_constraints.py` and `scripts/onboard_koch_surface.py`. Minowa/Skvarca cumulative stake readings are differenced on their actual dates; cm-to-m conversion is computed here. QC rejects nonpositive durations, gaps over 45 days, negative ablation and rates over 0.5 m/day (analyst screening thresholds). Missing days use a measured monthly climatology, explicitly estimated. `stake-forcing.json` records coverage per Apr–Mar ending-year, thresholds, source hash and computed forcing. No claim of observed annual balances after the record ends.

The integrated ice-ablation forcing is detrended between nominal 2019-03-31 and 2023-03-31, then differenced at each selected image date and the assumed reference day. This preserves Koch mean dh/dt and reference identity instead of adding ablation twice. An analyst taper applies the full anomaly below the paper's S1 elevation (230 m MSL), tapering to zero at 485 m MSL; it is not measured elevation-bin SMB. Compensating emergence is implicit and uncalibrated. Historical glacier-wide geodetic balance remains context because it does not isolate this tongue/time interval. Available ITS_LIVE velocity is not yet a flux-divergence fit; shared-source GPR is consistency evidence; ASTER/ATL06 remain withheld validation.

`tip-arcs-unsmoothed.geojson` stores actual hard polygon masks reconstructed from cached 10 m probabilities without median/Gaussian contour smoothing. For poor 2016/2018, use target-image reference-guided boundaries without Gaussian offset smoothing; accepted reference topology remains a prior. The lower arc closes at its upstream cross-line and joins the fixed mapped inventory upstream. Original accepted/display arcs are preserved. All area outside the resulting glacier mask within the strip, including mapped land, is flat at the assumed 178 m lake plane as requested. The ice mesh is clipped to the mask and has vertical edge walls, so coarse mesh interpolation cannot slope ice into the lake. Inside the mask but outside Koch support remains labelled static context. This is an experimental model, not independently validated annual DEMs.

Checks: outside-mask raster heights exactly equal the assumed plane in all eleven years; tests cover hard clipped geometry, lack of edge ramps, mean-rate preservation, source-grid orientation and reference-guided arcs.


### Correction: preserve land terrain (owner, 2026-11-11)
Supersedes the preceding “all outside = lake” instruction. Keep the unsmoothed hard glacier edge, but restore GLO-30 terrain heights on non-glacier land. Only water outside the glacier mask is assigned the assumed lake level. Selected-date low NIR/SWIR and green/NIR contrast identify water with a low-terrain/previous-glacier guard; near-level GLO-30 lake context covers outside the optical grid. This is experimental water classification, not a surveyed shoreline. Clip the complementary terrain mesh away from glacier ice, retaining hard glacier faces against the local background height. Dated stake forcing and all owner selections are unchanged.
