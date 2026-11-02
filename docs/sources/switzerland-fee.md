# Sources ledger: Switzerland / Feegletscher (SGI B53-04, GLAMOS name Feegletscher)

Search done: 2026-11-02, by Claude, for the yearly ice-surface run (runbook `docs/YEARLY_GLACIER_RUNBOOK.md`; strip of the walkthrough, tip and strip in the glacier's record `data/regions/ch/`). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=B53-04, GLAMOS name Feegletscher`, files in `B53-04, GLAMOS name Feegletscher/`). Only what was opened is stated as read; the rest is under NOT READ. A first round of the wider data search of `docs/DATA_SEARCH.md` was done (section "Wider source search, round 1" at the end); it is not exhaustive.

**What Fee does NOT have (checked):** GLAMOS release 2025 lists mass balance as not available for B53-04 (glacier list row `Feegletscher,B53-04,2633447,1103257,13.075,2023,1,0,1`: length change 1, mass balance 0, volume change 1); no row of B53-04 in `massbalance_fixdate_elevationbins.csv` or `massbalance_fixdate.csv`; no point mass balance file. The radar data hold one survey in the strip (2013) and no ice-free ground point qualifies.

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint
- Where: `volumechange_2025_r2025_allcombinations.csv` names the swissALTI3D surface: `sa3d-2018`, e.g. `sa3d-2018` to `is-stand`, 20159999 to 20230823, A 13.8288 km2 (2015) to 13.0748 km2 (2023), dV -0.082997 km3, dh_mean -5.992 m; the series file has `is-stand` to `is-stand`, 20170920 to 20230823 (A 13.6420 km2 to 13.0748 km2, dV -0.075530 km3), and no `sa3d-*` surface for this glacier. The page quotes the all-combinations file.
- Dates (exact wording): "20159999" = survey 2015, day unknown (9999 placeholder); `is-stand` = 20230823.
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial. Read: yes (rows of B53-04).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 110 rows of B53-04; last rows `2016-09-28` to `2017-10-05` -17.00 m; `2017-10-05` to `2019-10-11` +45.90 m (observer "DWL/VS; Urs Andenmatten"); `2020-08-07` to `2023-09-06` -475.00 m (observer "VAW/ETHZ; Andreas Bauder"). The three figures are copied as the file states them; the last is a three-year step. Overlapping rows from two observers were **not checked** (runbook step 12). Same licence. Read: last rows only.

### swissALTI3D 2019 edition (A1) and 2024 edition (A2) — DEM — role: constraint
- Where: data.geo.admin.ch tiles. A2 from the newest edition of each tile (`newest_tile`): the 2024 edition on all 27,380 ice cells (computed).
- Survey days, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, `strips_geom.json`): A1 (2015): 2015-08-26 TLM (100 % of the ice cells), 2015-09-20 TLM (74.4 %), 2015-09-21 TLM (100 %) (computed); A2 (2023): 2023-08-23 SWISSIMAGE (12.9 %), 2023-09-06 SWISSIMAGE (100 %). Pair rule: A1 2015-09-21 and A2 2023-09-06 (best rmse 1.38 m; ties with 2015-08-26 and 2015-09-20 within 0.05 m, the strip covering most ice breaks the tie).
- Licence: swisstopo OGD terms (read 2026-10-30, Aletsch ledger). **NOT READ:** the swisstopo product page for the editions.

### swissSURFACE3D (lidar) — role: constraint (anchor L)
- Raster 2021 edition on all ice (25 tiles with ice, computed). GPS times of the LAS point clouds read (computed, `lidar_dates.json`): 16 tiles mostly 2021-09-22 and 10 tiles mostly 2021-08-24. A2 is **not** this lidar (median difference 4.57 m).
- Licence as swisstopo OGD. Read: yes (point clouds read and deleted).

### ICESat-2 ATL06 v007 (NASA, via earthaccess) — altimetry — role: check and choice of the survey days
- 35 granules with good shots in the box, 4 used, 30,116 good shots in the box, 697 on 2023 ice July to October. Datum: the usual plane on stable rock, 7,230 shots, NMAD 1.45 m (standard fit). With the Corbassière bands: rmse 1.38 m over all years (leave-one-granule-out), 1.39 m with the days used, bias -0.02 m; per year 2019 1.21 m (275 shots), 2021 1.31 (47), 2025 1.50 (375). No summer shots of 2023 and 2024 on the ice: the anchor sigma (1.22 m) is the rmse of 2019, the year with the lowest rmse among those with at least 100 shots: an upper bound, said so on the page.
- Licence: NASA open data; used for checking only. Read: yes.

### ASTER AST14DEM (NASA LP DAAC) — check only
- 86 scenes over the strip; 9 passed the gate; NMAD range 8.8 to 15.0 m; years 2016, 2017, 2019, 2020, 2021. Licence: **NOT READ** (ASTER terms of use).

### GLAMOS point mass balance (stakes), release 2025 — none
- No point file for Fee. No stake check possible.

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) — radar — role: bed check
- `B53-04_fee_GlaThiDa.txt` (16,561 lines), `B53-04_fee_vaw-archiv.txt` (2,432 lines) and `B53-04_fee_SCCER.txt` (117 lines). In the strip: 15,521 radar points (all from the 2013 survey). Checks: 401 cells, median -0.2 m (radar bed minus model bed), 92 % within 10 m; no spot with two survey dates; no point in ground that is ice free now (at least 30 m outside the SGI2023 outline and 30 m inside the SGI2016 outline). `B53-04/bed_check.json`.
- Licence: CC BY 4.0 per the landing page (not re-opened). Read: yes (files).

### swissBEDROCK (swisstopo) — model bed
- As `docs/sources/ch-swissbedrock.md`: under glaciers swissALTI3D minus the modelled GLAMOS 2020 thickness. Always the bed of the surfaces and the viewer (owner, 2026-11-02).

### SGI outlines (GLAMOS), 2016 and 2023 — context
- SGI2016 and the 2023 outline of the record; area in the glacier list as stated above. Read: yes.

## NOT READ / not searched (left for the owner)
- ASTER AST14DEM terms of use; the swisstopo pages for the editions; the GLAMOS landing pages of the licences quoted above.
- Not searched yet (`docs/DATA_SEARCH.md`): papers, airborne research DEMs, ice speed (ITS_LIVE annual maps are used by the page), other point data, national and cantonal sources.

## Findings that shaped the run (computed, 2026-11-02)
- No band balance of its own: the donor, among the candidates covering at least 98 % of the 2023 ice cells, is Corbassière (rmse 1.39 m; Findel 1.46 m covers 97 % and the borrowed line 2.32 m covers 84 %: not eligible; Aletsch 2.66 m; Rhone 3.37 m covers 91 %).
- Fit: rmse 1.39 m with no trend (bias about 0).

## Wider source search, round 1 (2026-11-02, `docs/DATA_SEARCH.md`)
Web searches in English and the local language(s), each followed by opening the main hits. **Read** = the page or abstract was opened and read in this session; **pointer** = a search result only (title, authors and DOI as the search stated them), **NOT READ**. Round 1 is not exhaustive: WGMS Fluctuations of Glaciers (metadata, investigators, WGMS_ID), ITS_LIVE and other velocity products, Hugonnet-type geodetic compilations, historical maps (Siegfried, Dufour) and the cantonal and municipal archives were **not** searched for this glacier yet.

- **Wikipedia, Fee Glacier** — pointer for a monitoring-network statement (strongly negative specific-mass trend since the late 1980s) and a 2024 sustainability study on summer glacier skiing at Saas-Fee: **NOT READ**; no peer-reviewed paper specific to the Feegletscher was found (ice thickness, mass balance or elevation change) in an English and a German search.
- **Showcaves.com, Eispavillon Mittelallalin** — read for the panel text only.
- GLAMOS observer for the length series: "DWL/VS; Urs Andenmatten" (rows 2015 to 2019) and "VAW/ETHZ; Andreas Bauder" (2020 to 2023): read in the length file.

**What round 1 did not find:** any Feegletscher-specific study, any stake or band balance, any research DEM; the Saas-Fee cable-car operator's and the canton of Valais' records were not searched.

## Wider source search, round 2 (2026-11-03): WGMS records, velocity products, historical maps
**WGMS Fluctuations of Glaciers database**, version 2026-02-10 (doi:10.5904/wgms-fog-2026-02-10; the zip of wgms.ch was downloaded and the CSV tables glacier, front_variation, mass_balance, mass_balance_band, mass_balance_point, state and change were read; counts below are from those files, values are quoted as the files state them, their units were not re-checked against the FoG readme): WGMS id 392 ("FEE NORTH", name Feegletscher; sub-units 4589 "FEE-S-II" = Feegletscher (southeast), 4590 "FEE-N-I (ALPHUBEL)", 4593 "FEE-N-II"). front_variation: 112 rows, 1884-07-01 to 2023-09-06 (GLAMOS 110); no mass balance or point records; state: 21 rows 1960 to 2002 (+1 row each for 4589 and 4593); change: none under 392, but 6 records each under 4589 and 4593: Fischer (Mauro) 1982-07-02 to 2009-07-02 and Hugonnet et al. 1999 to 2019 (e.g. 4589: -10.52 m for 1999 to 2019, as the file states it).

**Other velocity products (round 2):** Rabatel, Ducasse, Millan, Mouginot, "Annual glacier surface flow velocity product from Sentinel-2 data for the European Alps", V1, 2023, doi:10.57745/XHQ7TL: annual maps of the whole Alps 2015 to 2021 at 50 m from Sentinel-2, **read: the dataset page** (it states no dataset-specific licence: **NOT READ**, to be checked in the repository record before any use). Pointers, **NOT READ:** Dehecq et al. (2019) Alps Landsat 8 velocities 2013 to 2015; Millan et al. (2019, Remote Sensing) sensor comparison; a monthly Sentinel-2 record for 30 Mont Blanc glaciers 2016 to 2024 (The Cryosphere 2024; none of these six glaciers); Friedl et al. Sentinel-1 velocities for 12 regions.

**Ice speed already on the page:** ITS_LIVE (data/itslive/B53-04.json, rebuilt: identical): the page's card value (running median along the 90-point flowline) is 14 to 26 m/yr for 2015 to 2024; 2013 and 2014 (6 and 49 m/yr) are left out by the page's 90 % rule.

**Historical maps and outlines (round 2):** SGI1850, SGI1973 and SGI2023 areas are the ones of the panel (recomputed from the shapefiles in the panel audit); SGI1931 (Mannerfelt and Hodel, ETH Zürich 2022, CC BY 4.0 per its GLAMOS page, **read: the page and the shapefile**; based on terrestrial imagery and the first LK25 maps; each glacier carries its own date, see below) and SGI2010 are in the repository's GLAMOS inventory folder and were opened. Freudiger, Mennekes, Seibert, Weiler (2018), "Historical glacier outlines from digitized topographic maps of the Swiss Alps", Earth System Science Data 10, 805-814, doi:10.5194/essd-10-805-2018: outlines from 80 Siegfried sheets (maps published 1878 to 1918, and 1917 to 1944), data in FreiDok plus doi:10.6094/UNIFR/15008; **read: the article page** (the dataset licence is not on it: **NOT READ**), the outlines themselves were **not** opened. swisstopo's Dufour and Siegfried maps on map.geo.admin.ch: pointer, **NOT READ**.

**This glacier's outlines:** SGI1931: one polygon dated 1931-07-17, 18.29 km2 (computed); SGI2010 14.56 km2 (3 polygons); SGI2016 13.82 km2 (attribute, year_acq 2015).
