# Sources ledger: Switzerland / Fieschergletscher (SGI B40-07, GLAMOS name Fieschergletscher; WGMS FoG glacier id 471, RGI60-11.01478)

Search done: 2026-11-01, by Claude, following docs/DATA_SEARCH.md, for the yearly ice-surface run (strip of the walkthrough: azimuth 17.6, half 2300, back 1607, up 6791; tip 46.458359, 8.132402). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=B40-07`), output `data/yearly/B40-07.{npz,json,-viewer.html}`, field notes `provenance.html?id=B40-07`. Computed values are labelled computed. Region note (who holds what in Switzerland): see `docs/sources/switzerland-aletsch.md`.

**What Fiescher does NOT have (checked):** GLAMOS release 2025 lists "mass balance" as not available for B40-07 (glacier list row `Fieschergletscher,B40-07,2653532,1151072,28.511,2023,1,0,1` = length change 1, mass balance 0, volume change 1); no row of B40-07 in `massbalance_fixdate*.csv` or the elevation-bin files; no file for Fiescher in the GLAMOS point mass balance sets (annual, winter, intermediate: the file lists were read, no `fiescher_*.dat`); WGMS FoG `mass_balance.csv` has no row of glacier id 471. So no balance, no stakes, no cameras.

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint (which surfaces are the anchors)
- Where: `volumechange_2025_r2025_series.csv`. B40-07 rows, e.g. `ai-bw` to `sa3d-2023`, 20090908 to 20179999, dV -0.313471 km3, dh_mean -10.532 m; `sa3d-2023` to `is-stand`, 20179999 to 20230823, A 29.7549 km2 (2017) to 28.5145 km2 (2023), dV -0.284941 km3, dh_mean -9.566 m, Bgeod -1.386 m w.e. a-1, sigma 0.187, covered 100.0, rho 850.
- Dates (exact wording): "20179999" = survey 2017, day unknown (9999 placeholder); `is-stand` = 20230823. The 2017 surface is named `sa3d-2023` in this file (naming conflict with the 2019 edition seen for Aletsch, same as there).
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial.
- Read: yes (rows of B40-07).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 122 rows of B40-07; last rows `2015-08-28` to `2017-09-21` -71.00 m; `2017-09-21` to `2020-09-04` -159.00 m; `2020-09-04` to `2023-09-06` -102.70 m (observer "VAW/ETHZ; Andreas Bauder"). Three-year steps only. Same licence. Read: last rows.

### swissALTI3D 2019 edition and newest edition — DEM — role: constraint (anchors A1, A2)
- Where: data.geo.admin.ch STAC (tiles E2650-2657, N1142-1152). Newest edition per tile (computed): 2024 edition on 45,132 of 46,523 ice cells, 2025 edition on 1,391 (computed). swisstopo release notes (read for the Aletsch run, docs/sources/switzerland-swisstopo-dem-imagery.md): 2024 edition (Valais) aerial images 2023; 2025 edition (southern Bern) 2024.
- Survey days, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, read via identify, `strips_geom.json`): 2017-09-21 SWISSIMAGE 0.25 m covers 100 % of the ice cells (computed); 2023-09-05 SWISSIMAGE 83.7 %, 2023-09-06 SWISSIMAGE 34.9 %, 2023-08-22 and 2023-08-23 CRYOSPHERE MONITORING 7.6 % and 7.4 % (all computed). Which strip fed which cell is not published (NOT read: swissALTI3D production report).
- Licence: swisstopo OGD terms (read 2026-10-30, see the Aletsch ledger): use, processing, commercial use allowed, source reference mandatory.
- Accuracy statement: not re-read for this glacier; the Aletsch ledger quotes Bannwart et al. ("0.5 m below 2000 m a.s.l. and 1-3 m above").

### swissSURFACE3D (lidar) — role: constraint (anchor L)
- Raster tiles flown 2021 (215,000 cells) and 2022 (5,000 cells, not used). GPS times of the LAS point clouds of the 25 tiles with ice read (computed from the files): 2021-10-14 holds most points (358.36 million of 411.21 million, computed); also 2021-10-10, 2021-10-09, 2021-10-08, 2021-09-24, 2021-07-23. 21 tiles have one day with at least 85 % of their points; 4 do not and are not used. Licence as swissALTI3D. Read: yes.
- Note: flown in October, so snow can lie on the upper cells; no check by an independent shot there beyond ICESat-2 2021 (923 shots, rmse 2.54 m, bias 1.74 m).

### ICESat-2 ATL06 v007 (NASA, earthaccess) — altimetry — role: validation (also fits the A2 day; not independent for that)
- 64 granules 2018-10 to 2026-07 over the strip; 46,443 shots of any quality in the strip's bounding box (computed), 30,020 of good quality in the box; after quality 0, h_sigma < 1 m, slope < 20 degrees, 2023 ice, July to October and the physical envelope: 2,383 shots in 15 granules (computed). One shot 507 m below the surface (12 photons, snr 0.99) rejected. Datum: plane fitted on 5,843 rock shots, NMAD 1.25 m (computed).
- Result (computed): rmse 2.13 m, bias 0.96 m; per year 2020 1.39 (7 shots), 2021 2.54 (923), 2022 2.71 (55), 2023 1.73 (220), 2024 1.64 (790), 2025 2.31 (252), 2026 1.70 (136; provisional year). No summer shots in 2016, 2018, 2019: not checked.
- Read: data read; product documentation as in the Aletsch ledger.

### Shape donor (no own balance): GLAMOS elevation-bin balances of neighbouring glaciers — role: constraint (shape only)
- Aletsch B36-26 bins (from 1634 m) kept. Tested on the same ICESat-2 shots, one A1/A2 pair, 2020-2025 (computed): Aletsch rmse 2.57 m, Corbassiere B83-03 2.40, Findel B56-03 2.47, Rhone B43-03 3.58; 2025 (extrapolated year): Aletsch 3.16, Corbassiere 3.29, Findel 3.47, Rhone 3.41. Differences of a few tenths of a metre are within the noise of 15 granules. A Gorner-style straight line over several neighbours was NOT tested for Fiescher (bins of the others start above 2200 m, the Fiescher tongue ends near 1,680 m). 2026 balance: Aletsch's, read from the GLAMOS figure (not a stated number).

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) and GlaThiDa 3.1.0 — thickness — role: validation of the bed
- Files `B40-07_fiescher_vaw-archiv.txt` (3,129 survey points per its header) and `B40-07_fiescher_GlaThiDa.txt`; GlaThiDa 3.1.0 row 2143 "FIESCHERGLETSCHER VS", survey date 20110321, GPR, 14350 points, "doi:10.18750/icethickness.2018.r2018". In the strip: 7,999 radar points, survey year 2011 only (computed). Check results on the field-notes page (522 cells, median -1.3 m; 41 ice-free points on 1 profile). Licence CC BY 4.0 per the landing page and LICENSE.md. Not read: Rutishauser et al. 2016, Grab et al. 2021 validation section (as in the Aletsch ledger).

### swissBEDROCK (swisstopo) — bed model — role: floor of the surfaces, validation target
- Read through `scripts/swissbedrock.py` (BEM band); uncertainty band about 0 under glaciers (not usable). 146,501 of 197,729 grid points of the terrain bundle have no swissBEDROCK value (computed; ground outside the glacier).

### ASTER AST14DEM (NASA LP DAAC) — role: validation (weak)
- 75 granules found for 10 July to 15 October 2016-2026 (computed); 2 scenes of 2020 pass the rules (rock NMAD 12.0 and 12.5 m, ice cells >= 200; computed); the others have no rock cells in the strip or values that are off by hundreds of metres over rock (cause not investigated). ASTER terms of use NOT read.

### WGMS Fluctuations of Glaciers 2026-02-10 (doi 10.5904/wgms-fog-2026-02-10) — context
- `front_variation.csv`: FIESCHER, WGMS id 471, last rows 2012-11-09 to 2015-08-28 -210 m (air) and 2020-09-04 to 2023-09-06 -102.7 m (GLAMOS 2024 length change). No `mass_balance` rows for id 471. Not used for the surfaces.

## Data types checklist
- [x] outlines (SGI 2016 and 2023 as on the site; older epochs not searched for this run)  - [x] length change  - [x] glacier-wide balance: none exists  - [x] elevation-band balance: none exists (donor used)  - [x] point/stake/camera: none exists
- [x] volume / geodetic  - [x] thickness (2011 GPR only)  - [x] elevation models with survey dates  - [x] altimetry  - [ ] ice speed (existing site layer not re-read)
- [ ] snow/firn/ELA  - [x] imagery geometry (pinned Sentinel-2 scenes of data/scenes.json for the viewer pictures)  - [ ] papers about this glacier (web searches for Fiescher mass balance, thickness, tongue lake and GPR found nothing specific; a Wikipedia article and a SwissEduc page exist: NOT read)  - [ ] field data  - [ ] names and facts

## Not read / left out of the site (for the owner)
- Airborne research DEMs (RAGMAC covers Aletsch only) and TanDEM-X series (Leinss and Bernhard 2021 is Aletsch only): none for Fiescher; no radar surface was used.
- Hugonnet et al. 2021 raster tiles (not downloaded); Farinotti 2019 / Millan 2022 thickness (not opened); ASTER terms; swissALTI3D accuracy statement for the Fiescher area; a possible lake at the tip (not checked: no lake step done, none visible in the 3D viewer).
- Super-resolved pictures (SEN2SR, model card licence cc0-1.0 as read for Aletsch): generated 2026-11-01 for the 11 pinned scenes 2016-2026 (`data/sr/B40-07/`, 4096 x 4096, 1.12 m across and 2.05 m along per pixel, `GLACIER=B40-07 experiments/aletsch-sen2sr/venv/bin/python run_strip.py`). Layer is optional, off by default, labelled as AI-generated on the page.

### Uncertainty of the yearly surfaces (computed 2026-11-02, `experiments/yearly_uncertainty.py`)
- Anchors (swisstopo surveys) 1.73 m (rmse of the 220 shots of 2023), lidar 2.02 m (rmse of 84 shots within 45 days of the lidar day), factors k_i 0.393 and k_e 0.094, calibrated on the ICESat-2 shots (so not independent). Median / 90th percentile by year (m): 2016 1.7/1.7, 2017 1.8/2.1, 2018 1.9/4.1, 2019 2.0/4.5, 2020 2.0/3.9, 2021 2.5/2.5, 2022 2.7/2.8, 2023 1.7/1.7, 2024 1.8/1.9, 2025 2.3/2.3; 2026 viewer map median 2.4 / 3.2. swisstopo quotes 0.5 m below 2000 m and 1 to 3 m above (as quoted by Bannwart et al., NOT read in the original): the tongue lies mostly above 2000 m, so the anchors may be larger than the data say. The first version of this entry (flat) was replaced; see docs/YEARLY_GLACIER_RUNBOOK.md, "Uncertainty".
(Applied by the chat that built the Rhone surfaces, at the owner's request; the earlier flat values were replaced in `data/yearly/B40-07.json`, `swiss-yearly-dem/B40-07/sigma.json` and the viewer.)
