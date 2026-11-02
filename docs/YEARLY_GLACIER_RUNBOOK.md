# Runbook: yearly surfaces, viewer and panel for any Swiss glacier

Written 2026-11-01 from the Aletsch (B36-26) and Gornergletscher (B56-07) runs; unified 2026-11-02 after Fiescher (B40-07) and Rhone (B43-03) and a comparison of the four. It describes **one procedure for every Swiss glacier**; the four finished glaciers are worked examples, not special cases. **Standing instruction (owner):** after the owner has checked the input imagery (the Sentinel-2 pins and the Landsat picks) and says go, Claude runs everything below by itself, in order, without asking, and reports at the end. Claude never writes sign-offs or confirmations, never commits or pushes (the owner does), and publishes nothing outside the repo.

Method and reasoning: `docs/YEARLY_DEM_METHOD.md`. Plan and owner gates for the Swiss glaciers: `docs/PIPELINE_SWISS.md`. Source search: `docs/DATA_SEARCH.md`. Where each file lives: `docs/REFERENCE.md`.

## How to read this file
- `<id>` is the GLAMOS/SGI inventory id (Aletsch B36-26, Gorner B56-07, Fiescher B40-07, Rhone B43-03); `<site>` is the site's `#g=` id (see `SITE_ID` in `scripts/audit_glaciers.py`).
- Everything glacier-specific is **data, not code**: it lives in `experiments/swiss-yearly-dem/<id>/params.json` and in the ledger. No script is copied or edited per glacier. If a glacier needs something the package cannot do, change the package (for every glacier), then rerun the finished glaciers that it affects.
- "The owner decides" items are listed once, in step 13; apply nothing silently.

## Where the code is
- **`experiments/swiss-yearly-dem/`** (local, gitignored): the one package, run with `GLACIER=<id>`; per-glacier inputs and outputs in `<id>/`, `params.json` per glacier:

  | key | meaning |
  |---|---|
  | `a1_year`, `a2_year` | the two anchor surfaces (older and newest swissALTI3D edition); A1 is read from the GLAMOS pair, never assumed to be 2017 |
  | `t1`, `t2` | the survey days chosen for them (step 4) |
  | `glamos_a2` | GLAMOS's own date for A2 (tie-break) |
  | `donor` | `own` (the glacier's GLAMOS bands), a glacier id, or `line` (step 6) |
  | `edge_m` | margin fade in metres, default 0 |

- `experiments/yearly_uncertainty.py` (one shared script, called by the package's `uncertainty.py`).
- `experiments/aletsch-sen2sr/run_strip.py`: super-resolution pictures, any glacier with `GLACIER=<id>`.
- `experiments/aletsch-yearly-dem/`: history, except that its GLAMOS bins and `model_v1` / `model_2026` are still imported. `gorner-yearly-dem` and `rhone-yearly-dem` are history only.
- Venv for all of it: `experiments/aletsch-yearly-dem/.venv/bin/python` (rasterio, geopandas, earthaccess, fitz). `experiments/aletsch-sen2sr/venv` for SR (torch, mlstac).
- When you fix a script, fix it in `swiss-yearly-dem` once, and then redo the finished glaciers it touches (step 14 lists how).

## Order of work
`strip_inputs.py` -> `lidar_dates.py` -> `fetch_atl06.py` -> `strips.py` -> `gval.py` (choose the days, write them into `params.json`) -> `donors.py` (only where the glacier has no own bands) -> `model.py` -> `gval.py` again -> `bed_check.py` -> `fetch_aster.py` + `aster_check.py`, `stakes_check.py` -> `../yearly_uncertainty.py <id>` -> `refresh_site.py` -> `refresh_viewer.py` -> `python3 scripts/build_terrain_bundle.py --id <id>` -> SR pictures -> panel audit -> QA and board.

## Rules that are the same for every glacier
- **Survey days are flown days.** A1 and A2 sit on a day a swisstopo image strip was flown over the ice (`strips.py`, layer `ch.swisstopo.lubis-bildstreifen`; strips covering under 5 % of the ice and days after 30 Sep are ignored). `gval.py` tries every such pair and keeps the lowest ICESat-2 rmse; pairs within 0.05 m are a tie that ICESat-2 cannot separate, and the tie goes to the GLAMOS date (`glamos_a2`) if it is among them, else to the strip covering most ice. Never a fitted offset ("30 Sep minus 45 days") and never a day without a strip.
- **Lidar days (`model.py`):** a tile takes the day holding at least 85 % of its points; else, if every day with more than 2 % of its points lies within 60 days, the point-weighted mean day (date uncertain by up to about a month); else no lidar there. Flown 2021 or 2022 does not matter, the day does. No default day for unread tiles.
- **ICESat-2 shots:** quality 0, h_sigma under 1 m, on 2023 ice, July to October, slope under 20 degrees, **not more than 10 m above the higher of the two surveys**, physical envelope not below 2 x (A2 - A1) - 10 m from the A1 surface. The datum plane is fitted on stable rock (NMAD about 1 m). The published rmse is **leave-one-granule-out** (the pair of days chosen on the other granules); the fit with the used days is reported next to it. Years without summer shots stay unchecked and the page says so.
- **Datum exception (owner, 2026-11-02; Unteraar):** the datum plane is fitted on stable rock as above. Where that fit scatters by more than 2 m (NMAD, `DATUM_NMAD_LIMIT` in `gval.py`), the datum is an offset only, fitted on gentle rock (slope under 15 degrees) within 1500 m of the ice; `val_summary.json` -> `rock.datum` says which was used and the page text (`refresh_site.py`) says it too. The finished four (rock NMAD 1.09 to 1.47 m) stay on the standard fit; a read-only what-if showed the mild variants change their rmse by 0.2 m or less. Other glaciers are checked against the limit when `gval.py` runs.
- **A2 and the lidar (Unteraar, 2026-11-02):** before step 4 run `python a2_lidar_check.py <id>` (reads `strip_inputs.npz`, writes nothing). If A2 equals a swissSURFACE3D edition (median difference under 0.05 m), that lidar's flight day (LAS GPS time) is the day of A2: put it in `params.json` `t2` even if no image strip was flown that day (Unteraar: A2 = 2023 lidar, flown 2023-07-11; the best strip day, 2023-08-20, was 40 days late and made the anchor-year bias 4 m). `gval.py`'s leave-one-granule-out still re-chooses days by the strip rule: read the fit rows for such a glacier.
- **Band balance:** the glacier's own GLAMOS bands where they exist; otherwise the candidate with the lowest ICESat-2 rmse over all shots among those whose bins cover at least 98 % of the 2023 ice cells (`donors.py`, `donors.json`), which may be another glacier's bands or a borrowed line. One `lowering()` in `shape.py` for all, counted from the A1 year. 2026 has no GLAMOS balance yet: it is an estimate from the Aletsch glacier-wide Bw and Ba read from the GLAMOS figure (`bins2026.pkl`, about +-100 mm w.e.), the timing of the 2026 melt is the Aletsch figure's curve for all, and own bands get a regression of their bands on those glacier-wide values. Check that the 2026 row exists (`2026 in M._Ba.index`): without it 2026 silently equals 2025.
- **After the last anchor** the SMOOTHED survey difference (median 5 x 5 cells, Gaussian 1) is applied to the measured 2023 surface; the raw difference makes the newest years rough.
- **Uncertainty:** `experiments/yearly_uncertainty.py` for all; see step 8.
- **Margin fade (`edge_m`):** for years after the last survey, the lowering rises linearly from 0 to full over `edge_m` metres from the 2023 ice outline; without it a wall of 5 to 10 m can grow between the ice and the fixed ground outside. Default 0. Set by the owner per glacier (owner, 2026-11-01: Gorner 80 m, "only for Gorner for now"). Do not apply it silently: at the report give the step growth along the outline without it and let the owner decide.
- **Labels:** an anchor year is `measured`; so is a lidar year when the lidar sits on at least half of the ice cells; years before A1 are `extrapolated`; 2024 and 2025 `extrapolated`; 2026 `estimate`.
- **Checks:** ASTER AST14DEM with the same gate for all (rock NMAD at most 15 m, at least 300 rock and 200 ice cells); stakes with `stakes_check.py` for all (type 1, annual files, from the year after A1, cells of modelled ice inside the 2023 outline). Checks never enter the fit.
- **Texts:** `refresh_site.py` writes every sentence that depends on a number, from the run's files; the map polygons, the ice-bed section and the licences are kept from the shipped JSON. Do not hand-edit `data/yearly/<id>.json` for numbers.
- **Lakes in front of the tongue (`LAKE_GLACIERS` in `js/11-view3d.js`, today Rhone, Findel, Zmutt):** the yearly surfaces keep cells outside the 2023 outline at the newest elevation model (a flat lake) and the 3D view flattens terrain wherever a year's picture shows water. Never change that code or the base terrain for these glaciers; after the bundle compare screenshots before/after at the lake for several years. Radar "ground now" points under a lake are left out (`bed_check.py`: flat to 15 cm within 8 m, or below the lake level + 3 m).

## 0. Preconditions (owner's part; check, do not do)
1. Strip confirmed in the walkthrough (`stripConfirmation` in `data/regions/ch/<site>/glacier.json`) and the terrain bundle built. If the strip changed, everything below must be redone.
2. Sentinel-2 pins for 2016 to the newest year in `data/scenes.json` (`glaciers.<id>.picks`) and the Landsat picks done (through the walkthrough, `scripts/landsat-picks.json`). These are what the viewer textures and the SR step process. A year taken out goes into `LEAVE_OUT_BY_OUTLET` in `scripts/build_landsat.py` with the reason; rebuild with `python3 scripts/build_landsat.py --outlet <id>` (a few minutes with the cache) and delete the left-out year's four pictures from `data/landsat/<id>/`.
3. The owner's "go". Read `data/review-signoffs.json` and the board `tasks` first: every record with a note and no reply is a task.
4. The glacier has a `SITE_ID` and a venv that works.
Stop and ask only if one of these is missing.

## 1. Source search and ledger (mandatory, before modelling)
`docs/DATA_SEARCH.md` for this glacier: write `docs/sources/switzerland-<glacier>.md` (exact dates, datum, licence, read / NOT READ). Things that mattered every time:
- **GLAMOS volume-change tables** (`experiments/aletsch-yearly-dem/glamos/zip/volumechange_2025_r2025_series.csv` and `..._allcombinations.csv`): which two surfaces are the anchors, their `date_start`/`date_end`, source names. The two files name the same surface differently (`sa3d-2023` in the series, `sa3d-2018` or `sa3d-2019` in all-combinations): quote the file you used. The `date_end` of the 2019 edition gives the A1 survey year.
- Does GLAMOS have **band balance** (`massbalance_fixdate_elevationbins.csv`) and **stakes** (`glamos/point/z/<annual|winter|intermediate>/<name>_*.dat`) for the glacier? Write down what is missing and the dates of what exists; the page says so instead of showing empty rows.
- Radar beds: GLAMOS ice thickness release 2020 (`experiments/aletsch-yearly-dem/src/glamos_thick2020/B..._*_GlaThiDa.txt` and `_vaw-archiv.txt`); how many flight profiles there are.
- ASTER: the RAGMAC set (`ragmac/ALE_CH`) covers only Aletsch and is a different product; every glacier uses NASA AST14DEM (step 8). Aletsch's RAGMAC reading stays in its ledger.

## 2. Inputs on the 20 m grid
`strip_inputs.py`: A1 = older swissALTI3D edition, A2 = newest edition, L = swissSURFACE3D raster at 20 m, ice masks (`out23`, `ice17`), `inside` the strip, grid origin `e0, n0` aligned to 1 km tiles, rows south to north (all arrays here are south to north, the viewer's `u16` too). Writes `strip_inputs.npz`.

## 3. Real survey days
- **Flight strips** (`strips.py`; swisstopo `ch.swisstopo.lubis-bildstreifen`, api3.geo.admin.ch identify): date, who, share of ice cells each strip covers (computed). Which strip fed which cell is not published; say so.
- **Lidar days** (`lidar_dates.py`): reads LAS GPS times per tile and applies the lidar-day rule above.
- Record all of it in the ledger and in the export (`anchors[]`). The days themselves are chosen in step 4.

## 4. ICESat-2 and the choice of days
`fetch_atl06.py` (earthaccess, byte-range reads; slow: 60 to 70 granules per glacier). `gval.py` scores every pair of flown days under the shot rules above; put the chosen `t1`, `t2` (and `glamos_a2`) into `params.json`, then `gval.py run` writes `shots_icesat.pkl` and `val_summary.json`. Say that the days were chosen on the same shots (calibration is not independent). Rerun `gval.py` after the model (step 6) and after any model change; report the per-year rmse.

## 5. Band balance
`donors.py` runs only where the glacier has no GLAMOS bands of its own; it writes `donors.json` (candidates, coverage, rmse) and the winner goes into `params.json` (`donor`). Bands, donors and the 2026 estimate follow the rules above and are labelled computed / estimate on the page.

## 6. The model
`model.py` builds the surfaces for 30 September of every year from the first year (the A1 survey year, or 2016 if earlier, extrapolated) to the newest, with `shape.lowering()` from A1, the lidar days, the smoothed difference after A2 and `edge_m`. Then `gval.py` again. Years before A1 are extrapolated backwards.

## 7. Bed
`bed_check.py`: three checks (radar bed vs swissBEDROCK per 20 m cell and survey year; spots with two survey dates; radar points in ground that is ice free now: at least 30 m outside SGI2023 and 30 m inside SGI2016, slope at most 20 degrees, with the 30 degree / 50 m / 100 m sensitivity). Output `bed_check.json`; the text is built in `page_block.py`. Report what the numbers say, whichever way they point (Gorner: the radar bed lies a few metres BELOW the ground, the opposite of Aletsch; only 2 flight profiles).

## 8. Other checks
- **ASTER**: `fetch_aster.py` (earthaccess, `AST14DEM`, July 10 to October 15, 2016 onwards; about 100 scenes, about 1 GB, plain GeoTIFFs); `aster_check.py`: per scene reproject to the grid, offset = median over stable rock, use the scene only if it passes the gate, compare with the model surface of the scene's own day (`surface_at`). Many scenes are partial or garbage (offsets in the thousands): the filter is essential. **ASTER can give nothing** (Rhone: 0 of 23 scenes passed); say so, do not relax the gate.
- **Stakes**: only where GLAMOS point files have readings in the years after the A1 survey year; else the row says "no stake data after <date>". The viewer takes type 1 and 7 markers from all three file kinds.
- **Uncertainty** (`experiments/yearly_uncertainty.py <id>`): (1) the anchor error sigma_A is fixed from OUTSIDE the interpolation test: the rmse of the shots of the anchor year 2023 when there are at least 100; else the rmse of the year with the lowest rmse among the years with at least 100 shots (an upper bound, said so; Rhone, from 2021). Never another glacier's value, and **never the overall rmse of all shots** (it already holds the interpolation error, so the fitted factors fall to zero and every year comes out equal: the first Rhone, Gorner and Fiescher versions were flat 1.3 / 1.7 m, "looks unrealistic", owner 2026-11-02). (2) Lidar anchor sigma_L = rmse of the shots within 45 days of the lidar day (else 1.4 m). (3) k_i and k_e = sqrt(max(mean(error^2 - anchor variance), 0) / mean(pred^2)) with the segment terms of Aletsch (sigma_i = k_i |segment change| sqrt(phi (1-phi)); sigma_e = k_e |rate| years). (4) Where a year has shots, sigma is not below their rmse; 2026 has no chart value (map: + 25 % of its increment). Years before A1 are extrapolated and sigma grows with the years from A1. The script writes a ready-made `note` for the page (anchor source, swisstopo's quoted 0.5 m below / 1 to 3 m above 2000 m, as quoted by Bannwart et al., NOT read in the original, which may make the true value larger on high tongues, calibration on the same shots = not independent); the page blocks use it unchanged. Check the printed `shot check` (share of shots within 1 and 2 sigma) and report it.
- **Volume consistency**: compare the surface change of the strip (A2 - A1 times area) with the GLAMOS volume change of the whole glacier for the same period. It must be a plausible share of the whole glacier; report the share and what lies outside the strip (Gorner: -0.332 km3 of -0.499 km3, 67 %).

## 9. Export and site files
- `refresh_site.py` runs the export (`export_site.py` + `page_block.py`) -> `data/yearly/<id>.npz` + `<id>.json` with the `page` block (chart numbers, map polygons from SGI2016/2023, texts, bed section). **Re-read every sentence for stale claims** ("no ASTER or stake check was made", licences, roughness numbers, edge fade) before saying done.
- `data/yearly/index.json` is written by `scripts/build_site.py` (`write_yearly_index`); run it once so the overview page lists the glacier.
- Terrain bundle: `python3 scripts/build_terrain_bundle.py --id <id>` (reads `data/yearly/<id>.npz`; writes `data/terrain/<id>.<hash>.bin`, updates the manifest). Rebuild after every change to the npz.
- Texts to touch: `js/07-render.js` (3D help paragraph for the glacier, credits `yearly` and `sr`), `js/11-view3d.js` `terrainNote` (generic text for every glacier unless a branch exists; do not add per-glacier branches), `docs/REFERENCE.md` row, `docs/sources/switzerland-<glacier>.md`.

## 10. Viewer (the Aletsch page is the template)
- `fetch_s2_textures.py` (one Copernicus Process API request per year, site colours, the pinned scene of each year) -> `s2_textures/`.
- `refresh_viewer.py` / `build_viewer.py`: takes `data/yearly/B36-26-viewer.html` as the template and replaces only its `const D = {...};` line. D keys: `u16, g16, flags, years, H, W, cell, tier, foot, pts, tex, stakes, b16, gprd8, sig, sigH, sigW`, and the per-glacier switches `base` (index of the year changes count from), `ext`, `title`, `h1`, `cam {ty, dx, dy, dz}` (camera from below the tip looking up the glacier), `bednote`, `init`. Never write a separate viewer: the first Gorner viewer was and looked different. `viewer_crop.py` defines the box; the textures use the same box.
- Test it headless (three.js from jsdelivr, `--use-gl=swiftshader`): no console errors in the modes img, surf, thick, unc, d17.

## 11. Super-resolution pictures
`cd experiments/aletsch-sen2sr && GLACIER=<id> venv/bin/python run_strip.py` (one request per pinned year, about 15 s per year on the Mac; output `out_strip_<id>/`), then copy to `data/sr/<id>/` (webp + meta.json). The site picks them up by itself (Layers > Super-res, "<first>-<last> only"). The layer stays optional, labelled and off by default.

## 12. The right panel (audit every number)
Open the panel text (headless: `.tab-panel` elements of `index.html#g=<site>`) and trace each figure:
- Areas (SGI1850, SGI1973, SGI2023) against the shapefiles; area change and percentage are computed.
- GLAMOS volume change, thickness change and balance against the CSVs. Rounding to at most 2 decimals is allowed (owner, 2026-11-02); nothing else is changed.
- **Length**: the build sums all rows of the GLAMOS length file, **including overlapping rows from two observers** (Gorner: 7 rows, about 115 m too much; Unteraar 1, A54e-24 18). Check every glacier for it and report; fix only on the owner's word. "Length now" is read from the GLAMOS figure `lc_stat_frequency.pdf` (PyMuPDF `get_text('words')` on the row).
- Thickest ice: swisstopo identify service (`ch.swisstopo.geologie-gletschermaechtigkeit`, `max_thick`, `volume`, `year_mode`) and the radar maximum from the thickness files.
- **Ice speed**: ITS_LIVE annual maps; the card leaves a year empty when its flowline has fewer than 90 % of the best year's valid points (2013 and 2014 miss icefalls). The fastest-point pin exists on the map and in 3D.
- Texts in `js/01-data.js` (`GLACIER_INFO`, lede, look, name): every figure and claim against the page it cites, opened and read (Wikipedia, local tourism pages ...); wording as the source has it ("first half of the 19th century" is not "early"). `python3 scripts/check_external_numbers.py` (takes more than 2 minutes: run it in the background).
- Hike text: the `data/` hike entry against the cited page.

## 13. Decisions that belong to the owner (report them, apply nothing silently)
- `edge_m` margin fade for this glacier (report the step growth along the outline without it; Rhone without it: median -5.8 m in 2023, -7.5 m in 2024, -12.9 m in 2026).
- Overlapping rows in the GLAMOS length file.
- Anything that changes a published number's presentation.

## 14. QA, board, report
1. `python3 scripts/check_syntax.py`; `python3 -m unittest discover -s tests` (two known failures in `tests.test_boxes` about regions without terrain; do not hide them).
2. Headless sweep: `provenance.html?id=<id>` (all sections, click a year, load the viewer), `provenance.html` (overview lists the glacier), the site in 3D for the glacier (Layers: SR on, speed on with the pin, year changes), no page errors.
3. Board: `python3 scripts/board_sync.py`, compare `scripts/.board-cache/docs/*.json` with the board copy (ArtifactData `list` with `out_dir`) and push only the documents that differ, plus `meta/schema` (pin `if_version`); read `meta/schema` back and `python3 scripts/board_sync.py --stamp <file>`. The Stop hook asks for this after every change to terrain, landsat, texts.
4. **After changing any shared method** (uncertainty, day choice, lidar rule, shape, page texts): rerun it for every finished glacier, then its export (`page.sig`, `page.notes.uncertainty`) and its viewer (`sigma_maps.npy`); numbers per glacier are in `docs/sources/switzerland-<glacier>.md`.
5. Memory: update `project_<glacier>_yearly_surfaces` and the `MEMORY.md` line.
6. Report to the owner (short): what was built, the numbers (ICESat-2 rmse per year, ASTER, uncertainty, bed, volume share), what is missing for this glacier and why, what needs a decision (step 13), what was not done (tests not run, not committed). Nothing committed.

## Traps
- `sleep` as the first command of a call is blocked: use `until <check>; do sleep 5; done` with a long timeout, or run in the background and read the log.
- macOS `sed -i` needs `''`; JSON keys are strings (`c1['2008']`); numpy int64 is not JSON-serialisable; north-up / south-up row order (everything here is south to north).
- earthaccess searches: ASTER and ICESat-2 granule dates are in `umm.TemporalExtent`; a granule size is `x.size` (property in some versions, call in others).
- Playwright: elements hidden behind the 3D overlay cannot be clicked: `evaluate("()=>document.querySelector('button.tl-prev').click()")`.
- WebFetch cannot read PDFs: download and read with PyMuPDF (`import fitz`, ignore the deprecation warning). `swisstopo` product pages can return HTTP 500: say so, do not quote from memory.
- A claim in the cited source's neighbourhood is not the cited source: open the page and read the sentence.
- Copernicus quota: textures 11 requests + SR 11 requests per glacier; the public site shares the quota.

## Worked examples (what the four finished glaciers chose)
| | A1 / A2 days (`params.json`) | Band balance | Margin fade | Lake | Notes |
|---|---|---|---|---|---|
| Aletsch B36-26 | 2017-09-21 / 2023-08-10 | own GLAMOS bands | none | no | RAGMAC ASTER in its ledger; lidar tiles of mixed days (point-weighted mean); 2016 extrapolated |
| Gorner B56-07 | 2015-08-26 / 2023-08-21 | donor line (no bins; stakes only 2003-10-03 to 2008-04-23) | 80 m | no | 2 radar flight profiles; radar bed below the ground |
| Fiescher B40-07 | 2017-09-21 / 2023-08-23 | donor Aletsch (the only one covering 1678 m); no stakes | none | no | 2016 extrapolated |
| Rhone B43-03 | 2016-09-07 / 2023-09-05 | own GLAMOS bands | none | yes | anchor sigma from 2021 (no 2023 shots); 0 ASTER scenes passed; 76 stake-years |

For the next glacier, fill `params.json` from its own GLAMOS pair and its own shots; this table is only for comparing the result.

## Added 2026-11-03 (owner asked for one wording for all ten glaciers)
- **One wording:** `refresh_site.py` writes the compact field-note wording for every glacier (`NEW = True`); the ice-bed section of every glacier is written by `seed_site.py` (a new glacier: no JSON yet; an existing one: `RESTYLE=1 GLACIER=<id> python seed_site.py` rewrites only `page.bed`). Aletsch's bed check now also comes from the one `bed_check.py` (`B36-26/bed_check.json`).
- **Lakes:** `bed_check.py` takes out radar points on a flat water surface for the lake glaciers (Rhone, Findel, Zmutt: flat to 15 cm within 8 m; a lake level is used only when more than 50 flat points exist).
- **Stake files:** the GLAMOS point files are named after the glacier (`findelen_*`, not the site id): `cfg.STAKE_SLUG`.
- **After a change of wording** run `refresh_site.py` and `refresh_viewer.py` for all ten glaciers (the viewer's footnote and size come from the JSON).
