# Onboard runbook: any glacier in the world, owner-facing flow

Written 2026-11-11 from the owner's description. **This is the owner-facing flow for onboarding a glacier.** It replaces the walkthrough as the way the owner works: no guide, no stalling checkpoints, no old wizard screens. The scripts and algorithms behind it are the ones built for the Swiss glaciers (walkthrough/onboard code, box and view3d editors, Landsat build, SLC gap fill, `docs/DATA_SEARCH.md`, the yearly-surface package) and run **in the background only**. In the foreground the owner sees the viewers and buttons below, in this order, and nothing else.

Continue word: **`tongstep`**. When the owner types it, Claude reads the state of the current glacier session and carries out the next step (or reports what blocks it). Without it Claude does not move on after a button press.

## Trigger
The owner names a glacier (name, country; coordinates if the name is ambiguous). Claude resolves the place (web search if needed) and starts step 1 at once.

## Rules that stay (from CLAUDE.md, summarised)
- External numbers are copied as the source states them (rounding to at most 2 decimals allowed); unreadable sources are left out and listed as NOT READ.
- Imagery is never altered; masks only on copies. Landsat 7 stripe filling is the existing method (skill `landsat-slc-gap-fill`), shown as filled.
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
**Claude (background):** for every year from 1984 to the present, find the four best candidate scenes with the existing scene scoring (cloud, snow, season window of the glacier's hemisphere and climate, tongue visibility). **Sentinel-2 rule (owner, 2026-11-11):** for every year that has Sentinel-2 scenes, show **only Sentinel-2** candidates; only for years without Sentinel-2 use Landsat (5, 7, 8, 9). Landsat 7 candidates with stripes are **already gap-filled** before they are shown (existing method, donor cloud mask, colour matching per `landsat-colour-reference`). Candidates in one year are drawn the same way so they can be compared.

**Viewer:** one row per year, **1984 at the top, the newest year at the bottom**, four large thumbnails per row that open larger on click. Each tile says sensor, date, cloud and snow fraction. A row with fewer than four candidates says why (counts, reasons). The owner ticks one per year, or marks the year "no usable image".
**Button: `All images set`.**

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
- The viewer is one local page served by `scripts/serve.py` (reuse the box editor and view3d editor code, the scene-scoring and the Landsat builder). Background jobs are scripts started by Claude on `tongstep`, with progress files the viewer polls.
- Nothing is committed, pushed or published by Claude.
- Build state: see the first section of this file once code exists; until then this file is the specification.
