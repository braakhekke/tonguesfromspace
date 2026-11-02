# Runbook: everything Aletsch and Gorner have, for the next Swiss glacier

Written 2026-11-01 from the Aletsch (B36-26) and Gornergletscher (B56-07) runs. **Standing instruction (owner):** after the owner has checked the input imagery (the Sentinel-2 pins and the Landsat picks) and says go, Claude runs everything below by itself, in order, without asking, and reports at the end. Claude never writes sign-offs or confirmations, never commits or pushes (the owner does), and publishes nothing outside the repo.

This file is the single list of steps. Method and reasoning: `docs/YEARLY_DEM_METHOD.md`. Plan and owner gates for all nine glaciers: `docs/PIPELINE_SWISS.md`. Source search: `docs/DATA_SEARCH.md`. Where each file lives: `docs/REFERENCE.md` (rows for B36-26 and B56-07).

## One package for all four glaciers (2026-11-02) - read this first; where it and the older text below differ, this wins
Aletsch (B36-26), Gorner (B56-07), Fiescher (B40-07) and Rhone (B43-03) now all run through **`experiments/swiss-yearly-dem/`** (`GLACIER=<id>`, folder `<id>/`, venv as below). The older folders (`aletsch-yearly-dem`, `gorner-yearly-dem`, `rhone-yearly-dem`) are history; only `aletsch-yearly-dem` is still imported (GLAMOS bins, `model_v1`, `model_2026`). Why: a comparison of the four on 2026-11-02 found the same step done four ways. Order per glacier: `strip_inputs.py` -> `lidar_dates.py` -> `fetch_atl06.py` -> `strips.py` -> `gval.py` (choose the days, put them in `params.json`) -> `donors.py` (only where there are no own bands) -> `model.py` -> `gval.py` again -> `aster_check.py`, `stakes_check.py` -> `../yearly_uncertainty.py <id>` -> `refresh_site.py` -> `refresh_viewer.py` -> `python3 scripts/build_terrain_bundle.py --id <id>`. `params.json`: `a1_year`, `a2_year`, `t1`, `t2`, `glamos_a2`, `donor` (`own`, a glacier id, or `line`), `edge_m`.
The rules that are now the same everywhere:
- **Survey days are flown days.** A1 and A2 sit on a day a swisstopo image strip was flown over the ice (`strips.py`, layer `ch.swisstopo.lubis-bildstreifen`, strips covering under 5 % of the ice and days after 30 Sep ignored). `gval.py` tries every pair, keeps the lowest ICESat-2 rmse; pairs within 0.05 m are a tie that ICESat-2 cannot separate, and the tie goes to the GLAMOS date (`glamos_a2`) if it is among them, else to the strip covering most ice. Never a fitted offset ("30 Sep minus 45 days": Aletsch before) and never a day without a strip (Rhone's 2023-08-23 before).
- **Lidar days (`model.py`):** a tile takes the day holding at least 85 % of its points; else, if every day with more than 2 % of its points lies within 60 days, the point-weighted mean day (date uncertain by up to about a month; the Aletsch tiles are like this); else no lidar there. Flown 2021 or 2022 does not matter, the day does. No default day for unread tiles.
- **ICESat-2 shots:** quality 0, h_sigma under 1 m, 2023 ice, July to October, slope under 20 degrees, **not more than 10 m above the higher of the two surveys** (the old 15 m above the newest surface dropped all 164 Aletsch shots of 2020), physical envelope not below 2 x (A2 - A1) - 10 m from the A1 surface. The published rmse is **leave-one-granule-out** (the pair of days chosen on the other granules); the fit with the used days is reported next to it.
- **Band balance:** the glacier's own GLAMOS bands where they exist (Aletsch, Rhone); otherwise the candidate with the lowest ICESat-2 rmse over all shots among those whose bins cover at least 98 % of the 2023 ice cells (`donors.py`, `donors.json`): Fiescher -> Aletsch (the only one covering 1678 m), Gorner -> the borrowed line. One `lowering()` in `shape.py` for all, counted from the A1 year; the 2026 melt timing is the Aletsch figure's curve for all.
- **Uncertainty:** `experiments/yearly_uncertainty.py` for all; sigma_A = rmse of the 2023 shots when there are at least 100, else the rmse of the year with the lowest rmse among the years with at least 100 shots (an upper bound, said so; Rhone, from 2021). Never the Aletsch value, never the rmse of all shots (it sends k to zero). Years before A1 (2016 for Aletsch and Fiescher) are extrapolated backwards (sigma grows with the years from A1).
- **Margin fade (80 m): Gorner only** (owner, 2026-11-01); `edge_m` in `params.json`, default 0. Fiescher had it by accident of the generic default until 2026-11-02 and no longer does.
- **Labels:** an anchor year is `measured`; so is a lidar year when the lidar sits on at least half of the ice cells; years before A1 are `extrapolated`; 2024 and 2025 `extrapolated`; 2026 `estimate`.
- **Checks:** ASTER AST14DEM with the same gate for all (rock NMAD at most 15 m, 300 rock and 200 ice cells; Aletsch's RAGMAC reading is a different product and stays in its ledger); stakes with `stakes_check.py` for all (type 1, annual files, from the year after A1, cells of modelled ice inside the 2023 outline).
- **Texts:** `refresh_site.py` writes every sentence that depends on a number, from the run's files; the map polygons, the ice-bed section and the licences are kept from the shipped JSON. Do not hand-edit `data/yearly/<id>.json` for numbers.

## Where the code is
- `experiments/aletsch-yearly-dem/` and `experiments/gorner-yearly-dem/`: the two finished runs (local, gitignored). **Gorner is the closest precedent** (it has no GLAMOS band balance, so it borrows one; it has ICESat-2, ASTER, bed checks, the Aletsch viewer, SR pictures).
- `experiments/swiss-yearly-dem/` (cfg-driven, `GLACIER=<id>`): the generic package being built for Fiescher in another chat (state: memory `project_fiescher_yearly_run`). **Use it for the next glacier once Fiescher has finished**, and when you fix something in a Gorner script, fix it there too. Do not edit it while the Fiescher chat is working in it.
- `experiments/aletsch-sen2sr/run_strip.py`: SR pictures, any glacier with `GLACIER=<id>`.
- Venv for all of it: `experiments/aletsch-yearly-dem/.venv/bin/python` (rasterio, geopandas, earthaccess, fitz). `experiments/aletsch-sen2sr/venv` for SR (torch, mlstac).

## 0. Preconditions (owner's part; check, do not do)
1. Strip confirmed in the walkthrough (`stripConfirmation` in `data/regions/ch/<site>/glacier.json`) and the terrain bundle built. If the strip changed, everything below must be redone.
2. Sentinel-2 pins for 2016 to the newest year in `data/scenes.json` (`glaciers.<id>.picks`) and Landsat picks done. These are what the viewer textures and the SR step process.
3. The owner's "go". Read `data/review-signoffs.json` and the board `tasks` first: every record with a note and no reply is a task.
Stop and ask only if one of these is missing.

## 1. Source search and ledger (mandatory, before modelling)
`docs/DATA_SEARCH.md` for this glacier: write `docs/sources/switzerland-<glacier>.md` (exact dates, datum, licence, read / NOT READ). Things that mattered:
- **GLAMOS volume-change tables** (`experiments/aletsch-yearly-dem/glamos/zip/volumechange_2025_r2025_series.csv` and `..._allcombinations.csv`): which two surfaces are the anchors, their `date_start`/`date_end`, source names. The two files name the same surface differently (`sa3d-2023` in the series, `sa3d-2018` or `sa3d-2019` in all-combinations): quote the file you used.
- Does GLAMOS have **band balance** (`massbalance_fixdate_elevationbins.csv`), **stakes** (`glamos/point/z/<annual|winter|intermediate>/<name>_*.dat`) for the glacier? Gorner: no bins, stakes only 2003-10-03 to 2008-04-23. Fiescher: neither. Write down what is missing; the page says so instead of showing empty rows.
- Radar beds: GLAMOS ice thickness release 2020 (`experiments/aletsch-yearly-dem/src/glamos_thick2020/B..._*_GlaThiDa.txt` and `_vaw-archiv.txt`).
- ASTER: the RAGMAC set (`ragmac/ALE_CH`) covers **only Aletsch**. For any other glacier use NASA AST14DEM (step 7).

## 2. Inputs on the 20 m grid
`strip_inputs.py` (Gorner copy of the Aletsch script; generic version: `swiss-yearly-dem/strip_inputs.py`): A1 = older swissALTI3D edition, A2 = newest edition, L = swissSURFACE3D raster at 20 m, ice masks (`out23`, `ice17`), `inside` the strip, grid origin `e0, n0` aligned to 1 km tiles, rows south to north. Writes `strip_inputs.npz`.

## 3. Real survey days
- **Flight strips** (swisstopo `ch.swisstopo.lubis-bildstreifen`, api3.geo.admin.ch identify): date, who, share of ice cells each strip covers (computed). Which strip fed which cell is not published; say so. A1 day is an assumption (Gorner: the strip covering every ice cell, 2015-08-26).
- **Lidar days**: `lidar_dates.py` reads LAS GPS times per tile. A tile gets a day only if one day holds at least 85 % of its points; mixed tiles are not used.
- **A2 day**: fit it with ICESat-2 (step 4) among the days a strip was actually flown; say it was chosen on the same shots.
Record all of it in the ledger and in the export (`anchors[]`).

## 4. ICESat-2
`fetch_atl06.py` (earthaccess, byte-range reads; slow: Gorner 72 granules, Fiescher 64). `gval.py fit` scores candidate A2 days; `gval.py run <A2 date>` writes `shots_icesat.pkl` and `val_summary.json`. Rules: quality 0, h_sigma under 1 m, on 2023 ice, July to October, slope under 20 degrees; datum plane fitted on stable rock (NMAD about 1 m). Years without summer shots stay unchecked and the page says so.

## 5. Band shape and the model
- Band balance: GLAMOS bins if they exist, else a **borrowed** straight line in elevation fitted (computed, area weighted) to neighbouring glaciers with bins (`gbal.py`; Gorner used Findel, Adler, Aletsch, Rhone, Corbassiere; pick the donors by elevation range and compare candidates on ICESat-2). Label it computed. **2026** has no GLAMOS balance yet: estimated from Aletsch glacier-wide Bw and Ba read from the GLAMOS figure (`bins2026.pkl`, about +-100 mm w.e.); label "estimate".
- `strip_model.py <A2 date>`: surfaces for 30 September of 2016 to the newest year. After the last anchor the SMOOTHED survey difference (median 5 x 5 cells, Gaussian 1) is applied to the measured 2023 surface (the raw difference made 2026 rough: Gorner roughness 15.8 m raw, 6.1 m smoothed, 6.0 m in 2023).
- **Margin fade (owner, 2026-11-01, "only for Gorner for now"):** for years after the last survey the lowering rises linearly from 0 to full over 80 m from the 2023 ice outline (`EDGE_M` in `strip_model.py`); without it a wall of 5 to 10 m grows between the ice and the fixed ground outside. Aletsch and the next glaciers do not have it unless the owner says so: ask once at the report, apply nothing silently.
- Rerun `gval.py run` after any model change; report the per-year rmse.

## 6. Bed
`bed_check.py`: three checks (radar bed vs swissBEDROCK per 20 m cell and survey year; spots with two survey dates; radar points in ground that is ice free now: at least 30 m outside SGI2023 and 30 m inside SGI2016, slope at most 20 degrees, with the 30 degree / 50 m / 100 m sensitivity). Output `bed_check.json`; the text is built in `page_block.py`. Report honestly what the numbers say (Gorner: the radar bed lies a few metres BELOW the ground, the opposite of Aletsch; only 2 flight profiles).

## 7. Other checks
- **ASTER**: `fetch_aster.py` (earthaccess, `AST14DEM`, July 10 to October 15, 2016 onwards; Gorner 99 scenes, about 1 GB, plain GeoTIFFs); `aster_check.py`: per scene reproject to the grid, offset = median over stable rock, scene used if at least 300 rock cells, rock NMAD at most 15 m, at least 200 ice cells; compare with the model surface of the scene's own day (`surface_at`). Many scenes are partial or garbage (offsets in the thousands): the filter is essential. Check only, never in the fit.
- **Stakes**: only where GLAMOS point files have readings in 2016 or later; else the row says "no stake data after <date>".
- **Uncertainty (ONE shared script, `experiments/yearly_uncertainty.py <glacier folder>`; the per-package `uncertainty.py` only call it; the flat `uncertainty_v0_flat.py` files are retired):** Aletsch's method. (1) Anchor error sigma_A is fixed from OUTSIDE the interpolation test: the rmse of the shots of the anchor year 2023 when there are at least 100 (Aletsch 0.76 -> 0.8 m, Gorner 1.74 m, Fiescher 1.73 m), else (changed 2026-11-02, see the top of this file) the rmse of the best-constrained year, an upper bound, said so (Rhone 0.61 m from 2021); no other glacier's value. (2) Lidar anchor sigma_L = rmse of the shots within 45 days of the lidar day (else 1.4 m). (3) k_i and k_e = sqrt(max(mean(error^2 - anchor variance), 0) / mean(pred^2)) with the segment terms of Aletsch (sigma_i = k_i |segment change| sqrt(phi (1-phi)); sigma_e = k_e |rate| years). (4) Where a year has shots, sigma is not below their rmse; 2026 has no chart value (map: + 25 % of its increment). **Never take the overall rmse of the shots as the anchor value:** it already holds the interpolation error, so the fitted factors fall to zero and every year comes out equal (the first Rhone, Gorner and Fiescher versions: flat 1.3 / 1.7 m, "looks unrealistic", owner 2026-11-02). The script writes a ready-made `note` for the page (anchor source, swisstopo's quoted 0.5 m below / 1 to 3 m above 2000 m, as quoted by Bannwart et al., NOT read in the original, which may make the true value larger on these high tongues, calibration on the same shots = not independent); the page blocks use it unchanged. Check the printed `shot check` (share of shots within 1 and 2 sigma) and report it.
- **Volume consistency**: compare the surface change of the strip (A2 - A1 times area) with the GLAMOS volume change of the whole glacier for the same period (Gorner: -0.332 km3 of -0.499 km3, 67 %). It must be a plausible share.

## 8. Export and site files
- `export_site_yearly.py` -> `data/yearly/<id>.npz` + `<id>.json` with the `page` block from `page_block.py` (chart numbers, map polygons from SGI2016/2023, texts, bed section). **Re-read every sentence for stale claims** ("no ASTER or stake check was made", licences, roughness numbers, edge fade) before saying done.
- `data/yearly/index.json` is written by `scripts/build_site.py` (`write_yearly_index`); run it once so the overview page lists the glacier.
- Terrain bundle: `python3 scripts/build_terrain_bundle.py --id <id>` (reads `data/yearly/<id>.npz`; writes `data/terrain/<id>.<hash>.bin`, updates the manifest). Rebuild after every change to the npz.
- Texts to touch: `js/07-render.js` (3D help paragraph for the glacier, credits `yearly` and `sr`), `js/11-view3d.js` `terrainNote` (it has an Aletsch-only branch; generic text for the others), `docs/REFERENCE.md` row, `docs/sources/switzerland-<glacier>.md`.

## 9. Viewer (the Aletsch page is the template)
- `fetch_s2_textures.py` (one Copernicus Process API request per year, site colours, the pinned scene of each year) -> `s2_textures/`.
- `build_viewer.py`: takes `data/yearly/B36-26-viewer.html` as the template and replaces only its `const D = {...};` line. D keys: `u16, g16, flags, years, H, W, cell, tier, foot, pts, tex, stakes, b16, gprd8, sig, sigH, sigW`, and the per-glacier switches `base` (index of the year changes count from), `ext`, `title`, `h1`, `cam {ty, dx, dy, dz}` (camera from below the tip looking up the glacier), `bednote`, `init`. Never write a separate viewer: the first Gorner viewer was and looked different. `viewer_crop.py` defines the box; the textures use the same box.
- Test it headless (three.js from jsdelivr, `--use-gl=swiftshader`): no console errors in the modes img, surf, thick, unc, d17.

## 10. Super-resolution pictures
`cd experiments/aletsch-sen2sr && GLACIER=<id> venv/bin/python run_strip.py` (one request per pinned year, about 15 s per year on the Mac; output `out_strip_<id>/`), then copy to `data/sr/<id>/` (webp + meta.json). The site picks them up by itself (Layers > Super-res, "<first>-<last> only"). The layer stays optional, labelled and off by default.

## 11. The right panel (audit every number, as done for Gorner)
Open the panel text (headless: `.tab-panel` elements of `index.html#g=<site>`) and trace each figure:
- Areas (SGI1850, SGI1973, SGI2023) against the shapefiles; area change and percentage are computed.
- GLAMOS volume change, thickness change and balance against the CSVs (the site shows rounded values: -0.499331 -> -0.50; this breaks the "exactly as the source states it" rule; the owner has not decided, do not change it silently).
- **Length**: the build sums all rows of the GLAMOS length file, **including overlapping rows from two observers** (Gorner: 7 rows, about 115 m too much; Unteraar 1, A54e-24 18). Report it per glacier; fix only on the owner's word. "Length now" is read from the GLAMOS figure `lc_stat_frequency.pdf` (PyMuPDF `get_text('words')` on the row).
- Thickest ice: swisstopo identify service (`ch.swisstopo.geologie-gletschermaechtigkeit`, `max_thick`, `volume`, `year_mode`) and the radar maximum from the thickness files.
- **Ice speed**: ITS_LIVE annual maps; the card now leaves a year empty when its flowline has fewer than 90 % of the best year's valid points (2013 and 2014 miss icefalls). The fastest-point pin exists on the map and in 3D.
- Texts in `js/01-data.js` (`GLACIER_INFO`, lede, look, name): every figure and claim against the page it cites, opened and read (Wikipedia, gornergrat.ch ...); wording as the source has it ("first half of the 19th century" is not "early"). `python3 scripts/check_external_numbers.py` (takes more than 2 minutes: run it in the background).
- Hike text: `data/` hike entry against the cited page.

## 12. QA, board, report
1. `python3 scripts/check_syntax.py`; `python3 -m unittest discover -s tests` (two known failures in `tests.test_boxes` about regions without terrain; do not hide them).
2. Headless sweep: `provenance.html?id=<id>` (all sections, click a year, load the viewer), `provenance.html` (overview lists the glacier), the site in 3D for the glacier (Layers: SR on, speed on with the pin, year changes), no page errors.
3. Board: `python3 scripts/board_sync.py`, compare `scripts/.board-cache/docs/*.json` with the board copy (ArtifactData `list` with `out_dir`) and push only the documents that differ, plus `meta/schema` (pin `if_version`); read `meta/schema` back and `python3 scripts/board_sync.py --stamp <file>`. The Stop hook asks for this after every change to terrain, landsat, texts.
4. Memory: update `project_<glacier>_yearly_surfaces` and the `MEMORY.md` line.
5. Report to the owner (short): what was built, the numbers (ICESat-2 rmse per year, ASTER, uncertainty, bed), what is missing for this glacier and why, what needs a decision (margin fade, length overlap, rounding), what was not done (tests not run, not committed). Nothing committed.

## Traps from the two runs
- `sleep` as the first command of a call is blocked: use `until <check>; do sleep 5; done` with a long timeout, or run in the background and read the log.
- macOS `sed -i` needs `''`; JSON keys are strings (`c1['2008']`); numpy int64 is not JSON-serialisable; the north-up / south-up row order (all arrays here are south to north, the viewer's `u16` too).
- earthaccess searches: ASTER and ICESat-2 granule dates are in `umm.TemporalExtent`; a granule size is `x.size` (property in some versions, call in others).
- Playwright: elements hidden behind the 3D overlay cannot be clicked: `evaluate("()=>document.querySelector('button.tl-prev').click()")`.
- WebFetch cannot read PDFs: download and read with PyMuPDF (`import fitz`, ignore the deprecation warning). `swisstopo` product pages can return HTTP 500: say so, do not quote from memory.
- A claim in the cited source's neighbourhood is not the cited source: open the page and read the sentence.
- Copernicus quota: textures 11 requests + SR 11 requests per glacier; the public site shares the quota.

## Added after the Rhone run (2026-11-02)
- **Folder:** Rhone ran in `experiments/rhone-yearly-dem/` (a copy of `swiss-yearly-dem`, outputs in `B43-03/`, logs in `logs/`), so the Fiescher chat's files stayed untouched. Merge the changes back into the generic package when Fiescher is done: `shape.use_donor` centre is `lo + 50` for 100 m bands (the generic one had `+ 5`), `add_2026` (own bands + 2026 estimate), survey-year base dates (`t1_base` = 30 Sep of the A1 survey year: Rhone 2016, Gorner 2015, Fiescher 2017), `gval.py` candidate days from the strip list, `uncertainty.py` without 2023 shots, `stakes_check.py`, `bed_check.py` lake rule, `export_site.py` and `page_block.py` texts per glacier.
- **A1 is not always 2017:** read the GLAMOS pair (`date_end` of the 2019 edition: Gorner 2015, Rhone 2016, Fiescher 2017); every hard-coded "2017" in the copies must go (texts, `gval` candidates, `export`).
- **Own bands:** a glacier WITH GLAMOS bands (Rhone) uses them; 2026 is a regression of its bands on the glacier-wide Aletsch values read from the figure (labelled estimate). Check that the 2026 row exists (`2026 in M._Ba.index`): without it 2026 equals 2025 silently.
- **Stakes:** `stakes_check.py` (annual files, type 1, years from the year after the A1 survey, cells of modelled ice inside the 2023 outline); the viewer takes type 1 and 7 markers from all three files. Rhone: 76 stake-years.
- **No shots in the anchor year:** the anchor sigma is then the rmse over all shots, and the page says so.
- **Lake in front of the tongue (Rhone, Findel, Zmutt: `LAKE_GLACIERS` in `js/11-view3d.js`):** the yearly surfaces keep cells outside the 2023 outline at the newest elevation model (a flat lake) and the 3D view flattens the terrain wherever a year's picture shows water. Never change that code or the base terrain for these glaciers; after building the bundle compare screenshots before/after at the lake for several years. Radar "ground now" points under the lake must be left out (`bed_check.py`: flat to 15 cm within 8 m, or below the lake level + 3 m).
- **Margin fade (80 m):** Gorner only (owner, 2026-11-01). Others: `EDGE_M` env, default 0; report the step growth along the outline (Rhone: median -5.8 m in 2023, -7.5 m in 2024, -12.9 m in 2026 without it) and let the owner decide.
- **ASTER can give nothing:** Rhone 0 of 23 scenes passed; say so, do not relax the gate.
- **Landsat first:** the owner's picks go through the walkthrough (`scripts/landsat-picks.json`); a year taken out goes into `LEAVE_OUT_BY_OUTLET` in `scripts/build_landsat.py` with the reason, the glacier is rebuilt (`python3 scripts/build_landsat.py --outlet <id>`, a few minutes with the cache) and the left-out year's four pictures are deleted from `data/landsat/<id>/`.
- **After changing the uncertainty method (2026-11-02):** rerun `yearly_uncertainty.py` for every finished glacier, then its export (`page.sig`, `page.notes.uncertainty`) and its viewer (`sigma_maps.npy`); numbers on the three finished glaciers are in `docs/sources/switzerland-<glacier>.md`.
